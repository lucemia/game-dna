/* GameDNA_IKCreatures v1.0.0 (E-14 ik-creatures) - procedural many-legged creatures with 2-bone IK.
 * One plain script, no dependencies, no import / export, ASCII only. Global: GameDNA_IKCreatures.
 *
 * The game keeps its own enemies (position, AI, hit boxes). Each fixed step it hands the module a list of
 * {id, kind, x, y, size, target}; the module gives every one a body that rides above its feet, legs that plant on the
 * game's ground with 2-bone IK and step (alternating, never two neighbours at once) when stretched, a body that turns to
 * face its path and a head that turns to the target. It draws them shaded per pixel (lit, rim light, specular, outline)
 * at the canvas' device resolution (HD) or at native resolution with a fixed ramp (pixel).
 *
 *   var bugs = GameDNA_IKCreatures.create({view: 'side' | 'top', ground, walkable, actors, scale, seed, params});
 *   bugs.update(stepMs)                 once per fixed step (0 while the world is stopped)
 *   bugs.draw(ctx, camX, camY)          all creatures, or bugs.drawOne(ctx, id, camX, camY) inside a y-sorted list
 * See README.md for the full API.
 */
(function (root) {
  'use strict';
  var VERSION = '1.2.2';
  var PI = Math.PI, TAU = PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a || 1e-9), 0, 1); return t * t * (3 - 2 * t); }
  function num(v, d) { return v == null || v === '' || !isFinite(+v) ? d : +v; }
  function v3(x, y, z) { return [x, y, z]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function madd(a, b, s) { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }
  function angWrap(a) { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; }
  function hashStr(s) { s = String(s); var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { var a = seed >>> 0 || 1; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hex(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h, 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  var DEFAULTS = {
    stepMs: 150,        // longest swing (slow walk); faster bodies get shorter swings
    stride: 0.30,       // a leg steps when its foot is this far (x body length) from where it wants to be
    lift: 0.16,         // swing arc height (x body length)
    turnRate: 300,      // body turn speed, degrees per second
    headRate: 360,      // head turn speed, degrees per second
    headYaw: 40,        // head turn limit left / right of the body (degrees)
    headPitch: 28,      // head turn limit up / down (degrees)
    ride: 1,            // body height multiplier
    depth: 0.05,        // side view: near legs drawn this much lower per px of depth (0 = flat side view)
    outline: 1,         // outline width multiplier
    rim: 1,             // rim light strength
    gloss: 1,           // specular strength
    dust: 1,            // footfall dust amount (0 = none)
    palette: 'auto',    // auto | forest | ember | cave | frost (or per actor)
    render: 'auto'      // auto (pixel when the context has imageSmoothingEnabled false) | hd | pixel
  };

  /* palettes: per material [outline, dark, mid, light, spec, mark] */
  var PALETTES = {
    forest: { body: ['#140c0a', '#2e1c16', '#5a3a26', '#8c6440', '#f6e2c0', '#d88a2c'], leg: ['#140c0a', '#33201a', '#6a4630', '#a87c52', '#f6e2c0', '#2a1812'],
      shell: ['#2a0c0a', '#6a1e16', '#b8402a', '#e8784a', '#fff0d8', '#f2c27a'], belly: ['#3a2418', '#8a6a4c', '#d8bc90', '#f4e2c0', '#ffffff', '#c09a70'],
      plate: ['#0a1410', '#163028', '#2a5a48', '#4c8a6a', '#e0fff0', '#c8a03a'], pleg: ['#2a1206', '#7a3a10', '#c8701c', '#f0aa48', '#fff0c8', '#7a3a10'],
      eye: ['#000000', '#05060a', '#141820', '#2a3240', '#ffffff', '#ffd27a'], fang: ['#1a1410', '#4a3a2a', '#9a8460', '#d8c8a0', '#ffffff', '#000000'],
      rimc: '#ffd9a0', glow: '#ffcf70', dust: '#b49a78' },
    ember: { body: ['#120808', '#2a1010', '#4e1a16', '#7a2a1e', '#ffd0a0', '#ff6a1a'], leg: ['#120808', '#2a1210', '#4a2018', '#7a3a26', '#ffd0a0', '#1a0806'],
      shell: ['#1a0806', '#4a1208', '#8a2a10', '#d0581c', '#fff0c0', '#ffb040'], belly: ['#2a1610', '#6a4a36', '#b08c6a', '#e0c8a0', '#ffffff', '#a07858'],
      plate: ['#100806', '#2a120c', '#4c2216', '#7a3a22', '#ffe0b0', '#ff8a2a'], pleg: ['#1a0c04', '#5a2a08', '#a85a14', '#e89a36', '#fff0c8', '#5a2a08'],
      eye: ['#000000', '#0a0404', '#1a0808', '#3a1410', '#ffffff', '#ff7a2a'], fang: ['#1a1410', '#4a3a2a', '#9a8460', '#d8c8a0', '#ffffff', '#000000'],
      rimc: '#ff9a50', glow: '#ff8a3a', dust: '#8a6a5a' },
    cave: { body: ['#08080e', '#161628', '#2a2c48', '#46507a', '#d8f4ff', '#3ae0c8'], leg: ['#08080e', '#18182a', '#30344e', '#55607e', '#d8f4ff', '#121222'],
      shell: ['#0c0a14', '#2a1a3a', '#4e2e62', '#7a52a0', '#f4e8ff', '#7ef0e0'], belly: ['#1a1a24', '#4a4a5e', '#8a8aa0', '#c4c4d8', '#ffffff', '#6a6a80'],
      plate: ['#060a10', '#0e1c2a', '#1c3a52', '#2e6080', '#d8f8ff', '#4af0d0'], pleg: ['#0a0a14', '#2a2a48', '#4a5a8a', '#7a9ac4', '#e8f4ff', '#2a2a48'],
      eye: ['#000000', '#020408', '#081018', '#10202c', '#ffffff', '#5af8e0'], fang: ['#14141a', '#3a3a48', '#7a7a90', '#bcbcd0', '#ffffff', '#000000'],
      rimc: '#7ff0ff', glow: '#5af8e0', dust: '#6a6a80' },
    frost: { body: ['#0a1018', '#1c2a3a', '#3a5068', '#6a88a4', '#ffffff', '#bce8ff'], leg: ['#0a1018', '#3a5470', '#6a8aa8', '#a0c0d8', '#ffffff', '#24384c'],
      shell: ['#0c1420', '#24405a', '#4a7aa0', '#8cbcdc', '#ffffff', '#e8f8ff'], belly: ['#2a3440', '#6a7a8a', '#b0c0cc', '#e4eef4', '#ffffff', '#90a0b0'],
      plate: ['#0a1018', '#1a3040', '#2e5a70', '#5a98b0', '#ffffff', '#c8f0ff'], pleg: ['#101820', '#2e4458', '#5a7c96', '#94b8cc', '#ffffff', '#2e4458'],
      eye: ['#000000', '#04080c', '#0c1820', '#1a3040', '#ffffff', '#9af0ff'], fang: ['#1a1e24', '#4a525c', '#9aa4b0', '#d8e0e8', '#ffffff', '#000000'],
      rimc: '#d8f4ff', glow: '#a8f0ff', dust: '#c8d8e4' }
  };
  var PAL_FOR_KIND = { spider: 'forest', crab: 'forest', centipede: 'forest' };

  /* ------------------------------------------------------------------ creature kinds
     Body frame: f = forward, l = lateral (left of the body when looking along f), u = up; lengths x L (body length).
     Legs: hip (on the body), home (where the foot wants to be, ground plane), femur / tibia / tarsus lengths, radii. */
  function spiderLegs() {
    var L = [], hf = [0.10, 0.05, -0.01, -0.07], ff = [0.70, 0.36, -0.10, -0.48], fl = [0.78, 0.95, 0.94, 0.80];
    var fe = [0.56, 0.60, 0.58, 0.62], ti = [0.62, 0.64, 0.62, 0.70];
    for (var s = -1; s <= 1; s += 2) for (var i = 0; i < 4; i++)
      L.push({ side: s, idx: i, hip: [hf[i], s * 0.09, 0.0], home: [ff[i], s * fl[i]], fem: fe[i], tib: ti[i], tar: 0.16, r: [0.050, 0.040, 0.034, 0.022, 0.012], pole: [0, 0.55, 1], mat: 'leg', band: 1 });
    return L;
  }
  function crabLegs() {
    var L = [], hf = [0.14, 0.05, -0.04, -0.13], ff = [0.30, 0.10, -0.12, -0.32], fl = [0.62, 0.80, 0.94, 1.02], hz = [0.02, 0.0, -0.02, -0.04];
    for (var s = -1; s <= 1; s += 2) for (var i = 0; i < 4; i++)
      L.push({ side: s, idx: i, hip: [hf[i], s * 0.34, hz[i]], home: [ff[i], s * fl[i]], fem: 0.46, tib: 0.56, tar: 0.13, r: [0.062, 0.054, 0.046, 0.034, 0.014], pole: [0, 0.65, 1], mat: 'shell', band: 1 });
    return L;
  }
  var KINDS = {
    spider: { ride: 0.36, legs: spiderLegs, gaitSpeed: 1.0, sideways: false },
    crab: { ride: 0.30, legs: crabLegs, gaitSpeed: 1.0, sideways: true },
    centipede: { ride: 0.0, legs: null, gaitSpeed: 1.0, sideways: false, segments: 11 }
  };

  function neighbours(legs, kind) {
    var nb = legs.map(function () { return []; });
    for (var a = 0; a < legs.length; a++) for (var b = 0; b < legs.length; b++) {
      if (a === b) continue;
      var A = legs[a], B = legs[b];
      var n = (A.side === B.side && Math.abs(A.idx - B.idx) === 1) || (A.side !== B.side && A.idx === B.idx);
      if (n) nb[a].push(b);
    }
    return nb;
  }

  /* ------------------------------------------------------------------ module */
  var canvasFactory = null;
  function makeCanvas(w, h) {
    if (canvasFactory) return canvasFactory(w, h);
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }

  function create(O) {
    O = O || {};
    var VIEW = O.view === 'top' ? 'top' : 'side';
    var P = {}; for (var k in DEFAULTS) P[k] = DEFAULTS[k];
    setParams(O.params || {});
    var SEED = num(O.seed, 1) | 0;
    var S = { creatures: 0, updates: 0, frozen: 0, steps: 0, plants: 0, forced: 0, snaps: 0, lands: 0, regrounds: 0, dangling: 0,
      draws: 0, drawn: 0, drawErrors: 0, updErrors: 0, cbErrors: 0, badInput: 0, nonFinite: 0, rasterMs: 0 };
    var C = {}, ORDER = [], EVENTS = [], DUST = [], T = 0, dustRR = 0;
    for (var di = 0; di < 96; di++) DUST.push({ on: false });

    function setParams(o) { for (var k in o) if (k in DEFAULTS) P[k] = typeof DEFAULTS[k] === 'number' ? num(o[k], P[k]) : String(o[k]); }
    function scaleNow() { var s = typeof O.scale === 'function' ? safe(O.scale) : O.scale; return num(s, 1) || 1; }
    function safe(fn, a, b, c) { try { return fn(a, b, c); } catch (e) { S.cbErrors++; return null; } }
    function ev(e) { e.t = Math.round(T); EVENTS.push(e); if (EVENTS.length > 96) EVENTS.shift(); if (O.onEvent) safe(O.onEvent, e); }

    /* ---------- coordinates. internal 3D: x, y (ground plane: side = depth toward the camera), z = up */
    function toInt(wx, wy, dep) { return VIEW === 'side' ? [wx, num(dep, 0), -wy] : [wx, wy, 0]; }
    function toWorld(p) { return VIEW === 'side' ? { x: p[0], y: -p[2] } : { x: p[0], y: p[1] - p[2] }; }
    // ground height (internal z) at ground-plane point x, y, searching from height fromZ down; null = no footing
    function groundZ(x, y, fromZ) {
      if (VIEW === 'side') {
        if (typeof O.ground !== 'function') return 0;
        var g = safe(O.ground, x, -fromZ);
        if (g == null || !isFinite(g)) return null;
        if (typeof O.walkable === 'function' && safe(O.walkable, x, g) === false) return null;
        return -g;
      }
      if (typeof O.walkable === 'function' && safe(O.walkable, x, y) === false) return null;
      if (typeof O.height === 'function') { var h = safe(O.height, x, y); return h == null || !isFinite(h) ? 0 : +h; }
      return 0;
    }
    // continuous "highest ground near x" (cone falloff, so it never jumps when a wall enters the window)
    function groundEnvelope(x, y, z0, r, slope) {
      var best = -Infinity;
      for (var i = -4; i <= 4; i++) {
        var xs = x + r * i / 4, g = groundZ(xs, y, z0);
        if (g === null) continue;
        var v = g - slope * Math.abs(xs - x);
        if (v > best) best = v;
      }
      return best;
    }

    /* ---------- creature lifecycle */
    function make(a) {
      var kind = KINDS[a.kind] ? a.kind : 'spider', K = KINDS[kind];
      if (!isFinite(+a.x) || !isFinite(+a.y)) { S.badInput++; return null; }
      var Lsz = num(a.size, 0) || (kind === 'centipede' ? num(a.w, 24) * 2.4 : num(a.w, 32) * (kind === 'crab' ? 0.72 : 0.62));
      var p = toInt(num(a.x, 0), num(a.y, 0), a.depth);
      var R = rng(hashStr(a.id) ^ (SEED * 2654435761));
      var c = { id: String(a.id), kind: kind, K: K, L: Lsz, anchor: p, prev: p.slice(), vel: [0, 0, 0], speed: 0,
        heading: VIEW === 'side' ? (kind === 'crab' ? PI / 2 : (num(a.facing, 1) < 0 ? PI : 0)) : num(a.heading, 0),
        bodyZ: 0, bodyVz: 0, pitch: 0, roll: 0, headYaw: 0, headPitch: 0, bob: 0, mode: 'walk', modeT: 0, air: false,
        target: null, flash: 0, dying: 0, alive: true, seen: true, idle: 0, legs: [], nb: [], segs: null, trail: null,
        pal: a.palette || null, vari: R(), breathe: R() * TAU, pinch: 0, pinchT: R() * 3000, born: T, gone: false };
      if (kind === 'centipede') initCentipede(c, R);
      else {
        var defs = K.legs();
        c.legs = defs.map(function (d) {
          var j = 1 + (R() - 0.5) * 0.06;
          return { d: d, fem: d.fem * j, tib: d.tib * j, tar: d.tar, foot: null, planted: false, sw: null, lastPlant: -9999, knee: null, ankle: null, hip: null, stretch: 1 };
        });
        c.nb = neighbours(c.legs.map(function (l) { return l.d; }), kind);
      }
      setGroups(c);
      placeBody(c, true);
      plantAll(c);
      S.creatures++;
      ev({ ev: 'spawn', id: c.id, kind: kind });
      return c;
    }
    function setGroups(c) { c.legs.forEach(function (l) { l.d = Object.assign({}, l.d, { grp: ((c.segs ? l.d.seg : l.d.idx) + (l.d.side > 0 ? 1 : 0)) % 2 }); }); }
    function initCentipede(c, R) {
      var n = c.K.segments, L = c.L;
      c.segN = n; c.sp = L / (n + 0.6); c.w = Math.max(3, L * 0.105);
      c.trail = []; c.segs = [];
      var f = [Math.cos(c.heading), Math.sin(c.heading), 0];
      for (var i = 0; i <= n * 3; i++) c.trail.push(madd(c.anchor, f, -i * c.sp / 3));
      for (var s = 0; s < n; s++) c.segs.push({ p: c.anchor.slice(), f: f.slice(), z: 0 });
      c.legs = [];
      var defs = [];
      for (var k = 1; k < n - 1; k++) for (var sd = -1; sd <= 1; sd += 2)
        defs.push({ side: sd, idx: k, seg: k, hip: [0, sd * 0.5, 0], home: [0.25, sd * 1.45], fem: 0.72, tib: 0.92, tar: 0.24, r: [0.085, 0.07, 0.062, 0.042, 0.012], pole: [0, 1, 0.2], mat: 'pleg', band: 0 });
      c.legs = defs.map(function (d) { return { d: d, fem: d.fem, tib: d.tib, tar: d.tar, foot: null, planted: false, sw: null, lastPlant: -9999, knee: null, ankle: null, hip: null, stretch: 1 }; });
      c.nb = neighbours(defs, 'centipede');
    }

    /* ---------- body frame */
    function frame(c) {
      var th = c.heading, ph = c.pitch, ro = c.roll;
      var f0 = [Math.cos(th), Math.sin(th), 0], l0 = [-Math.sin(th), Math.cos(th), 0], u0 = [0, 0, 1];
      var f = add(mul(f0, Math.cos(ph)), mul(u0, Math.sin(ph))), u = sub(mul(u0, Math.cos(ph)), mul(f0, Math.sin(ph)));
      var l = add(mul(l0, Math.cos(ro)), mul(u, Math.sin(ro))); u = sub(mul(u, Math.cos(ro)), mul(l0, Math.sin(ro)));
      return { f0: f0, l0: l0, f: f, l: l, u: u };
    }
    function bodyCentre(c) { return [c.anchor[0], c.anchor[1], c.bodyZ]; }
    function local(c, F, q) { var B = bodyCentre(c), L = c.L; return add(B, add(add(mul(F.f, q[0] * L), mul(F.l, q[1] * L)), mul(F.u, q[2] * L))); }

    // where a leg's foot wants to be (ground-plane point + ground z), or null
    function legTarget(c, leg, lead) {
      var d = leg.d, L = c.L, base, f0, l0;
      if (c.segs) { var sg = c.segs[d.seg]; base = sg.p; f0 = sg.f; l0 = [-f0[1], f0[0], 0]; L = c.w; }
      else {
        // turning: aim where the body will face when the foot lands (heading + turn speed x lead time)
        var th = c.heading + (lead[3] || 0) * (c.omega || 0);
        base = c.anchor; f0 = [Math.cos(th), Math.sin(th), 0]; l0 = [-Math.sin(th), Math.cos(th), 0];
      }
      var hx = base[0] + f0[0] * d.home[0] * L + l0[0] * d.home[1] * L + lead[0];
      var hy = base[1] + f0[1] * d.home[0] * L + l0[1] * d.home[1] * L + lead[1];
      var reach = (leg.fem + leg.tib) * L * 0.92, hip = leg.hip || [base[0], base[1], c.bodyZ];
      // search toward the body for footing within reach (pits, walls, water)
      for (var k = 0; k <= 6; k++) {
        var t = k / 7, x = lerp(hx, base[0], t), y = lerp(hy, base[1], t);
        var g = groundZ(x, y, hip[2] + L * 0.35);
        if (g === null) continue;
        var dz = hip[2] - g, dh = Math.hypot(x - hip[0], y - hip[1]);
        if (dz < -reach * 0.45 || Math.hypot(dh, dz) > reach + leg.tar * L || dh < reach * 0.22) continue;   // never fold a leg under the body
        return [x, y, g];
      }
      return null;
    }

    function plantAll(c) {
      updateHips(c);
      for (var i = 0; i < c.legs.length; i++) {
        var leg = c.legs[i], t = legTarget(c, leg, [0, 0, 0]);
        leg.sw = null;
        if (t) { leg.foot = t; leg.planted = true; leg.lastPlant = T; }
        else { leg.foot = dangle(c, leg); leg.planted = false; }
        solveLeg(c, leg);
      }
    }

    function placeBody(c, snap) {
      var L = c.L, K = c.K;
      if (c.segs) { placeCentipede(c, snap); return; }
      var a = c.anchor, gz = groundZ(a[0], a[1], a[2] + L * 0.3);
      c.air = VIEW === 'side' && (gz === null || a[2] - gz > Math.max(4, L * 0.22));
      var ride = K.ride * L * P.ride * (1 - 0.4 * (c.crouch || 0));
      var want;
      if (c.air) want = a[2] + ride;
      else {
        var sum = 0, n = 0;
        for (var i = 0; i < c.legs.length; i++) { var lg = c.legs[i]; if (lg.planted && lg.foot) { sum += lg.foot[2]; n++; } }
        var base = n ? 0.5 * a[2] + 0.5 * (sum / n) : a[2];
        if (VIEW === 'top') base = n ? 0.3 * a[2] + 0.7 * (sum / n) : a[2];
        var env = groundEnvelope(a[0], a[1], a[2] + L * 0.3, L * 0.45, 1.0);
        want = Math.max(base + ride - c.bob, (isFinite(env) ? env : base) + ride * 0.62);
        if (c.dying) want = lerp(want, (isFinite(env) ? env : base) + L * 0.12, sstep(0, 500, c.dying));
      }
      if (snap) { c.bodyZ = want; c.bodyVz = 0; return; }
      // critically damped follow (no one-frame jumps)
      var w = 22, dt = 1 / 60, x = c.bodyZ - want;
      var acc = -w * w * x - 2 * w * c.bodyVz;
      c.bodyVz += acc * dt; c.bodyZ += c.bodyVz * dt;
      var minZ = want - ride * 0.25; if (!c.air && c.bodyZ < minZ) { c.bodyZ = minZ; if (c.bodyVz < 0) c.bodyVz = 0; }
    }
    function placeCentipede(c, snap) {
      var tr = c.trail, sp = c.sp, w = c.w, ride = w * 0.42 * P.ride;
      // head = anchor; trail = polyline of past head positions; segment i at arc length i * sp
      // top view: the head steers toward the game's position like a creature, with a bounded turn radius (a reversal
      // becomes a U-turn instead of the head walking back over its own body). Side view: the head is the game's position.
      var hp0 = c.hp ? c.hp.slice() : null;
      if (snap || !c.hp || VIEW === 'side') { c.hp = c.anchor.slice(); c.hh = c.heading; }
      else {
        var dx = c.anchor[0] - c.hp[0], dy = c.anchor[1] - c.hp[1], dd = Math.hypot(dx, dy), dtS = 1 / 60;
        if (dd > w * 0.15) {
          var want = Math.atan2(dy, dx), vmax = Math.max(c.speed * 1.15, w * 2), v = Math.min(vmax, dd * 7);
          var turn = v / (w * 1.3) * dtS, da = angWrap(want - c.hh);
          if (VIEW === 'side' && Math.abs(da) > PI * 0.6) da = (c.uturn || 1) * Math.abs(da); else c.uturn = da >= 0 ? 1 : -1;
          c.hh += clamp(da, -turn, turn);
          if (Math.abs(angWrap(want - c.hh)) < PI * 0.5 || dd > w * 1.5) { c.hp = [c.hp[0] + Math.cos(c.hh) * v * dtS, c.hp[1] + Math.sin(c.hh) * v * dtS, 0]; }
          else c.hp = [c.hp[0] + Math.cos(c.hh) * v * 0.6 * dtS, c.hp[1] + Math.sin(c.hh) * v * 0.6 * dtS, 0];
          if (VIEW === 'side') c.hp[1] = clamp(c.hp[1], c.anchor[1] - w * 2.5, c.anchor[1] + w * 2.5);
        }
      }
      var head = [c.hp[0], c.hp[1], c.anchor[2]];
      c.hspeed = hp0 && !snap ? Math.hypot(c.hp[0] - hp0[0], c.hp[1] - hp0[1]) * 60 : 0;
      if (!tr.length || len(sub(head, tr[0])) > 0.25) tr.unshift(head.slice());
      var maxLen = (c.segN + 2) * sp, acc = 0, cut = tr.length;
      for (var i = 1; i < tr.length; i++) { acc += Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1]); if (acc > maxLen) { cut = i + 1; break; } }
      tr.length = Math.min(tr.length, cut);
      var segs = c.segs, j = 0, dist = 0, prevP = tr[0];
      for (var s = 0; s < c.segN; s++) {
        var want = s * sp, p = null;
        while (j < tr.length - 1) {
          var dl = Math.hypot(tr[j + 1][0] - tr[j][0], tr[j + 1][1] - tr[j][1]);
          if (dist + dl >= want) { var t = (want - dist) / (dl || 1); p = [lerp(tr[j][0], tr[j + 1][0], t), lerp(tr[j][1], tr[j + 1][1], t), 0]; break; }
          dist += dl; j++;
        }
        if (!p) { var last = tr[tr.length - 1], fb = segs[Math.max(0, s - 1)].f; p = madd(last, fb, -(want - dist)); }
        var g = groundEnvelope(p[0], p[1], (VIEW === 'side' ? Math.max(head[2], p[2]) : 0) + c.L * 0.3, w * 0.5, 1.0);
        var gz = isFinite(g) ? g : head[2];
        var zw = gz + ride;
        if (s === 0 && VIEW === 'side') { var ga = groundZ(head[0], 0, head[2] + c.L * 0.2); c.air = ga === null || head[2] - ga > Math.max(4, w); if (c.air) zw = head[2] + ride; }
        var sg = segs[s];
        var pf = s === 0 ? sub(p, segs[1] ? segs[1].p : sub(p, sg.f)) : sub(segs[s - 1].p, p);
        pf[2] = 0; var lf = Math.hypot(pf[0], pf[1]);
        if (lf > 0.01) {
          // segments turn at a bounded rate (a sharp reversal of the head never swings the legs in one frame)
          var fa = Math.atan2(sg.f[1], sg.f[0]), fb = Math.atan2(pf[1], pf[0]), dfa = angWrap(fb - fa), mxf = snap ? 9 : 0.1;
          fa += clamp(dfa, -mxf, mxf); sg.f = [Math.cos(fa), Math.sin(fa), 0];
        }
        sg.p = [p[0], p[1], 0];
        if (snap) sg.z = zw; else { sg.z = sg.z + clamp(zw - sg.z, -w * 0.6, w * 0.6) * 0.5; }
        prevP = p;
      }
      c.bodyZ = segs[0].z;
      // heading of the head segment = its path tangent
      var hf = segs[0].f; c.heading = Math.atan2(hf[1], hf[0]);
    }

    function updateHips(c) {
      if (c.segs) {
        for (var i = 0; i < c.legs.length; i++) {
          var lg = c.legs[i], sg = c.segs[lg.d.seg], l0 = [-sg.f[1], sg.f[0], 0];
          lg.hip = [sg.p[0] + l0[0] * lg.d.hip[1] * c.w, sg.p[1] + l0[1] * lg.d.hip[1] * c.w, sg.z - c.w * 0.12];
        }
        return;
      }
      var F = frame(c);
      for (var j = 0; j < c.legs.length; j++) c.legs[j].hip = local(c, F, c.legs[j].d.hip);
    }

    function dangle(c, leg) {
      var L = c.segs ? c.w : c.L, hip = leg.hip, d = leg.d, F = c.segs ? null : frame(c);
      // hanging legs splay the way they stand (front legs forward, back legs back), not straight down
      var out;
      if (c.segs) { var sg0 = c.segs[d.seg]; out = [-sg0.f[1] * d.side, sg0.f[0] * d.side, 0]; }
      else { var hd = add(mul(F.f0, (d.home[0] >= 0 ? 1 : -1) * (0.55 + Math.abs(d.home[0])) * 1.6), mul(F.l0, d.home[1] * 0.45)); var hl = Math.hypot(hd[0], hd[1]) || 1; out = [hd[0] / hl, hd[1] / hl, 0]; }
      var reach = (leg.fem + leg.tib) * L;
      var q = c.dying ? add(hip, add(mul(out, reach * 0.25), [0, 0, -reach * 0.25])) : add(hip, add(mul(out, reach * 0.6), [0, 0, -reach * 0.3]));   // in the air: legs splayed fore and aft, knees up
      // never below the ground under it
      var g = groundZ(q[0], q[1], hip[2] + L * 0.3);
      if (g !== null && q[2] < g + 0.01) q[2] = g + 0.01;
      return q;
    }

    // a planted foot that has drifted under the body (the body turned over it) wants to step
    function crossed(c, lg) { var o = legSide(c, lg); return (lg.foot[0] - lg.hip[0]) * o[0] + (lg.foot[1] - lg.hip[1]) * o[1] < lg.fem * (c.segs ? c.w : c.L) * 0.25; }
    function legSide(c, leg) {
      var d = leg.d;
      if (c.segs) { var sg = c.segs[d.seg]; return [-sg.f[1] * d.side, sg.f[0] * d.side, 0]; }
      var th = c.heading; return [-Math.sin(th) * d.side, Math.cos(th) * d.side, 0];
    }
    // a foot off the ground: kept as an offset from its hip that eases toward the hanging pose (the body carries it; it never
    // trails behind a jump, and it never rises above the hip)
    function hang(c, lg, L, dt) {
      var want = sub(dangle(c, lg), lg.hip);
      if (!lg.hoff || lg.hoffT !== T - dt) lg.hoff = sub(lg.foot, lg.hip);
      var dv = sub(want, lg.hoff), dd = len(dv), mx = L * 5 * dt / 1000 + 0.3;
      lg.hoff = dd > mx ? madd(lg.hoff, dv, mx / dd) : want;
      if (lg.hoff[2] > -L * 0.06) lg.hoff[2] = Math.min(lg.hoff[2], -L * 0.06);
      lg.hoffT = T;
      lg.foot = add(lg.hip, lg.hoff);
      var g = groundZ(lg.foot[0], lg.foot[1], lg.foot[2] + L * 0.3); if (g !== null && lg.foot[2] < g) lg.foot[2] = g;
    }
    /* ---------- IK: hip -> knee -> ankle (2 bones), ankle -> foot (tarsus) */
    function solveLeg(c, leg) {
      var L = c.segs ? c.w : c.L, hip = leg.hip, foot = leg.foot, d = leg.d;
      // outward = the leg's own side of the body (stable: never flips when the foot passes under the hip)
      var out = legSide(c, leg);
      var tarL = leg.tar * L;
      var tdir = norm([-out[0] * 0.30, -out[1] * 0.30, 1]);
      var ankle = madd(foot, tdir, tarL);
      var a = leg.fem * L, b = leg.tib * L, D = sub(ankle, hip), dl = len(D), stretch = 1;
      if (dl > a + b - 1e-4) { stretch = dl / (a + b - 1e-4); a *= stretch; b *= stretch; }
      dl = Math.max(dl, Math.abs(a - b) + 1e-3);
      var dir = mul(D, 1 / (len(D) || 1));
      var pole = norm([out[0] * d.pole[1], out[1] * d.pole[1], d.pole[2]]);
      var pd = sub(pole, mul(dir, dot(pole, dir)));
      if (len(pd) < 1e-4) pd = sub([0, 0, 1], mul(dir, dir[2]));
      pd = norm(pd);
      var x0 = (a * a - b * b + dl * dl) / (2 * dl), y0 = Math.sqrt(Math.max(0, a * a - x0 * x0));
      // a knee that would end inside the ground (a leg reaching up a slope or round a ledge) bends straight up instead
      var kz = hip[2] + dir[2] * x0 + pd[2] * y0, kx = hip[0] + dir[0] * x0 + pd[0] * y0, ky = hip[1] + dir[1] * x0 + pd[1] * y0;
      var gk = groundZ(kx, ky, Math.max(kz, hip[2]) + L * 0.5);
      if (gk !== null && kz < gk + L * 0.04) {
        var pu = sub([0, 0, 1], mul(dir, dir[2]));
        if (len(pu) > 1e-3) { pu = norm(pu); if (hip[2] + dir[2] * x0 + pu[2] * y0 > kz) pd = pu; }
      }
      // the bend plane turns about the leg at a bounded rate (never flips in one frame when the leg points along the pole)
      var pp = pd;
      if (leg.pp) {
        var pc = sub(leg.pp, mul(dir, dot(leg.pp, dir)));
        if (len(pc) > 1e-3) {
          pc = norm(pc);
          var cs = clamp(dot(pc, pd), -1, 1), ang = Math.acos(cs), mxa = 0.15;
          if (ang > mxa) { var ax = cross(pc, pd); if (len(ax) < 1e-6) ax = dir; ax = norm(ax); pp = norm(add(mul(pc, Math.cos(mxa)), mul(cross(ax, pc), Math.sin(mxa)))); }
        }
      }
      leg.pp = pp;
      var x = (a * a - b * b + dl * dl) / (2 * dl), y = Math.sqrt(Math.max(0, a * a - x * x));
      leg.knee = add(add(hip, mul(dir, x)), mul(pp, y));
      leg.ankle = ankle; leg.stretch = stretch;
    }

    /* ---------- stepping */
    function stepDur(c) {
      var L = c.segs ? c.w : c.L, sp = Math.max(c.speed, c.hspeed || 0, 1e-3);
      var stride = P.stride * (c.segs ? c.w * 1.6 : L);
      var mn = c.segs ? 55 : 95; return clamp(0.55 * stride / sp * 1000, mn, Math.max(mn, P.stepMs * (c.segs ? 0.75 : 1)));
    }
    function startStep(c, i, target, forced) {
      var leg = c.legs[i], L = c.segs ? c.w : c.L;
      // one step covers at most 0.7 L (a long way, e.g. while turning, takes two steps: the foot never streaks)
      var sx = target[0] - leg.foot[0], sy = target[1] - leg.foot[1], sl = Math.hypot(sx, sy), mxs = L * (c.segs ? 1.1 : 0.7);
      if (sl > mxs) {
        var kx = mxs / sl, px = leg.foot[0] + sx * kx, py = leg.foot[1] + sy * kx, pg = groundZ(px, py, Math.max(target[2], leg.foot[2]) + L);
        if (pg !== null) target = [px, py, pg];
      }
      var from = leg.foot.slice(), dur = stepDur(c);
      // clearance over the ground along the path (lift first, carry, then drop: the foot never cuts through a step)
      var top = pathTop(from, target, L);
      var arc = P.lift * L * (c.segs ? 0.7 : 1);
      var rise = top - Math.min(from[2], target[2]), up = top + arc * 0.55 - from[2], down = top + arc * 0.55 - target[2];
      // lifting over a rise takes time: the foot rises at most ~L * 7 per second, so it never jumps up
      var a = clamp(0.1 + 0.3 * rise / (rise + arc), 0.1, 0.36);
      dur = Math.max(dur, Math.max(up, down) / (L * 12) * 1000 / a);
      dur = Math.min(dur, c.segs ? 105 : 170);
      var cap0 = leg.hip ? leg.hip[2] - L * 0.06 : Infinity;
      arc = Math.max(0, Math.min(arc, cap0 - Math.max(from[2], target[2])));
      leg.sw = { from: from, to: target, t: 0, dur: dur, top: Math.max(top, Math.min(top + arc * 0.55, cap0)), arc: arc, a: a };
      leg.planted = false;
      S.steps++; if (forced) S.forced++;
      if (forced) ev({ ev: 'forced', id: c.id, leg: i });
    }
    // highest ground along a foot's path (and a foot's width either side)
    function pathTop(from, to, L) {
      var top = Math.max(from[2], to[2]);
      for (var k = 0; k <= 10; k++) {
        var t = k / 10, x = lerp(from[0], to[0], t), y = lerp(from[1], to[1], t);
        for (var e = -1; e <= 1; e++) { var g = groundZ(x + e * L * 0.04, y, top + L * 2); if (g !== null && g > top) top = g; }
      }
      return top;
    }
    function swingPos(sw) {
      var t = clamp(sw.t, 0, 1), a = sw.a;
      if (sw.land) { var e = sstep(0, 1, t); return [lerp(sw.from[0], sw.to[0], e), lerp(sw.from[1], sw.to[1], e), Math.max(lerp(sw.from[2], sw.to[2], e), lerp(sw.from[2], sw.to[2], 1) )]; }
      var xp = sstep(0, 1, (t - a) / (1 - 2 * a));
      var x = lerp(sw.from[0], sw.to[0], xp), y = lerp(sw.from[1], sw.to[1], xp);
      var base = lerp(sw.from[2], sw.to[2], xp) + sw.arc * Math.sin(PI * t);
      var env = t < a ? lerp(sw.from[2], sw.top, sstep(0, a, t)) : t > 1 - a ? lerp(sw.top, sw.to[2], sstep(1 - a, 1, t)) : sw.top;
      return [x, y, Math.max(base, env)];
    }

    function updateLegs(c, dt) {
      var L = c.segs ? c.w : c.L, legs = c.legs, n = legs.length;
      updateHips(c);
      // advance swings; a swinging foot re-aims at a moving target (bounded per step, so it never jumps)
      var leadR = stepDur(c) * 0.7 + 30, leadV = [c.vel[0] * leadR / 1000, c.vel[1] * leadR / 1000, 0, leadR / 1000];
      for (var i = 0; i < n; i++) {
        var lg = legs[i];
        if (lg.sw) {
          if (!c.air && !c.dying && lg.sw.t < 0.75) {
            var nt = legTarget(c, lg, leadV);
            if (nt && Math.abs(nt[2] - lg.sw.to[2]) < L * 0.05 && nt[2] <= lg.sw.top) {
              var ddx = nt[0] - lg.sw.to[0], ddy = nt[1] - lg.sw.to[1], dd = Math.hypot(ddx, ddy), mxr = L * 0.06;
              if (dd > 1e-6) {
                var kk = Math.min(1, mxr / dd), nto = [lg.sw.to[0] + ddx * kk, lg.sw.to[1] + ddy * kk, lg.sw.to[2]];
                var gq = groundZ(nto[0], nto[1], nto[2] + L * 0.5);
                if (gq !== null && Math.abs(gq - nto[2]) < L * 0.05) { nto[2] = gq; if (pathTop(lg.foot, nto, L) <= lg.sw.top - lg.sw.arc * 0.3 && pathTop(lg.sw.from, nto, L) <= lg.sw.top) lg.sw.to = nto; }
              }
            }
          }
          lg.sw.t += dt / lg.sw.dur;
          if (lg.sw.t >= 1) {
            var to = lg.sw.to, g = groundZ(to[0], to[1], to[2] + L * 0.5);
            lg.foot = [to[0], to[1], g === null ? to[2] : g]; lg.sw = null; lg.planted = g !== null; lg.lastPlant = T; S.plants++;
            if (lg.planted) { dustAt(c, lg.foot, c.speed); if (O.onStep) safe(O.onStep, { id: c.id, leg: i, x: toWorld(lg.foot).x, y: toWorld(lg.foot).y }); }
          } else {
            lg.foot = swingPos(lg.sw);
            // a lifted foot never trails out of reach (the leg would tear): pull it and its path toward the hip
            var hv2 = [lg.foot[0] - lg.hip[0], lg.foot[1] - lg.hip[1]], hd2 = Math.hypot(hv2[0], hv2[1]), mxh = (lg.fem + lg.tib) * L * 0.98;
            var vz2 = lg.hip[2] - lg.foot[2], mxv = Math.sqrt(Math.max(0, mxh * mxh - vz2 * vz2));
            if (hd2 > mxv && hd2 > 1e-6) { var pull = (hd2 - mxv) / hd2; lg.sw.from = [lg.sw.from[0] - hv2[0] * pull, lg.sw.from[1] - hv2[1] * pull, lg.sw.from[2]]; lg.foot = swingPos(lg.sw); var gpl = groundZ(lg.foot[0], lg.foot[1], lg.foot[2] + L); if (gpl !== null && lg.foot[2] < gpl) lg.foot[2] = gpl; }
          }
        }
      }
      if (c.air || c.dying) {
        // in the air (or curling up): feet hang, nobody plants; they move toward the hanging pose smoothly
        for (var a = 0; a < n; a++) {
          var lgA = legs[a];
          if (lgA.sw) { if (c.air) { lgA.sw = null; lgA.hoff = null; } else continue; }   // leaving the ground ends a step: that foot hangs too
          if (lgA.planted && !c.dying && !c.air) continue;
          lgA.planted = false;
          hang(c, lgA, L, dt);
        }
        for (var q = 0; q < n; q++) solveLeg(c, legs[q]);
        return;
      }
      // landing: feet that hang reach for the ground (one recovery step each, gait rule off while mode is 'land')
      var lead = [c.vel[0] * 0.001, c.vel[1] * 0.001, 0];
      var leadT = stepDur(c) * 0.7 + 30;
      lead = [c.vel[0] * leadT / 1000, c.vel[1] * leadT / 1000, 0, leadT / 1000];
      var cand = [];
      for (var j = 0; j < n; j++) {
        var lj = legs[j]; if (lj.sw) continue;
        var tg = legTarget(c, lj, lead);
        lj.noFoot = !tg && !lj.planted;
        if (!lj.planted) {
          if (tg) { startStep(c, j, tg, false); lj.sw.land = true; if (c.mode !== 'land') { c.mode = 'land'; c.modeT = 0; S.lands++; ev({ ev: 'land', id: c.id }); } }
          else { hang(c, lj, L, dt); S.dangling++; }
          continue;
        }
        // ground under a planted foot changed (carved, moved platform): step off it at once
        var gnow = groundZ(lj.foot[0], lj.foot[1], lj.foot[2] + L * 0.25);
        if (gnow === null || Math.abs(gnow - lj.foot[2]) > 0.5) {
          S.regrounds++;
          if (tg) startStep(c, j, tg, true); else { lj.planted = false; }
          continue;
        }
        var reachMax = (lj.fem + lj.tib) * L, hipToAnkle = len(sub(madd(lj.foot, [0, 0, 1], lj.tar * L), lj.hip));
        var over = hipToAnkle > reachMax * 1.08;
        var err = tg ? Math.hypot(lj.foot[0] - tg[0], lj.foot[1] - tg[1]) : 0;
        var restErr = 0;
        if (tg) { var tr0 = legTarget(c, lj, [0, 0, 0]); restErr = tr0 ? Math.hypot(lj.foot[0] - tr0[0], lj.foot[1] - tr0[1]) : 0; }
        var thr = P.stride * (c.segs ? c.w * 1.6 : L) * clamp(1.15 - Math.max(c.speed, c.hspeed || 0) / (L * 5), 0.45, 1);
        var urg = 0;
        if (over) urg = 10 + hipToAnkle / reachMax;
        else if (err > thr) urg = 1 + err / thr;
        else if (hipToAnkle > reachMax * 0.86 && err > thr * 0.25) urg = 1 + hipToAnkle / reachMax;
        else if (crossed(c, lj) && err > thr * 0.25) urg = 3;
        else if (c.idle > 250 && restErr > thr * 0.3 && T - lj.lastPlant > 160) urg = 0.5 + restErr / thr;
        if (tg) cand.push({ i: j, u: urg, tg: tg, over: hipToAnkle > reachMax * 1.08, err: err, thr: thr });
        else if (over) { lj.planted = false; }
      }
      // alternating gait: the legs form two groups with no neighbours inside a group (left 0, right 1, left 2, ... and the
      // mirror); only one group is ever off the ground. When the group that is down has a leg that wants to step, every leg
      // of that group with some distance to go steps together.
      var busy = -1;
      for (var b2 = 0; b2 < n; b2++) if (legs[b2].sw || (!legs[b2].planted && !legs[b2].noFoot)) { busy = legs[b2].d.grp; break; }
      var landing = c.mode === 'land';
      if (busy < 0) {
        var gu = [0, 0];
        for (var m = 0; m < cand.length; m++) gu[legs[cand[m].i].d.grp] = Math.max(gu[legs[cand[m].i].d.grp], cand[m].u);
        var other = 1 - (c.lastGrp || 0), pick = gu[other] > 0 ? other : gu[1 - other] > 0 ? 1 - other : -1;   // alternate whenever the other group has any need
        if (pick >= 0 && T - (c.lastGrpT || -9999) > 30) {
          for (var m2 = 0; m2 < cand.length; m2++) {
            var cd = cand[m2]; if (legs[cd.i].d.grp !== pick) continue;
            if (cd.u > 0 || cd.err > cd.thr * 0.3) startStep(c, cd.i, cd.tg, false);
          }
          c.lastGrp = pick; c.lastGrpT = T;
        }
      } else if (!landing) {
        // an extreme stretch (a shove, a knockback) cannot wait for the other group
        for (var m3 = 0; m3 < cand.length; m3++) if (cand[m3].over && legs[cand[m3].i].d.grp !== busy) startStep(c, cand[m3].i, cand[m3].tg, true);
      }
      for (var q2 = 0; q2 < n; q2++) solveLeg(c, legs[q2]);
    }

    /* ---------- head */
    function updateHead(c, dt) {
      var F = frame(c), L = c.L;
      var yawT = 0, pitT = 0;
      if (c.target) {
        var hp = c.segs ? [c.segs[0].p[0], c.segs[0].p[1], c.segs[0].z] : local(c, F, c.kind === 'crab' ? [0.25, 0, 0.12] : [0.30, 0, 0.05]);
        var dv = sub(c.target, hp);
        var fx = dot(dv, F.f), lx = dot(dv, F.l), ux = dot(dv, F.u);
        yawT = Math.atan2(lx, Math.max(1e-6, fx) + (fx < 0 ? 0 : 0));
        if (fx < 0) yawT = lx >= 0 ? PI / 2 : -PI / 2;
        pitT = Math.atan2(ux, Math.hypot(fx, lx));
        if (VIEW === 'side' && c.kind !== 'crab') yawT = 0;
        if (VIEW === 'side' && c.kind === 'crab') { yawT = clamp(Math.atan2(dot(dv, F.l), Math.abs(dot(dv, F.f)) + L * 0.6), -PI / 2, PI / 2); }
      }
      var ylim = P.headYaw * PI / 180, plim = P.headPitch * PI / 180;
      if (c.kind === 'crab') ylim = Math.max(ylim, PI / 2.2);
      yawT = clamp(yawT, -ylim, ylim); pitT = clamp(pitT, -plim, plim);
      var mx = P.headRate * PI / 180 * dt / 1000;
      c.headYaw += clamp(yawT - c.headYaw, -mx, mx);
      c.headPitch += clamp(pitT - c.headPitch, -mx, mx);
      c.headYawT = yawT; c.headPitchT = pitT;
    }

    /* ---------- one creature, one fixed step */
    function stepCreature(c, a, dt) {
      var L = c.L;
      var p = toInt(num(a.x, c.anchor[0]), num(a.y, VIEW === 'side' ? -c.anchor[2] : c.anchor[1]), a.depth == null ? c.anchor[1] : a.depth);
      if (!isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2])) { S.badInput++; return; }
      var jump = Math.hypot(p[0] - c.anchor[0], p[1] - c.anchor[1], p[2] - c.anchor[2]);
      c.prev = c.anchor; c.anchor = p;
      var inst = mul(sub(p, c.prev), 1000 / dt);
      if (jump > Math.max(L * 0.9, 40)) {
        // teleport (respawn, warp): put the whole body and every foot down where it is now
        c.vel = [0, 0, 0]; c.speed = 0; S.snaps++; ev({ ev: 'snap', id: c.id });
        if (c.segs) { c.trail = []; initCentipede(c, rng(1)); setGroups(c); }
        placeBody(c, true); plantAll(c); return;
      }
      c.vel = [lerp(c.vel[0], inst[0], 0.35), lerp(c.vel[1], inst[1], 0.35), lerp(c.vel[2], inst[2], 0.35)];
      c.speed = Math.hypot(c.vel[0], c.vel[1]);
      c.idle = c.speed < L * 0.08 ? c.idle + dt : 0;
      c.crouch = clamp(num(a.crouch, 0), 0, 1);
      c.flash = c.dying ? Math.max(0, c.flash - dt / 150) : clamp(num(a.flash, 0), 0, 1) * 0.7;   // a hit flash, never a white ghost while dying
      // target (a world point, or the id of another actor in this module)
      c.target = null;
      var tg = a.target;
      if (tg != null) {
        if (typeof tg === 'object' && isFinite(tg.x) && isFinite(tg.y)) {
          var ti = toInt(+tg.x, +tg.y);
          if (VIEW === 'top') ti[2] = num(tg.z, L * 0.3);
          c.target = ti;
        } else if (C[String(tg)]) { var o = C[String(tg)]; c.target = [o.anchor[0], o.anchor[1], o.bodyZ]; }
      }
      // heading: the body faces its path (a crab its side), else turns to the target when it stands
      var want = null, mv = Math.hypot(c.vel[0], c.vel[1]);
      if (VIEW === 'side') {
        if (c.kind === 'crab') want = PI / 2;
        else if (Math.abs(c.vel[0]) > L * 0.12) want = c.vel[0] > 0 ? 0 : PI;
        else if (c.target && c.idle > 200 && Math.abs(c.target[0] - c.anchor[0]) > L * 0.3) want = c.target[0] > c.anchor[0] ? 0 : PI;
        if (want !== null && !c.segs) {
          var mxs = P.turnRate * PI / 180 * dt / 1000;
          c.heading = clamp(c.heading + clamp(want - c.heading, -mxs, mxs), 0, PI);
        }
      } else if (!c.segs) {
        if (mv > L * 0.12) {
          want = Math.atan2(c.vel[1], c.vel[0]);
          if (c.kind === 'crab') {
            var w1 = want + PI / 2, w2 = want - PI / 2;
            want = Math.abs(angWrap(w1 - c.heading)) < Math.abs(angWrap(w2 - c.heading)) ? w1 : w2;
          }
        } else if (c.target && c.idle > 200) want = Math.atan2(c.target[1] - c.anchor[1], c.target[0] - c.anchor[0]);
        if (want !== null) {
          var mxt = P.turnRate * PI / 180 * dt / 1000;
          c.heading = angWrap(c.heading + clamp(angWrap(want - c.heading), -mxt, mxt));
        }
      }
      c.omega = lerp(c.omega || 0, angWrap(c.heading - (c.prevHeading == null ? c.heading : c.prevHeading)) * 1000 / dt, 0.5); c.prevHeading = c.heading;
      // pitch / roll from the planted feet (side view: pitch follows the slope)
      if (!c.segs) {
        var fr = 0, fn = 0, bk = 0, bn = 0, lf = 0, ln = 0, rt = 0, rn = 0, F0 = frame(c);
        for (var i = 0; i < c.legs.length; i++) {
          var lg = c.legs[i]; if (!lg.foot) continue;
          var rel = sub(lg.foot, c.anchor), along = dot(rel, F0.f0), side = dot(rel, F0.l0);
          if (along > 0) { fr += lg.foot[2]; fn++; } else { bk += lg.foot[2]; bn++; }
          if (side > 0) { lf += lg.foot[2]; ln++; } else { rt += lg.foot[2]; rn++; }
        }
        var pw = (fn && bn && !c.air) ? Math.atan2(fr / fn - bk / bn, L * 0.9) * 0.8 : 0;
        var rw = (ln && rn && !c.air) ? Math.atan2(lf / ln - rt / rn, L * 1.4) * 0.6 : 0;
        pw = clamp(pw, -0.45, 0.45); rw = clamp(rw, -0.3, 0.3);
        var mr = 1.6 * dt / 1000;
        c.pitch += clamp(pw - c.pitch, -mr, mr); c.roll += clamp(rw - c.roll, -mr, mr);
        var lifted = 0; for (var b = 0; b < c.legs.length; b++) if (c.legs[b].sw) lifted += Math.sin(PI * clamp(c.legs[b].sw.t, 0, 1));
        var bobW = lifted / Math.max(1, c.legs.length) * L * 0.05 * (c.speed > L * 0.1 ? 1 : 0.3);
        c.bob += clamp(bobW - c.bob, -L * 0.004 * dt / 16.7, L * 0.004 * dt / 16.7);
      }
      placeBody(c, false);
      if (c.mode === 'land') { c.modeT += dt; var anySw = false; for (var s2 = 0; s2 < c.legs.length; s2++) if (c.legs[s2].sw || !c.legs[s2].planted) anySw = true; if (!anySw || c.modeT > 600) { c.mode = 'walk'; c.modeT = 0; } }
      if (c.air) { c.mode = 'air'; c.modeT = 0; } else if (c.mode === 'air') { c.mode = 'land'; c.modeT = 0; S.lands++; ev({ ev: 'land', id: c.id }); c.bodyVz -= L * 2.2; }   // landing squash: the spring dips the body
      updateLegs(c, dt);
      updateHead(c, dt);
      c.breathe += dt / 1000 * 2.4;
      c.pinchT += dt;
      if (c.kind === 'crab') { var near = c.target && len(sub(c.target, c.anchor)) < L * 3; c.pinch = near ? 0.5 + 0.5 * Math.sin(c.pinchT / 140) : 0.15 + 0.15 * Math.sin(c.pinchT / 700); }
      if (!isFinite(c.bodyZ) || !isFinite(c.heading)) { S.nonFinite++; c.bodyZ = c.anchor[2]; c.heading = 0; }
    }

    function dustAt(c, foot, speed) {
      if (!(P.dust > 0)) return;
      var L = c.segs ? c.w : c.L, n = speed > L * 2 ? 2 : speed > L * 0.4 ? 1 : 0;
      var R = rng((hashStr(c.id) + S.plants * 7919 + SEED) >>> 0);
      for (var i = 0; i < Math.round(n * P.dust); i++) {
        var d = DUST[dustRR++ % DUST.length];
        d.on = true; d.p = foot.slice(); d.v = [(R() - 0.5) * L * 0.9, (R() - 0.5) * L * (VIEW === 'top' ? 0.6 : 0.2), L * (0.4 + R() * 0.5)];
        d.age = 0; d.life = 300 + R() * 200; d.r = L * (0.012 + R() * 0.012) * (c.segs ? 2 : 1); d.col = c.pal || null;
      }
    }

    /* ---------- update: read the game's list, step everything */
    function update(dtMs) {
      if (!(dtMs > 0)) { S.frozen++; return; }
      var dt = Math.min(+dtMs, 50);
      try {
        T += dt; S.updates++;
        var list = typeof O.actors === 'function' ? safe(O.actors) : null;
        var seen = {};
        if (list && list.length) {
          for (var i = 0; i < list.length; i++) {
            var a = list[i]; if (!a || a.id == null) { S.badInput++; continue; }
            var id = String(a.id); seen[id] = 1;
            var c = C[id];
            if (a.dead || a.alive === false) { if (c && !c.dying) { c.dying = 1; ev({ ev: 'die', id: id }); } if (!c) continue; }
            if (!c) { c = make(a); if (!c) continue; C[id] = c; ORDER.push(id); }
            if (c.dying) { c.dying += dt; stepCreature(c, a, dt); continue; }
            stepCreature(c, a, dt);
          }
        }
        for (var j = ORDER.length - 1; j >= 0; j--) {
          var cc = C[ORDER[j]];
          if (!seen[cc.id] && !cc.dying) { cc.dying = 1; ev({ ev: 'die', id: cc.id }); }
          if (cc.dying && !seen[cc.id]) { cc.dying += dt; stepCreature(cc, { x: cc.anchor[0], y: VIEW === 'side' ? -cc.anchor[2] : cc.anchor[1], depth: cc.anchor[1] }, dt); }
          if (cc.dying > 900) { delete C[cc.id]; ORDER.splice(j, 1); ev({ ev: 'gone', id: cc.id }); }
        }
        for (var d = 0; d < DUST.length; d++) {
          var p = DUST[d]; if (!p.on) continue;
          p.age += dt; if (p.age > p.life) { p.on = false; continue; }
          var k = dt / 1000; p.v[2] -= p.v[2] * 2.2 * k; p.v[0] *= 1 - 2.5 * k; p.v[1] *= 1 - 2.5 * k;
          p.p = madd(p.p, p.v, k);
        }
      } catch (e) { S.updErrors++; }
    }

    /* ================================================================== drawing */
    var buf = null, bufCap = 0, img = null, imgW = 0, imgH = 0, scratch = null, sctx = null;
    function ensure(w, h) {
      if (!buf || w * h > bufCap) { bufCap = Math.max(w * h, bufCap * 1.5 | 0); buf = new Float32Array(bufCap * 4); }
      if (!scratch || w > imgW || h > imgH) {
        imgW = Math.max(w, imgW); imgH = Math.max(h, imgH);
        scratch = makeCanvas(imgW, imgH); if (!scratch) return false;
        sctx = scratch.getContext('2d'); img = sctx.createImageData(imgW, imgH);
      }
      return true;
    }
    function palFor(c) {
      var name = c.pal || (P.palette !== 'auto' ? P.palette : PAL_FOR_KIND[c.kind]);
      var pal = PALETTES[name] || PALETTES.forest;
      if (!pal._c) {
        pal._c = {};
        for (var m in pal) if (pal[m] && pal[m].map) pal._c[m] = pal[m].map(hex);
        pal._rim = hex(pal.rimc); pal._glow = hex(pal.glow); pal._dust = hex(pal.dust);
      }
      return pal;
    }

    // projection (native px, before the camera): side x, -z + depth * y ; top x, y - z
    function projM() { return VIEW === 'side' ? [[1, 0, 0], [0, P.depth, -1]] : [[1, 0, 0], [0, 1, -1]]; }
    function viewDir() { return VIEW === 'side' ? norm([0, 1, P.depth]) : norm([0, 1, 1]); }
    function proj(M, p) { return [M[0][0] * p[0] + M[0][1] * p[1] + M[0][2] * p[2], M[1][0] * p[0] + M[1][1] * p[1] + M[1][2] * p[2]]; }

    // build the primitive list of one creature (internal 3D)
    function prims(c) {
      var out = [], L = c.L, F = c.segs ? null : frame(c);
      function ell(cen, ax, r, mat, pat, bias) { out.push({ t: 0, c: cen, A: [mul(ax[0], r[0] * L), mul(ax[1], r[1] * L), mul(ax[2], r[2] * L)], mat: mat, pat: pat || 0, bias: bias || 0 }); }
      function cap(p0, p1, r0, r1, mat, pat, bias) { out.push({ t: 1, p0: p0, p1: p1, r0: r0, r1: r1, mat: mat, pat: pat || 0, bias: bias || 0 }); }
      function legPrims(lg, mat, Lu, sh) {
        var r = lg.d.r, s = sh || 1;
        if (!lg.knee) return;
        // each segment is two tapered capsules bowed slightly toward the knee's side (a curved, organic leg, not a straight tube)
        var bow = lg.pp || [0, 0, 1], pat = lg.d.band ? 3 : 0;
        function seg2(a, b, ra, rm, rb, k, bias) {
          var m = add(mul(add(a, b), 0.5), mul(bow, len(sub(b, a)) * k));
          cap(a, m, ra, rm, mat, pat, bias); cap(m, b, rm, rb, mat, pat, bias);
        }
        seg2(lg.hip, lg.knee, r[0] * Lu * s, r[0] * Lu * s * 1.08, r[1] * Lu * s, 0.07, 0.02);
        seg2(lg.knee, lg.ankle, r[2] * Lu * s, r[2] * Lu * s * 0.92, r[3] * Lu * s, 0.05, 0.01);
        cap(lg.ankle, lg.foot, r[3] * Lu * s, r[4] * Lu * s, mat, mat === 'pleg' ? 0 : 6, 0.0);
        if (mat !== 'pleg') out.push({ t: 0, c: lg.knee, A: [[r[1] * Lu * 1.12 * s, 0, 0], [0, r[1] * Lu * 1.12 * s, 0], [0, 0, r[1] * Lu * 1.12 * s]], mat: mat, pat: 0, bias: 0.03 });
        if (lg.d.band && !c._px && c.kind === 'spider') {
          // bristles along the femur and tibia (HD only), pointing away from the leg's inner side
          var segs2 = [[lg.hip, lg.knee, r[0]], [lg.knee, lg.ankle, r[2]]];
          for (var bi = 0; bi < 2; bi++) {
            var a0 = segs2[bi][0], a1 = segs2[bi][1], ax = norm(sub(a1, a0)), up0 = sub([0, 0, 1], mul(ax, ax[2]));
            if (len(up0) < 1e-3) continue; up0 = norm(up0);
            for (var bj = 0; bj < 3; bj++) {
              var tt = 0.25 + bj * 0.25, bp = add(a0, mul(sub(a1, a0), tt)), bd = norm(add(mul(up0, 0.8), mul(ax, 0.6)));
              var b0 = add(bp, mul(up0, segs2[bi][2] * Lu * 0.7));
              cap(b0, add(b0, mul(bd, 0.07 * Lu)), 0.009 * Lu, 0.004 * Lu, mat, 0, 0.005);
            }
          }
        }
      }
      if (c.kind === 'spider') {
        var br = 1 + 0.025 * Math.sin(c.breathe);
        var hy = c.headYaw, hpch = c.headPitch;
        var cy = Math.cos(hy), syw = Math.sin(hy);
        var hf = norm(add(mul(F.f, cy), mul(F.l, syw))); var hl = norm(cross(F.u, hf));
        var cp = Math.cos(hpch), spch = Math.sin(hpch);
        var hF = norm(add(mul(hf, cp), mul(F.u, spch))), hU = norm(cross(hF, hl));
        var B = bodyCentre(c);
        function hloc(q) { var piv = local(c, F, [0.16, 0, 0.02]); return add(piv, add(add(mul(hF, (q[0] - 0.16) * L), mul(hl, q[1] * L)), mul(hU, (q[2] - 0.02) * L))); }
        for (var i = 0; i < c.legs.length; i++) legPrims(c.legs[i], 'leg', L);
        var abd = local(c, F, [-0.40, 0, 0.13]), au = norm(add(mul(F.u, 0.94), mul(F.f, -0.34))), af = norm(cross(F.l, au));
        ell(abd, [af, F.l, au], [0.31 * br, 0.25 * br, 0.24 * br], 'body', 1, 0.0);
        cap(local(c, F, [-0.66, 0, 0.06]), local(c, F, [-0.72, 0, 0.0]), 0.035 * L, 0.02 * L, 'leg', 0, -0.01);
        ell(local(c, F, [-0.07, 0, 0.04]), [F.f, F.l, F.u], [0.05, 0.04, 0.04], 'leg', 0, -0.01);
        ell(local(c, F, [0.10, 0, 0.03]), [F.f, F.l, F.u], [0.23, 0.19, 0.13], 'body', 2, 0.0);
        ell(hloc([0.27, 0, 0.06]), [hF, hl, hU], [0.12, 0.13, 0.11], 'body', 2, 0.005);
        for (var sd = -1; sd <= 1; sd += 2) {
          // chelicerae + fangs, pedipalps, eyes
          ell(hloc([0.35, sd * 0.045, -0.03]), [hF, hl, hU], [0.06, 0.042, 0.07], 'body', 0, 0.01);
          cap(hloc([0.38, sd * 0.045, -0.08]), hloc([0.40, sd * 0.03, -0.13]), 0.018 * L, 0.005 * L, 'fang', 0, 0.02);
          var tw = Math.sin(c.breathe * 1.7 + sd) * 0.03;
          var pp0 = hloc([0.32, sd * 0.085, -0.02]), pp1 = hloc([0.44, sd * 0.13, 0.02 + tw]), pp2 = hloc([0.50, sd * 0.11, -0.10 + tw]);
          cap(pp0, pp1, 0.028 * L, 0.022 * L, 'leg', 0, 0.01); cap(pp1, pp2, 0.022 * L, 0.016 * L, 'leg', 0, 0.01);
          ell(hloc([0.345, sd * 0.032, 0.085]), [hF, hl, hU], [0.032, 0.032, 0.032], 'eye', 0, 0.03);
          ell(hloc([0.32, sd * 0.078, 0.07]), [hF, hl, hU], [0.022, 0.022, 0.022], 'eye', 0, 0.03);
          ell(hloc([0.27, sd * 0.055, 0.125]), [hF, hl, hU], [0.019, 0.019, 0.019], 'eye', 0, 0.03);
        }
      } else if (c.kind === 'crab') {
        var B2 = bodyCentre(c), br2 = 1 + 0.015 * Math.sin(c.breathe);
        for (var j = 0; j < c.legs.length; j++) legPrims(c.legs[j], 'shell', L);
        ell(local(c, F, [-0.02, 0, -0.07]), [F.f, F.l, F.u], [0.22, 0.32, 0.08], 'belly', 0, -0.02);
        ell(local(c, F, [0, 0, 0.03]), [F.f, F.l, F.u], [0.30 * br2, 0.46, 0.21], 'shell', 4, 0.0);
        for (var sp = -3; sp <= 3; sp++) {
          // spines along the front rim of the shell
          var ang = sp * 0.33, rx = Math.cos(ang) * 0.29, ry = Math.sin(ang) * 0.45;
          var b0 = local(c, F, [rx * 0.9, ry * 0.9, 0.06]), b1 = local(c, F, [rx * 1.12 + 0.02, ry * 1.12, 0.07]);
          cap(b0, b1, 0.03 * L, 0.006 * L, 'shell', 0, 0.01);
        }
        var cy2 = Math.cos(c.headYaw), sy2 = Math.sin(c.headYaw);
        var ef = norm(add(mul(F.f, cy2), mul(F.l, sy2)));
        var cyc = Math.cos(c.headYaw * 0.3), syc = Math.sin(c.headYaw * 0.3), efc = norm(add(mul(F.f, cyc), mul(F.l, syc)));   // claws turn less than the eyes: each stays on its own side
        for (var s2 = -1; s2 <= 1; s2 += 2) {
          var st0 = local(c, F, [0.22, s2 * 0.10, 0.10]);
          var st1 = add(st0, add(add(mul(ef, 0.07 * L), mul(F.u, (0.13 + 0.05 * Math.sin(c.headPitch)) * L)), mul(F.l, s2 * 0.03 * L)));
          cap(st0, st1, 0.026 * L, 0.02 * L, 'shell', 0, 0.02);
          ell(st1, [ef, F.l, F.u], [0.055, 0.055, 0.06], 'eye', 0, 0.03);
          out.push({ t: 0, c: add(st1, add(mul(F.f, 0.058 * L), add(mul(F.u, 0.022 * L), mul(F.l, 0.012 * L)))), A: [[0.017 * L, 0, 0], [0, 0.017 * L, 0], [0, 0, 0.017 * L]], mat: 'glint', pat: 0, bias: 0.08 });
          // claws: shoulder -> elbow -> wrist (2-bone IK toward the target side), palm + two fingers
          var big = s2 > 0 ? 1.4 : 1.05;
          // arms come out at the front corners, elbows out and up, the pincers held in front of the face pointing inward
          var sh = local(c, F, [0.20, s2 * 0.30, 0.0]);
          var lift = 0.06 + 0.12 * Math.max(0, Math.sin(c.headPitch));
          var wr = add(local(c, F, [0.34, s2 * (VIEW === 'side' ? 0.62 : 0.30), lift + 0.04]), mul(efc, 0.02 * L));
          var a1 = 0.24 * L * big, a2 = 0.22 * L * big, D = sub(wr, sh), dl = len(D), dir = mul(D, 1 / (dl || 1));
          var pv = add(mul(F.l, s2), mul(F.u, 0.8)), pole = norm(sub(pv, mul(dir, dot(pv, dir))));
          var xx = (a1 * a1 - a2 * a2 + dl * dl) / (2 * dl), yy = Math.sqrt(Math.max(0, a1 * a1 - xx * xx));
          var el = add(add(sh, mul(dir, xx)), mul(pole, yy));
          cap(sh, el, 0.055 * L * big, 0.05 * L * big, 'shell', 0, 0.02);
          cap(el, wr, 0.05 * L * big, 0.06 * L * big, 'shell', 0, 0.02);
          var fd = norm(add(add(mul(F.f, VIEW === 'side' ? 0.35 : 0.85), mul(F.l, -s2 * (VIEW === 'side' ? 0.55 : 0.35))), mul(F.u, 0.42))), fl = norm(cross(F.u, fd)), fu = norm(cross(fd, fl));
          // the pincer: a swollen palm, a fixed finger curving up and a movable finger below with a clear gap
          ell(add(wr, mul(fd, 0.09 * L * big)), [fd, fl, fu], [0.16 * big, 0.10 * big, 0.11 * big], 'shell', 5, 0.03);
          var tip = add(wr, mul(fd, 0.22 * L * big));
          var op = 0.45 + 0.5 * c.pinch;
          var fA0 = add(tip, mul(fu, 0.05 * L * big)), fA1 = add(fA0, add(mul(fd, 0.10 * L * big), mul(fu, 0.015 * L * big))), fA2 = add(fA1, add(mul(fd, 0.07 * L * big), mul(fu, -0.035 * L * big)));
          cap(fA0, fA1, 0.055 * L * big, 0.04 * L * big, 'shell', 6, 0.035); cap(fA1, fA2, 0.04 * L * big, 0.012 * L * big, 'shell', 6, 0.036);
          var dB = norm(add(mul(fd, Math.cos(op)), mul(fu, -Math.sin(op)))), fB0 = add(tip, mul(fu, -0.045 * L * big)), fB1 = add(fB0, mul(dB, 0.10 * L * big)), fB2 = add(fB1, add(mul(fd, 0.06 * L * big), mul(fu, 0.03 * L * big)));
          cap(fB0, fB1, 0.05 * L * big, 0.035 * L * big, 'shell', 6, 0.035); cap(fB1, fB2, 0.035 * L * big, 0.01 * L * big, 'shell', 6, 0.036);
        }
      } else {
        var w = c.w, n = c.segN;
        // legs first and sorted under every plate: only the lower leg shows past the plate rim, tapering to its tip
        var nL0 = out.length;
        for (var k = 0; k < c.legs.length; k++) legPrims(c.legs[k], 'pleg', w);
        for (var k2 = nL0; k2 < out.length; k2++) { out[k2].bias = -0.6; out[k2].under = true; }
        for (var s3 = n - 1; s3 >= 0; s3--) {
          var sg = c.segs[s3], f = sg.f, l = [-f[1], f[0], 0], u = [0, 0, 1];
          var nxt = c.segs[Math.max(0, s3 - 1)], dz = nxt.z - sg.z;
          var pf = norm([f[0], f[1], s3 ? clamp(dz / (c.sp || 1), -0.8, 0.8) : 0]); var pu = norm(cross(pf, l));
          var cen = [sg.p[0], sg.p[1], sg.z];
          var taper = s3 === 0 ? 1.05 : s3 >= n - 2 ? 0.8 : 1;
          out.push({ t: 0, c: cen, A: [mul(pf, c.sp * 0.62), mul(l, w * 0.52 * taper), mul(pu, w * 0.22 * taper)], mat: 'pleg', pat: 0, bias: s3 * 0.0005 - 0.01, seg: s3 });
          out.push({ t: 0, c: add(cen, mul(pu, w * 0.14)), A: [mul(pf, c.sp * 0.66), mul(l, w * 0.76 * taper), mul(pu, w * 0.24 * taper)], mat: 'plate', pat: s3 === 0 ? 7 : 8, bias: s3 * 0.0005, seg: s3 });
          if (s3 === 0) {
            var hy3 = c.headYaw, hp3 = c.headPitch, hf3 = norm(add(mul(pf, Math.cos(hy3)), mul(l, Math.sin(hy3)))), hl3 = norm(cross(u, hf3));
            hf3 = norm(add(mul(hf3, Math.cos(hp3)), mul(u, Math.sin(hp3))));
            var hc = add(cen, mul(hf3, c.sp * 0.55));
            out.push({ t: 0, c: add(hc, mul(u, w * 0.04)), A: [mul(hf3, c.sp * 0.52), mul(hl3, w * 0.6), mul(u, w * 0.22)], mat: 'plate', pat: 7, bias: 0.01 });
            for (var s4 = -1; s4 <= 1; s4 += 2) {
              // antennae (3 links, sway) and forcipules
              var a0 = add(hc, add(mul(hf3, c.sp * 0.42), add(mul(hl3, s4 * w * 0.2), mul(u, w * 0.15))));
              var sw = Math.sin(c.breathe * 2.3 + s4 * 1.3) * 0.25;
              var d1 = norm(add(add(mul(hf3, 1), mul(hl3, s4 * (0.4 + sw))), mul(u, 0.22)));
              var a1p = add(a0, mul(d1, w * 0.6));
              var d2 = norm(add(add(mul(hf3, 1), mul(hl3, s4 * (0.7 + sw))), mul(u, 0.0)));
              var a2p = add(a1p, mul(d2, w * 0.5));
              var d3 = norm(add(add(mul(hf3, 0.7), mul(hl3, s4 * (1.0 + sw))), mul(u, -0.25)));
              var a3p = add(a2p, mul(d3, w * 0.4));
              cap(a0, a1p, w * 0.08, w * 0.065, 'pleg', 0, 0.02); cap(a1p, a2p, w * 0.065, w * 0.05, 'pleg', 0, 0.02); cap(a2p, a3p, w * 0.05, w * 0.03, 'pleg', 0, 0.02);
              // forcipules: thick at the base under the head, curving forward, down and inward around the mouth to a dark hooked tip
              var fo0 = add(hc, add(mul(hf3, c.sp * 0.22), add(mul(hl3, s4 * w * 0.32), mul(u, -w * 0.1))));
              var fo1 = add(fo0, add(mul(hf3, w * 0.3), add(mul(hl3, s4 * w * 0.08), mul(u, -w * 0.08))));
              var fo2 = add(fo1, add(mul(hf3, w * 0.16), add(mul(hl3, -s4 * w * 0.16), mul(u, -w * 0.12))));
              var fo3 = add(fo2, add(mul(hf3, -w * 0.02), add(mul(hl3, -s4 * w * 0.16), mul(u, -w * 0.06))));
              cap(fo0, fo1, w * 0.13, w * 0.1, 'plate', 0, 0.02); cap(fo1, fo2, w * 0.1, w * 0.06, 'plate', 0, 0.021); cap(fo2, fo3, w * 0.06, w * 0.015, 'eye', 0, 0.022);
              out.push({ t: 0, c: add(hc, add(mul(hf3, c.sp * 0.25), add(mul(hl3, s4 * w * 0.3), mul(u, w * 0.18)))), A: [[w * 0.09, 0, 0], [0, w * 0.09, 0], [0, 0, w * 0.09]], mat: 'eye', pat: 0, bias: 0.03 });
            }
          }
          if (s3 === n - 1) {
            for (var s5 = -1; s5 <= 1; s5 += 2) {
              // tail legs (cerci): long, trailing
              // two short tapered cerci
              var t0 = add(cen, add(mul(pf, -c.sp * 0.35), mul(l, s5 * w * 0.3))), t1 = add(t0, add(mul(pf, -w * 0.28), add(mul(l, s5 * w * 0.2), mul(u, w * 0.04))));
              var t2 = add(t1, add(mul(pf, -w * 0.18), add(mul(l, s5 * w * 0.08), mul(u, -w * 0.02))));
              cap(t0, t1, w * 0.09, w * 0.055, 'plate', 0, 0.01); cap(t1, t2, w * 0.055, w * 0.012, 'plate', 0, 0.01);
            }
          }
        }
      }
      return out;
    }

    // shading of one material
    var LIGHT_SIDE = norm([-0.55, 0.55, 0.75]), LIGHT_TOP = norm([-0.5, 0.35, 0.8]), RIMD_SIDE = norm([0.75, -0.45, 0.5]), RIMD_TOP = norm([0.6, -0.7, 0.35]);
    function lightCfg() {
      var Lk = O.light && O.light.key ? norm(O.light.key) : (VIEW === 'side' ? LIGHT_SIDE : LIGHT_TOP);
      var Rd = O.light && O.light.rim ? norm(O.light.rim) : (VIEW === 'side' ? RIMD_SIDE : RIMD_TOP);
      return { k: Lk, r: Rd };
    }

    function rasterCreature(ctx, c, camX, camY, opt) {
      var M = projM(), V = viewDir(), tr = ctx.getTransform ? ctx.getTransform() : { a: 1, d: 1, e: 0, f: 0 };
      var pixel = P.render === 'pixel' || (P.render === 'auto' && ctx.imageSmoothingEnabled === false);
      var kx = pixel ? 1 : (Math.abs(tr.a) || 1), ky = pixel ? 1 : (Math.abs(tr.d) || 1);
      var k = (kx + ky) / 2, ox = pixel ? 0 : tr.e, oy = pixel ? 0 : tr.f;
      var pal = palFor(c), PC = pal._c, LC = lightCfg();
      c._px = pixel; var list = prims(c), Hh = norm(add(LC.k, V));
      var Sx = [1, 0, 0], Sy = norm(cross(V, Sx));
      // project prims to device px, depth along V
      var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (var i = 0; i < list.length; i++) {
        var q = list[i];
        if (q.t === 0) {
          var pc = proj(M, q.c); q.sx = (pc[0] - camX) * kx + ox; q.sy = (pc[1] - camY) * ky + oy;
          var A = q.A, B = [[0, 0, 0], [0, 0, 0]];
          for (var col = 0; col < 3; col++) { var pa = proj(M, A[col]); B[0][col] = pa[0] * kx; B[1][col] = pa[1] * ky; }
          var m00 = B[0][0] * B[0][0] + B[0][1] * B[0][1] + B[0][2] * B[0][2], m01 = B[0][0] * B[1][0] + B[0][1] * B[1][1] + B[0][2] * B[1][2], m11 = B[1][0] * B[1][0] + B[1][1] * B[1][1] + B[1][2] * B[1][2];
          var det = m00 * m11 - m01 * m01; if (!(det > 1e-9)) { q.skip = true; continue; }
          q.G = [m11 / det, -m01 / det, m00 / det]; q.B = B;
          // m = A^-1 V
          var Ai = inv3(A); if (!Ai) { q.skip = true; continue; }
          q.Ai = Ai; var mv = mat3v(Ai, V); q.m = mv; q.mlen = len(mv) || 1;
          q.w = [dot(A[0], V), dot(A[1], V), dot(A[2], V)];
          q.depth = dot(q.c, V) + q.bias * c.L;
          var ex = Math.sqrt(m00), ey = Math.sqrt(m11);
          q.bx0 = q.sx - ex - 2; q.bx1 = q.sx + ex + 2; q.by0 = q.sy - ey - 2; q.by1 = q.sy + ey + 2;
        } else {
          var a0 = proj(M, q.p0), a1 = proj(M, q.p1);
          q.x0 = (a0[0] - camX) * kx + ox; q.y0 = (a0[1] - camY) * ky + oy; q.x1 = (a1[0] - camX) * kx + ox; q.y1 = (a1[1] - camY) * ky + oy;
          q.R0 = q.r0 * k; q.R1 = q.r1 * k;
          if (pixel) { q.R0 = Math.max(q.R0, 0.6); q.R1 = Math.max(q.R1, 0.6); }
          q.d0 = dot(q.p0, V); q.d1 = dot(q.p1, V); q.depth = (q.d0 + q.d1) / 2 + q.bias * c.L;
          q.ax = norm(sub(q.p1, q.p0));
          var rr = Math.max(q.R0, q.R1) + 2;
          q.bx0 = Math.min(q.x0, q.x1) - rr; q.bx1 = Math.max(q.x0, q.x1) + rr; q.by0 = Math.min(q.y0, q.y1) - rr; q.by1 = Math.max(q.y0, q.y1) + rr;
        }
        if (q.bx0 < minX) minX = q.bx0; if (q.by0 < minY) minY = q.by0; if (q.bx1 > maxX) maxX = q.bx1; if (q.by1 > maxY) maxY = q.by1;
      }
      // ground shadow (screen ellipse at the ground under the body)
      var shadow = null;
      if (!c.air && !(opt && opt.shadow === false)) {
        var bc = c.segs ? null : bodyCentre(c);
        var gz0 = c.segs ? null : groundZ(c.anchor[0], c.anchor[1], c.bodyZ);
        if (bc && gz0 !== null) {
          var gp = proj(M, [bc[0], bc[1], gz0]);
          var rxS = (c.kind === 'crab' ? 0.62 : 0.72) * c.L * kx, ryS = (VIEW === 'side' ? 0.07 : 0.32) * c.L * ky;
          shadow = { x: (gp[0] - camX) * kx + ox, y: (gp[1] - camY) * ky + oy, rx: rxS, ry: Math.max(ryS, 1.2 * ky), a: 0.32 };
          minX = Math.min(minX, shadow.x - rxS - 2); maxX = Math.max(maxX, shadow.x + rxS + 2); maxY = Math.max(maxY, shadow.y + shadow.ry + 2);
        }
      }
      var cw = ctx.canvas ? ctx.canvas.width : 4096, chh = ctx.canvas ? ctx.canvas.height : 4096;
      var X0 = Math.floor(minX), Y0 = Math.floor(minY), X1 = Math.ceil(maxX), Y1 = Math.ceil(maxY);
      if (!pixel) { X0 = Math.max(X0, 0); Y0 = Math.max(Y0, 0); X1 = Math.min(X1, cw); Y1 = Math.min(Y1, chh); }
      var W = X1 - X0, H = Y1 - Y0;
      if (W <= 0 || H <= 0 || W * H > 4e6) return null;
      if (!ensure(W, H)) return null;
      var bf = buf; bf.fill(0, 0, W * H * 4);
      var ow = pixel ? 1 : Math.max(1, 0.85 * k) * P.outline;
      // shadow first
      if (shadow) {
        for (var yy = Math.max(0, Math.floor(shadow.y - shadow.ry - Y0)); yy < Math.min(H, Math.ceil(shadow.y + shadow.ry - Y0) + 1); yy++) {
          for (var xx = Math.max(0, Math.floor(shadow.x - shadow.rx - X0)); xx < Math.min(W, Math.ceil(shadow.x + shadow.rx - X0) + 1); xx++) {
            var dx = (xx + X0 + 0.5 - shadow.x) / shadow.rx, dy = (yy + Y0 + 0.5 - shadow.y) / shadow.ry, qq = dx * dx + dy * dy;
            if (qq >= 1) continue;
            var al = pixel ? (qq < 0.45 ? shadow.a * 1.15 : shadow.a * 0.7) : shadow.a * (1 - sstep(0.15, 1, qq));
            var o = (yy * W + xx) * 4; bf[o + 3] = al;
          }
        }
        if (VIEW === 'side' && typeof O.ground === 'function') {
          // only over real ground (no shadow hanging over a pit)
          for (var xs = 0; xs < W; xs++) {
            var wx = (xs + X0 + 0.5 - ox) / kx + camX, gy = safe(O.ground, wx, -c.bodyZ);
            var sy = gy == null ? 1e9 : (gy - camY) * ky + oy;
            if (Math.abs(sy - shadow.y) > 3 * ky) for (var ys = 0; ys < H; ys++) bf[(ys * W + xs) * 4 + 3] = 0;
          }
        }
      }
      list.sort(function (A2, B2) { return A2.depth - B2.depth; });
      // depth value: parts away from the camera are darker, near ones a touch lighter (legs on each side read as separate pairs)
      var dC = dot(c.segs ? [c.segs[0].p[0], c.segs[0].p[1], c.segs[0].z] : bodyCentre(c), V), dScale = (c.segs ? c.w * 1.6 : c.L * 0.8);
      for (var di = 0; di < list.length; di++) list[di].dv = clamp(1 + (list[di].depth - dC + (list[di].under ? 0.6 * c.L : 0)) / dScale * 0.32, list[di].under ? 0.8 : 0.62, 1.1);
      var Lk = LC.k, Rd = LC.r, rimC = pal._rim, rimK = 0.75 * P.rim, gloss = P.gloss, flash = c.flash;
      var fade = c.dying > 500 ? 1 - sstep(500, 900, c.dying) : 1;
      // side-view centipede: its legs are clipped to below the top edge of the armour plates (per column), so a lifted knee can
      // never show above the back; opt.legs === false leaves the legs out (checks/legclip.py compares both)
      var colTop = null;
      if (c.segs && VIEW === 'side') {
        colTop = new Float32Array(W); for (var ct = 0; ct < W; ct++) colTop[ct] = Infinity;
        for (var pc2 = 0; pc2 < list.length; pc2++) {
          var pl = list[pc2]; if (pl.skip || pl.t !== 0 || pl.mat !== 'plate') continue;
          var cx0 = Math.max(0, Math.floor(pl.bx0 - X0)), cx1 = Math.min(W, Math.ceil(pl.bx1 - X0)), cy0 = Math.max(0, Math.floor(pl.by0 - Y0)), cy1 = Math.min(H, Math.ceil(pl.by1 - Y0));
          for (var cxx = cx0; cxx < cx1; cxx++) for (var cyy = cy0; cyy < cy1; cyy++) {
            var rx2 = cxx + X0 + 0.5 - pl.sx, ry2 = cyy + Y0 + 0.5 - pl.sy, G2 = pl.G;
            if (rx2 * (G2[0] * rx2 + G2[1] * ry2) + ry2 * (G2[1] * rx2 + G2[2] * ry2) <= 1) { if (cyy < colTop[cxx]) colTop[cxx] = cyy; break; }
          }
        }
      }
      for (var pi = 0; pi < list.length; pi++) {
        var p = list[pi]; if (p.skip) continue;
        if (p.under && opt && opt.legs === false) continue;
        var ramp = PC[p.mat] || PC.body;
        var bx0 = Math.max(0, Math.floor(p.bx0 - X0)), bx1 = Math.min(W, Math.ceil(p.bx1 - X0)), by0 = Math.max(0, Math.floor(p.by0 - Y0)), by1 = Math.min(H, Math.ceil(p.by1 - Y0));
        var isEye = p.mat === 'eye', isGlint = p.mat === 'glint';
        for (var y = by0; y < by1; y++) {
          var py = y + Y0 + 0.5;
          for (var x = bx0; x < bx1; x++) {
            if (p.under && colTop && y < colTop[x] + (pixel ? 1 : 2)) continue;   // never above (or on) the plate's top edge
            var px = x + X0 + 0.5, sd, nx, ny, nz, s0 = 0, s1 = 0, s2 = 0, tpar = 0;
            if (p.t === 0) {
              var rx = px - p.sx, ry = py - p.sy, G = p.G;
              var gx = G[0] * rx + G[1] * ry, gy2 = G[1] * rx + G[2] * ry, qv = rx * gx + ry * gy2;
              if (qv > 2.6) continue;
              var sq = Math.sqrt(qv), gl = Math.sqrt(gx * gx + gy2 * gy2) || 1e-6;
              sd = (sq - 1) * sq / gl;
              if (sd > 0.6) continue;
              var Bm = p.B;
              var sp0 = Bm[0][0] * gx + Bm[1][0] * gy2, sp1 = Bm[0][1] * gx + Bm[1][1] * gy2, sp2 = Bm[0][2] * gx + Bm[1][2] * gy2;
              var lam = Math.sqrt(Math.max(0, 1 - Math.min(qv, 1))) / p.mlen;
              s0 = sp0 + lam * p.m[0]; s1 = sp1 + lam * p.m[1]; s2 = sp2 + lam * p.m[2];
              var sl = Math.sqrt(s0 * s0 + s1 * s1 + s2 * s2) || 1; s0 /= sl; s1 /= sl; s2 /= sl;
              var Ai = p.Ai; // normal = A^-T s
              nx = Ai[0][0] * s0 + Ai[1][0] * s1 + Ai[2][0] * s2; ny = Ai[0][1] * s0 + Ai[1][1] * s1 + Ai[2][1] * s2; nz = Ai[0][2] * s0 + Ai[1][2] * s1 + Ai[2][2] * s2;
            } else {
              var ux = p.x1 - p.x0, uy = p.y1 - p.y0, ll = ux * ux + uy * uy || 1e-9;
              var t = ((px - p.x0) * ux + (py - p.y0) * uy) / ll; t = t < 0 ? 0 : t > 1 ? 1 : t;
              var cx = p.x0 + ux * t, cy3 = p.y0 + uy * t, r = p.R0 + (p.R1 - p.R0) * t;
              var ddx = px - cx, ddy = py - cy3, dd = Math.sqrt(ddx * ddx + ddy * ddy);
              sd = dd - r; if (sd > 0.6) continue;
              var ex2 = ddx / (r || 1), ey2 = ddy / (r || 1), e2 = Math.min(1, ex2 * ex2 + ey2 * ey2), ez = Math.sqrt(1 - e2);
              nx = ex2 * Sx[0] + ey2 * Sy[0] + ez * V[0]; ny = ex2 * Sx[1] + ey2 * Sy[1] + ez * V[1]; nz = ex2 * Sx[2] + ey2 * Sy[2] + ez * V[2];
              if (t > 0 && t < 1) { var ad = nx * p.ax[0] + ny * p.ax[1] + nz * p.ax[2]; nx -= ad * p.ax[0]; ny -= ad * p.ax[1]; nz -= ad * p.ax[2]; }
              tpar = t; s0 = ex2;
            }
            var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
            var cov = pixel ? (sd < 0 ? 1 : 0) : clamp(0.5 - sd, 0, 1);
            if (cov <= 0) continue;
            // light
            var dl2 = nx * Lk[0] + ny * Lk[1] + nz * Lk[2];
            var lum = (0.16 + 0.84 * clamp((dl2 + 0.35) / 1.35, 0, 1)) * p.dv;
            var nv = nx * V[0] + ny * V[1] + nz * V[2];
            var rim = Math.pow(1 - clamp(nv, 0, 1), 2.6) * clamp(nx * Rd[0] + ny * Rd[1] + nz * Rd[2] + 0.35, 0, 1) * rimK;
            var hv = clamp(nx * Hh[0] + ny * Hh[1] + nz * Hh[2], 0, 1);
            var spec = Math.pow(hv, isEye ? 60 : 34) * gloss * (isEye ? 1.6 : p.mat === 'body' || p.mat === 'shell' || p.mat === 'plate' ? 0.42 : 0.3);
            // pattern: 0 none, 1 spider abdomen (chevrons), 2 head stripe, 3 leg bands, 4 shell speckle, 5 claw palm, 6 finger tip, 7/8 plates
            var mark = 0;
            if (p.pat === 1) {
              // folium: a darker wavy band down the back with paired light chevrons, a pale belly
              var band = 0.34 + 0.08 * Math.sin(s0 * 13);
              if (s2 > 0.15 && Math.abs(s1) < band) { lum *= 0.7; var ch = s0 * 3.4 + Math.abs(s1) * 2.6, fr2 = ch - Math.floor(ch); if (fr2 < 0.22 && Math.abs(s1) > 0.06) mark = 1; }
              if (s2 < -0.35) lum = lum * 0.8 + 0.12;
              // dark oblique bands down the flanks (read from the side)
              if (Math.abs(s1) > 0.35 && s2 > -0.3) { var fb = s0 * 3.6 + s2 * 1.6, fr4 = fb - Math.floor(fb); if (fr4 < 0.28) lum *= 0.68; }
            }
            else if (p.pat === 2) { var ang2 = Math.atan2(s1, s0) * 8 / TAU, fr3 = ang2 - Math.floor(ang2); if (s2 > 0.25 && (fr3 < 0.1 || fr3 > 0.9)) lum *= 0.72; if (s2 > 0.88) lum *= 0.7; if (s2 > 0.45 && s0 > 0.55 && Math.abs(s1) < 0.2) mark = 0.5; }
            else if (p.pat === 3) { var bd = tpar * 2.0; if (bd - Math.floor(bd) > 0.72) mark = 1; }
            else if (p.pat === 4) {
              // shell: transverse ridges (lit crest, dark groove), sparse speckles, a darker rim
              var rg = Math.sin(s0 * 10 + Math.abs(s1) * 3);
              if (s2 > 0.3) { if (rg > 0.75) lum = Math.min(1, lum * 1.18); else if (rg < -0.85) lum *= 0.72; }
              var hn = ((Math.sin(s0 * 41.3 + s1 * 17.1) * 43758.5) % 1 + 1) % 1; if (s2 > 0.35 && hn > 0.93) mark = 0.6;
              if (s2 < 0.25) lum *= 0.85;
            }
            else if (p.pat === 5) { if (s0 > 0.55) mark = 0.5; }
            else if (p.pat === 6) { if (tpar > 0.55) mark = 1; }
            else if (p.pat === 7 || p.pat === 8) {
              // overlapping plates: a lit front lip, a shadowed back edge under the next plate, a dorsal ridge line
              if (s0 > 0.55) lum = Math.min(1, lum * 1.22); else if (s0 < -0.55) lum *= 0.58;
              if (s2 > 0.55 && Math.abs(s1) < 0.08) mark = 0.7; if (Math.abs(s1) > 0.85) lum *= 0.82;
            }
            var col;
            if (isGlint) col = [1, 1, 1];
            else if (pixel) {
              var idx = lum < 0.3 ? 1 : lum < 0.55 ? 2 : lum < 0.8 ? 3 : 3.6;
              col = idx === 3.6 ? mixc(ramp[3], ramp[4], 0.0) : ramp[idx | 0];
              if (idx === 3.6) col = ramp[3];
              if (mark >= 0.5) col = mixc(col, ramp[5], 0.85);
              if (spec > 0.5) col = ramp[4];
              else if (rim > 0.42) col = mixc(col, rimC, 0.75);
              var thin = p.t === 1 && Math.max(p.R0, p.R1) < 1.6;
              if (thin) col = lum < 0.45 ? ramp[2] : ramp[3];
              else if (sd > -1) col = ramp[0];
              if (isEye && spec <= 0.5) col = ramp[1];
            } else {
              var base = lum < 0.5 ? mixc(ramp[1], ramp[2], lum / 0.5) : mixc(ramp[2], ramp[3], (lum - 0.5) / 0.5);
              if (mark > 0) base = mixc(base, mixc(ramp[5], ramp[5].map(function (v) { return v * lum * 1.2; }), 0.5), mark * 0.85);
              col = [base[0] + spec * ramp[4][0] + rim * rimC[0], base[1] + spec * ramp[4][1] + rim * rimC[1], base[2] + spec * ramp[4][2] + rim * rimC[2]];
              var edge = sstep(-ow - 0.8, -ow + 0.6, sd);
              col = mixc(col, ramp[0], edge * 0.92);
            }
            if (flash > 0) col = mixc(col, [1, 1, 1], flash * 0.85);
            var o2 = (y * W + x) * 4, aa = cov * fade, ia = 1 - aa;
            bf[o2] = bf[o2] * ia + col[0] * aa; bf[o2 + 1] = bf[o2 + 1] * ia + col[1] * aa; bf[o2 + 2] = bf[o2 + 2] * ia + col[2] * aa; bf[o2 + 3] = bf[o2 + 3] * ia + aa;
          }
        }
      }
      // pixel: a 1 px dark outline round the whole silhouette (selective: the creature's darkest body tone)
      if (pixel) {
        var oc = (PC.body || PC.shell)[0], obuf = new Uint8Array(W * H);
        for (var yo = 0; yo < H; yo++) for (var xo = 0; xo < W; xo++) {
          if (bf[(yo * W + xo) * 4 + 3] > 0.5) continue;
          var nb2 = (xo > 0 && bf[(yo * W + xo - 1) * 4 + 3] > 0.5 && bf[(yo * W + xo - 1) * 4] + bf[(yo * W + xo - 1) * 4 + 1] > 0) || (xo < W - 1 && bf[(yo * W + xo + 1) * 4 + 3] > 0.5) || (yo > 0 && bf[((yo - 1) * W + xo) * 4 + 3] > 0.5) || (yo < H - 1 && bf[((yo + 1) * W + xo) * 4 + 3] > 0.5);
          if (nb2) obuf[yo * W + xo] = 1;
        }
        for (var oi2 = 0; oi2 < W * H; oi2++) if (obuf[oi2]) { var q4 = oi2 * 4, ba = bf[q4 + 3]; bf[q4] = oc[0] * fade + bf[q4] * (1 - fade); bf[q4 + 1] = oc[1] * fade + bf[q4 + 1] * (1 - fade); bf[q4 + 2] = oc[2] * fade + bf[q4 + 2] * (1 - fade); bf[q4 + 3] = Math.max(ba, fade); }
      }
      // to the image (un-premultiply)
      var D = img.data, IW = imgW;
      for (var yi = 0; yi < H; yi++) for (var xi = 0; xi < W; xi++) {
        var oi = (yi * W + xi) * 4, a4 = bf[oi + 3], od = (yi * IW + xi) * 4;
        if (a4 <= 0.002) { D[od + 3] = 0; continue; }
        D[od] = clamp(bf[oi] / a4 * 255, 0, 255); D[od + 1] = clamp(bf[oi + 1] / a4 * 255, 0, 255); D[od + 2] = clamp(bf[oi + 2] / a4 * 255, 0, 255); D[od + 3] = clamp(a4 * 255, 0, 255);
      }
      sctx.putImageData(img, 0, 0, 0, 0, W, H);
      ctx.save();
      if (pixel) { ctx.imageSmoothingEnabled = false; ctx.translate(-camX, -camY); ctx.drawImage(scratch, 0, 0, W, H, X0 + camX, Y0 + camY, W, H); }
      else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(scratch, 0, 0, W, H, X0, Y0, W, H); }
      ctx.restore();
      return { x: X0, y: Y0, w: W, h: H, pixel: pixel, k: k };
    }
    function inv3(A) {
      // A given as 3 column vectors
      var a = A[0][0], b = A[1][0], c = A[2][0], d = A[0][1], e = A[1][1], f = A[2][1], g = A[0][2], h = A[1][2], i = A[2][2];
      var det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
      if (Math.abs(det) < 1e-12) return null;
      var id = 1 / det;
      // returns rows of the inverse: R[r][c]
      return [[(e * i - f * h) * id, (c * h - b * i) * id, (b * f - c * e) * id], [(f * g - d * i) * id, (a * i - c * g) * id, (c * d - a * f) * id], [(d * h - e * g) * id, (b * g - a * h) * id, (a * e - b * d) * id]];
    }
    function mat3v(R, v) { return [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]]; }

    function drawDust(ctx, camX, camY, only) {
      var M = projM(), pixel = P.render === 'pixel' || (P.render === 'auto' && ctx.imageSmoothingEnabled === false);
      ctx.save();
      for (var i = 0; i < DUST.length; i++) {
        var d = DUST[i]; if (!d.on) continue;
        var pal = PALETTES[d.col || (P.palette !== 'auto' ? P.palette : 'forest')] || PALETTES.forest; palFor({ pal: d.col, kind: 'spider' });
        var pp = proj(M, d.p), x = pp[0] - camX, y = pp[1] - camY, life = d.age / d.life, a = (1 - life) * 0.55;
        var col = pal._dust || hex(pal.dust);
        ctx.fillStyle = 'rgb(' + (col[0] * 255 | 0) + ',' + (col[1] * 255 | 0) + ',' + (col[2] * 255 | 0) + ')';
        if (pixel) { ctx.globalAlpha = a > 0.3 ? 0.8 : 0.45; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
        else { ctx.globalAlpha = a * 0.7; var r = d.r * (1 + life * 1.2); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }

    var LAST = {};
    function drawOne(ctx, id, camX, camY, opt) {
      var c = C[String(id)]; if (!c || !ctx) return;
      try { var r = rasterCreature(ctx, c, num(camX, 0), num(camY, 0), opt); LAST[c.id] = r; if (r) S.drawn++; }
      catch (e) { S.drawErrors++; }
    }
    function draw(ctx, camX, camY) {
      if (!ctx) return;
      S.draws++;
      var ids = ORDER.slice();
      ids.sort(function (a, b) { var A = C[a], B = C[b]; return A.anchor[1] - B.anchor[1] || A.anchor[0] - B.anchor[0]; });
      for (var i = 0; i < ids.length; i++) drawOne(ctx, ids[i], camX, camY);
      try { drawDust(ctx, num(camX, 0), num(camY, 0)); } catch (e) { S.drawErrors++; }
    }

    /* ---------- queries */
    function legInfo(c) {
      return c.legs.map(function (lg, i) {
        return { i: i, side: lg.d.side, idx: lg.d.idx, grp: lg.d.grp, planted: lg.planted, swing: !!lg.sw, noFoot: !!lg.noFoot, foot: lg.foot.slice(), knee: lg.knee && lg.knee.slice(), hip: lg.hip && lg.hip.slice(), ankle: lg.ankle && lg.ankle.slice(),
          fem: lg.fem * (c.segs ? c.w : c.L), tib: lg.tib * (c.segs ? c.w : c.L), stretch: lg.stretch, nb: c.nb[i].slice() };
      });
    }
    function info(id) {
      var c = C[String(id)]; if (!c) return null;
      var F = c.segs ? null : frame(c), w = toWorld([c.anchor[0], c.anchor[1], c.bodyZ]);
      var face = c.kind === 'crab' && VIEW === 'side' ? 'front' : (Math.cos(c.heading) >= 0 ? 'right' : 'left');
      return { id: c.id, kind: c.kind, L: c.L, x: c.anchor[0], y: VIEW === 'side' ? -c.anchor[2] : c.anchor[1], bodyZ: c.bodyZ, heading: c.heading, headYaw: c.headYaw, headPitch: c.headPitch,
        headYawT: c.headYawT, headPitchT: c.headPitchT, facing: face, mode: c.mode, air: c.air, dying: c.dying, speed: c.speed, vel: c.vel.slice(), idle: c.idle, pitch: c.pitch,
        target: c.target && c.target.slice(), legs: legInfo(c), segs: c.segs ? c.segs.map(function (s) { return { p: s.p.slice(), f: s.f.slice(), z: s.z }; }) : null };
    }
    function boxes() {
      var out = [];
      for (var i = 0; i < ORDER.length; i++) {
        var c = C[ORDER[i]], M = projM(), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        var pts = [[c.anchor[0], c.anchor[1], c.bodyZ]];
        c.legs.forEach(function (l) { if (l.knee) pts.push(l.knee); pts.push(l.foot); });
        if (c.segs) c.segs.forEach(function (s) { pts.push([s.p[0], s.p[1], s.z]); });
        pts.forEach(function (p) { var q = proj(M, p); x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
        out.push({ id: c.id, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
      return out;
    }
    function hash() {
      var h = 2166136261;
      function mixN(v) { v = Math.round(v * 1000) | 0; h ^= v; h = Math.imul(h, 16777619); }
      for (var i = 0; i < ORDER.length; i++) {
        var c = C[ORDER[i]]; mixN(c.anchor[0]); mixN(c.anchor[1]); mixN(c.bodyZ); mixN(c.heading); mixN(c.headYaw);
        for (var j = 0; j < c.legs.length; j++) { var f = c.legs[j].foot; mixN(f[0]); mixN(f[1]); mixN(f[2]); mixN(c.legs[j].planted ? 1 : 0); }
      }
      return (h >>> 0).toString(16);
    }

    var api = {
      version: VERSION,
      update: update, draw: draw, drawOne: drawOne,
      creature: info, list: function () { return ORDER.map(info); }, ids: function () { return ORDER.slice(); },
      boxes: boxes, lastDrawn: function () { return Object.assign({}, LAST); },
      clear: function () { C = {}; ORDER = []; EVENTS.length = 0; for (var i = 0; i < DUST.length; i++) DUST[i].on = false; },
      setParams: function (o) { setParams(o || {}); }, params: function () { return Object.assign({}, P); },
      stats: function () { var s = Object.assign({}, S); s.alive = ORDER.length; s.dust = DUST.filter(function (d) { return d.on; }).length; return s; },
      events: function () { return EVENTS.slice(); }, hash: hash, view: VIEW, time: function () { return T; },
      _ground: groundZ, _toInt: toInt
    };
    return api;
  }

  root.GameDNA_IKCreatures = { create: create, version: VERSION, kinds: Object.keys(KINDS), palettes: Object.keys(PALETTES), defaults: DEFAULTS,
    _canvasFactory: function (f) { canvasFactory = f; } };
})(typeof window !== 'undefined' ? window : this);
