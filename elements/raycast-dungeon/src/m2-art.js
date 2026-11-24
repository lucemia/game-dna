  /* =====================================================================================================
     Art, all made in code at load time: 64 x 64 wall / floor / ceiling textures per theme, the door, the stair arch,
     torch walls (3 flame frames), banners; monster billboards (idle x2, wind-up, strike, hurt) and item billboards.
     A texture or sprite is {w, h, d: RGBA bytes, glow: 0..255 per texel or null (emissive: ignores light and fog)}.
     ===================================================================================================== */
  var OUT = C3('#0c0910');
  function tex(fn, w, h) {
    w = w || TEX; h = h || TEX; var P = Pix(w, h), glow = null;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var r = fn(x, y); if (!r) continue;
      if (r.length > 3 && r[3]) { if (!glow) glow = new Uint8Array(w * h); glow[y * w + x] = r[3]; }
      P.set(x, y, r);
    }
    P.glow = glow; return P;
  }
  function withGlow(P) { if (!P.glow) P.glow = new Uint8Array(P.w * P.h); return P.glow; }

  var RAMPS = {
    brick: rampOf(['#26150f', '#3f2318', '#56301f', '#6a3e29', '#7e5035', '#946646', '#ac805c']),
    mortar: rampOf(['#1a1210', '#2a201a', '#3a2e26']),
    stone: rampOf(['#1f2422', '#2e3532', '#3e4743', '#525c56', '#69736a', '#848d80', '#a2a996']),
    moss: rampOf(['#14281a', '#1e3c20', '#2c5426', '#3e6e2c', '#5a8a36', '#7ca448']),
    basalt: rampOf(['#140f12', '#21181c', '#2e2226', '#3d2e30', '#4e3c3a', '#62504a']),
    ember: rampOf(['#7a1e0c', '#c4400e', '#f07a1e', '#ffb444', '#ffe39a']),
    wood: rampOf(['#2a160c', '#432414', '#5c341c', '#784628', '#945c36', '#b07a4c']),
    iron: rampOf(['#14141a', '#24242c', '#383842', '#50505c', '#6e6e7c', '#9898a6']),
    gold: rampOf(['#4a2a08', '#7a4a10', '#b07a1c', '#dcaa34', '#f6d86a', '#fff4c0']),
    flame: rampOf(['#c43a0a', '#f06a14', '#ffa030', '#ffd060', '#fff4c0']),
    cloth: { cellar: rampOf(['#2a0a12', '#4a1020', '#6c1a2c', '#902838', '#b03c48']), moss: rampOf(['#0a1a2c', '#122c4a', '#1c406a', '#2a5a8c', '#3c76aa']), ember: rampOf(['#1c0a24', '#301040', '#481a5c', '#64287a', '#823c98']) }
  };

  /* ---------- wall bases ---------- */
  function brickTexel(x, y) {
    var row = Math.floor(y / 8), off = (row & 1) ? 8 : 0, bx = Math.floor((x + off) / 16), lx = (x + off) % 16, ly = y % 8;
    if (ly === 7 || lx === 15) return ramp(RAMPS.mortar, 0.3 + tnoise(x, y, 4, 16, 3) * 0.5, x, y);
    var h = hash(bx & 3, row, 11), v = 0.28 + h * 0.34 + (tnoise(x, y, 6, 64 / 6 | 0, 5) - 0.5) * 0.22;
    if (ly === 0 || lx === 0) v += 0.16; else if (ly === 6 || lx === 14) v -= 0.14;
    if (hash(x, y, 7) < 0.06) v -= 0.12;
    if (h > 0.86 && lx > 4 && lx < 10 && ly === 3 + (lx & 1)) v -= 0.25;     // a crack on a few bricks
    return ramp(RAMPS.brick, v, x, y);
  }
  var BLOCK_ROWS = [0, 22, 43, 64];
  function stoneBlock(x, y) {   // big bevelled blocks, rows of 21-22 texels, staggered
    var r = BLOCK_ROWS[1] > y ? 0 : BLOCK_ROWS[2] > y ? 1 : 2, top = BLOCK_ROWS[r], bot = BLOCK_ROWS[r + 1], off = r === 1 ? 16 : r === 2 ? 40 : 0;
    var lx = (x + off) % 32, ly = y - top, hh = bot - top, bid = Math.floor((x + off) / 32) & 1;
    return { lx: lx, ly: ly, hh: hh, id: r * 2 + bid, edge: lx === 31 || ly === hh - 1, bev: ly <= 1 || lx <= 1 ? 1 : (ly >= hh - 3 || lx >= 29) ? -1 : 0 };
  }
  function mossyTexel(x, y) {
    var b = stoneBlock(x, y);
    if (b.edge) return ramp(RAMPS.stone, 0.06 + tnoise(x, y, 3, 21, 9) * 0.12, x, y);
    var v = 0.36 + hash(b.id, 3, 21) * 0.18 + (tnoise(x, y, 6, 64 / 8 | 0, 13) - 0.5) * 0.16 + b.bev * 0.18;
    if (hash(x, y, 17) < 0.03) v -= 0.08;
    // moss: thick on block tops, dripping down in tongues
    var drip = tnoise(x, 0, 3, 64 / 4 | 0, 31), mossY = 2 + drip * drip * 10 * (0.4 + hash(b.id, 1, 41)), n = tnoise(x, y, 4, 16, 37);
    if (b.ly < mossY && n > 0.38) return ramp(RAMPS.moss, 0.2 + n * 0.6 + (b.ly < 2 ? 0.15 : 0), x, y);
    return ramp(RAMPS.stone, v, x, y);
  }
  var CRACKS = null;
  function crackMask() {   // a few hot seams: random walks across the blocks (1 = core, 2 = warm rim), tileable
    if (CRACKS) return CRACKS;
    var M = new Uint8Array(TEX * TEX), r = rng(4242), k, i;
    function put(x, y, v) { x = ((x % TEX) + TEX) % TEX; y = ((y % TEX) + TEX) % TEX; var j = y * TEX + x; if (v === 1 || !M[j]) M[j] = v; }
    for (k = 0; k < 2; k++) {
      var x = r.int(0, 63), y = r.int(0, 63), dx = r() < 0.5 ? 1 : -1, len = r.int(10, 18), vert = r() < 0.6;
      for (i = 0; i < len; i++) {
        put(x, y, 1);
        if (vert) { y++; if (r() < 0.45) x += dx; if (r() < 0.12) dx = -dx; } else { x += dx; if (r() < 0.45) y++; if (r() < 0.1) y -= 2; }
        if (r() < 0.07) { var bx = x, by = y, bd = -dx; for (var b = 0; b < r.int(3, 6); b++) { bx += bd; if (r() < 0.5) by++; put(bx, by, 1); } }
      }
    }
    for (var yy = 0; yy < TEX; yy++) for (var xx = 0; xx < TEX; xx++) if (M[yy * TEX + xx] === 1) for (var d = 0; d < 4; d++) put(xx + DX[d], yy + DY[d], 2);
    return (CRACKS = M);
  }
  function basaltTexel(x, y) {
    var b = stoneBlock(x, y), m = crackMask()[y * TEX + x];
    if (m === 1) return ramp(RAMPS.ember, 0.5 + hash(x, y, 55) * 0.35, x, y).concat([255]);
    if (b.edge) return ramp(RAMPS.basalt, 0.05, x, y);
    var v = 0.3 + hash(b.id, 5, 61) * 0.18 + (tnoise(x, y, 4, 16, 63) - 0.5) * 0.3 + b.bev * 0.16;
    var c = ramp(RAMPS.basalt, v, x, y);
    if (m === 2) return cmix(c, RAMPS.ember[0], 0.3);       // a faint warm rim beside a seam
    return c;
  }
  var WALLFN = { brick: brickTexel, mossy: mossyTexel, basalt: basaltTexel };

  function sconce(P, frame, wallId) {   // an iron sconce, a torch and a flame (emissive), warm light baked on the wall around
    var glow = withGlow(P), x, y;
    for (y = 0; y < TEX; y++) for (x = 0; x < TEX; x++) {
      var dx = (x - 32) / 26, dy = (y - 22) / 30, d = Math.sqrt(dx * dx + dy * dy); if (d >= 1) continue;
      var i = (y * TEX + x) * 4, k = 1 + (1 - d) * (1 - d) * 1.1;
      P.d[i] = clamp(P.d[i] * k + (1 - d) * 26, 0, 255); P.d[i + 1] = clamp(P.d[i + 1] * (1 + (k - 1) * 0.75) + (1 - d) * 10, 0, 255); P.d[i + 2] = clamp(P.d[i + 2] * (1 + (k - 1) * 0.4), 0, 255);
    }
    // bracket on the wall
    P.poly([[26, 44], [38, 44], [36, 48], [28, 48]], function (xx, yy) { return ramp(RAMPS.iron, 0.5 - (yy - 44) * 0.08, xx, yy); });
    P.line(32, 46, 32, 36, 3, function (xx, yy) { return ramp(RAMPS.iron, xx < 32 ? 0.6 : 0.3, xx, yy); });
    // torch handle and cup
    P.line(32, 40, 32, 28, 4, function (xx, yy) { return ramp(RAMPS.wood, xx < 32 ? 0.75 : 0.35, xx, yy); });
    P.poly([[26, 26], [38, 26], [36, 31], [28, 31]], function (xx, yy) { return ramp(RAMPS.iron, yy === 26 ? 0.9 : xx < 31 ? 0.55 : 0.3, xx, yy); });
    // flame: three frames, a teardrop with a hot core
    var sway = [0, 1.2, -1][frame % 3], tall = [17, 19, 16][frame % 3];
    for (y = 4; y < 27; y++) for (x = 22; x < 43; x++) {
      var u = (26 - y) / tall; if (u < 0 || u > 1) continue;
      var cx = 32 + sway * u * u * 2, hw = 5.6 * Math.sin(Math.PI * Math.pow(1 - u, 0.8) * 0.92 + 0.08) * (1 - u * 0.35);
      var n = tnoise(x * 2, y + frame * 5, 3, 64, 71 + frame) - 0.5, ax = Math.abs(x + 0.5 - cx + n * 2.2);
      if (ax > hw) continue;
      var heat = (1 - ax / hw) * 0.7 + (1 - u) * 0.4;
      var c = ramp(RAMPS.flame, heat, x, y); P.set(x, y, c); glow[y * TEX + x] = 255;
    }
    // the flame's light on the cup rim and the bracket stays lit
    for (y = 26; y < 32; y++) for (x = 26; x < 38; x++) if (P.op(x, y)) glow[y * TEX + x] = Math.max(glow[y * TEX + x], 90);
  }
  function banner(P, cloth) {   // a cloth banner on a rod with a plain emblem
    P.line(14, 5, 50, 5, 2, function (xx, yy) { return ramp(RAMPS.iron, yy < 5 ? 0.8 : 0.4, xx, yy); });
    P.ell(14, 5, 2, 2, ramp(RAMPS.gold, 0.7, 0, 0)); P.ell(50, 5, 2, 2, ramp(RAMPS.gold, 0.5, 0, 0));
    P.poly([[19, 6], [45, 6], [45, 52], [32, 45], [19, 52]], function (x, y) {
      var fold = Math.sin((x - 19) / 26 * Math.PI * 3) * 0.16, v = 0.5 + fold - (y - 6) / 46 * 0.15 + (x < 21 ? 0.12 : x > 42 ? -0.18 : 0);
      var ex = Math.abs(x + 0.5 - 32), ey = y + 0.5 - 24, dia = ex + Math.abs(ey) * 0.8;
      if (dia < 9 && dia > 6.6) return ramp(RAMPS.gold, 0.5 + fold, x, y);
      if (dia < 4) return ramp(RAMPS.gold, 0.75 + fold, x, y);
      if (y === 9 || y === 10) return ramp(RAMPS.gold, 0.45, x, y);
      return ramp(cloth, v, x, y);
    });
    for (var x = 19; x < 46; x += 3) P.set(x, 7, ramp(cloth, 0.8, x, 7));
  }
  function doorTexel(x, y) {
    if (x < 3 || x > 60 || y < 2) return ramp(RAMPS.iron, x < 2 || y < 1 ? 0.55 : 0.3, x, y);   // iron frame
    var px = x - 3, plank = Math.floor(px / 9.5), lx = px - plank * 9.5;
    if (lx < 1) return ramp(RAMPS.wood, 0.05, x, y);
    var band = (y >= 12 && y <= 16) || (y >= 46 && y <= 50);
    if (band) { var rivet = (Math.round(px) % 10 === 5) && (y === 14 || y === 48); return ramp(RAMPS.iron, rivet ? 0.95 : y === 12 || y === 46 ? 0.7 : y === 16 || y === 50 ? 0.2 : 0.45, x, y); }
    var g = tnoise(x * 3, y * 0.4, 3, 64, 81 + plank) - 0.5, v = 0.42 + hash(plank, 1, 83) * 0.14 + g * 0.35 + (lx < 2 ? 0.14 : lx > 8 ? -0.12 : 0);
    if (hash(plank, Math.floor(y / 7), 87) < 0.12 && Math.abs(lx - 4.5) < 1) v -= 0.25;       // a knot
    return ramp(RAMPS.wood, v, x, y);
  }
  function doorTex() {
    var P = tex(doorTexel);
    P.ell(50, 33, 4.5, 4.5, function (x, y, nx, ny) { var r = Math.sqrt(nx * nx + ny * ny); return r > 0.55 ? ramp(RAMPS.gold, 0.55 - nx * 0.3 - ny * 0.3, x, y) : null; });
    P.ell(50, 27, 2, 2, ramp(RAMPS.iron, 0.6, 0, 0));
    return P;
  }
  // the stair arch, 128 x 128: a lit stone doorway (jambs of bevelled blocks, voussoirs, a keystone) over a stairwell whose
  // treads go down and away (lit by the doorway, narrowing, each nosing catching the light, the risers' shadow below it),
  // stone side walls closing in, and a cold light far below
  function stairsTex(theme) {
    var wall = WALLFN[THEMES[theme].wall], N = 128, P = Pix(N, N), glow = new Uint8Array(N * N), ST = RAMPS.stone, cx = 64, archY = 46, rIn = 36, rOut = 46;
    function put(x, y, c, g) { P.set(x, y, c); if (g) glow[y * N + x] = g; }
    // treads: k = 0 is nearest (bottom); top edge, nosing and the shadowed drop under it
    // the eye line is the texture's middle (y 64): every tread stays below it, so the stair drops away from the viewer
    var steps = [], y0 = 128, h = 11, hw = rIn - 1;
    for (var k = 0; k < 7; k++) { var top = y0 - h; steps.push({ top: top, bot: y0, hw: hw, k: k }); y0 = top - Math.max(1, Math.round(h * 0.42)); h = Math.max(2, Math.round(h * 0.72)); hw = hw * 0.84; }
    var deep = y0;
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var dx = x + 0.5 - cx, dyA = y + 0.5 - archY, inOpen = Math.abs(dx) < rIn && (y >= archY || dx * dx + dyA * dyA < rIn * rIn);
      var inFrame = Math.abs(dx) < rOut && (y >= archY || dx * dx + dyA * dyA < rOut * rOut);
      if (!inFrame) { var c0 = wall(x >> 1, y >> 1); put(x, y, c0.slice(0, 3), c0[3] || 0); continue; }
      if (!inOpen) {
        if (y >= archY) {   // jambs: stacked blocks, bevel lit from the doorway side
          var row = Math.floor((y - archY) / 12), ly = (y - archY) % 12, side = dx < 0 ? -1 : 1, lx = Math.abs(dx) - rIn, bid = row * 2 + (side > 0 ? 1 : 0);
          if (ly === 11 || lx >= rOut - rIn - 1) { put(x, y, ramp(ST, 0.06, x, y)); continue; }
          var v = 0.5 + hash(bid, 7, 201) * 0.14 + (tnoise(x, y, 4, 32, 203) - 0.5) * 0.2 - lx * 0.012;
          if (ly === 0 || lx < 1.2) v += 0.2; if (ly >= 9) v -= 0.12;
          put(x, y, ramp(ST, v, x, y)); continue;
        }
        // voussoirs around the arch, a keystone at the top
        var ang = Math.atan2(dyA, dx), seg = Math.floor((ang + Math.PI) / (Math.PI / 7)), fr = ((ang + Math.PI) / (Math.PI / 7)) % 1, rr = Math.sqrt(dx * dx + dyA * dyA);
        var key = Math.abs(dx) < 6 && dyA < 0;
        if (!key && (fr < 0.08 || rr > rOut - 1.2)) { put(x, y, ramp(ST, 0.06, x, y)); continue; }
        var v2 = (key ? 0.72 : 0.55 + hash(seg, 3, 205) * 0.14) + (rr < rIn + 2 ? 0.16 : 0) + (tnoise(x, y, 4, 32, 207) - 0.5) * 0.18;
        put(x, y, ramp(ST, v2, x, y)); continue;
      }
      // inside the opening: stairwell side walls converge, the ceiling falls away into the dark
      var st = null; for (var j = 0; j < steps.length; j++) { if (y >= steps[j].top - Math.round((steps[j].bot - steps[j].top) * 0.45) && y < steps[j].bot) { st = steps[j]; break; } }
      var depth = st ? st.k / (steps.length - 1) : 1, warm = Math.max(0, 1 - depth * 1.3);
      if (st && Math.abs(dx) <= st.hw) {
        var tread = y >= st.top, nose = y === st.top || y === st.top + 1, u = (y - st.top) / Math.max(1, st.bot - st.top);
        var c;
        if (nose) c = cmix(ramp(ST, 0.85 - depth * 0.6, x, y), [255, 196, 120], 0.25 * warm);
        else if (tread) c = cmix(ramp(ST, 0.62 - depth * 0.55 - u * 0.12 + (tnoise(x, y, 3, 32, 209) - 0.5) * 0.1, x, y), [255, 180, 110], 0.18 * warm);
        else c = ramp(ST, 0.1 - depth * 0.08, x, y);      // the riser in shadow under the nosing
        if (Math.abs(dx) > st.hw - 1.5) c = cmul(c, 0.6);
        var g = depth > 0.6 && tread ? Math.round((depth - 0.6) * 300) : 0;
        if (g) c = cmix(c, [110, 190, 210], (depth - 0.6) * 1.1);
        put(x, y, c, Math.min(200, g)); continue;
      }
      // side walls of the stairwell and the dark beyond the last step
      var wallSide = st ? Math.abs(dx) - st.hw : 0, below = y >= deep;
      if (st && wallSide > 0) { var wv = 0.34 - depth * 0.3 + (Math.floor((y + (dx < 0 ? 0 : 5)) / 6) % 2 ? 0.04 : -0.02) - wallSide * 0.004; put(x, y, cmix(ramp(ST, wv, x, y), [255, 170, 100], 0.1 * warm)); continue; }
      // above the last tread: the stairwell going down (ceiling courses closing in) and a small lit doorway far below
      var hwD = Math.max(4, steps[steps.length - 1].hw * 0.55), topY = archY - rIn, tq = clamp((y - topY) / Math.max(1, deep - topY), 0, 1), hwY = lerp(rIn, hwD, tq);
      if (y >= deep - 9 && Math.abs(dx) < hwD) {
        var ddy = y - (deep - 9 + hwD), inDoor = y >= deep - 9 + hwD || dx * dx + ddy * ddy < hwD * hwD;
        if (inDoor) { var gl2 = 1 - Math.abs(dx) / hwD * 0.5; put(x, y, cmix([14, 20, 28], [70, 128, 146], gl2 * 0.7), Math.round(90 * gl2)); continue; }
      }
      if (Math.abs(dx) > hwY) { put(x, y, ramp(ST, 0.16 - tq * 0.12 + (Math.floor(y / 5) % 2 ? 0.03 : 0), x, y)); continue; }      // side walls
      var course = Math.floor(Math.pow(tq, 0.6) * 9), mortar = Math.abs(Math.pow(tq, 0.6) * 9 - course - 0.5) > 0.46;
      put(x, y, mortar ? ramp(ST, 0.04, x, y) : ramp(ST, 0.13 - tq * 0.1 + hash(course, x >> 3, 211) * 0.04, x, y));
    }
    P.glow = glow; return P;
  }
  /* ---------- floors and ceilings ---------- */
  function flagTexel(x, y, mossy, cinder) {
    var tx = Math.floor(x / 32), ty = Math.floor(y / 32), lx = x % 32, ly = y % 32, split = (tx + ty) & 1;
    var sx = split ? (ly < 16 ? 12 : 20) : 16, sub = split ? (lx < sx ? 0 : 1) : (ly < 14 ? 0 : 1), id = tx * 7 + ty * 3 + sub;
    var grout = lx === 0 || ly === 0 || (split ? lx === sx : ly === 14) || (split && ly === 16 && false);
    if (cinder) {
      var n = tnoise(x, y, 5, 64 / 5 | 0, 101), e = hash(x, y, 103);
      if (e > 0.997 && n > 0.5) return ramp(RAMPS.ember, 0.45 + (e - 0.994) * 50, x, y).concat([170]);
      if (grout) return ramp(RAMPS.basalt, 0.05, x, y);
      return ramp(RAMPS.basalt, 0.24 + n * 0.3 + hash(id, 1, 105) * 0.12 + (lx === 1 || ly === 1 ? 0.1 : 0), x, y);
    }
    if (grout) return mossy && tnoise(x, y, 2, 32, 107) > 0.45 ? ramp(RAMPS.moss, 0.35, x, y) : ramp(RAMPS.mortar, 0.25, x, y);
    var v = 0.3 + hash(id, 2, 109) * 0.22 + (tnoise(x, y, 4, 16, 111) - 0.5) * 0.24 + (lx === 1 || ly === 1 ? 0.12 : 0);
    if (hash(x, y, 113) < 0.04) v -= 0.12;
    if (mossy && tnoise(x, y, 6, 64 / 6 | 0, 115) > 0.66) return ramp(RAMPS.moss, 0.25 + tnoise(x, y, 2, 32, 117) * 0.4, x, y);
    return ramp(mossy ? RAMPS.stone : RAMPS.brick.map(function (c) { return cmix(c, [110, 100, 92], 0.55); }), v, x, y);
  }
  function beamsTexel(x, y) {
    var lx = x % 32, beam = lx >= 4 && lx < 28;
    if (!beam) return ramp(RAMPS.wood, 0.05 + tnoise(x, y, 4, 16, 121) * 0.08, x, y);
    var v = 0.32 + tnoise(x * 0.4, y * 3, 3, 64, 123 + (x >> 5)) * 0.3 + (lx === 4 ? 0.18 : lx === 27 ? -0.15 : 0);
    if ((y & 31) === 8 && Math.abs(lx - 16) > 6) return ramp(RAMPS.iron, 0.6, x, y);
    return ramp(RAMPS.wood, v, x, y);
  }
  function rockTexel(x, y, warm) {
    var n = tnoise(x, y, 8, 8, 131) * 0.6 + tnoise(x, y, 3, 64 / 3 | 0, 133) * 0.4;
    return ramp(warm ? RAMPS.basalt : RAMPS.stone, 0.12 + n * 0.32, x, y);
  }

  var ART = null;
  function buildArt() {
    if (ART) return ART;
    ART = { walls: {}, torch: {}, banner: {}, stairs: {}, floor: {}, ceil: {}, door: doorTex(), sprites: {} };
    Object.keys(THEMES).forEach(function (th) {
      var T = THEMES[th], base = tex(WALLFN[T.wall]);
      ART.walls[th] = base;
      ART.torch[th] = [0, 1, 2].map(function (f) { var P = base.clone(); P.glow = base.glow ? new Uint8Array(base.glow) : null; sconce(P, f, th); return P; });
      var B = base.clone(); B.glow = base.glow ? new Uint8Array(base.glow) : null; banner(B, RAMPS.cloth[th]); ART.banner[th] = B;
      ART.stairs[th] = stairsTex(th);
      ART.floor[th] = tex(function (x, y) { return flagTexel(x, y, th === 'moss', th === 'ember'); });
      ART.ceil[th] = T.ceil === 'beams' ? tex(beamsTexel) : tex(function (x, y) { return rockTexel(x, y, th === 'ember'); });
    });
    return ART;
  }

  /* ---------- billboards: monsters (idle0, idle1, wind, strike, hurt) and items ---------- */
  var L3 = (function () { var v = [-0.45, -0.7, 0.55], n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); return [v[0] / n, v[1] / n, v[2] / n]; })();
  function lit(nx, ny) { var nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), l = nx * L3[0] + ny * L3[1] + nz * L3[2]; return { l: Math.max(0, l), nz: nz, spec: Math.pow(Math.max(0, l), 18) }; }
  function eye(P, cx, cy, rx, ry, pupil, look) {   // white, a pupil looking at the viewer, a glint
    P.ell(cx, cy, rx + 1, ry + 1, OUT);
    P.ell(cx, cy, rx, ry, function (x, y, nx, ny) { return ny > 0.45 ? [196, 200, 214] : [244, 244, 250]; });
    P.ell(cx + (look || 0), cy + 0.6, Math.max(1, rx * 0.5), Math.max(1.2, ry * 0.55), pupil || [26, 16, 30]);
    P.set(Math.round(cx - rx * 0.35), Math.round(cy - ry * 0.4), [255, 255, 255]);
  }
  function slime(pose, pal, crown) {
    var W = 64, H = 64, P = Pix(W, H), R = rampOf(pal.ramp);
    var sh = { idle0: [24, 20], idle1: [25.5, 18.5], wind: [28.5, 14.5], strike: [21, 25], hurt: [29, 13.5] }[pose] || [24, 20];
    var rx = sh[0], ry = sh[1], cx = 32, cy = 63 - ry * 0.86, lean = pose === 'strike' ? -1.5 : 0;
    P.ell(cx, cy, rx, ry, function (x, y, nx, ny) {
      if (y > 62) return null;
      var s = lit(nx, ny), v = 0.18 + s.l * 0.72 - Math.pow(1 - s.nz, 3) * 0.25;
      var core = (nx * nx + (ny - 0.15) * (ny - 0.15)) < 0.3 ? -0.1 : 0;
      if (s.spec > 0.9 && hash(x, y, 3) > 0.15) return [246, 252, 246];
      if (s.spec > 0.55) v += 0.22;
      var bub = hash(x >> 1, y >> 1, pal.seed || 5);
      if (bub > 0.965 && ny > -0.4 && ny < 0.6 && Math.abs(nx) < 0.7) return ramp(R, v + 0.32, x, y);
      if (ny > 0.78) v -= 0.12;
      return ramp(R, v + core, x, y);
    });
    // a darker underside line where the body meets the floor
    for (var x = Math.round(cx - rx * 0.86); x <= Math.round(cx + rx * 0.86); x++) if (P.op(x, 62)) P.set(x, 62, R[0]);
    var ey = cy - ry * 0.18 + (pose === 'strike' ? -3 : 0), ex = rx * 0.36, er = Math.max(3, rx * 0.17);
    if (pose === 'hurt') {   // squeezed shut: > <
      [-1, 1].forEach(function (s) { var x0 = cx + s * ex; P.line(x0 - 3 * s, ey - 3, x0 + 2 * s, ey, 2, OUT); P.line(x0 + 2 * s, ey, x0 - 3 * s, ey + 3, 2, OUT); });
      P.line(cx - 5, ey + 9, cx + 5, ey + 9, 2, OUT);
    } else {
      var ery = pose === 'wind' ? er * 0.75 : er * 1.15;
      eye(P, cx - ex + lean, ey, er, ery, pal.pupil); eye(P, cx + ex + lean, ey, er, ery, pal.pupil);
      if (pose === 'wind' || pose === 'strike') {   // angry brows
        P.line(cx - ex - er - 1, ey - ery - 4, cx - ex + er + 1, ey - ery - 1, 2, OUT); P.line(cx + ex + er + 1, ey - ery - 4, cx + ex - er - 1, ey - ery - 1, 2, OUT);
      }
      if (pose === 'strike') {   // mouth open, two fangs
        P.ell(cx, ey + er + 7, 6, 4.5, [40, 10, 24]); P.ell(cx, ey + er + 8.5, 3.5, 2, [120, 30, 50]);
        P.poly([[cx - 4.5, ey + er + 3.5], [cx - 2.5, ey + er + 3.5], [cx - 3.5, ey + er + 7]], [240, 240, 236]); P.poly([[cx + 2.5, ey + er + 3.5], [cx + 4.5, ey + er + 3.5], [cx + 3.5, ey + er + 7]], [240, 240, 236]);
      } else if (pose === 'wind') { P.line(cx - 4, ey + er + 5, cx + 4, ey + er + 5, 2, OUT); }
      else { P.line(cx - 3, ey + er + 5, cx, ey + er + 6, 1, OUT); P.line(cx, ey + er + 6, cx + 3, ey + er + 5, 1, OUT); }
    }
    if (crown) {   // a gold crown sunk into the top of the body (joined to it)
      var kc = clamp(ry / 20, 0.72, 1.1), ty = Math.min(cy - ry + 3, ey - er * 1.25 - 6.5), G = RAMPS.gold;   // the crown band always sits above the eyes and brows
      P.poly([[cx - 11, ty + 4], [cx - 12, ty - 9 * kc], [cx - 6, ty - 3 * kc], [cx, ty - 12 * kc], [cx + 6, ty - 3 * kc], [cx + 12, ty - 9 * kc], [cx + 11, ty + 4]], function (x, y) { return ramp(G, 0.75 - (x - cx + 12) / 24 * 0.45 - (y > ty + 1 ? 0.2 : 0), x, y); });
      [[cx - 12, ty - 10 * kc], [cx, ty - 13 * kc], [cx + 12, ty - 10 * kc]].forEach(function (p) { P.ell(p[0], p[1], 1.6, 1.6, G[5]); });
      P.ell(cx, ty - 1, 2.2, 2.2, [200, 40, 70]); P.set(cx - 1, ty - 2, [255, 170, 190]);
    }
    P.outline(OUT); return P;
  }
  function bat(pose, pal) {
    var W = 64, H = 48, P = Pix(W, H), R = rampOf(pal.ramp), M = rampOf(pal.wing), cx = 32, by = 24;
    var tip = { idle0: [-26, -18], idle1: [-29, 2], idle2: [-24, 14], wind: [-25, -21], strike: [-20, 12], hurt: [-17, 9] }[pose] || [-26, -18];
    var mouth = pose === 'wind' || pose === 'strike';
    [-1, 1].forEach(function (s) {   // wings: membrane with three fingers and a scalloped trailing edge
      var sx = cx + s * 5, sy = by - 3, tx = cx + s * (-tip[0]), ty = by + tip[1], f1 = [cx + s * (-tip[0]) * 0.62, ty + (by + 10 - ty) * 0.55], f2 = [cx + s * (-tip[0]) * 0.3, by + 11];
      var pts = [[sx, sy - 1], [tx, ty], [tx - s * 2, ty + 5], f1, [f1[0] - s * 3, f1[1] - 1], f2, [cx + s * 4, by + 7]];
      P.poly(pts, function (x, y) { var u = Math.abs(x - cx) / Math.max(1, Math.abs(tx - cx)); return ramp(M, 0.55 - u * 0.25 + (y < by ? 0.1 : -0.05), x, y); });
      P.line(sx, sy, tx, ty, 2, function (x, y) { return ramp(R, 0.5, x, y); });
      P.line((sx + tx) / 2, (sy + ty) / 2, f1[0], f1[1], 1, R[1]); P.line(sx, sy, f2[0], f2[1], 1, R[1]);
    });
    P.ell(cx, by + 2, 7, 9, function (x, y, nx, ny) { var s = lit(nx, ny); return ramp(R, 0.15 + s.l * 0.7 + (hash(x, y, 141) > 0.8 ? 0.08 : 0), x, y); });
    P.line(cx - 3, by + 10, cx - 4, by + 13, 1, R[1]); P.line(cx + 3, by + 10, cx + 4, by + 13, 1, R[1]);
    // head, ears, glowing eyes
    P.poly([[cx - 6, by - 7], [cx - 7, by - 16], [cx - 2, by - 10]], R[2]); P.poly([[cx + 6, by - 7], [cx + 7, by - 16], [cx + 2, by - 10]], R[2]);
    P.set(cx - 6, by - 12, M[3]); P.set(cx + 6, by - 12, M[3]);
    P.ell(cx, by - 6, 6.5, 6, function (x, y, nx, ny) { var s = lit(nx, ny); return ramp(R, 0.2 + s.l * 0.7, x, y); });
    if (pose === 'hurt') { P.line(cx - 4, by - 7, cx - 1, by - 6, 1, OUT); P.line(cx + 1, by - 6, cx + 4, by - 7, 1, OUT); }
    else { var g = withGlow(P); [[cx - 3, by - 7], [cx + 2, by - 7]].forEach(function (e) { P.set(e[0], e[1], [255, 80, 60]); P.set(e[0] + 1, e[1], [255, 200, 120]); P.set(e[0], e[1] + 1, [200, 30, 30]); P.set(e[0] + 1, e[1] + 1, [255, 80, 60]); g[e[1] * W + e[0]] = 255; g[e[1] * W + e[0] + 1] = 255; g[(e[1] + 1) * W + e[0]] = 200; g[(e[1] + 1) * W + e[0] + 1] = 255; }); }
    if (mouth) { P.ell(cx, by - 2, 3, pose === 'strike' ? 2.5 : 2, [60, 10, 20]); P.set(cx - 2, by - 3, [250, 250, 245]); P.set(cx + 2, by - 3, [250, 250, 245]); P.set(cx - 2, by - 2, [250, 250, 245]); P.set(cx + 2, by - 2, [250, 250, 245]); }
    else P.set(cx, by - 2, OUT);
    P.outline(OUT); var gl = P.glow; P.glow = gl; return P;
  }
  function knight(pose, pal) {   // a skeleton in a dented breastplate and helm, sword in its right hand, round shield on its left
    var W = 80, H = 96, P = Pix(W, H), B = rampOf(pal.bone), S = RAMPS.iron, Wd = RAMPS.wood, cx = 40, foot = 95;
    var bob = pose === 'idle1' ? 1 : pose === 'hurt' ? 3 : 0, tilt = pose === 'hurt' ? 5 : pose === 'strike' ? -2 : 0;
    var hip = [cx, foot - 30 + bob], neck = [cx + tilt, foot - 52 + bob], head = [cx + tilt * 1.5, foot - 61 + bob];
    function bone(x0, y0, x1, y1, t) { P.line(x0, y0, x1, y1, t, function (x, y, u) { return ramp(B, 0.62 - (x > (x0 + x1) / 2 ? 0.22 : 0) - u * 0.08, x, y); }); P.ell(x1, y1, t * 0.6, t * 0.6, function (x, y) { return ramp(B, 0.7, x, y); }); }
    // legs
    var kneeL = [cx - 7, foot - 15], kneeR = [cx + 7, foot - 15];
    if (pose === 'strike') { kneeL = [cx - 9, foot - 14]; kneeR = [cx + 8, foot - 16]; }
    if (pose === 'hurt') { kneeL = [cx - 10, foot - 13]; kneeR = [cx + 5, foot - 13]; }      // knees buckle, the body rocks back
    bone(hip[0] - 4, hip[1] + 1, kneeL[0], kneeL[1], 3.2); bone(kneeL[0], kneeL[1], cx - 8, foot - 2, 2.8);
    bone(hip[0] + 4, hip[1] + 1, kneeR[0], kneeR[1], 3.2); bone(kneeR[0], kneeR[1], cx + 8, foot - 2, 2.8);
    P.ell(cx - 9, foot - 1, 4, 1.8, function (x, y) { return ramp(S, 0.45, x, y); }); P.ell(cx + 9, foot - 1, 4, 1.8, function (x, y) { return ramp(S, 0.35, x, y); });
    // tattered tabard hanging from the belt
    P.poly([[hip[0] - 8, hip[1] - 3], [hip[0] + 8, hip[1] - 3], [hip[0] + 6, hip[1] + 9], [hip[0] + 2, hip[1] + 6], [hip[0] - 1, hip[1] + 10], [hip[0] - 5, hip[1] + 6], [hip[0] - 7, hip[1] + 8]], function (x, y) { return ramp(RAMPS.cloth.cellar, 0.5 + Math.sin(x * 0.9) * 0.15 - (y - hip[1]) * 0.02, x, y); });
    // spine and breastplate
    bone(cx, hip[1] - 2, neck[0], neck[1] + 2, 3);
    P.poly([[neck[0] - 10, neck[1] + 2], [neck[0] + 10, neck[1] + 2], [cx + 9, hip[1] - 6], [cx, hip[1] - 2], [cx - 9, hip[1] - 6]], function (x, y) {
      var nx = (x - cx) / 10, v = 0.52 - nx * 0.32 + (Math.abs(x + 0.5 - cx) < 1 ? 0.2 : 0) - (y - neck[1]) * 0.006;
      if (hash(x >> 1, y >> 1, 151) > 0.93) v -= 0.18;     // dents
      return ramp(S, v, x, y);
    });
    P.line(neck[0] - 9, neck[1] + 3, neck[0] + 9, neck[1] + 3, 1, S[5]);
    // pauldrons
    P.ell(neck[0] - 10, neck[1] + 4, 4.5, 3.5, function (x, y, nx, ny) { return ramp(S, 0.3 + lit(nx, ny).l * 0.65, x, y); });
    P.ell(neck[0] + 10, neck[1] + 4, 4.5, 3.5, function (x, y, nx, ny) { return ramp(S, 0.2 + lit(nx, ny).l * 0.55, x, y); });
    // sword arm (viewer's left) and the sword, by pose: shoulder -> elbow -> hand, blade from the hand
    var sh = [neck[0] - 11, neck[1] + 5], arm = {
      idle0: [[cx - 17, neck[1] + 13], [cx - 15, neck[1] + 21], -0.32],
      idle1: [[cx - 17, neck[1] + 14], [cx - 15, neck[1] + 22], -0.3],
      wind: [[cx - 16, neck[1] - 6], [cx - 8, neck[1] - 15], -0.12],     // sword raised straight over the helm
      strike: [[cx - 10, neck[1] + 12], [cx + 4, neck[1] + 20], 0.95],
      hurt: [[cx - 21, neck[1] + 6], [cx - 27, neck[1] + 13], -2.2]      // sword arm flung out, blade trailing
    }[pose] || [[cx - 17, neck[1] + 13], [cx - 15, neck[1] + 21], -0.32];
    var el = arm[0], hand = arm[1], ang = arm[2], len = 27, bx = hand[0] + Math.sin(ang) * len, byy = hand[1] - Math.cos(ang) * len;
    // blade (drawn before the arm so the fist covers the grip)
    var px = Math.cos(ang), py = Math.sin(ang);
    P.poly([[hand[0] + px * 2 + Math.sin(ang) * 3, hand[1] + py * 2 - Math.cos(ang) * 3], [bx + px * 1.2, byy + py * 1.2], [bx + Math.sin(ang) * 3, byy - Math.cos(ang) * 3], [bx - px * 1.2, byy - py * 1.2], [hand[0] - px * 2 + Math.sin(ang) * 3, hand[1] - py * 2 - Math.cos(ang) * 3]], function (x, y) {
      var side = (x - hand[0]) * px + (y - hand[1]) * py; return ramp(S, side < 0 ? 0.92 : 0.55, x, y);
    });
    P.line(hand[0] - Math.sin(ang) * 1.5, hand[1] + Math.cos(ang) * 1.5, hand[0] + Math.sin(ang) * 3, hand[1] - Math.cos(ang) * 3, 2.4, function (x, y) { return ramp(Wd, 0.4, x, y); });
    bone(sh[0], sh[1], el[0], el[1], 2.8); bone(el[0], el[1], hand[0], hand[1], 2.6);
    P.ell(hand[0], hand[1], 2.6, 2.6, function (x, y, nx, ny) { return ramp(B, 0.35 + lit(nx, ny).l * 0.5, x, y); });
    // cross-guard just past the fist on the blade side: one solid bar with a lit edge
    var gcx = hand[0] + Math.sin(ang) * 4.2, gcy = hand[1] - Math.cos(ang) * 4.2;
    P.line(gcx - px * 4.5, gcy - py * 4.5, gcx + px * 4.5, gcy + py * 4.5, 2.6, function (x, y) { return ramp(RAMPS.gold, ((x - gcx) * Math.sin(ang) - (y - gcy) * Math.cos(ang)) > 0 ? 0.75 : 0.45, x, y); });
    // shield arm (viewer's right): round shield over the forearm
    var shc = pose === 'hurt' ? [cx + 11, neck[1] + 4] : pose === 'wind' ? [cx + 15, neck[1] + 15] : [cx + 15, neck[1] + 14];
    bone(neck[0] + 11, neck[1] + 5, shc[0] + 2, shc[1] - 2, 2.8);
    P.ell(shc[0], shc[1], 9.5, 11, function (x, y, nx, ny) {
      var r = Math.sqrt(nx * nx + ny * ny), s = lit(nx * 0.6, ny * 0.6);
      if (r > 0.86) return ramp(S, 0.3 + s.l * 0.6, x, y);
      if (r < 0.22) return ramp(RAMPS.gold, 0.35 + s.l * 0.6, x, y);
      var q = Math.abs(nx) < 0.12 || Math.abs(ny) < 0.12; if (q) return ramp(S, 0.45, x, y);
      return ramp(RAMPS.cloth.moss, 0.3 + s.l * 0.55, x, y);
    });
    // skull in a helm: dark eye sockets with cold pin lights
    var hx = head[0], hy = head[1];
    P.ell(hx, hy + 2, 6.2, 6.5, function (x, y, nx, ny) { return ramp(B, 0.3 + lit(nx, ny).l * 0.65, x, y); });
    P.line(hx - 3, hy + 8, hx + 3, hy + 8, 2, function (x, y) { return ramp(B, x % 2 ? 0.3 : 0.6, x, y); });
    P.ell(hx, hy - 1, 7.4, 6, function (x, y, nx, ny) { return ny > 0.35 ? null : ramp(S, 0.3 + lit(nx, ny).l * 0.65, x, y); });
    P.line(hx - 7, hy + 1, hx + 7, hy + 1, 1.6, S[2]);
    P.poly([[hx - 1, hy - 7], [hx + 1, hy - 7], [hx + 2, hy - 13], [hx - 3, hy - 12]], function (x, y) { return ramp(RAMPS.cloth.cellar, 0.6, x, y); });
    var gl = withGlow(P);
    [hx - 3, hx + 2].forEach(function (ex2) {
      P.ell(ex2 + 0.5, hy + 3, 2, 1.7, [16, 10, 14]);
      if (pose !== 'hurt') { P.set(ex2, hy + 3, pal.eye); gl[(hy + 3) * W + ex2] = 255; }
    });
    P.set(hx, hy + 6, [30, 20, 24]);
    P.outline(OUT); return P;
  }
  function item(look, color) {
    var P = Pix(32, 32), c = C3(color || '#d83a3a'), R = [cmul(c, 0.35), cmul(c, 0.6), c, cmul(c, 1.25), cmix(c, [255, 255, 255], 0.55)];
    if (look === 'coins') {
      [[11, 27], [20, 27], [16, 25], [13, 23], [18, 21], [15, 19]].forEach(function (p, i) {
        P.ell(p[0], p[1] + 1, 5, 2.4, RAMPS.gold[1]);
        P.ell(p[0], p[1], 5, 2.4, function (x, y, nx, ny) { return ramp(RAMPS.gold, 0.55 - nx * 0.25 - ny * 0.2 + (i === 5 ? 0.1 : 0), x, y); });
        P.set(p[0] - 1, p[1], RAMPS.gold[2]); P.set(p[0] + 1, p[1], RAMPS.gold[2]);
      });
      P.set(14, 18, [255, 255, 255]); P.set(13, 18, RAMPS.gold[5]); P.set(15, 18, RAMPS.gold[5]); P.set(14, 17, RAMPS.gold[5]);
    } else if (look === 'amulet') {
      P.line(9, 24, 16, 13, 1, RAMPS.gold[3]); P.line(23, 24, 16, 13, 1, RAMPS.gold[2]);
      P.ell(16, 24, 6, 6, function (x, y, nx, ny) { return ramp(RAMPS.gold, 0.5 - nx * 0.3 - ny * 0.3, x, y); });
      P.ell(16, 24, 3.6, 3.6, function (x, y, nx, ny) { var s = lit(nx, ny); return s.spec > 0.5 ? [255, 255, 255] : ramp(R, 0.25 + s.l * 0.75, x, y); });
      var g = withGlow(P); for (var y = 21; y < 28; y++) for (var x = 13; x < 20; x++) if ((x - 16) * (x - 16) + (y - 24) * (y - 24) < 12) g[y * 32 + x] = 120;
    } else {   // flask
      P.ell(16, 22, 8, 8, function (x, y, nx, ny) {
        var s = lit(nx, ny); if (s.spec > 0.55 || (nx < -0.35 && nx > -0.6 && ny < 0 && ny > -0.6)) return [236, 244, 255];
        if (ny < -0.25) return ramp(rampOf(['#2a3440', '#4a5a6a', '#7a8c9c', '#aabccc']), 0.3 + s.l * 0.5, x, y);
        return ramp(R, 0.15 + s.l * 0.85, x, y);
      });
      P.poly([[13.5, 9], [18.5, 9], [18.5, 15], [13.5, 15]], function (x, y) { return ramp(rampOf(['#2a3440', '#4a5a6a', '#7a8c9c', '#aabccc']), x < 16 ? 0.8 : 0.4, x, y); });
      P.poly([[13, 5], [19, 5], [18.5, 9.5], [13.5, 9.5]], function (x, y) { return ramp(RAMPS.wood, x < 16 ? 0.8 : 0.45, x, y); });
      P.line(12.5, 15, 19.5, 15, 1.5, rampOf(['#aabccc'])[0]);
    }
    P.outline(OUT); return P;
  }

  // built-in looks: build(pose, palette) -> Pix; size = world height, lift = world units above the floor (flyers)
  var LOOKS = {
    slime: { build: function (pose, pal) { return slime(pose, pal, false); }, poses: ['idle0', 'idle1', 'wind', 'strike', 'hurt'], size: 0.55, lift: 0 },
    king: { build: function (pose, pal) { return slime(pose, pal, true); }, poses: ['idle0', 'idle1', 'wind', 'strike', 'hurt'], size: 0.95, lift: 0 },
    bat: { build: bat, poses: ['idle0', 'idle1', 'idle2', 'wind', 'strike', 'hurt'], size: 0.42, lift: 0.36 },
    knight: { build: knight, poses: ['idle0', 'idle1', 'wind', 'strike', 'hurt'], size: 1.17, lift: 0 }
  };
  var PALETTES = {
    slime: { ramp: ['#0e2a1a', '#17462a', '#21643a', '#2f8448', '#4aa85c', '#7acc7a', '#b6eca0'], seed: 3 },
    king: { ramp: ['#1a0c2a', '#2c1446', '#422066', '#5a2e8a', '#7a44ac', '#a26ccc', '#d0a8ee'], seed: 9, pupil: [120, 10, 30] },
    bat: { ramp: ['#160e1a', '#2a1a2e', '#3e2840', '#563a54', '#705068'], wing: ['#24141e', '#3c2230', '#5a3646', '#7a4c5c', '#9a6474'] },
    knight: { bone: ['#3a3026', '#6a5e4c', '#9a8c72', '#c8baa0', '#ece2cc'], eye: [120, 230, 255] }
  };
  function spriteFor(look, pose, pal) {
    var A = buildArt(), L = LOOKS[look] || LOOKS.slime, key = look + ':' + pose + ':' + JSON.stringify(pal || null);
    if (A.sprites[key]) return A.sprites[key];
    var p = pal ? Object.assign({}, PALETTES[look] || PALETTES.slime, pal) : (PALETTES[look] || PALETTES.slime);
    var S; try { S = L.build(L.poses.indexOf(pose) >= 0 ? pose : 'idle0', p); } catch (e) { warn('sprite ' + look, e); S = slime('idle0', PALETTES.slime, false); }
    S.foot = footRow(S);
    return (A.sprites[key] = S);
  }
  function itemSprite(look, color) {
    var A = buildArt(), key = 'item:' + look + ':' + color;
    if (A.sprites[key]) return A.sprites[key];
    var S = item(look, color); S.foot = footRow(S); return (A.sprites[key] = S);
  }
  function footRow(S) { for (var y = S.h - 1; y >= 0; y--) for (var x = 0; x < S.w; x++) if (S.d[(y * S.w + x) * 4 + 3]) return y; return S.h - 1; }

  /* ---------- the hero's sword (first person), rasterised at the view's size per pose ---------- */
  // the swept arc of a strike: a thin tapered streak along the tip's path, behind the blade and apart from it; alpha 0..255
  function smearRaster(S) {
    var W = Math.round(S * 1.5), H = S, P = Pix(W, H), hx = 0.56 * W, hy = 0.96 * H, a = -1.12, len = 0.86 * H, a0 = a + 0.02, a1 = a + 1.05;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var dx = x + 0.5 - hx, dy = y + 0.5 - hy, rr = Math.sqrt(dx * dx + dy * dy), an = Math.atan2(dx, -dy);
      if (an < a0 || an > a1) continue;
      var t = (an - a0) / (a1 - a0), thick = Math.max(1, len * 0.09 * (1 - t)), r1 = len * (1.0 - 0.05 * t);
      if (rr > r1 || rr < r1 - thick) continue;
      var edge = rr > r1 - 1.2 ? 1 : 0.75;
      P.set(x, y, t < 0.35 ? [236, 242, 252] : [190, 206, 232], Math.round(235 * (1 - t) * edge));
    }
    return P;
  }
  function swordRaster(S, pose) {   // S = box height in logical px; the hand sits at the lower right, the blade points up-left
    var W = Math.round(S * 1.5), H = S, P = Pix(W, H), St = RAMPS.iron;
    var poses = {   // hand x, hand y (fractions of the box), blade angle from straight up (radians, negative = leans left), length
      idle: [0.78, 0.98, -0.34, 0.9], wind: [0.9, 0.74, 0.34, 0.9], strike: [0.56, 0.96, -1.12, 0.86], recover: [0.72, 1.0, -0.55, 0.88], hurt: [0.84, 1.12, -0.18, 0.9], block: [0.6, 0.86, -1.2, 0.92]
    };
    var q = poses[pose] || poses.idle, hx = q[0] * W, hy = q[1] * H, a = q[2], len = q[3] * H, ux = Math.sin(a), uy = -Math.cos(a), vx = -uy, vy = ux;
    var bw = Math.max(2, H * 0.055), tipx = hx + ux * len, tipy = hy + uy * len, gx = hx + ux * H * 0.12, gy = hy + uy * H * 0.12;
    // blade: two-tone with a fuller, edge highlight
    P.poly([[gx + vx * bw, gy + vy * bw], [tipx - ux * bw * 2 + vx * bw * 0.8, tipy - uy * bw * 2 + vy * bw * 0.8], [tipx, tipy], [tipx - ux * bw * 2 - vx * bw * 0.8, tipy - uy * bw * 2 - vy * bw * 0.8], [gx - vx * bw, gy - vy * bw]], function (x, y) {
      var s = (x + 0.5 - hx) * vx + (y + 0.5 - hy) * vy, along = (x + 0.5 - hx) * ux + (y + 0.5 - hy) * uy;
      if (Math.abs(s) < bw * 0.22 && along < len * 0.78) return ramp(St, 0.36, x, y);
      return ramp(St, s < 0 ? 0.98 : 0.62 - along / len * 0.08, x, y);
    });
    // cross-guard, grip, pommel
    var gl = H * 0.16; P.line(gx - vx * gl, gy - vy * gl, gx + vx * gl, gy + vy * gl, Math.max(2, H * 0.05), function (x, y) { return ramp(RAMPS.gold, ((x - gx) * vx + (y - gy) * vy) < 0 ? 0.8 : 0.45, x, y); });
    P.line(gx - ux * H * 0.02, gy - uy * H * 0.02, hx - ux * H * 0.1, hy - uy * H * 0.1, Math.max(2, H * 0.06), function (x, y) { return ramp(RAMPS.wood, hash(x, y, 171) > 0.5 ? 0.5 : 0.3, x, y); });
    P.ell(hx - ux * H * 0.12, hy - uy * H * 0.12, H * 0.035, H * 0.035, RAMPS.gold[4]);
    // gauntlet around the grip: a fist with knuckle plates, the forearm going down out of the box
    var fx = hx - ux * H * 0.02, fy = hy - uy * H * 0.02, fr = H * 0.085;
    P.line(fx, fy, fx + H * 0.35, fy + H * 0.5, H * 0.13, function (x, y) { return ramp(St, 0.35 + (((x - fx) * 0.82 - (y - fy) * 0.57) < 0 ? 0.25 : 0), x, y); });
    P.ell(fx, fy, fr * 1.15, fr, function (x, y, nx, ny) { var s = lit(nx, ny); return ramp(St, 0.25 + s.l * 0.7, x, y); });
    for (var j = -1; j <= 1; j++) P.ell(fx + vx * fr * 0.55 * j - ux * fr * 0.55, fy + vy * fr * 0.55 * j - uy * fr * 0.55, fr * 0.36, fr * 0.36, function (x, y, nx, ny) { return ramp(St, 0.45 + lit(nx, ny).l * 0.5, x, y); });
    P.outline(OUT);
    return P;
  }

