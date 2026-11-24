/* GameDNA_SpriteStack (K-02 sprite stacking) v1.0.0 - plain script, no dependencies, one global.
 *
 * Pseudo-3D objects from stacked pixel slices. Every object is a small voxel model (built in code or given as slice
 * data); the module bakes it, for one view angle, into a picture made of its horizontal slices drawn bottom to top, one
 * screen row of height after the other (so no gap ever opens between slices), shaded per face with one light, outlined,
 * with a cast shadow. Objects rotate (each its own angle, plus an optional camera yaw that turns the whole world) and are
 * drawn in the right depth order with the game's own flat sprites: the sort compares ground footprints in camera space,
 * so a character stands behind a tree when its feet are behind the tree's footprint, from every side.
 *
 *   var ss = GameDNA_SpriteStack.create({voxel: 1, lift: 1, pitch: 1, outline: true, shadows: 0.32});
 *   list.push(ss.item('tree', x, y, {seed: 3, angle: 0.4}));        // a stacked object, feet = ground centre (world px)
 *   list.push({x: hx, y: hy, w: 12, draw: drawHero});                // the game's flat sprite: feet x, y and width
 *   ss.drawShadows(ctx, list);                                      // after the ground, before the sprites
 *   ss.draw(ctx, list);                                             // sorts (footprints) and draws everything
 *
 * ASCII only. Deterministic: bakes depend only on the model, the angle bucket and the options.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var TAU = Math.PI * 2;

  /* ------------------------------------------------------------------ helpers */
  function num(v, d) { return v == null || v === '' || !isFinite(+v) ? d : +v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hash(a, b, c) {
    var h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35) ^ Math.imul((c | 0) + 0x27d4eb2f, 0x165667b1);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  function rgb(hex) {
    var s = String(hex || '#ff00ff').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function normAngle(a) { a = a % TAU; return a < 0 ? a + TAU : a; }

  /* ------------------------------------------------------------------ voxel model */
  // index = (z * d + y) * w + x; x to the right, y toward the viewer (front), z up. Colour 0 = empty.
  function Model(w, d, h, name) {
    this.name = name || 'model'; this.w = w | 0; this.d = d | 0; this.h = h | 0;
    this.v = new Uint8Array(this.w * this.d * this.h); this.pal = [null]; this.palKey = {};
  }
  Model.prototype.c = function (hex, glow) {
    var k = hex + (glow ? '!' : ''); if (this.palKey[k]) return this.palKey[k];
    var c = rgb(hex); c.push(glow ? 1 : 0); this.pal.push(c); return (this.palKey[k] = this.pal.length - 1);
  };
  Model.prototype.set = function (x, y, z, ci) {
    x |= 0; y |= 0; z |= 0;
    if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.d || z >= this.h) return;
    this.v[(z * this.d + y) * this.w + x] = ci;
  };
  Model.prototype.get = function (x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.d || z >= this.h) return 0;
    return this.v[(z * this.d + y) * this.w + x];
  };
  Model.prototype.box = function (x0, y0, z0, x1, y1, z1, ci) {
    for (var z = z0; z <= z1; z++) for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) this.set(x, y, z, typeof ci === 'function' ? ci(x, y, z) : ci);
  };
  // finish: footprint hulls, per-layer bounds, side normals
  Model.prototype.finish = function () {
    var w = this.w, d = this.d, h = this.h, x, y, z, i;
    var col = new Uint8Array(w * d), base = new Uint8Array(w * d), baseTop = Math.max(1, Math.round(h * 0.15));
    this.lay = [];
    for (z = 0; z < h; z++) {
      var b = [1e9, 1e9, -1e9, -1e9], any = false;
      for (y = 0; y < d; y++) for (x = 0; x < w; x++) if (this.v[(z * d + y) * w + x]) {
        any = true; col[y * w + x] = 1; if (z < baseTop) base[y * w + x] = 1;
        if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x + 1 > b[2]) b[2] = x + 1; if (y + 1 > b[3]) b[3] = y + 1;
      }
      this.lay.push(any ? b : null);
    }
    var cx = w / 2, cy = d / 2;
    function hullOf(m) {
      var pts = [];
      for (y = 0; y < d; y++) for (x = 0; x < w; x++) if (m[y * w + x]) {
        pts.push([x - cx, y - cy], [x + 1 - cx, y - cy], [x - cx, y + 1 - cy], [x + 1 - cx, y + 1 - cy]);
      }
      return convexHull(pts);
    }
    this.hull = hullOf(col); this.baseHull = hullOf(base);
    if (!this.baseHull.length) this.baseHull = this.hull;
    var r = 0; for (i = 0; i < this.hull.length; i++) r = Math.max(r, Math.hypot(this.hull[i][0], this.hull[i][1]));
    this.radius = r;
    // side normal per voxel from its empty neighbours in the same layer (8-neighbourhood, diagonals weighted)
    this.nx = new Int8Array(w * d * h); this.ny = new Int8Array(w * d * h);
    for (z = 0; z < h; z++) for (y = 0; y < d; y++) for (x = 0; x < w; x++) {
      i = (z * d + y) * w + x; if (!this.v[i]) continue;
      var sx = 0, sy = 0;
      for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        if (!this.get(x + ox, y + oy, z)) { var k = ox && oy ? 0.7 : 1; sx += ox * k; sy += oy * k; }
      }
      var L = Math.hypot(sx, sy);
      if (L > 0.01) { this.nx[i] = Math.round(sx / L * 100); this.ny[i] = Math.round(sy / L * 100); }
    }
    this.voxels = 0; for (i = 0; i < this.v.length; i++) if (this.v[i]) this.voxels++;
    return this;
  };
  function convexHull(pts) {
    if (pts.length < 3) return pts.slice();
    pts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var cross = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
    var lo = [], up = [], i;
    for (i = 0; i < pts.length; i++) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop(); lo.push(pts[i]); }
    for (i = pts.length - 1; i >= 0; i--) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) up.pop(); up.push(pts[i]); }
    up.pop(); lo.pop(); return lo.concat(up);
  }

  /* ------------------------------------------------------------------ slice data -> model */
  // spec: {palette: {a: '#hex', b: ['#hex', 'glow']}, layers: [[rows], [rows], ...] bottom first, repeat: [n, n, ...]}
  // Rows run back (top line) to front (bottom line); '.' or ' ' = empty.
  function fromSlices(spec, name) {
    var layers = spec.layers || [], rep = spec.repeat || [], i, j;
    var w = 0, d = 0, h = 0;
    for (i = 0; i < layers.length; i++) { d = Math.max(d, layers[i].length); for (j = 0; j < layers[i].length; j++) w = Math.max(w, String(layers[i][j]).length); h += Math.max(1, rep[i] | 0 || 1); }
    var m = new Model(Math.max(1, w), Math.max(1, d), Math.max(1, h), name), idx = {}, z = 0, pal = spec.palette || {};
    for (var k in pal) { var p = pal[k]; idx[k] = Array.isArray(p) ? m.c(p[0], p[1] === 'glow') : m.c(p); }
    for (i = 0; i < layers.length; i++) {
      var n = Math.max(1, rep[i] | 0 || 1);
      for (var r = 0; r < n; r++, z++) for (j = 0; j < layers[i].length; j++) {
        var row = String(layers[i][j]);
        for (var x = 0; x < row.length; x++) { var ch = row.charAt(x); if (idx[ch]) m.set(x, j, z, idx[ch]); }
      }
    }
    return m.finish();
  }

  /* ------------------------------------------------------------------ built-in models (drawn in code) */
  var RAMP = {
    plank: ['#4a2a18', '#6a4424', '#8a5a32', '#a87240', '#c48c50', '#ddb070'],
    leaf: ['#173a2c', '#1f4f30', '#2a6632', '#3c8438', '#58a444', '#84c656'],
    pine: ['#0e2a2c', '#184034', '#22583a', '#32743e', '#4c9248'],
    bark: ['#3a2418', '#553620', '#6e4a2c', '#8a6038'],
    stone: ['#3a3448', '#58506a', '#7a7088', '#9c94a8', '#c4bccc'],
    rock: ['#3e3442', '#5a4c58', '#786a70', '#9a8a88', '#bcab9c'],
    plaster: ['#9c8c74', '#c8b898', '#e2d4b4', '#f2e8d0'],
    roof: { red: ['#5a1c22', '#7e2a2e', '#a8403a', '#c85e48', '#e08460'], blue: ['#1c2650', '#2c4078', '#3c5c9c', '#5a7cbc', '#86a6dc'],
      slate: ['#26243a', '#3c3a52', '#565470', '#74728c', '#9a98b0'], thatch: ['#5a4018', '#7e5c26', '#a07c34', '#c09c48', '#dcbc68'],
      green: ['#173a2a', '#24543a', '#33704a', '#4a8e5e', '#6aae78'] },
    iron: ['#26222e', '#3c3846', '#5a5666', '#828092']
  };
  var BUILD = {};
  BUILD.crate = function (o) {
    var s = clamp(Math.round(num(o.size, 10)), 5, 40), h = Math.max(4, Math.round(s * 0.9)), m = new Model(s, s, h, 'crate'), P = RAMP.plank;
    var base = m.c(P[3]), seam = m.c(P[2]), frame = m.c(P[1]), lid = m.c(P[4]), lidSeam = m.c(P[3]), nail = m.c('#c8c0b0');
    var band = Math.max(3, Math.round(s / 3.4));
    m.box(0, 0, 0, s - 1, s - 1, h - 1, function (x, y, z) {
      var edgeX = x === 0 || x === s - 1, edgeY = y === 0 || y === s - 1;
      if (z === h - 1) {
        if (edgeX || edgeY) return frame;
        return (y % band === band - 1) ? lidSeam : lid;
      }
      if ((edgeX && edgeY) || z === 0) return frame;
      if (z === h - 2 && (edgeX || edgeY)) return frame;
      if (edgeX || edgeY) {
        var u = edgeX ? y : x;
        if (Math.abs(u - (s - 1) * (z / (h - 1))) < 0.75 && s >= 8) return frame;   // diagonal brace
        if (z % band === band - 1) return seam;
        if ((u === 1 || u === s - 2) && z % band === 1) return nail;
      }
      return base;
    });
    return m.finish();
  };
  BUILD.barrel = function (o) {
    var s = clamp(Math.round(num(o.size, 9)), 5, 40), h = Math.max(5, Math.round(s * 1.25)), m = new Model(s, s, h, 'barrel'), P = RAMP.plank;
    var st = [m.c(P[3]), m.c(P[4]), m.c(P[2])], hoop = m.c(RAMP.iron[2]), hoopL = m.c(RAMP.iron[3]), top = m.c(P[2]), topR = m.c(P[1]);
    var c = s / 2, R = s / 2;
    for (var z = 0; z < h; z++) {
      var r = R * (0.84 + 0.16 * Math.sin(Math.PI * (z + 0.5) / h)) - 0.05;
      for (var y = 0; y < s; y++) for (var x = 0; x < s; x++) {
        var dx = x + 0.5 - c, dy = y + 0.5 - c, dd = Math.hypot(dx, dy); if (dd > r) continue;
        var ci;
        if (z === h - 1) ci = dd > r - 1.2 ? topR : top;
        else if (z === 1 || z === h - 2 || z === Math.round(h * 0.5)) ci = (Math.atan2(dy, dx) > 0.6 && Math.atan2(dy, dx) < 2.2) ? hoopL : hoop;
        else { var a = Math.atan2(dy, dx); ci = st[Math.floor((a + Math.PI) / TAU * Math.max(6, s)) % 2 === 0 ? 0 : (dd > r - 1 && ((x * 7 + z) % 11 === 0) ? 2 : 1)]; }
        m.set(x, y, z, ci);
      }
    }
    return m.finish();
  };
  BUILD.tree = function (o) {
    var s = clamp(Math.round(num(o.size, 14)), 7, 48), h = Math.max(8, Math.round(s * 1.55)), m = new Model(s, s, h, 'tree'), seed = num(o.seed, 1) | 0;
    var L = RAMP.leaf, B = RAMP.bark, leaf = L.map(function (c) { return m.c(c); }), bark = B.map(function (c) { return m.c(c); });
    if (o.autumn) { leaf = ['#4a1c1c', '#7a2c20', '#a8482a', '#cc7030', '#e89a44', '#f8c868'].map(function (c) { return m.c(c); }); }
    var c = s / 2, tr = Math.max(0.9, s * 0.1), trunkTop = Math.round(h * 0.5);
    for (var z = 0; z <= trunkTop; z++) {
      var rr = tr + (z < 2 ? (2 - z) * 0.55 : 0);
      for (var y = 0; y < s; y++) for (var x = 0; x < s; x++) {
        var dx = x + 0.5 - c, dy = y + 0.5 - c; if (Math.hypot(dx, dy) > rr) continue;
        m.set(x, y, z, bark[(x + z * 3 + (y * 5)) % 7 === 0 ? 0 : dx < 0 ? 3 : dy > 0 ? 2 : 1]);
      }
    }
    // canopy: 4-6 seeded lobes
    var lobes = [], n = 4 + Math.floor(hash(seed, 2, 9) * 3);
    lobes.push([c, c, h * 0.66, s * 0.4]);
    for (var i = 0; i < n; i++) {
      var a = i / n * TAU + hash(seed, i, 3) * 0.8, d = s * (0.14 + hash(seed, i, 4) * 0.1);
      lobes.push([c + Math.cos(a) * d, c + Math.sin(a) * d, h * (0.5 + hash(seed, i, 5) * 0.28), s * (0.24 + hash(seed, i, 6) * 0.08)]);
    }
    for (z = Math.round(h * 0.3); z < h; z++) for (y = 0; y < s; y++) for (x = 0; x < s; x++) {
      var px = x + 0.5, py = y + 0.5, pz = z + 0.5, inside = -1;
      for (var k = 0; k < lobes.length; k++) {
        var q = lobes[k], e = Math.hypot(px - q[0], py - q[1], (pz - q[2]) * 1.15) / q[3];
        if (e < 1) inside = Math.max(inside, 1 - e);
      }
      if (inside < 0) continue;
      var nz = (pz - h * 0.3) / (h * 0.7), nn = hash(x * 13 + seed, y * 7, z * 3);
      var tone = clamp(Math.floor(nz * 3.2 + nn * 1.6), 0, 4);
      if (nn > 0.94 && nz > 0.45) tone = 5;
      if (nn < 0.05 && inside < 0.25) continue;   // ragged edge
      m.set(x, y, z, leaf[tone]);
    }
    return m.finish();
  };
  BUILD.pine = function (o) {
    var s = clamp(Math.round(num(o.size, 11)), 6, 40), h = Math.max(10, Math.round(s * 2.2)), m = new Model(s, s, h, 'pine'), seed = num(o.seed, 1) | 0;
    var P = RAMP.pine.map(function (c) { return m.c(c); }), bark = m.c(RAMP.bark[1]), barkL = m.c(RAMP.bark[2]);
    var c = s / 2, tiers = 4;
    for (var z = 0; z < h; z++) for (var y = 0; y < s; y++) for (var x = 0; x < s; x++) {
      var dx = x + 0.5 - c, dy = y + 0.5 - c, dd = Math.hypot(dx, dy);
      if (z < h * 0.32 && dd < Math.max(0.8, s * 0.09)) { m.set(x, y, z, dx < 0 ? barkL : bark); continue; }
      if (z < h * 0.16) continue;
      var t = (z - h * 0.16) / (h * 0.84), tier = Math.min(tiers - 1, Math.floor(t * tiers)), ft = t * tiers - tier;
      var rmax = (s / 2) * (1 - tier / tiers * 0.72) * (1 - ft * 0.62) + 0.3;
      var jag = hash(Math.round(Math.atan2(dy, dx) * 4) + seed, tier, 1) * 0.9;
      if (dd > rmax - jag * (ft < 0.3 ? 1 : 0.3)) continue;
      var tone = clamp(Math.floor(ft * 2.2 + (dx < 0 ? 1.2 : 0) + (dy > 0 ? 0.5 : 0)), 0, 4);
      if (dd > rmax - 1.1 && ft < 0.25) tone = Math.max(0, tone - 1);
      m.set(x, y, z, P[tone]);
    }
    return m.finish();
  };
  BUILD.bush = function (o) {
    var s = clamp(Math.round(num(o.size, 9)), 4, 30), h = Math.max(3, Math.round(s * 0.62)), m = new Model(s, s, h, 'bush'), seed = num(o.seed, 1) | 0;
    var L = RAMP.leaf.map(function (c) { return m.c(c); }), berry = m.c('#d8384a'), berryL = m.c('#ff7a7a');
    var c = s / 2;
    for (var z = 0; z < h; z++) for (var y = 0; y < s; y++) for (var x = 0; x < s; x++) {
      var e = Math.hypot(x + 0.5 - c, y + 0.5 - c, (z + 0.5) * (s / 2) / h * 0.95) / (s / 2);
      var nn = hash(x + seed * 17, y, z);
      if (e > 1 - nn * 0.12) continue;
      var tone = clamp(Math.floor(z / h * 3.5 + nn), 1, 5);
      m.set(x, y, z, o.berries !== false && nn > 0.95 && z > h * 0.4 ? (nn > 0.975 ? berryL : berry) : L[tone]);
    }
    return m.finish();
  };
  BUILD.rock = function (o) {
    var s = clamp(Math.round(num(o.size, 12)), 4, 48), d = Math.max(3, Math.round(s * 0.8)), h = Math.max(3, Math.round(s * 0.55)), m = new Model(s, d, h, 'rock'), seed = num(o.seed, 1) | 0;
    var R = RAMP.rock.map(function (c) { return m.c(c); }), moss = m.c('#5a8a3c'), mossL = m.c('#7caa4c');
    for (var z = 0; z < h; z++) for (var y = 0; y < d; y++) for (var x = 0; x < s; x++) {
      var u = (x + 0.5) / s * 2 - 1, v = (y + 0.5) / d * 2 - 1, w = (z + 0.5) / h;
      var bump = (hash(Math.floor(x / 2) + seed, Math.floor(y / 2), 7) - 0.5) * 0.22 + (hash(Math.floor(x / 3), Math.floor(y / 3) + seed, 8) - 0.5) * 0.2;
      var e = Math.hypot(u, v) * (0.8 + w * 0.55) + w * w * 0.45;
      if (e > 1 + bump) continue;
      var nn = hash(x, y + seed * 5, z);
      var tone = clamp(Math.floor(w * 2.6 + nn * 1.2 + (u < 0 ? 0.6 : 0)), 0, 4);
      if (z >= h - 2 && nn > 0.55 && o.moss !== false) m.set(x, y, z, nn > 0.8 ? mossL : moss);
      else m.set(x, y, z, R[tone]);
    }
    return m.finish();
  };
  BUILD.house = function (o) {
    var w = clamp(Math.round(num(o.w, 30)), 10, 96), d = clamp(Math.round(num(o.d, 22)), 8, 80);
    var wallH = clamp(Math.round(num(o.wallH, Math.min(w, d) * 0.48)), 5, 60), ov = Math.max(1, Math.round(d * 0.07));
    var rise = Math.round((d / 2 + ov) * clamp(num(o.slope, 0.8), 0.3, 1.4));
    var h = wallH + rise + Math.max(3, Math.round(wallH * 0.3)), m = new Model(w, d, h, 'house');
    var roofName = RAMP.roof[o.roof] ? o.roof : 'red', RF = RAMP.roof[roofName].map(function (c) { return m.c(c); });
    var PL = RAMP.plaster.map(function (c) { return m.c(c); }), TB = m.c(o.timber || '#5a3a22'), TBL = m.c('#7a5232'), FND = m.c(RAMP.stone[1]), FNDL = m.c(RAMP.stone[2]);
    var GL = m.c('#24304e'), GLL = m.c('#4c6a9c'), LIT = m.c('#ffd27a', true), DOOR = m.c('#6a3c1e'), DOORL = m.c('#8a5428'), KNOB = m.c('#f0c040');
    var CH = m.c(RAMP.stone[2]), CHD = m.c(RAMP.stone[1]), CHT = m.c('#2a2632');
    var x0 = ov, x1 = w - 1 - ov, y0 = ov + 1, y1 = d - 1 - ov, mid = (d - 1) / 2;
    var doorW = Math.max(2, Math.round((x1 - x0) * 0.14)), doorH = Math.max(3, Math.round(wallH * 0.7)), dc = Math.round((x0 + x1) / 2);
    var winW = Math.max(2, Math.round((x1 - x0) * 0.12)), winZ0 = Math.round(wallH * 0.35), winZ1 = Math.min(wallH - 2, winZ0 + Math.max(2, Math.round(wallH * 0.32)));
    var lit = o.lit !== false;
    function wallCol(x, y, z) {
      var onX = x === x0 || x === x1, onY = y === y0 || y === y1;
      if (z <= 1) return (x + y + z) % 3 === 0 ? FNDL : FND;
      if (onX && onY) return TB;
      if (z === wallH - 1 || z === Math.round(wallH * 0.55)) return TB;
      // front (y1) door and windows; side windows
      if (y === y1) {
        if (Math.abs(x - dc) <= doorW / 2 && z < doorH) return Math.abs(x - dc) >= doorW / 2 - 0.5 || z === doorH - 1 ? TBL : (x === dc + Math.floor(doorW / 2) - 1 && z === Math.round(doorH * 0.5) ? KNOB : (x % 2 ? DOOR : DOORL));
        var wl = Math.round(x0 + (x1 - x0) * 0.22), wr = Math.round(x0 + (x1 - x0) * 0.78);
        if ((Math.abs(x - wl) <= winW / 2 || Math.abs(x - wr) <= winW / 2) && z >= winZ0 && z <= winZ1) {
          var edge = Math.abs(x - wl) >= winW / 2 - 0.5 && Math.abs(x - wl) <= winW / 2 || Math.abs(x - wr) >= winW / 2 - 0.5 && Math.abs(x - wr) <= winW / 2 || z === winZ0 || z === winZ1;
          return edge ? TBL : (lit && x > dc ? LIT : (z === winZ1 - 1 ? GLL : GL));
        }
      }
      if (onX && Math.abs(y - mid) <= winW / 2 && z >= winZ0 && z <= winZ1) return (Math.abs(y - mid) >= winW / 2 - 0.5 || z === winZ0 || z === winZ1) ? TBL : GL;
      if (y === y0 && Math.abs(x - dc) <= winW / 2 && z >= winZ0 && z <= winZ1) return (Math.abs(x - dc) >= winW / 2 - 0.5 || z === winZ0 || z === winZ1) ? TBL : GL;
      if ((onX && (y - y0) % 7 === 3) || (onY && (x - x0) % 7 === 3)) return TB;
      return PL[(hash(x, y, z) > 0.9 ? 1 : 2) + (onX && x === x0 ? 1 : 0)];
    }
    var x, y, z;
    for (z = 0; z < wallH; z++) for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) m.set(x, y, z, wallCol(x, y, z));
    // gable ends (plaster triangles) and the roof
    for (y = 0; y < d; y++) {
      var dist = Math.abs(y - mid), top = wallH + Math.round((d / 2 - dist) * (rise / (d / 2 + ov)));
      for (z = wallH; z <= top; z++) {
        if (y >= y0 && y <= y1 && z < top - 1) { m.set(x0, y, z, PL[1]); m.set(x1, y, z, PL[2]); for (x = x0 + 1; x < x1; x++) m.set(x, y, z, PL[2]); }
      }
      // roof slab: 2 voxels thick along the slope, from x = 0 to w - 1
      for (z = Math.max(wallH - 1, top - 2); z <= top; z++) for (x = 0; x < w; x++) {
        var ridge = dist < 1, row = Math.floor((d / 2 - dist) / 2.2);
        var ci = ridge ? RF[0] : (z === top ? RF[row % 2 ? 2 : 3] : RF[1]);
        if (!ridge && z === top && (x === 0 || x === w - 1)) ci = RF[1];
        if (!ridge && z === top && hash(x, y, 11) > 0.93) ci = RF[4];
        m.set(x, y, z, ci);
      }
    }
    // chimney
    if (o.chimney !== false) {
      var cx0 = Math.round(x0 + (x1 - x0) * 0.72), cy0 = Math.round(mid - 1), cw = Math.max(2, Math.round(w * 0.07));
      for (z = wallH; z < h; z++) for (y = cy0; y < cy0 + cw; y++) for (x = cx0; x < cx0 + cw; x++) m.set(x, y, z, z === h - 1 ? ((x === cx0 || y === cy0 || x === cx0 + cw - 1 || y === cy0 + cw - 1) ? CH : CHT) : ((x + z) % 3 === 0 ? CHD : CH));
    }
    return m.finish();
  };
  BUILD.well = function (o) {
    var s = clamp(Math.round(num(o.size, 13)), 9, 40), k = s / 13, h = Math.round(16 * k), m = new Model(s, s, h, 'well');
    var ST = RAMP.stone.map(function (c) { return m.c(c); }), WA = m.c('#2a5ab0'), WAL = m.c('#6aa8f0'), WD = m.c(RAMP.plank[2]), WDL = m.c(RAMP.plank[4]);
    var RF = RAMP.roof.red.map(function (c) { return m.c(c); }), ROPE = m.c('#d8c08a'), BK = m.c(RAMP.plank[3]), BKH = m.c(RAMP.iron[2]);
    var c = s / 2, R = s / 2 - 0.2, ri = R - Math.max(1.4, 2 * k), ringH = Math.round(5 * k), x, y, z;
    h = Math.max(h, Math.round(16 * k) + 2); m = new Model(s, s, h, 'well'); ST = RAMP.stone.map(function (c) { return m.c(c); }); WA = m.c('#2a5ab0'); WAL = m.c('#6aa8f0'); WD = m.c(RAMP.plank[2]); WDL = m.c(RAMP.plank[4]); RF = RAMP.roof.red.map(function (c) { return m.c(c); }); ROPE = m.c('#d8c08a'); BK = m.c(RAMP.plank[3]); BKH = m.c(RAMP.iron[2]);
    for (z = 0; z < ringH; z++) for (y = 0; y < s; y++) for (x = 0; x < s; x++) {
      var dd = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (dd > R) continue;
      if (dd < ri) { if (z === ringH - 2) m.set(x, y, z, hash(x, y, 1) > 0.8 ? WAL : WA); continue; }
      var brick = (Math.floor((Math.atan2(y + 0.5 - c, x + 0.5 - c) + Math.PI) / TAU * 14) + (z >> 1)) % 2;
      m.set(x, y, z, z === ringH - 1 ? ST[4] : (brick ? ST[2] : ST[3]));
    }
    var pz = h - Math.round(4 * k), px0 = Math.round(c - R + 0.6), px1 = Math.round(c + R - 1.6), py = Math.floor(c);
    for (z = ringH - 1; z < pz; z++) { m.set(px0, py, z, WDL); m.set(px1, py, z, WD); }
    for (x = px0; x <= px1; x++) m.set(x, py, pz - 1, x === Math.round(c) ? WDL : WD);
    for (z = Math.round(ringH + 2 * k); z < pz - 1; z++) m.set(Math.round(c), py, z, ROPE);
    var bz = Math.round(ringH + 1 * k); for (y = py - 1; y <= py + 1; y++) for (x = Math.round(c) - 1; x <= Math.round(c) + 1; x++) { m.set(x, y, bz, BK); m.set(x, y, bz + 1, (x + y) % 2 ? BK : BKH); }
    // a small pyramid roof: square tiers, so it reads the same from every side
    var cc = (px0 + px1) / 2, hs0 = (px1 - px0) / 2 + 1.2, tiers = Math.max(3, Math.round(3.5 * k));
    for (var tz = 0; tz < tiers; tz++) {
      var hs = hs0 * (1 - tz / tiers) + 0.2;
      for (y = 0; y < s; y++) for (x = 0; x < s; x++) {
        var ax = Math.abs(x + 0.5 - (cc + 0.5)), ay = Math.abs(y + 0.5 - (py + 0.5)), e = Math.max(ax, ay);
        if (e > hs) continue;
        m.set(x, y, pz - 1 + tz, tz === tiers - 1 ? RF[0] : (e > hs - 1 ? RF[1] : RF[(Math.floor(e) + tz) % 2 ? 2 : 3]));
      }
    }
    return m.finish();
  };
  BUILD.stall = function (o) {
    var w = clamp(Math.round(num(o.w, 16)), 8, 48), d = clamp(Math.round(num(o.d, 10)), 6, 32), h = Math.round(d * 1.3), m = new Model(w, d, h, 'stall'), seed = num(o.seed, 1) | 0;
    var WD = m.c(RAMP.plank[2]), WDL = m.c(RAMP.plank[4]), WDD = m.c(RAMP.plank[1]);
    var A = m.c(o.cloth || '#c8384a'), AL = m.c(o.cloth2 || '#f2e6c8');
    var goods = ['#e8483a', '#f0c030', '#7cc040', '#f08a30', '#b05ae0'].map(function (c) { return m.c(c); });
    var x, y, z, tz = Math.round(h * 0.35);
    for (y = 2; y < d - 1; y++) for (x = 1; x < w - 1; x++) for (z = 0; z <= tz; z++) {
      var edge = y === d - 2 || x === 1 || x === w - 2;
      if (z === tz) m.set(x, y, z, WDL); else if (edge) m.set(x, y, z, (x + z) % 4 === 0 ? WDD : WD);
    }
    for (y = 3; y < d - 2; y++) for (x = 2; x < w - 2; x++) if (hash(x + seed, y, 4) > 0.35) m.set(x, y, tz + 1, goods[Math.floor(hash(Math.floor(x / 2) + seed, Math.floor(y / 2), 5) * goods.length)]);
    var postZ = h - 3;
    [[1, 2], [w - 2, 2], [1, d - 2], [w - 2, d - 2]].forEach(function (p) { for (z = 0; z < postZ + 1; z++) m.set(p[0], p[1], z, WDD); });
    for (y = 0; y < d; y++) {
      var top = postZ + Math.round((d - 1 - y) / (d - 1) * 2);
      for (x = 0; x < w; x++) m.set(x, y, top, (Math.floor(x / 2) % 2) ? AL : A);
      if (y === d - 1) for (x = 0; x < w; x++) if (x % 2 === 0) m.set(x, y, top - 1, (Math.floor(x / 2) % 2) ? AL : A);
    }
    return m.finish();
  };
  function wheel(m, cx, y, cz, r, rim, spoke, hub) {
    for (var z = 0; z < m.h; z++) for (var x = 0; x < m.w; x++) {
      var dd = Math.hypot(x + 0.5 - cx, z + 0.5 - cz); if (dd > r) continue;
      var a = Math.atan2(z + 0.5 - cz, x + 0.5 - cx);
      m.set(x, y, z, dd > r - 1 ? rim : dd < 0.9 ? hub : (Math.abs(Math.sin(a * 2)) < 0.38 ? spoke : 0));
    }
  }
  BUILD.cart = function (o) {
    var w = clamp(Math.round(num(o.size, 15)), 9, 48), d = Math.max(7, Math.round(w * 0.62)), h = Math.max(6, Math.round(w * 0.55)), m = new Model(w, d, h, 'cart');
    var WD = m.c(RAMP.plank[3]), WDL = m.c(RAMP.plank[4]), WDD = m.c(RAMP.plank[1]), RIM = m.c(RAMP.iron[1]), SP = m.c(RAMP.plank[2]), HUB = m.c(RAMP.iron[3]);
    var hay = [m.c('#c8a040'), m.c('#e8c868'), m.c('#a88030')];
    var bx0 = 1, bx1 = w - 5, z0 = Math.round(h * 0.38), x, y, z, r = h * 0.38;
    for (z = z0; z < h - 1; z++) for (y = 1; y < d - 1; y++) for (x = bx0; x <= bx1; x++) {
      var wall = y === 1 || y === d - 2 || x === bx0 || x === bx1 || z === z0;
      if (wall) m.set(x, y, z, z === h - 2 ? WDL : ((x - bx0) % 4 === 3 ? WDD : WD));
      else if (o.load !== false && z < h - 1) m.set(x, y, z, hay[Math.floor(hash(x, y, z) * 3)]);
    }
    if (o.load !== false) for (y = 2; y < d - 2; y++) for (x = bx0 + 1; x < bx1; x++) if (hash(x, y, 9) > 0.3) m.set(x, y, h - 1, hay[1]);
    for (x = bx1 + 1; x < w; x++) { m.set(x, 2, z0 + 1, WDD); m.set(x, d - 3, z0 + 1, WDD); }
    m.set(w - 1, 3, z0 + 1, WDL); m.set(w - 1, d - 4, z0 + 1, WDL); for (y = 3; y <= d - 4; y++) m.set(w - 1, y, z0 + 1, WDL);
    wheel(m, (bx0 + bx1 + 1) / 2, 0, r, r, RIM, SP, HUB); wheel(m, (bx0 + bx1 + 1) / 2, d - 1, r, r, RIM, SP, HUB);
    return m.finish();
  };
  BUILD.buggy = function (o) {
    var w = clamp(Math.round(num(o.size, 18)), 12, 54), k = w / 18, d = Math.round(11 * k), h = Math.round(12 * k), m = new Model(w, d, h, 'buggy');
    var BODY = m.c(o.paint || '#2a8a9a'), BODYL = m.c(o.paint2 || '#4cb8c0'), BODYD = m.c('#1c5a6a'), TRIM = m.c('#e0b040'), TIRE = m.c('#2a2430'), TIREL = m.c('#4a4252'), HUB = m.c('#c8c0b0');
    var SEAT = m.c('#7a2a30'), SEATL = m.c('#a04040'), LAMP = m.c('#fff0a0', true), SKIN = m.c('#f2c08f'), CAP = m.c('#d84a3a'), CAPL = m.c('#f07050'), SHIRT = m.c('#3c5aa8'), STEER = m.c(RAMP.iron[1]);
    var x, y, z, r = 2.6 * k;
    function tire(cx, y0, y1) { for (y = y0; y <= y1; y++) for (z = 0; z < h; z++) for (x = 0; x < w; x++) { var dd = Math.hypot(x + 0.5 - cx, z + 0.5 - r); if (dd <= r) m.set(x, y, z, dd < 1 ? HUB : (z > r ? TIREL : TIRE)); } }
    tire(4 * k, 0, Math.round(k), 0); tire(4 * k, d - 1 - Math.round(k), d - 1); tire(w - 4 * k, 0, Math.round(k)); tire(w - 4 * k, d - 1 - Math.round(k), d - 1);
    var y0 = Math.round(1.5 * k), y1 = d - 1 - Math.round(1.5 * k), zc = Math.round(2 * k);
    for (z = zc; z < zc + Math.round(3 * k); z++) for (y = y0; y <= y1; y++) for (x = Math.round(1 * k); x < w - Math.round(1 * k); x++) {
      var edge = y === y0 || y === y1;
      m.set(x, y, z, z === zc ? BODYD : (edge && z === zc + Math.round(3 * k) - 1 ? TRIM : (x > w * 0.62 ? BODYL : BODY)));
    }
    // hood rising toward the front, lamp, seat with backrest, driver
    var hz = zc + Math.round(3 * k);
    for (x = Math.round(w * 0.62); x < w - Math.round(1.5 * k); x++) for (y = y0 + 1; y < y1; y++) for (z = hz; z < hz + Math.round(1.6 * k); z++) m.set(x, y, z, z === hz + Math.round(1.6 * k) - 1 ? BODYL : BODY);
    for (y = y0 + 1; y < y1; y += Math.max(2, Math.round(3 * k))) { m.set(w - Math.round(1 * k), y, zc + 1, LAMP); m.set(w - Math.round(1 * k), y + 1, zc + 1, LAMP); }
    var sx0 = Math.round(w * 0.22), sx1 = Math.round(w * 0.42);
    for (y = y0 + 1; y < y1; y++) { for (x = sx0; x <= sx1; x++) m.set(x, y, hz, SEATL); for (z = hz; z < hz + Math.round(3 * k); z++) m.set(sx0 - 1, y, z, SEAT); }
    var dcx = Math.round((sx0 + sx1) / 2), dcy = Math.round((y0 + y1) / 2);
    for (z = hz + 1; z < hz + Math.round(3 * k); z++) for (y = dcy - 1; y <= dcy + 1; y++) for (x = dcx - 1; x <= dcx; x++) m.set(x, y, z, SHIRT);
    var hz2 = hz + Math.round(3 * k);
    for (z = hz2; z < hz2 + Math.round(2 * k); z++) for (y = dcy - 1; y <= dcy + 1; y++) for (x = dcx - 1; x <= dcx + 1; x++) m.set(x, y, z, SKIN);
    for (y = dcy - 1; y <= dcy + 1; y++) for (x = dcx - 1; x <= dcx + 1; x++) m.set(x, y, hz2 + Math.round(2 * k), (x + y) % 2 ? CAP : CAPL);
    m.set(dcx + 2, dcy, hz2 + Math.round(2 * k), CAP);
    for (z = hz; z < hz + Math.round(2.4 * k); z++) m.set(sx1 + 2, dcy, z, STEER);
    for (y = dcy - 1; y <= dcy + 1; y++) m.set(sx1 + 2, y, hz + Math.round(2.4 * k), STEER);
    return m.finish();
  };
  BUILD.lamp = function (o) {
    var s = 5, h = clamp(Math.round(num(o.size, 18)), 10, 48), m = new Model(s, s, h, 'lamp');
    var ST = m.c(RAMP.stone[2]), STL = m.c(RAMP.stone[3]), IR = m.c(RAMP.iron[1]), IRL = m.c(RAMP.iron[2]), GL = m.c('#ffd86a', true), GLL = m.c('#fff6c8', true);
    var x, y, z;
    for (z = 0; z < 2; z++) for (y = 1; y < 4; y++) for (x = 1; x < 4; x++) m.set(x, y, z, z ? STL : ST);
    for (z = 2; z < h - 4; z++) m.set(2, 2, z, z % 5 === 0 ? IRL : IR);
    for (z = h - 4; z < h - 1; z++) for (y = 1; y < 4; y++) for (x = 1; x < 4; x++) m.set(x, y, z, (x === 2 && y === 2) ? GLL : ((x === 1 || x === 3) && (y === 1 || y === 3) ? IR : GL));
    for (y = 0; y < 5; y++) for (x = 0; x < 5; x++) if (Math.abs(x - 2) + Math.abs(y - 2) <= 3) m.set(x, y, h - 1, IRL);
    m.set(2, 2, h - 1, IR);
    return m.finish();
  };
  BUILD.fence = function (o) {
    var w = clamp(Math.round(num(o.size, 16)), 6, 64), d = 3, h = 7, m = new Model(w, d, h, 'fence');
    var P = m.c(RAMP.plank[2]), PL = m.c(RAMP.plank[4]), RL = m.c(RAMP.plank[3]);
    var x, z;
    for (x = 0; x < w; x++) { m.set(x, 1, 2, RL); m.set(x, 1, 4, RL); }
    for (var px = 1; px < w; px += Math.max(4, Math.round(w / 3))) for (z = 0; z < h; z++) { m.set(px, 1, z, z === h - 1 ? PL : P); m.set(px + 1, 1, z, z === h - 1 ? PL : P); }
    for (z = 0; z < h; z++) { m.set(w - 2, 1, z, z === h - 1 ? PL : P); m.set(w - 1, 1, z, P); }
    return m.finish();
  };
  BUILD.chest = function (o) {
    var w = clamp(Math.round(num(o.size, 11)), 6, 40), d = Math.round(w * 0.66), h = Math.round(w * 0.66), m = new Model(w, d, h, 'chest');
    var WD = m.c('#8a4a2a'), WDL = m.c('#b06a3a'), BAND = m.c('#d0a040'), BANDD = m.c('#9a7028'), LOCK = m.c('#f4e070');
    var lidZ = Math.round(h * 0.55);
    m.box(0, 0, 0, w - 1, d - 1, h - 1, function (x, y, z) {
      if (z >= lidZ) { var yy = y + 0.5 - d / 2, top = lidZ + Math.sqrt(Math.max(0, (d / 2) * (d / 2) - yy * yy)) * ((h - lidZ) / (d / 2)); if (z + 0.5 > top + 0.6) return 0; }
      if (x === 0 || x === w - 1 || x === Math.round(w * 0.3) || x === Math.round(w * 0.7)) return BAND;
      if (z === lidZ - 1) return BANDD;
      if (y === d - 1 && Math.abs(x + 0.5 - w / 2) < 1.1 && Math.abs(z - lidZ + 0.5) < 1.6) return LOCK;
      return z >= lidZ ? WDL : WD;
    });
    return m.finish();
  };
  BUILD.sign = function (o) {
    var w = 9, d = 3, h = 11, m = new Model(w, d, h, 'sign');
    var P = m.c(RAMP.plank[1]), B = m.c(RAMP.plank[3]), BL = m.c(RAMP.plank[4]), INK = m.c('#3a2214');
    for (var z = 0; z < h - 1; z++) m.set(4, 1, z, P);
    for (z = 5; z < h; z++) for (var x = 0; x < w; x++) m.set(x, 1, z, (z === h - 1) ? BL : ((z === 7 || z === 8) && x > 1 && x < w - 2 && (x % 2) ? INK : B));
    return m.finish();
  };
  var BUILTIN = Object.keys(BUILD);

  /* ------------------------------------------------------------------ baking */
  // light: from the front-left, above (camera space: x right, y toward the viewer, z up)
  function lightVec(a) { var az = num(a, -0.62); return [Math.sin(az) * 0.6, Math.cos(az) * 0.6 * 0.55, 0.8]; }
  // voxel under a pixel: the pixel centre first; if that misses, four points 0.3 px around it, so thin (1-voxel) posts and
  // rails never drop out at diagonal angles
  var SUB = [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]];
  function sampleVox(m, mx, my, zl, ca, sa, s) {
    var ix = Math.floor(mx), iy = Math.floor(my), vi;
    if (ix >= 0 && iy >= 0 && ix < m.w && iy < m.d) { vi = (zl * m.d + iy) * m.w + ix; if (m.v[vi]) return vi; }
    for (var k = 0; k < 4; k++) {
      var dx = SUB[k][0], dy = SUB[k][1], qx = mx + (dx * ca + dy * sa) / s, qy = my + (-dx * sa + dy * ca) / s;
      ix = Math.floor(qx); iy = Math.floor(qy);
      if (ix < 0 || iy < 0 || ix >= m.w || iy >= m.d) continue;
      vi = (zl * m.d + iy) * m.w + ix; if (m.v[vi]) return vi;
    }
    return -1;
  }
  // bake one view of a model. angle = model angle in camera space (radians). Pure function of its inputs.
  function bakeData(m, angle, o) {
    o = o || {};
    var s = Math.max(0.25, num(o.scale, 1)), L = Math.max(0.25, num(o.lift, s)), pitch = clamp(num(o.pitch, 1), 0.3, 1);
    var pad = o.outline === false ? 1 : 2, R = 0.5 * Math.hypot(m.w, m.d) * s, gx = Math.ceil(R) + 1, gy = Math.ceil(R * pitch) + 1;
    var totalH = Math.max(1, Math.ceil(m.h * L - 1e-6));
    var W = 2 * gx + 2 * pad, H = 2 * gy + totalH + 2 * pad, ox = gx + pad, oy = pad + totalH + gy;
    var rgba = new Uint8ClampedArray(W * H * 4), depth = new Float32Array(W * H), vox = new Int32Array(W * H), face = new Uint8Array(W * H);
    for (var q = 0; q < vox.length; q++) vox[q] = -1;
    var ca = Math.cos(angle), sa = Math.sin(angle), cxm = m.w / 2, cym = m.d / 2;
    for (var hp = 0; hp < totalH; hp++) {
      var zl = Math.min(m.h - 1, Math.floor(hp / L));
      var lb = m.lay[zl]; if (!lb) continue;
      var topRow = Math.floor((hp + 1) / L) > zl || hp === totalH - 1;
      // the layer's rotated bounds on screen
      var bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
      for (var k = 0; k < 4; k++) {
        var lx = ((k & 1) ? lb[2] : lb[0]) - cxm, ly = ((k & 2) ? lb[3] : lb[1]) - cym;
        var X = (lx * ca - ly * sa) * s, Y = (lx * sa + ly * ca) * s;
        bx0 = Math.min(bx0, X); bx1 = Math.max(bx1, X); by0 = Math.min(by0, Y); by1 = Math.max(by1, Y);
      }
      var row0 = oy - hp, px0 = Math.max(0, Math.floor(ox + bx0) - 1), px1 = Math.min(W - 1, Math.ceil(ox + bx1) + 1);
      var py0 = Math.max(0, Math.floor(row0 + by0 * pitch) - 1), py1 = Math.min(H - 1, Math.ceil(row0 + by1 * pitch) + 1);
      for (var py = py0; py <= py1; py++) {
        var Yg = (py + 0.5 - row0) / pitch;
        for (var px = px0; px <= px1; px++) {
          var Xg = px + 0.5 - ox;
          var mx = (Xg * ca + Yg * sa) / s + cxm, my = (-Xg * sa + Yg * ca) / s + cym;
          var vi = sampleVox(m, mx, my, zl, ca, sa, s);
          if (vi < 0) continue;
          var p = py * W + px;
          vox[p] = vi; depth[p] = Yg + hp * pitch;
          face[p] = topRow && (zl + 1 >= m.h || !m.v[vi + m.w * m.d]) ? 1 : 2;
        }
      }
    }
    // shade
    var LV = lightVec(o.light), amb = 0.6, outlineOn = o.outline !== false, OC = rgb(typeof o.outline === 'string' ? o.outline : '#1a1024');
    var cool = [58, 45, 92], warm = [255, 242, 200];
    for (var p2 = 0; p2 < vox.length; p2++) {
      var v2 = vox[p2]; if (v2 < 0) continue;
      var c = m.pal[m.v[v2]], f;
      if (c[3]) f = 1.12;
      else if (face[p2] === 1) {
        f = amb + 0.55 * LV[2];
        var below = p2 + W; if (below < vox.length && vox[below] >= 0 && face[below] === 2) f += 0.06;   // front rim of a top face
      } else {
        var nx = m.nx[v2] / 100, ny = m.ny[v2] / 100;
        if (!nx && !ny) { nx = 0; ny = 1; } else { var rx = nx * ca - ny * sa, ry = nx * sa + ny * ca; nx = rx; ny = ry; }
        var dif = Math.max(0, nx * LV[0] + ny * LV[1]) / 0.6;
        f = amb + 0.36 * dif;
        var zz = Math.floor(v2 / (m.w * m.d)); if (zz === 0) f *= 0.84; else if (zz === 1) f *= 0.93;
      }
      f = Math.round(f * 12) / 12;
      var r = c[0] * f, g = c[1] * f, b = c[2] * f;
      if (f < 1 && !c[3]) { var t = (1 - f) * 0.45; r += (cool[0] - r) * t; g += (cool[1] - g) * t; b += (cool[2] - b) * t; }
      else if (f > 1) { var t2 = Math.min(0.5, (f - 1) * 1.2); r += (warm[0] - r) * t2; g += (warm[1] - g) * t2; b += (warm[2] - b) * t2; }
      rgba[p2 * 4] = r; rgba[p2 * 4 + 1] = g; rgba[p2 * 4 + 2] = b; rgba[p2 * 4 + 3] = 255;
    }
    if (outlineOn) {
      var add = [];
      for (var p3 = 0; p3 < vox.length; p3++) {
        if (vox[p3] >= 0) continue;
        var x3 = p3 % W, y3 = (p3 / W) | 0, nb = -1;
        if (x3 > 0 && vox[p3 - 1] >= 0) nb = p3 - 1; else if (x3 < W - 1 && vox[p3 + 1] >= 0) nb = p3 + 1;
        else if (y3 > 0 && vox[p3 - W] >= 0) nb = p3 - W; else if (y3 < H - 1 && vox[p3 + W] >= 0) nb = p3 + W;
        if (nb >= 0) add.push(p3, nb);
      }
      for (var a2 = 0; a2 < add.length; a2 += 2) {
        var pp = add[a2], nn = add[a2 + 1];
        rgba[pp * 4] = OC[0] * 0.8 + rgba[nn * 4] * 0.2; rgba[pp * 4 + 1] = OC[1] * 0.8 + rgba[nn * 4 + 1] * 0.2; rgba[pp * 4 + 2] = OC[2] * 0.8 + rgba[nn * 4 + 2] * 0.2; rgba[pp * 4 + 3] = 255;
        depth[pp] = depth[nn];
      }
    }
    // cast shadow (ground mask): every layer's footprint pushed away from the light, lower-right on screen
    var sk = clamp(num(o.shadowLength, 0.55), 0, 1.5), sdx = 0.62 * sk, sdy = 0.38 * sk;
    var sW = W + Math.ceil(totalH * sdx) + 2, sH = 2 * gy + Math.ceil(totalH * sdy * pitch) + 4, sox = ox, soy = gy + 2;
    var mask = new Uint8Array(sW * sH);
    if (sk > 0) for (var zs = 0; zs < m.h; zs++) {
      var lb2 = m.lay[zs]; if (!lb2) continue;
      var hz = (zs + 0.5) * L, offX = hz * sdx, offY = hz * sdy;
      for (var sy2 = 0; sy2 < sH; sy2++) {
        var Yg2 = (sy2 + 0.5 - soy) / pitch - offY;
        for (var sx2 = 0; sx2 < sW; sx2++) {
          var p4 = sy2 * sW + sx2; if (mask[p4]) continue;
          var Xg2 = sx2 + 0.5 - sox - offX;
          var mx2 = Math.floor((Xg2 * ca + Yg2 * sa) / s + cxm), my2 = Math.floor((-Xg2 * sa + Yg2 * ca) / s + cym);
          if (mx2 < lb2[0] || my2 < lb2[1] || mx2 >= lb2[2] || my2 >= lb2[3]) continue;
          if (m.v[(zs * m.d + my2) * m.w + mx2]) mask[p4] = 1;
        }
      }
    }
    return { w: W, h: H, ox: ox, oy: oy, rgba: rgba, depth: depth, vox: vox, face: face, angle: angle, scale: s, lift: L, pitch: pitch, totalH: totalH,
      shadow: { w: sW, h: sH, ox: sox, oy: soy, mask: mask } };
  }

  function hasDoc() { return typeof document !== 'undefined' && document.createElement; }
  function toCanvas(rgbaArr, W, H) {
    if (!hasDoc()) return null;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d'); if (!g) return null;
    var id = g.createImageData(W, H); id.data.set(rgbaArr); g.putImageData(id, 0, 0); return c;
  }

  /* ------------------------------------------------------------------ depth order */
  // footprint slice of an item at camera-space x: [ymin, ymax] or null
  function sliceAt(poly, x) {
    if (!poly) return null;
    if (poly.length === 2) return [poly[0][1], poly[0][1]];
    var lo = 1e9, hi = -1e9, n = poly.length;
    for (var i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n];
      if ((a[0] <= x && b[0] >= x) || (b[0] <= x && a[0] >= x)) {
        var y = Math.abs(b[0] - a[0]) < 1e-9 ? null : a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
        if (y == null) { lo = Math.min(lo, a[1], b[1]); hi = Math.max(hi, a[1], b[1]); }
        else { lo = Math.min(lo, y); hi = Math.max(hi, y); }
      }
    }
    return lo > hi ? null : [lo, hi];
  }
  // +1: a is in front of b (drawn after), -1: b in front, 0: no screen overlap in x
  function frontOf(a, b) {
    var lo = Math.max(a.lo, b.lo), hi = Math.min(a.hi, b.hi);
    if (hi - lo <= 0.001) return 0;
    if (a.top > b.bottom || b.top > a.bottom) return 0;
    if (a.noX || b.noX) { var ka = a.noX ? a.ry : a.cy, kb = b.noX ? b.ry : b.cy; return ka > kb ? 1 : ka < kb ? -1 : (a.i > b.i ? 1 : -1); }
    var xm = (lo + hi) / 2, sa = sliceAt(a.poly, clamp(xm, a.px0, a.px1)), sb = sliceAt(b.poly, clamp(xm, b.px0, b.px1));
    if (!sa || !sb) return a.cy > b.cy ? 1 : -1;
    var aF = sa[0] >= sb[1] - 1e-6, bF = sb[0] >= sa[1] - 1e-6;
    if (aF && !bF) return 1;
    if (bF && !aF) return -1;
    if (!aF && !bF && (a.base || b.base)) {
      // footprints overlap (a sprite under a canopy): compare against the base footprint (trunk, posts, walls)
      var ba = a.base ? sliceAt(a.base, clamp(xm, a.blo, a.bhi)) : sa, bb = b.base ? sliceAt(b.base, clamp(xm, b.blo, b.bhi)) : sb;
      if (ba && bb) {
        var aF2 = ba[0] >= bb[1] - 1e-6, bF2 = bb[0] >= ba[1] - 1e-6;
        if (aF2 && !bF2) return 1;
        if (bF2 && !aF2) return -1;
        var ka2 = (ba[0] + ba[1]) / 2, kb2 = (bb[0] + bb[1]) / 2;
        if (ka2 !== kb2) return ka2 > kb2 ? 1 : -1;
      }
    }
    return a.cy > b.cy ? 1 : a.cy < b.cy ? -1 : (a.i > b.i ? 1 : -1);
  }
  // topological painter order (behind first); ties by ground y then list order
  function orderGeo(G) {
    var n = G.length, i, j;
    if (n > 600) return G.slice().sort(function (a, b) { return a.cy - b.cy || a.i - b.i; });
    var inDeg = new Int32Array(n), adj = [];
    for (i = 0; i < n; i++) adj.push([]);
    var edges = 0;
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      var f = frontOf(G[i], G[j]);
      if (f > 0) { adj[j].push(i); inDeg[i]++; edges++; } else if (f < 0) { adj[i].push(j); inDeg[j]++; edges++; }
    }
    var out = [], done = new Uint8Array(n), cycles = 0;
    while (out.length < n) {
      var best = -1;
      for (i = 0; i < n; i++) if (!done[i] && inDeg[i] === 0 && (best < 0 || G[i].cy < G[best].cy || (G[i].cy === G[best].cy && G[i].i < G[best].i))) best = i;
      if (best < 0) {   // cycle (overlapping footprints): take the rearmost
        cycles++;
        for (i = 0; i < n; i++) if (!done[i] && (best < 0 || G[i].cy < G[best].cy)) best = i;
      }
      done[best] = 1; out.push(G[best]);
      for (j = 0; j < adj[best].length; j++) inDeg[adj[best][j]]--;
    }
    out.edges = edges; out.cycles = cycles;
    return out;
  }

  /* ------------------------------------------------------------------ instance */
  function create(opts) {
    opts = opts || {};
    var o = {
      voxel: Math.max(0.25, num(opts.voxel, 1)), lift: null, pitch: clamp(num(opts.pitch, 1), 0.3, 1), steps: Math.max(0, num(opts.steps, 128) | 0),
      outline: opts.outline === false ? false : (typeof opts.outline === 'string' ? opts.outline : true), shadows: clamp(num(opts.shadows, 0.3), 0, 1),
      shadowColor: opts.shadowColor || '#140c28', shadowLength: clamp(num(opts.shadowLength, 0.55), 0, 1.5), light: num(opts.light, -0.62),
      res: opts.res == null ? 'auto' : opts.res, keepData: !!opts.keepData, flatW: Math.max(1, num(opts.flatW, 12)), cacheMax: Math.max(16, num(opts.cacheMax, 2400) | 0)
    };
    o.lift = Math.max(0.25, num(opts.lift, o.voxel));
    var cam = { x: 0, y: 0, yaw: 0, sx: 0, sy: 0, on: false };
    var models = {}, cache = {}, cacheN = 0, last = [], st = { frames: 0, items: 0, stacks: 0, flats: 0, maxStacks: 0, maxFlats: 0, mixedFrames: 0, flatNoX: 0, edges: 0, cycles: 0,
      bakes: 0, bakeMs: 0, cacheHits: 0, shadowDraws: 0, errors: 0, yawFrames: 0, groundCalls: 0, sortMs: 0 };
    var now = function () { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); };

    function getModel(name, mo) {
      if (name && name instanceof Model) return name;
      if (name && typeof name === 'object' && name.layers) {   // slice data given inline
        if (!name.__ssModel) Object.defineProperty(name, '__ssModel', { value: fromSlices(name, name.name || 'custom'), enumerable: false });
        return name.__ssModel;
      }
      var key = String(name) + '|' + (mo ? JSON.stringify(mo) : '');
      if (models[key]) return models[key];
      var def = SHARED[name], m = null;
      try {
        if (def) m = def.layers ? fromSlices(def, name) : def(mo || {});
        else if (BUILD[name]) m = BUILD[name](mo || {});
      } catch (e) { st.errors++; m = null; }
      if (!m) m = BUILD.crate({});
      models[key] = m; return m;
    }
    function bucket(a) {
      a = normAngle(a);
      if (!o.steps) return a;
      var n = o.steps, k = Math.round(a / TAU * n) % n; return k * TAU / n;
    }
    function resOf(ctx) {
      if (typeof o.res === 'number' && o.res > 0) return clamp(o.res, 0.5, 6);
      try { var t = ctx && ctx.getTransform ? ctx.getTransform() : null; if (t) { var sc = Math.hypot(t.a, t.b); return clamp(Math.round(sc * 2) / 2, 1, 4); } } catch (e) { }
      return 1;
    }
    function baked(m, ang, res, itemScale) {
      var sc = o.voxel * res * itemScale, li = o.lift * res * itemScale;
      var key = m.name + '#' + (m.__id || (m.__id = ++MID)) + '|' + ang.toFixed(5) + '|' + sc + '|' + li + '|' + o.pitch + '|' + o.outline + '|' + o.light + '|' + o.shadowLength;
      var b = cache[key];
      if (b) { st.cacheHits++; return b; }
      var t0 = now();
      var d = bakeData(m, ang, { scale: sc, lift: li, pitch: o.pitch, outline: o.outline, light: o.light, shadowLength: o.shadowLength });
      b = { d: d, res: res, canvas: toCanvas(d.rgba, d.w, d.h), shadow: null };
      if (hasDoc()) {
        var S = d.shadow, sr = new Uint8ClampedArray(S.w * S.h * 4), col = rgb(o.shadowColor);
        for (var i = 0; i < S.mask.length; i++) if (S.mask[i]) { sr[i * 4] = col[0]; sr[i * 4 + 1] = col[1]; sr[i * 4 + 2] = col[2]; sr[i * 4 + 3] = 255; }
        b.shadow = toCanvas(sr, S.w, S.h);
      }
      if (b.canvas && !o.keepData) { d.rgba = d.depth = d.vox = d.face = null; d.shadow.mask = null; }   // the pictures are enough to draw
      st.bakes++; st.bakeMs += now() - t0;
      if (cacheN >= o.cacheMax) { cache = {}; cacheN = 0; }
      cache[key] = b; cacheN++;
      return b;
    }
    function project(x, y) {
      if (!cam.on) return { x: x, y: y, rx: x, ry: y };
      var dx = x - cam.x, dy = y - cam.y, c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
      var rx = dx * c + dy * s, ry = -dx * s + dy * c;
      return { x: cam.sx + rx, y: cam.sy + ry * o.pitch, rx: rx, ry: ry };
    }
    function unproject(sx, sy) {
      if (!cam.on) return { x: sx, y: sy };
      var rx = sx - cam.sx, ry = (sy - cam.sy) / o.pitch, c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
      return { x: cam.x + rx * c - ry * s, y: cam.y + rx * s + ry * c };
    }
    // geometry of one list entry in camera space (ground units, before pitch)
    function geo(it, i) {
      var g = { i: i, it: it };
      if (it && it.__ss) {
        var m = it.model, ang = bucket((it.angle || 0) - (cam.on ? cam.yaw : 0)), p = project(it.x, it.y), sc = o.voxel * it.scale;
        var ca = Math.cos(ang), sa = Math.sin(ang);
        var tr = function (h) { var out = []; for (var k = 0; k < h.length; k++) out.push([p.rx + (h[k][0] * ca - h[k][1] * sa) * sc, p.ry + (h[k][0] * sa + h[k][1] * ca) * sc]); return out; };
        g.poly = tr(m.hull); g.base = tr(m.baseHull); g.ang = ang; g.p = p;
        g.lo = 1e9; g.hi = -1e9; var ylo = 1e9, yhi = -1e9;
        g.poly.forEach(function (q) { g.lo = Math.min(g.lo, q[0]); g.hi = Math.max(g.hi, q[0]); ylo = Math.min(ylo, q[1]); yhi = Math.max(yhi, q[1]); });
        g.blo = 1e9; g.bhi = -1e9; g.base.forEach(function (q) { g.blo = Math.min(g.blo, q[0]); g.bhi = Math.max(g.bhi, q[0]); });
        g.cy = (ylo + yhi) / 2; g.ry = p.ry; g.stack = true;
        var hpx = m.h * o.lift * it.scale;
        g.top = ylo * o.pitch - hpx - 3; g.bottom = yhi * o.pitch + 3;
        g.px0 = g.lo; g.px1 = g.hi; g.lo -= 2.5; g.hi += 2.5;   // outline, sub-sampling and rounding
      } else {
        var x = it && it.x, y = it && it.y != null ? it.y : 0;
        var w = it && it.w != null ? +it.w : o.flatW, hgt = it && it.h != null ? +it.h : Math.max(16, w * 2);
        if (x == null || !isFinite(x)) {   // a flat item without x: only its y is known (keyed like the game's old sort)
          var p0 = project(0, y);
          g.noX = true; g.lo = -1e9; g.hi = 1e9; g.ry = cam.on ? p0.ry : y; g.cy = g.ry; g.top = -1e9; g.bottom = 1e9; g.poly = null;
        } else {
          var p1 = project(x, y);
          g.lo = p1.rx - w / 2; g.hi = p1.rx + w / 2; g.px0 = g.px1 = p1.rx; g.ry = p1.ry; g.cy = p1.ry; g.poly = [[p1.rx, p1.ry], [p1.rx, p1.ry]]; g.p = p1;
          g.top = p1.ry * o.pitch - hgt; g.bottom = p1.ry * o.pitch + 2;
        }
      }
      return g;
    }
    function drawStack(ctx, it, g) {
      var res = resOf(ctx), b = baked(it.model, g.ang, res, it.scale), d = b.d;
      if (!b.canvas) return;
      var k = 1 / res, X = g.p.x - d.ox * k, Y = g.p.y - d.oy * k;
      X = Math.round(X * res) / res; Y = Math.round(Y * res) / res;
      var sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      if (it.alpha != null && it.alpha < 1) { var ga = ctx.globalAlpha; ctx.globalAlpha = ga * it.alpha; ctx.drawImage(b.canvas, X, Y, d.w * k, d.h * k); ctx.globalAlpha = ga; }
      else ctx.drawImage(b.canvas, X, Y, d.w * k, d.h * k);
      ctx.imageSmoothingEnabled = sm;
      g.drawn = { x: X, y: Y, w: d.w * k, h: d.h * k };
    }

    var api = {
      version: VERSION, models: BUILTIN.slice(),
      options: o,
      model: function (name, mo) { return getModel(name, mo); },
      item: function (name, x, y, io) {
        io = io || {};
        var mo = io.model || null;
        if (!mo && io.seed != null && (name === 'tree' || name === 'pine' || name === 'bush' || name === 'rock' || name === 'stall')) mo = { seed: io.seed | 0 };
        if (io.size != null) { mo = mo ? Object.assign({}, mo) : {}; mo.size = io.size; }
        return { __ss: true, name: typeof name === 'string' ? name : 'custom', model: getModel(name, mo), x: +x || 0, y: +y || 0, angle: num(io.angle, 0), scale: Math.max(0.1, num(io.scale, 1)),
          id: io.id != null ? io.id : null, alpha: io.alpha };
      },
      isStack: function (it) { return !!(it && it.__ss); },
      // camera: {x, y} world point at screen {sx, sy}, yaw (radians) turns the world; omit for the game's own transform
      setCamera: function (c) {
        if (!c) { cam.on = false; return; }
        cam.x = num(c.x, 0); cam.y = num(c.y, 0); cam.yaw = num(c.yaw, 0); cam.sx = num(c.sx, 0); cam.sy = num(c.sy, 0); cam.on = true;
      },
      camera: function () { return { x: cam.x, y: cam.y, yaw: cam.yaw, sx: cam.sx, sy: cam.sy, on: cam.on, pitch: o.pitch }; },
      project: function (x, y) { var p = project(x, y); return { x: p.x, y: p.y, depth: p.ry }; },
      unproject: function (sx, sy) { return unproject(sx, sy); },
      // ground: apply the camera to ctx so the game's ground (drawn in world px) turns with the objects
      groundTransform: function (ctx) {
        st.groundCalls++;
        if (!cam.on || !ctx) return;
        ctx.translate(cam.sx, cam.sy); ctx.scale(1, o.pitch); ctx.rotate(-cam.yaw); ctx.translate(-cam.x, -cam.y);
      },
      // screen direction of a world vector (for picking a character's 4-direction frame under a turned camera)
      screenDir: function (vx, vy) { var c = Math.cos(cam.on ? cam.yaw : 0), s = Math.sin(cam.on ? cam.yaw : 0); return { x: vx * c + vy * s, y: (-vx * s + vy * c) * o.pitch }; },
      order: function (list) {
        var t0 = now(), G = [], i;
        for (i = 0; i < (list ? list.length : 0); i++) { if (list[i]) { try { G.push(geo(list[i], i)); } catch (e) { st.errors++; } } }
        var out = orderGeo(G);
        st.edges = out.edges || 0; st.cycles += out.cycles || 0; st.sortMs = now() - t0;
        return out;
      },
      sort: function (list) {
        if (!list || !list.length) return list || [];
        var out = api.order(list), arr = out.map(function (g) { return g.it; });
        for (var i = 0; i < arr.length; i++) list[i] = arr[i];
        list.length = arr.length;
        return list;
      },
      draw: function (ctx, list) {
        if (!ctx || !list) return [];
        var out = api.order(list), stacks = 0, flats = 0;
        if (cam.on && cam.yaw) st.yawFrames++;
        last = [];
        for (var i = 0; i < out.length; i++) {
          var g = out[i], it = g.it;
          try {
            if (it.__ss) { drawStack(ctx, it, g); stacks++; }
            else { flats++; if (g.noX) st.flatNoX++; if (typeof it.draw === 'function') it.draw(ctx); }
          } catch (e) { st.errors++; }
          last.push({ kind: it.__ss ? 'stack' : 'flat', id: it.id != null ? it.id : (it.__ss ? it.name : null), name: it.__ss ? it.name : null, x: it.x, y: it.y,
            rx: g.p ? g.p.rx : null, ry: g.ry, lo: g.lo, hi: g.hi, top: g.top, bottom: g.bottom, poly: g.poly, base: g.base || null, noX: !!g.noX, angle: g.ang != null ? g.ang : null, rect: g.drawn || null });
        }
        st.frames++; st.items += out.length; st.stacks += stacks; st.flats += flats;
        st.maxStacks = Math.max(st.maxStacks, stacks); st.maxFlats = Math.max(st.maxFlats, flats);
        if (stacks && flats) st.mixedFrames++;
        return last;
      },
      drawShadows: function (ctx, list) {
        if (!ctx || !list || !(o.shadows > 0)) return;
        var res = resOf(ctx), k = 1 / res, ga = ctx.globalAlpha, sm = ctx.imageSmoothingEnabled;
        ctx.globalAlpha = ga * o.shadows; ctx.imageSmoothingEnabled = false;
        for (var i = 0; i < list.length; i++) {
          var it = list[i]; if (!it || !it.__ss) continue;
          try {
            var g = geo(it, i), b = baked(it.model, g.ang, res, it.scale), S = b.d.shadow;
            if (!b.shadow) continue;
            var X = Math.round((g.p.x - S.ox * k) * res) / res, Y = Math.round((g.p.y - S.oy * k) * res) / res;
            ctx.drawImage(b.shadow, X, Y, S.w * k, S.h * k); st.shadowDraws++;
          } catch (e) { st.errors++; }
        }
        ctx.globalAlpha = ga; ctx.imageSmoothingEnabled = sm;
      },
      // draw one model alone (galleries, previews): feet at (x, y), angle in screen space
      drawModel: function (ctx, name, x, y, angle, io) {
        io = io || {};
        try {
          var m = getModel(name, io.model || null), res = resOf(ctx), b = baked(m, bucket(num(angle, 0)), res, Math.max(0.1, num(io.scale, 1))), d = b.d, k = 1 / res;
          if (io.shadow !== false && b.shadow && o.shadows > 0) { var S = d.shadow, ga = ctx.globalAlpha; ctx.globalAlpha = ga * o.shadows; ctx.drawImage(b.shadow, Math.round((x - S.ox * k) * res) / res, Math.round((y - S.oy * k) * res) / res, S.w * k, S.h * k); ctx.globalAlpha = ga; }
          if (b.canvas) { var sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false; ctx.drawImage(b.canvas, Math.round((x - d.ox * k) * res) / res, Math.round((y - d.oy * k) * res) / res, d.w * k, d.h * k); ctx.imageSmoothingEnabled = sm; }
          return { w: d.w * k, h: d.h * k, ox: d.ox * k, oy: d.oy * k };
        } catch (e) { st.errors++; return null; }
      },
      // bake data (pixels, depth per pixel, anchor) of one view, for checks and tools; not cached
      bake: function (name, angle, io) {
        io = io || {}; var m = getModel(name, io.model || null), res = num(io.res, 1), sc = Math.max(0.1, num(io.scale, 1));
        return bakeData(m, bucket(num(angle, 0)), { scale: o.voxel * res * sc, lift: o.lift * res * sc, pitch: o.pitch, outline: o.outline, light: o.light, shadowLength: o.shadowLength });
      },
      // the slices of a model as small top-down images (for previews)
      slices: function (name, mo) {
        var m = getModel(name, mo || null), out = [];
        for (var z = 0; z < m.h; z++) {
          var a = new Uint8ClampedArray(m.w * m.d * 4);
          for (var y = 0; y < m.d; y++) for (var x = 0; x < m.w; x++) { var ci = m.v[(z * m.d + y) * m.w + x]; if (!ci) continue; var c = m.pal[ci], p = (y * m.w + x) * 4; a[p] = c[0]; a[p + 1] = c[1]; a[p + 2] = c[2]; a[p + 3] = 255; }
          out.push({ z: z, w: m.w, h: m.d, rgba: a, canvas: toCanvas(a, m.w, m.d) });
        }
        return out;
      },
      // prewarm the cache for a set of models at n angles (call once at load if the camera turns)
      prewarm: function (names, n, ctxOrRes) {
        var res = typeof ctxOrRes === 'number' ? ctxOrRes : resOf(ctxOrRes); n = n || o.steps || 8;
        (names || []).forEach(function (nm) { var m = getModel(nm.name || nm, nm.model || null); for (var k = 0; k < n; k++) baked(m, bucket(k / n * TAU), res, nm.scale || 1); });
      },
      set: function (k, v) {
        if (k === 'pitch') o.pitch = clamp(num(v, 1), 0.3, 1);
        else if (k === 'lift') o.lift = Math.max(0.25, num(v, o.voxel));
        else if (k === 'voxel') o.voxel = Math.max(0.25, num(v, 1));
        else if (k === 'steps') o.steps = Math.max(0, num(v, 128) | 0);
        else if (k === 'outline') o.outline = v === false || v === 'off' ? false : true;
        else if (k === 'shadows') o.shadows = clamp(num(v, 0.3), 0, 1);
        else if (k === 'light') o.light = num(v, -0.62);
        else if (k === 'shadowLength') o.shadowLength = clamp(num(v, 0.55), 0, 1.5);
        else return api;
        return api;
      },
      frontOf: function (a, b) { var g = api.order([a, b]); return g[1] && g[1].it === a ? 1 : -1; },
      lastDrawn: function () { return last; },
      stats: function () {
        var r = {}; for (var k in st) r[k] = st[k]; r.cacheEntries = cacheN; r.models = Object.keys(models).length; r.bakeMsAvg = st.bakes ? Math.round(st.bakeMs / st.bakes * 100) / 100 : 0;
        r.yaw = cam.on ? cam.yaw : 0; r.pitch = o.pitch; r.lift = o.lift; r.voxel = o.voxel; return r;
      },
      clearCache: function () { cache = {}; cacheN = 0; }
    };
    return api;
  }
  var MID = 0, SHARED = {};

  var NS = {
    version: VERSION, create: create, builtins: BUILTIN.slice(),
    // a new model for every instance: GameDNA_SpriteStack.define('lantern', {palette: {...}, layers: [...], repeat: [...]})
    // or define('totem', function (opts) { var m = GameDNA_SpriteStack.newModel(5, 5, 12); ...; return m.finish(); })
    define: function (name, spec) { SHARED[name] = spec; if (NS.builtins.indexOf(name) < 0) NS.builtins.push(name); return NS; },
    newModel: function (w, d, h, name) { return new Model(w, d, h, name); },
    fromSlices: fromSlices, bakeData: bakeData, frontOfGeo: frontOf, orderGeo: orderGeo, build: function (name, mo) { return BUILD[name] ? BUILD[name](mo || {}) : (SHARED[name] ? (SHARED[name].layers ? fromSlices(SHARED[name], name) : SHARED[name](mo || {})) : null); }
  };
  root.GameDNA_SpriteStack = NS;
  if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof window !== 'undefined' ? window : this);
