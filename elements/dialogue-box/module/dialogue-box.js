/* GameDNA H-01 · Typewriter dialogue box · module v1 (plain script, no dependencies, one global: GameDNA_DialogueBox)
 *
 *   const dlg = GameDNA_DialogueBox.create({
 *     view: { w: 256, h: 224 },                    // or bounds: { x, y, w, h } (play field; the box stays inside it)
 *     skin: 'pixel16',                             // optional; drawn through GameDNA_Skin when skin-api.js is loaded
 *     params: { speed: 40, rows: 3, place: 'auto' },   // see DEFAULTS
 *     autoplay: () => AUTOPLAY,                    // optional: lines advance by themselves, player presses are ignored
 *     getAnchor: (speaker, line) => ({ x, y, w, h }),  // optional: the speaker's sprite on screen (top-left rect), so the box avoids it
 *     getObstacles: () => [{ x, y, w, h, id }],    // optional: UI rects (no id) are never covered; sprites (with id) can be speakers
 *     onTick: (ch, i, line) => {}, onLine: (line, i, ctl) => {}, onLineEnd: (line, i, ctl) => {}, onEnd: r => {}, onSfx: name => {}
 *   });
 *   dlg.open([{ speaker: 'Elder', text: 'Welcome, traveller.' }, { text: 'The wind picks up.' }], { onEnd: r => {} })
 *   dlg.busy()                // true from open() until the box has closed: route confirm here, pause the world
 *   dlg.press() / dlg.tap()   // confirm (key-down edge): finish the page, or advance; latched until the next update()
 *   dlg.hold(isDown)          // optional: confirm held -> fast-forward;  dlg.key(code, down) does press + hold from raw keys
 *   dlg.update(dtMs)          // the only clock (fixed step), so ?t=&freeze=1 is deterministic
 *   dlg.draw(ctx)             // native-resolution 2D context, last in the draw pass
 *   onEnd result = { lines, index, skipped, auto, line }   (called synchronously inside update(), when the box has closed)
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var DEFAULTS = { speed: 40, pause: 160, rows: 3, width: 0, margin: 6, place: 'auto', nameTag: 'on', arrow: 'on', autoAdvance: 0,
    hold: 'on', ffSpeed: 4, tickEvery: 2, tint: 'a', openMs: 100, dim: 0, autoplayMs: 600, armMs: 0 };
  var STEP = 1000 / 60, LH = 11, PADX = 10, PADY = 8, TAG_H = 12, TAG_UP = 8, HOLD_MS = 240, FF_NEXT = 160;
  var ACTION_KEYS = { KeyZ: 1, z: 1, Z: 1, Space: 1, ' ': 1, Enter: 1, NumpadEnter: 1 };

  /* ---------- 6x8 proportional font (the C-03 'regular' glyphs: '#' = ink, rows top -> bottom; full printable ASCII) ---------- */
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
  var GL = {};
  function glyph(ch) {
    if (GL[ch]) return GL[ch];
    var src = REGULAR[ch]; if (src == null) src = REGULAR['�'];
    var rows = src.split(' '), w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);
    return (GL[ch] = { rows: rows, w: w });
  }
  function advOf(ch) { return ch === ' ' ? 4 : ch === '' ? 0 : glyph(ch).w + 1; }

  /* ---------- built-in pixel16 look (used when skin-api.js is not loaded) ---------- */
  var WIN = {
    a: ['#3a64d8', '#2c50b8', '#223e96', '#1a2e74', '#a8c8ff', '#0a1238'],
    b: ['#d85a48', '#b8402e', '#922c26', '#6a1c1e', '#ffc8b8', '#2a0608'],
    n: ['#4c5a8a', '#3e4a76', '#323c62', '#262e4e', '#c8d4f4', '#0a0e22']
  };
  var FB = { ink: '#06061a', 'text.main': '#ffffff', 'text.shadow': '#0a0c24', 'text.gold': '#ffe890', 'text.accent': '#ffe070', 'text.dim': '#8088a8',
    'text.title': '#fff4c8', 'text.label': '#b8d0ff', 'text.red': '#ff6a5a', 'text.pointer': '#fff8e8', 'text.pointerEdge': '#1a0e08',
    'fx.heal': '#4ad870', 'fx.cold': '#6ad8f0', 'fx.status': '#b878f8', 'fx.hot': '#ff7a3a', 'ui.plate': '#1c2458', 'ui.plateLight': '#5a6ac0',
    'ui.plateEdge': '#0a0c24', 'ui.rivet': '#ffe070', 'ui.rivetShade': '#7a5410', 'ui.edge': '#06061a' };
  var NAMES = { white: 'text.main', dim: 'text.dim', grey: 'text.dim', gray: 'text.dim', gold: 'text.gold', yellow: 'text.accent', accent: 'text.accent',
    title: 'text.title', red: 'text.red', green: 'fx.heal', blue: 'text.label', cyan: 'fx.cold', purple: 'fx.status', orange: 'fx.hot' };

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function area(a, b) { return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); }
  function okRect(r) { return r && isFinite(r.x) && isFinite(r.y) && r.w > 0 && r.h > 0; }
  function mkCanvas(w, h) { try { var c = root.document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; } catch (e) { return null; } }

  /* ---------- script text: colour codes {gold} {#f80} {/}, pauses {p300}, page break {page}, literal {{, '\n' = new row ---------- */
  var STOP = { '.': 1, '!': 1, '?': 1, '…': 1 }, HALF = { ',': 1, ';': 1, ':': 1 };
  function parse(str, P, colorOf) {
    var s = str == null ? '' : String(str), out = [], col = null, i = 0, lead = 0;
    while (i < s.length) {
      var ch = s[i];
      if (ch === '{') {
        if (s[i + 1] === '{') { out.push({ ch: '{', col: col, pause: 0 }); i += 2; continue; }
        var j = s.indexOf('}', i), code = j > i ? s.slice(i + 1, j) : null;
        if (code !== null && code.length <= 24) {
          if (code === '' || code === '/') { col = null; i = j + 1; continue; }
          if (/^p\d{1,5}$/.test(code)) { if (out.length) out[out.length - 1].pause += +code.slice(1); else lead += +code.slice(1); i = j + 1; continue; }
          if (code === 'page') { out.push({ page: true }); i = j + 1; continue; }
          var c = colorOf(code); if (c) { col = c; i = j + 1; continue; }
        }
      }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { out.push({ nl: true }); i++; continue; }
      if (ch === '\t') ch = ' ';
      out.push({ ch: ch, col: col, pause: 0 }); i++;
    }
    // punctuation pauses: after . ! ? ... (full) and , ; : (half), only before a space / line end (not inside "3.5" or "...")
    for (var k = 0; k < out.length; k++) {
      var it = out[k]; if (!it.ch) continue;
      var nx = out[k + 1], end = !nx || nx.nl || nx.page || nx.ch === ' ' || nx.ch === '"' || nx.ch === "'" || nx.ch === ')';
      if (!end) continue;
      if (STOP[it.ch]) it.pause += P.pause; else if (HALF[it.ch]) it.pause += Math.round(P.pause / 2);
    }
    return { items: out, lead: lead };
  }
  // greedy word wrap into rows, rows into pages of `rows`; returns [[row]], row = [item]
  function paginate(items, width, rows, measure) {
    var lines = [], cur = [], curW = 0, word = [], wordW = 0, pageBreaks = {};
    function flushWord() {
      if (!word.length) return;
      if (curW > 0 && curW + wordW > width) { trimEnd(cur); lines.push(cur); cur = []; curW = 0; }
      while (wordW > width && word.length > 1) {            // a word longer than a row: hard-break it
        var part = [], pw = 0; while (word.length && pw + measure(word[0]) <= width) { pw += measure(word[0]); part.push(word.shift()); }
        if (!part.length) part.push(word.shift());
        if (cur.length) { lines.push(cur); cur = []; curW = 0; }
        lines.push(part); wordW = 0; for (var q = 0; q < word.length; q++) wordW += measure(word[q]);
      }
      cur = cur.concat(word); curW += wordW; word = []; wordW = 0;
    }
    function trimEnd(row) { while (row.length && row[row.length - 1].ch === ' ') row.pop(); }
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.nl || it.page) { flushWord(); trimEnd(cur); lines.push(cur); cur = []; curW = 0; if (it.page) pageBreaks[lines.length] = 1; continue; }
      if (it.ch === ' ') {
        flushWord();
        if (curW === 0) continue;                        // no leading spaces on a row
        if (curW + measure(it) > width) { trimEnd(cur); lines.push(cur); cur = []; curW = 0; continue; }
        cur.push(it); curW += measure(it); continue;
      }
      word.push(it); wordW += measure(it);
    }
    flushWord(); trimEnd(cur); if (cur.length || !lines.length) lines.push(cur);
    var pages = [], pg = [];
    for (var r = 0; r < lines.length; r++) {
      if (pg.length && (pg.length >= rows || pageBreaks[r])) { pages.push(pg); pg = []; }
      pg.push(lines[r]);
    }
    if (pg.length) pages.push(pg);
    return pages.filter(function (p, n) { return n === 0 || p.some(function (row) { return row.length; }); });
  }

  function create(o) {
    o = o || {};
    var API = root.GameDNA_Skin || null, SK = null;
    if (o.skin !== false) { try { SK = API && API.resolve ? API.resolve(o.skin) : null; } catch (e) { SK = null; } }
    var P = {}, warned = {}, lastCanvas = null, clock = 0, convs = 0;
    setParams(o.params || {});
    var D = null;                 // the open conversation, or null
    var last = null, drawnRects = [], held = {}, anchors = {};

    function dbg(e) { if (typeof o.debug === 'function') { try { o.debug(e); } catch (x) { } } }
    function warnOnce(key, msg) { if (warned[key]) return; warned[key] = 1; try { if (root.console) console.warn('GameDNA_DialogueBox: ' + msg); } catch (e) { } }
    function call(fn, a, b, c) { if (typeof fn === 'function') { try { return fn(a, b, c); } catch (x) { warnOnce('cb', 'a host callback threw: ' + x); } } return undefined; }
    function setParams(p) {
      p = p || {};
      for (var k in p) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && p[k] != null && p[k] !== '') P[k] = p[k];
      for (k in DEFAULTS) if (P[k] == null) P[k] = DEFAULTS[k];
      for (k in DEFAULTS) if (typeof DEFAULTS[k] === 'number') P[k] = num(P[k], DEFAULTS[k]);
      P.speed = clamp(P.speed, 0, 2000); P.pause = clamp(P.pause, 0, 2000); P.rows = clamp(Math.round(P.rows), 1, 8);
      P.width = clamp(Math.round(P.width), 0, 2000); P.margin = clamp(Math.round(P.margin), 0, 64); P.autoAdvance = clamp(P.autoAdvance, 0, 20000);
      P.ffSpeed = clamp(P.ffSpeed, 1, 20); P.tickEvery = clamp(Math.round(P.tickEvery), 1, 20); P.openMs = clamp(P.openMs, 0, 1000);
      P.dim = clamp(P.dim, 0, 0.8); P.autoplayMs = clamp(P.autoplayMs, 0, 10000); P.armMs = clamp(P.armMs, 0, 1000);
      if (D) D.relayout = true;
    }

    /* ---------- colours (skin tokens with pixel16 fallbacks) ---------- */
    var CC = {};
    function tok(path) {
      if (SK) { try { var v = SK.token(path); if (typeof v === 'string' && v !== path) return v; } catch (e) { } }
      return FB[path] || null;
    }
    function colorOf(code) {
      if (code == null) return null; code = String(code).trim();
      if (CC[code] !== undefined) return CC[code];
      var v = null, lc = code.toLowerCase();
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(code)) v = code;
      else if (NAMES[lc]) v = tok(NAMES[lc]);
      else if (/^[a-z]\w*(\.\w+)+$/i.test(code)) v = tok(code);
      return (CC[code] = v);
    }
    function pixelSkin() { return !SK || SK.pixel !== false; }

    /* ---------- text measuring and drawing ---------- */
    var MW = {};
    function measureItem(it) {
      if (!it.ch) return 0;
      if (!pixelSkin()) { var k = it.ch; if (MW[k] == null) { try { MW[k] = Math.max(1, +SK.measure(k, { font: 'ui' }) || 0); } catch (e) { MW[k] = advOf(k); } } return MW[k]; }
      return advOf(it.ch);
    }
    function textW(s) { var w = 0; s = String(s == null ? '' : s); for (var i = 0; i < s.length; i++) w += measureItem({ ch: s[i] }); return Math.max(0, w - 1); }
    var GC = {};
    function glyphImg(ch, col) {
      var key = ch + '|' + col; if (GC[key] !== undefined) return GC[key];
      var G = glyph(ch), c = mkCanvas(G.w, 8), g = c && c.getContext('2d');
      if (!g) return (GC[key] = null);
      g.fillStyle = col;
      for (var r = 0; r < G.rows.length; r++) for (var x = 0; x < G.rows[r].length; x++) if (G.rows[r][x] === '#') g.fillRect(x, r, 1, 1);
      return (GC[key] = c);
    }
    function blit(ctx, ch, x, y, col) {
      var img = glyphImg(ch, col);
      if (img) { ctx.drawImage(img, x, y); return; }
      var G = glyph(ch); ctx.fillStyle = col;
      for (var r = 0; r < G.rows.length; r++) for (var c = 0; c < G.rows[r].length; c++) if (G.rows[r][c] === '#') ctx.fillRect(x + c, y + r, 1, 1);
    }
    // draw items [{ch, col}] (the first n of them) at x, y; returns width
    function drawRun(ctx, items, n, x, y, base) {
      var main = base || tok('text.main') || '#ffffff', sh = tok('text.shadow') || '#0a0c24', cx, i, it;
      if (!pixelSkin()) {
        cx = x; var run = '', runCol = null, runX = x;
        var flush = function () { if (run) { try { SK.text(ctx, run, runX, y, { font: 'ui', color: runCol || main }); } catch (e) { } } run = ''; };
        for (i = 0; i < n && i < items.length; i++) { it = items[i]; if ((it.col || null) !== runCol) { flush(); runCol = it.col || null; runX = cx; } run += it.ch; cx += measureItem(it); }
        flush(); return cx - x;
      }
      for (var pass = 0; pass < 2; pass++) {
        cx = x;
        for (i = 0; i < n && i < items.length; i++) {
          it = items[i];
          if (it.ch && it.ch !== ' ') blit(ctx, it.ch, cx + (pass ? 0 : 1), y + (pass ? 0 : 1), pass ? (it.col || main) : sh);
          cx += advOf(it.ch);
        }
      }
      return cx - x;
    }
    function plainItems(s, col) { var out = []; s = String(s == null ? '' : s); for (var i = 0; i < s.length; i++) out.push({ ch: s[i], col: col || null }); return out; }

    /* ---------- field, obstacles, anchors ---------- */
    function field() {
      var b = o.bounds;
      if (typeof b === 'function') b = call(b);
      if (!b && o.view) b = typeof o.view === 'function' ? call(o.view) : o.view;
      if (b && !(b.w > 0) && b.width > 0) b = { x: 0, y: 0, w: b.width, h: b.height };
      if (!b && lastCanvas) b = { x: 0, y: 0, w: lastCanvas.width, h: lastCanvas.height };
      if (!b || !(b.w > 0) || !(b.h > 0)) return null;
      return { x: num(b.x, 0), y: num(b.y, 0), w: b.w, h: b.h };
    }
    function obstacles() {
      var out = [], a = call(o.getObstacles), u = call(o.uiRects);
      [a, u].forEach(function (L, j) { if (L && L.length) for (var i = 0; i < L.length; i++) { var r = L[i]; if (okRect(r)) out.push({ x: +r.x, y: +r.y, w: +r.w, h: +r.h, ui: j === 1 || r.id == null, id: r.id }); } });
      return out;
    }
    function keyOf(line) { var k = line.who != null ? line.who : line.speaker; return k == null ? null : String(k); }
    // the speaker's sprite rect: line.anchor, getAnchor(speaker, line), or a getObstacles() rect whose id matches; cached per speaker
    function speakerRect(line, O) {
      var k = keyOf(line), r = null;
      if (okRect(line.anchor)) r = line.anchor;
      else if (typeof line.anchor === 'function') r = call(line.anchor, line);
      if (!okRect(r) && D && D.opt.anchor) r = typeof D.opt.anchor === 'function' ? call(D.opt.anchor, k, line) : D.opt.anchor;
      if (!okRect(r) && k != null && o.getAnchor) r = call(o.getAnchor, k, line);
      if (!okRect(r) && k != null && O) { var lk = k.toLowerCase(); for (var i = 0; i < O.length; i++) if (!O[i].ui && O[i].id != null && String(O[i].id).toLowerCase() === lk) { r = O[i]; break; } }
      if (okRect(r)) { r = { x: +r.x, y: +r.y, w: +r.w, h: +r.h }; if (k != null) anchors[k] = r; return r; }
      return k != null && anchors[k] ? anchors[k] : null;          // never invent a position: last known, or none
    }

    /* ---------- placement: bottom (or top) edge, never on a UI rect, off the speaker ---------- */
    function geometry(f) {
      var w = P.width > 0 ? Math.min(P.width, f.w) : f.w - 2 * P.margin;
      w = Math.round(clamp(w, Math.min(96, f.w), f.w));
      return { w: w, h: 2 * PADY + P.rows * LH - 3 };
    }
    function place(line) {
      var f = field(); if (!f) return false;
      var G = geometry(f), up = D.anyName && P.nameTag !== 'off' ? TAG_UP : 0, O = obstacles(), spk = speakerRect(line, O);
      var x = Math.round(f.x + (f.w - G.w) / 2), m = Math.min(P.margin, Math.max(0, Math.floor((f.h - G.h - up) / 2)));
      var lo = f.y + m + up, hi = f.y + f.h - m - G.h; if (hi < lo) hi = lo;
      var R = function (y) { return { x: x, y: y - up, w: G.w, h: G.h + up }; };
      var uiHit = function (y) { var r = R(y); for (var i = 0; i < O.length; i++) if (O[i].ui && hit(r, O[i])) return true; return false; };
      var sp = spk ? { x: spk.x - 2, y: spk.y - 2, w: spk.w + 4, h: spk.h + 4 } : null;
      var spHit = function (y) { return sp ? hit(R(y), sp) : false; };
      var sprites = function (y) { var r = R(y), s = 0; for (var i = 0; i < O.length; i++) if (!O[i].ui) s += area(r, O[i]); return s; };
      var want = String(line.place || D.opt.place || P.place);
      var order = want === 'top' ? ['top', 'bottom'] : ['bottom', 'top'];
      // keep the box where it is for the next line when it is still clear (no jumping between lines)
      if (D.box && D.box.f && D.box.f.w === f.w && D.box.f.h === f.h && D.box.w === G.w && D.box.h === G.h && D.box.up === up && want === D.box.want && !uiHit(D.box.y) && !spHit(D.box.y)) { D.spk = spk; return true; }
      var edge = function (side) { var y, s = side === 'top' ? 2 : -2; for (y = side === 'top' ? lo : hi; y >= lo && y <= hi; y += s) if (!uiHit(y)) return y; return null; };
      var cand = [], best = null, bestC = 1e18;
      order.forEach(function (side, n) { var y = edge(side); if (y != null) cand.push({ y: y, c: n * 400 }); });
      if (want !== 'auto' && want !== 'top' && want !== 'bottom') warnOnce('place', 'place must be auto, top or bottom');
      if (want !== 'auto' && cand.length) cand = [cand[0]].concat(cand.slice(1).map(function (c) { c.c += 1e5; return c; }));
      cand.forEach(function (c) { var cost = c.c + (spHit(c.y) ? 1e6 : 0) + sprites(c.y) * 0.5; if (cost < bestC) { bestC = cost; best = c.y; } });
      if (best != null && spHit(best)) {        // both edges cover the speaker: any clear spot, nearest the wanted edge
        var target = order[0] === 'top' ? lo : hi, alt = null, altC = 1e18;
        for (var y = lo; y <= hi; y += 2) if (!uiHit(y) && !spHit(y) && Math.abs(y - target) < altC) { altC = Math.abs(y - target); alt = y; }
        if (alt != null) best = alt;
      }
      if (best == null) { best = order[0] === 'top' ? lo : hi; dbg({ event: 'noroom' }); warnOnce('noroom', 'no spot clear of your UI rects; drawn at the ' + order[0] + ' edge. Check bounds / getObstacles / uiRects.'); }
      D.box = { x: x, y: best, w: G.w, h: G.h, up: up, f: { w: f.w, h: f.h }, want: want };
      D.spk = spk;
      return true;
    }

    /* ---------- conversation ---------- */
    function norm(l) {
      if (l == null) return { speaker: null, text: '' };
      if (typeof l === 'string' || typeof l === 'number') return { speaker: null, text: String(l) };
      if (typeof l !== 'object') return { speaker: null, text: '' };
      if (l.text == null) l.text = '';
      return l;                                                     // the designer's object, extra fields kept (H-02: choices, flags)
    }
    function makeCtl() {
      return {
        next: function () { return next(); }, goto: function (i) { return go(i); }, end: function () { return end(); },
        insert: function (lines) { return insert(lines); }, index: function () { return D ? D.i : -1 },
        line: function () { return D ? D.lines[D.i] : null; }, lines: function () { return D ? D.lines : []; }
      };
    }
    function open(lines, opt) {
      opt = opt || {};
      if (D) { dbg({ event: 'ignored' }); return false; }
      if (lines && !Array.isArray(lines)) lines = [lines];
      if (!lines || !lines.length) { warnOnce('empty', 'open() got no lines'); return false; }
      var auto = opt.auto != null ? !!opt.auto : typeof o.autoplay === 'function' ? !!call(o.autoplay) : !!o.autoplay;
      D = { id: ++convs, lines: lines.map(norm), opt: opt, i: -1, stage: 'open', t: 0, page: 0, pages: [], shown: 0, acc: 0, latch: false,
        auto: auto, jumps: 0, heldMs: 0, pressedSince: false, armT: 0, ticks: 0, shownLines: 0, box: null, pending: false, closing: null, ctl: null };
      D.anyName = D.lines.some(function (l) { return l.speaker != null && l.speaker !== ''; });
      D.ctl = makeCtl();
      dbg({ event: 'open', id: D.id, lines: D.lines.length, auto: D.auto });
      call(o.onSfx, 'open');
      begin(0, 0);
      return true;
    }
    function begin(i, depth) {
      if (!D) return;
      if (i >= D.lines.length || i < 0) { closeNow(false); return; }
      if (++D.jumps > 64) { warnOnce('loop', 'more than 64 line changes in one step (an onLine / onLineEnd hook that always jumps?); the conversation ends'); closeNow(true); return; }
      D.i = i; D.page = 0; D.shown = 0; D.acc = 0; D.waitT = 0; D.shownLines++;
      var line = D.lines[i], before = D.i;
      dbg({ event: 'line', id: D.id, index: i, speaker: line.speaker == null ? null : String(line.speaker), who: keyOf(line), text: String(line.text) });
      call(D.opt.onLine, line, i, D.ctl); call(o.onLine, line, i, D.ctl);
      if (!D || D.closing || D.i !== before) return;   // the hook jumped elsewhere or ended
      layout();
      if (D.stage !== 'open') D.stage = 'type';
    }
    function layout() {
      var line = D.lines[D.i];
      if (!place(line)) { D.pending = true; D.pages = [[[]]]; return; }
      D.pending = false;
      var parsed = parse(line.text, { pause: line.pause != null ? num(line.pause, P.pause) : P.pause }, colorOf);
      D.pages = paginate(parsed.items, D.box.w - 2 * PADX, P.rows, measureItem);
      D.acc = -parsed.lead; D.relayout = false;
    }
    function pageItems() { var pg = D.pages[D.page] || [], out = []; for (var r = 0; r < pg.length; r++) for (var k = 0; k < pg[r].length; k++) out.push(pg[r][k]); return out; }
    function lineSpeed() { var l = D.lines[D.i]; return l && l.speed != null ? Math.max(0, num(l.speed, P.speed)) : P.speed; }
    function waitLimit() {
      var l = D.lines[D.i];
      if (D.auto) return P.autoplayMs;
      var a = l && l.auto != null ? num(l.auto, 0) : P.autoAdvance;
      return a > 0 ? a : Infinity;
    }
    function ff() { return P.hold !== 'off' && D.pressedSince && D.heldMs >= HOLD_MS && !D.auto; }
    function advance(why) {
      if (D.page < D.pages.length - 1) { D.page++; D.shown = 0; D.acc = 0; D.waitT = 0; D.stage = 'type'; call(o.onSfx, 'page'); dbg({ event: 'page', id: D.id, index: D.i, page: D.page, why: why }); return; }
      var line = D.lines[D.i], i = D.i;
      D.stage = 'lineEnd';
      var r1 = call(D.opt.onLineEnd, line, i, D.ctl), r2 = call(o.onLineEnd, line, i, D.ctl);
      if (!D || D.closing) return;
      if (D.i !== i || D.stage !== 'lineEnd') return;             // the hook moved on (goto / next / insert+next)
      if (r1 === false || r2 === false) { D.stage = 'held'; dbg({ event: 'held', id: D.id, index: i }); return; }
      call(o.onSfx, 'next');
      dbg({ event: 'advance', id: D.id, index: i, why: why });
      begin(i + 1, 0);
    }
    function next() { if (!D || D.closing) return false; if (D.stage === 'held' || D.stage === 'lineEnd') { D.stage = 'type'; begin(D.i + 1, 0); return true; } advance('next'); return true; }
    function go(target) {
      if (!D || D.closing) return false;
      var i = typeof target === 'number' ? target : -1;
      if (typeof target === 'string') for (var k = 0; k < D.lines.length; k++) if (D.lines[k].label === target) { i = k; break; }
      if (i < 0 || i >= D.lines.length) { warnOnce('goto', 'goto(' + target + '): no such line; the conversation ends'); closeNow(false); return false; }
      D.stage = D.stage === 'open' ? 'open' : 'type'; begin(i, 1); return true;
    }
    function insert(lines) {
      if (!D) return false; if (!Array.isArray(lines)) lines = [lines];
      var add = lines.map(norm); D.lines.splice.apply(D.lines, [D.i + 1, 0].concat(add));
      if (add.some(function (l) { return l.speaker != null && l.speaker !== ''; })) D.anyName = true;
      return true;
    }
    function closeNow(skipped) {
      if (!D || D.closing) return;
      D.closing = { skipped: !!skipped }; D.stage = 'close'; D.t = 0;
      dbg({ event: 'close', id: D.id, skipped: !!skipped });
    }
    function end() { if (!D) return false; closeNow(true); return true; }
    function finish() {
      var d = D, line = d.lines[d.i] || null;
      var res = { lines: d.shownLines, index: d.i, skipped: !!(d.closing && d.closing.skipped), auto: d.auto, line: line, id: d.id };
      last = res; D = null; held = {};
      dbg({ event: 'end', id: d.id, lines: res.lines, skipped: res.skipped });
      call(o.onSfx, 'close');
      call(d.opt.onEnd, res); call(o.onEnd, res);
    }

    /* ---------- clock ---------- */
    function update(dt) {
      try {
        dt = num(dt, 0); if (dt < 0) dt = 0; if (dt > 250) dt = 250;
        clock += dt;
        var d = D; if (!d) return;
        d.jumps = 0;
        if (d.pending || d.relayout) { var keep = d.shown; layout(); if (!d.pending) d.shown = Math.min(keep, pageItems().length); }
        if (d.heldNow) d.heldMs += dt; else d.heldMs = 0;
        d.t += dt; d.armT += dt;
        var latch = d.latch; d.latch = false;
        if (d.auto) latch = false;
        if (d.stage === 'open') { if (d.t < P.openMs) return; d.stage = 'type'; d.t = 0; latch = false; }
        if (d.stage === 'close') { if (d.t >= P.openMs) finish(); return; }
        if (d.armT < P.openMs + P.armMs) latch = false;
        if (d.pending) return;
        if (d.stage === 'type') {
          var items = pageItems(), total = items.length, sp = lineSpeed() * (ff() ? P.ffSpeed : 1), tick = null;
          if (latch) { d.shown = total; latch = false; dbg({ event: 'finish', id: d.id, index: d.i }); }
          else if (sp <= 0) d.shown = total;
          else {
            var cost = 1000 / sp; d.acc += dt;
            while (d.shown < total && d.acc >= cost) {
              var it = items[d.shown]; d.shown++; d.acc -= cost;
              if (it.ch && it.ch !== ' ') { d.ticks++; if (d.ticks % P.tickEvery === 0) tick = it; }
              if (it.pause && d.shown < total && !ff()) d.acc -= it.pause;
            }
          }
          if (tick) call(o.onTick, tick.ch, d.shown - 1, d.lines[d.i]);
          if (d.shown >= total) { d.stage = 'wait'; d.waitT = 0; d.acc = 0; }
          return;
        }
        if (d.stage === 'wait') {
          d.waitT += dt;
          if (latch) { advance('press'); return; }
          if (ff() && d.waitT >= FF_NEXT) { advance('hold'); return; }
          if (d.waitT >= waitLimit()) { advance(d.auto ? 'autoplay' : 'auto'); return; }
        }
      } catch (e) { warnOnce('update', 'update failed: ' + e); }
    }

    /* ---------- input ---------- */
    function press() { if (!D) return false; if (D.auto || D.stage === 'open' || D.armT < P.openMs + P.armMs) return true; D.latch = true; D.pressedSince = true; return true; }
    function hold(down) { if (!D) return false; D.heldNow = !!down && !D.auto; if (!down) D.heldMs = 0; return true; }
    function key(code, down) {
      code = String(code == null ? '' : code);
      if (!ACTION_KEYS[code]) return false;
      if (!D) { if (!down) held[code] = false; return false; }
      if (down) { if (!held[code]) press(); held[code] = true; hold(true); }
      else { held[code] = false; var any = false; for (var k in held) if (held[k]) any = true; if (!any) hold(false); }
      return true;
    }

    /* ---------- drawing ---------- */
    function frame16(ctx, r, team) {
      var x = r.x, y = r.y, w = r.w, h = r.h, C = WIN[team] || WIN.a, i, pa = ctx.globalAlpha;
      if (w < 6 || h < 6) { ctx.fillStyle = FB.ink; ctx.fillRect(x, y, w, h); return; }
      ctx.globalAlpha = pa * 0.95;
      for (i = 0; i < h - 2; i++) { ctx.fillStyle = C[Math.min(3, Math.floor(i / (h - 2) * 4))]; ctx.fillRect(x + 1, y + 1 + i, w - 2, 1); }
      ctx.globalAlpha = pa; ctx.fillStyle = FB.ink;
      ctx.fillRect(x + 2, y, w - 4, 1); ctx.fillRect(x + 2, y + h - 1, w - 4, 1); ctx.fillRect(x, y + 2, 1, h - 4); ctx.fillRect(x + w - 1, y + 2, 1, h - 4);
      ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + w - 2, y + 1, 1, 1); ctx.fillRect(x + 1, y + h - 2, 1, 1); ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
      ctx.fillStyle = C[4]; ctx.fillRect(x + 2, y + 1, w - 4, 1); ctx.fillRect(x + 1, y + 2, 1, h - 5);
      ctx.fillStyle = C[5]; ctx.fillRect(x + 2, y + h - 2, w - 4, 1); ctx.fillRect(x + w - 2, y + 2, 1, h - 4);
      if (h >= 12) [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]].forEach(function (p) { ctx.fillStyle = FB['ui.rivetShade']; ctx.fillRect(p[0], p[1], 2, 2); ctx.fillStyle = FB['ui.rivet']; ctx.fillRect(p[0], p[1], 1, 1); });
    }
    function plate16(ctx, r) {
      ctx.fillStyle = FB['ui.plateEdge']; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = FB['ui.plate']; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      ctx.fillStyle = FB['ui.plateLight']; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 1);
    }
    function frameAny(ctx, r, role, team) {
      if (SK) { try { SK.frame(ctx, r, { role: role, team: team }); return; } catch (e) { } }
      if (role === 'plate') plate16(ctx, r); else frame16(ctx, r, team);
    }
    function arrow(ctx, x, y, endMark) {
      var ol = tok('text.pointerEdge') || FB['text.pointerEdge'], fill = tok('text.pointer') || tok('text.main') || '#ffffff';
      if (!pixelSkin()) { try { SK.text(ctx, endMark ? '■' : '▼', x + 3, y - 3, { font: 'ui', color: tok('text.main') || fill, align: 'center' }); return; } catch (e) { } }
      ctx.fillStyle = ol;
      if (endMark) { ctx.fillRect(x, y - 1, 6, 6); ctx.fillStyle = fill; ctx.fillRect(x + 1, y, 4, 4); ctx.fillStyle = tok('text.accent') || FB['text.accent']; ctx.fillRect(x + 1, y, 4, 1); return; }
      ctx.fillRect(x - 1, y - 1, 7, 2); ctx.fillRect(x, y + 1, 5, 1); ctx.fillRect(x + 1, y + 2, 3, 1); ctx.fillRect(x + 2, y + 3, 1, 1);
      ctx.fillStyle = fill; ctx.fillRect(x, y, 5, 1); ctx.fillRect(x + 1, y + 1, 3, 1); ctx.fillRect(x + 2, y + 2, 1, 1);
    }
    function draw(ctx, ox, oy) {
      drawnRects = [];
      if (!ctx) return;
      try { if (ctx.canvas) lastCanvas = ctx.canvas; } catch (e) { }
      var d = D; if (!d) return;
      try {
        if (d.pending) { layout(); if (d.pending) return; }
        ox = num(ox, 0); oy = num(oy, 0);
        ctx.save();
        try { paint(ctx, d, ox, oy); } finally { ctx.restore(); }
      } catch (e) { warnOnce('draw', 'draw failed: ' + e); }
    }
    function paint(ctx, d, ox, oy) {
      if (pixelSkin()) ctx.imageSmoothingEnabled = false;
      var B = d.box, open = 1;
      if (d.stage === 'open') open = P.openMs > 0 ? clamp(d.t / P.openMs, 0, 1) : 1;
      if (d.stage === 'close') open = P.openMs > 0 ? 1 - clamp(d.t / P.openMs, 0, 1) : 0;
      if (pixelSkin()) open = Math.round(open * 4) / 4;
      if (P.dim > 0 && open > 0) { var f = field(); if (f) { ctx.globalAlpha = P.dim * open; ctx.fillStyle = tok('ink') || FB.ink; ctx.fillRect(f.x + ox, f.y + oy, f.w, f.h); ctx.globalAlpha = 1; } }
      if (open <= 0) return;
      var line = d.lines[d.i] || { text: '' }, team = String(line.tint || d.opt.tint || P.tint);
      if (!WIN[team]) team = 'a';
      var bh = Math.max(4, Math.round(B.h * open)), by = B.y + oy + Math.round((B.h - bh) / 2), bx = B.x + ox;
      frameAny(ctx, { x: bx, y: by, w: B.w, h: bh }, 'window', team);
      drawnRects.push({ kind: 'box', x: B.x + ox, y: B.y + oy, w: B.w, h: B.h });
      if (open < 1) return;
      // name tag on the top edge, on the speaker's side
      var name = line.speaker != null && line.speaker !== '' ? String(line.speaker) : '';
      if (name && P.nameTag !== 'off') {
        var tw = textW(name) + 12, right = d.spk && d.spk.x + d.spk.w / 2 > B.x + B.w / 2 + B.w * 0.18;
        tw = Math.min(tw, B.w - 16);
        var tx = right ? bx + B.w - 8 - tw : bx + 8, ty = by - TAG_UP;
        frameAny(ctx, { x: tx, y: ty, w: tw, h: TAG_H }, 'plate', team);
        drawRun(ctx, plainItems(name), name.length, tx + 6, ty + 2, colorOf(line.nameColor) || tok('text.gold') || FB['text.gold']);
        drawnRects.push({ kind: 'tag', x: tx - ox, y: ty - oy, w: tw, h: TAG_H, text: name });
      }
      // text: the current page, revealed up to d.shown items
      var pg = d.pages[d.page] || [], left = d.stage === 'type' ? d.shown : Infinity, tx0 = bx + PADX, ty0 = by + PADY;
      for (var r = 0; r < pg.length && left > 0; r++) {
        var n = Math.min(pg[r].length, left); drawRun(ctx, pg[r], n, tx0, ty0 + r * LH); left -= pg[r].length;
      }
      // the "more" arrow (blinks and bobs) once the page is complete; a square on the very last page
      if (P.arrow !== 'off' && d.stage === 'wait') {
        var ph = Math.floor(clock / 190) % 3, endMark = d.page >= d.pages.length - 1 && d.i >= d.lines.length - 1;
        if (ph !== 2) { var ax = bx + B.w - 18, ay = by + B.h - 4 + (ph === 1 ? 1 : 0); arrow(ctx, ax, ay, endMark); drawnRects.push({ kind: 'arrow', x: ax - 1 - ox, y: ay - 1 - oy, w: 7, h: 6 }); }
      }
    }

    /* ---------- public ---------- */
    return {
      open: open,
      say: function (speaker, text, opt) { return open([{ speaker: speaker, text: text }], opt); },
      busy: function () { return !!D; },
      press: press,
      tap: function () { return press(); },
      hold: hold,
      key: key,
      update: update,
      draw: draw,
      next: next,
      goto: go,
      insert: insert,
      end: end,
      auto: function (on) { if (!D) return false; D.auto = on !== false; if (D.auto) { D.heldNow = false; D.latch = false; } return true; },
      clear: function () { D = null; held = {}; drawnRects = []; },
      state: function () {
        var d = D; if (!d) return null;
        var line = d.lines[d.i] || {}, items = d.pages.length ? pageItems() : [], total = items.length, shown = d.stage === 'type' ? Math.min(d.shown, total) : d.stage === 'open' ? 0 : total;
        return { id: d.id, stage: d.stage, index: d.i, lines: d.lines.length, page: d.page, pages: d.pages.length, shown: shown, total: total,
          speaker: line.speaker == null ? null : String(line.speaker), who: keyOf(line), text: String(line.text == null ? '' : line.text),
          visible: items.slice(0, shown).map(function (it) { return it.ch || ''; }).join(''), auto: d.auto, fastForward: ff(),
          box: d.box ? { x: d.box.x, y: d.box.y, w: d.box.w, h: d.box.h } : null, anchor: d.spk ? { x: d.spk.x, y: d.spk.y, w: d.spk.w, h: d.spk.h } : null };
      },
      lastResult: function () { return last; },
      rect: function () { return D && D.box ? { x: D.box.x, y: D.box.y - D.box.up, w: D.box.w, h: D.box.h + D.box.up } : null; },
      lastDrawn: function () { return drawnRects.slice(); },
      setParams: function (p) { setParams(p); CC = {}; MW = {}; },
      params: function () { var c = {}; for (var k in DEFAULTS) c[k] = P[k]; return c; },
      measure: function (s) { return textW(s); }
    };
  }

  root.GameDNA_DialogueBox = { version: VERSION, DEFAULTS: DEFAULTS, create: create };
})(typeof window !== 'undefined' ? window : this);
