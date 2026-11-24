/* GameDNA I-02 parallax-layers v1.0.0
 * Multi-layer parallax backdrop: 3-6 procedurally generated, original pixel-art layers (sky with dithered bands,
 * clouds or a cave ceiling, far range, back range, mid tree/cliff/building line, near foliage), each scrolling at
 * its own factor of the host camera, with seamless horizontal tiling, optional vertical parallax, ambient motion
 * (drifting clouds, twinkling stars, swaying grass, fireflies, sea glints, drips, window lights) and a
 * day / dusk / night palette. Deterministic from a seed and the clock you give it.
 *
 *   var bg = GameDNA_Parallax.create({
 *     view: { x: 0, y: 0, w: 320, h: 180 },      // screen rect it fills (native px), usually the play field
 *     seed: 1, theme: 'forest', time: 'day',      // themes: forest, cliffs, cave, city; times: day, dusk, night
 *     skin: 'pixel16',                           // optional; needs GameDNA_Skin, else a built-in pixel16 look
 *     params: { layers: 5, depth: 1, ground: 0.82 }
 *   });
 *   bg.update(dtMs);                  // fixed step (world time; 0 while frozen if you like)
 *   bg.draw(ctx, camX, camY);         // FIRST in the draw pass, instead of the old background
 *
 * Plain script, no import/export, no dependencies. One global: GameDNA_Parallax.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var THEMES = ['forest', 'cliffs', 'cave', 'city'], TIMES = ['day', 'dusk', 'night'];
  var ORDER = ['sky', 'clouds', 'far', 'back', 'mid', 'near'];
  var PICK = { 3: ['sky', 'far', 'mid'], 4: ['sky', 'far', 'mid', 'near'], 5: ['sky', 'clouds', 'far', 'mid', 'near'], 6: ORDER };
  var FACTOR = { sky: 0, clouds: 0.08, far: 0.16, back: 0.3, mid: 0.48, near: 0.72 };
  var DEPTH = { sky: 0, clouds: 0.08, far: 0.12, back: 0.38, mid: 0.68, near: 0.95, floor: 0.8 };
  var DEFAULTS = { layers: 5, depth: 1, vertical: 0, ambient: 1, drift: 1, horizon: 0.5, ground: 0.82, floor: 'none', idle: 0, sway: 0, detail: 1 };
  var LIMITS = { layers: [3, 6], depth: [0, 1.3], vertical: [0, 1], ambient: [0, 2], drift: [0, 4], horizon: [0.15, 0.8], ground: [0.3, 1], idle: [-40, 40], sway: [0, 8], detail: [0.5, 1.5] };
  var warned = {};
  function warn(k, m) { if (warned[k]) return; warned[k] = 1; try { console.warn('[GameDNA_Parallax] ' + m); } catch (e) { } }

  /* ---------------- maths ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6d2b79f5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(a, b, s) { var h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  // periodic value noise: repeats every `period` px (period must be a multiple of `cell`), so layers tile seamlessly
  function pnoise(x, period, cell, seed) {
    var n = Math.max(1, Math.round(period / cell)), fx = x / cell, i = Math.floor(fx), f = smooth(fx - i);
    var a = hash(((i % n) + n) % n, 0, seed), b = hash((((i + 1) % n) + n) % n, 0, seed);
    return a + (b - a) * f;
  }
  function noise2(x, y, c, s) { var fx = x / c, fy = y / c, i = Math.floor(fx), j = Math.floor(fy), u = smooth(fx - i), v = smooth(fy - j); var a = hash(i, j, s), b = hash(i + 1, j, s), cc = hash(i, j + 1, s), d = hash(i + 1, j + 1, s); return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v; }
  function fbm(x, P, seed, cells) { var s = 0, w = 0, k = 1; cells = cells || [128, 64, 32, 16]; for (var i = 0; i < cells.length; i++) { s += pnoise(x, P, cells[i], seed + i * 101) * k; w += k; k *= 0.5; } return s / w; }
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function bay(x, y) { return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }

  /* ---------------- colour ---------------- */
  function rgb(h) { if (Array.isArray(h)) return h.slice(0, 3); h = String(h).replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function mul(a, m) { return [a[0] * m[0], a[1] * m[1], a[2] * m[2]]; }
  function css(c, a) { var r = Math.round(clamp(c[0], 0, 255)), g = Math.round(clamp(c[1], 0, 255)), b = Math.round(clamp(c[2], 0, 255)); return a == null ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }

  /* ---------------- palettes (original; day values, graded per time) ---------------- */
  var SKY = {
    day: ['#3c6cc4', '#4d84d4', '#649ade', '#82b2e6', '#a6cbee', '#c8e0f2'],
    dusk: ['#25204a', '#3e2a66', '#6e3c74', '#b05a6e', '#e88a62', '#f6bc72'],
    night: ['#05081a', '#0a1028', '#101a3a', '#18264c', '#22325a']
  };
  var SKY_THEME = {
    cliffs: { day: ['#2f78c8', '#3e8ed6', '#58a6e0', '#7cc0ea', '#a4d6f0', '#cdeaf4'] },
    city: { night: ['#060818', '#0c1026', '#151a38', '#24244a', '#3a2c52', '#5a3a58'], dusk: ['#1e1c40', '#352860', '#62386e', '#a2506a', '#de7c5c', '#f2a866'] },
    cave: { day: ['#141018', '#1c161e', '#241c26', '#2c232e', '#362a36'], dusk: ['#160e10', '#201416', '#2a1a1c', '#342220', '#402a24'], night: ['#080a12', '#0c101a', '#111622', '#161c2c'] }
  };
  // per theme, per slot: [deep, shadow, base, light, highlight] (day, before grading)
  var MAT = {
    forest: {
      far: ['#5a6a9a', '#6a7cac', '#7c90bc', '#94a8cc', '#e8eef6'], back: ['#2e5a4a', '#3a6c50', '#4a8058', '#5e9660', '#7aac6a'],
      mid: ['#14301e', '#1e4426', '#2a5a2c', '#3c7434', '#5a9240'], trunk: ['#2a1c18', '#3e2a20', '#56392a'],
      near: ['#0c1a14', '#12261a', '#1a3420', '#244628', '#3a5e2e'], floor: ['#3e6a2a', '#4e7e30', '#62923a', '#78a646', '#94bc58'],
      flower: ['#e8d070', '#d87a9a', '#e8eef8']
    },
    cliffs: {
      far: ['#6a86a8', '#7896b4', '#88a6c0', '#9cb8cc', '#d8e4ec'], sea: ['#1e4a78', '#28609a', '#3478ae', '#4e96c4', '#8ac8e4'],
      back: ['#5a6070', '#6a7080', '#7c8290', '#9298a2', '#b0b4b8'], mid: ['#3a3438', '#524848', '#6c5e58', '#8a7868', '#a89278'],
      grass: ['#2e5a2a', '#3e7230', '#58903a', '#78ac4a'], near: ['#1a1e1a', '#262a22', '#34382a', '#464a32', '#5e6038'],
      floor: ['#b89a6a', '#c8aa78', '#d6ba88', '#e2c898', '#eed8ac'], foam: ['#d8eef4', '#ffffff']
    },
    cave: {
      far: ['#2a2430', '#342c3a', '#3e3444', '#4a3e50', '#5a4c5e'], back: ['#221c26', '#2c2430', '#382e3c', '#463a48', '#584a56'],
      mid: ['#16121a', '#201a24', '#2c2430', '#3a303c', '#4e4250'], near: ['#0a080c', '#120e14', '#1a161c', '#262028', '#342c34'],
      crystal: ['#1a5a6a', '#2a8a96', '#4ac0c4', '#9ae8e0', '#e6fff8'], crystal2: ['#4a2a6a', '#6a3a96', '#9a5ac4', '#c896e8', '#f2e2ff'],
      shroom: ['#5a2a3a', '#8a3a4a', '#c45a5a', '#e89a7a'], floor: ['#2a2428', '#342c30', '#3e363a', '#4a4044', '#5a4e50']
    },
    city: {
      far: ['#4a5878', '#56668a', '#64769a', '#7486a8', '#9aa8c4'], back: ['#2e3448', '#383f56', '#444c66', '#525c78', '#66708a'],
      mid: ['#1a1c28', '#222534', '#2c3042', '#383e52', '#4c5268'], near: ['#0c0c12', '#14141c', '#1c1c26', '#262834', '#343846'],
      win: ['#ffd27a', '#ffe8b0', '#9ad0ff', '#ffb070'], lamp: ['#ffe2a0', '#fff4d8'], blink: ['#ff4a4a', '#ffb0a0'],
      floor: ['#3a3a44', '#46464e', '#52525a', '#5e5e66', '#70707a']
    }
  };
  var GRADE = {
    day: { mul: [1, 1, 1], tint: '#000000', tintK: 0, atm: 0.5 },
    dusk: { mul: [1.0, 0.8, 0.76], tint: '#5a2e5a', tintK: 0.22, atm: 0.42 },
    night: { mul: [0.34, 0.4, 0.62], tint: '#121836', tintK: 0.28, atm: 0.3 }
  };

  /* ---------------- pixel buffer ---------------- */
  function Buf(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  Buf.prototype.px = function (x, y, c, a) {
    x = Math.floor(x); y = Math.floor(y); if (y < 0 || y >= this.h) return;
    x = ((x % this.w) + this.w) % this.w; var k = (y * this.w + x) * 4, d = this.d;
    if (a != null && a < 1) { var b = 1 - a; d[k] = d[k] * b + c[0] * a; d[k + 1] = d[k + 1] * b + c[1] * a; d[k + 2] = d[k + 2] * b + c[2] * a; d[k + 3] = Math.max(d[k + 3], 255 * a); return; }
    d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
  };
  Buf.prototype.on = function (x, y) { x = Math.floor(x); y = Math.floor(y); if (y < 0 || y >= this.h) return false; x = ((x % this.w) + this.w) % this.w; return this.d[(y * this.w + x) * 4 + 3] > 0; };
  Buf.prototype.canvas = function () {
    var c = mkCanvas(this.w, this.h); if (!c) return null; var g = c.getContext('2d');
    var id = g.createImageData(this.w, this.h); id.data.set(this.d); g.putImageData(id, 0, 0); return c;
  };
  function mkCanvas(w, h) { try { if (root.document) { var c = root.document.createElement('canvas'); c.width = w; c.height = h; return c; } if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); } catch (e) { } return null; }

  /* ---------------- builder ---------------- */
  function build(st) {
    var o = st.o, P = st.P, W = st.view.w, H = st.view.h, TW = st.TW, M = st.M, HH = H + M;
    var theme = st.theme, time = st.time, G = GRADE[time], night = time === 'night', dusk = time === 'dusk', day = time === 'day';
    var pixel = st.pixel, seed = st.seed, R = rng(seed * 7919 + THEMES.indexOf(theme) * 131 + 17), RA = rng(seed * 104729 + THEMES.indexOf(theme) * 37 + TIMES.indexOf(time) * 7 + 3);
    // R lays out the art, RA only the ambient items, so the amount of ambient motion never changes the picture
    var skyR = ((SKY_THEME[theme] && SKY_THEME[theme][time]) || SKY[time]).map(rgb);
    var skin = st.skinPal && st.skinPal[theme]; if (skin && skin.sky && skin.sky[time]) skyR = skin.sky[time].map(rgb);
    var skyHz = skyR[skyR.length - 1];
    var floorOn = P.floor === 'plain', gy = Math.round(H * P.ground), hz = Math.round(H * Math.min(P.horizon, P.ground - 0.04));
    var span = Math.max(8, gy - hz);
    // base lines (y where each range sits) and amplitudes
    var base = { far: hz, back: hz + Math.round(span * 0.32), mid: hz + Math.round(span * 0.66), near: gy + (floorOn ? 1 : Math.round((H - gy) * 0.3)) };
    var amp = { far: Math.round(H * (floorOn ? 0.16 : 0.22)), back: Math.round(H * 0.12), mid: Math.round(H * (floorOn ? 0.13 : 0.17)), near: Math.round(H * (floorOn ? 0.05 : 0.14)) };
    function grade(c, depth, keep) {
      c = rgb(c); if (keep) return c;
      c = mul(c, G.mul); if (G.tintK) c = mix(c, rgb(G.tint), G.tintK * (0.4 + 0.6 * depth));
      return mix(c, skyHz, (1 - depth) * G.atm);
    }
    function ramp(name, slot) { var src = (skin && skin[name]) || MAT[theme][name] || MAT.forest.mid; return src.map(function (c) { return grade(c, DEPTH[slot] == null ? 0.7 : DEPTH[slot]); }); }
    // dithered pick between ramp steps (only transition bands are dithered); smooth mixing for non-pixel skins
    function pick(r, f, x, y, hard) {
      f = clamp(f, 0, 0.9999) * (r.length - 1); var i = Math.floor(f), t = f - i;
      if (i >= r.length - 1) return r[r.length - 1];
      if (!pixel) return mix(r[i], r[i + 1], t);
      t = clamp((t - 0.5) * (hard || 2.6) + 0.5, 0, 1);
      return t > bay(x, y) ? r[i + 1] : r[i];
    }
    var L = {};
    // ---------- sky (fixed, view width) ----------
    (function () {
      var RS = rng(seed * 31 + 5);
      var b = new Buf(W, HH), top = Math.max(4, theme === 'cave' ? HH : Math.round(hz + span * 0.15));
      var cave = theme === 'cave';
      for (var y = 0; y < HH; y++) { var f = y / top; for (var x = 0; x < W; x++) { var ff = f; if (cave) ff = clamp(0.25 + f * 0.45 + (noise2(x, y, 24, seed) - 0.5) * 0.5 + (noise2(x, y, 7, seed + 1) - 0.5) * 0.18, 0, 1); b.px(x, y, pick(skyR, ff, x, y, 2.2)); } }
      var sx = Math.round(W * 0.74), am = [];
      if (theme === 'cave') {
        // light shafts from openings in the ceiling (dithered, static); colour by time
        var shaft = rgb(day ? '#e8e0b8' : dusk ? '#f0a060' : '#6a9ad8'), k = day ? 0.16 : dusk ? 0.12 : 0.08;
        for (var s = 0; s < 3; s++) {
          var x0 = W * (0.18 + s * 0.3 + RS() * 0.08), wdt = 8 + RS() * 10, sl = 0.35 + RS() * 0.2;
          for (var y2 = 0; y2 < HH; y2++) for (var xx = 0; xx < wdt; xx++) {
            var e = 1 - Math.abs(xx / wdt - 0.5) * 2, fadeY = 1 - y2 / (HH * 0.85);
            if (e <= 0 || fadeY <= 0) continue;
            var a = k * Math.min(1, fadeY * 1.4) * (e > 0.3 ? 1 : 0.5);
            if (pixel && ((e < 0.3 && bay(x0 + xx, y2) > 0.5) || (fadeY < 0.25 && bay(x0 + xx, y2) > fadeY * 4))) continue;
            b.px(x0 + xx + y2 * sl, y2, shaft, a * 2.2);
          }
          am.push({ x: x0, w: wdt, sl: sl });
        }
        st.shafts = am;
      } else if (day) disc(b, sx, Math.round(hz * 0.32), 7, rgb('#fff6dc'), rgb('#fffdf4'));
      else if (dusk) { disc(b, Math.round(W * 0.7), hz - 2, 11, rgb('#ffc070'), rgb('#ffe2a0')); for (var q = 0; q < 3; q++) { var cy = Math.round(hz * (0.5 + q * 0.13)), cx = Math.round(W * (0.05 + RS() * 0.7)), cw = 40 + Math.round(RS() * 50), lc = mix(skyR[3], rgb('#ffd8a0'), 0.45), dc = mix(skyR[2], skyR[3], 0.5); for (var z = 0; z < cw; z++) { var tp = Math.min(z, cw - z) / cw; b.px(cx + z, cy, lc); if (tp > 0.12) b.px(cx + z, cy + 1, dc); if (tp > 0.3) b.px(cx + z + 6, cy - 1, lc); } } }
      else { // moon (crescent) + static stars
        disc(b, sx, Math.round(hz * 0.28), 6, rgb('#e8ecf6'), rgb('#ffffff'));
        disc(b, sx + 3, Math.round(hz * 0.28) - 2, 5, null, null, skyR, b);
      }
      L.sky = { name: 'sky', img: b.canvas(), w: W, factor: 0 };
    })();
    function disc(b, cx, cy, r, c, hi, eraseRamp) {
      for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) {
        if (x * x + y * y > r * r + r * 0.6) continue;
        if (eraseRamp) { var f = (cy + y) / Math.max(4, Math.round(hz + span * 0.15)); b.px(cx + x, cy + y, pick(eraseRamp, f, cx + x, cy + y, 2.2)); continue; }
        b.px(cx + x, cy + y, (x + y < -r * 0.4) ? hi : c);
      }
    }
    // ---------- tiled layers ----------
    function ridgeFill(b, r, topAt, opts) {
      opts = opts || {}; var fade = opts.fade || 24, rim = opts.rim;
      for (var x = 0; x < TW; x++) {
        var t = Math.round(topAt(x)), tl = topAt(x - 2), tr = topAt(x + 2), lit = clamp(0.5 + (tr - tl) * -0.18, 0, 1);
        for (var y = Math.max(0, t); y < HH; y++) {
          var dd = (y - t) / fade, f = (1 - clamp(dd, 0, 1)) * (0.45 + 0.55 * lit) * (opts.bright || 1);
          if (opts.snow && y - t < opts.snow(x, t)) f = 1;
          b.px(x, y, pick(r, f, x, y));
        }
        if (rim && t >= 0) b.px(x, t, lit > 0.5 ? r[r.length - 1] : r[Math.max(0, r.length - 2)]);
      }
    }
    // clouds / ceiling
    if (P.layersOn.clouds) (function () {
      var b = new Buf(TW, HH), am = [];
      if (theme === 'cave') {
        var r = ramp('far', 'clouds');
        // ceiling: stalactites hanging from the top
        var botAt = function (x) { var n = fbm(x, TW, seed + 3, [64, 32, 16]), sp = Math.pow(Math.max(0, pnoise(x, TW, 16, seed + 9) * 1.6 - 0.6), 2) * 1.6; return hz * 0.06 + n * hz * 0.12 + sp * hz * 0.28 * (0.6 + 0.4 * pnoise(x, TW, 4, seed + 4)); };
        for (var x2 = 0; x2 < TW; x2++) {
          var bot = Math.round(botAt(x2)), lit = clamp(0.5 + (botAt(x2 + 1) - botAt(x2 - 1)) * 0.4, 0, 1);
          for (var y2 = 0; y2 < bot; y2++) b.px(x2, y2, pick(r, 0.08 + 0.55 * Math.pow(y2 / Math.max(1, bot), 2) * (0.4 + 0.6 * lit), x2, y2));
          b.px(x2, bot, r[lit > 0.5 ? 3 : 2]);
        }
      } else {
        var n = theme === 'city' ? 4 : 6, cr = (night ? ['#1a2440', '#26324e', '#36425e', '#6a7aa0'] : dusk ? ['#6a3a6a', '#a05a72', '#e08a7a', '#ffd0a0'] : ['#9ab4d4', '#c0d4e8', '#e6eef6', '#ffffff']).map(rgb);
        for (var i = 0; i < n; i++) {
          var cx = Math.round((i + R() * 0.6) * TW / n), cy = Math.round(hz * (0.18 + R() * 0.42)), cw = 22 + Math.round(R() * 28 * P.detail), ch = 6 + Math.round(R() * 6);
          cloud(b, cx, cy, cw, ch, cr, R);
        }
      }
      L.clouds = { name: 'clouds', img: b.canvas(), w: TW, factor: FACTOR.clouds, drift: theme === 'cave' ? 0 : 3 };
    })();
    function cloud(b, cx, cy, cw, ch, cr, R) {
      var puffs = [], k = 3 + Math.round(R() * 3);
      for (var i = 0; i < k; i++) { var u = i / (k - 1) - 0.5, px = cx + Math.round(u * cw * 0.9 + (R() - 0.5) * 4), pr = Math.max(3, Math.round(ch * (1.1 - Math.abs(u) * 1.1) * (0.8 + R() * 0.4))); puffs.push([px, cy - Math.round(pr * 0.35), pr]); }
      for (var y = cy - ch * 2; y <= cy + 2; y++) for (var x = cx - cw; x <= cx + cw; x++) {
        if (y > cy + 1) continue; var best = -1;
        for (var j = 0; j < puffs.length; j++) { var dx = x - puffs[j][0], dy = y - puffs[j][1], q = 1 - Math.sqrt(dx * dx + dy * dy * 1.6) / puffs[j][2]; if (q > best) best = q; }
        if (y >= cy - 2 && Math.abs(x - cx) < cw * 0.55 - (y - cy + 2) * 2) best = Math.max(best, 0.05);
        if (best < 0) continue;
        var f = clamp(0.15 + (cy - y) / (ch * 1.6) * 0.75 + best * 0.25, 0, 1);
        b.px(x, y, pick(cr, f, x, y));
      }
    }
    // far
    (function () {
      var b = new Buf(TW, HH), am = [], r = ramp('far', 'far'), B0 = base.far, A = amp.far;
      if (theme === 'forest') {
        var topAt = function (x) { var n = fbm(x, TW, seed + 11), p = 1 - Math.abs(pnoise(x, TW, 64, seed + 12) * 2 - 1); return B0 - A * (0.25 + 0.5 * n + 0.45 * p * p); };
        ridgeFill(b, r, topAt, { fade: 30, rim: true, snow: night ? null : function (x, t) { return t < B0 - A * 0.78 ? Math.round((B0 - A * 0.78 - t) * 0.8) : 0; } });
      } else if (theme === 'cliffs') {
        var sea = ramp('sea', 'far').map(function (c, i, a) { return day ? c : mix(c, skyR[Math.round(i / (a.length - 1) * (skyR.length - 1))], dusk ? 0.5 : 0.3); });   // the sea mirrors the sky: light steps take the horizon colour
        for (var x = 0; x < TW; x++) for (var y = B0; y < HH; y++) {
          var fs = 0.92 - clamp((y - B0) / (HH - B0), 0, 1) * 0.75, wv = pnoise(x + y * 53, TW, 8, seed + 61);
          if (y > B0 + 1 && (y & 1)) { if (wv > 0.8) fs += 0.22; else if (wv < 0.14) fs -= 0.2; }      // wave dashes, one step lighter / darker
          b.px(x, y, pick(sea, fs, x, y));
        }
        for (var x1 = 0; x1 < TW; x1++) b.px(x1, B0, sea[4]);
        // distant islands / headlands on the horizon
        for (var i = 0; i < 3; i++) {
          var ix = Math.round((i + R() * 0.5) * TW / 3), iw = 30 + Math.round(R() * 50), ih = Math.round(A * (0.2 + R() * 0.3));
          for (var xx = -iw; xx <= iw; xx++) { var q = 1 - Math.abs(xx / iw), t = Math.round(B0 - ih * Math.pow(q, 0.6) * (0.85 + 0.15 * pnoise(ix + xx, TW, 8, seed + i))); for (var y1 = t; y1 < B0; y1++) b.px(ix + xx, y1, pick(r, 0.55 - (y1 - t) / Math.max(1, B0 - t) * 0.3, ix + xx, y1)); b.px(ix + xx, t, r[3]); }
        }
        // sea glints (ambient)
        for (var g = 0; g < 52; g++) am.push({ k: 'glint', q: RA(), x: Math.floor(RA() * TW), y: B0 + 2 + Math.floor(Math.pow(RA(), 1.6) * Math.max(4, base.mid - B0)), p: RA(), s: 0.6 + RA() * 0.8, c: rgb(night ? '#a8c0e8' : dusk ? '#ffd8a0' : '#ffffff') });
      } else if (theme === 'cave') {
        var topAt2 = function (x) { var c = pnoise(x, TW, 32, seed + 21); return B0 - A * (0.3 + 0.7 * Math.pow(c, 2)) - A * 0.4 * Math.pow(pnoise(x, TW, 8, seed + 22), 6); };
        ridgeFill(b, r, topAt2, { fade: 40, rim: true });
        // far columns joining floor and ceiling
        for (var c2 = 0; c2 < 4; c2++) { var cx = Math.round((c2 + R() * 0.7) * TW / 4), cw = 5 + Math.round(R() * 6); for (var yy = 0; yy < B0; yy++) { var wv = cw * (0.55 + 0.45 * Math.pow(Math.abs(yy / B0 - 0.5) * 2, 2)); for (var dx = -wv; dx <= wv; dx++) b.px(cx + dx, yy, pick(r, dx < -wv * 0.3 ? 0.55 : 0.3, cx + dx, yy)); } }
      } else {
        // far skyline: plain pale blocks with a few spires and dim windows
        var x3 = 0;
        while (x3 < TW) {
          var bw = 8 + Math.round(R() * 18), bh = Math.round(A * (0.25 + R() * 0.75)), spire = R() < 0.18;
          if (x3 + bw > TW) bw = TW - x3;
          for (var xx3 = 0; xx3 < bw; xx3++) for (var y3 = B0 - bh; y3 < HH; y3++) b.px(x3 + xx3, y3, pick(r, xx3 === 0 ? 0.6 : 0.35 - clamp((y3 - B0 + bh) / 60, 0, 0.25), x3 + xx3, y3));
          if (spire) for (var sy = 1; sy < 8; sy++) b.px(x3 + (bw >> 1), B0 - bh - sy, r[2]);
          if (!day) for (var wy = B0 - bh + 3; wy < B0; wy += 3) for (var wx = x3 + 2; wx < x3 + bw - 1; wx += 3) if (hash(wx, wy, seed + 5) < (night ? 0.16 : 0.07)) b.px(wx, wy, mix(rgb(MAT.city.win[0]), r[2], 0.35));
          x3 += bw + (R() < 0.3 ? 1 + Math.round(R() * 3) : 0);
        }
      }
      if (night && theme !== 'cave') for (var s = 0; s < 140; s++) { var sy2 = Math.floor(Math.pow(RA(), 1.3) * hz * 0.95); (st.stars || (st.stars = [])).push({ q: RA(), x: Math.floor(RA() * W), y: sy2, p: RA(), s: 0.4 + RA(), big: RA() < 0.12 }); }
      L.far = { name: 'far', img: b.canvas(), w: TW, factor: FACTOR.far, am: am, buf: b };
    })();
    // back
    if (P.layersOn.back) (function () {
      var b = new Buf(TW, HH), am = [], r = ramp('back', 'back'), B0 = base.back, A = amp.back;
      if (theme === 'forest') {
        var topAt = function (x) { return B0 - A * (0.3 + 0.7 * fbm(x, TW, seed + 31, [128, 64, 32])); };
        ridgeFill(b, r, topAt, { fade: 22, rim: true });
        for (var x = 0; x < TW; x += 3 + Math.floor(hash(x, 1, seed) * 4)) { if (hash(x, 2, seed) < 0.45) continue; var t = Math.round(topAt(x)), h = 4 + Math.floor(hash(x, 3, seed) * 5); for (var k = 0; k < h; k++) for (var w = -Math.floor(k / 2); w <= Math.floor(k / 2); w++) b.px(x + w, t - h + k + 2, w < 0 ? r[3] : r[1]); }
      } else if (theme === 'cliffs') {
        // headlands with open sea between them: land where the noise is high, a sloped plateau with a grass cap
        var landAt = function (x) { return pnoise(x, TW, 128, seed + 41) * 0.75 + pnoise(x, TW, 32, seed + 43) * 0.25; };
        var topAt2 = function (x) { var n = landAt(x), q = clamp((n - 0.45) / 0.12, 0, 1); return q <= 0 ? HH : B0 - A * (0.35 + 0.65 * smooth(q) * (0.7 + 0.3 * pnoise(x, TW, 16, seed + 42))); };
        var gr = ramp('grass', 'back'), foam = ramp('foam', 'back');
        for (var x2 = 0; x2 < TW; x2++) {
          var t2 = Math.round(topAt2(x2)); if (t2 >= HH) continue;
          var face = topAt2(x2 + 1) - topAt2(x2 - 1);
          for (var y2 = t2; y2 < B0 + 2; y2++) b.px(x2, y2, pick(r, clamp((face < -0.5 ? 0.72 : face > 0.5 ? 0.18 : 0.42) + (pnoise(y2 + x2 * 0.2, 1024, 5, seed + 44) - 0.5) * 0.25, 0, 1), x2, y2));
          b.px(x2, t2, gr[2]); b.px(x2, t2 + 1, gr[1]); if (hash(x2, 7, seed) < 0.4) b.px(x2, t2 + 2, gr[0]);
          if (hash(x2, 9, seed) < 0.75) b.px(x2, B0 + 2, foam[0]);
        }
      } else if (theme === 'cave') {
        for (var c = 0; c < 6; c++) { var cx = Math.round((c + R() * 0.6) * TW / 6), cw = 6 + Math.round(R() * 8); for (var yy = 0; yy < HH; yy++) { var wv = cw * (0.5 + 0.5 * Math.pow(Math.abs(yy / B0 - 0.55) * 1.6, 2)) + pnoise(yy, 1024, 8, c + seed) * 2; for (var dx = -wv; dx <= wv; dx++) b.px(cx + dx, yy, pick(r, dx < -wv * 0.4 ? 0.7 : dx > wv * 0.5 ? 0.1 : 0.35, cx + dx, yy)); } }
        ridgeFill(b, r, function (x) { return B0 - A * 0.4 * fbm(x, TW, seed + 44, [64, 32, 16]); }, { fade: 30, rim: true });
      } else {
        var x4 = 0;
        while (x4 < TW) {
          var bw = 12 + Math.round(R() * 20), bh = Math.round(A * (0.6 + R() * 1.6)); if (x4 + bw > TW) bw = TW - x4;
          building(b, x4, B0 - bh, bw, HH, r, night ? 0.3 : dusk ? 0.16 : 0, 3, am);
          x4 += bw + Math.round(R() * 4);
        }
      }
      L.back = { name: 'back', img: b.canvas(), w: TW, factor: FACTOR.back, am: am };
    })();
    function building(b, x0, top, bw, bot, r, lit, gap, am) {
      for (var x = 0; x < bw; x++) for (var y = top; y < bot; y++) b.px(x0 + x, y, pick(r, x === 0 ? 0.75 : x === bw - 1 ? 0.05 : 0.32 + (y - top < 2 ? 0.25 : 0), x0 + x, y));
      var roof = hash(x0, top, seed);
      if (roof < 0.3) for (var x2 = 1; x2 < bw - 1; x2++) b.px(x0 + x2, top - 1, r[2]);                         // parapet
      else if (roof < 0.5 && bw > 10) { var tx = x0 + 3 + Math.floor(hash(x0, 3, seed) * (bw - 9)); for (var yy = 0; yy < 5; yy++) for (var xx = 0; xx < 5; xx++) b.px(tx + xx, top - 7 + yy, pick(r, xx === 0 ? 0.7 : 0.3, tx + xx, yy)); b.px(tx + 1, top - 2, r[1]); b.px(tx + 3, top - 2, r[1]); b.px(tx + 1, top - 1, r[1]); b.px(tx + 3, top - 1, r[1]); }
      else if (roof < 0.7) { var ax = x0 + Math.floor(bw / 2); for (var ay = 1; ay < 9; ay++) b.px(ax, top - ay, r[1]); if (am) am.push({ k: 'blink', x: ax, y: top - 9, p: hash(x0, 5, seed), s: 0.8 + hash(x0, 6, seed) * 0.5 }); }
      for (var wy = top + 3; wy < bot - 2; wy += gap + 1) for (var wx = x0 + 2; wx < x0 + bw - 2; wx += gap) {
        var hv = hash(wx, wy, seed + 77), on = hv < lit, c = on ? rgb(MAT.city.win[hv < lit * 0.15 ? 2 : hv < lit * 0.3 ? 3 : 0]) : r[day ? 3 : 1];
        if (on) c = grade(c, 0.9, true);
        b.px(wx, wy, c); if (gap > 3) b.px(wx, wy + 1, on ? mix(c, r[1], 0.3) : c);
        if (on && am && hv < lit * 0.05) am.push({ k: 'win', x: wx, y: wy, h: gap > 3 ? 2 : 1, p: hv * 97 % 1, s: 0.5 + hv, c: c, off: r[1] });
      }
    }
    // mid
    (function () {
      var b = new Buf(TW, HH), am = [], B0 = base.mid, A = amp.mid;
      if (theme === 'forest') {
        var r = ramp('mid', 'mid'), tr = ramp('trunk', 'mid');
        for (var x = 0; x < TW; x++) for (var y = B0 - 2; y < HH; y++) b.px(x, y, pick(r, 0.22 - clamp((y - B0) / 40, 0, 0.2), x, y));
        var n = Math.round(TW / 16 * P.detail), xs = [];
        for (var i = 0; i < n; i++) xs.push(Math.round((i + R() * 0.8) * TW / n));
        xs.forEach(function (tx, i) {
          var conifer = R() < 0.35, h = Math.round(A * (0.6 + R() * 0.55)), by = B0 + Math.round(R() * 3);
          if (conifer) tree2(b, tx, by, h, r); else tree1(b, tx, by, h, r, tr, R);
        });
        if (!day) for (var f = 0; f < 24; f++) am.push({ k: 'fly', q: RA(), x: Math.floor(RA() * TW), y: B0 - Math.floor(RA() * A * 0.9), p: RA(), s: 0.6 + RA() * 0.8 });
      } else if (theme === 'cliffs') {
        var r2 = ramp('mid', 'mid'), gr = ramp('grass', 'mid'), stacks = [], k = 3;
        k = 4; for (var s = 0; s < k; s++) stacks.push({ x: Math.round((s + 0.2 + R() * 0.5) * TW / k), w: 8 + Math.round(R() * 20), h: Math.round(A * (0.8 + R() * 0.9)), e: 8 + Math.round(R() * 8) });
        var topAt = function (x) { var best = B0 + 2; stacks.forEach(function (S) { var dx = Math.abs(((x - S.x) % TW + TW + TW / 2) % TW - TW / 2), q = clamp((S.w - dx) / S.e + 0.5, 0, 1); if (q > 0) best = Math.min(best, B0 - S.h * Math.pow(smooth(q), 0.7) + 3 * pnoise(x, TW, 8, seed + 5) + (q < 1 ? 2 * pnoise(x, TW, 4, seed + 6) : 0)); }); return best; };
        for (var x5 = 0; x5 < TW; x5++) {
          var t5 = Math.round(topAt(x5)); if (t5 >= B0 + 2) continue;
          var l5 = topAt(x5 - 2), rr5 = topAt(x5 + 2), face = rr5 - l5, crack = pnoise(x5, TW, 4, seed + 8) > 0.86;
          for (var y5 = t5; y5 < B0 + 4; y5++) {
            var strata = (pnoise(y5 * 1.0 + pnoise(x5, TW, 32, seed + 2) * 6, 1024, 4, seed + 3) - 0.5) * 0.3, f5 = clamp((face < -1 ? 0.78 : face > 1 ? 0.1 : 0.42) + strata - clamp((y5 - t5) / 80, 0, 0.25), 0, 1);
            if (crack && y5 > t5 + 4 && pnoise(y5, 1024, 8, x5) > 0.35) f5 = 0.02;
            b.px(x5, y5, pick(r2, f5, x5, y5));
          }
          b.px(x5, t5, gr[3]); b.px(x5, t5 + 1, gr[2]); b.px(x5, t5 + 2, gr[1]); if (hash(x5, 3, seed) < 0.5) b.px(x5, t5 + 3, gr[0]); if (hash(x5, 4, seed) < 0.25) b.px(x5, t5 + 4, gr[0]);
        }
        var fo = ramp('foam', 'mid'); for (var x6 = 0; x6 < TW; x6++) { var t6 = topAt(x6); if (t6 < B0 + 2) { b.px(x6, B0 + 3, fo[0]); if (hash(x6, 12, seed) < 0.5) b.px(x6, B0 + 4, fo[0]); } }
        for (var g2 = 0; g2 < 16; g2++) am.push({ k: 'foam', q: RA(), x: Math.floor(RA() * TW), y: B0 + 4, p: RA(), s: 0.6 + RA() * 0.6, c: fo[1] });
      } else if (theme === 'cave') {
        var r3 = ramp('mid', 'mid'), cr = ramp('crystal', 'mid').map(function (c, i) { return i >= 2 ? mix(c, rgb(MAT.cave.crystal[i]), 0.7) : c; }), cr2 = ramp('crystal2', 'mid').map(function (c, i) { return i >= 2 ? mix(c, rgb(MAT.cave.crystal2[i]), 0.7) : c; });
        ridgeFill(b, r3, function (x) { return B0 - A * 0.25 * fbm(x, TW, seed + 51, [32, 16, 8]); }, { fade: 18, rim: true });
        var ns = Math.round(TW / 40 * P.detail);
        for (var s3 = 0; s3 < ns; s3++) {
          var sx = Math.round((s3 + R() * 0.7) * TW / ns), sh = Math.round(A * (0.5 + R() * 0.9)), sw = 4 + Math.round(R() * 5);
          for (var y7 = 0; y7 < sh; y7++) { var wv = sw * Math.pow(y7 / sh, 0.8); for (var d7 = -wv; d7 <= wv; d7++) b.px(sx + d7, B0 - sh + y7, pick(r3, d7 < -wv * 0.3 ? 0.7 : d7 > wv * 0.4 ? 0.12 : 0.35, sx + d7, y7)); }
          // matching stalactite from the top
          var th = Math.round(hz * (0.25 + R() * 0.4)), tw = 3 + Math.round(R() * 4);
          for (var y8 = 0; y8 < th; y8++) { var w8 = tw * Math.pow(1 - y8 / th, 0.9); for (var d8 = -w8; d8 <= w8; d8++) b.px(sx + 7 + d8, y8, pick(r3, d8 < -w8 * 0.3 ? 0.55 : 0.2, sx + d8, y8)); }
          am.push({ k: 'drip', x: sx + 7, y: th, y1: B0 - 2, p: RA(), s: 0.3 + RA() * 0.4 });
        }
        for (var m = 0; m < 64; m++) am.push({ k: 'mote', q: RA(), x: 0, y: 0, p: RA(), s: 0.5 + RA() * 0.8 });   // dust in the light shafts, in front of the mid rocks
        var nc = Math.round(TW / 70 * P.detail);
        for (var c9 = 0; c9 < nc; c9++) { var cx9 = Math.round((c9 + 0.3 + R() * 0.5) * TW / nc), cyy = B0 - Math.round(R() * 3), C9 = R() < 0.5 ? cr : cr2; crystalCluster(b, cx9, cyy, C9, R, am); }
      } else {
        var r4 = ramp('mid', 'mid'), x7 = 0;
        while (x7 < TW) {
          var bw = 20 + Math.round(R() * 26), bh = Math.round(A * (0.7 + R() * 1.5)); if (x7 + bw > TW) bw = TW - x7;
          building(b, x7, B0 - bh, bw, HH, r4, night ? 0.42 : dusk ? 0.26 : 0, 4, am);
          x7 += bw + 2 + Math.round(R() * 6);
        }
      }
      L.mid = { name: 'mid', img: b.canvas(), w: TW, factor: FACTOR.mid, am: am };
    })();
    function tree1(b, tx, by, h, r, tr, R) {
      var cw = Math.round(h * 0.42), cy = by - Math.round(h * 0.62), puffs = [];
      for (var i = 0; i < 5; i++) puffs.push([tx + Math.round((R() - 0.5) * cw * 1.1), cy + Math.round((R() - 0.4) * h * 0.35), Math.round(cw * (0.5 + R() * 0.35))]);
      for (var y = cy; y < by; y++) for (var x = -1; x <= 1; x++) b.px(tx + x, y, x < 0 ? tr[2] : tr[x === 0 ? 1 : 0]);
      for (var yy = cy - h; yy < by - h * 0.15; yy++) for (var xx = tx - cw * 1.4; xx < tx + cw * 1.4; xx++) {
        var inside = -1, sh = 0;
        for (var j = 0; j < puffs.length; j++) { var dx = xx - puffs[j][0], dy = yy - puffs[j][1], q = 1 - Math.sqrt(dx * dx + dy * dy) / puffs[j][2]; if (q > inside) { inside = q; sh = clamp(0.55 - (dx + dy) / (puffs[j][2] * 2.2), 0, 1); } }
        if (inside < 0) continue;
        if (inside < 0.12 && hash(xx, yy, 3) < 0.4) continue;              // ragged leaf edge
        var leaf = (hash(xx >> 1, yy >> 1, 11) - 0.5) * 0.25;
        b.px(xx, yy, pick(r, clamp(0.12 + sh * 0.85 + leaf, 0, 1), xx, yy, 3.5));
      }
    }
    function tree2(b, tx, by, h, r) {
      for (var y = 0; y < h; y++) { var q = y / h, tier = (y % Math.max(4, Math.round(h / 4))) / Math.max(4, Math.round(h / 4)), w = Math.round((1.5 + q * h * 0.32) * (0.75 + 0.25 * tier));
        for (var x = -w; x <= w; x++) b.px(tx + x, by - h + y, pick(r, x < 0 ? 0.62 - q * 0.2 + tier * 0.15 : 0.18 + tier * 0.1, tx + x, by - h + y, 3.5)); }
      for (var y2 = 0; y2 < 3; y2++) b.px(tx, by + y2, r[0]);
    }
    function crystalCluster(b, cx, by, C, R, am) {
      var k = 2 + Math.round(R() * 2);
      for (var i = 0; i < k; i++) {
        var lean = (i - (k - 1) / 2) * 0.35, h = 7 + Math.round(R() * 8), w = 2 + Math.round(R() * 1.5), x0 = cx + Math.round((i - (k - 1) / 2) * 4);
        for (var y = 0; y < h; y++) { var ww = y < 3 ? Math.round(w * y / 3) : w; for (var dx = -ww; dx <= ww; dx++) { var X = x0 + dx + Math.round(lean * (h - y)), Y = by - h + y; b.px(X, Y, dx < 0 ? C[3] : dx === 0 ? C[2] : C[1]); if (dx === -ww && y > 1) b.px(X, Y, C[4]); } }
        am.push({ k: 'glow', x: x0 + Math.round(lean * h * 0.5), y: by - Math.round(h * 0.55), p: RA(), s: 0.4 + RA() * 0.4, c: C[4], c2: C[3] });
      }
    }
    // near (darkest, closest; grass tufts sway)
    if (P.layersOn.near) (function () {
      var b = new Buf(TW, HH), am = [], B0 = base.near, A = amp.near, r = ramp('near', 'near');
      if (theme === 'city') {
        var x = 0; while (x < TW) {
          var w = 24 + Math.round(R() * 40), h = Math.round(A * (0.25 + R() * 0.6)); if (x + w > TW) w = TW - x;
          for (var xx = 0; xx < w; xx++) for (var y = B0 - h; y < HH; y++) b.px(x + xx, y, pick(r, y === B0 - h ? 0.85 : xx === 0 ? 0.5 : 0.22, x + xx, y));
          if (R() < 0.6) { var cx = x + 3 + Math.floor(R() * (w - 8)); for (var cy = 0; cy < 6; cy++) for (var cxx = 0; cxx < 4; cxx++) b.px(cx + cxx, B0 - h - 6 + cy, pick(r, cxx === 0 ? 0.6 : 0.3, cx, cy)); }
          if (R() < 0.55) { var lx = x + Math.floor(w / 2), lh = 14 + Math.floor(R() * 8); for (var ly = 0; ly < lh; ly++) b.px(lx, B0 - h - ly, r[2]); b.px(lx + 1, B0 - h - lh, r[2]); b.px(lx + 2, B0 - h - lh, r[3]); if (!day) am.push({ k: 'lamp', x: lx + 2, y: B0 - h - lh + 1, p: RA(), s: 1, c: grade(MAT.city.lamp[0], 1, true) }); }
          for (var fx = 0; fx < w; fx += 3) for (var fy = 1; fy < 5; fy++) if (fy === 1 || fy === 4 || fx % 3 === 0) b.px(x + fx, B0 - h - fy, r[1]);
          x += w;
        }
      } else {
        var bumps = Math.round(TW / 22 * P.detail), cols = theme === 'cave' ? 0.3 : 0.45;
        for (var x2 = 0; x2 < TW; x2++) for (var y2 = B0; y2 < HH; y2++) b.px(x2, y2, pick(r, 0.2 - clamp((y2 - B0) / 30, 0, 0.18), x2, y2));
        for (var i = 0; i < bumps; i++) {
          var bx = Math.round((i + R() * 0.8) * TW / bumps), br = Math.round(A * (0.35 + R() * 0.55)), rock = theme === 'cave' || (theme === 'cliffs' && R() < 0.5);
          for (var yy = -br; yy <= 2; yy++) for (var xx2 = -br * 1.5; xx2 <= br * 1.5; xx2++) {
            var q = (xx2 * xx2) / (2.25 * br * br) + (yy * yy) / (br * br); if (q > 1) continue;
            if (!rock && q > 0.8 && hash(bx + xx2, yy, 5) < 0.5) continue;
            var sh = clamp(0.5 - (xx2 / (br * 1.5) + yy / br) * 0.45 + (rock ? 0 : (hash((bx + xx2) >> 1, yy >> 1, 9) - 0.5) * 0.3), 0, 1) * (rock ? 0.85 : 1);
            b.px(bx + xx2, B0 + yy, pick(r, sh * (1 - cols * 0.3), bx + xx2, B0 + yy, 3));
          }
          if (theme === 'cave' && R() < 0.55) { var C = ramp('shroom', 'near').map(function (c) { return night ? mix(c, rgb('#e89a7a'), 0.35) : c; }), mx = bx + Math.round((R() - 0.5) * br * 2), mh = 3 + Math.round(R() * 3); for (var my = 0; my < mh; my++) b.px(mx, B0 - br * 0.3 - my, r[3]); for (var cxm = -2; cxm <= 2; cxm++) { b.px(mx + cxm, B0 - br * 0.3 - mh, C[cxm < 0 ? 3 : 2]); if (Math.abs(cxm) < 2) b.px(mx + cxm, B0 - br * 0.3 - mh - 1, C[cxm < 0 ? 3 : 2]); } if (!day) am.push({ k: 'glow', x: mx, y: Math.round(B0 - br * 0.3 - mh - 1), p: RA(), s: 0.3, c: C[3], c2: C[2] }); }
        }
        if (theme === 'forest' && day) { var FL = MAT.forest.flower.map(rgb); for (var fl = 0; fl < TW / 9; fl++) { var fxp = Math.floor(R() * TW), fyp = B0 - Math.floor(R() * A * 0.5); if (b.on(fxp, fyp)) b.px(fxp, fyp, FL[Math.floor(R() * FL.length)]); } }
        if (theme !== 'cave') for (var tf = 0; tf < TW / 3.5; tf++) { var tx = Math.floor(RA() * TW), ty = B0 - Math.floor(RA() * A * 0.6); while (ty > 0 && b.on(tx, ty - 1)) ty--; am.push({ k: 'tuft', q: RA(), x: tx, y: ty + 1, h: 3 + Math.floor(RA() * 4), p: RA(), s: 0.7 + RA() * 0.6, c: r[3], c2: r[4] }); }
      }
      L.near = { name: 'near', img: b.canvas(), w: TW, factor: FACTOR.near, am: am };
    })();
    // floor (static ground plane for static backdrops such as side-view battles)
    if (floorOn) (function () {
      var b = new Buf(W, H), r = ramp('floor', 'floor'), y0 = gy, Hf = Math.max(1, H - y0);
      for (var y = y0; y < H; y++) {
        var q = (y - y0) / Hf, depth = 1 / (0.12 + q), row = Math.floor(depth * 5);
        for (var x = 0; x < W; x++) {
          var u = (x - W / 2) * (0.2 + q) / 7, f = 0.78 - q * 0.45, m = 0, mark;
          if (theme === 'forest') { mark = hash(Math.floor(u * 3), row, seed); m = mark > 0.82 ? 0.18 : mark < 0.12 ? -0.18 : 0; }
          else if (theme === 'cliffs') { m = Math.sin(u * 2 + depth * 1.4) > 0.92 ? 0.14 : (hash(x >> 1, y, seed) > 0.95 ? -0.2 : 0); }
          else if (theme === 'cave') { var c = hash(Math.floor(u), row, seed); m = Math.abs(depth * 5 - row) < 0.08 * (1 + q * 3) ? -0.3 : (c - 0.5) * 0.12; }
          else { var bx = Math.floor(u + (row % 2) * 0.5); m = Math.abs(depth * 5 - row) < 0.07 * (1 + q * 3) || Math.abs(u + (row % 2) * 0.5 - bx) < 0.05 * (1 + q) ? -0.28 : (hash(bx, row, seed) - 0.5) * 0.12; }
          var calm = Math.min(q / 0.14, (1 - q) / 0.1, 1); m *= 1 - 0.5 * clamp(calm + (bay(x, y) - 0.5) * 0.3, 0, 1);
          b.px(x, y, pick(r, clamp(f + m, 0, 1), x, y, 3));
        }
      }
      // prop groups: along the back edge and in the front corners, never in the middle of the standing area
      var stone = ['#3a3640', '#55505a', '#706a72', '#8e8890', '#b0aab0'].map(function (c) { return grade(c, 0.8); }), RF = rng(seed * 13 + 101);
      var spots = [[0.05, 0.07], [0.22, 0.03], [0.45, 0.05], [0.7, 0.03], [0.92, 0.06], [0.05, 0.6], [0.96, 0.55], [0.1, 0.92], [0.88, 0.95], [0.5, 0.99]];
      spots.forEach(function (sp, i) {
        var px = Math.round(sp[0] * W + (RF() - 0.5) * 16), py = Math.round(y0 + sp[1] * Hf + 2), sc = 1 + (py - y0) / Hf * 1.6, kind = RF();
        if (kind < 0.45) rock(b, px, py, Math.round(5 * sc + RF() * 4 * sc), Math.round(3 * sc + RF() * 2 * sc), stone);
        if (theme === 'city' && kind >= 0.45) crate(b, px, py, Math.round(8 * sc), stone);
        else if (theme === 'cave' && kind >= 0.45) shard(b, px, py, Math.round(6 * sc), ramp(RF() < 0.5 ? 'crystal' : 'crystal2', 'floor'));
        else clump(b, px + Math.round(6 * sc), py, Math.round(5 * sc), r, i);
        if (RF() < 0.7) clump(b, px - Math.round(7 * sc), py + 1, Math.round(3 * sc), r, i + 9);
      });
      // darkest foreground corners (dithered, no smooth alpha)
      var ink = grade(theme === 'cave' ? '#06040a' : '#0e0c16', 1);
      for (var y3 = y0; y3 < H; y3++) for (var x3 = 0; x3 < W; x3++) { var dx = (x3 / W - 0.5) * 2, dy = (y3 - y0) / Hf, e = (dx * dx * 0.9 + dy * dy * 0.7 - 0.95) * 5; if (e > 1 || (e > 0 && e > bay(x3, y3))) b.px(x3, y3, ink, 0.5); }
      // feathered edge where the floor meets the landscape
      for (var x2 = 0; x2 < W; x2++) for (var k = 0; k < 3; k++) if (bay(x2, y0 + k) > 0.35 + k * 0.25) b.d[((y0 + k) * W + x2) * 4 + 3] = 0;
      L.floor = { name: 'floor', img: b.canvas(), w: W, factor: 0, fixed: true };
    })();
    function rock(b, cx, cy, rx, ry, R5) {
      for (var y = -ry; y <= 1; y++) for (var x = -rx; x <= rx; x++) { var q = (x * x) / (rx * rx) + (y * y) / (ry * ry); if (q > 1) continue; var f = clamp(0.62 - (x / rx) * 0.3 - (y / ry) * 0.35 - q * 0.25, 0, 1); b.px(cx + x, cy + y, q > 0.82 && (x > 0 || y > -ry * 0.3) ? R5[0] : pick(R5, f, cx + x, cy + y, 3)); }
      b.px(cx - Math.round(rx * 0.4), cy - Math.round(ry * 0.6), R5[4]);
      for (var x2 = -rx + 1; x2 < rx; x2++) b.px(cx + x2, cy + 2, R5[0], 0.5);
    }
    function clump(b, cx, by, h, R5, k) {
      for (var i = -h; i <= h; i++) { var bh = Math.round(h * (1 - Math.abs(i) / (h + 1)) * (0.6 + 0.4 * hash(i, k, seed))) + 1, lean = i < 0 ? -1 : i > 0 ? 1 : 0; for (var y = 0; y < bh; y++) b.px(cx + i + (y > bh * 0.6 ? lean : 0), by - y, y === bh - 1 ? R5[Math.min(4, 3)] : y > bh * 0.5 ? R5[2] : R5[0]); }
    }
    function crate(b, cx, by, s, R5) {
      var wood = ['#3a2418', '#5a3a24', '#7a5232', '#9a6e44', '#b88a5a'].map(function (c) { return grade(c, 0.8); });
      for (var y = 0; y < s; y++) for (var x = 0; x < s; x++) { var edge = x === 0 || y === 0 || x === s - 1 || y === s - 1 || x === y || x === s - 1 - y; b.px(cx - (s >> 1) + x, by - s + y, edge ? wood[x === 0 || y === 0 ? 3 : 0] : wood[x < s / 2 ? 2 : 1]); }
      for (var x3 = 0; x3 < s; x3++) b.px(cx - (s >> 1) + x3, by + 1, wood[0], 0.5);
    }
    function shard(b, cx, by, h, C) {
      for (var y = 0; y < h; y++) { var w = y < 2 ? 0 : 1; for (var dx = -w; dx <= w; dx++) b.px(cx + dx + Math.round((h - y) * 0.2), by - h + y, dx < 0 ? C[3] : dx === 0 ? C[2] : C[1]); }
      b.px(cx + Math.round(h * 0.2) - 1, by - h + 2, C[4]);
    }
    var out = [];
    ORDER.forEach(function (n) { if (L[n] && (n === 'sky' || P.layersOn[n])) out.push(L[n]); });
    if (L.floor) out.push(L.floor);
    return out;
  }

  /* ---------------- ambient drawing (pure function of t) ---------------- */
  function drawAmbient(g, st, layer, ox, oy, t, avoid) {
    var am = layer.am; if (!am || !am.length || st.P.ambient <= 0) return;
    var v = st.view, TW = layer.w, sec = t / 1000;
    function sx(x) { var X = Math.floor(x) - ox; X = ((X % TW) + TW) % TW; return X; }
    function put(x, y, c, w, h) {
      // x in tile space; draw every repeat that lands inside the view
      var X0 = sx(x);
      for (var X = X0; X < v.w; X += TW) {
        var px = v.x + X, py = v.y + Math.floor(y) + oy;
        if (avoid(px, py, w || 1, h || 1)) continue;
        g.fillStyle = css(c); g.fillRect(px, py, w || 1, h || 1);
      }
    }
    for (var i = 0; i < am.length; i++) {
      var a = am[i], ph;
      if (a.q != null && a.q >= st.P.ambient / 2) continue;      // count-scaled kinds: ambient 1 = half the pool, 2 = all
      if (a.k === 'glint') { ph = (sec * 0.35 * a.s + a.p) % 1; if (ph < 0.18) { var gw = ph < 0.06 || ph > 0.12 ? 1 : 3; put(a.x - (gw >> 1), a.y, a.c, gw, 1); } }
      else if (a.k === 'foam') { ph = (sec * 0.25 * a.s + a.p) % 1; if (ph < 0.4) put(a.x + Math.floor(ph * 10), a.y, a.c, 2, 1); }
      else if (a.k === 'fly') { ph = (sec * 0.22 * a.s + a.p) % 1; var on = ((sec * 0.5 * a.s + a.p * 3) % 1) < 0.55; if (on) put(a.x + Math.round(Math.sin(sec * 0.6 * a.s + a.p * 9) * 6), a.y + Math.round(Math.sin(sec * 0.9 * a.s + a.p * 5) * 3), st.time === 'night' ? [210, 255, 150] : [255, 230, 140], 1, 1); }
      else if (a.k === 'blink') { ph = (sec * a.s + a.p) % 1; if (ph < 0.3) put(a.x, a.y, [255, 72, 72], 1, 1); }
      else if (a.k === 'win') { ph = (sec * 0.08 * a.s + a.p) % 1; if (ph < 0.22) put(a.x, a.y, a.off, 1, a.h); }
      else if (a.k === 'lamp') { put(a.x, a.y, a.c, 1, 1); if (((sec * 2.2 + a.p * 7) % 7) < 0.08) put(a.x, a.y, [120, 110, 90], 1, 1); }
      else if (a.k === 'glow') { ph = (sec * a.s + a.p) % 1; put(a.x, a.y - 1, ph < 0.5 ? a.c : a.c2, 1, 3); if (ph < 0.12) { put(a.x - 1, a.y, a.c, 1, 1); put(a.x + 1, a.y, a.c, 1, 1); } }
      else if (a.k === 'drip') { ph = (sec * a.s + a.p) % 1; var fall = a.y1 - a.y; if (ph < 0.6) { var q = ph / 0.6; put(a.x, a.y + Math.floor(q * q * fall), st.time === 'night' ? [120, 180, 220] : [150, 170, 190], 1, 3); } else if (ph < 0.66) { put(a.x - 1, a.y1, [150, 170, 190], 1, 1); put(a.x + 1, a.y1 - 1, [150, 170, 190], 1, 1); } }
      else if (a.k === 'mote') {
        var sh = st.shafts; if (!sh || !sh.length) continue;
        var S = sh[i % sh.length]; ph = (sec * 0.09 * a.s + a.p) % 1; var yy = Math.floor((1 - ph) * v.h * 0.9), xx = Math.floor(S.x + S.w * ((a.p * 7) % 1) + yy * S.sl + Math.sin(sec * 0.7 + a.p * 9) * 2);
        var px2 = v.x + xx, py2 = v.y + yy; if (!avoid(px2, py2, 1, 1) && px2 < v.x + v.w) { g.fillStyle = css(st.time === 'night' ? [140, 180, 240] : [255, 236, 190]); g.fillRect(px2, py2, 1, 1); }
      }
      else if (a.k === 'tuft') {
        var wv = Math.sin(sec * 1.6 * a.s + a.p * 6.28 + a.x * 0.05);
        for (var k = 0; k < a.h; k++) { var lean = Math.round(wv * k / a.h * 1.4); put(a.x + lean, a.y - k, k === a.h - 1 ? a.c2 : a.c, 1, 1); if (k < 2) put(a.x + 1 + lean, a.y - k, a.c, 1, 1); }
      }
    }
  }
  function drawStars(g, st, t, avoid) {
    if (!st.stars) return; var v = st.view, sec = t / 1000;
    for (var i = 0; i < st.stars.length; i++) {
      var s = st.stars[i], ph = (sec * 0.45 * s.s + s.p) % 1, x = v.x + s.x, y = v.y + s.y;
      if (s.q >= Math.max(0.5, st.P.ambient / 2)) continue;       // stars stay (half the pool) even at ambient 0; they just stop twinkling
      if (avoid(x, y, 1, 1)) continue;
      var c = ph < 0.12 ? [255, 255, 255] : ph < 0.5 ? [190, 205, 240] : [110, 124, 170];
      if (ph > 0.75 && !s.big) continue;
      g.fillStyle = css(c); g.fillRect(x, y, 1, 1);
      if (s.big && ph < 0.12) { g.fillStyle = css([150, 170, 220]); g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1); g.fillRect(x, y + 1, 1, 1); }
    }
  }

  /* ---------------- built-in pixel16 look (used when GameDNA_Skin is not loaded) ---------------- */
  var BUILTIN = { id: 'pixel16-builtin', pixel: true, motion: { stepMs: 1000 / 60 } };

  /* ---------------- instance ---------------- */
  function create(opt) {
    opt = opt || {};
    var SKAPI = root.GameDNA_Skin || null, SK = null;
    try { SK = SKAPI ? SKAPI.resolve(opt.skin) : null; } catch (e) { SK = null; }
    var skin = SK || BUILTIN;
    var st = { o: opt, seed: (opt.seed == null ? 1 : opt.seed | 0) >>> 0, theme: 'forest', time: 'day', clock: 0, layers: null, dirty: true, last: null, frames: 0 };
    st.pixel = skin.pixel !== false;
    st.skinPal = skin.palette && skin.palette.backdrop || null;
    var P = {}; for (var k in DEFAULTS) P[k] = DEFAULTS[k];
    function setParams(p) {
      p = p || {};
      for (var k in p) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && p[k] != null) {
        var v = p[k];
        if (typeof DEFAULTS[k] === 'number') { v = Number(v); if (!isFinite(v)) { warn('p' + k, 'param ' + k + ' is not a number; kept ' + P[k]); continue; } v = clamp(v, LIMITS[k][0], LIMITS[k][1]); if (k === 'layers') v = Math.round(v); }
        else v = String(v) === 'plain' ? 'plain' : 'none';
        if (P[k] !== v) { P[k] = v; if (['layers', 'horizon', 'ground', 'floor', 'detail'].indexOf(k) >= 0) st.dirty = true; }
      }
      var on = {}; (PICK[P.layers] || PICK[5]).forEach(function (n) { on[n] = true; }); P.layersOn = on;
    }
    st.P = P; setParams(opt.params);
    function setView(v) {
      var c = null; try { c = v || null; } catch (e) { }
      var w = c && c.w > 0 ? Math.round(c.w) : 256, h = c && c.h > 0 ? Math.round(c.h) : 224;
      if (!c) warn('view', 'no view given; using 256x224 at 0,0 (pass view: {x, y, w, h} = the play field)');
      st.view = { x: Math.round((c && c.x) || 0), y: Math.round((c && c.y) || 0), w: w, h: h };
      st.TW = Math.max(256, 128 * Math.ceil(w * 1.5 / 128)); st.M = 32; st.dirty = true;
    }
    setView(opt.view || opt.bounds);
    function setTheme(theme, time) {
      if (theme != null) { if (THEMES.indexOf(theme) < 0) warn('theme' + theme, 'unknown theme "' + theme + '"; using forest'); var th = THEMES.indexOf(theme) >= 0 ? theme : 'forest'; if (th !== st.theme) { st.theme = th; st.dirty = true; } }
      if (time != null) { var tm = TIMES.indexOf(time) >= 0 ? time : 'day'; if (time && TIMES.indexOf(time) < 0) warn('time' + time, 'unknown time "' + time + '"; using day'); if (tm !== st.time) { st.time = tm; st.dirty = true; } }
    }
    setTheme(opt.theme || 'forest', opt.time || 'day');
    function ensure() {
      if (!st.dirty && st.layers) return st.layers;
      st.stars = null; st.shafts = null;
      try { st.layers = build(st); } catch (e) { warn('build', 'could not build layers: ' + (e && e.message)); st.layers = st.layers || []; }
      st.dirty = false; return st.layers;
    }
    function rects(fn) { if (!fn) return []; try { var r = typeof fn === 'function' ? fn() : fn; return Array.isArray(r) ? r.filter(function (q) { return q && isFinite(q.x) && isFinite(q.y) && q.w > 0 && q.h > 0; }) : []; } catch (e) { warn('cb', 'getObstacles/uiRects threw: ' + (e && e.message)); return []; } }
    function draw(ctx, camX, camY, tMs) {
      if (!ctx || !ctx.drawImage) { warn('ctx', 'draw() needs a 2D canvas context'); return; }
      try {
        var L = ensure(), v = st.view, t = tMs != null && isFinite(tMs) ? +tMs : st.clock;
        if (skin.motion && skin.motion.stepMs > 0) t = Math.floor(t / skin.motion.stepMs) * skin.motion.stepMs;
        camX = isFinite(camX) ? +camX : 0; camY = isFinite(camY) ? +camY : 0;
        var cx = camX + P.idle * t / 1000 + P.sway * Math.sin(t / 8000 * Math.PI * 2), cy = camY;
        var ob = rects(opt.getObstacles).concat(rects(opt.uiRects));
        var avoid = ob.length ? function (x, y, w, h) { for (var i = 0; i < ob.length; i++) { var r = ob[i]; if (x < r.x + r.w + 3 && x + w > r.x - 3 && y < r.y + r.h + 3 && y + h > r.y - 3) return true; } return false; } : function () { return false; };
        var sm = ctx.imageSmoothingEnabled, info = [];
        ctx.save(); ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); ctx.clip();
        ctx.imageSmoothingEnabled = !st.pixel && !!(skin.native && skin.native.smoothing);
        for (var i = 0; i < L.length; i++) {
          var l = L[i]; if (!l.img) continue;
          var f = l.factor * P.depth, ox = 0, oy = 0;
          if (l.fixed) { ctx.drawImage(l.img, v.x, v.y); info.push({ name: l.name, factor: 0, x: 0, y: 0 }); continue; }
          if (l.name !== 'sky') {
            ox = Math.floor(cx * f + (l.drift ? l.drift * P.drift * P.ambient * t / 1000 : 0));
            oy = clamp(-Math.round(cy * f * P.vertical), -st.M, st.M);
          }
          var off = ((ox % l.w) + l.w) % l.w;
          for (var x = -off; x < v.w; x += l.w) ctx.drawImage(l.img, v.x + x, v.y + oy);
          if (l.name === 'sky') drawStars(ctx, st, P.ambient > 0 ? t * Math.min(1, P.ambient) : 0, avoid);
          if (P.ambient > 0) drawAmbient(ctx, st, l, ox, oy, t, avoid);
          info.push({ name: l.name, factor: l.fixed ? 0 : f, x: l.name === 'sky' ? 0 : ox, y: oy });
        }
        ctx.restore(); ctx.imageSmoothingEnabled = sm;
        st.last = { t: t, camX: camX, camY: camY, layers: info }; st.frames++;
      } catch (e) { try { ctx.restore(); } catch (e2) { } warn('draw', 'draw failed: ' + (e && e.message)); }
    }
    var inst = {
      version: VERSION,
      update: function (dt) { dt = +dt; if (isFinite(dt) && dt > 0) st.clock += Math.min(dt, 1000); },
      draw: draw,
      setTheme: function (theme, time) { setTheme(theme, time); return inst; },
      setTime: function (time) { setTheme(null, time); return inst; },
      setParams: function (p) { setParams(p); return inst; },
      setView: function (v) { setView(v); return inst; },
      reset: function (t) { st.clock = isFinite(t) ? +t : 0; },
      clear: function () { },
      clock: function () { return st.clock; },
      theme: function () { return { theme: st.theme, time: st.time }; },
      params: function () { var o = {}; for (var k in DEFAULTS) o[k] = P[k]; return o; },
      layers: function () { return ensure().map(function (l) { return { name: l.name, factor: l.fixed ? 0 : l.factor * P.depth, width: l.w, fixed: !!l.fixed }; }); },
      lastDrawn: function () { return st.last ? [{ x: st.view.x, y: st.view.y, w: st.view.w, h: st.view.h, owner: null, kind: 'backdrop', t: st.last.t, camX: st.last.camX, camY: st.last.camY, layers: st.last.layers }] : []; },
      layerImages: function () { return ensure().map(function (l) { return { name: l.name, factor: l.fixed ? 0 : l.factor * P.depth, img: l.img }; }); },
      prebuild: function () { ensure(); return inst; }
    };
    return inst;
  }

  root.GameDNA_Parallax = { version: VERSION, create: create, themes: THEMES.slice(), times: TIMES.slice(), defaults: function () { var o = {}; for (var k in DEFAULTS) o[k] = DEFAULTS[k]; return o; } };
})(typeof window !== 'undefined' ? window : this);
