/* GameDNA_BeltDepth v1.0.0 - K-04 belt depth (beat-'em-up depth on a side-view stage)
 *
 * One plain script, no dependencies, no import / export, ASCII only. One global: GameDNA_BeltDepth.
 *
 * Characters get a depth z (0 = the back edge of the walkable floor band = the game's own floor line, `depth` = the front
 * edge). The game keeps its own x / y physics; jump height is whatever y is above the floor. The module
 *   - moves z (walk, steer, chase, seeded lanes), clamps it to the band,
 *   - answers inReach(a, b): a hit or a touch connects only when |za - zb| <= tolerance,
 *   - draws every actor through render(): contact shadows on the floor under the feet (narrower and lighter the higher the
 *     actor is), then the actors sorted by their floor contact line (floor + z, never the airborne y), each shifted down by z,
 *   - draws the floor band (the walkable top face) on the game's floor runs, and an optional reach cue on the floor,
 *   - keeps the active lane band in view for a vertically scrolling camera (frameY).
 * Everything depends only on the calls made (no Math.random, no wall clock); draw() never changes game state.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.3';
  var DEFAULTS = {
    depth: 24,          // band depth in world px (z range 0..depth)
    tolerance: 6,       // |dz| <= tolerance -> in reach
    laneSpeed: 1.2,     // z px per step for walk()
    chaseSpeed: 0.6,    // z px per step for chase()
    chaseRange: 160,    // chase() only within this x distance (0 = always)
    shadowScale: 0.9,   // shadow width = actor width x this (render items may pass shadow: px)
    shadowAlpha: 0.45,
    shadowFade: 64,     // lift (px) at which the shadow is at its smallest / lightest
    zoom: 1,            // view units per world px (only if your draw code zooms the world)
    floor: 'meadow',    // floor band palette: meadow | earth | stone | cobble | planks | {back, front, lip, speck, edge}
    cue: 'off',         // 'on': render items with reach {x0, x1} get a lane strip on the floor
    render: 'auto',     // auto | pixel | smooth (auto: pixel when view.h <= 270)
    headroom: 72,       // frameY keeps this much above the player's floor in view
    bandMargin: 6,      // ... and this much below the front edge
    lanes: 3,           // lane(i) picks one of this many seeded lanes
    seed: 1
  };
  var PAL = {
    meadow: { back: '#3f7a34', front: '#6cae4a', lip: '#a6dc6c', speck: ['#2f6a2c', '#86c45a', '#b4d870', '#7a6a3a'], edge: '#24401e', path: '#9c8452' },
    earth: { back: '#6a4a2c', front: '#9a7044', lip: '#c8a06a', speck: ['#56381e', '#b08654', '#7e5a34', '#c4a070'], edge: '#3a2414', path: null },
    stone: { back: '#6a6878', front: '#9c98a8', lip: '#d4d0dc', speck: ['#58566a', '#b4b0c0', '#807c90'], edge: '#34323e', joints: '#4c4a5a', path: null },
    cobble: { back: '#5a5466', front: '#8a8494', lip: '#c4bccc', speck: ['#4a4456', '#a8a0b0', '#6e687a'], edge: '#2a2632', joints: '#3a3444', cobble: true, path: null },
    planks: { back: '#6a4024', front: '#a06838', lip: '#d49a5c', speck: ['#5a3418', '#b47a44'], edge: '#3a2010', joints: '#4a2a14', planks: true, path: null }
  };

  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function hsh(x, y, s) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
  function hex(c) { var n = parseInt(String(c).slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) { var A = hex(a), B = hex(b); return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')'; }
  function mk(w, h) { if (typeof document === 'undefined') return null; var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }

  function create(options) {
    options = options || {};
    var P = {}, k, src = options.params || {};
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    for (k in DEFAULTS) if (options[k] != null) P[k] = options[k];
    for (k in src) if (src[k] != null) P[k] = src[k];
    function norm() {
      ['depth', 'tolerance', 'laneSpeed', 'chaseSpeed', 'chaseRange', 'shadowScale', 'shadowAlpha', 'shadowFade', 'zoom', 'headroom', 'bandMargin', 'lanes', 'seed'].forEach(function (q) { P[q] = num(P[q], DEFAULTS[q]); });
      P.depth = Math.max(0, P.depth); P.tolerance = Math.max(0, P.tolerance); P.lanes = Math.max(1, Math.round(P.lanes));
    }
    norm();
    var view = options.view || null;
    var floors = [];
    var ST = { steps: 0, renders: 0, actorsDrawn: 0, maxActors: 0, shadows: 0, noFloor: 0, sinking: 0, orderBad: 0, reachChecks: 0, reachTrue: 0, reachFalse: 0,
      maxDzTrue: 0, minDzFalse: null, walks: 0, chases: 0, floorDraws: 0, bandOut: 0, cbErrors: 0, drawErrors: 0, badActor: 0 };
    var last = { order: [], items: [], cues: [], floors: 0 };
    var reachLog = [];
    var TEX = {};

    function isPixel() { if (P.render === 'pixel') return true; if (P.render === 'smooth') return false; return !view || num(view.h, 180) <= 270; }
    function call(fn, args, d) { if (typeof fn !== 'function') return d; try { return fn.apply(null, args); } catch (e) { ST.cbErrors++; return d; } }
    function feet(a) {
      if (!a) return null;
      if (options.feet) { var f = call(options.feet, [a], null); if (f && isFinite(f.x) && isFinite(f.y)) return f; }
      var x = num(a.x, NaN), y = num(a.y, NaN);
      if (!isFinite(x) || !isFinite(y)) return null;
      if (a.w != null && a.h != null) return { x: x + num(a.w, 0) / 2, y: y + num(a.h, 0) };
      return { x: x, y: y };
    }
    function halfW(a) { var w = a && a.w != null ? num(a.w, 16) : 16; return w / 2; }
    function toScreen(x, y) {
      if (options.toScreen) { var s = call(options.toScreen, [x, y], null); if (s && isFinite(s.x) && isFinite(s.y)) return s; }
      return { x: x, y: y };
    }
    function zOf(a) { return a ? Math.max(0, Math.min(P.depth, num(a.z, 0))) : 0; }
    function setZ(a, z) { if (!a) return 0; var old = num(a.z, 0); a.z = Math.max(0, Math.min(P.depth, num(z, 0))); return a.z - old; }

    // the floor top at or below y at x (world px); null over a pit
    function floorAt(x, y) {
      if (options.floorAt) { var v = call(options.floorAt, [x, y], null); return v == null || !isFinite(v) ? null : +v; }
      var best = null;
      for (var i = 0; i < floors.length; i++) { var f = floors[i]; if (x < f.x0 || x >= f.x1) continue; if (f.y < y - 2) continue; if (best === null || f.y < best) best = f.y; }
      return best;
    }
    // the floor under an actor: centre, then the inner parts of its feet (an actor half over a ledge still has a floor)
    function floorUnder(a, f) {
      f = f || feet(a); if (!f) return null;
      var y0 = floorAt(f.x, f.y); if (y0 !== null) return y0;
      var hw = halfW(a) * 0.6, l = floorAt(f.x - hw, f.y), r = floorAt(f.x + hw, f.y);
      if (l === null) return r; if (r === null) return l; return Math.min(l, r);
    }
    function lift(a) { var f = feet(a); if (!f) return null; var fl = floorUnder(a, f); return fl === null ? null : Math.max(0, fl - f.y); }

    function inReach(a, b, tol) {
      var t = num(tol, P.tolerance), dz = Math.abs(zOf(a) - zOf(b)), ok = dz <= t + 1e-9;
      ST.reachChecks++;
      if (ok) { ST.reachTrue++; if (dz > ST.maxDzTrue) ST.maxDzTrue = dz; } else { ST.reachFalse++; if (ST.minDzFalse === null || dz < ST.minDzFalse) ST.minDzFalse = dz; }
      if (reachLog.length > 63) reachLog.shift();
      reachLog.push({ step: ST.steps, a: a, b: b, dz: dz, ok: ok });
      return ok;
    }
    function walk(a, dir, speed) { if (!a || !dir) return 0; ST.walks++; return setZ(a, zOf(a) + (dir > 0 ? 1 : -1) * num(speed, P.laneSpeed)); }
    function steer(a, z, dead) { var d = num(typeof z === 'object' && z ? zOf(z) : z, 0) - zOf(a), dd = num(dead, P.tolerance * 0.5); return d > dd ? 1 : d < -dd ? -1 : 0; }
    function chase(a, target, speed, range) {
      if (!a || !target) return 0;
      var R = num(range, P.chaseRange), fa = feet(a), ft = feet(target);
      if (R > 0 && fa && ft && Math.abs(fa.x - ft.x) > R) return 0;
      var d = zOf(target) - zOf(a), s = num(speed, P.chaseSpeed);
      if (Math.abs(d) < 0.01) return 0;
      ST.chases++;
      return setZ(a, zOf(a) + Math.max(-s, Math.min(s, d)));
    }
    function lane(i) {
      var n = P.lanes; if (n <= 1) return P.depth / 2;
      var j = Math.floor(hsh(i | 0, 7, P.seed) * n);
      return Math.round(P.depth * (0.12 + 0.76 * j / (n - 1)) * 10) / 10;
    }

    /* ---------------- floors ---------------- */
    function setFloors(runs) { floors = (runs || []).filter(function (r) { return r && isFinite(r.x0) && isFinite(r.x1) && isFinite(r.y) && r.x1 > r.x0; }).map(function (r) { return { x0: +r.x0, x1: +r.x1, y: +r.y, kind: r.kind == null ? null : r.kind }; }); return floors.length; }
    function gridFloors(o) {
      o = o || {}; var cols = num(o.cols, 0), rows = num(o.rows, 0), T = num(o.tile, 16), X0 = num(o.x0, 0), Y0 = num(o.y0, 0), out = [];
      var kindOf = function (c, r) { if (c < 0 || r < 0 || c >= cols || r >= rows) return false; var v = call(o.solid, [c, r], false); return v ? (v === true ? '#' : v) : false; };
      for (var r = 0; r < rows; r++) {
        var run = null;
        for (var c = 0; c <= cols; c++) {
          var kd = c < cols ? kindOf(c, r) : false, open = kd && !kindOf(c, r - 1);
          if (open && run && run.kind === kd) { run.x1 = X0 + (c + 1) * T; continue; }
          if (run) { out.push(run); run = null; }
          if (open) run = { x0: X0 + c * T, x1: X0 + (c + 1) * T, y: Y0 + r * T, kind: kd };
        }
      }
      return out;
    }
    function palette(kind) {
      var f = (options.floorKinds && kind != null && options.floorKinds[kind]) || P.floor;
      if (f && typeof f === 'object') { var d = PAL.meadow, o = {}; for (var q in d) o[q] = f[q] != null ? f[q] : d[q]; if (!f.speck) o.speck = [f.back || d.back, f.front || d.front]; return { key: JSON.stringify(f), p: o }; }
      return { key: String(f), p: PAL[f] || PAL.meadow };
    }
    // one seamless strip of floor texture: 128 world px wide, depth rows (x res = res per px)
    function texture(pk, D, res) {
      var key = pk.key + '|' + D + '|' + res; if (TEX[key]) return TEX[key];
      var p = pk.p, W = 128, c = mk(W * res, (D + 2) * res); if (!c) return null;
      var g = c.getContext('2d'), x, y, R = function (xx, yy, w, h, col) { g.fillStyle = col; g.fillRect(xx * res, yy * res, w * res, h * res); };
      var sd = 0; for (var i = 0; i < pk.key.length; i++) sd = (sd * 31 + pk.key.charCodeAt(i)) | 0;
      for (y = 0; y < D; y++) { var t = D > 1 ? y / (D - 1) : 1; R(0, y, W, 1, mix(p.back, p.front, Math.pow(t, 0.8))); }
      // worn path through the middle rows (meadow)
      if (p.path && D >= 6) for (x = 0; x < W; x++) { var wob = Math.round(Math.sin((x / W) * Math.PI * 4) * 1.2 + (hsh(x >> 3, 3, sd) - 0.5) * 1.5), y0 = Math.round(D * 0.38) + wob, h = Math.max(2, Math.round(D * 0.26)); for (y = y0; y < y0 + h; y++) { if (y < 1 || y >= D - 1) continue; var e = (y === y0 || y === y0 + h - 1) && hsh(x, y, sd + 5) < 0.5; if (!e) R(x, y, 1, 1, mix(p.path, p.front, 0.15 + 0.5 * (y / D))); } }
      if (p.joints && p.planks) for (y = 0; y < D; y += 4) { R(0, y, W, 1, p.joints); for (x = (y * 13) % 37; x < W; x += 37) R(x, y, 1, 4, p.joints); }
      else if (p.joints && p.cobble) { for (y = 0; y < D; y++) { var rowH = 3 + Math.floor((y / D) * 3), band = Math.floor(y / rowH); if (y % rowH === 0) R(0, y, W, 1, p.joints); var sp = 6 + Math.floor((y / D) * 6), off = (band * 5) % sp; for (x = off; x < W; x += sp) if (y % rowH !== 0) R(x, y, 1, 1, p.joints); } }
      else if (p.joints) { var lines = [0.3, 0.62]; lines.forEach(function (fr) { R(0, Math.round(D * fr), W, 1, p.joints); }); for (x = 0; x < W; x += 32) { R(x, 0, 1, Math.round(D * 0.3), p.joints); R(x + 16, Math.round(D * 0.3), 1, Math.round(D * 0.32), p.joints); R(x + 8, Math.round(D * 0.62), 1, D - Math.round(D * 0.62), p.joints); } }
      // specks: denser toward the back (shade), lighter toward the front
      if (res === 1) { for (y = 0; y < D; y++) for (x = 0; x < W; x++) { var v = hsh(x, y, sd + 11); if (v < 0.11) R(x, y, 1, 1, p.speck[Math.floor(hsh(x, y, sd + 13) * p.speck.length)]); } }
      else {   // smooth views: soft dabs instead of single-pixel specks
        g.globalAlpha = 0.5;
        for (y = 1; y < D - 1; y += 2) for (x = 0; x < W; x += 3) { var v2 = hsh(x, y, sd + 11); if (v2 < 0.22) { g.fillStyle = p.speck[Math.floor(hsh(x, y, sd + 13) * p.speck.length)]; g.beginPath(); g.ellipse((x + 0.5) * res, (y + 0.5) * res, res * (1.2 + v2 * 4), res * 0.7, 0, 0, Math.PI * 2); g.fill(); } }
        g.globalAlpha = 1;
      }
      // grass tufts leaning over the back edge (meadow) / back edge shade line
      R(0, 0, W, 1, mix(p.edge, p.back, 0.45));
      if (p.path) for (x = 0; x < W; x += 3) { var q = hsh(x, 1, sd + 17); if (q < 0.55) { R(x, 1, 1, 1, p.speck[1] || p.front); if (q < 0.2) R(x, 2, 1, 1, p.speck[2] || p.lip); } }
      // front lip (highlight) and the dark line where the front face starts
      R(0, D - 1, W, 1, p.lip); for (x = 0; x < W; x++) if (hsh(x, 99, sd) < 0.25) R(x, D - 1, 1, 1, mix(p.lip, p.front, 0.5));
      R(0, D, W, 1, p.edge); R(0, D + 1, W, 1, 'rgba(0,0,0,0.25)');
      TEX[key] = c; return c;
    }
    // a floor run in view (screen) px, or null when the module cannot tell where the view is
    function viewRect(r) {
      if (!view) return null;
      if (options.camera) { var c = call(options.camera, [], null); if (!c) return null; return { x0: (r.x0 - num(c.x, 0)) * P.zoom, x1: (r.x1 - num(c.x, 0)) * P.zoom, y: (r.y - num(c.y, 0)) * P.zoom }; }
      if (options.toScreen) { var a = toScreen(r.x0, r.y), b = toScreen(r.x1, r.y); return { x0: a.x, x1: b.x, y: a.y }; }
      return null;
    }
    function drawFloor(ctx, opt) {
      if (!ctx || P.depth < 1) return 0;
      opt = opt || {};
      var runs = opt.runs || floors, n = 0, px = isPixel(), Z = P.zoom, D = Math.max(1, Math.round(P.depth));
      try {
        for (var i = 0; i < runs.length; i++) {
          var r = runs[i]; if (!r) continue;
          var a = toScreen(r.x0, r.y), b = toScreen(r.x1, r.y), w = b.x - a.x;
          var vs = viewRect(r);
          if (vs && (vs.x1 < -2 || vs.x0 > num(view.w, 1e9) + 2 || vs.y > num(view.h, 1e9) + 2 || vs.y + D * Z < -2)) continue;
          var pk = palette(r.kind), res = px ? 1 : 2, tex = texture(pk, D, res); if (!tex) continue;
          var x0 = px ? Math.round(a.x) : a.x, y0 = px ? Math.round(a.y) : a.y, sx = 128 * Z, start = Math.floor(r.x0 / 128) * 128, off = (start - r.x0) * Z;
          ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, px ? Math.round(w) : w, (D + 2) * Z); ctx.clip();
          if (ctx.imageSmoothingEnabled !== undefined) ctx.imageSmoothingEnabled = !px;
          for (var xx = x0 + off; xx < x0 + w; xx += sx) ctx.drawImage(tex, px ? Math.round(xx) : xx, y0, sx, (D + 2) * Z);
          // run ends: a darker cheek so a ledge end reads as a corner
          ctx.fillStyle = 'rgba(10,8,20,0.28)'; ctx.fillRect(x0, y0, Z, D * Z); ctx.fillRect(x0 + (px ? Math.round(w) : w) - Z, y0, Z, D * Z);
          ctx.restore(); n++;
        }
      } catch (e) { ST.drawErrors++; }
      ST.floorDraws++; last.floors = n; return n;
    }

    /* ---------------- shadows, cue, actors ---------------- */
    function shadow(ctx, cx, cy, w, k) {
      var a = P.shadowAlpha * (1 - 0.45 * k); w = Math.max(4, w * (1 - 0.42 * k));
      if (isPixel()) {
        var W = Math.max(4, Math.round(w)), H = Math.max(2, Math.round(W * 0.26)), X = Math.round(cx), Y = Math.round(cy) - Math.floor(H / 2);
        for (var i = 0; i < H; i++) { var ny = (i + 0.5) / H * 2 - 1, hw = Math.round(W / 2 * Math.sqrt(Math.max(0, 1 - ny * ny))); if (hw < 1) continue; ctx.fillStyle = 'rgba(18,10,30,' + a.toFixed(3) + ')'; ctx.fillRect(X - hw, Y + i, hw * 2, 1); }
        var W2 = Math.max(2, Math.round(W * 0.6)), H2 = Math.max(1, H - 2);
        for (i = 0; i < H2; i++) { var ny2 = (i + 0.5) / H2 * 2 - 1, hw2 = Math.round(W2 / 2 * Math.sqrt(Math.max(0, 1 - ny2 * ny2))); if (hw2 < 1) continue; ctx.fillStyle = 'rgba(18,10,30,' + (a * 0.6).toFixed(3) + ')'; ctx.fillRect(X - hw2, Y + 1 + i, hw2 * 2, 1); }
        return { x: X - W / 2, y: Y, w: W, h: H };
      }
      var h = Math.max(2, w * 0.28);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, h / w);
      var gr = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
      gr.addColorStop(0, 'rgba(18,10,30,' + (a * 1.25).toFixed(3) + ')'); gr.addColorStop(0.6, 'rgba(18,10,30,' + a.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(18,10,30,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      return { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
    }
    function cueStrip(ctx, it) {
      var r = it.reach, fl = it.floor; if (!r || fl === null) return null;
      var Z = P.zoom, t = P.tolerance, k = Math.max(0, Math.min(1, num(r.k, 1)));
      var a = toScreen(Math.min(r.x0, r.x1), fl + it.z - t), b = toScreen(Math.max(r.x0, r.x1), fl + it.z + t);
      var px = isPixel(), x0 = px ? Math.round(a.x) : a.x, x1 = px ? Math.round(b.x) : b.x, y0 = px ? Math.round(a.y) : a.y, y1 = px ? Math.round(b.y) : b.y;
      if (y1 - y0 < 2) { y0 -= 1; y1 += 1; }
      ctx.save();
      ctx.fillStyle = 'rgba(255,214,110,' + (0.16 * k).toFixed(3) + ')'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.fillStyle = 'rgba(255,236,170,' + (0.55 * k).toFixed(3) + ')'; ctx.fillRect(x0, y0, x1 - x0, Z); ctx.fillRect(x0, y1 - Z, x1 - x0, Z);
      ctx.restore();
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    function prep(list) {
      var out = [];
      for (var i = 0; i < (list || []).length; i++) {
        var it = list[i]; if (!it) continue;
        var a = it.a || it.actor || it; var f = feet(a);
        if (!f) { ST.badActor++; continue; }
        var fl = floorUnder(a, f), z = zOf(a), lf = fl === null ? null : fl - f.y;
        if (lf !== null && lf < -2) ST.sinking++;
        out.push({ a: a, i: i, id: a.id != null ? a.id : (it.id != null ? it.id : i), draw: it.draw, f: f, floor: fl, z: z, lift: lf === null ? null : Math.max(0, lf),
          key: (fl === null ? f.y : fl) + z, sw: it.shadow === false ? 0 : num(it.shadow, halfW(a) * 2 * P.shadowScale), reach: it.reach || null });
      }
      return out;
    }
    function render(ctx, list) {
      if (!ctx) return [];
      var items = prep(list), drawn = [], cues = [];
      ST.renders++;
      try {
        // 1. contact shadows, all on the floor, under every sprite
        for (var i = 0; i < items.length; i++) {
          var it = items[i]; it.sh = null;
          if (it.floor === null) { ST.noFloor++; continue; }
          if (!it.sw) continue;
          var s = toScreen(it.f.x, it.floor + it.z), k = Math.min(1, (it.lift || 0) / Math.max(1, P.shadowFade));
          it.sh = shadow(ctx, s.x, s.y, it.sw * P.zoom, k); it.shAt = { x: s.x, y: s.y }; ST.shadows++;
        }
        // 2. reach cues on the floor
        if (P.cue === 'on') for (i = 0; i < items.length; i++) if (items[i].reach) { var c = cueStrip(ctx, items[i]); if (c) cues.push(c); }
      } catch (e) { ST.drawErrors++; }
      // 3. actors by floor contact line (stable), each shifted down by its depth
      items.sort(function (p, q) { return p.key - q.key || p.i - q.i; });
      for (i = 1; i < items.length; i++) if (items[i].key < items[i - 1].key) ST.orderBad++;
      var px = isPixel();
      for (i = 0; i < items.length; i++) {
        var q = items[i], dz = q.z * P.zoom; if (px) dz = Math.round(dz);
        ctx.save();
        try { ctx.translate(0, dz); if (typeof q.draw === 'function') q.draw(ctx, q.a, dz); } catch (e) { ST.drawErrors++; }
        ctx.restore();
        var fs = toScreen(q.f.x, q.f.y);
        drawn.push({ id: q.id, x: fs.x, y: fs.y + dz, z: q.z, key: q.key, lift: q.lift, floor: q.floor, shadow: q.sh, shadowAt: q.shAt || null });
      }
      ST.actorsDrawn += items.length; if (items.length > ST.maxActors) ST.maxActors = items.length;
      last.order = drawn.map(function (d) { return d.id; }); last.items = drawn; last.cues = cues;
      // the player's band must be in view
      var pl = options.player ? call(options.player, [], null) : null;
      if (pl && view && options.camera) { var pf = feet(pl), fl2 = pf ? floorUnder(pl, pf) : null, cam = call(options.camera, [], null); if (fl2 !== null && cam) { var top = (fl2 - num(cam.y, 0)) * P.zoom, bot = (fl2 + P.depth - num(cam.y, 0)) * P.zoom; if (top < 0 || bot > num(view.h, 1e9)) ST.bandOut++; } }
      return drawn;
    }
    // vertical camera: keep the player's floor band (and headroom above it) in view. camY / viewH / levelH in world px.
    function frameY(camY, viewH, levelH) {
      var pl = options.player ? call(options.player, [], null) : null; if (!pl) return camY;
      var f = feet(pl), fl = f ? floorUnder(pl, f) : null; if (fl === null) return camY;
      var vh = num(viewH, view ? num(view.h, 180) / P.zoom : 180), top = fl - P.headroom, bot = fl + P.depth + P.bandMargin, y = camY;
      if (bot > y + vh) y = bot - vh;
      if (top < y) y = top;
      if (levelH != null) y = Math.max(0, Math.min(num(levelH, 0) - vh, y));
      return y;
    }

    var api = {
      version: VERSION,
      params: function () { var o = {}; for (var q in P) o[q] = P[q]; return o; },
      setParams: function (p) { for (var q in (p || {})) if (q in DEFAULTS && p[q] != null) P[q] = p[q]; norm(); return api.params(); },
      update: function () { ST.steps++; },
      z: zOf, place: function (a, z) { return setZ(a, z == null ? P.depth / 2 : z), zOf(a); }, lane: lane,
      walk: walk, steer: steer, chase: chase, inReach: inReach,
      feet: feet, floorAt: floorAt, floorUnder: floorUnder, lift: lift,
      setFloors: setFloors, gridFloors: gridFloors, floors: function () { return floors.slice(); },
      drawFloor: drawFloor, render: render, frameY: frameY,
      sortKey: function (a) { var f = feet(a); if (!f) return null; var fl = floorUnder(a, f); return (fl === null ? f.y : fl) + zOf(a); },
      player: function () { return options.player ? call(options.player, [], null) : null; },
      lastDrawn: function () { return last.items.slice(); }, lastOrder: function () { return last.order.slice(); }, lastCues: function () { return last.cues.slice(); },
      reachLog: function () { return reachLog.slice(); },
      stats: function () { var o = {}; for (var q in ST) o[q] = ST[q]; o.floors = floors.length; o.depth = P.depth; o.tolerance = P.tolerance; o.render = isPixel() ? 'pixel' : 'smooth'; return o; },
      reset: function () { reachLog.length = 0; last.order = []; last.items = []; last.cues = []; }
    };
    return api;
  }

  root.GameDNA_BeltDepth = { create: create, version: VERSION, defaults: (function () { var o = {}; for (var q in DEFAULTS) o[q] = DEFAULTS[q]; return o; })(), palettes: Object.keys(PAL) };
})(typeof window !== 'undefined' ? window : this);
