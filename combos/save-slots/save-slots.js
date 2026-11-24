/* GameDNA I-04 - Save & load slots - module v1 (plain script, no dependencies, one global: GameDNA_SaveSlots)
 *
 *   const saves = GameDNA_SaveSlots.create({
 *     key: 'my-game',                          // storage namespace (required): slots live at '<key>/slot-1' ... '<key>/auto'
 *     version: 1,                              // your save-data version; older saves go through migrate()
 *     serialize: () => ({ ... }),              // YOUR state as plain JSON data (the module never guesses it)
 *     deserialize: (data, info) => { ... },    // put it back; must leave the game able to keep playing
 *     summary: () => ({ place, level, time, note }),   // what the slot shows (time = play time in seconds)
 *     canSave: () => true,                     // false (or a short reason) where the state cannot be saved
 *     canvas: myCanvas, thumbRect: { x, y, w, h },     // thumbnail source (native px), optional
 *     view: { w: 256, h: 224 },                // or bounds: { x, y, w, h }
 *     autoplay: () => AUTOPLAY, skin: 'pixel16', params: { slots: 3, autosave: 'on' }
 *   });
 *   saves.open('save' | 'load' | 'both')       // the slot screen; busy() is true until it has closed
 *   saves.key(code, down) / press('up'|'down'|'left'|'right'|'ok'|'back') / tap(x, y)   // input while busy()
 *   saves.update(dtMs)                         // fixed step: the only clock
 *   saves.draw(ctx)                            // last in the draw pass
 *   saves.save(n) / load(n) / remove(n) / autosave() / exportCode(n) / importCode(code, n) / boot() / selfTest()
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.1', FORMAT = 1, PREFIX = 'GDNA1-';
  var DEFAULTS = { slots: 3, autosave: 'on', autosaveGap: 10, thumb: 'on', thumbW: 40, confirm: 'on', codes: 'on', closeAfterSave: 'on',
    dim: 0.45, verify: 'on', badge: 'on', autoAction: 'cancel', autoSlot: 1, title: '' };
  var INTRO = 120, OUTRO = 100, ARM = 120, TOAST = 900, REPEAT0 = 320, REPEAT = 90, STEP = 1000 / 60;
  var KEYS = { ArrowUp: 'up', Up: 'up', ArrowDown: 'down', Down: 'down', ArrowLeft: 'left', Left: 'left', ArrowRight: 'right', Right: 'right',
    KeyZ: 'ok', z: 'ok', Z: 'ok', Space: 'ok', ' ': 'ok', Enter: 'ok', NumpadEnter: 'ok',
    KeyX: 'back', x: 'back', X: 'back', Escape: 'back', Esc: 'back', Backspace: 'back' };

  /* ---------- built-in look = pixel16 (5x7 ui font, 6 px advance, 2-tone + drop shadow) ---------- */
  var GL = {
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
  var FB = { ink: '#06061a', win: ['#4c5a8a', '#3e4a76', '#323c62', '#262e4e', '#c8d4f4', '#0a0e22'], rivet: '#ffe070', rivetShade: '#7a5410',
    main: '#ffffff', main2: '#c8d4ff', shadow: '#0a0c24', dim: '#8088a8', dim2: '#626a88', accent: '#ffe070', title: '#fff4c8', title2: '#e8c870',
    select: 'rgba(255,255,255,0.2)', well: 'rgba(6,8,30,0.4)', hot: '#ff7a3a', heal: '#4ad870', cold: '#6ad8f0', pointer: '#fff8e8', pointerEdge: '#1a0e08' };
  var HAND = ['.oo....', 'owwoooo', 'owwwwwo', 'owwwwo.', '.oooo..'];

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function inside(p, r) { return r && p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h; }
  function mkCanvas(w, h) { try { var c = root.document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; } catch (e) { return null; } }
  function fnv(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ('0000000' + (h >>> 0).toString(16)).slice(-8); }
  function hash3(x, y, z) { var h = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((z | 0) + 7, 83492791); h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; }
  // canonical JSON: the same data gives the same string whatever the key order (used for checksums and round-trip checks)
  function canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(function (x) { return x === undefined || typeof x === 'function' ? 'null' : canon(x); }).join(',') + ']';
    var ks = Object.keys(v).filter(function (k) { return v[k] !== undefined && typeof v[k] !== 'function'; }).sort();
    return '{' + ks.map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  }
  function firstDiff(a, b, path) {
    path = path || '';
    if (a === b) return null;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return path || '(root)';
    var ks = {}, k; for (k in a) ks[k] = 1; for (k in b) ks[k] = 1;
    for (k in ks) { var d = firstDiff(a[k], b[k], path + (Array.isArray(a) ? '[' + k + ']' : '.' + k)); if (d) return d; }
    return null;
  }
  function b64enc(s) { try { return root.btoa(unescape(encodeURIComponent(s))); } catch (e) { return null; } }
  function b64dec(s) { try { return decodeURIComponent(escape(root.atob(s))); } catch (e) { return null; } }
  function fmtTime(t) {
    if (typeof t === 'string') return t;
    t = Math.max(0, Math.floor(num(t, 0)));
    var h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60, p = function (n) { return (n < 10 ? '0' : '') + n; };
    return h > 0 ? h + 'H ' + p(m) + 'M' : m + 'M ' + p(s) + 'S';
  }

  /* ---------- thumbnails: point-sampled from the native canvas, palette-indexed text ---------- */
  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function captureThumb(cv, rect, tw, viewW, viewH) {
    try {
      if (!cv || !cv.getContext || !(cv.width > 0)) return null;
      var sx = cv.width / (viewW || cv.width), sy = cv.height / (viewH || cv.height);
      var r = rect || { x: 0, y: 0, w: viewW || cv.width, h: viewH || cv.height };
      var X = Math.round(r.x * sx), Y = Math.round(r.y * sy), W = Math.round(r.w * sx), H = Math.round(r.h * sy);
      X = clamp(X, 0, cv.width - 1); Y = clamp(Y, 0, cv.height - 1); W = clamp(W, 1, cv.width - X); H = clamp(H, 1, cv.height - Y);
      tw = clamp(Math.round(tw), 8, 96); var th = clamp(Math.round(tw * r.h / r.w), 6, 96);
      var d = cv.getContext('2d').getImageData(X, Y, W, H).data, px = [];
      for (var y = 0; y < th; y++) for (var x = 0; x < tw; x++) {
        var ix = Math.min(W - 1, Math.floor((x + 0.5) * W / tw)), iy = Math.min(H - 1, Math.floor((y + 0.5) * H / th)), o = (iy * W + ix) * 4;
        px.push(d[o + 3] < 128 ? [0, 0, 0] : [d[o], d[o + 1], d[o + 2]]);
      }
      for (var bits = 8; bits >= 2; bits--) {      // fewer colour bits until the picture fits a 64-colour palette
        var pal = [], idx = {}, out = '', ok = true, sh = 8 - bits;
        for (var i = 0; i < px.length; i++) {
          var c = px[i].map(function (v) { if (!sh) return v; var q = v >> sh; return Math.round(q * 255 / ((1 << bits) - 1)); }), k = (c[0] << 16) | (c[1] << 8) | c[2];
          if (idx[k] == null) { if (pal.length >= 64) { ok = false; break; } idx[k] = pal.length; pal.push(('00000' + k.toString(16)).slice(-6)); }
          out += ALPHA[idx[k]];
        }
        if (ok) return tw + 'x' + th + ':' + pal.join('') + ':' + out;
      }
    } catch (e) { }
    return null;   // tainted canvas, no canvas, no document
  }
  var THUMBS = {};
  function thumbImage(str) {
    if (!str) return null; if (THUMBS[str]) return THUMBS[str];
    try {
      var p = str.split(':'), wh = p[0].split('x'), w = +wh[0], h = +wh[1], pal = [], k;
      for (k = 0; k + 6 <= p[1].length; k += 6) pal.push('#' + p[1].slice(k, k + 6));
      if (!(w > 0 && h > 0) || p[2].length !== w * h) return null;
      var c = mkCanvas(w, h); if (!c) return null; var g = c.getContext('2d');
      for (var y = 0; y < h; y++) { var run = 0, col = null; for (var x = 0; x <= w; x++) { var cc = x < w ? pal[ALPHA.indexOf(p[2][y * w + x])] || '#000000' : null; if (cc !== col) { if (col) { g.fillStyle = col; g.fillRect(x - run, y, run, 1); } col = cc; run = 0; } run++; } }
      return (THUMBS[str] = { img: c, w: w, h: h });
    } catch (e) { return null; }
  }

  function create(o) {
    o = o || {};
    var API = root.GameDNA_Skin || null, SK = null;
    try { SK = o.skin === false || !API || !API.resolve ? null : API.resolve(o.skin); } catch (e) { SK = null; }
    var U = {}, warned = {}, clock = 0, lastCanvas = null, last = null, lastAct = null, drawn = [], lastAuto = -1e9, badgeT = -1, lastCodeStr = null;
    var KEY = String(o.key || '').replace(/\s+/g, '-');
    var VER = Math.max(1, Math.floor(num(o.version, 1)));
    setParams(o.params || {});
    var Q = null; try { Q = new URLSearchParams(o.url != null ? o.url : root.location ? root.location.search : ''); } catch (e) { Q = null; }
    var qget = function (k) { try { return Q && Q.has(k) ? Q.get(k) : null; } catch (e) { return null; } };
    var FROZEN = qget('freeze') === '1';
    var saveAt = qget('saveAt') != null ? num(qget('saveAt'), null) : null, saveSlot = slotId(qget('saveSlot') || 1), saveAtDone = false;
    function dbg(e) { if (typeof o.debug === 'function') { try { o.debug(e); } catch (x) { } } }
    function warnOnce(k, msg) { if (warned[k]) return; warned[k] = 1; if (root.console) console.warn('GameDNA_SaveSlots: ' + msg); }
    function call(fn, a, b, c) { if (typeof fn === 'function') { try { return fn(a, b, c); } catch (x) { warnOnce('cb' + String(fn).length, 'a host callback threw: ' + x); dbg({ event: 'callbackError', error: String(x) }); throw x; } } return undefined; }
    function safe(fn, a, b, c) { try { return call(fn, a, b, c); } catch (x) { return undefined; } }
    function setParams(p) { p = p || {}; for (var k in p) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && p[k] != null && p[k] !== '') U[k] = p[k]; }
    function P(k) { var v = U[k] != null ? U[k] : DEFAULTS[k]; return typeof DEFAULTS[k] === 'number' ? num(v, DEFAULTS[k]) : String(v); }
    function nSlots() { return clamp(Math.round(P('slots')), 1, 6); }
    function autoOn() { return P('autosave') === 'on'; }
    if (!KEY) { KEY = 'gamedna-save'; warnOnce('key', 'no options.key given: using "gamedna-save". Pass a key unique to your game, or two games on one site share slots.'); }
    function slotId(s) { if (s === 'auto' || s === 'A' || s === 'a') return 'auto'; var n = Math.floor(num(s, NaN)); return n >= 1 && n <= 6 ? n : null; }
    function slotKey(s) { return KEY + '/' + (s === 'auto' ? 'auto' : s === 'probe' ? 'probe' : 'slot-' + s); }
    function slotName(s) { return s === 'auto' ? 'AUTOSAVE' : 'SLOT ' + s; }

    /* ---------- storage: localStorage (or options.storage), every call guarded, in-memory fallback ---------- */
    var MEM = {}, mode = 'memory', ST = null;
    (function () {
      if (qget('saveStore') === 'memory') { mode = 'memory'; return; }
      try {
        ST = o.storage || root.localStorage || null;
        if (!ST) throw new Error('no storage');
        var t = KEY + '/__probe'; ST.setItem(t, '1'); ST.removeItem(t); mode = 'local';
      } catch (e) { ST = null; mode = 'memory'; dbg({ event: 'storage', op: 'init', error: String(e && e.name || e) }); warnOnce('nostore', 'storage unavailable (' + (e && e.name || e) + '): saves last until the page closes.'); }
    })();
    function sGet(k) {
      if (Object.prototype.hasOwnProperty.call(MEM, k)) return MEM[k];
      if (!ST) return null;
      try { return ST.getItem(k); } catch (e) { dbg({ event: 'storage', op: 'read', key: k, error: String(e && e.name || e) }); return null; }
    }
    function sSet(k, v) {
      if (ST) {
        try { ST.setItem(k, v); if (Object.prototype.hasOwnProperty.call(MEM, k)) delete MEM[k]; return 'local'; }
        catch (e) { dbg({ event: 'storage', op: 'write', key: k, error: String(e && e.name || e) }); warnOnce('wfail', 'a storage write failed (' + (e && e.name || e) + '): kept in memory for this session.'); }
      }
      MEM[k] = v; return 'memory';
    }
    function sDel(k) {
      delete MEM[k];
      if (ST) { try { ST.removeItem(k); } catch (e) { dbg({ event: 'storage', op: 'remove', key: k, error: String(e && e.name || e) }); } }
      MEM[k] = null;   // a tombstone: a failed remove still reads as empty
    }

    /* ---------- envelopes ---------- */
    function sumOf(data, sm, th, v) { return fnv(canon([KEY, v, sm, th || null, data])); }
    function cleanSummary(s) {
      s = s && typeof s === 'object' ? s : {}; var out = {};
      if (s.place != null) out.place = String(s.place).slice(0, 40);
      if (s.level != null && s.level !== '') out.level = typeof s.level === 'number' ? s.level : String(s.level).slice(0, 16);
      if (s.time != null) out.time = typeof s.time === 'number' ? Math.max(0, Math.floor(s.time)) : String(s.time).slice(0, 12);
      if (s.note != null) out.note = String(s.note).slice(0, 24);
      return out;
    }
    function build(data, sm, th) { var e = { gdna: FORMAT, k: KEY, v: VER, s: sm, t: th || null, d: data }; e.c = sumOf(data, sm, th, VER); return e; }
    function parse(str) {
      if (str == null) return { status: 'empty' };
      var e; try { e = JSON.parse(str); } catch (x) { return { status: 'damaged', why: 'not JSON' }; }
      if (!e || typeof e !== 'object' || e.gdna !== FORMAT || !('d' in e)) return { status: 'damaged', why: 'not a save' };
      if (e.c !== sumOf(e.d, e.s, e.t, e.v)) return { status: 'damaged', why: 'checksum' };
      var v = Math.floor(num(e.v, 0)), st = v === VER ? 'ok' : v > VER ? 'newer' : typeof o.migrate === 'function' ? 'old' : 'stale';
      return { status: st, env: e, v: v };
    }
    function info(s) {
      var raw = sGet(slotKey(s)), p = parse(raw);
      var r = { slot: s, name: slotName(s), status: p.status, empty: p.status === 'empty', damaged: p.status === 'damaged', why: p.why || null };
      if (p.env) { r.version = p.v; r.summary = p.env.s || {}; r.thumb = p.env.t || null; r.loadable = p.status === 'ok' || p.status === 'old'; }
      else r.loadable = false;
      r.bytes = raw ? raw.length : 0;
      return r;
    }
    function list() { var out = []; if (autoOn()) out.push(info('auto')); for (var i = 1; i <= nSlots(); i++) out.push(info(i)); return out; }

    /* ---------- the host's state ---------- */
    function canSaveNow() {
      if (typeof o.canSave !== 'function') return true;
      var r = safe(o.canSave); if (r === true || r === undefined) return true;
      return r === false || r == null ? 'CANNOT SAVE HERE' : String(r);
    }
    function grab() {   // serialize() through JSON, so what we keep is exactly what will come back
      if (typeof o.serialize !== 'function') return { error: 'no serialize()' };
      var d; try { d = o.serialize(); } catch (x) { warnOnce('ser', 'serialize() threw: ' + x); return { error: 'serialize failed' }; }
      if (d === undefined) return { error: 'serialize() returned nothing' };
      try { return { data: JSON.parse(JSON.stringify(d)) }; } catch (x) { warnOnce('json', 'serialize() returned data JSON cannot hold (cycles?): ' + x); return { error: 'not JSON data' }; }
    }
    function thumbFrom(cv) {
      if (P('thumb') !== 'on') return null;
      cv = cv || (typeof o.canvas === 'function' ? safe(o.canvas) : o.canvas) || lastCanvas;
      var v = viewSize(cv), tr = typeof o.thumbRect === 'function' ? safe(o.thumbRect) : o.thumbRect;
      return captureThumb(cv, tr && tr.w > 0 && tr.h > 0 ? tr : null, P('thumbW'), v.w, v.h);
    }
    function viewSize(cv) {   // native size of the canvas (differs from its pixel size only on smooth skins with a scaled backing store)
      if (o.view && o.view.w > 0) return { w: o.view.w, h: o.view.h };
      cv = cv || lastCanvas; return cv ? { w: cv.width, h: cv.height } : { w: 256, h: 224 };
    }

    /* ---------- actions (synchronous; call them at a step boundary, or let the slot screen call them) ---------- */
    function result(action, slot, ok, extra) { var r = { action: action, slot: slot, ok: !!ok }; if (extra) for (var k in extra) r[k] = extra[k]; if (action !== 'selftest') { lastAct = r; safe(o.onAction, r); } return r; }
    function save(slot, opt) {
      opt = opt || {}; slot = slotId(slot);
      if (slot == null) return result('save', slot, false, { error: 'bad slot' });
      var cs = opt.force ? true : canSaveNow(); if (cs !== true) { dbg({ event: 'write', slot: slot, ok: false, error: cs }); return result('save', slot, false, { error: cs }); }
      var g = grab(); if (g.error) { dbg({ event: 'write', slot: slot, ok: false, error: g.error }); return result('save', slot, false, { error: g.error }); }
      var sm = cleanSummary(safe(o.summary)), th = opt.thumb !== undefined ? opt.thumb : thumbFrom(opt.canvas);
      var env = build(g.data, sm, th), str = JSON.stringify(env), where = sSet(slotKey(slot), str);
      dbg({ event: 'write', slot: slot, ok: true, stored: where, bytes: str.length });
      return result('save', slot, true, { stored: where, bytes: str.length, summary: sm });
    }
    function load(slot) {
      slot = slotId(slot);
      if (slot == null) return result('load', slot, false, { error: 'bad slot' });
      var p = parse(sGet(slotKey(slot)));
      dbg({ event: 'read', slot: slot, status: p.status });
      if (p.status === 'empty') return result('load', slot, false, { error: 'empty' });
      if (p.status === 'damaged') return result('load', slot, false, { error: 'damaged', why: p.why });
      if (p.status === 'newer') return result('load', slot, false, { error: 'newer version' });
      if (p.status === 'stale') return result('load', slot, false, { error: 'old version, no migrate()' });
      return applyData(p.env.d, p.v, { slot: slot, version: p.v, summary: p.env.s || {} }, 'load', slot);
    }
    function applyData(data, v, inf, action, slot) {
      if (typeof o.deserialize !== 'function') return result(action, slot, false, { error: 'no deserialize()' });
      if (v < VER) {
        try { data = o.migrate(JSON.parse(JSON.stringify(data)), v, VER); } catch (x) { warnOnce('mig', 'migrate() threw: ' + x); return result(action, slot, false, { error: 'migrate failed' }); }
        if (data === undefined) return result(action, slot, false, { error: 'migrate() returned nothing' });
        data = JSON.parse(JSON.stringify(data)); inf.migratedFrom = v;
      }
      var backup = grab();
      try { o.deserialize(JSON.parse(JSON.stringify(data)), inf); }
      catch (x) {
        warnOnce('des', 'deserialize() threw: ' + x + ' (state restored from before the load)');
        if (!backup.error) { try { o.deserialize(backup.data, { slot: null, restore: true, version: VER, summary: {} }); } catch (y) { } }
        dbg({ event: 'load', slot: slot, ok: false, error: 'deserialize failed' });
        return result(action, slot, false, { error: 'deserialize failed' });
      }
      var equal = null, diff = null;
      if (P('verify') === 'on') {
        var after = grab();
        if (!after.error) { equal = canon(after.data) === canon(data); if (!equal) { diff = firstDiff(data, after.data); warnOnce('rt', 'after deserialize(), serialize() differs from the loaded data at ' + diff + ': part of the state is not restored (or not saved).'); } }
      }
      dbg({ event: 'load', slot: slot, ok: true, equal: equal, diff: diff, migratedFrom: inf.migratedFrom || null });
      return result(action, slot, true, { roundTrip: equal, diff: diff, migratedFrom: inf.migratedFrom || null, summary: inf.summary });
    }
    function remove(slot) {
      slot = slotId(slot); if (slot == null) return result('delete', slot, false, { error: 'bad slot' });
      sDel(slotKey(slot)); dbg({ event: 'delete', slot: slot });
      return result('delete', slot, true);
    }
    function autosave(opt) {
      if (!autoOn()) return null;
      if (FROZEN && !(opt && opt.force)) return null;                     // screenshot pages never write
      if (!(opt && opt.force) && clock - lastAuto < P('autosaveGap') * 1000) return null;
      if (C || canSaveNow() !== true) { autoPending = true; dbg({ event: 'autosave', ok: false, queued: true }); return { action: 'save', slot: 'auto', ok: false, queued: true }; }   // written at the next step where canSave() is true
      autoPending = false;
      var r = save('auto', opt); if (r.ok) { lastAuto = clock; badgeT = 0; }
      dbg({ event: 'autosave', ok: r.ok, error: r.error || null });
      return r;
    }
    var autoPending = false;
    function exportCode(slot) {
      slot = slotId(slot); var raw = slot == null ? null : sGet(slotKey(slot)), p = parse(raw);
      if (!p.env) return null;
      var code = b64enc(JSON.stringify(p.env)); if (!code) return null;
      lastCodeStr = PREFIX + code; return lastCodeStr;
    }
    function decodeCode(code) {
      var s = String(code == null ? '' : code).replace(/\s+/g, '');
      if (s.indexOf(PREFIX) !== 0) return { error: 'not a save code' };
      var js = b64dec(s.slice(PREFIX.length)); if (js == null) return { error: 'not a save code' };
      var p = parse(js); if (!p.env) return { error: p.status === 'damaged' ? 'code damaged' : 'not a save code' };
      if (p.env.k !== KEY) return { error: 'code from another game' };
      if (p.status === 'newer') return { error: 'newer version' };
      return { env: p.env, str: js };
    }
    function importCode(code, slot) {
      slot = slotId(slot); if (slot == null || slot === 'auto') return result('import', slot, false, { error: 'bad slot' });
      var d = decodeCode(code); if (d.error) return result('import', slot, false, { error: d.error });
      var where = sSet(slotKey(slot), d.str); dbg({ event: 'write', slot: slot, ok: true, stored: where, bytes: d.str.length, imported: true });
      return result('import', slot, true, { stored: where });
    }
    function boot() {
      var r = null, ls = qget('loadSlot');
      if (ls != null) { r = load(slotId(ls) || ls); if (!r.ok) warnOnce('boot', 'loadSlot=' + ls + ' failed: ' + r.error); }
      var os = qget('openSlots'); if (os) open(os === 'load' || os === 'save' ? os : 'both');
      return r;
    }
    var prevSnap = null;
    function selfTest() {
      // 1. serialize -> write -> read -> verify checksum. 2. When an earlier snapshot exists (the previous selfTest), load IT and check that
      // serialize() now returns it (catches fields deserialize() ignores). 3. Load the current state back and check again. The game ends
      // where it started when deserialize() is complete.
      if (C) return { skipped: 'screen open' };
      var cs = canSaveNow(); if (cs !== true) return { skipped: cs };
      var g = grab(); if (g.error) return { ok: false, error: g.error };
      var env = build(g.data, cleanSummary(safe(o.summary)), null), str = JSON.stringify(env), k = slotKey('probe');
      var stored = sSet(k, str), back = sGet(k), p = parse(back); sDel(k); delete MEM[k];
      if (p.status !== 'ok') return { ok: false, stored: stored, error: 'read back ' + p.status };
      var prev = null, cur = p.env.d;
      if (prevSnap && canon(prevSnap) !== canon(cur)) {
        prev = applyData(prevSnap, VER, { slot: 'probe', version: VER, summary: {}, test: true }, 'selftest', 'probe');
        if (!prev.ok) return { ok: false, stored: stored, error: 'loading the earlier snapshot: ' + prev.error };
      }
      var r = applyData(cur, VER, { slot: 'probe', version: VER, summary: env.s, test: true }, 'selftest', 'probe');
      prevSnap = cur;
      var eq = r.roundTrip !== false && (!prev || prev.roundTrip !== false);
      return { ok: r.ok && eq, equal: r.roundTrip, equalPrev: prev ? prev.roundTrip : null, diff: (prev && prev.diff) || r.diff || null, stored: stored, bytes: str.length, error: r.error || null };
    }

    /* ---------- the slot screen ---------- */
    var C = null;   // the open screen (null when closed)
    function open(m, so) {
      so = so || {};
      if (C) return false;
      m = m === 'save' || m === 'load' ? m : 'both';
      var a = so.auto != null ? so.auto : typeof o.autoplay === 'function' ? safe(o.autoplay) : o.autoplay;
      C = { mode: m, so: so, stage: 'intro', t: 0, row: 0, act: 0, conf: 0, acts: [], q: [], held: null, msg: null, closing: -1, flash: null, develop: null,
        thumb: P('thumb') === 'on' && m !== 'load' ? thumbFrom() : null, auto: a ? (typeof a === 'string' ? a : P('autoAction')) : null, at: 0, results: [] };
      refresh();
      C.row = defaultRow();
      dbg({ event: 'open', mode: m, auto: C.auto });
      safe(o.onOpen, m);
      return true;
    }
    function refresh() { if (C) C.rows = list(); }
    function defaultRow() {
      var R = C.rows, best = -1, bestT = -1;
      if (C.mode === 'save' || (C.mode === 'both' && canSaveNow() === true)) { for (var i = 0; i < R.length; i++) if (R[i].slot !== 'auto') return i; return 0; }   // saving: the first manual slot
      for (var j = 0; j < R.length; j++) if (R[j].loadable) { var t = num(R[j].summary && R[j].summary.time, 0); if (best < 0) { best = j; bestT = t; } }
      return best >= 0 ? best : Math.min(R.length - 1, autoOn() ? 1 : 0);
    }
    function actionsFor(r) {
      var A = [], canS = r.slot !== 'auto' && C.mode !== 'load', cs = canS ? canSaveNow() : null;
      if (canS) A.push({ id: 'save', label: 'SAVE', off: cs !== true ? cs : null });
      if (C.mode !== 'save' && r.loadable) A.push({ id: 'load', label: 'LOAD' });
      if (P('codes') === 'on' && r.loadable) A.push({ id: 'copy', label: 'COPY CODE' });
      if (P('codes') === 'on' && r.slot !== 'auto') A.push({ id: 'paste', label: 'PASTE CODE' });
      if (!r.empty) A.push({ id: 'delete', label: 'DELETE' });
      return A;
    }
    function toast(text, kind) { if (C) C.msg = { text: String(text).toUpperCase(), kind: kind || 'info', t: 0 }; }
    function errText(e) { return ({ 'empty': 'SLOT IS EMPTY', 'damaged': 'DAMAGED DATA', 'newer version': 'SAVED BY A NEWER VERSION', 'migrate failed': 'COULD NOT UPDATE OLD SAVE',
      'deserialize failed': 'COULD NOT LOAD', 'serialize failed': 'COULD NOT SAVE', 'not a save code': 'CODE NOT VALID', 'code damaged': 'CODE DAMAGED',
      'code from another game': 'CODE FROM ANOTHER GAME', 'old version, no migrate()': 'OLD VERSION' })[e] || String(e || 'FAILED').toUpperCase(); }
    function needsConfirm(id, r) { if (P('confirm') !== 'on') return false; return id === 'delete' || (id === 'save' && !r.empty) || (id === 'paste' && !r.empty) || (id === 'load' && C.mode === 'both'); }
    function confirmText(id, r) { return id === 'delete' ? 'DELETE ' + slotName(r.slot) + '?' : id === 'load' ? 'LOAD ' + slotName(r.slot) + '?' : 'OVERWRITE ' + slotName(r.slot) + '?'; }
    function choose(id) {
      var r = C.rows[C.row]; if (!r) return;
      var a = C.acts.filter(function (x) { return x.id === id; })[0];
      if (a && a.off) { toast(a.off, 'bad'); C.stage = 'list'; return; }
      if (needsConfirm(id, r)) { C.pending = id; C.conf = 0; C.stage = 'confirm'; return; }
      perform(id, r);
    }
    function perform(id, r) {
      var res, s = r.slot;
      C.stage = 'list';
      if (id === 'save') {
        res = save(s, { thumb: P('thumb') === 'on' ? C.thumb : null }); C.results.push(res); refresh();
        if (res.ok) { C.flash = { row: C.row, t: 0 }; C.develop = { row: C.row, t: 0 }; toast(res.stored === 'memory' ? 'SAVED - THIS SESSION ONLY' : 'SAVED TO ' + slotName(s), 'good'); if (P('closeAfterSave') === 'on') C.closing = 700; }
        else toast(errText(res.error), 'bad');
      } else if (id === 'load') {
        res = load(s); C.results.push(res);
        if (res.ok) { C.flash = { row: C.row, t: 0 }; toast('LOADED ' + slotName(s), 'good'); C.closing = 320; C.loaded = true; }
        else { refresh(); toast(errText(res.error), 'bad'); }
      } else if (id === 'delete') {
        res = remove(s); C.results.push(res); refresh(); toast('DELETED', 'info');
      } else if (id === 'copy') {
        var code = exportCode(s); res = result('export', s, !!code, code ? { code: code } : { error: 'nothing to copy' }); C.results.push(res);
        if (code) {
          var shown = false;
          if (typeof o.exportText === 'function') { safe(o.exportText, code, s); shown = true; }
          else { try { if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) { root.navigator.clipboard.writeText(code).then(null, function () { }); shown = true; } } catch (e) { } }
          if (!shown) { try { root.prompt && root.prompt('Copy this save code:', code); } catch (e) { } }
          toast('CODE COPIED', 'good');
        } else toast('NOTHING TO COPY', 'bad');
      } else if (id === 'paste') {
        var txt = null;
        if (typeof o.importText === 'function') txt = safe(o.importText, s); else { try { txt = root.prompt ? root.prompt('Paste a save code:') : null; } catch (e) { txt = null; } }
        if (txt == null || txt === '') { toast('NO CODE', 'info'); return; }
        res = importCode(txt, s); C.results.push(res); refresh();
        if (res.ok) { C.flash = { row: C.row, t: 0 }; toast('IMPORTED TO ' + slotName(s), 'good'); } else toast(errText(res.error), 'bad');
      }
    }
    function close(quiet) {
      if (!C) return false;
      if (C.stage === 'outro') return true;
      C.stage = 'outro'; C.t = 0; C.quiet = !!quiet; return true;
    }
    function finish() {
      var s = C, rs = s.results, lastOk = null;
      for (var i = rs.length - 1; i >= 0; i--) if (rs[i].ok && (rs[i].action === 'load' || rs[i].action === 'save')) { lastOk = rs[i]; break; }
      var res = { action: s.loaded ? 'load' : lastOk ? lastOk.action : 'close', slot: lastOk ? lastOk.slot : null, ok: true, loaded: !!s.loaded,
        saved: rs.some(function (r) { return r.action === 'save' && r.ok; }), results: rs.slice(), auto: !!s.auto };
      C = null; last = res;
      dbg({ event: 'close', action: res.action, slot: res.slot });
      safe(s.so.onDone, res); safe(o.onDone, res); safe(o.onClose, res);
    }
    function input(name) {
      if (!C || C.auto) return false;
      if (name) C.q.push(name);
      return true;
    }
    function move(d) {
      if (C.stage === 'list') { var n = C.rows.length; C.row = (C.row + d + n) % n; }
      else if (C.stage === 'actions') { var m = C.acts.length; C.act = (C.act + d + m) % m; }
    }
    function handle(name) {
      var st = C.stage;
      if (st === 'intro' || st === 'outro') return;
      if (st === 'list') {
        if (name === 'up') move(-1); else if (name === 'down') move(1);
        else if (name === 'ok') { var r = C.rows[C.row]; C.acts = actionsFor(r); if (!C.acts.length) { toast('EMPTY SLOT', 'info'); return; } C.act = 0; C.stage = 'actions'; }
        else if (name === 'back') close();
      } else if (st === 'actions') {
        if (name === 'up') move(-1); else if (name === 'down') move(1);
        else if (name === 'ok') choose(C.acts[C.act].id);
        else if (name === 'back') C.stage = 'list';
      } else if (st === 'confirm') {
        if (name === 'left' || name === 'right' || name === 'up' || name === 'down') C.conf = 1 - C.conf;
        else if (name === 'ok') { if (C.conf === 1) perform(C.pending, C.rows[C.row]); else C.stage = 'actions'; }
        else if (name === 'back') C.stage = 'actions';
      }
    }
    function autoStep() {   // autoplay: a fixed, short script so ?auto=1 runs never wait on the screen
      if (C.stage !== 'list' || C.closing >= 0) return;
      C.at += 1; if (C.at < 18) return;
      var a = C.auto;
      if (a === 'save' || a === 'load') {
        var s = slotId(P('autoSlot')) || 1, idx = -1;
        for (var i = 0; i < C.rows.length; i++) if (C.rows[i].slot === s) idx = i;
        if (idx >= 0) { C.row = idx; var r = C.rows[idx]; if (a === 'save' && canSaveNow() === true && C.mode !== 'load') { perform('save', r); if (C.closing < 0) C.closing = 400; return; } if (a === 'load' && r.loadable && C.mode !== 'save') { perform('load', r); return; } }
      }
      close();
    }
    function update(dt) {
      try {
        dt = num(dt, 0); if (dt < 0) dt = 0; if (dt > 250) dt = 250;
        clock += dt;
        if (badgeT >= 0) { badgeT += dt; if (badgeT > 1400) badgeT = -1; }
        if (autoPending && !C && canSaveNow() === true) autosave({ force: FROZEN ? false : true });
        if (saveAt != null && !saveAtDone && clock >= saveAt && !C) {    // test hook: ?saveAt=<ms>&saveSlot=<n> saves once, at a step boundary, when allowed
          if (canSaveNow() === true) { var rr = save(saveSlot); saveAtDone = true; dbg({ event: 'saveAt', slot: saveSlot, ok: rr.ok, ms: clock }); }
        }
        var s = C; if (!s) return;
        s.t += dt;
        if (s.msg) { s.msg.t += dt; if (s.msg.t > TOAST && s.closing < 0) s.msg = null; }
        if (s.flash) { s.flash.t += dt; if (s.flash.t > 200) s.flash = null; }
        if (s.develop) { s.develop.t += dt; if (s.develop.t > 480) s.develop = null; }
        if (s.stage === 'intro') { s.q = []; if (s.t >= Math.max(INTRO, ARM)) { s.stage = 'list'; s.t = 0; } return; }
        if (s.stage === 'outro') { s.q = []; if (s.t >= OUTRO) finish(); return; }
        if (s.closing >= 0) { s.q = []; s.closing -= dt; if (s.closing <= 0) { s.closing = -1; close(); } return; }
        if (s.auto) { autoStep(); return; }
        if (s.held) { s.held.t += dt; if (s.held.t >= REPEAT0) { s.held.t -= REPEAT; s.q.push(s.held.name); } }
        var q = s.q; s.q = [];
        for (var i = 0; i < q.length && C === s && s.stage !== 'outro' && s.closing < 0; i++) handle(q[i]);
      } catch (e) { warnOnce('update', 'update failed: ' + e); }
    }
    function key(code, down) {
      code = String(code == null ? '' : code); var name = KEYS[code];
      if (!C) return false;
      if (!name) return false;
      if (down) {
        if (C.held && C.held.code === code) return true;            // key repeat from the OS: ignored (the module repeats arrows itself)
        input(name);
        C.held = name === 'up' || name === 'down' || name === 'left' || name === 'right' ? { code: code, name: name, t: 0 } : null;
      } else if (C.held && C.held.code === code) C.held = null;
      return true;
    }
    function tap(x, y) {
      if (!C) return false; if (C.auto) return true;
      var p = { x: num(x, -1), y: num(y, -1) }, L = C.layout; if (!L || C.stage === 'intro' || C.stage === 'outro' || C.closing >= 0) return true;
      if (C.stage === 'confirm' && L.conf) { if (inside(p, L.conf.yes)) { C.conf = 1; C.q.push('ok'); } else if (inside(p, L.conf.no)) { C.conf = 0; C.q.push('ok'); } else if (!inside(p, L.conf.box)) C.q.push('back'); return true; }
      if (C.stage === 'actions' && L.acts) { for (var i = 0; i < L.acts.items.length; i++) if (inside(p, L.acts.items[i])) { C.act = i; C.q.push('ok'); return true; } if (!inside(p, L.acts.box)) C.stage = 'list'; else return true; }
      for (var j = 0; j < L.rows.length; j++) if (inside(p, L.rows[j])) { if (C.row === j || C.stage === 'list') { C.row = j; if (C.stage === 'list') C.q.push('ok'); } return true; }
      if (!inside(p, L.panel)) C.q.push('back');
      return true;
    }

    /* ---------- drawing ---------- */
    var pixel = !SK || SK.pixel !== false;
    function tok(p, d) { if (!SK) return d; try { var v = SK.token(p); return typeof v === 'string' && v !== p ? v : d; } catch (e) { return d; } }
    function bitmapUI() { if (!SK) return GL; try { var f = SK.fonts && SK.fonts.ui; return f && f.type === 'bitmap' && f.glyphs ? f.glyphs : null; } catch (e) { return null; } }
    var GLY = bitmapUI();
    function clean(s) {       // keep text drawable by a bitmap ui font: upper case, unknown characters dropped
      s = String(s == null ? '' : s); if (!GLY) return s;
      s = s.toUpperCase().replace(/[:;,_|]/g, ' ').replace(/!/g, '.');
      var out = ''; for (var i = 0; i < s.length; i++) out += GLY[s[i]] || s[i] === ' ' ? s[i] : '';
      return out.replace(/\s+/g, ' ');
    }
    function measure(s) { s = String(s); if (!SK) return s.length * 6 - 1; try { return SK.measure(s, { font: 'ui' }); } catch (e) { return s.length * 6 - 1; } }
    function fbText(g, s, x, y, c1, c2) {
      for (var pass = 0; pass < 2; pass++) {
        var cx = x, str = String(s).toUpperCase();
        for (var i = 0; i < str.length; i++) {
          var rows = (GL[str[i]] || GL['?']).split(',');
          for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < rows[ry].length; rx++) if (rows[ry][rx] === '1') {
            g.fillStyle = pass ? (ry < 4 ? c1 : c2) : FB.shadow; g.fillRect(cx + rx + (pass ? 0 : 1), y + ry + (pass ? 0 : 1), 1, 1);
          }
          cx += str[i] === ' ' ? 4 : 6;
        }
      }
    }
    var ROLE = { main: ['text.main', 'text.main2', FB.main, FB.main2], dim: ['text.dim', 'text.dim2', FB.dim, FB.dim2], title: ['text.title', 'text.title2', FB.title, FB.title2],
      accent: ['text.accent', 'text.accent', FB.accent, FB.title2], bad: ['fx.hot', 'fx.hot', FB.hot, '#d04a2a'], good: ['fx.heal', 'fx.heal', FB.heal, '#2a9a4a'], info: ['text.label', 'text.label2', '#b8d0ff', '#8ca8e8'] };
    function text(g, s, x, y, role, align, maxW) {
      s = clean(s); if (!s) return 0;
      if (maxW > 0 && measure(s) > maxW) { while (s.length > 1 && measure(s + '.') > maxW) s = s.slice(0, -1); s = s.replace(/\s+$/, '') + '.'; }
      var w = measure(s), c = ROLE[role] || ROLE.main;
      if (align === 'right') x -= w; else if (align === 'center') x -= Math.floor(w / 2);
      if (!SK) { fbText(g, s, x, y, c[2], c[3]); return w; }
      try { SK.text(g, s, x, y, { font: 'ui', color: tok(c[0], c[2]), color2: tok(c[1], c[3]) }); } catch (e) { fbText(g, s, x, y, c[2], c[3]); }
      return w;
    }
    function fbFrame(g, r, alpha) {
      var x = r.x, y = r.y, w = r.w, h = r.h, C6 = FB.win, i, pa = g.globalAlpha;
      g.globalAlpha = pa * 0.95 * (alpha == null ? 1 : alpha);
      for (i = 0; i < h - 2; i++) { g.fillStyle = C6[Math.min(3, Math.floor(i / (h - 2) * 4))]; g.fillRect(x + 1, y + 1 + i, w - 2, 1); }
      g.globalAlpha = pa * (alpha == null ? 1 : alpha); g.fillStyle = FB.ink;
      g.fillRect(x + 2, y, w - 4, 1); g.fillRect(x + 2, y + h - 1, w - 4, 1); g.fillRect(x, y + 2, 1, h - 4); g.fillRect(x + w - 1, y + 2, 1, h - 4);
      g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + w - 2, y + 1, 1, 1); g.fillRect(x + 1, y + h - 2, 1, 1); g.fillRect(x + w - 2, y + h - 2, 1, 1);
      g.fillStyle = C6[4]; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 5);
      g.fillStyle = C6[5]; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
      [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]].forEach(function (p) { g.fillStyle = FB.rivetShade; g.fillRect(p[0], p[1], 2, 2); g.fillStyle = FB.rivet; g.fillRect(p[0], p[1], 1, 1); });
      g.globalAlpha = pa;
    }
    function frame(g, r, alpha) {
      if (pixel) { g.fillStyle = tok('ui.fillTo', FB.win[3]); g.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); }   // opaque under-fill: the game never shows through a window
      if (SK) { try { SK.frame(g, r, { role: 'window', team: 'n', alpha: alpha }); return; } catch (e) { } } fbFrame(g, r, alpha); }
    function band(g, r, role) {
      if (SK) { try { SK.frame(g, r, { role: role, focus: role === 'row' }); return; } catch (e) { } }
      g.fillStyle = role === 'row' ? FB.select : FB.well; g.fillRect(r.x, r.y, r.w, r.h);
    }
    function handW() { return SK ? Math.max(3, Math.round(num(SK.layout && SK.layout.handW, 7))) : 7; }
    function handH() { return SK ? Math.max(3, Math.min(7, Math.round(num(SK.layout && SK.layout.handH, 5)))) : 5; }
    function gap() { return SK ? Math.max(1, Math.round(num(SK.layout && SK.layout.pointerGap, 5))) : 5; }
    function hand(g, x, yMid, t) {
      var hw = handW(), hh = handH(), y = Math.round(yMid - hh / 2);
      if (SK) { try { SK.cursor(g, { x: x, y: y, w: hw, h: hh }, 'hand', t, {}); return; } catch (e) { } }
      var hx = x + (Math.floor(t * 4) % 2);
      HAND.forEach(function (row, yy) { for (var xx = 0; xx < 7; xx++) if (row[xx] !== '.') { g.fillStyle = row[xx] === 'o' ? FB.pointerEdge : FB.pointer; g.fillRect(hx + xx, y + yy, 1, 1); } });
    }
    function stepA(a) { if (!pixel) return clamp(a, 0, 1); var S = [1, 0.75, 0.5, 0.25]; for (var i = 0; i < S.length; i++) if (a >= S[i] - 1e-9) return S[i]; return 0; }
    function field() {
      var b = typeof o.bounds === 'function' ? safe(o.bounds) : o.bounds;
      if (b && b.w > 0 && b.h > 0) return { x: num(b.x, 0), y: num(b.y, 0), w: b.w, h: b.h };
      if (o.view && o.view.w > 0) return { x: 0, y: 0, w: o.view.w, h: o.view.h };
      if (lastCanvas) { var s = 1; try { s = API && API.scaleOf && SK && !pixel ? API.scaleOf(lastCanvas.getContext('2d')) || 1 : 1; } catch (e) { } return { x: 0, y: 0, w: Math.round(lastCanvas.width / s), h: Math.round(lastCanvas.height / s) }; }
      return null;
    }
    function layout(f) {
      var n = C.rows.length, pw = Math.min(f.w - 8, 248), headH = 20, footH = 15;
      var avail = Math.min(f.h - 8, 216) - headH - footH - 4, rh = clamp(Math.floor((avail - (n - 1) * 2) / n), 11, 42);
      var ph = headH + footH + 4 + n * rh + (n - 1) * 2, px = f.x + Math.round((f.w - pw) / 2), py = f.y + Math.round((f.h - ph) / 2);
      var L = { panel: { x: px, y: py, w: pw, h: ph }, rows: [], rh: rh };
      for (var i = 0; i < n; i++) L.rows.push({ x: px + 5, y: py + headH + 2 + i * (rh + 2), w: pw - 10, h: rh });
      return L;
    }
    function drawThumb(g, r, x, y, w, h, t, i) {
      var ink = tok('ink', FB.ink);
      g.fillStyle = ink; g.fillRect(x - 1, y - 1, w + 2, h + 2);
      if (r.damaged) {   // static: deterministic noise on the module clock
        var fr = Math.floor(clock / 120);
        for (var yy = 0; yy < h; yy += 2) for (var xx = 0; xx < w; xx += 2) { var v = hash3(xx + i * 97, yy, fr); g.fillStyle = v < 0.45 ? '#1a1424' : v < 0.8 ? '#4a3a5a' : v < 0.95 ? '#8a7a9a' : '#d04a3a'; g.fillRect(x + xx, y + yy, Math.min(2, w - xx), Math.min(2, h - yy)); }
        g.fillStyle = tok('fx.hot', FB.hot); var cy = y + Math.floor(h / 2); g.fillRect(x, cy - 1, w, 1); g.fillRect(x + 2, cy + 2, w - 4, 1);
        return;
      }
      var T = r.thumb ? thumbImage(r.thumb) : null;
      if (T) {
        var pi = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
        g.drawImage(T.img, 0, 0, T.w, T.h, x, y, w, h); g.imageSmoothingEnabled = pi;
        if (r.status === 'newer' || r.status === 'stale') { g.globalAlpha = 0.55; g.fillStyle = ink; g.fillRect(x, y, w, h); g.globalAlpha = 1; }
        if (C.develop && C.develop.row === i) { var a = stepA(1 - C.develop.t / 480); if (a > 0) { g.globalAlpha = a; g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h); g.globalAlpha = 1; } }
        return;
      }
      band(g, { x: x, y: y, w: w, h: h }, 'backing');
      g.fillStyle = tok('text.dim2', FB.dim2);
      if (r.empty) { for (var d = 0; d < w + h; d += 6) for (var k = 0; k < 3; k++) { var px = x + d - k, py = y + h - 1 - k; for (var s2 = 0; s2 < h; s2++) { var X = px - s2, Y = py - s2; if (X >= x && X < x + w && Y >= y && Y < y + h && s2 % 3 === 0) g.fillRect(X, Y, 1, 1); } } }
      else { var cx = x + Math.floor(w / 2), cy2 = y + Math.floor(h / 2); g.fillRect(cx - 4, cy2, 9, 1); g.fillRect(cx, cy2 - 4, 1, 9); }
    }
    function thumbBox(rh) {   // every row's picture box: the stored thumbnail size (1:1, crisp) when it fits the row, else scaled down
      var tr = typeof o.thumbRect === 'function' ? safe(o.thumbRect) : o.thumbRect, f = field(), asp = tr && tr.w > 0 && tr.h > 0 ? tr.w / tr.h : f ? f.w / f.h : 8 / 7;
      var tw = clamp(Math.round(P('thumbW')), 8, 96), th = clamp(Math.round(tw / asp), 6, 96), maxH = rh - 4;
      if (th > maxH) { th = maxH; tw = Math.round(th * asp); }
      return { w: tw, h: th };
    }
    function drawRow(g, r, R, i, sel, t) {
      if (sel) band(g, R, 'row');
      if (C.flash && C.flash.row === i && Math.floor(C.flash.t / 50) % 2 === 0) { g.globalAlpha = 0.35; g.fillStyle = '#ffffff'; g.fillRect(R.x, R.y, R.w, R.h); g.globalAlpha = 1; }
      var hw = handW(), x0 = R.x + hw + gap() + 2, rh = R.h;
      if (sel && C.stage !== 'outro') hand(g, R.x + 1, R.y + Math.floor(rh / 2), C.stage === 'list' ? clock / 1000 : 0);
      var showT = P('thumb') === 'on' && rh >= 22, tx = x0;
      if (showT) { var bx = thumbBox(rh); drawThumb(g, r, x0 + 1, R.y + Math.floor((rh - bx.h) / 2), bx.w, bx.h, t, i); tx = x0 + bx.w + 7; }
      var maxW = R.x + R.w - 4 - tx, lines = rh >= 30 ? 3 : rh >= 20 ? 2 : 1, ly = lines === 3 ? [4, 15, 26] : lines === 2 ? [3, 12] : [Math.floor((rh - 7) / 2)];
      var y = function (k) { return R.y + ly[k] + (lines === 3 ? Math.floor((rh - 37) / 2) : 0); };
      var S = r.summary || {}, timeS = S.time != null ? fmtTime(S.time) : '';
      var tw2 = timeS && r.status !== 'damaged' ? measure(clean(timeS)) + 6 : 0;
      text(g, slotName(r.slot), tx, y(0), sel ? 'title' : 'accent', 'left', maxW - tw2);
      if (tw2) text(g, timeS, R.x + R.w - 4, y(0), 'main', 'right');
      var l2 = null, l2r = 'main', l3 = null, l3r = 'info';
      if (r.empty) { l2 = '- EMPTY -'; l2r = 'dim'; }
      else if (r.damaged) { l2 = 'DAMAGED DATA'; l2r = 'bad'; l3 = 'DELETE OR OVERWRITE'; }
      else {
        l2 = S.place || '-';
        var lv = S.level != null ? (typeof S.level === 'number' ? 'LV ' + S.level : String(S.level)) : '';
        l3 = [lv, S.note || ''].filter(Boolean).join('  ');
        if (r.status === 'newer') { l3 = 'SAVED BY A NEWER VERSION'; l3r = 'bad'; }
        else if (r.status === 'stale') { l3 = 'OLD VERSION ' + r.version; l3r = 'bad'; }
        else if (r.status === 'old') l3 = (l3 ? l3 + '  ' : '') + 'V' + r.version;
      }
      if (lines === 1) { if (r.empty || r.damaged) text(g, l2, R.x + R.w - 4, y(0), l2r, 'right'); return; }
      text(g, l2, tx, y(1), l2r, 'left', maxW);
      if (lines === 3 && l3) text(g, l3, tx, y(2), l3r, 'left', maxW);
    }
    function draw(ctx, ox, oy) {
      drawn = [];
      if (!ctx) return;
      try { if (ctx.canvas) lastCanvas = ctx.canvas; } catch (e) { }
      if (!C && badgeT < 0) return;
      ox = num(ox, 0); oy = num(oy, 0);
      ctx.save();
      try { ctx.imageSmoothingEnabled = false; if (ox || oy) ctx.translate(ox, oy); if (C) paint(ctx); else if (P('badge') === 'on') paintBadge(ctx); }
      catch (e) { warnOnce('draw', 'draw failed: ' + e); }
      ctx.restore();
    }
    function paintBadge(g) {
      var f = field(); if (!f) return;
      var a = stepA(badgeT < 900 ? 1 : 1 - (badgeT - 900) / 500); if (a <= 0) return;
      var s = 'SAVED', w = measure(s) + 18, h = 13, x = f.x + f.w - w - 4, y = f.y + f.h - h - 4;
      g.globalAlpha = a; band(g, { x: x, y: y, w: w, h: h }, 'backing');
      var k = Math.floor(badgeT / 90) % 4, cx = x + 6, cy = y + 6, gem = tok('fx.cold', FB.cold);   // a turning gem
      var wd = [3, 2, 1, 2][k];
      g.fillStyle = tok('ink', FB.ink); g.fillRect(cx - wd - 1, cy - 4, wd * 2 + 3, 9);
      g.fillStyle = gem; for (var i = -3; i <= 3; i++) { var hw2 = Math.max(0, Math.round(wd * (1 - Math.abs(i) / 4))); g.fillRect(cx - hw2, cy + i, hw2 * 2 + 1, 1); }
      g.fillStyle = '#ffffff'; g.fillRect(cx, cy - 2, 1, 1);
      text(g, s, x + 13, y + 3, 'main', 'left'); g.globalAlpha = 1;
      drawn.push({ kind: 'badge', x: x, y: y, w: w, h: h });
    }
    function paint(g) {
      var f = field(); if (!f) return;
      var st = C.stage, open = 1;
      if (st === 'intro') open = clamp(C.t / INTRO, 0, 1);
      if (st === 'outro') open = 1 - clamp(C.t / OUTRO, 0, 1);
      if (pixel) open = Math.round(open * 4) / 4;
      if (P('dim') > 0 && open > 0) { g.globalAlpha = P('dim') * open; g.fillStyle = tok('ink', FB.ink); g.fillRect(f.x, f.y, f.w, f.h); g.globalAlpha = 1; }
      if (open <= 0) return;
      var L = layout(f), B = L.panel; C.layout = L;
      var ph = Math.max(6, Math.round(B.h * open)), pr = { x: B.x, y: B.y + Math.round((B.h - ph) / 2), w: B.w, h: ph };
      frame(g, pr);
      drawn.push({ kind: 'panel', x: B.x, y: B.y, w: B.w, h: B.h });
      if (open < 1) return;
      var t = clock / 1000;
      // header: title, storage note
      var ttl = C.so.title || P('title') || (C.mode === 'save' ? 'SAVE GAME' : C.mode === 'load' ? 'LOAD GAME' : 'SAVE / LOAD');
      text(g, ttl, B.x + 9, B.y + 7, 'title', 'left');
      if (mode === 'memory') text(g, 'THIS SESSION ONLY', B.x + B.w - 9, B.y + 7, 'bad', 'right');
      else text(g, 'V' + VER, B.x + B.w - 9, B.y + 7, 'dim', 'right');
      g.fillStyle = tok('ui.shadow', FB.win[5]); g.fillRect(B.x + 5, B.y + 18, B.w - 10, 1);
      g.fillStyle = tok('ui.highlight', FB.win[4]); g.globalAlpha = 0.35; g.fillRect(B.x + 5, B.y + 19, B.w - 10, 1); g.globalAlpha = 1;
      // rows
      for (var i = 0; i < C.rows.length; i++) drawRow(g, C.rows[i], L.rows[i], i, i === C.row, t);
      // footer: toast or hint
      var fy = B.y + B.h - 12;
      if (C.msg) { var m = C.msg, ma = m.t > TOAST - 200 && C.closing < 0 ? stepA(1 - (m.t - (TOAST - 200)) / 200) : 1; g.globalAlpha = ma; text(g, m.text, B.x + Math.floor(B.w / 2), fy, m.kind === 'bad' ? 'bad' : m.kind === 'good' ? 'good' : 'info', 'center', B.w - 16); g.globalAlpha = 1; }
      else if (C.auto) text(g, 'AUTOPLAY', B.x + Math.floor(B.w / 2), fy, 'dim', 'center');
      else text(g, C.stage === 'confirm' ? 'Z CONFIRM   X BACK' : 'Z SELECT   X BACK', B.x + Math.floor(B.w / 2), fy, 'dim', 'center');
      L.acts = null; L.conf = null;
      if (C.stage === 'actions') paintActions(g, L, t);
      if (C.stage === 'confirm') {   // the question replaces the action menu (it names the action); the other rows step back so the box never cuts live text
        var cr = L.rows[C.row], ix = B.x + 3, iw = B.w - 6, top = B.y + 21, bot = B.y + B.h - 14;
        g.fillStyle = '#000000'; g.globalAlpha = 0.4;
        if (cr) { if (cr.y > top) g.fillRect(ix, top, iw, cr.y - top); if (cr.y + cr.h < bot) g.fillRect(ix, cr.y + cr.h, iw, bot - cr.y - cr.h); }
        else g.fillRect(ix, top, iw, bot - top);
        g.globalAlpha = 1;
        paintConfirm(g, L, t);
      }
    }
    function paintActions(g, L, t) {
      var R = L.rows[C.row], A = C.acts; if (!R || !A.length) return;
      var lw = 0; A.forEach(function (a) { lw = Math.max(lw, measure(clean(a.label))); });
      var hw = handW() + gap(), w = lw + hw + 14, ih = 11, h = A.length * ih + 10, B = L.panel;
      var x = B.x + B.w - w - 8, y = clamp(R.y + Math.floor(R.h / 2) - 6, B.y + 21, B.y + B.h - h - 4);
      frame(g, { x: x, y: y, w: w, h: h });
      var items = [];
      A.forEach(function (a, i) {
        var iy = y + 5 + i * ih, it = { x: x + 3, y: iy, w: w - 6, h: ih };
        items.push(it);
        if (i === C.act && C.stage === 'actions') { band(g, { x: x + 4, y: iy, w: w - 8, h: ih - 1 }, 'row'); hand(g, x + 5, iy + 5, t); }
        text(g, a.label, x + 5 + hw, iy + 2, a.off ? 'dim' : i === C.act ? 'title' : 'main', 'left');
      });
      L.acts = { box: { x: x, y: y, w: w, h: h }, items: items };
      drawn.push({ kind: 'actions', x: x, y: y, w: w, h: h });
    }
    function paintConfirm(g, L, t) {
      var q = confirmText(C.pending, C.rows[C.row]), B = L.panel, hw = handW() + gap();
      var w = Math.max(measure(clean(q)) + 20, 112), h = 34, x = B.x + Math.round((B.w - w) / 2), R = L.rows[C.row];
      var y = R.y + R.h + 2 + h <= B.y + B.h - 2 ? R.y + R.h + 2 : R.y - h - 2;   // beside the row it asks about, never over it
      y = clamp(y, B.y + 2, B.y + B.h - h - 2);
      // cover whole neighbouring rows (below, else above), so no row is ever half hidden with its text cut
      var pitch = R.h + 2, nr = Math.ceil((h + 2) / pitch), fh = nr * pitch - 2;
      if (C.row + nr <= L.rows.length - 1) { y = R.y + pitch; h = fh; w = Math.max(w, R.w); x = B.x + Math.round((B.w - w) / 2); }
      else if (C.row - nr >= 0) { y = R.y - nr * pitch; h = fh; w = Math.max(w, R.w); x = B.x + Math.round((B.w - w) / 2); }
      var cy = y + Math.floor((h - 34) / 2);
      frame(g, { x: x, y: y, w: w, h: h });
      text(g, q, x + Math.floor(w / 2), cy + 7, C.pending === 'delete' ? 'bad' : 'title', 'center');
      var opts = ['NO', 'YES'], ow = Math.max(measure('YES'), measure('NO')) + hw + 8, gx = x + Math.round((w - ow * 2 - 8) / 2), boxes = [];
      opts.forEach(function (s, i) {
        var bx = gx + i * (ow + 8), by = cy + 19, r = { x: bx, y: by - 2, w: ow, h: 11 };
        boxes.push(r);
        if (C.conf === i) { band(g, r, 'row'); hand(g, bx + 1, by + 3, t); }
        text(g, s, bx + 1 + hw, by, C.conf === i ? 'title' : 'main', 'left');
      });
      L.conf = { box: { x: x, y: y, w: w, h: h }, no: boxes[0], yes: boxes[1] };
      drawn.push({ kind: 'confirm', x: x, y: y, w: w, h: h });
    }

    /* ---------- public ---------- */
    return {
      open: open,
      close: function () { return close(); },
      clear: function () { C = null; drawn = []; },
      busy: function () { return !!C; },
      key: key,
      press: function (name) { if (!C) return false; if (C.auto) return true; if (name && { up: 1, down: 1, left: 1, right: 1, ok: 1, back: 1 }[name]) C.q.push(name); return true; },
      tap: tap,
      update: update,
      draw: draw,
      save: function (s, opt) { return save(s, opt); },
      load: function (s) { return load(s); },
      remove: function (s) { return remove(s); },
      autosave: autosave,
      exportCode: exportCode,
      importCode: importCode,
      list: list,
      boot: boot,
      selfTest: selfTest,
      storageMode: function () { return mode; },
      canSave: function () { return canSaveNow(); },
      state: function () { return C ? { mode: C.mode, stage: C.stage, row: C.row, slot: C.rows[C.row] && C.rows[C.row].slot, actions: C.acts.map(function (a) { return a.id; }), act: C.act, confirm: C.stage === 'confirm' ? C.pending : null, auto: C.auto, message: C.msg && C.msg.text } : null; },
      rect: function () { return C && C.layout ? { x: C.layout.panel.x, y: C.layout.panel.y, w: C.layout.panel.w, h: C.layout.panel.h } : null; },
      lastDrawn: function () { return drawn.slice(); },
      lastResult: function () { return last; },
      lastAction: function () { return lastAct; },
      lastCode: function () { return lastCodeStr; },
      setParams: function (p) { setParams(p); if (C) { refresh(); C.row = clamp(C.row, 0, C.rows.length - 1); } },
      params: function () { var c = {}; for (var k in DEFAULTS) c[k] = P(k); return c; },
      storageKey: KEY, dataVersion: VER
    };
  }

  root.GameDNA_SaveSlots = { version: VERSION, DEFAULTS: DEFAULTS, create: create, formatTime: fmtTime };
})(typeof window !== 'undefined' ? window : this);
