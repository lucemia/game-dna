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

  /* =====================================================================================================
     Floors: a seeded generator (rooms, maze corridors, loops, doors, torches) or a map from data (rows of characters)
     ===================================================================================================== */
  var THEMES = {
    cellar: { name: 'The Root Cellars', wall: 'brick', floor: 'flags', ceil: 'beams', fog: '#120c0a', ambient: 0.16, tint: [1.0, 0.92, 0.82] },
    moss: { name: 'The Moss Halls', wall: 'mossy', floor: 'mossflags', ceil: 'rock', fog: '#08100e', ambient: 0.15, tint: [0.86, 1.0, 0.92] },
    ember: { name: 'The Ember Vault', wall: 'basalt', floor: 'cinder', ceil: 'rock', fog: '#140806', ambient: 0.17, tint: [1.0, 0.86, 0.78] }
  };
  var THEME_ORDER = ['cellar', 'moss', 'ember'];
  function idx(m, x, y) { return y * m.w + x; }
  function cellAt(m, x, y) { return x < 0 || y < 0 || x >= m.w || y >= m.h ? WALL : m.cells[y * m.w + x]; }
  function isSolid(t) { return t !== FLOOR; }          // DOOR is solid until open (checked with the door state)
  function blankMap(w, h) { return { w: w, h: h, cells: new Uint8Array(w * h).fill(WALL), room: new Int16Array(w * h).fill(-1), doors: [], spawns: [], items: [], start: null, stairs: null }; }

  // BFS over walkable cells (floor; doors count as walkable for reachability), from (sx, sy); returns Int32Array of distances (-1 = unreachable)
  function bfs(m, sx, sy, passDoors) {
    var d = new Int32Array(m.w * m.h).fill(-1), q = [sx, sy], h = 0; d[idx(m, sx, sy)] = 0;
    while (h < q.length) {
      var x = q[h++], y = q[h++];
      for (var k = 0; k < 4; k++) {
        var nx = x + DX[k], ny = y + DY[k], t = cellAt(m, nx, ny), i = ny * m.w + nx;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || d[i] >= 0) continue;
        if (t === FLOOR || (passDoors !== false && t === DOOR)) { d[i] = d[idx(m, x, y)] + 1; q.push(nx, ny); }
      }
    }
    return d;
  }

  function generateFloor(seed, floor, floors, P, lib) {
    var r = rng((seed >>> 0) * 31 + floor * 7919 + 17), N = Math.max(11, (Math.round(num(P.size, 19)) | 1)), m = blankMap(N, N), x, y, k, i;
    var themeId = P.themes && P.themes[floor - 1] || THEME_ORDER[(floor - 1) % THEME_ORDER.length];
    m.theme = THEMES[themeId] ? themeId : 'cellar'; m.name = THEMES[m.theme].name; m.floor = floor; m.last = floor >= floors; m.generated = true;
    // 1. rooms on odd coordinates
    var rooms = [], want = Math.max(1, Math.round(num(P.rooms, 5))), tries = 0;
    while (rooms.length < want && tries++ < 200) {
      var rw = 3 + 2 * r.int(0, 1), rh = 3 + 2 * r.int(0, 1), rx = 1 + 2 * r.int(0, (N - rw - 2) >> 1), ry = 1 + 2 * r.int(0, (N - rh - 2) >> 1);
      if (rx + rw > N - 1 || ry + rh > N - 1) continue;
      if (rooms.some(function (o) { return rx < o.x + o.w + 1 && o.x < rx + rw + 1 && ry < o.y + o.h + 1 && o.y < ry + rh + 1; })) continue;
      rooms.push({ x: rx, y: ry, w: rw, h: rh, id: rooms.length });
    }
    rooms.forEach(function (o) { for (var yy = o.y; yy < o.y + o.h; yy++) for (var xx = o.x; xx < o.x + o.w; xx++) { m.cells[idx(m, xx, yy)] = FLOOR; m.room[idx(m, xx, yy)] = o.id; } });
    // 2. maze corridors over the odd cells outside rooms (iterative backtracker)
    var seen = new Uint8Array(N * N);
    for (y = 1; y < N - 1; y += 2) for (x = 1; x < N - 1; x += 2) {
      if (seen[idx(m, x, y)] || m.room[idx(m, x, y)] >= 0) continue;
      var stack = [[x, y]]; seen[idx(m, x, y)] = 1; m.cells[idx(m, x, y)] = FLOOR;
      while (stack.length) {
        var c = stack[stack.length - 1], opts = [];
        for (k = 0; k < 4; k++) { var nx = c[0] + DX[k] * 2, ny = c[1] + DY[k] * 2; if (nx < 1 || ny < 1 || nx > N - 2 || ny > N - 2) continue; if (seen[idx(m, nx, ny)] || m.room[idx(m, nx, ny)] >= 0) continue; opts.push(k); }
        if (!opts.length) { stack.pop(); continue; }
        k = r.pick(opts); var ax = c[0] + DX[k] * 2, ay = c[1] + DY[k] * 2;
        m.cells[idx(m, c[0] + DX[k], c[1] + DY[k])] = FLOOR; m.cells[idx(m, ax, ay)] = FLOOR; seen[idx(m, ax, ay)] = 1; stack.push([ax, ay]);
      }
    }
    // 3. join every separate region (rooms, maze pieces) through single wall cells until one region remains
    function regions() {
      var lab = new Int32Array(N * N).fill(-1), n = 0;
      for (var yy = 0; yy < N; yy++) for (var xx = 0; xx < N; xx++) {
        if (m.cells[idx(m, xx, yy)] !== FLOOR || lab[idx(m, xx, yy)] >= 0) continue;
        var q = [xx, yy], h = 0; lab[idx(m, xx, yy)] = n;
        while (h < q.length) { var qx = q[h++], qy = q[h++]; for (var kk = 0; kk < 4; kk++) { var px = qx + DX[kk], py = qy + DY[kk]; if (cellAt(m, px, py) === FLOOR && lab[idx(m, px, py)] < 0) { lab[idx(m, px, py)] = n; q.push(px, py); } } }
        n++;
      }
      return { lab: lab, n: n };
    }
    for (var guard = 0; guard < 400; guard++) {
      var R = regions(); if (R.n <= 1) break;
      var cand = [];
      for (y = 1; y < N - 1; y++) for (x = 1; x < N - 1; x++) {
        if (m.cells[idx(m, x, y)] !== WALL) continue;
        var a = -1, b = -1;
        if (cellAt(m, x - 1, y) === FLOOR && cellAt(m, x + 1, y) === FLOOR) { a = R.lab[idx(m, x - 1, y)]; b = R.lab[idx(m, x + 1, y)]; }
        else if (cellAt(m, x, y - 1) === FLOOR && cellAt(m, x, y + 1) === FLOOR) { a = R.lab[idx(m, x, y - 1)]; b = R.lab[idx(m, x, y + 1)]; }
        if (a >= 0 && b >= 0 && a !== b && (a === 0 || b === 0)) cand.push([x, y]);
      }
      if (!cand.length) break;
      var pick = r.pick(cand); m.cells[idx(m, pick[0], pick[1])] = FLOOR;
    }
    // 4. trim some dead ends (shorter corridors), then a few loops
    var trim = clamp(num(P.trim, 0.55), 0, 1);
    for (var pass = 0; pass < 6; pass++) {
      for (y = 1; y < N - 1; y++) for (x = 1; x < N - 1; x++) {
        if (m.cells[idx(m, x, y)] !== FLOOR || m.room[idx(m, x, y)] >= 0) continue;
        var open = 0; for (k = 0; k < 4; k++) if (cellAt(m, x + DX[k], y + DY[k]) === FLOOR) open++;
        if (open <= 1 && hash(x, y, seed + floor * 13 + pass) < trim * 0.5) m.cells[idx(m, x, y)] = WALL;
      }
    }
    var loops = clamp(num(P.loops, 0.12), 0, 1);
    for (y = 1; y < N - 1; y++) for (x = 1; x < N - 1; x++) {
      if (m.cells[idx(m, x, y)] !== WALL) continue;
      var hor = cellAt(m, x - 1, y) === FLOOR && cellAt(m, x + 1, y) === FLOOR && cellAt(m, x, y - 1) !== FLOOR && cellAt(m, x, y + 1) !== FLOOR;
      var ver = cellAt(m, x, y - 1) === FLOOR && cellAt(m, x, y + 1) === FLOOR && cellAt(m, x - 1, y) !== FLOOR && cellAt(m, x + 1, y) !== FLOOR;
      if ((hor || ver) && r() < loops * 0.25) m.cells[idx(m, x, y)] = FLOOR;
    }
    // a region split by the dead-end trim is impossible (trim only removes leaves); keep only the region of room 0 anyway
    var start = rooms.length ? { x: rooms[0].x + (rooms[0].w >> 1), y: rooms[0].y + (rooms[0].h >> 1) } : null;
    if (!start) { for (y = 1; y < N - 1 && !start; y++) for (x = 1; x < N - 1; x++) if (m.cells[idx(m, x, y)] === FLOOR) { start = { x: x, y: y }; break; } }
    var D0 = bfs(m, start.x, start.y);
    for (i = 0; i < N * N; i++) if (m.cells[i] === FLOOR && D0[i] < 0) m.cells[i] = WALL;
    // 5. doors in room openings: a floor cell next to a room cell, walls on both sides across the passage
    var doorShare = clamp(num(P.doors, 0.5), 0, 1);
    for (y = 1; y < N - 1; y++) for (x = 1; x < N - 1; x++) {
      if (m.cells[idx(m, x, y)] !== FLOOR || m.room[idx(m, x, y)] >= 0) continue;
      var ew = cellAt(m, x - 1, y) === FLOOR && cellAt(m, x + 1, y) === FLOOR && cellAt(m, x, y - 1) === WALL && cellAt(m, x, y + 1) === WALL;
      var ns = cellAt(m, x, y - 1) === FLOOR && cellAt(m, x, y + 1) === FLOOR && cellAt(m, x - 1, y) === WALL && cellAt(m, x + 1, y) === WALL;
      if (!ew && !ns) continue;
      var nextToRoom = ew ? (m.room[idx(m, x - 1, y)] >= 0 || m.room[idx(m, x + 1, y)] >= 0) : (m.room[idx(m, x, y - 1)] >= 0 || m.room[idx(m, x, y + 1)] >= 0);
      if (nextToRoom && Math.abs(x - start.x) + Math.abs(y - start.y) > 2 && hash(x, y, seed + floor * 29) < doorShare) m.cells[idx(m, x, y)] = DOOR;
    }
    // no two doors side by side
    for (y = 1; y < N - 1; y++) for (x = 1; x < N - 1; x++) if (m.cells[idx(m, x, y)] === DOOR) for (k = 1; k < 3; k++) if (cellAt(m, x + DX[k], y + DY[k]) === DOOR) m.cells[idx(m, x + DX[k], y + DY[k])] = FLOOR;
    // 6. start facing an open side; stairs on a wall beside the farthest cell; boss in the farthest room on the last floor
    var D = bfs(m, start.x, start.y), far = null, farD = -1, farRoom = null, farRoomD = -1;
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      i = idx(m, x, y); if (m.cells[i] !== FLOOR || D[i] < 0) continue;
      var wallSide = -1; for (k = 0; k < 4; k++) if (cellAt(m, x + DX[k], y + DY[k]) === WALL) { wallSide = k; break; }
      if (wallSide >= 0 && D[i] > farD) { farD = D[i]; far = { x: x, y: y, side: wallSide }; }
      if (m.room[i] >= 0 && m.room[i] !== m.room[idx(m, start.x, start.y)] && D[i] > farRoomD) { farRoomD = D[i]; farRoom = { x: x, y: y }; }
    }
    m.start = { x: start.x, y: start.y, dir: 0 };
    var bestRun = -1;   // face the longest open run (never a wall at arrival)
    for (k = 0; k < 4; k++) { var run = 0; while (cellAt(m, start.x + DX[k] * (run + 1), start.y + DY[k] * (run + 1)) === FLOOR && run < 12) run++; if (run > bestRun) { bestRun = run; m.start.dir = k; } }
    if (!m.last && far) { var sx2 = far.x + DX[far.side], sy2 = far.y + DY[far.side]; m.cells[idx(m, sx2, sy2)] = STAIRS; m.stairs = { x: sx2, y: sy2, fx: far.x, fy: far.y }; }
    // 7. torches and banners on walls that face a room or a corridor cell
    var walls = [];
    for (y = 1; y < N - 1; y++) for (x = 1; x < N - 1; x++) {
      if (m.cells[idx(m, x, y)] !== WALL) continue;
      var faces = 0, roomFace = false; for (k = 0; k < 4; k++) { var t2 = cellAt(m, x + DX[k], y + DY[k]); if (t2 === FLOOR) { faces++; if (m.room[idx(m, x + DX[k], y + DY[k])] >= 0) roomFace = true; } }
      if (faces) walls.push({ x: x, y: y, room: roomFace, h: hash(x, y, seed + floor * 41) });
    }
    walls.sort(function (a, b) { return (b.room - a.room) || (a.h - b.h); });
    var torchN = Math.max(2, Math.round(num(P.torches, 1) * (rooms.length * 1.6 + 3))), placed = [];
    walls.forEach(function (wl) {
      if (placed.length >= torchN) return;
      if (placed.some(function (p) { return Math.abs(p.x - wl.x) + Math.abs(p.y - wl.y) < 4; })) return;
      if (m.stairs && Math.abs(m.stairs.x - wl.x) + Math.abs(m.stairs.y - wl.y) < 2) return;
      m.cells[idx(m, wl.x, wl.y)] = TORCH; placed.push(wl);
    });
    var banners = 0; walls.forEach(function (wl) { if (banners < 2 + floor && wl.room && m.cells[idx(m, wl.x, wl.y)] === WALL && wl.h > 0.82) { m.cells[idx(m, wl.x, wl.y)] = BANNER; banners++; } });
    // 8. monsters by budget (never within 4 steps of the start), items, the boss
    D = bfs(m, start.x, start.y);
    var free = [];
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) { i = idx(m, x, y); if (m.cells[i] === FLOOR && D[i] >= 0) free.push({ x: x, y: y, d: D[i], h: hash(x, y, seed * 3 + floor) }); }
    free.sort(function (a, b) { return a.h - b.h; });
    var used = {}; used[start.x + ',' + start.y] = 1; if (m.stairs) used[m.stairs.fx + ',' + m.stairs.fy] = 1;
    function take(minD) { for (var j = 0; j < free.length; j++) { var f = free[j]; if (f.d >= minD && !used[f.x + ',' + f.y]) { used[f.x + ',' + f.y] = 1; return f; } } return null; }
    if (m.last && farRoom) { used[farRoom.x + ',' + farRoom.y] = 1; m.spawns.push({ x: farRoom.x, y: farRoom.y, boss: true }); }
    var nMon = Math.round((3 + floor * 1.5) * clamp(num(P.density, 1), 0, 3));
    for (k = 0; k < nMon; k++) { var f2 = take(5); if (f2) m.spawns.push({ x: f2.x, y: f2.y }); }
    var nIt = Math.round((3 + floor) * clamp(num(P.loot, 1), 0, 3));
    for (k = 0; k < nIt; k++) { var f3 = take(2); if (f3) m.items.push({ x: f3.x, y: f3.y }); }
    m.rooms = rooms;
    return m;
  }

  // a floor from data: {name, theme, rows: ['#####', '#^.e#', ...], legend: {char: {enemy: id} | {item: id}}}
  // '#' wall, 'T' torch wall, 'B' banner wall, 'D' door, 'S' stair arch, '.' floor, '^ > v <' start and facing,
  // 'e' a monster (picked by floor), 'i' an item (picked by floor), 'K' the boss; any other char via legend (on floor)
  function parseMap(def, floor, floors) {
    var rows = (def && def.rows) || [], h = rows.length + 2, w = 2 + rows.reduce(function (a, s) { return Math.max(a, String(s).length); }, 0);
    var m = blankMap(w, h), legend = (def && def.legend) || {};
    m.theme = def && THEMES[def.theme] ? def.theme : THEME_ORDER[(floor - 1) % THEME_ORDER.length];
    m.name = (def && def.name) || THEMES[m.theme].name; m.floor = floor; m.last = def && def.last != null ? !!def.last : floor >= floors; m.generated = false;
    rows.forEach(function (s, ry) {
      s = String(s);
      for (var rx = 0; rx < s.length; rx++) {
        var ch = s.charAt(rx), x = rx + 1, y = ry + 1, i = idx(m, x, y), L = legend[ch];
        if (ch === '#' || ch === ' ') continue;
        if (ch === 'T') { m.cells[i] = TORCH; continue; }
        if (ch === 'B') { m.cells[i] = BANNER; continue; }
        if (ch === 'D') { m.cells[i] = DOOR; continue; }
        if (ch === 'S') { m.cells[i] = STAIRS; m.stairs = { x: x, y: y }; continue; }
        m.cells[i] = FLOOR;
        var sd = '^>v<'.indexOf(ch); if (sd >= 0) m.start = { x: x, y: y, dir: sd };
        if (ch === 'e') m.spawns.push({ x: x, y: y });
        if (ch === 'K') m.spawns.push({ x: x, y: y, boss: true });
        if (ch === 'i') m.items.push({ x: x, y: y });
        if (L && L.enemy) m.spawns.push({ x: x, y: y, kind: L.enemy });
        if (L && L.item) m.items.push({ x: x, y: y, kind: L.item });
      }
    });
    if (!m.start) { for (var j = 0; j < m.cells.length; j++) if (m.cells[j] === FLOOR) { m.start = { x: j % w, y: Math.floor(j / w), dir: 1 }; break; } }
    if (m.stairs) { for (var k = 0; k < 4; k++) { var fx = m.stairs.x + DX[k], fy = m.stairs.y + DY[k]; if (cellAt(m, fx, fy) === FLOOR) { m.stairs.fx = fx; m.stairs.fy = fy; break; } } }
    m.rooms = [];
    return m;
  }

  /* =====================================================================================================
     Art, all made in code at load time: 64 x 64 wall / floor / ceiling textures per theme, the door, the stair arch,
     torch walls (3 flame frames), banners; monster billboards (idle x2, wind-up, strike, hurt) and item billboards.
     A texture or sprite is {w, h, d: RGBA bytes, glow: 0..255 per texel or null (emissive: ignores light and fog)}.
     ===================================================================================================== */
  var OUT = C3('#0c0910');
  function tex(fn, w, h) {
    w = w || TEX; h = h || TEX; var P = Pix(w, h), glow = null;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var r = fn(x, y); if (!r) continue;
      if (r.length > 3 && r[3]) { if (!glow) glow = new Uint8Array(w * h); glow[y * w + x] = r[3]; }
      P.set(x, y, r);
    }
    P.glow = glow; return P;
  }
  function withGlow(P) { if (!P.glow) P.glow = new Uint8Array(P.w * P.h); return P.glow; }

  var RAMPS = {
    brick: rampOf(['#26150f', '#3f2318', '#56301f', '#6a3e29', '#7e5035', '#946646', '#ac805c']),
    mortar: rampOf(['#1a1210', '#2a201a', '#3a2e26']),
    stone: rampOf(['#1f2422', '#2e3532', '#3e4743', '#525c56', '#69736a', '#848d80', '#a2a996']),
    moss: rampOf(['#14281a', '#1e3c20', '#2c5426', '#3e6e2c', '#5a8a36', '#7ca448']),
    basalt: rampOf(['#140f12', '#21181c', '#2e2226', '#3d2e30', '#4e3c3a', '#62504a']),
    ember: rampOf(['#7a1e0c', '#c4400e', '#f07a1e', '#ffb444', '#ffe39a']),
    wood: rampOf(['#2a160c', '#432414', '#5c341c', '#784628', '#945c36', '#b07a4c']),
    iron: rampOf(['#14141a', '#24242c', '#383842', '#50505c', '#6e6e7c', '#9898a6']),
    gold: rampOf(['#4a2a08', '#7a4a10', '#b07a1c', '#dcaa34', '#f6d86a', '#fff4c0']),
    flame: rampOf(['#c43a0a', '#f06a14', '#ffa030', '#ffd060', '#fff4c0']),
    cloth: { cellar: rampOf(['#2a0a12', '#4a1020', '#6c1a2c', '#902838', '#b03c48']), moss: rampOf(['#0a1a2c', '#122c4a', '#1c406a', '#2a5a8c', '#3c76aa']), ember: rampOf(['#1c0a24', '#301040', '#481a5c', '#64287a', '#823c98']) }
  };

  /* ---------- wall bases ---------- */
  function brickTexel(x, y) {
    var row = Math.floor(y / 8), off = (row & 1) ? 8 : 0, bx = Math.floor((x + off) / 16), lx = (x + off) % 16, ly = y % 8;
    if (ly === 7 || lx === 15) return ramp(RAMPS.mortar, 0.3 + tnoise(x, y, 4, 16, 3) * 0.5, x, y);
    var h = hash(bx & 3, row, 11), v = 0.28 + h * 0.34 + (tnoise(x, y, 6, 64 / 6 | 0, 5) - 0.5) * 0.22;
    if (ly === 0 || lx === 0) v += 0.16; else if (ly === 6 || lx === 14) v -= 0.14;
    if (hash(x, y, 7) < 0.06) v -= 0.12;
    if (h > 0.86 && lx > 4 && lx < 10 && ly === 3 + (lx & 1)) v -= 0.25;     // a crack on a few bricks
    return ramp(RAMPS.brick, v, x, y);
  }
  var BLOCK_ROWS = [0, 22, 43, 64];
  function stoneBlock(x, y) {   // big bevelled blocks, rows of 21-22 texels, staggered
    var r = BLOCK_ROWS[1] > y ? 0 : BLOCK_ROWS[2] > y ? 1 : 2, top = BLOCK_ROWS[r], bot = BLOCK_ROWS[r + 1], off = r === 1 ? 16 : r === 2 ? 40 : 0;
    var lx = (x + off) % 32, ly = y - top, hh = bot - top, bid = Math.floor((x + off) / 32) & 1;
    return { lx: lx, ly: ly, hh: hh, id: r * 2 + bid, edge: lx === 31 || ly === hh - 1, bev: ly <= 1 || lx <= 1 ? 1 : (ly >= hh - 3 || lx >= 29) ? -1 : 0 };
  }
  function mossyTexel(x, y) {
    var b = stoneBlock(x, y);
    if (b.edge) return ramp(RAMPS.stone, 0.06 + tnoise(x, y, 3, 21, 9) * 0.12, x, y);
    var v = 0.36 + hash(b.id, 3, 21) * 0.18 + (tnoise(x, y, 6, 64 / 8 | 0, 13) - 0.5) * 0.16 + b.bev * 0.18;
    if (hash(x, y, 17) < 0.03) v -= 0.08;
    // moss: thick on block tops, dripping down in tongues
    var drip = tnoise(x, 0, 3, 64 / 4 | 0, 31), mossY = 2 + drip * drip * 10 * (0.4 + hash(b.id, 1, 41)), n = tnoise(x, y, 4, 16, 37);
    if (b.ly < mossY && n > 0.38) return ramp(RAMPS.moss, 0.2 + n * 0.6 + (b.ly < 2 ? 0.15 : 0), x, y);
    return ramp(RAMPS.stone, v, x, y);
  }
  var CRACKS = null;
  function crackMask() {   // a few hot seams: random walks across the blocks (1 = core, 2 = warm rim), tileable
    if (CRACKS) return CRACKS;
    var M = new Uint8Array(TEX * TEX), r = rng(4242), k, i;
    function put(x, y, v) { x = ((x % TEX) + TEX) % TEX; y = ((y % TEX) + TEX) % TEX; var j = y * TEX + x; if (v === 1 || !M[j]) M[j] = v; }
    for (k = 0; k < 2; k++) {
      var x = r.int(0, 63), y = r.int(0, 63), dx = r() < 0.5 ? 1 : -1, len = r.int(10, 18), vert = r() < 0.6;
      for (i = 0; i < len; i++) {
        put(x, y, 1);
        if (vert) { y++; if (r() < 0.45) x += dx; if (r() < 0.12) dx = -dx; } else { x += dx; if (r() < 0.45) y++; if (r() < 0.1) y -= 2; }
        if (r() < 0.07) { var bx = x, by = y, bd = -dx; for (var b = 0; b < r.int(3, 6); b++) { bx += bd; if (r() < 0.5) by++; put(bx, by, 1); } }
      }
    }
    for (var yy = 0; yy < TEX; yy++) for (var xx = 0; xx < TEX; xx++) if (M[yy * TEX + xx] === 1) for (var d = 0; d < 4; d++) put(xx + DX[d], yy + DY[d], 2);
    return (CRACKS = M);
  }
  function basaltTexel(x, y) {
    var b = stoneBlock(x, y), m = crackMask()[y * TEX + x];
    if (m === 1) return ramp(RAMPS.ember, 0.5 + hash(x, y, 55) * 0.35, x, y).concat([255]);
    if (b.edge) return ramp(RAMPS.basalt, 0.05, x, y);
    var v = 0.3 + hash(b.id, 5, 61) * 0.18 + (tnoise(x, y, 4, 16, 63) - 0.5) * 0.3 + b.bev * 0.16;
    var c = ramp(RAMPS.basalt, v, x, y);
    if (m === 2) return cmix(c, RAMPS.ember[0], 0.3);       // a faint warm rim beside a seam
    return c;
  }
  var WALLFN = { brick: brickTexel, mossy: mossyTexel, basalt: basaltTexel };

  function sconce(P, frame, wallId) {   // an iron sconce, a torch and a flame (emissive), warm light baked on the wall around
    var glow = withGlow(P), x, y;
    for (y = 0; y < TEX; y++) for (x = 0; x < TEX; x++) {
      var dx = (x - 32) / 26, dy = (y - 22) / 30, d = Math.sqrt(dx * dx + dy * dy); if (d >= 1) continue;
      var i = (y * TEX + x) * 4, k = 1 + (1 - d) * (1 - d) * 1.1;
      P.d[i] = clamp(P.d[i] * k + (1 - d) * 26, 0, 255); P.d[i + 1] = clamp(P.d[i + 1] * (1 + (k - 1) * 0.75) + (1 - d) * 10, 0, 255); P.d[i + 2] = clamp(P.d[i + 2] * (1 + (k - 1) * 0.4), 0, 255);
    }
    // bracket on the wall
    P.poly([[26, 44], [38, 44], [36, 48], [28, 48]], function (xx, yy) { return ramp(RAMPS.iron, 0.5 - (yy - 44) * 0.08, xx, yy); });
    P.line(32, 46, 32, 36, 3, function (xx, yy) { return ramp(RAMPS.iron, xx < 32 ? 0.6 : 0.3, xx, yy); });
    // torch handle and cup
    P.line(32, 40, 32, 28, 4, function (xx, yy) { return ramp(RAMPS.wood, xx < 32 ? 0.75 : 0.35, xx, yy); });
    P.poly([[26, 26], [38, 26], [36, 31], [28, 31]], function (xx, yy) { return ramp(RAMPS.iron, yy === 26 ? 0.9 : xx < 31 ? 0.55 : 0.3, xx, yy); });
    // flame: three frames, a teardrop with a hot core
    var sway = [0, 1.2, -1][frame % 3], tall = [17, 19, 16][frame % 3];
    for (y = 4; y < 27; y++) for (x = 22; x < 43; x++) {
      var u = (26 - y) / tall; if (u < 0 || u > 1) continue;
      var cx = 32 + sway * u * u * 2, hw = 5.6 * Math.sin(Math.PI * Math.pow(1 - u, 0.8) * 0.92 + 0.08) * (1 - u * 0.35);
      var n = tnoise(x * 2, y + frame * 5, 3, 64, 71 + frame) - 0.5, ax = Math.abs(x + 0.5 - cx + n * 2.2);
      if (ax > hw) continue;
      var heat = (1 - ax / hw) * 0.7 + (1 - u) * 0.4;
      var c = ramp(RAMPS.flame, heat, x, y); P.set(x, y, c); glow[y * TEX + x] = 255;
    }
    // the flame's light on the cup rim and the bracket stays lit
    for (y = 26; y < 32; y++) for (x = 26; x < 38; x++) if (P.op(x, y)) glow[y * TEX + x] = Math.max(glow[y * TEX + x], 90);
  }
  function banner(P, cloth) {   // a cloth banner on a rod with a plain emblem
    P.line(14, 5, 50, 5, 2, function (xx, yy) { return ramp(RAMPS.iron, yy < 5 ? 0.8 : 0.4, xx, yy); });
    P.ell(14, 5, 2, 2, ramp(RAMPS.gold, 0.7, 0, 0)); P.ell(50, 5, 2, 2, ramp(RAMPS.gold, 0.5, 0, 0));
    P.poly([[19, 6], [45, 6], [45, 52], [32, 45], [19, 52]], function (x, y) {
      var fold = Math.sin((x - 19) / 26 * Math.PI * 3) * 0.16, v = 0.5 + fold - (y - 6) / 46 * 0.15 + (x < 21 ? 0.12 : x > 42 ? -0.18 : 0);
      var ex = Math.abs(x + 0.5 - 32), ey = y + 0.5 - 24, dia = ex + Math.abs(ey) * 0.8;
      if (dia < 9 && dia > 6.6) return ramp(RAMPS.gold, 0.5 + fold, x, y);
      if (dia < 4) return ramp(RAMPS.gold, 0.75 + fold, x, y);
      if (y === 9 || y === 10) return ramp(RAMPS.gold, 0.45, x, y);
      return ramp(cloth, v, x, y);
    });
    for (var x = 19; x < 46; x += 3) P.set(x, 7, ramp(cloth, 0.8, x, 7));
  }
  function doorTexel(x, y) {
    if (x < 3 || x > 60 || y < 2) return ramp(RAMPS.iron, x < 2 || y < 1 ? 0.55 : 0.3, x, y);   // iron frame
    var px = x - 3, plank = Math.floor(px / 9.5), lx = px - plank * 9.5;
    if (lx < 1) return ramp(RAMPS.wood, 0.05, x, y);
    var band = (y >= 12 && y <= 16) || (y >= 46 && y <= 50);
    if (band) { var rivet = (Math.round(px) % 10 === 5) && (y === 14 || y === 48); return ramp(RAMPS.iron, rivet ? 0.95 : y === 12 || y === 46 ? 0.7 : y === 16 || y === 50 ? 0.2 : 0.45, x, y); }
    var g = tnoise(x * 3, y * 0.4, 3, 64, 81 + plank) - 0.5, v = 0.42 + hash(plank, 1, 83) * 0.14 + g * 0.35 + (lx < 2 ? 0.14 : lx > 8 ? -0.12 : 0);
    if (hash(plank, Math.floor(y / 7), 87) < 0.12 && Math.abs(lx - 4.5) < 1) v -= 0.25;       // a knot
    return ramp(RAMPS.wood, v, x, y);
  }
  function doorTex() {
    var P = tex(doorTexel);
    P.ell(50, 33, 4.5, 4.5, function (x, y, nx, ny) { var r = Math.sqrt(nx * nx + ny * ny); return r > 0.55 ? ramp(RAMPS.gold, 0.55 - nx * 0.3 - ny * 0.3, x, y) : null; });
    P.ell(50, 27, 2, 2, ramp(RAMPS.iron, 0.6, 0, 0));
    return P;
  }
  // the stair arch, 128 x 128: a lit stone doorway (jambs of bevelled blocks, voussoirs, a keystone) over a stairwell whose
  // treads go down and away (lit by the doorway, narrowing, each nosing catching the light, the risers' shadow below it),
  // stone side walls closing in, and a cold light far below
  function stairsTex(theme) {
    var wall = WALLFN[THEMES[theme].wall], N = 128, P = Pix(N, N), glow = new Uint8Array(N * N), ST = RAMPS.stone, cx = 64, archY = 46, rIn = 36, rOut = 46;
    function put(x, y, c, g) { P.set(x, y, c); if (g) glow[y * N + x] = g; }
    // treads: k = 0 is nearest (bottom); top edge, nosing and the shadowed drop under it
    // the eye line is the texture's middle (y 64): every tread stays below it, so the stair drops away from the viewer
    var steps = [], y0 = 128, h = 11, hw = rIn - 1;
    for (var k = 0; k < 7; k++) { var top = y0 - h; steps.push({ top: top, bot: y0, hw: hw, k: k }); y0 = top - Math.max(1, Math.round(h * 0.42)); h = Math.max(2, Math.round(h * 0.72)); hw = hw * 0.84; }
    var deep = y0;
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var dx = x + 0.5 - cx, dyA = y + 0.5 - archY, inOpen = Math.abs(dx) < rIn && (y >= archY || dx * dx + dyA * dyA < rIn * rIn);
      var inFrame = Math.abs(dx) < rOut && (y >= archY || dx * dx + dyA * dyA < rOut * rOut);
      if (!inFrame) { var c0 = wall(x >> 1, y >> 1); put(x, y, c0.slice(0, 3), c0[3] || 0); continue; }
      if (!inOpen) {
        if (y >= archY) {   // jambs: stacked blocks, bevel lit from the doorway side
          var row = Math.floor((y - archY) / 12), ly = (y - archY) % 12, side = dx < 0 ? -1 : 1, lx = Math.abs(dx) - rIn, bid = row * 2 + (side > 0 ? 1 : 0);
          if (ly === 11 || lx >= rOut - rIn - 1) { put(x, y, ramp(ST, 0.06, x, y)); continue; }
          var v = 0.5 + hash(bid, 7, 201) * 0.14 + (tnoise(x, y, 4, 32, 203) - 0.5) * 0.2 - lx * 0.012;
          if (ly === 0 || lx < 1.2) v += 0.2; if (ly >= 9) v -= 0.12;
          put(x, y, ramp(ST, v, x, y)); continue;
        }
        // voussoirs around the arch, a keystone at the top
        var ang = Math.atan2(dyA, dx), seg = Math.floor((ang + Math.PI) / (Math.PI / 7)), fr = ((ang + Math.PI) / (Math.PI / 7)) % 1, rr = Math.sqrt(dx * dx + dyA * dyA);
        var key = Math.abs(dx) < 6 && dyA < 0;
        if (!key && (fr < 0.08 || rr > rOut - 1.2)) { put(x, y, ramp(ST, 0.06, x, y)); continue; }
        var v2 = (key ? 0.72 : 0.55 + hash(seg, 3, 205) * 0.14) + (rr < rIn + 2 ? 0.16 : 0) + (tnoise(x, y, 4, 32, 207) - 0.5) * 0.18;
        put(x, y, ramp(ST, v2, x, y)); continue;
      }
      // inside the opening: stairwell side walls converge, the ceiling falls away into the dark
      var st = null; for (var j = 0; j < steps.length; j++) { if (y >= steps[j].top - Math.round((steps[j].bot - steps[j].top) * 0.45) && y < steps[j].bot) { st = steps[j]; break; } }
      var depth = st ? st.k / (steps.length - 1) : 1, warm = Math.max(0, 1 - depth * 1.3);
      if (st && Math.abs(dx) <= st.hw) {
        var tread = y >= st.top, nose = y === st.top || y === st.top + 1, u = (y - st.top) / Math.max(1, st.bot - st.top);
        var c;
        if (nose) c = cmix(ramp(ST, 0.85 - depth * 0.6, x, y), [255, 196, 120], 0.25 * warm);
        else if (tread) c = cmix(ramp(ST, 0.62 - depth * 0.55 - u * 0.12 + (tnoise(x, y, 3, 32, 209) - 0.5) * 0.1, x, y), [255, 180, 110], 0.18 * warm);
        else c = ramp(ST, 0.1 - depth * 0.08, x, y);      // the riser in shadow under the nosing
        if (Math.abs(dx) > st.hw - 1.5) c = cmul(c, 0.6);
        var g = depth > 0.6 && tread ? Math.round((depth - 0.6) * 300) : 0;
        if (g) c = cmix(c, [110, 190, 210], (depth - 0.6) * 1.1);
        put(x, y, c, Math.min(200, g)); continue;
      }
      // side walls of the stairwell and the dark beyond the last step
      var wallSide = st ? Math.abs(dx) - st.hw : 0, below = y >= deep;
      if (st && wallSide > 0) { var wv = 0.34 - depth * 0.3 + (Math.floor((y + (dx < 0 ? 0 : 5)) / 6) % 2 ? 0.04 : -0.02) - wallSide * 0.004; put(x, y, cmix(ramp(ST, wv, x, y), [255, 170, 100], 0.1 * warm)); continue; }
      // above the last tread: the stairwell going down (ceiling courses closing in) and a small lit doorway far below
      var hwD = Math.max(4, steps[steps.length - 1].hw * 0.55), topY = archY - rIn, tq = clamp((y - topY) / Math.max(1, deep - topY), 0, 1), hwY = lerp(rIn, hwD, tq);
      if (y >= deep - 9 && Math.abs(dx) < hwD) {
        var ddy = y - (deep - 9 + hwD), inDoor = y >= deep - 9 + hwD || dx * dx + ddy * ddy < hwD * hwD;
        if (inDoor) { var gl2 = 1 - Math.abs(dx) / hwD * 0.5; put(x, y, cmix([14, 20, 28], [70, 128, 146], gl2 * 0.7), Math.round(90 * gl2)); continue; }
      }
      if (Math.abs(dx) > hwY) { put(x, y, ramp(ST, 0.16 - tq * 0.12 + (Math.floor(y / 5) % 2 ? 0.03 : 0), x, y)); continue; }      // side walls
      var course = Math.floor(Math.pow(tq, 0.6) * 9), mortar = Math.abs(Math.pow(tq, 0.6) * 9 - course - 0.5) > 0.46;
      put(x, y, mortar ? ramp(ST, 0.04, x, y) : ramp(ST, 0.13 - tq * 0.1 + hash(course, x >> 3, 211) * 0.04, x, y));
    }
    P.glow = glow; return P;
  }
  /* ---------- floors and ceilings ---------- */
  function flagTexel(x, y, mossy, cinder) {
    var tx = Math.floor(x / 32), ty = Math.floor(y / 32), lx = x % 32, ly = y % 32, split = (tx + ty) & 1;
    var sx = split ? (ly < 16 ? 12 : 20) : 16, sub = split ? (lx < sx ? 0 : 1) : (ly < 14 ? 0 : 1), id = tx * 7 + ty * 3 + sub;
    var grout = lx === 0 || ly === 0 || (split ? lx === sx : ly === 14) || (split && ly === 16 && false);
    if (cinder) {
      var n = tnoise(x, y, 5, 64 / 5 | 0, 101), e = hash(x, y, 103);
      if (e > 0.997 && n > 0.5) return ramp(RAMPS.ember, 0.45 + (e - 0.994) * 50, x, y).concat([170]);
      if (grout) return ramp(RAMPS.basalt, 0.05, x, y);
      return ramp(RAMPS.basalt, 0.24 + n * 0.3 + hash(id, 1, 105) * 0.12 + (lx === 1 || ly === 1 ? 0.1 : 0), x, y);
    }
    if (grout) return mossy && tnoise(x, y, 2, 32, 107) > 0.45 ? ramp(RAMPS.moss, 0.35, x, y) : ramp(RAMPS.mortar, 0.25, x, y);
    var v = 0.3 + hash(id, 2, 109) * 0.22 + (tnoise(x, y, 4, 16, 111) - 0.5) * 0.24 + (lx === 1 || ly === 1 ? 0.12 : 0);
    if (hash(x, y, 113) < 0.04) v -= 0.12;
    if (mossy && tnoise(x, y, 6, 64 / 6 | 0, 115) > 0.66) return ramp(RAMPS.moss, 0.25 + tnoise(x, y, 2, 32, 117) * 0.4, x, y);
    return ramp(mossy ? RAMPS.stone : RAMPS.brick.map(function (c) { return cmix(c, [110, 100, 92], 0.55); }), v, x, y);
  }
  function beamsTexel(x, y) {
    var lx = x % 32, beam = lx >= 4 && lx < 28;
    if (!beam) return ramp(RAMPS.wood, 0.05 + tnoise(x, y, 4, 16, 121) * 0.08, x, y);
    var v = 0.32 + tnoise(x * 0.4, y * 3, 3, 64, 123 + (x >> 5)) * 0.3 + (lx === 4 ? 0.18 : lx === 27 ? -0.15 : 0);
    if ((y & 31) === 8 && Math.abs(lx - 16) > 6) return ramp(RAMPS.iron, 0.6, x, y);
    return ramp(RAMPS.wood, v, x, y);
  }
  function rockTexel(x, y, warm) {
    var n = tnoise(x, y, 8, 8, 131) * 0.6 + tnoise(x, y, 3, 64 / 3 | 0, 133) * 0.4;
    return ramp(warm ? RAMPS.basalt : RAMPS.stone, 0.12 + n * 0.32, x, y);
  }

  var ART = null;
  function buildArt() {
    if (ART) return ART;
    ART = { walls: {}, torch: {}, banner: {}, stairs: {}, floor: {}, ceil: {}, door: doorTex(), sprites: {} };
    Object.keys(THEMES).forEach(function (th) {
      var T = THEMES[th], base = tex(WALLFN[T.wall]);
      ART.walls[th] = base;
      ART.torch[th] = [0, 1, 2].map(function (f) { var P = base.clone(); P.glow = base.glow ? new Uint8Array(base.glow) : null; sconce(P, f, th); return P; });
      var B = base.clone(); B.glow = base.glow ? new Uint8Array(base.glow) : null; banner(B, RAMPS.cloth[th]); ART.banner[th] = B;
      ART.stairs[th] = stairsTex(th);
      ART.floor[th] = tex(function (x, y) { return flagTexel(x, y, th === 'moss', th === 'ember'); });
      ART.ceil[th] = T.ceil === 'beams' ? tex(beamsTexel) : tex(function (x, y) { return rockTexel(x, y, th === 'ember'); });
    });
    return ART;
  }

  /* ---------- billboards: monsters (idle0, idle1, wind, strike, hurt) and items ---------- */
  var L3 = (function () { var v = [-0.45, -0.7, 0.55], n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); return [v[0] / n, v[1] / n, v[2] / n]; })();
  function lit(nx, ny) { var nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), l = nx * L3[0] + ny * L3[1] + nz * L3[2]; return { l: Math.max(0, l), nz: nz, spec: Math.pow(Math.max(0, l), 18) }; }
  function eye(P, cx, cy, rx, ry, pupil, look) {   // white, a pupil looking at the viewer, a glint
    P.ell(cx, cy, rx + 1, ry + 1, OUT);
    P.ell(cx, cy, rx, ry, function (x, y, nx, ny) { return ny > 0.45 ? [196, 200, 214] : [244, 244, 250]; });
    P.ell(cx + (look || 0), cy + 0.6, Math.max(1, rx * 0.5), Math.max(1.2, ry * 0.55), pupil || [26, 16, 30]);
    P.set(Math.round(cx - rx * 0.35), Math.round(cy - ry * 0.4), [255, 255, 255]);
  }
  function slime(pose, pal, crown) {
    var W = 64, H = 64, P = Pix(W, H), R = rampOf(pal.ramp);
    var sh = { idle0: [24, 20], idle1: [25.5, 18.5], wind: [28.5, 14.5], strike: [21, 25], hurt: [29, 13.5] }[pose] || [24, 20];
    var rx = sh[0], ry = sh[1], cx = 32, cy = 63 - ry * 0.86, lean = pose === 'strike' ? -1.5 : 0;
    P.ell(cx, cy, rx, ry, function (x, y, nx, ny) {
      if (y > 62) return null;
      var s = lit(nx, ny), v = 0.18 + s.l * 0.72 - Math.pow(1 - s.nz, 3) * 0.25;
      var core = (nx * nx + (ny - 0.15) * (ny - 0.15)) < 0.3 ? -0.1 : 0;
      if (s.spec > 0.9 && hash(x, y, 3) > 0.15) return [246, 252, 246];
      if (s.spec > 0.55) v += 0.22;
      var bub = hash(x >> 1, y >> 1, pal.seed || 5);
      if (bub > 0.965 && ny > -0.4 && ny < 0.6 && Math.abs(nx) < 0.7) return ramp(R, v + 0.32, x, y);
      if (ny > 0.78) v -= 0.12;
      return ramp(R, v + core, x, y);
    });
    // a darker underside line where the body meets the floor
    for (var x = Math.round(cx - rx * 0.86); x <= Math.round(cx + rx * 0.86); x++) if (P.op(x, 62)) P.set(x, 62, R[0]);
    var ey = cy - ry * 0.18 + (pose === 'strike' ? -3 : 0), ex = rx * 0.36, er = Math.max(3, rx * 0.17);
    if (pose === 'hurt') {   // squeezed shut: > <
      [-1, 1].forEach(function (s) { var x0 = cx + s * ex; P.line(x0 - 3 * s, ey - 3, x0 + 2 * s, ey, 2, OUT); P.line(x0 + 2 * s, ey, x0 - 3 * s, ey + 3, 2, OUT); });
      P.line(cx - 5, ey + 9, cx + 5, ey + 9, 2, OUT);
    } else {
      var ery = pose === 'wind' ? er * 0.75 : er * 1.15;
      eye(P, cx - ex + lean, ey, er, ery, pal.pupil); eye(P, cx + ex + lean, ey, er, ery, pal.pupil);
      if (pose === 'wind' || pose === 'strike') {   // angry brows
        P.line(cx - ex - er - 1, ey - ery - 4, cx - ex + er + 1, ey - ery - 1, 2, OUT); P.line(cx + ex + er + 1, ey - ery - 4, cx + ex - er - 1, ey - ery - 1, 2, OUT);
      }
      if (pose === 'strike') {   // mouth open, two fangs
        P.ell(cx, ey + er + 7, 6, 4.5, [40, 10, 24]); P.ell(cx, ey + er + 8.5, 3.5, 2, [120, 30, 50]);
        P.poly([[cx - 4.5, ey + er + 3.5], [cx - 2.5, ey + er + 3.5], [cx - 3.5, ey + er + 7]], [240, 240, 236]); P.poly([[cx + 2.5, ey + er + 3.5], [cx + 4.5, ey + er + 3.5], [cx + 3.5, ey + er + 7]], [240, 240, 236]);
      } else if (pose === 'wind') { P.line(cx - 4, ey + er + 5, cx + 4, ey + er + 5, 2, OUT); }
      else { P.line(cx - 3, ey + er + 5, cx, ey + er + 6, 1, OUT); P.line(cx, ey + er + 6, cx + 3, ey + er + 5, 1, OUT); }
    }
    if (crown) {   // a gold crown sunk into the top of the body (joined to it)
      var kc = clamp(ry / 20, 0.72, 1.1), ty = Math.min(cy - ry + 3, ey - er * 1.25 - 6.5), G = RAMPS.gold;   // the crown band always sits above the eyes and brows
      P.poly([[cx - 11, ty + 4], [cx - 12, ty - 9 * kc], [cx - 6, ty - 3 * kc], [cx, ty - 12 * kc], [cx + 6, ty - 3 * kc], [cx + 12, ty - 9 * kc], [cx + 11, ty + 4]], function (x, y) { return ramp(G, 0.75 - (x - cx + 12) / 24 * 0.45 - (y > ty + 1 ? 0.2 : 0), x, y); });
      [[cx - 12, ty - 10 * kc], [cx, ty - 13 * kc], [cx + 12, ty - 10 * kc]].forEach(function (p) { P.ell(p[0], p[1], 1.6, 1.6, G[5]); });
      P.ell(cx, ty - 1, 2.2, 2.2, [200, 40, 70]); P.set(cx - 1, ty - 2, [255, 170, 190]);
    }
    P.outline(OUT); return P;
  }
  function bat(pose, pal) {
    var W = 64, H = 48, P = Pix(W, H), R = rampOf(pal.ramp), M = rampOf(pal.wing), cx = 32, by = 24;
    var tip = { idle0: [-26, -18], idle1: [-29, 2], idle2: [-24, 14], wind: [-25, -21], strike: [-20, 12], hurt: [-17, 9] }[pose] || [-26, -18];
    var mouth = pose === 'wind' || pose === 'strike';
    [-1, 1].forEach(function (s) {   // wings: membrane with three fingers and a scalloped trailing edge
      var sx = cx + s * 5, sy = by - 3, tx = cx + s * (-tip[0]), ty = by + tip[1], f1 = [cx + s * (-tip[0]) * 0.62, ty + (by + 10 - ty) * 0.55], f2 = [cx + s * (-tip[0]) * 0.3, by + 11];
      var pts = [[sx, sy - 1], [tx, ty], [tx - s * 2, ty + 5], f1, [f1[0] - s * 3, f1[1] - 1], f2, [cx + s * 4, by + 7]];
      P.poly(pts, function (x, y) { var u = Math.abs(x - cx) / Math.max(1, Math.abs(tx - cx)); return ramp(M, 0.55 - u * 0.25 + (y < by ? 0.1 : -0.05), x, y); });
      P.line(sx, sy, tx, ty, 2, function (x, y) { return ramp(R, 0.5, x, y); });
      P.line((sx + tx) / 2, (sy + ty) / 2, f1[0], f1[1], 1, R[1]); P.line(sx, sy, f2[0], f2[1], 1, R[1]);
    });
    P.ell(cx, by + 2, 7, 9, function (x, y, nx, ny) { var s = lit(nx, ny); return ramp(R, 0.15 + s.l * 0.7 + (hash(x, y, 141) > 0.8 ? 0.08 : 0), x, y); });
    P.line(cx - 3, by + 10, cx - 4, by + 13, 1, R[1]); P.line(cx + 3, by + 10, cx + 4, by + 13, 1, R[1]);
    // head, ears, glowing eyes
    P.poly([[cx - 6, by - 7], [cx - 7, by - 16], [cx - 2, by - 10]], R[2]); P.poly([[cx + 6, by - 7], [cx + 7, by - 16], [cx + 2, by - 10]], R[2]);
    P.set(cx - 6, by - 12, M[3]); P.set(cx + 6, by - 12, M[3]);
    P.ell(cx, by - 6, 6.5, 6, function (x, y, nx, ny) { var s = lit(nx, ny); return ramp(R, 0.2 + s.l * 0.7, x, y); });
    if (pose === 'hurt') { P.line(cx - 4, by - 7, cx - 1, by - 6, 1, OUT); P.line(cx + 1, by - 6, cx + 4, by - 7, 1, OUT); }
    else { var g = withGlow(P); [[cx - 3, by - 7], [cx + 2, by - 7]].forEach(function (e) { P.set(e[0], e[1], [255, 80, 60]); P.set(e[0] + 1, e[1], [255, 200, 120]); P.set(e[0], e[1] + 1, [200, 30, 30]); P.set(e[0] + 1, e[1] + 1, [255, 80, 60]); g[e[1] * W + e[0]] = 255; g[e[1] * W + e[0] + 1] = 255; g[(e[1] + 1) * W + e[0]] = 200; g[(e[1] + 1) * W + e[0] + 1] = 255; }); }
    if (mouth) { P.ell(cx, by - 2, 3, pose === 'strike' ? 2.5 : 2, [60, 10, 20]); P.set(cx - 2, by - 3, [250, 250, 245]); P.set(cx + 2, by - 3, [250, 250, 245]); P.set(cx - 2, by - 2, [250, 250, 245]); P.set(cx + 2, by - 2, [250, 250, 245]); }
    else P.set(cx, by - 2, OUT);
    P.outline(OUT); var gl = P.glow; P.glow = gl; return P;
  }
  function knight(pose, pal) {   // a skeleton in a dented breastplate and helm, sword in its right hand, round shield on its left
    var W = 80, H = 96, P = Pix(W, H), B = rampOf(pal.bone), S = RAMPS.iron, Wd = RAMPS.wood, cx = 40, foot = 95;
    var bob = pose === 'idle1' ? 1 : pose === 'hurt' ? 3 : 0, tilt = pose === 'hurt' ? 5 : pose === 'strike' ? -2 : 0;
    var hip = [cx, foot - 30 + bob], neck = [cx + tilt, foot - 52 + bob], head = [cx + tilt * 1.5, foot - 61 + bob];
    function bone(x0, y0, x1, y1, t) { P.line(x0, y0, x1, y1, t, function (x, y, u) { return ramp(B, 0.62 - (x > (x0 + x1) / 2 ? 0.22 : 0) - u * 0.08, x, y); }); P.ell(x1, y1, t * 0.6, t * 0.6, function (x, y) { return ramp(B, 0.7, x, y); }); }
    // legs
    var kneeL = [cx - 7, foot - 15], kneeR = [cx + 7, foot - 15];
    if (pose === 'strike') { kneeL = [cx - 9, foot - 14]; kneeR = [cx + 8, foot - 16]; }
    if (pose === 'hurt') { kneeL = [cx - 10, foot - 13]; kneeR = [cx + 5, foot - 13]; }      // knees buckle, the body rocks back
    bone(hip[0] - 4, hip[1] + 1, kneeL[0], kneeL[1], 3.2); bone(kneeL[0], kneeL[1], cx - 8, foot - 2, 2.8);
    bone(hip[0] + 4, hip[1] + 1, kneeR[0], kneeR[1], 3.2); bone(kneeR[0], kneeR[1], cx + 8, foot - 2, 2.8);
    P.ell(cx - 9, foot - 1, 4, 1.8, function (x, y) { return ramp(S, 0.45, x, y); }); P.ell(cx + 9, foot - 1, 4, 1.8, function (x, y) { return ramp(S, 0.35, x, y); });
    // tattered tabard hanging from the belt
    P.poly([[hip[0] - 8, hip[1] - 3], [hip[0] + 8, hip[1] - 3], [hip[0] + 6, hip[1] + 9], [hip[0] + 2, hip[1] + 6], [hip[0] - 1, hip[1] + 10], [hip[0] - 5, hip[1] + 6], [hip[0] - 7, hip[1] + 8]], function (x, y) { return ramp(RAMPS.cloth.cellar, 0.5 + Math.sin(x * 0.9) * 0.15 - (y - hip[1]) * 0.02, x, y); });
    // spine and breastplate
    bone(cx, hip[1] - 2, neck[0], neck[1] + 2, 3);
    P.poly([[neck[0] - 10, neck[1] + 2], [neck[0] + 10, neck[1] + 2], [cx + 9, hip[1] - 6], [cx, hip[1] - 2], [cx - 9, hip[1] - 6]], function (x, y) {
      var nx = (x - cx) / 10, v = 0.52 - nx * 0.32 + (Math.abs(x + 0.5 - cx) < 1 ? 0.2 : 0) - (y - neck[1]) * 0.006;
      if (hash(x >> 1, y >> 1, 151) > 0.93) v -= 0.18;     // dents
      return ramp(S, v, x, y);
    });
    P.line(neck[0] - 9, neck[1] + 3, neck[0] + 9, neck[1] + 3, 1, S[5]);
    // pauldrons
    P.ell(neck[0] - 10, neck[1] + 4, 4.5, 3.5, function (x, y, nx, ny) { return ramp(S, 0.3 + lit(nx, ny).l * 0.65, x, y); });
    P.ell(neck[0] + 10, neck[1] + 4, 4.5, 3.5, function (x, y, nx, ny) { return ramp(S, 0.2 + lit(nx, ny).l * 0.55, x, y); });
    // sword arm (viewer's left) and the sword, by pose: shoulder -> elbow -> hand, blade from the hand
    var sh = [neck[0] - 11, neck[1] + 5], arm = {
      idle0: [[cx - 17, neck[1] + 13], [cx - 15, neck[1] + 21], -0.32],
      idle1: [[cx - 17, neck[1] + 14], [cx - 15, neck[1] + 22], -0.3],
      wind: [[cx - 16, neck[1] - 6], [cx - 8, neck[1] - 15], -0.12],     // sword raised straight over the helm
      strike: [[cx - 10, neck[1] + 12], [cx + 4, neck[1] + 20], 0.95],
      hurt: [[cx - 21, neck[1] + 6], [cx - 27, neck[1] + 13], -2.2]      // sword arm flung out, blade trailing
    }[pose] || [[cx - 17, neck[1] + 13], [cx - 15, neck[1] + 21], -0.32];
    var el = arm[0], hand = arm[1], ang = arm[2], len = 27, bx = hand[0] + Math.sin(ang) * len, byy = hand[1] - Math.cos(ang) * len;
    // blade (drawn before the arm so the fist covers the grip)
    var px = Math.cos(ang), py = Math.sin(ang);
    P.poly([[hand[0] + px * 2 + Math.sin(ang) * 3, hand[1] + py * 2 - Math.cos(ang) * 3], [bx + px * 1.2, byy + py * 1.2], [bx + Math.sin(ang) * 3, byy - Math.cos(ang) * 3], [bx - px * 1.2, byy - py * 1.2], [hand[0] - px * 2 + Math.sin(ang) * 3, hand[1] - py * 2 - Math.cos(ang) * 3]], function (x, y) {
      var side = (x - hand[0]) * px + (y - hand[1]) * py; return ramp(S, side < 0 ? 0.92 : 0.55, x, y);
    });
    P.line(hand[0] - Math.sin(ang) * 1.5, hand[1] + Math.cos(ang) * 1.5, hand[0] + Math.sin(ang) * 3, hand[1] - Math.cos(ang) * 3, 2.4, function (x, y) { return ramp(Wd, 0.4, x, y); });
    bone(sh[0], sh[1], el[0], el[1], 2.8); bone(el[0], el[1], hand[0], hand[1], 2.6);
    P.ell(hand[0], hand[1], 2.6, 2.6, function (x, y, nx, ny) { return ramp(B, 0.35 + lit(nx, ny).l * 0.5, x, y); });
    // cross-guard just past the fist on the blade side: one solid bar with a lit edge
    var gcx = hand[0] + Math.sin(ang) * 4.2, gcy = hand[1] - Math.cos(ang) * 4.2;
    P.line(gcx - px * 4.5, gcy - py * 4.5, gcx + px * 4.5, gcy + py * 4.5, 2.6, function (x, y) { return ramp(RAMPS.gold, ((x - gcx) * Math.sin(ang) - (y - gcy) * Math.cos(ang)) > 0 ? 0.75 : 0.45, x, y); });
    // shield arm (viewer's right): round shield over the forearm
    var shc = pose === 'hurt' ? [cx + 11, neck[1] + 4] : pose === 'wind' ? [cx + 15, neck[1] + 15] : [cx + 15, neck[1] + 14];
    bone(neck[0] + 11, neck[1] + 5, shc[0] + 2, shc[1] - 2, 2.8);
    P.ell(shc[0], shc[1], 9.5, 11, function (x, y, nx, ny) {
      var r = Math.sqrt(nx * nx + ny * ny), s = lit(nx * 0.6, ny * 0.6);
      if (r > 0.86) return ramp(S, 0.3 + s.l * 0.6, x, y);
      if (r < 0.22) return ramp(RAMPS.gold, 0.35 + s.l * 0.6, x, y);
      var q = Math.abs(nx) < 0.12 || Math.abs(ny) < 0.12; if (q) return ramp(S, 0.45, x, y);
      return ramp(RAMPS.cloth.moss, 0.3 + s.l * 0.55, x, y);
    });
    // skull in a helm: dark eye sockets with cold pin lights
    var hx = head[0], hy = head[1];
    P.ell(hx, hy + 2, 6.2, 6.5, function (x, y, nx, ny) { return ramp(B, 0.3 + lit(nx, ny).l * 0.65, x, y); });
    P.line(hx - 3, hy + 8, hx + 3, hy + 8, 2, function (x, y) { return ramp(B, x % 2 ? 0.3 : 0.6, x, y); });
    P.ell(hx, hy - 1, 7.4, 6, function (x, y, nx, ny) { return ny > 0.35 ? null : ramp(S, 0.3 + lit(nx, ny).l * 0.65, x, y); });
    P.line(hx - 7, hy + 1, hx + 7, hy + 1, 1.6, S[2]);
    P.poly([[hx - 1, hy - 7], [hx + 1, hy - 7], [hx + 2, hy - 13], [hx - 3, hy - 12]], function (x, y) { return ramp(RAMPS.cloth.cellar, 0.6, x, y); });
    var gl = withGlow(P);
    [hx - 3, hx + 2].forEach(function (ex2) {
      P.ell(ex2 + 0.5, hy + 3, 2, 1.7, [16, 10, 14]);
      if (pose !== 'hurt') { P.set(ex2, hy + 3, pal.eye); gl[(hy + 3) * W + ex2] = 255; }
    });
    P.set(hx, hy + 6, [30, 20, 24]);
    P.outline(OUT); return P;
  }
  function item(look, color) {
    var P = Pix(32, 32), c = C3(color || '#d83a3a'), R = [cmul(c, 0.35), cmul(c, 0.6), c, cmul(c, 1.25), cmix(c, [255, 255, 255], 0.55)];
    if (look === 'coins') {
      [[11, 27], [20, 27], [16, 25], [13, 23], [18, 21], [15, 19]].forEach(function (p, i) {
        P.ell(p[0], p[1] + 1, 5, 2.4, RAMPS.gold[1]);
        P.ell(p[0], p[1], 5, 2.4, function (x, y, nx, ny) { return ramp(RAMPS.gold, 0.55 - nx * 0.25 - ny * 0.2 + (i === 5 ? 0.1 : 0), x, y); });
        P.set(p[0] - 1, p[1], RAMPS.gold[2]); P.set(p[0] + 1, p[1], RAMPS.gold[2]);
      });
      P.set(14, 18, [255, 255, 255]); P.set(13, 18, RAMPS.gold[5]); P.set(15, 18, RAMPS.gold[5]); P.set(14, 17, RAMPS.gold[5]);
    } else if (look === 'amulet') {
      P.line(9, 24, 16, 13, 1, RAMPS.gold[3]); P.line(23, 24, 16, 13, 1, RAMPS.gold[2]);
      P.ell(16, 24, 6, 6, function (x, y, nx, ny) { return ramp(RAMPS.gold, 0.5 - nx * 0.3 - ny * 0.3, x, y); });
      P.ell(16, 24, 3.6, 3.6, function (x, y, nx, ny) { var s = lit(nx, ny); return s.spec > 0.5 ? [255, 255, 255] : ramp(R, 0.25 + s.l * 0.75, x, y); });
      var g = withGlow(P); for (var y = 21; y < 28; y++) for (var x = 13; x < 20; x++) if ((x - 16) * (x - 16) + (y - 24) * (y - 24) < 12) g[y * 32 + x] = 120;
    } else {   // flask
      P.ell(16, 22, 8, 8, function (x, y, nx, ny) {
        var s = lit(nx, ny); if (s.spec > 0.55 || (nx < -0.35 && nx > -0.6 && ny < 0 && ny > -0.6)) return [236, 244, 255];
        if (ny < -0.25) return ramp(rampOf(['#2a3440', '#4a5a6a', '#7a8c9c', '#aabccc']), 0.3 + s.l * 0.5, x, y);
        return ramp(R, 0.15 + s.l * 0.85, x, y);
      });
      P.poly([[13.5, 9], [18.5, 9], [18.5, 15], [13.5, 15]], function (x, y) { return ramp(rampOf(['#2a3440', '#4a5a6a', '#7a8c9c', '#aabccc']), x < 16 ? 0.8 : 0.4, x, y); });
      P.poly([[13, 5], [19, 5], [18.5, 9.5], [13.5, 9.5]], function (x, y) { return ramp(RAMPS.wood, x < 16 ? 0.8 : 0.45, x, y); });
      P.line(12.5, 15, 19.5, 15, 1.5, rampOf(['#aabccc'])[0]);
    }
    P.outline(OUT); return P;
  }

  // built-in looks: build(pose, palette) -> Pix; size = world height, lift = world units above the floor (flyers)
  var LOOKS = {
    slime: { build: function (pose, pal) { return slime(pose, pal, false); }, poses: ['idle0', 'idle1', 'wind', 'strike', 'hurt'], size: 0.55, lift: 0 },
    king: { build: function (pose, pal) { return slime(pose, pal, true); }, poses: ['idle0', 'idle1', 'wind', 'strike', 'hurt'], size: 0.95, lift: 0 },
    bat: { build: bat, poses: ['idle0', 'idle1', 'idle2', 'wind', 'strike', 'hurt'], size: 0.42, lift: 0.36 },
    knight: { build: knight, poses: ['idle0', 'idle1', 'wind', 'strike', 'hurt'], size: 1.17, lift: 0 }
  };
  var PALETTES = {
    slime: { ramp: ['#0e2a1a', '#17462a', '#21643a', '#2f8448', '#4aa85c', '#7acc7a', '#b6eca0'], seed: 3 },
    king: { ramp: ['#1a0c2a', '#2c1446', '#422066', '#5a2e8a', '#7a44ac', '#a26ccc', '#d0a8ee'], seed: 9, pupil: [120, 10, 30] },
    bat: { ramp: ['#160e1a', '#2a1a2e', '#3e2840', '#563a54', '#705068'], wing: ['#24141e', '#3c2230', '#5a3646', '#7a4c5c', '#9a6474'] },
    knight: { bone: ['#3a3026', '#6a5e4c', '#9a8c72', '#c8baa0', '#ece2cc'], eye: [120, 230, 255] }
  };
  function spriteFor(look, pose, pal) {
    var A = buildArt(), L = LOOKS[look] || LOOKS.slime, key = look + ':' + pose + ':' + JSON.stringify(pal || null);
    if (A.sprites[key]) return A.sprites[key];
    var p = pal ? Object.assign({}, PALETTES[look] || PALETTES.slime, pal) : (PALETTES[look] || PALETTES.slime);
    var S; try { S = L.build(L.poses.indexOf(pose) >= 0 ? pose : 'idle0', p); } catch (e) { warn('sprite ' + look, e); S = slime('idle0', PALETTES.slime, false); }
    S.foot = footRow(S);
    return (A.sprites[key] = S);
  }
  function itemSprite(look, color) {
    var A = buildArt(), key = 'item:' + look + ':' + color;
    if (A.sprites[key]) return A.sprites[key];
    var S = item(look, color); S.foot = footRow(S); return (A.sprites[key] = S);
  }
  function footRow(S) { for (var y = S.h - 1; y >= 0; y--) for (var x = 0; x < S.w; x++) if (S.d[(y * S.w + x) * 4 + 3]) return y; return S.h - 1; }

  /* ---------- the hero's sword (first person), rasterised at the view's size per pose ---------- */
  // the swept arc of a strike: a thin tapered streak along the tip's path, behind the blade and apart from it; alpha 0..255
  function smearRaster(S) {
    var W = Math.round(S * 1.5), H = S, P = Pix(W, H), hx = 0.56 * W, hy = 0.96 * H, a = -1.12, len = 0.86 * H, a0 = a + 0.02, a1 = a + 1.05;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var dx = x + 0.5 - hx, dy = y + 0.5 - hy, rr = Math.sqrt(dx * dx + dy * dy), an = Math.atan2(dx, -dy);
      if (an < a0 || an > a1) continue;
      var t = (an - a0) / (a1 - a0), thick = Math.max(1, len * 0.09 * (1 - t)), r1 = len * (1.0 - 0.05 * t);
      if (rr > r1 || rr < r1 - thick) continue;
      var edge = rr > r1 - 1.2 ? 1 : 0.75;
      P.set(x, y, t < 0.35 ? [236, 242, 252] : [190, 206, 232], Math.round(235 * (1 - t) * edge));
    }
    return P;
  }
  function swordRaster(S, pose) {   // S = box height in logical px; the hand sits at the lower right, the blade points up-left
    var W = Math.round(S * 1.5), H = S, P = Pix(W, H), St = RAMPS.iron;
    var poses = {   // hand x, hand y (fractions of the box), blade angle from straight up (radians, negative = leans left), length
      idle: [0.78, 0.98, -0.34, 0.9], wind: [0.9, 0.74, 0.34, 0.9], strike: [0.56, 0.96, -1.12, 0.86], recover: [0.72, 1.0, -0.55, 0.88], hurt: [0.84, 1.12, -0.18, 0.9], block: [0.6, 0.86, -1.2, 0.92]
    };
    var q = poses[pose] || poses.idle, hx = q[0] * W, hy = q[1] * H, a = q[2], len = q[3] * H, ux = Math.sin(a), uy = -Math.cos(a), vx = -uy, vy = ux;
    var bw = Math.max(2, H * 0.055), tipx = hx + ux * len, tipy = hy + uy * len, gx = hx + ux * H * 0.12, gy = hy + uy * H * 0.12;
    // blade: two-tone with a fuller, edge highlight
    P.poly([[gx + vx * bw, gy + vy * bw], [tipx - ux * bw * 2 + vx * bw * 0.8, tipy - uy * bw * 2 + vy * bw * 0.8], [tipx, tipy], [tipx - ux * bw * 2 - vx * bw * 0.8, tipy - uy * bw * 2 - vy * bw * 0.8], [gx - vx * bw, gy - vy * bw]], function (x, y) {
      var s = (x + 0.5 - hx) * vx + (y + 0.5 - hy) * vy, along = (x + 0.5 - hx) * ux + (y + 0.5 - hy) * uy;
      if (Math.abs(s) < bw * 0.22 && along < len * 0.78) return ramp(St, 0.36, x, y);
      return ramp(St, s < 0 ? 0.98 : 0.62 - along / len * 0.08, x, y);
    });
    // cross-guard, grip, pommel
    var gl = H * 0.16; P.line(gx - vx * gl, gy - vy * gl, gx + vx * gl, gy + vy * gl, Math.max(2, H * 0.05), function (x, y) { return ramp(RAMPS.gold, ((x - gx) * vx + (y - gy) * vy) < 0 ? 0.8 : 0.45, x, y); });
    P.line(gx - ux * H * 0.02, gy - uy * H * 0.02, hx - ux * H * 0.1, hy - uy * H * 0.1, Math.max(2, H * 0.06), function (x, y) { return ramp(RAMPS.wood, hash(x, y, 171) > 0.5 ? 0.5 : 0.3, x, y); });
    P.ell(hx - ux * H * 0.12, hy - uy * H * 0.12, H * 0.035, H * 0.035, RAMPS.gold[4]);
    // gauntlet around the grip: a fist with knuckle plates, the forearm going down out of the box
    var fx = hx - ux * H * 0.02, fy = hy - uy * H * 0.02, fr = H * 0.085;
    P.line(fx, fy, fx + H * 0.35, fy + H * 0.5, H * 0.13, function (x, y) { return ramp(St, 0.35 + (((x - fx) * 0.82 - (y - fy) * 0.57) < 0 ? 0.25 : 0), x, y); });
    P.ell(fx, fy, fr * 1.15, fr, function (x, y, nx, ny) { var s = lit(nx, ny); return ramp(St, 0.25 + s.l * 0.7, x, y); });
    for (var j = -1; j <= 1; j++) P.ell(fx + vx * fr * 0.55 * j - ux * fr * 0.55, fy + vy * fr * 0.55 * j - uy * fr * 0.55, fr * 0.36, fr * 0.36, function (x, y, nx, ny) { return ramp(St, 0.45 + lit(nx, ny).l * 0.5, x, y); });
    P.outline(OUT);
    return P;
  }

  /* =====================================================================================================
     The raycaster (pure: works on plain arrays, no canvas). One DDA ray per screen column; the wall distance is the
     PERPENDICULAR distance to the camera plane (no fisheye); doors are planes at the middle of their cell, slid open
     sideways; floors and ceilings are cast per pixel; billboards are drawn column by column against the wall depth.
     cam = {x, y, a (radians), fov (degrees), bob (px), time (ms)}; map = a floor (m1) with doorOpen (0..1 per cell).
     ===================================================================================================== */
  // floor and ceiling textures are shifted a quarter cell: their grout lines and beam gaps sit at 0.25 / 0.75 of a cell,
  // never on a cell's centre line, where the eye stands (a seam there runs from the feet to the horizon)
  var TEXOFF = 0.25;
  function camBasis(cam, W) {
    var half = Math.tan((num(cam.fov, 72) * Math.PI / 180) / 2), dx = Math.cos(cam.a), dy = Math.sin(cam.a);
    return { dx: dx, dy: dy, rx: -dy, ry: dx, half: half, f: (W / 2) / half };
  }
  // cast one ray per column; out = {zbuf, side, cx, cy, u, kind, px, py} typed arrays of length W (reused)
  function castColumns(map, cam, W, out) {
    var B = camBasis(cam, W), i;
    if (!out || out.W !== W) out = { W: W, zbuf: new Float32Array(W), side: new Uint8Array(W), cx: new Int16Array(W), cy: new Int16Array(W), u: new Float32Array(W), kind: new Uint8Array(W), px: new Int16Array(W), py: new Int16Array(W), hit: new Uint8Array(W) };
    out.noHit = 0;
    for (var col = 0; col < W; col++) {
      var camX = ((col + 0.5) / W) * 2 - 1, rdx = B.dx + B.rx * B.half * camX, rdy = B.dy + B.ry * B.half * camX;
      var mx = Math.floor(cam.x), my = Math.floor(cam.y), ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx), ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
      var sx, sy, sdx, sdy, side = 0, hit = 0, perp = 0, u = 0, kind = 0, px = mx, py = my;
      if (rdx < 0) { sx = -1; sdx = (cam.x - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - cam.x) * ddx; }
      if (rdy < 0) { sy = -1; sdy = (cam.y - my) * ddy; } else { sy = 1; sdy = (my + 1 - cam.y) * ddy; }
      for (i = 0; i < 256 && !hit; i++) {
        px = mx; py = my;
        if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
        var t = cellAt(map, mx, my);
        if (t === FLOOR) continue;
        if (t === DOOR) {   // the door plane sits half a cell in; it slides open along its plane
          var open = map.doorOpen ? map.doorOpen[my * map.w + mx] : 0, pd, w2;
          if (side === 0) { pd = sdx - ddx * 0.5; if (pd > sdy) continue; w2 = cam.y + pd * rdy; }
          else { pd = sdy - ddy * 0.5; if (pd > sdx) continue; w2 = cam.x + pd * rdx; }
          w2 -= Math.floor(w2);
          if (w2 < open) continue;
          hit = 1; perp = pd; u = w2 - open; kind = DOOR; break;
        }
        hit = 1; kind = t;
        perp = side === 0 ? sdx - ddx : sdy - ddy;
        var wx = side === 0 ? cam.y + perp * rdy : cam.x + perp * rdx; u = wx - Math.floor(wx);
        if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) u = 1 - u;      // textures read left to right on every face
      }
      if (!hit) { out.noHit++; out.hit[col] = 0; out.zbuf[col] = 1e9; continue; }
      out.hit[col] = 1; out.zbuf[col] = Math.max(1e-4, perp); out.side[col] = side; out.cx[col] = mx; out.cy[col] = my; out.u[col] = u; out.kind[col] = kind; out.px[col] = px; out.py[col] = py;
    }
    out.f = B.f; out.B = B;
    return out;
  }
  // light map: per cell RGB light from torches, spread over floor cells (walls stop it), 0..~1.4
  function buildLightMap(map) {
    var n = map.w * map.h, L = new Float32Array(n * 3), x, y, k;
    for (y = 0; y < map.h; y++) for (x = 0; x < map.w; x++) {
      if (map.cells[y * map.w + x] !== TORCH) continue;
      // BFS from the floor cells in front of the torch, up to 5 steps
      var dist = {}, q = [];
      for (k = 0; k < 4; k++) { var fx = x + DX[k], fy = y + DY[k]; if (cellAt(map, fx, fy) === FLOOR || cellAt(map, fx, fy) === DOOR) { dist[fx + ',' + fy] = 0.6; q.push([fx, fy]); } }
      for (var h = 0; h < q.length; h++) {
        var c = q[h], d = dist[c[0] + ',' + c[1]], e = Math.sqrt((c[0] - x) * (c[0] - x) + (c[1] - y) * (c[1] - y));
        var amt = Math.max(0, 1 - e / 5.2); amt = amt * amt * 0.95;
        var i3 = (c[1] * map.w + c[0]) * 3; L[i3] += amt; L[i3 + 1] += amt * 0.62; L[i3 + 2] += amt * 0.3;
        if (d >= 5) continue;
        for (k = 0; k < 4; k++) { var nx = c[0] + DX[k], ny = c[1] + DY[k], t = cellAt(map, nx, ny); if ((t === FLOOR || t === DOOR) && dist[nx + ',' + ny] == null) { dist[nx + ',' + ny] = d + 1; q.push([nx, ny]); } }
      }
    }
    for (var j = 0; j < n * 3; j++) L[j] = Math.min(1.4, L[j]);
    return L;
  }
  function sampleLight(map, LM, wx, wy, out) {   // bilinear between cell centres
    var fx = wx - 0.5, fy = wy - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, r = 0, g = 0, b = 0;
    for (var k = 0; k < 4; k++) {
      var cx = x0 + (k & 1), cy = y0 + (k >> 1), wgt = ((k & 1) ? tx : 1 - tx) * ((k >> 1) ? ty : 1 - ty);
      if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) continue;
      var i3 = (cy * map.w + cx) * 3; r += LM[i3] * wgt; g += LM[i3 + 1] * wgt; b += LM[i3 + 2] * wgt;
    }
    out[0] = r; out[1] = g; out[2] = b; return out;
  }

  // render the 3D view into rgba (Uint8ClampedArray W*H*4). env = {art, theme, LM, lantern, fog, ambient, flicker}
  // sprites = [{id, x, y, spr (Pix), size, lift, flash, dissolve, bright}]; returns {cols, spriteBoxes}
  function renderView(rgba, W, H, map, cam, env, sprites, cols) {
    cols = castColumns(map, cam, W, cols);
    var B = cols.B, f = cols.f, hor = H / 2 + (cam.bob || 0), T = THEMES[map.theme] || THEMES.cellar, A = env.art || buildArt();
    var tint = T.tint, amb = num(env.ambient, T.ambient), fogC = rgb(env.fogColor || T.fog), dens = num(env.fog, 0.2), lanR = num(env.lantern, 4.5), flick = num(env.flicker, 1);
    var wallTex = A.walls[map.theme] || A.walls.cellar, flo = A.floor[map.theme] || A.floor.cellar, cei = A.ceil[map.theme] || A.ceil.cellar, torchF = A.torch[map.theme] || A.torch.cellar;
    var LM = env.LM, lt = [0, 0, 0], tframe = Math.floor(num(cam.time, 0) / 110);
    function lantern(d) { var v = 0.98 / (1 + (d * d) / (lanR * lanR) * 7); return v * flick; }
    function shadePx(o, tr, tg, tb, d, lr, lg, lb, glow) {   // texel * light, then fog
      var fogT = 1 - Math.exp(-d * dens);
      if (glow) { var gk = glow / 255; lr = lr + (1.25 - lr) * gk; lg = lg + (1.25 - lg) * gk; lb = lb + (1.25 - lb) * gk; fogT *= 1 - gk * 0.85; }
      var r = tr * lr, g = tg * lg, b = tb * lb;
      rgba[o] = r + (fogC[0] - r) * fogT; rgba[o + 1] = g + (fogC[1] - g) * fogT; rgba[o + 2] = b + (fogC[2] - b) * fogT; rgba[o + 3] = 255;
    }
    var rowDist = new Float32Array(H);
    for (var y = 0; y < H; y++) { var dy = Math.abs(y + 0.5 - hor); rowDist[y] = dy < 0.5 ? 1e6 : (f * 0.5) / dy; }
    for (var col = 0; col < W; col++) {
      var camX = ((col + 0.5) / W) * 2 - 1, rdx = B.dx + B.rx * B.half * camX, rdy = B.dy + B.ry * B.half * camX;
      var hasHit = cols.hit[col], d = cols.zbuf[col], lineH = hasHit ? f / d : 0, top = hor - lineH / 2, bot = hor + lineH / 2;
      var y0 = hasHit ? Math.max(0, Math.ceil(top - 0.5)) : Math.ceil(hor), y1 = hasHit ? Math.min(H - 1, Math.ceil(bot - 0.5) - 1) : Math.ceil(hor) - 1;
      // wall slice
      if (hasHit) {
        var kind = cols.kind[col], cx = cols.cx[col], cy = cols.cy[col], tx;
        var tex2 = kind === DOOR ? A.door : kind === STAIRS ? (A.stairs[map.theme] || A.stairs.cellar) : kind === TORCH ? torchF[(tframe + ((cx * 7 + cy * 3) % 3)) % 3] : kind === BANNER ? (A.banner[map.theme] || wallTex) : wallTex;
        tx = clamp(Math.floor(cols.u[col] * tex2.w), 0, tex2.w - 1);
        // light: the cell in front of the face, the lantern, side shade
        var hx = cam.x + rdx * d, hy = cam.y + rdy * d;
        sampleLight(map, LM, hx - rdx * 0.02 + (cols.px[col] + 0.5 - hx) * 0.4, hy - rdy * 0.02 + (cols.py[col] + 0.5 - hy) * 0.4, lt);
        var sk = cols.side[col] ? 0.78 : 1, ln = lantern(d), lr = (amb * tint[0] + ln + lt[0] * flick) * sk, lg = (amb * tint[1] + ln * 0.82 + lt[1] * flick) * sk, lb = (amb * tint[2] + ln * 0.62 + lt[2] * flick) * sk;
        for (y = y0; y <= y1; y++) {
          var ty = clamp(Math.floor((y + 0.5 - top) / lineH * tex2.h), 0, tex2.h - 1), ti = (ty * tex2.w + tx), t4 = ti * 4, o = (y * W + col) * 4;
          shadePx(o, tex2.d[t4], tex2.d[t4 + 1], tex2.d[t4 + 2], d, lr, lg, lb, tex2.glow ? tex2.glow[ti] : 0);
        }
      }
      // floor (below the wall) and ceiling (above it)
      for (y = y1 + 1; y < H; y++) {
        var rd = rowDist[y]; if (rd > 1e5) continue;
        var wx2 = cam.x + rdx * rd, wy2 = cam.y + rdy * rd, fxp = ((Math.floor((wx2 + TEXOFF) * flo.w) % flo.w) + flo.w) % flo.w, fyp = ((Math.floor((wy2 + TEXOFF) * flo.h) % flo.h) + flo.h) % flo.h, fi = fyp * flo.w + fxp;
        sampleLight(map, LM, wx2, wy2, lt); var l2 = lantern(rd);
        shadePx((y * W + col) * 4, flo.d[fi * 4], flo.d[fi * 4 + 1], flo.d[fi * 4 + 2], rd, amb * tint[0] + l2 + lt[0] * flick, amb * tint[1] + l2 * 0.82 + lt[1] * flick, amb * tint[2] + l2 * 0.62 + lt[2] * flick, flo.glow ? flo.glow[fi] : 0);
      }
      for (y = 0; y < y0; y++) {
        var rc = rowDist[y]; if (rc > 1e5) continue;
        var wx3 = cam.x + rdx * rc, wy3 = cam.y + rdy * rc, cxp = ((Math.floor((wx3 + TEXOFF) * cei.w) % cei.w) + cei.w) % cei.w, cyp = ((Math.floor((wy3 + TEXOFF) * cei.h) % cei.h) + cei.h) % cei.h, ci = cyp * cei.w + cxp;
        sampleLight(map, LM, wx3, wy3, lt); var l3 = lantern(rc) * 0.8;
        shadePx((y * W + col) * 4, cei.d[ci * 4], cei.d[ci * 4 + 1], cei.d[ci * 4 + 2], rc, (amb * tint[0] + l3 + lt[0] * 0.7 * flick) * 0.85, (amb * tint[1] + l3 * 0.82 + lt[1] * 0.7 * flick) * 0.85, (amb * tint[2] + l3 * 0.62 + lt[2] * 0.7 * flick) * 0.85, 0);
      }
      // a row exactly on the horizon (no wall in this column): fog colour
      var hr = Math.floor(hor); if (!hasHit && hr >= 0 && hr < H) { var oh = (hr * W + col) * 4; rgba[oh] = fogC[0]; rgba[oh + 1] = fogC[1]; rgba[oh + 2] = fogC[2]; rgba[oh + 3] = 255; }
    }
    // billboards, far to near, each column tested against the wall depth
    var boxes = {}, list = (sprites || []).map(function (s) { var rx = s.x - cam.x, ry = s.y - cam.y; return { s: s, depth: rx * B.dx + ry * B.dy, lat: rx * B.rx + ry * B.ry }; }).filter(function (o) { return o.depth > 0.2; });
    list.sort(function (a, b) { return b.depth - a.depth; });
    list.forEach(function (o) {
      var s = o.s, S = s.spr; if (!S) return;
      var dep = o.depth, scx = W / 2 + f * o.lat / dep - 0.5, artH = S.foot + 1, hpx = f * s.size / dep, scale = hpx / artH, wpx = S.w * scale;
      var footY = hor + f * (0.5 - num(s.lift, 0)) / dep, topY = footY - artH * scale, left = scx - wpx / 2 + 0.5;
      var c0 = Math.max(0, Math.floor(left)), c1 = Math.min(W - 1, Math.ceil(left + wpx) - 1), r0 = Math.max(0, Math.floor(topY)), r1 = Math.min(H - 1, Math.ceil(footY) - 1);
      sampleLight(map, LM, s.x, s.y, lt);
      var ln = lantern(dep), lr = amb * tint[0] + ln + lt[0] * flick + 0.08, lg = amb * tint[1] + ln * 0.82 + lt[1] * flick + 0.08, lb = amb * tint[2] + ln * 0.62 + lt[2] * flick + 0.08, br = num(s.bright, 1);
      lr *= br; lg *= br; lb *= br;
      var bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9, vis = 0, dis = num(s.dissolve, 0);
      for (var c = c0; c <= c1; c++) {
        if (!(dep < cols.zbuf[c])) continue;      // a wall in this column is nearer: hidden
        var u = clamp(Math.floor((c + 0.5 - left) / scale), 0, S.w - 1), any = false;
        for (var r = r0; r <= r1; r++) {
          var v = Math.floor((r + 0.5 - topY) / scale); if (v < 0 || v >= artH) continue;
          var si = v * S.w + u, a = S.d[si * 4 + 3]; if (!a) continue;
          if (dis > 0 && hash(u >> 1, v >> 1, 7) < dis) continue;
          var oi = (r * W + c) * 4;
          if (s.flash) { rgba[oi] = 255; rgba[oi + 1] = 255; rgba[oi + 2] = 255; rgba[oi + 3] = 255; }
          else shadePx(oi, S.d[si * 4], S.d[si * 4 + 1], S.d[si * 4 + 2], dep, lr, lg, lb, S.glow ? S.glow[si] : 0);
          any = true; if (r < by0) by0 = r; if (r > by1) by1 = r;
        }
        if (any) { vis++; if (c < bx0) bx0 = c; if (c > bx1) bx1 = c; }
      }
      if (s.id != null) boxes[s.id] = { x: left, y: topY, w: wpx, h: footY - topY, depth: dep, visCols: vis, drawn: vis ? { x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 } : null };
    });
    return { cols: cols, boxes: boxes, horizon: hor, f: f };
  }
  // project a world point to the view (no drawing): {x, y (floor line), depth, scale}; null when behind the camera
  function project(cam, W, H, wx, wy, z) {
    var B = camBasis(cam, W), rx = wx - cam.x, ry = wy - cam.y, dep = rx * B.dx + ry * B.dy; if (dep <= 0.05) return null;
    var hor = H / 2 + (cam.bob || 0);
    return { x: W / 2 + B.f * (rx * B.rx + ry * B.ry) / dep, y: hor + B.f * (0.5 - (z || 0)) / dep, depth: dep, f: B.f, horizon: hor };
  }

  /* =====================================================================================================
     Content tables (the built-ins; games add their own through addEnemy / addItem / addMap or the create options)
     ===================================================================================================== */
  var ENEMIES = {
    slime: { name: 'Gloom Slime', look: 'slime', hp: 9, atk: 3, def: 0, xp: 3, speed: 1, sight: 5, evade: 0.04, acc: 0.78, weight: 4, minFloor: 1, maxFloor: 2 },
    bat: { name: 'Cave Bat', look: 'bat', hp: 6, atk: 2, def: 0, xp: 3, speed: 1.5, sight: 6, evade: 0.22, acc: 0.8, erratic: 0.3, weight: 3, minFloor: 1, maxFloor: 3 },
    knight: { name: 'Grave Knight', look: 'knight', hp: 15, atk: 5, def: 1, xp: 7, speed: 1, sight: 6, evade: 0.08, acc: 0.8, weight: 3, minFloor: 2, maxFloor: 3 },
    king: { name: 'The Mire King', look: 'king', boss: true, hp: 40, atk: 6, def: 1, xp: 30, speed: 1, sight: 7, evade: 0.04, acc: 0.82, weight: 0 }
  };
  var ITEMS = {
    potion: { name: 'Red Tonic', look: 'flask', color: '#d83a3a', effect: { heal: 14 }, carry: true, weight: 4 },
    gold: { name: 'Gold', look: 'coins', effect: { gold: 10 }, weight: 4 },
    charm: { name: 'Ward Charm', look: 'amulet', color: '#4a9cff', effect: { def: 1 }, weight: 1, minFloor: 2 },
    fang: { name: 'Fang Charm', look: 'amulet', color: '#ff6a4a', effect: { atk: 1 }, weight: 1, minFloor: 1 }
  };
  var XP_STEPS = [0, 10, 26, 48, 78, 120];
  var DIE_MS = 1200;   // a felled monster crumbles this long (as long as a damage number lives, so the number stays over its own body)
  var COLORS = { dmg: '#ffffff', crit: '#ffd24a', miss: '#9ab4d8', hurt: '#ff6a5a', heal: '#7af08a', ink: '#f4ead8', dim: '#a898b0', panel: '#16101e', edge: '#5c4a78', gold: '#e8b848' };

  function create(options) {
    options = options || {};
    var A = buildArt();
    var P = Object.assign({ floors: 3, size: 15, rooms: 4, loops: 0.12, doors: 0.5, density: 1, loot: 1, torches: 1, fov: 76, eyeBack: 0.32, fog: 0.24, lantern: 4.5, minimap: 'on', numbers: 'on', stepMs: 170, turnMs: 150, startPotions: 2 }, options.params || {});
    var lib = { enemies: Object.assign({}, ENEMIES, copy(options.enemies) || {}), items: Object.assign({}, ITEMS, copy(options.items) || {}), maps: Object.assign({}, options.maps || {}) };
    var view = Object.assign({ x: 0, y: 0, w: 320, h: 200 }, options.view || {});
    var S = null, seed = (options.seed >>> 0) || 1, auto = false, held = {}, keyQ = [];
    var cols = null, rgbaBuf = null, img = null, off = null, offG = null, lastBoxes = {}, swordCache = {};
    var hudRect = null, miniRect = null, logRect = null, bannerRect = null, mapRect = null, potRect = null;

    function cb(name, a, b) { return safe(options[name], [a, b], name); }
    function ev(o) { cb('onEvent', o); }
    function field() { var hh = hudH(); return { x: view.x, y: view.y, w: view.w, h: Math.max(60, view.h - hh) }; }
    function hudH() { return view.w < 300 ? 30 : 26; }

    /* ---------------- run / floor setup ---------------- */
    function start(o) {
      o = o || {}; if (o.seed != null) seed = o.seed >>> 0;
      S = { seed: seed, floorN: 0, floors: Math.max(1, Math.round(num(P.floors, 3))), rng: rng(seed * 2654435761 + 1), crng: rng(seed * 40503 + 99), time: 0, turn: 0, phase: 'play', ended: false,
        hero: { x: 0, y: 0, dir: 0, hp: 34, maxHp: 34, atk: 5, def: 0, lvl: 1, xp: 0, potions: Math.max(0, num(P.startPotions, 1)), gold: 0, kills: 0 },
        act: null, queue: [], think: 0, labels: [], log: [], banner: null, hurtT: 0, indicators: [], fade: 0, mapOpen: false, nextId: 1, swing: null, sway: 0, flick: 1, events: 0 };
      nextFloor();
    }
    function chooseMap(floor) {
      var keys = Object.keys(lib.maps).filter(function (k) { var d = lib.maps[k]; return d && num(d.floor, -1) === floor; });
      if (keys.length) return parseMap(lib.maps[keys[0]], floor, S.floors);
      return generateFloor(S.seed, floor, S.floors, P, lib);
    }
    function pickKind(table, floor, r, bossOk) {
      var list = Object.keys(table).filter(function (k) { var d = table[k]; return d && (!d.boss || bossOk) && num(d.weight, 1) > 0 && floor >= num(d.minFloor, 1) && floor <= num(d.maxFloor, 99); });
      return weighted(r, list, function (k) { return num(table[k].weight, 1); });
    }
    function nextFloor() {
      S.floorN++; var m = chooseMap(S.floorN), r = rng(S.seed * 7 + S.floorN * 101);
      m.doorOpen = new Float32Array(m.w * m.h); m.doorGoal = new Float32Array(m.w * m.h);
      S.map = m; S.LM = buildLightMap(m); S.explored = new Uint8Array(m.w * m.h); S.seen = new Uint8Array(m.w * m.h);
      var H = S.hero; H.x = m.start.x; H.y = m.start.y; H.dir = m.start.dir; S.cam = { x: H.x + 0.5, y: H.y + 0.5, a: dirAngle(H.dir) };
      S.enemies = []; S.items = [];
      m.spawns.forEach(function (sp) {
        var kind = sp.kind || (sp.boss ? (Object.keys(lib.enemies).filter(function (k) { return lib.enemies[k] && lib.enemies[k].boss; })[0] || 'king') : pickKind(lib.enemies, S.floorN, r, false));
        var d = lib.enemies[kind]; if (!d) return;
        S.enemies.push({ id: 'e' + (S.nextId++), kind: kind, def: d, x: sp.x, y: sp.y, fx: sp.x, fy: sp.y, mt: 1, hp: num(d.hp, 8), maxHp: num(d.hp, 8), awake: false, energy: 0, pose: 'idle', poseT: 0, flash: 0, hurtT: 0, dodgeT: 0, lunge: 0, dying: 0, gone: false, boss: !!d.boss, phase0: r() * 1000 });
      });
      m.items.forEach(function (it) {
        var kind = it.kind || pickKind(lib.items, S.floorN, r, false), d = lib.items[kind]; if (!d) return;
        S.items.push({ id: 'i' + (S.nextId++), kind: kind, def: d, x: it.x, y: it.y, taken: false });
      });
      S.labels = []; S.act = null; S.queue = []; S.fade = 1; S.indicators = []; S.mapOpen = false;
      S.banner = { t: 0, title: 'FLOOR ' + S.floorN + (m.last ? ' - THE LAST' : ''), sub: m.name };
      look();
      ev({ kind: 'floorStart', floor: S.floorN, floors: S.floors, name: m.name, theme: m.theme, last: m.last, enemies: S.enemies.map(function (e) { return e.kind; }), items: S.items.map(function (i) { return i.kind; }), start: { x: m.start.x, y: m.start.y }, stairs: m.stairs ? { x: m.stairs.x, y: m.stairs.y } : null, map: m.generated ? null : true });
      say(m.name, COLORS.gold);
    }
    function dirAngle(d) { return Math.atan2(DY[d], DX[d]); }

    /* ---------------- grid rules ---------------- */
    function doorOpen(x, y) { return S.map.doorOpen[y * S.map.w + x] >= 0.999; }
    function passable(x, y) { var t = cellAt(S.map, x, y); return t === FLOOR || (t === DOOR && doorOpen(x, y)); }
    function enemyAt(x, y) { for (var i = 0; i < S.enemies.length; i++) { var e = S.enemies[i]; if (!e.gone && !e.dying && e.x === x && e.y === y) return e; } return null; }
    function los(ax, ay, bx, by) {   // grid line of sight between cell centres (walls and closed doors block)
      var x0 = ax + 0.5, y0 = ay + 0.5, dx = bx - ax, dy = by - ay, n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 3);
      for (var i = 1; i < n; i++) { var x = Math.floor(x0 + dx * i / n), y = Math.floor(y0 + dy * i / n); if ((x !== ax || y !== ay) && (x !== bx || y !== by) && !passable(x, y)) return false; }
      return true;
    }
    function front() { var H = S.hero; return { x: H.x + DX[H.dir], y: H.y + DY[H.dir] }; }

    /* ---------------- messages, labels, banner ---------------- */
    function say(text, color) { S.log.push({ text: text, color: color || COLORS.ink, t: 0, y: null }); if (S.log.length > 4) S.log.shift(); }
    function bare(n) { n = String(n || 'Monster'); return /^the /i.test(n) ? n.slice(4) : n; }
    function the(n) { n = String(n || 'monster'); return /^the /i.test(n) ? 'the ' + n.slice(4) : 'the ' + n; }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function label(owner, text, color, kind) {
      if (P.numbers === 'off' && kind !== 'word') return;
      S.labels.push({ id: S.nextId++, owner: owner, text: String(text), color: color, kind: kind, t: 0, life: kind === 'crit' ? 1050 : 900, x: null, y: null, tx: null, ty: null, shown: false, hidden: false, w: measure(String(text)) + 6, h: 12, slot: null });
    }

    /* ---------------- input ---------------- */
    var ACTIONS = { up: 1, down: 1, left: 1, right: 1, strafeleft: 1, straferight: 1, attack: 1, wait: 1, potion: 1, map: 1, ok: 1 };
    function key(k) { if (!S || !ACTIONS[k]) return false; if (k === 'map') { S.mapOpen = !S.mapOpen; return true; } if (k === 'ok') k = 'attack'; if (S.queue.length < 2) S.queue.push(k); return true; }
    function pointer(type, x, y) {
      if (!S || type !== 'down') return false;
      var F = field();
      if (miniRect && x >= miniRect.x && y >= miniRect.y && x < miniRect.x + miniRect.w && y < miniRect.y + miniRect.h) return key('map');
      if (potRect && x >= potRect.x && y >= potRect.y && x < potRect.x + potRect.w && y < potRect.y + potRect.h) return key('potion');
      if (S.mapOpen) { S.mapOpen = false; return true; }
      if (y < F.y || y >= F.y + F.h || x < F.x || x >= F.x + F.w) return false;
      var u = (x - F.x) / F.w, v = (y - F.y) / F.h, f0 = front();
      if (u < 0.22) return key('left'); if (u > 0.78) return key('right');
      if (enemyAt(f0.x, f0.y)) return key('attack');
      return key(v > 0.8 ? 'down' : 'up');
    }

    /* ---------------- actions (the hero's turn) ---------------- */
    function begin(k) {
      var H = S.hero, d = H.dir, mv = null;
      if (k === 'left' || k === 'right') { var nd = (d + (k === 'right' ? 1 : 3)) % 4; S.act = { kind: 'turn', t: 0, dur: num(P.turnMs, 150), a0: dirAngle(d), a1: dirAngle(d) + (k === 'right' ? Math.PI / 2 : -Math.PI / 2) }; H.dir = nd; return; }
      if (k === 'up') mv = d; else if (k === 'down') mv = (d + 2) % 4; else if (k === 'strafeleft') mv = (d + 3) % 4; else if (k === 'straferight') mv = (d + 1) % 4;
      if (mv != null) {
        var tx = H.x + DX[mv], ty = H.y + DY[mv], t = cellAt(S.map, tx, ty), e = enemyAt(tx, ty);
        if (e && mv === d) { attack(); return; }
        if (e) { S.act = { kind: 'bump', t: 0, dur: 140, dx: DX[mv], dy: DY[mv] }; say('Blocked.', COLORS.dim); return; }
        if (t === DOOR && !doorOpen(tx, ty)) { S.map.doorGoal[ty * S.map.w + tx] = 1; S.act = { kind: 'door', t: 0, dur: 330, x: tx, y: ty, turn: true }; ev({ kind: 'door', x: tx, y: ty }); say('The door grinds open.', COLORS.dim); return; }
        if (t === STAIRS) {
          if (S.map.last) { S.act = { kind: 'bump', t: 0, dur: 140, dx: DX[mv], dy: DY[mv] }; return; }
          S.act = { kind: 'descend', t: 0, dur: 620 }; ev({ kind: 'descend', floor: S.floorN }); say('You go down the stairs.', COLORS.gold); return;
        }
        if (!passable(tx, ty)) { S.act = { kind: 'bump', t: 0, dur: 140, dx: DX[mv], dy: DY[mv] }; return; }
        var from = { x: H.x, y: H.y }; H.x = tx; H.y = ty;
        S.act = { kind: 'move', t: 0, dur: num(P.stepMs, 170), x0: from.x + 0.5, y0: from.y + 0.5, turn: true };
        ev({ kind: 'move', id: 'hero', from: from, x: tx, y: ty });
        return;
      }
      if (k === 'attack') { attack(); return; }
      if (k === 'potion') {
        if (H.potions <= 0) { say('No tonics left.', COLORS.dim); return; }
        if (H.hp >= H.maxHp) { say('You are unhurt.', COLORS.dim); return; }
        H.potions--; S.act = { kind: 'potion', t: 0, dur: 420, at: 220, done: false, turn: true }; ev({ kind: 'potion', left: H.potions }); return;
      }
      if (k === 'wait') { S.act = { kind: 'wait', t: 0, dur: 120, turn: true }; return; }
    }
    function attack() { var f0 = front(); S.act = { kind: 'attack', t: 0, dur: 330, at: 150, done: false, turn: true, tx: f0.x, ty: f0.y }; ev({ kind: 'attack', id: 'hero', x: f0.x, y: f0.y }); }
    function heroStrike(a) {
      var e = enemyAt(a.tx, a.ty), H = S.hero; if (!e) return;
      var d = e.def, r = S.crng, hitP = 0.9 - num(d.evade, 0.05);
      if (!e.awake) { e.awake = true; ev({ kind: 'wake', id: e.id }); }
      if (r() >= hitP) { e.dodgeT = 1; label(e.id, 'MISS', COLORS.miss, 'miss'); hitEvent('hero', e, 0, 0, false, true); say('You miss: ' + bare(d.name) + '.', COLORS.dim); return; }
      var crit = r() < 0.12, raw = H.atk + r.int(0, 2), amt = Math.max(1, raw - num(d.def, 0)); if (crit) amt = Math.ceil(amt * 1.5);
      var before = e.hp; e.hp = Math.max(0, e.hp - amt); amt = before - e.hp;
      e.flash = 3; e.hurtT = 260; var killed = e.hp <= 0;
      label(e.id, crit ? amt + '!' : amt, crit ? COLORS.crit : COLORS.dmg, crit ? 'crit' : 'damage');
      hitEvent('hero', e, raw, amt, crit, false, before, killed);
      if (killed) kill(e); else say(crit ? 'A critical hit!' : 'You hit: ' + bare(d.name) + '.', crit ? COLORS.crit : COLORS.ink);
    }
    function hitEvent(src, e, raw, amt, crit, miss, before, killed) {
      var h = { kind: 'damage', source: src === 'hero' ? 'hero' : e.id, target: src === 'hero' ? e.id : 'hero', attacker: src === 'hero' ? 'hero' : e.kind, defender: src === 'hero' ? e.kind : 'hero', raw: raw, amount: amt, hpBefore: before == null ? (src === 'hero' ? e.hp : S.hero.hp) : before, hpAfter: src === 'hero' ? e.hp : S.hero.hp, killed: !!killed, crit: !!crit, miss: !!miss, x: src === 'hero' ? e.x + 0.5 : S.hero.x + 0.5, y: src === 'hero' ? e.y + 0.5 : S.hero.y + 0.5 };
      cb('onHit', h);
    }
    function kill(e) {
      e.dying = 1; e.dieT = 0; S.hero.kills++; say(bare(e.def.name) + ' is destroyed.', COLORS.gold);
      ev({ kind: 'death', id: e.id, enemy: e.kind, boss: e.boss, x: e.x, y: e.y });
      gainXp(num(e.def.xp, 2));
      if (e.boss) { S.winAt = S.time + 1400; }
    }
    function gainXp(n) {
      var H = S.hero; H.xp += n;
      while (H.lvl < XP_STEPS.length && H.xp >= XP_STEPS[H.lvl]) {
        H.lvl++; var g = 6; H.maxHp += g; H.hp = Math.min(H.maxHp, H.hp + g); H.atk += 1;
        say('Level ' + H.lvl + '! Max HP +' + g + ', attack +1.', COLORS.heal); ev({ kind: 'levelUp', level: H.lvl, hpGain: g });
        label('hero', 'LEVEL UP', COLORS.heal, 'word');
      }
    }
    function heal(n, why) { var H = S.hero, b = H.hp; H.hp = Math.min(H.maxHp, H.hp + n); var got = H.hp - b; if (got > 0) { ev({ kind: 'heal', amount: got, why: why }); label('hero', '+' + got, COLORS.heal, 'heal'); } return got; }
    function pickup() {
      var H = S.hero;
      S.items.forEach(function (it) {
        if (it.taken || it.x !== H.x || it.y !== H.y) return;
        var d = it.def, fx = d.effect || {}; it.taken = true;
        if (d.carry && fx.heal) { H.potions = Math.min(9, H.potions + 1); say('You take a ' + d.name + '.', COLORS.heal); }
        else {
          if (fx.heal) heal(num(fx.heal, 0), it.kind);
          if (fx.gold) { H.gold += num(fx.gold, 0); say('You find ' + num(fx.gold, 0) + ' gold.', COLORS.gold); }
          if (fx.atk) { H.atk += num(fx.atk, 0); say(d.name + ': attack +' + num(fx.atk, 0) + '.', COLORS.gold); }
          if (fx.def) { H.def += num(fx.def, 0); say(d.name + ': defence +' + num(fx.def, 0) + '.', COLORS.gold); }
          if (fx.maxHp) { H.maxHp += num(fx.maxHp, 0); H.hp += num(fx.maxHp, 0); say(d.name + ': max HP +' + num(fx.maxHp, 0) + '.', COLORS.heal); }
          if (!fx.gold && !fx.atk && !fx.def && !fx.maxHp && !fx.heal) say('You take the ' + d.name + '.', COLORS.ink);
        }
        ev({ kind: 'pickup', item: it.kind, id: it.id, x: it.x, y: it.y });
      });
    }

    /* ---------------- the monsters' turn ---------------- */
    function enemyTurn() {
      var H = S.hero, m = S.map, w = m.w, i;
      // distance field from the hero over passable cells
      var D = new Int32Array(m.w * m.h).fill(-1), q = [H.x, H.y], h = 0; D[H.y * w + H.x] = 0;
      while (h < q.length) { var x = q[h++], y = q[h++]; for (var k = 0; k < 4; k++) { var nx = x + DX[k], ny = y + DY[k]; if (D[ny * w + nx] >= 0 || !passable(nx, ny)) continue; D[ny * w + nx] = D[y * w + x] + 1; if (D[ny * w + nx] < 14) q.push(nx, ny); } }
      var movers = [], attackers = [];
      S.enemies.forEach(function (e) {
        if (e.gone || e.dying) return;
        var dist = Math.abs(e.x - H.x) + Math.abs(e.y - H.y);
        if (!e.awake && dist <= num(e.def.sight, 5) && los(e.x, e.y, H.x, H.y)) { e.awake = true; ev({ kind: 'wake', id: e.id }); }
        if (!e.awake) return;
        e.energy += num(e.def.speed, 1);
        var acted = 0;
        while (e.energy >= 1 && acted < 2) {
          e.energy -= 1; acted++;
          if (Math.abs(e.x - H.x) + Math.abs(e.y - H.y) === 1) { attackers.push(e); e.energy = Math.min(e.energy, 0); break; }
          var best = null, bd = 1e9, opts = [];
          for (var k2 = 0; k2 < 4; k2++) {
            var ex = e.x + DX[k2], ey = e.y + DY[k2]; if (!passable(ex, ey) || enemyAt(ex, ey) || corpseAt(ex, ey) || (ex === H.x && ey === H.y)) continue;
            opts.push(k2); var dd = D[ey * w + ex]; if (dd >= 0 && dd < bd) { bd = dd; best = k2; }
          }
          if (opts.length && num(e.def.erratic, 0) > 0 && S.rng() < num(e.def.erratic, 0)) best = opts[Math.floor(S.rng() * opts.length)];
          if (best == null) break;
          var from = { x: e.x, y: e.y }; e.fx = e.mt < 1 ? e.fx : e.x; e.fy = e.mt < 1 ? e.fy : e.y; e.x += DX[best]; e.y += DY[best]; e.mt = 0;
          movers.push(e); ev({ kind: 'move', id: e.id, from: from, x: e.x, y: e.y });
        }
      });
      if (movers.length) S.queue2 = [{ kind: 'emove', t: 0, dur: num(P.stepMs, 170) }]; else S.queue2 = [];
      attackers.forEach(function (e) { S.queue2.push({ kind: 'eattack', t: 0, dur: 470, at: 240, done: false, id: e.id }); });
      if (!S.queue2.length) endTurn();
    }
    function enemyStrike(a) {
      var e = byId(a.id), H = S.hero; if (!e || e.gone || e.dying || H.hp <= 0) return;
      if (Math.abs(e.x - H.x) + Math.abs(e.y - H.y) !== 1) return;
      var d = e.def, r = S.crng, rel = ((dirOf(e.x - H.x, e.y - H.y) - H.dir) + 4) % 4;
      ev({ kind: 'attack', id: e.id, target: 'hero' });
      if (rel !== 0) S.indicators.push({ side: rel === 1 ? 'right' : rel === 3 ? 'left' : 'back', t: 0 });
      if (r() >= num(d.acc, 0.8)) { var vb = boxOf(e); label(vb && vb.visible ? e.id : 'hero', 'MISS', COLORS.miss, 'miss'); S.sway = 1; hitEvent(e.id, e, 0, 0, false, true, H.hp, false); say(bare(d.name) + ' misses.', COLORS.dim); return; }
      var raw = num(d.atk, 3) + r.int(0, 1), amt = Math.max(1, raw - H.def), before = H.hp; H.hp = Math.max(0, H.hp - amt); amt = before - H.hp;
      S.hurtT = 320; label('hero', '-' + amt, COLORS.hurt, 'hurt');
      hitEvent(e.id, e, raw, amt, false, false, before, H.hp <= 0);
      say(bare(d.name) + ' hits you: ' + amt + '.', COLORS.hurt);
      if (H.hp <= 0) { S.loseAt = S.time + 1300; say('You fall...', COLORS.hurt); }
    }
    function corpseAt(x, y) { for (var i = 0; i < S.enemies.length; i++) { var e = S.enemies[i]; if (e.dying && !e.gone && e.x === x && e.y === y) return e; } return null; }
    function dirOf(dx, dy) { for (var k = 0; k < 4; k++) if (DX[k] === Math.sign(dx) && DY[k] === Math.sign(dy)) return k; return 0; }
    function byId(id) { for (var i = 0; i < S.enemies.length; i++) if (S.enemies[i].id === id) return S.enemies[i]; return null; }
    function endTurn() { S.turn++; ev({ kind: 'turn', turn: S.turn }); }

    /* ---------------- the bot (?auto=1): chooses keys through the same rules ---------------- */
    function botKey() {
      var H = S.hero, m = S.map, w = m.w, f0 = front(), fe = enemyAt(f0.x, f0.y);
      if (H.hp <= H.maxHp * 0.4 && H.potions > 0) return 'potion';
      if (fe) return 'attack';
      for (var k = 0; k < 4; k++) { var e = enemyAt(H.x + DX[k], H.y + DY[k]); if (e) return turnTo(k); }
      // BFS from the hero (closed doors count as passable: bumping opens them)
      var D = new Int32Array(m.w * m.h).fill(-1), Pv = new Int32Array(m.w * m.h).fill(-1), q = [H.x, H.y], h = 0; D[H.y * w + H.x] = 0;
      while (h < q.length) { var x = q[h++], y = q[h++]; for (var j = 0; j < 4; j++) { var nx = x + DX[j], ny = y + DY[j], t = cellAt(m, nx, ny); if (D[ny * w + nx] >= 0 || !(t === FLOOR || t === DOOR)) continue; if (enemyAt(nx, ny)) continue; D[ny * w + nx] = D[y * w + x] + 1; Pv[ny * w + nx] = y * w + x; q.push(nx, ny); } }
      function stepTo(tx, ty) { var i = ty * w + tx; if (D[i] < 0) return null; while (Pv[i] >= 0 && Pv[i] !== H.y * w + H.x) i = Pv[i]; var sx = i % w, sy = Math.floor(i / w); return dirOf(sx - H.x, sy - H.y); }
      var best = null, bs = 1e9;
      function consider(x, y, score) { if (score < bs && D[y * w + x] > 0) { bs = score; best = [x, y]; } }
      // awake monsters nearby: go to them (cells next to them)
      S.enemies.forEach(function (e) { if (e.gone || e.dying || !e.awake) return; for (var j = 0; j < 4; j++) { var ax = e.x + DX[j], ay = e.y + DY[j]; if (D[ay * w + ax] > 0 && D[ay * w + ax] <= 5) consider(ax, ay, D[ay * w + ax] - 4); } });
      // the boss on the last floor
      if (m.last) S.enemies.forEach(function (e) { if (e.boss && !e.gone && !e.dying) for (var j = 0; j < 4; j++) { var ax = e.x + DX[j], ay = e.y + DY[j]; if (D[ay * w + ax] > 0) consider(ax, ay, D[ay * w + ax] + 6); } });
      // items seen
      S.items.forEach(function (it) { if (!it.taken && S.explored[it.y * w + it.x] && D[it.y * w + it.x] > 0) consider(it.x, it.y, D[it.y * w + it.x] - 2); });
      // the stairs once found
      if (m.stairs && m.stairs.fx != null && S.explored[m.stairs.y * w + m.stairs.x]) {
        if (H.x === m.stairs.fx && H.y === m.stairs.fy) { var sd = dirOf(m.stairs.x - H.x, m.stairs.y - H.y); return sd === H.dir ? 'up' : turnTo(sd); }
        consider(m.stairs.fx, m.stairs.fy, D[m.stairs.fy * w + m.stairs.fx] + (exploredShare() > 0.55 ? 0 : 12));
      }
      // the nearest frontier: a reachable cell next to an unexplored cell
      if (!best || bs > 6) for (var yy = 0; yy < m.h; yy++) for (var xx = 0; xx < m.w; xx++) {
        var ii = yy * w + xx; if (D[ii] <= 0) continue; var fr = false;
        for (var j2 = 0; j2 < 4; j2++) { var nx2 = xx + DX[j2], ny2 = yy + DY[j2]; if (nx2 >= 0 && ny2 >= 0 && nx2 < m.w && ny2 < m.h && !S.explored[ny2 * w + nx2]) fr = true; }
        if (fr) consider(xx, yy, D[ii] + 3);
      }
      // nothing left to explore that is not behind a monster: go and fight the nearest one
      if (!best) S.enemies.forEach(function (e) { if (e.gone || e.dying) return; for (var j = 0; j < 4; j++) { var ax = e.x + DX[j], ay = e.y + DY[j]; if (D[ay * w + ax] > 0) consider(ax, ay, D[ay * w + ax] + 20); } });
      if (!best && m.stairs && m.stairs.fx != null) { if (H.x === m.stairs.fx && H.y === m.stairs.fy) { var sd2 = dirOf(m.stairs.x - H.x, m.stairs.y - H.y); return sd2 === H.dir ? 'up' : turnTo(sd2); } best = [m.stairs.fx, m.stairs.fy]; }
      if (!best) return 'wait';
      var dir = stepTo(best[0], best[1]); if (dir == null) return 'wait';
      return dir === H.dir ? 'up' : turnTo(dir);
    }
    function turnTo(k) { var H = S.hero; if (k === H.dir) return 'up'; return ((k - H.dir + 4) % 4) === 3 ? 'left' : 'right'; }
    function exploredShare() { var n = 0, o = 0, m = S.map; for (var i = 0; i < m.cells.length; i++) if (m.cells[i] === FLOOR) { o++; if (S.explored[i]) n++; } return o ? n / o : 1; }

    /* ---------------- update ---------------- */
    function update(ms) {
      if (!S) return;
      ms = +ms || 0; if (ms <= 0) { layoutLabels(0); return; }
      S.time += ms; var H = S.hero, m = S.map, w = m.w;
      S.flick = 0.94 + Math.sin(S.time / 97) * 0.035 + Math.sin(S.time / 41 + 1.3) * 0.025;
      if (S.fade > 0 && !(S.act && S.act.kind === 'descend')) S.fade = Math.max(0, S.fade - ms / 380);
      if (S.banner) { S.banner.t += ms; if (S.banner.t > 2700) S.banner = null; }
      S.log.forEach(function (l) { l.t += ms; }); S.log = S.log.filter(function (l) { return l.t < 3600; });
      if (S.hurtT > 0) S.hurtT = Math.max(0, S.hurtT - ms);
      if (S.sway > 0) S.sway = Math.max(0, S.sway - ms / 300);
      S.indicators.forEach(function (i) { i.t += ms; }); S.indicators = S.indicators.filter(function (i) { return i.t < 620; });
      for (var i = 0; i < m.cells.length; i++) if (m.cells[i] === DOOR && m.doorOpen[i] < m.doorGoal[i]) m.doorOpen[i] = Math.min(m.doorGoal[i], m.doorOpen[i] + ms / 300);
      S.enemies.forEach(function (e) {
        if (e.flash > 0) e.flash--; else if (e.hurtT > 0) e.hurtT = Math.max(0, e.hurtT - ms);
        if (e.dodgeT > 0) e.dodgeT = Math.max(0, e.dodgeT - ms / 280);
        if (e.dying && !e.flash) { e.dieT += ms; if (e.dieT > DIE_MS) e.gone = true; }
        e.poseT += ms;
      });
      // endings
      if (!S.ended && S.winAt && S.time >= S.winAt) { finish('win'); }
      if (!S.ended && S.loseAt && S.time >= S.loseAt) { finish('lose'); }
      // the action timeline
      if (S.act) {
        var a = S.act; a.t += ms; var u = Math.min(1, a.t / a.dur);
        if (a.kind === 'attack' && !a.done && a.t >= a.at) { a.done = true; heroStrike(a); }
        if (a.kind === 'potion' && !a.done && a.t >= a.at) { a.done = true; heal(num((lib.items.potion && lib.items.potion.effect && lib.items.potion.effect.heal), 14), 'potion'); say('You drink a tonic.', COLORS.heal); }
        if (a.kind === 'eattack') { var ea = byId(a.id); if (ea && !ea.gone) { ea.pose = a.t < 210 ? 'wind' : a.t < 360 ? 'strike' : 'idle'; ea.lunge = a.t < 210 ? 0 : a.t < 360 ? Math.sin((a.t - 210) / 150 * Math.PI) : 0; } if (!a.done && a.t >= a.at) { a.done = true; enemyStrike(a); } }
        if (a.kind === 'emove') S.enemies.forEach(function (e) { if (e.mt < 1) e.mt = Math.min(1, e.mt + ms / a.dur); });
        if (u >= 1) {
          S.act = null;
          if (a.kind === 'eattack') { var eb = byId(a.id); if (eb) { eb.pose = 'idle'; eb.lunge = 0; } }
          if (a.kind === 'emove') S.enemies.forEach(function (e) { e.mt = 1; });
          if (a.kind === 'move') pickup();
          if (a.kind === 'descend') { nextFloor(); S.think = 30; }
          else if (a.turn && !S.ended && H.hp > 0) { if (!S.winAt) enemyTurn(); }
          else if (a.kind === 'eattack' || a.kind === 'emove') { if (!S.queue2.length) endTurn(); }
          if (!S.act && S.queue2 && S.queue2.length) S.act = S.queue2.shift();
        }
      }
      // camera follows the hero
      var cam = S.cam, A2 = S.act;
      if (A2 && A2.kind === 'move') { var k = ease(A2.t / A2.dur); cam.x = lerp(A2.x0, H.x + 0.5, k); cam.y = lerp(A2.y0, H.y + 0.5, k); }
      else if (A2 && A2.kind === 'bump') { var kb = Math.sin(Math.min(1, A2.t / A2.dur) * Math.PI) * 0.07; cam.x = H.x + 0.5 + A2.dx * kb; cam.y = H.y + 0.5 + A2.dy * kb; }
      else { cam.x = H.x + 0.5; cam.y = H.y + 0.5; }
      if (A2 && A2.kind === 'turn') cam.a = lerp(A2.a0, A2.a1, ease(A2.t / A2.dur)); else cam.a = dirAngle(H.dir);
      if (A2 && A2.kind === 'descend') { S.fade = Math.min(1, A2.t / 420); var kd = ease(Math.min(1, A2.t / 420)) * 0.3; cam.x = H.x + 0.5 + DX[H.dir] * kd; cam.y = H.y + 0.5 + DY[H.dir] * kd; }
      cam.bob = A2 && A2.kind === 'move' ? Math.round(Math.sin(A2.t / A2.dur * Math.PI) * 1.5) : 0;
      // next action: queued key, held key, or the bot
      if (!S.act && !S.ended && S.phase === 'play' && H.hp > 0 && !S.winAt) {
        var nk = null;
        if (S.queue.length) nk = S.queue.shift();
        else if (held.up) nk = 'up'; else if (held.down) nk = 'down'; else if (held.left) nk = 'left'; else if (held.right) nk = 'right';
        else if (auto) { if (S.think > 0) S.think -= ms / STEP; else { nk = botKey(); S.think = 5; } }
        if (nk) { S.mapOpen = nk === 'map' ? S.mapOpen : S.mapOpen; begin(nk); }
      }
      look();
      layoutLabels(ms);
    }
    function finish(result) {
      S.ended = true; S.phase = result === 'win' ? 'won' : 'lost';
      var info = { result: result, floor: S.floorN, floors: S.floors, level: S.hero.lvl, kills: S.hero.kills, gold: S.hero.gold, turns: S.turn, hp: S.hero.hp };
      ev({ kind: 'end', result: result, info: info }); cb('onEnd', result, info);
    }

    /* ---------------- what the camera sees (derived from the state; used by anchors, labels, the minimap) ---------------- */
    var lookKey = '';
    function look() {
      var F = field(), cam = camNow(), key2 = F.w + ':' + cam.x.toFixed(3) + ':' + cam.y.toFixed(3) + ':' + cam.a.toFixed(3) + ':' + S.floorN + ':' + S.turn;
      cols = castColumns(S.map, cam, F.w, cols);
      if (key2 === lookKey) return; lookKey = key2;
      // explored cells: a fan of rays up to 9 cells
      var m = S.map, B = camBasis(cam, 64);
      for (var r = 0; r <= 48; r++) {
        var cx = r / 24 - 1, dx = B.dx + B.rx * B.half * cx * 1.1, dy = B.dy + B.ry * B.half * cx * 1.1, L = Math.sqrt(dx * dx + dy * dy);
        for (var s = 0; s < 9; s += 0.2) { var x = Math.floor(cam.x + dx / L * s), y = Math.floor(cam.y + dy / L * s); if (x < 0 || y < 0 || x >= m.w || y >= m.h) break; S.explored[y * m.w + x] = 1; if (!passable(x, y)) break; }
      }
      for (var k = 0; k < 4; k++) S.explored[(S.hero.y + DY[k]) * m.w + S.hero.x + DX[k]] = 1;
      S.explored[S.hero.y * m.w + S.hero.x] = 1;
    }
    function camNow() { var c = S.cam, back = clamp(num(P.eyeBack, 0.32), 0, 0.4); return { x: c.x - Math.cos(c.a) * back, y: c.y - Math.sin(c.a) * back, a: c.a, fov: num(P.fov, 76), bob: c.bob || 0, time: S.time }; }
    function enemyPos(e) {
      var k = ease(e.mt), x = lerp(e.fx, e.x, k) + 0.5, y = lerp(e.fy, e.y, k) + 0.5, H = S.hero;
      if (e.lunge) { var ddx = H.x + 0.5 - x, ddy = H.y + 0.5 - y, L = Math.sqrt(ddx * ddx + ddy * ddy) || 1; x += ddx / L * 0.28 * e.lunge; y += ddy / L * 0.28 * e.lunge; }
      if (e.dodgeT > 0) { var B = camBasis(camNow(), 10), sd = Math.sin(e.dodgeT * Math.PI) * 0.22; x += B.rx * sd; y += B.ry * sd; }
      return { x: x, y: y };
    }
    function lookOf(e) { return LOOKS[e.def.look] || LOOKS.slime; }
    function enemyPose(e) {
      var L = lookOf(e);
      if (e.dying || e.hurtT > 0 || e.flash > 0) return 'hurt';
      if (e.pose === 'wind' || e.pose === 'strike') return e.pose;
      if (L.poses.indexOf('idle2') >= 0) { var n = Math.floor((e.poseT + e.phase0) / 110) % 4; return ['idle0', 'idle1', 'idle2', 'idle1'][n]; }
      return Math.floor((e.poseT + e.phase0) / 480) % 2 ? 'idle1' : 'idle0';
    }
    function enemySprite(e) {
      var L = lookOf(e), d = e.def, pose = enemyPose(e), spr;
      if (typeof d.draw === 'function') { spr = customSprite(e.kind, d, pose); }
      else spr = spriteFor(LOOKS[d.look] ? d.look : 'slime', pose, d.palette || null);
      var lift = num(d.lift, L.lift); if (L.lift > 0 && !e.dying) lift += Math.sin((S.time + e.phase0) / 260) * 0.03;
      if (e.dying && L.lift > 0) lift = Math.max(0, lift - Math.min(1, e.dieT / 640) * lift);
      return { spr: spr, size: num(d.size, L.size), lift: lift };
    }
    var customCache = {};
    function customSprite(kind, d, pose) {   // def.draw(P, pose): paints into a 64x64 Pix (same API as the built-ins use)
      var key3 = kind + ':' + pose; if (customCache[key3]) return customCache[key3];
      var P2 = Pix(64, 64); safe(d.draw, [P2, pose, { hash: hash, ramp: ramp, lit: lit }], 'enemy draw ' + kind); P2.outline(OUT); P2.foot = footRow(P2);
      return (customCache[key3] = P2);
    }
    function boxOf(e) {   // projected billboard box in logical px (field-relative + field origin), or null
      var F = field(), cam = camNow(), p = enemyPos(e), sp = enemySprite(e), pr = project(cam, F.w, F.h, p.x, p.y, sp.lift); if (!pr) return null;
      var artH = sp.spr.foot + 1, h = pr.f * sp.size / pr.depth, scale = h / artH, wpx = sp.spr.w * scale, foot = pr.y, top = foot - h;
      var x0 = pr.x - wpx / 2, vis = false, c0 = Math.max(0, Math.floor(x0)), c1 = Math.min(F.w - 1, Math.ceil(x0 + wpx) - 1);
      // opaque columns of the art bound the box tighter than the canvas
      var minU = sp.spr.w, maxU = -1, minV = artH; for (var v = 0; v < artH; v++) for (var u = 0; u < sp.spr.w; u++) if (sp.spr.d[(v * sp.spr.w + u) * 4 + 3]) { if (u < minU) minU = u; if (u > maxU) maxU = u; if (v < minV) minV = v; }
      var bx = x0 + minU * scale, bw = (maxU - minU + 1) * scale, by = top + minV * scale, bh = foot - by;
      for (var c = Math.max(c0, Math.floor(bx)); c <= Math.min(c1, Math.ceil(bx + bw) - 1); c++) if (cols && cols.zbuf[c] > pr.depth) { vis = true; break; }
      return { x: F.x + bx, y: F.y + by, w: bw, h: bh, cx: F.x + pr.x, foot: F.y + foot, depth: pr.depth, visible: vis && pr.depth < 11 && bx + bw > 0 && bx < F.w };
    }
    function clipF(r) { var F = field(), x0 = Math.max(F.x, r.x), y0 = Math.max(F.y, r.y), x1 = Math.min(F.x + F.w, r.x + r.w), y1 = Math.min(F.y + F.h, r.y + r.h); return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null; }
    // the weapon view scales with the 3D view and keeps to the lower right: its box is 58 % of the view's height, at most 60 % of its width,
    // so the resting blade never reaches the face of a monster in the next cell (checks/screen.py)
    function swordBox() { var F = field(), Sz = Math.round(Math.min(F.h * 0.58, F.w * 0.4)), W2 = Math.round(Sz * 1.5); return { x: F.x + F.w - W2 + Math.round(W2 * 0.08), y: F.y + F.h - Sz + Math.round(Sz * 0.08), w: W2, h: Sz }; }
    function swordRasterFor(h, pose) { var key = 'R:' + h + ':' + pose; return swordCache[key] || (swordCache[key] = swordRaster(h, pose)); }
    function swordPlace() {   // where the sword is drawn this frame: the raster, its top-left, the pose (derived from update state)
      var b = swordBox(), pose = swordPose(), a = S.act, bobY = a && a.kind === 'move' ? Math.round(Math.sin(a.t / a.dur * Math.PI) * 3) : Math.round(Math.sin(S.time / 700) * 1), sx = Math.round(Math.sin(S.sway * Math.PI) * 6);
      var R = swordRasterFor(b.h, pose), bb = R.bbox || (R.bbox = opaqueBox(R));
      return { R: R, x: b.x + sx, y: b.y + bobY, pose: pose, box: b, opaque: { x: b.x + sx + bb.x, y: b.y + bobY + bb.y, w: bb.w, h: bb.h } };
    }
    function opaqueBox(R) { var x0 = R.w, y0 = R.h, x1 = -1, y1 = -1; for (var y = 0; y < R.h; y++) for (var x = 0; x < R.w; x++) if (R.d[(y * R.w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; }
    function weaponOverlap(r) {   // opaque sword pixels inside rect r (logical px), clipped to the view
      if (!S || !r) return 0; var sp = swordPlace(), R = sp.R, F = field(), n = 0;
      for (var y = Math.max(Math.floor(r.y), F.y); y < Math.min(Math.ceil(r.y + r.h), F.y + F.h); y++) for (var x = Math.max(Math.floor(r.x), F.x); x < Math.min(Math.ceil(r.x + r.w), F.x + F.w); x++) {
        var u = x - sp.x, v = y - sp.y; if (u < 0 || v < 0 || u >= R.w || v >= R.h) continue; if (R.d[(v * R.w + u) * 4 + 3]) n++;
      }
      return n;
    }
    function faceBox(e) {   // the upper part of a monster's opaque billboard box (its head / eyes), clipped to the view
      var b = boxOf(e); if (!b || !b.visible) return null; var c = clipF({ x: b.x + b.w * 0.2, y: b.y, w: b.w * 0.6, h: b.h * 0.42 }); return c;
    }
    function heroRect() { var sp = swordPlace(); return clipF(sp.opaque); }
    // the hero's sword and every visible monster (a felled one too, while it crumbles; no monster steps into its cell meanwhile): its billboard box narrowed to the columns where it is in front of the wall;
    // opt.pad grows each rect by that many px (for overlays that place text around characters)
    function unitRects(opt) {
      if (!S) return [];
      var pad = Math.max(0, num(opt && opt.pad, 0)), out = [], hr = heroRect(), F = field();
      function grow(r) { return clipF({ x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }); }
      if (hr) { var g2 = grow(hr); if (g2) out.push(Object.assign({ id: 'hero', kind: 'hero' }, g2)); }
      // nearest first: a column belongs to the front-most monster whose box covers it (a farther one keeps only the columns it
      // shows past the nearer ones), so the rects never overlap one another
      var list = []; S.enemies.forEach(function (e) { if (e.gone) return; var bx = boxOf(e); if (bx && bx.visible) list.push({ e: e, b: bx }); });
      list.sort(function (p, q) { return p.b.depth - q.b.depth; });
      var owned = new Uint8Array(F.w);
      list.forEach(function (o) {
        var e = o.e, b = o.b, c0 = Math.max(0, Math.floor(b.x - F.x)), c1 = Math.min(F.w - 1, Math.ceil(b.x + b.w - F.x) - 1), v0 = -1, v1 = -1, c;
        for (c = c0; c <= c1; c++) if (cols && cols.zbuf[c] > b.depth && !owned[c]) { if (v0 < 0) v0 = c; v1 = c; }
        for (c = c0; c <= c1; c++) owned[c] = 1;
        if (v0 < 0) return;
        var r = clipF({ x: F.x + v0, y: b.y, w: v1 - v0 + 1, h: b.h }); if (!r) return; var g3 = grow(r); if (g3) out.push(Object.assign({ id: e.id, kind: e.kind }, g3));
      });
      return out;
    }
    function anchor(id) {
      if (!S) return null; var F = field();
      // the hero is the camera: its anchor is a small spot just above the HUD beside the HP numbers (numbers for the hero go there)
      if (id === 'hero') { var hx = view.x + 23 + (view.w < 300 ? 52 : 70), hy = F.y + F.h - 14; return { x: hx + 8, top: hy, left: hx, w: 16, h: 14, cy: hy + 7, footY: F.y + F.h, dead: S.hero.hp <= 0, hidden: false }; }
      var e = byId(id); if (!e) return null; var b = boxOf(e); if (!b) return { x: F.x + F.w / 2, top: F.y, left: F.x, w: 0, h: 0, cy: F.y, footY: F.y, dead: e.hp <= 0, hidden: true };
      var c = clipF(b) || b, top = c.y;
      // another living monster standing over this one on screen (nearer or behind): things placed "above" this one go above it too
      S.enemies.forEach(function (o) { if (o === e || o.gone || o.dying) return; var ob = boxOf(o); if (!ob || !ob.visible) return; if (ob.x < c.x + c.w && c.x < ob.x + ob.w && ob.y < top + 4) top = Math.min(top, Math.max(F.y, ob.y)); });
      return { x: c.x + c.w / 2, top: top, left: c.x, w: c.w, h: c.y + c.h - top, cy: c.y + c.h / 2, footY: b.foot, dead: e.hp <= 0, hidden: !b.visible || e.gone, depth: b.depth };
    }
    function uiRects() {
      var out = []; if (!S) return out;
      if (hudRect) out.push(Object.assign({ name: 'hud' }, hudRect));
      if (miniRect) out.push(Object.assign({ name: 'minimap' }, miniRect));
      if (logRect) out.push(Object.assign({ name: 'log' }, logRect));
      if (bannerRect) out.push(Object.assign({ name: 'banner' }, bannerRect));
      if (mapRect) out.push(Object.assign({ name: 'map' }, mapRect));
      return out;
    }

    /* ---------------- combat labels: placed beside their owner, never over a character, the HUD or the edge; they glide ---------------- */
    function layoutRects() {   // computed in update so the stills match play
      var F = field(), sm = view.w < 300, mini = P.minimap === 'off' ? null : miniLayout(F), L = logLayout(F), Bn = bannerLayout(F);
      miniRect = mini; logRect = L; bannerRect = Bn; hudRect = { x: view.x, y: F.y + F.h, w: view.w, h: view.y + view.h - F.y - F.h };
      mapRect = S.mapOpen ? mapLayout(F) : null; if (mapRect) { miniRect = null; logRect = null; }
    }
    function layoutLabels(ms) {
      layoutRects();
      var F = field(), units = unitRects(), ui = uiRects().filter(function (r) { return r.name !== 'hud'; }), taken = [];
      S.labels.forEach(function (lb) { lb.t += ms; });
      S.labels = S.labels.filter(function (lb) { return lb.t < lb.life && !lb.dead; });
      S.labels.forEach(function (lb) {
        var own = lb.owner === 'hero' ? (heroRect() || { x: F.x, y: F.y + F.h - 30, w: 30, h: 30 }) : null, e = null;
        if (lb.owner !== 'hero') { e = byId(lb.owner); if (e && (e.gone || e.pose === 'wind' || e.pose === 'strike') && lb.shown) lb.life = Math.min(lb.life, lb.t + 120); var b = e && !e.gone && boxOf(e); own = b ? (clipF(b) || null) : null; if (!own && lb.ox != null) own = { x: lb.ox, y: lb.oy, w: lb.ow, h: lb.oh }; }
        if (!own) { lb.hidden = true; return; }
        lb.ox = own.x; lb.oy = own.y; lb.ow = own.w; lb.oh = own.h;
        var w = lb.w, h = lb.h, rise = Math.min(1, lb.t / 500) * 6, cands = [];
        if (lb.owner === 'hero') {   // just above the HUD: left of the sword first
          var hx0 = view.x + 23 + (view.w < 300 ? 52 : 70); cands.push([hx0, F.y + F.h - h - 3 - rise], [hx0 - w - 6, F.y + F.h - h - 3 - rise], [view.x + 4, F.y + F.h - h - 3 - rise], [hx0 + w + 6, F.y + F.h - h - 3 - rise]);
        } else {
          cands.push([own.x + own.w / 2 - w / 2, own.y - h - 4 - rise], [own.x + own.w + 5, own.y + own.h * 0.22 - rise], [own.x - w - 5, own.y + own.h * 0.22 - rise], [own.x + own.w + 5, own.y + 2 - rise], [own.x - w - 5, own.y + 2 - rise]);
        }
        var pick = null;
        for (var i = 0; i < cands.length && !pick; i++) {
          var r = { x: Math.round(cands[i][0]), y: Math.round(cands[i][1]), w: w, h: h };
          if (!inside(r, { x: F.x + 1, y: F.y + 1, w: F.w - 2, h: F.h - 2 })) continue;
          if (units.some(function (u) { return overlap(r, u, 1); })) continue;
          if (ui.some(function (u) { return overlap(r, u, 1); })) continue;
          if (taken.some(function (t) { return overlap(r, t, 1); })) continue;
          pick = { r: r, slot: i };
        }
        if (!pick) { if (lb.shown) lb.dead = true; lb.hidden = true; return; }    // shown once: never re-shown
        // the label keeps an offset from its owner's top centre and glides that offset to the new slot (never a jump);
        // if the glide would cross a character or a window, the label ends instead of snapping
        var ax = own.x + own.w / 2, ay = own.y, tdx = pick.r.x - ax, tdy = pick.r.y - ay;
        if (lb.dx == null) { lb.dx = tdx; lb.dy = tdy; }
        else if (ms > 0) { var ex = tdx - lb.dx, ey = tdy - lb.dy, dd = Math.sqrt(ex * ex + ey * ey), mx = 6; if (dd > mx) { lb.dx += ex / dd * mx; lb.dy += ey / dd * mx; } else { lb.dx = tdx; lb.dy = tdy; } }
        var cur = { x: Math.round(ax + lb.dx), y: Math.round(ay + lb.dy), w: w, h: h };
        if (!inside(cur, { x: F.x + 1, y: F.y + 1, w: F.w - 2, h: F.h - 2 }) || units.some(function (u) { return overlap(cur, u, 0); }) || ui.some(function (u) { return overlap(cur, u, 0); }) || taken.some(function (t) { return overlap(cur, t, 0); })) {
          if (lb.shown) { lb.dead = true; lb.hidden = true; return; }
          lb.dx = tdx; lb.dy = tdy; cur = pick.r;
        }
        lb.hidden = false; lb.shown = true; taken.push(cur); lb.rect = cur;
      });
    }
    function labels() { return S ? S.labels.filter(function (l) { return !l.hidden && l.rect && !l.dead; }).map(function (l) { return { id: l.id, ax: l.rect.x - l.dx, ay: l.rect.y - l.dy, owner: l.owner, text: l.text, kind: l.kind, x: l.rect.x, y: l.rect.y, w: l.rect.w, h: l.rect.h, t: l.t }; }) : []; }

    /* ---------------- layout of the UI pieces ---------------- */
    function miniLayout(F) { var m = S.map, c = view.w < 300 ? 2 : 3, w = m.w * c + 6, h = m.h * c + 6; return { x: F.x + F.w - w - 4, y: F.y + 4, w: w, h: h, c: c }; }
    function logLayout(F) { var n = S.log.length; if (!n) return null; var w = Math.min(F.w - (miniRect ? miniRect.w + 14 : 8), 200); var rows = Math.min(2, n); return { x: F.x + 4, y: F.y + 4, w: w, h: rows * 10 + 4 }; }
    function bannerLayout(F) { if (!S.banner) return null; var t = S.banner.t, a = t < 300 ? ease(t / 300) : t > 2400 ? 1 - ease((t - 2400) / 300) : 1, w = Math.min(F.w - 24, Math.max(measure(S.banner.title), measure(S.banner.sub)) * 1 + 28); return { x: Math.round(F.x + (F.w - w) / 2), y: Math.round(F.y + F.h * 0.3 - 4 + (1 - a) * -6), w: w, h: 26, a: a }; }
    function mapLayout(F) { var m = S.map, c = Math.max(3, Math.floor(Math.min((F.w - 30) / m.w, (F.h - 44) / m.h))), w = Math.max(m.w * c + 12, 150), h = m.h * c + 34; return { x: Math.round(F.x + (F.w - w) / 2), y: Math.round(F.y + (F.h - h) / 2), w: w, h: h, c: c }; }

    /* ---------------- drawing ---------------- */
    function ensureBuf(W, H) {
      if (rgbaBuf && rgbaBuf.W === W && rgbaBuf.H === H) return;
      off = mkCanvas(W, H); offG = off && off.getContext('2d');
      img = offG ? offG.createImageData(W, H) : { data: new Uint8ClampedArray(W * H * 4) }; rgbaBuf = { W: W, H: H, d: img.data };
    }
    var lastRender = null;
    function sceneSprites() {
      var list = [];
      S.items.forEach(function (it) { if (it.taken) return; var d = it.def; list.push({ id: it.id, x: it.x + 0.5, y: it.y + 0.5, spr: itemSprite(d.look || 'flask', d.color || '#d83a3a'), size: num(d.size, 0.26), lift: 0, bright: 1.1 }); });
      S.enemies.forEach(function (e) {
        if (e.gone) return; var p = enemyPos(e), sp = enemySprite(e);
        list.push({ id: e.id, x: p.x, y: p.y, spr: sp.spr, size: sp.size, lift: sp.lift, flash: e.flash > 0, dissolve: e.dying && !e.flash ? clamp(0.15 + e.dieT / DIE_MS * 0.9, 0, 1) : 0 });
      });
      return list;
    }
    function drawScene(g, opt) {
      if (!S || !g) return; var weapon = !(opt && opt.weapon === false);
      try {
        var F = field(); ensureBuf(F.w, F.h);
        var d = rgbaBuf.d; for (var i = 3; i < d.length; i += 4) d[i] = 0;
        lastRender = renderView(d, F.w, F.h, S.map, camNow(), { art: A, LM: S.LM, fog: P.fog, lantern: P.lantern, flicker: S.flick }, sceneSprites(), null);
        lastBoxes = lastRender.boxes;
        if (offG) { offG.putImageData(img, 0, 0); g.save(); g.imageSmoothingEnabled = false; g.drawImage(off, F.x, F.y); g.restore(); }
        if (weapon) { drawSword(g, F); drawPotion(g, F); } drawIndicators(g, F);
        if (S.hurtT > 0) vignette(g, F, '#c01808', 0.62 * S.hurtT / 320);
        if (S.fade > 0) { g.fillStyle = 'rgba(6,4,8,' + S.fade.toFixed(3) + ')'; g.fillRect(F.x, F.y, F.w, F.h); }
      } catch (e) { warn('drawScene', e); }
    }
    function vignette(g, F, col, a) {
      var c = rgb(col), gr = g.createRadialGradient(F.x + F.w / 2, F.y + F.h / 2, Math.min(F.w, F.h) * 0.32, F.x + F.w / 2, F.y + F.h / 2, Math.max(F.w, F.h) * 0.62);
      gr.addColorStop(0, 'rgba(' + c + ',0)'); gr.addColorStop(1, 'rgba(' + c + ',' + a.toFixed(3) + ')'); g.fillStyle = gr; g.fillRect(F.x, F.y, F.w, F.h);
    }
    function swordPose() {
      var a = S.act;
      if (a && a.kind === 'attack') return a.t < 90 ? 'wind' : a.t < 210 ? 'strike' : 'recover';
      if (S.hurtT > 160) return 'hurt';
      return 'idle';
    }
    function rasterCanvas(key, R) { var c = swordCache[key]; if (c) return c; var cv = mkCanvas(R.w, R.h); if (!cv) return null; var gg = cv.getContext('2d'), id = gg.createImageData(R.w, R.h); id.data.set(R.d); gg.putImageData(id, 0, 0); return (swordCache[key] = cv); }
    function drawSword(g, F) {
      var sp = swordPlace(), c = rasterCanvas('C:' + sp.box.h + ':' + sp.pose, sp.R), a = S.act; if (!c) return;
      g.save(); g.beginPath(); g.rect(F.x, F.y, F.w, F.h); g.clip(); g.imageSmoothingEnabled = false;
      // the swept arc: drawn while the blade crosses (90-210 ms) and fading over the next 3 frames, behind the strike's path
      if (a && a.kind === 'attack' && a.t >= 90 && a.t < 260) {
        var sm = rasterCanvas('S:' + sp.box.h, swordCache['SR:' + sp.box.h] || (swordCache['SR:' + sp.box.h] = smearRaster(sp.box.h)));
        g.globalAlpha = a.t < 210 ? 0.85 : 0.85 * (1 - (a.t - 210) / 50); if (sm) g.drawImage(sm, sp.x, sp.y); g.globalAlpha = 1;
      }
      g.drawImage(c, sp.x, sp.y); g.restore();
    }
    function drawPotion(g, F) {
      var a = S.act; if (!a || a.kind !== 'potion') return;
      var u = a.t / a.dur, lift = Math.sin(Math.min(1, u) * Math.PI), spr = itemSprite('flask', '#d83a3a'), k = Math.max(2, Math.round(F.h / 70)), key5 = 'potionHand:' + k, c = swordCache[key5];
      if (!c) { var cv = mkCanvas(spr.w, spr.h); if (!cv) return; var gg = cv.getContext('2d'), id = gg.createImageData(spr.w, spr.h); id.data.set(spr.d); gg.putImageData(id, 0, 0); c = swordCache[key5] = cv; }
      g.save(); g.beginPath(); g.rect(F.x, F.y, F.w, F.h); g.clip(); g.imageSmoothingEnabled = false;
      g.drawImage(c, Math.round(F.x + F.w * 0.18), Math.round(F.y + F.h - spr.h * k * lift * 0.9), spr.w * k, spr.h * k); g.restore();
    }
    function drawIndicators(g, F) {
      S.indicators.forEach(function (i) {
        var a = i.t < 120 ? 1 : 1 - (i.t - 120) / 500; if (a <= 0) return;
        g.fillStyle = 'rgba(230,40,30,' + (0.85 * a).toFixed(3) + ')';
        var cy = F.y + F.h / 2, s = Math.max(6, Math.round(F.h * 0.07));
        if (i.side === 'left' || i.side === 'back') for (var k = 0; k < s; k++) g.fillRect(F.x + 3 + k, Math.round(cy - s + k), 2, (s - k) * 2);
        if (i.side === 'right' || i.side === 'back') for (var k2 = 0; k2 < s; k2++) g.fillRect(F.x + F.w - 5 - k2, Math.round(cy - s + k2), 2, (s - k2) * 2);
      });
    }
    function panel(g, r, alpha) {
      var x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
      g.fillStyle = '#0a070e'; g.fillRect(x + 1, y, w - 2, h); g.fillRect(x, y + 1, w, h - 2);
      g.fillStyle = 'rgba(22,16,30,' + (alpha == null ? 0.92 : alpha) + ')'; g.fillRect(x + 1, y + 1, w - 2, h - 2);
      g.fillStyle = '#5c4a78'; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 4);
      g.fillStyle = '#2a2038'; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
      g.fillStyle = '#d8a848'; g.fillRect(x + 1, y + 1, 2, 2); g.fillRect(x + w - 3, y + 1, 2, 2); g.fillRect(x + 1, y + h - 3, 2, 2); g.fillRect(x + w - 3, y + h - 3, 2, 2);
    }
    function bar(g, x, y, w, h, v, col, back) {
      g.fillStyle = '#0a070e'; g.fillRect(x - 1, y - 1, w + 2, h + 2); g.fillStyle = back || '#3a1a22'; g.fillRect(x, y, w, h);
      var fw = Math.round(w * clamp(v, 0, 1)); g.fillStyle = col; g.fillRect(x, y, fw, h); g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x, y, fw, 1);
    }
    function drawUI(g) {
      if (!S || !g) return;
      try {
        layoutRects();
        var F = field(), H = S.hero, hr = hudRect, sm = view.w < 300;
        // HUD strip
        g.fillStyle = '#0d0912'; g.fillRect(hr.x, hr.y, hr.w, hr.h);
        g.fillStyle = '#3a2c4c'; g.fillRect(hr.x, hr.y, hr.w, 1); g.fillStyle = '#d8a848'; g.fillRect(hr.x, hr.y + 1, hr.w, 1); g.fillStyle = '#1a1224'; g.fillRect(hr.x, hr.y + 2, hr.w, 1);
        var y1 = sm ? hr.y + 5 : hr.y + Math.round((hr.h - 7) / 2), x = hr.x + 6;
        text(g, 'HP', x, y1, { color: '#ffb0a0' }); var bw = sm ? 52 : 70;
        bar(g, x + 13, y1 + 1, bw, 6, H.hp / H.maxHp, H.hp <= H.maxHp * 0.3 ? '#ff5040' : '#e83a3a');
        text(g, H.hp + '/' + H.maxHp, x + 17 + bw, y1, { color: COLORS.ink });
        var x2 = x + 17 + bw + measure('99/99') + 10;
        potRect = { x: x2 - 2, y: hr.y + 3, w: 28, h: 13 };
        drawIcon(g, 'flask', x2, y1 - 1); text(g, 'x' + H.potions, x2 + 10, y1, { color: H.potions ? COLORS.ink : COLORS.dim });
        var x3 = x2 + 32; drawIcon(g, 'coins', x3, y1 - 1); text(g, String(H.gold), x3 + 10, y1, { color: COLORS.gold });
        var lv = 'LV ' + H.lvl, y2 = sm ? hr.y + 17 : y1;
        var xl = sm ? hr.x + 6 : x3 + 16 + measure(String(H.gold)) + 8;
        text(g, lv, xl, y2, { color: '#b8d8ff' });
        var nx = XP_STEPS[H.lvl] || XP_STEPS[XP_STEPS.length - 1], px = XP_STEPS[H.lvl - 1] || 0;
        bar(g, xl + measure(lv) + 4, y2 + 2, sm ? 30 : 36, 4, H.lvl >= XP_STEPS.length ? 1 : (H.xp - px) / Math.max(1, nx - px), '#6aa8ff', '#1a2440');
        // floor and compass on the right
        var fl = 'F' + S.floorN + '/' + S.floors, comp = DIRNAME[H.dir], cxr = hr.x + hr.w - 6;
        var cw = 13; g.fillStyle = '#0a070e'; g.fillRect(cxr - cw, (sm ? y2 : y1) - 2, cw, 11); g.fillStyle = '#2a2038'; g.fillRect(cxr - cw + 1, (sm ? y2 : y1) - 1, cw - 2, 9);
        text(g, comp, cxr - cw / 2, sm ? y2 : y1, { color: '#ffd070', align: 'center' });
        text(g, fl, cxr - cw - 5, sm ? y2 : y1, { color: COLORS.dim, align: 'right' });
        if (!sm) text(g, S.map.name, cxr - cw - 10 - measure(fl), y1, { color: '#cdbfdc', align: 'right' });
        // minimap
        if (miniRect && !mapRect) drawMini(g, miniRect, false);
        // message log (newest at the bottom; lines slide up when a new one comes)
        if (logRect && !mapRect) {
          var rows = S.log.slice(-2);
          rows.forEach(function (l, i) {
            var a = l.t > 3300 ? 1 - (l.t - 3300) / 300 : 1, y3 = logRect.y + 2 + i * 10 + (l.t < 120 && i === rows.length - 1 ? Math.round((1 - l.t / 120) * 4) : 0);
            g.globalAlpha = clamp(a, 0, 1); text(g, clip(l.text, logRect.w - 4), logRect.x + 2, y3, { color: l.color, outline: '#0a070e' }); g.globalAlpha = 1;
          });
        }
        // banner
        if (bannerRect) { var Bn = bannerRect; g.globalAlpha = Bn.a; panel(g, Bn, 0.9); text(g, S.banner.title, Bn.x + Bn.w / 2, Bn.y + 4, { color: '#ffd070', align: 'center' }); text(g, S.banner.sub, Bn.x + Bn.w / 2, Bn.y + 14, { color: '#d8c8e8', align: 'center' }); g.globalAlpha = 1; }
        // combat labels
        S.labels.forEach(function (lb) {
          if (lb.hidden || !lb.rect) return;
          var a = lb.t > lb.life - 160 ? (lb.life - lb.t) / 160 : 1; g.globalAlpha = clamp(a, 0, 1);
          var R2 = lb.rect; g.fillStyle = 'rgba(10,7,14,0.62)'; g.fillRect(R2.x + 1, R2.y, R2.w - 2, R2.h); g.fillRect(R2.x, R2.y + 1, R2.w, R2.h - 2);
          text(g, lb.text, R2.x + 3, R2.y + 2, { color: lb.color, outline: '#0a070e' }); g.globalAlpha = 1;
        });
        if (mapRect) drawMini(g, mapRect, true);
      } catch (e) { warn('drawUI', e); }
    }
    function clip(s, w) { s = String(s); if (measure(s) <= w) return s; while (s.length > 1 && measure(s + '..') > w) s = s.slice(0, -1); return s + '..'; }
    var ICONS = {};
    function drawIcon(g, look, x, y) {
      var c = ICONS[look]; if (!c) { var spr = itemSprite(look, look === 'flask' ? '#d83a3a' : '#e8b848'), cv = mkCanvas(16, 16); if (!cv) return; var gg = cv.getContext('2d'), t = mkCanvas(32, 32), tg = t.getContext('2d'), id = tg.createImageData(32, 32); id.data.set(spr.d); tg.putImageData(id, 0, 0); gg.imageSmoothingEnabled = false; gg.drawImage(t, 4, 2, 24, 30, 0, 0, 8, 10); c = ICONS[look] = cv; }
      g.drawImage(c, x, y);
    }
    function drawMini(g, r, big) {
      var m = S.map, c = r.c, ox = r.x + (big ? Math.round((r.w - m.w * c) / 2) : 3), oy = r.y + (big ? 16 : 3);
      panel(g, r, big ? 0.96 : 0.86);
      if (big) text(g, 'MAP - ' + m.name, r.x + r.w / 2, r.y + 5, { color: '#ffd070', align: 'center' });
      for (var y = 0; y < m.h; y++) for (var x = 0; x < m.w; x++) {
        var i = y * m.w + x; if (!S.explored[i]) continue; var t = m.cells[i], col = null;
        if (t === FLOOR) col = '#3a3046'; else if (t === DOOR) col = doorOpen(x, y) ? '#6a4a2c' : '#a86a34'; else if (t === STAIRS) col = '#5ad0d8'; else if (t === TORCH) col = '#e89a3a'; else col = '#8a7a9a';
        if (t === WALL || t === BANNER) { var nearF = false; for (var k = 0; k < 4; k++) { var tt = cellAt(m, x + DX[k], y + DY[k]); if (tt === FLOOR || tt === DOOR) nearF = true; } if (!nearF) continue; }
        g.fillStyle = col; g.fillRect(ox + x * c, oy + y * c, c, c);
      }
      S.items.forEach(function (it) { if (!it.taken && S.explored[it.y * m.w + it.x]) { g.fillStyle = '#ffd34a'; g.fillRect(ox + it.x * c + (c > 2 ? 1 : 0), oy + it.y * c + (c > 2 ? 1 : 0), Math.max(1, c - 2), Math.max(1, c - 2)); } });
      S.enemies.forEach(function (e) { if (e.gone || e.dying) return; var b = boxOf(e); if (!(b && b.visible) && !(big && e.awake && S.explored[e.y * m.w + e.x])) return; g.fillStyle = e.boss ? '#ff40c0' : '#ff4a3a'; g.fillRect(ox + e.x * c, oy + e.y * c, c, c); });
      // the hero: an arrow pointing where the camera looks
      var H = S.hero, hx = ox + H.x * c + c / 2, hy = oy + H.y * c + c / 2, s = Math.max(2, c);
      g.fillStyle = '#fff4c0'; g.beginPath(); var ang = S.cam.a;
      g.moveTo(hx + Math.cos(ang) * s, hy + Math.sin(ang) * s); g.lineTo(hx + Math.cos(ang + 2.4) * s * 0.8, hy + Math.sin(ang + 2.4) * s * 0.8); g.lineTo(hx + Math.cos(ang - 2.4) * s * 0.8, hy + Math.sin(ang - 2.4) * s * 0.8); g.closePath(); g.fill();
      if (big) {   // legend
        var ly = r.y + r.h - 12, items = [['#fff4c0', 'you'], ['#ff4a3a', 'foe'], ['#ffd34a', 'item'], ['#a86a34', 'door'], ['#5ad0d8', 'stairs']], tw = 0;
        items.forEach(function (it) { tw += 8 + measure(it[1]) + 8; }); var lx = Math.round(r.x + (r.w - tw + 8) / 2);
        items.forEach(function (it) { g.fillStyle = it[0]; g.fillRect(lx, ly + 2, 5, 5); text(g, it[1], lx + 8, ly, { color: '#cdbfdc' }); lx += 8 + measure(it[1]) + 8; });
      }
    }

    /* ---------------- public instance ---------------- */
    var inst = {
      version: VERSION, lib: lib, params: P,
      start: start, update: function (ms) { try { update(ms); } catch (e) { warn('update', e); } }, drawScene: drawScene, drawUI: drawUI,
      key: key, pointer: pointer, setHeld: function (h) { held = h || {}; }, setAuto: function (on) { auto = !!on; }, auto: function () { return auto; },
      setView: function (v) { view = Object.assign({}, view, v || {}); lookKey = ''; if (S) { cols = null; look(); layoutLabels(0); } },
      setParams: function (o) { Object.assign(P, o || {}); },
      fieldRect: function () { return field(); }, uiRects: uiRects, unitRects: unitRects, anchor: anchor, labels: labels,
      addEnemy: function (id, d) { lib.enemies[id] = d; return id; }, addItem: function (id, d) { lib.items[id] = d; return id; }, addMap: function (id, d) { lib.maps[id] = d; return id; },
      hero: function () { return S && S.hero; }, enemies: function () { return S ? S.enemies : []; }, enemy: byId, items: function () { return S ? S.items : []; }, map: function () { return S && S.map; },
      explored: function () { return S && S.explored; }, phase: function () { return S ? S.phase : 'idle'; }, turn: function () { return S ? S.turn : 0; }, busy: function () { return !!(S && S.act); },
      camera: function () { return S ? camNow() : null; }, rng: function () { return S ? S.rng() : 0; }, floor: function () { return S ? S.floorN : 0; },
      weaponOverlap: weaponOverlap, weaponRect: function () { return S ? swordPlace().opaque : null; }, faceBox: function (id) { var e = byId(id); return e && !e.gone && !e.dying ? faceBox(e) : null; },
      renderStats: function () { return lastRender ? { cols: lastRender.cols.W, noHit: lastRender.cols.noHit, sprites: Object.keys(lastRender.boxes).length } : null; },
      botKey: function () { return S ? botKey() : null; },
      state: function () {
        if (!S) return null; var H = S.hero;
        return { phase: S.phase, floor: S.floorN, floors: S.floors, theme: S.map.theme, hp: H.hp, maxHp: H.maxHp, potions: H.potions, gold: H.gold, level: H.lvl, xp: H.xp, atk: H.atk, def: H.def, kills: H.kills,
          turn: S.turn, hero: { x: H.x, y: H.y, dir: H.dir }, act: S.act ? S.act.kind : null, map: S.mapOpen, enemies: S.enemies.filter(function (e) { return !e.gone; }).length,
          explored: Array.prototype.reduce.call(S.explored, function (a, b) { return a + b; }, 0), labels: S.labels.filter(function (l) { return !l.hidden; }).length, time: Math.round(S.time),
          banner: !!S.banner, hurt: S.hurtT > 0, sword: swordPose(), flash: S.enemies.some(function (e) { return !e.gone && e.flash > 0; }) };
      },
      actors: function () {
        if (!S) return []; var out = [{ id: 'hero', x: Math.round(view.x + view.w / 2), y: Math.round(field().y + field().h), facing: DIRNAME[S.hero.dir], noFace: 'first-person camera (the view is the hero)' }];
        S.enemies.forEach(function (e) { if (e.gone) return; var b = boxOf(e); if (!b || !b.visible) return; out.push({ id: e.id, x: Math.round(b.cx), y: Math.round(b.foot), facing: 'front', target: 'hero', asset: e.def.look, kind: e.kind, pose: enemyPose(e), flash: e.flash > 0, noFace: 'frontal billboard: always drawn facing the camera (the hero)' }); });
        return out;
      },
      hash: function () { if (!S) return ''; var H = S.hero, s = [S.floorN, S.turn, H.x, H.y, H.dir, H.hp, H.maxHp, H.potions, H.gold, H.lvl, H.xp, H.kills, S.phase].join(','); S.enemies.forEach(function (e) { s += '|' + e.id + ':' + e.kind + ':' + e.x + ':' + e.y + ':' + e.hp + ':' + (e.gone ? 1 : 0); }); return s; }
    };
    return inst;
  }

  /* drawSprite: one billboard alone at an integer scale (title screens, sheets, previews); id = enemy id, item id or a def */
  function drawSprite(g, id, x, footY, scale, pose) {
    var d = typeof id === 'object' ? id : (ENEMIES[id] || ITEMS[id]); if (!d || !g) return false;
    var spr = d.effect ? itemSprite(d.look || 'flask', d.color || '#d83a3a') : spriteFor(LOOKS[d.look] ? d.look : 'slime', pose || 'idle0', d.palette || null);
    var cv = mkCanvas(spr.w, spr.h); if (!cv) return false; var gg = cv.getContext('2d'), im = gg.createImageData(spr.w, spr.h); im.data.set(spr.d); gg.putImageData(im, 0, 0);
    var k = Math.max(1, Math.round(scale || 1)); g.save(); g.imageSmoothingEnabled = false; g.drawImage(cv, Math.round(x - spr.w * k / 2), Math.round(footY - (spr.foot + 1) * k), spr.w * k, spr.h * k); g.restore();
    return true;
  }

  /* ---------- the global ---------- */
  var API = {
    VERSION: VERSION, create: create, ENEMIES: ENEMIES, ITEMS: ITEMS, THEMES: THEMES, LOOKS: LOOKS, PALETTES: PALETTES,
    text: text, measure: measure, drawSprite: drawSprite,
    // pure pieces for tools and checks (no canvas needed)
    generateFloor: generateFloor, parseMap: parseMap, castColumns: castColumns, renderView: renderView, project: project, buildArt: buildArt,
    spriteFor: spriteFor, itemSprite: itemSprite, swordRaster: swordRaster, buildLightMap: buildLightMap, bfs: bfs,
    CELL: { FLOOR: FLOOR, WALL: WALL, TORCH: TORCH, DOOR: DOOR, STAIRS: STAIRS, BANNER: BANNER }
  };
  root.GameDNA_RaycastDungeon = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
