/* GameDNA E-19 loot-beams v1.0.0 - loot drops with rarity beams. Plain script, no dependencies, no import/export.
 * One global: GameDNA_LootBeams. ASCII only.
 *
 * Defeated foes and opened chests pop loot that arcs out, lands with a bounce on free ground (never inside a wall or off the
 * map: the landing spot and the whole flight path are tested against the game's own solid() before the item leaves),
 * then shows a rarity-coloured light beam, a glowing outline and a small name tag. Items in reach fly to the player
 * (magnet, only with a clear line) and are picked up exactly once with a flash; the game gets onPickup(drop).
 * Rarities, items and drop tables are plain data. Name tags are laid out in update(): they never overlap each other, the
 * game's HUD rects or the view edge, glide (or crossfade) instead of jumping, and keep a minimum dwell.
 * Deterministic from the seed, the order of calls and update() time (no Math.random, no wall clock).
 * Crisp whole pixels with a bitmap font on native pixel canvases, smooth shaded icons and soft light on HD canvases.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.3', STEP = 1000 / 60;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hit(a, b, gap) { gap = gap || 0; return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap; }
  function inside(r, v) { return r.x >= v.x - 0.01 && r.y >= v.y - 0.01 && r.x + r.w <= v.x + v.w + 0.01 && r.y + r.h <= v.y + v.h + 0.01; }
  function makeRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash1(a, b) { var h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; }
  function hex(c) { c = String(c || '#ffffff'); if (c.charAt(0) === '#' && c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; var n = parseInt(c.slice(1, 7), 16); return isNaN(n) ? [255, 255, 255] : [n >> 16, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))]; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 1 : Math.round(clamp(a, 0, 1) * 1000) / 1000) + ')'; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }

  /* ---------- data: rarities, items, tables (copy and edit; see README "Data format") ---------- */
  var RARITIES = [
    { id: 'common', name: 'Common', color: '#e9e4d8', weight: 60, beam: 0, glow: 0.35 },
    { id: 'uncommon', name: 'Uncommon', color: '#6fdc4f', weight: 25, beam: 0.7, glow: 0.6 },
    { id: 'rare', name: 'Rare', color: '#4fa8ff', weight: 10, beam: 1, glow: 0.8 },
    { id: 'epic', name: 'Epic', color: '#c070ff', weight: 4, beam: 1.25, glow: 0.95 },
    { id: 'legendary', name: 'Legendary', color: '#ffad33', weight: 1, beam: 1.55, glow: 1, burst: true }
  ];
  var ITEMS = {
    gold: { icon: 'coins', names: { common: 'Gold' }, count: [3, 12], kind: 'gold' },
    potion: { icon: 'potion', names: { common: 'Healing Draught', uncommon: 'Greater Draught' } },
    crystal: { icon: 'shard', names: { common: 'Mana Shard', uncommon: 'Mana Crystal', rare: 'Deep Crystal' } },
    blade: { icon: 'sword', names: { common: 'Iron Blade', uncommon: 'Keen Blade', rare: 'Runed Blade', epic: 'Dawnsteel Edge', legendary: 'Sunforged Sword' } },
    shield: { icon: 'shield', names: { common: 'Oak Buckler', uncommon: 'Iron Kite', rare: "Warden's Shield", epic: 'Tidewall' } },
    ring: { icon: 'ring', names: { uncommon: 'Silver Ring', rare: 'Moonstone Ring', epic: 'Ring of Tides', legendary: 'Ember Crown Ring' } },
    gem: { icon: 'gem', names: { uncommon: 'Rough Garnet', rare: 'Clear Ruby', epic: 'Heartfire Ruby' } },
    scroll: { icon: 'scroll', names: { common: 'Torn Map', uncommon: 'Scroll of Mending', rare: 'Scroll of Haste' } },
    amulet: { icon: 'amulet', names: { rare: 'Bone Charm', epic: 'Starlit Amulet', legendary: 'Heart of the Grove' } },
    key: { icon: 'key', names: { uncommon: 'Brass Key', rare: 'Vault Key' } }
  };
  var TABLES = {
    foe: { rolls: [0, 1], gold: { chance: 0.75, count: [2, 8] } },
    elite: { rolls: [1, 2], gold: { chance: 1, count: [6, 16] }, luck: 1.3 },
    chest: { rolls: [2, 3], gold: { chance: 1, count: [10, 24] }, luck: 1.5, guarantee: 'uncommon' },
    boss: { rolls: [3, 4], gold: { chance: 1, count: [25, 60] }, luck: 2, guarantee: 'epic' }
  };
  var DEFAULTS = { magnet: 56, pick: 10, tags: 'all', beams: 'uncommon', beamHeight: 1, distance: 1, bounce: 1, life: 0, render: 'auto',
    uiScale: 0, maxTags: 14, cap: 120, speed: 1, sparkle: 1, settle: 300 };
  var RANGES = { magnet: [0, 400], pick: [2, 60], beamHeight: [0, 3], distance: [0.2, 3], bounce: [0, 2], life: [0, 600000], uiScale: [0, 6],
    maxTags: [0, 60], cap: [8, 400], speed: [0.25, 4], sparkle: [0, 2], settle: [0, 3000] };
  var BEAM_MIN = { all: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, off: 99 };
  var TAG_MIN = { all: 0, uncommon: 1, rare: 2, epic: 3, off: 99 };

  /* weights of a table: the table's own `weights` {id: w}, else each rarity's weight; `luck` multiplies rarity i by luck^i */
  function weightsOf(rar, t) {
    var out = [], luck = num(t && t.luck, 1), w, i;
    for (i = 0; i < rar.length; i++) {
      w = t && t.weights && t.weights[rar[i].id] != null ? num(t.weights[rar[i].id], 0) : num(rar[i].weight, 0);
      out.push(Math.max(0, w * Math.pow(luck, i)));
    }
    return out;
  }
  function pickWeighted(ws, r) {
    var tot = 0, i; for (i = 0; i < ws.length; i++) tot += ws[i];
    if (!(tot > 0)) return 0;
    var x = r * tot;
    for (i = 0; i < ws.length; i++) { x -= ws[i]; if (x < 0 && ws[i] > 0) return i; }
    for (i = ws.length - 1; i >= 0; i--) if (ws[i] > 0) return i;
    return 0;
  }
  function rangeInt(v, rnd, d) {
    if (Array.isArray(v)) { var a = Math.round(num(v[0], d)), b = Math.round(num(v[1], a)); return a + Math.floor(rnd() * (b - a + 1)); }
    return Math.round(num(v, d));
  }
  /* roll one table: [{item, rarity, count, name}] (gold first). Pure: same data + same rnd sequence = same result. */
  function rollTable(t, rnd, items, rar) {
    items = items || ITEMS; rar = rar || RARITIES; t = t || TABLES.foe;
    var out = [], idx = {}, i, k;
    for (i = 0; i < rar.length; i++) idx[rar[i].id] = i;
    if (t.gold && items.gold) { var gc = t.gold.chance == null ? 1 : num(t.gold.chance, 1); if (rnd() < gc) out.push({ item: 'gold', rarity: rar[0].id, count: Math.max(1, rangeInt(t.gold.count || items.gold.count || [1, 1], rnd, 1)) }); }
    var n = Math.max(0, rangeInt(t.rolls == null ? 1 : t.rolls, rnd, 1)), ws = weightsOf(rar, t), pool = t.pool || null;
    if (!pool) { pool = []; for (k in items) if (k !== 'gold' && !items[k].noDrop) pool.push(k); }
    for (var r = 0; r < n; r++) {
      var w2 = ws;
      if (r === 0 && t.guarantee && idx[t.guarantee] != null) { w2 = ws.slice(); for (i = 0; i < idx[t.guarantee]; i++) w2[i] = 0; }
      var ri = pickWeighted(w2, rnd()), cand = [];
      for (var down = ri; down >= 0 && !cand.length; down--) {   // no pool item at this rarity: the nearest lower one that has one
        for (i = 0; i < pool.length; i++) { var it = items[pool[i]]; if (it && it.names && it.names[rar[down].id]) cand.push(pool[i]); }
        if (cand.length) ri = down;
      }
      if (!cand.length) continue;
      var id = cand[Math.floor(rnd() * cand.length) % cand.length], def = items[id];
      out.push({ item: id, rarity: rar[ri].id, count: def.count ? Math.max(1, rangeInt(def.count, rnd, 1)) : 1 });
    }
    for (i = 0; i < out.length; i++) out[i].name = nameOf(items, out[i].item, out[i].rarity);
    return out;
  }
  function nameOf(items, id, rarity) { var d = items[id]; if (!d) return String(id); return (d.names && (d.names[rarity] || d.names.common)) || d.name || String(id); }

  /* ---------- 5-row bitmap font (caps rows 0-4, descenders row 5), '#' = ink ---------- */
  var FONT_SRC = {
    '!': '# # # . #', "'": '# #', '(': '.# #. #. #. .#', ')': '#. .# .# .# #.', '+': '... .#. ### .#.', ',': '.. .. .. .. .# #.',
    '-': '... ... ###', '.': '. . . . #', '/': '..# ..# .#. #.. #..', ':': '. # . # .', '?': '##. ..# .#. ... .#.', '%': '#.# ..# .#. #.. #.#',
    '0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '##. ..# .#. #.. ###', '3': '##. ..# .#. ..# ##.',
    '4': '#.# #.# ### ..# ..#', '5': '### #.. ##. ..# ##.', '6': '.## #.. ### #.# ###', '7': '### ..# .#. .#. .#.',
    '8': '### #.# ### #.# ###', '9': '### #.# ### ..# ##.',
    'A': '.##. #..# #### #..# #..#', 'B': '###. #..# ###. #..# ###.', 'C': '.### #... #... #... .###', 'D': '###. #..# #..# #..# ###.',
    'E': '### #.. ##. #.. ###', 'F': '### #.. ##. #.. #..', 'G': '.### #... #.## #..# .###', 'H': '#..# #..# #### #..# #..#',
    'I': '### .#. .#. .#. ###', 'J': '..## ...# ...# #..# .##.', 'K': '#..# #.#. ##.. #.#. #..#', 'L': '#.. #.. #.. #.. ###',
    'M': '#...# ##.## #.#.# #...# #...#', 'N': '#..# ##.# #.## #..# #..#', 'O': '.##. #..# #..# #..# .##.', 'P': '###. #..# ###. #... #...',
    'Q': '.##. #..# #..# #.#. .#.#', 'R': '###. #..# ###. #.#. #..#', 'S': '.### #... .##. ...# ###.', 'T': '### .#. .#. .#. .#.',
    'U': '#..# #..# #..# #..# .##.', 'V': '#.# #.# #.# .#. .#.', 'W': '#...# #...# #.#.# #.#.# .#.#.', 'X': '#.# #.# .#. #.# #.#',
    'Y': '#.# #.# .#. .#. .#.', 'Z': '#### ..#. .#.. #... ####',
    'a': '... ##. .## #.# .##', 'b': '#.. ##. #.# #.# ##.', 'c': '... .## #.. #.. .##', 'd': '..# .## #.# #.# .##',
    'e': '... .#. ### #.. .##', 'f': '..# .#. ### .#. .#.', 'g': '... .## #.# .## ..# ##.', 'h': '#.. ##. #.# #.# #.#',
    'i': '# . # # #', 'j': '.# .. .# .# .# #.', 'k': '#.. #.# ##. #.# #.#', 'l': '#. #. #. #. .#',
    'm': '..... ##.#. #.#.# #.#.# #.#.#', 'n': '... ##. #.# #.# #.#', 'o': '... .#. #.# #.# .#.', 'p': '... ##. #.# #.# ##. #..',
    'q': '... .## #.# #.# .## ..#', 'r': '... #.# ##. #.. #..', 's': '... .## #.. ..# ##.', 't': '.#. ### .#. .#. ..#',
    'u': '... #.# #.# #.# .##', 'v': '... #.# #.# #.# .#.', 'w': '..... #...# #.#.# #.#.# .#.#.', 'x': '... #.# .#. .#. #.#',
    'y': '... #.# #.# .## ..# ##.', 'z': '... ### ..# #.. ###'
  };
  var FONT = {};
  (function () { for (var ch in FONT_SRC) { var rows = FONT_SRC[ch].split(' '), w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length); FONT[ch] = { rows: rows, w: w }; } })();
  function glyph(c) { return FONT[c] || FONT[c.toUpperCase()] || FONT['?']; }
  function pixW(s) { var w = 0; s = String(s); for (var i = 0; i < s.length; i++) { var c = s.charAt(i); if (c === ' ') { w += 3; continue; } w += glyph(c).w + 1; } return Math.max(0, w - 1); }
  function pixText(g, s, x, y, k, col) {
    g.fillStyle = col; s = String(s); var cx = x;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i); if (c === ' ') { cx += 3 * k; continue; }
      var gl = glyph(c);
      for (var r = 0; r < gl.rows.length; r++) for (var j = 0; j < gl.rows[r].length; j++) if (gl.rows[r].charAt(j) === '#') g.fillRect(cx + j * k, y + r * k, k, k);
      cx += (gl.w + 1) * k;
    }
  }

  /* ---------- icons: shapes in unit space, shaded per pixel (4 hard tones on pixel canvases, smooth light on HD) ---------- */
  function sqr(v) { return v * v; }
  function inEll(x, y, cx, cy, rx, ry) { return sqr((x - cx) / rx) + sqr((y - cy) / ry) <= 1; }
  function segD(x, y, ax, ay, bx, by) { var dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1); return Math.hypot(x - ax - dx * t, y - ay - dy * t); }
  function inPoly(x, y, p) { var c = false; for (var i = 0, j = p.length - 1; i < p.length; j = i++) { if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; } return c; }
  var GOLD = '#f2c23a', STEEL = '#b9c4d2', WOOD = '#9a6334', PAPER = '#ead9ae';
  /* each icon: layers drawn in order {c: base colour, f(x, y) -> inside?, flat: no dome shading}; unit square, y down */
  var ICONS = {
    coins: [
      { c: GOLD, f: function (x, y) { return inEll(x, y, 0.36, 0.78, 0.3, 0.13); } },
      { c: GOLD, f: function (x, y) { return inEll(x, y, 0.38, 0.66, 0.3, 0.13); } },
      { c: GOLD, f: function (x, y) { return inEll(x, y, 0.36, 0.54, 0.3, 0.13); } },
      { c: '#ffd75a', f: function (x, y) { return inEll(x, y, 0.68, 0.5, 0.25, 0.3); } },
      { c: '#d79a22', f: function (x, y) { return inEll(x, y, 0.68, 0.5, 0.12, 0.15); }, flat: 1 }
    ],
    potion: [
      { c: '#d9e6f0', f: function (x, y) { return inEll(x, y, 0.5, 0.64, 0.33, 0.31) || (x > 0.38 && x < 0.62 && y > 0.18 && y < 0.42); } },
      { c: '#e0384a', f: function (x, y) { return inEll(x, y, 0.5, 0.66, 0.27, 0.25) && y > 0.5; } },
      { c: WOOD, f: function (x, y) { return x > 0.35 && x < 0.65 && y > 0.06 && y < 0.22; } },
      { c: '#ffffff', f: function (x, y) { return inEll(x, y, 0.37, 0.56, 0.06, 0.09); }, flat: 1 }
    ],
    shard: [
      { c: '#5fe3f2', f: function (x, y) { return inPoly(x, y, [[0.5, 0.04], [0.8, 0.46], [0.5, 0.96], [0.2, 0.46]]); } },
      { c: '#c8fbff', f: function (x, y) { return inPoly(x, y, [[0.5, 0.1], [0.62, 0.44], [0.5, 0.7], [0.36, 0.44]]); }, flat: 1 }
    ],
    sword: [
      { c: STEEL, f: function (x, y) { return segD(x, y, 0.36, 0.64, 0.86, 0.14) < 0.075 || inPoly(x, y, [[0.8, 0.1], [0.94, 0.06], [0.9, 0.2]]); } },
      { c: GOLD, f: function (x, y) { return segD(x, y, 0.2, 0.52, 0.48, 0.8) < 0.065; } },
      { c: '#6d3f22', f: function (x, y) { return segD(x, y, 0.13, 0.87, 0.32, 0.68) < 0.055; } },
      { c: GOLD, f: function (x, y) { return inEll(x, y, 0.11, 0.89, 0.075, 0.075); } }
    ],
    shield: [
      { c: STEEL, f: function (x, y) { if (y < 0.08 || y > 0.95) return false; var hw = y < 0.5 ? 0.4 : 0.4 * Math.sqrt(Math.max(0, 1 - sqr((y - 0.5) / 0.46))); return Math.abs(x - 0.5) <= hw; } },
      { c: '#3d63b8', f: function (x, y) { if (y < 0.16 || y > 0.86) return false; var hw = y < 0.5 ? 0.31 : 0.31 * Math.sqrt(Math.max(0, 1 - sqr((y - 0.5) / 0.37))); return Math.abs(x - 0.5) <= hw; } },
      { c: GOLD, f: function (x, y) { return inEll(x, y, 0.5, 0.46, 0.11, 0.11); } }
    ],
    ring: [
      { c: GOLD, f: function (x, y) { return inEll(x, y, 0.5, 0.64, 0.36, 0.27) && !inEll(x, y, 0.5, 0.66, 0.22, 0.14); } },
      { c: GOLD, f: function (x, y) { return inEll(x, y, 0.5, 0.36, 0.2, 0.15); } },
      { c: '#39c46a', f: function (x, y) { return inEll(x, y, 0.5, 0.33, 0.13, 0.11); } }
    ],
    gem: [
      { c: '#e0384a', f: function (x, y) { return inPoly(x, y, [[0.3, 0.12], [0.7, 0.12], [0.92, 0.38], [0.5, 0.92], [0.08, 0.38]]); } },
      { c: '#ff8a8a', f: function (x, y) { return inPoly(x, y, [[0.34, 0.18], [0.66, 0.18], [0.8, 0.38], [0.2, 0.38]]); }, flat: 1 }
    ],
    scroll: [
      { c: PAPER, f: function (x, y) { return x > 0.22 && x < 0.78 && y > 0.22 && y < 0.8; } },
      { c: '#d4bd85', f: function (x, y) { return inEll(x, y, 0.5, 0.21, 0.36, 0.09); } },
      { c: '#d4bd85', f: function (x, y) { return inEll(x, y, 0.5, 0.81, 0.36, 0.09); } },
      { c: '#c8323c', f: function (x, y) { return y > 0.47 && y < 0.57 && x > 0.2 && x < 0.8; }, flat: 1 }
    ],
    amulet: [
      { c: STEEL, f: function (x, y) { var d = Math.hypot(x - 0.5, y - 0.4); return y < 0.56 && d < 0.36 && d > 0.29; } },
      { c: '#d6dbe4', f: function (x, y) { return inEll(x, y, 0.5, 0.7, 0.22, 0.22); } },
      { c: '#4fa8ff', f: function (x, y) { return inEll(x, y, 0.5, 0.7, 0.1, 0.1); } }
    ],
    key: [
      { c: GOLD, f: function (x, y) { var d = Math.hypot(x - 0.3, y - 0.3); return (d < 0.22 && d > 0.1) || segD(x, y, 0.42, 0.42, 0.84, 0.84) < 0.065 || segD(x, y, 0.7, 0.7, 0.58, 0.82) < 0.06 || segD(x, y, 0.82, 0.82, 0.7, 0.94) < 0.06; } }
    ]
  };
  var OUTLINE = [32, 20, 40];
  /* render an icon to a canvas `n` px square. pixel: 4 hard tones, 1 px outline. smooth: dome light, soft outline. */
  function renderIcon(key, n, pixel) {
    if (typeof document === 'undefined') return null;
    var L = ICONS[key] || ICONS.coins, ss = pixel ? 1 : 2, N = n * ss, x, y, i, k;
    var lay = new Int8Array(N * N).fill(-1);
    for (i = 0; i < L.length; i++) for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      var u = (x + 0.5) / N, v = (y + 0.5) / N; if (pixel) { u = 0.04 + u * 0.92; v = 0.04 + v * 0.92; } else { u = 0.02 + u * 0.96; v = 0.02 + v * 0.96; }
      if (L[i].f(u, v)) lay[y * N + x] = i;
    }
    // distance to the edge of each pixel's own layer (chamfer, two passes)
    var D = new Float32Array(N * N), BIG = 1e6;
    for (k = 0; k < N * N; k++) D[k] = lay[k] < 0 ? 0 : BIG;
    var same = function (a, b) { return lay[a] === lay[b]; };
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) { k = y * N + x; if (!D[k]) continue;
      var m = BIG; if (x > 0) m = Math.min(m, same(k, k - 1) ? D[k - 1] + 1 : 1); else m = 1; if (y > 0) m = Math.min(m, same(k, k - N) ? D[k - N] + 1 : 1); else m = Math.min(m, 1);
      if (x > 0 && y > 0) m = Math.min(m, same(k, k - N - 1) ? D[k - N - 1] + 1.414 : 1.414); D[k] = Math.min(D[k], m); }
    for (y = N - 1; y >= 0; y--) for (x = N - 1; x >= 0; x--) { k = y * N + x; if (!D[k]) continue;
      var m2 = D[k]; if (x < N - 1) m2 = Math.min(m2, same(k, k + 1) ? D[k + 1] + 1 : 1); else m2 = Math.min(m2, 1); if (y < N - 1) m2 = Math.min(m2, same(k, k + N) ? D[k + N] + 1 : 1); else m2 = Math.min(m2, 1);
      if (x < N - 1 && y < N - 1) m2 = Math.min(m2, same(k, k + N + 1) ? D[k + N + 1] + 1.414 : 1.414); D[k] = m2; }
    var R = Math.max(1.5, N * (pixel ? 0.2 : 0.16)), H = new Float32Array(N * N);
    for (k = 0; k < N * N; k++) { if (lay[k] < 0) continue; var dd = Math.min(D[k], R) / R; H[k] = L[lay[k]].flat ? 0.6 : Math.sqrt(1 - sqr(1 - dd)); }
    var cv = document.createElement('canvas'); cv.width = N; cv.height = N;
    var g = cv.getContext('2d'), img = g.createImageData(N, N), P = img.data;
    var lx = -0.55, ly = -0.62, lz = 0.56, ln = Math.hypot(lx, ly, lz); lx /= ln; ly /= ln; lz /= ln;
    var DARK = [40, 22, 52], LIGHT = [255, 248, 222];
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      k = y * N + x; var li = lay[k]; if (li < 0) continue;
      var base = hex(L[li].c), h = H[k];
      var hx = (x < N - 1 && lay[k + 1] === li ? H[k + 1] : 0) - (x > 0 && lay[k - 1] === li ? H[k - 1] : 0);
      var hy = (y < N - 1 && lay[k + N] === li ? H[k + N] : 0) - (y > 0 && lay[k - N] === li ? H[k - N] : 0);
      var sc = pixel ? 1.6 : 2.4, nx = -hx * sc, ny = -hy * sc, nz = 1, nn = Math.hypot(nx, ny, nz); nx /= nn; ny /= nn; nz /= nn;
      var lam = clamp(nx * lx + ny * ly + nz * lz, 0, 1), col;
      if (L[li].flat) lam = 0.78;
      if (pixel) {
        var tone = lam > 0.93 ? 3 : lam > 0.74 ? 2 : lam > 0.5 ? 1 : 0;
        if (D[k] <= 1 && (y < N - 1 && lay[k + N] !== li) && tone > 0) tone = 0;   // bottom rim in shade
        col = tone === 3 ? mix(base, [255, 255, 255], 0.62) : tone === 2 ? mix(base, LIGHT, 0.3) : tone === 1 ? base : mix(base, DARK, 0.42);
      } else {
        col = lam < 0.62 ? mix(mix(base, DARK, 0.5), base, lam / 0.62) : mix(base, LIGHT, (lam - 0.62) / 0.38 * 0.55);
        var spec = Math.pow(Math.max(0, lam), 28); if (!L[li].flat) col = mix(col, [255, 255, 255], spec * 0.7);
        if (D[k] < 1.2 && li > 0 && lay[k - N] !== undefined) col = mix(col, DARK, 0.18);
      }
      P[k * 4] = col[0]; P[k * 4 + 1] = col[1]; P[k * 4 + 2] = col[2]; P[k * 4 + 3] = 255;
    }
    // outline around the whole icon (pixel: 1 px, 4-neighbour; smooth: 2 sub-px wide)
    var ow = pixel ? 1 : 2, add = [];
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      k = y * N + x; if (lay[k] >= 0) continue; var near = false;
      for (var dy = -ow; dy <= ow && !near; dy++) for (var dx = -ow; dx <= ow && !near; dx++) {
        if (pixel && Math.abs(dx) + Math.abs(dy) !== 1) continue; if (!pixel && dx * dx + dy * dy > ow * ow + 0.5) continue;
        var xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < N && yy < N && lay[yy * N + xx] >= 0) near = true; }
      if (near) add.push(k);
    }
    for (i = 0; i < add.length; i++) { k = add[i]; P[k * 4] = OUTLINE[0]; P[k * 4 + 1] = OUTLINE[1]; P[k * 4 + 2] = OUTLINE[2]; P[k * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    if (ss === 1) return cv;
    var out = document.createElement('canvas'); out.width = n; out.height = n; var og = out.getContext('2d'); og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high'; og.drawImage(cv, 0, 0, n, n);
    return out;
  }
  /* a solid silhouette of a canvas in one colour (pixel outline in the rarity colour) */
  function silhouette(src, col) {
    var c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    var g = c.getContext('2d'); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  /* ---------- the instance ---------- */
  function create(options) {
    var o = options || {}, P = {}, SK = null, warned = {}, R = [], RIDX = {}, ITEMSD = o.items || ITEMS, TABS = o.tables || TABLES;
    var ST = { updates: 0, frozen: 0, draws: 0, groundDraws: 0, tagDraws: 0, drops: 0, spawned: 0, landed: 0, picked: 0, magnets: 0, cancels: 0,
      relocated: 0, laneFallback: 0, crossfades: 0, atSource: 0, groundInDraw: 0, rescued: 0, expired: 0, recycled: 0, crowded: 0, tagsShown: 0, peak: 0, errors: 0, cbErrors: 0, drawErrors: 0, badInput: 0 };
    var items = [], fx = [], tagsOut = [], clock = 0, acc = 0, nextId = 1, rnd = makeRng(num(o.seed, 1)), lastView = null, groundTok = -1, iconCache = {}, iconN = 0;
    var measure = null;
    try { if (o.skin != null && o.skin !== false && root.GameDNA_Skin) SK = root.GameDNA_Skin.resolve(o.skin); } catch (e) { SK = null; }
    function warn(k, msg) { if (warned[k]) return; warned[k] = 1; if (root.console) console.warn('[GameDNA_LootBeams] ' + msg); }
    function call(fn, args, d) { if (typeof fn !== 'function') return d; try { var v = fn.apply(null, args || []); return v === undefined ? d : v; } catch (e) { ST.cbErrors++; warn('cb', 'a game callback threw: ' + (e && e.message)); return d; } }
    function val(v, d) { return typeof v === 'function' ? call(v, [], d) : v == null ? d : v; }
    function setRarities(list) { R = (list && list.length ? list : RARITIES).map(function (r, i) { return { id: String(r.id), name: r.name || r.id, color: r.color || '#ffffff', rgb: hex(r.color || '#ffffff'), weight: num(r.weight, 1), beam: num(r.beam, i ? 1 : 0), glow: num(r.glow, 0.6), burst: !!r.burst, i: i }; }); RIDX = {}; R.forEach(function (r) { RIDX[r.id] = r; }); }
    setRarities(o.rarities);
    function setParams(p) {
      p = p || {};
      for (var k in DEFAULTS) {
        var v = p[k] != null && p[k] !== '' ? p[k] : P[k] != null ? P[k] : DEFAULTS[k];
        if (typeof DEFAULTS[k] === 'number') { v = num(v, DEFAULTS[k]); if (RANGES[k]) v = clamp(v, RANGES[k][0], RANGES[k][1]); } else v = String(v);
        P[k] = v;
      }
    }
    setParams(o.params);

    /* ---------- reading the game ---------- */
    function viewOf(ctx) {
      var v = val(o.view, null);
      if (v && v.w > 0 && v.h > 0) return { x: +v.x || 0, y: +v.y || 0, w: +v.w, h: +v.h };
      if (ctx && ctx.canvas) { var s = 1; try { var m = ctx.getTransform(); s = Math.hypot(m.a, m.b) || 1; } catch (e) { } lastView = { x: 0, y: 0, w: ctx.canvas.width / s, h: ctx.canvas.height / s }; }
      return lastView;
    }
    function scaleOf() { var s = val(o.scale, null); if (s > 0) return +s; var v = viewOf(null); return v ? v.h / 360 : 1; }
    function pixelMode(view) { if (P.render === 'pixel') return true; if (P.render === 'smooth') return false; if (SK && SK.pixel) return true; view = view || viewOf(null); return !!view && view.w <= 480; }
    function uiK(view) { var u = num(val(o.uiScale, 0), 0) || P.uiScale; if (u > 0) return u; view = view || viewOf(null) || { w: 640, h: 360 }; return pixelMode(view) ? Math.max(1, Math.floor(view.h / 200)) : view.h / 360; }
    function camOf() { var c = val(o.camera, null); return c && isFinite(c.x) && isFinite(c.y) ? { x: +c.x, y: +c.y } : { x: 0, y: 0 }; }
    function solidAt(x, y) { if (typeof o.solid !== 'function') return false; return !!call(o.solid, [x, y], false); }
    function boundsOf() { var b = val(o.bounds, null); return b && b.w > 0 && b.h > 0 ? { x: +b.x || 0, y: +b.y || 0, w: +b.w, h: +b.h } : null; }
    /* tall props and standing sprites that are drawn over the ground pass (world rects): an item's icon must not land behind one */
    function occludedAt(x, y) {
      var a = val(o.occluders, null); if (!a || !a.length) return false;
      var ic = iconSize(viewOf(null)), box = { x: x - ic / 2 - 1, y: y - ic * 1.15 - 2, w: ic + 2, h: ic * 1.15 + 3 };
      for (var i = 0; i < a.length; i++) { var q = a[i]; if (q && q.w > 0 && q.h > 0 && hit(box, q, 0)) return true; }
      return false;
    }
    function keepOutAt(x, y, r) { var a = val(o.keepOut, null); if (!a || !a.length) return false; for (var i = 0; i < a.length; i++) { var q = a[i]; if (q && x + r > q.x && x - r < q.x + q.w && y + r > q.y && y - r < q.y + q.h) return true; } return false; }
    function itemR() { return 8 * scaleOf() + 1; }
    function freeAt(x, y, r, b) {
      if (!isFinite(x) || !isFinite(y)) return false;
      b = b || boundsOf();
      if (b && (x - r < b.x || y - r < b.y || x + r > b.x + b.w || y + r > b.y + b.h)) return false;
      if (solidAt(x, y) || solidAt(x - r, y) || solidAt(x + r, y) || solidAt(x, y - r) || solidAt(x, y + r)) return false;
      var q = r * 0.7071; if (solidAt(x - q, y - q) || solidAt(x + q, y - q) || solidAt(x - q, y + q) || solidAt(x + q, y + q)) return false;
      return true;
    }
    function pathClear(ax, ay, bx, by) {
      var b = boundsOf(), t = num(val(o.tile, 0), 0), L = Math.hypot(bx - ax, by - ay);
      if (b && (Math.min(ax, bx) < b.x || Math.min(ay, by) < b.y || Math.max(ax, bx) > b.x + b.w || Math.max(ay, by) > b.y + b.h)) return false;
      if (t > 0) {   // exact: every tile the segment touches (grid traversal), tested at its centre
        var cx = Math.floor(ax / t), cy = Math.floor(ay / t), ex = Math.floor(bx / t), ey = Math.floor(by / t), dx = bx - ax, dy = by - ay;
        var sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, tdx = dx ? Math.abs(t / dx) : 1e9, tdy = dy ? Math.abs(t / dy) : 1e9;
        var tmx = dx ? ((sx > 0 ? (cx + 1) * t - ax : ax - cx * t) / Math.abs(dx)) : 1e9, tmy = dy ? ((sy > 0 ? (cy + 1) * t - ay : ay - cy * t) / Math.abs(dy)) : 1e9;
        for (var guard = 0; guard < 4096; guard++) {
          if (solidAt(cx * t + t / 2, cy * t + t / 2)) return false;
          if (cx === ex && cy === ey) return true;
          if (Math.abs(tmx - tmy) < 1e-9) {   // through a corner exactly: both neighbours must be open too
            if (solidAt((cx + sx) * t + t / 2, cy * t + t / 2) || solidAt(cx * t + t / 2, (cy + sy) * t + t / 2)) return false;
            cx += sx; cy += sy; tmx += tdx; tmy += tdy;
          } else if (tmx < tmy) { cx += sx; tmx += tdx; } else { cy += sy; tmy += tdy; }
          if (tmx > 1 + tdx && tmy > 1 + tdy) return !solidAt(ex * t + t / 2, ey * t + t / 2);
        }
        return false;
      }
      var n = Math.max(1, Math.ceil(L / 0.5)), px = L ? -(by - ay) / L * 0.6 : 0, py = L ? (bx - ax) / L * 0.6 : 0;
      for (var i = 0; i <= n; i++) { var x = lerp(ax, bx, i / n), y = lerp(ay, by, i / n); if (solidAt(x, y) || solidAt(x + px, y + py) || solidAt(x - px, y - py)) return false; }
      return true;
    }
    function playerAt() { var p = call(o.player, [], null); return p && isFinite(p.x) && isFinite(p.y) ? p : null; }

    /* ---------- spawning ---------- */
    function rarityOf(id) { return RIDX[id] || R[0]; }
    /* the beam lane of a beamed item (world px): no other item may rest inside it, so a common pile never reads as legendary */
    function laneAt(rar, x, y) {
      var bm = BEAM_MIN[P.beams] != null ? BEAM_MIN[P.beams] : 1; if (rar.i < bm || !(rar.beam > 0) || !(P.beamHeight > 0)) return null;
      var s = scaleOf(), half = (13 + 6 * rar.beam) * s * 0.55 + itemR(), H = (58 + 30 * rar.beam) * rar.beam * s * P.beamHeight;
      return { x0: x - half, x1: x + half, y0: y - H - itemR(), y1: y + itemR() };
    }
    function inLane(L, x, y) { return !!L && x > L.x0 && x < L.x1 && y > L.y0 && y < L.y1; }
    function laneBlocked(it, x, y) {
      var mine = laneAt(it.rar, x, y);
      for (var i = 0; i < items.length; i++) {
        var q = items[i]; if (q === it || q.state === 'gone' || q.state === 'magnet') continue;
        if (inLane(laneAt(q.rar, q.bx, q.by), x, y) || inLane(mine, q.bx, q.by)) return true;
      }
      return false;
    }
    function crowdedAt(x, y, sep, self) { for (var i = 0; i < items.length; i++) { var q = items[i]; if (q === self || q.state === 'gone' || q.state === 'magnet') continue; if (Math.hypot(q.bx - x, q.by - y) < sep) return true; } return false; }
    /* choose where an item lands: a free spot whose whole flight path (source -> landing -> bounce end) is clear */
    function nearestFree(sx, sy, ang) {
      var s = scaleOf(), r = itemR(), b = boundsOf();
      for (var rr = 2; rr <= 96 * s + 2; rr += 2) for (var k = 0; k < 16; k++) {
        var aa = ang + k * Math.PI / 8, qx = sx + Math.cos(aa) * rr, qy = sy + Math.sin(aa) * rr;
        if (freeAt(qx, qy, r, b)) return { x: qx, y: qy };
      }
      return null;
    }
    function plan(it, sx, sy, ang, dist) {
      var s = scaleOf(), r = itemR(), sep = 18 * s + 1, b = boundsOf(), bounceL = P.bounce > 0 ? Math.min(10 * s, dist * 0.22) * P.bounce : 0, moved = false;
      if (!freeAt(sx, sy, r, b)) {   // the source itself is blocked (a chest tile, a foe pressed into a wall): rise from the nearest free spot
        var q = nearestFree(sx, sy, ang); if (!q) return null;
        sx = q.x; sy = q.y; moved = true; ST.rescued++;
      }
      var tries = [[0, 1], [0.35, 1], [-0.35, 1], [0, 0.7], [0.7, 0.85], [-0.7, 0.85], [0, 1.25], [1.05, 0.8], [-1.05, 0.8], [0.35, 0.55], [-0.35, 0.55], [1.4, 0.75], [-1.4, 0.75],
        [1.75, 0.7], [-1.75, 0.7], [2.1, 0.7], [-2.1, 0.7], [2.5, 0.6], [-2.5, 0.6], [Math.PI, 0.6], [0, 0.35], [Math.PI / 2, 0.4], [-Math.PI / 2, 0.4], [Math.PI, 0.3],
        [0.5, 1.5], [-0.5, 1.5], [1.2, 1.4], [-1.2, 1.4], [0, 1.7], [1.57, 1.3], [-1.57, 1.3], [2.3, 1.2], [-2.3, 1.2], [0.9, 1.9], [-0.9, 1.9], [Math.PI, 1.2]];
      for (var wr = 1.4; wr <= 4.6; wr += 0.3) for (var wa = 0; wa < 16; wa++) tries.push([wa * Math.PI / 8 + wr, wr]);   // a wide ring search before giving up a lane
      for (var pass = 0; pass < 3; pass++) for (var i = 0; i < tries.length; i++) {
        var a = ang + tries[i][0], d = dist * tries[i][1], ca = Math.cos(a), sa = Math.sin(a);
        var tx = sx + ca * d, ty = sy + sa * d, ex = tx + ca * bounceL, ey = ty + sa * bounceL;
        if (!freeAt(tx, ty, r, b) || !freeAt(ex, ey, r, b) || keepOutAt(ex, ey, r) || occludedAt(ex, ey)) continue;
        if (pass === 0 && crowdedAt(ex, ey, sep, it)) continue;
        if (pass === 1 && crowdedAt(ex, ey, iconSize(viewOf(null)) * 0.75, it)) continue;   // a crowded field: icons may touch, not stack
        if (pass < 2 && laneBlocked(it, ex, ey)) continue;   // never inside another item's beam lane, nor a beam over another item
        if (!pathClear(sx, sy, ex, ey)) continue;
        if (i > 0 || pass > 0) ST.relocated++;
        if (pass === 2) ST.laneFallback++;
        return { tx: tx, ty: ty, bx: ex, by: ey, sx: moved ? sx : null, sy: moved ? sy : null };
      }
      ST.atSource++; return { tx: sx, ty: sy, bx: sx, by: sy, sx: moved ? sx : null, sy: moved ? sy : null };
    }
    function spawnOne(x, y, spec, ang, dist, opts) {
      var rar = rarityOf(spec.rarity), s = scaleOf();
      if (items.length >= P.cap) {   // the oldest resting common item makes room
        var old = -1; for (var j = 0; j < items.length; j++) if (items[j].state === 'rest' && items[j].rar.i === 0 && (old < 0 || items[j].born < items[old].born)) old = j;
        if (old < 0) for (j = 0; j < items.length; j++) if (items[j].state === 'rest' && (old < 0 || items[j].born < items[old].born)) old = j;
        if (old < 0) { ST.badInput++; return null; }
        items.splice(old, 1); ST.recycled++;
      }
      var it = { id: nextId++, item: spec.item, name: spec.name || nameOf(ITEMSD, spec.item, rar.id), rar: rar, count: spec.count || 1, data: spec.data != null ? spec.data : opts.data,
        icon: spec.icon || (ITEMSD[spec.item] && ITEMSD[spec.item].icon) || 'coins', kind: (ITEMSD[spec.item] && ITEMSD[spec.item].kind) || spec.kind || 'item',
        state: 'fly', t: 0, born: clock, x: x, y: y, z: num(opts.z, 10 * s), sx: x, sy: y, z0: num(opts.z, 10 * s), restT: 0, vel: 0, pickedAt: null,
        tag: { a: 0, ga: 0, gx: 0, gy: 0, ox: 0, oy: 0, tox: 0, toy: 0, shown: false, since: -1e9, slot: -1, w: 0, h: 0, fade: 0, ax: 0, ay: 0 }, ph: hash1(nextId, 77) * 6.283 };
      it.label = it.count > 1 ? it.count + ' ' + it.name : it.name;
      var pl = plan(it, x, y, ang, dist);
      if (!pl) { ST.badInput++; nextId--; return null; }
      if (pl.sx != null) { it.sx = it.x = pl.sx; it.sy = it.y = pl.sy; }
      it.tx = pl.tx; it.ty = pl.ty; it.bx = pl.bx; it.by = pl.by;
      var d1 = Math.hypot(it.tx - it.sx, it.ty - it.sy), d2 = Math.hypot(it.bx - it.tx, it.by - it.ty);
      it.T1 = clamp(300 + d1 / Math.max(0.3, s) * 3.6, 320, 900) / P.speed; it.H1 = (16 + d1 / Math.max(0.3, s) * 0.3) * s;
      it.T2 = d2 > 0.01 || P.bounce > 0 ? it.T1 * 0.3 * clamp(P.bounce, 0.4, 1.5) : 0; it.H2 = it.H1 * 0.24 * P.bounce;
      it.T3 = it.T2 ? it.T1 * 0.15 : 0; it.H3 = it.H1 * 0.07 * P.bounce;
      if (P.bounce <= 0) { it.T2 = it.T3 = 0; }
      items.push(it); ST.spawned++; ST.peak = Math.max(ST.peak, items.length);
      return it;
    }
    function drop(x, y, table, opts) {
      opts = opts || {}; ST.drops++;
      x = +x; y = +y; if (!isFinite(x) || !isFinite(y)) { ST.badInput++; return []; }
      var specs;
      if (Array.isArray(table)) specs = table.map(function (q) { return typeof q === 'string' ? { item: q, rarity: R[0].id } : q; });
      else if (table && typeof table === 'object' && table.item) specs = [table];
      else { var t = typeof table === 'string' ? TABS[table] : table; if (!t) { warn('tab', 'unknown drop table ' + table + '; using the first table'); for (var k in TABS) { t = TABS[k]; break; } } specs = rollTable(t, rnd, ITEMSD, R); }
      var out = [], n = specs.length, s = scaleOf(), base = opts.dx != null || opts.dy != null ? Math.atan2(num(opts.dy, 0), num(opts.dx, 0)) : rnd() * Math.PI * 2;
      var spread = opts.dx != null || opts.dy != null ? num(opts.spread, 1.6) : Math.PI * 2;
      for (var i = 0; i < n; i++) {
        var sp = specs[i]; if (!sp || !ITEMSD[sp.item] && !sp.name) { ST.badInput++; continue; }
        if (!RIDX[sp.rarity]) sp.rarity = R[0].id;
        var a = n === 1 ? base + (rnd() - 0.5) * Math.min(spread, 1.2) : base + (spread >= 6.2 ? (i / n) * Math.PI * 2 : (i / (n - 1) - 0.5) * spread) + (rnd() - 0.5) * 0.35;
        var d = (20 + rnd() * 22) * s * P.distance * num(opts.power, 1);
        var it = spawnOne(x, y, sp, a, d, opts); if (it) out.push(it);
      }
      return out.map(pub);
    }
    function pub(it) { return { id: it.id, item: it.item, name: it.name, label: it.label, rarity: it.rar.id, count: it.count, kind: it.kind, x: it.bx, y: it.by, data: it.data }; }

    /* ---------- stepping ---------- */
    function groundAt(it) {
      var t = it.t;
      if (t < it.T1) { var u = t / it.T1; return { x: lerp(it.sx, it.tx, u), y: lerp(it.sy, it.ty, u), z: Math.max(0, it.z0 * (1 - u) + 4 * it.H1 * u * (1 - u)) }; }
      t -= it.T1;
      if (it.T2 && t < it.T2) { var u2 = t / it.T2, fx2 = lerp(it.tx, it.bx, u2 * 0.75), fy2 = lerp(it.ty, it.by, u2 * 0.75); return { x: fx2, y: fy2, z: 4 * it.H2 * u2 * (1 - u2) }; }
      t -= it.T2 || 0;
      if (it.T3 && t < it.T3) { var u3 = t / it.T3; return { x: lerp(lerp(it.tx, it.bx, 0.75), it.bx, u3), y: lerp(lerp(it.ty, it.by, 0.75), it.by, u3), z: 4 * it.H3 * u3 * (1 - u3) }; }
      return null;
    }
    function land(it) {
      it.state = 'rest'; it.x = it.bx; it.y = it.by; it.z = 0; it.restT = clock; ST.landed++;
      fx.push({ k: 'dust', x: it.x, y: it.y, t: 0, life: 360, c: it.rar.rgb, id: it.id });
      if (it.rar.i >= 2) fx.push({ k: 'ring', x: it.x, y: it.y, t: 0, life: 520, c: it.rar.rgb, big: it.rar.burst });
      call(o.onLand, [pub(it)], null);
    }
    function pick(it, p) {
      if (it.pickedAt != null) return;   // exactly once
      it.pickedAt = clock; it.state = 'gone'; ST.picked++;
      fx.push({ k: 'flash', x: p ? p.x : it.x, y: p ? p.y : it.y, lift: p && p.h > 0 ? p.h * 0.45 : null, t: 0, life: 420, c: it.rar.rgb, rank: it.rar.i, burst: it.rar.burst, id: it.id });
      // three stacked lines over the head; a pop waits for the line that frees first (a burst of pickups queues, never overlaps)
      var end = [0, 0, 0], q, sl;
      for (q = 0; q < fx.length; q++) if (fx[q].k === 'pop') end[fx[q].slot] = Math.max(end[fx[q].slot], fx[q].life - fx[q].t);
      sl = end.indexOf(Math.min.apply(null, end));
      fx.push({ k: 'pop', x: p ? p.x : it.x, y: p ? p.y : it.y, head: p && p.h > 0 ? p.h : 16 * scaleOf(), t: -end[sl], life: 700, c: it.rar.rgb, slot: sl, label: '+' + (it.count > 1 ? it.count + ' ' : '') + it.name, common: it.rar.i === 0 });
      call(o.onPickup, [pub(it)], null);
    }
    function stepOnce() {
      clock += STEP; var s = scaleOf(), p = playerAt(), mag = P.magnet * s, pr = P.pick * s, i, it;
      for (i = 0; i < items.length; i++) {
        it = items[i];
        if (it.state === 'fly') {
          it.t += STEP; var g = groundAt(it);
          if (g) { it.x = g.x; it.y = g.y; it.z = g.z; } else land(it);
        } else if (it.state === 'rest') {
          if (P.life > 0 && clock - it.restT > P.life) { it.state = 'gone'; it.expired = true; ST.expired++; continue; }
          if (p && mag > 0 && it.kind !== 'manual' && clock - it.restT >= P.settle && Math.hypot(p.x - it.x, p.y - it.y) < mag && pathClear(it.x, it.y, p.x, p.y)) { it.state = 'magnet'; it.vel = 30 * s; it.z = 0; ST.magnets++; }
        } else if (it.state === 'magnet') {
          if (!p) { it.state = 'drop'; ST.cancels++; continue; }
          var dx = p.x - it.x, dy = p.y - it.y, d = Math.hypot(dx, dy);
          if (d <= pr) { pick(it, p); continue; }
          if (d > mag * 1.8 && !it.pull) { it.state = 'drop'; ST.cancels++; continue; }
          it.vel = Math.min(560 * s, it.vel + 1500 * s * STEP / 1000);
          var mv = Math.min(d, it.vel * STEP / 1000), nx = it.x + dx / d * mv, ny = it.y + dy / d * mv;
          if (!freeAt(nx, ny, 4 * s) || !pathClear(it.x, it.y, nx, ny)) { it.state = 'drop'; ST.cancels++; continue; }
          it.x = nx; it.y = ny; it.z = lerp(it.z, p.h > 0 ? p.h * 0.35 : 9 * s, 0.2);
          if (Math.hypot(p.x - it.x, p.y - it.y) <= pr) pick(it, p);
        } else if (it.state === 'drop') {   // fell out of the magnet: settle where it is (free ground) and rest again
          it.z = Math.max(0, it.z - 0.9 * s); it.vel = 0;
          if (it.z <= 0) { it.state = 'rest'; it.pull = false; it.restT = clock; it.bx = it.x; it.by = it.y; }
        }
      }
      var keep = [];
      for (i = 0; i < items.length; i++) { it = items[i]; if (it.state !== 'gone' || it.tag.a > 0.001 || it.tag.ga > 0.001) keep.push(it); }
      items = keep;
      var fk = []; for (i = 0; i < fx.length; i++) { fx[i].t += STEP; if (fx[i].t < fx[i].life) fk.push(fx[i]); } fx = fk;
      clipBeams();
      layoutTags();
    }
    function update(dt) {
      dt = +dt; ST.updates++;
      if (!(dt > 0)) { ST.frozen++; uiHide(); return; }   // the world is stopped; a window that just opened still hides the tags under it
      acc += Math.min(dt, 250);
      var n = 0; while (acc >= STEP - 1e-6 && n < 30) { acc -= STEP; stepOnce(); n++; }
    }

    /* ---------- name tags: laid out in update(), in the view's screen space ---------- */
    /* pickup lines ('+12 Gold') on screen, in the view space: hard obstacles for the tags (and tags under a new line hide at once) */
    function popRects(view, cam) {
      var out = [], s = scaleOf(), pix = pixelMode(view);
      for (var i = 0; i < fx.length; i++) {
        var f = fx[i]; if (f.k !== 'pop' || f.t < -2 * STEP) continue;
        var kp = Math.max(1, Math.round(s / 0.6)), w, h, base, riseMax, sx = view.x + f.x - cam.x, sy = view.y + f.y - cam.y;
        if (pix) { w = pixW(f.label) * kp + 2 * kp; h = 7 * kp; riseMax = 2 * kp; base = sy - f.head - 4 * kp - f.slot * 10 * kp; out.push({ x: Math.round(sx - w / 2) - kp, y: base - riseMax - kp, w: w + 2 * kp, h: h + riseMax + 2 * kp, pop: true }); }
        else {
          w = f.label.length * 11 * s * 0.6;
          if (!measure && typeof document !== 'undefined') { try { measure = document.createElement('canvas').getContext('2d'); } catch (e) { measure = null; } }
          if (measure) { measure.font = '800 ' + (11 * s).toFixed(1) + 'px system-ui, -apple-system, "Segoe UI", sans-serif'; w = measure.measureText(f.label).width; }
          h = 13 * s; riseMax = 4 * s; base = sy - f.head - 8 * s - f.slot * 19 * s; out.push({ x: sx - w / 2 - 3 * s, y: base - riseMax - h / 2 - 2 * s, w: w + 6 * s, h: h + riseMax + 4 * s, pop: true });
        }
      }
      return out;
    }
    function tagSize(it, view) {
      var k = uiK(view), pix = pixelMode(view);
      if (pix) { var tw = pixW(it.label); return { w: tw * k + 6 * k + 2 * k, h: 9 * k + 0 }; }
      var fs = 10.5 * k, w = it.label.length * fs * 0.56;
      if (!measure && typeof document !== 'undefined') { try { measure = document.createElement('canvas').getContext('2d'); } catch (e) { measure = null; } }
      if (measure) { measure.font = '700 ' + fs.toFixed(2) + 'px system-ui, -apple-system, "Segoe UI", sans-serif'; w = measure.measureText(it.label).width; }
      return { w: Math.ceil(w + 14 * k), h: Math.round(17 * k) };
    }
    function anchorScreen(it, view, cam) { return { x: view.x + it.tag.ax - cam.x, y: view.y + it.tag.ay - cam.y }; }
    function iconSize(view) { var pix = pixelMode(view); return pix ? 12 * Math.max(1, Math.round(scaleOf() / 0.6)) : Math.round(24 * scaleOf()); }
    function nearPt(r, px, py) { return { x: clamp(px, r.x, r.x + r.w), y: clamp(py, r.y, r.y + r.h) }; }
    function leaderOf(tag, an, ic) {   // from the tag's nearest edge to the icon's outline
      var icr = { x: an.x - ic / 2, y: an.y - ic * 1.05, w: ic, h: ic }, a = nearPt(tag, an.x, an.y - ic * 0.55), b = nearPt(icr, tag.x + tag.w / 2, tag.y + tag.h / 2);
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y, len: Math.hypot(a.x - b.x, a.y - b.y) };
    }
    function segHits(L, r) {
      var n = Math.max(2, Math.ceil(L.len / 2));
      for (var i = 1; i < n; i++) { var x = lerp(L.x0, L.x1, i / n), y = lerp(L.y0, L.y1, i / n); if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true; }
      return false;
    }
    var SLOTS = [[0, -1], [0, -2], [-1, -1], [1, -1], [0, -3], [-1, 0], [1, 0], [0, 1], [-1, -2], [1, -2], [0, 2]];
    function slotRect(it, k, an, view, ic) {
      var w = it.tag.w, h = it.tag.h, gap = 3 * uiK(view), sx = SLOTS[k][0], sy = SLOTS[k][1], top = an.y - ic - gap;
      var x = an.x - w / 2 + sx * (w / 2 + ic / 2 + gap * 2), y = sy < 0 ? top - h + (sy + 1) * (h + gap) : sy === 0 ? an.y - ic / 2 - h / 2 : an.y + gap + (sy - 1) * (h + gap);
      if (sx !== 0 && sy === -1) y = top - h * 0.5;
      return { x: Math.round(x), y: Math.round(y), w: w, h: h };
    }
    function layoutTags() {
      var view = viewOf(null); if (!view) return;
      var cam = camOf(), ui = val(o.uiRects, []) || [], min = TAG_MIN[P.tags] != null ? TAG_MIN[P.tags] : 0, k = uiK(view), ic = iconSize(view);
      var glide = 2.4 * k * (pixelMode(view) ? 1 : 1.6), pad = 2 * k, uiPad = 4 * k, placed = [], i, j, it;
      var uiR = []; for (i = 0; i < ui.length; i++) { var q = ui[i]; if (q && q.w > 0 && q.h > 0) uiR.push({ x: +q.x, y: +q.y, w: +q.w, h: +q.h }); }
      var list = [], soft = [], av = val(o.avoid, null) || [], pops = popRects(view, cam);
      for (i = 0; i < pops.length; i++) uiR.push(pops[i]);   // pickup lines block tags like HUD boxes
      for (i = 0; i < av.length; i++) { var q2 = av[i]; if (q2 && q2.w > 0 && q2.h > 0) uiR.push({ x: view.x + q2.x - cam.x, y: view.y + q2.y - cam.y, w: +q2.w, h: +q2.h, actor: true }); }   // characters: hard, like HUD boxes (a tag they walk into hides)
      for (i = 0; i < items.length; i++) { var q3 = items[i]; if (q3.state !== 'rest' && q3.state !== 'fly') continue; var qx = view.x + (q3.state === 'rest' ? q3.x : q3.bx) - cam.x, qy = view.y + (q3.state === 'rest' ? q3.y : q3.by) - cam.y;
        soft.push({ x: qx - ic / 2, y: qy - ic * 1.1, w: ic, h: ic * 1.1, k: 20, id: q3.id }); }
      for (i = 0; i < items.length; i++) {
        it = items[i]; var T = it.tag;
        var want = it.state === 'rest' && it.rar.i >= min && P.maxTags > 0 && clock - it.restT >= 160;
        if (it.state === 'rest') { T.ax = it.x; T.ay = it.y; }
        if (!T.w || T.lab !== it.label) { var sz = tagSize(it, view); T.w = sz.w; T.h = sz.h; T.lab = it.label; }
        T.want = want; list.push(it);
      }
      // every tag on screen now (fading, gliding or crossfade ghost) keeps its place until it is gone: an obstacle for the others
      for (i = 0; i < list.length; i++) {
        it = list[i]; var an0 = anchorScreen(it, view, cam);
        if (it.tag.a > 0) { var T0 = it.tag, x0 = an0.x + T0.ox, y0 = an0.y + T0.oy, x1 = an0.x + T0.tox, y1 = an0.y + T0.toy;
          placed.push(T0.shown ? { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0) + T0.w, h: Math.abs(y1 - y0) + T0.h, id: it.id } : { x: x0, y: y0, w: T0.w, h: T0.h, id: it.id }); }
        if (it.tag.ga > 0) placed.push({ x: an0.x + it.tag.gx, y: an0.y + it.tag.gy, w: it.tag.w, h: it.tag.h, id: it.id });
      }
      // priority: tags already shown, then rarity, then age
      var cand = list.filter(function (q) { return q.tag.want; });
      cand.sort(function (a, b) { return (b.tag.shown - a.tag.shown) || (b.rar.i - a.rar.i) || (a.born - b.born) || (a.id - b.id); });
      var shownN = 0;
      for (i = 0; i < cand.length; i++) {
        it = cand[i]; var T2 = it.tag, an = anchorScreen(it, view, cam);
        if (an.x < view.x + 2 || an.x > view.x + view.w - 2 || an.y < view.y + 4 || an.y > view.y + view.h) { hideTag(it, false); continue; }   // only items on screen get a tag
        if (!T2.shown && clock - T2.since < 1100 && T2.since > 0) continue;   // minimum hidden time after a hide (fade-out + 900 ms)
        var best = -1, bestCost = 1e9, br = null;
        if (shownN < P.maxTags) for (j = 0; j < SLOTS.length; j++) {
          var r = slotRect(it, j, an, view, ic);
          if (!inside(r, view)) continue;
          var bad = false, u;
          for (u = 0; u < placed.length && !bad; u++) if (placed[u].id !== it.id && hit(r, placed[u], pad)) bad = true;
          for (u = 0; u < uiR.length && !bad; u++) if (hit(r, uiR[u], uiPad)) bad = true;
          for (u = 0; u < soft.length && !bad; u++) if (soft[u].id != null && soft[u].id !== it.id && hit(r, soft[u], 1)) bad = true;   // never over another item's icon
          if (bad) continue;
          var cost = j + (T2.shown && j === T2.slot ? -4 : 0);
          var lead = j > 0 ? leaderOf(r, an, ic) : null;
          for (u = 0; u < soft.length; u++) if (soft[u].id !== it.id) { if (hit(r, soft[u], soft[u].k > 20 ? 2 * k : 1)) cost += soft[u].k; if (lead && segHits(lead, soft[u])) cost += soft[u].k * 0.8; }
          if (cost < bestCost) { bestCost = cost; best = j; br = r; }
        }
        if (best < 0) { if (T2.shown) { hideTag(it, true); ST.crowded++; } continue; }
        var tox = br.x - an.x, toy = br.y - an.y;
        if (!T2.shown) {
          T2.shown = true; T2.since = clock; T2.slot = best; T2.ox = T2.tox = tox; T2.oy = T2.toy = toy; ST.tagsShown++;
        } else if (best !== T2.slot) {
          var far = Math.hypot(tox - T2.ox, toy - T2.oy) > 30 * k, sweep = { x: Math.min(an.x + T2.ox, br.x), y: Math.min(an.y + T2.oy, br.y), w: 0, h: 0 }, clear = true;
          sweep.w = Math.max(an.x + T2.ox, br.x) + T2.w - sweep.x; sweep.h = Math.max(an.y + T2.oy, br.y) + T2.h - sweep.y;
          for (u = 0; u < placed.length && clear; u++) if (placed[u].id !== it.id && hit(sweep, placed[u], 1)) clear = false;
          for (u = 0; u < uiR.length && clear; u++) if (hit(sweep, uiR[u], 1)) clear = false;
          T2.slot = best; T2.tox = tox; T2.toy = toy;
          if (far || !clear) crossfade(T2, tox, toy);
        } else { T2.tox = tox; T2.toy = toy; }
        br.id = it.id; placed.push(br); shownN++;
        if (Math.hypot(T2.tox - T2.ox, T2.toy - T2.oy) > 0.5) {   // still gliding: the whole way stays reserved
          var cx0 = an.x + T2.ox, cy0 = an.y + T2.oy; placed.push({ x: Math.min(cx0, br.x), y: Math.min(cy0, br.y), w: Math.abs(cx0 - br.x) + T2.w, h: Math.abs(cy0 - br.y) + T2.h, id: it.id });
        }
      }
      // move and fade
      for (i = 0; i < list.length; i++) {
        it = list[i]; var T3 = it.tag;
        if (T3.want && T3.shown) {
          var ddx = T3.tox - T3.ox, ddy = T3.toy - T3.oy, dd = Math.hypot(ddx, ddy);
          if (dd > 0) { var mvv = Math.min(dd, Math.max(glide * 0.35, dd * 0.3)); mvv = Math.min(mvv, glide); T3.ox += ddx / dd * mvv; T3.oy += ddy / dd * mvv; }
          T3.a = Math.min(1, T3.a + STEP / 140);
        } else {
          if (T3.shown && !T3.want) hideTag(it, false);
          T3.a = Math.max(0, T3.a - STEP / (it.state === 'rest' || it.state === 'fly' ? 130 : 34));   // picked up: gone within 2 frames
        }
        if (T3.ga > 0) T3.ga = it.state === 'rest' ? Math.max(0, T3.ga - STEP / 130) : 0;
      }
      // a tag that ends up on a HUD rect (a window just opened over it) is hidden at once
      var an2, rr;
      for (i = 0; i < list.length; i++) {
        it = list[i]; an2 = anchorScreen(it, view, cam);
        if (it.tag.ga > 0) { var gr0 = { x: an2.x + it.tag.gx, y: an2.y + it.tag.gy, w: it.tag.w, h: it.tag.h }; for (j = 0; j < uiR.length; j++) if (hit(gr0, uiR[j], 0)) it.tag.ga = 0; }
        if (it.tag.a <= 0) continue; rr = { x: an2.x + it.tag.ox, y: an2.y + it.tag.oy, w: it.tag.w, h: it.tag.h };
        var onUi = false; for (j = 0; j < uiR.length; j++) if (hit(rr, uiR[j], 0)) onUi = true;
        for (j = 0; j < soft.length && !onUi; j++) if (soft[j].id != null && soft[j].id !== it.id && hit(rr, { x: soft[j].x + 1, y: soft[j].y + 1, w: soft[j].w - 2, h: soft[j].h - 2 }, 0)) onUi = true;
        if (onUi) { it.tag.a = 0; it.tag.ga = 0; hideTag(it, true); continue; }
        if (!inside(rr, view)) {   // the view edge reached a tag: crossfade to its slot if it has one inside, else it is gone with the scroll
          if (it.tag.want && it.tag.shown && Math.hypot(it.tag.tox - it.tag.ox, it.tag.toy - it.tag.oy) > 0.5 && inside({ x: an2.x + it.tag.tox, y: an2.y + it.tag.toy, w: it.tag.w, h: it.tag.h }, view)) crossfade(it.tag, it.tag.tox, it.tag.toy);
          else { it.tag.a = 0; hideTag(it, true); }
        }
        if (it.tag.ga > 0) { var gr2 = { x: an2.x + it.tag.gx, y: an2.y + it.tag.gy, w: it.tag.w, h: it.tag.h }; for (j = 0; j < uiR.length; j++) if (hit(gr2, uiR[j], 0)) it.tag.ga = 0; }
      }
    }
    function uiHide() {
      var view = viewOf(null); if (!view) return;
      var cam = camOf(), ui = val(o.uiRects, []) || [], i, j;
      for (i = 0; i < items.length; i++) {
        var it = items[i], T = it.tag; if (T.a <= 0 && T.ga <= 0) continue;
        var an = anchorScreen(it, view, cam), r1 = { x: an.x + T.ox, y: an.y + T.oy, w: T.w, h: T.h }, r2 = { x: an.x + T.gx, y: an.y + T.gy, w: T.w, h: T.h };
        for (j = 0; j < ui.length; j++) { var u = ui[j]; if (!u || !(u.w > 0) || !(u.h > 0)) continue;
          if (T.ga > 0 && hit(r2, u, 0)) T.ga = 0;
          if (T.a > 0 && hit(r1, u, 0)) { T.a = 0; hideTag(it, true); } }
      }
    }
    /* a crowded field: a beam stops just below the feet of any resting item inside its lane, so no item ever stands in another's beam */
    function clipBeams() {
      for (var i = 0; i < items.length; i++) {
        var it = items[i]; it.beamTop = null; if (it.state !== 'rest') continue;
        var L = laneAt(it.rar, it.x, it.y); if (!L) continue; var top = L.y0 + itemR();
        for (var j = 0; j < items.length; j++) { var q = items[j]; if (q === it || q.state !== 'rest') continue;
          if (q.x > L.x0 && q.x < L.x1 && q.y < it.y + 0.5 && q.y > top - 1) top = Math.max(top, q.y + 2); }
        it.beamTop = Math.min(top, it.y);
      }
    }
    function crossfade(T, tox, toy) { T.gx = T.ox; T.gy = T.oy; T.ga = T.a; T.ox = T.tox = tox; T.oy = T.toy = toy; T.a = 0; ST.crossfades++; }
    function hideTag(it, crowd) { var T = it.tag; if (T.shown) { T.shown = false; T.since = clock; T.slot = -1; } }

    /* ---------- drawing ---------- */
    function icon(key, n, pixel) {
      var ck = key + '|' + n + '|' + (pixel ? 1 : 0); if (iconCache[ck]) return iconCache[ck];
      if (iconN > 200) { iconCache = {}; iconN = 0; }
      var c = renderIcon(key, n, pixel); iconCache[ck] = c; iconN++; return c;
    }
    function atlasDraw(g, key, x, y, size) {
      var A = o.icons; if (!A || !A.image || !A.keys) return false;
      var im = A.image; if (!(im.naturalWidth || im.width) || im.complete === false) return false;
      var ix = A.keys.indexOf(key); if (ix < 0 && A.map && A.map[key]) ix = A.keys.indexOf(A.map[key]); if (ix < 0) return false;
      var cell = num(A.cell, 128), cols = Math.max(1, Math.floor((im.naturalWidth || im.width) / cell)), cx = (ix % cols) * cell, cy = Math.floor(ix / cols) * cell;
      g.drawImage(im, cx, cy, cell, cell, x - size / 2, y - size / 2, size, size); return true;
    }
    function devScale(g) { try { var m = g.getTransform(); return Math.hypot(m.a, m.b) || 1; } catch (e) { return 1; } }
    function drawItemIcon(g, it, x, y, size, pix, glowA, squash) {
      var rc = it.rar.rgb, ds = devScale(g);
      if (pix) {
        var n = 12, k = Math.max(1, Math.round(size / 12)), im = icon(it.icon, n, true); if (!im) return;
        var X = Math.round(x - n * k / 2), Y = Math.round(y - n * k / 2);
        if (glowA > 0 && it.rar.glow > 0) {
          var ck = 'sil|' + it.icon + '|' + it.rar.id; var sil = iconCache[ck] || (iconCache[ck] = silhouette(im, it.rar.color));
          g.globalAlpha = glowA; g.drawImage(sil, X - k, Y, n * k, n * k); g.drawImage(sil, X + k, Y, n * k, n * k); g.drawImage(sil, X, Y - k, n * k, n * k); g.drawImage(sil, X, Y + k, n * k, n * k); g.globalAlpha = 1;
        }
        if (squash && squash < 0.98) { var w2 = Math.max(2, Math.round(n * k * squash / 2) * 2); g.drawImage(im, Math.round(x - w2 / 2), Y, w2, n * k); }
        else g.drawImage(im, X, Y, n * k, n * k);
        return;
      }
      g.save();
      if (glowA > 0 && it.rar.glow > 0) { g.shadowColor = rgba(rc, Math.min(1, glowA * 1.1)); g.shadowBlur = 7 * ds * size / 20; }
      g.translate(x, y); if (squash && squash < 0.98) g.scale(squash, 1);
      if (!atlasDraw(g, it.icon, 0, 0, size * 1.08)) { var px = Math.max(8, Math.round(size * ds)), im2 = icon(it.icon, px, false); if (im2) g.drawImage(im2, -size / 2, -size / 2, size, size); }
      g.restore();
    }
    function beamOn(it) { var bm = BEAM_MIN[P.beams] != null ? BEAM_MIN[P.beams] : 1; return it.rar.i >= bm && it.rar.beam > 0 && P.beamHeight > 0; }
    function drawBeam(g, it, x, y, pix, s) {
      var grow = smooth((clock - it.restT) / 280), c = it.rar.rgb, pulse = 0.86 + 0.14 * Math.sin(clock / 420 + it.ph), H = Math.min((58 + 30 * it.rar.beam) * it.rar.beam * s * P.beamHeight, it.beamTop != null ? it.y - it.beamTop : 1e9) * grow;
      var lite = mix(c, [255, 255, 255], 0.55);
      if (pix) {
        var k = Math.max(1, Math.round(s / 0.6)), X = Math.round(x), Y = Math.round(y - 2 * k), hh = Math.round(H), band = Math.max(1, Math.round(hh / 5));
        for (var b = 0; b < 5; b++) {
          var y1 = Y - (b + 1) * band, a = pulse * (1 - b / 5);
          g.fillStyle = rgba(c, 0.22 * a); g.fillRect(X - 3 * k, y1, 7 * k, band);
          g.fillStyle = rgba(c, 0.42 * a); g.fillRect(X - 2 * k, y1, 5 * k, band);
          g.fillStyle = rgba(lite, 0.85 * a); g.fillRect(X - k, y1, 3 * k, band);
          g.fillStyle = rgba([255, 255, 255], 0.75 * a); g.fillRect(X, y1, k, band);
        }
        for (var m = 0; m < 3; m++) {   // motes rising in the beam
          var u = ((clock / 900 + it.ph + m / 3) % 1), mx = X + Math.round(Math.sin(it.ph * 3 + m * 2.1 + u * 4) * 2) * k, my = Math.round(Y - u * hh);
          g.fillStyle = rgba(lite, (1 - u) * 0.9); g.fillRect(mx, my, k, k);
        }
        // ground ring (pixel ellipse)
        g.fillStyle = rgba(c, 0.55 * pulse); var rw = 7 * k, rh = 3 * k;
        for (var q = 0; q < 16; q++) { var aa = q / 16 * Math.PI * 2; g.fillRect(Math.round(x + Math.cos(aa) * rw), Math.round(y + Math.sin(aa) * rh), k, k); }
        return;
      }
      var w = (13 + 6 * it.rar.beam) * s, tex = beamTex(it.rar);
      g.save();
      var gr = g.createRadialGradient(x, y, 0, x, y, 22 * s); gr.addColorStop(0, rgba(lite, 0.75 * pulse * grow)); gr.addColorStop(0.45, rgba(c, 0.32 * pulse * grow)); gr.addColorStop(1, rgba(c, 0));
      g.translate(x, y); g.scale(1, 0.4); g.translate(-x, -y); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 22 * s, 0, Math.PI * 2); g.fill();
      g.restore();
      if (tex && H > 1) {
        g.save(); g.globalAlpha = 0.32 * pulse; g.drawImage(tex, x - w, y - H, w * 2, H + 2 * s);   // tint (reads on bright ground)
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.62 * pulse; g.drawImage(tex, x - w, y - H, w * 2, H + 2 * s);   // glow
        g.globalAlpha = 0.45 * pulse; g.drawImage(tex, x - w * 0.4, y - H * 0.85, w * 0.8, H * 0.85 + 2 * s);
        g.restore();
      }
      g.save();
      for (var mm = 0; mm < 5; mm++) {
        var uu = ((clock / 1150 + it.ph + mm / 5) % 1), mx2 = x + Math.sin(it.ph * 3 + mm * 2.1 + uu * 5) * w * 0.38, my2 = y - uu * H * 0.92;
        g.fillStyle = rgba(lite, (1 - uu) * 0.9 * grow); g.beginPath(); g.arc(mx2, my2, (0.9 + (1 - uu) * 1.1) * s, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }
    /* a beam texture per rarity: soft white core, colour body, fading up; drawn with 'screen' */
    var beamCache = {};
    function beamTex(r) {
      if (beamCache[r.id]) return beamCache[r.id]; if (typeof document === 'undefined') return null;
      var Wt = 48, Ht = 160, c = document.createElement('canvas'); c.width = Wt; c.height = Ht;
      var g = c.getContext('2d'), img = g.createImageData(Wt, Ht), d = img.data, lite = mix(r.rgb, [255, 255, 255], 0.65);
      for (var y = 0; y < Ht; y++) {
        var v = 1 - y / (Ht - 1), fade = Math.pow(1 - v, 1.25) * (v < 0.04 ? 0.6 + v * 10 : 1), base = v < 0.25 ? 1 + (0.25 - v) * 1.6 : 1;
        for (var x = 0; x < Wt; x++) {
          var dx = Math.abs((x + 0.5) / Wt - 0.5) * 2, wv = 1 - v * 0.45, core = Math.exp(-Math.pow(dx / (0.14 * wv), 2)), body = Math.exp(-Math.pow(dx / (0.46 * wv), 2)) * 0.8, halo = Math.exp(-Math.pow(dx / 0.9, 2)) * 0.32 * sqr(1 - dx * dx);
          var a = clamp((core * 0.95 + body * (1 - dx * dx) + halo) * fade * base, 0, 1), k2 = clamp(core * 1.1, 0, 1), col = mix(r.rgb, lite, k2), i = (y * Wt + x) * 4;
          d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = Math.round(a * 255);
        }
      }
      g.putImageData(img, 0, 0); beamCache[r.id] = c; return c;
    }
    function drawShadow(g, x, y, z, s, pix) {
      var k = 1 / (1 + z / (16 * s)), rx = 6 * s * k + 1, ry = 2.4 * s * k + 0.5;
      if (pix) { var X = Math.round(x), Y = Math.round(y), w = Math.max(2, Math.round(rx * 2)); g.fillStyle = 'rgba(16,10,30,' + (0.35 * k).toFixed(3) + ')'; g.fillRect(X - (w >> 1), Y, w, 1); g.fillRect(X - (w >> 1) + 1, Y - 1, w - 2, 1); return; }
      g.fillStyle = 'rgba(16,10,30,' + (0.32 * k).toFixed(3) + ')'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
    }
    function drawFx(g, f, ox, oy, pix, s) {
      var u = f.t / f.life, x = f.x - ox, y = f.y - oy, c = f.c, i;
      if (f.k === 'dust') {
        for (i = 0; i < 6; i++) { var a = i / 6 * Math.PI * 2 + 0.4, r = (3 + u * 9) * s, px2 = x + Math.cos(a) * r, py2 = y + Math.sin(a) * r * 0.45 - u * 2 * s;
          g.fillStyle = 'rgba(232,220,196,' + (0.55 * (1 - u)).toFixed(3) + ')';
          if (pix) g.fillRect(Math.round(px2), Math.round(py2), 1, 1); else { g.beginPath(); g.arc(px2, py2, (1.4 - u * 0.8) * s, 0, Math.PI * 2); g.fill(); } }
      } else if (f.k === 'ring') {
        var rr = (4 + u * (f.big ? 26 : 16)) * s, al = (1 - u) * 0.8;
        if (pix) { g.fillStyle = rgba(c, al); for (i = 0; i < 20; i++) { var aa = i / 20 * Math.PI * 2; g.fillRect(Math.round(x + Math.cos(aa) * rr), Math.round(y + Math.sin(aa) * rr * 0.45), 1, 1); } }
        else { g.strokeStyle = rgba(mix(c, [255, 255, 255], 0.4), al); g.lineWidth = 2 * s * (1 - u) + 0.5; g.beginPath(); g.ellipse(x, y, rr, rr * 0.45, 0, 0, Math.PI * 2); g.stroke(); }
      } else if (f.k === 'flash') {   // the burst at the player, in the rarity colour (white only at the tiny centre)
        var lift = f.lift != null ? f.lift : 10 * s, cy = y - lift, al2 = 1 - smooth(u), lite = mix(c, [255, 255, 255], 0.35), n = 8 + f.rank * 2, big = 1 + f.rank * 0.18;
        if (pix) {
          var kk = Math.max(1, Math.round(s / 0.6)), rr2 = Math.round((3 + u * 9) * big) * kk;   // >= 10 native px wide ring
          g.fillStyle = rgba(c, al2); for (i = 0; i < 16; i++) { var a2 = i / 16 * Math.PI * 2; g.fillRect(Math.round(x + Math.cos(a2) * rr2), Math.round(cy + Math.sin(a2) * rr2 * 0.8), kk, kk); }
          g.fillStyle = rgba(lite, al2); for (i = 0; i < n; i++) { var a4 = i / n * Math.PI * 2 + 0.3, r4 = Math.round(rr2 * 0.55); g.fillRect(Math.round(x + Math.cos(a4) * r4), Math.round(cy + Math.sin(a4) * r4 * 0.8), kk, kk); }
          if (u < 0.3) { g.fillStyle = rgba([255, 255, 255], 1 - u / 0.3); g.fillRect(Math.round(x) - kk, Math.round(cy), 3 * kk, kk); g.fillRect(Math.round(x), Math.round(cy) - kk, kk, 3 * kk); }
          return;
        }
        g.save();
        var R0 = (9 + 12 * u) * s * big, gr = g.createRadialGradient(x, cy, 0, x, cy, R0); gr.addColorStop(0, rgba([255, 255, 255], 0.85 * al2)); gr.addColorStop(0.18, rgba(lite, 0.75 * al2)); gr.addColorStop(0.6, rgba(c, 0.4 * al2)); gr.addColorStop(1, rgba(c, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(x, cy, R0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = rgba(c, al2); g.lineWidth = 2 * s; g.beginPath(); g.ellipse(x, cy, R0 * 1.05, R0 * 0.8, 0, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = rgba(lite, al2); g.lineWidth = 1.8 * s; g.lineCap = 'round';
        for (i = 0; i < n; i++) { var a3 = i / n * Math.PI * 2 + 0.3, r0 = (5 + u * 13) * s * big, r1 = r0 + (6 * (1 - u) + 1.5) * s; g.beginPath(); g.moveTo(x + Math.cos(a3) * r0, cy + Math.sin(a3) * r0); g.lineTo(x + Math.cos(a3) * r1, cy + Math.sin(a3) * r1); g.stroke(); }
        if (f.burst) for (i = 0; i < 10; i++) { var a5 = i * 2.4 + 0.5, r5 = (6 + u * 26 * (0.6 + (i % 3) * 0.2)) * s; g.fillStyle = rgba(mix(c, [255, 240, 180], 0.4), al2); g.beginPath(); g.arc(x + Math.cos(a5) * r5, cy + Math.sin(a5) * r5 - u * 8 * s, (1.8 - u) * s, 0, Math.PI * 2); g.fill(); }
        g.restore();
      } else if (f.k === 'pop') {   // '+12 Gold' rising over the player's head in the rarity colour
        if (f.t < 0) return;
        var kp = Math.max(1, Math.round(s / 0.6)), rise = smooth(Math.min(1, u * 2.2)) * (pix ? 2 * kp : 4 * s), al3 = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25, py = y - f.head - (pix ? 4 * kp : 8 * s) - rise - f.slot * (pix ? 10 * kp : 19 * s);
        var col = f.common ? [255, 236, 170] : mix(c, [255, 255, 255], 0.2);
        if (pix) {
          var k3 = Math.max(1, Math.round(s / 0.6)), tw = pixW(f.label) * k3, X3 = Math.round(x - tw / 2), Y3 = Math.round(py);
          g.globalAlpha = al3; pixText(g, f.label, X3 + k3, Y3 + k3, k3, '#140c1e'); pixText(g, f.label, X3, Y3, k3, rgba(col, 1)); g.globalAlpha = 1;
          return;
        }
        g.save(); g.globalAlpha = al3; g.font = '800 ' + (11 * s).toFixed(1) + 'px system-ui, -apple-system, "Segoe UI", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineJoin = 'round'; g.lineWidth = 3 * s; g.strokeStyle = 'rgba(16,10,24,0.85)'; g.strokeText(f.label, x, py); g.fillStyle = rgba(col, 1); g.fillText(f.label, x, py); g.restore();
      }
    }
    function camArgs(camX, camY) { if (camX == null || camY == null) { var c = camOf(); return [c.x, c.y]; } return [+camX || 0, +camY || 0]; }
    function drawGround(ctx, camX, camY) { ST.groundDraws++; groundTok = ST.draws; paintGround(ctx, camX, camY); }
    function paintGround(ctx, camX, camY) {
      try {
        var g = ctx, cm = camArgs(camX, camY), view = viewOf(ctx), pix = pixelMode(view), s = scaleOf(), size = iconSize(view), i, it;
        g.save(); if (pix) g.imageSmoothingEnabled = false;
        for (i = 0; i < items.length; i++) { it = items[i]; if (it.state === 'gone') continue; drawShadow(g, it.x - cm[0], it.y - cm[1], it.z, s, pix); }
        for (i = 0; i < items.length; i++) { it = items[i]; if (it.state === 'rest' && beamOn(it)) drawBeam(g, it, it.x - cm[0], it.y - cm[1], pix, s); }
        for (i = 0; i < fx.length; i++) if (fx[i].k !== 'flash' && fx[i].k !== 'pop') drawFx(g, fx[i], cm[0], cm[1], pix, s);
        for (i = 0; i < items.length; i++) {
          it = items[i]; if (it.state !== 'rest') continue;
          var bob = (Math.sin(clock / 380 + it.ph) * 0.5 + 0.5) * 2 * s, glowA = it.rar.glow * (0.75 + 0.25 * Math.sin(clock / 300 + it.ph));
          drawItemIcon(g, it, it.x - cm[0], it.y - cm[1] - size / 2 - (pix ? Math.round(bob / Math.max(1, s * 1.6)) : bob) - 1, size, pix, glowA, 0);
          if (it.rar.i === 0 && P.sparkle > 0) {   // common items: a small glint now and then
            var gu = ((clock / 2400 + it.ph) % 1); if (gu < 0.12) { var gx = it.x - cm[0] + size * 0.25, gy = it.y - cm[1] - size * 0.8, ga = Math.sin(gu / 0.12 * Math.PI);
              g.fillStyle = 'rgba(255,255,240,' + ga.toFixed(3) + ')'; if (pix) { g.fillRect(Math.round(gx), Math.round(gy) - 1, 1, 3); g.fillRect(Math.round(gx) - 1, Math.round(gy), 3, 1); } else { g.beginPath(); g.arc(gx, gy, 1.6 * s * ga, 0, Math.PI * 2); g.fill(); } }
          }
        }
        g.restore();
      } catch (e) { ST.drawErrors++; warn('dg', 'drawGround failed: ' + (e && e.message)); try { ctx.restore(); } catch (e2) { } }
    }
    function draw(ctx, camX, camY) {
      if (groundTok !== ST.draws) { ST.groundInDraw++; paintGround(ctx, camX, camY); }
      ST.draws++;
      try {
        var g = ctx, cm = camArgs(camX, camY), view = viewOf(ctx), pix = pixelMode(view), s = scaleOf(), size = iconSize(view), i, it;
        g.save(); if (pix) g.imageSmoothingEnabled = false;
        for (i = 0; i < items.length; i++) {
          it = items[i]; if (it.state !== 'fly' && it.state !== 'magnet' && it.state !== 'drop') continue;
          var sq = it.state === 'fly' ? 0.45 + 0.55 * Math.abs(Math.cos(it.t / 90 + it.ph)) : 1;
          if (it.state === 'fly' && it.rar.i >= 2 && !pix) {   // a short sparkle trail behind rare+ items
            for (var tr = 1; tr <= 3; tr++) { var tt = Math.max(0, it.t - tr * 34); var o2 = groundAtT(it, tt); if (!o2) continue; g.fillStyle = rgba(mix(it.rar.rgb, [255, 255, 255], 0.5), 0.5 - tr * 0.13); g.beginPath(); g.arc(o2.x - cm[0], o2.y - o2.z - cm[1] - size / 2, (2 - tr * 0.4) * s, 0, Math.PI * 2); g.fill(); }
          }
          drawItemIcon(g, it, it.x - cm[0], it.y - it.z - cm[1] - size / 2, size, pix, it.rar.glow * 0.7, sq);
        }
        for (i = 0; i < fx.length; i++) if (fx[i].k === 'flash' || fx[i].k === 'pop') drawFx(g, fx[i], cm[0], cm[1], pix, s);
        g.restore();
      } catch (e) { ST.drawErrors++; warn('d', 'draw failed: ' + (e && e.message)); try { ctx.restore(); } catch (e2) { } }
    }
    function groundAtT(it, t) { var keep = it.t; it.t = t; var r = groundAt(it); it.t = keep; return r; }
    function paintTag(g, it, an, x, y, a, view, pix, k, pass) {
      var T = it.tag, w = T.w, h = T.h, c = it.rar.rgb;
      if (pix) { x = Math.round(x); y = Math.round(y); }
      g.globalAlpha = a;
      var ic = iconSize(view), slot0 = slotRect(it, 0, an, view, ic);
      if (pass === 0) {
      var L = leaderOf({ x: x, y: y, w: w, h: h }, an, ic);
      if (Math.hypot(x - slot0.x, y - slot0.y) > 1.5 * k && L.len > 1) {   // every moved tag: a leader from its edge to the icon's outline (lines first, then plates)
        if (pix) { var x0 = Math.round(L.x0), y0 = Math.round(L.y0), x1 = Math.round(L.x1), y1 = Math.round(L.y1), n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0)); g.fillStyle = rgba(c, 0.95); for (var st = 0; st <= n; st += k) g.fillRect(Math.round(lerp(x0, x1, st / n)), Math.round(lerp(y0, y1, st / n)), k, k); }
        else { g.strokeStyle = rgba(c, 0.85); g.lineWidth = 1.3 * k; g.beginPath(); g.moveTo(L.x0, L.y0); g.lineTo(L.x1, L.y1); g.stroke(); g.fillStyle = rgba(c, 0.95); g.beginPath(); g.arc(L.x1, L.y1, 1.6 * k, 0, Math.PI * 2); g.fill(); }
      }
      g.globalAlpha = 1; return null;
      }
      if (pix) {
        g.fillStyle = '#140c1e'; g.fillRect(x + k, y, w - 2 * k, h); g.fillRect(x, y + k, w, h - 2 * k);
        g.fillStyle = '#2a1f3a'; g.fillRect(x + k, y + k, w - 2 * k, h - 2 * k);
        g.fillStyle = rgba(c, 1); g.fillRect(x + k, y + k, 2 * k, h - 2 * k);
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 3 * k, y + k, w - 4 * k, k);
        pixText(g, it.label, x + 4 * k, y + 2 * k, k, rgba(it.rar.i === 0 ? [236, 230, 216] : mix(c, [255, 255, 255], 0.25), 1));
      } else {
        var rr = 4 * k;
        g.fillStyle = 'rgba(14,10,22,0.86)'; g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, rr); else g.rect(x, y, w, h); g.fill();
        g.strokeStyle = rgba(c, 0.75); g.lineWidth = 1.1 * k; g.beginPath(); if (g.roundRect) g.roundRect(x + 0.5 * k, y + 0.5 * k, w - k, h - k, rr); else g.rect(x, y, w, h); g.stroke();
        g.fillStyle = rgba(c, 1); g.beginPath(); g.arc(x + 6.5 * k, y + h / 2, 2.3 * k, 0, Math.PI * 2); g.fill();
        var fs = 10.5 * k; g.font = '700 ' + fs.toFixed(2) + 'px system-ui, -apple-system, "Segoe UI", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(it.label, x + 11 * k, y + h / 2 + 1 * k);
        g.fillStyle = rgba(it.rar.i === 0 ? [240, 234, 222] : mix(c, [255, 255, 255], 0.3), 1); g.fillText(it.label, x + 11 * k, y + h / 2);
      }
      g.globalAlpha = 1;
      return { id: it.id, x: x, y: y, w: w, h: h, a: a, rarity: it.rar.id, label: it.label, ax: an.x, ay: an.y };
    }
    function drawTags(ctx) {
      ST.tagDraws++; tagsOut = [];
      try {
        var g = ctx, view = viewOf(ctx); if (!view) return;
        var cam = camOf(), pix = pixelMode(view), k = uiK(view), i, it;
        g.save(); if (pix) g.imageSmoothingEnabled = false;
        g.beginPath(); g.rect(view.x, view.y, view.w, view.h); g.clip();
        for (var pass = 0; pass < 2; pass++) for (i = 0; i < items.length; i++) {
          it = items[i]; var T = it.tag, an = anchorScreen(it, view, cam);
          if (T.ga > 0.01) { var gq = paintTag(g, it, an, an.x + T.gx, an.y + T.gy, smooth(T.ga), view, pix, k, pass); if (gq) { gq.ghost = true; tagsOut.push(gq); } }
          if (T.a > 0.01) { var mq = paintTag(g, it, an, an.x + T.ox, an.y + T.oy, smooth(T.a), view, pix, k, pass); if (mq) tagsOut.push(mq); }
        }
        g.restore();
      } catch (e) { ST.drawErrors++; warn('dt', 'drawTags failed: ' + (e && e.message)); try { ctx.restore(); } catch (e2) { } }
    }

    /* ---------- the rest of the API ---------- */
    function spawn(x, y, spec, opts) { if (!spec) return []; return drop(x, y, Array.isArray(spec) ? spec : [spec], opts); }
    function collect(opts) {   // pull everything resting within `radius` (default: all) to the player, ignoring the magnet range
      opts = opts || {}; var p = playerAt(), n = 0, s = scaleOf(), rad = num(opts.radius, 1e9);
      if (!p) return 0;
      for (var i = 0; i < items.length; i++) { var it = items[i]; if (it.state !== 'rest' || Math.hypot(p.x - it.x, p.y - it.y) > rad || !pathClear(it.x, it.y, p.x, p.y)) continue; it.state = 'magnet'; it.pull = true; it.vel = 60 * s; ST.magnets++; n++; }
      return n;
    }
    function pickNear(x, y, r) {   // manual pickup ('manual' kind or a key press): the nearest resting item within r
      var best = null, bd = num(r, P.pick * scaleOf() * 2);
      for (var i = 0; i < items.length; i++) { var it = items[i]; if (it.state !== 'rest') continue; var d = Math.hypot(it.x - x, it.y - y); if (d <= bd) { bd = d; best = it; } }
      if (best) { pick(best, { x: x, y: y }); return pub(best); }
      return null;
    }
    function clear() { items = []; fx = []; tagsOut = []; acc = 0; }
    function list() { var out = []; for (var i = 0; i < items.length; i++) { var it = items[i]; if (it.state === 'gone') continue; var q = pub(it); q.state = it.state; q.x = it.x; q.y = it.y; q.z = it.z; q.landX = it.bx; q.landY = it.by; q.beamFull = it.state === 'rest' && beamOn(it) ? it.y - (58 + 30 * it.rar.beam) * it.rar.beam * scaleOf() * P.beamHeight : null; q.beamTop = q.beamFull == null ? null : it.beamTop != null ? it.beamTop : q.beamFull; q.fromX = it.sx; q.fromY = it.sy; q.tag = it.tag.a; out.push(q); } return out; }
    function audit() {   // live items whose ground point is inside a solid spot or off the map (must stay 0)
      var n = 0, b = boundsOf();
      for (var i = 0; i < items.length; i++) { var it = items[i]; if (it.state === 'gone') continue; if (solidAt(it.x, it.y) || (b && (it.x < b.x || it.y < b.y || it.x > b.x + b.w || it.y > b.y + b.h))) n++; }
      return n;
    }
    function hash() {
      var h = 2166136261 >>> 0, add = function (v) { v = Math.round(v * 100) | 0; h ^= v; h = Math.imul(h, 16777619) >>> 0; };
      add(clock); add(items.length);
      for (var i = 0; i < items.length; i++) { var it = items[i]; add(it.id); add(it.x); add(it.y); add(it.z); add(it.rar.i); add(it.tag.ox); add(it.tag.oy); add(it.tag.a * 1000); add(it.state.length); }
      return h.toString(16);
    }
    function stats() { var o2 = {}; for (var k in ST) o2[k] = ST[k]; o2.items = 0; o2.resting = 0; o2.flying = 0; o2.tags = 0; for (var i = 0; i < items.length; i++) { var it = items[i]; if (it.state === 'gone') continue; o2.items++; if (it.state === 'rest') o2.resting++; if (it.state === 'fly') o2.flying++; if (it.tag.a > 0.01) o2.tags++; } o2.clock = Math.round(clock); return o2; }
    function tagRects() {   // every tag on screen now (and fading crossfade ghosts, ghost: true), view space, from update() state
      var v = viewOf(null), cam = camOf(), out = []; if (!v) return out;
      for (var i = 0; i < items.length; i++) {
        var it = items[i], T = it.tag, an = anchorScreen(it, v, cam);
        if (T.ga > 0.01) out.push({ id: it.id, x: an.x + T.gx, y: an.y + T.gy, w: T.w, h: T.h, a: T.ga, ax: an.x, ay: an.y, rarity: it.rar.id, ghost: true });
        if (T.a > 0.01) out.push({ id: it.id, x: an.x + T.ox, y: an.y + T.oy, w: T.w, h: T.h, a: T.a, ax: an.x, ay: an.y, rarity: it.rar.id });
      }
      return out;
    }

    return {
      version: VERSION, drop: drop, spawn: spawn, update: update, drawGround: drawGround, draw: draw, drawTags: drawTags, collect: collect, pickNear: pickNear,
      clear: clear, list: list, audit: audit, hash: hash, stats: stats, tagRects: tagRects, lastDrawn: function () { return tagsOut.slice(); },
      popRects: function () { var v = viewOf(null); return v ? popRects(v, camOf()) : []; },
      rects: function () { return tagRects().map(function (r) { return { x: r.x, y: r.y, w: r.w, h: r.h }; }); },
      setParams: setParams, params: function () { var c = {}; for (var k in P) c[k] = P[k]; return c; }, rarities: function () { return R.map(function (r) { return { id: r.id, name: r.name, color: r.color, weight: r.weight, beam: r.beam }; }); },
      roll: function (table) { var t = typeof table === 'string' ? TABS[table] : table; return rollTable(t, rnd, ITEMSD, R); }, time: function () { return clock; }
    };
  }

  var API = { version: VERSION, create: create, rollTable: rollTable, weightsOf: weightsOf, pickWeighted: pickWeighted, makeRng: makeRng,
    rarities: RARITIES, items: ITEMS, tables: TABLES, defaults: DEFAULTS, icons: Object.keys(ICONS), renderIcon: renderIcon };
  root.GameDNA_LootBeams = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
