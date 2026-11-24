
  /* =================================================================================================
     Art: everything drawn in code. Key light from the upper left; enemies are seen from above and rotate with
     their heading (their light stays fixed on the screen); towers and props are seen three-quarter from the front.
     ================================================================================================= */
  var LX = -0.5, LY = -0.62;                      // light direction (screen), used for highlights and shadows
  function mk(w, h) { if (typeof document === 'undefined') return null; var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function vnoise(x, y, sc, s) { var u = x / sc, v = y / sc, i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); var a = hash(i, j, s), b = hash(i + 1, j, s), c = hash(i, j + 1, s), d = hash(i + 1, j + 1, s); return lerp(lerp(a, b, fx), lerp(c, d, fx), fy); }
  // a radial "ball" fill lit from the screen's upper left, for a shape already pathed in a rotated frame (ang)
  function litFill(g, r, base, light, dark, ang, ox, oy) {
    var ca = Math.cos(-ang), sa = Math.sin(-ang), lx = (LX * ca - LY * sa) * r * 0.55 + (ox || 0), ly = (LX * sa + LY * ca) * r * 0.55 + (oy || 0);
    var gr = g.createRadialGradient(lx, ly, r * 0.05, (ox || 0) - lx * 0.2, (oy || 0) - ly * 0.2, r * 1.25);
    gr.addColorStop(0, light); gr.addColorStop(0.45, base); gr.addColorStop(1, dark);
    g.fillStyle = gr;
  }
  function ell(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, TAU); }
  function shadow(g, x, y, rx, ry, a) { g.save(); g.fillStyle = 'rgba(14,20,10,' + (a == null ? 0.32 : a) + ')'; ell(g, x, y, rx, ry); g.fill(); g.restore(); }
  var OUT = 'rgba(20,14,12,0.9)';

  /* ---------- ground cache (per map, per device scale) ---------- */
  var THEMES = {
    meadow: { g0: '#2f5a2a', g1: '#3d7432', g2: '#4f8c3a', g3: '#6aa448', g4: '#8cc05a', dirt0: '#5c4126', dirt1: '#8a6a40', dirt2: '#b08c58', dirt3: '#cfae76', edge: '#3a2c1a', water0: '#1d4a72', water1: '#2f78a8', water2: '#7cc4e8', sand: '#b8a270' }
  };
  function drawGround(map, sc, th) {
    var W = map.w, H = map.h, c = mk(W * sc, H * sc); if (!c) return null;
    var g = c.getContext('2d'), T = THEMES[th] || THEMES.meadow, i, r, k;
    // 1. soft mottled grass from value noise at half resolution, smoothed up
    var lw = Math.ceil(W / 2), lh = Math.ceil(H / 2), lo = mk(lw, lh), lg = lo.getContext('2d'), id = lg.createImageData(lw, lh), d = id.data;
    var A = rgb(T.g0), B = rgb(T.g1), C2 = rgb(T.g2), D = rgb(T.g3);
    for (var y = 0; y < lh; y++) for (var x = 0; x < lw; x++) {
      var n = vnoise(x, y, 22, 3) * 0.6 + vnoise(x, y, 7, 5) * 0.3 + vnoise(x, y, 2.5, 9) * 0.1, p = (y * lw + x) * 4, col;
      if (n < 0.38) col = [lerp(A[0], B[0], n / 0.38), lerp(A[1], B[1], n / 0.38), lerp(A[2], B[2], n / 0.38)];
      else if (n < 0.62) { var t = (n - 0.38) / 0.24; col = [lerp(B[0], C2[0], t), lerp(B[1], C2[1], t), lerp(B[2], C2[2], t)]; }
      else { var t2 = Math.min(1, (n - 0.62) / 0.3); col = [lerp(C2[0], D[0], t2), lerp(C2[1], D[1], t2), lerp(C2[2], D[2], t2)]; }
      d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
    }
    lg.putImageData(id, 0, 0);
    g.imageSmoothingEnabled = true; g.drawImage(lo, 0, 0, W * sc, H * sc);
    g.scale(sc, sc);
    // 2. grass strokes
    for (i = 0; i < 1500; i++) {
      var gx = hash(i, 1, 41) * W, gy = hash(i, 2, 41) * H, hgt = 2 + hash(i, 3, 41) * 3.5, lean = (hash(i, 4, 41) - 0.5) * 2.4, sh = hash(i, 5, 41);
      g.strokeStyle = sh < 0.5 ? rgba(T.g4, 0.55) : sh < 0.8 ? rgba(T.g0, 0.5) : rgba('#b8d870', 0.45); g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(gx, gy); g.quadraticCurveTo(gx + lean * 0.4, gy - hgt * 0.6, gx + lean, gy - hgt); g.stroke();
    }
    // 3. flowers on ',' cells
    for (r = 0; r < map.rows; r++) for (k = 0; k < map.cols; k++) if (map.grid[r][k] === ',' && !map.road[k + ',' + r]) {
      for (i = 0; i < 7; i++) { var fx = (k + 0.15 + hash(k, r * 9 + i, 77) * 0.7) * CELL, fy = (r + 0.15 + hash(k * 3, r + i, 78) * 0.7) * CELL, fc = ['#f4e6a0', '#f0a8c8', '#ffffff', '#c8b4ff'][(hash(k, r, i) * 4) | 0];
        g.fillStyle = rgba('#1c3018', 0.35); ell(g, fx + 0.6, fy + 0.8, 1.7, 1); g.fill();
        for (var pt = 0; pt < 5; pt++) { var pa = pt / 5 * TAU; g.fillStyle = fc; ell(g, fx + Math.cos(pa) * 1.1, fy + Math.sin(pa) * 1.1, 0.95, 0.95); g.fill(); }
        g.fillStyle = '#e8a030'; ell(g, fx, fy, 0.7, 0.7); g.fill(); }
    }
    // 4. water
    var water = [];
    for (r = 0; r < map.rows; r++) for (k = 0; k < map.cols; k++) if (map.grid[r][k] === 'w') water.push([k, r]);
    if (water.length) {
      // one smooth shape per pond: the water cells shrunk by 9 px, filled and stroked with round joins (no seams)
      var blobFill = function (grow, style) { var m = 9; g.beginPath(); water.forEach(function (w) { g.rect(w[0] * CELL + m, w[1] * CELL + m, CELL - 2 * m, CELL - 2 * m); });
        water.forEach(function (w) { [[1, 0], [0, 1]].forEach(function (q) { if (map.grid[w[1] + q[1]] && map.grid[w[1] + q[1]][w[0] + q[0]] === 'w') g.rect(w[0] * CELL + m, w[1] * CELL + m, CELL * (1 + q[0]) - 2 * m, CELL * (1 + q[1]) - 2 * m); });
          var G = map.grid; if (G[w[1] + 1] && G[w[1]][w[0] + 1] === 'w' && G[w[1] + 1][w[0]] === 'w' && G[w[1] + 1][w[0] + 1] === 'w') g.rect(w[0] * CELL + m, w[1] * CELL + m, 2 * CELL - 2 * m, 2 * CELL - 2 * m); });
        g.fillStyle = style; g.fill(); g.strokeStyle = style; g.lineJoin = 'round'; g.lineWidth = Math.max(0.5, 2 * (m + grow)); g.stroke();
        // an irregular shore: bulges where a water cell meets land
        g.beginPath(); water.forEach(function (w) { [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (q, qi) { var G = map.grid, nb = G[w[1] + q[1]] && G[w[1] + q[1]][w[0] + q[0]]; if (nb === 'w') return;
          for (var b = 0; b < 2; b++) { var hh = hash(w[0] * 7 + qi, w[1] * 5 + b, 93), along = (0.2 + 0.6 * hash(w[0] + qi, w[1] + b, 94)) * CELL, bx = w[0] * CELL + (q[0] ? (q[0] > 0 ? CELL - m : m) : along), by = w[1] * CELL + (q[1] ? (q[1] > 0 ? CELL - m : m) : along), r2 = m + grow - 1 + hh * 4;
            if (r2 > 0) { g.moveTo(bx + q[0] * 2 + r2, by + q[1] * 2); g.arc(bx + q[0] * 2, by + q[1] * 2, r2, 0, TAU); } } }); });
        g.fill(); };
      var blob = function (grow) { var m = 9; g.beginPath(); water.forEach(function (w) { if (g.roundRect) g.roundRect(w[0] * CELL - grow, w[1] * CELL - grow, CELL + 2 * grow, CELL + 2 * grow, m + grow); else g.rect(w[0] * CELL - grow, w[1] * CELL - grow, CELL + 2 * grow, CELL + 2 * grow); }); };
      blobFill(5, rgba('#1a2a14', 0.35));
      blobFill(3, T.sand);
      blobFill(1, mix(T.sand, '#5a4a30', 0.4));
      var wx0 = 1e9, wy0 = 1e9, wx1 = -1e9, wy1 = -1e9; water.forEach(function (w) { wx0 = Math.min(wx0, w[0]); wy0 = Math.min(wy0, w[1]); wx1 = Math.max(wx1, w[0] + 1); wy1 = Math.max(wy1, w[1] + 1); });
      var wg = g.createLinearGradient(0, wy0 * CELL, 0, wy1 * CELL); wg.addColorStop(0, T.water0); wg.addColorStop(1, T.water1);
      blobFill(-1, '#163a5c');
      blobFill(-4, wg);
      g.save(); blob(-1); g.clip();
      for (i = 0; i < 9; i++) { var rx = (wx0 + hash(i, 1, 90) * (wx1 - wx0)) * CELL, ry = (wy0 + hash(i, 2, 90) * (wy1 - wy0)) * CELL; g.strokeStyle = rgba(T.water2, 0.55); g.lineWidth = 0.9; g.beginPath(); g.moveTo(rx - 4, ry); g.quadraticCurveTo(rx, ry - 1.5, rx + 4, ry); g.stroke(); }
      for (i = 0; i < 3; i++) { var lx = (wx0 + 0.3 + hash(i, 5, 91) * (wx1 - wx0 - 0.6)) * CELL, ly = (wy0 + 0.3 + hash(i, 6, 91) * (wy1 - wy0 - 0.6)) * CELL; g.fillStyle = '#4c8a3a'; g.beginPath(); g.moveTo(lx, ly); g.arc(lx, ly, 3.4, 0.4, TAU - 0.2); g.closePath(); g.fill(); g.fillStyle = '#7cb85a'; ell(g, lx - 0.8, ly - 0.8, 1.4, 1); g.fill(); }
      g.restore();
      // reeds along the shore
      water.forEach(function (w, wi) { [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (q, qi) { var G = map.grid, nb = G[w[1] + q[1]] && G[w[1] + q[1]][w[0] + q[0]]; if (nb === 'w' || hash(wi, qi, 95) < 0.45) return;
        var rx = w[0] * CELL + CELL / 2 + q[0] * (CELL / 2 - 4) + (q[1] ? (hash(wi, qi, 96) - 0.5) * 16 : 0), ry = w[1] * CELL + CELL / 2 + q[1] * (CELL / 2 - 4) + (q[0] ? (hash(wi, qi, 97) - 0.5) * 16 : 0);
        for (var k3 = 0; k3 < 5; k3++) { var lx2 = rx + (k3 - 2) * 1.6, lh = 5 + hash(wi * 9 + k3, qi, 98) * 5; g.strokeStyle = k3 % 2 ? '#4e8a36' : '#6aa848'; g.lineWidth = 1; g.beginPath(); g.moveTo(lx2, ry + 2); g.quadraticCurveTo(lx2 + (k3 - 2) * 0.6, ry - lh * 0.5, lx2 + (k3 - 2) * 1.2, ry - lh); g.stroke(); }
        g.fillStyle = '#6a4424'; ell(g, rx + 1, ry - 8, 0.9, 2.2); g.fill(); }); });
    }
    // 5. the road(s)
    map.paths.forEach(function (P) {
      var line = function () { g.beginPath(); P.pts.forEach(function (q, j) { var X = q.x - map.x, Y = q.y - map.y; if (j) g.lineTo(X, Y); else g.moveTo(X, Y); }); };
      g.lineCap = 'round'; g.lineJoin = 'round';
      line(); g.strokeStyle = rgba('#1a2410', 0.4); g.lineWidth = 32; g.stroke();
      line(); g.strokeStyle = T.edge; g.lineWidth = 28; g.stroke();
      line(); g.strokeStyle = T.dirt1; g.lineWidth = 25; g.stroke();
      line(); g.strokeStyle = T.dirt2; g.lineWidth = 17; g.stroke();
      line(); g.strokeStyle = rgba(T.dirt3, 0.55); g.lineWidth = 7; g.stroke();
      // ruts and stones
      [-5.5, 5.5].forEach(function (off) {
        g.beginPath(); P.pts.forEach(function (q, j) { if (j === 0 || j === P.pts.length - 1) return; var a = Math.atan2(P.pts[j + 1].y - P.pts[j - 1].y, P.pts[j + 1].x - P.pts[j - 1].x), X = q.x - map.x - Math.sin(a) * off, Y = q.y - map.y + Math.cos(a) * off; if (j === 1) g.moveTo(X, Y); else g.lineTo(X, Y); });
        g.strokeStyle = rgba(T.dirt0, 0.38); g.lineWidth = 2.2; g.stroke();
      });
      for (var s = 0; s < P.pts.length; s += 9) {
        var q = P.pts[s], h1 = hash(s, 3, 55); if (h1 > 0.55) continue;
        var a2 = hash(s, 4, 55) * TAU, rr2 = 4 + hash(s, 5, 55) * 9, sx = q.x - map.x + Math.cos(a2) * rr2, sy = q.y - map.y + Math.sin(a2) * rr2 * 0.9, sz = 0.8 + hash(s, 6, 55) * 1.4;
        g.fillStyle = rgba('#2a1e10', 0.5); ell(g, sx + 0.5, sy + 0.6, sz, sz * 0.7); g.fill();
        g.fillStyle = h1 < 0.2 ? '#c8b08a' : '#a08860'; ell(g, sx, sy, sz, sz * 0.7); g.fill();
        g.fillStyle = rgba('#fff4d8', 0.5); ell(g, sx - sz * 0.3, sy - sz * 0.3, sz * 0.4, sz * 0.3); g.fill();
      }
      // grass tufts creeping over the road's edge
      for (var e = 0; e < P.pts.length; e += 5) {
        if (hash(e, 9, 61) > 0.5) continue;
        var q2 = P.pts[Math.min(e, P.pts.length - 2)], q3 = P.pts[Math.min(e + 1, P.pts.length - 1)], a3 = Math.atan2(q3.y - q2.y, q3.x - q2.x), side = hash(e, 8, 61) < 0.5 ? -1 : 1, off2 = 12.5 * side;
        var tx = q2.x - map.x - Math.sin(a3) * off2, ty = q2.y - map.y + Math.cos(a3) * off2;
        for (var b = 0; b < 4; b++) { var bl = (hash(e, b, 62) - 0.5) * 3; g.strokeStyle = b % 2 ? T.g3 : T.g2; g.lineWidth = 0.9; g.beginPath(); g.moveTo(tx + bl, ty + 1); g.quadraticCurveTo(tx + bl * 1.4, ty - 2, tx + bl * 2, ty - 3.5 - hash(e, b, 63) * 2); g.stroke(); }
      }
    });
    // 6. soft vignette on the map edges
    var vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(8,14,6,0.32)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    return c;
  }

  /* ---------- standing props (y-sorted with towers and enemies) ---------- */
  function drawTree(g, x, y, s, seed, t) {
    shadow(g, x + 5, y + 2, 15 * s, 6 * s, 0.3);
    g.fillStyle = '#4a2e1a'; g.fillRect(x - 2.4 * s, y - 10 * s, 4.8 * s, 11 * s);
    g.fillStyle = '#6e4628'; g.fillRect(x - 2.4 * s, y - 10 * s, 1.8 * s, 11 * s);
    var sway = Math.sin(t * 1.3 + seed) * 0.6, lobes = [[-7, -16, 9], [7, -17, 9], [0, -24, 10], [-4, -20, 9], [5, -12, 8], [-6, -10, 7]];
    lobes.forEach(function (L) { g.fillStyle = '#1b3a1c'; ell(g, x + (L[0] + sway) * s, y + (L[1] + 1.5) * s, L[2] * s, L[2] * 0.9 * s); g.fill(); });
    lobes.forEach(function (L, i) {
      var cx = x + (L[0] + sway) * s, cy = y + L[1] * s, rr2 = L[2] * s, gr = g.createRadialGradient(cx - rr2 * 0.4, cy - rr2 * 0.5, rr2 * 0.1, cx, cy, rr2 * 1.1);
      gr.addColorStop(0, i === 2 ? '#9ccc5a' : '#86bc4e'); gr.addColorStop(0.55, '#3f7a30'); gr.addColorStop(1, '#244c22'); g.fillStyle = gr; ell(g, cx, cy, rr2, rr2 * 0.88); g.fill();
    });
    for (var i = 0; i < 7; i++) { var a = hash(seed, i, 5) * TAU, rr3 = hash(seed, i, 6) * 13 * s; g.fillStyle = rgba('#c8e88a', 0.55); ell(g, x + Math.cos(a) * rr3 - 3 * s, y - 19 * s + Math.sin(a) * rr3 * 0.7, 1.6 * s, 1.1 * s); g.fill(); }
  }
  function drawRock(g, x, y, s, seed) {
    shadow(g, x + 3, y + 1, 11 * s, 4.5 * s, 0.32);
    g.beginPath(); g.moveTo(x - 10 * s, y + 1); g.lineTo(x - 8 * s, y - 7 * s); g.lineTo(x - 2 * s, y - 12 * s); g.lineTo(x + 6 * s, y - 10 * s); g.lineTo(x + 10 * s, y - 3 * s); g.lineTo(x + 9 * s, y + 1); g.closePath();
    var gr = g.createLinearGradient(x - 8 * s, y - 12 * s, x + 8 * s, y + 2); gr.addColorStop(0, '#c4bcae'); gr.addColorStop(0.5, '#8a8274'); gr.addColorStop(1, '#4e4a44'); g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(30,26,24,0.8)'; g.lineWidth = 0.9; g.stroke();
    g.strokeStyle = 'rgba(40,36,30,0.55)'; g.beginPath(); g.moveTo(x - 2 * s, y - 12 * s); g.lineTo(x + 1 * s, y - 4 * s); g.lineTo(x + 9 * s, y - 3 * s); g.stroke();
    g.fillStyle = '#5e9a40'; ell(g, x - 5 * s, y - 7.5 * s, 3 * s, 1.4 * s); g.fill(); g.fillStyle = '#86c058'; ell(g, x - 5.5 * s, y - 8 * s, 1.6 * s, 0.7 * s); g.fill();
  }
  function drawBush(g, x, y, s, seed) {
    shadow(g, x + 3, y + 1, 11 * s, 4 * s, 0.3);
    [[-5, -5, 6], [5, -5, 6], [0, -9, 7]].forEach(function (L) { var cx = x + L[0] * s, cy = y + L[1] * s, r2 = L[2] * s, gr = g.createRadialGradient(cx - r2 * 0.4, cy - r2 * 0.5, 0.5, cx, cy, r2 * 1.1); gr.addColorStop(0, '#8ec456'); gr.addColorStop(0.6, '#3e7a2e'); gr.addColorStop(1, '#22441c'); g.fillStyle = gr; ell(g, cx, cy, r2, r2 * 0.85); g.fill(); });
    for (var i = 0; i < 5; i++) { g.fillStyle = '#e04a5a'; ell(g, x + (hash(seed, i, 7) - 0.5) * 16 * s, y - 4 * s - hash(seed, i, 8) * 8 * s, 1.3 * s, 1.3 * s); g.fill(); g.fillStyle = 'rgba(255,220,220,0.8)'; ell(g, x + (hash(seed, i, 7) - 0.5) * 16 * s - 0.4, y - 4 * s - hash(seed, i, 8) * 8 * s - 0.4, 0.45 * s, 0.45 * s); g.fill(); }
  }
  // the gate the player defends, at the road's exit (drawn after the enemies that walk into it)
  function drawGate(g, x, y, ang, t, hurt) {
    g.save(); g.translate(x, y); g.scale(1.2, 1.2);
    var side = Math.cos(ang) >= 0 ? 1 : -1;
    shadow(g, 6, 18, 26, 7, 0.35);
    // two round towers and an arch facing the road
    var stone = function (X, Y, w, h, top) {
      var gr = g.createLinearGradient(X, 0, X + w, 0); gr.addColorStop(0, '#d8d0c0'); gr.addColorStop(0.45, '#a69c8a'); gr.addColorStop(1, '#5e574c');
      g.fillStyle = gr; g.fillRect(X, Y, w, h); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(X, Y, w, h);
      g.strokeStyle = 'rgba(50,44,36,0.45)'; g.lineWidth = 0.7;
      for (var yy = Y + 5; yy < Y + h; yy += 5) { g.beginPath(); g.moveTo(X, yy); g.lineTo(X + w, yy); g.stroke(); for (var xx = X + ((yy / 5) % 2 ? 3 : 6); xx < X + w; xx += 7) { g.beginPath(); g.moveTo(xx, yy - 5); g.lineTo(xx, yy); g.stroke(); } }
      if (top) { g.fillStyle = '#8a8070'; for (var m = 0; m < 3; m++) { g.fillRect(X + m * (w / 3) + 0.5, Y - 4, w / 3 - 2, 4); g.strokeRect(X + m * (w / 3) + 0.5, Y - 4, w / 3 - 2, 4); } }
    };
    stone(-14, -34, 28, 46, true);
    stone(-17, -40, 9, 52, true); stone(8, -40, 9, 52, true);
    // the door
    g.fillStyle = '#1a120c'; g.beginPath(); g.moveTo(-8, 12); g.lineTo(-8, -6); g.arc(0, -6, 8, Math.PI, 0); g.lineTo(8, 12); g.closePath(); g.fill();
    g.fillStyle = hurt > 0 ? mix('#5a3a20', '#ff4030', hurt) : '#5a3a20'; g.beginPath(); g.moveTo(-6.5, 12); g.lineTo(-6.5, -6); g.arc(0, -6, 6.5, Math.PI, 0); g.lineTo(6.5, 12); g.closePath(); g.fill();
    g.strokeStyle = '#2a1a10'; g.lineWidth = 0.8; for (var p = -4; p <= 4; p += 2.6) { g.beginPath(); g.moveTo(p, -10); g.lineTo(p, 12); g.stroke(); }
    g.fillStyle = '#2a2420'; g.fillRect(-6.5, -2, 13, 1.6); g.fillRect(-6.5, 6, 13, 1.6);
    // banners
    var wave = Math.sin(t * 3) * 1.2;
    [-12.5, 12.5].forEach(function (bx, i) {
      g.fillStyle = '#3a2a6a'; g.beginPath(); g.moveTo(bx - 3, -30); g.lineTo(bx + 3, -30); g.lineTo(bx + 3 + wave * (i ? -0.4 : 0.4), -16); g.lineTo(bx, -19); g.lineTo(bx - 3 + wave * (i ? -0.4 : 0.4), -16); g.closePath(); g.fill();
      g.fillStyle = '#e8c060'; ell(g, bx, -25, 1.4, 1.4); g.fill();
    });
    // flag on top
    g.strokeStyle = '#3a2a1a'; g.lineWidth = 1; g.beginPath(); g.moveTo(-12.5, -44); g.lineTo(-12.5, -58); g.stroke();
    g.fillStyle = '#d84a3a'; g.beginPath(); g.moveTo(-12.5, -58); g.quadraticCurveTo(-6, -57 + wave, 0, -55 + wave * 0.5); g.lineTo(-12.5, -51); g.closePath(); g.fill();
    g.restore();
  }
  // the dark thicket where the road enters
  // the burrow where the road enters: a dark hole ringed by stones and roots
  function drawEntry(g, x, y, ang, t) {
    g.save(); g.translate(x, y);
    shadow(g, 2, 6, 24, 10, 0.3);
    var hole = g.createRadialGradient(0, 2, 2, 0, 2, 20); hole.addColorStop(0, '#05030a'); hole.addColorStop(0.7, '#1a1218'); hole.addColorStop(1, 'rgba(40,30,24,0)');
    g.fillStyle = hole; ell(g, 0, 2, 20, 15); g.fill();
    g.fillStyle = '#120c10'; ell(g, 0, 3, 12, 9); g.fill();
    // glowing eyes deep inside
    for (var i = 0; i < 2; i++) { var open2 = Math.sin(t * 1.7 + i * 2.3) > -0.85, ex = -4 + i * 6, ey = 1 + i * 2; if (open2) { g.fillStyle = 'rgba(255,200,80,0.35)'; ell(g, ex + 1, ey, 3.4, 2.2); g.fill(); g.fillStyle = '#ffd860'; ell(g, ex, ey, 1, 0.7); g.fill(); ell(g, ex + 2.2, ey, 1, 0.7); g.fill(); } }
    // stones around the rim
    var st = [[-17, -6, 6], [-9, -13, 6.5], [1, -15, 6], [11, -12, 6.5], [18, -4, 5.5], [-19, 5, 5], [17, 7, 5]];
    st.forEach(function (q, k2) {
      var sx = q[0], sy = q[1], r = q[2], gr = g.createLinearGradient(sx - r, sy - r, sx + r, sy + r); gr.addColorStop(0, '#b4aa98'); gr.addColorStop(0.6, '#6e665a'); gr.addColorStop(1, '#3a3530');
      g.fillStyle = gr; g.beginPath(); g.moveTo(sx - r, sy + r * 0.5); g.lineTo(sx - r * 0.7, sy - r * 0.6); g.lineTo(sx + r * 0.2, sy - r); g.lineTo(sx + r, sy - r * 0.2); g.lineTo(sx + r * 0.8, sy + r * 0.6); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(24,20,16,0.85)'; g.lineWidth = 0.8; g.stroke();
      if (k2 % 2) { g.fillStyle = '#5e9a40'; ell(g, sx - r * 0.2, sy - r * 0.7, r * 0.45, r * 0.2); g.fill(); }
    });
    // roots
    g.strokeStyle = '#4a3020'; g.lineWidth = 1.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-6, -14); g.quadraticCurveTo(-2, -6, -5, 0); g.moveTo(8, -12); g.quadraticCurveTo(5, -5, 7, 1); g.stroke();
    g.restore();
  }

  /* ---------- enemies (top view, rotated to their heading) ---------- */
  function legs(g, n, len, spread, phase, amp, w, col, joint) {
    g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = w;
    for (var i = 0; i < n; i++) {
      var along = (i - (n - 1) / 2) * spread, swing = Math.sin(phase + (i % 2 ? Math.PI : 0)) * amp;
      [-1, 1].forEach(function (sd) {
        var sw = sd > 0 ? swing : -swing, bx = along, by = sd * 2, kx = along + sw * 0.6 + (i - (n - 1) / 2) * 1.2, ky = sd * len * 0.6, fx = along + sw + (i - (n - 1) / 2) * 2.2, fy = sd * len;
        g.beginPath(); g.moveTo(bx, by); if (joint) g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke();
      });
    }
  }
  function drawEnemy(g, e, t, opt) {
    opt = opt || {};
    var d = e.def, P = d.palette || {}, s = d.size || 8, fl = e.flash || 0, cold = e.slowT > 0 ? 0.45 : 0, dying = e.dying ? Math.min(1, (e.dying - 1) / 1) : 0;
    var col = function (c) { var v = c; if (cold) v = mix(v, '#9ad8ff', cold * 0.55); if (fl > 0) v = mix(v, '#ffffff', fl * (d.boss ? 0.3 : 0.6)); return v; };
    var alpha = e.dying ? Math.max(0, 1 - (e.dying - 1)) : 1;
    if (alpha <= 0) return;
    var x = e.x, y = e.y, hover = e.hover || 0, ang = e.ang, phase = e.walk / (s * 0.9);
    g.save(); g.globalAlpha *= alpha;
    // ground shadow (screen space)
    if (hover) { var bob = Math.sin(t * 6 + e.n) * 1.5; shadow(g, x + 2, y + 3, s * 0.95, s * 0.5, 0.25); y = y - hover - bob; }
    else shadow(g, x + 1.8, y + 2.2, s * 1.05, s * 0.75, 0.34);
    g.translate(x, y); g.rotate(ang);
    var sc = e.dying ? 1 + dying * 0.15 : 1; g.scale(sc, sc);
    var look = d.look || 'beetle';
    if (look === 'beetle') beetle(g, s, P, col, phase, ang, false);
    else if (look === 'spider') spider(g, s, P, col, phase, ang);
    else if (look === 'moth') moth(g, s, P, col, t + e.n * 0.37, ang);
    else if (look === 'shellback') shellback(g, s, P, col, phase, ang, e.n);
    else if (look === 'matron') matron(g, s, P, col, phase, ang, t);
    else if (typeof d.draw === 'function') { try { d.draw(g, e, { t: t, col: col, phase: phase, size: s }); } catch (x2) { warn('enemy.draw', x2); } }
    else beetle(g, s, P, col, phase, ang, false);
    g.restore();
    if (cold && !e.dying) { g.save(); g.globalAlpha *= 0.85; for (var i = 0; i < 3; i++) { var a = t * 1.5 + i * 2.1, rx = Math.cos(a) * s * 0.9, ry = Math.sin(a) * s * 0.6; flake(g, x + rx, y + ry, 1.6); } g.restore(); }
  }
  function flake(g, x, y, r) { g.strokeStyle = '#e6f8ff'; g.lineWidth = 0.7; for (var i = 0; i < 3; i++) { var a = i * Math.PI / 3; g.beginPath(); g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke(); } }
  function beetle(g, s, P, col, phase, ang, big) {
    legs(g, 3, s * 1.25, s * 0.55, phase, s * 0.45, Math.max(1, s * 0.16), col(P.dark || '#222'), true);
    // antennae
    g.strokeStyle = col(P.dark); g.lineWidth = Math.max(0.7, s * 0.09);
    g.beginPath(); g.moveTo(s * 0.95, -s * 0.2); g.quadraticCurveTo(s * 1.5, -s * 0.4, s * 1.75, -s * 0.75); g.moveTo(s * 0.95, s * 0.2); g.quadraticCurveTo(s * 1.5, s * 0.4, s * 1.75, s * 0.75); g.stroke();
    // abdomen (wing cases)
    ell(g, -s * 0.18, 0, s * 0.95, s * 0.72); litFill(g, s, col(P.light), col(P.shell), col(P.dark), ang, -s * 0.18, 0); g.fill();
    g.strokeStyle = OUT; g.lineWidth = Math.max(0.8, s * 0.1); g.stroke();
    g.strokeStyle = rgba('#000000', 0.45); g.lineWidth = Math.max(0.6, s * 0.07); g.beginPath(); g.moveTo(-s * 1.08, 0); g.lineTo(s * 0.5, 0); g.stroke();
    if (P.spots) { g.fillStyle = col(P.spots); [[-0.5, -0.35], [-0.5, 0.35], [0.05, -0.38], [0.05, 0.38]].forEach(function (q) { ell(g, q[0] * s, q[1] * s, s * 0.13, s * 0.11); g.fill(); }); }
    // pronotum + head
    ell(g, s * 0.66, 0, s * 0.36, s * 0.46); litFill(g, s * 0.5, col(P.light), col(mix(P.shell, P.dark, 0.35)), col(P.dark), ang, s * 0.66, 0); g.fill(); g.strokeStyle = OUT; g.lineWidth = Math.max(0.8, s * 0.09); g.stroke();
    ell(g, s * 0.98, 0, s * 0.2, s * 0.26); g.fillStyle = col(P.dark); g.fill();
    // mandibles and eyes
    g.strokeStyle = col(P.dark); g.lineWidth = Math.max(0.8, s * 0.11); g.beginPath(); g.moveTo(s * 1.1, -s * 0.12); g.quadraticCurveTo(s * 1.35, -s * 0.2, s * 1.32, 0); g.moveTo(s * 1.1, s * 0.12); g.quadraticCurveTo(s * 1.35, s * 0.2, s * 1.32, 0); g.stroke();
    g.fillStyle = col(P.eye || '#ffe070'); ell(g, s * 1.02, -s * 0.15, s * 0.07, s * 0.07); g.fill(); ell(g, s * 1.02, s * 0.15, s * 0.07, s * 0.07); g.fill();
    // specular (screen-fixed light)
    var ca = Math.cos(-ang), sa = Math.sin(-ang), hx = (LX * ca - LY * sa) * s * 0.45 - s * 0.18, hy = (LX * sa + LY * ca) * s * 0.4;
    g.fillStyle = 'rgba(255,255,240,0.35)'; ell(g, hx, hy, s * 0.28, s * 0.14, Math.atan2(LY, LX) - ang + Math.PI / 2); g.fill();
  }
  function spider(g, s, P, col, phase, ang) {
    legs(g, 4, s * 1.55, s * 0.42, phase * 1.2, s * 0.2, Math.max(0.9, s * 0.14), col(P.dark), true);
    ell(g, -s * 0.45, 0, s * 0.8, s * 0.68); litFill(g, s, col(P.light), col(P.shell), col(P.dark), ang, -s * 0.45, 0); g.fill(); g.strokeStyle = OUT; g.lineWidth = Math.max(0.8, s * 0.1); g.stroke();
    g.fillStyle = col(P.eye); g.beginPath(); g.moveTo(-s * 0.2, 0); g.lineTo(-s * 0.55, -s * 0.22); g.lineTo(-s * 0.85, 0); g.lineTo(-s * 0.55, s * 0.22); g.closePath(); g.globalAlpha *= 0.85; g.fill(); g.globalAlpha /= 0.85;
    ell(g, s * 0.45, 0, s * 0.42, s * 0.38); litFill(g, s * 0.6, col(P.light), col(mix(P.shell, P.dark, 0.3)), col(P.dark), ang, s * 0.45, 0); g.fill(); g.strokeStyle = OUT; g.lineWidth = Math.max(0.8, s * 0.09); g.stroke();
    g.fillStyle = col(P.eye); [[0.72, -0.12], [0.72, 0.12], [0.62, -0.22], [0.62, 0.22]].forEach(function (q) { ell(g, q[0] * s, q[1] * s, s * 0.07, s * 0.07); g.fill(); });
    g.strokeStyle = col(P.dark); g.lineWidth = Math.max(0.8, s * 0.12); g.beginPath(); g.moveTo(s * 0.8, -s * 0.12); g.lineTo(s * 1.05, -s * 0.08); g.moveTo(s * 0.8, s * 0.12); g.lineTo(s * 1.05, s * 0.08); g.stroke();
    var ca = Math.cos(-ang), sa = Math.sin(-ang); g.fillStyle = 'rgba(255,240,255,0.35)'; ell(g, (LX * ca - LY * sa) * s * 0.35 - s * 0.45, (LX * sa + LY * ca) * s * 0.35, s * 0.22, s * 0.12); g.fill();
  }
  function moth(g, s, P, col, tt, ang) {
    var flap = 0.45 + 0.55 * Math.abs(Math.sin(tt * 13)), wing = col(P.wing || '#8a6aa8');
    [-1, 1].forEach(function (sd) {
      g.save(); g.scale(1, sd * flap);
      g.beginPath(); g.moveTo(s * 0.3, s * 0.1); g.bezierCurveTo(s * 0.9, s * 0.6, s * 0.6, s * 1.6, -s * 0.1, s * 1.55); g.bezierCurveTo(-s * 0.4, s * 1.2, -s * 0.2, s * 0.5, 0, s * 0.15); g.closePath();
      litFill(g, s * 1.4, col(mix(P.wing, '#ffffff', 0.35)), wing, col(mix(P.wing, '#000000', 0.45)), ang, 0, s * 0.8); g.fill(); g.strokeStyle = OUT; g.lineWidth = 0.8; g.stroke();
      g.fillStyle = col(P.light); ell(g, s * 0.25, s * 0.95, s * 0.22, s * 0.22); g.fill(); g.fillStyle = col(P.dark); ell(g, s * 0.25, s * 0.95, s * 0.1, s * 0.1); g.fill();
      g.beginPath(); g.moveTo(-s * 0.05, s * 0.15); g.bezierCurveTo(-s * 0.5, s * 0.4, -s * 0.95, s * 0.8, -s * 0.9, s * 1.05); g.bezierCurveTo(-s * 0.6, s * 1.0, -s * 0.3, s * 0.6, -s * 0.15, s * 0.1); g.closePath();
      g.fillStyle = col(mix(P.wing, P.shell, 0.5)); g.fill(); g.strokeStyle = OUT; g.lineWidth = 0.7; g.stroke();
      g.restore();
    });
    ell(g, -s * 0.15, 0, s * 0.75, s * 0.28); litFill(g, s * 0.8, col(P.light), col(P.shell), col(P.dark), ang, -s * 0.15, 0); g.fill(); g.strokeStyle = OUT; g.lineWidth = 0.8; g.stroke();
    g.strokeStyle = rgba('#3a2a1a', 0.5); g.lineWidth = 0.6; for (var i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-s * 0.55 + i * s * 0.3, -s * 0.24); g.lineTo(-s * 0.55 + i * s * 0.3, s * 0.24); g.stroke(); }
    ell(g, s * 0.62, 0, s * 0.22, s * 0.22); g.fillStyle = col(P.shell); g.fill(); g.strokeStyle = OUT; g.stroke();
    g.strokeStyle = col(P.dark); g.lineWidth = 0.8; g.beginPath(); g.moveTo(s * 0.75, -s * 0.1); g.quadraticCurveTo(s * 1.1, -s * 0.35, s * 1.15, -s * 0.6); g.moveTo(s * 0.75, s * 0.1); g.quadraticCurveTo(s * 1.1, s * 0.35, s * 1.15, s * 0.6); g.stroke();
    g.fillStyle = '#1a1210'; ell(g, s * 0.74, -s * 0.12, s * 0.06, s * 0.06); g.fill(); ell(g, s * 0.74, s * 0.12, s * 0.06, s * 0.06); g.fill();
  }
  function shellback(g, s, P, col, phase, ang, seed) {
    // stubby legs and head peeking out of the dome
    g.fillStyle = col(P.belly); [[0.55, -0.72], [0.55, 0.72], [-0.55, -0.72], [-0.55, 0.72]].forEach(function (q, i) { var sw = Math.sin(phase * 0.8 + (i % 2 ? Math.PI : 0)) * s * 0.14; ell(g, q[0] * s + sw, q[1] * s, s * 0.22, s * 0.18); g.fill(); g.strokeStyle = OUT; g.lineWidth = 0.8; g.stroke(); });
    ell(g, s * 0.98 + Math.sin(phase * 0.8) * s * 0.03, 0, s * 0.28, s * 0.24); g.fillStyle = col(mix(P.belly, P.light, 0.3)); g.fill(); g.strokeStyle = OUT; g.stroke();
    g.fillStyle = col(P.eye); ell(g, s * 1.1, -s * 0.12, s * 0.05, s * 0.05); g.fill(); ell(g, s * 1.1, s * 0.12, s * 0.05, s * 0.05); g.fill();
    ell(g, 0, 0, s * 0.95, s * 0.82); litFill(g, s, col(P.light), col(P.shell), col(P.dark), ang, 0, 0); g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.1; g.stroke();
    // plates
    g.save(); ell(g, 0, 0, s * 0.95, s * 0.82); g.clip();
    g.strokeStyle = rgba('#14200e', 0.55); g.lineWidth = 0.9;
    for (var i = 0; i < 6; i++) { var a = i / 6 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * s * 0.36, Math.sin(a) * s * 0.36); g.lineTo(Math.cos(a) * s, Math.sin(a) * s); g.stroke(); }
    g.beginPath(); for (i = 0; i <= 6; i++) { var b = i / 6 * TAU; if (i) g.lineTo(Math.cos(b) * s * 0.36, Math.sin(b) * s * 0.36); else g.moveTo(Math.cos(b) * s * 0.36, Math.sin(b) * s * 0.36); } g.stroke();
    for (i = 0; i < 6; i++) { var c2 = (i + 0.5) / 6 * TAU, mx = Math.cos(c2) * s * 0.7, my = Math.sin(c2) * s * 0.62; if (hash(seed, i, 3) < 0.5) { g.fillStyle = col(P.moss); ell(g, mx, my, s * 0.16, s * 0.12); g.fill(); g.fillStyle = col(mix(P.moss, '#ffffff', 0.4)); ell(g, mx - s * 0.04, my - s * 0.04, s * 0.07, s * 0.05); g.fill(); } }
    g.restore();
    var ca = Math.cos(-ang), sa = Math.sin(-ang); g.fillStyle = 'rgba(255,255,230,0.3)'; ell(g, (LX * ca - LY * sa) * s * 0.4, (LX * sa + LY * ca) * s * 0.36, s * 0.3, s * 0.18); g.fill();
  }
  function matron(g, s, P, col, phase, ang, t) {
    legs(g, 3, s * 1.3, s * 0.5, phase * 1.4, s * 0.32, Math.max(2, s * 0.13), col(P.dark), true);
    // abdomen with egg sacs
    ell(g, -s * 0.45, 0, s * 0.9, s * 0.7); litFill(g, s, col(P.light), col(P.shell), col(P.dark), ang, -s * 0.45, 0); g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.3; g.stroke();
    g.strokeStyle = rgba('#1a0812', 0.55); g.lineWidth = 1; for (var i = 1; i < 4; i++) { g.beginPath(); g.ellipse(-s * 0.45, 0, s * 0.9 * (1 - i * 0.2), s * 0.7, 0, -1.25, 1.25); g.stroke(); }
    var pulse = 0.6 + 0.4 * Math.sin(t * 4);
    [[-0.85, -0.3], [-0.85, 0.3], [-0.55, 0], [-0.25, -0.38], [-0.25, 0.38]].forEach(function (q) { g.fillStyle = rgba('#ffe090', 0.35 + 0.35 * pulse); ell(g, q[0] * s, q[1] * s, s * 0.11, s * 0.1); g.fill(); g.fillStyle = col('#fff4c0'); ell(g, q[0] * s - 0.5, q[1] * s - 0.5, s * 0.04, s * 0.04); g.fill(); });
    // thorax
    ell(g, s * 0.42, 0, s * 0.42, s * 0.52); litFill(g, s * 0.6, col(P.light), col(mix(P.shell, P.dark, 0.25)), col(P.dark), ang, s * 0.42, 0); g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.2; g.stroke();
    // head with horns (a crown)
    ell(g, s * 0.9, 0, s * 0.24, s * 0.3); g.fillStyle = col(P.dark); g.fill(); g.strokeStyle = OUT; g.stroke();
    g.fillStyle = col(P.horn); [[-1], [1]].forEach(function (q) { var sd = q[0]; g.beginPath(); g.moveTo(s * 0.82, sd * s * 0.18); g.quadraticCurveTo(s * 1.0, sd * s * 0.62, s * 1.32, sd * s * 0.5); g.quadraticCurveTo(s * 1.05, sd * s * 0.36, s * 0.98, sd * s * 0.12); g.closePath(); g.fill(); g.strokeStyle = OUT; g.lineWidth = 0.9; g.stroke(); });
    g.beginPath(); g.moveTo(s * 1.0, -s * 0.08); g.lineTo(s * 1.42, 0); g.lineTo(s * 1.0, s * 0.08); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = col(P.eye); ell(g, s * 1.0, -s * 0.14, s * 0.06, s * 0.05); g.fill(); ell(g, s * 1.0, s * 0.14, s * 0.06, s * 0.05); g.fill();
    var ca = Math.cos(-ang), sa = Math.sin(-ang); g.fillStyle = 'rgba(255,230,250,0.3)'; ell(g, (LX * ca - LY * sa) * s * 0.4 - s * 0.45, (LX * sa + LY * ca) * s * 0.35, s * 0.32, s * 0.15); g.fill();
  }

  /* ---------- towers (three-quarter view; the turret turns to its aim) ---------- */
  var TOWER_K = 0.78, RIM = ['#6a6258', '#c07a3a', '#ffd25a'];
  function plinth(g, x, y, lvl, col) {
    shadow(g, x + 4, y + 9, 16, 6.5, 0.38);
    var top = y + 2;
    g.fillStyle = '#4a443c'; rr(g, x - 14, top - 1, 28, 11, 4); g.fill();
    // the front band shows the level: grey stone, bronze, gold (with a glow)
    g.fillStyle = RIM[Math.min(2, lvl)]; rr(g, x - 14, top + 4, 28, 4, 2); g.fill();
    if (lvl >= 2) { g.fillStyle = 'rgba(255,230,140,0.35)'; ell(g, x, top + 1, 17, 8); g.fill(); }
    var gr = g.createLinearGradient(0, top - 6, 0, top + 6); gr.addColorStop(0, '#d2cab8'); gr.addColorStop(1, '#8e8676');
    g.fillStyle = gr; ell(g, x, top, 14, 6.5); g.fill(); g.strokeStyle = lvl ? RIM[Math.min(2, lvl)] : OUT; g.lineWidth = lvl ? 1.4 : 0.9; g.stroke();
    g.strokeStyle = 'rgba(60,54,44,0.5)'; g.lineWidth = 0.6; for (var i = 0; i < 6; i++) { var a = i / 6 * TAU + 0.3; g.beginPath(); g.moveTo(x + Math.cos(a) * 7, top + Math.sin(a) * 3.2); g.lineTo(x + Math.cos(a) * 13, top + Math.sin(a) * 6); g.stroke(); }
    // level pips
    if (col === 'nopips') return;
    for (var p = 0; p <= lvl; p++) { var px = x - lvl * 3 + p * 6, py = y + 12.5; g.fillStyle = '#2a1e10'; star(g, px, py + 0.6, 2.6); g.fill(); g.fillStyle = '#ffd25a'; star(g, px, py, 2.4); g.fill(); }
  }
  // level stars on the plinth's front, drawn after every tower and foe so they always show
  function drawStars(g, tw) {
    var L = tw.lvl | 0, x = tw.x, y = tw.y + 14.5;
    g.fillStyle = 'rgba(20,14,8,0.75)'; rr(g, x - 3.6 - L * 4.2, y - 3.4, 7.2 + L * 8.4, 6.8, 3.4); g.fill();
    for (var p = 0; p <= L; p++) { var px = x - L * 4.2 + p * 8.4; g.fillStyle = '#ffd25a'; star(g, px, y, 2.7); g.fill(); g.strokeStyle = '#6a4210'; g.lineWidth = 0.5; g.stroke(); }
  }
  function star(g, x, y, r) { g.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r; if (i) g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); else g.moveTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } g.closePath(); }
  function woodPost(g, x, y, w, h) { var gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#b0784a'); gr.addColorStop(1, '#5a3620'); g.fillStyle = gr; g.fillRect(x, y, w, h); g.strokeStyle = OUT; g.lineWidth = 0.7; g.strokeRect(x, y, w, h); }
  function drawTower(g, tw, t, opt) {
    opt = opt || {};
    var x = tw.x, y = tw.y, L = tw.lvl | 0, pip = 'nopips', look = tw.look || tw.type, aim = tw.aim == null ? -Math.PI / 2 : tw.aim, kick = tw.kick || 0, ghost = opt.ghost;
    var K = opt.scale != null ? opt.scale : TOWER_K;
    g.save(); if (ghost) g.globalAlpha *= 0.62;
    // the art is authored about 1.6 cells tall; drawn at TOWER_K around the plinth's front edge it stays within one cell
    // plus the lower third of the cell above, so towers in neighbouring rows never read as one stack
    g.translate(x, y + 12); g.scale(K, K); g.translate(-x, -(y + 12)); y += 5;
    if (look === 'bolt') {
      plinth(g, x, y, L, pip);
      var h = 15 + L * 2;
      if (L >= 1) { var sg = g.createLinearGradient(x - 9, 0, x + 9, 0); sg.addColorStop(0, '#c8c0b0'); sg.addColorStop(1, '#6e665a'); g.fillStyle = sg; g.fillRect(x - 9, y - 8, 18, 10); g.strokeStyle = OUT; g.lineWidth = 0.8; g.strokeRect(x - 9, y - 8, 18, 10); }
      woodPost(g, x - 9, y - h, 3.4, h + 2); woodPost(g, x + 5.6, y - h, 3.4, h + 2);
      g.strokeStyle = '#4a2c18'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x - 7, y - h + 4); g.lineTo(x + 7, y - 3); g.moveTo(x + 7, y - h + 4); g.lineTo(x - 7, y - 3); g.stroke();
      // platform
      var py = y - h; g.fillStyle = '#5a3820'; rr(g, x - 12, py - 2, 24, 6, 2); g.fill(); g.fillStyle = '#9a6a3e'; rr(g, x - 12, py - 4, 24, 5, 2); g.fill(); g.strokeStyle = OUT; g.lineWidth = 0.8; g.stroke();
      if (L >= 2) { g.fillStyle = '#c89a3a'; g.fillRect(x - 12, py - 1, 24, 1.3); }
      // crossbow on a pivot, seen from above at an angle
      g.save(); g.translate(x, py - 5); g.scale(1, 0.72); g.rotate(aim);
      var back = -kick * 2.5;
      g.fillStyle = '#6a4226'; rr(g, -7 + back, -2, 16, 4, 1.5); g.fill(); g.strokeStyle = OUT; g.lineWidth = 0.8; g.stroke();
      g.strokeStyle = L >= 2 ? '#e8c46a' : '#c8a070'; g.lineWidth = 2; g.beginPath(); g.moveTo(5 + back, -10); g.quadraticCurveTo(10 + back, 0, 5 + back, 10); g.stroke();
      g.strokeStyle = '#f0ead8'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(5 + back, -10); g.lineTo(-2 + back - kick * 3 + 3, 0); g.lineTo(5 + back, 10); g.stroke();
      if (kick < 0.5) { g.strokeStyle = '#d8dce4'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-1, 0); g.lineTo(11, 0); g.stroke(); }
      if (L >= 2) { g.strokeStyle = '#e8c46a'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(1 + back, -6); g.quadraticCurveTo(5 + back, 0, 1 + back, 6); g.stroke(); }
      g.restore();
      // banner
      var fy = py - 10, wv = Math.sin(t * 3 + x) * 1.2; g.strokeStyle = '#3a2414'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x - 10, py - 2); g.lineTo(x - 10, fy); g.stroke();
      g.fillStyle = L >= 2 ? '#3a5ad0' : '#c0503a'; g.beginPath(); g.moveTo(x - 10, fy); g.quadraticCurveTo(x - 5, fy + 1 + wv, x - 1, fy + 2 + wv); g.lineTo(x - 10, fy + 5); g.closePath(); g.fill();
    } else if (look === 'mortar') {
      plinth(g, x, y, L, pip);
      var r = 11 + L, hh = 13 + L * 2, top = y - hh;
      var gr = g.createLinearGradient(x - r, 0, x + r, 0); gr.addColorStop(0, '#d6ccb8'); gr.addColorStop(0.45, '#9c9280'); gr.addColorStop(1, '#585044');
      g.fillStyle = gr; g.beginPath(); g.moveTo(x - r, top); g.lineTo(x - r, y); g.ellipse(x, y, r, r * 0.45, 0, Math.PI, 0, true); g.lineTo(x + r, top); g.closePath(); g.fill(); g.strokeStyle = OUT; g.lineWidth = 0.9; g.stroke();
      g.strokeStyle = 'rgba(50,44,36,0.5)'; g.lineWidth = 0.6; for (var yy = top + 5; yy < y; yy += 5) { g.beginPath(); g.ellipse(x, yy, r, r * 0.45, 0, 0.15, Math.PI - 0.15); g.stroke(); }
      // ember slit
      var glow = 0.55 + 0.45 * Math.sin(t * 5 + x * 0.1) - kick * 0.3;
      g.fillStyle = '#2a120a'; rr(g, x - 3, top + 6, 6, 4, 1.5); g.fill(); g.fillStyle = rgba('#ff9a3a', clamp(glow + kick, 0.3, 1)); rr(g, x - 2.2, top + 6.8, 4.4, 2.6, 1); g.fill();
      if (L >= 1) { g.fillStyle = '#4a4440'; g.fillRect(x - r, top + 2, r * 2, 2); }
      // crenellated top
      g.fillStyle = '#bcb2a0'; ell(g, x, top, r, r * 0.45); g.fill(); g.strokeStyle = OUT; g.stroke();
      g.fillStyle = '#4a4236'; ell(g, x, top, r - 3, (r - 3) * 0.45); g.fill();
      // barrel pointing toward the aim
      g.save(); g.translate(x, top - 1);
      var bl = 9 + L * 1.5 - kick * 3, ax = Math.cos(aim) * bl, ay = Math.sin(aim) * bl * 0.45 - 6;
      g.strokeStyle = '#1e1c1c'; g.lineWidth = 8 + L; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(ax, ay); g.stroke();
      g.strokeStyle = L >= 2 ? '#6a5a4a' : '#4a4848'; g.lineWidth = 6 + L; g.beginPath(); g.moveTo(0, 0); g.lineTo(ax, ay); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-1.5, -1.5); g.lineTo(ax - 1.5, ay - 1.5); g.stroke();
      g.fillStyle = '#121010'; ell(g, ax, ay, 3 + L * 0.4, 2.2 + L * 0.3); g.fill();
      if (L >= 2) { g.strokeStyle = '#d0a040'; g.lineWidth = 1.2; ell(g, ax * 0.55, ay * 0.55 + 0.5, 4.5, 3); g.stroke(); }
      g.restore();
    } else if (look === 'frost') {
      plinth(g, x, y, L, pip);
      var ph = 7 + L * 2, b2 = y - ph;
      var pg = g.createLinearGradient(x - 9, 0, x + 9, 0); pg.addColorStop(0, '#c8d8e8'); pg.addColorStop(1, '#5a6a82');
      g.fillStyle = pg; g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x - 7, b2); g.lineTo(x + 7, b2); g.lineTo(x + 9, y); g.closePath(); g.fill(); g.strokeStyle = OUT; g.lineWidth = 0.8; g.stroke();
      g.fillStyle = '#e8f4ff'; ell(g, x, b2, 7, 2.8); g.fill(); g.strokeStyle = OUT; g.stroke();
      var bob = Math.sin(t * 2.2 + x * 0.05) * 1.6, cy = b2 - 12 - bob, cg = g.createRadialGradient(x, cy, 1, x, cy, 18);
      cg.addColorStop(0, 'rgba(160,230,255,0.55)'); cg.addColorStop(1, 'rgba(160,230,255,0)'); g.fillStyle = cg; ell(g, x, cy, 18, 18); g.fill();
      var crystal = function (cx, cy2, w, hgt, tilt) {
        g.save(); g.translate(cx, cy2); g.rotate(tilt);
        g.beginPath(); g.moveTo(0, -hgt); g.lineTo(w, -hgt * 0.35); g.lineTo(w * 0.7, hgt * 0.4); g.lineTo(0, hgt * 0.55); g.lineTo(-w * 0.7, hgt * 0.4); g.lineTo(-w, -hgt * 0.35); g.closePath();
        var q = g.createLinearGradient(-w, -hgt, w, hgt); q.addColorStop(0, '#ffffff'); q.addColorStop(0.4, '#9ee4ff'); q.addColorStop(1, '#2e7cc0'); g.fillStyle = q; g.fill(); g.strokeStyle = '#163a66'; g.lineWidth = 0.8; g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(0, -hgt); g.lineTo(0, hgt * 0.55); g.stroke();
        g.restore();
      };
      if (L >= 1) crystal(x - 6, cy + 3, 2.6, 6, -0.45);
      if (L >= 2) crystal(x + 6, cy + 3, 2.6, 6.5, 0.45);
      crystal(x, cy, 4 + L * 0.4, 10 + L, 0);
      var spin = t * 1.4; g.fillStyle = 'rgba(230,250,255,0.9)'; for (var m = 0; m < 3 + L; m++) { var a = spin + m * TAU / (3 + L); ell(g, x + Math.cos(a) * 11, cy + Math.sin(a) * 4, 1, 1); g.fill(); }
      if (kick > 0) { g.fillStyle = rgba('#ffffff', kick * 0.6); ell(g, x, cy, 6 * kick + 3, 6 * kick + 3); g.fill(); }
    } else if (look === 'storm') {
      plinth(g, x, y, L, pip);
      var rings = 3 + L, top2 = y - 6 - rings * 3.5;
      g.fillStyle = '#3a2e2a'; g.fillRect(x - 2.5, top2, 5, y - top2);
      for (var k = 0; k < rings; k++) {
        var ry = y - 6 - k * 3.5, rw = 9 - k * 0.6, cg2 = g.createLinearGradient(x - rw, 0, x + rw, 0); cg2.addColorStop(0, '#f8c890'); cg2.addColorStop(0.4, '#c87a3a'); cg2.addColorStop(1, '#6a3a1a');
        g.fillStyle = cg2; ell(g, x, ry, rw, 2.4); g.fill(); g.strokeStyle = OUT; g.lineWidth = 0.7; g.stroke();
      }
      // prongs
      g.strokeStyle = '#8a6040'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - 5, top2 + 1); g.quadraticCurveTo(x - 8, top2 - 6, x - 4, top2 - 10); g.moveTo(x + 5, top2 + 1); g.quadraticCurveTo(x + 8, top2 - 6, x + 4, top2 - 10); g.stroke();
      var oy = top2 - 6, pul = 0.7 + 0.3 * Math.sin(t * 9 + x) + kick * 0.6, og = g.createRadialGradient(x, oy, 1, x, oy, 14 + L * 2);
      og.addColorStop(0, rgba('#f0e8ff', 0.9 * Math.min(1, pul))); og.addColorStop(0.3, rgba('#a890ff', 0.5 * Math.min(1, pul))); og.addColorStop(1, 'rgba(120,100,255,0)'); g.fillStyle = og; ell(g, x, oy, 14 + L * 2, 14 + L * 2); g.fill();
      var orb = g.createRadialGradient(x - 1.5, oy - 1.5, 0.5, x, oy, 5 + L * 0.5); orb.addColorStop(0, '#ffffff'); orb.addColorStop(0.5, '#c4b4ff'); orb.addColorStop(1, '#5a44c0'); g.fillStyle = orb; ell(g, x, oy, 4.5 + L * 0.5, 4.5 + L * 0.5); g.fill();
      // little arcs (deterministic from the clock)
      g.strokeStyle = 'rgba(230,220,255,0.85)'; g.lineWidth = 0.7;
      var fr = Math.floor(t * 12);
      for (var z = 0; z < 2; z++) { var a1 = hash(fr, z, 31) * TAU, r1 = 6 + hash(fr, z, 32) * 5; g.beginPath(); g.moveTo(x + Math.cos(a1) * 4, oy + Math.sin(a1) * 4); g.lineTo(x + Math.cos(a1 + 0.3) * (r1 * 0.6), oy + Math.sin(a1 + 0.5) * (r1 * 0.6)); g.lineTo(x + Math.cos(a1) * r1, oy + Math.sin(a1) * r1); g.stroke(); }
    } else if (typeof opt.custom === 'function') {
      plinth(g, x, y, L, pip); try { opt.custom(g, tw, { t: t, ghost: ghost }); } catch (x3) { warn('tower.draw', x3); }
    } else {
      plinth(g, x, y, L, pip); g.fillStyle = tw.color || '#ccc'; rr(g, x - 7, y - 20, 14, 20, 3); g.fill(); g.strokeStyle = OUT; g.stroke();
    }
    g.restore();
  }

  /* ---------- shots and effects ---------- */
  function drawShot(g, s, t) {
    if (s.k === 'shell') {
      shadow(g, s.x, s.y + 2, 3.5, 1.6, 0.3);
      var y = s.y - (s.z || 0);
      g.fillStyle = rgba('#ff8a3a', 0.35); ell(g, s.x, y, 5.5, 5.5); g.fill();
      var gr = g.createRadialGradient(s.x - 1, y - 1, 0.5, s.x, y, 3.6); gr.addColorStop(0, '#ffe0a0'); gr.addColorStop(0.5, '#e05a1a'); gr.addColorStop(1, '#3a1408'); g.fillStyle = gr; ell(g, s.x, y, 3.4, 3.4); g.fill();
      return;
    }
    if (s.k === 'shard') {
      g.save(); g.translate(s.x, s.y); g.rotate(s.ang || 0);
      g.fillStyle = 'rgba(160,230,255,0.35)'; ell(g, -4, 0, 7, 2.6); g.fill();
      g.fillStyle = '#e8f8ff'; g.beginPath(); g.moveTo(5, 0); g.lineTo(-2, -2.2); g.lineTo(-4, 0); g.lineTo(-2, 2.2); g.closePath(); g.fill(); g.strokeStyle = '#3a8acc'; g.lineWidth = 0.6; g.stroke();
      g.restore(); return;
    }
    // bolt
    if (s.trail && s.trail.length) { g.strokeStyle = 'rgba(255,240,200,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(s.trail[0].x, s.trail[0].y); for (var i = 1; i < s.trail.length; i++) g.lineTo(s.trail[i].x, s.trail[i].y); g.lineTo(s.x, s.y); g.stroke(); }
    g.save(); g.translate(s.x, s.y); g.rotate(s.ang || 0);
    g.strokeStyle = '#6a4422'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-6, 0); g.lineTo(3, 0); g.stroke();
    g.fillStyle = '#e8ecf4'; g.beginPath(); g.moveTo(5, 0); g.lineTo(2, -1.6); g.lineTo(2, 1.6); g.closePath(); g.fill();
    g.fillStyle = '#e04a3a'; g.fillRect(-6.5, -1.4, 2, 2.8);
    g.restore();
  }
  function drawFx(g, f, t) {
    var u = f.t / f.dur, i;
    if (f.k === 'boom') {
      var r = f.r * (0.35 + 0.75 * easeOut(u));
      g.save();
      g.fillStyle = rgba('#ffd890', 0.55 * (1 - u)); ell(g, f.x, f.y, r, r * 0.62); g.fill();
      g.strokeStyle = rgba('#fff0c0', 0.8 * (1 - u)); g.lineWidth = 2 * (1 - u) + 0.5; ell(g, f.x, f.y, r * 1.05, r * 0.66); g.stroke();
      for (i = 0; i < 9; i++) { var a = hash(f.seed, i, 1) * TAU, d = r * (0.3 + 0.7 * hash(f.seed, i, 2)) * easeOut(u), sz = (2.5 + 3 * hash(f.seed, i, 3)) * (1 - u * 0.7), up = 10 * u * (1 - u) * 4 * hash(f.seed, i, 4);
        var c = u < 0.35 ? '#fff0b0' : u < 0.6 ? '#ff9a3a' : '#5a4a44'; g.fillStyle = rgba(c, 1 - u); ell(g, f.x + Math.cos(a) * d, f.y + Math.sin(a) * d * 0.6 - up, sz, sz); g.fill(); }
      if (u < 0.2) { g.fillStyle = rgba('#ffffff', 1 - u / 0.2); ell(g, f.x, f.y - 2, f.r * 0.35, f.r * 0.3); g.fill(); }
      g.restore(); return;
    }
    if (f.k === 'zap') {
      var a2 = u < 0.5 ? 1 : 1 - (u - 0.5) * 2;
      for (var pass = 0; pass < 2; pass++) {
        g.strokeStyle = pass ? rgba('#ffffff', a2) : rgba('#9a84ff', 0.55 * a2); g.lineWidth = pass ? 1.1 : 4; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
        for (i = 0; i + 1 < f.pts.length; i++) {
          var A = f.pts[i], B = f.pts[i + 1], n = 5; if (!i) g.moveTo(A.x, A.y);
          for (var j = 1; j <= n; j++) { var k2 = j / n, jit = j < n ? (hash(f.seed, i * 10 + j, Math.floor(f.t / 50)) - 0.5) * 7 : 0, ang = Math.atan2(B.y - A.y, B.x - A.x); g.lineTo(lerp(A.x, B.x, k2) - Math.sin(ang) * jit, lerp(A.y, B.y, k2) + Math.cos(ang) * jit); }
        }
        g.stroke();
      }
      return;
    }
    if (f.k === 'spark') { g.strokeStyle = rgba(f.col || '#fff', 1 - u); g.lineWidth = 1; for (i = 0; i < 5; i++) { var a3 = i / 5 * TAU + f.x, r2 = 2 + u * 7; g.beginPath(); g.moveTo(f.x + Math.cos(a3) * r2 * 0.4, f.y + Math.sin(a3) * r2 * 0.4); g.lineTo(f.x + Math.cos(a3) * r2, f.y + Math.sin(a3) * r2); g.stroke(); } return; }
    if (f.k === 'frost') { g.fillStyle = rgba('#c8f0ff', 0.5 * (1 - u)); ell(g, f.x, f.y, 4 + u * 8, 3 + u * 6); g.fill(); g.save(); g.globalAlpha *= 1 - u; for (i = 0; i < 4; i++) { var a4 = hash(f.seed, i, 3) * TAU; flake(g, f.x + Math.cos(a4) * u * 10, f.y + Math.sin(a4) * u * 7, 1.8); } g.restore(); return; }
    if (f.k === 'pop') {
      for (i = 0; i < 8; i++) { var a5 = hash(f.seed, i, 5) * TAU, d5 = (4 + f.r) * easeOut(u) * (0.6 + hash(f.seed, i, 6) * 0.6), sz5 = (1.2 + hash(f.seed, i, 7) * 1.8) * (1 - u); g.fillStyle = rgba(i % 3 ? f.col : '#f4ecd8', 1 - u); ell(g, f.x + Math.cos(a5) * d5, f.y + Math.sin(a5) * d5 * 0.7 - u * 6, sz5, sz5); g.fill(); }
      g.strokeStyle = rgba('#fff8e0', 0.7 * (1 - u)); g.lineWidth = 1; ell(g, f.x, f.y, f.r * (0.5 + u), f.r * (0.4 + u * 0.7)); g.stroke(); return;
    }
    if (f.k === 'coin') {
      var yy = f.y - 14 * easeOut(Math.min(1, u * 1.6)), al = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
      g.save(); g.globalAlpha *= al; coin(g, f.x - 7, yy, 3.6); text(g, '+' + f.amount, f.x - 2, yy + 0.5, { size: 9, weight: 900, color: '#ffe27a', ow: 3 }); g.restore(); return;
    }
    if (f.k === 'dust') { for (i = 0; i < 7; i++) { var a6 = i / 7 * TAU, d6 = 6 + 12 * easeOut(u); g.fillStyle = rgba('#d8c8a0', 0.55 * (1 - u)); ell(g, f.x + Math.cos(a6) * d6, f.y + Math.sin(a6) * d6 * 0.45 - u * 3, 3.5 * (1 - u * 0.5), 2.5 * (1 - u * 0.5)); g.fill(); } return; }
    if (f.k === 'lvl') { g.strokeStyle = rgba('#ffe27a', 1 - u); g.lineWidth = 1.6; ell(g, f.x, f.y + 4, 8 + u * 12, 3.5 + u * 5); g.stroke(); for (i = 0; i < 6; i++) { var a7 = i / 6 * TAU + u * 2; g.fillStyle = rgba('#fff4b0', 1 - u); ell(g, f.x + Math.cos(a7) * 12, f.y - 10 - u * 22 + Math.sin(a7) * 4, 1.3, 1.3); g.fill(); } return; }
    if (f.k === 'muzzle') { g.fillStyle = rgba(f.col || '#ffb070', 0.7 * (1 - u)); ell(g, f.x, f.y - u * 6, 4 + u * 5, 3 + u * 4); g.fill(); g.fillStyle = rgba('#6a5a50', 0.4 * (1 - u)); ell(g, f.x + 2, f.y - 6 - u * 10, 3 + u * 4, 3 + u * 4); g.fill(); return; }
    if (f.k === 'leak') { g.fillStyle = rgba('#ff4a3a', 0.45 * (1 - u)); ell(g, f.x, f.y, 10 + u * 14, 8 + u * 10); g.fill(); g.save(); g.globalAlpha *= 1 - u; heart(g, f.x, f.y - 16 - u * 10, 4.5); text(g, '-' + f.n, f.x + 7, f.y - 16 - u * 10, { size: 10, weight: 900, color: '#ff8a7a', ow: 3 }); g.restore(); return; }
  }
  function drawDecal(g, d) {
    var a = Math.min(1, d.t / 120) * Math.max(0, 1 - d.t / 14000); if (a <= 0) return;
    g.save(); g.globalAlpha *= a;
    if (d.k === 'scorch') { var gr = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r); gr.addColorStop(0, 'rgba(30,20,14,0.55)'); gr.addColorStop(1, 'rgba(30,20,14,0)'); g.fillStyle = gr; ell(g, d.x, d.y, d.r, d.r * 0.62); g.fill(); }
    else { g.fillStyle = rgba(d.col, 0.4); for (var i = 0; i < 4; i++) { ell(g, d.x + (hash(d.seed, i, 1) - 0.5) * d.r, d.y + (hash(d.seed, i, 2) - 0.5) * d.r * 0.5, d.r * 0.32, d.r * 0.2); g.fill(); } }
    g.restore();
  }
  function coin(g, x, y, r) { g.fillStyle = '#7a4a10'; ell(g, x, y + 0.6, r, r); g.fill(); var gr = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0.3, x, y, r); gr.addColorStop(0, '#fff6b0'); gr.addColorStop(0.5, '#f4c030'); gr.addColorStop(1, '#b07a10'); g.fillStyle = gr; ell(g, x, y, r, r); g.fill(); g.strokeStyle = 'rgba(122,74,16,0.9)'; g.lineWidth = 0.6; ell(g, x, y, r * 0.62, r * 0.62); g.stroke(); }
  function heart(g, x, y, r) { g.save(); g.translate(x, y); g.beginPath(); g.moveTo(0, r * 0.9); g.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.7, -r * 1.2, 0, -r * 0.45); g.bezierCurveTo(r * 0.7, -r * 1.2, r * 1.4, -r * 0.1, 0, r * 0.9); g.closePath(); var gr = g.createRadialGradient(-r * 0.4, -r * 0.5, 0.3, 0, 0, r * 1.2); gr.addColorStop(0, '#ffb0a0'); gr.addColorStop(0.5, '#e8403a'); gr.addColorStop(1, '#7a1414'); g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(60,8,8,0.9)'; g.lineWidth = 0.7; g.stroke(); g.restore(); }
