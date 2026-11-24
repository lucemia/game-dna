/* vision-cones.js - Game DNA B-15 Stealth vision cones (module v1.1.0)
 *
 * One plain script, no dependencies, no import/export. Defines one global: GameDNA_VisionCones.
 * Guards see through view cones clipped by walls (a ray-cast visibility polygon); each guard has a
 * suspicion meter that rises faster when the player is close to it and near the centre of its cone,
 * and decays after the player leaves its sight; '?' then '!' marks over its head; hiding spots (tall
 * grass, shadows) shorten or block its sight; patrol routes with look-around turns; and alert hooks
 * (onAlert, onState, call for help, noise) for the game to act on.
 *
 * Deterministic: everything advances in update(dtMs); no Math.random, no wall clock. The game keeps
 * its own rules: the module only reads the player's point, the walls and the hiding spots, and tells
 * the game when a guard turns suspicious, alerts or loses the player. Source is ASCII only.
 *
 * Angles are radians, 0 = right (+x), PI/2 = down (+y, canvas). fov is given in degrees.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0';
  var TAU = Math.PI * 2, D2R = Math.PI / 180;

  var DEFAULTS = {
    range: 150,        // sight distance, px at scale 1
    fov: 80,           // cone width, degrees
    near: 0,           // all-round sense radius as a fraction of range (0 = off), still needs a clear line
    react: 900,        // ms to fill the meter at mid range in the cone centre
    closeBoost: 1.8,   // rate multiplier right at the guard (falls to 0.55 at the cone edge of range)
    hold: 700,         // ms after losing sight before a suspicious meter starts to fall
    decay: 2600,       // ms for a full meter to fall to zero (suspicious)
    alertHold: 3200,   // ms an alerted guard keeps its alert after losing the player, then searches
    search: 5000,      // ms a full meter takes to fall while searching
    shadow: 0.5,       // default cover of a 'shadow' hiding spot (sight shortened to 50 %)
    turnSpeed: 240,    // degrees / s a guard turns its look
    sweep: 55,         // degrees each side of the base direction when looking around
    lookHold: 1100,    // ms between look-around turns
    speed: 40,         // patrol walk speed, px / s at scale 1 (module-driven guards)
    investigate: 0.35, // module-driven guards walk to the last seen point above this suspicion
    callRadius: 170,   // px at scale 1: an alerted guard calls guards this close
    opacity: 1,        // cone fill strength 0..2
    palette: 'lamp',   // lamp | cool | mono | skin
    render: 'auto',    // auto | pixel | smooth
    marks: 'on',       // on | off: '?' / '!' over the head
    rays: 0            // rays across the cone (0 = auto: one per 2 degrees, plus one each side of every wall corner)
  };
  var PALETTES = {
    lamp: { calm: [255, 234, 168], suspicious: [255, 196, 58], alert: [255, 62, 46], search: [255, 138, 42] },
    cool: { calm: [178, 224, 255], suspicious: [255, 206, 80], alert: [255, 70, 90], search: [255, 150, 70] },
    mono: { calm: [236, 236, 244], suspicious: [255, 222, 120], alert: [255, 92, 80], search: [255, 172, 110] }
  };
  var INK = [26, 16, 36], CREAM = [248, 240, 220];

  function num(v, d) { if (v == null || v === '') return d; v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrap(a) { a = a % TAU; if (a > Math.PI) a -= TAU; if (a <= -Math.PI) a += TAU; return a; }
  function adiff(a, b) { return Math.abs(wrap(a - b)); }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + clamp(a, 0, 1).toFixed(3) + ')'; }
  function parseCol(c) {
    if (Array.isArray(c) && c.length >= 3) return [c[0] | 0, c[1] | 0, c[2] | 0];
    if (typeof c !== 'string') return null;
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
    if (!m) return null;
    var h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16); return [n >> 16, (n >> 8) & 255, n & 255];
  }

  /* ------------------------------------------------------------------ walls: one ray caster for three shapes */
  // walls: {tile, cols, rows, x, y, solidTile(c, r)}  grid (exact DDA)
  //        {rects: [{x, y, w, h}] | () => [...]}      boxes (exact slab test)
  //        {solidAt(x, y), step}                       any point test (march + bisect), also the top-level option solid(x, y)
  function makeWalls(o, S) {
    var W = o.walls || {}, ptFn = typeof W.solidAt === 'function' ? W.solidAt : typeof o.solid === 'function' ? o.solid : null;
    var gridFn = typeof W.solidTile === 'function' ? W.solidTile : null, rectsOpt = W.rects;
    var T = Math.max(1, num(W.tile, 16)), ox = num(W.x, 0), oy = num(W.y, 0);
    var cols = W.cols == null ? null : num(W.cols, null), rows = W.rows == null ? null : num(W.rows, null);
    var step = Math.max(0.5, num(W.step, 2));
    var kind = gridFn ? 'grid' : rectsOpt ? 'rects' : ptFn ? 'point' : 'none';
    function tileSolid(c, r) {
      if (cols != null && (c < 0 || c >= cols)) return true;
      if (rows != null && (r < 0 || r >= rows)) return true;
      try { return !!gridFn(c, r); } catch (e) { S.wallErrors++; return false; }
    }
    function rectList() {
      var L = rectsOpt;
      if (typeof L === 'function') { try { L = L(); } catch (e) { S.wallErrors++; L = null; } }
      return Array.isArray(L) ? L : [];
    }
    function ptSolid(x, y) { try { return !!ptFn(x, y); } catch (e) { S.wallErrors++; return false; } }
    function rayGrid(x, y, dx, dy, max) {
      var gx = x - ox, gy = y - oy, c = Math.floor(gx / T), r = Math.floor(gy / T);
      var sc = dx > 0 ? 1 : -1, sr = dy > 0 ? 1 : -1, adx = Math.abs(dx), ady = Math.abs(dy);
      var tx = adx < 1e-12 ? Infinity : (dx > 0 ? (c + 1) * T - gx : gx - c * T) / adx;
      var ty = ady < 1e-12 ? Infinity : (dy > 0 ? (r + 1) * T - gy : gy - r * T) / ady;
      var ddx = adx < 1e-12 ? Infinity : T / adx, ddy = ady < 1e-12 ? Infinity : T / ady, t = 0;
      for (var i = 0; i < 100000; i++) {
        if (tx < ty) { t = tx; c += sc; tx += ddx; } else { t = ty; r += sr; ty += ddy; }
        if (t >= max) return max;
        if (tileSolid(c, r)) return t;
      }
      return max;
    }
    function rayRects(x, y, dx, dy, max) {
      var L = rectList(), best = max;
      for (var i = 0; i < L.length; i++) {
        var R = L[i]; if (!R) continue;
        var x0 = num(R.x, 0), y0 = num(R.y, 0), x1 = x0 + num(R.w, 0), y1 = y0 + num(R.h, 0);
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;   // the guard stands in it: ignore
        var tmin = 0, tmax = best, a, b, s;
        if (Math.abs(dx) < 1e-12) { if (x < x0 || x > x1) continue; }
        else { a = (x0 - x) / dx; b = (x1 - x) / dx; if (a > b) { s = a; a = b; b = s; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
        if (Math.abs(dy) < 1e-12) { if (y < y0 || y > y1) continue; }
        else { a = (y0 - y) / dy; b = (y1 - y) / dy; if (a > b) { s = a; a = b; b = s; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
        if (tmin <= tmax && tmin < best) best = tmin;
      }
      return best;
    }
    function rayPoint(x, y, dx, dy, max) {
      var t = 0, started = !ptSolid(x, y), prev = 0;
      while (t < max) {
        prev = t; t = Math.min(max, t + step);
        var hit = ptSolid(x + dx * t, y + dy * t);
        if (!started) { if (!hit) started = true; continue; }
        if (hit) {
          var lo = prev, hi = t;
          for (var k = 0; k < 7; k++) { var m = (lo + hi) / 2; if (ptSolid(x + dx * m, y + dy * m)) hi = m; else lo = m; }
          return hi;
        }
      }
      return max;
    }
    return {
      kind: kind,
      ray: function (x, y, a, max) {
        S.rays++;
        var dx = Math.cos(a), dy = Math.sin(a);
        if (kind === 'grid') return rayGrid(x, y, dx, dy, max);
        if (kind === 'rects') return rayRects(x, y, dx, dy, max);
        if (kind === 'point') return rayPoint(x, y, dx, dy, max);
        return max;
      },
      blocked: function (x, y) {
        if (kind === 'grid') return tileSolid(Math.floor((x - ox) / T), Math.floor((y - oy) / T));
        if (kind === 'rects') { var L = rectList(); for (var i = 0; i < L.length; i++) { var R = L[i]; if (R && x >= R.x && x <= R.x + R.w && y >= R.y && y <= R.y + R.h) return true; } return false; }
        if (kind === 'point') return ptSolid(x, y);
        return false;
      },
      // wall corners near (x, y): extra rays one hair each side of every corner give a cone with crisp wall edges
      corners: function (x, y, R, out) {
        if (kind === 'grid') {
          var c0 = Math.floor((x - R - ox) / T), c1 = Math.floor((x + R - ox) / T), r0 = Math.floor((y - R - oy) / T), r1 = Math.floor((y + R - oy) / T);
          if ((c1 - c0 + 1) * (r1 - r0 + 1) > 6000) return;
          for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) {
            if (!tileSolid(c, r)) continue;
            var L = tileSolid(c - 1, r), Rt = tileSolid(c + 1, r), U = tileSolid(c, r - 1), D = tileSolid(c, r + 1);
            if (L && Rt && U && D) continue;
            var X0 = ox + c * T, Y0 = oy + r * T;
            out.push(X0, Y0, X0 + T, Y0, X0, Y0 + T, X0 + T, Y0 + T);
          }
        } else if (kind === 'rects') {
          var Ls = rectList();
          for (var i = 0; i < Ls.length; i++) { var B = Ls[i]; if (!B) continue; out.push(B.x, B.y, B.x + B.w, B.y, B.x, B.y + B.h, B.x + B.w, B.y + B.h); }
        }
      }
    };
  }

  /* ------------------------------------------------------------------ glyphs for the pixel marks (2 px strokes) */
  var GLYPH = {
    '?': ['.###.', '##.##', '...##', '..##.', '..##.', '.....', '..##.', '..##.'],
    '!': ['##', '##', '##', '##', '##', '..', '##', '##']
  };

  function create(o) {
    o = o || {};
    var S = { updates: 0, frozenUpdates: 0, draws: 0, polys: 0, rays: 0, seenSteps: 0, alerts: 0, calls: 0, noises: 0, stateChanges: 0,
      cbErrors: 0, sourceErrors: 0, wallErrors: 0, playerErrors: 0, badInput: 0, drawErrors: 0, guards: 0, active: 0, drawn: 0 };
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    function setParams(p) {
      if (!p || typeof p !== 'object') return;
      for (var key in p) {
        if (!(key in DEFAULTS)) continue;
        var d = DEFAULTS[key];
        if (typeof d === 'number') P[key] = num(p[key], P[key]);
        else if (p[key] != null && p[key] !== '') P[key] = String(p[key]);
      }
      P.range = Math.max(1, P.range); P.fov = clamp(P.fov, 1, 360); P.react = Math.max(30, P.react); P.decay = Math.max(30, P.decay);
      P.search = Math.max(30, P.search); P.turnSpeed = Math.max(1, P.turnSpeed); P.lookHold = Math.max(50, P.lookHold);
      P.near = clamp(P.near, 0, 1); P.shadow = clamp(P.shadow, 0, 1); P.opacity = clamp(P.opacity, 0, 2); P.rays = clamp(Math.round(P.rays), 0, 720);
      P.hold = Math.max(0, P.hold); P.alertHold = Math.max(0, P.alertHold);
    }
    setParams(o.params || {});

    var SK = null, skinPal = null, skinPixel = false;
    try { SK = (o.skin == null || o.skin === false || !root.GameDNA_Skin) ? null : root.GameDNA_Skin.resolve(o.skin); } catch (e) { SK = null; }
    if (SK) {
      skinPixel = !!(SK.pixel || (SK.motion && SK.motion.snap));
      try {
        var fx = (SK.palette && SK.palette.fx) || {}, look = function (v) { if (typeof v === 'string' && SK.lookup) { try { var r = SK.lookup(v); if (typeof r === 'string') return r; } catch (e) { } } return v; };
        var hot = parseCol(look(fx.hot)), cold = parseCol(look(fx.cold));
        if (hot && cold) skinPal = { calm: cold, suspicious: [255, 206, 80], alert: hot, search: [Math.round((hot[0] + 255) / 2), Math.round((hot[1] + 160) / 2), Math.round((hot[2] + 60) / 2)] };
      } catch (e) { skinPal = null; }
    }
    // shade zones the game draws (optional): inside the cone the reach beyond range x (1 - cover) is dimmed and a reach line drawn
    function shadeList() {
      var L = o.shade;
      if (typeof L === 'function') { try { L = L(); } catch (e) { S.cbErrors++; L = null; } }
      if (!Array.isArray(L)) return [];
      var out = [];
      for (var i = 0; i < L.length; i++) { var r = L[i]; if (r && isFinite(r.x) && isFinite(r.y) && r.w > 0 && r.h > 0) out.push({ x: +r.x, y: +r.y, w: +r.w, h: +r.h, cover: clamp(num(r.cover, P.shadow), 0, 1) }); }
      return out;
    }
    function shadeAt(L, x, y) { for (var i = 0; i < L.length; i++) { var r = L[i]; if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.cover; } return 0; }
    function pal() { return P.palette === 'skin' && skinPal ? skinPal : PALETTES[P.palette] || PALETTES.lamp; }

    function scale() {
      var s = o.scale;
      if (typeof s === 'function') { try { s = s(); } catch (e) { S.cbErrors++; s = 1; } }
      s = num(s, 1); return s > 0 ? s : 1;
    }
    var walls = makeWalls(o, S), wallsVersion = 0;
    var guards = [], byId = {}, events = [], t = 0, seq = 0;
    var player = null, cover = 0;

    function call(fn, arg) { if (typeof fn !== 'function') return undefined; try { return fn(arg); } catch (e) { S.cbErrors++; return undefined; } }
    function readPlayer() {
      if (typeof o.player !== 'function') return null;
      var p; try { p = o.player(); } catch (e) { S.playerErrors++; return null; }
      if (!p || !isFinite(p.x) || !isFinite(p.y)) return null;
      if (typeof o.canSee === 'function') { var c; try { c = o.canSee(); } catch (e) { S.cbErrors++; c = true; } if (c === false) return null; }
      return { x: +p.x, y: +p.y };
    }
    function readCover(x, y) {
      if (typeof o.hidden !== 'function') return 0;
      var c; try { c = o.hidden(x, y); } catch (e) { S.cbErrors++; return 0; }
      if (c === true) return 1; if (c === 'shadow') return P.shadow; if (c === 'grass' || c === 'full') return 1;
      return clamp(num(c, 0), 0, 1);
    }

    /* ---------------------------------------------------------------- guards */
    function add(id, spec) {
      if (id == null) { S.badInput++; return null; }
      spec = spec || {};
      var old = byId[id]; if (old) guards.splice(guards.indexOf(old), 1);
      var route = Array.isArray(spec.patrol) ? spec.patrol.filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); }).map(function (p) {
        var lk = p.look == null ? null : Array.isArray(p.look) ? p.look.filter(isFinite).map(Number) : isFinite(p.look) ? [+p.look] : null;
        return { x: +p.x, y: +p.y, wait: Math.max(0, num(p.wait, 0)), look: lk && lk.length ? lk : null };
      }) : [];
      var g = { id: id, src: typeof spec.source === 'function' ? spec.source : null, lookFn: typeof spec.look === 'function' ? spec.look : null,
        route: route, ri: 0, waitT: 0, home: null, range: spec.range == null ? null : Math.max(1, num(spec.range, P.range)),
        fov: spec.fov == null ? null : clamp(num(spec.fov, P.fov), 1, 360), eye: num(spec.eye, 26), speed: spec.speed == null ? null : Math.max(0, num(spec.speed, P.speed)),
        x: num(spec.x, route.length ? route[0].x : 0), y: num(spec.y, route.length ? route[0].y : 0), px: 0, py: 0, vx: 0, vy: 0,
        look: wrap(num(spec.face, Math.PI / 2)), base: 0, want: 0, still: 0, lookI: 0, lookT: 0, lookSeq: null,
        s: 0, state: 'calm', stateT: 0, seen: false, inCone: false, los: false, cover: 0, dist: Infinity, off: 0, lostT: 0, last: null,
        called: false, active: true, side: 'right', dir4: 'down', poly: null, polyKey: '', polyAge: 0, ras: null, rasKey: '', moved: false, mode: 'calm' };
      g.base = g.look; g.want = g.look; g.face0 = g.look;
      if (g.src) { var p0 = srcPos(g); if (p0) { g.x = p0.x; g.y = p0.y; } else g.active = false; }
      g.px = g.x; g.py = g.y; g.home = { x: g.x, y: g.y };
      setFacing(g, true);
      guards.push(g); byId[id] = g; S.guards = guards.length;
      return id;
    }
    function srcPos(g) {
      var p; try { p = g.src(); } catch (e) { S.sourceErrors++; return null; }
      if (!p || !isFinite(p.x) || !isFinite(p.y)) return null;
      return { x: +p.x, y: +p.y };
    }
    function remove(id) { var g = byId[id]; if (!g) return false; guards.splice(guards.indexOf(g), 1); delete byId[id]; S.guards = guards.length; return true; }
    function R(g) { return (g.range != null ? g.range : P.range) * scale(); }
    function F(g) { return (g.fov != null ? g.fov : P.fov) * D2R; }
    function setFacing(g, force) {
      var c = Math.cos(g.look), s = Math.sin(g.look);
      if (force || Math.abs(c) > 0.2) g.side = c >= 0 ? 'right' : 'left';
      // 4 directions with 8 degrees of hysteresis, so a guard looking around near a diagonal never flickers
      var a = g.look, cand = Math.abs(c) >= Math.abs(s) ? (c >= 0 ? 'right' : 'left') : (s >= 0 ? 'down' : 'up');
      if (force || g.dir4 !== cand) {
        var centre = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[g.dir4];
        if (force || adiff(a, centre) > Math.PI / 4 + 8 * D2R) g.dir4 = cand;
      }
    }
    function setState(g, to, why) {
      if (g.state === to) return;
      var from = g.state; g.state = to; g.stateT = 0; S.stateChanges++;
      var ev = { type: 'state', id: g.id, from: from, to: to, why: why || '', suspicion: g.s, x: g.x, y: g.y, last: g.last ? { x: g.last.x, y: g.last.y } : null, t: t, seq: ++seq };
      events.push(ev);
      if (to === 'alert') { S.alerts++; events.push({ type: 'alert', id: g.id, by: why || 'sight', x: g.x, y: g.y, last: ev.last, t: t, seq: ++seq }); }
      if (from === 'alert' && to === 'search') events.push({ type: 'lost', id: g.id, last: ev.last, t: t, seq: ++seq });
    }
    function raise(id, amount, at, why) {
      var g = byId[id]; if (!g || !g.active) return false;
      amount = clamp(num(amount, 0.5), 0, 1);
      if (at && isFinite(at.x) && isFinite(at.y)) g.last = { x: +at.x, y: +at.y };
      if (g.state === 'alert') return true;
      g.s = Math.max(g.s, amount); g.lostT = 0;
      if (g.s >= 1) { g.s = 1; setState(g, 'alert', why || 'raise'); }
      else setState(g, g.state === 'search' ? 'search' : 'suspicious', why || 'raise');
      return true;
    }
    function noise(x, y, radius, amount) {
      if (!isFinite(x) || !isFinite(y)) { S.badInput++; return 0; }
      var rr = Math.max(0, num(radius, 80)) * scale(), n = 0; S.noises++;
      for (var i = 0; i < guards.length; i++) {
        var g = guards[i]; if (!g.active) continue;
        if (Math.hypot(g.x - x, g.y - y) <= rr) { if (g.state !== 'alert') { g.s = Math.min(0.95, g.s + clamp(num(amount, 0.45), 0, 0.95)); g.lostT = 0; g.last = { x: +x, y: +y }; setState(g, g.state === 'search' ? 'search' : 'suspicious', 'noise'); } else g.last = { x: +x, y: +y }; n++; }
      }
      return n;
    }

    /* ---------------------------------------------------------------- look: where the guard's eyes point */
    function lookAround(g, base, sweep, hold) {
      var seq2 = g.lookSeq || [base - sweep, base + sweep];
      if (g.lookT >= hold) { g.lookT = 0; g.lookI = (g.lookI + 1) % seq2.length; }
      return seq2[g.lookI % seq2.length];
    }
    function walkTo(g, tx, ty, spd, dt) {
      var dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy);
      if (d < 0.75) return 'there';
      var stp = Math.min(d, spd * dt / 1000), nx = g.x + dx / d * stp, ny = g.y + dy / d * stp;
      if (!walls.blocked(nx, ny)) { g.x = nx; g.y = ny; return 'moving'; }
      if (Math.abs(dx) > 0.5 && !walls.blocked(nx, g.y)) { g.x = nx; return 'moving'; }
      if (Math.abs(dy) > 0.5 && !walls.blocked(g.x, ny)) { g.y = ny; return 'moving'; }
      return 'blocked';
    }
    function drive(g, dt) {
      // module-driven guards (no source): patrol, walk to look at the last seen point, chase, return to the route
      var sc = scale(), spd = (g.speed != null ? g.speed : P.speed) * sc, pl = player;
      if (g.state === 'alert' && g.seen && pl) { g.mode = 'chase'; walkTo(g, pl.x, pl.y, spd * 1.6, dt); return; }
      if ((g.state === 'alert' || g.state === 'search' || (g.state === 'suspicious' && g.s >= P.investigate)) && g.last) {
        g.mode = g.state === 'alert' ? 'chase' : 'investigate';
        var r = walkTo(g, g.last.x, g.last.y, spd * (g.state === 'alert' ? 1.6 : 0.8), dt);
        if (r !== 'moving') g.last = g.last && { x: g.last.x, y: g.last.y, reached: true };
        return;
      }
      if (g.state === 'suspicious') { g.mode = 'stare'; return; }
      g.mode = 'patrol';
      if (!g.route.length) { if (walkTo(g, g.home.x, g.home.y, spd, dt) !== 'moving' && g.still > 300) g.base = g.face0; return; }   // back at its post: its post direction
      var wp = g.route[g.ri % g.route.length];
      if (g.waitT > 0) { g.waitT -= dt; if (g.waitT <= 0) { g.waitT = 0; g.ri = (g.ri + 1) % g.route.length; g.lookSeq = null; } return; }
      var res = walkTo(g, wp.x, wp.y, spd, dt);
      if (res !== 'moving') {
        if (wp.wait > 0) { g.waitT = wp.wait; g.lookI = 0; g.lookT = 0; g.lookSeq = wp.look ? wp.look.slice() : null; }
        else g.ri = (g.ri + 1) % g.route.length;
      }
    }
    function steer(g, dt) {
      var sc = scale(), mv = Math.hypot(g.vx, g.vy) > 4 * sc, pl = player;
      if (mv) { g.base = Math.atan2(g.vy, g.vx); g.still = 0; } else g.still += dt;
      if (g.lookFn) {
        var a; try { a = g.lookFn(); } catch (e) { S.cbErrors++; a = null; }
        if (a != null && isFinite(a)) { g.look = wrap(+a); g.want = g.look; return; }
      }
      var want = g.base, toLast = g.last ? Math.hypot(g.last.x - g.x, g.last.y - g.y) : 0;
      if (g.state === 'alert' && g.seen && pl) want = Math.atan2(pl.y - g.y, pl.x - g.x);
      else if (g.state === 'search' && !mv && g.still > 200) {
        var b = toLast > 6 * sc ? Math.atan2(g.last.y - g.y, g.last.x - g.x) : g.base;
        g.lookT += dt; want = lookAround(g, b, P.sweep * 1.4 * D2R, P.lookHold * 0.7);
      } else if ((g.state === 'suspicious' || g.state === 'alert') && g.last && toLast > 6 * sc && !mv) want = Math.atan2(g.last.y - g.y, g.last.x - g.x);
      else if (mv) want = g.base;
      else if (g.still > 250) {
        g.lookT += dt;
        if (g.lookSeq) want = lookAround(g, g.base, 0, P.lookHold);
        else want = lookAround(g, g.base, P.sweep * D2R, P.lookHold);
      }
      g.want = want;
      var rate = P.turnSpeed * D2R * (g.state === 'alert' ? 1.8 : g.state === 'calm' ? 1 : 1.3) * dt / 1000, d = wrap(want - g.look);
      g.look = Math.abs(d) <= rate ? wrap(want) : wrap(g.look + (d > 0 ? rate : -rate));
    }

    /* ---------------------------------------------------------------- sight */
    function sight(g) {
      g.inCone = false; g.los = false; g.seen = false; g.dist = Infinity; g.off = 0; g.cover = cover;
      var pl = player; if (!pl || !g.active) return;
      var dx = pl.x - g.x, dy = pl.y - g.y, d = Math.hypot(dx, dy), rr = R(g), half = F(g) / 2, a = Math.atan2(dy, dx);
      g.dist = d; g.off = adiff(a, g.look);
      var nearR = P.near * rr;
      g.inCone = d <= rr && (g.off <= half + 1e-9 || d <= nearR);
      if (!g.inCone) return;
      g.los = d < 0.5 || walls.ray(g.x, g.y, a, d) >= d - 0.25;
      g.seen = g.los && d <= rr * (1 - cover);
    }
    function think(g, dt) {
      var rr = R(g), half = F(g) / 2;
      if (g.seen) {
        S.seenSteps++;
        g.last = { x: player.x, y: player.y }; g.lostT = 0;
        var close = 0.55 + (P.closeBoost - 0.55) * (1 - clamp(g.dist / rr, 0, 1));
        var centre = half > 0 ? 1.25 - 0.5 * clamp(g.off / half, 0, 1) : 1;
        var rate = (g.state === 'search' ? 2 : 1) * close * centre / P.react;
        g.s = Math.min(1, g.s + rate * dt);
        if (g.s >= 1) { g.s = 1; if (g.state !== 'alert') { setState(g, 'alert', 'sight'); callHelp(g); } }
        else if (g.state === 'calm') setState(g, 'suspicious', 'sight');
      } else {
        g.lostT += dt;
        if (g.state === 'alert') { g.s = 1; if (g.lostT > P.alertHold) setState(g, 'search', 'lost'); }
        else if (g.state === 'search') { g.s = Math.max(0, g.s - dt / P.search); if (g.s <= 0) setState(g, 'calm', 'gave up'); }
        else if (g.state === 'suspicious') { if (g.lostT > P.hold) g.s = Math.max(0, g.s - dt / P.decay); if (g.s <= 0) { setState(g, 'calm', 'calmed'); g.last = null; } }
        else g.s = 0;
      }
      g.stateT += dt;
    }
    function callHelp(g) {
      var rr = P.callRadius * scale();
      if (!(rr > 0)) return;
      for (var i = 0; i < guards.length; i++) {
        var h = guards[i]; if (h === g || !h.active || h.state === 'alert') continue;
        if (Math.hypot(h.x - g.x, h.y - g.y) > rr) continue;
        S.calls++; h.called = true;
        events.push({ type: 'call', id: h.id, from: g.id, last: g.last ? { x: g.last.x, y: g.last.y } : null, t: t, seq: ++seq });
        raise(h.id, Math.max(h.s, 0.75), g.last, 'call');
      }
    }

    function update(dtMs) {
      var dt = num(dtMs, 0);
      if (!(dt > 0)) { S.frozenUpdates++; return; }
      dt = Math.min(dt, 250); t += dt; S.updates++;
      player = readPlayer(); cover = player ? readCover(player.x, player.y) : 0;
      var i, g, act = 0;
      for (i = 0; i < guards.length; i++) {
        g = guards[i]; g.px = g.x; g.py = g.y;
        if (g.src) {
          var p = srcPos(g);
          if (!p) { if (g.active) { g.active = false; g.seen = false; g.inCone = false; if (g.state !== 'calm') setState(g, 'calm', 'gone'); g.s = 0; } continue; }
          if (!g.active) { g.active = true; g.px = p.x; g.py = p.y; }
          g.x = p.x; g.y = p.y;
        } else drive(g, dt);
        g.vx = (g.x - g.px) * 1000 / dt; g.vy = (g.y - g.py) * 1000 / dt;
        steer(g, dt); setFacing(g, false); act++;
      }
      for (i = 0; i < guards.length; i++) { g = guards[i]; if (!g.active) continue; sight(g); }
      for (i = 0; i < guards.length; i++) { g = guards[i]; if (!g.active) continue; think(g, dt); }
      S.active = act;
      // callbacks after every guard has moved and thought (a callback that adds or removes guards cannot break the loop)
      var out = events; events = [];
      for (i = 0; i < out.length; i++) {
        var ev = out[i]; log.push(ev); if (log.length > 64) log.shift();
        if (ev.type === 'state') call(o.onState, ev);
        else if (ev.type === 'alert') call(o.onAlert, ev);
        else if (ev.type === 'lost') call(o.onLost, ev);
        else if (ev.type === 'call') call(o.onCall, ev);
      }
    }
    var log = [];

    /* ---------------------------------------------------------------- visibility polygon */
    function polygon(g) {
      var rr = R(g), fv = F(g), key = (Math.round(g.x * 4)) + ',' + (Math.round(g.y * 4)) + ',' + Math.round(g.look * 1000) + ',' + Math.round(rr * 4) + ',' + Math.round(fv * 1000) + ',' + wallsVersion;
      if (g.poly && g.polyKey === key && g.polyAge < 30) { g.polyAge++; return g.poly; }
      S.polys++;
      var full = fv >= TAU - 1e-6, half = fv / 2, a0 = full ? g.look - Math.PI : g.look - half;
      var n = P.rays > 0 ? P.rays : clamp(Math.ceil(fv / D2R / 2), 16, 180), rel = [], i;
      for (i = 0; i <= n; i++) rel.push(fv * i / n);
      var cs = []; walls.corners(g.x, g.y, rr, cs);
      for (i = 0; i < cs.length; i += 2) {
        var dx = cs[i] - g.x, dy = cs[i + 1] - g.y, dd = Math.hypot(dx, dy);
        if (dd > rr + 1 || dd < 0.5) continue;
        var ra = Math.atan2(dy, dx) - a0; ra = ((ra % TAU) + TAU) % TAU;
        if (ra > fv) continue;
        if (ra - 1e-4 >= 0) rel.push(ra - 1e-4);
        rel.push(ra);
        if (ra + 1e-4 <= fv) rel.push(ra + 1e-4);
      }
      rel.sort(function (p, q) { return p - q; });
      var pts = [], edge = [], last = -1;
      if (!full) { pts.push(g.x, g.y); edge.push(0); }
      for (i = 0; i < rel.length; i++) {
        if (rel[i] - last < 1e-6) continue; last = rel[i];
        var a = a0 + rel[i], d = walls.ray(g.x, g.y, a, rr);
        pts.push(g.x + Math.cos(a) * d, g.y + Math.sin(a) * d); edge.push(d >= rr - 0.01 ? 1 : 2);
      }
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (i = 0; i < pts.length; i += 2) { minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]); minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]); }
      g.poly = { pts: pts, edge: edge, x: g.x, y: g.y, r: rr, look: g.look, fov: fv, box: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
      g.polyKey = key; g.polyAge = 0;
      return g.poly;
    }
    function inPoly(pts, x, y) {
      var c = false, n = pts.length / 2;
      for (var i = 0, j = n - 1; i < n; j = i++) {
        var xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
      }
      return c;
    }

    /* ---------------------------------------------------------------- drawing */
    var drawnBoxes = [];
    function usePixel(ctx) {
      if (P.render === 'pixel') return true;
      if (P.render === 'smooth') return false;
      if (skinPixel) return true;
      return ctx && ctx.imageSmoothingEnabled === false;
    }
    function viewRect(ctx, cx, cy) {
      var v = o.view;
      if (typeof v === 'function') { try { v = v(); } catch (e) { v = null; } }
      if (v && isFinite(v.w) && isFinite(v.h)) return { x: cx + num(v.x, 0), y: cy + num(v.y, 0), w: +v.w, h: +v.h };
      // the canvas corners mapped back through the current transform (a camera translate inside it included), plus the camera
      try {
        var m = ctx.getTransform(), det = m.a * m.d - m.b * m.c; if (!det) return null;
        var W = ctx.canvas.width, H = ctx.canvas.height, xs = [], ys = [], P2 = [[0, 0], [W, 0], [0, H], [W, H]];
        for (var i = 0; i < 4; i++) { var X = P2[i][0] - m.e, Y = P2[i][1] - m.f; xs.push((m.d * X - m.c * Y) / det + cx); ys.push((-m.b * X + m.a * Y) / det + cy); }
        var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
        return { x: x0 - 16, y: y0 - 16, w: Math.max.apply(null, xs) - x0 + 32, h: Math.max.apply(null, ys) - y0 + 32 };
      } catch (e) { return null; }
    }
    function colOf(g) { var p = pal(); return p[g.state] || p.calm; }
    function drawConeSmooth(ctx, g, poly, cx, cy, sc) {
      var pts = poly.pts, col = colOf(g), op = P.opacity, gx = g.x - cx, gy = g.y - cy, rr = poly.r, i;
      ctx.beginPath(); ctx.moveTo(pts[0] - cx, pts[1] - cy);
      for (i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] - cx, pts[i + 1] - cy);
      ctx.closePath();
      var gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, rr);
      var base = g.state === 'calm' ? 1 : 1.25;
      gr.addColorStop(0, rgba(col, 0.40 * op * base)); gr.addColorStop(0.55, rgba(col, 0.28 * op * base));
      gr.addColorStop(0.86, rgba(col, 0.17 * op * base)); gr.addColorStop(1, rgba(col, 0.08 * op * base));
      ctx.fillStyle = gr; ctx.fill();
      if (g.s > 0.002 && g.state !== 'calm') {
        ctx.save(); ctx.clip();
        var fr = Math.max(1, g.s * rr), g2 = ctx.createRadialGradient(gx, gy, 0, gx, gy, fr);
        g2.addColorStop(0, rgba(col, 0.30 * op)); g2.addColorStop(0.82, rgba(col, 0.26 * op)); g2.addColorStop(1, rgba(col, 0.0));
        ctx.fillStyle = g2; ctx.fillRect(gx - fr, gy - fr, fr * 2, fr * 2);
        ctx.restore();
      }
      var SL = shadeList();
      for (var si = 0; si < SL.length; si++) {
        var z = SL[si], reach = rr * (1 - z.cover);
        if (z.x > poly.box.x + poly.box.w || z.x + z.w < poly.box.x || z.y > poly.box.y + poly.box.h || z.y + z.h < poly.box.y || reach >= rr) continue;
        // in shade beyond the shortened reach: dim the cone and draw the reach as a dashed arc
        ctx.save(); ctx.clip(); ctx.beginPath(); ctx.rect(z.x - cx, z.y - cy, z.w, z.h); ctx.clip();
        ctx.beginPath(); ctx.arc(gx, gy, rr + 2, 0, TAU); ctx.arc(gx, gy, reach, 0, TAU, true);
        ctx.fillStyle = rgba(INK, 0.3 * Math.min(1, op)); ctx.fill();
        ctx.beginPath(); ctx.arc(gx, gy, reach, 0, TAU); ctx.setLineDash([3 * sc + 1, 2 * sc + 1]);
        ctx.strokeStyle = rgba(col, 0.9 * Math.min(1, op)); ctx.lineWidth = Math.max(1, 1.2 * sc); ctx.stroke();
        ctx.restore();
        ctx.beginPath(); ctx.moveTo(pts[0] - cx, pts[1] - cy); for (i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] - cx, pts[i + 1] - cy); ctx.closePath();
      }
      ctx.lineJoin = 'round';
      ctx.strokeStyle = rgba(INK, 0.32 * Math.min(1, op)); ctx.lineWidth = Math.max(1.5, 2.8 * sc); ctx.stroke();
      ctx.strokeStyle = rgba(col, (g.state === 'calm' ? 0.55 : 0.8) * Math.min(1, op)); ctx.lineWidth = Math.max(0.75, 1.1 * sc); ctx.stroke();
    }
    function rasterCone(g, poly) {
      // pixel render: the cone rasterised at 1 canvas px per world px with crisp edges, two alpha bands, a dithered far rim,
      // the suspicion fill as a solid disc band and a 1 px rim line
      var col = colOf(g), sq = Math.round(g.s * 24), SL = shadeList(), key = poly.pts.length + ':' + g.polyKey + ':' + g.state + ':' + sq + ':' + P.opacity + ':' + P.palette + ':' + JSON.stringify(SL);
      if (g.ras && g.rasKey === key) return g.ras;
      if (typeof document === 'undefined') return null;
      var bx = Math.floor(poly.box.x) - 1, by = Math.floor(poly.box.y) - 1, W = Math.ceil(poly.box.x + poly.box.w) + 2 - bx, H = Math.ceil(poly.box.y + poly.box.h) + 2 - by;
      if (W <= 0 || H <= 0 || W * H > 1200000) return null;
      var cv = g.ras && g.ras.c.width >= W && g.ras.c.height >= H ? g.ras.c : document.createElement('canvas');
      if (cv.width < W || cv.height < H) { cv.width = W; cv.height = H; }
      var x2 = cv.getContext('2d'), id = x2.createImageData(W, H), d = id.data, mask = new Uint8Array(W * H), pts = poly.pts, n = pts.length / 2, xs = [];
      for (var y = 0; y < H; y++) {
        var yc = by + y + 0.5; xs.length = 0;
        for (var i = 0, j = n - 1; i < n; j = i++) {
          var yi = pts[i * 2 + 1], yj = pts[j * 2 + 1];
          if ((yi > yc) !== (yj > yc)) xs.push(pts[i * 2] + (pts[j * 2] - pts[i * 2]) * (yc - yi) / (yj - yi));
        }
        xs.sort(function (p, q) { return p - q; });
        for (var q = 0; q + 1 < xs.length; q += 2) {
          var a = Math.max(0, Math.ceil(xs[q] - bx - 0.5)), b = Math.min(W - 1, Math.floor(xs[q + 1] - bx - 0.5));
          for (var x = a; x <= b; x++) mask[y * W + x] = 1;
        }
      }
      var op = P.opacity, rr = poly.r, sr = g.s * rr, hot = g.state !== 'calm', boost = hot ? 1.2 : 1.12;
      for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
        var m = yy * W + xx, o4 = m * 4, al, c = col;
        var px = bx + xx + 0.5 - g.x, py = by + yy + 0.5 - g.y, dd = Math.hypot(px, py);
        if (!mask[m]) {
          // a dark line just outside the rim keeps a pale cone readable on pale ground (cobbles, sand, snow)
          var nb = (xx > 0 && mask[m - 1]) || (xx < W - 1 && mask[m + 1]) || (yy > 0 && mask[m - W]) || (yy < H - 1 && mask[m + W]);
          if (!nb || dd < 6) continue;
          c = INK; al = 0.34 * Math.min(1, op);
        } else {
          var rim = xx === 0 || yy === 0 || xx === W - 1 || yy === H - 1 || !mask[m - 1] || !mask[m + 1] || !mask[m - W] || !mask[m + W];
          var sh = SL.length ? shadeAt(SL, bx + xx + 0.5, by + yy + 0.5) : 0, reach = rr * (1 - sh);
          if (sh > 0 && dd > reach) {
            // in shade beyond the shortened reach: the guard cannot see you here; a 1 px reach line, then a sparse dither
            if (dd - reach < 1) { al = 0.8; } else { if (((xx + 2 * yy) & 3) !== 0) continue; al = 0.16; }
            al *= op;
            d[o4] = col[0]; d[o4 + 1] = col[1]; d[o4 + 2] = col[2]; d[o4 + 3] = Math.round(clamp(al, 0, 1) * 255);
            continue;
          }
          if (rim) al = hot ? 0.85 : 0.62;
          else if (hot && dd < sr) al = 0.44;
          else if (dd < rr * 0.5) al = 0.34 * boost;
          else if (dd < rr * 0.8) al = 0.25 * boost;
          else al = ((xx + yy) & 1) ? 0.24 * boost : 0.1 * boost;
          al *= op;
        }
        d[o4] = c[0]; d[o4 + 1] = c[1]; d[o4 + 2] = c[2]; d[o4 + 3] = Math.round(clamp(al, 0, 1) * 255);
      }
      x2.clearRect(0, 0, cv.width, cv.height); x2.putImageData(id, 0, 0);
      g.ras = { c: cv, x: bx, y: by, w: W, h: H }; g.rasKey = key;
      return g.ras;
    }
    function drawCones(ctx, camX, camY) {
      if (!ctx || typeof ctx.beginPath !== 'function') { S.badInput++; return; }
      var cx = num(camX, 0), cy = num(camY, 0);
      S.draws++; drawnBoxes = [];
      try {
        var pixel = usePixel(ctx), vr = viewRect(ctx, cx, cy), sc = scale(), nDrawn = 0;
        ctx.save();
        for (var i = 0; i < guards.length; i++) {
          var g = guards[i]; if (!g.active) continue;
          var rr = R(g);
          if (vr && (g.x + rr < vr.x || g.x - rr > vr.x + vr.w || g.y + rr < vr.y || g.y - rr > vr.y + vr.h)) continue;
          var poly = polygon(g);
          if (pixel) { var rs = rasterCone(g, poly); if (rs) { ctx.imageSmoothingEnabled = false; ctx.drawImage(rs.c, 0, 0, rs.w, rs.h, Math.round(rs.x - cx), Math.round(rs.y - cy), rs.w, rs.h); } }
          else drawConeSmooth(ctx, g, poly, cx, cy, sc);
          drawnBoxes.push({ id: g.id, x: poly.box.x - cx, y: poly.box.y - cy, w: poly.box.w, h: poly.box.h, kind: 'cone' }); nDrawn++;
        }
        ctx.restore(); S.drawn = nDrawn;
        // 3/4-view games: the game redraws the tops of its walls over the cones (wall art that rises above its sight tile)
        if (typeof o.overCones === 'function') { try { ctx.save(); o.overCones(ctx, cx, cy); } catch (e) { S.cbErrors++; } try { ctx.restore(); } catch (e2) { } }
      } catch (e) { S.drawErrors++; try { ctx.restore(); } catch (e2) { } }
    }
    function glyphPath(ctx, ch, x, y, h) {
      // vector '?' / '!' in a box h tall centred on (x, y)
      var u = h / 10;
      ctx.beginPath();
      if (ch === '!') {
        ctx.moveTo(x - 1.6 * u, y - 5 * u); ctx.lineTo(x + 1.6 * u, y - 5 * u); ctx.lineTo(x + 1.0 * u, y + 1.6 * u); ctx.lineTo(x - 1.0 * u, y + 1.6 * u); ctx.closePath();
        ctx.moveTo(x + 1.45 * u, y + 3.6 * u); ctx.arc(x, y + 3.6 * u, 1.45 * u, 0, TAU);
      } else {
        ctx.moveTo(x - 3.1 * u, y - 2.2 * u);
        ctx.bezierCurveTo(x - 3.2 * u, y - 5.6 * u, x + 3.4 * u, y - 5.8 * u, x + 3.2 * u, y - 2.4 * u);
        ctx.bezierCurveTo(x + 3.1 * u, y - 0.6 * u, x + 1.2 * u, y - 0.2 * u, x + 1.15 * u, y + 1.7 * u);
        ctx.lineTo(x - 1.15 * u, y + 1.7 * u);
        ctx.bezierCurveTo(x - 1.2 * u, y - 1.0 * u, x + 1.1 * u, y - 1.2 * u, x + 1.1 * u, y - 2.5 * u);
        ctx.bezierCurveTo(x + 1.1 * u, y - 3.6 * u, x - 1.0 * u, y - 3.7 * u, x - 1.0 * u, y - 2.2 * u);
        ctx.closePath();
        ctx.moveTo(x + 1.4 * u, y + 3.7 * u); ctx.arc(x, y + 3.7 * u, 1.4 * u, 0, TAU);
      }
    }
    function markInfo(g) {
      if (!g.active || g.state === 'calm' || P.marks === 'off') return null;
      var ch = g.state === 'alert' ? '!' : '?', fill = g.state === 'alert' ? 1 : g.s;
      var pop = g.state === 'alert' && g.stateT < 260 ? 1 + 0.45 * Math.sin(Math.PI * g.stateT / 260) : g.stateT < 140 ? 0.6 + 0.4 * g.stateT / 140 : 1;
      return { ch: ch, fill: fill, pop: pop };
    }
    function drawMarks(ctx, camX, camY) {
      if (!ctx || typeof ctx.beginPath !== 'function') { S.badInput++; return; }
      var cx = num(camX, 0), cy = num(camY, 0);
      try {
        var pixel = usePixel(ctx), sc = scale(), vr = viewRect(ctx, cx, cy), AV = [];
        if (typeof o.avoid === 'function') { try { AV = o.avoid() || []; } catch (e) { S.cbErrors++; AV = []; } }
        // a badge that would cover one of the game's avoid rects (the player) is lifted above it
        function lift(x, y, w, h) {
          for (var k = 0; k < 3; k++) {
            var hit = null;
            for (var a = 0; a < AV.length; a++) { var r = AV[a]; if (!r) continue; var rx = r.x - cx, ry = r.y - cy; if (x < rx + r.w && x + w > rx && y < ry + r.h && y + h > ry) { hit = ry; break; } }
            if (hit == null) return y;
            y = hit - h - 2;
          }
          return y;
        }
        ctx.save();
        for (var i = 0; i < guards.length; i++) {
          var g = guards[i], mi = markInfo(g); if (!mi) continue;
          if (vr && (g.x < vr.x || g.x > vr.x + vr.w || g.y - g.eye < vr.y - 24 || g.y > vr.y + vr.h + 24)) continue;   // off screen
          var col = colOf(g), mx = g.x - cx, my = g.y - cy - g.eye;
          if (pixel) {
            var rows = GLYPH[mi.ch], gw = rows[0].length, gh = rows.length, bw = gw + 4, bh = gh + 4;
            var ox = Math.round(mx - bw / 2), oy = Math.round(lift(Math.round(mx - bw / 2), my - bh - 4 - (mi.pop > 1.05 ? 2 : 0), bw, bh + 2));
            var lit = Math.round(gh * (1 - mi.fill));   // glyph rows above this stay cream: the glyph fills from the bottom
            // badge: a dark box with cut corners and a 3 px pointer at the guard's head; alert adds a coloured frame
            ctx.fillStyle = rgba(INK, 0.94);
            ctx.fillRect(ox + 1, oy, bw - 2, bh); ctx.fillRect(ox, oy + 1, bw, bh - 2);
            ctx.fillRect(ox + (bw >> 1) - 1, oy + bh, 3, 1); ctx.fillRect(ox + (bw >> 1), oy + bh + 1, 1, 1);
            if (mi.ch === '!') {
              ctx.fillStyle = rgba(col, 1);
              ctx.fillRect(ox + 2, oy, bw - 4, 1); ctx.fillRect(ox + 2, oy + bh - 1, bw - 4, 1); ctx.fillRect(ox, oy + 2, 1, bh - 4); ctx.fillRect(ox + bw - 1, oy + 2, 1, bh - 4);
              ctx.fillRect(ox + 1, oy + 1, 1, 1); ctx.fillRect(ox + bw - 2, oy + 1, 1, 1); ctx.fillRect(ox + 1, oy + bh - 2, 1, 1); ctx.fillRect(ox + bw - 2, oy + bh - 2, 1, 1);
            }
            for (var yy = 0; yy < gh; yy++) for (var xx = 0; xx < gw; xx++) if (rows[yy][xx] === '#') { ctx.fillStyle = rgba(yy >= lit ? col : CREAM, 1); ctx.fillRect(ox + 2 + xx, oy + 2 + yy, 1, 1); }
            drawnBoxes.push({ id: g.id, x: ox, y: oy, w: bw, h: bh + 2, kind: 'mark' });
          } else {
            var h = 15 * sc * mi.pop, bw = h * 0.95, top = my - h * 1.25;
            top = lift(mx - bw * 0.65, top - bw * 0.65, bw * 1.3, bw * 1.65) + bw * 0.65;
            // badge: dark rounded drop pointing at the guard's head, ring in the state colour
            ctx.beginPath();
            ctx.arc(mx, top, bw * 0.62, Math.PI * 0.75, Math.PI * 0.25);
            ctx.lineTo(mx, top + bw * 0.98); ctx.closePath();
            ctx.fillStyle = rgba(INK, 0.9); ctx.fill();
            ctx.lineWidth = Math.max(1, 1.6 * sc); ctx.strokeStyle = rgba(col, 1); ctx.stroke();
            glyphPath(ctx, mi.ch, mx, top, h * 0.78);
            ctx.fillStyle = rgba(CREAM, 1); ctx.fill();
            if (mi.fill > 0.001) {
              ctx.save(); ctx.beginPath(); var gtop = top - h * 0.39, gh2 = h * 0.78;
              ctx.rect(mx - bw, gtop + gh2 * (1 - mi.fill), bw * 2, gh2 * mi.fill + 1); ctx.clip();
              glyphPath(ctx, mi.ch, mx, top, h * 0.78); ctx.fillStyle = rgba(col, 1); ctx.fill();
              ctx.restore();
            }
            drawnBoxes.push({ id: g.id, x: mx - bw * 0.65, y: top - bw * 0.65, w: bw * 1.3, h: bw * 1.65, kind: 'mark' });
          }
        }
        ctx.restore();
      } catch (e) { S.drawErrors++; try { ctx.restore(); } catch (e2) { } }
    }
    function draw(ctx, camX, camY) { inst.drawCones(ctx, camX, camY); inst.drawMarks(ctx, camX, camY); }   // through inst: wrappers see both

    /* ---------------------------------------------------------------- queries */
    function info(g) {
      return { id: g.id, x: g.x, y: g.y, look: g.look, lookDeg: Math.round(g.look / D2R * 10) / 10, want: g.want, fov: F(g) / D2R, range: R(g),
        state: g.state, suspicion: Math.round(g.s * 1000) / 1000, seen: g.seen, inCone: g.inCone, los: g.los, cover: g.cover,
        dist: isFinite(g.dist) ? Math.round(g.dist * 10) / 10 : null, last: g.last ? { x: g.last.x, y: g.last.y } : null,
        side: g.side, dir4: g.dir4, active: g.active, mode: g.src ? 'host' : g.mode, moving: Math.hypot(g.vx, g.vy) > 4 * scale(), called: g.called };
    }
    function anySees(x, y) {
      // would any guard see a point now (ignores cover)? for autopilots and AI
      for (var i = 0; i < guards.length; i++) {
        var g = guards[i]; if (!g.active) continue;
        var dx = x - g.x, dy = y - g.y, d = Math.hypot(dx, dy), rr = R(g);
        if (d > rr) continue;
        if (adiff(Math.atan2(dy, dx), g.look) > F(g) / 2 && d > P.near * rr) continue;
        if (walls.ray(g.x, g.y, Math.atan2(dy, dx), d) >= d - 0.25) return g.id;
      }
      return null;
    }
    function hash() {
      var h = 2166136261;
      function mix(v) { v = Math.round(v * 100) | 0; h ^= v; h = Math.imul(h, 16777619) >>> 0; }
      for (var i = 0; i < guards.length; i++) { var g = guards[i]; mix(g.x); mix(g.y); mix(g.look); mix(g.s); mix(g.state.length); mix(g.seen ? 1 : 0); }
      return (h >>> 0).toString(16);
    }
    function clear() {
      for (var i = 0; i < guards.length; i++) {
        var g = guards[i]; g.s = 0; g.state = 'calm'; g.stateT = 0; g.seen = false; g.inCone = false; g.los = false; g.last = null; g.lostT = 0; g.called = false;
        g.lookSeq = null; g.lookI = 0; g.lookT = 0; g.waitT = 0; g.ri = 0; g.mode = 'calm';
        if (!g.src) { g.x = g.home.x; g.y = g.home.y; g.px = g.x; g.py = g.y; g.vx = 0; g.vy = 0; }
        g.poly = null; g.ras = null;
      }
      events = [];
    }

    var inst = {
      version: VERSION,
      add: add, remove: remove, clear: clear, update: update, draw: draw, drawCones: drawCones, drawMarks: drawMarks,
      raise: raise, noise: noise, alertAll: function (at) { for (var i = 0; i < guards.length; i++) raise(guards[i].id, 1, at, 'alertAll'); },
      calm: function (id) { var g = byId[id]; if (!g) return false; g.s = 0; g.last = null; setState(g, 'calm', 'calm'); return true; },
      invalidate: function () { wallsVersion++; for (var i = 0; i < guards.length; i++) { guards[i].poly = null; guards[i].ras = null; } },
      get: function (id) { var g = byId[id]; return g ? info(g) : null; },
      list: function () { return guards.map(info); },
      ids: function () { return guards.map(function (g) { return g.id; }); },
      facing: function (id) { var g = byId[id]; return g ? g.look : null; },
      dir4: function (id) { var g = byId[id]; return g ? g.dir4 : null; },
      side: function (id) { var g = byId[id]; return g ? g.side : null; },
      state: function (id) { var g = byId[id]; return g ? g.state : null; },
      isAlert: function (id) { if (id == null) { for (var i = 0; i < guards.length; i++) if (guards[i].active && guards[i].state === 'alert') return true; return false; } var g = byId[id]; return !!(g && g.state === 'alert'); },
      seenBy: function () { return guards.filter(function (g) { return g.seen; }).map(function (g) { return g.id; }); },
      polygon: function (id) { var g = byId[id]; if (!g || !g.active) return null; var p = polygon(g); return { pts: p.pts.slice(), edge: p.edge.slice(), x: p.x, y: p.y, r: p.r, look: p.look, fov: p.fov, box: p.box }; },
      inside: function (id, x, y) { var g = byId[id]; if (!g || !g.active) return false; return inPoly(polygon(g).pts, x, y); },
      sees: anySees,
      ray: function (x, y, a, max) { return walls.ray(num(x, 0), num(y, 0), num(a, 0), Math.max(0, num(max, P.range * scale()))); },
      events: function () { return log.slice(); },
      setParams: function (p) { setParams(p); for (var i = 0; i < guards.length; i++) { guards[i].poly = null; guards[i].ras = null; } },
      params: function () { var c = {}; for (var kk in P) c[kk] = P[kk]; return c; },
      stats: function () { var c = {}; for (var kk in S) c[kk] = S[kk]; c.player = player ? { x: player.x, y: player.y } : null; c.cover = cover; c.walls = walls.kind; c.t = t; return c; },
      lastDrawn: function () { return drawnBoxes.slice(); },
      hash: hash
    };
    return inst;
  }

  root.GameDNA_VisionCones = { version: VERSION, create: create, defaults: DEFAULTS, palettes: Object.keys(PALETTES).concat(['skin']), glyphs: GLYPH };
})(typeof window !== 'undefined' ? window : this);
