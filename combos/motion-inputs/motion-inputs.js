/* GameDNA_MotionInputs v1.0.4 - A-07 motion-input special moves (Game DNA element motion-inputs).
 * Plain script, no dependencies, no import / export, ASCII only. One global: GameDNA_MotionInputs.
 *
 * Reads the player's directions and buttons once per fixed step, keeps a short input buffer and recognises special-move
 * motions written in numpad notation, relative to the way the character faces (6 = forward, 4 = back, 2 = down):
 *   236A quarter circle forward + A     623A forward, down, down-forward (DP)     214B quarter circle back
 *   [4]6A charge: hold back ~0.7 s, then forward + A     [2]8B charge down, then up     360A full turn + A
 *   41236A half circle, 66 double tap (no button)
 * with leniency windows (gaps, a late button, sloppy diagonals, DP shortcut 323), a busy buffer (a special entered during
 * the hero's recovery fires when the game says it can act), notation that mirrors when the character turns, and an on-screen
 * input display (arrow and button history with hold counts, a callout naming the special, an optional move list) drawn in a
 * pixel or a smooth HD look, readable on phones (>= 10 CSS px) and kept clear of the player and the game's HUD.
 * The module never moves the hero: a recognised special calls onSpecial(move, info) and the game starts its own attack.
 *
 *   var mi = GameDNA_MotionInputs.create({ buttons: {A: 'act'}, moves: ['236A Ember Wave', '623A Rising Fang', '[4]6A Gale Rush'],
 *     onSpecial: function (move, info) { return startSpecial(move.id); },   // false = busy now (buffered, retried)
 *     view: {w: 320, h: 180}, canvas: canvas, avoid: function () { return [heroRect()]; }, uiRects: function () { return HUD; } });
 *   // in the fixed step, after reading the device and before using it:
 *   inp = mi.step(Object.assign(inp, {up: .., down: .., facing: hero.facing}));   // returns the input, the special's button consumed
 *   // render, last:   mi.draw(ctx);
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.4';
  var DEF = {
    stepWindow: 12,      // steps from entering one direction of a motion to entering the next
    gap: 4,              // steps of other input allowed between two directions (a stick passing through neutral)
    pressWindow: 8,      // steps the button may come after the motion's last direction was last held
    motionWindow: 30,    // steps from a motion's first direction to the button
    chargeFrames: 40,    // steps a charge direction must be held
    chargeKeep: 10,      // steps a full charge stays after the direction is let go
    buffer: 12,          // steps a recognised special waits while the game cannot act (busy buffer)
    history: 60,         // steps of input kept (the input buffer)
    shortcuts: 'on',     // DP from 323 / 6323, a motion's last direction may be a neighbouring diagonal (2369 -> 236)
    facingAt: 'press',   // 'press': read the motion relative to the facing at the button press; 'step': per step
    turnWithInput: 'off', // 'on' for games whose hero turns to whichever side the player pushes (platformers): a held
                          // left / right is the facing, before the game has turned the hero
    display: 'on',       // input history column
    callout: 'on',       // the name of a recognised special
    moveList: 'off',     // 'on' shows the move list panel (also showMoveList(true))
    rows: 7,             // max rows in the column
    side: 'left',        // preferred side of the column: 'left' | 'right'
    frames: 'on',        // hold count (steps) on each row
    render: 'auto',      // 'pixel' | 'smooth' | 'auto' (pixel when the view is <= 270 px tall)
    hudScale: 'auto',    // pixel glyph scale: auto raises it until text is >= 10 CSS px; or 1..4
    theme: 'ember',      // 'ember' | 'steel' | 'jade'
    jumpHold: 45,        // max steps (from the up press) a game holds its jump start open while the stick rolls (jumpHold())
    rollGap: 7,          // steps between two directions of a roll (about 115 ms) for jumpHold()
    rollNeutral: 4,      // steps of neutral inside a roll (a key handover with a gap) that keep it alive
    fade: 5              // steps of a fade when a panel changes side or makes room (0 = instant: reduced motion)
  };
  var SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  var STRICT = { gap: 0, pressWindow: 0, shortcuts: 'off' };   // what "no leniency" means (documented, used by checks)
  var THEMES = {
    ember: { panel: 'rgba(20,12,24,0.80)', edge: '#3a2438', hi: '#6a4a5e', text: '#f4ead8', dim: '#a8949c', gold: '#ffd166', goldDk: '#8a5a10', arrow: '#f4ead8', arrowDk: '#1a1020' },
    steel: { panel: 'rgba(10,16,26,0.80)', edge: '#22324a', hi: '#4a6488', text: '#e8f0fa', dim: '#8ea0b8', gold: '#7fe0ff', goldDk: '#105a78', arrow: '#e8f0fa', arrowDk: '#0a1220' },
    jade: { panel: 'rgba(8,22,18,0.80)', edge: '#1a3a30', hi: '#3a6a58', text: '#e8f6ee', dim: '#8ab4a0', gold: '#c6f07a', goldDk: '#4a6a10', arrow: '#e8f6ee', arrowDk: '#06140e' }
  };
  var BTN_COLS = [['#e8553a', '#ff9a6a', '#7a1e14'], ['#3a8ae8', '#8ac4ff', '#143a7a'], ['#4ab85a', '#9ae88a', '#185a24'], ['#e8b43a', '#ffe08a', '#7a5414'], ['#a85ae8', '#d8a8ff', '#4a1a7a'], ['#e8e8e8', '#ffffff', '#6a6a6a']];

  /* 5x7 pixel font, rows top to bottom, bit 4 = left column */
  var F7 = {
    'A': [14, 17, 17, 31, 17, 17, 17], 'B': [30, 17, 17, 30, 17, 17, 30], 'C': [14, 17, 16, 16, 16, 17, 14], 'D': [30, 17, 17, 17, 17, 17, 30],
    'E': [31, 16, 16, 30, 16, 16, 31], 'F': [31, 16, 16, 30, 16, 16, 16], 'G': [14, 17, 16, 23, 17, 17, 15], 'H': [17, 17, 17, 31, 17, 17, 17],
    'I': [14, 4, 4, 4, 4, 4, 14], 'J': [7, 2, 2, 2, 2, 18, 12], 'K': [17, 18, 20, 24, 20, 18, 17], 'L': [16, 16, 16, 16, 16, 16, 31],
    'M': [17, 27, 21, 21, 17, 17, 17], 'N': [17, 17, 25, 21, 19, 17, 17], 'O': [14, 17, 17, 17, 17, 17, 14], 'P': [30, 17, 17, 30, 16, 16, 16],
    'Q': [14, 17, 17, 17, 21, 18, 13], 'R': [30, 17, 17, 30, 20, 18, 17], 'S': [15, 16, 16, 14, 1, 1, 30], 'T': [31, 4, 4, 4, 4, 4, 4],
    'U': [17, 17, 17, 17, 17, 17, 14], 'V': [17, 17, 17, 17, 17, 10, 4], 'W': [17, 17, 17, 21, 21, 21, 10], 'X': [17, 17, 10, 4, 10, 17, 17],
    'Y': [17, 17, 10, 4, 4, 4, 4], 'Z': [31, 1, 2, 4, 8, 16, 31],
    '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31], '3': [31, 2, 4, 2, 1, 17, 14],
    '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14], '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
    '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12],
    ' ': [0, 0, 0, 0, 0, 0, 0], '+': [0, 4, 4, 31, 4, 4, 0], '-': [0, 0, 0, 31, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ':': [0, 12, 12, 0, 12, 12, 0],
    '/': [1, 1, 2, 4, 8, 16, 16], '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4], "'": [4, 4, 8, 0, 0, 0, 0], '[': [14, 8, 8, 8, 8, 8, 14],
    ']': [14, 2, 2, 2, 2, 2, 14], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8], 'x': [0, 0, 17, 10, 4, 10, 17], '#': [10, 31, 10, 10, 31, 10, 0]
  };

  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function grow(r, m) { return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m }; }
  function faceOf(v) { if (v === 'left' || v === 'l' || v === 'L') return -1; if (v === 'right' || v === 'r' || v === 'R') return 1; v = +v; return v < 0 ? -1 : v > 0 ? 1 : 0; }
  // numpad: 7 8 9 / 4 5 6 / 1 2 3 ; x = -1..1 (right +), y = -1..1 (up +)
  function dirNum(x, y) { return 5 + x + 3 * y; }
  function dx(n) { return ((n - 1) % 3) - 1; }
  function dy(n) { return Math.floor((n - 1) / 3) - 1; }
  function mirror(n) { return dirNum(-dx(n), dy(n)); }
  function rel(n, f) { return f < 0 ? mirror(n) : n; }   // absolute -> relative to facing (and back: the same map)
  var ANG = { 6: 0, 9: -45, 8: -90, 7: -135, 4: 180, 1: 135, 2: 90, 3: 45 };   // screen angle of each direction (y down)

  /* ---------- notation ---------- */
  // "236A", "623A", "[4]6A", "[2]8B", "360A", "41236A", "66", "214B+" ... -> {kind, seq, charge, button}
  function parse(note) {
    var s = String(note || '').replace(/\s+/g, ''), m, out = { notation: s, kind: 'motion', seq: [], button: null };
    m = s.match(/^\[([1-9])\]([1-9]+)([A-Z]?)$/);
    if (m) { out.kind = 'charge'; out.charge = +m[1]; out.seq = m[2].split('').map(Number); out.button = m[3] || null; return out; }
    m = s.match(/^(360|720)([A-Z]?)$/);
    if (m) { out.kind = 'spin'; out.seq = [6, 2, 4, 8]; out.button = m[2] || null; return out; }
    m = s.match(/^([1-9]+)([A-Z]?)$/);
    if (m) { out.seq = m[1].split('').map(Number); out.button = m[2] || null; if (!out.button) out.kind = 'tap'; return out; }
    return null;
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  // a move: '236A Ember Wave' or {notation, name, id, priority}
  function normMove(m, i) {
    if (typeof m === 'string') { var sp = m.indexOf(' '); m = { notation: sp < 0 ? m : m.slice(0, sp), name: sp < 0 ? m : m.slice(sp + 1) }; }
    if (!m || !m.notation) return null;
    var p = parse(m.notation); if (!p) return null;
    var pri = m.priority != null ? +m.priority : p.kind === 'spin' ? 50 : p.kind === 'charge' ? 20 : p.kind === 'tap' ? 5 : 10 + p.seq.length * 5 + (isDP(p.seq) ? 8 : 0);
    return { id: m.id || slug(m.name || m.notation), name: String(m.name || m.notation), notation: p.notation, kind: p.kind, seq: p.seq, charge: p.charge || 0,
      button: p.button, priority: pri, order: i, data: m.data };
  }
  function isDP(seq) { return seq.length === 3 && seq[0] === 6 && seq[1] === 2 && seq[2] === 3; }
  // glyph list for a notation, relative dirs mirrored to screen for a facing: [{dir}|{btn}|{text}]
  function glyphs(move, f) {
    var out = [], i, fs = f < 0 ? -1 : 1;
    if (move.kind === 'charge') { out.push({ dir: rel(move.charge, fs), hold: true }); }
    if (move.kind === 'spin') { out.push({ spin: true, f: fs }); }
    else for (i = 0; i < move.seq.length; i++) out.push({ dir: rel(move.seq[i], fs) });
    if (move.button) out.push({ btn: move.button });
    return out;
  }

  /* ---------- the instance ---------- */
  function create(o) {
    o = o || {};
    var P = {}, k;
    for (k in DEF) P[k] = DEF[k];
    setParams(o.params || {});
    function setParams(p) { for (var q in p) if (p[q] != null && p[q] !== '') P[q] = typeof DEF[q] === 'number' ? num(p[q], DEF[q]) : p[q]; if (P.leniency === 'off') for (q in STRICT) P[q] = STRICT[q]; }

    // buttons: {A: 'act'} or {A: {key: 'act', color: '#e8553a', label: 'A'}}
    var BTN = [], bi = 0;
    (function () {
      var b = o.buttons || { A: 'a', B: 'b' };
      if (Array.isArray(b)) { var q = {}; b.forEach(function (n) { q[String(n).toUpperCase()] = n; }); b = q; }
      for (var name in b) {
        var v = b[name], spec = typeof v === 'string' ? { key: v } : (v || {}), col = BTN_COLS[bi % BTN_COLS.length];
        if (spec.color) col = [spec.color, spec.light || spec.color, spec.dark || '#20141c'];
        BTN.push({ name: name, key: spec.key || name.toLowerCase(), keys: spec.keys || null, label: String(spec.label || name).slice(0, 1).toUpperCase(), col: col, bit: 1 << bi });
        bi++;
      }
    })();
    function btnByName(n) { for (var i = 0; i < BTN.length; i++) if (BTN[i].name === n) return BTN[i]; return null; }

    var MOVES = [];
    function setMoves(list) {
      MOVES = (list || []).map(normMove).filter(function (m) { return m && (!m.button || btnByName(m.button)); });
      MOVES.sort(function (a, b) { return b.priority - a.priority || a.order - b.order; });
    }
    setMoves(o.moves || ['236A Fireball', '623A Rising Strike', '214A Back Spin', '[4]6A Charge Rush']);

    var view = o.view || { w: 320, h: 180 }, canvasEl = o.canvas || null;
    var STEP = 0, prevHeld = 0, H = [], cap = 0, lastFacing = 1;
    var charge = { L: 0, R: 0, D: 0, U: 0, kL: 0, kR: 0, kD: 0, kU: 0 };
    var usedUpTo = -1, pending = null, fired = [], drives = [];
    var rows = [], callouts = [], hlMove = null, listOn = P.moveList === 'on';
    var S = { steps: 0, presses: 0, fired: {}, firedTotal: 0, buffered: 0, dropped: 0, rejected: 0, noFacing: 0, cbErrors: 0, drawErrors: 0, stepErrors: 0, noHandler: 0,
      drives: 0, sideSwitches: 0, coverAvoid: 0, coverUi: 0, minTextCss: null, near: 0 };
    var LAY = { side: P.side === 'right' ? 'right' : 'left', want: null, fade: 1, switching: 0, dwell: 0, k: 1, cssK: 1, pixel: true, col: null, list: null, hidden: false };
    var drawnRects = [];

    function call(fn, args, dflt) { if (typeof fn !== 'function') return dflt; try { var r = fn.apply(null, args || []); return r === undefined ? dflt : r; } catch (e) { S.cbErrors++; return dflt; } }

    function resizeHist() { var c = Math.max(1, Math.round(P.history)); if (c !== cap) { cap = c; H = H.slice(-cap); } }
    function rec(n) { if (n < 0 || STEP - n >= H.length) return null; return H[H.length - 1 - (STEP - n)]; }

    function readDirs(inp) {
      var x = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), y = (inp.up ? 1 : 0) - (inp.down ? 1 : 0);
      return dirNum(x, y);
    }
    function heldMask(inp) {
      var m = 0;
      for (var i = 0; i < BTN.length; i++) {
        var b = BTN[i], on = !!inp[b.key];
        if (!on && b.keys) for (var j = 0; j < b.keys.length; j++) if (inp[b.keys[j]]) on = true;
        if (on) m |= b.bit;
      }
      return m;
    }

    /* ---- recognisers: all read the history only (pure, deterministic) ---- */
    function relAt(r, f) { return rel(r.a, P.facingAt === 'step' ? (r.f || 1) : f); }
    function okFinal(d, want) {
      if (d === want) return true;
      if (P.shortcuts !== 'on' || want === 5) return false;
      // a motion's last direction may be a neighbouring diagonal of a cardinal (236 ending on 9 or 3)
      return (want === 6 && (d === 3 || d === 9)) || (want === 4 && (d === 1 || d === 7)) || (want === 2 && (d === 1 || d === 3)) || (want === 8 && (d === 7 || d === 9));
    }
    // find the motion seq whose last direction is held at or shortly before press step t (facing f); returns the motion's
    // first step or -1. Rules (all in steps): the last direction was held within pressWindow of the press and entered within
    // pressWindow + stepWindow; between two directions at most `gap` steps of other input (a pass through neutral); a middle
    // direction is entered at most stepWindow before the next one; the first direction may be held long (crouch, then
    // 36), but the whole motion from its end to the last direction's entry fits in motionWindow.
    function seqAt(seq, t, f, pressWin) {
      var lo = Math.max(STEP - H.length + 1, usedUpTo + 1), n = seq.length, s, last = -1;
      if (pressWin == null) pressWin = P.pressWindow;
      for (s = t; s >= lo && t - s <= pressWin; s--) { var r0 = rec(s); if (!r0) break; if (okFinal(relAt(r0, f), seq[n - 1])) { last = s; break; } }
      if (last < 0) return -1;
      var dl = relAt(rec(last), f), e = last;
      while (e - 1 >= lo && rec(e - 1) && relAt(rec(e - 1), f) === dl) e--;
      if (t - e > pressWin + P.stepWindow) return -1;
      var nextEntry = e, firstEnd = last;
      for (var k = n - 2; k >= 0; k--) {
        var found = -1;
        for (s = nextEntry - 1; s >= lo && nextEntry - 1 - s <= P.gap; s--) { var r1 = rec(s); if (!r1) break; if (relAt(r1, f) === seq[k]) { found = s; break; } }
        if (found < 0) return -1;
        var ent = found;
        while (ent - 1 >= lo && rec(ent - 1) && relAt(rec(ent - 1), f) === seq[k]) ent--;
        if (k > 0 && nextEntry - ent > P.stepWindow) return -1;
        firstEnd = found; nextEntry = ent;
      }
      if (e - firstEnd > P.motionWindow) return -1;
      return nextEntry;
    }
    function matchMotion(m, t, f) {
      var first = seqAt(m.seq, t, f, P.pressWindow);
      if (first >= 0) return first;
      if (P.shortcuts === 'on' && isDP(m.seq)) {   // DP shortcuts: 323, 6323 (crouching forward rock)
        first = seqAt([3, 2, 3], t, f, P.pressWindow);
        if (first >= 0) return first;
      }
      return -1;
    }
    function chargeOk(m, t, f) {
      var back = rel(m.charge, f), cx = dx(back), cy = dy(back), need = P.chargeFrames, okC = true;
      if (cx < 0 && charge.L < need) okC = false; if (cx > 0 && charge.R < need) okC = false;
      if (cy < 0 && charge.D < need) okC = false; if (cy > 0 && charge.U < need) okC = false;
      if (!okC) return -1;
      var first = seqAt(m.seq, t, f, P.pressWindow);
      return first;
    }
    function spinOk(m, t, f) {
      var lo = Math.max(STEP - H.length + 1, t - Math.round(P.motionWindow * 1.5), usedUpTo + 1), seen = {}, n, c = 0;
      for (n = t; n >= lo; n--) { var r = rec(n); if (!r) break; if (r.a === 2 || r.a === 4 || r.a === 6 || r.a === 8) { if (!seen[r.a]) { seen[r.a] = n; c++; } } }
      if (c < 4) return -1;
      var first = Math.min(seen[2], seen[4], seen[6], seen[8]);
      var last = Math.max(seen[2], seen[4], seen[6], seen[8]);
      return t - last <= P.pressWindow + P.stepWindow ? first : -1;
    }
    function tapOk(m, t, f) {   // no button: fires on the step the last direction is entered
      var r = rec(t), p = rec(t - 1); if (!r || !p) return -1;
      var want = m.seq[m.seq.length - 1];
      if (relAt(r, f) !== want || relAt(p, f) === want) return -1;
      if (m.seq.length < 2) return t;
      // the earlier directions, then (for repeats like 66) a release in between
      var earlier = m.seq.slice(0, -1), first = seqAt(earlier, t - 1, f, P.stepWindow);
      if (first < 0) return -1;
      if (earlier[earlier.length - 1] === want) {   // 66: a release must separate the taps
        var gap = false; for (var n = t - 1; n > first; n--) if (relAt(rec(n), f) !== want) { gap = true; break; }
        if (!gap) return -1;
      }
      return first;
    }
    function finalOf(m) { return m.kind === 'spin' || m.kind === 'tap' ? 0 : m.seq[m.seq.length - 1]; }
    // every move whose motion is in the buffer; the highest priority wins, but a move whose last direction is the one held
    // at the press beats one that is not (walk forward + 236 is a fireball, not a DP; 623 held on 3 is the DP)
    function recognise(t, f, mask) {
      var best = null, bestScore = -1e9, now = rec(t), nowRel = now ? relAt(now, f) : 5;
      for (var i = 0; i < MOVES.length; i++) {
        var m = MOVES[i], first = -1;
        if (m.button) { var b = btnByName(m.button); if (!b || !(mask & b.bit)) continue; }
        if (m.kind === 'charge') first = chargeOk(m, t, f);
        else if (m.kind === 'spin') first = spinOk(m, t, f);
        else if (m.kind === 'tap') first = tapOk(m, t, f);
        else first = matchMotion(m, t, f);
        if (first < 0) continue;
        var score = m.priority + (finalOf(m) && finalOf(m) === nowRel ? 30 : 0);
        if (score > bestScore) { bestScore = score; best = { move: m, first: first }; }
      }
      return best;
    }
    // near miss (the shape is there but too slow / button too late) for the display hint; never fires
    function nearMiss(t, f, mask) {
      var save = { s: P.stepWindow, p: P.pressWindow, w: P.motionWindow, g: P.gap };
      P.stepWindow = save.s * 2.5; P.pressWindow = save.p * 2.5 + 4; P.motionWindow = save.w * 2.5; P.gap = save.g * 2 + 2;
      var r = null; try { r = recognise(t, f, mask); } catch (e) { r = null; }
      P.stepWindow = save.s; P.pressWindow = save.p; P.motionWindow = save.w; P.gap = save.g;
      return r && r.move.kind !== 'tap' ? r : null;
    }

    function info(m, extra) {
      var x = { id: m.id, name: m.name, notation: m.notation, button: m.button, step: STEP, facing: lastFacing > 0 ? 'right' : 'left', buffered: false };
      for (var q in extra || {}) x[q] = extra[q];
      return x;
    }
    function tryFire(m, inf) {
      var can = call(o.canAct, [m, inf], true);
      if (can === false) return false;
      if (typeof o.onSpecial !== 'function') S.noHandler++;
      var r = call(o.onSpecial, [m, inf], true);
      return r !== false;
    }
    function fire(m, firstStep, buffered) {
      var inf = info(m, { buffered: !!buffered, from: firstStep });
      S.fired[m.id] = (S.fired[m.id] || 0) + 1; S.firedTotal++; if (buffered) S.buffered++;
      fired.push({ id: m.id, step: STEP, buffered: !!buffered, facing: inf.facing });
      if (fired.length > 64) fired.shift();
      // highlight the rows of the motion and show the callout
      for (var i = 0; i < rows.length; i++) if (rows[i].start >= firstStep - 1 && rows[i].start <= STEP) rows[i].hl = STEP;
      if (P.callout !== 'off') { callouts.push({ move: m, at: STEP, buffered: !!buffered, facing: lastFacing }); if (callouts.length > 3) callouts.shift(); }
      hlMove = { id: m.id, at: STEP }; upFrom = -1;   // a special clears any jump hold
      call(o.onFired, [m, inf]);
    }

    /* ---- the display model (advanced in step, so ?t= stills equal play) ---- */
    function pushRow(a, press) {
      var top = rows[0];
      if (top && top.a === a && !press) { top.n++; return; }
      rows.unshift({ a: a, b: press, n: 1, start: STEP, hl: -1, miss: null });
      if (rows.length > 24) rows.pop();
    }

    function stepFn(inp, opt) {
      inp = inp || {}; opt = opt || {};
      resizeHist();
      var out = {}, q; for (q in inp) out[q] = inp[q];
      // scripted input (drive): replaces the device's directions and buttons for its frames
      if (drives.length) {
        var fr = drives.shift();
        out.left = fr.x < 0; out.right = fr.x > 0; out.up = fr.y > 0; out.down = fr.y < 0;
        for (var bb = 0; bb < BTN.length; bb++) { var bt = BTN[bb]; out[bt.key] = !!(fr.b & bt.bit); }
        if (drives.length === 0) S.drives++;
      }
      var f = faceOf(out.facing != null ? out.facing : call(o.facing, [], null));
      if (!f) { S.noFacing++; f = lastFacing; }
      STEP++; S.steps++;
      var a = readDirs(out), held = heldMask(out), press = held & ~prevHeld;
      if (P.turnWithInput === 'on' && dx(a) !== 0) f = dx(a);
      lastFacing = f;
      prevHeld = held;
      var prevA = 5; for (var hb = H.length - 1; hb >= 0 && hb >= H.length - 1 - Math.round(P.rollNeutral); hb--) if (H[hb].a !== 5) { prevA = H[hb].a; break; }
      if (dy(a) > 0 && dy(prevA) <= 0) upFrom = STEP;   // a new up press (a short neutral blip between two up directions is not one)   // a new up press: the jump hold counts from here
      H.push({ a: a, f: f, p: press }); if (H.length > cap) H.shift();
      // charge counters (absolute directions)
      var X = dx(a), Y = dy(a), K = P.chargeKeep;
      if (X < 0) { charge.L++; charge.kL = K; } else if (charge.kL > 0) charge.kL--; else charge.L = 0;
      if (X > 0) { charge.R++; charge.kR = K; } else if (charge.kR > 0) charge.kR--; else charge.R = 0;
      if (Y < 0) { charge.D++; charge.kD = K; } else if (charge.kD > 0) charge.kD--; else charge.D = 0;
      if (Y > 0) { charge.U++; charge.kU = K; } else if (charge.kU > 0) charge.kU--; else charge.U = 0;
      if (press) S.presses++;
      pushRow(a, press);
      var listen = opt.fire === false || P.listen === 'on';
      // busy buffer: a special recognised earlier, waiting for the game
      if (pending) {
        if (tryFire(pending.move, info(pending.move, { buffered: true }))) { fire(pending.move, pending.first, true); pending = null; }
        else if (--pending.left <= 0) { S.dropped++; pending = null; }
      }
      var got = null;
      try { got = (press || MOVES.some(function (m) { return m.kind === 'tap'; })) ? recognise(STEP, f, press) : null; } catch (e) { S.stepErrors++; got = null; }
      if (got && got.move.kind === 'tap' && !got.move.button) {
        if (!listen) { usedUpTo = STEP; if (tryFire(got.move, info(got.move))) fire(got.move, got.first, false); }
      } else if (got) {
        usedUpTo = STEP;
        var b = btnByName(got.move.button);
        if (!listen) {
          if (b) out[b.key] = false;   // the special used this press: the game's normal attack must not also start
          if (b && b.keys) for (var j = 0; j < b.keys.length; j++) out[b.keys[j]] = false;
          if (tryFire(got.move, info(got.move))) fire(got.move, got.first, false);
          else if (P.buffer > 0) { pending = { move: got.move, first: got.first, left: Math.round(P.buffer) }; }
          else S.rejected++;
        } else { for (var i2 = 0; i2 < rows.length; i2++) if (rows[i2].start >= got.first - 1) rows[i2].hl = STEP; }
      } else if (press && rows[0]) {
        var nm = nearMiss(STEP, f, press);
        if (nm) { rows[0].miss = nm.move.name; S.near++; if (P.callout !== 'off' && !listen) { callouts.push({ move: nm.move, at: STEP, miss: true, facing: lastFacing }); if (callouts.length > 3) callouts.shift(); } }
      }
      layout();
      return out;
    }

    /* ---- layout (in step; draw only paints) ---- */
    function measureCss() {
      var c = 1;
      try { if (canvasEl && canvasEl.getBoundingClientRect) { var bw = canvasEl.getBoundingClientRect().width; if (bw > 0) c = bw / (view.w || 320); } } catch (e) { c = 1; }
      return c > 0.05 ? c : 1;
    }
    function isPixel() { return P.render === 'pixel' || (P.render === 'auto' && (view.h || 180) <= 270); }
    function metrics() {
      var cssK = measureCss(), pix = isPixel(), vh = view.h || 180, M;
      if (pix) {
        var base = Math.max(1, Math.floor(vh / 180)), need = Math.ceil(10 / (7 * cssK) - 1e-6);
        var kk = P.hudScale !== 'auto' && num(P.hudScale, 0) > 0 ? Math.round(num(P.hudScale, 1)) : Math.max(base, Math.min(4, need));
        M = { pixel: true, k: kk, u: kk, font: 7 * kk, icon: 9 * kk, rowH: 11 * kk, pad: 2 * kk, gap: kk, margin: 3 * kk + 1 };
      } else {
        var fs = Math.max(10.5 / cssK, vh * 0.032);
        M = { pixel: false, k: 1, u: fs / 7, font: fs, icon: fs * 1.25, rowH: fs * 1.75, pad: fs * 0.35, gap: fs * 0.18, margin: fs * 0.6 };
      }
      M.cssK = cssK; return M;
    }
    var MCTX = null;
    function textW(s, M) {
      s = String(s);
      if (M.pixel) return Math.max(0, s.length * 6 - 1) * M.k;
      try { if (!MCTX && typeof document !== 'undefined') MCTX = document.createElement('canvas').getContext('2d'); } catch (e) { MCTX = null; }
      if (MCTX) { MCTX.font = '700 ' + M.font.toFixed(2) + 'px ' + SANS; return MCTX.measureText(s).width; }
      return s.length * M.font * 0.72;
    }
    function rowWidth(M, r) {
      var nb = 0; for (var i = 0; i < BTN.length; i++) if (r.b & BTN[i].bit) nb++;
      var w = M.pad + M.icon + (nb ? M.gap * 2 + nb * (M.icon + M.gap) : 0);
      if (P.frames === 'on') w += M.gap * 3 + textW('99', M);
      return w + M.pad;
    }
    function colWidth(M) {
      var nb = BTN.length;
      var w = M.pad * 2 + M.icon + M.gap * 2 + Math.min(2, nb) * (M.icon + M.gap) + (P.frames === 'on' ? M.gap * 3 + textW('99', M) : 0);
      return Math.ceil(w);
    }
    function calloutSize(M, c) {
      var g = glyphs(c.move, c.facing), iw = 0;
      for (var i = 0; i < g.length; i++) iw += M.icon + M.gap;
      var name = c.move.name.toUpperCase(), nw = textW(name, M);
      var tag = c.miss ? 'TOO SLOW' : c.buffered ? 'BUFFERED' : '';
      var w = Math.max(nw, iw + (tag ? M.gap * 3 + textW(tag, M) : 0)) + M.pad * 3;
      return { w: Math.ceil(w), h: calloutH(M), name: name, glyphs: g, tag: tag };
    }
    function calloutH(M) { return Math.ceil(M.font + M.icon + M.pad * 3 + M.gap); }
    function maxCalloutW(M) {   // fixed per scale, so the column never changes size when a callout comes or goes
      var w = 0;
      for (var i = 0; i < MOVES.length; i++) w = Math.max(w, calloutSize(M, { move: MOVES[i], facing: 1, buffered: true }).w, calloutSize(M, { move: MOVES[i], facing: 1, miss: true }).w);
      return w;
    }
    function avoidRects() { var r = call(o.avoid, [], []); return Array.isArray(r) ? r.filter(function (q) { return q && isFinite(q.x) && isFinite(q.y) && q.w > 0 && q.h > 0; }) : []; }
    function uiRects() { var r = call(o.uiRects, [], []); return Array.isArray(r) ? r.filter(function (q) { return q && isFinite(q.x) && isFinite(q.y) && q.w > 0 && q.h > 0; }) : []; }
    var CALL_IN = 6, CALL_DWELL = 80, CALL_OUT = 12;
    function liveCallouts() {
      var out = [];
      for (var i = 0; i < callouts.length; i++) {
        var c = callouts[i], age = STEP - c.at, next = callouts[i + 1], end = c.at + CALL_IN + (c.miss ? 50 : CALL_DWELL) + CALL_OUT;
        if (next) end = Math.min(end, Math.max(next.at, c.at + CALL_IN + 20) + CALL_IN);   // a newer one: the old one fades while the new one slides in (after a short dwell)
        if (STEP > end) continue;
        var aIn = ease(age / CALL_IN), aOut = ease((end - STEP) / (next ? CALL_IN : CALL_OUT));
        out.push({ c: c, alpha: Math.min(aIn, aOut), slide: 1 - aIn });
      }
      return out;
    }
    function edgeX(side, M, w) { var vw = view.w || 320; return side === 'left' ? M.margin : vw - M.margin - w; }
    function topBelowUi(side, M, w, ui) {
      var top = M.margin, moved = true, guard = 0;
      while (moved && guard++ < 8) { moved = false; var b = { x: edgeX(side, M, w), y: top, w: w, h: M.rowH * 2 }; for (var i = 0; i < ui.length; i++) if (hits(b, ui[i])) { top = Math.ceil(ui[i].y + ui[i].h + M.gap * 2 + 1); moved = true; } }
      return top;
    }
    var MK = null, prevAv = [];
    function layout() {
      var M = metrics(), vh = view.h || 180, ui = uiRects(), av0 = avoidRects(), av = [];
      // look ahead: a rect that moved since the last step is stretched over where it will be in 6 steps (a jump, a dash),
      // so panels start fading before the player reaches them
      for (var a0 = 0; a0 < av0.length; a0++) {
        var r0 = av0[a0], p0 = prevAv[a0], ex = r0;
        if (p0) { var mx = (r0.x - p0.x) * 6, my = (r0.y - p0.y) * 6; if (Math.abs(mx) < (view.w || 320) && Math.abs(my) < vh) ex = { x: Math.min(r0.x, r0.x + mx), y: Math.min(r0.y, r0.y + my), w: r0.w + Math.abs(mx), h: r0.h + Math.abs(my) }; }
        av.push(ex);
      }
      prevAv = av0;
      var key = M.k + '|' + M.font + '|' + MOVES.length + '|' + P.rows + '|' + P.display + '|' + P.callout + '|' + P.frames;
      if (!MK || MK.key !== key) MK = { key: key, cw: colWidth(M), calW: P.callout !== 'off' ? maxCalloutW(M) : 0, calH: P.callout !== 'off' ? calloutH(M) + M.gap * 2 : 0 };
      LAY.k = M.k; LAY.cssK = M.cssK; LAY.pixel = M.pixel; LAY.M = M;
      var showCol = P.display !== 'off', cw = MK.cw, calH = MK.calH, lc = liveCallouts(), i;
      for (i = 0; i < lc.length; i++) lc[i].sz = calloutSize(M, lc[i].c);
      var maxH = Math.floor(vh * 0.62);
      var nRows = showCol ? clamp(Math.floor((maxH - calH) / M.rowH), 1, Math.round(P.rows)) : 0;
      var w = Math.max(showCol ? cw : 0, MK.calW), want, h = calH + nRows * M.rowH;
      // per side: how many rows fit between the HUD and the player (the column never reaches into the margin around him)
      var mg = Math.max(M.rowH * 0.3, (view.h || 180) * 0.025);
      function fitOn(side) {
        var top = topBelowUi(side, M, w, ui), x = edgeX(side, M, w), bottom = top + calH + nRows * M.rowH;
        for (var j = 0; j < av.length; j++) {
          var r = av[j];
          if (r.x < x + w + mg && r.x + r.w > x - mg && r.y + r.h > top - mg) bottom = Math.min(bottom, r.y - mg);
        }
        var rowsFit = clamp(Math.floor((bottom - top - calH) / M.rowH), 0, nRows);
        var ok = bottom - top >= Math.max(calH, M.rowH);
        return { x: x, y: top, w: w, h: calH + rowsFit * M.rowH, rows: rowsFit, ok: ok, side: side };
      }
      var pref = P.side === 'right' ? 'right' : 'left', other = pref === 'left' ? 'right' : 'left';
      var fP = fitOn(pref), fO = fitOn(other), score = function (f, bonus) { return f.ok ? f.rows + bonus : -1; };
      var sP = score(fP, 0.5), sO = score(fO, 0);
      want = sP < 0 && sO < 0 ? 'hide' : sP >= sO ? pref : other;
      if (LAY.dwell > 0) LAY.dwell--;
      var cur = LAY.side, curFit = cur === pref ? fP : cur === other ? fO : null;
      if (want !== cur && LAY.want == null) {
        var curBad = !curFit || !curFit.ok, sW = want === 'hide' ? -1 : score(want === pref ? fP : fO, 0), sC = curFit ? score(curFit, 0) : 0;
        var better = want === pref ? sW >= sC : sW >= sC + 2;   // back to the preferred side as soon as it has as much room
        if (curBad || (LAY.dwell <= 0 && better)) LAY.want = want;
      } else if (LAY.want != null && want === cur) LAY.want = null;   // the reason went away: fade back in where it is
      // fade out (5 steps), switch, fade in (6 steps): the column never jumps across the screen
      var FS = Math.round(P.fade);
      if (LAY.want != null) {
        LAY.fade = FS <= 0 ? 0 : Math.max(0, LAY.fade - 1 / FS);
        if (LAY.fade <= 0) { if (LAY.want !== LAY.side) S.sideSwitches++; LAY.side = LAY.want; LAY.want = null; LAY.dwell = 45; }
      } else if (LAY.side !== 'hide') LAY.fade = FS <= 0 ? 1 : Math.min(1, LAY.fade + 1 / (FS + 1));
      LAY.hidden = LAY.side === 'hide';
      var side = LAY.side === 'hide' ? pref : LAY.side, b = side === pref ? fP : fO;
      // the visible row count glides (a quarter row per step) toward what fits, rows never pop in or out
      var target = LAY.want != null ? Math.min(b.rows, LAY.rowsShown == null ? b.rows : LAY.rowsShown) : b.rows;
      if (LAY.rowsShown == null) LAY.rowsShown = target;
      else if (target < LAY.rowsShown) LAY.rowsShown = Math.max(target, LAY.rowsShown - 0.25);
      else LAY.rowsShown = Math.min(target, LAY.rowsShown + 0.25);
      if (!b.ok) LAY.rowsShown = Math.min(LAY.rowsShown, b.rows);
      LAY.col = { x: b.x, y: b.y, w: w, h: b.h, side: side, nRows: LAY.rowsShown, calH: calH, callouts: lc, colW: cw };
      // move list: the other side, below the HUD
      LAY.list = null;
      if (listOn && MOVES.length) {
        var gw = 0, nw = 0, lh = M.pad * 2 + MOVES.length * (M.icon + M.gap * 2);
        for (i = 0; i < MOVES.length; i++) { gw = Math.max(gw, glyphs(MOVES[i], 1).length * (M.icon + M.gap)); nw = Math.max(nw, textW(MOVES[i].name.toUpperCase(), M)); }
        var lw = Math.ceil(M.pad * 2 + gw + M.gap * 3 + nw);
        // its side follows the column's other side, but it only moves while faded out (never jumps across while visible)
        var wantLs = side === 'left' ? 'right' : 'left', lf = LAY.listFade == null ? 0 : LAY.listFade;
        if (LAY.listSide == null || lf <= 0 || FS <= 0) LAY.listSide = wantLs;
        var ls = LAY.listSide, lb = { x: edgeX(ls, M, lw), y: topBelowUi(ls, M, lw, ui), w: lw, h: Math.ceil(lh), nameX: M.pad + gw + M.gap * 3 };
        var lblocked = (ls !== wantLs) || hits(lb, b); for (var j2 = 0; j2 < av.length; j2++) if (hits(grow(lb, mg), av[j2])) lblocked = true;
        LAY.listFade = FS <= 0 ? (lblocked ? 0 : 1) : lblocked ? Math.max(0, lf - 1 / FS) : Math.min(1, lf + 1 / (FS + 1));
        LAY.list = lb;
      } else LAY.listFade = 0;
    }

    /* ---------- drawing ---------- */
    var THEME = THEMES[P.theme] || THEMES.ember;
    function pText(ctx, s, x, y, M, col, shadow) {
      s = String(s);
      if (!M.pixel) {
        ctx.font = '700 ' + M.font.toFixed(2) + 'px ' + SANS;
        ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        if (shadow) { ctx.fillStyle = shadow; ctx.fillText(s, x + M.font * 0.08, y + M.font * 0.1); }
        ctx.fillStyle = col; ctx.fillText(s, x, y);
        noteText(M.font * M.cssK);
        return;
      }
      var kk = M.k;
      for (var pass = shadow ? 0 : 1; pass < 2; pass++) {
        ctx.fillStyle = pass === 0 ? shadow : col;
        var ox = pass === 0 ? kk : 0, oy = pass === 0 ? kk : 0;
        for (var i = 0; i < s.length; i++) {
          var gph = F7[s[i]] || F7[s[i].toUpperCase()] || F7['?'];
          for (var r = 0; r < 7; r++) { var bits = gph[r]; if (!bits) continue; for (var c = 0; c < 5; c++) if (bits & (16 >> c)) ctx.fillRect(Math.round(x) + (i * 6 + c) * kk + ox, Math.round(y) + r * kk + oy, kk, kk); }
        }
      }
      noteText(7 * kk * M.cssK);
    }
    function noteText(css) { if (S.minTextCss == null || css < S.minTextCss) S.minTextCss = Math.round(css * 10) / 10; }
    function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }
    function panel(ctx, x, y, w, h, M, edge, fill) {
      if (M.pixel) {
        var k1 = M.k; x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
        ctx.fillStyle = edge || THEME.edge;
        ctx.fillRect(x + k1, y, w - 2 * k1, h); ctx.fillRect(x, y + k1, w, h - 2 * k1);
        ctx.fillStyle = fill || THEME.panel;
        ctx.fillRect(x + k1, y + k1, w - 2 * k1, h - 2 * k1);
        ctx.fillStyle = THEME.hi; ctx.fillRect(x + 2 * k1, y + k1, w - 4 * k1, k1);
      } else {
        var rad = Math.min(h / 2, M.font * 0.45);
        rr(ctx, x, y, w, h, rad); ctx.fillStyle = fill || THEME.panel; ctx.fill();
        ctx.lineWidth = Math.max(1, M.font * 0.09); ctx.strokeStyle = edge || THEME.edge; ctx.stroke();
        rr(ctx, x + ctx.lineWidth, y + ctx.lineWidth, w - 2 * ctx.lineWidth, Math.max(1, h * 0.42), rad * 0.8);
        ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
      }
    }
    // pixel arrows: two hand-made 7x7 bodies (right, down-right), turned by exact quarter turns, outlined to 9x9
    var AR_R = ['...#...', '...##..', '######.', '#######', '######.', '...##..', '...#...'];
    var AR_D = ['##.....', '###....', '.###...', '..###.#', '...####', '....###', '..#####'];
    var ARROW = [[-0.95, -0.3], [0.05, -0.3], [0.05, -0.8], [1.0, 0], [0.05, 0.8], [0.05, 0.3], [-0.95, 0.3]];
    var AM = {};
    function arrowMask(d) {
      if (AM[d]) return AM[d];
      var base = (d === 6 || d === 2 || d === 4 || d === 8) ? AR_R : AR_D, turns = { 6: 0, 2: 1, 4: 2, 8: 3, 3: 0, 1: 1, 7: 2, 9: 3 }[d], m = [], x, y, N = 9;
      for (y = 0; y < N * N; y++) m[y] = 0;
      for (y = 0; y < 7; y++) for (x = 0; x < 7; x++) {
        if (base[y].charAt(x) !== '#') continue;
        var u = x, v = y;
        for (var q = 0; q < turns; q++) { var t = u; u = 6 - v; v = t; }   // quarter turn clockwise (screen y down)
        m[(v + 1) * N + u + 1] = 1;
      }
      var out = [];
      for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
        var val = m[y * N + x];
        if (val) { var up = y > 0 ? m[(y - 1) * N + x] : 0, lf = x > 0 ? m[y * N + x - 1] : 0, dn = y < N - 1 ? m[(y + 1) * N + x] : 0; out[y * N + x] = !up || !lf ? 3 : !dn ? 1 : 2; }
        else { var nb = (x > 0 && m[y * N + x - 1]) || (x < N - 1 && m[y * N + x + 1]) || (y > 0 && m[(y - 1) * N + x]) || (y < N - 1 && m[(y + 1) * N + x]); out[y * N + x] = nb ? 4 : 0; }
      }
      return (AM[d] = out);
    }
    function drawDir(ctx, d, x, y, M, col, alpha, hold) {
      var s = M.icon;
      if (d === 5) {   // neutral: a small dim dot
        if (M.pixel) { var kk = M.k, cx = Math.round(x + 4 * kk), cy = Math.round(y + 4 * kk); ctx.fillStyle = THEME.arrowDk; ctx.fillRect(cx - kk, cy - kk, 3 * kk, 3 * kk); ctx.fillStyle = THEME.dim; ctx.fillRect(cx, cy, kk, kk); }
        else { ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.13, 0, 6.283); ctx.fillStyle = THEME.dim; ctx.fill(); }
        return;
      }
      var light = col === 'gold' ? THEME.gold : THEME.arrow, dark = col === 'gold' ? THEME.goldDk : '#8a7c84';
      if (M.pixel) {
        var mk = arrowMask(d), k1 = M.k, X = Math.round(x), Y = Math.round(y);
        for (var i = 0; i < 81; i++) {
          var v = mk[i]; if (!v) continue;
          ctx.fillStyle = v === 4 ? THEME.arrowDk : v === 3 ? '#ffffff' : v === 1 ? dark : light;
          if (col === 'gold' && v === 3) ctx.fillStyle = '#fff6d0';
          ctx.fillRect(X + (i % 9) * k1, Y + Math.floor(i / 9) * k1, k1, k1);
        }
        if (hold) { ctx.fillStyle = THEME.arrowDk; ctx.fillRect(X, Y + 8 * k1, 9 * k1, k1); ctx.fillStyle = light; ctx.fillRect(X + k1, Y + 8 * k1, 7 * k1, k1); }
      } else {
        var a = ANG[d] * Math.PI / 180, R = s * 0.44, cx2 = x + s / 2, cy2 = y + s / 2;
        ctx.save(); ctx.translate(cx2, cy2); ctx.rotate(a);
        ctx.beginPath(); ARROW.forEach(function (p, i2) { if (i2) ctx.lineTo(p[0] * R, p[1] * R); else ctx.moveTo(p[0] * R, p[1] * R); }); ctx.closePath();
        ctx.lineJoin = 'round'; ctx.lineWidth = s * 0.16; ctx.strokeStyle = THEME.arrowDk; ctx.stroke();
        var gr = ctx.createLinearGradient(0, -R, 0, R); gr.addColorStop(0, col === 'gold' ? '#fff6d0' : '#ffffff'); gr.addColorStop(1, col === 'gold' ? THEME.gold : '#cfc4c8');
        ctx.fillStyle = gr; ctx.fill(); ctx.restore();
        if (hold) { ctx.fillStyle = light; ctx.fillRect(x + s * 0.15, y + s * 0.92, s * 0.7, Math.max(1, s * 0.08)); }
      }
    }
    function drawSpin(ctx, x, y, M, f) {   // a circular arrow
      var s = M.icon;
      if (M.pixel) {
        var k1 = M.k, X = Math.round(x), Y = Math.round(y), ring = [[3, 0], [4, 0], [5, 0], [6, 1], [7, 2], [8, 3], [8, 4], [8, 5], [7, 6], [6, 7], [5, 8], [4, 8], [3, 8], [2, 7], [1, 6], [0, 5], [0, 4], [0, 3], [1, 2]];
        ctx.fillStyle = THEME.arrowDk; ring.forEach(function (p) { ctx.fillRect(X + p[0] * k1 - k1, Y + p[1] * k1, k1 * 3, k1); });
        ctx.fillStyle = THEME.arrow; ring.forEach(function (p) { ctx.fillRect(X + p[0] * k1, Y + p[1] * k1, k1, k1); });
        var hx = f < 0 ? 1 : 1; ctx.fillRect(X + hx * k1, Y, k1 * 2, k1); ctx.fillRect(X + hx * k1, Y + k1, k1, k1 * 2);
      } else {
        ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.34, -2.4, 2.6); ctx.lineWidth = s * 0.14; ctx.strokeStyle = THEME.arrow; ctx.stroke();
        ctx.beginPath(); var ax = x + s / 2 + Math.cos(-2.4) * s * 0.34, ay = y + s / 2 + Math.sin(-2.4) * s * 0.34; ctx.moveTo(ax + s * 0.2, ay - s * 0.05); ctx.lineTo(ax - s * 0.05, ay - s * 0.2); ctx.lineTo(ax - s * 0.02, ay + s * 0.14); ctx.closePath(); ctx.fillStyle = THEME.arrow; ctx.fill();
      }
    }
    function drawBtn(ctx, b, x, y, M, alpha) {
      var s = M.icon, col = b.col;
      if (M.pixel) {
        var k1 = M.k, X = Math.round(x), Y = Math.round(y);
        var C = ['..ooooo..', '.ollllfo.', 'olllffffo', 'olfffffdo', 'offfffffo', 'offfffddo', 'offffdddo', '.odddddo.', '..ooooo..'];
        for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) {
          var ch = C[r].charAt(c); if (ch === '.') continue;
          ctx.fillStyle = ch === 'o' ? '#140c14' : ch === 'l' ? col[1] : ch === 'd' ? col[2] : col[0];
          ctx.fillRect(X + c * k1, Y + r * k1, k1, k1);
        }
        // the letter (5x7) in the coin, with a dark drop shadow so it reads on any button colour
        var g = F7[b.label] || F7['?'];
        for (var pass = 0; pass < 2; pass++) {
          ctx.fillStyle = pass ? '#ffffff' : col[2];
          for (r = 0; r < 7; r++) for (c = 0; c < 5; c++) if (g[r] & (16 >> c)) ctx.fillRect(X + (2 + c + (pass ? 0 : 1)) * k1, Y + (1 + r) * k1, k1, k1);
        }
        noteText(7 * k1 * M.cssK);
      } else {
        var cx = x + s / 2, cy = y + s / 2, R = s * 0.47;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fillStyle = '#140c14'; ctx.fill();
        var gr = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 0.92);
        gr.addColorStop(0, col[1]); gr.addColorStop(0.55, col[0]); gr.addColorStop(1, col[2]);
        ctx.beginPath(); ctx.arc(cx, cy, R * 0.86, 0, 6.283); ctx.fillStyle = gr; ctx.fill();
        var fs = s * 0.62; ctx.font = '800 ' + fs.toFixed(2) + 'px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillText(b.label, cx + fs * 0.05, cy + fs * 0.1); ctx.fillStyle = '#fff'; ctx.fillText(b.label, cx, cy + fs * 0.04); ctx.textAlign = 'left';
        noteText(Math.max(M.font, fs) * M.cssK);
      }
    }
    function drawGlyphs(ctx, g, x, y, M, gold) {
      for (var i = 0; i < g.length; i++) {
        var it = g[i];
        if (it.btn) { var b = btnByName(it.btn); if (b) drawBtn(ctx, b, x, y, M); }
        else if (it.spin) drawSpin(ctx, x, y, M, it.f);
        else drawDir(ctx, it.dir, x, y, M, gold ? 'gold' : null, 1, it.hold);
        x += M.icon + M.gap;
      }
      return x;
    }
    function draw(ctx) {
      drawnRects = [];
      if (!ctx || !LAY.M) return;
      try { drawInner(ctx); } catch (e) { S.drawErrors++; S.lastError = String(e && e.message || e).slice(0, 120); }
      // the module reports what it covered (for checks and the judge)
      var av = avoidRects(), ui = uiRects();
      for (var i = 0; i < drawnRects.length; i++) {
        var r = drawnRects[i];
        for (var j = 0; j < av.length; j++) if (hits(r, av[j])) { S.coverAvoid++; break; }
        for (j = 0; j < ui.length; j++) if (hits(r, ui[j])) { S.coverUi++; break; }
      }
    }
    function drawInner(ctx) {
      var M = LAY.M, C = LAY.col; if (!C) return;
      ctx.save();
      var smooth = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      var alpha = LAY.fade, y = C.y, R = function (v) { return M.pixel ? Math.round(v) : v; };
      if (alpha > 0.01) {
        // callouts share the top slot: a newer one slides in while the older one fades (crossfade, never a jump)
        var lc = C.callouts;
        for (var i = 0; i < lc.length; i++) {
          var it = lc[i], sz = it.sz, cx = R(edgeX(C.side, M, sz.w) + (C.side === 'left' ? -1 : 1) * it.slide * M.rowH * 0.8), cy = R(y), miss = !!it.c.miss;
          ctx.globalAlpha = alpha * it.alpha;
          panel(ctx, cx, cy, sz.w, sz.h, M, miss ? '#a04848' : THEME.gold, miss ? 'rgba(30,12,16,0.86)' : 'rgba(36,18,10,0.88)');
          pText(ctx, sz.name, cx + M.pad * 1.5, cy + M.pad * 1.5, M, miss ? '#ff9a8a' : THEME.gold, '#1a0c06');
          var gy = cy + M.pad * 1.5 + M.font + M.gap * 2, gx = drawGlyphs(ctx, sz.glyphs, cx + M.pad * 1.5, gy, M, !miss);
          if (sz.tag) pText(ctx, sz.tag, gx + M.gap * 2, R(gy + (M.icon - M.font) / 2), M, miss ? '#ff9a8a' : THEME.dim, '#1a0c06');
          drawnRects.push({ x: cx, y: cy, w: sz.w, h: sz.h, kind: miss ? 'miss' : 'callout', a: Math.round(alpha * it.alpha * 100) / 100, id: it.c.move.id + '@' + it.c.at });
        }
        if (P.display !== 'off' && C.nRows > 0.01) {
          var ry = y + C.calH, newest = rows[0], slide = newest ? 1 - ease((STEP - newest.start) / 5) : 0;
          // a new row fades in on top while the others glide one row down; the row pushed past the last slot fades out
          var full = Math.floor(C.nRows + 1e-6), frac = C.nRows - full;
          for (var n = 0; n < Math.min(rows.length, full + 1); n++) {
            var r = rows[n], pos = n === 0 ? 0 : n - slide, ra = n === 0 ? 1 - slide : n >= full ? (frac > 0.01 ? frac : slide) : 1;
            if (n >= full && pos + 1 > C.nRows + 0.01 && frac > 0.01) ra = Math.min(ra, frac);
            if (ra <= 0.02) continue;
            var ry2 = R(ry + pos * M.rowH), rw = rowWidth(M, r), rx = edgeX(C.side, M, rw);
            var hl = r.hl >= 0 && STEP - r.hl < 90, gold = hl && STEP - r.hl < 75;
            ctx.globalAlpha = alpha * ra;
            panel(ctx, rx, ry2, rw, M.rowH - M.gap, M, gold ? THEME.gold : r.miss ? '#a04848' : THEME.edge);
            var ix = rx + M.pad, iy = R(ry2 + (M.rowH - M.gap - M.icon) / 2);
            drawDir(ctx, r.a, ix, iy, M, gold ? 'gold' : null, 1);
            ix += M.icon + M.gap * 2;
            for (var bI = 0; bI < BTN.length; bI++) if (r.b & BTN[bI].bit) { drawBtn(ctx, BTN[bI], ix, iy, M); ix += M.icon + M.gap; }
            if (P.frames === 'on') {
              var cnt = r.n > 99 ? '99' : String(r.n), tw = textW(cnt, M);
              pText(ctx, cnt, rx + rw - M.pad - tw, R(ry2 + (M.rowH - M.gap - M.font) / 2), M, THEME.dim, null);
            }
            drawnRects.push({ x: rx, y: ry2, w: rw, h: M.rowH - M.gap, kind: 'row', a: Math.round(alpha * ra * 100) / 100 });
          }
        }
      }
      // move list (arrows follow the facing: the list mirrors when the character turns)
      if (LAY.list && (LAY.listFade || 0) > 0.01) {
        var L = LAY.list; ctx.globalAlpha = LAY.listFade;
        panel(ctx, L.x, L.y, L.w, L.h, M);
        var ly = L.y + M.pad;
        for (var mI = 0; mI < MOVES.length; mI++) {
          var mv = MOVES[mI], gl = glyphs(mv, lastFacing), age = hlMove && hlMove.id === mv.id ? STEP - hlMove.at : 1e9, recent = age < 75;
          if (recent) { ctx.globalAlpha = LAY.listFade * (0.25 + 0.35 * ease((75 - age) / 75)); ctx.fillStyle = THEME.gold; ctx.fillRect(R(L.x + M.k * 2), R(ly), R(L.w - 4 * M.k), R(M.icon + M.gap)); ctx.globalAlpha = LAY.listFade; }
          drawGlyphs(ctx, gl, L.x + M.pad, R(ly + M.gap * 0.5), M, false);
          pText(ctx, mv.name.toUpperCase(), L.x + L.nameX, R(ly + M.gap * 0.5 + (M.icon - M.font) / 2), M, recent ? '#ffffff' : THEME.text, '#140c14');
          ly += M.icon + M.gap * 2;
        }
        drawnRects.push({ x: L.x, y: L.y, w: L.w, h: L.h, kind: 'movelist', a: Math.round(LAY.listFade * 100) / 100 });
      }
      ctx.imageSmoothingEnabled = smooth;
      ctx.restore();
    }

    /* ---------- scripted input ---------- */
    // drive('236A') or drive([{d: 2, n: 3}, ...]): replaces the device input on the next steps (tests, demos, judges)
    function frames(spec, f, opt) {
      opt = opt || {}; f = faceOf(f) || lastFacing;
      var out = [], hold = Math.max(1, Math.round(num(opt.hold, 3)));
      function add(d, n, bmask) { var a = rel(d, f); for (var i = 0; i < n; i++) out.push({ x: dx(a), y: dy(a), b: i === 0 ? (bmask || 0) : 0 }); }
      if (Array.isArray(spec)) { spec.forEach(function (s) { var b = 0; (s.b || '').split('').forEach(function (n) { var q = btnByName(n); if (q) b |= q.bit; }); add(s.d || 5, s.n || 1, b); }); return out; }
      var m = typeof spec === 'string' ? (parse(spec) ? normMove({ notation: spec }, 0) : null) : spec;
      if (!m) return out;
      var bit = m.button && btnByName(m.button) ? btnByName(m.button).bit : 0;
      if (m.kind === 'charge') { add(m.charge, Math.round(P.chargeFrames) + 4, 0); add(m.seq[0], 1, 0); add(m.seq[m.seq.length - 1], 2, bit); }
      else if (m.kind === 'spin') { [6, 3, 2, 1, 4, 7, 8].forEach(function (d, i) { add(d, 2, i === 6 ? bit : 0); }); }
      else { for (var i = 0; i < m.seq.length; i++) add(m.seq[i], i === m.seq.length - 1 ? 1 : hold, 0); if (bit) add(m.seq[m.seq.length - 1], 2, bit); }
      add(5, 2, 0);
      return out;
    }
    function drive(spec, opt) { var fr = frames(spec, opt && opt.facing != null ? opt.facing : lastFacing, opt); drives = drives.concat(fr); return fr.length; }

    // jumpHold() -> > 0 while the game should keep its jump start open (0 = jump as usual): only while a registered move that
    // passes through up may be under way: the stick is ROLLING (it has moved on around the ring, one or two notches at a time
    // in one direction, each new direction entered <= rollGap steps after the previous one, the last one <= rollGap steps ago)
    // and a 360 is registered; a motion string whose directions before an up are in the buffer; a full charge for a charge
    // move that ends upward. The value is the steps left of the cap (jumpHold param), counted from the step up was last
    // pressed; it turns 0 when the motion completes (the special fires, which also clears the hold), stalls or runs out.
    var RING = { 6: 0, 9: 1, 8: 2, 7: 3, 4: 4, 1: 5, 2: 6, 3: 7 }, upFrom = -1;
    function rolling() {
      var gapMax = Math.max(1, Math.round(P.rollGap)), nGap = Math.max(0, Math.round(P.rollNeutral)), span = gapMax + nGap;
      var lo = Math.max(STEP - H.length + 1, usedUpTo + 1, STEP - span * 8), ents = [], n, prev = null, run = 0;
      for (n = lo; n <= STEP; n++) {
        var r = rec(n); if (!r) continue;
        // a short neutral (keys handed over with a small gap) keeps the roll alive; a longer one ends it
        if (r.a === 5) { if (++run > nGap) { prev = null; ents = []; } continue; }
        run = 0;
        if (prev === null || r.a !== prev) { ents.push({ a: r.a, n: n }); prev = r.a; }
      }
      if (ents.length < 2 || run > nGap || STEP - ents[ents.length - 1].n > gapMax + run) return false;   // stalled on one direction
      var prog = 0, sign = 0;
      for (var i = ents.length - 1; i > 0; i--) {
        var A2 = ents[i].a, B2 = ents[i - 1].a, d = (RING[A2] - RING[B2] + 8) % 8, sg = d >= 1 && d <= 2 ? 1 : d >= 6 ? -1 : 0;
        if (!sg || (sign && sg !== sign) || ents[i].n - ents[i - 1].n > span) break;
        sign = sg; prog += sg > 0 ? d : 8 - d;
      }
      return prog >= 1;
    }
    function upMoveInProgress() {
      for (var i = 0; i < MOVES.length; i++) {
        var m = MOVES[i];
        if (m.kind === 'spin') { if (rolling()) return true; }
        else if (m.kind === 'charge') { if (dy(m.seq[m.seq.length - 1]) > 0 && dy(m.charge) < 0 && charge.D >= P.chargeFrames) return true; }
        else for (var k = 1; k < m.seq.length; k++) if (dy(m.seq[k]) > 0) { if (seqAt(m.seq.slice(0, k), STEP, lastFacing, P.stepWindow) >= 0) return true; break; }
      }
      return false;
    }
    function jumpHold() {
      var cap = Math.round(P.jumpHold);
      if (cap <= 0 || upFrom < 0 || !upMoveInProgress()) return 0;
      return Math.max(0, cap - (STEP - upFrom));
    }

    function reset() { upFrom = -1; H = []; prevHeld = 0; usedUpTo = STEP; pending = null; drives = []; rows = []; callouts = []; hlMove = null; for (var q in charge) charge[q] = 0; }

    return {
      step: function (inp, opt) { try { return stepFn(inp, opt); } catch (e) { S.stepErrors++; return inp; } },
      draw: draw,
      reset: reset,
      drive: drive,
      frames: function (spec, f, opt) { return frames(spec, f, opt); },
      driving: function () { return drives.length > 0; },
      jumpHold: function () { try { return jumpHold(); } catch (e) { return 0; } },
      moves: function () { return MOVES.map(function (m) { return { id: m.id, name: m.name, notation: m.notation, kind: m.kind, button: m.button, priority: m.priority }; }); },
      setMoves: function (l) { setMoves(l); },
      glyphs: function (id, f) { for (var i = 0; i < MOVES.length; i++) if (MOVES[i].id === id || MOVES[i].notation === id) return glyphs(MOVES[i], faceOf(f) || lastFacing); return []; },
      buttons: function () { return BTN.map(function (b) { return { name: b.name, key: b.key, label: b.label, color: b.col[0] }; }); },
      showMoveList: function (on) { listOn = on == null ? !listOn : !!on; return listOn; },
      setParams: function (p) { setParams(p || {}); THEME = THEMES[P.theme] || THEMES.ember; },
      params: function () { var c = {}; for (var q in P) c[q] = P[q]; return c; },
      fired: function () { return fired.slice(); },
      lastFired: function () { return fired.length ? fired[fired.length - 1] : null; },
      pending: function () { return pending ? { id: pending.move.id, left: pending.left } : null; },
      history: function (n) { var out = [], i; n = n || H.length; for (i = Math.max(0, H.length - n); i < H.length; i++) out.push({ a: H[i].a, f: H[i].f, p: H[i].p }); return out; },
      rows: function () { return rows.slice(0, 12).map(function (r) { return { dir: r.a, buttons: BTN.filter(function (b) { return r.b & b.bit; }).map(function (b) { return b.name; }), n: r.n, hl: r.hl >= 0, miss: r.miss }; }); },
      charge: function () { return { L: charge.L, R: charge.R, D: charge.D, U: charge.U }; },
      layout: function () { var C = LAY.col; return C ? { side: LAY.side, x: C.x, y: C.y, w: C.w, h: C.h, rows: C.nRows, fade: LAY.fade, k: LAY.k, cssK: LAY.cssK, pixel: LAY.pixel, list: LAY.list } : null; },
      lastDrawn: function () { return drawnRects.slice(); },
      stats: function () { var c = {}; for (var q in S) c[q] = S[q]; c.fired = JSON.parse(JSON.stringify(S.fired)); c.step = STEP; c.k = LAY.k; c.cssK = Math.round(LAY.cssK * 100) / 100; c.side = LAY.side; c.version = VERSION; return c; }
    };
  }

  // run a list of frames ({x, y, b} or input objects) through a fresh instance: [{id, step, buffered}] (tests)
  function run(opts, inputs) {
    var cfg = {}, q; for (q in opts || {}) cfg[q] = opts[q];
    var inst = create(cfg), btn = inst.buttons();
    for (var i = 0; i < inputs.length; i++) {
      var fr = inputs[i], inp;
      if (fr && fr.x != null) { inp = { left: fr.x < 0, right: fr.x > 0, up: fr.y > 0, down: fr.y < 0, facing: fr.f != null ? fr.f : 1 }; btn.forEach(function (b, j) { inp[b.key] = !!(fr.b & (1 << j)); }); }
      else inp = fr;
      inst.step(inp);
    }
    return { fired: inst.fired(), stats: inst.stats(), inst: inst };
  }

  // gamepad: d-pad (12-15) or the left stick (8-way, dead zone 0.5); map = {A: [0], B: [1, 2]} -> {left, right, up, down, A, B, pad}
  function pad(index, map) {
    var out = { left: false, right: false, up: false, down: false, pad: false };
    var list = []; try { list = (root.navigator && root.navigator.getGamepads) ? root.navigator.getGamepads() : []; } catch (e) { list = []; }
    var gp = null;
    if (index != null && list[index]) gp = list[index];
    else for (var i = 0; i < (list ? list.length : 0); i++) if (list[i] && list[i].connected !== false) { gp = list[i]; break; }
    map = map || { A: [0], B: [1] };
    for (var name in map) out[name] = false;
    if (!gp) return out;
    out.pad = true;
    var B = gp.buttons || [], pressed = function (n) { var b = B[n]; return !!(b && (b.pressed || b.value > 0.5)); };
    var ax = gp.axes && gp.axes.length > 1 ? +gp.axes[0] || 0 : 0, ay = gp.axes && gp.axes.length > 1 ? +gp.axes[1] || 0 : 0;
    if (Math.hypot(ax, ay) > 0.5) { var a = Math.atan2(-ay, ax), sec = Math.round(a / (Math.PI / 4)); var X = Math.round(Math.cos(sec * Math.PI / 4)), Y = Math.round(Math.sin(sec * Math.PI / 4)); out.right = X > 0; out.left = X < 0; out.up = Y > 0; out.down = Y < 0; }
    if (pressed(12)) out.up = true; if (pressed(13)) out.down = true; if (pressed(14)) out.left = true; if (pressed(15)) out.right = true;
    for (name in map) { var ids = Array.isArray(map[name]) ? map[name] : [map[name]]; for (var j = 0; j < ids.length; j++) if (pressed(ids[j])) out[name] = true; }
    return out;
  }
  // OR two inputs (keyboard + pad)
  function merge(a, b) { var out = {}, q; for (q in a || {}) out[q] = a[q]; for (q in b || {}) if (typeof b[q] === 'boolean') out[q] = !!out[q] || b[q]; else if (out[q] == null) out[q] = b[q]; return out; }

  var API = { version: VERSION, create: create, parse: parse, run: run, pad: pad, merge: merge, mirror: mirror, rel: rel, dirNum: dirNum, DEFAULTS: DEF, STRICT: STRICT, font: F7 };
  root.GameDNA_MotionInputs = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
