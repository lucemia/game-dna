/* GameDNA skin 'pixel16' · 16-bit console pixel (the current default look) · needs skin-api.js first
 *
 * Reproduces, pixel for pixel, what the v1 modules draw today:
 *   frame role 'window'  = grid-range-path frame() (team a / b / n)      frame role 'plate' = active-time-battle mode plate
 *   text font 'ui'       = grid-range-path 5x7 mono font (2-tone + drop) text font 'plate' = active-time-battle 5x7 font
 *   number / glyph       = damage-numbers 7x10 digits, 5x7 letters, bold words (dilated outline + 4-tone ramp)
 *   overlay              = grid-range-path tile overlay (color-composite tint, pulse, seams, edges)
 *   bar style 'gauge'    = active-time-battle gauge bar                  bar style 'meter' = grid-range-path HP bar
 *   cursor 'bracket'/'hand' = grid-range-path cursor and menu pointer
 * skins/test.html checks each of these against the real modules (0 differing pixels).
 */
(function (root) {
  'use strict';
  var API = root.GameDNA_Skin;
  if (!API) { if (root.console) console.error('pixel16.js: load skin-api.js first'); return; }

  /* ---------- glyph tables (copied from the modules) ---------- */
  // grid-range-path: 5x7, '1' = ink, rows separated by ','; fixed 6 px advance (space 4 px when drawn)
  var GLYPH_UI = {
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
    '.': '00000,00000,00000,00000,00000,01100,01100', '?': '01110,10001,00001,00010,00100,00000,00100', ' ': '000,000,000,000,000,000,000'
  };
  // active-time-battle: 5x7 as 35-char strings, proportional (1 and I are 4 wide, '.' is 3)
  var GLYPH_PLATE = {
    A: '01110100011000111111100011000110001', C: '01110100011000010000100001000101110', E: '11111100001000011110100001000011111',
    I: '11100010000100001000010000100011100', T: '11111001000010000100001000010000100', V: '10001100011000110001100010101000100',
    W: '10001100011000110101101011101110001', '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110',
    '2': '01110100010000100010001000100011111', '5': '11111100001111000001000011000101110', '7': '11111000010001000100010000100001000',
    '.': '00000000000000000000000000000000100', 'x': '00000000001000101010001000101010001', ' ': '00000000000000000000000000000000000'
  };
  // damage-numbers: 7x10 digits (2 px strokes) and 5x7 letters; words use the bold (1 px widened) letters
  var DIGITS = {
    0: '.#####.|##...##|##...##|##..###|##.#.##|###..##|##...##|##...##|##...##|.#####.', 1: '...##..|..###..|.####..|...##..|...##..|...##..|...##..|...##..|...##..|.######',
    2: '.#####.|##...##|.....##|.....##|...###.|..##...|.##....|##.....|##.....|#######', 3: '.#####.|##...##|.....##|.....##|..####.|.....##|.....##|.....##|##...##|.#####.',
    4: '....##.|...###.|..####.|.##.##.|##..##.|##..##.|#######|....##.|....##.|....##.', 5: '#######|##.....|##.....|######.|.....##|.....##|.....##|.....##|##...##|.#####.',
    6: '..####.|.##....|##.....|##.....|######.|##...##|##...##|##...##|##...##|.#####.', 7: '#######|##...##|.....##|....##.|....##.|...##..|...##..|..##...|..##...|..##...',
    8: '.#####.|##...##|##...##|##...##|.#####.|##...##|##...##|##...##|##...##|.#####.', 9: '.#####.|##...##|##...##|##...##|##...##|.######|.....##|.....##|....##.|.####..',
    '+': '......|......|..##..|..##..|######|######|..##..|..##..|......|......'
  };
  var LETTERS = {
    A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.', C: '.###.|#...#|#....|#....|#....|#...#|.###.',
    D: '####.|#...#|#...#|#...#|#...#|#...#|####.', E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
    G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#', I: '###|.#.|.#.|.#.|.#.|.#.|###',
    J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..', K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
    M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#', O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
    P: '####.|#...#|#...#|####.|#....|#....|#....', Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..', U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
    V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..', W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####', ' ': '...|...|...|...|...|...|...',
    '!': '#|#|#|#|#|.|#', '-': '....|....|....|####|....|....|....', '?': '.###.|#...#|....#|...#.|..#..|.....|..#..'
  };
  var D10 = {}, L7 = {}, BOLD = {}, k;
  for (k in DIGITS) D10[k] = DIGITS[k].split('|');
  for (k in LETTERS) L7[k] = LETTERS[k].split('|');
  function letterRows(ch) { return L7[ch] || L7['?']; }
  function boldRows(ch) {
    if (BOLD[ch]) return BOLD[ch];
    return (BOLD[ch] = letterRows(ch).map(function (r) { var o = ''; for (var i = 0; i <= r.length; i++) o += r[i] === '#' || r[i - 1] === '#' ? '#' : '.'; return o; }));
  }
  function rowsOf(font, ch) { return font === 'digit' ? D10[ch] : font === 'bold' ? boldRows(ch) : letterRows(ch); }

  /* ---------- palette ---------- */
  var palette = {
    ink: '#06061a', paper: '#f4f6ff',
    ui: {
      fill: '#4c5a8a', fillTo: '#262e4e', edge: '#06061a', highlight: '#c8d4f4', shadow: '#0a0e22',
      select: 'rgba(255,255,255,0.2)', well: 'rgba(6,8,30,0.4)', rivet: '#ffe070', rivetShade: '#7a5410',
      plate: '#1c2458', plateLight: '#5a6ac0', plateAlert: '#3a2a6a', plateAlertLight: '#8a72d8', plateEdge: '#0a0c24'
    },
    // window ramps per team: 4 fill bands top->bottom, bevel light, bevel dark (grid-range-path WTH)
    windows: {
      a: ['#3a64d8', '#2c50b8', '#223e96', '#1a2e74', '#a8c8ff', '#0a1238'],
      b: ['#d85a48', '#b8402e', '#922c26', '#6a1c1e', '#ffc8b8', '#2a0608'],
      n: ['#4c5a8a', '#3e4a76', '#323c62', '#262e4e', '#c8d4f4', '#0a0e22']
    },
    team: { a: '#3a64d8', b: '#d85a48', n: '#4c5a8a', aLight: '#c8dcff', aDark: '#94b4f0', bLight: '#ffd8cc', bDark: '#f0a898', aText: '#d0e0ff', bText: '#ffd8cc' },
    overlay: {
      move: { fill: '#3064f0', edge: '#d6e8ff' }, attack: { fill: '#e43430', edge: '#ffd6c8' },
      threat: { fill: '#a830c8', edge: '#f0d0ff' }, heal: { fill: '#30c060', edge: '#d0ffd8' },
      path: { core: '#fff6d0', light: '#ffe486', mid: '#f0a830', dark: '#c06a14', outline: '#3a1206', spark: '#ffffff' }
    },
    fx: { hot: '#ff7a3a', cold: '#6ad8f0', heal: '#4ad870', crit: '#ffb43a', status: '#b878f8', white: '#ffffff' },
    text: {
      main: '#ffffff', main2: '#c8d4ff', shadow: '#0a0c24', outline: '#120a1e', dim: '#8088a8', dim2: '#626a88',
      accent: '#ffe070', select: '#fff4c0', title: '#fff4c8', title2: '#e8c870', label: '#b8d0ff', label2: '#8ca8e8',
      gold: '#ffe890', gold2: '#e8c048', plate: '#e8ecff', plateShadow: '#0a0c30', pointer: '#fff8e8', pointerEdge: '#1a0e08'
    },
    cursor: { light: '#fff6c0', base: '#f0b830', badLight: '#ffc0b0', bad: '#e84838', edge: '#24100a' },
    // 4-tone ramps [edge light, light, base, dark]
    ramps: {
      numbers: {
        classic: { dmg: ['#ffffff', '#f4f6ff', '#b8c4f0', '#7a86c0'], crit: ['#ffffff', '#fff2a0', '#ffb43a', '#c0601a'], heal: ['#f0fff0', '#b8ffc0', '#4ad870', '#22904a'],
          miss: ['#ffffff', '#e4e4ec', '#a8a8bc', '#6e6e84'], mp: ['#ffffff', '#c8eeff', '#4aa8ff', '#2060c0'], status: ['#ffffff', '#f0d4ff', '#b878f8', '#7038b0'], ol: '#120a1e' },
        warm: { dmg: ['#ffffff', '#fff0d0', '#ffa860', '#c0582a'], crit: ['#ffffff', '#ffd0d0', '#ff4a4a', '#a01830'], heal: ['#ffffff', '#e8ffb0', '#9ce040', '#4c8a18'],
          miss: ['#ffffff', '#ece4dc', '#b0a49a', '#706460'], mp: ['#ffffff', '#c8fff4', '#38d0c8', '#1a7a88'], status: ['#ffffff', '#ffd8f0', '#f070c0', '#982870'], ol: '#1e0a0a' },
        contrast: { dmg: ['#ffffff', '#ffffff', '#ffffff', '#c8c8d0'], crit: ['#ffffff', '#ffff60', '#ffff00', '#d0b000'], heal: ['#ffffff', '#90ff90', '#30ff70', '#10b040'],
          miss: ['#ffffff', '#d8d8d8', '#c0c0c0', '#909090'], mp: ['#ffffff', '#90e8ff', '#40c8ff', '#2080d0'], status: ['#ffffff', '#ff98ff', '#ff60ff', '#b030b0'], ol: '#000000' },
        flash: ['#ffffff', '#ffffff', '#ffffff', '#e8e8ff']
      },
      gauge: {
        out: '#0a0c24', empty: '#1a1c3e', emptyTop: '#0e1030', dot: '#3a3e66',
        charge: ['#fff8c8', '#f6c840', '#c08a18', '#7a5410'], haste: ['#f0ffd0', '#a8f060', '#5aa82a', '#2a5a14'],
        slow: ['#f0e0ff', '#b08af0', '#6a4ab8', '#34206a'], ready: ['#ffffff', '#ffffff', '#e8ecff', '#a8b4f0'],
        queued: ['#e0fbff', '#6ad8f0', '#2a8ab8', '#144a6a'], enemy: ['#ffd8d0', '#f05a50', '#b42a3a', '#6a1424'],
        enemyFull: ['#fffbe0', '#ffe868', '#ffc030', '#b07818']
      },
      meter: { out: '#06040e', track: '#2a1e36', hp: '#7ce060', hpTop: '#d8ffb8', hpLow: '#f05848', hpLowTop: '#ffb0a0' }
    }
  };

  /* ---------- text ---------- */
  function uiW(s) { return String(s).length * 6 - 1; }   // grid-range-path textW (space counts 6 here, drawn 4)
  function uiText(g, s, x, y, c1, c2, sh) {
    for (var pass = sh === false ? 1 : 0; pass < 2; pass++) {
      var cx = x, str = String(s).toUpperCase();
      for (var i = 0; i < str.length; i++) {
        var ch = str[i], rows = (GLYPH_UI[ch] || GLYPH_UI['?']).split(',');
        for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < rows[ry].length; rx++) if (rows[ry][rx] === '1') {
          g.fillStyle = pass ? (ry < 4 ? (c1 || '#ffffff') : (c2 || '#c8d4ff')) : (sh || '#0a0c24');
          g.fillRect(cx + rx + (pass ? 0 : 1), y + ry + (pass ? 0 : 1), 1, 1);
        }
        cx += ch === ' ' ? 4 : 6;
      }
    }
  }
  // full coverage: characters outside the A-01 set (ACEITVW 0125 7 . x) come from the ui font's 5x7 glyphs, upper-cased,
  // drawn in the plate's single colour; strings inside the A-01 set draw exactly as before
  var PLATE_FB = {};
  function plateGlyph(ch) {
    if (GLYPH_PLATE[ch]) return GLYPH_PLATE[ch];
    if (PLATE_FB[ch]) return PLATE_FB[ch];
    var rows = (GLYPH_UI[String(ch).toUpperCase()] || GLYPH_UI['?']).split(','), o = '';
    for (var r = 0; r < 7; r++) o += (rows[r] + '00000').slice(0, 5);
    return (PLATE_FB[ch] = o);
  }
  function plateGlyphW(ch) { if (ch === '1' || ch === 'I') return 4; if (ch === '.') return 3; return 5; }
  function plateW(s) { var w = 0; for (var i = 0; i < s.length; i++) w += (s[i] === ' ' ? 3 : plateGlyphW(s[i])) + 1; return Math.max(0, w - 1); }
  function plateText(g, s, x, y, col, sh) {
    [[1, sh], [0, col]].forEach(function (p) {
      if (!p[1]) return; var cx = x; g.fillStyle = p[1];
      for (var i = 0; i < s.length; i++) {
        var ch = s[i], b = plateGlyph(ch); if (ch === ' ') { cx += 4; continue; }
        for (var q = 0; q < 35; q++) if (b && b[q] === '1') { var gx = q % 5, gy = (q / 5) | 0; if ((ch === '1' || ch === 'I') && gx > 3) continue; if (ch === '.' && gx > 2) continue; g.fillRect(cx + gx + p[0], y + gy + p[0], 1, 1); }
        cx += plateGlyphW(ch) + 1;
      }
    });
  }
  function letterW(s) { var w = 0; for (var i = 0; i < s.length; i++) w += letterRows(s[i])[0].length + 1; return Math.max(0, w - 1); }
  function boldW(s) { var w = 0; for (var i = 0; i < s.length; i++) w += boldRows(s[i])[0].length + 1; return Math.max(0, w - 1); }

  /* ---------- numerals: glyph sprites (outline = mask dilated by o px + 1 px drop; fill = 2-tone with 1 px edge light / shade) ---------- */
  var GC = {};
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
  function glyphSprite(font, ch, s, R, ol, o) {
    var key = font + '|' + ch + '|' + s + '|' + R.join() + '|' + ol + '|' + o;
    if (GC[key]) return GC[key];
    var rows = rowsOf(font, ch), w = rows[0].length * s, h = rows.length * s;
    var at = function (x, y) { return x >= 0 && y >= 0 && x < w && y < h && rows[(y / s) | 0][(x / s) | 0] === '#'; };
    var cO = mk(w + 2 * o + 1, h + 2 * o + 1), cF = mk(w + 2 * o + 1, h + 2 * o + 1), gO = cO.getContext('2d'), gF = cF.getContext('2d'), x, y, dx, dy, hit;
    gO.fillStyle = ol;
    for (y = -o; y < h + o + 1; y++) for (x = -o; x < w + o; x++) {
      hit = false;
      for (dy = -o; dy <= o && !hit; dy++) for (dx = -o; dx <= o && !hit; dx++) if (at(x + dx, y + dy) || at(x + dx, y + dy - 1)) hit = true;
      if (hit) gO.fillRect(x + o, y + o, 1, 1);
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (at(x, y)) {
      gF.fillStyle = y < h / 2 ? (!at(x, y - 1) ? R[0] : R[1]) : (!at(x, y + 1) ? R[3] : R[2]);
      gF.fillRect(x + o, y + o, 1, 1);
    }
    return (GC[key] = { ol: cO, fill: cF, w: w, h: h, o: o });
  }
  var KIND = { damage: 'dmg', dmg: 'dmg', crit: 'crit', critical: 'crit', heal: 'heal', miss: 'miss', mp: 'mp', status: 'status' };
  function scheme(name) { return palette.ramps.numbers[name] || palette.ramps.numbers.classic; }
  // glyph(font 'digit'|'letter'|'bold', ch, scale, {kind, scheme, flash, outline}) -> {ol, fill, w, h, o} (canvases; draw ol at x-o, y-o for every glyph first, then fill)
  function glyph(font, ch, s, opt) {
    opt = opt || {}; var SC = scheme(opt.scheme), R = opt.flash ? palette.ramps.numbers.flash : opt.ramp || SC[KIND[opt.kind] || 'dmg'] || SC.dmg;
    return glyphSprite(font, ch, s, R, opt.ol || SC.ol, opt.outline == null ? 1 : opt.outline);
  }
  // numberLayout(text, {scale, big, suffix, label, labelGap}) — glyph boxes relative to the top-left of the number (label above, y < 0)
  function numberLayout(text, o) {
    o = o || {}; var s = o.scale || 1, b = o.big ? Math.min(s + 1, 2) : s, items = [], x = 0, i, ch, r;
    text = String(text);
    if (/^[0-9+]+$/.test(text)) {
      for (i = 0; i < text.length; i++) { ch = text[i]; r = D10[ch]; items.push({ font: 'digit', ch: ch, x: x, s: b, w: r[0].length * b, h: 10 * b }); x += (r[0].length + 1) * b; }
      x -= b;
      if (o.suffix) { x += 2 * s; for (i = 0; i < o.suffix.length; i++) { ch = o.suffix[i]; r = boldRows(ch); items.push({ font: 'bold', ch: ch, x: x, s: s, w: r[0].length * s, h: 7 * s }); x += (r[0].length + 1) * s; } x -= s; }
    } else {
      for (i = 0; i < text.length; i++) { ch = text[i]; r = boldRows(ch); items.push({ font: 'bold', ch: ch, x: x, s: s, w: r[0].length * s, h: 7 * s }); x += (r[0].length + 1) * s; }
      x -= s;
    }
    var h = 0; items.forEach(function (it) { h = Math.max(h, it.h); }); items.forEach(function (it) { it.y = h - it.h; });
    var label = o.label ? { text: o.label, w: letterW(o.label), h: 7 } : null, labelItems = [];
    if (label) {
      var lx = Math.round((x - label.w) / 2), lxx = lx;
      for (i = 0; i < label.text.length; i++) { ch = label.text[i]; labelItems.push({ font: 'letter', ch: ch, x: lxx, y: -label.h - (o.labelGap == null ? 4 : o.labelGap), s: 1, lab: 1, w: letterRows(ch)[0].length, h: 7, lx0: lxx - lx }); lxx += letterRows(ch)[0].length + 1; }
    }
    return { items: items, w: x, h: h, label: label, labelItems: labelItems };
  }

  /* ---------- the skin ---------- */
  var skin = {
    id: 'pixel16', name: '16-bit console pixel', pixel: true,
    native: { w: 256, h: 224, scale: 'integer', smoothing: false, snap: 1, minScale: 2, note: 'draw at native res, backing store = native, CSS-scale by an integer; grid games often 240x160' },
    palette: palette,
    fonts: {
      ui: { type: 'bitmap', height: 7, advance: 6, space: 4, uppercase: true, sep: ',', glyphs: GLYPH_UI, note: 'grid-range-path 5x7 mono; 2-tone (rows 0-3 color, 4-6 color2) + 1 px drop shadow' },
      plate: { type: 'bitmap', height: 7, space: 4, coverage: 'full', note: 'active-time-battle proportional 5x7 (ACEITVW 0125 7 . x as in A-01); every other character falls back to the ui glyphs, upper-cased' },
      num: { type: 'bitmap', height: 10, sep: '|', glyphs: DIGITS, note: 'damage-numbers 7x10 digits; use number()/glyph()' },
      label: { type: 'bitmap', height: 7, sep: '|', glyphs: LETTERS, note: 'damage-numbers 5x7 letters (CRITICAL label)' },
      bold: { type: 'bitmap', height: 7, note: 'letters widened 1 px to the right (MISS, POISON, MP suffix)' },
      rules: { snap: true, smoothing: false, minSize: 7, uppercase: true, lineH: 12 }
    },
    shape: { radius: 0, edgeWidth: 1, padding: 4, clippedCorners: 1, rivets: true },
    overlayStyle: { mode: 'tint', pattern: 'pulsing', composite: 'color', tintAlpha: 0.72, alpha: 0.22, pulseAlpha: 0.30, checker: [0.30, 0.17], seamAlpha: 0.12, edgeAlpha: 0.85 },
    particles: { shape: 'square', size: [1, 2], count: 1, snap: true, blend: 'source-over', glow: 0, gravity: 0.12, drag: 0.02, life: [250, 600], colors: ['fx.white', 'fx.crit', 'fx.hot'], trail: 0, rays: 6 },
    outline: { text: { width: 0, mode: 'drop' }, number: { width: 1, max: 2, drop: 1, mode: 'dilate', color: 'text.outline' }, sprite: { width: 1, color: 'ink', mode: 'pixel' } },
    shadow: { text: { dx: 1, dy: 1 }, window: null, sprite: { kind: 'blob', alpha: 0.35 } },
    motion: { stepMs: 1000 / 60, snap: true, ease: { move: 'linear', pop: 'snap', fade: 'linear' }, fadeSteps: [1, 0.75, 0.5, 0.25], shakeInt: true, flashMax: 0.35, blinkMs: 100, hitStopMs: 60 },

    measure: function (str, o) {
      o = o || {}; var f = o.font || 'ui', s = String(str);
      if (f === 'plate') return plateW(s);
      if (f === 'label') return letterW(s);
      if (f === 'bold') return boldW(s) * (o.scale || 1);
      if (f === 'num') return numberLayout(s, o).w;
      return uiW(s);
    },
    // text: font 'ui' (default) {color, color2, shadow}; 'plate' {color, shadow}; 'label' | 'bold' {kind, scheme, outline}
    text: function (ctx, str, x, y, o) {
      o = o || {}; var f = o.font || 'ui', s = String(str), w = this.measure(s, o), T = palette.text;
      if (o.align === 'center') x -= Math.floor(w / 2); else if (o.align === 'right') x -= w;
      var pa = ctx.globalAlpha; if (o.alpha != null) ctx.globalAlpha = pa * o.alpha;
      if (f === 'plate') plateText(ctx, s, x, y, o.color || T.plate, o.shadow === false ? null : o.shadow || null);
      else if (f === 'label' || f === 'bold') {
        var sc = o.scale || 1, cx = x, gl = [];
        for (var i = 0; i < s.length; i++) { var rr = f === 'bold' ? boldRows(s[i]) : letterRows(s[i]); gl.push([cx, glyph(f === 'bold' ? 'bold' : 'letter', s[i], sc, o)]); cx += (rr[0].length + 1) * sc; }
        ['ol', 'fill'].forEach(function (p) { gl.forEach(function (g) { ctx.drawImage(g[1][p], g[0] - g[1].o, y - g[1].o); }); });
      } else uiText(ctx, s, x, y, o.color || null, o.color2 || null, o.shadow === false ? false : o.shadow || null);
      ctx.globalAlpha = pa; return w;
    },
    // frame: role 'window' (default; team a | b | n) = bevelled gradient window with rivets; role 'plate' (alert = paused) = flat HUD plate
    frame: function (g, r, st) {
      st = st || {}; var x = r.x, y = r.y, w = r.w, h = r.h, U = palette.ui;
      if (st.role === 'plate') {
        var R = function (X, Y, W, H, c) { if (W <= 0 || H <= 0) return; g.fillStyle = c; g.fillRect(Math.round(X), Math.round(Y), Math.round(W), Math.round(H)); };
        R(x, y, w, h, U.plateEdge); R(x + 1, y + 1, w - 2, h - 2, st.alert ? U.plateAlert : U.plate); R(x + 1, y + 1, w - 2, 1, st.alert ? U.plateAlertLight : U.plateLight);
        return { x: x + 5, y: y + 3, w: w - 10, h: h - 6 };
      }
      var C = palette.windows[st.team] || palette.windows.n, i, pa = g.globalAlpha;
      g.globalAlpha = pa * 0.95 * (st.alpha == null ? 1 : st.alpha);
      for (i = 0; i < h - 2; i++) { g.fillStyle = C[Math.min(3, Math.floor(i / (h - 2) * 4))]; g.fillRect(x + 1, y + 1 + i, w - 2, 1); }
      g.globalAlpha = pa * (st.alpha == null ? 1 : st.alpha); g.fillStyle = U.edge;
      g.fillRect(x + 2, y, w - 4, 1); g.fillRect(x + 2, y + h - 1, w - 4, 1); g.fillRect(x, y + 2, 1, h - 4); g.fillRect(x + w - 1, y + 2, 1, h - 4);
      g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + w - 2, y + 1, 1, 1); g.fillRect(x + 1, y + h - 2, 1, 1); g.fillRect(x + w - 2, y + h - 2, 1, 1);
      g.fillStyle = C[4]; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 5);
      g.fillStyle = C[5]; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
      [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]].forEach(function (p) { g.fillStyle = U.rivetShade; g.fillRect(p[0], p[1], 2, 2); g.fillStyle = U.rivet; g.fillRect(p[0], p[1], 1, 1); });
      g.globalAlpha = pa;
      return { x: x + 4, y: y + 4, w: w - 8, h: h - 8 };
    },
    // number(ctx, str, x, y, {kind, scheme, scale, big, suffix, label, labelGap, outline, align: 'left'|'center', baseline: 'top'|'bottom', alpha,
    //                         glyphOffset(i, item) -> {dx, dy, alpha, flash, skip}}) -> drawn fill rects [{x, y, w, h}]
    // Glyphs are the number's items followed by the label's; outlines of all glyphs are drawn before any fill.
    number: function (ctx, str, x, y, o) {
      o = o || {}; var L = numberLayout(str, o), x0 = o.align === 'center' ? Math.round(x - L.w / 2) : Math.round(x), y0 = o.baseline === 'bottom' ? y - L.h : y;
      var all = L.items.concat(L.labelItems), out = [], pa = ctx.globalAlpha, prev = ctx.imageSmoothingEnabled, olw = o.outline == null ? 1 : o.outline;
      ctx.imageSmoothingEnabled = false;
      var plan = all.map(function (it, i) { var d = (o.glyphOffset && o.glyphOffset(i, it)) || {}; return { it: it, d: d, img: d.skip ? null : glyph(it.font, it.ch, it.s, { kind: o.kind, scheme: o.scheme, flash: d.flash, outline: olw }) }; });
      ['ol', 'fill'].forEach(function (pass) {
        plan.forEach(function (p) {
          if (!p.img) return; var gx = x0 + p.it.x + (p.d.dx || 0), gy = y0 + p.it.y + (p.d.dy || 0);
          ctx.globalAlpha = pa * (p.d.alpha != null ? p.d.alpha : o.alpha != null ? o.alpha : 1);
          ctx.drawImage(p.img[pass], gx - olw, gy - olw);
          if (pass === 'fill') out.push({ x: gx, y: gy, w: p.img.w, h: p.img.h, ch: p.it.ch });
        });
      });
      ctx.globalAlpha = pa; ctx.imageSmoothingEnabled = prev; return out;
    },
    // overlay(ctx, tileRect, 'move'|'attack'|'threat'|'heal', tSeconds, {grow, pattern 'solid'|'pulsing'|'checker', tile: {x, y}, edges, seams})
    overlay: function (g, r, kind, t, o) {
      o = o || {}; var C = palette.overlay[kind] || palette.overlay.move, gr = o.grow == null ? 1 : o.grow, S = this.overlayStyle;
      if (!(gr > 0)) return;
      var c0 = API.color.rgb(C.fill).join(','), c1 = API.color.rgb(C.edge).join(','), X = r.x, Y = r.y, W = r.w, H = r.h, tx = o.tile ? o.tile.x : 0, ty = o.tile ? o.tile.y : 0;
      var pat = o.pattern || S.pattern, a2 = S.alpha, E = o.edges || {}, M = o.seams || {};
      if (pat === 'pulsing' && Math.sin((tx + ty) * 0.55 - t * 3.2) > 0.5) a2 = S.pulseAlpha;
      if (pat === 'checker') a2 = (tx + ty) % 2 ? S.checker[0] : S.checker[1];
      var op = g.globalCompositeOperation;
      g.globalCompositeOperation = 'color'; g.fillStyle = 'rgba(' + c0 + ',' + (S.tintAlpha * gr) + ')'; g.fillRect(X, Y, W, H);
      g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(' + c0 + ',' + (a2 * gr) + ')'; g.fillRect(X, Y, W, H);
      g.fillStyle = 'rgba(' + c1 + ',' + S.seamAlpha + ')'; if (M.right) g.fillRect(X + W - 1, Y, 1, H); if (M.bottom) g.fillRect(X, Y + H - 1, W, 1);
      g.fillStyle = 'rgba(' + c1 + ',' + (S.edgeAlpha * gr) + ')';
      if (E.top) g.fillRect(X, Y, W, 1); if (E.bottom) g.fillRect(X, Y + H - 1, W, 1);
      if (E.left) g.fillRect(X, Y, 1, H); if (E.right) g.fillRect(X + W - 1, Y, 1, H);
      if (op !== 'color') g.globalCompositeOperation = op;
    },
    // bar(ctx, rect, frac, kind, {style: 'gauge' (default) | 'meter', tag: 'haste'|'slow', px})
    //   gauge kinds: charge haste slow ready queued enemy enemyFull, null = empty (dotted);  meter kinds: hp hpLow
    bar: function (g, r, fr, kind, o) {
      o = o || {}; var x = r.x, y = r.y, w = r.w, h = r.h;
      if (o.style === 'meter' || kind === 'hp' || kind === 'hpLow') {
        var Mt = palette.ramps.meter, low = kind === 'hpLow', iw = w - 2, f = o.px != null ? o.px : Math.round(iw * Math.max(0, fr));
        g.fillStyle = Mt.out; g.fillRect(x, y, w, h); g.fillStyle = Mt.track; g.fillRect(x + 1, y + 1, iw, h - 2);
        g.fillStyle = low ? Mt.hpLow : Mt.hp; g.fillRect(x + 1, y + 1, f, h - 2); g.fillStyle = low ? Mt.hpLowTop : Mt.hpTop; g.fillRect(x + 1, y + 1, f, 1);
        return;
      }
      var G = palette.ramps.gauge, C = kind ? G[kind] || G.charge : null, tag = o.tag ? G[o.tag] : null;
      var R = function (X, Y, W, H, c) { if (W <= 0 || H <= 0) return; g.fillStyle = c; g.fillRect(Math.round(X), Math.round(Y), Math.round(W), Math.round(H)); };
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      R(x + 1, y, w - 2, 1, G.out); R(x + 1, y + h - 1, w - 2, 1, G.out); R(x, y + 1, 1, h - 2, G.out); R(x + w - 1, y + 1, 1, h - 2, G.out);
      var iw2 = w - 2, ih = h - 2; R(x + 1, y + 1, iw2, ih, G.empty); R(x + 1, y + 1, iw2, 1, G.emptyTop);
      if (!C) { for (var q = 0; q < iw2; q += 3) R(x + 1 + q, y + 1 + (ih >> 1), 1, 1, G.dot); return; }
      var fw = o.px != null ? o.px : Math.round(Math.max(0, Math.min(1, fr)) * iw2); if (fw <= 0) return;
      R(x + 1, y + 1, fw, ih, C[1]); R(x + 1, y + 1, fw, 1, C[0]);
      if (ih > 2) R(x + 1, y + h - 2, fw, 1, C[2]);
      if (fw < iw2) R(x + fw, y + 1, 1, ih, C[3]); else R(x + iw2, y + 1, 1, ih, C[0]);
      if (tag) { R(x + 1, y + 1, 3, ih, tag[1]); R(x + 1, y + 1, 3, 1, tag[0]); R(x + 4, y + 1, 1, ih, G.out); }
    },
    // cursor(ctx, rect, 'bracket' | 'hand', tSeconds, {alpha, invalid}) — bracket: rect = tile; hand: rect.x/y = pointer top-left (7x5)
    cursor: function (g, r, kind, t, o) {
      o = o || {}; var K = palette.cursor, pa = g.globalAlpha;
      if (kind === 'hand') {
        var hx = r.x + (Math.floor(t * 4) % 2), hy = r.y;
        ['.oo....', 'owwoooo', 'owwwwwo', 'owwwwo.', '.oooo..'].forEach(function (row, yy) { for (var xx = 0; xx < 7; xx++) if (row[xx] !== '.') { g.fillStyle = row[xx] === 'o' ? palette.text.pointerEdge : palette.text.pointer; g.fillRect(hx + xx, hy + yy, 1, 1); } });
        return;
      }
      var T = r.w, x = r.x, y = r.y, o1 = Math.floor(t * 3.6) % 2 ? 0 : -1, col = o.invalid ? [K.badLight, K.bad] : [K.light, K.base];
      g.globalAlpha = o.alpha == null ? 1 : o.alpha;
      var corner = function (cx, cy, sx, sy) {
        var pts = [], i; for (i = 0; i < 5; i++) pts.push([cx + sx * i, cy], [cx + sx * i, cy + sy]); for (i = 2; i < 5; i++) pts.push([cx, cy + sy * i], [cx + sx, cy + sy * i]);
        g.fillStyle = K.edge; pts.forEach(function (p) { g.fillRect(p[0] - 1, p[1] - 1, 3, 3); });
        pts.forEach(function (p) { g.fillStyle = (p[0] === cx || p[1] === cy) ? col[0] : col[1]; g.fillRect(p[0], p[1], 1, 1); });
      };
      corner(x + o1, y + o1, 1, 1); corner(x + T - 1 - o1, y + o1, -1, 1); corner(x + o1, y + T - 1 - o1, 1, -1); corner(x + T - 1 - o1, y + T - 1 - o1, -1, -1);
      g.globalAlpha = pa;
    }
  };
  /* ---------- scene hooks: 16-bit shaded terrain tiles and unit sprites (previews, compare page) ----------
     Art ported from an earlier prototype's own map-fe game (original palette-string sprites; light from the top left).
     Tiles are 16x16 native px, cached per kind / variant / water frame; any rect size is drawn nearest-neighbour. */
  var OLN = '#1a1024';
  var TP = {
    grass: ['#2c5a2c', '#3c7a34', '#549a3c', '#74b84a', '#9cd462'], wood: ['#1e3e24', '#2a5428', '#386a2e', '#4c8236', '#64a040'],
    rock: ['#3a2e3e', '#5a4a52', '#7e6c62', '#a8927a', '#ccb896'], dirt: ['#6a4a2a', '#8c6638', '#ae8648', '#cca660', '#e6c87e'],
    water: ['#142c6c', '#1c4494', '#2a62bc', '#3e88d8', '#6cb4ec', '#bce6ff'], stone: ['#3a3448', '#58506a', '#7a7088', '#9c94a8', '#c4bccc', '#e4dcea'],
    plank: ['#3a2014', '#5c3420', '#82502c', '#a87240', '#cc9a5c'], roof: ['#4a1420', '#7a2430', '#a8383a', '#cc5a48', '#ec8a64'],
    sand: ['#8a7044', '#b0945c', '#ccb070', '#e2cc8c', '#f4e4ae']
  };
  palette.terrain = { grass: TP.grass[2], forest: TP.wood[3], water: TP.water[2], hill: TP.grass[3], mountain: TP.rock[3], road: TP.dirt[2], bridge: TP.plank[3], fort: TP.stone[3], sand: TP.sand[3], wall: TP.stone[2], floor: TP.stone[4] };
  function th(x, y, s) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
  var TC = {};
  function tileArt(kind, v, fr) {
    var key = kind + '|' + v + '|' + fr; if (TC[key]) return TC[key];
    var c = mk(16, 16), g = c.getContext('2d'), P = function (x, y, col) { if (x < 0 || y < 0 || x > 15 || y > 15) return; g.fillStyle = col; g.fillRect(x, y, 1, 1); }, x, y, i;
    var ox = v * 16, G = TP.grass;
    var grass = function () {
      for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) { var r = th(x + ox, y, 3), k = r > 0.965 ? 3 : r < 0.03 ? 1 : 2; P(x, y, G[k]); }
      for (i = 0; i < 4; i++) { var tx = 1 + Math.floor(th(i, v, 5) * 13), ty = 2 + Math.floor(th(i, v, 7) * 11); P(tx, ty, G[4]); P(tx - 1, ty + 1, G[3]); P(tx + 1, ty + 1, G[3]); P(tx, ty + 1, G[1]); }
    };
    var water = function () {
      var W = TP.water;
      for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) P(x, y, th(x + ox, y, 9) < 0.07 ? W[1] : W[2]);
      [2, 7, 12].forEach(function (ry, j) { var x0 = (v * 5 + j * 6 + fr * 2) % 16; for (i = 0; i < 5; i++) P((x0 + i) % 16, ry + (i === 0 || i === 4 ? 1 : 0), i === 2 ? W[5] : W[4]); for (i = 0; i < 4; i++) P((x0 + i + 1) % 16, ry + 2, W[1]); });
    };
    var outlineMask = function (M, col) { for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) if (!M(x, y) && (M(x + 1, y) || M(x - 1, y) || M(x, y + 1) || M(x, y - 1))) P(x, y, col); };
    if (kind === 'water') water();
    else if (kind === 'road') { var D = TP.dirt; for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) { var r2 = th(x + ox, y, 13); P(x, y, r2 > 0.88 ? D[3] : r2 < 0.1 ? D[1] : D[2]); } for (i = 0; i < 3; i++) { var px = 2 + Math.floor(th(i, v, 15) * 12), py = 2 + Math.floor(th(i, v, 17) * 12); P(px, py, D[4]); P(px + 1, py, D[3]); P(px, py + 1, D[0]); P(px + 1, py + 1, D[1]); } }
    else if (kind === 'sand') { var Sd = TP.sand; for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) { var r3 = th(x + ox, y, 19); P(x, y, r3 > 0.9 ? Sd[4] : r3 < 0.08 ? Sd[1] : Sd[3]); } [4, 10].forEach(function (ry) { for (x = 2; x < 13; x++) P(x, ry + Math.round(Math.sin((x + v * 3) * 0.7)), Sd[2]); }); }
    else if (kind === 'wall' || kind === 'floor') {
      var St = TP.stone, wall = kind === 'wall';
      for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
        var row = wall ? Math.floor(y / 4) : Math.floor(y / 8), off = row % 2 ? 4 : 0, bx = (x + off) % 8, by = wall ? y % 4 : y % 8;
        var col = by === 0 ? St[wall ? 4 : 5] : (wall ? by === 3 : by === 7) || bx === 0 ? St[wall ? 1 : 2] : bx === 1 ? St[wall ? 3 : 4] : St[wall ? 2 : 3];
        if (!wall && th(x + ox, y, 23) > 0.93 && by > 0 && bx > 0) col = St[2];
        P(x, y, col);
      }
    } else {
      grass();
      if (kind === 'forest') {
        var Wd = TP.wood, blobs = [[8, 6, 6.2], [4.5, 9, 3.6], [11.5, 9, 3.6]], inT = function (X, Y) { return blobs.some(function (b) { return (X - b[0]) * (X - b[0]) + (Y - b[1]) * (Y - b[1]) <= b[2] * b[2]; }); };
        for (x = 4; x < 12; x++) P(x, 14, G[0]); for (x = 3; x < 13; x++) P(x, 13, G[1]);
        P(7, 12, TP.plank[2]); P(8, 12, TP.plank[1]); P(7, 13, TP.plank[1]); P(8, 13, TP.plank[0]);
        for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) if (inT(x, y)) { var d = Math.hypot(x - 5.5, y - 3.5) + (th(x + ox, y, 29) - 0.5) * 2.2; P(x, y, Wd[d < 2.5 ? 4 : d < 5 ? 3 : d < 7.5 ? 2 : 1]); }
        outlineMask(inT, Wd[0]);
      } else if (kind === 'hill') {
        var inH = function (X, Y) { return Y <= 13 && ((X - 8) * (X - 8)) / 49 + ((Y - 13) * (Y - 13)) / 64 <= 1; };
        for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) if (inH(x, y)) { var sh = (x - 5) + (y - 7) * 0.8; P(x, y, sh < -1 ? G[4] : sh < 4 ? G[3] : sh < 8 ? G[2] : G[1]); }
        for (x = 2; x < 15; x++) if (inH(x, 13)) P(x, 14, G[0]);
        P(6, 8, TP.dirt[3]); P(7, 8, TP.dirt[2]); P(9, 10, TP.dirt[2]);
      } else if (kind === 'mountain') {
        var R = TP.rock, inM = function (X, Y) { var w = (Y - 1) * 0.55 + (th(Y, v, 31) - 0.5); return Y >= 1 && Y <= 14 && Math.abs(X - 8) <= w; };
        for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) if (inM(x, y)) { var lit = x < 8 - (y > 8 ? (y - 8) * 0.3 : 0); P(x, y, y < 4 ? (lit ? '#f4f8ff' : '#c8d4f0') : lit ? (x < 8 - (y - 1) * 0.35 ? R[4] : R[3]) : (x > 8 + (y - 1) * 0.3 ? R[1] : R[2])); }
        for (y = 6; y < 13; y += 3) P(8 + (y % 2), y, R[1]);
        outlineMask(inM, R[0]);
      } else if (kind === 'bridge') {
        water(); var Pl = TP.plank;
        for (y = 3; y < 13; y++) for (x = 0; x < 16; x++) { var bx2 = x % 4; P(x, y, bx2 === 0 ? Pl[4] : bx2 === 3 ? Pl[1] : Pl[3]); }
        for (x = 0; x < 16; x++) { P(x, 2, Pl[2]); P(x, 13, Pl[2]); P(x, 1, OLN); P(x, 14, OLN); }
        [1, 7, 13].forEach(function (px2) { P(px2, 1, Pl[3]); P(px2 + 1, 1, Pl[2]); P(px2, 0, Pl[4]); P(px2 + 1, 0, Pl[1]); });
      } else if (kind === 'fort') {
        var Sf = TP.stone, inF = function (X, Y) { return (X >= 2 && X <= 13 && Y >= 5 && Y <= 14) || (Y >= 3 && Y <= 4 && X >= 2 && X <= 13 && Math.floor((X - 2) / 3) % 2 === 0); };
        for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) if (inF(x, y)) { var mortar = y >= 5 && ((y - 5) % 3 === 2 || (x + (Math.floor((y - 5) / 3) % 2) * 2) % 4 === 0); P(x, y, x === 2 ? Sf[4] : x === 13 ? Sf[1] : y <= 4 ? Sf[4] : mortar ? Sf[2] : Sf[3]); }
        for (y = 10; y < 15; y++) for (x = 6; x < 10; x++) if (!(y === 10 && (x === 6 || x === 9))) P(x, y, Sf[0]);
        outlineMask(inF, OLN);
        for (y = 0; y < 4; y++) P(8, y, TP.plank[1]); P(9, 0, TP.roof[3]); P(10, 0, TP.roof[3]); P(9, 1, TP.roof[2]); P(10, 1, TP.roof[4]);
      }
    }
    return (TC[key] = c);
  }
  // tile(ctx, rect, kind, t): kind outside the 11 standard kinds draws as grass; water and bridge ripple at 3 frames per second
  skin.tile = function (ctx, r, kind, t) {
    var k = /^(grass|forest|water|hill|mountain|road|bridge|fort|sand|wall|floor)$/.test(kind) ? kind : 'grass';
    var v = Math.floor(th(Math.round(r.x / 16), Math.round(r.y / 16), 1) * 4), fr = k === 'water' || k === 'bridge' ? Math.floor((t || 0) * 3) % 4 : 0;
    var prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tileArt(k, v, fr), r.x, r.y, r.w, r.h); ctx.imageSmoothingEnabled = prev;
  };

  // unit sprites: head + torso + legs + weapon parts, auto 1 px outline, team ramp 1..4 (dark -> light); 18x22, feet on the bottom row
  var SPB = { o: OLN, s: '#f8c8a0', S: '#c8845c', e: '#2a1428', w: '#f4f4ff', v: '#a8b0d8', l: '#f0f6ff', m: '#a8b4d0', M: '#58607e', b: '#a86c38', B: '#5c3418', g: '#ffd858', G: '#b87a1c', r: '#e04848', R: '#8a1c30', h: '#c87838', H: '#7a3c1c', j: '#f0b060' };
  var STEAM = { a: { 1: '#121a52', 2: '#2442a4', 3: '#3c72e4', 4: '#98c4ff' }, b: { 1: '#480c18', 2: '#901e26', 3: '#d4442e', 4: '#ffa47c' }, n: { 1: '#163a1c', 2: '#2c6a2c', 3: '#4ea43c', 4: '#a8e07c' } };
  var HEAD = {
    lord: ['......oooo......', '....oojjjhoo....', '...ojjhhhhhHo...', '..ojhhhhhhhhHo..', '..ohgggggggGHo..', '..oHsssssssSHo..', '..oHsesssesSHo..', '...oSssssSSSo...'],
    archer: ['......oooo......', '....oo4433oo....', '...o443333322o..', '..o44333333322o.', '..o3hhhhhhhH2o..', '..o2ssssssss2o..', '..o2sesssesS2o..', '...o2SssssSS2o..'],
    cleric: ['......oooo......', '....oowwwwoo....', '...owwwwwwwvo...', '..owww4433wwvo..', '..owvhhhhhhvvo..', '..ovhsssssshvo..', '..ovsesssesSvo..', '...ovSssssSvo...'],
    armor: ['.....oooooo.....', '...oollllmmoo...', '..ollmmmmmmmMo..', '..olmmmmmmmMMo..', '..oMooooooooMo..', '..olmmm44mmmMo..', '..oMlmmmmmmMMo..', '...oMMMMMMMMo...'],
    brigand: ['................', '.....oooooo.....', '...oo33334433o..', '..o3333333332o..', '..o2HhhhhhhhH2oo', '..oHsssssssSHo2o', '..oHsesssesSHo..', '...oSsBBBsSSo...']
  };
  var TORSO = {
    tunic: ['...RroSSSSorR...', '..Rro4433332orR.', '..ros4433332Sor.', '..roSo43332oSor.', '..RrooBggbBoorR.', '...Rro43322orR..'],
    plate: ['..oooMMMMMMooo..', '.ollmo4433olmMo.', 'olmmMo4332oMmMMo', 'olmMMo4332oMMMMo', '.oMMoBbggbBoMMo.', '..olmmmmmmmmMo..'],
    robe: ['....ovSSSSvo....', '...owww44wwvo...', '..oswww44wwvSo..', '..oSow4334woSo..', '...owwg44gwvo...', '...owww44wwvvo..'],
    light: ['....ooSSSSoo....', '...o3bb33bb2o...', '..os33bbbb32So..', '..oSo3bbbb2oSo..', '...ooBbggbBoo...', '....o433322o....']
  };
  var LEGS = {
    boots: ['....oBbooBbo....', '....oBBo.oBBo...', '...oBBBo.oBBBo..', '...oooo...oooo..'],
    plate: ['...olmMooolmMo..', '...olmMo.olmMo..', '..olmmMo.olmmMo.', '..oooooo.oooooo.'],
    robe: ['..owwww44wwwvvo.', '..ovvvvvvvvvvvo.', '...oBBo..oBBo...', '...oooo..oooo...']
  };
  var WPN = {
    sword: { x: 13, y: 6, rows: ['.l.', '.l.', 'lm.', 'lm.', 'lm.', 'lm.', 'mM.', 'GgG', '.b.', '.B.'] },
    lance: { x: 14, y: 0, rows: ['.l.', 'llm', 'lmM', '.M.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.B.', '.B.', '.B.', '.B.', '.B.'] },
    axe: { x: 13, y: 3, rows: ['.Bll.', '.bllm', '.bmmM', '.bMM.', '.b...', '.b...', '.b...', '.b...', '.b...', '.b...', '.B...', '.B...'] },
    bow: { x: 15, y: 9, rows: ['b..', 'wb.', 'w.b', 'w.b', 'w.b', 'w.b', 'w.b', 'wb.', 'b..'] },
    staff: { x: 14, y: 3, rows: ['.g.', 'gwg', 'GgG', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.b.', '.B.', '.B.', '.B.', '.B.'] }
  };
  var KINDS = {
    knight: { head: 'armor', torso: 'plate', legs: 'plate', wpn: 'lance' }, fighter: { head: 'brigand', torso: 'light', legs: 'boots', wpn: 'axe' },
    mage: { head: 'cleric', torso: 'robe', legs: 'robe', wpn: 'staff' }, archer: { head: 'archer', torso: 'light', legs: 'boots', wpn: 'bow' },
    lord: { head: 'lord', torso: 'tunic', legs: 'boots', wpn: 'sword' },
    monster: { head: 'brigand', torso: 'light', legs: 'boots', wpn: 'axe', pal: { s: '#9cc47a', S: '#5a7e44', e: '#ff5a2a', H: '#3a2a3e', h: '#5a4a62' } }
  };
  var SPC = {};
  function sprite(kind, team, frame, grey) {
    var key = kind + team + frame + (grey ? 'g' : ''); if (SPC[key]) return SPC[key];
    var C = KINDS[kind] || KINDS.fighter, Gd = [], y, x, k2;
    for (y = 0; y < 22; y++) Gd.push(new Array(18).fill('.'));
    var stamp = function (rows, ox, oy) { rows.forEach(function (r, yy) { for (var xx = 0; xx < r.length; xx++) { var ch = r[xx]; if (ch === '.') continue; if (Gd[oy + yy] && ox + xx >= 0 && ox + xx < 18) Gd[oy + yy][ox + xx] = ch; } }); };
    var bob = frame === 1 ? 1 : 0;
    stamp(LEGS[C.legs], 1, 18); stamp(TORSO[C.torso], 1, 12 + bob); stamp(HEAD[C.head], 1, 4 + bob);
    var wp = WPN[C.wpn]; if (wp) stamp(wp.rows, wp.x, wp.y + bob);
    var add = [];
    for (y = 0; y < 22; y++) for (x = 0; x < 18; x++) if (Gd[y][x] === '.' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) { var c2 = (Gd[y + d[1]] || [])[x + d[0]]; return c2 && c2 !== '.' && c2 !== 'o'; })) add.push([x, y]);
    add.forEach(function (p) { Gd[p[1]][p[0]] = 'o'; });
    var pal = {}, tm = STEAM[team] || STEAM.a;
    for (k2 in SPB) pal[k2] = SPB[k2]; for (k2 in tm) pal[k2] = tm[k2]; if (C.pal) for (k2 in C.pal) pal[k2] = C.pal[k2];
    if (grey) for (k2 in pal) if (k2 !== 'o') { var v3 = API.color.rgb(pal[k2]), lum = Math.round((v3[0] * 0.3 + v3[1] * 0.55 + v3[2] * 0.15) * 0.7 + 30); pal[k2] = API.color.hex([lum - 4, lum, lum + 14]); }
    var c = mk(18, 22), g = c.getContext('2d');
    for (y = 0; y < 22; y++) for (x = 0; x < 18; x++) { var ch = Gd[y][x]; if (ch === '.' || !pal[ch]) continue; g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); }
    return (SPC[key] = c);
  }
  // unitToken(ctx, rect, {team, kind, selected, dead, facing, noShadow}, t): 1 sprite px = 1 native px, feet on the rect's bottom
  // edge, centred; 2-frame idle every 26 frames (stepped), selected units bob 1 px at 4 Hz, dead units grey and faded
  skin.unitToken = function (ctx, r, u, t) {
    u = u || {}; var team = STEAM[u.team] ? u.team : 'a', tt = t || 0, img = sprite(u.kind || 'fighter', team, Math.floor(tt * 60 / 26) % 2, !!u.dead);
    var fx = Math.round(r.x + r.w / 2), fy = Math.round(r.y + r.h), sel = u.selected && Math.floor(tt * 4) % 2 ? 1 : 0, prev = ctx.imageSmoothingEnabled, pa = ctx.globalAlpha;
    ctx.imageSmoothingEnabled = false;
    if (!u.noShadow) { ctx.fillStyle = 'rgba(10,8,30,0.4)'; ctx.fillRect(fx - 4, fy - 2, 8, 1); ctx.fillRect(fx - 6, fy - 1, 12, 1); ctx.fillRect(fx - 4, fy, 8, 1); }
    if (u.dead) ctx.globalAlpha = pa * 0.6;
    ctx.save(); if (u.facing === -1) { ctx.translate(fx * 2, 0); ctx.scale(-1, 1); }
    ctx.drawImage(img, fx - 9, fy - 22 - sel); ctx.restore();
    ctx.globalAlpha = pa; ctx.imageSmoothingEnabled = prev;
  };

  var S = API.register(skin);
  // pixel16 extras (other skins may provide the same names; modules feature-test them)
  S.glyph = glyph; S.numberLayout = numberLayout; S.letterWidth = letterW;
})(typeof window !== 'undefined' ? window : this);
