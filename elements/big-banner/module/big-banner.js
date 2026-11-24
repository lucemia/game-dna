/* GameDNA C-04 · Big banner text · module v1 (plain script, no dependencies, one global: GameDNA_BigBanner)
 *
 *   const bn = GameDNA_BigBanner.create({
 *     bounds: { x: 0, y: 0, w: 256, h: 192 },   // play field in native px (keep the HUD out); or view: { w, h }
 *     skin: 'pixel16',                         // optional; drawn through GameDNA_Skin when skin-api.js is loaded
 *     params: { enter: 'slide', holdMs: 900 }, // see DEFAULTS
 *     getObstacles: () => [{ x, y, w, h }],    // optional: UI rects (no id) are never covered; sprites (with id) are avoided a little
 *   });
 *   bn.show('PLAYER PHASE', { kind: 'phase', sub: 'TURN 2' }); // kind: phase | enemy | clear | defeat | warn | info
 *   bn.show('VICTORY', { kind: 'clear', hold: 0 });            // hold 0 = stays until dismiss(), clear() or the next show()
 *   bn.busy()          // true while a blocking banner is on screen or queued (the host decides whether to wait)
 *   bn.update(dtMs)    // world time, from the fixed step (so ?t=&freeze=1 shots are deterministic)
 *   bn.draw(ctx)       // native-resolution 2D context, last (over world and HUD), outside any screen-shake translate
 *   bn.clear()         // new game / restart: drops everything at once
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var DEFAULTS = { enter: 'slide', exit: 'wipe', enterMs: 260, holdMs: 900, exitMs: 260, stagger: 35, size: 2, band: 0.72,
    position: 'center', block: 'on', queue: 'queue', glint: 'on', gap: 80 };
  var KINDS = ['phase', 'enemy', 'clear', 'defeat', 'warn', 'info'];

  /* ---------- 5x7 letter font (drawn bold: every stroke widened 1 px to the right, then scaled) ---------- */
  var F = {
    A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.', C: '.###.|#...#|#....|#....|#....|#...#|.###.',
    D: '####.|#...#|#...#|#...#|#...#|#...#|####.', E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
    G: '.###.|#...#|#....|#.###|#...#|#...#|.###.', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#', I: '###|.#.|.#.|.#.|.#.|.#.|###',
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
    '&': '.##..|#..#.|.##..|.#...|#.#.#|#..#.|.##.#', '#': '.#.#.|#####|.#.#.|.#.#.|.#.#.|#####|.#.#.', '%': '##..#|##.#.|...#.|..#..|.#...|.#.##|#..##'
  };
  var ROWS = {}, BOLD = {};
  function rowsOf(ch) { if (ROWS[ch]) return ROWS[ch]; var s = F[ch] || F['?']; return (ROWS[ch] = s.split('|')); }
  function boldOf(ch) {
    if (BOLD[ch]) return BOLD[ch];
    return (BOLD[ch] = rowsOf(ch).map(function (r) { var o = ''; for (var i = 0; i <= r.length; i++) o += r[i] === '#' || r[i - 1] === '#' ? '#' : '.'; return o; }));
  }

  /* ---------- built-in pixel16 look: per kind [highlight, top, bottom, shade, band dark, band mid, band light edge] ---------- */
  var RAMP16 = {
    phase:  ['#ffffff', '#cfe0ff', '#6a9cff', '#2a48b0', '#0c1a5a', '#1a3a9a', '#9cc4ff'],
    enemy:  ['#ffffff', '#ffd4c8', '#ff7a5a', '#b02a20', '#4a0812', '#8a1a22', '#ffb0a0'],
    clear:  ['#ffffff', '#fff2a0', '#ffc030', '#b06a10', '#3a2406', '#7a4e10', '#ffe070'],
    defeat: ['#f4f0ff', '#c8c0e0', '#8a7cb0', '#3e3060', '#0e0a1c', '#241c3a', '#a898c8'],
    warn:   ['#ffffff', '#fff0b0', '#ffa030', '#c04010', '#2a1004', '#6a2a08', '#ffc860'],
    info:   ['#ffffff', '#f4f6ff', '#b8c4f0', '#5a66a0', '#0a0c24', '#262e4e', '#c8d4f4']
  };
  var INK16 = '#06061a';

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(name, s) {
    s = clamp(s, 0, 1);
    if (name === 'out') return 1 - Math.pow(1 - s, 3);
    if (name === 'in') return s * s * s;
    if (name === 'back') { var c = 1.70158; return 1 + (c + 1) * Math.pow(s - 1, 3) + c * Math.pow(s - 1, 2); }
    return s;
  }
  function hit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function ov(a, b) { return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); }
  function mkCanvas(w, h) { try { var c = root.document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; } catch (e) { return null; } }
  function hex2(c) { var m = /^#([0-9a-f]{6})$/i.exec(c || ''); if (!m) return null; var n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { var x = hex2(a), y = hex2(b); if (!x || !y) return a; return '#' + [0, 1, 2].map(function (i) { var v = Math.round(x[i] + (y[i] - x[i]) * t); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }

  function create(o) {
    o = o || {};
    var API = root.GameDNA_Skin || null, SK = null;
    try { SK = API && API.resolve ? API.resolve(o.skin) : null; } catch (e) { SK = null; }
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    setParams(o.params || {});

    var cur = null, queue = [], gapLeft = 0, nextId = 1, recent = [], drawnRects = [], warned = {}, lastCanvas = null, clock = 0;

    function dbg(e) { if (typeof o.debug === 'function') { try { o.debug(e); } catch (x) { } } }
    function call(fn, a, b) { if (typeof fn === 'function') { try { return fn(a, b); } catch (x) { warnOnce('cb', 'GameDNA_BigBanner: a host callback threw: ' + x); } } return undefined; }
    function warnOnce(key, msg) { if (warned[key]) return; warned[key] = 1; if (root.console) console.warn(msg); }
    function setParams(p) {
      p = p || {};
      for (var key in p) if (Object.prototype.hasOwnProperty.call(DEFAULTS, key) && p[key] != null) P[key] = typeof DEFAULTS[key] === 'number' ? num(p[key], DEFAULTS[key]) : String(p[key]);
      P.enterMs = clamp(P.enterMs, 0, 2000); P.holdMs = clamp(P.holdMs, 0, 5000); P.exitMs = clamp(P.exitMs, 0, 2000); P.stagger = clamp(P.stagger, 0, 200);
      P.size = clamp(Math.round(P.size), 1, 4); P.band = clamp(P.band, 0, 1); P.gap = clamp(P.gap, 0, 1000);
    }

    /* ---------- field ---------- */
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
      [a, u].forEach(function (L, j) { if (L && L.length) for (var i = 0; i < L.length; i++) { var r = L[i]; if (r && r.w > 0 && r.h > 0 && isFinite(r.x) && isFinite(r.y)) out.push({ x: r.x, y: r.y, w: r.w, h: r.h, ui: j === 1 || r.id == null }); } });
      return out;
    }

    /* ---------- look (skin or built-in pixel16) ---------- */
    function pixelSkin() { return !SK || SK.pixel !== false; }
    function rampOf(kind) {
      if (!SK || SK.id === 'pixel16') return RAMP16[kind] || RAMP16.info;
      var pal = SK.palette || {}, own = pal.banner && pal.banner[kind];
      if (own && own.length >= 7) return own;
      var t = function (p, d) { try { var v = SK.token(p); return typeof v === 'string' && v !== p ? v : d; } catch (e) { return d; } };
      var base = { phase: t('team.a', '#3a64d8'), enemy: t('team.b', '#d85a48'), clear: t('fx.crit', '#ffb43a'), defeat: t('team.n', '#4c5a8a'), warn: t('fx.hot', '#ff7a3a'), info: t('text.main', '#e8ecff') }[kind] || '#8890b0';
      var ink = t('ink', INK16);
      return [mix(base, '#ffffff', 0.85), mix(base, '#ffffff', 0.5), base, mix(base, ink, 0.45), mix(base, ink, 0.8), mix(base, ink, 0.6), mix(base, '#ffffff', 0.55)];
    }
    function inkOf() { if (!SK || SK.id === 'pixel16') return INK16; var p = SK.palette || {}; return (p.text && p.text.outline) || p.ink || INK16; }

    /* ---------- one banner's artwork: big text layout, cached per banner ---------- */
    function build(B, fw) {
      var pix = pixelSkin(), size = P.size, ink = inkOf(), R = rampOf(B.kind), text = B.text;
      var fnt = SK && !pix ? (SK.fonts.display || SK.fonts.title || SK.fonts.ui) : null;
      var art = null;
      for (; size >= 1; size--) {
        art = pix ? bitmapArt(text, size, R, ink) : canvasArt(text, size, fnt);
        if (!art || art.w <= fw - 12 || size === 1) break;
      }
      if (!art) return null;
      art.R = R; art.ink = ink; art.size = size;
      art.subH = 0;
      if (B.sub) { art.subH = SK ? (SK.fonts.ui && SK.fonts.ui.type === 'bitmap' ? SK.fonts.ui.height || 7 : (SK.fonts.ui && SK.fonts.ui.size) || 8) : 7; art.subW = measureSub(B.sub); }
      return art;
    }
    function bitmapArt(text, s, R, ink) {
      var letters = [], x = 0, sp = Math.max(2, s), str = String(text).toUpperCase(), i;
      for (i = 0; i < str.length; i++) {
        var ch = str[i];
        if (ch === ' ') { x += 3 * s + sp; continue; }
        var rows = boldOf(F[ch] ? ch : '?'), w = rows[0].length * s;
        letters.push({ ch: ch, x: x, w: w, rows: rows }); x += w + sp;
      }
      var tw = Math.max(1, x - sp), gh = 7 * s, drop = s >= 3 ? 2 : 1, pad = 1, W = tw + pad * 2, H = gh + pad * 2 + drop;
      var M = new Uint8Array(W * H);
      letters.forEach(function (L) {
        for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < L.rows[ry].length; rx++) if (L.rows[ry][rx] === '#')
          for (var yy = 0; yy < s; yy++) for (var xx = 0; xx < s; xx++) M[(pad + ry * s + yy) * W + pad + L.x + rx * s + xx] = 1;
      });
      var img = mkCanvas(W, H), wht = mkCanvas(W, H);
      if (!img || !wht) return null;
      var g = img.getContext('2d'), gw = wht.getContext('2d'), on = function (X, Y) { return X >= 0 && Y >= 0 && X < W && Y < H && M[Y * W + X]; };
      for (var y = 0; y < H; y++) for (var x2 = 0; x2 < W; x2++) {
        if (M[y * W + x2]) continue;
        var near = false;
        for (var dy = -1 - drop; dy <= 1 && !near; dy++) for (var dx = -1; dx <= 1 && !near; dx++) if (on(x2 + dx, y + dy) && (dy >= -1 || dx === 0)) near = true;
        if (near) { g.fillStyle = ink; g.fillRect(x2, y, 1, 1); gw.fillStyle = ink; gw.fillRect(x2, y, 1, 1); }
      }
      for (y = 0; y < H; y++) for (x2 = 0; x2 < W; x2++) {
        if (!M[y * W + x2]) continue;
        var row = Math.floor((y - pad) / s), c = !on(x2, y - 1) ? R[0] : !on(x2, y + 1) ? R[3] : row < 4 ? R[1] : R[2];
        g.fillStyle = c; g.fillRect(x2, y, 1, 1); gw.fillStyle = '#ffffff'; gw.fillRect(x2, y, 1, 1);
      }
      return { pix: true, img: img, white: wht, w: W, h: H, pad: pad, letters: letters.map(function (L) { return { x: L.x, w: L.w + 2 * pad }; }) };
    }
    function canvasArt(text, s, fnt) {
      var str = String(text), scale = (9 * s) / (fnt && fnt.size ? fnt.size : 10), letters = [], x = 0, ch, w, i, sp = 1.5 * s;
      if (fnt && fnt.uppercase) str = str.toUpperCase();
      for (i = 0; i < str.length; i++) { ch = str[i]; w = SK.measure(ch === ' ' ? 'n' : ch, { font: fontName(), scale: scale }); if (ch !== ' ') letters.push({ ch: ch, x: x, w: w }); x += w + sp; }
      var H = Math.ceil(9 * s * 1.35);
      return { pix: false, scale: scale, w: Math.ceil(x - sp + 4), h: H, pad: 2, letters: letters };
    }
    function fontName() { return SK.fonts.display ? 'display' : SK.fonts.title ? 'title' : 'ui'; }
    function measureSub(s) { if (SK) { try { return SK.measure(s, { font: 'ui' }); } catch (e) { } } return smallW(s); }

    /* ---------- tiny 5x7 text for the sub line when no skin is loaded ---------- */
    function smallW(s) { var w = 0; s = String(s).toUpperCase(); for (var i = 0; i < s.length; i++) w += (s[i] === ' ' ? 3 : rowsOf(F[s[i]] ? s[i] : '?')[0].length) + 1; return Math.max(0, w - 1); }
    function smallText(ctx, s, x, y, col, sh) {
      s = String(s).toUpperCase();
      for (var pass = 0; pass < 2; pass++) {
        var cx = x; ctx.fillStyle = pass ? col : sh;
        for (var i = 0; i < s.length; i++) {
          if (s[i] === ' ') { cx += 4; continue; }
          var r = rowsOf(F[s[i]] ? s[i] : '?');
          for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < r[ry].length; rx++) if (r[ry][rx] === '#') ctx.fillRect(cx + rx + (pass ? 0 : 1), y + ry + (pass ? 0 : 1), 1, 1);
          cx += r[0].length + 1;
        }
      }
    }

    /* ---------- queue ---------- */
    function keyOf(text, kind, sub) { return kind + '|' + text + '|' + (sub || ''); }
    function show(text, opt) {
      try {
        opt = opt || {};
        text = text == null ? '' : String(text); if (!text) return 0;
        var kind = KINDS.indexOf(opt.kind) >= 0 ? opt.kind : 'phase';
        var sub = opt.sub == null || opt.sub === '' ? null : String(opt.sub), key = opt.key != null ? String(opt.key) : keyOf(text, kind, sub);
        // the same banner asked again (e.g. every frame of a phase) is ignored while it is up, queued, or ended < 1 s ago
        if (cur && cur.key === key && cur.stage !== 'exit') return dup(cur);
        for (var i = 0; i < queue.length; i++) if (queue[i].key === key) return dup(queue[i]);
        for (i = 0; i < recent.length; i++) if (recent[i].key === key && clock - recent[i].at < 1000 && !opt.repeat) return dup(recent[i]);
        var hold = opt.hold == null ? P.holdMs : num(opt.hold, P.holdMs), sticky = hold <= 0 || hold === Infinity;
        var B = { id: nextId++, text: text, kind: kind, sub: sub, key: key, sticky: sticky, hold: sticky ? 0 : clamp(hold, 0, 10000),
          block: opt.block != null ? !!opt.block : P.block !== 'off', onDone: opt.onDone, t: 0, stage: 'wait', art: null, y: null };
        if (P.queue === 'replace' && (cur || queue.length)) { queue.length = 0; if (cur) toExit(cur, 0.5); }
        else if (cur && cur.sticky && cur.stage !== 'exit') toExit(cur, 1);
        if (queue.length >= 6) { var d = queue.shift(); dbg({ event: 'drop', text: d.text }); warnOnce('drop', 'GameDNA_BigBanner: more than 6 banners queued; the oldest waiting one was dropped (call show() once per moment).'); }
        queue.push(B); dbg({ event: 'show', id: B.id, text: text, kind: kind });
        if (!cur && gapLeft <= 0) startNext();
        return B.id;
      } catch (e) { warnOnce('show', 'GameDNA_BigBanner.show failed: ' + e); return 0; }
    }
    function dup(B) { dbg({ event: 'ignored', id: B.id, text: B.text }); return B.id; }
    function enterLen(B) { var n = B.text.replace(/ /g, '').length; return P.enter === 'drop' ? P.enterMs + Math.max(0, n - 1) * P.stagger : P.enterMs; }
    function toExit(B, f) { if (B.stage === 'exit') return; B.stage = 'exit'; B.t = 0; B.exitLen = P.exitMs * f; }
    function startNext() {
      cur = queue.shift() || null; if (!cur) return;
      cur.stage = 'enter'; cur.t = 0; cur.art = null; cur.y = null; place(cur);
      dbg({ event: 'start', id: cur.id, text: cur.text, kind: cur.kind }); call(o.onStart, { id: cur.id, text: cur.text, kind: cur.kind });
    }
    function finish(B) {
      recent.push({ key: B.key, at: clock, id: B.id, text: B.text }); if (recent.length > 8) recent.shift();
      dbg({ event: 'end', id: B.id, text: B.text }); call(B.onDone, { id: B.id, text: B.text, kind: B.kind }); call(o.onEnd, { id: B.id, text: B.text, kind: B.kind });
    }

    /* ---------- placement: a full-width band, never on a UI rect, a little away from sprites ---------- */
    function bandH(B) { var a = B.art; if (!a) return 0; return a.h + 8 + (a.subH ? a.subH + 4 : 0); }
    function place(B) {
      var f = field(); if (!f) return;
      if (!B.art) B.art = build(B, f.w);
      if (!B.art) return;
      var h = Math.min(bandH(B), f.h), frac = P.position === 'upper' ? 0.33 : P.position === 'lower' ? 0.67 : 0.5;
      var want = Math.round(f.y + f.h * frac - h / 2), lo = f.y, hi = f.y + f.h - h, O = obstacles(), best = null, bestC = 1e18;
      want = clamp(want, lo, hi);
      for (var d = 0; d <= f.h; d += 2) {
        for (var sgn = -1; sgn <= 1; sgn += 2) {
          var y = want + d * sgn; if (d === 0 && sgn > 0) continue; if (y < lo || y > hi) continue;
          var r = { x: f.x, y: y, w: f.w, h: h }, bad = false, spr = 0;
          for (var i = 0; i < O.length; i++) { if (!hit(r, O[i])) continue; if (O[i].ui) { bad = true; break; } spr += ov(r, O[i]); }
          if (bad) continue;
          var c = d + spr * 0.015;
          if (c < bestC) { bestC = c; best = y; }
        }
        if (best != null && d > bestC) break;
      }
      if (best == null) { best = want; dbg({ event: 'noroom', text: B.text }); warnOnce('noroom', 'GameDNA_BigBanner: no band position clear of your UI rects; drawn at the preferred spot. Check bounds / getObstacles.'); }
      if (B.y != null && B.y !== best) dbg({ event: 'move', text: B.text, from: B.y, to: best });
      B.y = best; B.h = h; B.f = f; B.checkAt = 0;
    }

    /* ---------- clock ---------- */
    function update(dt) {
      try {
        dt = num(dt, 0); if (dt < 0) dt = 0; if (dt > 250) dt = 250;
        clock += dt;
        if (!cur) { gapLeft = Math.max(0, gapLeft - dt); if (queue.length && gapLeft <= 0) startNext(); if (!cur) return; }
        if (cur.y == null) place(cur);
        if (++cur.checkAt >= 10 && cur.y != null) {   // a UI window opened over the band: move it
          cur.checkAt = 0; var O = obstacles(), r = { x: cur.f.x, y: cur.y, w: cur.f.w, h: cur.h };
          for (var i = 0; i < O.length; i++) if (O[i].ui && hit(r, O[i])) { place(cur); break; }
        }
        cur.t += dt;
        var guard = 0;
        while (cur && guard++ < 4) {
          if (cur.stage === 'enter') { var E = enterLen(cur); if (cur.t < E) break; cur.t -= E; cur.stage = 'hold'; continue; }
          if (cur.stage === 'hold') {
            if (cur.sticky && !queue.length) { break; }
            if (cur.sticky) { toExit(cur, 1); continue; }
            if (cur.t < cur.hold) break; cur.t -= cur.hold; toExit(cur, 1); cur.t = 0; continue;
          }
          if (cur.stage === 'exit') {
            if (cur.t < cur.exitLen) break;
            var done = cur; cur = null; finish(done);
            gapLeft = P.gap; if (queue.length && gapLeft <= 0) startNext();
            break;
          }
          break;
        }
      } catch (e) { warnOnce('update', 'GameDNA_BigBanner.update failed: ' + e); }
    }

    /* ---------- drawing ---------- */
    function draw(ctx, ox, oy) {
      drawnRects = [];
      if (!ctx) return;
      try { if (ctx.canvas) lastCanvas = ctx.canvas; } catch (e) { }
      if (!cur) return;
      if (cur.y == null) place(cur);
      if (cur.y == null || !cur.art) return;
      ox = num(ox, 0); oy = num(oy, 0);
      ctx.save();
      try { paint(ctx, cur, ox, oy); } catch (e) { warnOnce('draw', 'GameDNA_BigBanner.draw failed: ' + e); }
      ctx.restore();
    }
    function stepAlpha(a) { if (SK && API && API.motion && SK.motion && SK.motion.fadeSteps) return API.motion.fade(SK, a); var S = [1, 0.75, 0.5, 0.25]; for (var i = 0; i < S.length; i++) if (a >= S[i] - 1e-9) return S[i]; return 0; }
    function paint(ctx, B, ox, oy) {
      var f = B.f, A = B.art, R = A.R, x0 = f.x + ox, y0 = B.y + oy, W = f.w, H = B.h, pix = A.pix;
      ctx.imageSmoothingEnabled = false;
      var st = B.stage, E = enterLen(B), t = B.t, p = st === 'enter' ? (E > 0 ? t / E : 1) : st === 'exit' ? (B.exitLen > 0 ? t / B.exitLen : 1) : 0;
      var enter = P.enter, exit = P.exit, alpha = 1, textDX = 0, bandK = 1, clipL = x0, clipR = x0 + W, edgeX = null, sc = 1;
      if (st === 'enter') {
        var tb = E > 0 ? clamp(t / Math.min(E, Math.max(120, P.enterMs * 0.45)), 0, 1) : 1;
        if (enter === 'slide') { bandK = ease('out', tb); textDX = Math.round((1 - ease('out', E > 0 ? t / E : 1)) * (W * 0.75)); }
        else if (enter === 'scale') { bandK = ease('out', tb); var q = ease('back', p); sc = Math.max(0.05, q); }
        else if (enter === 'drop') { bandK = ease('out', tb); }
        else { clipR = x0 + Math.round(W * ease('out', p)); edgeX = clipR - 2; }
      } else if (st === 'exit') {
        if (exit === 'slide') { textDX = -Math.round(ease('in', p) * (W * 0.9)); bandK = 1 - ease('in', clamp((p - 0.4) / 0.6, 0, 1)); }
        else if (exit === 'fade') { alpha = stepAlpha(1 - p); if (alpha <= 0) return; }
        else { clipL = x0 + Math.round(W * ease('in', p)); edgeX = clipL; }
      }
      if (clipR <= clipL) return;
      ctx.beginPath(); ctx.rect(clipL, y0 - 40, clipR - clipL, H + 80); ctx.clip();
      ctx.globalAlpha = alpha;
      // band
      var bh = Math.max(2, Math.round(H * bandK)), by = y0 + Math.round((H - bh) / 2);
      drawBand(ctx, B, x0, by, W, bh, R, textDX === 0 && sc === 1);
      drawnRects.push({ x: x0, y: by, w: W, h: bh, kind: B.kind, text: B.text });
      // text
      var tx = x0 + Math.round((W - A.w) / 2) + textDX, ty = y0 + 4, inHold = st === 'hold';
      if (st !== 'enter' || enter !== 'slide' || bandK > 0.3) {
        if (sc !== 1) {
          var cx = x0 + W / 2, cy = ty + A.h / 2;
          ctx.save(); ctx.translate(Math.round(cx), Math.round(cy)); ctx.scale(sc, sc); ctx.translate(-Math.round(cx), -Math.round(cy));
          drawText(ctx, A, tx, ty, null, false); ctx.restore();
        } else drawText(ctx, A, tx, ty, st === 'enter' && enter === 'drop' ? function (i) { return dropDY(t, i); } : null, false);
        // glint across the letters when the hold starts; warn blinks
        if (inHold && P.glint !== 'off' && t < 340) glint(ctx, A, tx, ty, t / 340);
        if (inHold && B.kind === 'warn' && t < 640 && Math.floor(t / 160) % 2 === 0) { ctx.globalAlpha = alpha * 0.6; drawText(ctx, A, tx, ty, null, true); ctx.globalAlpha = alpha; }
      }
      if (B.sub && A.subH && (st !== 'enter' || p > 0.5)) {
        var sy = ty + A.h + 2, sx = x0 + Math.round(W / 2) + textDX;
        if (SK) SK.text(ctx, B.sub, sx, sy, { font: 'ui', align: 'center', color: R[0], color2: R[1] });
        else smallText(ctx, B.sub, sx - Math.floor(A.subW / 2), sy, R[0], INK16);
      }
      if (edgeX != null && st !== 'hold') { ctx.globalAlpha = alpha; ctx.fillStyle = R[0]; ctx.fillRect(edgeX, by, 2, bh); ctx.fillStyle = R[6]; ctx.fillRect(edgeX + (st === 'exit' ? 2 : -1), by, 1, bh); }
    }
    function dropDY(t, i) {
      var t0 = i * P.stagger, a = t - t0, D = Math.max(60, P.enterMs);
      if (a <= 0) return null;                             // not dropped yet: hidden
      if (a >= D) return 0;
      var s = a / D;
      if (s < 0.7) return -Math.round((1 - ease('in', s / 0.7)) * 30);
      return -Math.round(Math.sin((s - 0.7) / 0.3 * Math.PI) * 3);
    }
    function drawBand(ctx, B, x, y, w, h, R, deco) {
      var pa = ctx.globalAlpha, ink = inkOf(), mid = Math.round(h * 0.28);
      ctx.globalAlpha = pa * P.band;
      ctx.fillStyle = R[4]; ctx.fillRect(x, y, w, h);
      if (h > 6) { ctx.fillStyle = R[5]; ctx.fillRect(x, y + mid, w, h - 2 * mid); }
      ctx.globalAlpha = pa * Math.min(1, P.band + 0.25);
      ctx.fillStyle = ink; ctx.fillRect(x, y - 1, w, 1); ctx.fillRect(x, y + h, w, 1);
      ctx.fillStyle = R[6]; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
      if (B.kind === 'warn' && h >= 10) {        // hazard ticks along both edges
        ctx.fillStyle = R[2];
        for (var i = 0; i < w; i += 8) for (var j = 0; j < 3; j++) { ctx.fillRect(x + i + j, y + 2 + j, 3, 1); ctx.fillRect(x + i + j, y + h - 5 + j, 3, 1); }
      } else if (deco && h >= 10 && B.art && B.art.w <= w - 52) {   // end chevrons, only where the text leaves room
        ctx.fillStyle = R[6];
        for (var k = 0; k < 3; k++) { var cy = y + Math.round(h / 2); [[x + 6 + k * 5, 1], [x + w - 7 - k * 5, -1]].forEach(function (c) { for (var d = 0; d < 3; d++) { ctx.fillRect(c[0] + d * c[1], cy - 3 + d, 1, 1); ctx.fillRect(c[0] + d * c[1], cy + 2 - d, 1, 1); } }); }
      }
      ctx.globalAlpha = pa;
    }
    function drawText(ctx, A, x, y, dyOf, white) {
      for (var i = 0; i < A.letters.length; i++) {
        var L = A.letters[i], dy = dyOf ? dyOf(i) : 0;
        if (dy === null) continue;
        if (A.pix) { var src = white ? A.white : A.img; ctx.drawImage(src, L.x, 0, L.w, A.h, Math.round(x + L.x), Math.round(y + dy), L.w, A.h); }
        else SK.text(ctx, A.letters[i].ch, x + L.x, y + dy + 1, { font: fontName(), scale: A.scale, color: white ? '#ffffff' : A.R[1], outline: A.ink, outlineWidth: 2 });
      }
    }
    function glint(ctx, A, x, y, s) {
      var gx = x - 20 + Math.round(s * (A.w + 40));
      ctx.save(); ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + 6, y); ctx.lineTo(gx - 4, y + A.h); ctx.lineTo(gx - 10, y + A.h); ctx.closePath(); ctx.clip();
      ctx.globalAlpha *= 0.7; drawText(ctx, A, x, y, null, true); ctx.restore();
    }

    /* ---------- public ---------- */
    return {
      show: show,
      busy: function () {
        if (cur && cur.block && !(cur.sticky && cur.stage === 'hold')) return true;
        for (var i = 0; i < queue.length; i++) if (queue[i].block) return true;
        return false;
      },
      update: update,
      draw: draw,
      dismiss: function () { if (cur && cur.stage !== 'exit') toExit(cur, 1); },
      clear: function () { cur = null; queue.length = 0; recent.length = 0; gapLeft = 0; drawnRects = []; },
      current: function () { return cur ? { id: cur.id, text: cur.text, kind: cur.kind, stage: cur.stage, sticky: cur.sticky } : null; },
      count: function () { return (cur ? 1 : 0) + queue.length; },
      rect: function () { return drawnRects[0] ? { x: drawnRects[0].x, y: drawnRects[0].y, w: drawnRects[0].w, h: drawnRects[0].h } : null; },
      lastDrawn: function () { return drawnRects.slice(); },
      setParams: function (p) { setParams(p); if (cur) { cur.art = null; cur.y = null; } },
      params: function () { var c = {}; for (var key in P) c[key] = P[key]; return c; }
    };
  }

  root.GameDNA_BigBanner = { version: VERSION, DEFAULTS: DEFAULTS, KINDS: KINDS, create: create };
})(typeof window !== 'undefined' ? window : this);
