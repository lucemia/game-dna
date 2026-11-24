/* GameDNA skin 'pixel8' · 8-bit console pixel · needs skin-api.js first
 *
 * The look of an 8-bit home console: one fixed master palette of 26 colours, at most 3 colours + transparent per
 * sprite or UI element, an 8x8 bitmap font in capitals, single-colour windows with a black / white / black border,
 * checker dither instead of any alpha, flat colours (no gradients, no ramps), blocky 8x8 numerals with a 1 px black
 * outline, and motion stepped at a 15 fps feel. Nothing this skin draws is ever semi-transparent: every alpha a module
 * asks for (fades, disabled pointers, opening windows) is turned into a screen-aligned dither pattern.
 *
 *   frame   = black / white / black border, single flat fill (team a blue, b red, n black), clipped outer corners
 *   text    = 8x8 caps font, one colour, optional 1 px black drop shadow; color2 is ignored (no 2-tone glyphs)
 *   number  = the same 8x8 glyphs, flat kind colour, 1 px square black outline (8-neighbour) + 1 px drop; crit = 2x
 *   overlay = checker dither of one palette colour + 1 px solid edge; 'pulsing' = palette cycling, never alpha
 *   bar     = black slot, flat fill; gauges are segmented every 4 px; HP meter has one light top line
 *   cursor  = 2 px corner brackets blinking in/out at 4 Hz; menu pointer = solid triangle
 *   path    = extra (SPEC "reserved" hook): 3-colour chunky arrow on tile centres with a stepped spark
 *   dither  = extra: dither(ctx, rect, colour, level) for hosts that want the skin's fades
 *   tile / unitToken = SPEC v0.2 scene hooks: 11 terrain kinds and 5 unit kinds as 16x16 art in 3 master colours each
 */
(function (root) {
  'use strict';
  var API = root.GameDNA_Skin;
  if (!API) { if (root.console) console.error('pixel8.js: load skin-api.js first'); return; }

  /* ---------- master palette (26 colours; everything drawn comes from here) ---------- */
  var M = {
    K: '#000000', W: '#fcfcfc', N1: '#bcbcbc', N2: '#7c7c7c',
    B0: '#a4e4fc', B1: '#3cbcfc', B2: '#0078f8', B3: '#0000bc', B4: '#6888fc',
    R1: '#f83800', R2: '#a81000', R3: '#f87858',
    O1: '#fca044', O2: '#e45c10', O3: '#881400', Y1: '#f8d878', Y2: '#f8b800',
    G1: '#b8f818', G2: '#58d854', G3: '#00a800', G4: '#005800', M1: '#58f898',
    P1: '#d8b8f8', P2: '#6844fc', T1: '#ac7c00', T2: '#503000', S: '#fcd8a8'
  };

  /* ---------- 8x8 font: 7x7 glyph in an 8x8 cell (row 8 and column 8 empty), 2 px vertical strokes ---------- */
  var GL = {
    A: '..###..|.##.##.|##...##|##...##|#######|##...##|##...##', B: '######.|##...##|##...##|######.|##...##|##...##|######.',
    C: '.#####.|##...##|##.....|##.....|##.....|##...##|.#####.', D: '#####..|##..##.|##...##|##...##|##...##|##..##.|#####..',
    E: '#######|##.....|##.....|######.|##.....|##.....|#######', F: '#######|##.....|##.....|######.|##.....|##.....|##.....',
    G: '.#####.|##...##|##.....|##.####|##...##|##...##|.######', H: '##...##|##...##|##...##|#######|##...##|##...##|##...##',
    I: '######.|..##...|..##...|..##...|..##...|..##...|######.', J: '....###|.....##|.....##|.....##|##...##|##...##|.#####.',
    K: '##...##|##..##.|##.##..|####...|##.##..|##..##.|##...##', L: '##.....|##.....|##.....|##.....|##.....|##.....|#######',
    M: '##...##|###.###|#######|##.#.##|##...##|##...##|##...##', N: '##...##|###..##|####.##|##.####|##..###|##...##|##...##',
    O: '.#####.|##...##|##...##|##...##|##...##|##...##|.#####.', P: '######.|##...##|##...##|######.|##.....|##.....|##.....',
    Q: '.#####.|##...##|##...##|##...##|##.#.##|##..##.|.###.##', R: '######.|##...##|##...##|######.|##.##..|##..##.|##...##',
    S: '.#####.|##...##|##.....|.#####.|.....##|##...##|.#####.', T: '######.|..##...|..##...|..##...|..##...|..##...|..##...',
    U: '##...##|##...##|##...##|##...##|##...##|##...##|.#####.', V: '##...##|##...##|##...##|##...##|.##.##.|..###..|...#...',
    W: '##...##|##...##|##...##|##.#.##|#######|###.###|##...##', X: '##...##|##...##|.##.##.|..###..|.##.##.|##...##|##...##',
    Y: '##..##.|##..##.|##..##.|.####..|..##...|..##...|..##...', Z: '#######|....##.|...##..|..##...|.##....|##.....|#######',
    0: '.#####.|##...##|##..###|##.#.##|###..##|##...##|.#####.', 1: '..##...|.###...|..##...|..##...|..##...|..##...|######.',
    2: '.#####.|##...##|.....##|...###.|.###...|##.....|#######', 3: '######.|....##.|...##..|..####.|.....##|##...##|.#####.',
    4: '...###.|..####.|.##.##.|##..##.|#######|....##.|....##.', 5: '######.|##.....|######.|.....##|.....##|##...##|.#####.',
    6: '..####.|.##....|##.....|######.|##...##|##...##|.#####.', 7: '#######|##...##|....##.|...##..|..##...|..##...|..##...',
    8: '.#####.|##...##|##...##|.#####.|##...##|##...##|.#####.', 9: '.#####.|##...##|##...##|.######|.....##|....##.|.####..',
    '/': '.....##|....##.|...##..|..##...|.##....|##.....|.......', '-': '.......|.......|.......|.#####.|.......|.......|.......',
    '+': '.......|..##...|..##...|######.|..##...|..##...|.......', '.': '.......|.......|.......|.......|.......|..##...|..##...',
    ':': '.......|..##...|..##...|.......|..##...|..##...|.......', ',': '.......|.......|.......|.......|..##...|..##...|.##....',
    '!': '..##...|..##...|..##...|..##...|..##...|.......|..##...', '?': '.#####.|##...##|....##.|...##..|..##...|.......|..##...',
    "'": '..##...|..##...|.##....|.......|.......|.......|.......', '%': '##...##|##..##.|...##..|..##...|.##....|##..##.|##...##',
    '(': '...##..|..##...|.##....|.##....|.##....|..##...|...##..', ')': '.##....|..##...|...##..|...##..|...##..|..##...|.##....',
    '=': '.......|.......|######.|.......|######.|.......|.......', '<': '....##.|...##..|..##...|.##....|..##...|...##..|....##.',
    '>': '.##....|..##...|...##..|....##.|...##..|..##...|.##....', '#': '.##.##.|#######|.##.##.|.##.##.|.##.##.|#######|.##.##.',
    '*': '.......|##.#.##|.#####.|#######|.#####.|##.#.##|.......', '&': '..###..|.##.##.|..###..|.###.##|##.###.|##..##.|.###.##',
    '_': '.......|.......|.......|.......|.......|.......|#######', ';': '.......|..##...|..##...|.......|..##...|..##...|.##....',
    '"': '.##.##.|.##.##.|.......|.......|.......|.......|.......', '[': '.####..|.##....|.##....|.##....|.##....|.##....|.####..',
    ']': '.####..|...##..|...##..|...##..|...##..|...##..|.####..', '$': '..##...|.######|##.....|.#####.|.....##|######.|..##...',
    '@': '.#####.|##...##|##.####|##.####|##.###.|##.....|.#####.'
  };
  var ROWS = {}, CW = 8, CH = 8, NA = 9;   // cell; pop-up numbers advance 9 px so outlined glyphs never overlap while they bounce at different heights
  function rows(ch) { if (ROWS[ch]) return ROWS[ch]; var g = GL[ch] || GL['?']; return (ROWS[ch] = g.split('|')); }
  function up(s) { return String(s).toUpperCase(); }

  /* ---------- dither: alpha -> screen-aligned pattern (never blended) ---------- */
  function lvl(a) { return a >= 0.875 ? 4 : a >= 0.625 ? 3 : a >= 0.375 ? 2 : a >= 0.125 ? 1 : 0; }   // 4/4, 3/4, 2/4, 1/4, none
  function on(x, y, L) {
    if (L >= 4) return true; if (L <= 0) return false;
    if (L === 3) return !((x & 1) && (y & 1));
    if (L === 2) return ((x + y) & 1) === 0;
    return !(x & 1) && !(y & 1);   // 1/4: every other pixel of every other row
  }
  // rect in the given colour at dither level L (screen-aligned so moving things do not crawl)
  function drect(g, x, y, w, h, col, L) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (w <= 0 || h <= 0 || L <= 0) return;
    g.fillStyle = col;
    if (L >= 4) { g.fillRect(x, y, w, h); return; }
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) if (on(x + i, y + j, L)) g.fillRect(x + i, y + j, 1, 1);
  }
  function quarter(x, y) { return !(x & 1) && !(y & 1); }
  // effective alpha of a call: context alpha x option alpha; the context is set to 1 while drawing
  function takeAlpha(g, a) { var pa = g.globalAlpha; g.globalAlpha = 1; return { pa: pa, L: lvl(pa * (a == null ? 1 : a)) }; }

  /* ---------- glyph drawing (fill or outline pass), per screen pixel ---------- */
  // pixel set of one glyph at scale s; outline = 8-neighbour dilation by o px plus a 1 px drop
  var GC = {};
  function glyphPx(ch, s, o, drop) {
    var key = ch + '|' + s + '|' + o + '|' + drop;
    if (GC[key]) return GC[key];
    var R = rows(ch), w = R[0].length * s, h = R.length * s, fill = [], ol = [], set = {}, x, y, dx, dy;
    var at = function (X, Y) { return X >= 0 && Y >= 0 && X < w && Y < h && R[(Y / s) | 0][(X / s) | 0] === '#'; };
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (at(x, y)) fill.push(x, y);
    if (o > 0) for (y = -o; y < h + o + drop; y++) for (x = -o; x < w + o; x++) {
      if (at(x, y)) continue; var hit = false;
      for (dy = -o; dy <= o + drop && !hit; dy++) for (dx = -o; dx <= o && !hit; dx++) if (at(x + dx, y - dy) || at(x - dx, y - dy)) hit = true;
      if (hit && !set[x + ',' + y]) { set[x + ',' + y] = 1; ol.push(x, y); }
    }
    return (GC[key] = { fill: fill, ol: ol, w: w, h: h });
  }
  function plot(g, list, x, y, col, L) {
    g.fillStyle = col; x = Math.round(x); y = Math.round(y);
    for (var i = 0; i < list.length; i += 2) { var X = x + list[i], Y = y + list[i + 1]; if (L >= 4 || on(X, Y, L)) g.fillRect(X, Y, 1, 1); }
  }
  function strW(s, sc) { s = up(s); return s.length ? (s.length * CW - 1) * (sc || 1) : 0; }

  /* ---------- palette tokens ---------- */
  var palette = {
    ink: M.K, paper: M.W, master: M,
    ui: { fill: M.B3, edge: M.K, highlight: M.W, shadow: M.K, select: M.B2, well: M.K, focus: M.Y2, alert: M.Y2, disabled: M.N2 },
    // per team: [outer edge, line, inner edge, fill]  (window-cursor reads [3] as the opaque backing colour)
    windows: { a: [M.K, M.W, M.K, M.B3], b: [M.K, M.W, M.K, M.R2], n: [M.K, M.W, M.K, M.K] },
    team: { a: M.B2, b: M.R1, n: M.N2, aLight: M.B1, aDark: M.B3, bLight: M.R3, bDark: M.R2, aText: M.W, bText: M.W },
    overlay: {
      move: { fill: M.B2, fill2: M.B1, edge: M.W },
      attack: { fill: M.R1, fill2: M.R3, dark: M.R2, edge: M.R1 },   // 2/4 red + 1/4 dark red: reads red at 1x, ground shows through 1/4
      threat: { fill: M.P2, fill2: M.P1, dark: M.B3, edge: M.P1 },
      heal: { fill: M.M1, fill2: M.G1, edge: M.W },
      path: { core: M.Y1, light: M.Y1, mid: M.O1, dark: M.O1, outline: M.O3, spark: M.W }
    },
    fx: { hot: M.R1, cold: M.B1, heal: M.G2, crit: M.Y2, status: M.P1, white: M.W },
    text: {
      main: M.W, main2: M.W, shadow: M.K, outline: M.K, dim: M.N2, dim2: M.N2, accent: M.Y2, select: M.W,
      title: M.Y2, title2: M.Y2, label: M.B1, label2: M.B1, gold: M.Y2, gold2: M.Y2,
      plate: M.W, plateShadow: M.K, pointer: M.W, pointerEdge: M.K
    },
    // flat number colours per kind (no ramps); 'flash' replaces the fill on flash frames
    numbers: { damage: M.W, crit: M.Y2, heal: M.G1, mp: M.B1, miss: M.N1, status: M.P1, flash: M.W, critFlash: M.R1 },
    bars: {
      track: M.K, out: M.K, dot: M.N2,
      charge: M.Y2, haste: M.G1, slow: M.P1, ready: M.W, queued: M.B1, enemy: M.R1, enemyFull: M.Y2,
      hp: M.G2, hpTop: M.G1, hpLow: M.R1, hpLowTop: M.R3
    },
    cursor: { light: M.W, edge: M.K, bad: M.R1 }
  };

  var FONT = { type: 'bitmap', height: CH, advance: CW, spacing: 1, space: CW, uppercase: true, sep: '|', glyphs: GL,
    note: '8x8 cell, 7x7 caps glyphs with 2 px verticals, fixed 8 px advance, single colour' };


  /* ---------- scene art (SPEC v0.2 tile / unitToken): 16x16, <= 3 master colours + transparent each ---------- */
  var SPR = {
    knight: ['............3...', '...........131..', '.....1111..131..', '....122221.131..', '...12222221.1...', '...12133131.1...', '...11333311.1...', '....113311.111..', '...12222221131..', '..1222222221.1..', '..1213222121.1..', '..121222221..1..', '...11222211..1..', '...12211221.....', '...1221.1221....', '...111..111.....'],
    mage: ['..........3.....', '......11.131....', '.....1221.1.....', '....122221.1....', '...12222221.1...', '...12133121.1...', '...11333311.1...', '....113311.1....', '...1222222111...', '..12232232211...', '..12232232211...', '..1222332221....', '...122332221....', '..12222222221...', '..11111111111...', '................'],
    fighter: ['...........11...', '..........1331..', '....1111.133331.', '...133331.1331..', '...131131..11...', '...133331..1....', '....1331...1....', '...12222111.....', '..1322222231....', '..1322222231....', '..13122221.1....', '...1222221......', '...1211121......', '...121.121......', '...131.131......', '...11...11......'],
    archer: ['................', '.....1111...1...', '....122221..11..', '...12222221.1.1.', '...12133121.1..1', '...11333311.1..1', '....113311..1..1', '...1222222111111', '..13222222131..1', '..1312222211...1', '..131222221.1.1.', '...1222222..11..', '...1211121...1..', '...121.121......', '...131.131......', '...11...11......'],
    monster: ['................', '................', '................', '.......11.......', '......1221......', '....11222211....', '...1222222221...', '..122222222221..', '..123312233221..', '..123112231221..', '.12222222222221.', '.12221111112221.', '.12222222222221.', '..122222222221..', '...1111111111...', '................']
  };
  var TREE8 = ['.....aa.........', '....abba........', '...abbbba..aa...', '...abbbba.abba..', '..abbbbbbaabbba.', '..abbbbbbabbbbba', '...aabbaaabbbbba', '.....aa...abbaa.', '.....aa....aa...', '...........aa...'];
  function px1(g, x, y, c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
  function blit(g, rows, pal, x, y, flip, L) {
    for (var j = 0; j < rows.length; j++) for (var i = 0; i < rows[j].length; i++) {
      var ch = rows[j][flip ? rows[j].length - 1 - i : i], c = pal[ch]; if (!c) continue;
      if (L == null || L >= 4 || on(x + i, y + j, L)) px1(g, x + i, y + j, c);
    }
  }
  // deterministic speckles per cell (same map every frame)
  function hh(a, b, s) { var h = (a * 374761393 + b * 668265263 + (s || 0) * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; }
  function tileArt(g, r, kind, t) {
    var x = Math.round(r.x), y = Math.round(r.y), cx = (x >> 4), cy = (y >> 4), i, k, h;
    var R = function (X, Y, W, H, c) { g.fillStyle = c; g.fillRect(x + X, y + Y, W, H); };
    switch (kind) {
      case 'forest':   // G2 floor, G3 canopy, G4 outline and trunks
        R(0, 0, 16, 16, M.G2); blit(g, TREE8, { a: M.G4, b: M.G3 }, x, y + 3, (cx + cy) % 2); R(5, 13, 2, 2, M.G4); R(11, 12, 2, 2, M.G4); break;
      case 'water':    // B2 base, B1 ripples (2-frame at 2 Hz), W glint
        R(0, 0, 16, 16, M.B2); var ph = Math.floor((t || 0) * 2) % 2;
        for (k = 1; k < 16; k += 4) { h = hh(cx, cy, k + ph * 11); R((h % 9) + ((k >> 2) % 2) * 2, k + ph, 4 + (h >>> 7) % 3, 1, M.B1); }
        h = hh(cx, cy, 99 + ph); R(1 + h % 13, 2 + (h >>> 5) % 12, 1, 1, M.W); break;
      case 'hill':     // G2 ground, T1 mound, T2 outline and shading
        R(0, 0, 16, 16, M.G2);
        blit(g, ['................', '................', '................', '......2222......', '.....211112.....', '....21111112....', '...2111111112...', '..211111121112..', '..211112211112..', '.21111211111112.', '.21112111111112.', '.22222222222222.'], { 1: M.T1, 2: M.T2 }, x, y + 2, cx % 2); break;
      case 'mountain': // G2 ground, N1 rock, K outline and cracks
        R(0, 0, 16, 16, M.G2);
        blit(g, ['.......kk.......', '......k11k......', '.....k1111k.....', '.....k11k1k.....', '....k1111k1k....', '....k11k111k....', '...k111k1111k...', '...k11k11k11k...', '..k111k111k11k..', '..k11k111k111k..', '.k111k11k11111k.', '.k11k111k1111k1k', 'kkkkkkkkkkkkkkkk'], { k: M.K, 1: M.N1 }, x, y + 2, cy % 2); break;
      case 'road':     // G2 verges, T1 dirt, T2 ruts
        R(0, 0, 16, 16, M.G2); R(0, 3, 16, 10, M.T1); R(0, 3, 16, 1, M.T2); R(0, 12, 16, 1, M.T2);
        for (i = 0; i < 3; i++) { h = hh(cx, cy, i); R(h % 14, 5 + (h >>> 4) % 6, 2, 1, M.T2); } break;
      case 'bridge':   // B2 water at the sides, T1 planks, T2 gaps and rails
        R(0, 0, 16, 16, M.B2); R(0, 2, 16, 12, M.T1); R(0, 2, 16, 1, M.T2); R(0, 13, 16, 1, M.T2);
        for (i = 3; i < 16; i += 4) R(i, 3, 1, 10, M.T2); break;
      case 'fort':     // N2 courtyard, N1 walls, K outline / gate
        R(0, 0, 16, 16, M.N2);
        blit(g, ['k.k.k....k.k.k..', 'kkkkk....kkkkk..', 'k111k....k111k..', 'k111kkkkkk111k..', 'k111111111111k..', 'k1k11k11k11k1k..', 'k111111111111k..', 'k1111kkkk1111k..', 'k111k1111k111k..', 'k111k1111k111k..', 'kkkkkkkkkkkkkkk.'], { k: M.K, 1: M.N1 }, x + 1, y + 3, false); break;
      case 'sand':     // Y1 base, O1 ripples, T1 pebbles
        R(0, 0, 16, 16, M.Y1);
        for (i = 0; i < 3; i++) { h = hh(cx, cy, i + 5); R(h % 11, 2 + i * 5, 4, 1, M.O1); }
        h = hh(cx, cy, 9); R(h % 14, (h >>> 4) % 14, 1, 1, M.T1); R((h >>> 8) % 14, (h >>> 12) % 14, 2, 1, M.T1); break;
      case 'wall':     // R2 brick, O3 mortar, R3 brick tops
        R(0, 0, 16, 16, M.R2);
        for (k = 0; k < 4; k++) { R(0, k * 4 + 3, 16, 1, M.O3); R(0, k * 4, 16, 1, M.R3); var off = k % 2 ? 4 : 0; for (i = off; i < 16; i += 8) R(i, k * 4, 1, 3, M.O3); } break;
      case 'floor':    // T2 base, T1 slabs, K grout
        R(0, 0, 16, 16, M.K); R(1, 1, 6, 6, M.T1); R(9, 1, 6, 6, M.T2); R(1, 9, 6, 6, M.T2); R(9, 9, 6, 6, M.T1);
        R(1, 1, 6, 1, M.T2); R(9, 9, 6, 1, M.T2); break;
      default:         // grass: G2 base, G3 tufts, G1 glints
        R(0, 0, 16, 16, M.G2);
        for (k = 0; k < 3; k++) { h = hh(cx, cy, k); var a = h % 13, b = (h >>> 8) % 13;
          if (k < 2) { R(a, b + 1, 1, 1, M.G3); R(a + 1, b + 2, 1, 1, M.G3); R(a + 2, b + 1, 1, 1, M.G3); } else R(a + 1, b, 2, 1, M.G1); }
    }
  }

  var skin = {
    id: 'pixel8', name: '8-bit console pixel', pixel: true,
    native: { w: 256, h: 240, scale: 'integer', smoothing: false, snap: 1, minScale: 1, tile: 16, note: '256x240 native, 16x16 tiles from 8x8 cells, CSS-scale by a whole number' },
    palette: palette,
    fonts: {
      ui: FONT, num: FONT, label: FONT, plate: FONT, bold: FONT,
      rules: { snap: true, smoothing: false, minSize: 8, uppercase: true, lineH: 12, cell: 8, colours: 1, shadow: '1 px black drop, optional' }
    },
    shape: { radius: 0, edgeWidth: 3, padding: 5, clippedCorners: 1, border: 'black/white/black', barSegment: 4 },
    overlayStyle: { mode: 'dither', pattern: 'checker', edgeWidth: 1, grow: 'stepped 1/4 -> 2/4', pulse: 'palette cycle 4 Hz', seams: 'none' },
    particles: { shape: 'square', size: [2, 2], count: 0.6, snap: true, blend: 'source-over', glow: 0, gravity: 0.15, drag: 0, life: [180, 400], colors: ['paper', 'fx.crit', 'fx.hot'], trail: 0, rays: 4, maxOnScreen: 8 },
    outline: { text: { width: 0, mode: 'drop' }, number: { width: 1, max: 1, drop: 1, mode: 'dilate8', color: 'ink' }, sprite: { width: 1, color: 'ink', mode: 'pixel' } },
    shadow: { text: { dx: 1, dy: 1 }, window: null, sprite: { kind: 'drop', alpha: 1, pattern: 'checker', color: 'ink', note: 'a 1 px dark row or a checker blob, never alpha' } },
    motion: { stepMs: 1000 / 15, snap: true, ease: { move: 'linear', pop: 'snap', fade: 'linear' }, fadeSteps: [1, 0.5], shakeInt: true, flashMax: 0.5, flashMode: 'dither', blinkMs: 133, hitStopMs: 67, alpha: 'never: alpha -> dither pattern' },

    // tile(ctx, rect, kind, t): one 16x16 map cell, 3 master colours (scaled to the rect by whole pixels when it is bigger)
    tile: function (g, r, kind, t) {
      if (r.w === 16 && r.h === 16) { tileArt(g, r, kind, t); return; }
      var c = API.canvas(16, 16), cg = c.getContext('2d'); tileArt(cg, { x: 0, y: 0, w: 16, h: 16 }, kind, t);
      var pv = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false; g.drawImage(c, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)); g.imageSmoothingEnabled = pv;
    },
    // unitToken(ctx, rect, {team, kind, selected, dead, facing, noShadow}, t): 16x16 sprite, outline + team colour + skin, standing on the
    // bottom of the rect; selected hops 1 px at 2 Hz (stepped), dead is drawn in 2/4 dither, shadow = a 1 px black row
    unitToken: function (g, r, u, t) {
      u = u || {}; var kind = SPR[u.kind] ? u.kind : 'fighter', team = u.team || 'a';
      var body = team === 'b' ? M.R1 : team === 'n' ? M.N2 : M.B2, third = kind === 'monster' ? M.W : M.S;
      var A = takeAlpha(g, u.dead ? 0.5 : 1), L = A.L;
      var x = Math.round(r.x + (r.w - 16) / 2), y = Math.round(r.y + r.h - 16), hop = u.selected && !u.dead ? Math.floor(GameDNA_Skin.motion.stepTime(this, (t || 0) * 1000) / 500) % 2 : 0;
      if (!u.noShadow && L > 0) drect(g, x + 4, y + 15, 8, 1, M.K, L);
      if (L > 0) blit(g, SPR[kind], { 1: M.K, 2: body, 3: third }, x, y - hop, u.facing === -1, L);
      g.globalAlpha = A.pa;
    },

    measure: function (str, o) { o = o || {}; return strW(str, Math.max(1, Math.round(o.scale || 1))); },

    // text(ctx, str, x, y, {font, color, shadow, outline, align, scale, alpha}); color2 is ignored on purpose (1 colour per glyph)
    text: function (g, str, x, y, o) {
      o = o || {}; var s = up(str), sc = Math.max(1, Math.round(o.scale || 1)), w = strW(s, sc), P = palette, me = this;
      if (o.align === 'center') x -= Math.floor(w / 2); else if (o.align === 'right') x -= w;
      x = Math.round(x); y = Math.round(y);
      var col = API.token(this, o.color) || P.text.main;
      var sh = o.shadow === false ? null : API.token(this, o.shadow) || (this.shadow.text ? P.text.shadow : null);
      var ol = o.outline ? (o.outline === true ? P.text.outline : API.token(this, o.outline)) : null;
      var A = takeAlpha(g, o.alpha);
      if (A.L > 0) {
        var pass = function (col2, dx, dy, kind) {
          var cx = x;
          for (var i = 0; i < s.length; i++) {
            if (s[i] !== ' ') { var G = glyphPx(s[i], sc, kind === 'ol' ? 1 : 0, 0); plot(g, kind === 'ol' ? G.ol : G.fill, cx + dx, y + dy, col2, A.L); }
            cx += CW * sc;
          }
        };
        if (ol) pass(ol, 0, 0, 'ol');
        if (sh) pass(sh, (me.shadow.text || {}).dx || 1, (me.shadow.text || {}).dy || 1, 'fill');
        pass(col, 0, 0, 'fill');
      }
      g.globalAlpha = A.pa; return w;
    },

    // frame(ctx, rect, {role, team, focus, alert, disabled, alpha}) -> inner rect
    frame: function (g, r, st) {
      st = st || {}; var P = palette, x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
      var C = P.windows[st.team] || P.windows[st.role === 'plate' ? 'n' : 'a'], A = takeAlpha(g, st.alpha), L = A.L;
      var line = st.disabled ? P.ui.disabled : st.alert ? P.ui.alert : st.focus ? P.ui.focus : C[1];
      if (L > 0 && w > 2 && h > 2) {
        if (st.role === 'plate' || st.role === 'tooltip' || w < 10 || h < 10) {   // small: one black edge, flat fill, light top line
          drect(g, x + 1, y, w - 2, 1, C[0], L); drect(g, x + 1, y + h - 1, w - 2, 1, C[0], L); drect(g, x, y + 1, 1, h - 2, C[0], L); drect(g, x + w - 1, y + 1, 1, h - 2, C[0], L);
          drect(g, x + 1, y + 1, w - 2, h - 2, st.alert ? P.windows.b[3] : C[3], L);
          if (st.alert || st.focus) drect(g, x + 1, y + 1, w - 2, 1, line, L);
        } else {
          // outer black (corner pixels left open = rounded), white line (its corners cut), inner black, flat fill
          drect(g, x + 1, y, w - 2, 1, C[0], L); drect(g, x + 1, y + h - 1, w - 2, 1, C[0], L); drect(g, x, y + 1, 1, h - 2, C[0], L); drect(g, x + w - 1, y + 1, 1, h - 2, C[0], L);
          drect(g, x + 1, y + 1, w - 2, h - 2, C[2], L);
          drect(g, x + 2, y + 1, w - 4, 1, line, L); drect(g, x + 2, y + h - 2, w - 4, 1, line, L); drect(g, x + 1, y + 2, 1, h - 4, line, L); drect(g, x + w - 2, y + 2, 1, h - 4, line, L);
          drect(g, x + 3, y + 3, w - 6, h - 6, C[3], L);
          if (st.role === 'banner') { drect(g, x + 3, y + 3, w - 6, 1, line, L); drect(g, x + 3, y + h - 4, w - 6, 1, line, L); }
        }
      }
      g.globalAlpha = A.pa;
      var pad = st.role === 'plate' || st.role === 'tooltip' ? 3 : this.shape.padding;
      return { x: x + pad, y: y + pad, w: w - 2 * pad, h: h - 2 * pad };
    },

    // number(ctx, str, x, y, {kind, scale, big, suffix, label, labelGap, outline, align, baseline, alpha, glyphOffset}) -> fill rects
    // glyphs numbered: characters of str, then suffix characters, then label characters
    number: function (g, str, x, y, o) {
      o = o || {}; var P = palette, s = up(str), kind = o.kind || 'damage', base = Math.max(1, Math.round(o.scale || 1));
      var sc = kind === 'crit' && o.big ? base * 2 : base, ow = o.outline == null ? 1 : Math.max(0, Math.min(1, +o.outline)), out = [];
      var col = o.color || P.numbers[kind] || P.numbers.damage;
      var items = [], cx = 0, i, nh = CH * sc - sc;   // glyph is 7 px of 8 tall
      for (i = 0; i < s.length; i++) { items.push({ ch: s[i], x: cx, y: 0, s: sc }); cx += NA * sc; }
      var nw = cx - 2 * sc;
      if (o.suffix) { cx = nw + 2 * base; var sf = up(o.suffix); for (i = 0; i < sf.length; i++) { items.push({ ch: sf[i], x: cx, y: nh - (CH - 1) * base, s: base, suf: 1 }); cx += NA * base; } nw = cx - 2 * base; }
      var labItems = [];
      if (o.label) {
        var lb = up(o.label), lw = lb.length * NA - 2, lx = Math.round((nw - lw) / 2), gap = o.labelGap == null ? 3 : o.labelGap;
        for (i = 0; i < lb.length; i++) labItems.push({ ch: lb[i], x: lx + i * NA, y: -(CH - 1) - gap, s: 1, lab: 1, lx0: i * NA });
      }
      var x0 = o.align === 'center' ? Math.round(x - nw / 2) : Math.round(x), y0 = Math.round(o.baseline === 'bottom' ? y - nh : y);
      var A = takeAlpha(g, 1), all = items.concat(labItems);
      var plan = all.map(function (it, k) {
        var d = (o.glyphOffset && o.glyphOffset(k, it)) || {};
        var a = A.pa * (d.alpha != null ? d.alpha : o.alpha != null ? o.alpha : 1), L = lvl(a);
        return { it: it, d: d, L: L, G: d.skip || it.ch === ' ' || L <= 0 ? null : glyphPx(it.ch, it.s, ow, ow ? 1 : 0),
          c: d.flash ? (kind === 'crit' && !it.lab ? P.numbers.critFlash : P.numbers.flash) : it.lab ? P.numbers.crit : col };
      });
      ['ol', 'fill'].forEach(function (pass) {
        plan.forEach(function (p) {
          if (!p.G) return; var gx = Math.round(x0 + p.it.x + (p.d.dx || 0)), gy = Math.round(y0 + p.it.y + (p.d.dy || 0));
          plot(g, p.G[pass], gx, gy, pass === 'ol' ? P.text.outline : p.c, p.L);
          if (pass === 'fill') out.push({ x: gx, y: gy, w: p.G.w, h: p.G.h, ch: p.it.ch });
        });
      });
      g.globalAlpha = A.pa; return out;
    },

    // overlay(ctx, tile, kind, tSeconds, {grow, pattern, tile: {x, y}, edges, seams}): checker dither + 1 px edge, never alpha
    overlay: function (g, r, kind, t, o) {
      o = o || {}; var C = palette.overlay[kind] || palette.overlay.move, gr = o.grow == null ? 1 : o.grow;
      if (!(gr > 0)) return;
      var A = takeAlpha(g, 1); if (A.L <= 0) { g.globalAlpha = A.pa; return; }
      var tx = o.tile ? o.tile.x : 0, ty = o.tile ? o.tile.y : 0, pat = o.pattern || 'checker', x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
      var ts = Math.floor((t || 0) * 4);   // 4 Hz palette step
      var col = C.fill, dense = gr >= 0.5 ? 2 : 1;
      if (pat === 'pulsing' && ((tx + ty + 64 - ts % 8) % 8) < 2) col = C.fill2 || C.fill;   // a lighter band walks across the set
      if (pat === 'checker' && (tx + ty) % 2) dense = Math.min(dense, 1);
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var X = x + i, Y = y + j;
        if (dense === 2 ? ((X + Y) & 1) === 0 : quarter(X, Y)) { g.fillStyle = col; g.fillRect(X, Y, 1, 1); }
        else if (C.dark && dense === 2 && (X & 1)) { g.fillStyle = C.dark; g.fillRect(X, Y, 1, 1); }   // same-hue second colour on half the holes
      }
      var E = o.edges || {}, ec = C.edge;
      if (gr >= 0.5) {
        g.fillStyle = ec;
        if (E.top) g.fillRect(x, y, w, 1); if (E.bottom) g.fillRect(x, y + h - 1, w, 1);
        if (E.left) g.fillRect(x, y, 1, h); if (E.right) g.fillRect(x + w - 1, y, 1, h);
      }
      g.globalAlpha = A.pa;
    },

    // bar(ctx, rect, frac, kind, {style: 'gauge'|'meter', tag, px})
    bar: function (g, r, fr, kind, o) {
      o = o || {}; var B = palette.bars, x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h), A = takeAlpha(g, 1), L = A.L;
      var meter = o.style === 'meter' || kind === 'hp' || kind === 'hpLow';
      drect(g, x, y, w, h, B.out, L);
      var iw = w - 2, ih = h - 2;
      if (!kind || !(fr > 0) && o.px == null) {
        for (var q = 1; q < iw; q += 2) drect(g, x + 1 + q, y + 1 + (ih >> 1), 1, 1, B.dot, L);
        g.globalAlpha = A.pa; return;
      }
      var fw = o.px != null ? Math.max(0, Math.min(iw, Math.round(o.px))) : Math.round(Math.max(0, Math.min(1, fr)) * iw);
      if (!meter) fw = fw >= iw ? iw : fw - (fw % 2);   // gauges grow in 2 px steps
      var c = B[kind] || B.charge;
      drect(g, x + 1, y + 1, fw, ih, c, L);
      if (meter) { if (ih >= 3) drect(g, x + 1, y + 1, fw, 1, kind === 'hpLow' ? B.hpLowTop : B.hpTop, L); }
      else if (ih >= 3) for (var s = 4; s < fw; s += 4) drect(g, x + 1 + s, y + 1, 1, ih, B.out, L);   // segments
      if (o.tag && B[o.tag]) { drect(g, x + 1, y + 1, 3, ih, B[o.tag], L); drect(g, x + 4, y + 1, 1, ih, B.out, L); }
      g.globalAlpha = A.pa;
    },

    // cursor(ctx, rect, 'bracket' | 'hand', tSeconds, {alpha, invalid})
    cursor: function (g, r, kind, t, o) {
      o = o || {}; var K = palette.cursor, A = takeAlpha(g, o.alpha), L = A.L;
      if (L > 0 && kind === 'hand') {
        // solid right-pointing triangle, 5x7 fill + 1 px black outline; tip at the right of rect, centred on it
        var hx = Math.round(r.x) + (Math.floor((t || 0) * 4) % 2), hy = Math.round(r.y + r.h / 2) - 4;
        var F = ['#....', '##...', '###..', '####.', '###..', '##...', '#....'];
        for (var yy = -1; yy < 8; yy++) for (var xx = -1; xx < 6; xx++) {
          var inF = function (X, Y) { return Y >= 0 && Y < 7 && X >= 0 && X < 5 && F[Y][X] === '#'; };
          if (inF(xx, yy)) drect(g, hx + xx, hy + yy, 1, 1, o.invalid ? K.bad : K.light, L);
          else if (inF(xx - 1, yy) || inF(xx + 1, yy) || inF(xx, yy - 1) || inF(xx, yy + 1)) drect(g, hx + xx, hy + yy, 1, 1, K.edge, L);
        }
      } else if (L > 0) {
        var b = Math.floor((t || 0) * 4) % 2 ? 0 : -1, x0 = Math.round(r.x) + b, y0 = Math.round(r.y) + b, x1 = Math.round(r.x + r.w) - 1 - b, y1 = Math.round(r.y + r.h) - 1 - b, arm = 5, col = o.invalid ? K.bad : K.light;
        [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(function (c) {
          var hx2 = c[2] > 0 ? c[0] : c[0] - arm + 1, vy = c[3] > 0 ? c[1] : c[1] - arm + 1, hy2 = c[3] > 0 ? c[1] : c[1] - 1, vx = c[2] > 0 ? c[0] : c[0] - 1;
          drect(g, hx2 - 1, hy2 - 1, arm + 2, 4, K.edge, L); drect(g, vx - 1, vy - 1, 4, arm + 2, K.edge, L);
        });
        [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(function (c) {
          var hx2 = c[2] > 0 ? c[0] : c[0] - arm + 1, vy = c[3] > 0 ? c[1] : c[1] - arm + 1, hy2 = c[3] > 0 ? c[1] : c[1] - 1, vx = c[2] > 0 ? c[0] : c[0] - 1;
          drect(g, hx2, hy2, arm, 2, col, L); drect(g, vx, vy, 2, arm, col, L);
        });
      }
      g.globalAlpha = A.pa;
    }
  };

  var S = API.register(skin);

  /* ---------- extras (feature-tested by hosts) ---------- */
  // path(ctx, points [{x, y}] (px, tile centres), tSeconds, {grow}) — 3-colour arrow: outline, fill, highlight; stepped spark
  S.path = function (g, pts, t, o) {
    o = o || {}; if (!pts || pts.length < 2) return;
    var C = palette.overlay.path, A = takeAlpha(g, 1), L = A.L; if (L <= 0) { g.globalAlpha = A.pa; return; }
    var P = pts.map(function (p) { return [Math.round(p.x), Math.round(p.y)]; });
    var n = P.length, last = [P[n - 2], P[n - 1]], dx = Math.sign(last[1][0] - last[0][0]), dy = Math.sign(last[1][1] - last[0][1]);
    var end = [last[1][0] - dx * 3, last[1][1] - dy * 3], segs = [];
    for (var i = 0; i < n - 1; i++) segs.push([P[i], i === n - 2 ? end : P[i + 1]]);
    var thick = function (a, b, hw, c) { drect(g, Math.min(a[0], b[0]) - hw, Math.min(a[1], b[1]) - hw, Math.abs(a[0] - b[0]) + hw * 2, Math.abs(a[1] - b[1]) + hw * 2, c, L); };
    var head = function (c, grow) {
      for (var k = 0; k <= 6 + grow; k++) { var hw = 6 + grow - k; for (var s = -hw; s < hw; s++) { var along = k - grow; drect(g, end[0] + dx * along + (dy ? s : 0), end[1] + dy * along + (dx ? s : 0), 1, 1, c, L); } }
    };
    var s0 = P[0];
    segs.forEach(function (sg) { thick(sg[0], sg[1], 3, C.outline); });
    drect(g, s0[0] - 4, s0[1] - 4, 8, 8, C.outline, L);
    head(C.outline, 1);
    segs.forEach(function (sg) { thick(sg[0], sg[1], 2, C.mid); });
    drect(g, s0[0] - 3, s0[1] - 3, 6, 6, C.mid, L);
    head(C.mid, 0);
    segs.forEach(function (sg) {   // 1 px highlight on the upper / left side of each segment
      var a = sg[0], b = sg[1];
      if (a[1] === b[1]) drect(g, Math.min(a[0], b[0]) - 1, a[1] - 2, Math.abs(a[0] - b[0]) + 2, 1, C.light, L);
      else drect(g, a[0] - 2, Math.min(a[1], b[1]) - 1, 1, Math.abs(a[1] - b[1]) + 2, C.light, L);
    });
    // spark: a 2x2 white block hopping along the centre line, one position per 1/15 s
    var line = []; segs.forEach(function (sg) { var a = sg[0], b = sg[1], len = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); for (var q = 0; q < len; q += 4) line.push([a[0] + Math.sign(b[0] - a[0]) * q, a[1] + Math.sign(b[1] - a[1]) * q]); });
    if (o.spark !== false && line.length) { var sp = line[Math.floor((t || 0) * 15) % line.length]; drect(g, sp[0] - 1, sp[1] - 1, 2, 2, C.spark, L); }
    g.globalAlpha = A.pa;
  };
  // dither(ctx, rect, colour, alpha) — what the skin uses instead of alpha; level = 1/4, 2/4, 3/4 or full by alpha
  S.dither = function (g, r, col, a) { var A = takeAlpha(g, a); drect(g, r.x, r.y, r.w, r.h, API.token(S, col), A.L); g.globalAlpha = A.pa; };
  S.letterWidth = function (s) { return strW(s, 1); };
  S.masterPalette = function () { var o = []; for (var k in M) o.push(M[k]); return o; };
})(typeof window !== 'undefined' ? window : this);
