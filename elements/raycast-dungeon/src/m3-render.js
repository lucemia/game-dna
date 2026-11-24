  /* =====================================================================================================
     The raycaster (pure: works on plain arrays, no canvas). One DDA ray per screen column; the wall distance is the
     PERPENDICULAR distance to the camera plane (no fisheye); doors are planes at the middle of their cell, slid open
     sideways; floors and ceilings are cast per pixel; billboards are drawn column by column against the wall depth.
     cam = {x, y, a (radians), fov (degrees), bob (px), time (ms)}; map = a floor (m1) with doorOpen (0..1 per cell).
     ===================================================================================================== */
  // floor and ceiling textures are shifted a quarter cell: their grout lines and beam gaps sit at 0.25 / 0.75 of a cell,
  // never on a cell's centre line, where the eye stands (a seam there runs from the feet to the horizon)
  var TEXOFF = 0.25;
  function camBasis(cam, W) {
    var half = Math.tan((num(cam.fov, 72) * Math.PI / 180) / 2), dx = Math.cos(cam.a), dy = Math.sin(cam.a);
    return { dx: dx, dy: dy, rx: -dy, ry: dx, half: half, f: (W / 2) / half };
  }
  // cast one ray per column; out = {zbuf, side, cx, cy, u, kind, px, py} typed arrays of length W (reused)
  function castColumns(map, cam, W, out) {
    var B = camBasis(cam, W), i;
    if (!out || out.W !== W) out = { W: W, zbuf: new Float32Array(W), side: new Uint8Array(W), cx: new Int16Array(W), cy: new Int16Array(W), u: new Float32Array(W), kind: new Uint8Array(W), px: new Int16Array(W), py: new Int16Array(W), hit: new Uint8Array(W) };
    out.noHit = 0;
    for (var col = 0; col < W; col++) {
      var camX = ((col + 0.5) / W) * 2 - 1, rdx = B.dx + B.rx * B.half * camX, rdy = B.dy + B.ry * B.half * camX;
      var mx = Math.floor(cam.x), my = Math.floor(cam.y), ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx), ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
      var sx, sy, sdx, sdy, side = 0, hit = 0, perp = 0, u = 0, kind = 0, px = mx, py = my;
      if (rdx < 0) { sx = -1; sdx = (cam.x - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - cam.x) * ddx; }
      if (rdy < 0) { sy = -1; sdy = (cam.y - my) * ddy; } else { sy = 1; sdy = (my + 1 - cam.y) * ddy; }
      for (i = 0; i < 256 && !hit; i++) {
        px = mx; py = my;
        if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
        var t = cellAt(map, mx, my);
        if (t === FLOOR) continue;
        if (t === DOOR) {   // the door plane sits half a cell in; it slides open along its plane
          var open = map.doorOpen ? map.doorOpen[my * map.w + mx] : 0, pd, w2;
          if (side === 0) { pd = sdx - ddx * 0.5; if (pd > sdy) continue; w2 = cam.y + pd * rdy; }
          else { pd = sdy - ddy * 0.5; if (pd > sdx) continue; w2 = cam.x + pd * rdx; }
          w2 -= Math.floor(w2);
          if (w2 < open) continue;
          hit = 1; perp = pd; u = w2 - open; kind = DOOR; break;
        }
        hit = 1; kind = t;
        perp = side === 0 ? sdx - ddx : sdy - ddy;
        var wx = side === 0 ? cam.y + perp * rdy : cam.x + perp * rdx; u = wx - Math.floor(wx);
        if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) u = 1 - u;      // textures read left to right on every face
      }
      if (!hit) { out.noHit++; out.hit[col] = 0; out.zbuf[col] = 1e9; continue; }
      out.hit[col] = 1; out.zbuf[col] = Math.max(1e-4, perp); out.side[col] = side; out.cx[col] = mx; out.cy[col] = my; out.u[col] = u; out.kind[col] = kind; out.px[col] = px; out.py[col] = py;
    }
    out.f = B.f; out.B = B;
    return out;
  }
  // light map: per cell RGB light from torches, spread over floor cells (walls stop it), 0..~1.4
  function buildLightMap(map) {
    var n = map.w * map.h, L = new Float32Array(n * 3), x, y, k;
    for (y = 0; y < map.h; y++) for (x = 0; x < map.w; x++) {
      if (map.cells[y * map.w + x] !== TORCH) continue;
      // BFS from the floor cells in front of the torch, up to 5 steps
      var dist = {}, q = [];
      for (k = 0; k < 4; k++) { var fx = x + DX[k], fy = y + DY[k]; if (cellAt(map, fx, fy) === FLOOR || cellAt(map, fx, fy) === DOOR) { dist[fx + ',' + fy] = 0.6; q.push([fx, fy]); } }
      for (var h = 0; h < q.length; h++) {
        var c = q[h], d = dist[c[0] + ',' + c[1]], e = Math.sqrt((c[0] - x) * (c[0] - x) + (c[1] - y) * (c[1] - y));
        var amt = Math.max(0, 1 - e / 5.2); amt = amt * amt * 0.95;
        var i3 = (c[1] * map.w + c[0]) * 3; L[i3] += amt; L[i3 + 1] += amt * 0.62; L[i3 + 2] += amt * 0.3;
        if (d >= 5) continue;
        for (k = 0; k < 4; k++) { var nx = c[0] + DX[k], ny = c[1] + DY[k], t = cellAt(map, nx, ny); if ((t === FLOOR || t === DOOR) && dist[nx + ',' + ny] == null) { dist[nx + ',' + ny] = d + 1; q.push([nx, ny]); } }
      }
    }
    for (var j = 0; j < n * 3; j++) L[j] = Math.min(1.4, L[j]);
    return L;
  }
  function sampleLight(map, LM, wx, wy, out) {   // bilinear between cell centres
    var fx = wx - 0.5, fy = wy - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, r = 0, g = 0, b = 0;
    for (var k = 0; k < 4; k++) {
      var cx = x0 + (k & 1), cy = y0 + (k >> 1), wgt = ((k & 1) ? tx : 1 - tx) * ((k >> 1) ? ty : 1 - ty);
      if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) continue;
      var i3 = (cy * map.w + cx) * 3; r += LM[i3] * wgt; g += LM[i3 + 1] * wgt; b += LM[i3 + 2] * wgt;
    }
    out[0] = r; out[1] = g; out[2] = b; return out;
  }

  // render the 3D view into rgba (Uint8ClampedArray W*H*4). env = {art, theme, LM, lantern, fog, ambient, flicker}
  // sprites = [{id, x, y, spr (Pix), size, lift, flash, dissolve, bright}]; returns {cols, spriteBoxes}
  function renderView(rgba, W, H, map, cam, env, sprites, cols) {
    cols = castColumns(map, cam, W, cols);
    var B = cols.B, f = cols.f, hor = H / 2 + (cam.bob || 0), T = THEMES[map.theme] || THEMES.cellar, A = env.art || buildArt();
    var tint = T.tint, amb = num(env.ambient, T.ambient), fogC = rgb(env.fogColor || T.fog), dens = num(env.fog, 0.2), lanR = num(env.lantern, 4.5), flick = num(env.flicker, 1);
    var wallTex = A.walls[map.theme] || A.walls.cellar, flo = A.floor[map.theme] || A.floor.cellar, cei = A.ceil[map.theme] || A.ceil.cellar, torchF = A.torch[map.theme] || A.torch.cellar;
    var LM = env.LM, lt = [0, 0, 0], tframe = Math.floor(num(cam.time, 0) / 110);
    function lantern(d) { var v = 0.98 / (1 + (d * d) / (lanR * lanR) * 7); return v * flick; }
    function shadePx(o, tr, tg, tb, d, lr, lg, lb, glow) {   // texel * light, then fog
      var fogT = 1 - Math.exp(-d * dens);
      if (glow) { var gk = glow / 255; lr = lr + (1.25 - lr) * gk; lg = lg + (1.25 - lg) * gk; lb = lb + (1.25 - lb) * gk; fogT *= 1 - gk * 0.85; }
      var r = tr * lr, g = tg * lg, b = tb * lb;
      rgba[o] = r + (fogC[0] - r) * fogT; rgba[o + 1] = g + (fogC[1] - g) * fogT; rgba[o + 2] = b + (fogC[2] - b) * fogT; rgba[o + 3] = 255;
    }
    var rowDist = new Float32Array(H);
    for (var y = 0; y < H; y++) { var dy = Math.abs(y + 0.5 - hor); rowDist[y] = dy < 0.5 ? 1e6 : (f * 0.5) / dy; }
    for (var col = 0; col < W; col++) {
      var camX = ((col + 0.5) / W) * 2 - 1, rdx = B.dx + B.rx * B.half * camX, rdy = B.dy + B.ry * B.half * camX;
      var hasHit = cols.hit[col], d = cols.zbuf[col], lineH = hasHit ? f / d : 0, top = hor - lineH / 2, bot = hor + lineH / 2;
      var y0 = hasHit ? Math.max(0, Math.ceil(top - 0.5)) : Math.ceil(hor), y1 = hasHit ? Math.min(H - 1, Math.ceil(bot - 0.5) - 1) : Math.ceil(hor) - 1;
      // wall slice
      if (hasHit) {
        var kind = cols.kind[col], cx = cols.cx[col], cy = cols.cy[col], tx;
        var tex2 = kind === DOOR ? A.door : kind === STAIRS ? (A.stairs[map.theme] || A.stairs.cellar) : kind === TORCH ? torchF[(tframe + ((cx * 7 + cy * 3) % 3)) % 3] : kind === BANNER ? (A.banner[map.theme] || wallTex) : wallTex;
        tx = clamp(Math.floor(cols.u[col] * tex2.w), 0, tex2.w - 1);
        // light: the cell in front of the face, the lantern, side shade
        var hx = cam.x + rdx * d, hy = cam.y + rdy * d;
        sampleLight(map, LM, hx - rdx * 0.02 + (cols.px[col] + 0.5 - hx) * 0.4, hy - rdy * 0.02 + (cols.py[col] + 0.5 - hy) * 0.4, lt);
        var sk = cols.side[col] ? 0.78 : 1, ln = lantern(d), lr = (amb * tint[0] + ln + lt[0] * flick) * sk, lg = (amb * tint[1] + ln * 0.82 + lt[1] * flick) * sk, lb = (amb * tint[2] + ln * 0.62 + lt[2] * flick) * sk;
        for (y = y0; y <= y1; y++) {
          var ty = clamp(Math.floor((y + 0.5 - top) / lineH * tex2.h), 0, tex2.h - 1), ti = (ty * tex2.w + tx), t4 = ti * 4, o = (y * W + col) * 4;
          shadePx(o, tex2.d[t4], tex2.d[t4 + 1], tex2.d[t4 + 2], d, lr, lg, lb, tex2.glow ? tex2.glow[ti] : 0);
        }
      }
      // floor (below the wall) and ceiling (above it)
      for (y = y1 + 1; y < H; y++) {
        var rd = rowDist[y]; if (rd > 1e5) continue;
        var wx2 = cam.x + rdx * rd, wy2 = cam.y + rdy * rd, fxp = ((Math.floor((wx2 + TEXOFF) * flo.w) % flo.w) + flo.w) % flo.w, fyp = ((Math.floor((wy2 + TEXOFF) * flo.h) % flo.h) + flo.h) % flo.h, fi = fyp * flo.w + fxp;
        sampleLight(map, LM, wx2, wy2, lt); var l2 = lantern(rd);
        shadePx((y * W + col) * 4, flo.d[fi * 4], flo.d[fi * 4 + 1], flo.d[fi * 4 + 2], rd, amb * tint[0] + l2 + lt[0] * flick, amb * tint[1] + l2 * 0.82 + lt[1] * flick, amb * tint[2] + l2 * 0.62 + lt[2] * flick, flo.glow ? flo.glow[fi] : 0);
      }
      for (y = 0; y < y0; y++) {
        var rc = rowDist[y]; if (rc > 1e5) continue;
        var wx3 = cam.x + rdx * rc, wy3 = cam.y + rdy * rc, cxp = ((Math.floor((wx3 + TEXOFF) * cei.w) % cei.w) + cei.w) % cei.w, cyp = ((Math.floor((wy3 + TEXOFF) * cei.h) % cei.h) + cei.h) % cei.h, ci = cyp * cei.w + cxp;
        sampleLight(map, LM, wx3, wy3, lt); var l3 = lantern(rc) * 0.8;
        shadePx((y * W + col) * 4, cei.d[ci * 4], cei.d[ci * 4 + 1], cei.d[ci * 4 + 2], rc, (amb * tint[0] + l3 + lt[0] * 0.7 * flick) * 0.85, (amb * tint[1] + l3 * 0.82 + lt[1] * 0.7 * flick) * 0.85, (amb * tint[2] + l3 * 0.62 + lt[2] * 0.7 * flick) * 0.85, 0);
      }
      // a row exactly on the horizon (no wall in this column): fog colour
      var hr = Math.floor(hor); if (!hasHit && hr >= 0 && hr < H) { var oh = (hr * W + col) * 4; rgba[oh] = fogC[0]; rgba[oh + 1] = fogC[1]; rgba[oh + 2] = fogC[2]; rgba[oh + 3] = 255; }
    }
    // billboards, far to near, each column tested against the wall depth
    var boxes = {}, list = (sprites || []).map(function (s) { var rx = s.x - cam.x, ry = s.y - cam.y; return { s: s, depth: rx * B.dx + ry * B.dy, lat: rx * B.rx + ry * B.ry }; }).filter(function (o) { return o.depth > 0.2; });
    list.sort(function (a, b) { return b.depth - a.depth; });
    list.forEach(function (o) {
      var s = o.s, S = s.spr; if (!S) return;
      var dep = o.depth, scx = W / 2 + f * o.lat / dep - 0.5, artH = S.foot + 1, hpx = f * s.size / dep, scale = hpx / artH, wpx = S.w * scale;
      var footY = hor + f * (0.5 - num(s.lift, 0)) / dep, topY = footY - artH * scale, left = scx - wpx / 2 + 0.5;
      var c0 = Math.max(0, Math.floor(left)), c1 = Math.min(W - 1, Math.ceil(left + wpx) - 1), r0 = Math.max(0, Math.floor(topY)), r1 = Math.min(H - 1, Math.ceil(footY) - 1);
      sampleLight(map, LM, s.x, s.y, lt);
      var ln = lantern(dep), lr = amb * tint[0] + ln + lt[0] * flick + 0.08, lg = amb * tint[1] + ln * 0.82 + lt[1] * flick + 0.08, lb = amb * tint[2] + ln * 0.62 + lt[2] * flick + 0.08, br = num(s.bright, 1);
      lr *= br; lg *= br; lb *= br;
      var bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9, vis = 0, dis = num(s.dissolve, 0);
      for (var c = c0; c <= c1; c++) {
        if (!(dep < cols.zbuf[c])) continue;      // a wall in this column is nearer: hidden
        var u = clamp(Math.floor((c + 0.5 - left) / scale), 0, S.w - 1), any = false;
        for (var r = r0; r <= r1; r++) {
          var v = Math.floor((r + 0.5 - topY) / scale); if (v < 0 || v >= artH) continue;
          var si = v * S.w + u, a = S.d[si * 4 + 3]; if (!a) continue;
          if (dis > 0 && hash(u >> 1, v >> 1, 7) < dis) continue;
          var oi = (r * W + c) * 4;
          if (s.flash) { rgba[oi] = 255; rgba[oi + 1] = 255; rgba[oi + 2] = 255; rgba[oi + 3] = 255; }
          else shadePx(oi, S.d[si * 4], S.d[si * 4 + 1], S.d[si * 4 + 2], dep, lr, lg, lb, S.glow ? S.glow[si] : 0);
          any = true; if (r < by0) by0 = r; if (r > by1) by1 = r;
        }
        if (any) { vis++; if (c < bx0) bx0 = c; if (c > bx1) bx1 = c; }
      }
      if (s.id != null) boxes[s.id] = { x: left, y: topY, w: wpx, h: footY - topY, depth: dep, visCols: vis, drawn: vis ? { x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 } : null };
    });
    return { cols: cols, boxes: boxes, horizon: hor, f: f };
  }
  // project a world point to the view (no drawing): {x, y (floor line), depth, scale}; null when behind the camera
  function project(cam, W, H, wx, wy, z) {
    var B = camBasis(cam, W), rx = wx - cam.x, ry = wy - cam.y, dep = rx * B.dx + ry * B.dy; if (dep <= 0.05) return null;
    var hor = H / 2 + (cam.bob || 0);
    return { x: W / 2 + B.f * (rx * B.rx + ry * B.ry) / dep, y: hor + B.f * (0.5 - (z || 0)) / dep, depth: dep, f: B.f, horizon: hor };
  }

