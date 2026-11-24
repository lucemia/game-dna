/* Forest ruin at dusk: sky + clouds, far pine ridge, mid ruins (arch, columns, wall), flagstone floor with a calm
   standing band, ground props, foreground trunks and leaves. Key light: low warm sun from the right. */
var RUIN_RIM = '#ffb070';
function ruinScene(W, FH) {
  return RK.cached('ruin|' + W + 'x' + FH, function () {
    var S = RK.buildScene(W, FH, {
      seed: 5, horizon: 0.44,
      sky: ['#161230', '#26193f', '#43204f', '#6e2c58', '#a8465a', '#d86c56', '#f2a25e'],
      far: { cols: ['#3c2650', '#33224a', '#2c1e42'], kind: 'spires', amp: 0.2 },
      mid: { cols: ['#2a1c38', '#241830', '#1e1428'], kind: 'hills', amp: 0.07, y: 0.02 },
      floor: { cols: ['#7a6070', '#3a2c3c', '#241a28'], kind: 'brick', clean: [0.06, 0.94], feather: 20 },
      vignette: 0, vignetteCol: '#07050c',
      ambient: [
        { kind: 'twinkle', n: 12, col: '#ffe8c8', area: [0.02, 0.02, 0.98, 0.16], speed: 0.8 },
        { kind: 'mote', n: 18, col: '#e4ff7a', area: [0.05, 0.42, 0.95, 0.96], speed: 0.7, front: true },
        { kind: 'smoke', n: 5, col: '#5a4a5a', area: [0.715, 0.17, 0.725, 0.19], speed: 1 },
        { kind: 'shimmer', n: 7, col: '#ffc890', area: [0.08, 0.05, 0.92, 0.2], speed: 0.6 },
        { kind: 'mote', n: 5, col: '#ffcf6a', area: [0.3, 0.2, 0.7, 0.6], speed: 0.5, front: false }
      ]
    });
    var hz = S.hz, R = RK.rng(91), sg = S.sky.getContext('2d'), lg = S.land.getContext('2d'), fg = S.fg.getContext('2d');
    var u = W / 256, v = FH / 150;   // layout unit so the 240x160 build keeps proportions
    var X = function (f) { return Math.round(f * W); }, Y = function (f) { return Math.round(f * FH); };
    /* --- clouds: long streaks with a lit underside (sun below the horizon) --- */
    [[0.12, 0.10, 70], [0.58, 0.06, 90], [0.82, 0.17, 50], [0.33, 0.21, 46]].forEach(function (c, n) {
      var cx = X(c[0]), cy = Y(c[1]), len = Math.round(c[2] * u);
      for (var i = 0; i < len; i++) {
        var t = i / len, th = Math.round((Math.sin(t * Math.PI) * 3 + RK.h1(i >> 2, n + 3) * 2) * v);
        for (var k = 0; k <= th; k++) {
          var y = cy - k, col = k === 0 ? '#ffb27a' : k === 1 ? '#d47468' : k < th ? '#7a3a62' : '#5a2c58';
          if (RK.bay(cx + i, y) < 0.15 && k === th) continue;
          RK.px(sg, cx + i - (len >> 1), y, col);
        }
      }
    });
    /* --- mid ruins (drawn on the land layer, behind everyone) --- */
    var STONE = ['#251c30', '#3c2e44', '#5c4a5c', '#86707a', '#b89c92'], MOSS = ['#18241e', '#24402a', '#3e6234', '#6a8c3c', '#a8c060'];
    function stoneCol(x, x0, w) { var f = (x - x0) / Math.max(1, w - 1); return f < 0.18 ? 0 : f < 0.4 ? 1 : f < 0.72 ? 2 : f < 0.9 ? 3 : 4; }
    function column(g, x0, base, w, h, broken, seed) {
      for (var y = base - h; y < base; y++) for (var x = x0; x < x0 + w; x++) {
        var top = base - h + (broken ? Math.round(RK.h1(x, seed) * 4 + (x - x0) * 0.3) : 0);
        if (y < top) continue;
        var i = stoneCol(x, x0, w); if ((x - x0) % 3 === 1 && i > 0) i--;              // flutes
        if (((y - top) % 11) === 0 && y > top + 3) i = Math.max(0, i - 1);              // drum joints
        if (RK.h2(x, y, seed) > 0.95) i = Math.max(0, i - 1);
        if (y === top && broken) i = Math.min(4, i + 1);
        RK.px(g, x, y, STONE[i]);
      }
      if (!broken) { for (var x2 = x0 - 2; x2 < x0 + w + 2; x2++) for (var k = 0; k < 4; k++) RK.px(g, x2, base - h - 4 + k, STONE[k === 0 ? 4 : stoneCol(x2, x0 - 2, w + 4)]); }
      for (var x3 = x0 - 2; x3 < x0 + w + 2; x3++) for (var k2 = 0; k2 < 3; k2++) RK.px(g, x3, base - 3 + k2, STONE[k2 === 0 ? 3 : stoneCol(x3, x0 - 2, w + 4) - (k2 === 2 ? 1 : 0) | 0]);
      // moss at the base and on the break
      for (var m = 0; m < w + 2; m++) { var mh = Math.round(RK.h1(m, seed + 9) * 5 * v); for (var k3 = 0; k3 < mh; k3++) RK.px(g, x0 - 1 + m, base - 3 - k3, MOSS[k3 === mh - 1 ? 3 : RK.bay(m, k3) > 0.5 ? 2 : 1]); }
      // crack
      var cx = x0 + (w >> 1), cy = base - Math.round(h * 0.6);
      for (var c = 0; c < h * 0.25; c++) { RK.px(g, cx, cy + c, STONE[0]); if (RK.h1(c, seed) > 0.6) cx += RK.h1(c, seed + 1) > 0.5 ? 1 : -1; }
    }
    function arch(g, cx, base, span, h, seed) {
      var pw = Math.round(9 * u), r1 = span / 2, r2 = r1 + Math.round(8 * u), cyA = base - h;
      column(g, Math.round(cx - r2), base, pw, h, false, seed);
      column(g, Math.round(cx + r1 - 1), base, pw, Math.round(h * 0.82), true, seed + 1);
      for (var y = Math.round(cyA - r2); y <= cyA; y++) for (var x = Math.round(cx - r2); x <= Math.round(cx + r2); x++) {
        var dx = x - cx, dy = y - cyA, d = Math.sqrt(dx * dx + dy * dy); if (d < r1 || d > r2) continue;
        var a = Math.atan2(-dy, dx); if (a < 0.62) continue;                               // right part has fallen
        var block = Math.floor(a / 0.26), edge = Math.abs(a / 0.26 - Math.round(a / 0.26)) < 0.07;
        var i = d > r2 - 1.5 ? 3 : d < r1 + 1.5 ? 1 : 2; if (dx > 0) i = Math.min(4, i + 1); if (edge) i = 0;
        if (RK.h2(x, y, seed) > 0.93) i = Math.max(0, i - 1);
        RK.px(g, x, y, STONE[i]);
        if (d > r2 - 1.5 && RK.h1(block, seed) > 0.55) RK.px(g, x, y - 1, MOSS[3]);
      }
      // hanging vines from the arch
      for (var n = 0; n < 5; n++) {
        var vx = Math.round(cx - r2 + 4 + n * (r1 * 0.9 / 5) * 1.8), vlen = Math.round((8 + RK.h1(n, seed) * 16) * v), a2 = Math.PI - (vx - cx + r2) / (2 * r2) * Math.PI;
        var vy = Math.round(cyA - Math.sin(Math.max(0.2, a2)) * r1);
        if (vx > cx + r1 * 0.5) continue;
        for (var k = 0; k < vlen; k++) RK.px(lg, vx + Math.round(Math.sin(k * 0.5 + n) * 0.8), vy + k, MOSS[k % 4 === 0 ? 3 : 1]);
        RK.px(lg, vx, vy + vlen, MOSS[4]);
      }
    }
    function wall(g, x0, base, w, h, seed) {
      for (var x = x0; x < x0 + w; x++) {
        var top = base - Math.round(h * (0.45 + 0.55 * RK.vn(x / 7, seed)));
        for (var y = top; y < base; y++) {
          var row = Math.floor((y - base) / 5), bx = Math.floor((x + (row & 1) * 4) / 8), mortar = ((y - base) % 5 === 0) || ((x + (row & 1) * 4) % 8 === 0);
          var i = mortar ? 0 : (RK.h2(bx, row, seed) > 0.5 ? 2 : 1); if (y === top) i = 3;
          RK.px(g, x, y, STONE[i]);
        }
        if (RK.h1(x, seed + 4) > 0.55) RK.px(g, x, top - 1, MOSS[2]);
      }
    }
    function tree(g, x0, w, base, seed, dark) {       // tall trunk running off the top, roots, a few leaf clusters
      var BARK = dark ? ['#08060c', '#120c14', '#1c141e', '#2a1e28', '#3a2a30'] : ['#140e16', '#22161e', '#3a2628', '#583a32', '#7a5240'];
      for (var y = 0; y < base; y++) {
        var flare = y > base - 10 ? Math.round((y - base + 10) * 0.6) : 0;
        for (var x = x0 - flare; x < x0 + w + flare; x++) {
          var i = stoneCol(x, x0 - flare, w + flare * 2); if ((x * 3 + (y >> 2)) % 5 === 0) i = Math.max(0, i - 1);
          if (RK.h2(x >> 1, y >> 2, seed) > 0.9) i = Math.min(4, i + 1);
          RK.px(g, x, y, BARK[i]);
        }
      }
    }
    function bush(g, cx, base, w, h, seed, leaf) {
      var L = leaf || ['#0e1a16', '#1a3022', '#2c4c2c', '#4c7236', '#86a448'];
      var n = Math.max(3, Math.round(w / 6));
      for (var k = 0; k < n; k++) {
        var bx = cx - w / 2 + (k + 0.5) * w / n, r = (h * (0.45 + 0.4 * RK.h1(k, seed))), by = base - r * 0.9;
        for (var y = -Math.ceil(r); y <= Math.ceil(r); y++) for (var x = -Math.ceil(r); x <= Math.ceil(r); x++) {
          var d = (x * x + y * y) / (r * r); if (d > 1 || by + y > base) continue;
          var lit = (x * 0.6 - y * 0.8) / r, i = d > 0.82 ? 0 : lit > 0.45 ? 4 : lit > 0.05 ? 3 : lit > -0.4 ? 2 : 1;
          if (i > 1 && RK.h2(Math.round(bx + x) >> 1, Math.round(by + y) >> 1, seed) > 0.8) i--;
          RK.px(g, bx + x, by + y, L[i]);
        }
      }
    }
    function rock(g, cx, base, rx, ry, seed) {
      for (var y = -ry; y <= 0; y++) for (var x = -rx; x <= rx; x++) {
        var d = (x * x) / (rx * rx) + (y * y) / (ry * ry); if (d > 1) continue;
        var lit = (x / rx) * 0.7 - (y / ry) * 0.6, i = d > 0.8 ? 0 : lit > 0.6 ? 4 : lit > 0.2 ? 3 : lit > -0.3 ? 2 : 1;
        if (RK.h2(x + cx, y, seed) > 0.9) i = Math.max(0, i - 1);
        RK.px(g, cx + x, base + y, STONE[i]);
      }
      g.globalAlpha = 0.35; RK.oval(g, cx + 1, base + 1, rx + 1, 1, '#0a0610'); g.globalAlpha = 1;
    }
    var gb = hz + Math.round(5 * v);
    wall(lg, X(0.0), gb, X(0.2), Math.round(20 * v), 3);
    wall(lg, X(0.66), gb, X(0.34), Math.round(16 * v), 8);
    arch(lg, X(0.34), gb, Math.round(34 * u), Math.round(40 * v), 21);
    column(lg, X(0.6), gb + 1, Math.round(10 * u), Math.round(52 * v), true, 31);
    column(lg, X(0.7), gb, Math.round(8 * u), Math.round(30 * v), true, 33);
    // a brazier on the short column (flicker comes from the ambient pass)
    var bxz = X(0.7) + Math.round(4 * u), byz = gb - Math.round(30 * v) - 1;
    RK.rect(lg, bxz - 4, byz - 3, 9, 3, '#3a2a2a'); RK.rect(lg, bxz - 3, byz - 2, 7, 1, '#6a4a3a');
    S.torch = { x: bxz, y: byz - 4 };
    bush(lg, X(0.08), gb + 2, Math.round(26 * u), Math.round(10 * v), 4);
    bush(lg, X(0.52), gb + 2, Math.round(20 * u), Math.round(8 * v), 5);
    bush(lg, X(0.92), gb + 2, Math.round(28 * u), Math.round(11 * v), 6);
    // ground props spread left / centre / right, off the standing band
    rock(lg, X(0.05), Y(0.97), Math.round(7 * u), Math.round(5 * v), 7);
    rock(lg, X(0.5), Y(0.985), Math.round(9 * u), Math.round(4 * v), 9);
    bush(lg, X(0.56), Y(0.99), Math.round(16 * u), Math.round(6 * v), 10, ['#0e1a16', '#1a3022', '#2a5030', '#457a38', '#7aa84a']);
    rock(lg, X(0.95), Y(0.62), Math.round(6 * u), Math.round(4 * v), 11);
    // a fallen drum of a column lying on its side, mid ground left
    for (var fy = 0; fy < Math.round(7 * v); fy++) for (var fx = 0; fx < Math.round(20 * u); fx++) {
      var i = fy === 0 ? 4 : fy < 2 ? 3 : fy < 5 ? 2 : 1; if (fx % 5 === 0) i = Math.max(0, i - 1);
      RK.px(lg, X(0.03) + fx, Y(0.62) + fy, STONE[i]);
    }
    for (var fy2 = 0; fy2 < Math.round(7 * v); fy2++) RK.px(lg, X(0.03) + Math.round(20 * u), Y(0.62) + fy2, STONE[fy2 < 2 ? 4 : 3]);
    /* --- foreground: edge trunks and hanging leaves (darkest layer, never over the fighters) --- */
    tree(fg, -3, Math.round(9 * u), FH, 41, true);
    tree(fg, W - Math.round(6 * u), Math.round(9 * u), FH, 42, true);
    var LF = ['#06080a', '#0c140e', '#142218', '#1e3220'];
    [[0, 0, 40, 14], [W - 44, 0, 44, 12]].forEach(function (b, n) {
      for (var x = b[0]; x < b[0] + b[2]; x++) {
        var len = Math.round((b[3] * (0.4 + 0.6 * RK.vn(x / 5, 50 + n)) + RK.h1(x, 60 + n) * 4) * v);
        if (n === 0) len = Math.round(len * (1 - (x - b[0]) / b[2]) + 2); else len = Math.round(len * ((x - b[0]) / b[2]) + 2);
        for (var y = 0; y < len; y++) RK.px(fg, x, y, LF[y > len - 2 ? 3 : RK.bay(x, y) > 0.6 ? 2 : 1]);
      }
    });
    // grass tufts along the bottom edge
    for (var gx = 0; gx < W; gx += 3) {
      if (gx > W * 0.18 && gx < W * 0.84 && RK.h1(gx, 70) < 0.6) continue;
      var gh = Math.round((2 + RK.h1(gx, 71) * 5) * v);
      for (var k = 0; k < gh; k++) RK.px(fg, gx + (k > gh / 2 ? 1 : 0), FH - 1 - k, k === gh - 1 ? '#2c4a2a' : '#101a12');
    }
    return S;
  });
}
// brazier flame + glow, drawn after drawSceneBack
function drawRuinTorch(g, S, tSec) {
  var t = S.torch; if (!t) return;
  var q = Math.floor(tSec * 8) % 3, FL = ['#fff4c0', '#ffd060', '#ff9030', '#c84a28'];
  g.globalAlpha = 0.18; RK.disc(g, t.x, t.y - 1, 7 + (q === 1 ? 1 : 0), '#ff9a40'); g.globalAlpha = 1;
  var hgt = 4 + q;
  for (var y = 0; y < hgt; y++) { var w = Math.max(0, Math.round((hgt - y) * 0.7)); for (var x = -w; x <= w; x++) RK.px(g, t.x + x + (y > 2 && q === 2 ? 1 : 0), t.y - y, FL[Math.min(3, Math.abs(x) + (y > hgt - 2 ? 1 : 0))]); }
  RK.px(g, t.x + (q - 1), t.y - hgt - 1 - (Math.floor(tSec * 3) % 3), '#ffb050');
}
