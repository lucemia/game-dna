/* GameDNA E-12 - Verlet rope & cloth - module v1.2 (plain script, no dependencies, one global)
 *
 *   const cloth = GameDNA_Cloth.create({ params: { wind: 0.5 }, scale: VIEW_H / 360, camera: () => ({ x: camX, y: camY }) });
 *   cloth.attach('hero-cape', { kind: 'cape', group: 'hero', anchor: () => ({ x: hero.x, y: hero.y - 20, facing: hero.facing }),
 *     length: 26, width: 14, color: '#b8323a' });
 *   // in the fixed step, AFTER the actors moved:
 *   cloth.update(STEP_MS);
 *   // in the draw pass: capes behind the body, scarves in front
 *   cloth.draw(ctx, 'back', 'hero'); drawHero(); cloth.draw(ctx, 'front', 'hero');
 *
 * A small position-based (Verlet) solver: points + distance constraints, chains (rope, chain, scarf, ribbon, hair) and
 * 2D grids (cape, banner), pinned to a moving anchor, with gravity, damping, wind gusts from game time, a ground line and
 * solid rects. It only READS anchors and only DRAWS: no game state, hit box, timer, RNG or input is touched. Everything
 * advances in update(dt) in fixed 1/120 s sub-steps, so ?t=&freeze=1 is deterministic. When an anchor jumps farther than
 * the teleport distance (respawn, room change, blink), the cloth is carried over with it instead of stretching.
 */
(function (root) {
  'use strict';
  var VERSION = '1.2.0', SUB = 1000 / 120, MAX_SUB = 12;
  var DEFAULTS = { wind: 0.5, gust: 0.5, stiffness: 0.8, damping: 0.03, gravity: 1, segments: 8, drape: 0.5, shade: 1, texture: 1,
    outline: 'auto', snap: 'auto', reduced: 'system', view: 'auto', teleport: 0, look: 'painted' };
  var KINDS = { rope: 'chain', chain: 'chain', scarf: 'chain', ribbon: 'chain', hair: 'chain', tail: 'chain', cape: 'grid', banner: 'grid', flag: 'grid' };
  var KIND_ALIAS = { cloak: 'cape', mantle: 'cape', pennant: 'banner', streamer: 'ribbon', tassel: 'ribbon', vine: 'rope', cord: 'rope', string: 'rope', ponytail: 'hair', tuft: 'hair' };
  // per kind: air drag (wind coupling), drape (pushed toward the back), bend stiffness, flutter, taper (end width / start width)
  var KDEF = {
    rope:   { drag: 0.15, drape: 0,   bend: 0.15, flutter: 0,    taper: 1,    width: 2,  len: 40, layer: 'back' },
    chain:  { drag: 0.12, drape: 0,   bend: 0,    flutter: 0,    taper: 1,    width: 4,  len: 40, layer: 'back' },
    scarf:  { trail: 0.7, lift: 0.8, drag: 1,    drape: 1,   bend: 0.6,  flutter: 0.6,  taper: 0.8,  width: 5,  len: 22, layer: 'front' },
    ribbon: { trail: 0.5, lift: 0.4, drag: 1.1,  drape: 0.6, bend: 0.25, flutter: 0.8,  taper: 0.9,  width: 4,  len: 24, layer: 'back' },
    hair:   { trail: 0.5, lift: 0.3, drag: 0.7,  drape: 1.2, bend: 0.55, flutter: 0.25, taper: 0.15, width: 6,  len: 14, layer: 'back' },
    tail:   { trail: 0.4, lift: 0.25, drag: 0.5,  drape: 1,   bend: 0.6,  flutter: 0.2,  taper: 0.3,  width: 6,  len: 18, layer: 'back' },
    cape:   { trail: 0.85, lift: 0.3, drag: 1,    drape: 1,   bend: 0.3,  flutter: 0.5,  taper: 1.25, width: 16, len: 26, layer: 'back' },
    banner: { drag: 1.2,  drape: 0,   bend: 0.2,  flutter: 1,    taper: 1,    width: 16, len: 26, layer: 'back' }
  };
  var LIGHT = { x: -0.45, y: -0.89 };

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function fin(v) { return typeof v === 'number' && isFinite(v); }
  function parseHex(c) {
    if (typeof c !== 'string') return null;
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
    if (!m) { m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(c.trim()); return m ? [+m[1], +m[2], +m[3]] : null; }
    var h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16); return [n >> 16, (n >> 8) & 255, n & 255];
  }
  function mixRgb(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function css(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }
  // tone 0..1 (0.5 = base colour): darker toward a deep, cool shadow, lighter toward a warm highlight
  function toneRgb(base, t) {
    if (t < 0.5) return mixRgb(base, [base[0] * 0.28 + 10, base[1] * 0.26 + 8, base[2] * 0.34 + 22], (0.5 - t) * 2 * 0.85);
    return mixRgb(base, [255, 246, 228], (t - 0.5) * 2 * 0.42);
  }

  function create(options) {
    var o = options || {};
    var SK = null;
    try { SK = (o.skin == null || o.skin === false || !root.GameDNA_Skin) ? null : root.GameDNA_Skin.resolve(o.skin); } catch (e) { SK = null; }
    var P = {};
    for (var k in DEFAULTS) P[k] = DEFAULTS[k];
    setParams(o.params || {});
    var sysReduced = false;
    try { sysReduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { }
    var skinInk = null, skinOutline = null, skinPixel = false, skinColor = null;
    if (SK) {
      try {
        var pal = SK.palette || {};
        skinInk = (SK.outline && SK.outline.sprite && SK.outline.sprite.color) || pal.ink || null;
        if (typeof skinInk === 'string' && SK.lookup) { try { var lk = SK.lookup(skinInk); if (typeof lk === 'string') skinInk = lk; } catch (e) { } }
        skinOutline = SK.outline && SK.outline.sprite ? num(SK.outline.sprite.width, null) : null;
        skinPixel = !!(SK.pixel || (SK.motion && SK.motion.snap));
        skinColor = pal.team && typeof pal.team.a === 'string' ? pal.team.a : null;
      } catch (e) { }
    }

    var items = {}, order = [];
    var curN = 1, clock = 0, acc = 0, extraGust = 0, extraGustT = 0, extraGustDir = 1;
    var drawsNoUpdate = 0, drawFrame = -1;
    var S = { attached: 0, points: 0, constraints: 0, updates: 0, substeps: 0, draws: 0, drawn: 0, snaps: 0, resets: 0, hidden: 0,
      anchorErrors: 0, badInput: 0, maxStretch: 1, maxReach: 0, selfAdvanced: 0, impulses: 0, clamped: 0, collisions: 0, drawErrors: 0 };
    var lastDrawnRects = {};
    var solidsCache = null, solidsAt = -1;
    var scratch = null, scratchCtx = null, palCollect = null;
    // painted (HD) drawing: light direction (toward the light, screen coords), tone levels, scratch buffers (grown on demand, reused)
    var NL = 24, Lx = LIGHT.x, Ly = LIGHT.y, F0 = new Float32Array(0);
    var MX = F0, MY = F0, MT = F0, AX = F0, AY = F0, AT = F0, AC = F0, CL = F0, CQ = F0, QN = new Int32Array(0), QH = new Int32Array(NL * 3), BX = [], BY = [];
    if (o.light != null && typeof o.light !== 'function') setLight(o.light);

    function setParams(p) {
      p = p || {};
      for (var key in p) {
        if (!(key in DEFAULTS) || p[key] == null) continue;
        if (typeof DEFAULTS[key] === 'number') P[key] = num(p[key], P[key]); else P[key] = String(p[key]);
      }
      P.wind = clamp(P.wind, -3, 3); P.gust = clamp(P.gust, 0, 1); P.stiffness = clamp(P.stiffness, 0, 1);
      P.damping = clamp(P.damping, 0, 0.3); P.gravity = clamp(P.gravity, 0, 3); P.segments = Math.round(clamp(P.segments, 2, 24));
      P.drape = clamp(P.drape, 0, 2); P.shade = clamp(P.shade, 0, 1); P.texture = clamp(P.texture, 0, 1); P.teleport = clamp(P.teleport, 0, 100000);
      if (['auto', 'on', 'off'].indexOf(P.outline) < 0) P.outline = 'auto';
      if (['auto', 'pixel', 'smooth'].indexOf(P.snap) < 0) P.snap = 'auto';
      if (['system', 'on', 'off'].indexOf(P.reduced) < 0) P.reduced = 'system';
      if (['auto', 'side', 'top'].indexOf(P.view) < 0) P.view = 'auto';
      if (['painted', 'flat'].indexOf(P.look) < 0) P.look = 'painted';
      // segments changed: rebuild items that follow the global count
      for (var i = 0; i < (order ? order.length : 0); i++) { var it = items[order[i]]; if (it && !it.ownSegs && it.segs !== P.segments) build(it, true); }
    }
    function reduced() { return P.reduced === 'on' || (P.reduced === 'system' && sysReduced); }
    function unit() {
      var s = num(typeof o.scale === 'function' ? safe(o.scale) : o.scale, 0);
      if (s > 0) return s;
      var v = typeof o.view === 'function' ? safe(o.view) : o.view;
      if (v && fin(+v.h) && v.h > 0) return v.h / 360;
      return 1;
    }
    function safe(fn, a, b) { try { return fn(a, b); } catch (e) { S.anchorErrors++; return null; } }
    function camera() {
      var c = typeof o.camera === 'function' ? safe(o.camera) : o.camera;
      return c && fin(+c.x) && fin(+c.y) ? { x: +c.x, y: +c.y } : { x: 0, y: 0 };
    }

    // ------------------------------------------------------------------ attachments
    function attach(id, opt) {
      if (id == null) { S.badInput++; return null; }
      opt = opt || {};
      var key = String(id), it = items[key], fresh = !it;
      var kind = String(opt.kind || (it ? it.kind : 'scarf')).toLowerCase();
      kind = KIND_ALIAS[kind] || kind; if (kind === 'flag') kind = 'banner';
      if (!KINDS[kind]) { S.badInput++; kind = 'scarf'; }
      var D = KDEF[kind];
      if (fresh) { it = items[key] = { id: key, valid: false, visible: false, anchor: null, prevAnchor: null, built: false, layer: null }; order.push(key); S.attached++; }
      var rebuild = fresh || it.kind !== kind;
      it.kind = kind; it.D = D; it.grid = KINDS[kind] === 'grid';
      if ('anchor' in opt) it.anchorFn = opt.anchor;
      it.group = opt.group != null ? String(opt.group) : (it.group != null ? it.group : key);
      var nl = opt.length != null ? Math.max(1, num(opt.length, D.len)) : (it.len || D.len);
      var nw = opt.width != null ? Math.max(0.5, num(opt.width, D.width)) : (it.width || D.width);
      if (nl !== it.len || nw !== it.width) rebuild = true;
      it.len = nl; it.width = nw;
      if (opt.segments != null) { var ns = Math.round(clamp(num(opt.segments, P.segments), 2, 24)); if (ns !== it.segs) rebuild = true; it.segs = ns; it.ownSegs = true; }
      else if (fresh) { it.segs = P.segments; it.ownSegs = false; }
      if (opt.cols != null) { var nc = Math.round(clamp(num(opt.cols, 4), 2, 8)); if (nc !== it.cols) rebuild = true; it.cols = nc; }
      else if (fresh) it.cols = 0;
      it.color = opt.color || it.color || skinColor || (kind === 'rope' ? '#8a6a44' : kind === 'chain' ? '#9aa3b2' : '#b8323a');
      if ('color2' in opt) it.color2 = opt.color2; if ('trim' in opt) it.trim = opt.trim;
      if ('outline' in opt) it.outlineOpt = opt.outline;
      if ('ink' in opt) it.ink = opt.ink;
      if (opt.layer != null) it.layerDef = String(opt.layer); else if (fresh) it.layerDef = D.layer;
      if (opt.taper != null) it.taper = clamp(num(opt.taper, D.taper), 0, 2); else if (fresh) it.taper = D.taper;
      if (opt.stiffness != null) it.stiff = clamp(num(opt.stiffness, P.stiffness), 0, 1);
      if (opt.drag != null) it.drag = clamp(num(opt.drag, D.drag), 0, 4);
      if (opt.drape != null) it.drapeK = clamp(num(opt.drape, D.drape), 0, 3);
      if (opt.mass != null) it.mass = clamp(num(opt.mass, 1), 0.1, 10);
      if (opt.lift != null) it.lift = clamp(num(opt.lift, 0), 0, 2);
      if (opt.flutter != null) it.flutter = clamp(num(opt.flutter, 1), 0, 3);   // travelling ripple strength (kind default: banner 1, cape 0.5, ...)
      if (opt.rigid != null) { it.rigid = !!opt.rigid; it.shape = null; }   // rigid: a settled still-air shape carried by the anchor (baked art, far-away actors)
      if (opt.collide != null) it.collide = !!opt.collide; else if (fresh) it.collide = true;
      if (opt.teleport != null) it.teleport = Math.max(0, num(opt.teleport, 0));
      if (opt.alpha != null) it.alpha = clamp(num(opt.alpha, 1), 0, 1);
      if ('body' in opt) {   // [dx, dy, r]: a circle the cloth drapes over, relative to the anchor (dx toward the facing side)
        var bd = opt.body; it.body = Array.isArray(bd) && fin(+bd[0]) && fin(+bd[1]) && +bd[2] > 0 ? [+bd[0], +bd[1], +bd[2]] : (bd && fin(+bd.dx) && fin(+bd.dy) && +bd.r > 0 ? [+bd.dx, +bd.dy, +bd.r] : null);
      }
      if (rebuild) build(it, !fresh);
      return key;
    }
    function detach(id) {
      var key = String(id); if (!items[key]) return false;
      delete items[key]; order.splice(order.indexOf(key), 1); return true;
    }
    function detachGroup(g) { g = String(g); var n = 0; for (var i = order.length - 1; i >= 0; i--) if (items[order[i]].group === g) { detach(order[i]); n++; } return n; }

    // build points and constraints; keepPose: re-pose at the current anchor
    function build(it, keepPose) {
      var segs = it.segs || P.segments, n, cols = 1, rows;
      if (it.grid) {
        cols = it.cols || clamp(Math.round(it.width / Math.max(2, it.len / segs)) + 1, 3, 6);
        rows = segs + 1; n = cols * rows;
      } else { rows = segs + 1; n = rows; }
      it.rows = rows; it.colsN = cols; it.n = n;
      it.px = new Float64Array(n); it.py = new Float64Array(n); it.ox = new Float64Array(n); it.oy = new Float64Array(n);
      it.pin = new Uint8Array(n); it.pinDx = new Float64Array(n); it.pinDy = new Float64Array(n);
      var restAlong = it.len / segs, restAcross = cols > 1 ? it.width / (cols - 1) : 0;
      it.restAlong = restAlong; it.restAcross = restAcross;
      var ca = [], cb = [], cr = [], ck = [];   // ck: 0 structural along, 1 across, 2 shear, 3 bend
      function idx(r, c) { return r * cols + c; }
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var i = idx(r, c);
        if (r === 0) {
          it.pin[i] = 1;
          if (it.kind === 'banner') { it.pinDx[i] = 0; it.pinDy[i] = c * restAcross; }
          else { it.pinDx[i] = cols > 1 ? (c / (cols - 1) - 0.5) * it.width : 0; it.pinDy[i] = 0; }
        }
        if (r + 1 < rows) { ca.push(i); cb.push(idx(r + 1, c)); cr.push(restAlong); ck.push(0); }
        if (c + 1 < cols && r > 0) { ca.push(i); cb.push(idx(r, c + 1)); cr.push(restAcross * (it.kind === 'cape' ? 1 + (it.taper - 1) * r / (rows - 1) : 1)); ck.push(1); }
        if (c + 1 < cols && r + 1 < rows) {
          var acr = restAcross * (it.kind === 'cape' ? 1 + (it.taper - 1) * (r + 0.5) / (rows - 1) : 1), dg = Math.sqrt(restAlong * restAlong + acr * acr);
          ca.push(i); cb.push(idx(r + 1, c + 1)); cr.push(dg); ck.push(2);
          ca.push(idx(r, c + 1)); cb.push(idx(r + 1, c)); cr.push(dg); ck.push(2);
        }
        if (r + 2 < rows) { ca.push(i); cb.push(idx(r + 2, c)); cr.push(restAlong * 2); ck.push(3); }
      }
      it.ca = new Int32Array(ca); it.cb = new Int32Array(cb); it.cr = new Float64Array(cr); it.ck = new Uint8Array(ck);
      it.maxStretch = 1; it.built = true;
      S.points = 0; S.constraints = 0;
      for (var q = 0; q < order.length; q++) { var t = items[order[q]]; if (t && t.built) { S.points += t.n; S.constraints += t.ca.length; } }
      it.valid = false;
      if (keepPose && it.anchor) pose(it, it.anchor);
    }

    function readAnchor(it) {
      if (typeof it.anchorFn !== 'function') { if (it.anchorFn && fin(+it.anchorFn.x) && fin(+it.anchorFn.y)) return norm(it.anchorFn); return null; }
      var a = safe(it.anchorFn, it.id);
      if (a == null || a === false) return null;
      if (!fin(+a.x) || !fin(+a.y)) { S.badInput++; return undefined; }   // undefined = keep the last good anchor
      if (a.visible === false) return null;
      return norm(a);
    }
    function norm(a) {
      var f = +a.facing; f = fin(f) && f < 0 ? -1 : 1;
      var hasF = fin(+a.fx) && fin(+a.fy), fx = fin(+a.fx) ? +a.fx : f, fy = fin(+a.fy) ? +a.fy : 0;
      return { x: +a.x, y: +a.y, facing: f, fx: fx, fy: fy, hasF: hasF, ground: fin(+a.ground) ? +a.ground : null, layer: a.layer === 'front' || a.layer === 'back' ? a.layer : null, alpha: fin(+a.alpha) ? clamp(+a.alpha, 0, 1) : null };
    }
    // auto: a piece whose anchor returns a facing vector (fx, fy) belongs to a top-down game; plain facing 1 | -1 = side view
    function viewTop(it) { return P.view === 'top' || (P.view === 'auto' && !!(it && it.anchor && it.anchor.hasF)); }
    function restDir(it, A) {
      if (it.kind === 'banner') return { x: A.facing, y: 0 };
      var dr = (it.drapeK != null ? it.drapeK : it.D.drape) * P.drape;
      if (viewTop(it) && Math.abs(A.fy) > 0.5) dr *= 0.3;
      var ang = Math.atan2(1, -A.fx * clamp(dr, 0, 1.5) * 0.45);
      return { x: Math.cos(ang), y: Math.sin(ang) };
    }
    // place every point in the rest pose at anchor A, at rest (prev = current)
    function pose(it, A) {
      var d = restDir(it, A), cols = it.colsN;
      for (var r = 0; r < it.rows; r++) for (var c = 0; c < cols; c++) {
        var i = r * cols + c, x, y;
        if (it.kind === 'banner') { x = A.x + d.x * it.restAlong * r; y = A.y + it.pinDy[c] + r * it.restAlong * 0.06; }
        else { x = A.x + it.pinDx[c] * (1 + (it.taper - 1) * r / Math.max(1, it.rows - 1)) + d.x * it.restAlong * r; y = A.y + d.y * it.restAlong * r; }
        it.px[i] = it.ox[i] = x; it.py[i] = it.oy[i] = y;
      }
      it.valid = true; it.maxStretch = 1; it.bf = A.facing; it.avs = 0; it.pinRot = 0;
    }
    function translate(it, dx, dy) {
      for (var i = 0; i < it.n; i++) { it.px[i] += dx; it.py[i] += dy; it.ox[i] = it.px[i]; it.oy[i] = it.py[i]; }
    }
    function teleportDist(it) {
      if (it.teleport) return it.teleport;
      if (P.teleport) return P.teleport;
      return Math.max(it.len * 1.25, 36 * unit());
    }

    // ------------------------------------------------------------------ wind (pure function of game time and x)
    function windAt(t, x, y) {
      var u = unit(), red = reduced();
      var base = P.wind * 220 * u * (red ? 0.4 : 1), g = red ? 0 : P.gust;
      var ph = x * 0.011 / u + y * 0.004 / u;
      var gust = 0.55 * Math.sin(t * 1.31 - ph) + 0.3 * Math.sin(t * 2.87 + 1.7 - ph * 1.6) + 0.22 * Math.sin(t * 0.47 + 0.4);
      var wx = base * (1 + g * gust) + (extraGustT > 0 ? extraGust * extraGustDir * 260 * u * Math.min(1, extraGustT / 250) : 0);
      var wy = Math.abs(base) * g * 0.18 * Math.sin(t * 4.3 + ph * 2.1);
      return { x: wx, y: wy };
    }

    // ------------------------------------------------------------------ simulation
    function solids() {
      if (!o.solids) return null;
      if (solidsAt === S.updates && solidsCache) return solidsCache;
      var L = typeof o.solids === 'function' ? safe(o.solids) : o.solids;
      solidsCache = Array.isArray(L) ? L : null; solidsAt = S.updates; return solidsCache;
    }
    function groundAt(x, it, A) {
      var g = null;
      if (A && A.ground != null) g = A.ground;
      if (o.ground != null) {
        var v = typeof o.ground === 'function' ? safe(o.ground, x, it.id) : o.ground;
        if (fin(+v) && v !== null) g = g == null ? +v : Math.min(g, +v);
      }
      return g;
    }

    function update(dtMs) {
      var dt = num(dtMs, 1000 / 60); if (dt <= 0) return;
      dt = Math.min(dt, 250);
      S.updates++; drawsNoUpdate = 0;
      advance(dt);
    }
    function advance(dt) {
      acc += dt;
      var n = Math.floor((acc + 1e-6) / SUB);
      if (n <= 0) { readAll(0); return; }
      acc -= n * SUB; if (acc < 0) acc = 0;
      if (n > MAX_SUB) n = MAX_SUB;
      readAll(n);
      curN = n;
      for (var s = 1; s <= n; s++) {
        clock += SUB;
        if (extraGustT > 0) extraGustT = Math.max(0, extraGustT - SUB);
        for (var i = 0; i < order.length; i++) { var it = items[order[i]]; if (it && it.visible && it.valid && !it.rigid) substep(it, s / n); }
        S.substeps++;
      }
      for (var j = 0; j < order.length; j++) { var t2 = items[order[j]]; if (t2 && t2.visible && t2.valid && !t2.rigid) guard(t2); }
    }
    // read every anchor once per update; detect hide / show and teleports
    function readAll(n) {
      for (var i = 0; i < order.length; i++) {
        var it = items[order[i]]; if (!it) continue;
        var A = readAnchor(it);
        if (A === undefined) A = it.anchor;   // bad numbers: keep the last good anchor
        if (!A) { if (it.visible) S.hidden++; it.visible = false; continue; }
        it.prevAnchor = it.anchor && it.valid && it.visible ? it.anchor : A;
        if (it.layerDef === 'auto' || A.layer) it.layer = A.layer || (A.fy < -0.3 ? 'front' : 'back'); else it.layer = it.layerDef;
        if (!it.valid || !it.visible) {
          // first sight, or shown again: start in the rest pose (or carry the old shape over if it is near)
          if (!it.valid || !it.anchor || Math.hypot(A.x - it.anchor.x, A.y - it.anchor.y) > teleportDist(it)) { if (it.valid) S.snaps++; pose(it, A); }
          else translate(it, A.x - it.anchor.x, A.y - it.anchor.y);
          it.prevAnchor = A;
        } else if (Math.hypot(A.x - it.prevAnchor.x, A.y - it.prevAnchor.y) > teleportDist(it)) {
          pose(it, A);   // a teleport (respawn, restart, blink): hang from the new anchor at rest; no rubber band, no carried-over fall
          it.prevAnchor = A; S.snaps++; it.snapped = (it.snapped || 0) + 1;
        } else if (it.kind === 'cape' && A.facing !== it.prevAnchor.facing && !viewTop(it) && !A.hasF) {
          // side view turn-around: the cape moves to the new back with the sprite (mirrored, half its speed kept) instead of
          // whipping over the helmet from the old back
          // columns swap too, so every column stays on its own pin (no twist)
          var P0 = it.prevAnchor, cn = it.colsN, qx = it.px.slice(), qy = it.py.slice(), rx = it.ox.slice(), ry = it.oy.slice();
          for (var m = 0; m < it.n; m++) {
            var src = m - (m % cn) + (cn - 1 - (m % cn));
            var nx = A.x - (qx[src] - P0.x), ny = A.y + (qy[src] - P0.y), vx0 = -(qx[src] - rx[src]) * 0.5, vy0 = (qy[src] - ry[src]) * 0.5;
            it.px[m] = nx; it.py[m] = ny; it.ox[m] = nx - vx0; it.oy[m] = ny - vy0;
          }
          it.prevAnchor = A; it.pinRot = -(it.pinRot || 0);
        }
        it.anchor = A; it.visible = true;
        if (it.rigid) placeRigid(it, A);
      }
    }
    // rigid pieces: settle once in still air (2 s), keep the offsets from the anchor, mirror them when the facing flips
    function placeRigid(it, A) {
      if (!it.shape) {
        pose(it, A); it.prevAnchor = A; var keep = curN; curN = 1;
        for (var k = 0; k < 240; k++) substep(it, 1, true);
        curN = keep;
        it.shape = { f: A.facing, dx: new Float64Array(it.n), dy: new Float64Array(it.n) };
        for (var i = 0; i < it.n; i++) { it.shape.dx[i] = it.px[i] - A.x; it.shape.dy[i] = it.py[i] - A.y; }
      }
      var m = it.kind === 'banner' || A.facing === it.shape.f ? 1 : -1;
      for (var j = 0; j < it.n; j++) { it.px[j] = it.ox[j] = A.x + it.shape.dx[j] * m; it.py[j] = it.oy[j] = A.y + it.shape.dy[j]; }
      it.valid = true; it.maxStretch = 1;
    }
    function substep(it, f, still) {
      var u = unit(), h = SUB / 1000, h2 = h * h, A = it.anchor, A0 = it.prevAnchor || A;
      var ax0 = A0.x + (A.x - A0.x) * f, ay0 = A0.y + (A.y - A0.y) * f;
      var red = reduced(), top = viewTop(it);
      // top-down: a cape hangs from the shoulders down the screen and only stirs; other pieces get a lighter "down"
      var g = 980 * u * P.gravity * (top ? (it.kind === 'cape' ? 0.95 : 0.55) : 1) * (it.kind === 'chain' ? 1.15 : 1);
      var damp = Math.pow(1 - clamp(P.damping + (red ? 0.06 : 0) + (it.kind === 'banner' ? 0.025 : 0), 0, 0.35), 0.5);   // flags settle after a gust
      var drag = (it.drag != null ? it.drag : it.D.drag) * 6 / (it.mass || 1) * (top && it.kind === 'cape' ? 0.3 : 1);   // top-down capes hang, they do not fly out like wings
      var lift = top ? 0 : (it.lift != null ? it.lift : (it.D.lift || 0));
      var dr = (it.drapeK != null ? it.drapeK : it.D.drape) * P.drape * 320 * u * (top && it.kind === 'cape' ? 0.4 : 1);
      var dfx = -A.fx, dfy = top ? -A.fy : 0;
      var t = clock / 1000, cols = it.colsN, flut = (it.flutter != null ? it.flutter : it.D.flutter) * (red ? 0.3 : 1);
      var W = still ? { x: 0, y: 0 } : windAt(t, ax0, ay0);
      if (still) flut = 0;
      // stylised "motion air": part of the anchor's own speed counts as extra head wind, so a running cape trails whatever the wind
      var avx = (A.x - A0.x) / (curN * h);
      it.avs = (it.avs || 0) * 0.85 + avx * 0.15;
      var trail = top ? 0 : (it.D.trail || 0), Wx = W.x - trail * it.avs;
      it.windNow = (it.windNow || 0) * 0.97 + Math.abs(W.x - it.avs) * 0.03;   // smoothed air speed across the piece
      // side-view cape thrown out sideways (gust, turn, run): turn the pinned edge across the flow, so the cape shows as a
      // flag with its width instead of an edge-on crumple; hanging within ~50 deg of straight down it stays as it was
      var pr = 0;
      if (it.kind === 'cape' && !top && cols > 1 && !still) {
        var mr = Math.min(it.rows - 1, Math.max(1, Math.round((it.rows - 1) * 0.6))), mx = 0, my = 0;
        for (var cc = 0; cc < cols; cc++) { mx += it.px[mr * cols + cc]; my += it.py[mr * cols + cc]; }
        var dev = Math.atan2(-(mx / cols - ax0), my / cols - ay0);   // 0 = straight down, + = toward -x
        var ad = Math.abs(dev), wgt = clamp((ad - 0.85) / 0.55, 0, 1);
        var tgt = clamp(dev * wgt * wgt * (3 - 2 * wgt), -1.75, 1.75) * 0.85;
        it.pinRot = (it.pinRot || 0) + (tgt - (it.pinRot || 0)) * 0.12;
        pr = it.pinRot;
      } else it.pinRot = 0;
      var prc = Math.cos(pr), prs = Math.sin(pr);
      for (var i = 0; i < it.n; i++) {
        if (it.pin[i]) {
          var c = i % cols, tx, ty;
          tx = ax0 + it.pinDx[c] * prc - it.pinDy[c] * prs; ty = ay0 + it.pinDx[c] * prs + it.pinDy[c] * prc;
          it.ox[i] = it.px[i]; it.oy[i] = it.py[i]; it.px[i] = tx; it.py[i] = ty; continue;
        }
        var vx = (it.px[i] - it.ox[i]) * damp, vy = (it.py[i] - it.oy[i]) * damp;
        var r = (i / cols) | 0, depth = r / Math.max(1, it.rows - 1);
        var wave = flut ? Math.sin(t * (it.grid ? 8.2 : 6.4) - r * (it.grid ? 1.1 : 0.8) + (i % cols) * 0.5) * flut * (Math.abs(W.x) + 30 * u) * depth : 0;
        var flx = it.grid ? wave * 1.6 * (W.x < 0 ? -1 : 1) : 0, fly = it.grid ? wave * 1.1 : wave * 1.3;
        var axl = drag * (Wx + flx - vx / h) + dr * dfx * depth;
        // lift: cloth moving through the air sails up a little, in proportion to the horizontal relative air speed
        var ayl = g + drag * (W.y + fly - vy / h) + dr * dfy * depth - (lift && it.py[i] > ay0 ? lift * drag * Math.abs(W.x - it.avs) * depth : 0);   // from the actor's own run through the air, below the pin only (no feedback that props up a falling cape)
        // cloth above its pin slides off the shoulders whatever the gravity setting (no balanced, standing folds)
        if (it.py[i] < ay0 && it.kind !== 'banner' && it.kind !== 'rope' && it.kind !== 'chain') { ayl += 700 * u; axl += 250 * u * (dfx || -1); }
        it.ox[i] = it.px[i]; it.oy[i] = it.py[i];
        it.px[i] += vx + axl * h2; it.py[i] += vy + ayl * h2;
      }
      if (it.body) bodyPush(it, ax0, ay0);   // before the solver, so the constraints settle the pushed points
      solve(it);
      if (it.collide) collide(it);
    }
    function bodyPush(it, ax, ay) {
      var top = viewTop(it), A = it.anchor, cx = ax + it.body[0] * (top ? A.fx : (A.facing || 1)), cy = ay + it.body[1] + (top ? it.body[0] * A.fy : 0), r = it.body[2], r2 = r * r;
      for (var i = 0; i < it.n; i++) {
        if (it.pin[i]) continue;
        var dx = it.px[i] - cx, dy = it.py[i] - cy, d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        if (!top) {
          // side view: a half-disc on the actor's back. Never hold cloth above the centre (it would rest on top of the
          // shoulders after a jump); below it, push straight to the back edge so the cape falls down the back
          if (dy < 0) continue;
          var bx = cx - (A.facing || 1) * Math.sqrt(r2 - dy * dy);
          if ((A.facing || 1) > 0 ? it.px[i] > bx : it.px[i] < bx) it.px[i] = bx;
          continue;
        }
        var d = Math.sqrt(d2);
        if (d < 1e-6) { dx = -A.fx; dy = 0; d = 1; }
        it.px[i] = cx + dx / d * r; it.py[i] = cy + dy / d * r;
      }
    }
    function solve(it) {
      var st = it.stiff != null ? it.stiff : P.stiffness;
      var iters = 2 + Math.round(st * 8), relax = 0.55 + 0.45 * st;
      // a cape keeps its spread over the shoulders; a flag held open by the wind keeps most of its height, in still air it may hang limp
      var minAcross = it.kind === 'cape' ? 0.55 + 0.25 * st : 0.15 + (0.35 + 0.2 * st) * clamp((it.windNow || 0) / (120 * unit()), 0, 1);
      var bend = it.D.bend * (0.4 + 0.9 * st), shear = !it.grid ? 0 : it.kind === 'cape' ? 0.02 + 0.06 * st : 0.3 + 0.5 * st;   // a cape swings by shearing; a flag keeps its shape   // weak shear: a pinned grid with stiff diagonals is a rigid plate
      var ca = it.ca, cb = it.cb, cr = it.cr, ck = it.ck, px = it.px, py = it.py, pin = it.pin, m = ca.length;
      var noArch = it.kind !== 'banner', cols0 = it.colsN, archY = it.anchor ? it.anchor.y : -Infinity;
      for (var k = 0; k < iters; k++) {
        for (var j = 0; j < m; j++) {
          var kind = ck[j], w = kind === 3 ? bend : kind === 2 ? shear : relax;
          if (w <= 0) continue;
          var a = ca[j], b = cb[j];
          var dx = px[b] - px[a], dy = py[b] - py[a], d = Math.sqrt(dx * dx + dy * dy);
          if (d < 1e-9) continue;
          if (kind === 3 && d > cr[j]) continue;        // bending only resists folding, never pulls
          // cloth above its pin cannot hold itself up: no bending there, or a curled cape stands like an arch
          if (kind === 3 && noArch && py[a + cols0] < archY) continue;
          // across and shear links are seen in projection: cloth turning away from the camera gets narrower (a fold),
          // so they only resist stretching (and total collapse below a quarter of the rest length)
          var target = cr[j];
          if ((kind === 1 || kind === 2) && d < cr[j]) { if (d > cr[j] * minAcross) continue; target = cr[j] * minAcross; }   // push back to the floor only
          var diff = (d - target) / d * w;
          var pa = pin[a], pb = pin[b];
          if (pa && pb) continue;
          if (pa) { px[b] -= dx * diff; py[b] -= dy * diff; }
          else if (pb) { px[a] += dx * diff; py[a] += dy * diff; }
          else { var hx = dx * diff * 0.5, hy = dy * diff * 0.5; px[a] += hx; py[a] += hy; px[b] -= hx; py[b] -= hy; }
        }
      }
      // adaptive: while a strand is still over 4 % long (an anchor that jumped on a turn, a big impulse, a strong gust), run up to 24 more
      // passes over the strands only, from the pinned edge outward; the 1.3x clamp below is then a rare safety net
      for (var x = 0; x < 24; x++) {
        var worst = 0;
        for (var j2 = 0; j2 < m; j2++) {
          if (ck[j2] !== 0) continue;
          var a2 = ca[j2], b2 = cb[j2], ex2 = px[b2] - px[a2], ey2 = py[b2] - py[a2], d2 = Math.sqrt(ex2 * ex2 + ey2 * ey2);
          if (d2 < 1e-9) continue;
          var r2 = d2 / cr[j2]; if (r2 > worst) worst = r2;
          if (r2 <= 1.01) continue;
          var df = (d2 - cr[j2]) / d2;
          if (pin[a2]) { px[b2] -= ex2 * df; py[b2] -= ey2 * df; }
          else if (pin[b2]) { px[a2] += ex2 * df; py[a2] += ey2 * df; }
          else { px[a2] += ex2 * df * 0.3; py[a2] += ey2 * df * 0.3; px[b2] -= ex2 * df * 0.7; py[b2] -= ey2 * df * 0.7; }
        }
        if (worst < 1.04) break;
      }
      // never longer than 1.3x along each strand (follow the pinned edge outward): no rubber band, ever
      var cols = it.colsN, lim = it.restAlong * 1.3;
      for (var r = 1; r < it.rows; r++) for (var c = 0; c < cols; c++) {
        var i = r * cols + c, pi = i - cols;
        var ex = px[i] - px[pi], ey = py[i] - py[pi], e = Math.sqrt(ex * ex + ey * ey);
        if (e > lim) { var s = lim / e; px[i] = px[pi] + ex * s; py[i] = py[pi] + ey * s; S.clamped++; }
      }
    }
    function collide(it) {
      var A = it.anchor, px = it.px, py = it.py, ox = it.ox, n = it.n;
      var g0 = groundAt(A.x, it, A), varies = o.ground != null && typeof o.ground === 'function';
      if (g0 != null || varies) {
        for (var i = 0; i < n; i++) {
          if (it.pin[i]) continue;
          var gy = varies ? groundAt(px[i], it, A) : g0;
          // a floor above the anchor (the actor fell below it) or out of the piece's reach (a screen-bottom line) is ignored
          if (gy != null && (gy < A.y || gy > A.y + it.len * 1.3 + it.width * 1.2 + 2)) continue;
          if (gy != null && py[i] > gy) { py[i] = gy; ox[i] = px[i] - (px[i] - ox[i]) * 0.55; S.collisions++; }
        }
      }
      var L = solids();
      if (L && L.length) {
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (var q = 0; q < n; q++) { if (px[q] < x0) x0 = px[q]; if (px[q] > x1) x1 = px[q]; if (py[q] < y0) y0 = py[q]; if (py[q] > y1) y1 = py[q]; }
        for (var k = 0; k < L.length && k < 400; k++) {
          var R = L[k]; if (!R) continue;
          var rx = +R.x, ry = +R.y, rw = +R.w, rh = +R.h;
          if (!(rw > 0 && rh > 0) || rx > x1 || ry > y1 || rx + rw < x0 || ry + rh < y0) continue;
          for (var p = 0; p < n; p++) {
            if (it.pin[p]) continue;
            var X = px[p], Y = py[p];
            if (X <= rx || X >= rx + rw || Y <= ry || Y >= ry + rh) continue;
            var dl = X - rx, drr = rx + rw - X, dt = Y - ry, db = ry + rh - Y, mn = Math.min(dl, drr, dt, db);
            if (mn === dt) py[p] = ry; else if (mn === db) py[p] = ry + rh; else if (mn === dl) px[p] = rx; else px[p] = rx + rw;
            ox[p] = px[p] - (px[p] - ox[p]) * 0.5; S.collisions++;
          }
        }
      }
    }
    // after each update: finite, not exploded; measure stretch and reach for tests
    function guard(it) {
      var px = it.px, py = it.py, A = it.anchor, bad = false, ms = 1, reach = 0;
      for (var i = 0; i < it.n; i++) {
        if (!fin(px[i]) || !fin(py[i])) { bad = true; break; }
        var d = Math.hypot(px[i] - A.x, py[i] - A.y); if (d > reach) reach = d;
      }
      if (!bad) for (var j = 0; j < it.ca.length; j++) {
        if (it.ck[j] !== 0) continue;
        var a = it.ca[j], b = it.cb[j], L = Math.hypot(px[b] - px[a], py[b] - py[a]) / it.cr[j];
        if (L > ms) ms = L;
      }
      var maxReach = it.len * 1.3 + it.width * 1.2 + 2;
      if (bad || ms > 3 || reach > maxReach * 1.5) { pose(it, A); S.resets++; ms = 1; reach = 0; }
      it.maxStretch = ms; it.reach = reach;
      if (ms > S.maxStretch) S.maxStretch = ms;
      var rr = reach / Math.max(1, it.len + it.width); if (rr > S.maxReach) S.maxReach = rr;
    }

    // ------------------------------------------------------------------ drawing
    function pixelMode(ctx) {
      if (P.snap === 'pixel') return true;
      if (P.snap === 'smooth') return false;
      if (skinPixel) return true;
      try { return !!ctx && ctx.imageSmoothingEnabled === false; } catch (e) { return false; }
    }
    function outlineOn(it, px) {
      var v = it.outlineOpt != null ? it.outlineOpt : P.outline;
      if (v === true || v === 'on') return true;
      if (v === false || v === 'off') return false;
      if (skinOutline != null) return skinOutline > 0;
      return true;
    }
    function inkOf(it) { return it.ink || skinInk || '#1b1424'; }
    function matches(it, layer, group) {
      if (layer != null && layer !== 'all' && (it.layer || it.layerDef) !== layer) return false;
      if (group == null) return true;
      if (typeof group === 'function') { try { return !!group(it.id, it.group); } catch (e) { return false; } }
      if (Array.isArray(group)) return group.indexOf(it.group) >= 0 || group.indexOf(it.id) >= 0;
      return it.group === String(group) || it.id === String(group);
    }
    function draw(ctx, layer, group) {
      S.draws++;
      if (!ctx || typeof ctx.beginPath !== 'function') { S.badInput++; return 0; }
      // update() never called: after 40 draws, a draw of everything (no group) advances one 60 Hz frame (stats().selfAdvanced)
      if (++drawsNoUpdate > 40 && S.updates === 0 && group == null && (layer == null || layer === 'back' || layer === 'all')) { advance(1000 / 60); S.selfAdvanced++; }
      if (drawFrame !== S.updates + S.selfAdvanced * 1e6) { lastDrawnRects = {}; drawFrame = S.updates + S.selfAdvanced * 1e6; }
      var cam = camera(), px = pixelMode(ctx), count = 0;
      if (typeof o.light === 'function') { var lv = safe(o.light); if (lv) setLight(lv); }
      for (var i = 0; i < order.length; i++) {
        var it = items[order[i]];
        if (!it || !it.visible || !it.valid || !matches(it, layer, group)) continue;
        try {
          ctx.save();
          var al = (it.alpha != null ? it.alpha : 1) * (it.anchor.alpha != null ? it.anchor.alpha : 1);
          if (al < 1) ctx.globalAlpha *= al;
          var bb = px ? drawPixel(ctx, it, cam) : drawSmooth(ctx, it, cam);
          ctx.restore();
          if (bb) { count++; bb.owner = it.group; bb.id = it.id; bb.layer = it.layer || it.layerDef; bb.ax = it.anchor.x - cam.x; bb.ay = it.anchor.y - cam.y; bb.seq = S.draws; lastDrawnRects[it.id] = bb; }
        } catch (e) { S.drawErrors++; try { ctx.restore(); } catch (e2) { } }
      }
      S.drawn += count;
      return count;
    }

    // Catmull-Rom subdivision of a chain (screen coords)
    function chainPts(it, cam, sub) {
      var n = it.rows, X = [], Y = [];
      for (var i = 0; i < n; i++) { X.push(it.px[i] - cam.x); Y.push(it.py[i] - cam.y); }
      if (sub <= 1) return { x: X, y: Y, f: X.map(function (_, i) { return i / (n - 1); }) };
      var ox = [], oy = [], f = [];
      for (var k = 0; k < n - 1; k++) {
        var x0 = X[Math.max(0, k - 1)], y0 = Y[Math.max(0, k - 1)], x1 = X[k], y1 = Y[k], x2 = X[k + 1], y2 = Y[k + 1], x3 = X[Math.min(n - 1, k + 2)], y3 = Y[Math.min(n - 1, k + 2)];
        for (var s = 0; s < sub; s++) {
          var t = s / sub, t2 = t * t, t3 = t2 * t;
          ox.push(0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3));
          oy.push(0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3));
          f.push((k + t) / (n - 1));
        }
      }
      ox.push(X[n - 1]); oy.push(Y[n - 1]); f.push(1);
      return { x: ox, y: oy, f: f };
    }
    // strip edges with width profile and a ribbon twist from curvature
    function stripEdges(it, C) {
      var n = C.x.length, L = [], R = [], tone = [], w0 = it.width, tp = it.taper;
      for (var i = 0; i < n; i++) {
        var a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        var tx = C.x[b] - C.x[a], ty = C.y[b] - C.y[a], tl = Math.sqrt(tx * tx + ty * ty) || 1;
        tx /= tl; ty /= tl;
        var nx = -ty, ny = tx;
        // curvature: angle between the two neighbouring segments
        var tw = 0;
        if (i > 0 && i < n - 1) {
          var ax = C.x[i] - C.x[i - 1], ay = C.y[i] - C.y[i - 1], bx = C.x[i + 1] - C.x[i], by = C.y[i + 1] - C.y[i];
          var cr = ax * by - ay * bx, dt = ax * bx + ay * by; tw = Math.atan2(cr, dt);
        }
        var f = C.f[i], wf = 1 + (tp - 1) * f;
        var twist = it.kind === 'rope' || it.kind === 'chain' ? 1 : 1 - 0.5 * Math.min(1, Math.abs(tw) * (it.kind === 'hair' ? 1.5 : 4));
        var w = Math.max(0.6, w0 * wf * twist) / 2;
        L.push([C.x[i] + nx * w, C.y[i] + ny * w]); R.push([C.x[i] - nx * w, C.y[i] - ny * w]);
        var lit = -(nx * LIGHT.x + ny * LIGHT.y);   // which side faces the light
        tone.push(clamp(0.52 + 0.28 * lit * 0.5 + (twist - 0.75) * 0.9, 0.12, 0.95));
      }
      return { L: L, R: R, tone: tone };
    }
    function baseRgb(it, which) {
      var c = which === 2 ? (it.color2 || null) : which === 3 ? (it.trim || null) : it.color;
      var rgb = parseHex(c);
      if (!rgb && which === 2) { var b = parseHex(it.color); return b ? [b[0] * 0.62, b[1] * 0.58, b[2] * 0.7] : null; }
      return rgb;
    }
    function fillFor(it, which, tone, quant) {
      var rgb = baseRgb(it, which);
      if (!rgb) return (which === 3 && it.trim) || (which === 2 && it.color2) || it.color;
      var t = 0.5 + (tone - 0.5) * P.shade;
      if (quant) t = t < 0.36 ? 0.22 : t < 0.62 ? 0.5 : 0.78;
      var out = toneRgb(rgb, t);
      if (quant && palCollect) palCollect.push(out);
      return css(out);
    }

    // ---- painted (HD) path, v1.2: a fine mesh (Catmull-Rom through the points) with per-vertex tones, drawn in batches of
    // equal tone; then, clipped to the smooth silhouette: a gradient along the length, brush strokes fixed in cloth
    // coordinates, a light rim on the edges that face the light; last a thin edge line in a darker hue of the cloth.
    // Everything is a pure function of the points (update() state): no time, no random numbers at draw time.
    function setLight(x, y) {
      if (x && typeof x === 'object') { y = Array.isArray(x) ? x[1] : x.y; x = Array.isArray(x) ? x[0] : x.x; }
      x = +x; y = +y; var l = Math.sqrt(x * x + y * y);
      if (!fin(l) || l < 1e-6) return false;
      Lx = x / l; Ly = y / l; return true;
    }
    function need(n) {
      if (MX.length >= n) return;
      var m = Math.max(n, MX.length * 2, 512);
      MX = new Float32Array(m); MY = new Float32Array(m); MT = new Float32Array(m); AX = new Float32Array(m); AY = new Float32Array(m); AT = new Float32Array(m); AC = new Float32Array(m);
      CL = new Float32Array(m); CQ = new Float32Array(m); QN = new Int32Array(m);
    }
    function hash2(a, b) { var s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }
    function paintRgb(b, t) {
      if (t < 0.5) return mixRgb(b, [b[0] * 0.3 + 14, b[1] * 0.24 + 6, b[2] * 0.36 + 30], (0.5 - t) * 2 * 0.9);
      return mixRgb(b, [Math.min(255, b[0] * 1.1 + 44), Math.min(255, b[1] * 1.06 + 34), Math.min(255, b[2] * 0.98 + 16)], (t - 0.5) * 2 * 0.85);
    }
    // per piece, cached until its colours or the shade change: NL tones each for the face, the back and the trim; edge, light and dark
    function rampOf(it) {
      var key = it.color + '|' + it.color2 + '|' + it.trim + '|' + P.shade + '|' + (it.ink || skinInk || '');
      if (it.rampKey === key) return it.ramp;
      var R = { c: [null, [], [], []] }, b, w, l;
      for (w = 1; w <= 3; w++) {
        if (w === 3 && !it.trim) { R.c[3] = R.c[1]; continue; }
        b = baseRgb(it, w);
        var raw = w === 3 ? it.trim : w === 2 ? (it.color2 || it.color) : it.color;
        for (l = 0; l < NL; l++) R.c[w].push(b ? css(paintRgb(b, 0.5 + (l / (NL - 1) - 0.5) * P.shade)) : raw);
      }
      b = baseRgb(it, 1);
      R.edge = it.ink || skinInk || (b ? css(mixRgb(paintRgb(b, 0.02), [46, 24, 26], 0.4)) : '#2b1a14');
      R.hi = b ? css(paintRgb(b, 0.97)) : '#fff3dc'; R.lo = b ? css(paintRgb(b, 0.08)) : '#2b1a14';
      R.g0 = 'rgba(34,16,54,' + (0.24 * P.shade).toFixed(3) + ')'; R.g1 = 'rgba(255,206,140,' + (0.13 * P.shade).toFixed(3) + ')';
      it.rampKey = key; it.ramp = R; return R;
    }
    // per piece, built once per mesh size: soft blotches (value noise) per fine quad and a few brush strokes, all in cloth coordinates
    function paintData(it, FR, FC, SA, SC) {
      var key = FR + 'x' + FC;
      if (it.pdKey === key) return it.pd;
      var seed = 7, id = it.id, i, r, c, qc = FC - 1;
      for (i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) % 997;
      var mot = new Float32Array((FR - 1) * qc);
      for (r = 0; r < FR - 1; r++) for (c = 0; c < qc; c++) {
        var u = c / SC * 0.85 + seed, v = r / SA * 0.6 + seed * 0.37, u0 = Math.floor(u), v0 = Math.floor(v), fu = u - u0, fv = v - v0;
        fu = fu * fu * (3 - 2 * fu); fv = fv * fv * (3 - 2 * fv);
        var a = hash2(u0, v0), b = hash2(u0 + 1, v0), d = hash2(u0, v0 + 1), e = hash2(u0 + 1, v0 + 1), top = a + (b - a) * fu;
        mot[r * qc + c] = top + (d + (e - d) * fu - top) * fv - 0.5;
      }
      var ns = FC > 4 ? Math.round(clamp((FR - 1) * qc / 22, 5, 16)) : 3, st = [];
      for (i = 0; i < ns; i++) {
        var r0 = Math.floor(hash2(i, seed + 5) * (FR - 1) * 0.8), len = Math.max(2, Math.round((0.1 + 0.22 * hash2(i, seed + 7)) * (FR - 1)));
        st.push((0.1 + 0.8 * hash2(i, seed + 3)) * qc, r0, Math.min(FR - 1, r0 + len), hash2(i, seed + 9) > 0.45 ? 1 : 0);
      }
      it.pdKey = key; it.pd = { mot: mot, st: st, ph: hash2(seed, 3) }; return it.pd;
    }
    // how much a strip running along the unit tangent (tx, ty) shows a face to the light: its upper side is the lit one;
    // a strip hanging straight down is neutral (smooth through vertical, so a swaying piece does not pop)
    function litOf(tx, ty) { return tx / Math.sqrt(tx * tx + 0.05) * (Lx * ty - Ly * tx); }
    function cr(p0, p1, p2, p3, t) { var t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }

    // the fine mesh MX / MY / MT (FR x FC vertices): fill its quads in batches of equal tone
    function paintMesh(ctx, it, FR, FC, R, sc, pd, back, sign, trimRow, skipCol, skipRow) {
      var qc = FC - 1, r, c, q, a, b, d, e, i, tex = 0.085 * P.texture;
      for (i = 0; i < NL * 3; i++) QH[i] = -1;
      for (r = FR - 2; r >= 0; r--) for (c = qc - 1; c >= 0; c--) {
        if (c === skipCol && r >= skipRow) continue;
        a = r * FC + c; b = a + 1; d = a + FC; e = d + 1; q = r * qc + c;
        var t = (MT[a] + MT[b] + MT[d] + MT[e]) * 0.25 + pd.mot[q] * tex, w = 0;
        if (back && ((MX[b] - MX[a] + MX[e] - MX[d]) * (MY[d] - MY[a] + MY[e] - MY[b]) - (MY[b] - MY[a] + MY[e] - MY[d]) * (MX[d] - MX[a] + MX[e] - MX[b])) * sign < 0) { w = 1; t = 0.4 + (t - 0.5) * 0.6; }
        else if (trimRow >= 0 && r >= trimRow) { w = 2; t = 0.58 + (t - 0.5) * 0.6; }   // a trim keeps its own colour in the folds
        var k = w * NL + (t <= 0 ? 0 : t >= 1 ? NL - 1 : Math.round(t * (NL - 1)));
        QN[q] = QH[k]; QH[k] = q;
      }
      ctx.lineWidth = 0.7 / sc;
      for (var wi = 0; wi < 3; wi++) {   // the back face first, then the face, then the trim
        var w2 = wi === 0 ? 1 : wi === 1 ? 0 : 2, cols = R.c[w2 === 0 ? 1 : w2 === 1 ? 2 : 3];
        for (var lv = 0; lv < NL; lv++) {
          q = QH[w2 * NL + lv]; if (q < 0) continue;
          ctx.beginPath();
          for (; q >= 0; q = QN[q]) {
            r = (q / qc) | 0; a = r * FC + q - r * qc; b = a + 1; d = a + FC; e = d + 1;
            ctx.moveTo(MX[a], MY[a]); ctx.lineTo(MX[b], MY[b]); ctx.lineTo(MX[e], MY[e]); ctx.lineTo(MX[d], MY[d]); ctx.closePath();
          }
          ctx.fillStyle = ctx.strokeStyle = cols[lv]; ctx.fill(); ctx.stroke();   // the hairline closes the seams between batches
        }
      }
    }
    function pathB(ctx, nb) { ctx.beginPath(); ctx.moveTo(BX[0], BY[0]); for (var i = 1; i < nb; i++) ctx.lineTo(BX[i], BY[i]); ctx.closePath(); }
    // over the fills. BX / BY [0, nb): the silhouette; (gx0, gy0) -> (gx1, gy1): from the attachment to the free end
    function paintOver(ctx, it, FR, FC, R, sc, pd, nb, ol, edgeW, gx0, gy0, gx1, gy1, hemRow, lastRow) {
      var k = P.shade, u = unit(), i, ga = ctx.globalAlpha;
      if (k > 0) {
        var area = 0;
        for (i = 0; i < nb; i++) { var j = i + 1 < nb ? i + 1 : 0; area += BX[i] * BY[j] - BX[j] * BY[i]; }
        ctx.lineCap = 'butt';
        // along the length: cool and darker by the attachment, a warm lift toward the free end
        if (Math.abs(gx1 - gx0) + Math.abs(gy1 - gy0) > 0.5) {
          var g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
          g.addColorStop(0, R.g0); g.addColorStop(0.5, 'rgba(34,16,54,0)'); g.addColorStop(0.6, 'rgba(255,206,140,0)'); g.addColorStop(1, R.g1);
          pathB(ctx, nb); ctx.fillStyle = g; ctx.fill();
        }
        // brush strokes along the cloth (dark, then light)
        if (P.texture > 0) {
          var st = pd.st, qc = FC - 1;
          ctx.lineWidth = Math.max(0.7 / sc, 0.85 * u);
          for (var pass = 0; pass < 2; pass++) {
            ctx.beginPath();
            for (i = 0; i < st.length; i += 4) {
              if (st[i + 3] !== pass) continue;
              var c0 = Math.min(qc - 1, Math.floor(st[i])), fr = st[i] - c0, r1 = Math.min(st[i + 2], lastRow);
              for (var r = st[i + 1]; r <= r1; r++) {
                var a = r * FC + c0, sx = MX[a] + (MX[a + 1] - MX[a]) * fr, sy = MY[a] + (MY[a + 1] - MY[a]) * fr;
                if (r === st[i + 1]) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
              }
            }
            ctx.strokeStyle = pass ? R.hi : R.lo; ctx.globalAlpha = ga * (pass ? 0.2 : 0.22) * k * P.texture; ctx.stroke();
          }
        }
        // the seam above a trim band
        if (hemRow > 0) {
          ctx.beginPath(); ctx.moveTo(MX[hemRow * FC], MY[hemRow * FC]);
          for (i = 1; i < FC; i++) ctx.lineTo(MX[hemRow * FC + i], MY[hemRow * FC + i]);
          ctx.lineWidth = Math.max(0.6 / sc, 0.7 * u); ctx.strokeStyle = R.lo; ctx.globalAlpha = ga * 0.5 * k; ctx.stroke();
        }
        // a light rim just inside the edges that face the light (the stroke runs half its width inside the silhouette)
        var or = area >= 0 ? 1 : -1, on = false, rw = Math.max(0.8 / sc, 1.15 * u), ins = rw * 0.5 + (ol ? edgeW * 0.5 : 0);
        ctx.beginPath();
        for (i = 0; i < nb; i++) {
          var j2 = i + 1 < nb ? i + 1 : 0, dx = BX[j2] - BX[i], dy = BY[j2] - BY[i], dl = Math.sqrt(dx * dx + dy * dy);
          if (dl > 1e-6 && (dy * Lx - dx * Ly) * or / dl > 0.3) {
            var ix = -dy * or / dl * ins, iy = dx * or / dl * ins;
            if (!on) ctx.moveTo(BX[i] + ix, BY[i] + iy); ctx.lineTo(BX[j2] + ix, BY[j2] + iy); on = true;
          } else on = false;
        }
        ctx.lineWidth = rw; ctx.strokeStyle = R.hi; ctx.globalAlpha = ga * 0.55 * k; ctx.stroke();
        ctx.lineCap = 'round'; ctx.globalAlpha = ga;
      }
      if (ol) { pathB(ctx, nb); ctx.lineWidth = edgeW; ctx.strokeStyle = R.edge; ctx.globalAlpha = ga * 0.92; ctx.stroke(); ctx.globalAlpha = ga; }
    }

    function drawGridHD(ctx, it, cam, ol, edgeW, sc, pad) {
      var R = rampOf(it), cols = it.colsN, rows = it.rows, SA = 3, SC = 3, FR = (rows - 1) * SA + 1, FC = (cols - 1) * SC + 1;
      need(Math.max(FR * FC, cols * FR, rows * cols) + 8);
      var px = it.px, py = it.py, cx = cam.x, cy = cam.y, r, c, i, a, b, banner = it.kind === 'banner';
      var sign = banner ? -(it.bf || 1) : 1, restArea = it.restAlong * Math.max(1e-6, it.restAcross);
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, mean = 0, cape = it.kind === 'cape';
      // a flag held open by the wind: light and dark bands travel out along it, in step with the solver's ripple (game time)
      var bandK = banner ? 0.17 * Math.min(1.5, it.flutter != null ? it.flutter : it.D.flutter) * clamp((it.windNow || 0) / (120 * unit()), 0, 1) * (reduced() ? 0.3 : 1) : 0;
      // per point: how its strand faces the light
      for (i = 0; i < it.n; i++) {
        r = (i / cols) | 0; a = r > 0 ? i - cols : i; b = r < rows - 1 ? i + cols : i;
        var tx = px[b] - px[a], ty = py[b] - py[a], tl = Math.sqrt(tx * tx + ty * ty) || 1;
        CL[i] = litOf(tx / tl, ty / tl); mean += CL[i];
        var xx = px[i] - cx, yy = py[i] - cy; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
      }
      mean /= it.n;
      // per quad: projected area / rest area (cloth turned away from the camera is narrower: a fold)
      var qc = cols - 1;
      for (r = 0; r < rows - 1; r++) for (c = 0; c < qc; c++) {
        a = r * cols + c; b = a + 1; var d = a + cols, e = d + 1;
        var ar = ((px[b] - px[a] + px[e] - px[d]) * (py[d] - py[a] + py[e] - py[b]) - (py[b] - py[a] + py[e] - py[d]) * (px[d] - px[a] + px[e] - px[b])) / 4;
        CQ[r * qc + c] = Math.min(1, Math.abs(ar / (restArea * (it.kind === 'cape' ? 1 + (it.taper - 1) * (r + 0.5) / (rows - 1) : 1))));
      }
      // tone per point, straight into the along-subdivided columns AX / AY / AT (index c * FR + fine row)
      for (c = 0; c < cols; c++) {
        var tc = cols > 1 ? c / (cols - 1) * 2 - 1 : 0, prev = 0, prevC = 1;
        for (r = 0; r < rows; r++) {
          i = r * cols + c;
          var s = 0, m = 0;
          for (var qr = r - 1; qr <= r; qr++) for (var q2 = c - 1; q2 <= c; q2++) if (qr >= 0 && qr < rows - 1 && q2 >= 0 && q2 < qc) { s += CQ[qr * qc + q2]; m++; }
          var comp = m ? s / m : 1, f = r / (rows - 1);
          var ex = px[r * cols + cols - 1] - px[r * cols], ey = py[r * cols + cols - 1] - py[r * cols], el = Math.sqrt(ex * ex + ey * ey) || 1;
          var t = 0.52 + 0.15 * CL[i] + 0.3 * clamp((CL[i] - mean) * 3.2, -1, 1) - 0.4 * (1 - comp) + 0.12 * tc * (ex * Lx + ey * Ly) / el - (banner ? 0.1 : 0.15) * (1 - f) * (1 - f);
          if (bandK) t += bandK * Math.sin(clock * 0.0082 - r * 1.1 + c * 0.25) * (0.35 + 0.65 * f);
          t = clamp(t, 0.04, 0.97);
          if (r > 0) for (var k = 1; k < SA; k++) {
            var fi = c * FR + (r - 1) * SA + k, tk = k / SA, i0 = r > 1 ? i - 2 * cols : i - cols, i1 = i - cols, i3 = r < rows - 1 ? i + cols : i;
            AX[fi] = cr(px[i0], px[i1], px[i], px[i3], tk) - cx; AY[fi] = cr(py[i0], py[i1], py[i], py[i3], tk) - cy; AT[fi] = prev + (t - prev) * tk; AC[fi] = prevC + (comp - prevC) * tk;
          }
          AX[c * FR + r * SA] = px[i] - cx; AY[c * FR + r * SA] = py[i] - cy; AT[c * FR + r * SA] = t; AC[c * FR + r * SA] = comp; prev = t; prevC = comp;
        }
      }
      // across
      var pd = paintData(it, FR, FC, SA, SC), trimRow = it.trim ? FR - SA : -1, foldPh = pd.ph;
      for (var fr = 0; fr < FR; fr++) for (c = 0; c < cols; c++) {
        var p1 = c * FR + fr, o = fr * FC + c * SC;
        MX[o] = AX[p1]; MY[o] = AY[p1]; MT[o] = AT[p1];
        if (c < cols - 1) {
          var p0 = c > 0 ? p1 - FR : p1, p2 = p1 + FR, p3 = c < cols - 2 ? p2 + FR : p2;
          for (var k2 = 1; k2 < SC; k2++) { var t2 = k2 / SC; MX[o + k2] = cr(AX[p0], AX[p1], AX[p2], AX[p3], t2); MY[o + k2] = cr(AY[p0], AY[p1], AY[p2], AY[p3], t2); MT[o + k2] = AT[p1] + (AT[p2] - AT[p1]) * t2; AC[FR * cols + k2] = AC[p1] + (AC[p2] - AC[p1]) * t2; }
        }
        // a cape hangs in soft folds that fan out from the shoulders: fixed in cloth coordinates, deeper where the cloth is gathered
        if (cape) for (var k3 = 0; k3 < SC && (k3 === 0 || c < cols - 1); k3++) {
          var fa = (0.05 + 0.3 * (1 - (k3 ? AC[FR * cols + k3] : AC[p1]))) * (0.3 + 0.7 * fr / (FR - 1));
          MT[o + k3] = clamp(MT[o + k3] + fa * Math.sin(((c * SC + k3) / (FC - 1) * 1.6 + foldPh) * 6.2832), 0.04, 0.97);
        }
      }
      paintMesh(ctx, it, FR, FC, R, sc, pd, true, sign, trimRow, -1, 0);
      // silhouette: round the mesh once, clockwise from the first pin
      var nb = 0;
      for (i = 0; i < FC; i++) { BX[nb] = MX[i]; BY[nb++] = MY[i]; }
      for (i = 1; i < FR; i++) { BX[nb] = MX[i * FC + FC - 1]; BY[nb++] = MY[i * FC + FC - 1]; }
      for (i = FC - 2; i >= 0; i--) { BX[nb] = MX[(FR - 1) * FC + i]; BY[nb++] = MY[(FR - 1) * FC + i]; }
      for (i = FR - 2; i > 0; i--) { BX[nb] = MX[i * FC]; BY[nb++] = MY[i * FC]; }
      var mc = (FC - 1) >> 1;
      paintOver(ctx, it, FR, FC, R, sc, pd, nb, ol, edgeW, MX[mc], MY[mc], MX[(FR - 1) * FC + mc], MY[(FR - 1) * FC + mc], trimRow, FR - 1);
      var p = (ol ? pad : 0) + 1;
      return { x: x0 - p, y: y0 - p, w: x1 - x0 + p * 2, h: y1 - y0 + p * 2 };
    }

    function drawStripHD(ctx, it, cam, ol, edgeW, sc, pad) {
      var R = rampOf(it), C = chainPts(it, cam, 4), E = stripEdges(it, C), n = C.x.length, FC = 4, FR = n, i;
      need(FR * FC + 4);
      var notch = it.kind === 'scarf' || it.kind === 'ribbon', mean = 0, tot = 0;
      for (i = 0; i < n; i++) {
        var a = i > 0 ? i - 1 : i, b = i < n - 1 ? i + 1 : i, tx = C.x[b] - C.x[a], ty = C.y[b] - C.y[a], tl = Math.sqrt(tx * tx + ty * ty) || 1;
        CL[i] = litOf(tx / tl, ty / tl); mean += CL[i];
        if (i > 0) tot += Math.sqrt((C.x[i] - C.x[i - 1]) * (C.x[i] - C.x[i - 1]) + (C.y[i] - C.y[i - 1]) * (C.y[i] - C.y[i - 1]));
        CQ[i] = tot;   // arc length from the pin
      }
      mean /= n;
      var D = notch ? Math.min(it.width * 0.5, tot * 0.4) : 0, skipRow = n, trimRow = -1;
      for (i = 0; i < n; i++) {
        var L = E.L[i], Q = E.R[i], f = C.f[i], wx = L[0] - Q[0], wy = L[1] - Q[1], wl = Math.sqrt(wx * wx + wy * wy) || 1;
        var tw = clamp(wl / Math.max(0.6, it.width * (1 + (it.taper - 1) * f)), 0, 1), el = (wx * Lx + wy * Ly) / wl;
        var t = 0.54 + 0.16 * CL[i] + 0.36 * clamp((CL[i] - mean) * 3.2, -1, 1) + (tw - 0.85) * 0.6 - 0.14 * (1 - f) * (1 - f);
        var o = i * FC, d = tot - CQ[i], k1 = 0.3, k2 = 0.7;
        if (notch && d < D) { if (skipRow === n) skipRow = i; k1 = 0.5 * d / D; k2 = 1 - k1; }
        if (it.trim && trimRow < 0 && f >= 0.84) trimRow = i;
        MX[o] = L[0]; MY[o] = L[1]; MX[o + 3] = Q[0]; MY[o + 3] = Q[1];
        MX[o + 1] = L[0] - wx * k1; MY[o + 1] = L[1] - wy * k1; MX[o + 2] = L[0] - wx * k2; MY[o + 2] = L[1] - wy * k2;
        MT[o] = clamp(t + 0.36 * el - 0.04, 0.04, 0.97); MT[o + 1] = clamp(t + 0.16 * el, 0.04, 0.97); MT[o + 2] = clamp(t - 0.14 * el, 0.04, 0.97); MT[o + 3] = clamp(t - 0.36 * el - 0.04, 0.04, 0.97);
      }
      var pd = paintData(it, FR, FC, 4, 1);
      paintMesh(ctx, it, FR, FC, R, sc, pd, false, 1, trimRow, notch ? 1 : -1, skipRow > 0 ? skipRow - 1 : 0);
      var nb = 0;
      for (i = 0; i < n; i++) { BX[nb] = MX[i * FC]; BY[nb++] = MY[i * FC]; }
      if (notch && skipRow < n) {
        for (i = n - 1; i >= skipRow; i--) { BX[nb] = MX[i * FC + 1]; BY[nb++] = MY[i * FC + 1]; }
        for (i = skipRow; i < n; i++) { BX[nb] = MX[i * FC + 2]; BY[nb++] = MY[i * FC + 2]; }
      }
      for (i = n - 1; i >= 0; i--) { BX[nb] = MX[i * FC + 3]; BY[nb++] = MY[i * FC + 3]; }
      paintOver(ctx, it, FR, FC, R, sc, pd, nb, ol, edgeW, C.x[0], C.y[0], C.x[n - 1], C.y[n - 1], trimRow, skipRow < n ? skipRow - 1 : n - 1);
      return bbox(C, it.width + pad * 2);
    }

    // rope: twisted strands. A darker under side and a light line on the lit side (both fade where the rope runs along
    // the light), diagonal strand marks at a fixed pitch measured from the pin, round ends
    function drawRopeHD(ctx, it, cam, ol, edgeW, sc, pad) {
      var R = rampOf(it), C = chainPts(it, cam, 3), n = C.x.length, w = it.width, k = P.shade, i, ga = ctx.globalAlpha;
      if (ol) strokePath(ctx, C, w + edgeW * 2, R.edge);
      strokePath(ctx, C, w, R.c[1][(NL - 1) >> 1]);
      if (w * sc >= 2.2 && k > 0 && n > 1) {
        need(n + 4);
        var tot = 0;
        for (i = 0; i < n; i++) {
          var a = i > 0 ? i - 1 : i, b = i < n - 1 ? i + 1 : i, tx = C.x[b] - C.x[a], ty = C.y[b] - C.y[a], tl = Math.sqrt(tx * tx + ty * ty) || 1;
          MX[i] = -ty / tl; MY[i] = tx / tl;
          if (i > 0) tot += Math.sqrt((C.x[i] - C.x[i - 1]) * (C.x[i] - C.x[i - 1]) + (C.y[i] - C.y[i - 1]) * (C.y[i] - C.y[i - 1]));
          MT[i] = tot; CL[i] = clamp((MX[i] * Lx + MY[i] * Ly) * 1.8, -1, 1);
        }
        ctx.lineCap = 'butt';
        ctx.beginPath();
        for (i = 0; i < n; i++) { var sx = C.x[i] - MX[i] * CL[i] * w * 0.27, sy = C.y[i] - MY[i] * CL[i] * w * 0.27; if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }
        ctx.lineWidth = w * 0.44; ctx.strokeStyle = R.c[1][Math.round((NL - 1) * 0.22)]; ctx.globalAlpha = ga * 0.8; ctx.stroke();
        ctx.beginPath();
        for (i = 0; i < n; i++) { var hx = C.x[i] + MX[i] * CL[i] * w * 0.28, hy = C.y[i] + MY[i] * CL[i] * w * 0.28; if (i) ctx.lineTo(hx, hy); else ctx.moveTo(hx, hy); }
        ctx.lineWidth = Math.max(0.6 / sc, w * 0.2); ctx.strokeStyle = R.hi; ctx.globalAlpha = ga * 0.7 * k; ctx.stroke();
        if (P.texture > 0) {
          var p = Math.max(w * 0.9, 2.2 / sc), sl = w * 0.75, j = 0, j2 = 0, hw = w * 0.42;
          ctx.beginPath();
          for (var s = p * 0.5; s + sl < tot; s += p) {
            while (j < n - 2 && MT[j + 1] < s) j++;
            while (j2 < n - 2 && MT[j2 + 1] < s + sl) j2++;
            var f1 = (s - MT[j]) / (MT[j + 1] - MT[j] || 1), f2 = (s + sl - MT[j2]) / (MT[j2 + 1] - MT[j2] || 1);
            ctx.moveTo(C.x[j] + (C.x[j + 1] - C.x[j]) * f1 + MX[j] * hw, C.y[j] + (C.y[j + 1] - C.y[j]) * f1 + MY[j] * hw);
            ctx.lineTo(C.x[j2] + (C.x[j2 + 1] - C.x[j2]) * f2 - MX[j2] * hw, C.y[j2] + (C.y[j2 + 1] - C.y[j2]) * f2 - MY[j2] * hw);
          }
          ctx.lineWidth = Math.max(0.5 / sc, w * 0.17); ctx.strokeStyle = R.lo; ctx.globalAlpha = ga * 0.6 * k * P.texture; ctx.stroke();
        }
        ctx.lineCap = 'round'; ctx.globalAlpha = ga;
      }
      return bbox(C, w + pad * 2);
    }

    function drawFlat(ctx, it, cam) {   // look: 'flat' (the v1.1 drawing: flat tones per segment and an ink outline, for flat vector art)
      var ink = inkOf(it), ol = outlineOn(it, false), sc = 1;
      try { var m = ctx.getTransform ? ctx.getTransform() : null; if (m) sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; } catch (e) { }
      var olw = (skinOutline != null && skinOutline > 0 ? skinOutline : 1.25) * unit();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (it.grid) return drawGrid(ctx, it, cam, false, ol ? olw : 0, ink, sc);
      var C = chainPts(it, cam, 3);
      if (it.kind === 'rope') {
        var w = it.width;
        if (ol) { strokePath(ctx, C, w + olw * 2, ink); }
        strokePath(ctx, C, w, fillFor(it, 1, 0.5, false));
        if (w * sc >= 2.5) { ctx.save(); ctx.translate(-w * 0.18, -w * 0.18); strokePath(ctx, C, Math.max(0.6 / sc, w * 0.28), fillFor(it, 1, 0.82, false)); ctx.restore(); }
        return bbox(C, w + olw * 2);
      }
      if (it.kind === 'chain') return drawLinks(ctx, it, cam, false, ol ? olw : 0, ink);
      var E = stripEdges(it, C), n = E.L.length;
      var notch = (it.kind === 'scarf' || it.kind === 'ribbon') ? 1 : 0;
      if (ol) {
        ctx.beginPath(); stripPoly(ctx, E, notch, C);
        ctx.lineWidth = olw * 2; ctx.strokeStyle = ink; ctx.stroke();
      }
      // segment quads, each overdrawn by a hairline of its own colour to hide the anti-aliasing seams
      for (var i = 0; i < n - 1; i++) {
        var tn = (E.tone[i] + E.tone[i + 1]) / 2, which = (it.trim && C.f[i] >= 0.84) ? 3 : 1;
        var col = fillFor(it, which, tn, false);
        ctx.beginPath(); ctx.moveTo(E.L[i][0], E.L[i][1]); ctx.lineTo(E.L[i + 1][0], E.L[i + 1][1]);
        if (notch && i === n - 2) { var mx = (E.L[i + 1][0] + E.R[i + 1][0]) / 2, my = (E.L[i + 1][1] + E.R[i + 1][1]) / 2, dx = C.x[n - 1] - C.x[n - 2], dy = C.y[n - 1] - C.y[n - 2], dl = Math.sqrt(dx * dx + dy * dy) || 1; ctx.lineTo(mx - dx / dl * it.width * 0.45, my - dy / dl * it.width * 0.45); }
        ctx.lineTo(E.R[i + 1][0], E.R[i + 1][1]); ctx.lineTo(E.R[i][0], E.R[i][1]); ctx.closePath();
        ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 0.7 / sc; ctx.strokeStyle = col; ctx.stroke();
      }
      // a soft highlight along the lit edge
      if (it.width * sc >= 3 && P.shade > 0) {
        ctx.beginPath();
        for (var j = 0; j < n - 1; j++) { var q = E.L[j], r2 = E.R[j], hx = q[0] + (r2[0] - q[0]) * 0.22, hy = q[1] + (r2[1] - q[1]) * 0.22; if (j === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy); }
        ctx.lineWidth = Math.max(0.6 / sc, it.width * 0.14); ctx.strokeStyle = fillFor(it, 1, 0.9, false); ctx.globalAlpha *= 0.55; ctx.stroke();
      }
      return bbox(C, it.width + olw * 2);
    }
    function drawSmooth(ctx, it, cam) {
      if (P.look === 'flat') return drawFlat(ctx, it, cam);
      var ol = outlineOn(it, false), sc = 1, u = unit();
      try { var m = ctx.getTransform ? ctx.getTransform() : null; if (m) sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; } catch (e) { }
      // the edge line: thin, in a darker hue of the cloth; a piece with its own `ink` (or a skin's ink) keeps that colour and the ink line's weight
      var pad = (skinOutline != null && skinOutline > 0 ? skinOutline : 1.25) * u, edgeW = it.ink || skinInk ? pad : 0.9 * u;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (it.grid) return drawGridHD(ctx, it, cam, ol, edgeW, sc, pad);
      if (it.kind === 'rope') return drawRopeHD(ctx, it, cam, ol, edgeW, sc, pad);
      if (it.kind === 'chain') return drawLinks(ctx, it, cam, false, ol ? pad : 0, rampOf(it).edge);
      if (it.width * sc < 2.5) {   // a thread: one line
        var C = chainPts(it, cam, 3), R = rampOf(it);
        if (ol) strokePath(ctx, C, it.width + edgeW * 2, R.edge);
        strokePath(ctx, C, it.width, R.c[1][(NL - 1) >> 1]);
        return bbox(C, it.width + pad * 2);
      }
      return drawStripHD(ctx, it, cam, ol, edgeW, sc, pad);
    }
    function strokePath(ctx, C, w, col) {
      ctx.beginPath(); ctx.moveTo(C.x[0], C.y[0]);
      for (var i = 1; i < C.x.length; i++) ctx.lineTo(C.x[i], C.y[i]);
      ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
    }
    function stripPoly(ctx, E, notch, C) {
      var n = E.L.length;
      ctx.moveTo(E.L[0][0], E.L[0][1]);
      for (var i = 1; i < n; i++) ctx.lineTo(E.L[i][0], E.L[i][1]);
      if (notch) { var mx = (E.L[n - 1][0] + E.R[n - 1][0]) / 2, my = (E.L[n - 1][1] + E.R[n - 1][1]) / 2, dx = C.x[n - 1] - C.x[n - 2], dy = C.y[n - 1] - C.y[n - 2], dl = Math.sqrt(dx * dx + dy * dy) || 1, w = Math.hypot(E.L[n - 1][0] - E.R[n - 1][0], E.L[n - 1][1] - E.R[n - 1][1]); ctx.lineTo(mx - dx / dl * w * 0.45, my - dy / dl * w * 0.45); }
      for (var j = n - 1; j >= 0; j--) ctx.lineTo(E.R[j][0], E.R[j][1]);
      ctx.closePath();
    }
    function drawLinks(ctx, it, cam, pixel, olw, ink) {
      var n = it.rows, w = it.width, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (var i = 0; i < n - 1; i++) {
        var ax = it.px[i] - cam.x, ay = it.py[i] - cam.y, bx = it.px[i + 1] - cam.x, by = it.py[i + 1] - cam.y;
        var mx = (ax + bx) / 2, my = (ay + by) / 2, ang = Math.atan2(by - ay, bx - ax), len = Math.hypot(bx - ax, by - ay);
        ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
        var face = i % 2 === 0, lw = Math.max(1, w * 0.32), rx = len * 0.62 + lw * 0.5, ry = face ? w * 0.5 : lw * 0.6;
        ctx.beginPath(); ctx.ellipse(0, 0, rx, Math.max(0.5, ry), 0, 0, Math.PI * 2);
        if (olw > 0 || pixel) { ctx.lineWidth = lw + (olw > 0 ? olw * 2 : 0) + (pixel ? 0 : 0); ctx.strokeStyle = ink; ctx.stroke(); }
        ctx.lineWidth = lw; ctx.strokeStyle = fillFor(it, 1, face ? 0.62 : 0.4, pixel); ctx.stroke();
        if (face && !pixel) { ctx.beginPath(); ctx.ellipse(0, -ry * 0.15, rx * 0.8, Math.max(0.4, ry * 0.75), 0, Math.PI * 1.1, Math.PI * 1.75); ctx.lineWidth = lw * 0.45; ctx.strokeStyle = fillFor(it, 1, 0.92, false); ctx.stroke(); }
        ctx.restore();
        x0 = Math.min(x0, ax, bx); y0 = Math.min(y0, ay, by); x1 = Math.max(x1, ax, bx); y1 = Math.max(y1, ay, by);
      }
      var pad = w / 2 + olw + 1;
      return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
    }
    function drawGrid(ctx, it, cam, pixel, olw, ink, sc) {
      var cols = it.colsN, rows = it.rows, px = it.px, py = it.py;
      var X = function (i) { return px[i] - cam.x; }, Y = function (i) { return py[i] - cam.y; };
      var restArea = it.restAlong * Math.max(1e-6, it.restAcross), sign = it.kind === 'banner' ? -(it.bf || 1) : 1;
      var bandK = it.kind === 'banner' && P.shade > 0 ? 0.2 * P.shade * Math.min(1.5, it.flutter != null ? it.flutter : it.D.flutter) * clamp((it.windNow || 0) / (120 * unit()), 0, 1) * (reduced() ? 0.3 : 1) : 0;
      // outline first (the boundary, thick), the fills cover its inner half
      if (olw > 0) {
        ctx.beginPath();
        var c, r;
        ctx.moveTo(X(0), Y(0));
        for (c = 1; c < cols; c++) ctx.lineTo(X(c), Y(c));
        for (r = 1; r < rows; r++) ctx.lineTo(X(r * cols + cols - 1), Y(r * cols + cols - 1));
        for (c = cols - 2; c >= 0; c--) ctx.lineTo(X((rows - 1) * cols + c), Y((rows - 1) * cols + c));
        for (r = rows - 2; r > 0; r--) ctx.lineTo(X(r * cols), Y(r * cols));
        ctx.closePath();
        ctx.lineWidth = olw * 2; ctx.strokeStyle = ink; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.fillStyle = ink; ctx.fill();
      }
      // quads back to front: the ones turned away (negative area) first
      var quads = [];
      for (var rr = 0; rr < rows - 1; rr++) for (var cc = 0; cc < cols - 1; cc++) {
        var a = rr * cols + cc, b = a + 1, d = a + cols, e = d + 1;
        var acx = (X(b) - X(a) + X(e) - X(d)) / 2, acy = (Y(b) - Y(a) + Y(e) - Y(d)) / 2;
        var alx = (X(d) - X(a) + X(e) - X(b)) / 2, aly = (Y(d) - Y(a) + Y(e) - Y(b)) / 2;
        var area = (acx * aly - acy * alx) * sign;
        var restA = restArea * (it.kind === 'cape' ? 1 + (it.taper - 1) * (rr + 0.5) / (rows - 1) : 1);
        var ratio = area / restA;
        var al = Math.sqrt(alx * alx + aly * aly) || 1, lit = (-aly / al) * 0.0 + (acx * LIGHT.x + acy * LIGHT.y) / (Math.sqrt(acx * acx + acy * acy) || 1);
        var tone = clamp(0.2 + 0.62 * Math.min(1, Math.abs(ratio)) + 0.12 * lit * Math.sign(ratio || 1), 0.08, 0.96);
        if (it.kind === 'cape' && rr === 0) tone *= 0.82;
        // a flag in the wind: light and dark bands travel out along it (folds turning toward and away from the light)
        if (bandK) tone = clamp(tone + bandK * Math.sin(clock * 0.0082 - (rr + 0.5) * 1.1 + cc * 0.25) * (0.35 + 0.65 * (rr + 0.5) / (rows - 1)), 0.08, 0.96);
        var hem = it.trim && rr === rows - 2;
        quads.push({ a: a, b: b, d: d, e: e, back: ratio < 0, tone: tone, which: hem ? 3 : ratio < 0 ? 2 : 1 });
      }
      if (pixel) {   // pixel art: one tone per row and side, so the bands read as folds instead of speckle
        var rowT = {};
        for (var qa = 0; qa < quads.length; qa++) { var key = ((quads[qa].a / cols) | 0) + (quads[qa].back ? 'b' : 'f'); (rowT[key] = rowT[key] || []).push(quads[qa].tone); }
        for (var qb = 0; qb < quads.length; qb++) { var L2 = rowT[((quads[qb].a / cols) | 0) + (quads[qb].back ? 'b' : 'f')]; quads[qb].tone = L2.reduce(function (x, y) { return x + y; }, 0) / L2.length; }
      }
      quads.sort(function (q1, q2) { return (q1.back === q2.back) ? 0 : q1.back ? -1 : 1; });
      for (var qi = 0; qi < quads.length; qi++) {
        var q = quads[qi], col = fillFor(it, q.which, q.tone, pixel);
        ctx.beginPath(); ctx.moveTo(X(q.a), Y(q.a)); ctx.lineTo(X(q.b), Y(q.b)); ctx.lineTo(X(q.e), Y(q.e)); ctx.lineTo(X(q.d), Y(q.d)); ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
        ctx.lineWidth = pixel ? 1 / Math.max(0.25, sc || 1) : 0.8 / (sc || 1); ctx.strokeStyle = col; ctx.stroke();   // closes seams (pixel: no holes to outline)
      }
      // fold lines: a faint darker line down each inner column (reads as cloth, not a plate)
      if (!pixel && P.shade > 0 && cols > 2) {
        ctx.globalAlpha *= 0.28 * P.shade; ctx.lineWidth = Math.max(0.6 / (sc || 1), 0.7 * unit()); ctx.strokeStyle = ink;
        for (var fc = 1; fc < cols - 1; fc++) {
          ctx.beginPath(); ctx.moveTo(X(cols + fc), Y(cols + fc));
          for (var fr = 2; fr < rows - 1; fr++) ctx.lineTo(X(fr * cols + fc), Y(fr * cols + fc));
          ctx.stroke();
        }
      }
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (var i = 0; i < it.n; i++) { var xx = X(i), yy = Y(i); if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      var pad = olw + 1;
      return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
    }
    function bbox(C, w) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (var i = 0; i < C.x.length; i++) { if (C.x[i] < x0) x0 = C.x[i]; if (C.x[i] > x1) x1 = C.x[i]; if (C.y[i] < y0) y0 = C.y[i]; if (C.y[i] > y1) y1 = C.y[i]; }
      var p = w / 2 + 1; return { x: x0 - p, y: y0 - p, w: x1 - x0 + p * 2, h: y1 - y0 + p * 2 };
    }

    // pixel mode: rasterise at native px on a scratch canvas, hard alpha, 1 px ink outline, then blit on whole pixels
    function drawPixel(ctx, it, cam) {
      var doc = root.document;
      if (!scratch) {
        try { scratch = doc && doc.createElement ? doc.createElement('canvas') : null; scratchCtx = scratch ? scratch.getContext('2d', { willReadFrequently: true }) : null; } catch (e) { scratch = null; }
      }
      // native-px bbox of the shape (world coords minus camera), whole pixels
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (var i = 0; i < it.n; i++) { var xx = it.px[i] - cam.x, yy = it.py[i] - cam.y; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      // raster at whole native px (1 unit = 1 px); on a context drawn smaller than 1:1, at the device size instead
      var rs = 1;
      try { var m = ctx.getTransform ? ctx.getTransform() : null; if (m) { var sc0 = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)); if (sc0 > 0 && sc0 < 1) rs = sc0; } } catch (e) { }
      var pad = Math.ceil(it.width) + 3;
      var ux = Math.floor((x0 - pad) * rs) / rs, uy = Math.floor((y0 - pad) * rs) / rs;
      var bw = Math.ceil((x1 + pad - ux) * rs) + 1, bh = Math.ceil((y1 + pad - uy) * rs) + 1, bx = ux, by = uy;
      if (!scratchCtx || bw > 1024 || bh > 1024 || bw <= 0 || bh <= 0) return drawSmooth(ctx, it, cam);
      if (scratch.width < bw || scratch.height < bh) { scratch.width = Math.max(scratch.width, bw); scratch.height = Math.max(scratch.height, bh); }
      var g = scratchCtx;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.clearRect(0, 0, bw + 1, bh + 1);
      g.setTransform(rs, 0, 0, rs, 0, 0);
      palCollect = [];
      var cam2 = { x: cam.x + bx, y: cam.y + by };
      g.lineJoin = 'round'; g.lineCap = 'round';
      if (it.grid) drawGrid(g, it, cam2, true, 0, inkOf(it), rs);
      else if (it.kind === 'chain') {   // pixel chain: alternating two-tone links along the strand
        var lw = Math.max(2 / rs, it.width * 0.5);
        for (var li = 0; li < it.rows - 1; li++) {
          g.beginPath(); g.moveTo(it.px[li] - cam2.x, it.py[li] - cam2.y); g.lineTo(it.px[li + 1] - cam2.x, it.py[li + 1] - cam2.y);
          g.lineWidth = lw; g.lineCap = 'butt'; g.strokeStyle = fillFor(it, 1, li % 2 ? 0.3 : 0.78, true); g.stroke();
        }
      }
      else {
        var C = chainPts(it, cam2, 2);
        if (it.kind === 'rope') strokePath(g, C, Math.max(1 / rs, it.width), fillFor(it, 1, 0.5, true));
        else {
          var E = stripEdges(it, C), n = E.L.length, notch = (it.kind === 'scarf' || it.kind === 'ribbon') ? 1 : 0;
          for (var s = 0; s < n - 1; s++) {
            var which = (it.trim && C.f[s] >= 0.84) ? 3 : 1;
            g.beginPath(); g.moveTo(E.L[s][0], E.L[s][1]); g.lineTo(E.L[s + 1][0], E.L[s + 1][1]); g.lineTo(E.R[s + 1][0], E.R[s + 1][1]); g.lineTo(E.R[s][0], E.R[s][1]); g.closePath();
            g.fillStyle = fillFor(it, which, (E.tone[s] + E.tone[s + 1]) / 2, true); g.fill();
          }
          if (it.width * rs < 2.5) strokePath(g, C, 1 / rs, fillFor(it, 1, 0.5, true));
        }
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      var pal = []; var seenPal = {};
      for (var pc = 0; pc < palCollect.length; pc++) { var kk = palCollect[pc].map(Math.round).join(','); if (!seenPal[kk]) { seenPal[kk] = 1; pal.push(palCollect[pc].map(Math.round)); } }
      palCollect = null;
      var img = g.getImageData(0, 0, bw, bh), d = img.data, N = bw * bh, solid = new Uint8Array(N);
      for (var p = 0; p < N; p++) {
        var a = d[p * 4 + 3];
        if (a >= 110) {
          solid[p] = 1; var k = 255 / a, R = d[p * 4] * k, G2 = d[p * 4 + 1] * k, B = d[p * 4 + 2] * k;
          if (pal.length) {   // snap to the piece's own tones: no blended edge colours between quads
            var best = 0, bd = Infinity;
            for (var pi2 = 0; pi2 < pal.length; pi2++) { var c3 = pal[pi2], dd = (c3[0] - R) * (c3[0] - R) + (c3[1] - G2) * (c3[1] - G2) + (c3[2] - B) * (c3[2] - B); if (dd < bd) { bd = dd; best = pi2; } }
            R = pal[best][0]; G2 = pal[best][1]; B = pal[best][2];
          }
          d[p * 4] = Math.min(255, R); d[p * 4 + 1] = Math.min(255, G2); d[p * 4 + 2] = Math.min(255, B); d[p * 4 + 3] = 255;
        }
        else d[p * 4 + 3] = 0;
      }
      if (outlineOn(it, true) && it.width * rs >= 2.5) {
        var ink = parseHex(inkOf(it)) || [27, 20, 36];
        for (var yy2 = 0; yy2 < bh; yy2++) for (var xx2 = 0; xx2 < bw; xx2++) {
          var q = yy2 * bw + xx2; if (solid[q]) continue;
          if ((xx2 > 0 && solid[q - 1]) || (xx2 < bw - 1 && solid[q + 1]) || (yy2 > 0 && solid[q - bw]) || (yy2 < bh - 1 && solid[q + bw])) {
            d[q * 4] = ink[0]; d[q * 4 + 1] = ink[1]; d[q * 4 + 2] = ink[2]; d[q * 4 + 3] = 255;
          }
        }
      }
      g.putImageData(img, 0, 0);
      var sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      ctx.drawImage(scratch, 0, 0, bw, bh, bx, by, bw / rs, bh / rs);
      ctx.imageSmoothingEnabled = sm;
      return { x: x0 - 1, y: y0 - 1, w: x1 - x0 + 2, h: y1 - y0 + 2 };
    }

    // ------------------------------------------------------------------ events and queries
    function pick(idOrGroup) {
      if (idOrGroup == null) return order.map(function (k) { return items[k]; });
      var key = String(idOrGroup);
      if (items[key]) return [items[key]];
      return order.map(function (k) { return items[k]; }).filter(function (it) { return it.group === key; });
    }
    // impulse in px/s (screen units at scale 1), stronger toward the free end
    function impulse(idOrGroup, vx, vy) {
      vx = num(vx, 0); vy = num(vy, 0); if (!vx && !vy) return 0;
      var L = pick(idOrGroup), h = SUB / 1000, u = unit(), n = 0;
      for (var j = 0; j < L.length; j++) {
        var it = L[j]; if (!it.valid) continue;
        for (var i = 0; i < it.n; i++) {
          if (it.pin[i]) continue;
          var f = ((i / it.colsN) | 0) / Math.max(1, it.rows - 1);
          it.ox[i] -= vx * u * h * (0.35 + 0.65 * f); it.oy[i] -= vy * u * h * (0.35 + 0.65 * f);
        }
        n++;
      }
      S.impulses += n; return n;
    }
    function gust(strength, ms, dir) { extraGust = clamp(num(strength, 1), 0, 4); extraGustT = Math.max(0, num(ms, 600)); extraGustDir = num(dir, 1) < 0 ? -1 : 1; }
    function snap(idOrGroup) {
      var L = pick(idOrGroup), n = 0;
      for (var j = 0; j < L.length; j++) { var it = L[j], A = readAnchor(it); if (A === undefined) A = it.anchor; if (!A) { it.valid = false; continue; } it.anchor = it.prevAnchor = A; pose(it, A); it.visible = true; n++; }
      return n;
    }
    function clear() { for (var i = 0; i < order.length; i++) { var it = items[order[i]]; if (it) { it.valid = false; it.visible = false; } } acc = 0; extraGustT = 0; }
    function points(id) {
      var it = items[String(id)]; if (!it || !it.valid) return null;
      var out = []; for (var i = 0; i < it.n; i++) out.push({ x: it.px[i], y: it.py[i], pinned: !!it.pin[i] });
      return out;
    }
    function tip(id) {
      var it = items[String(id)]; if (!it || !it.valid) return null;
      var c = Math.floor((it.colsN - 1) / 2), i = (it.rows - 1) * it.colsN + c;
      return { x: it.px[i], y: it.py[i] };
    }
    function list() {
      return order.map(function (k) {
        var it = items[k], x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, finite = true, pinErr = 0;
        if (it.valid) for (var i = 0; i < it.n; i++) {
          var x = it.px[i], y = it.py[i]; if (!fin(x) || !fin(y)) { finite = false; continue; }
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (it.pin[i] && it.anchor) { var c = i % it.colsN, rc = Math.cos(it.pinRot || 0), rs = Math.sin(it.pinRot || 0), e = Math.hypot(x - (it.anchor.x + it.pinDx[c] * rc - it.pinDy[c] * rs), y - (it.anchor.y + it.pinDx[c] * rs + it.pinDy[c] * rc)); if (e > pinErr) pinErr = e; }
        }
        return { id: it.id, group: it.group, kind: it.kind, layer: it.layer || it.layerDef, visible: it.visible, valid: it.valid, n: it.n,
          length: it.len, width: it.width, anchor: it.anchor ? { x: it.anchor.x, y: it.anchor.y } : null, pinErr: pinErr, finite: finite,
          bbox: it.valid && x0 <= x1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null, maxStretch: it.maxStretch || 1, reach: it.reach || 0,
          maxReach: it.len * 1.3 + it.width * 1.2 + 2, snaps: it.snapped || 0 };
      });
    }
    function stats() { var o2 = {}; for (var k in S) o2[k] = S[k]; o2.items = order.length; o2.clock = clock; return o2; }
    function params() { var o2 = {}; for (var k in P) o2[k] = P[k]; return o2; }
    function lastDrawn() { var out = []; for (var k in lastDrawnRects) out.push(lastDrawnRects[k]); return out; }

    return {
      version: VERSION, attach: attach, detach: detach, detachGroup: detachGroup, has: function (id) { return !!items[String(id)]; },
      update: update, draw: draw, impulse: impulse, gust: gust, snap: snap, clear: clear, points: points, tip: tip,
      wind: function (x, y) { return windAt(clock / 1000, num(x, 0), num(y, 0)); },
      setParams: setParams, setLight: setLight, params: params, reduced: reduced, stats: stats, list: list, lastDrawn: lastDrawn,
      ids: function () { return order.slice(); }
    };
  }

  root.GameDNA_Cloth = { create: create, version: VERSION, kinds: Object.keys(KINDS), defaults: DEFAULTS };
})(typeof window !== 'undefined' ? window : this);
