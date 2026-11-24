/* GameDNA E-15 · Ribbon trails · module v1 (plain script, no dependencies, one global)
 *
 *   const trails = GameDNA_Ribbons.create({ params: { life: 220 }, scale: VIEW_H / 360 });
 *   trails.follow('hero-blade', { kind: 'blade', group: 'hero',
 *     source: () => hero.swinging ? { x: tipX, y: tipY, bx: hiltX, by: hiltY } : null });   // world px, or null
 *   trails.follow('bolt-7', { kind: 'projectile', once: true, source: () => bolt.alive ? { x: bolt.x, y: bolt.y } : null });
 *   // in the fixed step, AFTER things moved (0 while the world is frozen or paused):
 *   trails.update(STEP_MS);
 *   // in the draw pass (world coordinates minus the camera):
 *   trails.draw(ctx, camX, camY, 'under'); drawSprites(); trails.draw(ctx, camX, camY, 'over');
 *
 * Smooth tapered ribbons behind a sword tip, a dash or a projectile: the module samples each source once per update, keeps
 * the recent points with their age, and draws a centripetal Catmull-Rom ribbon through them whose width and alpha taper with
 * age, with an optional additive core and glow. A sword can give its hilt too (bx, by): then the ribbon is a swept band from
 * hilt to tip. Teleports (a jump much larger than the recent steps), scene changes (`space`), long gaps and a source that
 * returns null all start a new strip, so no line is ever drawn across the screen. It only READS the sources and only DRAWS:
 * no game state, hit box, timer, RNG or input is touched. Everything advances in update(dt) (no wall clock, no Math.random),
 * so ?t=&freeze=1 is deterministic.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0';
  var DEFAULTS = { life: 220, width: 1, taper: 1.3, fade: 1.2, core: 'on', glow: 0.5, smooth: 4, palette: 'steel',
    render: 'auto', reduced: 'system', teleport: 0, contrast: 'auto' };
  // per kind: life factor, width at scale 1 (px), body alpha, core share, glow share, head cap, minimum speed (px/s at scale 1), layer
  var KDEF = {
    blade:      { life: 0.8, width: 9,  alpha: 0.85, core: 0.32, glow: 1,   cap: true,  minSpeed: 60,  layer: 'over' },
    dash:       { life: 1.6, width: 22, alpha: 0.58, core: 0,    glow: 0.6, cap: false, minSpeed: 220, layer: 'under' },
    projectile: { life: 1.0, width: 7,  alpha: 0.9,  core: 0.4,  glow: 1,   cap: true,  minSpeed: 0,   layer: 'under' },
    wake:       { life: 2.2, width: 12, alpha: 0.36, core: 0,    glow: 0,   cap: false, minSpeed: 30,  layer: 'under' }
  };
  var KIND_ALIAS = { sword: 'blade', slash: 'blade', swing: 'blade', weapon: 'blade', tip: 'blade', lunge: 'dash', charge: 'dash',
    knockback: 'dash', bolt: 'projectile', arrow: 'projectile', bullet: 'projectile', shot: 'projectile', spell: 'projectile',
    orb: 'projectile', walk: 'wake', drift: 'wake', float: 'wake' };
  var PALETTES = {
    steel:  ['#eef6ff', '#5f7fd0', '#ffffff'],
    ember:  ['#ffd98a', '#e2452c', '#fff4cc'],
    arcane: ['#e2c6ff', '#5a3cc8', '#f6eeff'],
    frost:  ['#d2f6ff', '#3a8fd0', '#ffffff'],
    venom:  ['#dcff94', '#3f9a3a', '#f6ffe0'],
    gold:   ['#fff2b8', '#c88a1e', '#fffbea'],
    shadow: ['#4e3f74', '#120e20', '#8f80bc']
  };
  var DARK = { shadow: true };   // dark palettes: no additive glow, core blended normally, no under-shadow needed
  var MAX_PTS = 120;

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function fin(v) { return typeof v === 'number' && isFinite(v); }
  function parseCol(c) {
    if (typeof c !== 'string') return null;
    var s = c.trim(), m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (!m) { m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(s); return m ? [+m[1], +m[2], +m[3]] : null; }
    var h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16); return [n >> 16, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgba(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + clamp(a, 0, 1).toFixed(3) + ')'; }
  function smoothstep(a, b, x) { if (b <= a) return x >= b ? 1 : 0; var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  // centripetal Catmull-Rom (Barry-Goldman) for one coordinate, knots k0..k3, t in [k1, k2]
  function crv(p0, p1, p2, p3, k0, k1, k2, k3, t) {
    var a1 = (k1 - t) / (k1 - k0) * p0 + (t - k0) / (k1 - k0) * p1;
    var a2 = (k2 - t) / (k2 - k1) * p1 + (t - k1) / (k2 - k1) * p2;
    var a3 = (k3 - t) / (k3 - k2) * p2 + (t - k2) / (k3 - k2) * p3;
    var b1 = (k2 - t) / (k2 - k0) * a1 + (t - k0) / (k2 - k0) * a2;
    var b2 = (k3 - t) / (k3 - k1) * a2 + (t - k1) / (k3 - k1) * a3;
    return (k2 - t) / (k2 - k1) * b1 + (t - k1) / (k2 - k1) * b2;
  }

  function create(options) {
    var o = options || {};
    var SK = null;
    try { SK = (o.skin == null || o.skin === false || !root.GameDNA_Skin) ? null : root.GameDNA_Skin.resolve(o.skin); } catch (e) { SK = null; }
    var skinPixel = !!(SK && (SK.pixel || (SK.motion && SK.motion.snap)));
    var skinPal = null;
    if (SK && SK.palette) {
      try {
        var fx = SK.palette.fx || {}, look = function (v) { if (typeof v === 'string' && SK.lookup) { try { var r = SK.lookup(v); if (typeof r === 'string') return r; } catch (e) { } } return v; };
        var h = parseCol(look(fx.white)) || parseCol(look(SK.palette.text && SK.palette.text.accent)), t = parseCol(look(fx.cold)) || parseCol(look(fx.hot));
        if (h && t) skinPal = [h, t, mix(h, [255, 255, 255], 0.6)];
      } catch (e) { skinPal = null; }
    }
    var P = {};
    for (var k in DEFAULTS) P[k] = DEFAULTS[k];
    setParams(o.params || {});
    var scaleOpt = o.scale, viewOpt = o.view, camOpt = typeof o.camera === 'function' ? o.camera : null;
    var trails = {}, order = [], drawSeq = 0, lastDrawnRects = [];
    var ST = { updates: 0, draws: 0, sampled: 0, breaks: 0, spaceBreaks: 0, gapBreaks: 0, nullBreaks: 0, cuts: 0, maxGap: 0,
      sourceErrors: 0, drawErrors: 0, badInput: 0, removed: 0, offscreen: 0, quads: 0, pixelDraws: 0, selfAdvanced: 0, arcSamples: 0, contrastChecks: 0, brightDraws: 0 };
    var buf = null, bctx = null;

    function setParams(q) {
      if (!q || typeof q !== 'object') return;
      for (var key in q) {
        if (!(key in DEFAULTS)) continue;
        var v = q[key];
        if (typeof DEFAULTS[key] === 'number') { v = +v; if (!isFinite(v)) { ST && ST.badInput++; continue; } }
        else v = String(v);
        P[key] = v;
      }
      P.life = clamp(P.life, 40, 2000); P.width = clamp(P.width, 0.1, 4); P.taper = clamp(P.taper, 0, 4); P.fade = clamp(P.fade, 0, 4);
      P.glow = clamp(P.glow, 0, 1.5); P.smooth = Math.round(clamp(P.smooth, 1, 10)); P.teleport = Math.max(0, P.teleport);
    }
    function scale() {
      var s = typeof scaleOpt === 'function' ? (function () { try { return scaleOpt(); } catch (e) { return 1; } })() : scaleOpt;
      if (fin(s) && s > 0) return s;
      if (viewOpt && fin(+viewOpt.h) && viewOpt.h > 0) return viewOpt.h / 360;
      return 1;
    }
    function reduced() {
      if (P.reduced === 'on') return true;
      if (P.reduced === 'off') return false;
      try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
    }
    function paletteOf(tr) {
      var base = P.palette === 'skin' ? (skinPal || PALETTES.steel.map(parseCol)) : (PALETTES[P.palette] || PALETTES.steel).map(parseCol);
      var h = parseCol(tr.color) || base[0], t = parseCol(tr.color2) || (tr.color ? mix(h, [20, 24, 40], 0.55) : base[1]);
      var c = parseCol(tr.coreColor) || (tr.color ? mix(h, [255, 255, 255], 0.7) : base[2]);
      var out = [h, t, c]; out.dark = !tr.color && P.palette !== 'skin' && !!DARK[P.palette];
      return out;
    }

    function follow(id, opts) {
      if (id == null) { ST.badInput++; return null; }
      id = String(id); opts = opts || {};
      var tr = trails[id];
      if (!tr) {
        tr = trails[id] = { id: id, strips: [], open: false, last: null, ema: 0, k: 0, space: undefined, active: false, everActive: false,
          removing: false, maxGap: 0, head: null, alpha: 1, bbox: null };
        order.push(id);
      }
      var kind = String(opts.kind || tr.kind || 'blade').toLowerCase(); kind = KIND_ALIAS[kind] || kind; if (!KDEF[kind]) { kind = 'blade'; ST.badInput++; }
      tr.kind = kind;
      if ('source' in opts) tr.source = opts.source;
      var keys = ['group', 'layer', 'color', 'color2', 'coreColor', 'width', 'life', 'minSpeed', 'teleport', 'alpha', 'blend', 'core', 'glow', 'once'];
      for (var i = 0; i < keys.length; i++) if (keys[i] in opts) tr[keys[i] === 'alpha' ? 'alphaMul' : keys[i]] = opts[keys[i]];
      if (tr.group == null) tr.group = id;
      tr.removing = false;
      return id;
    }
    function remove(id, now) {
      var tr = trails[String(id)]; if (!tr) return false;
      if (now) { delete trails[tr.id]; order.splice(order.indexOf(tr.id), 1); ST.removed++; return true; }
      tr.removing = true; tr.open = false; return true;
    }
    function lifeOf(tr) { var L = fin(+tr.life) && tr.life > 0 ? +tr.life : P.life * KDEF[tr.kind].life; return reduced() ? L * 0.6 : L; }
    function sample(tr) {
      if (tr.removing || typeof tr.source !== 'function') return null;
      var s;
      try { s = tr.source(); } catch (e) { ST.sourceErrors++; return null; }
      if (!s || s.visible === false || s.active === false) return null;
      var x = +s.x, y = +s.y;
      if (!isFinite(x) || !isFinite(y)) { ST.badInput++; return null; }
      var p = { x: x, y: y, age: 0, k: 1 };
      if (s.bx != null && s.by != null && isFinite(+s.bx) && isFinite(+s.by)) { p.bx = +s.bx; p.by = +s.by; }
      p.space = s.space; p.alpha = fin(+s.alpha) ? clamp(+s.alpha, 0, 1) : 1; p.cut = !!s.cut;
      return p;
    }
    function teleportOf(tr, sc) {
      var base = fin(+tr.teleport) && tr.teleport > 0 ? +tr.teleport : (P.teleport > 0 ? P.teleport : 72 * sc);
      return Math.max(base, tr.ema * 3.5);
    }
    function breakStrip(tr, why) {
      if (tr.open) { ST.breaks++; if (why) ST[why]++; }
      tr.open = false; tr.last = null; tr.ema = 0;
    }
    function update(dt) {
      dt = +dt;
      if (!isFinite(dt) || dt < 0) { ST.badInput++; dt = 0; }
      ST.updates++;
      var sc = scale();
      for (var oi = order.length - 1; oi >= 0; oi--) {
        var tr = trails[order[oi]], life = lifeOf(tr);
        if (dt > 0) {
          for (var si = tr.strips.length - 1; si >= 0; si--) {
            var pts = tr.strips[si];
            for (var j = 0; j < pts.length; j++) pts[j].age += dt;
            var cutN = 0; while (cutN < pts.length && pts[cutN].age >= life) cutN++;
            // keep one expired point as the fading tail end while the next one is still alive
            if (cutN > 0 && cutN < pts.length) cutN--;
            if (cutN) pts.splice(0, cutN);
            if (pts.length === 0 || (pts.length === 1 && pts[0].age >= life)) { tr.strips.splice(si, 1); if (tr.open && si === tr.strips.length) tr.open = false; }
          }
        }
        if (dt === 0) continue;               // frozen (hit-stop, pause): nothing ages, nothing is sampled
        if (dt > life) breakStrip(tr, 'gapBreaks');
        var p = sample(tr);
        tr.active = !!p;
        if (!p) {
          if (tr.open) breakStrip(tr, 'nullBreaks');
          if (tr.once && tr.everActive && !tr.strips.length) tr.removing = true;
          if (tr.removing && !tr.strips.length) { delete trails[tr.id]; order.splice(oi, 1); ST.removed++; }
          continue;
        }
        tr.everActive = true; ST.sampled++;
        tr.head = { x: p.x, y: p.y }; tr.alpha = p.alpha;
        var L = tr.last;
        if (tr.open && L) {
          var d = Math.hypot(p.x - L.x, p.y - L.y);
          if (p.bx != null && L.bx != null) d = Math.max(d, Math.hypot(p.bx - L.bx, p.by - L.by) * 0.5);
          if (p.cut) breakStrip(tr, null);
          else if (p.space !== tr.space) breakStrip(tr, 'spaceBreaks');
          else if (d > teleportOf(tr, sc)) breakStrip(tr, null);
        }
        tr.space = p.space;
        var speed = 0;
        if (tr.open && tr.last) {
          var dd = Math.hypot(p.x - tr.last.x, p.y - tr.last.y);
          speed = dd / (dt / 1000) / sc;
          tr.ema = tr.ema ? tr.ema * 0.7 + dd * 0.3 : dd;
        }
        var ms = fin(+tr.minSpeed) ? +tr.minSpeed : KDEF[tr.kind].minSpeed;
        var kT = ms > 0 ? smoothstep(ms * 0.6, ms * 1.2, speed) : 1;
        tr.k = tr.open ? tr.k + (kT - tr.k) * (kT > tr.k ? 0.7 : 0.35) : (ms > 0 ? 0 : 1);
        p.k = tr.k * p.alpha;
        if (!tr.open) {
          tr.strips.push([p]); tr.open = true; tr.last = p;
          continue;
        }
        var cur = tr.strips[tr.strips.length - 1];
        var moved = Math.hypot(p.x - tr.last.x, p.y - tr.last.y) + (p.bx != null && tr.last.bx != null ? Math.hypot(p.bx - tr.last.bx, p.by - tr.last.by) : 0);
        if (moved < 0.35 * sc && cur.length > 1) {         // standing still: the head stays put, the tail drains into it
          var hd = cur[cur.length - 1]; hd.x = p.x; hd.y = p.y; hd.bx = p.bx; hd.by = p.by; hd.age = 0; hd.k = p.k;
        } else {
          var L0 = tr.last;
          if (p.bx != null && L0.bx != null) {
            // fast swing: add samples along the arc around the hilt (blade angle and length interpolated), not along the chord
            var travel = Math.hypot(p.x - L0.x, p.y - L0.y), nIns = Math.min(8, Math.ceil(travel / (12 * sc)) - 1);
            if (nIns > 0) {
              var a0 = Math.atan2(L0.y - L0.by, L0.x - L0.bx), a1 = Math.atan2(p.y - p.by, p.x - p.bx), da = a1 - a0;
              while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
              var l0 = Math.hypot(L0.x - L0.bx, L0.y - L0.by), l1 = Math.hypot(p.x - p.bx, p.y - p.by);
              for (var q = 1; q <= nIns; q++) {
                var f = q / (nIns + 1), hx = L0.bx + (p.bx - L0.bx) * f, hy = L0.by + (p.by - L0.by) * f, an = a0 + da * f, ln = l0 + (l1 - l0) * f;
                cur.push({ x: hx + Math.cos(an) * ln, y: hy + Math.sin(an) * ln, bx: hx, by: hy, age: L0.age * (1 - f), k: L0.k + (p.k - L0.k) * f, alpha: p.alpha, space: p.space });
                ST.arcSamples++;
              }
            }
          }
          cur.push(p);
          if (cur.length > MAX_PTS) cur.splice(0, cur.length - MAX_PTS);
        }
        tr.last = p;
      }
    }

    // ---------------------------------------------------------------- geometry
    function build(tr, pts, life, cx, cy, sc) {
      // splits the strip wherever two raw points are farther apart than the teleport distance (draw-time safety net)
      var tele = teleportOf(tr, sc) * 1.5 + 2, runs = [], run = [pts[0]];
      for (var i = 1; i < pts.length; i++) {
        var g = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (g > tele) { ST.cuts++; runs.push(run); run = [pts[i]]; continue; }
        if (g > tr.maxGap) tr.maxGap = g;
        if (g > ST.maxGap) ST.maxGap = g;
        run.push(pts[i]);
      }
      runs.push(run);
      var out = [];
      for (var r = 0; r < runs.length; r++) if (runs[r].length >= 2) out.push(spline(runs[r], life, cx, cy, sc));
      return out;
    }
    function spline(pts, life, cx, cy, sc) {
      var n = pts.length, band = pts[0].bx != null, S = [];
      var ext = function (i) {
        if (i >= 0 && i < n) return pts[i];
        var a = i < 0 ? pts[0] : pts[n - 1], b = i < 0 ? pts[1] : pts[n - 2];
        return { x: 2 * a.x - b.x, y: 2 * a.y - b.y, bx: band ? 2 * a.bx - b.bx : 0, by: band ? 2 * a.by - b.by : 0 };
      };
      for (var i = 0; i < n - 1; i++) {
        var p0 = ext(i - 1), p1 = pts[i], p2 = pts[i + 1], p3 = ext(i + 2);
        var k0 = 0, k1 = k0 + Math.max(1e-3, Math.sqrt(Math.hypot(p1.x - p0.x, p1.y - p0.y))),
          k2 = k1 + Math.max(1e-3, Math.sqrt(Math.hypot(p2.x - p1.x, p2.y - p1.y))), k3 = k2 + Math.max(1e-3, Math.sqrt(Math.hypot(p3.x - p2.x, p3.y - p2.y)));
        var len = Math.hypot(p2.x - p1.x, p2.y - p1.y) + (band && p1.bx != null && p2.bx != null ? 0.5 * Math.hypot(p2.bx - p1.bx, p2.by - p1.by) : 0);
        var m = clamp(Math.ceil(len / (3 * sc)), 1, P.smooth);
        for (var s = 0; s < m; s++) {
          var f = s / m, t = k1 + (k2 - k1) * f, q = {
            x: crv(p0.x, p1.x, p2.x, p3.x, k0, k1, k2, k3, t) - cx, y: crv(p0.y, p1.y, p2.y, p3.y, k0, k1, k2, k3, t) - cy,
            age: p1.age + (p2.age - p1.age) * f, k: p1.k + (p2.k - p1.k) * f };
          if (band && p1.bx != null && p2.bx != null) {
            q.bx = crv(p0.bx, p1.bx, p2.bx, p3.bx, k0, k1, k2, k3, t) - cx; q.by = crv(p0.by, p1.by, p2.by, p3.by, k0, k1, k2, k3, t) - cy;
          }
          S.push(q);
        }
      }
      var e = pts[n - 1]; S.push({ x: e.x - cx, y: e.y - cy, bx: e.bx != null ? e.bx - cx : undefined, by: e.by != null ? e.by - cy : undefined, age: e.age, k: e.k });
      for (var j = 0; j < S.length; j++) S[j].u = clamp(S[j].age / life, 0, 1);
      return S;
    }
    // edges of one spline: returns {L, R, a, w, col} per sample (R = the hilt edge for a swept band)
    function edges(tr, S, sc, widthMul) {
      var kd = KDEF[tr.kind], pal = paletteOf(tr);
      var W = (fin(+tr.width) && tr.width > 0 ? +tr.width : kd.width * sc * P.width) * widthMul;
      var A = kd.alpha * (fin(+tr.alphaMul) ? clamp(+tr.alphaMul, 0, 1) : 1);
      var out = [], n = S.length;
      for (var i = 0; i < n; i++) {
        var s = S[i], a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)];
        var dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1;
        var nx = -dy / dl, ny = dx / dl, life = Math.pow(1 - s.u, P.taper), al = A * s.k * Math.pow(1 - s.u, P.fade);
        var e = { x: s.x, y: s.y, a: al, col: mix(pal[0], pal[1], Math.pow(s.u, 0.8)), core: pal[2], dx: dx / dl, dy: dy / dl,
          shade: mix(pal[1], [8, 10, 22], 0.62), dark: pal.dark };
        if (s.bx != null) {   // swept band: the hilt edge slides toward the tip as the band ages
          var sh = life * Math.max(0.25, s.k);
          e.L = [s.x, s.y]; e.R = [s.x + (s.bx - s.x) * sh, s.y + (s.by - s.y) * sh]; e.w = Math.hypot(e.R[0] - s.x, e.R[1] - s.y); e.band = true;
          e.nx = nx; e.ny = ny;
        } else {
          var hw = Math.max(0.5 / Math.max(1, 1 / sc), W * life * Math.max(0.3, s.k)) / 2;
          e.L = [s.x + nx * hw, s.y + ny * hw]; e.R = [s.x - nx * hw, s.y - ny * hw]; e.w = hw * 2; e.nx = nx; e.ny = ny;
        }
        out.push(e);
      }
      return out;
    }

    // ---------------------------------------------------------------- drawing
    function getBuf(w, h) {
      if (!buf) {
        try {
          if (root.document && root.document.createElement) buf = root.document.createElement('canvas');
          else if (typeof root.OffscreenCanvas === 'function') buf = new root.OffscreenCanvas(w, h);
        } catch (e) { buf = null; }
        if (!buf) return null;
        bctx = buf.getContext('2d', { willReadFrequently: true });
        if (!bctx) { buf = null; return null; }
      }
      if (buf.width < w || buf.height < h) { buf.width = Math.max(buf.width, Math.ceil(w)); buf.height = Math.max(buf.height, Math.ceil(h)); }
      return bctx;
    }
    function quads(c, E, alphaMul, colKey, which, glowW) {
      // fills each segment with its own colour and alpha; drawn with 'lighter' on an empty buffer (or additively on the game),
      // shared edges add up to exactly one coverage, so there are no seams
      for (var i = 0; i < E.length - 1; i++) {
        var p = E[i], q = E[i + 1], a = (p.a + q.a) / 2 * alphaMul;
        if (a <= 0.004) continue;
        var col = colKey === 'core' ? p.core : colKey === 'shade' ? p.shade : mix(p.col, q.col, 0.5);
        var L0 = p.L, R0 = p.R, L1 = q.L, R1 = q.R;
        if (which === 'core') {
          if (p.band) { // a thin bright line along the tip edge
            var cw0 = Math.max(0.6, p.w * 0.16) , cw1 = Math.max(0.6, q.w * 0.16);
            var ux0 = (p.R[0] - p.x) / (p.w || 1), uy0 = (p.R[1] - p.y) / (p.w || 1), ux1 = (q.R[0] - q.x) / (q.w || 1), uy1 = (q.R[1] - q.y) / (q.w || 1);
            L0 = [p.x, p.y]; R0 = [p.x + ux0 * cw0, p.y + uy0 * cw0]; L1 = [q.x, q.y]; R1 = [q.x + ux1 * cw1, q.y + uy1 * cw1];
          } else {
            var f = glowW;
            L0 = [p.x + (p.L[0] - p.x) * f, p.y + (p.L[1] - p.y) * f]; R0 = [p.x + (p.R[0] - p.x) * f, p.y + (p.R[1] - p.y) * f];
            L1 = [q.x + (q.L[0] - q.x) * f, q.y + (q.L[1] - q.y) * f]; R1 = [q.x + (q.R[0] - q.x) * f, q.y + (q.R[1] - q.y) * f];
          }
        } else if (which === 'glow') {
          var g0 = p.band ? p.w * 0.5 + 3 : p.w * glowW / 2, g1 = q.band ? q.w * 0.5 + 3 : q.w * glowW / 2;
          var m0x = p.band ? (p.x + p.R[0]) / 2 : p.x, m0y = p.band ? (p.y + p.R[1]) / 2 : p.y, m1x = q.band ? (q.x + q.R[0]) / 2 : q.x, m1y = q.band ? (q.y + q.R[1]) / 2 : q.y;
          L0 = [m0x + p.nx * g0, m0y + p.ny * g0]; R0 = [m0x - p.nx * g0, m0y - p.ny * g0]; L1 = [m1x + q.nx * g1, m1y + q.ny * g1]; R1 = [m1x - q.nx * g1, m1y - q.ny * g1];
        }
        c.fillStyle = rgba(col, a);
        c.beginPath(); c.moveTo(L0[0], L0[1]); c.lineTo(L1[0], L1[1]); c.lineTo(R1[0], R1[1]); c.lineTo(R0[0], R0[1]); c.closePath(); c.fill();
        ST.quads++;
      }
    }
    function cap(c, E, alphaMul, colKey, f) {
      var h = E[E.length - 1]; if (!h || h.band) return;
      var r = h.w / 2 * f, a = h.a * alphaMul; if (r < 0.3 || a <= 0.004) return;
      var ang = Math.atan2(h.dy, h.dx);
      c.fillStyle = rgba(colKey === 'core' ? h.core : colKey === 'shade' ? h.shade : h.col, a);
      c.beginPath(); c.arc(h.x, h.y, r, ang - Math.PI / 2, ang + Math.PI / 2); c.closePath(); c.fill();
    }
    function wantPixel(ctx) {
      if (P.render === 'pixel') return true;
      if (P.render === 'smooth') return false;
      if (skinPixel) return true;
      return ctx.imageSmoothingEnabled === false;
    }
    function matches(tr, which) {
      if (which == null || which === 'all') return true;
      if (typeof which === 'function') { try { return !!which(tr.group, tr.id); } catch (e) { return false; } }
      if (Array.isArray(which)) { for (var i = 0; i < which.length; i++) if (matches(tr, which[i])) return true; return false; }
      var layer = tr.layer || KDEF[tr.kind].layer;
      if (which === 'under' || which === 'over') return layer === which;
      return String(which) === String(tr.group) || String(which) === tr.id;
    }
    function draw(ctx, camX, camY, which) {
      if (!ctx || typeof ctx.beginPath !== 'function') { ST.badInput++; return; }
      ST.draws++; drawSeq++;
      if (!fin(camX) || !fin(camY)) {
        if (camOpt) { var cm = null; try { cm = camOpt(); } catch (e) { cm = null; } camX = cm && fin(+cm.x) ? +cm.x : 0; camY = cm && fin(+cm.y) ? +cm.y : 0; }
        else { camX = 0; camY = 0; }
      }
      var sc = scale(), red = reduced(), list = [];
      try {
        for (var oi = 0; oi < order.length; oi++) {
          var tr = trails[order[oi]];
          if (!tr || !tr.strips.length || !matches(tr, which)) continue;
          var life = lifeOf(tr), splines = [];
          for (var si = 0; si < tr.strips.length; si++) if (tr.strips[si].length >= 2) {
            var b = build(tr, tr.strips[si], life, camX, camY, sc);
            for (var bi = 0; bi < b.length; bi++) splines.push(edges(tr, b[bi], sc, 1));
          }
          if (splines.length) list.push({ tr: tr, E: splines });
        }
      } catch (e) { ST.drawErrors++; return; }
      if (!list.length) { lastDrawnRects = lastDrawnRects.filter(function (r) { return r.seq > drawSeq - 2; }); return; }
      var pixel = wantPixel(ctx);
      for (var ci = 0; ci < list.length; ci++) list[ci].bright = brightUnder(ctx, list[ci]);
      try {
        ctx.save();
        if (pixel) drawPixel(ctx, list, red); else drawSmooth(ctx, list, red);
      } catch (e) { ST.drawErrors++; }
      try { ctx.restore(); } catch (e) { }
      // what was drawn, in the caller's draw coordinates
      // one rect per drawn strip (a ribbon can hold several strips after a break); the ribbon's bbox is their union
      var rects = [];
      for (var i = 0; i < list.length; i++) {
        var t = list[i].tr, hd = t.head ? { x: t.head.x - camX, y: t.head.y - camY } : null, last = list[i].E.length - 1;
        var ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
        for (var s = 0; s < list[i].E.length; s++) {
          var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (var j = 0; j < list[i].E[s].length; j++) {
            var e = list[i].E[s][j]; if (e.a <= 0.01) continue;
            x0 = Math.min(x0, e.L[0], e.R[0]); y0 = Math.min(y0, e.L[1], e.R[1]); x1 = Math.max(x1, e.L[0], e.R[0]); y1 = Math.max(y1, e.L[1], e.R[1]);
          }
          if (x0 === Infinity) continue;
          ux0 = Math.min(ux0, x0); uy0 = Math.min(uy0, y0); ux1 = Math.max(ux1, x1); uy1 = Math.max(uy1, y1);
          rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, owner: t.group, id: t.id, kind: t.kind, strip: s, head: s === last ? hd : null,
            active: s === last && !!t.active, bright: !!list[i].bright, seq: drawSeq });
        }
        if (ux0 < Infinity) t.bbox = { x: ux0, y: uy0, w: ux1 - ux0, h: uy1 - uy0 };
      }
      lastDrawnRects = lastDrawnRects.filter(function (r) { return r.seq > drawSeq - 2; }).concat(rects);
    }
    // contrast: 'auto' samples the backdrop under the ribbon (16x16 device px around its box centre) once per 12 draws per ribbon
    function brightUnder(ctx, item) {
      var tr = item.tr, E0 = item.E[0];
      if (E0 && E0[0] && E0[0].dark) return false;
      if (P.contrast === 'on') return true;
      if (P.contrast !== 'auto') return false;
      if (tr.brightAt != null && drawSeq - tr.brightAt < 12) return tr.bright;
      tr.brightAt = drawSeq; tr.bright = false;
      try {
        var m = ctx.getTransform ? ctx.getTransform() : null; if (!m || !ctx.getImageData) return false;
        var sx = 0, sy = 0, n = 0;
        for (var s = 0; s < item.E.length; s++) for (var j = 0; j < item.E[s].length; j += 2) { sx += item.E[s][j].x; sy += item.E[s][j].y; n++; }
        if (!n) return false;
        var X = m.a * sx / n + m.c * sy / n + m.e, Y = m.b * sx / n + m.d * sy / n + m.f, cw = ctx.canvas.width, ch = ctx.canvas.height;
        var x = Math.round(clamp(X - 8, 0, cw - 16)), y = Math.round(clamp(Y - 8, 0, ch - 16));
        if (cw < 16 || ch < 16) return false;
        var d = ctx.getImageData(x, y, 16, 16).data, lum = 0;
        for (var q = 0; q < d.length; q += 4) lum += 0.2126 * d[q] + 0.7152 * d[q + 1] + 0.0722 * d[q + 2];
        ST.contrastChecks++;
        tr.bright = lum / (d.length / 4) > 140;
      } catch (e) { tr.bright = false; }
      return tr.bright;
    }
    // the under-shadow: the body shifted down by ~1.5 px at scale 1, in a dark tone of the tail colour
    function shifted(E, dy) {
      return E.map(function (e) {
        var o = {}; for (var k in e) o[k] = e[k];
        o.x = e.x; o.y = e.y + dy; o.L = [e.L[0], e.L[1] + dy]; o.R = [e.R[0], e.R[1] + dy]; return o;
      });
    }
    function blendOf(tr) { return tr.blend === 'add' ? 'lighter' : 'source-over'; }
    function drawSmooth(ctx, list, red) {
      var m = null; try { m = ctx.getTransform ? ctx.getTransform() : null; } catch (e) { m = null; }
      var glowK = red ? 0 : P.glow, coreOn = P.core !== 'off';
      var sc = scale();
      // 0) under-shadow on bright backdrops (contrast), normal blending through the same seamless buffer
      for (var z = 0; z < list.length; z++) {
        if (!list[z].bright) continue;
        ST.brightDraws++;
        var Es = list[z].E.map(function (E) { return shifted(E, 1.6 * sc + 0.5); }), cz = m ? bodyBuffer(ctx, m, Es) : null;
        if (!cz) continue;
        cz.globalCompositeOperation = 'lighter';
        for (var zs = 0; zs < Es.length; zs++) { quads(cz, Es[zs], 0.7, 'shade', 'body', 1); cap(cz, Es[zs], 0.7, 'shade', 1); }
        ctx.globalCompositeOperation = 'source-over'; ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(buf, 0, 0, cz.__w, cz.__h, cz.__x, cz.__y, cz.__w, cz.__h); ctx.setTransform(m);
      }
      // 1) glow: additive, straight onto the game (additive quads have no seams); not on bright backdrops or dark palettes
      if (glowK > 0) {
        ctx.globalCompositeOperation = 'lighter';
        for (var i = 0; i < list.length; i++) {
          if (list[i].bright || (list[i].E[0][0] && list[i].E[0][0].dark)) continue;
          var g = KDEF[list[i].tr.kind].glow * (list[i].tr.glow != null ? clamp(+list[i].tr.glow || 0, 0, 1.5) : 1);
          if (g <= 0) continue;
          for (var s = 0; s < list[i].E.length; s++) quads(ctx, list[i].E[s], 0.16 * glowK * g, 'col', 'glow', 2.4);
        }
      }
      // 2) body: per-segment quads added into an empty buffer, then composited once (normal blending without seams)
      for (var b = 0; b < list.length; b++) {
        var tr = list[b].tr, E = list[b].E;
        var c = m ? bodyBuffer(ctx, m, E) : null;
        if (c) {
          c.globalCompositeOperation = 'lighter';
          for (var s2 = 0; s2 < E.length; s2++) { quads(c, E[s2], 1, 'col', 'body', 1); cap(c, E[s2], 1, 'col', 1); }
          ctx.globalCompositeOperation = blendOf(tr);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(buf, 0, 0, c.__w, c.__h, c.__x, c.__y, c.__w, c.__h);
          ctx.setTransform(m);
        } else {
          ctx.globalCompositeOperation = blendOf(tr);
          for (var s3 = 0; s3 < E.length; s3++) { quads(ctx, E[s3], 1, 'col', 'body', 1); cap(ctx, E[s3], 1, 'col', 1); }
        }
      }
      // 3) core: a thin additive line along the middle (or the band's tip edge)
      if (coreOn) {
        for (var k = 0; k < list.length; k++) {
          var kc = (list[k].tr.core === false || list[k].tr.core === 'off') ? 0 : KDEF[list[k].tr.kind].core;
          if (kc <= 0) continue;
          var dk = list[k].E[0][0] && list[k].E[0][0].dark, ca = (red ? 0.6 : 0.95) * (dk ? 0.5 : 1);
          ctx.globalCompositeOperation = dk ? 'source-over' : 'lighter';
          for (var s4 = 0; s4 < list[k].E.length; s4++) { quads(ctx, list[k].E[s4], ca, 'core', 'core', kc); cap(ctx, list[k].E[s4], ca, 'core', kc); }
        }
      }
    }
    function bodyBuffer(ctx, m, Es) {
      // device-pixel box of the strips (clipped to the canvas), buffer cleared and set to draw in the caller's coordinates
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (var s = 0; s < Es.length; s++) for (var i = 0; i < Es[s].length; i++) {
        var e = Es[s][i], P2 = [e.L, e.R];
        for (var j = 0; j < 2; j++) {
          var X = m.a * P2[j][0] + m.c * P2[j][1] + m.e, Y = m.b * P2[j][0] + m.d * P2[j][1] + m.f;
          if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
        }
      }
      var cw = ctx.canvas ? ctx.canvas.width : 4096, ch = ctx.canvas ? ctx.canvas.height : 4096, pad = 3 + Math.hypot(m.a, m.b) * 2;
      x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad)); x1 = Math.min(cw, Math.ceil(x1 + pad)); y1 = Math.min(ch, Math.ceil(y1 + pad));
      if (!(x1 > x0 && y1 > y0)) { ST.offscreen++; return null; }
      var w = x1 - x0, h = y1 - y0;
      if (w * h > 4096 * 4096) return null;
      var c = getBuf(w, h); if (!c) return null;
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      c.clearRect(0, 0, w + 2, h + 2);
      c.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0);
      c.__x = x0; c.__y = y0; c.__w = w; c.__h = h;
      return c;
    }
    function drawPixel(ctx, list, red) {
      // the strips are rasterised at the game's own pixel size, alpha quantised to 3 hard steps, then scaled up without smoothing;
      // on a bright backdrop a dark under-shadow raster goes first (1 game px down)
      var shade = list.filter(function (it) { return it.bright; });
      if (shade.length) {
        ST.brightDraws += shade.length;
        pixelPass(ctx, shade.map(function (it) { return { tr: it.tr, E: it.E.map(function (E) { return shifted(E, 1); }), shade: true }; }), red);
      }
      pixelPass(ctx, list, red);
    }
    function pixelPass(ctx, list, red) {
      ST.pixelDraws++;
      var m = null; try { m = ctx.getTransform ? ctx.getTransform() : null; } catch (e) { m = null; }
      if (!m) m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      var px = Math.max(1, Math.round(Math.hypot(m.a, m.b)));   // device px per game px
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (var i = 0; i < list.length; i++) for (var s = 0; s < list[i].E.length; s++) for (var j = 0; j < list[i].E[s].length; j++) {
        var e = list[i].E[s][j];
        x0 = Math.min(x0, e.L[0], e.R[0]); y0 = Math.min(y0, e.L[1], e.R[1]); x1 = Math.max(x1, e.L[0], e.R[0]); y1 = Math.max(y1, e.L[1], e.R[1]);
      }
      x0 = Math.floor(x0) - 2; y0 = Math.floor(y0) - 2; x1 = Math.ceil(x1) + 2; y1 = Math.ceil(y1) + 2;
      var w = x1 - x0, h = y1 - y0;
      if (w <= 0 || h <= 0 || w * h > 1024 * 1024) return;
      var c = getBuf(w, h); if (!c) return;
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, w + 2, h + 2);
      c.setTransform(1, 0, 0, 1, -x0, -y0); c.globalCompositeOperation = 'lighter';
      var coreOn = P.core !== 'off';
      for (var b = 0; b < list.length; b++) {
        var tr = list[b].tr, kc = (tr.core === false || tr.core === 'off' || !coreOn) ? 0 : KDEF[tr.kind].core;
        for (var s2 = 0; s2 < list[b].E.length; s2++) {
          if (list[b].shade) { quads(c, list[b].E[s2], 0.6, 'shade', 'body', 1); cap(c, list[b].E[s2], 0.6, 'shade', 1); continue; }
          quads(c, list[b].E[s2], 1, 'col', 'body', 1); cap(c, list[b].E[s2], 1, 'col', 1);
          if (kc > 0) quads(c, list[b].E[s2], red ? 0.5 : 0.8, 'core', 'core', Math.max(kc, 0.45));
        }
      }
      var img; try { img = c.getImageData(0, 0, w, h); } catch (e) { return; }
      var d = img.data;
      for (var q = 3; q < d.length; q += 4) {
        var a = d[q] / 255;
        d[q] = a < 0.14 ? 0 : a < 0.42 ? 110 : a < 0.72 ? 185 : 255;
      }
      c.setTransform(1, 0, 0, 1, 0, 0); c.putImageData(img, 0, 0);
      var smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(buf, 0, 0, w, h, x0, y0, w, h);
      ctx.imageSmoothingEnabled = smooth;
      void px;
    }

    // ---------------------------------------------------------------- queries
    function cut(id) { var tr = trails[String(id)]; if (tr) breakStrip(tr, null); }
    function clear(id) {
      var ids = id == null ? order.slice() : [String(id)];
      for (var i = 0; i < ids.length; i++) { var tr = trails[ids[i]]; if (!tr) continue; tr.strips = []; tr.open = false; tr.last = null; tr.ema = 0; tr.k = 0; }
    }
    function list() {
      var out = [];
      for (var i = 0; i < order.length; i++) {
        var tr = trails[order[i]], pts = 0, oldest = 0;
        for (var s = 0; s < tr.strips.length; s++) { pts += tr.strips[s].length; if (tr.strips[s].length) oldest = Math.max(oldest, tr.strips[s][0].age); }
        out.push({ id: tr.id, group: tr.group, kind: tr.kind, layer: tr.layer || KDEF[tr.kind].layer, active: tr.active, head: tr.head,
          strips: tr.strips.length, points: pts, oldest: Math.round(oldest), life: Math.round(lifeOf(tr)), maxGap: Math.round(tr.maxGap * 10) / 10,
          teleport: Math.round(teleportOf(tr, scale())), bbox: tr.bbox, removing: !!tr.removing });
      }
      return out;
    }
    function stats() {
      var o = {}; for (var k in ST) o[k] = ST[k];
      o.trails = order.length; o.strips = 0; o.points = 0;
      for (var i = 0; i < order.length; i++) { var tr = trails[order[i]]; o.strips += tr.strips.length; for (var s = 0; s < tr.strips.length; s++) o.points += tr.strips[s].length; }
      o.maxGap = Math.round(o.maxGap * 10) / 10;
      return o;
    }
    function points(id) {
      var tr = trails[String(id)]; if (!tr) return [];
      return tr.strips.map(function (st) { return st.map(function (p) { return { x: p.x, y: p.y, bx: p.bx, by: p.by, age: p.age, k: p.k }; }); });
    }
    function params() { var o = {}; for (var k in P) o[k] = P[k]; return o; }

    return {
      version: VERSION, follow: follow, remove: remove, cut: cut, clear: clear, update: update, draw: draw,
      has: function (id) { return !!trails[String(id)]; }, ids: function () { return order.slice(); },
      list: list, points: points, stats: stats, lastDrawn: function () { return lastDrawnRects.slice(); },
      setParams: setParams, params: params, reduced: reduced
    };
  }

  root.GameDNA_Ribbons = { create: create, version: VERSION, kinds: Object.keys(KDEF), palettes: Object.keys(PALETTES).concat(['skin']) };
})(typeof window !== 'undefined' ? window : this);
