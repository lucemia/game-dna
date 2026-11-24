/* GameDNA E-10 · Squash, stretch & anticipation · module v1.1 (plain script, no dependencies, one global)
 *
 *   const ss = GameDNA_SquashStretch.create({ params: { amount: 1, snap: 'auto' } });
 *   ss.attach('hero', { w: 12, h: 16, maxSpeed: 1.6, maxFall: 5 });        // sprite size (native px) + the speeds that mean "full"
 *   ss.attach('knight', { w: 16, h: 24, stiffness: 0.5 });                 // optional per actor: amount (x global), stiffness 0..1 (less squash)
 *   // in the fixed step, after the actor moved:
 *   ss.motion('hero', hero.vx, hero.vy, hero.onGround);                     // stretch from speed, lean, auto land / take-off
 *   ss.event('foe-3', 'hit', 1, dir);                                       // also 'land' | 'jump' | 'attack' | 'charge' | 'release'
 *   ss.update(STEP_MS);                                                     // once per fixed step (game time, never wall clock)
 *   // in the draw pass, around the existing sprite draw only:
 *   ss.apply(ctx, 'hero', footX, footY); drawHero(); ss.restore(ctx);       // or ss.wrap(ctx, id, footX, footY, () => drawHero())
 *
 * The module only changes how sprites are DRAWN (a canvas transform about the feet). It never touches game state, hit boxes,
 * timing or input. sx * sy = 1 (volume kept), shear has determinant 1. Everything advances with update(dt): deterministic.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0', FRAME = 1000 / 60, SUB = 1000 / 120, LUNGE_HOLD = 50;
  var DEFAULTS = { amount: 1, squash: 0.28, stretch: 0.2, spring: 6, wobble: 0.55, lean: 9, breathe: 0.025, walk: 0.05, anticipation: 70, snap: 'auto', reduced: 'system', view: 'side' };
  var EVENTS = { land: 1, jump: 1, hit: 1, attack: 1, charge: 1, release: 1, squash: 1, stretch: 1 };
  var ALIAS = { landing: 'land', landed: 'land', impact: 'land', takeoff: 'jump', 'take-off': 'jump', hop: 'jump', hurt: 'hit', damage: 'hit', struck: 'hit',
    swing: 'attack', strike: 'attack', shoot: 'attack', cast: 'attack', windup: 'charge', 'wind-up': 'charge', crouch: 'charge', telegraph: 'charge', unleash: 'release', pop: 'stretch' };

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function strHash(s) { s = String(s); var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

  function create(options) {
    var o = options || {};
    var SK = null;
    try { SK = o.skin === false || !root.GameDNA_Skin ? null : root.GameDNA_Skin.resolve(o.skin); } catch (e) { SK = null; }
    var P = {};
    for (var k in DEFAULTS) P[k] = DEFAULTS[k];
    // a skin may suggest the squash depth (motion.squash = {x, y, ms}); timing never comes from the skin
    if (SK && SK.motion && SK.motion.squash && !(o.params && o.params.squash != null)) P.squash = clamp(1 - num(SK.motion.squash.y, 0.8), 0.05, 0.5);
    setParams(o.params || {});
    var sysReduced = false;
    try { sysReduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { }

    var actors = {}, order = [];
    var acc = 0, clock = 0, updates = 0, depth = [];
    var S = { actors: 0, updates: 0, applies: 0, restores: 0, strayRestores: 0, events: 0, land: 0, jump: 0, hit: 0, attack: 0, charge: 0, release: 0, squash: 0, stretch: 0,
      autoLand: 0, autoJump: 0, unknownEvents: 0, badInput: 0, selfAdvanced: 0, minSy: 1, maxSy: 1, maxLean: 0, maxVolErr: 0, deformedApplies: 0 };
    var drawnLast = {};

    function setParams(p) {
      p = p || {};
      for (var k in p) {
        if (!(k in DEFAULTS) || p[k] == null) continue;
        if (typeof DEFAULTS[k] === 'number') P[k] = num(p[k], P[k]); else P[k] = String(p[k]);
      }
      P.amount = clamp(P.amount, 0, 2); P.squash = clamp(P.squash, 0, 0.6); P.stretch = clamp(P.stretch, 0, 0.6);
      P.spring = clamp(P.spring, 1, 30); P.wobble = clamp(P.wobble, 0, 0.95); P.lean = clamp(P.lean, 0, 30);
      P.breathe = clamp(P.breathe, 0, 0.1); P.walk = clamp(P.walk, 0, 0.2); P.anticipation = clamp(P.anticipation, 0, 400);
      if (['auto', 'pixel', 'smooth'].indexOf(P.snap) < 0) P.snap = 'auto';
      if (['system', 'on', 'off'].indexOf(P.reduced) < 0) P.reduced = 'system';
      if (['side', 'top'].indexOf(P.view) < 0) P.view = 'side';
    }
    function reduced() { return P.reduced === 'on' || (P.reduced === 'system' && sysReduced); }

    function attach(id, opt) {
      if (id == null) return null;
      var key = String(id), a = actors[key];
      opt = opt || {};
      if (!a) {
        a = actors[key] = { id: key, w: 16, h: 16, maxSpeed: 2, maxFall: 5, view: null, d: 0, dv: 0, l: 0, lv: 0, vx: 0, vy: 0, ground: null, prevVy: 0,
          seenMotion: false, phase: strHash(key) * Math.PI * 2, stride: 0, script: null, charging: false, chargeDir: 0, lastUpd: -1, staleApplies: 0, sx: 1, sy: 1, k: 0, mute: 0, amt: 1, stiff: 0, leanHold: 0, leanHoldV: 0 };
        order.push(key); S.actors++;
      }
      if (opt.w != null) a.w = Math.max(1, num(opt.w, a.w));
      if (opt.h != null) a.h = Math.max(1, num(opt.h, a.h));
      if (opt.maxSpeed != null) a.maxSpeed = Math.max(1e-6, num(opt.maxSpeed, a.maxSpeed));
      if (opt.maxFall != null) a.maxFall = Math.max(1e-6, num(opt.maxFall, a.maxFall));
      if (opt.view === 'side' || opt.view === 'top') a.view = opt.view;
      if (opt.amount != null) a.amt = clamp(num(opt.amount, a.amt), 0, 2);           // per-actor multiplier of the global amount
      if (opt.stiffness != null) a.stiff = clamp(num(opt.stiffness, a.stiff), 0, 1);  // 0 = soft (slime), 0.5 = armour: squash / stretch only, lean unchanged
      return a;
    }
    function get(id) { return id == null ? null : (actors[String(id)] || attach(id)); }
    function detach(id) { var key = String(id); if (!actors[key]) return; delete actors[key]; delete drawnLast[key]; order.splice(order.indexOf(key), 1); }
    function viewOf(a) { return a.view || P.view; }

    // per-step motion: velocity in any unit, as long as maxSpeed / maxFall use the same unit; +vy = down the screen
    function motion(id, vx, vy, ground) {
      if (vx && typeof vx === 'object') { ground = vx.ground != null ? vx.ground : (vx.onGround != null ? vx.onGround : vx.grounded); vy = vx.vy; vx = vx.vx; }
      var a = get(id); if (!a) return;
      vx = num(vx, NaN); vy = num(vy, NaN);
      if (!isFinite(vx) || !isFinite(vy)) { S.badInput++; vx = isFinite(vx) ? vx : 0; vy = isFinite(vy) ? vy : 0; }
      var g = ground == null ? null : !!ground;
      if (viewOf(a) === 'side' && g !== null && a.ground !== null && a.seenMotion) {
        if (g && !a.ground && a.mute <= 0) fire(a, 'land', clamp(Math.max(a.prevVy, a.vy) / a.maxFall, 0.25, 1), 0, true);
        else if (!g && a.ground && vy < 0 && a.mute <= 0 && !(a.script && a.script.kind === 'jump')) fire(a, 'jump', clamp(-vy / a.maxFall, 0.4, 1), 0, true);
      }
      a.prevVy = a.vy; a.vx = vx; a.vy = vy; if (g !== null) a.ground = g; a.seenMotion = true;
    }

    function fire(a, kind, s, dir, auto) {
      var amt = P.amount * (reduced() ? 0.5 : 1);
      s = clamp(num(s, 1), 0, 2); dir = dir > 0 ? 1 : dir < 0 ? -1 : 0;
      var leanK = Math.tan(P.lean * Math.PI / 180);
      S.events++; S[kind] = (S[kind] || 0) + 1;
      if (auto) { if (kind === 'land') S.autoLand++; else S.autoJump++; }
      a.leanHold = 0;
      a.mute = 2;  // an explicit event and the motion-detected one on the same step count once
      if (kind === 'land') { a.d = Math.min(a.d, -P.squash * s * amt); a.dv = 0; a.script = { kind: 'hold', t: 0, dur: 50, v: a.d, s: 1, dir: 0 }; }
      else if (kind === 'hit') { a.charging = false; a.d = Math.min(a.d, -P.squash * 0.85 * s * amt); a.dv = 0; if (dir) { a.l = dir * leanK * 0.9 * s * amt; a.lv = 0; } a.script = { kind: 'hold', t: 0, dur: 50, v: a.d, s: 1, dir: 0 }; }
      else if (kind === 'squash') { a.d = Math.min(a.d, -P.squash * s * amt); a.dv = 0; }
      else if (kind === 'stretch') { a.dv += P.stretch * s * amt * P.spring * Math.PI * 2 * 1.25; }
      else if (kind === 'jump') a.script = { kind: 'jump', t: 0, dur: P.anticipation * 0.6, s: s * amt, dir: 0 };
      else if (kind === 'attack') a.script = { kind: 'attack', t: 0, dur: P.anticipation, s: s * amt, dir: dir || (a.vx > 0 ? 1 : a.vx < 0 ? -1 : 0) };
      else if (kind === 'charge') { a.charging = true; a.chargeDir = dir; a.script = { kind: 'charge', t: 0, dur: Infinity, s: amt * clamp(s, 0.3, 1.5), dir: dir }; }
      else if (kind === 'release') { if (a.charging || (a.script && a.script.kind === 'charge')) { a.charging = false; a.script = null; pop(a, 1.6 * amt, 0); a.l = a.chargeDir * leanK * amt; a.lv = 0; } }
    }
    function pop(a, s, dir) {
      var leanK = Math.tan(P.lean * Math.PI / 180);
      var w = P.spring * Math.PI * 2;                  // peak of an underdamped spring kicked with v from rest is about v / w
      a.dv += P.stretch * s * w * 1.25;
      if (dir) a.lv += dir * leanK * s * w * 0.8 * 1.1;
    }

    function event(id, kind, strength, dir) {
      if (kind && typeof kind === 'object') { var q = kind; kind = q.kind || q.type; strength = q.strength; dir = q.dir; }
      kind = String(kind || '').toLowerCase(); kind = ALIAS[kind] || kind;
      if (!EVENTS[kind]) { S.unknownEvents++; return false; }
      var a = get(id); if (!a) return false;
      if (typeof strength === 'string') strength = ({ light: 0.5, small: 0.5, heavy: 1, finisher: 1.4, crit: 1.4, big: 1.4 })[strength] || 1;
      fire(a, kind, strength == null ? 1 : strength, num(dir, 0), false);
      return true;
    }

    function stepActor(a, h) {   // h in ms
      var red = reduced(), amt = P.amount * (red ? 0.5 : 1), side = viewOf(a) === 'side';
      var leanK = Math.tan(P.lean * Math.PI / 180);
      var sp = clamp(Math.abs(a.vx) / a.maxSpeed, 0, 1);
      // targets
      var dT = 0, lT = clamp(a.vx / a.maxSpeed, -1, 1) * leanK * amt * (side && a.ground === false ? 0.5 : 1);
      if (side && a.ground === false) dT = clamp(Math.abs(a.vy) / a.maxFall, 0, 1) * P.stretch * amt;          // stretch along the fall / rise
      if (sp > 0.08 && (a.ground !== false || !side)) {                                                           // stride bounce while moving
        a.stride += h / 1000 * (1.6 + 1.4 * sp) * Math.PI * 2;
        if (!red) dT += P.walk * amt * sp * (0.5 + 0.5 * Math.cos(a.stride * 2));
      }
      if (!red && sp <= 0.08 && (a.ground !== false || !side) && !a.charging) dT += P.breathe * amt * Math.sin(clock / 1000 * Math.PI * 2 / 2.6 + a.phase);
      var sc = a.script;
      if (sc) {
        sc.t += h;
                if (sc.kind === 'hold') { dT = sc.v; lT = a.l; }
        else if (sc.kind === 'jump') { dT = -P.squash * 0.55 * sc.s; }
        else if (sc.kind === 'attack') { dT = -P.squash * 0.45 * sc.s; lT = -sc.dir * leanK * 0.9 * sc.s; }
        else if (sc.kind === 'charge') { var grow = 1 - Math.exp(-sc.t / 120); dT = -P.squash * 0.6 * sc.s * grow; lT = -sc.dir * leanK * 0.7 * sc.s * grow; dT += 0.012 * Math.sin(sc.t / 1000 * Math.PI * 2 * 7) * sc.s; }
        if (sc.kind !== 'charge' && sc.t >= sc.dur) {
          a.script = null;
          if (sc.kind === 'jump') pop(a, sc.s * 1.1, 0);
          else if (sc.kind === 'attack') { pop(a, sc.s * 1.7, 0); a.l = sc.dir * leanK * sc.s; a.lv = 0; a.leanHold = LUNGE_HOLD; a.leanHoldV = a.l; }   // the lunge: stretch + lean into the blow, lean held ~3 frames
        }
        // scripted poses (hold, anticipation, charge) ease in exponentially (time constant 22 ms, stable at any step); the spring takes over after
        if (a.script) {
          var e = 1 - Math.exp(-h / 22);
          a.d += (dT - a.d) * e; a.l += (lT - a.l) * e; a.dv = 0; a.lv = 0;
          return;
        }
      }
      var w = P.spring * Math.PI * 2, z = red ? 1 : 1 - P.wobble, dt = h / 1000;
      a.dv += (-w * w * (a.d - dT) - 2 * z * w * a.dv) * dt; a.d += a.dv * dt;
      var wl = w * 0.8;
      if (a.leanHold > 0) { a.leanHold -= h; a.l = a.leanHoldV; a.lv = 0; }
      else { a.lv += (-wl * wl * (a.l - lT) - 2 * z * wl * a.lv) * dt; a.l += a.lv * dt; }
      a.d = clamp(a.d, -0.6, 0.8); a.l = clamp(a.l, -0.8, 0.8);
      if (Math.abs(a.d) < 1e-5 && Math.abs(a.dv) < 1e-4) { a.d = 0; a.dv = 0; }
    }

    function advance(dt) {
      acc += clamp(num(dt, FRAME), 0, 250);
      while (acc >= SUB - 1e-6) {
        acc -= SUB; clock += SUB;
        for (var i = 0; i < order.length; i++) stepActor(actors[order[i]], SUB);
      }
    }
    function update(dt) {
      updates++; S.updates++;
      for (var i = 0; i < order.length; i++) { var a = actors[order[i]]; if (a.mute > 0) a.mute--; }
      advance(dt == null ? FRAME : dt);
    }

    // transform for one actor now: sy along the actor's height, sx = 1 / sy, shear k = horizontal offset per px of height
    function pose(a, pixel) {
      var sy = clamp(1 + a.d * a.amt * (1 - a.stiff), 0.45, 1.8), sx = 1 / sy, k = clamp(a.l * a.amt, -0.8, 0.8);
      if (pixel) {
        sy = Math.max(1, Math.round(sy * a.h)) / a.h; sx = Math.max(1, Math.round(sx * a.w)) / a.w;
        k = Math.round(k * a.h) / a.h;
      }
      return { sx: sx, sy: sy, k: k };
    }
    function isPixel(ctx) {
      if (P.snap === 'pixel') return true;
      if (P.snap === 'smooth') return false;
      if (SK && SK.motion && SK.motion.snap) return true;
      if (SK && o.skin != null) return false;
      try { return !!ctx && ctx.imageSmoothingEnabled === false; } catch (e) { return false; }
    }
    function transform(id, ctx) {
      var a = id == null ? null : actors[String(id)];
      if (!a) return { sx: 1, sy: 1, k: 0, deformed: false };
      var p = pose(a, isPixel(ctx));
      p.deformed = Math.abs(p.sx - 1) > 1e-3 || Math.abs(p.k) > 1e-3; return p;
    }
    // [a, b, c, d, e, f] for ctx.transform(...) about the foot point
    function matrix(id, fx, fy, ctx) {
      var p = transform(id, ctx); fx = num(fx, 0); fy = num(fy, 0);
      return [p.sx, 0, -p.k, p.sy, fx - p.sx * fx + p.k * fy, fy - p.sy * fy];
    }

    function apply(ctx, id, fx, fy) {
      if (!ctx || typeof ctx.save !== 'function') return null;
      ctx.save(); depth.push(ctx); S.applies++;
      try {
        var a = get(id); fx = num(fx, NaN); fy = num(fy, NaN);
        if (!a || !isFinite(fx) || !isFinite(fy)) { S.badInput++; return null; }
        if (a.lastUpd === updates) { if (++a.staleApplies >= 40) { S.selfAdvanced++; for (var n = 0; n < 2; n++) stepActor(a, SUB); } } else a.staleApplies = 0;
        a.lastUpd = updates;
        var pix = isPixel(ctx), p = pose(a, pix);
        if (pix) { fx = Math.round(fx); fy = Math.round(fy); }
        a.sx = p.sx; a.sy = p.sy; a.k = p.k;
        if (p.sy < S.minSy) S.minSy = p.sy; if (p.sy > S.maxSy) S.maxSy = p.sy;
        if (Math.abs(p.k) > S.maxLean) S.maxLean = Math.abs(p.k);
        if (!pix) S.maxVolErr = Math.max(S.maxVolErr, Math.abs(p.sx * p.sy - 1));
        var deformed = Math.abs(p.sy - 1) > 1e-3 || Math.abs(p.k) > 1e-3;
        if (deformed) S.deformedApplies++;
        var bw = a.w * p.sx, bh = a.h * p.sy;
        drawnLast[a.id] = { id: a.id, footX: fx, footY: fy, sx: p.sx, sy: p.sy, k: p.k, x: fx - bw / 2 + Math.min(0, p.k * bh), y: fy - bh, w: bw + Math.abs(p.k * bh), h: bh, deformed: deformed };
        if (deformed) ctx.transform(p.sx, 0, -p.k, p.sy, fx - p.sx * fx + p.k * fy, fy - p.sy * fy);
        return p;
      } catch (e) { return null; }
    }
    function restore(ctx) {
      for (var i = depth.length - 1; i >= 0; i--) {
        if (depth[i] === ctx || ctx == null) { var c = depth[i]; depth.splice(i, 1); S.restores++; try { c.restore(); } catch (e) { } return true; }
      }
      S.strayRestores++; return false;   // never pops a save() the host made
    }
    function wrap(ctx, id, fx, fy, fn) {
      apply(ctx, id, fx, fy);
      try { if (typeof fn === 'function') return fn(); } finally { restore(ctx); }
    }

    function clear(id) {
      if (id != null) { var a = actors[String(id)]; if (a) { a.d = a.dv = a.l = a.lv = 0; a.leanHold = 0; a.script = null; a.charging = false; a.ground = null; a.seenMotion = false; } return; }
      for (var i = 0; i < order.length; i++) clear(order[i]);
    }
    function busy(id) {
      var L = id != null ? [String(id)] : order;
      for (var i = 0; i < L.length; i++) { var a = actors[L[i]]; if (a && (a.script || a.charging || Math.abs(a.d) > 0.004 || Math.abs(a.l) > 0.004)) return true; }
      return false;
    }
    function stats() {
      var o2 = {}; for (var k in S) o2[k] = S[k];
      o2.open = depth.length; o2.clock = Math.round(clock); o2.version = VERSION; return o2;
    }
    function lastDrawn() { var out = []; for (var k in drawnLast) out.push(drawnLast[k]); return out; }
    function state(id) { var a = actors[String(id)]; return a ? { d: a.d, l: a.l, script: a.script && a.script.kind, charging: a.charging, ground: a.ground } : null; }

    return {
      version: VERSION, attach: attach, detach: detach, motion: motion, event: event, update: update,
      apply: apply, restore: restore, wrap: wrap, transform: transform, matrix: matrix,
      clear: clear, busy: busy, stats: stats, lastDrawn: lastDrawn, state: state,
      setParams: setParams, params: function () { var c = {}; for (var k in P) c[k] = P[k]; return c; }, reduced: reduced,
      land: function (id, s) { return event(id, 'land', s); }, jump: function (id, s) { return event(id, 'jump', s); },
      hit: function (id, s, dir) { return event(id, 'hit', s, dir); }, attack: function (id, s, dir) { return event(id, 'attack', s, dir); },
      charge: function (id, dir) { return event(id, 'charge', 1, dir); }, release: function (id) { return event(id, 'release', 1); }
    };
  }

  root.GameDNA_SquashStretch = { create: create, version: VERSION, defaults: DEFAULTS };
})(typeof window !== 'undefined' ? window : this);
