/* GameDNA_DungeonFloors v1.1.2 - B-12 Procedural dungeon floors (Game DNA library, system element).
 * One plain script, no dependencies, no import / export. One global: GameDNA_DungeonFloors. Source is ASCII only.
 *
 * Seeded dungeon floors: rooms placed at random, joined by a minimum spanning tree of corridors plus a few loops, with
 * doors, autotiled walls and floors (faces, edges, inner and outer corners), torches, decor per room type, chests, loose
 * items, monsters placed by a per-room budget, and stairs down in the room farthest from the start. Turn-based: the hero
 * steps in 8 directions (no corner cutting), bumps a monster to attack, bumps a chest to open it, bumps a door to open it;
 * then every awake monster acts. Field of view by shadowcasting, explored tiles remembered (dim), unknown tiles black,
 * a lantern and torch light, an optional minimap. The last floor holds a boss; killing it wins, the hero at 0 HP loses.
 * Seeded and frame-stepped: the same seed and the same inputs give the same game at any view size.
 *
 *   var df = GameDNA_DungeonFloors.create({view, seed, params, rooms, monsters, items, onHit, onEvent, onEnd});
 *   df.start({seed})          a new run from floor 1
 *   df.update(stepMs)         every fixed step (0 while frozen)
 *   df.drawScene(ctx)         floor, walls, decor, items, monsters, hero, effects, light and fog (host effects after it)
 *   df.drawUI(ctx)            HUD (HP, level, potions, gold, floor), minimap, message log, banners
 *   df.key(k) / df.pointer(type, x, y) / df.setHeld({up, down, left, right})   input in the host's logical px
 *   API in module/README.md.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.3';
  var T = 16;                                  // tile size in logical px
  var STEP = 1000 / 60;
  var ROCK = 0, FLOOR = 1, WALL = 2, DOOR = 3, STAIRS = 4;
  var DIRS8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  var DIRS4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  /* ---------- small helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function copy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function hash(x, y, s) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
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
  function warn(label, e) { var k = label + ':' + (e && e.message); if (warned[k]) return; warned[k] = 1; if (typeof console !== 'undefined') console.warn('GameDNA_DungeonFloors ' + label + ': ' + (e && e.message)); }
  function safe(fn, args, label) { if (typeof fn !== 'function') return undefined; try { return fn.apply(null, args); } catch (e) { warn(label || 'callback', e); return undefined; } }
  function mkCanvas(w, h) {
    if (typeof document !== 'undefined' && document.createElement) { var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
    return null;
  }

  /* ---------- pixel font: 'regular' 6x8 proportional glyphs (original designs, shared with the C-03 pixel-font element) ---------- */
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
