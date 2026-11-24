/* pixel-terrain.js - E-17 Destructible pixel terrain (Game DNA). v1.2.0
 * One plain script, no dependencies, ASCII only. Defines one global: GameDNA_PixelTerrain.
 *
 * The level's ground is a bitmap mask (one cell per world px by default). Explosions carve jagged circles with a
 * scorched rim, throw dirt that falls and may settle as loose sand, make loose overhang crumbs fall, and leave cooling
 * embers on the rim. Characters and items walk on the new surface through the collision helpers (solid, moveX, moveY,
 * groundY, fall, resolve). The terrain is drawn from cached chunks; a blast recomposes only the dirty cells.
 * Pixel render (ImageData per cell) for pixel-art games, smooth render (device-resolution chunks, vector crater edges)
 * for HD games. Deterministic from the seed, the call order and update() time; no Math.random, no wall clock.
 */
(function (root) {
  'use strict';
  var VERSION = '1.2.0';
  var STEP = 1000 / 60;

  var DEFAULTS = {
    radius: 24,      // default blast radius (world px) when blast() gets no r
    rim: 0.55,       // scorched rim width as a fraction of r
    scorch: 1,       // 0..1.5 darkness of the rim
    jag: 0.08,       // crater edge irregularity (fraction of r)
    debris: 1,       // multiplier on thrown dirt
    settle: 0.3,     // chance a thrown grain settles as loose sand where it lands (0 = never adds terrain)
    crumble: 1,      // 1 = thin overhangs and lone crumbs left by a blast fall as loose grains
    smoke: 1, flash: 1, embers: 1,
    shake: 3,        // px asked through onShake on a blast (x scale)
    gravity: 1,      // grains and fall() items: 900 px/s^2 x scale at 1
    render: 'auto',  // 'auto' | 'pixel' | 'smooth'
    maxScale: 3,     // smooth render: max device px per world px of the chunk cache
    chunk: 128,      // chunk size in cells
    maxChunks: 72,   // chunk cache size (LRU)
    grains: 900, puffs: 64, embersCap: 260,
    minSupport: 0.6, // on changed ground a body stands only with >= this fraction of its foot row on ground and its centre over it
    loose: 3000,     // floating pieces up to this many cells (not tied to the map edge or protected ground) fall after a blast
    backWall: 1,     // smooth render: carved soil below the original surface shows a dark dug back wall, not the sky
    textureScale: 1  // smooth render with `texture`: texture px per cell
  };

  var THEMES = {
    meadow: { grass: [[38, 74, 44], [52, 104, 52], [70, 132, 56], [96, 160, 66], [138, 190, 84], [178, 214, 112]],
      soil: [[52, 34, 26], [74, 48, 32], [98, 66, 40], [122, 86, 52], [146, 108, 66], [170, 132, 84]],
      deep: [[40, 30, 30], [58, 42, 38], [76, 56, 46], [96, 74, 58]],
      stone: [[42, 40, 54], [66, 62, 80], [94, 90, 108], [126, 122, 138], [164, 160, 174], [198, 194, 206]],
      root: [62, 40, 28], pebble: [[84, 76, 82], [118, 108, 112], [156, 146, 144], [196, 186, 178]] },
    desert: { grass: [[150, 104, 58], [182, 134, 74], [208, 162, 96], [226, 188, 122], [240, 210, 150], [250, 230, 184]],
      soil: [[98, 56, 36], [128, 76, 44], [158, 98, 56], [186, 124, 72], [208, 150, 92], [228, 176, 116]],
      deep: [[80, 46, 36], [104, 62, 44], [128, 80, 54], [150, 98, 66]],
      stone: [[60, 44, 46], [88, 66, 64], [118, 92, 84], [150, 122, 108], [184, 156, 136], [214, 190, 166]],
      root: [92, 58, 36], pebble: [[110, 80, 70], [146, 112, 94], [184, 150, 124], [218, 190, 160]] },
    cave: { grass: [[40, 62, 70], [52, 86, 88], [68, 112, 104], [94, 140, 120], [130, 170, 140], [170, 200, 168]],
      soil: [[30, 26, 38], [44, 38, 52], [60, 52, 68], [78, 68, 86], [98, 88, 106], [122, 112, 130]],
      deep: [[24, 20, 30], [34, 28, 42], [46, 40, 56], [60, 52, 70]],
      stone: [[30, 30, 44], [48, 48, 66], [70, 70, 92], [96, 96, 120], [128, 128, 150], [164, 164, 184]],
      root: [36, 30, 44], pebble: [[64, 60, 80], [90, 86, 108], [120, 116, 138], [158, 154, 174]] },
    snow: { grass: [[150, 170, 196], [186, 204, 224], [214, 228, 242], [232, 240, 250], [244, 248, 255], [255, 255, 255]],
      soil: [[54, 50, 62], [74, 68, 82], [96, 88, 104], [120, 112, 128], [146, 138, 152], [172, 166, 178]],
      deep: [[40, 38, 50], [56, 52, 66], [72, 68, 84], [90, 86, 102]],
      stone: [[40, 46, 66], [62, 70, 94], [88, 98, 124], [118, 130, 156], [154, 166, 190], [192, 204, 224]],
      root: [60, 54, 66], pebble: [[80, 84, 100], [110, 116, 134], [146, 152, 170], [186, 192, 208]] }
  };
  var CHAR = [34, 22, 16];

  /* ---------------------------------------------------------------- small helpers */
  function num(v, d) { return v == null || v === '' || !isFinite(+v) ? d : +v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hsh(x, y, s) {
    var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791);
    n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y, sc, s) {
    var u = x / sc, v = y / sc, i = Math.floor(u), j = Math.floor(v), fx = smooth(u - i), fy = smooth(v - j);
    var a = hsh(i, j, s), b = hsh(i + 1, j, s), c = hsh(i, j + 1, s), d = hsh(i + 1, j + 1, s);
    var top = a + (b - a) * fx, bot = c + (d - c) * fx; return top + (bot - top) * fy;
  }
  function makeRng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  var canvasFactory = function (w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c;
  };
  function mkCanvas(w, h) { try { return canvasFactory(w, h); } catch (e) { return null; } }

  /* ---------------------------------------------------------------- crater shape (exported for checks) */
  // A blast carves every cell whose centre lies inside r(theta) = r * (1 + jag * (0.6 sin(k1 theta + p1) + 0.4 sin(k2 theta + p2))).
  function shapeRadius(sh, ang) { return sh.r * (1 + sh.jag * (0.6 * Math.sin(sh.k1 * ang + sh.p1) + 0.4 * Math.sin(sh.k2 * ang + sh.p2))); }
  // Signed distance-like edge value of a blast at offset (px, py) from its centre: < 0 inside the hole.
  // 'circle': the jagged circle. 'crater' (default): the jagged circle below the centre; above it the walls lean OUT as they rise
  // (half width = side radius x (1 + flare x height / r), up to 1.6 r), so a blast next to a wall never leaves an overhang to get stuck under.
  var CRATER_H = 1.6, BOWL = 0.8;
  function shapeEdge(sh, px, py) {
    if (sh.shape === 'circle') return Math.sqrt(px * px + py * py) - shapeRadius(sh, Math.atan2(py, px));
    if (py >= 0) { var qy = py / BOWL, ax = Math.abs(px); return Math.cbrt(ax * ax * ax + qy * qy * qy) - shapeRadius(sh, Math.atan2(qy, px)); }   // a flat-floored bowl (|x|^3 + |y / 0.8|^3)
    var up = -py, side = shapeRadius(sh, px >= 0 ? 0 : Math.PI), half = side * (1 + sh.flare * up / sh.r);
    var below = Math.sqrt(px * px + py * py) - shapeRadius(sh, Math.atan2(py, px));
    return Math.min(below, Math.max(Math.abs(px) - half, up - sh.r * CRATER_H));
  }

  /* ---------------------------------------------------------------- create */
  function create(opt) {
    opt = opt || {};
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    if (opt.params) for (k in opt.params) if (k in DEFAULTS) P[k] = typeof DEFAULTS[k] === 'string' ? String(opt.params[k]) : num(opt.params[k], DEFAULTS[k]);
    var cell = Math.max(0.25, num(opt.cell, 1));
    var WW = Math.max(1, num(opt.w, 640)), WH = Math.max(1, num(opt.h, 360));
    var W = Math.ceil(WW / cell), H = Math.ceil(WH / cell), N = W * H;
    var seed = num(opt.seed, 1) | 0;
    var rng = makeRng(seed * 7919 + 13);
    var scaleOf = function () { var s = typeof opt.scale === 'function' ? safe(opt.scale, 1) : opt.scale; return Math.max(0.2, num(s, 1)); };
    var out = opt.outside || {};
    var OUT_L = out.left !== undefined ? !!out.left : true, OUT_R = out.right !== undefined ? !!out.right : true;
    var OUT_T = !!out.top, OUT_B = !!out.bottom;
    var theme = THEMES[opt.art] || THEMES.meadow, themeName = THEMES[opt.art] ? opt.art : 'meadow';

    var mask = new Uint8Array(N);   // 0 air, 1 ground, 2 hard (never carved), 3 loose sand (settled)
    var orig = new Uint8Array(N);   // the ground at create / reset (1 = was solid)
    var cut = new Uint8Array(N);    // 1 = a blast passed over this cell (decoration above ground is gone too)
    var burn = new Uint8Array(N);   // scorch 0..255
    var sandCol = new Uint32Array(N); // rgb of settled sand
    var depthA = new Uint8Array(N), belowA = new Uint8Array(N), hardA = new Uint8Array(N);
    var base = null;                // cell-resolution RGBA of the art (null when there is no canvas and no built-in art)
    var S = { blasts: 0, carved: 0, settled: 0, crumbled: 0, updates: 0, frozen: 0, draws: 0, fxDraws: 0, chunkBuilds: 0, chunkPatches: 0,
      patchedCells: 0, evicted: 0, cbErrors: 0, drawErrors: 0, updErrors: 0, badInput: 0, moves: 0, blocked: 0, steps: 0, peakGrains: 0,
      recycled: 0, solidCalls: 0, lastBlastMs: 0, lastPatchMs: 0, keepOutSkips: 0, slips: 0, jams: 0, spikes: 0, loosePieces: 0, looseCells: 0 };
    var acc = 0, time = 0, shakeA = 0, shakeT = 0, shakeD = 1, shakeX = 0, shakeY = 0, blastSeq = 0;
    var shapes = [];                // recent blast shapes (for checks and the probe)
    var events = [];

    function safe(fn, d) { try { return fn(); } catch (e) { S.cbErrors++; return d; } }
    function call(fn, a, b, c) { if (typeof fn !== 'function') return; try { fn(a, b, c); } catch (e) { S.cbErrors++; } }

    /* ---------- initial ground ---------- */
    var solidFn = typeof opt.solid === 'function' ? opt.solid : null;
    var hardFn = typeof opt.hard === 'function' ? opt.hard : null;
    var paintFn = typeof opt.paint === 'function' ? opt.paint : null;
    // optional painted soil texture (smooth render, built-in art): sampled once, mirrored when it repeats
    var TEX = null;
    (function () {
      var im = opt.texture; if (!im) return;
      var tw = im.naturalWidth || im.width, th = im.naturalHeight || im.height, c = tw && th ? mkCanvas(tw, th) : null; if (!c) return;
      try { var g = c.getContext('2d'); g.drawImage(im, 0, 0); TEX = { w: tw, h: th, d: g.getImageData(0, 0, tw, th).data }; } catch (e) { TEX = null; }
    })();
    function texAt(X, Y) {
      var k = P.textureScale, u = Math.floor(X * k), v = Math.floor(Y * k), w2 = TEX.w * 2, h2 = TEX.h * 2;
      u = ((u % w2) + w2) % w2; v = ((v % h2) + h2) % h2; if (u >= TEX.w) u = w2 - 1 - u; if (v >= TEX.h) v = h2 - 1 - v;
      var q = (v * TEX.w + u) * 4; return [TEX.d[q], TEX.d[q + 1], TEX.d[q + 2]];
    }

    function paintBase() {
      // the art at one px per cell, from the game's paint() (or null)
      if (!paintFn) return null;
      var c = mkCanvas(W, H); if (!c) return null;
      var g = c.getContext('2d'); if (!g || !g.getImageData) return null;
      try { g.save(); g.scale(1 / cell, 1 / cell); paintFn(g, 0, 0, WW, WH); g.restore(); } catch (e) { S.cbErrors++; }
      try { return g.getImageData(0, 0, W, H).data; } catch (e) { return null; }
    }
    function reset() {
      var i, x, y;
      base = paintBase();
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        i = y * W + x;
        var wx = (x + 0.5) * cell, wy = (y + 0.5) * cell, s;
        if (solidFn) { s = false; try { s = !!solidFn(wx, wy); } catch (e) { S.cbErrors++; } }
        else s = base ? base[i * 4 + 3] > 127 : false;
        var hd = false;
        if (s && hardFn) { try { hd = !!hardFn(wx, wy); } catch (e) { S.cbErrors++; } }
        mask[i] = s ? (hd ? 2 : 1) : 0; orig[i] = s ? 1 : 0; hardA[i] = hd ? 1 : 0; cut[i] = 0; burn[i] = 0; sandCol[i] = 0;
      }
      // depth below the surface / distance to air below (for the built-in art)
      for (x = 0; x < W; x++) {
        var d = 0;
        for (y = 0; y < H; y++) { i = y * W + x; d = orig[i] ? Math.min(255, d + 1) : 0; depthA[i] = d ? d - 1 : 0; }
        var b = 0;
        for (y = H - 1; y >= 0; y--) { i = y * W + x; b = orig[i] ? Math.min(255, b + 1) : 0; belowA[i] = b ? b - 1 : 0; }
      }
      if (!base) base = builtinBase();
      for (var c in chunks) dropChunk(chunks[c]);
      chunks = {}; chunkCount = 0;
    }

    /* ---------- built-in art (pure arithmetic; also used in node) ---------- */
    function ramp(rr, t, pixel) {
      t = clamp(t, 0, 0.999) * (rr.length - 1);
      if (pixel) return rr[Math.round(t)];
      var i = Math.floor(t), f = t - i, a = rr[i], b = rr[Math.min(rr.length - 1, i + 1)];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
    // colour of the built-in art at cell (x, y); fx, fy = sub-cell offset for the smooth (2x) sampling
    function artColor(x, y, fx, fy, pixel) {
      var i = y * W + x, d = depthA[i], bl = belowA[i], hard = hardA[i] === 1;
      var X = x + fx, Y = y + fy, T = theme, s = seed;
      if (hard) {
        // bedrock: irregular stones (jittered cells), cracks between them, each lit from the top left
        var gx0 = Math.floor(X / 11), gy0 = Math.floor(Y / 8), d1 = 1e9, d2 = 1e9, sx = 0, sy = 0, sid = 0;
        for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
          var qx = gx0 + ox, qy = gy0 + oy, cx0 = (qx + 0.2 + hsh(qx, qy, s + 61) * 0.6) * 11, cy0 = (qy + 0.2 + hsh(qx, qy, s + 62) * 0.6) * 8;
          var ddx = (X - cx0) / 1.15, ddy = Y - cy0, dd = ddx * ddx + ddy * ddy;
          if (dd < d1) { d2 = d1; d1 = dd; sx = X - cx0; sy = Y - cy0; sid = hsh(qx, qy, s + 63); } else if (dd < d2) d2 = dd;
        }
        var gap = Math.sqrt(d2) - Math.sqrt(d1);
        if (gap < 0.9) return ramp(T.stone, 0.02, pixel);
        var t = 0.34 + sid * 0.22 - sx * 0.035 - sy * 0.05 + (vnoise(X, Y, 3, s + 41) - 0.5) * 0.16 + (gap < 1.8 ? -0.12 : 0);
        if (d < 2 && !orig[i - W > 0 ? i - W : i]) t += 0.18;
        return ramp(T.stone, t, pixel);
      }
      var lip = 3 + Math.floor(vnoise(X, 0, 6, s + 5) * 2.6) + (hsh(Math.floor(X / 3), 7, s) > 0.8 ? 1 : 0);
      if (!pixel) {
        // smooth: depth below the surface interpolated between columns, so the grass band follows slopes without pixel steps
        var top0 = y - d, dS;
        if (solidFn && d < 14) dS = (Y * cell - exactTop(X * cell, top0)) / cell;   // the exact surface: a smooth grass edge on slopes
        else { var nx = fx >= 0.5 ? x + 1 : x - 1, j = y * W + nx, f2 = Math.abs(fx - 0.5); var top1 = nx >= 0 && nx < W && orig[j] ? y - depthA[j] : top0; dS = Y - (top0 + (top1 - top0) * f2) - 0.5; }
        var lipS = 3 + vnoise(X, 0, 6, s + 5) * 2.6;
        if (dS < lipS) {
          var gs = dS < 0.8 ? 0.92 - dS * 0.2 : dS > lipS - 1 ? 0.2 : 0.55 - (dS / lipS) * 0.2;
          var gc = ramp(T.grass, gs + (vnoise(X, Y, 3, s + 9) - 0.5) * 0.3, false);
          if (TEX) { var tg = texAt(X, Y), lum = (tg[0] + tg[1] + tg[2]) / 765; gc = [gc[0] * (0.7 + lum * 0.6), gc[1] * (0.7 + lum * 0.6), gc[2] * (0.7 + lum * 0.6)]; }
          return gc;
        }
        if (TEX) {
          // painted soil: the texture, shaded by strata, depth, the grass lip and overhang undersides
          var tc = texAt(X, Y), wq = Math.sin(X * 0.05 + s) * 3 + vnoise(X, Y, 18, s + 7) * 6, bnd = Math.floor((Y + wq) / 9);
          var sh = 0.72 + (bnd % 3 === 0 ? 0.08 : bnd % 3 === 1 ? 0 : -0.06) + (vnoise(X, Y, 6, s + 13) - 0.5) * 0.16;
          sh -= Math.min(0.3, Math.max(0, dS - lipS) * 0.005); if (dS < lipS + 2.5) sh -= 0.16 * (1 - (dS - lipS) / 2.5);
          if (bl < 3) sh -= 0.2 - bl * 0.06;
          var wm = T.soil[3];
          return [(tc[0] * 0.7 + wm[0] * 0.3) * sh, (tc[1] * 0.7 + wm[1] * 0.3) * sh, (tc[2] * 0.7 + wm[2] * 0.3) * sh];
        }
        d = Math.max(lip, Math.round(dS));
      }
      if (d < lip) {
        var gt = d === 0 ? 0.92 : d === 1 ? 0.72 : d === lip - 1 ? 0.18 : 0.5;
        gt += (vnoise(X, Y, 4, s + 9) - 0.5) * 0.28 + (hsh(Math.floor(X), 11, s) > 0.86 && d === 0 ? 0.1 : 0);
        return ramp(T.grass, gt, pixel);
      }
      if (d === lip) return ramp(T.soil, 0.05, pixel);
      // pebbles on a 9x8 grid
      var gx = Math.floor(X / 9), gy = Math.floor(Y / 8), ph = hsh(gx, gy, s + 21);
      if (ph < 0.17 && d > lip + 2) {
        var cx = gx * 9 + 2 + hsh(gx, gy, s + 22) * 5, cy = gy * 8 + 2 + hsh(gx, gy, s + 23) * 4;
        var rx = 1.6 + ph * 11, ry = 1.1 + ph * 6.5, ex = (X - cx) / rx, ey = (Y - cy) / ry, e = ex * ex + ey * ey;
        if (e < 1) {
          var lt = 0.55 - ex * 0.25 - ey * 0.35 + (e > 0.65 ? -0.25 : 0);
          return ramp(T.pebble, lt, pixel);
        }
        if (e < 1.5 && ey > 0) return ramp(T.soil, 0.0, pixel);
      }
      // roots near the top
      if (d > lip && d < lip + 14) {
        var rp = Math.sin(X * 0.35 + Math.sin(Y * 0.5 + X * 0.07) * 1.6 + hsh(Math.floor(X / 20), 3, s) * 6);
        if (Math.abs(rp) < 0.07 + (d < lip + 5 ? 0.06 : 0) && hsh(Math.floor(X / 20), 5, s) > 0.45) return [T.root[0], T.root[1], T.root[2]];
      }
      // strata and blotches
      var warp = Math.sin(X * 0.05 + s) * 3 + vnoise(X, Y, 18, s + 7) * 6;
      var band = Math.floor((Y + warp) / 7), bt = band % 3 === 0 ? 0.62 : band % 3 === 1 ? 0.48 : 0.4;
      var nz = vnoise(X, Y, 5, s + 13) - 0.5, nz2 = vnoise(X, Y, 2.2, s + 17) - 0.5;
      var t2 = bt + nz * 0.35 + nz2 * 0.18 - Math.min(0.3, Math.max(0, d - lip - 2) * 0.006);
      if (d < lip + 3) t2 -= 0.12;                 // shade under the grass lip
      if (bl < 3) t2 -= 0.22 - bl * 0.06;           // underside of an overhang
      t2 -= clamp((d - 40) / 50, 0, 1) * 0.22;
      if (!pixel && hsh(Math.floor(X * 2), Math.floor(Y * 2), s + 31) > 0.985) t2 += 0.25;   // grit sparkle (smooth only)
      return ramp(T.soil, t2, pixel);
    }
    function builtinBase() {
      var b = new Uint8ClampedArray(N * 4), i, x, y;
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        i = y * W + x; if (!orig[i]) continue;
        var c = artColor(x, y, 0.5, 0.5, true), q = i * 4;
        b[q] = c[0]; b[q + 1] = c[1]; b[q + 2] = c[2]; b[q + 3] = 255;
      }
      return b;
    }
    function baseRGB(i) {
      if (base && base[i * 4 + 3] > 0) return [base[i * 4], base[i * 4 + 1], base[i * 4 + 2]];
      var t = theme.soil[3]; return [t[0], t[1], t[2]];
    }

    /* ---------- cells ---------- */
    function cellSolid(cx, cy) {
      if (cx < 0) return OUT_L; if (cx >= W) return OUT_R; if (cy < 0) return OUT_T; if (cy >= H) return OUT_B;
      return mask[cy * W + cx] !== 0;
    }
    function solid(x, y) { S.solidCalls++; return cellSolid(Math.floor(x / cell), Math.floor(y / cell)); }
    function boxHits(x, y, w, h) {
      // true when any cell under the box [x, x+w) x [y, y+h) is solid
      var c0 = Math.floor(x / cell), c1 = Math.floor((x + w - 1e-6) / cell), r0 = Math.floor(y / cell), r1 = Math.floor((y + h - 1e-6) / cell);
      for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) if (cellSolid(c, r)) return true;
      return false;
    }
    function countBox(x, y, w, h) {
      var c0 = Math.floor(x / cell), c1 = Math.floor((x + w - 1e-6) / cell), r0 = Math.floor(y / cell), r1 = Math.floor((y + h - 1e-6) / cell), n = 0;
      for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) if (c >= 0 && c < W && r >= 0 && r < H && mask[r * W + c]) n++;
      return n;
    }
    function okBody(b) { return b && isFinite(b.x) && isFinite(b.y) && b.w > 0 && b.h > 0; }

    /* ---------- collision helpers for the game's bodies ({x, y, w, h}: top-left box, world px) ---------- */
    function moveX(b, dx, o) {
      if (!okBody(b) || !isFinite(dx)) { S.badInput++; return false; }
      S.moves++;
      if (dx === 0) return false;
      var step = Math.max(0, num(o && o.step, 0)), ground = !!(o && o.ground), x0 = b.x, y0 = b.y, dir = dx > 0 ? 1 : -1;
      var left = Math.abs(dx), moved = false, lifted = 0;
      while (left > 1e-9) {
        var inc = Math.min(cell, left) * dir, nx = b.x + inc;
        if (!boxHits(nx, b.y, b.w, b.h)) { b.x = nx; left -= Math.abs(inc); moved = true; continue; }
        var up = 0;
        if (step > 0 && ground) {
          for (var u = 1; u <= step; u++) if (!boxHits(nx, b.y - u, b.w, b.h) && !boxHits(b.x, b.y - u, b.w, b.h)) { up = u; break; }
        }
        if (up) { b.x = nx; b.y -= up; lifted += up; left -= Math.abs(inc); moved = true; continue; }
        // blocked: stand flush against the first solid column (never past the old position)
        var px0 = b.x;
        if (dir > 0) { var ce = Math.floor((nx + b.w - 1e-6) / cell); b.x = Math.max(px0, ce * cell - b.w); }
        else { var cs = Math.floor(nx / cell); b.x = Math.min(px0, (cs + 1) * cell); }
        if (boxHits(b.x, b.y, b.w, b.h)) b.x = px0;
        S.blocked++;
        snapDown(b, step, ground, lifted);
        return true;
      }
      if (!lifted && moved && Math.abs(b.x - (x0 + dx)) < 1e-6) b.x = x0 + dx;   // keep the game's exact float when nothing blocked
      snapDown(b, step, ground, lifted);
      return false;
    }
    function snapDown(b, step, ground, lifted) {
      // walking down a crater slope: stay on the ground when it is at most `step` px below
      if (!(step > 0 && ground) || lifted) return;
      if (boxHits(b.x, b.y + 1e-3 + cell * 0.5, b.w, b.h)) return;
      for (var u = 1; u <= step; u++) if (boxHits(b.x, b.y + u, b.w, b.h)) { b.y = Math.floor((b.y + u + b.h - 1e-6) / cell) * cell - b.h; S.steps++; return; }
    }
    function moveY(b, dy) {
      if (!okBody(b) || !isFinite(dy)) { S.badInput++; return null; }
      S.moves++;
      if (b.slipping) b.slipping = false;
      if (dy === 0) return null;
      var dir = dy > 0 ? 1 : -1, left = Math.abs(dy), y0 = b.y;
      while (left > 1e-9) {
        var inc = Math.min(cell, left) * dir, ny = b.y + inc;
        if (!boxHits(b.x, ny, b.w, b.h)) { b.y = ny; left -= Math.abs(inc); continue; }
        if (dir > 0) { var re = Math.floor((ny + b.h - 1e-6) / cell); b.y = Math.max(b.y, re * cell - b.h); }
        else { var rs = Math.floor(ny / cell); b.y = Math.min(b.y, (rs + 1) * cell); }
        if (boxHits(b.x, b.y, b.w, b.h) && !boxHits(b.x, y0, b.w, b.h)) b.y = y0;
        S.blocked++;
        if (dir > 0 && P.minSupport > 0) {
          // stand only on enough ground: under minSupport of the foot width, slip toward the open side and keep falling
          var sp = support(b);
          if (!sp.stable && sp.inside) {
            // centre over ground but < minSupport of the foot on it: shuffle 1 px only if that really adds support (a body wider than a
            // crater floor rests on it instead of jittering)
            var bx0 = b.x; b.x = bx0 - 1; var fl = support(b).frac; b.x = bx0 + 1; var fr = support(b).frac; b.x = bx0;
            if (Math.max(fl, fr) <= sp.frac) sp.stable = true;
          }
          if (!sp.stable) {
            var ctr2 = b.x + b.w / 2, sd = sp.inside ? (fr > fl ? 1 : -1) : (sp.frac && ctr2 > sp.x1 ? 1 : sp.frac && ctr2 < sp.x0 ? -1 : sp.mid < ctr2 ? 1 : -1), sl = Math.max(1, cell);   // over ground: shuffle onto it; past the edge: slip off
            // the slip still reports 'floor' (the body is touching ground, so the game keeps its ground logic: walking, step-up,
            // jumping) and marks body.slipping; the next steps carry it off or onto the ground
            if (!boxHits(b.x + sd * sl, b.y, b.w, b.h)) { b.x += sd * sl; S.slips++; b.slipping = true; return 'floor'; }
            if (!boxHits(b.x + sd * sl, b.y + sl, b.w, b.h)) { b.x += sd * sl; b.y += sl; S.slips++; b.slipping = true; return 'floor'; }
            if (!boxHits(b.x - sd * sl, b.y + sl, b.w, b.h)) { b.x -= sd * sl; b.y += sl; S.slips++; b.slipping = true; return 'floor'; }
            if (!boxHits(b.x - sd * sl, b.y, b.w, b.h)) { b.x -= sd * sl; S.slips++; b.slipping = true; return 'floor'; }
            S.jams++;   // jammed: cannot slip either way (held by the walls around it)
          }
        }
        return dir > 0 ? 'floor' : 'ceiling';
      }
      if (Math.abs(b.y - (y0 + dy)) < 1e-6) b.y = y0 + dy;
      return null;
    }
    function support(b) {
      // fraction of the foot width with ground right under it (within 1 px), and the middle of the supported part
      // a column counts when ground lies within max(1.5 px, 12 % of the width) under the feet (a wide body on a gentle slope)
      var tol = Math.max(1.5, b.w * 0.12), c0 = Math.floor(b.x / cell), c1 = Math.floor((b.x + b.w - 1e-6) / cell), ry = Math.floor((b.y + b.h + 1e-6) / cell), ry2 = Math.floor((b.y + b.h + tol) / cell);
      var n = 0, sx = 0, lo = -1, hi = -1;
      for (var c = c0; c <= c1; c++) { var hit = false; for (var yy = ry; yy <= ry2 && !hit; yy++) if (cellSolid(c, yy)) hit = true; if (hit) { n++; sx += (c + 0.5) * cell; if (lo < 0) lo = c; hi = c; } }
      // a wall touching the lower half of a side holds that side too (wedged between two walls; or braced: centre over ground, leaning on one)
      var rb0 = Math.floor((b.y + b.h * 0.5) / cell), rb1 = Math.floor((b.y + b.h - 1e-6) / cell), wl = false, wr = false;
      for (var rr = rb0; rr <= rb1; rr++) { if (cellSolid(Math.floor((b.x - 0.999) / cell), rr)) wl = true; if (cellSolid(Math.floor((b.x + b.w + 0.999) / cell), rr)) wr = true; }
      var tot = c1 - c0 + 1, ctr = b.x + b.w / 2;
      // stable = the body's centre lies over the supported span and the span covers >= minSupport of the foot width
      // (a crate bridging a crater on both rims stands; one balanced on a spike or hanging half over an edge does not)
      var span = n ? ((hi + 1) * cell - lo * cell) / (tot * cell) : 0, x0 = n ? lo * cell : 0, x1 = n ? (hi + 1) * cell : 0;
      // only ground the blasts changed is judged: on untouched level geometry the game's own edge rules stay as they were
      var touched = false;
      for (var c2 = c0 - 1; c2 <= c1 + 1 && !touched; c2++) for (var y2 = ry - 1; y2 <= ry2 + 1 && !touched; y2++) if (c2 >= 0 && c2 < W && y2 >= 0 && y2 < H && cut[y2 * W + c2]) touched = true;
      return { frac: n / tot, span: span, mid: n ? sx / n : ctr, stable: !touched || (wl && wr) || (n > 0 && ctr >= x0 && ctr <= x1 && (n / tot >= P.minSupport || wl || wr)), x0: x0, x1: x1, touched: touched, inside: n > 0 && ctr >= x0 && ctr <= x1 };
    }
    function groundY(x, y, maxDown) {
      var c = Math.floor(x / cell), r0 = Math.max(0, Math.floor(y / cell)), r1 = Math.min(H - 1, Math.floor((y + num(maxDown, WH)) / cell));
      if (c < 0 || c >= W) return null;
      for (var r = r0; r <= r1; r++) if (mask[r * W + c]) return r * cell;
      return null;
    }
    function fall(it, dtMs, o) {
      // an item resting on the ground falls when the ground under it is carved: it.vy (px/s) is kept on the item
      if (!okBody(it)) { S.badInput++; return false; }
      var dt = Math.max(0, num(dtMs, STEP)) / 1000, g = 900 * P.gravity * scaleOf() * num(o && o.gravity, 1), mx = num(o && o.maxFall, 600 * scaleOf());
      if (!(dt > 0)) return !!it.onGround;
      it.vy = Math.min(mx, num(it.vy, 0) + g * dt);
      var hit = moveY(it, it.vy * dt);
      if (hit === 'floor') { it.vy = 0; it.onGround = true; } else it.onGround = false;
      if (hit === 'ceiling') it.vy = 0;
      return it.onGround;
    }
    function overlaps(b) { return okBody(b) ? countBox(b.x, b.y, b.w, b.h) : 0; }
    function resolve(b, maxUp) {
      // lift a body that ended inside the ground (sand settled on it, a host bug) to the first free spot above
      if (!okBody(b)) return -1;
      if (!boxHits(b.x, b.y, b.w, b.h)) return 0;
      var m = num(maxUp, b.h);
      for (var u = 1; u <= m; u++) if (!boxHits(b.x, b.y - u, b.w, b.h)) { b.y -= u; return u; }
      return -1;
    }
    function audit(bodies) {
      var n = 0; if (!bodies) return 0;
      for (var i = 0; i < bodies.length; i++) { var b = bodies[i]; if (okBody(b) && countBox(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1) > 0) n++; }
      return n;
    }
    function protect(x, y, w, h) {
      var c0 = Math.max(0, Math.floor(x / cell)), c1 = Math.min(W - 1, Math.floor((x + w - 1e-6) / cell));
      var r0 = Math.max(0, Math.floor(y / cell)), r1 = Math.min(H - 1, Math.floor((y + h - 1e-6) / cell)), n = 0;
      for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) { var i = r * W + c; if (mask[i] === 1) { mask[i] = 2; n++; } }
      return n;
    }

    /* ---------- chunks ---------- */
    var CH = Math.max(16, num(P.chunk, 128) | 0), NCX = Math.ceil(W / CH), NCY = Math.ceil(H / CH);
    var chunks = {}, chunkCount = 0, drawSeq = 0;
    function dropChunk(ch) { ch.cv = null; ch.g = null; ch.base = null; ch.img = null; }
    function markDirty(c0, r0, c1, r1) {
      c0 = Math.max(0, c0); r0 = Math.max(0, r0); c1 = Math.min(W - 1, c1); r1 = Math.min(H - 1, r1);
      if (c1 < c0 || r1 < r0) return;
      for (var cy = Math.floor(r0 / CH); cy <= Math.floor(r1 / CH); cy++) for (var cx = Math.floor(c0 / CH); cx <= Math.floor(c1 / CH); cx++) {
        var ch = chunks[cy * NCX + cx]; if (!ch || !ch.cv) continue;
        var x0 = Math.max(c0, cx * CH), y0 = Math.max(r0, cy * CH), x1 = Math.min(c1, cx * CH + CH - 1), y1 = Math.min(r1, cy * CH + CH - 1);
        if (!ch.dirty) ch.dirty = [x0, y0, x1, y1];
        else { var d = ch.dirty; d[0] = Math.min(d[0], x0); d[1] = Math.min(d[1], y0); d[2] = Math.max(d[2], x1); d[3] = Math.max(d[3], y1); }
      }
    }

    /* pixel compose: one RGBA per cell into buf (chunk-local, row length bw) for the cell rect [x0..x1] x [y0..y1] */
    function composePixels(buf, bw, ox, oy, x0, y0, x1, y1) {
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
        var i = y * W + x, q = ((y - oy) * bw + (x - ox)) * 4, m = mask[i], r, g, b, a;
        if (m === 0) {
          if (cut[i] || !base) { buf[q] = buf[q + 1] = buf[q + 2] = buf[q + 3] = 0; continue; }
          buf[q] = base[i * 4]; buf[q + 1] = base[i * 4 + 1]; buf[q + 2] = base[i * 4 + 2]; buf[q + 3] = base[i * 4 + 3]; continue;
        }
        if (m === 3) { var sc = sandCol[i]; r = sc >> 16; g = (sc >> 8) & 255; b = sc & 255; a = 255; }
        else if (base) { r = base[i * 4]; g = base[i * 4 + 1]; b = base[i * 4 + 2]; a = base[i * 4 + 3]; if (a < 128) { var t0 = theme.soil[2]; r = t0[0]; g = t0[1]; b = t0[2]; a = 255; } }
        else { var t1 = theme.soil[3]; r = t1[0]; g = t1[1]; b = t1[2]; a = 255; }
        var bu = burn[i];
        if (bu) {
          // quantised scorch (3 steps, ordered dither) so the rim reads as pixel art
          var lv = bu / 255 * 3 + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.9, st = lv < 0.45 ? 0 : lv < 1.3 ? 0.42 : lv < 2.1 ? 0.7 : 0.9;
          r += (CHAR[0] - r) * st; g += (CHAR[1] - g) * st; b += (CHAR[2] - b) * st;
        }
        // a darker outline on cells that face a carved hole
        if ((x > 0 && cut[i - 1] && !mask[i - 1]) || (x < W - 1 && cut[i + 1] && !mask[i + 1]) || (y > 0 && cut[i - W] && !mask[i - W]) || (y < H - 1 && cut[i + W] && !mask[i + W])) {
          var up = y > 0 && cut[i - W] && !mask[i - W];
          var f = up ? 0.82 : 0.62; r *= f; g *= f; b *= f;
          if (up && m !== 3) { r += 10; g += 8; b += 4; }
        }
        buf[q] = r; buf[q + 1] = g; buf[q + 2] = b; buf[q + 3] = a;
      }
    }

    /* marching squares over cell centres: adds polygons covering cells where test(i) is true, squares (cx, cy)-(cx+1, cy+1) for cx in [c0-1, c1] */
    var MS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    function contour(g, test, c0, r0, c1, r1, ox, oy, k, cross) {
      // cross(ax, ay, bx, by) (optional): where the outline crosses the edge between two cell centres (0..1 from a), for a smooth
      // outline that follows the game's own ground test instead of 45 degree chamfers
      var hc = 0.5 * cell * k, n = 0;
      for (var cy = r0 - 1; cy <= r1; cy++) {
        var run = 0, inRun = false;
        for (var cx = c0 - 1; cx <= c1 + 1; cx++) {
          var a = cx <= c1 && tst(test, cx, cy), b = cx <= c1 && tst(test, cx + 1, cy), c = cx <= c1 && tst(test, cx + 1, cy + 1), d = cx <= c1 && tst(test, cx, cy + 1);
          var px = ((cx + 0.5) * cell - ox) * k, py = ((cy + 0.5) * cell - oy) * k, s = cell * k;
          if (a && b && c && d) { if (!inRun) { run = px; inRun = true; } continue; }
          if (inRun) { g.rect(run, py, px - run, s); inRun = false; n++; }
          if (!(a || b || c || d)) continue;
          // walk the square boundary: TL, top-mid, TR, right-mid, BR, bottom-mid, BL, left-mid
          var first = true;
          var add = function (X, Y) { if (first) { g.moveTo(X, Y); first = false; } else g.lineTo(X, Y); };
          var wx0 = (cx + 0.5) * cell, wy0 = (cy + 0.5) * cell, t;
          if (a) add(px, py); if (a !== b) { t = cross ? cross(wx0, wy0, wx0 + cell, wy0) : 0.5; add(px + s * t, py); }
          if (b) add(px + s, py); if (b !== c) { t = cross ? cross(wx0 + cell, wy0, wx0 + cell, wy0 + cell) : 0.5; add(px + s, py + s * t); }
          if (c) add(px + s, py + s); if (c !== d) { t = cross ? cross(wx0 + cell, wy0 + cell, wx0, wy0 + cell) : 0.5; add(px + s - s * t, py + s); }
          if (d) add(px, py + s); if (d !== a) { t = cross ? cross(wx0, wy0 + cell, wx0, wy0) : 0.5; add(px, py + s - s * t); }
          g.closePath(); n++;
        }
      }
      return n;
    }
    function origSolidAt(x, y) { if (!solidFn) return false; try { return !!solidFn(x, y); } catch (e) { return false; } }
    function crossOrig(ax, ay, bx, by) {
      // bisection on the game's original ground test between two cell centres
      var sa = origSolidAt(ax, ay), lo = 0, hi = 1;
      if (sa === origSolidAt(bx, by)) return 0.5;
      for (var it = 0; it < 7; it++) { var m = (lo + hi) / 2; if (origSolidAt(ax + (bx - ax) * m, ay + (by - ay) * m) === sa) lo = m; else hi = m; }
      return (lo + hi) / 2;
    }
    function exactTop(Xw, topCell) {
      // the exact surface height (world px) of the run whose top cell is topCell, at world x Xw
      var y0 = (topCell - 0.5) * cell, y1 = (topCell + 0.5) * cell;
      if (!solidFn || origSolidAt(Xw, y0) || !origSolidAt(Xw, y1)) return topCell * cell;
      for (var it = 0; it < 7; it++) { var m = (y0 + y1) / 2; if (origSolidAt(Xw, m)) y1 = m; else y0 = m; }
      return (y0 + y1) / 2;
    }
    function tst(test, cx, cy) { if (cx < 0 || cy < 0 || cx >= W || cy >= H) return test(-1, cx, cy); return test(cy * W + cx, cx, cy); }
    var isCarved = function (i, cx, cy) { if (i < 0) return cutEdge(cx, cy); return cut[i] === 1 && mask[i] === 0; };
    var isSand = function (i) { return i >= 0 && mask[i] === 3; };
    var isBack = function (i, cx, cy) { if (i < 0) { var x2 = clamp(cx, 0, W - 1), y2 = clamp(cy, 0, H - 1); i = y2 * W + x2; } return cut[i] === 1 && mask[i] === 0 && orig[i] === 1 && depthA[i] > 1; };
    function cutEdge(cx, cy) { var x = clamp(cx, 0, W - 1), y = clamp(cy, 0, H - 1), i = y * W + x; return cut[i] === 1 && mask[i] === 0; }

    function chunkBaseSmooth(ch, ds) {
      // the art of one chunk at device resolution: the game's paint() clipped to the chunk, or the built-in art at 2x
      var cw = Math.min(CH, W - ch.cx * CH), chh = Math.min(CH, H - ch.cy * CH);
      var pw = Math.max(1, Math.round(cw * cell * ds)), ph = Math.max(1, Math.round(chh * cell * ds));
      var c = mkCanvas(pw, ph); if (!c) return null;
      var g = c.getContext('2d'), wx = ch.cx * CH * cell, wy = ch.cy * CH * cell;
      if (paintFn) {
        try { g.save(); g.scale(ds, ds); g.translate(-wx, -wy); g.beginPath(); g.rect(wx, wy, cw * cell, chh * cell); g.clip(); paintFn(g, wx, wy, cw * cell, chh * cell); g.restore(); }
        catch (e) { S.cbErrors++; try { g.restore(); } catch (e2) { } }
        return c;
      }
      // built-in: sample the art generator at 2 px per cell, then let the upscale smooth it (painterly), clip to the ground outline
      // built-in: the art generator sampled at device resolution (sharp painted detail, no upscaling blur)
      var id = g.createImageData(pw, ph), buf = id.data;
      for (var y = 0; y < ph; y++) {
        var Yw = wy + (y + 0.5) / ds, cyy = clamp(Math.floor(Yw / cell), 0, H - 1), fyy = Yw / cell - cyy;
        for (var x = 0; x < pw; x++) {
          var Xw = wx + (x + 0.5) / ds, cxx = clamp(Math.floor(Xw / cell), 0, W - 1), i = cyy * W + cxx, q = (y * pw + x) * 4;
          var near = orig[i] || (cxx > 0 && orig[i - 1]) || (cxx < W - 1 && orig[i + 1]) || (cyy > 0 && orig[i - W]) || (cyy < H - 1 && orig[i + W]);
          if (!near) continue;
          var ii = orig[i] ? i : (cyy < H - 1 && orig[i + W]) ? i + W : (cyy > 0 && orig[i - W]) ? i - W : (cxx > 0 && orig[i - 1]) ? i - 1 : i + 1;
          var col = artColor(ii % W, (ii / W) | 0, ii === i ? Xw / cell - cxx : 0.5, ii === i ? fyy : 0.5, false);
          buf[q] = col[0]; buf[q + 1] = col[1]; buf[q + 2] = col[2]; buf[q + 3] = 255;
        }
      }
      g.putImageData(id, 0, 0);
      // crisp outline of the original ground
      var k = ds;
      g.globalCompositeOperation = 'destination-in'; g.beginPath();
      contour(g, function (i, cx, cy) { if (i < 0) { var x2 = clamp(cx, 0, W - 1), y2 = clamp(cy, 0, H - 1); return orig[y2 * W + x2] === 1; } return orig[i] === 1; },
        ch.cx * CH, ch.cy * CH, ch.cx * CH + cw - 1, ch.cy * CH + chh - 1, wx, wy, k, solidFn ? crossOrig : null);
      g.fill(); g.globalCompositeOperation = 'source-over';
      return c;
    }
    function fillAux(ch, x0, y0, x1, y1) {
      // the cell-resolution helper images of a chunk: scorch (alpha) and settled sand (rgb)
      var cw = ch.aw, d1 = ch.burnId.data, d2 = ch.sandId.data;
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
        var i = y * W + x, q = ((y - ch.cy * CH + 1) * cw + (x - ch.cx * CH + 1)) * 4, bu = burn[i];
        d1[q] = CHAR[0]; d1[q + 1] = CHAR[1]; d1[q + 2] = CHAR[2]; d1[q + 3] = mask[i] === 3 ? 0 : Math.min(250, bu * 1.15);
        if (mask[i] === 3) { var sc = sandCol[i]; d2[q] = sc >> 16; d2[q + 1] = (sc >> 8) & 255; d2[q + 2] = sc & 255; d2[q + 3] = 255; }
        else d2[q + 3] = 0;
      }
    }
    function composeSmooth(ch, x0, y0, x1, y1) {
      // recompose the cell rect of a smooth chunk (device px), from its base and the cell arrays
      var g = ch.g, k = ch.ds, wx = ch.cx * CH * cell, wy = ch.cy * CH * cell;
      // the outlines are always built for the whole chunk (+2 cells) and clipped to the dirty rect: the rasteriser then sees the
      // same path for a patch and for a full build, so the anti-aliased crater edges come out identical
      var kx0 = Math.max(0, ch.cx * CH - 2), ky0 = Math.max(0, ch.cy * CH - 2), kx1 = Math.min(W - 1, ch.cx * CH + CH + 1), ky1 = Math.min(H - 1, ch.cy * CH + CH + 1);
      var aw = ch.aw, ah = ch.ah;
      var ax0 = Math.max(ch.cx * CH - 1, x0 - 2), ay0 = Math.max(ch.cy * CH - 1, y0 - 2), ax1 = Math.min(Math.min(W - 1, ch.cx * CH + CH), x1 + 2), ay1 = Math.min(Math.min(H - 1, ch.cy * CH + CH), y1 + 2);
      fillAux(ch, Math.max(0, ax0), Math.max(0, ay0), ax1, ay1);
      var ux0 = Math.max(0, ax0 - ch.cx * CH + 1), uy0 = Math.max(0, ay0 - ch.cy * CH + 1);
      ch.burnG.putImageData(ch.burnId, 0, 0, ux0, uy0, Math.min(aw, ax1 - ch.cx * CH + 2) - ux0, Math.min(ah, ay1 - ch.cy * CH + 2) - uy0);
      ch.sandG.putImageData(ch.sandId, 0, 0, ux0, uy0, Math.min(aw, ax1 - ch.cx * CH + 2) - ux0, Math.min(ah, ay1 - ch.cy * CH + 2) - uy0);
      var px0 = Math.max(0, Math.floor((x0 - ch.cx * CH) * cell * k)), py0 = Math.max(0, Math.floor((y0 - ch.cy * CH) * cell * k));
      var px1 = Math.min(ch.cv.width, Math.ceil((x1 + 1 - ch.cx * CH) * cell * k)), py1 = Math.min(ch.cv.height, Math.ceil((y1 + 1 - ch.cy * CH) * cell * k));
      if (px1 <= px0 || py1 <= py0) return;
      g.save();
      g.beginPath(); g.rect(px0, py0, px1 - px0, py1 - py0); g.clip();
      g.globalCompositeOperation = 'copy';
      if (ch.base) g.drawImage(ch.base, 0, 0); else g.clearRect(0, 0, ch.cv.width, ch.cv.height);
      g.globalCompositeOperation = 'source-over';
      var sx = -cell * k, s2 = cell * k;   // aux images have a 1-cell border
      g.imageSmoothingEnabled = true;
      // settled sand, cut to its own outline on a scratch layer (a nested anti-aliased clip would rasterise differently per rect)
      if (ch.hasSand) {
        var sc = sandScratch(ch.cv.width, ch.cv.height);
        if (sc) {
          var sg = sc.getContext('2d');
          sg.setTransform(1, 0, 0, 1, 0, 0); sg.globalCompositeOperation = 'copy'; sg.imageSmoothingEnabled = true;
          sg.drawImage(ch.sandCv, sx, sx, aw * s2, ah * s2);
          sg.globalCompositeOperation = 'destination-in'; sg.beginPath(); contour(sg, isSand, kx0, ky0, kx1, ky1, wx, wy, k); sg.fillStyle = '#000'; sg.fill();
          sg.globalCompositeOperation = 'source-over';
          g.drawImage(sc, 0, 0, ch.cv.width, ch.cv.height, 0, 0, ch.cv.width, ch.cv.height);
        }
      }
      // scorch, only on what is drawn
      g.globalCompositeOperation = 'source-atop';
      g.drawImage(ch.burnCv, sx, sx, aw * s2, ah * s2);
      // carved holes, crisp: the hole shape is filled on an unclipped scratch layer, then cut out through the rect clip
      var hs = holeScratch(ch.cv.width, ch.cv.height);
      if (hs) {
        var hg = hs.getContext('2d');
        hg.setTransform(1, 0, 0, 1, 0, 0); hg.globalCompositeOperation = 'source-over'; hg.clearRect(0, 0, ch.cv.width, ch.cv.height);
        hg.beginPath(); contour(hg, isCarved, kx0, ky0, kx1, ky1, wx, wy, k); hg.fillStyle = '#000'; hg.fill();
        g.globalCompositeOperation = 'destination-out';
        g.drawImage(hs, 0, 0, ch.cv.width, ch.cv.height, 0, 0, ch.cv.width, ch.cv.height);
        if (P.backWall > 0 && ch.base) {
          // the dug back wall: carved soil below the original surface shows the ground's own art, darkened, behind the hole
          hg.globalCompositeOperation = 'copy'; hg.drawImage(ch.base, 0, 0);
          hg.globalCompositeOperation = 'source-atop'; hg.fillStyle = 'rgba(16,9,5,' + (0.5 + 0.2 * Math.min(1, P.backWall)) + ')'; hg.fillRect(0, 0, ch.cv.width, ch.cv.height);
          hg.globalCompositeOperation = 'destination-in'; hg.beginPath(); contour(hg, isBack, kx0, ky0, kx1, ky1, wx, wy, k); hg.fillStyle = '#000'; hg.fill();
          hg.globalCompositeOperation = 'source-over';
          g.globalCompositeOperation = 'destination-over';
          g.drawImage(hs, 0, 0, ch.cv.width, ch.cv.height, 0, 0, ch.cv.width, ch.cv.height);
        }
      }
      g.restore();
    }
    var HOLESC = null;
    function holeScratch(w, h) {
      if (!HOLESC || HOLESC.width < w || HOLESC.height < h) HOLESC = mkCanvas(Math.max(w, HOLESC ? HOLESC.width : 0), Math.max(h, HOLESC ? HOLESC.height : 0));
      return HOLESC;
    }
    var SANDSC = null;
    function sandScratch(w, h) {
      if (!SANDSC || SANDSC.width < w || SANDSC.height < h) SANDSC = mkCanvas(Math.max(w, SANDSC ? SANDSC.width : 0), Math.max(h, SANDSC ? SANDSC.height : 0));
      return SANDSC;
    }
    function buildChunk(ch, mode, ds) {
      var cw = Math.min(CH, W - ch.cx * CH), chh = Math.min(CH, H - ch.cy * CH);
      ch.mode = mode; ch.ds = ds; ch.dirty = null;
      if (mode === 'pixel') {
        ch.cv = mkCanvas(cw, chh); if (!ch.cv) return false;
        ch.g = ch.cv.getContext('2d'); ch.img = ch.g.createImageData(cw, chh);
        composePixels(ch.img.data, cw, ch.cx * CH, ch.cy * CH, ch.cx * CH, ch.cy * CH, ch.cx * CH + cw - 1, ch.cy * CH + chh - 1);
        ch.g.putImageData(ch.img, 0, 0);
      } else {
        var pw = Math.max(1, Math.round(cw * cell * ds)), ph = Math.max(1, Math.round(chh * cell * ds));
        ch.cv = mkCanvas(pw, ph); if (!ch.cv) return false;
        ch.g = ch.cv.getContext('2d'); ch.base = chunkBaseSmooth(ch, ds);
        ch.aw = cw + 2; ch.ah = chh + 2;
        ch.burnCv = mkCanvas(ch.aw, ch.ah); ch.burnG = ch.burnCv.getContext('2d'); ch.burnId = ch.burnG.createImageData(ch.aw, ch.ah);
        ch.sandCv = mkCanvas(ch.aw, ch.ah); ch.sandG = ch.sandCv.getContext('2d'); ch.sandId = ch.sandG.createImageData(ch.aw, ch.ah);
        ch.hasSand = false;
        for (var y = ch.cy * CH; y < ch.cy * CH + chh && !ch.hasSand; y++) for (var x = ch.cx * CH; x < ch.cx * CH + cw; x++) if (mask[y * W + x] === 3) { ch.hasSand = true; break; }
        composeSmooth(ch, ch.cx * CH, ch.cy * CH, ch.cx * CH + cw - 1, ch.cy * CH + chh - 1);
      }
      S.chunkBuilds++;
      return true;
    }
    function patchChunk(ch) {
      var d = ch.dirty; ch.dirty = null; if (!d) return;
      var t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
      S.chunkPatches++; S.patchedCells += (d[2] - d[0] + 1) * (d[3] - d[1] + 1);
      if (ch.mode === 'pixel') {
        var cw = ch.img.width;
        composePixels(ch.img.data, cw, ch.cx * CH, ch.cy * CH, d[0], d[1], d[2], d[3]);
        ch.g.putImageData(ch.img, 0, 0, d[0] - ch.cx * CH, d[1] - ch.cy * CH, d[2] - d[0] + 1, d[3] - d[1] + 1);
      } else {
        if (!ch.hasSand) for (var y = d[1]; y <= d[3] && !ch.hasSand; y++) for (var x = d[0]; x <= d[2]; x++) if (mask[y * W + x] === 3) { ch.hasSand = true; break; }
        composeSmooth(ch, d[0], d[1], d[2], d[3]);
      }
      if (t0) S.lastPatchMs = performance.now() - t0;
    }
    function getChunk(cx, cy, mode, ds) {
      var key = cy * NCX + cx, ch = chunks[key];
      if (ch && ch.cv && (ch.mode !== mode || Math.abs(ch.ds - ds) > 1e-3)) { dropChunk(ch); }
      if (!ch) { ch = chunks[key] = { cx: cx, cy: cy, cv: null }; }
      if (!ch.cv) {
        if (!buildChunk(ch, mode, ds)) return null;
        chunkCount++;
        if (chunkCount > P.maxChunks) evict();
      } else if (ch.dirty) patchChunk(ch);
      ch.used = drawSeq;
      return ch;
    }
    function evict() {
      var list = [];
      for (var key in chunks) { var c = chunks[key]; if (c.cv && c.used !== drawSeq) list.push(c); }
      list.sort(function (a, b) { return (a.used || 0) - (b.used || 0); });
      while (chunkCount > P.maxChunks && list.length) { dropChunk(list.shift()); chunkCount--; S.evicted++; }
    }
    function modeFor(ctx) {
      var r = P.render;
      if (r === 'pixel' || r === 'smooth') return r;
      return ctx && ctx.imageSmoothingEnabled === false ? 'pixel' : 'smooth';
    }

    /* ---------- blasts ---------- */
    function blast(x, y, r, o) {
      o = o || {};
      x = +x; y = +y; r = num(r, P.radius * scaleOf());
      if (!isFinite(x) || !isFinite(y) || !(r > 0)) { S.badInput++; return null; }
      var t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
      var jag = num(o.jag, P.jag), rim = num(o.rim, P.rim) * r, sc = clamp(num(o.scorch, P.scorch), 0, 1.5);
      var sh = { id: ++blastSeq, x: x, y: y, r: r, jag: jag, rim: rim, shape: o.shape === 'circle' ? 'circle' : 'crater', flare: Math.max(0, num(o.flare, 0.6)),
        k1: 5 + Math.floor(rng() * 3), k2: 11 + Math.floor(rng() * 3), p1: rng() * 6.283, p2: rng() * 6.283, t: time };
      var R = r * (1 + Math.abs(jag)) + rim + cell, RX = sh.shape === 'crater' ? r * (1 + Math.abs(jag)) * (1 + sh.flare * CRATER_H) + rim + cell : R, RU = sh.shape === 'crater' ? Math.max(R, r * CRATER_H + rim + cell) : R;
      var c0 = Math.max(0, Math.floor((x - RX) / cell)), c1 = Math.min(W - 1, Math.floor((x + RX) / cell));
      var r0 = Math.max(0, Math.floor((y - RU) / cell)), r1 = Math.min(H - 1, Math.floor((y + R) / cell));
      var carved = 0, colsN = 0, hardHit = 0, colR = 0, colG = 0, colB = 0;
      var throwN = Math.round(clamp(r * r * 0.22, 8, 220) * P.debris), picks = [], topCut = new Int32Array(c1 - c0 + 1).fill(H);
      for (var cy = r0; cy <= r1; cy++) for (var cx = c0; cx <= c1; cx++) {
        var px = (cx + 0.5) * cell - x, py = (cy + 0.5) * cell - y, ed = shapeEdge(sh, px, py);
        if (ed >= rim) continue;
        var i = cy * W + cx, m = mask[i];
        if (ed < 0) {
          if (m === 2 && !o.hard) { hardHit++; burnCell(i, 0.3 - 0.3 * ed / r, sc * 0.25); continue; }   // protected rock: only soot
          cut[i] = 1; if (cy < topCut[cx - c0]) topCut[cx - c0] = cy;
          if (m) {
            var col = m === 3 ? [sandCol[i] >> 16, (sandCol[i] >> 8) & 255, sandCol[i] & 255] : baseRGB(i);
            colR += col[0]; colG += col[1]; colB += col[2]; colsN++;
            if (picks.length < 400 && hsh(cx, cy, sh.id) < 0.35) picks.push(cx, cy, (col[0] << 16) | (col[1] << 8) | col[2]);
            mask[i] = 0; burn[i] = 0; sandCol[i] = 0; carved++;
          }
        } else if (m) {
          var f = 1 - ed / rim;
          burnCell(i, f, m === 2 ? sc * 0.3 : sc);
        }
      }
      S.blasts++; S.carved += carved;
      markDirty(c0 - 2, r0 - 2, c1 + 2, r1 + 2);
      sh.carved = carved; shapes.push(sh); if (shapes.length > 64) shapes.shift();
      // fx
      var s = scaleOf(), fxs = num(o.fx, 1);
      if (fxs > 0) {
        if (P.flash > 0) {   // fireball: a core and 4-5 lobes, so it billows instead of reading as a target disc
          addPuff(x, y, r * 0.62, 0, 0, 230, 2);
          var nl = 4 + Math.floor(rng() * 2), a0 = rng() * 6.283;
          for (var lb = 0; lb < nl; lb++) { var la = a0 + lb * 6.283 / nl + (rng() - 0.5) * 0.8, ld = r * (0.3 + rng() * 0.25);
            addPuff(x + Math.cos(la) * ld, y + Math.sin(la) * ld * 0.8 - r * 0.08, r * (0.34 + rng() * 0.18), Math.cos(la) * 40 * s, Math.sin(la) * 30 * s - 30 * s, 170 + rng() * 120, 2); }
        }
        var nSm = Math.round((3 + r / (8 * s)) * P.smoke);
        for (var k2 = 0; k2 < nSm && P.smoke > 0; k2++) {
          var a = -Math.PI / 2 + (rng() - 0.5) * 2.2, sp = (20 + rng() * 40) * s;
          addPuff(x + Math.cos(a) * r * 0.4 * rng(), y + Math.sin(a) * r * 0.3, r * (0.35 + rng() * 0.3), Math.cos(a) * sp, Math.sin(a) * sp - 18 * s, 900 + rng() * 700, 1);
        }
        // thrown dirt from the carved cells, coloured like them
        var n = Math.min(throwN, picks.length / 3 | 0), dxo = num(o.dx, 0), dyo = num(o.dy, 0);
        for (var j = 0; j < n; j++) {
          var pi = Math.floor(rng() * (picks.length / 3)) * 3, gx = (picks[pi] + 0.5) * cell, gy = (picks[pi + 1] + 0.5) * cell;
          var ang = Math.atan2(gy - y, gx - x), spd = (120 + rng() * 220) * s * Math.min(1.2, Math.sqrt(r / (24 * s)));
          var vx = Math.cos(ang) * spd * 1.05 + dxo * 120 * s, vy = Math.sin(ang) * spd * 0.5 - (130 + rng() * 210) * s * Math.min(1.2, Math.sqrt(r / (24 * s))) + dyo * 120 * s;
          addGrain(gx, gy, vx, vy, dusty(picks[pi + 2]), rng() < 0.25 ? 2 : 1, 0, x, y, r * 0.85);
        }
        // embers on the rim
        var ne = Math.round(clamp(r / s * 0.6, 4, 24) * P.embers);
        for (var e = 0; e < ne; e++) {
          // scattered in the scorched rim, a few px into the ground, clustered at random (not a bead string)
          var ea = rng() * 6.283, ca = Math.cos(ea), sa = Math.sin(ea), dur = 1200 + rng() * 2300, deep = rng() * rng() * rim * 0.6 + 0.5 * cell;
          for (var er = r * 0.6; er < r * 2.4; er += cell) { var ex = x + ca * er, ey = y + sa * er; if (cellSolid(Math.floor(ex / cell), Math.floor(ey / cell))) { addEmber(ex + ca * deep, ey + sa * deep, dur); break; } }
        }
        if (P.shake > 0) { var amp = P.shake * s * clamp(r / (24 * s), 0.5, 1.8); if (amp > shakeA * (1 - shakeT / shakeD)) { shakeA = amp; shakeT = 0; shakeD = 320; } call(opt.onShake, amp, 320); }
      }
      if (P.crumble > 0) { collapseLips(c0, c1, topCut, r, x, y); var mg = Math.ceil(r / cell) + 2, k0 = Math.max(0, c0 - 2), k1 = Math.min(W - 1, c1 + 2), q0 = Math.max(0, r0 - mg), q1 = Math.min(H - 1, r1 + 2); for (var pass = 0; pass < 40 && crumble(k0, q0, k1, q1, sh.id); pass++) { } dropLoose(x, y, r, k0, q0, k1, q1); }   // slivers fall cell by cell
      var info = { id: sh.id, x: x, y: y, r: r, carved: carved, hard: hardHit, color: colsN ? [colR / colsN | 0, colG / colsN | 0, colB / colsN | 0] : null };
      events.push({ ev: 'blast', id: sh.id, x: Math.round(x), y: Math.round(y), r: Math.round(r), carved: carved, t: Math.round(time) }); if (events.length > 32) events.shift();
      call(opt.onBlast, info); call(opt.onSound, 'blast', info);
      if (t0) S.lastBlastMs = performance.now() - t0;
      return info;
    }
    function dusty(c) { // thrown dirt is a little sooty
      var r = c >> 16, g = (c >> 8) & 255, b = c & 255, f = 0.22;
      return ((r + (CHAR[0] - r) * f) << 16) | ((g + (CHAR[1] - g) * f) << 8) | (b + (CHAR[2] - b) * f);
    }
    function burnCell(i, f, sc) {
      var x = i % W, y = (i / W) | 0, v = Math.round(255 * Math.pow(clamp(f, 0, 1), 0.6) * sc * (0.8 + 0.4 * hsh(x, y, seed + 77)));
      if (v > burn[i]) burn[i] = Math.min(255, v);
    }
    function collapseLips(c0, c1, topCut, r, bx, by) {
      // a slab of ground left hanging over the new hole (a blast next to a wall) falls if it is at most r thick, so walkers are
      // never trapped under a lip; thicker cliffs keep a cave notch. Protected cells never fall.
      var maxT = Math.max(1, Math.floor(r / cell)), n = 0, minC = W, maxC = -1, minR = H, maxR = -1;
      for (var cx = c0; cx <= c1; cx++) {
        var top = topCut[cx - c0]; if (top >= H || top <= 0) continue;
        var cy = top - 1, T = 0, hardIn = false;
        while (cy - T >= 0 && mask[(cy - T) * W + cx] && T <= maxT) { if (mask[(cy - T) * W + cx] === 2) hardIn = true; T++; }
        if (!T || T > maxT || hardIn) continue;
        for (var k = 0; k < T; k++) {
          var i = (cy - k) * W + cx, col = mask[i] === 3 ? sandCol[i] : (function (c) { return (c[0] << 16) | (c[1] << 8) | c[2]; })(baseRGB(i));
          mask[i] = 0; cut[i] = 1; burn[i] = 0; n++; S.crumbled++;
          if (k % 2 === 0) addGrain((cx + 0.5) * cell, (cy - k + 0.5) * cell, 0, 10 * k, col, 1 + (k % 4 === 0 ? 1 : 0), 0, bx, by, r * 3);
        }
        minC = Math.min(minC, cx); maxC = Math.max(maxC, cx); minR = Math.min(minR, cy - T); maxR = Math.max(maxR, cy);
      }
      if (n) markDirty(minC - 2, minR - 2, maxC + 2, maxR + 2);
    }
    function dropLoose(x, y, r, c0, r0, c1, r1) {
      // pieces of ground the blast cut free (not tied to the edge of the search box, the map edge or protected ground) fall as grains
      if (!(P.loose > 0)) return;
      var m = Math.ceil((r * 2 + 8) / cell), X0 = Math.max(0, c0 - m), X1 = Math.min(W - 1, c1 + m), Y0 = Math.max(0, r0 - m), Y1 = Math.min(H - 1, r1 + m);
      var bw = X1 - X0 + 1, bh = Y1 - Y0 + 1, seen = new Uint8Array(bw * bh), stack = [], comp = [];
      for (var sy = r0; sy <= r1; sy++) for (var sx = c0; sx <= c1; sx++) {
        // seeds: ground next to the hole
        var si = sy * W + sx; if (!mask[si] || seen[(sy - Y0) * bw + (sx - X0)]) continue;
        stack.length = 0; comp.length = 0; stack.push(sx, sy); seen[(sy - Y0) * bw + (sx - X0)] = 1; var anchored = false;
        while (stack.length) {
          var cy = stack.pop(), cx = stack.pop(), ci = cy * W + cx; comp.push(ci);
          if (mask[ci] === 2 || cx === X0 || cx === X1 || cy === Y0 || cy === Y1) anchored = true;
          if (comp.length > P.loose) { anchored = true; }
          if (anchored && comp.length > P.loose) break;
          for (var q = 0; q < 4; q++) {
            var nx = cx + (q === 0 ? 1 : q === 1 ? -1 : 0), ny = cy + (q === 2 ? 1 : q === 3 ? -1 : 0);
            if (nx < X0 || nx > X1 || ny < Y0 || ny > Y1) continue;
            var li = (ny - Y0) * bw + (nx - X0); if (seen[li] || !mask[ny * W + nx]) continue;
            seen[li] = 1; stack.push(nx, ny);
          }
        }
        if (anchored) { while (stack.length) { var yy = stack.pop(), xx = stack.pop(); } continue; }
        // free piece: everything falls (every other cell becomes a grain, the rest turns to dust)
        var mnx = W, mxx = -1, mny = H, mxy = -1;
        for (var k = 0; k < comp.length; k++) {
          var i = comp[k], gxk = i % W, gyk = (i / W) | 0;
          var col = mask[i] === 3 ? sandCol[i] : (function (c) { return (c[0] << 16) | (c[1] << 8) | c[2]; })(baseRGB(i));
          mask[i] = 0; cut[i] = 1; burn[i] = 0;
          if (k % 2 === 0) addGrain((gxk + 0.5) * cell, (gyk + 0.5) * cell, 0, 0, col, 1 + (k % 6 === 0 ? 1 : 0), 0, x, y, 1e9);
          mnx = Math.min(mnx, gxk); mxx = Math.max(mxx, gxk); mny = Math.min(mny, gyk); mxy = Math.max(mxy, gyk);
        }
        S.loosePieces++; S.looseCells += comp.length;
        markDirty(mnx - 2, mny - 2, mxx + 2, mxy + 2);
      }
    }
    function crumble(c0, r0, c1, r1, sid) {
      // lone crumbs and 1-2 cell thin hangers left by the blast fall as grains
      var list = [];
      for (var cy = r0; cy <= r1; cy++) for (var cx = c0; cx <= c1; cx++) {
        var i = cy * W + cx; if (mask[i] !== 1 && mask[i] !== 3) continue;
        var below = cy < H - 1 ? mask[i + W] : 1; if (below) continue;
        var nb = (cx > 0 && mask[i - 1] ? 1 : 0) + (cx < W - 1 && mask[i + 1] ? 1 : 0) + (cy > 0 && mask[i - W] ? 1 : 0);
        var thin = cy > 0 && mask[i - W] && (cy < 2 || !mask[i - 2 * W]) && !(cx > 0 && mask[i - 1] && cx < W - 1 && mask[i + 1]);
        if (nb <= 1 || thin) list.push(i);
      }
      // spike tips: 1 cell wide with air left, right and above (they erode pass by pass, so a 1 px column melts from the top)
      for (cy = r0; cy <= r1; cy++) for (cx = c0; cx <= c1; cx++) {
        var k2 = cy * W + cx; if (mask[k2] !== 1 && mask[k2] !== 3) continue;
        if ((cx > 0 && mask[k2 - 1]) || (cx < W - 1 && mask[k2 + 1]) || (cy > 0 && mask[k2 - W])) continue;
        if (cy < H - 1 && mask[k2 + W] && list.indexOf(k2) < 0) { list.push(k2); S.spikes++; }
      }
      for (var j = 0; j < list.length; j++) {
        var k = list[j], x = k % W, y = (k / W) | 0;
        var col = mask[k] === 3 ? sandCol[k] : (function (c) { return (c[0] << 16) | (c[1] << 8) | c[2]; })(baseRGB(k));
        if (burn[k]) { var st = burn[k] / 255 * 0.6, rr = col >> 16, gg = (col >> 8) & 255, bb = col & 255; col = ((rr + (CHAR[0] - rr) * st) << 16) | ((gg + (CHAR[1] - gg) * st) << 8) | (bb + (CHAR[2] - bb) * st); }
        mask[k] = 0; cut[k] = 1; burn[k] = 0; S.crumbled++;
        addGrain((x + 0.5) * cell, (y + 0.5) * cell, (hsh(x, y, sid) - 0.5) * 20 * scaleOf(), 0, col, 1, 1);
      }
      if (list.length) markDirty(c0 - 2, r0 - 2, c1 + 2, r1 + 2);
      return list.length;
    }

    /* ---------- pools: grains (thrown dirt / sand), puffs (fireball, smoke), embers ---------- */
    var GN = Math.max(16, P.grains | 0);
    var gx = new Float32Array(GN), gy = new Float32Array(GN), gvx = new Float32Array(GN), gvy = new Float32Array(GN), gcol = new Uint32Array(GN),
      gsz = new Uint8Array(GN), gon = new Uint8Array(GN), grest = new Float32Array(GN), gsand = new Uint8Array(GN), gseq = new Uint32Array(GN),
      gbx = new Float32Array(GN), gby = new Float32Array(GN), gbr = new Float32Array(GN);
    var gCount = 0, gNext = 0, gSeq = 0;
    function addGrain(x, y, vx, vy, col, size, sand, bx, by, br) {
      var i = -1, n;
      for (n = 0; n < GN; n++) { var j = (gNext + n) % GN; if (!gon[j]) { i = j; break; } }
      if (i < 0) { // recycle the oldest
        var best = 0; for (n = 1; n < GN; n++) if (gseq[n] < gseq[best]) best = n; i = best; S.recycled++; gCount--;
      }
      gNext = (i + 1) % GN;
      gx[i] = x; gy[i] = y; gvx[i] = vx; gvy[i] = vy; gcol[i] = col >>> 0; gsz[i] = size; gon[i] = 1; grest[i] = 0; gsand[i] = sand ? 1 : 0; gseq[i] = ++gSeq; gbx[i] = bx || 0; gby[i] = by || 0; gbr[i] = br || 0;
      gCount++; if (gCount > S.peakGrains) S.peakGrains = gCount;
    }
    var PN = Math.max(8, P.puffs | 0);
    var px_ = new Float32Array(PN), py_ = new Float32Array(PN), pvx = new Float32Array(PN), pvy = new Float32Array(PN), pr = new Float32Array(PN),
      plife = new Float32Array(PN), pdur = new Float32Array(PN), pkind = new Uint8Array(PN), pseed = new Float32Array(PN);
    var pNext = 0;
    function addPuff(x, y, r, vx, vy, dur, kind) {
      var i = pNext; pNext = (pNext + 1) % PN;
      px_[i] = x; py_[i] = y; pr[i] = r; pvx[i] = vx; pvy[i] = vy; plife[i] = 0.0001; pdur[i] = dur; pkind[i] = kind; pseed[i] = rng();
    }
    var EN = Math.max(8, P.embersCap | 0);
    var ex_ = new Float32Array(EN), ey_ = new Float32Array(EN), elife = new Float32Array(EN), edur = new Float32Array(EN), esz = new Float32Array(EN), eph = new Float32Array(EN);
    var eNext = 0;
    function addEmber(x, y, dur) { var i = eNext; eNext = (eNext + 1) % EN; ex_[i] = x; ey_[i] = y; elife[i] = 0.0001; edur[i] = dur; esz[i] = 0.5 + rng() * rng() * 1.6; eph[i] = rng() * 6.283; }

    function keepRects() {
      if (typeof opt.keepOut !== 'function') return null;
      var r = null; try { r = opt.keepOut(); } catch (e) { S.cbErrors++; }
      return r && r.length ? r : null;
    }
    function inRects(rects, x, y, pad) {
      if (!rects) return false;
      for (var i = 0; i < rects.length; i++) { var q = rects[i]; if (q && x >= q.x - pad && x < q.x + q.w + pad && y >= q.y - pad && y < q.y + q.h + pad) return true; }
      return false;
    }
    function settleAt(cx, cy, col, rects, bx, by, br) {
      // sand: slide down while a lower neighbour is free (a little avalanche), then fill the cell
      for (var it = 0; it < 24; it++) {
        if (cy + 1 < H && !cellSolid(cx, cy + 1)) { cy++; continue; }
        var dl = cx > 0 && cy + 1 < H && !cellSolid(cx - 1, cy + 1) && !cellSolid(cx - 1, cy), dr = cx < W - 1 && cy + 1 < H && !cellSolid(cx + 1, cy + 1) && !cellSolid(cx + 1, cy);
        if (dl && dr) { cx += ((cx * 31 + cy * 17 + it) & 1) ? 1 : -1; cy++; continue; }
        if (dl) { cx--; cy++; continue; }
        if (dr) { cx++; cy++; continue; }
        break;
      }
      if (cx < 0 || cx >= W || cy < 0 || cy >= H) return false;
      var i = cy * W + cx; if (mask[i]) return false;
      if (br > 0) { var ddx = (cx + 0.5) * cell - bx, ddy = (cy + 0.5) * cell - by; if (ddx * ddx + ddy * ddy < br * br) return false; }   // never slide back into its own crater
      if (inRects(rects, (cx + 0.5) * cell, (cy + 0.5) * cell, cell * 2)) { S.keepOutSkips++; return false; }
      if (cy + 1 < H && !mask[i + W]) return false;
      mask[i] = 3; sandCol[i] = col; burn[i] = 0; cut[i] = 1; S.settled++;
      markDirty(cx - 2, cy - 2, cx + 2, cy + 2);
      return true;
    }
    function stepWorld(dt) {
      var s = scaleOf(), g = 900 * P.gravity * s, dts = dt / 1000, rects = null, rectsRead = false;
      for (var i = 0; i < GN; i++) {
        if (!gon[i]) continue;
        if (grest[i] > 0) { grest[i] += dt; if (grest[i] > 900) { gon[i] = 0; gCount--; } continue; }
        gvy[i] += g * dts; gvx[i] *= 0.996;
        var nx = gx[i] + gvx[i] * dts, ny = gy[i] + gvy[i] * dts, L = Math.max(Math.abs(nx - gx[i]), Math.abs(ny - gy[i]));
        var n = Math.max(1, Math.ceil(L / cell)), sx = (nx - gx[i]) / n, sy = (ny - gy[i]) / n, hit = false;
        for (var k = 0; k < n; k++) {
          var tx = gx[i] + sx, ty = gy[i] + sy;
          if (cellSolid(Math.floor(tx / cell), Math.floor(ty / cell))) { hit = true; break; }
          gx[i] = tx; gy[i] = ty;
        }
        if (gx[i] < -40 || gx[i] > WW + 40 || gy[i] > WH + 40) { gon[i] = 0; gCount--; continue; }
        if (!hit) continue;
        var down = gvy[i] > 0 && cellSolid(Math.floor(gx[i] / cell), Math.floor((gy[i] + cell) / cell));
        if (down) {
          if (!rectsRead) { rects = keepRects(); rectsRead = true; }
          var ddx = gx[i] - gbx[i], ddy = gy[i] - gby[i];
          var want = gsand[i] || (hsh(i, gseq[i], seed + 5) < P.settle && ddx * ddx + ddy * ddy > gbr[i] * gbr[i]);   // never refill its own crater
          if (want && settleAt(Math.floor(gx[i] / cell), Math.floor(gy[i] / cell), gcol[i], rects, gbx[i], gby[i], gsand[i] ? 0 : gbr[i] * 1.25)) { gon[i] = 0; gCount--; continue; }
          if (Math.abs(gvy[i]) > 120 * s && !gsand[i]) { gvy[i] *= -0.25; gvx[i] *= 0.5; }
          else { grest[i] = 0.0001; gvx[i] = gvy[i] = 0; gy[i] = Math.floor(gy[i] / cell) * cell + cell * 0.5; }
        } else { gvx[i] *= -0.3; if (gvy[i] < 0) gvy[i] = 0; }
      }
      for (var p = 0; p < PN; p++) {
        if (!(plife[p] > 0)) continue;
        plife[p] += dt; if (plife[p] >= pdur[p]) { plife[p] = 0; continue; }
        px_[p] += pvx[p] * dts; py_[p] += pvy[p] * dts; pvx[p] *= 0.97; pvy[p] = pvy[p] * 0.97 - 6 * s * dts;
      }
      for (var e = 0; e < EN; e++) { if (!(elife[e] > 0)) continue; elife[e] += dt; if (elife[e] >= edur[e]) elife[e] = 0; }
      if (shakeA > 0) { shakeT += dt; if (shakeT >= shakeD) { shakeA = 0; shakeX = shakeY = 0; } else { var f = shakeA * (1 - shakeT / shakeD); shakeX = Math.sin(time * 0.09 + 1.3) * f; shakeY = Math.cos(time * 0.113) * f * 0.7; } }
    }
    function update(dtMs) {
      try {
        if (!(dtMs > 0)) { S.frozen++; return; }
        S.updates++;
        acc += Math.min(250, +dtMs);
        while (acc >= STEP - 1e-9) { acc -= STEP; time += STEP; stepWorld(STEP); }
      } catch (e) { S.updErrors++; }
    }

    /* ---------- drawing ---------- */
    function viewRect(ctx, camX, camY) {
      var m = ctx.getTransform ? ctx.getTransform() : { a: 1, d: 1, e: 0, f: 0 }, a = Math.abs(m.a) || 1, d = Math.abs(m.d) || 1;
      var cw = (ctx.canvas && ctx.canvas.width) || 640, chh = (ctx.canvas && ctx.canvas.height) || 360;
      var x0 = (0 - m.e) / a + camX, y0 = (0 - m.f) / d + camY;
      return { x0: x0, y0: y0, x1: x0 + cw / a, y1: y0 + chh / d, m: m, a: a };
    }
    function draw(ctx, camX, camY) {
      try {
        if (!ctx || typeof ctx.drawImage !== 'function') { S.badInput++; return; }
        camX = num(camX, 0); camY = num(camY, 0);
        S.draws++; drawSeq++;
        var v = viewRect(ctx, camX, camY), mode = modeFor(ctx), ds = mode === 'pixel' ? 1 : Math.min(P.maxScale, v.a);
        var k0 = Math.max(0, Math.floor(v.x0 / cell / CH)), k1 = Math.min(NCX - 1, Math.floor(v.x1 / cell / CH));
        var j0 = Math.max(0, Math.floor(v.y0 / cell / CH)), j1 = Math.min(NCY - 1, Math.floor(v.y1 / cell / CH));
        var m = v.m;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = mode !== 'pixel';
        for (var j = j0; j <= j1; j++) for (var i = k0; i <= k1; i++) {
          var ch = getChunk(i, j, mode, ds); if (!ch || !ch.cv) continue;
          var wx = i * CH * cell - camX, wy = j * CH * cell - camY, cw = Math.min(CH, W - i * CH) * cell, chh = Math.min(CH, H - j * CH) * cell;
          var X0 = Math.round(m.a * wx + m.e), Y0 = Math.round(m.d * wy + m.f), X1 = Math.round(m.a * (wx + cw) + m.e), Y1 = Math.round(m.d * (wy + chh) + m.f);
          var ov = mode === 'pixel' ? 0 : 1;   // smooth: overlap the next chunk by 1 device px (no seam where scaled edges blend)
          ctx.drawImage(ch.cv, X0, Y0, X1 - X0 + (i < NCX - 1 ? ov : 0), Y1 - Y0 + (j < NCY - 1 ? ov : 0));
        }
        ctx.restore();
        // embers glow on the rim (part of the ground layer)
        drawEmbers(ctx, camX, camY, mode);
      } catch (e) { S.drawErrors++; try { ctx.restore(); } catch (e2) { } }
    }
    var spriteCache = {};
    function puffSprite(kind, mode, tone) {
      var key = kind + mode + tone; if (spriteCache[key]) return spriteCache[key];
      var R = 32, c = mkCanvas(R * 2, R * 2); if (!c) return null;
      var g = c.getContext('2d');
      if (mode === 'pixel') {
        // a pixel disc with a lit top-left and a dithered edge
        var id = g.createImageData(R * 2, R * 2), d = id.data;
        for (var y = 0; y < R * 2; y++) for (var x = 0; x < R * 2; x++) {
          var dx = (x + 0.5 - R) / R, dy = (y + 0.5 - R) / R, rr = Math.sqrt(dx * dx + dy * dy), q = (y * R * 2 + x) * 4;
          var edge = rr + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.18; if (edge > 1) continue;
          var lit = -dx * 0.5 - dy * 0.7, col;
          if (kind === 2) col = rr < 0.42 ? [255, 250, 220] : rr < 0.66 ? [255, 214, 92] : rr < 0.86 ? [244, 128, 40] : [190, 58, 28];
          else { var b2 = tone + (lit > 0.25 ? 26 : lit < -0.3 ? -22 : 0); col = [b2, b2 - 4, b2 - 10]; }
          d[q] = col[0]; d[q + 1] = col[1]; d[q + 2] = col[2]; d[q + 3] = 255;
        }
        g.putImageData(id, 0, 0);
      } else {
        var gr = g.createRadialGradient(R * 0.85, R * 0.8, 0, R, R, R);
        if (kind === 2) { gr.addColorStop(0, 'rgba(255,252,230,1)'); gr.addColorStop(0.3, 'rgba(255,214,110,0.95)'); gr.addColorStop(0.62, 'rgba(240,120,40,0.75)'); gr.addColorStop(1, 'rgba(160,40,20,0)'); }
        else { var tt = tone; gr.addColorStop(0, 'rgba(' + (tt + 30) + ',' + (tt + 26) + ',' + (tt + 20) + ',0.9)'); gr.addColorStop(0.55, 'rgba(' + tt + ',' + (tt - 4) + ',' + (tt - 10) + ',0.55)'); gr.addColorStop(1, 'rgba(' + tt + ',' + (tt - 4) + ',' + (tt - 10) + ',0)'); }
        g.fillStyle = gr; g.fillRect(0, 0, R * 2, R * 2);
      }
      return (spriteCache[key] = c);
    }
    var GLOW = null;
    function emberGlow() {
      if (GLOW !== null) return GLOW;
      GLOW = mkCanvas(32, 32); if (!GLOW) return (GLOW = false);
      var g = GLOW.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,214,120,0.9)'); gr.addColorStop(0.3, 'rgba(255,130,40,0.45)'); gr.addColorStop(1, 'rgba(200,50,10,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return GLOW;
    }
    function drawEmbers(ctx, camX, camY, mode) {
      var s = scaleOf();
      for (var e = 0; e < EN; e++) {
        if (!(elife[e] > 0)) continue;
        var f = elife[e] / edur[e], heat = 1 - f, x = ex_[e] - camX, y = ey_[e] - camY;
        var r = heat > 0.66 ? 255 : 230, gg = Math.round(60 + 150 * heat * heat), b = Math.round(30 * heat);
        if (mode === 'pixel') {
          var X = Math.floor(x), Y = Math.floor(y), q = Math.max(1, Math.round(cell)), fl = 0.75 + 0.25 * Math.sin(time * 0.02 + eph[e]);
          if (heat > 0.45 && esz[e] > 1) { ctx.fillStyle = 'rgba(255,120,40,' + (0.35 * heat * fl).toFixed(2) + ')'; ctx.fillRect(X - q, Y, q * 3, q); ctx.fillRect(X, Y - q, q, q * 3); }   // a dim pixel glow
          ctx.fillStyle = 'rgba(' + r + ',' + gg + ',' + b + ',' + ((0.35 + 0.65 * heat) * fl).toFixed(2) + ')';
          ctx.fillRect(X, Y, q, q);
        } else {
          var gs = emberGlow(), fl2 = 0.7 + 0.3 * Math.sin(time * 0.017 + eph[e]), R0 = (2.2 + 2.6 * esz[e]) * s * (0.6 + 0.4 * heat);
          if (gs) { ctx.globalAlpha = heat * 0.8 * fl2; ctx.drawImage(gs, x - R0, y - R0, R0 * 2, R0 * 2); }
          ctx.globalAlpha = (0.4 + 0.6 * heat) * fl2; ctx.fillStyle = 'rgb(' + r + ',' + gg + ',' + b + ')';
          ctx.beginPath(); ctx.arc(x, y, (0.45 + 0.5 * esz[e]) * s, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
        }
      }
    }
    function shade(c, k) { return 'rgb(' + Math.min(255, Math.round((c >> 16) * k)) + ',' + Math.min(255, Math.round(((c >> 8) & 255) * k)) + ',' + Math.min(255, Math.round((c & 255) * k)) + ')'; }
    function drawFx(ctx, camX, camY) {
      try {
        if (!ctx || typeof ctx.drawImage !== 'function') { S.badInput++; return; }
        camX = num(camX, 0); camY = num(camY, 0); S.fxDraws++;
        var mode = modeFor(ctx), pix = mode === 'pixel', s = scaleOf();
        ctx.save();
        ctx.imageSmoothingEnabled = !pix;
        // smoke behind, fireballs in front
        for (var pass = 1; pass <= 2; pass++) for (var p = 0; p < PN; p++) {
          if (!(plife[p] > 0) || pkind[p] !== pass) continue;
          var f = plife[p] / pdur[p], x = px_[p] - camX, y = py_[p] - camY, rr, al;
          if (pass === 2) { rr = pr[p] * (0.55 + 0.6 * Math.sqrt(f)) * (f > 0.6 ? 1 - (f - 0.6) * 1.6 : 1); al = f < 0.5 ? 1 : 1 - (f - 0.5) * 2; }
          else { rr = pr[p] * (0.7 + 0.9 * f); al = (f < 0.12 ? f / 0.12 : 1 - (f - 0.12) / 0.88) * 0.85; }
          if (rr <= 0.5 || al <= 0) continue;
          var tone = pass === 1 ? (f < 0.25 ? 88 : 120) : 0;
          var sp = puffSprite(pass, mode, pass === 1 ? (pseed[p] > 0.5 ? 132 : 112) : 0); if (!sp) continue;
          ctx.globalAlpha = pix ? (al > 0.66 ? 1 : al > 0.33 ? 0.66 : 0.33) : al;
          if (pix) { var R2 = Math.max(1, Math.round(rr)); ctx.drawImage(sp, Math.round(x - R2), Math.round(y - R2), R2 * 2, R2 * 2); }
          else ctx.drawImage(sp, x - rr, y - rr, rr * 2, rr * 2);
          if (pass === 1 && tone && !pix && f < 0.2) { ctx.globalAlpha = (0.2 - f) * 2; ctx.drawImage(puffSprite(2, mode, 0), x - rr * 0.6, y - rr * 0.6, rr * 1.2, rr * 1.2); }
        }
        ctx.globalAlpha = 1;
        // grains
        for (var i = 0; i < GN; i++) {
          if (!gon[i]) continue;
          var c = gcol[i], a = grest[i] > 0 ? Math.max(0, 1 - grest[i] / 900) : 1, sz = gsz[i] * cell * (pix ? 1 : 1.25);
          ctx.globalAlpha = pix ? (a > 0.5 ? 1 : 0.5) : a;
          ctx.fillStyle = 'rgb(' + (c >> 16) + ',' + ((c >> 8) & 255) + ',' + (c & 255) + ')';
          var gx2 = gx[i] - camX - sz / 2, gy2 = gy[i] - camY - sz / 2;
          if (pix) {
            var PX0 = Math.round(gx2), PY0 = Math.round(gy2), S0 = Math.max(1, Math.round(sz));
            ctx.fillRect(PX0, PY0, S0, S0);
            if (S0 >= 2) { ctx.fillStyle = shade(c, 1.3); ctx.fillRect(PX0, PY0, 1, 1); ctx.fillStyle = shade(c, 0.6); ctx.fillRect(PX0 + S0 - 1, PY0 + S0 - 1, 1, 1); }
          } else {
            // a small shaded clod: dark underside, body, lit top-left
            var cx3 = gx2 + sz / 2, cy3 = gy2 + sz / 2, rr3 = sz * (0.55 + 0.25 * ((gseq[i] % 7) / 7));
            ctx.fillStyle = shade(c, 0.55); ctx.beginPath(); ctx.arc(cx3 + rr3 * 0.15, cy3 + rr3 * 0.2, rr3, 0, 6.283); ctx.fill();
            ctx.fillStyle = 'rgb(' + (c >> 16) + ',' + ((c >> 8) & 255) + ',' + (c & 255) + ')'; ctx.beginPath(); ctx.arc(cx3, cy3, rr3 * 0.85, 0, 6.283); ctx.fill();
            ctx.fillStyle = shade(c, 1.35); ctx.beginPath(); ctx.arc(cx3 - rr3 * 0.3, cy3 - rr3 * 0.3, rr3 * 0.35, 0, 6.283); ctx.fill();
          }
        }
        ctx.restore();
      } catch (e) { S.drawErrors++; try { ctx.restore(); } catch (e2) { } }
    }

    /* ---------- state, tests ---------- */
    function clear() {
      // back to the original ground, no fx
      reset();
      for (var i = 0; i < GN; i++) gon[i] = 0; gCount = 0;
      for (var p = 0; p < PN; p++) plife[p] = 0;
      for (var e = 0; e < EN; e++) elife[e] = 0;
      shakeA = 0; shakeX = shakeY = 0; shapes.length = 0; events.length = 0;
    }
    function maskHash() { var h = 2166136261 >>> 0; for (var i = 0; i < N; i++) { h ^= mask[i] + (burn[i] << 2); h = Math.imul(h, 16777619) >>> 0; } return h; }
    function hash() {
      var h = maskHash();
      for (var i = 0; i < GN; i++) if (gon[i]) { h ^= Math.round(gx[i] * 16) ^ (Math.round(gy[i] * 16) << 8); h = Math.imul(h, 16777619) >>> 0; }
      for (var p = 0; p < PN; p++) if (plife[p] > 0) { h ^= Math.round(px_[p] * 8) + Math.round(plife[p]); h = Math.imul(h, 16777619) >>> 0; }
      return h >>> 0;
    }
    function stats() {
      var o = {}; for (var k2 in S) o[k2] = S[k2];
      o.grains = gCount; o.chunks = chunkCount; o.cells = N; o.w = W; o.h = H; o.cell = cell; o.time = Math.round(time);
      var pf = 0; for (var p = 0; p < PN; p++) if (plife[p] > 0) pf++; o.puffs = pf;
      var em = 0; for (var e = 0; e < EN; e++) if (elife[e] > 0) em++; o.embers = em;
      return o;
    }
    function setParams(o) { if (!o) return; for (var k2 in o) if (k2 in DEFAULTS && k2 !== 'chunk' && k2 !== 'grains' && k2 !== 'puffs' && k2 !== 'embersCap') P[k2] = typeof DEFAULTS[k2] === 'string' ? String(o[k2]) : num(o[k2], P[k2]); if ('render' in o || 'maxScale' in o) for (var c in chunks) { dropChunk(chunks[c]); } chunkCount = 0; }

    reset();

    var api = {
      version: VERSION,
      solid: solid, moveX: moveX, moveY: moveY, groundY: groundY, fall: fall, overlaps: overlaps, resolve: resolve, audit: audit, protect: protect,
      blast: blast,
      carve: function (x, y, r, o) { o = o || {}; o.fx = 0; var sv = P.crumble; P.crumble = num(o.crumble, 0); var res = blast(x, y, r, o); P.crumble = sv; return res; },
      update: update, draw: draw, drawFx: drawFx,
      shake: function () { return { x: shakeX, y: shakeY }; },
      clear: clear, reset: clear,
      setParams: setParams, params: function () { var o = {}; for (var k2 in P) o[k2] = P[k2]; return o; },
      stats: stats, hash: hash, maskHash: maskHash,
      events: function () { return events.slice(); },
      shapes: function () { return shapes.slice(); },
      cellAt: function (x, y) { var c = Math.floor(x / cell), r = Math.floor(y / cell); if (c < 0 || r < 0 || c >= W || r >= H) return -1; return mask[r * W + c]; },
      size: function () { return { w: WW, h: WH, cols: W, rows: H, cell: cell }; },
      grains: function () { var out = []; for (var i = 0; i < GN; i++) if (gon[i]) out.push({ x: gx[i], y: gy[i], rest: grest[i] > 0 }); return out; },
      // tests: the raw arrays, and a full or incremental compose of one chunk
      _cells: function () { return { mask: mask, orig: orig, cut: cut, burn: burn, sand: sandCol, W: W, H: H, cell: cell, CH: CH }; },
      _composePixels: composePixels,
      _chunk: function (cx, cy) { return chunks[cy * NCX + cx] || null; },
      _rebuild: function (cx, cy, mode, ds) { var ch = chunks[cy * NCX + cx]; if (!ch) ch = chunks[cy * NCX + cx] = { cx: cx, cy: cy, cv: null }; if (ch.cv) { dropChunk(ch); chunkCount--; } var okb = buildChunk(ch, mode, ds); if (okb) chunkCount++; return ch; },
      _patch: function (cx, cy) { var ch = chunks[cy * NCX + cx]; if (ch && ch.cv && ch.dirty) patchChunk(ch); return ch; }
    };
    return api;
  }

  root.GameDNA_PixelTerrain = {
    version: VERSION, create: create, defaults: DEFAULTS, themes: Object.keys(THEMES), shapeRadius: shapeRadius, shapeEdge: shapeEdge,
    _canvasFactory: function (f) { if (typeof f === 'function') canvasFactory = f; }
  };
})(typeof window !== 'undefined' ? window : this);
