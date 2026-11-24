/* GameDNA A-04 - Side-view clash cut-in - module v1.1.1 (plain script, no dependencies, one global: GameDNA_ClashCutin)
 *
 *   const clash = GameDNA_ClashCutin.create({ view: { x: 0, y: 0, w: 256, h: 224 }, params: { speed: 1 } });
 *   // when YOUR game confirms an attack, after YOUR rules decided every strike:
 *   clash.play({
 *     attacker: { id, name, team: 'a', hp, max, art: imgOrCanvas, facing: 'right', x: mapX, kind: 'melee' },
 *     defender: { id, name, team: 'b', hp, max, art, facing: 'right', x: mapX },
 *     strikes: [ { by: 'att', result: 'hit', dmg: 7 }, { by: 'def', result: 'miss', dmg: 0 } ],
 *     after: { att: 23, def: 5 },        // optional: YOUR hp after the exchange (checked against the strikes)
 *     terrain: 'plains',
 *     onDone: r => { ... }               // r = { att, def, skipped }
 *   });
 *   while (clash.busy()) { route keys to clash.key(k) and taps to clash.tap(x, y); pause your world }
 *   clash.update(dtMs) every fixed step;  clash.draw(ctx) after everything else.
 *
 * The module never rolls dice and never computes damage: it stages the outcome the game passes. Everything it draws is a
 * pure function of its own clock (advanced only by update), so ?t=&freeze=1 stills equal live play. ASCII only.
 */
(function (root) {
  'use strict';
  var DEFAULTS = { speed: 1, sides: 'map', intro: 'band', introMs: 300, drain: 450, stop: 4, shake: 2, hold: 450, backdrop: 'auto', keys: 'on', pixel: 'auto' };
  var FRAME = 1000 / 60;

  /* ---------- built-in pixel look (pixel16 copy; used when skin-api.js is not loaded) ---------- */
  var GLYPH = {
    A: '01110,10001,10001,11111,10001,10001,10001', B: '11110,10001,10001,11110,10001,10001,11110', C: '01110,10001,10000,10000,10000,10001,01110',
    D: '11110,10001,10001,10001,10001,10001,11110', E: '11111,10000,10000,11110,10000,10000,11111', F: '11111,10000,10000,11110,10000,10000,10000',
    G: '01110,10001,10000,10111,10001,10001,01111', H: '10001,10001,10001,11111,10001,10001,10001', I: '01110,00100,00100,00100,00100,00100,01110',
    J: '00111,00010,00010,00010,00010,10010,01100', K: '10001,10010,10100,11000,10100,10010,10001', L: '10000,10000,10000,10000,10000,10000,11111',
    M: '10001,11011,10101,10101,10001,10001,10001', N: '10001,10001,11001,10101,10011,10001,10001', O: '01110,10001,10001,10001,10001,10001,01110',
    P: '11110,10001,10001,11110,10000,10000,10000', Q: '01110,10001,10001,10001,10101,10010,01101', R: '11110,10001,10001,11110,10100,10010,10001',
    S: '01111,10000,10000,01110,00001,00001,11110', T: '11111,00100,00100,00100,00100,00100,00100', U: '10001,10001,10001,10001,10001,10001,01110',
    V: '10001,10001,10001,10001,10001,01010,00100', W: '10001,10001,10001,10101,10101,10101,01010', X: '10001,10001,01010,00100,01010,10001,10001',
    Y: '10001,10001,01010,00100,00100,00100,00100', Z: '11111,00001,00010,00100,01000,10000,11111',
    0: '01110,10001,10011,10101,11001,10001,01110', 1: '00100,01100,00100,00100,00100,00100,01110', 2: '01110,10001,00001,00010,00100,01000,11111',
    3: '11111,00010,00100,00010,00001,10001,01110', 4: '00010,00110,01010,10010,11111,00010,00010', 5: '11111,10000,11110,00001,00001,10001,01110',
    6: '00110,01000,10000,11110,10001,10001,01110', 7: '11111,00001,00010,00100,01000,01000,01000', 8: '01110,10001,10001,01110,10001,10001,01110',
    9: '01110,10001,10001,01111,00001,00010,01100', '/': '00001,00010,00010,00100,01000,01000,10000', '-': '00000,00000,00000,01110,00000,00000,00000',
    '.': '00000,00000,00000,00000,00000,01100,01100', '?': '01110,10001,00001,00010,00100,00000,00100', '!': '00100,00100,00100,00100,00100,00000,00100',
    ':': '00000,01100,01100,00000,01100,01100,00000', '+': '00000,00100,00100,11111,00100,00100,00000', "'": '00100,00100,01000,00000,00000,00000,00000',
    ' ': '000,000,000,000,000,000,000'
  };
  var FB = {
    windows: {
      a: ['#3a64d8', '#2c50b8', '#223e96', '#1a2e74', '#a8c8ff', '#0a1238'],
      b: ['#d85a48', '#b8402e', '#922c26', '#6a1c1e', '#ffc8b8', '#2a0608'],
      n: ['#4c8a5a', '#3e7650', '#326244', '#264e36', '#c8f4d4', '#0a220e']
    },
    edge: '#06061a', rivet: '#ffe070', rivetShade: '#7a5410',
    meter: { out: '#06040e', track: '#2a1e36', hp: '#7ce060', hpTop: '#d8ffb8', hpLow: '#f05848', hpLowTop: '#ffb0a0', loss: '#fff4c0' },
    text: { main: '#ffffff', main2: '#c8d4ff', shadow: '#0a0c24', dim: '#8088a8', dim2: '#626a88', label: '#b8d0ff', label2: '#8ca8e8',
      title: '#fff4c8', title2: '#e8c870', gold: '#ffe890', gold2: '#e8c048', accent: '#ffe070' },
    fx: { hot: '#ff7a3a', heal: '#4ad870', white: '#ffffff', crit: '#ffb43a' }, ink: '#06061a'
  };
  function fbMeasure(s) { s = String(s).toUpperCase(); var w = 0; for (var i = 0; i < s.length; i++) w += s[i] === ' ' ? 4 : 6; return Math.max(0, w - 1); }
  function fbText(g, s, x, y, c1, c2, sh, sc) {
    sc = sc || 1;
    for (var pass = sh ? 0 : 1; pass < 2; pass++) {
      var cx = x, str = String(s).toUpperCase();
      for (var i = 0; i < str.length; i++) {
        var ch = str[i], rows = (GLYPH[ch] || GLYPH['?']).split(',');
        for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < rows[ry].length; rx++) if (rows[ry][rx] === '1') {
          g.fillStyle = pass ? (ry < 4 ? c1 : c2) : sh;
          g.fillRect(cx + (rx + (pass ? 0 : 1)) * sc, y + (ry + (pass ? 0 : 1)) * sc, sc, sc);
        }
        cx += (ch === ' ' ? 4 : 6) * sc;
      }
    }
  }
  function fbFrame(g, r, team, alpha) {
    var x = r.x, y = r.y, w = r.w, h = r.h, C = FB.windows[team] || FB.windows.n, i, pa = g.globalAlpha, a = alpha == null ? 1 : alpha;
    g.globalAlpha = pa * 0.96 * a;
    for (i = 0; i < h - 2; i++) { g.fillStyle = C[Math.min(3, Math.floor(i / (h - 2) * 4))]; g.fillRect(x + 1, y + 1 + i, w - 2, 1); }
    g.globalAlpha = pa * a; g.fillStyle = FB.edge;
    g.fillRect(x + 2, y, w - 4, 1); g.fillRect(x + 2, y + h - 1, w - 4, 1); g.fillRect(x, y + 2, 1, h - 4); g.fillRect(x + w - 1, y + 2, 1, h - 4);
    g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + w - 2, y + 1, 1, 1); g.fillRect(x + 1, y + h - 2, 1, 1); g.fillRect(x + w - 2, y + h - 2, 1, 1);
    g.fillStyle = C[4]; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 5);
    g.fillStyle = C[5]; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
    [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]].forEach(function (p) { g.fillStyle = FB.rivetShade; g.fillRect(p[0], p[1], 2, 2); g.fillStyle = FB.rivet; g.fillRect(p[0], p[1], 1, 1); });
    g.globalAlpha = pa;
  }
  function fbMeter(g, r, frac, low) {
    var M = FB.meter, iw = r.w - 2, f = Math.round(iw * Math.max(0, Math.min(1, frac)));
    g.fillStyle = M.out; g.fillRect(r.x, r.y, r.w, r.h); g.fillStyle = M.track; g.fillRect(r.x + 1, r.y + 1, iw, r.h - 2);
    g.fillStyle = low ? M.hpLow : M.hp; g.fillRect(r.x + 1, r.y + 1, f, r.h - 2); g.fillStyle = low ? M.hpLowTop : M.hpTop; g.fillRect(r.x + 1, r.y + 1, f, 1);
  }

  /* big outlined text (damage numbers, HP, MISS, CRITICAL): the 5x7 font scaled by whole steps, digits with open counters (the
     plain 0 has no slash at this size), a 1 px dark outline around the outside and a 1 px drop; cached per string / size / kind */
  var BIGDIG = { 0: '01110,10001,10001,10001,10001,10001,01110' };
  var INK = { dmg: ['#ffffff', '#c8d4ff', '#1a1430'], crit: ['#fff4a0', '#ff9a3a', '#3a1008'], miss: ['#d8e4ff', '#8aa0d0', '#141c38'], heal: ['#e8ffe8', '#5ae07a', '#0a2a14'], low: ['#ffe0d8', '#ff6a50', '#2a0608'], ko: ['#ffffff', '#ffd070', '#2a1408'] };
  var bigCache = {};
  function bigMask(str, sc) {   // fill pixels of the string at scale sc -> {w, h, on(x, y)}
    str = String(str).toUpperCase(); var w = fbMeasure(str) * sc, h = 7 * sc, m = new Uint8Array(Math.max(1, w * h)), cx = 0;
    for (var i = 0; i < str.length; i++) {
      var ch = str[i], rows = (BIGDIG[ch] || GLYPH[ch] || GLYPH['?']).split(',');
      for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < rows[ry].length; rx++) if (rows[ry][rx] === '1') for (var yy = 0; yy < sc; yy++) for (var xx = 0; xx < sc; xx++) { var X = cx + rx * sc + xx, Y = ry * sc + yy; if (X < w) m[Y * w + X] = 1; }
      cx += (ch === ' ' ? 4 : 6) * sc;
    }
    return { w: w, h: h, m: m, on: function (x, y) { return x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1; } };
  }
  function big(str, sc, kind) {
    var key = str + '|' + sc + '|' + kind; if (bigCache[key]) return bigCache[key];
    var M = bigMask(str, sc), ink = INK[kind] || INK.dmg, c = cvs(M.w + 3, M.h + 3), g = c.getContext('2d'), x, y, top = Math.ceil(M.h * 4 / 7);
    for (y = -1; y <= M.h + 1; y++) for (x = -1; x <= M.w; x++) {
      if (M.on(x, y)) continue;
      var edge = M.on(x - 1, y) || M.on(x + 1, y) || M.on(x, y - 1) || M.on(x, y + 1) || M.on(x - 1, y - 1) || M.on(x + 1, y - 1) || M.on(x - 1, y + 1) || M.on(x + 1, y + 1) || M.on(x, y - 2) || M.on(x - 1, y - 2) || M.on(x + 1, y - 2);
      if (edge) { g.fillStyle = ink[2]; g.fillRect(x + 1, y + 1, 1, 1); }
    }
    for (y = 0; y < M.h; y++) for (x = 0; x < M.w; x++) if (M.on(x, y)) { g.fillStyle = y < top ? ink[0] : ink[1]; g.fillRect(x + 1, y + 1, 1, 1); }
    if (Object.keys(bigCache).length > 120) bigCache = {};
    c.ink = ink; return (bigCache[key] = c);
  }

  /* ---------- small helpers ---------- */
  function cvs(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function seg(t, a, b) { return b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a), 0, 1); }
  function eio(k) { return k * k * (3 - 2 * k); }
  function eout(k) { return 1 - (1 - k) * (1 - k); }
  function ein(k) { return k * k; }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function hsh(a, b, c) { var n = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul((c | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
  function vn(x, sc, s) { var u = x / sc, i = Math.floor(u), f = eio(u - i); return hsh(i, 7, s) + (hsh(i + 1, 7, s) - hsh(i, 7, s)) * f; }
  function vn2(x, y, sc, s) { var u = x / sc, v = y / sc, i = Math.floor(u), j = Math.floor(v), fx = eio(u - i), fy = eio(v - j); var a = hsh(i, j, s), b = hsh(i + 1, j, s), c = hsh(i, j + 1, s), d = hsh(i + 1, j + 1, s); return a + (b - a) * fx + (c - a + (d - c - b + a) * fx) * fy; }
  function rgb(h) { var n = parseInt(String(h).slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(h, w, k) { var a = rgb(h), b = rgb(w), c = [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * k); }); return '#' + c.map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function ramp(h) { h = h || '#a070ff'; return ['#ffffff', mix(h, '#ffffff', 0.55), h, mix(h, '#000000', 0.45)]; }   // white core, light, mid, dark
  function teamOf(t, role) {
    var s = t == null ? '' : String(t).toLowerCase();
    if (/^(a|player|blue|ally|hero|heroes|party|friend)$/.test(s)) return 'a';
    if (/^(b|enemy|red|foe|foes|monster|monsters)$/.test(s)) return 'b';
    if (/^(n|neutral|other|green)$/.test(s)) return 'n';
    return role === 'att' ? 'a' : 'b';
  }
  function dirOf(v) { return v === 'left' || v === 'l' || v === -1 || v === '-1' ? 'left' : 'right'; }
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  /* ---------- backdrops: drawn once per (terrain, size) in code, three parallax layers ---------- */
  var THEMES = {
    plains: { sky: ['#2c4ea8', '#3c68c8', '#5a8ae0', '#86b0ec', '#bcd8f4', '#e8f0ec'], cloud: ['#ffffff', '#d8e4f4', '#a8b8d8'], far: ['#6a7cb8', '#8a9ccc', '#5a6aa0'], snow: '#e8eef8',
      near: ['#3a6a5a', '#4a7e62', '#2c5248'], mid: 'trees', midPal: ['#1e4a2e', '#2e6a36', '#4a8c3e', '#78b452'], ground: ['#3e7a34', '#4c8c3a', '#5ea044', '#7ab854', '#2e5e2a'],
      path: ['#8a6c44', '#a4845a', '#bea074', '#6a5034'], motes: '#fff8c0' },
    forest: { sky: ['#1c3460', '#2a4c80', '#3e6a9c', '#6a96b8', '#a8c8cc', '#d4e4d0'], cloud: ['#e8f0ec', '#b8ccd0', '#8aa0b0'], far: ['#2e4a58', '#3e5e68', '#243a48'], snow: null,
      near: ['#1a3a2e', '#24483a', '#122a22'], mid: 'pines', midPal: ['#0e2a24', '#16402e', '#22583a', '#3a7a46'], ground: ['#2e5a2a', '#3a6c30', '#4a7e38', '#62964a', '#1e401e'],
      path: ['#5e4a30', '#76603e', '#8e7850', '#423420'], motes: '#d8ffb0' },
    marsh: { sky: ['#34505a', '#486a6e', '#62847e', '#86a494', '#b4c8b0', '#d8e0c8'], cloud: ['#e4ece0', '#b8c8bc', '#8aa098'], far: ['#4c6662', '#5e7a72', '#3c5450'], snow: null,
      near: ['#3a5444', '#486452', '#2c4234'], mid: 'reeds', midPal: ['#2a3a24', '#3e5430', '#5a7440', '#8a9a58'], ground: ['#4a6232', '#56703a', '#667e44', '#7e9654', '#34482a'],
      path: ['#5a5034', '#6e6442', '#867a54', '#403826'], motes: '#e8f4c0', water: ['#3a6a7a', '#5a8a94', '#9cc4c4'] },
    desert: { sky: ['#3a5aa8', '#5a7cc0', '#8aa0c8', '#c8b4a0', '#ecc898', '#f8e4b8'], cloud: ['#fff4e0', '#f0d4b4', '#c8a890'], far: ['#b8784e', '#d4966a', '#8a5434'], snow: null,
      near: ['#c88c58', '#dca46c', '#a86c40'], mid: 'dunes', midPal: ['#b07848', '#cc9660', '#e4b47c', '#f4d09a'], ground: ['#d4a468', '#e0b478', '#ecc68c', '#f6daa4', '#b48450'],
      path: ['#c09058', '#d0a26a', '#e0b67e', '#a07444'], motes: '#fff0d0' },
    ruins: { sky: ['#1e1a3a', '#2e2850', '#4e3a68', '#7a4a6c', '#c0686a', '#f0a070'], cloud: ['#f4c0a0', '#c88890', '#7a5a7a'], far: ['#3a2e50', '#4a3c62', '#2a2240'], snow: null,
      near: ['#4a4058', '#5a5068', '#342c44'], mid: 'columns', midPal: ['#5a5268', '#7a7088', '#9c94a8', '#c4bccc'], ground: ['#5c5664', '#6c6674', '#7e7884', '#9a94a0', '#46404e'],
      path: ['#8a7c74', '#9e9086', '#b4a698', '#4a3e40'], motes: '#ffd8a0' }
  };
  var TERRAIN_ALIAS = { grass: 'plains', plain: 'plains', plains: 'plains', field: 'plains', meadow: 'plains', road: 'plains', bridge: 'plains', hill: 'plains',
    forest: 'forest', wood: 'forest', woods: 'forest', trees: 'forest', tree: 'forest', jungle: 'forest',
    marsh: 'marsh', swamp: 'marsh', bog: 'marsh', water: 'marsh', river: 'marsh', shallows: 'marsh', reeds: 'marsh', fen: 'marsh',
    desert: 'desert', sand: 'desert', dune: 'desert', dunes: 'desert', beach: 'desert', wasteland: 'desert',
    ruins: 'ruins', stone: 'ruins', fort: 'ruins', castle: 'ruins', wall: 'ruins', floor: 'ruins', dungeon: 'ruins', cave: 'ruins', town: 'ruins', village: 'ruins' };
  function themeKey(v) { var s = String(v == null ? '' : v).toLowerCase(); return THEMES[s] ? s : TERRAIN_ALIAS[s] || 'plains'; }

  function paintLayers(key, W, H, horizonY, groundY, u) {
    var T = THEMES[key] || THEMES.plains, L = { sky: cvs(W, H), mid: cvs(W, H), ground: cvs(W, H) }, x, y, i, ctx2 = function (c) { return c.getContext('2d', { willReadFrequently: true }); };
    // sky: dithered vertical gradient
    (function () {
      var g = ctx2(L.sky), id = g.createImageData(W, H), d = id.data, n = T.sky.length, cols = T.sky.map(rgb), top = 0, bot = horizonY + 4 * u;
      for (y = 0; y < H; y++) {
        var f = clamp((y - top) / Math.max(1, bot - top), 0, 1) * (n - 1), b = Math.min(n - 2, Math.floor(f)), fr = f - b;
        for (x = 0; x < W; x++) {
          var th = (BAYER[((y / u | 0) & 3) * 4 + ((x / u | 0) & 3)] + 0.5) / 16, c = cols[fr > th ? b + 1 : b], q = (y * W + x) * 4;
          d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2]; d[q + 3] = 255;
        }
      }
      g.putImageData(id, 0, 0);
      // clouds: pixel cumulus, lit from the top left
      var CL = T.cloud.map(rgb);
      for (i = 0; i < 5; i++) {
        var cx = Math.round(hsh(i, 1, key.length) * W), cy = Math.round((0.12 + hsh(i, 2, key.length) * 0.28) * horizonY), rw = (12 + hsh(i, 3, 9) * 18) * u, rh = rw * 0.7;
        var bx0 = Math.max(0, Math.floor(cx - rw * 1.6)), bx1 = Math.min(W, Math.ceil(cx + rw * 1.6)), by0 = Math.max(0, Math.floor(cy - rh * 1.6)), by1 = Math.min(H, Math.ceil(cy + rh * 0.6));
        var lob = []; for (var k = 0; k < 5; k++) lob.push([cx + (k - 2) * rw * 0.42 + (hsh(i, k, 3) - 0.5) * rw * 0.2, cy - Math.sin(k / 4 * Math.PI) * rh * 0.55, rw * (0.32 + 0.3 * Math.sin(k / 4 * Math.PI))]);
        id = g.getImageData(bx0, by0, Math.max(1, bx1 - bx0), Math.max(1, by1 - by0)); d = id.data;
        for (y = by0; y < by1; y++) for (x = bx0; x < bx1; x++) {
          var best = -1, lit = 0;
          for (k = 0; k < lob.length; k++) { var dx = (x - lob[k][0]) / lob[k][2], dy = (y - lob[k][1]) / (lob[k][2] * 0.8), dd = dx * dx + dy * dy; if (dd < 1 && y <= cy + 1) { best = Math.max(best, 1 - dd); lit = Math.max(lit, -dx * 0.5 - dy); } }
          if (best < 0) continue;
          var c2 = y > cy - rh * 0.08 ? CL[2] : lit > 0.3 ? CL[0] : CL[1], q2 = ((y - by0) * (bx1 - bx0) + (x - bx0)) * 4;
          if (best < 0.12 && ((x / u | 0) + (y / u | 0)) % 2) continue;
          d[q2] = c2[0]; d[q2 + 1] = c2[1]; d[q2 + 2] = c2[2]; d[q2 + 3] = 255;
        }
        g.putImageData(id, bx0, by0);
      }
      // far ridge and a nearer ridge
      var F = T.far.map(rgb), N = T.near.map(rgb), S = T.snow ? rgb(T.snow) : null;
      id = g.getImageData(0, 0, W, H); d = id.data;
      var ridge = function (xx, base, amp, sc, s) { return base - (vn(xx, sc, s) * amp + vn(xx, sc * 0.33, s + 4) * amp * 0.35 + vn(xx, sc * 0.11, s + 8) * amp * 0.12); };
      for (x = 0; x < W; x++) {
        var r1 = ridge(x / u, horizonY / u + 2, 34, 46, 3 + key.length) * u, r2 = ridge(x / u, horizonY / u + 6, 16, 30, 11 + key.length) * u;
        var s1 = ridge((x + 2 * u) / u, horizonY / u + 2, 34, 46, 3 + key.length) * u - r1, s2 = ridge((x + 2 * u) / u, horizonY / u + 6, 16, 30, 11 + key.length) * u - r2;
        for (y = Math.max(0, Math.floor(r1)); y < H; y++) {
          var c3, q3 = (y * W + x) * 4, dep = y - r1;
          if (y >= r2) { c3 = y - r2 < 2 * u ? (s2 > 0 ? N[1] : N[0]) : (s2 > 0 && y - r2 < 6 * u ? N[1] : (y - r2 > 10 * u ? N[2] : N[0])); }
          else { c3 = s1 > 0 && dep < 10 * u ? (dep < u && S && r1 < horizonY - 26 * u ? S : F[1]) : F[0]; if (dep > 16 * u && ((x / u | 0) + (y / u | 0)) % 2 === 0) c3 = F[2]; if (dep > 22 * u) c3 = F[2]; }
          d[q3] = c3[0]; d[q3 + 1] = c3[1]; d[q3 + 2] = c3[2]; d[q3 + 3] = 255;
        }
      }
      g.putImageData(id, 0, 0);
    })();
    // mid layer: tree line, pines, reeds, dunes or broken columns standing on the horizon
    (function () {
      var g = L.mid.getContext('2d'), M = T.midPal, base = horizonY + 3 * u, P = function (xx, yy, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(xx), Math.round(yy), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
      var blob = function (cx, cy, r, ramp) {
        for (var yy = -r; yy <= r; yy += u) for (var xx = -r; xx <= r; xx += u) {
          var dd = (xx * xx + yy * yy) / (r * r); if (dd > 1) continue;
          var l = (-xx - yy) / (r * 1.4) + (hsh(cx + xx, cy + yy, 5) - 0.5) * 0.35;
          P(cx + xx, cy + yy, u, u, l > 0.45 ? ramp[3] : l > 0.05 ? ramp[2] : l > -0.4 ? ramp[1] : ramp[0]);
        }
      };
      if (T.mid === 'trees') {
        for (x = -8 * u; x < W + 8 * u; x += 9 * u) { var r = (6 + Math.round(hsh(x, 1, 2) * 6)) * u, cy = base - r * 0.8 - hsh(x, 2, 2) * 4 * u; P(x - u, cy, 2 * u, base - cy, M[0]); blob(x, cy, r, M); }
        for (x = 0; x < W; x += u) P(x, base, u, 2 * u, M[0]);
      } else if (T.mid === 'pines') {
        for (x = -6 * u; x < W + 6 * u; x += 7 * u) {
          var h = (22 + hsh(x, 3, 4) * 26) * u, top = base - h;
          for (y = 0; y < h; y += u) { var wdt = (y / h) * 7 * u + u, band = (y / u) % 6 < 2 ? 0 : 1; P(x - wdt, top + y, wdt, u, M[band ? 1 : 0]); P(x, top + y, wdt, u, M[band ? 2 : 1]); if (band && y % (6 * u) === 3 * u) P(x - wdt, top + y, u * 2, u, M[3]); }
        }
        for (x = 0; x < W; x += u) P(x, base, u, 3 * u, M[0]);
      } else if (T.mid === 'reeds') {
        for (x = 0; x < W; x += u) { var rh = (4 + vn(x / u, 5, 9) * 14 + hsh(x, 4, 4) * 5) * u; P(x, base - rh, u, rh + 2 * u, (x / u) % 3 === 0 ? M[1] : M[0]); if (hsh(x, 5, 4) > 0.86) { P(x, base - rh - 3 * u, u, 3 * u, M[3]); P(x - u, base - rh - 2 * u, u, u, M[2]); } }
        for (i = 0; i < 2; i++) { var tx = Math.round((0.2 + i * 0.55 + hsh(i, 6, 1) * 0.1) * W), th2 = 34 * u; P(tx, base - th2, 3 * u, th2, M[0]); P(tx - 7 * u, base - th2 + 6 * u, 8 * u, u * 2, M[0]); P(tx + 3 * u, base - th2 + 10 * u, 9 * u, u * 2, M[0]); P(tx - 9 * u, base - th2 + 3 * u, u * 2, 4 * u, M[0]); P(tx + u, base - th2, u, th2, M[1]); }
      } else if (T.mid === 'dunes') {
        for (x = 0; x < W; x += u) {
          var dh = (vn(x / u, 38, 21) * 16 + vn(x / u, 13, 22) * 5) * u, sl = (vn((x + u) / u, 38, 21) - vn(x / u, 38, 21));
          for (y = base - dh; y < base + 2 * u; y += u) P(x, y, u, u, y - (base - dh) < u ? M[3] : sl < 0 ? M[2] : M[1]);
        }
      } else if (T.mid === 'columns') {
        for (x = 0; x < W; x += u) P(x, base - 3 * u, u, 5 * u, (x / u) % 9 === 0 ? M[0] : M[1]);
        for (i = 0; i < 6; i++) {
          var cx2 = Math.round((i + 0.3 + hsh(i, 7, 2) * 0.5) * W / 6), ch = (16 + hsh(i, 8, 2) * 30) * u, cw = 7 * u, ty = base - ch;
          P(cx2 - cw / 2, ty, cw, ch, M[1]); P(cx2 - cw / 2, ty, 2 * u, ch, M[2]); P(cx2 + cw / 2 - u, ty, u, ch, M[0]);
          for (y = ty + 3 * u; y < base; y += 5 * u) P(cx2 - cw / 2 + 3 * u, y, u, 3 * u, M[0]);
          if (hsh(i, 9, 2) > 0.45) { P(cx2 - cw / 2 - 2 * u, ty - 3 * u, cw + 4 * u, 3 * u, M[2]); P(cx2 - cw / 2 - 2 * u, ty - 3 * u, cw + 4 * u, u, M[3]); }
          else { for (var b = 0; b < 3; b++) P(cx2 - cw / 2 + b * 2 * u, ty - (b === 1 ? 2 : 1) * u, 2 * u, (b === 1 ? 2 : 1) * u, M[1]); }
          if (hsh(i, 10, 2) > 0.5) for (y = ty + 4 * u; y < ty + 14 * u; y += u) if (hsh(y, i, 3) > 0.4) P(cx2 - cw / 2 + Math.round(hsh(y, i, 4) * 3) * u, y, u, u, '#3a6a3a');
        }
      }
    })();
    // ground plane: horizon to the bottom, a trodden band where the fighters stand, a darker foreground lip
    (function () {
      var g = L.ground.getContext('2d'), G = T.ground.map(rgb), PA = T.path.map(rgb), id = g.createImageData(W, H), d = id.data, y0 = horizonY + 3 * u;
      var wat = T.water ? T.water.map(rgb) : null;
      for (y = y0; y < H; y++) {
        var depth = (y - y0) / Math.max(1, H - y0), sc = 3 + depth * 9;
        for (x = 0; x < W; x++) {
          var X = x / u | 0, Y = y / u | 0, n = vn2(X, Y * 1.8, sc, 31) * 0.5 + vn2(X + 17, Y * 1.8, sc * 0.35, 37) * 0.25 + hsh(X, Y, 33) * 0.25, c, q = (y * W + x) * 4;
          var band = Math.abs(y - groundY) / (8 * u + depth * 10 * u), onPath = band < 1 && vn2(X, 3, 18, 41) * 0.5 + 0.6 > band;
          if (onPath && key === 'ruins') {   // worn flagstones: staggered slabs with dark joints
            var row = Math.floor((Y - (groundY / u | 0) + 40) / (3 + depth * 3)), off = row % 2 ? 7 : 0, jx = (X + off) % 14 === 0, jy = (Y - (groundY / u | 0) + 40) % (3 + Math.round(depth * 3)) === 0;
            c = jx || jy ? PA[3] : n > 0.62 ? PA[2] : n > 0.3 ? PA[1] : PA[0];
          } else if (onPath) c = n > 0.66 ? PA[2] : n > 0.38 ? PA[1] : n > 0.14 ? PA[0] : PA[3];
          else c = n > 0.72 ? G[3] : n > 0.48 ? G[2] : n > 0.2 ? G[1] : G[0];
          if (wat && !onPath && y > groundY + 10 * u && vn2(X, Y * 3, 14, 51) > 0.62) c = vn2(X + 3, Y * 3, 14, 51) > 0.7 ? wat[1] : wat[0];
          if (y > H - 7 * u) c = (Y + X) % 2 && y > H - 4 * u ? G[4] : G[0];
          d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2]; d[q + 3] = 255;
        }
      }
      for (x = 0; x < W; x++) { var q0 = (y0 * W + x) * 4, cc = G[4]; d[q0] = cc[0]; d[q0 + 1] = cc[1]; d[q0 + 2] = cc[2]; }
      g.putImageData(id, 0, 0);
      // details: grass blades / reeds / pebbles / sand ripples / cracks, more and larger toward the front
      var Gh = T.ground, Ph = T.path;
      for (i = 0; i < W * 0.9; i++) {
        var px = Math.floor(hsh(i, 1, 61) * W / u) * u, py = Math.floor((y0 + 2 * u + hsh(i, 2, 61) * (H - y0 - 4 * u)) / u) * u, near = (py - y0) / (H - y0), onP = Math.abs(py - groundY) < 7 * u;
        if (key === 'desert') { if (hsh(i, 3, 61) < 0.5) { g.fillStyle = Gh[3]; g.fillRect(px, py, Math.round((2 + near * 5)) * u, u); g.fillStyle = Gh[0]; g.fillRect(px + u, py + u, Math.round((1 + near * 4)) * u, u); } continue; }
        if (key === 'ruins') { if (!onP && hsh(i, 3, 61) < 0.35) { g.fillStyle = Gh[4]; g.fillRect(px, py, Math.round((3 + near * 6)) * u, u); g.fillStyle = Gh[3]; g.fillRect(px, py - u, Math.round((3 + near * 6)) * u, u); } else if (hsh(i, 4, 61) < 0.12) { g.fillStyle = '#4a7a3e'; g.fillRect(px, py, u, u); g.fillRect(px + u, py - u, u, u); } continue; }
        if (onP) { if (hsh(i, 5, 61) < 0.25) { g.fillStyle = Ph[3]; g.fillRect(px, py, u, u); g.fillStyle = Ph[2]; g.fillRect(px, py - u, u, u); } continue; }
        var bh = Math.round(1 + near * 3);
        g.fillStyle = Gh[4]; g.fillRect(px, py - bh * u, u, bh * u);
        g.fillStyle = Gh[3]; g.fillRect(px + u, py - (bh + 1) * u, u, bh * u);
        if (key === 'plains' && hsh(i, 6, 61) < 0.06) { g.fillStyle = ['#ffe070', '#f8f0ff', '#ff9ab0'][i % 3]; g.fillRect(px + u, py - (bh + 2) * u, u, u); }
      }
    })();
    return L;
  }

  /* ---------- sprite helpers: native facing, computed mirror, trimmed bounds, white flash copy ---------- */
  function boundsOf(img) {
    var w = img.width || img.naturalWidth || 0, h = img.height || img.naturalHeight || 0, B = { x: 0, y: 0, w: w, h: h, foot: h, cx: w / 2 };
    if (!w || !h) return B;
    try {
      var c = cvs(w, h), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0); var d = g.getImageData(0, 0, w, h).data, x0 = w, x1 = -1, y0 = h, y1 = -1, x, y;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 >= 0) {
        // centre = middle of the lowest 40% of the figure (the body and feet, not a weapon held out)
        var lx0 = w, lx1 = -1, ly = Math.round(y1 - (y1 - y0) * 0.4);
        for (y = ly; y <= y1; y++) for (x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) { if (x < lx0) lx0 = x; if (x > lx1) lx1 = x; }
        B = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, foot: y1 + 1, cx: lx1 >= 0 ? (lx0 + lx1 + 1) / 2 : (x0 + x1 + 1) / 2 };
      }
    } catch (e) { B.tainted = true; }
    if (typeof img.footX === 'number' && typeof img.footY === 'number') { B.cx = img.footX; B.foot = img.footY; }
    return B;
  }
  function whiteOf(img, dark) {
    var c = cvs(img.width || img.naturalWidth || 1, img.height || img.naturalHeight || 1), g = c.getContext('2d');
    try { g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = dark ? '#140c1c' : '#ffffff'; g.fillRect(0, 0, c.width, c.height); } catch (e) {}
    return c;
  }

  /* ---------- instance ---------- */
  function create(o) {
    o = o || {};
    var SK = root.GameDNA_Skin ? (function () { try { return root.GameDNA_Skin.resolve(o.skin); } catch (e) { return null; } })() : null;
    var P = {}, k; for (k in DEFAULTS) P[k] = DEFAULTS[k];
    var warned = {}, ST = { plays: 0, skips: 0, speedToggles: 0, warnings: 0, mismatches: 0, dropped: 0, done: 0, errors: 0 };
    function emit(e) { if (typeof o.debug === 'function') try { o.debug(e); } catch (er) {} }
    function warn(key, msg) { ST.warnings++; if (!warned[key]) { warned[key] = 1; try { if (root.console) console.warn('[clash-cutin] ' + msg); } catch (e) {} } emit({ event: 'warn', key: key, msg: msg }); }
    function setParams(p) {
      if (!p) return;
      for (var key in p) if (key in DEFAULTS && p[key] != null && p[key] !== '') P[key] = typeof DEFAULTS[key] === 'number' ? num(p[key], DEFAULTS[key]) : String(p[key]);
      P.speed = P.speed >= 1.5 ? 2 : 1;
    }
    setParams(o.params);
    var view = o.view ? { x: num(o.view.x, 0), y: num(o.view.y, 0), w: num(o.view.w, 0), h: num(o.view.h, 0) } : null;
    var cache = {}, F = null, drawnRects = [], lastState = null;
    var pixelMode = function () { return P.pixel === 'auto' ? !(SK && SK.pixel === false) : P.pixel !== 'off'; };

    function U(v) { return Math.max(1, Math.floor(Math.min(v.w / 256, v.h / 224))); }
    function layoutFor(v) {
      var u = U(v), top = 16 * u, panel = 44 * u, st = { x: v.x, y: v.y + top, w: v.w, h: v.h - top - panel };
      return { u: u, v: v, bar: { x: v.x, y: v.y, w: v.w, h: top }, stage: st, panel: { x: v.x, y: v.y + v.h - panel, w: v.w, h: panel },
        horizon: st.y + Math.round(st.h * 0.40), ground: st.y + Math.round(st.h * 0.84) };
    }
    function layers(key, Lo) {
      var pad = 24 * Lo.u, W = Lo.v.w + pad * 2, H = Lo.v.h, id = key + ':' + W + 'x' + H + ':' + Lo.horizon + ':' + Lo.ground + ':' + Lo.u;
      if (!cache[id]) { var keys = Object.keys(cache); if (keys.length > 6) delete cache[keys[0]]; cache[id] = paintLayers(key, W, H, Lo.horizon - Lo.v.y, Lo.ground - Lo.v.y, Lo.u); cache[id].pad = pad; }
      return cache[id];
    }

    /* text through the skin when present */
    function measure(s, sc) { s = String(s); sc = sc || 1; if (!SK || sc > 1) return fbMeasure(s) * sc; try { return Math.ceil(SK.measure(s, { font: 'ui' }) || 0); } catch (e) { return fbMeasure(s); } }
    function text(g, s, x, y, c1, c2, sc) {
      sc = sc || 1;
      if (SK && sc === 1) { try { SK.text(g, String(s), x, y, { font: 'ui', color: c1, color2: c2 }); return; } catch (e) {} }
      fbText(g, s, x, y, c1, c2 || c1, FB.text.shadow, sc);
    }
    function frame(g, r, team, alpha) { if (SK) { try { SK.frame(g, r, { role: 'window', team: team, alpha: alpha }); return; } catch (e) {} } fbFrame(g, r, team, alpha); }
    function meter(g, r, frac, low) { if (SK) { try { SK.bar(g, r, frac, low ? 'hpLow' : 'hp', { style: 'meter' }); return; } catch (e) {} } fbMeter(g, r, frac, low); }
    /* ---------- unit looks ---------- */
    function look(spec, role) {
      var L = { id: spec.id != null ? spec.id : role, name: String(spec.name || spec.id || role), team: teamOf(spec.team, role), max: Math.max(1, num(spec.max != null ? spec.max : spec.maxHp, num(spec.hp, 1))),
        hp: Math.max(0, num(spec.hp, 0)), kind: /^(ranged|bow|arrow|shot|gun|missile)$/i.test(spec.kind || '') ? 'ranged' : /^(magic|spell|cast|tome|staff)$/i.test(spec.kind || '') ? 'magic' : 'melee',
        weapon: spec.weapon ? String(spec.weapon) : '', stats: spec.stats || null, draw: typeof spec.draw === 'function' ? spec.draw : null, scale: num(spec.scale, 0), mapX: num(spec.x, null),
        asset: spec.asset || null, frames: {}, tint: /^#[0-9a-f]{6}$/i.test(spec.tint || '') ? spec.tint : null, mirror: spec.mirror === 'never' ? 'never' : 'ok', fly: !!spec.fly, imgs: {}, white: {}, B: null, native: dirOf(spec.facing || 'right') };
      var art = spec.art, vars = spec.variants || null;
      if (art && (art.left || art.right) && !(art.width || art.naturalWidth)) { vars = art; art = art[L.native] || art.right || art.left; }
      if (art && (art.width || art.naturalWidth)) { L.imgs[L.native] = art; L.B = boundsOf(art); }
      if (vars) ['left', 'right'].forEach(function (s) { if (vars[s] && (vars[s].width || vars[s].naturalWidth)) L.imgs[s] = vars[s]; });
      // optional pose frames: {windup, swing, follow, hurt, down, aim, release, cast, ready, dodge}: each an image painted for the
      // art's native side, or {left, right}; same foot point as the art (or canvas.footX / footY)
      if (spec.frames && typeof spec.frames === 'object') Object.keys(spec.frames).forEach(function (nm) {
        var f = spec.frames[nm], o2 = {}; if (!f) return;
        if (f.width || f.naturalWidth) o2[L.native] = f; else ['left', 'right'].forEach(function (sd) { if (f[sd] && (f[sd].width || f[sd].naturalWidth)) o2[sd] = f[sd]; });
        if (o2.left || o2.right) L.frames[nm] = o2;
      });
      if (!L.B) { var any = L.imgs.left || L.imgs.right; if (any) L.B = boundsOf(any); }
      if (!L.B && !L.draw) { L.B = { x: 0, y: 0, w: 12, h: 16, foot: 16, cx: 6 }; warn('noArt', 'unit ' + L.name + ' has no art and no draw callback: a placeholder is drawn'); }
      if (!L.B) L.B = { x: 0, y: 0, w: num(spec.w, 16), h: num(spec.h, 24), foot: num(spec.h, 24), cx: num(spec.w, 16) / 2 };
      return L;
    }
    var CHAIN = { gleam: ['ready'], ready: ['ready'], dash: ['ready'], windup: ['windup', 'ready'], swing: ['swing', 'windup'], follow: ['follow', 'swing'],
      ret: ['ready'], aim: ['aim', 'windup'], cast: ['cast', 'windup'], release: ['release', 'follow'], hurt: ['hurt'], dodge: ['dodge', 'ready'], down: ['down', 'hurt'] };
    function pickImg(L, want, fr) {
      var ch = (fr && CHAIN[fr]) || [];
      for (var i = 0; i < ch.length; i++) {
        var F = L.frames[ch[i]]; if (!F) continue;
        if (F[want]) return { img: F[want], flip: false, variant: want !== L.native ? want : null, frame: ch[i] };
        var other = want === 'left' ? 'right' : 'left';
        if (F[other] && L.mirror !== 'never') return { img: F[other], flip: true, variant: null, frame: ch[i] };
      }
      if (L.imgs[want]) return { img: L.imgs[want], flip: false, variant: want !== L.native ? want : null };
      var src = L.imgs[L.native] || L.imgs.left || L.imgs.right; if (!src) return null;
      var nat = L.imgs[L.native] ? L.native : (L.imgs.left ? 'left' : 'right'), flip = want !== nat;
      if (flip && L.mirror === 'never') warn('mirror', L.name + ' is mirror:never but has no ' + want + ' variant: drawn mirrored');
      return { img: src, flip: flip, variant: null };
    }
    function boundsFor(L, img) { L.bnds = L.bnds || []; for (var i = 0; i < L.bnds.length; i++) if (L.bnds[i][0] === img) return L.bnds[i][1]; var B = boundsOf(img); L.bnds.push([img, B]); return B; }
    function wantOf(L) { return L.side === 'left' ? 'right' : 'left'; }   // the ONE place a fighter's facing is decided: it looks at the other side
    function whiteFor(L, img, dark) { L.wl = L.wl || []; for (var i = 0; i < L.wl.length; i++) if (L.wl[i][0] === img && L.wl[i][2] === !!dark) return L.wl[i][1]; var c = whiteOf(img, dark); L.wl.push([img, c, !!dark]); return c; }

    /* ---------- the staged exchange ---------- */
    var S = null;   // current show
    function play(spec) {
      try {
        if (S && S.phase !== 'done') { warn('busy', 'play() while a cut-in is running: ignored'); return false; }
        spec = spec || {};
        var A = look(spec.attacker || {}, 'att'), D = look(spec.defender || {}, 'def');
        var v = view || o.getView && safe(o.getView) || { x: 0, y: 0, w: 256, h: 224 };
        var Lo = layoutFor(v), u = Lo.u;
        // which side: 'map' keeps the map's left / right, 'team' puts the player's team on the right, 'attacker' puts the attacker on the right
        var attLeft;
        if (P.sides === 'attacker') attLeft = false;
        else if (P.sides === 'map' && A.mapX != null && D.mapX != null && A.mapX !== D.mapX) attLeft = A.mapX < D.mapX;
        else attLeft = A.team === 'a' ? false : D.team === 'a' ? true : false;
        var Lu = attLeft ? A : D, Ru = attLeft ? D : A;
        Lu.side = 'left'; Ru.side = 'right'; A.role = 'att'; D.role = 'def';
        [Lu, Ru].forEach(function (L) {
          var hmax = Lo.stage.h * 0.46, s = L.scale || (pixelMode() ? Math.max(1, Math.min(Math.round(Lo.stage.h * 0.40 / L.B.h), Math.floor(hmax / L.B.h))) : Lo.stage.h * 0.40 / L.B.h);
          if (L.B.w * s > Lo.stage.w * 0.36) s = pixelMode() ? Math.max(1, Math.floor(Lo.stage.w * 0.36 / L.B.w)) : Lo.stage.w * 0.36 / L.B.w;
          L.s = s; L.H = L.B.h * s; L.W = L.B.w * s;
        });
        Lu.home = Lo.stage.x + Math.round(Lo.stage.w * 0.30); Ru.home = Lo.stage.x + Math.round(Lo.stage.w * 0.70);
        // strikes: normalised, cut after a KO, numbers taken as given
        var hp = { att: A.hp, def: D.hp }, list = [], raw = Array.isArray(spec.strikes) ? spec.strikes : [];
        raw.forEach(function (r, i) {
          r = r || {};
          var by = /^(def|defender|d|target|counter|b)$/i.test(String(r.by || '')) ? 'def' : 'att', tg = by === 'att' ? 'def' : 'att';
          var res = String(r.result || (r.crit ? 'crit' : r.hit === false || r.miss ? 'miss' : 'hit')).toLowerCase();
          res = /crit/.test(res) ? 'crit' : /miss|dodge|evade|whiff/.test(res) ? 'miss' : 'hit';
          var dmg = res === 'miss' ? 0 : Math.max(0, Math.round(num(r.dmg != null ? r.dmg : r.damage, 0)));
          if (hp[by] <= 0 || hp[tg] <= 0) { ST.dropped++; warn('afterKO', 'strike ' + (i + 1) + ' comes after a unit fell: not staged'); return; }
          var before = hp[tg]; hp[tg] = Math.max(0, before - dmg);
          list.push({ i: list.length, by: by, tg: tg, res: res, dmg: dmg, before: before, after: hp[tg], ko: hp[tg] <= 0 && before > 0, label: r.label ? String(r.label) : '' });
        });
        var after = spec.after || null, finalHp = { att: hp.att, def: hp.def }, mism = null;
        if (after) {
          var fa = num(after.att != null ? after.att : after.attacker, null), fd = num(after.def != null ? after.def : after.defender, null);
          if ((fa != null && fa !== hp.att) || (fd != null && fd !== hp.def)) {
            ST.mismatches++; mism = { strikes: { att: hp.att, def: hp.def }, after: { att: fa, def: fd } };
            warn('mismatch', 'after {att: ' + fa + ', def: ' + fd + '} does not equal the strikes ({att: ' + hp.att + ', def: ' + hp.def + '}): the end shows your after');
            if (fa != null) finalHp.att = fa; if (fd != null) finalHp.def = fd;
          }
        }
        // timeline (stage ms)
        var stopMs = Math.round(P.stop) * FRAME, t = Math.max(0, P.introMs) + 240, drain = Math.max(0, P.drain);
        list.forEach(function (s, idx) {
          var me = s.by === 'att' ? A : D, it = s.by === 'att' ? D : A, dir = me.side === 'left' ? 1 : -1;
          s.striker = me; s.target = it; s.dir = dir; s.kind = me.kind; s.stop = stopMs * (s.res === 'crit' ? 2 : 1);
          s.t0 = t; s.gleam = s.res === 'crit' ? 340 : 0;
          var tA = t + s.gleam;
          if (s.kind === 'melee') {
            s.contact = it.home - dir * (it.W * 0.5 + me.W * 0.5 + 10 * u);   // a clear gap at contact: the swing reaches, the bodies do not touch
            s.dist = s.contact - me.home;
            s.tCrouch = tA; s.tDash = tA + 110; s.tWind = s.tDash + 230; s.tSwing = s.tWind + 110; s.tImp = s.tSwing + 80;
          } else { s.tCrouch = tA; s.tDash = tA; s.tWind = tA; s.tSwing = tA + 300; s.tImp = s.tSwing + (s.kind === 'magic' ? 300 : 230); s.dist = 0; }
          s.tStopEnd = s.tImp + (s.res === 'miss' ? 0 : s.stop);
          s.tReactEnd = s.tStopEnd + Math.max(420, s.dmg > 0 ? drain * 0.8 : 0);
          s.tRet = s.kind === 'melee' ? s.tReactEnd : s.tReactEnd;
          s.tRetEnd = s.kind === 'melee' ? s.tRet + 260 : s.tRet + 80;
          s.tKo = s.ko ? s.tStopEnd + Math.max(260, drain * 0.75) : null;
          s.tEnd = Math.max(s.tRetEnd, s.ko ? s.tKo + 700 : 0) + 120;
          s.caption = s.label || (s.res === 'crit' ? 'CRITICAL!' : idx === 0 ? me.name + (me.kind === 'magic' ? ' casts' : me.kind === 'ranged' ? ' shoots' : ' attacks') : s.by === 'def' ? 'Counter' : me.name + ' strikes again');
          t = s.tEnd;
        });
        var tSettle = t, tOut = tSettle + Math.max(0, P.hold), tEnd = tOut + Math.max(0, P.introMs);
        S = { phase: 'intro', t: 0, A: A, D: D, L: Lu, R: Ru, list: list, hp0: { att: A.hp, def: D.hp }, final: finalHp, mism: mism, Lo: Lo, theme: P.backdrop === 'auto' ? themeKey(spec.terrain) : themeKey(P.backdrop),
          tSettle: tSettle, tOut: tOut, tEnd: tEnd, onDone: typeof spec.onDone === 'function' ? spec.onDone : null, onImpact: typeof spec.onImpact === 'function' ? spec.onImpact : null,
          skipped: false, impacts: 0, seed: (ST.plays * 7919 + list.length) | 0, drawBackdrop: typeof spec.drawBackdrop === 'function' ? spec.drawBackdrop : typeof o.drawBackdrop === 'function' ? o.drawBackdrop : null };
        ST.plays++;
        layers(S.theme, Lo);
        emit({ event: 'play', att: A.id, def: D.id, strikes: list.map(function (s) { return { by: s.by, res: s.res, dmg: s.dmg }; }), final: finalHp });
        return true;
      } catch (e) { ST.errors++; warn('play', 'play() failed: ' + (e && e.message)); S = null; return false; }
    }
    function safe(fn) { try { return fn(); } catch (e) { return null; } }
    function busy() { return !!S && S.phase !== 'done'; }
    function skip() {
      if (!busy() || S.t >= S.tSettle) return busy();   // already on the end tableau: let it hold, then close
      // the end tableau (new HP) stays up for up to 600 ms before the band closes
      S.t = S.tSettle + Math.max(0, P.hold - 600); S.skipped = true; ST.skips++; emit({ event: 'skip' });
      return true;
    }
    function setSpeed(n) { P.speed = n >= 1.5 ? 2 : 1; emit({ event: 'speed', speed: P.speed }); }
    function toggleSpeed() { ST.speedToggles++; setSpeed(P.speed === 2 ? 1 : 2); }
    function key(kname) {
      if (!busy()) return false;
      if (P.keys === 'off') return true;
      var kk = String(kname || '').toLowerCase();
      if (/^(z|enter| |space|ok|confirm|a|escape|esc|skip)$/.test(kk)) skip();
      else if (/^(x|speed|fast|b|shift|back)$/.test(kk)) toggleSpeed();
      return true;
    }
    function tap(x, y) {
      if (!busy()) return false;
      if (P.keys === 'off') return true;
      var b = speedRect(); if (b && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) toggleSpeed(); else skip();
      return true;
    }
    function speedRect() { if (!S) return null; var Lo = S.Lo, u = Lo.u, w = 24 * u; return { x: Lo.bar.x + Lo.bar.w - w - 4 * u, y: Lo.bar.y + 3 * u, w: w, h: 10 * u }; }
    function update(dt) {
      if (!S || S.phase === 'done') return;
      dt = num(dt, FRAME); if (dt < 0) dt = 0; if (dt > 250) dt = 250;
      var prev = S.t; S.t += dt * P.speed;
      // impacts: fire the hook once per strike (also when skipped past)
      for (var i = 0; i < S.list.length; i++) { var s = S.list[i]; if (!s.fired && S.t >= s.tImp) { s.fired = true; S.impacts++; emit({ event: 'impact', i: i, by: s.by, res: s.res, dmg: s.dmg, after: s.after, skipped: prev < s.tImp && S.skipped }); if (S.onImpact) try { S.onImpact({ i: i, by: s.by, result: s.res, dmg: s.dmg, after: s.after }); } catch (e) { ST.errors++; } } }
      S.phase = S.t < Math.max(0, P.introMs) ? 'intro' : S.t < S.tOut ? 'stage' : S.t < S.tEnd ? 'outro' : 'done';
      lastState = stateNow();
      if (S.phase === 'done') {
        ST.done++;
        var r = { att: S.final.att, def: S.final.def, skipped: S.skipped, attacker: S.A.id, defender: S.D.id };
        emit({ event: 'done', result: r });
        var cb = S.onDone; if (cb) try { cb(r); } catch (e) { ST.errors++; warn('onDone', 'onDone threw: ' + (e && e.message)); }
        if (typeof o.onDone === 'function') try { o.onDone(r); } catch (e) { ST.errors++; }
      }
    }

    /* ---------- poses: pure functions of the stage clock ---------- */
    function hpShown(role, t) {
      var v = S.hp0[role], d = Math.max(1, P.drain);
      for (var i = 0; i < S.list.length; i++) { var s = S.list[i]; if (s.tg !== role || t < s.tStopEnd) continue; v = s.before + (s.after - s.before) * eio(seg(t, s.tStopEnd, s.tStopEnd + d)); }
      if (t >= S.tSettle) v = S.final[role];
      return v;
    }
    function lossGhost(role, t) {   // the drained part, shown pale, fading after the drain
      for (var i = S.list.length - 1; i >= 0; i--) { var s = S.list[i]; if (s.tg !== role || t < s.tStopEnd || s.dmg <= 0) continue; var a = 1 - seg(t, s.tStopEnd + P.drain, s.tStopEnd + P.drain + 260); return a > 0 ? { from: s.before, a: a } : null; }
      return null;
    }
    function pose(L, t) {
      var p = { dx: 0, lift: 0, flash: 0, dark: 0, alpha: 1, shakeX: 0, ghost: 0, dead: false, pose: 'idle', fr: null, k: 0 };
      // breathing idle: 1 art pixel every ~0.9 s, offset per side
      p.breath = Math.floor(((t + (L.side === 'left' ? 0 : 450)) / 900) % 2);
      for (var i = 0; i < S.list.length; i++) {
        var s = S.list[i];
        if (t < s.t0 || t >= s.tEnd + 1) { if (s.ko && s.target === L && t >= s.tKo + 700) { p.dead = true; p.alpha = 0; } continue; }
        var u = S.Lo.u;
        if (s.striker === L) {
          if (s.res === 'crit' && t < s.tCrouch) { p.pose = 'gleam'; p.fr = 'gleam'; }
          if (s.kind === 'melee') {
            var hop = L.H * 0.16;
            if (t >= s.tCrouch && t < s.tDash) { p.dx = -s.dir * 2 * L.s * eout(seg(t, s.tCrouch, s.tDash)); p.pose = 'ready'; p.fr = 'ready'; p.k = seg(t, s.tCrouch, s.tDash); }
            else if (t >= s.tDash && t < s.tWind) { var k2 = seg(t, s.tDash, s.tWind); p.dx = -s.dir * 2 * L.s + (s.dist + s.dir * 2 * L.s) * eio(k2); p.lift = Math.sin(k2 * Math.PI) * hop; p.pose = 'dash'; p.fr = 'dash'; p.k = k2; }
            else if (t >= s.tWind && t < s.tSwing) { p.dx = s.dist - s.dir * 3 * L.s * eout(seg(t, s.tWind, s.tSwing)); p.pose = 'windup'; p.fr = 'windup'; p.k = seg(t, s.tWind, s.tSwing); }
            else if (t >= s.tSwing && t < s.tImp) { p.dx = s.dist - s.dir * 3 * L.s + s.dir * 4 * L.s * ein(seg(t, s.tSwing, s.tImp)); p.pose = 'swing'; p.fr = 'swing'; p.k = seg(t, s.tSwing, s.tImp); }
            else if (t >= s.tImp && t < s.tRet) { p.dx = s.dist + s.dir * 1 * L.s * (1 - eout(seg(t, s.tStopEnd, s.tStopEnd + 200))); p.pose = 'follow'; p.fr = t < s.tStopEnd + 200 ? 'follow' : 'ready'; p.k = seg(t, s.tImp, s.tRet); }
            else if (t >= s.tRet && t < s.tRetEnd) { var k3 = seg(t, s.tRet, s.tRetEnd); p.dx = s.dist * (1 - eio(k3)); p.lift = Math.sin(k3 * Math.PI) * hop * 0.7; p.pose = 'return'; p.fr = 'ret'; p.k = k3; }
          } else {
            if (t >= s.tWind && t < s.tSwing) { p.dx = -s.dir * 2 * L.s * eout(seg(t, s.tWind, s.tSwing)); p.pose = s.kind === 'magic' ? 'cast' : 'aim'; p.fr = p.pose; p.k = seg(t, s.tWind, s.tSwing); }
            else if (t >= s.tSwing && t < s.tRetEnd) { p.dx = -s.dir * 2 * L.s * (1 - eout(seg(t, s.tSwing, s.tSwing + 160))); p.pose = 'release'; p.fr = t < s.tSwing + 240 ? 'release' : null; p.k = seg(t, s.tSwing, s.tRetEnd); }
          }
        }
        if (s.target === L) {
          if (s.res === 'miss') {
            var a0 = Math.min(s.tImp - 70, s.tSwing - 40), k4 = seg(t, a0, a0 + 170), k5 = seg(t, a0 + 300, a0 + 520);   // out of reach before the blow lands
            if (t >= a0 && t < a0 + 520) { p.dx += s.dir * 16 * L.s * (eout(k4) - eio(k5)); p.lift = Math.sin(k4 * Math.PI) * L.H * 0.10; p.ghost = k4 > 0.05 && k4 < 1 && k5 === 0 ? 1 : 0; p.pose = 'dodge'; p.fr = 'dodge'; p.k = k4; }
          } else if (t >= s.tImp) {
            var ff = t - s.tImp;
            if (ff < 84 || (s.res === 'crit' && ff >= s.stop + 110 && ff < s.stop + 144)) p.flash = 1;   // solid white silhouette, 3 frames (crit: twice)
            var kb = seg(t, s.tStopEnd, s.tStopEnd + 90), back = seg(t, s.tStopEnd + 140, s.tStopEnd + 420);
            p.dx += s.dir * (s.res === 'crit' ? 7 : 4) * L.s * (eout(kb) - eio(back));
            if (t >= s.tStopEnd && t < s.tStopEnd + 170) p.shakeX = ((Math.floor((t - s.tStopEnd) / 34) % 2) ? 1 : -1) * L.s;
            if (t < s.tRetEnd) p.pose = 'hurt'; p.fr = t < s.tStopEnd + 380 ? 'hurt' : null;
            if (s.ko && t >= s.tKo) { var kd = seg(t, s.tKo, s.tKo + 700), fade = seg(t, s.tKo + 260, s.tKo + 700); p.alpha = 1 - fade; p.flash = t < s.tKo + 34 ? 1 : 0; p.dark = 0.5 * eio(seg(t, s.tKo + 60, s.tKo + 300)); p.shakeX = 0; p.pose = 'down'; p.fr = 'down'; p.k = kd; if (kd >= 1) p.dead = true; }   // collapse, darken, then fade
          }
        }
      }
      return p;
    }
    function camX(t) {   // a small pan toward the active strike, and the hit shake
      var c = 0, u = S.Lo.u;
      for (var i = 0; i < S.list.length; i++) {
        var s = S.list[i]; if (t < s.t0 || t > s.tEnd) continue;
        var toward = s.dir * 10 * u, k = s.kind === 'melee' ? eio(seg(t, s.tDash, s.tWind)) * (1 - eio(seg(t, s.tRet, s.tRetEnd))) : eio(seg(t, s.tSwing, s.tImp)) * (1 - eio(seg(t, s.tReactEnd - 100, s.tRetEnd)));
        c += toward * k;
      }
      return c;
    }
    function shake(t) {
      var x = 0, y = 0, u = S.Lo.u;
      for (var i = 0; i < S.list.length; i++) {
        var s = S.list[i]; if (s.res === 'miss' || t < s.tImp || t > s.tStopEnd + 220) continue;
        var amp = P.shake * u * (s.res === 'crit' ? 2 : 1) * (1 - seg(t, s.tStopEnd, s.tStopEnd + 220)), ph = Math.floor((t - s.tImp) / 33);
        x += (ph % 2 ? 1 : -1) * amp; y += ((ph >> 1) % 2 ? 1 : -1) * amp * 0.5;
      }
      return pixelMode() ? { x: Math.round(x), y: Math.round(y) } : { x: x, y: y };
    }

    /* ---------- state for tests and critics ---------- */
    function stateNow() {
      if (!S) return { busy: false, phase: 'idle', actors: [] };
      var t = S.t, Lo = S.Lo, cx = camX(t), out = [];
      [S.L, S.R].forEach(function (L) {
        var p = pose(L, t), want = wantOf(L), other = L === S.L ? S.R : S.L, pk = L.draw ? null : pickImg(L, want, p.fr);
        out.push({ id: 'cutin:' + L.id, unit: L.id, role: L.role, side: L.side, x: Math.round(L.home + p.dx + cx), y: Lo.ground, footY: Lo.ground - Math.round(p.lift), facing: L.drawnFacing || want,
          target: 'cutin:' + other.id, hp: Math.round(hpShown(L.role, t)), max: L.max, alive: !p.dead, pose: p.pose, flipX: pk ? pk.flip : null, variant: pk ? pk.variant : null, frame: pk ? pk.frame || null : null, native: L.native, mirror: L.mirror, asset: L.asset || undefined });
      });
      var cur = null; for (var i = 0; i < S.list.length; i++) if (t >= S.list[i].t0 && t < S.list[i].tEnd) cur = i;
      return { busy: busy(), phase: S.phase, t: Math.round(t), speed: P.speed, theme: S.theme, strike: cur, caption: cur != null ? S.list[cur].caption : null, skipped: S.skipped,
        actors: out, hp: { att: Math.round(hpShown('att', t)), def: Math.round(hpShown('def', t)) }, final: { att: S.final.att, def: S.final.def }, mismatch: S.mism,
        staged: S.list.map(function (s) { return { by: s.by, result: s.res, dmg: s.dmg, before: s.before, after: s.after, ko: s.ko, shown: t >= s.tImp }; }),
        attacker: S.A.id, defender: S.D.id, sides: { left: S.L.id, right: S.R.id } };
    }

    /* ---------- drawing ---------- */
    function drawUnit(g, L, p, x, footY, t) {
      if (p.dead || p.alpha <= 0) return null;
      var want = wantOf(L), px = pixelMode(), u = S.Lo.u;
      L.drawnFacing = want;
      // contact shadow (shrinks with the hop)
      var sw = Math.max(6, L.W * 0.62) * (1 - clamp(p.lift / (L.H * 0.6), 0, 0.45)), sh = Math.max(2, Math.round(3 * u));
      g.save(); g.globalAlpha *= 0.42 * p.alpha; g.fillStyle = '#100a1a';
      if (px) { var sx = Math.round(x - sw / 2), sy = Math.round(footY + p.lift) - Math.round(sh / 2); g.fillRect(sx + 2 * u, sy, Math.round(sw) - 4 * u, sh); g.fillRect(sx, sy + u, Math.round(sw), sh - 2 * u > 0 ? sh - 2 * u : u); }
      else { g.beginPath(); g.ellipse(x, footY + p.lift, sw / 2, sh, 0, 0, Math.PI * 2); g.fill(); }
      g.restore();
      var bx = x + (p.shakeX || 0), by = footY - (L.fly ? L.H * 0.12 : 0) + (p.pose === 'idle' || p.pose === 'hurt' ? 0 : 0);
      if (L.draw) {
        try { L.draw(g, px ? Math.round(bx) : bx, px ? Math.round(by) : by, { facing: want, scale: L.s, pose: p.pose, k: p.k, flash: p.flash, alpha: p.alpha, breath: p.breath }); } catch (e) { ST.errors++; warn('draw', 'unit draw() threw: ' + (e && e.message)); }
        return { x: Math.round(bx - L.W / 2), y: Math.round(by - L.H), w: Math.round(L.W), h: Math.round(L.H), owner: L.id };
      }
      var pk = pickImg(L, want, p.fr); if (!pk) return null;
      var img = pk.img, B = boundsFor(L, img), s = L.s, iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
      // the art's foot centre lands on (bx, by); a mirror flips around that centre
      var cxArt = pk.flip ? iw - B.cx : B.cx, dx = bx - cxArt * s, dy = by - B.foot * s;
      if (px) { dx = Math.round(dx); dy = Math.round(dy); }
      var draws = [[img, 1]];
      if (p.ghost) draws = [[img, 0.42, s * 8 * (want === 'right' ? 1 : -1)], [img, 1]];   // one faint after-image where it stood
      g.save(); g.imageSmoothingEnabled = !px;
      draws.forEach(function (d) {
        g.save(); g.globalAlpha *= d[1] * p.alpha;
        var ox = d[2] ? (px ? Math.round(d[2]) : d[2]) : 0;
        var X0 = dx + ox, Y0 = dy;
        if (pk.flip) { g.translate(dx + ox + iw * s, dy); g.scale(-1, 1); X0 = 0; Y0 = 0; }
        g.drawImage(d[0], X0, Y0, iw * s, ih * s);
        if (d[1] === 1 && p.flash > 0) { var a1 = g.globalAlpha; g.globalAlpha = a1 * p.flash; g.drawImage(whiteFor(L, img), X0, Y0, iw * s, ih * s); g.globalAlpha = a1; }
        if (d[1] === 1 && p.dark > 0) { g.globalAlpha *= p.dark; g.drawImage(whiteFor(L, img, true), X0, Y0, iw * s, ih * s); }
        g.restore();
      });
      g.restore();
      return { x: Math.round(bx - L.W / 2), y: Math.round(by - L.H), w: Math.round(L.W), h: Math.round(L.H), owner: L.id };
    }
    function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
    function drawSlash(g, s, x0, y0, t, u) {   // a thick crescent of light swept in front of the striker, pixel stepped
      var k = seg(t, s.tSwing - 30, s.tStopEnd + 110); if (k <= 0 || k >= 1) return;
      var R = Math.max(12 * u, s.striker.H * 0.62), crit = s.res === 'crit', cols = crit ? ['#ffffff', '#fff2a0', '#ffb43a', '#c0501a'] : ['#ffffff', '#e8f4ff', '#8ac0ff', '#3a60c8'];
      var a0 = -1.75, a1 = 1.05, head = a0 + (a1 - a0) * eout(Math.min(1, k * 1.7)), tail = a0 + (a1 - a0) * ein(clamp(k * 1.7 - 0.55, 0, 1));
      var maxT = (crit ? 9 : 7) * u, st = u / R * 0.8, fade = 1 - seg(k, 0.75, 1);
      g.save(); g.globalAlpha *= fade;
      for (var a = tail; a < head; a += st) {
        var w = Math.sin((a - tail) / Math.max(0.01, head - tail) * Math.PI), th = Math.max(u, Math.round(maxT * w / u) * u);
        var cx = Math.cos(a), sy = Math.sin(a);
        for (var r = 0; r < th; r += u) {
          var rr = R - r, f = r / th, c = f < 0.18 ? cols[0] : f < 0.45 ? cols[1] : f < 0.8 ? cols[2] : cols[3];
          if (f >= 0.8 && w < 0.35) continue;
          px(g, Math.floor((x0 + s.dir * cx * rr) / u) * u, Math.floor((y0 + sy * rr * 0.92) / u) * u, u, u, c);
        }
      }
      // speed lines behind the blade tip
      for (var i = 0; i < 3; i++) { var la = head - 0.25 - i * 0.18; if (la < tail) break; var lx = x0 + s.dir * Math.cos(la) * (R + (3 + i * 3) * u), ly = y0 + Math.sin(la) * (R + (3 + i * 3) * u) * 0.92; px(g, lx - (s.dir > 0 ? 6 * u : 0), ly, 6 * u, u, cols[1]); }
      g.restore();
    }
    function drawSpark(g, s, x, y, t, u) {   // impact star, ring and flying sparks, pure function of t
      var ff = t - s.tImp; if (s.res === 'miss' || ff < 0 || ff > 460) return;
      var crit = s.res === 'crit', col = crit ? ['#ffffff', '#ffe070', '#ff7a3a'] : ['#ffffff', '#fff4c0', '#ffb060'], q = function (v) { return Math.floor(v / u) * u; };
      if (s.kind === 'magic') {   // spell burst: a pillar of light and a ring of tinted shards
        var R = ramp(s.striker.tint), kb = seg(ff, 0, s.stop + 320), H2 = s.target.H * 1.1;
        if (kb < 1) { g.save(); g.globalAlpha *= 1 - kb; var pw = Math.round((10 - 6 * kb) * u / u) * u; px(g, q(x) - pw, q(y - H2 * 0.7), pw * 2, H2, R[1]); px(g, q(x) - (pw >> 1), q(y - H2 * 0.7), pw, H2, R[0]); g.restore(); }
        col = crit ? ['#ffffff', '#ffe070', '#ff7a3a'] : [R[0], R[1], R[2]];
      }
      if (ff < s.stop + 90) {
        var k = seg(ff, 0, s.stop + 90), r = (crit ? 22 : 15) * u * (0.55 + 0.45 * eout(k));
        for (var i = 0; i < 8; i++) {
          var a = i * Math.PI / 4 + 0.39, len = r * (i % 2 ? 0.5 : 1);
          for (var d = 0; d < len; d += u) { var th = d < len * 0.4 ? 3 * u : d < len * 0.75 ? 2 * u : u; px(g, q(x + Math.cos(a) * d) - (th >> 1), q(y + Math.sin(a) * d) - (th >> 1), th, th, d < len * 0.3 ? col[0] : d < len * 0.7 ? col[1] : col[2]); }
        }
        px(g, q(x) - 4 * u, q(y) - 4 * u, 8 * u, 8 * u, col[1]); px(g, q(x) - 3 * u, q(y) - 3 * u, 6 * u, 6 * u, col[0]);
      }
      // expanding ring
      var rk = seg(ff, s.stop, s.stop + 260);
      if (rk > 0 && rk < 1) { var rr = (6 + (crit ? 26 : 18) * eout(rk)) * u, n = Math.max(16, Math.round(rr / u * 1.4)); g.save(); g.globalAlpha *= 1 - rk; for (var j = 0; j < n; j++) { var an = j / n * Math.PI * 2; px(g, q(x + Math.cos(an) * rr), q(y + Math.sin(an) * rr * 0.8), u, u, col[rk < 0.4 ? 0 : 1]); } g.restore(); }
      var m = crit ? 18 : 12, ts = Math.max(0, ff - s.stop) / 1000;
      for (var jj = 0; jj < m; jj++) {
        var ang = -Math.PI * (0.1 + 0.8 * hsh(jj, s.i, S.seed)), sp = (70 + 130 * hsh(jj, 3, S.seed)) * u, dirx = s.dir * (hsh(jj, 2, S.seed) > 0.2 ? 1 : -0.6);
        var sx = x + dirx * Math.abs(Math.cos(ang)) * sp * ts * 1.3, sy = y + Math.sin(ang) * sp * ts + 300 * u * ts * ts, life = 1 - ts / 0.4;
        if (life <= 0) continue;
        px(g, q(sx), q(sy), life > 0.5 ? 2 * u : u, life > 0.5 ? 2 * u : u, jj % 3 ? col[1] : col[2]);
      }
    }
    function drawProjectile(g, s, t, sx, sy, tx, ty, u) {
      if (s.kind === 'melee' || t < s.tSwing) return;
      var k = seg(t, s.tSwing, s.tImp), miss = s.res === 'miss';
      if (t >= s.tImp && !miss) return;
      if (miss && t > s.tImp + 260) return;
      var ex = tx, ey = miss ? ty - s.target.H * 0.55 : ty;
      var x = sx + (ex - sx) * k, y = sy + (ey - sy) * k - Math.sin(k * Math.PI) * (s.kind === 'ranged' ? 8 * u : 3 * u);
      if (miss && t >= s.tImp) { var k2 = (t - s.tImp) / (s.tImp - s.tSwing); x = ex + (ex - sx) * k2; y = ey - 6 * u * k2; }
      if (s.kind === 'ranged') {   // arrow, 2u thick: shaft, steel head, red fletching, a short streak behind it
        var d = s.dir, q = function (v) { return Math.floor(v / u) * u; }, X = q(x), Y = q(y), L2 = 18 * u, bk = function (a, w) { return d > 0 ? X - a - w : X + a; };
        g.save(); g.globalAlpha *= 0.45; px(g, bk(L2 + 2 * u, 12 * u), Y, 12 * u, u, '#ffffff'); g.restore();
        px(g, bk(0, L2), Y - u, L2, u, '#d8b080'); px(g, bk(0, L2), Y, L2, u, '#6a4422');
        px(g, d > 0 ? X : X - 3 * u, Y - 2 * u, 3 * u, 4 * u, '#9aa6b8'); px(g, d > 0 ? X + 3 * u : X - 4 * u, Y - u, u, 2 * u, '#e8eef8'); px(g, d > 0 ? X : X - u, Y - 2 * u, u, u, '#ffffff');
        px(g, bk(L2 - 4 * u, 4 * u), Y - 3 * u, 4 * u, 2 * u, '#e04848'); px(g, bk(L2 - 4 * u, 4 * u), Y + u, 4 * u, 2 * u, '#a82838');
      } else {   // spell orb: tinted glow, white core, a trail of sparks
        var R = ramp(s.striker.tint), q = function (v) { return Math.floor(v / u) * u; };
        for (var i = 7; i >= 1; i--) { var kk = Math.max(0, k - i * 0.04), tx2 = sx + (ex - sx) * kk, ty2 = sy + (ey - sy) * kk - Math.sin(kk * Math.PI) * 3 * u, r = Math.max(u, Math.round((7 - i) * 0.8) * u); g.save(); g.globalAlpha *= 0.15 + 0.08 * (7 - i); px(g, q(tx2) - r / 2, q(ty2 + Math.sin(i * 1.7 + t / 40) * 2 * u) - r / 2, r, r, i % 2 ? R[1] : R[2]); g.restore(); }
        g.save(); g.globalAlpha *= 0.35; px(g, q(x) - 7 * u, q(y) - 5 * u, 14 * u, 10 * u, R[2]); px(g, q(x) - 5 * u, q(y) - 7 * u, 10 * u, 14 * u, R[2]); g.restore();
        px(g, q(x) - 4 * u, q(y) - 3 * u, 8 * u, 6 * u, R[1]); px(g, q(x) - 3 * u, q(y) - 4 * u, 6 * u, 8 * u, R[1]); px(g, q(x) - 2 * u, q(y) - 2 * u, 4 * u, 4 * u, R[0]);
        var sp = Math.floor(t / 50) % 4; px(g, q(x) + (sp - 2) * 3 * u, q(y) - 6 * u, u, u, R[0]); px(g, q(x) - (sp - 1) * 3 * u, q(y) + 5 * u, u, u, R[0]);
      }
    }
    function drawCastRing(g, s, t, x, y, u) {
      if (s.kind !== 'magic' || t < s.tWind || t >= s.tSwing + 120) return;
      var k = seg(t, s.tWind, s.tSwing), a = t >= s.tSwing ? 1 - seg(t, s.tSwing, s.tSwing + 120) : 1, rw = s.striker.W * 0.7 * (0.5 + 0.5 * eout(k));
      g.save(); g.globalAlpha *= a;
      var R = ramp(s.striker.tint); for (var i = 0; i < 32; i++) { var an = i / 32 * Math.PI * 2 + t / 300, ex = x + Math.cos(an) * rw, ey = y + Math.sin(an) * rw * 0.28; px(g, Math.floor(ex / u) * u, Math.floor(ey / u) * u, u * (i % 4 ? 1 : 2), u, i % 2 ? R[1] : R[0]); }
      for (var j = 0; j < 8; j++) { var h = ((t / 6 + j * 37) % 40) / 40, mx = x + (hsh(j, 1, 3) - 0.5) * rw * 1.6; px(g, Math.floor(mx / u) * u, Math.floor((y - h * s.striker.H * 0.9) / u) * u, u, u * 2, j % 2 ? R[1] : R[0]); }
      g.restore();
    }
    function drawMotes(g, Lo, t) {
      var T = THEMES[S.theme], u = Lo.u, st = Lo.stage;
      for (var i = 0; i < 14; i++) {
        var sp = 0.004 + hsh(i, 1, 5) * 0.008, x = st.x + ((hsh(i, 2, 5) * st.w + t * sp * u * 2) % st.w), y = st.y + st.h * (0.2 + 0.6 * hsh(i, 3, 5)) + Math.sin(t / 700 + i) * 4 * u;
        if (((Math.floor(t / 400) + i) % 5) === 0) continue;
        px(g, x, y, u, u, T.motes);
      }
    }
    function drawBar(g, Lo, t, alpha) {
      var b = Lo.bar, u = Lo.u;
      g.save(); g.globalAlpha *= alpha;
      px(g, b.x, b.y, b.w, b.h, '#07060f'); px(g, b.x, b.y + b.h - u, b.w, u, '#3a2e18'); px(g, b.x, b.y + b.h - 2 * u, b.w, u, '#141020');
      var cur = null; for (var i = 0; i < S.list.length; i++) if (t >= S.list[i].t0 && t < S.list[i].tEnd) cur = S.list[i];
      var cap = cur ? cur.caption : t < (S.list[0] ? S.list[0].t0 : 0) ? S.A.name + ' vs ' + S.D.name : '', capY = b.y + Math.round((b.h - 7 * u) / 2) - u;
      if (cur && cur.ko && t >= cur.tKo) cap = cur.target.name + ' falls';
      if (cap) {
        var gold = cur && cur.res === 'crit' && t < cur.tStopEnd;
        if (gold && (Math.floor(t / 90) % 2)) fbText(g, cap, b.x + 6 * u, capY, '#ffffff', '#ffe070', FB.text.shadow, u);
        else fbText(g, cap, b.x + 6 * u, capY, gold ? '#ffe070' : '#fff4c8', gold ? '#ff9a3a' : '#e8c870', FB.text.shadow, u);
      }
      if (P.keys !== 'off') {
        var r = speedRect(), on = P.speed === 2, cap = function (x, y, ch, hot) {   // a small key cap: rim, face, letter
          px(g, x, y, 9 * u, 10 * u, hot ? '#ffe070' : '#5a5478'); px(g, x + u, y + u, 7 * u, 7 * u, hot ? '#c88a20' : '#2a2640'); px(g, x + u, y + 8 * u, 7 * u, u, hot ? '#7a4a10' : '#141020');
          fbText(g, ch, x + 2 * u, y + u, '#ffffff', hot ? '#fff4c0' : '#c8d4ff', null, u);
        };
        cap(r.x, r.y, 'X', on);
        // "x1" / "x2": a lowercase x drawn as pixels, then the digit
        var lx = r.x + 12 * u, ly = r.y + 3 * u, xc = on ? '#ffe070' : '#c8d4ff';
        [[0, 0], [4, 0], [1, 1], [3, 1], [2, 2], [1, 3], [3, 3], [0, 4], [4, 4]].forEach(function (q2) { px(g, lx + q2[0] * u, ly + q2[1] * u, u, u, xc); });
        fbText(g, String(P.speed), lx + 6 * u, r.y + u, on ? '#ffffff' : '#c8d4ff', on ? '#ffe070' : '#8ca8e8', FB.text.shadow, u);
        var zx = r.x - 8 * u - 35 * u; cap(zx, r.y, 'Z', false); fbText(g, 'SKIP', zx + 12 * u, r.y + u, '#c8d4ff', '#8ca8e8', FB.text.shadow, u);
      }
      g.restore();
    }
    function drawPanel(g, Lo, t, alpha) {
      var r = Lo.panel, u = Lo.u, half = Math.floor((r.w - 6 * u) / 2), out = [];
      g.save(); g.globalAlpha *= alpha;
      px(g, r.x, r.y, r.w, r.h, '#07060f');
      [S.L, S.R].forEach(function (L, i) {
        var wr = { x: r.x + 2 * u + i * (half + 2 * u), y: r.y + 2 * u, w: half, h: r.h - 4 * u }; out.push(wr);
        frame(g, wr, L.team, 1);
        var hpv = hpShown(L.role, t), shown = Math.round(hpv), low = hpv <= L.max * 0.25;
        text(g, L.name, wr.x + 6 * u, wr.y + 5 * u, '#fff4c8', '#e8c870');
        if (L.weapon) { var ww = measure(L.weapon); if (ww < wr.w - 12 * u - measure(L.name) - 6 * u) text(g, L.weapon, wr.x + wr.w - 6 * u - ww, wr.y + 5 * u, '#b8d0ff', '#8ca8e8'); }
        // HP label, big number, bar with a pale loss segment that fades after the drain
        text(g, 'HP', wr.x + 6 * u, wr.y + 19 * u, '#b8d0ff', '#8ca8e8');
        var digits = String(Math.max(0, shown)), bw = fbMeasure(digits) * 2 * u, nx = wr.x + 20 * u + (2 * 6 * 2 * u - bw);
        g.drawImage(big(digits, 2 * u, low ? 'low' : 'dmg'), nx - 1, wr.y + 14 * u - 1);
        var mr = { x: wr.x + 50 * u, y: wr.y + 19 * u, w: wr.w - 56 * u, h: 6 * u };
        if (mr.w > 10 * u) {
          meter(g, mr, hpv / L.max, low);
          var gh = lossGhost(L.role, t);
          if (gh) { var iw = mr.w - 2 * u, a1 = Math.round(iw * clamp(hpv / L.max, 0, 1)), a2 = Math.round(iw * clamp(gh.from / L.max, 0, 1)); if (a2 > a1) { g.save(); g.globalAlpha *= gh.a; px(g, mr.x + u + a1, mr.y + u, a2 - a1, mr.h - 2 * u, FB.meter.loss); g.restore(); } }
        }
        if (L.stats) {
          var sx = wr.x + 6 * u, sy = wr.y + 30 * u, keys = [['HIT', L.stats.hit], ['DMG', L.stats.dmg], ['CRT', L.stats.crit]];
          keys.forEach(function (kv) { if (kv[1] == null || kv[1] === '') return; text(g, kv[0], sx, sy, '#b8d0ff', '#8ca8e8'); var vs = String(kv[1]); text(g, vs, sx + 20 * u, sy, '#ffffff', '#c8d4ff'); sx += 20 * u + measure(vs) + 8 * u; });
        }
      });
      g.restore();
      return out;
    }
    function drawPop(g, s, t, x, topY, u) {   // number, MISS or CRITICAL over the target, pure function of t
      var t0 = s.res === 'miss' ? s.tImp : s.tStopEnd, ff = t - t0, life = 1100; if (ff < 0 || ff > life) return null;
      var str = s.res === 'miss' ? 'MISS' : String(s.dmg), sc = (s.res === 'crit' ? 4 : s.res === 'miss' ? 2 : 3) * u, kind = s.res === 'miss' ? 'miss' : s.res === 'crit' ? 'crit' : 'dmg';
      var rise = ff < 120 ? eout(ff / 120) * 10 * u : 10 * u - Math.min(4 * u, eio(seg(ff, 120, 260)) * 4 * u) + seg(ff, 800, life) * 6 * u;
      var a = 1 - seg(ff, 850, life), im = big(str, sc, kind), x0 = Math.round(x - im.width / 2), y0 = Math.round(topY - im.height - rise);
      g.save(); g.globalAlpha *= a;
      if (SK && SK.number && s.res !== 'miss') { try { SK.number(g, str, Math.round(x), Math.round(topY - rise), { kind: kind === 'crit' ? 'crit' : 'dmg', scale: (s.res === 'crit' ? 3 : 2) * u, big: false, align: 'center', baseline: 'bottom', age: ff, life: life }); } catch (e) { g.drawImage(im, x0, y0); } }
      else g.drawImage(im, x0, y0);
      if (s.res === 'crit' && ff < 900) { var lb = big('CRITICAL', u, 'ko'); g.drawImage(lb, Math.round(x - lb.width / 2), y0 - lb.height - u); }
      g.restore();
      return { x: x0, y: y0, w: im.width, h: im.height };
    }
    function draw(ctx) {
      drawnRects = [];
      if (!S || S.phase === 'done') return;
      var g = ctx;
      try {
        var t = S.t, Lo = S.Lo, u = Lo.u, v = Lo.v, introMs = Math.max(0, P.introMs);
        // reveal: a band that opens from the ground line (intro) and closes on it (outro); 'cut' shows the stage at once
        var open = P.intro === 'cut' || introMs === 0 ? 1 : t < introMs ? eio(seg(t, 0, introMs)) : t >= S.tOut ? 1 - eio(seg(t, S.tOut, S.tEnd)) : 1;
        if (open <= 0) return;
        g.save();
        var prevSmooth = g.imageSmoothingEnabled;
        var cy = Lo.ground - Math.round(Lo.stage.h * 0.25), top = Math.round(v.y + (cy - v.y) * (1 - open)), bot = Math.round(v.y + v.h - (v.y + v.h - cy) * (1 - open));
        g.beginPath(); g.rect(v.x, top, v.w, Math.max(1, bot - top)); g.clip();
        // stage
        var cam = camX(t), sk = shake(t), lay = layers(S.theme, Lo), pad = lay.pad;
        g.imageSmoothingEnabled = false;
        if (S.drawBackdrop) { try { S.drawBackdrop(g, { x: v.x, y: Lo.stage.y, w: v.w, h: Lo.stage.h, ground: Lo.ground, horizon: Lo.horizon }, t, cam); } catch (e) { S.drawBackdrop = null; warn('backdrop', 'drawBackdrop threw: built-in backdrop used'); } }
        if (!S.drawBackdrop) {
          var ox = function (f) { return Math.round(v.x - pad - cam * f + sk.x * f); };
          g.drawImage(lay.sky, ox(0.15), v.y + sk.y * 0.3);
          g.drawImage(lay.mid, ox(0.45), v.y + sk.y * 0.6);
          g.drawImage(lay.ground, ox(1), v.y + sk.y);
        }
        drawMotes(g, Lo, t);
        var cur = null; for (var i = 0; i < S.list.length; i++) if (t >= S.list[i].t0 && t < S.list[i].tEnd) cur = S.list[i];
        // fighters: the striker of the current strike in front
        var order = [S.L, S.R]; if (cur && cur.striker === S.L) order = [S.R, S.L];
        var pos = {};
        [S.L, S.R].forEach(function (L) { var p = pose(L, t), x = L.home + p.dx + cam + sk.x, fy = Lo.ground + sk.y - p.lift; pos[L.side] = { p: p, x: pixelMode() ? Math.round(x) : x, fy: pixelMode() ? Math.round(fy) : fy }; });
        if (cur) drawCastRing(g, cur, t, pos[cur.striker.side].x, Lo.ground + sk.y, u);
        // crit gleam darkens the stage around the striker
        if (cur && cur.res === 'crit' && t >= cur.t0 && t < cur.tImp + cur.stop) { g.save(); g.globalAlpha *= 0.55 * Math.min(1, seg(t, cur.t0, cur.t0 + 120)); px(g, v.x, Lo.stage.y, v.w, Lo.stage.h, '#100818'); g.restore(); }
        order.forEach(function (L) { var q = pos[L.side], r = drawUnit(g, L, q.p, q.x, q.fy, t); if (r) drawnRects.push(r); });
        if (cur) {
          var st = pos[cur.striker.side], tg = pos[cur.target.side];
          var hitX = tg.x - cur.dir * cur.target.W * 0.18, hitY = tg.fy - cur.target.H * 0.55;
          if (cur.kind === 'melee' && cur.res !== 'miss') drawSlash(g, cur, st.x + cur.dir * cur.striker.W * 0.25, st.fy - cur.striker.H * 0.55, t, u);
          if (cur.kind === 'melee' && cur.res === 'miss') { var km = seg(t, cur.tSwing, cur.tImp + 120); if (km > 0 && km < 1) drawSlash(g, cur, st.x + cur.dir * cur.striker.W * 0.25, st.fy - cur.striker.H * 0.55, t, u); }
          drawProjectile(g, cur, t, st.x + cur.dir * cur.striker.W * 0.4, st.fy - cur.striker.H * 0.55, hitX, hitY, u);
          drawSpark(g, cur, hitX, hitY, t, u);
          // gleam star on the striker before a critical
          if (cur.res === 'crit' && t < cur.tCrouch) { var gk = seg(t, cur.t0, cur.tCrouch), gx = st.x + cur.dir * cur.striker.W * 0.2, gy = st.fy - cur.striker.H * 0.8, gr = Math.round((3 + 6 * Math.sin(gk * Math.PI)) * u); px(g, gx - gr, gy, gr * 2 + u, u, '#ffffff'); px(g, gx, gy - gr, u, gr * 2 + u, '#ffffff'); px(g, gx - u, gy - u, 3 * u, 3 * u, '#ffe070'); }
        }
        // white screen flash on a critical impact
        S.list.forEach(function (s) { if (s.res === 'crit' && t >= s.tImp && t < s.tImp + 90) { g.save(); g.globalAlpha *= 0.4 * (1 - seg(t, s.tImp, s.tImp + 90)); px(g, v.x, Lo.stage.y, v.w, Lo.stage.h, '#ffffff'); g.restore(); } });
        // KO motes rising from the fallen unit
        S.list.forEach(function (s) {
          if (!s.ko || t < s.tKo || t > s.tKo + 900) return; var q = pos[s.target.side], kd = seg(t, s.tKo, s.tKo + 900);
          for (var j = 0; j < 18; j++) { var mx = q.x + (hsh(j, 1, 9) - 0.5) * s.target.W, my = q.fy - hsh(j, 2, 9) * s.target.H * 0.9 - kd * (20 + 30 * hsh(j, 3, 9)) * u; if (kd > 0.15 + 0.8 * hsh(j, 4, 9)) continue; px(g, mx, my, u, u, j % 3 ? '#ffffff' : '#ffe070'); }
        });
        // pops
        S.list.forEach(function (s) { var q = pos[s.target.side]; var r = drawPop(g, s, t, q.x, q.fy - s.target.H - 2 * u, u); if (r) drawnRects.push(Object.assign(r, { owner: s.target.id, kind: 'pop' })); });
        // letterbox bar and panel slide with the band
        drawBar(g, Lo, t, 1); drawnRects.push({ x: Lo.bar.x, y: Lo.bar.y, w: Lo.bar.w, h: Lo.bar.h, owner: null, kind: 'bar' });
        var pr = drawPanel(g, Lo, t, 1); pr.forEach(function (r) { drawnRects.push(Object.assign({ owner: null, kind: 'panel' }, r)); });
        // band edges: bright lines while opening / closing
        if (open < 1) { px(g, v.x, top, v.w, u, '#ffffff'); px(g, v.x, bot - u, v.w, u, '#ffffff'); px(g, v.x, top + u, v.w, u, '#ffe070'); px(g, v.x, bot - 2 * u, v.w, u, '#ffe070'); }
        g.imageSmoothingEnabled = prevSmooth;
        g.restore();
        lastState = stateNow();
      } catch (e) { ST.errors++; warn('drawErr', 'draw failed: ' + (e && e.message)); try { g.restore(); } catch (er) {} }
    }

    return {
      play: play, busy: busy, update: update, draw: draw, skip: skip, key: key, tap: tap, setSpeed: setSpeed, toggleSpeed: toggleSpeed,
      speed: function () { return P.speed; },
      clear: function () { S = null; drawnRects = []; },
      state: function () { return S ? stateNow() : { busy: false, phase: 'idle', actors: [] }; },
      lastDrawn: function () { return drawnRects.slice(); },
      stats: function () { var r = {}; for (var q in ST) r[q] = ST[q]; return r; },
      setParams: setParams, params: function () { var r = {}; for (var q in P) r[q] = P[q]; return r; },
      setView: function (v) { view = v ? { x: num(v.x, 0), y: num(v.y, 0), w: num(v.w, 0), h: num(v.h, 0) } : null; },
      rect: function () { return S && S.phase !== 'done' ? { x: S.Lo.v.x, y: S.Lo.v.y, w: S.Lo.v.w, h: S.Lo.v.h } : null; }
    };
  }

  root.GameDNA_ClashCutin = { create: create, version: '1.1.1', glyph: function (str, sc, kind) { return big(String(str), Math.max(1, sc | 0), kind || 'dmg'); }, glyphMask: bigMask, themes: Object.keys(THEMES), defaults: DEFAULTS };
})(typeof window !== 'undefined' ? window : this);
