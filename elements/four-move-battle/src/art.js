/* ART: original procedural pixel art for the four-move battle starter and demo. One global, ART.
   Creatures are built from shaded volumes (ellipsoids, tapered capsules) rasterised at native size, quantised to
   5-step ramps lit from the upper left with ordered dithering, inner contour lines where one volume passes in front
   of another, and a selective dark outline. The back view is the same model mirrored and seen from behind (z flipped,
   no face), drawn 1.25x larger. Backdrops: a hill-top meadow ring at day, sunset or dusk. Neutral fantasy, all original. */
var ART = (function () {
  'use strict';
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mkc(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  function h2r(hx) { var n = parseInt(hx.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function cl8(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
  function r2h(c) { return '#' + ((1 << 24) | (cl8(c[0]) << 16) | (cl8(c[1]) << 8) | cl8(c[2])).toString(16).slice(1); }
  function mixh(a, b, f) { var A = h2r(a), B = h2r(b); return r2h([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]); }
  function toHsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, hh = 0, s = 0;
    if (mx !== mn) { var d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh /= 6; }
    return [hh, s, l];
  }
  function fromHsl(hh, s, l) {
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    if (!s) return [l * 255, l * 255, l * 255];
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, hh + 1 / 3) * 255, f(p, q, hh) * 255, f(p, q, hh - 1 / 3) * 255];
  }
  // 5-step ramp: deep, shadow, base, light, highlight; shadows drift to violet, lights to warm yellow
  var RC = {};
  function ramp(hx) {
    if (RC[hx]) return RC[hx];
    var c = toHsl(h2r(hx)), out = [];
    [[-0.30, 0.06, 0.24, 0.72], [-0.15, 0.04, 0.12, 0.72], [0, 0, 0, 0], [0.12, -0.04, 0.10, 0.13], [0.24, -0.12, 0.18, 0.14]].forEach(function (sp) {
      var dh = ((sp[3] - c[0] + 1.5) % 1) - 0.5, hh = (c[0] + dh * sp[2] + 1) % 1;
      out.push(r2h(fromHsl(hh, clamp(c[1] + sp[1], 0, 1), clamp(c[2] + sp[0], 0.05, 0.96))));
    });
    return (RC[hx] = out);
  }
  var BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function bay(x, y) { return (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }
  function h1(i, s) { var x = Math.imul((i | 0) ^ Math.imul(s | 0, 0x9e3779b1), 0x85ebca6b) >>> 0; x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35) >>> 0; x ^= x >>> 16; return (x >>> 0) / 4294967296; }
  function h2(x, y, s) { return h1(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663), s); }
  function vn(x, s) { var i = Math.floor(x), f = x - i; f = f * f * (3 - 2 * f); return h1(i, s) + (h1(i + 1, s) - h1(i, s)) * f; }

  /* ---------------- the volume rasteriser ---------------- */
  var LX = -0.5, LY = -0.62, LZ = 0.6, LN = Math.sqrt(LX * LX + LY * LY + LZ * LZ); LX /= LN; LY /= LN; LZ /= LN;
  var OUTK = '#1c1226';
  function rasterize(sp, view) {
    var back = view === 'back', s = back ? 1.25 : 1, W = Math.round(sp.w * s), H = Math.round(sp.h * s), prims = [];
    var P = {
      e: function (x, y, rx, ry, mat, z, o) { prims.push({ t: 'e', x: x, y: y, rx: rx, ry: ry, z: z || 0, mat: mat, o: o || {} }); },
      c: function (x0, y0, r0, x1, y1, r1, mat, z0, z1, o) { prims.push({ t: 'c', x0: x0, y0: y0, r0: r0, x1: x1, y1: y1, r1: r1, z0: z0 || 0, z1: z1 == null ? z0 || 0 : z1, mat: mat, o: o || {} }); }
    };
    sp.build(P, view);
    prims = prims.filter(function (p) { return !(p.o.front && back) && !(p.o.back && !back); });
    var N = W * H, id = new Int16Array(N).fill(-1), dep = new Float32Array(N).fill(-1e9), lit = new Float32Array(N);
    prims.forEach(function (p, pi) {
      var bx0, by0, bx1, by1;
      if (p.t === 'e') { bx0 = p.x - p.rx; bx1 = p.x + p.rx; by0 = p.y - p.ry; by1 = p.y + p.ry; }
      else { var rm = Math.max(p.r0, p.r1); bx0 = Math.min(p.x0, p.x1) - rm; bx1 = Math.max(p.x0, p.x1) + rm; by0 = Math.min(p.y0, p.y1) - rm; by1 = Math.max(p.y0, p.y1) + rm; }
      var X0 = back ? sp.w - bx1 : bx0, X1 = back ? sp.w - bx0 : bx1;
      for (var py = Math.max(0, Math.floor(by0 * s) - 1); py <= Math.min(H - 1, Math.ceil(by1 * s) + 1); py++) {
        for (var px = Math.max(0, Math.floor(X0 * s) - 1); px <= Math.min(W - 1, Math.ceil(X1 * s) + 1); px++) {
          var mx = (px + 0.5) / s, my = (py + 0.5) / s; if (back) mx = sp.w - mx;
          var nx, ny, nz, d, rr;
          if (p.t === 'e') {
            var u = (mx - p.x) / p.rx, v = (my - p.y) / p.ry, q = u * u + v * v; if (q > 1) continue;
            nz = Math.sqrt(1 - q); nx = u; ny = v; rr = Math.min(p.rx, p.ry); d = p.z + nz * rr;
          } else {
            var dx = p.x1 - p.x0, dy = p.y1 - p.y0, L2 = dx * dx + dy * dy || 1e-6, tt = clamp(((mx - p.x0) * dx + (my - p.y0) * dy) / L2, 0, 1);
            var cx = p.x0 + dx * tt, cy = p.y0 + dy * tt, r = p.r0 + (p.r1 - p.r0) * tt, ex = mx - cx, ey = my - cy, dd = Math.sqrt(ex * ex + ey * ey);
            if (dd > r) continue; var qq = dd / r; nz = Math.sqrt(Math.max(0, 1 - qq * qq)); nx = ex / r; ny = ey / r; rr = r; d = p.z0 + (p.z1 - p.z0) * tt + nz * r;
          }
          if (back) { d = -d + 2 * nz * rr; nx = -nx; }
          var k = py * W + px;
          if (d > dep[k]) { dep[k] = d; id[k] = pi; lit[k] = nx * LX + ny * LY + nz * LZ + (p.o.glow || 0); }
        }
      }
    });
    var c = mkc(W + 2, H + 2), g = c.getContext('2d'), img = g.createImageData(W + 2, H + 2), D = img.data;
    var col = new Array(N);
    for (var k2 = 0; k2 < N; k2++) {
      if (id[k2] < 0) continue;
      var p2 = prims[id[k2]], R = sp.mats[p2.mat] ? ramp(sp.mats[p2.mat]) : ramp('#888888'), x = k2 % W, y = (k2 / W) | 0;
      var v2 = lit[k2] + (bay(x, y) - 0.5) * 0.16, li = p2.o.flat ? 2 : v2 > 0.86 ? 4 : v2 > 0.56 ? 3 : v2 > 0.16 ? 2 : v2 > -0.22 ? 1 : 0;
      // inner contour: a neighbour from another volume sits clearly in front -> this pixel gets the deep tone
      var nb = [k2 - 1, k2 + 1, k2 - W, k2 + W];
      for (var q2 = 0; q2 < 4; q2++) { var n = nb[q2]; if (n < 0 || n >= N || (q2 < 2 && ((n % W) !== x + (q2 ? 1 : -1)))) continue; if (id[n] >= 0 && id[n] !== id[k2] && dep[n] > dep[k2] + 1.6 && !p2.o.noline) { li = Math.min(li, 0); break; } }
      col[k2] = p2.o.solid ? sp.mats[p2.mat] : R[li];
    }
    function put(x, y, hx) { var i = ((y + 1) * (W + 2) + x + 1) * 4, cc = h2r(hx); D[i] = cc[0]; D[i + 1] = cc[1]; D[i + 2] = cc[2]; D[i + 3] = 255; }
    for (var k3 = 0; k3 < N; k3++) if (col[k3]) put(k3 % W, (k3 / W) | 0, col[k3]);
    // details (face etc.) in model coordinates
    var Dt = {
      px: function (x, y, hx) { var X = Math.round((back ? sp.w - x - 1 : x) * s), Y = Math.round(y * s); if (X >= 0 && Y >= 0 && X < W && Y < H) { put(X, Y, hx); col[Y * W + X] = hx; } },
      rect: function (x, y, w, h, hx) { for (var yy = 0; yy < h * s; yy++) for (var xx = 0; xx < w * s; xx++) { var X = Math.round((back ? sp.w - x - w : x) * s) + xx, Y = Math.round(y * s) + yy; if (X >= 0 && Y >= 0 && X < W && Y < H) { put(X, Y, hx); col[Y * W + X] = hx; } } },
      mat: function (m, i) { return ramp(sp.mats[m])[i]; }
    };
    if (sp.detail) sp.detail(Dt, view);
    // selective outline: darker where the light does not reach (right / bottom)
    var o = new Uint8ClampedArray(D), WW = W + 2, HH = H + 2, OK = h2r(OUTK);
    for (var yy = 0; yy < HH; yy++) for (var xx = 0; xx < WW; xx++) {
      var i = (yy * WW + xx) * 4; if (D[i + 3]) continue;
      var kk = -1, litSide = false;
      if (xx < WW - 1 && D[i + 7]) { kk = i + 4; litSide = true; } else if (yy < HH - 1 && D[i + WW * 4 + 3]) { kk = i + WW * 4; litSide = true; }
      else if (xx > 0 && D[i - 1]) kk = i - 4; else if (yy > 0 && D[i - WW * 4 + 3]) kk = i - WW * 4;
      if (kk < 0) continue; var f = litSide ? 0.72 : 0.9;
      o[i] = D[kk] * (1 - f) + OK[0] * f; o[i + 1] = D[kk + 1] * (1 - f) + OK[1] * f; o[i + 2] = D[kk + 2] * (1 - f) + OK[2] * f; o[i + 3] = 255;
    }
    img.data.set(o); g.putImageData(img, 0, 0);
    return c;
  }

  /* ---------------- the creatures (all original) ---------------- */
  var EYE = '#1c1226', WHITE = '#ffffff';
  function eyes(D, pts, h) { pts.forEach(function (p) { D.rect(p[0], p[1], 2, h || 3, EYE); D.px(p[0], p[1], WHITE); }); }
  var SPECIES = {
    cindle: { w: 48, h: 48, mats: { fur: '#e8703a', cream: '#ffe0b0', flame: '#ffb12e', hot: '#fff27a', dark: '#8a3424' },
      build: function (P) {
        P.c(31, 37, 4, 38, 27, 5, 'fur', -8, -9); P.e(39, 20, 6, 8, 'flame', -7, { glow: 0.25 }); P.e(39, 17, 3, 5, 'hot', -5, { glow: 0.4 });
        P.e(31, 41, 5, 4, 'fur', -3); P.e(26, 35, 11, 9, 'fur', 0); P.e(22, 37, 6, 6, 'cream', 5);
        P.c(19, 39, 3, 19, 45, 3, 'fur', 6); P.c(28, 40, 3, 28, 45, 3, 'fur', 5); P.e(19, 45, 3.4, 2, 'cream', 8); P.e(28, 45, 3.4, 2, 'cream', 7);
        P.c(13, 14, 3.4, 9, 4, 1, 'fur', 4, 2); P.c(25, 13, 3.4, 29, 4, 1, 'fur', 4, 2); P.e(11, 10, 1.4, 3, 'dark', 7, { front: true });
        P.e(20, 21, 11, 9.5, 'fur', 7); P.e(17, 25, 6.5, 4, 'cream', 13, { front: true }); P.e(21, 11, 3, 4, 'flame', 9, { glow: 0.3 });
      },
      detail: function (D, v) { if (v === 'back') return; eyes(D, [[14, 19], [23, 19]]); D.rect(16, 23, 2, 1, EYE); D.px(15, 26, '#a04030'); D.px(18, 26, '#a04030'); D.px(16, 27, '#a04030'); D.px(17, 27, '#a04030'); D.px(12, 23, '#ff9a7a'); D.px(26, 23, '#ff9a7a'); } },
    brookit: { w: 48, h: 48, mats: { skin: '#3e8ee8', belly: '#c8ecff', fin: '#2a64b8', foam: '#f4fbff' },
      build: function (P) {
        P.c(32, 40, 5, 41, 43, 2, 'skin', -6); P.e(42, 41, 4, 3, 'fin', -6);
        P.e(25, 33, 12, 12, 'skin', 0); P.e(22, 35, 8, 9, 'belly', 6);
        P.c(14, 32, 3, 9, 38, 2.4, 'fin', 6, 8); P.c(35, 32, 3, 39, 37, 2.4, 'fin', 2, 2);
        P.e(19, 44, 5, 2.4, 'fin', 6); P.e(30, 44, 5, 2.4, 'fin', 4);
        P.e(22, 18, 10, 9, 'skin', 6); P.e(19, 22, 6, 4, 'belly', 12, { front: true });
        P.c(24, 9, 3, 30, 2, 1, 'fin', 3, 1); P.e(12, 13, 2.4, 3, 'fin', 5); P.e(31, 13, 2.4, 3, 'fin', 3);
        P.e(30, 8, 2, 2, 'foam', 4);
      },
      detail: function (D, v) { if (v === 'back') return; eyes(D, [[16, 16], [24, 16]], 4); D.rect(18, 21, 3, 1, '#1c3a6a'); D.px(17, 24, '#1c3a6a'); D.px(21, 24, '#1c3a6a'); D.rect(18, 25, 3, 1, '#1c3a6a'); } },
    sproutle: { w: 48, h: 48, mats: { bulb: '#5cbf4a', pale: '#e4f6b0', leaf: '#3a9a3e', bud: '#f07ab0', stem: '#7a5a3a' },
      build: function (P) {
        P.c(24, 18, 2, 24, 7, 1.4, 'leaf', -2); P.c(24, 9, 2.2, 14, 3, 1.2, 'leaf', 1, 2); P.c(24, 9, 2.2, 35, 4, 1.2, 'leaf', -2, -3); P.e(24, 6, 3, 3, 'bud', 2, { glow: 0.2 });
        P.e(24, 31, 14, 13, 'bulb', 0); P.e(21, 35, 8, 7, 'pale', 7);
        P.e(16, 44, 4.4, 2.6, 'leaf', 6); P.e(31, 44, 4.4, 2.6, 'leaf', 5);
        P.c(11, 31, 3, 6, 36, 1.4, 'leaf', 4, 6); P.c(37, 31, 3, 42, 35, 1.4, 'leaf', 1, 1);
        P.e(30, 22, 2, 2, 'pale', 12, { front: true });
        P.c(24, 21, 2.6, 17, 33, 1.2, 'leaf', -12, -13, { back: true }); P.c(24, 21, 2.6, 31, 33, 1.2, 'leaf', -12, -13, { back: true });
        P.e(24, 40, 3, 2.4, 'bud', -12, { back: true }); P.e(16, 26, 2.2, 1.6, 'pale', -13, { back: true }); P.e(32, 28, 1.6, 1.2, 'pale', -13, { back: true });
      },
      detail: function (D, v) { if (v === 'back') { D.rect(23, 20, 1, 18, D.mat('bulb', 1)); D.px(20, 37, D.mat('bulb', 1)); D.px(28, 37, D.mat('bulb', 1)); return; } eyes(D, [[16, 27], [25, 27]], 4); D.rect(19, 33, 4, 1, '#1e4a1e'); D.px(18, 32, '#1e4a1e'); D.px(23, 32, '#1e4a1e'); D.px(14, 31, '#f0a0b0'); D.px(28, 31, '#f0a0b0'); } },
    gustling: { w: 48, h: 48, mats: { down: '#a8d8f0', white: '#f4fbff', wing: '#6aa8d8', beak: '#f2b03a', crest: '#3a78c0' },
      build: function (P) {
        P.c(32, 34, 3, 42, 28, 1.4, 'wing', -6); P.c(32, 36, 3, 43, 35, 1.4, 'crest', -7);
        P.e(25, 31, 12, 11, 'down', 0); P.e(22, 34, 7, 7, 'white', 6);
        P.c(15, 28, 4, 5, 22, 2, 'wing', 4, 6); P.c(15, 30, 3.4, 4, 30, 1.6, 'wing', 4, 6); P.c(35, 28, 4, 44, 21, 2, 'wing', -2, -3);
        P.c(19, 41, 1.4, 18, 46, 1, 'beak', 3); P.c(28, 41, 1.4, 29, 46, 1, 'beak', 2);
        P.c(22, 15, 2, 20, 4, 1, 'crest', 2, 1); P.c(25, 15, 2, 28, 5, 1, 'crest', 1, 0);
        P.e(23, 20, 9, 8, 'down', 6); P.c(15, 22, 2.4, 10, 23, 0.6, 'beak', 12, 12, { front: true });
      },
      detail: function (D, v) { if (v === 'back') return; eyes(D, [[17, 18], [25, 18]], 3); D.px(16, 22, '#f0a0b0'); D.px(28, 22, '#f0a0b0'); } },
    cobblet: { w: 48, h: 48, mats: { rock: '#a8906a', moss: '#6aa850', crack: '#5a4a3a', core: '#ffb84a' },
      build: function (P) {
        P.e(16, 43, 6, 4, 'rock', 3); P.e(32, 43, 6, 4, 'rock', 2);
        P.e(24, 32, 15, 11, 'rock', 0); P.e(24, 18, 11, 9, 'rock', 4);
        P.e(8, 32, 6, 7, 'rock', 4); P.e(40, 32, 6, 7, 'rock', -1);
        P.e(25, 11, 7, 3.4, 'moss', 6); P.e(37, 26, 3, 2, 'moss', 6); P.e(10, 26, 3, 2, 'moss', 8);
        P.e(23, 33, 3, 3, 'core', 14, { glow: 0.5, front: true });
      },
      detail: function (D, v) {
        D.rect(19, 25, 1, 3, D.mat('rock', 0)); D.rect(30, 29, 1, 4, D.mat('rock', 0)); D.rect(31, 33, 3, 1, D.mat('rock', 0));
        if (v === 'back') { D.rect(18, 30, 1, 4, D.mat('rock', 0)); return; }
        D.rect(18, 18, 3, 2, '#ffd86a'); D.rect(27, 18, 3, 2, '#ffd86a'); D.px(18, 18, WHITE); D.px(27, 18, WHITE); D.rect(21, 22, 6, 1, D.mat('rock', 0));
      } },
    voltick: { w: 48, h: 48, mats: { shell: '#f2cc3a', band: '#3a3450', leg: '#4a4060', spark: '#fff6a0', face: '#fff0c8' },
      build: function (P) {
        P.c(14, 38, 1.4, 8, 45, 1, 'leg', 2); P.c(20, 40, 1.4, 17, 46, 1, 'leg', 4); P.c(29, 40, 1.4, 32, 46, 1, 'leg', 3); P.c(35, 38, 1.4, 41, 45, 1, 'leg', 1);
        P.e(26, 32, 14, 10, 'shell', 0); P.c(26, 23, 1.6, 26, 41, 1.6, 'band', 9, 9, { back: true });
        P.e(16, 29, 8, 7, 'face', 6, { front: true }); P.e(36, 28, 4, 4, 'shell', 6, { back: true });
        P.c(13, 24, 1, 9, 12, 1, 'band', 5, 4); P.c(18, 23, 1, 21, 11, 1, 'band', 4, 3); P.e(9, 11, 2.6, 2.6, 'spark', 6, { glow: 0.6 }); P.e(21, 10, 2.6, 2.6, 'spark', 5, { glow: 0.6 });
        P.e(32, 27, 3, 2, 'spark', 11, { glow: 0.5 });
      },
      detail: function (D, v) {
        if (v === 'back') {
          D.rect(25, 24, 2, 16, D.mat('band', 1));
          [[18, 27], [33, 27], [16, 33], [35, 33], [21, 37], [30, 37]].forEach(function (p) { D.rect(p[0], p[1], 2, 2, D.mat('band', 2)); D.px(p[0], p[1], D.mat('band', 3)); });
          D.rect(19, 24, 4, 1, D.mat('shell', 4)); D.rect(29, 24, 4, 1, D.mat('shell', 4)); D.rect(25, 41, 2, 2, '#fff6a0'); D.px(24, 42, '#ffe070'); D.px(27, 42, '#ffe070');
          return;
        } eyes(D, [[12, 27], [18, 27]], 3); D.rect(14, 32, 3, 1, '#3a3450'); } },
    mosshell: { w: 48, h: 48, mats: { shell: '#7a9a5a', plate: '#b49a62', skin: '#c8b07a', moss: '#4a9a40', flower: '#f6e070' },
      build: function (P) {
        P.e(13, 43, 4, 3, 'skin', 4); P.e(35, 43, 4, 3, 'skin', 2); P.c(38, 38, 2, 44, 41, 1, 'skin', -2);
        P.e(26, 33, 16, 10, 'shell', 0); P.e(20, 31, 5, 4, 'plate', 8); P.e(31, 30, 5, 4, 'plate', 7); P.e(26, 37, 5, 3, 'plate', 9);
        P.e(26, 24, 10, 4, 'moss', 6); P.e(30, 20, 2, 2, 'flower', 8, { glow: 0.3 }); P.e(21, 21, 1.6, 1.6, 'flower', 8, { glow: 0.3 });
        P.c(12, 34, 4, 6, 30, 5, 'skin', 6, 8, { front: true }); P.e(36, 32, 4, 4, 'skin', -3, { back: true });
      },
      detail: function (D, v) { if (v === 'back') return; eyes(D, [[4, 27], [8, 27]], 3); D.rect(4, 32, 3, 1, '#5a4a2a'); } }
  };
  var CACHE = {};
  function sprite(id, view) {
    var k = id + '|' + view; if (CACHE[k]) return CACHE[k];
    var sp = SPECIES[id]; if (!sp) return null;
    return (CACHE[k] = rasterize(sp, view));
  }

  /* ---------------- 5x7 title font (original), drawn scaled with an outline ---------------- */
  var F5 = {
    A: '01110,10001,10001,11111,10001,10001,10001', B: '11110,10001,10001,11110,10001,10001,11110', C: '01110,10001,10000,10000,10000,10001,01110', D: '11110,10001,10001,10001,10001,10001,11110',
    E: '11111,10000,10000,11110,10000,10000,11111', F: '11111,10000,10000,11110,10000,10000,10000', G: '01110,10001,10000,10111,10001,10001,01111', H: '10001,10001,10001,11111,10001,10001,10001',
    I: '01110,00100,00100,00100,00100,00100,01110', J: '00111,00010,00010,00010,00010,10010,01100', K: '10001,10010,10100,11000,10100,10010,10001', L: '10000,10000,10000,10000,10000,10000,11111',
    M: '10001,11011,10101,10101,10001,10001,10001', N: '10001,10001,11001,10101,10011,10001,10001', O: '01110,10001,10001,10001,10001,10001,01110', P: '11110,10001,10001,11110,10000,10000,10000',
    Q: '01110,10001,10001,10001,10101,10010,01101', R: '11110,10001,10001,11110,10100,10010,10001', S: '01111,10000,10000,01110,00001,00001,11110', T: '11111,00100,00100,00100,00100,00100,00100',
    U: '10001,10001,10001,10001,10001,10001,01110', V: '10001,10001,10001,10001,10001,01010,00100', W: '10001,10001,10001,10101,10101,10101,01010', X: '10001,10001,01010,00100,01010,10001,10001',
    Y: '10001,10001,01010,00100,00100,00100,00100', Z: '11111,00001,00010,00100,01000,10000,11111', '0': '01110,10001,10011,10101,11001,10001,01110', '1': '00100,01100,00100,00100,00100,00100,01110',
    '2': '01110,10001,00001,00010,00100,01000,11111', '3': '11111,00010,00100,00010,00001,10001,01110', '4': '00010,00110,01010,10010,11111,00010,00010', '5': '11111,10000,11110,00001,00001,10001,01110',
    '6': '00110,01000,10000,11110,10001,10001,01110', '7': '11111,00001,00010,00100,01000,01000,01000', '8': '01110,10001,10001,01110,10001,10001,01110', '9': '01110,10001,10001,01111,00001,00010,01100',
    '!': '00100,00100,00100,00100,00100,00000,00100', '/': '00001,00010,00010,00100,01000,01000,10000', '-': '00000,00000,00000,01110,00000,00000,00000', '.': '00000,00000,00000,00000,00000,01100,01100',
    ':': '00000,01100,01100,00000,01100,01100,00000', "'": '00100,00100,01000,00000,00000,00000,00000', ' ': '000,000,000,000,000,000,000', '?': '01110,10001,00001,00010,00100,00000,00100'
  };
  function textW(s, sc) { sc = sc || 1; var w = 0; s = String(s).toUpperCase(); for (var i = 0; i < s.length; i++) w += (s[i] === ' ' ? 4 : 6) * sc; return Math.max(0, w - sc); }
  // text(g, s, x, y, [top, bottom], scale, outline) — two-tone fill, 1 px (scaled) outline, top-left anchor
  function text(g, s, x, y, cols, sc, ol) {
    sc = sc || 1; s = String(s).toUpperCase(); cols = Array.isArray(cols) ? cols : [cols, cols];
    var passes = ol ? [[ol, true], [null, false]] : [[null, false]];
    passes.forEach(function (pass) {
      var cx = x;
      for (var i = 0; i < s.length; i++) {
        var rows = (F5[s[i]] || F5['?']).split(',');
        for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < rows[ry].length; rx++) if (rows[ry][rx] === '1') {
          if (pass[1]) { g.fillStyle = pass[0]; g.fillRect(cx + rx * sc - 1, y + ry * sc - 1, sc + 2, sc + 2); g.fillRect(cx + rx * sc, y + ry * sc + sc, sc, 1); }
          else { g.fillStyle = ry < 4 ? cols[0] : cols[1]; g.fillRect(cx + rx * sc, y + ry * sc, sc, sc); }
        }
        cx += (s[i] === ' ' ? 4 : 6) * sc;
      }
    });
  }

  /* ---------------- backdrops: hill-top meadow ring (day / sunset / dusk) ---------------- */
  var STAGES = {
    day: { sky: ['#5aa8e8', '#7cc0f0', '#a0d4f4', '#c4e6f6', '#e4f4f4'], far: '#8ab0d0', mid: '#6a9a8a', grass: ['#9ad86a', '#7cc458', '#62ac4a', '#4c923e'], cloud: '#ffffff', sun: null, stars: false },
    sunset: { sky: ['#4a4a8a', '#8a5a9a', '#d8708a', '#f4a070', '#fcd890'], far: '#7a5a8a', mid: '#5a5a6a', grass: ['#c8c070', '#a0a858', '#7a8e4a', '#5a7040'], cloud: '#ffd0b0', sun: '#fff0a0', stars: false },
    dusk: { sky: ['#141a3a', '#1e2a5a', '#2e3e74', '#4a5a8a', '#7a7a9a'], far: '#2a3456', mid: '#22303e', grass: ['#4a7a5a', '#3a6a4e', '#2e5642', '#224434'], cloud: '#6a74a0', sun: null, stars: true }
  };
  var BG = {};
  function backdropBase(stage, W, H) {
    var k = stage + W + 'x' + H; if (BG[k]) return BG[k];
    var S = STAGES[stage] || STAGES.day, c = mkc(W, H), g = c.getContext('2d'), hz = Math.round(H * 0.42), x, y;
    for (y = 0; y < hz; y++) for (x = 0; x < W; x++) { var f = y / hz * (S.sky.length - 1), i = Math.floor(f), m = f - i; g.fillStyle = S.sky[m > bay(x, y) ? Math.min(i + 1, S.sky.length - 1) : i]; g.fillRect(x, y, 1, 1); }
    if (S.stars) for (var s = 0; s < 40; s++) { g.fillStyle = s % 5 ? '#c8d4ff' : '#ffffff'; g.fillRect((h1(s, 3) * W) | 0, (h1(s, 7) * hz * 0.7) | 0, 1, 1); }
    if (S.sun) { for (y = -10; y <= 10; y++) { var hw = Math.floor(Math.sqrt(100 - y * y)); g.fillStyle = y < -3 ? S.sun : y < 4 ? '#ffd070' : '#f4a060'; g.fillRect(Math.round(W * 0.2) - hw, hz - 6 + y, hw * 2, 1); } }
    for (x = 0; x < W; x++) {   // far ridge and mid hills
      var r1 = Math.round(hz - 10 - vn(x / 26, 11) * 16 - vn(x / 9, 12) * 4); g.fillStyle = S.far; g.fillRect(x, r1, 1, hz - r1 + 2); g.fillStyle = mixh(S.far, '#ffffff', 0.25); g.fillRect(x, r1, 1, 1);
      var r2 = Math.round(hz - 2 - vn(x / 18 + 40, 21) * 8); g.fillStyle = S.mid; g.fillRect(x, r2, 1, hz - r2 + 2); g.fillStyle = mixh(S.mid, '#ffffff', 0.18); g.fillRect(x, r2, 1, 1);
    }
    for (x = 0; x < W; x += 3) {   // tree line on the hills
      var tx = x + ((h1(x, 5) * 3) | 0), th = 3 + ((h1(x, 6) * 5) | 0), base = Math.round(hz - vn(tx / 18 + 40, 21) * 8);
      if (h1(x, 8) < 0.45) continue; g.fillStyle = mixh(S.mid, '#000000', 0.25); for (var q = 0; q < th; q++) g.fillRect(tx - Math.floor((th - q) / 3), base - q, 1 + 2 * Math.floor((th - q) / 3), 1);
    }
    for (y = hz; y < H; y++) for (x = 0; x < W; x++) {   // meadow with dithered bands and grass texture
      var ff = (y - hz) / (H - hz) * (S.grass.length - 1) + (vn(x / 14 + y * 0.3, 31) - 0.5) * 0.9, ii = clamp(Math.floor(ff), 0, S.grass.length - 1), mm = ff - Math.floor(ff);
      var cc = S.grass[mm > bay(x, y) ? Math.min(ii + 1, S.grass.length - 1) : ii];
      if (h2(x, y, 41) < 0.06 && y > hz + 4) cc = mixh(cc, '#ffffff', 0.18); else if (h2(x, y, 42) < 0.05) cc = mixh(cc, '#000000', 0.18);
      g.fillStyle = cc; g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = mixh(S.grass[0], '#ffffff', 0.35); g.fillRect(0, hz, W, 1);
    for (var st = 0; st < 5; st++) {   // standing stones on the horizon
      var sx = Math.round(W * (0.08 + st * 0.21 + h1(st, 2) * 0.05)), sh = 6 + ((h1(st, 9) * 6) | 0), sb = hz + 1;
      g.fillStyle = mixh('#8a8aa0', S.mid, 0.45); g.fillRect(sx, sb - sh, 4, sh); g.fillStyle = mixh('#c8c8d8', S.mid, 0.3); g.fillRect(sx, sb - sh, 1, sh); g.fillRect(sx, sb - sh, 4, 1);
    }
    for (var fl = 0; fl < 70; fl++) {   // flowers
      var fx = (h1(fl, 51) * W) | 0, fy = hz + 6 + ((h1(fl, 52) * (H - hz - 8)) | 0);
      g.fillStyle = ['#ffe070', '#ffffff', '#f08ab0', '#b0a0ff'][fl % 4]; if (STAGES[stage] === STAGES.dusk) g.fillStyle = mixh(g.fillStyle, '#22304a', 0.5); g.fillRect(fx, fy, 1, 1);
    }
    return (BG[k] = c);
  }
  function backdrop(g, r, t, stage) {
    var S = STAGES[stage] || STAGES.day;
    g.drawImage(backdropBase(stage, r.w, r.h), r.x, r.y);
    var hz = Math.round(r.h * 0.42);
    for (var i = 0; i < 4; i++) {   // drifting clouds
      var cw = 18 + i * 6, x = Math.round(((i * 71 + t * (2 + i)) % (r.w + cw * 2)) - cw), y = r.y + 8 + i * 7 % 30;
      if (y > r.y + hz - 20) continue; g.fillStyle = S.cloud; g.globalAlpha = stage === 'dusk' ? 0.35 : 0.85;
      g.fillRect(r.x + x, y + 2, cw, 3); g.fillRect(r.x + x + 3, y, cw - 8, 2); g.fillRect(r.x + x + 6, y - 1, cw - 14, 1);
      g.globalAlpha = 1;
    }
  }
  // arena platform: trodden earth disc with a grass lip and a soft shadow
  function platform(g, pl, side, stage) {
    var S = STAGES[stage] || STAGES.day, dirt = ramp(stage === 'dusk' ? '#6a6a7a' : '#c8a070'), grs = ramp(S.grass[1]);
    for (var y = -pl.ry - 2; y <= pl.ry + 3; y++) {
      var q = 1 - (y * y) / ((pl.ry + 2.4) * (pl.ry + 2.4)); if (q < 0) continue; var w = Math.floor(Math.sqrt(q) * (pl.rx + 2.4));
      g.fillStyle = 'rgba(20,16,40,0.28)'; g.fillRect(pl.x - w + 2, pl.y + y + 2, w * 2, 1);
    }
    for (var yy = -pl.ry; yy <= pl.ry; yy++) {
      var qq = 1 - (yy * yy) / ((pl.ry + 0.4) * (pl.ry + 0.4)); if (qq < 0) continue; var ww = Math.floor(Math.sqrt(qq) * (pl.rx + 0.4));
      for (var x = -ww; x <= ww; x++) {
        var e = Math.sqrt((x * x) / ((pl.rx + 0.4) * (pl.rx + 0.4)) + (yy * yy) / ((pl.ry + 0.4) * (pl.ry + 0.4))), c;
        if (e > 0.86) c = yy < 0 ? grs[3] : grs[1]; else if (e > 0.74) c = yy < 0 ? grs[2] : grs[0];
        else { var v = -yy / pl.ry * 0.6 - x / pl.rx * 0.25 + (bay(x + 64, yy + 64) - 0.5) * 0.5; c = v > 0.45 ? dirt[4] : v > 0.05 ? dirt[3] : v > -0.4 ? dirt[2] : dirt[1]; if (h2(x, yy, 77) < 0.05) c = dirt[1]; }
        g.fillStyle = c; g.fillRect(pl.x + x, pl.y + yy, 1, 1);
      }
    }
    for (var k = 0; k < 9; k++) { var a = h1(k, side === 'foe' ? 3 : 4) * Math.PI, tx = Math.round(pl.x + Math.cos(a) * pl.rx * 0.95), ty = Math.round(pl.y + Math.sin(a) * pl.ry * 0.9); g.fillStyle = grs[3]; g.fillRect(tx, ty - 2, 1, 2); g.fillRect(tx + 2, ty - 1, 1, 1); }
  }

  return { sprite: sprite, species: SPECIES, ramp: ramp, mix: mixh, text: text, textW: textW, backdrop: backdrop, platform: platform, stages: STAGES, h1: h1, bay: bay };
})();
