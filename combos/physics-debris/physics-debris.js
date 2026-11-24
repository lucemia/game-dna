/* GameDNA E-13 - Physics debris & breakables - module v1 (plain script, no dependencies, one global: GameDNA_Debris)
 *
 *   const debris = GameDNA_Debris.create({
 *     view: 'side',                       // 'side' = gravity pulls +y; 'top' = top-down, pieces fly up in a fake height z
 *     seed: 1, scale: 1,                  // scale = world px per unit: about viewHeight / 360
 *     params: { amount: 1, gravity: 1, bounce: 0.35, friction: 0.6, rest: 2600, fade: 700, cap: 320, dust: 1, shake: 3, hitstop: 40 },
 *     solid: (x, y) => wallAt(x, y),      // WORLD px; walls (and floors in side view). Optional.
 *     tile: 32,                           // optional: your walls are whole tiles of this size -> exact swept test
 *     bounds: { x: 0, y: 0, w: WORLD_W, h: WORLD_H },
 *     onShake: (px, ms) => {}, onHitstop: ms => {}, onBreak: (prop) => {}, onSound: (name, info) => {}
 *   });
 *   debris.addProp({ id: 'pot-1', kind: 'pot', x, y });      // x = centre, y = the prop's base line (world px)
 *   debris.hit(x, y, r, { dx, dy, force });                  // a blow: props in reach crack or break
 *   debris.shatter('rock', x, y, { count, dx, dy });         // pieces without a prop (a creature turning to stone, ...)
 *   const v = debris.wallHit(enemy.id, x, y, nx, ny, speed); // a knocked-back body hit a wall: dust, chips, bounce
 *   debris.update(stepMs);                                   // fixed step; update(0) while the world is stopped
 *   debris.drawProps(ctx, camX, camY); debris.draw(ctx, camX, camY);
 *
 * Pieces are shaped rigid bodies (position, velocity, angle, angular velocity) cut from the prop's own drawing, so the
 * first frame of a break shows the prop in pieces. Every move is swept along its path (exact per tile when `tile` is
 * given, sampled every `sweep` px otherwise), so a piece never passes through a wall however fast it flies. Pieces come
 * from a fixed pool made once (no garbage per frame), rest, then fade. Everything depends only on the seed, the order of
 * calls and update() time: no Math.random, no wall clock. The module never reads input and never changes game state.
 */
(function (root) {
  'use strict';
  var VERSION = '1.4.2';
  var DEF = { amount: 1, gravity: 1, bounce: 0.35, friction: 0.6, rest: 2600, fade: 700, cap: 320, dust: 1, shake: 3, hitstop: 40,
    spin: 1, render: 'auto', breakSpeed: 240, chips: 1, depth: 0, art: 'image', dustTint: '', propsBlock: 1 };
  var STEP = 1000 / 60, DT = 1 / 60, TAU = Math.PI * 2, DUST_CAP = 128, SPRING_CAP = 24;

  /* ---------- materials: palette + physics feel of loose pieces ---------- */
  var MATS = {
    wood: { c: ['#f2c58a', '#cf9256', '#9b5f30', '#5c3518'], line: '#2c1709', cut: '#e6bb84', elong: 2.6, verts: 4, bounce: 0.32, fric: 0.75, mass: 1, detail: 'grain' },
    clay: { c: ['#ffc097', '#e28552', '#b0532c', '#6c2a12'], line: '#36140a', cut: '#e48e62', elong: 1.35, verts: 5, bounce: 0.24, fric: 0.75, mass: 1.1, detail: 'curve' },
    stone: { c: ['#d6d1c4', '#a39d90', '#726d63', '#46433d'], line: '#26241f', cut: '#c9c3b6', elong: 1.2, verts: 6, bounce: 0.18, fric: 0.85, mass: 1.6 },
    rock: { c: ['#e3d3b4', '#b49c78', '#7f6a4e', '#4a3c2c'], line: '#241c13', cut: '#efe2c8', elong: 1.25, verts: 6, bounce: 0.2, fric: 0.85, mass: 1.5 },
    crystal: { c: ['#ffffff', '#b4f2ff', '#53b9e0', '#1f5f94'], line: '#0f3050', cut: '#f2fdff', elong: 1.7, verts: 4, bounce: 0.45, fric: 0.45, mass: 0.8, detail: 'facet', glint: 1 },
    leaf: { c: ['#d8f27a', '#8fcb4a', '#4f9233', '#285a1e'], line: '#163212', cut: '#e6f7a6', elong: 2.0, shape: 'leaf', bounce: 0.1, fric: 0.95, mass: 0.25, drag: 2.6, flutter: 1 },
    bark: { c: ['#c48a58', '#94603a', '#643c22', '#3a2112'], line: '#1d0f07', cut: '#e2b886', elong: 1.9, verts: 5, bounce: 0.22, fric: 0.8, mass: 1 },
    bone: { c: ['#fffaea', '#ece0c0', '#bfae88', '#7a6a4c'], line: '#3c3222', cut: '#fffdf4', elong: 2.3, verts: 4, bounce: 0.3, fric: 0.7, mass: 0.9 },
    shell: { c: ['#e1bdfa', '#a37ad2', '#6c4a98', '#3a2556'], line: '#1c1030', cut: '#f0dcff', elong: 1.3, verts: 5, bounce: 0.3, fric: 0.7, mass: 0.9, glint: 1 },
    iron: { c: ['#eef2f6', '#a9b2bc', '#6c757e', '#383e45'], line: '#16191c', cut: '#ffffff', elong: 3.2, verts: 4, bounce: 0.38, fric: 0.6, mass: 1.8 },
    spirit: { c: ['#ffffff', '#ded0ff', '#9f84ee', '#5638b0'], line: '#24145c', cut: '#ffffff', elong: 2.4, verts: 3, bounce: 0.4, fric: 0.5, mass: 0.5, glint: 1, drag: 1.2 }
  };
  var DUSTS = { dust: ['#f4ead6', '#cbb89a'], stone: ['#f0eee8', '#b9b4aa'], soil: ['#e6d2b0', '#a88c66'], snow: ['#ffffff', '#cfe0ee'], soot: ['#a8a2a6', '#5e585e'], spark: ['#fffbe0', '#e0d6a8'] };

  /* ---------- breakable props: silhouette hull (unit = prop height, origin = base centre), fracture grid ---------- */
  var KINDS = {
    crate: { h: 36, hp: 1, mat: 'wood', chips: 5, grid: [3, 3], split: 0.3, jit: 0.3, dust: 'dust',
      hull: [[-0.47, 0], [0.47, 0], [0.47, -0.74], [0.41, -0.97], [-0.41, -0.97], [-0.47, -0.74]] },
    barrel: { h: 40, hp: 2, mat: 'wood', chips: 4, grid: [4, 2], split: 0.15, jit: 0.38, dust: 'dust', extra: 'iron',
      hull: [[-0.3, 0], [0.3, 0], [0.37, -0.24], [0.385, -0.46], [0.37, -0.68], [0.32, -0.92], [0.2, -0.99], [-0.2, -0.99], [-0.32, -0.92], [-0.37, -0.68], [-0.385, -0.46], [-0.37, -0.24]] },
    pot: { h: 32, hp: 1, mat: 'clay', chips: 6, grid: [3, 3], split: 0.5, jit: 0.34, dust: 'soil',
      hull: [[-0.19, 0], [0.19, 0], [0.34, -0.17], [0.38, -0.42], [0.31, -0.68], [0.19, -0.86], [0.23, -0.95], [0.18, -1], [-0.18, -1], [-0.23, -0.95], [-0.19, -0.86], [-0.31, -0.68], [-0.38, -0.42], [-0.34, -0.17]] },
    statue: { h: 54, hp: 3, mat: 'stone', chips: 8, grid: [3, 4], split: 0.3, jit: 0.3, dust: 'stone',
      hull: [[-0.36, 0], [0.36, 0], [0.36, -0.2], [0.3, -0.27], [0.27, -0.6], [0.2, -0.99], [-0.2, -0.99], [-0.27, -0.6], [-0.3, -0.27], [-0.36, -0.2]] },
    crystal: { h: 44, hp: 2, mat: 'crystal', chips: 8, grid: [3, 3], split: 0.75, jit: 0.3, dust: 'snow',
      hull: [[-0.42, 0], [0.44, 0], [0.42, -0.42], [0.2, -0.86], [0.04, -1], [-0.12, -0.92], [-0.38, -0.6]] }
  };
  var TINTS = {
    crate: [{ w: ['#d9a266', '#b0763f', '#7c4a24', '#4a2a12'] }, { w: ['#c9a27a', '#9a7350', '#6a4a30', '#3e2a1a'] }],
    barrel: [{ w: ['#e0a066', '#b06f3c', '#7c4622', '#4a260f'] }, { w: ['#c49270', '#8e6044', '#603c28', '#382216'] }],
    pot: [{ w: ['#ffbe8e', '#e0804c', '#ad4f28', '#6a2810'], band: '#4a1f10', paint: '#f7dfb4' },
      { w: ['#a8e0f0', '#4ea4c8', '#2b6b98', '#183e60'], band: '#f2e6c4', paint: '#183a5c' },
      { w: ['#d6eaa4', '#8cb35c', '#58803a', '#2e4a20'], band: '#2a3e18', paint: '#f2ecc2' }],
    statue: [{ w: ['#d6d1c4', '#a39d90', '#726d63', '#46433d'], moss: '#6f9a46' }, { w: ['#e8dcc6', '#c0aa88', '#8c7658', '#564630'], moss: '#7a9a46' }],
    crystal: [{ w: ['#ffffff', '#b4f2ff', '#53b9e0', '#1f5f94'] }, { w: ['#ffffff', '#f0c8ff', '#b47ae8', '#5c2e9e'] }]
  };

  /* ---------- small helpers ---------- */
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function strHash(s) { s = String(s); var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry(seed) { var a = seed >>> 0 || 1; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, k) { var A = hexRgb(a), B = hexRgb(b); return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * k) + ',' + Math.round(A[1] + (B[1] - A[1]) * k) + ',' + Math.round(A[2] + (B[2] - A[2]) * k) + ')'; }
  function mixHex(a, b, k) { var A = hexRgb(a), B = hexRgb(b), o = '#'; for (var i = 0; i < 3; i++) { var v = Math.round(A[i] + (B[i] - A[i]) * k); o += (v < 16 ? '0' : '') + v.toString(16); } return o; }
  function rgba(h, a) { var A = hexRgb(h); return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + a + ')'; }

  /* ---------- polygon geometry (fracture) ---------- */
  function polyArea(P) { var a = 0; for (var i = 0, n = P.length; i < n; i++) { var p = P[i], q = P[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  function centroid(P) {
    var a = 0, cx = 0, cy = 0;
    for (var i = 0, n = P.length; i < n; i++) { var p = P[i], q = P[(i + 1) % n], c = p[0] * q[1] - q[0] * p[1]; a += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; }
    a /= 2; if (Math.abs(a) < 1e-9) return [P[0][0], P[0][1]];
    return [cx / (6 * a), cy / (6 * a)];
  }
  function clipConvex(subject, clip) {   // Sutherland-Hodgman; clip is convex, either winding
    var out = subject, ccw = polyArea(clip) > 0 ? 1 : -1;
    for (var i = 0, n = clip.length; i < n && out.length; i++) {
      var a = clip[i], b = clip[(i + 1) % n], inp = out; out = [];
      var inside = function (p) { return ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) * ccw >= -1e-12; };
      for (var j = 0, m = inp.length; j < m; j++) {
        var p = inp[j], q = inp[(j + 1) % m], pin = inside(p), qin = inside(q);
        if (pin) out.push(p);
        if (pin !== qin) {
          var dx = q[0] - p[0], dy = q[1] - p[1], ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex;
          if (Math.abs(den) > 1e-12) { var t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den; out.push([p[0] + dx * t, p[1] + dy * t]); }
        }
      }
    }
    return out;
  }
  function hullOf(P) {   // convex hull (monotone chain) - silhouettes given by hand may be slightly concave
    var pts = P.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }), lo = [], up = [], i;
    var cross = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
    for (i = 0; i < pts.length; i++) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop(); lo.push(pts[i]); }
    for (i = pts.length - 1; i >= 0; i--) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) up.pop(); up.push(pts[i]); }
    up.pop(); lo.pop(); return lo.concat(up);
  }
  function onLine(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L < 1e-6; }
  /* principal axis: angle of the long side, half extents along it (hl) and across (hs) */
  function axes(P, c) {
    var sxx = 0, syy = 0, sxy = 0, i;
    for (i = 0; i < P.length; i++) { var x = P[i][0] - c[0], y = P[i][1] - c[1]; sxx += x * x; syy += y * y; sxy += x * y; }
    var a0 = 0.5 * Math.atan2(2 * sxy, sxx - syy), ca = Math.cos(a0), sa = Math.sin(a0), hl = 0, hs = 0;
    for (i = 0; i < P.length; i++) { var dx = P[i][0] - c[0], dy = P[i][1] - c[1]; hl = Math.max(hl, Math.abs(dx * ca + dy * sa)); hs = Math.max(hs, Math.abs(-dx * sa + dy * ca)); }
    return { a0: a0, hl: hl, hs: Math.max(hs, hl * 0.12) };
  }

  /* outward normal angle of each edge (y down: pi/2 = pointing down) */
  function edgeDist(P, c) {   // distance from the centroid to each edge's line: small = a long, low, stable side to lie on
    var out = [], mn = 1e9, i;
    for (i = 0; i < P.length; i++) { var p = P[i], q = P[(i + 1) % P.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); out.push(L > 1e-4 ? Math.abs((q[0] - p[0]) * (c[1] - p[1]) - (q[1] - p[1]) * (c[0] - p[0])) / L : 1e9); mn = Math.min(mn, out[i]); }
    for (i = 0; i < out.length; i++) out[i] = out[i] <= mn * 1.3 ? 1 : 0;   // 1 = a side the piece may come to rest on
    return out;
  }
  function normals(P, c) {
    var out = [];
    for (var i = 0; i < P.length; i++) {
      var p = P[i], q = P[(i + 1) % P.length], nx = q[1] - p[1], ny = -(q[0] - p[0]), mx = (p[0] + q[0]) / 2 - c[0], my = (p[1] + q[1]) / 2 - c[1];
      if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
      out.push(Math.atan2(ny, nx));
    }
    return out;
  }
  /* fracture grids by material (cols, rows, split chance, jitter, row jitter boost) for props given as the game's own art */
  var MGRID = { wood: [5, 2, 0.35, 0.18, 1.8], clay: [3, 3, 0.5, 0.34, 1], stone: [3, 3, 0.3, 0.3, 1], rock: [3, 3, 0.3, 0.3, 1], crystal: [3, 3, 0.75, 0.3, 1],
    iron: [3, 2, 0.4, 0.3, 1], bone: [3, 3, 0.4, 0.3, 1], bark: [4, 2, 0.4, 0.25, 1.5], leaf: [3, 3, 0.5, 0.3, 1], shell: [3, 3, 0.5, 0.3, 1], spirit: [3, 3, 0.7, 0.3, 1] };
  var MDUST = { wood: '#a07a58', clay: '#a8775a', stone: '#9a9186', rock: '#97826a', crystal: '#bcd8e2', leaf: '#8c9560', bark: '#7d5c42', bone: '#c4b89c',
    shell: '#8a7896', iron: '#6e6660', spirit: '#b4a6e0' };
  var CUSTOM = {};   // props drawn by the game: artKey -> kind definition
  function kindDef(kind) { return KINDS[kind] || CUSTOM[kind] || null; }
  /* a broken edge between two fracture points: 2 jittered points, the same for both cells that share it */
  function jag(a, b, amt) {
    var flip = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]), p = flip ? b : a, q = flip ? a : b;
    var R = mulberry(strHash(p[0].toFixed(4) + ',' + p[1].toFixed(4) + ';' + q[0].toFixed(4) + ',' + q[1].toFixed(4))), dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1;
    var out = [], t1 = 0.28 + R() * 0.12, t2 = 0.6 + R() * 0.12, j1 = (R() - 0.5) * 2 * amt * L, j2 = (R() - 0.5) * 2 * amt * L;
    out.push([p[0] + dx * t1 - dy / L * j1, p[1] + dy * t1 + dx / L * j1], [p[0] + dx * t2 - dy / L * j2, p[1] + dy * t2 + dx / L * j2]);
    if (flip) out.reverse();
    return out;
  }
  function jagged(cell, amt) { var out = []; for (var i = 0; i < cell.length; i++) { var a = cell[i], b = cell[(i + 1) % cell.length]; out.push(a); var m = jag(a, b, amt); out.push(m[0], m[1]); } return out; }
  /* fracture pattern of a kind (variant v): pure math from (kind, v), the same everywhere */
  var FRACT = {};
  function lineAt(L, x) {   // y of a polyline [[x, y], ...] (sorted by x) at x, clamped at the ends
    if (x <= L[0][0]) return L[0][1];
    for (var i = 1; i < L.length; i++) if (x <= L[i][0]) { var a = L[i - 1], b = L[i], t = (x - a[0]) / ((b[0] - a[0]) || 1); return a[1] + (b[1] - a[1]) * t; }
    return L[L.length - 1][1];
  }
  function halfClip(P, a, b, c) {   // keep the part of polygon P where a*x + b*y <= c
    var out = [];
    for (var i = 0; i < P.length; i++) {
      var p = P[i], q = P[(i + 1) % P.length], fp = a * p[0] + b * p[1] - c, fq = a * q[0] + b * q[1] - c;
      if (fp <= 0) out.push(p);
      if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { var t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    return out;
  }
  /* fracture styles by material: wood and bark split into planks along the grain with splintered ends; everything else into
     chunky Voronoi lumps (5-8 sides). Cells are cut from the prop's bounding box, then clipped to its silhouette. */
  var PLANKS = { wood: 1, bark: 1 };
  function plankCells(R, minx, maxx, miny, vertical) {
    var W = maxx - minx, HH = -miny, cells = [], n = 5, k, ax0 = vertical ? minx : miny, ax1 = vertical ? maxx : 0, len0 = vertical ? miny : minx, len1 = vertical ? 0 : maxx;
    var lines = [ax0]; for (k = 1; k < n; k++) lines.push(ax0 + (ax1 - ax0) * (k + (R() - 0.5) * 0.25) / n); lines.push(ax1);
    var P = function (a, l) { return vertical ? [a, l] : [l, a]; };
    for (k = 0; k < n; k++) {
      var a0 = lines[k], a1 = lines[k + 1], th = a1 - a0, L = len1 - len0;
      var cuts = R() < 0.75 ? [len0 + L * (0.3 + R() * 0.4)] : [];   // most planks snap once
      var ends = [len0].concat(cuts).concat([len1]);
      for (var c = 0; c + 1 < ends.length; c++) {
        var e0 = ends[c], e1 = ends[c + 1], poly = [];
        // splintered ends: a zigzag across the plank where it snapped (not at the outer ends)
        poly.push(P(a0, e0));
        if (c > 0) { poly.push(P(a0 + th * 0.35, e0 + (R() - 0.5) * th * 0.9)); poly.push(P(a0 + th * 0.7, e0 + (R() - 0.5) * th * 0.9)); }
        poly.push(P(a1, e0));
        poly.push(P(a1, e1));
        if (c + 2 < ends.length) { poly.push(P(a0 + th * 0.7, e1 + (R() - 0.5) * th * 0.9)); poly.push(P(a0 + th * 0.35, e1 + (R() - 0.5) * th * 0.9)); }
        poly.push(P(a0, e1));
        // keep the shared splinter points identical on both sides of a snap: rebuild the next piece's start from this end
        cells.push(poly);
      }
    }
    // make the two sides of each snap match: the start zigzag of piece c+1 is the end zigzag of piece c (reversed)
    for (k = 0; k + 1 < cells.length; k++) {
      var A = cells[k], B = cells[k + 1];
      if (A.length === 6 && B.length >= 6 && Math.abs((vertical ? A[0][0] : A[0][1]) - (vertical ? B[0][0] : B[0][1])) < 1e-9) { B[1] = A[4]; B[2] = A[3]; }
    }
    return cells;
  }
  function voronoiCells(R, minx, maxx, miny, n) {
    var W = maxx - minx, HH = -miny, cols = n > 6 ? 3 : 2, rows = Math.ceil(n / cols), seeds = [], i, j, box = [[minx, miny], [maxx, miny], [maxx, 0], [minx, 0]], cells = [];
    for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) seeds.push([minx + W * (i + 0.5 + (R() - 0.5) * 0.4) / cols, miny + HH * (j + 0.5 + (R() - 0.5) * 0.4) / rows]);
    for (i = 0; i < seeds.length; i++) {
      var c = box.slice();
      for (j = 0; j < seeds.length && c.length; j++) {
        if (i === j) continue;
        var a = seeds[j][0] - seeds[i][0], b = seeds[j][1] - seeds[i][1], mx = (seeds[i][0] + seeds[j][0]) / 2, my = (seeds[i][1] + seeds[j][1]) / 2;
        c = halfClip(c, a, b, a * mx + b * my);
      }
      if (c.length >= 3) cells.push(c);
    }
    return cells;
  }
  function fracture(kind, v, top) {   // top: top-down view, chunky lumps for every material (no front-face planks)
    var key = kind + '#' + v + (top ? 't' : ''); if (FRACT[key]) return FRACT[key];
    var K = kindDef(kind), hull = hullOf(K.hull), R = mulberry(strHash(key) ^ 0x9e3779b9), minx = 1e9, maxx = -1e9, miny = 0, i;
    for (i = 0; i < hull.length; i++) { minx = Math.min(minx, hull[i][0]); maxx = Math.max(maxx, hull[i][0]); miny = Math.min(miny, hull[i][1]); }
    var planks = PLANKS[K.mat] && !top, kb = num(K.keepBase, 0);
    var cells = planks ? plankCells(R, minx, maxx, miny, kind === 'barrel') : voronoiCells(R, minx, maxx, kb > 0 ? Math.min(-kb - 0.05, miny) : miny, K.mat === 'crystal' ? 7 : 8);
    var ABOVE = null;
    if (kb > 0) {   // keepBase: the base stays one piece, cut along a jagged line (the game's baseLine if given) with a few short stumps
      var L = [], n2 = 14, q;
      if (K.baseLine && K.baseLine.length >= 2) { for (q = 0; q <= n2; q++) { var xq = minx + (maxx - minx) * q / n2, yq = lineAt(K.baseLine, xq); L.push([xq, yq == null ? -kb : yq]); } }
      else for (q = 0; q <= n2; q++) L.push([minx + (maxx - minx) * q / n2, -kb]);
      for (q = 0; q < L.length; q++) { L[q][1] += (R() - 0.5) * 0.07; if (q % 3 === 1) L[q][1] -= 0.03 + R() * 0.07; L[q][1] = Math.min(-0.02, L[q][1]); }
      var y0 = L[0][1], y1 = L[L.length - 1][1];
      ABOVE = [[minx - 1, y0]].concat(L).concat([[maxx + 1, y1], [maxx + 1, -3], [minx - 1, -3]]);
      cells.push([[minx - 1, y0]].concat(L).concat([[maxx + 1, y1], [maxx + 1, 1], [minx - 1, 1]]));
    }
    var pieces = [], hullA = Math.abs(polyArea(hull));
    for (var k = 0; k < cells.length; k++) {
      var isBase = kb > 0 && k === cells.length - 1;
      var src = planks || isBase || cells[k].length < 3 ? cells[k] : jagged(cells[k], 0.03);   // lumps: small jitter on the edges only
      if (kb > 0 && !isBase) src = clipConvex(ABOVE, cells[k]);   // the jagged cut line wins over the edge jitter here
      var P0 = src.length >= 3 ? clipConvex(src, hull) : [], P = [];
      for (var u = 0; u < P0.length; u++) { var pu = P0[u], pv = P.length ? P[P.length - 1] : P0[P0.length - 1]; if (Math.abs(pu[0] - pv[0]) + Math.abs(pu[1] - pv[1]) > 1e-4) P.push(pu); }   // drop repeated corners
      if (P.length < 3 || Math.abs(polyArea(P)) < Math.max(0.004, hullA * 0.012)) continue;   // no crumbs
      var c = centroid(P), ax = axes(P, c), cut = [];
      for (var e = 0; e < P.length; e++) {
        var p0 = P[e], p1 = P[(e + 1) % P.length], outer = false;
        for (var h = 0; h < hull.length && !outer; h++) if (onLine(p0, hull[h], hull[(h + 1) % hull.length]) && onLine(p1, hull[h], hull[(h + 1) % hull.length])) outer = true;
        cut.push(!outer);
      }
      var hp = hullOf(P);
      pieces.push({ poly: P, c: c, a0: ax.a0, hl: ax.hl, hs: ax.hs, cut: cut, area: Math.abs(polyArea(P)), hp: hp, na: normals(hp, c), ns: edgeDist(hp, c), mat: K.mat, base: isBase });
    }
    FRACT[key] = pieces; return pieces;
  }

  /* generic loose shards of a material (variant v): unit radius 1 */
  var SHAPES = {};
  function shardShape(mat, v) {
    var key = mat + '#' + v; if (SHAPES[key]) return SHAPES[key];
    var M = MATS[mat] || MATS.rock, R = mulberry(strHash(key) ^ 0x51ed27), n = M.verts || 5, P = [], i;
    if (M.shape === 'leaf') P = [[-1, 0], [-0.4, -0.42], [0.35, -0.38], [1, 0], [0.35, 0.38], [-0.4, 0.42]];
    else {
      var el = M.elong * (0.75 + R() * 0.5);
      for (i = 0; i < n; i++) {
        var a = (i + 0.2 + R() * 0.6) / n * TAU, r = 0.65 + R() * 0.35;
        P.push([Math.cos(a) * r * Math.sqrt(el), Math.sin(a) * r / Math.sqrt(el)]);
      }
      P = hullOf(P);
    }
    var c = centroid(P); for (i = 0; i < P.length; i++) P[i] = [P[i][0] - c[0], P[i][1] - c[1]];
    var ax = axes(P, [0, 0]), s = 1 / Math.max(ax.hl, 0.001);
    for (i = 0; i < P.length; i++) P[i] = [P[i][0] * s, P[i][1] * s];
    SHAPES[key] = { poly: P, a0: ax.a0, hl: 1, hs: ax.hs * s, leaf: M.shape === 'leaf', na: normals(P, [0, 0]), ns: edgeDist(P, [0, 0]) };
    return SHAPES[key];
  }

  /* ---------- prop art (drawn in code, unit = prop height, origin = base centre) ---------- */
  function path(g, P) { g.beginPath(); g.moveTo(P[0][0], P[0][1]); for (var i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]); g.closePath(); }
  function lin(g, x0, y0, x1, y1, stops) { var gr = g.createLinearGradient(x0, y0, x1, y1); for (var i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]); return gr; }
  /* painterly texture: short light and dark dabs over what is already drawn (source-atop keeps the silhouette) */
  function paint(g, R, x, y, w, h, light, dark, n) {
    g.save(); g.globalCompositeOperation = 'source-atop'; g.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var px = x + R() * w, py = y + R() * h, a = (R() - 0.5) * 0.8, l = 0.02 + R() * 0.05, lit = R() < 0.5 - (px - x) / w * 0.3 - (py - y) / h * 0.2;
      g.strokeStyle = rgba(lit ? light : dark, 0.1 + R() * 0.12); g.lineWidth = 0.008 + R() * 0.012;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke();
    }
    g.restore();
  }
  /* cracks of a damaged prop, baked into its cached sprite (level 1..3 adds branches) */
  function crackArt(g, kind, level, seed) {
    var K = kindDef(kind), R = mulberry(strHash(kind + '~' + seed)), M = MATS[K.mat], ox = (R() - 0.5) * 0.2, oy = -0.5 + (R() - 0.5) * 0.2, i, k;
    g.save(); g.globalCompositeOperation = 'source-atop'; g.lineCap = 'round'; g.lineJoin = 'round';
    var lines = [];
    for (i = 0; i < 2 + level * 2; i++) {
      var a = i / (2 + level * 2) * TAU + R() * 0.8, x = ox, y = oy, pts = [[x, y]], n = 2 + (R() * 3 | 0);
      for (k = 0; k < n; k++) { a += (R() - 0.5) * 0.9; var L = 0.06 + R() * 0.08 * (0.6 + level * 0.25); x += Math.cos(a) * L; y += Math.sin(a) * L; pts.push([x, y]); }
      lines.push(pts);
    }
    for (var pass = 0; pass < 2; pass++) {
      g.strokeStyle = pass ? rgba(M.line, 0.85) : rgba(M.cut, 0.55); g.lineWidth = pass ? 0.014 : 0.026;
      for (i = 0; i < lines.length; i++) { g.beginPath(); for (k = 0; k < lines[i].length; k++) g[k ? 'lineTo' : 'moveTo'](lines[i][k][0] + (pass ? 0 : 0.008), lines[i][k][1] + (pass ? 0 : 0.01)); g.stroke(); }
    }
    g.restore();
  }
  var ART = {
    crate: function (g, T, R) {
      var w = T.w, L = '#2a1608';
      // top face (lid), lit
      path(g, [[-0.47, -0.74], [0.47, -0.74], [0.41, -0.97], [-0.41, -0.97]]);
      g.fillStyle = lin(g, -0.4, -0.97, 0.4, -0.74, [0, w[0], 1, w[1]]); g.fill();
      g.strokeStyle = rgba(w[3], 0.75); g.lineWidth = 0.022;
      for (var k = 1; k < 4; k++) { var u = k / 4; g.beginPath(); g.moveTo(-0.41 + 0.82 * u, -0.97); g.lineTo(-0.47 + 0.94 * u, -0.74); g.stroke(); }
      g.strokeStyle = rgba('#ffffff', 0.25); g.lineWidth = 0.014; g.beginPath(); g.moveTo(-0.39, -0.955); g.lineTo(0.39, -0.955); g.stroke();
      // front face
      g.fillStyle = lin(g, -0.47, -0.74, 0.47, 0, [0, w[1], 0.55, w[2], 1, w[3]]); g.fillRect(-0.47, -0.74, 0.94, 0.74);
      // planks
      for (k = 0; k < 3; k++) {
        var y0 = -0.74 + k * 0.2467;
        g.fillStyle = lin(g, 0, y0, 0, y0 + 0.2467, [0, rgba('#ffffff', 0.12), 0.85, rgba('#000000', 0), 1, rgba('#000000', 0.28)]); g.fillRect(-0.47, y0, 0.94, 0.2467);
        g.strokeStyle = rgba(w[3], 0.45); g.lineWidth = 0.012;
        for (var s = 0; s < 2; s++) { var gy = y0 + 0.07 + s * 0.09 + R() * 0.03; g.beginPath(); g.moveTo(-0.36, gy); g.bezierCurveTo(-0.1, gy - 0.02, 0.1, gy + 0.025, 0.36, gy - 0.005); g.stroke(); }
      }
      g.strokeStyle = rgba(L, 0.85); g.lineWidth = 0.028;
      for (k = 1; k < 3; k++) { g.beginPath(); g.moveTo(-0.47, -0.74 + k * 0.2467); g.lineTo(0.47, -0.74 + k * 0.2467); g.stroke(); }
      // diagonal brace
      path(g, [[-0.37, -0.02], [-0.37, -0.15], [0.37, -0.72], [0.37, -0.59]]);
      g.fillStyle = lin(g, -0.37, 0, 0.37, -0.72, [0, w[2], 1, w[1]]); g.fill(); g.strokeStyle = rgba(L, 0.8); g.lineWidth = 0.024; g.stroke();
      // corner posts
      for (s = -1; s <= 1; s += 2) {
        var x0 = s < 0 ? -0.47 : 0.37;
        g.fillStyle = lin(g, x0, 0, x0 + 0.1, 0, s < 0 ? [0, w[1], 1, w[2]] : [0, w[2], 1, w[3]]); g.fillRect(x0, -0.74, 0.1, 0.74);
        g.strokeStyle = rgba(L, 0.85); g.lineWidth = 0.024; g.strokeRect(x0, -0.74, 0.1, 0.74);
        g.fillStyle = '#3a3634'; for (var n = 0; n < 2; n++) { g.beginPath(); g.arc(x0 + 0.05, n ? -0.06 : -0.68, 0.022, 0, TAU); g.fill(); }
        g.fillStyle = rgba('#ffffff', 0.5); for (n = 0; n < 2; n++) { g.beginPath(); g.arc(x0 + 0.043, (n ? -0.06 : -0.68) - 0.007, 0.008, 0, TAU); g.fill(); }
      }
      g.fillStyle = lin(g, 0, -0.1, 0, 0, [0, rgba('#000000', 0), 1, rgba('#000000', 0.3)]); g.fillRect(-0.47, -0.1, 0.94, 0.1);
      g.strokeStyle = rgba('#ffffff', 0.18); g.lineWidth = 0.016; g.beginPath(); g.moveTo(-0.455, -0.73); g.lineTo(0.455, -0.73); g.stroke();
      paint(g, R, -0.47, -0.97, 0.94, 0.97, w[0], w[3], 90);
      path(g, KINDS.crate.hull); g.strokeStyle = L; g.lineWidth = 0.034; g.lineJoin = 'round'; g.stroke();
    },
    barrel: function (g, T, R) {
      var w = T.w, L = '#26140a', i;
      var body = function () { g.beginPath(); g.moveTo(-0.3, -0.05); g.quadraticCurveTo(-0.44, -0.46, -0.32, -0.9); g.lineTo(0.32, -0.9); g.quadraticCurveTo(0.44, -0.46, 0.3, -0.05); g.ellipse(0, -0.05, 0.3, 0.05, 0, 0, Math.PI); g.closePath(); };
      body(); g.fillStyle = lin(g, -0.39, 0, 0.39, 0, [0, w[3], 0.16, w[1], 0.32, w[0], 0.55, w[1], 0.82, w[2], 1, w[3]]); g.fill();
      g.save(); body(); g.clip();
      g.fillStyle = lin(g, 0, -0.9, 0, 0, [0, rgba('#000000', 0.15), 0.25, rgba('#000000', 0), 0.8, rgba('#000000', 0), 1, rgba('#000000', 0.35)]); g.fillRect(-0.5, -1, 1, 1);
      g.strokeStyle = rgba(w[3], 0.7); g.lineWidth = 0.018;
      for (i = -2; i <= 2; i++) { var x = i * 0.12; g.beginPath(); g.moveTo(x * 0.86, -0.9); g.quadraticCurveTo(x * 1.22, -0.46, x * 0.84, 0); g.stroke(); }
      g.strokeStyle = rgba('#ffffff', 0.22); g.lineWidth = 0.012;
      for (i = -2; i <= 2; i++) { x = i * 0.12 - 0.025; g.beginPath(); g.moveTo(x * 0.86, -0.86); g.quadraticCurveTo(x * 1.22, -0.46, x * 0.84, -0.04); g.stroke(); }
      [-0.2, -0.72].forEach(function (y) {   // iron hoops
        g.fillStyle = lin(g, -0.4, 0, 0.4, 0, [0, '#2c3136', 0.25, '#9aa3ab', 0.4, '#d6dce1', 0.7, '#5d656c', 1, '#23272b']); g.fillRect(-0.5, y - 0.035, 1, 0.07);
        g.fillStyle = rgba('#000000', 0.35); g.fillRect(-0.5, y + 0.028, 1, 0.012);
        g.fillStyle = '#1e2226'; for (var k = -1; k <= 1; k += 2) { g.beginPath(); g.arc(k * 0.18, y, 0.016, 0, TAU); g.fill(); }
      });
      g.restore();
      g.beginPath(); g.ellipse(0, -0.9, 0.32, 0.075, 0, 0, TAU); g.fillStyle = lin(g, -0.3, -0.95, 0.3, -0.85, [0, w[1], 1, w[2]]); g.fill();
      g.beginPath(); g.ellipse(0, -0.9, 0.26, 0.055, 0, 0, TAU); g.fillStyle = lin(g, -0.3, -0.95, 0.3, -0.85, [0, w[2], 1, w[3]]); g.fill();
      g.strokeStyle = rgba(w[3], 0.9); g.lineWidth = 0.014; for (i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 0.09, -0.95); g.lineTo(i * 0.09, -0.85); g.stroke(); }
      paint(g, R, -0.4, -1, 0.8, 1, w[0], w[3], 80);
      g.lineWidth = 0.032; g.strokeStyle = L; body(); g.stroke(); g.beginPath(); g.ellipse(0, -0.9, 0.32, 0.075, 0, 0, TAU); g.stroke();
    },
    pot: function (g, T, R) {
      var w = T.w, L = '#2e1208';
      var body = function () {
        g.beginPath(); g.moveTo(-0.19, 0); g.bezierCurveTo(-0.34, -0.06, -0.42, -0.3, -0.36, -0.5); g.bezierCurveTo(-0.3, -0.7, -0.18, -0.76, -0.15, -0.86);
        g.lineTo(-0.23, -0.92); g.quadraticCurveTo(-0.25, -0.99, -0.17, -0.995); g.lineTo(0.17, -0.995); g.quadraticCurveTo(0.25, -0.99, 0.23, -0.92); g.lineTo(0.15, -0.86);
        g.bezierCurveTo(0.18, -0.76, 0.3, -0.7, 0.36, -0.5); g.bezierCurveTo(0.42, -0.3, 0.34, -0.06, 0.19, 0); g.closePath();
      };
      body(); var rg = g.createRadialGradient(-0.13, -0.5, 0.02, -0.02, -0.42, 0.46); rg.addColorStop(0, w[0]); rg.addColorStop(0.45, w[1]); rg.addColorStop(0.85, w[2]); rg.addColorStop(1, w[3]); g.fillStyle = rg; g.fill();
      g.save(); body(); g.clip();
      g.fillStyle = T.band; g.fillRect(-0.5, -0.6, 1, 0.1);
      g.fillStyle = T.paint; for (var k = -4; k <= 4; k++) { g.beginPath(); g.moveTo(k * 0.09 - 0.035, -0.505); g.lineTo(k * 0.09, -0.59); g.lineTo(k * 0.09 + 0.035, -0.505); g.closePath(); g.fill(); }
      g.fillStyle = rgba(T.band, 0.9); g.fillRect(-0.5, -0.28, 1, 0.025);
      g.fillStyle = lin(g, 0, -0.86, 0, -0.74, [0, rgba('#000000', 0.35), 1, rgba('#000000', 0)]); g.fillRect(-0.5, -0.86, 1, 0.12);
      g.fillStyle = lin(g, -0.4, 0, 0.4, 0, [0, rgba('#000000', 0), 0.65, rgba('#000000', 0), 1, rgba('#000000', 0.32)]); g.fillRect(-0.5, -1, 1, 1);
      g.restore();
      paint(g, R, -0.4, -1, 0.8, 1, w[0], w[3], 60);
      g.beginPath(); g.ellipse(-0.17, -0.44, 0.045, 0.1, 0.25, 0, TAU); g.fillStyle = rgba('#ffffff', 0.5); g.fill();
      g.beginPath(); g.ellipse(0, -0.955, 0.17, 0.035, 0, 0, TAU); g.fillStyle = '#2a1006'; g.fill();
      body(); g.strokeStyle = L; g.lineWidth = 0.034; g.lineJoin = 'round'; g.stroke();
    },
    statue: function (g, T, R) {
      var w = T.w, L = '#26231e';
      // plinth with a bevelled top
      path(g, [[-0.36, 0], [0.36, 0], [0.36, -0.2], [-0.36, -0.2]]); g.fillStyle = lin(g, -0.36, 0, 0.36, 0, [0, w[1], 0.5, w[2], 1, w[3]]); g.fill();
      path(g, [[-0.36, -0.2], [0.36, -0.2], [0.3, -0.27], [-0.3, -0.27]]); g.fillStyle = lin(g, 0, -0.27, 0, -0.2, [0, w[0], 1, w[1]]); g.fill();
      g.strokeStyle = rgba(w[3], 0.75); g.lineWidth = 0.014; g.beginPath(); g.moveTo(-0.1, -0.2); g.lineTo(-0.06, -0.11); g.lineTo(-0.11, 0); g.moveTo(0.2, -0.2); g.lineTo(0.23, -0.09); g.stroke();
      g.fillStyle = rgba('#000000', 0.25); g.fillRect(-0.36, -0.045, 0.72, 0.045);
      // owl guardian: egg body, folded wings, ear tufts, carved eyes and beak
      var body = function () { g.beginPath(); g.moveTo(-0.2, -0.27); g.bezierCurveTo(-0.3, -0.42, -0.27, -0.72, -0.17, -0.84); g.lineTo(-0.2, -0.99); g.lineTo(-0.07, -0.9); g.quadraticCurveTo(0, -0.92, 0.07, -0.9); g.lineTo(0.2, -0.99); g.lineTo(0.17, -0.84); g.bezierCurveTo(0.27, -0.72, 0.3, -0.42, 0.2, -0.27); g.closePath(); };
      body(); var rg = g.createRadialGradient(-0.09, -0.62, 0.02, 0, -0.55, 0.38); rg.addColorStop(0, w[0]); rg.addColorStop(0.5, w[1]); rg.addColorStop(1, w[3]); g.fillStyle = rg; g.fill();
      g.save(); body(); g.clip();
      g.fillStyle = rgba(w[3], 0.55);   // wings
      g.beginPath(); g.moveTo(-0.24, -0.66); g.quadraticCurveTo(-0.08, -0.5, -0.12, -0.28); g.lineTo(-0.3, -0.28); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0.24, -0.66); g.quadraticCurveTo(0.08, -0.5, 0.12, -0.28); g.lineTo(0.3, -0.28); g.closePath(); g.fill();
      g.strokeStyle = rgba(w[3], 0.6); g.lineWidth = 0.012;   // breast feathers
      for (var r = 0; r < 3; r++) for (var c = -1; c <= 1; c++) { var fx = c * 0.055 + (r % 2) * 0.027, fy = -0.56 + r * 0.075; g.beginPath(); g.arc(fx, fy, 0.03, 0.2, Math.PI - 0.2); g.stroke(); }
      g.fillStyle = lin(g, 0, -0.4, 0, -0.27, [0, rgba('#000000', 0), 1, rgba('#000000', 0.35)]); g.fillRect(-0.3, -0.4, 0.6, 0.13);
      g.restore();
      for (var k = -1; k <= 1; k += 2) {   // eyes
        g.beginPath(); g.arc(k * 0.075, -0.765, 0.062, 0, TAU); g.fillStyle = lin(g, 0, -0.83, 0, -0.7, [0, w[3], 1, w[2]]); g.fill();
        g.strokeStyle = rgba(L, 0.8); g.lineWidth = 0.014; g.stroke();
        g.beginPath(); g.arc(k * 0.075, -0.765, 0.026, 0, TAU); g.fillStyle = mix(w[3], '#000000', 0.5); g.fill();
        g.beginPath(); g.arc(k * 0.075 - 0.012, -0.778, 0.009, 0, TAU); g.fillStyle = rgba('#ffffff', 0.45); g.fill();
      }
      path(g, [[-0.022, -0.73], [0.022, -0.73], [0, -0.68]]); g.fillStyle = w[3]; g.fill();
      g.fillStyle = T.moss; g.beginPath(); g.ellipse(-0.26, -0.015, 0.08, 0.025, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(0.25, -0.235, 0.06, 0.016, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(0.13, -0.95, 0.04, 0.014, -0.5, 0, TAU); g.fill();
      paint(g, R, -0.3, -1, 0.6, 1, w[0], w[3], 70);
      g.strokeStyle = L; g.lineWidth = 0.03; g.lineJoin = 'round';
      body(); g.stroke();
      path(g, [[-0.36, 0], [0.36, 0], [0.36, -0.2], [0.3, -0.27], [-0.3, -0.27], [-0.36, -0.2]]); g.stroke();
    },
    crystal: function (g, T) {
      var w = T.w, L = mix(w[3], '#000000', 0.45);
      g.beginPath(); g.ellipse(0, -0.05, 0.42, 0.08, 0, 0, TAU); g.fillStyle = '#6d6a64'; g.fill();
      path(g, [[-0.4, -0.02], [-0.3, -0.12], [0.3, -0.13], [0.43, -0.03], [0.3, 0], [-0.3, 0]]); g.fillStyle = lin(g, 0, -0.13, 0, 0, [0, '#9c978e', 1, '#55524c']); g.fill(); g.strokeStyle = '#2a2824'; g.lineWidth = 0.024; g.stroke();
      var prism = function (bx, by, tx, ty, wd, k) {
        var dx = tx - bx, dy = ty - by, L2 = Math.hypot(dx, dy), nx = -dy / L2 * wd, ny = dx / L2 * wd, sx = bx + dx * 0.78, sy = by + dy * 0.78;
        path(g, [[bx - nx, by - ny], [sx - nx, sy - ny], [tx, ty], [sx + nx, sy + ny], [bx + nx, by + ny]]);
        g.fillStyle = lin(g, bx - nx, by - ny, bx + nx, by + ny, [0, w[k ? 1 : 0], 0.48, w[1], 0.52, w[2], 1, w[3]]); g.fill();
        g.strokeStyle = L; g.lineWidth = 0.026; g.lineJoin = 'round'; g.stroke();
        g.strokeStyle = rgba('#ffffff', 0.7); g.lineWidth = 0.014; g.beginPath(); g.moveTo(bx + dx * 0.1, by + dy * 0.1); g.lineTo(sx, sy); g.lineTo(tx, ty); g.stroke();
        g.strokeStyle = rgba('#ffffff', 0.45); g.lineWidth = 0.01; g.beginPath(); g.moveTo(bx - nx * 0.5 + dx * 0.2, by - ny * 0.5 + dy * 0.2); g.lineTo(bx - nx * 0.5 + dx * 0.6, by - ny * 0.5 + dy * 0.6); g.stroke();
      };
      prism(-0.22, -0.08, -0.36, -0.6, 0.075, 0);
      prism(0.22, -0.08, 0.4, -0.44, 0.07, 1);
      prism(0.04, -0.06, 0.04, -1, 0.11, 0);
      prism(-0.08, -0.07, -0.16, -0.78, 0.07, 1);
      prism(0.12, -0.07, 0.2, -0.82, 0.075, 0);
      var rg = g.createRadialGradient(0, -0.5, 0, 0, -0.5, 0.5); rg.addColorStop(0, rgba(w[1], 0.3)); rg.addColorStop(1, rgba(w[1], 0));
      g.fillStyle = rg; g.globalCompositeOperation = 'source-atop'; g.fillRect(-0.5, -1, 1, 1); g.globalCompositeOperation = 'source-over';
    }
  };

  /* draw a generic material shard (unit radius 1) */
  function drawShard(g, mat, shp) {
    var M = MATS[mat] || MATS.rock, c = M.c, P = shp.poly, i;
    path(g, P); g.fillStyle = lin(g, -0.8, -0.6, 0.8, 0.6, [0, c[0], 0.45, c[1], 1, c[2]]); g.fill();
    g.save(); path(g, P); g.clip();
    if (M.detail === 'grain') { g.strokeStyle = rgba(c[3], 0.55); g.lineWidth = 0.09; g.beginPath(); g.moveTo(-1.2, -0.12); g.lineTo(1.2, 0.04); g.moveTo(-1.2, 0.2); g.lineTo(1.2, 0.3); g.stroke(); }
    if (M.detail === 'facet' || M.glint) { g.fillStyle = rgba('#ffffff', 0.55); g.beginPath(); g.moveTo(-0.7, -0.05); g.lineTo(0.35, -0.3); g.lineTo(0.55, 0.02); g.closePath(); g.fill(); }
    if (M.detail === 'curve') { g.strokeStyle = rgba(c[3], 0.45); g.lineWidth = 0.1; g.beginPath(); g.arc(0, 1.6, 1.5, -2.2, -0.9); g.stroke(); }
    if (M.shape === 'leaf') { g.strokeStyle = rgba(c[3], 0.85); g.lineWidth = 0.1; g.beginPath(); g.moveTo(-1, 0); g.lineTo(0.95, 0); g.stroke(); }
    g.fillStyle = rgba(c[3], 0.45); g.fillRect(-2, 0.22, 4, 2);
    g.restore();
    path(g, P); g.strokeStyle = rgba(M.line, 0.75); g.lineWidth = 0.11; g.lineJoin = 'round'; g.stroke();
    var top = 0; for (i = 1; i < P.length; i++) if (P[i][1] < P[top][1]) top = i;
    var a = P[(top + P.length - 1) % P.length], b = P[top], d = P[(top + 1) % P.length];
    g.strokeStyle = rgba('#ffffff', 0.5); g.lineWidth = 0.08; g.beginPath(); g.moveTo(a[0] * 0.78, a[1] * 0.78); g.lineTo(b[0] * 0.78, b[1] * 0.78); g.lineTo(d[0] * 0.78, d[1] * 0.78); g.stroke();
  }

  /* ---------- sprite caches (rendering only: never read by update) ---------- */
  var CANVAS = null;
  var C = { prop: {}, white: {}, piece: {}, shard: {}, puff: {}, shadow: null };   // sprite caches shared by every instance (rendering only)
  function mk(w, h) {
    var c = CANVAS ? CANVAS(w, h) : (typeof document !== 'undefined' && document.createElement ? document.createElement('canvas') : null);
    if (c) { c.width = Math.max(1, w); c.height = Math.max(1, h); }
    return c;
  }

  function create(opt) {
    opt = opt || {};
    var P = {}, k;
    for (k in DEF) P[k] = DEF[k];
    function setParams(o) { if (!o) return; for (var k2 in o) if (k2 in DEF) P[k2] = typeof DEF[k2] === 'number' ? num(o[k2], DEF[k2]) : (o[k2] == null || o[k2] === '' ? DEF[k2] : String(o[k2])); }
    setParams(opt.params);
    var TOP = opt.view === 'top' || opt.view === 'topdown' || opt.view === 'top-down';
    var rng = mulberry((num(opt.seed, 1) >>> 0) ^ 0xC0FFEE);
    var scaleOf = function () { var s = typeof opt.scale === 'function' ? safe(opt.scale, 1) : opt.scale; return num(s, 1) > 0 ? num(s, 1) : 1; };
    var TILE = num(opt.tile, 0);
    var S = { time: 0, acc: 0, updates: 0, frozen: 0, draws: 0, spawned: 0, recycled: 0, peak: 0, breaks: 0, hits: 0, cracks: 0, wallHits: 0,
      shatters: 0, dustN: 0, lookups: 0, kicks: 0, cbErrors: 0, drawErrors: 0, updErrors: 0, badInput: 0, blocked: 0, freed: 0, fell: 0, seq: 0, shakeT: 0, shakeA: 0, shakeMs: 1, groundDone: false };

    function safe(fn, d, a, b, c, e) { if (typeof fn !== 'function') return d; try { var r = fn(a, b, c, e); return r === undefined ? d : r; } catch (er) { S.cbErrors++; return d; } }
    function wallAt(x, y) { if (typeof opt.solid !== 'function') return false; try { return !!opt.solid(x, y); } catch (e) { S.cbErrors++; return false; } }
    function propAt(x, y) {   // intact props are obstacles for pieces (params.propsBlock): their body box in side view, their base in top-down
      if (!(P.propsBlock > 0)) return false;
      for (var j = 0; j < PROPS.length; j++) {
        var pr = PROPS[j];
        if (x < pr.x + pr.x0 * 0.9 || x > pr.x + pr.x1 * 0.9) continue;
        if (TOP ? (y > pr.y - pr.h * 0.18 && y < pr.y + 1) : (y > pr.y - pr.h * 0.92 && y <= pr.y)) return true;
      }
      return false;
    }
    function solid(x, y) { return wallAt(x, y) || propAt(x, y); }
    function propTop(x, fy) {   // the intact prop whose top a side-view piece lies on, or null
      if (!(P.propsBlock > 0) || TOP) return null;
      for (var j = 0; j < PROPS.length; j++) { var pr = PROPS[j]; if (x >= pr.x + pr.x0 * 0.9 - 2 && x <= pr.x + pr.x1 * 0.9 + 2 && Math.abs(fy - (pr.y - pr.h * 0.92)) < 3) return pr; }
      return null;
    }
    function bounds() { var b = typeof opt.bounds === 'function' ? safe(opt.bounds, null) : opt.bounds; return b && b.w > 0 ? b : null; }

    /* ---------- pools (made once) ---------- */
    var CAP = Math.max(16, Math.min(2000, Math.round(P.cap)));
    var POOL = [], LIVE = [], i;
    for (i = 0; i < CAP; i++) POOL.push({ i: i, on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, a: 0, w: 0, tum: 0, wt: 0, hl: 1, hs: 1, a0: 0,
      size: 1, mat: 'rock', kind: null, v: 0, pi: -1, shp: null, piece: null, born: 0, age: 0, sleep: false, rest: 0, still: 0, ground: false,
      floorY: 0, bounce: 0.3, fric: 0.7, drag: 0, flut: 0, ph: 0, alpha: 1, seq: 0, ptint: 0, propH: 0, dep: 0, spr: null, sprDS: 0, poly: null, pcx: 0.5, pcy: 0.5, psc: 1.5, na: null, ns: null });
    var DUST = [], DLIVE = [];
    for (i = 0; i < DUST_CAP; i++) DUST.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r0: 1, r1: 3, life: 400, t: 0, col: 'dust', ph: 0, spr: null, sprDS: 0 });
    var SPR = []; for (i = 0; i < SPRING_CAP; i++) SPR.push({ key: null, t: 1e9, amp: 0, nx: 0, ny: 0, out: { x: 0, y: 0, sx: 1, sy: 1 } });
    var ZERO = { x: 0, y: 0, sx: 1, sy: 1 }, SHAKE = { x: 0, y: 0 }, VEC = { vx: 0, vy: 0 };
    var PROPS = [], PBY = {};

    /* ---------- swept test along one axis ---------- */
    var HIT = false, CQ = { x: 0.5, y: 0.5, d: 0.5, t: 0.5 };   // scratch with double fields: no boxed numbers per call
    function castQ(x, y, d, axisX) { CQ.x = x; CQ.y = y; CQ.d = d; cast(axisX); return CQ.t; }
    function cast(axisX) {   // how far the point (CQ.x, CQ.y) may move CQ.d px along x (axisX) or y before entering a solid spot -> CQ.t
      HIT = false;
      var x = CQ.x, y = CQ.y, d = CQ.d;
      CQ.t = d;
      if (!d || typeof opt.solid !== 'function') return;
      if (solid(x, y)) { HIT = true; CQ.t = 0; return; }   // already touching: never move further in
      var dir = d > 0 ? 1 : -1, L = Math.abs(d);
      if (TILE > 0) {
        var p = axisX ? x : y, c = Math.floor(p / TILE), cEnd = Math.floor((p + d) / TILE), other = axisX ? y : x;
        while (c !== cEnd) {
          c += dir;
          var cx = (c + 0.5) * TILE;
          if (axisX ? wallAt(cx, other) : wallAt(other, cx)) { HIT = true; var edge = dir > 0 ? c * TILE : (c + 1) * TILE; CQ.t = (edge - p) - dir * 0.01; break; }
        }
        if (PROPS.length && P.propsBlock > 0) castProps(axisX, x, y, dir);
        return;
      }
      var step = Math.max(0.5, num(opt.sweep, 2 * scaleOf())), n = Math.ceil(L / step), prev = 0;
      for (var s = 1; s <= n; s++) {
        var t = Math.min(L, s * step), qx = axisX ? x + dir * t : x, qy = axisX ? y : y + dir * t;
        if (solid(qx, qy)) {
          var lo = prev, hi = t;
          for (var b = 0; b < 8; b++) { var mid = (lo + hi) / 2; if (solid(axisX ? x + dir * mid : x, axisX ? y : y + dir * mid)) hi = mid; else lo = mid; }
          HIT = true; CQ.t = dir * lo; return;
        }
        prev = t;
      }
    }

    function castProps(axisX, x, y, dir) {   // shorten CQ.t at the first prop body box crossed along the axis
      for (var j = 0; j < PROPS.length; j++) {
        var pr = PROPS[j], bx0 = pr.x + pr.x0 * 0.9, bx1 = pr.x + pr.x1 * 0.9, by0 = TOP ? pr.y - pr.h * 0.18 : pr.y - pr.h * 0.92, by1 = TOP ? pr.y + 1 : pr.y;
        var p = axisX ? x : y, o = axisX ? y : x, lo = axisX ? bx0 : by0, hi = axisX ? bx1 : by1, olo = axisX ? by0 : bx0, ohi = axisX ? by1 : bx1;
        if (o < olo || o > ohi || (p >= lo && p <= hi)) continue;
        var edge = dir > 0 ? lo : hi, t = edge - p;
        if (t * dir < 0 || Math.abs(t) > Math.abs(CQ.t)) continue;
        HIT = true; CQ.t = t - dir * 0.01;
      }
    }
    /* ---------- spawning ---------- */
    function take() {
      var s = null, j;
      for (j = 0; j < CAP; j++) if (!POOL[j].on) { s = POOL[j]; break; }
      if (!s) {   // full: recycle the oldest resting piece, else the oldest one
        var best = null;
        for (j = 0; j < LIVE.length; j++) { var q = LIVE[j]; if (q.sleep && (!best || q.seq < best.seq)) best = q; }
        if (!best) for (j = 0; j < LIVE.length; j++) { q = LIVE[j]; if (!best || q.seq < best.seq) best = q; }
        if (!best) return null;
        free(best); S.recycled++; s = best;
      }
      s.on = true; s.seq = ++S.seq; s.spr = null; s.sprDS = 0; LIVE.push(s); S.spawned++;
      if (LIVE.length > S.peak) S.peak = LIVE.length;
      return s;
    }
    function free(s) { if (!s.on) return; s.on = false; s.piece = null; s.shp = null; var j = LIVE.indexOf(s); if (j >= 0) { LIVE[j] = LIVE[LIVE.length - 1]; LIVE.pop(); } S.freed++; }
    function initBody(s, mat, x, y, z, vx, vy, vz, w) {
      var M = MATS[mat] || MATS.rock;
      s.mat = mat; s.x = x; s.y = y; s.z = z; s.vx = vx; s.vy = vy; s.vz = vz; s.w = w * P.spin; s.age = 0; s.sleep = false; s.rest = 0; s.still = 0;
      s.ground = false; s.alpha = 1; s.bounce = clamp(P.bounce * M.bounce / 0.32, 0, 0.95); s.fric = clamp(P.friction * M.fric / 0.6, 0, 2);
      s.drag = M.drag || 0.15; s.flut = M.flutter ? 1 : 0; s.ph = rng() * TAU; s.tum = rng() * TAU; s.wt = (rng() - 0.5) * 16;
      s.dep = TOP ? 0 : (rng() - 0.3) * P.depth * scaleOf();
    }
    /* place a spawn point outside walls: slide it from the safe origin (ox, oy) toward the wanted point */
    var RO = { x: 0.5, y: 0.5 };
    /* the nearest open spot to (x, y): up first in side view (out of the ground), then rings around it; RO = the spot */
    function resolveOut(x, y) {
      RO.x = x; RO.y = y; if (!solid(x, y)) return true;
      var st = Math.max(1, 2 * scaleOf()), r, k;
      if (!TOP) for (r = st; r <= 96 * scaleOf(); r += st) if (!solid(x, y - r)) { RO.y = y - r; return true; }
      for (r = st; r <= 128 * scaleOf(); r += st) for (k = 0; k < 16; k++) {
        var a = k / 16 * TAU, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (!solid(px, py)) { RO.x = px; RO.y = py; return true; }
      }
      return false;
    }
    function settle(s, ox, oy) {   // a spawn point inside a wall: slide it from the (resolved) origin toward where it wanted to be
      if (!solid(s.x, s.y)) return;
      var tx = s.x, ty = s.y;
      if (!resolveOut(ox, oy)) { if (resolveOut(tx, ty)) { s.x = RO.x; s.y = RO.y; } return; }
      s.x = RO.x; s.y = RO.y;
      s.x += castQ(s.x, s.y, tx - s.x, true); s.y += castQ(s.x, s.y, ty - s.y, false);
      if (solid(s.x, s.y)) { s.x = RO.x; s.y = RO.y; }
    }
    function dirNorm(o) { var dx = num(o && o.dx, 0), dy = num(o && o.dy, 0), L = Math.hypot(dx, dy); VEC.vx = L > 1e-6 ? dx / L : 0; VEC.vy = L > 1e-6 ? dy / L : 0; return L > 1e-6; }

    function spawnPieces(pr, o) {
      var K = kindDef(pr.kind), H = pr.h, pieces = fracture(pr.kind, pr.variant, TOP), sc = scaleOf(), has = dirNorm(o), dx = VEC.vx, dy = VEC.vy;
      var force = num(o && o.force, 300) * sc, hx = num(o && o.x, pr.x), hy = num(o && o.y, pr.y - H * 0.5), mat = K.mat;
      for (var j = 0; j < pieces.length; j++) {
        var pc = pieces[j], s = take(); if (!s) break;
        var lx = pc.c[0] * H, ly = pc.c[1] * H;        // centroid relative to the base centre
        var px = pr.x + lx, py = TOP ? pr.y + (rng() - 0.5) * pr.w * 0.35 : pr.y + ly, pz = TOP ? -ly : 0;
        var rx = px - hx, ry = (TOP ? pr.y - H * 0.5 + ly + H * 0.5 : py) - hy, rl = Math.hypot(rx, ry) || 1;
        var out = 0.35 + rng() * 0.45, push = has ? 0.55 + rng() * 0.6 : 0;
        var vx = (rx / rl * out + dx * push) * force * (TOP ? 0.32 : 0.34), vy, vz = 0;
        if (TOP) {   // radial scatter around the prop, a little along the blow
          var ra = rng() * TAU, rs = force * (0.1 + rng() * 0.18);
          vx = Math.cos(ra) * rs + dx * push * force * 0.12; vy = Math.sin(ra) * rs * 0.85 + dy * push * force * 0.12; vz = (0.3 + rng() * 0.45) * force * (0.5 + (-pc.c[1]) * 0.5);
        }
        else vy = (ry / rl * out * 0.5 + dy * push * 0.5 - (0.45 + rng() * 0.5)) * force;
        initBody(s, mat, px, py, pz, vx, vy, vz, (rng() - 0.5) * 2 * (6 + rng() * 8) / Math.max(0.5, pc.hl * H / (10 * sc)));
        s.kind = pr.kind; s.v = pr.variant; s.pi = j; s.ptint = pr.tint; s.propH = H; s.piece = pc; s.shp = null;
        s.hl = pc.hl * H; s.hs = pc.hs * H; s.a0 = pc.a0; s.a = 0; s.size = H; s.tum = 0; s.poly = pc.hp; s.pcx = pc.c[0]; s.pcy = pc.c[1]; s.psc = H; s.na = pc.na; s.ns = pc.ns;
        if (!TOP) s.y = py; settle(s, pr.x, TOP ? pr.y : pr.y - H * 0.5);
        if (pc.base) { s.vx = s.vy = s.w = s.vz = 0; s.ground = true; s.floorY = pr.y; s.sleep = true; }   // the kept base stays exactly where it stood
      }
      var extra = Math.round((K.chips || 5) * P.amount * P.chips);
      if (extra > 0) chips(K.mat, pr.x, TOP ? pr.y : pr.y - H * 0.45, extra, (has ? dx : 0), (has ? dy : 0), force * (TOP ? 0.6 : 0.9), 2.2 * sc + H * 0.05, TOP ? H * 0.5 : 0, pr.x, TOP ? pr.y : pr.y - H * 0.5);
      if (K.extra) chips(K.extra, pr.x, TOP ? pr.y : pr.y - H * 0.5, 2, dx, dy, force * 0.8, H * 0.12, TOP ? H * 0.5 : 0, pr.x, TOP ? pr.y : pr.y - H * 0.5);
    }
    function chips(mat, x, y, n, dx, dy, force, size, z, ox, oy) {
      var sc = scaleOf();
      for (var j = 0; j < n; j++) {
        var s = take(); if (!s) return;
        var a = rng() * TAU, sp = force * (0.35 + rng() * 0.75), sz = size * (0.55 + rng() * 0.75);
        var vx = (Math.cos(a) * sp * 0.6 + dx * sp * 0.6) * (TOP ? 0.75 : 0.42), vy, vz = 0;
        if (TOP) { vx *= 0.55; vy = (Math.sin(a) * sp * 0.5 + dy * sp * 0.5) * 0.55; vz = (0.4 + rng() * 0.7) * force * 0.6; }
        else vy = Math.sin(a) * sp * 0.35 + dy * sp * 0.4 - (0.5 + rng() * 0.7) * force;
        initBody(s, mat, x + (rng() - 0.5) * size, y + (rng() - 0.5) * size * (TOP ? 1 : 0.6), z + (TOP ? rng() * size : 0), vx, vy, vz, (rng() - 0.5) * 2 * (8 + rng() * 12) * Math.min(2, 4 * sc / Math.max(1, sz)));
        s.kind = null; s.piece = null; s.v = (rng() * 8) | 0; s.shp = shardShape(mat, s.v); s.size = sz; s.hl = sz; s.hs = sz * s.shp.hs; s.a0 = s.shp.a0; s.a = rng() * TAU; s.poly = s.shp.poly; s.pcx = 0; s.pcy = 0; s.psc = sz; s.na = s.shp.na; s.ns = s.shp.ns;
        settle(s, num(ox, x), num(oy, y));
      }
    }
    function dustCol(mat) {   // dust takes the material's colour, mixed half with the ground's when params.dustTint is set
      var c = MDUST[mat] || MDUST.rock, t = /^#[0-9a-f]{6}$/i.test(P.dustTint) ? P.dustTint : null;
      return t ? mixHex(c, t, 0.5) : c;
    }
    var PN = { x: 0, y: 0 };   // optional direction for the next puff() (a wall's normal): puffs spread along it and along the wall
    function puff(x, y, z, n, size, col, spread, up) {
      var nx = PN.x, ny = PN.y; PN.x = 0; PN.y = 0;
      if (!(P.dust > 0)) return;
      n = Math.round(n * P.dust); var sc = scaleOf();
      for (var j = 0; j < n; j++) {
        var d = null;
        for (var q = 0; q < DUST_CAP; q++) if (!DUST[q].on) { d = DUST[q]; break; }
        if (!d) { d = DLIVE[0]; DLIVE.shift(); }   // full: reuse the oldest (shift only when 128 puffs are alive)
        d.on = true; DLIVE.push(d); S.dustN++;
        var a = (j + rng() * 0.6) / n * TAU, sp = spread * (0.6 + rng() * 0.6);
        d.x = x + Math.cos(a) * size * 0.4; d.y = y + (TOP ? Math.sin(a) * size * 0.25 : -rng() * size * 0.3); d.z = z;
        d.vx = Math.cos(a) * sp; d.vy = TOP ? Math.sin(a) * sp * 0.55 : -(up || 20) * sc * (0.4 + rng() * 0.8) + Math.sin(a) * sp * 0.25; d.vz = TOP ? (up || 20) * sc * (0.3 + rng() * 0.7) : 0;
        if (nx || ny) {   // out of the wall and along its face, never into it
          var tg = (rng() - 0.5) * 2, out = 0.35 + rng() * 0.65;
          d.x = x + nx * size * 0.3 * out - ny * tg * size * 0.3; d.y = y + ny * size * 0.3 * out + nx * tg * size * 0.3;
          d.vx = nx * sp * out - ny * tg * sp * 0.35; d.vy = ny * sp * out + nx * tg * sp * 0.35 - (TOP ? 0 : (up || 20) * sc * 0.3);
        }
        d.r0 = size * (0.35 + rng() * 0.3); d.r1 = size * (0.8 + rng() * 0.6); d.life = 320 + rng() * 300; d.t = 0; d.col = DUSTS[col] || /^#[0-9a-f]{6}$/i.test(col) ? col : 'dust'; d.ph = rng() * TAU; d.spr = null;
      }
    }
    function shake(px, ms) {
      if (!(P.shake > 0) || !(px > 0)) return;
      var a = Math.min(px * P.shake / 3, 12) * scaleOf();
      if (a > S.shakeA * (1 - S.shakeT / S.shakeMs)) { S.shakeA = a; S.shakeT = 0; S.shakeMs = ms; }
      safe(opt.onShake, null, a, ms);
    }

    /* ---------- props ---------- */
    function addProp(o) {
      if (!o || o.id == null) { S.badInput++; return null; }
      var kind = o.kind;
      if (typeof o.art === 'function') {   // the game's own art: art(g, h) draws the prop h px tall with its base centre at (0, 0)
        var mat = MATS[o.material] ? o.material : 'wood', G2 = MGRID[mat] || MGRID.wood, hw = num(o.w, 0.8) / 2;
        var hl = o.hull && o.hull.length >= 3 ? o.hull : [[-hw, 0], [hw, 0], [hw, -1], [-hw, -1]];
        kind = String(o.artKey || o.kind || o.id);
        var prev = CUSTOM[kind];
        CUSTOM[kind] = { keepBase: clamp(num(o.keepBase, 0), 0, 0.8), baseLine: o.baseLine && o.baseLine.length >= 2 ? o.baseLine : null, h: 40, hp: 1, mat: mat, chips: mat === 'wood' ? 5 : num(o.chips, 4), grid: [G2[0], G2[1]], split: G2[2], jit: G2[3], rowJit: G2[4], hull: hl, art: o.art, custom: true };
        if (prev && JSON.stringify(prev.hull) !== JSON.stringify(hl)) { for (var fk in FRACT) if (fk.indexOf(kind + '#') === 0) delete FRACT[fk]; }
      }
      if (!kindDef(kind)) { S.badInput++; return null; }
      var id = String(o.id); if (PBY[id]) removeProp(id);
      var K = kindDef(kind), sc = scaleOf(), hs = strHash(id + '|' + kind), NT = K.custom ? 1 : TINTS[kind].length;
      var pr = { id: id, kind: kind, x: num(o.x, 0), y: num(o.y, 0), h: num(o.h, K.h * sc), hp: Math.max(1, num(o.hp, K.hp)), maxHp: 0, variant: o.variant != null ? (num(o.variant, 0) & 3) : hs & 3,
        tint: K.custom ? 0 : o.tint != null ? num(o.tint, 0) % NT : (hs >>> 4) % NT, flash: 0, wob: 0, wobV: 0, cracks: 0, crackSeed: hs, alive: true, data: o.data, fixed: !!o.fixed, hidden: !!o.hidden };
      pr.maxHp = pr.hp;
      var hull = K.hull, mn = 0, mx = 0; for (var j = 0; j < hull.length; j++) { mn = Math.min(mn, hull[j][0]); mx = Math.max(mx, hull[j][0]); }
      pr.x0 = mn * pr.h; pr.x1 = mx * pr.h; pr.w = (mx - mn) * pr.h;
      PROPS.push(pr); PBY[id] = pr; return pr;
    }
    function removeProp(id) {
      var pr = PBY[String(id)]; if (!pr) return false; pr.alive = false; delete PBY[pr.id]; var j = PROPS.indexOf(pr); if (j >= 0) PROPS.splice(j, 1);
      for (j = 0; j < LIVE.length; j++) {   // pieces lying on it fall again
        var s = LIVE[j]; if (!s.ground || s.x < pr.x + pr.x0 - 4 || s.x > pr.x + pr.x1 + 4) continue;
        if (TOP ? Math.abs(s.y - pr.y) > pr.h * 0.3 : s.floorY < pr.y - pr.h - 4 || s.floorY > pr.y - 1) continue;
        s.sleep = false; s.still = 0; s.rest = 0; s.alpha = 1;
      }
      return true;
    }
    function propBox(pr) {   // world rect the blows test against
      if (TOP) return { x: pr.x + pr.x0, y: pr.y - pr.h * 0.55, w: pr.w, h: pr.h * 0.62 };
      return { x: pr.x + pr.x0, y: pr.y - pr.h, w: pr.w, h: pr.h };
    }
    function damageProp(pr, o, dmg) {
      if (!pr || !pr.alive) return false;
      if (pr.fixed) {   // unbreakable: a spark of dust where it was struck, never pieces
        var fx = num(o && o.x, pr.x), fy = num(o && o.y, pr.y - pr.h * 0.5);
        puff(fx, TOP ? pr.y : fy, TOP ? pr.h * 0.5 : 0, 3, 7 * scaleOf(), 'spark', 30 * scaleOf(), 16); S.hits++;
        safe(opt.onSound, null, 'clink', { id: pr.id, x: fx, y: fy }); return true;
      }
      S.hits++; pr.hp -= Math.max(0, dmg); pr.flash = 60;
      var has = dirNorm(o), sgn = has ? (VEC.vx >= 0 ? 1 : -1) : 1, K = kindDef(pr.kind);
      if (pr.hp <= 0) { breakProp(pr, o); return true; }
      S.cracks++; pr.cracks++; pr.wobV += sgn * 7;
      chips(K.mat, pr.x - sgn * pr.w * 0.3, TOP ? pr.y : pr.y - pr.h * 0.55, Math.max(1, Math.round(3 * P.amount * P.chips)), has ? VEC.vx : 0, has ? VEC.vy : 0, 160 * scaleOf(), 2 * scaleOf() + pr.h * 0.04, TOP ? pr.h * 0.55 : 0, pr.x, TOP ? pr.y : pr.y - pr.h * 0.5);
      puff(pr.x - sgn * pr.w * 0.3, TOP ? pr.y : pr.y - pr.h * 0.4, TOP ? pr.h * 0.4 : 0, 3, pr.h * 0.22, dustCol(K.mat), 30 * scaleOf(), 18);
      shake(1, 90); safe(opt.onHitstop, null, Math.round(P.hitstop * 0.5));
      safe(opt.onSound, null, 'crack', { id: pr.id, kind: pr.kind, mat: K.mat, x: pr.x, y: pr.y });
      return true;
    }
    function breakProp(pr, o) {
      if (typeof pr !== 'object') pr = PBY[String(pr)];
      if (!pr || !pr.alive || pr.fixed) return false;
      var K = kindDef(pr.kind);
      removeProp(pr.id); S.breaks++;
      spawnPieces(pr, o || {});
      puff(pr.x, TOP ? pr.y : pr.y - pr.h * 0.08, 0, 10, pr.h * 0.34, dustCol(K.mat), 80 * scaleOf(), 22);
      puff(pr.x, TOP ? pr.y - 2 : pr.y - pr.h * 0.45, TOP ? pr.h * 0.45 : 0, 5, pr.h * 0.26, dustCol(K.mat), 50 * scaleOf(), 34);
      shake(pr.kind === 'statue' ? 4 : pr.kind === 'barrel' ? 3 : 2, pr.kind === 'statue' ? 260 : 180);
      safe(opt.onHitstop, null, P.hitstop);
      safe(opt.onBreak, null, { id: pr.id, kind: pr.kind, x: pr.x, y: pr.y, h: pr.h, data: pr.data });
      safe(opt.onSound, null, 'break', { id: pr.id, kind: pr.kind, mat: K.mat, x: pr.x, y: pr.y });
      return true;
    }
    function rectHit(px, py, pw, ph, opts, isCircle, cr) {
      var n = 0, dmg = num(opts && opts.damage, 1), list = PROPS.slice();   // a break removes props while we walk
      for (var j = 0; j < list.length; j++) {
        var pr = list[j]; if (!pr.alive) continue;
        var b = propBox(pr), hitIt;
        if (isCircle) { var nx = clamp(px, b.x, b.x + b.w), ny = clamp(py, b.y, b.y + b.h); hitIt = (nx - px) * (nx - px) + (ny - py) * (ny - py) <= cr * cr; }
        else hitIt = px < b.x + b.w && b.x < px + pw && py < b.y + b.h && b.y < py + ph;
        if (!hitIt) continue;
        if (isCircle && opts && opts.arc != null) {
          var ang = Math.atan2((TOP ? pr.y - pr.h * 0.2 : pr.y - pr.h * 0.5) - py, pr.x - px), da = Math.abs(((ang - num(opts.arc, 0)) % TAU + TAU * 1.5) % TAU - Math.PI);
          if (da > num(opts.spread, 1.2) && Math.hypot(pr.x - px, pr.y - py) > pr.w * 0.6) continue;
        }
        var o2 = { dx: num(opts && opts.dx, pr.x - (isCircle ? px : px + pw / 2)), dy: num(opts && opts.dy, 0), force: opts && opts.force, x: isCircle ? px : px + pw / 2, y: isCircle ? py : py + ph / 2 };
        if (damageProp(pr, o2, dmg)) n++;
      }
      return n;
    }

    /* ---------- physics step ---------- */
    var EX = { x0: 0.5, x1: 0.5, y0: 0.5, y1: 0.5 };   // rotated extents of a piece around its centre (double fields: no garbage)
    function extent(s) {
      var Pp = s.poly, ca = Math.cos(s.a), sa = Math.sin(s.a), x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (var i = 0; i < Pp.length; i++) {
        var lx = (Pp[i][0] - s.pcx) * s.psc, ly = (Pp[i][1] - s.pcy) * s.psc, X = lx * ca - ly * sa, Y = lx * sa + ly * ca;
        if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
      }
      EX.x0 = x0; EX.x1 = x1; EX.y0 = y0; EX.y1 = y1;
    }
    function wrapA(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
    /* the turn that puts the piece's nearest edge flat on the floor (outward normal straight down) */
    function flatTurn(s) {
      var na = s.na, ns = s.ns, best = 9, j; if (!na) return 0;
      for (j = 0; j < na.length; j++) { if (ns && !ns[j]) continue; var dd = wrapA(Math.PI / 2 - (na[j] + s.a)); if (Math.abs(dd) < Math.abs(best)) best = dd; }
      return best === 9 ? 0 : best;
    }
    function stepBody(s) {
      if (s.sleep) { s.rest += STEP; return; }
      s.age += STEP;
      var ox = s.x, oy = s.y;
      var sc = scaleOf(), G = 1500 * sc * P.gravity, ca, sa, rx, ry, d, m;
      if (TOP) {
        s.vz -= G * DT * (s.flut ? 0.25 : 1);
        if (s.flut && s.z > 0) { s.vx += Math.cos(s.age / 160 + s.ph) * 60 * sc * DT; s.vz = Math.max(s.vz, -60 * sc); }
        s.z += s.vz * DT;
        if (s.z <= 0) {
          s.z = 0;
          if (s.vz < -60 * sc) { s.vz = -s.vz * s.bounce; s.w *= 0.6; s.wt *= 0.5; s.vx *= 0.8; s.vy *= 0.8; }
          else { s.vz = 0; s.ground = true; }
        } else s.ground = false;
        var dr = s.ground ? 0 : s.drag * DT; s.vx -= s.vx * dr; s.vy -= s.vy * dr;
        if (s.ground) {
          var sp = Math.hypot(s.vx, s.vy), fr = s.fric * 1400 * sc * DT;
          if (sp <= fr) { s.vx = 0; s.vy = 0; } else { s.vx -= s.vx / sp * fr; s.vy -= s.vy / sp * fr; }
          s.w *= 0.86; s.wt *= 0.8;
          var tt = Math.round(s.tum / Math.PI) * Math.PI; s.tum += (tt - s.tum) * 0.3;
        } else s.tum += s.wt * DT;
        var r = (s.hl + s.hs) * 0.5;
        if (s.vx) { d = s.vx * DT; CQ.x = s.x + (d > 0 ? r : -r); CQ.y = s.y; CQ.d = d; cast(true); m = CQ.t; s.x += m; if (HIT) { S.blocked++; s.vx = -s.vx * s.bounce; s.vy *= 0.85; s.w = -s.w * 0.7 + s.vy * 0.01; } }
        if (s.vy) { d = s.vy * DT; CQ.x = s.x; CQ.y = s.y + (d > 0 ? r * 0.5 : -r * 0.5); CQ.d = d; cast(false); m = CQ.t; s.y += m; if (HIT) { S.blocked++; s.vy = -s.vy * s.bounce; s.vx *= 0.85; s.w = -s.w * 0.7; } }
        s.a += s.w * DT;
        if (s.ground && Math.abs(s.vx) + Math.abs(s.vy) < 4 * sc && Math.abs(s.w) < 0.4) { if (++s.still > 8) { s.sleep = true; s.vx = s.vy = s.vz = s.w = 0; s.tum = Math.round(s.tum / Math.PI) * Math.PI; } }
        else s.still = 0;
      } else {
        s.vy += G * DT * (s.flut ? 0.18 : 1);
        if (s.flut && !s.ground) { s.vx += Math.cos(s.age / 150 + s.ph) * 90 * sc * DT; s.vy = Math.min(s.vy, 70 * sc); s.w = Math.cos(s.age / 150 + s.ph) * 3; }
        s.vx -= s.vx * s.drag * DT; s.vy -= s.vy * s.drag * 0.4 * DT;
        extent(s); ry = EX.y1;
        if (s.ground) {   // keep resting contact: the lowest corner of the rotated piece stays on the floor line
          if (solid(s.x, s.floorY + 1) || TILE > 0 && solid(s.x, s.floorY + TILE * 0.5)) { if (s.vy >= 0) { s.y = s.floorY - ry; s.vy = 0; } }
          else s.ground = false;
        }
        if (s.vx) { d = s.vx * DT; CQ.x = s.x + (d > 0 ? EX.x1 * 0.92 : EX.x0 * 0.92); CQ.y = s.y; CQ.d = d; cast(true); m = CQ.t; s.x += m; if (HIT) { S.blocked++; s.vx = -s.vx * s.bounce; s.w = -s.w * 0.6 - s.vy * 0.004 / Math.max(0.3, s.hl / (8 * sc)); } }
        if (s.vy) {
          d = s.vy * DT; CQ.x = s.x; CQ.y = s.y + (d > 0 ? EX.y1 : EX.y0); CQ.d = d; cast(false); m = CQ.t; s.y += m;
          if (HIT) {
            S.blocked++;
            if (d > 0) {
              s.floorY = s.y + ry;
              for (var up = 0; up < 24 && solid(s.x, s.floorY - 0.5); up++) s.floorY -= 1;   // started touching: climb to the free surface
              if (s.y > s.floorY - ry) s.y = s.floorY - ry;
              var vin = s.vy;
              s.vy = vin > 90 * sc ? -vin * s.bounce : 0; s.ground = s.vy === 0;
              s.vx *= 1 - Math.min(0.6, s.fric * 0.45);
              s.w = s.w * 0.45 + s.vx * 0.012 / Math.max(0.3, s.hl / (8 * sc)) * (rng() < 0.5 ? 1 : -1) * 0.5 + s.vx * 0.01 / Math.max(0.3, ry / (4 * sc));
            } else { s.vy = -s.vy * s.bounce; }
          }
        }
        if (s.ground) {
          var onProp = propTop(s.x, s.floorY);
          if (onProp) { s.vx += (s.x < onProp.x ? -1 : 1) * 1400 * sc * DT; s.still = 0; }   // prop tops are not shelves: pieces slide off
          else { var f2 = s.fric * 1500 * sc * DT; if (Math.abs(s.vx) <= f2) s.vx = 0; else s.vx -= (s.vx > 0 ? f2 : -f2); }
          // settle onto the nearest stable edge: torque toward the turn that lays that edge flat (never rests on a corner)
          var diff = flatTurn(s);
          s.w += clamp(diff, -1.2, 1.2) * 90 * DT; s.w *= 0.8;
          if (!onProp && Math.abs(s.vx) < 3 * sc && Math.abs(diff) < 0.03 && Math.abs(s.w) < 0.3) { if (++s.still > 8) { s.sleep = true; s.vx = s.vy = s.w = 0; s.a += diff; extent(s); s.y = s.floorY - EX.y1; } }
          else s.still = 0;
        } else s.still = 0;
        s.a += s.w * DT;
      }
      if (solid(s.x, s.y) && !solid(ox, oy)) { s.x = ox; s.y = oy; s.vx = -s.vx * s.bounce; s.vy = -s.vy * s.bounce; S.blocked++; }   // last guard: never end a step inside a wall
      var b = bounds();
      if (b && (s.x < b.x - 64 || s.x > b.x + b.w + 64 || s.y > b.y + b.h + 64 || s.y < b.y - b.h)) { free(s); S.fell++; }
    }
    function stepDust(d) {
      d.t += STEP; if (d.t >= d.life) { d.on = false; var j = DLIVE.indexOf(d); if (j >= 0) { DLIVE[j] = DLIVE[DLIVE.length - 1]; DLIVE.pop(); } return; }
      var k = Math.exp(-3.2 * DT); d.vx *= k; d.vy *= k; d.vz *= k;
      d.x += d.vx * DT; d.y += d.vy * DT; d.z += d.vz * DT;
      if (!TOP) d.vy -= 10 * scaleOf() * DT;
    }
    function keepOut() {   // pieces lying where a character stands slide out of its foot rect (opt.keepOut: () => world rects)
      var R = safe(opt.keepOut, null), k, j, sc = scaleOf();
      if (!R || !R.length) return;
      for (j = 0; j < LIVE.length; j++) {
        var s = LIVE[j]; if (!s.ground) continue;
        var fy = TOP ? s.y : s.floorY + s.dep;
        for (k = 0; k < R.length; k++) {
          var r = R[k]; if (!r || s.x < r.x || s.x > r.x + r.w || fy < r.y || fy > r.y + r.h + 4) continue;
          // kicked aside by the feet: a small hop away from the rect's centre, a little spin
          var dir = s.x < r.x + r.w / 2 ? -1 : 1;
          s.sleep = false; s.still = 0; s.rest = 0; s.alpha = 1; s.ground = TOP ? s.ground : false;
          s.vx = dir * (150 + rng() * 90) * sc; s.w += (rng() - 0.5) * 8;
          if (TOP) { s.vz = (70 + rng() * 50) * sc; s.vy += (rng() - 0.5) * 60 * sc; } else s.vy = -(110 + rng() * 60) * sc;
          S.kicks++; break;
        }
      }
    }
    function tick() {
      S.time += STEP; S.updates++;
      for (var j = 0; j < PROPS.length; j++) {
        var pr = PROPS[j];
        if (pr.flash > 0) pr.flash = Math.max(0, pr.flash - STEP);
        pr.wobV += (-pr.wob * 260 - pr.wobV * 9) * DT; pr.wob += pr.wobV * DT;
      }
      for (j = LIVE.length - 1; j >= 0; j--) {
        var s = LIVE[j]; stepBody(s);
        if (s.on && s.sleep && P.rest >= 0 && s.rest > P.rest) { s.alpha = 1 - (s.rest - P.rest) / Math.max(1, P.fade); if (s.alpha <= 0) free(s); }
      }
      for (j = DLIVE.length - 1; j >= 0; j--) stepDust(DLIVE[j]);
      if (typeof opt.keepOut === 'function') keepOut();   // every step: feet push pieces aside as they pass
      for (j = 0; j < SPRING_CAP; j++) if (SPR[j].key !== null) { SPR[j].t += STEP; if (SPR[j].t > 600) SPR[j].key = null; }
      if (S.shakeA > 0) { S.shakeT += STEP; if (S.shakeT >= S.shakeMs) S.shakeA = 0; }
    }
    function update(dtMs) {
      try {
        dtMs = num(dtMs, 0);
        if (!(dtMs > 0)) { S.frozen++; return; }
        S.acc += Math.min(dtMs, 250);
        var n = 0; while (S.acc >= STEP - 1e-6 && n < 16) { tick(); S.acc -= STEP; n++; }
        if (n === 16) S.acc = 0;
      } catch (e) { S.updErrors++; }
    }

    /* ---------- drawing ---------- */
    var DS = 1, DSW = -1, DSN = 0, PIX = false;
    function devScale(ctx) {
      if (!ctx.getTransform) return 1;
      if (ctx.canvas && (ctx.canvas.width !== DSW || ++DSN > 120)) { DSN = 0; DSW = ctx.canvas ? ctx.canvas.width : 0; var T = ctx.getTransform(); DS = Math.max(0.25, Math.sqrt(Math.abs(T.a * T.d - T.b * T.c)) || 1); }
      return DS;
    }
    function q(v) { return Math.max(1, Math.round(v * 4) / 4); }
    function propSprite(kind, tint, H, ds, crack, cseed) {
      crack = crack ? Math.min(3, crack) : 0;
      var key = kind + tint + '_' + Math.round(H * ds) + (crack ? 'c' + crack + '_' + cseed : ''), c = C.prop[key];
      if (c !== undefined) return c;
      var K = kindDef(kind), wm = 0.5, i; for (i = 0; i < K.hull.length; i++) wm = Math.max(wm, Math.abs(K.hull[i][0]));
      var px = Math.round(H * ds), pad = Math.ceil(px * 0.08) + 2, cv = mk(Math.ceil(px * wm * 2) + pad * 2, px + pad * 2);
      if (!cv) { C.prop[key] = null; return null; }
      var g = cv.getContext('2d'); g.translate(cv.width / 2, px + pad);
      try {
        if (K.custom) { g.save(); K.art(g, px); g.restore(); g.scale(px, px); }
        else { g.scale(px, px); ART[kind](g, TINTS[kind][tint], mulberry(strHash(kind) ^ tint)); }
        if (crack) crackArt(g, kind, crack, cseed);
      } catch (e) { S.drawErrors++; }
      c = { cv: cv, ox: cv.width / 2, oy: px + pad, s: px / H };
      C.prop[key] = c; return c;
    }
    function whiteOf(spr, key) {
      var w = C.white[key]; if (w !== undefined) return w;
      var cv = mk(spr.cv.width, spr.cv.height); if (!cv) { C.white[key] = null; return null; }
      var g = cv.getContext('2d'); g.drawImage(spr.cv, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      C.white[key] = { cv: cv, ox: spr.ox, oy: spr.oy, s: spr.s }; return C.white[key];
    }
    function pieceSprite(s, ds) {
      var col = P.art === 'color', H = s.propH, key = s.kind + s.ptint + '_' + s.v + '_' + s.pi + '_' + Math.round(H * ds) + (col ? 'c' : '') + (TOP ? 't' : ''), c = C.piece[key];
      if (c !== undefined) return c;
      var base = col ? { s: Math.round(H * ds) / H } : propSprite(s.kind, s.ptint, H, ds); if (!base) { C.piece[key] = null; return null; }
      var pc = s.piece, Pp = pc.poly, px = base.s * H, mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9, j;
      for (j = 0; j < Pp.length; j++) { mnx = Math.min(mnx, Pp[j][0]); mny = Math.min(mny, Pp[j][1]); mxx = Math.max(mxx, Pp[j][0]); mxy = Math.max(mxy, Pp[j][1]); }
      var pad = 3, w = Math.ceil((mxx - mnx) * px) + pad * 2, h = Math.ceil((mxy - mny) * px) + pad * 2, cv = mk(w, h);
      if (!cv) { C.piece[key] = null; return null; }
      var g = cv.getContext('2d'), ox = pad - mnx * px, oy = pad - mny * px;   // canvas px of the prop origin
      g.save(); g.beginPath(); for (j = 0; j < Pp.length; j++) g[j ? 'lineTo' : 'moveTo'](ox + Pp[j][0] * px, oy + Pp[j][1] * px); g.closePath(); g.clip();
      var M = MATS[kindDef(s.kind).mat], lw = Math.max(0.8, px * 0.016);
      if (col) {   // fallback colour mode: the material's colours instead of the prop's image
        g.fillStyle = lin(g, ox + mnx * px, oy + mny * px, ox + mxx * px, oy + mxy * px, [0, M.c[0], 0.5, M.c[1], 1, M.c[2]]); g.fillRect(0, 0, w, h);
      } else { for (var rep = 0; rep < 3; rep++) g.drawImage(base.cv, ox - base.ox, oy - base.oy); }   // stacked: soft art pixels become solid inside the piece
      g.restore();
      // thickness on the cut sides only (the art keeps its own outline elsewhere): a soft inner shade, a thin fresh rim, a dark edge
      g.globalCompositeOperation = 'source-atop'; g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = rgba(M.c[3], 0.35); g.lineWidth = lw * 6; g.beginPath();
      for (j = 0; j < Pp.length; j++) if (pc.cut[j] || col) { var a0 = Pp[j], b0 = Pp[(j + 1) % Pp.length]; g.moveTo(ox + a0[0] * px, oy + a0[1] * px); g.lineTo(ox + b0[0] * px, oy + b0[1] * px); }
      g.stroke();
      for (var pass = 0; pass < 2; pass++) {
        if (!pass) continue; g.strokeStyle = rgba(M.line, 0.7); g.lineWidth = lw * 1.1; g.beginPath();
        for (j = 0; j < Pp.length; j++) if (pc.cut[j] || col) { var a = Pp[j], b = Pp[(j + 1) % Pp.length]; g.moveTo(ox + a[0] * px, oy + a[1] * px); g.lineTo(ox + b[0] * px, oy + b[1] * px); }
        g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
      c = { cv: cv, ox: ox + pc.c[0] * px, oy: oy + pc.c[1] * px, s: base.s };
      C.piece[key] = c; return c;
    }
    function shardSprite(mat, v, ds) {
      var R = Math.max(6, Math.round(12 * ds)), key = mat + v + '_' + R, c = C.shard[key];
      if (c !== undefined) return c;
      var shp = shardShape(mat, v), cv = mk(R * 2 + 6, R * 2 + 6); if (!cv) { C.shard[key] = null; return null; }
      var g = cv.getContext('2d'); g.translate(R + 3, R + 3); g.scale(R, R);
      try { drawShard(g, mat, shp); } catch (e) { S.drawErrors++; }
      c = { cv: cv, ox: R + 3, oy: R + 3, s: R }; C.shard[key] = c; return c;
    }
    function puffSprite(col, ds) {
      var R = Math.max(8, Math.round(24 * ds)), key = col + R, c = C.puff[key];
      if (c !== undefined) return c;
      var cv = mk(R * 2 + 2, R * 2 + 2); if (!cv) { C.puff[key] = null; return null; }
      var g = cv.getContext('2d'), D = DUSTS[col] || [mixHex(col, '#ffffff', 0.28), mixHex(col, '#000000', 0.22)], cx = R + 1, Rn = mulberry(strHash(col));
      // a soft cluster of blobs: irregular edge, lit top, shaded bottom, never a bright disc
      for (var b = 0; b < 7; b++) {
        var a = b / 7 * TAU + Rn() * 0.6, d = b ? R * (0.25 + Rn() * 0.2) : 0, r = R * (b ? 0.42 + Rn() * 0.18 : 0.55), bx = cx + Math.cos(a) * d, by = cx + Math.sin(a) * d * 0.8;
        var rg = g.createRadialGradient(bx - r * 0.2, by - r * 0.3, r * 0.1, bx, by, r);
        rg.addColorStop(0, rgba(D[0], 0.5)); rg.addColorStop(0.6, rgba(mixHex(D[0], D[1], 0.5), 0.32)); rg.addColorStop(1, rgba(D[1], 0));
        g.fillStyle = rg; g.beginPath(); g.arc(bx, by, r, 0, TAU); g.fill();
      }
      var sh = g.createLinearGradient(0, cx - R, 0, cx + R); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, rgba(D[1], 0.5));
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = sh; g.fillRect(0, 0, cv.width, cv.height);
      c = { cv: cv, r: R }; C.puff[key] = c; return c;
    }
    function shadowSprite(ds) {
      if (C.shadow && C.shadow.ds === ds) return C.shadow;
      var R = Math.max(6, Math.round(16 * ds)), cv = mk(R * 2, R * 2); if (!cv) return null;
      var g = cv.getContext('2d'), rg = g.createRadialGradient(R, R, 0, R, R, R);
      rg.addColorStop(0, 'rgba(12,8,20,0.5)'); rg.addColorStop(0.6, 'rgba(12,8,20,0.26)'); rg.addColorStop(1, 'rgba(12,8,20,0)');
      g.fillStyle = rg; g.fillRect(0, 0, R * 2, R * 2);
      C.shadow = { cv: cv, r: R, ds: ds }; return C.shadow;
    }
    function pixelMode(ctx) { return P.render === 'pixel' || (P.render === 'auto' && ctx.imageSmoothingEnabled === false); }

    function drawPropInner(ctx, pr, cx, cy) {
      var ds = devScale(ctx), x = pr.x - cx, y = pr.y - cy;
      if (pr.sprDS !== ds || pr.sprCr !== pr.cracks) { pr.spr = propSprite(pr.kind, pr.tint, pr.h, ds, pr.cracks, pr.variant); pr.wh = null; pr.sprDS = ds; pr.sprCr = pr.cracks; }
      var spr = pr.spr;
      var sh = shadowSprite(ds);
      if (sh) { ctx.globalAlpha = 0.85; ctx.drawImage(sh.cv, x - pr.w * 0.62, y - pr.h * 0.1, pr.w * 1.24, pr.h * 0.2); ctx.globalAlpha = 1; }
      if (!spr) return;
      ctx.save(); ctx.translate(PIX ? Math.round(x) : x, PIX ? Math.round(y) : y);
      if (pr.wob) ctx.rotate(clamp(pr.wob, -0.25, 0.25) * 0.12);
      var h = spr.cv.height / spr.s;
      ctx.drawImage(spr.cv, -spr.ox / spr.s, -spr.oy / spr.s, spr.cv.width / spr.s, h);
      if (pr.flash > 0) { if (!pr.wh) pr.wh = whiteOf(spr, pr.kind + pr.tint + '_' + Math.round(pr.h * ds) + '_' + Math.min(3, pr.cracks) + '_' + pr.variant); var wh = pr.wh; if (wh) { ctx.globalAlpha = Math.min(1, pr.flash / 60) * 0.45; ctx.drawImage(wh.cv, -wh.ox / wh.s, -wh.oy / wh.s, wh.cv.width / wh.s, h); ctx.globalAlpha = 1; } }
      ctx.restore();
    }
    function drawProps(ctx, camX, camY) {
      try {
        if (!ctx || typeof ctx.drawImage !== 'function') { S.badInput++; return; }
        PIX = pixelMode(ctx); var cx = num(camX, 0), cy = num(camY, 0);
        for (var j = 0; j < PROPS.length; j++) if (!PROPS[j].hidden) drawPropInner(ctx, PROPS[j], cx, cy);
      } catch (e) { S.drawErrors++; try { ctx.restore(); } catch (e2) { } }
    }
    function drawProp(ctx, id, camX, camY) {
      try { var pr = typeof id === 'object' ? id : PBY[String(id)]; if (pr && pr.alive && ctx) { PIX = pixelMode(ctx); drawPropInner(ctx, pr, num(camX, 0), num(camY, 0)); } }
      catch (e) { S.drawErrors++; try { ctx.restore(); } catch (e2) { } }
    }
    function drawBody(ctx, s, cx, cy, ds) {
      var spr, w, h, sc;
      if (s.sprDS !== ds) { S.lookups++; s.spr = s.piece ? pieceSprite(s, ds) : shardSprite(s.mat, s.v, ds); s.sprDS = ds; }   // cached on the piece: no key strings per frame
      spr = s.spr; if (!spr) return;
      sc = s.piece ? 1 / spr.s : s.size / spr.s;
      var x = s.x - cx, y = (TOP ? s.y - s.z : s.y + s.dep) - cy, a = s.a;
      if (PIX) { x = Math.round(x); y = Math.round(y); a = Math.round(a / (Math.PI / 8)) * (Math.PI / 8); }
      w = spr.cv.width * sc; h = spr.cv.height * sc;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      if (TOP && s.tum) { var ty = Math.cos(s.tum); ctx.scale(1, Math.abs(ty) < 0.6 ? (ty < 0 ? -0.6 : 0.6) : ty); }
      ctx.globalAlpha = s.alpha;
      ctx.drawImage(spr.cv, -spr.ox * sc, -spr.oy * sc, w, h);
      ctx.restore();
    }
    function drawShadows(ctx, cx, cy, ds) {
      var sh = shadowSprite(ds); if (!sh) return;
      for (var j = 0; j < LIVE.length; j++) {
        var s = LIVE[j]; if (s.z <= 0.5 && s.ground) continue;
        var r = (s.hl + s.hs) * 0.7 * (1 / (1 + s.z / (30 * scaleOf()))), a = s.alpha * clamp(1 - s.z / (160 * scaleOf()), 0.25, 1);
        ctx.globalAlpha = a; ctx.drawImage(sh.cv, s.x - cx - r, s.y - cy - r * 0.45, r * 2, r * 0.9);
      }
      ctx.globalAlpha = 1;
    }
    function drawContacts(ctx, cx, cy, ds) {   // side view: a soft contact shadow under every piece lying on the floor
      var sh = shadowSprite(ds); if (!sh) return;
      for (var j = 0; j < LIVE.length; j++) {
        var s = LIVE[j]; if (!s.ground) continue;
        var r = Math.max(s.hl, 2 * scaleOf()) * 1.15;
        ctx.globalAlpha = 0.75 * s.alpha; ctx.drawImage(sh.cv, s.x - cx - r, s.floorY + s.dep - cy - r * 0.18, r * 2, r * 0.36);
      }
      ctx.globalAlpha = 1;
    }
    function drawDust(ctx, cx, cy, ds, low) {
      for (var j = 0; j < DLIVE.length; j++) {
        var d = DLIVE[j], k = d.t / d.life; if (low !== null && (k < 0.5) === low) continue;
        if (d.sprDS !== ds || !d.spr) { S.lookups++; d.spr = puffSprite(d.col, ds); d.sprDS = ds; }
        var sp = d.spr; if (!sp) continue;
        var r = d.r0 + (d.r1 - d.r0) * (1 - (1 - k) * (1 - k)), a = (k < 0.1 ? k / 0.1 : 1) * (1 - k) * 0.85;
        var x = d.x - cx, y = (TOP ? d.y - d.z : d.y) - cy;
        ctx.globalAlpha = a; ctx.drawImage(sp.cv, x - r, y - r * 0.9, r * 2, r * 1.8);
      }
      ctx.globalAlpha = 1;
    }
    function drawGround(ctx, camX, camY) {   // shadows and pieces lying on the ground - call before your sprites (both views)
      try {
        if (!ctx || typeof ctx.drawImage !== 'function') { S.badInput++; return; }
        var cx = num(camX, 0), cy = num(camY, 0), ds = devScale(ctx); PIX = pixelMode(ctx);
        ctx.save(); ctx.imageSmoothingEnabled = !PIX;
        if (TOP) drawShadows(ctx, cx, cy, ds); else drawContacts(ctx, cx, cy, ds);
        for (var j = 0; j < LIVE.length; j++) { var s = LIVE[j]; if (s.ground && s.z <= 0.5) drawBody(ctx, s, cx, cy, ds); }
        ctx.restore(); S.groundDone = true;
      } catch (e) { S.drawErrors++; try { ctx.restore(); } catch (e2) { } }
    }
    function draw(ctx, camX, camY) {
      try {
        if (!ctx || typeof ctx.drawImage !== 'function') { S.badInput++; return; }
        S.draws++;
        var cx = num(camX, 0), cy = num(camY, 0), ds = devScale(ctx), g = S.groundDone; S.groundDone = false; PIX = pixelMode(ctx);
        ctx.save(); ctx.imageSmoothingEnabled = !PIX;
        if (TOP && !g) drawShadows(ctx, cx, cy, ds); else if (!TOP && !g) drawContacts(ctx, cx, cy, ds);
        drawDust(ctx, cx, cy, ds, true);
        for (var j = 0; j < LIVE.length; j++) { var s = LIVE[j]; if (g && s.ground && s.z <= 0.5) continue; drawBody(ctx, s, cx, cy, ds); }
        drawDust(ctx, cx, cy, ds, false);
        ctx.restore();
      } catch (e) { S.drawErrors++; try { ctx.restore(); } catch (e2) { } }
    }

    /* ---------- public ---------- */
    var inst = {
      version: VERSION,
      addProp: addProp, removeProp: removeProp,
      props: function () { return PROPS; },
      prop: function (id) { return PBY[String(id)] || null; },
      clearProps: function () { while (PROPS.length) removeProp(PROPS[0].id); },
      hit: function (x, y, r, o) { try { x = num(x, NaN); y = num(y, NaN); if (isNaN(x) || isNaN(y)) { S.badInput++; return 0; } return rectHit(x, y, 0, 0, o || {}, true, Math.max(0, num(r, 24 * scaleOf()))); } catch (e) { S.updErrors++; return 0; } },
      hitRect: function (x, y, w, h, o) { try { if (isNaN(+x) || isNaN(+y)) { S.badInput++; return 0; } return rectHit(+x, +y, num(w, 0), num(h, 0), o || {}, false, 0); } catch (e) { S.updErrors++; return 0; } },
      breakProp: function (id, o) { try { return breakProp(typeof id === 'object' ? id : PBY[String(id)], o); } catch (e) { S.updErrors++; return false; } },
      touch: function (x, y, r, speed, o) {   // a body moving at `speed` px/s through props: fast enough -> it breaks them
        try { if (!(num(speed, 0) >= P.breakSpeed * scaleOf())) return 0; return rectHit(num(x, 0), num(y, 0), 0, 0, o || {}, true, Math.max(1, num(r, 10))); } catch (e) { S.updErrors++; return 0; }
      },
      shatter: function (mat, x, y, o) {
        try {
          o = o || {}; x = num(x, NaN); y = num(y, NaN); if (isNaN(x) || isNaN(y)) { S.badInput++; return 0; }
          if (!MATS[mat]) mat = 'rock';
          var sc = scaleOf(), n = Math.max(1, Math.round(num(o.count, 10) * P.amount)), has = dirNorm(o), before = S.spawned;
          chips(mat, x, y, n, has ? VEC.vx : 0, has ? VEC.vy : 0, num(o.force, 260) * sc, num(o.size, 5) * sc, TOP ? num(o.z, 12 * sc) : 0, num(o.ox, x), num(o.oy, y));
          if (o.dust !== false) puff(x, y, TOP ? 0 : 0, 6, num(o.size, 5) * sc * 3.4, o.dustColor || dustCol(mat), 50 * sc, 24);
          if (o.shake) shake(num(o.shake, 0), 160);
          S.shatters++; safe(opt.onSound, null, 'shatter', { mat: mat, x: x, y: y });
          return S.spawned - before;
        } catch (e) { S.updErrors++; return 0; }
      },
      dust: function (x, y, o) { try { o = o || {}; var sc = scaleOf(); puff(num(x, 0), num(y, 0), num(o.z, 0), num(o.count, 6), num(o.size, 14) * sc, o.color || dustCol('rock'), num(o.spread, 50) * sc, num(o.up, 24)); } catch (e) { S.updErrors++; } },
      wallHit: function (key, x, y, nx, ny, speed, o) {
        try {
          o = o || {}; var sc = scaleOf(); speed = Math.abs(num(speed, 0)); nx = num(nx, 0); ny = num(ny, 0);
          var L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
          var vx = num(o.vx, -nx * speed), vy = num(o.vy, -ny * speed), vn = vx * nx + vy * ny, e = clamp(num(o.bounce, 0.55), 0, 1);
          if (vn < 0) { vx -= (1 + e) * vn * nx; vy -= (1 + e) * vn * ny; }
          VEC.vx = vx; VEC.vy = vy;
          if (isNaN(+x) || isNaN(+y)) { S.badInput++; return VEC; }
          S.wallHits++;
          var hard = clamp(speed / (300 * sc), 0.2, 2), mat = MATS[o.material] ? o.material : 'rock';
          PN.x = nx; PN.y = ny;
          puff(+x, +y, TOP ? num(o.z, 10 * sc) : 0, 3 + Math.round(3 * hard), (8 + 6 * hard) * sc, o.dustColor || dustCol(mat), 40 * sc, 20);
          chips(mat, +x + nx * 2 * sc, +y + ny * 2 * sc, Math.round((1 + 3 * hard) * P.chips * P.amount), nx, ny, (90 + 120 * hard) * sc, 3 * sc, TOP ? num(o.z, 14 * sc) : 0, +x + nx * 6 * sc, +y + ny * 6 * sc);
          if (hard > 0.6) shake(1 + hard, 120);
          if (key != null) {
            var sl = null, j;
            for (j = 0; j < SPRING_CAP; j++) if (SPR[j].key === String(key)) { sl = SPR[j]; break; }
            if (!sl) for (j = 0; j < SPRING_CAP; j++) if (SPR[j].key === null) { sl = SPR[j]; break; }
            if (!sl) { sl = SPR[0]; for (j = 1; j < SPRING_CAP; j++) if (SPR[j].t > sl.t) sl = SPR[j]; }
            sl.key = String(key); sl.t = 0; sl.amp = num(o.amp, Math.min(12, 4 + 5 * hard)) * sc; sl.nx = nx; sl.ny = ny;
          }
          safe(opt.onSound, null, 'thud', { key: key, x: +x, y: +y, speed: speed });
          return VEC;
        } catch (er) { S.updErrors++; return VEC; }
      },
      offset: function (key) {   // visual bounce of a body after wallHit: add to its DRAW position only
        for (var j = 0; j < SPRING_CAP; j++) {
          var sl = SPR[j]; if (sl.key === null || sl.key !== String(key)) continue;
          var t = sl.t, d = sl.amp * Math.sin(Math.min(1, t / 220) * Math.PI) * Math.exp(-t / 260), sq = 0.42 * Math.exp(-t / 120) * Math.min(1, sl.amp / (5 * scaleOf()));
          sl.out.x = sl.nx * d; sl.out.y = sl.ny * d; sl.out.sx = 1 - sq * Math.abs(sl.nx) + sq * 0.5 * Math.abs(sl.ny); sl.out.sy = 1 - sq * Math.abs(sl.ny) + sq * 0.5 * Math.abs(sl.nx);
          return sl.out;
        }
        return ZERO;
      },
      shake: function () {
        if (!(S.shakeA > 0)) { SHAKE.x = 0; SHAKE.y = 0; return SHAKE; }
        var k = 1 - S.shakeT / S.shakeMs, a = S.shakeA * k * k, t = S.time;
        SHAKE.x = Math.sin(t * 0.091 + 1.3) * a * 0.8 + Math.sin(t * 0.217) * a * 0.3; SHAKE.y = Math.cos(t * 0.077) * a * 0.6 + Math.sin(t * 0.183 + 0.4) * a * 0.3;
        return SHAKE;
      },
      update: update, draw: draw, drawGround: drawGround, drawProps: drawProps, drawProp: drawProp,
      clear: function (o) {
        while (LIVE.length) free(LIVE[LIVE.length - 1]);
        for (var j = 0; j < DUST_CAP; j++) DUST[j].on = false; DLIVE.length = 0;
        for (j = 0; j < SPRING_CAP; j++) SPR[j].key = null;
        S.shakeA = 0; S.acc = 0;
        if (o && o.props) inst.clearProps();
      },
      setParams: function (o) { setParams(o); },
      params: function () { var o = {}; for (var k2 in P) o[k2] = P[k2]; return o; },
      audit: function () {   // live pieces whose centre is inside a solid spot (must stay 0)
        var n = 0; for (var j = 0; j < LIVE.length; j++) if (wallAt(LIVE[j].x, LIVE[j].y)) n++; return n;
      },
      stats: function () {
        var sl = 0, j; for (j = 0; j < LIVE.length; j++) if (LIVE[j].sleep) sl++;
        return { pieces: LIVE.length, sleeping: sl, dust: DLIVE.length, props: PROPS.length, peak: S.peak, spawned: S.spawned, recycled: S.recycled, freed: S.freed,
          fell: S.fell, breaks: S.breaks, hits: S.hits, cracks: S.cracks, shatters: S.shatters, wallHits: S.wallHits, blocked: S.blocked, updates: S.updates,
          frozen: S.frozen, draws: S.draws, spriteLookups: S.lookups, kicks: S.kicks, time: Math.round(S.time), cap: CAP, cbErrors: S.cbErrors, drawErrors: S.drawErrors, updErrors: S.updErrors, badInput: S.badInput, view: TOP ? 'top' : 'side' };
      },
      list: function () {
        var out = []; for (var j = 0; j < LIVE.length; j++) { var s = LIVE[j]; out.push({ x: s.x, y: s.y, z: s.z, a: s.a, vx: s.vx, vy: s.vy, mat: s.mat, kind: s.kind, sleep: s.sleep, alpha: s.alpha, r: s.hl, seq: s.seq }); }
        return out;
      },
      hash: function () {
        var h = 2166136261, j, add = function (v) { h ^= Math.round(v * 100) | 0; h = Math.imul(h, 16777619); };
        var L = LIVE.slice().sort(function (a, b) { return a.seq - b.seq; });
        for (j = 0; j < L.length; j++) { add(L[j].x); add(L[j].y); add(L[j].z); add(L[j].a); add(L[j].alpha); }
        for (j = 0; j < PROPS.length; j++) { add(PROPS[j].hp); add(PROPS[j].wob); }
        add(LIVE.length); add(DLIVE.length);
        return (h >>> 0).toString(16);
      },
      _pool: function () { return POOL; }, _live: function () { return LIVE; }, _dustPool: function () { return DUST; }, _dustLive: function () { return DLIVE; }
    };
    return inst;
  }

  root.GameDNA_Debris = {
    version: VERSION, create: create,
    kinds: Object.keys(KINDS), materials: Object.keys(MATS), dusts: Object.keys(DUSTS), defaults: DEF,
    _canvasFactory: function (f) { CANVAS = typeof f === 'function' ? f : null; },
    _fracture: fracture
  };
})(typeof window !== 'undefined' ? window : this);
