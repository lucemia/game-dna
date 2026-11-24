/* GameDNA G-02 · Level-up stat growth · module v1 (plain script, no dependencies, one global: GameDNA_LevelUpGrowth)
 *
 *   const lv = GameDNA_LevelUpGrowth.create({
 *     view: { w: 256, h: 224 },                         // or bounds: { x, y, w, h } (play field; the windows stay inside it)
 *     skin: 'pixel16',                                  // optional; drawn through GameDNA_Skin when skin-api.js is loaded
 *     params: { base: 20, power: 1.5, maxLevel: 20, minGain: 1, seed: 1 },   // see DEFAULTS
 *     classes: { knight: { rates: { hp: { rate: 90, amount: 3 }, atk: 50, def: 40 } } },   // growth tables: percent per level
 *     stats: [{ key: 'hp', label: 'HP' }, 'atk', 'def'],      // which stats show, in this order (default: the keys in classes)
 *     units: () => [{ id: 'ana', name: 'Ana', cls: 'knight', alive: true, get: k => ana[k], set: (k, v, gain) => { ana[k] = v; } }],
 *     autoplay: () => AUTOPLAY,                          // windows advance by themselves at a fixed pace; presses are ignored
 *     uiRects: () => [hudRect],                          // optional: rects the windows never cover
 *     onDone: r => {}, onLevel: info => {}, onSfx: name => {}
 *   });
 *   lv.award(120, 45, { title: 'VICTORY', onDone: r => {} })   // EXP to every living unit + gold shown; opens the tally window
 *   lv.addExp('ana', 10)      // bank EXP quietly (per hit / kill); the next award() that includes 'ana' counts it in
 *   lv.busy()                 // true from award() until the last window has closed: route confirm here, pause the world
 *   lv.press() / lv.key(code, down)   // confirm on the key-down edge: finish the count / reveal rows, then next window
 *   lv.update(dtMs)           // the only clock (fixed step), so ?t=&freeze=1 is deterministic
 *   lv.draw(ctx)              // native-resolution 2D context, last in the draw pass
 *   lv.serialize() / lv.restore(obj)   // the EXP state (levels and EXP per unit id) as plain JSON
 *   onDone result = { exp, gold, title, units: [{ id, name, fromLevel, toLevel, expBefore, expAfter, gained, gains, values }], levelUps, skipped, auto, applied }
 *
 * Stats change ONLY through your setter (unit.set or options.setStat), inside award(), once per stat that grew.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var DEFAULTS = { base: 20, power: 1.5, maxLevel: 20, minGain: 1, seed: 1, countMs: 1500, autoMs: 900, rowMs: 160, panel: 'on',
    share: 'each', apply: 'now', autoGrowth: 'apply', tint: 'a', dim: 0.4, openMs: 100, margin: 6, width: 0, title: 'RESULTS' };
  var ACTION_KEYS = { KeyZ: 1, z: 1, Z: 1, Space: 1, ' ': 1, Enter: 1, NumpadEnter: 1 };
  var PAD = 8, LINE = 10;

  /* ---------- 6x8 proportional font (the C-03 'regular' glyphs: '#' = ink, rows top -> bottom) ---------- */
  var REGULAR = {
    '!': '# # # # # . #', '"': '#.# #.#', '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.', '%': '##... ##..# ...#. ..#.. .#... #..## ...##',
    "'": '# #', '(': '..# .#. #.. #.. #.. .#. ..#', ')': '#.. .#. ..# ..# ..# .#. #..', '*': '..... ..#.. #.#.# .###. #.#.# ..#..',
    '+': '..... ..#.. ..#.. ##### ..#.. ..#..', ',': '.. .. .. .. .. ## .# #.', '-': '.... .... .... ####', '.': '.. .. .. .. .. ## ##',
    '/': '....# ...#. ...#. ..#.. .#... .#... #....',
    '0': '.###. #...# #..## #.#.# ##..# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
    '2': '.###. #...# ....# ...#. ..#.. .#... #####', '3': '####. ....# ....# .###. ....# ....# ####.',
    '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.', '5': '##### #.... ####. ....# ....# #...# .###.',
    '6': '..##. .#... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. .#... .#... .#...',
    '8': '.###. #...# #...# .###. #...# #...# .###.', '9': '.###. #...# #...# .#### ....# ...#. .##..',
    ':': '.. ## ## .. .. ## ##', ';': '.. ## ## .. .. ## .# #.', '<': '...# ..#. .#.. #... .#.. ..#. ...#',
    '=': '.... .... #### .... ####', '>': '#... .#.. ..#. ...# ..#. .#.. #...', '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
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
    '[': '### #.. #.. #.. #.. #.. ###', ']': '### ..# ..# ..# ..# ..# ###', '_': '..... ..... ..... ..... ..... ..... ..... #####',
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
    'z': '.... .... #### ...# .##. #... ####', '▶': '#.. ##. ### ##. #..', '↑': '..#.. .###. #.#.# ..#.. ..#.. ..#.. ..#..',
    '�': '##### #...# #...# #...# #...# #...# #####'
  };
  var GL = {};
  function glyph(ch) {
    if (GL[ch]) return GL[ch];
    var src = REGULAR[ch]; if (src == null) src = REGULAR['�'];
    var rows = src.split(' '), w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);
    return (GL[ch] = { rows: rows, w: w });
  }
  function advOf(ch) { return ch === ' ' ? 4 : glyph(ch).w + 1; }

  /* ---------- built-in pixel16 look (used when skin-api.js is not loaded) ---------- */
  var WIN = {
    a: ['#3a64d8', '#2c50b8', '#223e96', '#1a2e74', '#a8c8ff', '#0a1238'],
    b: ['#d85a48', '#b8402e', '#922c26', '#6a1c1e', '#ffc8b8', '#2a0608'],
    n: ['#4c5a8a', '#3e4a76', '#323c62', '#262e4e', '#c8d4f4', '#0a0e22']
  };
  var FB = { ink: '#06061a', 'text.main': '#ffffff', 'text.shadow': '#0a0c24', 'text.gold': '#ffe890', 'text.accent': '#ffe070', 'text.dim': '#8088a8',
    'text.title': '#fff4c8', 'text.label': '#b8d0ff', 'text.select': '#fff4c0', 'fx.heal': '#4ad870', 'ui.rivet': '#ffe070', 'ui.rivetShade': '#7a5410',
    'ui.select': 'rgba(255,255,255,0.2)', 'ui.well': 'rgba(6,8,30,0.4)' };
  var GAUGE = { out: '#0a0c24', empty: '#1a1c3e', emptyTop: '#0e1030', queued: ['#e0fbff', '#6ad8f0', '#2a8ab8', '#144a6a'],
    ready: ['#ffffff', '#ffffff', '#e8ecff', '#a8b4f0'], charge: ['#fff8c8', '#f6c840', '#c08a18', '#7a5410'] };

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function okRect(r) { return r && isFinite(r.x) && isFinite(r.y) && r.w > 0 && r.h > 0; }
  function mkCanvas(w, h) { try { var c = root.document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; } catch (e) { return null; } }
  // deterministic RNG: one stream per (seed, unit id, level reached), so a unit's gains never depend on the order of awards
  function hashStr(s) { var h = 2166136261 >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function mulberry(a) { return function () { a = (a + 0x6d2b79f5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function create(o) {
    o = o || {};
    var API = root.GameDNA_Skin || null, SK = null;
    if (o.skin !== false) { try { SK = API && API.resolve ? API.resolve(o.skin) : null; } catch (e) { SK = null; } }
    var P = {}, warned = {}, lastCanvas = null, clock = 0, awards = 0;
    var U = {};                      // EXP state per unit id: { level, exp }
    var banked = {};                 // addExp() not yet shown: id -> exp
    var pend = [];                   // apply: 'later' -> [{id, key, gain}]
    var W = null, queue = [], last = null, drawnRects = [], held = {};
    var TABLE = null, EXPC = null;
    setParams(o.params || {});
    setTable(o.table);

    function dbg(e) { if (typeof o.debug === 'function') { try { o.debug(e); } catch (x) { } } }
    function warnOnce(key, msg) { if (warned[key]) return; warned[key] = 1; try { if (root.console) console.warn('GameDNA_LevelUpGrowth: ' + msg); } catch (e) { } }
    function call(fn, a, b, c, d) { if (typeof fn === 'function') { try { return fn(a, b, c, d); } catch (x) { warnOnce('cb', 'a host callback threw: ' + x); } } return undefined; }
    function setParams(p) {
      p = p || {};
      for (var k in p) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && p[k] != null && p[k] !== '') P[k] = p[k];
      for (k in DEFAULTS) if (P[k] == null) P[k] = DEFAULTS[k];
      for (k in DEFAULTS) if (typeof DEFAULTS[k] === 'number') P[k] = num(P[k], DEFAULTS[k]);
      P.base = clamp(P.base, 1, 1e6); P.power = clamp(P.power, 0, 4); P.maxLevel = clamp(Math.round(P.maxLevel), 2, 999);
      P.minGain = clamp(Math.round(P.minGain), 0, 8); P.countMs = clamp(P.countMs, 0, 10000); P.autoMs = clamp(P.autoMs, 0, 10000);
      P.rowMs = clamp(P.rowMs, 0, 2000); P.dim = clamp(P.dim, 0, 0.8); P.openMs = clamp(P.openMs, 0, 1000); P.margin = clamp(Math.round(P.margin), 0, 64);
      P.width = clamp(Math.round(P.width), 0, 2000);
      if (P.share !== 'split') P.share = 'each';
      if (P.apply !== 'later' && P.apply !== 'never') P.apply = 'now';
      if (P.autoGrowth !== 'hold') P.autoGrowth = 'apply';
      if (!WIN[P.tint]) P.tint = 'a';
      P.panel = P.panel === 'off' ? 'off' : 'on';
      EXPC = null;
    }
    function setTable(t) {
      TABLE = null; EXPC = null;
      if (t == null) return;
      if (!Array.isArray(t) || t.length < 2) { warnOnce('table', 'table must be an array of total EXP per level ([0, 20, 60, ...]); using the formula'); return; }
      var out = [];
      for (var i = 0; i < t.length; i++) { var v = num(t[i], NaN); if (!isFinite(v) || (i && v <= out[i - 1]) || (i === 0 && v !== 0)) { warnOnce('table', 'table must start at 0 and rise every level; using the formula'); return; } out.push(v); }
      TABLE = out;
    }

    /* ---------- EXP curve ---------- */
    function maxLv() { return TABLE ? Math.min(P.maxLevel, TABLE.length) : P.maxLevel; }
    function expFor(L) {            // total EXP to reach level L (level 1 = 0)
      L = clamp(Math.round(num(L, 1)), 1, maxLv());
      if (TABLE) return TABLE[L - 1];
      if (!EXPC) { EXPC = [0, 0]; for (var k = 1; k < P.maxLevel; k++) EXPC.push(EXPC[k] + Math.max(1, Math.round(P.base * Math.pow(k, P.power)))); }
      return EXPC[L];
    }
    function levelOf(exp) {
      var m = maxLv(), L = 1; exp = num(exp, 0);
      while (L < m && expFor(L + 1) <= exp) L++;
      return L;
    }
    function stOf(id, unit) {
      var k = String(id);
      if (!U[k]) { var L = clamp(Math.round(num(unit && unit.level, 1)), 1, maxLv()); var e = unit && unit.exp != null ? num(unit.exp, expFor(L)) : expFor(L); if (levelOf(e) !== L) e = expFor(L); U[k] = { level: L, exp: e }; }
      return U[k];
    }

    /* ---------- units, stats, classes ---------- */
    function statList() {
      var out = [], seen = {};
      var add = function (s) { if (s == null) return; var key = typeof s === 'object' ? s.key : s; if (key == null || seen[key]) return; seen[key] = 1; out.push({ key: String(key), label: String(typeof s === 'object' && s.label != null ? s.label : String(key).toUpperCase()).slice(0, 6) }); };
      if (Array.isArray(o.stats) && o.stats.length) o.stats.forEach(add);
      else { var C = o.classes || {}; for (var c in C) { var R = C[c] && (C[c].rates || C[c]); if (R) for (var k in R) add(k); } }
      return out;
    }
    function ratesOf(u) {
      var C = o.classes || {}, c = u.cls != null ? C[u.cls] : null;
      if (u.rates && typeof u.rates === 'object') return { rates: u.rates, caps: u.caps || {} };
      if (!c && C['default']) c = C['default'];
      if (!c) { warnOnce('cls:' + u.cls, 'no growth table for class "' + u.cls + '" (unit ' + u.id + '): it levels up with no stat gains. Add it to classes or give the unit rates.'); return { rates: {}, caps: {} }; }
      return { rates: c.rates || c, caps: c.caps || {} };
    }
    function rateOf(spec) {
      if (spec == null) return { rate: 0, amount: 1 };
      if (typeof spec === 'number' || typeof spec === 'string') return { rate: clamp(num(spec, 0), 0, 1000), amount: 1 };
      return { rate: clamp(num(spec.rate, 0), 0, 1000), amount: Math.max(1, Math.round(num(spec.amount, 1))) };
    }
    function readUnits() {
      var L = call(o.units); if (!L || typeof L.length !== 'number') { if (o.units) warnOnce('units', 'units() must return an array'); L = []; }
      var out = [];
      for (var i = 0; i < L.length; i++) {
        var u = L[i]; if (!u || typeof u !== 'object') continue;
        var id = u.id != null ? String(u.id) : null;
        if (id == null) { warnOnce('id', 'every unit needs an id (EXP is stored per id); using its position'); id = 'u' + i; }
        out.push({ id: id, name: String(u.name != null ? u.name : id), cls: u.cls != null ? u.cls : u['class'], alive: u.alive !== false, level: u.level, exp: u.exp,
          rates: u.rates, caps: u.caps, get: u.get, set: u.set, ref: u });
      }
      return out;
    }
    function getStat(u, key) {
      var v = typeof u.get === 'function' ? call(u.get, key, u.ref) : typeof o.getStat === 'function' ? call(o.getStat, u.id, key, u.ref) : undefined;
      v = +v; return isFinite(v) ? v : null;
    }
    function setStat(u, key, value, gain) {
      if (typeof u.set === 'function') call(u.set, key, value, gain, u.ref);
      else if (typeof o.setStat === 'function') call(o.setStat, u.id, key, value, gain, u.ref);
      else { warnOnce('noset', 'no setter (unit.set or options.setStat): stats are shown but never applied'); return false; }
      return true;
    }

    // one level's gains: every stat draws once from the stream (so adding a stat never reshuffles the others), caps first, then the minimum
    function rollLevel(u, level, cur, stats, R) {
      var rnd = mulberry(hashStr(String(P.seed) + '|' + u.id + '|' + level)), gains = {}, n = 0, i;
      for (i = 0; i < stats.length; i++) {
        var k = stats[i].key, r = rateOf(R.rates[k]), roll = rnd() * 100, times = Math.floor(r.rate / 100) + (roll < r.rate % 100 ? 1 : 0);
        var g = times * r.amount, cap = R.caps[k] != null ? num(R.caps[k], Infinity) : Infinity;
        if (cur[k] == null) g = 0; else if (cur[k] + g > cap) g = Math.max(0, cap - cur[k]);
        gains[k] = g; if (g > 0) n++;
      }
      if (P.minGain > n) {                                   // guaranteed minimum: the highest-rate stats that did not grow get +amount
        var cand = [];
        for (i = 0; i < stats.length; i++) { var kk = stats[i].key, rr = rateOf(R.rates[kk]), cp = R.caps[kk] != null ? num(R.caps[kk], Infinity) : Infinity;
          if (rr.rate > 0 && !gains[kk] && cur[kk] != null && cur[kk] < cp) cand.push({ k: kk, rate: rr.rate, amount: rr.amount, cap: cp, i: i }); }
        cand.sort(function (a, b) { return b.rate - a.rate || a.i - b.i; });
        for (i = 0; i < cand.length && n < P.minGain; i++) { var c = cand[i]; gains[c.k] = Math.min(c.amount, c.cap - cur[c.k]); if (gains[c.k] > 0) { n++; } }
      }
      return gains;
    }

    /* ---------- award: computed (and applied) at once; the window only shows it ---------- */
    function award(exp, gold, opts) {
      opts = opts || {};
      var map = exp && typeof exp === 'object' ? exp : null, flat = map ? 0 : Math.max(0, Math.round(num(exp, 0)));
      gold = Math.max(0, Math.round(num(gold, 0)));
      var only = Array.isArray(opts.units) ? opts.units.map(String) : null;
      var list = readUnits(), stats = statList();
      if (only) list = list.filter(function (u) { return only.indexOf(u.id) >= 0; });
      var takers = list.filter(function (u) { return map ? Object.prototype.hasOwnProperty.call(map, u.id) : u.alive; });
      var share = flat;
      if (!map && P.share === 'split' && takers.length) share = Math.floor(flat / takers.length);
      var shown = list.filter(function (u) { return takers.indexOf(u) >= 0 || banked[u.id] > 0; });
      if (!only && !map) shown = list.filter(function (u) { return u.alive || banked[u.id] > 0; });
      var auto = opts.auto != null ? !!opts.auto : typeof o.autoplay === 'function' ? !!call(o.autoplay) : !!o.autoplay;
      var mode = P.apply === 'now' && auto && P.autoGrowth === 'hold' ? 'later' : P.apply;
      var entries = [], sum = 0, levelUps = 0, applied = mode === 'now';
      shown.forEach(function (u) {
        var st = stOf(u.id, u), add = (takers.indexOf(u) >= 0 ? (map ? Math.max(0, Math.round(num(map[u.id], 0))) : share) : 0) + (banked[u.id] || 0);
        delete banked[u.id];
        var before = st.exp, top = expFor(maxLv()), after = Math.min(top, before + add), fromL = st.level, toL = Math.max(fromL, levelOf(after));
        var R = ratesOf(u), cur = {}, old = {}, gains = {}, any = false, L, k;
        stats.forEach(function (s) { var v = getStat(u, s.key); if (v == null && toL > fromL) warnOnce('get:' + s.key, 'stat "' + s.key + '" of unit ' + u.id + ' has no number from the getter; it is skipped'); cur[s.key] = v; old[s.key] = v; gains[s.key] = 0; });
        var perLevel = [];
        for (L = fromL + 1; L <= toL; L++) {
          var g = rollLevel(u, L, cur, stats, R); perLevel.push({ level: L, gains: g });
          for (k in g) if (g[k] > 0) { gains[k] += g[k]; cur[k] += g[k]; any = true; }
        }
        st.exp = after; st.level = toL; sum += after - before;
        var values = {};
        stats.forEach(function (s) { if (old[s.key] != null) values[s.key] = [old[s.key], cur[s.key]]; });
        var e = { id: u.id, name: u.name, cls: u.cls, fromLevel: fromL, toLevel: toL, expBefore: before, expAfter: after, gained: after - before, gains: gains, values: values, perLevel: perLevel, mismatch: [] };
        if (toL > fromL) {
          levelUps++;
          stats.forEach(function (s) {
            var key = s.key, gn = gains[key]; if (!(gn > 0)) return;
            if (mode === 'now') {
              var nv = old[key] + gn; setStat(u, key, nv, gn);
              var back = getStat(u, key);
              dbg({ event: 'apply', id: u.id, key: key, from: old[key], to: nv, gain: gn, read: back });
              if (back !== nv) { e.mismatch.push(key); warnOnce('mismatch', 'after set("' + key + '", ' + nv + ') the getter of unit ' + u.id + ' returns ' + back + ': the setter writes somewhere the getter does not read'); dbg({ event: 'mismatch', id: u.id, key: key, want: nv, read: back }); }
            } else if (mode === 'later') pend.push({ id: u.id, key: key, gain: gn, unit: u });
          });
          call(o.onLevel, { id: u.id, name: u.name, from: fromL, to: toL, gains: gains, values: values });
        }
        entries.push(e);
      });
      var headline = !map && flat > 0 ? flat : sum;
      var A = { id: ++awards, exp: headline, gold: gold, title: String(opts.title != null ? opts.title : P.title).slice(0, 24), entries: entries, levelUps: levelUps, opt: opts,
        auto: auto, applied: applied };
      dbg({ event: 'award', id: A.id, exp: A.exp, gold: gold, units: entries.length, levelUps: levelUps, apply: mode,
        gains: entries.filter(function (x) { return x.toLevel > x.fromLevel; }).map(function (x) { return { id: x.id, from: x.fromLevel, to: x.toLevel, gains: x.gains }; }) });
      if (W) { queue.push(A); dbg({ event: 'queued', id: A.id }); } else start(A);
      return { id: A.id, levelUps: levelUps, units: entries.map(function (x) { return { id: x.id, fromLevel: x.fromLevel, toLevel: x.toLevel, gained: x.gained, gains: x.gains }; }) };
    }
    function addExp(id, n) { n = Math.max(0, Math.round(num(n, 0))); if (id == null || !n) return 0; id = String(id); banked[id] = (banked[id] || 0) + n; return banked[id]; }

    /* ---------- what the HUD may show: old values until the window reveals them ---------- */
    // every entry with gains holds its old values (e.rel[key] = 1 once revealed); shown(id, key) returns the first unreleased hold
    function releaseAll(e) { e.relAll = true; }
    function heldEntry(id, key) {
      var list = (W ? [W.A] : []).concat(queue);
      for (var i = 0; i < list.length; i++) { var en = list[i].entries; for (var j = 0; j < en.length; j++) { var e = en[j];
        if (e.id === id && !e.relAll && (key == null ? e.toLevel > e.fromLevel : (e.gains[key] > 0 && !(e.rel && e.rel[key])))) return { e: e, A: list[i] }; } }
      return null;
    }
    function shown(id, key) {
      id = String(id);
      var h = heldEntry(id, key); if (h && h.e.values[key]) return h.e.values[key][0];
      var L = readUnits(); for (var i = 0; i < L.length; i++) if (L[i].id === id) return getStat(L[i], key);
      return null;
    }
    function shownLevel(id) {
      id = String(id);
      var h = heldEntry(id, null);
      if (h) return W && h.A === W.A && W.shownLv[id] != null ? W.shownLv[id] : h.e.fromLevel;
      var s = U[id]; return s ? s.level : null;
    }

    /* ---------- window state machine (all driven by update(dt)) ---------- */
    function start(A) {
      W = { A: A, stage: 'open', t: 0, armT: 0, latch: false, f: 0, panels: P.panel === 'off' ? [] : A.entries.filter(function (e) { return e.toLevel > e.fromLevel; }),
        pi: -1, rows: 0, flash: {}, shownLv: {}, countSfx: 0, box: null, pbox: null, drawn: false };
      A.entries.forEach(function (e) { W.shownLv[e.id] = e.fromLevel; e.rel = {}; });
      dbg({ event: 'open', id: A.id, auto: A.auto });
      call(o.onSfx, 'open');
    }
    function panelRows(e) {
      var stats = statList(), rows = [];
      stats.forEach(function (s) { if (e.values[s.key]) rows.push({ key: s.key, label: s.label, old: e.values[s.key][0], now: e.values[s.key][1], gain: e.gains[s.key] || 0 }); });
      return rows;
    }
    function gainRows(e) { return panelRows(e).filter(function (r) { return r.gain > 0; }).length; }
    function next(why) {
      var d = W; if (!d) return;
      if (d.pi >= 0 && d.panels[d.pi]) releaseAll(d.panels[d.pi]);
      if (d.pi + 1 < d.panels.length) {
        d.pi++; d.stage = 'rows'; d.t = 0; d.rows = 0; d.pbox = null;
        var e = d.panels[d.pi];
        dbg({ event: 'panel', id: d.A.id, unit: e.id, from: e.fromLevel, to: e.toLevel, gains: e.gains, why: why });
        call(o.onSfx, 'level');
        return;
      }
      d.stage = 'close'; d.t = 0; dbg({ event: 'close', id: d.A.id, why: why });
    }
    function finish(skipped) {
      var d = W, A = d.A;
      var res = { id: A.id, exp: A.exp, gold: A.gold, title: A.title, levelUps: A.levelUps, skipped: !!skipped, auto: A.auto, applied: A.applied,
        units: A.entries.map(function (e) { return { id: e.id, name: e.name, fromLevel: e.fromLevel, toLevel: e.toLevel, expBefore: e.expBefore, expAfter: e.expAfter, gained: e.gained, gains: e.gains, values: e.values }; }) };
      A.entries.forEach(releaseAll); last = res; W = null;
      dbg({ event: 'end', id: A.id, skipped: !!skipped, drawn: d.drawn });
      call(o.onSfx, 'close');
      call(A.opt.onDone, res); call(o.onDone, res);
      if (!W && queue.length) start(queue.shift());
    }
    function countEnd(d) {
      d.f = 1; d.A.entries.forEach(function (e) { if (W.shownLv[e.id] !== e.toLevel) { W.shownLv[e.id] = e.toLevel; W.flash[e.id] = clock; } if (d.panels.indexOf(e) < 0) releaseAll(e); });
    }
    function update(dt) {
      try {
        dt = num(dt, 0); if (dt < 0) dt = 0; if (dt > 250) dt = 250;
        clock += dt;
        var d = W; if (!d) return;
        d.t += dt; d.armT += dt;
        var latch = d.latch; d.latch = false;
        if (d.A.auto) latch = false;
        if (d.armT < P.openMs + 60) latch = false;     // the press that triggered the award cannot skip the window
        if (d.stage === 'open') { if (d.t >= P.openMs) { d.stage = 'count'; d.t = 0; } return; }
        if (d.stage === 'close') { if (d.t >= P.openMs) finish(false); return; }
        if (d.stage === 'count') {
          d.f = P.countMs > 0 ? clamp(d.t / P.countMs, 0, 1) : 1;
          if (latch) { countEnd(d); dbg({ event: 'finish', id: d.A.id }); }
          d.A.entries.forEach(function (e) {
            var lvNow = levelOf(e.expBefore + (e.expAfter - e.expBefore) * d.f);
            if (lvNow > W.shownLv[e.id]) { W.shownLv[e.id] = lvNow; W.flash[e.id] = clock; call(o.onSfx, 'levelUp'); }
          });
          if (d.f < 1 && (d.countSfx += dt) >= 66) { d.countSfx = 0; call(o.onSfx, 'count'); }
          if (d.f >= 1) { countEnd(d); d.stage = 'wait'; d.t = 0; }
          return;
        }
        if (d.stage === 'wait') {
          if (latch || (d.A.auto && d.t >= P.autoMs)) next(latch ? 'press' : 'autoplay');
          return;
        }
        if (d.stage === 'rows') {
          var e = d.panels[d.pi], n = gainRows(e), want = P.rowMs > 0 ? Math.min(n, Math.floor(d.t / P.rowMs)) : n;
          if (latch) want = n;
          while (d.rows < want) { d.rows++; d.flash['row' + d.rows] = clock; call(o.onSfx, 'row'); var gr = panelRows(e).filter(function (r) { return r.gain > 0; })[d.rows - 1]; if (gr) e.rel[gr.key] = 1; }
          if (d.rows >= n && (latch || d.t >= (n + 1) * P.rowMs)) { d.stage = 'pwait'; d.t = 0; }
          return;
        }
        if (d.stage === 'pwait') {
          if (latch || (d.A.auto && d.t >= P.autoMs)) next(latch ? 'press' : 'autoplay');
        }
      } catch (err) { warnOnce('update', 'update failed: ' + err); }
    }
    function press() { if (!W) return false; if (W.A.auto) return true; W.latch = true; return true; }
    function key(code, down) {
      code = String(code == null ? '' : code);
      if (!ACTION_KEYS[code]) return false;
      if (!W) { if (!down) held[code] = false; return false; }
      if (down) { if (!held[code]) press(); held[code] = true; } else held[code] = false;
      return true;
    }
    function end() { if (!W) return false; queue = []; finish(true); return true; }

    /* ---------- colours, text ---------- */
    function tok(path) {
      if (SK) { try { var v = SK.token(path); if (typeof v === 'string' && v !== path) return v; } catch (e) { } }
      return FB[path] || null;
    }
    function pixelSkin() { return !SK || SK.pixel !== false; }
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
    var MW = {};
    function textW(s) {
      s = String(s == null ? '' : s);
      if (!pixelSkin()) { if (MW[s] == null) { try { MW[s] = Math.ceil(+SK.measure(s, { font: 'ui' }) || 0); } catch (e) { MW[s] = 0; } } return MW[s]; }
      var w = 0; for (var i = 0; i < s.length; i++) w += advOf(s[i]); return Math.max(0, w - 1);
    }
    // align: 'left' | 'right' | 'center' (x is that edge / the centre)
    function text(ctx, s, x, y, col, align) {
      s = String(s == null ? '' : s); col = col || tok('text.main') || '#ffffff';
      var w = textW(s), x0 = align === 'right' ? x - w : align === 'center' ? Math.round(x - w / 2) : x;
      if (!pixelSkin()) { try { SK.text(ctx, s, x0, y, { font: 'ui', color: col }); } catch (e) { } return w; }
      var sh = tok('text.shadow') || '#0a0c24', cx, i;
      for (var pass = 0; pass < 2; pass++) { cx = x0; for (i = 0; i < s.length; i++) { if (s[i] !== ' ') blit(ctx, s[i], cx + (pass ? 0 : 1), y + (pass ? 0 : 1), pass ? col : sh); cx += advOf(s[i]); } }
      return w;
    }

    /* ---------- drawing primitives through the skin (pixel16 fallbacks) ---------- */
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
    function frame(ctx, r, role, team) {
      if (SK) { try { SK.frame(ctx, r, { role: role, team: team }); return; } catch (e) { } }
      if (role === 'row') { ctx.fillStyle = FB['ui.select']; ctx.fillRect(r.x, r.y, r.w, r.h); return; }
      if (role === 'backing') { ctx.fillStyle = FB['ui.well']; ctx.fillRect(r.x, r.y, r.w, r.h); return; }
      frame16(ctx, r, team);
    }
    function gauge(ctx, r, frac, kind) {
      if (SK) { try { SK.bar(ctx, r, frac, kind, { style: 'gauge' }); return; } catch (e) { } }
      var C = GAUGE[kind] || GAUGE.queued, x = r.x, y = r.y, w = r.w, h = r.h, iw = w - 2, ih = h - 2;
      var R = function (X, Y, Wd, Hd, c) { if (Wd <= 0 || Hd <= 0) return; ctx.fillStyle = c; ctx.fillRect(X, Y, Wd, Hd); };
      R(x + 1, y, w - 2, 1, GAUGE.out); R(x + 1, y + h - 1, w - 2, 1, GAUGE.out); R(x, y + 1, 1, h - 2, GAUGE.out); R(x + w - 1, y + 1, 1, h - 2, GAUGE.out);
      R(x + 1, y + 1, iw, ih, GAUGE.empty); R(x + 1, y + 1, iw, 1, GAUGE.emptyTop);
      var fw = Math.round(clamp(frac, 0, 1) * iw); if (fw <= 0) return;
      R(x + 1, y + 1, fw, ih, C[1]); R(x + 1, y + 1, fw, 1, C[0]); if (ih > 2) R(x + 1, y + h - 2, fw, 1, C[2]);
      if (fw < iw) R(x + fw, y + 1, 1, ih, C[3]); else R(x + iw, y + 1, 1, ih, C[0]);
    }

    /* ---------- layout: centred in the field, never on a UI rect ---------- */
    function field() {
      var b = o.bounds;
      if (typeof b === 'function') b = call(b);
      if (!b && o.view) b = typeof o.view === 'function' ? call(o.view) : o.view;
      if (b && !(b.w > 0) && b.width > 0) b = { x: 0, y: 0, w: b.width, h: b.height };
      if (!b && lastCanvas) b = { x: 0, y: 0, w: lastCanvas.width, h: lastCanvas.height };
      if (!b || !(b.w > 0) || !(b.h > 0)) return null;
      return { x: num(b.x, 0), y: num(b.y, 0), w: b.w, h: b.h };
    }
    function spriteList() {
      var out = [], a = call(o.getObstacles);
      if (a && a.length) for (var i = 0; i < a.length; i++) { var r = a[i]; if (okRect(r) && r.id != null) out.push({ x: +r.x, y: +r.y, w: +r.w, h: +r.h }); }
      return out;
    }
    function overlap(a, b) { return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); }
    function uiList() {
      var out = [], a = call(o.getObstacles), u = call(o.uiRects);
      [a, u].forEach(function (L, j) { if (L && L.length) for (var i = 0; i < L.length; i++) { var r = L[i]; if (okRect(r) && (j === 1 || r.id == null)) out.push({ x: +r.x, y: +r.y, w: +r.w, h: +r.h }); } });
      return out;
    }
    function placeBox(w, h, cy) {
      var f = field(); if (!f) return null;
      var m = P.margin, O = uiList(), SP = spriteList();
      w = Math.min(w, f.w - 2 * Math.min(m, 2)); h = Math.min(h, f.h);
      var x = Math.round(f.x + (f.w - w) / 2), lo = f.y + Math.min(m, Math.max(0, (f.h - h) >> 1)), hi = f.y + f.h - h - Math.min(m, Math.max(0, (f.h - h) >> 1));
      if (hi < lo) hi = lo;
      var target = Math.round(cy != null ? cy - h / 2 : f.y + (f.h - h) / 2), best = null, bd = 1e9;
      for (var y = lo; y <= hi; y++) {
        var r = { x: x, y: y, w: w, h: h }, ok = true;
        for (var i = 0; i < O.length; i++) if (hit(r, O[i])) { ok = false; break; }
        if (!ok) continue;
        var cost = Math.abs(y - target); for (var k = 0; k < SP.length; k++) cost += overlap(r, SP[k]) * 4;   // sprites (rects with id): avoided when cheap
        if (cost < bd) { bd = cost; best = y; }
      }
      if (best == null) { best = clamp(target, lo, hi); dbg({ event: 'noroom' }); warnOnce('noroom', 'no spot clear of your UI rects; the window is drawn over them. Check bounds / uiRects.'); }
      return { x: x, y: best, w: w, h: h };
    }
    function tallyGeom(d) {
      var f = field(); if (!f) return null;
      var n = d.A.entries.length, w = P.width > 0 ? P.width : Math.min(208, f.w - 2 * P.margin);
      w = Math.max(Math.min(150, f.w), w);
      var head = PAD + 9 + 4 + 9 + 6, rowH = 15, free = f.h - 2 * P.margin - uiHeight(f);
      if (head + n * rowH + 6 > free) rowH = 11;
      var rows = n; while (rows > 1 && head + rows * rowH + 6 > Math.max(free, 60)) rows--;
      var B = placeBox(w, head + Math.max(1, rows) * rowH + 6);
      if (B) { B.rowH = rowH; B.rows = rows; B.head = head; }
      return B;
    }
    function uiHeight(f) { var O = uiList(), s = 0; O.forEach(function (r) { if (r.w >= f.w * 0.5 && hit(r, f)) s += Math.min(r.h, f.h); }); return Math.min(s, f.h * 0.6); }

    function draw(ctx, ox, oy) {
      drawnRects = [];
      if (!ctx) return;
      try { if (ctx.canvas) lastCanvas = ctx.canvas; } catch (e) { }
      var d = W; if (!d) return;
      try {
        ox = num(ox, 0); oy = num(oy, 0);
        ctx.save();
        try { paint(ctx, d, ox, oy); } finally { ctx.restore(); }
      } catch (e) { warnOnce('draw', 'draw failed: ' + e); }
    }
    function nextText(e, expNow) {
      var L = levelOf(expNow); if (L >= maxLv()) return 'MAX';
      return 'NEXT ' + Math.max(0, Math.ceil(expFor(L + 1) - expNow));
    }
    function paint(ctx, d, ox, oy) {
      if (pixelSkin()) ctx.imageSmoothingEnabled = false;
      var open = 1;
      if (d.stage === 'open') open = P.openMs > 0 ? clamp(d.t / P.openMs, 0, 1) : 1;
      if (d.stage === 'close') open = P.openMs > 0 ? 1 - clamp(d.t / P.openMs, 0, 1) : 0;
      if (pixelSkin()) open = Math.round(open * 4) / 4;
      var f = field();
      if (P.dim > 0 && f && open > 0) { ctx.globalAlpha = P.dim * open; ctx.fillStyle = tok('ink') || FB.ink; ctx.fillRect(f.x + ox, f.y + oy, f.w, f.h); ctx.globalAlpha = 1; }
      if (!d.box) d.box = tallyGeom(d);
      var B = d.box; if (!B || open <= 0) return;
      var team = String(d.A.opt.tint || P.tint); if (!WIN[team]) team = 'a';
      var bh = Math.max(4, Math.round(B.h * open)), bx = B.x + ox, by = B.y + oy + Math.round((B.h - bh) / 2);
      frame(ctx, { x: bx, y: by, w: B.w, h: bh }, 'window', team);
      drawnRects.push({ kind: 'window', x: B.x, y: B.y, w: B.w, h: B.h });
      d.drawn = true;
      if (open < 1) return;
      var x0 = bx, y0 = by, W2 = B.w, cf = d.stage === 'count' ? d.f : 1;
      // title + EXP / GOLD counters
      text(ctx, d.A.title, x0 + W2 / 2, y0 + PAD - 1, tok('text.title') || tok('text.gold'), 'center');
      var ly = y0 + PAD + 12, expShown = Math.round(d.A.exp * cf), goldShown = Math.round(d.A.gold * cf);
      frame(ctx, { x: x0 + 6, y: ly - 2, w: W2 - 12, h: 11 }, 'backing', team);
      text(ctx, 'EXP', x0 + 10, ly, tok('text.label'));
      text(ctx, String(expShown), x0 + Math.round(W2 / 2) - 8, ly, tok('text.main'), 'right');
      text(ctx, 'GOLD', x0 + Math.round(W2 / 2) + 4, ly, tok('text.label'));
      text(ctx, String(goldShown), x0 + W2 - 10, ly, tok('text.gold'), 'right');
      // unit rows: name, level, EXP gauge filling and wrapping at each level, NEXT / LV UP!
      var rt = x0 + W2 - 9, rcol = Math.max(textW('NEXT 9999'), textW('LV UP!'), textW('MAX'));     // fixed right column; the gauge ends 4 px before it
      var ry = y0 + B.head, gx = x0 + Math.min(96, Math.round(W2 * 0.44)), gw = Math.max(16, rt - rcol - 4 - gx), compact = B.rowH < 15;
      for (var i = 0; i < d.A.entries.length && i < B.rows; i++) {
        var e = d.A.entries[i], ex = e.expBefore + (e.expAfter - e.expBefore) * cf, L = Math.min(levelOf(ex), d.stage === 'count' ? 999 : e.toLevel);
        var lo = expFor(L), hiE = L >= maxLv() ? lo : expFor(L + 1), frac = L >= maxLv() ? 1 : (ex - lo) / Math.max(1, hiE - lo);
        var leveled = L > e.fromLevel, fl = d.flash[e.id] != null ? clock - d.flash[e.id] : 1e9, y = ry + i * B.rowH;
        if (leveled) frame(ctx, { x: x0 + 5, y: y - 2, w: W2 - 10, h: B.rowH - 2 }, 'row', team);
        var nm = e.name; while (nm.length > 1 && textW(nm) > gx - x0 - 50) nm = nm.slice(0, -1);
        text(ctx, nm, x0 + 10, y, leveled ? tok('text.select') || tok('text.main') : tok('text.main'));
        text(ctx, 'LV', gx - 34, y, tok('text.dim'));
        text(ctx, String(L), gx - 6, y, fl < 400 && Math.floor(fl / 100) % 2 === 0 ? tok('text.main') : leveled ? tok('text.accent') : tok('text.main'), 'right');
        var gh = compact ? 4 : 5, gy = compact ? y + 2 : y + 2;
        gauge(ctx, { x: gx, y: gy, w: gw, h: gh }, fl < 160 ? 1 : frac, fl < 160 ? 'ready' : L >= maxLv() ? 'charge' : 'queued');
        if (leveled) text(ctx, 'LV UP!', rt, y, fl < 600 || Math.floor(clock / 250) % 4 !== 3 ? tok('text.accent') : tok('text.main'), 'right');   // pulses, never hidden
        else text(ctx, nextText(e, ex), rt, y, tok('text.dim'), 'right');
      }
      if (B.rows < d.A.entries.length) text(ctx, '+' + (d.A.entries.length - B.rows) + ' MORE', x0 + W2 - 10, y0 + B.h - 9, tok('text.dim'), 'right');
      if (d.stage === 'wait' && !d.A.auto) more(ctx, x0 + W2 - 14, y0 + B.h - 4);
      // the level-up panel for one unit, over the tally
      if ((d.stage === 'rows' || d.stage === 'pwait') && d.pi >= 0) {
        ctx.globalAlpha = 0.5; ctx.fillStyle = tok('ink') || FB.ink; ctx.fillRect(x0 + 1, y0 + 1, W2 - 2, B.h - 2); ctx.globalAlpha = 1;   // the tally steps back
        drawPanel(ctx, d, d.panels[d.pi], team, ox, oy);
      }
    }
    function more(ctx, x, y) {
      if (Math.floor(clock / 190) % 3 === 2) return;
      var dy = Math.floor(clock / 190) % 3 === 1 ? 1 : 0;
      if (!pixelSkin()) { text(ctx, '▶', x, y - 6 + dy, tok('text.main')); return; }
      ctx.fillStyle = '#1a0e08'; ctx.fillRect(x - 1, y - 1 + dy, 7, 2); ctx.fillRect(x, y + 1 + dy, 5, 1); ctx.fillRect(x + 1, y + 2 + dy, 3, 1); ctx.fillRect(x + 2, y + 3 + dy, 1, 1);
      ctx.fillStyle = tok('text.main'); ctx.fillRect(x, y + dy, 5, 1); ctx.fillRect(x + 1, y + 1 + dy, 3, 1); ctx.fillRect(x + 2, y + 2 + dy, 1, 1);
    }
    function drawPanel(ctx, d, e, team, ox, oy) {
      var rows = panelRows(e), w = Math.max(136, d.box ? d.box.w : 136), h = PAD + 9 + 3 + 9 + 5 + rows.length * LINE + 6;
      if (!d.pbox) { var B = d.box; d.pbox = placeBox(w, h, B ? B.y + B.h / 2 : null); }
      var R = d.pbox; if (!R) return;
      var x0 = R.x + ox, y0 = R.y + oy, bx = Math.max(0, Math.round((R.w - 136) / 2));
      ctx.fillStyle = tok('ink') || FB.ink; ctx.fillRect(x0 + 2, y0 + 2, R.w - 4, R.h - 4);      // the tally must not show through a translucent window
      frame(ctx, { x: x0, y: y0, w: R.w, h: R.h }, 'window', team);
      drawnRects.push({ kind: 'panel', x: R.x, y: R.y, w: R.w, h: R.h, unit: e.id });
      text(ctx, e.name, x0 + 10, y0 + PAD - 1, tok('text.gold'));
      text(ctx, 'LEVEL UP!', x0 + R.w - 10, y0 + PAD - 1, Math.floor(clock / 200) % 4 !== 3 ? tok('text.accent') : tok('text.main'), 'right');
      var ly = y0 + PAD + 12;
      frame(ctx, { x: x0 + 6, y: ly - 2, w: R.w - 12, h: 11 }, 'backing', team);
      text(ctx, 'LV ' + e.fromLevel, x0 + bx + 10, ly, tok('text.dim'));
      text(ctx, '▶', x0 + bx + 50, ly, tok('text.dim'));
      text(ctx, 'LV ' + e.toLevel, x0 + bx + 60, ly, tok('text.accent'));
      if (e.toLevel - e.fromLevel > 1) text(ctx, '(+' + (e.toLevel - e.fromLevel) + ')', x0 + R.w - 10, ly, tok('text.label'), 'right');
      var gi = 0, y = ly + 14;
      for (var i = 0; i < rows.length; i++, y += LINE) {
        var r = rows[i], shown = false, age = 1e9;
        if (r.gain > 0) { gi++; shown = gi <= d.rows; age = shown && d.flash['row' + gi] != null ? clock - d.flash['row' + gi] : 1e9; }
        if (shown) {
          frame(ctx, { x: x0 + 5, y: y - 1, w: R.w - 10, h: LINE - 1 }, 'row', team);
          if (age < 280 && pixelSkin()) { ctx.globalAlpha = 0.55 * (1 - age / 280); ctx.fillStyle = '#ffffff'; ctx.fillRect(x0 + 5, y - 1, R.w - 10, LINE - 1); ctx.globalAlpha = 1; }
        }
        text(ctx, r.label, x0 + bx + 10, y, r.gain > 0 ? tok('text.label') : tok('text.dim'));
        text(ctx, String(shown ? r.now : r.old), x0 + bx + 74, y, shown ? tok('text.main') : r.gain > 0 ? tok('text.main') : tok('text.dim'), 'right');
        if (shown) {
          var slide = age < 120 ? Math.round(6 * (1 - age / 120)) : 0;
          text(ctx, '+' + r.gain, x0 + bx + 82 + slide, y, tok('fx.heal') || '#4ad870');
          text(ctx, '↑', x0 + bx + 122, y, tok('text.accent'));
        }
      }
      if (d.stage === 'pwait' && !d.A.auto) more(ctx, x0 + R.w - 14, y0 + R.h - 4);
    }

    /* ---------- save / load ---------- */
    function serialize() {
      var u = {}; for (var k in U) u[k] = { level: U[k].level, exp: U[k].exp };
      var b = {}; for (k in banked) if (banked[k] > 0) b[k] = banked[k];
      return { v: 1, units: u, banked: b };
    }
    function restore(s) {
      try {
        if (typeof s === 'string') s = JSON.parse(s);
        if (!s || typeof s !== 'object' || !s.units || typeof s.units !== 'object') { warnOnce('restore', 'restore() needs an object from serialize()'); return false; }
        var u = {};
        for (var k in s.units) { var r = s.units[k]; if (!r) continue; var e = Math.max(0, num(r.exp, 0)), L = levelOf(e); u[k] = { level: L, exp: e }; }
        U = u; banked = {};
        if (s.banked) for (k in s.banked) { var n = Math.max(0, Math.round(num(s.banked[k], 0))); if (n) banked[k] = n; }
        return true;
      } catch (e) { warnOnce('restore', 'restore failed: ' + e); return false; }
    }
    function applyPending() {
      var n = 0, list = pend; pend = [];
      list.forEach(function (p) { var v = getStat(p.unit, p.key); if (v == null) return; setStat(p.unit, p.key, v + p.gain, p.gain); dbg({ event: 'apply', id: p.id, key: p.key, from: v, to: v + p.gain, gain: p.gain, read: getStat(p.unit, p.key), late: true }); n++; });
      return n;
    }

    /* ---------- public ---------- */
    return {
      award: award,
      addExp: addExp,
      banked: function (id) { return id == null ? Object.assign({}, banked) : banked[String(id)] || 0; },
      busy: function () { return !!W || queue.length > 0; },
      press: press,
      tap: function () { return press(); },
      key: key,
      update: update,
      draw: draw,
      end: end,
      auto: function (on) { if (!W) return false; W.A.auto = on !== false; W.latch = false; return true; },
      clear: function () { W = null; queue = []; held = {}; drawnRects = []; },
      reset: function () { W = null; queue = []; U = {}; banked = {}; pend = []; drawnRects = []; },
      shown: shown,
      shownLevel: shownLevel,
      level: function (id) { var s = U[String(id)]; return s ? s.level : null; },
      exp: function (id) { var s = U[String(id)]; return s ? s.exp : null; },
      toNext: function (id) { var s = U[String(id)]; if (!s) return null; return s.level >= maxLv() ? 0 : expFor(s.level + 1) - s.exp; },
      track: function (unit) { if (!unit || unit.id == null) return null; var s = stOf(unit.id, unit); return { level: s.level, exp: s.exp }; },
      expFor: expFor,
      levelOf: levelOf,
      maxLevel: maxLv,
      pendingGains: function () { return pend.map(function (p) { return { id: p.id, key: p.key, gain: p.gain }; }); },
      applyPending: applyPending,
      serialize: serialize,
      restore: restore,
      state: function () {
        var d = W; if (!d) return null;
        var cf = d.stage === 'count' ? d.f : 1, pe = d.pi >= 0 && (d.stage === 'rows' || d.stage === 'pwait') ? d.panels[d.pi] : null;
        return { id: d.A.id, stage: d.stage, auto: d.A.auto, title: d.A.title, exp: Math.round(d.A.exp * cf), gold: Math.round(d.A.gold * cf), expTotal: d.A.exp, goldTotal: d.A.gold,
          queued: queue.length, panel: d.pi, panels: d.panels.length,
          units: d.A.entries.map(function (e) { var ex = e.expBefore + (e.expAfter - e.expBefore) * cf; return { id: e.id, level: Math.min(levelOf(ex), e.toLevel), from: e.fromLevel, to: e.toLevel, exp: Math.round(ex) }; }),
          unit: pe ? { id: pe.id, from: pe.fromLevel, to: pe.toLevel, rows: panelRows(pe), shown: d.rows } : null,
          box: d.box ? { x: d.box.x, y: d.box.y, w: d.box.w, h: d.box.h } : null, pbox: d.pbox ? { x: d.pbox.x, y: d.pbox.y, w: d.pbox.w, h: d.pbox.h } : null };
      },
      rect: function () { if (!W || !W.box) return null; var b = W.box, p = W.pbox && (W.stage === 'rows' || W.stage === 'pwait') ? W.pbox : null; if (!p) return { x: b.x, y: b.y, w: b.w, h: b.h }; var x = Math.min(b.x, p.x), y = Math.min(b.y, p.y); return { x: x, y: y, w: Math.max(b.x + b.w, p.x + p.w) - x, h: Math.max(b.y + b.h, p.y + p.h) - y }; },
      lastResult: function () { return last; },
      lastDrawn: function () { return drawnRects.slice(); },
      setParams: function (p) { setParams(p); MW = {}; },
      setTable: setTable,
      params: function () { var c = {}; for (var k in DEFAULTS) c[k] = P[k]; return c; },
      measure: function (s) { return textW(s); }
    };
  }

  root.GameDNA_LevelUpGrowth = { version: VERSION, DEFAULTS: DEFAULTS, create: create };
})(typeof window !== 'undefined' ? window : this);
