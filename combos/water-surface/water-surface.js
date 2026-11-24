/* GameDNA water-surface (E-18) v1.0.2 - spring water surface and splashes for side-view games.
 * Plain script, no dependencies, no import/export, ASCII only. One global: GameDNA_WaterSurface.
 *
 * Each pool's surface is a row of springs (one column every `spacing` px) joined by a wave term, so a splash runs out
 * to both sides, reflects off the pool walls and dies down. Bodies the game lists (characters, enemies, projectiles,
 * thrown items) splash when they enter and drip when they leave; floaters bob and tilt on the waves; the module draws
 * the water over everything below the surface (tint, depth, reflection, light shafts, foam, bubbles, droplets) and an
 * optional waterfall that keeps feeding a pool.
 *
 *   var water = GameDNA_WaterSurface.create({pools: [{x, y, w, h}], bodies: () => [{id, x, y, w, h}], scale, seed});
 *   water.update(stepMs)                 once per fixed step (update(0) while the world is stopped)
 *   water.draw(ctx, camX, camY)          after the sprites (the water tints what is under the surface), before the HUD
 *
 * Deterministic: seeded random numbers and the game time from update(); no Math.random, no wall clock.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.2';
  var SUB_US = 8333;                         // fixed spring sub-step, microseconds (1/120 s)
  var SUB = SUB_US / 1e6;
  var MAX_DROPS = 700, MAX_BUBBLES = 220, MAX_SHEETS = 24, MAX_MIST = 90, MAX_RINGS = 48;

  var DEF = {
    spacing: 4,        // px between spring columns (x scale)
    tension: 26,       // spring constant of each column (1/s^2): how hard it pulls back to the rest line
    spread: 150,       // wave speed along the surface (px/s x scale)
    damping: 1.5,      // velocity damping per second
    viscosity: 0.25,   // smoothing of neighbouring column velocities (removes jagged spikes)
    splash: 1,         // entry impulse multiplier
    droplets: 1,       // droplet count multiplier
    maxAmp: 22,        // max surface displacement (px x scale)
    clarity: 0.42,     // water alpha just under the surface
    depthAlpha: 0.86,  // water alpha at the bottom of the pool
    reflect: 0.3,      // reflection strength just under the surface (0 = off)
    shafts: 1,         // light shafts under the surface (smooth render)
    foam: 1,
    bubbles: 1,
    wake: 1,           // ripples and spray from bodies moving through the surface
    gravity: 1,
    ambient: 0.3,      // a gentle breeze on the surface so calm water is never dead flat (0 = still)
    palette: 'lake',   // lake | sea | swamp | cave
    render: 'auto'     // auto | pixel | smooth
  };

  var PALETTES = {
    lake:  { top: [86, 182, 222], mid: [34, 118, 172], deep: [16, 52, 102], line: [222, 250, 255], foam: [242, 252, 255], band: [138, 214, 240], drop: [196, 238, 255] },
    sea:   { top: [70, 196, 206], mid: [24, 120, 160], deep: [10, 44, 88], line: [226, 255, 252], foam: [246, 255, 255], band: [126, 226, 228], drop: [200, 246, 250] },
    swamp: { top: [112, 160, 96], mid: [58, 104, 72], deep: [24, 46, 36], line: [214, 236, 190], foam: [228, 236, 206], band: [146, 186, 116], drop: [196, 222, 170] },
    cave:  { top: [70, 132, 168], mid: [28, 74, 112], deep: [8, 24, 48], line: [190, 232, 255], foam: [214, 238, 252], band: [104, 166, 200], drop: [170, 214, 240] }
  };

  function num(v, d) { return v == null || v === '' || typeof v === 'object' || isNaN(+v) ? d : +v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function fin(v) { return typeof v === 'number' && isFinite(v); }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a < 0 ? 0 : a > 1 ? 1 : Math.round(a * 1000) / 1000) + ')'; }
  function mix(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }
  function hsh(x, y) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
  function makeRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  var canvasFactory = function (w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  function create(options) {
    var O = options || {};
    var P = {}, k;
    for (k in DEF) P[k] = DEF[k];
    setParamsInto(O.params);
    function setParamsInto(o) { if (!o || typeof o !== 'object') return; for (var q in o) if (q in DEF) P[q] = typeof DEF[q] === 'string' ? String(o[q]) : num(o[q], P[q]); }
    function sc() { var v = typeof O.scale === 'function' ? num(safeCall(O.scale), 1) : num(O.scale, 1); return v > 0 ? v : 1; }
    function pal() { return PALETTES[P.palette] || PALETTES.lake; }

    var S = { updates: 0, frozen: 0, draws: 0, splashes: 0, entries: 0, exits: 0, projectiles: 0, dropsSpawned: 0, dropsBack: 0,
      cbErrors: 0, drawErrors: 0, updErrors: 0, badInput: 0, peakAmp: 0, clamps: 0, time: 0, accUs: 0, substeps: 0 };
    var rnd = makeRng(num(O.seed, 1) * 2654435761 + 7);
    var EVENTS = [];

    /* ---------- pools ---------- */
    var POOLS = [];
    function addPool(p, i) {
      if (!p || !fin(+p.x) || !fin(+p.y) || !(+p.w > 0) || !(+p.h > 0)) { S.badInput++; return null; }
      var s = sc(), sp = Math.max(1, P.spacing * s), n = Math.max(3, Math.ceil(+p.w / sp) + 1);
      var pool = { id: p.id != null ? String(p.id) : 'pool' + i, x: +p.x, y: +p.y, w: +p.w, h: +p.h, sp: +p.w / (n - 1), n: n,
        d: new Float64Array(n), v: new Float64Array(n), lap: new Float64Array(n), foam: new Float32Array(n), palette: p.palette || null,
        floor: typeof p.floor === 'function' ? p.floor : null };
      POOLS.push(pool); return pool;
    }
    (Array.isArray(O.pools) ? O.pools : O.pool ? [O.pool] : []).forEach(addPool);

    function poolAt(x, y) {
      for (var i = 0; i < POOLS.length; i++) { var p = POOLS[i]; if (x >= p.x && x <= p.x + p.w && (y == null || (y >= p.y - P.maxAmp * sc() * 1.5 && y <= p.y + p.h))) return p; }
      return null;
    }
    function surf(p, x) {
      var f = (x - p.x) / p.sp; if (f <= 0) return p.y + p.d[0]; if (f >= p.n - 1) return p.y + p.d[p.n - 1];
      var i = Math.floor(f), t = f - i; return p.y + p.d[i] + (p.d[i + 1] - p.d[i]) * t;
    }
    // the pool's floor under x (world px): its own floor(x) when given (a sloped lake bed), else the rect bottom
    function floorAt(p, x) {
      var b = p.y + p.h; if (!p.floor) return b;
      var v; try { v = +p.floor(x); } catch (e) { S.cbErrors++; return b; }
      return fin(v) ? clamp(v, p.y - 2, b) : b;
    }
    function slopeAt(p, x) { var a = surf(p, x - p.sp), b = surf(p, x + p.sp); return (b - a) / (2 * p.sp); }
    // add velocity to columns between x0 and x1 (world px) with a smooth window; dv > 0 pushes the surface down
    function push(p, x0, x1, dv) {
      var i0 = Math.max(0, Math.floor((x0 - p.x) / p.sp)), i1 = Math.min(p.n - 1, Math.ceil((x1 - p.x) / p.sp));
      var mid = (x0 + x1) / 2, half = Math.max(p.sp, (x1 - x0) / 2);
      for (var i = i0; i <= i1; i++) { var u = (p.x + i * p.sp - mid) / half; if (u < -1 || u > 1) continue; p.v[i] += dv * (0.5 + 0.5 * Math.cos(u * Math.PI)); }
    }
    function addFoam(p, x0, x1, a) {
      var i0 = Math.max(0, Math.floor((x0 - p.x) / p.sp)), i1 = Math.min(p.n - 1, Math.ceil((x1 - p.x) / p.sp));
      for (var i = i0; i <= i1; i++) p.foam[i] = Math.min(1.2, p.foam[i] + a);
    }

    /* ---------- spring step (semi-implicit Euler, fixed sub-step) ---------- */
    function springStep(p) {
      var s = sc(), n = p.n, d = p.d, v = p.v, lap = p.lap, sp = p.sp;
      var c2 = (P.spread * s) * (P.spread * s) / (sp * sp), kk = P.tension, damp = P.damping;
      var vis = clamp(P.viscosity, 0, 1) * 0.24;
      var maxA = Math.max(1, Math.min(P.maxAmp * s, p.h * 0.6));
      for (var i = 0; i < n; i++) {
        var l = i > 0 ? d[i - 1] : d[i], r = i < n - 1 ? d[i + 1] : d[i];   // pool walls reflect (no flux)
        lap[i] = c2 * (l + r - 2 * d[i]) - kk * d[i] - damp * v[i];
      }
      for (var j = 0; j < n; j++) v[j] += lap[j] * SUB;
      if (vis > 0) {   // velocity smoothing: a tiny viscosity keeps single columns from spiking
        for (var a = 0; a < n; a++) { var vl = a > 0 ? v[a - 1] : v[a], vr = a < n - 1 ? v[a + 1] : v[a]; lap[a] = (vl + vr - 2 * v[a]) * vis; }
        for (var b = 0; b < n; b++) v[b] += lap[b];
      }
      for (var m = 0; m < n; m++) {
        d[m] += v[m] * SUB;
        if (d[m] > maxA) { d[m] = maxA; if (v[m] > 0) v[m] *= 0.3; S.clamps++; }
        else if (d[m] < -maxA) { d[m] = -maxA; if (v[m] < 0) v[m] *= 0.3; S.clamps++; }
        var ad = d[m] < 0 ? -d[m] : d[m]; if (ad > S.peakAmp) S.peakAmp = ad;
      }
    }
    // two slow travelling pressure waves: calm water keeps a soft swell of about 0.5-1.5 px (x ambient); deterministic from time
    function breeze(p) {
      var s = sc(), t = S.substeps * SUB, a = P.ambient * 9 * s * SUB * 60;
      for (var i = 0; i < p.n; i++) {
        var x = (p.x + i * p.sp) / s;
        p.v[i] += a * (Math.sin(x * 0.045 - t * 1.7) + 0.6 * Math.sin(x * 0.11 + t * 2.3 + 1.3)) * 0.45;
      }
    }
    function energy(p) {
      var s = sc(), c2 = (P.spread * s) * (P.spread * s) / (p.sp * p.sp), e = 0;
      for (var i = 0; i < p.n; i++) { e += 0.5 * p.v[i] * p.v[i] + 0.5 * P.tension * p.d[i] * p.d[i]; if (i) { var g = p.d[i] - p.d[i - 1]; e += 0.5 * c2 * g * g; } }
      return e / p.n;
    }

    /* ---------- particles (pooled, no garbage per frame) ---------- */
    function mkPool(nn, f) { var a = []; for (var i = 0; i < nn; i++) a.push(f()); return a; }
    var DROPS = mkPool(MAX_DROPS, function () { return { on: false, x: 0, y: 0, vx: 0, vy: 0, r: 1, life: 0, max: 1, gen: 0, pool: null }; });
    var BUBS = mkPool(MAX_BUBBLES, function () { return { on: false, x: 0, y: 0, x0: 0, vy: 0, r: 1, ph: 0, life: 0, pool: null }; });
    var SHEETS = mkPool(MAX_SHEETS, function () { return { on: false, x: 0, w: 0, h: 0, t: 0, dur: 1, pool: null, jet: false }; });
    var MIST = mkPool(MAX_MIST, function () { return { on: false, x: 0, y: 0, vx: 0, vy: 0, r: 1, life: 0, max: 1 }; });
    var RINGS = mkPool(MAX_RINGS, function () { return { on: false, x: 0, w: 0, t: 0, dur: 1, pool: null }; });
    var dropRR = 0;
    function take(arr) {
      for (var i = 0; i < arr.length; i++) if (!arr[i].on) return arr[i];
      // full: recycle the oldest-looking one (round robin) so heavy splashing never grows memory
      var o = arr[dropRR++ % arr.length]; return o;
    }
    function spawnDrop(p, x, y, vx, vy, r, life, gen) {
      var o = take(DROPS); o.on = true; o.x = x; o.y = y; o.vx = vx; o.vy = vy; o.r = r; o.life = 0; o.max = life; o.gen = gen | 0; o.pool = p; S.dropsSpawned++; return o;
    }
    function spawnBubble(p, x, y, r) {
      var o = take(BUBS), s = sc(); o.on = true; o.x = x; o.x0 = x; o.y = y; o.r = r; o.vy = -(22 + 34 * rnd()) * s * (0.6 + r / (2.4 * s)); o.ph = rnd() * 6.283; o.life = 0; o.pool = p;
    }
    function spawnMist(x, y, r) { var o = take(MIST), s = sc(); o.on = true; o.x = x; o.y = y; o.r = r; o.vx = (rnd() - 0.5) * 24 * s; o.vy = -(10 + 22 * rnd()) * s; o.life = 0; o.max = 0.7 + rnd() * 0.7; }
    function spawnSheet(p, x, w, h, dur, jet) { var o = take(SHEETS); o.on = true; o.x = x; o.w = w; o.h = h; o.t = 0; o.dur = dur; o.pool = p; o.jet = !!jet; }
    function spawnRing(p, x, w) { var o = take(RINGS); o.on = true; o.x = x; o.w = w; o.t = 0; o.dur = 0.9; o.pool = p; }

    /* ---------- splashes ---------- */
    function event(ev, id, x, y, extra) {
      var e = { ev: ev, id: id, x: Math.round(x), y: Math.round(y), t: Math.round(S.time) };
      if (extra) for (var q in extra) e[q] = extra[q];
      EVENTS.push(e); if (EVENTS.length > 64) EVENTS.shift();
      return e;
    }
    // speed: px/s into the water (world px); w: body width
    function doSplash(p, x, w, speed, id, kind) {
      var s = sc(), sy = surf(p, x), G = 900 * s * P.gravity;
      var v0 = Math.max(0, speed) / s;                         // HD px/s
      var e = clamp(v0 / 420, 0.06, 1.7) * P.splash;          // entry energy
      var wz = clamp(w / s / 30, 0.12, 2.6);                   // size
      var jet = kind === 'projectile' || (w < 9 * s && v0 > 260);
      if (jet) kind = 'projectile';
      // the body pushes the water down under it and up to both sides (the crown wave)
      var half = Math.max(w / 2, 3 * s);
      push(p, x - half * 1.1, x + half * 1.1, (jet ? 150 : 420) * s * e * Math.sqrt(wz));
      push(p, x - half * 2.6, x - half * 0.9, -(jet ? 50 : 170) * s * e);
      push(p, x + half * 0.9, x + half * 2.6, -(jet ? 50 : 170) * s * e);
      addFoam(p, x - half * 1.6, x + half * 1.6, 0.35 + 0.45 * e);
      spawnRing(p, x, half * 2);
      // droplets: a crown thrown out of both edges, more and faster for a faster / bigger entry
      var nd = Math.round((jet ? 7 + 6 * e : (7 + 20 * e) * Math.sqrt(wz)) * P.droplets);
      nd = Math.min(nd, jet ? 16 : 52);
      for (var i = 0; i < nd; i++) {
        var side = i % 2 ? 1 : -1, u = rnd();
        var ox = jet ? (rnd() - 0.5) * half : side * half * (0.55 + 0.55 * rnd());
        var ang = jet ? (rnd() - 0.5) * 0.5 : side * (0.12 + 0.62 * u);          // from vertical, outward
        var spd = (jet ? (190 + 230 * e) * (0.55 + 0.45 * rnd()) : (110 + 230 * e) * Math.sqrt(Math.min(wz, 1.6)) * (0.45 + 0.55 * rnd())) * s;
        var r = (jet ? 0.7 + 0.8 * rnd() : 0.8 + 1.5 * rnd() * (0.7 + 0.3 * Math.min(wz, 1.5))) * s;
        spawnDrop(p, x + ox, sy - 1 * s, Math.sin(ang) * spd, -Math.cos(ang) * spd, r, 2.5, 0);
      }
      if (!jet && e * wz > 0.25) spawnSheet(p, x, half * 2 * 1.05, (14 + 34 * e) * s * Math.sqrt(Math.min(wz, 1.8)), 0.36 + 0.22 * Math.min(e, 1.2), false);
      if (jet) spawnSheet(p, x, Math.max(2 * s, half), (12 + 26 * e) * s, 0.3, true);
      var nb = Math.round((jet ? 4 + 4 * e : (4 + 9 * e) * Math.min(2, wz)) * P.bubbles);
      for (var b = 0; b < Math.min(nb, 18); b++) {
        var depth = Math.min(p.h * 0.85, (4 + rnd() * (jet ? 26 : 18 + 10 * wz)) * s);
        var bxp = x + (rnd() - 0.5) * half * 1.6; spawnBubble(p, bxp, Math.min(sy + depth, floorAt(p, bxp) - 2 * s), (0.8 + rnd() * 1.6) * s);
      }
      S.splashes++; if (kind === 'projectile') S.projectiles++;
      if (O.onSplash) safeCall(O.onSplash, { id: id, x: x, y: sy, speed: speed, w: w, kind: kind || 'body', energy: e, pool: p.id });
      if (O.onSound) safeCall(O.onSound, 'splash', { id: id, x: x, energy: e, kind: kind || 'body' });
      return e;
    }
    function doExit(p, x, w, speed, id) {
      var s = sc(), sy = surf(p, x), e = clamp(Math.max(0, speed) / s / 380, 0.08, 1.2) * P.splash, half = Math.max(w / 2, 3 * s);
      push(p, x - half, x + half, -150 * s * e);               // the water is pulled up after the body
      addFoam(p, x - half * 1.2, x + half * 1.2, 0.25 + 0.3 * e);
      var nd = Math.min(18, Math.round((4 + 9 * e) * Math.sqrt(clamp(w / s / 30, 0.2, 2)) * P.droplets));
      for (var i = 0; i < nd; i++) {   // drips shed from the body's underside: they fall back
        spawnDrop(p, x + (rnd() - 0.5) * w * 0.9, sy - (1 + rnd() * 6) * s, (rnd() - 0.5) * 50 * s, (-60 * rnd() * e - 10) * s, (0.7 + rnd() * 1.1) * s, 2, 1);
      }
      if (O.onSound) safeCall(O.onSound, 'exit', { id: id, x: x, energy: e });
    }

    /* ---------- bodies the game lists ---------- */
    var TRACK = {}, trackKeys = [];
    function bodyStep(b, key, dts, isFloater) {
      if (!b || !fin(+b.x) || !fin(+b.y) || !(+b.w > 0) || !(+b.h > 0)) { S.badInput++; return; }
      var x = +b.x, y = +b.y, w = +b.w, h = +b.h, s = sc(), cx = x + w / 2, bot = y + h;
      var tr = TRACK[key];
      if (!tr) { tr = TRACK[key] = { seen: -2, cx: cx, bot: bot, top: y, wet: false, pool: null, wakeAcc: 0 }; trackKeys.push(key); }
      var cont = tr.seen === S.updates - 1;
      var hyst = Math.max(2 * s, Math.min(6 * s, h * 0.15));
      if (!cont) {   // first sight (or after a gap): no splash; just learn whether it is already in the water
        var p0 = poolAt(cx, bot); tr.wet = !!(p0 && bot > surf(p0, cx) + 0.5 * s); tr.pool = tr.wet ? p0 : null;
      } else {
        var vx = (cx - tr.cx) / dts, vy = (bot - tr.bot) / dts;
        if (!tr.wet) {
          // entry: the bottom edge crossed the surface during this step (tested along the path: fast projectiles too)
          var hit = null;
          for (var i = 0; i < POOLS.length && !hit; i++) {
            var p = POOLS[i];
            if (bot <= p.y - P.maxAmp * s * 1.2) continue;
            var steps2 = Math.min(64, Math.max(1, Math.ceil(Math.max(Math.abs(bot - tr.bot), Math.abs(cx - tr.cx)) / Math.max(2, p.sp))));
            var pbot = tr.bot, pcx = tr.cx;
            for (var q = 1; q <= steps2; q++) {
              var f = q / steps2, xb = tr.cx + (cx - tr.cx) * f, yb = tr.bot + (bot - tr.bot) * f;
              if (xb >= p.x - w * 0.25 && xb <= p.x + p.w + w * 0.25) {
                var xs = clamp(xb, p.x, p.x + p.w), sy = Math.max(surf(p, xs), p.y - 1 * s);   // a trough passing under a body that stands above the rest line is no entry
                if (yb > sy + 0.5 * s && !(pbot > Math.max(surf(p, clamp(pcx, p.x, p.x + p.w)), p.y - 1 * s) + 0.5 * s && pcx >= p.x - w * 0.25 && pcx <= p.x + p.w + w * 0.25)) { hit = { p: p, x: xs }; break; }
              }
              pbot = yb; pcx = xb;
            }
          }
          if (hit) {
            tr.wet = true; tr.pool = hit.p; S.entries++;
            var spd = Math.max(vy, 0) + Math.abs(vx) * 0.25;
            var kind = b.kind === 'projectile' || (w < 9 * s && spd > 260 * s) ? 'projectile' : (isFloater ? 'floater' : 'body');
            doSplash(hit.p, hit.x, Math.min(w, hit.p.w), Math.max(spd, 30 * s), b.id != null ? b.id : key, kind);
            event('splash', b.id != null ? b.id : key, hit.x, surf(hit.p, hit.x), { speed: Math.round(spd / s), kind: kind, pool: hit.p.id });
          }
        } else {
          var pw = tr.pool || poolAt(cx, null);
          var sy2 = pw ? surf(pw, clamp(cx, pw.x, pw.x + pw.w)) : null;
          var outX = !pw || cx < pw.x - w || cx > pw.x + pw.w + w;
          if (outX || (vy <= 0 && bot < Math.min(sy2, pw.y) - hyst)) {   // out: above the surface AND the rest line, not on the way down (its own splash trough is no exit)
            tr.wet = false; S.exits++;
            if (pw && !outX && vy < -20 * s) { doExit(pw, clamp(cx, pw.x, pw.x + pw.w), w, -vy, key); event('exit', b.id != null ? b.id : key, cx, sy2, { speed: Math.round(-vy / s) }); tr.drip = 0.55; tr.dripPool = pw; }
            tr.pool = null;
          } else if (pw && y < sy2 && bot > sy2 && P.wake > 0 && !isFloater) {
            // wading / swimming through the surface: a bow wave in front, a trough behind, spray when fast
            var avx = Math.abs(vx);
            if (avx > 6 * s) {
              var dir = vx > 0 ? 1 : -1, front = cx + dir * w * 0.55;
              var kw = P.wake * Math.min(avx / s, 220) * s * 0.5;
              push(pw, front - w * 0.35, front + w * 0.35, -kw * dts * 6);
              push(pw, cx - dir * w * 0.6 - w * 0.3, cx - dir * w * 0.6 + w * 0.3, kw * dts * 4);
              addFoam(pw, front - w * 0.3, front + w * 0.3, 0.05 * P.wake);
              tr.wakeAcc += avx * dts;
              if (avx > 40 * s && tr.wakeAcc > 9 * s) {
                tr.wakeAcc = 0;
                for (var dd = 0; dd < 2; dd++) spawnDrop(pw, front, sy2 - 1 * s, dir * (30 + 40 * rnd()) * s + vx * 0.5, -(60 + 70 * rnd()) * s, (0.6 + 0.8 * rnd()) * s, 1.5, 1);
              }
            }
          }
        }
      }
      // for half a second after leaving, water keeps dripping off the body's underside (it trails the body, then falls back)
      if (tr.drip > 0 && cont) {
        tr.drip -= dts; tr.dripAcc = (tr.dripAcc || 0) + dts * (8 + 10 * tr.drip) * P.droplets;
        while (tr.dripAcc >= 1) { tr.dripAcc -= 1; spawnDrop(tr.dripPool, x + (0.15 + 0.7 * rnd()) * w, bot - 1 * s, (cx - tr.cx) / dts * 0.3 + (rnd() - 0.5) * 20 * s, Math.max(-40 * s, (bot - tr.bot) / dts * 0.2), (0.7 + 0.7 * rnd()) * s, 2, 1); }
      }
      tr.seen = S.updates; tr.cx = cx; tr.bot = bot; tr.top = y;
    }
    function bodiesStep(dts) {
      var list = null;
      if (typeof O.bodies === 'function') { list = safeCall(O.bodies); }
      else if (Array.isArray(O.bodies)) list = O.bodies;
      if (list && list.length) {
        for (var i = 0; i < list.length && i < 400; i++) { var b = list[i]; if (!b) continue; bodyStep(b, b.id != null ? 'b:' + b.id : 'i:' + i, dts, false); }
      }
      for (var f = 0; f < FLOAT.length; f++) { var fl = FLOAT[f], bx = fl.box; bx.id = fl.id; bx.x = fl.x - fl.w / 2; bx.y = fl.y; bx.w = fl.w; bx.h = fl.h; bodyStep(bx, 'f:' + fl.id, dts, true); }
      // forget bodies not seen for a while (keeps the table small; a body that comes back is "first sight" again)
      if (S.updates % 120 === 0 && trackKeys.length > 64) {
        var keep = [];
        for (var k2 = 0; k2 < trackKeys.length; k2++) { var kk2 = trackKeys[k2]; if (S.updates - TRACK[kk2].seen < 120) keep.push(kk2); else delete TRACK[kk2]; }
        trackKeys = keep;
      }
    }

    /* ---------- floaters ---------- */
    var FLOAT = [];
    function addFloater(o) {
      if (!o || !fin(+o.x) || !(+o.w > 0) || !(+o.h > 0)) { S.badInput++; return null; }
      var s = sc(), p = poolAt(+o.x, null) || POOLS[0]; if (!p) { S.badInput++; return null; }
      var f = { id: o.id != null ? String(o.id) : 'float' + FLOAT.length, x: +o.x, w: +o.w, h: +o.h, y: fin(+o.y) ? +o.y : p.y - (+o.h) * (1 - clamp(num(o.density, 0.45), 0.08, 0.95)),
        vx: num(o.vx, 0), vy: num(o.vy, 0), angle: 0, va: 0, density: clamp(num(o.density, 0.45), 0.08, 0.95), tilt: num(o.tilt, 1), drift: num(o.drift, 1),
        pool: p, inWater: false, kind: 'floater', box: { id: null, x: 0, y: 0, w: 1, h: 1 } };
      f.x = clamp(f.x, p.x + f.w / 2, p.x + p.w - f.w / 2);
      FLOAT.push(f); return f;
    }
    function floaterStep(f, dt) {
      var p = f.pool, s = sc(), G = 900 * s * P.gravity;
      var hw = f.w * 0.42, sl = surf(p, f.x - hw), sr = surf(p, f.x + hw), scn = surf(p, f.x);
      var sm = (sl + sr + 2 * scn) / 4, bottom = f.y + f.h;
      var sub = clamp(bottom - sm, 0, f.h), frac = sub / f.h;
      var a = G - G * frac / f.density;
      if (frac > 0) a -= f.vy * 6.5 * frac + f.vy * Math.abs(f.vy) * 0.012 / s * frac;   // linear + quadratic water drag (a plunge stops within a body height or two)
      f.vy += a * dt; f.y += f.vy * dt;
      f.inWater = frac > 0;
      if (frac > 0) {
        // tilt with the waves (springy), drift down the local slope, water drag
        if (f.tilt) { var target = Math.atan((sr - sl) / (2 * hw)) * 0.85 * f.tilt; f.va += ((target - f.angle) * 60 - f.va * 9) * dt; f.angle += f.va * dt; }
        f.vx += ((sr - sl) / (2 * hw)) * G * 0.22 * f.drift * dt;
        f.vx -= f.vx * 1.6 * dt;
        // the floater's own bobbing pushes the water a little (two-way coupling); damped by the springs
        if (f.vy > 6 * s || f.vy < -6 * s) push(p, f.x - f.w * 0.5, f.x + f.w * 0.5, f.vy * 0.025 * frac);
      } else if (f.tilt) { f.angle *= 1 - Math.min(1, 2 * dt); }
      f.x += f.vx * dt;
      var fb = floorAt(p, f.x);
      if (f.y + f.h > fb) { f.y = fb - f.h; if (f.vy > 0) f.vy = 0; f.vx *= 1 - Math.min(1, 6 * dt); }   // aground on a shelving bed
      var lo = p.x + f.w / 2, hi = p.x + p.w - f.w / 2;
      if (lo > hi) { f.x = p.x + p.w / 2; f.vx = 0; }
      else if (f.x < lo) { f.x = lo; if (f.vx < 0) f.vx *= -0.25; }
      else if (f.x > hi) { f.x = hi; if (f.vx > 0) f.vx *= -0.25; }
      // never deeper than fully under: a hard limit keeps it at the surface whatever the waves do
      if (bottom - sm > f.h) { f.vy -= G * 1.8 * dt; if (f.vy > 0) f.vy *= 1 - Math.min(1, 12 * dt); }
      if (frac > 0 && frac < 1 && f.vy < 0) f.vy *= 1 - Math.min(1, 7 * dt * (1 - frac));   // breaking the surface on the way up costs speed: it rises to float, not to jump out   // fully under: it pops back up
      f.angle = clamp(f.angle, -0.6, 0.6);
    }

    // floaters in the same pool never overlap: they bump and push apart (and stay inside the pool)
    function separate() {
      for (var i = 0; i < FLOAT.length; i++) for (var j = i + 1; j < FLOAT.length; j++) {
        var a = FLOAT[i], b = FLOAT[j]; if (a.pool !== b.pool) continue;
        var need = (a.w + b.w) / 2 + 1 * sc(), dx = b.x - a.x, ov = need - Math.abs(dx);
        if (ov <= 0) continue;
        var dir = dx > 0 || (dx === 0 && i < j) ? 1 : -1;
        a.x -= dir * ov / 2; b.x += dir * ov / 2;
        var va = a.vx, vb = b.vx; if ((vb - va) * dir < 0) { a.vx = (va + vb) / 2 - dir * Math.abs(vb - va) * 0.1; b.vx = (va + vb) / 2 + dir * Math.abs(vb - va) * 0.1; }
        clampIn(a); clampIn(b);
      }
    }
    function clampIn(f) {
      var p = f.pool, lo = p.x + f.w / 2, hi = p.x + p.w - f.w / 2;
      if (lo > hi) f.x = p.x + p.w / 2; else if (f.x < lo) f.x = lo; else if (f.x > hi) f.x = hi;
    }

    /* ---------- waterfalls ---------- */
    var FALLS = [];
    (Array.isArray(O.falls) ? O.falls : []).forEach(function (f) {
      if (!f || !fin(+f.x) || !(+f.w > 0) || !fin(+f.top)) { S.badInput++; return; }
      var p = poolAt(+f.x + f.w / 2, null); if (!p) { S.badInput++; return; }
      FALLS.push({ x: +f.x, w: +f.w, top: +f.top, pool: p, strength: num(f.strength, 1), acc: 0 });
    });
    function fallStep(fl, dt) {
      var p = fl.pool, s = sc(), x0 = fl.x, x1 = fl.x + fl.w;
      // the falling water keeps hammering the surface: small seeded kicks under the sheet
      var n = Math.max(1, Math.round(fl.w / p.sp));
      for (var i = 0; i < n; i++) {
        var x = x0 + (i + rnd()) * fl.w / n;
        push(p, x - p.sp, x + p.sp, (rnd() * 1.4 - 0.25) * 70 * s * fl.strength * dt * 60 * 0.06);
      }
      addFoam(p, x0 - fl.w * 0.6, x1 + fl.w * 0.6, 0.06 * fl.strength);
      fl.acc += dt;
      while (fl.acc > 0.05) {
        fl.acc -= 0.05;
        var sy = surf(p, x0 + fl.w / 2);
        var side = rnd() < 0.5 ? -1 : 1;
        spawnDrop(p, (side < 0 ? x0 : x1) + side * rnd() * 2 * s, sy - 1 * s, side * (25 + 60 * rnd()) * s, -(70 + 110 * rnd()) * s * fl.strength, (0.6 + rnd()) * s, 1.6, 1);
        if (rnd() < 0.7) spawnMist(x0 + rnd() * fl.w, sy - 2 * s, (3 + rnd() * 5) * s);
        if (rnd() < 0.5) spawnBubble(p, x0 + rnd() * fl.w, sy + (3 + rnd() * 14) * s, (0.7 + rnd()) * s);
      }
    }

    /* ---------- particles step ---------- */
    function particlesStep(dt) {
      var s = sc(), G = 900 * s * P.gravity;
      for (var i = 0; i < DROPS.length; i++) {
        var o = DROPS[i]; if (!o.on) continue;
        o.life += dt; o.vy += G * dt; o.vx *= 1 - 0.4 * dt; o.x += o.vx * dt; o.y += o.vy * dt;
        var p = poolAt(o.x, null);
        if (p && o.vy > 0 && o.y > surf(p, o.x) && floorAt(p, o.x) > surf(p, o.x) + 0.5) {
          // back into the water: a tiny ring of foam and a small push; the first generation may throw one small bounce
          o.on = false; S.dropsBack++;
          push(p, o.x - 2 * s, o.x + 2 * s, Math.min(o.vy, 400 * s) * 0.04 * (o.r / s));
          addFoam(p, o.x - 1.5 * s, o.x + 1.5 * s, 0.05);
          if (o.gen === 0 && o.r > 1.6 * s && o.vy > 180 * s && rnd() < 0.35) spawnDrop(p, o.x, surf(p, o.x) - 1 * s, (rnd() - 0.5) * 30 * s, -o.vy * 0.28, o.r * 0.5, 1, 2);
          continue;
        }
        if (!p && O.solid && safeSolid(o.x, o.y)) { o.on = false; continue; }
        if (o.life > o.max || (!p && o.life > 0.9)) o.on = false;
      }
      for (var b = 0; b < BUBS.length; b++) {
        var u = BUBS[b]; if (!u.on) continue;
        u.life += dt; u.y += u.vy * dt; u.x = u.x0 + Math.sin(u.life * 9 + u.ph) * 1.2 * s;
        var pb = u.pool, sb = surf(pb, u.x);
        if (u.y - u.r <= sb + 0.5 * s || u.life > 4) { u.on = false; if (u.life <= 4) addFoam(pb, u.x - s, u.x + s, 0.08); }
      }
      for (var m = 0; m < MIST.length; m++) { var q = MIST[m]; if (!q.on) continue; q.life += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.r += 6 * s * dt; if (q.life > q.max) q.on = false; }
      for (var h = 0; h < SHEETS.length; h++) { var e = SHEETS[h]; if (!e.on) continue; e.t += dt; if (e.t > e.dur) e.on = false; }
      for (var r2 = 0; r2 < RINGS.length; r2++) { var g = RINGS[r2]; if (!g.on) continue; g.t += dt; if (g.t > g.dur) g.on = false; }
      for (var pi = 0; pi < POOLS.length; pi++) {   // foam spreads a little and fades
        var pp = POOLS[pi], fo = pp.foam, keep = Math.pow(0.28, dt);
        for (var c = 0; c < pp.n; c++) fo[c] *= keep;
        for (var c2 = 1; c2 < pp.n - 1; c2++) fo[c2] = fo[c2] * 0.96 + (fo[c2 - 1] + fo[c2 + 1]) * 0.02;
      }
    }
    function safeSolid(x, y) { try { return !!O.solid(x, y); } catch (e) { S.cbErrors++; return false; } }
    function safeCall(fn) { try { return fn.apply(null, Array.prototype.slice.call(arguments, 1)); } catch (e) { S.cbErrors++; return null; } }

    /* ---------- update ---------- */
    function update(dtMs) {
      try {
        dtMs = +dtMs;
        if (!(dtMs > 0)) { S.frozen++; return; }
        if (dtMs > 250) dtMs = 250;
        S.updates++;
        var dts = dtMs / 1000;
        bodiesStep(dts);
        S.accUs += Math.round(dtMs * 1000);
        while (S.accUs >= SUB_US) {
          S.accUs -= SUB_US; S.substeps++;
          for (var f = 0; f < FLOAT.length; f++) floaterStep(FLOAT[f], SUB);
          if (FLOAT.length > 1) separate();
          for (var w = 0; w < FALLS.length; w++) fallStep(FALLS[w], SUB);
          for (var i = 0; i < POOLS.length; i++) { if (P.ambient > 0) breeze(POOLS[i]); springStep(POOLS[i]); }
        }
        particlesStep(dts);
        S.time += dtMs;
      } catch (e) { S.updErrors++; }
    }

    /* ---------- drawing ---------- */
    var SCR = null, SCRG = null;
    function scratch(w, h) {
      if (!SCR || SCR.width < w || SCR.height < h) { SCR = canvasFactory(Math.max(w, SCR ? SCR.width : 0), Math.max(h, SCR ? SCR.height : 0)); SCRG = SCR.getContext('2d'); }
      return SCRG;
    }
    function isPixel(ctx) { return P.render === 'pixel' || (P.render !== 'smooth' && ctx.imageSmoothingEnabled === false); }

    function draw(ctx, camX, camY) {
      try {
        if (!ctx || typeof ctx.fillRect !== 'function' || typeof ctx.save !== 'function') { S.badInput++; return; }
        S.draws++;
        camX = num(camX, 0); camY = num(camY, 0);
        var px = isPixel(ctx);
        ctx.save();
        ctx.translate(-camX, -camY);
        var m = ctx.getTransform ? ctx.getTransform() : null;
        for (var i = 0; i < POOLS.length; i++) {
          var p = POOLS[i];
          if (m && ctx.canvas && !onScreen(m, ctx.canvas, p.x, p.y - P.maxAmp * sc() * 3, p.w, p.h + P.maxAmp * sc() * 3)) continue;
          if (px) drawPoolPixel(ctx, p, m); else drawPoolSmooth(ctx, p, m);
        }
        for (var f = 0; f < FALLS.length; f++) { if (px) drawFallPixel(ctx, FALLS[f]); else drawFallSmooth(ctx, FALLS[f]); }
        drawSheets(ctx, px);
        drawDrops(ctx, px);
        drawMist(ctx, px);
        ctx.restore();
      } catch (e) { S.drawErrors++; try { ctx.restore(); } catch (e2) { } }
    }
    function onScreen(m, cv, x, y, w, h) {
      var x0 = m.a * x + m.c * y + m.e, y0 = m.b * x + m.d * y + m.f, x1 = m.a * (x + w) + m.c * (y + h) + m.e, y1 = m.b * (x + w) + m.d * (y + h) + m.f;
      return Math.max(x0, x1) >= 0 && Math.min(x0, x1) <= cv.width && Math.max(y0, y1) >= 0 && Math.min(y0, y1) <= cv.height;
    }
    function poolPal(p) { return (p.palette && PALETTES[p.palette]) || pal(); }

    // reflection: the picture just above the rest line, flipped, wobbling, fading with depth (copied in device px)
    function drawReflection(ctx, p, m, rows, pixel) {
      if (!(P.reflect > 0) || !m || !ctx.canvas || typeof ctx.drawImage !== 'function' || Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6) return;
      var cv = ctx.canvas, s = sc(), R = Math.min(p.h, rows);
      var dx0 = Math.round(m.a * p.x + m.e), dx1 = Math.round(m.a * (p.x + p.w) + m.e);
      var restD = m.d * p.y + m.f, rD = Math.max(1, Math.round(R * m.d));
      var sy0 = Math.round(restD - rD), sx0 = Math.max(0, dx0), sx1 = Math.min(cv.width, dx1), syc = Math.max(0, sy0), sy1 = Math.min(cv.height, Math.round(restD));
      if (sx1 - sx0 < 2 || sy1 - syc < 2) return;
      var g = scratch(sx1 - sx0, sy1 - syc);
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, sx1 - sx0, sy1 - syc);
      g.drawImage(cv, sx0, syc, sx1 - sx0, sy1 - syc, 0, 0, sx1 - sx0, sy1 - syc);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      var strip = pixel ? 1 : Math.max(1, Math.round(m.d * s * 1.5)), t = S.time / 1000;
      var restI = Math.round(restD);
      for (var j = 0; j < rD; j += strip) {
        var srcY = restI - 1 - j - syc - (strip - 1);   // mirrored row in the scratch copy
        if (srcY < 0 || srcY >= sy1 - syc) continue;
        var f = j / rD, a = P.reflect * Math.pow(1 - f, 1.6);
        if (a < 0.01) break;
        var wob = Math.sin(j / (m.d * s) * 0.42 + t * 2.3) * (0.6 + 2.2 * f) * s * m.a;
        if (pixel) wob = Math.round(wob);
        ctx.globalAlpha = a;
        ctx.save(); ctx.translate(sx0 + wob, restI + j + strip); ctx.scale(1, -1);
        ctx.drawImage(SCR, 0, srcY, sx1 - sx0, strip, 0, 0, sx1 - sx0, strip);
        ctx.restore();
      }
      ctx.restore();
    }

    function surfacePath(ctx, p, bottom) {
      var d = p.d, n = p.n, x0 = p.x, sp = p.sp, y = p.y;
      ctx.beginPath();
      ctx.moveTo(x0, y + d[0]);
      for (var i = 1; i < n - 1; i++) { var xm = x0 + (i + 0.5) * sp, ym = y + (d[i] + d[i + 1]) / 2; ctx.quadraticCurveTo(x0 + i * sp, y + d[i], xm, ym); }
      ctx.lineTo(x0 + (n - 1) * sp, y + d[n - 1]);
      if (bottom != null) {
        if (p.floor) { for (var j = n - 1; j >= 0; j--) { var xf = Math.min(x0 + j * sp, x0 + p.w); ctx.lineTo(xf, floorAt(p, xf) + 0.5); } }
        else { ctx.lineTo(x0 + p.w, bottom); ctx.lineTo(x0, bottom); }
        ctx.closePath();
      }
    }

    function drawPoolSmooth(ctx, p, m) {
      var s = sc(), C = poolPal(p), bottom = p.y + p.h, t = S.time / 1000;
      var topY = p.y - P.maxAmp * s;
      ctx.save();
      surfacePath(ctx, p, bottom);
      ctx.clip();
      // body: translucent near the top (what is under the water still reads), dense toward the bottom
      var g = ctx.createLinearGradient(0, topY, 0, bottom);
      g.addColorStop(0, rgba(C.top, P.clarity));
      g.addColorStop(Math.min(0.9, (P.maxAmp * s + 10 * s) / (bottom - topY)), rgba(C.top, P.clarity + 0.06));
      g.addColorStop(Math.min(0.95, (P.maxAmp * s + 46 * s) / (bottom - topY)), rgba(C.mid, (P.clarity + P.depthAlpha) / 2));
      g.addColorStop(1, rgba(C.deep, P.depthAlpha));
      ctx.fillStyle = g; ctx.fillRect(p.x - 2, topY - 2, p.w + 4, bottom - topY + 4);
      drawReflection(ctx, p, m, 54 * s, false);
      // light shafts: slanted soft bands that sway
      if (P.shafts > 0) {
        var nsh = Math.max(2, Math.round(p.w / (90 * s)));
        for (var k = 0; k < nsh; k++) {
          var bx = p.x + (k + 0.5) / nsh * p.w + Math.sin(t * 0.37 + k * 1.9) * 14 * s, bw = (10 + 12 * hsh(k, 7)) * s, len = Math.min(p.h, (70 + 50 * hsh(k, 3)) * s);
          var a = (0.07 + 0.05 * Math.sin(t * 0.8 + k * 2.3)) * P.shafts;
          var sg = ctx.createLinearGradient(0, p.y, 0, p.y + len);
          sg.addColorStop(0, rgba(C.line, a)); sg.addColorStop(1, rgba(C.line, 0));
          ctx.fillStyle = sg; ctx.beginPath();
          ctx.moveTo(bx, p.y - 4 * s); ctx.lineTo(bx + bw, p.y - 4 * s); ctx.lineTo(bx + bw + len * 0.32, p.y + len); ctx.lineTo(bx + len * 0.32 - bw * 0.6, p.y + len); ctx.closePath(); ctx.fill();
        }
      }
      // bubbles (inside the water)
      for (var b = 0; b < BUBS.length; b++) {
        var u = BUBS[b]; if (!u.on || u.pool !== p) continue;
        ctx.globalAlpha = 0.75; ctx.strokeStyle = rgba(C.line, 0.85); ctx.lineWidth = Math.max(0.6, 0.45 * s);
        ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = rgba(C.line, 0.18); ctx.fill();
        ctx.fillStyle = rgba([255, 255, 255], 0.9); ctx.beginPath(); ctx.arc(u.x - u.r * 0.35, u.y - u.r * 0.35, Math.max(0.35, u.r * 0.28), 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // the lit band just under the surface (the water's top seen at a grazing angle)
      ctx.translate(0, 2.2 * s);
      surfacePath(ctx, p, null);
      ctx.strokeStyle = rgba(C.band, 0.5); ctx.lineWidth = 4.4 * s; ctx.stroke();
      ctx.translate(0, -2.2 * s);
      ctx.restore();
      // the surface line: bright, thin, with glints on the steep slopes of the waves
      surfacePath(ctx, p, null);
      ctx.strokeStyle = rgba(C.line, 0.95); ctx.lineWidth = Math.max(1, 1.35 * s); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
      ctx.fillStyle = rgba([255, 255, 255], 0.9);
      for (var i = 2; i < p.n - 2; i += 2) {
        var sl = (p.d[i + 1] - p.d[i - 1]) / (2 * p.sp), gl = hsh(i, Math.floor(t * 3 + i * 0.13));
        if (Math.abs(sl) > 0.12 || gl > 0.93) { var gx = p.x + i * p.sp, gy = p.y + p.d[i]; ctx.fillRect(gx - 1.6 * s, gy - 0.55 * s, 3.2 * s * (0.6 + gl * 0.6), Math.max(0.8, 0.9 * s)); }
      }
      // foam: broken white flecks riding the surface
      for (var c = 0; c < p.n; c++) {
        var fo = p.foam[c]; if (fo < 0.04) continue;
        var fx = p.x + c * p.sp + (hsh(c, 11) - 0.5) * p.sp, fy = p.y + p.d[c];
        var fa = Math.min(0.9, fo * P.foam);
        ctx.fillStyle = rgba(C.foam, fa);
        var rw = (1.2 + 2.4 * hsh(c, 5)) * s * (0.6 + Math.min(fo, 1)), rh = (0.8 + 0.9 * hsh(c, 9)) * s;
        ctx.beginPath(); ctx.ellipse(fx, fy - 0.2 * s, rw, rh, 0, 0, 6.2832); ctx.fill();
        if (fo > 0.35 && hsh(c, 13) > 0.5) { ctx.beginPath(); ctx.ellipse(fx + p.sp * 0.5, fy + 2.4 * s, rw * 0.5, rh * 0.6, 0, 0, 6.2832); ctx.fillStyle = rgba(C.foam, fa * 0.6); ctx.fill(); }
      }
      // expanding foam rings where something went in
      for (var r = 0; r < RINGS.length; r++) {
        var q = RINGS[r]; if (!q.on || q.pool !== p) continue;
        var k2 = q.t / q.dur, half = q.w / 2 + k2 * 26 * s, ry = surf(p, q.x);
        ctx.strokeStyle = rgba(C.foam, 0.55 * (1 - k2)); ctx.lineWidth = Math.max(0.8, 1.1 * s);
        ctx.beginPath(); ctx.ellipse(q.x, ry + 0.6 * s, half, 1.6 * s + k2 * 1.2 * s, 0, 0, 6.2832); ctx.stroke();
      }
    }

    // pixel render: one world px = one native px; banded colours, a 1 px highlight, dithered steps, flecks of foam
    var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    function drawPoolPixel(ctx, p, m) {
      var s = sc(), C = poolPal(p), t = S.time / 1000, x0 = Math.floor(p.x), x1 = Math.ceil(p.x + p.w);
      var cTop = rgba(C.top, P.clarity), cBand = rgba(C.band, Math.min(1, P.clarity + 0.22)), cMid = rgba(C.mid, (P.clarity + P.depthAlpha) / 2 + 0.04), cDeep = rgba(C.deep, P.depthAlpha);
      var bandA = 2, midY = Math.round(p.y + Math.max(4, 7 * s / 0.5 * 0.5) + 4), deepY = Math.round(p.y + Math.max(10, p.h * 0.55));
      var SY = surfRow(p, x0, x1), BT = floorRow(p, x0, x1);
      for (var x = x0; x < x1; x++) {
        var sy = SY[x - x0], bottom = BT[x - x0]; if (sy >= bottom) continue;
        var y = sy + 1;
        ctx.fillStyle = cBand; ctx.fillRect(x, y, 1, Math.min(bandA, bottom - y));
        y += bandA;
        var mY = Math.max(y, midY + ((x >> 1) & 1));
        if (mY > y) { ctx.fillStyle = cTop; ctx.fillRect(x, y, 1, Math.min(mY, bottom) - y); }
        var dY = Math.max(mY, deepY + ((x >> 2) & 1));
        if (dY > mY && mY < bottom) { ctx.fillStyle = cMid; ctx.fillRect(x, mY, 1, Math.min(dY, bottom) - mY); }
        if (dY < bottom) { ctx.fillStyle = cDeep; ctx.fillRect(x, dY, 1, bottom - dY); }
      }
      // reflection over the band (pixel-exact rows)
      ctx.save(); ctx.beginPath();
      for (var xr = x0; xr < x1; xr++) if (BT[xr - x0] > SY[xr - x0] + 1) ctx.rect(xr, SY[xr - x0] + 1, 1, BT[xr - x0] - SY[xr - x0] - 1);
      ctx.clip();
      drawReflection(ctx, p, m, Math.round(26 * s / 0.5 * 0.5) + 6, true);
      // bubbles: 1 px dots, rings of 4 px for big ones
      for (var b = 0; b < BUBS.length; b++) {
        var u = BUBS[b]; if (!u.on || u.pool !== p) continue;
        var bx = Math.round(u.x), by = Math.round(u.y);
        ctx.fillStyle = rgba(C.line, 0.85);
        if (u.r > 1.4 * s) { ctx.fillRect(bx - 1, by, 1, 1); ctx.fillRect(bx + 1, by, 1, 1); ctx.fillRect(bx, by - 1, 1, 1); ctx.fillRect(bx, by + 1, 1, 1); ctx.fillStyle = '#ffffff'; ctx.fillRect(bx - 1, by - 1, 1, 1); }
        else ctx.fillRect(bx, by, 1, 1);
      }
      ctx.restore();
      // surface highlight (1 px) and glints
      ctx.fillStyle = rgba(C.line, 0.95);
      for (var xh = x0; xh < x1; xh++) if (BT[xh - x0] > SY[xh - x0]) ctx.fillRect(xh, SY[xh - x0], 1, 1);
      ctx.fillStyle = '#ffffff';
      for (var xg = x0 + 1; xg < x1 - 1; xg++) {
        var dd = SY[xg - x0 + 1] - SY[xg - x0 - 1], gl = hsh(xg, Math.floor(t * 3 + xg * 0.07));
        if ((dd !== 0 || gl > 0.96) && BT[xg - x0] > SY[xg - x0]) ctx.fillRect(xg, SY[xg - x0], 1, 1);
      }
      // foam flecks above the line where it is strong, dithered by strength
      for (var xf = x0; xf < x1; xf++) {
        var fo = foamAt(p, xf + 0.5) * P.foam; if (fo < 0.08 || BT[xf - x0] <= SY[xf - x0]) continue;
        var th = BAYER[(xf & 3) + ((Math.floor(t * 8) & 3) << 2)] / 16, sy2 = SY[xf - x0];
        if (fo > th) { ctx.fillStyle = rgba(C.foam, 1); ctx.fillRect(xf, sy2 - 1, 1, 1); }
        if (fo > 0.45 + th * 0.5) { ctx.fillStyle = rgba(C.foam, 0.9); ctx.fillRect(xf, sy2 + 1, 1, 1); }
        if (fo > 0.8 && ((xf + Math.floor(t * 6)) & 3) === 0) { ctx.fillStyle = rgba(C.foam, 1); ctx.fillRect(xf, sy2 - 2, 1, 1); }
      }
    }
    var ROW = null, FROW = null;
    function floorRow(p, x0, x1) {
      var n = x1 - x0; if (!FROW || FROW.length < n) FROW = new Int32Array(Math.max(n, 64));
      for (var x = x0; x < x1; x++) FROW[x - x0] = Math.round(floorAt(p, x + 0.5));
      return FROW;
    }
    function surfRow(p, x0, x1) {
      var n = x1 - x0; if (!ROW || ROW.length < n) ROW = new Int32Array(Math.max(n, 64));
      for (var x = x0; x < x1; x++) ROW[x - x0] = Math.round(surf(p, x + 0.5));
      return ROW;
    }
    function foamAt(p, x) { var f = (x - p.x) / p.sp, i = clamp(Math.round(f), 0, p.n - 1); return p.foam[i]; }

    function drawSheets(ctx, pixel) {
      for (var i = 0; i < SHEETS.length; i++) {
        var o = SHEETS[i]; if (!o.on) continue;
        var p = o.pool, C = poolPal(p), k = o.t / o.dur, s = sc();
        var rise = Math.sin(Math.min(1, k * 1.25) * Math.PI) , hh = o.h * Math.pow(Math.max(0, rise), 0.8), sy = surf(p, o.x);
        if (hh < 0.5) continue;
        var spread = o.w * (0.5 + 0.55 * k), a = 0.92 * (1 - k * 0.7);
        if (pixel) {
          // pixel: two thin sheets that lean outward and curl over as they fall, breaking up into flecks at the end
          var kk = Math.min(1, k * 1.35), x0 = Math.round(o.x - spread - 2), x1 = Math.round(o.x + spread + 2), cSheet = rgba(C.band, a * 0.85), cTip = rgba(C.foam, a);
          for (var x = x0; x <= x1; x++) {
            var u = (x - o.x) / spread, au = Math.abs(u), sg = u < 0 ? -1 : 1, prof;
            if (o.jet) prof = Math.max(0, 1 - au * 2.2);
            else prof = au < 0.5 ? 0 : Math.max(0, 1 - Math.pow((au - 0.8) / 0.32, 2));
            var hp = Math.round(hh * prof * (1 - 0.45 * kk)); if (hp < 1) continue;
            var base = Math.round(sy), lean = (o.jet ? 0 : 0.35 + 0.9 * kk) * hp;
            for (var r = 0; r < hp; r++) {
              var f2 = (r + 1) / hp, xx = x + sg * Math.round(lean * f2 * f2), yy = base - 1 - r;
              if (kk > 0.6 && r > hp * 0.5 && ((xx * 7 + yy * 3) & 3) < Math.round((kk - 0.6) * 10)) continue;   // breaking up
              ctx.fillStyle = r === hp - 1 ? cTip : cSheet; ctx.fillRect(xx, yy, 1, 1);
            }
          }
          continue;
        }
        // HD: two curved translucent sheets (the crown) and, early on, a thin central column
        for (var side = -1; side <= 1; side += 2) {
          if (o.jet && side > 0) break;
          var base0 = o.jet ? o.x - spread * 0.35 : o.x + side * o.w * 0.18, base1 = o.jet ? o.x + spread * 0.35 : o.x + side * (o.w * 0.55 + 4 * s);
          var tipX = o.jet ? o.x : o.x + side * (spread * 0.95), tipY = sy - hh;
          var gr = ctx.createLinearGradient(0, tipY, 0, sy);
          gr.addColorStop(0, rgba(C.foam, a)); gr.addColorStop(0.45, rgba(C.band, a * 0.75)); gr.addColorStop(1, rgba(C.top, a * 0.25));
          ctx.fillStyle = gr; ctx.beginPath();
          ctx.moveTo(base0, sy + 1 * s);
          ctx.quadraticCurveTo(base0 + (tipX - base0) * 0.2, sy - hh * 0.7, tipX, tipY);
          ctx.quadraticCurveTo(base1 + (tipX - base1) * 0.6, sy - hh * 0.35, base1, sy + 1 * s);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = rgba([255, 255, 255], a * 0.8); ctx.lineWidth = Math.max(0.7, 0.8 * s);
          ctx.beginPath(); ctx.moveTo(base0 + (tipX - base0) * 0.35, sy - hh * 0.55); ctx.quadraticCurveTo(base0 + (tipX - base0) * 0.7, sy - hh * 0.9, tipX, tipY); ctx.stroke();
        }
        if (!o.jet && k < 0.5) {   // the boil in the middle: a low dome of churned water, not a column
          var bw = o.w * 0.36, bh = Math.min(hh * 0.18, 7 * s) * (1 - k / 0.5);
          var cg = ctx.createLinearGradient(0, sy - bh, 0, sy + 1 * s);
          cg.addColorStop(0, rgba(C.foam, 0.7 * (1 - k))); cg.addColorStop(1, rgba(C.band, 0));
          ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(o.x - bw, sy + 1 * s); ctx.quadraticCurveTo(o.x, sy - bh * 2, o.x + bw, sy + 1 * s); ctx.closePath(); ctx.fill();
        }
      }
    }
    function drawDrops(ctx, pixel) {
      var C = pal(), s = sc();
      for (var i = 0; i < DROPS.length; i++) {
        var o = DROPS[i]; if (!o.on) continue;
        var Cp = o.pool ? poolPal(o.pool) : C;
        var fade = o.pool ? 1 : Math.max(0, 1 - o.life / 0.9);
        if (pixel) {
          var x = Math.round(o.x), y = Math.round(o.y);
          if (o.r > 1.5 * s) { ctx.fillStyle = rgba(Cp.drop, 0.95 * fade); ctx.fillRect(x, y, 2, 2); ctx.fillStyle = 'rgba(255,255,255,' + (0.95 * fade).toFixed(2) + ')'; ctx.fillRect(x, y, 1, 1); }
          else { ctx.fillStyle = rgba(o.r > 1.0 * s ? [255, 255, 255] : Cp.drop, 0.95 * fade); ctx.fillRect(x, y, 1, 1 + (Math.abs(o.vy) > 160 * s ? 1 : 0)); }
          continue;
        }
        var sp = Math.sqrt(o.vx * o.vx + o.vy * o.vy), len = o.r + Math.min(sp * 0.012, 5 * s), ang = Math.atan2(o.vy, o.vx);
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(ang);
        ctx.fillStyle = rgba(Cp.drop, 0.9 * fade);
        ctx.beginPath(); ctx.ellipse(-len * 0.35, 0, len, o.r, 0, 0, 6.2832); ctx.fill();
        ctx.fillStyle = rgba([255, 255, 255], 0.95 * fade);
        ctx.beginPath(); ctx.ellipse(0, -o.r * 0.25, Math.max(0.4, o.r * 0.5), Math.max(0.3, o.r * 0.35), 0, 0, 6.2832); ctx.fill();
        ctx.restore();
      }
    }
    function drawMist(ctx, pixel) {
      var C = pal();
      for (var i = 0; i < MIST.length; i++) {
        var o = MIST[i]; if (!o.on) continue;
        var k = o.life / o.max, a = 0.28 * Math.sin(k * Math.PI);
        if (pixel) { if (((Math.round(o.x) + Math.round(o.y)) & 1) === 0) { ctx.fillStyle = rgba(C.foam, a * 2); ctx.fillRect(Math.round(o.x), Math.round(o.y), 1, 1); } continue; }
        var g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
        g.addColorStop(0, rgba(C.foam, a)); g.addColorStop(1, rgba(C.foam, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 6.2832); ctx.fill();
      }
    }
    function drawFallSmooth(ctx, fl) {
      var p = fl.pool, C = poolPal(p), s = sc(), t = S.time / 1000, sy = surf(p, fl.x + fl.w / 2) + 2 * s, top = fl.top, H = sy - top;
      if (H <= 1) return;
      var g = ctx.createLinearGradient(fl.x, 0, fl.x + fl.w, 0);
      g.addColorStop(0, rgba(C.mid, 0.55)); g.addColorStop(0.25, rgba(C.band, 0.82)); g.addColorStop(0.6, rgba(C.top, 0.8)); g.addColorStop(1, rgba(C.mid, 0.6));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(fl.x, top);
      ctx.lineTo(fl.x + fl.w, top);
      ctx.quadraticCurveTo(fl.x + fl.w + 1.5 * s, top + H * 0.6, fl.x + fl.w + 2.5 * s, sy);
      ctx.lineTo(fl.x - 2.5 * s, sy);
      ctx.quadraticCurveTo(fl.x - 1.5 * s, top + H * 0.6, fl.x, top);
      ctx.closePath(); ctx.fill();
      // falling streaks
      var ns = Math.max(3, Math.round(fl.w / (3 * s)));
      ctx.lineCap = 'round';
      for (var k = 0; k < ns; k++) {
        var x = fl.x + (k + 0.5) / ns * fl.w, spd = (160 + 80 * hsh(k, 21)) * s, segL = (10 + 16 * hsh(k, 4)) * s, gap = segL * (1.4 + hsh(k, 8));
        var off = (t * spd + hsh(k, 2) * 200 * s) % (segL + gap);
        ctx.strokeStyle = rgba(hsh(k, 6) > 0.5 ? C.foam : C.line, 0.55 + 0.3 * hsh(k, 10)); ctx.lineWidth = Math.max(0.8, (0.8 + hsh(k, 12)) * s);
        for (var y = top - (segL + gap) + off; y < sy; y += segL + gap) {
          var y0 = Math.max(top, y), y1 = Math.min(sy, y + segL); if (y1 <= y0) continue;
          ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
        }
      }
      // the lip at the top and the churning foam at the foot
      ctx.fillStyle = rgba(C.foam, 0.85); ctx.beginPath(); ctx.ellipse(fl.x + fl.w / 2, top + 1 * s, fl.w * 0.55, 1.6 * s, 0, 0, 6.2832); ctx.fill();
      for (var f = 0; f < 7; f++) {
        var fx = fl.x + fl.w / 2 + (f - 3) * fl.w * 0.32 + Math.sin(t * 7 + f * 2.1) * 2 * s, fr = (2.6 + 2.2 * Math.abs(Math.sin(t * 5.3 + f * 1.7))) * s;
        ctx.fillStyle = rgba(C.foam, 0.6 + 0.3 * hsh(f, 3)); ctx.beginPath(); ctx.ellipse(fx, sy - 1.2 * s, fr * 1.3, fr * 0.75, 0, 0, 6.2832); ctx.fill();
      }
      ctx.lineCap = 'butt';
    }
    function drawFallPixel(ctx, fl) {
      var p = fl.pool, C = poolPal(p), t = S.time / 1000, x0 = Math.round(fl.x), x1 = Math.round(fl.x + fl.w), top = Math.round(fl.top);
      var sy = Math.round(surf(p, fl.x + fl.w / 2)) + 1;
      var cols = [rgba(C.mid, 0.85), rgba(C.top, 0.9), rgba(C.band, 0.95), rgba(C.line, 1)];
      for (var x = x0; x < x1; x++) {
        var edge = x === x0 || x === x1 - 1, spd = 90 + 40 * hsh(x, 1), ph = hsh(x, 2) * 64;
        ctx.fillStyle = edge ? cols[0] : cols[1]; ctx.fillRect(x, top, 1, sy - top);
        if (edge) continue;
        // streaks: lighter runs scrolling down
        var seg = 5 + Math.floor(hsh(x, 3) * 5), per = seg + 4 + Math.floor(hsh(x, 4) * 6), off = Math.floor(t * spd + ph) % per;
        for (var y = top - per + off; y < sy; y += per) {
          var a = Math.max(top, y), b = Math.min(sy, y + seg); if (b <= a) continue;
          ctx.fillStyle = cols[hsh(x, 5) > 0.55 ? 3 : 2]; ctx.fillRect(x, a, 1, b - a);
        }
      }
      ctx.fillStyle = rgba(C.foam, 1); ctx.fillRect(x0, top, x1 - x0, 1);
      // churning foot
      for (var f = -2; f < x1 - x0 + 2; f++) {
        var h = 1 + Math.round(1.5 + 1.5 * Math.sin(t * 9 + f * 1.3));
        ctx.fillStyle = rgba(C.foam, (f + Math.floor(t * 10)) & 1 ? 1 : 0.8); ctx.fillRect(x0 + f, sy - h, 1, h);
      }
    }

    /* ---------- public ---------- */
    function hash() {
      var h = 2166136261 >>> 0;
      function addv(v) { h ^= (Math.round(v * 1000) | 0); h = Math.imul(h, 16777619) >>> 0; }
      for (var i = 0; i < POOLS.length; i++) { var p = POOLS[i]; for (var c = 0; c < p.n; c++) { addv(p.d[c]); addv(p.v[c]); } }
      for (var j = 0; j < DROPS.length; j++) if (DROPS[j].on) { addv(DROPS[j].x); addv(DROPS[j].y); }
      for (var b = 0; b < BUBS.length; b++) if (BUBS[b].on) { addv(BUBS[b].y); }
      for (var f = 0; f < FLOAT.length; f++) { addv(FLOAT[f].x); addv(FLOAT[f].y); addv(FLOAT[f].angle); }
      return ('00000000' + h.toString(16)).slice(-8);
    }
    function liveCount(arr) { var n = 0; for (var i = 0; i < arr.length; i++) if (arr[i].on) n++; return n; }
    var inst = {
      version: VERSION,
      update: update,
      draw: draw,
      splash: function (x, speed, o) {
        try {
          o = o || {}; var p = poolAt(+x, null); if (!p) { S.badInput++; return null; }
          var s = sc(), w = num(o.w, 16 * s), xx = clamp(+x, p.x, p.x + p.w), v = num(speed, 300 * s);
          var e = doSplash(p, xx, w, v, o.id != null ? o.id : 'manual', o.kind || 'body');
          event('splash', o.id != null ? o.id : 'manual', xx, surf(p, xx), { speed: Math.round(v / s), kind: o.kind || 'body', pool: p.id, manual: true });
          return { x: xx, y: surf(p, xx), energy: e, pool: p.id };
        } catch (e2) { S.updErrors++; return null; }
      },
      addFloater: addFloater,
      bubble: function (x, y, r) { var p = poolAt(+x, +y); if (!p || !(+y > surf(p, +x))) return false; spawnBubble(p, +x, Math.min(+y, floorAt(p, +x) - 1), num(r, 1.2 * sc())); return true; },
      removeFloater: function (id) { for (var i = 0; i < FLOAT.length; i++) if (FLOAT[i].id === String(id)) { FLOAT.splice(i, 1); return true; } return false; },
      floaters: function () { return FLOAT; },
      surfaceY: function (x) { var p = poolAt(+x, null); return p ? surf(p, +x) : null; },
      floorY: function (x) { var p = poolAt(+x, null); return p ? floorAt(p, +x) : null; },
      restY: function (x) { var p = poolAt(+x, null); return p ? p.y : null; },
      depthAt: function (x, y) { var p = poolAt(+x, null); if (!p) return 0; var d = +y - surf(p, +x); return d > 0 && +y <= p.y + p.h ? d : 0; },
      inWater: function (b) {
        if (!b || !fin(+b.x) || !fin(+b.y) || !(+b.w > 0) || !(+b.h > 0)) return 0;
        var p = poolAt(+b.x + b.w / 2, null); if (!p) return 0;
        var sy = surf(p, clamp(+b.x + b.w / 2, p.x, p.x + p.w)); return clamp((+b.y + +b.h - sy) / +b.h, 0, 1);
      },
      poolAt: function (x, y) { var p = poolAt(+x, y == null ? null : +y); return p ? { id: p.id, x: p.x, y: p.y, w: p.w, h: p.h } : null; },
      pools: function () { return POOLS.map(function (p) { return { id: p.id, x: p.x, y: p.y, w: p.w, h: p.h, columns: p.n }; }); },
      clear: function () {
        for (var i = 0; i < POOLS.length; i++) { var p = POOLS[i]; p.d.fill(0); p.v.fill(0); p.foam.fill(0); }
        [DROPS, BUBS, SHEETS, MIST, RINGS].forEach(function (a) { for (var j = 0; j < a.length; j++) a[j].on = false; });
        TRACK = {}; trackKeys = [];
      },
      setParams: function (o) { setParamsInto(o); },
      params: function () { var o = {}; for (var q in P) o[q] = P[q]; return o; },
      energy: function () { var e = 0; for (var i = 0; i < POOLS.length; i++) e += energy(POOLS[i]); return e; },
      maxAmp: function () { var a = 0; for (var i = 0; i < POOLS.length; i++) { var p = POOLS[i]; for (var c = 0; c < p.n; c++) a = Math.max(a, Math.abs(p.d[c])); } return a; },
      stats: function () {
        return { updates: S.updates, frozen: S.frozen, draws: S.draws, splashes: S.splashes, entries: S.entries, exits: S.exits, projectiles: S.projectiles,
          drops: liveCount(DROPS), bubbles: liveCount(BUBS), sheets: liveCount(SHEETS), mist: liveCount(MIST), floaters: FLOAT.length, pools: POOLS.length, falls: FALLS.length,
          dropsSpawned: S.dropsSpawned, dropsBack: S.dropsBack, peakAmp: Math.round(S.peakAmp * 100) / 100, clamps: S.clamps, substeps: S.substeps,
          cbErrors: S.cbErrors, drawErrors: S.drawErrors, updErrors: S.updErrors, badInput: S.badInput, time: Math.round(S.time) };
      },
      hash: hash,
      events: function () { return EVENTS.slice(); },
      tracked: function () { var o = {}; for (var i = 0; i < trackKeys.length; i++) { var t = TRACK[trackKeys[i]]; o[trackKeys[i]] = { wet: t.wet, seen: t.seen }; } return o; },
      _pool: function (i) { return POOLS[i | 0]; }
    };
    return inst;
  }

  var API = { create: create, version: VERSION, palettes: function () { return Object.keys(PALETTES); }, defaults: function () { var o = {}; for (var q in DEF) o[q] = DEF[q]; return o; },
    _canvasFactory: function (f) { if (typeof f === 'function') canvasFactory = f; } };
  root.GameDNA_WaterSurface = API;
})(typeof window !== 'undefined' ? window : this);
