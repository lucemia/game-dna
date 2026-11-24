/* GameDNA C-07 - Title screen & menu flow - module v1.1.0 (plain script, no dependencies, one global: GameDNA_TitleMenu)
 *
 *   const menu = GameDNA_TitleMenu.create({
 *     canvas,                                   // the game's canvas: the menu draws on its own overlay canvas laid over it
 *     title: 'My Game', tagline: 'A short line',
 *     isTitle: () => scene === 'title',         // the game's own title scene (the menu opens on it, the game keeps it)
 *     canPause: () => scene === 'play',
 *     onStart: kind => { ...what the old title confirm did... },   // kind 'new' | 'continue'
 *     onQuitToTitle: () => { ...back to the game's title scene... },
 *     onOption: (key, value, all) => { ... },
 *   });
 *   in the fixed step:   menu.update(STEP_MS); if (menu.busy()) return;    // the world waits while a menu is open
 *   end of every render: menu.draw();
 *   while menu.titleShown(): draw only the title background (not the old logo / "press start" text)
 *
 * Skip flags: with ?auto=1, ?t=<ms>, freeze=1 or ?title=0 in the URL the module does nothing at all (busy() false, no
 * overlay, no listeners, options at their defaults); ?title=1 forces it on. The module owns its input: capture-phase
 * key and pointer listeners that consume events ONLY while a menu is open (and the pause key / pause button when
 * canPause() is true). Key-ups are never consumed. Everything advances on update(); draw() never changes state.
 * Source is ASCII only.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0', STEP = 1000 / 60;

  /* ---------- 5x7 bitmap font (uppercase) ---------- */
  var GLYPH = {
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
    '?': '01110,10001,00001,00010,00100,00000,00100', '+': '00000,00100,00100,11111,00100,00100,00000', '=': '00000,00000,11111,00000,11111,00000,00000',
    '%': '11001,11010,00010,00100,01000,01011,10011', '&': '01100,10010,10100,01000,10101,10010,01101', '#': '01010,11111,01010,01010,01010,11111,01010',
    '.': '0,0,0,0,0,0,1', ',': '00,00,00,00,00,01,10', ':': '0,0,1,0,0,1,0', '!': '1,1,1,1,1,0,1', "'": '1,1,0,0,0,0,0',
    '(': '01,10,10,10,10,10,01', ')': '10,01,01,01,01,01,10', '<': '0001,0010,0100,1000,0100,0010,0001', '>': '1000,0100,0010,0001,0010,0100,1000',
    '^': '00100,01110,11111,00000,00000,00000,00000', '|': '1,1,1,1,1,1,1', '*': '00000,10101,01110,11111,01110,10101,00000'
  };
  var GROWS = {};
  (function () { for (var k in GLYPH) GROWS[k] = GLYPH[k].split(','); })();
  function gw(ch) { if (ch === ' ') return 3; var g = GROWS[ch]; return g ? g[0].length : 5; }
  var BOLD = {};
  function boldRows(ch) { if (BOLD[ch]) return BOLD[ch]; var r = GROWS[ch]; if (!r) return null; BOLD[ch] = r.map(function (row) { var o = ''; for (var i = 0; i <= row.length; i++) o += (row[i] === '1' || row[i - 1] === '1') ? '1' : '0'; return o; }); return BOLD[ch]; }
  function boldMeasure(s) { s = String(s).toUpperCase(); var w = 0; for (var i = 0; i < s.length; i++) w += (s[i] === ' ' ? 3 : gw(s[i]) + 1) + 1; return Math.max(0, w - 1); }
  function pxMeasure(s) { s = String(s).toUpperCase(); var w = 0; for (var i = 0; i < s.length; i++) w += gw(s[i]) + 1; return Math.max(0, w - 1); }

  /* ---------- 7x7 icons (1 = shape, 2 = highlight) ---------- */
  var ICON = {
    'continue': ['0000011', '1000011', '1100011', '1210011', '1100011', '1000011', '0000011'],
    'new': ['0001000', '0002000', '1112111', '0122210', '0011100', '0110110', '1100011'],
    options: ['0010100', '0111110', '1120211', '0100010', '1120211', '0111110', '0010100'],
    quit: ['0111110', '0122210', '0122210', '0122110', '0122210', '0122210', '1111111'],
    resume: ['1000000', '1210000', '1221100', '1222211', '1221100', '1210000', '1000000'],
    restart: ['0011101', '0100011', '1000111', '1000000', '1000001', '0100010', '0011100'],
    title: ['0001000', '0012100', '0122210', '1111111', '0120210', '0120210', '0111110'],
    controls: ['0000000', '0111110', '1121211', '1000101', '1121211', '1111111', '0110110'],
    back: ['0001000', '0011000', '0122222', '1111111', '0122222', '0011000', '0001000'],
    reset: ['0011101', '0100011', '1000111', '1000000', '1000001', '0100010', '0011100'],
    yes: ['0000001', '0000011', '0000110', '1001100', '1111000', '0110000', '0000000'],
    no: ['1100011', '1110111', '0111110', '0011100', '0111110', '1110111', '1100011']
  };
  // pointing glove 10x7, tip right (o outline, W white, b knuckle, s shade)
  var GLOVE = ['.oooo.....', 'oWWWWboooo', 'oWWWWWWWWo', 'oWWWWboooo', 'oWWWWo....', 'osWWso....', '.oooo.....'];

  /* ---------- panel colour ramps: fill top..bottom (4), highlight, shade ---------- */
  var RAMPS = {
    royal: ['#3a5cc8', '#2e4cae', '#243e92', '#1b3076', '#a8c4ff', '#0a1238'],
    night: ['#2c3670', '#252e60', '#1f2752', '#192044', '#9aa6e0', '#090c22'],
    ember: ['#8a3a2a', '#763024', '#62281e', '#4e2018', '#f0b088', '#1e0a08'],
    moss: ['#3a6a3e', '#305a34', '#284c2c', '#203e24', '#b4e0a0', '#0a1a0c'],
    slate: ['#4c5470', '#424862', '#383d54', '#2e3246', '#c8cede', '#0c0e18'],
    contrast: ['#000000', '#000000', '#000000', '#000000', '#ffffff', '#000000']
  };
  var DEF_COLORS = { logo: ['#ffe890', '#ff9a4a'], logoMid: null, accent: '#ffe070', accent2: '#e8b040', text: '#ffffff', text2: '#c8d4ff',
    dim: '#7c86ac', ink: '#0b0814', edge: '#06061a', panel: 'royal', cover: '#0b0814' };

  /* ---------- options ---------- */
  var OPTION_SCHEMA = [
    { h: 'AUDIO' },
    { key: 'master', label: 'MASTER VOLUME', type: 'slider', min: 0, max: 10, def: 8 },
    { key: 'music', label: 'MUSIC', type: 'slider', min: 0, max: 10, def: 7 },
    { key: 'sfx', label: 'SOUND EFFECTS', type: 'slider', min: 0, max: 10, def: 8 },
    { h: 'GAME' },
    { key: 'textSpeed', label: 'TEXT SPEED', type: 'choice', choices: ['slow', 'normal', 'fast', 'instant'], def: 'normal' },
    { h: 'ACCESSIBILITY' },
    { key: 'shake', label: 'SCREEN SHAKE', type: 'toggle', def: true },
    { key: 'flashes', label: 'FLASHING', type: 'choice', choices: ['full', 'reduced'], def: 'full' },
    { key: 'reduceMotion', label: 'REDUCE MOTION', type: 'toggle', def: false },
    { key: 'largeText', label: 'LARGE TEXT', type: 'toggle', def: false },
    { key: 'contrast', label: 'HIGH CONTRAST', type: 'toggle', def: false }
  ];
  var DEFAULTS = { unit: 'host', theme: 'auto', transition: 'diamond', transMs: 320, quit: 'on', pauseButton: 'auto', hints: 'on', minUnit: 2,
    confirmKey: 'Z', backKey: 'X', pauseLabel: 'P', startLabel: 'auto', version: '', seed: 1, storage: 'local' };
  var LABELS = { 'continue': 'CONTINUE', 'new': 'NEW GAME', options: 'OPTIONS', quit: 'QUIT', resume: 'RESUME', restart: 'RESTART',
    title: 'QUIT TO TITLE', controls: 'CONTROLS', reset: 'RESET DEFAULTS', back: 'BACK', yes: 'YES', no: 'NO', paused: 'PAUSED' };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hsh(a, b) { var n = Math.imul(a | 0, 73856093) ^ Math.imul((b | 0) + 7, 19349663); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t) * (1 - t); }
  function easeBack(t) { t = clamp(t, 0, 1); var c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function hit(r, x, y) { return r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }
  function inter(a, b, m) { m = m || 0; return a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m; }
  function mixHex(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t),
      g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t), bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  function urlSkip() {
    try {
      var q = new URLSearchParams(root.location ? root.location.search : '');
      if (q.get('title') === '1') return false;
      return q.get('auto') === '1' || q.has('t') || q.get('freeze') === '1' || q.get('title') === '0';
    } catch (e) { return false; }
  }

  /* ---------- glyph atlas cache (per colour pair + shadow) ---------- */
  var ATLAS = {}, ORDER = Object.keys(GLYPH);
  function atlas(c1, c2, sh) {
    var key = c1 + c2 + sh; if (ATLAS[key]) return ATLAS[key];
    if (typeof document === 'undefined') return null;
    var cv = document.createElement('canvas'), cw = 7, ch = 8; cv.width = ORDER.length * cw; cv.height = ch;
    var g = cv.getContext('2d'), pos = {};
    ORDER.forEach(function (k, i) {
      var rows = GROWS[k], ox = i * cw; pos[k] = ox;
      for (var pass = sh ? 0 : 1; pass < 2; pass++) for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < rows[ry].length; rx++) if (rows[ry][rx] === '1') {
        g.fillStyle = pass ? (ry < 4 ? c1 : c2) : sh; g.fillRect(ox + rx + (pass ? 0 : 1), ry + (pass ? 0 : 1), 1, 1);
      }
    });
    return (ATLAS[key] = { cv: cv, pos: pos });
  }

  function create(opt) {
    opt = opt || {};
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    for (k in (opt.params || {})) if (opt.params[k] != null && opt.params[k] !== '') P[k] = opt.params[k];
    var COL = {}; for (k in DEF_COLORS) COL[k] = DEF_COLORS[k]; for (k in (opt.colors || {})) if (opt.colors[k] != null) COL[k] = opt.colors[k];
    // optional skin (skins/skin-api.js): window ramp and text colours from its palette tokens; the drawing stays the built-in pixel look
    try {
      var SK = opt.skin && root.GameDNA_Skin && root.GameDNA_Skin.resolve ? root.GameDNA_Skin.resolve(opt.skin) : null, hex = function (v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null; };
      if (SK && SK.palette) {
        var pu = SK.palette.ui || {}, pt = SK.palette.text || {}, oc = opt.colors || {};
        if (hex(pu.fill) && !oc.panel) { var f1 = hex(pu.fill), f2 = hex(pu.fillTo) || mixHex(f1, '#000000', 0.3); COL.panel = [f1, mixHex(f1, f2, 0.33), mixHex(f1, f2, 0.66), f2, hex(pu.highlight) || mixHex(f1, '#ffffff', 0.6), hex(pu.shadow) || mixHex(f2, '#000000', 0.6)]; }
        if (hex(pt.main) && !oc.text) { COL.text = hex(pt.main); COL.text2 = hex(pt.main2) || mixHex(COL.text, '#8890c0', 0.25); }
        if ((hex(pt.select) || hex(pt.accent)) && !oc.accent) { COL.accent = hex(pt.select) || hex(pt.accent); COL.accent2 = mixHex(COL.accent, '#000000', 0.2); }
        if (hex(pt.dim) && !oc.dim) COL.dim = hex(pt.dim);
        if ((hex(pu.edge) || hex(SK.palette.ink)) && !oc.edge) COL.edge = hex(pu.edge) || hex(SK.palette.ink);
      }
    } catch (e) { }
    var LAB = {}; for (k in LABELS) LAB[k] = LABELS[k]; for (k in (opt.labels || {})) LAB[k] = String(opt.labels[k]).toUpperCase();
    var skip = opt.skip === true || (opt.skip !== false && urlSkip());
    var canvas = opt.canvas || null;
    var S = { mode: 'off', stack: [], clock: 0, starts: 0, titleOpens: 0, wasTitle: false, trans: null, ghost: null, intro: 0, introOn: false,
      logoPhase: 0, logoV: 0, cur: 0, curV: 0, curScreen: null, flash: null, pauseT: 0, booted: false, farewellT: 0, lastVia: 'script' };
    var queue = [], events = [], drawn = [], warnings = [], errors = 0;
    var STATS = { updates: 0, draws: 0, consumedKeys: 0, consumedPointers: 0, passedKeys: 0, leaks: 0 };
    var view = { W: 256, H: 224, u: 1, cssW: 256, cssH: 224, left: 0, top: 0, dpr: 1, ok: false };
    var overlay = null, octx = null, listeners = [], drag = null, hover = null, downRow = null, lastPointerType = 'mouse', touchSeen = false;

    /* ----- options: schema, values, storage ----- */
    var schema = OPTION_SCHEMA.slice();
    if (opt.optionRows) { var keep = opt.optionRows; schema = schema.filter(function (r) { return !r.key || keep.indexOf(r.key) >= 0; });
      schema = schema.filter(function (r, i) { if (!r.h) return true; var nx = schema[i + 1]; return nx && !nx.h; }); }
    (opt.extraOptions || []).forEach(function (r) { if (r && r.key) schema.push({ key: r.key, label: String(r.label || r.key).toUpperCase(), type: r.type || 'toggle', min: r.min != null ? r.min : 0, max: r.max != null ? r.max : 10, choices: r.choices, def: r.def != null ? r.def : r['default'] }); });
    var values = {}; schema.forEach(function (r) { if (r.key) values[r.key] = r.def; });
    var storeKey = 'gamedna-title-menu:' + String(opt.storageKey || opt.title || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    var memStore = null, storedIn = 'none';
    function validate(r, v) {
      if (r.type === 'slider') { v = Math.round(+v); return isFinite(v) ? clamp(v, r.min, r.max) : r.def; }
      if (r.type === 'toggle') return v === true || v === false ? v : r.def;
      if (r.type === 'choice') return r.choices && r.choices.indexOf(v) >= 0 ? v : r.def;
      return r.def;
    }
    function loadValues() {
      if (skip || P.storage === 'off') return;
      var raw = null;
      try { raw = P.storage === 'memory' ? memStore : root.localStorage.getItem(storeKey); storedIn = P.storage === 'memory' ? 'memory' : 'local'; }
      catch (e) { raw = memStore; storedIn = 'memory'; note('storage', String(e && e.name || e)); }
      if (!raw) return;
      var data = null; try { data = JSON.parse(raw); } catch (e) { warn('stored options unreadable, defaults used'); return; }
      if (!data || typeof data !== 'object') return;
      schema.forEach(function (r) { if (r.key && Object.prototype.hasOwnProperty.call(data, r.key)) values[r.key] = validate(r, data[r.key]); });
    }
    function saveValues() {
      if (skip || P.storage === 'off') return;
      var raw = JSON.stringify(values);
      if (P.storage === 'memory') { memStore = raw; storedIn = 'memory'; return; }
      try { root.localStorage.setItem(storeKey, raw); storedIn = 'local'; } catch (e) { memStore = raw; storedIn = 'memory'; note('storage', String(e && e.name || e)); }
    }
    function warn(m) { if (warnings.length < 20) warnings.push(m); try { if (root.console) console.warn('[title-menu] ' + m); } catch (e) { } }
    function note(ev, info) { if (events.length > 400) events.splice(0, 100); var e = { t: Math.round(S.clock), ev: ev, via: S.lastVia }; if (info != null) e.id = info; events.push(e); if (opt.debug) safe(opt.debug, e); }
    function safe(fn) { if (typeof fn !== 'function') return undefined; try { return fn.apply(null, Array.prototype.slice.call(arguments, 1)); } catch (e) { errors++; warn('callback threw: ' + (e && e.message || e)); return undefined; } }
    function sound(name) { if (opt.onSound) safe(opt.onSound, name, values); }
    loadValues();
    S.tagH = 0;

    /* ----- screens and rows ----- */
    function isTitleNow() { return typeof opt.isTitle === 'function' ? !!safe(opt.isTitle) : null; }
    function canPauseNow() {
      if (skip || S.mode !== 'off' || (S.trans && S.trans.phase === 'out')) return false;
      if (typeof opt.canPause === 'function') return !!safe(opt.canPause);
      var t = isTitleNow(); return t === null ? S.starts > 0 : !t;
    }
    function rowsFor(id) {
      var R = [];
      function btn(rid, extra) { var r = { id: rid, kind: 'button', label: LAB[rid] || rid.toUpperCase(), icon: rid, enabled: true }; for (var q in (extra || {})) r[q] = extra[q]; R.push(r); }
      if (id === 'main') {
        var cc = typeof opt.canContinue === 'function' ? !!safe(opt.canContinue) : false;
        btn('continue', { enabled: cc }); btn('new'); btn('options'); if (P.quit !== 'off') btn('quit');
      } else if (id === 'pause') {
        btn('resume'); btn('options'); if (typeof opt.onRestart === 'function') btn('restart'); btn('title');
      } else if (id === 'options') {
        schema.forEach(function (r) {
          if (r.h) R.push({ id: 'h-' + r.h, kind: 'header', label: r.h, enabled: false });
          else R.push({ id: r.key, kind: r.type, label: r.label, key: r.key, min: r.min, max: r.max, choices: r.choices, enabled: true });
        });
        if (opt.controls && opt.controls.length) btn('controls');
        btn('reset'); btn('back');
      } else if (id === 'controls') {
        (opt.controls || []).forEach(function (c, i) { R.push({ id: 'c' + i, kind: 'info', label: String(c[0]).toUpperCase(), value: String(c[1]).toUpperCase(), enabled: false }); });
        btn('back');
      } else if (id === 'confirmQuit' || id === 'confirmTitle' || id === 'confirmRestart' || id === 'confirmReset') {
        btn('no'); btn('yes');
      }
      return R;
    }
    var MSG = { confirmQuit: 'QUIT THE GAME?', confirmTitle: 'RETURN TO THE TITLE?', confirmRestart: 'RESTART FROM THE START?', confirmReset: 'RESET ALL OPTIONS?' };
    var HEAD = { options: 'OPTIONS', controls: 'CONTROLS', pause: null, main: null };
    function top() { return S.stack[S.stack.length - 1] || null; }
    function selectable(r) { return r && r.enabled && r.kind !== 'header' && r.kind !== 'info'; }
    function firstSel(rows, pref) {
      if (pref != null) for (var i = 0; i < rows.length; i++) if (rows[i].id === pref && selectable(rows[i])) return i;
      for (var j = 0; j < rows.length; j++) if (selectable(rows[j])) return j;
      return 0;
    }
    function push(id, pref) {
      var rows = rowsFor(id), sc = { id: id, sel: firstSel(rows, pref), scroll: 0, t: 0 };
      S.stack.push(sc); S.cur = sc.sel; S.curV = 0; S.curScreen = id; note('screen', id);
    }
    function pop() {
      if (S.stack.length <= 1) return false;
      S.stack.pop(); var t = top(); S.cur = t.sel; S.curV = 0; S.curScreen = t.id; t.t = Math.max(t.t, 400); note('screen', t.id); return true;
    }
    function openTitle(stage) {
      S.mode = 'title'; S.stack = []; S.titleOpens++; S.farewellT = 0;
      if (stage === 'press') { S.stack.push({ id: 'press', sel: 0, scroll: 0, t: 0 }); S.logoPhase = 0; S.logoV = 0; if (S.titleOpens === 1) { S.intro = 0; S.introOn = true; } }
      else { push('main', 'continue'); S.logoPhase = 1; S.logoV = 0; S.intro = 0; S.introOn = true; S.introShort = true; }
      if (stage === 'press') S.introShort = false;
      S.curScreen = top().id; note('title', stage);
    }
    function openPause() { if (S.mode !== 'off') return; S.mode = 'pause'; S.stack = []; push('pause'); S.pauseT = 0; sound('open'); note('pause'); }
    function resume() { if (S.mode !== 'pause') return; S.ghost = { id: 'pause', t: 0 }; S.mode = 'off'; S.stack = []; sound('close'); note('resume'); }
    function cover(action, kind) { S.trans = { phase: 'out', t: 0, dur: Math.max(60, +P.transMs || 320), action: action, kind: kind }; }
    function startGame(kind) {
      sound('start'); note('choose', kind);
      cover(function () {
        S.mode = 'off'; S.stack = []; S.starts++; S.wasTitle = true; note('start', kind);
        if (typeof opt.onStart === 'function') safe(opt.onStart, kind); else warn('onStart missing: nothing started the game');
      }, 'start');
    }
    function toTitle() {
      cover(function () {
        S.mode = 'off'; S.stack = []; note('quitToTitle');
        safe(opt.onQuitToTitle);
        var it = isTitleNow();
        if (it === null || it) { openTitle('main'); S.wasTitle = true; S.introOn = false; }
      }, 'title');
    }
    function restart() { cover(function () { S.mode = 'off'; S.stack = []; note('restart'); safe(opt.onRestart); }, 'restart'); }
    function setValue(key, v, via) {
      var r = null; for (var i = 0; i < schema.length; i++) if (schema[i].key === key) r = schema[i];
      if (!r) return false;
      v = validate(r, v); if (values[key] === v) return false;
      values[key] = v; saveValues(); note('option', key + '=' + v);
      if (opt.onOption) safe(opt.onOption, key, v, getAll());
      return true;
    }
    function getAll() { var o = {}; for (var q in values) o[q] = values[q]; return o; }
    function adjust(row, dir) {
      if (!row || !row.key) return false;
      var v = values[row.key], ch = false;
      if (row.kind === 'slider') ch = setValue(row.key, v + dir);
      else if (row.kind === 'toggle') ch = setValue(row.key, !v);
      else if (row.kind === 'choice') { var c = row.choices, i = c.indexOf(v); ch = setValue(row.key, c[(i + dir + c.length) % c.length]); }
      if (ch) sound(row.kind === 'slider' ? 'tick' : 'move');
      return ch;
    }
    function activate(row) {
      if (!selectable(row)) { if (row && row.kind === 'button') sound('denied'); return; }
      var sc = top(); if (sc) S.flash = { screen: sc.id, row: sc.sel, t: 0 };
      note('activate', row.id);
      switch (row.id) {
        case 'continue': startGame('continue'); return;
        case 'new': startGame('new'); return;
        case 'options': sound('confirm'); push('options'); return;
        case 'controls': sound('confirm'); push('controls'); return;
        case 'quit': sound('confirm'); push('confirmQuit'); return;
        case 'reset': sound('confirm'); push('confirmReset'); return;
        case 'resume': resume(); return;
        case 'restart': sound('confirm'); push('confirmRestart'); return;
        case 'title': sound('confirm'); push('confirmTitle'); return;
        case 'back': sound('back'); pop(); return;
        case 'no': sound('back'); pop(); return;
        case 'yes': {
          var id = sc.id; sound('confirm');
          if (id === 'confirmQuit') { if (typeof opt.onQuit === 'function') { pop(); safe(opt.onQuit); } else { S.stack = [{ id: 'farewell', sel: 0, scroll: 0, t: 0 }]; S.farewellT = 0; note('farewell'); } }
          else if (id === 'confirmTitle') toTitle();
          else if (id === 'confirmRestart') restart();
          else if (id === 'confirmReset') { schema.forEach(function (r) { if (r.key) setValue(r.key, r.def); }); pop(); }
          return;
        }
      }
      if (row.key) adjust(row, 1);
    }
    function back() {
      var sc = top(); if (!sc) return;
      if (sc.id === 'press') return;
      if (sc.id === 'farewell') { S.stack = [{ id: 'press', sel: 0, scroll: 0, t: 0 }]; S.logoPhase = 0; return; }
      if (sc.id === 'pause') { resume(); return; }
      if (sc.id === 'main') { sound('back'); S.stack = [{ id: 'press', sel: 0, scroll: 0, t: 0 }]; S.curScreen = 'press'; note('screen', 'press'); return; }
      sound('back'); pop();
    }
    function move(dir) {
      var sc = top(); if (!sc) return; var rows = rowsFor(sc.id), n = rows.length, i = sc.sel;
      for (var s = 0; s < n; s++) { i = (i + dir + n) % n; if (selectable(rows[i])) break; }
      if (i !== sc.sel && selectable(rows[i])) { sc.sel = i; sound('move'); note('select', rows[i].id); }
      // keep a header visible above the first row of its group
      ensureVisible(sc, rows);
    }
    function ensureVisible(sc, rows) {
      var L = listLayout(sc, rows); if (!L) return;
      var vis = L.visible, s = sc.scroll, sel = sc.sel;
      if (sel === firstSel(rows)) s = 0;
      if (sel < s) s = sel; if (sel > s + vis - 1) s = sel - vis + 1;
      if (sel - 1 >= 0 && rows[sel - 1].kind === 'header' && sel - 1 < s) s = sel - 1;
      sc.scroll = clamp(s, 0, Math.max(0, rows.length - vis));
    }

    /* ----- input ----- */
    var KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
      Enter: 'confirm', ' ': 'confirm', z: 'confirm', Z: 'confirm', x: 'back', X: 'back', Escape: 'back', Backspace: 'back' };
    var pauseKeys = (opt.pauseKeys || ['Escape', 'p', 'P']).map(String);
    function press(action, via) { if (skip) return false; queue.push({ type: 'key', a: action, via: via || 'script' }); return true; }
    function onKey(e) {
      if (skip) return;
      var busyNow = isBusy(), a = KEYMAP[e.key];
      var isPauseKey = pauseKeys.indexOf(e.key) >= 0 || pauseKeys.indexOf(e.code) >= 0;
      if (busyNow) {
        if (S.mode === 'pause' && isPauseKey && e.key !== 'Escape') a = 'pause';
        if (S.trans && S.trans.phase === 'out') a = null;
        if (a && (!e.repeat || a === 'up' || a === 'down' || a === 'left' || a === 'right')) queue.push({ type: 'key', a: a, via: 'key' });
        else if (!a && top() && top().id === 'press' && !e.repeat && e.key && e.key.length === 1) queue.push({ type: 'key', a: 'confirm', via: 'key' });
        e.preventDefault(); e.stopImmediatePropagation(); STATS.consumedKeys++; return;
      }
      if (isPauseKey && !e.repeat && canPauseNow()) { queue.push({ type: 'key', a: 'pause', via: 'key' }); e.preventDefault(); e.stopImmediatePropagation(); STATS.consumedKeys++; return; }
      STATS.passedKeys++;
    }
    function toUI(e) {
      measure();
      return { x: (e.clientX - view.left) / view.u, y: (e.clientY - view.top) / view.u, inside: e.clientX >= view.left && e.clientY >= view.top && e.clientX < view.left + view.cssW && e.clientY < view.top + view.cssH };
    }
    function onPointer(e) {
      if (skip) return;
      var p = toUI(e), busyNow = isBusy(), type = e.type;
      if (e.pointerType) lastPointerType = e.pointerType;
      if (e.pointerType === 'touch' || e.pointerType === 'pen') touchSeen = true;
      var via = e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'mouse';
      if (!busyNow) {
        if (type === 'pointerdown' && p.inside && canPauseNow() && pauseBtnShown()) {
          var b = pauseRect(); if (b && hit({ x: b.x - 2, y: b.y - 2, w: b.w + 4, h: b.h + 4 }, p.x, p.y)) { queue.push({ type: 'key', a: 'pause', via: via }); e.preventDefault(); e.stopImmediatePropagation(); STATS.consumedPointers++; }
        }
        return;
      }
      if (!p.inside && type === 'pointerdown') return;
      queue.push({ type: type, x: p.x, y: p.y, via: via, mouse: e.pointerType === 'mouse' || !e.pointerType });
      if (type !== 'pointermove') { e.preventDefault(); e.stopImmediatePropagation(); STATS.consumedPointers++; }
    }
    function onWheel(e) { if (skip || !isBusy()) return; queue.push({ type: 'wheel', dy: e.deltaY, via: 'mouse' }); e.preventDefault(); e.stopImmediatePropagation(); }
    function listen() {
      if (skip || typeof root.addEventListener !== 'function' || listeners.length) return;
      var add = function (tgt, ev, fn, o) { tgt.addEventListener(ev, fn, o); listeners.push([tgt, ev, fn, o]); };
      add(root, 'keydown', onKey, true);
      ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach(function (ev) { add(root, ev, onPointer, true); });
      // a click / touchstart / mousedown after a consumed pointerdown must not reach the game either
      ['click', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach(function (ev) { add(root, ev, function (e) { if (isBusy() && canvas && e.target === canvas) { e.stopImmediatePropagation(); if (ev !== 'touchstart' && ev !== 'touchend') e.preventDefault(); } }, { capture: true, passive: false }); });
      add(root, 'wheel', onWheel, { capture: true, passive: false });
    }
    function rowAt(L, x, y) {
      if (!L || !L.panel) return null;
      for (var i = 0; i < L.rows.length; i++) { var r = L.rows[i]; if (r.rect && hit(r.rect, x, y)) return r; }
      return null;
    }
    function handle(ev) {
      S.lastVia = ev.via || 'script';
      var sc = top();
      if (ev.type === 'key') {
        var a = ev.a;
        if (a === 'pause') { if (S.mode === 'off' && canPauseNow()) openPause(); else if (S.mode === 'pause' && sc && sc.id === 'pause') resume(); return; }
        if (S.mode === 'off' || !sc) return;
        if (sc.id === 'press') { if (a === 'confirm') { sound('confirm'); S.stack = []; push('main', 'continue'); S.introOn = false; note('pressStart'); } return; }
        if (sc.id === 'farewell') { if (a === 'confirm' || a === 'back') back(); return; }
        var rows = rowsFor(sc.id), row = rows[sc.sel];
        if (a === 'up') move(-1); else if (a === 'down') move(1);
        else if (a === 'left' || a === 'right') { if (row && row.key) adjust(row, a === 'left' ? -1 : 1); else if (/^confirm/.test(sc.id)) move(a === 'left' ? -1 : 1); }
        else if (a === 'confirm') activate(row);
        else if (a === 'back') back();
        return;
      }
      if (S.mode === 'off' || !sc) return;
      if (ev.type === 'wheel') { if (sc.id === 'options' || sc.id === 'controls') { var rw = rowsFor(sc.id), Lw = listLayout(sc, rw); if (Lw) sc.scroll = clamp(sc.scroll + (ev.dy > 0 ? 1 : -1), 0, Math.max(0, rw.length - Lw.visible)); } return; }
      var L = layout();
      if (ev.type === 'pointerdown') {
        if (sc.id === 'press') { sound('confirm'); S.stack = []; push('main', 'continue'); S.introOn = false; note('pressStart'); return; }
        if (sc.id === 'farewell') { back(); return; }
        if (L.scrollUp && hit(L.scrollUp, ev.x, ev.y)) { sc.scroll = Math.max(0, sc.scroll - 1); sound('move'); return; }
        if (L.scrollDown && hit(L.scrollDown, ev.x, ev.y)) { sc.scroll = Math.min(L.maxScroll, sc.scroll + 1); sound('move'); return; }
        var r = rowAt(L, ev.x, ev.y);
        if (!r) { downRow = null; return; }
        if (selectable(r.row) && sc.sel !== r.i) { sc.sel = r.i; note('select', r.row.id); }
        downRow = r.i;
        if (r.row.kind === 'slider' && r.track) {
          drag = { i: r.i, track: r.track }; setFromTrack(r.row, r.track, ev.x);
        } else if (r.row.kind === 'choice' && r.left && hit(r.left, ev.x, ev.y)) { adjust(r.row, -1); downRow = null; }
        else if (r.row.kind === 'choice' && r.right && hit(r.right, ev.x, ev.y)) { adjust(r.row, 1); downRow = null; }
        return;
      }
      if (ev.type === 'pointermove') {
        if (drag) { var rr = rowsFor(sc.id)[drag.i]; if (rr) setFromTrack(rr, drag.track, ev.x); return; }
        if (!ev.mouse) return;
        var h = rowAt(L, ev.x, ev.y);
        if (h && selectable(h.row) && h.i !== sc.sel) { sc.sel = h.i; sound('move'); note('select', h.row.id); }
        return;
      }
      if (ev.type === 'pointerup' || ev.type === 'pointercancel') {
        var wasDrag = drag; drag = null;
        if (ev.type === 'pointercancel' || wasDrag) { downRow = null; return; }
        var u = rowAt(L, ev.x, ev.y);
        if (u && u.i === downRow && selectable(u.row) && u.row.kind !== 'slider') { sc.sel = u.i; activate(u.row); }
        downRow = null;
      }
    }
    function setFromTrack(row, tr, x) { var f = clamp((x - tr.x) / Math.max(1, tr.w - 1), 0, 1); if (setValue(row.key, Math.round(row.min + f * (row.max - row.min)))) sound('tick'); }

    /* ----- clock ----- */
    function isBusy() { return !skip && (S.mode !== 'off' || !!(S.trans && S.trans.phase === 'out')); }
    function spring(x, v, target, k, c, dt) { v += ((target - x) * k - v * c) * dt; x += v * dt; return [x, v]; }
    function update(dt) {
      if (skip) return;
      STATS.updates++;
      dt = +dt; if (!(dt > 0)) dt = STEP; if (dt > 100) dt = 100;
      if (!S.booted && isTitleNow() === null) { S.booted = true; var it0 = isTitleNow(); if (it0 === null || it0) { openTitle('press'); S.wasTitle = true; } }
      // title scene edges (the game went to / left its title by itself)
      var it = isTitleNow();
      if (it !== null && !(S.trans && S.trans.phase === 'out')) {
        if (it && !S.wasTitle && S.mode === 'off') openTitle(S.titleOpens === 0 ? 'press' : 'main');
        else if (!it && S.mode === 'title') { S.mode = 'off'; S.stack = []; note('titleLeft'); }
        S.wasTitle = it;
      }
      while (queue.length) handle(queue.shift());
      var mode = S.mode;
      S.clock += dt;
      var reduced = !!values.reduceMotion;
      var n = Math.max(1, Math.round(dt / STEP)), sdt = dt / n / 1000;
      for (var i = 0; i < n; i++) {
        var lp = top() && top().id === 'press' ? 0 : 1, a = spring(S.logoPhase, S.logoV, lp, 120, 16, sdt); S.logoPhase = a[0]; S.logoV = a[1];
        var sc = top(); if (sc) { var b = spring(S.cur, S.curV, sc.sel, 420, 30, sdt); S.cur = b[0]; S.curV = b[1]; }
      }
      if (reduced) { S.logoPhase = top() && top().id === 'press' ? 0 : 1; S.logoV = 0; if (top()) S.cur = top().sel; }
      if (S.curScreen !== (top() && top().id)) { S.curScreen = top() && top().id; if (top()) S.cur = top().sel; }
      S.stack.forEach(function (s) { s.t += dt; });
      if (S.introOn) { S.intro += dt; if (S.intro > 2400) S.introOn = false; }
      if (S.flash) { S.flash.t += dt; if (S.flash.t > 180) S.flash = null; }
      if (S.ghost) { S.ghost.t += dt; if (S.ghost.t > 160) S.ghost = null; }
      if (mode === 'pause') S.pauseT += dt;
      var fw = top(); if (fw && fw.id === 'farewell') { S.farewellT += dt; if (S.farewellT > 2600) back(); }
      if (S.trans) {
        S.trans.t += dt;
        if (S.trans.phase === 'out' && S.trans.t >= S.trans.dur) { var act = S.trans.action; S.trans = { phase: 'in', t: 0, dur: S.trans.dur, kind: S.trans.kind }; act(); }
        else if (S.trans.phase === 'in' && S.trans.t >= S.trans.dur) S.trans = null;
      }
    }

    /* ----- view / overlay ----- */
    function measure() {
      if (!canvas || !canvas.getBoundingClientRect) { view.ok = false; return view; }
      var r = canvas.getBoundingClientRect(), cssW = r.width || canvas.width || 256, cssH = r.height || canvas.height || 224;
      var dpr = root.devicePixelRatio || 1, nW = canvas.width || cssW, nH = canvas.height || cssH;
      view.cssW = cssW; view.cssH = cssH; view.left = r.left; view.top = r.top; view.dpr = dpr; view.ok = true;
      if (P.unit === 'readable') {   // v1.0 behaviour: UI pixels of >= minUnit CSS px whatever the game's pixel size
        var u = Math.floor(cssW / nW + 1e-6), minU = Math.max(1, +P.minUnit || 2); if (u < minU) u = minU;
        if (values.largeText) u += 1;
        while (u > minU && (cssW / u < 128 || cssH / u < 90)) u--;
        view.u = u; view.W = Math.floor(cssW / u); view.H = Math.floor(cssH / u); view.k = 0;
      } else {                       // 'host' (v1.1 default): one UI pixel = k of the game's own pixels, so the menu shares the game's pixel grid
        var k = Math.max(1, Math.floor(nW / 320 + 1e-6));
        if (values.largeText && nW / (k + 1) >= 128 && nH / (k + 1) >= 90) k += 1;
        view.k = k; view.W = Math.floor(nW / k); view.H = Math.floor(nH / k); view.u = cssW / view.W;
      }
      view.sx = (canvas.width || cssW) / cssW; // css px -> native px
      return view;
    }
    function theme() {
      if (P.theme === 'pixel' || P.theme === 'hd') return P.theme;
      if (!canvas) return 'pixel';
      var ir = ''; try { ir = root.getComputedStyle ? getComputedStyle(canvas).imageRendering || '' : ''; } catch (e) { }
      return canvas.width <= 480 || /pixel|crisp/.test(ir) ? 'pixel' : 'hd';
    }
    function ensureOverlay() {
      if (overlay || typeof document === 'undefined' || !canvas) return overlay;
      overlay = document.createElement('canvas'); overlay.setAttribute('data-gamedna', 'title-menu'); overlay.setAttribute('aria-hidden', 'true');
      var st = overlay.style; st.position = 'absolute'; st.pointerEvents = 'none'; st.zIndex = '2147483000'; st.left = '0px'; st.top = '0px'; st.margin = '0'; st.padding = '0'; st.border = '0';
      (document.body || document.documentElement).appendChild(overlay); octx = overlay.getContext('2d');
      return overlay;
    }

    /* ----- layout (pure function of view + state) ----- */
    var M = { rowH: 12, pad: 6, fontH: 7 };
    function tw(s) { return pxMeasure(s); }
    function listLayout(sc, rows) { var L = layout(sc, rows); return L && L.list; }
    function pauseBtnShown() {
      if (P.pauseButton === 'off') return false;
      return P.pauseButton === 'on' || touchSeen;
    }
    function uiList(fn) {   // the game's native-px rects -> UI px
      var out = [], list = typeof fn === 'function' ? safe(fn) : null;
      if (list && list.length) list.forEach(function (r) { if (r && r.w > 0 && r.h > 0) out.push({ x: r.x / view.sx / view.u, y: r.y / view.sx / view.u, w: r.w / view.sx / view.u, h: r.h / view.sx / view.u }); });
      return out;
    }
    function clearOf(r, list, m) { for (var i = 0; i < list.length; i++) if (list[i] && inter(r, list[i], m || 0)) return false; return true; }
    function pauseRect() {
      measure(); var W = view.W, H = view.H, s = 13, m = 3, rects = uiList(opt.uiRects);
      var cands = [[W - s - m, m], [m, m], [W - s - m, H - s - m], [m, H - s - m]];
      for (var x = W - s - m - 16; x > m; x -= 16) cands.push([x, m]);
      for (var y = m + 16; y < H - s; y += 16) cands.push([W - s - m, y]);
      for (var i = 0; i < cands.length; i++) { var c = { x: cands[i][0], y: cands[i][1], w: s, h: s }, ok = true; for (var j = 0; j < rects.length; j++) if (inter(c, rects[j], 2)) { ok = false; break; } if (ok) return c; }
      return null;
    }
    function logoBlock(W, H, capH) {
      var text = String(opt.title || 'Untitled').toUpperCase(), words = text.split(' '), best = null;
      var maxH = Math.max(14, Math.floor(H * 0.34)); if (capH) maxH = Math.min(maxH, capH);
      function fit(lines) {
        var w = 0; lines.forEach(function (l) { w = Math.max(w, boldMeasure(l)); });
        var s = Math.min(6, Math.floor((W * 0.9) / Math.max(1, w)));
        while (s > 1 && lines.length * (7 * s + 3) > maxH) s--;
        return { lines: lines, s: Math.max(1, s), w: w * Math.max(1, s), h: lines.length * 7 * Math.max(1, s) + (lines.length - 1) * Math.max(2, Math.round(s * 1.2)) };
      }
      best = fit([text]);
      if (words.length > 1 && best.s < 4) {
        var bi = 1, bd = 1e9;
        for (var i = 1; i < words.length; i++) { var a = words.slice(0, i).join(' '), b = words.slice(i).join(' '), d = Math.abs(boldMeasure(a) - boldMeasure(b)); if (d < bd) { bd = d; bi = i; } }
        var two = fit([words.slice(0, bi).join(' '), words.slice(bi).join(' ')]);
        if (two.s > best.s) best = two;
      }
      return best;
    }
    function layout(scArg, rowsArg) {
      measure();
      var W = view.W, H = view.H, sc = scArg || top(), L = { W: W, H: H, rows: [], panel: null, list: null, logo: null, texts: [] };
      if (S.mode === 'off' || !sc) return L;
      var rows = rowsArg || rowsFor(sc.id), id = sc.id, rowH = M.rowH, pad = M.pad;
      var hintH = P.hints !== 'off' ? 10 : 0;
      if (S.mode === 'title' && (id === 'press' || id === 'main' || id === 'farewell')) {
        var mainRows = id === 'main' ? rows : rowsFor('main'), panelH = mainRows.length * rowH + pad * 2 + 2, obs = uiList(opt.obstacles);
        // a title cover band (the game's HUD area hidden on the title, e.g. an empty command panel) holds the menu; the logo sits above it
        var cov = uiList(opt.titleCover), bandTop = H;
        cov.forEach(function (r) { if (r.y >= H * 0.4 && r.w >= W * 0.6 && r.y < bandTop) bandTop = Math.floor(r.y); });
        var band = bandTop < H && H - bandTop >= panelH + 4;
        if (!band) bandTop = H;
        L.cover = cov;
        var lb = logoBlock(W, H, band ? Math.floor(bandTop * 0.62) : 0), ph = S.logoPhase;
        var tagLines = function (lbw) {
          if (!opt.tagline) return [];
          var maxW = Math.min(W - 8, Math.max(lbw + 16, 96)), words = String(opt.tagline).toUpperCase().split(' '), out = [], cur = '';
          for (var wi = 0; wi < words.length; wi++) { var t2 = cur ? cur + ' ' + words[wi] : words[wi]; if (tw(t2) <= maxW) cur = t2; else { if (cur) out.push(cur); cur = words[wi]; if (tw(cur) > maxW) return []; } }
          if (cur) out.push(cur);
          return out.length <= 2 ? out : [];
        };
        var tl = tagLines(lb.w), tagH = tl.length ? tl.length * 9 + 4 : 0, tagMain = tagH, yPress, yMain, menuY = null, pressY = null;
        if (band) {
          yPress = yMain = Math.max(2, Math.round((bandTop - lb.h - tagH) / 2));
          menuY = bandTop + Math.round((H - bandTop - panelH) / 2); pressY = bandTop + Math.round((H - bandTop - 7) / 2); hintH = 0;
        } else {
          yPress = Math.round(H * 0.36 - (lb.h + tagH) / 2);
          // small screens: the menu needs room under the logo; drop the tagline, then shrink the logo, then the hint line
          var avail = function () { return H - hintH - 4; }, total = lb.h + tagH + 8 + panelH;
          if (total > avail()) { tagMain = 0; total = lb.h + 8 + panelH; }
          if (total > avail()) { lb = logoBlock(W, H, Math.max(14, avail() - 8 - panelH)); tl = tagLines(lb.w); tagH = tl.length ? tl.length * 9 + 4 : 0; total = lb.h + 8 + panelH; yPress = Math.round(H * 0.36 - (lb.h + tagH) / 2); }
          if (total > avail()) { hintH = 0; }
          yMain = Math.max(2, Math.round((H - hintH - total) / 2));
          if (yMain + total > H - hintH - 2) yMain = Math.max(2, H - hintH - 2 - total);
        }
        var showTag = tl.length && (id !== 'main' || tagMain), blockH = lb.h + (showTag ? tagH : 0);
        var ly = Math.round(yPress + (yMain - yPress) * ph);
        // keep the logo block off the props / characters the game names, when a nearby height is clear
        var slide = function (x, w, h, y0, lo, hi) {
          if (!obs.length) return y0;
          for (var dy = 0; dy <= H; dy += 2) { var c2 = [y0 - dy, y0 + dy]; for (var ci = 0; ci < 2; ci++) { var yy = c2[ci]; if (yy < lo || yy > hi) continue; if (clearOf({ x: x, y: yy, w: w, h: h }, obs, 2)) return yy; } }
          return y0;
        };
        var lx = Math.round((W - lb.w) / 2);
        if (ph >= 0.999 || ph <= 0.001) ly = slide(lx, lb.w, blockH, ly, 2, (band ? bandTop : H - (id === 'main' ? panelH + 8 + hintH : 20)) - blockH);
        L.logo = { x: lx, y: ly, w: lb.w, h: lb.h, s: lb.s, lines: lb.lines };
        if (showTag) {
          var tw0 = 0; tl.forEach(function (t3) { tw0 = Math.max(tw0, tw(t3)); });
          L.tag = { lines: tl.map(function (t3, i) { return { text: t3, x: Math.round((W - tw(t3)) / 2), y: ly + lb.h + 5 + i * 9, w: tw(t3), h: 7 }; }), x: Math.round((W - tw0) / 2), y: ly + lb.h + 5, w: tw0, h: tl.length * 9 - 2 };
        }
        var below = ly + blockH;
        if (id === 'press' || id === 'farewell') {
          var pl = P.startLabel === 'auto' ? (touchSeen ? 'TAP TO START' : 'PRESS ' + String(P.confirmKey).toUpperCase() + ' OR ENTER') : String(P.startLabel).toUpperCase();
          if (id === 'farewell') pl = 'THANKS FOR PLAYING';
          if (tw(pl) > W - 8) pl = touchSeen ? 'TAP' : 'PRESS START';
          L.press = { text: pl, x: Math.round((W - tw(pl)) / 2), y: pressY != null ? pressY : Math.round(Math.max(below + 14, H * 0.7)), w: tw(pl), h: 7 };
          if (L.press.y + 9 > H - hintH) L.press.y = H - hintH - 9;
          var minY = pressY != null ? bandTop + 2 : below + 4, maxY = H - hintH - 9, y0 = L.press.y;
          if (obs.length) for (var dy2 = 0; dy2 < H; dy2 += 3) {
            var cand = [y0 + dy2, y0 - dy2], done = false;
            for (var cj = 0; cj < 2; cj++) { var yy2 = cand[cj]; if (yy2 < minY || yy2 > maxY) continue; if (clearOf({ x: L.press.x - 3, y: yy2 - 4, w: L.press.w + 6, h: 15 }, obs)) { L.press.y = yy2; done = true; break; } }
            if (done) break;
          }
        }
        if (id === 'main') {
          var pw = 0; mainRows.forEach(function (r) { pw = Math.max(pw, tw(r.label)); });
          pw = Math.max(92, pw + 12 + 12 + pad * 2 + 10);
          var px = Math.round((W - pw) / 2), py = menuY != null ? menuY : ly + lb.h + (showTag ? tagH : 0) + 8;
          if (obs.length && !clearOf({ x: px, y: py, w: pw, h: panelH }, obs, 2)) {
            var xs = [Math.round(W * 0.27 - pw / 2), Math.round(W * 0.73 - pw / 2), 4, W - pw - 4], placed = false;
            for (var xi = 0; xi < xs.length; xi++) { var xx = clamp(xs[xi], 3, W - pw - 3); if (clearOf({ x: xx, y: py, w: pw, h: panelH }, obs, 2)) { px = xx; placed = true; break; } }
            if (!placed) L.dimObstacles = true;   // no clear spot: the module keeps the characters readable (see render)
          }
          L.panel = { x: px, y: py, w: pw, h: panelH };
          placeRows(L, rows, sc, px, py + pad + 1, pw, rowH, 0, rows.length);
        }
        if (P.version) { var vs = String(P.version).toUpperCase(); L.version = { text: vs, x: W - tw(vs) - 3, y: H - 9, w: tw(vs), h: 7 }; if (L.panel && inter(L.version, L.panel, 3)) L.version = null; }
      } else {
        // a framed panel in the middle: pause root, options, controls, confirms
        var head = id === 'pause' ? null : HEAD[id] || null, msg = MSG[id] || null;
        var bigHead = id === 'pause' ? LAB.paused : null, bigS = 2, bigH = bigHead ? 7 * bigS + 6 : 0;
        if (bigHead && tw(bigHead) * bigS > W - 10) bigS = 1;
        var isList = id === 'options' || id === 'controls';
        var labelW = 0, ctlW = 0, sliderW = 44, btnW = 0;
        var measureRows = function () { labelW = 0; ctlW = 0; btnW = 0; rows.forEach(function (r) {
          if (r.kind === 'button' || r.kind === 'header') btnW = Math.max(btnW, tw(r.label) + (r.kind === 'button' ? 12 : 0)); else labelW = Math.max(labelW, tw(r.label));
          if (r.kind === 'slider') ctlW = Math.max(ctlW, sliderW + 4 + 11); else if (r.kind === 'choice') { var mx = 0; r.choices.forEach(function (c) { mx = Math.max(mx, tw(c)); }); ctlW = Math.max(ctlW, mx + 16); }
          else if (r.kind === 'toggle') ctlW = Math.max(ctlW, 11 + 4 + tw('OFF')); else if (r.kind === 'info') ctlW = Math.max(ctlW, tw(r.value));
        }); };
        measureRows();
        var cursorW = 12, wide = Math.max(cursorW + labelW + (ctlW ? 10 + ctlW : 0), cursorW + btnW) + pad * 2 + 2;
        if (ctlW > 0 && wide > W - 8) { sliderW = 30; measureRows(); wide = Math.max(cursorW + labelW + (ctlW ? 8 + ctlW : 0), cursorW + btnW) + pad * 2 + 2; }
        labelW = Math.max(labelW, btnW);
        // small screens: a scrolling list gets the hint line's room too
        if (isList && hintH && H < 150) hintH = 0;
        var stacked = ctlW > 0 && wide > W - 8;
        var pw2 = stacked ? Math.min(W - 6, Math.max(cursorW + labelW, cursorW + ctlW) + pad * 2 + 2) : Math.max(wide, msg ? tw(msg) + pad * 2 + 6 : 0, 100);
        pw2 = Math.min(pw2, W - 6);
        if (msg && tw(msg) + pad * 2 + 6 > pw2) msg = msg.replace('RETURN TO THE ', '').replace(' FROM THE START', '');
        var rH = stacked ? rowH + 9 : rowH;
        var headH = head ? 13 : 0, msgH = msg ? 14 : 0;
        var hud = uiList(opt.uiRects), bTop = 0, bBot = H - hintH;
        hud.forEach(function (r) { if (r.y + r.h <= H * 0.35) bTop = Math.max(bTop, Math.ceil(r.y + r.h) + 2); else if (r.y >= H * 0.6) bBot = Math.min(bBot, Math.floor(r.y) - 2); });
        if (bBot - bTop < 70) { bTop = 0; bBot = H - hintH; }   // no room between the HUD bars: use the whole screen (the menu is modal)
        var availH = bBot - bTop - 8 - bigH - headH - msgH - pad * 2 - 2;
        if (!isList && availH < rows.length * rH && hintH) { bBot += hintH; availH += hintH; hintH = 0; }            // a short menu never scrolls:
        if (!isList && availH < rows.length * rH && bigHead) { availH += bigH; bigHead = null; bigH = 0; }        // drop the hint, then the big heading
        if (!isList && availH < rows.length * rH) { availH += 6; }
        var visible = Math.max(2, Math.min(rows.length, Math.floor(availH / rH)));
        var scrolls = visible < rows.length;
        if (scrolls) visible = Math.max(2, Math.floor((availH - 6) / rH));
        var ph2 = headH + msgH + visible * rH + pad * 2 + 2 + (scrolls ? 6 : 0);
        var px2 = Math.round((W - pw2) / 2), py2 = Math.round((H - hintH - ph2 - bigH) / 2) + bigH;
        if (bBot - bTop >= ph2 + bigH) py2 = Math.round(bTop + (bBot - bTop - ph2 - bigH) / 2) + bigH;
        if (bigHead) L.big = { text: bigHead, s: bigS, x: Math.round((W - tw(bigHead) * bigS) / 2), y: py2 - bigH, w: tw(bigHead) * bigS, h: 7 * bigS };
        L.panel = { x: px2, y: py2, w: pw2, h: ph2 };
        if (head) L.head = { text: head, x: px2 + pad + 1, y: py2 + pad, w: tw(head), h: 7 };
        if (msg) L.msg = { text: msg, x: Math.round(px2 + (pw2 - tw(msg)) / 2), y: py2 + pad + headH + 2, w: tw(msg), h: 7 };
        var maxScroll = Math.max(0, rows.length - visible), scroll = clamp(sc.scroll, 0, maxScroll);
        var ly2 = py2 + pad + 1 + headH + msgH;
        L.list = { visible: visible, scroll: scroll, stacked: stacked, rowH: rH, ctlW: ctlW, sliderW: sliderW };
        L.maxScroll = maxScroll;
        if (scrolls) {
          if (scroll > 0) L.scrollUp = head ? { x: px2 + pw2 - pad - 12, y: py2 + pad, w: 12, h: 7 } : { x: px2 + pw2 / 2 - 6, y: ly2 - 7, w: 12, h: 6 };
          if (scroll < maxScroll) L.scrollDown = { x: px2 + pw2 / 2 - 6, y: ly2 + visible * rH, w: 12, h: 6 };
        }
        if (/^confirm/.test(id)) { // yes / no side by side
          var bw = Math.floor((pw2 - pad * 2 - 6) / 2), yy = ly2 + 2;
          rows.forEach(function (r, i) { var rx = px2 + pad + 1 + i * (bw + 4); L.rows.push({ i: i, row: r, rect: { x: rx, y: yy - 2, w: bw, h: rowH }, tx: rx + Math.round((bw - tw(r.label) - 10) / 2) + 10, ty: yy, icon: { x: rx + Math.round((bw - tw(r.label) - 10) / 2), y: yy } }); });
          L.panel.h = headH + msgH + rowH + pad * 2 + 6; L.list.inline = true;
        } else placeRows(L, rows, sc, px2, ly2, pw2, rH, scroll, visible, stacked);
      }
      if (P.hints !== 'off' && hintH) {
        var c = String(P.confirmKey).toUpperCase(), bk = String(P.backKey).toUpperCase(), hint;
        var sid = sc.id;
        if (sid === 'press' || sid === 'farewell') hint = null;
        else if (touchSeen) hint = 'TAP TO CHOOSE';
        else if (sid === 'options') hint = 'ARROWS: CHANGE  ' + c + ': OK  ' + bk + ': BACK';
        else hint = 'ARROWS: CHOOSE  ' + c + ': OK  ' + bk + ': BACK';
        if (hint && tw(hint) > W - 6) hint = c + ': OK  ' + bk + ': BACK';
        if (hint && tw(hint) > W - 6) hint = null;
        if (hint) {
          var hy = H - 9;
          if (L.panel && L.panel.y + L.panel.h > hy - 2) hint = null;
          if (hint && !clearOf({ x: 3, y: hy - 1, w: tw(hint) + 2, h: 9 }, uiList(opt.uiRects))) hint = null;
          if (hint) { L.hint = { text: hint, x: 4, y: hy, w: tw(hint), h: 7 }; if (L.version && L.version.x < L.hint.x + L.hint.w + 6) L.version = null; }
        }
      }
      return L;
    }
    function placeRows(L, rows, sc, px, py, pw, rH, scroll, visible, stacked) {
      var pad = M.pad, x0 = px + pad + 1, cw = 12;
      for (var k = 0; k < visible && scroll + k < rows.length; k++) {
        var i = scroll + k, r = rows[i], y = py + k * rH, rec = { i: i, row: r, rect: { x: px + 3, y: y - 2, w: pw - 6, h: rH } };
        if (r.kind === 'header') { rec.tx = x0; rec.ty = y + 1; rec.rect = null; rec.header = true; L.rows.push(rec); continue; }
        rec.tx = x0 + cw + (r.kind === 'button' ? 10 : 0); rec.ty = y;
        if (r.kind === 'button') rec.icon = { x: x0 + cw, y: y };
        var cy = stacked ? y + 9 : y, right = px + pw - pad - 1;
        if (r.kind === 'slider') { var sw = L.list ? L.list.sliderW : 44, tr = { x: right - 11 - 4 - sw, y: cy, w: sw, h: 7 }; if (stacked) tr.x = x0 + cw; rec.track = tr; rec.val = { x: tr.x + tr.w + 4, y: cy }; }
        if (r.kind === 'choice') { var cwid = L.list ? L.list.ctlW : 60, cx = stacked ? x0 + cw : right - cwid; rec.left = { x: cx - 1, y: cy - 2, w: 7, h: 11 }; rec.right = { x: cx + cwid - 6, y: cy - 2, w: 7, h: 11 }; rec.choice = { x: cx + 7, w: cwid - 14, y: cy }; }
        if (r.kind === 'toggle') { var tx = stacked ? x0 + cw : right - (11 + 4 + tw('OFF')); rec.toggle = { x: tx, y: cy + 1, w: 11, h: 5 }; rec.tlabel = { x: tx + 15, y: cy }; }
        if (r.kind === 'info') { rec.info = { x: stacked ? x0 + cw : right - tw(r.value), y: cy }; rec.rect = null; }
        L.rows.push(rec);
      }
    }

    /* ----- drawing (pixel theme; the hd theme reuses it at a finer unit) ----- */
    var ramp = function () { if (values.contrast) return RAMPS.contrast; var p = COL.panel; return Array.isArray(p) ? p : RAMPS[p] || RAMPS.royal; };
    function txtCols(kind) {
      var hc = !!values.contrast;
      if (kind === 'sel') return hc ? ['#ffff00', '#ffff00'] : [COL.accent, COL.accent2];
      if (kind === 'dim') return hc ? ['#b0b0b0', '#b0b0b0'] : [COL.dim, mixHex(COL.dim, '#000000', 0.15)];
      if (kind === 'head') return hc ? ['#ffffff', '#ffffff'] : [mixHex(COL.text2, COL.accent, 0.35), COL.text2];
      return hc ? ['#ffffff', '#ffffff'] : [COL.text, COL.text2];
    }
    function text(g, s, x, y, kind, rec, owner) {
      s = String(s).toUpperCase(); var c = txtCols(kind), A = atlas(c[0], c[1], values.contrast ? '#000000' : COL.edge), cx = Math.round(x), cy = Math.round(y);
      if (A) for (var i = 0; i < s.length; i++) { var ch = s[i]; if (ch !== ' ' && A.pos[ch] != null) g.drawImage(A.cv, A.pos[ch], 0, 7, 8, cx, cy, 7, 8); cx += gw(ch) + 1; }
      if (rec !== false) drawn.push({ kind: 'text', x: Math.round(x), y: Math.round(y), w: tw(s), h: 7, text: s, owner: owner || null });
    }
    function bigText(g, s, x, y, sc, cols, outline, bold) {
      s = String(s).toUpperCase(); var cx = Math.round(x);
      for (var i = 0; i < s.length; i++) {
        var rows = bold ? boldRows(s[i]) : GROWS[s[i]];
        if (rows) for (var pass = 0; pass < 3; pass++) for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < rows[ry].length; rx++) if (rows[ry][rx] === '1') {
          if (pass === 0) { g.fillStyle = outline; g.fillRect(cx + rx * sc - 1, y + ry * sc - 1, sc + 2, sc + 3); }
          else if (pass === 1) { g.fillStyle = outline; g.fillRect(cx + rx * sc, y + ry * sc + 1, sc, sc + 1); }
          else { g.fillStyle = cols[Math.min(cols.length - 1, Math.floor(ry * cols.length / 7))]; g.fillRect(cx + rx * sc, y + ry * sc, sc, sc); }
        }
        cx += (s[i] === ' ' ? 3 : gw(s[i]) + (bold ? 2 : 1)) * sc + (bold && s[i] === ' ' ? sc : 0);
      }
    }
    function frame(g, r, alpha) {
      var x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h), C = ramp(), pa = g.globalAlpha;
      if (w < 6 || h < 6) return;
      g.globalAlpha = pa;
      for (var i = 0; i < h - 2; i++) { var f = Math.min(7, Math.floor(i / (h - 2) * 8)) / 7, seg = Math.min(2, Math.floor(f * 3)), ff = f * 3 - seg; g.fillStyle = mixHex(C[seg], C[seg + 1], Math.round(ff * 4) / 4); g.fillRect(x + 1, y + 1 + i, w - 2, 1); }
      g.globalAlpha = pa;
      g.fillStyle = 'rgba(6,4,14,0.45)'; g.fillRect(x + 2, y + h, w - 2, 2); g.fillRect(x + w, y + 2, 2, h - 2);
      g.fillStyle = COL.edge;
      g.fillRect(x + 2, y, w - 4, 1); g.fillRect(x + 2, y + h - 1, w - 4, 1); g.fillRect(x, y + 2, 1, h - 4); g.fillRect(x + w - 1, y + 2, 1, h - 4);
      g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + w - 2, y + 1, 1, 1); g.fillRect(x + 1, y + h - 2, 1, 1); g.fillRect(x + w - 2, y + h - 2, 1, 1);
      g.fillStyle = C[4]; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 5);
      g.fillStyle = C[5]; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
      [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]].forEach(function (p) { g.fillStyle = mixHex(COL.accent2, '#000000', 0.45); g.fillRect(p[0], p[1], 2, 2); g.fillStyle = COL.accent; g.fillRect(p[0], p[1], 1, 1); });
      drawn.push({ kind: 'panel', x: x, y: y, w: w, h: h });
    }
    function icon(g, name, x, y, sel) {
      var b = ICON[name]; if (!b) return;
      var c1 = sel ? COL.accent : mixHex(COL.text2, '#ffffff', 0.3), c2 = sel ? '#ffffff' : COL.text, sh = COL.edge;
      if (values.contrast) { c1 = sel ? '#ffff00' : '#ffffff'; c2 = c1; }
      for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < 7; rx++) if (b[ry][rx] !== '0') { g.fillStyle = sh; g.fillRect(x + rx + 1, y + ry + 1, 1, 1); }
      for (ry = 0; ry < 7; ry++) for (rx = 0; rx < 7; rx++) { var v = b[ry][rx]; if (v !== '0') { g.fillStyle = v === '2' ? c2 : c1; g.fillRect(x + rx, y + ry, 1, 1); } }
    }
    function glove(g, x, y) {
      var C = { o: '#1a0e08', W: '#fff8e8', b: '#d8c8b0', s: '#b8a890' };
      for (var ry = 0; ry < GLOVE.length; ry++) for (var rx = 0; rx < GLOVE[ry].length; rx++) { var ch = GLOVE[ry][rx]; if (C[ch]) { g.fillStyle = C[ch]; g.fillRect(x + rx, y + ry, 1, 1); } }
    }
    function tri(g, x, y, dir, col) { g.fillStyle = col; for (var i = 0; i < 4; i++) { if (dir === 'l') g.fillRect(x + i, y + 3 - i, 1, 1 + i * 2); else if (dir === 'r') g.fillRect(x + 3 - i, y + 3 - i, 1, 1 + i * 2); else if (dir === 'u') g.fillRect(x + 3 - i, y + i, 1 + i * 2, 1); else g.fillRect(x + 3 - i, y + 3 - i, 1 + i * 2, 1); } }
    function drawRows(g, L, sc, openK) {
      var rows = L.rows, selRec = null, flash = S.flash && S.flash.screen === sc.id ? S.flash : null;
      rows.forEach(function (rec, k) { if (rec.i === sc.sel && !rec.header) selRec = rec; });
      // highlight band glides with the cursor (spring on the row index)
      if (selRec && selRec.rect) {
        var off = (S.cur - sc.sel) * (L.list && !L.list.inline ? L.list.rowH : 0), by = Math.round(selRec.rect.y + (L.list && L.list.inline ? 0 : off));
        if (L.list && L.list.inline) by = selRec.rect.y;
        var bx = selRec.rect.x, bw = selRec.rect.w;
        if (L.list && L.list.inline) { var lo = rows[0].rect.x, hi = rows[rows.length - 1].rect.x; bx = Math.round(lo + (hi - lo) * clamp(S.cur, 0, 1)); }
        g.fillStyle = values.contrast ? '#333300' : 'rgba(255,240,180,0.13)'; g.fillRect(bx, by, bw, selRec.rect.h - 1);
        g.fillStyle = values.contrast ? '#ffff00' : 'rgba(255,240,180,0.35)'; g.fillRect(bx, by, bw, 1); g.fillRect(bx, by + selRec.rect.h - 2, bw, 1);
        if (flash && flash.row === sc.sel) { g.fillStyle = 'rgba(255,255,255,' + (0.5 * (1 - flash.t / 180)).toFixed(3) + ')'; g.fillRect(bx, by, bw, selRec.rect.h - 1); }
      }
      rows.forEach(function (rec, k) {
        var r = rec.row, appear = clamp((openK * 1000 - k * 30) / 90, 0, 1);
        if (appear <= 0) return;
        var pa = g.globalAlpha; g.globalAlpha = pa * (appear < 1 ? 0.5 : 1);
        var sel = rec.i === sc.sel && !rec.header, lift = sel && !values.reduceMotion ? 1 : 0, dx = Math.round((1 - appear) * 6);
        if (rec.header) { text(g, r.label, rec.tx + dx, rec.ty, 'head', true, r.id); g.fillStyle = mixHex(ramp()[4], ramp()[0], 0.55); g.fillRect(rec.tx + tw(r.label) + 4 + dx, rec.ty + 3, Math.max(0, L.panel.x + L.panel.w - M.pad - 2 - (rec.tx + tw(r.label) + 4 + dx)), 1); g.globalAlpha = pa; return; }
        var kind = !r.enabled && r.kind === 'button' ? 'dim' : sel ? 'sel' : 'main';
        if (rec.icon) icon(g, r.icon, rec.icon.x + lift + dx, rec.icon.y, sel);
        text(g, r.label, rec.tx + lift + dx, rec.ty, kind, true, r.id);
        if (r.kind === 'slider') {
          var t = rec.track, v = values[r.key], f = (v - r.min) / Math.max(1, r.max - r.min), fw = Math.round((t.w - 2) * f);
          g.fillStyle = COL.edge; g.fillRect(t.x, t.y + 2, t.w, 3);
          g.fillStyle = mixHex(ramp()[3], '#000000', 0.35); g.fillRect(t.x + 1, t.y + 3, t.w - 2, 1);
          g.fillStyle = sel ? COL.accent : mixHex(COL.text2, ramp()[0], 0.2); g.fillRect(t.x + 1, t.y + 3, fw, 1);
          for (var n = 1; n < 10; n++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(t.x + 1 + Math.round((t.w - 2) * n / 10), t.y + 3, 1, 1); }
          var kx = t.x + fw; g.fillStyle = COL.edge; g.fillRect(kx - 1, t.y, 4, 7); g.fillStyle = sel ? '#ffffff' : COL.text2; g.fillRect(kx, t.y + 1, 2, 5); g.fillStyle = sel ? COL.accent : COL.dim; g.fillRect(kx, t.y + 4, 2, 2);
          drawn.push({ kind: 'control', x: t.x - 1, y: t.y, w: t.w + 2, h: 7, owner: r.id });
          var vs = String(v); text(g, vs, rec.val.x + (11 - tw(vs)), rec.val.y, sel ? 'sel' : 'main', true, r.id);
        } else if (r.kind === 'choice') {
          var cv = String(values[r.key]).toUpperCase(), cc = rec.choice;
          tri(g, rec.left.x + 1, rec.left.y + 3, 'l', sel ? COL.accent : COL.dim); tri(g, rec.right.x + 2, rec.right.y + 3, 'r', sel ? COL.accent : COL.dim);
          text(g, cv, cc.x + Math.round((cc.w - tw(cv)) / 2), cc.y, sel ? 'sel' : 'main', true, r.id);
          drawn.push({ kind: 'control', x: rec.left.x, y: rec.left.y + 2, w: rec.right.x + rec.right.w - rec.left.x, h: 7, owner: r.id, noText: true });
        } else if (r.kind === 'toggle') {
          var on = !!values[r.key], tg = rec.toggle;
          g.fillStyle = COL.edge; g.fillRect(tg.x, tg.y, tg.w, tg.h); g.fillStyle = on ? (values.contrast ? '#ffff00' : '#5ad86a') : mixHex(ramp()[3], '#000000', 0.4); g.fillRect(tg.x + 1, tg.y + 1, tg.w - 2, tg.h - 2);
          g.fillStyle = on ? '#ffffff' : '#9aa0b8'; g.fillRect(on ? tg.x + tg.w - 5 : tg.x + 1, tg.y, 4, tg.h);
          text(g, on ? 'ON' : 'OFF', rec.tlabel.x, rec.tlabel.y, sel ? 'sel' : on ? 'main' : 'dim', true, r.id);
          drawn.push({ kind: 'control', x: tg.x, y: tg.y, w: tg.w, h: tg.h, owner: r.id });
        } else if (r.kind === 'info') {
          text(g, r.value, rec.info.x, rec.info.y, 'sel', true, r.id);
        }
        g.globalAlpha = pa;
      });
      if (selRec && selRec.rect && !(L.list && L.list.inline)) {
        var bob = values.reduceMotion ? 0 : Math.floor(S.clock / 220) % 2, gy = Math.round(selRec.rect.y + 1 + (S.cur - sc.sel) * (L.list ? L.list.rowH : M.rowH));
        glove(g, L.panel.x + 5 + bob, gy);
      }
      if (L.scrollUp) tri(g, L.scrollUp.x + 3, L.scrollUp.y + 1, 'u', COL.accent);
      if (L.scrollDown) tri(g, L.scrollDown.x + 3, L.scrollDown.y + 1, 'd', COL.accent);
    }
    function drawLogo(g, L) {
      var lg = L.logo, s = lg.s, cols = Array.isArray(COL.logo) ? COL.logo : [COL.logo, COL.logo];
      if (values.contrast) cols = ['#ffffff', '#ffff00'];
      var band = [cols[0], mixHex(cols[0], cols[1], 0.33), mixHex(cols[0], cols[1], 0.66), cols[1]];
      var drop = 0;
      if (S.introOn && !S.introShort && !values.reduceMotion) { var e = easeBack(clamp((S.intro - 250) / 650, 0, 1)); drop = Math.round((1 - e) * -(lg.y + lg.h + 6)); }
      var lineH = 7 * s + Math.max(2, Math.round(s * 1.2));
      lg.lines.forEach(function (line, i) {
        var lw = boldMeasure(line) * s, lx = Math.round(lg.x + (lg.w - lw) / 2), ly = lg.y + drop + i * lineH;
        bigText(g, line, lx, ly, s, band, COL.ink, true);
        // glint: a bright diagonal band sweeping across the letters every 3.6 s
        if (!values.reduceMotion && !values.contrast) {
          var gp = ((S.clock % 3600) / 1400) * (lg.w + 40) - 20, cx = lx, str = line;
          g.fillStyle = 'rgba(255,255,255,0.75)';
          for (var c = 0; c < str.length; c++) {
            var rows = boldRows(str[c]);
            if (rows) for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < rows[ry].length; rx++) if (rows[ry][rx] === '1') {
              var px = cx + rx * s - lg.x, d = px + (ly + ry * s - lg.y) * 0.6 - gp;
              if (d >= 0 && d < s * 1.5) g.fillRect(cx + rx * s, ly + ry * s, s, s);
            }
            cx += (str[c] === ' ' ? 4 : gw(str[c]) + 2) * s;
          }
        }
        if (!drop) drawn.push({ kind: 'logo', x: lx, y: ly, w: lw, h: 7 * s, text: line });
      });
      // ornament under the logo: a rule with a diamond in the middle
      var oy = lg.y + drop + lg.h + 1, ow = Math.min(lg.w, Math.max(40, Math.round(lg.w * 0.7))), ox = Math.round(lg.x + (lg.w - ow) / 2);
      if (!L.tag) { g.fillStyle = COL.ink; g.fillRect(ox, oy + 1, ow, 2); g.fillStyle = cols[1]; g.fillRect(ox + 1, oy + 1, ow - 2, 1); }
      if (L.tag) {
        var ta = S.introOn && !S.introShort && !values.reduceMotion ? clamp((S.intro - 800) / 400, 0, 1) : 1;
        if (ta > 0) {
          var pa = g.globalAlpha; g.globalAlpha = pa * ta; var ty = L.tag.y + drop, one = L.tag.lines.length === 1, orn = one && L.tag.x >= 14;
          // a dark backing plate (cut corners) so the tagline reads over any scenery
          var bx = L.tag.x - (orn ? 13 : 4), bw2 = L.tag.w + (orn ? 26 : 8), by2 = ty - 3, bh2 = L.tag.h + 6;
          g.fillStyle = 'rgba(10,6,20,0.62)'; g.fillRect(bx + 1, by2, bw2 - 2, bh2); g.fillRect(bx, by2 + 1, bw2, bh2 - 2);
          if (orn) { g.fillStyle = cols[1]; g.fillRect(L.tag.x - 10, ty + 3, 6, 1); g.fillRect(L.tag.x + L.tag.w + 4, ty + 3, 6, 1);
            g.fillRect(L.tag.x - 4 - 2, ty + 2, 1, 3); g.fillRect(L.tag.x + L.tag.w + 5, ty + 2, 1, 3); }
          L.tag.lines.forEach(function (ln) { text(g, ln.text, ln.x, ln.y + drop, 'main', !drop, 'tagline'); }); g.globalAlpha = pa;
        }
      }
    }
    function drawSparkles(g, L, avoid) {
      if (values.reduceMotion || values.flashes === 'reduced') return;
      var n = 16, W = L.W, H = L.H, seed = +P.seed || 1;
      for (var i = 0; i < n; i++) {
        var per = 2600 + Math.floor(hsh(i, seed) * 2400), ph = (S.clock + hsh(i, seed + 3) * per) % per, life = ph / per;
        var x = Math.round(hsh(i, seed + 1) * W + Math.sin((S.clock + i * 900) / 1800) * 4), y = Math.round(H * 0.08 + hsh(i, seed + 2) * H * 0.84 - life * 10);
        var a = Math.sin(life * Math.PI); if (a < 0.15) continue;
        var bad = false; for (var j = 0; j < avoid.length; j++) if (avoid[j] && hit({ x: avoid[j].x - 4, y: avoid[j].y - 4, w: avoid[j].w + 8, h: avoid[j].h + 8 }, x, y)) { bad = true; break; }
        if (bad) continue;
        g.fillStyle = i % 3 ? 'rgba(255,248,220,' + (0.85 * a).toFixed(3) + ')' : 'rgba(255,214,130,' + (0.85 * a).toFixed(3) + ')';
        g.fillRect(x, y, 1, 1);
        if (a > 0.7) { g.fillStyle = 'rgba(255,248,220,' + (0.4 * a).toFixed(3) + ')'; g.fillRect(x - 1, y, 1, 1); g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1); g.fillRect(x, y + 1, 1, 1); }
      }
    }
    function bands(g, W, H, from, to, a0, a1, col) {
      var steps = 6;
      for (var i = 0; i < steps; i++) {
        var y0 = Math.round(from + (to - from) * i / steps), y1 = Math.round(from + (to - from) * (i + 1) / steps), a = a0 + (a1 - a0) * (i + 0.5) / steps;
        g.fillStyle = col.replace('A', a.toFixed(3)); g.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
      }
    }
    function drawCover(g, W, H, k) {
      // k = 0 (open) .. 1 (fully covered)
      if (k <= 0) return; g.fillStyle = COL.cover;
      var kind = values.reduceMotion ? 'fade' : P.transition;
      if (k >= 1) { g.fillRect(0, 0, W, H); return; }
      if (kind === 'fade') { var st = Math.round(k * 5) / 5; g.globalAlpha = st; g.fillRect(0, 0, W, H); g.globalAlpha = 1; return; }
      if (kind === 'iris') {
        var cx = W / 2, cy = H / 2, R = Math.sqrt(cx * cx + cy * cy) * (1 - k), q = 2;
        for (var y = 0; y < H; y += q) { var dy = y + q / 2 - cy, half = R * R - dy * dy; if (half <= 0) { g.fillRect(0, y, W, q); continue; } var hw = Math.round(Math.sqrt(half)); g.fillRect(0, y, Math.max(0, Math.round(cx - hw)), q); g.fillRect(Math.round(cx + hw), y, W, q); }
        return;
      }
      // diamond wipe: diamonds grow left to right
      var D = 16, cols = Math.ceil(W / D) + 1, rws = Math.ceil(H / D) + 1;
      for (var j = 0; j < rws; j++) for (var i = 0; i < cols; i++) {
        var d = clamp(k * 2.2 - (i / cols) * 1.2, 0, 1), r = Math.round(d * D * 0.75);
        if (r <= 0) continue;
        var cx2 = i * D, cy2 = j * D;
        for (var s = -r; s <= r; s++) { var hw2 = r - Math.abs(s); g.fillRect(cx2 - hw2, cy2 + s, hw2 * 2 + 1, 1); }
      }
    }
    function drawTitleCover(g, r) {
      // hides a HUD area of the game on the title (e.g. an empty command panel): night gradient, a gold rule, faint stars
      var x = Math.floor(r.x), y = Math.floor(r.y), w = Math.ceil(r.w), h = Math.ceil(r.h), seed = +P.seed || 1;
      for (var i = 0; i < h; i++) { g.fillStyle = mixHex('#1a1230', COL.cover, Math.round(clamp(i / Math.max(1, h - 1), 0, 1) * 6) / 6); g.fillRect(x, y + i, w, 1); }
      g.fillStyle = COL.ink; g.fillRect(x, y, w, 1); g.fillStyle = mixHex(COL.accent2, '#000000', 0.35); g.fillRect(x, y + 1, w, 1);
      g.fillStyle = 'rgba(255,240,200,0.10)'; g.fillRect(x, y + 2, w, 1);
      for (var j = 0; j < Math.floor(w * h / 400); j++) { var sx = x + Math.floor(hsh(j, seed + 9) * w), sy = y + 4 + Math.floor(hsh(j, seed + 11) * (h - 6)), a = 0.15 + 0.25 * hsh(j, seed + 13) * (0.6 + 0.4 * Math.sin(S.clock / 700 + j)); g.fillStyle = 'rgba(255,240,210,' + a.toFixed(3) + ')'; g.fillRect(sx, sy, 1, 1); }
    }
    function drawPauseButton(g) {
      var b = pauseRect(); if (!b) return;
      g.fillStyle = 'rgba(6,4,14,0.55)'; g.fillRect(b.x, b.y + 1, b.w, b.h - 2); g.fillRect(b.x + 1, b.y, b.w - 2, b.h);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(b.x + 1, b.y + 1, b.w - 2, 1);
      g.fillStyle = '#ffffff'; g.fillRect(b.x + 4, b.y + 3, 2, b.h - 6); g.fillRect(b.x + b.w - 6, b.y + 3, 2, b.h - 6);
      drawn.push({ kind: 'button', x: b.x, y: b.y, w: b.w, h: b.h, owner: 'pause' });
    }

    function draw() {
      if (skip) return;
      STATS.draws++;
      drawn = [];
      var needs = S.mode !== 'off' || S.trans || S.ghost || (S.mode === 'off' && canvas && pauseBtnShown() && canPauseNow());
      if (!needs) { if (overlay && overlay.style.display !== 'none') { octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, overlay.width, overlay.height); overlay.style.display = 'none'; } return; }
      if (!ensureOverlay()) return;
      measure();
      var dpr = view.dpr, hostGrid = !!view.k, bw = hostGrid ? view.W : Math.max(1, Math.round(view.cssW * dpr)), bh = hostGrid ? view.H : Math.max(1, Math.round(view.cssH * dpr));
      if (overlay.width !== bw || overlay.height !== bh) { overlay.width = bw; overlay.height = bh; }
      overlay.style.imageRendering = hostGrid ? 'pixelated' : 'auto';
      var sx = root.scrollX || root.pageXOffset || 0, sy = root.scrollY || root.pageYOffset || 0;
      overlay.style.display = 'block'; overlay.style.width = view.cssW + 'px'; overlay.style.height = view.cssH + 'px';
      overlay.style.left = (view.left + sx) + 'px'; overlay.style.top = (view.top + sy) + 'px';
      var g = octx; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, bw, bh);
      if (hostGrid) g.setTransform(1, 0, 0, 1, 0, 0); else g.setTransform(dpr * view.u, 0, 0, dpr * view.u, 0, 0);
      g.imageSmoothingEnabled = false;
      try { render(g); } catch (e) { errors++; warn('draw failed: ' + (e && e.message || e)); }
      var k = view.u * view.sx; drawn.forEach(function (r) { r.x *= k; r.y *= k; r.w *= k; r.h *= k; });
    }
    function render(g) {
      var W = view.W, H = view.H, sc = top(), L = layout();
      if (S.mode === 'title') {
        // title backdrop: the game draws its own art below; the module darkens top and bottom for legibility
        bands(g, W, H, 0, Math.round(H * 0.22), 0.42, 0, 'rgba(8,5,16,A)');
        bands(g, W, H, Math.round(H * 0.45), H, 0, 0.62, 'rgba(8,5,16,A)');
        var subs = sc && sc.id !== 'press' && sc.id !== 'main' && sc.id !== 'farewell';
        var Lt = subs ? layoutTitleBase() : L;
        (Lt.cover || []).forEach(function (r) { drawTitleCover(g, r); });
        // a sub-window (options, controls, confirm) fades the logo out completely in 140 ms; it comes back with the menu
        var la = subs ? (values.reduceMotion ? 0 : 1 - clamp(sc.t / 140, 0, 1)) : 1;
        if (Lt.logo && la > 0) {
          var pa0 = g.globalAlpha; g.globalAlpha = Math.round(la * 4) / 4;
          if (!subs) drawSparkles(g, Lt, [Lt.logo, Lt.panel, Lt.tag, Lt.press]);
          drawLogo(g, Lt); g.globalAlpha = pa0;
        }
        if (subs) { g.fillStyle = 'rgba(8,5,16,0.66)'; g.fillRect(0, 0, W, H); drawn = drawn.filter(function (r) { return r.kind !== 'text' && r.kind !== 'logo'; }); }
        if (sc && sc.id === 'press' && L.press) {
          var blink = values.reduceMotion ? 1 : (Math.floor(S.clock / 500) % 3 === 2 ? 0.35 : 1);
          if (!(S.introOn && !S.introShort && S.intro < 1100)) { var pa = g.globalAlpha; g.globalAlpha = blink; text(g, L.press.text, L.press.x, L.press.y, 'main', true, 'press'); g.globalAlpha = pa; }
        }
        if (sc && sc.id === 'farewell' && L.press) text(g, L.press.text, L.press.x, L.press.y, 'sel', true, 'farewell');
        if (L.panel) { var pa1 = g.globalAlpha; if (L.dimObstacles) g.globalAlpha = 0.84; drawPanel(g, L, sc); g.globalAlpha = pa1; }
        if (L.version) text(g, L.version.text, L.version.x, L.version.y, 'dim', true, 'version');
        if (L.hint) text(g, L.hint.text, L.hint.x, L.hint.y, 'dim', true, 'hint');
        if (S.introOn) { var a = S.introShort ? 1 - clamp(S.intro / 260, 0, 1) : 1 - clamp(S.intro / 600, 0, 1); if (a > 0) { g.globalAlpha = Math.round(a * 6) / 6; g.fillStyle = COL.cover; g.fillRect(0, 0, W, H); g.globalAlpha = 1; } }
      } else if (S.mode === 'pause') {
        var da = values.reduceMotion ? 0.6 : 0.6 * clamp(S.pauseT / 150, 0, 1);
        g.fillStyle = 'rgba(8,5,16,' + da.toFixed(3) + ')'; g.fillRect(0, 0, W, H);
        if (L.panel) {   // the caption + window stand on a near-opaque band, so game text or bubbles behind them never read through
          var t0 = (L.big ? L.big.y : L.panel.y) - 5, t1 = L.panel.y + L.panel.h + 5, ba = (values.reduceMotion ? 1 : clamp(S.pauseT / 150, 0, 1));
          g.fillStyle = 'rgba(8,5,16,' + (0.75 * ba).toFixed(3) + ')'; g.fillRect(0, t0 + 2, W, t1 - t0 - 4);
          g.fillStyle = 'rgba(8,5,16,' + (0.4 * ba).toFixed(3) + ')'; g.fillRect(0, t0, W, 2); g.fillRect(0, t1 - 2, W, 2);
        }
        if (L.big) { bigText(g, L.big.text, L.big.x, L.big.y, L.big.s, [COL.text, COL.text, COL.text2, COL.text2], COL.ink); drawn.push({ kind: 'text', x: L.big.x, y: L.big.y, w: L.big.w, h: L.big.h, text: L.big.text }); }
        if (L.panel) drawPanel(g, L, sc);
        if (L.hint) text(g, L.hint.text, L.hint.x, L.hint.y, 'dim', true, 'hint');
      } else if (S.ghost) {
        var gk = 1 - S.ghost.t / 160; if (gk > 0) { g.fillStyle = 'rgba(8,5,16,' + (0.6 * gk).toFixed(3) + ')'; g.fillRect(0, 0, W, H); }
      }
      if (S.mode === 'off' && pauseBtnShown() && canPauseNow()) drawPauseButton(g);
      if (S.trans) { var tk = S.trans.phase === 'out' ? S.trans.t / S.trans.dur : 1 - S.trans.t / S.trans.dur; drawCover(g, W, H, clamp(tk, 0, 1)); }
    }
    function layoutTitleBase() { var keep = S.stack; S.stack = [{ id: 'main', sel: 0, scroll: 0, t: 1000 }]; var L = layout(); S.stack = keep; L.panel = null; L.rows = []; L.hint = null; return L; }
    function drawPanel(g, L, sc) {
      var p = L.panel, ok = values.reduceMotion ? 1 : clamp(sc.t / 200, 0, 1), e = easeBack(ok);
      var hh = Math.max(6, Math.round(p.h * (0.35 + 0.65 * e)));
      var r = { x: p.x, y: Math.round(p.y + (p.h - hh) / 2), w: p.w, h: hh };
      g.save();
      frame(g, r);
      if (ok >= 1 || hh >= p.h) {
        g.beginPath(); g.rect(p.x, r.y, p.w, r.h); g.clip();
        if (L.head) { text(g, L.head.text, L.head.x, L.head.y, 'head', true, 'head'); g.fillStyle = mixHex(ramp()[4], ramp()[0], 0.5); g.fillRect(L.head.x, L.head.y + 9, p.w - M.pad * 2 - 2, 1); }
        if (L.msg) text(g, L.msg.text, L.msg.x, L.msg.y, 'main', true, 'msg');
        drawRows(g, L, sc, clamp(sc.t / 1000, 0, 1));
      }
      g.restore();
    }

    /* ----- public ----- */
    if (!skip) { listen(); var it00 = isTitleNow(); if (it00 === null || it00) { S.booted = true; openTitle('press'); S.wasTitle = true; } }
    var inst = {
      update: function (dt) { try { update(dt); } catch (e) { errors++; warn('update failed: ' + (e && e.message || e)); } },
      draw: function () { draw(); },
      busy: function () { return isBusy(); },
      titleShown: function () { return !skip && (S.mode === 'title' || !!(S.trans && S.trans.phase === 'out' && S.trans.kind === 'start')); },
      paused: function () { return !skip && S.mode === 'pause'; },
      skipped: function () { return skip; },
      get: function (key) { return values[key]; },
      options: function () { return getAll(); },
      set: function (key, v) { return setValue(key, v); },
      press: function (a) { return press(a, 'script'); },
      pointer: function (type, x, y, kind) { if (skip) return; queue.push({ type: type, x: x, y: y, via: kind === 'touch' ? 'touch' : 'mouse', mouse: kind !== 'touch' }); if (kind === 'touch') touchSeen = true; },
      openPause: function () { if (!skip && S.mode === 'off') openPause(); },
      resume: function () { resume(); },
      showTitle: function () { if (!skip && S.mode === 'off') { openTitle(S.titleOpens === 0 ? 'press' : 'main'); S.wasTitle = true; } },
      layout: function () { return layout(); },
      lastDrawn: function () { return drawn.slice(); },
      rect: function () { var L = layout(); if (!L.panel) return null; var k = view.u * view.sx; return { x: L.panel.x * k, y: L.panel.y * k, w: L.panel.w * k, h: L.panel.h * k }; },
      state: function () {
        var sc = top(), rows = sc ? rowsFor(sc.id) : [];
        return { mode: skip ? 'skipped' : S.mode, screen: sc ? sc.id : null, sel: sc ? sc.sel : -1, selId: sc && rows[sc.sel] ? rows[sc.sel].id : null, scroll: sc ? sc.scroll : 0,
          rows: rows.map(function (r) { return { id: r.id, kind: r.kind, enabled: r.enabled }; }), busy: isBusy(), titleShown: inst.titleShown(), starts: S.starts, titleOpens: S.titleOpens,
          trans: S.trans ? { phase: S.trans.phase, t: Math.round(S.trans.t), kind: S.trans.kind } : null, clock: Math.round(S.clock), options: getAll(), storedIn: storedIn,
          view: { W: view.W, H: view.H, u: view.u }, theme: theme(), touch: touchSeen };
      },
      debug: function () { return { events: events.slice(), stats: { updates: STATS.updates, draws: STATS.draws, consumedKeys: STATS.consumedKeys, consumedPointers: STATS.consumedPointers, passedKeys: STATS.passedKeys }, warnings: warnings.slice(), errors: errors }; },
      destroy: function () { listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); }); listeners = []; if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); overlay = null; }
    };
    return inst;
  }

  root.GameDNA_TitleMenu = { create: create, VERSION: VERSION, OPTIONS: OPTION_SCHEMA, measure: pxMeasure };
})(typeof window !== 'undefined' ? window : this);
