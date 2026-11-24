/* GameDNA C-15 - Keyword tooltips (keyword-tooltips) - module v1.2.1 (plain script, no dependencies, one global)
 *
 *   const tips = GameDNA_KeywordTooltips.create({
 *     canvas,                                   // the game canvas: pointer + keyboard listeners, CSS scale for readable text
 *     view: { w: 320, h: 180 },                 // the coordinate space your draw calls and rects use (or a function)
 *     keywords: { burn: { title: 'Burn', kind: 'Status', icon: 'flame', color: '#ff9a3c',
 *                         text: 'Takes 2 damage at [turn-start]. Lasts 3 turns.' }, ... },
 *     uiRects: () => [hudRect, ...],            // optional: boxes tooltips should rather not cover
 *     avoid: () => [unitBox, ...],              // optional: what must stay visible even more (characters, the selected unit)
 *     params: { render: 'auto', theme: 'slate', delay: 180, ... }   // see DEFAULTS
 *   });
 *   tips.setText('card-1', 'Deal 6 damage. Apply 2 [burn].', { x, y, w });   // a rich-text block (anywhere, kept until changed)
 *   tips.drawText(ctx, 'card-1');               // in your render, where the text belongs
 *   tips.text(ctx, 'hint', markup, x, y, { w }) // or both in one call from the render (lives for this frame)
 *   tips.mark('foe-burn', 'burn', { x, y, w, h })   // a word or icon YOU drew becomes a keyword (call in the render)
 *   tips.update(stepMs);                        // every fixed step
 *   tips.draw(ctx);                             // last, after everything else, same transform as the text
 *
 * Rich text: words, [keyword] or [keyword|shown text], numbers highlighted, \n for a new line. Hovering a keyword (mouse),
 * a long-press or a tap (touch) or keyboard focus (Tab / Shift+Tab, focusKey) opens its tooltip: icon, title, kind, text.
 * A keyword inside a tooltip opens a second tooltip next to it (depth param). Click / tap / pinKey pins a tooltip so the
 * pointer can travel into it; Esc or a click outside closes. Placement: inside the view, never over the hovered word,
 * avoiding uiRects and the parent tooltip; tooltips fade and glide, they never jump. Crisp bitmap fonts at integer scale on
 * pixel canvases (view <= 512 wide), smooth canvas text on HD canvases; text grows on small screens (minCssPx).
 * The module never pauses the game and consumes only: presses on keywords and tooltips, Tab, the pin key, and Escape while
 * something of its own is open. Never throws from update / draw / input. ASCII only.
 */
(function (root) {
  'use strict';
  var VERSION = '1.2.1';
  var DEFAULTS = { render: 'auto', theme: 'slate', delay: 180, grace: 260, longPress: 420, depth: 3, maxW: 0, minCssPx: 10, fontPx: 0,
    focusKey: 'Tab', pinKey: 't', closeKey: 'Escape', hints: 'on', numbers: 'on', notch: 'on', tapOpens: 'on', cursor: 'on', margin: 0 };
  var FAMILY = '"Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  var OPEN_MS = 120, CLOSE_MS = 90, WARM_MS = 320, WARM_DELAY = 100, MOVE_CANCEL = 9;

  /* ---------- bitmap fonts ('#' = ink; rows top -> bottom; original designs shared with C-03 / H-03) ---------- */
  var REG = {
    '!': '# # # # # . #', '"': '#.# #.#', '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.', '%': '##... ##..# ...#. ..#.. .#... #..## ...##',
    '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#', "'": '# #', '(': '..# .#. #.. #.. #.. .#. ..#', ')': '#.. .#. ..# ..# ..# .#. #..',
    '*': '..... ..#.. #.#.# .###. #.#.# ..#..', '+': '..... ..#.. ..#.. ##### ..#.. ..#..', ',': '.. .. .. .. .. ## .# #.', '-': '.... .... .... ####',
    '.': '.. .. .. .. .. ## ##', '/': '....# ...#. ...#. ..#.. .#... .#... #....',
    '0': '.###. #...# #..## #.#.# ##..# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.', '2': '.###. #...# ....# ...#. ..#.. .#... #####',
    '3': '####. ....# ....# .###. ....# ....# ####.', '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.', '5': '##### #.... ####. ....# ....# #...# .###.',
    '6': '..##. .#... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. .#... .#... .#...', '8': '.###. #...# #...# .###. #...# #...# .###.',
    '9': '.###. #...# #...# .#### ....# ...#. .##..', ':': '.. ## ## .. .. ## ##', ';': '.. ## ## .. .. ## .# #.', '<': '...# ..#. .#.. #... .#.. ..#. ...#',
    '=': '.... .... #### .... ####', '>': '#... .#.. ..#. ...# ..#. .#.. #...', '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
    'A': '.###. #...# #...# ##### #...# #...# #...#', 'B': '####. #...# #...# ####. #...# #...# ####.', 'C': '.###. #...# #.... #.... #.... #...# .###.',
    'D': '###.. #..#. #...# #...# #...# #..#. ###..', 'E': '##### #.... #.... ####. #.... #.... #####', 'F': '##### #.... #.... ####. #.... #.... #....',
    'G': '.###. #...# #.... #.### #...# #...# .####', 'H': '#...# #...# #...# ##### #...# #...# #...#', 'I': '### .#. .#. .#. .#. .#. ###',
    'J': '..### ...#. ...#. ...#. #..#. #..#. .##..', 'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#', 'L': '#... #... #... #... #... #... ####',
    'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#', 'N': '#...# ##..# #.#.# #..## #...# #...# #...#', 'O': '.###. #...# #...# #...# #...# #...# .###.',
    'P': '####. #...# #...# ####. #.... #.... #....', 'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#', 'R': '####. #...# #...# ####. #.#.. #..#. #...#',
    'S': '.#### #.... #.... .###. ....# ....# ####.', 'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..', 'U': '#...# #...# #...# #...# #...# #...# .###.',
    'V': '#...# #...# #...# #...# #...# .#.#. ..#..', 'W': '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.', 'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', 'Z': '##### ....# ...#. ..#.. .#... #.... #####', '[': '### #.. #.. #.. #.. #.. ###', ']': '### ..# ..# ..# ..# ..# ###',
    'a': '.... .... .##. ...# .### #..# .###', 'b': '#... #... ###. #..# #..# #..# ###.', 'c': '.... .... .### #... #... #... .###', 'd': '...# ...# .### #..# #..# #..# .###',
    'e': '.... .... .##. #..# #### #... .###', 'f': '..## .#.. #### .#.. .#.. .#.. .#..', 'g': '.... .... .### #..# #..# .### ...# ###.', 'h': '#... #... ###. #..# #..# #..# #..#',
    'i': '# . # # # # #', 'j': '..# ... .## ..# ..# ..# ..# ##.', 'k': '#... #... #..# #.#. ##.. #.#. #..#', 'l': '#. #. #. #. #. #. .#',
    'm': '..... ..... ##.#. #.#.# #.#.# #.#.# #.#.#', 'n': '.... .... ###. #..# #..# #..# #..#', 'o': '.... .... .##. #..# #..# #..# .##.',
    'p': '.... .... ###. #..# #..# ###. #... #...', 'q': '.... .... .### #..# #..# .### ...# ...#', 'r': '.... .... #.## ##.. #... #... #...',
    's': '.... .... .### #... .##. ...# ###.', 't': '.#. .#. ### .#. .#. .#. ..#', 'u': '.... .... #..# #..# #..# #..# .###', 'v': '..... ..... #...# #...# .#.#. .#.#. ..#..',
    'w': '..... ..... #...# #...# #.#.# #.#.# .#.#.', 'x': '..... ..... #...# .#.#. ..#.. .#.#. #...#', 'y': '.... .... #..# #..# #..# .### ...# ###.',
    'z': '.... .... #### ...# .##. #... ####', '~': '..... ..... .#... #.#.# ...#.', '|': '# # # # # # # #'
  };
  var SMALL = {
    '!': '# # # . #', '#': '.#.#. ##### .#.#. ##### .#.#.', '%': '#.# ..# .#. #.. #.#', "'": '# #', '(': '.# #. #. #. .#', ')': '#. .# .# .# #.',
    '+': '... .#. ### .#.', ',': '.. .. .. .. .# #.', '-': '... ... ###', '.': '. . . . #', '/': '..# ..# .#. #.. #..', ':': '. # . # .',
    '0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '##. ..# .#. #.. ###', '3': '##. ..# .#. ..# ##.', '4': '#.# #.# ### ..# ..#',
    '5': '### #.. ##. ..# ##.', '6': '.## #.. ### #.# ###', '7': '### ..# .#. .#. .#.', '8': '### #.# ### #.# ###', '9': '### #.# ### ..# ##.',
    '?': '##. ..# .#. ... .#.', '<': '..# .#. #.. .#. ..#', '>': '#.. .#. ..# .#. #..', '=': '... ### ... ###',
    'A': '.##. #..# #### #..# #..#', 'B': '###. #..# ###. #..# ###.', 'C': '.### #... #... #... .###', 'D': '###. #..# #..# #..# ###.',
    'E': '### #.. ##. #.. ###', 'F': '### #.. ##. #.. #..', 'G': '.### #... #.## #..# .###', 'H': '#..# #..# #### #..# #..#', 'I': '### .#. .#. .#. ###',
    'J': '..## ...# ...# #..# .##.', 'K': '#..# #.#. ##.. #.#. #..#', 'L': '#.. #.. #.. #.. ###', 'M': '#...# ##.## #.#.# #...# #...#', 'N': '#..# ##.# #.## #..# #..#',
    'O': '.##. #..# #..# #..# .##.', 'P': '###. #..# ###. #... #...', 'Q': '.##. #..# #..# #.#. .#.#', 'R': '###. #..# ###. #.#. #..#', 'S': '.### #... .##. ...# ###.',
    'T': '### .#. .#. .#. .#.', 'U': '#..# #..# #..# #..# .##.', 'V': '#.# #.# #.# .#. .#.', 'W': '#...# #...# #.#.# #.#.# .#.#.', 'X': '#.# #.# .#. #.# #.#',
    'Y': '#.# #.# .#. .#. .#.', 'Z': '#### ..#. .#.. #... ####',
    'a': '... ##. .## #.# .##', 'b': '#.. ##. #.# #.# ##.', 'c': '... .## #.. #.. .##', 'd': '..# .## #.# #.# .##', 'e': '... .#. ### #.. .##', 'f': '..# .#. ### .#. .#.',
    'g': '... .## #.# .## ..# ##.', 'h': '#.. ##. #.# #.# #.#', 'i': '# . # # #', 'j': '.# .. .# .# .# #.', 'k': '#.. #.# ##. #.# #.#', 'l': '#. #. #. #. .#',
    'm': '..... ##.#. #.#.# #.#.# #.#.#', 'n': '... ##. #.# #.# #.#', 'o': '... .#. #.# #.# .#.', 'p': '... ##. #.# #.# ##. #..', 'q': '... .## #.# #.# .## ..#',
    'r': '... #.# ##. #.. #..', 's': '... .## #.. ..# ##.', 't': '.#. ### .#. .#. ..#', 'u': '... #.# #.# #.# .##', 'v': '... #.# #.# #.# .#.',
    'w': '..... #...# #.#.# #.#.# .#.#.', 'x': '... #.# .#. .#. #.#', 'y': '... #.# #.# .## ..# ##.', 'z': '... ### ..# #.. ###'
  };
  var FSPEC = { reg: { t: REG, h: 8, cap: 7, space: 3, lineH: 10 }, small: { t: SMALL, h: 6, cap: 5, space: 2, lineH: 7 } };
  var GLY = {};
  function glyphs(name) {
    if (GLY[name]) return GLY[name];
    var S = FSPEC[name], g = {};
    for (var ch in S.t) { var rows = S.t[ch].split(' '), w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length); g[ch] = { rows: rows, w: w }; }
    return (GLY[name] = { g: g, h: S.h, cap: S.cap, space: S.space, lineH: S.lineH });
  }

  /* ---------- icons: 7x7 pixel art (o outline, a body, l light, d dark, w white) and matching vector paths for HD ---------- */
  var ICON_PX = {
    flame: ['...o...', '..olo..', '.olao..', '.oalaoo', 'oaawaao', 'oadwdao', '.ooooo.'],
    drop: ['...o...', '..olo..', '.olao..', 'olaaao.', 'olaaado', 'oaaaddo', '.ooooo.'],
    shield: ['ooooooo', 'olaaaao', 'olaaado', 'olaaado', '.oaado.', '.oaddo.', '..ooo..'],
    sword: ['.....oo', '....olo', '...olo.', 'o.olo..', '.oao...', '.oo....', 'o.o....'],
    heart: ['.oo.oo.', 'olaoaao', 'olaaaao', 'oaaaado', '.oaado.', '..odo..', '...o...'],
    bolt: ['...ooo.', '..olo..', '.olo...', 'olaaao.', '..oao..', '.oao...', '.oo....'],
    leaf: ['....ooo', '..ooaao', '.olaado', 'olaado.', 'oaado..', 'oddo...', 'oo.....'],
    star: ['...o...', '..olo..', 'oolaaoo', 'olaaado', '.oaado.', 'oado.do', 'oo...oo'],
    skull: ['.ooooo.', 'olaaaao', 'oowaowo', 'oaaoaao', '.oaaao.', '.oadao.', '..ooo..'],
    clock: ['.ooooo.', 'olaoaao', 'olaoaao', 'olaoood', 'oaaaado', 'oaaaado', '.ooooo.'],
    eye: ['.......', '.ooooo.', 'olaoaao', 'oaowoao', 'olaoaao', '.ooooo.', '.......'],
    coin: ['.ooooo.', 'olllaao', 'olaoaao', 'olaoaao', 'olaoaao', 'oaaaado', '.ooooo.'],
    chain: ['.oo....', 'olao...', 'oaooo..', '.oo.oo.', '..ooo.o', '...oado', '....oo.'],
    spiral: ['.ooooo.', 'oaaaaao', 'oaoooao', 'oaoaoao', 'oaooaao', 'oaaaao.', '.oooo..']
  };
  var ICON_COL = { flame: '#ff8a3a', drop: '#8fd85a', shield: '#7ec8ff', sword: '#e6e1d6', heart: '#ff5a6a', bolt: '#ffd84a', leaf: '#6fe08a',
    star: '#b48cff', skull: '#d8d2c4', clock: '#e8c27a', eye: '#c79bff', coin: '#ffcf4a', chain: '#a8b0c4', spiral: '#c08cff' };

  /* ---------- small helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function ease(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u) * (1 - u); }
  function hit(a, b, pad) { pad = pad || 0; return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad; }
  function dist(p, r) { var dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h)); return Math.sqrt(dx * dx + dy * dy); }
  function inside(p, r) { return p && r && p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h; }
  function area(a, b) { var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; }
  function mk(w, h) { try { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; } catch (e) { return null; } }
  function hexRGB(h) { var s = String(h || '#ffffff').replace('#', ''); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]; var n = parseInt(s.slice(0, 6), 16); if (!isFinite(n)) n = 0xffffff; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgba(h, a) { var c = hexRGB(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(a, b, k) { var x = hexRGB(a), y = hexRGB(b); return '#' + [0, 1, 2].map(function (i) { var v = Math.round(x[i] + (y[i] - x[i]) * k); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function rectOf(r) {
    if (!r) return null;
    var x = +(r.x != null ? r.x : r[0]), y = +(r.y != null ? r.y : r[1]), w = +(r.w != null ? r.w : r.width != null ? r.width : r[2]), h = +(r.h != null ? r.h : r.height != null ? r.height : r[3]);
    return isFinite(x) && isFinite(y) && w > 0 && h > 0 ? { x: x, y: y, w: w, h: h } : null;
  }
  function keyName(k) { return String(k == null ? '' : k).toLowerCase(); }

  var THEMES = {
    slate: { fill: '#1d1830', fillTo: '#141122', edge: '#5f5486', light: '#3a3158', ink: '#07050c', head: '#110e1c', text: '#ece8f6', dim: '#968fb0',
      num: '#ffe7a3', kw: '#ffc458', focus: '#78d6ff', shadow: 'rgba(3,2,8,0.55)', hl: 0.24, pin: '#ffd25e' },
    parchment: { fill: '#f6ead0', fillTo: '#e6d3aa', edge: '#8a6236', light: '#fff8e6', ink: '#2c1a0c', head: '#ead8b0', text: '#3a2614', dim: '#8a6c4c',
      num: '#9a3a0a', kw: '#a8440e', focus: '#1f7a9a', shadow: 'rgba(40,22,6,0.4)', hl: 0.2, pin: '#a8440e' },
    night: { fill: '#14202c', fillTo: '#0c141c', edge: '#4a7088', light: '#2a4258', ink: '#04080c', head: '#0a121a', text: '#e2eef6', dim: '#86a2b6',
      num: '#ffe39a', kw: '#7fe0ff', focus: '#ffd25e', shadow: 'rgba(0,4,8,0.55)', hl: 0.22, pin: '#7fe0ff' }
  };

  function create(opt) {
    opt = opt || {};
    var P = {}, k0;
    for (k0 in DEFAULTS) P[k0] = DEFAULTS[k0];
    var SK = null; try { SK = root.GameDNA_Skin && opt.skin != null && opt.skin !== false ? root.GameDNA_Skin.resolve(opt.skin) : null; } catch (e) { SK = null; }
    var canvas = opt.canvas || null, KW = {}, blocks = {}, marks = {}, tips = [], fading = [], frameNo = 1, clock = 0, cssScale = 1, cssT = -1e9;
    var hovBlock = null, prevPtr = null, ptr = { x: 0, y: 0, in: false, type: 'mouse', moved: false }, hov = { id: null, t: 0 }, press = null, queue = [], focus = null, lastClose = -1e9;
    var drawnList = [], upd = 0, sinceUpd = 0, lastDrawT = null, swallow = 0, lastCursor = null, warned = {};
    var stats = { chainOverlap: 0, opens: 0, closes: 0, pins: 0, nested: 0, maxDepth: 0, placed: 0, fallback: 0, shrunk: 0, truncated: 0, coverAnchor: 0, offView: 0, jumps: 0, maxStep: 0,
      unknown: 0, cycles: 0, consumedPress: 0, consumedKeys: 0, errors: 0, updates: 0, draws: 0, noUpdate: 0, focusMoves: 0, longPress: 0, taps: 0, clicks: 0 };
    var meas = mk(4, 4), mctx = meas ? meas.getContext('2d') : null, WC = {}, WCn = 0;

    function warn(k, msg) { if (warned[k]) return; warned[k] = 1; try { if (root.console) console.warn('[keyword-tooltips] ' + msg); } catch (e) { } }
    function setParams(o) {
      o = o || {};
      for (var k in o) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && o[k] != null && o[k] !== '') P[k] = typeof DEFAULTS[k] === 'number' ? num(o[k], DEFAULTS[k]) : String(o[k]);
      P.depth = clamp(Math.round(P.depth), 1, 6);
      WC = {}; WCn = 0; relayAll();
    }
    function setKeywords(map) {
      KW = {};
      if (Array.isArray(map)) map.forEach(function (d) { if (d && d.id) KW[keyName(d.id)] = d; });
      else for (var k in (map || {})) KW[keyName(k)] = map[k] || {};
      for (var id in KW) (KW[id].aliases || []).forEach(function (a) { if (!KW[keyName(a)]) KW[keyName(a)] = { alias: id }; });
      relayAll();
    }
    function kwOf(key) { var d = KW[keyName(key)]; if (d && d.alias) d = KW[d.alias]; return d || null; }
    function kwId(key) { var d = KW[keyName(key)]; return d && d.alias ? d.alias : keyName(key); }
    function V() {
      var v = null; try { v = typeof opt.view === 'function' ? opt.view() : opt.view; } catch (e) { v = null; }
      var w = v && +v.w > 0 ? +v.w : canvas ? canvas.width : 320, h = v && +v.h > 0 ? +v.h : canvas ? canvas.height : 180;
      return { x: v && +v.x || 0, y: v && +v.y || 0, w: w, h: h };
    }
    function pixelMode() { if (P.render === 'pixel') return true; if (P.render === 'hd') return false; if (SK && SK.pixel) return true; return V().w <= 512; }
    function TH() {
      var base = THEMES[P.theme] || THEMES.slate;
      if (P.theme === 'skin' && SK) {
        var tk = function (p, d) { try { var v = SK.token(p); return typeof v === 'string' && v.charAt(0) === '#' ? v : d; } catch (e) { return d; } }, o = {}, k;
        for (k in THEMES.slate) o[k] = THEMES.slate[k];
        o.fill = tk('ui.fill', o.fill); o.fillTo = tk('ui.fillTo', o.fill); o.edge = tk('ui.edge', o.edge); o.light = tk('ui.highlight', o.light); o.ink = tk('ink', o.ink);
        o.text = tk('text.main', o.text); o.dim = tk('text.dim', o.dim); o.kw = tk('text.accent', o.kw); o.num = tk('text.title', o.num);
        return o;
      }
      return base;
    }
    function updateCss() {
      if (!canvas || !canvas.getBoundingClientRect) { cssScale = 1; return; }
      try { var r = canvas.getBoundingClientRect(), v = V(); if (r.width > 0) cssScale = r.width / v.w; } catch (e) { }
    }

    /* ---------- fonts ---------- */
    // A font = {px, measure(s), draw(ctx, s, x, y, col, bold), h (ink height), cap, lineH, space}. Pixel fonts at integer scale.
    var FC = {};
    function pxFont(name, sc) {
      var key = name + sc; if (FC[key]) return FC[key];
      var G = glyphs(name);
      function wOf(ch) { var g = G.g[ch] || G.g[ch.toUpperCase()]; return g ? g.w : (ch === ' ' ? G.space : 3); }
      var F = { px: true, name: name, sc: sc, h: G.h * sc, cap: G.cap * sc, lineH: G.lineH * sc, space: G.space * sc,
        measure: function (s, bold) { var w = 0; s = String(s); for (var i = 0; i < s.length; i++) w += (s[i] === ' ' ? G.space : wOf(s[i]) + 1); return Math.max(0, (w - (s.length ? 1 : 0)) * sc + (bold ? sc : 0)); },
        draw: function (ctx, s, x, y, col, bold) {
          s = String(s); var key2 = name + '|' + sc + '|' + col + '|' + (bold ? 1 : 0) + '|' + s, c = WC[key2];
          if (!c) {
            var w = F.measure(s, bold) + sc, h = G.h * sc; c = mk(w, h); if (!c) return;
            var g = c.getContext('2d'); g.fillStyle = col; var cx = 0;
            for (var i = 0; i < s.length; i++) {
              var ch = s[i]; if (ch === ' ') { cx += G.space; continue; }
              var gl = G.g[ch] || G.g[ch.toUpperCase()];
              if (gl) for (var r = 0; r < gl.rows.length; r++) for (var q = 0; q < gl.rows[r].length; q++) if (gl.rows[r][q] === '#') { g.fillRect((cx + q) * sc, r * sc, sc, sc); if (bold) g.fillRect((cx + q) * sc + sc, r * sc, sc, sc); }
              cx += (gl ? gl.w : 3) + 1;
            }
            if (WCn > 900) { WC = {}; WCn = 0; } WC[key2] = c; WCn++;
          }
          ctx.drawImage(c, Math.round(x), Math.round(y));
        } };
      return (FC[key] = F);
    }
    function hdFont(size, weight, family) {
      var key = 'hd' + size + weight + (family || ''); if (FC[key]) return FC[key];
      var css = weight + ' ' + size + 'px ' + (family || FAMILY);
      var F = { px: false, size: size, h: Math.round(size * 1.18), cap: Math.round(size * 0.72), lineH: Math.round(size * 1.38), space: 0, css: css,
        measure: function (s) { if (!mctx) return String(s).length * size * 0.55; mctx.font = css; return mctx.measureText(String(s)).width; },
        draw: function (ctx, s, x, y, col) { ctx.font = css; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = col; ctx.fillText(String(s), x, y + Math.round(size * 0.04)); } };
      F.space = F.measure(' ');
      return (FC[key] = F);
    }
    function hostFont(f) {   // a font supplied by the host: {measure(s), draw(ctx, s, x, y, color), h, lineH}
      if (!f || typeof f.measure !== 'function' || typeof f.draw !== 'function') return null;
      if (f.__kt) return f.__kt;
      var F = { px: !!f.pixel, underline: num(f.underline, 1), h: num(f.h, 8), cap: num(f.cap, num(f.h, 8)), lineH: num(f.lineH, num(f.h, 8) + 3), host: true,
        measure: function (s) { try { return +f.measure(String(s)) || 0; } catch (e) { stats.errors++; return String(s).length * 4; } },
        draw: function (ctx, s, x, y, col, bold) { try { f.draw(ctx, String(s), Math.round(x), Math.round(y), col, bold); } catch (e) { stats.errors++; } } };
      F.space = num(f.space, F.measure(' ') || 2);
      try { Object.defineProperty(f, '__kt', { value: F, enumerable: false }); } catch (e) { }
      return F;
    }
    // u = the UI unit: 1 pixel-font pixel (integer scale) or ~1/14 of the HD body size
    function uiScale() {
      var v = V();
      if (pixelMode()) {
        var want = P.fontPx > 0 ? P.fontPx : 7;
        return Math.max(1, Math.round(want / 7), Math.ceil(P.minCssPx / (7 * Math.max(0.05, cssScale)) - 0.05));
      }
      var base = P.fontPx > 0 ? P.fontPx : clamp(Math.round(v.h / 26), 12, 22);
      return Math.max(base, (P.minCssPx + 3) / Math.max(0.05, cssScale)) / 14;
    }
    function tipFonts(uo) {
      var u = uo || uiScale();
      if (pixelMode()) return { u: u, body: pxFont('reg', u), title: pxFont('reg', u), tag: pxFont('small', u), px: true };
      var s = Math.round(14 * u * 10) / 10;
      return { u: u, body: hdFont(s, 500), title: hdFont(Math.round(s * 1.08 * 10) / 10, 700), tag: hdFont(Math.round(s * 0.72 * 10) / 10, 700), px: false };
    }
    function blockFont(o) {
      var hf = hostFont(o.font); if (hf) return hf;
      var px = o.render ? o.render === 'pixel' : pixelMode();
      if (px) { var nm = o.font === 'small' ? 'small' : 'reg'; return pxFont(nm, Math.max(1, Math.round(num(o.scale, 1)))); }
      return hdFont(num(o.size, 14), o.weight || 500, typeof o.font === 'string' && o.font !== 'small' && o.font !== 'reg' ? o.font : null);
    }

    /* ---------- rich text layout ---------- */
    var RX = /\[([^\]|]+)(?:\|([^\]]+))?\]/g;
    function parse(markup, ownKey, depthOk) {
      var s = String(markup == null ? '' : markup), out = [], last = 0, m;
      RX.lastIndex = 0;
      function plain(str) {
        var parts = str.split(/(\n| +)/);
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i]; if (!p) continue;
          if (p === '\n') out.push({ nl: true });
          else if (/^ +$/.test(p)) out.push({ sp: true });
          else out.push({ t: p, k: P.numbers === 'on' && /^[+\-x]?\d+(%|x)?[.,;:!)]*$/.test(p) ? 'num' : 't' });
        }
      }
      while ((m = RX.exec(s))) {
        if (m.index > last) plain(s.slice(last, m.index));
        var key = keyName(m[1].trim()), d = kwOf(key), shown = m[2] != null ? m[2] : d ? (d.title || m[1]) : m[1];
        if (!d) { stats.unknown++; warn('kw:' + key, 'unknown keyword [' + key + ']: shown as plain text'); plain(shown); }
        else out.push({ t: shown, k: 'kw', key: kwId(key), live: depthOk !== false && kwId(key) !== ownKey });
        last = m.index + m[0].length;
      }
      if (last < s.length) plain(s.slice(last));
      return out;
    }
    // -> {lines: [{y, h, items: [{x, w, t, k, key, live}]}], w, h, anchors: [{key, x, y, w, h, i}]}
    function layout(markup, F, maxW, o) {
      o = o || {};
      var toks = parse(markup, o.own, o.depthOk), lines = [], line = { items: [], w: 0 }, pendingSp = false, i, gap = F.space;
      function push() { lines.push(line); line = { items: [], w: 0 }; pendingSp = false; }
      // group glued tokens (no space between) into units that wrap together
      var units = [], u = null;
      for (i = 0; i < toks.length; i++) {
        var tk = toks[i];
        if (tk.nl) { if (u) units.push(u); u = null; units.push({ nl: true }); continue; }
        if (tk.sp) { if (u) units.push(u); u = null; units.push({ sp: true }); continue; }
        if (!u) u = { parts: [], w: 0 };
        var w = F.measure(tk.t, tk.k === 'kw' && F.px && o.boldKw);
        u.parts.push({ t: tk.t, k: tk.k, key: tk.key, live: tk.live, w: w }); u.w += w + (u.parts.length > 1 && F.px ? F.sc || 1 : 0);
      }
      if (u) units.push(u);
      for (i = 0; i < units.length; i++) {
        var un = units[i];
        if (un.nl) { push(); continue; }
        if (un.sp) { if (line.items.length) pendingSp = true; continue; }
        var need = un.w + (pendingSp ? gap : 0);
        if (line.items.length && line.w + need > maxW) push();
        var x = line.w + (pendingSp && line.items.length ? gap : 0);
        for (var j = 0; j < un.parts.length; j++) { var pt = un.parts[j]; line.items.push({ x: x, w: pt.w, t: pt.t, k: pt.k, key: pt.key, live: pt.live }); x += pt.w + (F.px ? F.sc || 1 : 0); }
        line.w = x - (F.px ? F.sc || 1 : 0); pendingSp = false;
      }
      if (line.items.length || !lines.length) push();
      var y = 0, maxw = 0, anchors = [], n = 0;
      lines.forEach(function (L) { L.y = y; L.h = F.lineH; y += F.lineH; maxw = Math.max(maxw, L.w);
        L.items.forEach(function (it) { if (it.k === 'kw' && it.live) anchors.push({ key: it.key, x: it.x, y: L.y, w: it.w, h: F.h, i: n++ }); }); });
      var gapBelow = F.lineH - F.h;
      return { lines: lines, w: Math.ceil(maxw), h: Math.max(F.h, y - gapBelow), anchors: anchors, F: F, boldKw: !!o.boldKw };
    }
    function relayAll() { for (var id in blocks) blocks[id].lay = null; }

    /* ---------- text blocks and marks (the base layer of keywords) ---------- */
    function setText(id, markup, o) {
      try {
        id = String(id); o = o || {};
        var b = blocks[id], sig = markup + '|' + JSON.stringify([o.w, o.font && o.font.__kt ? 'host' : o.font, o.size, o.scale, o.render, o.weight, o.align]);
        if (!b || b.sig !== sig) { b = blocks[id] = { id: id, markup: markup, o: o, sig: sig, lay: null, frame: false, stamp: frameNo, visible: true }; }
        b.o = o; b.x = num(o.x, b.x || 0); b.y = num(o.y, b.y || 0); b.visible = o.visible !== false; b.frame = !!o.__frame; b.stamp = frameNo;
        if (!b.lay) b.lay = layout(markup, blockFont(o), num(o.w, 1e9), { boldKw: !!o.boldKw });
        return { w: b.lay.w, h: b.lay.h, lines: b.lay.lines.length };
      } catch (e) { stats.errors++; return { w: 0, h: 0, lines: 0 }; }
    }
    function blockAnchors(b) {
      if (!b || !b.lay || !b.visible) return [];
      var ax = b.x + (b.o.align === 'center' ? -b.lay.w / 2 : b.o.align === 'right' ? -b.lay.w : 0);
      return b.lay.anchors.map(function (a) { return { id: b.id + '#' + a.i, key: a.key, x: ax + a.x, y: b.y + a.y, w: a.w, h: a.h, level: 0 }; });
    }
    function drawBlock(ctx, b, hl) {
      if (!b || !b.lay || !b.visible) return;
      var F = b.lay.F, o = b.o, T = TH(), ax = b.x + (o.align === 'center' ? -b.lay.w / 2 : o.align === 'right' ? -b.lay.w : 0);
      var col = o.color || T.text, dark = o.tone === 'dark';
      drawLines(ctx, b.lay, ax, b.y, col, dark, b.id, 0, hl, o.shadow);
    }
    function kwColor(key, dark) { var d = kwOf(key), c = (d && d.color) || TH().kw; return dark ? mix(c, '#000000', 0.45) : c; }
    function drawLines(ctx, lay, x0, y0, col, dark, idBase, level, hl, shadow) {
      var F = lay.F, T = TH(), n = 0, u = F.px ? (F.sc || 1) : Math.max(1, F.h / 16);
      for (var li = 0; li < lay.lines.length; li++) {
        var L = lay.lines[li];
        for (var j = 0; j < L.items.length; j++) {
          var it = L.items[j], x = x0 + it.x, y = y0 + L.y, c = col;
          if (it.k === 'kw') {
            c = kwColor(it.key, dark);
            if (it.live) {
              var aid = idBase + '#' + (n++), state = hl ? hl(aid) : 0;
              if (state) {   // hovered / open / focused: a soft plate behind the word
                ctx.save(); ctx.fillStyle = rgba(c, state === 2 ? T.hl + 0.1 : T.hl); ctx.globalAlpha = 1;
                if (F.px) ctx.fillRect(Math.round(x - u), Math.round(y - u), Math.round(it.w + 2 * u), Math.round(F.h + 2 * u));
                else { rr(ctx, x - 2 * u, y - 1.5 * u, it.w + 4 * u, F.h + 3 * u, 3 * u); ctx.fill(); }
                ctx.restore();
              }
              // dotted underline below the descenders
              ctx.fillStyle = rgba(c, 0.85);
              var uy = Math.round(y + F.h + (F.host ? Math.max(1, F.underline || 1) : F.px ? 0 : u));
              if (F.px) for (var dx = 0; dx < it.w; dx += 2 * u) ctx.fillRect(Math.round(x + dx), uy, u, u);
              else for (var dx2 = 0; dx2 < it.w; dx2 += 4 * u) ctx.fillRect(x + dx2, uy, Math.min(2 * u, it.w - dx2), Math.max(1, u));
            }
          } else if (it.k === 'num') c = dark ? mix(T.num, '#000000', 0.55) : T.num;
          if (shadow) F.draw(ctx, it.t, x + (F.px ? u : 1), y + (F.px ? u : 1), shadow, false);
          F.draw(ctx, it.t, x, y, c, it.k === 'kw' && F.px && lay.boldKw);
        }
      }
    }
    function rr(ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    }
    function mark(id, key, rect, o) {
      try {
        var r = rectOf(rect); if (!r || !kwOf(key)) { if (!kwOf(key)) { stats.unknown++; warn('kw:' + key, 'unknown keyword [' + key + '] in mark()'); } return false; }
        marks[String(id)] = { id: String(id), key: kwId(key), x: r.x, y: r.y, w: r.w, h: r.h, stamp: frameNo, o: o || {} };
        return true;
      } catch (e) { stats.errors++; return false; }
    }
    function baseAnchors() {
      var out = [], id;
      for (id in blocks) { var b = blocks[id]; if (b.frame && b.stamp < frameNo - 1) continue; out = out.concat(blockAnchors(b)); }
      for (id in marks) { var m = marks[id]; if (m.stamp < frameNo - 1) continue; out.push({ id: 'mark:' + id, key: m.key, x: m.x, y: m.y, w: m.w, h: m.h, level: 0, mark: true }); }
      out.sort(function (a, b) { return Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x; });
      return out;
    }
    function tipAnchors(t, withHidden) {   // a tooltip hidden behind a stacked child has no live keywords (only for tracking)
      if (!t || !t.lay || (t.hiddenBy && !withHidden)) return [];
      return t.lay.body.anchors.map(function (a) { return { id: t.uid + '#' + a.i, key: a.key, x: t.pos.x + t.lay.bx + a.x, y: t.pos.y + t.lay.by + a.y, w: a.w, h: a.h, level: t.level + 1, tip: t }; });
    }
    function layerAnchors(level) { return level === 0 ? baseAnchors() : tipAnchors(tips[level - 1], true); }
    function findAnchor(id) {
      if (!id) return null;
      var all = baseAnchors(); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
      for (var j = 0; j < tips.length; j++) { var A = tipAnchors(tips[j], true); for (var q = 0; q < A.length; q++) if (A[q].id === id) return A[q]; }
      return null;
    }

    /* ---------- tooltip content ---------- */
    var uidN = 0;
    function tipLayout(key, level, via, uo, pinned, crumbOf) {   // crumbOf: the parent's title when this tooltip stacks over it
      var d = kwOf(key) || {}, Fs = tipFonts(uo), u = Fs.u, v = V(), m = margin();
      var pad = Fs.px ? 4 * u : Math.round(10 * u), iconS = Fs.px ? 7 * u : Math.round(15 * u), gapI = Fs.px ? 3 * u : Math.round(7 * u);
      var title = d.title || key, kind = String(d.kind || '').toUpperCase(), titleW = Fs.title.measure(title) + (Fs.px ? u : 0), kindW = kind ? Fs.tag.measure(kind) : 0;
      var headW = iconS + gapI + titleW + (kind ? (Fs.px ? 6 * u : 12 * u) + kindW : 0);
      var hint = '';
      if (P.hints === 'on' && via === 'key' && !pinned) hint = (P.pinKey.length === 1 ? P.pinKey.toUpperCase() : P.pinKey) + ' pin   ' + (P.focusKey === 'Tab' ? 'Tab' : P.focusKey) + ' next   Esc close';
      var hintW = hint ? Fs.tag.measure(hint) : 0;
      var crumb = crumbOf ? '< ' + String(crumbOf).toUpperCase() : '', crumbW = crumb ? Fs.tag.measure(crumb) : 0, crumbH = crumb ? Fs.tag.h + (Fs.px ? 4 * u : Math.round(7 * u)) : 0;
      var cap = P.maxW > 0 ? P.maxW * (Fs.px ? 1 : u) : (Fs.px ? 150 * u : Math.round(300 * u));
      var widths = [Math.min(cap, v.w - 2 * m), Math.min(Math.round(cap * 1.35), v.w - 2 * m), v.w - 2 * m, Math.min(Math.round(cap * 0.75), v.w - 2 * m), Math.min(Math.round(cap * 0.58), v.w - 2 * m)];
      var depthOk = level + 1 < P.depth, out = [];
      for (var wi = 0; wi < widths.length; wi++) {
        var inner = Math.max(40 * (Fs.px ? u : 1), widths[wi] - 2 * pad);
        var body = layout(d.text || '', Fs.body, inner, { own: kwId(key), depthOk: depthOk });
        var w = Math.ceil(Math.max(body.w, headW, hintW, crumbW, Fs.px ? 60 * u : 150 * u) + 2 * pad);
        w = Math.min(w, v.w - 2 * m);
        var headH = Math.max(iconS, Fs.title.h), divY = pad + crumbH + headH + (Fs.px ? 3 * u : Math.round(6 * u));
        var by = divY + (Fs.px ? 4 * u : Math.round(8 * u));
        var h = by + body.h + (hint ? (Fs.px ? 5 * u : 8 * u) + Fs.tag.h : 0) + pad + (Fs.px ? u : 0);
        out.push({ crumb: crumb, crumbW: crumbW, crumbH: crumbH, crumbOf: crumbOf || null, w: w, h: h, pad: pad, iconS: iconS, gapI: gapI, title: title, kind: kind, kindW: kindW, titleW: titleW, headH: headH, divY: divY, bx: pad, by: by, body: body, hint: hint, Fs: Fs, u: u, icon: d.icon, image: d.image || null, color: d.color || TH().kw });
      }
      return out;
    }
    function margin() { var v = V(); return P.margin > 0 ? P.margin : pixelMode() ? Math.max(2, uiScale()) : Math.max(4, Math.round(v.w / 160)); }

    /* ---------- placement: inside the view, never over the hovered word ---------- */
    function rectList(src) { var out = []; try { var r = typeof src === 'function' ? src() : src; (r || []).forEach(function (q) { var x = rectOf(q); if (x) out.push(x); }); } catch (e) { stats.errors++; } return out; }
    function uiList() { return rectList(opt.uiRects); }
    function place(t, prefer) {
      var v = V(), m = margin(), A = t.anchor, L = t.lays, u = L[0].u, gap = (pixelMode() ? 3 : 7) * u;
      var B = { x: v.x + m, y: v.y + m, w: v.w - 2 * m, h: v.h - 2 * m }, ui = uiList(), av = rectList(opt.avoid);
      if (t.stack) { unhide(t); t.stack = false; t.attachLevel = null; }
      function chainOf(n) { var r = []; for (var i = 0; i < n; i++) if (tips[i] && tips[i].rectT && !tips[i].hiddenBy) r.push(tips[i].rectT); return r; }
      function inB(R) { return R.x >= B.x - 0.01 && R.y >= B.y - 0.01 && R.x + R.w <= B.x + B.w + 0.01 && R.y + R.h <= B.y + B.h + 0.01; }
      function onList(R, list) { for (var k = 0; k < list.length; k++) if (hit(R, list[k], u)) return true; return false; }
      function onAvoid(R) { for (var k = 0; k < av.length; k++) if (hit(R, av[k])) return true; return false; }
      function guardOf(W, uu) { uu = uu || u; return { x: W.x - uu, y: W.y - uu, w: W.w + 2 * uu, h: W.h + 2 * uu + (pixelMode() ? uu : 2 * uu) }; }
      var anc = chainOf(t.level), guard = guardOf(A);
      // hysteresis: keep the same spot, carried along with the word (re-anchored on the word's side when the size changes)
      if (t.rectT && t.placedA && !t.clipH && t.li != null && L[t.li] && t.lay && Math.abs(t.lay.u - u) < 0.01) {
        var Lk = L[t.li], ox = t.rectT.x + A.x - t.placedA.x, oy = t.rectT.y + A.y - t.placedA.y;
        var K2 = { x: Math.round(ox), y: Math.round(t.side === 'above' ? oy + t.rectT.h - Lk.h : oy), w: Lk.w, h: Lk.h };
        if (inB(K2) && !hit(K2, guard) && !onList(K2, anc) && attached(K2, A, t.side, Lk) && (Math.abs(Lk.h - t.rectT.h) > 0.5 || !onAvoid(K2) || !t.avoidOk)) {
          t.lay = Lk; t.rectT = K2; t.placedA = { x: A.x, y: A.y }; t.anchorSig = sigOf(A) + '|' + v.w + 'x' + v.h + '|' + uiScale(); return;
        }
      }
      // ATTACHED spots only: next to the word, the notch reaching it (the panel spans the word's centre on the notch side)
      function search(Ls, W, chain, strictAvoid, strictChain) {
        var u = Ls[0].u, gap = (pixelMode() ? 3 : 7) * u;   // the layouts' own scale (smaller after a shrink)
        var best = null, G = guardOf(W, u), acx = W.x + W.w / 2, acy = W.y + W.h / 2, nm = (pixelMode() ? 6 : 14) * u;
        for (var li = 0; li < Ls.length; li++) {
          var w = Ls[li].w, h = Ls[li].h, cands = [];
          var x0 = Math.max(B.x, Math.ceil(acx - w + nm)), x1 = Math.min(B.x + B.w - w, Math.floor(acx - nm));
          if (x0 <= x1) {
            var xs = [clamp(Math.round(W.x - Ls[li].pad), x0, x1), clamp(Math.round(acx - w / 2), x0, x1), x0, x1];
            for (var a = 0; a < xs.length; a++) cands.push({ side: 'below', x: xs[a], y: Math.ceil(W.y + W.h + gap + u) });
            for (var b2 = 0; b2 < xs.length; b2++) cands.push({ side: 'above', x: xs[b2], y: Math.floor(W.y - gap - h) });
          }
          var y0 = Math.max(B.y, Math.ceil(acy - h + nm)), y1 = Math.min(B.y + B.h - h, Math.floor(acy - nm));
          if (y0 <= y1) {
            var ys = [clamp(Math.round(W.y - Ls[li].pad - Ls[li].divY / 2), y0, y1), clamp(Math.round(acy - h / 2), y0, y1), y0, y1];
            for (var c2 = 0; c2 < ys.length; c2++) cands.push({ side: 'right', x: Math.ceil(W.x + W.w + gap), y: ys[c2] }, { side: 'left', x: Math.floor(W.x - gap - w), y: ys[c2] });
          }
          for (var ci = 0; ci < cands.length; ci++) {
            var c = cands[ci], R = { x: c.x, y: c.y, w: w, h: h };
            if (!inB(R) || hit(R, G)) continue;
            if (strictChain && onList(R, chain)) continue;
            if (strictAvoid && onAvoid(R)) continue;
            var cost = Math.min(ci, 16) * 2 + li * 60 + (c.side === prefer ? -40 : 0) + Math.abs((R.x + w / 2) - acx) / (u * 40);
            for (var q = 0; q < ui.length; q++) if (!hit(ui[q], G)) cost += area(R, ui[q]) / (u * u) * 0.6;
            for (var o = 0; o < chain.length; o++) cost += area(R, chain[o]) / (u * u) * 3;
            for (var q2 = 0; q2 < av.length; q2++) cost += area(R, av[q2]) / (u * u) * 1.6;
            if (!best || cost < best.cost) best = { cost: cost, x: R.x, y: R.y, w: w, h: h, side: c.side, li: li, L: Ls };
          }
        }
        return best;
      }
      // STACK: the child takes the place of its parent (or of more ancestors), attached to the word that opened the first hidden
      // one; the hidden ones come back when it closes, and its header names the parent ('< BURN')
      var parentTitle = t.level > 0 && tips[t.level - 1] ? ((kwOf(tips[t.level - 1].key) || {}).title || tips[t.level - 1].key) : null;
      var Lc = t.level > 0 ? tipLayout(t.key, t.level, t.via, L[0].u, t.pinned, parentTitle) : L;
      function stackSearch(strictAvoid) {
        for (var j = t.level - 1; j >= 0; j--) {
          if (!tips[j] || !tips[j].anchor || (j > 0 && tips[j - 1] && tips[j - 1].hiddenBy)) continue;   // its word must stay visible
          var r = search(Lc, tips[j].anchor, chainOf(j), strictAvoid, true);
          if (r) { r.stackAt = j; return r; }
        }
        return null;
      }
      function shrinkSearch(strictAvoid) {   // level 0 only: smaller text while it stays readable
        var uu = u;
        for (var n = 0; n < 4; n++) {
          uu = pixelMode() ? uu - 1 : Math.round(uu * 0.85 * 100) / 100;
          var css = (pixelMode() ? 7 : 14) * uu * Math.max(0.05, cssScale);
          if (uu < (pixelMode() ? 1 : 0.5) || css < 0.8 * (pixelMode() ? P.minCssPx : P.minCssPx + 3)) return null;
          var L2 = tipLayout(t.key, t.level, t.via, uu, t.pinned), r = search(L2, A, anc, strictAvoid, true);
          if (r) { stats.shrunk++; return r; }
        }
        return null;
      }
      // order: off the chain and off the characters (own word, then stacked, then smaller text) > covering a character > detaching
      var best = search(L, A, anc, true, true) || (t.level > 0 ? stackSearch(true) : shrinkSearch(true)) ||
        search(L, A, anc, false, true) || (t.level > 0 ? stackSearch(false) : shrinkSearch(false));
      var FA = A;   // the word the fallback band hangs from: a nested tooltip stacks over the whole chain and hangs from the root word
      if (!best && t.level > 0 && tips[0] && tips[0].anchor) { FA = tips[0].anchor; L = Lc; for (var hz0 = 0; hz0 < t.level; hz0++) if (tips[hz0] && !tips[hz0].hiddenBy) { tips[hz0].hiddenBy = t.uid; tips[hz0].showT = null; } t.stack = true; t.attachLevel = 0; }
      if (!best && t.level === 0) { best = search(L, A, anc, false, false); if (best) stats.chainOverlap++; }
      if (!best) {   // nothing on screen fits: the larger band above or below the word, whole lines only
        stats.fallback++; A = FA;
        var Lf = L[L.length - 1], upH = A.y - gap - B.y, dnH = B.y + B.h - (A.y + A.h + gap + u), below = dnH >= upH;
        var hh = Math.max(10, Math.min(Lf.h, below ? dnH : upH));
        if (hh < Lf.h) { stats.truncated++; t.clipH = hh; Lf.hint = ''; Lf.body.lines = Lf.body.lines.filter(function (ln) { return Lf.by + ln.y + Lf.body.F.lineH <= hh - Lf.pad / 2; }); } else t.clipH = 0;
        best = { x: clamp(Math.round(A.x + A.w / 2 - Lf.w / 2), B.x, B.x + B.w - Lf.w), y: below ? Math.ceil(A.y + A.h + gap + u) : Math.floor(A.y - gap - hh), w: Lf.w, h: hh, side: below ? 'below' : 'above', li: L.length - 1, L: L };
      } else t.clipH = 0;
      if (best.stackAt != null) {
        t.stack = true; t.attachLevel = best.stackAt; stats.stacked = (stats.stacked || 0) + 1;
        for (var hz = best.stackAt; hz < t.level; hz++) if (tips[hz] && !tips[hz].hiddenBy) { tips[hz].hiddenBy = t.uid; tips[hz].showT = null; }
      }
      t.lays = best.L || L; t.li = best.li; t.lay = t.lays[best.li]; t.side = best.side; stats.placed++;
      t.rectT = { x: best.x, y: best.y, w: best.w, h: best.h }; t.placedA = { x: A.x, y: A.y };
      t.avoidOk = !onAvoid(t.rectT);
      t.anchorSig = sigOf(A) + '|' + v.w + 'x' + v.h + '|' + uiScale();
    }
    function attached(R, W, side, Lx) {   // the notch can reach W from R on that side
      var u = Lx.u, nm = (pixelMode() ? 6 : 14) * u, gp = (pixelMode() ? 3 : 7) * u + 2 * u + 1;
      if (side === 'below' || side === 'above') { var cx = W.x + W.w / 2; if (cx < R.x + nm - 1 || cx > R.x + R.w - nm + 1) return false; return side === 'below' ? R.y - (W.y + W.h) <= gp : W.y - (R.y + R.h) <= gp; }
      var cy = W.y + W.h / 2; if (cy < R.y + nm - 1 || cy > R.y + R.h - nm + 1) return false; return side === 'right' ? R.x - (W.x + W.w) <= gp : W.x - (R.x + R.w) <= gp;
    }
    function att(t) { return t.stack && t.attachLevel != null && tips[t.attachLevel] ? tips[t.attachLevel].anchor : t.anchor; }
    function sigOf(r) { return r ? Math.round(r.x * 2) + ',' + Math.round(r.y * 2) + ',' + Math.round(r.w) + ',' + Math.round(r.h) : ''; }

    /* ---------- open / close / pin ---------- */
    function openTip(anchor, level, via, pinned) {
      var key = anchor.key;
      for (var i = 0; i < level && i < tips.length; i++) if (tips[i].key === key) { stats.cycles++; tips[i].pulse = clock; return null; }   // already open above: pulse it
      closeFrom(level, true);
      var t = { uid: 'tip' + (++uidN), key: key, level: level, anchorId: anchor.id, anchor: { x: anchor.x, y: anchor.y, w: anchor.w, h: anchor.h }, pinned: !!pinned, via: via, born: clock, pulse: -1e9, keep: clock };
      t.lays = tipLayout(key, level, via, null, pinned);
      place(t, null);
      var dx = t.side === 'below' ? 0 : t.side === 'above' ? 0 : t.side === 'right' ? -1 : 1, dy = t.side === 'below' ? -1 : t.side === 'above' ? 1 : 0, s = (pixelMode() ? 2 : 4) * t.lay.u;
      t.pos = { x: t.rectT.x, y: t.rectT.y }; t.slide = { x: dx * s, y: dy * s };
      tips[level] = t; tips.length = level + 1;
      if (pinned) for (var pa = 0; pa < level; pa++) if (tips[pa] && !tips[pa].pinned) { tips[pa].pinned = true; relay(tips[pa]); cb('onPin', tips[pa].key, pa, true); }
      stats.opens++; if (level > 0) stats.nested++; stats.maxDepth = Math.max(stats.maxDepth, level + 1); if (pinned) stats.pins++;
      cb('onOpen', key, level, via); if (pinned) cb('onPin', key, level, true);
      return t;
    }
    function closeFrom(level, quiet) {
      for (var i = tips.length - 1; i >= level; i--) { var t = tips[i]; if (!t) continue; unhide(t); if (!t.hiddenBy) { t.closeT = clock; fading.push(t); } stats.closes++; lastClose = clock; cb('onClose', t.key, t.level); }
      if (tips.length > level) tips.length = Math.max(0, level);
    }
    function unhide(t) { for (var i = 0; i < tips.length; i++) if (tips[i] && tips[i].hiddenBy === t.uid) { tips[i].hiddenBy = null; tips[i].showT = clock; } }
    function pinTip(t, on) {   // pinning a nested tooltip pins its parents too: a pinned child never outlives its chain
      if (!t) return;
      if (on) for (var i = 0; i < t.level; i++) if (tips[i] && !tips[i].pinned) { tips[i].pinned = true; relay(tips[i]); cb('onPin', tips[i].key, i, true); }
      if (t.pinned !== !!on) { t.pinned = !!on; relay(t); if (on) stats.pins++; cb('onPin', t.key, t.level, !!on); }
    }
    function relay(t) {   // the hint line comes and goes with pinning: lay out again, keep the spot (anchored on the word's side)
      if (!t || !t.lay || !t.lay.hint === !(P.hints === 'on' && t.via === 'key' && !t.pinned)) return;
      var li = t.li != null ? t.li : 0, Ln = tipLayout(t.key, t.level, t.via, t.lay.u, t.pinned, t.stack ? t.lay.crumbOf : null), N = Ln[Math.min(li, Ln.length - 1)];
      if (!t.rectT || N.w > t.rectT.w + 0.5 || t.clipH) { t.lays = Ln; place(t, t.side); return; }
      // only the hint line went away: same width, shorter; keep the edge that faces the word, so it stays attached and in place
      var dy = t.side === 'above' ? t.rectT.h - N.h : 0;
      t.lays = Ln; t.li = Math.min(li, Ln.length - 1); t.lay = N; t.rectT = { x: t.rectT.x, y: t.rectT.y + dy, w: t.rectT.w, h: N.h }; t.pos.y += dy;
      if (t.side === 'left') { t.rectT.x += t.rectT.w - N.w; t.pos.x += t.rectT.w - N.w; } t.rectT.w = N.w;
    }
    function cb(name) { var f = opt[name]; if (typeof f !== 'function') return; try { f.apply(null, Array.prototype.slice.call(arguments, 1)); } catch (e) { stats.errors++; } }

    /* ---------- hit tests (also used at event time to decide what to consume) ---------- */
    function tipAt(p) { for (var i = tips.length - 1; i >= 0; i--) { var t = tips[i]; if (t && inside(p, { x: t.pos.x, y: t.pos.y, w: t.rectT.w, h: t.rectT.h })) return t; } return null; }
    function anchorAt(p) {
      var t = tipAt(p);
      if (t) { var A = tipAnchors(t); for (var i = 0; i < A.length; i++) if (inside(p, pad1(A[i]))) return A[i]; return null; }
      var B = baseAnchors(); for (var j = B.length - 1; j >= 0; j--) if (inside(p, pad1(B[j]))) return B[j];
      return null;
    }
    function pad1(a) { var u = Math.max(1, Math.round(uiScale())); return { x: a.x - u, y: a.y - u, w: a.w + 2 * u, h: a.h + 3 * u }; }
    function pinIconRect(t) { if (!t || !t.lay) return null; var L = t.lay, s = L.Fs.px ? 7 * L.u : Math.round(14 * L.u); return { x: t.pos.x + t.rectT.w - L.pad - s, y: t.pos.y + L.pad + (L.crumbH || 0), w: s, h: s }; }

    /* ---------- input (listeners attached to the canvas; hosts without a canvas call pointer() / key()) ---------- */
    function toView(e) {
      var v = V(); if (!canvas) return { x: e.x, y: e.y };
      var r = canvas.getBoundingClientRect(); if (!r.width || !r.height) return null;
      return { x: v.x + (e.clientX - r.left) * v.w / r.width, y: v.y + (e.clientY - r.top) * v.h / r.height };
    }
    function onCanvas(e) { if (!canvas) return true; var r = canvas.getBoundingClientRect(); return e.clientX >= r.left && e.clientY >= r.top && e.clientX < r.right && e.clientY < r.bottom; }
    function pointer(type, x, y, kind) {   // public: type 'move' | 'down' | 'up' | 'leave' | 'cancel'; returns true when the module uses it
      try {
        var p = { x: +x, y: +y }, touch = kind === 'touch' || kind === 'pen';
        if (type === 'move') { if (!touch) { if (focus && (Math.abs(p.x - ptr.x) + Math.abs(p.y - ptr.y)) > 2 * uiScale() && ptr.in) focus = null; ptr.x = p.x; ptr.y = p.y; ptr.in = true; ptr.type = 'mouse'; } else if (press) { press.x = p.x; press.y = p.y; } return false; }
        if (type === 'leave' || type === 'cancel') { if (!touch) ptr.in = false; if (type === 'cancel') press = null; return false; }
        if (type === 'down') {
          var a = anchorAt(p), t = tipAt(p), any = tips.some(function (q) { return q && q.pinned; });
          if (touch) { ptr.in = false; ptr.type = 'touch'; } else { ptr.x = p.x; ptr.y = p.y; ptr.in = true; ptr.type = 'mouse'; }
          if (a || t) { queue.push({ k: 'down', x: p.x, y: p.y, a: a && a.id, touch: touch, tip: t && t.uid }); stats.consumedPress++; return true; }
          if (tips.length) { queue.push({ k: 'outside', touch: touch }); if (touch && any) { stats.consumedPress++; return true; } }
          return false;
        }
        if (type === 'up') { if (press) { queue.push({ k: 'up', x: p.x, y: p.y, touch: touch }); return true; } return false; }
      } catch (e) { stats.errors++; }
      return false;
    }
    function key(name, shift) {    // public: returns true when the module uses the key
      try {
        var n = String(name || ''), base = baseAnchors();
        if (n === P.focusKey || (P.focusKey.length === 1 && n.toLowerCase() === P.focusKey.toLowerCase())) {
          var lv = focus ? focus.level : topPinnedLevel() + 1, L = layerAnchors(lv);
          if (!L.length && lv > 0) { lv = 0; L = base; }
          if (!L.length) return false;
          queue.push({ k: 'focus', dir: shift ? -1 : 1 }); stats.consumedKeys++; return true;
        }
        if (n.length === 1 && P.pinKey.length === 1 ? n.toLowerCase() === P.pinKey.toLowerCase() : n === P.pinKey) {
          if (!focus && !tips.length) return false;
          queue.push({ k: 'pin' }); stats.consumedKeys++; return true;
        }
        if (n === P.closeKey) { if (!focus && !tips.length) return false; queue.push({ k: 'close' }); stats.consumedKeys++; return true; }
      } catch (e) { stats.errors++; }
      return false;
    }
    function topPinnedLevel() { for (var i = tips.length - 1; i >= 0; i--) if (tips[i] && tips[i].pinned) return i; return -1; }
    var L_ = [];
    function listen() {
      if (!canvas || typeof root.addEventListener !== 'function') return;
      var kindOf = function (e) { return e.pointerType || 'mouse'; };
      var on = function (tgt, ev, fn, cap) { tgt.addEventListener(ev, fn, cap ? { capture: true, passive: false } : { passive: true }); L_.push([tgt, ev, fn, cap]); };
      on(root, 'pointermove', function (e) { var p = toView(e); if (!p) return; if (!onCanvas(e) && kindOf(e) === 'mouse') { pointer('leave', 0, 0, 'mouse'); return; } pointer('move', p.x, p.y, kindOf(e)); }, false);
      on(root, 'pointerdown', function (e) {
        if (!onCanvas(e)) { if (tips.length) queue.push({ k: 'outside', touch: kindOf(e) !== 'mouse' }); return; }
        var p = toView(e); if (!p) return;
        if (kindOf(e) === 'mouse') { ptr.x = p.x; ptr.y = p.y; ptr.in = true; }
        if (pointer('down', p.x, p.y, kindOf(e))) { swallow = 2; e.stopPropagation(); e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); }
        else swallow = 0;
      }, true);
      on(root, 'pointerup', function (e) { var p = toView(e); if (p && pointer('up', p.x, p.y, kindOf(e))) { e.stopPropagation(); e.stopImmediatePropagation(); } }, true);
      on(root, 'pointercancel', function () { pointer('cancel', 0, 0, 'touch'); }, true);
      ['mousedown', 'mouseup', 'click', 'touchstart', 'touchend', 'contextmenu'].forEach(function (ev) {
        on(root, ev, function (e) { if (swallow > 0) { e.stopPropagation(); e.stopImmediatePropagation(); if (ev !== 'touchstart' && e.cancelable) e.preventDefault(); if (ev === 'click' || ev === 'touchend') swallow--; } }, true);
      });
      on(root, 'keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (key(e.key, e.shiftKey)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
      }, true);
      on(root, 'resize', function () { cssT = -1e9; }, false);
    }

    /* ---------- the step ---------- */
    function step(dt) {
      clock += dt; upd++;
      if (clock - cssT > 500) { updateCss(); cssT = clock; }
      var ev, i;
      while ((ev = queue.shift())) handle(ev);
      if (press && !press.fired) {
        if (Math.abs(press.x - press.x0) + Math.abs(press.y - press.y0) > MOVE_CANCEL * Math.max(1, uiScale())) press = null;
        else if (clock - press.t0 >= P.longPress) { press.fired = true; stats.longPress++; var a0 = findAnchor(press.a); if (a0) toggleAt(a0, 'touch', true); }
      }
      // keep the open chain alive: pinned, focused, pointer on its word or inside it (or a child), else close after the grace time
      var p = ptr.in && ptr.type === 'mouse' ? ptr : null, insideLv = -1, overA = p ? anchorAt(p) : null;
      if (p) for (i = tips.length - 1; i >= 0; i--) if (tips[i] && inside(p, { x: tips[i].pos.x, y: tips[i].pos.y, w: tips[i].rectT.w, h: tips[i].rectT.h })) { insideLv = i; break; }
      for (i = 0; i < tips.length; i++) {
        var t = tips[i]; if (!t) continue;
        var toward = p && prevPtr && dist(p, { x: t.pos.x, y: t.pos.y, w: t.rectT.w, h: t.rectT.h }) < dist(prevPtr, { x: t.pos.x, y: t.pos.y, w: t.rectT.w, h: t.rectT.h }) - 0.15 * uiScale();
        var alive = t.pinned || insideLv >= i || toward || (overA && overA.id === t.anchorId) || (focus && (i < focus.level || (i === focus.level && t.anchorId === focus.id))) || t.via === 'api';
        if (alive) t.keep = clock;
        else if (clock - t.keep > P.grace) { closeFrom(i); break; }
      }
      // hover: open after the delay (at once when a tooltip at that level is open or just closed)
      if (hovBlock && (!overA || overA.id !== hovBlock)) hovBlock = null;
      if (overA && overA.id !== hovBlock && !(focus && focus.level === overA.level)) {
        var lv = overA.level, cur = tips[lv];
        if (hov.id !== overA.id) { hov.id = overA.id; hov.t = clock; }
        // heading for the open tooltip of this level (or its child): crossing other words on the way switches nothing
        if (cur && cur.anchorId !== overA.id && prevPtr) { var R0 = { x: cur.pos.x, y: cur.pos.y, w: cur.rectT.w, h: cur.rectT.h }; if (dist(p, R0) < dist(prevPtr, R0) - 0.2 * uiScale()) hov.t = clock; }
        var warm = (cur && !cur.pinned) || clock - lastClose < WARM_MS;
        var blocked = cur && cur.pinned && cur.anchorId !== overA.id;
        if (!blocked && (!cur || cur.anchorId !== overA.id) && clock - hov.t >= (warm ? Math.min(P.delay, WARM_DELAY) : P.delay) && lv < P.depth) openTip(overA, lv, 'mouse', false);
      } else hov.id = null;
      // anchors move with their text: retarget, glide (never jump)
      for (i = 0; i < tips.length; i++) {
        var T = tips[i]; if (!T) continue;
        var A = findAnchor(T.anchorId);
        if (!A || A.key !== T.key) { closeFrom(i); break; }   // the word is gone, or the text changed under it
        if (Math.abs(A.x - T.anchor.x) + Math.abs(A.y - T.anchor.y) > 6 * T.lay.u) {   // the word teleported (new text, a list jumped): crossfade, never slide across the screen
          var pv = T.pinned, vi = T.via; closeFrom(i); openTip(A, i, vi, pv); break;
        }
        var dAx = A.x - T.anchor.x, dAy = A.y - T.anchor.y;   // a word that moves smoothly carries its tooltip rigidly (no lag)
        if (T.stack) { var Wn = att(T); dAx = T.attLast ? Wn.x - T.attLast.x : 0; dAy = T.attLast ? Wn.y - T.attLast.y : 0; T.attLast = { x: Wn.x, y: Wn.y }; }
        if (dAx || dAy) { T.pos.x += dAx; T.pos.y += dAy; if (T.rectT) { T.rectT.x += dAx; T.rectT.y += dAy; } if (T.placedA) { T.placedA.x += dAx; T.placedA.y += dAy; } }
        T.anchor = { x: A.x, y: A.y, w: A.w, h: A.h };
        var sig = sigOf(T.anchor) + '|' + V().w + 'x' + V().h + '|' + uiScale();
        if (sig !== T.anchorSig) {
          var oldT = T.rectT; T.lays = tipLayout(T.key, T.level, T.via, null, T.pinned); place(T, T.side);
          if (Math.abs(T.rectT.x - oldT.x) + Math.abs(T.rectT.y - oldT.y) > 16 * T.lay.u) { var pv2 = T.pinned, vi2 = T.via; closeFrom(i); openTip(A, i, vi2, pv2); break; }   // a new spot far away: crossfade
        }
        var gx = T.rectT.x - T.pos.x, gy = T.rectT.y - T.pos.y, d = Math.sqrt(gx * gx + gy * gy);
        if (d > 0.01) {
          var maxS = 6 * T.lay.u * dt / 16.67, k = 1 - Math.exp(-dt / 70), s = Math.min(d * k, maxS); if (d < 0.75) s = d;
          T.pos.x += gx / d * s; T.pos.y += gy / d * s; stats.maxStep = Math.max(stats.maxStep, s / T.lay.u);
          if (s > 8 * T.lay.u) stats.jumps++;
          if (pixelMode() && d - s < 0.5) { T.pos.x = T.rectT.x; T.pos.y = T.rectT.y; }
          // the word moved toward its tooltip: never let the glide (or the notch in the gap) touch it, take the last pixels at once
          var gp = (pixelMode() ? 3 : 7) * T.lay.u - 0.5;
          if (!T.stack && hit({ x: T.pos.x - gp, y: T.pos.y - gp, w: T.rectT.w + 2 * gp, h: T.rectT.h + 2 * gp }, T.anchor)) {
            if (Math.abs(T.rectT.x - T.pos.x) + Math.abs(T.rectT.y - T.pos.y) <= 8 * T.lay.u) { T.pos.x = T.rectT.x; T.pos.y = T.rectT.y; } else { var pv3 = T.pinned, vi3 = T.via, A3 = A; closeFrom(i); openTip(A3, i, vi3, pv3); break; }
          }
        }
        var vv = V(), mm = margin();   // a re-layout can change the size at once: keep the gliding panel inside the view
        T.pos.x = clamp(T.pos.x, vv.x + mm, Math.max(vv.x + mm, vv.x + vv.w - mm - T.rectT.w)); T.pos.y = clamp(T.pos.y, vv.y + mm, Math.max(vv.y + mm, vv.y + vv.h - mm - T.rectT.h));
        var cur2 = { x: T.pos.x, y: T.pos.y, w: T.rectT.w, h: T.rectT.h };
        if (!T.stack && hit(cur2, { x: T.anchor.x, y: T.anchor.y, w: T.anchor.w, h: T.anchor.h }, -0.01) && clock - T.born > OPEN_MS) stats.coverAnchor++;
        if (cur2.x < vv.x - 0.5 || cur2.y < vv.y - 0.5 || cur2.x + cur2.w > vv.x + vv.w + 0.5 || cur2.y + cur2.h > vv.y + vv.h + 0.5) stats.offView++;
      }
      for (i = fading.length - 1; i >= 0; i--) if (clock - fading[i].closeT > CLOSE_MS) fading.splice(i, 1);
      prevPtr = p ? { x: p.x, y: p.y } : null;
      if (focus) { var FL = layerAnchors(focus.level); if (!FL.some(function (a) { return a.id === focus.id; })) focus = null; }
      cursorStyle(overA);
    }
    function toggleAt(a, via, pin) {
      var cur = tips[a.level];
      if (cur && cur.anchorId === a.id) { if (cur.pinned && !pin) { closeFrom(a.level); hovBlock = a.id; } else pinTip(cur, true); return; }
      if (a.level >= P.depth) return;
      openTip(a, a.level, via, true);
    }
    function handle(ev) {
      if (ev.k === 'down') {
        if (ev.touch) {
          if (ev.a) { press = { a: ev.a, x0: ev.x, y0: ev.y, x: ev.x, y: ev.y, t0: clock, fired: false }; return; }
          return;   // a press inside a tooltip, not on a keyword: nothing
        }
        stats.clicks++;
        var pi = null; for (var i = 0; i < tips.length; i++) { var r = pinIconRect(tips[i]); if (tips[i].pinned && r && inside(ev, r)) pi = tips[i]; }
        if (pi) { closeFrom(pi.level); return; }
        if (ev.a) { var a = findAnchor(ev.a); if (a) toggleAt(a, 'mouse', false); }
        else if (ev.tip) { for (var ti = 0; ti < tips.length; ti++) if (tips[ti] && tips[ti].uid === ev.tip && !tips[ti].pinned) pinTip(tips[ti], true); }
        return;
      }
      if (ev.k === 'up') {
        if (press && !press.fired && P.tapOpens === 'on') { var a2 = findAnchor(press.a); if (a2) { stats.taps++; toggleAt(a2, 'touch', false); } }
        press = null; return;
      }
      if (ev.k === 'outside') { if (tips.some(function (t) { return t.pinned || ev.touch; })) closeFrom(0); return; }
      if (ev.k === 'focus') {
        var lv = focus ? focus.level : topPinnedLevel() + 1, L = layerAnchors(lv);
        if (!L.length && lv > 0) { lv = 0; L = baseAnchors(); }
        if (!L.length) return;
        var idx = focus && focus.level === lv ? L.findIndex(function (q) { return q.id === focus.id; }) : -1;
        idx = idx < 0 ? (ev.dir > 0 ? 0 : L.length - 1) : (idx + ev.dir + L.length) % L.length;
        setFocus(L[idx], true); stats.focusMoves++;
        return;
      }
      if (ev.k === 'pin') {
        if (!focus) { var tp = tips[tips.length - 1]; if (tp) pinTip(tp, !tp.pinned); return; }
        var t = tips[focus.level];
        if (t && t.anchorId === focus.id) {
          if (t.pinned) { closeFrom(focus.level); focus.open = false; return; }
          pinTip(t, true);
          var inner = tipAnchors(t);
          if (inner.length && focus.level + 1 < P.depth) setFocus(inner[0], true);
        } else { var fa = findAnchor(focus.id); if (fa) { openTip(fa, fa.level, 'key', true); } }
        return;
      }
      if (ev.k === 'close') {
        var top = tips[tips.length - 1];
        if (top) {
          var back = findAnchor(top.anchorId); closeFrom(top.level);
          if (focus) { if (back) focus = { id: back.id, level: back.level, open: false, chain: chainUids(back.level) }; else focus = null; }
          return;
        }
        focus = null; return;
      }
    }
    function chainUids(level) { var c = {}; for (var i = 0; i < level && i < tips.length; i++) c[i] = tips[i].uid; return c; }
    function setFocus(a, openIt) {
      focus = { id: a.id, level: a.level, open: !!openIt, chain: null };
      if (openIt) { var cur = tips[a.level]; if (!cur || cur.anchorId !== a.id) { if (cur && cur.pinned && a.level === 0 && false) return; openTip(a, a.level, 'key', false); } }
      focus.chain = chainUids(a.level + 1);
    }
    function cursorStyle(a) {
      if (!canvas || P.cursor !== 'on' || !canvas.style) return;
      var want = a ? (ptr.type === 'mouse' ? 'help' : '') : '';
      if (want === lastCursor) return;
      if (lastCursor === null) canvas.__ktCursor = canvas.style.cursor || '';
      try { canvas.style.cursor = want || canvas.__ktCursor || ''; } catch (e) { }
      lastCursor = want;
    }

    /* ---------- drawing ---------- */
    function hlFor(id) {
      if (focus && focus.id === id) return 2;
      for (var i = 0; i < tips.length; i++) if (tips[i] && tips[i].anchorId === id) return tips[i].pinned ? 2 : 1;
      if (hov.id === id) return 1;
      return 0;
    }
    function drawIcon(ctx, name, x, y, s, col, px, u) {
      var rows = ICON_PX[name]; if (!rows) return false;
      col = col || ICON_COL[name] || '#ffffff';
      if (px) {
        var pal = { o: '#0b0814', a: col, l: mix(col, '#ffffff', 0.45), d: mix(col, '#000000', 0.38), w: '#ffffff' }, k = Math.max(1, Math.round(s / 7));
        for (var r = 0; r < 7; r++) for (var c = 0; c < 7; c++) { var ch = rows[r][c]; if (ch !== '.') { ctx.fillStyle = pal[ch]; ctx.fillRect(Math.round(x) + c * k, Math.round(y) + r * k, k, k); } }
        return true;
      }
      // HD: the same silhouettes as soft vector shapes with a top-left light
      var cx = x + s / 2, cy = y + s / 2, R = s / 2;
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      var gr = ctx.createLinearGradient(x, y, x + s, y + s); gr.addColorStop(0, mix(col, '#ffffff', 0.4)); gr.addColorStop(0.55, col); gr.addColorStop(1, mix(col, '#000000', 0.35));
      ctx.beginPath();
      switch (name) {
        case 'flame': ctx.moveTo(cx, y); ctx.bezierCurveTo(cx + R * 0.9, cy - R * 0.2, cx + R, cy + R * 0.6, cx, y + s); ctx.bezierCurveTo(cx - R, cy + R * 0.6, cx - R * 0.8, cy - R * 0.1, cx - R * 0.25, cy - R * 0.45); ctx.quadraticCurveTo(cx - R * 0.1, cy - R * 0.1, cx, y); break;
        case 'drop': ctx.moveTo(cx, y); ctx.bezierCurveTo(cx + R * 0.4, cy - R * 0.3, cx + R, cy + R * 0.1, cx + R * 0.85, cy + R * 0.45); ctx.arc(cx, cy + R * 0.35, R * 0.86, 0.1, Math.PI - 0.1); ctx.bezierCurveTo(cx - R, cy + R * 0.1, cx - R * 0.4, cy - R * 0.3, cx, y); break;
        case 'shield': ctx.moveTo(x + s * 0.1, y + s * 0.08); ctx.lineTo(x + s * 0.9, y + s * 0.08); ctx.lineTo(x + s * 0.88, cy + R * 0.1); ctx.quadraticCurveTo(x + s * 0.8, y + s * 0.88, cx, y + s); ctx.quadraticCurveTo(x + s * 0.2, y + s * 0.88, x + s * 0.12, cy + R * 0.1); ctx.closePath(); break;
        case 'heart': ctx.moveTo(cx, y + s * 0.95); ctx.bezierCurveTo(x - s * 0.1, cy, x + s * 0.12, y - s * 0.1, cx, y + s * 0.28); ctx.bezierCurveTo(x + s * 0.88, y - s * 0.1, x + s * 1.1, cy, cx, y + s * 0.95); break;
        case 'bolt': ctx.moveTo(x + s * 0.62, y); ctx.lineTo(x + s * 0.18, y + s * 0.58); ctx.lineTo(x + s * 0.46, y + s * 0.58); ctx.lineTo(x + s * 0.34, y + s); ctx.lineTo(x + s * 0.84, y + s * 0.4); ctx.lineTo(x + s * 0.54, y + s * 0.4); ctx.closePath(); break;
        case 'leaf': ctx.moveTo(x + s * 0.08, y + s * 0.92); ctx.bezierCurveTo(x, y + s * 0.2, x + s * 0.5, y, x + s, y); ctx.bezierCurveTo(x + s, y + s * 0.5, x + s * 0.8, y + s, x + s * 0.08, y + s * 0.92); break;
        case 'star': for (var i = 0; i < 10; i++) { var an = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? R * 0.45 : R; ctx.lineTo(cx + Math.cos(an) * rr2, cy + Math.sin(an) * rr2 + R * 0.06); } ctx.closePath(); break;
        case 'sword': ctx.moveTo(x + s * 0.95, y + s * 0.05); ctx.lineTo(x + s * 0.8, y + s * 0.35); ctx.lineTo(x + s * 0.38, y + s * 0.77); ctx.lineTo(x + s * 0.23, y + s * 0.62); ctx.lineTo(x + s * 0.65, y + s * 0.2); ctx.closePath(); break;
        case 'coin': case 'clock': case 'skull': case 'eye': case 'chain': case 'spiral': default: ctx.arc(cx, cy, R * 0.92, 0, Math.PI * 2); break;
      }
      ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = Math.max(1, s / 11); ctx.strokeStyle = 'rgba(8,5,14,0.85)'; ctx.stroke();
      ctx.fillStyle = 'rgba(8,5,14,0.8)'; ctx.strokeStyle = 'rgba(8,5,14,0.8)'; ctx.lineWidth = Math.max(1, s / 9);
      if (name === 'sword') { ctx.beginPath(); ctx.moveTo(x + s * 0.12, y + s * 0.52); ctx.lineTo(x + s * 0.48, y + s * 0.88); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + s * 0.3, y + s * 0.7); ctx.lineTo(x + s * 0.06, y + s * 0.94); ctx.stroke(); }
      if (name === 'skull') { ctx.beginPath(); ctx.arc(cx - R * 0.35, cy, R * 0.2, 0, 7); ctx.arc(cx + R * 0.35, cy, R * 0.2, 0, 7); ctx.fill(); }
      if (name === 'eye') { ctx.beginPath(); ctx.arc(cx, cy, R * 0.35, 0, 7); ctx.fill(); }
      if (name === 'clock') { ctx.beginPath(); ctx.moveTo(cx, cy - R * 0.55); ctx.lineTo(cx, cy); ctx.lineTo(cx + R * 0.4, cy + R * 0.2); ctx.stroke(); }
      if (name === 'coin') { ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, 7); ctx.stroke(); }
      if (name === 'chain') { ctx.beginPath(); ctx.arc(cx, cy, R * 0.45, 0, 7); ctx.stroke(); }
      if (name === 'spiral') { ctx.beginPath(); for (var a2 = 0; a2 < 9; a2 += 0.3) ctx.lineTo(cx + Math.cos(a2) * a2 * R / 11, cy + Math.sin(a2) * a2 * R / 11); ctx.stroke(); }
      ctx.restore(); return true;
    }
    function panelPx(ctx, x, y, w, h, T, col, u, side, A, pulse) {
      // drop shadow, 1 u outline, bevel light / dark, two-tone body, header band in the keyword colour's shade
      ctx.fillStyle = T.shadow; ctx.fillRect(x + u, y + 2 * u, w, h);
      ctx.fillStyle = pulse ? col : T.ink; ctx.fillRect(x + u, y, w - 2 * u, h); ctx.fillRect(x, y + u, w, h - 2 * u);
      ctx.fillStyle = T.edge; ctx.fillRect(x + u, y + u, w - 2 * u, h - 2 * u);
      ctx.fillStyle = T.fill; ctx.fillRect(x + 2 * u, y + 2 * u, w - 4 * u, h - 4 * u);
      ctx.fillStyle = T.fillTo; ctx.fillRect(x + 2 * u, y + Math.round(h * 0.55 / u) * u, w - 4 * u, h - 2 * u - Math.round(h * 0.55 / u) * u);
      ctx.fillStyle = T.light; ctx.fillRect(x + 2 * u, y + 2 * u, w - 4 * u, u);
      ctx.fillStyle = col; ctx.fillRect(x + 2 * u, y + u, Math.min(w - 4 * u, 12 * u), u);
    }
    function notchPx(ctx, t, T, u) {
      if (P.notch !== 'on' || !t.anchor) return null;
      var x = t.pos.x, y = t.pos.y, w = t.rectT.w, h = t.rectT.h, A = att(t), n = 3, s = t.side, out = null;
      if (s === 'below' || s === 'above') {
        var cx = clamp(Math.round((A.x + A.w / 2) / u) * u, x + 5 * u, x + w - 6 * u), up = s === 'below';
        for (var i = 0; i < n; i++) {
          var yy = up ? y - (i + 1) * u : y + h + i * u, half = (n - 1 - i);
          ctx.fillStyle = T.ink; ctx.fillRect(cx - (half + 1) * u, yy, (2 * half + 3) * u, u);
          if (half > 0) { ctx.fillStyle = T.edge; ctx.fillRect(cx - half * u, yy, (2 * half + 1) * u, u); }
        }
        ctx.fillStyle = up ? T.fill : T.fillTo; ctx.fillRect(cx - u, up ? y + u : y + h - 2 * u, 3 * u, u);
        out = { x: cx - n * u, y: up ? y - n * u : y + h, w: (2 * n + 1) * u, h: n * u };
      } else {
        var cy = clamp(Math.round((A.y + A.h / 2) / u) * u, y + 5 * u, y + h - 6 * u), lf = s === 'right';
        for (var j = 0; j < n; j++) {
          var xx = lf ? x - (j + 1) * u : x + w + j * u, hf = (n - 1 - j);
          ctx.fillStyle = T.ink; ctx.fillRect(xx, cy - (hf + 1) * u, u, (2 * hf + 3) * u);
          if (hf > 0) { ctx.fillStyle = T.edge; ctx.fillRect(xx, cy - hf * u, u, (2 * hf + 1) * u); }
        }
        out = { x: lf ? x - n * u : x + w, y: cy - n * u, w: n * u, h: (2 * n + 1) * u };
      }
      return out;
    }
    function panelHd(ctx, x, y, w, h, T, col, u, t, pulse) {
      var r = Math.round(7 * u);
      ctx.save();
      ctx.shadowColor = T.shadow; ctx.shadowBlur = 14 * u; ctx.shadowOffsetY = 4 * u;
      rr(ctx, x, y, w, h, r); var g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, T.fill); g.addColorStop(1, T.fillTo); ctx.fillStyle = g; ctx.fill();
      ctx.shadowColor = 'transparent';
      // notch drawn as part of the same body
      var nt = null;
      if (P.notch === 'on' && t.anchor) {
        var A = att(t), s = t.side, n = 7 * u, dep = (s === 'below' ? 8 : 7) * u - 1.2 * u;
        ctx.beginPath();
        if (s === 'below' || s === 'above') {
          var cx = clamp(A.x + A.w / 2, x + r + n, x + w - r - n), yy = s === 'below' ? y : y + h, d = s === 'below' ? -1 : 1;
          ctx.moveTo(cx - n, yy - d * 0.5); ctx.lineTo(cx, yy + d * dep); ctx.lineTo(cx + n, yy - d * 0.5); nt = { x: cx - n, y: d < 0 ? yy - dep : yy, w: 2 * n, h: dep };
        } else {
          var cy = clamp(A.y + A.h / 2, y + r + n, y + h - r - n), xx = s === 'right' ? x : x + w, e = s === 'right' ? -1 : 1;
          ctx.moveTo(xx - e * 0.5, cy - n); ctx.lineTo(xx + e * dep, cy); ctx.lineTo(xx - e * 0.5, cy + n); nt = { x: e < 0 ? xx - dep : xx, y: cy - n, w: dep, h: 2 * n };
        }
        ctx.closePath(); ctx.fillStyle = s === 'above' ? T.fillTo : T.fill; ctx.fill();
        ctx.strokeStyle = rgba(T.edge, 0.9); ctx.lineWidth = Math.max(1, u); ctx.stroke();
        ctx.beginPath(); if (s === 'below' || s === 'above') { ctx.moveTo(nt.x + u, s === 'below' ? y + 0.5 * u : y + h - 0.5 * u); ctx.lineTo(nt.x + nt.w - u, s === 'below' ? y + 0.5 * u : y + h - 0.5 * u); }
        else { ctx.moveTo(s === 'right' ? x + 0.5 * u : x + w - 0.5 * u, nt.y + u); ctx.lineTo(s === 'right' ? x + 0.5 * u : x + w - 0.5 * u, nt.y + nt.h - u); }
        ctx.strokeStyle = s === 'above' ? T.fillTo : T.fill; ctx.lineWidth = 2 * u; ctx.stroke();
      }
      rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.strokeStyle = pulse ? col : rgba(T.edge, 0.95); ctx.lineWidth = Math.max(1, u * (pulse ? 1.6 : 1)); ctx.stroke();
      rr(ctx, x + 1.5 * u, y + 1.5 * u, w - 3 * u, h - 3 * u, Math.max(1, r - 1.5 * u)); ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = Math.max(1, u * 0.8); ctx.stroke();
      // keyword accent: a short glowing bar on the top edge
      var gl = ctx.createLinearGradient(x + r, 0, x + r + 70 * u, 0); gl.addColorStop(0, rgba(col, 0.95)); gl.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = gl; ctx.fillRect(x + r, y + 1, 70 * u, Math.max(1.5, 2 * u));
      ctx.restore();
      return nt;
    }
    function drawPin(ctx, r, T, px, u) {
      if (!r) return;
      if (px) { var k = Math.max(1, Math.round(r.w / 7)), rows = ['....oo.', '...olao', '..olaao', '.ooaaoo', '.nooo..', '.n.....', 'n......'], pal = { o: '#0b0814', a: T.pin, l: '#ffffff', n: '#c8ccd8' };
        for (var y = 0; y < 7; y++) for (var x = 0; x < 7; x++) { var ch = rows[y][x]; if (ch !== '.') { ctx.fillStyle = pal[ch]; ctx.fillRect(r.x + x * k, r.y + y * k, k, k); } } return; }
      ctx.save(); ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.rotate(0.6);
      var hr = r.w * 0.24;   // a push pin: needle, collar disc, round head with a highlight
      ctx.strokeStyle = '#c8ccd8'; ctx.lineWidth = Math.max(1, u * 1.1); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, r.h * 0.05); ctx.lineTo(0, r.h * 0.5); ctx.stroke();
      ctx.fillStyle = mix(T.pin, '#000000', 0.25); ctx.strokeStyle = 'rgba(8,5,14,0.85)'; ctx.lineWidth = Math.max(1, u * 0.8);
      ctx.beginPath(); ctx.ellipse(0, r.h * 0.04, hr * 1.25, hr * 0.45, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = T.pin; ctx.beginPath(); ctx.arc(0, -r.h * 0.2, hr, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.arc(-hr * 0.35, -r.h * 0.2 - hr * 0.35, hr * 0.3, 0, 7); ctx.fill();
      ctx.restore();
    }
    function drawTip(ctx, t, alpha, out) {
      var T = TH(), L = t.lay, u = L.u, px = L.Fs.px, col = L.color, a = ease((clock - t.born) / OPEN_MS);
      var off = 1 - a, x = t.pos.x + t.slide.x * off, y = t.pos.y + t.slide.y * off, w = t.rectT.w, h = t.rectT.h;
      if (px) { x = Math.round(x); y = Math.round(y); }
      var pulse = clock - t.pulse < 360 && ((clock - t.pulse) / 90 | 0) % 2 === 0;
      ctx.save(); ctx.globalAlpha = clamp(alpha * a, 0, 1);
      var saved = { x: t.pos.x, y: t.pos.y }; t.pos = { x: x, y: y };
      var nt = px ? (panelPx(ctx, x, y, w, h, T, col, u, t.side, t.anchor, pulse), notchPx(ctx, t, T, u)) : panelHd(ctx, x, y, w, h, T, col, u, t, pulse);
      if (t.clipH) { ctx.beginPath(); ctx.rect(x, y, w, h - L.pad / 2); ctx.clip(); }
      // header: icon, title (bold, keyword colour), kind tag right-aligned
      if (L.crumb) {   // the parent this tooltip stacks over: its own row, never dropped
        var cyy = y + L.pad;
        L.Fs.tag.draw(ctx, L.crumb, x + L.pad, cyy, px ? mix(T.text, T.dim, 0.35) : mix(T.text, T.dim, 0.3));
        out.push({ kind: 'text', crumb: true, x: x + L.pad, y: cyy, w: L.crumbW, h: L.Fs.tag.h, level: t.level, key: t.key, text: L.crumb });
        ctx.fillStyle = rgba(T.edge, 0.55); ctx.fillRect(x + L.pad, cyy + L.Fs.tag.h + (px ? 2 * u : Math.round(3 * u)), L.crumbW, Math.max(1, px ? u : 0.8 * u));
      }
      var hx = x + L.pad, hy = y + L.pad + (L.crumbH || 0), iy = hy + Math.round((L.headH - L.iconS) / 2);
      var hasIcon = false;
      if (L.image && L.image.img) { try { var im = L.image; ctx.imageSmoothingEnabled = !px; ctx.drawImage(im.img, im.sx || 0, im.sy || 0, im.sw || im.img.width, im.sh || im.img.height, hx, iy, L.iconS, L.iconS); hasIcon = true; } catch (e) { hasIcon = false; } }
      if (!hasIcon) hasIcon = drawIcon(ctx, L.icon, hx, iy, L.iconS, null, px, u);
      if (!hasIcon) { ctx.fillStyle = col; if (px) { ctx.fillRect(hx + 2 * u, iy + 2 * u, 3 * u, 3 * u); } else { ctx.beginPath(); ctx.arc(hx + L.iconS / 2, iy + L.iconS / 2, L.iconS * 0.28, 0, 7); ctx.fill(); } }
      var tx = hx + L.iconS + L.gapI, ty = hy + Math.round((L.headH - L.Fs.title.h) / 2);
      if (px) L.Fs.title.draw(ctx, L.title, tx + u, ty + u, T.ink, false);
      L.Fs.title.draw(ctx, L.title, tx, ty, px ? col : mix(col, '#ffffff', 0.15), false);
      out.push({ kind: 'text', x: tx, y: ty, w: L.titleW, h: L.Fs.title.h, level: t.level, key: t.key, text: L.title });
      var pinR = t.pinned ? pinIconRect(t) : null;
      var kindText = L.kind, kindW = L.kindW;
      if (kindText) {
        var kx = x + w - L.pad - kindW - (pinR ? pinR.w + (px ? 3 * u : 6 * u) : 0), ky = hy + Math.round((L.headH - L.Fs.tag.h) / 2) + (px ? 0 : Math.round(u));
        if (kx > tx + L.titleW + (px ? 3 * u : 6 * u)) { L.Fs.tag.draw(ctx, kindText, kx, ky, t.stack ? col : T.dim); out.push({ kind: 'text', x: kx, y: ky, w: kindW, h: L.Fs.tag.h, level: t.level, key: t.key, text: kindText }); }
      }
      if (pinR) { drawPin(ctx, pinR, T, px, u); out.push({ kind: 'pin', x: pinR.x, y: pinR.y, w: pinR.w, h: pinR.h, level: t.level, key: t.key }); }
      // divider
      if (px) { ctx.fillStyle = T.ink; for (var dx = x + L.pad; dx < x + w - L.pad; dx += 2 * u) ctx.fillRect(dx, y + L.divY, u, u); ctx.fillStyle = rgba(T.light, 0.6); ctx.fillRect(x + L.pad, y + L.divY + u, w - 2 * L.pad, u); }
      else { var dg = ctx.createLinearGradient(x + L.pad, 0, x + w - L.pad, 0); dg.addColorStop(0, rgba(T.edge, 0.9)); dg.addColorStop(1, rgba(T.edge, 0.05)); ctx.fillStyle = dg; ctx.fillRect(x + L.pad, y + L.divY, w - 2 * L.pad, Math.max(1, u * 0.8)); }
      // body
      var bodyX = x + L.bx, bodyY = y + L.by;
      drawLines(ctx, L.body, bodyX, bodyY, T.text, P.theme === 'parchment', t.uid, t.level + 1, hlFor, null);
      L.body.lines.forEach(function (ln) { if (ln.items.length) out.push({ kind: 'text', x: bodyX, y: bodyY + ln.y, w: ln.w, h: L.Fs.body.h, level: t.level, key: t.key, text: ln.items.map(function (q) { return q.t; }).join(' ') }); });
      if (L.hint) {
        var hy2 = bodyY + L.body.h + (px ? 5 * u : 8 * u);
        if (px) { ctx.fillStyle = rgba(T.edge, 0.7); ctx.fillRect(x + L.pad, hy2 - 3 * u, w - 2 * L.pad, u); } else { ctx.fillStyle = rgba(T.edge, 0.45); ctx.fillRect(x + L.pad, hy2 - 4 * u, w - 2 * L.pad, Math.max(1, 0.7 * u)); }
        L.Fs.tag.draw(ctx, L.hint, x + L.pad, hy2, T.dim);
        out.push({ kind: 'text', x: x + L.pad, y: hy2, w: L.Fs.tag.measure(L.hint), h: L.Fs.tag.h, level: t.level, key: t.key, text: L.hint });
      }
      ctx.restore();
      t.pos = saved;
      out.push({ kind: 'panel', uid: t.uid, x: x, y: y, w: w, h: h, level: t.level, key: t.key, pinned: t.pinned, side: t.side, alpha: alpha * a, anchor: t.anchor });
      if (nt) out.push({ kind: 'notch', x: nt.x, y: nt.y, w: nt.w, h: nt.h, level: t.level, key: t.key });
    }
    function drawMarks(ctx) {
      var T = TH(), u = uiScale(), px = pixelMode();
      for (var id in marks) {
        var m = marks[id]; if (m.stamp < frameNo) continue;
        var st = hlFor('mark:' + id); if (!st) continue;
        var c = kwColor(m.key);
        ctx.save();
        if (px) { var k = Math.max(1, Math.round(u / 2)); ctx.fillStyle = c; ctx.fillRect(m.x - k, m.y - k, m.w + 2 * k, k); ctx.fillRect(m.x - k, m.y + m.h, m.w + 2 * k, k); ctx.fillRect(m.x - k, m.y, k, m.h); ctx.fillRect(m.x + m.w, m.y, k, m.h); }
        else { rr(ctx, m.x - 2 * u, m.y - 2 * u, m.w + 4 * u, m.h + 4 * u, 4 * u); ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, 1.5 * u); ctx.shadowColor = c; ctx.shadowBlur = 6 * u; ctx.stroke(); }
        ctx.restore();
      }
    }
    function drawFocus(ctx, out) {
      if (!focus) return;
      var a = findAnchor(focus.id); if (!a) return;
      var T = TH(), u = uiScale(), px = pixelMode();
      if (a.tip && a.tip.hiddenBy) {   // the focused word is hidden under the tooltip it opened: ring that tooltip's title instead
        var st = null; for (var i = 0; i < tips.length; i++) if (tips[i] && tips[i].anchorId === focus.id && !tips[i].hiddenBy) st = tips[i];
        if (!st || !st.lay) return;
        var L = st.lay; a = { x: st.pos.x + L.pad + L.iconS + L.gapI, y: st.pos.y + L.pad + (L.crumbH || 0) + Math.round((L.headH - L.Fs.title.h) / 2), w: L.titleW, h: L.Fs.title.h };
      }
      if (out) out.push({ kind: 'focus', x: a.x - 3 * u, y: a.y - 2.5 * u, w: a.w + 4 * u, h: a.h + 5 * u, key: focus.key || null });
      ctx.save(); ctx.fillStyle = T.focus; ctx.strokeStyle = T.focus;
      if (px) { var k = Math.max(1, Math.round(u / 2)), x = Math.round(a.x - 2 * u), y = Math.round(a.y - 2 * u), w = Math.round(a.w + 3 * u), h = Math.round(a.h + 4 * u);
        ctx.fillRect(x, y, w, k); ctx.fillRect(x, y + h - k, w, k); ctx.fillRect(x, y, k, h); ctx.fillRect(x + w - k, y, k, h); }
      else { rr(ctx, a.x - 3 * u, a.y - 2.5 * u, a.w + 4 * u, a.h + 5 * u, 4 * u); ctx.lineWidth = Math.max(1.5, 1.6 * u); ctx.stroke(); }
      ctx.restore();
    }
    function drawPress(ctx) {
      if (!press || press.fired) return;
      var k = clamp((clock - press.t0) / P.longPress, 0, 1); if (k < 0.12) return;
      var T = TH(), u = uiScale(), px = pixelMode(), r = (px ? 9 : 16) * u, a = findAnchor(press.a), c = a ? kwColor(a.key) : T.kw;
      ctx.save(); ctx.globalAlpha = 0.95;
      if (px) {
        var n = 16, done = Math.round(n * k), cx = Math.round(press.x0), cy = Math.round(press.y0);
        for (var i = 0; i < n; i++) { var an = -Math.PI / 2 + i / n * Math.PI * 2, X = Math.round(cx + Math.cos(an) * r - u / 2), Y = Math.round(cy + Math.sin(an) * r - u / 2);
          if (i < done) { ctx.fillStyle = T.ink; ctx.fillRect(X - u, Y - u, 3 * u, 3 * u); ctx.fillStyle = c; ctx.fillRect(X - u, Y - u, 2 * u, 2 * u); ctx.fillStyle = '#ffffff'; ctx.fillRect(X - u, Y - u, u, u); } else { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(X, Y, u, u); } }
      } else {
        ctx.lineWidth = 3 * u; ctx.strokeStyle = 'rgba(8,5,14,0.6)'; ctx.beginPath(); ctx.arc(press.x0, press.y0, r, 0, 7); ctx.stroke();
        ctx.strokeStyle = c; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(press.x0, press.y0, r, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    function drawAll(ctx) {
      var out = [];
      try {
        drawMarks(ctx);
        for (var i = 0; i < fading.length; i++) { var f = fading[i], al = 1 - clamp((clock - f.closeT) / CLOSE_MS, 0, 1); if (al > 0) drawTip(ctx, f, al, []); }
        for (var j = 0; j < tips.length; j++) if (tips[j] && !tips[j].hiddenBy) drawTip(ctx, tips[j], tips[j].showT != null ? clamp((clock - tips[j].showT) / OPEN_MS, 0, 1) : 1, out);
        drawFocus(ctx, out); drawPress(ctx);
      } catch (e) { stats.errors++; warn('draw', 'draw failed: ' + (e && e.message)); }
      return out;
    }

    /* ---------- the instance ---------- */
    setParams(opt.params || {});
    setKeywords(opt.keywords || {});
    updateCss();
    listen();
    var inst = {
      version: VERSION,
      update: function (dt) {
        try { sinceUpd = 0; stats.updates++; step(dt == null || !isFinite(+dt) || +dt <= 0 ? 1000 / 60 : Math.min(250, +dt)); } catch (e) { stats.errors++; warn('update', 'update failed: ' + (e && e.message)); }
      },
      draw: function (ctx) {
        if (!ctx) return;
        try {
          stats.draws++;
          if (++sinceUpd > 30) {   // update() is not called: keep working on real time (logged once)
            if (sinceUpd === 31) { stats.noUpdate++; warn('noupd', 'update(stepMs) is not called every step; falling back to real time'); }
            var now = root.performance ? root.performance.now() : Date.now(); if (lastDrawT != null) step(clamp(now - lastDrawT, 0, 100)); lastDrawT = now;
          } else lastDrawT = null;
          drawnList = drawAll(ctx);
          for (var id in blocks) { var b = blocks[id]; if (b.frame && b.stamp < frameNo) delete blocks[id]; }
          for (var m in marks) if (marks[m].stamp < frameNo) delete marks[m];
          frameNo++;
        } catch (e) { stats.errors++; }
      },
      text: function (ctx, id, markup, x, y, o) {   // render-path: lay out, register this frame's keywords, draw
        o = Object.assign({}, o || {}, { x: x, y: y, __frame: true });
        var r = setText(id, markup, o); if (ctx) inst.drawText(ctx, id); return r;
      },
      setText: function (id, markup, o) { return setText(id, markup, Object.assign({}, o || {}, { __frame: false })); },
      drawText: function (ctx, id) {
        try {
          if (!ctx) return;
          if (id == null) { for (var k in blocks) if (!blocks[k].frame) drawBlock(ctx, blocks[k], hlFor); return; }
          var b = blocks[String(id)]; if (b) { if (b.frame) b.stamp = frameNo; drawBlock(ctx, b, hlFor); }
        } catch (e) { stats.errors++; }
      },
      measure: function (markup, o) { try { var L = layout(markup, blockFont(o || {}), num((o || {}).w, 1e9), {}); return { w: L.w, h: L.h, lines: L.lines.length }; } catch (e) { return { w: 0, h: 0, lines: 0 }; } },
      remove: function (id) { delete blocks[String(id)]; },
      hide: function (id, hidden) { var b = blocks[String(id)]; if (b) b.visible = hidden === false; },
      mark: mark,
      icon: function (ctx, name, x, y, size, color, px) { try { return drawIcon(ctx, name, x, y, size, color, px == null ? pixelMode() : !!px, 1); } catch (e) { return false; } },
      keywords: setKeywords,
      define: function (id, d) { KW[keyName(id)] = d || {}; relayAll(); },
      setParams: setParams,
      params: function () { var o = {}; for (var k in P) o[k] = P[k]; return o; },
      pointer: pointer,
      key: key,
      // scripted / test control (same paths as the input)
      anchors: function (level) { return (level == null ? baseAnchors() : layerAnchors(level)).map(function (a) { return { id: a.id, key: a.key, x: a.x, y: a.y, w: a.w, h: a.h, level: a.level }; }); },
      open: function (idOrKey, o) { o = o || {}; var a = findAnchor(idOrKey); if (!a) { var B = baseAnchors(); for (var i = 0; i < B.length; i++) if (B[i].key === keyName(idOrKey)) { a = B[i]; break; } } if (!a) return false; var t = openTip(a, a.level, o.via || 'api', !!o.pin); return !!t; },
      openAt: function (key2, rect, o) { o = o || {}; var r = rectOf(rect); if (!r || !kwOf(key2)) return false; var a = { id: 'at:' + keyName(key2), key: kwId(key2), x: r.x, y: r.y, w: r.w, h: r.h, level: 0 };
        marks['at:' + keyName(key2)] = { id: 'at:' + keyName(key2), key: a.key, x: r.x, y: r.y, w: r.w, h: r.h, stamp: 1e15, o: {} }; return !!openTip({ id: 'mark:at:' + keyName(key2), key: a.key, x: r.x, y: r.y, w: r.w, h: r.h, level: 0 }, 0, o.via || 'api', !!o.pin); },
      pin: function (on) { var t = tips[tips.length - 1]; if (t) pinTip(t, on !== false); return !!t; },
      close: function (level) { closeFrom(level == null || level === 'all' ? 0 : +level || 0); if (level == null || level === 'all') { focus = null; delete marks['at']; for (var m in marks) if (m.indexOf('at:') === 0) delete marks[m]; } },
      focusNext: function (dir) { queue.push({ k: 'focus', dir: dir < 0 ? -1 : 1 }); },
      isOpen: function () { return tips.length > 0; },
      busy: function () { return false; },
      state: function () {
        return { t: Math.round(clock), render: pixelMode() ? 'pixel' : 'hd', scale: uiScale(), view: V(), cssScale: Math.round(cssScale * 1000) / 1000,
          open: tips.map(function (t) { return { uid: t.uid, key: t.key, level: t.level, pinned: t.pinned, via: t.via, side: t.side, anchor: t.anchor, anchorId: t.anchorId,
            hidden: !!t.hiddenBy, stacked: !!t.stack, attach: att(t), attachHidden: !!(t.stack && t.attachLevel > 0 && tips[t.attachLevel - 1] && tips[t.attachLevel - 1].hiddenBy), rect: { x: Math.round(t.pos.x * 10) / 10, y: Math.round(t.pos.y * 10) / 10, w: t.rectT.w, h: t.rectT.h }, target: t.rectT, age: Math.round(clock - t.born), clipped: !!t.clipH }; }),
          fading: fading.length, focus: focus ? { id: focus.id, level: focus.level, key: (findAnchor(focus.id) || {}).key || null } : null, hover: hov.id, pointer: ptr.in ? { x: Math.round(ptr.x), y: Math.round(ptr.y) } : null,
          press: press ? { anchor: press.a, x: press.x0, y: press.y0, k: clamp((clock - press.t0) / P.longPress, 0, 1), fired: press.fired } : null, anchors: baseAnchors().length };
      },
      lastDrawn: function () { return drawnList.slice(); },
      stats: function () { var o = {}; for (var k in stats) o[k] = stats[k]; o.open = tips.length; return o; },
      debug: function () { return { errors: stats.errors, warnings: Object.keys(warned) }; },
      destroy: function () { L_.forEach(function (l) { try { l[0].removeEventListener(l[1], l[2], l[3] ? { capture: true } : false); } catch (e) { } }); L_ = []; tips = []; fading = []; cursorStyle(null); }
    };
    return inst;
  }

  root.GameDNA_KeywordTooltips = { create: create, version: VERSION, DEFAULTS: DEFAULTS, THEMES: THEMES, icons: Object.keys(ICON_PX) };
})(typeof window !== 'undefined' ? window : this);
