/* E-14 ik-creatures demo scene (demo page only, not part of the module): a mossy hollow at dusk, drawn in code.
 * Design units 640 x 360 (HD native); the pixel view uses the same scene at 320 x 180 (s = 0.5), quantised to a fixed palette.
 *   IKScene.ground(x)            ground line y (design units) at x
 *   IKScene.material(x)          'stone' | 'soil' | 'sand'
 *   IKScene.bake(W, H, k, s, pixel)   -> canvas (device px) with sky, hills, trees, terrain, grass, mushrooms (static)
 *   IKScene.fx(ctx, tMs, s, pixel)    animated light shafts, spores, mushroom glow (native units, after the creatures)
 *   IKScene.front(ctx, s, pixel)      dark foreground leaves (native units, last)
 * ASCII only. */
(function (root) {
  'use strict';
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function hsh(x, y, s) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
  function vn(x, y, s) { var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = hsh(i, j, s), b = hsh(i + 1, j, s), c = hsh(i, j + 1, s), d = hsh(i + 1, j + 1, s); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }
  function fbm(x, y, s) { return vn(x, y, s) * 0.55 + vn(x * 2.1, y * 2.1, s + 7) * 0.3 + vn(x * 4.3, y * 4.3, s + 13) * 0.15; }
  function hex(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  // ---------------------------------------------------------------- terrain (design units)
  var BOULDER = { x0: 72, x1: 182, c: 127, h: 44 };
  var LEDGE = 250, SLOPE0 = 410, SLOPE1 = 500;
  function ground(x) {
    var base = 286 + 2.6 * Math.sin(x / 37) + 1.6 * Math.sin(x / 13 + 1);
    var b = Math.abs(x - BOULDER.c) / ((BOULDER.x1 - BOULDER.x0) / 2);
    if (b < 1) base -= BOULDER.h * Math.pow(1 - b * b, 0.62);
    var plateau = 261 + 1.8 * Math.sin(x / 23 + 2) + 1.2 * Math.sin(x / 9);
    var sand = 298 + 1.4 * Math.sin(x / 19);
    var up = sstep(LEDGE - 5, LEDGE + 5, x), down = sstep(SLOPE0, SLOPE1, x);
    var g = base + (plateau - base) * up;
    return g + (sand - g) * down;
  }
  function material(x, y) {
    if (y != null) { var bx = (x - BOULDER.c) / 57, by = (y - 292) / 50; if (bx * bx + by * by < 1) return 'stone'; }
    else if (Math.abs(x - BOULDER.c) < (BOULDER.x1 - BOULDER.x0) / 2 - 6) return 'stone';
    if (x > SLOPE1 - 6 + (y != null ? (y - ground(x)) * 0.8 + 6 * fbm(y * 0.2, 3, 5) : 0)) return 'sand';
    return 'soil';
  }

  // palette for the pixel view (every pixel of the baked scene snaps to its nearest entry)
  var PIXPAL = ['#0b0d18', '#141a2a', '#1d2638', '#26344a', '#33465c', '#4a5e70', '#6a7a86', '#8f9a9c',
    '#2a1e2c', '#3d2a32', '#55393a', '#6e4c42', '#8a6450', '#a8805e', '#c8a070', '#e4c48c',
    '#1c2a1c', '#24402a', '#2e5a32', '#3e7838', '#5a963c', '#86b446', '#b4d25a', '#e8f08a',
    '#3a2a4a', '#5a3a5c', '#8a4c62', '#c06a5e', '#e8925a', '#f8be6a', '#fde4a0', '#fff6d8',
    '#2a3a3a', '#3a5450', '#4e7068', '#5a7e8a', '#7aa0a8', '#a8c8c4', '#d0bca0', '#b09878',
    '#2e2a40', '#3e3850', '#524862', '#2f3654', '#4a4466', '#6a5a74', '#8a6878', '#b07a70', '#d98d64', '#9a6e74', '#7a5866'].map(hex);
  function snap(c) { var best = 0, bd = 1e9; for (var i = 0; i < PIXPAL.length; i++) { var p = PIXPAL[i], d = (p[0] - c[0]) * (p[0] - c[0]) * 0.8 + (p[1] - c[1]) * (p[1] - c[1]) + (p[2] - c[2]) * (p[2] - c[2]) * 0.7; if (d < bd) { bd = d; best = i; } } return PIXPAL[best]; }

  // pixel view: sky, sun glow and ridges computed per pixel and snapped (canvas gradients dither into dotted rows)
  function pixelBackdrop(g, W, H, u) {
    var img = g.createImageData(W, H), D = img.data;
    var stops = [[0, hex('#141a33')], [0.45, hex('#2f3654')], [0.72, hex('#7a5a6a')], [0.9, hex('#d98d64')], [1, hex('#d98d64')]];
    function skyAt(t) { for (var i = 0; i < stops.length - 1; i++) if (t <= stops[i + 1][0]) return mix(stops[i][1], stops[i + 1][1], (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])); return stops[stops.length - 1][1]; }
    var R = [[205, 70, 0.012, 3, hex('#4a4a6a'), hex('#9a6e74')], [232, 60, 0.02, 9, hex('#33354f'), hex('#7a5866')]];
    for (var px = 0; px < W; px++) {
      var x = (px + 0.5) / u, tops = R.map(function (r) { return r[0] - r[1] * fbm(x * r[2], r[3], r[3]); });
      for (var py = 0; py < H; py++) {
        var y = (py + 0.5) / u, c = skyAt(py / H);
        var dx = x - 520, dy = y - 228, d = Math.sqrt(dx * dx + dy * dy) / 260, glow = d < 0.18 ? 0.95 - (0.5 * d / 0.18) : Math.max(0, 0.45 * (1 - (d - 0.18) / 0.82));
        c = mix(c, [255, 190, 130], glow * 0.7);
        for (var k = 0; k < 2; k++) if (y >= tops[k]) { var r = R[k]; c = mix(r[4], r[5], clamp((y - (r[0] - r[1])) / (r[1] + 60), 0, 1)); }
        c = snap(c); var o = (py * W + px) * 4; D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }
  function pixelFog(g, W, H, u) {
    var img = g.getImageData(0, 0, W, H), D = img.data;
    for (var py = Math.floor(200 * u); py < Math.min(H, Math.ceil(300 * u)); py++) {
      var a = 0.55 * ((py + 0.5) / u - 200) / 100;
      for (var px = 0; px < W; px++) { var o = (py * W + px) * 4, c = snap(mix([D[o], D[o + 1], D[o + 2]], [190, 130, 120], a)); D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; }
    }
    g.putImageData(img, 0, 0);
  }

  // ---------------------------------------------------------------- static bake
  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function bake(W, H, k, s, pixel) {
    // W, H device px; k device px per native px; s native px per design unit
    var cv = mk(W, H), g = cv.getContext('2d'), u = k * s;   // u = device px per design unit
    // sky: deep dusk blue at the top, warm glow low on the right (the rim light comes from there)
    if (pixel) pixelBackdrop(g, W, H, u); else {
    var sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#141a33'); sky.addColorStop(0.45, '#2f3654'); sky.addColorStop(0.72, '#7a5a6a'); sky.addColorStop(0.9, '#d98d64');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    var sun = g.createRadialGradient(520 * u, 228 * u, 4 * u, 520 * u, 228 * u, 260 * u);
    sun.addColorStop(0, 'rgba(255,214,150,0.95)'); sun.addColorStop(0.18, 'rgba(255,170,110,0.45)'); sun.addColorStop(1, 'rgba(255,140,100,0)');
    g.fillStyle = sun; g.fillRect(0, 0, W, H);
    // far ridges with atmospheric haze
    function ridge(y0, amp, f, seed, col, haze) {
      var gr = g.createLinearGradient(0, (y0 - amp) * u, 0, (y0 + 60) * u); gr.addColorStop(0, col); gr.addColorStop(1, haze);
      g.fillStyle = gr;
      if (pixel) { for (var px0 = 0; px0 < W; px0++) { var yy = Math.round((y0 - amp * fbm((px0 + 0.5) / u * f, seed, seed)) * u); g.fillRect(px0, yy, 1, H - yy); } return; }
      g.beginPath(); g.moveTo(0, H);
      for (var x = 0; x <= 640; x += 2) { var y = y0 - amp * fbm(x * f, seed, seed); g.lineTo(x * u, y * u); }
      g.lineTo(W, H); g.closePath(); g.fill();
    }
    ridge(205, 70, 0.012, 3, '#4a4a6a', '#9a6e74');
    ridge(232, 60, 0.02, 9, '#33354f', '#7a5866');
    }
    // mid forest: trunks and canopies as soft dark silhouettes
    for (var i = 0; i < 14; i++) {
      var tx = (i * 53 + hsh(i, 1, 4) * 30) % 660 - 10, tw = 5 + hsh(i, 2, 4) * 7, top = 60 + hsh(i, 3, 4) * 60;
      var col = i % 2 ? '#25263c' : '#2c2c44';
      g.fillStyle = col; g.fillRect((tx - tw / 2) * u, top * u, tw * u, (300 - top) * u);
      for (var bl = 0; bl < 7; bl++) {
        var bx = tx + (hsh(i, bl, 5) - 0.5) * 54, by = top + (hsh(i, bl, 6) - 0.2) * 34, br = 14 + hsh(i, bl, 7) * 18;
        var lg = g.createRadialGradient((bx + br * 0.45) * u, (by - br * 0.3) * u, br * 0.1 * u, bx * u, by * u, br * u);
        lg.addColorStop(0, i % 2 ? '#4a4258' : '#544a5e'); lg.addColorStop(0.7, col); lg.addColorStop(1, col);
        g.fillStyle = pixel ? col : lg; g.beginPath();
        for (var lf = 0; lf < 14; lf++) { var a = lf / 14 * Math.PI * 2, rr = br * (0.82 + 0.25 * hsh(i * 7 + bl, lf, 9)); var lx = bx + Math.cos(a) * rr * 0.78, ly = by + Math.sin(a) * rr * 0.78, lr = br * 0.32; g.moveTo((lx + lr) * u, ly * u); g.arc(lx * u, ly * u, lr * u, 0, Math.PI * 2); }
        g.moveTo((bx + br * 0.8) * u, by * u); g.arc(bx * u, by * u, br * 0.8 * u, 0, Math.PI * 2);
        g.fill();
        if (pixel) { g.fillStyle = i % 2 ? '#3e3850' : '#524862'; g.beginPath(); g.arc((bx + br * 0.35) * u, (by - br * 0.35) * u, br * 0.42 * u, 0, Math.PI * 2); g.fill(); }
      }
      g.fillStyle = col;
    }
    // ground fog over the forest feet
    var fog = g.createLinearGradient(0, 200 * u, 0, 300 * u); fog.addColorStop(0, 'rgba(160,110,120,0)'); fog.addColorStop(1, 'rgba(190,130,120,0.55)');
    if (pixel) pixelFog(g, W, H, u); else { g.fillStyle = fog; g.fillRect(0, 200 * u, W, 100 * u); }
    // hanging roots from the top edge (frames the hollow)
    g.strokeStyle = '#151626'; g.lineCap = 'round';
    for (var r = 0; r < 9; r++) {
      var rx = 20 + r * 75 + hsh(r, 1, 8) * 30, rl = 30 + hsh(r, 2, 8) * 60;
      g.lineWidth = (2 + hsh(r, 3, 8) * 3) * u; g.beginPath(); g.moveTo(rx * u, 0);
      g.bezierCurveTo((rx + 8) * u, rl * 0.4 * u, (rx - 10) * u, rl * 0.7 * u, (rx + 3) * u, rl * u); g.stroke();
    }
    g.fillStyle = '#151626'; g.beginPath(); g.moveTo(0, 0);
    for (var cx = 0; cx <= 640; cx += 4) g.lineTo(cx * u, (6 + 10 * fbm(cx * 0.03, 1, 21)) * u);
    g.lineTo(W, 0); g.fill();

    // terrain, per device pixel
    var img = g.getImageData(0, 0, W, H), D = img.data;
    var moss = [hex('#1f3a22'), hex('#3c6a2c'), hex('#6e9a38'), hex('#c8d870')];
    var soil = [hex('#1a1216'), hex('#3a2622'), hex('#5a3c2c'), hex('#7a5638')];
    var stone = [hex('#1c1c28'), hex('#3a3c4c'), hex('#5e6270'), hex('#8e909a')];
    var sandC = [hex('#3a2c26'), hex('#7a6048'), hex('#b09068'), hex('#dcc08a')];
    for (var px = 0; px < W; px++) {
      var x = (px + 0.5) / u, gy = ground(x), gyL = ground(x - 1), gyR = ground(x + 1), slope = (gyR - gyL) / 2;
      var y0 = Math.max(0, Math.floor(gy * u) - 1);
      for (var py = y0; py < H; py++) {
        var y = (py + 0.5) / u, d = y - gy;
        var cov = clamp(d * u + 0.5, 0, 1); if (cov <= 0) continue;
        var c, mat = material(x, y);
        var n = fbm(x * 0.06, y * 0.11, 3), nn = vn(x * 0.25, y * 0.25, 5);
        if (mat === 'stone') {
          // a mossy boulder: rounded light from the upper left, cracks, moss cap
          var bx = (x - BOULDER.c) / 55, top = gy, rel = clamp((y - top) / 50, 0, 1);
          var lit = clamp(0.75 - bx * 0.45 - rel * 0.55 + (n - 0.5) * 0.5, 0, 1);
          c = lit < 0.33 ? mix(stone[0], stone[1], lit / 0.33) : lit < 0.66 ? mix(stone[1], stone[2], (lit - 0.33) / 0.33) : mix(stone[2], stone[3], (lit - 0.66) / 0.34);
          var crack = Math.abs(vn(x * 0.09 + y * 0.03, y * 0.16, 11) - 0.5);
          if (crack < 0.025) c = mix(c, stone[0], 0.7);
          var mossDepth = 3 + 5 * fbm(x * 0.08, 1, 17) - Math.abs(slope) * 6;
          if (d < mossDepth) c = mix(moss[1], moss[2], clamp(1 - d / Math.max(1, mossDepth) + (nn - 0.5) * 0.6, 0, 1));
          if (y > 282) c = mix(c, soil[0], sstep(282, 300, y) * 0.7);
        } else if (mat === 'sand') {
          var t2 = clamp(0.8 - d / 50 + (n - 0.5) * 0.35, 0, 1);
          c = t2 < 0.5 ? mix(sandC[0], sandC[1], t2 / 0.5) : mix(sandC[1], sandC[2], (t2 - 0.5) / 0.5);
          if (hsh(Math.floor(x * 0.8), Math.floor(y * 0.8), 9) > 0.96) c = mix(c, sandC[3], 0.35); c = mix(c, sandC[0], clamp((fbm(x * 0.05, y * 0.2, 41) - 0.5) * 0.8, 0, 0.3));
          if (d < 1.4) c = mix(c, sandC[3], 0.7);
        } else {
          // soil with strata, embedded stones, moss lip
          var strata = Math.sin((y + 9 * n) * 0.32 + x * 0.015) * 0.5 + 0.5; strata = strata * strata;
          var t3 = clamp(0.85 - d / 46 + (strata - 0.5) * 0.34 + (n - 0.5) * 0.3, 0, 1);
          c = t3 < 0.5 ? mix(soil[0], soil[1], t3 / 0.5) : mix(soil[1], soil[2], (t3 - 0.5) / 0.5);
          var cs = 11, ci = Math.floor(x / cs), cj = Math.floor(y / cs * 1.4);
          for (var oi = -1; oi <= 1; oi++) for (var oj = -1; oj <= 1; oj++) {
            var ii = ci + oi, jj = cj + oj, hv = hsh(ii, jj, 31); if (hv < 0.8) continue;
            var sx = (ii + 0.2 + hsh(ii, jj, 32) * 0.6) * cs, sy = (jj + 0.2 + hsh(ii, jj, 33) * 0.6) * cs / 1.4, sr = 2.2 + hsh(ii, jj, 34) * 3;
            var ddx = (x - sx) / sr, ddy = (y - sy) / (sr * 0.75), q = ddx * ddx + ddy * ddy;
            if (q < 1 && sy > ground(sx) + 7) { var sl2 = clamp(0.5 - ddx * 0.35 - ddy * 0.5, 0, 1), sc0 = mix(mix(stone[1], soil[2], 0.45), mix(stone[2], soil[3], 0.4), sl2); c = q > 0.7 ? mix(c, soil[0], 0.6) : mix(c, sc0, 0.85); }
          }
          var lip = 4.5 + 3 * fbm(x * 0.07, 2, 19);
          if (d < lip) c = mix(moss[0], moss[2], clamp(1 - d / lip + (nn - 0.5) * 0.7, 0, 1));
          else if (d < lip + 4) c = mix(c, soil[0], 0.55 * (1 - (d - lip) / 4));   // moss overhang shadow
        }
        // backlit rim on the surface edge, warm, stronger on slopes facing the glow
        if (d < 1.1) c = mix(c, moss[3], mat === 'sand' ? 0.25 : 0.55);
        var deep = sstep(330, 370, y); c = mix(c, [10, 8, 14], deep * 0.6);
        if (pixel) c = snap(c);
        var o = (py * W + px) * 4;
        D[o] = D[o] * (1 - cov) + c[0] * cov; D[o + 1] = D[o + 1] * (1 - cov) + c[1] * cov; D[o + 2] = D[o + 2] * (1 - cov) + c[2] * cov; D[o + 3] = 255;
      }
    }
    if (pixel) for (var q2 = 0; q2 < D.length; q2 += 4) { var sc = snap([D[q2], D[q2 + 1], D[q2 + 2]]); D[q2] = sc[0]; D[q2 + 1] = sc[1]; D[q2 + 2] = sc[2]; }
    g.putImageData(img, 0, 0);
    // grass blades and ferns on the moss (not on the sand)
    g.lineCap = 'round';
    for (var gx = 0; gx < 640; gx += pixel ? 2 / s : 2.2) {
      var m = material(gx); if (m === 'sand' && hsh(gx | 0, 7, 3) > 0.15) continue;
      if (hsh(Math.floor(gx * 3), 1, 41) < 0.35) continue;
      var gy2 = ground(gx) + 1.5, hgt = 3 + hsh(Math.floor(gx * 3), 2, 41) * (m === 'stone' ? 4 : 7), lean = (hsh(Math.floor(gx * 3), 3, 41) - 0.4) * 4;
      var gc = hsh(Math.floor(gx * 3), 4, 41) > 0.5 ? '#5f8f34' : '#86ac44';
      if (pixel) { g.fillStyle = gc; var steps = Math.round(hgt * s); for (var st = 0; st < steps; st++) g.fillRect(Math.round((gx + lean * st / Math.max(1, steps)) * s) * k, Math.round(gy2 * s - st - 1) * k, k, k); continue; }
      g.strokeStyle = gc; g.lineWidth = 1.1 * u;
      g.beginPath(); g.moveTo(gx * u, gy2 * u); g.quadraticCurveTo((gx + lean * 0.3) * u, (gy2 - hgt * 0.6) * u, (gx + lean) * u, (gy2 - hgt) * u); g.stroke();
    }
    // glowing mushrooms (static caps; the glow pulses in fx)
    MUSH.forEach(function (mm) {
      var mx = mm[0], my = ground(mx) + 1, sz = mm[1];
      if (pixel) {
        var X = Math.round(mx * s), Y = Math.round(my * s), R = Math.max(2, Math.round(sz * s));
        g.fillStyle = '#d8d0c0'; g.fillRect(X * k, (Y - R - 1) * k, k, (R + 1) * k);
        for (var dx = -R; dx <= R; dx++) { var hh = Math.round(Math.sqrt(R * R - dx * dx) * 0.6); g.fillStyle = dx < 0 ? '#5af8e0' : '#2ab0b0'; g.fillRect((X + dx) * k, (Y - R - 1 - hh) * k, k, (hh + 1) * k); }
        g.fillStyle = '#c8fff4'; g.fillRect((X - 1) * k, (Y - R - 1 - Math.round(R * 0.5)) * k, k, k);
        return;
      }
      g.fillStyle = '#d6cfc2'; g.fillRect((mx - sz * 0.15) * u, (my - sz * 1.3) * u, sz * 0.3 * u, sz * 1.3 * u);
      var cg = g.createRadialGradient((mx - sz * 0.3) * u, (my - sz * 1.6) * u, 0, mx * u, (my - sz * 1.3) * u, sz * u);
      cg.addColorStop(0, '#d8fff6'); cg.addColorStop(0.45, '#5af0dc'); cg.addColorStop(1, '#1a7a80');
      g.fillStyle = cg; g.beginPath(); g.ellipse(mx * u, (my - sz * 1.3) * u, sz * u, sz * 0.62 * u, 0, Math.PI, 0); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(8,30,40,0.8)'; g.lineWidth = 0.8 * u; g.stroke();
    });
    return cv;
  }
  var MUSH = [[38, 4], [46, 2.6], [212, 3.4], [274, 4.2], [283, 2.8], [418, 3.2], [600, 3.6], [611, 2.4]];

  // ---------------------------------------------------------------- animated light (native units)
  function fx(g, tMs, s, pixel) {
    var t = tMs / 1000;
    g.save();
    // light shafts from the canopy gap, slowly breathing
    if (!pixel) {
      g.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 4; i++) {
        var x0 = (330 + i * 70) * s, a = 0.05 + 0.025 * Math.sin(t * 0.7 + i * 1.7);
        var gr = g.createLinearGradient(x0, 0, x0 - 140 * s, 300 * s); gr.addColorStop(0, 'rgba(255,200,140,' + a + ')'); gr.addColorStop(1, 'rgba(255,170,120,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + 26 * s, 0); g.lineTo(x0 - 110 * s, 300 * s); g.lineTo(x0 - 170 * s, 300 * s); g.closePath(); g.fill();
      }
      // mushroom glow
      MUSH.forEach(function (m, j) {
        var mx = m[0] * s, my = (ground(m[0]) - m[1] * 1.3) * s, r = m[1] * 5 * s * (1 + 0.12 * Math.sin(t * 2 + j));
        var rg = g.createRadialGradient(mx, my, 0, mx, my, r); rg.addColorStop(0, 'rgba(90,240,220,0.35)'); rg.addColorStop(1, 'rgba(90,240,220,0)');
        g.fillStyle = rg; g.fillRect(mx - r, my - r, r * 2, r * 2);
      });
    }
    // drifting spores
    for (var k = 0; k < 26; k++) {
      var sx = ((k * 97.3 + t * (6 + (k % 5) * 2)) % 680) - 20, sy = 90 + ((k * 53.1) % 190) + Math.sin(t * 0.9 + k) * 8;
      var al = 0.35 + 0.3 * Math.sin(t * 1.7 + k * 2.1);
      if (pixel) { g.globalAlpha = al > 0.4 ? 0.9 : 0.5; g.fillStyle = k % 3 ? '#fde4a0' : '#5af8e0'; g.fillRect(Math.round(sx * s), Math.round(sy * s), 1, 1); }
      else { g.globalAlpha = al; g.fillStyle = k % 3 ? '#ffe6b0' : '#8afcec'; g.beginPath(); g.arc(sx * s, sy * s, (0.8 + (k % 3) * 0.4) * s * 2, 0, Math.PI * 2); g.fill(); }
    }
    g.restore();
  }
  // a firefly (the creatures' target): glow + core
  function firefly(g, x, y, tMs, s, pixel) {
    var t = tMs / 1000, pul = 0.8 + 0.2 * Math.sin(t * 9);
    g.save();
    if (pixel) {
      var X = Math.round(x), Y = Math.round(y);
      g.globalAlpha = 0.45; g.fillStyle = '#f8be6a'; g.fillRect(X - 2, Y - 1, 5, 3); g.fillRect(X - 1, Y - 2, 3, 5);
      g.globalAlpha = 1; g.fillStyle = '#fff6d8'; g.fillRect(X, Y, 1, 1); g.fillRect(X - 1, Y, 1, 1);
    } else {
      g.globalCompositeOperation = 'lighter';
      var r = 26 * s * pul, rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(255,230,150,0.9)'); rg.addColorStop(0.25, 'rgba(255,190,90,0.35)'); rg.addColorStop(1, 'rgba(255,160,60,0)');
      g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
      g.globalCompositeOperation = 'source-over';
      var wf = Math.sin(t * 60) * 0.5 + 0.5;
      g.fillStyle = 'rgba(220,235,255,0.55)';
      g.beginPath(); g.ellipse(x - 2.2 * s, y - 2.4 * s, 2.6 * s, (1 + wf) * s, -0.6, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(x + 1.6 * s, y - 2.6 * s, 2.6 * s, (1 + wf) * s, 0.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a2a1a'; g.beginPath(); g.ellipse(x - 1.2 * s, y, 2.2 * s, 1.5 * s, 0.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff4c0'; g.beginPath(); g.arc(x + 1.4 * s, y + 0.3 * s, 1.7 * s, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  // dark foreground leaves in the bottom corners (frames the scene, never over the creatures' paths)
  function front(g, s, pixel) {
    g.save(); g.fillStyle = '#0c0d16';
    var leaves = [[-6, 372, 0.5, 70], [22, 368, 0.9, 56], [628, 372, -0.4, 66], [600, 370, -0.9, 50]];
    leaves.forEach(function (L) {
      var x = L[0] * s, y = L[1] * s, a = L[2], l = L[3] * s;
      g.beginPath(); g.moveTo(x, y);
      var tx = x + Math.sin(a) * l, ty = y - Math.cos(a) * l;
      g.quadraticCurveTo(x + Math.sin(a + 0.5) * l * 0.6, y - Math.cos(a + 0.5) * l * 0.6, tx, ty);
      g.quadraticCurveTo(x + Math.sin(a - 0.5) * l * 0.6, y - Math.cos(a - 0.5) * l * 0.6, x, y);
      g.fill();
    });
    g.restore();
  }
  root.IKScene = { ground: ground, material: material, bake: bake, fx: fx, front: front, firefly: firefly, LEDGE: LEDGE, SLOPE0: SLOPE0, SLOPE1: SLOPE1, BOULDER: BOULDER };
})(window);
