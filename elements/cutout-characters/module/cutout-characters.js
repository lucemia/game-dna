/* GameDNA_Cutout v1.2.5 (L-10 Layered cutout characters): HD 2D characters built from painted cut-out parts
 * (head, torso, pelvis, upper / lower arms, thighs / shins, weapon, shield, cape, coat skirt) and moved by a small
 * bone rig in code: 2-bone IK keeps the feet planted, keyframed poses give a breathing idle, a step / walk, an
 * attack with anticipation -> strike -> recover, a hurt recoil, guard, cheer, cast and a jump pose; the cape and
 * coat skirt follow on a spring. No frame-by-frame drawing: one atlas image + one rig object per character.
 *
 *   var cut = GameDNA_Cutout.load(GameDNA_CutoutPack, { base: 'cutout/', onReady: boot });
 *   var hero = cut.actor('sword');                       // one per on-screen character, created once
 *   // fixed step:  hero.update(1000 / 60, { vx: H.vx * 60, h: 44, facing: H.facing });
 *   //              hero.play('attack') / hero.play('hurt') / hero.loop('walk') - or hero.pose('attack', k)
 *   // draw:        if (!hero.draw(ctx, feetX, feetY, { h: 44, facing: H.facing, flash: f })) drawOldHero();
 *
 * Rendering: every character is composed on its own offscreen layer at DEVICE resolution (from ctx.getTransform),
 * from a mip level of its atlas chosen for that size, then hurt flash, a code key-light shade and a rim light are
 * applied on the layer (source-atop, never on the host canvas) and the layer is blitted on whole device pixels.
 * The pose is a pure function of state set in update() (or of the arguments of drawPose), so ?t=&freeze=1 stills
 * match play. draw() never throws and returns false when the character's art is not loaded (keep the old drawing).
 * Source is ASCII only.
 */
(function (root) {
  'use strict';
  var VERSION = '1.2.5';
  var D2R = Math.PI / 180;

  function num(v, d) { return v == null || v === '' || !isFinite(+v) ? d : +v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(k) { return k * k * (3 - 2 * k); }
  function easeIn(k) { return k * k; }
  function easeOut(k) { return 1 - (1 - k) * (1 - k); }
  function mkCanvas(w, h) {
    try {
      if (typeof document !== 'undefined' && document.createElement) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
      if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    } catch (e) { }
    return null;
  }
  function warn(msg) { try { if (root.console) root.console.warn('[GameDNA_Cutout] ' + msg); } catch (e) { } }

  /* ---------------- 1. pose channels ----------------
   * px, py  pelvis offset from the rest stance, in character heights (py > 0 = lower)
   * pr, tr, hr  pelvis / torso / head rotation, degrees, + = lean forward (top toward the facing side)
   * aN, eN, aF, eF  near / far arm: upper arm swing from hanging down (+ = forward / up), elbow bend (+ = forearm forward)
   * wd  weapon direction, degrees in character space (0 = pointing forward, -90 = straight up, 90 = down)
   * sd  shield tilt, degrees
   * fNx, fNy, fFx, fFy  near / far foot (ankle) target from the rest stance, character heights (fy < 0 = lifted)
   * cape, skirt  extra cape / coat-skirt swing, degrees (+ = swings back)
   * grip  other-hand grip on the weapon shaft, character heights behind (+) or ahead of (-) the weapon hand (0 = that arm uses its own swing / bend)
   * rr  whole-body roll about the feet, degrees (falls, knock-downs)
   */
  var CH = ['px', 'py', 'pr', 'tr', 'hr', 'aN', 'eN', 'aF', 'eF', 'wd', 'sd', 'fNx', 'fNy', 'fFx', 'fFy', 'cape', 'skirt', 'grip', 'rr'];
  var NCH = CH.length, IX = {};
  for (var ci = 0; ci < NCH; ci++) IX[CH[ci]] = ci;

  /* ---------------- 2. animation sets ----------------
   * Each set: base (the ready stance) + anims {dur ms, loop, hitAt (k of the impact), keys: [[k, {channels}, ease]]}.
   * A key lists only what differs from base; ease is the easing INTO that key: 'io' (default), 'in', 'out', 'lin'. */
  // a walk cycle on flat ground: each foot is planted for half the cycle and slides back LINEARLY under the body, so at
  // the ground speed lib.walkSpeed(id) (stride x 4 / duration, heights per second) the planted foot does not slide
  function walkKeys(st, lift, bob, arm, extra) {
    function k(fn, ff, fny, ffy, up, sw) {
      var o = { fNx: fn, fFx: ff, fNy: fny, fFy: ffy, py: up, aN: sw[0], aF: sw[1] }; for (var e in extra) if (e !== "py") o[e] = extra[e]; return o;
    }
    var lo = extra.py + bob, hi = extra.py - bob, a = arm;
    return [[0, k(st, -st, 0, 0, lo, a[0]), 'lin'], [0.25, k(0, 0, 0, -lift, hi, a[1]), 'lin'], [0.5, k(-st, st, 0, 0, lo, a[2]), 'lin'],
      [0.75, k(0, 0, -lift, 0, hi, a[1]), 'lin'], [1, k(st, -st, 0, 0, lo, a[0]), 'lin']];
  }
  var SETS = {
    sword: {
      base: { px: 0, py: 0.034, pr: 2, tr: 3, hr: -2, aN: 6, eN: 42, aF: 55, eF: 35, wd: -18, sd: 6, fFx: 0.085, fFy: 0, fNx: -0.075, fNy: 0, cape: 0, skirt: 0, grip: 0, rr: 0 },
      stride: 0.17,
      anims: {
        idle: { dur: 2800, loop: true, keys: [[0, {}], [0.5, { py: 0.042, tr: 4.5, hr: -1, aN: 5, eN: 45, aF: 53, eF: 37, wd: -15, cape: 2 }], [1, {}]] },
        walk: { dur: 820, loop: true, keys: walkKeys(0.17, 0.07, 0.01, [[30, 46], [8, 56], [-14, 66]], { py: 0.016, pr: 3, tr: 2, eN: 42, eF: 35, wd: -18 }) },
        // overhead chop (squad / stage battles). The wind-up takes the arm up over the BACK (swing -195 is the same pose as
        // 165), so it never crosses the face; the second key at the same k restarts the channel at 165 for the strike
        attack: { dur: 600, hitAt: 0.34, trail: [0.29, 0.5], keys: [
          [0.22, { px: -0.035, py: 0.05, pr: -4, tr: -10, hr: -8, aN: -195, eN: 30, wd: -150, aF: 50, eF: 45, fFx: 0.07 }, 'out'],
          [0.22, { px: -0.035, py: 0.05, pr: -4, tr: -10, hr: -8, aN: 165, eN: 30, wd: -150, aF: 50, eF: 45, fFx: 0.07 }],
          [0.36, { px: 0.07, py: 0.05, pr: 7, tr: 11, hr: -6, aN: 62, eN: 8, wd: 28, aF: -10, eF: 30, fFx: 0.17, cape: 6 }, 'in'],
          [0.55, { px: 0.065, py: 0.055, pr: 7, tr: 10, hr: -6, aN: 40, eN: 6, wd: 55, aF: -10, eF: 30, fFx: 0.17 }, 'out'],
          [1, {}]] },
        // forward slash for side-view action: the blade comes over from behind and lands level, far ahead of the feet
        slash: { dur: 560, hitAt: 0.22, trail: [0.16, 0.36], keys: [
          [0.1, { px: -0.04, py: 0.05, pr: -3, tr: -14, hr: -4, aN: -210, eN: 60, wd: -170, aF: 55, eF: 40, sd: -4, fFx: 0.06 }, 'out'],
          [0.1, { px: -0.04, py: 0.05, pr: -3, tr: -14, hr: -4, aN: 150, eN: 60, wd: -170, aF: 55, eF: 40, sd: -4, fFx: 0.06 }],
          [0.22, { px: 0.09, py: 0.06, pr: 8, tr: 13, hr: -8, aN: 92, eN: 0, wd: 4, aF: -8, eF: 32, fFx: 0.21, cape: 7 }, 'in'],
          [0.45, { px: 0.09, py: 0.062, pr: 8, tr: 12, hr: -8, aN: 76, eN: 2, wd: 30, aF: -8, eF: 32, fFx: 0.21 }, 'out'],
          [1, {}]] },
        hurt: { dur: 420, keys: [
          [0.14, { px: -0.05, py: 0.03, pr: -10, tr: -18, hr: -16, aN: -5, eN: 30, wd: -55, aF: 50, eF: 60, sd: -12, cape: -6 }, 'out'],
          [0.45, { px: -0.035, py: 0.045, pr: -6, tr: -10, hr: -8, aN: 8, eN: 45, wd: -35, aF: 52, eF: 45 }],
          [1, {}]] },
        guard: { dur: 260, keys: [[1, { px: -0.01, py: 0.05, tr: -2, aF: 70, eF: 70, sd: -8, aN: 16, eN: 62, wd: -82, fFx: 0.1 }]] },
        cheer: { dur: 900, loop: true, keys: [[0, { aN: 180, eN: 6, wd: -95, py: 0.02, tr: -3, hr: -8 }], [0.5, { aN: 174, eN: 12, wd: -100, py: 0.028, tr: -2, hr: -6 }], [1, { aN: 180, eN: 6, wd: -95, py: 0.02, tr: -3, hr: -8 }]] },
        cast: { ref: 'attack' },
        jump: { dur: 500, keys: [[0, { fFy: -0.15, fNy: -0.06, fFx: 0.1, fNx: -0.13, py: -0.005, tr: 8, hr: -4, aN: 30, eN: 80, aF: 70, eF: 30, wd: -60, cape: -8 }], [1, { fFy: -0.05, fNy: -0.13, fFx: 0.15, fNx: -0.17, py: 0.0, tr: -5, hr: 4, aN: 34, eN: 86, aF: 88, eF: 20, wd: -78, cape: 16 }]] },
        down: { dur: 800, keys: [[0.25, { px: -0.04, tr: -18, hr: -16, aN: -6, eN: 20, aF: 50, eF: 40, wd: -78 }, 'out'], [0.6, { rr: -55, px: -0.02, py: 0.0, tr: -8, hr: -6, aN: 4, eN: 12, aF: 10, eF: 10, wd: 20, fFx: 0.05, fNx: -0.02 }, 'in'], [1, { rr: -90, py: -0.012, pr: 0, tr: 0, hr: -4, aN: 4, eN: 6, aF: -10, eF: 6, wd: 84, sd: 20, fFx: 0.035, fNx: 0 }, 'out']] }
      }
    },
    spear: {
      base: { px: 0, py: 0.04, pr: 3, tr: 4, hr: -3, aN: -10, eN: 75, aF: 30, eF: 40, wd: -26, sd: 0, fFx: 0.1, fFy: 0, fNx: -0.1, fNy: 0, cape: 0, skirt: 0, grip: -0.18, rr: 0 },
      stride: 0.17,
      anims: {
        idle: { dur: 3000, loop: true, keys: [[0, {}], [0.5, { py: 0.048, tr: 5.5, hr: -2, wd: -24, cape: 2 }], [1, {}]] },
        walk: { dur: 860, loop: true, keys: walkKeys(0.17, 0.07, 0.01, [[12, 30], [-10, 30], [-32, 30]], { py: 0.02, pr: 3, tr: 3, eN: 75, wd: -26 }) },
        // thrust: a long pull-back (rear hand behind the hip, torso turned away, front knee bent), a held coil, the thrust
        // and a short hold at full extension
        attack: { dur: 700, hitAt: 0.45, trail: null, keys: [
          [0.27, { px: -0.11, py: 0.08, pr: -6, tr: -15, hr: 9, aN: -40, eN: 70, wd: -12, grip: -0.2, fFx: 0.14, fNx: -0.14 }, 'out'],
          [0.37, { px: -0.115, py: 0.082, pr: -6, tr: -15, hr: 9, aN: -42, eN: 72, wd: -13, grip: -0.2, fFx: 0.14, fNx: -0.14 }, 'lin'],
          [0.45, { px: 0.14, py: 0.05, pr: 8, tr: 10, hr: -7, aN: 70, eN: 5, wd: 2, grip: -0.1, fFx: 0.22, cape: 8 }, 'in'],
          [0.62, { px: 0.135, py: 0.053, pr: 8, tr: 10, hr: -7, aN: 68, eN: 7, wd: 3, grip: -0.1, fFx: 0.22 }, 'lin'],
          [1, {}]] },
        slash: { ref: 'attack' },
        hurt: { dur: 420, keys: [
          [0.14, { px: -0.05, py: 0.03, pr: -10, tr: -16, hr: -16, aN: -15, eN: 80, wd: -46, cape: -6 }, 'out'],
          [0.45, { px: -0.035, py: 0.045, pr: -6, tr: -8, hr: -8, wd: -36 }],
          [1, {}]] },
        guard: { dur: 260, keys: [[1, { py: 0.055, tr: 0, aN: 5, eN: 85, wd: -36, grip: -0.16 }]] },
        cheer: { dur: 900, loop: true, keys: [[0, { aN: 180, eN: 6, wd: -92, grip: 0, aF: 20, eF: 30, tr: 1, hr: -8 }], [0.5, { aN: 174, eN: 12, wd: -96, grip: 0, aF: 20, eF: 30, tr: 2, hr: -6, py: 0.048 }], [1, { aN: 180, eN: 6, wd: -92, grip: 0, aF: 20, eF: 30, tr: 1, hr: -8 }]] },
        cast: { ref: 'attack' },
        jump: { dur: 500, keys: [[0, { fFy: -0.14, fNy: -0.06, fFx: 0.08, fNx: -0.12, py: -0.005, tr: 6, wd: -34 }], [1, { fFy: -0.05, fNy: -0.12, fFx: 0.14, fNx: -0.15, py: 0.0, tr: -4, aN: -20, wd: -10 }]] },
        down: { dur: 800, keys: [[0.25, { px: -0.04, tr: -18, hr: -16, wd: -40 }, 'out'], [0.6, { rr: -55, px: -0.02, py: 0.0, tr: -8, hr: -6, aN: 4, eN: 12, grip: 0, aF: 8, eF: 8, wd: 30, fFx: 0.05, fNx: -0.02 }, 'in'], [1, { rr: -90, py: -0.012, pr: 0, tr: 0, hr: -4, aN: 4, eN: 6, grip: 0, aF: -14, eF: 4, wd: 86, fFx: 0.035, fNx: 0 }, 'out']] }
      }
    },
    mage: {
      base: { px: 0, py: 0.03, pr: 1, tr: 2, hr: -2, aN: 24, eN: 48, aF: 58, eF: 28, wd: -84, sd: 0, fFx: 0.08, fFy: 0, fNx: -0.07, fNy: 0, cape: 0, skirt: 0, grip: 0, rr: 0 },
      stride: 0.15,
      anims: {
        idle: { dur: 3200, loop: true, keys: [[0, {}], [0.5, { py: 0.037, tr: 3.2, hr: -1, aN: 26, eN: 52, wd: -83, skirt: 1.5 }], [1, {}]] },
        walk: { dur: 900, loop: true, keys: walkKeys(0.15, 0.06, 0.009, [[36, 50], [22, 58], [8, 66]], { py: 0.016, pr: 2, tr: 2, eN: 48, eF: 28, wd: -84 }) },
        // cast: the staff rises high (anticipation), then swings forward with the crystal up and ahead; a short step only
        attack: { dur: 720, hitAt: 0.42, keys: [
          [0.28, { px: -0.03, py: 0.045, tr: -8, hr: -8, aN: -10, eN: 100, aF: 112, eF: 18, wd: -96, skirt: -3 }, 'out'],
          [0.42, { px: 0.025, py: 0.04, pr: 4, tr: 7, hr: -5, aN: 60, eN: 20, aF: 100, eF: 15, wd: -66, fFx: 0.1, skirt: 5 }, 'in'],
          [0.66, { px: 0.025, py: 0.042, pr: 4, tr: 6, hr: -5, aN: 58, eN: 22, aF: 98, eF: 17, wd: -68, fFx: 0.1 }],
          [1, {}]] },
        slash: { ref: 'attack' },
        hurt: { dur: 420, keys: [
          [0.14, { px: -0.05, py: 0.03, pr: -10, tr: -16, hr: -16, aN: 0, eN: 40, aF: 38, eF: 45, wd: -105, skirt: -6 }, 'out'],
          [0.45, { px: -0.035, py: 0.04, pr: -6, tr: -8, hr: -8, wd: -95 }],
          [1, {}]] },
        guard: { dur: 260, keys: [[1, { py: 0.04, tr: -3, aN: 40, eN: 70, aF: 78, eF: 50, wd: -70 }]] },
        cheer: { dur: 900, loop: true, keys: [[0, { aF: 160, eF: 10, wd: -95, aN: 60, eN: 40, hr: -10 }], [0.5, { aF: 152, eF: 18, wd: -98, aN: 64, eN: 36, hr: -8, py: 0.038 }], [1, { aF: 160, eF: 10, wd: -95, aN: 60, eN: 40, hr: -10 }]] },
        cast: { ref: 'attack' },
        jump: { dur: 500, keys: [[0, { fFy: -0.14, fNy: -0.06, fFx: 0.09, fNx: -0.12, py: -0.005, tr: 6, aN: 40, eN: 60, aF: 80, eF: 20, wd: -80, skirt: -10 }], [1, { fFy: -0.05, fNy: -0.12, fFx: 0.13, fNx: -0.15, py: 0.0, tr: -5, aN: 70, eN: 30, aF: 100, eF: 15, wd: -88, skirt: 12 }]] },
        down: { dur: 800, keys: [[0.25, { px: -0.04, tr: -18, hr: -16, wd: -100 }, 'out'], [0.6, { rr: -55, px: -0.02, py: 0.0, tr: -8, hr: -6, aN: 6, eN: 14, aF: 10, eF: 12, wd: 10, fFx: 0.05, fNx: -0.02 }, 'in'], [1, { rr: -90, py: -0.012, pr: 0, tr: 0, hr: -4, aN: 4, eN: 8, aF: 4, eF: 8, wd: 86, fFx: 0.03, fNx: 0 }, 'out']] }
      }
    }
  };
  var ANIM_NAMES = ['idle', 'walk', 'attack', 'slash', 'hurt', 'guard', 'cheer', 'cast', 'jump', 'down'];
  var LOOPS = { idle: 1, walk: 1, cheer: 1 };

  function compileSet(S) {
    var base = new Float32Array(NCH), out = { base: base, anims: {}, stride: num(S.stride, 0.14) }, k;
    for (k = 0; k < NCH; k++) base[k] = num(S.base[CH[k]], 0);
    for (var name in S.anims) {
      var A = S.anims[name]; if (A.ref) continue;
      var keys = A.keys.slice();
      if (keys[0][0] > 0) keys.unshift([0, {}]);   // one-shots start from the base stance
      var rows = [], ks = [], eases = [];
      for (var i = 0; i < keys.length; i++) {
        var r = new Float32Array(NCH); r.set(base);
        for (var c in keys[i][1]) if (IX[c] != null) r[IX[c]] = keys[i][1][c];
        rows.push(r); ks.push(keys[i][0]); eases.push(keys[i][2] || 'io');
      }
      out.anims[name] = { dur: A.dur, loop: !!A.loop, hitAt: num(A.hitAt, -1), trail: A.trail || null, rows: rows, ks: ks, eases: eases };
    }
    for (name in S.anims) if (S.anims[name].ref) out.anims[name] = out.anims[S.anims[name].ref];
    return out;
  }
  var COMPILED = {};
  for (var sn in SETS) COMPILED[sn] = compileSet(SETS[sn]);

  function applyEase(e, k) { return e === 'in' ? easeIn(k) : e === 'out' ? easeOut(k) : e === 'lin' ? k : smooth(k); }
  // write the channels of anim A at progress k (0..1) into out
  function evalAnim(A, k, out) {
    var ks = A.ks, n = ks.length, i;
    if (A.loop) { k = k - Math.floor(k); } else k = clamp(k, 0, 1);
    if (k <= ks[0]) { out.set(A.rows[0]); return; }
    if (k >= ks[n - 1]) { out.set(A.rows[n - 1]); return; }
    for (i = 1; i < n; i++) if (k <= ks[i]) break;
    var a = A.rows[i - 1], b = A.rows[i], u = applyEase(A.eases[i], (k - ks[i - 1]) / Math.max(1e-6, ks[i] - ks[i - 1]));
    for (var c = 0; c < NCH; c++) out[c] = a[c] + (b[c] - a[c]) * u;
  }
  function mixInto(out, a, b, w) { for (var c = 0; c < NCH; c++) out[c] = a[c] + (b[c] - a[c]) * w; }

  /* ---------------- 3. rig solve ----------------
   * rig.parts[name] = {rect: [x, y, w, h] in the atlas, pivot: [x, y] (part px), joints: {name: [x, y]}}
   * Part world matrix = T(joint position) * R(angle) * T(-pivot); angles are absolute (character space). */
  var PART_ORDER = ['pelvis', 'torso', 'head', 'collar', 'armN', 'foreN', 'armF', 'foreF', 'thighN', 'shinN', 'footN', 'thighF', 'shinF', 'footF', 'weapon', 'shield', 'cape', 'skirt'];

  function prepRig(rig) {
    var P = rig.parts, R = { rig: rig, parts: {}, list: [], H: num(rig.height, 1) };
    PART_ORDER.forEach(function (n) {
      var p = P[n]; if (!p) return;
      var q = { name: n, rect: p.rect, pivot: p.pivot, joints: p.joints || {}, m: new Float32Array(6), nat: 0, len: 0, on: true };
      R.parts[n] = q;
    });
    function natural(n, j) { var q = R.parts[n]; if (!q || !q.joints[j]) return; var dx = q.joints[j][0] - q.pivot[0], dy = q.joints[j][1] - q.pivot[1]; q.nat = Math.atan2(dy, dx); q.len = Math.sqrt(dx * dx + dy * dy); }
    natural('armN', 'fore'); natural('foreN', 'hand'); natural('armF', 'fore'); natural('foreF', 'hand');
    natural('thighN', 'shin'); natural('shinN', 'ankle'); natural('thighF', 'shin'); natural('shinF', 'ankle');
    natural('weapon', 'tip'); natural('torso', 'neck'); natural('head', 'top'); natural('pelvis', 'waist');
    natural('cape', 'hem'); natural('skirt', 'hem'); natural('shield', 'top');
    R.z = (rig.z || PART_ORDER).filter(function (n) { return !!R.parts[n]; }).map(function (n) { return R.parts[n]; });
    R.weaponHand = rig.weaponHand === 'F' ? 'F' : 'N';
    R.set = COMPILED[rig.anims] || COMPILED[rig.role] || COMPILED.sword;
    // rest stance: legs straight down, ankles under the hips
    var th = R.parts.thighN, sh = R.parts.shinN;
    R.legLen = (th ? th.len : 0) + (sh ? sh.len : 0);
    R.sole = num(rig.sole, 0);
    R.hipY = num(rig.hipY, R.legLen + R.sole);   // pelvis pivot height above the ground at rest (legs straight)
    R.bounds = rig.bounds || [-1.15, -1.25, 1.15, 0.12];   // layer box in heights: x0, y0, x1, y1 (facing right)
    return R;
  }

  function setM(m, x, y, ang, px, py) {   // T(x, y) R(ang) T(-px, -py)
    var c = Math.cos(ang), s = Math.sin(ang);
    m[0] = c; m[1] = s; m[2] = -s; m[3] = c; m[4] = x - (c * px - s * py); m[5] = y - (s * px + c * py);
  }
  var TMP = new Float32Array(2);
  function apply(m, x, y, out) { out[0] = m[0] * x + m[2] * y + m[4]; out[1] = m[1] * x + m[3] * y + m[5]; return out; }
  function jointOf(q, j, out) { var p = q.joints[j]; if (!p) { out[0] = q.m[4]; out[1] = q.m[5]; return false; } apply(q.m, p[0], p[1], out); return true; }
  function angOf(q) { return Math.atan2(q.m[1], q.m[0]); }

  // two-bone IK from S toward T; returns the upper bone direction (radians) and writes the elbow / knee to E
  var IKO = new Float32Array(2);
  function ik(sx, sy, tx, ty, a, b, prefer) {   // prefer: +1 bend toward +x (knees), -1 bend toward +y (elbows down/back)
    var dx = tx - sx, dy = ty - sy, d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    var dd = clamp(d, Math.abs(a - b) + 1e-3, (a + b) * 0.9995);
    var base = Math.atan2(dy, dx), al = Math.acos(clamp((a * a + dd * dd - b * b) / (2 * a * dd), -1, 1));
    var u1 = base - al, u2 = base + al;
    var e1x = sx + Math.cos(u1) * a, e1y = sy + Math.sin(u1) * a, e2x = sx + Math.cos(u2) * a, e2y = sy + Math.sin(u2) * a;
    var pick1 = prefer > 0 ? e1x >= e2x : e1y >= e2y;
    var u = pick1 ? u1 : u2, ex = pick1 ? e1x : e2x, ey = pick1 ? e1y : e2y;
    IKO[0] = ex; IKO[1] = ey;
    return [u, Math.atan2(ty - ey, tx - ex)];
  }
  var IKR = [0, 0];
  function ik2(sx, sy, tx, ty, a, b, prefer) {   // allocation-free variant writing IKR
    var dx = tx - sx, dy = ty - sy, d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    var dd = clamp(d, Math.abs(a - b) + 1e-3, (a + b) * 0.9995);
    var base = Math.atan2(dy, dx), al = Math.acos(clamp((a * a + dd * dd - b * b) / (2 * a * dd), -1, 1));
    var u1 = base - al, u2 = base + al;
    var e1x = sx + Math.cos(u1) * a, e1y = sy + Math.sin(u1) * a, e2x = sx + Math.cos(u2) * a, e2y = sy + Math.sin(u2) * a;
    var pick1 = prefer > 0 ? e1x >= e2x : e1y >= e2y;
    var ex = pick1 ? e1x : e2x, ey = pick1 ? e1y : e2y;
    IKR[0] = pick1 ? u1 : u2;
    // lower bone aims at the target, but if the target is out of reach it continues straight
    IKR[1] = d > (a + b) * 0.9995 ? IKR[0] : Math.atan2(ty - ey, tx - ex);
    return IKR;
  }

  var J = new Float32Array(2), J2 = new Float32Array(2);
  // solve all part matrices of R for the channel vector c and spring angles (capeA, skirtA in degrees)
  function solve(R, c, capeA, skirtA) {
    var H = R.H, P = R.parts, down = Math.PI / 2;
    var pel = P.pelvis, tor = P.torso;
    var px = c[IX.px] * H, py = -R.hipY + c[IX.py] * H;
    var pa = c[IX.pr] * D2R, ta = pa + c[IX.tr] * D2R;
    // pelvis: pivot at the hip centre, drawn upright at angle 0
    setM(pel.m, px, py, pa, pel.pivot[0], pel.pivot[1]);
    if (tor) { jointOf(pel, 'torso', J); setM(tor.m, J[0], J[1], ta, tor.pivot[0], tor.pivot[1]); }
    var hd = P.head; if (hd && tor) { jointOf(tor, 'head', J); setM(hd.m, J[0], J[1], ta + c[IX.hr] * D2R, hd.pivot[0], hd.pivot[1]); }
    // collar: a piece of the torso drawn again above the head, so the neck tucks into the collar / cloak
    var col = P.collar; if (col && tor && jointOf(tor, 'collar', J)) setM(col.m, J[0], J[1], ta, col.pivot[0], col.pivot[1]); else if (col) col.on = false;
    // legs: IK to the foot targets (rest ankle = under the hip joint, on the ground minus the sole)
    legIK(R, 'N', c[IX.fNx] * H, c[IX.fNy] * H);
    legIK(R, 'F', c[IX.fFx] * H, c[IX.fFy] * H);
    // arms: FK from the torso (swing measured from hanging straight down)
    armFK(R, 'N', ta, c[IX.aN], c[IX.eN]);
    armFK(R, 'F', ta, c[IX.aF], c[IX.eF]);
    // weapon in its hand at an absolute direction
    var wp = P.weapon, wh = P['fore' + R.weaponHand];
    if (wp && wh) { jointOf(wh, 'hand', J); setM(wp.m, J[0], J[1], c[IX.wd] * D2R - wp.nat, wp.pivot[0], wp.pivot[1]); }
    // two-handed grip: the other hand reaches for the shaft
    var g = c[IX.grip] * H;
    if (wp && g !== 0) {
      var other = R.weaponHand === 'N' ? 'F' : 'N', ua = P['arm' + other], fa = P['fore' + other];
      if (ua && fa && tor) {
        jointOf(wp, 'grip', J);   // the weapon's grip point (pivot)
        var dir = c[IX.wd] * D2R, tx = J[0] - Math.cos(dir) * g, ty = J[1] - Math.sin(dir) * g;
        jointOf(tor, 'arm' + other, J2);
        var r = ik2(J2[0], J2[1], tx, ty, ua.len, fa.len, -1);
        setM(ua.m, J2[0], J2[1], r[0] - ua.nat, ua.pivot[0], ua.pivot[1]);
        jointOf(ua, 'fore', J); setM(fa.m, J[0], J[1], r[1] - fa.nat, fa.pivot[0], fa.pivot[1]);
      }
    }
    var shd = P.shield, sf = P.foreF;
    if (shd && sf) { jointOf(sf, 'hand', J); setM(shd.m, J[0], J[1], c[IX.sd] * D2R + ta * 0.4, shd.pivot[0], shd.pivot[1]); }
    var cp = P.cape; if (cp && tor) { jointOf(tor, 'cape', J); setM(cp.m, J[0], J[1], ta * 0.5 + capeA * D2R, cp.pivot[0], cp.pivot[1]); }
    var sk = P.skirt; if (sk) { jointOf(pel, 'skirt', J); setM(sk.m, J[0], J[1], pa * 0.6 + skirtA * D2R, sk.pivot[0], sk.pivot[1]); }
  }
  function legIK(R, s, ox, oy) {
    var P = R.parts, th = P['thigh' + s], sh = P['shin' + s]; if (!th || !sh) return;
    var j = R.parts.pelvis.joints['thigh' + s]; if (!j) return;
    jointOf(R.parts.pelvis, 'thigh' + s, J);
    // rest ankle: below this hip joint at rest (pelvis at its rest place, unrotated)
    var restX = j[0] - R.parts.pelvis.pivot[0], restY = -R.sole;
    var r = ik2(J[0], J[1], restX + ox, restY + oy, th.len, sh.len, 1);
    setM(th.m, J[0], J[1], r[0] - th.nat, th.pivot[0], th.pivot[1]);
    jointOf(th, 'shin', J2); setM(sh.m, J2[0], J2[1], r[1] - sh.nat, sh.pivot[0], sh.pivot[1]);
    var ft = P['foot' + s];
    if (ft) {   // the foot stays flat on the ground; a lifted foot tilts a little with its shin
      var lift = clamp(-oy / (0.03 * R.H), 0, 1);
      jointOf(sh, 'ankle', J2); setM(ft.m, J2[0], J2[1], (r[1] - sh.nat) * 0.35 * lift, ft.pivot[0], ft.pivot[1]);
    }
  }
  function armFK(R, s, ta, swing, bend) {
    var P = R.parts, ua = P['arm' + s], fa = P['fore' + s], tor = P.torso; if (!ua || !fa || !tor) return;
    jointOf(tor, 'arm' + s, J);
    var u = Math.PI / 2 + ta - swing * D2R, f = u - bend * D2R;
    setM(ua.m, J[0], J[1], u - ua.nat, ua.pivot[0], ua.pivot[1]);
    jointOf(ua, 'fore', J2); setM(fa.m, J2[0], J2[1], f - fa.nat, fa.pivot[0], fa.pivot[1]);
  }

  /* ---------------- 4. library ---------------- */
  function load(pack, opts) {
    opts = opts || {};
    var lib = { version: VERSION, chars: {}, ready: false, failed: [], waiting: [], stats: { draws: 0, mipBuilds: 0, layerAllocs: 0, lastMs: 0, fileMode: false, notes: [] } };
    var list = pack && (pack.characters || pack.chars) || [];
    if (!Array.isArray(list)) { list = []; for (var k in (pack.characters || {})) list.push(pack.characters[k]); }
    var base = opts.base != null ? String(opts.base) : (pack && pack.base) || '';
    try { lib.stats.fileMode = !!(root.location && root.location.protocol === 'file:'); } catch (e) { }
    var pending = list.length;
    function done() { if (--pending > 0) return; finish(); }
    function finish() {
      if (lib.ready) return; lib.ready = true;
      var w = lib.waiting; lib.waiting = [];
      for (var i = 0; i < w.length; i++) try { w[i](lib); } catch (e) { warn('onReady callback threw: ' + e.message); }
    }
    list.forEach(function (rig) {
      var C = { id: rig.id, rig: rig, R: prepRig(rig), img: null, mips: [], ok: false };
      lib.chars[rig.id] = C;
      var src = rig.atlasData || (rig.atlas ? (/^(data:|https?:|\/)/.test(rig.atlas) ? rig.atlas : base + rig.atlas) : null);
      if (!src || typeof Image === 'undefined') { lib.failed.push({ id: rig.id, why: 'no atlas' }); done(); return; }
      var im = new Image();
      im.onload = function () { C.img = im; C.ok = true; C.mips[0] = { c: im, s: 1 }; done(); };
      im.onerror = function () { lib.failed.push({ id: rig.id, why: 'atlas failed to load: ' + src }); warn('atlas failed to load: ' + src); done(); };
      im.src = src;
    });
    if (!pending) setTimeout(finish, 0);
    lib.onReady = function (fn) { if (typeof fn !== 'function') return lib; if (lib.ready) { try { fn(lib); } catch (e) { warn('onReady callback threw: ' + e.message); } } else lib.waiting.push(fn); return lib; };
    if (typeof opts.onReady === 'function') lib.onReady(opts.onReady);
    lib.isReady = function () { return lib.ready; };
    lib.ids = function () { return Object.keys(lib.chars); };
    lib.has = function (id) { var C = lib.chars[id]; return !!(C && C.ok); };
    lib.status = function () { return { ready: lib.ready, loaded: Object.keys(lib.chars).filter(function (i) { return lib.chars[i].ok; }), failed: lib.failed.slice() }; };
    lib.actor = function (id, o) { return makeActor(lib, id, o || {}); };
    lib.anims = function () { return ANIM_NAMES.slice(); };
    lib.flashCurve = flashCurve;
    // ground speed of the walk cycle in character heights per second (multiply by the drawn height; at this speed the
    // planted foot does not slide); loop('walk', {speed: hostSpeed / (lib.walkSpeed(id) * h)})
    lib.walkSpeed = function (id) { return walkSpeedOf(lib.chars[id]); };
    // a head chip for portraits / turn-order icons: the head part, its face centred at (cx, cy), about 2.3 r tall
    lib.drawHead = function (ctx, id, cx, cy, r, o) {
      try {
        var C = lib.chars[id]; if (!C || !C.ok || !ctx) return false;
        var q = C.R.parts.head; if (!q) return false;
        var rc = q.rect, sc = 2.3 * r / rc[3], f = o && o.facing < 0 ? -1 : 1, tr = ctx.getTransform ? ctx.getTransform() : null;
        var dev = tr ? Math.sqrt(Math.abs(tr.a * tr.d - tr.b * tr.c)) || 1 : 1, mip = mipFor(lib, C, sc * dev), ms = mip.s;
        var fx = q.joints.top ? q.joints.top[0] : rc[2] / 2;   // face column: under the top of the head
        ctx.save(); ctx.translate(cx, cy); ctx.scale(f * sc, sc);
        ctx.drawImage(mip.c, rc[0] * ms, rc[1] * ms, rc[2] * ms, rc[3] * ms, -fx, -rc[3] * 0.5, rc[2], rc[3]);
        ctx.restore(); return true;
      } catch (e) { warn('drawHead failed: ' + e.message); return false; }
    };
    lib.channels = function () { return CH.slice(); };
    lib.rigInfo = function (id) { var C = lib.chars[id]; return C ? C.R : null; };
    // stateless draw for hosts that already know the pose: {anim | pose, k, t (s), h, facing, flash, alpha, light, fall}
    var tmpActor = null;
    lib.drawPose = function (ctx, id, x, footY, o) {
      try {
        if (!tmpActor) tmpActor = makeActor(lib, id, {});
        tmpActor.retarget(id);
        return tmpActor.drawStateless(ctx, x, footY, o || {});
      } catch (e) { warn('drawPose failed: ' + e.message); return false; }
    };
    lib.mip = function (C, s) { return mipFor(lib, C, s); };
    return lib;
  }

  // atlas mip whose scale is the smallest >= s (built once by halving with high-quality smoothing)
  function walkSpeedOf(C) { var S2 = C && C.R && C.R.set, W = S2 && S2.anims.walk; return W ? S2.stride * 4 / W.dur * 1000 : 0; }
  function mipFor(lib, C, s) {
    var L = 0;
    while (L < 5 && s <= Math.pow(0.5, L + 1) * 1.02) L++;
    for (var i = 1; i <= L; i++) {
      if (C.mips[i]) continue;
      var prev = C.mips[i - 1].c, w = Math.max(1, Math.ceil((prev.width || prev.naturalWidth) / 2)), h = Math.max(1, Math.ceil((prev.height || prev.naturalHeight) / 2));
      var cv = mkCanvas(w, h); if (!cv) return C.mips[i - 1];
      var g = cv.getContext('2d'); g.imageSmoothingEnabled = true; try { g.imageSmoothingQuality = 'high'; } catch (e) { }
      g.drawImage(prev, 0, 0, w, h);
      C.mips[i] = { c: cv, s: Math.pow(0.5, i) }; lib.stats.mipBuilds++;
    }
    return C.mips[L];
  }

  /* ---------------- 5. actor ---------------- */
  var SHADOW = null, SHADE = {}, RIMA = [], TRAIL_N = 20, TRAIL_MS = 4;
  // crisp hit flash: full for 3 frames, gone ~130 ms after the hit
  function flashCurve(ms) { return ms < 0 ? 0 : ms < 50 ? 0.75 : ms < 130 ? 0.75 * (1 - (ms - 50) / 80) : 0; }
  for (var ri = 0; ri <= 20; ri++) RIMA.push(String(ri / 20));   // pre-built alpha strings (no per-frame string garbage)
  function shadowSprite() {
    if (SHADOW) return SHADOW;
    var c = mkCanvas(128, 32); if (!c) return null;
    var g = c.getContext('2d'), rg = g.createRadialGradient(64, 16, 0, 64, 16, 64);
    rg.addColorStop(0, 'rgba(26,14,10,0.55)'); rg.addColorStop(0.55, 'rgba(26,14,10,0.32)'); rg.addColorStop(1, 'rgba(26,14,10,0)');
    g.setTransform(1, 0, 0, 0.25, 0, 12); g.fillStyle = rg; g.fillRect(0, -48, 128, 128);
    return (SHADOW = c);
  }
  function shadeSprite(side) {   // 256x1 horizontal ramp: transparent on the lit side, cool shade on the far side
    if (SHADE[side]) return SHADE[side];
    var c = mkCanvas(256, 1); if (!c) return null;
    var g = c.getContext('2d'), lg = g.createLinearGradient(0, 0, 256, 0);
    // lit side: a faint warm wash; far side: a cool violet-brown shade that deepens toward the back edge
    var warm = 'rgba(255,170,92,0.2)', clear = 'rgba(120,80,90,0)', far = 'rgba(36,20,58,0.52)';
    if (side === 'left') { lg.addColorStop(0, warm); lg.addColorStop(0.38, clear); lg.addColorStop(0.55, clear); lg.addColorStop(1, far); }
    else { lg.addColorStop(0, far); lg.addColorStop(0.45, clear); lg.addColorStop(0.62, clear); lg.addColorStop(1, warm); }
    g.fillStyle = lg; g.fillRect(0, 0, 256, 1);
    return (SHADE[side] = c);
  }

  function makeActor(lib, id, o) {
    var A = {}, C = lib.chars[id];
    var cur = new Float32Array(NCH), prev = new Float32Array(NCH), out = new Float32Array(NCH), smp = new Float32Array(NCH);
    var st = {
      clock: 0, loopName: 'idle', loopStart: 0,
      name: 'idle', start: 0, dur: 0, k: -1,          // current anim (k >= 0: host-driven progress)
      pName: null, pStart: 0, pK: -1, switchAt: -1e9, blend: num(o.blendMs, 140),
      capeA: 0, capeV: 0, skirtA: 0, skirtV: 0, lastPx: 0, lastTr: 0, vx: 0, facing: 1, hFor: num(o.h, 0),
      onHit: null, hitFired: false, speed: 1
    };
    var layer = null, lctx = null, rim = null, rctx = null, fl = null, fctx = null, LW = 0, LH = 0;
    var BB = new Float32Array(4), PB = new Float32Array(4);

    A.id = id;
    A.retarget = function (nid) { if (nid !== id) { id = nid; C = lib.chars[id]; A.id = id; } };
    A.ready = function () { C = lib.chars[id]; return !!(C && C.ok); };
    function animDef(name) { var R = C && C.R; return R ? R.set.anims[name] || R.set.anims.idle : null; }

    function switchTo(name, start, k) {
      // remember the pose we are leaving so the change blends instead of popping
      st.pName = st.name; st.pStart = st.start; st.pK = st.k; st.switchAt = st.clock;
      st.name = name; st.start = start; st.k = k;
    }
    A.loop = function (name, o2) {
      name = LOOPS[name] ? name : (name === 'run' ? 'walk' : 'idle');
      st.speed = clamp(num(o2 && o2.speed, 1), 0.2, 4);
      if (st.loopName === name) return A;
      st.loopName = name; st.loopStart = st.clock;
      var D = animDef(st.name);
      if (st.k < 0 && (!D || D.loop)) switchTo(name, st.clock, -1);
      return A;
    };
    A.play = function (name, o2) {
      o2 = o2 || {};
      var D = animDef(name); if (!D) return A;
      if (D.loop) return A.loop(name, o2);
      switchTo(name, st.clock, -1);
      st.dur = num(o2.dur, D.dur); st.onHit = typeof o2.onHit === 'function' ? o2.onHit : null; st.hitFired = false;
      return A;
    };
    A.attack = function (o2) { return A.play('attack', o2); };
    A.hurt = function (o2) { return A.play('hurt', o2); };
    // host-driven pose: call in the fixed step (not in draw) with the host's own progress k 0..1; pose(null) releases
    A.pose = function (name, k) {
      if (name == null) { if (st.k >= 0) switchTo(st.loopName, st.loopStart, -1); return A; }
      var D = animDef(name); if (!D) return A;
      k = clamp(num(k, 0), 0, 1);
      if (st.name !== name || st.k < 0) switchTo(name, st.clock, k); else st.k = k;
      return A;
    };
    A.reset = function () { st.clock = 0; st.name = st.loopName = 'idle'; st.start = st.loopStart = 0; st.k = -1; st.pName = null; st.switchAt = -1e9; st.capeA = st.capeV = st.skirtA = st.skirtV = 0; st.vx = 0; st.onHit = null; return A; };
    A.busy = function () { var D = animDef(st.name); return !!D && !D.loop && st.k < 0 && st.clock - st.start < st.dur; };
    A.info = function () { var D = animDef(st.name); return { anim: st.name, loop: st.loopName, k: progress(st.name, st.start, st.k, st.clock), busy: A.busy(), clock: st.clock, cape: st.capeA, dur: D ? D.dur : 0 }; };

    function progress(name, start, k, now) {
      if (k >= 0) return k;
      var D = animDef(name); if (!D) return 0;
      var dur = D.loop ? D.dur / (name === st.loopName ? st.speed : 1) : (name === st.name && st.dur ? st.dur : D.dur);
      return (now - start) / Math.max(1, dur);
    }
    // channels at clock time `now` (pure function of the stored state)
    function channels(now, dst, kAt) {
      var D = animDef(st.name); if (!D) return false;
      evalAnim(D, kAt != null ? kAt : progress(st.name, st.start, st.k, now), dst);
      var w = (now - st.switchAt) / st.blend;
      if (st.pName && w < 1) {
        var Dp = animDef(st.pName);
        if (Dp) { evalAnim(Dp, progress(st.pName, st.pStart, st.pK, Math.min(now, st.switchAt + (Dp.loop ? st.blend : 0))), prev); mixInto(dst, prev, dst, smooth(clamp(w, 0, 1))); }
      }
      return true;
    }

    // fixed step: advance the clock, finish one-shots, fire onHit, integrate the cape / skirt springs
    A.update = function (dt, o2) {
      try {
        dt = clamp(num(dt, 1000 / 60), 0, 250);
        if (o2) { st.vx = num(o2.vx, 0); if (o2.facing != null) st.facing = +o2.facing < 0 ? -1 : 1; if (o2.h != null) st.hFor = num(o2.h, st.hFor); }
        if (!(dt > 0)) return A;   // a paused host passes 0: nothing moves (a zero step used to divide by zero in the cape spring)
        var steps = Math.max(1, Math.ceil(dt / (1000 / 60) - 1e-6)), h = dt / steps;
        for (var i = 0; i < steps; i++) step(h);
      } catch (e) { warn('update failed: ' + e.message); }
      return A;
    };
    function step(h) {
      st.clock += h;
      var D = animDef(st.name); if (!D) return;
      if (!D.loop && st.k < 0) {
        var k = (st.clock - st.start) / Math.max(1, st.dur || D.dur);
        if (st.onHit && !st.hitFired && D.hitAt >= 0 && k >= D.hitAt) { st.hitFired = true; try { st.onHit(A); } catch (e) { warn('onHit threw: ' + e.message); } }
        if (k >= 1 && st.name !== 'down') switchTo(st.loopName, st.loopStart, -1);
      }
      channels(st.clock, cur);
      var R = C.R, H = R.H;
      // spring drivers: pelvis forward speed (anim + host), torso turn; cape trails behind motion
      var pv = (cur[IX.px] - st.lastPx) * 1000 / h, tv = (cur[IX.tr] - st.lastTr) * 1000 / h;
      st.lastPx = cur[IX.px]; st.lastTr = cur[IX.tr];
      var hv = st.hFor > 0 ? st.vx * st.facing / st.hFor : 0;   // heights per second, forward positive
      var sway = Math.sin(st.clock * 0.0021 + id.length) * 2.2 + Math.sin(st.clock * 0.0047) * 0.9;
      var tgt = cur[IX.cape] + sway + clamp((pv + hv) * 14, -40, 46) + clamp(tv * 0.05, -12, 12);
      spring('capeA', 'capeV', tgt, h, 34, 7.5);
      var tgs = cur[IX.skirt] + sway * 0.5 + clamp((pv + hv) * 8, -22, 26);
      spring('skirtA', 'skirtV', tgs, h, 40, 9);
    }
    function spring(a, v, tgt, h, kStiff, damp) {
      if (!isFinite(st[a]) || !isFinite(st[v])) { st[a] = isFinite(tgt) ? clamp(tgt, -60, 70) : 0; st[v] = 0; }   // never keep a NaN cape
      if (!isFinite(tgt)) return;
      var dt = h / 1000, acc = kStiff * kStiff * 0.06 * (tgt - st[a]) - damp * st[v];
      st[v] += acc * dt; st[a] += st[v] * dt;
      st[a] = clamp(st[a], -60, 70);
    }

    // ---- drawing ----
    function ensureLayer(w, h) {
      if (layer && LW >= w && LH >= h) return true;
      LW = Math.max(LW, Math.ceil(w / 64) * 64); LH = Math.max(LH, Math.ceil(h / 64) * 64);
      layer = mkCanvas(LW, LH); rim = mkCanvas(LW / 2 + 2, LH / 2 + 2); if (!layer || !rim) return false;
      PB[0] = 0; PB[1] = 0; PB[2] = LW; PB[3] = LH;
      lctx = layer.getContext('2d'); rctx = rim.getContext('2d'); lib.stats.layerAllocs++;
      return true;
    }
    var CORN = new Float32Array(2);
    function composeLayer(S, f, ox, oy, mip) {
      var R = C.R, z = R.z, ms = mip.s, img = mip.c;
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, i, q, m, a, b, cc, d, e, ff;
      for (i = 0; i < z.length; i++) {   // device bounding box of every part
        q = z[i]; m = q.m; var w = q.rect[2], hh = q.rect[3];
        for (var cx = 0; cx < 2; cx++) for (var cy = 0; cy < 2; cy++) {
          apply(m, cx * w, cy * hh, CORN);
          var X = ox + S * f * CORN[0], Y = oy + S * CORN[1];
          if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
        }
      }
      BB[0] = clamp(Math.floor(x0) - 2, 0, LW); BB[1] = clamp(Math.floor(y0) - 2, 0, LH); BB[2] = clamp(Math.ceil(x1) + 2, 0, LW); BB[3] = clamp(Math.ceil(y1) + 2, 0, LH);
      lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.globalCompositeOperation = 'source-over'; lctx.globalAlpha = 1;
      // clear only what the last frame used and what this one will use (no full-layer clears)
      lctx.clearRect(PB[0], PB[1], PB[2] - PB[0], PB[3] - PB[1]); lctx.clearRect(BB[0], BB[1], BB[2] - BB[0], BB[3] - BB[1]);
      PB[0] = BB[0]; PB[1] = BB[1]; PB[2] = BB[2]; PB[3] = BB[3];
      lctx.imageSmoothingEnabled = true; try { lctx.imageSmoothingQuality = 'low'; } catch (e2) { }
      for (i = 0; i < z.length; i++) {
        q = z[i]; m = q.m; if (!q.on) continue;
        a = S * f * m[0]; b = S * m[1]; cc = S * f * m[2]; d = S * m[3]; e = ox + S * f * m[4]; ff = oy + S * m[5];
        lctx.setTransform(a, b, cc, d, e, ff);
        var r = q.rect;
        lctx.drawImage(img, r[0] * ms, r[1] * ms, r[2] * ms, r[3] * ms, 0, 0, r[2], r[3]);
      }
      lctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    function finishLayer(S, flash, light, rimAmt, shadeAmt) {
      var bx = BB[0], by = BB[1], bw = BB[2] - BB[0], bh = BB[3] - BB[1]; if (bw <= 0 || bh <= 0) return;
      if (light === 'left' || light === 'right') {
        // one half-resolution light layer: warm rim (silhouette minus itself shifted away from the light) over a cool
        // shade ramp; composited once onto the character with source-atop (pixels outside the character are ignored)
        var dpx = Math.max(1.5, C.R.H * S * 0.014), lx = light === 'left' ? -0.82 : 0.82, ly = -0.57, sh = shadeSprite(light);
        var hx = Math.floor(bx / 2), hy = Math.floor(by / 2), hw = Math.ceil(bw / 2) + 1, hh = Math.ceil(bh / 2) + 1;
        rctx.setTransform(1, 0, 0, 1, 0, 0); rctx.globalAlpha = 1; rctx.imageSmoothingEnabled = true;
        rctx.globalCompositeOperation = 'source-over'; rctx.clearRect(hx, hy, hw, hh);
        if (rimAmt > 0) {
          rctx.drawImage(layer, hx * 2, hy * 2, hw * 2, hh * 2, hx, hy, hw, hh);
          // two cut-outs: the copy shifted by the full rim width removes the inside, the copy shifted by half of it
          // removes half: the rim is full at the edge and fades to half inward (no hard inner line, no filter needed)
          rctx.globalCompositeOperation = 'destination-out';
          rctx.globalAlpha = 0.5; rctx.drawImage(layer, hx * 2, hy * 2, hw * 2, hh * 2, hx - lx * dpx / 4, hy - ly * dpx / 4, hw, hh);
          rctx.globalAlpha = 1; rctx.drawImage(layer, hx * 2, hy * 2, hw * 2, hh * 2, hx - lx * dpx / 2, hy - ly * dpx / 2, hw, hh);
          rctx.globalCompositeOperation = 'source-in'; rctx.fillStyle = 'rgba(255,186,104,' + RIMA[Math.round(clamp(rimAmt * 0.85, 0, 1) * 20)] + ')'; rctx.fillRect(hx, hy, hw, hh);
        }
        if (sh && shadeAmt > 0) { rctx.globalCompositeOperation = 'destination-over'; rctx.globalAlpha = clamp(shadeAmt, 0, 1); rctx.drawImage(sh, 0, 0, 256, 1, hx, hy, hw, hh); rctx.globalAlpha = 1; }
        rctx.globalCompositeOperation = 'source-over';
        lctx.globalCompositeOperation = 'source-atop'; lctx.globalAlpha = 1; lctx.drawImage(rim, hx, hy, hw, hh, hx * 2, hy * 2, hw * 2, hh * 2);
      }
      if (flash > 0) {
        // hit flash (v1.2.3): the body is over-exposed, not washed towards one flat colour: a colour-dodge pass on a
        // full-resolution copy of the layer burns mid tones and lights to white while the dark line work and the
        // deepest shadows stay, then a light wash; the copy is cut back to the character (destination-in) and put on
        // the layer with source-atop. Alpha is never touched, so the flashing body stays fully opaque.
        var fa = clamp(flash, 0, 1), done = false;
        if (!fl || fl.width < LW || fl.height < LH) { fl = mkCanvas(LW, LH); fctx = fl ? fl.getContext('2d') : null; }
        if (fctx) {
          fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.globalAlpha = 1; fctx.globalCompositeOperation = 'copy';
          fctx.save(); fctx.beginPath(); fctx.rect(bx, by, bw, bh); fctx.clip();
          fctx.drawImage(layer, bx, by, bw, bh, bx, by, bw, bh);
          fctx.globalCompositeOperation = 'color-dodge';
          if (fctx.globalCompositeOperation === 'color-dodge') {
            var dv = Math.round(215 * fa); fctx.fillStyle = 'rgb(' + dv + ',' + Math.round(dv * 0.97) + ',' + Math.round(dv * 0.9) + ')'; fctx.fillRect(bx, by, bw, bh);
            fctx.globalCompositeOperation = 'source-over'; fctx.globalAlpha = 0.45 * fa; fctx.fillStyle = '#fff7ea'; fctx.fillRect(bx, by, bw, bh);
            fctx.globalAlpha = 1; fctx.globalCompositeOperation = 'destination-in'; fctx.drawImage(layer, bx, by, bw, bh, bx, by, bw, bh);
            done = true;
          }
          fctx.restore();
          if (done) { lctx.globalCompositeOperation = 'source-atop'; lctx.globalAlpha = 1; lctx.drawImage(fl, bx, by, bw, bh, bx, by, bw, bh); }
        }
        // no blend modes (very old canvas): plain opaque wash on the layer
        if (!done) { lctx.globalCompositeOperation = 'source-atop'; lctx.globalAlpha = fa; lctx.fillStyle = '#fff7ea'; lctx.fillRect(bx, by, bw, bh); }
      }
      lctx.globalCompositeOperation = 'source-over'; lctx.globalAlpha = 1;
    }

    // swoosh: the band swept by the outer third of the blade over the last TRAIL_N samples (14 ms apart) of the
    // strike, re-solved from the pose function (no history kept), drawn after the character in device px
    var TR = new Float32Array(2 * (TRAIL_N + 1)), TJ = new Float32Array(2), TG = new Float32Array(2);
    function drawTrail(ctx, R, S, f, dx, dy, capeA, skirtA, trailFn, sw) {
      // the blade's recent directions, re-solved from the drawn poses of the last TRAIL_N * TRAIL_MS ms of the strike,
      // all pivoted on the hand where it is NOW: the band hugs the drawn blade and its radius is the blade length
      var wp = R.parts.weapon; if (!wp || !wp.joints.tip) return;
      var n = 0, gx = 0, gy = 0;
      for (var j = 0; j <= TRAIL_N; j++) {
        if (!trailFn(j, smp)) break;
        solve(R, smp, capeA, skirtA); jointOf(wp, 'tip', TJ); jointOf(wp, 'grip', TG);
        if (j === 0) { gx = dx + S * f * TG[0]; gy = dy + S * TG[1]; }
        TR[n * 2] = S * f * (TJ[0] - TG[0]); TR[n * 2 + 1] = S * (TJ[1] - TG[1]);
        n++;
      }
      if (n < 3) return;
      var a0 = Math.atan2(TR[1], TR[0]), a1 = Math.atan2(TR[(n - 1) * 2 + 1], TR[(n - 1) * 2]), sweep = Math.abs(a1 - a0);
      if (sweep > Math.PI) sweep = 2 * Math.PI - sweep;
      if (sweep < 0.15) return;                                  // a thrust has no arc
      var i, t, ox2, oy2, ix, iy;
      ctx.beginPath();
      for (i = 0; i < n; i++) {                                  // outer edge: the tip, smoothed through midpoints
        ox2 = gx + TR[i * 2]; oy2 = gy + TR[i * 2 + 1];
        if (i === 0) ctx.moveTo(ox2, oy2);
        else if (i < n - 1) ctx.quadraticCurveTo(ox2, oy2, (ox2 + gx + TR[i * 2 + 2]) / 2, (oy2 + gy + TR[i * 2 + 3]) / 2);
        else ctx.lineTo(ox2, oy2);
      }
      for (i = n - 1; i >= 0; i--) {                             // inner edge: tapers from 36 % of the blade to nothing
        t = 1 - 0.36 * (1 - i / (n - 1)); ix = gx + TR[i * 2] * t; iy = gy + TR[i * 2 + 1] * t;
        if (i === n - 1 || i === 0) ctx.lineTo(ix, iy);
        else { var t2 = 1 - 0.36 * (1 - (i - 1) / (n - 1)); ctx.quadraticCurveTo(ix, iy, (ix + gx + TR[i * 2 - 2] * t2) / 2, (iy + gy + TR[i * 2 - 1] * t2) / 2); }
      }
      ctx.closePath();
      var g = ctx.createLinearGradient(gx + TR[0], gy + TR[1], gx + TR[(n - 1) * 2], gy + TR[(n - 1) * 2 + 1]);
      var col = typeof sw === 'string' ? sw : '255,240,214';
      g.addColorStop(0, 'rgba(' + col + ',0.8)'); g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g; ctx.fill();
    }
    // draw the character with its feet at (x, footY) in the caller's current transform
    function render(ctx, x, footY, o2, chans, capeA, skirtA, flashAuto, trailFn) {
      var R = C.R, H = R.H, hLog = num(o2.h, st.hFor || 64), f = num(o2.facing, st.facing) < 0 ? -1 : 1;
      var tr = null; try { tr = ctx.getTransform ? ctx.getTransform() : null; } catch (e) { tr = null; }
      var ta = tr ? tr.a : 1, tb = tr ? tr.b : 0, tc = tr ? tr.c : 0, td = tr ? tr.d : 1, te = tr ? tr.e : 0, tf = tr ? tr.f : 0;
      var dev = Math.sqrt(Math.abs(ta * td - tb * tc)) || 1;
      var S = hLog / H * dev;                       // atlas px -> device px
      solve(R, chans, capeA, skirtA);
      var bd = R.bounds, w = Math.ceil((bd[2] - bd[0]) * H * S) + 8, h = Math.ceil((bd[3] - bd[1]) * H * S) + 8;
      if (!ensureLayer(w, h)) return false;
      var ox = Math.round(-bd[0] * H * S) + 4, oy = Math.round(-bd[1] * H * S) + 4;
      var mip = mipFor(lib, C, S);
      composeLayer(S, f, ox, oy, mip);
      var light = o2.light === undefined ? 'left' : o2.light;
      if (light === 'auto') light = f > 0 ? 'left' : 'right';
      finishLayer(S, o2.flash === 'auto' ? flashAuto : clamp(num(o2.flash, 0), 0, 1), light, num(o2.rim, 0.42), num(o2.shade, 1));
      // feet in device px
      var dx = ta * x + tc * footY + te, dy = tb * x + td * footY + tf;
      var roll = chans[IX.rr] * D2R * f, alpha = clamp(num(o2.alpha, 1), 0, 1);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (o2.shadow !== false) {   // under the feet; a fallen body's shadow slides under the body
        var sp = shadowSprite(), sw = H * S * 0.36 * (1 + Math.abs(roll) * 0.9), shh = sw * 0.25;
        if (sp) { ctx.globalAlpha = alpha * num(o2.shadowAlpha, 1); ctx.drawImage(sp, Math.round(dx - sw / 2 + chans[IX.px] * H * S * f * 0.6 + Math.sin(roll) * H * S * 0.4), Math.round(dy - shh / 2), Math.round(sw), Math.round(shh)); }
      }
      ctx.globalAlpha = alpha * (ctx.globalAlpha > 0 ? 1 : 1);
      ctx.globalAlpha = alpha;
      var bx = BB[0], by = BB[1], bw = BB[2] - BB[0], bh = BB[3] - BB[1];
      if (bw > 0 && bh > 0) {
        if (roll) { ctx.translate(Math.round(dx), Math.round(dy - Math.pow(Math.abs(Math.sin(roll)), 6) * H * S * 0.075)); ctx.rotate(roll); ctx.drawImage(layer, bx, by, bw, bh, bx - ox, by - oy, bw, bh); }
        else ctx.drawImage(layer, bx, by, bw, bh, Math.round(dx) - ox + bx, Math.round(dy) - oy + by, bw, bh);
      }
      if (o2.swoosh && trailFn && !roll) { ctx.globalAlpha = alpha; drawTrail(ctx, R, S, f, dx, dy, capeA, skirtA, trailFn, o2.swoosh); }
      ctx.restore();
      lib.stats.draws++;
      return true;
    }

    A.draw = function (ctx, x, footY, o2) {
      if (!C || !C.ok || !ctx) return false;
      try {
        o2 = o2 || {};
        channels(st.clock, out);
        return render(ctx, x, footY, o2, out, st.capeA, st.skirtA, A.hurtFlash(), o2.swoosh ? actorTrail : null);
      } catch (e) { warn('draw failed: ' + e.message); return false; }
    };
    // trail sample j of the current one-shot (false outside its strike window)
    function actorTrail(j, dst) {
      var D = animDef(st.name); if (!D || !D.trail || D.loop) return false;
      var now = st.clock - j * TRAIL_MS, k = st.k >= 0 ? st.k - j * TRAIL_MS / D.dur : progress(st.name, st.start, -1, now);
      if (k < D.trail[0] || k > D.trail[1]) return false;
      channels(now, dst, k); return true;   // the same blended pose the character was drawn with at that moment
    }
    A.hurtFlash = function () {
      var D = animDef('hurt'); if (st.name !== 'hurt' || !D) return 0;
      return flashCurve(st.k >= 0 ? st.k * D.dur : st.clock - st.start);
    };
    A.walkSpeed = function () { return walkSpeedOf(C); };
    // stateless: pose from the arguments only. {anim, k} or {pose (A-14 names), k}; t (seconds) for idle breathing
    var POSEMAP = { idle: ['idle', 0, 1], ready: ['attack', 0, 0.22], dash: ['walk', 0, 0.5], strike: ['attack', 0.3, 1], cast: ['cast', 0.1, 1],
      draw: ['attack', 0, 0.22], loose: ['attack', 0.3, 1], guard: ['guard', 0, 1], hurt: ['hurt', 0, 1], cheer: ['cheer', 0, 1], walk: ['walk', 0, 1] };
    var slK = 0, slD = null;
    function statelessTrail(j, dst) { var kj = slK - j * TRAIL_MS / slD.dur; if (kj < slD.trail[0] || kj > slD.trail[1]) return false; evalAnim(slD, kj, dst); return true; }
    A.drawStateless = function (ctx, x, footY, o2) {
      if (!C || !C.ok || !ctx) return false;
      var t = num(o2.t, 0) * 1000, name = o2.anim, k = num(o2.k, 0), D;
      if (!name && o2.pose) { var pm = POSEMAP[o2.pose] || POSEMAP.idle; name = pm[0]; k = pm[1] + (pm[2] - pm[1]) * clamp(k, 0, 1); }
      name = name || 'idle'; D = animDef(name);
      if (!D) return false;
      if (D.loop && (o2.k == null || name === 'idle' || o2.pose === 'cheer' && false)) k = (t + (id.length * 397)) / D.dur + (name === 'idle' ? 0 : k);
      evalAnim(D, k, out);
      var fall = clamp(num(o2.fall, 0), 0, 1);
      if (fall > 0) { evalAnim(animDef('down'), fall, smp); mixInto(out, out, smp, smooth(clamp(fall * 1.4, 0, 1))); }
      // cape: lag of the pelvis motion over the last ~0.2 of the anim, plus a slow sway
      var dk = D.loop ? 60 / D.dur : 0.06;
      evalAnim(D, D.loop ? k - dk : Math.max(0, k - dk), smp);
      var pv = (out[IX.px] - smp[IX.px]) / Math.max(1e-3, dk * D.dur / 1000);
      var sway = Math.sin(t * 0.0021 + id.length) * 2.2;
      var capeA = out[IX.cape] + sway + clamp(pv * 14, -40, 46), skirtA = out[IX.skirt] + sway * 0.5 + clamp(pv * 8, -22, 26);
      slK = k; slD = D;
      var fl = name === 'hurt' ? flashCurve(clamp(k, 0, 1) * D.dur) : 0;
      var trail = o2.swoosh && D.trail && !D.loop ? statelessTrail : null;
      try { return render(ctx, x, footY, o2, out, capeA, skirtA, fl, trail); } catch (e) { warn('drawPose failed: ' + e.message); return false; }
    };
    // where a named joint is drawn now (logical px), e.g. the weapon tip for hit sparks: A.point('tip', x, footY, {h, facing})
    var PT = new Float32Array(2);
    A.point = function (which, x, footY, o2) {
      if (!C || !C.ok) return null;
      o2 = o2 || {};
      channels(st.clock, out); solve(C.R, out, st.capeA, st.skirtA);
      var R = C.R, q = which === 'tip' ? R.parts.weapon : which === 'head' ? R.parts.head : which === 'hand' ? R.parts['fore' + R.weaponHand] : R.parts.torso;
      if (!q) return null;
      jointOf(q, which === 'tip' ? 'tip' : which === 'head' ? 'top' : which === 'hand' ? 'hand' : 'neck', PT);
      var s = num(o2.h, st.hFor || 64) / R.H, f = num(o2.facing, st.facing) < 0 ? -1 : 1;
      return { x: x + PT[0] * s * f, y: footY + PT[1] * s };
    };
    A._solveFor = function (chans) { solve(C.R, chans, st.capeA, st.skirtA); return C.R; };   // checks only
    A._channels = function () { channels(st.clock, out); return out; };
    A._layer = function () { return { canvas: layer, bb: BB }; };
    return A;
  }

  var api = { version: VERSION, load: load, sets: SETS, channels: CH, anims: ANIM_NAMES, _evalAnim: evalAnim, _compiled: COMPILED, _ik: ik };
  root.GameDNA_Cutout = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
