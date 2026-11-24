/* GameDNA_BeatJudge (F-04 beat-judge) v1.1.0 - a beat clock and an input judge for rhythm actions.
 *
 *   const beat = GameDNA_BeatJudge.create({ params: { bpm: 120 }, music, onRate: r => { ... } });
 *   beat.update(stepMs);                  // the game's fixed step, every scene (also while paused, menus, ?t= loops)
 *   const r = beat.press(event);          // the moment the game ACCEPTS the action; pass the key / pointer event
 *   if (r.rating === 'perfect') dmg *= 1.5; // the game decides what a rating does
 *   beat.draw(ctx, { x, y, w, h });       // the beat track: markers slide to the judge ring, ratings, combo
 *   beat.calibrate();                     // the calibration window (busy() while open: route keys with beat.key())
 *
 * Beats come from F-03 chip-music when an instance is passed as `music` (its own plan: tempo, switches, jingle pauses,
 * resumes), otherwise from the module's own beat clock with an optional click track. The beat clock is game time from
 * update() until sound runs, then the audio clock, so ?t= stills and automated runs are deterministic. A press is judged
 * at the time its EVENT happened (event.timeStamp mapped to the beat clock), never at the frame that handles it, minus the
 * audio output latency and the player's calibration offset. One classic script, no dependencies, ASCII only.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0';
  var DEFAULTS = { bpm: 120, beatsPerBar: 4, offset: 0, latency: 'auto', perfect: 45, good: 100, lead: 1800, click: 'auto', volume: 0.5, mute: false, expect: false, labels: true, taps: 8 };
  var GESTURES = ['pointerdown', 'mousedown', 'touchend', 'keydown', 'click'];
  var COL = { perfect: '#ffd84a', good: '#5ee6ff', miss: '#ff5a6a', beat: '#e8f0ff', down: '#ffb84a', plate: 'rgba(12,10,26,0.86)', edge: '#3a3466', hi: 'rgba(255,255,255,0.16)', ink: '#0c0a16', dim: '#9a94c0', past: '#5e5878' };
  var LABEL = { perfect: 'PERFECT', good: 'GOOD', miss: 'MISS' };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return v == null || v === '' || !isFinite(+v) ? d : +v; }
  function bool(v, d) { if (v == null || v === '') return d; if (v === 'off' || v === 'false' || v === '0' || v === 0) return false; return !!v; }
  function AudioCtor() { return root.AudioContext || root.webkitAudioContext || null; }
  function OfflineCtor() { return root.OfflineAudioContext || root.webkitOfflineAudioContext || null; }
  function hit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

  /* ---------------- 5x7 pixel font (caps, digits, a few signs; the C-03 regular cell) ---------------- */
  var GL = {
    'A': '.###. #...# #...# ##### #...# #...# #...#', 'B': '####. #...# #...# ####. #...# #...# ####.', 'C': '.###. #...# #.... #.... #.... #...# .###.',
    'D': '###.. #..#. #...# #...# #...# #..#. ###..', 'E': '##### #.... #.... ####. #.... #.... #####', 'F': '##### #.... #.... ####. #.... #.... #....',
    'G': '.###. #...# #.... #.### #...# #...# .####', 'H': '#...# #...# #...# ##### #...# #...# #...#', 'I': '### .#. .#. .#. .#. .#. ###',
    'J': '..### ...#. ...#. ...#. #..#. #..#. .##..', 'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#', 'L': '#... #... #... #... #... #... ####',
    'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#', 'N': '#...# ##..# #.#.# #..## #...# #...# #...#', 'O': '.###. #...# #...# #...# #...# #...# .###.',
    'P': '####. #...# #...# ####. #.... #.... #....', 'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#', 'R': '####. #...# #...# ####. #.#.. #..#. #...#',
    'S': '.#### #.... #.... .###. ....# ....# ####.', 'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..', 'U': '#...# #...# #...# #...# #...# #...# .###.',
    'V': '#...# #...# #...# #...# #...# .#.#. ..#..', 'W': '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.', 'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', 'Z': '##### ....# ...#. ..#.. .#... #.... #####',
    '0': '.###. #...# #..## #.#.# ##..# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.', '2': '.###. #...# ....# ...#. ..#.. .#... #####',
    '3': '####. ....# ....# .###. ....# ....# ####.', '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.', '5': '##### #.... ####. ....# ....# #...# .###.',
    '6': '..##. .#... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. .#... .#... .#...', '8': '.###. #...# #...# .###. #...# #...# .###.',
    '9': '.###. #...# #...# .#### ....# ...#. .##..', '+': '..... ..#.. ..#.. ##### ..#.. ..#..', '-': '.... .... .... ####', '.': '.. .. .. .. .. ## ##',
    '/': '....# ...#. ...#. ..#.. .#... .#... #....', ':': '.. ## ## .. .. ## ##', '!': '# # # # # . #', '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
    'x': '..... ..... #...# .#.#. ..#.. .#.#. #...#', ',': '.. .. .. .. ## .# #.', "'": '# # .', '%': '##... ##..# ...#. ..#.. .#... #..## ...##'
  };
  var FONT = {};
  Object.keys(GL).forEach(function (k) { var rows = GL[k].split(' '); FONT[k] = { w: rows[0].length, rows: rows }; });
  function textW(s, u) { var w = 0; s = String(s); for (var i = 0; i < s.length; i++) { var g = FONT[s.charAt(i)]; w += (g ? g.w : 3) + 1; } return Math.max(0, w - 1) * u; }
  function glyphs(g, s, x, y, u, col) {
    g.fillStyle = col; s = String(s);
    for (var i = 0; i < s.length; i++) {
      var gl = FONT[s.charAt(i)];
      if (gl) for (var r = 0; r < gl.rows.length; r++) for (var c = 0; c < gl.w; c++) if (gl.rows[r].charAt(c) === '#') g.fillRect(x + c * u, y + r * u, u, u);
      x += ((gl ? gl.w : 3) + 1) * u;
    }
  }
  // text with a 1 px dark outline (readable over any scene); returns its rect
  function say(g, s, x, y, u, col, align) {
    var w = textW(s, u); if (align === 'right') x -= w; else if (align === 'center') x -= Math.round(w / 2);
    x = Math.round(x); y = Math.round(y);
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if (dx || dy) glyphs(g, s, x + dx * u, y + dy * u, u, COL.ink);
    glyphs(g, s, x, y, u, col);
    return { x: x - u, y: y - u, w: w + 2 * u, h: 9 * u };
  }

  /* ---------------- click voice (live and offline: one function) ---------------- */
  var NOISE = typeof WeakMap === 'function' ? new WeakMap() : null;
  function noiseBuf(ctx) {
    var b = NOISE && NOISE.get(ctx); if (b) return b;
    var n = Math.floor(ctx.sampleRate * 0.03); b = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = b.getChannelData(0), s = 12345;
    for (var i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff - 1) * (1 - i / n); }
    if (NOISE) NOISE.set(ctx, b);
    return b;
  }
  // a short woodblock tick: a pitched body (downbeat higher) and a filtered noise transient, both starting exactly at t
  function clickVoice(ctx, dest, t, down) {
    var f = down ? 1568 : 1046.5;
    var o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.94, t + 0.05);
    og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(down ? 0.62 : 0.46, t + 0.0015); og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(og); og.connect(dest); o.start(t); o.stop(t + 0.08);
    var n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = noiseBuf(ctx); hp.type = 'highpass'; hp.frequency.value = 2500;
    ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.16, t + 0.001); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    n.connect(hp); hp.connect(ng); ng.connect(dest); n.start(t); n.stop(t + 0.03);
  }

  function normParams(p, base) {
    var o = Object.assign({}, base || DEFAULTS); p = p || {};
    if (p.bpm != null) o.bpm = clamp(num(p.bpm, o.bpm), 30, 300);
    if (p.beatsPerBar != null) o.beatsPerBar = clamp(Math.round(num(p.beatsPerBar, o.beatsPerBar)), 1, 12);
    if (p.offset != null) o.offset = clamp(num(p.offset, o.offset), -400, 400);
    if (p.latency != null) o.latency = p.latency === 'auto' ? 'auto' : clamp(num(p.latency, 0), 0, 500);
    if (p.perfect != null) o.perfect = clamp(num(p.perfect, o.perfect), 10, 200);
    if (p.good != null) o.good = clamp(num(p.good, o.good), 20, 400);
    if (o.good < o.perfect + 5) o.good = o.perfect + 5;
    if (p.lead != null) o.lead = clamp(num(p.lead, o.lead), 600, 5000);
    if (p.click === 'on' || p.click === 'off' || p.click === 'auto') o.click = p.click;
    if (p.volume != null) o.volume = clamp(num(p.volume, o.volume), 0, 1);
    if (p.mute != null) o.mute = bool(p.mute, o.mute);
    if (p.expect != null) o.expect = bool(p.expect, o.expect);
    if (p.labels != null) o.labels = bool(p.labels, o.labels);
    if (p.taps != null) o.taps = clamp(Math.round(num(p.taps, o.taps)), 4, 16);
    return o;
  }
  // pure: the rating of a press `d` ms from its beat (d > 0 = late), with the windows of params p
  function rateDelta(d, p) { p = normParams(p || {}); var a = Math.abs(d); return a <= p.perfect ? 'perfect' : a <= p.good ? 'good' : 'miss'; }

  function create(options) {
    options = options || {};
    var P = normParams(options.params || {});
    var music = options.music && typeof options.music.plan === 'function' ? options.music : null;
    var now = typeof options.now === 'function' ? options.now : function () { return root.performance && performance.now ? performance.now() : Date.now(); };
    var onRate = typeof options.onRate === 'function' ? options.onRate : null, onBeat = typeof options.onBeat === 'function' ? options.onBeat : null;
    var onCal = typeof options.onCalibrated === 'function' ? options.onCalibrated : null;
    var HINT = { tap: String((options.hints || {}).tap || 'ACTION KEY OR TAP').toUpperCase(), cancel: String((options.hints || {}).cancel || 'BACK KEY: CANCEL').toUpperCase() };
    var S = { updates: 0, presses: 0, perfect: 0, good: 0, miss: 0, skipped: 0, beats: 0, clicks: 0, calibrations: 0, kept: 0, errors: 0, locked: true };
    var K = { clock: 0, segs: [{ t0: 0, i0: 0, ms: 60000 / P.bpm }], lagBuf: [], lag: null, perfAt: null, prev: 0 };
    var claims = {}, hist = [], combo = 0, best = 0, last = null, fade = 1, lane = null, drawn = [], cal = null, uid = 0, beatSeen = -Infinity;
    var ctx = null, master = null, listening = false, unlockedAt = -1e9, anchorCtx = 0, anchorClock = 0, sched = {};

    function warn(e) { S.errors++; if (S.errors < 4 && root.console) { try { console.warn('GameDNA_BeatJudge: ' + (e && e.message || e)); } catch (x) { } } }
    function call(f, a) { try { return f(a); } catch (e) { warn(e); return null; } }
    function useClick() { return P.click === 'on' || (P.click === 'auto' && !music); }

    /* ----- the beat grid ----- */
    function ownBeats(t0, t1) {
      var out = [], segs = K.segs, bpb = P.beatsPerBar;
      for (var s = 0; s < segs.length; s++) {
        var g = segs[s], end = s + 1 < segs.length ? segs[s + 1].t0 : Infinity, a = Math.max(t0, g.t0), b = Math.min(t1, end);
        if (b <= a) continue;
        for (var k = Math.max(0, Math.ceil((a - g.t0) / g.ms - 1e-9)); ; k++) {
          var t = g.t0 + k * g.ms; if (t >= b - 1e-9) break;
          var i = g.i0 + k;
          out.push({ key: 'o' + i, i: i, t: t, bar: Math.floor(i / bpb) + 1, beat: (i % bpb) + 1, down: i % bpb === 0, ms: g.ms });
        }
      }
      return out;
    }
    function musicBeats(t0, t1) {
      var out = [], plan = music.plan() || [];
      for (var p = 0; p < plan.length; p++) {
        var s = plan[p]; if (s.kind !== 'loop') continue;
        var c = music.song(s.track); if (!c || !c.rpb) continue;
        var a = Math.max(t0, s.c0), b = Math.min(t1, s.cEnd); if (!(b > a)) continue;
        var rpb = c.rpb, bpbR = rpb * (c.bpb || 4), xa = s.r0 + (a - s.c0) / s.rowMs, xb = s.r0 + (b - s.c0) / s.rowMs;
        for (var x = Math.ceil(xa / rpb - 1e-9) * rpb; x < xb - 1e-9; x += rpb) {
          var w = x < c.total || !c.loop ? x : c.loopRow + ((x - c.loopRow) % c.loopRows);
          out.push({ key: 'm' + s.id + ':' + x, i: x / rpb, t: s.c0 + (x - s.r0) * s.rowMs, bar: Math.floor(w / bpbR) + 1, beat: Math.floor((w % bpbR) / rpb) + 1, down: w % bpbR === 0, ms: s.rowMs * rpb, track: s.track });
        }
      }
      out.sort(function (a, b) { return a.t - b.t; });
      return out;
    }
    function beats(t0, t1) { try { return music ? musicBeats(t0, t1) : ownBeats(t0, t1); } catch (e) { warn(e); return []; } }

    /* ----- the clock ----- */
    function audioOn() { return !!(ctx && ctx.state === 'running' && !S.locked); }
    function musicClock() { var st = music.state(); return st && isFinite(st.clock) ? st.clock : K.clock; }
    // the clock right now (read only): the music's clock, the audio clock once our click runs, else the last update
    function live() {
      if (music) return musicClock();
      if (audioOn()) return Math.max(K.clock, anchorClock + (ctx.currentTime - anchorCtx) * 1000);
      return K.clock;
    }
    function outLatency() {
      if (P.latency !== 'auto') return P.latency;
      var c = music && typeof music.context === 'function' ? music.context() : ctx;
      if (!c || c.state !== 'running') return 0;
      var l = (c.outputLatency || 0) || (c.baseLatency || 0);
      return clamp(l * 1000, 0, 300);
    }
    function liveAudio() { return music ? !!(music.isUnlocked && music.isUnlocked()) : audioOn(); }
    // the beat-clock time of an input event: its timeStamp, not the frame that handles it
    function eventClock(ev) {
      if (ev && typeof ev.clock === 'number' && isFinite(ev.clock)) return ev.clock;
      var p = now(), ts = ev && typeof ev.timeStamp === 'number' && ev.timeStamp > 0 && Math.abs(p - ev.timeStamp) < 2000 ? ev.timeStamp : p;
      if (liveAudio()) return live() - (p - ts);
      if (K.lag == null) return K.clock;
      return ts - K.lag;
    }
    function trackLag(p) {
      // game time: clock ~ perf - lag; batched catch-up steps run late, so the smallest recent gap is the true one
      var d = p - K.clock; K.lagBuf.push(d); if (K.lagBuf.length > 30) K.lagBuf.shift();
      var m = Infinity; for (var i = 0; i < K.lagBuf.length; i++) if (K.lagBuf[i] < m) m = K.lagBuf[i];
      K.lag = m;
    }

    function update(stepMs) {
      try {
        var d = num(stepMs, 0); if (!(d > 0)) return; if (d > 250) d = 250;
        S.updates++;
        var prev = K.clock;
        if (music) K.clock = Math.max(K.clock, musicClock());
        else if (audioOn()) K.clock = Math.max(K.clock, anchorClock + (ctx.currentTime - anchorCtx) * 1000);
        else K.clock += d;
        trackLag(now());
        if (K.clock > prev) passBeats(prev, K.clock);
        if (audioOn() && useClick()) scheduleClicks();
        // lane fade: obstacles with an id (characters) under the track dim it, eased over a few steps
        var want = 1;
        if (lane && typeof options.getObstacles === 'function') { var ob = call(options.getObstacles) || []; for (var i = 0; i < ob.length; i++) { var o = ob[i]; if (o && o.id != null && o.w > 0 && hit(o, lane)) { want = 0.35; break; } } }
        fade += (want - fade) * Math.min(1, d / 90);
        if (cal) calStep();
        prune();
      } catch (e) { warn(e); }
    }
    function passBeats(a, b) {
      var L = beats(a, b + 1e-6);
      for (var i = 0; i < L.length; i++) {
        var bt = L[i]; if (bt.t <= a || bt.t > b || bt.t <= beatSeen) continue;
        beatSeen = bt.t; S.beats++;
        if (onBeat) call(onBeat, { key: bt.key, t: bt.t, bar: bt.bar, beat: bt.beat, down: bt.down });
      }
      if (P.expect && !cal) {   // unpressed beats count as misses once their window has passed
        var M = beats(a - P.good - 1, b - P.good + 1);
        for (var j = 0; j < M.length; j++) {
          var m = M[j], e = m.t + P.good; if (claims[m.key] || !(e > a + 1e-7 && e <= b + 1e-7)) continue;
          claims[m.key] = { rating: 'miss', t: m.t, skipped: true };
          S.skipped++; S.miss++; combo = 0;
          var r = { rating: 'miss', skipped: true, delta: null, early: false, late: true, beat: pub(m), combo: 0, t: Math.round(m.t + P.good), id: ++uid };
          hist.push({ r: r, t: m.t + P.good, beatT: m.t, tj: m.t + P.good, key: m.key }); last = r;
          if (onRate) call(onRate, r);
        }
      }
    }
    function prune() {
      var cut = K.clock - 6000;
      for (var k in claims) if (claims[k].t < cut) delete claims[k];
      while (hist.length > 24) hist.shift();
      for (var s in sched) if (sched[s] < cut) delete sched[s];
    }
    function pub(b) { return b ? { key: b.key, t: Math.round(b.t * 10) / 10, bar: b.bar, beat: b.beat, down: b.down } : null; }

    /* ----- judging ----- */
    function nearest(tj, free) {
      var span = Math.max(P.good + 50, 1200), L = beats(tj - span, tj + span), best = null;
      for (var i = 0; i < L.length; i++) { var b = L[i]; if (free && claims[b.key]) continue; if (!best || Math.abs(tj - b.t) < Math.abs(tj - best.t)) best = b; }
      return best;
    }
    function judge(tPress, claim) {
      var lat = outLatency(), tj = tPress - lat - P.offset;
      var b = nearest(tj, true), any = nearest(tj, false), d, rating;
      if (b && Math.abs(tj - b.t) <= P.good) { d = tj - b.t; rating = Math.abs(d) <= P.perfect ? 'perfect' : 'good'; }
      else { b = any; d = b ? tj - b.t : null; rating = 'miss'; }
      var r = { rating: rating, delta: d == null ? null : Math.round(d * 10) / 10, early: d != null && d < 0, late: d != null && d > 0, beat: pub(b), t: Math.round(tPress * 10) / 10, judged: Math.round(tj * 10) / 10, latency: Math.round(lat * 10) / 10, offset: P.offset };
      if (claim) {
        if (rating !== 'miss') { claims[b.key] = { rating: rating, t: b.t }; combo++; best = Math.max(best, combo); }
        else combo = 0;
        S[rating]++; r.combo = combo; r.id = ++uid;
        hist.push({ r: r, t: tPress, tj: tj, beatT: b ? b.t : null, key: b ? b.key : null }); last = r;
      }
      return r;
    }
    function press(ev) {
      try {
        if (cal) { calTap(ev); return { rating: null, calibrating: true }; }
        S.presses++;
        var r = judge(eventClock(ev), true);
        if (onRate) call(onRate, r);
        return r;
      } catch (e) { warn(e); return { rating: 'miss', delta: null, error: true }; }
    }

    /* ----- calibration ----- */
    function calibrate(o) {
      o = o || {};
      cal = { phase: 'count', t0: K.clock, startBeat: null, taps: [], sel: 0, result: null, at: K.clock, onDone: typeof o.onDone === 'function' ? o.onDone : null, buttons: [] };
      var nb = beats(K.clock + 1, K.clock + 4000)[0]; cal.startBeat = nb ? nb.t : K.clock;
      S.calibrations++;
      return true;
    }
    function calStep() {
      var L = beats(cal.startBeat - 1, K.clock + 1e-6), n = L.length, bpb = P.beatsPerBar;
      // the count-in is one bar; taps open half a beat after its last beat, so an early tap on the next beat counts
      if (cal.phase === 'count' && n >= bpb && K.clock >= L[bpb - 1].t + L[bpb - 1].ms * 0.5) { cal.phase = 'tap'; cal.at = K.clock; }
      if (cal.phase === 'tap' && (cal.taps.length >= P.taps || n > bpb + P.taps * 2 + 2)) finishCal();
    }
    function calTap(ev) {
      if (!cal) return;
      if (cal.phase === 'result') { calChoose(); return; }
      if (cal.phase !== 'tap') return;
      var t = eventClock(ev), tj = t - outLatency(), b = nearest(tj, false);
      if (!b) return;
      var d = tj - b.t; if (Math.abs(d) > b.ms * 0.45) return;
      for (var i = 0; i < cal.taps.length; i++) if (cal.taps[i].key === b.key) return;   // one tap per beat
      cal.taps.push({ d: d, key: b.key, t: t });
      if (cal.taps.length >= P.taps) finishCal();
    }
    function finishCal() {
      var ds = cal.taps.map(function (x) { return x.d; }).sort(function (a, b) { return a - b; });
      var ok = ds.length >= Math.min(4, P.taps), med = ok ? (ds.length % 2 ? ds[(ds.length - 1) / 2] : (ds[ds.length / 2 - 1] + ds[ds.length / 2]) / 2) : null;
      var spread = ok ? ds[Math.floor(ds.length * 0.75)] - ds[Math.floor(ds.length * 0.25)] : null;
      cal.phase = 'result'; cal.at = K.clock; cal.result = { ok: ok, offset: ok ? Math.round(med) : null, spread: spread == null ? null : Math.round(spread), taps: ds.length };
      cal.sel = 0;   // ok: KEEP, else CANCEL (index 0 of each row)
    }
    function calOptions() { return cal && cal.result && cal.result.ok ? ['keep', 'retry', 'cancel'] : ['cancel', 'retry']; }
    function calChoose(which) {
      if (!cal || cal.phase !== 'result' || K.clock - cal.at < 250) return;
      var opt = which || calOptions()[cal.sel], res = cal.result, done = cal.onDone;
      if (opt === 'retry') { calibrate({ onDone: done }); S.calibrations--; return; }
      var kept = opt === 'keep' && res && res.ok;
      if (kept) { P.offset = clamp(res.offset, -400, 400); S.kept++; }
      cal = null;
      var out = { kept: kept, offset: P.offset, measured: res ? res.offset : null, spread: res ? res.spread : null, taps: res ? res.taps : 0 };
      if (done) call(done, out);
      if (onCal) call(onCal, out);
    }
    function key(name, ev) {
      try {
        if (!cal) return false;
        if (name === 'confirm' || name === 'tap') { calTap(ev); return true; }
        if (name === 'back') { if (cal.phase !== 'result') { cal.taps = []; finishCal(); } cal.at = -1e9; calChoose('cancel'); return true; }   // back always closes at once
        if (cal.phase === 'result' && (name === 'left' || name === 'right' || name === 'up' || name === 'down')) {
          var n = calOptions().length; cal.sel = (cal.sel + (name === 'left' || name === 'up' ? n - 1 : 1)) % n; return true;
        }
        return true;   // the window owns the keys while open
      } catch (e) { warn(e); return true; }
    }
    function pointer(x, y, ev) {
      try {
        if (!cal) return false;
        if (cal.phase === 'result') { for (var i = 0; i < cal.buttons.length; i++) { var b = cal.buttons[i]; if (x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h) { cal.sel = i; calChoose(b.opt); return true; } } return true; }
        calTap(ev); return true;
      } catch (e) { warn(e); return true; }
    }

    /* ----- audio (own click track) ----- */
    function ensure() {
      if (ctx) return ctx;
      try {
        var sfx = options.sfx;
        if (sfx && typeof sfx.context === 'function') { if (!sfx.context() && typeof sfx.unlock === 'function') sfx.unlock(); ctx = sfx.context() || null; }
        if (!ctx) { var AC = AudioCtor(); if (!AC) return null; ctx = new AC({ latencyHint: 'interactive' }); }
        master = ctx.createGain(); master.gain.value = P.mute ? 0 : P.volume; master.connect(ctx.destination);
      } catch (e) { warn(e); ctx = null; master = null; }
      return ctx;
    }
    function startAudio() {
      if (!ctx || ctx.state !== 'running' || !S.locked) return;
      S.locked = false; stopListening(); unlockedAt = now();
      anchorCtx = ctx.currentTime; anchorClock = K.clock;
    }
    function unlock() {
      if (music) { S.locked = false; stopListening(); unlockedAt = now(); return true; }   // the music owns the context
      if (!useClick()) return false;
      if (!ensure()) return false;
      try { if (ctx.state !== 'running' && ctx.resume) { var pr = ctx.resume(); if (pr && pr.then) pr.then(startAudio, function () { }); } } catch (e) { warn(e); }
      startAudio();
      return audioOn();
    }
    function onGesture() {
      try { if (root.navigator && navigator.userActivation && !navigator.userActivation.isActive) return; } catch (e) { }
      try { unlock(); } catch (e) { warn(e); }
    }
    function listen() { if (listening || !root.addEventListener) return; listening = true; GESTURES.forEach(function (n) { root.addEventListener(n, onGesture, { capture: true, passive: true }); }); }
    function stopListening() { if (!listening) return; listening = false; GESTURES.forEach(function (n) { try { root.removeEventListener(n, onGesture, { capture: true }); } catch (e) { } }); }
    function scheduleClicks() {
      var cl = live(), L = beats(cl, cl + 250);
      for (var i = 0; i < L.length; i++) {
        var b = L[i]; if (sched[b.key] != null) continue;
        sched[b.key] = b.t;
        var at = ctx.currentTime + (b.t - cl) / 1000;
        if (at < ctx.currentTime) continue;
        try { clickVoice(ctx, master, at, b.down); S.clicks++; } catch (e) { warn(e); }
      }
    }
    function applyGain() { if (master && ctx) { try { master.gain.setTargetAtTime(P.mute ? 0 : P.volume, ctx.currentTime, 0.015); } catch (e) { warn(e); } } }
    function setParams(p) {
      var old = P; P = normParams(p || {}, P);
      if (!music && P.bpm !== old.bpm) {   // a tempo change lands on the next beat, so the grid never jumps
        var nb = ownBeats(K.clock + 1e-6, K.clock + 4 * 60000 / old.bpm)[0];
        if (nb) { K.segs = K.segs.filter(function (s) { return s.t0 <= K.clock; }); K.segs.push({ t0: nb.t, i0: nb.i, ms: 60000 / P.bpm }); }
      }
      if (useClick() && S.locked && !options.offline) { try { if (root.navigator && navigator.userActivation && navigator.userActivation.isActive) unlock(); } catch (e) { } }
      applyGain();
      return Object.assign({}, P);
    }
    function mute(on) { setParams({ mute: on == null ? !P.mute : !!on }); return P.mute; }
    // a sound button: the click that started audio only starts it; later clicks toggle mute
    function toggle() { if (S.locked) unlock(); else if (now() - unlockedAt > 400) mute(); return P.mute; }
    // restart the bar count: bar 1 beat 1 lands on the next step (own clock only); clears combo and claims
    function restart() {
      if (!music) K.segs = [{ t0: K.clock + 0.001, i0: 0, ms: 60000 / P.bpm }];
      beatSeen = K.clock - 1e-6; claims = {}; hist = []; combo = 0; last = null;
    }

    /* ----- state ----- */
    function curBeat(cl) {
      var L = beats(cl - 4000, cl + 4000), prev = null, next = null;
      for (var i = 0; i < L.length; i++) { if (L[i].t <= cl) prev = L[i]; else { next = L[i]; break; } }
      return { prev: prev, next: next, phase: prev && next ? clamp((cl - prev.t) / (next.t - prev.t), 0, 1) : prev ? clamp((cl - prev.t) / prev.ms, 0, 1) : 0 };
    }
    function state() {
      try {
        var cl = K.clock, cb = curBeat(cl), bpm = cb.prev ? 60000 / cb.prev.ms : cb.next ? 60000 / cb.next.ms : P.bpm;
        return { t: Math.round(cl), clock: Math.round(cl * 10) / 10, source: music ? 'music' : 'own', bpm: Math.round(bpm * 10) / 10,
          bar: cb.prev ? cb.prev.bar : null, beat: cb.prev ? cb.prev.beat : null, phase: Math.round(cb.phase * 1000) / 1000, next: pub(cb.next), gap: !cb.prev || !cb.next || cb.next.t - cb.prev.t > cb.prev.ms * 1.5,
          offset: P.offset, latency: Math.round(outLatency() * 10) / 10, combo: combo, best: best, counts: { perfect: S.perfect, good: S.good, miss: S.miss },
          last: last ? Object.assign({}, last) : null, calibrating: cal ? { phase: cal.phase, taps: cal.taps.map(function (x) { return Math.round(x.d); }), result: cal.result, sel: calOptions()[cal.sel] || null } : null,
          locked: S.locked, muted: P.mute, volume: P.volume, click: useClick() };
      } catch (e) { warn(e); return null; }
    }

    /* ----- drawing: the beat track ----- */
    function ringPts(r) {   // midpoint circle outline points
      var pts = [], x = r, y = 0, err = 1 - r;
      while (x >= y) { pts.push([x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]); y++; if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; } }
      return pts;
    }
    var RINGS = {};
    function ring(g, cx, cy, r, u, col) { var k = r; var pts = RINGS[k] || (RINGS[k] = ringPts(r)); g.fillStyle = col; for (var i = 0; i < pts.length; i++) g.fillRect(cx + pts[i][0] * u - (u >> 1), cy + pts[i][1] * u - (u >> 1), u, u); }
    function disc(g, cx, cy, r, u, col) { g.fillStyle = col; for (var y = -r; y <= r; y++) { var w = Math.floor(Math.sqrt(r * r - y * y + r * 0.6)); g.fillRect(cx - w * u - (u >> 1), cy + y * u - (u >> 1), (2 * w + 1) * u, u); } }
    function diamond(g, cx, cy, r, u, fill, hiCol) {
      var y;
      g.fillStyle = COL.ink; for (y = -r - 1; y <= r + 1; y++) { var w = r + 1 - Math.abs(y); g.fillRect(cx - w * u - (u >> 1), cy + y * u - (u >> 1), (2 * w + 1) * u, u); }
      g.fillStyle = fill; for (y = -r; y <= r; y++) { var w2 = r - Math.abs(y); g.fillRect(cx - w2 * u - (u >> 1), cy + y * u - (u >> 1), (2 * w2 + 1) * u, u); }
      if (hiCol && r >= 2) { g.fillStyle = hiCol; g.fillRect(cx - u - (u >> 1), cy - u - (u >> 1), u, u); g.fillRect(cx - (u >> 1), cy - 2 * u - (u >> 1), u, u); }
    }
    function drawRing(g, jx, my, u, pw, pulse, downPulse) {
      disc(g, jx, my, 5, u, '#1a1530'); disc(g, jx, my, Math.max(1, Math.min(4, Math.round(pw / u))), u, 'rgba(255,216,74,0.32)');
      if (pulse > 0) disc(g, jx, my, 5, u, 'rgba(' + (downPulse ? '255,216,74' : '190,230,255') + ',' + (0.2 + 0.5 * pulse).toFixed(3) + ')');
      ring(g, jx, my, 7, u, COL.ink); ring(g, jx, my, 6, u, pulse > 0.5 ? '#ffffff' : '#c8c4ec'); ring(g, jx, my, 5, u, COL.ink);
      g.fillStyle = pulse > 0.5 ? '#ffffff' : '#c8c4ec'; g.fillRect(jx - (u >> 1), my - 3 * u - (u >> 1), u, u); g.fillRect(jx - (u >> 1), my + 3 * u - (u >> 1), u, u);
    }
    function laneRect(rect) {
      var R = rect || options.lane; if (!R) return null;
      return { x: Math.round(num(R.x, 0)), y: Math.round(num(R.y, 0)), w: Math.round(num(R.w, 160)), h: Math.round(num(R.h, 22)) };
    }
    function draw(g, rect, opts) {
      drawn = [];
      try {
        var R = laneRect(rect); opts = opts || {};
        if (R) { lane = R; drawLane(g, R, Math.max(1, Math.round(num(opts.scale != null ? opts.scale : options.scale, Math.floor(R.h / 22) || 1)))); }
        if (cal) drawCal(g, opts);
      } catch (e) { warn(e); }
      return drawn.slice();
    }
    function drawLane(g, R, u) {
      var cl = liveAudio() ? live() : K.clock, x = R.x, y = R.y, w = R.w, h = R.h;
      var x1 = x + w - 4 * u, my = y + h - 8 * u, gw0 = Math.round(P.good * (x1 - x - 14 * u) / P.lead);
      var jx = x + Math.max(14 * u, Math.max(9 * u, gw0) + 3 * u), ppm = (x1 - jx) / P.lead;   // the Good band always fits inside the plate
      g.save(); g.globalAlpha = clamp(fade, 0.2, 1); g.imageSmoothingEnabled = false;
      // plate: dark glass with a lit top edge and cut corners
      g.fillStyle = COL.plate; g.fillRect(x + u, y, w - 2 * u, h); g.fillRect(x, y + u, w, h - 2 * u);
      g.fillStyle = COL.edge; g.fillRect(x + u, y + h - u, w - 2 * u, u); g.fillRect(x + w - u, y + u, u, h - 2 * u);
      g.fillStyle = COL.hi; g.fillRect(x + u, y, w - 2 * u, u); g.fillRect(x, y + u, u, h - 2 * u);
      drawn.push({ kind: 'lane', x: x, y: y, w: w, h: h, owner: null, jx: jx, my: my, ppm: ppm, x1: x1 });
      // the track line runs through the ring, so a marker is on a line all the way in and out
      g.fillStyle = 'rgba(160,150,220,0.28)'; g.fillRect(x + 3 * u, my, x1 - x - 3 * u, u);
      // the Good window: a faint cyan band with brackets; the Perfect window: the gold core of the ring
      var gw = Math.max(9 * u, Math.round(P.good * ppm)), pw = Math.max(u, Math.round(P.perfect * ppm));
      g.fillStyle = 'rgba(94,230,255,0.16)'; g.fillRect(jx - gw, my - 2 * u, 2 * gw + u, 5 * u);
      g.fillStyle = COL.good; g.fillRect(jx - gw, my - 3 * u, u, 7 * u); g.fillRect(jx + gw, my - 3 * u, u, 7 * u);
      var cb = curBeat(cl), since = cb.prev ? cl - cb.prev.t : 1e9, pulse = since < 140 ? 1 - since / 140 : 0, downPulse = cb.prev && cb.prev.down;
      // judge ring UNDER the markers: pulses on every beat (gold on the downbeat)
      drawRing(g, jx, my, u, pw, pulse, downPulse);
      // markers: every beat ahead slides to the ring and through it; claimed ones burst; a beat past its Perfect window
      // without a press turns grey, slides on and fades once its Good window is over
      var L = beats(cl - P.good - 300, cl + P.lead);
      for (var i = L.length - 1; i >= 0; i--) {
        var b = L[i], c = claims[b.key]; if (c && !c.skipped) continue;
        var mx = Math.round(jx + (b.t - cl) * ppm), a = 1;
        if (mx > x1 - 10 * u) a = clamp((x1 - mx) / (10 * u), 0, 1);
        var past = cl - b.t > P.perfect || (c && c.skipped);
        if (cl - b.t > P.good) a *= clamp(1 - (cl - b.t - P.good) / 260, 0, 1);
        if (a <= 0.02 || mx < x + 3 * u) continue;
        g.globalAlpha = clamp(fade, 0.2, 1) * a;
        diamond(g, mx, my, b.down ? 3 : 2, u, past ? COL.past : b.down ? COL.down : COL.beat, past ? null : '#ffffff');
      }
      g.globalAlpha = clamp(fade, 0.2, 1);
      // no beat ahead (a jingle pauses the music, or the clock is stopped): say so instead of an empty track
      var ahead = beats(cl, cl + P.lead);
      if (!ahead.length) { var rw = textW('REST', u), rx = Math.round((jx + x1) / 2); g.fillStyle = COL.edge; g.fillRect(rx - rw / 2 - 10 * u, my, 6 * u, u); g.fillRect(rx + rw / 2 + 4 * u, my, 6 * u, u); g.fillStyle = COL.plate; g.fillRect(rx - rw / 2 - 2 * u, my - 4 * u, rw + 4 * u, 9 * u); var rr0 = say(g, 'REST', rx, my - 3 * u, u, COL.dim, 'center'); drawn.push({ kind: 'label', x: rr0.x, y: rr0.y, w: rr0.w, h: rr0.h, owner: null }); }
      // feedback: a burst at the ring and the press tick where the press landed (early = right of the ring)
      for (var k = 0; k < hist.length; k++) {
        var H = hist[k], age = cl - H.t; if (age < 0 || age > 420) continue;
        var col = COL[H.r.rating], f = age / 420;
        if (H.beatT != null && !H.r.skipped) { var tx = Math.round(jx + (H.beatT - H.tj) * ppm); if (tx > x + 2 * u && tx < x1) { g.globalAlpha = clamp(fade, 0.2, 1) * (1 - f); g.fillStyle = col; g.fillRect(tx - (u >> 1), my - 4 * u, u, 9 * u); } }
        if (H.r.rating !== 'miss' && age < 300) {
          var rr = 6 + Math.round(age / 300 * 7), aa = 1 - age / 300;
          g.globalAlpha = clamp(fade, 0.2, 1) * aa; ring(g, jx, my, rr, u, col);
          for (var s = 0; s < 8; s++) { var an = s * Math.PI / 4 + 0.39, dd = (8 + age / 300 * 12) * u; g.fillStyle = s % 2 ? '#ffffff' : col; g.fillRect(Math.round(jx + Math.cos(an) * dd), Math.round(my + Math.sin(an) * dd * 0.8), u, u); }
        }
      }
      g.globalAlpha = clamp(fade, 0.2, 1);
      // text row: rating (+ early / late), combo on the right
      var ty = y + 2 * u, tx0 = jx + 10 * u;
      if (P.labels && last && hist.length) {
        var LH = hist[hist.length - 1], age2 = cl - LH.t;
        if (age2 >= 0 && age2 < 900) {
          var al = age2 < 700 ? 1 : 1 - (age2 - 700) / 200, rise = age2 < 90 ? 1 : 0;
          g.globalAlpha = clamp(fade, 0.2, 1) * al;
          var colr = age2 < 70 ? '#ffffff' : COL[LH.r.rating], tr = say(g, LABEL[LH.r.rating], tx0, ty + rise * u, u, colr);
          drawn.push({ kind: 'label', x: tr.x, y: tr.y, w: tr.w, h: tr.h, owner: null });
          var tag = LH.r.skipped ? 'NO PRESS' : LH.r.rating === 'perfect' || LH.r.delta == null ? '' : LH.r.early ? 'EARLY' : 'LATE';
          // the tag only where it cannot reach the combo text on the right
          if (tag && tr.x + tr.w + 3 * u + textW(tag, u) < x + w - 4 * u - textW(w >= 150 * u ? '99 COMBO' : 'x99', u) - 6 * u) {
            var t2 = say(g, tag, tr.x + tr.w + 3 * u, ty + rise * u, u, COL.dim); drawn.push({ kind: 'label', x: t2.x, y: t2.y, w: t2.w, h: t2.h, owner: null });
          }
        }
      }
      g.globalAlpha = clamp(fade, 0.2, 1);
      if (combo >= 2) {
        var lastHit = hist.length ? cl - hist[hist.length - 1].t : 1e9, ctext = w >= 150 * u ? combo + ' COMBO' : 'x' + combo;
        var cr = say(g, ctext, x + w - 4 * u, ty, u, lastHit < 120 ? '#ffffff' : COL.perfect, 'right');
        drawn.push({ kind: 'label', x: cr.x, y: cr.y, w: cr.w, h: cr.h, owner: null });
      }
      g.restore();
    }

    /* ----- drawing: the calibration window ----- */
    function drawCal(g, opts) {
      var u = Math.max(1, Math.round(num(opts.calScale != null ? opts.calScale : options.scale, 1)));
      var B = opts.bounds || options.bounds || (g.canvas ? { x: 0, y: 0, w: g.canvas.width, h: g.canvas.height } : { x: 0, y: 0, w: 256, h: 224 });
      var PW = Math.min(B.w - 8 * u, 188 * u), PH = 92 * u, CR = opts.calRect || options.calRect;
      var px = CR ? Math.round(CR.x) : Math.round(B.x + (B.w - PW) / 2), py = CR ? Math.round(CR.y) : Math.round(B.y + (B.h - PH) / 2);
      if (CR) PW = Math.round(CR.w);
      var cl = liveAudio() ? live() : K.clock;
      g.save(); g.globalAlpha = 1; g.imageSmoothingEnabled = false;
      g.fillStyle = '#0a0818'; g.fillRect(px + u, py, PW - 2 * u, PH); g.fillRect(px, py + u, PW, PH - 2 * u);
      g.fillStyle = '#1a1634'; g.fillRect(px + 2 * u, py + 2 * u, PW - 4 * u, PH - 4 * u);
      g.fillStyle = '#211c42'; g.fillRect(px + 2 * u, py + 2 * u, PW - 4 * u, 12 * u);
      g.fillStyle = '#cfc8f4'; g.fillRect(px + u, py + u, PW - 2 * u, u); g.fillRect(px + u, py + PH - 2 * u, PW - 2 * u, u); g.fillRect(px + u, py + 2 * u, u, PH - 4 * u); g.fillRect(px + PW - 2 * u, py + 2 * u, u, PH - 4 * u);
      drawn.push({ kind: 'calib', x: px, y: py, w: PW, h: PH, owner: null });
      say(g, 'CALIBRATE', px + 7 * u, py + 5 * u, u, COL.perfect);
      var n = cal.phase === 'tap' ? cal.taps.length : cal.phase === 'result' ? cal.result.taps : 0;
      say(g, n + '/' + P.taps, px + PW - 7 * u, py + 5 * u, u, COL.dim, 'right');
      // the beat lamp: pulses on each beat; count-in numbers, then a dot per tap
      var cb = curBeat(cl), since = cb.prev ? cl - cb.prev.t : 1e9, pulse = since < 160 ? 1 - since / 160 : 0, lx = px + 20 * u, ly = py + 33 * u;
      disc(g, lx, ly, 10, u, '#100c22'); if (pulse > 0) disc(g, lx, ly, 9, u, 'rgba(' + (cb.prev && cb.prev.down ? '255,216,74' : '120,220,255') + ',' + (0.25 + 0.6 * pulse).toFixed(3) + ')');
      ring(g, lx, ly, 10, u, pulse > 0.4 ? '#ffffff' : '#8a84b8');
      var inside = '';
      if (cal.phase === 'count') { var k = clamp(beats(cal.startBeat - 1, cl + 1e-6).length, 0, P.beatsPerBar); inside = k > 0 ? String(k) : ''; }
      if (inside) say(g, inside, lx, ly - 3 * u, u, '#ffffff', 'center');
      var ix = px + 38 * u, l1, l2;
      if (cal.phase === 'count') { l1 = liveAudio() ? 'LISTEN...' : 'WATCH THE LAMP'; l2 = 'TAP AFTER THE COUNT'; }
      else if (cal.phase === 'tap') { l1 = 'TAP ON EACH BEAT'; l2 = cal.taps.length ? 'KEEP GOING' : HINT.tap; }
      else if (cal.result.ok) { var o = cal.result.offset; l1 = 'OFFSET ' + (o > 0 ? '+' : '') + o + ' MS'; l2 = o > 8 ? 'YOU TAP LATE' : o < -8 ? 'YOU TAP EARLY' : 'RIGHT ON TIME'; }
      else { l1 = 'TOO FEW TAPS'; l2 = 'TRY AGAIN'; }
      while (textW(l1, u) > px + PW - 6 * u - ix && l1.length > 4) l1 = l1.slice(0, -1);
      while (textW(l2, u) > px + PW - 6 * u - ix && l2.length > 4) l2 = l2.slice(0, -1);
      say(g, l1, ix, py + 22 * u, u, '#ffffff'); say(g, l2, ix, py + 34 * u, u, COL.dim);
      // the scatter axis: -150 .. +150 ms, a dot per tap (early left, late right)
      var ax0 = px + 14 * u, ax1 = px + PW - 14 * u, ay = py + 58 * u, mid = Math.round((ax0 + ax1) / 2), sc = (ax1 - ax0) / 300;
      g.fillStyle = 'rgba(255,216,74,0.35)'; g.fillRect(Math.round(mid - P.perfect * sc), ay - u, Math.round(2 * P.perfect * sc) + u, 3 * u);   // the Perfect window
      g.fillStyle = '#4a4478'; g.fillRect(ax0, ay, ax1 - ax0, u);
      [-150, -100, -50, 0, 50, 100, 150].forEach(function (v) { g.fillStyle = v === 0 ? '#ffffff' : '#6a64a0'; g.fillRect(Math.round(mid + v * sc), ay - (v === 0 ? 3 : 2) * u, u, (v === 0 ? 7 : 5) * u); });
      // a dot per tap (early left, late right); dots that would touch stack upward, so every tap stays readable
      var placed = [];
      cal.taps.forEach(function (tp) {
        var dx = Math.round(mid + clamp(tp.d, -150, 150) * sc), row = 0;
        while (row < 3 && placed.some(function (q) { return q.row === row && Math.abs(q.x - dx) < 4 * u; })) row++;
        placed.push({ x: dx, row: row });
        disc(g, dx, ay - 5 * u - row * 4 * u, 2, u, COL.ink);
        disc(g, dx, ay - 5 * u - row * 4 * u, 1, u, Math.abs(tp.d) <= P.perfect ? COL.perfect : Math.abs(tp.d) <= P.good ? COL.good : COL.miss);
      });
      if (cal.phase === 'result' && cal.result.ok) { var mxr = Math.round(mid + clamp(cal.result.offset, -150, 150) * sc); g.fillStyle = '#ffffff'; g.fillRect(mxr, ay - 3 * u, u, 7 * u); g.fillStyle = COL.perfect; g.fillRect(mxr - u, ay + 3 * u, 3 * u, u); }
      say(g, 'EARLY', ax0, ay + 5 * u, u, COL.dim); say(g, 'LATE', ax1, ay + 5 * u, u, COL.dim, 'right');
      say(g, '-50', mid - 50 * sc, ay + 5 * u, u, '#8a84b8', 'center'); say(g, '0', mid, ay + 5 * u, u, '#ffffff', 'center'); say(g, '+50 MS', mid + 50 * sc + 9 * u, ay + 5 * u, u, '#8a84b8', 'center');
      // buttons
      cal.buttons = [];
      if (cal.phase === 'result') {
        var opts2 = calOptions(), names = { keep: 'KEEP', retry: 'RETRY', cancel: 'CANCEL' }, bw = Math.floor((PW - 16 * u - (opts2.length - 1) * 6 * u) / opts2.length), by = py + PH - 19 * u, ready = cl - cal.at >= 250;
        opts2.forEach(function (op, i) {
          var bx = px + 8 * u + i * (bw + 6 * u), on = i === cal.sel;
          g.fillStyle = on ? '#3a3270' : '#151230'; g.fillRect(bx, by, bw, 14 * u);
          g.fillStyle = on ? (ready ? COL.perfect : '#8a84b8') : '#4a4478'; g.fillRect(bx, by, bw, u); g.fillRect(bx, by + 13 * u, bw, u); g.fillRect(bx, by, u, 14 * u); g.fillRect(bx + bw - u, by, u, 14 * u);
          say(g, names[op], bx + bw / 2, by + 4 * u, u, on ? '#ffffff' : COL.dim, 'center');
          cal.buttons.push({ x: bx, y: by, w: bw, h: 14 * u, opt: op });
        });
      } else {
        var bar = Math.round((ax1 - ax0) * (cal.phase === 'tap' ? cal.taps.length / P.taps : 0));
        g.fillStyle = '#151230'; g.fillRect(ax0, py + 73 * u, ax1 - ax0, 3 * u); g.fillStyle = COL.good; g.fillRect(ax0, py + 73 * u, bar, 3 * u);
        say(g, HINT.cancel, px + PW / 2, py + 79 * u, u, '#8a84b8', 'center');
      }
      g.restore();
    }

    if (!options.offline) listen(); else S.locked = true;
    try { if (!options.offline && root.navigator && navigator.userActivation && navigator.userActivation.hasBeenActive) unlock(); } catch (e) { }

    function safe(f, d) { return function () { try { return f.apply(null, arguments); } catch (e) { warn(e); return d; } }; }
    return {
      version: VERSION,
      update: update, press: press, draw: draw,
      rate: safe(function (t) { return judge(num(t, K.clock), false); }, null),
      beats: safe(function (t0, t1) { return beats(num(t0, K.clock), num(t1, K.clock + 4000)).map(function (b) { var o = pub(b); o.claimed = claims[b.key] ? claims[b.key].rating : null; return o; }); }, []),
      clock: function () { try { return live(); } catch (e) { return K.clock; } },
      phase: safe(function () { return curBeat(K.clock).phase; }, 0),
      eventClock: safe(eventClock, null),
      calibrate: safe(calibrate, false), busy: function () { return !!cal; }, key: key, pointer: pointer,
      cancelCalibration: safe(function () { if (cal) { cal.result = cal.result || { ok: false, taps: 0 }; cal.phase = 'result'; cal.at = -1e9; calChoose('cancel'); } }),
      setParams: safe(setParams, null), params: function () { return Object.assign({}, P); },
      mute: safe(mute, false), volume: safe(function (v) { return setParams({ volume: v }).volume; }, 0), toggle: safe(toggle, false),
      unlock: safe(unlock, false), isUnlocked: function () { return !S.locked; },
      restart: safe(restart), reset: safe(function () { claims = {}; hist = []; combo = 0; best = 0; last = null; }),
      state: state, lastDrawn: function () { return drawn.slice(); }, laneRect: function () { return lane ? Object.assign({}, lane) : null; },
      stats: function () { var o = Object.assign({}, S); o.context = ctx ? ctx.state : (AudioCtor() ? 'not-created' : 'unsupported'); o.combo = combo; o.best = best; return o; },
      context: function () { return ctx; },
      destroy: function () { stopListening(); try { if (ctx && ctx.close && !options.sfx) ctx.close(); } catch (e) { } ctx = null; master = null; }
    };
  }

  /* ---------------- offline render (checks): the click track through OfflineAudioContext ----------------
   * render({bpm, ms, beatsPerBar, sampleRate, volume, tempo: [{at, bpm}]}) -> Promise<{rate, length, left, beats: [{t, down}]}>
   * Drives a real offline instance with the game-time clock (tempo changes through setParams, like a game), then plays the
   * same clickVoice() at every beat time. */
  function render(spec) {
    spec = spec || {};
    var OAC = OfflineCtor(); if (!OAC) return Promise.resolve(null);
    try {
      var sr = spec.sampleRate || 48000, ms = num(spec.ms, 4000), oc = new OAC(1, Math.ceil(ms / 1000 * sr), sr);
      var inst = create({ offline: true, params: { bpm: num(spec.bpm, 120), beatsPerBar: num(spec.beatsPerBar, 4) } });
      var changes = (spec.tempo || []).slice().sort(function (a, b) { return a.at - b.at; }), ci = 0, step = 1000 / 60, cl = 0;
      while (cl < ms) { while (ci < changes.length && changes[ci].at <= cl) inst.setParams({ bpm: changes[ci++].bpm }); inst.update(step); cl += step; }
      var bl = inst.beats(0, ms), out = oc.createGain(); out.gain.value = num(spec.volume, 1); out.connect(oc.destination);
      bl.forEach(function (b) { clickVoice(oc, out, b.t / 1000, b.down); });
      return oc.startRendering().then(function (buf) { return { rate: sr, length: buf.length, left: buf.getChannelData(0), beats: bl.map(function (b) { return { t: b.t, down: b.down }; }) }; });
    } catch (e) { return Promise.resolve({ error: String(e && e.stack || e) }); }
  }

  root.GameDNA_BeatJudge = { version: VERSION, defaults: Object.assign({}, DEFAULTS), create: create, render: render, rateDelta: rateDelta, textWidth: textW };
})(typeof window !== 'undefined' ? window : this);
