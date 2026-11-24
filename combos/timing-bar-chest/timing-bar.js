/* GameDNA F-01 · Timing-bar minigame · module v1 (plain script, no dependencies, one global: GameDNA_TimingBar)
 *
 *   const tb = GameDNA_TimingBar.create({
 *     view: { w: 256, h: 224 },               // or bounds: { x, y, w, h } (play field, HUD excluded)
 *     skin: 'pixel16',                        // optional; drawn through GameDNA_Skin when skin-api.js is loaded
 *     seed: 7,                                // random zone positions come from this seed only (never from the game's RNG)
 *     params: { difficulty: 'normal' },       // see DEFAULTS
 *     getObstacles: () => [{ x, y, w, h, id }],   // optional: UI rects (no id) are never covered; sprites (id) avoided when cheap
 *     onShake: (px, ms) => {}, onSfx: name => {}, // optional callbacks; errors inside them are caught
 *   });
 *   tb.start({ label: 'PICK THE LOCK', hits: 1, auto: autoplay ? 'good' : null, onDone: r => {} })  // -> Promise<result>
 *   tb.press()               // the host's confirm input while busy(); latched, so a 1-frame tap counts
 *   tb.key(code, down)       // or route raw keys: returns true only for keys it used
 *   tb.busy()                // true from start() until the overlay has closed: route confirm here, pause the world
 *   tb.update(dtMs)          // the only clock (fixed step), so ?t=&freeze=1 is deterministic
 *   tb.draw(ctx)             // native-resolution 2D context, last in the draw pass (over world and HUD)
 *   result = { grade: 'miss'|'good'|'great'|'perfect'|'cancel', offset, hits: [{grade, offset}], score, timeout, auto }
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var DEFAULTS = { difficulty: 'normal', speed: 1.1, good: 0.30, great: 0.14, perfect: 0.05, motion: 'pingpong', ease: 'none',
    hits: 1, zones: 'random', centre: 0.5, assist: 'off', width: 160, position: 'center', dim: 0.3, passes: 4, shake: 'on',
    autoGrade: 'good', holdMs: 650, armMs: 240 };
  var PRESETS = {
    easy:   { speed: 0.75, good: 0.40, great: 0.20, perfect: 0.08, ease: 'none' },
    normal: { speed: 1.1, good: 0.30, great: 0.14, perfect: 0.05, ease: 'none' },
    hard:   { speed: 1.6, good: 0.20, great: 0.09, perfect: 0.035, ease: 'none' },
    expert: { speed: 1.9, good: 0.16, great: 0.07, perfect: 0.03, ease: 'sine' }
  };
  var PRESET_KEYS = ['speed', 'good', 'great', 'perfect', 'ease'];
  var GRADES = ['miss', 'good', 'great', 'perfect'], RANK = { miss: 0, good: 1, great: 2, perfect: 3 };
  var WORD = { miss: 'MISS', good: 'GOOD', great: 'GREAT!', perfect: 'PERFECT!', cancel: '' };
  var INTRO = 140, HITMS = 380, OUTRO = 140, STEP = 1000 / 60;
  var ACTION_KEYS = { KeyZ: 1, z: 1, Z: 1, Space: 1, ' ': 1, Enter: 1, NumpadEnter: 1 };
  var CANCEL_KEYS = { KeyX: 1, x: 1, X: 1, Escape: 1, Backspace: 1 };

  /* ---------- 5x7 font (regular for titles, bold = every stroke widened 1 px to the right, for grade words) ---------- */
  var F = {
    A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.', C: '.###.|#...#|#....|#....|#....|#...#|.###.',
    D: '####.|#...#|#...#|#...#|#...#|#...#|####.', E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
    G: '.####|#....|#....|#..##|#...#|#...#|.###.', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#', I: '###|.#.|.#.|.#.|.#.|.#.|###',
    J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..', K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
    M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#', O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
    P: '####.|#...#|#...#|####.|#....|#....|#....', Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..', U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
    V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..', W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
    0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.', 2: '.###.|#...#|....#|...#.|..#..|.#...|#####',
    3: '#####|...#.|..#..|...#.|....#|#...#|.###.', 4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
    6: '..##.|.#...|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...', 8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
    9: '.###.|#...#|#...#|.####|....#|...#.|.##..',
    '!': '#|#|#|#|#|.|#', '?': '.###.|#...#|....#|...#.|..#..|.....|..#..', '.': '.|.|.|.|.|.|#', ',': '..|..|..|..|..|.#|#.', "'": '#|#|.|.|.|.|.',
    '-': '....|....|....|####|....|....|....', ':': '.|#|.|.|.|#|.', '/': '....#|...#.|...#.|..#..|.#...|.#...|#....', '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
    'x': '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#', '%': '##..#|##.#.|...#.|..#..|.#...|.#.##|#..##'
  };
  var ROWS = {}, BOLD = {};
  function rowsOf(ch) { if (ROWS[ch]) return ROWS[ch]; var s = F[ch] || F['?']; return (ROWS[ch] = s.split('|')); }
  function boldOf(ch) {
    if (BOLD[ch]) return BOLD[ch];
    return (BOLD[ch] = rowsOf(ch).map(function (r) { var o = ''; for (var i = 0; i <= r.length; i++) o += r[i] === '#' || r[i - 1] === '#' ? '#' : '.'; return o; }));
  }
  function upper(s) { return String(s == null ? '' : s).toUpperCase(); }
  function smallW(s) { var w = 0; s = upper(s); for (var i = 0; i < s.length; i++) w += (s[i] === ' ' ? 3 : rowsOf(F[s[i]] ? s[i] : '?')[0].length) + 1; return Math.max(0, w - 1); }
  function smallText(ctx, s, x, y, col, sh) {
    s = upper(s);
    for (var pass = 0; pass < 2; pass++) {
      if (pass === 0 && !sh) continue;
      var cx = x; ctx.fillStyle = pass ? col : sh;
      for (var i = 0; i < s.length; i++) {
        if (s[i] === ' ') { cx += 4; continue; }
        var r = rowsOf(F[s[i]] ? s[i] : '?');
        for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < r[ry].length; rx++) if (r[ry][rx] === '#') ctx.fillRect(cx + rx + (pass ? 0 : 1), y + ry + (pass ? 0 : 1), 1, 1);
        cx += r[0].length + 1;
      }
    }
  }

  /* ---------- built-in pixel16 look ---------- */
  // zone ramps [edge light, top, base, dark]; label ramps [highlight, top, bottom, shade]
  var Z16 = {
    good:    ['#c8ffd8', '#6ad08a', '#2e9a5a', '#185a36'],
    great:   ['#fff6c8', '#ffe070', '#e8b020', '#8a5e10'],
    perfect: ['#ffffff', '#e8fbff', '#8ae4ff', '#2a7ab0']
  };
  var L16 = {
    miss:    ['#f4f0ff', '#c8c0e0', '#8a7cb0', '#3e3060'],
    good:    ['#f0fff0', '#b8ffc0', '#4ad870', '#22904a'],
    great:   ['#ffffff', '#fff2a0', '#ffc030', '#b06a10'],
    perfect: ['#ffffff', '#e8fbff', '#7adcff', '#2a6ab8']
  };
  var W16 = { out: '#0a0614', well: '#241a38', well2: '#2c2244', top: '#3a2e58', bottom: '#120c20', tick: '#4a3e6a' };
  var N16 = { ink: '#06061a', needle: '#fff6d0', head: '#ffe070', headDark: '#b07818', dim: '#06061a', title: '#e8ecff', title2: '#b8c4f0', shadow: '#0a0c24' };
  var WIN16 = ['#4c5a8a', '#3e4a76', '#323c62', '#262e4e', '#c8d4f4', '#0a0e22'];

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function ov(a, b) { return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); }
  function mkCanvas(w, h) { try { var c = root.document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; } catch (e) { return null; } }
  function hex2(c) { var m = /^#([0-9a-f]{6})$/i.exec(c || ''); if (!m) return null; var n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { var x = hex2(a), y = hex2(b); if (!x || !y) return a; return '#' + [0, 1, 2].map(function (i) { var v = Math.round(x[i] + (y[i] - x[i]) * t); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function rng(seed) {   // mulberry32
    var s = (seed >>> 0) || 1;
    return function () { s = (s + 0x6d2b79f5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function strSeed(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function create(o) {
    o = o || {};
    var API = root.GameDNA_Skin || null, SK = null;
    try { SK = API && API.resolve ? API.resolve(o.skin) : null; } catch (e) { SK = null; }
    var U = {}, warned = {}, lastCanvas = null, clock = 0, checks = 0;
    var baseSeed = o.seed == null ? 1 : typeof o.seed === 'number' ? o.seed >>> 0 : strSeed(o.seed);
    setParams(o.params || {});
    var C = null;            // the active check (null when idle)
    var last = null, drawnRects = [], held = {};

    function dbg(e) { if (typeof o.debug === 'function') { try { o.debug(e); } catch (x) { } } }
    function warnOnce(key, msg) { if (warned[key]) return; warned[key] = 1; if (root.console) console.warn(msg); }
    function call(fn, a, b) { if (typeof fn === 'function') { try { return fn(a, b); } catch (x) { warnOnce('cb', 'GameDNA_TimingBar: a host callback threw: ' + x); } } return undefined; }
    function setParams(p) { p = p || {}; for (var k in p) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && p[k] != null && p[k] !== '') U[k] = p[k]; }

    /* ---------- effective settings for one check: defaults < difficulty preset < your params < start() options ---------- */
    function settings(so) {
      var P = {}, k, diff = String(so.difficulty || U.difficulty || DEFAULTS.difficulty);
      for (k in DEFAULTS) P[k] = DEFAULTS[k];
      var pre = PRESETS[diff] || PRESETS.normal;
      for (k in pre) P[k] = pre[k];
      for (k in U) if (k !== 'difficulty') P[k] = U[k];
      if (so.difficulty && PRESETS[so.difficulty]) for (k in pre) P[k] = pre[k];   // a difficulty given to start() beats create() params
      for (k in so) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && so[k] != null && k !== 'zones') P[k] = so[k];
      P.difficulty = diff;
      for (k in DEFAULTS) if (typeof DEFAULTS[k] === 'number') P[k] = num(P[k], DEFAULTS[k]);
      P.speed = clamp(P.speed, 0.2, 4); P.hits = clamp(Math.round(P.hits), 1, 5); P.centre = clamp(P.centre, 0.1, 0.9);
      P.dim = clamp(P.dim, 0, 0.8); P.holdMs = clamp(P.holdMs, 200, 3000); P.armMs = clamp(P.armMs, INTRO, 1500); P.passes = Math.max(1, P.passes);
      P.good = clamp(P.good, 0.04, 0.8); P.great = clamp(P.great, 0.02, P.good); P.perfect = clamp(P.perfect, 0.01, P.great);
      if (String(P.assist) === 'on') {
        P.speed *= 0.6; P.good = Math.min(0.6, P.good * 1.5); P.great = Math.min(P.good * 0.62, P.great * 1.5); P.perfect = Math.min(P.great * 0.6, Math.max(0.06, P.perfect * 1.5));
        P.holdMs *= 1.5; P.passes = Infinity;
      }
      P.width = Math.round(clamp(P.width, 64, 400));
      return P;
    }

    /* ---------- field and placement ---------- */
    function field() {
      var b = o.bounds;
      if (typeof b === 'function') b = call(b);
      if (!b && o.view) b = { x: 0, y: 0, w: o.view.w, h: o.view.h };
      if (!b && lastCanvas) b = { x: 0, y: 0, w: lastCanvas.width, h: lastCanvas.height };
      if (!b || !(b.w > 0) || !(b.h > 0)) return null;
      return { x: num(b.x, 0), y: num(b.y, 0), w: b.w, h: b.h };
    }
    function obstacles() {
      var out = [], a = call(o.getObstacles), u = call(o.uiRects);
      [a, u].forEach(function (L, j) { if (L && L.length) for (var i = 0; i < L.length; i++) { var r = L[i]; if (r && r.w > 0 && r.h > 0 && isFinite(r.x) && isFinite(r.y)) out.push({ x: r.x, y: r.y, w: r.w, h: r.h, ui: j === 1 || r.id == null, id: r.id }); } });
      return out;
    }
    var HEAD = 13;   // headroom above the panel for the grade word (its pop rise, outline and a 2 px gap)
    function layout(P, f) {
      var bw = Math.min(P.width, Math.max(48, f.w - 32)), pw = bw + 24, ph = 44;
      return { bw: bw, pw: pw, ph: ph };
    }
    function place(chk) {
      var f = field(); if (!f) return false;
      var L = layout(chk.P, f), O = obstacles(), w = L.pw, h = L.ph + HEAD, a = chk.anchor, P = chk.P;
      var wantX, wantY;
      if (a) { wantX = Math.round(a.x - w / 2); wantY = Math.round(a.y - h - 4); if (wantY < f.y + 4) wantY = Math.round(a.y + a.h + 4); O.push({ x: a.x - Math.max(4, a.w / 2), y: a.y, w: Math.max(8, a.w), h: Math.max(4, a.h), anchor: true }); }
      else { wantX = Math.round(f.x + (f.w - w) / 2); var fr = P.position === 'upper' ? 0.28 : P.position === 'lower' ? 0.72 : 0.5; wantY = Math.round(f.y + f.h * fr - h / 2); }
      var m = f.w >= w + 16 ? 4 : 0, lo = f.y + (f.h >= h + 8 ? 4 : 0), hi = f.y + f.h - h - (f.h >= h + 8 ? 4 : 0), lx = f.x + m, hx = f.x + f.w - w - m;
      wantX = clamp(wantX, lx, Math.max(lx, hx)); wantY = clamp(wantY, lo, Math.max(lo, hi));
      var best = null, bestC = 1e18, DX = [0, -16, 16, -32, 32, -56, 56];
      for (var d = 0; d <= f.h; d += 2) {
        for (var s = -1; s <= 1; s += 2) {
          if (d === 0 && s > 0) continue;
          var y = wantY + d * s; if (y < lo || y > Math.max(lo, hi)) continue;
          for (var j = 0; j < DX.length; j++) {
            var x = clamp(wantX + DX[j], lx, Math.max(lx, hx)), r = { x: x, y: y, w: w, h: h }, bad = false, spr = 0;
            for (var i = 0; i < O.length; i++) { if (!hit(r, O[i])) continue; if (O[i].ui) { bad = true; break; } spr += ov(r, O[i]) * (O[i].anchor ? 25 : 1); }
            if (bad) continue;
            var c = d + Math.abs(x - wantX) * 0.6 + spr * 0.15;
            if (c < bestC) { bestC = c; best = { x: x, y: y }; }
          }
        }
        if (best && d > bestC) break;
      }
      if (!best) { best = { x: wantX, y: wantY }; dbg({ event: 'noroom' }); warnOnce('noroom', 'GameDNA_TimingBar: no spot clear of your UI rects; drawn at the preferred spot. Check bounds / getObstacles.'); }
      chk.box = { x: best.x, y: best.y + HEAD, w: w, h: L.ph }; chk.bw = L.bw;
      chk.bar = { x: chk.box.x + 12, y: chk.box.y + 24, w: L.bw, h: 10 };
      return true;
    }

    /* ---------- zones ---------- */
    function makeZones(chk, n) {
      var P = chk.P, so = chk.so;
      if (so.zones && so.zones.length) {
        var Z = [];
        so.zones.forEach(function (z) { if (z && RANK[z.grade] > 0) { var a = clamp(num(z.from, 0), 0, 1), b = clamp(num(z.to, 0), 0, 1); if (b > a) Z.push({ grade: z.grade, a: a, b: b }); } });
        if (Z.length) return Z;
        warnOnce('zones', 'GameDNA_TimingBar: start({zones}) had no usable zone ({grade, from, to}); using generated zones.');
      }
      var bw = chk.bw || P.width, vmax = P.speed * (P.ease === 'sine' ? Math.PI / 2 : 1) * (P.ease === 'accel' ? 1 + 0.12 * Math.min(P.passes, 6) : 1);
      var perfect = Math.max(P.perfect, vmax * STEP / 1000 * 1.25, 3 / bw), great = Math.max(P.great, perfect + 6 / bw), good = Math.max(P.good, great + 10 / bw);
      var c;
      if (String(P.zones) === 'fixed') c = P.centre;
      else { var lo = Math.max(0.32, good / 2 + 0.04), hi = 1 - good / 2 - 0.04; c = lo < hi ? lo + chk.rand() * (hi - lo) : 0.5; }
      c = clamp(c, good / 2 + 0.01, 1 - good / 2 - 0.01);
      return [{ grade: 'good', a: c - good / 2, b: c + good / 2 }, { grade: 'great', a: c - great / 2, b: c + great / 2 }, { grade: 'perfect', a: c - perfect / 2, b: c + perfect / 2 }];
    }
    function colOf(f, bw) { return Math.round(f * bw); }
    function gradeAtCol(chk, x) {
      var g = 0;
      for (var i = 0; i < chk.zones.length; i++) { var z = chk.zones[i]; if (x >= colOf(z.a, chk.bw) && x < colOf(z.b, chk.bw) && RANK[z.grade] > g) g = RANK[z.grade]; }
      return GRADES[g];
    }
    function bestCentre(chk) {   // centre of the highest zone, for the signed offset
      var top = null;
      chk.zones.forEach(function (z) { if (!top || RANK[z.grade] > RANK[top.grade]) top = z; });
      return top ? (top.a + top.b) / 2 : 0.5;
    }
    function autoTarget(chk, grade) {
      var order = [grade, 'good', 'great', 'perfect', 'miss'];
      for (var k = 0; k < order.length; k++) {
        var g = order[k], best = null, start = -1;
        for (var x = 0; x <= chk.bw; x++) {
          var inside = x < chk.bw && gradeAtCol(chk, x) === g;
          if (inside && start < 0) start = x;
          if (!inside && start >= 0) { var len = x - start; if (!best || len > best.len) best = { a: start, len: len }; start = -1; }
        }
        if (best) return best.a + Math.floor((best.len - 1) / 2);
      }
      return Math.floor(chk.bw / 2);
    }

    /* ---------- marker motion: ph = distance travelled in bar widths ---------- */
    function fold(chk, ph) { if (chk.P.motion === 'linear') return clamp(ph, 0, 1); var u = ph % 2; return u <= 1 ? u : 2 - u; }
    function shape(chk, u) { return chk.P.ease === 'sine' ? (1 - Math.cos(Math.PI * u)) / 2 : u; }
    function unshape(chk, p) { return chk.P.ease === 'sine' ? Math.acos(clamp(1 - 2 * p, -1, 1)) / Math.PI : p; }
    function posOf(chk, ph) { return shape(chk, fold(chk, ph)); }
    function colAt(chk, ph) { return clamp(Math.round(posOf(chk, ph) * (chk.bw - 1)), 0, chk.bw - 1); }
    function crossing(chk, a, b, col) {   // first ph in (a, b] where the marker sits exactly on column col
      var u = unshape(chk, col / Math.max(1, chk.bw - 1)), c = [];
      if (chk.P.motion === 'linear') c.push(u);
      else for (var k = Math.floor(a / 2) * 2; k <= b + 2; k += 2) { c.push(k + u); c.push(k + 2 - u); }
      var best = null;
      c.forEach(function (v) { if (v > a + 1e-9 && v <= b + 1e-9 && (best === null || v < best)) best = v; });
      return best;
    }
    function rate(chk) { return chk.P.speed * (chk.P.ease === 'accel' ? 1 + 0.12 * Math.min(Math.floor(chk.ph), 6) : 1) / 1000; }

    /* ---------- start / resolve ---------- */
    function start(so) {
      so = so || {};
      if (C && C.stage !== 'done') { dbg({ event: 'ignored', label: so.label }); return C.promise; }
      var chk = { so: so, P: settings(so), stage: 'intro', t: 0, ph: 0, hit: 0, results: [], trail: [], parts: [], label: so.label != null ? upper(so.label) : '', hint: so.hint != null ? upper(so.hint) : '',
        anchor: so.anchor && isFinite(so.anchor.x) && isFinite(so.anchor.y) ? { x: +so.anchor.x, y: +so.anchor.y, w: num(so.anchor.w, 16), h: num(so.anchor.h, 16) } : null, latch: false, flashT: -1, jolt: 0, id: ++checks };
      var sd = so.seed != null ? (typeof so.seed === 'number' ? so.seed >>> 0 : strSeed(so.seed)) : (baseSeed + Math.imul(checks, 0x9e3779b1)) >>> 0;
      chk.rand = rng(sd);
      var a = so.auto != null ? so.auto : typeof o.autoplay === 'function' ? call(o.autoplay) : o.autoplay;
      chk.auto = a === true ? String(chk.P.autoGrade) : typeof a === 'string' && (RANK[a] != null || a === 'seeded') ? a : null;
      if (!place(chk)) { chk.bw = Math.min(chk.P.width, 232); chk.pending = true; }
      chk.zones = makeZones(chk, 0); chk.target = chk.auto ? autoTarget(chk, pickAuto(chk)) : -1;
      chk.promise = typeof Promise === 'function' ? new Promise(function (res) { chk.resolve = res; }) : null;
      C = chk;
      dbg({ event: 'start', id: chk.id, label: chk.label, hits: chk.P.hits, auto: chk.auto, zones: chk.zones.slice() });
      call(o.onSfx, 'open');
      return chk.promise || { then: function (fn) { chk.thenFn = fn; } };
    }
    function pickAuto(chk) {
      if (chk.auto !== 'seeded') return chk.auto;
      var r = chk.rand(); return r < 0.2 ? 'perfect' : r < 0.55 ? 'great' : r < 0.9 ? 'good' : 'miss';
    }
    function resolveHit(chk, timeout) {
      var col = colAt(chk, chk.ph), g = timeout ? 'miss' : gradeAtCol(chk, col), off = posOf(chk, chk.ph) - bestCentre(chk);
      var r = { grade: g, offset: Math.round(off * 1000) / 1000, col: col, timeout: !!timeout };
      chk.results.push(r); chk.hit++; chk.flashT = 0; chk.lastCol = col; chk.trail = [];
      burst(chk, col, g);
      if (g === 'perfect' && chk.P.shake !== 'off') call(o.onShake, 2, 120);
      if (g === 'miss') { chk.jolt = 1; if (chk.P.shake !== 'off') call(o.onShake, 1, 80); }
      call(o.onSfx, g);
      call(chk.so.onHit, { grade: g, offset: r.offset, index: chk.hit - 1 });
      dbg({ event: 'hit', id: chk.id, grade: g, col: col, offset: r.offset, timeout: !!timeout });
      chk.stage = chk.hit >= chk.P.hits ? 'result' : 'hit'; chk.t = 0;
      if (chk.stage === 'result') chk.final = summary(chk);
    }
    function summary(chk) {
      var sum = 0, n = chk.results.length;
      chk.results.forEach(function (r) { sum += RANK[r.grade]; });
      var g = GRADES[clamp(Math.floor(sum / Math.max(1, n) + 1e-9), 0, 3)];
      var off = n ? chk.results[n - 1].offset : 0;
      if (n > 1) { off = 0; chk.results.forEach(function (r) { off += r.offset; }); off = Math.round(off / n * 1000) / 1000; }
      return { grade: g, offset: off, hits: chk.results.map(function (r) { return { grade: r.grade, offset: r.offset }; }), score: sum, timeout: chk.results.some(function (r) { return r.timeout; }), auto: !!chk.auto, label: chk.label };
    }
    function finish(chk, res) {
      last = res; C = null;
      dbg({ event: 'done', id: chk.id, grade: res.grade, offset: res.offset });
      call(o.onSfx, 'close');
      call(chk.so.onDone, res); call(o.onDone, res);
      if (chk.resolve) chk.resolve(res); else if (chk.thenFn) call(chk.thenFn, res);
    }
    function burst(chk, col, g) {
      var n = g === 'perfect' ? 12 : g === 'great' ? 7 : g === 'good' ? 4 : 0;
      for (var i = 0; i < n; i++) {
        var ang = -Math.PI * (0.1 + 0.8 * chk.rand()), sp = 0.04 + chk.rand() * 0.05;
        chk.parts.push({ x: col, y: 0, vx: Math.cos(ang) * sp * (chk.rand() < 0.5 ? -1 : 1), vy: Math.sin(ang) * sp, life: 260 + chk.rand() * 200, age: 0, g: g, big: chk.rand() < 0.35 });
      }
    }

    /* ---------- clock ---------- */
    function update(dt) {
      try {
        dt = num(dt, 0); if (dt < 0) dt = 0; if (dt > 250) dt = 250;
        clock += dt;
        var chk = C; if (!chk) return;
        if (chk.pending) { if (place(chk)) { chk.pending = false; chk.zones = makeZones(chk, 0); if (chk.auto) chk.target = autoTarget(chk, pickAuto(chk)); } }
        for (var i = chk.parts.length - 1; i >= 0; i--) { var q = chk.parts[i]; q.age += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 0.0002 * dt; if (q.age >= q.life) chk.parts.splice(i, 1); }
        if (chk.flashT >= 0) chk.flashT += dt;
        if (chk.jolt > 0) chk.jolt = Math.max(0, chk.jolt - dt / 260);
        chk.t += dt;
        var guard = 0;
        while (chk === C && guard++ < 6) {
          if (chk.stage === 'intro') { if (chk.t < chk.P.armMs) { chk.latch = false; break; } chk.t -= chk.P.armMs; chk.stage = 'aim'; continue; }
          if (chk.stage === 'aim') {
            if (chk.latch && !chk.auto) { chk.latch = false; resolveHit(chk, false); continue; }
            chk.latch = false;
            var a = chk.ph, b = a + rate(chk) * chk.t;
            chk.t = 0;
            if (chk.auto && chk.target >= 0) { var hx = crossing(chk, a, b, chk.target); if (hx !== null) { chk.ph = hx; resolveHit(chk, false); continue; } }
            var limit = chk.P.motion === 'linear' ? 1 : chk.P.passes;
            if (b >= limit) { chk.ph = limit; resolveHit(chk, true); continue; }
            chk.trail.unshift(colAt(chk, a)); if (chk.trail.length > 2) chk.trail.length = 2;
            chk.ph = b; break;
          }
          if (chk.stage === 'hit') {
            chk.latch = false;
            if (chk.t < HITMS) break;
            chk.t = 0; chk.stage = 'aim'; chk.lastCol = null; if (chk.P.motion === 'linear') chk.ph = 0;
            if (String(chk.P.zones) !== 'fixed' || (chk.so.zones && chk.so.zones.length)) { chk.zones = makeZones(chk, chk.hit); }
            if (chk.auto) chk.target = autoTarget(chk, pickAuto(chk));
            break;
          }
          if (chk.stage === 'result') { chk.latch = false; if (chk.t < chk.P.holdMs) break; chk.t -= chk.P.holdMs; chk.stage = 'outro'; continue; }
          if (chk.stage === 'outro') { if (chk.t < OUTRO) break; chk.stage = 'done'; finish(chk, chk.final); break; }
          break;
        }
      } catch (e) { warnOnce('update', 'GameDNA_TimingBar.update failed: ' + e); }
    }

    /* ---------- input ---------- */
    function press() { if (C && C.stage === 'aim' && !C.auto) { C.latch = true; return true; } return !!C; }
    function key(code, down) {
      code = String(code == null ? '' : code);
      if (!C) { if (!down) held[code] = false; return false; }
      if (ACTION_KEYS[code]) {
        if (down) { if (!held[code]) press(); held[code] = true; } else held[code] = false;
        return true;
      }
      if (CANCEL_KEYS[code] && C.so.cancel) { if (down && !held[code]) cancel(); held[code] = !!down; return true; }
      return false;
    }
    function cancel() {
      var chk = C; if (!chk || chk.stage === 'result' || chk.stage === 'outro' || chk.stage === 'done') return false;
      chk.final = { grade: 'cancel', offset: 0, hits: chk.results.map(function (r) { return { grade: r.grade, offset: r.offset }; }), score: 0, timeout: false, auto: !!chk.auto, label: chk.label, cancelled: true };
      chk.stage = 'outro'; chk.t = 0; return true;
    }

    /* ---------- drawing ---------- */
    function pixelSkin() { return !SK || SK.pixel !== false; }
    function tok(p, d) { if (!SK) return d; try { var v = SK.token(p); return typeof v === 'string' && v !== p ? v : d; } catch (e) { return d; } }
    function zoneRamp(g) {
      if (!SK || SK.id === 'pixel16') return Z16[g];
      var base = { good: tok('fx.heal', '#3aa860'), great: tok('fx.crit', '#f0b030'), perfect: tok('fx.cold', '#6ad8f0') }[g] || '#888888', ink = tok('ink', N16.ink);
      return [mix(base, '#ffffff', 0.7), mix(base, '#ffffff', 0.3), base, mix(base, ink, 0.45)];
    }
    function labelRamp(g) {
      if (!SK || SK.id === 'pixel16') return L16[g] || L16.miss;
      var base = { miss: tok('text.dim', '#8a90a8'), good: tok('fx.heal', '#3aa860'), great: tok('fx.crit', '#f0b030'), perfect: tok('fx.cold', '#6ad8f0') }[g] || '#888888', ink = tok('ink', N16.ink);
      return [mix(base, '#ffffff', 0.85), mix(base, '#ffffff', 0.45), base, mix(base, ink, 0.4)];
    }
    function wellCols() {
      if (!SK || SK.id === 'pixel16') return W16;
      var ink = tok('ink', N16.ink), f = tok('ui.fillTo', tok('ui.fill', '#262e4e'));
      return { out: ink, well: mix(f, ink, 0.55), well2: mix(f, ink, 0.45), top: mix(f, ink, 0.25), bottom: mix(f, ink, 0.8), tick: mix(f, '#ffffff', 0.2) };
    }
    function needleCols() {
      if (!SK || SK.id === 'pixel16') return N16;
      return { ink: tok('ink', N16.ink), needle: tok('paper', N16.needle), head: tok('text.accent', tok('fx.crit', N16.head)), headDark: mix(tok('fx.crit', N16.head), tok('ink', N16.ink), 0.5),
        dim: tok('ink', N16.ink), title: tok('text.main', N16.title), title2: tok('text.main2', tok('text.main', N16.title2)), shadow: tok('text.shadow', N16.shadow) };
    }
    var ART = {};
    function wordArt(text, s, g) {
      var key = text + '|' + s + '|' + g + '|' + (SK ? SK.id : '-'); if (ART[key]) return ART[key];
      var R = labelRamp(g), ink = needleCols().ink, letters = [], x = 0, sp = Math.max(1, s), i;
      for (i = 0; i < text.length; i++) { var ch = text[i]; if (ch === ' ') { x += 3 * s + sp; continue; } var rows = boldOf(F[ch] ? ch : '?'); letters.push({ x: x, rows: rows }); x += rows[0].length * s + sp; }
      var tw = Math.max(1, x - sp), pad = 1, W = tw + 2, H = 7 * s + 3, M = new Uint8Array(W * H);
      letters.forEach(function (L) { for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < L.rows[ry].length; rx++) if (L.rows[ry][rx] === '#') for (var yy = 0; yy < s; yy++) for (var xx = 0; xx < s; xx++) M[(pad + ry * s + yy) * W + pad + L.x + rx * s + xx] = 1; });
      var img = mkCanvas(W, H), wht = mkCanvas(W, H); if (!img || !wht) return null;
      var c1 = img.getContext('2d'), c2 = wht.getContext('2d'), on = function (X, Y) { return X >= 0 && Y >= 0 && X < W && Y < H && M[Y * W + X]; };
      for (var y = 0; y < H; y++) for (var x2 = 0; x2 < W; x2++) {
        if (M[y * W + x2]) continue; var near = false;
        for (var dy = -2; dy <= 1 && !near; dy++) for (var dx = -1; dx <= 1 && !near; dx++) if (on(x2 + dx, y + dy) && (dy >= -1 || dx === 0)) near = true;
        if (near) { c1.fillStyle = ink; c1.fillRect(x2, y, 1, 1); c2.fillStyle = ink; c2.fillRect(x2, y, 1, 1); }
      }
      for (y = 0; y < H; y++) for (x2 = 0; x2 < W; x2++) {
        if (!M[y * W + x2]) continue; var row = Math.floor((y - pad) / s), c = !on(x2, y - 1) ? R[0] : !on(x2, y + 1) ? R[3] : row < 4 ? R[1] : R[2];
        c1.fillStyle = c; c1.fillRect(x2, y, 1, 1); c2.fillStyle = '#ffffff'; c2.fillRect(x2, y, 1, 1);
      }
      return (ART[key] = { img: img, white: wht, w: W, h: H });
    }
    function frame16(ctx, r) {
      var x = r.x, y = r.y, w = r.w, h = r.h, i, pa = ctx.globalAlpha;
      ctx.globalAlpha = pa * 0.95;
      for (i = 0; i < h - 2; i++) { ctx.fillStyle = WIN16[Math.min(3, Math.floor(i / (h - 2) * 4))]; ctx.fillRect(x + 1, y + 1 + i, w - 2, 1); }
      ctx.globalAlpha = pa; ctx.fillStyle = N16.ink;
      ctx.fillRect(x + 2, y, w - 4, 1); ctx.fillRect(x + 2, y + h - 1, w - 4, 1); ctx.fillRect(x, y + 2, 1, h - 4); ctx.fillRect(x + w - 1, y + 2, 1, h - 4);
      ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + w - 2, y + 1, 1, 1); ctx.fillRect(x + 1, y + h - 2, 1, 1); ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
      ctx.fillStyle = WIN16[4]; ctx.fillRect(x + 2, y + 1, w - 4, 1); ctx.fillRect(x + 1, y + 2, 1, h - 5);
      ctx.fillStyle = WIN16[5]; ctx.fillRect(x + 2, y + h - 2, w - 4, 1); ctx.fillRect(x + w - 2, y + 2, 1, h - 4);
      [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]].forEach(function (p) { ctx.fillStyle = '#7a5410'; ctx.fillRect(p[0], p[1], 2, 2); ctx.fillStyle = '#ffe070'; ctx.fillRect(p[0], p[1], 1, 1); });
    }
    function title(ctx, s, x, y, align, col, col2) {
      if (!s) return 0;
      if (SK && !pixelSkin()) { try { return SK.text(ctx, s, x, y - 1, { font: 'ui', align: align, color: col, outline: false, shadow: false, scale: 1.2 }); } catch (e) { } }   // smooth skins: no outline (it smears at small sizes), larger cap height
      if (SK) { try { return SK.text(ctx, s, x, y, { font: 'ui', align: align, color: col, color2: col2 }); } catch (e) { } }
      var w = smallW(s); if (align === 'right') x -= w; else if (align === 'center') x -= Math.floor(w / 2);
      smallText(ctx, s, x, y, col, N16.shadow); return w;
    }
    function stepAlpha(a) { if (SK && API && API.motion && SK.motion && SK.motion.fadeSteps) return API.motion.fade(SK, a); var S = [1, 0.75, 0.5, 0.25]; for (var i = 0; i < S.length; i++) if (a >= S[i] - 1e-9) return S[i]; return 0; }

    function draw(ctx, ox, oy) {
      drawnRects = [];
      if (!ctx) return;
      try { if (ctx.canvas) lastCanvas = ctx.canvas; } catch (e) { }
      var chk = C; if (!chk) return;
      if (chk.pending && !place(chk)) return;
      if (chk.pending) { chk.pending = false; chk.zones = makeZones(chk, 0); if (chk.auto) chk.target = autoTarget(chk, pickAuto(chk)); }
      ox = num(ox, 0); oy = num(oy, 0);
      ctx.save();
      try { paint(ctx, chk, ox, oy); } catch (e) { warnOnce('draw', 'GameDNA_TimingBar.draw failed: ' + e); }
      ctx.restore();
    }
    function paint(ctx, chk, ox, oy) {
      ctx.imageSmoothingEnabled = false;
      var f = field() || { x: 0, y: 0, w: chk.box.x + chk.box.w, h: chk.box.y + chk.box.h };
      var st = chk.stage, open = 1;
      if (st === 'intro') open = clamp(chk.t / INTRO, 0, 1);
      if (st === 'outro') open = 1 - clamp(chk.t / OUTRO, 0, 1);
      if (pixelSkin()) open = Math.round(open * 4) / 4;           // stepped open / close on pixel skins
      var NC = needleCols(), WC = wellCols();
      // dim the field behind the panel
      if (chk.P.dim > 0 && open > 0) { ctx.globalAlpha = chk.P.dim * open; ctx.fillStyle = NC.dim; ctx.fillRect(f.x + ox, f.y + oy, f.w, f.h); ctx.globalAlpha = 1; }
      if (open <= 0) return;
      var jx = chk.jolt > 0 ? Math.round(Math.sin(chk.jolt * 26) * 2 * chk.jolt) : 0;
      var B = chk.box, x0 = B.x + ox + jx, y0 = B.y + oy, ph = Math.max(4, Math.round(B.h * open)), py = y0 + Math.round((B.h - ph) / 2);
      var pr = { x: x0, y: py, w: B.w, h: ph };
      if (SK) { try { SK.frame(ctx, pr, { role: 'window', team: 'n' }); } catch (e) { frame16(ctx, pr); } } else frame16(ctx, pr);
      drawnRects.push({ x: B.x + ox, y: B.y + oy - HEAD, w: B.w, h: B.h + HEAD, head: HEAD, kind: 'panel' });
      if (open < 1) return;
      // title row: label left, hit pips (or hint) right
      var showTitle = !(st === 'hit' || st === 'result' || (st === 'outro' && !chk.final.cancelled));
      if (showTitle) title(ctx, chk.label || 'TIMING', x0 + 9, y0 + 7, 'left', NC.title, NC.title2);
      if (chk.P.hits > 1) {
        for (var i = 0; i < chk.P.hits; i++) {
          var r = chk.results[i], px = x0 + B.w - 12 - (chk.P.hits - 1 - i) * 9, pyy = y0 + 7;
          ctx.fillStyle = NC.ink; ctx.fillRect(px - 1, pyy - 1, 8, 8);
          ctx.fillStyle = r ? (r.grade === 'miss' ? '#5a4a6a' : zoneRamp(r.grade)[2]) : (i === chk.hit && st === 'aim' ? WC.tick : WC.well);
          ctx.fillRect(px, pyy, 6, 6);
          if (r && r.grade !== 'miss') { ctx.fillStyle = zoneRamp(r.grade)[0]; ctx.fillRect(px, pyy, 6, 1); ctx.fillRect(px, pyy, 1, 6); }
          if (r && r.grade === 'miss') { ctx.fillStyle = '#c8c0e0'; for (var d = 1; d < 5; d++) { ctx.fillRect(px + d, pyy + d, 1, 1); ctx.fillRect(px + 5 - d, pyy + d, 1, 1); } }
        }
      } else if (chk.hint && showTitle) title(ctx, chk.hint, x0 + B.w - 9, y0 + 7, 'right', NC.title2, NC.title2);
      // the bar
      var bx = chk.bar.x + ox + jx, by = chk.bar.y + oy, bw = chk.bw, bh = 10;
      ctx.fillStyle = WC.out; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      for (var c = 0; c < bw; c++) { ctx.fillStyle = (c >> 2) & 1 ? WC.well2 : WC.well; ctx.fillRect(bx + c, by, 1, bh); }
      ctx.fillStyle = WC.top; ctx.fillRect(bx, by, bw, 1); ctx.fillStyle = WC.bottom; ctx.fillRect(bx, by + bh - 1, bw, 1);
      for (c = 0; c <= 4; c++) { ctx.fillStyle = WC.tick; ctx.fillRect(bx + Math.round(c * (bw - 1) / 4), by + bh + 2, 1, c % 2 ? 1 : 2); }
      var zs = chk.zones.slice().sort(function (a, b) { return RANK[a.grade] - RANK[b.grade]; }), flashOn = chk.flashT >= 0 && chk.flashT < 120 && Math.floor(chk.flashT / 40) % 2 === 0;
      var lastG = chk.results.length ? chk.results[chk.results.length - 1].grade : null, showHit = st !== 'aim' && st !== 'intro';
      zs.forEach(function (z) {
        var a = colOf(z.a, bw), b = colOf(z.b, bw), R = zoneRamp(z.grade); if (b <= a) return;
        var lit = showHit && flashOn && lastG === z.grade;
        ctx.fillStyle = lit ? '#ffffff' : R[2]; ctx.fillRect(bx + a, by, b - a, bh);
        ctx.fillStyle = lit ? '#ffffff' : R[1]; ctx.fillRect(bx + a, by, b - a, 2);
        ctx.fillStyle = lit ? R[1] : R[3]; ctx.fillRect(bx + a, by + bh - 2, b - a, 2);
        ctx.fillStyle = R[0]; ctx.fillRect(bx + a, by, 1, bh); ctx.fillStyle = R[3]; ctx.fillRect(bx + b - 1, by, 1, bh);
        if (z.grade === 'perfect') {   // notches above and below the sweet spot, and a slow glint
          var m = bx + Math.floor((a + b - 1) / 2);
          ctx.fillStyle = NC.ink; ctx.fillRect(m - 2, by - 5, 5, 1); ctx.fillRect(m - 1, by - 4, 3, 1); ctx.fillRect(m - 2, by + bh + 4, 5, 1); ctx.fillRect(m - 1, by + bh + 3, 3, 1);
          ctx.fillStyle = R[0]; ctx.fillRect(m - 1, by - 5, 3, 1); ctx.fillRect(m, by - 4, 1, 1); ctx.fillRect(m - 1, by + bh + 4, 3, 1); ctx.fillRect(m, by + bh + 3, 1, 1);
          var gl = Math.floor(clock / 90) % 14; if (gl < b - a - 1) { ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + a + 1 + gl, by + 2, 1, bh - 4); }
        }
      });
      // marker: afterimages, needle, head
      var col = st === 'intro' ? colAt(chk, 0) : chk.lastCol != null && st !== 'aim' ? chk.lastCol : colAt(chk, chk.ph), mx = bx + col;
      if (st === 'aim') chk.trail.forEach(function (tc, k) { if (tc === col) return; ctx.globalAlpha = k ? 0.2 : 0.4; ctx.fillStyle = NC.needle; ctx.fillRect(bx + tc, by + 1, 1, bh - 2); ctx.globalAlpha = 1; });
      var white = showHit && chk.flashT >= 0 && chk.flashT < 100;
      ctx.fillStyle = NC.ink; ctx.fillRect(mx - 1, by - 4, 3, bh + 8);
      ctx.fillStyle = white ? '#ffffff' : NC.needle; ctx.fillRect(mx, by - 3, 1, bh + 6);
      ctx.fillStyle = NC.ink; ctx.fillRect(mx - 3, by - 8, 7, 4); ctx.fillRect(mx - 2, by - 9, 5, 1);
      ctx.fillStyle = white ? '#ffffff' : NC.head; ctx.fillRect(mx - 2, by - 7, 5, 2); ctx.fillRect(mx - 1, by - 8, 3, 1);
      ctx.fillStyle = white ? '#ffffff' : NC.headDark; ctx.fillRect(mx - 1, by - 5, 3, 1);
      drawnRects.push({ x: bx - 2 - ox, y: by - 9 - oy, w: bw + 4, h: bh + 14, kind: 'bar' });
      // sparks
      chk.parts.forEach(function (q) {
        var a = 1 - q.age / q.life; ctx.globalAlpha = stepAlpha(a); ctx.fillStyle = q.age < 80 ? '#ffffff' : zoneRamp(q.g === 'miss' ? 'good' : q.g)[q.big ? 1 : 0];
        var s = q.big ? 2 : 1; ctx.fillRect(Math.round(bx + q.x), Math.round(by + 4 + q.y), s, s); ctx.globalAlpha = 1;
      });
      // grade word: small per hit, big for the result
      var word = null, big = false, tt = 0;
      if (st === 'hit') { word = WORD[lastG]; tt = chk.t; }
      else if (st === 'result' || st === 'outro') { word = chk.final && WORD[chk.final.grade]; big = true; tt = st === 'result' ? chk.t : chk.P.holdMs; }
      if (word) drawWord(ctx, chk, word, big, tt, big ? chk.final.grade : lastG, x0, y0, B, mx);
    }
    function drawWord(ctx, chk, word, big, tt, g, x0, y0, B, mx) {
      var s = big ? 2 : 1, life = big ? chk.P.holdMs : HITMS;
      var dy = tt < 50 ? -5 : tt < 100 ? -2 : tt < 140 ? 1 : 0;                 // pop: rise, overshoot, settle (stepped)
      var a = tt > life * 0.72 ? stepAlpha(1 - (tt - life * 0.72) / (life * 0.28)) : 1; if (a <= 0) return;
      if (pixelSkin()) {
        var A = wordArt(word, s, g); if (!A) return;
        var cx = big ? x0 + Math.round((B.w - A.w) / 2) : clamp(mx - Math.round(A.w / 2), x0 + 3, x0 + B.w - A.w - 3);
        var cy = big ? y0 - 6 + dy : y0 + 5 + dy;
        ctx.globalAlpha = a; ctx.drawImage(tt < 60 && g !== 'miss' ? A.white : A.img, cx, cy);
        if (big && g === 'perfect' && tt > 60 && tt < 360) {        // glint across the word
          var gx = cx - 8 + Math.round((tt - 60) / 300 * (A.w + 16));
          ctx.save(); ctx.beginPath(); ctx.rect(gx, cy, 3, A.h); ctx.clip(); ctx.globalAlpha = a * 0.75; ctx.drawImage(A.white, cx, cy); ctx.restore();
        }
        ctx.globalAlpha = 1;
        drawnRects.push({ x: cx, y: cy, w: A.w, h: A.h, kind: 'word', text: word });
      } else {
        var fnt = SK.fonts.display ? 'display' : SK.fonts.title ? 'title' : 'ui', R = labelRamp(g), sc = big ? 1.6 : 1.1, w = 0;
        try { w = SK.measure(word, { font: fnt, scale: sc }); } catch (e) { w = word.length * 7; }
        var tx = big ? x0 + Math.round(B.w / 2) : clamp(mx, x0 + w / 2 + 3, x0 + B.w - w / 2 - 3), ty = big ? y0 - 7 + dy : y0 + 4 + dy;
        SK.text(ctx, word, tx, ty, { font: fnt, scale: sc, align: 'center', color: tt < 60 ? '#ffffff' : R[1], outline: needleCols().ink, outlineWidth: 2, alpha: a });
        drawnRects.push({ x: tx - w / 2, y: ty, w: w, h: big ? 14 : 9, kind: 'word', text: word });
      }
    }

    /* ---------- public ---------- */
    return {
      start: start,
      press: press,
      tap: function () { return press(); },
      key: key,
      cancel: cancel,
      busy: function () { return !!C; },
      update: update,
      draw: draw,
      auto: function (grade) { if (!C) return false; C.auto = grade && (RANK[grade] != null || grade === 'seeded') ? grade : String(C.P.autoGrade); C.target = autoTarget(C, pickAuto(C)); return true; },
      clear: function () { C = null; held = {}; drawnRects = []; },
      state: function () { var c = C; return c ? { id: c.id, stage: c.stage, label: c.label, hit: c.hit, hits: c.P.hits, pos: Math.round(posOf(c, c.ph) * 1000) / 1000, col: colAt(c, c.ph), auto: c.auto,
        zones: c.zones.map(function (z) { return { grade: z.grade, from: Math.round(z.a * 1000) / 1000, to: Math.round(z.b * 1000) / 1000 }; }), results: c.results.map(function (r) { return { grade: r.grade, offset: r.offset }; }) } : null; },
      lastResult: function () { return last; },
      rect: function () { return C && C.box ? { x: C.box.x, y: C.box.y - HEAD, w: C.box.w, h: C.box.h + HEAD } : null; },
      lastDrawn: function () { return drawnRects.slice(); },
      setParams: function (p) { setParams(p); },
      params: function () { var s = settings({}), c = {}; for (var k in DEFAULTS) c[k] = s[k]; return c; }
    };
  }

  root.GameDNA_TimingBar = { version: VERSION, DEFAULTS: DEFAULTS, PRESETS: PRESETS, GRADES: GRADES, create: create };
})(typeof window !== 'undefined' ? window : this);
