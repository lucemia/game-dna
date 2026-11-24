/* GameDNA B-06 Pseudo-3D flight ground  (module v1, plain script, no dependencies, no exports)
   Global: window.GameDNA_Flight.create(options) -> instance. See module/README.md. Include verbatim; do not edit.
   Owns: the scanline-scaled ground (perspective projection of the host's top-down tile map, baked once into a
   mip-mapped texture, drawn per pixel into an offscreen ImageData), the horizon sky band, distance fog, billboards
   (scaled by distance, depth-sorted), the mount sprite and its ground shadow, the flight controller (turn, bank with a
   slight horizon tilt, accelerate, brake, world wrap or soft edges), the take-off and landing transitions between the
   host's top-down walking view and the flight view, landing only where the host's canLand(tx, ty) says so, a mini-map,
   the landing prompt and a speed gauge (UI through GameDNA_Skin when skin-api.js is loaded, pixel16 look built in).
   The host keeps its own walking game, hero and camera and answers callbacks. */
(function (root) {
  'use strict';
  var TAU = Math.PI * 2;
  var DEF = { speed: 72, turn: 100, bank: 5, height: 56, horizon: 0.3, transition: 600, fog: 0.6, sky: 'day', mount: 'bird', minimap: 'on' };
  var NUMERIC = { speed: [30, 200], turn: [40, 240], bank: [0, 12], height: [24, 120], horizon: [0.18, 0.45], transition: [200, 2000], fog: [0, 1] };
  var KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    KeyZ: 'land', Space: 'land', Enter: 'land' };
  var SKIES = {
    day: { grad: ['#2a4aa8', '#3560c0', '#4c7ad4', '#6a98e4', '#90b6f0', '#b8d0f6', '#d8e6fa'], haze: '#cfdcf4',
      cloud: ['#9fb2e0', '#b9c8ee', '#d2def6', '#e8effc', '#ffffff'], far: ['#6e7fb8', '#8494c6', '#9eacd6'], farSnow: '#e2e8f8', sun: ['#fff8e0', '#ffffff'] },
    dusk: { grad: ['#221a4c', '#3c2468', '#62307c', '#92407e', '#c85a74', '#ec8a72', '#f8bc8a'], haze: '#eeb090',
      cloud: ['#6a3c70', '#8e4e78', '#b86a80', '#e0928a', '#ffc8a0'], far: ['#4a3062', '#5c3a6e', '#704678'], farSnow: '#f4c8b8', sun: ['#fff0c8', '#fffbe8'] }
  };
  var INK = '#16122a';
  // 5x7 fallback font (pixel16 look when skin-api.js is not loaded)
  var GL = {
    A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
    D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
    G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
    J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
    M: '10001110111010110101100011000110001', N: '10001100011100110101100111000110001', O: '01110100011000110001100011000101110',
    P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
    S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
    V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
    Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
    0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110', 2: '01110100010000100010001000100011111',
    3: '11111000100010000010000011000101110', 4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110',
    6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000', 8: '01110100011000101110100011000101110',
    9: '01110100011000101111000010001001100', '-': '00000000000000001110000000000000000', '.': '00000000000000000000000000110001100',
    '!': '00100001000010000100001000000000100', '/': '00001000100010000100010001000010000', ':': '00000011000110000000011000110000000',
    '?': '01110100010000100010001000000000100', ' ': '00000000000000000000000000000000000'
  };
  var WIN16 = ['#4c5a8a', '#3e4a76', '#323c62', '#262e4e', '#c8d4f4', '#0a0e22'];

  /* ---------- small helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function rgb(c) {
    if (Array.isArray(c)) return [c[0] | 0, c[1] | 0, c[2] | 0];
    if (typeof c === 'number') return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    c = String(c || '#ff00ff');
    if (c[0] === '#' && c.length === 4) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)];
    if (c[0] === '#') return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    var m = c.match(/(\d+)\D+(\d+)\D+(\d+)/); return m ? [+m[1], +m[2], +m[3]] : [255, 0, 255];
  }
  function pack(r, g, b) { return ((255 << 24) | (clamp(b | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(r | 0, 0, 255)) >>> 0; }
  function hex(a) { return '#' + a.map(function (v) { v = clamp(Math.round(v), 0, 255); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function mixc(a, b, t) { var x = rgb(a), y = rgb(b); return hex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  function blend32(v, hz, w) {   // w 0..256 toward the haze colour hz = [r, g, b]
    if (w <= 0) return v; if (w >= 256) return pack(hz[0], hz[1], hz[2]);
    var r = v & 255, g = (v >> 8) & 255, b = (v >> 16) & 255;
    return ((255 << 24) | ((b + (((hz[2] - b) * w) >> 8)) << 16) | ((g + (((hz[1] - g) * w) >> 8)) << 8) | (r + (((hz[0] - r) * w) >> 8))) >>> 0;
  }
  function hash(x, y, k) { var h = Math.imul(x + 374761 * k, 668265263) ^ Math.imul(y + 9173, 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function mk(w, h) { if (typeof document === 'undefined') return null; var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  function wrapA(a) { a = a % TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; }
  function smooth(s) { s = clamp(s, 0, 1); return s * s * (3 - 2 * s); }
  // paint a sprite with R(x, y, w, h, colour) and give it a 1 px ink outline (dilation)
  function sprite(w, h, fn, ink) {
    var c = mk(w + 2, h + 2); if (!c) return null; var q = c.getContext('2d');
    fn(function (x, y, ww, hh, col) { if (ww <= 0 || hh <= 0) return; q.fillStyle = col; q.fillRect(Math.round(x) + 1, Math.round(y) + 1, Math.round(ww), Math.round(hh)); });
    var id = q.getImageData(0, 0, c.width, c.height), d = id.data, W = c.width, H = c.height, o = rgb(ink || INK), mark = [];
    for (var i = 0; i < W * H; i++) { if (d[i * 4 + 3]) continue; var x = i % W, y = (i / W) | 0;
      if ((x > 0 && d[(i - 1) * 4 + 3] > 200) || (x < W - 1 && d[(i + 1) * 4 + 3] > 200) || (y > 0 && d[(i - W) * 4 + 3] > 200) || (y < H - 1 && d[(i + W) * 4 + 3] > 200)) mark.push(i); }
    mark.forEach(function (i) { d[i * 4] = o[0]; d[i * 4 + 1] = o[1]; d[i * 4 + 2] = o[2]; d[i * 4 + 3] = 255; });
    q.putImageData(id, 0, 0); return c;
  }
  function disc(R, cx, cy, rx, ry, col) { for (var y = -ry; y <= ry; y++) { var w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.01)))); R(cx - w, cy + y, w * 2 + 1, 1, col); } }

  /* ---------- built-in billboard art (original, neutral fantasy) ---------- */
  var ART = {};
  function art(kind) {
    if (ART[kind] !== undefined) return ART[kind];
    var c = null;
    if (kind === 'mountain' || kind === 'peak') {   // shaded pixel mountain: lit west face, shaded east face, ridges, jagged snow cap, soft grassy foot
      var snowy = kind === 'peak', MW = 64, MH = snowy ? 46 : 38, cx = 30 + (snowy ? 2 : 0);
      c = sprite(MW, MH, function (R) {
        var LIT = ['#c4bccc', '#aaa2b8', '#928aa4'], SH = ['#7a7290', '#655e7c', '#524b68'], SN = ['#ffffff', '#e6ecf8', '#bcc6e0', '#98a2c4'];
        var sub = Math.round(MW * 0.72), subH = Math.round(MH * 0.55);   // a lower shoulder peak to the right
        for (var y = 0; y < MH; y++) for (var x = 0; x < MW; x++) {
          var d1 = Math.abs(x - cx) / (MW * 0.47), h1 = 1 - d1, top1 = Math.round((1 - h1) * MH + (hash(x, 1, 11) - 0.5) * 2);
          var d2 = Math.abs(x - sub) / (MW * 0.3), top2 = Math.round(MH - subH * (1 - d2) + (hash(x, 2, 11) - 0.5) * 2);
          var top = Math.min(d1 < 1 ? top1 : MH + 1, d2 < 1 ? top2 : MH + 1); if (y < top) continue;
          var main = d1 < 1 && top1 <= (d2 < 1 ? top2 : MH + 1), px = main ? cx : sub, lit = x < px, depth = (y - top), k = hash(x, y, 7);
          var col = lit ? LIT[depth < 2 ? 0 : k < 0.75 ? 1 : 2] : SH[depth < 2 ? 0 : k < 0.75 ? 1 : 2];
          if (Math.abs((x - px) * 0.9 - (y - top) * 0.25 * (lit ? -1 : 1)) < 0.8 && y > top + 3) col = lit ? '#8a829c' : '#463f5c';   // gullies
          if (lit && ((x + y * 2) % 9) === 0 && k < 0.4) col = '#d4ccdc';
          var snowLine = (snowy ? 0.42 : 0.2) * MH + (hash(x, 3, 13) - 0.5) * 5 + (main ? 0 : 99);
          if (y < snowLine) col = lit ? SN[depth < 1 ? 0 : 1] : SN[depth < 1 ? 2 : 3];
          var foot = MH - y;
          if (foot <= 7 && k < (8 - foot) / 7) col = lit ? (k < 0.3 ? '#7ab060' : '#5e9a4a') : '#4a7a3e';                     // grassy foot dithered into the ground
          R(x, y, 1, 1, col);
        }
      });
    } else if (kind === 'tree') {
      c = sprite(14, 20, function (R) {
        R(6, 13, 2, 7, '#6a4426'); R(7, 13, 1, 7, '#4a2e1a');
        disc(R, 7, 8, 6, 7, '#2e7a3c'); disc(R, 6, 6, 4, 4, '#3e9a48'); disc(R, 5, 5, 2, 2, '#6cc46a');
        R(9, 9, 3, 3, '#1f5a2c'); R(3, 11, 3, 2, '#246632');
      });
    } else if (kind === 'pine') {
      c = sprite(12, 22, function (R) {
        R(5, 17, 2, 5, '#5a3a22');
        for (var t = 0; t < 3; t++) for (var y = 0; y < 8; y++) { var w = Math.round((y + 1) * (0.55 + t * 0.12)); R(6 - w, 1 + t * 5 + y, w * 2, 1, y < 2 ? '#3e8a52' : '#2a6a40'); R(6, 1 + t * 5 + y, w, 1, '#1e5034'); }
      });
    } else if (kind === 'town') {
      c = sprite(36, 26, function (R) {
        function house(x, y, w, h, roof, roofD) {
          R(x, y + 5, w, h, '#e8d8b8'); R(x + w - 2, y + 5, 2, h, '#c4b090'); R(x, y + h + 4, w, 1, '#a08a6a');
          for (var r = 0; r < 6; r++) R(x - 1 + r * 0, y + r, w + 2, 1, r < 1 ? mixc(roof, '#ffffff', 0.35) : r < 4 ? roof : roofD);
          R(x + 2, y + 8, 2, 2, '#3a4a6a'); if (w > 9) R(x + w - 5, y + 8, 2, 2, '#3a4a6a'); R(x + (w >> 1) - 1, y + h + 1, 3, 4, '#6a4426');
        }
        R(14, 2, 6, 18, '#d8ccb0'); R(18, 2, 2, 18, '#b4a688'); R(13, 0, 8, 3, '#4a6ab8'); R(16, -1, 2, 2, '#ffd060'); R(15, 7, 3, 3, '#3a4a6a');
        house(1, 9, 11, 9, '#c84a3a', '#8a2a24'); house(22, 8, 12, 10, '#3a6ac8', '#24448a'); house(9, 14, 10, 7, '#d88a3a', '#9a5a20');
      });
    } else if (kind === 'tower') {
      c = sprite(14, 36, function (R) {
        R(3, 8, 8, 28, '#b8b0c4'); R(8, 8, 3, 28, '#8a829c'); for (var y = 10; y < 36; y += 5) R(3, y, 8, 1, '#9a92ac');
        R(2, 5, 10, 4, '#a8a0b8'); for (var x = 2; x < 12; x += 3) R(x, 3, 2, 2, '#a8a0b8');
        R(6, 14, 2, 4, '#2a2a4a'); R(6, 24, 2, 4, '#2a2a4a'); R(7, -3, 1, 8, '#6a4426'); R(8, -3, 4, 3, '#d84a4a');
      });
    } else if (kind === 'rock') {
      c = sprite(16, 10, function (R) { disc(R, 8, 6, 7, 4, '#8a849a'); disc(R, 6, 5, 4, 2, '#aaa4b8'); R(10, 7, 4, 2, '#5e5872'); });
    } else if (kind === 'cloud') {
      c = sprite(30, 14, function (R) { disc(R, 15, 9, 14, 4, '#c8d4f0'); disc(R, 10, 7, 7, 5, '#e2eafa'); disc(R, 19, 6, 7, 5, '#f4f7ff'); disc(R, 14, 4, 5, 4, '#ffffff'); }, '#8a9ac8');
    }
    ART[kind] = c; return c;
  }
  var SIZE = { mountain: 34, peak: 44, tree: 22, pine: 24, town: 30, tower: 40, rock: 10, cloud: 18 };   // world px tall
  var FOGGED = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function fogged(img, step, haze) {   // 4 pre-blended fog steps per image (pixel art keeps hard edges, no alpha fades)
    if (!FOGGED || !img || step <= 0) return img;
    var m = FOGGED.get(img); if (!m) { m = {}; FOGGED.set(img, m); }
    var key = step + haze; if (m[key]) return m[key];
    var c = mk(img.width, img.height); if (!c) return img; var q = c.getContext('2d'); q.drawImage(img, 0, 0);
    try { var id = q.getImageData(0, 0, c.width, c.height), d = id.data, hz = rgb(haze), w = step * 0.22;
      for (var i = 0; i < d.length; i += 4) if (d[i + 3]) { d[i] += (hz[0] - d[i]) * w; d[i + 1] += (hz[1] - d[i + 1]) * w; d[i + 2] += (hz[2] - d[i + 2]) * w; }
      q.putImageData(id, 0, 0); } catch (e) { return img; }
    return (m[key] = c);
  }

  /* ---------- mount sprites: seen from behind, 4 flap frames x 5 bank steps ---------- */
  var MOUNTS = {};
  function mountArt(kind, frame, bank) {
    var key = kind + frame + '|' + bank; if (MOUNTS[key]) return MOUNTS[key];
    var c;
    if (kind === 'glider') {
      c = sprite(58, 40, function (R) {
        var tilt = bank * 2.2;
        for (var x = 0; x < 58; x++) {   // the wing: a wide shallow chevron with stripes, tilted when banking
          var u = (x - 29) / 29, top = Math.round(6 + Math.abs(u) * 7 + u * tilt + (frame & 1) * (Math.abs(u) > 0.8 ? 1 : 0)), th = Math.round(5 - Math.abs(u) * 3);
          var stripe = (Math.floor(Math.abs(x - 29) / 5) % 2) ? '#f2e2c0' : '#d24a3c';
          R(x, top, 1, th, stripe); R(x, top, 1, 1, Math.abs(u) < 0.95 ? '#fff4dc' : stripe); R(x, top + th, 1, 1, '#8a3428');
        }
        R(28, 10, 2, 14, '#5a4632'); R(18, 20, 22, 1, '#5a4632');                                   // keel and bar
        disc(R, 29, 24, 4, 4, '#7a4a22'); R(26, 27, 7, 7, '#3a8a58'); R(26, 27, 2, 7, '#2a6a44'); R(25, 28, 9, 2, '#d04848');
        R(33 + (frame & 1), 29, 4 + (frame >> 1), 2, '#d04848'); R(26, 34, 3, 4, '#5a4632'); R(31, 34, 3, 4, '#5a4632');
      });
    } else {
      c = sprite(58, 44, function (R) {
        var flap = [-9, -4, 3, 7][frame & 3], cx = 29;
        for (var side = -1; side <= 1; side += 2) {   // wings: root at the shoulders, tip up/down by flap and bank
          var tipY = 19 + flap + side * bank * 3;
          for (var i = 0; i <= 22; i++) {
            var u = i / 22, x = cx + side * (8 + i), top = Math.round(17 + (tipY - 17) * u - 3 * Math.sin(u * Math.PI) * (flap < 0 ? 0.4 : 1)),
              bot = Math.round(28 + (tipY + 4 - 28) * u + (u > 0.45 && (i % 4) < 2 ? 2 : 0));
            if (bot < top + 2) bot = top + 2;
            for (var y = top; y <= bot; y++) {
              var f = (y - top) / Math.max(1, bot - top), col = f < 0.18 ? '#9cc4f8' : f < 0.55 ? '#4a7ad8' : f < 0.82 ? '#3a5cb4' : '#26408a';
              if (u > 0.45 && (i % 4) === 0 && f > 0.3) col = '#26408a';                                 // primary feather lines
              if (u < 0.3 && f > 0.25 && f < 0.5 && (i + y) % 3 === 0) col = '#6a9ae8';
              R(x, y, 1, 1, col);
            }
          }
        }
        for (var t = -2; t <= 2; t++) R(cx + t * 3 - 1, 33, 3, 9 - Math.abs(t) * 2, Math.abs(t) === 2 ? '#26408a' : t === 0 ? '#3a5cb4' : '#4a7ad8');   // tail fan
        disc(R, cx, 25, 9, 10, '#3e66c4'); disc(R, cx - 2, 22, 6, 6, '#4f7ad6'); R(cx + 4, 26, 4, 7, '#2c4c9c');               // body
        disc(R, cx, 30, 6, 4, '#c8a050'); R(cx - 6, 30, 12, 1, '#8a6830');                                                      // saddle
        R(cx - 5, 18, 10, 11, '#3a8a58'); R(cx - 5, 18, 2, 11, '#2a6a44'); R(cx + 3, 18, 2, 11, '#2a6a44'); R(cx - 6, 17, 12, 3, '#d04848');   // rider cloak + scarf
        R(cx + 5, 18 + (frame & 1), 5 + (frame >> 1), 2, '#d04848'); R(cx + 9, 19 + (frame & 1), 2, 1, '#a83434');
        disc(R, cx, 13, 4, 4, '#7a4a22'); R(cx - 2, 10, 3, 2, '#9a6a3a');                                                       // rider's head
        disc(R, cx, 5, 4, 4, '#3ea0b8'); R(cx - 1, 1, 2, 3, '#ffd060');                                                         // mount head + crest
        R(cx - 9, 3, 5, 2, '#d84a3c'); R(cx + 5, 3, 5, 2, '#d84a3c'); R(cx - 10, 2, 2, 1, '#ff8a6a'); R(cx + 9, 2, 2, 1, '#ff8a6a');
      });
    }
    MOUNTS[key] = c; return c;
  }

  /* ---------- sky strip (one turn of the heading = strip width), baked once per size ---------- */
  function bakeSky(SW, SH, pal) {
    var g = pal.grad.map(rgb), buf = new Uint32Array(SW * SH), cl = new Uint32Array(SW * SH), R = rng(91), i, x, y;
    for (y = 0; y < SH; y++) { var f = y / (SH - 1) * (g.length - 1), k = Math.min(g.length - 2, Math.floor(f)), t = f - k;
      for (x = 0; x < SW; x++) { var d = (hash(x, y, 4) - 0.5) * 0.9, tt = clamp(t + d * 0.25, 0, 1); buf[y * SW + x] = pack(g[k][0] + (g[k + 1][0] - g[k][0]) * tt, g[k][1] + (g[k + 1][1] - g[k][1]) * tt, g[k][2] + (g[k + 1][2] - g[k][2]) * tt); } }
    // far ridge silhouettes along the horizon (2 layers), snow on the tallest
    var far = pal.far.map(rgb), sn = rgb(pal.farSnow);
    for (var layer = 0; layer < 2; layer++) {
      var hgt = new Float32Array(SW), seeds = []; for (i = 0; i < 9 + layer * 5; i++) seeds.push([R() * SW, 6 + R() * (layer ? 10 : 18), 16 + R() * 40]);
      var side = new Int8Array(SW);
      for (x = 0; x < SW; x++) { var h = 0, sd = 0; seeds.forEach(function (s) { var raw = ((x - s[0]) % SW + SW * 1.5) % SW - SW / 2, v = s[1] * (1 - Math.abs(raw) / s[2]); if (v > h) { h = v; sd = raw < 0 ? 1 : -1; } }); hgt[x] = h; side[x] = sd; }
      for (x = 0; x < SW; x++) for (y = 0; y < Math.round(hgt[x]); y++) { var row = SH - 1 - y - layer;
        if (row < 0) continue; var c = far[layer ? 2 : side[x] > 0 ? 0 : 1]; if (!layer && y >= Math.round(hgt[x]) - 3 && hgt[x] > 14) c = sn; buf[row * SW + x] = pack(c[0], c[1], c[2]); }
    }
    // sun / bright patch
    var sx = Math.round(SW * 0.62), sy = Math.round(SH * 0.3), s0 = rgb(pal.sun[0]), s1 = rgb(pal.sun[1]);
    for (y = -9; y <= 9; y++) for (x = -9; x <= 9; x++) { var r2 = x * x + y * y, idx = (sy + y) * SW + ((sx + x + SW) % SW); if (sy + y < 0 || sy + y >= SH) continue;
      if (r2 <= 16) buf[idx] = pack(s1[0], s1[1], s1[2]); else if (r2 <= 36) buf[idx] = pack(s0[0], s0[1], s0[2]); else if (r2 <= 81) buf[idx] = blend32(buf[idx], s0, 70); }
    // cumulus bank (separate layer, drifts slowly): stacked round puffs, lit from the upper left
    var cp = pal.cloud.map(rgb);
    for (i = 0; i < Math.round(SW / 34); i++) {
      var cx = i * 34 + R() * 20, base = SH - 4 - Math.floor(R() * 10), w = 26 + R() * 34, hh = 7 + R() * 12, puffs = [];
      for (var p = 0; p < Math.max(3, w / 7); p++) { var px = cx - w / 2 + R() * w, dd = 1 - Math.abs(px - cx) / (w / 2); puffs.push([px, base - hh * (0.35 + 0.6 * dd) * (0.6 + R() * 0.4), 3 + R() * hh * 0.5 * (0.5 + dd)]); }
      for (y = Math.floor(base - hh * 1.7); y <= base; y++) for (x = Math.floor(cx - w / 2 - hh); x <= cx + w / 2 + hh; x++) {
        if (y < 0) continue; var best = -1, top = true, ul = true;
        for (var q = 0; q < puffs.length; q++) { var P = puffs[q], dist = Math.hypot(x + 0.5 - P[0], (y + 0.5 - P[1]) * 1.2); if (dist < P[2]) best = Math.max(best, P[2] - dist);
          if (Math.hypot(x + 0.5 - P[0], (y - 0.5 - P[1]) * 1.2) < P[2]) top = false; if (Math.hypot(x - 1.5 - P[0], (y - 1.5 - P[1]) * 1.2) < P[2]) ul = false; }
        if (best < 0 || y > base) continue;
        var cc = ul ? cp[4] : top ? cp[3] : best > 3 ? cp[3] : best > 1.4 ? cp[2] : cp[1]; if (y > base - 2) cc = cp[0];
        cl[y * SW + (((Math.round(x) % SW) + SW) % SW)] = pack(cc[0], cc[1], cc[2]);
      }
    }
    return { base: buf, cloud: cl, w: SW, h: SH, top: buf[0] };
  }

  /* ---------- fallback UI drawing (pixel16 look) ---------- */
  function frame16(g, r) {
    var x = r.x, y = r.y, w = r.w, h = r.h, i, pa = g.globalAlpha;
    g.globalAlpha = pa * 0.95;
    for (i = 0; i < h - 2; i++) { g.fillStyle = WIN16[Math.min(3, Math.floor(i / (h - 2) * 4))]; g.fillRect(x + 1, y + 1 + i, w - 2, 1); }
    g.globalAlpha = pa; g.fillStyle = '#06061a';
    g.fillRect(x + 2, y, w - 4, 1); g.fillRect(x + 2, y + h - 1, w - 4, 1); g.fillRect(x, y + 2, 1, h - 4); g.fillRect(x + w - 1, y + 2, 1, h - 4);
    g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + w - 2, y + 1, 1, 1); g.fillRect(x + 1, y + h - 2, 1, 1); g.fillRect(x + w - 2, y + h - 2, 1, 1);
    g.fillStyle = WIN16[4]; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 5);
    g.fillStyle = WIN16[5]; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
    return { x: x + 4, y: y + 4, w: w - 8, h: h - 8 };
  }
  function text16W(s) { return Math.max(0, String(s).length * 6 - 1); }
  function text16(g, s, x, y, c1, c2, align) {
    s = String(s).toUpperCase(); var w = text16W(s); if (align === 'right') x -= w; else if (align === 'center') x -= Math.floor(w / 2);
    for (var pass = 0; pass < 2; pass++) { var cx = x;
      for (var i = 0; i < s.length; i++) { var b = GL[s[i]] || GL['?'];
        for (var k = 0; k < 35; k++) if (b[k] === '1') { var gy = (k / 5) | 0; g.fillStyle = pass ? (gy < 4 ? c1 : (c2 || c1)) : '#0a0c24'; g.fillRect(cx + (k % 5) + (pass ? 0 : 1), y + gy + (pass ? 0 : 1), 1, 1); }
        cx += 6; } }
    return w;
  }

  /* ================================================================== create ================================================================== */
  function create(o) {
    o = o || {};
    var P = {}; var k; for (k in DEF) P[k] = DEF[k];
    function setParams(p) { for (var kk in (p || {})) { if (p[kk] == null || !(kk in DEF)) continue; P[kk] = NUMERIC[kk] ? clamp(num(p[kk], DEF[kk]), NUMERIC[kk][0], NUMERIC[kk][1]) : String(p[kk]); } if (!SKIES[P.sky]) P.sky = 'day'; skyKey = ''; }
    var skyKey = ''; setParams(o.params);
    var T = Math.max(1, num(o.tile, 16) | 0), COLS = Math.max(1, num(o.cols, 32) | 0), ROWS = Math.max(1, num(o.rows, 32) | 0);
    var WW = COLS * T, WH = ROWS * T, WRAP = o.wrap !== false;
    var API = root.GameDNA_Skin || null, SK = null;
    try { SK = API && API.resolve ? API.resolve(o.skin) : null; } catch (e) { SK = null; }
    var warned = {};
    function warn(id, msg) { if (warned[id]) return; warned[id] = 1; try { console.warn('[GameDNA_Flight] ' + msg); } catch (e) { } }
    function call(name) { var f = o[name]; if (typeof f !== 'function') return undefined; try { return f.apply(null, [].slice.call(arguments, 1)); } catch (e) { warn(name, name + ' threw: ' + e); return undefined; } }
    var keymap = o.keys || KEYS;

    /* ----- texture: the host's tile map baked once (mip-mapped) ----- */
    var TEX = null, OUT = null;
    function tileColorOf(id, tx, ty) {
      var c = call('tileColor', id, tx, ty); if (c == null) c = '#5a9a48'; return rgb(c);
    }
    function bake() {
      var levels = [], cv = mk(WW, WH), px = new Uint32Array(WW * WH), useImg = typeof o.tileImage === 'function';
      if (cv && useImg) {
        var q = cv.getContext('2d'); q.imageSmoothingEnabled = false;
        for (var ty = 0; ty < ROWS; ty++) for (var tx = 0; tx < COLS; tx++) {
          var id = call('tileAt', tx, ty), im = call('tileImage', id, tx, ty);
          if (im) { try { q.drawImage(im, tx * T, ty * T, T, T); continue; } catch (e) { } }
          var cc = tileColorOf(id, tx, ty); q.fillStyle = hex(cc); q.fillRect(tx * T, ty * T, T, T);
        }
        try { var d = new Uint32Array(q.getImageData(0, 0, WW, WH).data.buffer); for (var i = 0; i < d.length; i++) px[i] = d[i] | 0xff000000; } catch (e) { warn('bake', 'could not read the tile images (tainted canvas?): ' + e); useImg = false; }
      }
      if (!useImg) {
        for (var ty2 = 0; ty2 < ROWS; ty2++) for (var tx2 = 0; tx2 < COLS; tx2++) {
          var c2 = tileColorOf(call('tileAt', tx2, ty2), tx2, ty2);
          for (var yy = 0; yy < T; yy++) for (var xx = 0; xx < T; xx++) { var X = tx2 * T + xx, Y = ty2 * T + yy, n = hash(X, Y, 1), m = n < 0.12 ? 0.9 : n > 0.9 ? 1.08 : 1;
            px[Y * WW + X] = pack(c2[0] * m, c2[1] * m, c2[2] * m); }
        }
      }
      levels.push({ w: WW, h: WH, px: px });
      while (levels.length < 7) {   // box-filtered mips
        var L = levels[levels.length - 1]; if (L.w < 16 || L.h < 16) break;
        var w2 = Math.ceil(L.w / 2), h2 = Math.ceil(L.h / 2), p2 = new Uint32Array(w2 * h2);
        for (var y = 0; y < h2; y++) for (var x = 0; x < w2; x++) {
          var r = 0, g = 0, b = 0; for (var s = 0; s < 4; s++) { var v = L.px[Math.min(L.h - 1, y * 2 + (s >> 1)) * L.w + Math.min(L.w - 1, x * 2 + (s & 1))]; r += v & 255; g += (v >> 8) & 255; b += (v >> 16) & 255; }
          p2[y * w2 + x] = pack(r >> 2, g >> 2, b >> 2);
        }
        levels.push({ w: w2, h: h2, px: p2 });
      }
      TEX = levels; MINI = null;
      // the ground outside the map when wrap is off: one tile of `outsideTile` repeated (or a colour)
      if (!WRAP) {
        var oc = mk(T, T), opx = new Uint32Array(T * T), avg = [0, 0, 0], got = false;
        if (oc && o.outsideTile != null && useImg) { var im2 = call('tileImage', o.outsideTile, -1, -1); if (im2) { try { var q2 = oc.getContext('2d'); q2.drawImage(im2, 0, 0, T, T); var d2 = new Uint32Array(q2.getImageData(0, 0, T, T).data.buffer); for (var j = 0; j < T * T; j++) opx[j] = d2[j] | 0xff000000; got = true; } catch (e) { } } }
        if (!got) { var c3 = o.outsideTile != null ? tileColorOf(o.outsideTile, -1, -1) : rgb(o.outside || '#2e6a3a'); for (var j2 = 0; j2 < T * T; j2++) { var n2 = hash(j2 % T, (j2 / T) | 0, 5), m2 = n2 < 0.15 ? 0.88 : n2 > 0.9 ? 1.08 : 1; opx[j2] = pack(c3[0] * m2, c3[1] * m2, c3[2] * m2); } }
        for (var j3 = 0; j3 < T * T; j3++) { avg[0] += opx[j3] & 255; avg[1] += (opx[j3] >> 8) & 255; avg[2] += (opx[j3] >> 16) & 255; }
        OUT = { px: opx, avg: pack(avg[0] / (T * T), avg[1] / (T * T), avg[2] / (T * T)) };
      }
    }

    /* ----- state ----- */
    var S = { phase: 'walk', e: 0, frame: 0, x: 0, y: 0, a: 0, a0: 0, spd: 0, roll: 0, alt: 0, buzz: 0, denied: 0, land: null, from: null,
      held: {}, latch: {}, ext: null, auto: null, landable: false, tile: { x: 0, y: 0 }, boost: 0, flaps: 0 };
    var view = { x: 0, y: 0, w: 256, h: 224 }, uiRects = [], stats = { draws: 0, lastMs: 0, avgMs: 0, maxMs: 0 }, MINI = null, SKY = null;
    var off = null, offCtx = null, img = null, OUT32 = null;
    function viewOf(g) {
      var v = typeof o.view === 'function' ? call('view') : o.view, cw = g && g.canvas ? g.canvas.width : 256, ch = g && g.canvas ? g.canvas.height : 224;
      if (v && v.w > 0 && v.h > 0) return { x: num(v.x, 0) | 0, y: num(v.y, 0) | 0, w: v.w | 0, h: v.h | 0 };
      return { x: 0, y: 0, w: cw, h: ch };
    }
    function wd(d, size) { if (!WRAP) return d; d = d % size; if (d > size / 2) d -= size; if (d < -size / 2) d += size; return d; }
    function wrapPos() { if (WRAP) { S.x = ((S.x % WW) + WW) % WW; S.y = ((S.y % WH) + WH) % WH; } }
    function tileAtPos(x, y) { var tx = Math.floor(x / T), ty = Math.floor(y / T); if (WRAP) { tx = ((tx % COLS) + COLS) % COLS; ty = ((ty % ROWS) + ROWS) % ROWS; } return { x: tx, y: ty, inside: tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS }; }
    function canLandAt(t) { if (!t.inside) return false; var r = call('canLand', t.x, t.y); return !!r; }
    function geom() {   // per-view constants
      var Vw = view.w, Vh = view.h, HZ = Math.round(Vh * P.horizon), A = Math.max(HZ + 24, Math.round(Vh * 0.74)), F = Vw / 2, hc = P.height;
      return { Vw: Vw, Vh: Vh, HZ: HZ, A: A, F: F, hc: hc, zA: hc * F / (A - HZ), altF: hc * 0.55 };
    }
    function camTop() {   // the host's walking camera: world px at the view's top-left
      var c = call('topdown'); if (c && isFinite(c.x) && isFinite(c.y)) return { x: +c.x, y: +c.y };
      return { x: S.x - view.w / 2, y: S.y - view.h / 2 };
    }

    /* ----- control ----- */
    function faceAngle(f) {
      if (typeof f === 'number' && isFinite(f)) return wrapA(f);
      return { up: 0, north: 0, right: Math.PI / 2, east: Math.PI / 2, down: Math.PI, south: Math.PI, left: -Math.PI / 2, west: -Math.PI / 2 }[String(f || 'up').toLowerCase()] || 0;
    }
    function takeOff(at) {
      if (S.phase !== 'walk') return false;
      at = at || {}; if (!TEX) bake();
      S.x = num(at.x, S.x); S.y = num(at.y, S.y); wrapPos(); S.a = faceAngle(at.facing != null ? at.facing : at.heading); S.a0 = S.a;
      S.phase = 'rising'; S.e = 0; S.spd = 0; S.roll = 0; S.held = {}; S.latch = {}; S.auto = null; S.denied = 0; S.from = { x: S.x, y: S.y };
      if (at.instant) { S.phase = 'flying'; S.e = 1; S.spd = P.speed; S.alt = geom().altF; }   // start already in the air (title screens, demos)
      call('onTakeOff', { x: S.x, y: S.y, heading: S.a }); call('onPhase', S.phase);
      return true;
    }
    function startLanding() {
      var t = tileAtPos(S.x, S.y);
      var L = { tx: t.x, ty: t.y, x: t.x * T + T / 2, y: t.y * T + T / 2 };
      S.land = L; S.from = { x: S.x, y: S.y }; S.a0 = S.a; S.phase = 'landing'; S.auto = null; S.held = {}; S.latch = {};
      call('onLand', { tx: L.tx, ty: L.ty, x: L.x, y: L.y }); call('onPhase', 'landing');
    }
    function requestLand() {
      if (S.phase !== 'flying') return false;
      var t = tileAtPos(S.x, S.y);
      if (canLandAt(t)) { startLanding(); return true; }
      S.denied = 40; S.buzz = 12; call('onLandDenied', { tx: t.x, ty: t.y }); return false;
    }
    function press(n) { if (!S.held[n]) S.latch[n] = true; S.held[n] = true; }
    function release(n) { S.held[n] = false; }
    function keyEvent(code, down) {
      var n = keymap[code]; if (!n) return false;
      if (S.phase === 'walk') { if (!down) S.held[n] = false; return false; }
      if (down) press(n); else release(n);
      return true;
    }
    function steer(tx, ty, mem) {   // input that flies toward a world point (autopilot helper). mem (optional) keeps the fly-out state
      var dx = wd(tx - S.x, WW), dy = wd(ty - S.y, WH), dist = Math.hypot(dx, dy), want = Math.atan2(dx, -dy), err = wrapA(want - S.a);
      var rad = P.speed * 0.55 / (P.turn * Math.PI / 180);   // turn radius at the slow approach speed
      var inp = { left: err < -0.06, right: err > 0.06, up: dist > 160 && Math.abs(err) < 0.35, down: dist < 110 || Math.abs(err) > 1.2, land: false };
      var out = mem ? mem.out : (dist < rad * 2.2 && Math.abs(err) > 0.9);
      if (mem) { if (!mem.out && dist < rad * 2.2 && Math.abs(err) > 0.9) mem.out = true; else if (mem.out && dist > rad * 4) mem.out = false; out = mem.out; }
      if (out) { inp.left = inp.right = false; inp.up = false; inp.down = true; }   // the point is inside the turn circle: fly straight out, then come back round
      return { input: inp, dist: dist, err: err };
    }

    /* ----- update: one fixed 1/60 s step ----- */
    function update() {
      try { step(); } catch (e) { warn('update', 'update failed: ' + e); }
    }
    function step() {
      S.frame++; var dt = 1 / 60;
      if (S.buzz > 0) S.buzz--; if (S.denied > 0) S.denied--;
      if (S.phase === 'walk') { S.latch = {}; return; }
      var tr = P.transition / 1000;
      if (S.phase === 'rising') {
        S.e = Math.min(1, S.e + dt / tr); S.alt = geom().altF * smooth(S.e); S.spd = P.speed * smooth(S.e) * 0.6;
        var f0 = [Math.sin(S.a), -Math.cos(S.a)]; S.x += f0[0] * S.spd * dt * smooth(S.e); S.y += f0[1] * S.spd * dt * smooth(S.e); wrapPos();
        if (S.e >= 1) { S.phase = 'flying'; S.e = 1; S.spd = P.speed; call('onPhase', 'flying'); }
        S.latch = {}; return;
      }
      if (S.phase === 'landing') {
        S.e = Math.max(0, S.e - dt / tr); var s = smooth(S.e);
        S.x = S.land.x + wd(S.from.x - S.land.x, WW) * s; S.y = S.land.y + wd(S.from.y - S.land.y, WH) * s; wrapPos();
        S.alt = geom().altF * s; S.roll *= 0.8; S.spd *= 0.9;
        if (S.e <= 0) { S.phase = 'walk'; S.e = 0; S.alt = 0; S.spd = 0; S.roll = 0; S.x = S.land.x; S.y = S.land.y; call('onPhase', 'walk'); call('onLanded', { tx: S.land.tx, ty: S.land.ty, x: S.land.x, y: S.land.y }); }
        S.latch = {}; return;
      }
      // flying
      var I = { left: !!S.held.left, right: !!S.held.right, up: !!S.held.up, down: !!S.held.down, land: !!S.latch.land };
      if (S.ext) { for (var k2 in S.ext) if (S.ext[k2]) I[k2] = true; if (S.ext.land) S.ext.land = false; }
      if (S.auto) {
        var st = steer(S.auto.x, S.auto.y, S.auto), here = tileAtPos(S.x, S.y);
        I = st.input;
        if (S.auto.land !== false && st.dist < (S.auto.radius || 20) && canLandAt(here)) I.land = true;
      }
      var turn = (I.right ? 1 : 0) - (I.left ? 1 : 0);
      S.a = wrapA(S.a + turn * P.turn * Math.PI / 180 * dt);
      var rollT = turn * P.bank * Math.PI / 180; S.roll += (rollT - S.roll) * 0.12;
      var target = P.speed * (I.up ? 1.6 : I.down ? 0.55 : 1); S.spd += (target - S.spd) * (target > S.spd ? 0.04 : 0.07);
      S.boost = I.up ? Math.min(1, S.boost + 0.08) : Math.max(0, S.boost - 0.05);
      S.x += Math.sin(S.a) * S.spd * dt; S.y += -Math.cos(S.a) * S.spd * dt;
      if (!WRAP) {   // soft edges: past the border the mount turns back toward the map
        var m = T * 2, out = S.x < -m || S.y < -m || S.x > WW + m || S.y > WH + m;
        if (out) { var want = Math.atan2(WW / 2 - S.x, -(WH / 2 - S.y)), err = wrapA(want - S.a); S.a = wrapA(S.a + clamp(err, -0.05, 0.05)); }
        S.x = clamp(S.x, -T * 6, WW + T * 6); S.y = clamp(S.y, -T * 6, WH + T * 6);
      }
      wrapPos();
      S.alt = geom().altF + Math.sin(S.frame / 22) * 1.2;
      var t = tileAtPos(S.x, S.y); S.tile = t; S.landable = canLandAt(t);
      S.flaps += I.up ? 1.6 : I.down ? 0.6 : 1;
      if (I.land) requestLand();
      S.latch = {};
    }

    /* ----- drawing ----- */
    function ensureBuffers(g) {
      view = viewOf(g);
      if (!off || off.width !== view.w || off.height !== view.h) { off = mk(view.w, view.h); if (!off) return false; offCtx = off.getContext('2d'); img = offCtx.createImageData(view.w, view.h); OUT32 = new Uint32Array(img.data.buffer); }
      var G = geom(), sk = P.sky + '|' + Math.round(TAU * G.F) + '|' + (G.HZ + 24);
      if (skyKey !== sk) { SKY = bakeSky(Math.round(TAU * G.F), G.HZ + 24, SKIES[P.sky] || SKIES.day); skyKey = sk; }
      return true;
    }
    function lvOf(s) { return s < 1.5 ? 0 : s < 3 ? 1 : s < 6 ? 2 : s < 12 ? 3 : s < 24 ? 4 : s < 48 ? 5 : 6; }
    // the shared mapping: screen (x, r) in the view -> world; e = 0 is exactly the host's top-down view, e = 1 the flight view
    function frameParams() {
      var G = geom(), e = smooth(S.e), a = S.phase === 'flying' ? S.a : S.phase === 'rising' ? S.a * e : S.a0 * e;   // the walking view is always north-up
      var hzE = G.HZ - Math.pow(1 - e, 1.6) * G.Vh * 0.9, zA = G.hc * G.F / (G.A - hzE), ct = e < 1 ? camTop() : null;
      var mxT = ct ? (WRAP ? G.Vw / 2 + wd(S.x - (ct.x + G.Vw / 2), WW) : S.x - ct.x) : 0, myT = ct ? (WRAP ? G.Vh / 2 + wd(S.y - (ct.y + G.Vh / 2), WH) : S.y - ct.y) : 0;
      return { G: G, e: e, a: a, sa: Math.sin(a), ca: Math.cos(a), hzE: hzE, zA: zA, mxT: mxT, myT: myT, tr: Math.tan(S.roll) * e };
    }
    function drawGround(FP) {
      var G = FP.G, Vw = G.Vw, Vh = G.Vh, F = G.F, hc = G.hc, e = FP.e, ie = 1 - e, sa = FP.sa, ca = FP.ca, hzE = FP.hzE, zA = FP.zA, tr = FP.tr;
      var hz = rgb((SKIES[P.sky] || SKIES.day).haze), fogNear = zA * 2.2, fogFar = hc * F / 2.5, fogK = P.fog;
      var SKW = SKY.w, SKH = SKY.h, skyOff = Math.round(FP.a * F) + SKW * 4, cloudOff = Math.round(FP.a * F + S.frame * 0.06) + SKW * 4;
      var nL = TEX.length, Mx = S.x, My = S.y, mxT = FP.mxT, myT = FP.myT, cx0 = Vw / 2;
      for (var r = 0; r < Vh; r++) {
        var row = r * Vw;
        for (var x = 0; x < Vw; x++) {
          var dy = (r - hzE) + (x - cx0) * tr;
          if (dy < 0.6 && e > 0) {   // sky
            var sr = SKH - 1 + Math.floor(dy), sc = (x + skyOff) % SKW;
            if (sr < 0) { OUT32[row + x] = SKY.top; continue; }
            var cv2 = SKY.cloud[sr * SKW + ((x + cloudOff) % SKW)];
            OUT32[row + x] = cv2 ? cv2 : SKY.base[sr * SKW + sc]; continue;
          }
          var zP = hc * F / Math.max(dy, 0.6), right = (x - cx0) * zP / F, down = zA - zP, s = Math.max(zP / F, zP / Math.max(dy, 0.6) * 0.7);
          if (ie > 0) { right = right * e + (x - mxT) * ie; down = down * e + (r - myT) * ie; s = s * e + ie; }
          var wx = Mx + ca * right - sa * down, wy = My + sa * right + ca * down, lv = lvOf(s); if (lv >= nL) lv = nL - 1;
          var v;
          if (!WRAP && (wx < 0 || wy < 0 || wx >= WW || wy >= WH)) v = lv ? OUT.avg : OUT.px[((Math.floor(wy) % T + T) % T) * T + ((Math.floor(wx) % T + T) % T)];
          else { var L = TEX[lv], ix = Math.floor(wx) >> lv, iy = Math.floor(wy) >> lv; ix %= L.w; if (ix < 0) ix += L.w; iy %= L.h; if (iy < 0) iy += L.h; v = L.px[iy * L.w + ix]; }
          if (e > 0) { if (dy < 2.5) v = blend32(v, hz, Math.round(256 * e)); else if (fogK > 0) { var f = (zP - fogNear) / (fogFar - fogNear); if (f > 0) v = blend32(v, hz, Math.round((f > 1 ? 1 : Math.sqrt(f)) * 256 * fogK * e)); } }
          OUT32[row + x] = v;
        }
      }
      offCtx.putImageData(img, 0, 0);
    }
    // world point (+ height above ground) -> view px, or null when behind the camera
    function projectF(FP, wx, wy, wz) {
      var G = FP.G, e = FP.e, dx = wd(wx - S.x, WW), dy = wd(wy - S.y, WH), right = dx * FP.ca + dy * FP.sa, down = -dx * FP.sa + dy * FP.ca;
      var z = FP.zA - down, xT = FP.mxT + right, yT = FP.myT + down - (wz || 0);
      if (e <= 0) return { x: xT, y: yT, s: 1, z: FP.zA };
      if (z < 6) return null;
      var sP = G.F / z, xP = G.Vw / 2 + right * sP, yP = FP.hzE + G.hc * sP - (wz || 0) * sP - (xP - G.Vw / 2) * FP.tr;
      return { x: xP * e + xT * (1 - e), y: yP * e + yT * (1 - e), s: sP * e + (1 - e), z: z };
    }
    function shadowAt(g, cx, cy, w, h) {
      g.fillStyle = 'rgba(16,18,40,0.38)';
      for (var y = -h; y <= h; y++) { var ww = Math.round(w * Math.sqrt(1 - (y * y) / ((h + 0.5) * (h + 0.5)))); g.fillRect(Math.round(cx - ww), Math.round(cy + y), ww * 2, 1); }
    }
    function mountBox(FP) {   // where the mount sprite and its shadow go this frame (also without drawing: anchors under ?t= fast-forward)
      var G = FP.G, ps = projectF(FP, S.x, S.y, 0), pm = projectF(FP, S.x, S.y, S.alt); if (!ps || !pm) return null;
      var bank = Math.round(clamp(S.roll / ((P.bank || 1) * Math.PI / 180), -1, 1) * 2), fr = S.phase === 'walk' ? 0 : Math.floor(S.flaps / 7) & 3;
      if (S.phase === 'flying' && !S.held.up && S.spd > P.speed * 0.9 && (Math.floor(S.flaps / 56) % 3) === 2) fr = 1;   // glide now and then
      var im = typeof o.drawMount === 'function' ? null : mountArt(P.mount === 'glider' ? 'glider' : 'bird', fr, bank);
      var sc = FP.e < 0.34 ? 0.5 : FP.e < 0.67 ? 0.75 : 1, w = im ? Math.round(im.width * sc) : Math.round(40 * sc), h = im ? Math.round(im.height * sc) : Math.round(30 * sc);
      var ox = view.x, oy = view.y, x = Math.round(ox + pm.x - w / 2), y = Math.round(oy + pm.y - h * 0.72);
      return { im: im, fr: fr, bank: bank, sc: sc, x: x, y: y, w: w, h: h, cx: Math.round(ox + pm.x), cy: Math.round(oy + pm.y), sx: ox + ps.x, sy: oy + ps.y };
    }
    function drawMount(g, FP) {
      var G = FP.G, B = mountBox(FP); if (!B) return null;
      var sw = Math.round(B.w * (0.32 + 0.1 * (1 - S.alt / Math.max(1, G.altF)))); shadowAt(g, B.sx, B.sy, sw, Math.max(1, Math.round(sw * 0.28)));
      var x = B.x + (S.buzz > 0 ? ((S.buzz & 2) ? 1 : -1) : 0);
      if (B.im) g.drawImage(B.im, x, B.y, B.w, B.h); else call('drawMount', g, B.cx, B.cy, { frame: B.fr, bank: B.bank, scale: B.sc, phase: S.phase, t: S.frame / 60 });
      return B;
    }
    var BB = [];
    function billboardsOf() { var b = typeof o.billboards === 'function' ? call('billboards') : o.billboards; return Array.isArray(b) ? b : []; }
    function drawBillboards(g, FP, ox, oy, nearPass, list) {
      var G = FP.G, haze = (SKIES[P.sky] || SKIES.day).haze, fade = FP.e >= 1 ? 1 : smooth((FP.e - 0.55) / 0.4), ga = g.globalAlpha;   // billboards fade in / out during take-off and landing
      for (var i = 0; i < list.length; i++) {
        var it = list[i]; if (nearPass ? it.z >= FP.zA : it.z < FP.zA) continue;
        var b = it.b, im = b.img || art(b.kind || 'tree'); if (!im) continue;
        var hw = num(b.size, SIZE[b.kind] || 20), hpx = Math.min(hw * it.p.s, im.height, G.Vh * 0.4), wpx = hpx * im.width / im.height;   // never past 1:1 pixel density
        if (hpx < 2) continue;
        var step = P.fog > 0 && FP.e > 0 ? Math.min(3, Math.floor(clamp((it.z - FP.zA * 2.2) / (G.hc * G.F / 2.5 - FP.zA * 2.2), 0, 1) * 4 * P.fog)) : 0;
        var x = Math.round(ox + it.p.x - wpx / 2), y = Math.round(oy + it.p.y - hpx);
        if (x > ox + G.Vw || x + wpx < ox || y > oy + G.Vh || y + hpx < oy) continue;
        if (fade < 1) g.globalAlpha = ga * fade;
        g.drawImage(fogged(im, step, haze), x, y, Math.max(1, Math.round(wpx)), Math.max(1, Math.round(hpx))); g.globalAlpha = ga;
        BB.push({ id: b.id != null ? b.id : null, kind: b.kind, x: x, y: y, w: Math.round(wpx), h: Math.round(hpx) });
      }
    }
    function drawLandMarker(g, FP, ox, oy) {
      var t = S.tile, corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(function (c) { return projectF(FP, t.x * T + c[0] * T, t.y * T + c[1] * T, 0); });
      if (corners.some(function (c) { return !c; })) return;
      var ok = S.landable, blink = (S.frame >> 3) & 1, col = ok ? (blink ? '#b8ff9a' : '#68e05a') : '#f05848';
      if (!ok && !S.denied) return;
      g.fillStyle = INK; corners.forEach(function (c) { g.fillRect(Math.round(ox + c.x) - 2, Math.round(oy + c.y) - 1, 4, 3); });
      g.fillStyle = col; corners.forEach(function (c) { g.fillRect(Math.round(ox + c.x) - 1, Math.round(oy + c.y), 2, 1); });
    }
    function drawFx(g, FP, ox, oy, mr) {
      var G = FP.G;
      if ((S.phase === 'rising' || S.phase === 'landing') && FP.e < 0.75 && mr) {   // dust and leaves kicked up by the wings
        var k = FP.e / 0.75;
        for (var i = 0; i < 12; i++) { var an = i / 12 * TAU + hash(i, 1, 3), rr = 6 + k * (18 + hash(i, 2, 3) * 14), px = mr.sx + Math.cos(an) * rr * 1.4, py = mr.sy + Math.sin(an) * rr * 0.5 - k * 6 * hash(i, 4, 3);
          g.fillStyle = i % 3 ? '#e8e0c8' : '#7ac060'; g.fillRect(Math.round(px), Math.round(py), i % 4 ? 1 : 2, 1); }
      }
      if (S.phase === 'flying' && S.boost > 0.2) {   // wind streaks at speed
        for (var j = 0; j < 22; j++) { var ph = ((S.frame * 2 + j * 23) % 40) / 40, side = j & 1 ? 1 : -1, r0 = 30 + hash(j, 5, 1) * 50 + ph * 110, an = (hash(j, 6, 1) - 0.5) * 1.6;
          var sx = G.Vw / 2 + side * Math.cos(an) * r0, sy = G.A * 0.55 + Math.sin(an) * r0 * 0.6, len = Math.round(6 + ph * 20 * S.boost), dx = side * Math.cos(an), dy = Math.sin(an) * 0.6;
          g.fillStyle = 'rgba(255,255,255,' + (0.85 * S.boost * (1 - ph * 0.7)).toFixed(2) + ')';
          for (var q = 0; q < len; q++) g.fillRect(Math.round(ox + sx + dx * q), Math.round(oy + sy + dy * q), q < len - 2 ? 2 : 1, 1); }
      }
    }
    function uiFrame(g, r) { if (SK) { try { var ir = SK.frame(g, r, { role: 'window', team: 'n' }); if (ir) return ir; } catch (e) { } } return frame16(g, r); }
    function uiText(g, s, x, y, col, col2, align) {
      if (SK) { try { return SK.text(g, s, x, y, { font: 'ui', color: col, color2: col2 || col, align: align || 'left' }); } catch (e) { } }
      return text16(g, s, x, y, col, col2, align);
    }
    function uiW(s) { if (SK) { try { return SK.measure(String(s), { font: 'ui' }); } catch (e) { } } return text16W(String(s).toUpperCase()); }
    function bakeMini() {
      var L = TEX[0], fit = Math.min(54 / L.w, 54 / L.h), w = Math.max(8, Math.round(L.w * fit)), h = Math.max(8, Math.round(L.h * fit)), c = mk(w, h); if (!c) return null;
      var q = c.getContext('2d'), id = q.createImageData(w, h), d = new Uint32Array(id.data.buffer), lv = Math.min(TEX.length - 1, Math.max(0, Math.floor(Math.log2(1 / fit)))), M = TEX[lv];
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) d[y * w + x] = M.px[Math.min(M.h - 1, Math.floor(y / h * M.h)) * M.w + Math.min(M.w - 1, Math.floor(x / w * M.w))];
      q.putImageData(id, 0, 0); return { c: c, w: w, h: h };
    }
    function drawUI(g, FP, ox, oy) {
      var G = FP.G, ins = o.inset || {}, m = 4, top = oy + m + num(ins.top, 0), right = ox + G.Vw - m - num(ins.right, 0), bottom = oy + G.Vh - m - num(ins.bottom, 0), left = ox + m + num(ins.left, 0);
      if (P.minimap === 'on') {
        if (!MINI) MINI = bakeMini();
        if (MINI) {
          var fw = MINI.w + 8, fh = MINI.h + 8, fr = { x: right - fw, y: top, w: fw, h: fh }, ir = uiFrame(g, fr), mx = fr.x + 4, my = fr.y + 4;
          g.drawImage(MINI.c, mx, my); uiRects.push({ x: fr.x, y: fr.y, w: fw, h: fh, kind: 'minimap' });
          var sx = MINI.w / WW, sy = MINI.h / WH, mk2 = typeof o.markers === 'function' ? call('markers') : o.markers;
          (Array.isArray(mk2) ? mk2 : []).forEach(function (q) { if (!q) return; var px = Math.round(mx + clamp(q.x * sx, 0, MINI.w - 1)), py = Math.round(my + clamp(q.y * sy, 0, MINI.h - 1));
            g.fillStyle = INK; g.fillRect(px - 2, py - 2, 5, 5); g.fillStyle = q.color || '#ffe070'; g.fillRect(px - 1, py - 1, 3, 3); if ((S.frame >> 4) & 1 && q.blink) { g.fillStyle = '#ffffff'; g.fillRect(px, py, 1, 1); } });
          var hx = Math.round(mx + clamp(S.x * sx, 0, MINI.w - 1)), hy = Math.round(my + clamp(S.y * sy, 0, MINI.h - 1)), hd = FP.a;
          g.fillStyle = INK; g.fillRect(hx - 2, hy - 2, 5, 5); g.fillStyle = (S.frame >> 3) & 1 ? '#ffffff' : '#ff5a4a'; g.fillRect(hx - 1, hy - 1, 3, 3);
          g.fillStyle = '#ffffff'; g.fillRect(Math.round(hx + Math.sin(hd) * 4), Math.round(hy - Math.cos(hd) * 4), 1, 1);
        }
      }
      // landing prompt (bottom right)
      var lab = S.landable ? (o.landLabel || 'Z') + ' LAND' : 'NO LANDING', tw = uiW(lab), pw = tw + 14, ph = 17, pr = { x: right - pw, y: bottom - ph, w: pw, h: ph };
      if (S.denied && !S.landable) pr.x += (S.denied & 2) ? 1 : -1;
      uiFrame(g, pr); uiText(g, lab, pr.x + 7, pr.y + 5, S.landable ? '#d8ffb8' : S.denied ? '#ff9a8a' : '#a0a8c8', S.landable ? '#88e070' : S.denied ? '#e05848' : '#7880a0');
      uiRects.push({ x: pr.x, y: pr.y, w: pw, h: ph, kind: 'prompt' });
      // speed gauge (bottom left)
      var gw = 70, gr = { x: left, y: bottom - 17, w: gw, h: 17 }; uiFrame(g, gr); uiText(g, 'SPD', gr.x + 6, gr.y + 5, '#fff4c8', '#e8c870');
      var frac = clamp((S.spd - P.speed * 0.5) / (P.speed * 1.1), 0, 1), br = { x: gr.x + 28, y: gr.y + 6, w: gw - 34, h: 5 }, drew = false;
      if (SK && SK.bar) { try { SK.bar(g, br, frac, S.boost > 0.5 ? 'haste' : 'charge', { style: 'gauge' }); drew = true; } catch (e) { } }
      if (!drew) { g.fillStyle = '#06040e'; g.fillRect(br.x - 1, br.y - 1, br.w + 2, br.h + 2); g.fillStyle = '#2a1e36'; g.fillRect(br.x, br.y, br.w, br.h); var fw2 = Math.round(br.w * frac);
        g.fillStyle = S.boost > 0.5 ? '#a8f060' : '#f6c840'; g.fillRect(br.x, br.y, fw2, br.h); g.fillStyle = '#fff8c8'; g.fillRect(br.x, br.y, fw2, 1); }
      uiRects.push({ x: gr.x, y: gr.y, w: gw, h: 17, kind: 'speed' });
    }
    var lastMount = null;
    function draw(g) {
      uiRects = []; BB = []; lastMount = null;
      if (!g || S.phase === 'walk') return false;
      var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
      try {
        if (!TEX) bake(); if (!ensureBuffers(g)) return false;
        var FP = frameParams(), ox = view.x, oy = view.y;
        drawGround(FP);
        g.save(); g.beginPath(); g.rect(ox, oy, view.w, view.h); g.clip(); g.imageSmoothingEnabled = false;
        g.drawImage(off, ox, oy);
        if (FP.e > 0.97 && FP.hzE >= 0) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(ox, oy + Math.round(FP.hzE), view.w, 1); }
        var list = [];
        if (FP.e > 0.55) billboardsOf().forEach(function (b) { if (!b) return; var p = projectF(FP, num(b.x, 0), num(b.y, 0), num(b.alt, 0));
          // ground billboards only beyond the mount's ground row (nearer ones would stand over the mount); flying ones (alt > 0) also beside it
          var fly = num(b.alt, 0) > 0, near = fly ? FP.zA * 0.6 : FP.zA * 1.15;
          if (p && p.z > near && p.z < FP.G.hc * FP.G.F / 1.2) list.push({ b: b, p: p, z: p.z }); });
        list.sort(function (a, b) { return b.z - a.z; });
        if (S.phase === 'flying') drawLandMarker(g, FP, ox, oy);
        drawBillboards(g, FP, ox, oy, false, list);
        var mr = drawMount(g, FP); lastMount = mr;
        drawBillboards(g, FP, ox, oy, true, list);
        drawFx(g, FP, ox, oy, mr);
        if (o.drawWorld) call('drawWorld', g, function (wx, wy, wz) { var p = projectF(FP, wx, wy, wz); return p ? { x: ox + p.x, y: oy + p.y, s: p.s, z: p.z } : null; });
        if (FP.e > 0.9 && (o.ui === undefined || (typeof o.ui === 'function' ? call('ui') !== false : o.ui !== false))) drawUI(g, FP, ox, oy);   // options.ui: false (or a function returning false) hides the mini-map, prompt and gauge, e.g. on a title screen
        g.restore();
      } catch (e) { warn('draw', 'draw failed: ' + e); try { g.restore(); } catch (e2) { } }
      if (t0) { var ms = performance.now() - t0; stats.draws++; stats.lastMs = ms; stats.maxMs = Math.max(stats.maxMs, ms); stats.avgMs = stats.avgMs ? stats.avgMs * 0.95 + ms * 0.05 : ms; }
      return true;
    }
    function curMount() { if (S.phase === 'walk') return null; try { if (!off && o.view) view = viewOf(null); return mountBox(frameParams()); } catch (e) { return lastMount; } }
    function project(wx, wy, wz) {   // world -> canvas px for the last view (null while walking or behind the camera)
      if (S.phase === 'walk') return null; if (!off && o.view) view = viewOf(null); var FP = frameParams(), p = projectF(FP, wx, wy, wz); return p ? { x: view.x + p.x, y: view.y + p.y, s: p.s, z: p.z } : null;
    }

    return {
      update: update, draw: draw, key: keyEvent, press: press, release: release,
      takeOff: takeOff, land: requestLand,
      reset: function () { S.phase = 'walk'; S.e = 0; S.alt = 0; S.spd = 0; S.roll = 0; S.auto = null; S.ext = null; S.held = {}; S.latch = {}; S.denied = 0; S.buzz = 0; S.boost = 0; },
      setInput: function (inp) { S.ext = inp || null; },
      autopilot: function (target) { S.auto = target && isFinite(target.x) && isFinite(target.y) ? { x: +target.x, y: +target.y, land: target.land, radius: target.radius, out: S.auto ? S.auto.out : false } : null; },
      steer: function (x, y) { return steer(x, y).input; },
      rebake: function () { TEX = null; MINI = null; bake(); },
      setParams: setParams, project: project,
      busy: function () { return S.phase !== 'walk'; },
      canLandHere: function () { return S.phase === 'flying' && S.landable; },
      mountRect: function () { var B = curMount(); return B ? { x: B.x, y: B.y, w: B.w, h: B.h } : null; },
      anchor: function () { var B = curMount(); return B ? { x: B.cx, top: B.y, w: B.w, h: B.h, footY: Math.round(B.sy) } : null; },
      getUIRects: function () { return uiRects.slice(); },
      billboardRects: function () { return BB.slice(); },
      get phase() { return S.phase; }, get progress() { return S.e; }, get x() { return S.x; }, get y() { return S.y; }, get heading() { return S.a; },
      get speed() { return S.spd; }, get roll() { return S.roll; }, get altitude() { return S.alt; }, get tile() { return { x: S.tile.x, y: S.tile.y }; },
      get params() { var c = {}; for (var kk in P) c[kk] = P[kk]; return c; }, get stats() { return { draws: stats.draws, lastMs: stats.lastMs, avgMs: stats.avgMs, maxMs: stats.maxMs }; },
      get autopiloting() { return !!S.auto; }, get world() { return { w: WW, h: WH, cols: COLS, rows: ROWS, tile: T, wrap: WRAP }; }
    };
  }
  root.GameDNA_Flight = { create: create, defaults: DEF, version: '1.0.0' };
})(typeof window !== 'undefined' ? window : this);
