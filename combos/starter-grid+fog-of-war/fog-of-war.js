/* GameDNA B-03 · Fog of war · module v1 (plain script, no dependencies, one global)
 *
 *   const fog = GameDNA_FogOfWar.create({
 *     cols: 16, rows: 12, tile: 16,                 // the tile map
 *     view: { x: 0, y: 0, w: 256, h: 192 },          // screen rect (native px) where the map is drawn; tile (0,0) at view.x/y when cam = 0
 *     skin: 'pixel16',                               // optional; needs GameDNA_Skin, else the built-in pixel16 look
 *     params: { radius: 3, density: 0.6, ... },      // see DEFAULTS
 *     posOf: u => ({ x: u.x, y: u.y }),              // tile of a unit (null = not on the map)
 *     isPlayer: u => u.side === 'blue',              // whose vision counts
 *     visionOf: (u, x, y) => 3,                      // optional: sight radius in tiles (add hill bonuses here)
 *     blocks: (x, y) => false,                       // optional: true = this tile stops sight beyond it (forest, walls)
 *     isAlive: u => u.hp > 0,                        // optional (default: hp > 0 and not dead)
 *     ghostSprite: u => canvasOrImage,               // optional: the unit's own sprite, drawn as a faint silhouette
 *     anchorOf: u => ({ x, top }),                   // optional: screen px above the unit's head for the "!" pop
 *     uiRects: () => [{ x, y, w, h }],               // optional: screen rects the "!" pop never covers
 *     onReveal: (unit, x, y) => {}                   // optional: an enemy just came into sight
 *   });
 *   fog.recompute(units)           // after anything moves (the list is kept and re-read every update)
 *   fog.isVisible(x, y)            // tile coords -> the host skips drawing enemies where this is false
 *   fog.update(dtMs)               // world time
 *   fog.draw(ctx, cam)             // after the ground (and range overlays), before or after units; cam = {x, y} map scroll
 *   fog.drawGhosts(ctx, cam)       // after units, before the HUD: last-seen silhouettes and "!" pops
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var DEFAULTS = { radius: 3, shape: 'diamond', density: 0.6, edge: 1, drift: 6, fade: 240, ghosts: 'on', pop: 'on', popMs: 1200, linger: 250, shroud: 'off', scheme: 'night', dither: 'auto' };
  var NUMERIC = { radius: [0, 32], density: [0, 0.95], edge: [0, 2], drift: [0, 60], fade: [0, 2000], popMs: [300, 4000], linger: [0, 2000] };
  // built-in pixel16 fog tones: [deep, mist, ghost]
  var SCHEMES = {
    night: { deep: [10, 16, 44], mist: [40, 52, 96], ghost: '#b8c8f4', ghostEdge: '#5a6aa8' },
    mist: { deep: [58, 66, 86], mist: [138, 146, 166], ghost: '#f0f2f8', ghostEdge: '#8a92aa' },
    ash: { deep: [26, 18, 16], mist: [78, 60, 50], ghost: '#f0d4b0', ghostEdge: '#8a6a50' }
  };
  var BUBBLE = { ink: '#140c1c', fill: '#fff8e8', shade: '#c8bca8', bang: '#e8402a', bangHi: '#ff9a6a' };
  // "!" bubble, 8x11: # ink, w fill, s shade, ! bang, h bang highlight
  var BUB = ['.######.', '#wwwwww#', '#ww!hww#', '#ww!!ww#', '#ww!!ww#', '#wwwwww#', '#ww!!ww#', '#ssssss#', '.###ss#.', '...#s#..', '....#...'];
  // fallback silhouette (12x15), drawn when the host gives no sprite
  var FIG = ['....####....', '...######...', '..########..', '..########..', '...######...', '....####....', '..########..', '.##########.', '.##########.', '.##########.', '..########..', '..########..', '..###..###..', '..###..###..', '.####..####.'];
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(function (v) { return (v + 0.5) / 16; });

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function okRect(r) { return r && isFinite(r.x) && isFinite(r.y) && isFinite(r.w) && isFinite(r.h) && r.w > 0 && r.h > 0; }
  function ov(a, b) { var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; }
  function hex(c) {
    if (Array.isArray(c)) return c;
    var s = String(c || '').trim(), m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(s))) return [0, 1, 2].map(function (i) { return parseInt(m[1][i] + m[1][i], 16); });
    if ((m = /^#([0-9a-f]{6})/i.exec(s))) return [0, 2, 4].map(function (i) { return parseInt(m[1].substr(i, 2), 16); });
    if ((m = /^rgba?\(([^)]+)\)/i.exec(s))) return m[1].split(',').slice(0, 3).map(function (v) { return clamp(Math.round(+v), 0, 255); });
    return null;
  }
  function css(a) { return '#' + a.map(function (v) { return ('0' + clamp(Math.round(v), 0, 255).toString(16)).slice(-2); }).join(''); }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function hash(x, y, s) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
  function mk(w, h) { var c = root.document ? root.document.createElement('canvas') : null; if (c) { c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); } return c; }

  // tileable 64x64 value noise (two octaves), smooth-stepped, built once
  var NOISE = null, NS = 64;
  function noiseTex() {
    if (NOISE) return NOISE;
    NOISE = new Float32Array(NS * NS);
    var oct = [[8, 0.65, 11], [16, 0.35, 23]];
    for (var y = 0; y < NS; y++) for (var x = 0; x < NS; x++) {
      var v = 0;
      for (var o = 0; o < oct.length; o++) {
        var cell = NS / oct[o][0], gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, n = oct[o][0];
        fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        var a = hash(x0 % n, y0 % n, oct[o][2]), b = hash((x0 + 1) % n, y0 % n, oct[o][2]), c = hash(x0 % n, (y0 + 1) % n, oct[o][2]), d = hash((x0 + 1) % n, (y0 + 1) % n, oct[o][2]);
        v += oct[o][1] * (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy);
      }
      NOISE[y * NS + x] = v;
    }
    return NOISE;
  }
  function noiseAt(x, y) { var N = NOISE; return N[(((y | 0) % NS + NS) % NS) * NS + (((x | 0) % NS + NS) % NS)]; }

  function create(opt) {
    opt = opt || {};
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    function setParams(o) {
      if (!o) return;
      for (var key in o) if (key in DEFAULTS && o[key] != null && o[key] !== '') {
        if (typeof DEFAULTS[key] === 'number') { var r = NUMERIC[key]; P[key] = r ? clamp(num(o[key], DEFAULTS[key]), r[0], r[1]) : num(o[key], DEFAULTS[key]); }
        else P[key] = String(o[key]);
      }
      dirtyLook = true;
    }
    var dirtyLook = true;
    setParams(opt.params);
    noiseTex();

    var warned = {};
    function warn(key, msg) { if (warned[key]) return; warned[key] = 1; try { if (root.console) console.warn('GameDNA_FogOfWar: ' + msg); } catch (e) {} dbg({ event: 'warn', key: key, msg: msg }); }
    function dbg(e) { if (typeof opt.debug === 'function') try { opt.debug(e); } catch (er) {} }
    function safe(fn, args, dflt) { if (typeof fn !== 'function') return dflt; try { return fn.apply(null, args); } catch (e) { warn('cb-' + (fn.name || 'fn'), 'a callback threw: ' + e); return dflt; } }

    /* ---------- skin ---------- */
    var SKAPI = root.GameDNA_Skin || null, SK = null;
    try { SK = SKAPI && SKAPI.resolve ? SKAPI.resolve(opt.skin) : null; } catch (e) { SK = null; }
    var builtinLook = !SK || SK.id === 'pixel16';
    var LOOK = null;
    function tok(path) { if (!SK) return null; try { return SK.token ? SK.token(path) : null; } catch (e) { return null; } }
    function look() {
      if (LOOK && !dirtyLook) return LOOK;
      dirtyLook = false;
      var sc = SCHEMES[P.scheme] || SCHEMES.night, L;
      if (builtinLook || !SK || !SK.palette) {
        L = { deep: sc.deep, mist: sc.mist, ghost: sc.ghost, ghostEdge: sc.ghostEdge, ink: BUBBLE.ink, fill: BUBBLE.fill, shade: BUBBLE.shade, bang: BUBBLE.bang, bangHi: BUBBLE.bangHi, pixel: true };
      } else {
        var pal = SK.palette, fog = pal.fog || {};
        var ink = hex(fog.deep) || hex(pal.ink) || sc.deep, paper = hex(pal.paper) || [240, 240, 240];
        L = {
          deep: hex(fog.deep) || mix(ink, [0, 0, 0], 0.35), mist: hex(fog.mist) || hex(pal.ui && pal.ui.shadow) || mix(ink, paper, 0.3),
          ghost: fog.ghost || (pal.text && pal.text.dim) || css(paper), ghostEdge: fog.ghostEdge || css(mix(ink, paper, 0.45)),
          ink: css(hex(pal.ink) || [20, 12, 28]), fill: css(paper), shade: css(mix(paper, hex(pal.ink) || [0, 0, 0], 0.2)),
          bang: (pal.text && pal.text.accent) || (pal.fx && pal.fx.crit) || BUBBLE.bang, bangHi: (pal.fx && pal.fx.hot) || BUBBLE.bangHi,
          pixel: SK.pixel !== false
        };
      }
      var ovs = SK && SK.overlayStyle ? SK.overlayStyle.mode : null;
      L.dither = P.dither === 'on' ? true : P.dither === 'off' ? false : (L.pixel && ovs !== 'wash');
      L.bubbleImg = null; LOOK = L; ghostCache = {};
      return L;
    }

    /* ---------- geometry ---------- */
    var cols = Math.max(1, num(opt.cols, 16) | 0), rows = Math.max(1, num(opt.rows, 12) | 0), T = Math.max(2, num(opt.tile, 16) | 0);
    var N = cols * rows;
    function view(ctx) {
      if (okRect(opt.view)) return opt.view;
      var c = ctx && ctx.canvas; return { x: 0, y: 0, w: c ? c.width : cols * T, h: c ? c.height : rows * T };
    }
    function camOf(a, b) {
      if (a && typeof a === 'object') return { x: num(a.x, 0), y: num(a.y, 0) };
      return { x: num(a, 0), y: num(b, 0) };
    }
    function inMap(x, y) { return x >= 0 && y >= 0 && x < cols && y < rows; }

    /* ---------- state ---------- */
    var unitsSrc = typeof opt.units === 'function' || Array.isArray(opt.units) ? opt.units : null;
    var vis = new Uint8Array(N), explored = new Uint8Array(N), lv = new Float32Array(N), target = new Float32Array(N), blockC = new Int8Array(N);
    var ready = false, enabled = true, clock = 0, seenState = new Map(), seenAt = new Map(), lastPos = new Map(), ghosts = new Map(), pops = [], listeners = [], drawn = [], reveals = 0;
    var lastPlayers = 0, recomputes = 0;
    if (typeof opt.onReveal === 'function') listeners.push(opt.onReveal);

    function idOf(u) { return u && u.id != null ? 'id:' + u.id : u; }
    function aliveOf(u) {
      if (!u) return false;
      if (typeof opt.isAlive === 'function') return !!safe(opt.isAlive, [u], true);
      return !(u.dead || u.removed || (u.hp != null && +u.hp <= 0));
    }
    function playerOf(u) {
      if (typeof opt.isPlayer === 'function') return !!safe(opt.isPlayer, [u], false);
      var s = u && (u.side != null ? u.side : u.team);
      return u && (u.player === true || s === 'player' || s === 'a' || s === 'blue' || s === 'ally' || s === 'hero' || s === 0);
    }
    function tileOf(u) {
      var p = typeof opt.posOf === 'function' ? safe(opt.posOf, [u], null) : (u ? { x: u.x, y: u.y } : null);
      if (!p || !isFinite(p.x) || !isFinite(p.y)) return null;
      var x = Math.round(+p.x), y = Math.round(+p.y);
      return inMap(x, y) ? { x: x, y: y } : null;
    }
    function blocked(x, y, viewer) {
      var i = y * cols + x;
      if (blockC[i] === 0) blockC[i] = safe(opt.blocks, [x, y], false) ? 1 : -1;   // cached per recompute
      return blockC[i] === 1;
    }
    function lineClear(x0, y0, x1, y1, viewer) {
      var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy, x = x0, y = y0;
      for (;;) {
        if (x === x1 && y === y1) return true;
        if (!(x === x0 && y === y0) && blocked(x, y, viewer)) return false;
        var e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
      }
    }
    function inShape(dx, dy, r) {
      if (P.shape === 'circle') return dx * dx + dy * dy <= r * r + r * 0.8;
      if (P.shape === 'square') return Math.max(Math.abs(dx), Math.abs(dy)) <= r;
      return Math.abs(dx) + Math.abs(dy) <= r;
    }
    function cast(px, py, r, viewer) {
      r = Math.max(0, Math.min(32, Math.round(r)));
      for (var y = py - r; y <= py + r; y++) for (var x = px - r; x <= px + r; x++) {
        if (!inMap(x, y)) continue;
        var dx = x - px, dy = y - py, i = y * cols + x;
        if (vis[i] || !inShape(dx, dy, r)) continue;
        if (Math.max(Math.abs(dx), Math.abs(dy)) <= 1 || lineClear(px, py, x, y, viewer) || lineClear(x, y, px, py, viewer)) vis[i] = 1;
      }
    }
    function listOf(list) {
      var L = list;
      if (typeof L === 'function') L = safe(L, [], []);
      if (L && !Array.isArray(L) && typeof L === 'object') { try { L = Object.keys(L).map(function (k2) { return list[k2]; }); } catch (e) { L = []; } }
      return Array.isArray(L) ? L.filter(Boolean) : [];
    }

    function recompute(list) {
      if (list != null) unitsSrc = list;
      if (!unitsSrc) { warn('nounits', 'recompute() was called without a unit list.'); return api; }
      var L = listOf(unitsSrc), i;
      vis.fill(0); blockC.fill(0);
      var players = 0;
      for (i = 0; i < L.length; i++) {
        var u = L[i];
        if (!aliveOf(u) || !playerOf(u)) continue;
        var p = tileOf(u); if (!p) continue;
        players++;
        var rv = safe(opt.visionOf, [u, p.x, p.y], null), r = rv == null || rv === '' ? NaN : +rv;
        if (!isFinite(r)) r = num(u.vision != null ? u.vision : u.sight, P.radius);
        cast(p.x, p.y, r, u);
      }
      lastPlayers = players;
      if (!players && L.length) warn('noplayers', 'no living player unit found: check isPlayer(unit) and posOf(unit). Everything stays fogged.');
      for (i = 0; i < N; i++) if (vis[i]) explored[i] = 1;
      // enemies: reveal events, last-seen ghosts
      var present = new Set();
      for (i = 0; i < L.length; i++) {
        var e = L[i];
        if (playerOf(e)) continue;
        var key = idOf(e), alive = aliveOf(e), q = alive ? tileOf(e) : null;
        if (!alive || !q) continue;
        present.add(key);
        var now = !!vis[q.y * cols + q.x], before = seenState.get(key);
        if (now) {
          if (ready && before !== true) reveal(e, q, clock - (seenAt.has(key) ? seenAt.get(key) : -1e9) < 1000);
          seenState.set(key, true); lastPos.set(key, q); ghosts.delete(key); seenAt.set(key, clock);
        } else if (before === true && clock - (seenAt.get(key) || 0) < P.linger) {
          // just left sight (often because the watcher walked past): stay shown a moment, so it does not blink
        } else {
          if (before === true && P.ghosts !== 'off') { var lp = lastPos.get(key) || q; ghosts.set(key, { x: lp.x, y: lp.y, unit: e, since: clock }); }
          if (before === true && pops.length) pops = pops.filter(function (pp) { return pp.key !== key; });   // a pop never follows a unit into the fog
          seenState.set(key, false);
        }
      }
      // a unit that left the list (or died) while unseen keeps its ghost until that tile is seen; seen = gone
      seenState.forEach(function (v, key) { if (!present.has(key)) { seenState.delete(key); } });
      ghosts.forEach(function (g, key) { if (vis[g.y * cols + g.x]) ghosts.delete(key); });
      // targets: 0 visible, 1 fog, >1 never-seen shroud
      var S = P.shroud === 'on' ? 1.45 : 1;
      for (i = 0; i < N; i++) target[i] = vis[i] ? 0 : explored[i] ? 1 : S;
      if (!ready) { for (i = 0; i < N; i++) lv[i] = target[i]; ready = true; }
      recomputes++;
      return api;
    }
    function reveal(u, q, again) {   // again: it was in view less than a second ago (walking along the edge): no second "!"
      reveals++;
      if (P.pop !== 'off' && !again) { pops = pops.filter(function (p) { return p.key !== idOf(u); }); pops.push({ key: idOf(u), unit: u, x: q.x, y: q.y, born: clock }); }
      dbg({ event: 'reveal', unit: u, x: q.x, y: q.y, again: !!again });
      for (var i = 0; i < listeners.length; i++) safe(listeners[i], [u, q.x, q.y], null);
    }

    function update(dt) {
      dt = num(dt, 0); if (dt < 0) dt = 0;
      clock += dt;
      if (unitsSrc) recompute();
      if (ready) {
        var step = P.fade > 0 ? dt / P.fade : 99;
        for (var i = 0; i < N; i++) { var d = target[i] - lv[i]; if (d) lv[i] = Math.abs(d) <= step ? target[i] : lv[i] + (d > 0 ? step : -step); }
      }
      if (pops.length) pops = pops.filter(function (p) { return clock - p.born < P.popMs; });
      return api;
    }

    /* ---------- fog raster ---------- */
    var buf = null, bufCtx = null, img = null, sbuf = null, sbufCtx = null, simg = null;
    var NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    function lvAt(x, y) { return inMap(x, y) ? lv[y * cols + x] : -1; }
    function draw(ctx, camA, camB) {
      if (!ctx || !enabled || !ready) { if (!ready && enabled && ctx) warn('notready', 'draw() before the first recompute(units): nothing drawn yet.'); return; }
      try { drawFog(ctx, camOf(camA, camB)); } catch (e) { warn('draw', 'draw failed: ' + e); }
    }
    function drawFog(ctx, cam) {
      var V = view(ctx), L = look(), W = Math.max(1, Math.round(V.w)), H = Math.max(1, Math.round(V.h));
      if (!buf || buf.width !== W || buf.height !== H) { buf = mk(W, H); if (!buf) return; bufCtx = buf.getContext('2d'); img = bufCtx.createImageData(W, H); sbuf = mk(W, H); sbufCtx = sbuf.getContext('2d'); simg = sbufCtx.createImageData(W, H); }
      var d = img.data, sd = simg.data, A = P.density, E = P.edge, dith = L.dither, deep = L.deep, mist = L.mist;
      var drift = P.drift * clock / 1000, n1x = drift * 0.5, n1y = drift * 0.18, n2x = -drift * 0.31, n2y = drift * 0.27;
      var ox = Math.round(cam.x), oy = Math.round(cam.y);
      d.fill(0); sd.fill(0);
      var tx0 = Math.floor(ox / T), ty0 = Math.floor(oy / T), tx1 = Math.floor((ox + W - 1) / T), ty1 = Math.floor((oy + H - 1) / T);
      for (var ty = Math.max(0, ty0); ty <= Math.min(rows - 1, ty1); ty++) for (var tx = Math.max(0, tx0); tx <= Math.min(cols - 1, tx1); tx++) {
        var o = lv[ty * cols + tx];
        if (o <= 0.001) continue;
        // neighbours with less fog pull the edge down (soft ramp inside this tile, width = edge tiles)
        var lows = [];
        if (E > 0) for (var n = 0; n < 8; n++) { var lvN = lvAt(tx + NB[n][0], ty + NB[n][1]); if (lvN >= 0 && lvN < o - 0.001) lows.push(n, lvN); }
        var sx0 = Math.max(0, tx * T - ox), sy0 = Math.max(0, ty * T - oy), sx1 = Math.min(W, tx * T - ox + T), sy1 = Math.min(H, ty * T - oy + T);
        for (var sy = sy0; sy < sy1; sy++) {
          var wy = sy + oy, v = (wy - ty * T + 0.5) / T;
          for (var sx = sx0; sx < sx1; sx++) {
            var wx = sx + ox, u = (wx - tx * T + 0.5) / T, f = o;
            for (var m = 0; m < lows.length; m += 2) {
              var nb = NB[lows[m]], dd;
              if (nb[0] && nb[1]) { var ddx = nb[0] > 0 ? 1 - u : u, ddy = nb[1] > 0 ? 1 - v : v; dd = Math.sqrt(ddx * ddx + ddy * ddy); }
              else dd = nb[0] > 0 ? 1 - u : nb[0] < 0 ? u : nb[1] > 0 ? 1 - v : v;
              var c = lows[m + 1] + (o - lows[m + 1]) * Math.min(1, dd / E);
              if (c < f) f = c;
            }
            if (f <= 0.001) continue;
            var cover = f > 1 ? 1 : f, strength = f > 1 ? f : 1, b = BAYER[(wy & 3) * 4 + (wx & 3)];
            var nz = noiseAt(wx * 0.5 + n1x, wy * 0.5 + n1y) * 0.6 + noiseAt(wx * 0.37 + n2x + 17, wy * 0.37 + n2y + 29) * 0.4, alpha, col;
            if (dith) {
              if (cover < 1 && cover <= b) continue;
              col = nz > 0.5 + 0.22 * b ? mist : deep;
              alpha = A * strength * (nz > 0.62 ? 0.9 : 1);
            } else {
              var mt = clamp((nz - 0.42) / 0.3, 0, 1);
              col = [deep[0] + (mist[0] - deep[0]) * mt, deep[1] + (mist[1] - deep[1]) * mt, deep[2] + (mist[2] - deep[2]) * mt];
              alpha = A * strength * cover * (0.92 + 0.16 * nz);
            }
            var j = (sy * W + sx) * 4;
            d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; d[j + 3] = clamp(Math.round(alpha * 255), 0, 245);
            sd[j] = sd[j + 1] = sd[j + 2] = 128; sd[j + 3] = Math.round((dith ? 1 : cover) * Math.min(1, strength) * 0.7 * 255);   // desaturate under the fog
          }
        }
      }
      bufCtx.putImageData(img, 0, 0);
      var pa = ctx.globalAlpha, pc = ctx.globalCompositeOperation, ps = ctx.imageSmoothingEnabled;
      ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = 'saturation';
      if (ctx.globalCompositeOperation === 'saturation') { sbufCtx.putImageData(simg, 0, 0); ctx.drawImage(sbuf, Math.round(V.x), Math.round(V.y)); }   // terrain under fog loses most of its colour
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(buf, Math.round(V.x), Math.round(V.y));
      ctx.globalAlpha = pa; ctx.globalCompositeOperation = pc; ctx.imageSmoothingEnabled = ps;
    }

    /* ---------- ghosts and "!" pops ---------- */
    var ghostCache = {};
    var silCache = typeof WeakMap === 'function' ? new WeakMap() : null;
    function silhouette(src, L) {
      var w = src.width | 0, h = src.height | 0; if (!w || !h) return null;
      var cached = silCache && silCache.get(src); if (cached && cached.look === L) return cached.c;
      var c = mk(w + 2, h + 2); if (!c) return null;
      var g = c.getContext('2d'), m = mk(w, h), mg = m.getContext('2d');
      mg.drawImage(src, 0, 0);
      var sd = mg.getImageData(0, 0, w, h).data, out = g.createImageData(w + 2, h + 2), od = out.data;
      var on = function (x, y) { return x >= 0 && y >= 0 && x < w && y < h && sd[(y * w + x) * 4 + 3] > 60; };
      var G = hex(L.ghost) || [200, 210, 240], GE = hex(L.ghostEdge) || [90, 100, 160];
      for (var y = -1; y <= h; y++) for (var x = -1; x <= w; x++) {
        var j = ((y + 1) * (w + 2) + (x + 1)) * 4, col = null, a = 0;
        if (on(x, y)) { col = G; a = L.dither ? ((x + y) & 1 ? 170 : 70) : 120; }   // two-level dithered body
        else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) { col = GE; a = 210; }   // solid rim
        if (col) { od[j] = col[0]; od[j + 1] = col[1]; od[j + 2] = col[2]; od[j + 3] = a; }
      }
      g.putImageData(out, 0, 0);
      if (silCache) silCache.set(src, { c: c, look: L });
      return c;
    }
    function fallbackFig(L) {
      if (ghostCache.fig) return ghostCache.fig;
      var c = mk(FIG[0].length, FIG.length), g = c.getContext('2d'); g.fillStyle = '#000';
      FIG.forEach(function (r, y) { for (var x = 0; x < r.length; x++) if (r[x] === '#') g.fillRect(x, y, 1, 1); });
      return (ghostCache.fig = silhouette(c, L));
    }
    function bubble(L) {
      if (L.bubbleImg) return L.bubbleImg;
      var c = mk(8, 11), g = c.getContext('2d'), C = { '#': L.ink, w: L.fill, s: L.shade, '!': L.bang, h: L.bangHi };
      BUB.forEach(function (r, y) { for (var x = 0; x < r.length; x++) if (C[r[x]]) { g.fillStyle = C[r[x]]; g.fillRect(x, y, 1, 1); } });
      return (L.bubbleImg = c);
    }
    function uiRects() {
      var r = safe(opt.uiRects, [], []);
      return Array.isArray(r) ? r.filter(okRect) : [];
    }
    function obstacleRects() {
      var r = safe(opt.getObstacles, [], []);
      return Array.isArray(r) ? r.filter(okRect) : [];
    }
    function drawGhosts(ctx, camA, camB) {
      drawn = [];
      if (!ctx || !enabled || !ready) return;
      try { drawGhostsInner(ctx, camOf(camA, camB)); } catch (e) { warn('ghosts', 'drawGhosts failed: ' + e); }
    }
    function drawGhostsInner(ctx, cam) {
      var V = view(ctx), L = look(), pa = ctx.globalAlpha, ps = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.save(); ctx.beginPath(); ctx.rect(V.x, V.y, V.w, V.h); ctx.clip();
      if (P.ghosts !== 'off') ghosts.forEach(function (gh, key) {
        var spr = safe(opt.ghostSprite, [gh.unit], null), flip = false;
        if (spr && spr.img) { flip = !!spr.flip; spr = spr.img; }
        var sil = spr && spr.width ? silhouette(spr, L) : fallbackFig(L); if (!sil) return;
        var w = sil.width - 2, h = sil.height - 2;
        var X = Math.round(V.x + gh.x * T - cam.x + (T - w) / 2) - 1, Y = Math.round(V.y + gh.y * T - cam.y + T - h) - 1;
        // a slow breathing so the eye reads it as a memory, not a unit
        var br = 0.55 + 0.15 * Math.sin((clock - gh.since) / 700);
        ctx.globalAlpha = L.dither ? (br > 0.6 ? 0.85 : 0.7) : br + 0.15;
        if (flip) { ctx.save(); ctx.translate(X + sil.width, Y); ctx.scale(-1, 1); ctx.drawImage(sil, 0, 0); ctx.restore(); }
        else ctx.drawImage(sil, X, Y);
        drawn.push({ kind: 'ghost', owner: gh.unit && gh.unit.id != null ? gh.unit.id : null, x: X + 1, y: Y + 1, w: w, h: h });
      });
      ctx.globalAlpha = pa; ctx.restore();
      if (P.pop !== 'off' && pops.length) {
        var bub = bubble(L), UI = uiRects(), OB = obstacleRects(), all = unitsSrc ? listOf(unitsSrc) : [];
        pops.forEach(function (p) {
          var a = clock - p.born; if (a < 0) return;
          if (a > P.popMs - 200 && Math.floor(a / 50) % 2) return;            // blink out
          var u = p.unit, q = aliveOf(u) ? tileOf(u) : null; if (q) { p.x = q.x; p.y = q.y; }
          var anc = safe(opt.anchorOf, [u], null), ax, top;
          if (anc && isFinite(anc.x) && isFinite(anc.top)) { ax = +anc.x; top = +anc.top; p.anc = { x: ax - (V.x + p.x * T - cam.x + T / 2), top: top - (V.y + p.y * T - cam.y) }; }
          else { var off = p.anc || { x: 0, top: -3 }; ax = V.x + p.x * T - cam.x + T / 2 + off.x; top = V.y + p.y * T - cam.y + off.top; }
          var dy = a < 70 ? Math.round(5 - 8 * a / 70) : a < 120 ? -3 + Math.round(4 * (a - 70) / 50) : a < 160 ? 1 - Math.round((a - 120) / 40) : 0;
          // never on a neighbour: every other unit that is on screen (players and visible enemies; hidden ones are not drawn)
          var nb = [];
          all.forEach(function (o) {
            if (o === u || !aliveOf(o) || !(playerOf(o) || api.isUnitVisible(o))) return;
            var t2 = tileOf(o); if (t2) nb.push({ x: V.x + t2.x * T - cam.x, y: V.y + t2.y * T - cam.y - 4, w: T, h: T + 4 });
          });
          var cand = [[ax - 4, top - 12], [ax + T / 2 + 1, top - 6], [ax - T / 2 - 9, top - 6], [ax + T / 2 + 1, top - 12], [ax - T / 2 - 9, top - 12], [ax - 4, top + 2]], best = null;
          cand.forEach(function (c, ci) {
            var x = clamp(Math.round(c[0]), V.x + 1, V.x + V.w - 9), y = clamp(Math.round(c[1]), V.y + 4, V.y + V.h - 12), R = { x: x, y: y, w: 8, h: 11 }, s = ci * 3;
            UI.forEach(function (r) { s += ov(R, r) * 1000; });
            nb.forEach(function (r) { s += ov(R, r) * 400; });
            OB.forEach(function (r) { if (r.id == null || (u && r.id !== u.id)) s += ov(R, r) * 10; });
            if (!best || s < best.s) best = { x: x, y: y, s: s };
          });
          var by = clamp(best.y + dy, V.y + 1, V.y + V.h - 12);   // the rise never leaves the view
          ctx.drawImage(bub, best.x, by);
          drawn.push({ kind: 'pop', owner: u && u.id != null ? u.id : null, x: best.x, y: by, w: 8, h: 11 });
        });
      }
      ctx.globalAlpha = pa; ctx.imageSmoothingEnabled = ps;
    }

    var api = {
      recompute: recompute, update: update, draw: draw, drawGhosts: drawGhosts,
      isVisible: function (x, y) {
        if (!enabled || !ready) return true;
        x = Math.round(+x); y = Math.round(+y);
        return inMap(x, y) ? !!vis[y * cols + x] : false;
      },
      isUnitVisible: function (u) {
        if (!enabled || !ready) return true;
        if (playerOf(u)) return true;
        var q = tileOf(u); if (q && vis[q.y * cols + q.x]) return true;
        return aliveOf(u) && seenState.get(idOf(u)) === true;   // lingering a moment after leaving sight
      },
      isExplored: function (x, y) { return !ready || (inMap(x, y) && !!explored[y * cols + x]); },
      onReveal: function (cb) { if (typeof cb === 'function') listeners.push(cb); return function () { listeners = listeners.filter(function (f) { return f !== cb; }); }; },
      setParams: setParams, params: P,
      setEnabled: function (on) { enabled = on !== false; },
      enabled: function () { return enabled; },
      reset: function () { explored.fill(0); vis.fill(0); ghosts.clear(); seenState.clear(); seenAt.clear(); lastPos.clear(); pops = []; ready = false; return api; },
      ghosts: function () { var o = []; ghosts.forEach(function (g) { o.push({ x: g.x, y: g.y, unit: g.unit }); }); return o; },
      pops: function () { return pops.map(function (p) { return { x: p.x, y: p.y, unit: p.unit, age: clock - p.born }; }); },
      visibleTiles: function () { var c = 0; for (var i = 0; i < N; i++) c += vis[i]; return c; },
      lastDrawn: function () { return drawn.slice(); },
      stats: function () { return { ready: ready, players: lastPlayers, recomputes: recomputes, reveals: reveals, ghosts: ghosts.size, pops: pops.length, clock: clock }; },
      version: VERSION
    };
    return api;
  }
  root.GameDNA_FogOfWar = { create: create, DEFAULTS: DEFAULTS, version: VERSION };
})(typeof window !== 'undefined' ? window : this);
