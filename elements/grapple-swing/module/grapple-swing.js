/* GameDNA_Grapple - B-16 grappling hook & rope swing (Game DNA element "grapple-swing").
 * One plain script, no dependencies, no import/export, ASCII only. One global: GameDNA_Grapple.
 *
 *   var g = GameDNA_Grapple.create({ solid: (x, y) => wallAt(x, y), tile: 16, velUnit: 'step', gravity: 0.25,
 *                                     anchors: () => RINGS, scale: VIEW_H / 180, seed: 1 });
 *   // each fixed step, BEFORE the hero's own velocity code:
 *   var r = g.update(STEP_MS, { fire, hold, jump, push, reel, aimX, aimY }, hero);   // hero = {x, y, w, h, vx, vy, onGround, facing}
 *   if (r.active) { hero.vx = r.vx; hero.vy = r.vy; }        // on the rope: skip the game's own run / gravity / jump-cut this step
 *   else { ...the game's own velocity code...; if (r.flying) hero.vx = r.vx; }   // released: keep the swing's momentum
 *   ...the game's own moveX / moveY with its own collision (unchanged)...
 *   // draw, after the hero: g.draw(ctx, camX, camY, hero)
 *
 * The game keeps its own collision: the module only proposes a velocity (capped so a step never moves more than
 * maxStep px), the game moves the body with its own wall tests, and the module reads the result on the next update.
 * Deterministic: no Math.random, no wall clock; sparks use a seeded generator; time comes only from update(dt).
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0';

  // distances and speeds are given for a 180 px tall view (scale 1); `scale` multiplies them
  var DEFAULTS = {
    range: 120,        // px: how far the hook flies
    hookSpeed: 720,    // px/s: hook travel speed
    reelSpeed: 70,     // px/s: reel in / out speed
    minLength: 14,     // px: shortest rope
    maxLength: 150,    // px: longest rope (reel out stops here)
    tighten: 0.9,      // rope length on attach = distance x tighten (a small yank); 1 = no yank
    swingForce: 240,   // px/s^2: pump along the swing when the player pushes left / right
    jumpBoost: 150,    // px/s: extra upward speed when the player jumps off the rope
    releaseBoost: 1.1, // the swing velocity is multiplied by this on release (1 = exact momentum)
    carryMs: 1100,     // ms the released momentum is protected from the game's air drag
    airBrake: 420,     // px/s^2: pushing against the carried motion slows it this fast
    airDrag: 0.08,     // fraction of carried speed lost per second with no push
    aimAngle: 55,      // degrees above horizontal when the game gives no aim vector
    aimAssist: 32,     // degrees: rings within this cone of the aim snap the shot to them
    surfaces: 1,       // 1 = the hook also bites any solid surface, 0 = rings only
    wrap: 1,           // 1 = the rope wraps around corners (and unwraps), 0 = a rope that crosses a wall snags and lets go
    mode: 'hold',      // 'hold' = keep the button held to hang on; 'toggle' = press again to let go
    maxStep: 0,        // px per step the module may move the body (0 = auto: 0.45 x tile, or 7 x scale)
    damping: 0.0015,   // fraction of swing speed lost per step
    showAim: 1,        // 1 = draw the aim reticle on the spot the hook would bite
    render: 'auto',    // 'auto' (pixel when imageSmoothingEnabled is false) | 'pixel' | 'smooth'
    ropeColor: '#c89a5a',
    ropeDark: '#5a3a22',
    hookColor: '#c6ccd8'
  };
  var PARAM_KEYS = Object.keys(DEFAULTS);

  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex(c) { var n = parseInt(String(c).replace('#', ''), 16); if (isNaN(n)) n = 0x888888; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function rgbStr(a, alpha) { return alpha == null ? 'rgb(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ')' : 'rgba(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ',' + alpha + ')'; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rng(seed) { var a = (seed >>> 0) || 1; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function create(options) {
    var o = options || {};
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    var warned = {};
    function warn(key, msg) { if (warned[key]) return; warned[key] = 1; try { if (root.console) root.console.warn('[GameDNA_Grapple] ' + msg); } catch (e) { } }
    function setParams(p) {
      p = p || {};
      for (var key in p) {
        if (!(key in DEFAULTS)) continue;
        if (typeof DEFAULTS[key] === 'number') P[key] = num(p[key], P[key]);
        else if (p[key] != null && p[key] !== '') P[key] = String(p[key]);
      }
    }
    setParams(o.params);

    var SK = null, skinPixel = null;
    try { SK = (o.skin == null || o.skin === false || !root.GameDNA_Skin) ? null : root.GameDNA_Skin.resolve(o.skin); } catch (e) { SK = null; }
    if (SK) { try { skinPixel = !!(SK.pixel || (SK.motion && SK.motion.snap)); } catch (e) { skinPixel = null; } }

    var stats = { updates: 0, frozen: 0, fires: 0, attaches: 0, ringAttaches: 0, surfaceAttaches: 0, misses: 0, snags: 0, releases: 0, jumpReleases: 0,
      wraps: 0, unwraps: 0, reels: 0, activeSteps: 0, carrySteps: 0, capped: 0, maxSpeed: 0, cbErrors: 0, drawErrors: 0, updErrors: 0, badInput: 0, draws: 0 };

    function scaleNow() { var s = typeof o.scale === 'function' ? safe(o.scale, null, 1) : o.scale; s = num(s, 1); return s > 0 ? s : 1; }
    function safe(fn, args, dflt) { try { return fn.apply(null, args || []); } catch (e) { stats.cbErrors++; warn('cb' + (fn && fn.name), 'a callback threw: ' + (e && e.message)); return dflt; } }
    function solidAt(x, y) {
      if (typeof o.solid !== 'function') return false;
      var b = bounds();
      if (b && (x < b.x || x >= b.x + b.w)) return true;
      try { return !!o.solid(x, y); } catch (e) { stats.cbErrors++; warn('solid', 'solid() threw: ' + (e && e.message)); return false; }
    }
    function bounds() { var b = typeof o.bounds === 'function' ? safe(o.bounds, null, null) : o.bounds; return b && isFinite(b.x) && isFinite(b.w) ? b : null; }
    function anchorList() {
      var a = typeof o.anchors === 'function' ? safe(o.anchors, null, null) : o.anchors;
      return Array.isArray(a) ? a : [];
    }
    var stepMs = num(o.stepMs, 1000 / 60);
    var unitStep = (o.velUnit || 'step') === 'step';
    var U = unitStep ? 1000 / stepMs : 1;                    // host velocity unit -> px/s
    function gravity() { var g = typeof o.gravity === 'function' ? safe(o.gravity, null, 0) : o.gravity; g = num(g, null); if (g == null) { warn('grav', 'no gravity given; using 900 px/s^2 x scale'); return 900 * scaleNow(); } return g * U * U; }
    function maxStepPx() { if (P.maxStep > 0) return P.maxStep; var t = num(o.tile, 0); return t > 0 ? t * 0.45 : 7 * scaleNow(); }
    function handOf(b) {
      if (!b) return null;
      if (typeof o.hand === 'function') { var h = safe(o.hand, [b], null); if (h && isFinite(h.x) && isFinite(h.y)) return { x: +h.x, y: +h.y }; }
      var fx = o.hand && isFinite(o.hand.x) ? o.hand.x : 0.5, fy = o.hand && isFinite(o.hand.y) ? o.hand.y : 0.3;
      var x = +b.x, y = +b.y, w = num(b.w, 0), hh = num(b.h, 0);
      if (!isFinite(x) || !isFinite(y)) return null;
      return { x: x + w * fx, y: y + hh * fy };
    }

    // ---------------------------------------------------------------- state
    var R = rng(num(o.seed, 1) * 9973 + 17);
    var S = {
      t: 0, state: 'idle',            // idle | shot | attached | retract
      hook: { x: 0, y: 0, tx: 0, ty: 0, kind: '', ring: null, dist: 0, travelled: 0, nx: 0, ny: -1 },
      pivots: [], yank: 0,             // [{x, y, side}] pivots[0] = the anchor; yank = rope still to take in after attaching
      L: 0,                            // whole rope length (anchor to hand, through the pivots)
      fixed: 0,                        // length used between the pivots
      hand: null, prevHand: null, vel: { x: 0, y: 0 },   // last hand (world px) and the velocity handed out (px/s)
      carry: null,                     // {t, vx} after a release
      taut: false, active: false, ground: false,
      aim: null,                       // {x, y, kind, ring} where a shot would bite now
      dirX: 1, dirY: 0, held: false, toggled: false,
      drive: null,
      events: [], evN: 0
    };
    var res = { active: false, flying: false, vx: 0, vy: 0, state: 'idle', attached: false };
    var sparks = []; for (k = 0; k < 64; k++) sparks.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, kind: 0 });
    var lastDrawn = [];

    function event(type, info) {
      var e = { t: Math.round(S.t), type: type, n: ++S.evN };
      if (info) for (var q in info) e[q] = info[q];
      S.events.push(e); if (S.events.length > 40) S.events.shift();
      if (typeof o.onEvent === 'function') safe(o.onEvent, [type, e]);
      var cb = o['on' + type.charAt(0).toUpperCase() + type.slice(1)];
      if (typeof cb === 'function') safe(cb, [e]);
    }
    function spawnSparks(x, y, nx, ny, n, kind) {
      for (var i = 0; i < n; i++) {
        var p = null;
        for (var j = 0; j < sparks.length; j++) if (!sparks[j].on) { p = sparks[j]; break; }
        if (!p) { p = sparks[0]; for (j = 1; j < sparks.length; j++) if (sparks[j].life / sparks[j].max > p.life / p.max) p = sparks[j]; }
        var a = Math.atan2(ny, nx) + (R() - 0.5) * 2.2, sp = (kind === 1 ? 30 : 70 + R() * 90) * scaleNow();
        p.on = true; p.x = x; p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - (kind === 1 ? 10 : 20) * scaleNow();
        p.life = 0; p.max = kind === 1 ? 380 + R() * 220 : 180 + R() * 200; p.kind = kind;
      }
    }

    // ---------------------------------------------------------------- geometry
    function probeStep() { return Math.max(0.5, Math.min(1, num(o.tile, 16) / 16)) * Math.max(0.5, Math.min(2, scaleNow())); }
    // first solid sample on the segment a -> b (ends excluded by `skip` px), or null
    function segHit(ax, ay, bx, by, skipA, skipB) {
      var dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy); if (len < 1e-6) return null;
      var st = probeStep(), n = Math.ceil(len / st);
      for (var i = 0; i <= n; i++) {
        var d = Math.min(len, i * st); if (d < skipA || d > len - skipB) continue;
        var x = ax + dx * d / len, y = ay + dy * d / len;
        if (solidAt(x, y)) return { x: x, y: y, d: d };
      }
      return null;
    }
    // cast a ray from (x, y) along a unit direction; returns the last free point before the first solid sample
    function cast(x, y, ux, uy, maxD) {
      var st = Math.min(1, probeStep()), d = 0;
      if (solidAt(x, y)) return null;
      while (d < maxD) {
        var nd = Math.min(maxD, d + st), px = x + ux * nd, py = y + uy * nd;
        if (solidAt(px, py)) {
          var lo = d, hi = nd;   // refine to 1/8 px
          for (var it = 0; it < 4; it++) { var m = (lo + hi) / 2; if (solidAt(x + ux * m, y + uy * m)) hi = m; else lo = m; }
          var fx = x + ux * lo, fy = y + uy * lo, n = normalAt(x + ux * hi, y + uy * hi, ux, uy);
          return { x: fx, y: fy, d: lo, nx: n[0], ny: n[1] };
        }
        d = nd;
      }
      return null;
    }
    function normalAt(x, y, ux, uy) {   // the free side of a solid point, by probing around it
      var e = 1.5 * scaleNow(), nx = 0, ny = 0;
      if (!solidAt(x - e, y)) nx -= 1; if (!solidAt(x + e, y)) nx += 1;
      if (!solidAt(x, y - e)) ny -= 1; if (!solidAt(x, y + e)) ny += 1;
      var l = Math.sqrt(nx * nx + ny * ny); if (l < 1e-6) return [-ux, -uy];
      return [nx / l, ny / l];
    }
    function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }
    function cross(ax, ay, bx, by) { return ax * by - ay * bx; }

    function pickTarget(h, ux, uy) {
      var range = P.range * scaleNow(), best = null, bestS = 1e9, rings = anchorList(), cosA = Math.cos(P.aimAssist * Math.PI / 180);
      for (var i = 0; i < rings.length; i++) {
        var a = rings[i]; if (!a || !isFinite(a.x) || !isFinite(a.y) || a.enabled === false) continue;
        var dx = a.x - h.x, dy = a.y - h.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d > range || d < 4) continue;
        var c = (dx * ux + dy * uy) / d; if (c < cosA) continue;
        if (segHit(h.x, h.y, a.x, a.y, 1, 4 * scaleNow())) continue;
        var s = (1 - c) * 4 + d / range * 0.6;
        if (s < bestS) { bestS = s; best = { x: a.x, y: a.y, kind: 'ring', ring: a.id != null ? a.id : i, d: d, nx: -dx / d, ny: -dy / d }; }
      }
      if (best) return best;
      if (P.surfaces > 0) { var c2 = cast(h.x, h.y, ux, uy, range); if (c2) return { x: c2.x, y: c2.y, kind: 'surface', ring: null, d: c2.d, nx: c2.nx, ny: c2.ny }; }
      return null;
    }
    function aimDir(inp, body) {
      var ax = num(inp && inp.aimX, NaN), ay = num(inp && inp.aimY, NaN);
      if (isFinite(ax) && isFinite(ay) && (ax !== 0 || ay !== 0)) { var l = Math.sqrt(ax * ax + ay * ay); return [ax / l, ay / l]; }
      var f = body && (body.facing === 'left' || body.facing < 0) ? -1 : body && (body.facing === 'right' || body.facing > 0) ? 1 : S.dirX || 1;
      var up = inp && (inp.up || inp.aimUp) ? 80 : inp && (inp.down || inp.aimDown) ? 30 : P.aimAngle, r = up * Math.PI / 180;
      return [f * Math.cos(r), -Math.sin(r)];
    }

    // ---------------------------------------------------------------- actions
    function fire(h, ux, uy) {
      stats.fires++;
      var tg = pickTarget(h, ux, uy), range = P.range * scaleNow();
      S.state = 'shot';
      S.hook.x = h.x; S.hook.y = h.y; S.hook.travelled = 0; S.hook.dirX = ux; S.hook.dirY = uy;
      if (tg) { S.hook.tx = tg.x; S.hook.ty = tg.y; S.hook.kind = tg.kind; S.hook.ring = tg.ring; S.hook.dist = tg.d; S.hook.nx = tg.nx; S.hook.ny = tg.ny; }
      else { S.hook.tx = h.x + ux * range; S.hook.ty = h.y + uy * range; S.hook.kind = 'miss'; S.hook.ring = null; S.hook.dist = range; S.hook.nx = -ux; S.hook.ny = -uy; }
      event('fire', { kind: S.hook.kind, ring: S.hook.ring, x: Math.round(S.hook.tx), y: Math.round(S.hook.ty) });
    }
    function attach(h) {
      var ax = S.hook.tx, ay = S.hook.ty;
      if (S.hook.kind === 'surface') { var off = 0.75 * scaleNow(), qx = ax + S.hook.nx * off, qy = ay + S.hook.ny * off; if (!solidAt(qx, qy)) { ax = qx; ay = qy; } }
      var d = dist(ax, ay, h.x, h.y);
      S.pivots = [{ x: ax, y: ay, side: 0 }]; S.fixed = 0;
      // the rope starts at the hand's distance; the yank (tighten) is reeled in over the next ~120 ms, so the rope never
      // asks the game for a jump in position
      S.L = Math.max(d, P.minLength * scaleNow());
      S.yank = Math.max(0, Math.min(S.L - P.minLength * scaleNow(), S.L * (1 - clamp(P.tighten, 0.5, 1))));
      S.state = 'attached'; S.carry = null; stats.attaches++;
      if (S.hook.kind === 'ring') stats.ringAttaches++; else stats.surfaceAttaches++;
      spawnSparks(ax, ay, S.hook.nx, S.hook.ny, S.hook.kind === 'ring' ? 7 : 5, 0);
      if (S.hook.kind === 'surface') spawnSparks(ax, ay, S.hook.nx, S.hook.ny, 4, 1);
      event('attach', { kind: S.hook.kind, ring: S.hook.ring, x: Math.round(ax), y: Math.round(ay), length: Math.round(S.L) });
    }
    function release(why, v, boostJump) {
      if (S.state !== 'attached') { if (S.state === 'shot') { S.state = 'retract'; } return; }
      var vx = v ? v.x : S.vel.x, vy = v ? v.y : S.vel.y;
      vx *= P.releaseBoost; vy *= P.releaseBoost;
      if (boostJump) { vy = Math.min(vy, 0) - P.jumpBoost * scaleNow(); stats.jumpReleases++; }
      S.state = 'retract';
      S.hook.x = S.pivots[0] ? S.pivots[0].x : S.hook.x; S.hook.y = S.pivots[0] ? S.pivots[0].y : S.hook.y;
      S.pivots = []; S.fixed = 0; S.taut = false;
      S.carry = { t: 0, vx: vx, vy: vy };
      stats.releases++;
      event('release', { why: why, vx: Math.round(vx), vy: Math.round(vy) });
      return { x: vx, y: vy };
    }

    // ---------------------------------------------------------------- rope wrapping
    // with tiles: the first convex tile corner the rope meets while it sweeps around pivot Pv from the clear hand A to hand B
    function sweptCorner(Pv, A, B) {
      var t = num(o.tile, 0); if (!(t > 0)) return null;
      var ax = A.x - Pv.x, ay = A.y - Pv.y, bx = B.x - Pv.x, by = B.y - Pv.y, total = Math.atan2(cross(ax, ay, bx, by), ax * bx + ay * by);
      if (Math.abs(total) < 1e-6) return null;
      var reach = Math.max(Math.sqrt(ax * ax + ay * ay), Math.sqrt(bx * bx + by * by)) + 1;
      var x0 = Math.floor((Math.min(Pv.x, A.x, B.x) - 1) / t), x1 = Math.floor((Math.max(Pv.x, A.x, B.x) + 1) / t);
      var y0 = Math.floor((Math.min(Pv.y, A.y, B.y) - 1) / t), y1 = Math.floor((Math.max(Pv.y, A.y, B.y) + 1) / t);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 900) return null;
      var sol = function (c, r) { return solidAt(c * t + t / 2, r * t + t / 2); }, best = null, bf = 1e9, bd = 1e9, e = 0.6;
      for (var r = y0; r <= y1; r++) for (var c = x0; c <= x1; c++) {
        if (!sol(c, r)) continue;
        for (var k = 0; k < 4; k++) {
          var sx = k & 1 ? 1 : -1, sy = k & 2 ? 1 : -1;
          if (sol(c + sx, r) || sol(c, r + sy) || sol(c + sx, r + sy)) continue;
          var qx0 = sx > 0 ? (c + 1) * t : c * t, qy0 = sy > 0 ? (r + 1) * t : r * t, px = qx0 + sx * e, py = qy0 + sy * e, cx = qx0 - Pv.x, cy = qy0 - Pv.y, cd = Math.sqrt(cx * cx + cy * cy);
          if (cd < 1 || cd > reach) continue;
          var ang = Math.atan2(cross(ax, ay, cx, cy), ax * cx + ay * cy), f = ang / total;
          if (f < -0.05 || f > 1.05) continue;
          if (solidAt(px, py)) continue;
          if (f < bf - 1e-4 || (Math.abs(f - bf) <= 1e-4 && cd < bd)) { bf = f; bd = cd; best = { x: px, y: py }; }
        }
      }
      return best;
    }
    function cornerNear(q, clearA, clearB, sweepFrom, sweepTo) {
      // the wrap point: with tiles, the first convex corner swept (or a convex corner near q); else the point of the clear
      // segment nearest the blocking spot, nudged off it
      var t = num(o.tile, 0), best = null;
      if (t > 0 && sweepFrom && sweepTo) best = sweptCorner(clearA, sweepFrom, sweepTo);
      if (!best && t > 0) {
        // convex corners of solid tiles around q: the three tiles outside the corner are free
        var c0 = Math.floor(q.x / t), r0 = Math.floor(q.y / t), bd = 1e9, e = 0.6;
        var sol = function (c, r) { return solidAt(c * t + t / 2, r * t + t / 2); };
        for (var r = r0 - 1; r <= r0 + 1; r++) for (var c = c0 - 1; c <= c0 + 1; c++) {
          if (!sol(c, r)) continue;
          for (var k2 = 0; k2 < 4; k2++) {
            var sx = k2 & 1 ? 1 : -1, sy = k2 & 2 ? 1 : -1;
            if (sol(c + sx, r) || sol(c, r + sy) || sol(c + sx, r + sy)) continue;
            var px = (sx > 0 ? (c + 1) * t : c * t) + sx * e, py = (sy > 0 ? (r + 1) * t : r * t) + sy * e;
            if (solidAt(px, py)) continue;
            var d = segPointDist(clearA.x, clearA.y, clearB.x, clearB.y, px, py) + dist(px, py, q.x, q.y) * 0.25;
            if (d < bd) { bd = d; best = { x: px, y: py }; }
          }
        }
        if (best && bd > t * 1.5) best = null;
      }
      if (!best) {
        var pr = closestOnSeg(clearA.x, clearA.y, clearB.x, clearB.y, q.x, q.y), dx = pr.x - q.x, dy = pr.y - q.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
        best = { x: pr.x + dx / l * 0.6, y: pr.y + dy / l * 0.6 };
        if (solidAt(best.x, best.y)) best = pr;
      }
      return best;
    }
    function closestOnSeg(ax, ay, bx, by, px, py) { var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, u = l2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0; return { x: ax + dx * u, y: ay + dy * u }; }
    function segPointDist(ax, ay, bx, by, px, py) { var c = closestOnSeg(ax, ay, bx, by, px, py); return dist(c.x, c.y, px, py); }
    function updateWrap(h) {
      var guard = 0, sk = 1.2 * scaleNow();
      // unwrap first: the rope swung back past the line through the last two pivots
      while (S.pivots.length > 1 && guard++ < 10) {
        var W = S.pivots[S.pivots.length - 1], Q = S.pivots[S.pivots.length - 2];
        var c = cross(W.x - Q.x, W.y - Q.y, h.x - W.x, h.y - W.y);
        if (c * W.side < 0 && !segHit(Q.x, Q.y, h.x, h.y, sk, sk)) { S.pivots.pop(); S.fixed -= dist(Q.x, Q.y, W.x, W.y); stats.unwraps++; event('unwrap', { x: Math.round(W.x), y: Math.round(W.y) }); }
        else break;
      }
      guard = 0;
      while (guard++ < 6) {
        var Pv = S.pivots[S.pivots.length - 1], hit = segHit(Pv.x, Pv.y, h.x, h.y, sk, sk);
        if (!hit) return true;
        if (!(P.wrap > 0) || S.pivots.length >= 10) return false;
        // where along the hand's motion did the rope first touch? binary search between the previous and the current hand
        var a = S.prevHand || h, lo = 0, hi = 1, clr = a;
        if (segHit(Pv.x, Pv.y, a.x, a.y, sk, sk)) { clr = null; }
        if (clr) {
          for (var it = 0; it < 10; it++) { var m = (lo + hi) / 2, mx = a.x + (h.x - a.x) * m, my = a.y + (h.y - a.y) * m; if (segHit(Pv.x, Pv.y, mx, my, sk, sk)) hi = m; else lo = m; }
          clr = { x: a.x + (h.x - a.x) * lo, y: a.y + (h.y - a.y) * lo };
          var hm = { x: a.x + (h.x - a.x) * hi, y: a.y + (h.y - a.y) * hi }, q = segHit(Pv.x, Pv.y, hm.x, hm.y, sk, sk) || hit;
          var Wp = cornerNear(q, Pv, clr, a, h);
          if (dist(Wp.x, Wp.y, Pv.x, Pv.y) < 1 || segHit(Pv.x, Pv.y, Wp.x, Wp.y, sk, 0.3)) Wp = cornerNear(hit, Pv, clr);
          var side = cross(Wp.x - Pv.x, Wp.y - Pv.y, h.x - Wp.x, h.y - Wp.y) < 0 ? -1 : 1;
          S.fixed += dist(Pv.x, Pv.y, Wp.x, Wp.y);
          S.pivots.push({ x: Wp.x, y: Wp.y, side: side });
          stats.wraps++; event('wrap', { x: Math.round(Wp.x), y: Math.round(Wp.y), pivots: S.pivots.length });
          if (S.fixed > S.L - P.minLength * scaleNow() * 0.5) S.L = S.fixed + Math.max(dist(Wp.x, Wp.y, h.x, h.y), P.minLength * scaleNow() * 0.5);
        } else {
          var W2 = cornerNear(hit, Pv, h), side2 = cross(W2.x - Pv.x, W2.y - Pv.y, h.x - W2.x, h.y - W2.y) < 0 ? -1 : 1;
          S.fixed += dist(Pv.x, Pv.y, W2.x, W2.y); S.pivots.push({ x: W2.x, y: W2.y, side: side2 }); stats.wraps++;
          event('wrap', { x: Math.round(W2.x), y: Math.round(W2.y), pivots: S.pivots.length });
        }
      }
      return !segHit(S.pivots[S.pivots.length - 1].x, S.pivots[S.pivots.length - 1].y, h.x, h.y, sk, sk);
    }

    // ---------------------------------------------------------------- update
    function readInput(inp) {
      var I = { fire: false, hold: undefined, jump: false, push: 0, reel: 0, up: false, down: false, aimX: NaN, aimY: NaN, release: false };
      if (inp && typeof inp === 'object') {
        I.fire = !!inp.fire; I.hold = inp.hold === undefined ? undefined : !!inp.hold; I.jump = !!inp.jump; I.release = !!inp.release;
        I.push = clamp(num(inp.push, 0), -1, 1); I.reel = clamp(num(inp.reel, 0), -1, 1);
        I.up = !!inp.up; I.down = !!inp.down; I.aimX = num(inp.aimX, NaN); I.aimY = num(inp.aimY, NaN);
      } else if (inp != null) stats.badInput++;
      if (S.drive) {   // scripted input (tests, bots, judges): overrides fire / hold / reel for a while
        var D = S.drive;
        if (D.fire && !D.fired) { I.fire = true; D.fired = true; if (D.aimX != null) { I.aimX = D.aimX; I.aimY = D.aimY; } }
        I.hold = D.holdMs > 0 ? true : I.hold; if (D.reel) I.reel = D.reel;
        if (D.holdMs <= 0) { I.hold = false; if (D.jump) I.jump = true; else I.release = true; S.drive = null; }
      }
      return I;
    }
    function update(dtMs, input, body) {
      res.active = false; res.flying = false; res.vx = body ? num(body.vx, 0) : 0; res.vy = body ? num(body.vy, 0) : 0;
      try { return step(dtMs, input, body); }
      catch (e) { stats.updErrors++; warn('upd', 'update failed: ' + (e && e.message)); res.active = false; res.flying = false; res.state = S.state; return res; }
    }
    function step(dtMs, input, body) {
      var dt = num(dtMs, 0);
      if (!(dt > 0)) { stats.frozen++; res.state = S.state; res.attached = S.state === 'attached'; return res; }
      dt = Math.min(dt, 100); var sec = dt / 1000;
      stats.updates++; S.t += dt;
      if (S.drive) S.drive.holdMs -= dt;
      var I = readInput(input), h = handOf(body);
      if (!h) { stats.badInput++; res.state = S.state; return res; }
      var vx = num(body.vx, 0) * U, vy = num(body.vy, 0) * U, onGround = !!body.onGround, sc = scaleNow(), ms = maxStepPx();
      if (body.facing === 'left' || body.facing < 0) S.dirX = -1; else if (body.facing === 'right' || body.facing > 0) S.dirX = 1;
      var aim = aimDir(I, body);
      var wasAttached = S.state === 'attached';

      // fire / release by buttons
      if (I.fire) {
        if (S.state === 'attached') {
          var vr = release('button', { x: vx, y: vy }, false);
          if (P.mode !== 'toggle') { fire(h, aim[0], aim[1]); }
          if (vr) { S.carry = { t: 0, vx: vr.x, vy: vr.y }; }
        } else if (S.state === 'shot' && P.mode === 'toggle') { S.state = 'retract'; }
        else if (S.state !== 'shot') fire(h, aim[0], aim[1]);
      } else if (S.state === 'attached' && (I.release || (P.mode === 'hold' && I.hold === false))) {
        release('let go', { x: vx, y: vy }, false);
      } else if (S.state === 'shot' && P.mode === 'hold' && I.hold === false && S.hook.travelled > 6 * sc) {
        S.state = 'retract';
      }
      if (S.state === 'attached' && I.jump) {
        var v2 = release('jump', { x: vx, y: vy }, true);
        if (v2) { res.active = true; res.vx = v2.x / U; res.vy = v2.y / U; S.carry = { t: 0, vx: v2.x, vy: v2.y }; S.vel.x = v2.x; S.vel.y = v2.y; }
      }

      // hook in flight
      if (S.state === 'shot') {
        var adv = P.hookSpeed * sc * sec, rem = dist(S.hook.x, S.hook.y, S.hook.tx, S.hook.ty);
        if (rem <= adv) { S.hook.x = S.hook.tx; S.hook.y = S.hook.ty; S.hook.travelled += rem; if (S.hook.kind === 'miss') { S.state = 'retract'; stats.misses++; event('miss', { x: Math.round(S.hook.x), y: Math.round(S.hook.y) }); } else attach(h); }
        else { S.hook.x += (S.hook.tx - S.hook.x) / rem * adv; S.hook.y += (S.hook.ty - S.hook.y) / rem * adv; S.hook.travelled += adv; }
        if (S.state === 'shot' && segHit(h.x, h.y, S.hook.x, S.hook.y, 1, 2 * sc)) { S.state = 'retract'; stats.snags++; event('snag', { x: Math.round(S.hook.x), y: Math.round(S.hook.y) }); }
      }
      if (S.state === 'attached' && S.hook.kind === 'ring') {   // a ring may move: the anchor follows it
        var rl = anchorList(), found = null;
        for (var ri = 0; ri < rl.length; ri++) { var ra = rl[ri]; if (ra && (ra.id != null ? ra.id : ri) === S.hook.ring) { found = ra; break; } }
        if (!found || found.enabled === false) release('ring gone', { x: vx, y: vy }, false);
        else if (S.pivots.length) { S.pivots[0].x = found.x; S.pivots[0].y = found.y; S.hook.tx = found.x; S.hook.ty = found.y; }
      }
      if (S.state === 'retract') {
        var back = P.hookSpeed * 1.6 * sc * sec, rd = dist(S.hook.x, S.hook.y, h.x, h.y);
        if (rd <= back + 3 * sc) S.state = 'idle';
        else { S.hook.x += (h.x - S.hook.x) / rd * back; S.hook.y += (h.y - S.hook.y) / rd * back; }
      }

      // on the rope
      S.taut = false; S.active = false;
      if (S.state === 'attached') {
        if (!updateWrap(h)) { release('snag', { x: vx, y: vy }, false); stats.snags++; event('snag', { x: Math.round(h.x), y: Math.round(h.y) }); }
      }
      if (S.state === 'attached') {
        if (I.reel) {
          var minL = S.fixed + P.minLength * sc, maxL = Math.max(minL, P.maxLength * sc), ds = I.reel * P.reelSpeed * sc * sec, nl = S.L + ds;
          if (ds > 0) {   // paying out: the rope only slides out while it is pulled (never more slack than one step's worth), so a swing keeps its tension
            var Pv0 = S.pivots[S.pivots.length - 1], d00 = Pv0 ? S.fixed + dist(Pv0.x, Pv0.y, h.x, h.y) : S.L;
            nl = Math.min(nl, Math.max(S.L, d00 + ds));
          }
          nl = clamp(nl, minL, maxL);
          if (Math.abs(nl - S.L) > 1e-6) { stats.reels++; if (S.reeling !== I.reel) { S.reeling = I.reel; event('reel', { dir: I.reel < 0 ? 'in' : 'out' }); } }
          S.L = nl;
        }
        else S.reeling = 0;
        if (S.yank > 0) { var yk = Math.min(S.yank, Math.max(S.yank, 1) / 0.12 * sec, ms * 0.35); S.L -= yk; S.yank -= yk; }
        if (S.L < S.fixed + 1) S.L = S.fixed + 1;
        var Pv = S.pivots[S.pivots.length - 1], free = S.L - S.fixed, d0 = dist(Pv.x, Pv.y, h.x, h.y);
        if (res.active) { /* jumped off this step */ }
        else if (onGround && d0 <= free + 0.25 && !(I.reel < 0)) {
          S.ground = true;   // standing with a slack rope: the game moves the body itself
        } else {
          S.ground = false; S.active = true;
          var g = gravity(), ax = 0, ay = onGround ? 0 : g;
          var rx = (h.x - Pv.x) / (d0 || 1), ry = (h.y - Pv.y) / (d0 || 1), tx = -ry, ty = rx;
          if (onGround && I.push) ax += I.push * P.swingForce * sc * 2;
          else if (I.push && Math.abs(tx) > 0.08) { var sgn = tx > 0 ? 1 : -1; ax += tx * sgn * I.push * P.swingForce * sc; ay += ty * sgn * I.push * P.swingForce * sc; }
          var nvx = vx + ax * sec, nvy = vy + ay * sec;
          nvx *= 1 - P.damping; nvy *= 1 - P.damping;
          var px = h.x + nvx * sec, py = h.y + nvy * sec, dd = dist(Pv.x, Pv.y, px, py);
          if (dd > free) {
            S.taut = true;
            var cx2 = Pv.x + (px - Pv.x) * free / dd, cy2 = Pv.y + (py - Pv.y) * free / dd, kx = cx2 - px, ky = cy2 - py, kl = Math.sqrt(kx * kx + ky * ky), lim = ms * 0.5;
            if (kl > lim) { kx *= lim / kl; ky *= lim / kl; }
            px += kx; py += ky;
          }
          nvx = (px - h.x) / sec; nvy = (py - h.y) / sec;
          var sp = Math.sqrt(nvx * nvx + nvy * nvy), cap = ms / sec;
          if (sp > cap) { nvx *= cap / sp; nvy *= cap / sp; stats.capped++; sp = cap; }
          stats.maxSpeed = Math.max(stats.maxSpeed, Math.round(sp));
          S.vel.x = nvx; S.vel.y = nvy;
          res.active = true; res.vx = nvx / U; res.vy = nvy / U;
          stats.activeSteps++;
        }
      }

      // released: protect the carried momentum from the game's air drag
      if (S.state !== 'attached' && S.carry && !res.active) {
        var C = S.carry; C.t += dt;
        var bvx = vx;
        if (onGround && C.t > 40 || C.t > P.carryMs || (Math.abs(bvx) < 1 && Math.abs(C.vx) > 30 && C.t > 40)) { S.carry = null; }
        else {
          var cvx = C.vx;
          if (I.push && I.push * cvx < 0) { var dv = P.airBrake * sc * sec; cvx = Math.abs(cvx) <= dv ? 0 : cvx - Math.sign(cvx) * dv; }
          else if (!I.push) cvx *= 1 - P.airDrag * sec;
          if (C.t > 40 && Math.abs(bvx) < Math.abs(C.vx) * 0.5 && Math.sign(bvx) !== Math.sign(C.vx)) { S.carry = null; }   // a wall stopped it
          else if (Math.abs(cvx) < 24 * sc) { S.carry = null; }   // slower than a walk: the game's own air control takes over
          else { C.vx = cvx; res.flying = true; res.vx = cvx / U; stats.carrySteps++; }
        }
      }
      // aim preview (what a shot would hit now)
      S.aim = null;
      if (P.showAim > 0 && (S.state === 'idle' || S.state === 'retract')) { var tg = pickTarget(h, aim[0], aim[1]); if (tg) S.aim = tg; }
      // sparks
      for (var si = 0; si < sparks.length; si++) { var p = sparks[si]; if (!p.on) continue; p.life += dt; if (p.life >= p.max) { p.on = false; continue; } p.vy += (p.kind === 1 ? 60 : 420) * sc * sec; p.vx *= p.kind === 1 ? 0.96 : 0.99; p.x += p.vx * sec; p.y += p.vy * sec; }
      S.prevHand = h; S.hand = h;
      if (!res.active) { S.vel.x = vx; S.vel.y = vy; }
      res.state = S.state; res.attached = S.state === 'attached';
      if (wasAttached && S.state !== 'attached') res.attached = false;
      return res;
    }

    // ---------------------------------------------------------------- drawing
    function isPixel(ctx) { if (P.render === 'pixel') return true; if (P.render === 'smooth') return false; if (skinPixel != null && P.render === 'auto' && skinPixel && ctx.imageSmoothingEnabled === false) return true; return ctx.imageSmoothingEnabled === false; }
    var C_ROPE, C_DARK, C_HOOK;
    function colours() { C_ROPE = hex(P.ropeColor); C_DARK = hex(P.ropeDark); C_HOOK = hex(P.hookColor); }
    colours();
    function ropePoints(hand) {
      var pts = [];
      if (S.state === 'attached') {
        pts.push({ x: hand.x, y: hand.y });
        // the game moved the body after the last update: if the last segment now crosses a corner, draw it bent over that
        // corner (drawing only; the next update wraps for real)
        var last = S.pivots[S.pivots.length - 1], sk = 1.2 * scaleNow(), q = last ? segHit(last.x, last.y, hand.x, hand.y, sk, sk) : null;
        if (q) { var from = S.prevHand && !segHit(last.x, last.y, S.prevHand.x, S.prevHand.y, sk, sk) ? S.prevHand : null, w = cornerNear(q, last, from || hand, from, from ? hand : null); if (w) pts.push({ x: w.x, y: w.y, temp: true }); }
        for (var i = S.pivots.length - 1; i >= 0; i--) pts.push({ x: S.pivots[i].x, y: S.pivots[i].y });
      }
      return pts;
    }
    function px(ctx, x, y, col) { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
    // pixel rope: a braided 1 px line (light / mid twists) with a 1 px shade under it
    function pixelLine(ctx, pts, ox, oy, phase, wiggle) {
      var light = rgbStr(mix(C_ROPE, [255, 240, 210], 0.25)), mid = rgbStr(C_ROPE), dark = rgbStr(C_DARK), along = phase || 0, seen = {};
      var cells = [];
      for (var i = 0; i + 1 < pts.length; i++) {
        var a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, l = Math.sqrt(dx * dx + dy * dy), n = Math.max(1, Math.ceil(l));
        for (var s = 0; s <= n; s++) {
          var u = s / n, x = a.x + dx * u, y = a.y + dy * u;
          if (wiggle) { var w = wiggle(along + s, u); x += -dy / (l || 1) * w; y += dx / (l || 1) * w; }
          var X = Math.round(x - ox), Y = Math.round(y - oy), key = X + ',' + Y;
          if (seen[key]) continue; seen[key] = 1; cells.push(X, Y, along + s);
        }
        along += n;
      }
      // a dark outline on all four sides (reads on bright skies and dark rock alike), then the braid
      var ink = 'rgba(26,16,36,0.85)', ol = {};
      for (var j = 0; j < cells.length; j += 3) for (var q = 0; q < 4; q++) { var nx = cells[j] + (q === 0 ? 1 : q === 1 ? -1 : 0), ny = cells[j + 1] + (q === 2 ? 1 : q === 3 ? -1 : 0), nk = nx + ',' + ny; if (seen[nk] || ol[nk]) continue; ol[nk] = 1; ctx.fillStyle = q === 2 ? dark : ink; ctx.fillRect(nx, ny, 1, 1); }
      for (j = 0; j < cells.length; j += 3) { ctx.fillStyle = ((cells[j + 2] >> 1) & 1) ? light : mid; ctx.fillRect(cells[j], cells[j + 1], 1, 1); }
      return cells;
    }
    function smoothLine(ctx, pts, ox, oy, sc, wiggle) {
      if (pts.length < 2) return;
      var path = [];
      for (var i = 0; i + 1 < pts.length; i++) {
        var a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, l = Math.sqrt(dx * dx + dy * dy), n = wiggle ? Math.max(2, Math.ceil(l / 3)) : 1;
        for (var s = (i ? 1 : 0); s <= n; s++) { var u = s / n, x = a.x + dx * u, y = a.y + dy * u; if (wiggle) { var w = wiggle(s * 3, u); x += -dy / (l || 1) * w; y += dx / (l || 1) * w; } path.push(x - ox, y - oy); }
      }
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      function trace() { ctx.beginPath(); ctx.moveTo(path[0], path[1]); for (var k2 = 2; k2 < path.length; k2 += 2) ctx.lineTo(path[k2], path[k2 + 1]); }
      trace(); ctx.strokeStyle = rgbStr(C_DARK); ctx.lineWidth = 2.6 * sc; ctx.stroke();
      trace(); ctx.strokeStyle = rgbStr(C_ROPE); ctx.lineWidth = 1.5 * sc; ctx.stroke();
      trace(); ctx.strokeStyle = rgbStr(mix(C_ROPE, [255, 244, 220], 0.45)); ctx.lineWidth = 0.7 * sc; ctx.setLineDash([2.2 * sc, 2.4 * sc]); ctx.lineDashOffset = 0; ctx.stroke();
      ctx.restore();
    }
    function sagPoints(a, b, sag) {   // a slack last segment: a sagging curve (quadratic) sampled
      var out = [], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + sag;
      for (var i = 0; i <= 12; i++) { var u = i / 12, iu = 1 - u; out.push({ x: iu * iu * a.x + 2 * iu * u * mx + u * u * b.x, y: iu * iu * a.y + 2 * iu * u * my + u * u * b.y }); }
      return out;
    }
    // the hook: a shank with two curved prongs, drawn along its direction (no bitmap is rotated)
    function drawHook(ctx, x, y, ux, uy, ox, oy, pixel, sc) {
      var wx = -uy, wy = ux;
      var shape = pixel ? [[2, 0], [1, 0], [0, 0], [-1, 0], [-2, 0], [-3, 0], [0, 1], [0, -1], [-1, 2], [-1, -2], [-2, 2], [-2, -2]] : [[2, 0]];
      var k = pixel ? 1 : 1.25 * sc;
      if (pixel) {
        var seen = {}, cells = [];
        for (var i = 0; i < shape.length; i++) { var X = Math.round(x - ox + ux * shape[i][0] + wx * shape[i][1]), Y = Math.round(y - oy + uy * shape[i][0] + wy * shape[i][1]); if (!seen[X + ',' + Y]) { seen[X + ',' + Y] = 1; cells.push([X, Y, shape[i]]); } }
        ctx.fillStyle = '#1a1424';
        for (i = 0; i < cells.length; i++) for (var q = 0; q < 4; q++) { var nx = cells[i][0] + (q === 0 ? 1 : q === 1 ? -1 : 0), ny = cells[i][1] + (q === 2 ? 1 : q === 3 ? -1 : 0); if (!seen[nx + ',' + ny]) { seen[nx + ',' + ny] = 2; ctx.fillRect(nx, ny, 1, 1); } }
        for (i = 0; i < cells.length; i++) { var c = cells[i], lit = (c[2][1] * wy + c[2][0] * uy) < 0 ? 1 : 0; ctx.fillStyle = rgbStr(lit ? mix(C_HOOK, [255, 255, 255], 0.35) : mix(C_HOOK, [40, 40, 60], 0.35)); ctx.fillRect(c[0], c[1], 1, 1); }
        return { x: x - ox - 6, y: y - oy - 6, w: 12, h: 12 };
      }
      ctx.save(); ctx.translate(x - ox, y - oy); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      function path() { ctx.beginPath(); ctx.moveTo(ux * 2 * k, uy * 2 * k); ctx.lineTo(-ux * 5 * k, -uy * 5 * k);
        ctx.moveTo(0, 0); ctx.quadraticCurveTo((wx * 2.4 - ux * 0.5) * k, (wy * 2.4 - uy * 0.5) * k, (wx * 2.6 - ux * 3.6) * k, (wy * 2.6 - uy * 3.6) * k);
        ctx.moveTo(0, 0); ctx.quadraticCurveTo((-wx * 2.4 - ux * 0.5) * k, (-wy * 2.4 - uy * 0.5) * k, (-wx * 2.6 - ux * 3.6) * k, (-wy * 2.6 - uy * 3.6) * k); }
      path(); ctx.strokeStyle = '#1a1424'; ctx.lineWidth = 2.8 * k; ctx.stroke();
      path(); ctx.strokeStyle = rgbStr(C_HOOK); ctx.lineWidth = 1.5 * k; ctx.stroke();
      ctx.beginPath(); ctx.arc(-ux * 5.4 * k, -uy * 5.4 * k, 1.3 * k, 0, Math.PI * 2); ctx.strokeStyle = rgbStr(mix(C_HOOK, [60, 60, 80], 0.4)); ctx.lineWidth = 1 * k; ctx.stroke();
      ctx.restore();
      return { x: x - ox - 7 * k, y: y - oy - 7 * k, w: 14 * k, h: 14 * k };
    }
    // a ring anchor: a heavy iron ring with a warm glint and a faint halo (drawn in code, never rotated; light from above)
    var RING_PAL = ['#1a1424', '#3a3446', '#5e5a70', '#8e8ca2', '#c4c4d4', '#f0eef6'];
    function drawRing(ctx, a, ox, oy, pixel, sc, hot, tMs, noHalo) {
      var x = Math.round(a.x - ox), y = Math.round(a.y - oy), r = pixel ? 4 : 4.4 * sc;
      if (pixel) {
        if (!noHalo) {   // a dithered halo so a ring floating in the air reads as a thing to grab
          var ph = Math.floor((tMs || 0) / 400) & 1;
          ctx.fillStyle = 'rgba(255,214,120,0.22)';
          for (var hy = -7; hy <= 7; hy++) for (var hx = -7; hx <= 7; hx++) { var hd = hx * hx + hy * hy; if (hd > 49 || hd < 30 || ((hx + hy + ph) & 1)) continue; ctx.fillRect(x + hx, y + hy, 1, 1); }
        }
        for (var yy = -r - 1; yy <= r + 1; yy++) for (var xx = -r - 1; xx <= r + 1; xx++) {
          var d = Math.sqrt(xx * xx + yy * yy);
          if (d > r + 0.5 || d < r - 2.1) continue;
          var edge = d > r - 0.3 || d < r - 1.6, lit = -yy / (d || 1);
          ctx.fillStyle = edge ? RING_PAL[0] : lit > 0.55 ? RING_PAL[5] : lit > 0.1 ? RING_PAL[4] : lit > -0.45 ? RING_PAL[3] : RING_PAL[2];
          ctx.fillRect(x + xx, y + yy, 1, 1);
        }
        ctx.fillStyle = '#ffe2a0'; ctx.fillRect(x - 2, y - 3, 1, 1);
      } else {
        ctx.save();
        if (!noHalo) { var gr = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.2); gr.addColorStop(0, 'rgba(255,214,120,0.28)'); gr.addColorStop(1, 'rgba(255,214,120,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill(); }
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.strokeStyle = '#1a1424'; ctx.lineWidth = 2.8 * sc; ctx.stroke();
        var g2 = ctx.createLinearGradient(x, y - r, x, y + r); g2.addColorStop(0, '#f4f2fa'); g2.addColorStop(0.5, '#9a98ae'); g2.addColorStop(1, '#3e3a4e');
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.strokeStyle = g2; ctx.lineWidth = 1.5 * sc; ctx.stroke();
        ctx.fillStyle = '#ffe2a0'; ctx.beginPath(); ctx.arc(x - r * 0.45, y - r * 0.75, 0.6 * sc, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      if (hot) drawReticle(ctx, x, y, pixel ? 8 : 9 * sc, pixel, sc, tMs, '#ffd86a');
      var m = pixel ? 8 : 10 * sc;
      return { x: x - m, y: y - m, w: 2 * m, h: 2 * m };
    }
    function drawReticle(ctx, x, y, s, pixel, sc, tMs, col) {
      var pulse = Math.sin((tMs || 0) / 130) * (pixel ? 1 : 1.2 * sc), e = Math.round(s + pulse), L = pixel ? 2 : 3 * sc;
      ctx.save(); ctx.fillStyle = col;
      if (pixel) {
        var dk = 'rgba(20,12,30,0.75)';
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
          var cx = x + c[0] * e, cy = y + c[1] * e;
          ctx.fillStyle = dk; ctx.fillRect(cx - (c[0] > 0 ? L : 0) + 1, cy + 1 - (c[1] > 0 ? 0 : 0), L + 1, 1); ctx.fillRect(cx + 1, cy - (c[1] > 0 ? L : 0) + 1, 1, L + 1);
          ctx.fillStyle = col; ctx.fillRect(cx - (c[0] > 0 ? L : 0), cy, L + 1, 1); ctx.fillRect(cx, cy - (c[1] > 0 ? L : 0), 1, L + 1);
        });
      } else {
        ctx.strokeStyle = 'rgba(20,12,30,0.6)'; ctx.lineWidth = 2.6 * sc; ctx.lineCap = 'round';
        var paths = function () { [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) { var cx = x + c[0] * e, cy = y + c[1] * e; ctx.moveTo(cx - c[0] * -L * 0 - (c[0] > 0 ? L : -L) * 0, cy); ctx.moveTo(cx - c[0] * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy - c[1] * L); }); };
        ctx.beginPath(); paths(); ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 1.3 * sc; ctx.beginPath(); paths(); ctx.stroke();
      }
      ctx.restore();
    }
    function drawSurfaceAim(ctx, a, ox, oy, pixel, sc, tMs) {
      var x = Math.round(a.x - ox), y = Math.round(a.y - oy);
      if (pixel) {
        var col = '#ffd86a', dk = 'rgba(20,12,30,0.75)', ph = Math.floor((tMs || 0) / 160) & 1;
        ctx.fillStyle = dk; ctx.fillRect(x - 3, y + 1, 7, 1); ctx.fillRect(x + 1, y - 3, 1, 7);
        ctx.fillStyle = col; ctx.fillRect(x - 3 - ph, y, 2, 1); ctx.fillRect(x + 2 + ph, y, 2, 1); ctx.fillRect(x, y - 3 - ph, 1, 2); ctx.fillRect(x, y + 2 + ph, 1, 2);
        ctx.fillStyle = '#fff6d0'; ctx.fillRect(x, y, 1, 1);
      } else drawReticle(ctx, x, y, 4 * sc, false, sc, tMs, '#ffd86a');
    }
    function draw(ctx, camX, camY, body) {
      stats.draws++; lastDrawn = [];
      if (!ctx) return;
      try { drawInner(ctx, num(camX, 0), num(camY, 0), body); }
      catch (e) { stats.drawErrors++; warn('draw', 'draw failed: ' + (e && e.message)); try { ctx.restore(); } catch (e2) { } }
    }
    function drawRings(ctx, camX, camY) {
      try {
        var pixel = isPixel(ctx), sc = scaleNow(), rings = anchorList();
        for (var i = 0; i < rings.length; i++) {
          var a = rings[i]; if (!a || a.hidden || a.enabled === false || !isFinite(a.x)) continue;
          var id = a.id != null ? a.id : i, hot = S.aim && S.aim.kind === 'ring' && S.aim.ring === id && S.state !== 'attached';
          var r = drawRing(ctx, a, num(camX, 0), num(camY, 0), pixel, sc, hot, S.t);
          lastDrawn.push({ x: r.x, y: r.y, w: r.w, h: r.h, kind: 'ring', owner: null });
        }
      } catch (e) { stats.drawErrors++; }
    }
    function drawInner(ctx, ox, oy, body) {
      var pixel = isPixel(ctx), sc = scaleNow(), hand = body ? handOf(body) : null;
      if (!hand && S.hand) { var sec = stepMs / 1000; hand = S.active ? { x: S.hand.x + S.vel.x * sec, y: S.hand.y + S.vel.y * sec } : S.hand; }
      ctx.save();
      if (pixel) ctx.imageSmoothingEnabled = false;
      if (o.drawRings !== false) drawRings(ctx, ox, oy);
      if (P.showAim > 0 && S.aim && S.aim.kind === 'surface' && (S.state === 'idle')) drawSurfaceAim(ctx, S.aim, ox, oy, pixel, sc, S.t);
      if (hand && (S.state === 'attached' || S.state === 'shot' || S.state === 'retract')) {
        var pts, ux, uy, hk;
        if (S.state === 'attached') {
          pts = ropePoints(hand);
          var last = S.pivots[S.pivots.length - 1], free = S.L - S.fixed, d = dist(last.x, last.y, hand.x, hand.y);
          if (d < free - 1.5 * sc && !(pts[1] && pts[1].temp)) { var sag = Math.sqrt(Math.max(0, free * free - d * d)) * 0.5; var sp2 = sagPoints(hand, last, sag); pts = sp2.concat(pts.slice(2)); }
          var a0 = S.pivots[0], b0 = S.pivots.length > 1 ? S.pivots[1] : (pts.length > 1 ? pts[pts.length - 2] : hand);
          ux = a0.x - b0.x; uy = a0.y - b0.y; var l0 = Math.sqrt(ux * ux + uy * uy) || 1; ux /= l0; uy /= l0;
          if (pixel) pixelLine(ctx, pts, ox, oy, 0, null); else smoothLine(ctx, pts, ox, oy, sc, null);
          // where the rope is pressed over a corner: a bright rub mark and a dark notch
          for (var pi = 1; pi < S.pivots.length; pi++) {
            var pv = S.pivots[pi], px0 = Math.round(pv.x - ox), py0 = Math.round(pv.y - oy), k2 = pixel ? 1 : sc;
            ctx.fillStyle = '#1a1024'; ctx.fillRect(px0 - Math.round(1.5 * k2), py0 - Math.round(1.5 * k2), Math.round(3 * k2), Math.round(3 * k2));
            ctx.fillStyle = rgbStr(mix(C_ROPE, [255, 240, 200], 0.55)); ctx.fillRect(px0 - Math.round(0.5 * k2), py0 - Math.round(0.5 * k2), Math.max(1, Math.round(2 * k2)), Math.max(1, Math.round(1 * k2)));
          }
          if (S.hook.kind !== 'ring') hk = drawHook(ctx, a0.x, a0.y, ux, uy, ox, oy, pixel, sc);
          else {   // tied to a ring: the ring is drawn again over the rope end, with a knot where the rope leaves it
            var rr = pixel ? 4 : 4.4 * sc, kx = a0.x - ux * rr, ky = a0.y - uy * rr;
            hk = drawRing(ctx, a0, ox, oy, pixel, sc, false, S.t, true);
            ctx.fillStyle = rgbStr(C_DARK); ctx.fillRect(Math.round(kx - ox) - 1, Math.round(ky - oy) - 1, pixel ? 3 : 3 * sc, pixel ? 3 : 3 * sc);
            ctx.fillStyle = rgbStr(C_ROPE); ctx.fillRect(Math.round(kx - ox) - 1, Math.round(ky - oy) - 1, pixel ? 2 : 2 * sc, pixel ? 2 : 2 * sc);
          }
        } else {
          var hx = S.hook.x, hy = S.hook.y; ux = hx - hand.x; uy = hy - hand.y; var l1 = Math.sqrt(ux * ux + uy * uy) || 1; ux /= l1; uy /= l1;
          var prog = clamp(S.hook.travelled / Math.max(1, S.hook.dist), 0, 1), amp = (S.state === 'shot' ? (1 - prog) * 3.2 : 1.6) * (pixel ? 1 : sc);
          var wig = function (s, u) { return Math.sin(s * 0.45 - S.t / 40) * amp * Math.sin(u * Math.PI); };
          if (pixel) pixelLine(ctx, [hand, { x: hx, y: hy }], ox, oy, 0, wig); else smoothLine(ctx, [hand, { x: hx, y: hy }], ox, oy, sc, wig);
          hk = drawHook(ctx, hx, hy, S.state === 'retract' ? -ux : ux, S.state === 'retract' ? -uy : uy, ox, oy, pixel, sc);
          pts = [hand, { x: hx, y: hy }];
        }
        var bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
        for (var i = 0; i < pts.length; i++) { bx0 = Math.min(bx0, pts[i].x); by0 = Math.min(by0, pts[i].y); bx1 = Math.max(bx1, pts[i].x); by1 = Math.max(by1, pts[i].y); }
        lastDrawn.push({ x: bx0 - ox, y: by0 - oy, w: bx1 - bx0 + 1, h: by1 - by0 + 1, kind: 'rope', owner: 'hero' });
        if (hk) lastDrawn.push({ x: hk.x, y: hk.y, w: hk.w, h: hk.h, kind: 'hook', owner: 'hero' });
      }
      // sparks and grit
      for (var si = 0; si < sparks.length; si++) {
        var p = sparks[si]; if (!p.on) continue;
        var f = 1 - p.life / p.max;
        if (p.kind === 1) { ctx.fillStyle = 'rgba(214,200,176,' + (0.55 * f).toFixed(3) + ')'; var s2 = pixel ? (f > 0.5 ? 2 : 1) : (1.5 + 2.5 * (1 - f)) * sc; ctx.fillRect(Math.round(p.x - ox - s2 / 2), Math.round(p.y - oy - s2 / 2), s2, s2); }
        else { ctx.fillStyle = f > 0.6 ? '#fff6c8' : f > 0.3 ? '#ffd060' : '#e07a2a'; var s3 = pixel ? 1 : 1.4 * sc; ctx.fillRect(Math.round(p.x - ox), Math.round(p.y - oy), s3, s3); if (f > 0.5) ctx.fillRect(Math.round(p.x - ox - p.vx * 0.012), Math.round(p.y - oy - p.vy * 0.012), s3, s3); }
      }
      ctx.restore();
    }

    // ---------------------------------------------------------------- misc API
    function reset() { S.state = 'idle'; S.pivots = []; S.fixed = 0; S.L = 0; S.carry = null; S.drive = null; S.taut = false; S.active = false; S.aim = null; S.prevHand = null; for (var i = 0; i < sparks.length; i++) sparks[i].on = false; }
    function stateOut() {
      return { t: Math.round(S.t), state: S.state, active: S.active, taut: S.taut, ground: S.ground, length: Math.round(S.L * 10) / 10, free: Math.round((S.L - S.fixed) * 10) / 10,
        anchor: S.pivots[0] ? { x: Math.round(S.pivots[0].x * 10) / 10, y: Math.round(S.pivots[0].y * 10) / 10, kind: S.hook.kind, ring: S.hook.ring } : null,
        pivots: S.pivots.map(function (p) { return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }; }),
        hook: S.state === 'shot' || S.state === 'retract' ? { x: Math.round(S.hook.x), y: Math.round(S.hook.y), kind: S.hook.kind } : null,
        hand: S.hand ? { x: Math.round(S.hand.x * 10) / 10, y: Math.round(S.hand.y * 10) / 10 } : null,
        carry: S.carry ? { t: Math.round(S.carry.t), vx: Math.round(S.carry.vx) } : null,
        aim: S.aim ? { x: Math.round(S.aim.x), y: Math.round(S.aim.y), kind: S.aim.kind, ring: S.aim.ring } : null,
        events: S.events.slice(-12) };
    }
    function hash() {
      var s = S.state + '|' + S.L.toFixed(3) + '|' + S.fixed.toFixed(3) + '|' + S.hook.x.toFixed(3) + ',' + S.hook.y.toFixed(3) + '|' + S.vel.x.toFixed(3) + ',' + S.vel.y.toFixed(3) + '|' + S.evN;
      for (var i = 0; i < S.pivots.length; i++) s += '|' + S.pivots[i].x.toFixed(2) + ',' + S.pivots[i].y.toFixed(2);
      for (i = 0; i < sparks.length; i++) if (sparks[i].on) s += '|' + sparks[i].x.toFixed(2) + ',' + sparks[i].y.toFixed(2);
      var h = 2166136261; for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return (h >>> 0).toString(16);
    }
    var api = {
      version: VERSION,
      update: update,
      draw: draw,
      drawRings: drawRings,
      reset: reset, clear: reset,
      release: function (opts) { opts = opts || {}; var v = release('api', opts.vx != null ? { x: num(opts.vx, 0) * U, y: num(opts.vy, 0) * U } : null, !!opts.jump); return v ? { vx: v.x / U, vy: v.y / U } : null; },
      fire: function (aimX, aimY, body) { var h = handOf(body) || S.hand; if (!h) return false; var a = aimDir({ aimX: aimX, aimY: aimY }, body); if (S.state === 'attached') release('api', null, false); fire(h, a[0], a[1]); return true; },
      drive: function (cmd) { cmd = cmd || {}; S.drive = { fire: cmd.fire !== false, fired: false, holdMs: num(cmd.holdMs, 600), reel: num(cmd.reel, 0), jump: !!cmd.jump, aimX: cmd.aimX != null ? num(cmd.aimX, 0) : null, aimY: cmd.aimY != null ? num(cmd.aimY, 0) : null }; return true; },
      attached: function () { return S.state === 'attached'; },
      busy: function () { return S.state !== 'idle' || !!S.carry; },
      flying: function () { return !!S.carry && S.state !== 'attached'; },
      preview: function () { return S.aim ? { x: S.aim.x, y: S.aim.y, kind: S.aim.kind, ring: S.aim.ring } : null; },
      state: stateOut,
      length: function () { return S.L; },
      setParams: function (p) { setParams(p); colours(); },
      params: function () { var c = {}; for (var q in P) c[q] = P[q]; return c; },
      stats: function () { var c = {}; for (var q in stats) c[q] = stats[q]; c.state = S.state; c.pivots = S.pivots.length; return c; },
      lastDrawn: function () { return lastDrawn.slice(); },
      // the rope as drawn now: [hand, pivots..., anchor] in world px (empty when not attached); pass the body as in draw()
      ropePath: function (body) { var hd = body ? handOf(body) : S.hand; return hd ? ropePoints(hd).map(function (p) { return { x: p.x, y: p.y }; }) : []; },
      hash: hash,
      // for checks: the free length of the last rope segment and the hand the module last saw
      _debug: function () { var last = S.pivots[S.pivots.length - 1]; return { free: S.L - S.fixed, pivot: last ? { x: last.x, y: last.y } : null, hand: S.hand, vel: { x: S.vel.x, y: S.vel.y }, U: U, maxStep: maxStepPx() }; }
    };
    return api;
  }

  var G = { create: create, defaults: DEFAULTS, params: PARAM_KEYS, version: VERSION };
  root.GameDNA_Grapple = G;
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
})(typeof window !== 'undefined' ? window : this);
