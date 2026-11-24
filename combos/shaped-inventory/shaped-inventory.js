/* GameDNA G-11 shaped inventory (module v1.4.1)
 * Items with polyomino shapes packed into a grid bag: drag (mouse / touch) or keys to move, R to turn an item between upright and
 * sideways, a red / green / amber / blue ghost for invalid / free / swap / merge, auto-sort that keeps every item, stack counts,
 * a tooltip, a ground tray for loot and drops, Use and Drop through the game's callbacks.
 * One plain script, one global: GameDNA_ShapedInventory. No dependencies, no timers, no Math.random, ASCII only.
 * Deterministic: state changes only in update() / input calls; draw() only reads (animations are timestamps on the update clock).
 */
(function (root) {
  'use strict';
  var VERSION = '1.4.1';

  /* ---------------- shapes ---------------- */
  var SHAPES = {
    '1x1': ['X'], '1x2': ['X', 'X'], '2x1': ['XX'], '1x3': ['X', 'X', 'X'], '3x1': ['XXX'], '1x4': ['X', 'X', 'X', 'X'],
    '2x2': ['XX', 'XX'], '2x3': ['XX', 'XX', 'XX'], '3x2': ['XXX', 'XXX'],
    L: ['X.', 'X.', 'XX'], J: ['.X', '.X', 'XX'], T: ['XXX', '.X.'], S: ['.XX', 'XX.'], Z: ['XX.', '.XX'],
    plus: ['.X.', 'XXX', '.X.'], boot: ['X.', 'XX'], axe: ['XX', 'XX', 'X.'], pick: ['XXX', '.X.', '.X.'], corner: ['XX', 'X.']
  };
  function parseShape(s) {
    if (s && s.cells && s.w) return s;
    if (typeof s === 'string') {
      if (SHAPES[s]) s = SHAPES[s];
      else { var m = /^(\d+)x(\d+)$/.exec(s); if (m) { var rr = [], k; for (k = 0; k < +m[2]; k++) rr.push(new Array(+m[1] + 1).join('X')); s = rr; } else s = ['X']; }
    }
    var cells = [];
    if (Array.isArray(s) && s.length && Array.isArray(s[0])) { for (var i = 0; i < s.length; i++) cells.push([s[i][0] | 0, s[i][1] | 0]); }
    else if (Array.isArray(s)) { for (var y = 0; y < s.length; y++) for (var x = 0; x < String(s[y]).length; x++) { var ch = String(s[y])[x]; if (ch !== '.' && ch !== ' ' && ch !== '0') cells.push([x, y]); } }
    if (!cells.length) cells = [[0, 0]];
    var mx = 1e9, my = 1e9, Mx = -1, My = -1;
    cells.forEach(function (c) { mx = Math.min(mx, c[0]); my = Math.min(my, c[1]); });
    cells = cells.map(function (c) { return [c[0] - mx, c[1] - my]; });
    cells.forEach(function (c) { Mx = Math.max(Mx, c[0]); My = Math.max(My, c[1]); });
    return { w: Mx + 1, h: My + 1, cells: cells };
  }
  /* Orientation o = 0..3 quarter turns clockwise of the shape AND its art (a real rotation, never a mirror). R cycles only through
     orientations whose footprint differs (orientsOf): a 2x2 or a plus never turns, a 1x2 toggles upright / sideways. */
  function rotCW(sh) { return { w: sh.h, h: sh.w, cells: sh.cells.map(function (c) { return [sh.h - 1 - c[1], c[0]]; }) }; }
  function orientCells(shape, o) {
    var s = { w: shape.w, h: shape.h, cells: shape.cells.map(function (c) { return [c[0], c[1]]; }) };
    for (var k = 0; k < ((o | 0) & 3); k++) s = rotCW(s);
    return s;
  }
  function cellKey(sh) { return sh.cells.map(function (c) { return c[0] + ',' + c[1]; }).sort().join(' '); }
  function orientsOf(shape) { var seen = {}, out = []; for (var o = 0; o < 4; o++) { var k = cellKey(orientCells(shape, o)); if (!seen[k]) { seen[k] = 1; out.push(o); } } return out; }
  /* canvas transform (a, b, c, d, e, f) that draws art authored for orientation 0 (W0 x H0 px) into the rotated box at (0, 0) */
  function orientMatrix(o, W0, H0) {
    o = (o | 0) & 3; W0 = W0 || 0; H0 = H0 || 0;
    return o === 1 ? [0, 1, -1, 0, H0, 0] : o === 2 ? [-1, 0, 0, -1, W0, H0] : o === 3 ? [0, -1, 1, 0, 0, W0] : [1, 0, 0, 1, 0, 0];
  }

  /* ---------------- 6x8 bitmap font (the C-03 regular glyphs, '#' = ink) ---------------- */
  var REGULAR = {
    '!': '# # # # # . #', '"': '#.# #.#', '%': '##... ##..# ...#. ..#.. .#... #..## ...##', "'": '# #', '(': '..# .#. #.. #.. #.. .#. ..#', ')': '#.. .#. ..# ..# ..# .#. #..',
    '+': '..... ..#.. ..#.. ##### ..#.. ..#..', ',': '.. .. .. .. .. ## .# #.', '-': '.... .... .... ####', '.': '.. .. .. .. .. ## ##',
    '/': '....# ...#. ...#. ..#.. .#... .#... #....', '0': '.###. #...# #..## #.#.# ##..# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
    '2': '.###. #...# ....# ...#. ..#.. .#... #####', '3': '####. ....# ....# .###. ....# ....# ####.', '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
    '5': '##### #.... ####. ....# ....# #...# .###.', '6': '..##. .#... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. .#... .#... .#...',
    '8': '.###. #...# #...# .###. #...# #...# .###.', '9': '.###. #...# #...# .#### ....# ...#. .##..', ':': '.. ## ## .. .. ## ##',
    '<': '...# ..#. .#.. #... .#.. ..#. ...#', '=': '.... .... #### .... ####', '>': '#... .#.. ..#. ...# ..#. .#.. #...', '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
    'A': '.###. #...# #...# ##### #...# #...# #...#', 'B': '####. #...# #...# ####. #...# #...# ####.', 'C': '.###. #...# #.... #.... #.... #...# .###.',
    'D': '###.. #..#. #...# #...# #...# #..#. ###..', 'E': '##### #.... #.... ####. #.... #.... #####', 'F': '##### #.... #.... ####. #.... #.... #....',
    'G': '.###. #...# #.... #.### #...# #...# .####', 'H': '#...# #...# #...# ##### #...# #...# #...#', 'I': '### .#. .#. .#. .#. .#. ###',
    'J': '..### ...#. ...#. ...#. #..#. #..#. .##..', 'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#', 'L': '#... #... #... #... #... #... ####',
    'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#', 'N': '#...# ##..# #.#.# #..## #...# #...# #...#', 'O': '.###. #...# #...# #...# #...# #...# .###.',
    'P': '####. #...# #...# ####. #.... #.... #....', 'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#', 'R': '####. #...# #...# ####. #.#.. #..#. #...#',
    'S': '.#### #.... #.... .###. ....# ....# ####.', 'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..', 'U': '#...# #...# #...# #...# #...# #...# .###.',
    'V': '#...# #...# #...# #...# #...# .#.#. ..#..', 'W': '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.', 'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', 'Z': '##### ....# ...#. ..#.. .#... #.... #####', '[': '### #.. #.. #.. #.. #.. ###', ']': '### ..# ..# ..# ..# ..# ###',
    'a': '.... .... .##. ...# .### #..# .###', 'b': '#... #... ###. #..# #..# #..# ###.', 'c': '.... .... .### #... #... #... .###',
    'd': '...# ...# .### #..# #..# #..# .###', 'e': '.... .... .##. #..# #### #... .###', 'f': '..## .#.. #### .#.. .#.. .#.. .#..',
    'g': '.... .... .### #..# #..# .### ...# ###.', 'h': '#... #... ###. #..# #..# #..# #..#', 'i': '# . # # # # #', 'j': '..# ... .## ..# ..# ..# ..# ##.',
    'k': '#... #... #..# #.#. ##.. #.#. #..#', 'l': '#. #. #. #. #. #. .#', 'm': '..... ..... ##.#. #.#.# #.#.# #.#.# #.#.#', 'n': '.... .... ###. #..# #..# #..# #..#',
    'o': '.... .... .##. #..# #..# #..# .##.', 'p': '.... .... ###. #..# #..# ###. #... #...', 'q': '.... .... .### #..# #..# .### ...# ...#',
    'r': '.... .... #.## ##.. #... #... #...', 's': '.... .... .### #... .##. ...# ###.', 't': '.#. .#. ### .#. .#. .#. ..#', 'u': '.... .... #..# #..# #..# #..# .###',
    'v': '..... ..... #...# #...# .#.#. .#.#. ..#..', 'w': '..... ..... #...# #...# #.#.# #.#.# .#.#.', 'x': '..... ..... #...# .#.#. ..#.. .#.#. #...#',
    'y': '.... .... #..# #..# #..# .### ...# ###.', 'z': '.... .... #### ...# .##. #... ####', '?BOX': '##### #...# #...# #...# #...# #...# #####'
  };
  var GL = {};
  var DIG35 = { '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['###', '..#', '###', '#..', '###'], '3': ['###', '..#', '.##', '..#', '###'], '4': ['#.#', '#.#', '###', '..#', '..#'],
    '5': ['###', '#..', '###', '..#', '###'], '6': ['###', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '###'] };
  function glyph(ch) {
    if (GL[ch]) return GL[ch];
    var src = REGULAR[ch]; if (src == null) src = REGULAR['?BOX'];
    var rows = src.split(' '), w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);
    return (GL[ch] = { rows: rows, w: w });
  }
  function pxWidth(s) { var w = 0; s = String(s); for (var i = 0; i < s.length; i++) w += s[i] === ' ' ? 4 : glyph(s[i]).w + 1; return Math.max(0, w - 1); }
  function pxText(ctx, s, x, y, col, shadow) {
    s = String(s); x = Math.round(x); y = Math.round(y);
    var pass = shadow ? [[1, 1, shadow], [0, 0, col]] : [[0, 0, col]];
    for (var p = 0; p < pass.length; p++) {
      ctx.fillStyle = pass[p][2]; var cx = x + pass[p][0];
      for (var i = 0; i < s.length; i++) {
        if (s[i] === ' ') { cx += 4; continue; }
        var G = glyph(s[i]);
        for (var r = 0; r < G.rows.length; r++) for (var c = 0; c < G.rows[r].length; c++) if (G.rows[r][c] === '#') ctx.fillRect(cx + c, y + pass[p][1] + r, 1, 1);
        cx += G.w + 1;
      }
    }
  }

  /* ---------------- helpers ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function hit(a, b) { return a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function inside(px, py, r) { return r && px >= r.x && py >= r.y && px < r.x + r.w && py < r.y + r.h; }
  function ease(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u) * (1 - u); }
  function mkCanvas(w, h) {
    try { var c = root.document && root.document.createElement('canvas'); if (!c) return null; c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; } catch (e) { return null; }
  }
  function hexRgb(h) { h = String(h || '#888888').replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbHex(c) { return '#' + c.map(function (v) { v = clamp(Math.round(v), 0, 255); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function mix(a, b, t) { var A = hexRgb(a), B = hexRgb(b); return rgbHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); }
  function rgba(h, a) { var c = hexRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  var RARITY = { common: '#cfc6b2', uncommon: '#86d672', rare: '#62aef4', epic: '#c788f4', quest: '#f2c45a' };
  var KIND_LABEL = { weapon: 'Weapon', shield: 'Shield', armor: 'Armor', head: 'Helmet', feet: 'Boots', tool: 'Tool', consumable: 'Consumable',
    food: 'Food', material: 'Material', key: 'Key item', quest: 'Quest item', trinket: 'Trinket', ammo: 'Ammo', treasure: 'Treasure', misc: 'Item' };

  /* ---------------- procedural item art ----------------
     Each art draws flat parts in CELL units (0..aw, 0..ah) for orientation 0. shade() then adds the bevel, the outline and
     the light in SCREEN space after the orientation transform, so every item is lit from the top left in both orientations. */
  var MAT = {
    steel: '#b9c5d2', iron: '#6f7b88', dark: '#3c4450', gold: '#e3b448', brass: '#c79a4a', wood: '#8d5c33', wood2: '#6a4224',
    leather: '#7c4c2c', leather2: '#a26a3c', cloth: '#5a6fb0', paper: '#e8dcb8', glass: '#cfe6ee', red: '#d0473f', blue: '#3f7ad8',
    green: '#4fae4c', purple: '#9a5ad0', bread: '#c98a44', crust: '#a2622c', gel: '#58b8e0', bone: '#e6dcc4', flame: '#ffcf5a', ink: '#2a2018'
  };
  var ARTS = {
    sword: [1, 3, function (P, c, a) {
      P.poly([0.5, 0.06, 0.66, 0.3, 0.66, 2.02, 0.34, 2.02, 0.34, 0.3], c || MAT.steel);
      P.rect(0.46, 0.34, 0.08, 1.6, mix(c || MAT.steel, '#4a5462', 0.35));
      P.rect(0.08, 2.0, 0.84, 0.17, a || MAT.gold);
      P.rect(0.4, 2.17, 0.2, 0.52, MAT.leather);
      P.rect(0.4, 2.3, 0.2, 0.06, MAT.leather2); P.rect(0.4, 2.46, 0.2, 0.06, MAT.leather2);
      P.ell(0.5, 2.8, 0.13, 0.12, a || MAT.gold);
    }],
    dagger: [1, 2, function (P, c, a) {
      P.poly([0.5, 0.08, 0.64, 0.3, 0.62, 1.2, 0.38, 1.2, 0.36, 0.3], c || MAT.steel);
      P.rect(0.47, 0.3, 0.06, 0.82, mix(c || MAT.steel, '#4a5462', 0.35));
      P.rect(0.16, 1.18, 0.68, 0.13, a || MAT.brass);
      P.rect(0.41, 1.31, 0.18, 0.42, MAT.leather);
      P.ell(0.5, 1.82, 0.11, 0.1, a || MAT.brass);
    }],
    axe: [2, 3, function (P, c, a) {
      var st = c || MAT.steel;
      P.rect(0.39, 0.14, 0.22, 2.76, MAT.wood);
      P.rect(0.39, 2.26, 0.22, 0.52, MAT.leather); P.rect(0.39, 2.38, 0.22, 0.05, MAT.leather2); P.rect(0.39, 2.56, 0.22, 0.05, MAT.leather2);
      P.poly([0.6, 0.5, 1.12, 0.4, 1.52, 0.1, 1.8, 0.42, 1.94, 0.95, 1.8, 1.48, 1.52, 1.8, 1.12, 1.5, 0.6, 1.4], st);
      P.poly([1.52, 0.1, 1.8, 0.42, 1.94, 0.95, 1.8, 1.48, 1.52, 1.8, 1.64, 1.42, 1.76, 0.95, 1.64, 0.48], mix(st, '#ffffff', 0.5));
      P.poly([0.6, 0.5, 1.12, 0.4, 1.2, 0.62, 0.6, 0.66], mix(st, '#000000', 0.18));
      P.rect(0.32, 0.46, 0.36, 1.0, a || MAT.iron); P.rect(0.32, 0.6, 0.36, 0.06, mix(a || MAT.iron, '#ffffff', 0.3)); P.rect(0.32, 1.26, 0.36, 0.06, mix(a || MAT.iron, '#ffffff', 0.3));
      P.ell(0.5, 0.18, 0.12, 0.08, MAT.wood2);
    }],
    bow: [1, 3, function (P, c, a) {
      var wd = c || MAT.wood, pts = [], in2 = [], i;
      for (i = 0; i <= 24; i++) { var t = i / 24, y = 0.14 + t * 2.72, sn = Math.sin(t * Math.PI), x = 0.66 - sn * 0.46 + Math.pow(Math.abs(t - 0.5) * 2, 6) * 0.1, th = 0.05 + 0.1 * sn; pts.push(x - th, y); in2.push(x + th, y); }
      P.poly(pts.concat(in2.reverse()), wd);
      for (i = 2; i <= 22; i += 4) { var t3 = i / 24, y3 = 0.14 + t3 * 2.72, x3 = 0.66 - Math.sin(t3 * Math.PI) * 0.46; P.rect(x3 - 0.02, y3, 0.04, 0.05, mix(wd, '#000000', 0.25)); }
      P.rect(0.745, 0.17, 0.028, 2.66, '#efe6cc');
      P.rect(0.12, 1.26, 0.2, 0.48, a || MAT.leather); for (i = 0; i < 4; i++) P.rect(0.12, 1.3 + i * 0.12, 0.2, 0.035, MAT.leather2);
      P.ell(0.74, 0.15, 0.06, 0.05, MAT.bone); P.ell(0.74, 2.85, 0.06, 0.05, MAT.bone);
    }],
    staff: [1, 4, function (P, c, a) {
      P.rect(0.43, 0.72, 0.14, 3.2, c || MAT.wood);
      P.rect(0.43, 2.2, 0.14, 0.32, MAT.leather);
      P.poly([0.5, 0.78, 0.2, 0.62, 0.16, 0.3, 0.3, 0.12, 0.36, 0.3, 0.3, 0.55, 0.5, 0.66, 0.7, 0.55, 0.64, 0.3, 0.7, 0.12, 0.84, 0.3, 0.8, 0.62], MAT.wood2);
      P.poly([0.5, 0.1, 0.66, 0.36, 0.5, 0.62, 0.34, 0.36], a || MAT.purple);
      P.poly([0.5, 0.16, 0.58, 0.34, 0.5, 0.36], mix(a || MAT.purple, '#ffffff', 0.55));
    }],
    shield: [2, 2, function (P, c, a) {
      P.ell(1, 1, 0.92, 0.92, a || MAT.iron);
      P.ell(1, 1, 0.78, 0.78, c || MAT.wood);
      P.rect(0.62, 0.26, 0.05, 1.48, MAT.wood2); P.rect(1.33, 0.26, 0.05, 1.48, MAT.wood2);
      P.ell(1, 1, 0.24, 0.24, a || MAT.iron); P.ell(0.94, 0.94, 0.08, 0.08, mix(a || MAT.iron, '#ffffff', 0.5));
      P.ell(1, 0.18, 0.06, 0.06, MAT.brass); P.ell(1, 1.82, 0.06, 0.06, MAT.brass); P.ell(0.18, 1, 0.06, 0.06, MAT.brass); P.ell(1.82, 1, 0.06, 0.06, MAT.brass);
    }],
    helmet: [2, 2, function (P, c, a) {
      var st = c || MAT.steel, pts = [0.2, 1.3], k;
      for (k = 0; k <= 12; k++) { var t = Math.PI + k / 12 * Math.PI; pts.push(1 + Math.cos(t) * 0.8, 1.22 + Math.sin(t) * 1.02); }
      pts.push(1.8, 1.3, 1.74, 1.8, 1.4, 1.88, 1.32, 1.36, 0.68, 1.36, 0.6, 1.88, 0.26, 1.8);
      P.poly(pts, st);
      P.rect(0.68, 1.36, 0.64, 0.46, '#2a2226');
      P.rect(0.94, 0.22, 0.12, 0.92, mix(st, '#ffffff', 0.3));
      P.rect(0.2, 1.1, 1.6, 0.22, mix(st, '#000000', 0.28));
      P.rect(0.93, 1.1, 0.14, 0.62, mix(st, '#000000', 0.12));
      [0.36, 0.62, 1.38, 1.64].forEach(function (x) { P.ell(x, 1.21, 0.045, 0.045, mix(st, '#ffffff', 0.55)); });
      P.poly([1.0, 0.2, 1.22, 0.04, 1.44, 0.12, 1.12, 0.3], a || MAT.red);
    }],
    armor: [2, 3, function (P, c, a) {
      P.poly([0.12, 0.42, 0.64, 0.14, 1.36, 0.14, 1.88, 0.42, 1.86, 1.02, 1.56, 1.06, 1.54, 2.78, 0.46, 2.78, 0.44, 1.06, 0.14, 1.02], c || MAT.leather2);
      P.poly([0.74, 0.14, 1.26, 0.14, 1.0, 0.56], MAT.dark);
      P.poly([0.12, 0.42, 0.62, 0.2, 0.6, 0.98, 0.14, 1.02], mix(c || MAT.leather2, '#000000', 0.2));
      P.poly([1.88, 0.42, 1.38, 0.2, 1.4, 0.98, 1.86, 1.02], mix(c || MAT.leather2, '#000000', 0.2));
      P.rect(0.46, 1.98, 1.08, 0.2, MAT.leather); P.rect(0.9, 1.95, 0.2, 0.26, a || MAT.gold);
      P.rect(0.98, 0.6, 0.04, 1.35, mix(c || MAT.leather2, '#000000', 0.3));
      P.ell(0.72, 0.9, 0.05, 0.05, a || MAT.gold); P.ell(1.28, 0.9, 0.05, 0.05, a || MAT.gold);
    }],
    boots: [2, 2, function (P, c, a) {
      P.rect(0.14, 0.24, 0.74, 1.1, c || MAT.leather);
      P.poly([0.14, 1.2, 0.88, 1.2, 1.4, 1.3, 1.8, 1.48, 1.86, 1.86, 0.14, 1.86], c || MAT.leather);
      P.rect(0.1, 0.1, 0.82, 0.28, a || MAT.bone);
      P.rect(0.14, 1.74, 1.72, 0.14, MAT.dark);
      P.rect(0.5, 0.5, 0.3, 0.05, MAT.leather2); P.rect(0.5, 0.75, 0.3, 0.05, MAT.leather2); P.rect(0.5, 1.0, 0.3, 0.05, MAT.leather2);
    }],
    potion: [1, 1, function (P, c, a) {
      P.ell(0.5, 0.64, 0.32, 0.3, MAT.glass);
      P.rect(0.4, 0.16, 0.2, 0.26, MAT.glass);
      P.ell(0.5, 0.7, 0.27, 0.22, c || MAT.red);
      P.rect(0.37, 0.08, 0.26, 0.13, a || MAT.leather2);
      P.ell(0.39, 0.58, 0.05, 0.08, '#ffffff');
    }],
    herb: [1, 1, function (P, c) {
      P.rect(0.48, 0.5, 0.05, 0.42, '#3d6a2a');
      P.poly([0.5, 0.56, 0.18, 0.4, 0.14, 0.16, 0.36, 0.22, 0.5, 0.5], c || MAT.green);
      P.poly([0.52, 0.52, 0.66, 0.2, 0.88, 0.14, 0.86, 0.38, 0.54, 0.6], c || MAT.green);
      P.poly([0.5, 0.6, 0.3, 0.7, 0.16, 0.66, 0.26, 0.54, 0.5, 0.56], mix(c || MAT.green, '#000000', 0.2));
      P.ell(0.66, 0.74, 0.08, 0.08, '#e05a6a');
    }],
    bread: [2, 1, function (P, c) {
      P.ell(1, 0.62, 0.88, 0.32, '#7e4519');
      P.ell(1, 0.52, 0.86, 0.36, MAT.crust);
      P.ell(0.97, 0.43, 0.72, 0.25, c || MAT.bread);
      P.ell(0.9, 0.36, 0.45, 0.12, '#e3a85e');
      [0.72, 1.24].forEach(function (x) { P.poly([x - 0.2, 0.6, x + 0.1, 0.24, x + 0.24, 0.28, x - 0.06, 0.64], '#7a4318'); P.poly([x - 0.14, 0.58, x + 0.11, 0.28, x + 0.18, 0.3, x - 0.07, 0.6], '#f4d08e'); });
      [[0.45, 0.4], [0.8, 0.31], [1.2, 0.34], [1.55, 0.45], [1.05, 0.55]].forEach(function (q) { P.ell(q[0], q[1], 0.025, 0.02, '#f8ecd0'); });
    }],
    key: [2, 1, function (P, c, a) {
      var g = c || MAT.gold, d = mix(g, '#000000', 0.3), l = mix(g, '#ffffff', 0.4);
      P.ell(0.36, 0.13, 0.1, 0.09, g); P.ell(0.36, 0.87, 0.1, 0.09, g); P.ell(0.08, 0.5, 0.08, 0.1, g);
      P.ell(0.36, 0.5, 0.3, 0.34, g); P.ell(0.36, 0.5, 0.2, 0.23, d); P.hole(0.36, 0.5, 0.14, 0.16);
      P.rect(0.62, 0.34, 0.1, 0.32, d); P.rect(0.7, 0.41, 1.12, 0.18, g); P.rect(0.7, 0.41, 1.12, 0.05, l);
      P.rect(1.44, 0.57, 0.15, 0.33, g); P.rect(1.66, 0.57, 0.15, 0.24, g); P.rect(1.5, 0.7, 0.06, 0.1, d);
      P.ell(1.84, 0.5, 0.06, 0.11, d);
      P.ell(0.36, 0.15, 0.04, 0.03, a || MAT.red);
    }],
    gem: [1, 1, function (P, c) {
      var g = c || MAT.red;
      P.poly([0.3, 0.16, 0.7, 0.16, 0.88, 0.4, 0.5, 0.88, 0.12, 0.4], g);
      P.poly([0.3, 0.16, 0.5, 0.4, 0.12, 0.4], mix(g, '#ffffff', 0.35));
      P.poly([0.7, 0.16, 0.88, 0.4, 0.5, 0.4], mix(g, '#000000', 0.15));
      P.poly([0.12, 0.4, 0.5, 0.4, 0.5, 0.88], mix(g, '#ffffff', 0.12));
      P.poly([0.3, 0.16, 0.7, 0.16, 0.5, 0.4], mix(g, '#ffffff', 0.55));
    }],
    coins: [1, 1, function (P, c) {
      var g = c || MAT.gold, d = mix(g, '#000000', 0.38), m = mix(g, '#000000', 0.18), l = mix(g, '#ffffff', 0.35);
      for (var k = 0; k < 4; k++) { var y = 0.84 - k * 0.085; P.ell(0.4, y + 0.02, 0.3, 0.1, d); P.ell(0.4, y - 0.01, 0.3, 0.1, m); }
      P.ell(0.4, 0.55, 0.3, 0.1, g); P.ell(0.4, 0.55, 0.21, 0.065, m); P.ell(0.38, 0.54, 0.12, 0.03, l);
      P.ell(0.72, 0.5, 0.21, 0.27, d); P.ell(0.7, 0.48, 0.2, 0.26, g); P.ell(0.7, 0.48, 0.13, 0.17, m);
      P.poly([0.7, 0.36, 0.73, 0.45, 0.82, 0.48, 0.73, 0.51, 0.7, 0.6, 0.67, 0.51, 0.58, 0.48, 0.67, 0.45], l);
      P.ell(0.62, 0.36, 0.04, 0.06, '#fff6d8');
    }],
    scroll: [1, 2, function (P, c, a) {
      P.rect(0.24, 0.26, 0.52, 1.48, c || MAT.paper);
      P.ell(0.5, 0.24, 0.32, 0.12, mix(c || MAT.paper, '#000000', 0.12)); P.ell(0.5, 1.76, 0.32, 0.12, mix(c || MAT.paper, '#000000', 0.12));
      P.rect(0.34, 0.5, 0.32, 0.04, '#9a8a6a'); P.rect(0.34, 0.66, 0.28, 0.04, '#9a8a6a'); P.rect(0.34, 1.3, 0.3, 0.04, '#9a8a6a');
      P.rect(0.24, 0.92, 0.52, 0.14, a || MAT.red); P.ell(0.5, 0.99, 0.1, 0.1, a || MAT.red);
    }],
    ring: [1, 1, function (P, c, a) {
      P.ell(0.5, 0.58, 0.3, 0.27, c || MAT.gold); P.hole(0.5, 0.6, 0.18, 0.16);
      P.poly([0.38, 0.32, 0.5, 0.16, 0.62, 0.32, 0.5, 0.44], a || MAT.green);
    }],
    amulet: [1, 1, function (P, c, a) {
      P.poly([0.2, 0.1, 0.5, 0.46, 0.8, 0.1, 0.74, 0.08, 0.5, 0.38, 0.26, 0.08], c || MAT.steel);
      P.ell(0.5, 0.62, 0.22, 0.24, c || MAT.steel);
      P.ell(0.5, 0.62, 0.13, 0.15, a || MAT.blue);
    }],
    bomb: [1, 1, function (P, c) {
      P.ell(0.48, 0.6, 0.32, 0.32, c || MAT.dark);
      P.rect(0.56, 0.22, 0.14, 0.12, MAT.iron);
      P.poly([0.64, 0.22, 0.72, 0.1, 0.8, 0.12, 0.7, 0.24], MAT.wood2);
      P.ell(0.82, 0.1, 0.06, 0.06, MAT.flame);
      P.ell(0.38, 0.5, 0.06, 0.06, '#8a96a8');
    }],
    lantern: [1, 2, function (P, c, a) {
      P.rect(0.4, 0.08, 0.2, 0.1, c || MAT.iron); P.ell(0.5, 0.16, 0.1, 0.06, c || MAT.iron);
      P.rect(0.2, 0.3, 0.6, 0.14, c || MAT.iron);
      P.rect(0.26, 0.44, 0.48, 0.98, '#f6d68a');
      P.ell(0.5, 0.98, 0.13, 0.24, a || MAT.flame); P.ell(0.5, 1.04, 0.06, 0.12, '#fff4d0');
      P.rect(0.24, 0.44, 0.06, 0.98, c || MAT.iron); P.rect(0.7, 0.44, 0.06, 0.98, c || MAT.iron);
      P.rect(0.18, 1.42, 0.64, 0.18, c || MAT.iron); P.rect(0.26, 1.6, 0.48, 0.12, mix(c || MAT.iron, '#000000', 0.3));
    }],
    gel: [1, 1, function (P, c) {
      P.poly([0.14, 0.82, 0.16, 0.52, 0.34, 0.28, 0.5, 0.2, 0.66, 0.28, 0.84, 0.52, 0.86, 0.82], c || MAT.gel);
      P.ell(0.36, 0.42, 0.07, 0.1, '#ffffff'); P.rect(0.14, 0.76, 0.72, 0.06, mix(c || MAT.gel, '#000000', 0.3));
    }],
    relic: [3, 3, function (P, c, a) {
      var g = c || '#7fd8e8';
      P.poly([1.5, 0.1, 1.82, 1.18, 2.9, 1.5, 1.82, 1.82, 1.5, 2.9, 1.18, 1.82, 0.1, 1.5, 1.18, 1.18], g);
      P.poly([1.5, 0.1, 1.5, 1.5, 1.18, 1.18], mix(g, '#ffffff', 0.45)); P.poly([0.1, 1.5, 1.5, 1.5, 1.18, 1.18], mix(g, '#ffffff', 0.3));
      P.poly([2.9, 1.5, 1.5, 1.5, 1.82, 1.82], mix(g, '#000000', 0.2)); P.poly([1.5, 2.9, 1.5, 1.5, 1.82, 1.82], mix(g, '#000000', 0.12));
      P.ell(1.5, 1.5, 0.3, 0.3, a || MAT.gold); P.ell(1.5, 1.5, 0.16, 0.16, mix(a || MAT.gold, '#ffffff', 0.4));
    }],
    pick: [3, 3, function (P, c, a) {
      P.rect(1.38, 0.5, 0.24, 2.4, MAT.wood); P.rect(1.38, 2.4, 0.24, 0.4, MAT.leather);
      var pts = [], i; for (i = 0; i <= 12; i++) { var t = i / 12; pts.push(0.1 + t * 2.8, 0.62 - Math.sin(t * Math.PI) * 0.42); }
      for (i = 12; i >= 0; i--) { var t2 = i / 12; pts.push(0.1 + t2 * 2.8, 0.62 - Math.sin(t2 * Math.PI) * 0.42 + 0.16 + Math.sin(t2 * Math.PI) * 0.12); }
      P.poly(pts, c || MAT.iron);
      P.rect(1.3, 0.3, 0.4, 0.46, a || MAT.dark);
    }],
    root: [3, 2, function (P, c) {
      var g = c || '#8a6a44', d = mix(g, '#000000', 0.3), l = mix(g, '#ffffff', 0.25);
      P.poly([0.1, 1.62, 0.34, 1.3, 0.8, 1.16, 1.24, 0.86, 1.6, 0.44, 2.2, 0.22, 2.9, 0.2, 2.88, 0.52, 2.3, 0.6, 1.92, 0.82, 1.56, 1.3, 1.02, 1.6, 0.52, 1.74, 0.16, 1.86], g);
      P.poly([0.3, 1.5, 0.8, 1.32, 1.24, 1.06, 1.6, 0.62, 2.2, 0.4, 2.8, 0.34, 2.8, 0.4, 2.2, 0.48, 1.66, 0.7, 1.3, 1.12, 0.84, 1.4, 0.34, 1.58], d);
      P.poly([0.4, 1.38, 0.9, 1.22, 1.3, 0.94, 1.66, 0.5, 2.2, 0.28, 2.2, 0.32, 1.7, 0.56, 1.34, 1.0, 0.92, 1.28, 0.42, 1.42], l);
      P.poly([1.1, 1.3, 1.38, 1.62, 1.32, 1.86, 1.02, 1.52], g); P.poly([2.0, 0.42, 1.9, 0.1, 2.12, 0.08, 2.16, 0.36], g);
      P.ell(2.36, 0.42, 0.08, 0.06, '#6ab04c'); P.ell(2.5, 0.34, 0.06, 0.05, '#86c860'); P.ell(1.0, 1.42, 0.07, 0.05, d);
    }],
    hammer: [3, 2, function (P, c, a) {
      var st = c || MAT.iron, l = mix(st, '#ffffff', 0.35), d = mix(st, '#000000', 0.3);
      P.rect(1.4, 0.7, 0.2, 1.22, MAT.wood); P.rect(1.4, 1.42, 0.2, 0.42, MAT.leather); P.rect(1.4, 1.52, 0.2, 0.04, MAT.leather2); P.rect(1.4, 1.68, 0.2, 0.04, MAT.leather2);
      P.poly([0.12, 0.2, 0.3, 0.1, 2.7, 0.1, 2.88, 0.2, 2.88, 0.74, 2.7, 0.84, 0.3, 0.84, 0.12, 0.74], st);
      P.rect(0.3, 0.16, 2.4, 0.12, l); P.rect(0.3, 0.68, 2.4, 0.1, d);
      P.rect(1.2, 0.1, 0.6, 0.74, a || MAT.brass); P.rect(1.2, 0.1, 0.6, 0.1, mix(a || MAT.brass, '#ffffff', 0.35));
      [0.5, 2.5].forEach(function (x) { P.ell(x, 0.47, 0.06, 0.06, l); });
      P.ell(1.5, 1.9, 0.12, 0.07, a || MAT.brass);
    }],
    arrows: [1, 2, function (P, c, a) {
      P.rect(0.3, 0.14, 0.04, 1.2, MAT.wood); P.rect(0.48, 0.08, 0.04, 1.2, MAT.wood); P.rect(0.66, 0.16, 0.04, 1.2, MAT.wood);
      P.poly([0.28, 0.02, 0.36, 0.16, 0.24, 0.16], MAT.steel); P.poly([0.5, 0.0, 0.58, 0.12, 0.44, 0.12], MAT.steel); P.poly([0.68, 0.04, 0.76, 0.18, 0.62, 0.18], MAT.steel);
      P.rect(0.2, 0.7, 0.6, 1.2, c || MAT.leather); P.rect(0.2, 0.86, 0.6, 0.1, a || MAT.brass); P.rect(0.2, 1.62, 0.6, 0.1, a || MAT.brass);
    }],
    box: [1, 1, function (P, c) {
      P.rect(0.14, 0.18, 0.72, 0.68, c || MAT.wood); P.rect(0.14, 0.18, 0.72, 0.12, mix(c || MAT.wood, '#ffffff', 0.25));
      P.rect(0.14, 0.46, 0.72, 0.06, MAT.wood2); P.rect(0.46, 0.18, 0.08, 0.68, MAT.wood2);
    }]
  };
  var ART_OF_KIND = { weapon: 'sword', shield: 'shield', armor: 'armor', head: 'helmet', feet: 'boots', consumable: 'potion', food: 'bread',
    material: 'gem', key: 'key', quest: 'lantern', trinket: 'ring', ammo: 'arrows', treasure: 'coins', tool: 'pick' };

  function makePainter(g, k, ox, oy, flat) {
    function X(v) { return ox + v * k; } function Y(v) { return oy + v * k; }
    function fill(c, x0, y0, x1, y1) {   // a soft 3-tone ramp across the part (lit top-left, base, shade bottom-right)
      if (flat || !/^#/.test(c)) { g.fillStyle = c; return; }
      var gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, mix(c, '#fff4e0', 0.28)); gr.addColorStop(0.45, c); gr.addColorStop(1, mix(c, '#1a0e08', 0.34));
      g.fillStyle = gr;
    }
    return {
      rect: function (x, y, w, h, c) { fill(c, X(x), Y(y), X(x + w), Y(y + h)); g.fillRect(X(x), Y(y), w * k, h * k); },
      poly: function (p, c) {
        var mx = 1e9, my = 1e9, Mx = -1e9, My = -1e9, i;
        for (i = 0; i < p.length; i += 2) { mx = Math.min(mx, p[i]); Mx = Math.max(Mx, p[i]); my = Math.min(my, p[i + 1]); My = Math.max(My, p[i + 1]); }
        g.beginPath(); g.moveTo(X(p[0]), Y(p[1])); for (i = 2; i < p.length; i += 2) g.lineTo(X(p[i]), Y(p[i + 1])); g.closePath(); fill(c, X(mx), Y(my), X(Mx), Y(My)); g.fill();
      },
      ell: function (x, y, rx, ry, c) { g.beginPath(); g.ellipse(X(x), Y(y), Math.max(0.5, rx * k), Math.max(0.5, ry * k), 0, 0, Math.PI * 2); fill(c, X(x - rx), Y(y - ry), X(x + rx), Y(y + ry)); g.fill(); },
      hole: function (x, y, rx, ry) { var op = g.globalCompositeOperation; g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.ellipse(X(x), Y(y), Math.max(0.5, rx * k), Math.max(0.5, ry * k), 0, 0, Math.PI * 2); g.fillStyle = '#000'; g.fill(); g.globalCompositeOperation = op; }
    };
  }
  /* bevel + outline + light, in screen space; pixel = hard alpha and 1-px steps */
  function shade(cv, pixel, k) {
    var g = cv.getContext('2d'), W = cv.width, H = cv.height, id, d;
    try { id = g.getImageData(0, 0, W, H); } catch (e) { return; }
    d = id.data;
    var n = W * H, A = new Uint8Array(n), i, x, y;
    for (i = 0; i < n; i++) { if (pixel) { if (d[i * 4 + 3] >= 110) { d[i * 4 + 3] = 255; A[i] = 1; } else d[i * 4 + 3] = 0; } else A[i] = d[i * 4 + 3] > 24 ? 1 : 0; }
    var src = new Uint8ClampedArray(d), b = pixel ? 1 : Math.max(2, Math.round(k * 0.055));
    function diff(i, j) { if (!A[j]) return true; return Math.abs(src[i * 4] - src[j * 4]) + Math.abs(src[i * 4 + 1] - src[j * 4 + 1]) + Math.abs(src[i * 4 + 2] - src[j * 4 + 2]) > 54; }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x; if (!A[i]) continue;
      var dl = 0, dd = 0, q;
      for (q = 1; q <= b && !dl; q++) if (x - q < 0 || y - q < 0 || diff(i, i - q) || diff(i, i - q * W)) dl = q;
      for (q = 1; q <= b && !dd; q++) if (x + q >= W || y + q >= H || diff(i, i + q) || diff(i, i + q * W)) dd = q;
      var f = 1;
      if (!pixel) { f = 1.2 - 0.42 * ((x / W + y / H) / 2); var hn = Math.imul((x >> 1) * 73856093 ^ (y >> 1) * 19349663, 2654435761) >>> 0; f *= 0.955 + 0.09 * (hn / 4294967296); }
      var r = src[i * 4] * f, gg = src[i * 4 + 1] * f, bb = src[i * 4 + 2] * f;
      var lit = dl ? 1 - (dl - 1) / b : 0, dim = dd ? 1 - (dd - 1) / b : 0;
      if (lit >= dim && lit > 0) { var t = (pixel ? 0.36 : 0.42) * lit * lit; r += (255 - r) * t; gg += (255 - gg) * t; bb += (255 - bb) * t; }
      else if (dim > 0) { var t2 = 1 - (pixel ? 0.34 : 0.5) * dim; r *= t2; gg *= t2; bb *= t2 * 1.04; }
      d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = bb;
    }
    var ow = pixel ? 1 : Math.max(2, Math.round(k * 0.04)), Mk = A, z;
    for (z = 0; z < ow; z++) {
      var N = new Uint8Array(Mk);
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        i = y * W + x; if (Mk[i]) continue;
        if ((x > 0 && Mk[i - 1]) || (x < W - 1 && Mk[i + 1]) || (y > 0 && Mk[i - W]) || (y < H - 1 && Mk[i + W])) { N[i] = 2; d[i * 4] = 30; d[i * 4 + 1] = 19; d[i * 4 + 2] = 13; d[i * 4 + 3] = pixel ? 255 : (z === ow - 1 ? 150 : 240); }
      }
      Mk = N;
    }
    g.putImageData(id, 0, 0);
  }
  var ART_CACHE = {}, ART_N = 0;
  function artKey(item, o, w, h, pixel) { return (item._key || item.id) + '|' + o + '|' + w + 'x' + h + '|' + (pixel ? 'p' : 'h'); }
  /* returns {img, sil} drawn for orientation o into a w x h px box (device px) */
  function renderArt(item, o, w, h, pixel) {
    var key = artKey(item, o, w, h, pixel);
    if (ART_CACHE[key]) return ART_CACHE[key];
    if (ART_N > 600) { ART_CACHE = {}; ART_N = 0; }
    var cv = mkCanvas(w, h); if (!cv) return null;
    var g = cv.getContext('2d'), sh = item._shape, bw = sh.w, bh = sh.h;   // authored box in cells (orientation 0)
    var Aa = ARTS[item._art] || ARTS.box, turnArt = !item.image && Aa[0] !== Aa[1] && Aa[0] === sh.h && Aa[1] === sh.w ? 1 : 0;
    var oa = (o + turnArt) & 3;                                              // a 2x1 art in a 1x2 footprint is drawn turned so it fills it
    var W0 = (oa & 1) ? h : w, H0 = (oa & 1) ? w : h;                       // the art's unturned box in px
    var M = orientMatrix(oa, W0, H0);
    g.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
    g.imageSmoothingEnabled = !pixel;
    if (item.image) {
      try {
        var im = item.image, cr = item.crop || [0, 0, im.naturalWidth || im.width, im.naturalHeight || im.height];
        var pad = 0.04 * Math.min(W0 / bw, H0 / bh), sc = Math.min((W0 - pad * 2) / cr[2], (H0 - pad * 2) / cr[3]);
        var dw = cr[2] * sc, dh = cr[3] * sc;
        g.drawImage(im, cr[0], cr[1], cr[2], cr[3], (W0 - dw) / 2, (H0 - dh) / 2, dw, dh);
      } catch (e) { }
    } else {
      var A = ARTS[item._art] || ARTS.box, aw = A[0], ah = A[1];
      var k = Math.min(W0 / aw, H0 / ah), pad0 = pixel ? 0 : 0.06 * k;
      k = Math.min((W0 - pad0 * 2) / aw, (H0 - pad0 * 2) / ah);
      var ox = (W0 - aw * k) / 2, oy = (H0 - ah * k) / 2;
      if (pixel) { ox = Math.round(ox); oy = Math.round(oy); }
      try { A[2](makePainter(g, k, ox, oy, pixel), item.color, item.accent); } catch (e) { }
      g.setTransform(1, 0, 0, 1, 0, 0);
      shade(cv, pixel, k);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    var sil = mkCanvas(w, h);
    if (sil) { var sg = sil.getContext('2d'); sg.drawImage(cv, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#000'; sg.fillRect(0, 0, w, h); }
    ART_N++;
    return (ART_CACHE[key] = { img: cv, sil: sil });
  }

  /* bold silhouette glyph of an art, upright, at its own aspect (never stretched): one light fill, a dark rim */
  var GLYPH_CACHE = {}, GLYPH_N = 0;
  function renderGlyph(item, w, h, pixel) {
    var key = (item._key || item.id) + '|g|' + w + 'x' + h + (pixel ? 'p' : 'h');
    if (GLYPH_CACHE[key]) return GLYPH_CACHE[key];
    if (GLYPH_N > 400) { GLYPH_CACHE = {}; GLYPH_N = 0; }
    var A = ARTS[item._art] || ARTS.box, cv = mkCanvas(w, h); if (!cv) return null;
    var g = cv.getContext('2d'), ow = pixel ? 1 : Math.max(2, Math.round(Math.min(w, h) * 0.06)), k = Math.min((w - ow * 2) / A[0], (h - ow * 2) / A[1]);
    try { A[2](makePainter(g, k, (w - A[0] * k) / 2, (h - A[1] * k) / 2, true), item.color, item.accent); } catch (e) { }
    var fill = mix(item.color && /^#/.test(item.color) ? item.color : '#efe2c4', '#f6ecd4', 0.62);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = fill; g.fillRect(0, 0, w, h);
    var out = mkCanvas(w, h), og = out && out.getContext('2d'); if (!og) return null;
    og.fillStyle = '#1e140e';
    for (var a = 0; a < 16; a++) { var ang = a / 16 * Math.PI * 2; og.save(); og.translate(Math.cos(ang) * ow, Math.sin(ang) * ow); og.drawImage(cv, 0, 0); og.restore(); }
    og.globalCompositeOperation = 'source-in'; og.fillRect(0, 0, w, h); og.globalCompositeOperation = 'source-over';
    og.drawImage(cv, 0, 0);
    var gr = og.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(60,30,10,0.22)');
    og.globalCompositeOperation = 'source-atop'; og.fillStyle = gr; og.fillRect(0, 0, w, h); og.globalCompositeOperation = 'source-over';
    if (pixel) { try { var id = og.getImageData(0, 0, w, h), d = id.data; for (var i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0; og.putImageData(id, 0, 0); } catch (e) { } }
    GLYPH_N++;
    return (GLYPH_CACHE[key] = { img: out, aspect: A[0] / A[1] });
  }
  /* 16x16 hand-pixelled glyphs for pixel hosts: 1-3 = main ramp (dark, mid, light), 4-6 = accent ramp, g = glass; '.' empty.
     The 1-px outline is added around the filled pixels; the ramps come from the item's colour so the glyphs take the game's palette. */
  var PX = {
    bread: ['', '', '', '', '.....222222', '...2233333322', '..233323332332', '..232333233232', '.22333233323322', '.22222222222222', '.21111111111112', '..111111111111'],
    potion: ['', '......4554', '......4664', '.......gg', '.......gg', '.....gg22gg', '....g322222g', '...g33222221g', '...g32222221g', '...g22222211g', '...g22222111g', '....g221111g', '.....gggggg'],
    scroll: ['', '...3333333333', '...2222222222', '...1111111111', '....32222223', '....31212123', '....32222223', '....32245223', '....32212123', '....32222223', '....31121223', '...3333333333', '...2222222222', '...1111111111'],
    boots: ['', '....6666', '....5555', '....3222', '....3221', '....3221', '....3221', '....32211', '....322211', '....3222221', '....32222221', '....322222222211', '....322222222221', '....444444444444'],
    sword: ['.......33', '.......32', '......332', '......321', '......321', '......321', '......321', '......321', '......321', '......321', '....55566555', '....44444444', '.......44', '.......44', '......5665', '.......55'],
    bow: ['......22', '.....21.g', '....21...g', '...21....g', '..21.....g', '..21.....g', '.21......g', '.44......g', '.44......g', '.21......g', '..21.....g', '..21.....g', '...21....g', '....21...g', '.....21.g', '......22'],
    key: ['', '....3333', '...32..23', '...2....2', '...2....2', '...12..21', '....1221', '.....22', '.....22', '.....22', '.....2222', '.....22', '.....2222', '.....22', '.....11'],
    coin: ['', '.....333333', '....32222223', '...3223333221', '...3232222121', '...3232332121', '...3232222121', '...3223111221', '....12222221', '.....111111', '....33333333', '...3222222221', '...1111111111'],
    gem: ['', '', '.....333333', '....33222232', '...3322222221', '..333333222111', '...3322222111', '....32222211', '.....322211', '......3211', '.......31'],
    ring: ['', '.......55', '......5665', '.......55', '.....333333', '....32....23', '...32......21', '...2........1', '...2........1', '...21......11', '....21....11', '.....111111'],
    helm: ['', '......3333', '....33322223', '...3322222221', '...3222222221', '..332222222221', '..322222222211', '..444444444444', '..32221..12221', '..3221....1221', '..3221....1221', '..3221....1221', '...21......12'],
    herb: ['', '.........33', '........3221', '...33...3221', '..3221..321', '..3221.321', '...321321', '....3321...33', '.....21...3221', '.....2...3221', '.....2..321', '.....2.321', '.....221', '.....2', '.....1']
  };
  var PX_RAMP = { bread: ['#c98a44', '#7a5a30'], potion: ['#d0473f', '#a26a3c'], scroll: ['#e8dcb8', '#c0392b'], boots: ['#8a5a34', '#3c3030'], sword: ['#b9c5d2', '#c79a4a'],
    bow: ['#8d5c33', '#7c4c2c'], key: ['#e3b448', '#e3b448'], coin: ['#e3b448', '#e3b448'], gem: ['#d0473f', '#d0473f'], ring: ['#e3b448', '#4fae4c'], helm: ['#b9c5d2', '#c79a4a'], herb: ['#4fae4c', '#4fae4c'] };
  var PX_OF_ART = { sword: 'sword', dagger: 'sword', axe: 'sword', hammer: 'sword', staff: 'sword', pick: 'sword', bow: 'bow', potion: 'potion', bread: 'bread', scroll: 'scroll',
    boots: 'boots', key: 'key', lantern: 'key', coins: 'coin', gem: 'gem', relic: 'gem', ring: 'ring', amulet: 'ring', helmet: 'helm', armor: 'helm', shield: 'helm', herb: 'herb', root: 'herb', gel: 'potion', bomb: 'potion', arrows: 'bow', box: 'coin' };
  var PX_OF_KIND = { weapon: 'sword', tool: 'sword', ammo: 'bow', shield: 'helm', armor: 'helm', head: 'helm', feet: 'boots', consumable: 'potion', food: 'bread', misc: 'scroll',
    material: 'gem', treasure: 'coin', trinket: 'ring', key: 'key', quest: 'key' };
  var PXG_CACHE = {};
  function pixelGlyph(item, outline) {
    var name = item.pixelGlyph || PX_OF_ART[item._art] || PX_OF_KIND[item.kind] || 'coin', key = (item._key || item.id) + '|px|' + name + '|' + outline;
    if (PXG_CACHE[key]) return PXG_CACHE[key];
    var rows = PX[name] || PX.coin, cv = mkCanvas(16, 16); if (!cv) return null;
    var g = cv.getContext('2d'), base = item.color && /^#/.test(item.color) ? item.color : PX_RAMP[name][0], acc = item.accent && /^#/.test(item.accent) ? item.accent : PX_RAMP[name][1];
    var col = { '1': mix(base, '#140c10', 0.42), '2': base, '3': mix(base, '#fff6e0', 0.45), '4': mix(acc, '#140c10', 0.4), '5': acc, '6': mix(acc, '#fff6e0', 0.45), g: '#cfe2ea' };
    var fill = {}, x, y;
    for (y = 0; y < 16; y++) { var r = rows[y] || ''; for (x = 0; x < 16; x++) { var ch = r[x]; if (ch && ch !== '.' && ch !== ' ' && col[ch]) { g.fillStyle = col[ch]; g.fillRect(x, y, 1, 1); fill[x + ',' + y] = 1; } } }
    g.fillStyle = outline;
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) if (!fill[x + ',' + y] && (fill[(x - 1) + ',' + y] || fill[(x + 1) + ',' + y] || fill[x + ',' + (y - 1)] || fill[x + ',' + (y + 1)])) g.fillRect(x, y, 1, 1);
    return (PXG_CACHE[key] = { img: cv, name: name });
  }
  /* Footprint glyphs for pixel looks: one per art, hand-placed pixel by pixel in code at 16 px per cell, sized to the art's own
     footprint (a 1x3 sword is 16x48, an L boot 32x32 with the empty corner left empty). Tones: 2 main, 6 accent, 11 wood (each
     auto-shaded to a 3-step ramp: lit top-left, dark bottom-right), 4 highlight, 8 glass / paper-light, 13 ink, 0 erase.
     A 1-px outline is added around every filled pixel. Pure data: pixelGlyphData() works without a canvas (checks use it). */
  function GD(w, h) {
    var a = new Uint8Array(w * h);
    function p(x, y, t) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) a[y * w + x] = t; }
    return { w: w, h: h, a: a, p: p,
      r: function (x, y, rw, rh, t) { for (var j = 0; j < rh; j++) for (var i = 0; i < rw; i++) p(x + i, y + j, t); },
      ln: function (x0, y0, x1, y1, t, th) { var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); th = th || 1; for (var k = 0; k <= n; k++) { var x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n; for (var q = 0; q < th; q++) for (var q2 = 0; q2 < th; q2++) p(x + q - (th >> 1), y + q2 - (th >> 1), t); } },
      el: function (cx, cy, rx, ry, t, cond) { for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { var dx = (x - cx) / (rx + 0.35), dy = (y - cy) / (ry + 0.35); if (dx * dx + dy * dy <= 1 && (!cond || cond(x, y))) p(x, y, t); } },
      rows: function (y0, y1, f, t) { for (var y = y0; y <= y1; y++) { var sp = f(y); if (sp) for (var x = sp[0]; x <= sp[1]; x++) p(x, y, t); } }
    };
  }
  function staffFn(D) {
    var h = D.h; D.r(7, 12, 3, h - 15, 11); D.r(7, Math.round(h * 0.47), 3, 3, 13); D.r(7, Math.round(h * 0.47) + 1, 3, 1, 6); D.ln(5, 11, 4, 4, 11, 2); D.ln(11, 11, 12, 4, 11, 2); D.ln(7, 12, 5, 11, 11);
    D.el(8, 6, 3, 4, 6); D.p(7, 4, 4); D.p(7, 5, 4); D.el(8, h - 3, 2, 1, 13);
  }
  var FG_ALT = { armor: ['vest'], staff: ['staff3'], sword: ['dagger'], bow: ['shortbow'] };
  var FG = {
    sword: [1, 3, '#b9c5d2', '#c79a4a', function (D) { D.p(8, 1, 2); D.r(7, 2, 3, 29, 2); D.ln(8, 4, 8, 29, 1); D.p(7, 3, 4); D.p(7, 4, 4); D.r(3, 31, 11, 3, 6); D.p(3, 30, 6); D.p(13, 30, 6); D.r(7, 34, 3, 8, 11); [35, 37, 39, 41].forEach(function (y) { D.r(7, y, 3, 1, 13); }); D.el(8, 44, 2, 2, 6); D.p(7, 43, 4); }],
    dagger: [1, 2, '#c4ced9', '#c79a4a', function (D) { D.p(8, 2, 2); D.r(7, 3, 3, 15, 2); D.ln(8, 5, 8, 16, 1); D.p(7, 4, 4); D.r(3, 18, 11, 2, 6); D.r(7, 20, 3, 6, 11); D.r(7, 22, 3, 1, 13); D.el(8, 27, 2, 2, 6); }],
    axe: [2, 3, '#b9c5d2', '#6f7b88', function (D) {
      D.r(6, 3, 4, 43, 11); D.r(6, 34, 4, 10, 13); [35, 38, 41].forEach(function (y) { D.r(6, y, 4, 1, 10); }); D.p(7, 3, 12);
      D.rows(5, 29, function (y) { var w = Math.round(9 + 12 * Math.sin((y - 5) / 24 * Math.PI)); return [10, Math.min(30, 10 + w)]; }, 2);
      D.rows(6, 28, function (y) { var w = Math.round(9 + 12 * Math.sin((y - 5) / 24 * Math.PI)); return [10 + w - 2, Math.min(30, 10 + w)]; }, 4);
      D.r(4, 8, 8, 12, 6); D.r(4, 10, 8, 1, 13); D.r(4, 17, 8, 1, 13); D.p(13, 17, 13); }],
    bow: [1, 3, '#8d5c33', '#7c4c2c', function (D) {
      for (var y = 2; y <= 45; y++) { var t = (y - 2) / 43, x = 10 - Math.round(7 * Math.sin(t * Math.PI)); D.p(x, y, 11); D.p(x + 1, y, 11); if (t > 0.38 && t < 0.62) D.p(x - 1, y, 11); }
      D.r(2, 20, 4, 8, 6); D.r(2, 22, 4, 1, 13); D.r(2, 25, 4, 1, 13); D.ln(11, 3, 12, 6, 8); D.ln(12, 6, 12, 41, 8); D.ln(12, 41, 11, 44, 8); D.p(10, 1, 6); D.p(10, 46, 6); }],
    shortbow: [1, 2, '#8d5c33', '#7c4c2c', function (D) {
      for (var y = 2; y <= 29; y++) { var t = (y - 2) / 27, x = 10 - Math.round(6 * Math.sin(t * Math.PI)); D.p(x, y, 11); D.p(x + 1, y, 11); if (t > 0.35 && t < 0.65) D.p(x - 1, y, 11); }
      D.r(3, 13, 4, 6, 6); D.r(3, 15, 4, 1, 13); D.ln(11, 3, 12, 5, 8); D.ln(12, 5, 12, 26, 8); D.ln(12, 26, 11, 28, 8); D.p(10, 1, 6); D.p(10, 30, 6); }],
    staff: [1, 4, '#8d5c33', '#9a5ad0', staffFn],
    staff3: [1, 3, '#8d5c33', '#9a5ad0', staffFn],
    vest: [2, 2, '#a26a3c', '#e3b448', function (D) {
      D.r(8, 6, 16, 23, 2); D.el(8, 8, 5, 4, 2); D.el(24, 8, 5, 4, 2); D.r(3, 8, 5, 9, 2); D.r(24, 8, 5, 9, 2); D.r(3, 15, 5, 2, 13); D.r(24, 15, 5, 2, 13);
      D.ln(12, 3, 16, 9, 13); D.ln(20, 3, 16, 9, 13); D.r(13, 3, 7, 2, 13); D.ln(16, 10, 16, 20, 1); D.r(8, 21, 16, 3, 13); D.r(15, 21, 3, 3, 6); D.r(9, 28, 14, 1, 1); D.p(9, 7, 4); D.p(10, 7, 4); }],
    shield: [2, 2, '#8d5c33', '#8a96a8', function (D) {
      D.el(15.5, 15.5, 14, 14, 6); D.el(15.5, 15.5, 11.5, 11.5, 11); [9, 15, 22].forEach(function (x) { D.ln(x, 5, x, 26, 10); });
      D.el(15.5, 15.5, 4, 4, 6); D.p(14, 14, 4); D.p(15, 14, 4); [[15, 2], [2, 15], [29, 16], [16, 29], [6, 6], [25, 6], [6, 25], [25, 25]].forEach(function (q) { D.p(q[0], q[1], 4); }); }],
    helmet: [2, 2, '#b9c5d2', '#c0473f', function (D) {
      D.el(16, 16, 12, 13, 2, function (x, y) { return y <= 16; }); D.r(4, 15, 24, 3, 6); D.r(5, 18, 7, 10, 2); D.r(20, 18, 7, 10, 2); D.r(12, 18, 8, 8, 13); D.r(15, 15, 2, 12, 2);
      D.ln(16, 4, 16, 14, 4); [7, 11, 21, 25].forEach(function (x) { D.p(x, 16, 4); }); D.ln(17, 3, 22, 1, 6, 2); D.ln(16, 2, 19, 0, 6); }],
    armor: [2, 3, '#a26a3c', '#e3b448', function (D) {
      D.r(8, 8, 16, 35, 2); D.el(8, 11, 6, 5, 2); D.el(24, 11, 6, 5, 2); D.r(2, 11, 6, 13, 2); D.r(24, 11, 6, 13, 2); D.r(2, 22, 6, 2, 13); D.r(24, 22, 6, 2, 13);
      D.ln(12, 5, 16, 13, 13); D.ln(20, 5, 16, 13, 13); D.r(13, 5, 7, 2, 13); D.ln(16, 14, 16, 28, 1); D.r(8, 30, 16, 3, 13); D.r(15, 30, 3, 3, 6); D.r(9, 42, 14, 2, 1);
      [[11, 18], [21, 18], [11, 24], [21, 24]].forEach(function (q) { D.p(q[0], q[1], 6); }); D.p(9, 9, 4); D.p(10, 9, 4); }],
    boots: [2, 2, '#7c4c2c', '#e8dcb8', function (D) {
      D.r(4, 5, 10, 18, 2); D.r(3, 2, 12, 4, 6); D.r(4, 21, 23, 7, 2); D.el(26, 24, 3, 3.5, 2); D.r(4, 27, 25, 3, 13); [9, 13, 17].forEach(function (y) { D.ln(6, y, 11, y, 13); });
      D.ln(14, 22, 20, 22, 1); D.p(5, 7, 4); D.p(5, 8, 4); }],
    potion: [1, 1, '#d0473f', '#a26a3c', function (D) { D.el(8, 10, 5, 4.5, 8); D.el(8, 11, 4, 3, 2, function (x, y) { return y >= 9; }); D.r(7, 3, 3, 4, 8); D.r(6, 1, 5, 2, 6); D.p(6, 8, 4); D.p(5, 9, 4); }],
    herb: [1, 1, '#4fae4c', '#e05a6a', function (D) { D.ln(8, 14, 8, 6, 11); D.ln(3, 3, 7, 7, 2, 3); D.ln(13, 2, 9, 7, 2, 3); D.ln(3, 10, 7, 11, 2, 2); D.ln(13, 9, 9, 11, 2, 2); D.p(3, 2, 4); D.p(12, 1, 4); D.p(11, 13, 6); D.p(12, 13, 6); D.p(11, 12, 6); }],
    bread: [2, 1, '#c98a44', '#f4d08e', function (D) { D.el(16, 9.5, 14, 5.5, 2); D.el(15, 7.5, 11, 3, 2); [[8, 6], [14, 5], [20, 5]].forEach(function (q) { D.ln(q[0], q[1] + 4, q[0] + 3, q[1], 6); }); D.p(10, 5, 4); D.p(11, 5, 4); }],
    key: [2, 1, '#e3b448', '#c0473f', function (D) { D.el(6, 8, 5, 5, 2); D.el(6, 8, 2, 2, 0); D.r(11, 7, 18, 3, 2); D.r(11, 6, 2, 5, 1); D.r(23, 10, 2, 4, 2); D.r(27, 10, 2, 3, 2); D.p(4, 5, 4); D.p(6, 2, 6); }],
    gem: [1, 1, '#d0473f', '#d0473f', function (D) { D.rows(3, 13, function (y) { return y <= 5 ? [5 - (y - 3), 10 + (y - 3)] : [2 + Math.round((y - 5) * 0.75), 13 - Math.round((y - 5) * 0.75)]; }, 2); D.r(5, 3, 6, 1, 4); D.ln(4, 6, 11, 6, 1); D.ln(6, 7, 8, 12, 4); }],
    coins: [1, 1, '#e3b448', '#e3b448', function (D) { [[5, 11], [11, 11], [8, 5]].forEach(function (q) { D.el(q[0], q[1], 3.8, 3.8, 2); D.el(q[0], q[1], 2.2, 2.2, 1); D.el(q[0], q[1], 1.4, 1.4, 2); D.p(q[0] - 2, q[1] - 2, 4); }); }],
    scroll: [1, 2, '#e8dcb8', '#c0392b', function (D) { D.r(3, 5, 10, 22, 2); D.el(8, 4, 6, 2, 11); D.el(8, 28, 6, 2, 11); [9, 12, 20, 23].forEach(function (y) { D.ln(5, y, 10, y, 13); }); D.el(8, 16, 2, 2, 6); D.p(4, 6, 4); }],
    ring: [1, 1, '#e3b448', '#4fae4c', function (D) { D.el(8, 10, 5.5, 4.5, 2); D.el(8, 10, 3, 2, 0); D.el(8, 4.5, 2.2, 2.2, 6); D.p(7, 3, 4); }],
    amulet: [1, 1, '#b9c5d2', '#3f7ad8', function (D) { D.ln(3, 1, 7, 7, 11); D.ln(13, 1, 9, 7, 11); D.el(8, 10, 4, 4.5, 2); D.el(8, 10, 2, 2.5, 6); D.p(6, 8, 4); }],
    bomb: [1, 1, '#3c4450', '#ffcf5a', function (D) { D.el(7, 10, 5, 5, 2); D.r(9, 4, 3, 2, 1); D.ln(11, 4, 13, 1, 11); D.p(14, 1, 6); D.p(14, 0, 4); D.p(5, 7, 4); D.p(5, 8, 4); }],
    lantern: [1, 2, '#6f7b88', '#ffcf5a', function (D) { D.el(8, 2, 2, 1.5, 0); D.r(7, 1, 3, 1, 1); D.r(4, 4, 9, 3, 2); D.r(5, 7, 7, 15, 8); D.el(8, 15, 2, 4, 6); D.p(8, 16, 4); D.r(4, 7, 1, 15, 2); D.r(12, 7, 1, 15, 2); D.r(4, 22, 9, 3, 2); D.r(5, 25, 7, 2, 1); }],
    gel: [1, 1, '#58b8e0', '#58b8e0', function (D) { D.el(8, 10.5, 6, 4.5, 2); D.el(8, 7, 3.5, 3, 2); D.p(6, 6, 4); D.p(5, 7, 4); D.p(6, 10, 13); D.p(10, 10, 13); }],
    relic: [3, 3, '#7fd8e8', '#e3b448', function (D) {
      for (var y = 0; y < 48; y++) for (var x = 0; x < 48; x++) { var ax = Math.abs(x - 23.5), ay = Math.abs(y - 23.5); if (ax / 6.5 + ay / 22 <= 1 || ax / 22 + ay / 6.5 <= 1) D.p(x, y, 2); }
      D.ln(23, 4, 23, 22, 4); D.ln(5, 23, 22, 23, 4); D.el(23.5, 23.5, 5, 5, 6); D.el(23.5, 23.5, 2, 2, 4); }],
    pick: [3, 3, '#6f7b88', '#3c4450', function (D) {
      D.r(22, 10, 4, 36, 11); D.r(22, 38, 4, 7, 13); [39, 42].forEach(function (y) { D.r(22, y, 4, 1, 10); });
      for (var x = 2; x <= 45; x++) { var y0 = 4 + Math.round(Math.pow(Math.abs(x - 23.5) / 21.5, 2) * 7); D.r(x, y0, 1, x < 5 || x > 42 ? 2 : 4, 2); }
      D.r(19, 3, 10, 9, 6); D.p(20, 4, 4); }],
    root: [3, 2, '#8a6a44', '#6ab04c', function (D) {
      D.ln(3, 27, 18, 21, 2, 4); D.ln(18, 21, 28, 13, 2, 5); D.ln(28, 13, 45, 6, 2, 4); D.ln(20, 21, 24, 29, 2, 2); D.ln(34, 10, 32, 2, 2, 2); D.ln(10, 25, 12, 30, 2, 1);
      D.p(38, 6, 6); D.p(39, 5, 6); D.p(41, 6, 6); D.ln(8, 24, 26, 13, 4); }],
    hammer: [3, 2, '#6f7b88', '#c79a4a', function (D) { D.r(3, 3, 42, 11, 2); D.r(20, 3, 8, 11, 6); D.r(3, 3, 42, 1, 4); D.r(22, 14, 4, 15, 11); D.r(22, 22, 4, 6, 13); D.r(21, 28, 6, 2, 6); D.p(6, 8, 4); D.p(41, 8, 4); }],
    arrows: [1, 2, '#7c4c2c', '#c79a4a', function (D) { [5, 8, 11].forEach(function (x, i) { D.ln(x, 2 + i % 2, x, 13, 11); D.p(x, 1 + i % 2, 8); D.p(x - 1, 2 + i % 2, 8); D.p(x + 1, 2 + i % 2, 8); }); D.r(3, 12, 10, 18, 2); D.r(3, 14, 10, 2, 6); D.r(3, 26, 10, 2, 6); }],
    box: [1, 1, '#8d5c33', '#6f7b88', function (D) { D.r(2, 3, 12, 11, 11); D.ln(2, 8, 13, 8, 10); D.ln(7, 3, 7, 13, 10); [[3, 4], [12, 4], [3, 12], [12, 12]].forEach(function (q) { D.p(q[0], q[1], 6); }); }]
  };
  var FG_RAMP = { 10: '#5a3a20', 11: '#8d5c33', 12: '#b88452' };
  function fgAuto(D) {   // 3-step ramps from the authored mid tones: lit where the up / left neighbour is empty, dark where down / right is
    var w = D.w, h = D.h, a = D.a, b = new Uint8Array(a), mid = { 2: [3, 1], 6: [7, 5], 11: [12, 10] };
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var t = a[y * w + x]; if (!mid[t]) continue;
      var up = y === 0 || !a[(y - 1) * w + x], lf = x === 0 || !a[y * w + x - 1], dn = y === h - 1 || !a[(y + 1) * w + x], rt = x === w - 1 || !a[y * w + x + 1];
      if (up || lf) b[y * w + x] = mid[t][0]; else if (dn || rt) b[y * w + x] = mid[t][1];
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (!b[y * w + x] && ((x > 0 && b[y * w + x - 1] && b[y * w + x - 1] !== 99) || (x < w - 1 && b[y * w + x + 1] && b[y * w + x + 1] !== 99) || (y > 0 && b[(y - 1) * w + x] && b[(y - 1) * w + x] !== 99) || (y < h - 1 && b[(y + 1) * w + x] && b[(y + 1) * w + x] !== 99))) b[y * w + x] = 99;   // outline
    return b;
  }
  var FGD_CACHE = {};
  function pixelArtFor(item) { return item.pixelArt || (FG[item._art] ? item._art : 'box'); }
  function pixelGlyphData(art) {
    if (FGD_CACHE[art]) return FGD_CACHE[art];
    var F = FG[art] || FG.box, D = GD(16 * F[0], 16 * F[1]); try { F[4](D); } catch (e) { }
    return (FGD_CACHE[art] = { art: art, w: D.w, h: D.h, aw: F[0], ah: F[1], fill: D.a, tones: fgAuto(D) });
  }
  function pixelGlyphColors(item, art, outline) {
    var F = FG[art] || FG.box, m = item.color && /^#/.test(item.color) ? item.color : F[2], ac = item.accent && /^#/.test(item.accent) ? item.accent : F[3];
    return { 1: mix(m, '#140c10', 0.42), 2: m, 3: mix(m, '#fff6e0', 0.38), 4: mix(m, '#ffffff', 0.72), 5: mix(ac, '#140c10', 0.4), 6: ac, 7: mix(ac, '#fff6e0', 0.4),
      8: '#d8ecf2', 10: FG_RAMP[10], 11: FG_RAMP[11], 12: FG_RAMP[12], 13: '#2a1a14', 99: outline };
  }
  var FGC_CACHE = {};
  function footprintGlyph(item, outline) {
    var art = pixelArtFor(item), key = (item._key || item.id) + '|fg|' + art + '|' + outline;
    if (FGC_CACHE[key]) return FGC_CACHE[key];
    var G = pixelGlyphData(art), cv = mkCanvas(G.w, G.h); if (!cv) return null;
    var g = cv.getContext('2d'), C = pixelGlyphColors(item, art, outline);
    for (var i = 0; i < G.tones.length; i++) { var t = G.tones[i]; if (t && C[t]) { g.fillStyle = C[t]; g.fillRect(i % G.w, (i / G.w) | 0, 1, 1); } }
    return (FGC_CACHE[key] = { img: cv, art: art, w: G.w, h: G.h, aw: G.aw, ah: G.ah, shape: parseShape(FG_SHAPE[art] || (G.aw + 'x' + G.ah)) });
  }
  var FG_SHAPE = { axe: 'axe', boots: 'boot', relic: 'plus', pick: 'pick', root: 'S', hammer: 'T' };
  /* the largest axis-aligned block of cells inside a footprint: where the upright icon goes */
  function largestBlock(sh) {
    var set = {}, best = null; sh.cells.forEach(function (c) { set[c[0] + ',' + c[1]] = 1; });
    for (var y0 = 0; y0 < sh.h; y0++) for (var x0 = 0; x0 < sh.w; x0++) for (var y1 = y0; y1 < sh.h; y1++) for (var x1 = x0; x1 < sh.w; x1++) {
      var ok = true; for (var y = y0; y <= y1 && ok; y++) for (var x = x0; x <= x1; x++) if (!set[x + ',' + y]) { ok = false; break; }
      if (!ok) continue;
      var w = x1 - x0 + 1, h = y1 - y0 + 1, sc = w * h * 10 + Math.min(w, h);
      if (!best || sc > best.sc) best = { x: x0, y: y0, w: w, h: h, sc: sc };
    }
    return best || { x: 0, y: 0, w: 1, h: 1 };
  }
  var MATERIAL = {
    wood: { base: '#6b4a2e', light: '#a57a4c', dark: '#2e1c10', stitch: null, grain: '#5a3c24' },
    leather: { base: '#6a4330', light: '#a8774e', dark: '#2e1810', stitch: '#d9b27a' },
    cloth: { base: '#75684e', light: '#ab9b78', dark: '#332b1e', stitch: '#e8d8b2' },
    velvet: { base: '#57283c', light: '#8e4d68', dark: '#24101a', stitch: '#e0b860' },
    gold: { base: '#5c4a20', light: '#c9a752', dark: '#2c220c', stitch: '#f6d67e' }
  };
  var MAT_OF_KIND = { weapon: 'wood', tool: 'wood', ammo: 'wood', shield: 'leather', armor: 'leather', head: 'leather', feet: 'leather',
    consumable: 'cloth', food: 'cloth', misc: 'cloth', material: 'velvet', treasure: 'velvet', trinket: 'velvet', key: 'gold', quest: 'gold' };

  /* ---------------- themes ---------------- */
  var THEMES = {
    hd: { pixel: false, font: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif', panelA: '#2e231d', panelB: '#1b1411', rim: '#d9b36a', rimDark: '#6e5128',
      head: '#f1d38c', text: '#efe4cc', dim: '#a8977c', well: '#100c0a', cellA: '#2f2620', cellB: '#241c17', groundWell: '#13140d', groundA: '#2a2c1d', groundB: '#20221a',
      btnA: '#4c3a2b', btnB: '#30251d', btnRim: '#8a6a3a', key: '#17110e', ok: '#6fe08a', bad: '#ff5a4e', swap: '#ffb340', merge: '#62c8ff', cursor: '#ffe39a', tip: '#140f0c' },
    pixel: { pixel: true, panelA: '#3c2a24', panelB: '#2e201c', rim: '#d8a860', rimDark: '#6a4424', ink: '#120a0c',
      head: '#ffe08a', text: '#f4ead4', dim: '#a89478', well: '#1a1210', cellA: '#2e2320', cellB: '#281e1b', groundWell: '#16170e', groundA: '#2c2e1c', groundB: '#26281a',
      btnA: '#5a4232', btnB: '#46332a', btnRim: '#b08a50', key: '#1a1210', ok: '#7cf08c', bad: '#ff5a4a', swap: '#ffb040', merge: '#6ad0ff', cursor: '#ffe890', tip: '#160e0c' }
  };

  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right', Up: 'up', Down: 'down', Left: 'left', Right: 'right',
    KeyZ: 'ok', z: 'ok', Z: 'ok', Enter: 'ok', NumpadEnter: 'ok', Space: 'ok', ' ': 'ok',
    KeyX: 'back', x: 'back', X: 'back', Escape: 'back', Esc: 'back', Backspace: 'back',
    KeyR: 'rotate', r: 'rotate', R: 'rotate', KeyT: 'sort', t: 'sort', T: 'sort', KeyU: 'use', u: 'use', U: 'use',
    KeyG: 'drop', g: 'drop', G: 'drop', KeyF: 'take', f: 'take', F: 'take' };

  var DEF = { cols: 8, rows: 5, ground: 'on', groundCols: 4, groundRows: 5, stack: 1, swap: 'on', sortBy: 'size', theme: 'auto', cell: 0,
    dim: 0.45, maxCell: 42, minTextPx: 10, ghost: 'on', autoCloseMs: 900, tabs: 'auto', hoverMs: 350 };

  function create(opt) {
    opt = opt || {};
    var P = {}; Object.keys(DEF).forEach(function (k) { P[k] = DEF[k]; });
    var pin = opt.params || {}; Object.keys(pin).forEach(function (k) { if (pin[k] != null && pin[k] !== '') P[k] = pin[k]; });
    ['cols', 'rows', 'groundCols', 'groundRows', 'stack', 'cell', 'dim', 'maxCell', 'minTextPx', 'autoCloseMs', 'hoverMs'].forEach(function (k) { P[k] = num(P[k], DEF[k]); });
    P.cols = clamp(Math.round(P.cols), 2, 20); P.rows = clamp(Math.round(P.rows), 2, 14);
    P.groundCols = clamp(Math.round(P.groundCols), 2, 12); P.groundRows = clamp(Math.round(P.groundRows), 2, 14);
    var ITEMS = {}, cb = function (name) { var f = opt[name]; return typeof f === 'function' ? f : null; };
    function setItems(tab) {
      ITEMS = {};
      Object.keys(tab || {}).forEach(function (id) {
        var it = tab[id] || {}, o = {}; Object.keys(it).forEach(function (k) { o[k] = it[k]; });
        o.id = id; o.name = it.name || id; o._shape = parseShape(it.shape || '1x1');
        o._art = ARTS[it.art] ? it.art : ARTS[id] ? id : ART_OF_KIND[it.kind] || 'box';
        o.stack = Math.max(1, Math.round(num(it.stack, P.stack)));
        o._key = id + ':' + (it.art || '') + ':' + (it.color || '') + ':' + (it.accent || '') + ':' + JSON.stringify(o._shape.cells) + (it.image ? ':img' : '');
        ITEMS[id] = o;
      });
    }
    setItems(opt.items);
    function item(id) { if (!ITEMS[id]) ITEMS[id] = { id: id, name: String(id), _shape: parseShape('1x1'), _art: 'box', stack: Math.max(1, P.stack), _key: 'unknown:' + id }; return ITEMS[id]; }

    var GR = { bag: { id: 'bag', cols: P.cols, rows: P.rows, mask: null }, ground: P.ground === 'off' ? null : { id: 'ground', cols: P.groundCols, rows: P.groundRows, mask: null } };
    if (opt.mask && opt.mask.length) {   // rows of '#' (usable) and '.' (locked)
      GR.bag.rows = opt.mask.length; GR.bag.cols = 0; opt.mask.forEach(function (r) { GR.bag.cols = Math.max(GR.bag.cols, String(r).length); });
      GR.bag.mask = []; for (var my = 0; my < GR.bag.rows; my++) for (var mx = 0; mx < GR.bag.cols; mx++) GR.bag.mask.push(String(opt.mask[my])[mx] === '#' ? 1 : 0);
    }
    function usable(g, x, y) { var G = GR[g]; if (!G || x < 0 || y < 0 || x >= G.cols || y >= G.rows) return false; return !G.mask || G.mask[y * G.cols + x] === 1; }

    var S = { time: 0, open: false, openAt: -1e9, closeAt: -1e9, entries: [], uidN: 1, held: null, cur: { g: 'bag', x: 0, y: 0 }, sel: null, hover: null,
      mode: 'key', ptr: { x: -1, y: -1, pid: null, down: null, drag: false, inside: false }, msg: null, anim: {}, shake: -1e9, events: [],
      title: 'Bag', pending: [], tab: 'bag', hoverAt: 0, ptrType: 'mouse', session: null, autoAt: -1, rep: null, opens: 0, frames: 0, lastLayout: null, cssScale: 1, errors: 0, limbo: [] };

    function ev(type, info) {
      var e = { t: Math.round(S.time), type: type }; if (info) Object.keys(info).forEach(function (k) { e[k] = info[k]; });
      S.events.push(e); if (S.events.length > 300) S.events.shift();
      if (S.session && S.session.count[type] != null) S.session.count[type]++;
      var d = cb('debug'); if (d) try { d(e); } catch (x) { S.errors++; }
      return e;
    }
    function sfx(n) { var f = cb('onSfx'); if (f) try { f(n); } catch (e) { S.errors++; } }
    function say(text, kind) { S.msg = { text: String(text), kind: kind || 'info', t: S.time }; }
    function bagCount(id) { var n = 0; S.entries.forEach(function (e) { if (e.g === 'bag' && e.id === id) n += e.n; }); if (S.held && S.held.e.id === id && S.held.from.g === 'bag') n += S.held.e.n; return n; }
    var lastCounts = {};
    function changed(reason) {   // report bag count deltas once per operation
      var now = {}, f = cb('onChange');
      S.entries.forEach(function (e) { if (e.g === 'bag') now[e.id] = (now[e.id] || 0) + e.n; });
      if (S.held && S.held.from.g === 'bag') now[S.held.e.id] = (now[S.held.e.id] || 0) + S.held.e.n;
      var ids = {}; Object.keys(now).concat(Object.keys(lastCounts)).forEach(function (k) { ids[k] = 1; });
      Object.keys(ids).forEach(function (id) {
        var d = (now[id] || 0) - (lastCounts[id] || 0);
        if (d && f) try { f({ id: id, delta: d, count: now[id] || 0, reason: reason }); } catch (e) { S.errors++; }
      });
      lastCounts = now;
    }

    /* ---------- occupancy ---------- */
    function cellsOf(e, x, y, o) { var sh = orientCells(item(e.id)._shape, o == null ? e.o : o); return sh.cells.map(function (c) { return [c[0] + (x == null ? e.x : x), c[1] + (y == null ? e.y : y)]; }); }
    function occ(g, ignore) {
      var m = {}; S.entries.forEach(function (e) { if (e.g !== g || e === ignore) return; cellsOf(e).forEach(function (c) { m[c[0] + ',' + c[1]] = e; }); });
      return m;
    }
    function test(g, id, o, x, y, ignore) {
      var sh = orientCells(item(id)._shape, o), M = occ(g, ignore), out = [], hits = [], cells = [];
      sh.cells.forEach(function (c) {
        var cx = c[0] + x, cy = c[1] + y; cells.push([cx, cy]);
        if (!usable(g, cx, cy)) out.push([cx, cy]);
        var e = M[cx + ',' + cy]; if (e && hits.indexOf(e) < 0) hits.push(e);
      });
      return { ok: !out.length && !hits.length, out: out, hits: hits, cells: cells };
    }
    function firstFit(g, id, prefer, ignore) {
      var G = GR[g]; if (!G) return null;
      var os = orientsOf(item(id)._shape).slice(), pi = os.indexOf(prefer | 0);
      if (pi > 0) { os.splice(pi, 1); os.unshift(prefer | 0); }
      for (var k = 0; k < os.length; k++) for (var y = 0; y < G.rows; y++) for (var x = 0; x < G.cols; x++) if (test(g, id, os[k], x, y, ignore).ok) return { x: x, y: y, o: os[k] };   // keep items upright when there is any room
      return null;
    }
    function newEntry(id, n, g, x, y, o) { var e = { uid: S.uidN++, id: id, n: n, g: g, x: x, y: y, o: o }; S.entries.push(e); return e; }
    function removeEntry(e) { var i = S.entries.indexOf(e); if (i >= 0) S.entries.splice(i, 1); }
    function anim(e, kind, fx, fy, dur) { S.anim[e.uid] = { kind: kind, t0: S.time, dur: dur || 180, fx: fx, fy: fy }; }

    /* add n of id into grid g: top up stacks first, then first-fit new stacks. Returns the number added. */
    function addTo(g, id, n, reason) {
      n = Math.max(0, Math.round(num(n, 1))); if (!n) return 0;
      var it = item(id), left = n;
      S.entries.forEach(function (e) { if (left && e.g === g && e.id === id && e.n < it.stack) { var k = Math.min(left, it.stack - e.n); e.n += k; left -= k; anim(e, 'pulse'); } });
      while (left > 0) {
        var p = firstFit(g, id, 0); if (!p) break;
        var k2 = Math.min(left, it.stack); var e2 = newEntry(id, k2, g, p.x, p.y, p.o); left -= k2; anim(e2, 'pop');
      }
      if (n - left > 0 && g === 'bag') changed(reason || 'add');
      return n - left;
    }
    function removeFrom(g, id, n, reason) {
      n = Math.max(0, Math.round(num(n, 1))); var left = n;
      var list = S.entries.filter(function (e) { return e.g === g && e.id === id; }).sort(function (a, b) { return a.n - b.n || b.uid - a.uid; });
      for (var i = 0; i < list.length && left > 0; i++) { var k = Math.min(left, list[i].n); list[i].n -= k; left -= k; if (list[i].n <= 0) { removeEntry(list[i]); if (S.sel === list[i].uid) S.sel = null; } }
      if (left > 0 && S.held && S.held.e.id === id && S.held.from.g === g) { var k3 = Math.min(left, S.held.e.n); S.held.e.n -= k3; left -= k3; if (S.held.e.n <= 0) S.held = null; }
      if (n - left > 0 && g === 'bag') changed(reason || 'remove');
      return n - left;
    }
    function snapshot() { return { entries: S.entries.map(function (e) { return { uid: e.uid, id: e.id, n: e.n, g: e.g, x: e.x, y: e.y, o: e.o }; }), uidN: S.uidN }; }
    function canAdd(id, n) {
      var keep = snapshot(), held = S.held, lc = lastCounts, f = opt.onChange; opt.onChange = null;
      var k = addTo('bag', id, n, 'test');
      S.entries = keep.entries; S.uidN = keep.uidN; S.held = held; lastCounts = lc; opt.onChange = f;
      return k >= Math.max(0, Math.round(num(n, 1)));
    }

    /* ---------- held item ---------- */
    function pickUp(e, grab, via) {
      removeEntry(e);
      var sh = orientCells(item(e.id)._shape, e.o);
      grab = grab || [0, 0];
      var gx = clamp(grab[0], 0, sh.w - 1), gy = clamp(grab[1], 0, sh.h - 1);
      S.held = { e: e, from: { g: e.g, x: e.x, y: e.y, o: e.o }, grab: [gx, gy], via: via || 'key', tx: e.x, ty: e.y, tg: e.g, px: null };
      S.sel = e.uid; delete S.anim[e.uid];
      ev('pickup', { id: e.id, uid: e.uid, from: e.g, x: e.x, y: e.y }); sfx('pick');
    }
    function heldTarget() {
      var H = S.held; if (!H) return null;
      var sh = orientCells(item(H.e.id)._shape, H.e.o);
      if (H.via === 'key') return { g: S.cur.g, x: S.cur.x - H.grab[0], y: S.cur.y - H.grab[1], sh: sh };
      return { g: H.tg, x: H.tx, y: H.ty, sh: sh };
    }
    function evaluate() {
      var H = S.held, T = heldTarget(); if (!H || !T || !T.g || !GR[T.g]) return { kind: 'invalid', why: 'none', cells: [], out: [], hits: [] };
      var r = test(T.g, H.e.id, H.e.o, T.x, T.y, null);
      r.g = T.g; r.x = T.x; r.y = T.y;
      if (r.out.length) { r.kind = 'invalid'; r.why = 'out'; return r; }
      if (!r.hits.length) { r.kind = 'place'; return r; }
      if (r.hits.length === 1) {
        var o = r.hits[0], it = item(H.e.id);
        if (o.id === H.e.id && it.stack > 1 && o.n < it.stack) { r.kind = 'merge'; r.other = o; return r; }
        if (P.swap !== 'off') { r.kind = 'swap'; r.other = o; return r; }
      }
      r.kind = 'invalid'; r.why = 'blocked'; return r;
    }
    function invalid(text, id) { S.shake = S.time; say(text, 'bad'); sfx('invalid'); ev('invalid', { id: id != null ? id : S.held ? S.held.e.id : null, why: text }); }
    function dropReason(id, g) { if (g !== 'ground') return true; var f = cb('onDrop'); if (!f) return true; var r; try { r = f(id, S.held ? S.held.e.n : 1); } catch (e) { S.errors++; r = true; } return r; }
    function place() {
      var H = S.held; if (!H) return false;
      var r = evaluate();
      if (r.kind === 'invalid') { invalid(r.why === 'out' ? "Doesn't fit there" : r.why === 'blocked' ? 'Blocked by ' + (r.hits.length > 1 ? r.hits.length + ' items' : item(r.hits[0].id).name) : 'Nowhere to put it'); return false; }
      if (r.g === 'ground' && essential(H.e.id)) { invalid('The ' + item(H.e.id).name + ' must stay with you'); return false; }
      if (r.g === 'ground' && H.from.g === 'bag') { var ok = dropReason(H.e.id, 'ground'); if (ok === false || typeof ok === 'string') { invalid(typeof ok === 'string' ? ok : "Can't drop " + item(H.e.id).name); return false; } }
      var e = H.e, px = H.px;
      if (r.kind === 'merge') {
        var it = item(e.id), k = Math.min(e.n, it.stack - r.other.n);
        r.other.n += k; e.n -= k; anim(r.other, 'pulse', null, null, 220);
        ev('merge', { id: e.id, uid: r.other.uid, n: r.other.n, g: r.g }); sfx('merge');
        if (e.n <= 0) { S.held = null; S.sel = r.other.uid; }
        changed('merge');
        return true;
      }
      var other = r.kind === 'swap' ? r.other : null;
      if (other) removeEntry(other);
      e.g = r.g; e.x = r.x; e.y = r.y; S.entries.push(e);
      anim(e, 'settle', px ? px.x : null, px ? px.y : null, 120);
      S.held = null; S.sel = e.uid;
      if (other) {
        var gc = S.cur; var sh = orientCells(item(other.id)._shape, other.o), grab = [0, 0];
        if (H.via === 'key') grab = [clamp(gc.x - other.x, 0, sh.w - 1), clamp(gc.y - other.y, 0, sh.h - 1)];
        else { var Lp = S.lastLayout || layout(), ga = gridAt(S.ptr.x, S.ptr.y, Lp, 0); if (ga && ga.g === r.g) grab = [clamp(ga.x - other.x, 0, sh.w - 1), clamp(ga.y - other.y, 0, sh.h - 1)]; }
        S.entries.push(other); pickUp(other, grab, H.via);
        S.held.from = { g: r.g, x: other.x, y: other.y, o: other.o };
        if (H.via !== 'key') { S.held.tx = other.x; S.held.ty = other.y; S.held.tg = r.g; S.held.px = null; }
        ev('swap', { id: e.id, uid: e.uid, other: other.id, g: r.g, x: r.x, y: r.y }); sfx('swap');
      } else { ev('place', { id: e.id, uid: e.uid, g: r.g, x: r.x, y: r.y, o: e.o }); sfx('place'); }
      if (e.g !== H.from.g) ev(e.g === 'ground' ? 'drop' : 'take', { id: e.id, n: e.n });
      changed(e.g === 'ground' && H.from.g === 'bag' ? 'drop' : e.g === 'bag' && H.from.g === 'ground' ? 'take' : 'move');
      return true;
    }
    function returnHeld(silent) {
      var H = S.held; if (!H) return;
      var e = H.e, f = H.from, px = H.px;
      S.held = null;
      var T = test(f.g, e.id, f.o, f.x, f.y, null), spot = null;
      if (T.ok) spot = { g: f.g, x: f.x, y: f.y, o: f.o };
      else {
        var T0 = test(f.g, e.id, e.o, f.x, f.y, null); if (T0.ok) spot = { g: f.g, x: f.x, y: f.y, o: e.o };
        else {
          var p = firstFit(f.g, e.id, e.o); if (p) spot = { g: f.g, x: p.x, y: p.y, o: p.o };
          else if (essential(e.id) && f.g === 'bag') { S.held = null; if (placeEssential(e.id, e.n, 'move') >= e.n) { if (!silent) ev('return', { id: e.id, uid: e.uid }); return; } }
          if (!spot && !p && GR.ground && !essential(e.id)) { p = firstFit('ground', e.id, e.o); if (p) spot = { g: 'ground', x: p.x, y: p.y, o: p.o }; }
        }
      }
      if (spot) { e.g = spot.g; e.x = spot.x; e.y = spot.y; e.o = spot.o; S.entries.push(e); anim(e, 'fly', px ? px.x : null, px ? px.y : null, 170); if (H.via === 'key') S.cur = { g: e.g, x: e.x, y: e.y }; }
      else { S.limbo.push({ id: e.id, n: e.n }); ev('overflow', { id: e.id, n: e.n }); }
      if (!silent) ev('return', { id: e.id, uid: e.uid });
      changed('move');
    }
    function keepHeldInside() {
      var H = S.held; if (!H || H.via !== 'key') return;
      var G = GR[S.cur.g], sh = orientCells(item(H.e.id)._shape, H.e.o);
      S.cur.x = clamp(S.cur.x, H.grab[0], Math.max(H.grab[0], G.cols - sh.w + H.grab[0]));
      S.cur.y = clamp(S.cur.y, H.grab[1], Math.max(H.grab[1], G.rows - sh.h + H.grab[1]));
    }
    function nextO(id, o) { var os = orientsOf(item(id)._shape), i = os.indexOf(o); return os[(i + 1) % os.length]; }
    function rotate() {
      var H = S.held;
      if (H) {
        var nO = nextO(H.e.id, H.e.o);
        if (nO === H.e.o) { say(item(H.e.id).name + ' fits the same either way', 'info'); return false; }
        var steps = ((nO - H.e.o) % 4 + 4) % 4, shc = orientCells(item(H.e.id)._shape, H.e.o);
        for (var st = 0; st < steps; st++) { H.grab = [shc.h - 1 - H.grab[1], H.grab[0]]; shc = rotCW(shc); }
        H.e.o = nO; keepHeldInside();
        if (H.via !== 'key') updateHeldFromPointer();
        ev('rotate', { id: H.e.id, o: H.e.o, held: true }); sfx('rotate'); anim(H.e, 'turn', null, null, 120); return true;
      }
      var e = entryByUid(targetUid()); if (!e) { say('Pick an item first', 'bad'); return false; }
      var no = nextO(e.id, e.o);
      if (no === e.o) { say(item(e.id).name + ' fits the same either way', 'info'); return false; }
      var T = test(e.g, e.id, no, e.x, e.y, e);
      if (!T.ok) {
        var best = null, bd = 1e9, G = GR[e.g];
        for (var y = 0; y < G.rows; y++) for (var x = 0; x < G.cols; x++) {
          var d = Math.abs(x - e.x) + Math.abs(y - e.y); if (d > 2 || d >= bd) continue;
          if (test(e.g, e.id, no, x, y, e).ok) { best = { x: x, y: y }; bd = d; }
        }
        if (!best) { S.shake = S.time; say('No room to turn ' + item(e.id).name, 'bad'); sfx('invalid'); ev('invalid', { id: e.id, why: 'turn' }); return false; }
        e.x = best.x; e.y = best.y;
      }
      e.o = no; anim(e, 'turn', null, null, 140); ev('rotate', { id: e.id, uid: e.uid, o: e.o }); sfx('rotate');
      return true;
    }

    /* ---------- auto-sort: merge stacks, then first-fit decreasing; keeps the old layout when not everything fits ---------- */
    var KIND_ORDER = ['weapon', 'shield', 'armor', 'head', 'feet', 'tool', 'ammo', 'trinket', 'consumable', 'food', 'material', 'treasure', 'key', 'quest', 'misc'];
    function packOrder(list, by) {
      return list.slice().sort(function (a, b) {
        var A = item(a.id), B = item(b.id), sa = A._shape.cells.length, sb = B._shape.cells.length;
        if (by === 'type') { var ka = KIND_ORDER.indexOf(A.kind || 'misc'), kb = KIND_ORDER.indexOf(B.kind || 'misc'); if (ka !== kb) return ka - kb; }
        if (sa !== sb) return sb - sa;
        var la = Math.max(A._shape.w, A._shape.h), lb = Math.max(B._shape.w, B._shape.h); if (la !== lb) return lb - la;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : b.n - a.n;
      });
    }
    function sortBag() {
      if (S.held) returnHeld(true);
      var bag = S.entries.filter(function (e) { return e.g === 'bag'; }), before = {}, keep = snapshot();
      bag.forEach(function (e) { before[e.id] = (before[e.id] || 0) + e.n; });
      var merged = [];   // merge stacks
      Object.keys(before).sort().forEach(function (id) { var left = before[id], st = item(id).stack, olds = bag.filter(function (e) { return e.id === id; }); while (left > 0) { var k = Math.min(st, left); var src = olds.shift(); merged.push({ id: id, n: k, uid: src ? src.uid : null, o: src ? src.o : 0, fx: src ? src.x : null, fy: src ? src.y : null }); left -= k; } });
      var orders = [packOrder(merged, P.sortBy), packOrder(merged, P.sortBy === 'type' ? 'size' : 'type')], done = null;
      for (var oi = 0; oi < orders.length && !done; oi++) {
        S.entries = S.entries.filter(function (e) { return e.g !== 'bag'; });
        var placed = [], fail = false;
        for (var i = 0; i < orders[oi].length; i++) {
          var m = orders[oi][i], p = firstFit('bag', m.id, m.o);
          if (!p) { fail = true; break; }
          var e = { uid: m.uid != null ? m.uid : S.uidN++, id: m.id, n: m.n, g: 'bag', x: p.x, y: p.y, o: p.o };
          S.entries.push(e); placed.push([e, m]);
        }
        if (!fail) done = placed;
      }
      if (!done) {   // keep everything where it was
        S.entries = keep.entries.map(function (e) { return e; }); S.uidN = keep.uidN;
        S.shake = S.time; say('No tidier fit found', 'bad'); sfx('invalid'); ev('sort', { ok: false }); return false;
      }
      var seen = {};
      done.forEach(function (pm) { var e = pm[0], m = pm[1]; if (m.uid != null && !seen[m.uid] && m.fx != null) { seen[m.uid] = 1; var L = S.lastLayout; S.anim[e.uid] = { kind: 'slide', t0: S.time, dur: 260, cx: m.fx, cy: m.fy, co: m.o }; } else anim(e, 'pop'); });
      S.sel = null; say('Bag sorted', 'ok'); sfx('sort'); ev('sort', { ok: true, stacks: done.length });
      changed('sort');
      return true;
    }
    function takeAll() {
      if (!GR.ground) return 0;
      var list = S.entries.filter(function (e) { return e.g === 'ground'; }), took = 0, left = 0;
      packOrder(list, 'size').forEach(function (e) {
        var it = item(e.id), n0 = e.n;
        S.entries.forEach(function (b) { if (e.n && b.g === 'bag' && b.id === e.id && b.n < it.stack) { var k = Math.min(e.n, it.stack - b.n); b.n += k; e.n -= k; anim(b, 'pulse'); } });
        if (e.n > 0) { var p = firstFit('bag', e.id, e.o, e); if (p) { var fx = e.x, fy = e.y; e.g = 'bag'; e.x = p.x; e.y = p.y; e.o = p.o; S.anim[e.uid] = { kind: 'cross', t0: S.time, dur: 260, cg: 'ground', cx: fx, cy: fy }; } }
        if (e.g === 'ground' && e.n <= 0) removeEntry(e);
        if (e.g === 'ground' && e.n > 0) left++;
        took += n0 - (e.g === 'ground' ? e.n : 0);
      });
      if (took) { say(left ? 'Took what fits (' + left + ' left)' : 'Took everything', 'ok'); sfx('place'); ev('take', { n: took, all: !left }); changed('take'); }
      else { invalid('No room in the bag'); }
      return took;
    }
    function entryByUid(u) { for (var i = 0; i < S.entries.length; i++) if (S.entries[i].uid === u) return S.entries[i]; return null; }
    function entryAt(g, x, y) { var M = occ(g); return M[x + ',' + y] || null; }
    function targetUid() {
      if (S.held) return S.held.e.uid;
      if (S.mode === 'key') { var e = entryAt(S.cur.g, S.cur.x, S.cur.y); return e ? e.uid : null; }
      return S.sel;
    }
    function usableItem(it) { return it.use === false ? false : it.use ? true : (it.kind === 'consumable' || it.kind === 'food'); }
    function useEntry(e) {
      if (!e) { say('Pick an item first', 'bad'); return false; }
      var it = item(e.id);
      if (!usableItem(it)) { invalid("Can't use " + it.name, e.id); return false; }
      var f = cb('onUse'), r = true;
      if (f) try { r = f(e.id, { n: e.n, g: e.g, item: it }); } catch (x) { S.errors++; r = false; }
      if (r === false || typeof r === 'string') { S.shake = S.time; say(typeof r === 'string' ? r : 'Nothing happens', 'bad'); sfx('invalid'); ev('invalid', { id: e.id, why: 'use' }); return false; }
      if (it.consume !== false) { e.n--; if (e.n <= 0) { removeEntry(e); if (S.sel === e.uid) S.sel = null; } else anim(e, 'pulse'); }
      say((it.useText || 'Used') + ' ' + it.name, 'ok'); sfx('use'); ev('use', { id: e.id, uid: e.uid, left: e.n });
      if (e.g === 'bag') changed('use');
      return true;
    }
    function dropEntry(e) {
      if (!e) { say('Pick an item first', 'bad'); return false; }
      if (essential(e.id)) { invalid('The ' + item(e.id).name + ' must stay with you', e.id); return false; }
      if (e.g === 'ground') { say('It is already on the ground', 'bad'); return false; }
      var f = cb('onDrop'), r = true;
      if (f) try { r = f(e.id, e.n); } catch (x) { S.errors++; r = true; }
      if (r === false || typeof r === 'string') { invalid(typeof r === 'string' ? r : "Can't drop " + item(e.id).name, e.id); return false; }
      var p = GR.ground ? firstFit('ground', e.id, e.o) : null, fx = e.x, fy = e.y;
      if (p) { e.g = 'ground'; e.x = p.x; e.y = p.y; e.o = p.o; S.anim[e.uid] = { kind: 'cross', t0: S.time, dur: 240, cg: 'bag', cx: fx, cy: fy }; }
      else { removeEntry(e); S.limbo.push({ id: e.id, n: e.n }); }
      if (S.sel === e.uid) S.sel = null;
      say('Dropped ' + item(e.id).name, 'info'); sfx('drop'); ev('drop', { id: e.id, n: e.n });
      changed('drop');
      return true;
    }

    /* ---------- open / close ---------- */
    /* ---------- key / quest items: never dropped, never left on the ground ---------- */
    function essential(id) { var it = item(id); return !!(it.key || it.essential || it.kind === 'quest' || it.kind === 'key'); }
    function valueOf(id) { var it = item(id); return num(it.value, num(it.price, 0)); }
    function packBagWith(id, n) {   // repack the whole bag (largest first, both orders) with n more of id; keeps the old layout on failure
      var keep = snapshot(), bag = S.entries.filter(function (e) { return e.g === 'bag'; });
      var list = bag.map(function (e) { return { id: e.id, n: e.n, uid: e.uid, o: e.o }; }), st = item(id).stack, left = n;
      while (left > 0) { var k = Math.min(st, left); list.push({ id: id, n: k, uid: null, o: 0 }); left -= k; }
      var orders = [packOrder(list, 'size'), packOrder(list, 'type')];
      for (var oi = 0; oi < orders.length; oi++) {
        S.entries = S.entries.filter(function (e) { return e.g !== 'bag'; });
        var fail = false;
        for (var i = 0; i < orders[oi].length && !fail; i++) { var m = orders[oi][i], pp = firstFit('bag', m.id, m.o); if (!pp) fail = true; else S.entries.push({ uid: m.uid != null ? m.uid : S.uidN++, id: m.id, n: m.n, g: 'bag', x: pp.x, y: pp.y, o: pp.o }); }
        if (!fail) return true;
      }
      S.entries = keep.entries; S.uidN = keep.uidN; return false;
    }
    /* put n of a key item into the bag: plain fit, else repack the bag, else move the least valuable other items out (to the ground
       tray, which opens the bag so the player sees what moved). Returns how many went in. */
    function placeEssential(id, n, reason) {
      var k = addTo('bag', id, n, reason || 'add'); if (k >= n) return n;
      var left = n - k, nm = item(id).name;
      if (packBagWith(id, left)) { changed(reason || 'add'); say('Repacked the bag to fit the ' + nm, 'ok'); ev('makeRoom', { id: id, moved: [] }); return n; }
      var keep = snapshot(), out = [];
      var cands = S.entries.filter(function (e) { return e.g === 'bag' && !essential(e.id); }).sort(function (a, b) { return valueOf(a.id) * a.n - valueOf(b.id) * b.n || item(a.id)._shape.cells.length - item(b.id)._shape.cells.length || a.uid - b.uid; });
      var done = false;
      for (var i = 0; i < cands.length && !done; i++) { var ce = entryByUid(cands[i].uid); if (!ce) continue; removeEntry(ce); out.push({ id: ce.id, n: ce.n }); if (packBagWith(id, left)) done = true; }   // packBagWith restores copies: look entries up by uid
      if (!done) { S.entries = keep.entries; S.uidN = keep.uidN; return k; }
      out.forEach(function (q) { if (S.open && GR.ground) { var g2 = addTo('ground', q.id, q.n); if (g2 < q.n) S.limbo.push({ id: q.id, n: q.n - g2 }); } else S.pending.push(q); });
      changed('make-room'); ev('makeRoom', { id: id, moved: out.map(function (q) { return q.id; }) });
      if (!S.open && S.pending.length) open({ title: opt.title });
      say('Made room for the ' + nm + ': ' + out.map(function (q) { return item(q.id).name; }).join(', ') + ' to the ground', 'ok');
      return n;
    }
    function open(o) {
      o = o || {};
      if (S.open) { ev('ignored', {}); return false; }
      S.open = true; S.openAt = S.time; S.opens++; S.title = o.title || opt.title || 'Bag';
      S.session = { count: { pickup: 0, place: 0, swap: 0, merge: 0, rotate: 0, invalid: 0, sort: 0, use: 0, drop: 0, take: 0 }, start: S.time };
      S.entries = S.entries.filter(function (e) { return e.g !== 'ground'; }); S.limbo = [];
      var loot = (o.loot || []).concat(S.pending); S.pending = [];
      loot.forEach(function (l) {   // key items go straight into the bag (making room); other loot lies on the ground tray (or goes into the bag with no tray)
        if (!l) return; var id = l.id || l, n = Math.max(0, Math.round(num(l.n, 1))); if (!n) return;
        if (essential(id)) { var ke = placeEssential(id, n, 'take'); if (ke >= n) return; n -= ke; }
        var k = GR.ground ? addTo('ground', id, n) : addTo('bag', id, n, 'take'); if (k < n) S.limbo.push({ id: id, n: n - k });
      });
      S.held = null; S.sel = null; S.hover = null; S.msg = null; S.ptr.down = null; S.ptr.drag = false;
      S.tab = S.entries.some(function (e) { return e.g === 'ground'; }) ? 'ground' : 'bag';
      var first = null; if (o.select) S.entries.forEach(function (e) { if (!first && e.g === 'bag' && e.id === o.select) first = e; });
      if (!first && S.entries.some(function (e) { return e.g === 'ground'; })) first = S.entries.filter(function (e) { return e.g === 'ground'; }).sort(function (a, b) { return a.y - b.y || a.x - b.x; })[0];
      if (!first) first = S.entries.filter(function (e) { return e.g === 'bag'; }).sort(function (a, b) { return a.y - b.y || a.x - b.x; })[0];
      S.cur = first ? { g: first.g, x: first.x, y: first.y } : { g: 'bag', x: 0, y: 0 };
      S.tab = S.cur.g;
      if (first) S.sel = first.uid;
      var auto = false; try { auto = typeof opt.autoplay === 'function' ? !!opt.autoplay() : !!opt.autoplay; } catch (e) { auto = false; }
      S.autoAt = auto ? S.time : -1;
      ev('open', { loot: o.loot ? o.loot.length : 0, auto: auto }); sfx('open');
      return true;
    }
    function close(force) {
      if (!S.open) return false;
      if (S.held) returnHeld(true);
      // a key item may not stay on the ground: make room for it, or refuse to close
      var stuck = S.entries.filter(function (e) { return e.g === 'ground' && essential(e.id); }).map(function (e) { return { e: e, id: e.id, n: e.n }; })
        .concat(S.limbo.filter(function (l) { return essential(l.id); }).map(function (l) { return { l: l, id: l.id, n: l.n }; }));
      for (var si = 0; si < stuck.length; si++) {
        var q = stuck[si];
        if (q.e) removeEntry(q.e); else S.limbo.splice(S.limbo.indexOf(q.l), 1);
        var got = placeEssential(q.id, q.n, 'take');
        if (got < q.n) {
          var rest = q.n - got, cap = item(q.id).stack;
          while (rest > 0) { var gp = GR.ground ? firstFit('ground', q.id, 0) : null, kk = Math.min(cap, rest); if (!gp) { S.limbo.push({ id: q.id, n: rest }); break; } S.entries.push({ uid: S.uidN++, id: q.id, n: kk, g: 'ground', x: gp.x, y: gp.y, o: gp.o }); rest -= kk; }
          if (!force) { S.shake = S.time; say('Make room for the ' + item(q.id).name + ' first', 'bad'); sfx('invalid'); ev('invalid', { id: q.id, why: 'key item' }); return false; }
        }
      }
      var ground = [], counts = {};
      S.entries.forEach(function (e) { if (e.g === 'ground') { counts[e.id] = (counts[e.id] || 0) + e.n; } });
      S.limbo.forEach(function (l) { counts[l.id] = (counts[l.id] || 0) + l.n; });
      Object.keys(counts).forEach(function (id) { ground.push({ id: id, n: counts[id] }); });
      S.entries = S.entries.filter(function (e) { return e.g !== 'ground'; }); S.limbo = [];
      S.open = false; S.closeAt = S.time; S.held = null; S.ptr.down = null; S.ptr.drag = false; S.rep = null;
      var sum = { ground: ground, counts: S.session ? S.session.count : {}, auto: S.autoAt >= 0 };
      ev('close', { ground: ground.length }); sfx('close');
      var f = opt.onClose; if (typeof f === 'function') try { f(sum); } catch (e) { S.errors++; }
      S.session = null;
      return true;
    }

    /* ---------- layout ---------- */
    var measureCv = null;
    function tw(s, size, weight, pixel) {
      if (pixel) return pxWidth(s);
      if (!measureCv) measureCv = mkCanvas(4, 4);
      var g = measureCv && measureCv.getContext && measureCv.getContext('2d');
      if (!g) return String(s).length * size * 0.56;
      g.font = (weight || 600) + ' ' + size + 'px ' + THEMES.hd.font; return g.measureText(String(s)).width;
    }
    function viewRect() {
      var v = opt.view; try { if (typeof v === 'function') v = v(); } catch (e) { v = null; }
      if (!v || !(v.w > 0) || !(v.h > 0)) v = { x: 0, y: 0, w: num(opt.width, 640), h: num(opt.height, 360) };
      return { x: +v.x || 0, y: +v.y || 0, w: +v.w, h: +v.h };
    }
    function uiRects() { var r = []; try { r = (typeof opt.uiRects === 'function' ? opt.uiRects() : opt.uiRects) || []; } catch (e) { r = []; } return r.filter(function (q) { return q && q.w > 0 && q.h > 0; }); }
    function themeName() { var t = P.theme; if (t === 'pixel' || t === 'hd') return t; var V = viewRect(); return V.w <= 400 && V.h <= 260 ? 'pixel' : 'hd'; }
    function buttonsFor(pixel) {
      var B = [{ id: 'rotate', label: 'Rotate', key: 'R' }, { id: 'sort', label: 'Sort', key: 'T' }, { id: 'use', label: 'Use', key: 'U' }, { id: 'drop', label: 'Drop', key: 'G' }];
      if (GR.ground && S.entries.some(function (e) { return e.g === 'ground'; })) B.push({ id: 'take', label: 'Take all', key: 'F' });
      return B;
    }
    function layoutIn(V) {
      var th = themeName(), pixel = th === 'pixel', T = THEMES[th];
      var u = pixel ? 1 : (opt.scale ? num(opt.scale, 1) : Math.max(0.6, Math.min(V.w / 640, V.h / 360)));
      if (!pixel) { var need = P.minTextPx / (9 * Math.max(0.05, S.cssScale)); if (need > u) u = Math.min(need, u * 2.4); }
      var fs = { title: pixel ? 8 : 14 * u, label: pixel ? 8 : 9.5 * u, btn: pixel ? 8 : 10.5 * u, tip: pixel ? 8 : 10.5 * u, small: pixel ? 8 : 9 * u };
      var pad = pixel ? 5 : 10 * u, headH = pixel ? 13 : 22 * u, labelH = pixel ? 10 : 14 * u, gap = pixel ? 12 : 14 * u, hintH = pixel ? 10 : 14 * u, margin = pixel ? 2 : 6 * u;
      var btnH = pixel ? 12 : 22 * u, btnGap = pixel ? 3 : 6 * u, footGap = pixel ? 4 : 8 * u;
      var B = buttonsFor(pixel).map(function (b) {
        var kw = pixel ? 8 : 15 * u, w = (pixel ? 4 : 8 * u) + kw + (pixel ? 3 : 5 * u) + tw(b.label, fs.btn, 600, pixel) + (pixel ? 4 : 9 * u);
        return { id: b.id, label: b.label, key: b.key, w: pixel ? Math.round(w) : w, h: btnH, kw: kw };
      });
      var bc = GR.bag.cols, br = GR.bag.rows, G = GR.ground, gc = G ? G.cols : 0, gr = G ? G.rows : 0;
      var portrait = V.w < V.h * 0.95, css = Math.max(0.05, S.cssScale);
      function btnRows(maxW) { var rows = [[]], x = 0; B.forEach(function (b) { if (x && x + b.w > maxW) { rows.push([]); x = 0; } rows[rows.length - 1].push(b); x += b.w + btnGap; }); return rows; }
      var innerMaxW = V.w - 2 * margin - 2 * pad, rowsB = btnRows(innerMaxW), footH = rowsB.length * btnH + (rowsB.length - 1) * btnGap;
      var fixedH = pad + headH + labelH + footGap + footH + hintH + pad;
      var maxC = (P.cell > 0 ? P.cell : P.maxCell) * (pixel ? 1 : u);
      var cellSide = Math.min((innerMaxW - (G ? gap : 0)) / (bc + gc), (V.h - 2 * margin - fixedH) / Math.max(br, gr), maxC);
      var infoH = pixel ? 21 : 36 * u, infoGap = pixel ? 3 : 6 * u;
      var cellTabs = Math.min(innerMaxW / Math.max(bc, gc), (V.h - 2 * margin - fixedH - infoH - infoGap) / Math.max(br, gr), maxC);
      var tabs = !!G && (P.tabs === 'on' || (P.tabs !== 'off' && (portrait || cellSide * css < 28)));
      var compact = tabs && !pixel && cellTabs * css < 28;   // a small phone: the tabs row is the header, no hint line, slim buttons
      var keep = [headH, hintH, pad, btnH, footGap, infoH, infoGap, margin, B, innerMaxW, rowsB, footH, fixedH];
      if (compact) {
        headH = 5 * u; hintH = 0; pad = 5 * u; btnH = 19 * u; footGap = 5 * u; infoH = fs.small * 1.9; infoGap = 4 * u; margin = 3 * u;
        B = B.map(function (b) { return { id: b.id, label: b.label, key: b.key, w: tw(b.label, fs.btn, 600, false) + 16 * u, h: btnH, kw: 0 }; });
        innerMaxW = V.w - 2 * margin - 2 * pad; rowsB = btnRows(innerMaxW); footH = rowsB.length * btnH + (rowsB.length - 1) * btnGap;
        fixedH = pad + headH + labelH + 4 * u + footGap + footH + pad;
        cellTabs = Math.min(innerMaxW / Math.max(bc, gc), (V.h - 2 * margin - fixedH - infoH - infoGap) / Math.max(br, gr), maxC);
      }
      if (tabs && P.tabs !== 'on' && !portrait && cellTabs < cellSide * 1.12) tabs = compact = false;   // tabs would not make cells bigger
      if (!tabs && compact) { compact = false; headH = keep[0]; hintH = keep[1]; pad = keep[2]; btnH = keep[3]; footGap = keep[4]; infoH = keep[5]; infoGap = keep[6]; margin = keep[7]; B = keep[8]; innerMaxW = keep[9]; rowsB = keep[10]; footH = keep[11]; fixedH = keep[12]; }
      var cell = tabs ? cellTabs : cellSide;
      if (pixel) cell = Math.max(6, Math.floor(cell)); else cell = Math.max(10, Math.floor(cell * 4) / 4);
      if (tabs && S.tab !== 'ground') S.tab = 'bag';
      var shown = tabs ? (S.tab === 'ground' ? { c: gc, r: gr } : { c: bc, r: br }) : null;
      var gridsW = tabs ? Math.max(bc, gc) * cell : (bc + gc) * cell + (G ? gap : 0);
      var gridsH = (tabs ? Math.max(br, gr) * cell + infoGap + infoH : Math.max(br, gr) * cell);
      var titleW = compact ? 0 : tw(S.title, fs.title, 700, pixel) + (pixel ? 24 : 50 * u);
      var bw = 0; rowsB.forEach(function (r) { var w = 0; r.forEach(function (b) { w += b.w + btnGap; }); bw = Math.max(bw, w - btnGap); });
      var winW = Math.min(V.w - 2 * margin, Math.max(gridsW, bw, titleW) + 2 * pad), winH = Math.min(V.h - 2 * margin, fixedH + gridsH);
      var wx = V.x + (V.w - winW) / 2, wy = V.y + (V.h - winH) / 2;
      var avoid = uiRects(), cand = [wy], k;   // slide vertically off the game's HUD rects
      for (k = 1; k < 40; k++) { cand.push(wy - k * 4, wy + k * 4); }
      for (k = 0; k < cand.length; k++) { var r0 = { x: wx, y: cand[k], w: winW, h: winH }; if (r0.y < V.y || r0.y + winH > V.y + V.h) continue; if (!avoid.some(function (q) { return hit(q, r0); })) { wy = cand[k]; break; } }
      if (pixel) { wx = Math.round(wx); wy = Math.round(wy); winW = Math.round(winW); winH = Math.round(winH); }
      var win = { x: wx, y: wy, w: winW, h: winH };
      var gx0 = wx + (winW - gridsW) / 2, gy0 = wy + pad + headH + labelH;
      if (pixel) { gx0 = Math.round(gx0); gy0 = Math.round(gy0); }
      var grids = {}, tabBtns = [], info = null;
      if (!tabs) {
        grids.bag = { x: gx0, y: gy0, cell: cell, cols: bc, rows: br, w: bc * cell, h: br * cell, label: { x: gx0, y: gy0 - labelH, w: bc * cell, h: labelH } };
        if (G) { var gxx = gx0 + bc * cell + gap; if (pixel) gxx = Math.round(gxx); grids.ground = { x: gxx, y: gy0, cell: cell, cols: gc, rows: gr, w: gc * cell, h: gr * cell, label: { x: gxx, y: gy0 - labelH, w: gc * cell, h: labelH } }; }
      } else {
        var gw = shown.c * cell, gxs = wx + (winW - gw) / 2; if (pixel) gxs = Math.round(gxs);
        grids[S.tab] = { x: gxs, y: gy0, cell: cell, cols: shown.c, rows: shown.r, w: gw, h: shown.r * cell, label: { x: gxs, y: gy0 - labelH, w: gw, h: labelH } };
        var cS = compact ? labelH + 2 * u : 0, tabW = (gridsW - (pixel ? 4 : 8 * u) - (compact ? cS + 8 * u : 0)) / 2, ty = gy0 - labelH - (pixel ? 2 : 4 * u), th2 = labelH + (pixel ? 0 : 1 * u);
        tabBtns = [{ id: 'tab-bag', x: gx0, y: ty, w: tabW, h: th2, tab: 'bag' }, { id: 'tab-ground', x: gx0 + tabW + (pixel ? 4 : 8 * u), y: ty, w: tabW, h: th2, tab: 'ground' }];
        if (pixel) tabBtns.forEach(function (t) { t.x = Math.round(t.x); t.y = Math.round(t.y); t.w = Math.round(t.w); });
        info = { x: wx + pad, y: gy0 + Math.max(br, gr) * cell + infoGap, w: winW - 2 * pad, h: infoH };
      }
      var head = { x: wx + pad, y: wy + (pixel ? 3 : 6 * u), w: winW - 2 * pad, h: headH - (pixel ? 3 : 6 * u) };
      var closeS = pixel ? 10 : 18 * u, closeB = { id: 'close', x: wx + winW - pad - closeS, y: head.y + (head.h - closeS) / 2 - (pixel ? 1 : 2 * u), w: closeS, h: closeS };
      if (compact) { closeS = labelH + 2 * u; closeB = { id: 'close', x: gx0 + gridsW - closeS, y: gy0 - labelH - 4 * u - 1 * u, w: closeS, h: closeS }; head = { x: wx + pad, y: closeB.y, w: winW - 2 * pad, h: closeS }; }
      if (pixel) { closeB.x = Math.round(closeB.x); closeB.y = Math.round(closeB.y); }
      var footY = wy + winH - pad - hintH - footH - (pixel ? 2 : 4 * u), buttons = [];
      rowsB.forEach(function (r, ri) {
        var w = 0; r.forEach(function (b) { w += b.w + btnGap; }); w -= btnGap;
        var x = wx + (winW - w) / 2, y = footY + ri * (btnH + btnGap);
        r.forEach(function (b) { var bb = { id: b.id, label: b.label, key: b.key, kw: b.kw, x: pixel ? Math.round(x) : x, y: pixel ? Math.round(y) : y, w: b.w, h: b.h }; buttons.push(bb); x += b.w + btnGap; });
      });
      buttons.unshift(closeB);
      tabBtns.forEach(function (t) { buttons.push(t); });
      var hint = { x: wx + pad, y: wy + winH - pad - hintH + (pixel ? 1 : 2 * u), w: winW - 2 * pad, h: hintH - (pixel ? 1 : 2 * u) };
      var content = { x: wx + pad * 0.5, y: wy + pad + headH, w: winW - pad, h: footY - (wy + pad + headH) - (pixel ? 1 : 2 * u) };
      if (compact) { hint = null; content = { x: wx + pad * 0.5, y: gy0, w: winW - pad, h: footY - gy0 - 2 * u }; }
      return { u: u, th: th, pixel: pixel, T: T, fs: fs, win: win, view: V, grids: grids, head: head, buttons: buttons, hint: hint, content: content, portrait: portrait, pad: pad, cell: cell, tabs: tabs, compact: compact, info: info, gap: gap };
    }
    function layout() {
      var V0 = viewRect(), top = V0.y, L;
      uiRects().forEach(function (q) { if (q.y <= V0.y + V0.h * 0.25 && q.y + q.h < V0.y + V0.h * 0.4 && q.y + q.h > top) top = q.y + q.h + 2; });   // a HUD band along the top
      if (top > V0.y) { L = layoutIn({ x: V0.x, y: top, w: V0.w, h: V0.y + V0.h - top }); if (L.cell * Math.max(0.05, S.cssScale) < 26) L = null; }
      if (!L) L = layoutIn(V0);
      S.lastLayout = L;
      return L;
    }
    function cellRect(g, x, y, L) { L = L || layout(); var G = L.grids[g]; if (!G) return null; return { x: G.x + x * G.cell, y: G.y + y * G.cell, w: G.cell, h: G.cell }; }
    function gridAt(px, py, L, slack) {
      var best = null; ['bag', 'ground'].forEach(function (g) {
        var G = L.grids[g]; if (!G || best) return; var s = (slack || 0) * G.cell;
        if (px >= G.x - s && py >= G.y - s && px < G.x + G.w + s && py < G.y + G.h + s) best = { g: g, x: Math.floor((px - G.x) / G.cell), y: Math.floor((py - G.y) / G.cell), G: G };
      });
      return best;
    }

    /* ---------- input ---------- */
    function moveCursor(dx, dy) {
      var c = S.cur, G = GR[c.g], nx = c.x + dx, ny = c.y + dy, L = S.lastLayout;
      if (GR.ground) {
        if (c.g === 'bag' && nx >= G.cols) { S.cur = { g: 'ground', x: 0, y: clamp(c.y, 0, GR.ground.rows - 1) }; if (S.lastLayout && S.lastLayout.tabs) S.tab = 'ground'; return; }
        if (c.g === 'ground' && nx < 0) { S.cur = { g: 'bag', x: GR.bag.cols - 1, y: clamp(c.y, 0, GR.bag.rows - 1) }; if (S.lastLayout && S.lastLayout.tabs) S.tab = 'bag'; return; }
      }
      if (S.held) { S.cur = { g: c.g, x: nx, y: ny }; keepHeldInside(); }   // the carried item's whole body stays on the grid
      else S.cur = { g: c.g, x: (nx + G.cols) % G.cols, y: (ny + G.rows) % G.rows };
      sfx('move');
    }
    function action(a) {
      if (!S.open) return false;
      if (a === 'up' || a === 'down' || a === 'left' || a === 'right' || a === 'ok' || (a === 'back' && S.held)) S.mode = 'key';
      if ((a === 'up' || a === 'down' || a === 'left' || a === 'right') && S.held && S.held.via !== 'key') {   // keys take over a held item at its target
        var T0 = heldTarget(); if (T0 && T0.g) S.cur = { g: T0.g, x: clamp(T0.x + S.held.grab[0], 0, GR[T0.g].cols - 1), y: clamp(T0.y + S.held.grab[1], 0, GR[T0.g].rows - 1) };
        S.held.via = 'key';
      }
      if (a === 'up' || a === 'down' || a === 'left' || a === 'right') { moveCursor(a === 'left' ? -1 : a === 'right' ? 1 : 0, a === 'up' ? -1 : a === 'down' ? 1 : 0); return true; }
      if (a === 'ok') {
        if (S.held) { place(); return true; }
        var e = entryAt(S.cur.g, S.cur.x, S.cur.y);
        if (e) pickUp(e, [S.cur.x - e.x, S.cur.y - e.y], 'key'); else say('Empty cell', 'info');
        return true;
      }
      if (a === 'back') { if (S.held) { returnHeld(); return true; } close(); return true; }
      if (a === 'rotate') { rotate(); return true; }
      if (a === 'sort') { sortBag(); return true; }
      if (a === 'take') { takeAll(); return true; }
      if (a === 'use') { if (S.held) { invalid('Put it down first'); return true; } useEntry(entryByUid(targetUid())); return true; }
      if (a === 'drop') { if (S.held) { invalid('Put it down first'); return true; } dropEntry(entryByUid(targetUid())); return true; }
      if (a === 'close') { close(); return true; }
      return false;
    }
    var CLOSE_KEYS = opt.closeKeys || ['KeyI', 'i', 'I', 'Tab'];
    function key(code, down, repeat) {
      if (!S.open) return false;
      if (down && repeat && !(S.rep)) return !!KEYS[code] || CLOSE_KEYS.indexOf(code) >= 0;   // OS auto-repeat of Z / R / T ... does nothing
      var a = KEYS[code];
      if (!a && CLOSE_KEYS.indexOf(code) >= 0) { if (down) { if (S.held) returnHeld(true); close(); } return true; }
      if (!a) return false;
      if (!down) { if (S.rep && S.rep.a === a) S.rep = null; return true; }
      if (S.rep && S.rep.a === a) return true;   // OS key repeat: our own repeat runs on the update clock
      action(a);
      if (a === 'up' || a === 'down' || a === 'left' || a === 'right') S.rep = { a: a, t: S.time + 260 };
      return true;
    }
    function buttonAt(px, py) { var L = S.lastLayout || layout(); for (var i = 0; i < L.buttons.length; i++) if (inside(px, py, L.buttons[i])) return L.buttons[i]; return null; }
    function updateHeldFromPointer() {
      var H = S.held, L = S.lastLayout || layout(); if (!H || H.via === 'key') return;
      var sh = orientCells(item(H.e.id)._shape, H.e.o), c = L.cell;
      var ax = S.ptr.x - (H.grab[0] + 0.5) * c, ay = S.ptr.y - (H.grab[1] + 0.5) * c;   // the held art's top-left
      H.px = { x: ax, y: ay };
      var gA = gridAt(S.ptr.x, S.ptr.y, L, 0.6);
      if (!gA) { H.tg = null; return; }
      H.tg = gA.g; H.tx = Math.round((ax - gA.G.x) / c) + 0; H.ty = Math.round((ay - gA.G.y) / c) + 0;
    }
    function pointer(type, x, y, o) {
      if (!S.open) return false;
      o = o || {}; x = +x; y = +y; if (!isFinite(x) || !isFinite(y)) return false;
      var L = S.lastLayout || layout(), pid = o.id != null ? o.id : 1;
      if (type === 'down' && S.ptr.down && S.ptr.pid !== pid) {   // a second finger: turn the held item, or press a button
        var b2 = buttonAt(x, y); if (b2) { pressButton(b2.id); return true; }
        if (S.held) rotate(); return true;
      }
      if (pid !== S.ptr.pid && type !== 'down' && S.ptr.down) return true;
      S.mode = 'pointer'; S.ptr.x = x; S.ptr.y = y; S.ptr.inside = inside(x, y, L.win);
      if (o.pointerType) S.ptrType = o.pointerType;
      if (L.tabs && S.held) { var tb = buttonAt(x, y); if (tb && tb.tab && S.tab !== tb.tab) { S.tab = tb.tab; L = layout(); } }
      if (type === 'wheel') { if (S.held) rotate(); return true; }
      if (type === 'down') {
        if (o.button === 2) { rotate(); return true; }
        S.ptr.pid = pid;
        var b = buttonAt(x, y); if (b) { pressButton(b.id); S.ptr.down = null; return true; }
        if (S.held) { updateHeldFromPointer(); if (place() && S.held) updateHeldFromPointer(); return true; }   // click-to-carry: a click places
        var gA = gridAt(x, y, L, 0), e = gA ? entryAt(gA.g, gA.x, gA.y) : null;
        S.ptr.down = { x: x, y: y, e: e ? e.uid : null, gx: gA ? gA.x : 0, gy: gA ? gA.y : 0 }; S.ptr.drag = false;
        if (e) { S.sel = e.uid; S.cur = { g: gA.g, x: gA.x, y: gA.y }; }
        return true;
      }
      if (type === 'move') {
        var D = S.ptr.down;
        if (D && D.e != null && !S.held && Math.hypot(x - D.x, y - D.y) > Math.max(3, L.cell * 0.18)) {
          var e2 = entryByUid(D.e); if (e2) { pickUp(e2, [D.gx - e2.x, D.gy - e2.y], 'pointer'); S.ptr.drag = true; }
        }
        if (S.held) updateHeldFromPointer();
        var gH = gridAt(x, y, L, 0), eh = gH ? entryAt(gH.g, gH.x, gH.y) : null, nh = eh ? eh.uid : null;
        if (nh !== S.hover) { S.hover = nh; S.hoverAt = S.time; }
        return S.ptr.inside || !!S.held;
      }
      if (type === 'up' || type === 'cancel') {
        var D2 = S.ptr.down; S.ptr.down = null; S.ptr.pid = null;
        if (S.held && S.ptr.drag) {
          S.ptr.drag = false; updateHeldFromPointer();
          if (type === 'cancel' || !S.held.tg) { returnHeld(); return true; }
          if (!place()) returnHeld(true);
          return true;
        }
        S.ptr.drag = false;
        if (D2 && D2.e == null && !inside(x, y, L.win) && o.pointerType !== 'mouse' && o.outsideCloses) close();
        return true;
      }
      return false;
    }
    function pressButton(id) {
      if (id === 'close') { if (S.held) returnHeld(true); close(); return; }
      if (id === 'tab-bag' || id === 'tab-ground') { S.tab = id === 'tab-bag' ? 'bag' : 'ground'; if (S.cur.g !== S.tab) S.cur = { g: S.tab, x: 0, y: 0 }; sfx('move'); return; }
      var m = { rotate: 'rotate', sort: 'sort', use: 'use', drop: 'drop', take: 'take' }[id];
      if (m) { var keep = S.mode; action(m); S.mode = keep; ev('button', { id: id }); }
    }

    /* ---------- update ---------- */
    function update(dt) {
      dt = num(dt, 0); if (!(dt > 0)) return;
      dt = Math.min(dt, 250); S.time += dt;
      if (!S.open) return;
      if (S.rep && S.time >= S.rep.t) { action(S.rep.a); S.rep.t = S.time + 90; }
      if (S.autoAt >= 0) {   // under autoplay: take the loot, then leave (the game's autopilot never hangs here)
        if (S.time - S.autoAt >= P.autoCloseMs * 0.35 && !S._autoTook) { S._autoTook = true; if (S.entries.some(function (e) { return e.g === 'ground'; })) takeAll(); }
        if (S.time - S.autoAt >= P.autoCloseMs) { S._autoTook = false; close(true); }
      }
      Object.keys(S.anim).forEach(function (k) { var A = S.anim[k]; if (S.time - A.t0 > A.dur + 50) delete S.anim[k]; });
      if (S.msg && S.time - S.msg.t > 2400) S.msg = null;
    }

    /* ---------- drawing ---------- */
    var DRAWN = [];
    function rec(kind, r, extra) { var o = { kind: kind, x: r.x, y: r.y, w: r.w, h: r.h }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); DRAWN.push(o); return o; }
    function rr(ctx, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }
    function text(ctx, L, s, x, y, size, col, weight, align, shadow) {   // (x, y) = top-left (or top-centre / top-right); returns the drawn rect
      s = String(s);
      if (L.pixel) {
        var w = pxWidth(s), xx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
        pxText(ctx, s, Math.round(xx), Math.round(y), col, shadow === false ? null : (shadow || L.T.ink || '#000'));
        return { x: Math.round(xx), y: Math.round(y), w: w + 1, h: 8 };
      }
      ctx.font = (weight || 600) + ' ' + size + 'px ' + THEMES.hd.font; ctx.textBaseline = 'top'; ctx.textAlign = align || 'left';
      if (shadow !== false) { ctx.fillStyle = shadow || 'rgba(0,0,0,0.75)'; ctx.fillText(s, x + Math.max(1, size * 0.08), y + Math.max(1, size * 0.1)); }
      ctx.fillStyle = col; ctx.fillText(s, x, y);
      var w2 = ctx.measureText(s).width, x0 = align === 'center' ? x - w2 / 2 : align === 'right' ? x - w2 : x;
      return { x: x0, y: y, w: w2, h: size * 1.15 };
    }
    function wrapLines(s, maxW, size, pixel) {
      var words = String(s || '').split(' '), lines = [], line = '';
      words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (line && tw(t, size, 500, pixel) > maxW) { lines.push(line); line = w; } else line = t; });
      if (line) lines.push(line); return lines;
    }
    function panel(ctx, L, r, kind) {
      var T = L.T, u = L.u;
      if (L.pixel) {
        var x = r.x, y = r.y, w = r.w, h = r.h;
        ctx.fillStyle = T.ink; ctx.fillRect(x + 1, y, w - 2, h); ctx.fillRect(x, y + 1, w, h - 2);
        ctx.fillStyle = T.rimDark; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
        ctx.fillStyle = T.rim; ctx.fillRect(x + 1, y + 1, w - 3, 1); ctx.fillRect(x + 1, y + 1, 1, h - 3);
        ctx.fillStyle = kind === 'tip' ? T.tip : T.panelA; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
        if (kind !== 'tip') { ctx.fillStyle = T.panelB; for (var yy = y + 3; yy < y + h - 3; yy += 2) ctx.fillRect(x + 2, yy, w - 4, 1); }
        ctx.fillStyle = T.rim; [[x + 2, y + 2], [x + w - 3, y + 2], [x + 2, y + h - 3], [x + w - 3, y + h - 3]].forEach(function (p) { ctx.fillRect(p[0], p[1], 1, 1); });
        return;
      }
      var rad = (kind === 'tip' ? 6 : 10) * u;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 18 * u; ctx.shadowOffsetY = 6 * u;
      rr(ctx, r.x, r.y, r.w, r.h, rad); ctx.fillStyle = kind === 'tip' ? T.tip : T.panelB; ctx.fill();
      ctx.restore();
      var gr = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
      if (kind === 'tip') { gr.addColorStop(0, 'rgba(36,27,22,0.98)'); gr.addColorStop(1, 'rgba(18,13,11,0.98)'); }
      else { gr.addColorStop(0, T.panelA); gr.addColorStop(1, T.panelB); }
      rr(ctx, r.x, r.y, r.w, r.h, rad); ctx.fillStyle = gr; ctx.fill();
      if (kind !== 'tip') {   // faint grain
        ctx.save(); rr(ctx, r.x, r.y, r.w, r.h, rad); ctx.clip(); ctx.globalAlpha = 0.05; ctx.fillStyle = '#ffffff';
        for (var i = 0; i < 14; i++) { var yy2 = r.y + (i + 0.5) * r.h / 14; ctx.fillRect(r.x, yy2, r.w, Math.max(1, 0.6 * u)); }
        ctx.restore();
      }
      var rg = ctx.createLinearGradient(r.x, r.y, r.x + r.w * 0.3, r.y + r.h);
      rg.addColorStop(0, kind === 'tip' ? (r.rim || T.rim) : '#f3d796'); rg.addColorStop(1, kind === 'tip' ? mix(r.rim || T.rim, '#000000', 0.45) : T.rimDark);
      ctx.lineWidth = (kind === 'tip' ? 1.5 : 2.2) * u; rr(ctx, r.x + ctx.lineWidth / 2, r.y + ctx.lineWidth / 2, r.w - ctx.lineWidth, r.h - ctx.lineWidth, rad); ctx.strokeStyle = rg; ctx.stroke();
      if (kind !== 'tip') {
        ctx.lineWidth = 1 * u; rr(ctx, r.x + 4 * u, r.y + 4 * u, r.w - 8 * u, r.h - 8 * u, rad * 0.6); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
        [[r.x + 7 * u, r.y + 7 * u], [r.x + r.w - 7 * u, r.y + 7 * u], [r.x + 7 * u, r.y + r.h - 7 * u], [r.x + r.w - 7 * u, r.y + r.h - 7 * u]].forEach(function (p) {
          ctx.beginPath(); ctx.moveTo(p[0], p[1] - 3.2 * u); ctx.lineTo(p[0] + 3.2 * u, p[1]); ctx.lineTo(p[0], p[1] + 3.2 * u); ctx.lineTo(p[0] - 3.2 * u, p[1]); ctx.closePath();
          ctx.fillStyle = '#e8c477'; ctx.fill(); ctx.lineWidth = 0.8 * u; ctx.strokeStyle = '#4a3418'; ctx.stroke();
        });
      }
    }
    function drawGrid(ctx, L, g) {
      var G = L.grids[g], T = L.T, u = L.u, c = G.cell, gd = GR[g], ground = g === 'ground';
      if (L.pixel) {
        ctx.fillStyle = T.ink; ctx.fillRect(G.x - 2, G.y - 2, G.w + 4, G.h + 4);
        ctx.fillStyle = ground ? T.groundWell : T.well; ctx.fillRect(G.x - 1, G.y - 1, G.w + 2, G.h + 2);
        for (var y = 0; y < gd.rows; y++) for (var x = 0; x < gd.cols; x++) {
          var cx = G.x + x * c, cy = G.y + y * c;
          if (!usable(g, x, y)) { ctx.fillStyle = '#140c0a'; ctx.fillRect(cx, cy, c, c); ctx.fillStyle = '#5a4430'; for (var k = 0; k < c; k += 3) ctx.fillRect(cx + k, cy + c - 1 - k, 1, 1); continue; }
          ctx.fillStyle = ground ? T.groundA : T.cellA; ctx.fillRect(cx + 1, cy + 1, c - 1, c - 1);
          ctx.fillStyle = ground ? T.groundB : T.cellB; ctx.fillRect(cx + 2, cy + 2, c - 3, c - 3);
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(cx + 1, cy + 1, c - 1, 1); ctx.fillRect(cx + 1, cy + 1, 1, c - 1);
        }
        return;
      }
      ctx.save();
      rr(ctx, G.x - 5 * u, G.y - 5 * u, G.w + 10 * u, G.h + 10 * u, 7 * u); ctx.fillStyle = ground ? T.groundWell : T.well; ctx.fill();
      ctx.lineWidth = 1 * u; ctx.strokeStyle = ground ? 'rgba(170,190,120,0.25)' : 'rgba(230,190,120,0.18)';
      if (ground) ctx.setLineDash([4 * u, 3 * u]);
      rr(ctx, G.x - 4.5 * u, G.y - 4.5 * u, G.w + 9 * u, G.h + 9 * u, 6.5 * u); ctx.stroke(); ctx.setLineDash([]);
      var gap = Math.max(1, 1.6 * u);
      for (var y2 = 0; y2 < gd.rows; y2++) for (var x2 = 0; x2 < gd.cols; x2++) {
        var cx2 = G.x + x2 * c + gap / 2, cy2 = G.y + y2 * c + gap / 2, s = c - gap;
        if (!usable(g, x2, y2)) {
          rr(ctx, cx2, cy2, s, s, 3 * u); ctx.fillStyle = '#17110d'; ctx.fill();
          ctx.save(); rr(ctx, cx2, cy2, s, s, 3 * u); ctx.clip(); ctx.strokeStyle = 'rgba(214,170,110,0.32)'; ctx.lineWidth = 1.2 * u;
          for (var k2 = -s; k2 < s; k2 += 5 * u) { ctx.beginPath(); ctx.moveTo(cx2 + k2, cy2 + s); ctx.lineTo(cx2 + k2 + s, cy2); ctx.stroke(); } ctx.restore();
          var lk = s * 0.32, lx = cx2 + s / 2, ly = cy2 + s / 2;   // a small padlock
          ctx.save(); ctx.lineWidth = Math.max(1, lk * 0.16); ctx.strokeStyle = '#c9a466'; ctx.beginPath(); ctx.arc(lx, ly - lk * 0.25, lk * 0.32, Math.PI, 0); ctx.stroke();
          rr(ctx, lx - lk * 0.5, ly - lk * 0.2, lk, lk * 0.75, lk * 0.12); ctx.fillStyle = '#c9a466'; ctx.fill(); ctx.fillStyle = '#17110d'; ctx.fillRect(lx - lk * 0.06, ly + lk * 0.02, lk * 0.12, lk * 0.28); ctx.restore();
          continue;
        }
        var cg = ctx.createLinearGradient(cx2, cy2, cx2, cy2 + s);
        cg.addColorStop(0, ground ? T.groundA : T.cellA); cg.addColorStop(1, ground ? T.groundB : T.cellB);
        rr(ctx, cx2, cy2, s, s, 3 * u); ctx.fillStyle = cg; ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(cx2 + 2 * u, cy2, s - 4 * u, 1.2 * u);
        ctx.fillStyle = 'rgba(255,235,200,0.05)'; ctx.fillRect(cx2 + 2 * u, cy2 + s - 1.2 * u, s - 4 * u, 1 * u);
      }
      ctx.restore();
    }
    function entryBox(e, L, g, x, y, o) {   // px rect of the entry's bounding box
      var G = L.grids[g || e.g], sh = orientCells(item(e.id)._shape, o == null ? e.o : o);
      return { x: G.x + (x == null ? e.x : x) * G.cell, y: G.y + (y == null ? e.y : y) * G.cell, w: sh.w * G.cell, h: sh.h * G.cell };
    }
    function shapeFill(ctx, L, e, box, col, alpha, o) {   // the entry's cells as one connected rounded region
      var sh = orientCells(item(e.id)._shape, o == null ? e.o : o), c = L.cell, u = L.u, gap = L.pixel ? 1 : 1.6 * u, set = {};
      sh.cells.forEach(function (q) { set[q[0] + ',' + q[1]] = 1; });
      ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = col;
      sh.cells.forEach(function (q) {
        var x0 = box.x + q[0] * c + gap / 2, y0 = box.y + q[1] * c + gap / 2, w = c - gap, h = c - gap;
        if (set[(q[0] + 1) + ',' + q[1]]) w += gap; if (set[q[0] + ',' + (q[1] + 1)]) h += gap;
        if (L.pixel) ctx.fillRect(Math.round(x0), Math.round(y0), Math.round(w), Math.round(h)); else { rr(ctx, x0, y0, w, h, set[(q[0] + 1) + ',' + q[1]] || set[q[0] + ',' + (q[1] + 1)] ? 1.5 * u : 3 * u); ctx.fill(); }
      });
      ctx.restore();
    }
    function devScale(ctx) { try { var m = ctx.getTransform(); return Math.max(0.25, Math.hypot(m.a, m.b)); } catch (e) { return 1; } }
    /* every item = (a) a backing panel that follows its footprint exactly (material by kind, bevel, stitching or grain) and
       (b) its icon, upright and never stretched, centred on the footprint's largest block of cells. Turning turns the backing only. */
    function drawArt(ctx, L, e, box, o, alpha, lift) {
      var it = item(e.id), oo = o == null ? e.o : o, sh = orientCells(it._shape, oo), c = box.w / sh.w, u = L.u, pixel = L.pixel;
      var M = MATERIAL[it.material] || MATERIAL[MAT_OF_KIND[it.kind] || 'cloth'], set = {}, gap = pixel ? 1 : Math.max(1, 0.12 * c);
      sh.cells.forEach(function (q) { set[q[0] + ',' + q[1]] = 1; });
      var has = function (x, y) { return !!set[x + ',' + y]; };
      ctx.save(); ctx.globalAlpha *= alpha == null ? 1 : alpha;
      var rects = sh.cells.map(function (q) {
        var x0 = box.x + q[0] * c + (has(q[0] - 1, q[1]) ? 0 : gap), y0 = box.y + q[1] * c + (has(q[0], q[1] - 1) ? 0 : gap);
        var x1 = box.x + (q[0] + 1) * c - (has(q[0] + 1, q[1]) ? 0 : gap), y1 = box.y + (q[1] + 1) * c - (has(q[0], q[1] + 1) ? 0 : gap);
        if (pixel) { x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); }
        return { q: q, x0: x0, y0: y0, x1: x1, y1: y1 };
      });
      function path() { ctx.beginPath(); rects.forEach(function (r) { ctx.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); }); }
      if (lift) { ctx.save(); ctx.translate(pixel ? 2 : 4 * u, pixel ? 3 : 6 * u); path(); ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill(); ctx.restore(); }
      path();
      var bg = ctx.createLinearGradient(box.x, box.y, box.x, box.y + box.h); bg.addColorStop(0, mix(M.base, M.light, 0.25)); bg.addColorStop(1, mix(M.base, M.dark, 0.3));
      ctx.fillStyle = pixel ? M.base : bg; ctx.fill();
      ctx.save(); path(); ctx.clip();
      if (M.grain) { ctx.fillStyle = M.grain; for (var gy = box.y + c * 0.33; gy < box.y + box.h; gy += c / 3) ctx.fillRect(box.x, Math.round(gy), box.w, pixel ? 1 : Math.max(1, 0.03 * c)); }
      else if (!pixel) { ctx.fillStyle = 'rgba(255,255,255,0.035)'; for (var wy = box.y; wy < box.y + box.h; wy += Math.max(2, c / 14)) ctx.fillRect(box.x, wy, box.w, Math.max(1, c / 40)); }
      ctx.restore();
      var lw = pixel ? 1 : Math.max(1, 0.05 * c), rc = it.rarity && it.rarity !== 'common' ? rarityCol(it) : null;
      rects.forEach(function (r) {   // bevel: light top / left, dark bottom / right; a rarity rim; stitching inset along the outer edges
        var q = r.q;
        ctx.fillStyle = M.light;
        if (!has(q[0], q[1] - 1)) ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, lw);
        if (!has(q[0] - 1, q[1])) ctx.fillRect(r.x0, r.y0, lw, r.y1 - r.y0);
        ctx.fillStyle = M.dark;
        if (!has(q[0], q[1] + 1)) ctx.fillRect(r.x0, r.y1 - lw, r.x1 - r.x0, lw);
        if (!has(q[0] + 1, q[1])) ctx.fillRect(r.x1 - lw, r.y0, lw, r.y1 - r.y0);
      });
      if (rc && !pixel) {   // rarity: a small gem in the panel's top-left corner, not a box around it
        var r0 = rects.filter(function (r) { return !has(r.q[0] - 1, r.q[1]) && !has(r.q[0], r.q[1] - 1); })[0] || rects[0], gs = Math.max(3, 0.09 * c);
        ctx.save(); ctx.translate(r0.x0 + 0.17 * c, r0.y0 + 0.17 * c); ctx.rotate(Math.PI / 4); ctx.fillStyle = M.dark; ctx.fillRect(-gs * 0.75, -gs * 0.75, gs * 1.5, gs * 1.5); ctx.fillStyle = rc; ctx.fillRect(-gs / 2, -gs / 2, gs, gs); ctx.restore();
      }
      if (pixel && c >= 14) {
        ctx.fillStyle = rgba(M.stitch || M.light, 0.5);
        rects.forEach(function (r) {
          var q = r.q, i2 = 2;
          if (!has(q[0], q[1] - 1)) for (var sx = r.x0 + i2; sx < r.x1 - i2; sx += 2) ctx.fillRect(sx, r.y0 + i2, 1, 1);
          if (!has(q[0], q[1] + 1)) for (var sx2 = r.x0 + i2; sx2 < r.x1 - i2; sx2 += 2) ctx.fillRect(sx2, r.y1 - i2 - 1, 1, 1);
          if (!has(q[0] - 1, q[1])) for (var sy = r.y0 + i2; sy < r.y1 - i2; sy += 2) ctx.fillRect(r.x0 + i2, sy, 1, 1);
          if (!has(q[0] + 1, q[1])) for (var sy2 = r.y0 + i2; sy2 < r.y1 - i2; sy2 += 2) ctx.fillRect(r.x1 - i2 - 1, sy2, 1, 1);
        });
      }
      if (M.stitch && !pixel && c > 22) {
        var ins = 0.13 * c; ctx.save(); ctx.strokeStyle = rgba(M.stitch, 0.55); ctx.lineWidth = Math.max(1, 0.025 * c); ctx.setLineDash([0.07 * c, 0.06 * c]); ctx.beginPath();
        rects.forEach(function (r) {
          var q = r.q, X = q[0], Y = q[1];
          function end(n, d, edge) { return n ? (d ? edge : 0) : 1; }   // 1 = inset, 0 = run to the cell edge, edge = run past it to meet an inner corner
          function hx(sideY, x0, x1) {   // a horizontal stitch on the top (sideY -1) or bottom (+1) edge
            var l = has(X - 1, Y) ? (has(X - 1, Y + sideY) ? 1 : 0) : -1, rr2 = has(X + 1, Y) ? (has(X + 1, Y + sideY) ? 1 : 0) : -1;
            var y = sideY < 0 ? r.y0 + ins : r.y1 - ins; ctx.moveTo(x0 + (l === -1 ? ins : l === 1 ? -ins : 0), y); ctx.lineTo(x1 + (rr2 === -1 ? -ins : rr2 === 1 ? ins : 0), y);
          }
          function vy(sideX) {
            var t = has(X, Y - 1) ? (has(X + sideX, Y - 1) ? 1 : 0) : -1, b = has(X, Y + 1) ? (has(X + sideX, Y + 1) ? 1 : 0) : -1;
            var x = sideX < 0 ? r.x0 + ins : r.x1 - ins; ctx.moveTo(x, r.y0 + (t === -1 ? ins : t === 1 ? -ins : 0)); ctx.lineTo(x, r.y1 + (b === -1 ? -ins : b === 1 ? ins : 0));
          }
          if (!has(X, Y - 1)) hx(-1, r.x0, r.x1);
          if (!has(X, Y + 1)) hx(1, r.x0, r.x1);
          if (!has(X - 1, Y)) vy(-1);
          if (!has(X + 1, Y)) vy(1);
        });
        ctx.stroke(); ctx.restore();
      }
      // the icon: upright, contained in the largest block, at its own aspect
      var B = largestBlock(sh), bxr = { x: box.x + B.x * c, y: box.y + B.y * c, w: B.w * c, h: B.h * c }, padI = pixel ? 1 : (B.w * B.h > 1 ? 0.05 : 0.1) * c;
      var inner = { x: bxr.x + padI, y: bxr.y + padI, w: bxr.w - padI * 2, h: bxr.h - padI * 2 }, src = null, aspect = 1, ds = pixel ? 1 : devScale(ctx);
      if (it.image) { var cr = it.crop || [0, 0, it.image.naturalWidth || it.image.width, it.image.naturalHeight || it.image.height]; aspect = cr[2] / cr[3]; }
      else if (pixel && typeof it.icon !== 'function') aspect = 1;
      else if (typeof it.icon !== 'function') { var Aa = ARTS[it._art] || ARTS.box; aspect = Aa[0] / Aa[1]; }
      var turnIcon = typeof it.icon !== 'function' && !(pixel && !it.image) && ((aspect < 0.8 && inner.w > inner.h * 1.25) || (aspect > 1.25 && inner.h > inner.w * 1.25));   // a long icon follows its long slot
      var asp = turnIcon ? 1 / aspect : aspect;
      var iw = Math.min(inner.w, inner.h * asp), ih = iw / asp, ir = { x: inner.x + (inner.w - iw) / 2, y: inner.y + (inner.h - ih) / 2, w: iw, h: ih };
      var fgl = pixel && !it.image && typeof it.icon !== 'function' ? footprintGlyph(it, opt.pixelOutline || '#1c1622') : null, fgO = -1;
      if (fgl) { var want = cellKey(sh); for (var kq = 0; kq < 4 && fgO < 0; kq++) if (cellKey(orientCells(fgl.shape, kq)) === want) fgO = kq; }
      if (fgO >= 0) {   // the glyph is drawn for this footprint: turn it with the item, centre it on the whole panel
        var fs2 = Math.max(1, Math.floor(c / 16)), gw = ((fgO & 1) ? fgl.h : fgl.w) * fs2, gh = ((fgO & 1) ? fgl.w : fgl.h) * fs2;
        var gx = Math.round(box.x + (box.w - gw) / 2), gy = Math.round(box.y + (box.h - gh) / 2);
        ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(gx + gw / 2, gy + gh / 2); ctx.rotate(fgO * Math.PI / 2);
        var dw0 = fgl.w * fs2, dh0 = fgl.h * fs2; ctx.drawImage(fgl.img, Math.round(-dw0 / 2), Math.round(-dh0 / 2), dw0, dh0); ctx.restore();
        rec('icon', { x: gx, y: gy, w: gw, h: gh }, { uid: e.uid, id: e.id, srcAspect: gw / gh, pixelArt: fgl.art, glyphTurn: fgO });
        ctx.restore(); return;
      }
      var tryG = fgl ? [fgl].concat((FG_ALT[fgl.art] || []).map(function (a2) { return footprintGlyph({ id: it.id, _key: (it._key || it.id) + ':' + a2, pixelArt: a2, color: it.color, accent: it.accent }, opt.pixelOutline || '#1c1622'); })) : [];
      tryG.forEach(function (G2) { if (!G2) return; var want2 = cellKey(sh); for (var kq2 = 0; kq2 < 4 && fgO < 0; kq2++) if (cellKey(orientCells(G2.shape, kq2)) === want2) { fgO = kq2; fgl = G2; } });
      if (fgO >= 0) {
        var fsA = Math.max(1, Math.floor(c / 16)), gwA = ((fgO & 1) ? fgl.h : fgl.w) * fsA, ghA = ((fgO & 1) ? fgl.w : fgl.h) * fsA, gxA = Math.round(box.x + (box.w - gwA) / 2), gyA = Math.round(box.y + (box.h - ghA) / 2);
        ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(gxA + gwA / 2, gyA + ghA / 2); ctx.rotate(fgO * Math.PI / 2); ctx.drawImage(fgl.img, Math.round(-fgl.w * fsA / 2), Math.round(-fgl.h * fsA / 2), fgl.w * fsA, fgl.h * fsA); ctx.restore();
        rec('icon', { x: gxA, y: gyA, w: gwA, h: ghA }, { uid: e.uid, id: e.id, srcAspect: gwA / ghA, pixelArt: fgl.art, glyphTurn: fgO });
        ctx.restore(); return;
      }
      for (var tg = 0; tg < tryG.length * 2 && fgl; tg++) {   // contained in the largest block: each candidate at full size, then at half size
        var cand = tryG[tg % tryG.length], half = tg >= tryG.length ? 0.5 : 1; if (!cand) continue;
        var cw = cand.w * half, ch = cand.h * half, rotF = cw <= bxr.w && ch <= bxr.h ? 0 : ch <= bxr.w && cw <= bxr.h ? 1 : -1;
        if (rotF < 0) continue;
        fgl = cand;
        var gw2 = rotF ? ch : cw, gh2 = rotF ? cw : ch, fs3 = half < 1 ? 1 : Math.max(1, Math.floor(Math.min(bxr.w / gw2, bxr.h / gh2)));
          gw2 *= fs3; gh2 *= fs3; var gx2 = Math.round(bxr.x + (bxr.w - gw2) / 2), gy2 = Math.round(bxr.y + (bxr.h - gh2) / 2);
          ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(gx2 + gw2 / 2, gy2 + gh2 / 2); ctx.rotate(rotF * Math.PI / 2);
          ctx.drawImage(fgl.img, Math.round(-cw * fs3 / 2), Math.round(-ch * fs3 / 2), cw * fs3, ch * fs3); ctx.restore();
          rec('icon', { x: gx2, y: gy2, w: gw2, h: gh2 }, { uid: e.uid, id: e.id, srcAspect: gw2 / gh2, pixelArt: fgl.art, glyphTurn: rotF });
          ctx.restore(); return;
      }
      var pxg = pixel && !it.image && typeof it.icon !== 'function' ? pixelGlyph(it, opt.pixelOutline || '#1c1622') : null;
      if (pxg) { var ps = Math.max(1, Math.floor(Math.min(inner.w + 2, inner.h + 2) / 16)); ir = { x: Math.round(bxr.x + (bxr.w - 16 * ps) / 2), y: Math.round(bxr.y + (bxr.h - 16 * ps) / 2), w: 16 * ps, h: 16 * ps }; }
      if (pixel) { ir.x = Math.round(ir.x); ir.y = Math.round(ir.y); }
      ctx.imageSmoothingEnabled = !pixel;
      if (!pixel) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 0.08 * c; ctx.shadowOffsetY = 0.04 * c; }
      try {
        if (pxg) ctx.drawImage(pxg.img, ir.x, ir.y, ir.w, ir.h);
        else if (typeof it.icon === 'function') it.icon(ctx, ir.x, ir.y, ir.w, ir.h);
        else {
          if (turnIcon) { ctx.save(); ctx.translate(ir.x + ir.w / 2, ir.y + ir.h / 2); ctx.rotate(-Math.PI / 2); ctx.translate(-ir.h / 2, -ir.w / 2); }
          var dw = turnIcon ? ir.h : ir.w, dh = turnIcon ? ir.w : ir.h;
          if (it.image) ctx.drawImage(it.image, cr[0], cr[1], cr[2], cr[3], 0 + (turnIcon ? 0 : ir.x), 0 + (turnIcon ? 0 : ir.y), dw, dh);
          else { var G = renderGlyph(it, Math.max(1, Math.round(dw * ds)), Math.max(1, Math.round(dh * ds)), pixel); if (G) ctx.drawImage(G.img, turnIcon ? 0 : ir.x, turnIcon ? 0 : ir.y, dw, dh); }
          if (turnIcon) ctx.restore();
        }
      } catch (x) { S.errors++; }
      if (!pixel) ctx.restore();
      rec('icon', ir, { uid: e.uid, id: e.id, srcAspect: asp, turned: !!turnIcon, pixelGlyph: pxg ? pxg.name : null });
      ctx.restore();
    }
    function countPlate(ctx, L, e, box, o) {
      var it = item(e.id); if (it.stack <= 1 && e.n <= 1) return null;
      var sh = orientCells(it._shape, o == null ? e.o : o), best = sh.cells[0];
      sh.cells.forEach(function (q) { if (q[1] > best[1] || (q[1] === best[1] && q[0] > best[0])) best = q; });
      var c = L.cell, cx = box.x + (best[0] + 1) * c, cy = box.y + (best[1] + 1) * c, s = String(e.n), full = e.n >= it.stack;
      var col = full ? '#ffd76a' : L.T.text;
      if (L.pixel) {
        var w = s.length * 4 + 1, r = { x: Math.round(cx - w - 1), y: Math.round(cy - 8), w: w, h: 7 };
        ctx.fillStyle = 'rgba(10,6,6,0.88)'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = col;
        for (var di = 0; di < s.length; di++) { var DG = DIG35[s[di]] || DIG35['0']; for (var dy = 0; dy < 5; dy++) for (var dx = 0; dx < 3; dx++) if (DG[dy][dx] === '#') ctx.fillRect(r.x + 1 + di * 4 + dx, r.y + 1 + dy, 1, 1); }
        return rec('count', r, { uid: e.uid, text: s });
      }
      var fs = Math.max(8, c * 0.3);
      ctx.font = '800 ' + fs + 'px ' + THEMES.hd.font; var tw2 = ctx.measureText(s).width;
      var r2 = { x: cx - tw2 - fs * 0.62 - 2 * L.u, y: cy - fs * 1.2 - 2 * L.u, w: tw2 + fs * 0.62, h: fs * 1.2 };
      rr(ctx, r2.x, r2.y, r2.w, r2.h, fs * 0.3); ctx.fillStyle = 'rgba(12,8,6,0.82)'; ctx.fill();
      ctx.lineWidth = 0.8 * L.u; ctx.strokeStyle = full ? 'rgba(255,215,106,0.7)' : 'rgba(255,240,210,0.22)'; ctx.stroke();
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillStyle = col; ctx.fillText(s, r2.x + r2.w / 2, r2.y + r2.h / 2 + 0.5);
      return rec('count', r2, { uid: e.uid, text: s });
    }
    function entryDrawBox(e, L) {   // with slide / fly / cross animations (pure function of the update clock)
      var A = S.anim[e.uid], box = entryBox(e, L);
      if (!A) return { box: box, k: 1 };
      var u = ease((S.time - A.t0) / A.dur);
      if (u >= 1) return { box: box, k: 1 };
      var from = null;
      if (A.kind === 'slide' || A.kind === 'cross') { var B0 = entryBox(e, L, A.cg || e.g, A.cx, A.cy, A.co == null ? e.o : A.co); from = { x: B0.x, y: B0.y }; }
      else if ((A.kind === 'fly' || A.kind === 'settle') && A.fx != null) from = { x: A.fx, y: A.fy };
      if (from) return { box: { x: from.x + (box.x - from.x) * u, y: from.y + (box.y - from.y) * u, w: box.w, h: box.h }, k: 1 };
      if (A.kind === 'pop') return { box: box, k: 0.6 + 0.4 * u, alpha: Math.min(1, u * 2) };
      if (A.kind === 'pulse') return { box: box, k: 1 + 0.12 * Math.sin(u * Math.PI) };
      if (A.kind === 'turn') return { box: box, k: 0.86 + 0.14 * u };
      return { box: box, k: 1 };
    }
    function scaleBox(b, k) { return { x: b.x + b.w * (1 - k) / 2, y: b.y + b.h * (1 - k) / 2, w: b.w * k, h: b.h * k }; }
    function rarityCol(it) { return RARITY[it.rarity] || (it.kind === 'quest' || it.kind === 'key' ? RARITY.quest : RARITY.common); }
    function drawTooltip(ctx, L, e, anchor) {
      var it = item(e.id), T = L.T, u = L.u, pixel = L.pixel, fsT = L.fs.tip, fsS = L.fs.small, padT = pixel ? 4 : 8 * u;
      var sh = orientCells(it._shape, e.o), kind = KIND_LABEL[it.kind] || (it.kind ? String(it.kind) : 'Item');
      var l2 = kind + '  ' + sh.w + 'x' + sh.h + (it.stack > 1 ? '  ' + e.n + '/' + it.stack : '');
      var maxW = Math.min(L.content.w - 2, pixel ? 120 : 210 * u), body = wrapLines(it.desc || '', maxW - padT * 2, fsS, pixel);
      var useHint = usableItem(it) ? (pixel ? 'U: ' : 'U  ') + (it.useLabel || (it.kind === 'food' ? 'eat' : 'use')) : '';
      var lines = [{ s: it.name, size: fsT, col: rarityCol(it), w: 700 }, { s: l2, size: fsS, col: T.dim, w: 600 }];
      body.forEach(function (b) { lines.push({ s: b, size: fsS, col: T.text, w: 500 }); });
      if (useHint) lines.push({ s: useHint, size: fsS, col: '#9fd88e', w: 600 });
      var lh = function (q) { return pixel ? 10 : q.size * 1.32; }, w = 0, h = padT * 2;
      lines.forEach(function (q) { w = Math.max(w, tw(q.s, q.size, q.w, pixel)); h += lh(q); });
      w = Math.min(maxW, w + padT * 2); if (pixel) { w = Math.round(w); h = Math.round(h); }
      var C = L.content, g = pixel ? 3 : 6 * u, A = anchor, cands = [
        { x: A.x + A.w + g, y: A.y }, { x: A.x - w - g, y: A.y }, { x: A.x, y: A.y + A.h + g }, { x: A.x, y: A.y - h - g },
        { x: A.x + A.w + g, y: A.y + A.h - h }, { x: A.x - w - g, y: A.y + A.h - h }];
      var pick = null, avoid = avoidRects(L), bestS = 1e9;
      for (var i = 0; i < cands.length; i++) {   // every side; the one that covers the fewest item cells wins
        var r = { x: cands[i].x, y: cands[i].y, w: w, h: h };
        r.x = clamp(r.x, C.x, C.x + C.w - w); r.y = clamp(r.y, C.y, C.y + C.h - h);
        if (!hit(r, A) && !avoid.some(function (q) { return hit(q, r); }) && r.x >= C.x - 0.01 && r.y >= C.y - 0.01 && r.x + w <= C.x + C.w + 0.01 && r.y + h <= C.y + C.h + 0.01) {
          var sc = occupiedCover(L, r) + i * 0.01; if (sc < bestS) { bestS = sc; pick = r; }
        }
      }
      if (!pick) pick = { x: clamp(A.x + A.w + g, C.x, C.x + C.w - w), y: clamp(A.y, C.y, C.y + C.h - h), w: w, h: h };
      if (pixel) { pick.x = Math.round(pick.x); pick.y = Math.round(pick.y); }
      pick.rim = rarityCol(it);
      panel(ctx, L, pick, 'tip');
      var y = pick.y + padT, tr = rec('tooltip', pick, { uid: e.uid, id: e.id });
      lines.forEach(function (q) {
        var s = q.s; while (s.length > 1 && tw(s, q.size, q.w, pixel) > pick.w - padT * 2) s = s.slice(0, -2) + '.';
        var r2 = text(ctx, L, s, pick.x + padT, y, q.size, q.col, q.w, 'left'); rec('text', r2, { role: 'tip', in: 'tooltip' }); y += lh(q);
      });
      return tr;
    }
    function drawButton(ctx, L, b, enabled) {
      var T = L.T, u = L.u, pixel = L.pixel, hover = S.mode === 'pointer' && inside(S.ptr.x, S.ptr.y, b);
      if (b.id === 'close') {
        if (pixel) { ctx.fillStyle = T.ink; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.fillStyle = hover ? '#7a3a2a' : T.btnB; ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2); ctx.fillStyle = T.text; for (var k = 0; k < b.w - 5; k++) { ctx.fillRect(b.x + 2 + k, b.y + 2 + k, 1, 1); ctx.fillRect(b.x + b.w - 3 - k, b.y + 2 + k, 1, 1); } }
        else {
          rr(ctx, b.x, b.y, b.w, b.h, 4 * u); ctx.fillStyle = hover ? '#6a3426' : 'rgba(0,0,0,0.35)'; ctx.fill(); ctx.lineWidth = 1 * u; ctx.strokeStyle = 'rgba(232,196,119,0.45)'; ctx.stroke();
          ctx.strokeStyle = T.text; ctx.lineWidth = 1.8 * u; ctx.lineCap = 'round'; var m = b.w * 0.3;
          ctx.beginPath(); ctx.moveTo(b.x + m, b.y + m); ctx.lineTo(b.x + b.w - m, b.y + b.h - m); ctx.moveTo(b.x + b.w - m, b.y + m); ctx.lineTo(b.x + m, b.y + b.h - m); ctx.stroke(); ctx.lineCap = 'butt';
        }
        rec('button', b, { id: 'close' }); return;
      }
      ctx.save(); if (!enabled) ctx.globalAlpha *= 0.45;
      var kx, ky, ks;
      if (pixel) {
        ctx.fillStyle = T.ink; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = hover ? T.btnRim : T.btnA; ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
        ctx.fillStyle = T.btnB; ctx.fillRect(b.x + 1, b.y + b.h - 3, b.w - 2, 2);
        ctx.fillStyle = 'rgba(255,230,190,0.35)'; ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, 1);
        kx = b.x + 3; ky = b.y + 2; ks = 8;
        ctx.fillStyle = T.key; ctx.fillRect(kx, ky, ks, ks);
        pxText(ctx, b.key, kx + 2, ky, T.cursor, null);
        var lr = text(ctx, L, b.label, kx + ks + 3, b.y + 2, 8, T.text, 600, 'left', T.ink);
        rec('button', b, { id: b.id, enabled: enabled }); rec('text', lr, { role: 'button', in: b.id });
      } else {
        var bg = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h); bg.addColorStop(0, hover ? '#6a5038' : T.btnA); bg.addColorStop(1, T.btnB);
        rr(ctx, b.x, b.y, b.w, b.h, 5 * u); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 1 * u; ctx.strokeStyle = T.btnRim; ctx.stroke();
        ctx.fillStyle = 'rgba(255,230,190,0.12)'; ctx.fillRect(b.x + 4 * u, b.y + 1.2 * u, b.w - 8 * u, 1 * u);
        ks = b.kw; kx = b.x + 6 * u; ky = b.y + (b.h - ks) / 2;
        if (ks) {
          rr(ctx, kx, ky, ks, ks, 3 * u); ctx.fillStyle = T.key; ctx.fill(); ctx.lineWidth = 0.8 * u; ctx.strokeStyle = 'rgba(232,196,119,0.5)'; ctx.stroke();
          ctx.font = '800 ' + (L.fs.btn * 0.92) + 'px ' + THEMES.hd.font; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillStyle = T.cursor; ctx.fillText(b.key, kx + ks / 2, ky + ks / 2 + 0.5 * u);
        }
        var lr2 = ks ? text(ctx, L, b.label, kx + ks + 5 * u, b.y + (b.h - L.fs.btn * 1.15) / 2 + 0.5 * u, L.fs.btn, T.text, 600, 'left') : text(ctx, L, b.label, b.x + b.w / 2, b.y + (b.h - L.fs.btn * 1.15) / 2 + 0.5 * u, L.fs.btn, T.text, 600, 'center');
        rec('button', b, { id: b.id, enabled: enabled }); rec('text', lr2, { role: 'button', in: b.id });
      }
      ctx.restore();
    }
    function outlineShape(ctx, L, e, box, col, lw) {
      var sh = orientCells(item(e.id)._shape, e.o), c = box.w / sh.w, set = {};
      sh.cells.forEach(function (q) { set[q[0] + ',' + q[1]] = 1; });
      ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw; ctx.beginPath();
      sh.cells.forEach(function (q) {
        var x0 = box.x + q[0] * c, y0 = box.y + q[1] * c, x1 = x0 + c, y1 = y0 + c;
        if (L.pixel) {
          if (!set[q[0] + ',' + (q[1] - 1)]) ctx.fillRect(Math.round(x0), Math.round(y0), c, 1);
          if (!set[q[0] + ',' + (q[1] + 1)]) ctx.fillRect(Math.round(x0), Math.round(y1) - 1, c, 1);
          if (!set[(q[0] - 1) + ',' + q[1]]) ctx.fillRect(Math.round(x0), Math.round(y0), 1, c);
          if (!set[(q[0] + 1) + ',' + q[1]]) ctx.fillRect(Math.round(x1) - 1, Math.round(y0), 1, c);
          return;
        }
        var h = lw / 2;
        if (!set[q[0] + ',' + (q[1] - 1)]) { ctx.moveTo(x0, y0 + h); ctx.lineTo(x1, y0 + h); }
        if (!set[q[0] + ',' + (q[1] + 1)]) { ctx.moveTo(x0, y1 - h); ctx.lineTo(x1, y1 - h); }
        if (!set[(q[0] - 1) + ',' + q[1]]) { ctx.moveTo(x0 + h, y0); ctx.lineTo(x0 + h, y1); }
        if (!set[(q[0] + 1) + ',' + q[1]]) { ctx.moveTo(x1 - h, y0); ctx.lineTo(x1 - h, y1); }
      });
      if (!L.pixel) ctx.stroke();
      ctx.restore();
    }
    function avoidRects(L) { var a = []; L.buttons.forEach(function (b) { a.push(b); }); ['bag', 'ground'].forEach(function (g) { if (L.grids[g] && !L.tabs) a.push(L.grids[g].label); }); a.push(L.head); return a; }
    function occupiedCover(L, r) {   // how many item cells a rect would cover
      var n = 0; S.entries.forEach(function (e) { var G = L.grids[e.g]; if (!G) return; cellsOf(e).forEach(function (q) { if (hit(r, { x: G.x + q[0] * G.cell + 2, y: G.y + q[1] * G.cell + 2, w: G.cell - 4, h: G.cell - 4 })) n++; }); });
      return n;
    }
    function drawSwapLabel(ctx, L, e, box, heldR) {
      var it = item(e.id), u = L.u, pixel = L.pixel, s = 'You get: ' + it.name, fsz = L.fs.small, w = tw(s, fsz, 700, pixel) + (pixel ? 8 : 14 * u), h = pixel ? 11 : fsz * 1.15 + 8 * u;
      var C = L.content, av = avoidRects(L), best = null, bs = 1e9; if (heldR) av = av.concat([heldR]);
      [[box.x + (box.w - w) / 2, box.y + box.h + (pixel ? 2 : 4 * u)], [box.x + (box.w - w) / 2, box.y - h - (pixel ? 2 : 4 * u)], [box.x + box.w + (pixel ? 2 : 4 * u), box.y], [box.x - w - (pixel ? 2 : 4 * u), box.y]].forEach(function (c, i) {
        var r = { x: clamp(c[0], C.x, C.x + C.w - w), y: clamp(c[1], C.y, C.y + C.h - h), w: w, h: h };
        if (av.some(function (q) { return hit(q, r); })) return;
        var sc = occupiedCover(L, r) * 2 + (hit(r, box) ? 50 : 0) + i * 0.1;
        if (sc < bs) { bs = sc; best = r; }
      });
      if (!best) return;
      if (pixel) { best.x = Math.round(best.x); best.y = Math.round(best.y); best.w = Math.round(best.w); }
      if (pixel) { ctx.fillStyle = L.T.ink; ctx.fillRect(best.x, best.y, best.w, best.h); ctx.fillStyle = '#5a3a10'; ctx.fillRect(best.x + 1, best.y + 1, best.w - 2, best.h - 2); }
      else { rr(ctx, best.x, best.y, best.w, best.h, h / 2); ctx.fillStyle = 'rgba(40,24,6,0.95)'; ctx.fill(); ctx.lineWidth = 1.4 * u; ctx.strokeStyle = L.T.swap; ctx.stroke(); }
      rec('swapLabel', best, { id: e.id });
      var r2 = text(ctx, L, s, best.x + best.w / 2, best.y + (pixel ? 2 : 4 * u), fsz, '#ffd38a', 700, 'center'); rec('text', r2, { role: 'tip', in: 'swapLabel' });
    }
    function drawTab(ctx, L, b) {
      var T = L.T, u = L.u, pixel = L.pixel, on = S.tab === b.tab, n = b.tab === 'bag' ? L.counts.used + ' / ' + L.counts.total : String(L.counts.ground);
      var lab = b.tab === 'bag' ? (opt.bagLabel || 'Carried') : 'Ground';
      if (pixel) { ctx.fillStyle = T.ink; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.fillStyle = on ? T.btnA : T.panelB; ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 1); }
      else { rr(ctx, b.x, b.y, b.w, b.h + 3 * u, 5 * u); ctx.fillStyle = on ? T.btnA : 'rgba(0,0,0,0.3)'; ctx.fill(); ctx.lineWidth = 1 * u; ctx.strokeStyle = on ? T.rim : T.btnRim; ctx.stroke(); }
      // fit the label and the count in the tab, measured: full label, short label, then the count alone (never text on text)
      var padX = pixel ? 3 : 8 * u, gapX = pixel ? 4 : 6 * u, avail = b.w - padX * 2, fs = L.fs.label, ty = b.y + (pixel ? 1 : (b.h - fs * 1.15) / 2 + 1 * u);
      if (b.tab === 'bag' && L.counts.total >= 100) n = String(L.counts.used);
      var cands = [lab, b.tab === 'bag' ? 'Bag' : 'Floor', ''], useLab = '', nFull = n;
      for (var pass = 0; pass < 2 && !useLab; pass++) {
        n = pass ? nFull.replace(/ /g, '') : nFull; var nW = tw(n, fs, 700, pixel);
        for (var ci = 0; ci < cands.length; ci++) { if (!cands[ci]) { if (pass) break; continue; } if (tw(cands[ci], fs, 700, pixel) + gapX + nW <= avail) { useLab = cands[ci]; break; } }
      }
      rec('button', b, { id: b.id, tab: b.tab });
      var ncol = b.tab === 'ground' && L.counts.ground ? '#ffd38a' : T.dim;
      if (useLab) {
        var tr1 = text(ctx, L, useLab, b.x + padX, ty, fs, on ? T.head : T.dim, 700, 'left'); rec('text', tr1, { role: 'tab', in: b.id });
        var tr2 = text(ctx, L, n, b.x + b.w - padX, ty, fs, ncol, 700, 'right'); rec('text', tr2, { role: 'tab', in: b.id });
      } else {
        var lab2 = (b.tab === 'bag' ? 'Bag ' : '') + n; if (tw(lab2, fs, 700, pixel) > avail) lab2 = n;
        var tr3 = text(ctx, L, lab2, b.x + b.w / 2, ty, fs, on ? T.head : ncol, 700, 'center'); rec('text', tr3, { role: 'tab', in: b.id });
      }
    }
    function drawInfo(ctx, L, e) {   // phone layout: the tooltip as a fixed strip under the grid
      var r = L.info, T = L.T, u = L.u, pixel = L.pixel, padT = pixel ? 3 : 6 * u;
      panel(ctx, L, { x: r.x, y: r.y, w: r.w, h: r.h, rim: e ? rarityCol(item(e.id)) : T.btnRim }, 'tip');
      var box = rec('tooltip', r, { id: e ? e.id : null, uid: e ? e.uid : null, strip: true });
      if (L.compact && (!e || (L.footText && L.footText.msg))) { var fsx = L.footText ? L.footText.s : ''; while (fsx.length > 2 && tw(fsx, L.fs.small, 600, false) > r.w - padT * 2) fsx = fsx.slice(0, -2) + '.'; var tc = text(ctx, L, fsx, r.x + r.w / 2, r.y + (r.h - L.fs.small * 1.15) / 2, L.fs.small, L.footText ? L.footText.col : T.dim, 600, 'center'); rec('text', tc, { role: 'tip', in: 'tooltip' }); return box; }
      if (L.compact) { var it0 = item(e.id), line = it0.name + '  ' + (KIND_LABEL[it0.kind] || 'Item') + (it0.stack > 1 ? '  ' + e.n + '/' + it0.stack : '') + (usableItem(it0) ? '  U use' : ''); while (line.length > 2 && tw(line, L.fs.small, 600, false) > r.w - padT * 2) line = line.slice(0, -2) + '.'; var tl = text(ctx, L, line, r.x + padT, r.y + (r.h - L.fs.small * 1.15) / 2, L.fs.small, rarityCol(it0), 700, 'left'); rec('text', tl, { role: 'tip', in: 'tooltip' }); return box; }
      if (!e) { var t0 = text(ctx, L, S.ptrType === 'touch' ? 'Tap an item to see it here' : 'Point at an item to see it here', r.x + r.w / 2, r.y + (r.h - L.fs.small * 1.15) / 2, L.fs.small, T.dim, 600, 'center'); rec('text', t0, { role: 'tip', in: 'tooltip' }); return box; }
      var it = item(e.id), sh = orientCells(it._shape, e.o), kind = KIND_LABEL[it.kind] || 'Item';
      var right = kind + ' ' + sh.w + 'x' + sh.h + (it.stack > 1 ? ' ' + e.n + '/' + it.stack : '') + (usableItem(it) ? (pixel ? '  U' : '   U use') : '');
      var rw = tw(right, L.fs.small, 600, pixel), nm = it.name; while (nm.length > 2 && tw(nm, L.fs.tip, 700, pixel) > r.w - padT * 3 - rw) nm = nm.slice(0, -2) + '.';
      var a1 = text(ctx, L, nm, r.x + padT, r.y + padT, L.fs.tip, rarityCol(it), 700, 'left'); rec('text', a1, { role: 'tip', in: 'tooltip' });
      var a2 = text(ctx, L, right, r.x + r.w - padT, r.y + padT + (pixel ? 0 : (L.fs.tip - L.fs.small) * 0.6), L.fs.small, T.dim, 600, 'right'); rec('text', a2, { role: 'tip', in: 'tooltip' });
      var d = it.desc || ''; while (d.length > 2 && tw(d, L.fs.small, 500, pixel) > r.w - padT * 2) d = d.slice(0, -2) + '.';
      var a3 = text(ctx, L, d, r.x + padT, r.y + r.h - padT - (pixel ? 8 : L.fs.small * 1.15), L.fs.small, T.text, 500, 'left'); rec('text', a3, { role: 'tip', in: 'tooltip' });
      return box;
    }
    function draw(ctx) {
      if (!ctx) return;
      DRAWN = [];
      if (!S.open) return;   // no close fade: games usually stop calling update() once the bag is closed
      var openK = ease((S.time - S.openAt) / 140);
      S.frames++;
      try {
        try { var cvs = ctx.canvas, br = cvs && cvs.getBoundingClientRect && cvs.getBoundingClientRect(); if (br && br.width > 0 && opt.cssScale !== false) { var V0 = viewRect(), m = ctx.getTransform(), nativeW = cvs.width / Math.max(0.01, m.a); var cs = br.width / nativeW; if (isFinite(cs) && cs > 0 && Math.abs(cs - S.cssScale) > 0.01) S.cssScale = cs; } } catch (e0) { }
        var L = layout(), T = L.T, u = L.u, pixel = L.pixel;
        ctx.save();
        if (P.dim > 0) { ctx.fillStyle = 'rgba(6,4,8,' + (P.dim * openK) + ')'; ctx.fillRect(L.view.x, L.view.y, L.view.w, L.view.h); }
        ctx.globalAlpha = openK;
        var W = L.win; if (!pixel && openK < 1) { ctx.translate(W.x + W.w / 2, W.y + W.h / 2); var sc = 0.94 + 0.06 * openK; ctx.scale(sc, sc); ctx.translate(-(W.x + W.w / 2), -(W.y + W.h / 2)); }
        panel(ctx, L, W, 'win'); rec('window', W);
        // header
        if (!L.compact) { var tr = text(ctx, L, S.title, L.head.x + (pixel ? 1 : 2 * u), L.head.y + (pixel ? 1 : 0), L.fs.title, T.head, 700, 'left'); rec('text', tr, { role: 'title' }); }
        var used = 0, total = 0, G0 = GR.bag; for (var yy = 0; yy < G0.rows; yy++) for (var xx = 0; xx < G0.cols; xx++) if (usable('bag', xx, yy)) total++;
        S.entries.forEach(function (e) { if (e.g === 'bag') used += item(e.id)._shape.cells.length; });
        L.counts = { used: used, total: total, ground: S.entries.filter(function (e) { return e.g === 'ground'; }).length };
        if (!pixel && !L.compact) { ctx.fillStyle = 'rgba(232,196,119,0.22)'; ctx.fillRect(L.head.x, L.head.y + L.head.h + 2 * u, L.head.w, 1 * u); }
        if (!L.tabs) {
          var Gb = L.grids.bag, cnt = used + ' / ' + total + (pixel ? '' : ' cells');
          var cr = text(ctx, L, cnt, Gb.x + Gb.w - (pixel ? 0 : 1 * u), Gb.label.y + (pixel ? 0 : 1 * u), L.fs.label, used >= total ? '#ff9a7a' : T.dim, 600, 'right'); rec('text', cr, { role: 'counter' });
        }
        ['bag', 'ground'].forEach(function (g) {
          var G = L.grids[g]; if (!G) return;
          drawGrid(ctx, L, g); rec('grid', G, { g: g });
          if (L.tabs) return;
          var lab = g === 'bag' ? (opt.bagLabel || 'Carried') : (L.counts.ground ? 'On the ground' : 'Ground (drop here)');
          var room = G.w - (g === 'bag' ? tw(used + ' / ' + total + (pixel ? '' : ' cells'), L.fs.label, 600, pixel) + (pixel ? 6 : 12 * u) : 0);
          if (tw(lab, L.fs.label, 700, pixel) > room) lab = g === 'bag' ? '' : 'Ground';
          while (lab.length > 1 && tw(lab, L.fs.label, 700, pixel) > room) lab = lab.slice(0, -1);
          var lr = text(ctx, L, lab, G.label.x + (pixel ? 0 : 1 * u), G.label.y + (pixel ? 0 : 1 * u), L.fs.label, T.dim, 700, 'left'); rec('text', lr, { role: 'label' });
        });
        // entries (only those of the grids on screen)
        var H = S.held, R = H ? evaluate() : null, hoverUid = S.hover;
        var hoverOk = hoverUid != null && (S.time - S.hoverAt >= P.hoverMs || L.tabs);
        var tipUid = H ? null : (S.mode === 'pointer' ? (hoverOk ? hoverUid : (hoverUid == null ? S.sel : null)) : targetUid());
        var blockers = R && R.kind === 'invalid' ? (R.hits || []) : [], swapE = R && R.kind === 'swap' ? R.other : null;
        var vis = S.entries.filter(function (e) { return !!L.grids[e.g]; });
        vis.forEach(function (e) {
          var it = item(e.id), D = entryDrawBox(e, L), base = entryBox(e, L);
          rec('item', D.box, { uid: e.uid, id: e.id, g: e.g, cells: cellsOf(e) });
          if (e === swapE) return;   // drawn on top below
          drawArt(ctx, L, e, scaleBox(D.box, D.k), null, D.alpha == null ? 1 : D.alpha, false);
          if (blockers.indexOf(e) >= 0) shapeFill(ctx, L, e, base, T.bad, pixel ? 0.45 : 0.42, null);
          if (R && R.kind === 'merge' && R.other === e) shapeFill(ctx, L, e, base, T.merge, pixel ? 0.4 : 0.32, null);
          if (e.uid === tipUid || e.uid === S.sel) { shapeFill(ctx, L, e, base, T.cursor, pixel ? 0.14 : 0.1, null); outlineShape(ctx, L, e, base, T.cursor, pixel ? 1 : 1.6 * u); }
        });
        vis.forEach(function (e) { if (e !== swapE && (!S.anim[e.uid] || S.anim[e.uid].kind === 'pulse' || S.anim[e.uid].kind === 'pop')) countPlate(ctx, L, e, entryBox(e, L)); });
        // ghost of the held item
        if (H && R && R.g && L.grids[R.g] && P.ghost !== 'off') {
          var Gg = L.grids[R.g], col = R.kind === 'place' ? T.ok : R.kind === 'merge' ? T.merge : R.kind === 'swap' ? T.swap : T.bad;
          ctx.save(); ctx.beginPath(); ctx.rect(Gg.x - 1, Gg.y - 1, Gg.w + 2, Gg.h + 2); ctx.clip();
          var bad = {}; (R.out || []).forEach(function (q) { bad[q[0] + ',' + q[1]] = 1; }); (R.hits && R.kind === 'invalid' ? R.hits : []).forEach(function (o) { cellsOf(o).forEach(function (q) { bad[q[0] + ',' + q[1]] = 1; }); });
          R.cells.forEach(function (q) {
            var cx = Gg.x + q[0] * Gg.cell, cy = Gg.y + q[1] * Gg.cell, isBad = R.kind === 'invalid' && bad[q[0] + ',' + q[1]], c2 = col, fa = R.kind === 'invalid' && !isBad ? 0.12 : 0.3;
            if (pixel) { ctx.fillStyle = rgba(c2, fa + 0.08); ctx.fillRect(cx + 1, cy + 1, Gg.cell - 1, Gg.cell - 1); ctx.fillStyle = c2; ctx.fillRect(cx + 1, cy + 1, Gg.cell - 1, 1); ctx.fillRect(cx + 1, cy + Gg.cell - 1, Gg.cell - 1, 1); ctx.fillRect(cx + 1, cy + 1, 1, Gg.cell - 1); ctx.fillRect(cx + Gg.cell - 1, cy + 1, 1, Gg.cell - 1); }
            else { rr(ctx, cx + 1.5 * u, cy + 1.5 * u, Gg.cell - 3 * u, Gg.cell - 3 * u, 3 * u); ctx.fillStyle = rgba(c2, fa); ctx.fill(); ctx.lineWidth = (isBad ? 2.2 : 1.5) * u; ctx.strokeStyle = rgba(c2, R.kind === 'invalid' && !isBad ? 0.5 : 0.95); ctx.stroke(); }
          });
          ctx.restore();
          var gb = { x: Gg.x + R.x * Gg.cell, y: Gg.y + R.y * Gg.cell, w: orientCells(item(H.e.id)._shape, H.e.o).w * Gg.cell, h: orientCells(item(H.e.id)._shape, H.e.o).h * Gg.cell };
          rec('ghost', gb, { kind2: R.kind, g: R.g, cells: R.cells });
        }
        // swap: the item you will get, opaque, outlined, with a badge
        var swapBox = null;
        if (swapE && L.grids[swapE.g]) {
          swapBox = entryBox(swapE, L);
          drawArt(ctx, L, swapE, swapBox, null, 1, false);
          shapeFill(ctx, L, swapE, swapBox, T.swap, pixel ? 0.2 : 0.14, null);
          countPlate(ctx, L, swapE, swapBox);
          outlineShape(ctx, L, swapE, swapBox, T.swap, pixel ? 1 : 2.4 * u);
          rec('swapTarget', swapBox, { uid: swapE.uid, id: swapE.id });
        }
        // keyboard cursor
        if (S.mode === 'key') {
          var cr2 = cellRect(S.cur.g, S.cur.x, S.cur.y, L);
          if (cr2) {
            var pulse = 0.5 + 0.5 * Math.sin(S.time / 160), arm = pixel ? 3 : Math.max(4, L.cell * 0.22), lw = pixel ? 1 : 2 * u, o2 = pixel ? 0 : 1.5 * u + pulse * 1.5 * u;
            ctx.save(); ctx.fillStyle = T.cursor; ctx.strokeStyle = T.cursor; ctx.globalAlpha *= 0.75 + 0.25 * pulse;
            var x0 = cr2.x - o2, y0 = cr2.y - o2, x1 = cr2.x + cr2.w + o2, y1 = cr2.y + cr2.h + o2;
            [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(function (p) {
              if (pixel) { ctx.fillRect(p[2] > 0 ? p[0] : p[0] - arm, p[3] > 0 ? p[1] : p[1] - lw, arm, lw); ctx.fillRect(p[2] > 0 ? p[0] : p[0] - lw, p[3] > 0 ? p[1] : p[1] - arm, lw, arm); }
              else { ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(p[0] + p[2] * arm, p[1]); ctx.lineTo(p[0], p[1]); ctx.lineTo(p[0], p[1] + p[3] * arm); ctx.stroke(); }
            });
            ctx.restore(); rec('cursor', cr2, { g: S.cur.g });
          }
        }
        // buttons (enabled state) and tabs
        var tgt = entryByUid(targetUid());
        L.buttons.forEach(function (b) {
          var en = true;
          if (b.id === 'rotate') en = !!(H || tgt); else if (b.id === 'use') en = !H && !!tgt && usableItem(item(tgt.id));
          else if (b.id === 'drop') en = !H && !!tgt && tgt.g === 'bag'; else if (b.id === 'take') en = !H;
          if (b.tab) drawTab(ctx, L, b); else drawButton(ctx, L, b, en);
        });
        // hint / message line
        var msg = S.msg, hintS, touch = S.ptrType === 'touch';
        if (msg) hintS = msg.text;
        else if (touch) hintS = H ? 'Lift to place   second finger: turn' : 'Tap: details   drag: move   two fingers: turn';
        else if (H) hintS = pixel ? 'Z place  R turn  X put back' : 'Z / click  place      R / right-click  turn      X  put back';
        else hintS = pixel ? 'Z pick up  R turn  X close' : 'Arrows  move      Z / drag  pick up      R  turn      T  sort      X  close';
        if (!pixel && !msg && !touch && L.hint && L.hint.w < tw(hintS, L.fs.small, 600, false)) hintS = H ? 'Z place  R turn  X back' : 'Z pick up  R turn  X close';
        var hcol = msg ? (msg.kind === 'bad' ? '#ff9a86' : msg.kind === 'ok' ? '#a8e89a' : T.text) : T.dim;
        if (L.hint) { var hr = text(ctx, L, hintS, L.win.x + L.win.w / 2, L.hint.y, L.fs.small, hcol, 600, 'center'); rec('text', hr, { role: msg ? 'message' : 'hint' }); }
        L.footText = { s: hintS, col: hcol, msg: !!msg };
        // tooltip (or the info strip on phones)
        var te = tipUid != null ? entryByUid(tipUid) : null;
        if (L.tabs) drawInfo(ctx, L, te && L.grids[te.g] ? te : null);
        else if (te && L.grids[te.g] && !S.anim[te.uid]) drawTooltip(ctx, L, te, entryBox(te, L));
        // held item on top, inside the content area (small and up-left of the cursor while it would swap)
        if (H) {
          var sh = orientCells(item(H.e.id)._shape, H.e.o), hb;
          if (H.via === 'key' || !H.px) { var t0 = heldTarget(), Gk = L.grids[t0.g] || L.grids.bag || L.grids.ground; hb = { x: Gk.x + t0.x * Gk.cell - (pixel ? 2 : 4 * u), y: Gk.y + t0.y * Gk.cell - (pixel ? 3 : 6 * u), w: sh.w * L.cell, h: sh.h * L.cell }; }
          else hb = { x: H.px.x, y: H.px.y, w: sh.w * L.cell, h: sh.h * L.cell };
          var c0 = L.cell, C0 = L.content;
          if (swapBox) {   // attached to the cursor, up and left of it, at full opacity: the swap target stays readable
            var sw = hb.w * 0.72, shh = hb.h * 0.72;
            hb = H.via !== 'key' && H.px ? { x: S.ptr.x - sw + 0.18 * c0, y: S.ptr.y - shh + 0.18 * c0, w: sw, h: shh } : { x: swapBox.x - sw * 0.55, y: swapBox.y - shh * 0.55, w: sw, h: shh };
          } else hb = scaleBox(hb, 1.04);
          var sk = S.time - S.shake < 260 ? Math.sin((S.time - S.shake) / 18) * (pixel ? 2 : 4 * u) * (1 - (S.time - S.shake) / 260) : 0;
          hb.x += sk;
          var GA = null; ['bag', 'ground'].forEach(function (g) { var Gq = L.grids[g]; if (!Gq) return; GA = GA ? { x: Math.min(GA.x, Gq.x), y: Math.min(GA.y, Gq.y), x1: Math.max(GA.x1, Gq.x + Gq.w), y1: Math.max(GA.y1, Gq.y + Gq.h) } : { x: Gq.x, y: Gq.y, x1: Gq.x + Gq.w, y1: Gq.y + Gq.h }; });
          if (GA) C0 = { x: GA.x, y: GA.y, w: GA.x1 - GA.x, h: GA.y1 - GA.y };
          hb.x = hb.w >= C0.w ? C0.x : clamp(hb.x, C0.x, C0.x + C0.w - hb.w); hb.y = hb.h >= C0.h ? C0.y : clamp(hb.y, C0.y, C0.y + C0.h - hb.h);   // inside the grid area: never over the header, the counter or the buttons
          if (pixel) { hb.x = Math.round(hb.x); hb.y = Math.round(hb.y); }
          var A2 = S.anim[H.e.uid], tk = A2 && A2.kind === 'turn' ? 0.86 + 0.14 * ease((S.time - A2.t0) / A2.dur) : 1;
          drawArt(ctx, L, H.e, scaleBox(hb, tk), null, 1, true);
          if (H.e.n > 1 && !swapBox) countPlate(ctx, L, H.e, hb);
          rec('held', hb, { id: H.e.id, uid: H.e.uid });
        }
        if (swapBox) drawSwapLabel(ctx, L, swapE, swapBox, H ? hb : null);
        ctx.restore();
      } catch (err) { S.errors++; try { ctx.restore(); } catch (e2) { } }
    }

    /* ---------- public ---------- */
    var inst = {
      version: VERSION,
      update: update, draw: draw, key: key, press: action, pointer: pointer, button: pressButton,
      open: open, close: close, busy: function () { return S.open; }, isOpen: function () { return S.open; },
      add: function (id, n) { n = n == null ? 1 : n; return essential(id) ? placeEssential(id, Math.max(0, Math.round(num(n, 1))), 'add') : addTo('bag', id, n, 'add'); },
      isKey: function (id) { return essential(id); },
      remove: function (id, n) { return removeFrom('bag', id, n == null ? 1 : n, 'remove'); },
      count: function (id) { return bagCount(id); }, canAdd: canAdd,
      sync: function (counts) {   // make the bag hold exactly these counts (adds by first fit, removes from the smallest stacks)
        var res = { added: 0, removed: 0, missing: {} }; counts = counts || {};
        var ids = {}; Object.keys(counts).forEach(function (k) { ids[k] = 1; }); S.entries.forEach(function (e) { if (e.g === 'bag') ids[e.id] = 1; });
        Object.keys(ids).sort().forEach(function (id) {
          var want = Math.max(0, Math.round(num(counts[id], 0))), have = bagCount(id);
          if (want > have) { var k = addTo('bag', id, want - have, 'sync'); res.added += k; if (k < want - have) res.missing[id] = want - have - k; }
          else if (want < have) res.removed += removeFrom('bag', id, have - want, 'sync');
        });
        return res;
      },
      use: function (id) { var e = null; S.entries.forEach(function (q) { if (!e && q.g === 'bag' && q.id === id) e = q; }); return useEntry(e); },
      rotate: rotate, sort: sortBag, takeAll: takeAll,
      clear: function () { S.entries = []; S.held = null; S.sel = null; S.limbo = []; changed('clear'); },
      setItems: function (t) { setItems(t); },
      entries: function () { return S.entries.map(function (e) { return { uid: e.uid, id: e.id, n: e.n, g: e.g, x: e.x, y: e.y, o: e.o, cells: cellsOf(e) }; }); },
      held: function () { var H = S.held; return H ? { id: H.e.id, n: H.e.n, o: H.e.o, uid: H.e.uid, from: H.from, via: H.via } : null; },
      layout: function () { return layout(); }, showGrid: function (g) { if (g === 'bag' || (g === 'ground' && GR.ground)) S.tab = g; }, cellRect: function (g, x, y) { return cellRect(g, x, y); }, rect: function () { return S.open ? (S.lastLayout || layout()).win : null; },
      lastDrawn: function () { return DRAWN.slice(); }, events: function () { return S.events.slice(); },
      lastEvent: function () { return S.events.length ? S.events[S.events.length - 1] : null; },
      grids: function () { return { bag: { cols: GR.bag.cols, rows: GR.bag.rows, mask: GR.bag.mask ? GR.bag.mask.slice() : null }, ground: GR.ground ? { cols: GR.ground.cols, rows: GR.ground.rows } : null }; },
      item: function (id) { var it = item(id); return { id: it.id, name: it.name, shape: it._shape, stack: it.stack, art: it._art, kind: it.kind }; },
      params: function () { var o = {}; Object.keys(P).forEach(function (k) { o[k] = P[k]; }); return o; },
      serialize: function () { return { v: 1, cols: GR.bag.cols, rows: GR.bag.rows, bag: S.entries.filter(function (e) { return e.g === 'bag'; }).map(function (e) { return [e.id, e.n, e.x, e.y, e.o]; }) }; },
      restore: function (data) {
        if (!data || data.v !== 1 || !Array.isArray(data.bag)) return false;
        S.entries = S.entries.filter(function (e) { return e.g !== 'bag'; }); S.held = null; var lost = [];
        data.bag.forEach(function (r) { var id = r[0], n = Math.max(1, num(r[1], 1)), o = (r[4] | 0) & 3; if (test('bag', id, o, r[2] | 0, r[3] | 0, null).ok) newEntry(id, Math.min(n, item(id).stack), 'bag', r[2] | 0, r[3] | 0, o); else lost.push([id, n]); });
        lost.forEach(function (l) { addTo('bag', l[0], l[1], 'restore'); });
        changed('restore'); return true;
      },
      state: function () {
        var H = S.held, R = H ? evaluate() : null, L = S.lastLayout;
        return { open: S.open, time: Math.round(S.time), theme: themeName(), mode: S.mode, cursor: { g: S.cur.g, x: S.cur.x, y: S.cur.y }, sel: S.sel, hover: S.hover,
          held: H ? { id: H.e.id, n: H.e.n, o: H.e.o, via: H.via, target: R ? { kind: R.kind, why: R.why || null, g: R.g, x: R.x, y: R.y } : null } : null,
          entries: S.entries.map(function (e) { return { uid: e.uid, id: e.id, n: e.n, g: e.g, x: e.x, y: e.y, o: e.o }; }),
          message: S.msg ? S.msg.text : null, lastEvent: S.events.length ? S.events[S.events.length - 1] : null, opens: S.opens, frames: S.frames, errors: S.errors,
          limbo: S.limbo.concat(S.pending), window: L ? L.win : null };
      }
    };
    return inst;
  }

  root.GameDNA_ShapedInventory = {
    version: VERSION, create: create, SHAPES: SHAPES, ARTS: Object.keys(ARTS), PIXEL_ARTS: Object.keys(FG), pixelGlyphData: pixelGlyphData, pixelArtFor: function (def) { var it = {}; Object.keys(def || {}).forEach(function (k) { it[k] = def[k]; }); it._art = ARTS[it.art] ? it.art : ARTS[it.id] ? it.id : ART_OF_KIND[it.kind] || 'box'; return pixelArtFor(it); }, pixelGlyphShape: function (art) { var G = pixelGlyphData(art); return parseShape(FG_SHAPE[art] || (G.aw + 'x' + G.ah)); }, pixelGlyphColors: function (def, art) { return pixelGlyphColors(def || {}, art, '#1c1622'); }, parseShape: parseShape, orientCells: orientCells, orientMatrix: orientMatrix, orientsOf: orientsOf,
    /* draw one item's art (for a HUD, a pickup, a shop list); w, h in device px; returns the canvas or null */
    renderArt: function (def, o, w, h, pixel) {
      var it = {}; Object.keys(def || {}).forEach(function (k) { it[k] = def[k]; }); it.id = it.id || 'item'; it._shape = parseShape(it.shape || '1x1');
      it._art = ARTS[it.art] ? it.art : ARTS[it.id] ? it.id : ART_OF_KIND[it.kind] || 'box'; it._key = 'r:' + it.id + ':' + (it.art || '') + ':' + (it.color || '') + JSON.stringify(it._shape.cells) + (it.image ? ':img' : '');
      var A = renderArt(it, o | 0, w, h, !!pixel); return A ? A.img : null;
    }
  };
})(typeof window !== 'undefined' ? window : this);
