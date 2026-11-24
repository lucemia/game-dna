/* GameDNA K-01 · Camera director · module v1.2 (plain script, no dependencies, one global: GameDNA_Camera)
 *
 *   const cam = GameDNA_Camera.create({
 *     view:   { x: 0, y: 0, w: 640, h: 360 },        // screen rect the world is drawn into (logical canvas px)
 *     bounds: { x: 0, y: 0, w: LEVEL_W, h: LEVEL_H },// world rect the view must stay inside (level size)
 *     params: { view: 'side', follow: 1.8, look: 0.15, shake: 3, roll: 1.2 },
 *     seed: 1
 *   });
 *   // every fixed step (also under ?t= fast-forward and ?auto=1), after the world moved:
 *   cam.update(STEP_MS, { target: { x, y, vx, vy, onGround, facing }, extra: [boss], legacy: { x: oldCamX, y: oldCamY } });
 *   // drawing: cam.apply(ctx); drawWorldInWorldCoords(); cam.restore(ctx);   (or subtract cam.x / cam.y yourself)
 *   // events:  cam.hit({ strength: 'heavy', at }), cam.trauma(0.4), cam.punch(0.05, { at }), cam.cut(x, y) on teleports
 *
 * View only: it never reads or writes game state. Keep the game's own camera variable for every gameplay reader
 * (spawn-on-screen, despawn, AI wake-up, autoplay) and use this camera only where the world is DRAWN.
 * Deterministic: everything advances in update(dt) from game time (no wall clock, no Math.random); same seed + same calls
 * = same frames, so ?t=<ms>&freeze=1 is exact.
 */
(function (root) {
  'use strict';
  var VERSION = '1.2';
  var DEFAULTS = {
    view: 'side',        // 'side' (platformer, run & gun) | 'top' (top-down, 2D look-ahead, no platform snapping)
    follow: 1.8,         // horizontal follow spring, Hz (critically damped)
    followY: 1.4,        // vertical follow spring, Hz
    deadW: 0.08,         // dead zone width, fraction of the view width
    deadH: 0.12,         // dead zone height, fraction of the view height (top view, or side view without platform snapping)
    look: 0.15,          // look-ahead distance at full speed, fraction of the view width
    lookHz: 0.7,         // look-ahead spring, Hz (low = eased turn-around)
    idleLook: 0.4,       // share of the look-ahead kept while standing still (side view)
    platform: 'auto',    // 'auto' | 'on' | 'off': side view re-frames vertically only on landing or when the target is far off
    farY: 0.28,          // vertical band (fraction of view height from centre) the target may leave the ground line by before the camera follows in the air
    biasY: 0.06,         // the camera sits this fraction of the view height above the target (shows more sky / floor ahead)
    safe: 0.8,           // safe frame: the target is kept inside this central fraction of the view, whatever the springs do
    frame: 'zoom',       // multi-target framing: 'zoom' (zoom out to fit extras) | 'bias' (no zoom, lean toward them) | 'off'
    minZoom: 0.72,       // furthest zoom-out for framing
    minSize: 0.1,        // framing never zooms out so far that the target (its h) is drawn smaller than this fraction of the view height
    blend: 0.9,          // framing / room changes blend in and out through their own spring, Hz (lower = slower, softer)
    pad: 0.1,            // framing margin, fraction of the view
    punch: 0.06,         // zoom punch on a finisher (heavy = 60 %), fraction of zoom
    shake: 3,            // max trauma shake, % of the view height
    roll: 1.2,           // max trauma roll, degrees
    decay: 1.6,          // trauma lost per second
    freq: 14,            // shake noise frequency, Hz
    snap: 'auto',        // 'auto' | 'pixel' | 'smooth': pixel = whole-pixel camera, zoom 1, no roll
    reduced: 'system',   // 'system' | 'on' | 'off': reduced motion = shake x0.3, no roll, no punch
    mode: 'director'     // 'director' | 'off' (pass the game's own camera through: for A/B comparisons)
  };
  var RANGES = {
    follow: [0.2, 10], followY: [0.2, 10], deadW: [0, 0.5], deadH: [0, 0.5], look: [0, 0.45], lookHz: [0.1, 5], idleLook: [0, 1],
    farY: [0.05, 0.45], biasY: [-0.3, 0.3], safe: [0.3, 0.98], minZoom: [0.4, 1], minSize: [0, 0.4], blend: [0.2, 5], pad: [0, 0.3], punch: [0, 0.25],
    shake: [0, 10], roll: [0, 6], decay: [0.2, 8], freq: [1, 40]
  };
  var ENUMS = { view: ['side', 'top'], platform: ['auto', 'on', 'off'], frame: ['zoom', 'bias', 'off'], snap: ['auto', 'pixel', 'smooth'],
    reduced: ['system', 'on', 'off'], mode: ['director', 'off'] };
  var FALL_HZ = 2.4;     // vertical spring while a fall lead is active (a drop is short: the camera has to arrive before the landing)
  var STRENGTH = { light: { tr: 0.22, pu: 0 }, heavy: { tr: 0.42, pu: 0.6 }, finisher: { tr: 0.78, pu: 1 } };
  var ALIAS = { normal: 'light', weak: 'light', small: 'light', hit: 'heavy', strong: 'heavy', big: 'heavy', crit: 'finisher', critical: 'finisher',
    kill: 'finisher', ko: 'finisher', boss: 'finisher', explosion: 'finisher' };
  var BUILTIN = { id: 'pixel16', pixel: true, palette: { ink: '#06061a', fx: { white: '#ffffff', crit: '#ffb43a' } } };

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function hash(seed, ch, i) {
    var h = (Math.imul(seed | 0, 374761393) ^ Math.imul(ch + 1, 668265263) ^ Math.imul(i | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return ((h >>> 0) / 4294967296) * 2 - 1;
  }
  // smooth 1-D value noise in [-1, 1], two octaves; t in noise cycles
  function noise(seed, ch, t) {
    function one(tt, c) { var i = Math.floor(tt), f = tt - i, s = f * f * (3 - 2 * f); return hash(seed, c, i) * (1 - s) + hash(seed, c, i + 1) * s; }
    return 0.72 * one(t, ch) + 0.28 * one(t * 2.13 + 17.1, ch + 7);
  }
  // exact critically damped spring step toward goal g (stable for any dt): returns [x, v]
  function crit(x, v, g, hz, dt) {
    var w = 2 * Math.PI * hz, d = x - g, e = Math.exp(-w * dt), j = (v + w * d) * dt;
    return [g + (d + j) * e, (v - w * j) * e];
  }
  function rect(r, d) {
    if (!r || typeof r !== 'object') return d;
    var o = { x: num(r.x, 0), y: num(r.y, 0), w: num(r.w != null ? r.w : r.width, NaN), h: num(r.h != null ? r.h : r.height, NaN) };
    return isNum(o.w) && isNum(o.h) && o.w > 0 && o.h > 0 ? o : d;
  }

  function create(options) {
    var o = options || {}, SK = null;
    try { SK = o.skin === false || !root.GameDNA_Skin ? null : root.GameDNA_Skin.resolve(o.skin); } catch (e) { SK = null; }
    var look = SK || BUILTIN;
    var seed = num(o.seed, 1) | 0;
    var view = rect(o.view, null) || (function () {
      var c = o.canvas || (root.document && root.document.querySelector && root.document.querySelector('canvas'));
      return { x: 0, y: 0, w: c ? c.width : 640, h: c ? c.height : 360 };
    })();
    var level = rect(o.bounds, null);
    function uiList() {
      var u = o.uiRects; try { u = typeof u === 'function' ? u() : u; } catch (e) { u = null; }
      if (!Array.isArray(u)) return [];
      var out = []; for (var i = 0; i < u.length; i++) { var r = rect(u[i], null); if (r) out.push(r); } return out;
    }
    var rooms = Array.isArray(o.rooms) ? o.rooms.map(function (r) { return rect(r, null); }).filter(Boolean) : [];
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    var ST = { updates: 0, cuts: 0, autoCuts: 0, traumaCalls: 0, hits: 0, punches: 0, maxTrauma: 0, maxShakePx: 0, maxRollDeg: 0, minZoom: 1,
      clampFrames: 0, catchUps: 0, maxPan: 0, maxPanStep: 0, maxPanTarget: 0, framedFrames: 0, landings: 0, selfTicks: 0, badInput: 0, noTarget: 0, applies: 0, unbalanced: 0, errors: 0 };
    var warned = {};
    function warn(key, msg) { if (warned[key]) return; warned[key] = 1; try { if (root.console) root.console.warn('[GameDNA_Camera] ' + msg); } catch (e) { } }

    function setParams(p) {
      if (!p || typeof p !== 'object') return;
      for (var key in p) {
        if (!(key in DEFAULTS)) continue;
        var v = p[key];
        if (ENUMS[key]) { if (ENUMS[key].indexOf(v) >= 0) P[key] = v; }
        else if (RANGES[key]) { v = +v; if (isFinite(v)) P[key] = clamp(v, RANGES[key][0], RANGES[key][1]); }
      }
    }
    setParams(o.params);
    if (o.view && typeof o.view === 'string') setParams({ view: o.view });

    var reducedSys = false;
    try { reducedSys = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { }
    function reduced() { return P.reduced === 'on' || (P.reduced === 'system' && reducedSys); }
    function pixel() {
      if (P.snap === 'pixel') return true;
      if (P.snap === 'smooth') return false;
      if (o.pixel === true) return true;
      if (o.pixel === false) return false;
      if (SK && SK.pixel) return true;
      return view.h <= 270;                       // native 256x224, 320x180, 240x160 ...: a pixel game
    }
    function zoomable() { return o.zoom !== false && !pixel() && P.frame === 'zoom'; }

    // ------------------------------------------------------------------ state
    var S;
    function reset() {
      S = {
        cx: NaN, cy: NaN, vx: 0, vy: 0,            // base centre (spring), px/s
        gx: NaN, gy: NaN,                          // dead-zone goal
        lx: 0, lvx: 0, ly: 0, lvy: 0,              // look-ahead offset (spring)
        face: 1, vmax: 0, refY: NaN, ground: false,
        zl: 0, zv: 0,                              // log zoom spring
        kx: 0, kvx: 0, ky: 0, kvy: 0,              // composition offset (framing, rooms) on top of the hero goal: its own capped spring
        hsx: 0, hsy: 0, peak: 0,                   // smoothed target speed (px/s), peak base pan speed
        hfx: 0, hfy: 0, fall: 0,                   // fast-smoothed target speed (px/s), fall lead (px)
        tr: 0, nt: 0, punches: [], time: 0,
        prevT: null, steps: 0, lastSteps: -1, idleApplies: 0,
        out: { cx: 0, cy: 0, x: 0, y: 0, zoom: 1, angle: 0, ox: 0, oy: 0 },
        dbg: { focus: null, goal: null, dead: null, box: null, eff: null, safe: null, extras: [], refY: NaN, clampX: 0, clampY: 0, framing: false },
        legacy: null, target: null, room: null, opened: 0, fixedRoom: null
      };
    }
    reset();

    function eff() {                               // effective bounds: room ∩ level
      var b = level, r = S.fixedRoom || S.room;
      if (r && b) {
        var x0 = Math.max(b.x, r.x), y0 = Math.max(b.y, r.y), x1 = Math.min(b.x + b.w, r.x + r.w), y1 = Math.min(b.y + b.h, r.y + r.h);
        return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : b;
      }
      return r || b;
    }
    function clampAxis(c, lo, size, half) { return size <= 2 * half ? lo + size / 2 : clamp(c, lo + half, lo + size - half); }
    function clampC(cx, cy, z, b) {
      if (!b) return [cx, cy];
      return [clampAxis(cx, b.x, b.w, view.w / (2 * z)), clampAxis(cy, b.y, b.h, view.h / (2 * z))];
    }

    function readTarget(inp, dt) {
      var t = inp && inp.target;
      if (!t || typeof t !== 'object' || !isNum(+t.x) || !isNum(+t.y)) { if (t != null) ST.badInput++; return null; }
      var T = { x: +t.x, y: +t.y, w: num(t.w, 0), h: num(t.h, 0) };
      var pv = S.prevT;
      // the host's vx / vy may be px per step or px per second: only their direction and ratio to the fastest seen are used
      T.vx = t.vx != null && isNum(+t.vx) ? +t.vx : NaN;
      T.vy = t.vy != null && isNum(+t.vy) ? +t.vy : NaN;
      // dx / dy: px per second from the position change (used to carry the camera when the safe frame catches the target)
      T.dx = pv ? (T.x - pv.x) / dt : 0; T.dy = pv ? (T.y - pv.y) / dt : 0;
      if (!isNum(T.vx)) T.vx = T.dx; if (!isNum(T.vy)) T.vy = T.dy;
      T.onGround = typeof t.onGround === 'boolean' ? t.onGround : null;
      if (t.facing === 1 || t.facing === -1) T.facing = t.facing;
      else if (isNum(+t.facing) && t.facing !== null && t.facing !== '') T.facing = +t.facing > 0 ? 1 : -1;
      else T.facing = 0;
      return T;
    }

    function cut(x, y) {
      try {
        var T = S.target;
        var cx = isNum(+x) && x !== null ? +x : T ? T.x : S.cx, cy = isNum(+y) && y !== null ? +y : T ? T.y : S.cy;
        if (!isNum(cx) || !isNum(cy)) return;
        var lx = P.view === 'side' ? S.face * P.look * view.w * P.idleLook : 0;
        var z = Math.exp(S.zl);
        S.cx = cx + lx; S.cy = cy - P.biasY * view.h / z; S.vx = S.vy = 0;
        S.lx = lx; S.lvx = 0; S.ly = 0; S.lvy = 0; S.kx = S.ky = S.kvx = S.kvy = 0; S.pcx = NaN;
        S.gx = S.cx; S.gy = S.cy; S.refY = cy;
        var c = clampC(S.cx, S.cy, z, eff()); S.cx = c[0]; S.cy = c[1];
        S.punches = []; S.prevT = { x: isNum(+x) && x !== null ? +x : cx, y: isNum(+y) && y !== null ? +y : cy }; ST.cuts++;
        output(1 / 60, true);
      } catch (e) { ST.errors++; }
    }

    // ------------------------------------------------------------------ update (fixed step)
    function update(dtMs, inp) {
      try { step(dtMs, inp); } catch (e) { ST.errors++; warn('err', 'update failed: ' + (e && e.message)); }
    }
    function step(dtMs, inp) {
      var dt = clamp(num(dtMs, 1000 / 60), 0, 100) / 1000;
      ST.updates++; S.steps++; S.time += dt;
      inp = inp || {};
      if (inp.bounds) { var nb = rect(inp.bounds, null); if (nb) level = nb; }
      if ('room' in inp) S.room = rect(inp.room, null);
      S.legacy = inp.legacy && isNum(+inp.legacy.x) && isNum(+inp.legacy.y) ? { x: +inp.legacy.x, y: +inp.legacy.y } : null;
      var T = dt > 0 ? readTarget(inp, dt) : S.target;
      if (!T) ST.noTarget++;
      // rooms given at create: the one holding the target
      if (rooms.length && T) {
        S.room = null;
        for (var ri = 0; ri < rooms.length; ri++) { var q = rooms[ri]; if (T.x >= q.x && T.x < q.x + q.w && T.y >= q.y && T.y < q.y + q.h) { S.room = q; break; } }
      }
      var z = Math.exp(S.zl);
      if (T && (!isNum(S.cx) || !isNum(S.cy))) { S.target = T; cut(T.x, T.y); z = Math.exp(S.zl); }
      else if (T && S.prevT) {
        var jump = Math.hypot(T.x - S.prevT.x, T.y - S.prevT.y);
        if (jump > 0.6 * Math.max(view.w, view.h) / z) { S.target = T; ST.autoCuts++; cut(T.x, T.y); S.prevT = { x: T.x, y: T.y }; return; }
      }
      if (T) { S.target = T; S.prevT = { x: T.x, y: T.y }; }
      if (!isNum(S.cx)) { // nothing to follow yet: sit on the legacy camera or the bounds' corner
        var L0 = S.legacy;
        S.cx = L0 ? L0.x + view.w / 2 : level ? level.x + view.w / 2 : view.w / 2;
        S.cy = L0 ? L0.y + view.h / 2 : level ? level.y + view.h / 2 : view.h / 2;
        S.gx = S.cx; S.gy = S.cy;
      }
      var hw = view.w / 2, hh = view.h / 2, side = P.view === 'side';
      var dbg = S.dbg; dbg.extras = []; dbg.framing = false; dbg.box = null;

      if (T && dt > 0) {
        // --- look-ahead (eased spring toward facing x speed)
        var sp = Math.hypot(T.vx, side ? 0 : T.vy);
        S.vmax = Math.max(S.vmax, Math.abs(T.vx), side ? 0 : Math.abs(T.vy));
        var vm = S.vmax > 1e-6 ? S.vmax : 1;
        if (side) {
          if (T.facing) S.face = T.facing;
          else if (Math.abs(T.vx) > 0.25 * vm) S.face = T.vx > 0 ? 1 : -1;
          var frac = Math.min(1, Math.abs(T.vx) / vm);
          var lgx = S.face * P.look * view.w / z * (P.idleLook + (1 - P.idleLook) * frac), lgy = 0;
        } else {
          var f2 = Math.min(1, sp / vm), ux = sp > 1e-6 ? T.vx / sp : 0, uy = sp > 1e-6 ? T.vy / sp : 0;
          lgx = ux * f2 * P.look * view.w / z; lgy = uy * f2 * P.look * view.h / z;
        }
        // smoothed target speed (px/s); the lead also covers the dead zone and the follow spring's lag (2v / w), so the visible lead
        // at full speed is about the look distance, not look minus lag
        var ks = 1 - Math.exp(-dt / 0.25);
        S.hsx += (T.dx - S.hsx) * ks; S.hsy += (T.dy - S.hsy) * ks;
        var kf = 1 - Math.exp(-dt / 0.08);
        S.hfx += (T.dx - S.hfx) * kf; S.hfy += (T.dy - S.hfy) * kf;
        var lagX = clamp(S.hsx * 2 / (2 * Math.PI * P.follow), -0.25 * view.w / z, 0.25 * view.w / z);
        var dzLead = P.deadW * view.w / z / 2;
        if (side) lgx += S.face * dzLead * frac + lagX * (Math.abs(T.vx) > 0.25 * vm ? 1 : 0);
        else { lgx += ux * f2 * dzLead + lagX * f2; lgy += clamp(S.hsy * 2 / (2 * Math.PI * P.followY), -0.25 * view.h / z, 0.25 * view.h / z) * f2; }
        // the lead swings at most ~0.9x the target's speed (min 15 % of the view per second), so a turn-around never whips
        var lcx = Math.max(0.15 * view.w, 0.9 * Math.abs(S.hsx)), lcy = Math.max(0.15 * view.h, 0.9 * Math.abs(S.hsy));
        var a = crit(S.lx, S.lvx, lgx, P.lookHz, dt); S.lvx = clamp(a[1], -lcx, lcx); S.lx = clamp(a[0], S.lx - lcx * dt, S.lx + lcx * dt);
        a = crit(S.ly, S.lvy, lgy, P.lookHz, dt); S.lvy = clamp(a[1], -lcy, lcy); S.ly = clamp(a[0], S.ly - lcy * dt, S.ly + lcy * dt);

        // --- focus point and dead zone
        var fx = T.x + S.lx, fy = T.y + S.ly - P.biasY * view.h / z;
        var dzw = P.deadW * view.w / z / 2, dzh = P.deadH * view.h / z / 2;
        var plat = side && (P.platform === 'on' || (P.platform === 'auto' && T.onGround !== null));
        if (!isNum(S.gx)) { S.gx = fx; S.gy = fy; }
        if (fx > S.gx + dzw) S.gx = fx - dzw; else if (fx < S.gx - dzw) S.gx = fx + dzw;
        // fall lead (side view): a long, fast drop leads the camera downward by its own lag plus ~0.1 s of the fall, so the landing
        // comes into view before touchdown (instead of the hero sinking to the bottom edge); ramps in with speed (and, with platform
        // snapping, with depth below the ground band), so ordinary hops never move the camera
        var fv = side && T.onGround !== true ? Math.max(0, plat ? S.hfy : Math.min(S.hsy, S.hfy)) : 0, fallG = 0;
        if (fv > 0) {
          var vref = view.h / z, ramp = clamp((fv - 0.8 * vref) / (0.6 * vref), 0, 1);
          fallG = ramp * (Math.min(fv * 2 / (2 * Math.PI * Math.max(P.followY, FALL_HZ)), 0.5 * vref) + Math.min(fv * 0.15, 0.2 * vref));
        }
        if (plat) {
          if (T.onGround) { if (!S.ground && isNum(S.refY) && Math.abs(T.y - S.refY) > 0.5) ST.landings++; S.refY = T.y; }
          if (!isNum(S.refY)) S.refY = T.y;
          S.ground = !!T.onGround;
          var gy = S.refY - P.biasY * view.h / z;
          var up = P.farY * view.h / z, down = 0.7 * up;          // falling needs to see below sooner
          if (T.y < gy - up) gy = T.y + up; else if (T.y > gy + down) { gy = T.y - down; fallG *= clamp((T.y - (S.refY - P.biasY * view.h / z + down)) / (0.25 * view.h / z), 0, 1); }
          else fallG = 0;
          S.fall = T.onGround ? 0 : fallG;
          S.gy = gy + S.fall; dbg.refY = S.refY;
        } else {
          if (fy > S.gy + dzh) S.gy = fy - dzh; else if (fy < S.gy - dzh) S.gy = fy + dzh;
          if (side) { var gyl = clamp(T.y + fallG - P.biasY * view.h / z, S.gy, S.gy + 0.6 * view.h / z); S.fall = gyl - S.gy; S.gy = gyl; }
          dbg.refY = NaN;
        }
        dbg.focus = { x: fx, y: fy }; dbg.dead = { x: S.gx - dzw, y: S.gy - dzh, w: dzw * 2, h: plat ? 0 : dzh * 2 };
      }

      // --- multi-target framing
      var gx = S.gx, gy2 = S.gy, zg = 1;
      var ex = Array.isArray(inp.extra) ? inp.extra : inp.extra && typeof inp.extra === 'object' ? [inp.extra] : [];
      if (T && P.frame !== 'off' && ex.length) {
        var bx0 = T.x - T.w / 2, bx1 = T.x + T.w / 2, by0 = T.y - T.h / 2, by1 = T.y + T.h / 2, any = false;
        for (var i = 0; i < ex.length; i++) {
          var e = ex[i];
          if (!e || !isNum(+e.x) || !isNum(+e.y)) { if (e != null) ST.badInput++; continue; }
          var wgt = clamp(num(e.weight, 1), 0, 1);
          // distance-weighted entry: full weight within 0.75 of a view, none beyond 1.25 views (no lurch when a far target appears)
          var dn = Math.max(Math.abs(+e.x - T.x) / view.w, Math.abs(+e.y - T.y) / view.h), sm = clamp((dn - 0.75) / 0.5, 0, 1);
          wgt *= 1 - sm * sm * (3 - 2 * sm);
          if (wgt <= 0.001) continue;
          var exx = T.x + (+e.x - T.x) * wgt, eyy = T.y + (+e.y - T.y) * wgt, ew = num(e.w, 0) / 2, eh = num(e.h, 0) / 2;
          if (Math.abs(exx - T.x) > 1.6 * view.w || Math.abs(eyy - T.y) > 1.6 * view.h) continue;   // too far to frame
          bx0 = Math.min(bx0, exx - ew); bx1 = Math.max(bx1, exx + ew); by0 = Math.min(by0, eyy - eh); by1 = Math.max(by1, eyy + eh);
          dbg.extras.push({ x: exx, y: eyy, w: ew * 2, h: eh * 2 }); any = true;
        }
        if (any) {
          var px = P.pad * view.w, py = P.pad * view.h;
          bx0 -= px; bx1 += px; by0 -= py; by1 += py;
          dbg.box = { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 }; dbg.framing = true; ST.framedFrames++;
          // HUD bands (uiRects at least a quarter of the view wide, e.g. a boss bar): the framing box is fitted between them, so an
          // extra target is composed clear of the bar, not under it
          var tIn = 0, bIn = 0, uis = uiList();
          for (var u1 = 0; u1 < uis.length; u1++) {
            var ur = uis[u1], ury = ur.y - view.y;
            if (ur.w < 0.25 * view.w || (ur.w >= view.w * 0.9 && ur.h >= view.h * 0.9)) continue;
            if (ury + ur.h <= hh) tIn = Math.max(tIn, ury + ur.h); else if (ury >= hh) bIn = Math.max(bIn, view.h - ury);
          }
          tIn = Math.min(tIn, 0.3 * view.h); bIn = Math.min(bIn, 0.3 * view.h);
          var bcx = (bx0 + bx1) / 2, bcy = (by0 + by1) / 2;
          if (zoomable()) {
            zg = clamp(Math.min(view.w / (bx1 - bx0), (view.h - tIn - bIn) / (by1 - by0)), P.minZoom, 1);
            if (T.h > 0 && P.minSize > 0) zg = Math.max(zg, Math.min(1, P.minSize * view.h / T.h));   // keep the hero readable
          }
          // hero first: the framing centre may move only so far that the target stays in the middle of the view
          bcy -= (tIn - bIn) / (2 * zg);
          var sx = 0.55 * P.safe * hw / zg, sy = 0.5 * P.safe * hh / zg;
          gx = clamp(bcx, T.x - sx, T.x + sx); gy2 = clamp(bcy, T.y - sy, T.y + sy);
          if (P.frame === 'bias' || !zoomable()) { gx = S.gx + (gx - S.gx) * 0.6; gy2 = S.gy + (gy2 - S.gy) * 0.6; }
        }
      }
      // --- rooms (soft) and level (hard) on the goal. A room never pushes the target out of the middle of the view: once the target
      // walks toward a room wall the room yields, so a stale or open room can't pin the hero at the screen edge.
      var B = eff(), R = S.fixedRoom || S.room;
      if (B && zoomable()) zg = Math.max(zg, Math.min(1, Math.max(view.w / B.w, view.h / B.h)));
      if (R && R !== level) {
        var cr = clampC(gx, gy2, zg, B); gx = cr[0]; gy2 = cr[1];
        if (T) { var yx = 0.5 * P.safe * hw / zg, yy = 0.5 * P.safe * hh / zg; gx = clamp(gx, T.x - yx, T.x + yx); gy2 = clamp(gy2, T.y - yy, T.y + yy); }
      }
      // composition (framing + room) is an offset from the hero goal, blended by its own spring with a speed cap, so a target that
      // appears, a room that opens or a boss that dies never steps the goal: the pan stays within ~2x the hero's speed
      var hgx = S.gx, hgy = S.gy;
      if (dt > 0) {
        var kc = crit(S.kx, S.kvx, gx - hgx, P.blend, dt), kd = crit(S.ky, S.kvy, gy2 - hgy, P.blend, dt);
        // a composition that is let go (room released, boss gone) drifts back slowly while the target stands still; one that comes in
        // (boss appears) keeps the 0.2 view/s floor
        var relX = Math.abs(gx - hgx) < Math.abs(S.kx), relY = Math.abs(gy2 - hgy) < Math.abs(S.ky);
        var capX = Math.max((relX ? 0.06 : 0.2) * view.w, 1.1 * Math.min(Math.abs(S.hsx), Math.abs(S.hfx) + 0.06 * view.w)),
          capY = Math.max((relY ? 0.06 : 0.2) * view.h, 1.1 * Math.min(Math.abs(S.hsy), Math.abs(S.hfy) + 0.06 * view.h));
        var mxs = capX * dt, mys = capY * dt;
        var nkx = clamp(kc[0], S.kx - mxs, S.kx + mxs), nky = clamp(kd[0], S.ky - mys, S.ky + mys);
        S.kvx = clamp(kc[1], -capX, capX); S.kvy = clamp(kd[1], -capY, capY); S.kx = nkx; S.ky = nky;
      }
      gx = hgx + S.kx; gy2 = hgy + S.ky;
      var cg = clampC(gx, gy2, zg, level); gx = cg[0]; gy2 = cg[1];
      dbg.goal = { x: gx, y: gy2 }; dbg.eff = B;

      if (dt > 0) {
        // zoom spring in log space
        var zz = crit(S.zl, S.zv, Math.log(zg), 0.8, dt), zcap = 0.3 * dt;          // zoom changes at most ~30 % per second
        S.zv = clamp(zz[1], -0.3, 0.3); S.zl = clamp(zz[0], S.zl - zcap, S.zl + zcap); z = Math.exp(S.zl);
        // follow springs
        // touchdown after a fast drop: the camera's downward speed is cut, so it settles on the landing without sinking past it
        if (T && T.onGround === true && S.landV > 0 && S.vy > 0) S.vy *= 0.3;
        S.landV = T && T.onGround === false ? S.fall : 0;
        var X = crit(S.cx, S.vx, gx, P.follow, dt), Y = crit(S.cy, S.vy, gy2, S.fall > 0 ? Math.max(P.followY, FALL_HZ) : P.followY, dt);
        // the base pan stays tied to the target: at most ~2x its current speed (floor 5 % of the view per second, or the composition blend), so the camera
        // does not keep sliding on after the target stops (a released room, a framing change); the safe frame still catches up
        if (T) {
          var pcap = Math.max(0.05 * view.w / z, 1.1 * Math.abs(S.kvx), 2 * Math.abs(S.hfx));
          if (Math.abs(X[1]) > pcap) { var nx = clamp(X[0], S.cx - pcap * dt, S.cx + pcap * dt); X = [nx, clamp(X[1], -pcap, pcap)]; }
        }
        if (S.fall > 0) {                          // a drop: the camera may overtake the target, but at most ~1.4x its fall speed
          var vcap = Math.max(0.5 * view.h / z, 1.4 * Math.abs(S.hfy));
          if (Math.abs(Y[1]) > vcap) Y = [clamp(Y[0], S.cy - vcap * dt, S.cy + vcap * dt), clamp(Y[1], -vcap, vcap)];
        }
        S.cx = X[0]; S.vx = X[1]; S.cy = Y[0]; S.vy = Y[1];
        // safe frame: never let the target leave it, whatever the springs say
        if (T) {
          var shx = P.safe * hw / z, shy = P.safe * hh / z, caught = false;
          // HUD-aware: the safe frame shrinks away from UI rects near the edges (screen px), where the target would be hidden
          var L0 = -shx, R0 = shx, U0 = -shy, D0 = shy, ui = uiList();
          if (ui.length) {
            var tsx = (T.x - S.cx) * z + hw, tsy = (T.y - S.cy) * z + hh, mw = Math.max(T.w, 8) * z / 2 + 4, mh = Math.max(T.h, 8) * z / 2 + 4;
            for (var ui0 = 0; ui0 < ui.length; ui0++) {
              var r = ui[ui0], rx = r.x - view.x, ry = r.y - view.y;
              if (r.w >= view.w * 0.9 && r.h >= view.h * 0.9) continue;
              var overX = tsx + mw > rx && tsx - mw < rx + r.w, overY = tsy + mh > ry && tsy - mh < ry + r.h;
              if (overX && ry + r.h < hh) U0 = Math.max(U0, (ry + r.h + mh - hh) / z);           // top band: keep below it
              else if (overX && ry > hh) D0 = Math.min(D0, (ry - mh - hh) / z);                  // bottom band: keep above it
              if (overY && r.w < hw && rx + r.w < hw) L0 = Math.max(L0, (rx + r.w + mw - hw) / z); // left panel
              else if (overY && r.w < hw && rx > hw) R0 = Math.min(R0, (rx - mw - hw) / z);       // right panel
            }
            if (U0 > D0) U0 = D0 = (U0 + D0) / 2; if (L0 > R0) L0 = R0 = (L0 + R0) / 2;
          }
          if (T.x - S.cx > R0) { S.cx = T.x - R0; S.vx = Math.max(S.vx, T.dx); caught = true; }
          else if (T.x - S.cx < L0) { S.cx = T.x - L0; S.vx = Math.min(S.vx, T.dx); caught = true; }
          if (T.y - S.cy > D0) { S.cy = T.y - D0; S.vy = Math.max(S.vy, T.dy); caught = true; }
          else if (T.y - S.cy < U0) { S.cy = T.y - U0; S.vy = Math.min(S.vy, T.dy); caught = true; }
          if (caught) ST.catchUps++;
        }
        // hard clamp to the LEVEL (rooms are soft): stop the spring at the wall, no bounce
        if (level) {
          var c2 = clampC(S.cx, S.cy, z, level);
          dbg.clampX = c2[0] !== S.cx ? (c2[0] > S.cx ? -1 : 1) : 0; dbg.clampY = c2[1] !== S.cy ? (c2[1] > S.cy ? -1 : 1) : 0;
          if (dbg.clampX) { S.cx = c2[0]; S.vx = 0; } if (dbg.clampY) { S.cy = c2[1]; S.vy = 0; }
          if (dbg.clampX || dbg.clampY) ST.clampFrames++;
        }
        if (isNum(S.pcx) && S.steps > 2) { var pan = Math.hypot(S.cx - S.pcx, S.cy - S.pcy) / dt; S.pan = pan; if (pan > ST.maxPan) { ST.maxPan = pan; ST.maxPanStep = S.steps; ST.maxPanTarget = Math.hypot(S.hsx, S.hsy); } }
        S.pcx = S.cx; S.pcy = S.cy;
        // trauma decays, noise clock runs on game time
        S.tr = Math.max(0, S.tr - P.decay * dt);
        S.nt += dt * P.freq;
        for (var pi = S.punches.length - 1; pi >= 0; pi--) { S.punches[pi].t += dt; if (S.punches[pi].t >= S.punches[pi].len) S.punches.splice(pi, 1); }
      }
      output(dt, false);
    }

    function punchNow() {
      var p = 0, ax = 0, ay = 0, wsum = 0;
      for (var i = 0; i < S.punches.length; i++) {
        var q = S.punches[i], att = 0.06, v;
        if (q.t < att) { var u = q.t / att; v = 1 - (1 - u) * (1 - u); }
        else { var r = (q.t - att) / Math.max(0.001, q.len - att); v = Math.pow(1 - Math.min(1, r), 3); }
        v *= q.amt; p += v;
        if (q.at) { ax += q.at.x * v; ay += q.at.y * v; wsum += v; }
      }
      return { p: Math.min(p, 0.25), at: wsum > 0 ? { x: ax / wsum, y: ay / wsum } : null };
    }

    function output(dt, isCut) {
      var O = S.out, px = pixel(), red = reduced();
      if (P.mode === 'off') {
        var L = S.legacy, T = S.target;
        var lx = L ? L.x : T ? T.x - view.w / 2 : S.cx - view.w / 2, ly = L ? L.y : T ? T.y - view.h / 2 : S.cy - view.h / 2;
        if (!L && level) { var cc = clampC(lx + view.w / 2, ly + view.h / 2, 1, level); lx = cc[0] - view.w / 2; ly = cc[1] - view.h / 2; }
        O.x = px ? Math.round(lx) : lx; O.y = px ? Math.round(ly) : ly; O.cx = O.x + view.w / 2; O.cy = O.y + view.h / 2; O.zoom = 1; O.angle = 0; O.ox = O.oy = 0;
        return;
      }
      var z = px ? 1 : Math.exp(S.zl);
      var pu = px || red ? { p: 0, at: null } : punchNow();
      var zo = z * (1 + pu.p);
      var cx = S.cx, cy = S.cy;
      if (pu.at && pu.p > 0) { var f = 1 - 1 / (1 + pu.p); cx += (pu.at.x - cx) * f; cy += (pu.at.y - cy) * f; }
      // trauma: shake^2, noise from game time, translation in screen px + small roll
      var sh = S.tr * S.tr, amp = P.shake / 100 * view.h * (red ? 0.3 : 1);
      var ox = amp * sh * noise(seed, 0, S.nt), oy = amp * sh * noise(seed, 1, S.nt);
      var ang = px || red ? 0 : P.roll * Math.PI / 180 * sh * noise(seed, 2, S.nt * 0.8);
      if (ang) {                                     // zoom in just enough that the rolled view still covers the screen
        var s = Math.abs(Math.sin(ang)), c = Math.cos(ang), ar = Math.max(view.w / view.h, view.h / view.w);
        zo *= c + s * ar;
      }
      // re-clamp the punched centre (base camera stays inside the level; shake may overhang by its own amplitude)
      if (level) { var c3 = clampC(cx, cy, zo, level); cx = c3[0]; cy = c3[1]; }
      cx -= ox / zo; cy -= oy / zo;
      var x = cx - view.w / 2, y = cy - view.h / 2;
      if (px) { x = Math.round(x); y = Math.round(y); ox = Math.round(ox); oy = Math.round(oy); cx = x + view.w / 2; cy = y + view.h / 2; }
      O.x = x; O.y = y; O.cx = cx; O.cy = cy; O.zoom = zo; O.angle = ang; O.ox = ox; O.oy = oy;
      ST.maxTrauma = Math.max(ST.maxTrauma, S.tr); ST.maxShakePx = Math.max(ST.maxShakePx, Math.hypot(ox, oy));
      ST.maxRollDeg = Math.max(ST.maxRollDeg, Math.abs(ang) * 180 / Math.PI); ST.minZoom = Math.min(ST.minZoom, zo);
    }

    // ------------------------------------------------------------------ events
    function trauma(amount) {
      try { var a = clamp(num(amount, 0.3), 0, 1); S.tr = Math.min(1, S.tr + a); ST.traumaCalls++; } catch (e) { ST.errors++; }
      return S.tr;
    }
    function punch(amount, opts) {
      try {
        var a = clamp(num(amount, P.punch), 0, 0.25); if (!(a > 0)) return;
        opts = opts || {};
        var at = opts.at && isNum(+opts.at.x) && isNum(+opts.at.y) ? { x: +opts.at.x, y: +opts.at.y } : null;
        if (S.punches.length >= 4) S.punches.shift();
        S.punches.push({ amt: a, t: 0, len: clamp(num(opts.ms, 280), 60, 1500) / 1000, at: at }); ST.punches++;
      } catch (e) { ST.errors++; }
    }
    function hit(a, b) {
      try {
        var opt = typeof a === 'object' && a ? a : b && typeof b === 'object' ? b : {};
        var s = typeof a === 'string' ? a : typeof a === 'number' ? a : opt.strength;
        if (opt.crit === true) s = 'finisher';
        var key;
        if (typeof s === 'number') key = s >= 0.75 ? 'finisher' : s >= 0.4 ? 'heavy' : 'light';
        else key = STRENGTH[s] ? s : ALIAS[s] || 'heavy';
        var K = STRENGTH[key];
        ST.hits++;
        trauma(K.tr);
        if (K.pu > 0) punch(P.punch * K.pu, { at: opt.at });
        return key;
      } catch (e) { ST.errors++; return 'heavy'; }
    }
    // compatible with GameDNA_HitStop.shake(px, ms) and onShake callbacks: px of shake -> trauma
    function shake(px, ms) {
      // amplitude = shake% x view height x trauma^2, so px -> trauma = sqrt(px / amplitude); never lowers a stronger trauma
      var amp = Math.max(1e-6, P.shake / 100 * view.h), t = Math.sqrt(clamp(num(px, 4) / amp, 0, 1));
      ST.traumaCalls++; if (t > S.tr) S.tr = t;
      return S.tr;
    }

    // ------------------------------------------------------------------ drawing
    function selfTick() {
      // apply() is pure: any number of draws per step (redraws, pause screens, high refresh rates) gives the same transform until the
      // next update(). A camera whose update() never runs stays where it is; stats().selfTicks counts its applies after the 30th.
      if (S.steps > 0) return;
      if (++S.idleApplies > 30) { ST.selfTicks++; warn('noupdate', 'apply() runs but update() is never called: the camera does not move'); }
    }
    function apply(ctx) {
      try {
        ST.applies++; selfTick();
        if (!ctx || !ctx.save) return S.out;
        var O = S.out;
        ctx.save(); S.opened++;
        ctx.translate(view.x + view.w / 2, view.y + view.h / 2);
        if (O.angle) ctx.rotate(O.angle);
        if (O.zoom !== 1) ctx.scale(O.zoom, O.zoom);
        ctx.translate(-O.cx, -O.cy);
      } catch (e) { ST.errors++; }
      return S.out;
    }
    // for games that subtract cam.x / cam.y themselves: only roll and zoom about the view centre
    function applyScreen(ctx) {
      try {
        ST.applies++; selfTick();
        if (!ctx || !ctx.save) return S.out;
        var O = S.out, mx = view.x + view.w / 2, my = view.y + view.h / 2;
        ctx.save(); S.opened++;
        if (O.angle || O.zoom !== 1) { ctx.translate(mx, my); if (O.angle) ctx.rotate(O.angle); if (O.zoom !== 1) ctx.scale(O.zoom, O.zoom); ctx.translate(-mx, -my); }
      } catch (e) { ST.errors++; }
      return S.out;
    }
    function restore(ctx) {
      try { if (S.opened > 0 && ctx && ctx.restore) { ctx.restore(); S.opened--; } else ST.unbalanced++; } catch (e) { ST.errors++; }
    }
    function toScreen(wx, wy) {
      var O = S.out, dx = (num(wx, 0) - O.cx) * O.zoom, dy = (num(wy, 0) - O.cy) * O.zoom, c = Math.cos(O.angle), s = Math.sin(O.angle);
      return { x: view.x + view.w / 2 + dx * c - dy * s, y: view.y + view.h / 2 + dx * s + dy * c };
    }
    function toWorld(sx, sy) {
      var O = S.out, dx = num(sx, 0) - view.x - view.w / 2, dy = num(sy, 0) - view.y - view.h / 2, c = Math.cos(-O.angle), s = Math.sin(-O.angle);
      return { x: O.cx + (dx * c - dy * s) / O.zoom, y: O.cy + (dx * s + dy * c) / O.zoom };
    }
    // world rect the view can show this frame (for culling tiles and sprites when drawing)
    function visible(pad) {
      var O = S.out, p = num(pad, 0), c = Math.abs(Math.cos(O.angle)), s = Math.abs(Math.sin(O.angle));
      var w = (view.w * c + view.h * s) / O.zoom, h = (view.w * s + view.h * c) / O.zoom;
      return { x: O.cx - w / 2 - p, y: O.cy - h / 2 - p, w: w + 2 * p, h: h + 2 * p };
    }
    function inView(x, y, w, h, pad) {
      var v = visible(pad); w = num(w, 0); h = num(h, 0);
      return x + w >= v.x && x <= v.x + v.w && y + h >= v.y && y <= v.y + v.h;
    }

    // debug overlay in screen coords (call after restore): safe frame, dead zone, look-ahead, framing box, ground line, bounds
    function debug(ctx) {
      try {
        if (!ctx) return;
        var D = S.dbg, O = S.out, fx = (look.palette && look.palette.fx) || {};
        var cA = '#7ff0c8', cB = fx.crit || '#ffb43a', cC = '#8fb8ff', cR = '#ff6b7d';
        ctx.save();
        ctx.lineWidth = Math.max(1, view.h / 360); var lw = ctx.lineWidth;
        function srect(r, col, dash, fill) {
          if (!r) return;
          var a = toScreen(r.x, r.y), b = toScreen(r.x + r.w, r.y + r.h);
          ctx.setLineDash(dash || []); ctx.strokeStyle = col;
          if (fill) { ctx.fillStyle = fill; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); }
          ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x - a.x), Math.round(b.y - a.y));
        }
        // safe frame (screen)
        var sw = view.w * P.safe, shh = view.h * P.safe;
        ctx.setLineDash([6 * lw, 5 * lw]); ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.strokeRect(view.x + (view.w - sw) / 2 + 0.5, view.y + (view.h - shh) / 2 + 0.5, sw, shh);
        // dead zone
        if (D.dead) {
          if (D.dead.h > 0) srect(D.dead, cA, [], 'rgba(127,240,200,0.10)');
          else { var d0 = toScreen(D.dead.x, D.dead.y), d1 = toScreen(D.dead.x + D.dead.w, D.dead.y); ctx.setLineDash([]); ctx.strokeStyle = cA; ctx.beginPath(); ctx.moveTo(d0.x, d0.y - 6 * lw); ctx.lineTo(d0.x, d0.y + 6 * lw); ctx.moveTo(d1.x, d1.y - 6 * lw); ctx.lineTo(d1.x, d1.y + 6 * lw); ctx.moveTo(d0.x, d0.y); ctx.lineTo(d1.x, d1.y); ctx.stroke(); }
        }
        // ground line (platform snapping)
        if (isNum(D.refY)) { var g0 = toScreen(O.cx - view.w, D.refY), g1 = toScreen(O.cx + view.w, D.refY); ctx.setLineDash([3 * lw, 4 * lw]); ctx.strokeStyle = cC; ctx.beginPath(); ctx.moveTo(g0.x, g0.y); ctx.lineTo(g1.x, g1.y); ctx.stroke(); }
        // framing box and extras
        if (D.box) { srect(D.box, cB, [8 * lw, 4 * lw]); for (var i = 0; i < D.extras.length; i++) { var e = toScreen(D.extras[i].x, D.extras[i].y); ctx.setLineDash([]); ctx.strokeStyle = cB; ctx.beginPath(); ctx.arc(e.x, e.y, 7 * lw, 0, 6.2832); ctx.stroke(); } }
        // target, look-ahead arrow, goal cross
        var T = S.target;
        if (T && D.focus) {
          var t = toScreen(T.x, T.y), f = toScreen(D.focus.x, D.focus.y);
          ctx.setLineDash([]); ctx.strokeStyle = cA; ctx.fillStyle = cA;
          ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(f.x, f.y); ctx.stroke();
          ctx.beginPath(); ctx.arc(f.x, f.y, 4 * lw, 0, 6.2832); ctx.fill();
          ctx.beginPath(); ctx.arc(t.x, t.y, 3 * lw, 0, 6.2832); ctx.stroke();
        }
        if (D.goal) { var q = toScreen(D.goal.x, D.goal.y), r = 6 * lw; ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(q.x - r, q.y); ctx.lineTo(q.x + r, q.y); ctx.moveTo(q.x, q.y - r); ctx.lineTo(q.x, q.y + r); ctx.stroke(); }
        // level edge reached
        ctx.strokeStyle = cR; ctx.lineWidth = 3 * lw; ctx.setLineDash([]);
        if (D.clampX < 0 || (level && O.cx - view.w / 2 / O.zoom <= level.x + 0.5)) { ctx.beginPath(); ctx.moveTo(view.x + 1.5 * lw, view.y); ctx.lineTo(view.x + 1.5 * lw, view.y + view.h); ctx.stroke(); }
        if (D.clampX > 0 || (level && O.cx + view.w / 2 / O.zoom >= level.x + level.w - 0.5)) { ctx.beginPath(); ctx.moveTo(view.x + view.w - 1.5 * lw, view.y); ctx.lineTo(view.x + view.w - 1.5 * lw, view.y + view.h); ctx.stroke(); }
        if (level && O.cy - view.h / 2 / O.zoom <= level.y + 0.5) { ctx.beginPath(); ctx.moveTo(view.x, view.y + 1.5 * lw); ctx.lineTo(view.x + view.w, view.y + 1.5 * lw); ctx.stroke(); }
        if (level && O.cy + view.h / 2 / O.zoom >= level.y + level.h - 0.5) { ctx.beginPath(); ctx.moveTo(view.x, view.y + view.h - 1.5 * lw); ctx.lineTo(view.x + view.w, view.y + view.h - 1.5 * lw); ctx.stroke(); }
        // trauma meter
        if (S.tr > 0) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(view.x + view.w - 70 * lw, view.y + view.h - 12 * lw, 62 * lw, 6 * lw); ctx.fillStyle = cR; ctx.fillRect(view.x + view.w - 69 * lw, view.y + view.h - 11 * lw, 60 * lw * S.tr, 4 * lw); }
        ctx.restore();
      } catch (e) { ST.errors++; }
    }

    function clear() { var keepT = S.target; reset(); S.target = keepT; }
    function setBounds(b) { var r = rect(b, null); if (r) level = r; }
    function setRoom(r) { S.fixedRoom = rect(r, null); }
    function setView(v) { var r = rect(v, null); if (r) view = r; }
    function stats() { var out = {}; for (var key in ST) out[key] = ST[key]; out.trauma = S.tr; out.zoom = S.out.zoom; out.pixel = pixel(); out.reduced = reduced(); return out; }
    function params() { var out = {}; for (var key in P) out[key] = P[key]; return out; }
    function state() {
      var O = S.out, D = S.dbg;
      return { x: O.x, y: O.y, cx: O.cx, cy: O.cy, zoom: O.zoom, angle: O.angle, shakeX: O.ox, shakeY: O.oy,
        base: { cx: S.cx, cy: S.cy, vx: S.vx, vy: S.vy, zoom: Math.exp(S.zl) }, trauma: S.tr, look: { x: S.lx, y: S.ly }, refY: S.refY,
        goal: D.goal, focus: D.focus, dead: D.dead, box: D.box, framing: D.framing, clampX: D.clampX, clampY: D.clampY,
        bounds: level, room: S.fixedRoom || S.room, view: { x: view.x, y: view.y, w: view.w, h: view.h }, safe: P.safe,
        target: S.target ? { x: S.target.x, y: S.target.y } : null, legacy: S.legacy, mode: P.mode, pixel: pixel(), steps: S.steps };
    }

    var inst = {
      version: VERSION, update: update, apply: apply, applyScreen: applyScreen, restore: restore,
      trauma: trauma, punch: punch, hit: hit, shake: shake, cut: cut, clear: clear,
      toScreen: toScreen, toWorld: toWorld, visible: visible, inView: inView, debug: debug,
      setBounds: setBounds, setRoom: setRoom, setView: setView, setParams: setParams, params: params, stats: stats, state: state, reduced: reduced
    };
    // live read-only outputs: cam.x, cam.y (top-left of the view at zoom 1, world px), cam.zoom, cam.angle, cam.cx, cam.cy
    ['x', 'y', 'zoom', 'angle', 'cx', 'cy'].forEach(function (key) { Object.defineProperty(inst, key, { enumerable: true, get: function () { return S.out[key]; } }); });
    return inst;
  }

  root.GameDNA_Camera = { version: VERSION, create: create, defaults: function () { var o = {}; for (var k in DEFAULTS) o[k] = DEFAULTS[k]; return o; } };
})(typeof window !== 'undefined' ? window : this);
