/* GameDNA C-03 - Pixel bitmap font - module v1 (plain script, no dependencies, one global)
 *
 *   const pf = GameDNA_PixelFont.create({ skin, params: { font: 'regular', shadow: 'drop', cps: 40 }, onBlip });
 *   pf.draw(ctx, 'HP {gold}120{/}/150', x, y, { align: 'right' });     // crisp 1-bit text, colour codes inline
 *   pf.measure('LIVES 3')                                                // width in native px
 *   pf.typewriter('msg', 'The bridge is out. {red}Turn back.', { width: 180 });
 *   pf.update(1000 / 60);  pf.drawTyped(ctx, 'msg', x, y);              // reveal is driven only by update()
 *
 * Fonts (original designs): 'regular' 6x8 proportional (full printable ASCII, tabular digits, 1 px descenders),
 * 'mono' (the same glyphs on a fixed 6 px advance), 'small' 5x7 (full ASCII, 5 px caps). Glyphs are drawn from
 * cached 1-bit atlases with drawImage at whole device pixels, smoothing off, so text never blurs at any integer scale.
 * Colours come from the skin (GameDNA_Skin, optional) with a built-in pixel16 palette when no skin script is loaded.
 * Never throws from draw/update/typewriter; host callbacks are wrapped in try/catch.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';

  /* ---------------- glyph tables ('#' = ink, rows top -> bottom, space-separated; missing bottom rows are blank) ----------------
     regular: cell 8 rows. Caps and digits rows 0-6 (baseline under row 6), x-height rows 2-6, descenders reach row 7. */
  var REGULAR = {
    '!': '# # # # # . #', '"': '#.# #.#', '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.',
    '$': '..#.. .#### #.#.. .###. ..#.# ####. ..#..', '%': '##... ##..# ...#. ..#.. .#... #..## ...##',
    '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#', "'": '# #', '(': '..# .#. #.. #.. #.. .#. ..#',
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
    '?': '.###. #...# ....# ...#. ..#.. ..... ..#..', '@': '.###. #...# #.### #.#.# #.### #.... .####',
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
    '[': '### #.. #.. #.. #.. #.. ###', '\\': '#.... .#... .#... ..#.. ...#. ...#. ....#', ']': '### ..# ..# ..# ..# ..# ###',
    '^': '..#.. .#.#. #...#', '_': '..... ..... ..... ..... ..... ..... ..... #####', '`': '#. .#',
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
    'z': '.... .... #### ...# .##. #... ####', '{': '..## .#.. .#.. #... .#.. .#.. ..##',
    '|': '# # # # # # # #', '}': '##.. ..#. ..#. ...# ..#. ..#. ##..', '~': '..... ..... .#... #.#.# ...#.',
    '\u2026': '..... ..... ..... ..... ..... ..... #.#.#', '\u25bc': '..... ..... ..... ##### .###. ..#..',
    '\u25b6': '#.. ##. ### ##. #..', '\u2665': '..... .#.#. ##### ##### .###. ..#..', '\u00b7': '. . . #',
    '\ufffd': '##### #...# #...# #...# #...# #...# #####'
  };
  // small: cell 6 rows. Caps and digits rows 0-4, x-height rows 1-4, descenders row 5.
  var SMALL = {
    '!': '# # # . #', '"': '#.# #.#', '#': '.#.#. ##### .#.#. ##### .#.#.', '$': '.#. ### ##. .## ### .#.',
    '%': '#.# ..# .#. #.. #.#', '&': '.#.. #.#. .#.. #.#. .#.#', "'": '# #', '(': '.# #. #. #. .#', ')': '#. .# .# .# #.',
    '*': '... #.# .#. #.#', '+': '... .#. ### .#.', ',': '.. .. .. .. .# #.', '-': '... ... ###', '.': '. . . . #',
    '/': '..# ..# .#. #.. #..',
    '0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '##. ..# .#. #.. ###', '3': '##. ..# .#. ..# ##.',
    '4': '#.# #.# ### ..# ..#', '5': '### #.. ##. ..# ##.', '6': '.## #.. ### #.# ###', '7': '### ..# .#. .#. .#.',
    '8': '### #.# ### #.# ###', '9': '### #.# ### ..# ##.',
    ':': '. # . # .', ';': '.. .# .. .# #.', '<': '..# .#. #.. .#. ..#', '=': '... ### ... ###', '>': '#.. .#. ..# .#. #..',
    '?': '##. ..# .#. ... .#.', '@': '.##. #.## #.## #... .##.',
    'A': '.##. #..# #### #..# #..#', 'B': '###. #..# ###. #..# ###.', 'C': '.### #... #... #... .###', 'D': '###. #..# #..# #..# ###.',
    'E': '### #.. ##. #.. ###', 'F': '### #.. ##. #.. #..', 'G': '.### #... #.## #..# .###', 'H': '#..# #..# #### #..# #..#',
    'I': '### .#. .#. .#. ###', 'J': '..## ...# ...# #..# .##.', 'K': '#..# #.#. ##.. #.#. #..#', 'L': '#.. #.. #.. #.. ###',
    'M': '#...# ##.## #.#.# #...# #...#', 'N': '#..# ##.# #.## #..# #..#', 'O': '.##. #..# #..# #..# .##.', 'P': '###. #..# ###. #... #...',
    'Q': '.##. #..# #..# #.#. .#.#', 'R': '###. #..# ###. #.#. #..#', 'S': '.### #... .##. ...# ###.', 'T': '### .#. .#. .#. .#.',
    'U': '#..# #..# #..# #..# .##.', 'V': '#.# #.# #.# .#. .#.', 'W': '#...# #...# #.#.# #.#.# .#.#.', 'X': '#.# #.# .#. #.# #.#',
    'Y': '#.# #.# .#. .#. .#.', 'Z': '#### ..#. .#.. #... ####',
    '[': '## #. #. #. ##', '\\': '#.. #.. .#. ..# ..#', ']': '## .# .# .# ##', '^': '.#. #.#', '_': '... ... ... ... ... ###', '`': '#. .#',
    'a': '... ##. .## #.# .##', 'b': '#.. ##. #.# #.# ##.', 'c': '... .## #.. #.. .##', 'd': '..# .## #.# #.# .##',
    'e': '... .#. ### #.. .##', 'f': '..# .#. ### .#. .#.', 'g': '... .## #.# .## ..# ##.', 'h': '#.. ##. #.# #.# #.#',
    'i': '# . # # #', 'j': '.# .. .# .# .# #.', 'k': '#.. #.# ##. #.# #.#', 'l': '#. #. #. #. .#',
    'm': '..... ##.#. #.#.# #.#.# #.#.#', 'n': '... ##. #.# #.# #.#', 'o': '... .#. #.# #.# .#.', 'p': '... ##. #.# #.# ##. #..',
    'q': '... .## #.# #.# .## ..#', 'r': '... #.# ##. #.. #..', 's': '... .## #.. ..# ##.', 't': '.#. ### .#. .#. ..#',
    'u': '... #.# #.# #.# .##', 'v': '... #.# #.# #.# .#.', 'w': '..... #...# #.#.# #.#.# .#.#.', 'x': '... #.# .#. .#. #.#',
    'y': '... #.# #.# .## ..# ##.', 'z': '... ### ..# #.. ###', '{': '.## .#. #.. .#. .##', '|': '# # # # # #',
    '}': '##. .#. ..# .#. ##.', '~': '.... .#.# #.#.',
    '\u2026': '..... ..... ..... ..... #.#.#', '\u25bc': '... ... ### .#.', '\u25b6': '#. ## #.', '\u2665': '..... .#.#. ##### .###. ..#..',
    '\u00b7': '. . #', '\ufffd': '### #.# #.# #.# ###'
  };
  var FONT_SPECS = {
    regular: { table: REGULAR, h: 8, cap: 7, space: 3, lineH: 10, mono: 0 },
    mono: { table: REGULAR, h: 8, cap: 7, space: 5, lineH: 10, mono: 6 },
    small: { table: SMALL, h: 6, cap: 5, space: 2, lineH: 7, mono: 0 }
  };
  var FONTS = {};
  function font(name) {
    name = FONT_SPECS[name] ? name : 'regular';
    if (FONTS[name]) return FONTS[name];
    var S = FONT_SPECS[name], g = {}, cols = 0, list = [];
    for (var ch in S.table) {
      var rows = S.table[ch].split(' '), w = 0, i;
      for (i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);
      while (rows.length < S.h) rows.push('');
      var off = S.mono ? Math.floor((S.mono - 1 - w) / 2) : 0;
      g[ch] = { rows: rows, w: S.mono ? S.mono - 1 : w, ink: w, off: Math.max(0, off), ax: cols };
      cols += w + 2; list.push(ch);
    }
    return (FONTS[name] = { name: name, h: S.h, cap: S.cap, space: S.space, lineH: S.lineH, mono: S.mono, g: g, atlasW: cols, list: list, atl: {} });
  }

  /* ---------------- built-in pixel16 colours (used when no skin script is loaded) ---------------- */
  var FALLBACK = {
    text: { main: '#ffffff', shadow: '#0a0c24', outline: '#120a1e', dim: '#8088a8', accent: '#ffe070', gold: '#ffe890', title: '#fff4c8', label: '#b8d0ff' },
    fx: { hot: '#ff7a3a', cold: '#6ad8f0', heal: '#4ad870', crit: '#ffb43a', status: '#b878f8' }
  };
  // name -> [skin token, built-in colour]
  var NAMES = {
    white: ['text.main', '#ffffff'], dim: ['text.dim', '#8088a8'], grey: ['text.dim', '#8088a8'], gray: ['text.dim', '#8088a8'],
    gold: ['text.gold', '#ffe890'], yellow: ['text.accent', '#ffe070'], accent: ['text.accent', '#ffe070'], title: ['text.title', '#fff4c8'],
    red: ['text.red', '#ff6a5a'], green: ['fx.heal', '#4ad870'], blue: ['text.label', '#8ab4ff'], cyan: ['fx.cold', '#6ad8f0'],
    purple: ['fx.status', '#b878f8'], orange: ['fx.hot', '#ff7a3a'], black: ['ink', '#06061a']
  };

  var warned = {};
  function warn(k, msg) { if (warned[k]) return; warned[k] = 1; try { if (root.console) console.warn('GameDNA_PixelFont: ' + msg); } catch (e) { /* ignore */ } }
  function mkCanvas(w, h) {
    try {
      if (typeof document !== 'undefined' && document.createElement) { var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
      if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
    } catch (e) { /* no canvas */ }
    return null;
  }
  // atlas per font + colour + kind ('fill' | 'ol' = 1 px dilation, 8 directions); each glyph cell has a 1 px transparent margin
  function atlas(F, color, kind) {
    var key = kind + '|' + color, A = F.atl[key];
    if (A !== undefined) return A;
    var keys = Object.keys(F.atl); if (keys.length > 96) delete F.atl[keys[0]];
    var c = mkCanvas(F.atlasW, F.h + 2), g = c && c.getContext('2d');
    if (!g) return (F.atl[key] = null);
    g.fillStyle = color;
    var D = kind === 'ol' ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [0, 0]] : [[0, 0]];
    for (var i = 0; i < F.list.length; i++) {
      var G = F.g[F.list[i]];
      for (var r = 0; r < G.rows.length; r++) for (var x = 0; x < G.rows[r].length; x++) if (G.rows[r][x] === '#')
        for (var d = 0; d < D.length; d++) g.fillRect(G.ax + 1 + x + D[d][0], 1 + r + D[d][1], 1, 1);
    }
    return (F.atl[key] = c);
  }
  function rawGlyph(ctx, G, x, y, s, color, kind) {   // no-canvas fallback
    ctx.fillStyle = color;
    for (var r = 0; r < G.rows.length; r++) for (var c = 0; c < G.rows[r].length; c++) if (G.rows[r][c] === '#') {
      if (kind === 'ol') ctx.fillRect(x + (c - 1) * s, y + (r - 1) * s, 3 * s, 3 * s); else ctx.fillRect(x + c * s, y + r * s, s, s);
    }
  }

  /* ---------------- parsing: colour codes {gold} {#f80} {text.accent} {/} {} , pauses {p300}, literal {{ ---------------- */
  function parse(str, resolveColor) {
    var s = str == null ? '' : String(str), out = [], col = null, i = 0, pause = 0;
    while (i < s.length) {
      var ch = s[i];
      if (ch === '{') {
        if (s[i + 1] === '{') { out.push({ ch: '{', col: col, pause: pause }); pause = 0; i += 2; continue; }
        var j = s.indexOf('}', i), code = j > i ? s.slice(i + 1, j) : null;
        if (code !== null && code.length <= 24) {
          if (code === '' || code === '/') { col = null; i = j + 1; continue; }
          if (/^p\d{1,5}$/.test(code)) { pause += +code.slice(1); i = j + 1; continue; }
          var c = resolveColor(code);
          if (c) { col = c; i = j + 1; continue; }
        }
      }
      if (ch === '\r') { i++; continue; }
      if (ch === '\t') ch = ' ';
      out.push({ ch: ch, col: col, pause: pause }); pause = 0; i++;
    }
    if (pause) out.push({ ch: '', col: col, pause: pause });
    return out;
  }

  /* ---------------- instance ---------------- */
  var DEFAULTS = { font: 'regular', scale: 1, shadow: 'drop', color: 'white', cps: 40, blipEvery: 2, pause: 160, lineHeight: 0, clamp: 'on', face: 'bitmap' };

  function create(o) {
    o = o || {};
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    var SK = null;
    try { SK = root.GameDNA_Skin && root.GameDNA_Skin.resolve ? root.GameDNA_Skin.resolve(o.skin) : null; } catch (e) { SK = null; }
    var view = o.view || o.bounds || null;
    var TW = {}, clock = 0, updates = 0, drawsNoUpdate = 0, drawn = [];
    var colorCache = {};

    function setParams(p) {
      p = p || {};
      for (var key in p) if (p[key] !== undefined && p[key] !== null && p[key] !== '') P[key] = p[key];
      P.scale = Math.max(1, Math.min(8, Math.round(+P.scale) || 1));
      P.cps = Math.max(1, +P.cps || 40); P.blipEvery = Math.max(1, Math.round(+P.blipEvery) || 1);
      P.pause = Math.max(0, +P.pause || 0); P.lineHeight = Math.max(0, Math.round(+P.lineHeight) || 0);
      colorCache = {};
    }
    setParams(o.params);

    function tokenOf(path) {
      if (SK) { try { var v = SK.token(path); if (v && v !== path) return v; } catch (e) { /* ignore */ } }
      var cur = FALLBACK, parts = path.split('.');
      for (var i = 0; i < parts.length && cur != null; i++) cur = cur[parts[i]];
      return typeof cur === 'string' ? cur : null;
    }
    // colour name | #hex | rgb()/rgba() | skin token path -> CSS colour, or null when it is not a colour code
    function resolveColor(code) {
      if (code == null) return null;
      code = String(code).trim();
      if (colorCache[code] !== undefined) return colorCache[code];
      var v = null, lc = code.toLowerCase();
      if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(code)) v = code;
      else if (/^rgba?\([\d\s.,%]+\)$/i.test(code)) v = code;
      else if (NAMES[lc]) v = tokenOf(NAMES[lc][0]) || NAMES[lc][1];
      else if (/^[a-z][\w]*(\.[\w]+)+$/i.test(code)) v = tokenOf(code);
      return (colorCache[code] = v);
    }
    function colorOpt(c, fallbackName) {
      if (c && typeof c === 'string') { var r = resolveColor(c); if (r) return r; if (/^[a-z]+$/i.test(c)) return c; }
      return resolveColor(fallbackName);
    }

    // per-char advance for the chosen face
    function glyphOf(F, ch) { return F.g[ch] || F.g[ch.toUpperCase && ch.toUpperCase()] || F.g['\ufffd']; }
    function adv(F, ch, sc, ls) {
      if (ch === '') return 0;
      if (ch === ' ') return (F.mono || (F.space + 1)) * sc + ls;
      if (useSkinFace()) { try { return Math.ceil(SK.measure(ch, { font: 'ui' })) * sc + 1 * sc + ls; } catch (e) { /* fall through */ } }
      var G = glyphOf(F, ch); return (G.w + 1) * sc + ls;
    }
    function useSkinFace() { return P.face === 'skin' && SK && SK.pixel === false && typeof SK.text === 'function'; }

    function optsOf(op) {
      op = op || {};
      var fname = op.font || P.font, F = font(fname);
      var sc = Math.max(1, Math.min(8, Math.round(+(op.scale != null ? op.scale : P.scale)) || 1));
      var ls = Math.round(+op.letterSpacing || 0) * sc;
      var lh = (Math.round(+(op.lineHeight != null ? op.lineHeight : 0)) || (fname === P.font && P.lineHeight) || F.lineH) * sc;
      return { F: F, sc: sc, ls: ls, lh: lh, op: op };
    }

    // layout(str, op) -> {lines: [{items: [{ch, col, x, k}], w}], w, h, total, items}
    function layout(str, op) {
      var O = optsOf(op), F = O.F, sc = O.sc, ls = O.ls, toks = parse(str, resolveColor);
      var maxW = op && op.width > 0 ? op.width : Infinity, lines = [], cur = { items: [], w: 0 }, words = [], word = [];
      // split into words (runs of non-space) and single spaces / newlines
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i];
        if (t.ch === ' ' || t.ch === '\n') { if (word.length) words.push(word); word = []; words.push([t]); }
        else word.push(t);
      }
      if (word.length) words.push(word);
      function widthOf(arr) { var w = 0; for (var q = 0; q < arr.length; q++) w += adv(F, arr[q].ch, sc, ls); return w; }
      function push(t) { cur.items.push({ ch: t.ch, col: t.col, pause: t.pause, x: cur.w }); cur.w += adv(F, t.ch, sc, ls); }
      function br() { lines.push(cur); cur = { items: [], w: 0 }; }
      for (var wi = 0; wi < words.length; wi++) {
        var W = words[wi];
        if (W.length === 1 && W[0].ch === '\n') { cur.items.push({ ch: '', col: W[0].col, pause: W[0].pause, x: cur.w, nl: 1 }); br(); continue; }
        if (W.length === 1 && W[0].ch === ' ') {
          if (cur.w === 0 && lines.length && !lines[lines.length - 1].hard) { cur.items.push({ ch: '', col: W[0].col, pause: W[0].pause, x: 0 }); continue; } // swallow leading space on a wrapped line
          push(W[0]); continue;
        }
        var ww = widthOf(W);
        if (cur.w > 0 && cur.w + ww - ls > maxW) {
          // trailing spaces do not count; move the word to the next line
          while (cur.items.length && cur.items[cur.items.length - 1].ch === ' ') { var sp = cur.items.pop(); cur.w -= adv(F, ' ', sc, ls); cur.items.push({ ch: '', col: sp.col, pause: sp.pause, x: cur.w }); }
          br();
        }
        if (ww - ls > maxW) { for (var c = 0; c < W.length; c++) { if (cur.w > 0 && cur.w + adv(F, W[c].ch, sc, ls) - ls > maxW) br(); push(W[c]); } }
        else for (var c2 = 0; c2 < W.length; c2++) push(W[c2]);
      }
      lines.push(cur);
      for (var li = 0; li < lines.length - 1; li++) if (lines[li].items.length && lines[li].items[lines[li].items.length - 1].nl) lines[li].hard = 1;
      var w = 0, k = 0, all = [];
      for (var L = 0; L < lines.length; L++) {
        var ln = lines[L]; ln.w = 0;
        for (var e = ln.items.length - 1; e >= 0; e--) { var lc = ln.items[e]; if (lc.ch === '' || lc.ch === ' ') continue; ln.w = lc.x + adv(F, lc.ch, sc, ls) - sc - ls; break; }
        w = Math.max(w, ln.w);
        for (var it = 0; it < ln.items.length; it++) { ln.items[it].k = k++; all.push(ln.items[it]); }
      }
      var h = lines.length ? (lines.length - 1) * O.lh + F.h * O.sc : 0;
      return { lines: lines, w: w, h: h, total: k, items: all, O: O };
    }

    // snap a native position so it lands on whole device pixels (and on the native pixel grid for integer transforms)
    function snap(ctx, x, y) {
      try {
        var t = ctx.getTransform ? ctx.getTransform() : null;
        if (t && !t.b && !t.c && t.a > 0 && t.d > 0) {
          var ua = Math.abs(t.a - Math.round(t.a)) < 1e-6 ? t.a : 1, ud = Math.abs(t.d - Math.round(t.d)) < 1e-6 ? t.d : 1;
          return [(Math.round((t.a * x + t.e) / ua) * ua - t.e) / t.a, (Math.round((t.d * y + t.f) / ud) * ud - t.f) / t.d, t];
        }
      } catch (e) { /* ignore */ }
      return [Math.round(x), Math.round(y), null];
    }
    function clampBox(ctx, x, y, w, h, t, op) {
      var mode = op.clamp != null ? op.clamp : P.clamp;
      if (mode === false || mode === 'off') return [x, y];
      try {
        if (view) {
          var vx = view.x || 0, vy = view.y || 0;
          if (x + w > vx + view.w) x = vx + view.w - w; if (x < vx) x = vx;
          if (y + h > vy + view.h) y = vy + view.h - h; if (y < vy) y = vy;
          return [x, y];
        }
        if (t && ctx.canvas && t.a > 0 && t.d > 0) {
          var cw = ctx.canvas.width, ch = ctx.canvas.height, dx = t.a * x + t.e, dy = t.d * y + t.f, dw = t.a * w, dh = t.d * h;
          if (dx + dw > cw) dx = cw - dw; if (dx < 0) dx = 0;
          if (dy + dh > ch) dy = ch - dh; if (dy < 0) dy = 0;
          return [(dx - t.e) / t.a, (dy - t.f) / t.d];
        }
      } catch (e) { /* ignore */ }
      return [x, y];
    }

    // core renderer: draws a layout with reveal count n (Infinity = all)
    function render(ctx, L, x, y, op, n, cursor) {
      var O = L.O, F = O.F, sc = O.sc, ls = O.ls;
      var align = op.align || 'left', base = op.baseline || 'top';
      if (base === 'middle') y -= Math.floor(L.h / 2);
      else if (base === 'bottom') y -= L.h;
      else if (base === 'alphabetic') y -= F.cap * sc;
      var bx = align === 'center' ? x - Math.floor(L.w / 2) : align === 'right' ? x - L.w : x;
      var S = snap(ctx, bx, y); bx = S[0]; y = S[1];
      var C = clampBox(ctx, bx, y, L.w, L.h, S[2], op), sx = C[0] - bx, sy = C[1] - y; bx = C[0]; y = C[1];
      var mainCol = colorOpt(op.color, P.color), shMode = op.shadow != null ? op.shadow : P.shadow;
      if (shMode === true) shMode = 'drop'; if (shMode === false) shMode = 'none';
      var shCol = colorOpt(op.shadowColor, 'text.shadow') || '#0a0c24', olCol = colorOpt(op.outlineColor, 'text.outline') || '#120a1e';
      var pa = ctx.globalAlpha, ps = ctx.imageSmoothingEnabled;
      if (op.alpha != null) ctx.globalAlpha = pa * Math.max(0, Math.min(1, +op.alpha));
      ctx.imageSmoothingEnabled = false;
      var skinFace = useSkinFace(), last = null;
      var passes = shMode === 'both' ? [['ol', 'sh', 1], ['ol', 'ol', 0], ['fill', null, 0]] : shMode === 'outline' ? [['ol', 'ol', 0], ['fill', null, 0]] : shMode === 'drop' ? [['fill', 'sh', 1], ['fill', null, 0]] : [['fill', null, 0]];
      try {
        for (var p = 0; p < passes.length; p++) {
          var kind = passes[p][0], role = passes[p][1], off = passes[p][2] * sc;
          for (var li = 0; li < L.lines.length; li++) {
            var ln = L.lines[li], lx = align === 'center' ? bx + Math.floor((L.w - ln.w) / 2) : align === 'right' ? bx + L.w - ln.w : bx, ly = y + li * O.lh;
            for (var i = 0; i < ln.items.length; i++) {
              var it = ln.items[i];
              if (it.k >= n) break;
              if (it.ch === '' || it.ch === ' ') { if (p === passes.length - 1) last = { x: lx + it.x, y: ly }; continue; }
              var col = role === 'sh' ? shCol : role === 'ol' ? olCol : (it.col || mainCol);
              var gx = lx + it.x, gy = ly;
              if (p === passes.length - 1) last = { x: gx + adv(F, it.ch, sc, ls) - ls, y: ly };
              if (skinFace) {
                if (role) continue;
                SK.text(ctx, it.ch, gx, gy, { font: 'ui', color: col, shadow: shMode === 'none' ? false : undefined, outline: shMode === 'outline' || shMode === 'both' ? undefined : false, scale: sc });
                continue;
              }
              var G = glyphOf(F, it.ch), A = atlas(F, col, kind), ox = G.off * sc;
              if (A) ctx.drawImage(A, G.ax, 0, G.ink + 2, F.h + 2, gx + ox - sc + off, gy - sc + off, (G.ink + 2) * sc, (F.h + 2) * sc);
              else rawGlyph(ctx, G, gx + ox + off, gy + off, sc, col, kind);
            }
          }
        }
        if (cursor && last) {
          var CG = glyphOf(F, '\u25bc'), bob = (Math.floor(clock / 260) % 2) * sc, cx = last.x + 2 * sc, cy = last.y + bob;
          var cp = shMode === 'none' ? [['fill', null, 0]] : passes;
          for (p = 0; p < cp.length; p++) {
            var A2 = atlas(F, cp[p][1] === 'sh' ? shCol : cp[p][1] === 'ol' ? olCol : colorOpt(op.cursorColor, 'accent'), cp[p][0]);
            if (A2) ctx.drawImage(A2, CG.ax, 0, CG.ink + 2, F.h + 2, cx - sc + cp[p][2] * sc, cy - sc + cp[p][2] * sc, (CG.ink + 2) * sc, (F.h + 2) * sc);
          }
        }
      } finally { ctx.globalAlpha = pa; ctx.imageSmoothingEnabled = ps; }
      var box = { x: bx, y: y, w: L.w, h: L.h, shifted: !!(sx || sy) };
      drawn.push(box); if (drawn.length > 256) drawn.shift();
      return box;
    }

    function okXY(x, y, what) {
      if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) { warn('xy-' + what, what + ' called without a numeric x, y: nothing drawn (never drawn at 0,0 or the centre)'); return false; }
      return true;
    }
    var EMPTY = { x: 0, y: 0, w: 0, h: 0 };

    // fit: shrink to the small font, then cut with an ellipsis, so the text never exceeds op.fit px
    function fitLayout(str, op) {
      var L = layout(str, op);
      if (!(op.fit > 0) || L.w <= op.fit) return L;
      if ((op.font || P.font) !== 'small') { var o2 = {}; for (var k2 in op) o2[k2] = op[k2]; o2.font = 'small'; var L2 = layout(str, o2); if (L2.w <= op.fit) return L2; op = o2; }
      var toks = parse(str, resolveColor), s = '', lo = 0, hi = toks.length;
      function rebuild(n) { var out = '', c = null; for (var i = 0; i < n; i++) { var t = toks[i]; if (t.col !== c) { out += t.col ? '{' + t.col + '}' : '{/}'; c = t.col; } out += t.ch === '{' ? '{{' : t.ch; } return out.replace(/\s+$/, '') + '\u2026'; }
      while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (layout(rebuild(mid), op).w <= op.fit) lo = mid; else hi = mid - 1; }
      s = rebuild(lo); return layout(s, op);
    }

    var api = {
      version: VERSION,
      params: P,
      skin: SK,
      // draw(ctx, str, x, y, opts) -> {x, y, w, h}: (x, y) = top-left of the text box (see align / baseline)
      draw: function (ctx, str, x, y, op) {
        try {
          if (!ctx || !okXY(x, y, 'draw')) return EMPTY;
          op = op || {};
          var L = fitLayout(str, op);
          if (op.maxLines > 0 && L.lines.length > op.maxLines) L.lines.length = op.maxLines;
          return render(ctx, L, x, y, op, op.reveal != null ? Math.max(0, +op.reveal) : Infinity, op.cursor);
        } catch (e) { warn('draw', 'draw failed: ' + (e && e.message)); return EMPTY; }
      },
      measure: function (str, op) { try { return fitLayout(str, op || {}).w; } catch (e) { return 0; } },
      size: function (str, op) { try { var L = fitLayout(str, op || {}); return { w: L.w, h: L.h, lines: L.lines.length }; } catch (e) { return { w: 0, h: 0, lines: 0 }; } },
      lineHeight: function (op) { return optsOf(op).lh; },
      height: function (op) { var O = optsOf(op); return O.F.h * O.sc; },
      // wrap(str, width, opts) -> array of line strings (colour codes kept, so each line can be drawn on its own)
      wrap: function (str, width, op) {
        try {
          var o2 = {}; for (var k2 in (op || {})) o2[k2] = op[k2]; o2.width = width;
          var L = layout(str, o2), out = [], prev = null;
          for (var i = 0; i < L.lines.length; i++) {
            var s = '', c = prev; if (c) s += '{' + c + '}';
            L.lines[i].items.forEach(function (it) { if (it.ch === '') return; if (it.col !== c) { s += it.col ? '{' + it.col + '}' : '{/}'; c = it.col; } s += it.ch === '{' ? '{{' : it.ch; });
            out.push(s.replace(/ +$/, '')); prev = c;
          }
          return out;
        } catch (e) { return [String(str == null ? '' : str)]; }
      },
      // typewriter(id, str, opts): start (or keep) a reveal. Same id + same text + same width = no restart, so it is safe to call every frame.
      typewriter: function (id, str, op) {
        try {
          op = op || {}; id = String(id == null ? 'default' : id);
          var T = TW[id], key = String(str) + '|' + (op.width || 0) + '|' + (op.font || P.font) + '|' + (op.scale || P.scale);
          if (T && T.key === key && !op.restart && clock - T.touch <= 300) { T.op = merge(T.op, op); T.touch = clock; return status(T); }
          var L = layout(str, op), times = [], t = 0, ms = 1000 / Math.max(1, +(op.cps || P.cps)), pz = op.pause != null ? +op.pause : P.pause;
          for (var i = 0; i < L.items.length; i++) {
            var it = L.items[i]; t += it.pause || 0;
            if (it.ch !== '') t += it.ch === ' ' ? ms * 0.5 : ms;
            times.push(t);
            var nx = L.items[i + 1], endOfClause = !nx || nx.ch === ' ' || nx.ch === '';
            if (endOfClause && /[.!?\u2026]/.test(it.ch)) t += pz; else if (endOfClause && /[,;:]/.test(it.ch)) t += pz / 2;
          }
          T = TW[id] = { id: id, key: key, L: L, times: times, t: 0, shown: 0, done: L.total === 0, op: op, blips: 0, fired: false, touch: clock };
          if (T.done) fireDone(T);
          return status(T);
        } catch (e) { warn('tw', 'typewriter failed: ' + (e && e.message)); return { id: id, shown: 0, total: 0, done: true }; }
      },
      // drawTyped(ctx, id, x, y, opts) -> box. opts.text starts the reveal if the id does not exist yet.
      drawTyped: function (ctx, id, x, y, op) {
        try {
          op = op || {}; id = String(id == null ? 'default' : id);
          if (!TW[id] && op.text != null) api.typewriter(id, op.text, op);
          var T = TW[id]; if (!T || !ctx || !okXY(x, y, 'drawTyped')) return EMPTY;
          T.touch = clock;
          if (!updates) { if (++drawsNoUpdate > 45 && !T.done) { warn('noupdate', 'drawTyped is called but update() never is: showing the whole text. Call update(dtMs) once per game step.'); T.shown = T.L.total; T.done = true; fireDone(T); } }
          var o2 = merge(T.op, op);
          var L = T.L; if (o2.maxLines > 0 && L.lines.length > o2.maxLines) { L = { lines: L.lines.slice(0, o2.maxLines), w: L.w, h: (o2.maxLines - 1) * L.O.lh + L.O.F.h * L.O.sc, O: L.O, total: L.total }; }
          return render(ctx, L, x, y, o2, T.shown, o2.cursor && T.done);
        } catch (e) { warn('drawTyped', 'drawTyped failed: ' + (e && e.message)); return EMPTY; }
      },
      update: function (dt) {
        try {
          dt = +dt; if (!isFinite(dt) || dt < 0) dt = 0; if (dt > 1000) dt = 1000;
          updates++; clock += dt; drawn.length = 0;
          for (var id in TW) {
            var T = TW[id]; if (T.done) continue;
            T.t += dt; var blip = null;
            while (T.shown < T.L.total && T.times[T.shown] <= T.t) {
              var it = T.L.items[T.shown]; T.shown++;
              if (it.ch !== '' && it.ch !== ' ') { if (T.blips % (T.op.blipEvery || P.blipEvery) === 0) blip = it; T.blips++; }
            }
            if (blip) call(T.op.onBlip || o.onBlip, [blip.ch, blip.k, T.id]);
            if (T.shown >= T.L.total) { T.done = true; fireDone(T); }
          }
        } catch (e) { warn('update', 'update failed: ' + (e && e.message)); }
      },
      skip: function (id) { var T = TW[String(id)]; if (!T) return true; if (T.done) return true; T.shown = T.L.total; T.done = true; fireDone(T); return false; },
      done: function (id) { var T = TW[String(id)]; return !T || T.done; },
      status: function (id) { var T = TW[String(id)]; return T ? status(T) : null; },
      remove: function (id) { delete TW[String(id)]; },
      clear: function () { TW = {}; },
      // drop-in for ctx.fillText(str, x, y[, maxWidth]): uses ctx.fillStyle, ctx.textAlign, ctx.textBaseline; ctx.font size picks the face (<= 7 px small, else regular, scale = round(size / 9))
      fillText: function (ctx, str, x, y, maxWidth, op) {
        try {
          if (!ctx) return EMPTY;
          var o2 = merge({}, op || {}), al = ctx.textAlign, bl = ctx.textBaseline;
          o2.align = al === 'center' ? 'center' : (al === 'right' || al === 'end') ? 'right' : 'left';
          o2.baseline = bl === 'top' || bl === 'hanging' ? 'top' : bl === 'middle' ? 'middle' : bl === 'bottom' || bl === 'ideographic' ? 'bottom' : 'alphabetic';
          if (o2.color == null && typeof ctx.fillStyle === 'string') o2.color = ctx.fillStyle;
          if (o2.font == null || o2.scale == null) { var m = /(\d+(?:\.\d+)?)px/.exec(ctx.font || ''), px = m ? +m[1] : 10; if (o2.font == null) o2.font = px <= 7 ? 'small' : P.font === 'small' ? 'regular' : P.font; if (o2.scale == null) o2.scale = Math.max(1, Math.round(px / 9)); }
          if (maxWidth > 0 && o2.fit == null) o2.fit = maxWidth;
          return api.draw(ctx, String(str == null ? '' : str), x, y, o2);
        } catch (e) { warn('fillText', 'fillText failed: ' + (e && e.message)); return EMPTY; }
      },
      measureText: function (str, ctxOrOp) { var op = ctxOrOp && ctxOrOp.font !== undefined && ctxOrOp.canvas ? (function () { var m = /(\d+(?:\.\d+)?)px/.exec(ctxOrOp.font || ''), px = m ? +m[1] : 10; return { font: px <= 7 ? 'small' : P.font === 'small' ? 'regular' : P.font, scale: Math.max(1, Math.round(px / 9)) }; })() : ctxOrOp; return { width: api.measure(str, op || {}) }; },
      setParams: function (p) { setParams(p); },
      lastDrawn: function () { return drawn.slice(); },
      glyphs: function (name) { return font(name || P.font).list.slice(); },
      color: function (code) { return resolveColor(code); }
    };
    function merge(a, b) { var r = {}, k3; for (k3 in a || {}) r[k3] = a[k3]; for (k3 in b || {}) if (b[k3] !== undefined) r[k3] = b[k3]; return r; }
    function status(T) { return { id: T.id, shown: T.shown, total: T.L.total, done: T.done, w: T.L.w, h: T.L.h }; }
    function fireDone(T) { if (T.fired) return; T.fired = true; call(T.op.onDone || o.onDone, [T.id]); }
    function call(fn, args) { if (typeof fn !== 'function') return; try { fn.apply(null, args); } catch (e) { warn('cb', 'a callback threw: ' + (e && e.message)); } }
    return api;
  }

  var MOD = { version: VERSION, create: create, fonts: function () { return Object.keys(FONT_SPECS); }, colorNames: function () { return Object.keys(NAMES); } };
  root.GameDNA_PixelFont = MOD;
})(typeof window !== 'undefined' ? window : this);
