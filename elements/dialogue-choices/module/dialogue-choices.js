/* GameDNA H-02 · Branching choices with flags · module v1 (plain script, no dependencies, one global: GameDNA_DialogueChoices)
 *
 *   const talk = GameDNA_DialogueChoices.create({
 *     box: dlg,                                   // a GameDNA_DialogueBox (H-01) instance: talk drives it (update / draw / input)
 *     // or adapter: { show(line, done), close(), rect() }   // your game's own text box instead (see README)
 *     script: { elder: [ ...lines ], gate: [ ...lines ] },  // conversations by name: plain arrays the designer edits
 *     flags: { gold: 0, metElder: false },        // every flag the game uses, with its start value
 *     view: { w: 256, h: 224 },                   // or bounds: { x, y, w, h }
 *     autoplay: () => AUTOPLAY,                   // ?auto=1: menus pick their default option by themselves
 *     uiRects: () => [hudRect],                   // never covered by the menu
 *     onChoice: c => {}, onFlag: (name, value, old) => {}, onEnd: r => {}
 *   });
 *   talk.start('elder', { onEnd: r => {} })       // false while a talk runs
 *   talk.busy()  talk.choosing()                  // pause the world while busy; the menu is up while choosing
 *   talk.press() / tap() / move(-1 | 1) / back() / hold(down) / key(code, down) / tapAt(x, y)
 *   talk.update(dtMs)  talk.draw(ctx)             // also update / draw the box in box mode
 *   talk.get(name) set(name, v) inc(name, n) check('gold>=10 && !metElder') getFlags() setFlags(obj) resetFlags()
 *   GameDNA_DialogueChoices.validate(script, { flags })  -> { ok, errors, warnings, unreachableLabels, unknownFlags, ... }
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var DEFAULTS = { menuPlace: 'auto', timeout: 0, wrap: 'on', disabled: 'show', tint: 'a', autoplayMs: 600, openMs: 80, armMs: 60, margin: 6, minWidth: 64, maxWidth: 0 };
  var ROW = 12, PAD_T = 5, PAD_B = 4, TXT_X = 14, REASON_H = 12, TIMER_H = 6, GAP = 2;
  var UP_KEYS = { ArrowUp: 1, KeyW: 1, w: 1, W: 1, Up: 1 }, DOWN_KEYS = { ArrowDown: 1, KeyS: 1, s: 1, S: 1, Down: 1 };
  var OK_KEYS = { KeyZ: 1, z: 1, Z: 1, Space: 1, ' ': 1, Enter: 1, NumpadEnter: 1 }, BACK_KEYS = { KeyX: 1, x: 1, X: 1, Escape: 1, Esc: 1, Backspace: 1 };

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
  var FB = { ink: '#06061a', 'text.main': '#ffffff', 'text.shadow': '#0a0c24', 'text.dim': '#8088a8', 'text.select': '#fff4c0', 'text.red': '#ff8a7a',
    'text.accent': '#ffe070', 'text.pointer': '#fff8e8', 'text.pointerEdge': '#1a0e08', 'ui.select': 'rgba(255,255,255,0.2)', 'ui.rivet': '#ffe070', 'ui.rivetShade': '#7a5410',
    'bar.out': '#0a0c24', 'bar.empty': '#1a2040', 'bar.fill': '#ffd060', 'bar.top': '#fff4b0' };

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function area(a, b) { return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); }
  function okRect(r) { return r && isFinite(r.x) && isFinite(r.y) && r.w > 0 && r.h > 0; }
  function mkCanvas(w, h) { try { var c = root.document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; } catch (e) { return null; } }
  function own(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
  function isPlain(v) { return v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && isFinite(v)); }

  /* ---------- conditions: gold>=10 && !metElder, plan == "mill" || (a + b) > 3 (no eval) ---------- */
  var EXPR = {};
  function tokenize(s) {
    var out = [], i = 0, m;
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if ((m = /^\d+(\.\d+)?/.exec(s.slice(i)))) { out.push({ t: 'num', n: +m[0] }); i += m[0].length; continue; }
      if (c === '"' || c === "'") { var j = s.indexOf(c, i + 1); if (j < 0) throw new Error('unclosed string'); out.push({ t: 'str', s: s.slice(i + 1, j) }); i = j + 1; continue; }
      if ((m = /^[A-Za-z_][\w.]*/.exec(s.slice(i)))) {
        var w = m[0], lw = w.toLowerCase();
        if (lw === 'and') out.push({ t: 'op', v: '&&' }); else if (lw === 'or') out.push({ t: 'op', v: '||' }); else if (lw === 'not') out.push({ t: 'op', v: '!' });
        else out.push({ t: 'id', v: w });
        i += w.length; continue;
      }
      var two = s.substr(i, 2);
      if (two === '&&' || two === '||' || two === '==' || two === '!=' || two === '>=' || two === '<=') { out.push({ t: 'op', v: two }); i += 2; if (s[i] === '=') i++; continue; }
      if ('!<>()+-'.indexOf(c) >= 0) { out.push({ t: 'op', v: c }); i++; continue; }
      if (c === '=') { out.push({ t: 'op', v: '==' }); i++; continue; }
      throw new Error('unexpected "' + c + '"');
    }
    return out;
  }
  function truthy(v) { return !!v && v !== '0' && v !== 'false'; }
  function eq(a, b) {
    if (typeof a === 'boolean' || typeof b === 'boolean') return truthy(a) === truthy(b);
    if (a == null) a = 0; if (b == null) b = 0;
    if (typeof a === 'number' || typeof b === 'number') { var x = +a, y = +b; if (isFinite(x) && isFinite(y)) return x === y; }
    return String(a) === String(b);
  }
  function compile(src) {
    src = src == null ? '' : String(src).trim();
    if (own(EXPR, src)) return EXPR[src];
    var names = {}, res;
    try {
      var T = tokenize(src), p = 0;
      var is = function (v) { return T[p] && T[p].t === 'op' && T[p].v === v; };
      var primary = function () {
        var t = T[p++]; if (!t) throw new Error('unexpected end');
        if (t.t === 'num') return function () { return t.n; };
        if (t.t === 'str') return function () { return t.s; };
        if (t.t === 'id') {
          if (t.v === 'true') return function () { return true; };
          if (t.v === 'false') return function () { return false; };
          names[t.v] = 1; var nm = t.v; return function (F) { return F(nm); };
        }
        if (t.v === '(') { var e = orx(); if (!is(')')) throw new Error('missing )'); p++; return e; }
        throw new Error('unexpected "' + t.v + '"');
      };
      var unary = function () {
        if (is('!')) { p++; var a = unary(); return function (F) { return !truthy(a(F)); }; }
        if (is('-')) { p++; var b = unary(); return function (F) { return -(+b(F) || 0); }; }
        return primary();
      };
      var add = function () {
        var a = unary();
        while (is('+') || is('-')) { var op = T[p++].v, l = a, r = unary(); a = op === '+' ? function (F) { return (+l(F) || 0) + (+r(F) || 0); } : function (F) { return (+l(F) || 0) - (+r(F) || 0); }; }
        return a;
      };
      var cmp = function () {
        var a = add();
        if (T[p] && T[p].t === 'op' && /^(==|!=|>=|<=|>|<)$/.test(T[p].v)) {
          var op = T[p++].v, l = a, r = add();
          return function (F) {
            var x = l(F), y = r(F);
            if (op === '==') return eq(x, y); if (op === '!=') return !eq(x, y);
            x = +x || 0; y = +y || 0;
            return op === '>=' ? x >= y : op === '<=' ? x <= y : op === '>' ? x > y : x < y;
          };
        }
        return a;
      };
      var andx = function () { var a = cmp(); while (is('&&')) { p++; var l = a, r = cmp(); a = (function (l, r) { return function (F) { return truthy(l(F)) && truthy(r(F)); }; })(l, r); } return a; };
      var orx = function () { var a = andx(); while (is('||')) { p++; var l = a, r = andx(); a = (function (l, r) { return function (F) { return truthy(l(F)) || truthy(r(F)); }; })(l, r); } return a; };
      if (!T.length) throw new Error('empty condition');
      var fn = orx();
      if (p < T.length) throw new Error('unexpected "' + (T[p].v != null ? T[p].v : T[p].t) + '"');
      res = { fn: fn, names: Object.keys(names), error: null };
    } catch (e) { res = { fn: function () { return false; }, names: Object.keys(names), error: String(e && e.message || e) }; }
    return (EXPR[src] = res);
  }
  function condOk(src, F) { if (src == null || src === '') return true; if (typeof src === 'boolean') return src; try { return truthy(compile(src).fn(F)); } catch (e) { return false; } }

  /* ---------- script helpers ---------- */
  function normEntry(e) {
    if (e == null) return { text: '' };
    if (typeof e === 'string' || typeof e === 'number') return { text: String(e) };
    return typeof e === 'object' ? e : { text: '' };
  }
  function isLine(e) { return (e.text != null && e.text !== '') || (Array.isArray(e.choices) && e.choices.length > 0); }
  function labelIndex(entries, label) {
    if (typeof label === 'number') return label >= 0 && label < entries.length ? label : -1;
    for (var i = 0; i < entries.length; i++) { var e = entries[i]; if (e && typeof e === 'object' && e.label === label) return i; }
    return -1;
  }
  function entryKey(conv, e, pc) { return 'seen:' + conv + ':' + (e.id != null ? e.id : e.label != null ? e.label : '#' + pc); }
  function optKey(conv, e, pc, o, k) { return entryKey(conv, e, pc) + '/' + (o.id != null ? o.id : k); }
  var VAR = /\{\$([A-Za-z_][\w.]*)\}/g;
  function textFlags(s) { var out = [], m; s = String(s == null ? '' : s); VAR.lastIndex = 0; while ((m = VAR.exec(s))) out.push(m[1]); return out; }
  function interp(s, get) { return String(s == null ? '' : s).replace(VAR, function (_, n) { var v = get(n); return v == null ? '' : String(v); }); }
  function plainText(s) { return String(s == null ? '' : s).replace(/\{\{/g, '\u0001').replace(/\{[^{}]{0,24}\}/g, '').replace(/\u0001/g, '{'); }
  function convList(script) {
    if (!script) return {};
    if (Array.isArray(script)) return { main: script };
    var out = {}; for (var k in script) if (own(script, k) && Array.isArray(script[k])) out[k] = script[k];
    return out;
  }

  /* ---------- validator: unreachable labels, unknown goto targets, unknown / unused flags, bad conditions ---------- */
  function validate(script, opts) {
    opts = opts || {};
    var convs = convList(script), errors = [], warnings = [], unreachableLabels = [], unknownTargets = [], read = {}, written = {}, where = {};
    var declared = {}, k;
    if (opts.flags) for (k in opts.flags) if (own(opts.flags, k)) declared[k] = 1;
    (opts.hostFlags || []).forEach(function (n) { declared[n] = 1; });
    var noteRead = function (n, at) { if (/^seen:/.test(n)) return; read[n] = 1; if (!where[n]) where[n] = at; };
    var cond = function (src, at) {
      if (src == null || src === '' || typeof src === 'boolean') return;
      var c = compile(src); if (c.error) errors.push(at + ': condition "' + src + '": ' + c.error);
      c.names.forEach(function (n) { noteRead(n, at); });
    };
    var acts = function (o, at) {
      if (o.set && typeof o.set === 'object') for (var n in o.set) if (own(o.set, n)) { written[n] = 1; if (!isPlain(o.set[n])) errors.push(at + ': set.' + n + ' must be a number, string, boolean or null'); }
      if (o.inc && typeof o.inc === 'object') for (var m in o.inc) if (own(o.inc, m)) { written[m] = 1; noteRead(m, at); if (!isFinite(+o.inc[m])) errors.push(at + ': inc.' + m + ' must be a number'); }
    };
    var report = {};
    Object.keys(convs).forEach(function (name) {
      var E = convs[name].map(normEntry), labels = {}, edges = [], i;
      E.forEach(function (e, i) {
        if (e.label != null) { if (own(labels, e.label)) errors.push(name + ': label "' + e.label + '" is used twice'); else labels[e.label] = i; }
      });
      var target = function (g, at) {
        var t = labelIndex(E, g);
        if (t < 0) { errors.push(at + ': goto "' + g + '" has no matching label'); unknownTargets.push(name + ':' + g); }
        return t;
      };
      E.forEach(function (e, i) {
        var at = name + '[' + i + ']' + (e.label != null ? ' (' + e.label + ')' : ''), out = [];
        cond(e.if, at); acts(e, at); textFlags(e.text).forEach(function (n) { noteRead(n, at); });
        if (e.if != null || e.once) out.push(i + 1);                                   // skipped when false / seen
        var after = e.end ? -1 : e.goto != null ? target(e.goto, at) : i + 1;
        if (Array.isArray(e.choices) && e.choices.length) {
          var n = e.choices.length;
          if (n < 2 || n > 4) warnings.push(at + ': ' + n + ' choices (the menu is made for 2 to 4)');
          if (e.text == null || e.text === '') warnings.push(at + ': choices without text (the menu opens over an empty box)');
          var always = 0;
          e.choices.forEach(function (o, j) {
            var oat = at + ' choice ' + j;
            if (!o || typeof o !== 'object' || o.text == null || o.text === '') { errors.push(oat + ': a choice needs text'); return; }
            cond(o.if, oat); acts(o, oat); textFlags(o.text).forEach(function (q) { noteRead(q, oat); });
            if (o.if == null && !o.once) always++;
            out.push(o.end ? -1 : o.goto != null ? target(o.goto, oat) : after);
          });
          if (!always) warnings.push(at + ': every choice has a condition or once; if all are off at runtime the menu is skipped');
          if (e.default != null && typeof e.default === 'number' && (e.default < 0 || e.default >= n)) warnings.push(at + ': default ' + e.default + ' is not a choice index');
          if (e.cancel != null && typeof e.cancel === 'number' && (e.cancel < 0 || e.cancel >= n)) warnings.push(at + ': cancel ' + e.cancel + ' is not a choice index');
        } else out.push(after);
        if (e.once && e.id == null && e.label == null) warnings.push(at + ': once without label or id is remembered by position; give it an id so saves survive script edits');
        if (e.choices && e.choices.some && e.choices.some(function (o) { return o && o.once && o.id == null; })) warnings.push(at + ': a once choice without id is remembered by position');
        edges[i] = out.filter(function (t) { return t >= 0 && t < E.length; });
      });
      var seen = {}, q = E.length ? [0] : [];
      if (opts.entries && opts.entries[name]) [].concat(opts.entries[name]).forEach(function (l) { var t = labelIndex(E, l); if (t >= 0) q.push(t); });
      while (q.length) { i = q.shift(); if (seen[i]) continue; seen[i] = 1; (edges[i] || []).forEach(function (t) { if (!seen[t]) q.push(t); }); }
      var unl = [], une = [];
      for (i = 0; i < E.length; i++) if (!seen[i]) { if (E[i].label != null) unl.push(E[i].label); else if (isLine(E[i])) une.push(i); }
      unl.forEach(function (l) { unreachableLabels.push(name + ':' + l); warnings.push(name + ': label "' + l + '" can never be reached'); });
      une.forEach(function (i) { warnings.push(name + '[' + i + ']: this line can never be reached'); });
      report[name] = { entries: E.length, labels: Object.keys(labels), unreachableLabels: unl, unreachableLines: une };
    });
    var unknownFlags = Object.keys(read).filter(function (n) { return !declared[n] && !written[n]; }).sort();
    unknownFlags.forEach(function (n) { warnings.push(where[n] + ': flag "' + n + '" is read but never set or declared (typo? declare it in flags)'); });
    var unusedFlags = Object.keys(written).filter(function (n) { return !read[n] && !declared[n]; }).sort();
    return { ok: !errors.length && !unknownFlags.length && !unreachableLabels.length, errors: errors, warnings: warnings, unreachableLabels: unreachableLabels,
      unknownTargets: unknownTargets, unknownFlags: unknownFlags, unusedFlags: unusedFlags, conversations: report };
  }

  function create(o) {
    o = o || {};
    var API = root.GameDNA_Skin || null, SK = null;
    if (o.skin !== false) { try { SK = API && API.resolve ? API.resolve(o.skin) : null; } catch (e) { SK = null; } }
    var P = {}, warned = {}, lastCanvas = null, clock = 0, talks = 0;
    var box = o.box && typeof o.box.open === 'function' ? o.box : null, AD = !box && o.adapter && typeof o.adapter.show === 'function' ? o.adapter : null;
    var SCRIPT = convList(o.script), DECL = {}, F = {}, T = null, M = null, last = null, drawnRects = [], keyHeld = {};
    setParams(o.params || {});
    if (o.flags && typeof o.flags === 'object') for (var fk in o.flags) if (own(o.flags, fk) && isPlain(o.flags[fk])) DECL[fk] = o.flags[fk];
    resetFlags(true);
    if (!box && !AD) warnOnce('nobox', 'create() needs box (a GameDNA_DialogueBox instance) or adapter ({show(line, done)}); talks will end at once');

    function dbg(e) { if (typeof o.debug === 'function') { try { o.debug(e); } catch (x) { } } }
    function warnOnce(key, msg) { if (warned[key]) return; warned[key] = 1; try { if (root.console) console.warn('GameDNA_DialogueChoices: ' + msg); } catch (e) { } dbg({ event: 'warn', key: key, msg: msg }); }
    function call(fn, a, b, c) { if (typeof fn === 'function') { try { return fn(a, b, c); } catch (x) { warnOnce('cb', 'a host callback threw: ' + x); } } return undefined; }
    function setParams(p) {
      p = p || {};
      for (var k in p) if (own(DEFAULTS, k) && p[k] != null && p[k] !== '') P[k] = p[k];
      for (k in DEFAULTS) if (P[k] == null) P[k] = DEFAULTS[k];
      for (k in DEFAULTS) if (typeof DEFAULTS[k] === 'number') P[k] = num(P[k], DEFAULTS[k]);
      P.timeout = clamp(P.timeout, 0, 60000); P.autoplayMs = clamp(P.autoplayMs, 0, 10000); P.openMs = clamp(P.openMs, 0, 1000); P.armMs = clamp(P.armMs, 0, 1000);
      P.margin = clamp(Math.round(P.margin), 0, 64); P.minWidth = clamp(Math.round(P.minWidth), 24, 400); P.maxWidth = clamp(Math.round(P.maxWidth), 0, 2000);
      if (M) M.relayout = true;
    }

    /* ---------- flag store ---------- */
    function getF(n) { return own(F, n) ? F[n] : undefined; }
    function setF(n, v, why) {
      n = String(n); if (!isPlain(v)) { warnOnce('setval', 'set(' + n + '): only numbers, strings, booleans and null are kept (save-friendly); got ' + typeof v); return false; }
      var old = getF(n); if (old === v && own(F, n)) return true;
      F[n] = v; dbg({ event: 'flag', name: n, value: v, old: old, why: why || 'set' });
      if (!/^seen:/.test(n)) call(o.onFlag, n, v, old);
      return true;
    }
    function incF(n, by, why) { by = num(by == null ? 1 : by, 0); return setF(n, (num(getF(n), 0) || 0) + by, why || 'inc'); }
    function resetFlags(silent) { F = {}; for (var k in DECL) F[k] = DECL[k]; if (!silent) dbg({ event: 'flag', name: '*', value: null, why: 'reset' }); }
    function realEnv() { return { get: getF, set: function (n, v) { setF(n, v, 'script'); }, inc: function (n, b) { incF(n, b, 'script'); }, seen: function (k) { return truthy(getF(k)); }, mark: function (k) { setF(k, true, 'once'); } }; }
    function dryEnv() {
      var C = {}; for (var k in F) C[k] = F[k];
      return { get: function (n) { return own(C, n) ? C[n] : undefined; }, set: function (n, v) { C[n] = v; }, inc: function (n, b) { C[n] = (num(C[n], 0) || 0) + num(b == null ? 1 : b, 0); },
        seen: function (k) { return truthy(C[k]); }, mark: function (k) { C[k] = true; } };
    }
    function apply(e, env) {
      if (e.set && typeof e.set === 'object') for (var n in e.set) if (own(e.set, n)) env.set(n, e.set[n]);
      if (e.inc && typeof e.inc === 'object') for (var m in e.inc) if (own(e.inc, m)) env.inc(m, e.inc[m]);
    }
    function check(src, env) { env = env || realEnv(); return condOk(src, env.get); }

    /* ---------- walking the script ---------- */
    function nextPc(E, e, pc) {
      if (e.end) return -1;
      if (e.goto != null) { var t = labelIndex(E, e.goto); if (t < 0) warnOnce('goto:' + e.goto, 'goto "' + e.goto + '": no such label; the talk ends there'); return t; }
      return pc + 1;
    }
    // from pc, skip lines whose if is false or once-seen, run command entries (set / inc / goto / end); return the next line to show
    function resolve(conv, E, pc, env) {
      var guard = 0;
      while (pc >= 0 && pc < E.length) {
        if (++guard > 1000) { warnOnce('loop', 'the script loops through gotos without showing a line; the talk ends'); return null; }
        var e = normEntry(E[pc]);
        if (e.if != null && !check(e.if, env)) { pc++; continue; }
        if (e.once && env.seen(entryKey(conv, e, pc))) { pc++; continue; }
        if (isLine(e)) return { pc: pc, e: e };
        apply(e, env); if (e.once) env.mark(entryKey(conv, e, pc));
        pc = nextPc(E, e, pc);
      }
      return null;
    }
    function present(conv, at, env) {
      var e = at.e, line = {};
      ['speaker', 'who', 'anchor', 'place', 'tint', 'speed', 'pause', 'auto', 'nameColor', 'label'].forEach(function (k) { if (e[k] != null) line[k] = e[k]; });
      line.text = interp(e.text, env.get); line.plain = plainText(line.text); line.hasChoices = !!(e.choices && e.choices.length);
      line.__dc = { conv: conv, pc: at.pc, e: e, talk: T ? T.id : 0 };
      return line;
    }
    function shown(line) {           // a line reaches the screen: run its set / inc and once, tell the host
      var d = line.__dc, e = d.e;
      T.cur = { pc: d.pc, e: e, line: line, boxIndex: -1 }; T.lines++;
      if (e.label != null) T.path.push(e.label);
      apply(e, realEnv()); if (e.once) setF(entryKey(T.conv, e, d.pc), true, 'once');
      dbg({ event: 'line', id: T.id, conv: T.conv, pc: d.pc, label: e.label, speaker: e.speaker == null ? null : String(e.speaker), text: line.text, choices: line.hasChoices });
      call(T.opt.onLine, line, { conv: T.conv, pc: d.pc, label: e.label }); call(o.onLine, line, { conv: T.conv, pc: d.pc, label: e.label });
    }
    function options(e, pc, env) {
      var out = [];
      (e.choices || []).forEach(function (c, k) {
        if (!c || typeof c !== 'object' || c.text == null) return;
        if (c.once && env.seen(optKey(T.conv, e, pc, c, k))) return;
        var en = check(c.if, env);
        if (!en && (c.hide || P.disabled === 'hide')) return;
        out.push({ k: k, c: c, text: interp(c.text, env.get), enabled: en, reason: en ? (c.hint != null ? interp(c.hint, env.get) : '') : interp(c.reason != null ? c.reason : 'Not available', env.get) });
      });
      return out;
    }
    function pickIndex(opts, want) {     // want = choice index (script order) or id
      if (want == null) return -1;
      for (var i = 0; i < opts.length; i++) if (opts[i].k === want || (opts[i].c.id != null && opts[i].c.id === want)) return i;
      return -1;
    }
    function defaultOf(e, opts) {
      var d = pickIndex(opts, e.default != null ? e.default : null);
      if (d >= 0 && opts[d].enabled) return d;
      for (var i = 0; i < opts.length; i++) if (opts[i].enabled) return i;
      return -1;
    }

    /* ---------- talks ---------- */
    function start(which, opt) {
      opt = opt || {};
      if (T || (box && box.busy())) { dbg({ event: 'ignored', conv: String(which) }); return false; }
      var conv, E;
      if (Array.isArray(which)) { E = which; conv = String(opt.name || 'talk'); if (!SCRIPT[conv]) SCRIPT[conv] = which; }
      else { conv = String(which); E = SCRIPT[conv]; if (!E && opt.script) E = convList(opt.script)[conv]; }
      if (!E) { warnOnce('noconv:' + conv, 'start("' + conv + '"): no such conversation in script'); return false; }
      var at = opt.at != null ? labelIndex(E, opt.at) : 0;
      if (at < 0) { warnOnce('noat:' + opt.at, 'start(..., {at: "' + opt.at + '"}): no such label'); return false; }
      T = { id: ++talks, conv: conv, E: E, opt: opt, lines: 0, path: [], choices: [], cur: null, auto: false, natural: false, adToken: 0, ended: false };
      dbg({ event: 'start', id: T.id, conv: conv });
      var first = resolve(conv, E, at, realEnv());
      if (!first || (!box && !AD)) { finish(false); return true; }
      if (box) {
        var line = present(conv, first, realEnv());
        var ok = box.open([line], { onLine: hookLine, onLineEnd: hookLineEnd, onEnd: hookEnd, auto: opt.auto });
        if (!ok) { dbg({ event: 'ignored', conv: conv, why: 'box busy' }); T = null; return false; }
      } else showAd(first);
      return true;
    }
    function finish(skipped) {
      var t = T; if (!t || t.ended) return; t.ended = true;
      var res = { conv: t.conv, id: t.id, lines: t.lines, choices: t.choices.slice(), path: t.path.slice(), skipped: !!skipped, auto: !!t.auto, flags: getFlags() };
      T = null; M = null; last = res;
      dbg({ event: 'end', id: t.id, conv: t.conv, lines: res.lines, choices: res.choices.length, skipped: res.skipped });
      call(t.opt.onEnd, res); call(o.onEnd, res);
    }
    // box mode: the H-01 hooks
    function hookLine(line, i, ctl) {
      var d = line && line.__dc; if (!T || !d || d.talk !== T.id) return;
      shown(line); T.cur.boxIndex = i; T.wantMenu = !!line.hasChoices;
      if (line.hasChoices) return;
      var nx = nextPc(T.E, d.e, d.pc), env = dryEnv(), ahead = nx >= 0 ? resolve(T.conv, T.E, nx, env) : null;   // look ahead (no side effects) so the box shows "more" vs "end" right
      if (ahead) { var ph = present(T.conv, ahead, env); ph.__ph = true; ctl.insert([ph]); }
    }
    function hookLineEnd(line, i, ctl) {
      var d = line && line.__dc; if (!T || !d || d.talk !== T.id) return undefined;
      if (line.hasChoices) {
        if (!M) openMenu(d, i);
        if (M) return false;                           // hold the box on the question while the menu is up
      }
      var nx = nextPc(T.E, d.e, d.pc), at = nx >= 0 ? resolve(T.conv, T.E, nx, realEnv()) : null, L = ctl.lines(), ph = L[i + 1];
      if (at) {
        var fresh = present(T.conv, at, realEnv());
        if (ph && ph.__ph) { for (var k in ph) if (own(ph, k)) delete ph[k]; for (k in fresh) ph[k] = fresh[k]; }
        else ctl.insert([fresh]);
      } else if (ph && ph.__ph) { T.natural = true; ctl.end(); }
      else T.natural = true;
      return undefined;
    }
    function hookEnd(r) { if (!T) return; T.auto = !!(r && r.auto); finish(r ? r.skipped && !T.natural : false); }
    // adapter mode: the host's own box shows one line at a time and calls done() when the player has advanced past it
    function showAd(at) {
      var line = present(T.conv, at, realEnv()), tok = ++T.adToken, id = T.id;
      shown(line);
      var done = function () {
        if (!T || T.id !== id || T.adToken !== tok || M) return;
        T.adToken++;
        afterAd(line);
      };
      try { AD.show(line, done); } catch (e) { warnOnce('show', 'adapter.show threw: ' + e + '; the talk ends'); closeAd(); finish(true); }
    }
    function afterAd(line) {
      var d = line.__dc;
      if (line.hasChoices) { openMenu(d, -1); if (M) { try { AD.show(line, null); } catch (e) { } return; } }
      var nx = nextPc(T.E, d.e, d.pc), at = nx >= 0 ? resolve(T.conv, T.E, nx, realEnv()) : null;
      if (at) showAd(at); else { T.natural = true; closeAd(); finish(false); }
    }
    function closeAd() { if (AD && typeof AD.close === 'function') call(AD.close); }

    /* ---------- the menu ---------- */
    function autoOn() {
      if (T && T.opt.auto != null) return !!T.opt.auto;
      if (o.autoplay != null) return typeof o.autoplay === 'function' ? !!call(o.autoplay) : !!o.autoplay;
      if (box) { try { var st = box.state(); return !!(st && st.auto); } catch (e) { } }
      return false;
    }
    function openMenu(d, boxIndex) {
      var e = d.e, opts = options(e, d.pc, realEnv());
      if (!opts.length) { warnOnce('noopts', 'a choice line has no choice left to show (all hidden or once-used); the talk goes on after it'); return; }
      var def = defaultOf(e, opts);
      if (def < 0) { warnOnce('nonen', 'every choice on a line is disabled; the talk goes on after it (validate() warns about this)'); return; }
      var auto = autoOn(), to = e.timeout != null ? num(e.timeout, 0) : P.timeout;
      M = { d: d, e: e, opts: opts, cur: def, def: def, cancel: pickIndex(opts, e.cancel != null ? e.cancel : null), t: 0, auto: auto, autoT: 0, latch: false,
        timeout: to > 0 ? to : 0, left: to > 0 ? to : 0, rect: null, relayout: true, flashT: 0, drawn: false, boxIndex: boxIndex, id: T.id };
      if (T) T.auto = T.auto || auto;
      layoutMenu();
      dbg({ event: 'menu', id: T.id, conv: T.conv, pc: d.pc, label: e.label, options: opts.map(function (q) { return { text: q.text, enabled: q.enabled, reason: q.enabled ? '' : q.reason }; }),
        default: def, auto: auto, timeout: M.timeout, rect: M.rect ? { x: M.rect.x, y: M.rect.y, w: M.rect.w, h: M.rect.h } : null });
      call(o.onSfx, 'menu');
    }
    function pick(i, how) {
      var m = M; if (!m || !T) return;
      var q = m.opts[i]; if (!q || !q.enabled) return;
      var d = m.d, c = q.c, info = { conv: T.conv, at: d.e.label != null ? d.e.label : d.pc, index: q.k, id: c.id != null ? c.id : null, text: q.text, auto: how === 'auto', timeout: how === 'timeout', how: how };
      T.choices.push(info);
      M = null;
      apply(c, realEnv()); if (c.once) setF(optKey(T.conv, d.e, d.pc, c, q.k), true, 'once');
      dbg({ event: 'pick', id: T.id, conv: T.conv, index: q.k, row: i, text: q.text, how: how });
      call(o.onSfx, how === 'timeout' ? 'timeout' : 'pick');
      call(o.onChoice, info); call(T && T.opt.onChoice, info);
      if (!T) return;                                       // the host ended the talk in onChoice
      var nx = c.end ? -1 : c.goto != null ? labelIndex(T.E, c.goto) : nextPc(T.E, d.e, d.pc);
      if (c.goto != null && nx < 0) warnOnce('goto:' + c.goto, 'choice goto "' + c.goto + '": no such label; the talk ends there');
      var at = nx >= 0 ? resolve(T.conv, T.E, nx, realEnv()) : null;
      if (box) {
        if (at) { box.insert([present(T.conv, at, realEnv())]); box.next(); }
        else { T.natural = true; box.end(); }
      } else if (AD) {
        if (at) showAd(at); else { T.natural = true; closeAd(); finish(false); }
      }
    }
    function moveCursor(dir) {
      var m = M; if (!m || m.auto) return false;
      var n = m.opts.length, c = m.cur + (dir < 0 ? -1 : 1);
      if (c < 0) c = P.wrap === 'off' ? 0 : n - 1; else if (c >= n) c = P.wrap === 'off' ? n - 1 : 0;
      if (c !== m.cur) { m.cur = c; call(o.onSfx, 'move'); dbg({ event: 'move', row: c }); }
      return true;
    }
    function menuUpdate(dt) {
      var m = M; if (!m) return;
      m.t += dt; if (m.flashT > 0) m.flashT -= dt;
      if (m.relayout || !m.rect) layoutMenu();
      var ready = m.t >= P.openMs + P.armMs, latch = m.latch; m.latch = false;
      if (m.auto) {
        m.autoT += dt;
        if (m.autoT >= P.autoplayMs * 0.5 && m.cur !== m.def) { m.cur = m.def; call(o.onSfx, 'move'); }
        if (m.autoT >= P.autoplayMs && ready) { m.cur = m.def; pick(m.def, 'auto'); }
        return;
      }
      if (m.timeout > 0 && m.t >= P.openMs) {
        m.left -= dt;
        if (m.left <= 0) { m.left = 0; m.cur = m.def; pick(m.def, 'timeout'); return; }
      }
      if (latch && ready) {
        if (m.opts[m.cur] && m.opts[m.cur].enabled) pick(m.cur, 'player');
        else { m.flashT = 300; call(o.onSfx, 'buzz'); dbg({ event: 'buzz', row: m.cur }); }
      }
    }

    /* ---------- placement: next to the text box, never on a UI rect or the box, off the speaker ---------- */
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
    function textBoxRect() {
      var r = null;
      if (box) { try { r = box.rect(); } catch (e) { r = null; } }
      else if (AD && typeof AD.rect === 'function') r = call(AD.rect);
      else if (AD && okRect(AD.rect)) r = AD.rect;
      return okRect(r) ? { x: +r.x, y: +r.y, w: +r.w, h: +r.h } : null;
    }
    function speakerRect() { if (!box) return null; try { var st = box.state(); return st && okRect(st.anchor) ? st.anchor : null; } catch (e) { return null; } }
    function fit(s, w) {                               // truncate to w px with "..."
      if (textW(s) <= w) return s;
      while (s.length > 1 && textW(s + '...') > w) s = s.slice(0, -1);
      return s + '...';
    }
    function layoutMenu() {
      var m = M; if (!m) return;
      var f = field(); if (!f) { m.rect = null; return; }
      m.relayout = false;
      var maxW = Math.max(40, (P.maxWidth > 0 ? Math.min(P.maxWidth, f.w) : f.w) - 2 * P.margin), tw = 0, hasReason = false;
      m.opts.forEach(function (q) { tw = Math.max(tw, textW(q.text)); if (q.reason) hasReason = true; });
      var rw = 0; if (hasReason) m.opts.forEach(function (q) { if (q.reason) rw = Math.max(rw, textW(q.reason) + 12); });
      var w = clamp(Math.max(tw + TXT_X + 9, rw, P.minWidth), 24, maxW);
      m.opts.forEach(function (q) { q.show = fit(q.text, w - TXT_X - 7); q.why = q.reason ? fit(q.reason, w - 12) : ''; });
      var h = PAD_T + m.opts.length * ROW + PAD_B + (hasReason ? REASON_H : 0) + (m.timeout > 0 ? TIMER_H : 0);
      m.hasReason = hasReason; m.w = w; m.h = h;
      // candidates: beside the text box (above it when the box is low, below when it is high), right or left aligned
      var B = textBoxRect(), O = obstacles(), spk = speakerRect(), mg = P.margin;
      var want = String(P.menuPlace), xs = [], ys = [];
      var xR = B ? B.x + B.w - w - 4 : f.x + f.w - mg - w, xL = B ? B.x + 4 : f.x + mg;
      if (want === 'left') xs = [xL, xR]; else xs = [xR, xL];
      if (want !== 'auto' && want !== 'left' && want !== 'right') warnOnce('place', 'menuPlace must be auto, right or left');
      if (B) { var low = B.y + B.h / 2 > f.y + f.h / 2, above = B.y - GAP - h, below = B.y + B.h + GAP; ys = low ? [above, below] : [below, above]; }
      else { ys = [f.y + f.h - mg - h, f.y + mg]; warnOnce('nobox', 'no text box rect (box.rect() / adapter.rect()); the menu goes to the field edge'); }
      var R = function (x, y) { return { x: Math.round(clamp(x, f.x + mg, f.x + f.w - mg - w)), y: Math.round(y), w: w, h: h }; };
      var inField = function (r) { return r.y >= f.y && r.y + r.h <= f.y + f.h; };
      var blocked = function (r) { if (!inField(r)) return true; if (B && hit(r, B)) return true; for (var i = 0; i < O.length; i++) if (O[i].ui && hit(r, O[i])) return true; return false; };
      var cost = function (r, n) { var c = n * 50; if (spk) c += area(r, spk) * 4; for (var i = 0; i < O.length; i++) if (!O[i].ui) c += area(r, O[i]) * 0.5; return c; };
      var best = null, bestC = 1e18, n = 0;
      ys.forEach(function (y) { xs.forEach(function (x) { var r = R(x, y), c = cost(r, n++); if (!blocked(r) && c < bestC) { bestC = c; best = r; } }); });
      if (!best) {                                     // scan the field for any clear spot, nearest the preferred one
        var y0 = ys[0], step = y0 > f.y + f.h / 2 ? -2 : 2, tries = 0;
        for (var dy = 0; dy <= f.h && !best; dy += 2) {
          [y0 + dy * (step < 0 ? -1 : 1), y0 - dy * (step < 0 ? -1 : 1)].forEach(function (y) { xs.forEach(function (x) { if (best) return; tries++; var r = R(x, y); if (!blocked(r)) best = r; }); });
        }
      }
      if (!best) {
        var r0 = R(xs[0], ys[0]); r0.y = Math.round(clamp(r0.y, f.y, f.y + f.h - h)); best = r0;
        warnOnce('noroom', 'no spot for the choice menu clear of the text box and your UI rects; drawn next to the box. Check bounds / uiRects.');
        dbg({ event: 'noroom' });
      }
      m.rect = best;
    }

    /* ---------- text measuring and drawing (C-03 6x8 font on pixel skins, skin text on smooth skins) ---------- */
    function pixelSkin() { return !SK || SK.pixel !== false; }
    function tok(path) {
      if (SK) { try { var v = SK.token(path); if (typeof v === 'string' && v !== path) return v; } catch (e) { } }
      return FB[path] || null;
    }
    var MW = {};
    function textW(s) {
      s = String(s == null ? '' : s); var w = 0, i;
      if (!pixelSkin()) { if (MW[s] == null) { try { MW[s] = Math.ceil(+SK.measure(s, { font: 'ui' }) || 0); } catch (e) { MW[s] = s.length * 6; } } return MW[s]; }
      for (i = 0; i < s.length; i++) w += advOf(s[i]);
      return Math.max(0, w - 1);
    }
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
    function drawText(ctx, s, x, y, col) {
      s = String(s == null ? '' : s);
      if (!pixelSkin()) { try { SK.text(ctx, s, x, y, { font: 'ui', color: col }); } catch (e) { } return; }
      var sh = tok('text.shadow') || FB['text.shadow'], cx, i;
      for (var pass = 0; pass < 2; pass++) {
        cx = x;
        for (i = 0; i < s.length; i++) { var ch = s[i]; if (ch !== ' ') blit(ctx, ch, cx + (pass ? 0 : 1), y + (pass ? 0 : 1), pass ? col : sh); cx += advOf(ch); }
      }
    }
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
    function frameAny(ctx, r, role, team) {
      if (SK) { try { SK.frame(ctx, r, { role: role, team: team }); return; } catch (e) { } }
      if (role === 'row') { ctx.fillStyle = FB['ui.select']; ctx.fillRect(r.x, r.y, r.w, r.h); return; }
      frame16(ctx, r, team);
    }
    function hand(ctx, x, y) {
      if (SK) { try { SK.cursor(ctx, { x: x, y: y, w: 7, h: 5 }, 'hand', clock / 1000, {}); return; } catch (e) { } }
      var hx = x + (Math.floor(clock / 250) % 2);
      ['.oo....', 'owwoooo', 'owwwwwo', 'owwwwo.', '.oooo..'].forEach(function (row, yy) { for (var xx = 0; xx < 7; xx++) if (row[xx] !== '.') { ctx.fillStyle = row[xx] === 'o' ? FB['text.pointerEdge'] : FB['text.pointer']; ctx.fillRect(hx + xx, y + yy, 1, 1); } });
    }
    function timerBar(ctx, r, frac) {
      if (SK) { try { SK.bar(ctx, r, frac, frac < 0.3 ? 'enemy' : 'charge', {}); return; } catch (e) { } }
      ctx.fillStyle = FB['bar.out']; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = FB['bar.empty']; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      var fw = Math.round((r.w - 2) * clamp(frac, 0, 1)); ctx.fillStyle = FB['bar.fill']; ctx.fillRect(r.x + 1, r.y + 1, fw, r.h - 2); ctx.fillStyle = FB['bar.top']; ctx.fillRect(r.x + 1, r.y + 1, fw, 1);
    }
    function draw(ctx, ox, oy) {
      drawnRects = [];
      if (!ctx) return;
      try { if (ctx.canvas) lastCanvas = ctx.canvas; } catch (e) { }
      if (box) { try { box.draw(ctx, ox, oy); } catch (e) { warnOnce('boxdraw', 'box.draw failed: ' + e); } }
      var m = M; if (!m) return;
      try {
        if (m.relayout || !m.rect) layoutMenu();
        if (!m.rect) return;
        ox = num(ox, 0); oy = num(oy, 0);
        ctx.save();
        try { paint(ctx, m, ox, oy); } finally { ctx.restore(); }
      } catch (e) { warnOnce('draw', 'draw failed: ' + e); }
    }
    function paint(ctx, m, ox, oy) {
      if (pixelSkin()) ctx.imageSmoothingEnabled = false;
      var R = m.rect, open = P.openMs > 0 ? clamp(m.t / P.openMs, 0, 1) : 1;
      if (pixelSkin()) open = Math.round(open * 4) / 4;
      if (open <= 0) open = 0.25;
      var team = String(m.e.tint || P.tint); if (!WIN[team]) team = 'a';
      var bh = Math.max(4, Math.round(R.h * open)), x = R.x + ox, y = R.y + oy + Math.round((R.h - bh) / 2);
      frameAny(ctx, { x: x, y: y, w: R.w, h: bh }, 'window', team);
      drawnRects.push({ kind: 'menu', x: R.x, y: R.y, w: R.w, h: R.h });
      m.drawn = true;
      if (open < 1) return;
      var main = tok('text.main') || FB['text.main'], sel = tok('text.select') || main, dim = tok('text.dim') || FB['text.dim'];
      for (var i = 0; i < m.opts.length; i++) {
        var q = m.opts[i], ry = y + PAD_T + i * ROW;
        if (i === m.cur) { frameAny(ctx, { x: x + 3, y: ry - 1, w: R.w - 6, h: ROW - 1 }, 'row', team); hand(ctx, x + 4, ry + 2); }
        drawText(ctx, q.show, x + TXT_X, ry + 1, !q.enabled ? dim : i === m.cur ? sel : main);
        drawnRects.push({ kind: 'row', x: R.x + 3, y: R.y + PAD_T + i * ROW - 1, w: R.w - 6, h: ROW - 1, index: q.k, enabled: q.enabled, cursor: i === m.cur });
      }
      var yb = y + PAD_T + m.opts.length * ROW + PAD_B - 2;
      if (m.hasReason) {
        ctx.fillStyle = tok('text.shadow') || FB['text.shadow']; ctx.globalAlpha = 0.6; ctx.fillRect(x + 5, yb - 1, R.w - 10, 1); ctx.globalAlpha = 1;
        var q2 = m.opts[m.cur];
        if (q2 && q2.why) {
          var col = !q2.enabled ? (m.flashT > 0 && Math.floor(m.flashT / 75) % 2 ? main : (tok('text.red') || FB['text.red'])) : (tok('text.label') || dim);
          drawText(ctx, q2.why, x + 6, yb + 2, col);
        }
        yb += REASON_H;
      }
      if (m.timeout > 0) timerBar(ctx, { x: x + 6, y: yb, w: R.w - 12, h: 4 }, m.left / m.timeout);
    }

    /* ---------- flags for saves ---------- */
    function getFlags() { var c = {}; for (var k in F) if (own(F, k)) c[k] = F[k]; return c; }
    function setFlags(obj, opt) {
      if (!obj || typeof obj !== 'object') { warnOnce('setflags', 'setFlags() needs a plain object (from getFlags())'); return false; }
      if (!(opt && opt.merge)) resetFlags(true);
      for (var k in obj) if (own(obj, k) && isPlain(obj[k])) F[k] = obj[k];
      dbg({ event: 'flag', name: '*', value: null, why: 'load' });
      return true;
    }

    /* ---------- input ---------- */
    function press() { if (M) { if (!M.auto) M.latch = true; return true; } if (box) return box.press(); return false; }
    function hold(down) { if (M) { if (box) box.hold(false); return true; } return box ? box.hold(down) : false; }
    function back() {
      var m = M; if (!m) return false;
      if (m.auto) return true;
      if (m.cancel >= 0 && m.opts[m.cancel] && m.opts[m.cancel].enabled) { m.cur = m.cancel; pick(m.cancel, 'cancel'); return true; }
      return false;
    }
    function key(code, down) {
      code = String(code == null ? '' : code);
      if (!down) { keyHeld[code] = false; if (box) box.key(code, false); return !!(M && (UP_KEYS[code] || DOWN_KEYS[code] || OK_KEYS[code])); }
      if (M) {
        var rep = keyHeld[code]; keyHeld[code] = true;
        if (UP_KEYS[code]) { if (!rep) moveCursor(-1); return true; }
        if (DOWN_KEYS[code]) { if (!rep) moveCursor(1); return true; }
        if (OK_KEYS[code]) { if (!rep) press(); return true; }
        if (BACK_KEYS[code]) return rep ? false : back();
        return false;
      }
      keyHeld[code] = true;
      return box ? box.key(code, true) : false;
    }
    function tapAt(x, y) {
      var m = M;
      if (m && m.rect) {
        if (!(x >= m.rect.x && x < m.rect.x + m.rect.w && y >= m.rect.y && y < m.rect.y + m.rect.h)) return false;
        if (m.auto) return true;
        var i = Math.floor((y - m.rect.y - PAD_T + 1) / ROW);
        if (i >= 0 && i < m.opts.length) { if (i !== m.cur) { m.cur = i; call(o.onSfx, 'move'); } m.latch = true; }
        return true;
      }
      if (m) return false;
      return box ? box.tap() : false;
    }

    /* ---------- clock ---------- */
    function update(dt) {
      try {
        dt = num(dt, 0); if (dt < 0) dt = 0; if (dt > 250) dt = 250;
        clock += dt;
        if (box) box.update(dt);
        if (T && box && T.wantMenu && !M && T.cur && T.cur.boxIndex >= 0) {   // the question has typed out: open the menu now (no extra press)
          var st = box.state();
          if (st && st.index === T.cur.boxIndex && st.stage === 'wait' && st.page >= st.pages - 1) { T.wantMenu = false; box.next(); }
        }
        if (M) menuUpdate(dt);
      } catch (e) { warnOnce('update', 'update failed: ' + e); }
    }

    /* ---------- public ---------- */
    var inst = {
      start: start,
      say: function (lines, opt) { if (box) return box.open(lines, opt); return false; },
      busy: function () { return !!T || !!M || (box ? !!box.busy() : false); },
      choosing: function () { return !!M; },
      press: press, tap: press, hold: hold, back: back, key: key, tapAt: tapAt,
      move: function (d) { return moveCursor(d); },
      update: update, draw: draw,
      end: function () {
        if (!T) return false;
        M = null;
        if (box && box.busy()) { box.end(); return true; }
        closeAd(); finish(true); return true;
      },
      clear: function () { T = null; M = null; drawnRects = []; keyHeld = {}; if (box) { try { box.clear(); } catch (e) { } } },
      get: function (n) { return getF(n); },
      set: function (n, v) { return setF(n, v, 'host'); },
      inc: function (n, by) { return incF(n, by, 'host'); },
      check: function (src) { var c = compile(src); if (c.error) warnOnce('cond:' + src, 'condition "' + src + '": ' + c.error); return check(src); },
      getFlags: getFlags, setFlags: setFlags, resetFlags: function () { resetFlags(false); },
      validate: function (script) { return validate(script || o.script, { flags: DECL, hostFlags: o.hostFlags }); },
      state: function () {
        var m = M, t = T;
        if (!t && !m) return null;
        return { id: t ? t.id : null, conv: t ? t.conv : null, mode: box ? 'box' : AD ? 'adapter' : 'none', lines: t ? t.lines : 0, choices: t ? t.choices.slice() : [],
          line: t && t.cur ? { pc: t.cur.pc, label: t.cur.e.label != null ? t.cur.e.label : null, speaker: t.cur.e.speaker != null ? String(t.cur.e.speaker) : null, text: t.cur.line.text } : null,
          menu: m ? { options: m.opts.map(function (q) { return { index: q.k, text: q.text, enabled: q.enabled, reason: q.enabled ? '' : q.reason, id: q.c.id != null ? q.c.id : null }; }),
            cursor: m.cur, default: m.def, auto: m.auto, timeout: m.timeout, left: Math.max(0, Math.round(m.left)), open: m.t >= P.openMs, rect: m.rect ? { x: m.rect.x, y: m.rect.y, w: m.rect.w, h: m.rect.h } : null } : null };
      },
      menuRect: function () { return M && M.rect ? { x: M.rect.x, y: M.rect.y, w: M.rect.w, h: M.rect.h } : null; },
      rect: function () { var r = M && M.rect ? { x: M.rect.x, y: M.rect.y, w: M.rect.w, h: M.rect.h } : null, b = box ? box.rect() : null; return r || b || null; },
      lastDrawn: function () { return drawnRects.slice(); },
      lastResult: function () { return last; },
      setParams: function (p) { setParams(p); MW = {}; },
      params: function () { var c = {}; for (var k in DEFAULTS) c[k] = P[k]; return c; },
      script: function () { return SCRIPT; },
      box: box
    };
    return inst;
  }

  root.GameDNA_DialogueChoices = { version: VERSION, DEFAULTS: DEFAULTS, create: create, validate: validate,
    check: function (src, flags) { flags = flags || {}; return condOk(src, function (n) { return own(flags, n) ? flags[n] : undefined; }); },
    compile: function (src) { var c = compile(src); return { names: c.names.slice(), error: c.error }; } };
})(typeof window !== 'undefined' ? window : this);
