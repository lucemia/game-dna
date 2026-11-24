/* GameDNA F-02 procedural sound effects - v1.0.0
 * One classic script, no dependencies, one global: GameDNA_Sfx. ASCII only.
 *
 * Every sound is synthesized with WebAudio at play time (oscillators, seeded noise buffers, envelopes, pitch slides,
 * biquad filters, simple FM). Nothing is loaded. Each preset is a pure recipe: describe(preset, seed, params) returns
 * the same layer list for the same seed, and the same builder schedules it into a live AudioContext (play) or an
 * OfflineAudioContext (render), so what the checks measure is what the player hears.
 *
 *   var sfx = GameDNA_Sfx.create({seed: 7, params: {master: 0.8, variation: 0.5}});
 *   sfx.play('jump');                 // at the code that DECIDES the event (never in a per-frame condition)
 *   sfx.play('hit', {pan: -0.4});     // pan -1..1, or {x, width} to pan from a screen x
 *   sfx.walk('hero', dxPx, grounded); // footsteps every params.stride px of ground travel
 *   sfx.update(stepMs);               // in the fixed step (module clock for merges; optional)
 *
 * The module never touches game state, never consumes the game's random numbers, never reads or blocks input
 * (it only listens, passively, for the first pointer / key / touch to unlock audio), and never throws: without
 * WebAudio every call is a silent no-op that still logs its event.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var PRESETS = ['hit', 'crit', 'coin', 'jump', 'land', 'menu-move', 'menu-confirm', 'menu-cancel', 'explosion', 'laser', 'powerup', 'heal', 'footstep', 'hurt'];
  var ALIASES = { shot: 'laser', shoot: 'laser', pickup: 'coin', select: 'menu-move', move: 'menu-move', confirm: 'menu-confirm', ok: 'menu-confirm',
    cancel: 'menu-cancel', back: 'menu-cancel', step: 'footstep', damage: 'hurt', boom: 'explosion', critical: 'crit', impact: 'hit' };
  // per preset: priority (voice stealing), merge gap in ms (same preset again inside it is merged), duck (lowers other sounds)
  var META = {
    'hit': { pri: 3, gap: 35, label: 'Hit', group: 'combat' },
    'crit': { pri: 5, gap: 60, duck: 0.25, label: 'Critical hit', group: 'combat' },
    'coin': { pri: 2, gap: 45, label: 'Coin', group: 'pickup' },
    'jump': { pri: 2, gap: 60, label: 'Jump', group: 'move' },
    'land': { pri: 1, gap: 80, label: 'Land', group: 'move' },
    'menu-move': { pri: 1, gap: 30, label: 'Menu move', group: 'ui' },
    'menu-confirm': { pri: 3, gap: 60, label: 'Menu confirm', group: 'ui' },
    'menu-cancel': { pri: 3, gap: 60, label: 'Menu cancel', group: 'ui' },
    'explosion': { pri: 6, gap: 90, duck: 0.6, label: 'Explosion', group: 'combat' },
    'laser': { pri: 2, gap: 40, label: 'Laser / shot', group: 'combat' },
    'powerup': { pri: 5, gap: 200, duck: 0.3, label: 'Power-up', group: 'pickup' },
    'heal': { pri: 4, gap: 150, label: 'Heal', group: 'pickup' },
    'footstep': { pri: 0, gap: 70, label: 'Footstep', group: 'move' },
    'hurt': { pri: 4, gap: 120, label: 'Hurt', group: 'combat' }
  };
  var DEFAULTS = { master: 0.8, sfx: 1, mute: false, maxVoices: 12, duck: 6, variation: 0.5, style: 'modern', pitch: 0, brightness: 1, length: 1, stride: 22, seed: 1 };
  var STYLES = ['modern', 'retro', 'soft'];

  /* ---------------- small helpers ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return v == null || v === '' || !isFinite(+v) ? d : +v; }
  function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mix(a, b) { var h = Math.imul((a >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b >>> 0) + 0x7f4a7c15, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return h >>> 0; }
  function rngOf(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function resolve(name) { name = String(name == null ? '' : name).toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-'); if (META[name]) return name; if (ALIASES[name]) return ALIASES[name]; if (name === 'menumove') return 'menu-move'; if (name === 'menuconfirm') return 'menu-confirm'; if (name === 'menucancel') return 'menu-cancel'; return null; }
  function normParams(p, base) {
    var o = {}, k, b = base || DEFAULTS; p = p || {};
    for (k in DEFAULTS) o[k] = b[k];
    o.master = clamp(num(p.master, o.master), 0, 1);
    o.sfx = clamp(num(p.sfx, o.sfx), 0, 1);
    o.mute = p.mute == null ? !!o.mute : (p.mute === true || p.mute === 'on' || p.mute === 'true' || p.mute === 1 || p.mute === '1');
    o.maxVoices = Math.round(clamp(num(p.maxVoices, o.maxVoices), 1, 32));
    o.duck = clamp(num(p.duck, o.duck), 0, 18);
    o.variation = clamp(num(p.variation, o.variation), 0, 1);
    o.style = STYLES.indexOf(p.style) >= 0 ? p.style : (STYLES.indexOf(o.style) >= 0 ? o.style : 'modern');
    o.pitch = clamp(num(p.pitch, o.pitch), -12, 12);
    o.brightness = clamp(num(p.brightness, o.brightness), 0.4, 1.6);
    o.length = clamp(num(p.length, o.length), 0.5, 1.6);
    o.stride = clamp(num(p.stride, o.stride), 4, 200);
    o.seed = num(p.seed, o.seed) >>> 0;
    return o;
  }

  /* ---------------- recipes ----------------
   * A patch = {preset, seed, dur, contour, layers:[layer]}. Times in seconds from the sound's start.
   * layer = {src: 'osc'|'noise', wave, color, f: [[t, hz, 'set'?]...], t0, a (attack), h (hold), end, g (peak gain),
   *          lp / hp / bp: {f: [[t, hz]...], q}, pan, vib: {rate, cents}, fm: {ratio, idx: [[t, index]...]}, off (noise offset s), pitch}
   * Envelope: 0 at t0, linear to g in a, hold h, exponential to -60 dB at end - 6 ms, linear to 0 at end (no clicks).
   */
  function recipe(preset, seed, P) {
    var rng = rngOf(mix(seed >>> 0, hashStr(preset))), V = P.variation;
    function vr(amount) { return 1 + (rng() * 2 - 1) * amount * V; }               // multiplicative variation
    var K = Math.pow(2, P.pitch / 12) * 1, B = P.brightness, L = P.length, st = P.style;
    function S(modern, retro, soft) { return st === 'retro' ? retro : st === 'soft' ? soft : modern; }
    var BR = S(1, 1.9, 0.62);                                                         // style brightness on tonal low-passes
    var layers = [];
    function osc(o) { o.src = 'osc'; layers.push(o); return o; }
    function noise(o) { o.src = 'noise'; o.off = V > 0 ? rng() * 1.5 : 0.25; layers.push(o); return o; }
    function F(pts, k) { return pts.map(function (p) { return p.length > 2 ? [p[0] * L, p[1] * k, p[2]] : [p[0] * L, p[1] * k]; }); }
    function T(x) { return x * L; }
    var k, dur, contour = null;
    switch (preset) {
      case 'hit':
        k = K * vr(0.09);
        osc({ wave: 'sine', f: F([[0, 175], [0.09, 52]], k), a: 0.002, end: T(0.16), g: 0.85 });
        osc({ wave: S('triangle', 'square', 'sine'), f: F([[0, 430], [0.045, 120]], k), a: 0.001, end: T(0.07), g: 0.26, lp: { f: [[0, 2600 * B * BR]], q: 0.7 } });
        noise({ color: 'white', a: 0.001, end: T(0.085), g: 0.62 * vr(0.15), bp: { f: F([[0, 2700 * B * vr(0.18)], [0.06, 1150 * B]], 1), q: 0.85 } });
        noise({ color: 'pink', a: 0.002, end: T(0.16), g: 0.22, lp: { f: [[0, 1100 * B]], q: 0.5 } });
        dur = T(0.17); break;
      case 'crit':
        k = K * vr(0.06);
        osc({ wave: 'sine', f: F([[0, 150], [0.22, 38]], k), a: 0.002, end: T(0.3), g: 0.9 });
        osc({ wave: S('triangle', 'square', 'sine'), f: F([[0, 520], [0.06, 130]], k), a: 0.001, end: T(0.09), g: 0.28, lp: { f: [[0, 3000 * B * BR]], q: 0.7 } });
        noise({ color: 'white', a: 0.001, end: T(0.12), g: 0.7, bp: { f: F([[0, 3400 * B * vr(0.15)], [0.1, 1300 * B]], 1), q: 0.8 } });
        noise({ color: 'pink', a: 0.002, end: T(0.26), g: 0.3, lp: { f: [[0, 1600 * B], [0.2, 500 * B]], q: 0.5 } });
        osc({ wave: 'sine', f: F([[0, 1560]], k), t0: T(0.012), a: 0.002, end: T(0.52), g: 0.2, hp: { f: [[0, 500]], q: 0.7 }, fm: { ratio: 2.76, idx: [[0, 3.2], [T(0.3), 0.25]] }, pan: -0.12 });
        osc({ wave: 'sine', f: F([[0, 2349]], k), t0: T(0.02), a: 0.002, end: T(0.4), g: 0.1, pan: 0.15 });
        dur = T(0.53); break;
      case 'coin':
        k = K * vr(0.03);
        osc({ wave: S('square', 'square', 'triangle'), f: F([[0, 988]], k), a: 0.002, h: T(0.05), end: T(0.085), g: 0.2, lp: { f: [[0, 4200 * B * BR]], q: 0.6 }, pitch: true });
        osc({ wave: S('square', 'square', 'triangle'), f: F([[0, 1319]], k), t0: T(0.072), a: 0.002, h: T(0.04), end: T(0.42), g: 0.21, lp: { f: [[0, 5000 * B * BR], [T(0.3), 2200 * B * BR]], q: 0.6 }, pitch: true });
        osc({ wave: 'sine', f: F([[0, 2638]], k), t0: T(0.074), a: 0.004, end: T(0.3), g: 0.05 });
        osc({ wave: 'sine', f: F([[0, 659.5]], k), t0: T(0.072), a: 0.003, end: T(0.22), g: 0.08 });
        dur = T(0.43); contour = 'up'; break;
      case 'jump':
        k = K * vr(0.07);
        osc({ wave: S('square', 'square', 'triangle'), f: F([[0, 185], [0.13, 560]], k), a: 0.003, h: T(0.02), end: T(0.2), g: 0.27, lp: { f: [[0, 1500 * B * BR], [T(0.13), 4000 * B * BR]], q: 0.7 }, pitch: true });
        osc({ wave: 'sine', f: F([[0, 92], [0.12, 210]], k), a: 0.003, end: T(0.12), g: 0.42 });
        noise({ color: 'white', a: T(0.02), end: T(0.17), g: 0.07, lp: { f: [[0, 1400 * B], [T(0.15), 6000 * B]], q: 0.5 }, hp: { f: [[0, 700]], q: 0.5 } });
        dur = T(0.21); contour = 'up'; break;
      case 'land':
        k = K * vr(0.1);
        osc({ wave: 'sine', f: F([[0, 118], [0.07, 47]], k), a: 0.002, end: T(0.13), g: 0.75 });
        noise({ color: 'brown', a: 0.002, end: T(0.12), g: 0.75 * vr(0.15), lp: { f: [[0, 950 * B], [T(0.1), 280 * B]], q: 0.5 } });
        noise({ color: 'white', a: 0.001, end: T(0.028), g: 0.13, bp: { f: [[0, 1900 * B * vr(0.2)]], q: 1.2 } });
        dur = T(0.14); break;
      case 'menu-move':
        k = K * vr(0.025);
        osc({ wave: S('triangle', 'square', 'sine'), f: F([[0, 1320]], k), a: 0.001, end: T(0.045), g: 0.62, lp: { f: [[0, 6500 * B * BR]], q: 0.5 } });
        osc({ wave: 'sine', f: F([[0, 660]], k), a: 0.001, end: T(0.04), g: 0.5 });
        dur = T(0.05); break;
      case 'menu-confirm':
        k = K * vr(0.02);
        osc({ wave: S('triangle', 'square', 'sine'), f: F([[0, 880]], k), a: 0.002, h: T(0.03), end: T(0.095), g: 0.24, lp: { f: [[0, 6000 * B * BR]], q: 0.5 }, pitch: true });
        osc({ wave: S('triangle', 'square', 'sine'), f: F([[0, 1318.5]], k), t0: T(0.07), a: 0.002, h: T(0.04), end: T(0.33), g: 0.26, lp: { f: [[0, 6000 * B * BR], [T(0.25), 2600 * B * BR]], q: 0.5 }, pitch: true });
        osc({ wave: 'sine', f: F([[0, 2637]], k), t0: T(0.072), a: 0.003, end: T(0.3), g: 0.05, fm: { ratio: 3.5, idx: [[0, 1.2], [T(0.25), 0.05]] } });
        dur = T(0.34); contour = 'up'; break;
      case 'menu-cancel':
        k = K * vr(0.02);
        osc({ wave: S('triangle', 'square', 'triangle'), f: F([[0, 587]], k), a: 0.002, h: T(0.025), end: T(0.085), g: 0.24, lp: { f: [[0, 3200 * B * BR]], q: 0.5 }, pitch: true });
        osc({ wave: S('triangle', 'square', 'triangle'), f: F([[0, 392]], k), t0: T(0.068), a: 0.002, h: T(0.02), end: T(0.23), g: 0.26, lp: { f: [[0, 2400 * B * BR], [T(0.2), 1200 * B * BR]], q: 0.5 }, pitch: true });
        dur = T(0.24); contour = 'down'; break;
      case 'explosion':
        k = K * vr(0.08);
        noise({ color: 'brown', a: 0.004, h: T(0.03), end: T(1.15), g: 0.78, lp: { f: [[0, 2600 * B * vr(0.15)], [T(0.25), 700 * B], [T(1.0), 150 * B]], q: 0.6 } });
        noise({ color: 'pink', a: 0.002, end: T(0.5), g: 0.3, lp: { f: [[0, 5200 * B], [T(0.3), 900 * B]], q: 0.5 } });
        osc({ wave: 'sine', f: F([[0, 74], [0.5, 30]], k), a: 0.004, end: T(0.75), g: 0.62 });
        noise({ color: 'brown', t0: T(0.04), a: T(0.06), h: T(0.12), end: T(1.18), g: 0.42, lp: { f: [[0, 420 * B], [T(1.0), 140 * B]], q: 0.5 } });   // rumble tail
        for (var gi = 0, gn = 6 + Math.floor(rng() * 3 * V + (V > 0 ? 0 : 1)); gi < gn; gi++) {
          var gt = T(0.05 + (V > 0 ? rng() : (gi + 0.5) / gn) * 0.55);
          noise({ color: 'white', t0: gt, a: 0.001, end: gt + T(0.028 + 0.03 * (V > 0 ? rng() : 0.5)), g: 0.16 + 0.08 * (V > 0 ? rng() : 0.5),
            bp: { f: [[0, (1800 + 2600 * (V > 0 ? rng() : gi / gn)) * B]], q: 1.6 }, pan: (V > 0 ? rng() * 2 - 1 : (gi % 2 ? 0.5 : -0.5)) * 0.5 });
        }
        dur = T(1.2); break;
      case 'laser':
        k = K * vr(0.08);
        osc({ wave: S('square', 'square', 'triangle'), f: F([[0, 1500], [0.15, 190]], k), a: 0.002, end: T(0.19), g: 0.45, lp: { f: [[0, 6000 * B * BR], [T(0.15), 1800 * B * BR]], q: 0.8 }, pitch: true });
        osc({ wave: S('sawtooth', 'square', 'sine'), f: F([[0, 1515], [0.15, 192]], k), a: 0.002, end: T(0.16), g: 0.18, lp: { f: [[0, 4200 * B * BR], [T(0.12), 1200 * B * BR]], q: 0.6 } });
        noise({ color: 'white', a: 0.001, end: T(0.022), g: 0.25, hp: { f: [[0, 2800]], q: 0.6 } });
        dur = T(0.2); contour = 'down'; break;
      case 'powerup':
        k = K * vr(0.03);
        // a rising pentatonic arpeggio: one short layer per note (own attack / release, no stepped pitch = no clicks), the last one rings
        [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2].forEach(function (r, i) {
          var lastN = i === 5, t0n = T(i * 0.052);
          osc({ wave: S('square', 'square', 'triangle'), f: F([[0, 523.25 * r]], k), t0: t0n, a: 0.003, h: lastN ? T(0.12) : T(0.03), end: t0n + (lastN ? T(0.36) : T(0.11)), g: lastN ? 0.15 : 0.13,
            lp: { f: [[0, (3600 + i * 300) * B * BR]], q: 0.5 }, vib: lastN ? { rate: 6.5, cents: 14 } : null, pitch: true });
          osc({ wave: 'triangle', f: F([[0, 523.25 * r * 2.003]], k), t0: t0n, a: 0.003, end: t0n + (lastN ? T(0.3) : T(0.08)), g: 0.05 });
        });
        osc({ wave: 'triangle', f: F([[0, 262], [0.32, 1046]], k), a: 0.01, end: T(0.38), g: 0.12 });
        osc({ wave: 'sine', f: F([[0, 2093]], k), t0: T(0.3), a: 0.012, end: T(0.62), g: 0.05, fm: { ratio: 2.0, idx: [[0, 1.5], [T(0.3), 0.1]] } });
        dur = T(0.63); contour = 'up'; break;
      case 'heal':
        k = K * vr(0.03);
        [523.25, 659.25, 783.99].forEach(function (f, i) {
          osc({ wave: S('sine', 'triangle', 'sine'), f: F([[0, f]], k), t0: T(i * 0.06), a: T(0.04), h: T(0.08), end: T(0.86), g: 0.1, vib: { rate: 5, cents: 7 }, pan: (i - 1) * 0.25, lp: { f: [[0, 5000 * B * BR]], q: 0.5 } });
        });
        osc({ wave: 'sine', f: F([[0, 1568], [0.3, 2093]], k), t0: T(0.1), a: T(0.06), h: T(0.24), end: T(0.82), g: 0.07, pitch: true });
        noise({ color: 'white', t0: T(0.05), a: T(0.12), end: T(0.72), g: 0.035, bp: { f: [[0, 6500 * B], [T(0.6), 9000 * B]], q: 0.8 } });
        dur = T(0.87); contour = 'up'; break;
      case 'footstep':
        k = K * vr(0.12);
        noise({ color: 'pink', a: 0.001, end: T(0.07), g: 1.25 * vr(0.2), bp: { f: [[0, 950 * B * vr(0.25)], [T(0.05), 650 * B]], q: 1.1 } });
        osc({ wave: 'sine', f: F([[0, 96], [0.04, 58]], k), a: 0.0015, end: T(0.055), g: 0.6 * vr(0.2) });
        noise({ color: 'white', t0: T(0.004 + 0.006 * (V > 0 ? rng() : 0.5)), a: 0.001, end: T(0.035), g: 0.1, hp: { f: [[0, 2400 * B]], q: 0.6 } });
        dur = T(0.08); break;
      case 'hurt':
        k = K * vr(0.07);
        osc({ wave: S('square', 'square', 'triangle'), f: F([[0, 620], [0.25, 170]], k), a: 0.003, end: T(0.3), g: 0.24, lp: { f: [[0, 2600 * B * BR], [T(0.25), 1100 * B * BR]], q: 0.7 }, vib: { rate: 26, cents: 55 }, pitch: true });
        noise({ color: 'white', a: 0.001, end: T(0.06), g: 0.42, bp: { f: [[0, 1500 * B * vr(0.15)]], q: 0.9 } });
        osc({ wave: 'sine', f: F([[0, 135], [0.09, 60]], k), a: 0.002, end: T(0.11), g: 0.65 });
        dur = T(0.31); contour = 'down'; break;
    }
    layers.forEach(function (l) { if (l.t0 == null) l.t0 = 0; if (l.h == null) l.h = 0; if (l.pan == null) l.pan = 0; });
    return { preset: preset, seed: seed >>> 0, dur: dur, contour: contour, layers: layers, gain: 1, version: VERSION };
  }

  function describe(preset, seed, params) {
    var p = resolve(preset); if (!p) return null;
    return recipe(p, num(seed, 1) >>> 0, normParams(params));
  }

  /* ---------------- noise buffers (seeded, per context) ---------------- */
  var NOISE_LEN_S = 2;
  function noiseBuffers(ctx) {
    if (ctx.__gdnaNoise) return ctx.__gdnaNoise;
    var sr = ctx.sampleRate, n = Math.floor(sr * NOISE_LEN_S), out = {}, r = rngOf(0x5eed1234);
    var w = new Float32Array(n), p = new Float32Array(n), b = new Float32Array(n);
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0, i, x;
    for (i = 0; i < n; i++) {
      x = r() * 2 - 1; w[i] = x;
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
      br = (br + 0.02 * x) / 1.02; b[i] = br * 3.5;
    }
    [w, p, b].forEach(function (arr) { var m = 0, j, pk = 0; for (j = 0; j < n; j++) m += arr[j]; m /= n; for (j = 0; j < n; j++) { arr[j] -= m; pk = Math.max(pk, Math.abs(arr[j])); } for (j = 0; j < n; j++) arr[j] /= pk || 1; });
    ['white', 'pink', 'brown'].forEach(function (c, ci) { var buf = ctx.createBuffer(1, n, sr); buf.getChannelData(0).set([w, p, b][ci]); out[c] = buf; });
    ctx.__gdnaNoise = out;
    return out;
  }

  /* ---------------- builder: one patch into any BaseAudioContext ---------------- */
  function automate(param, pts, t0, floor) {
    // pts: [[t, v, 'set'?]] relative to t0; exponential ramps between points (values > 0), 'set' = step
    param.setValueAtTime(Math.max(floor, pts[0][1]), t0 + pts[0][0]);
    for (var i = 1; i < pts.length; i++) {
      var tt = t0 + pts[i][0], v = Math.max(floor, pts[i][1]);
      if (pts[i][2] === 'set') param.setValueAtTime(v, tt); else param.exponentialRampToValueAtTime(v, tt);
    }
  }
  function biquad(ctx, type, spec, t0) {
    var f = ctx.createBiquadFilter(); f.type = type; f.Q.value = spec.q == null ? 0.7 : spec.q;
    automate(f.frequency, spec.f.map(function (p) { return [p[0], Math.min(p[1], ctx.sampleRate * 0.45)]; }), t0, 20);
    return f;
  }
  function envelope(gp, l, t0) {
    var s = t0 + l.t0, a = Math.max(0.0008, l.a), h = l.h || 0, end = t0 + l.end, rel = 0.006;
    var peakT = s + a, decStart = peakT + h, decEnd = Math.max(decStart + 0.004, end - rel);
    gp.setValueAtTime(0, s);
    gp.linearRampToValueAtTime(l.g, peakT);
    if (h > 0) gp.setValueAtTime(l.g, decStart);
    gp.exponentialRampToValueAtTime(Math.max(1e-6, l.g * 0.001), decEnd);
    gp.linearRampToValueAtTime(0, end);
  }
  function build(ctx, dest, patch, when, opts) {
    opts = opts || {};
    var nb = noiseBuffers(ctx), stopAt = when + patch.dur + 0.03, nodes = [];
    patch.layers.forEach(function (l) {
      if (opts.solo === 'pitch' && !l.pitch) return;
      var t0 = when + l.t0, src, chainIn, last;
      if (l.src === 'noise') {
        src = ctx.createBufferSource(); src.buffer = nb[l.color] || nb.white; src.loop = true;
        src.start(t0, (l.off || 0) % NOISE_LEN_S); src.stop(when + l.end + 0.02);
      } else {
        src = ctx.createOscillator(); src.type = l.wave || 'sine';
        automate(src.frequency, l.f, t0, 10);
        if (l.vib) {
          var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = l.vib.rate; lg.gain.value = l.vib.cents;
          lfo.connect(lg); lg.connect(src.detune); lfo.start(t0); lfo.stop(when + l.end + 0.02); nodes.push(lfo);
        }
        if (l.fm) {
          var mod = ctx.createOscillator(), mg = ctx.createGain(); mod.type = 'sine';
          automate(mod.frequency, l.f.map(function (p) { return [p[0], p[1] * l.fm.ratio, p[2]]; }), t0, 10);
          var mf = l.f[0][1] * l.fm.ratio;
          automate(mg.gain, l.fm.idx.map(function (p) { return [p[0], p[1] * mf]; }), t0, 0.01);
          mod.connect(mg); mg.connect(src.frequency); mod.start(t0); mod.stop(when + l.end + 0.02); nodes.push(mod);
        }
        src.start(t0); src.stop(when + l.end + 0.02);
      }
      last = src;
      ['hp', 'lp', 'bp'].forEach(function (ft) {
        if (!l[ft]) return;
        var f = biquad(ctx, ft === 'hp' ? 'highpass' : ft === 'lp' ? 'lowpass' : 'bandpass', l[ft], t0);
        last.connect(f); last = f;
      });
      var env = ctx.createGain(); env.gain.value = 0; envelope(env.gain, l, when);
      last.connect(env); last = env;
      var pan = clamp((l.pan || 0) + (opts.pan || 0), -1, 1);
      if (pan && ctx.createStereoPanner) { var sp = ctx.createStereoPanner(); sp.pan.value = pan; last.connect(sp); last = sp; }
      last.connect(dest);
      nodes.push(src);
    });
    return { nodes: nodes, end: stopAt };
  }

  /* ---------------- master chain: bus -> highpass 25 Hz -> compressor -> soft ceiling ---------------- */
  var CEIL_CURVE = null;
  function ceilingCurve() {
    if (CEIL_CURVE) return CEIL_CURVE;
    var n = 4097, c = new Float32Array(n), knee = 0.8, room = 0.18;
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1, ax = Math.abs(x), y = ax <= knee ? ax : knee + room * Math.tanh((ax - knee) / room);
      c[i] = x < 0 ? -y : y;
    }
    return (CEIL_CURVE = c);
  }
  function masterChain(ctx, out) {
    var input = ctx.createGain(), hp = ctx.createBiquadFilter(), comp = ctx.createDynamicsCompressor(), sh = ctx.createWaveShaper();
    hp.type = 'highpass'; hp.frequency.value = 25; hp.Q.value = 0.6;
    comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 3; comp.attack.value = 0.002; comp.release.value = 0.12;
    sh.curve = ceilingCurve(); sh.oversample = '2x';
    input.connect(hp); hp.connect(comp); comp.connect(sh); sh.connect(out);
    return { input: input, comp: comp };
  }

  /* ---------------- offline render (checks, waveforms) ---------------- */
  function OfflineCtor() { return root.OfflineAudioContext || root.webkitOfflineAudioContext || null; }
  function render(preset, seed, opts) {
    opts = opts || {};
    var p = resolve(preset), OAC = OfflineCtor();
    if (!p || !OAC) return Promise.resolve(null);
    try {
      var P = normParams(opts.params), patch = recipe(p, num(seed, 1) >>> 0, P), sr = opts.sampleRate || 48000;
      var len = Math.ceil((patch.dur + 0.06) * sr), ctx = new OAC(2, len, sr);
      var vol = num(opts.volume, 1) * P.master * P.sfx;
      var voice = ctx.createGain(); voice.gain.value = vol;
      if (opts.chain === false) voice.connect(ctx.destination); else { var mc = masterChain(ctx, ctx.destination); voice.connect(mc.input); }
      build(ctx, voice, patch, 0.01, { solo: opts.solo, pan: opts.pan || 0 });
      return ctx.startRendering().then(function (buf) {
        return { preset: p, seed: patch.seed, rate: sr, length: buf.length, start: Math.round(0.01 * sr), dur: patch.dur, contour: patch.contour,
          left: buf.getChannelData(0), right: buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0), patch: patch };
      });
    } catch (e) { return Promise.resolve(null); }
  }

  /* ---------------- live instance ---------------- */
  function AudioCtor() { return root.AudioContext || root.webkitAudioContext || null; }
  var GESTURES = ['pointerdown', 'mousedown', 'touchend', 'keydown', 'click'];

  function create(options) {
    options = options || {};
    var P = normParams(Object.assign({}, options.params || {}, options.seed != null ? { seed: options.seed } : {}));
    var ctx = null, master = null, bus = null, musicBus = null, mc = null, voices = [], log = [], seq = 0, counts = {}, lastAt = {}, clock = 0, clockUsed = false, lastUpd = 0, walkAcc = {};
    var S = { calls: 0, played: 0, merged: 0, dropped: 0, stolen: 0, locked: 0, muted: 0, noaudio: 0, unknown: 0, errors: 0, ducks: 0, maxVoices: 0, byPreset: {} };
    var listening = false, warned = {}, onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;

    function wall() { return root.performance && performance.now ? performance.now() : Date.now(); }
    // module clock (game time from update) when the game steps it; if update() has stalled (a paused game, a menu the game
    // does not step), wall time since the last update is added, so sounds played while paused still space out correctly
    function nowMs() { if (!clockUsed) return wall(); var w = wall() - lastUpd; return w > 100 ? clock + w : clock; }
    function applyGains() {
      if (!ctx) return;
      var t = ctx.currentTime;
      try { master.gain.setTargetAtTime(P.mute ? 0 : P.master, t, 0.015); bus.gain.setTargetAtTime(P.sfx, t, 0.015); } catch (e) { S.errors++; }
    }
    function ensure() {
      if (ctx) return ctx;
      var AC = AudioCtor(); if (!AC) return null;
      try {
        ctx = new AC({ latencyHint: 'interactive' });
        master = ctx.createGain(); bus = ctx.createGain(); musicBus = ctx.createGain();
        mc = masterChain(ctx, ctx.destination);
        bus.connect(master); musicBus.connect(master); master.connect(mc.input);
        master.gain.value = P.mute ? 0 : P.master; bus.gain.value = P.sfx;
        noiseBuffers(ctx);
      } catch (e) { S.errors++; ctx = null; }
      return ctx;
    }
    function running() { return !!(ctx && ctx.state === 'running'); }
    function onGesture(e) {
      // only a real activation can start audio; synthetic events would only create a suspended context (and a console warning)
      try { if (root.navigator && navigator.userActivation && !navigator.userActivation.isActive) return; } catch (e) { }
      try { unlock(); } catch (e) { S.errors++; }
      if (running()) stopListening();
    }
    function listen() {
      if (listening || !root.addEventListener) return; listening = true;
      GESTURES.forEach(function (ev) { root.addEventListener(ev, onGesture, { capture: true, passive: true }); });
    }
    function stopListening() {
      if (!listening) return; listening = false;
      GESTURES.forEach(function (ev) { try { root.removeEventListener(ev, onGesture, { capture: true }); } catch (e) { } });
    }
    function unlock() {
      if (!AudioCtor()) return false;
      if (!ensure()) return false;
      try { if (ctx.state !== 'running' && ctx.resume) { var pr = ctx.resume(); if (pr && pr.then) pr.then(function () { if (running()) stopListening(); }, function () { }); } } catch (e) { S.errors++; }
      try { // a one-sample silent buffer kick-starts output on older mobile browsers
        var b = ctx.createBuffer(1, 1, ctx.sampleRate), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch (e) { }
      return running();
    }
    function prune(t) { voices = voices.filter(function (v) { return v.end > t && !v.dead; }); }
    function killVoice(v, t) {
      v.dead = true; S.stolen++;
      try { v.gain.gain.cancelScheduledValues(t); v.gain.gain.setValueAtTime(v.gain.gain.value, t); v.gain.gain.linearRampToValueAtTime(0, t + 0.015); } catch (e) { }
      v.nodes.forEach(function (n) { try { n.stop(t + 0.03); } catch (e) { } });
    }
    function duck(byVoice, amount, hold, t) {
      if (!P.duck || !amount) return;
      var lin = Math.pow(10, -(P.duck * amount * 1.6) / 20); S.ducks++;
      voices.forEach(function (v) {
        if (v === byVoice || v.dead) return;
        try { var g = v.gain.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(v.vol * lin, t, 0.015); g.setTargetAtTime(v.vol, t + hold, 0.12); } catch (e) { }
      });
      try { var mg = musicBus.gain; mg.cancelScheduledValues(t); mg.setValueAtTime(mg.value, t); mg.setTargetAtTime(Math.pow(10, -P.duck / 20), t, 0.03); mg.setTargetAtTime(1, t + hold, 0.25); } catch (e) { }
    }
    function record(ev) {
      log.push(ev); if (log.length > 64) log.shift();
      if (onEvent) { try { onEvent(ev); } catch (e) { S.errors++; } }
      return ev;
    }
    function panOf(o) {
      if (o.pan != null && isFinite(+o.pan)) return clamp(+o.pan, -1, 1) * 0.7;
      if (o.x != null && o.width) return clamp((o.x / o.width) * 2 - 1, -1, 1) * 0.6;
      return 0;
    }
    function play(name, o) {
      o = o || {}; S.calls++;
      var preset = resolve(name), t = nowMs();
      if (!preset) {
        S.unknown++;
        if (!warned[name] && root.console) { warned[name] = 1; try { console.warn('GameDNA_Sfx: unknown preset "' + name + '"'); } catch (e) { } }
        return record({ n: ++seq, t: Math.round(t), preset: String(name), status: 'unknown' });
      }
      var n = counts[preset] = (counts[preset] || 0) + 1;
      var seed = o.seed != null ? (+o.seed >>> 0) : mix(P.seed, mix(hashStr(preset), n));
      var ev = { n: ++seq, t: Math.round(t), preset: preset, seed: seed, pan: Math.round(panOf(o) * 100) / 100, vol: Math.round(clamp(num(o.volume, 1), 0, 2) * 100) / 100, status: '' };
      S.byPreset[preset] = (S.byPreset[preset] || 0) + 1;
      var gap = META[preset].gap;
      if (lastAt[preset] != null && t - lastAt[preset] >= 0 && t - lastAt[preset] < gap && !o.force) { ev.status = 'merged'; S.merged++; return record(ev); }
      lastAt[preset] = t;
      if (!AudioCtor()) { ev.status = 'noaudio'; S.noaudio++; return record(ev); }
      if (P.mute) { ev.status = 'muted'; S.muted++; return record(ev); }
      if (!running()) { ev.status = 'locked'; S.locked++; return record(ev); }
      try {
        var at = ctx.currentTime + 0.004; prune(at);
        var pri = META[preset].pri;
        if (voices.length >= P.maxVoices) {
          var victim = null;
          voices.forEach(function (v) { if (v.pri <= pri && (!victim || v.pri < victim.pri || (v.pri === victim.pri && v.start < victim.start))) victim = v; });
          if (!victim) { ev.status = 'dropped'; S.dropped++; return record(ev); }
          killVoice(victim, at); prune(at);
        }
        var patch = recipe(preset, seed, P), vg = ctx.createGain(), vol = clamp(num(o.volume, 1), 0, 2);
        vg.gain.value = vol; vg.connect(bus);
        var b = build(ctx, vg, patch, at, { pan: panOf(o) });
        var v = { preset: preset, pri: pri, start: at, end: b.end, nodes: b.nodes, gain: vg, vol: vol };
        voices.push(v);
        S.maxVoices = Math.max(S.maxVoices, voices.length);
        if (META[preset].duck) duck(v, META[preset].duck, patch.dur * 0.6, at);
        ev.status = 'played'; ev.dur = Math.round(patch.dur * 1000); S.played++;
        setTimeout(function () { try { vg.disconnect(); } catch (e) { } }, Math.ceil((b.end - ctx.currentTime) * 1000) + 200);
      } catch (e) { S.errors++; ev.status = 'error'; }
      return record(ev);
    }
    function walk(key, dx, grounded, stride) {
      try {
        key = String(key == null ? 'walker' : key);
        if (!grounded) { walkAcc[key] = Math.min(walkAcc[key] || 0, (stride || P.stride) * 0.5); return null; }
        var s = num(stride, P.stride), a = (walkAcc[key] || 0) + Math.abs(num(dx, 0));
        if (a >= s) { walkAcc[key] = a % s; return play('footstep', { volume: 0.8 }); }
        walkAcc[key] = a;
      } catch (e) { S.errors++; }
      return null;
    }
    function update(dtMs) { var d = num(dtMs, 0); if (d > 0 && d < 1000) { var w = wall() - lastUpd; if (clockUsed && w > 100) clock += w; clock += d; clockUsed = true; lastUpd = wall(); } }
    function setParams(p) { try { var old = P; P = normParams(Object.assign({}, p || {}), old); applyGains(); } catch (e) { S.errors++; } return params(); }
    function params() { return Object.assign({}, P); }
    function mute(on) { setParams({ mute: on == null ? !P.mute : !!on }); return P.mute; }
    function active() { if (ctx) prune(ctx.currentTime); return voices.length; }
    function stats() { var o = Object.assign({}, S); o.byPreset = Object.assign({}, S.byPreset); o.active = active(); o.state = ctx ? ctx.state : (AudioCtor() ? 'not-created' : 'unsupported'); return o; }
    function recent(nn) { return log.slice(-Math.max(1, num(nn, 8))).map(function (e) { return Object.assign({}, e); }); }
    function stopAll() { if (!ctx) return; var t = ctx.currentTime; voices.forEach(function (v) { killVoice(v, t); }); S.stolen -= voices.length; voices = []; }
    function destroy() { stopListening(); stopAll(); try { if (ctx && ctx.close) ctx.close(); } catch (e) { } ctx = null; }

    listen();
    // already activated page (a click happened before create): unlock right away
    try { if (root.navigator && navigator.userActivation && navigator.userActivation.hasBeenActive) unlock(); } catch (e) { }

    return {
      play: function (n, o) { try { return play(n, o); } catch (e) { S.errors++; return null; } },
      walk: walk, update: update, unlock: function () { try { return unlock(); } catch (e) { S.errors++; return false; } },
      setParams: setParams, params: params, mute: mute, isUnlocked: running, active: active, stats: stats, recent: recent, stopAll: stopAll, destroy: destroy,
      musicInput: function () { ensure(); return musicBus; },
      context: function () { return ctx; }
    };
  }

  root.GameDNA_Sfx = {
    version: VERSION, presets: PRESETS.slice(), aliases: Object.assign({}, ALIASES), meta: JSON.parse(JSON.stringify(META)), defaults: Object.assign({}, DEFAULTS), styles: STYLES.slice(),
    create: create, describe: describe, render: render, resolve: resolve,
    supported: function () { return !!AudioCtor(); }
  };
})(typeof window !== 'undefined' ? window : this);
