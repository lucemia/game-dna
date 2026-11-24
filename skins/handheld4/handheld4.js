/* GameDNA skin 'handheld4' · 4-shade handheld pixel · needs skin-api.js first
 *
 * The look of an early monochrome handheld: exactly FOUR shades on screen (S0 lightest .. S3 darkest; a green-grey ramp by
 * default, warm sepia and cool grey as variants), everything built from 8x8 tiles, 1 px outlines in the darkest shade, dither
 * instead of any extra colour, a chunky 8x8 capital font, plain double-line windows, and effects done with palette fades,
 * inversions and flicker instead of alpha. LCD ghosting and a pixel-grid overlay are optional post effects (S.post).
 *
 * With only four shades, information is carried by PATTERN and INVERSION, never by hue:
 *   move   = 50 % checker of S1 + a double boundary (S3 outside, S0 inside); 'pulsing' = an S2 band walking across the set
 *   attack = S3 diagonal stripes (\) + a dashed S3 boundary          threat = sparse S2 stripes (/) + a dotted boundary
 *   heal   = S1 plus-lattice + solid boundary
 *   path   = a white (S0) road with an S3 outline and S2 dashes marching toward the arrowhead
 *   numbers= S0 digits with an S3 outline and drop (readable on every shade); heal and the CRITICAL label are INVERTED
 *            (S3 digits, S0 outline); crit flash = inversion; fades are palette fades toward S0 (fade-to-white), last step flickers
 *   windows= S0 body, S3 / S0 / S3 double border with cut corners; selected row = S1 band; turn plate = inverted (S3 body)
 *
 *   frame / text / measure / number / overlay / bar / cursor / path : the three showcase modules
 *   tile / prop / unitToken : scene hooks (11 terrain kinds, 7 prop kinds, 5 unit kinds), all 4-shade, 8x8-cell built
 *   extras : S.shades, S.variants, S.dither(ctx, rect, shadeOrToken, alpha), S.post(ctx, opts) (LCD grid + ghosting), S.letterWidth
 *
 * Variants registered: 'handheld4' (moss green-grey, default), 'handheld4-sepia', 'handheld4-grey'.
 */
(function (root) {
  'use strict';
  var API = root.GameDNA_Skin;
  if (!API) { if (root.console) console.error('handheld4.js: load skin-api.js first'); return; }

  /* ---------- the four-shade ramps (S0 lightest -> S3 darkest) ---------- */
  var RAMPS = {
    moss:  { name: 'moss green-grey', s: ['#dfe9b4', '#9db36c', '#4c6844', '#1a2a20'] },
    sepia: { name: 'warm sepia',      s: ['#f3e3c2', '#c69c6a', '#77502f', '#2a1810'] },
    grey:  { name: 'cool grey',       s: ['#e6e9ee', '#a4aab6', '#575d6b', '#1c1e26'] }
  };

  /* ---------- 8x8 font: 6x7 glyphs (2 px verticals) in an 8x8 cell, fixed 8 px advance ---------- */
  var GL = {
    A: '.####.|##..##|##..##|######|##..##|##..##|##..##', B: '#####.|##..##|##..##|#####.|##..##|##..##|#####.',
    C: '.####.|##..##|##....|##....|##....|##..##|.####.', D: '####..|##.##.|##..##|##..##|##..##|##.##.|####..',
    E: '######|##....|##....|#####.|##....|##....|######', F: '######|##....|##....|#####.|##....|##....|##....',
    G: '.####.|##..##|##....|##.###|##..##|##..##|.#####', H: '##..##|##..##|##..##|######|##..##|##..##|##..##',
    I: '######|..##..|..##..|..##..|..##..|..##..|######', J: '..####|....##|....##|....##|##..##|##..##|.####.',
    K: '##..##|##.##.|####..|###...|####..|##.##.|##..##', L: '##....|##....|##....|##....|##....|##....|######',
    M: '##...##|###.###|#######|##.#.##|##...##|##...##|##...##', N: '##..##|###.##|######|##.###|##..##|##..##|##..##',
    O: '.####.|##..##|##..##|##..##|##..##|##..##|.####.', P: '#####.|##..##|##..##|#####.|##....|##....|##....',
    Q: '.####.|##..##|##..##|##..##|##.###|##..#.|.###.#', R: '#####.|##..##|##..##|#####.|##.##.|##..##|##..##',
    S: '.####.|##..##|##....|.####.|....##|##..##|.####.', T: '######|..##..|..##..|..##..|..##..|..##..|..##..',
    U: '##..##|##..##|##..##|##..##|##..##|##..##|.####.', V: '##..##|##..##|##..##|##..##|##..##|.####.|..##..',
    W: '##...##|##...##|##...##|##.#.##|#######|###.###|##...##', X: '##..##|##..##|.####.|..##..|.####.|##..##|##..##',
    Y: '##..##|##..##|##..##|.####.|..##..|..##..|..##..', Z: '######|....##|...##.|..##..|.##...|##....|######',
    0: '.####.|##..##|##.###|######|###.##|##..##|.####.', 1: '..##..|.###..|..##..|..##..|..##..|..##..|######',
    2: '.####.|##..##|....##|..###.|.##...|##....|######', 3: '.####.|##..##|....##|..###.|....##|##..##|.####.',
    4: '...##.|..###.|.####.|##.##.|######|...##.|...##.', 5: '######|##....|#####.|....##|....##|##..##|.####.',
    6: '.####.|##....|##....|#####.|##..##|##..##|.####.', 7: '######|##..##|....##|...##.|..##..|..##..|..##..',
    8: '.####.|##..##|##..##|.####.|##..##|##..##|.####.', 9: '.####.|##..##|##..##|.#####|....##|....##|.####.',
    '+': '......|..##..|..##..|######|..##..|..##..|......', '-': '......|......|......|.####.|......|......|......',
    '/': '....##|....##|...##.|..##..|.##...|##....|##....', '.': '......|......|......|......|......|..##..|..##..',
    ',': '......|......|......|......|..##..|..##..|.##...', ':': '......|..##..|..##..|......|..##..|..##..|......',
    '!': '..##..|..##..|..##..|..##..|..##..|......|..##..', '?': '.####.|##..##|....##|..###.|..##..|......|..##..',
    "'": '..##..|..##..|.##...|......|......|......|......', '%': '##..##|##.##.|...##.|..##..|.##...|.##.##|##..##',
    '(': '...##.|..##..|.##...|.##...|.##...|..##..|...##.', ')': '.##...|..##..|...##.|...##.|...##.|..##..|.##...',
    '=': '......|......|######|......|######|......|......', '*': '......|##..##|.####.|######|.####.|##..##|......',
    '_': '......|......|......|......|......|......|######', '"': '##.##.|##.##.|......|......|......|......|......',
    '[': '.####.|.##...|.##...|.##...|.##...|.##...|.####.', ']': '.####.|...##.|...##.|...##.|...##.|...##.|.####.',
    '<': '...##.|..##..|.##...|##....|.##...|..##..|...##.', '>': '.##...|..##..|...##.|....##|...##.|..##..|.##...',
    '#': '.##.##|######|.##.##|.##.##|.##.##|######|.##.##', '&': '.###..|##.##.|.###..|.###.#|##.##.|##..#.|.###.#',
    ';': '......|..##..|..##..|......|..##..|..##..|.##...', '$': '..##..|.#####|##....|.####.|....##|#####.|..##..',
    '@': '.####.|##..##|##.###|##.###|##.##.|##....|.####.', '▼': '......|######|.####.|..##..|......|......|......'
  };
  var CW = 8, CH = 8, GW = 6, GH = 7, NA = 8;   // cell, glyph box; pop-up numbers advance 8 (6 px glyph + 1 px outline each side)
  var ROWC = {};
  function rows(ch) { if (ROWC[ch]) return ROWC[ch]; var g = GL[ch] || GL['?']; return (ROWC[ch] = g.split('|')); }
  function up(s) { return String(s).toUpperCase(); }
  function strW(s, sc) { s = up(s); return s.length ? (s.length * CW - (CW - GW)) * (sc || 1) : 0; }

  /* ---------- dither: alpha -> screen-aligned 2x2 ordered pattern (never blended) ---------- */
  function lvl(a) { return a >= 0.875 ? 4 : a >= 0.625 ? 3 : a >= 0.375 ? 2 : a >= 0.125 ? 1 : 0; }
  var BAYER = [[0, 2], [3, 1]];
  function on(x, y, L) { return L >= 4 ? true : L <= 0 ? false : BAYER[y & 1][x & 1] < L; }
  function drect(g, x, y, w, h, col, L) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (w <= 0 || h <= 0 || L <= 0) return;
    g.fillStyle = col;
    if (L >= 4) { g.fillRect(x, y, w, h); return; }
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) if (on(x + i, y + j, L)) g.fillRect(x + i, y + j, 1, 1);
  }
  function takeAlpha(g, a) { var pa = g.globalAlpha; g.globalAlpha = 1; return { pa: pa, L: lvl(pa * (a == null ? 1 : a)) }; }
  function hh(a, b, s) { var h = (a * 374761393 + b * 668265263 + (s || 0) * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; }

  /* ---------- glyph pixel sets (fill + 8-neighbour outline + drop), cached ---------- */
  var GC = {};
  function glyphPx(ch, s, o, drop) {
    var key = ch + '|' + s + '|' + o + '|' + drop;
    if (GC[key]) return GC[key];
    var R = rows(ch), w = R[0].length * s, h = GH * s, fill = [], ol = [], seen = {}, x, y, dx, dy;
    var at = function (X, Y) { return X >= 0 && Y >= 0 && X < w && Y < h && R[(Y / s) | 0][(X / s) | 0] === '#'; };
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (at(x, y)) fill.push(x, y);
    if (o > 0) for (y = -o; y < h + o + drop; y++) for (x = -o; x < w + o; x++) {
      if (at(x, y)) continue; var hit = false;
      for (dy = -o; dy <= o + drop && !hit; dy++) for (dx = -o; dx <= o && !hit; dx++) if (at(x + dx, y - dy)) hit = true;
      if (hit && !seen[x + ',' + y]) { seen[x + ',' + y] = 1; ol.push(x, y); }
    }
    return (GC[key] = { fill: fill, ol: ol, w: w, h: h });
  }
  function plot(g, list, x, y, col, L) {
    g.fillStyle = col; x = Math.round(x); y = Math.round(y);
    for (var i = 0; i < list.length; i += 2) { var X = x + list[i], Y = y + list[i + 1]; if (L >= 4 || on(X, Y, L)) g.fillRect(X, Y, 1, 1); }
  }
  function blit(g, rws, pal, x, y, flip, L) {
    for (var j = 0; j < rws.length; j++) { var r = rws[j], n = r.length;
      for (var i = 0; i < n; i++) { var c = pal[r[flip ? n - 1 - i : i]]; if (!c) continue; if (L == null || L >= 4 || on(x + i, y + j, L)) { g.fillStyle = c; g.fillRect(x + i, y + j, 1, 1); } } }
  }

  /* ---------- 16x16 unit sprites (o outline S3, b body, d body shade, f face S0, e eye S3, w steel S2, l light S0) ---------- */
  var SPR = {
    knight: ['................', '.....oooo.....o.', '....obbbbo...olo', '...obbbbbbo..olo', '...obddddbo..olo', '...obfefefo..olo',
      '....offffo...olo', '...oobbbboo..olo', '..odbbbbbbdo.oo.', '.ollobbbbbdoooo.', '.olwlobbbbdofo..', '.ollloddddoo....',
      '..ooobbddbo.....', '...obbo.obbo....', '...obbo.obbo....', '...ooo..ooo.....'],
    mage: ['.......o........', '......obo.....o.', '.....obbbo...olo', '....obbdbbo..olo', '...oooooooo..olo', '....ofefefo..owo',
      '....offffo...owo', '...obbbbbbo..owo', '..obbbbbbbbo.owo', '..obdbbbbbdbofo.', '..obdbbbbbdbowo.', '.obddbbbbbddbo..',
      '.obddbbbbbddbo..', '.obbbbbbbbbbbo..', '..ooooooooooo...', '................'],
    fighter: ['..........ooo...', '.........olllo..', '....oooo.olwllo.', '...obbbbo.olwo..', '..obbbbbbo.oo...', '..obloblboo.o...',
      '..obbbbbbo.owo..', '...oddddo.owo...', '..oobbbboowo....', '.obbobbbbbo.....', '.obodbbbbdo.....', '.ofoddbbddo.....',
      '..o.obbbbo......', '...obbo.obbo....', '...obdo.obdo....', '...ooo..ooo.....'],
    archer: ['................', '.....oooo...o...', '....obbbbo..oo..', '...obbbbbbo.o.o.', '...obfefefo.o..o', '....offffo..o..o',
      '...oobbbboo.o..o', '..obbbbbbbbooooo', '..ofobbbbbdoo..o', '..oo.obbbbdo...o', '.....obbbbdo..o.', '....obddddbo.oo.',
      '...obbo..obbo.o.', '...obbo..obbo...', '...obbo..obbo...', '...ooo...ooo....'],
    monster: ['................', '................', '................', '......oooo......', '....oobbbboo....', '...obbbbbbbbo...',
      '..obbbbbbbbbbo..', '..obloobbloobo..', '..oblleobllebo..', '.obbbbbbbbbbbbo.', '.obbbooooooobbo.', '.obbobobobobbbo.',
      '.obbbbbbbbbbddo.', '..odbbbbbbbddo..', '...oooooooooo...', '................']
  };

  /* ---------- factory: one skin object per ramp ---------- */
  function make(id, rampKey) {
    var RM = RAMPS[rampKey], S0 = RM.s[0], S1 = RM.s[1], S2 = RM.s[2], S3 = RM.s[3], SH = RM.s;
    function shade(i) { return SH[Math.max(0, Math.min(3, i))]; }
    // text() is told 'disabled' only through the colour it receives, and title / label / note text are S2 too; so dim is the SAME
    // shade spelled in upper case: canvas draws it identically, text() recognises it and draws the disabled checker (SPEC gap: no role)
    var DIM = S2.toUpperCase();
    function idx(col) { var c = String(col || '').toLowerCase(); for (var i = 0; i < 4; i++) if (SH[i] === c) return i; return -1; }

    var palette = {
      ink: S3, paper: S0, shades: SH.slice(), ramp: rampKey,
      ui: { fill: S0, fillTo: S0, edge: S3, highlight: S0, shadow: S3, select: S1, well: S1, focus: S3, alert: S3, disabled: S2 },
      // per team: [outer line, gap line, inner line, body]
      windows: { a: [S3, S0, S3, S0], b: [S3, S1, S3, S1], n: [S3, S0, S3, S0] },
      team: { a: S0, b: S2, n: S1, aLight: S0, aDark: S1, bLight: S2, bDark: S3, aText: S3, bText: S3 },
      overlay: {
        move: { fill: S1, fill2: S2, edge: S3, inner: S0, pattern: 'checker' },
        attack: { fill: S3, edge: S3, inner: S0, pattern: 'stripes\\' },
        threat: { fill: S2, edge: S2, pattern: 'stripes/' },
        heal: { fill: S1, edge: S3, inner: S0, pattern: 'lattice' },
        path: { core: S0, light: S0, mid: S0, dark: S1, outline: S3, spark: S2 }
      },
      fx: { hot: S3, cold: S2, heal: S1, crit: S3, status: S2, white: S0 },
      text: { main: S3, main2: S3, shadow: S1, outline: S0, dim: DIM, dim2: DIM, accent: S3, select: S3, title: S2, title2: S2,
        label: S2, label2: S2, gold: S2, gold2: S2, plate: S0, pointer: S3, pointerEdge: S0 },
      // numbers: [fill, outline] as shade indices; flash = inversion
      numbers: { damage: [0, 3], crit: [0, 3], heal: [3, 0], mp: [1, 3], miss: [1, 3], status: [2, 0], label: [3, 0] },
      bars: { track: S0, out: S3, tick: S0, charge: S2, haste: S3, slow: S1, ready: S3, queued: S1, enemy: S3, enemyFull: S3, hp: S2, hpLow: S3 },
      cursor: { core: S3, edge: S0 },
      terrain: { grass: S0, forest: S1, water: S1, hill: S1, mountain: S2, road: S1, bridge: S2, fort: S2, sand: S0, wall: S2, floor: S1 }
    };
    var FONT = { type: 'bitmap', height: CH, advance: CW, spacing: CW - GW, space: CW, uppercase: true, sep: '|', glyphs: GL, coverage: 'full',
      note: '8x8 cell, 6x7 capital glyphs with 2 px verticals, fixed 8 px advance, one shade' };

    /* ----- tiles: 16x16 cells built from four 8x8 sub-tiles ----- */
    var SUB = {
      tuft: ['........', '........', '..1.1...', '...1....', '........', '.....1.1', '......1.', '........'],
      tuft2: ['........', '.1......', '1.1.....', '........', '....1...', '...1.1..', '........', '........'],
      flower: ['........', '...0....', '..121...', '...0....', '........', '........', '......1.', '........'],
      tree: ['..3333..', '.311223.', '3111122.', '3111222.', '3112223.', '.32223..', '...33...', '..3333..'],
      wave0: ['........', '........', '.000....', '0..00...', '........', '....222.', '........', '........'],
      wave1: ['........', '........', '...000..', '..0..00.', '........', '222.....', '........', '........'],
      sand: ['........', '.1......', '.....1..', '........', '..1.....', '......1.', '...1....', '........'],
      road: ['11111111', '11211111', '11111121', '11111111', '12111111', '11111211', '11111111', '11121111'],
      brick: ['33333333', '22232222', '11131111', '22232222', '33333333', '22222223', '11111113', '22222223'],
      floor: ['33333333', '31111113', '31000113', '31011113', '31111113', '31111123', '31222223', '33333333'],
      plank: ['33333333', '22223222', '22223222', '22223222', '22223222', '22223222', '22223222', '33333333']
    };
    function sub(g, name, x, y, flip) { var S = SUB[name]; blit(g, S, { 0: S0, 1: S1, 2: S2, 3: S3 }, x, y, flip); }
    function tileArt(g, r, kind, t) {
      var x = Math.round(r.x), y = Math.round(r.y), cx = x >> 4, cy = y >> 4, i, j, h;
      var R = function (X, Y, W, H, c) { g.fillStyle = c; g.fillRect(x + X, y + Y, W, H); };
      switch (kind) {
        case 'forest':
          R(0, 0, 16, 16, S0);
          for (j = 0; j < 2; j++) for (i = 0; i < 2; i++) sub(g, 'tree', x + i * 8, y + j * 8, (i + j + cx) % 2);
          break;
        case 'water':
          R(0, 0, 16, 16, S1); var ph = Math.floor((t || 0) * 2) % 2;
          for (j = 0; j < 2; j++) for (i = 0; i < 2; i++) sub(g, (i + j + ph) % 2 ? 'wave1' : 'wave0', x + i * 8, y + j * 8, false);
          break;
        case 'hill':
          R(0, 0, 16, 16, S0);
          blit(g, ['................', '................', '................', '.....333333.....', '....31100223....', '...3110002223...', '..311000022223..',
            '..310000222223..', '.31100002222223.', '.31000022222223.', '3333333333333333'], { 0: S0, 1: S1, 2: S2, 3: S3 }, x, y + 4, cx % 2);
          break;
        case 'mountain':
          R(0, 0, 16, 16, S0);
          blit(g, ['.......33.......', '......3003......', '.....300123.....', '.....301123.....', '....30111223....', '....30112223....', '...3011122223...',
            '...3011222223...', '..301112222223..', '..311122222233..', '.30111222222233.', '.31112222222223.', '3333333333333333'], { 0: S0, 1: S1, 2: S2, 3: S3 }, x, y + 3, cy % 2);
          break;
        case 'road':
          for (j = 0; j < 2; j++) for (i = 0; i < 2; i++) sub(g, 'road', x + i * 8, y + j * 8, (i + cx) % 2);
          break;
        case 'bridge':
          R(0, 0, 16, 16, S1); for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) sub(g, 'plank', x + i * 8, y + j * 8, false);
          R(0, 0, 16, 1, S3); R(0, 15, 16, 1, S3);
          break;
        case 'fort':
          R(0, 0, 16, 16, S1);
          blit(g, ['3.3.3.3..3.3.3.3', '3333333..3333333', '3000003..3000003', '3011123333011123', '3011122222011123', '3011122222011123', '3011123333011123',
            '3011123..3011123', '3011123333011123', '3011122222011123', '3333333333333333'], { 0: S0, 1: S1, 2: S2, 3: S3 }, x, y + 3, false);
          break;
        case 'sand':
          R(0, 0, 16, 16, S0); for (j = 0; j < 2; j++) for (i = 0; i < 2; i++) sub(g, 'sand', x + i * 8, y + j * 8, (i + j + cx + cy) % 2);
          break;
        case 'wall':
          for (j = 0; j < 2; j++) for (i = 0; i < 2; i++) sub(g, 'brick', x + i * 8, y + j * 8, (j % 2) === 1);
          break;
        case 'floor':
          for (j = 0; j < 2; j++) for (i = 0; i < 2; i++) sub(g, 'floor', x + i * 8, y + j * 8, false);
          break;
        default:   // grass: S0 with one tuft per sub-tile on about half of them
          R(0, 0, 16, 16, S0);
          for (j = 0; j < 2; j++) for (i = 0; i < 2; i++) { h = hh(cx * 2 + i, cy * 2 + j, 3) % 7;
            if (h < 2) sub(g, 'tuft', x + i * 8, y + j * 8, h === 1); else if (h < 4) sub(g, 'tuft2', x + i * 8, y + j * 8, h === 3); else if (h === 4) sub(g, 'flower', x + i * 8, y + j * 8, false); }
      }
    }

    /* ----- props (foot on the cell's bottom edge; may rise one cell) ----- */
    var PROPART = {
      stone: ['................', '................', '................', '................', '.....333333.....', '....30001123....', '...3001112223...',
        '...3011112223...', '..301111222223..', '..311112222233..', '..311122222233..', '..312222222333..', '...3222223333...', '....33333333....', '...2.2.2.2.2.2..', '................'],
      bush: ['................', '................', '................', '................', '................', '.....3333.......', '....300113333...',
        '...30111130113..', '..301111111123..', '..311111111223..', '..311112112223..', '.3311122222233..', '.3122222222233..', '..33333333333...', '...2.2.2.2.2....', '................'],
      tree: ['......3333......', '....33000133....', '...3001111123...', '..300111111123..', '..301111111223..', '.30111111112223.', '.31111111222223.',
        '.31111112222223.', '.31112222222233.', '..311222222233..', '..3322222223333.', '...333333333....', '......323.......', '......323.......', '......323.......', '......323.......',
        '.....32223......', '....3322233.....', '...2.2.2.2.2....', '................'],
      brazier: ['................', '................', '................', '................', '................', '................', '..33333333333...',
        '..30000000003...', '...311111113....', '....3222223.....', '.....33333......', '......323.......', '......323.......', '....3332333.....', '...333.3.333....', '..2.2.2.2.2.2...'],
      lamp: ['......333.......', '.....30003......', '....3000003.....', '....3000003.....', '....3000003.....', '....3333333.....', '......323.......',
        '......323.......', '......323.......', '......323.......', '......323.......', '......323.......', '......323.......', '.....32223......', '....3333333.....', '...2.2.2.2.2....'],
      crystal: ['.......3........', '......303.......', '.....30013......', '.....30113......', '....3001123.....', '....3011123.....', '...300112223....',
        '...301112223....', '...311112223....', '....3112223.....', '....3112223.....', '.....31223......', '....33333333....', '...3111111123...', '...3333333333...', '..2.2.2.2.2.2...']
    };
    var FLAME = [['.....3.3...', '....303.3..', '....30003..', '...3000103.', '...3001103.', '....3111...'], ['....3..3...', '...3.303...', '...30003...', '..3010003..', '..3011003..', '...3111....']];
    function propArt(g, r, kind, t, o) {
      var k = PROPART[kind] ? kind : kind === 'rock' ? 'stone' : 'stone', art = PROPART[k], x = Math.round(r.x), y = Math.round(r.y + r.h) - art.length;
      var flip = o && o.seed != null ? (o.seed % 2 === 1) : false, pal = { 0: S0, 1: S1, 2: S2, 3: S3 };
      if (k === 'brazier' || k === 'lamp' || k === 'crystal') flip = false;
      // shadow row ('2' dots in the last line) is a dither, so it never hides the ground pattern
      blit(g, art, pal, x, y, flip);
      var fr = Math.floor((t || 0) * 6) % 2;
      if (k === 'brazier') {   // 2-frame palette-swap flame and two spark pixels that blink with it
        blit(g, FLAME[fr], pal, x + 3, y + 1, false);
        g.fillStyle = S3; g.fillRect(x + (fr ? 4 : 10), y - 1 - fr, 1, 1);
      } else if (k === 'lamp') {   // the lantern glass inverts on a slow flicker; 4 ray pixels around it
        var dark = Math.floor((t || 0) * 3) % 4 === 0;
        drect(g, x + 5, y + 2, 5, 3, dark ? S1 : S0, 4);
        g.fillStyle = S3; [[2, 3], [12, 3], [7, -2], [3, 0], [11, 0]].forEach(function (p, i) { if ((i + fr) % 2 === 0) g.fillRect(x + p[0], y + p[1], 1, 1); });
      } else if (k === 'crystal') {   // a sparkle cross that steps around the gem
        var sp = [[9, 1], [3, 5], [11, 6], [6, 9]][Math.floor((t || 0) * 4) % 4];
        g.fillStyle = S3; g.fillRect(x + sp[0], y + sp[1] - 1, 1, 3); g.fillRect(x + sp[0] - 1, y + sp[1], 3, 1); g.fillStyle = S0; g.fillRect(x + sp[0], y + sp[1], 1, 1);
      }
    }

    var spec = {
      id: id, name: '4-shade handheld pixel' + (rampKey === 'moss' ? '' : ' (' + RM.name + ')'), pixel: true,
      native: { w: 256, h: 224, scale: 'integer', smoothing: false, snap: 1, minScale: 2, tile: 8,
        note: 'a real handheld screen is 160x144 (20x18 cells of 8 px); the shared scene is 256x224, so the skin draws on that and keeps the 8x8 cell grid' },
      palette: palette,
      fonts: { ui: FONT, num: FONT, label: FONT, plate: FONT, title: FONT,
        rules: { snap: true, smoothing: false, minSize: 8, uppercase: true, lineH: 12, cell: 8, shades: 1, shadow: 'none' } },
      shape: { radius: 0, edgeWidth: 3, padding: 5, clippedCorners: 1, border: 'S3 / S0 / S3 double line', barSegment: 4 },
      frameRoles: ['row', 'backing'],
      atmospherePhases: [],
      layout: { handW: 6, handH: 7, pointerGap: 4, rowFrame: true, rowBand: true },
      overlayStyle: { mode: 'dither', pattern: 'per kind: checker / stripes \\ / stripes / / lattice', edgeWidth: 1, grow: 'every other row below 1/2', pulse: 'S1 -> S2 band walking at 4 Hz', seams: 'none' },
      particles: { shape: 'square', size: [2, 2], count: 0.5, snap: true, blend: 'source-over', glow: 0, gravity: 0.15, drag: 0, life: [150, 350], colors: ['ink', 'paper'], trail: 0, rays: 4, maxOnScreen: 6, flicker: true },
      outline: { text: { width: 0, mode: 'none' }, number: { width: 1, max: 1, drop: 1, mode: 'dilate8', color: 'ink' }, sprite: { width: 1, color: 'ink', mode: 'pixel' } },
      shadow: { text: null, window: null, sprite: { kind: 'dither-row', alpha: 1, color: 'ui.disabled', note: 'a dotted S2 row under the feet, never alpha' } },
      motion: { stepMs: 1000 / 30, snap: true, ease: { move: 'linear', pop: 'snap', fade: 'linear' }, fadeSteps: [1, 0.75, 0.5, 0.25], shakeInt: true, flashMax: 1,
        flashMode: 'invert', fadeMode: 'palette fade toward S0, last step flickers', blinkMs: 125, alpha: 'never: alpha -> palette fade, dither or flicker', squash: null },

      tile: function (g, r, kind, t) {
        if (r.w === 16 && r.h === 16) { tileArt(g, r, kind, t); return; }
        var c = API.canvas(16, 16), cg = c.getContext('2d'); tileArt(cg, { x: 0, y: 0, w: 16, h: 16 }, kind, t);
        var pv = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false; g.drawImage(c, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)); g.imageSmoothingEnabled = pv;
      },
      prop: function (g, r, kind, t, o) { var A = takeAlpha(g, 1); if (A.L > 0) propArt(g, r, kind, t, o || {}); g.globalAlpha = A.pa; },
      atmosphere: function () {},

      // unitToken: 16x16, 4 shades, feet on the rect's bottom; selected hops 1 px at 2 Hz; dead FLICKERS (shown every other 1/30 s)
      unitToken: function (g, r, u, t) {
        u = u || {}; var kind = SPR[u.kind] ? u.kind : u.kind === 'lord' ? 'knight' : 'fighter', team = u.team || 'a';
        var pal = team === 'b' ? { o: S3, b: S2, d: S3, f: S1, e: S3, w: S2, l: S0 } : team === 'n' ? { o: S3, b: S1, d: S2, f: S0, e: S3, w: S2, l: S0 } : { o: S3, b: S0, d: S1, f: S0, e: S3, w: S2, l: S0 };
        if (kind === 'monster') pal.l = S0;
        var A = takeAlpha(g, 1), tt = t || 0;
        if (u.dead && Math.floor(tt * 30) % 2) { g.globalAlpha = A.pa; return; }
        var x = Math.round(r.x + (r.w - 16) / 2), y = Math.round(r.y + r.h - 16);
        var hop = u.selected && !u.dead ? Math.floor(tt * 2) % 2 : 0;
        if (!u.noShadow) { g.fillStyle = S2; for (var i = 3; i < 13; i += 2) g.fillRect(x + i + ((y >> 0) & 1), y + 15, 1, 1); }
        blit(g, SPR[kind], pal, x, y - hop, u.facing === -1);
        g.globalAlpha = A.pa;
      },

      measure: function (str, o) { o = o || {}; return strW(str, Math.max(1, Math.round(o.scale || 1))); },

      // text: one shade per glyph; color2 ignored; alpha -> dither; outline = 8-neighbour ring in S0 (or the given token)
      text: function (g, str, x, y, o) {
        o = o || {}; var s = up(str), sc = Math.max(1, Math.round(o.scale || 1)), w = strW(s, sc);
        if (o.align === 'center') x -= Math.floor(w / 2); else if (o.align === 'right') x -= w;
        x = Math.round(x); y = Math.round(y);
        var col = API.token(this, o.color) || palette.text.main, ol = o.outline ? (o.outline === true ? palette.text.outline : API.token(this, o.outline)) : null;
        var A = takeAlpha(g, o.alpha), dimmed = col === DIM;
        // disabled = every glyph pixel kept, alternating S1 / S2 in a checker: the shape stays whole but reads greyed out, apart from solid S2 titles
        if (A.L > 0) {
          var pass = function (c, kind) { var cx = x; for (var i = 0; i < s.length; i++) { if (s[i] !== ' ') { var G = glyphPx(s[i], sc, kind === 'ol' ? 1 : 0, 0); if (kind === 'fill' && dimmed) { plot(g, G.fill, cx, y, S1, A.L); plot(g, G.fill, cx, y, S2, Math.min(A.L, 2)); } else plot(g, kind === 'ol' ? G.ol : G.fill, cx, y, c, A.L); } cx += CW * sc; } };
          if (ol) pass(ol, 'ol');
          pass(col, 'fill');
        }
        g.globalAlpha = A.pa; return w;
      },

      // frame: window = S3 outer (corners cut) / S0 or S1 gap / S3 inner line / flat body; plate = inverted (S3 body);
      // row = S1 band with S3 end caps; backing = S1 well with an S3 line; alpha -> dither
      frame: function (g, r, st) {
        st = st || {}; var x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h), role = st.role || 'window';
        var C = palette.windows[st.team] || palette.windows[role === 'plate' ? 'n' : 'a'], A = takeAlpha(g, st.alpha), L = A.L;
        if (L > 0 && w > 1 && h > 1) {
          if (role === 'row') {
            drect(g, x, y, w, h, S1, L);   // a flat S1 band: no caps, so notes at the row's right end stay clear
          } else if (role === 'backing') {
            drect(g, x, y, w, h, S1, L); drect(g, x, y + h - 1, w, 1, S3, L);
            if (h > 14) { drect(g, x, y, w, 1, S3, L); drect(g, x, y, 1, h, S3, L); drect(g, x + w - 1, y, 1, h, S3, L); }
          } else if (role === 'plate' || role === 'tooltip' || w < 10 || h < 10) {
            var inv = role === 'plate', body = inv ? (st.alert ? S2 : S3) : C[3];
            drect(g, x + 1, y, w - 2, 1, S3, L); drect(g, x + 1, y + h - 1, w - 2, 1, S3, L); drect(g, x, y + 1, 1, h - 2, S3, L); drect(g, x + w - 1, y + 1, 1, h - 2, S3, L);
            drect(g, x + 1, y + 1, w - 2, h - 2, body, L);
            if (inv && h >= 8) { drect(g, x + 2, y + 2, w - 4, 1, S2, L); }
            if (!inv && (st.alert || st.focus)) drect(g, x + 1, y + 1, w - 2, 1, S2, L);
          } else {
            var line = st.disabled ? S2 : S3, body2 = st.alert ? S1 : C[3];
            drect(g, x + 1, y, w - 2, 1, C[0], L); drect(g, x + 1, y + h - 1, w - 2, 1, C[0], L); drect(g, x, y + 1, 1, h - 2, C[0], L); drect(g, x + w - 1, y + 1, 1, h - 2, C[0], L);
            drect(g, x + 1, y + 1, w - 2, h - 2, C[1], L);
            drect(g, x + 2, y + 2, w - 4, 1, line, L); drect(g, x + 2, y + h - 3, w - 4, 1, line, L); drect(g, x + 2, y + 2, 1, h - 4, line, L); drect(g, x + w - 3, y + 2, 1, h - 4, line, L);
            drect(g, x + 3, y + 3, w - 6, h - 6, body2, L);
            if (st.focus) { drect(g, x + 3, y + 3, w - 6, 1, S1, L); }
            if (role === 'banner') { drect(g, x + 3, y + 4, w - 6, 1, S2, L); drect(g, x + 3, y + h - 5, w - 6, 1, S2, L); }
            if (st.team === 'b' && w >= 24) {   // foe windows: a dotted S2 rule under the top line, so they read apart without hue
              for (var q = x + 4; q < x + w - 4; q += 2) drect(g, q, y + 4, 1, 1, S2, L);
            }
          }
        }
        g.globalAlpha = A.pa;
        var pad = role === 'row' || role === 'backing' ? 0 : role === 'plate' || role === 'tooltip' ? 3 : this.shape.padding;
        return { x: x + pad, y: y + pad, w: w - 2 * pad, h: h - 2 * pad };
      },

      // number: glyphs = str, then suffix, then label (canonical order). [fill, outline] shade pairs per kind; flash = inversion;
      // alpha -> palette fade toward S0 (each step lightens every shade by one), the last step flickers on the pop's age
      number: function (g, str, x, y, o) {
        o = o || {}; var s = up(str), kind = o.kind || 'damage', base = Math.max(1, Math.round(o.scale || 1));
        var sc = kind === 'crit' && o.big ? base * 2 : base, ow = o.outline == null ? 1 : Math.max(0, Math.min(1, +o.outline)), out = [];
        var pair = palette.numbers[kind] || palette.numbers.damage, labPair = palette.numbers.label;
        var items = [], cx = 0, i, nh = GH * sc;
        for (i = 0; i < s.length; i++) { items.push({ ch: s[i], x: cx, y: 0, s: sc }); cx += NA * sc; }
        var nw = cx - (NA - GW) * sc;
        if (o.suffix) { cx = nw + 2 * base; var sf = up(o.suffix); for (i = 0; i < sf.length; i++) { items.push({ ch: sf[i], x: cx, y: nh - GH * base, s: base, suf: 1 }); cx += NA * base; } nw = cx - (NA - GW) * base; }
        var labItems = [];
        if (o.label) {
          var lb = up(o.label), lw = lb.length * NA - (NA - GW), lx = Math.round((nw - lw) / 2), gap = o.labelGap == null ? 3 : o.labelGap;
          for (i = 0; i < lb.length; i++) labItems.push({ ch: lb[i], x: lx + i * NA, y: -GH - gap - 1, s: 1, lab: 1 });
        }
        var x0 = o.align === 'center' ? Math.round(x - nw / 2) : Math.round(x), y0 = Math.round(o.baseline === 'bottom' ? y - nh : y);
        var A = takeAlpha(g, 1), all = items.concat(labItems), age = o.age || 0, flick = Math.floor(age / (1000 / 30)) % 2;
        var plan = all.map(function (it, k) {
          var d = (o.glyphOffset && o.glyphOffset(k, it)) || {};
          var a = A.pa * (d.alpha != null ? d.alpha : o.alpha != null ? o.alpha : 1), L = lvl(a), fade = 4 - L;
          var pr = it.lab ? labPair : pair; if (d.flash) pr = [pr[1], pr[0]];
          var lo = Math.min(pr[0], pr[1]), hi = Math.max(pr[0], pr[1]), hi2 = Math.max(lo + 1, hi - fade);   // the darker member fades toward the lighter
          var fi = pr[0] === hi ? hi2 : pr[0], oi = pr[1] === hi ? hi2 : pr[1];
          var skip = d.skip || it.ch === ' ' || L <= 0 || (L === 1 && flick);
          return { it: it, d: d, G: skip ? null : glyphPx(it.ch, it.s, ow, ow ? 1 : 0), fc: shade(fi), oc: shade(oi) };
        });
        ['ol', 'fill'].forEach(function (pass) {
          plan.forEach(function (p) {
            if (!p.G) return; var gx = Math.round(x0 + p.it.x + (p.d.dx || 0)), gy = Math.round(y0 + p.it.y + (p.d.dy || 0));
            plot(g, p.G[pass], gx, gy, pass === 'ol' ? p.oc : p.fc, 4);
            if (pass === 'fill') out.push({ x: gx, y: gy, w: p.G.w, h: p.G.h, ch: p.it.ch });
          });
        });
        g.globalAlpha = A.pa; return out;
      },

      // overlay: one pattern per kind (checker / \ stripes / / stripes / lattice) + a boundary that differs per kind
      overlay: function (g, r, kind, t, o) {
        o = o || {}; var C = palette.overlay[kind] || palette.overlay.move, gr = o.grow == null ? 1 : o.grow;
        if (!(gr > 0)) return;
        var A = takeAlpha(g, 1); if (A.L <= 0) { g.globalAlpha = A.pa; return; }
        var tx = o.tile ? o.tile.x : 0, ty = o.tile ? o.tile.y : 0, x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
        var ts = Math.floor((t || 0) * 4), half = gr < 0.5, col = C.fill;
        if (kind === 'move' && o.pattern === 'pulsing' && ((tx + ty + 64 - ts % 8) % 8) < 2) col = C.fill2;   // an S2 band walks across the set
        var pat = C.pattern;
        g.fillStyle = col;
        for (var j = 0; j < h; j++) {
          var Y = y + j; if (half && (Y & 1)) continue;
          for (var i = 0; i < w; i++) {
            var X = x + i, hit;
            if (pat === 'stripes\\') hit = ((X - Y) % 4 + 4) % 4 === 0 || ((X - Y) % 4 + 4) % 4 === 1;
            else if (pat === 'stripes/') hit = ((X + Y) & 3) === 0;
            else if (pat === 'lattice') hit = (X & 3) === 1 || (Y & 3) === 1;
            else hit = ((X + Y) & 1) === 0;
            if (hit) g.fillRect(X, Y, 1, 1);
          }
        }
        if (gr >= 0.5) {
          var E = o.edges || {}, ec = C.edge, ic = C.inner;
          var edge = function (ax, ay, len, horiz) {   // solid (move, heal), dashed 2/2 (attack) or dotted (threat)
            for (var k = 0; k < len; k++) {
              var px = horiz ? ax + k : ax, py = horiz ? ay : ay + k, pos = horiz ? px : py;
              if (kind === 'attack' && (pos & 3) >= 2) continue;
              if (kind === 'threat' && (pos & 1)) continue;
              g.fillStyle = ec; g.fillRect(px, py, 1, 1);
            }
          };
          if (E.top) edge(x, y, w, true); if (E.bottom) edge(x, y + h - 1, w, true);
          if (E.left) edge(x, y, h, false); if (E.right) edge(x + w - 1, y, h, false);
          if (ic && kind !== 'threat') {   // an S0 line just inside the boundary, so the edge reads on dark ground too
            g.fillStyle = ic;
            if (E.top) g.fillRect(x + (E.left ? 1 : 0), y + 1, w - (E.left ? 1 : 0) - (E.right ? 1 : 0), 1);
            if (E.bottom) g.fillRect(x + (E.left ? 1 : 0), y + h - 2, w - (E.left ? 1 : 0) - (E.right ? 1 : 0), 1);
            if (E.left) g.fillRect(x + 1, y + (E.top ? 1 : 0), 1, h - (E.top ? 1 : 0) - (E.bottom ? 1 : 0));
            if (E.right) g.fillRect(x + w - 2, y + (E.top ? 1 : 0), 1, h - (E.top ? 1 : 0) - (E.bottom ? 1 : 0));
          }
        }
        g.globalAlpha = A.pa;
      },

      // bar: S3 slot outline, S0 track; meter = S2 fill (S3 + S2 stripes when low); gauge = 4 px segments, kinds told apart by pattern
      bar: function (g, r, fr, kind, o) {
        o = o || {}; var B = palette.bars, x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h), A = takeAlpha(g, 1), L = A.L;
        var meter = o.style === 'meter' || kind === 'hp' || kind === 'hpLow';
        drect(g, x, y, w, h, B.out, L); drect(g, x + 1, y + 1, w - 2, h - 2, B.track, L);
        var iw = w - 2, ih = h - 2;
        if (!kind || !(fr > 0) && o.px == null) { g.globalAlpha = A.pa; return; }
        var fw = o.px != null ? Math.max(0, Math.min(iw, Math.round(o.px))) : Math.round(Math.max(0, Math.min(1, fr)) * iw);
        if (!meter) fw = fw >= iw ? iw : fw - (fw % 2);
        var c = B[kind] || B.charge, X0 = x + 1, Y0 = y + 1;
        if (kind === 'hpLow' || kind === 'enemy') { for (var jy = 0; jy < ih; jy++) for (var jx = 0; jx < fw; jx++) { g.fillStyle = ((X0 + jx + Y0 + jy) & 3) < 2 ? S3 : S2; g.fillRect(X0 + jx, Y0 + jy, 1, 1); } }
        else if (kind === 'slow') { for (var ky = 0; ky < ih; ky++) for (var kx = 0; kx < fw; kx++) { g.fillStyle = ((X0 + kx + Y0 + ky) & 1) ? S2 : S1; g.fillRect(X0 + kx, Y0 + ky, 1, 1); } }
        else drect(g, X0, Y0, fw, ih, c, L);
        if (!meter && ih >= 3) for (var s = 4; s < fw; s += 4) drect(g, X0 + s, Y0, 1, ih, B.tick, L);
        if (meter && ih >= 3 && fw > 0) drect(g, X0 + fw, Y0, 1, ih, S3, L);   // a hard S3 end cap on the fill
        if (o.tag && B[o.tag]) { drect(g, X0, Y0, 3, ih, B[o.tag], L); drect(g, X0 + 3, Y0, 1, ih, B.out, L); }
        g.globalAlpha = A.pa;
      },

      // cursor: hand = a solid S3 arrowhead with an S0 rim (hollow when invalid); bracket = four S3 corner Ls with an S0 rim that
      // INVERT at 4 Hz (S0 arms, S3 rim) and step 1 px in and out; alpha -> dither
      cursor: function (g, r, kind, t, o) {
        o = o || {}; var A = takeAlpha(g, o.alpha), L = A.L, ph = Math.floor((t || 0) * 4) % 2;
        if (L > 0 && kind === 'hand') {
          var F = ['#.....', '###...', '#####.', '######', '#####.', '###...', '#.....'], hx = Math.round(r.x + r.w) - 6, hy = Math.round(r.y + r.h / 2) - 3;
          var inF = function (X, Y) { return Y >= 0 && Y < 7 && X >= 0 && X < 6 && F[Y][X] === '#'; };
          for (var yy = -1; yy < 8; yy++) for (var xx = -1; xx < 7; xx++) {
            if (inF(xx, yy)) { var edgeIn = !inF(xx - 1, yy) || !inF(xx + 1, yy) || !inF(xx, yy - 1) || !inF(xx, yy + 1); drect(g, hx + xx, hy + yy, 1, 1, o.invalid && !edgeIn ? S0 : S3, L); }
            else if (inF(xx - 1, yy) || inF(xx + 1, yy) || inF(xx, yy - 1) || inF(xx, yy + 1)) drect(g, hx + xx, hy + yy, 1, 1, S0, L);
          }
        } else if (L > 0) {
          var b = ph ? 0 : -1, x0 = Math.round(r.x) + b, y0 = Math.round(r.y) + b, x1 = Math.round(r.x + r.w) - 1 - b, y1 = Math.round(r.y + r.h) - 1 - b, arm = 5;
          var core = ph ? S0 : S3, rim = ph ? S3 : S0;
          var cs = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]];
          var arms = function (c, grow, col) {
            var hx2 = c[2] > 0 ? c[0] : c[0] - arm + 1, vy = c[3] > 0 ? c[1] : c[1] - arm + 1, hy2 = c[3] > 0 ? c[1] : c[1] - 1, vx = c[2] > 0 ? c[0] : c[0] - 1;
            if (o.invalid && !grow) { for (var q = 0; q < arm; q += 2) { drect(g, hx2 + q, hy2, 1, 2, col, L); drect(g, vx, vy + q, 2, 1, col, L); } return; }
            drect(g, hx2 - grow, hy2 - grow, arm + 2 * grow, 2 + 2 * grow, col, L); drect(g, vx - grow, vy - grow, 2 + 2 * grow, arm + 2 * grow, col, L);
          };
          cs.forEach(function (c) { arms(c, 1, rim); });
          cs.forEach(function (c) { arms(c, 0, core); });
        }
        g.globalAlpha = A.pa;
      },

      // path: S0 road, S3 outline, S2 dashes marching toward the head (8 Hz), S3 start pad; invalid = checker core; alpha -> dither
      path: function (g, pts, t, o) {
        o = o || {}; if (!pts || pts.length < 2) return;
        var A = takeAlpha(g, o.alpha == null ? 1 : o.alpha), L = A.L; if (L <= 0) { g.globalAlpha = A.pa; return; }
        var P = pts.map(function (p) { return [Math.round(p.x), Math.round(p.y)]; });
        var n = P.length, dx = Math.sign(P[n - 1][0] - P[n - 2][0]), dy = Math.sign(P[n - 1][1] - P[n - 2][1]);
        var end = [P[n - 1][0] - dx * 2, P[n - 1][1] - dy * 2], segs = [];
        for (var i = 0; i < n - 1; i++) segs.push([P[i], i === n - 2 ? end : P[i + 1]]);
        var thick = function (a, b, lo, hi, c) { drect(g, Math.min(a[0], b[0]) - lo, Math.min(a[1], b[1]) - lo, Math.abs(a[0] - b[0]) + lo + hi, Math.abs(a[1] - b[1]) + lo + hi, c, L); };
        var head = function (c, grow) {   // triangle: base 12 px across, 6 px long, tip past the tile centre
          for (var k = -grow; k <= 6 + grow; k++) { var hw = 6 + grow - Math.max(0, k); for (var s2 = -hw; s2 < hw; s2++) drect(g, end[0] + dx * k + (dy ? s2 : 0), end[1] + dy * k + (dx ? s2 : 0), 1, 1, c, L); }
        };
        var s0 = P[0];
        segs.forEach(function (sg) { thick(sg[0], sg[1], 3, 3, S3); });
        drect(g, s0[0] - 4, s0[1] - 4, 8, 8, S3, L); head(S3, 1);
        segs.forEach(function (sg) { thick(sg[0], sg[1], 2, 2, S0); });
        drect(g, s0[0] - 2, s0[1] - 2, 4, 4, S0, L); drect(g, s0[0] - 1, s0[1] - 1, 2, 2, S3, L); head(S0, 0);
        if (o.invalid) segs.forEach(function (sg) { var a = sg[0], b = sg[1]; for (var yy = Math.min(a[1], b[1]) - 2; yy < Math.max(a[1], b[1]) + 2; yy++) for (var xx = Math.min(a[0], b[0]) - 2; xx < Math.max(a[0], b[0]) + 2; xx++) if ((xx + yy) & 1) drect(g, xx, yy, 1, 1, S2, L); });
        // marching dashes: 2x2 S2 blocks every 6 px along the centre line, shifted one step per 1/8 s
        var line = []; segs.forEach(function (sg) { var a = sg[0], b = sg[1], len = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])), ux = Math.sign(b[0] - a[0]), uy = Math.sign(b[1] - a[1]);
          for (var q = 0; q < len; q++) line.push([a[0] + ux * q, a[1] + uy * q]); });
        var sh = Math.floor((t || 0) * 8) % 3;
        for (var m = 6; m < line.length - 4; m++) if ((m - sh * 2) % 6 === 0) drect(g, line[m][0] - 1, line[m][1] - 1, 2, 2, S2, L);
        g.globalAlpha = A.pa;
      }
    };
    var SK = API.register(spec);

    /* ---------- extras (feature-tested by hosts) ---------- */
    SK.shades = SH.slice();
    SK.rampName = RM.name;
    SK.masterPalette = function () { return SH.slice(); };
    // dither(ctx, rect, shade index 0..3 or token, alpha): the skin's replacement for a translucent fill
    SK.dither = function (g, r, col, a) { var A = takeAlpha(g, a); drect(g, r.x, r.y, r.w, r.h, typeof col === 'number' ? shade(col) : API.token(SK, col), A.L); g.globalAlpha = A.pa; };
    SK.letterWidth = function (s) { return strW(s, 1); };
    // post(ctx, {scale, grid, ghost, ghostAmount}): screen effects for the DISPLAY canvas, after the integer upscale.
    //   ghost: an earlier frame (canvas of the same size) laid over at ghostAmount (default 0.35): moving things leave a trail,
    //          still things are unchanged (LCD response lag). grid: 1 device-px lines between native pixels in a lightened S0
    //          (needs scale >= 3). Both are opt-in; they are the only place this skin blends.
    SK.post = function (g, o) {
      o = o || {}; var cv = g.canvas, k = Math.max(1, Math.round(o.scale || 1));
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      if (o.ghost) { g.globalAlpha = o.ghostAmount == null ? 0.35 : o.ghostAmount; g.imageSmoothingEnabled = false; g.drawImage(o.ghost, 0, 0); g.globalAlpha = 1; }
      if (o.grid && k >= 3) {
        var gc = API.color.mix(S0, '#ffffff', 0.35); g.globalAlpha = o.gridAlpha == null ? 0.28 : o.gridAlpha; g.fillStyle = gc;
        for (var x = 0; x < cv.width; x += k) g.fillRect(x, 0, 1, cv.height);
        for (var y = 0; y < cv.height; y += k) g.fillRect(0, y, cv.width, 1);
      }
      g.restore();
    };
    return SK;
  }

  var MAIN = make('handheld4', 'moss');
  var SEP = make('handheld4-sepia', 'sepia');
  var GRY = make('handheld4-grey', 'grey');
  MAIN.variants = { moss: 'handheld4', sepia: 'handheld4-sepia', grey: 'handheld4-grey' };
  SEP.variants = GRY.variants = MAIN.variants;
  MAIN.ramps = RAMPS;
})(typeof window !== 'undefined' ? window : this);
