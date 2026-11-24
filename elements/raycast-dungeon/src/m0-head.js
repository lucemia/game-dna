/* GameDNA_RaycastDungeon v1.3.1 - K-03 Raycast dungeon (Game DNA library, system element).
 * One plain script, no dependencies, no import / export. One global: GameDNA_RaycastDungeon. Source is ASCII only.
 *
 * A first-person grid dungeon crawler drawn by raycasting. The hero steps one cell at a time and turns by 90 degrees
 * (both tweened), bumps a door to open it, bumps the stair arch to go down, bumps or strikes a monster in front to fight
 * it; every step, strike or wait is a turn, after which every awake monster moves or attacks. Walls, doors and stair
 * arches are textured columns from a DDA raycaster (perpendicular distance: no fisheye; one ray per column: no gaps),
 * floors and ceilings are cast per pixel, torches light the cells around them, distance fog closes the view, and
 * monsters and items are billboards drawn column by column against the wall depth buffer (walls hide them correctly).
 * Floors come from a seeded generator (maze corridors, rooms, loops, doors, torches) or from data (rows of characters).
 * Seeded and frame-stepped: the same seed and the same inputs give the same run at any view size.
 *
 *   var rd = GameDNA_RaycastDungeon.create({view, seed, params, enemies, items, maps, onHit, onEvent, onEnd});
 *   rd.start({seed})          a new run from floor 1
 *   rd.update(stepMs)         every fixed step (0 while frozen)
 *   rd.drawScene(ctx)         the 3D view: walls, floor, ceiling, light, fog, billboards, the hero's sword
 *   rd.drawUI(ctx)            HUD (HP, potions, gold, level, floor, compass), minimap, log, banner, combat labels, map
 *   rd.key(k) / rd.pointer(type, x, y) / rd.setHeld({...})   input in the host's logical px
 *   API in module/README.md.
 */
(function (root) {
  'use strict';
  var VERSION = '1.3.1';
  var STEP = 1000 / 60;
  var TEX = 64;                                   // wall / floor texture size (texels)
  var FLOOR = 0, WALL = 1, TORCH = 2, DOOR = 3, STAIRS = 4, BANNER = 5;
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];     // facing 0 = north (-y), 1 = east, 2 = south, 3 = west
  var DIRNAME = ['N', 'E', 'S', 'W'];

  /* ---------- small helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function copy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function hash(x, y, s) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
  function sm(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y, sc, s) { var u = x / sc, v = y / sc, i = Math.floor(u), j = Math.floor(v), fx = sm(u - i), fy = sm(v - j); var a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s); return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy; }
  // tileable value noise (period p cells of size sc)
  function tnoise(x, y, sc, p, s) { var u = x / sc, v = y / sc, i = Math.floor(u), j = Math.floor(v), fx = sm(u - i), fy = sm(v - j); var w = function (q) { return ((q % p) + p) % p; }; var a = hash(w(i), w(j), s), b = hash(w(i + 1), w(j), s), c = hash(w(i), w(j + 1), s), d = hash(w(i + 1), w(j + 1), s); return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy; }
  function rng(seed) {   // mulberry32
    var a = seed >>> 0 || 1;
    var f = function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.int = function (lo, hi) { return lo + Math.floor(f() * (hi - lo + 1)); };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length)]; };
    f.state = function () { return a; }; f.set = function (s) { a = s >>> 0; };
    return f;
  }
  function weighted(r, list, wf) { var tot = 0, i; for (i = 0; i < list.length; i++) tot += Math.max(0, wf(list[i])); if (tot <= 0) return null; var x = r() * tot; for (i = 0; i < list.length; i++) { x -= Math.max(0, wf(list[i])); if (x < 0) return list[i]; } return list[list.length - 1]; }
  var RGBC = {};
  function rgb(h) {
    var v = RGBC[h]; if (v) return v;
    if (h.charAt(0) === '#') { var s = h.slice(1); if (s.length === 3) s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2); var n = parseInt(s, 16); v = [n >> 16, (n >> 8) & 255, n & 255]; }
    else { var m = h.match(/[\d.]+/g) || [0, 0, 0]; v = [+m[0], +m[1], +m[2]]; }
    return (RGBC[h] = v);
  }
  function hex(c) { return '#' + c.map(function (n) { n = clamp(Math.round(n), 0, 255); return (n < 16 ? '0' : '') + n.toString(16); }).join(''); }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return hex([lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]); }
  function shade(a, k) { var x = rgb(a); return hex([x[0] * k, x[1] * k, x[2] * k]); }
  function rgba(h, a) { var x = rgb(h); return 'rgba(' + x[0] + ',' + x[1] + ',' + x[2] + ',' + a + ')'; }
  var warned = {};
  function warn(label, e) { var k = label + ':' + (e && e.message); if (warned[k]) return; warned[k] = 1; if (typeof console !== 'undefined') console.warn('GameDNA_RaycastDungeon ' + label + ': ' + (e && e.message)); }
  function safe(fn, args, label) { if (typeof fn !== 'function') return undefined; try { return fn.apply(null, args); } catch (e) { warn(label || 'callback', e); return undefined; } }
  function mkCanvas(w, h) {
    if (typeof document !== 'undefined' && document.createElement) { var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
    return null;
  }
  function overlap(a, b, pad) { pad = pad || 0; return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad; }
  function inside(a, b) { return a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h; }

  /* ---------- Pix: an RGBA pixel raster in plain arrays (no canvas needed: textures and sprites are built in node too) ---------- */
  function Pix(w, h) {
    var P = { w: w, h: h, d: new Uint8ClampedArray(w * h * 4) };
    P.set = function (x, y, c, a) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h) return; var i = (y * w + x) * 4; P.d[i] = c[0]; P.d[i + 1] = c[1]; P.d[i + 2] = c[2]; P.d[i + 3] = a == null ? 255 : a; };
    P.get = function (x, y) { if (x < 0 || y < 0 || x >= w || y >= h) return null; var i = (y * w + x) * 4; return P.d[i + 3] ? [P.d[i], P.d[i + 1], P.d[i + 2]] : null; };
    P.op = function (x, y) { return x >= 0 && y >= 0 && x < w && y < h && P.d[(y * w + x) * 4 + 3] > 0; };
    P.fill = function (fn) { for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var c = fn(x, y); if (c) P.set(x, y, c); } };
    // fill a polygon (pixel centres inside, even-odd); col = [r,g,b] or fn(x, y) -> [r,g,b] | null
    P.poly = function (pts, col) {
      var y0 = Infinity, y1 = -Infinity, i; for (i = 0; i < pts.length; i++) { y0 = Math.min(y0, pts[i][1]); y1 = Math.max(y1, pts[i][1]); }
      for (var y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.ceil(y1)); y++) {
        var cy = y + 0.5, xs = [];
        for (i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) xs.push(a[0] + (cy - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
        xs.sort(function (p, q) { return p - q; });
        for (var k = 0; k + 1 < xs.length; k += 2) for (var x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(w - 1, Math.floor(xs[k + 1] - 0.5)); x++) { var c = typeof col === 'function' ? col(x, y) : col; if (c) P.set(x, y, c); }
      }
    };
    // filled ellipse; col = [r,g,b] or fn(x, y, nx, ny) with nx, ny in -1..1 (position inside the ellipse)
    P.ell = function (cx, cy, rx, ry, col) {
      for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        var nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry; if (nx * nx + ny * ny > 1) continue;
        var c = typeof col === 'function' ? col(x, y, nx, ny) : col; if (c) P.set(x, y, c);
      }
    };
    // thick line (round caps) from (x0, y0) to (x1, y1)
    P.line = function (x0, y0, x1, y1, t, col) {
      var dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, r = t / 2;
      for (var y = Math.floor(Math.min(y0, y1) - r - 1); y <= Math.ceil(Math.max(y0, y1) + r + 1); y++) for (var x = Math.floor(Math.min(x0, x1) - r - 1); x <= Math.ceil(Math.max(x0, x1) + r + 1); x++) {
        var px = x + 0.5, py = y + 0.5, u = clamp(((px - x0) * dx + (py - y0) * dy) / L2, 0, 1), qx = x0 + u * dx - px, qy = y0 + u * dy - py;
        if (qx * qx + qy * qy <= r * r) { var c = typeof col === 'function' ? col(x, y, u) : col; if (c) P.set(x, y, c); }
      }
    };
    // 1 px outline on transparent pixels next to opaque ones (4-neighbour)
    P.outline = function (c) {
      var add = [], x, y;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (!P.op(x, y) && (P.op(x + 1, y) || P.op(x - 1, y) || P.op(x, y + 1) || P.op(x, y - 1))) add.push(x, y);
      for (var i = 0; i < add.length; i += 2) P.set(add[i], add[i + 1], c);
    };
    P.clone = function () { var Q = Pix(w, h); Q.d.set(P.d); return Q; };
    return P;
  }
  function C3(h) { return rgb(h).slice(); }
  function cmul(c, k) { return [clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)]; }
  function cmix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  // pick from a dark-to-light ramp by a 0..1 value, with an ordered 2x2 dither between neighbours
  var BAYER = [0.125, 0.625, 0.875, 0.375];
  function ramp(R, v, x, y) { var f = clamp(v, 0, 0.9999) * (R.length - 1), i = Math.floor(f), fr = f - i; if (fr > BAYER[((y & 1) << 1) | (x & 1)]) i++; return R[Math.min(R.length - 1, i)]; }
  function rampOf(list) { return list.map(C3); }

  /* ---------- pixel font: 6x8 proportional glyphs (original designs, shared with B-12 dungeon-floors and C-03 pixel-font) ---------- */
  var GLYPHS = {
    '!': '# # # # # . #', '"': '#.# #.#', '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.',
    '%': '##... ##..# ...#. ..#.. .#... #..## ...##', "'": '# #', '(': '..# .#. #.. #.. #.. .#. ..#',
    ')': '#.. .#. ..# ..# ..# .#. #..', '*': '..... ..#.. #.#.# .###. #.#.# ..#..', '+': '..... ..#.. ..#.. ##### ..#.. ..#..',
    ',': '.. .. .. .. .. ## .# #.', '-': '.... .... .... ####', '.': '.. .. .. .. .. ## ##',
    '/': '....# ...#. ...#. ..#.. .#... .#... #....',
    '0': '.###. #...# #..## #.#.# ##..# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
    '2': '.###. #...# ....# ...#. ..#.. .#... #####', '3': '####. ....# ....# .###. ....# ....# ####.',
    '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.', '5': '##### #.... ####. ....# ....# #...# .###.',
    '6': '..##. .#... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. .#... .#... .#...',
    '8': '.###. #...# #...# .###. #...# #...# .###.', '9': '.###. #...# #...# .#### ....# ...#. .##..',
    ':': '.. ## ## .. .. ## ##', ';': '.. ## ## .. .. ## .# #.', '<': '...# ..#. .#.. #... .#.. ..#. ...#',
    '=': '.... .... #### .... ####', '>': '#... .#.. ..#. ...# ..#. .#.. #...',
    '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
    'A': '.###. #...# #...# ##### #...# #...# #...#', 'B': '####. #...# #...# ####. #...# #...# ####.',
    'C': '.###. #...# #.... #.... #.... #...# .###.', 'D': '###.. #..#. #...# #...# #...# #..#. ###..',
    'E': '##### #.... #.... ####. #.... #.... #####', 'F': '##### #.... #.... ####. #.... #.... #....',
    'G': '.###. #...# #.... #.### #...# #...# .####', 'H': '#...# #...# #...# ##### #...# #...# #...#',
    'I': '### .#. .#. .#. .#. .#. ###', 'J': '..### ...#. ...#. ...#. #..#. #..#. .##..',
    'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#', 'L': '#... #... #... #... #... #... ####',
    'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#', 'N': '#...# ##..# #.#.# #..## #...# #...# #...#',
    'O': '.###. #...# #...# #...# #...# #...# .###.', 'P': '####. #...# #...# ####. #.... #.... #....',
    'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#', 'R': '####. #...# #...# ####. #.#.. #..#. #...#',
    'S': '.#### #.... #.... .###. ....# ....# ####.', 'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
    'U': '#...# #...# #...# #...# #...# #...# .###.', 'V': '#...# #...# #...# #...# #...# .#.#. ..#..',
    'W': '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.', 'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', 'Z': '##### ....# ...#. ..#.. .#... #.... #####',
    '[': '### #.. #.. #.. #.. #.. ###', ']': '### ..# ..# ..# ..# ..# ###', '_': '..... ..... ..... ..... ..... ..... ..... #####',
    'a': '.... .... .##. ...# .### #..# .###', 'b': '#... #... ###. #..# #..# #..# ###.',
    'c': '.... .... .### #... #... #... .###', 'd': '...# ...# .### #..# #..# #..# .###',
    'e': '.... .... .##. #..# #### #... .###', 'f': '..## .#.. #### .#.. .#.. .#.. .#..',
    'g': '.... .... .### #..# #..# .### ...# ###.', 'h': '#... #... ###. #..# #..# #..# #..#',
    'i': '# . # # # # #', 'j': '..# ... .## ..# ..# ..# ..# ##.', 'k': '#... #... #..# #.#. ##.. #.#. #..#',
    'l': '#. #. #. #. #. #. .#', 'm': '..... ..... ##.#. #.#.# #.#.# #.#.# #.#.#',
    'n': '.... .... ###. #..# #..# #..# #..#', 'o': '.... .... .##. #..# #..# #..# .##.',
    'p': '.... .... ###. #..# #..# ###. #... #...', 'q': '.... .... .### #..# #..# .### ...# ...#',
    'r': '.... .... #.## ##.. #... #... #...', 's': '.... .... .### #... .##. ...# ###.',
    't': '.#. .#. ### .#. .#. .#. ..#', 'u': '.... .... #..# #..# #..# #..# .###',
    'v': '..... ..... #...# #...# .#.#. .#.#. ..#..', 'w': '..... ..... #...# #...# #.#.# #.#.# .#.#.',
    'x': '..... ..... #...# .#.#. ..#.. .#.#. #...#', 'y': '.... .... #..# #..# #..# .### ...# ###.',
    'z': '.... .... #### ...# .##. #... ####', '~': '..... ..... .#... #.#.# ...#.',
    '^': '..#.. .#.#. #...#', '|': '# # # # # # # #'
  };
  var FONT = null;
  function fontAtlas() {
    if (FONT) return FONT;
    var list = Object.keys(GLYPHS), cw = 7, ch = 9, cols = 16, rows = Math.ceil(list.length / cols);
    var F = { map: {}, w: {}, c: mkCanvas(cols * cw, rows * ch), cw: cw, ch: ch, tint: {} };
    if (!F.c) { FONT = F; return F; }
    var g = F.c.getContext('2d'); g.fillStyle = '#ffffff';
    list.forEach(function (k, i) {
      var rr = GLYPHS[k].split(' '), gx = (i % cols) * cw, gy = Math.floor(i / cols) * ch, w = 0;
      rr.forEach(function (row, y) { w = Math.max(w, row.length); for (var x = 0; x < row.length; x++) if (row.charAt(x) === '#') g.fillRect(gx + x, gy + y, 1, 1); });
      F.map[k] = [gx, gy]; F.w[k] = w;
    });
    FONT = F; return F;
  }
  function tinted(col) {
    var F = fontAtlas(); if (!F.c) return null;
    if (F.tint[col]) return F.tint[col];
    var c = mkCanvas(F.c.width, F.c.height), g = c.getContext('2d');
    g.drawImage(F.c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
    return (F.tint[col] = c);
  }
  // width of a string in logical px at scale 1 (1 px letter gap, 3 px space)
  function measure(s) {
    var F = fontAtlas(), w = 0; s = String(s);
    for (var i = 0; i < s.length; i++) { var k = s.charAt(i); if (k === ' ') { w += 3; continue; } w += (F.w[k] || F.w['?'] || 4) + 1; }
    return Math.max(0, w - 1);
  }
  // o = {color, shadow (colour or false), align 'left' | 'center' | 'right', outline (colour), thin (4-way outline + drop pixel)}; y = top of the cap height
  function text(g, s, x, y, o) {
    o = o || {}; s = String(s); var F = fontAtlas(); if (!F.c) return 0;
    var w = measure(s), x0 = Math.round(o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x), y0 = Math.round(y);
    function run(img, dx, dy) { var cx = x0 + dx; for (var i = 0; i < s.length; i++) { var k = s.charAt(i); if (k === ' ') { cx += 3; continue; } var p = F.map[k] || F.map['?']; var gw = F.w[k] || F.w['?']; g.drawImage(img, p[0], p[1], gw, F.ch, cx, y0 + dy, gw, F.ch); cx += gw + 1; } }
    if (o.outline) { var oc = tinted(o.outline); (o.thin ? [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]] : [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]).forEach(function (d) { run(oc, d[0], d[1]); }); }
    else if (o.shadow !== false) run(tinted(o.shadow || '#0d0a14'), 1, 1);
    run(tinted(o.color || '#f4ead8'), 0, 0);
    return w;
  }

