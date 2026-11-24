/* GameDNA F-05 adaptive music - v1.0.2
 * One classic script, no dependencies, one global: GameDNA_AdaptiveMusic. ASCII only.
 * Needs F-03 chip music (GameDNA_ChipMusic) loaded first; it only calls chip music's public API.
 * v1.0.1 (2026-11-20): checked against chip music v1.0.4; no behaviour change (demo and docs round).
 * v1.0.2 (2026-11-20): jingle limit (cold test: a jingle per kill and per coin paused the loop for 72 % of play).
 *
 * Layered stems over a chip-music track: each of the 4 chip channels is one stem (layer):
 *   base = triangle (bass), perc = noise (drums), lead = pulse 1 (melody), danger = pulse 2 (a tense ostinato).
 * The game only REPORTS its state every step; the module decides the music:
 *   explore -> base + lead;  combat -> + perc;  boss -> its own track, all of it;  low HP -> + danger, lead pulled back.
 * Changes are debounced (a state must hold before it counts; calming down waits longer), land on the next bar line
 * of the playing loop, never overlap (a new change waits until the last fade or stinger has finished) and start with a
 * one-bar stinger when the mood changes (alarm into combat, the warden's call into the boss, all clear back out).
 *
 *   var music = GameDNA_ChipMusic.create({params: {volume: 0.7}});
 *   var adaptive = GameDNA_AdaptiveMusic.create({music: music});
 *   // every fixed step, AFTER music.update(stepMs):
 *   adaptive.update({active: inGameplay, combat: foesNear > 0, boss: bossFight, hp: hero.hp / hero.maxHp});
 *
 * The clock is chip music's music clock (game time while audio is off, the audio clock once it runs), so state() and
 * plan() are deterministic under ?t= fast-forward. The module never touches game state, randomness or input, draws
 * nothing, and never throws.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.2';
  var LAYERS = ['base', 'perc', 'lead', 'danger'];
  var CH_OF = { base: 'tri', perc: 'noise', lead: 'p1', danger: 'p2' };
  var LAYER_OF = { tri: 'base', noise: 'perc', p1: 'lead', p2: 'danger' };
  var MOODS = ['explore', 'combat', 'boss'];
  var RANK = { explore: 0, combat: 1, boss: 2 };
  var DEFAULTS = { quantize: 'bar', fade: 2, release: 4, enterMs: 500, exitMs: 3000, lowHp: 0.3, hpGap: 0.1, minBars: 2, stingers: true, leadMs: 60, lookMs: 12, jingleGapBars: 4 };
  var MIX = {
    explore: { base: 1, perc: 0, lead: 1, danger: 0 },
    combat: { base: 1, perc: 1, lead: 1, danger: 0 },
    boss: { base: 1, perc: 1, lead: 1, danger: 0 },
    low: { danger: 1, lead: 0.45 }          // laid over the mood's mix while HP is low
  };
  var TRACKS = { explore: 'am-wilds', combat: 'am-wilds', boss: 'am-boss' };
  var STINGERS = { combat: 'am-alert', boss: 'am-warden', explore: 'am-clear' };   // played when the mood changes INTO the key
  var ALL1 = { base: 1, perc: 1, lead: 1, danger: 1 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return v == null || v === '' || !isFinite(+v) ? d : +v; }
  function bool(v, d) { if (v == null || v === '') return d; return !(v === false || v === 'off' || v === 'false' || v === 0 || v === '0'); }
  function copy(o) { var r = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; return r; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }

  /* ---------------- songs (original): 120 bpm, 4 rows a beat, 4 beats a bar (2 s), every channel one stem ---------------- */
  var A4 = function (s) { return (s + ' ').repeat(4).trim(); };
  var SONGS = {
    'am-wilds': { title: 'Wildwood Trail', bpm: 120, rows: 32,
      inst: { p1: { duty: 0.25, decay: 0.42, sustain: 0.6, vib: 0.22 }, p2: { duty: 0.125, decay: 0.06, sustain: 0.55, release: 0.02, vol: 0.85 }, tri: { release: 0.025 }, noise: { vol: 0.95 } },
      patterns: {
        A: { p1: 'D5*4 F5*2 A5*2 G5*4 F5*2 E5*2 | D5*6 C5*2 Bb4~*8',
             p2: A4('D4 A4 D5 Eb5') + ' | ' + A4('Bb3 F4 Bb4 B4'),
             tri: 'D2*2 D3*2 A2*2 D3*2 D2*2 D3*2 C3*2 A2*2 | Bb1*2 Bb2*2 F2*2 Bb2*2 Bb1*2 Bb2*2 C3*2 D3*2',
             noise: 'k . h . s . h k k . h . s . h h | k . h . s . h k k . h . s . h o' },
        B: { p1: 'E5*4 G5*2 C6*2 Bb5*4 A5*2 G5*2 | A5*6 G5*2 E5~*8',
             p2: A4('C4 G4 C5 Db5') + ' | ' + A4('A3 E4 A4 Bb4'),
             tri: 'C2*2 C3*2 G2*2 C3*2 C2*2 C3*2 E2*2 G2*2 | A1*2 A2*2 E2*2 A2*2 A1*2 A2*2 C#3*2 E2*2',
             noise: 'k . h . s . h k k . h . s . h h | k . h . s . h k k . s . s . s s' },
        C: { p1: 'F5*4 A5*2 D6*2 C6*4 A5*2 F5*2 | A5*4 G5*2 F5*2 C5~*8',
             p2: A4('D4 A4 D5 Eb5') + ' | ' + A4('F3 C4 F4 Gb4'),
             tri: 'D2*2 D3*2 A2*2 D3*2 D2*2 D3*2 C3*2 A2*2 | F1*2 F2*2 C2*2 F2*2 F1*2 F2*2 A2*2 C3*2',
             noise: 'c . h . s . h k k . h . s . h h | k . h . s . h k k . h . s . h o' },
        D: { p1: 'G5*4 Bb5*2 D6*2 C6*4 Bb5*2 A5*2 | A5*4 G5*2 E5*2 C#5~*8',
             p2: A4('G3 D4 G4 Ab4') + ' | ' + A4('A3 E4 A4 Bb4'),
             tri: 'G1*2 G2*2 D2*2 G2*2 G1*2 G2*2 Bb2*2 D3*2 | A1*2 A2*2 E2*2 A2*2 A1*2 A2*2 C#3*2 E3*2',
             noise: 'k . h . s . h k k . h . s . h h | k . s . s . s . s . s s s s s s' }
      }, order: ['A', 'B', 'C', 'D'] },
    'am-boss': { title: 'The Warden Wakes', bpm: 120, rows: 32,
      inst: { p1: { duty: 0.25, decay: 0.22, sustain: 0.72 }, p2: { duty: 0.125, decay: 0.05, sustain: 0.5, release: 0.02, vol: 0.85 }, tri: { release: 0.012 }, noise: { vol: 1 } },
      patterns: {
        A: { p1: 'D5*2 . D5 F5*2 A5*2 G#5*4 A5*2 F5*2 | G5*6 F5*2 Eb5*4 D5*4',
             p2: A4('D4 A4 D5 Eb5') + ' | ' + A4('Eb4 Bb4 Eb5 E5'),
             tri: 'D2*2 D2*2 D3*2 D2*2 D2*2 D3*2 D2*2 D3*2 | Eb2*2 Eb2*2 Eb3*2 Eb2*2 Eb2*2 Eb3*2 Eb2*2 Eb3*2',
             noise: 'k . h k s . h k k . h k s . s h | k . h k s . h k k . h k s s s s' },
        B: { p1: 'A5*2 . A5 C6*2 D6*2 C6*4 A5*2 G5*2 | E5*4 G5*4 C6~*8',
             p2: A4('D4 A4 D5 Eb5') + ' | ' + A4('C4 G4 C5 Db5'),
             tri: 'D2*2 D2*2 D3*2 D2*2 D2*2 D3*2 D2*2 D3*2 | C2*2 C2*2 C3*2 C2*2 C2*2 C3*2 C2*2 C3*2',
             noise: 'k . h k s . h k k . h k s . s h | k . h k s . h k k . h k s . s s' },
        C: { p1: 'F5*4 D5*2 F5*2 Bb5*4 A5*2 F5*2 | E5>A5*4 A5~*4 C#6*4 E6*4',
             p2: A4('Bb3 F4 Bb4 B4') + ' | ' + A4('A3 E4 A4 Bb4'),
             tri: 'Bb1*2 Bb1*2 Bb2*2 Bb1*2 Bb1*2 Bb2*2 Bb1*2 Bb2*2 | A1*2 A1*2 A2*2 A1*2 A1*2 A2*2 A1*2 A2*2',
             noise: 'c . h k s . h k k . h k s . s h | k . h k s . h k k . h k s . s h' },
        D: { p1: 'D6*4 C6*2 A5*2 Bb5*4 A5*2 G5*2 | A5*2 G#5*2 A5*2 C#6*2 E6~*8',
             p2: A4('D4 A4 D5 Eb5') + ' | ' + A4('A3 E4 A4 Bb4'),
             tri: 'D2*2 D2*2 D3*2 D2*2 D2*2 D3*2 D2*2 D3*2 | A1*2 A1*2 A2*2 A1*2 A1*2 A2*2 A1*2 A2*2',
             noise: 'k . h k s . h k k . h k s . s h | k . s k s . s k s s s s s s s s' }
      }, order: ['A', 'B', 'C', 'D'] },
    // stingers: one bar at the loops' tempo, on channels that are audible in the mood they lead into
    'am-alert': { title: 'Alarm', bpm: 120, rows: 16, loop: false, inst: { p1: { duty: 0.5, decay: 0.3, sustain: 0.7 } },
      patterns: { A: { p1: 'D6*2 A5*2 D6*2 F6*2 E6~*8', tri: 'D3*2 . . D3*2 . . D2*8', noise: 'c . . . s . s . s s s s c . . .' } }, order: ['A'] },
    'am-warden': { title: 'The Warden Rises', bpm: 120, rows: 16, loop: false, inst: { p1: { duty: 0.25, decay: 0.5, sustain: 0.7 } },
      patterns: { A: { p1: 'D5>D6*8 C#6*4 D6~*4', tri: 'D2*8 Eb2*4 D2*4', noise: 'c . . . k . k . k k k k s s s s' } }, order: ['A'] },
    'am-clear': { title: 'All Clear', bpm: 120, rows: 16, loop: false, inst: { p1: { duty: 0.5, decay: 0.6, sustain: 0.5 } },
      patterns: { A: { p1: 'A5*2 F5*2 D5*2 A4*2 D5~*8', tri: 'D3*4 A2*4 D2*8' } }, order: ['A'] }
  };

  function chipLib() { return root.GameDNA_ChipMusic || null; }
  function usedChannels(song) {   // chip channels that hold at least one note or drum
    var CM = chipLib(), out = {}; if (!CM) return out;
    try { var c = CM.compile(song); Object.keys(c.ev).forEach(function (ch) { if (c.ev[ch].some(function (e) { return e.k === 'note' || e.k === 'drum'; })) out[ch] = 1; }); } catch (e) { }
    return out;
  }
  function normParams(p, base) {
    var o = copy(base || DEFAULTS); p = p || {};
    if (p.quantize === 'bar' || p.quantize === 'beat') o.quantize = p.quantize;
    o.fade = clamp(num(p.fade, o.fade), 0, 16);
    o.release = clamp(num(p.release, o.release), 0, 16);
    o.enterMs = clamp(num(p.enterMs, o.enterMs), 0, 10000);
    o.exitMs = clamp(num(p.exitMs, o.exitMs), 0, 20000);
    o.lowHp = clamp(num(p.lowHp, o.lowHp), 0, 1);
    o.hpGap = clamp(num(p.hpGap, o.hpGap), 0, 0.5);
    o.minBars = clamp(Math.round(num(p.minBars, o.minBars)), 0, 16);
    o.stingers = bool(p.stingers, o.stingers);
    o.leadMs = clamp(num(p.leadMs, o.leadMs), 0, 400);
    o.lookMs = clamp(num(p.lookMs, o.lookMs), 0, 60);
    o.jingleGapBars = clamp(Math.round(num(p.jingleGapBars, o.jingleGapBars)), 0, 32);
    return o;
  }
  function mixFor(mix, mood, low) {
    var g = copy(mix[mood] || mix.explore);
    if (low) { var L = mix.low || {}; for (var k in L) g[k] = L[k]; }
    LAYERS.forEach(function (k) { g[k] = clamp(num(g[k], 0), 0, 1); });
    return g;
  }
  // which stinger channels would be muted in the mood the stinger leads into (should be none)
  function validate(cfg) {
    cfg = cfg || {};
    var mix = cfg.mix || MIX, st = cfg.stingers || STINGERS, songs = cfg.songs || SONGS, problems = [];
    Object.keys(st).forEach(function (mood) {
      var name = st[mood]; if (!name) return;
      var song = songs[name]; if (!song) { problems.push('stinger "' + name + '" has no song data here'); return; }
      var used = usedChannels(song);
      [false, true].forEach(function (low) {
        var g = mixFor(mix, mood, low);
        Object.keys(used).forEach(function (ch) { if (!(g[LAYER_OF[ch]] > 0)) problems.push('stinger "' + name + '" plays ' + ch + ' (' + LAYER_OF[ch] + '), which is silent in ' + mood + (low ? ' + low HP' : '')); });
      });
      if (song.loop !== false) problems.push('stinger "' + name + '" must be a one-shot (loop: false)');
    });
    return { ok: !problems.length, problems: problems };
  }

  /* ---------------- live instance ---------------- */
  function create(options) {
    options = options || {};
    var music = options.music || null, P = normParams(options.params || {});
    var mix = {}; ['explore', 'combat', 'boss', 'low'].forEach(function (k) { mix[k] = copy(MIX[k]); if (options.mix && options.mix[k]) { for (var q in options.mix[k]) mix[k][q] = options.mix[k][q]; } });
    var tracks = copy(TRACKS); if (options.tracks) for (var tk in options.tracks) tracks[tk] = options.tracks[tk];
    var stingers = copy(STINGERS); if (options.stingers) for (var sk in options.stingers) stingers[sk] = options.stingers[sk];
    var onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
    var S = { jinglesPassed: 0, jinglesDropped: 0, updates: 0, reports: 0, commits: 0, stingersPlayed: 0, trackSwitches: 0, ignored: 0, conflicts: 0, waitsForBar: 0, errors: 0, applies: 0, noMusic: 0 };
    var log = [], trans = [], applied = [], trace = !!options.trace, warned = {};
    var rep = { active: false, mood: 'explore', low: false, hp: 1 };          // last report (raw)
    var raw = { mood: 'explore', low: false };                                 // raw desire after hysteresis
    var cand = { mood: 'explore', low: false, moodSince: 0, lowSince: 0 };     // candidates and when they started
    var committed = null;                                                      // {mood, low} the music is in (or heading to)
    var active = false, lastGains = null, clock = 0, plan = [], conflictOn = false, lastForeignJingleEnd = -1e9, mine = {};
    var ownJingles = [];   // [{name, c0}] stingers this instance started, to tell them from the game's own jingles

    function warn(k, msg) { if (warned[k]) return; warned[k] = 1; try { if (root.console) console.warn('GameDNA_AdaptiveMusic: ' + msg); } catch (e) { } }
    function record(ev) {
      ev.t = Math.round(clock);
      log.push(ev); if (log.length > 80) log.shift();
      if (onEvent) { try { onEvent(ev); } catch (e) { S.errors++; } }
      return ev;
    }
    function trackSet() { var o = {}; MOODS.forEach(function (m) { if (tracks[m]) o[tracks[m]] = 1; }); return o; }
    // install the built-in songs (and extra ones from options.songs) into chip music
    function install() {
      if (!music || typeof music.addSong !== 'function') return;
      var all = copy(SONGS); if (options.songs) for (var n in options.songs) all[n] = options.songs[n];
      var have = {}; try { (music.songs() || []).forEach(function (s) { have[s.name] = 1; }); } catch (e) { }
      Object.keys(all).forEach(function (n) {
        if (have[n] && !(options.songs && options.songs[n])) return;
        try { var r = music.addSong(n, all[n]); if (r && r.ok === false) warn('song-' + n, 'song "' + n + '": ' + (r.problems || []).slice(0, 2).join('; ')); } catch (e) { S.errors++; }
      });
      var v = validate({ mix: mix, stingers: stingers, songs: all });
      if (!v.ok) warn('mix', v.problems[0]);
    }
    if (!music) warn('nomusic', 'create({music}) needs a GameDNA_ChipMusic instance; adaptive music is silent');
    install();

    /* ----- jingle limit: while adaptive music steers, the game's own jingles are rate-limited ON THE INSTANCE ----
     * (chip music's files are untouched; only this instance's jingle method is wrapped). A jingle is dropped when
     *   - it is an item-kind jingle (anything but victory / defeat) while the music is in a fight (combat or boss), or
     *   - another of the game's jingles is playing, or ended less than jingleGapBars bars ago, or
     *   - it is a victory asked during a fight (combat or boss) and the reports do not drop out of that fight within one
     *     bar (a kill while other foes remain); a victory whose fight or boss ends within that bar plays then.
     * after: 'stop' jingles (the final win, game over) and defeat always pass. Dropped calls return {type: 'dropped'}. */
    var rawJingle = music && typeof music.jingle === 'function' ? music.jingle : null, lastJ = {}, lastDrop = null, pendingV = null;
    function jingleVerdict(name, o) {
      if (!active || !committed) return null;
      if (name === 'defeat' || (o && o.after === 'stop')) return null;
      var fight = committed.mood !== 'explore' || rep.mood !== 'explore';
      if (name !== 'victory' && fight) return 'fight';
      if (name === 'victory' && fight && !(o && o.__resolved)) return 'wait';   // a kill inside a fight: plays only if the fight (or the boss) ends within a bar
      var L = segAt('loop', clock), gap = P.jingleGapBars * (L ? barMs(L) : 2000), last = lastJ.any;   // any of the game's jingles
      if (last && clock < last.end + gap) return clock < last.end ? 'playing' : 'cooldown';
      return null;
    }
    if (rawJingle) {
      music.jingle = function (name, o) {
        var why = null;
        try { plan = readPlan(); clock = readClock(); why = jingleVerdict(name, o); } catch (e) { S.errors++; }
        if (why === 'wait') { var Lw = segAt('loop', clock); pendingV = { name: name, o: o, t: clock, rank: RANK[rep.mood], until: clock + (Lw ? barMs(Lw) : 2000) }; return { type: 'deferred', track: name, t: Math.round(clock) }; }
        if (why) { S.jinglesDropped++; lastDrop = { name: String(name), why: why, t: Math.round(clock) }; record({ type: 'jingle-dropped', track: String(name), why: why }); return { type: 'dropped', track: name, why: why, t: Math.round(clock) }; }
        return playRaw(name, o, arguments);
      };
    }
    function playRaw(name, o, args) {
        var r = rawJingle.apply(music, args || [name, o]);
        try {
          if (r && r.type === 'jingle') {
            S.jinglesPassed++; plan = readPlan();
            var J = null; for (var i = 0; i < plan.length; i++) if (plan[i].kind === 'jingle' && plan[i].track === name && (!J || plan[i].c0 > J.c0)) J = plan[i];
            lastJ[name] = lastJ.any = { start: J ? J.c0 : clock, end: J ? J.cMusicEnd : clock };
          }
        } catch (e) { S.errors++; }
        return r;
    }
    mine = trackSet();

    /* ----- reading chip music (plan + clock) ----- */
    function readClock() {
      try { var st = music.state(); if (st && isFinite(st.clock)) return st.clock; } catch (e) { S.errors++; }
      return clock;
    }
    function readPlan() { try { return music.plan() || []; } catch (e) { S.errors++; return []; } }
    function segAt(kind, cl) {
      var best = null;
      for (var i = 0; i < plan.length; i++) { var s = plan[i]; if (s.kind === kind && s.c0 <= cl + 1e-6 && cl < s.cEnd && (!best || s.c0 >= best.c0)) best = s; }
      return best;
    }
    function jingleAt(cl) {   // a jingle whose music sounds at cl (its release tail excluded)
      var best = null;
      for (var i = 0; i < plan.length; i++) { var s = plan[i]; var e = Math.min(s.cEnd, s.cMusicEnd != null ? s.cMusicEnd : Infinity); if (s.kind === 'jingle' && s.c0 <= cl + 1e-6 && cl < e && (!best || s.c0 >= best.c0)) best = s; }
      return best;
    }
    function pendingLoop(cl) { var b = null; for (var i = 0; i < plan.length; i++) { var s = plan[i]; if (s.kind === 'loop' && s.c0 > cl + 1e-6 && (!b || s.c0 < b.c0)) b = s; } return b; }
    function isOwnJingle(seg) { for (var i = 0; i < ownJingles.length; i++) if (ownJingles[i].name === seg.track && Math.abs(ownJingles[i].c0 - seg.c0) < 1) return true; return false; }
    function unitRows(seg) {
      var c = null; try { c = music.song(seg.track); } catch (e) { }
      var rpb = c ? c.rpb : 4, bpb = c ? c.bpb : 4;
      return P.quantize === 'beat' ? rpb : rpb * bpb;
    }
    function barMs(seg) { var c = null; try { c = music.song(seg.track); } catch (e) { } return seg.rowMs * (c ? c.rpb * c.bpb : 16); }
    function nextBoundary(seg, cl) {   // first clock >= cl on a quantize line of seg (song rows, unwrapped): chip music's own rule
      var u = unitRows(seg), x = seg.r0 + (cl - seg.c0) / seg.rowMs, n = Math.ceil(x / u - 1e-7) * u;
      return seg.c0 + (n - seg.r0) * seg.rowMs;
    }

    /* ----- gains: a pure function of the transitions and chip music's plan ----- */
    function mixAt(cl) {
      var tr = null;
      for (var i = trans.length - 1; i >= 0; i--) if (trans[i].at <= cl + 1e-6) { tr = trans[i]; break; }
      if (!tr) return committed ? mixFor(mix, committed.mood, committed.low) : copy(ALL1);
      var out = {};
      LAYERS.forEach(function (k) {
        var a = tr.fromGains[k], b = tr.toGains[k], f = b >= a ? tr.fadeIn : tr.fadeOut;
        out[k] = f > 0 ? a + (b - a) * smooth((cl - tr.at) / f) : b;
      });
      return out;
    }
    function gainsAt(cl) {
      // the layer mix applies only while one of this module's tracks is the loop that sounds; the game's own jingles and
      // tracks (title, victory, results) get every channel at full level
      var J = jingleAt(cl);
      if (J && !isOwnJingle(J)) return copy(ALL1);
      var L = segAt('loop', cl);
      if (!L || !mine[L.track]) return copy(ALL1);
      return mixAt(cl);
    }
    function apply(cl) {
      var g = gainsAt(cl + P.lookMs);
      if (lastGains && LAYERS.every(function (k) { return Math.abs(lastGains[k] - g[k]) < 1e-4; })) return;
      lastGains = g;
      var m = {}; LAYERS.forEach(function (k) { m[CH_OF[k]] = Math.round(g[k] * 10000) / 10000; });
      try { music.channels(m); S.applies++; } catch (e) { S.errors++; }
      if (trace) applied.push({ t: cl, gains: copy(g) });
    }

    /* ----- report -> raw desire (hysteresis on HP) ----- */
    function takeReport(r) {
      if (!r || typeof r !== 'object') return;
      S.reports++;
      if (r.active != null) rep.active = !!r.active;
      var mood = r.mood;
      if (mood !== 'explore' && mood !== 'combat' && mood !== 'boss') mood = r.boss ? 'boss' : r.combat ? 'combat' : 'explore';   // a missing flag is false
      rep.mood = mood;
      if (r.hp != null) {
        var hp = num(r.hp, 1); if (r.maxHp != null && num(r.maxHp, 0) > 0) hp = hp / num(r.maxHp, 1);
        rep.hp = clamp(hp, 0, 1);
      }
      if (r.low != null) rep.lowForced = !!r.low; else rep.lowForced = null;
    }
    function rawLow() {
      if (rep.lowForced != null) return rep.lowForced;
      return raw.low ? rep.hp <= P.lowHp + P.hpGap : rep.hp < P.lowHp;   // enter below lowHp, leave above lowHp + hpGap
    }
    function holdFor(dim, from, to) {
      if (dim === 'mood') return RANK[to] > RANK[from] ? P.enterMs : P.exitMs;
      return to ? P.enterMs : P.exitMs;
    }

    /* ----- commit a change on the next quantize line ----- */
    function startTrack(track, cl, reason) {
      var r = null; try { r = music.play(track, { at: P.quantize }); } catch (e) { S.errors++; }
      S.trackSwitches++;
      plan = readPlan();
      var seg = null; for (var i = 0; i < plan.length; i++) if (plan[i].kind === 'loop' && plan[i].track === track && plan[i].c0 >= cl - 1e-6 && (!seg || plan[i].c0 > seg.c0)) seg = plan[i];
      if (!seg) { var L = segAt('loop', cl); if (L && L.track === track) seg = L; }
      return { at: seg ? seg.c0 : cl, res: r };
    }
    function pushTransition(t) {
      t.id = trans.length + 1; trans.push(t); S.commits++;
      if (trans.length > 400 && !trace) trans.splice(0, trans.length - 300);
      record({ type: 'commit', id: t.id, from: t.from.mood + (t.from.low ? '+low' : ''), to: t.to.mood + (t.to.low ? '+low' : ''), at: Math.round(t.at), stinger: t.stinger, track: t.track, reason: t.reason });
    }
    function activate(cl) {
      // a fresh start: the music goes straight to what the game reports (no hold), the track starts on the next bar
      committed = { mood: raw.mood, low: raw.low };
      cand.mood = raw.mood; cand.low = raw.low; cand.moodSince = cl; cand.lowSince = cl;
      var track = tracks[committed.mood], L = segAt('loop', cl), pend = pendingLoop(cl), now = (pend && pend.track) || (L && L.track);
      var at = cl;
      if (now !== track) at = startTrack(track, cl, 'start').at;
      else if (L) at = cl;
      var g = mixFor(mix, committed.mood, committed.low);
      pushTransition({ at: at, end: at, from: { mood: committed.mood, low: committed.low }, to: { mood: committed.mood, low: committed.low }, fromGains: g, toGains: g, fadeIn: 0, fadeOut: 0, stinger: null, track: now !== track ? track : null, reason: 'start', committedAt: cl });
    }
    function tryCommit(cl) {
      var want = { mood: cand.mood, low: cand.low };
      // hold: a candidate counts only after it has held long enough (debounce); otherwise keep the committed value
      if (want.mood !== committed.mood && cl - cand.moodSince < holdFor('mood', committed.mood, want.mood)) want.mood = committed.mood;
      if (want.low !== committed.low && cl - cand.lowSince < holdFor('low', committed.low, want.low)) want.low = committed.low;
      if (want.mood === committed.mood && want.low === committed.low) return;
      var last = trans[trans.length - 1];
      if (last && cl < last.end - 1e-6) return;                       // a change is still pending or fading: never overlap
      var newTrack = tracks[want.mood] !== tracks[committed.mood] ? tracks[want.mood] : null;
      var J = jingleAt(cl), L = segAt('loop', cl), at, stinger = null, reason = 'bar';
      if (J && !isOwnJingle(J) && J.pauses) {
        // the game's own jingle pauses the loop: only a track change can be queued (it starts when the jingle ends)
        if (!newTrack) return;
        at = null; reason = 'after-jingle';
      } else {
        if (!L || !mine[L.track]) return;                              // nothing of ours sounds (yet): wait
        var b = nextBoundary(L, cl);
        if (b - cl < P.leadMs) { S.waitsForBar++; return; }          // too close to schedule safely: take the next line later
        if (last && last.reason !== 'start' && b < last.at + P.minBars * barMs(L) - 1e-6) { return; }
        at = b;
      }
      var from = { mood: committed.mood, low: committed.low };
      var fromGains = mixAt(cl), toGains = mixFor(mix, want.mood, want.low);
      if (want.mood !== committed.mood && P.stingers && stingers[want.mood] && reason === 'bar' && clock - lastForeignJingleEnd > 500) stinger = stingers[want.mood];
      var stingMs = 0;
      if (stinger) {
        var r = null; try { r = (rawJingle || music.jingle).call(music, stinger, { mode: 'duck', at: P.quantize, after: 'resume' }); } catch (e) { S.errors++; }
        if (r && r.type === 'jingle') {
          ownJingles.push({ name: stinger, c0: at }); if (ownJingles.length > 16) ownJingles.shift();
          S.stingersPlayed++;
          var sc = null; try { sc = music.song(stinger); } catch (e) { }
          if (sc) stingMs = sc.total * (60000 / (sc.bpm * (L.tempo || 1)) / sc.rpb);
          if (r.at != null && Math.abs(r.at - at) > 1.5) { record({ type: 'stinger-offbar', want: Math.round(at), got: r.at }); }
        } else stinger = null;
      }
      if (newTrack) {
        var st = startTrack(newTrack, cl, reason);
        if (at == null) at = st.at;
        else if (Math.abs(st.at - at) > 1.5) record({ type: 'track-offbar', want: Math.round(at), got: Math.round(st.at) });
      }
      var bm = L ? barMs(L) : 2000, beat = bm / 4;
      var fadeIn = stinger || newTrack ? 0 : P.fade * beat, fadeOut = stinger || newTrack ? 0 : P.release * beat;
      var span = 0; LAYERS.forEach(function (k) { if (toGains[k] > fromGains[k] + 1e-4) span = Math.max(span, fadeIn); else if (toGains[k] < fromGains[k] - 1e-4) span = Math.max(span, fadeOut); });
      committed = { mood: want.mood, low: want.low };
      pushTransition({ at: at, end: at + Math.max(span, stingMs), from: from, to: { mood: want.mood, low: want.low }, fromGains: fromGains, toGains: toGains, fadeIn: fadeIn, fadeOut: fadeOut, stinger: stinger, track: newTrack, reason: reason, committedAt: cl, heldMs: Math.round(cl - (want.mood !== from.mood ? cand.moodSince : cand.lowSince)) });
    }

    function update(report) {
      try {
        if (!music) { S.noMusic++; return; }
        S.updates++;
        takeReport(report);
        clock = readClock(); plan = readPlan();
        if (pendingV) {   // a victory asked during a fight: plays once the report says the fight is over (within one bar)
          var pv = pendingV;
          if (RANK[rep.mood] < pv.rank && rawJingle) { pendingV = null; var w = jingleVerdict(pv.name, { after: 'resume', __resolved: true }); if (!w || w === 'wait') playRaw(pv.name, pv.o); else { S.jinglesDropped++; lastDrop = { name: pv.name, why: w, t: Math.round(clock) }; record({ type: 'jingle-dropped', track: pv.name, why: w }); } }
          else if (clock > pv.until) { pendingV = null; S.jinglesDropped++; lastDrop = { name: pv.name, why: 'fight goes on', t: Math.round(clock) }; record({ type: 'jingle-dropped', track: pv.name, why: 'fight goes on' }); }
        }
        // remember when the game's own jingles end (no stinger right on top of a victory fanfare)
        var J = jingleAt(clock); if (J && !isOwnJingle(J)) lastForeignJingleEnd = Math.min(J.cEnd, J.cMusicEnd != null ? J.cMusicEnd : Infinity);
        // raw desire, then candidates with the time they started (the debounce clock)
        raw.mood = rep.mood; raw.low = rawLow();
        if (raw.mood !== cand.mood) { if (committed && cand.mood !== committed.mood && cl0(cand.moodSince) < holdFor('mood', committed.mood, cand.mood)) { S.ignored++; record({ type: 'ignored', what: cand.mood, heldMs: Math.round(clock - cand.moodSince) }); } cand.mood = raw.mood; cand.moodSince = clock; }
        if (raw.low !== cand.low) { if (committed && cand.low !== committed.low && cl0(cand.lowSince) < holdFor('low', committed.low, cand.low)) { S.ignored++; record({ type: 'ignored', what: cand.low ? 'low' : 'not-low', heldMs: Math.round(clock - cand.lowSince) }); } cand.low = raw.low; cand.lowSince = clock; }
        var was = active; active = !!rep.active;
        if (active && !was) activate(clock);
        else if (active && committed) {
          // the game asked chip music for a different loop while adaptive music runs: never fight it, report it
          var L = segAt('loop', clock), pend = pendingLoop(clock), cur = pend || L;
          var foreign = cur && !mine[cur.track];
          if (foreign && !conflictOn) { S.conflicts++; record({ type: 'conflict', track: cur.track }); warn('conflict', 'chip music is playing "' + cur.track + '" while adaptive music is active; return null from your track picker during gameplay'); }
          conflictOn = !!foreign;
          tryCommit(clock);
        }
        apply(clock);
      } catch (e) { S.errors++; }
    }
    function cl0(since) { return clock - since; }

    function laneInfo(cl) {
      var L = segAt('loop', cl); if (!L) return null;
      var c = null; try { c = music.song(L.track); } catch (e) { }
      if (!c) return null;
      var x = L.r0 + (cl - L.c0) / L.rowMs, xr = c.loop && x >= c.total ? c.loopRow + ((x - c.total) % c.loopRows) : x, row = Math.floor(xr + 1e-6), bar = c.rpb * c.bpb;
      return { track: L.track, title: c.title, mine: !!mine[L.track], row: row, rowF: Math.round(xr * 1000) / 1000, bar: Math.floor(row / bar) + 1, beat: Math.floor((row % bar) / c.rpb) + 1, barMs: L.rowMs * bar, nextLine: nextBoundary(L, cl) };
    }
    function state(atClock) {
      var cl = atClock == null ? clock : atClock;
      if (atClock != null) plan = readPlan();
      var g = gainsAt(cl), last = trans[trans.length - 1] || null, pending = last && last.at > cl + 1e-6 ? last : null, cur = null;
      for (var i = trans.length - 1; i >= 0; i--) if (trans[i].at <= cl + 1e-6) { cur = trans[i]; break; }
      var fading = cur && cl < cur.end - 1e-6 ? cur : null;
      var holdLeft = 0;
      if (committed && cand.mood !== committed.mood) holdLeft = Math.max(holdLeft, holdFor('mood', committed.mood, cand.mood) - (cl - cand.moodSince));
      if (committed && cand.low !== committed.low) holdLeft = Math.max(holdLeft, holdFor('low', committed.low, cand.low) - (cl - cand.lowSince));
      var J = jingleAt(cl);
      var layers = {}; LAYERS.forEach(function (k) { layers[k] = Math.round(g[k] * 1000) / 1000; });
      return {
        t: Math.round(cl), active: active, mood: committed ? committed.mood : null, low: committed ? committed.low : false,
        heard: (function () { var c = cur || null; return c ? { mood: c.to.mood, low: c.to.low } : null; })(),
        raw: { mood: raw.mood, low: raw.low, hp: Math.round(rep.hp * 1000) / 1000 },
        candidate: { mood: cand.mood, low: cand.low, heldMs: Math.round(cl - Math.min(cand.moodSince, cand.lowSince)), holdLeftMs: Math.round(Math.max(0, holdLeft)) },
        layers: layers, channels: { tri: layers.base, noise: layers.perc, p1: layers.lead, p2: layers.danger },
        pending: pending ? { id: pending.id, at: Math.round(pending.at), inMs: Math.round(pending.at - cl), to: pending.to.mood + (pending.to.low ? '+low' : ''), stinger: pending.stinger, track: pending.track } : null,
        fading: fading ? { id: fading.id, u: Math.round(clamp((cl - fading.at) / Math.max(1, fading.end - fading.at), 0, 1) * 1000) / 1000, endsAt: Math.round(fading.end) } : null,
        jingle: J ? { track: J.track, own: isOwnJingle(J) } : null,
        loop: laneInfo(cl), conflict: conflictOn, transitions: trans.length,
        jingleLimit: { gapBars: P.jingleGapBars, rule: 'game jingles while steering: no item-kind jingle in a fight; a victory in a fight only if the fight or boss ends within a bar; none while another plays or within gapBars bars after it; after:stop and defeat always', passed: S.jinglesPassed, dropped: S.jinglesDropped, lastDropped: lastDrop ? copy(lastDrop) : null }
      };
    }
    function setParams(p) { try { P = normParams(p || {}, P); } catch (e) { S.errors++; } return params(); }
    function params() { return copy(P); }
    function planOut() {
      return trans.map(function (t) {
        return { id: t.id, at: t.at, end: t.end, from: copy(t.from), to: copy(t.to), fromGains: copy(t.fromGains), toGains: copy(t.toGains), fadeIn: t.fadeIn, fadeOut: t.fadeOut, stinger: t.stinger, track: t.track, reason: t.reason, committedAt: t.committedAt, heldMs: t.heldMs };
      });
    }
    function release() {   // stop steering: every channel back to full (call when leaving adaptive music for good)
      try { active = false; rep.active = false; lastGains = null; if (music) music.channels({ p1: 1, p2: 1, tri: 1, noise: 1 }); } catch (e) { S.errors++; }
    }
    function safe(f, d) { return function () { try { return f.apply(null, arguments); } catch (e) { S.errors++; return d; } }; }
    return {
      update: update,
      report: safe(function (r) { takeReport(r); }),
      state: safe(function (at) { return state(at); }, null),
      plan: safe(planOut, []),
      gainsAt: safe(function (cl) { plan = readPlan(); return gainsAt(cl); }, copy(ALL1)),
      // visualizers: the layer gains sampled every dt ms from t0 to t1 (one plan read)
      curve: safe(function (t0, t1, dt) { plan = readPlan(); var out = [], d = Math.max(1, num(dt, 50)); for (var t = num(t0, 0); t <= num(t1, 0) + 1e-6; t += d) out.push({ t: t, gains: gainsAt(t) }); return out; }, []),
      setParams: setParams, params: params,
      mix: function () { return JSON.parse(JSON.stringify(mix)); }, tracks: function () { return copy(tracks); }, stingers: function () { return copy(stingers); },
      layers: function () { return LAYERS.map(function (k) { return { layer: k, channel: CH_OF[k] }; }); },
      release: release,
      recent: function (n) { return log.slice(-Math.max(1, num(n, 8))).map(function (e) { return copy(e); }); },
      stats: function () { var o = copy(S); o.transitions = trans.length; o.active = active; return o; },
      applied: function () { return applied.slice(); },
      music: function () { return music; }
    };
  }

  /* ---------------- offline render (checks) ----------------
   * render({ms, step, script: [{t, report}] (each report holds until the next), events: [{t, op: 'jingle'|'play'|'stop', name, opts}]
 *         (the game's own chip-music calls), params, music: {chip params}, sampleRate})
   *   -> Promise<{rate, length, ch: {p1: Float32Array mono, ...}, gain: {p1: Float32Array, ...}, mix, plan, transitions, actions, applied}>
   * Drives a real chip-music instance (offline) and this module with a stepped clock, records every chip command this
   * module issued, renders each chip channel solo through chip music's own render() with those commands, then plays each
   * solo channel through a GainNode in an OfflineAudioContext that gets the SAME channel-gain calls the live module makes
   * (setTargetAtTime, 15 ms, as chip music's channels() does). gain.* is a constant 1 rendered through the same automation.
   */
  function render(spec) {
    spec = spec || {};
    var CM = chipLib(), OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    if (!CM || !OAC) return Promise.resolve(null);
    try {
      var sr = spec.sampleRate || 48000, ms = num(spec.ms, 8000), step = num(spec.step, 1000 / 60), len = Math.ceil(ms / 1000 * sr);
      var chip = CM.create({ offline: true, params: Object.assign({ volume: 1 }, spec.music || {}) });
      var acts = [];
      ['play', 'jingle', 'stop'].forEach(function (op) {
        var f = chip[op];
        chip[op] = function (name, o) { var st = chip.state(); acts.push({ t: Math.max(0, st.clock - 0.06), op: op, name: name, opts: o ? JSON.parse(JSON.stringify(o)) : undefined }); return f(name, o); };
      });
      var am = create({ music: chip, params: spec.params, mix: spec.mix, tracks: spec.tracks, stingers: spec.stingers, songs: spec.songs, trace: true });
      var script = (spec.script || []).slice().sort(function (a, b) { return a.t - b.t; }), si = 0, cur = {}, cl = 0, states = [];
      var evs = (spec.events || []).slice().sort(function (a, b) { return a.t - b.t; }), ei = 0;   // the game's own chip calls
      var first = true;
      while (cl <= ms + 1) {
        while (si < script.length && script[si].t <= cl + 1e-9) { cur = script[si].report; si++; }
        if (!first) chip.update(step);
        first = false;
        while (ei < evs.length && evs[ei].t <= cl + 1e-9) { var ev = evs[ei++]; if (typeof chip[ev.op] === 'function') chip[ev.op](ev.name, ev.opts); }
        am.update(cur);
        if (spec.sample && Math.abs(cl % spec.sample) < step / 2) states.push(am.state());
        cl += step;
      }
      var plan = chip.plan(), applied = am.applied(), CHS = ['p1', 'p2', 'tri', 'noise'];
      var songs = {}; Object.keys(SONGS).forEach(function (k) { songs[k] = SONGS[k]; }); if (spec.songs) Object.keys(spec.songs).forEach(function (k) { songs[k] = spec.songs[k]; });
      var jobs = CHS.map(function (ch) {
        return CM.render({ ms: ms, step: step, sampleRate: sr, songs: songs, actions: acts, solo: ch, params: Object.assign({ volume: 1 }, spec.music || {}) }).then(function (r) {
          if (!r || r.error) throw new Error('chip render failed: ' + (r && r.error));
          var oc = new OAC(2, len, sr), buf = oc.createBuffer(2, len, sr);
          buf.getChannelData(0).set(r.left.subarray(0, len)); buf.getChannelData(1).set(r.right.subarray(0, len));
          var src = oc.createBufferSource(); src.buffer = buf;
          var g = oc.createGain(); g.gain.value = 1;
          applied.forEach(function (a) { g.gain.setTargetAtTime(a.gains[LAYER_OF[ch]], a.t / 1000, 0.015); });
          src.connect(g); g.connect(oc.destination); src.start(0);
          // the constant probe goes to a second render (same automation), so gain[] is the gain curve WebAudio applied
          var oc2 = new OAC(1, len, sr), probe2 = oc2.createConstantSource(), pg2 = oc2.createGain(); pg2.gain.value = 1;
          applied.forEach(function (a) { pg2.gain.setTargetAtTime(a.gains[LAYER_OF[ch]], a.t / 1000, 0.015); });
          probe2.connect(pg2); pg2.connect(oc2.destination); probe2.start(0);
          return Promise.all([oc.startRendering(), oc2.startRendering()]).then(function (bb) {
            var L = bb[0].getChannelData(0), R = bb[0].getChannelData(1), mono = new Float32Array(len);
            for (var i = 0; i < len; i++) mono[i] = L[i] + R[i];
            return { ch: ch, mono: mono, left: L, right: R, gain: bb[1].getChannelData(0), plan: r.plan };
          });
        });
      });
      return Promise.all(jobs).then(function (outs) {
        var o = { rate: sr, length: len, ch: {}, gain: {}, left: new Float32Array(len), right: new Float32Array(len), plan: plan, renderPlan: outs[0].plan, transitions: am.plan(), actions: acts, applied: applied, states: states, finalState: am.state(), stats: am.stats(), recent: am.recent(80) };
        outs.forEach(function (x) { o.ch[x.ch] = x.mono; o.gain[x.ch] = x.gain; for (var i = 0; i < len; i++) { o.left[i] += x.left[i]; o.right[i] += x.right[i]; } });
        return o;
      });
    } catch (e) { return Promise.resolve({ error: String(e && e.stack || e) }); }
  }

  root.GameDNA_AdaptiveMusic = {
    version: VERSION, layers: LAYERS.slice(), channelOf: copy(CH_OF), layerOf: copy(LAYER_OF), moods: MOODS.slice(),
    defaults: copy(DEFAULTS), mix: JSON.parse(JSON.stringify(MIX)), tracks: copy(TRACKS), stingers: copy(STINGERS),
    songs: JSON.parse(JSON.stringify(SONGS)),
    create: create, validate: validate, mixFor: function (mood, low, m) { return mixFor(m || MIX, mood, low); }, render: render
  };
})(typeof window !== 'undefined' ? window : this);
