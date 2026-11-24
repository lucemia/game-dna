/* GameDNA F-03 chip music - v1.0.4
 * One classic script, no dependencies, one global: GameDNA_ChipMusic. ASCII only.
 *
 * A tiny 4-channel chip synth (pulse 1 and pulse 2 with duty cycle, a stepped triangle, a noise drum kit) that plays
 * pattern data as seamless loops, plus one-shot jingles that pause (or duck) the loop and bring it back on the beat.
 *
 *   var music = GameDNA_ChipMusic.create({params: {volume: 0.7}});
 *   music.update(stepMs);                 // in the fixed step of EVERY scene: the music clock
 *   music.play('field');                  // loop a track (same track again = no-op); switches on the next beat
 *   music.jingle('victory');              // one-shot: the loop pauses, then resumes on a beat after the jingle
 *   music.jingle('victory', {then: 'field'}); // ... or a different track starts after it
 *   music.draw(ctx, x, y);                // optional sound badge (4 channel meters; muted / waiting for a click)
 *   music.mute(); music.setParams({volume: 0.5, tempo: 1.1, transpose: 2});
 *
 * Song data (add your own with addSong or create({songs})):
 *   {bpm: 120, rpb: 4 (rows per beat), rows: 32 (rows per pattern), loop: true, loopFrom: 0 (order index),
 *    inst: {p1: {duty: 0.25, vol: 0.5, decay: 0.3, sustain: 0.6, release: 0.03, vib: 0.25}, p2: {...}, tri: {...}, noise: {vol}},
 *    patterns: {A: {p1: 'C5*4 E5*4 G5~*8 | ...', p2: '...', tri: '...', noise: 'k . h . s . h .'}},
 *    order: ['A', 'A', 'B']}
 *   A token is one row: NOTE (C4, F#3, Bb5) with optional effects  +47 (arpeggio offsets, hex digits), ~ / ~~ (vibrato),
 *   >G5 (slide to G5 over the note), ! (accent), _ (soft); '-' holds, '.' is silence; '*n' repeats as n rows (the note
 *   then n-1 holds). Noise channel: k kick, s snare, h hat, o open hat, c crash. '|' is ignored (bar marks).
 *
 * The music clock is game time from update() while audio is off (no click yet, ?t= fast-forward, automated runs) and
 * the audio clock once sound runs, so everything state() reports (track, row, notes, levels) is deterministic.
 * The module never touches game state, never consumes the game's random numbers, never reads or blocks input (it only
 * listens, passively, for the first pointer / key / touch to start audio) and never throws.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.4';
  var CH = ['p1', 'p2', 'tri', 'noise'];
  var CH_LABEL = { p1: 'Pulse 1', p2: 'Pulse 2', tri: 'Triangle', noise: 'Noise' };
  var CH_MIX = { p1: 0.24, p2: 0.17, tri: 0.33, noise: 0.24 };
  var CH_PAN = { p1: -0.22, p2: 0.24, tri: 0, noise: 0.08 };
  var INST_DEFAULT = {
    p1: { duty: 0.25, vol: 1, decay: 0.32, sustain: 0.62, release: 0.035, vib: 0.22 },
    p2: { duty: 0.125, vol: 1, decay: 0.16, sustain: 0.4, release: 0.025, vib: 0.18 },
    tri: { vol: 1, decay: 0, sustain: 1, release: 0.014, vib: 0.15 },
    noise: { vol: 1 }
  };
  var DRUMS = { k: 'kick', s: 'snare', h: 'hat', o: 'open hat', c: 'crash' };
  var DEFAULTS = { volume: 0.7, mute: false, tempo: 1, transpose: 0, jingleMode: 'pause', resume: 'beat', duck: 0.25, at: 'beat' };
  var NOTE_IX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var A4 = 440, TICK = 60;     // effects run at 60 ticks a second, from each note's start (arpeggio steps, vibrato, slides)

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return v == null || v === '' || !isFinite(+v) ? d : +v; }
  function midiName(m) { m = Math.round(m); return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
  function midiHz(m) { return A4 * Math.pow(2, (m - 69) / 12); }

  /* ---------------- songs: parse + validate ---------------- */
  function parseNote(s) {
    var m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(s); if (!m) return null;
    return (parseInt(m[3], 10) + 1) * 12 + NOTE_IX[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  // one token -> {k: 'note'|'drum'|'hold'|'rest', midi, fx, drum, n (rows)} or {err}
  function parseToken(tok, ch) {
    var n = 1, star = tok.lastIndexOf('*');
    if (star > 0) { n = parseInt(tok.slice(star + 1), 10); tok = tok.slice(0, star); if (!(n >= 1 && n <= 256)) return { err: 'bad repeat' }; }
    if (tok === '-') return { k: 'hold', n: n };
    if (tok === '.') return { k: 'rest', n: n };
    if (ch === 'noise') {
      var d = tok.replace(/[!_]/g, ''); if (!DRUMS[d]) return { err: 'unknown drum "' + tok + '" (k s h o c)' };
      return { k: 'drum', drum: d, acc: tok.indexOf('!') >= 0 ? 1.25 : tok.indexOf('_') >= 0 ? 0.6 : 1, n: n };
    }
    var m = /^([A-Ga-g][#b]?-?\d)((?:\+[0-9a-cA-C]{1,3})?)((?:>[A-Ga-g][#b]?-?\d)?)(~{0,2})([!_]?)$/.exec(tok);
    if (!m) return { err: 'cannot read "' + tok + '"' };
    var midi = parseNote(m[1]); if (midi == null) return { err: 'bad note "' + tok + '"' };
    var fx = {};
    if (m[2]) fx.arp = [0].concat(m[2].slice(1).split('').map(function (c) { return parseInt(c, 16); }));
    if (m[3]) fx.slide = parseNote(m[3].slice(1));
    if (m[4]) fx.vib = m[4].length;
    if (m[5]) fx.acc = m[5] === '!' ? 1.25 : 0.6;
    return { k: 'note', midi: midi, fx: fx, n: n };
  }
  function tokens(str) { return String(str || '').replace(/\|/g, ' ').trim().split(/\s+/).filter(function (t) { return t; }); }

  // compile: flatten order x patterns into per-channel event lists with absolute rows
  function compile(song, name) {
    var problems = [], S = song || {};
    var bpm = num(S.bpm, 120), rpb = Math.round(num(S.rpb, 4)), rows = Math.round(num(S.rows, 16));
    var order = Array.isArray(S.order) ? S.order : [], pats = S.patterns || {};
    if (!(bpm >= 30 && bpm <= 300)) problems.push('bpm must be 30-300');
    if (!(rpb >= 1 && rpb <= 8)) problems.push('rpb must be 1-8');
    if (!order.length) problems.push('order is empty');
    var loop = S.loop !== false, loopFrom = Math.round(clamp(num(S.loopFrom, 0), 0, Math.max(0, order.length - 1)));
    var inst = {}; CH.forEach(function (c) { inst[c] = Object.assign({}, INST_DEFAULT[c], (S.inst || {})[c] || {}); });
    var chans = {}; CH.forEach(function (c) { chans[c] = []; });
    var patRows = {};
    order.forEach(function (pn, oi) {
      var P = pats[pn]; if (!P) { problems.push('order[' + oi + ']: no pattern "' + pn + '"'); return; }
      var pr = Math.round(num(P.rows, rows)); patRows[pn] = pr;
      CH.forEach(function (c) {
        var row = 0, list = [];
        tokens(P[c] == null ? '.*' + pr : P[c]).forEach(function (tk) {
          var t = parseToken(tk, c); if (t.err) { problems.push(pn + '.' + c + ': ' + t.err); return; }
          list.push({ t: t, row: row }); row += t.n;
        });
        if (P[c] != null && row !== pr) problems.push(pn + '.' + c + ': ' + row + ' rows, pattern has ' + pr);
        chans[c].push({ list: list, pr: pr });
      });
    });
    var total = 0, starts = [];
    order.forEach(function (pn) { starts.push(total); total += patRows[pn] || 0; });
    var loopRow = starts[loopFrom] || 0, loopRows = total - loopRow;
    if (loop && loopRows % rpb) problems.push('the loop is ' + loopRows + ' rows, not whole beats');
    var ev = {};
    CH.forEach(function (c) {
      var out = [];
      chans[c].forEach(function (blk, oi) {
        blk.list.forEach(function (e) {
          var t = e.t, r = starts[oi] + e.row;
          if (t.k === 'hold') return;
          if (t.k === 'rest') { if (c !== 'noise') out.push({ k: 'rest', row: r }); return; }   // drums ring out: '.' only starts nothing
          if (t.k === 'drum') { out.push({ k: 'drum', row: r, drum: t.drum, acc: t.acc }); return; }
          if (t.midi < 24 || t.midi > 108) problems.push(c + ' row ' + r + ': ' + midiName(t.midi) + ' is out of range C1-C8');
          out.push({ k: 'note', row: r, midi: t.midi, fx: t.fx });
        });
      });
      for (var i = 0; i < out.length; i++) out[i].end = i + 1 < out.length ? out[i + 1].row : total;
      // a note ends where the next event starts (a rest or a new note); holds extend it
      ev[c] = out;
    });
    return { name: name || S.name || 'song', title: S.title || name || 'song', bpm: bpm, rpb: rpb, bpb: Math.round(num(S.bpb, 4)), total: total, loop: loop, loopRow: loopRow,
      loopRows: loopRows, inst: inst, ev: ev, starts: starts, order: order.slice(), patRows: patRows, problems: problems, kind: loop ? 'loop' : 'jingle', src: S };
  }
  function validate(song) { var c = compile(song); return { ok: !c.problems.length, problems: c.problems, rows: c.total, seconds: c.total * 60 / c.bpm / c.rpb }; }

  /* ---------------- synth: compiled song -> per-channel Float32Arrays ----------------
   * Rows start at round(row * rowLen) samples. A loop renders the song twice in one run (pass 1 then pass 2) so pass 2
   * begins with exactly the state (phase, envelope, ringing tails, noise register, filters) that pass 1 ended with: the
   * buffer's loop region (pass 2) wraps onto itself without a seam. A jingle renders once plus a release tail.
   */
  function synth(c, opts) {
    opts = opts || {};
    var sr = opts.sampleRate || 48000, tempo = clamp(num(opts.tempo, 1), 0.5, 2), tr = clamp(Math.round(num(opts.transpose, 0)), -12, 12);
    var nominal = sr * 60 / (c.bpm * tempo) / c.rpb;
    // a loop's length is a whole number of samples, so every pass puts every row on the same sample offsets
    var rowLen = opts.rowLen || (c.loop && c.loopRows ? Math.round(c.loopRows * nominal) / c.loopRows : nominal);
    var aRows = c.total, loopRows = c.loop ? c.loopRows : 0;
    var len1 = Math.round(aRows * rowLen), lenAll = c.loop ? Math.round((aRows + loopRows) * rowLen) : len1 + Math.round(sr * 0.45);
    var XF = Math.max(16, Math.round(sr * 0.002));            // 2 ms crossfade on every note start / drum hit
    var out = {};
    function rowS(r) { return Math.round(r * rowLen); }
    CH.forEach(function (ch) {
      var buf = new Float32Array(lenAll), I = c.inst[ch], mixG = CH_MIX[ch] * num(I.vol, 1);
      var seq = [];
      c.ev[ch].forEach(function (e) { seq.push(e); });
      if (c.loop) c.ev[ch].forEach(function (e) { if (e.row >= c.loopRow) { var x = Object.assign({}, e); x.row += loopRows; x.end += loopRows; seq.push(x); } });
      else seq.push({ k: 'rest', row: c.total, end: c.total });     // a jingle releases everything at its end
      var endRow = c.loop ? aRows + loopRows : aRows + 1;
      // pass 2 equals pass 1 once the state from the pass 1 ending has died out (tails, crossfades, drum rings, held
      // notes): synthesize pass 2 up to 1.6 s after each channel's first event of the loop region, copy the rest
      var copyAt = lenAll, K = c.loop ? lenAll - len1 : 0;
      if (c.loop && c.loopRow === 0 && !opts.noCopy) {
        var first = c.ev[ch].length ? c.ev[ch][0].row : loopRows;
        copyAt = Math.min(lenAll, rowS(aRows + first + 1) + Math.round(sr * 1.6));
      }
      // sound state, carried across rows and passes; every note start resets the oscillator phase (with a 2 ms
      // crossfade from the old one) and every drum hit resets the noise register, so pass 2 ends in the state pass 1
      // ended in and the loop region wraps onto itself without a seam
      var phase = 0, inc = 0, oPh = 0, oInc = 0, xf = 0, env = 0, envFrom = 0, peak = 0, on = false, tOn = 0, tOff = 0, relFrom = 0, lastTick = -1;
      var curE = null, dc = 0, dcPrev = 0, lfsr = 1, nAcc = 0, nOut = 1, dk = null, dPh = 0, dT = 0, hp = 0, hpPrev = 0, dVol = 1, last = 0, fadeV = 0, fadeN = 0;
      var att = sr * 0.002, rel = Math.max(0.006, num(I.release, 0.02)) * sr, dec = num(I.decay, 0) * sr, sus = clamp(num(I.sustain, 1), 0, 1), vibD = num(I.vib, 0.2);
      var duty = clamp(num(I.duty, 0.5), 0.05, 0.95), dcOff = 2 * duty - 1, R = Math.exp(-2 * Math.PI * 18 / sr);
      var ei = 0;
      function noteFreq(e, tk, durSec) {
        var m = e.midi + tr;
        if (e.fx.arp) m += e.fx.arp[tk % e.fx.arp.length];
        if (e.fx.slide != null) m += (e.fx.slide - e.midi) * clamp(tk / Math.max(1, Math.floor(durSec * TICK * 0.85)), 0, 1);
        if (e.fx.vib || (vibD && durSec >= 0.5 && !e.fx.arp && e.fx.slide == null)) {
          var depth = e.fx.vib ? (e.fx.vib === 2 ? 0.5 : 0.28) : vibD * 0.6, tv = tk / TICK - 0.14;
          if (tv > 0) m += depth * Math.min(1, tv / 0.12) * Math.sin(2 * Math.PI * 5.6 * tv);
        }
        return midiHz(m);
      }
      function wave(ph, dt) {
        if (ch === 'tri') { var st = Math.floor(ph * 32), q = st < 16 ? st : 31 - st; return (q / 15) * 2 - 1; }   // 16 steps up, 16 down
        var p = ph < duty ? 1 : -1; p += blep(ph, dt); p -= blep((ph + 1 - duty) % 1, dt); return p - dcOff;
      }
      for (var n = 0; n < copyAt; n++) {
        while (ei < seq.length && seq[ei].row < endRow && rowS(seq[ei].row) <= n) {
          var e = seq[ei++];
          if (e.k === 'rest') { if (on) { on = false; tOff = n; relFrom = env; } curE = null; continue; }
          if (e.k === 'drum') { fadeV = last; fadeN = XF; dk = e.drum; dT = 0; dPh = 0; lfsr = 0x4a3d; nAcc = 0; hp = 0; hpPrev = 0; dVol = e.acc; on = true; continue; }
          if (env > 0 || on) { oPh = phase; oInc = inc; xf = XF; }
          curE = e; on = true; tOn = n; envFrom = env; peak = e.fx.acc || 1; lastTick = -1; phase = 0;
        }
        var v = 0;
        if (ch === 'noise') {
          if (dk) {
            var ts = dT / sr, o = 0;
            var rate = dk === 'k' ? 1800 : dk === 's' ? 11000 : sr, tap = dk === 's' ? 6 : 1;
            nAcc += rate / sr;
            while (nAcc >= 1) { nAcc -= 1; var bit = (lfsr ^ (lfsr >> tap)) & 1; lfsr = (lfsr >> 1) | (bit << 14); nOut = (lfsr & 1) ? 1 : -1; }
            if (dk === 'k') {
              dPh += (48 + 130 * Math.exp(-ts / 0.028)) / sr; if (dPh >= 1) dPh -= 1;
              o = (dPh < 0.5 ? dPh * 4 - 1 : 3 - dPh * 4) * 1.15 * Math.exp(-ts / 0.11) + nOut * 0.25 * Math.exp(-ts / 0.008);
            } else if (dk === 's') {
              dPh += (185 + 60 * Math.exp(-ts / 0.02)) / sr; if (dPh >= 1) dPh -= 1;
              o = nOut * 0.75 * Math.exp(-ts / 0.09) + (dPh < 0.5 ? dPh * 4 - 1 : 3 - dPh * 4) * 0.45 * Math.exp(-ts / 0.035);
            } else {
              hp = 0.6 * (hp + nOut - hpPrev); hpPrev = nOut;
              o = hp * (dk === 'h' ? 0.55 * Math.exp(-ts / 0.028) : dk === 'o' ? 0.42 * Math.exp(-ts / 0.15) : 0.5 * Math.exp(-ts / 0.55));
            }
            v = o * Math.min(1, dT / (sr * 0.0015)) * dVol;
            if (ts > 1.2) { v *= Math.max(0, (1.5 - ts) / 0.3); if (ts > 1.5) dk = null; }
            dT++;
          }
          if (fadeN > 0) { v += fadeV * (fadeN / XF); fadeN--; }
        } else {
          if (on) {
            var tn = n - tOn;
            if (tn < att) env = envFrom + (peak - envFrom) * (tn / att);
            else if (dec > 0) env = peak * (sus + (1 - sus) * Math.exp(-(tn - att) / dec));
            else env = peak;
          } else if (env > 0) { env = relFrom * (1 - (n - tOff) / rel); if (env < 0) env = 0; }
          if (curE) {
            var tk = Math.floor((n - tOn) * TICK / sr);
            if (tk !== lastTick) { lastTick = tk; inc = noteFreq(curE, tk, (rowS(curE.end) - rowS(curE.row)) / sr) / sr; }
          }
          if (env > 0 || on) {
            var w = wave(phase, inc);
            if (xf > 0) { var m = xf / XF; w = w * (1 - m) + wave(oPh, oInc) * m; oPh += oInc; if (oPh >= 1) oPh -= 1; xf--; }
            v = w * env;
            phase += inc; if (phase >= 1) phase -= 1;
          }
        }
        last = v;
        var y = v - dcPrev + R * dc; dcPrev = v; dc = y;     // DC blocker (18 Hz)
        buf[n] = y * mixG;
      }
      for (n = copyAt; n < lenAll; n++) buf[n] = buf[n - K];
      out[ch] = buf;
    });
    return { rate: sr, rowLen: rowLen, rowSec: rowLen / sr, aRows: aRows, loopRows: loopRows, total: c.total, loopRow: c.loopRow, loop: c.loop,
      length: lenAll, loopStart: c.loop ? len1 : 0, loopEnd: lenAll, ch: out, tempo: tempo, transpose: tr };
  }
  function blep(t, dt) {
    if (dt <= 0) return 0;
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
  }

  /* ---------------- built-in songs (original) ---------------- */
  var SONGS = {
    title: { title: 'Dawn Over the Ridge', bpm: 120, rows: 32, inst: { p1: { duty: 0.25, decay: 0.4, sustain: 0.66 }, p2: { duty: 0.125, decay: 0.12, sustain: 0.32 } },
      patterns: {
        A: { p1: 'A4*4 D5*4 F#5*6 E5*2 | D5*4 B4*2 C#5*2 D5*6 .*2',
             p2: '. . D4+47*2 . . D4+47*2 . . D4+47*2 . . D4+47*2 | . . B3+37*2 . . B3+37*2 . . B3+37*2 . . B3+37*2',
             tri: 'D3*3 . D3*2 D3*2 A2*3 . A2*2 D3*2 | B2*3 . B2*2 B2*2 F#2*3 . F#2*2 B2*2',
             noise: 'k . h . s . h . k . k h s . h o | k . h . s . h . k . k h s . h o' },
        B: { p1: 'B4*4 D5*4 G5*6 F#5*2 | E5~*8 C#5*4 A4*4',
             p2: '. . G3+47*2 . . G3+47*2 . . G3+47*2 . . G3+47*2 | . . A3+47*2 . . A3+47*2 . . A3+47*2 . . A3+47*2',
             tri: 'G2*3 . G2*2 G2*2 D3*3 . D3*2 G2*2 | A2*3 . A2*2 A2*2 E3*3 . E3*2 A2*2',
             noise: 'k . h . s . h . k . k h s . h o | k . h . s . h . k . k h s . s s' },
        C: { p1: 'A4*4 D5*4 F#5*4 A5*4 | A5*6 F#5*2 E5*4 C#5*4',
             p2: '. . D4+47*2 . . D4+47*2 . . D4+47*2 . . D4+47*2 | . . F#3+37*2 . . F#3+37*2 . . F#3+37*2 . . F#3+37*2',
             tri: 'D3*3 . D3*2 D3*2 A2*3 . A2*2 D3*2 | F#2*3 . F#2*2 F#2*2 C#3*3 . C#3*2 F#2*2',
             noise: 'c . h . s . h . k . k h s . h o | k . h . s . h . k . k h s . h o' },
        D: { p1: 'D5*4 E5*4 G5*4 B5*4 | A5~*8 G5*2 F#5*2 E5*4',
             p2: '. . G3+47*2 . . G3+47*2 . . G3+47*2 . . G3+47*2 | . . A3+47*2 . . A3+47*2 . . A3+47*2 . . A3+47*2',
             tri: 'G2*3 . G2*2 G2*2 D3*3 . D3*2 G2*2 | A2*3 . A2*2 A2*2 E3*2 E3*2 C#3*2 A2*2',
             noise: 'k . h . s . h . k . k h s . h o | k . h . s . s . s . s . s s s s' }
      }, order: ['A', 'B', 'C', 'D'] },
    field: { title: 'Meadow Road', bpm: 104, rows: 32, inst: { p1: { duty: 0.5, decay: 0.5, sustain: 0.55, vib: 0.25 }, p2: { duty: 0.25, decay: 0.09, sustain: 0.25 }, tri: { release: 0.03 } },
      patterns: {
        A: { p1: 'B4*6 A4*2 G4*4 D5*4 | E5*6 D5*2 B4~*8',
             p2: 'G3*2 B3*2 D4*2 B3*2 G3*2 B3*2 D4*2 B3*2 | E3*2 G3*2 B3*2 G3*2 E3*2 G3*2 B3*2 G3*2',
             tri: 'G2*3 . D3*3 . G2*3 . D3*3 . | E2*3 . B2*3 . E2*3 . B2*3 .',
             noise: 'k . . . h . . . s . . . h . h . | k . . . h . . . s . . . h . h .' },
        B: { p1: 'C5*4 E5*4 G5*4 E5*4 | F#5*6 E5*2 D5~*8',
             p2: 'C4*2 E4*2 G4*2 E4*2 C4*2 E4*2 G4*2 E4*2 | D4*2 F#4*2 A4*2 F#4*2 D4*2 F#4*2 A4*2 F#4*2',
             tri: 'C3*3 . G2*3 . C3*3 . G2*3 . | D3*3 . A2*3 . D3*3 . A2*3 .',
             noise: 'k . . . h . . . s . . . h . h . | k . . . h . . . s . . . h . s .' },
        C: { p1: 'D5*4 B4*2 D5*2 G5~*8 | E5*4 G5*4 F#5*4 E5*4',
             p2: 'G3*2 B3*2 D4*2 B3*2 G3*2 B3*2 D4*2 B3*2 | E3*2 G3*2 B3*2 G3*2 E3*2 G3*2 B3*2 G3*2',
             tri: 'G2*3 . D3*3 . G2*3 . D3*3 . | E2*3 . B2*3 . E2*3 . B2*3 .',
             noise: 'k . . . h . . . s . . . h . h . | k . . . h . . . s . . . h . h .' },
        D: { p1: 'C5*6 B4*2 A4*4 E5*4 | D5~*8 C5*4 A4*4',
             p2: 'A3*2 C4*2 E4*2 C4*2 A3*2 C4*2 E4*2 C4*2 | D4*2 F#4*2 A4*2 F#4*2 D4*2 F#4*2 A4*2 F#4*2',
             tri: 'A2*3 . E3*3 . A2*3 . E3*3 . | D3*3 . A2*3 . D3*3 . F#2*2 A2*2',
             noise: 'k . . . h . . . s . . . h . h . | k . . . h . . . s . s . s . s s' }
      }, order: ['A', 'B', 'C', 'D'] },
    battle: { title: 'Clash at the Pass', bpm: 150, rows: 32, inst: { p1: { duty: 0.25, decay: 0.25, sustain: 0.7 }, p2: { duty: 0.125, decay: 0.07, sustain: 0.3 }, tri: { release: 0.01 } },
      patterns: {
        A: { p1: 'A4*2 . A4 C5*2 E5*2 A5*4 G5*2 E5*2 | D5*2 E5*2 C5*4 B4*2 A4*2 B4*4',
             p2: 'A3+37 . A3+37 . A3+37 A3+37 . A3+37 . A3+37 . A3+37 A3+37 . A3+37 . | A3+37 . A3+37 . A3+37 A3+37 . A3+37 . A3+37 . A3+37 A3+37 . A3+37 .',
             tri: 'A2*2 A3*2 A2*2 A3*2 A2*2 A3*2 A2*2 A3*2 | A2*2 A3*2 A2*2 A3*2 A2*2 A3*2 G2*2 G3*2',
             noise: 'k . h . s . h k k . h . s . h h | k . h . s . h k k . h . s . h h' },
        B: { p1: 'C5*2 . C5 F5*2 A5*2 C6*4 A5*2 F5*2 | G5*6 F5*2 E5*2 D5*2 B4*4',
             p2: 'F3+47 . F3+47 . F3+47 F3+47 . F3+47 . F3+47 . F3+47 F3+47 . F3+47 . | G3+47 . G3+47 . G3+47 G3+47 . G3+47 . G3+47 . G3+47 G3+47 . G3+47 .',
             tri: 'F2*2 F3*2 F2*2 F3*2 F2*2 F3*2 F2*2 F3*2 | G2*2 G3*2 G2*2 G3*2 G2*2 G3*2 G2*2 G3*2',
             noise: 'k . h . s . h k k . h . s . h h | k . h . s . h k k . h . s . s s' },
        C: { p1: 'A5*4 E5*2 A5*2 C6*4 B5*2 A5*2 | G5*2 A5*2 E5~*8 D5*2 C5*2',
             p2: 'A3+37 . A3+37 . A3+37 A3+37 . A3+37 . A3+37 . A3+37 A3+37 . A3+37 . | A3+37 . A3+37 . A3+37 A3+37 . A3+37 . A3+37 . A3+37 A3+37 . A3+37 .',
             tri: 'A2*2 A3*2 A2*2 A3*2 A2*2 A3*2 A2*2 A3*2 | A2*2 A3*2 A2*2 A3*2 A2*2 A3*2 G2*2 G3*2',
             noise: 'c . h . s . h k k . h . s . h h | k . h . s . h k k . h . s . h h' },
        D: { p1: 'F5*4 E5*2 F5*2 A5*4 C6*4 | E5>B5*4 B5~*4 G#5*4 E5*4',
             p2: 'F3+47 . F3+47 . F3+47 F3+47 . F3+47 . F3+47 . F3+47 F3+47 . F3+47 . | E3+47 . E3+47 . E3+47 E3+47 . E3+47 . E3+47 . E3+47 E3+47 . E3+47 .',
             tri: 'F2*2 F3*2 F2*2 F3*2 F2*2 F3*2 F2*2 F3*2 | E2*2 E3*2 E2*2 E3*2 E2*2 E3*2 E2*2 E3*2',
             noise: 'k . h . s . h k k . h . s . h h | k . s . s . s . s . s s s s s s' }
      }, order: ['A', 'B', 'C', 'D'] },
    victory: { title: 'Victory', bpm: 132, rows: 32, loop: false, inst: { p1: { duty: 0.5, decay: 0.6, sustain: 0.6 }, p2: { duty: 0.25, decay: 0.6, sustain: 0.5 } },
      patterns: { A: { p1: 'G4*2 C5*2 E5*2 G5*6 E5*2 G5*2 C6~*12 .*4', p2: 'E4*2 G4*2 C5*2 E5*6 C5*2 E5*2 G5~*12 .*4',
                       tri: 'C3*6 .*2 G2*4 .*2 C3*14 .*4', noise: 's . s . s . k . . . s . c*16 .*4' } }, order: ['A'] },
    defeat: { title: 'Fallen', bpm: 84, rows: 32, loop: false, inst: { p1: { duty: 0.5, decay: 0.8, sustain: 0.5 }, p2: { duty: 0.25, decay: 0.8, sustain: 0.45 } },
      patterns: { A: { p1: 'E5*4 D5*4 C5*4 B4*4 A4*8 G#4*4 A4~*4', p2: 'C5*4 B4*4 A4*4 G#4*4 E4*8 E4*4 C4*4',
                       tri: 'A2*8 F2*8 E2*8 A2*8', noise: 'k .*15 k .*15' } }, order: ['A'] },
    item: { title: 'Item Get', bpm: 140, rows: 16, loop: false, inst: { p1: { duty: 0.25, decay: 0.5, sustain: 0.6 }, p2: { duty: 0.125, decay: 0.3, sustain: 0.4 } },
      patterns: { A: { p1: 'C5*2 E5*2 G5*2 C6~*6 .*4', p2: 'G4*2 C5*2 E5*2 G5*6 .*4', tri: 'C3*12 .*4', noise: 'h . h . c*8 .*4' } }, order: ['A'] }
  };

  /* ---------------- master chain helpers ---------------- */
  var CEIL = null;
  function ceilingCurve() {
    if (CEIL) return CEIL;
    var n = 4097, c = new Float32Array(n), knee = 0.8, room = 0.18;
    for (var i = 0; i < n; i++) { var x = (i / (n - 1)) * 2 - 1, ax = Math.abs(x), y = ax <= knee ? ax : knee + room * Math.tanh((ax - knee) / room); c[i] = x < 0 ? -y : y; }
    return (CEIL = c);
  }
  function AudioCtor() { return root.AudioContext || root.webkitAudioContext || null; }
  function OfflineCtor() { return root.OfflineAudioContext || root.webkitOfflineAudioContext || null; }
  var GESTURES = ['pointerdown', 'mousedown', 'touchend', 'keydown', 'click'];

  /* ---------------- engine: one audio graph, used live and offline ----------------
   * graph: per segment and channel  source -> segGain -> chanBus[ch] (mute / solo / layers) -> panner -> loopBus | jingleBus
   *        -> musicBus -> master (volume, mute) -> soft ceiling -> destination
   */
  function Engine(ctx, dest, getBuffers) {
    var E = { ctx: ctx, sched: {}, anchorCtx: 0, anchorClock: 0 };
    var master = ctx.createGain(), sh = ctx.createWaveShaper(), music = ctx.createGain();
    sh.curve = ceilingCurve(); sh.oversample = 'none';   // linear below 0.8; no oversampling = no added latency
    music.connect(master); master.connect(sh); sh.connect(dest);
    function busSet() {
      var bus = ctx.createGain(), ch = {};
      CH.forEach(function (c) {
        var g = ctx.createGain(), last = g;
        if (ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = CH_PAN[c]; g.connect(p); last = p; }
        last.connect(bus); ch[c] = g;
      });
      bus.connect(music); return { bus: bus, ch: ch };
    }
    var loopB = busSet(), jingB = busSet();
    E.master = master; E.music = music; E.loopBus = loopB.bus; E.jingleBus = jingB.bus; E.chan = { loop: loopB.ch, jingle: jingB.ch };
    E.at = function (c) { return E.anchorCtx + (c - E.anchorClock) / 1000; };
    E.schedule = function (seg, fromClock) {
      var B = getBuffers(seg, ctx.sampleRate); if (!B) return null;
      var c0 = Math.max(seg.c0, fromClock), x = seg.r0 + (c0 - seg.c0) / seg.rowMs, t = E.at(c0), lead = ctx.currentTime + (E.offline ? 0 : 0.004);
      // offset into the buffer: pass 1 holds song rows 0..total, pass 2 (the loop region) holds rows loopRow..total again
      var off;
      if (x < B.total) off = x * B.rowSec;
      else if (B.loop) off = (B.total + ((x - B.total) % B.loopRows)) * B.rowSec;
      else return null;
      if (t < lead) { off += lead - t; t = lead; }
      var bufDur = B.length / B.rate;
      if (!B.loop && off >= bufDur) return null;
      var item = { seg: seg, nodes: [], gains: [], cEnd: null, start: t };
      var busCh = E.chan[seg.kind === 'jingle' ? 'jingle' : 'loop'], fadeIn = (c0 > seg.c0 + 0.5 || seg.fadeIn) ? 0.012 : 0;
      CH.forEach(function (c) {
        var src = ctx.createBufferSource(); src.buffer = B.buf[c];
        if (B.loop) { src.loop = true; src.loopStart = B.loopStart / B.rate; src.loopEnd = B.length / B.rate; }
        var g = ctx.createGain();
        if (fadeIn) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + fadeIn); } else g.gain.value = 1;
        src.connect(g); g.connect(busCh[c]);
        src.start(t, Math.max(0, off));
        item.nodes.push(src); item.gains.push(g);
      });
      E.sched[seg.id] = item;
      E.end(seg);
      return item;
    };
    E.end = function (seg) {   // (re)apply the segment's end (stop with a short fade) if it is finite
      var it = E.sched[seg.id]; if (!it) return;
      if (it.cEnd === seg.cEnd) return;
      it.cEnd = seg.cEnd;
      if (!isFinite(seg.cEnd)) return;
      var te = Math.max(E.at(seg.cEnd), ctx.currentTime + 0.002), f = (seg.fadeOut || 12) / 1000;
      it.gains.forEach(function (g) { try { g.gain.cancelScheduledValues(te); g.gain.setValueAtTime(1, te); g.gain.linearRampToValueAtTime(0, te + f); } catch (e) { } });
      it.nodes.forEach(function (n) { try { n.stop(te + f + 0.01); } catch (e) { } });
    };
    E.kill = function (id) {
      var it = E.sched[id]; if (!it) return; delete E.sched[id];
      var t = ctx.currentTime;
      it.gains.forEach(function (g) { try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.012); } catch (e) { } });
      it.nodes.forEach(function (n) { try { n.stop(t + 0.02); } catch (e) { } });
    };
    E.ducks = function (list, level, fromClock) {
      var g = E.loopBus.gain, t = ctx.currentTime;
      try {
        g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
        list.forEach(function (d) {
          if (d.c1 <= fromClock) return;
          var a = Math.max(E.at(d.c0), t), b = Math.max(E.at(d.c1), a + 0.02);
          g.setTargetAtTime(level, a, 0.012); g.setTargetAtTime(1, b, 0.02);
        });
      } catch (e) { }
    };
    return E;
  }

  /* ---------------- transport: a plan of segments on the music clock ----------------
   * segment {id, kind 'loop'|'jingle', track, c0 (ms), r0 (song row at c0), rowMs, cEnd, fadeOut, tempo, transpose}
   * Everything state() reports is computed from the plan and the clock, so ?t= stills match live play.
   */
  function Transport(lib, P0) {
    var T = { plan: [], ducks: [], clock: 0, seq: 0, memo: {}, P: P0 };
    function song(name) { return lib(name); }
    T.rowMsOf = function (c, tempo) { return 60000 / (c.bpm * tempo) / c.rpb; };
    T.rowAt = function (seg, cl) { return seg.r0 + (cl - seg.c0) / seg.rowMs; };
    T.wrap = function (c, x) { if (x < c.total || !c.loop) return x; return c.loopRow + ((x - c.loopRow) % c.loopRows); };
    T.active = function (kind, cl) {
      if (cl == null) cl = T.clock;
      for (var i = T.plan.length - 1; i >= 0; i--) { var s = T.plan[i]; if (s.kind === kind && s.c0 <= cl + 1e-6 && cl < s.cEnd) return s; }
      return null;
    };
    T.pending = function (kind) { for (var i = T.plan.length - 1; i >= 0; i--) { var s = T.plan[i]; if (s.kind === kind && s.c0 > T.clock + 1e-6) return s; } return null; };
    T.boundary = function (seg, cl, unitRows) {   // first clock >= cl on a multiple of unitRows (song rows, unwrapped)
      var x = T.rowAt(seg, cl), n = Math.ceil(x / unitRows - 1e-7) * unitRows;
      return seg.c0 + (n - seg.r0) * seg.rowMs;
    };
    T.unit = function (c, what) { return what === 'bar' ? c.rpb * c.bpb : what === 'row' ? 1 : what === 'now' ? 0 : c.rpb; };
    T.add = function (seg) { seg.id = ++T.seq; T.plan.push(seg); return seg; };
    T.cutFuture = function (kind, cl) { T.plan = T.plan.filter(function (s) { return !(s.c0 > cl + 1e-6 && (!kind || s.kind === kind)); }); };
    T.prune = function () { if (T.keep) return; var cl = T.clock; T.plan = T.plan.filter(function (s) { return s.cEnd > cl - 4000; }); T.ducks = T.ducks.filter(function (d) { return d.c1 > cl - 4000; }); };
    return T;
  }

  /* ---------------- live instance ---------------- */
  function normParams(p, base) {
    var o = Object.assign({}, base || DEFAULTS); p = p || {};
    o.volume = clamp(num(p.volume, o.volume), 0, 1);
    if (p.mute != null) o.mute = p.mute === true || p.mute === 'on' || p.mute === 'true' || p.mute === 1 || p.mute === '1';
    o.tempo = clamp(num(p.tempo, o.tempo), 0.5, 2);
    o.transpose = Math.round(clamp(num(p.transpose, o.transpose), -12, 12));
    if (p.jingleMode === 'pause' || p.jingleMode === 'duck') o.jingleMode = p.jingleMode;
    if (p.resume === 'beat' || p.resume === 'bar' || p.resume === 'row') o.resume = p.resume;
    if (p.at === 'beat' || p.at === 'bar' || p.at === 'row' || p.at === 'now') o.at = p.at;
    o.duck = clamp(num(p.duck, o.duck), 0, 1);
    return o;
  }

  function create(options) {
    options = options || {};
    var P = normParams(options.params || {});
    var lib = {}, compiled = {}, bufCache = {}, log = [], onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
    var S = { plays: 0, same: 0, switches: 0, jingles: 0, merged: 0, queued: 0, resumes: 0, loops: 0, stops: 0, unknown: 0, errors: 0, renders: 0, renderMs: 0, locked: true };
    Object.keys(SONGS).forEach(function (k) { lib[k] = SONGS[k]; });
    var extra = options.songs || {};
    Object.keys(extra).forEach(function (k) { lib[k] = extra[k]; });
    function C(name) {
      if (!lib[name]) return null;
      if (!compiled[name]) { compiled[name] = compile(lib[name], name); if (compiled[name].problems.length && root.console) { try { console.warn('GameDNA_ChipMusic: song "' + name + '": ' + compiled[name].problems.slice(0, 3).join('; ')); } catch (e) { } } }
      return compiled[name];
    }
    var T = Transport(C, P);
    var ctx = null, eng = null, listening = false, badge = null, unlockedAt = -1e9, sticky = null;
    function now() { return root.performance && performance.now ? performance.now() : Date.now(); }   // UI debounce only, never music state

    function record(ev) {
      ev.t = Math.round(T.clock);
      log.push(ev); if (log.length > 64) log.shift();
      if (onEvent) { try { onEvent(ev); } catch (e) { S.errors++; } }
      return ev;
    }
    function where(seg, cl) {
      var c = C(seg.track), x = T.wrap(c, Math.floor(T.rowAt(seg, cl) + 1e-6));
      return { row: x, bar: Math.floor(x / (c.rpb * c.bpb)) + 1, beat: Math.floor((x % (c.rpb * c.bpb)) / c.rpb) + 1 };
    }

    /* ----- audio ----- */
    function getBuffers(seg, rate) {
      var c = C(seg.track); if (!c) return null;
      var key = seg.track + '|' + seg.tempo + '|' + seg.transpose + '|' + rate;
      if (bufCache[key]) return bufCache[key];
      var t0 = Date.now(), s = synth(c, { sampleRate: rate, tempo: seg.tempo, transpose: seg.transpose }), buf = {};
      CH.forEach(function (ch) { var b = ctx.createBuffer(1, s.length, rate); b.getChannelData(0).set(s.ch[ch]); buf[ch] = b; });
      S.renders++; S.renderMs += Date.now() - t0;
      return (bufCache[key] = { buf: buf, rate: rate, rowSec: s.rowSec, total: s.total, loop: s.loop, loopRow: s.loopRow, loopRows: s.loopRows, loopStart: s.loopStart, length: s.length });
    }
    function running() { return !!(ctx && ctx.state === 'running' && eng); }
    function reconcile() {
      if (!running()) return;
      try {
        var cl = T.clock, ids = {};
        T.plan.forEach(function (seg) {
          ids[seg.id] = 1;
          if (seg.cEnd <= cl) { if (eng.sched[seg.id] && eng.sched[seg.id].cEnd !== seg.cEnd) eng.end(seg); return; }
          if (!eng.sched[seg.id]) eng.schedule(seg, cl); else eng.end(seg);
        });
        Object.keys(eng.sched).forEach(function (id) { if (!ids[id]) eng.kill(id); });
        eng.ducks(T.ducks, P.duck, cl);
        applyGains();
      } catch (e) { S.errors++; }
    }
    function applyGains() {
      if (!eng) return;
      try { eng.master.gain.setTargetAtTime(P.mute ? 0 : P.volume, ctx.currentTime, 0.02); } catch (e) { S.errors++; }
    }
    function ensure() {
      if (ctx) return ctx;
      var sfx = options.sfx;
      try {
        if (sfx && typeof sfx.context === 'function') {
          if (!sfx.context() && typeof sfx.unlock === 'function') sfx.unlock();
          var sc = sfx.context();
          if (sc) { ctx = sc; var mi = typeof sfx.musicInput === 'function' ? sfx.musicInput() : null; eng = Engine(ctx, mi || ctx.destination, getBuffers); }
        }
        if (!ctx) { var AC = AudioCtor(); if (!AC) return null; ctx = new AC({ latencyHint: 'interactive' }); eng = Engine(ctx, ctx.destination, getBuffers); }
        eng.master.gain.value = P.mute ? 0 : P.volume;
        applyChannels();
      } catch (e) { S.errors++; ctx = null; eng = null; }
      return ctx;
    }
    function onGesture() {
      try { if (root.navigator && navigator.userActivation && !navigator.userActivation.isActive) return; } catch (e) { }
      try { unlock(); } catch (e) { S.errors++; }
    }
    function listen() {
      if (listening || !root.addEventListener) return; listening = true;
      GESTURES.forEach(function (ev) { root.addEventListener(ev, onGesture, { capture: true, passive: true }); });
    }
    function stopListening() {
      if (!listening) return; listening = false;
      GESTURES.forEach(function (ev) { try { root.removeEventListener(ev, onGesture, { capture: true }); } catch (e) { } });
    }
    function startAudio() {
      if (!running() || !S.locked) return;
      S.locked = false; stopListening(); unlockedAt = now();
      eng.anchorCtx = ctx.currentTime + 0.05; eng.anchorClock = T.clock;
      reconcile();
      record({ type: 'unlocked' });
    }
    function unlock() {
      if (!AudioCtor() && !(options.sfx && options.sfx.context)) return false;
      if (!ensure()) return false;
      try {
        if (ctx.state !== 'running' && ctx.resume) { var pr = ctx.resume(); if (pr && pr.then) pr.then(function () { startAudio(); }, function () { }); }
        var b = ctx.createBuffer(1, 1, ctx.sampleRate), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch (e) { S.errors++; }
      startAudio();
      return running();
    }

    /* ----- clock ----- */
    function advance(dtMs) {
      var prev = T.clock;
      if (running() && !S.locked) {
        var c = eng.anchorClock + (ctx.currentTime - eng.anchorCtx) * 1000;
        if (c > T.clock) T.clock = c;
      } else T.clock += dtMs;
      if (T.clock > prev) passEvents(prev, T.clock);
    }
    // events the clock passes: segment starts (switch / resume / jingle start), jingle ends, loop wraps
    function passEvents(a, b) {
      T.plan.forEach(function (s) {
        if (s.c0 > a && s.c0 <= b && s.announce) { var w = where(s, s.c0); record({ type: s.announce, track: s.track, row: w.row, bar: w.bar, beat: w.beat }); if (s.announce === 'resume') S.resumes++; }
        if (s.kind === 'jingle' && s.cMusicEnd > a && s.cMusicEnd <= b) record({ type: 'jingle-end', track: s.track });
        if (s.kind === 'loop') {
          var c = C(s.track); if (!c || !c.loop) return;
          var lo = Math.max(a, s.c0), hi = Math.min(b, s.cEnd); if (hi <= lo) return;
          var ra = T.rowAt(s, lo), rb = T.rowAt(s, hi);
          var wa = ra < c.total ? -1 : Math.floor((ra - c.total) / c.loopRows), wb = rb < c.total ? -1 : Math.floor((rb - c.total) / c.loopRows);
          if (wb > wa) { S.loops += wb - wa; record({ type: 'loop', track: s.track, row: c.loopRow, bar: Math.floor(c.loopRow / (c.rpb * c.bpb)) + 1, beat: 1 }); }
        }
      });
      T.prune();
    }
    function update(dtMs) {
      try {
        var d = num(dtMs, 0); if (!(d > 0)) return;
        if (d > 250) d = 250;
        advance(d);
      } catch (e) { S.errors++; }
    }
    // commands bring the clock up to the audio clock first; while audio is off only update() moves it (deterministic)
    function touch() { if (running() && !S.locked) advance(0); }

    /* ----- commands ----- */
    function curLoop() { return T.active('loop'); }
    function curJingle() { return T.active('jingle'); }
    function quant(seg, what) {
      var cl = T.clock; if (!seg) return cl;
      var c = C(seg.track), u = T.unit(c, what);
      return u ? T.boundary(seg, cl, u) : cl;
    }
    function remember(seg, cl) {
      var c = C(seg.track); if (!c || !c.loop) return;
      var x = T.wrap(c, Math.ceil(T.rowAt(seg, cl) / c.rpb - 1e-7) * c.rpb);
      T.memo[seg.track] = x >= c.total ? c.loopRow : x;
    }
    function startRow(track, from) {
      var c = C(track);
      if (from === 'resume' && T.memo[track] != null) return T.memo[track];
      return 0;
    }
    function newLoop(track, c0, r0, announce) {
      var c = C(track);
      return T.add({ kind: 'loop', track: track, c0: c0, r0: r0, rowMs: T.rowMsOf(c, P.tempo), cEnd: Infinity, fadeOut: 14, tempo: P.tempo, transpose: P.transpose, announce: announce, fadeIn: r0 > 0 });
    }
    function play(track, o) {
      o = o || {}; touch(); S.plays++;
      var c = C(track);
      if (!c) { S.unknown++; return record({ type: 'unknown', track: String(track) }); }
      if (!c.loop) return jingle(track, o);
      var L = curLoop(), pend = T.pending('loop'), J = curJingle() || T.pending('jingle');
      // after a jingle, asking again for the loop it interrupted is the game repeating its current state, not a new
      // request: the jingle's `after` stays in charge until the game asks for any other track (also the after track
      // itself) or, for after: <track>, until that track has started. Cleared BEFORE the same-track test below, so a
      // later request for the interrupted track (the next battle) is a real switch again.
      if (sticky && (track !== sticky.track || T.clock >= sticky.until)) sticky = null;
      if (sticky && !o.restart) { S.same++; return { type: 'same', track: track, t: Math.round(T.clock) }; }
      var target = pend ? pend.track : L ? L.track : null;
      if (target === track && !o.restart) { S.same++; return { type: 'same', track: track, t: Math.round(T.clock) }; }
      if (J && J.pauses && T.clock < J.cMusicEnd) {
        // a jingle is pausing the loop: this track starts when the jingle ends (instead of the paused one resuming)
        T.cutFuture('loop', T.clock);
        newLoop(track, J.cMusicEnd, startRow(track, o.from), 'switch');
        S.queued++; reconcile();
        return record({ type: 'queued', track: track, after: J.track });
      }
      T.cutFuture('loop', T.clock);
      var at = o.at || (L ? P.at : 'now'), cs = L ? quant(L, at) : T.clock;
      if (L) { remember(L, cs); L.cEnd = cs; L.fadeOut = num(o.fade, 14); }
      var seg = newLoop(track, cs, startRow(track, o.from), cs > T.clock + 1e-6 ? 'switch' : null);
      S.switches++; reconcile();
      var w = where(seg, cs);
      return record({ type: cs > T.clock + 1e-6 ? 'queued' : 'switch', track: track, row: w.row, bar: w.bar, beat: w.beat, at: Math.round(cs) });
    }
    function jingle(name, o) {
      o = o || {}; touch();
      var c = C(name);
      if (!c) { S.unknown++; return record({ type: 'unknown', track: String(name) }); }
      var J = curJingle() || T.pending('jingle');
      if (J && J.track === name && T.clock - J.c0 < 400) { S.merged++; return { type: 'merged', track: name, t: Math.round(T.clock) }; }
      var La = curLoop(), Lp = T.pending('loop'), L = La || Lp, mode = o.mode || P.jingleMode;
      var cs = La ? quant(La, o.at || 'row') : T.clock;
      if (J) { if (J.c0 > T.clock) T.plan = T.plan.filter(function (s) { return s !== J; }); else J.cEnd = Math.min(J.cEnd, cs); }
      var rowMs = T.rowMsOf(c, P.tempo), musEnd = cs + c.total * rowMs;
      var seg = T.add({ kind: 'jingle', track: name, c0: cs, r0: 0, rowMs: rowMs, cMusicEnd: musEnd, cEnd: musEnd + 450, fadeOut: 60, tempo: P.tempo, transpose: P.transpose, announce: cs > T.clock + 1e-6 ? 'jingle-start' : null, pauses: mode === 'pause' });
      // the loop the game had asked for when the jingle came (a switch still waiting for its beat counts)
      S.jingles++; seg.interrupted = Lp ? Lp.track : La ? La.track : null;
      sticky = seg.interrupted ? { track: seg.interrupted, until: Infinity } : null;
      // after: 'resume' (default: the paused loop comes back on a beat), 'stop' (silence), or a track name
      var after = o.after != null ? o.after : o.then !== undefined ? (o.then || 'stop') : 'resume';
      var then = after === 'resume' ? undefined : after === 'stop' ? null : after, rec = { type: 'jingle', track: name, mode: mode, at: Math.round(cs) };
      if (sticky && then && then !== sticky.track) sticky.until = mode === 'pause' ? musEnd : T.boundary(La || { c0: cs, r0: 0, rowMs: rowMs }, musEnd, c.rpb);
      if (mode === 'pause') {
        T.cutFuture('loop', T.clock);
        var resumeRow = null;
        if (La) {
          La.cEnd = cs; La.fadeOut = 20;
          var rp = T.rowAt(La, cs), lc = C(La.track), u = T.unit(lc, o.resume || P.resume) || 1, rr = Math.ceil(rp / u - 1e-7) * u;
          rec.pausedRow = Math.round(T.wrap(lc, Math.floor(rp + 1e-6)));
          resumeRow = T.wrap(lc, rr); if (resumeRow >= lc.total) resumeRow = lc.loopRow;
        }
        if (then === undefined || (then && then === seg.interrupted)) {
          if (Lp) { newLoop(Lp.track, musEnd, Lp.r0, 'switch'); rec.then = Lp.track; }          // the waiting switch happens after the jingle
          else if (La) { newLoop(La.track, musEnd, resumeRow, 'resume'); rec.resumeRow = resumeRow; rec.resumeAt = Math.round(musEnd); }
        } else if (then) { if (La) remember(La, cs); newLoop(then, musEnd, startRow(then, o.from), 'switch'); rec.then = then; }
      } else {
        // duck: the loop keeps playing under the jingle and comes back up on its first beat after the jingle
        if (La) {
          var back = T.boundary(La, musEnd, C(La.track).rpb);
          T.ducks.push({ c0: cs, c1: back }); rec.restoreAt = Math.round(back);
          if (then === null) { T.cutFuture('loop', T.clock); La.cEnd = musEnd; La.fadeOut = 250; }
          else if (then && then !== La.track) { T.cutFuture('loop', T.clock); remember(La, back); La.cEnd = back; newLoop(then, back, startRow(then, o.from), 'switch'); }
        } else if (then) { T.cutFuture('loop', T.clock); newLoop(then, musEnd, startRow(then, o.from), 'switch'); }
      }
      reconcile();
      return record(rec);
    }
    function stop(o) {
      o = o || {}; touch(); S.stops++; sticky = null;
      var L = curLoop(), J = curJingle(), cs = o.at && L ? quant(L, o.at) : T.clock, f = num(o.fade, 250);
      T.cutFuture(null, T.clock);
      if (L) { remember(L, cs); L.cEnd = cs; L.fadeOut = f; }
      if (J) { J.cEnd = cs; J.fadeOut = f; }
      T.ducks = [];
      reconcile();
      return record({ type: 'stop', at: Math.round(cs) });
    }
    function setParams(p) {
      try {
        touch();
        var old = P; P = normParams(p || {}, old); T.P = P;
        if (P.tempo !== old.tempo || P.transpose !== old.transpose) {
          // re-voice the playing loop from its next beat (a new segment with the new tempo / key)
          var L = curLoop();
          T.cutFuture('loop', T.clock);
          if (L) {
            var cs = quant(L, 'beat'), lc = C(L.track), x = T.wrap(lc, Math.round(T.rowAt(L, cs)));
            L.cEnd = cs; L.fadeOut = 10;
            var s = newLoop(L.track, cs, x >= lc.total ? lc.loopRow : x, null); s.fadeIn = true;
          }
          reconcile();
        }
        applyGains();
      } catch (e) { S.errors++; }
      return params();
    }
    function params() { return Object.assign({}, P); }
    function mute(on) { setParams({ mute: on == null ? !P.mute : !!on }); return P.mute; }
    var chanState = { p1: 1, p2: 1, tri: 1, noise: 1 };
    function applyChannels() {
      if (!eng) return;
      CH.forEach(function (c) { ['loop', 'jingle'].forEach(function (b) { try { eng.chan[b][c].gain.setTargetAtTime(chanState[c], ctx.currentTime, 0.015); } catch (e) { } }); });
    }
    function channels(map) {
      if (map) CH.forEach(function (c) { if (map[c] != null) chanState[c] = clamp(num(map[c], 1), 0, 1); });
      applyChannels(); return Object.assign({}, chanState);
    }
    function addSong(name, data) {
      var v = validate(data); if (!name) return { ok: false, problems: ['no name'] };
      lib[name] = data; delete compiled[name];
      Object.keys(bufCache).forEach(function (k) { if (k.indexOf(name + '|') === 0) delete bufCache[k]; });
      return v;
    }

    /* ----- state (pure: plan + clock) ----- */
    function chanView(seg, cl) {
      var c = C(seg.track), x = T.rowAt(seg, cl), xr = T.wrap(c, x), row = Math.floor(xr + 1e-6), out = [];
      if (!c.loop && x >= c.total) row = c.total;   // a jingle past its last row: only release tails
      CH.forEach(function (ch) {
        var evs = c.ev[ch], e = null, i;
        for (i = 0; i < evs.length; i++) { if (evs[i].row <= row) e = evs[i]; else break; }
        var o = { ch: ch, label: CH_LABEL[ch], note: null, midi: null, drum: null, level: 0, duty: c.inst[ch].duty || null, fx: null, row: row };
        if (e && row < e.end && row < c.total) {
          var tIn = (xr - e.row) * seg.rowMs / 1000, I = c.inst[ch];
          if (e.k === 'note') {
            o.midi = e.midi + seg.transpose; o.note = midiName(o.midi);
            if (e.fx.arp) { var tk = Math.floor(tIn * TICK); o.sounding = o.midi + e.fx.arp[tk % e.fx.arp.length]; o.fx = 'arp'; }
            else if (e.fx.slide != null) { var dur = (e.end - e.row) * seg.rowMs / 1000; o.sounding = o.midi + (e.fx.slide - e.midi) * clamp(Math.floor(tIn * TICK) / Math.max(1, Math.floor(dur * TICK * 0.85)), 0, 1); o.fx = 'slide'; }
            else { o.sounding = o.midi; if (e.fx.vib) o.fx = 'vibrato'; }
            var dec = num(I.decay, 0), sus = clamp(num(I.sustain, 1), 0, 1);
            o.level = (e.fx.acc || 1) * (dec > 0 ? sus + (1 - sus) * Math.exp(-tIn / dec) : 1);
            o.start = e.row; o.end = e.end;
          } else if (e.k === 'drum') {
            o.drum = e.drum; o.note = DRUMS[e.drum];
            var tau = { k: 0.11, s: 0.09, h: 0.028, o: 0.15, c: 0.55 }[e.drum];
            o.level = e.acc * Math.exp(-tIn / tau); o.start = e.row; o.end = e.end;
          }
        }
        out.push(o);
      });
      return out;
    }
    function segInfo(seg, cl) {
      var c = C(seg.track), x = T.rowAt(seg, cl), xr = T.wrap(c, x), row = Math.floor(xr + 1e-6);
      var pi = 0; for (var i = 0; i < c.starts.length; i++) if (c.starts[i] <= row) pi = i;
      return { track: seg.track, title: c.title, kind: seg.kind, row: row, rowF: Math.round(xr * 1000) / 1000, total: c.total, loopRow: c.loopRow, bpm: Math.round(c.bpm * seg.tempo * 10) / 10, rpb: c.rpb, bpb: c.bpb,
        bar: Math.floor(row / (c.rpb * c.bpb)) + 1, beat: Math.floor((row % (c.rpb * c.bpb)) / c.rpb) + 1, step: row % c.rpb, pattern: c.order[pi], orderIx: pi,
        pass: x < c.total ? 0 : Math.floor((x - c.total) / Math.max(1, c.loopRows)) + 1, startedAt: Math.round(seg.c0), endsAt: isFinite(seg.cEnd) ? Math.round(seg.cEnd) : null,
        progress: c.loop ? null : clamp(x / c.total, 0, 1), transpose: seg.transpose, tempo: seg.tempo, channels: chanView(seg, cl) };
    }
    function state(atClock) {
      var cl = atClock == null ? T.clock : atClock;
      var L = T.active('loop', cl), J = T.active('jingle', cl), nextL = null, i;
      for (i = 0; i < T.plan.length; i++) { var s = T.plan[i]; if (s.kind === 'loop' && s.c0 > cl + 1e-6 && (!nextL || s.c0 < nextL.c0)) nextL = s; }
      var ducked = false; T.ducks.forEach(function (d) { if (cl >= d.c0 && cl < d.c1) ducked = true; });
      var Jm = J && cl < J.cMusicEnd ? J : null;
      var o = { t: Math.round(cl), clock: Math.round(cl * 10) / 10, locked: S.locked, muted: P.mute, volume: P.volume, audio: ctx ? ctx.state : (AudioCtor() ? 'not-created' : 'unsupported'),
        phase: Jm ? (Jm.pauses ? 'jingle' : 'jingle-duck') : L ? 'loop' : nextL ? 'waiting' : 'stopped',
        loop: L ? segInfo(L, cl) : null, jingle: Jm ? segInfo(Jm, cl) : null, ducked: ducked,
        next: nextL ? { track: nextL.track, at: Math.round(nextL.c0), row: nextL.r0, inMs: Math.round(nextL.c0 - cl), kind: nextL.announce || 'start' } : null };
      var src = o.jingle || o.loop;
      o.track = src ? src.track : null;
      o.channels = src ? src.channels : CH.map(function (ch) { return { ch: ch, label: CH_LABEL[ch], note: null, level: 0 }; });
      if (o.jingle && o.loop && ducked) o.loop.channels.forEach(function (x) { x.level *= P.duck; });
      return o;
    }

    /* ----- badge: speaker + 4 channel meters (native px, any canvas) ----- */
    function draw(g, x, y, opts) {
      try {
        opts = opts || {}; var s = Math.max(1, Math.round(num(opts.scale, 1))), st = state(), w = 23 * s, h = 11 * s;
        x = Math.round(num(x, 4)); y = Math.round(num(y, 4));
        badge = { x: x, y: y, w: w, h: h };
        g.save(); g.globalAlpha = 1;
        g.fillStyle = 'rgba(12,8,24,0.78)'; g.fillRect(x + s, y, w - 2 * s, h); g.fillRect(x, y + s, w, h - 2 * s);
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x + s, y, w - 2 * s, s);
        var off = st.muted || st.locked, sp = off ? '#8a84a0' : '#f4f0ff';
        // speaker
        g.fillStyle = sp; g.fillRect(x + 2 * s, y + 4 * s, 2 * s, 3 * s); g.fillRect(x + 4 * s, y + 3 * s, s, 5 * s); g.fillRect(x + 5 * s, y + 2 * s, s, 7 * s);
        if (st.muted) { g.fillStyle = '#ff5a6a'; for (var k = 0; k < 5; k++) { g.fillRect(x + (1 + k) * s + s, y + (3 + k) * s, s, s); g.fillRect(x + (5 - k) * s + s, y + (3 + k) * s, s, s); } }
        // meters
        var cols = { p1: '#5ee6ff', p2: '#ff7ad9', tri: '#ffc44d', noise: '#e8e4f4' };
        st.channels.forEach(function (c, i) {
          var lv = off ? 0 : clamp(c.level || 0, 0, 1), n = Math.max(1, Math.round(lv * 7)), bx = x + (9 + i * 3) * s;
          g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(bx, y + 2 * s, 2 * s, 7 * s);
          g.fillStyle = off ? '#6a6480' : cols[c.ch]; g.fillRect(bx, y + (9 - n) * s, 2 * s, n * s);
        });
        if (st.locked && !st.muted) { // a small blinking dot: waiting for the first click / key
          if (Math.floor(st.t / 500) % 2 === 0) { g.fillStyle = '#ffd24a'; g.fillRect(x + 20 * s, y + 2 * s, s, s); }
        }
        g.restore();
      } catch (e) { S.errors++; }
      return badge;
    }
    // a sound on/off control: the click that started audio (the module's own capture-phase gesture listener runs before
    // any page handler) only starts it; later clicks toggle mute. Returns the mute state.
    function toggle() {
      if (S.locked) unlock(); else if (now() - unlockedAt > 400) mute();
      return P.mute;
    }
    function hit(px, py) {
      if (!badge || px < badge.x || py < badge.y || px >= badge.x + badge.w || py >= badge.y + badge.h) return false;
      toggle();
      return true;
    }

    function stats() { var o = Object.assign({}, S); o.state = ctx ? ctx.state : (AudioCtor() ? 'not-created' : 'unsupported'); o.segments = T.plan.length; o.scheduled = eng ? Object.keys(eng.sched).length : 0; return o; }
    function recent(n) { return log.slice(-Math.max(1, num(n, 8))).map(function (e) { return Object.assign({}, e); }); }
    function destroy() { stopListening(); try { if (eng) Object.keys(eng.sched).forEach(eng.kill); if (ctx && ctx.close && !options.sfx) ctx.close(); } catch (e) { } ctx = null; eng = null; }

    if (!options.offline) {
      listen();
      try { if (root.navigator && navigator.userActivation && navigator.userActivation.hasBeenActive) unlock(); } catch (e) { }
    } else T.keep = true;

    function safe(f) { return function () { try { return f.apply(null, arguments); } catch (e) { S.errors++; return null; } }; }
    return {
      update: update, play: safe(play), jingle: safe(jingle), stop: safe(stop), setParams: setParams, params: params, mute: mute,
      volume: function (v) { return setParams({ volume: v }).volume; }, channels: channels, addSong: addSong,
      songs: function () { return Object.keys(lib).map(function (k) { var c = C(k); return { name: k, title: c.title, kind: c.kind, bpm: c.bpm, rows: c.total, seconds: Math.round(c.total * 60 / c.bpm / c.rpb * 100) / 100, problems: c.problems.length }; }); },
      song: function (name) { return C(name); },
      state: function (atClock) { try { if (atClock == null && running() && !S.locked) advance(0); return state(atClock); } catch (e) { S.errors++; return null; } },
      draw: draw, hit: hit, toggle: function () { try { return toggle(); } catch (e) { S.errors++; return P.mute; } }, lastDrawn: function () { return badge ? [Object.assign({ owner: null, kind: 'badge' }, badge)] : []; },
      unlock: function () { try { return unlock(); } catch (e) { S.errors++; return false; } }, isUnlocked: function () { return running() && !S.locked; },
      stats: stats, recent: recent, context: function () { return ctx; }, destroy: destroy,
      __gain: function () { return eng ? eng.master.gain.value : null; },
      // the schedule (for visualizers): segments {kind, track, c0, r0, rowMs, cEnd, cMusicEnd, announce, interrupted} on the music clock
      plan: function () { return T.plan.map(function (s) { return Object.assign({}, s); }); },
      ducks: function () { return T.ducks.map(function (d) { return Object.assign({}, d); }); },
      _plan: function () { return T.plan.map(function (s) { return Object.assign({}, s); }); },
      _ducks: function () { return T.ducks.map(function (d) { return Object.assign({}, d); }); }
    };
  }

  /* ---------------- offline render (checks) ----------------
   * render({track, ms, sampleRate, tempo, transpose, actions: [{t, op: 'play'|'jingle'|'stop', name, opts}], solo: 'p1',
   *         bus: 'loop'|'jingle'|'all', unrolled: passes}) -> Promise<{left, right, rate, plan, events, states}>
   * It drives a real instance's transport with a stepped clock and builds the SAME engine graph in an
   * OfflineAudioContext. unrolled: N renders the song N passes as one straight synth run (the reference for seam checks).
   */
  function render(spec) {
    spec = spec || {};
    var OAC = OfflineCtor(); if (!OAC) return Promise.resolve(null);
    try {
      var sr = spec.sampleRate || 48000, ms = num(spec.ms, 4000), len = Math.ceil(ms / 1000 * sr);
      var oc = new OAC(2, len, sr);
      var inst = create({ offline: true, params: Object.assign({ volume: 1 }, spec.params || {}, { tempo: num(spec.tempo, 1), transpose: num(spec.transpose, 0) }), songs: spec.songs });
      var acts = (spec.actions || []).slice().sort(function (a, b) { return a.t - b.t; }), states = [];
      if (spec.track) acts.unshift({ t: 0, op: 'play', name: spec.track, opts: { at: 'now' } });
      var step = num(spec.step, 1000 / 60), cl = 0, ai = 0;
      var plan = null, events = [];
      // step the clock, issue actions at their times (each action lands on the step at or after its t, like a game)
      while (cl <= ms + 1) {
        while (ai < acts.length && acts[ai].t <= cl + 1e-9) {
          var a = acts[ai++], r = a.op === 'jingle' ? inst.jingle(a.name, a.opts) : a.op === 'stop' ? inst.stop(a.opts) : a.op === 'params' ? inst.setParams(a.opts) : inst.play(a.name, a.opts);
          if (r) events.push(r);
        }
        if (spec.sample && Math.abs((cl % spec.sample)) < step / 2) states.push(inst.state());
        inst.update(step); cl += step;
      }
      plan = inst._plan();
      var lib = function (name) { return inst.song(name); };
      var cache = {};
      var eng = Engine(oc, oc.destination, function (seg, rate) {
        var c = lib(seg.track); if (!c) return null;
        var key = seg.track + '|' + seg.tempo + '|' + seg.transpose;
        if (cache[key]) return cache[key];
        var s = synth(c, { sampleRate: rate, tempo: seg.tempo, transpose: seg.transpose }), buf = {};
        if (spec.unrolled) {
          // reference: N passes as one straight run of the synth (no buffer looping), played once
          var cu = Object.assign({}, c), ev = {}, passes = spec.unrolled;
          CH.forEach(function (ch) {
            var out = [];
            c.ev[ch].forEach(function (e) { if (e.row < c.loopRow) out.push(Object.assign({}, e)); });
            for (var p = 0; p < passes; p++) c.ev[ch].forEach(function (e) { if (e.row >= c.loopRow) { var x = Object.assign({}, e); x.row += p * c.loopRows; x.end += p * c.loopRows; out.push(x); } });
            ev[ch] = out;
          });
          cu.ev = ev; cu.total = c.loopRow + passes * c.loopRows; cu.loop = false;
          var su = synth(cu, { sampleRate: rate, tempo: seg.tempo, transpose: seg.transpose, rowLen: s.rowLen });
          CH.forEach(function (ch) { var b = oc.createBuffer(1, su.length, rate); b.getChannelData(0).set(su.ch[ch]); buf[ch] = b; });
          return (cache[key] = { buf: buf, rate: rate, rowSec: su.rowSec, total: cu.total, loop: false, loopRow: 0, loopRows: 0, loopStart: 0, length: su.length });
        }
        CH.forEach(function (ch) { var b = oc.createBuffer(1, s.length, rate); b.getChannelData(0).set(s.ch[ch]); buf[ch] = b; });
        return (cache[key] = { buf: buf, rate: rate, rowSec: s.rowSec, total: s.total, loop: s.loop, loopRow: s.loopRow, loopRows: s.loopRows, loopStart: s.loopStart, length: s.length });
      });
      eng.anchorCtx = 0; eng.anchorClock = 0; eng.offline = true;
      eng.master.gain.value = num((spec.params || {}).volume, 1);
      if (spec.solo) CH.forEach(function (c) { eng.chan.loop[c].gain.value = c === spec.solo ? 1 : 0; eng.chan.jingle[c].gain.value = c === spec.solo ? 1 : 0; });
      if (spec.bus === 'loop') eng.jingleBus.gain.value = 0; else if (spec.bus === 'jingle') eng.loopBus.gain.value = 0;
      plan.forEach(function (seg) { eng.schedule(seg, seg.c0); });
      eng.ducks(inst._ducks(), inst.params().duck, -1);
      return oc.startRendering().then(function (buf) {
        return { rate: sr, length: buf.length, left: buf.getChannelData(0), right: buf.getChannelData(1), plan: plan, events: events, states: states, finalState: inst.state() };
      });
    } catch (e) { return Promise.resolve({ error: String(e && e.stack || e) }); }
  }

  root.GameDNA_ChipMusic = {
    version: VERSION, channels: CH.slice(), drums: Object.assign({}, DRUMS), defaults: Object.assign({}, DEFAULTS),
    songs: JSON.parse(JSON.stringify(SONGS)),
    create: create, compile: compile, validate: validate, synth: synth, render: render, midiName: midiName, midiHz: midiHz, parseToken: parseToken,
    supported: function () { return !!AudioCtor(); }
  };
})(typeof window !== 'undefined' ? window : this);
