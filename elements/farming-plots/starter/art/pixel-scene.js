/* GameDNA pixel scene kit - plain script, no import/export, one global: GameDNA_PixelScene (alias PXS)
 *
 * Demo-page scenery only (never part of an element's module). Everything is drawn in code at native resolution
 * (1 art px = 1 canvas px, 16 px tiles), light from the top left, fixed palettes, no images, no smoothing.
 *
 *   scene({map:[rows of chars], seed, props:[{k, x, y, ...}], forest:true}) -> scene      top-down outdoor map
 *   room({cols, rows, wallRows, floor, wall, props:[...]}) -> scene                      top-down interior
 *   side({w, h, ground:[...], ...}) -> see sideGround()                                 side-view ground strip
 *   scene.drawGround(g, tMs, ox, oy)      baked ground (water animates, 4 frames at 3 fps)
 *   scene.items                           standing props [{y, draw(g, tMs, ox, oy)}], y = base line for depth sorting
 *   scene.draw(g, tMs, extras, ox, oy)    ground, then props and extras [{y, draw(g)}] sorted by y
 *   scene.kindAt(cx, cy), scene.blocked(cx, cy)
 *   prop(kind, opts) -> {frames:[canvas], ax, ay, fps}     one prop sprite, anchor = base centre
 *   actor(g, x, y, {pal, dir, frame})    16x20 villager/hero, feet centre at (x, y)
 *   fighter({pal, head, gear, robe, beard, shield}) -> {normal, white, grey, facing: 'left', variant('right')}   24x32 side-view battle figure;
 *     variant('right') is a painted right-facing copy (gear in the same hands, light kept top-left) for figures that must not be mirrored
 *   flipX(asset, want), drawFighter(g, f, x, footY, want, mode)   mirror computed from the asset's facing, never typed per page
 *
 * Map chars: . grass  , lush grass  : dry grass  p dirt path  c cobbles  s sand  f tilled field  w water
 *            ^ raised grass (a rock face is drawn along its south edge)  b bridge (walk east-west)  B bridge (north-south)
 *            # stone wall block (joins its neighbours)
 *            T tree  t small tree  P pine  u bush  r rock  R boulder  F flower bed  S stump  h grassy mound  M rocky peak   (all on grass)
 * Source is ASCII only (pages may be loaded without a charset).
 */
(function (root) {
  'use strict';
  var T = 16, OLN = '#1a1024';
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
  function hsh(x, y, s) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
  function sm(t) { return t * t * (3 - 2 * t); }
  function vn(x, y, sc, s) { var u = x / sc, v = y / sc, i = Math.floor(u), j = Math.floor(v), fx = sm(u - i), fy = sm(v - j); var a = hsh(i, j, s), b = hsh(i + 1, j, s), c = hsh(i, j + 1, s), d = hsh(i + 1, j + 1, s); return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy; }
  var RGB = {};
  function rgb(h) { var v = RGB[h]; if (!v) { var n = parseInt(h.slice(1), 16); v = RGB[h] = [n >> 16, (n >> 8) & 255, n & 255]; } return v; }

  var PAL = {
    grass: ['#245030', '#33703a', '#3f8a3c', '#4c9a3e', '#5eac44', '#7cc050', '#a4d868'],   // 3 = base, 4 = light patch, 2 = shade patch
    lush: ['#1c4630', '#2a6238', '#35783a', '#41883c', '#57a044'],
    dry: ['#6c8a3a', '#86a044', '#9cb450', '#b4c860'],
    leaf: ['#12302a', '#1c4a2e', '#2a6632', '#3c8438', '#58a444', '#84c656'],
    pine: ['#0e2a2c', '#184034', '#22583a', '#32743e', '#4c9248'],
    autumn: ['#4a1c1c', '#7a2c20', '#a8482a', '#cc7030', '#e89a44', '#f8c868'],
    dirt: ['#5a3c22', '#7a5630', '#96703c', '#b08a4c', '#c6a05c', '#dcba74'],
    sand: ['#8a7044', '#b0945c', '#ccb070', '#e2cc8c', '#f4e4ae'],
    water: ['#142c6c', '#1c4494', '#2658b0', '#2e6cc4', '#4a8cdc', '#7cbcf0', '#c8ecff'],
    rock: ['#2e2638', '#4c3e4c', '#6e5a5c', '#917a6c', '#b49c80', '#d8c49c'],
    stone: ['#3a3448', '#58506a', '#7a7088', '#9c94a8', '#c4bccc', '#e4dcea'],
    plank: ['#3a2014', '#5c3420', '#82502c', '#a87240', '#cc9a5c', '#e8c080'],
    roof: { red: ['#4a1420', '#7a2430', '#a8383a', '#cc5a48', '#ec8a64'], blue: ['#141c4a', '#243a7a', '#3458a8', '#4c7ccc', '#7cacec'], slate: ['#22202e', '#3a384c', '#56546c', '#787890', '#a4a4b8'], thatch: ['#5a4018', '#86642a', '#b08c3c', '#d0b054', '#ecd47c'], green: ['#10301c', '#1c5030', '#2c7444', '#44985c', '#74c084'] },
    wall: { plaster: ['#8a7a66', '#b4a488', '#d8cab0', '#f0e6d0'], stone: ['#4a4456', '#6c6478', '#908a9c', '#b8b2c0'], timber: ['#6a4a2a', '#8c6638', '#b08a54', '#d0aa74'] }
  };

  /* ---------- tiny pixel canvas helper ---------- */
  function Art(w, h) {
    var c = mk(w, h), g = c.getContext('2d');
    var A = { c: c, g: g, w: w, h: h,
      P: function (x, y, col) { if (x < 0 || y < 0 || x >= w || y >= h) return; g.fillStyle = col; g.fillRect(x | 0, y | 0, 1, 1); },
      R: function (x, y, ww, hh, col) { g.fillStyle = col; g.fillRect(x | 0, y | 0, ww | 0, hh | 0); },
      data: function () { return g.getImageData(0, 0, w, h); },
      // 1 px outline around every opaque pixel (4-neighbour), drawn only on transparent pixels
      outline: function (col) {
        var d = g.getImageData(0, 0, w, h), a = d.data, add = [], x, y;
        var op = function (X, Y) { return X >= 0 && Y >= 0 && X < w && Y < h && a[(Y * w + X) * 4 + 3] > 0; };
        for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (!op(x, y) && (op(x + 1, y) || op(x - 1, y) || op(x, y + 1) || op(x, y - 1))) add.push([x, y]);
        g.fillStyle = col; add.forEach(function (p) { g.fillRect(p[0], p[1], 1, 1); });
      } };
    return A;
  }
  // palette-string art: rows of chars, '.' transparent
  var KEY = { o: OLN, w: '#ffffff', k: '#0c0a14',
    b: '#82502c', B: '#5c3420', n: '#a87240', N: '#cc9a5c', D: '#3a2014',
    s: '#c4bccc', S: '#9c94a8', t: '#7a7088', X: '#58506a', x: '#3a3448',
    g: '#58a444', G: '#3c8438', d: '#2a6632', l: '#84c656',
    r: '#e04848', R: '#a8283a', q: '#701c30', p: '#f08ab0',
    y: '#ffe070', Y: '#d8a030', u: '#fff4b0', e: '#ff8a3a', E: '#d8502a',
    m: '#d0d8ec', M: '#8a94b4', i: '#586080',
    a: '#7cbcf0', A: '#2e6cc4', c: '#4a8cdc',
    v: '#b89adc', V: '#7a58a8', h: '#f4e4ae', H: '#ccb070', z: '#e8dcc0', Z: '#b4a488' };
  function strArt(rows, key, w) {
    var W = w || rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0), A = Art(W, rows.length);
    rows.forEach(function (r, y) { for (var x = 0; x < r.length; x++) { var ch = r[x]; if (ch === '.' || ch === ' ') continue; var col = (key && key[ch]) || KEY[ch]; if (col) A.P(x, y, col); } });
    return A;
  }
  function flip(c) { var o = mk(c.width, c.height), g = o.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0); return o; }

  /* ---------- props ---------- */
  var PC = {};
  function shadeBall(A, lobes, ramp, seed, opt) {
    // lobes [[cx, cy, r]...]: union of shaded balls, later/lower lobes sit in front; light from the top left
    opt = opt || {};
    var w = A.w, h = A.h, x, y, i;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var best = -1, bs = -1e9, bd = 0;
      for (i = 0; i < lobes.length; i++) { var L = lobes[i], d = Math.hypot(x + 0.5 - L[0], (y + 0.5 - L[1]) * (L[3] || 1)); if (d <= L[2]) { var sc = (L[2] - d) + L[1] * 0.45; if (sc > bs) { bs = sc; best = i; bd = d; } } }
      if (best < 0) continue;
      var B = lobes[best], nx = (x + 0.5 - B[0]) / B[2], ny = (y + 0.5 - B[1]) * (B[3] || 1) / B[2];
      var lit = -(nx * 0.62 + ny * 0.78) + (hsh(x >> 1, (y + (x >> 1 & 1)) >> 1, seed) - 0.5) * (opt.rough == null ? 0.5 : opt.rough);
      // crease: near this lobe's rim but inside another lobe
      var inner = false; if (B[2] - bd < 1.6) for (i = 0; i < lobes.length; i++) if (i !== best) { var L2 = lobes[i]; if (Math.hypot(x + 0.5 - L2[0], (y + 0.5 - L2[1]) * (L2[3] || 1)) < L2[2] - 1.2) { inner = true; break; } }
      var n = ramp.length, k = lit > 0.62 ? n - 1 : lit > 0.22 ? n - 2 : lit > -0.3 ? n - 3 : n - 4;
      if (inner && nx * 0.62 + ny * 0.78 > -0.2) k = Math.max(1, k - 1);
      A.P(x, y, ramp[Math.max(1, Math.min(n - 1, k))]);
    }
  }
  function build(kind, o) {
    o = o || {}; var A, x, y, i, v = o.v | 0, P = PAL;
    if (kind === 'tree' || kind === 'smalltree') {
      var small = kind === 'smalltree', L = o.autumn ? P.autumn : P.leaf, lob;
      if (small) { A = Art(20, 26); lob = [[[10, 8, 6.4], [6, 11, 4.6], [14, 11, 4.8], [10, 13, 5.2]], [[10, 7, 5.6], [6.5, 10.5, 5], [13.5, 10, 5], [9.5, 13.5, 4.8], [13, 13.5, 4]], [[9.5, 8.5, 6], [14, 9.5, 4.5], [6, 12, 4.2], [11, 13.5, 4.8]]][v % 3]; }
      else { A = Art(30, 36); lob = [[[15, 10, 8.6], [8.5, 14.5, 6.4], [21.5, 14.5, 6.4], [15, 18, 7.4], [10.5, 7.5, 5.2], [19.5, 8, 5.2]], [[15, 8.5, 7.4], [9, 13.5, 6.6], [20.5, 12.5, 6.8], [13.5, 18.5, 6.6], [19.5, 18.5, 5.4]], [[14, 11, 7.6], [6.8, 15.5, 5.6], [22, 13.5, 6.6], [15, 18.5, 7.2], [9.5, 8.5, 5], [19.5, 8.5, 4.6]]][v % 3]; }
      var tx = small ? 9 : 13, ty = small ? 15 : 22, tb = small ? 24 : 34, tw = small ? 3 : 4;
      // trunk + roots
      for (y = ty; y <= tb; y++) for (x = 0; x < tw; x++) A.P(tx + x, y, x === 0 ? P.plank[3] : x === tw - 1 ? P.plank[1] : P.plank[2]);
      A.P(tx - 1, tb, P.plank[2]); A.P(tx - 1, tb - 1, P.plank[3]); A.P(tx + tw, tb, P.plank[1]); A.P(tx + tw, tb - 1, P.plank[1]); if (!small) { A.P(tx - 2, tb, P.plank[2]); A.P(tx + tw + 1, tb, P.plank[1]); A.P(tx + 1, tb - 4, P.plank[1]); A.P(tx + 2, tb - 7, P.plank[1]); }
      for (y = ty; y < ty + (small ? 5 : 7); y++) for (x = 0; x < tw; x++) A.P(tx + x, y, y < ty + (small ? 3 : 5) ? P.plank[0] : P.plank[1]);   // canopy shadow on the trunk
      shadeBall(A, lob, L, 11 + v * 7 + (small ? 40 : 0), { rough: 0.55 });
      // leaf sparkle on the lit side
      for (i = 0; i < (small ? 5 : 9); i++) { var sx = Math.floor(hsh(i, v, 71) * A.w), sy = Math.floor(hsh(i, v, 73) * A.h * 0.5); var d0 = A.g.getImageData(sx, sy, 1, 1).data, top = rgb(L[L.length - 2]); if (d0[3] && d0[0] === top[0] && d0[1] === top[1]) { A.P(sx, sy, L[L.length - 1]); A.P(sx + 1, sy, L[L.length - 1]); } }
      if (o.fruit) for (i = 0; i < 5; i++) { var fx = 5 + Math.floor(hsh(i, v, 81) * (A.w - 11)), fy = 6 + Math.floor(hsh(i, v, 83) * 12); A.P(fx, fy, '#e04848'); A.P(fx, fy + 1, '#a8283a'); A.P(fx - 1, fy, '#ff8a7a'); }
      A.outline(L[0]);
      // heavier outline under the canopy and round the trunk
      return { frames: [A.c], ax: small ? 10 : 15, ay: small ? 25 : 35, sh: small ? [7, 3] : [11, 4] };
    }
    if (kind === 'pine') {
      A = Art(20, 34); var Pn = P.pine;
      for (y = 26; y <= 32; y++) for (x = 0; x < 3; x++) A.P(8 + x, y, x === 0 ? P.plank[2] : x === 2 ? P.plank[0] : P.plank[1]);
      A.P(7, 32, P.plank[1]); A.P(11, 32, P.plank[0]);
      [[2, 9, 3.5], [8, 16, 5.5], [15, 23, 7.5], [21, 28, 9]].forEach(function (tr, ti) {
        for (y = tr[0]; y <= tr[1]; y++) { var f = (y - tr[0]) / (tr[1] - tr[0]), hw = 0.6 + f * tr[2]; for (x = Math.ceil(9.5 - hw); x <= Math.floor(9.5 + hw); x++) {
          var edge = (y === tr[1]) && ((x + ti) % 3 === 0); if (edge) continue;
          var side = (x - 9.5) / (hw + 0.01), k = side < -0.45 ? 4 : side < 0.05 ? 3 : side < 0.55 ? 2 : 1; if (y >= tr[1] - 1 && k > 1) k--; if (hsh(x, y, 5 + v) > 0.86 && k < 4) k++;
          A.P(x, y, Pn[k]); } }
      });
      A.P(9, 1, Pn[4]); A.P(9, 0, Pn[3]);
      A.outline(Pn[0]);
      return { frames: [A.c], ax: 10, ay: 33, sh: [7, 3] };
    }
    if (kind === 'bush') {
      A = Art(16, 12); shadeBall(A, [[[5, 6.5, 4.4], [10.5, 6, 4.8], [8, 8, 4]], [[8, 6, 5], [4.5, 8, 3.4], [12, 8, 3.2]]][v % 2], P.leaf, 31 + v, { rough: 0.5 });
      if (o.berries || v % 2) { [[4, 5], [9, 4], [11, 8], [6, 9]].forEach(function (b) { A.P(b[0], b[1], o.flower ? '#f8d0e0' : '#e04848'); A.P(b[0], b[1] + 1, o.flower ? '#d07aa8' : '#8a1c30'); }); }
      A.outline(P.leaf[0]); return { frames: [A.c], ax: 8, ay: 11, sh: [6, 2] };
    }
    if (kind === 'rock' || kind === 'boulder') {
      var big = kind === 'boulder'; A = Art(big ? 20 : 11, big ? 16 : 9);
      var Rk = P.rock, lobes = big ? [[[10, 8.5, 7.6, 1.25], [5.5, 11, 4.2, 1.2], [14.5, 11, 4.6, 1.3]], [[9, 9, 6.6, 1.2], [14, 10.5, 5, 1.3], [5, 11.5, 3.6, 1.2]]][v % 2] : [[[5.5, 5, 4.6, 1.35]], [[4.5, 5.2, 3.8, 1.3], [7.5, 5.6, 3, 1.4]]][v % 2];
      shadeBall(A, lobes, [Rk[0], Rk[1], Rk[2], Rk[3], Rk[4], Rk[5]], 51 + v, { rough: 0.25 });
      if (big) { A.P(8, 6, Rk[1]); A.P(9, 7, Rk[1]); A.P(9, 8, Rk[2]); A.P(13, 9, Rk[1]); A.P(4, 13, P.grass[5]); A.P(5, 12, P.grass[4]); A.P(15, 13, P.grass[4]); A.P(16, 12, P.grass[5]); if (o.moss) { for (i = 0; i < 9; i++) A.P(5 + (i * 3) % 8, 3 + (i % 3), i % 2 ? P.leaf[4] : P.leaf[3]); } }
      A.outline(Rk[0]); return { frames: [A.c], ax: big ? 10 : 5, ay: big ? 15 : 8, sh: big ? [9, 3] : [5, 2] };
    }
    if (kind === 'hill') {
      A = Art(18, 13); shadeBall(A, [[[9, 9.5, 8.2, 1.5], [5, 10.5, 4.6, 1.5]], [[8, 9.5, 7.6, 1.5], [13, 10.5, 4.4, 1.6]]][v % 2], [P.grass[0], P.grass[1], P.grass[2], P.grass[4], P.grass[5], P.grass[6]], 171 + v, { rough: 0.3 });
      A.P(6, 7, P.dirt[3]); A.P(7, 7, P.dirt[2]); A.P(10, 9, P.dirt[2]); A.P(11, 6, P.grass[6]); A.P(4, 9, P.grass[6]);
      A.outline(P.grass[0]); return { frames: [A.c], ax: 9, ay: 12, sh: [8, 2] };
    }
    if (kind === 'peak') {
      A = Art(18, 20); var Rp = P.rock;
      for (y = 1; y < 19; y++) { var hwp = 0.8 + (y - 1) * 0.46 + (hsh(y, v, 181) - 0.5) * 1.2; for (x = Math.ceil(9 - hwp); x <= Math.floor(8.5 + hwp); x++) { var rid = 8.5 + Math.round(Math.sin(y * 0.9 + v) * 1.2), litp = x < rid; A.P(x, y, y < 5 + (x % 2) ? (litp ? '#f4f8ff' : '#c0cce8') : litp ? (x < rid - 2 ? Rp[4] : Rp[5]) : (x > rid + 3 ? Rp[1] : Rp[2])); } }
      A.P(6, 12, Rp[3]); A.P(5, 14, Rp[3]); A.P(11, 10, Rp[1]); A.P(12, 14, Rp[3]);
      A.outline(Rp[0]); return { frames: [A.c], ax: 9, ay: 19, sh: [9, 2] };
    }
    if (kind === 'stump') {
      A = strArt(['..oooooo..', '.oNNnNNNo.', 'oNnNbnNnNo', 'oNNbnbNNno', 'obNNNNNnbo', 'obbnnnnbBo', 'onbbbbbBBo', 'onbBbbBBBo', '.oooooooo.']);
      return { frames: [A.c], ax: 5, ay: 8, sh: [5, 2] };
    }
    if (kind === 'log') {
      A = strArt(['.oooooooooooooo.', 'oNNonnnnnnnnnnbo', 'oNboNnnbnnnnbbBo', 'oNboNnnnnnbnbBBo', 'oNNobbbbbbbbBBBo', '.oooooooooooooo.']);
      return { frames: [A.c], ax: 8, ay: 5, sh: [8, 2] };
    }
    if (kind === 'sign') {
      A = strArt(['.oooooooooooo.', 'oNNNNNNNNNNNNo', 'oNbbbnbbbbbnNo', 'oNnnnnnnnnnnbo', 'oNbbbbnbbbnnbo', 'onnnnnnnnnnbbo', '.oooooobooooo.', '.....onbo.....', '.....onbo.....', '.....onbo.....', '.....onBo.....', '.....oooo.....']);
      return { frames: [A.c], ax: 7, ay: 11, sh: [4, 1] };
    }
    if (kind === 'lantern') {
      var lit = o.lit !== false, fr = [];
      for (i = 0; i < (lit ? 3 : 1); i++) {
        var gl = lit ? ['y', 'u', 'y'][i] : 'i', gc = lit ? ['u', 'w', 'u'][i] : 'M';
        fr.push(strArt(['..ooo..', '.oXXXo.', 'oX' + gl + gc + gl + 'Xo', 'oX' + gc + gl + gl + 'Xo', 'oX' + gl + gl + gl + 'Xo', '.oXXXo.', '..oMo..', '..oMo..', '..oMo..', '..oMo..', '..oMo..', '..oMo..', '..oMo..', '..oio..', '..oio..', '.oXiXo.', '.ooooo.']).c);
      }
      return { frames: fr, ax: 3, ay: 16, sh: [3, 1], fps: 7, glow: lit ? { dy: -13, r: 14 } : null };
    }
    if (kind === 'well') {
      A = strArt(['..oooooooooooooo..', '.orrrrrrrrrrrrRRo.', 'orrrRrrrrRrrrrRRqo', 'oooooooooooooooooo', '..ob..........ob..', '..ob....Do....ob..', '..ob....Do....ob..', '..ob...oMMo...ob..', '.ooboooooooooobooo', 'osssssSSSSSSSSStto', 'osSoAAAAcAAAAoStXo', 'ostoAcAAAAAAAotXXo', 'oSssoooooooooSStXo', 'osSsSsSStSSsStStXo', 'otSSsSStSSsSStXtXo', 'oXttXtttXttXttXXXo', '.oooooooooooooooo.']);
      return { frames: [A.c], ax: 9, ay: 16, sh: [9, 3] };
    }
    if (kind === 'crate') {
      A = strArt(['oooooooooooo', 'oNNNNNNNNNNo', 'oNbnnnnnnbBo', 'oNnbnnnnbnBo', 'oNnnbnnbnnBo', 'oNnnnbbnnnBo', 'oNnnnbbnnnBo', 'oNnnbnnbnnBo', 'oNnbnnnnbnBo', 'oNbnnnnnnbBo', 'onBBBBBBBBBo', 'oooooooooooo']);
      return { frames: [A.c], ax: 6, ay: 11, sh: [6, 2] };
    }
    if (kind === 'barrel') {
      A = strArt(['..oooooo..', '.oNNnnnbo.', 'oNNnnnnbBo', 'oMMMMMMMio', 'oNnnnnbbBo', 'oNnNnnbbBo', 'oNnnnnbbBo', 'oNnNnnbbBo', 'oMMMMMMMio', 'onnnnbbBBo', '.onnbbBBo.', '..oooooo..']);
      return { frames: [A.c], ax: 5, ay: 11, sh: [5, 2] };
    }
    if (kind === 'pot') {
      A = strArt(['..oooo..', '.oeeEEo.', '..oEEo..', '.oeeeEo.', 'oeeueEEo', 'oeeeeEEo', 'oEeeEEEo', '.oEEEEo.', '..oooo..'], { e: '#c87848', E: '#8a4a30', u: '#eca070' });
      return { frames: [A.c], ax: 4, ay: 8, sh: [4, 1] };
    }
    if (kind === 'hay') {
      A = Art(18, 14); shadeBall(A, [[9, 8, 7.6, 1.25], [9, 5, 5.2, 1.2]], ['#5a4018', '#86642a', '#b08c3c', '#d0b054', '#ecd47c'], 61, { rough: 0.7 });
      for (i = 0; i < 6; i++) A.P(3 + i * 2 + (i % 2), 11 + (i % 2), '#86642a');
      A.outline('#3a2810'); return { frames: [A.c], ax: 9, ay: 13, sh: [8, 2] };
    }
    if (kind === 'fence') {
      // o.len px, horizontal run; posts every 12 px
      var len = Math.max(6, o.len || 32); A = Art(len, 12);
      for (x = 0; x < len; x++) { A.P(x, 4, P.plank[4]); A.P(x, 5, P.plank[2]); A.P(x, 3, OLN); A.P(x, 6, OLN); A.P(x, 8, P.plank[3]); A.P(x, 9, P.plank[1]); A.P(x, 7, OLN); A.P(x, 10, OLN); if (hsh(x, 3, 9) > 0.8) A.P(x, 5, P.plank[1]); }
      for (x = 1; x < len - 2; x += 12) { for (y = 1; y <= 11; y++) { A.P(x - 1, y, OLN); A.P(x + 3, y, OLN); A.P(x, y, P.plank[4]); A.P(x + 1, y, P.plank[3]); A.P(x + 2, y, P.plank[1]); } A.P(x, 0, OLN); A.P(x + 1, 0, OLN); A.P(x + 2, 0, OLN); A.P(x, 1, P.plank[5]); A.P(x + 1, 1, P.plank[4]); A.P(x, 11, OLN); A.P(x + 1, 11, OLN); A.P(x + 2, 11, OLN); }
      return { frames: [A.c], ax: 0, ay: 11, sh: null, left: true };
    }
    if (kind === 'fencev') {
      // o.len px, vertical run (seen from above: posts with a rail between)
      var ln = Math.max(8, o.len || 32); A = Art(5, ln);
      for (y = 2; y < ln - 1; y++) { A.P(1, y, P.plank[4]); A.P(2, y, P.plank[3]); A.P(3, y, P.plank[1]); A.P(0, y, OLN); A.P(4, y, OLN); }
      for (y = 0; y < ln - 6; y += 12) { for (i = 0; i < 7; i++) { A.P(0, y + i, OLN); A.P(4, y + i, OLN); A.P(1, y + i, P.plank[5]); A.P(2, y + i, P.plank[4]); A.P(3, y + i, P.plank[2]); } A.R(0, y, 5, 1, OLN); A.R(0, y + 7, 5, 1, OLN); A.P(1, y + 1, P.plank[5]); A.P(2, y + 1, P.plank[5]); }
      A.R(0, ln - 1, 5, 1, OLN);
      return { frames: [A.c], ax: 2, ay: ln - 1, sh: null };
    }
    if (kind === 'flowers') {
      A = Art(14, 8); var cols = [['#ffffff', '#d8dcf4'], ['#ffe070', '#e0a030'], ['#ff8aa8', '#d85080'], ['#b89adc', '#7a58a8']];
      for (i = 0; i < 6; i++) { var px = 1 + Math.floor(hsh(i, v, 91) * 11), py = Math.floor(hsh(i, v, 93) * 5), c2 = cols[(i + v) % 4]; A.P(px, py, c2[0]); A.P(px + 1, py, c2[1]); A.P(px, py + 1, c2[1]); A.P(px + 1, py + 1, P.leaf[2]); A.P(px, py + 2, P.leaf[2]); }
      return { frames: [A.c], ax: 7, ay: 7, sh: null, flat: true };
    }
    if (kind === 'campfire') {
      var fs = [];
      for (i = 0; i < 4; i++) {
        var F = [['....y....', '...yuy...', '..eyuye..', '..eyyye..', '.EeeyeeE.'], ['...y.....', '...uy....', '..eyuy...', '..eyyye..', '.EeyyeeE.'], ['.....y...', '....yu...', '...yuye..', '..eyyye..', '.EeeyyeE.'], ['....y....', '....u....', '..eyuye..', '.Eeyuye..', '.EeyyeeE.']][i];
        fs.push(strArt(['.........', '.........'].concat(F, ['oBnoEeonBo'.slice(0, 9), 'obBBooBBb', '.ooooooo.']).map(function (r) { return ' ' + r; })).c);
      }
      return { frames: fs, ax: 5, ay: 9, sh: [5, 2], fps: 8, glow: { dy: -5, r: 18 } };
    }
    if (kind === 'chest') {
      A = strArt(['.oooooooooooo.', 'oNNNNNNNNNNNbo', 'oNnnnnnnnnnbBo', 'oyYYYYyyYYYYYo', 'onnnnnyYnnnbBo', 'onnnnnYYnnbbBo', 'onbnnnnnnnbbBo', 'oyYYYYYYYYYYYo', '.oooooooooooo.']);
      return { frames: [A.c], ax: 7, ay: 8, sh: [7, 2] };
    }
    if (kind === 'bench') {
      A = strArt(['oooooooooooooooo', 'oNNNNNNNNNNNNNno', 'onnnnnnnnnnnnnbo', 'oooooooooooooooo', '.obo........obo.', '.oBo........oBo.', '.ooo........ooo.']);
      return { frames: [A.c], ax: 8, ay: 6, sh: [8, 2] };
    }
    if (kind === 'statue') {
      A = strArt(['....oooo....', '...ossSto...', '..osssSSto..', '..osSSSSto..', '..oSSkkSto..', '..osSSSSto..', '.oosSSSttoo.', 'ossSsSSSttXo', 'osSSsSSStXXo', 'osSSsSSStXXo', 'ooSSsSSStXoo', '.osSsSSSttXo'.slice(0, 11) + '.', '.osSSsSSttXo'.slice(0, 11) + '.', '.osSSsSStXXo'.slice(0, 11) + '.', 'oooooooooooo', 'osssssssSSto', 'oSSSSSSSttXo', 'otttttttXXXo', 'oooooooooooo']);
      return { frames: [A.c], ax: 6, ay: 18, sh: [7, 2] };
    }
    if (kind === 'tent') {
      var tc = o.color === 'blue' ? P.roof.blue : o.color === 'green' ? P.roof.green : P.roof.red; A = Art(36, 28);
      for (y = 2; y <= 26; y++) { var hw2 = 1 + (y - 2) * 0.68; for (x = Math.ceil(18 - hw2); x <= Math.floor(17 + hw2); x++) { var side2 = (x - 17.5) / hw2, stripe = Math.floor((x - 17.5) / (hw2 / 3.2) + 20) % 2; A.P(x, y, side2 < -0.1 ? (stripe ? tc[4] : '#f0e6d0') : (stripe ? tc[2] : '#b4a488')); } }
      for (y = 14; y <= 26; y++) { var dw = (y - 13) * 0.3; for (x = Math.ceil(17.5 - dw); x <= Math.floor(17.5 + dw); x++) A.P(x, y, y > 16 && Math.abs(x - 17.5) < dw - 0.8 ? '#1a1024' : '#2e2638'); }
      A.P(17, 1, P.plank[2]); A.P(17, 0, P.plank[3]); A.P(18, 0, tc[3]); A.P(19, 0, tc[3]); A.P(18, 1, tc[2]);
      A.outline(OLN); return { frames: [A.c], ax: 18, ay: 27, sh: [17, 3] };
    }
    if (kind === 'stall') {
      var sc2 = o.color === 'blue' ? P.roof.blue : o.color === 'green' ? P.roof.green : P.roof.red; A = Art(34, 30);
      for (y = 10; y < 28; y++) { A.P(2, y, P.plank[3]); A.P(3, y, P.plank[1]); A.P(30, y, P.plank[3]); A.P(31, y, P.plank[1]); }
      for (y = 18; y < 28; y++) for (x = 2; x < 32; x++) A.P(x, y, y === 18 ? P.plank[5] : y === 19 ? P.plank[4] : (x % 6 === 0 ? P.plank[1] : y > 25 ? P.plank[1] : P.plank[2]));
      [[6, '#e04848'], [10, '#ffe070'], [14, '#58a444'], [19, '#ff8a3a'], [23, '#b89adc'], [27, '#e04848']].forEach(function (it) { A.P(it[0], 16, it[1]); A.P(it[0] + 1, 16, it[1]); A.P(it[0], 17, it[1]); A.P(it[0] + 1, 17, OLN); A.P(it[0] + 1, 15, it[1]); });
      for (y = 0; y < 10; y++) for (x = 0; x < 34; x++) { var st = Math.floor(x / 4) % 2, lip = y >= 8; if (lip && ((x % 4) === 3)) continue; A.P(x, y, st ? (y < 2 ? sc2[4] : lip ? sc2[2] : sc2[3]) : (y < 2 ? '#ffffff' : lip ? '#c8c0b0' : '#f0e6d0')); }
      for (x = 0; x < 34; x++) A.P(x, 10, 'rgba(26,16,36,0.35)');
      A.outline(OLN); return { frames: [A.c], ax: 17, ay: 29, sh: [16, 3] };
    }
    if (kind === 'house') return house(o);
    if (kind === 'tower') return tower(o);
    /* ----- interior props ----- */
    if (kind === 'bookshelf') {
      A = Art(26, 34); A.R(0, 0, 26, 34, P.plank[1]); A.R(1, 1, 24, 2, P.plank[4]); A.R(1, 3, 24, 1, P.plank[2]);
      var bc = ['#c8483a', '#3c72c4', '#58a444', '#d8a030', '#8a58a8', '#e8dcc0', '#2c6a7a', '#a8383a'];
      for (var sh = 0; sh < 3; sh++) { var by = 5 + sh * 9; A.R(2, by, 22, 7, '#1c1220'); A.R(1, by + 7, 24, 1, P.plank[4]); A.R(1, by + 8, 24, 1, P.plank[0]);
        x = 2; i = 0; while (x < 23) { var bw = 2 + Math.floor(hsh(i, sh, 101 + v) * 2), bh = 5 + Math.floor(hsh(i, sh, 103 + v) * 2), c3 = bc[Math.floor(hsh(i, sh, 105 + v) * bc.length)]; if (hsh(i, sh, 107 + v) < 0.12) { x += 2; i++; continue; } if (x + bw > 24) break; A.R(x, by + 7 - bh, bw, bh, c3); A.R(x, by + 7 - bh, 1, bh, 'rgba(255,255,255,0.28)'); A.R(x + bw - 1, by + 7 - bh, 1, bh, 'rgba(10,6,20,0.3)'); A.P(x, by + 9 - bh, '#ffe9a0'); x += bw; i++; } }
      A.R(0, 32, 26, 2, P.plank[0]); A.R(0, 0, 1, 34, P.plank[3]); A.R(25, 0, 1, 34, P.plank[0]);
      A.outline(OLN); return { frames: [A.c], ax: 13, ay: 33, sh: null };
    }
    if (kind === 'table') {
      var tw2 = o.w || 30; A = Art(tw2, 20);
      for (y = 0; y < 11; y++) for (x = 0; x < tw2; x++) A.P(x, y, y === 0 ? P.plank[5] : x === 0 ? P.plank[5] : (y % 4 === 3) ? P.plank[2] : (hsh(x >> 2, y >> 2, 111) > 0.7 ? P.plank[3] : P.plank[4]));
      A.R(0, 11, tw2, 3, P.plank[1]); A.R(0, 11, tw2, 1, P.plank[2]);
      A.R(1, 14, 3, 6, P.plank[1]); A.R(1, 14, 1, 6, P.plank[2]); A.R(tw2 - 4, 14, 3, 6, P.plank[0]); A.R(tw2 - 4, 14, 1, 6, P.plank[1]);
      if (o.set !== false) { A.R(5, 3, 5, 4, '#e8dcc0'); A.R(5, 3, 5, 1, '#ffffff'); A.R(6, 4, 3, 2, '#c87848'); A.R(tw2 - 11, 2, 2, 5, '#e8dcc0'); A.R(tw2 - 11, 1, 2, 1, '#ffe070'); A.P(tw2 - 11, 0, '#fff4b0'); A.R(tw2 - 8, 5, 4, 3, '#8a94b4'); A.R(tw2 - 8, 5, 4, 1, '#d0d8ec'); }
      A.outline(OLN); return { frames: [A.c], ax: tw2 >> 1, ay: 19, sh: [tw2 >> 1, 2] };
    }
    if (kind === 'stool') { A = strArt(['.oooooo.', 'oNNNNNno', 'onnnnbBo', '.oooooo.', '.oboobo.', '.oBooBo.', '.oo..oo.']); return { frames: [A.c], ax: 4, ay: 6, sh: [4, 1] }; }
    if (kind === 'bed') {
      A = Art(20, 30); A.R(0, 0, 20, 30, P.plank[1]); A.R(1, 1, 18, 4, P.plank[3]); A.R(1, 1, 18, 1, P.plank[5]);
      A.R(2, 5, 16, 7, '#e8ecf8'); A.R(2, 5, 16, 1, '#ffffff'); A.R(3, 10, 14, 2, '#b8c0d8'); A.R(4, 6, 12, 4, '#ffffff'); A.R(4, 9, 12, 1, '#c8d0e4');
      var bl = o.color === 'red' ? P.roof.red : P.roof.blue; for (y = 12; y < 27; y++) for (x = 2; x < 18; x++) A.P(x, y, y === 12 ? bl[4] : x === 2 ? bl[4] : x === 17 ? bl[1] : ((x + y) % 6 === 0 ? bl[4] : y > 24 ? bl[1] : bl[3]));
      A.R(1, 27, 18, 2, P.plank[2]); A.R(1, 29, 18, 1, P.plank[0]);
      A.outline(OLN); return { frames: [A.c], ax: 10, ay: 29, sh: null };
    }
    if (kind === 'counter') {
      var cw = o.w || 48; A = Art(cw, 18);
      for (y = 0; y < 7; y++) for (x = 0; x < cw; x++) A.P(x, y, y === 0 ? P.plank[5] : y === 6 ? P.plank[2] : (hsh(x >> 3, y >> 1, 121) > 0.6 ? P.plank[3] : P.plank[4]));
      for (y = 7; y < 18; y++) for (x = 0; x < cw; x++) A.P(x, y, y === 7 ? P.plank[0] : x % 12 === 0 ? P.plank[0] : x % 12 === 1 ? P.plank[3] : y === 17 ? P.plank[0] : P.plank[2]);
      A.outline(OLN); return { frames: [A.c], ax: cw >> 1, ay: 17, sh: null };
    }
    if (kind === 'anvil') { A = strArt(['.oooooooooooo..', 'ommmmmmmmmmmMo.', 'oMMMMMMMMMMMio.', '.oooMMMMiiooo..', '...oMMMiio.....', '...oMMiiio.....', '..oMMMMiiio....', '.oMMMiiiiiio...', '.ooooooooooo...', '.oBBnnnnnbBo...', '.oBnnnbbbBBo...', '.ooooooooooo...']); return { frames: [A.c], ax: 7, ay: 11, sh: [7, 2] }; }
    if (kind === 'sack') { A = strArt(['...oooo...', '..ohHHho..', '...oHHo...', '..ohhhHo..', '.ohhhhHHo.', 'ohhuhhhHHo', 'ohhhhhHHHo', 'oHhhhHHHHo', '.oHHHHHHo.', '..oooooo..'], { h: '#d8c08a', H: '#a88a58', u: '#f4e4ae' }); return { frames: [A.c], ax: 5, ay: 9, sh: [5, 1] }; }
    if (kind === 'plant') { A = Art(14, 20); shadeBall(A, [[7, 6, 5.4], [3.8, 8.5, 3.4], [10.2, 8.5, 3.4]], P.leaf, 131, { rough: 0.4 }); A.outline(P.leaf[0]); var pt = strArt(['oooooooo', 'oeeeeeEo', '.oeeeEo.', '.oeeEEo.', '.oeEEEo.', '.oooooo.'], { e: '#c87848', E: '#8a4a30' }); A.g.drawImage(pt.c, 3, 13); return { frames: [A.c], ax: 7, ay: 19, sh: [4, 1] }; }
    if (kind === 'pillar') {
      A = Art(14, 44); var St = P.stone;
      for (y = 0; y < 44; y++) for (x = 0; x < 14; x++) { var cap = y < 5 || y > 37, inx = cap ? 0 : 2; if (x < inx || x >= 14 - inx) continue; var fx2 = (x - inx) / (14 - 2 * inx - 1); A.P(x, y, (cap && (y === 0 || y === 38)) ? St[5] : fx2 < 0.15 ? St[5] : fx2 < 0.45 ? St[4] : fx2 < 0.75 ? St[3] : St[2]); }
      for (y = 8; y < 36; y += 9) A.R(2, y, 10, 1, St[2]); A.R(0, 43, 14, 1, St[1]); A.R(0, 4, 14, 1, St[2]);
      A.outline(OLN); return { frames: [A.c], ax: 7, ay: 43, sh: [7, 2] };
    }
    if (kind === 'torch') {
      var tf = [];
      for (i = 0; i < 4; i++) { var Fl = [['..y..', '.yuy.', '.eye.', '.Eee.'], ['.y...', '.uy..', '.eyy.', '.Eee.'], ['...y.', '..yu.', '.yye.', '.eeE.'], ['..y..', '..u..', '.eye.', '.eeE.']][i]; tf.push(strArt(Fl.concat(['oMMMo', '.oMo.', '.obo.', '.obo.', '.oBo.', '..o..'])).c); }
      return { frames: tf, ax: 2, ay: 9, sh: null, fps: 8, glow: { dy: -7, r: 20 }, wall: true };
    }
    if (kind === 'window') {
      var night = !!o.night; A = Art(22, 24); A.R(0, 0, 22, 24, P.plank[1]); A.R(1, 1, 20, 1, P.plank[4]); A.R(1, 1, 1, 22, P.plank[3]);
      for (y = 2; y < 20; y++) for (x = 2; x < 20; x++) { var sky = night ? (y < 9 ? '#141c4a' : y < 14 ? '#1e2c68' : '#2a3c80') : (y < 8 ? '#6cb4ec' : y < 13 ? '#98d0f4' : '#c8ecff'); A.P(x, y, sky); }
      if (night) { [[5, 4], [15, 6], [9, 11], [17, 13], [4, 15]].forEach(function (s2) { A.P(s2[0], s2[1], '#e8ecff'); }); A.R(12, 3, 3, 3, '#f4f0d0'); A.P(12, 3, '#141c4a'); A.P(14, 5, '#c8c4a0'); }
      else { A.R(4, 5, 6, 2, '#ffffff'); A.R(6, 4, 3, 1, '#ffffff'); A.R(12, 10, 5, 2, '#ffffff'); for (x = 2; x < 20; x++) for (y = 15 + ((x * 7) % 3); y < 20; y++) A.P(x, y, y < 17 ? '#58a444' : '#3c8438'); }
      A.R(10, 2, 2, 18, P.plank[2]); A.R(2, 10, 18, 2, P.plank[2]); A.R(10, 2, 1, 18, P.plank[4]); A.R(2, 10, 18, 1, P.plank[4]);
      for (i = 0; i < 6; i++) A.P(3 + i, 3 + i, 'rgba(255,255,255,0.35)');
      A.R(0, 20, 22, 2, P.plank[4]); A.R(0, 22, 22, 2, P.plank[0]);
      A.outline(OLN); return { frames: [A.c], ax: 11, ay: 23, sh: null, wall: true };
    }
    if (kind === 'banner') {
      var bcR = o.color === 'blue' ? P.roof.blue : o.color === 'green' ? P.roof.green : P.roof.red; A = Art(16, 30);
      A.R(0, 0, 16, 2, '#d8a030'); A.R(0, 0, 16, 1, '#ffe070');
      for (y = 2; y < 29; y++) for (x = 1; x < 15; x++) { var cut = y > 23 && Math.abs(x - 7.5) < (y - 23) * 1.3; if (cut) continue; A.P(x, y, x < 3 ? bcR[4] : x > 11 ? bcR[1] : y < 4 ? bcR[1] : bcR[3]); }
      [[7, 8], [8, 8], [6, 9], [9, 9], [5, 10], [10, 10], [5, 11], [10, 11], [6, 12], [9, 12], [7, 13], [8, 13], [7, 10], [8, 11]].forEach(function (q) { A.P(q[0], q[1], '#ffe070'); });
      for (x = 2; x < 14; x++) { A.P(x, 4, '#d8a030'); A.P(x, 18, '#d8a030'); }
      A.outline(OLN); return { frames: [A.c], ax: 8, ay: 29, sh: null, wall: true };
    }
    if (kind === 'shelf') {
      A = Art(30, 14); A.R(0, 10, 30, 2, P.plank[4]); A.R(0, 12, 30, 1, P.plank[1]); A.R(2, 13, 2, 1, P.plank[1]); A.R(26, 13, 2, 1, P.plank[1]);
      [[3, '#58a444', 7], [8, '#d8a030', 5], [12, '#e04848', 8], [17, '#4a8cdc', 6], [22, '#b89adc', 7], [26, '#e8dcc0', 4]].forEach(function (bt) { var h2 = bt[2]; A.R(bt[0], 10 - h2, 3, h2, bt[1]); A.R(bt[0], 10 - h2, 1, h2, 'rgba(255,255,255,0.4)'); A.R(bt[0] + 1, 9 - h2, 1, 1, '#d8c8a0'); A.R(bt[0] + 2, 10 - h2 + 1, 1, h2 - 1, 'rgba(10,6,20,0.3)'); });
      A.outline(OLN); return { frames: [A.c], ax: 15, ay: 13, sh: null, wall: true };
    }
    if (kind === 'door') {
      A = Art(18, 28); A.R(0, 0, 18, 28, P.stone[1]); A.R(1, 1, 16, 1, P.stone[4]); A.R(1, 1, 1, 27, P.stone[3]); A.R(3, 3, 12, 25, P.plank[2]);
      for (x = 3; x < 15; x += 4) { A.R(x, 3, 1, 25, P.plank[3]); A.R(x + 3, 3, 1, 25, P.plank[1]); } A.R(3, 8, 12, 2, '#586080'); A.R(3, 20, 12, 2, '#586080'); A.R(3, 8, 12, 1, '#8a94b4'); A.R(3, 20, 12, 1, '#8a94b4'); A.R(12, 14, 2, 2, '#ffe070'); A.P(13, 15, '#d8a030');
      A.outline(OLN); return { frames: [A.c], ax: 9, ay: 27, sh: null, wall: true };
    }
    if (kind === 'fireplace') {
      var ff = [];
      for (i = 0; i < 4; i++) { A = Art(30, 30); var S2 = P.stone;
        for (y = 0; y < 30; y++) for (x = 0; x < 30; x++) { var rowb = Math.floor(y / 5), offb = rowb % 2 ? 4 : 0, lx = (x + offb) % 8, ly = y % 5; A.P(x, y, y < 3 ? (y === 0 ? S2[5] : S2[4]) : ly === 0 || lx === 0 ? S2[1] : ly === 1 ? S2[4] : (hsh((x + offb) >> 3, rowb, 141) > 0.5 ? S2[3] : S2[2])); }
        for (y = 10; y < 30; y++) for (x = 6; x < 24; x++) { if (y < 13 && (x < 8 + (12 - y) || x > 21 - (12 - y))) continue; A.P(x, y, y > 26 ? '#2a1c1c' : '#140c14'); }
        var Fq = [['....y....y...', '...yuy..yuy..', '..eyuyeeyuye.', '.eeyyyyyyyyee', 'EeeyyeeyyeeeE'], ['...y.....y...', '..yuy...yu...', '..eyuyeyyuye.', '.eeyyyyyyyyee', 'EeeeyyeyyyeeE'], ['.....y..y....', '....yuyyuy...', '..eeyuyyuyee.', '.eeyyyyyyyyee', 'EeeyyyeeyyeeE'], ['....y...y....', '...yu...uy...', '..eyuyeeyuye.', '.eeyyyyyyyyee', 'EeeyyeyyyeeeE']][i];
        A.g.drawImage(strArt(Fq).c, 8, 21); A.g.drawImage(strArt(['oBnnbBonnbBBo']).c, 8, 26);
        A.outline(OLN); ff.push(A.c); }
      return { frames: ff, ax: 15, ay: 29, sh: null, fps: 8, glow: { dy: -6, r: 26 }, wall: true };
    }
    if (kind === 'rack') {
      A = Art(26, 22); A.R(0, 2, 26, 2, P.plank[3]); A.R(0, 4, 26, 1, P.plank[1]); A.R(0, 16, 26, 2, P.plank[3]); A.R(0, 18, 26, 1, P.plank[1]);
      [4, 10, 16, 21].forEach(function (wx, j) { if (j % 2 === 0) { A.R(wx, 0, 1, 14, '#d0d8ec'); A.R(wx + 1, 1, 1, 13, '#8a94b4'); A.R(wx - 1, 14, 4, 1, '#d8a030'); A.R(wx, 15, 2, 5, P.plank[2]); } else { A.R(wx, 0, 1, 21, P.plank[3]); A.R(wx + 1, 0, 1, 21, P.plank[1]); A.R(wx - 1, 0, 4, 1, '#d0d8ec'); A.R(wx, -1, 2, 4, '#8a94b4'); A.P(wx, 1, '#d0d8ec'); } });
      A.outline(OLN); return { frames: [A.c], ax: 13, ay: 21, sh: null, wall: true };
    }
    return build('rock', o);
  }
  function house(o) {
    var w = o.w || 48, wallH = o.wallH || 20, roofH = o.roofH || 22, RF = PAL.roof[o.roof || 'red'], WL = PAL.wall[o.wall || 'plaster'], lit = !!o.lit, h = roofH + wallH + 2;
    var A = Art(w, h), x, y, P = PAL, wy = roofH, by = roofH + wallH;
    // wall
    for (y = wy; y < by; y++) for (x = 2; x < w - 2; x++) {
      var c;
      if (o.wall === 'stone') { var row = Math.floor((y - wy) / 4), off = row % 2 ? 4 : 0, lx = (x + off) % 8, ly = (y - wy) % 4; c = ly === 3 || lx === 0 ? WL[0] : ly === 0 ? WL[3] : hsh((x + off) >> 3, row, 151) > 0.6 ? WL[1] : WL[2]; }
      else if (o.wall === 'timber') { var lx2 = x % 5; c = lx2 === 0 ? WL[0] : lx2 === 1 ? WL[3] : WL[2]; if ((y - wy) % 9 === 8) c = WL[1]; }
      else { c = hsh(x >> 1, y >> 1, 153) > 0.9 ? WL[1] : WL[2]; if (y === wy + 4 && (x % 7) < 2) c = WL[1]; }
      A.P(x, y, c);
    }
    if (o.wall !== 'stone' && o.wall !== 'timber') {   // half-timber frame
      for (y = wy; y < by; y++) { A.P(2, y, P.plank[2]); A.P(3, y, P.plank[1]); A.P(w - 4, y, P.plank[2]); A.P(w - 3, y, P.plank[1]); }
      for (x = 2; x < w - 2; x++) { A.P(x, by - 5, P.plank[1]); }
    }
    // foundation
    for (y = by - 4; y < by; y++) for (x = 2; x < w - 2; x++) { var fl = (x + (y % 2) * 3) % 7; A.P(x, y, y === by - 4 ? P.stone[4] : fl === 0 || y === by - 1 ? P.stone[1] : P.stone[3]); }
    // eave shadow
    for (y = wy; y < wy + 3; y++) for (x = 2; x < w - 2; x++) A.P(x, y, y < wy + 2 ? 'rgba(26,16,36,0.5)' : 'rgba(26,16,36,0.25)');
    // door
    var dx = o.door == null ? (w >> 1) - 5 : o.door, dh = Math.min(15, wallH - 4), dy = by - dh;
    A.R(dx - 1, dy - 1, 12, dh + 1, P.plank[0]); for (y = dy; y < by; y++) for (x = dx; x < dx + 10; x++) A.P(x, y, (x - dx) % 3 === 0 ? P.plank[1] : (x - dx) % 3 === 1 ? P.plank[3] : P.plank[2]);
    A.P(dx, dy, P.plank[0]); A.P(dx + 9, dy, P.plank[0]); A.R(dx + 7, dy + 7, 2, 2, '#ffe070'); A.P(dx + 8, dy + 8, '#d8a030'); A.R(dx, dy + 3, 10, 1, P.plank[1]);
    A.R(dx - 2, by, 14, 2, P.stone[3]); A.R(dx - 2, by, 14, 1, P.stone[5]);
    // windows
    var wins = o.windows || (w >= 44 ? [6, w - 15] : [w - 15]);
    wins.forEach(function (wx) {
      var wyy = wy + 6; if (wx + 9 > dx - 2 && wx < dx + 12) return;
      A.R(wx - 1, wyy - 1, 11, 10, P.plank[0]); A.R(wx, wyy, 9, 8, lit ? '#ffd058' : '#3a5a9c'); A.R(wx, wyy, 9, 3, lit ? '#fff0a8' : '#6c9cd8'); if (!lit) { A.P(wx + 1, wyy + 1, '#c8ecff'); A.P(wx + 2, wyy + 1, '#c8ecff'); A.P(wx + 1, wyy + 2, '#c8ecff'); }
      A.R(wx + 4, wyy, 1, 8, P.plank[1]); A.R(wx, wyy + 4, 9, 1, P.plank[1]); A.R(wx - 1, wyy + 8, 11, 1, P.plank[4]);
      if (o.boxes !== false) { A.R(wx - 1, wyy + 9, 11, 2, P.plank[2]); for (var i = 0; i < 5; i++) { A.P(wx + i * 2, wyy + 8, i % 2 ? '#ff8aa8' : '#e04848'); A.P(wx + i * 2 + 1, wyy + 8, P.leaf[4]); } }
    });
    // roof: shingle rows, hip corners, ridge
    for (y = 0; y < roofH; y++) {
      var inset = y < 4 ? 4 - y : 0;
      for (x = inset; x < w - inset; x++) {
        var rrow = Math.floor((y + 1) / 5), ly2 = (y + 1) % 5, jx = (x + (rrow % 2) * 3) % 6, c2 = ly2 === 4 ? RF[1] : ly2 === 0 ? RF[4] : jx === 0 ? RF[2] : RF[3];
        if (x < inset + 2) c2 = RF[4]; if (x >= w - inset - 3) c2 = ly2 === 4 ? RF[0] : RF[1];
        if (y < 2) c2 = y === 0 ? RF[4] : RF[2];
        if (y === roofH - 1) c2 = RF[0];
        if (ly2 !== 4 && ly2 !== 0 && hsh(x >> 1, rrow, 161) > 0.86) c2 = RF[2];
        A.P(x, y, c2);
      }
    }
    if (o.chimney !== false) { var cx = w - 16; A.R(cx, -0 + 3, 7, 9, '#9a5a48'); A.R(cx, 3, 7, 2, '#c8c0b8'); A.R(cx, 3, 7, 1, '#f0e8e0'); A.R(cx + 5, 5, 2, 7, '#6a3a34'); A.R(cx + 1, 7, 2, 1, '#6a3a34'); A.R(cx + 3, 9, 2, 1, '#6a3a34'); A.R(cx, 12, 7, 1, RF[0]); }
    A.outline(OLN);
    return { frames: [A.c], ax: w >> 1, ay: h - 3, sh: [(w >> 1) + 1, 4], solidW: w - 4, solidH: wallH + 6 };
  }
  function tower(o) {
    var A = Art(26, 50), x, y, St = PAL.stone, RF = PAL.roof[o.roof || 'blue'];
    for (y = 16; y < 48; y++) for (x = 3; x < 23; x++) { var row = Math.floor(y / 4), off = row % 2 ? 4 : 0, lx = (x + off) % 8, ly = y % 4, fx = (x - 3) / 19; var c = ly === 3 || lx === 0 ? St[1] : fx < 0.2 ? St[4] : fx < 0.6 ? St[3] : St[2]; if (ly === 0 && fx < 0.6) c = St[4]; A.P(x, y, c); }
    for (y = 0; y < 17; y++) { var hw = 1 + y * 0.72; for (x = Math.ceil(13 - hw); x <= Math.floor(12 + hw); x++) { var s = (x - 12.5) / hw; A.P(x, y, y === 16 ? RF[0] : s < -0.4 ? RF[4] : s < 0.1 ? RF[3] : s < 0.6 ? RF[2] : RF[1]); } }
    A.R(11, 24, 4, 6, '#1a1024'); A.R(11, 24, 4, 1, St[1]); A.P(11, 24, St[2]); A.P(14, 24, St[2]); A.R(12, 26, 2, 3, o.lit ? '#ffd058' : '#3a5a9c');
    A.R(9, 38, 8, 10, PAL.plank[0]); A.R(10, 39, 6, 9, PAL.plank[2]); A.R(12, 39, 1, 9, PAL.plank[1]); A.R(14, 43, 1, 2, '#ffe070');
    A.R(12, -0, 1, 1, '#ffe070');
    A.outline(OLN); return { frames: [A.c], ax: 13, ay: 48, sh: [12, 4], solidW: 20, solidH: 12 };
  }
  function prop(kind, o) {
    o = o || {}; var key = kind + '|' + JSON.stringify(o);
    return PC[key] || (PC[key] = build(kind, o));
  }
  var GLOW = {};
  function glow(g, x, y, r, col, a) {
    var key = r + col, c = GLOW[key];
    if (!c) { c = GLOW[key] = mk(r * 2 + 1, r * 2 + 1); var gg = c.getContext('2d'); gg.fillStyle = col; [[1, 0.10], [0.72, 0.12], [0.45, 0.16], [0.22, 0.2]].forEach(function (st) { var rr = r * st[0]; gg.globalAlpha = st[1]; for (var yy = -r; yy <= r; yy++) { var hw = Math.floor(Math.sqrt(Math.max(0, rr * rr - yy * yy))); if (hw > 0 || Math.abs(yy) < rr) gg.fillRect(r - hw, r + yy, hw * 2 + 1, 1); } }); }
    var pa = g.globalAlpha; g.globalAlpha = pa * (a == null ? 1 : a); g.drawImage(c, Math.round(x) - r, Math.round(y) - r); g.globalAlpha = pa;
  }

  /* ---------- ground baker ---------- */
  var CLS = { w: 'water', p: 'path', c: 'cobble', s: 'sand', f: 'farm', '^': 'raised', ',': 'lush', ':': 'dry', b: 'water', B: 'water', T: 'lush', P: 'lush' };
  var PROPCH = { h: 'hill', M: 'peak', T: 'tree', t: 'smalltree', P: 'pine', u: 'bush', r: 'rock', R: 'boulder', S: 'stump', F: 'flowers' };
  function scene(spec) {
    var map = spec.map, rows = map.length, cols = map[0].length, W = cols * T, H = rows * T, seed = spec.seed == null ? 7 : spec.seed, CH = spec.cliff || 13;
    var ch = function (cx, cy) { cx = cx < 0 ? 0 : cx >= cols ? cols - 1 : cx; cy = cy < 0 ? 0 : cy >= rows ? rows - 1 : cy; return map[cy].charAt(cx) || '.'; };
    var names = ['water', 'path', 'cobble', 'sand', 'farm', 'raised', 'lush', 'dry'], F = {}, n, x, y, i;
    names.forEach(function (nm) {
      var grid = new Uint8Array(cols * rows), any = false;
      for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) if (CLS[map[y].charAt(x)] === nm) { grid[y * cols + x] = 1; any = true; }
      if (!any) { F[nm] = null; return; }
      var f = new Float32Array(W * H), at = function (cx, cy) { cx = cx < 0 ? 0 : cx >= cols ? cols - 1 : cx; cy = cy < 0 ? 0 : cy >= rows ? rows - 1 : cy; return grid[cy * cols + cx]; };
      var amp = nm === 'cobble' || nm === 'farm' ? 0.06 : nm === 'raised' ? 0.16 : 0.24, s2 = seed + nm.length * 13;
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        var u = (x + 0.5) / T - 0.5, v = (y + 0.5) / T - 0.5, ci = Math.floor(u), cj = Math.floor(v), fx = sm(u - ci), fy = sm(v - cj);
        var a = at(ci, cj), b = at(ci + 1, cj), c = at(ci, cj + 1), d = at(ci + 1, cj + 1), val = (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
        if (val > 0.02 && val < 0.98) val += (vn(x, y, 7, s2) - 0.5) * amp + (vn(x, y, 3, s2 + 1) - 0.5) * amp * 0.4;
        f[y * W + x] = val;
      }
      F[nm] = f;
    });
    var cov = function (nm, px, py) { var f = F[nm]; if (!f) return 0; px = px < 0 ? 0 : px >= W ? W - 1 : px; py = py < 0 ? 0 : py >= H ? H - 1 : py; return f[py * W + px]; };
    var isW = function (px, py) { return cov('water', px, py) > 0.5; }, isR = function (px, py) { return cov('raised', px, py) > 0.5; }, isP = function (px, py) { return cov('path', px, py) > 0.5; };
    var G = PAL.grass, D = PAL.dirt, Wt = PAL.water, Sd = PAL.sand, St = PAL.stone, Rk = PAL.rock, Lu = PAL.lush, Dr = PAL.dry;
    var KIND = new Uint8Array(W * H);   // 0 grass 1 lush 2 dry 3 sand 4 farm 5 path 6 cobble 7 water 8 bank 9 cliff
    function basePixel(px, py) {
      var k = 0, col, cw = cov('water', px, py), raised = isR(px, py);
      // cliff face under a raised area
      if (!raised && F.raised) { for (i = 1; i <= CH; i++) if (isR(px, py - i)) { var strata = Math.floor((px + Math.floor(hsh(px >> 2, 0, seed + 5) * 3)) / 4), tone = hsh(strata, Math.floor((py - i) / 9), seed + 21), cr = hsh(px, Math.floor(py / 3), seed + 23);
          col = i === 1 ? G[1] : i === 2 ? Rk[5] : i === 3 ? Rk[4] : i >= CH - 1 ? Rk[0] : i >= CH - 3 ? Rk[1] : tone > 0.72 ? Rk[4] : tone > 0.3 ? Rk[3] : Rk[2];
          if (i > 2 && i < CH - 1 && (px + Math.floor(hsh(px >> 2, 0, seed + 5) * 3)) % 4 === 0 && cr > 0.35) col = Rk[1];
          if (i > 3 && i < CH - 2 && cr > 0.93) col = Rk[5];
          KIND[py * W + px] = 9; return col; } }
      if (cw > 0.5 && !raised) {
        var d = (cw - 0.5) * 2, landUp = !isW(px, py - 1) || !isW(px, py - 2) || !isW(px, py - 3);
        col = d > 0.82 && vn(px, py, 11, seed + 31) > 0.45 ? Wt[2] : d < 0.22 ? Wt[4] : Wt[3];
        if (landUp) col = !isW(px, py - 1) || !isW(px, py - 2) ? Wt[1] : Wt[2];
        KIND[py * W + px] = 7; return col;
      }
      var lu = cov('lush', px, py), dr = cov('dry', px, py), sa = cov('sand', px, py), fa = cov('farm', px, py), pa = cov('path', px, py), co = cov('cobble', px, py);
      var n1 = vn(px, py, 30, seed) + (vn(px, py, 8, seed + 3) - 0.5) * 0.3, st = hsh(px, py, seed + 41);
      if (raised) { col = n1 > 0.62 ? G[5] : G[4]; if (n1 > 0.58 && n1 <= 0.62 && st > 0.5) col = G[5]; k = 0; }
      else { col = n1 > 0.63 ? G[4] : n1 < 0.34 ? G[2] : G[3]; if ((n1 > 0.6 && n1 <= 0.63 && st > 0.5)) col = G[4]; if (n1 >= 0.34 && n1 < 0.37 && st > 0.5) col = G[2]; }
      if (lu > 0.5) { k = 1; col = n1 > 0.6 ? Lu[3] : n1 < 0.36 ? Lu[1] : Lu[2]; if (lu < 0.6 && st > 0.5) col = G[2]; }
      if (dr > 0.5) { k = 2; col = n1 > 0.6 ? Dr[3] : n1 < 0.36 ? Dr[1] : Dr[2]; if (dr < 0.6 && st > 0.5) col = G[4]; }
      if (sa > 0.5) { k = 3; var rp = Math.round(Math.sin(px * 0.45 + vn(px, py, 14, seed + 51) * 5) * 1.2); col = (py + rp) % 7 === 0 && vn(px, py, 9, seed + 53) > 0.45 ? Sd[2] : n1 > 0.66 ? Sd[4] : Sd[3]; if (sa < 0.56) col = st > 0.5 ? Sd[2] : Sd[3]; }
      if (fa > 0.5) { k = 4; var fr = py % 5; col = fr === 0 ? D[0] : fr === 1 ? D[1] : fr === 4 ? D[3] : D[2]; if (fr === 3 && px % 4 === (Math.floor(py / 5) % 2) * 2) col = PAL.leaf[4]; if (fr === 2 && px % 4 === (Math.floor(py / 5) % 2) * 2) col = PAL.leaf[5]; }
      if (pa > 0.5) { k = 5; var n2 = vn(px, py, 13, seed + 61); col = n2 > 0.66 ? D[4] : n2 < 0.28 ? D[2] : D[3];
        if (!isP(px, py - 1)) col = D[1]; else if (!isP(px, py - 2)) col = D[2]; else if (!isP(px, py + 1)) col = D[4]; else if ((!isP(px - 1, py) || !isP(px + 1, py)) && st > 0.4) col = D[2]; }
      if (co > 0.5) { k = 6; var row = Math.floor(py / 6), off = Math.floor(hsh(row, 0, seed + 71) * 9), xx = px + off, sw = 8, sx = Math.floor(xx / sw), lx = xx % sw, ly = py % 6, tn = hsh(sx, row, seed + 73);
        col = lx === 0 || ly === 0 ? '#4a4458' : (lx === 1 && ly === 1) || (lx === sw - 1 && ly === 5) ? '#4a4458' : ly === 1 || lx === 1 ? '#a39cae' : tn > 0.7 ? '#948ca0' : tn < 0.25 ? '#746c80' : '#847c90';
        if (co < 0.6 && (lx === 0 || ly === 0)) col = G[2]; if (tn > 0.92 && lx > 2 && ly > 2) col = G[2] === col ? col : (lx === 4 && ly === 3 ? St[1] : col); }
      // banks next to water
      if (F.water && !raised) {
        if (isW(px, py + 1)) { col = sa > 0.4 ? Sd[0] : D[0]; k = 8; } else if (isW(px, py + 2)) { col = sa > 0.4 ? Sd[1] : D[1]; k = 8; } else if (isW(px, py + 3)) { col = sa > 0.4 ? Sd[2] : (k === 0 || k === 1) ? G[5] : col; k = 8; }
        else if (isW(px - 1, py) || isW(px + 1, py) || isW(px, py - 1)) { col = sa > 0.4 ? Sd[1] : G[0]; k = 8; }
        else if ((isW(px - 2, py) || isW(px + 2, py) || isW(px, py - 2)) && sa <= 0.4 && k < 3) { col = G[1]; }
      }
      // raised rim and shadow under a cliff
      if (raised && !isR(px, py + 1)) col = G[6]; else if (raised && (!isR(px - 1, py) || !isR(px + 1, py) || !isR(px, py - 1))) col = G[2];
      if (!raised && F.raised) { if (isR(px - 1, py) || isR(px + 1, py)) col = Rk[1]; else if (isR(px, py - CH - 1) || isR(px, py - CH - 2)) col = k === 5 ? D[1] : k >= 3 ? col : G[1]; else if (isR(px + 2, py) || isR(px, py + 1)) col = k === 5 ? D[1] : k >= 3 ? col : G[1]; }
      KIND[py * W + px] = k; return col;
    }
    var base = new Uint8ClampedArray(W * H * 4);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) { var c = rgb(basePixel(x, y)), q = (y * W + x) * 4; base[q] = c[0]; base[q + 1] = c[1]; base[q + 2] = c[2]; base[q + 3] = 255; }
    var put = function (buf, px, py, col, kinds) { if (px < 0 || py < 0 || px >= W || py >= H) return; if (kinds && kinds.indexOf(KIND[py * W + px]) < 0) return; var c2 = rgb(col), q2 = (py * W + px) * 4; buf[q2] = c2[0]; buf[q2 + 1] = c2[1]; buf[q2 + 2] = c2[2]; };
    // grass tufts, flowers, pebbles, ruts
    var TUFT = [[[0, 0, 1], [2, 0, 1], [1, 1, 1], [1, 2, 0]], [[0, 1, 1], [1, 0, 1], [1, 1, 0]], [[0, 0, 0], [1, 1, 0], [2, 0, 0]], [[0, 0, 1], [1, 0, 1]], [[0, 0, 1], [0, 1, 0], [2, 1, 1], [2, 2, 0]], [[1, 0, 1], [0, 1, 1], [2, 1, 1], [1, 2, 0], [3, 0, 1]]];
    var FLC = [['#ffffff', '#c8d0f0'], ['#ffe070', '#e0a030'], ['#ff9ab8', '#d85888'], ['#c8a8f0', '#8a64c0']];
    var gx, gy;
    for (gy = 0; gy < H; gy += 5) for (gx = 0; gx < W; gx += 5) {
      var h1 = hsh(gx, gy, seed + 81), px0 = gx + Math.floor(hsh(gx, gy, seed + 83) * 4), py0 = gy + Math.floor(hsh(gx, gy, seed + 85) * 4), kk = KIND[Math.min(H - 1, py0) * W + Math.min(W - 1, px0)];
      if (kk <= 2) {
        var dens = kk === 1 ? 0.62 : 0.34 + (vn(gx, gy, 40, seed + 87) - 0.5) * 0.3;
        var ramp = kk === 1 ? [Lu[0], Lu[4]] : kk === 2 ? [Dr[0], '#d0dc78'] : [G[1], G[5]];
        if (isR(px0, py0)) ramp = [G[3], G[6]];
        if (h1 < dens) { TUFT[Math.floor(hsh(gx, gy, seed + 89) * TUFT.length)].forEach(function (p) { put(base, px0 + p[0], py0 + p[1], ramp[p[2]], [0, 1, 2]); }); }
        else if (h1 > 0.9 && vn(gx, gy, 34, seed + 91) > 0.55) { var fc = FLC[Math.floor(hsh(gx, gy, seed + 93) * 4)]; put(base, px0, py0, fc[0], [0, 1, 2]); put(base, px0 + 1, py0, fc[1], [0, 1, 2]); put(base, px0, py0 + 1, G[1], [0, 1, 2]); if (hsh(gx, gy, seed + 95) > 0.5) { put(base, px0 + 3, py0 + 2, fc[0], [0, 1, 2]); put(base, px0 + 3, py0 + 3, G[1], [0, 1, 2]); } }
      } else if (kk === 5) {
        if (h1 < 0.16) { put(base, px0, py0, D[5], [5]); put(base, px0 + 1, py0, D[4], [5]); put(base, px0, py0 + 1, D[1], [5]); put(base, px0 + 1, py0 + 1, D[1], [5]); }
        else if (h1 > 0.9) { put(base, px0, py0, D[2], [5]); put(base, px0 + 1, py0, D[2], [5]); put(base, px0 + 2, py0, D[2], [5]); }
        else if (h1 > 0.86) { put(base, px0, py0, G[3], [5]); put(base, px0 + 1, py0 - 1, G[4], [5]); put(base, px0 + 2, py0, G[3], [5]); }
      } else if (kk === 3) { if (h1 < 0.1) { put(base, px0, py0, Sd[4], [3]); put(base, px0, py0 + 1, Sd[1], [3]); } else if (h1 > 0.95) { put(base, px0, py0, '#f8f0e0', [3]); put(base, px0 + 1, py0, '#f0b8c0', [3]); put(base, px0, py0 + 1, Sd[1], [3]); } }
    }
    // grass fringe over the edges of paths, sand and cobbles (ragged, hand-set feel)
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) { var k0 = KIND[y * W + x]; if ((k0 === 5 || k0 === 6) && KIND[(y + 1) * W + x] <= 2 && hsh(x, y, seed + 97) > 0.55) put(base, x, y, hsh(x, y, seed + 99) > 0.5 ? G[4] : G[2]); if (k0 <= 2 && KIND[(y - 1) * W + x] === 5 && hsh(x, y, seed + 101) > 0.6) put(base, x, y, G[5]); }
    // flower beds (F cells): dense blossoms
    // bridges
    var bridges = [];
    var walls = [];
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) { var cc = map[y].charAt(x); if (cc === 'b' || cc === 'B') bridges.push([x, y, cc]); if (cc === '#') walls.push([x, y]); }
    function drawWall(g, cx, cy) {
      var St2 = PAL.stone, A = Art(T, T + 4), xx, yy, L = map[cy].charAt(cx - 1) === '#', Rr = map[cy].charAt(cx + 1) === '#', U = cy > 0 && map[cy - 1].charAt(cx) === '#', Dn = cy < rows - 1 && map[cy + 1].charAt(cx) === '#';
      for (yy = 0; yy < T + 4; yy++) for (xx = 0; xx < T; xx++) {
        var top = yy < 11 || Dn, X = cx * T + xx, Y = cy * T + yy - 4, col;
        if (top) { var row = Math.floor(Y / 5), off = row % 2 ? 4 : 0, lx = (X + off) % 8, ly = ((Y % 5) + 5) % 5, tn = hsh(Math.floor((X + off) / 8), row, seed + 131); col = ly === 0 || lx === 0 ? St2[1] : ly === 1 ? St2[4] : tn > 0.66 ? St2[4] : tn < 0.25 ? St2[2] : St2[3]; }
        else { var row2 = Math.floor(Y / 4), off2 = row2 % 2 ? 4 : 0, lx2 = (X + off2) % 8, ly2 = ((Y % 4) + 4) % 4; col = ly2 === 3 || lx2 === 0 ? St2[0] : yy === 11 ? St2[1] : hsh(Math.floor((X + off2) / 8), row2, seed + 133) > 0.6 ? St2[2] : St2[1]; }
        if ((!L && xx === 0) || (!Rr && xx === T - 1) || (!U && yy === 0 && false) || (!Dn && yy === T + 3)) col = OLN;
        A.P(xx, yy, col);
      }
      if (!U) A.R(0, 0, T, 1, OLN);
      g.drawImage(A.c, cx * T, cy * T - 4);
      if (!Dn) { g.fillStyle = 'rgba(16,10,30,0.3)'; g.fillRect(cx * T, cy * T + T, T, 2); }
    }
    // props from chars and the list
    var items = [], blockedSet = {};
    function addProp(kind, bx, by, o) {
      var p = prop(kind, o), it = { k: kind, x: bx, y: by, p: p, o: o || {} };
      it.draw = function (g, t, ox, oy) {
        var f = p.frames.length > 1 ? p.frames[Math.floor((t || 0) / 1000 * (p.fps || 6) + (bx * 7 + by * 3)) % p.frames.length] : p.frames[0];
        var X = Math.round(bx - (p.left ? 0 : p.ax) + (ox || 0)), Y = Math.round(by - p.ay + (oy || 0));
        if (p.glow) glow(g, X + p.ax, Y + p.ay + p.glow.dy, p.glow.r, '#ffd070', 0.85 + 0.15 * Math.sin((t || 0) / 130 + bx));
        g.drawImage(f, X, Y);
      };
      if (p.flat) it.flat = true;
      items.push(it); return it;
    }
    for (y = 0; y < rows; y++) for (x = 0; x < cols; x++) {
      var pc = PROPCH[map[y].charAt(x)]; if (!pc) continue;
      var jx = Math.round((hsh(x, y, seed + 111) - 0.5) * 6), jy = Math.round((hsh(x, y, seed + 113) - 0.5) * 5), vv = Math.floor(hsh(x, y, seed + 115) * 6), kind = pc;
      if (pc === 'tree' && spec.mixed !== false) { var hh = hsh(x, y, seed + 117); if (hh > 0.86) kind = 'smalltree'; else if (hh < 0.08 && spec.pines) kind = 'pine'; }
      addProp(kind, x * T + 8 + jx, y * T + 14 + jy, { v: vv, autumn: !!spec.autumn && hsh(x, y, seed + 119) > 0.4 });
      if (pc !== 'flowers' && pc !== 'bush' && pc !== 'rock' || spec.blockSmall) blockedSet[x + ',' + y] = 1;
    }
    (spec.props || []).forEach(function (pr) { var it = addProp(pr.k, pr.x, pr.y, pr.o || pr); if (pr.z != null) it.y = pr.z; });
    // bake shadows of static props into the ground
    function shade(buf, cx, cy, rx, ry) { for (var yy = -ry; yy <= ry; yy++) { var hw = Math.round(rx * Math.sqrt(1 - (yy * yy) / ((ry + 0.5) * (ry + 0.5)))); for (var xx = -hw; xx <= hw; xx++) { var X = cx + xx, Y = cy + yy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; var q3 = (Y * W + X) * 4; if (buf[q3 + 3] === 254) continue; buf[q3] = buf[q3] * 0.66; buf[q3 + 1] = buf[q3 + 1] * 0.72; buf[q3 + 2] = buf[q3 + 2] * 0.8; buf[q3 + 3] = 254; } } }
    items.forEach(function (it) { if (it.p.sh) shade(base, it.x + 1, it.y, it.p.sh[0], it.p.sh[1]); });
    for (i = 3; i < base.length; i += 4) base[i] = 255;
    // water frames
    var frames = [], hasWater = !!F.water;
    function bakeFrame(fr) {
      var buf = new Uint8ClampedArray(base), c5 = mk(W, H), g5 = c5.getContext('2d');
      if (hasWater) {
        for (gy = 0; gy < H; gy += 6) for (gx = 0; gx < W; gx += 11) {
          var hx = gx + Math.floor(hsh(gx, gy, seed + 121) * 8) + fr * 2, hy = gy + Math.floor(hsh(gx, gy, seed + 123) * 5), len = 3 + Math.floor(hsh(gx, gy, seed + 125) * 4);
          if (hsh(gx, gy, seed + 127) > 0.6) continue;
          for (i = 0; i < len; i++) { var X = hx + i, Y = hy + (i === 0 || i === len - 1 ? 1 : 0); if (X < 0 || X >= W || Y >= H) continue; if (KIND[Y * W + X] !== 7 || cov('water', X, Y) < 0.62 || !isW(X, Y - 3)) continue; put(buf, X, Y, i === (len >> 1) ? Wt[6] : Wt[5]); }
        }
        // shore foam: a broken light line 1 px inside the water along south, east and west shores
        for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) if (KIND[y * W + x] === 7 && isW(x, y - 1) && isW(x, y - 2)) {
          var near = !isW(x, y + 2) || !isW(x - 2, y) || !isW(x + 2, y);
          if (near && (isW(x, y + 1) && isW(x - 1, y) && isW(x + 1, y)) && ((x + y * 3 + fr * 2) % 9) < 6) put(buf, x, y, Wt[5]);
        }
      }
      var id = g5.createImageData(W, H); id.data.set(buf); g5.putImageData(id, 0, 0);
      bridges.forEach(function (b) { drawBridge(g5, b[0] * T, b[1] * T, b[2] === 'B'); });
      walls.forEach(function (wl) { drawWall(g5, wl[0], wl[1]); });
      return c5;
    }
    function drawBridge(g, bx, by, vert) {
      var Pl = PAL.plank, A = Art(vert ? 16 : 20, vert ? 20 : 16), xx, yy;
      if (!vert) { for (yy = 2; yy < 14; yy++) for (xx = 0; xx < 20; xx++) { var lx = xx % 4; A.P(xx, yy, yy === 2 || yy === 13 ? Pl[1] : lx === 0 ? Pl[1] : lx === 1 ? Pl[5] : hsh(xx >> 2, yy >> 2, 7) > 0.7 ? Pl[3] : Pl[4]); }
        for (xx = 0; xx < 20; xx++) { A.P(xx, 0, OLN); A.P(xx, 1, Pl[3]); A.P(xx, 2, Pl[1]); A.P(xx, 14, Pl[2]); A.P(xx, 15, OLN); A.P(xx, 13, Pl[0]); }
        [0, 9, 18].forEach(function (p) { A.R(p, 0, 2, 3, Pl[5]); A.P(p + 1, 1, Pl[2]); A.R(p, 13, 2, 3, Pl[4]); A.P(p + 1, 15, Pl[1]); });
        g.drawImage(A.c, bx - 2, by); }
      else { for (yy = 0; yy < 20; yy++) for (xx = 2; xx < 14; xx++) { var ly = yy % 4; A.P(xx, yy, ly === 3 ? Pl[1] : ly === 0 ? Pl[5] : hsh(xx >> 2, yy >> 2, 9) > 0.7 ? Pl[3] : Pl[4]); }
        for (yy = 0; yy < 20; yy++) { A.P(0, yy, OLN); A.P(1, yy, Pl[4]); A.P(2, yy, Pl[1]); A.P(13, yy, Pl[1]); A.P(14, yy, Pl[2]); A.P(15, yy, OLN); }
        [0, 9, 18].forEach(function (p) { A.R(0, p, 3, 2, Pl[5]); A.R(13, p, 3, 2, Pl[3]); });
        g.drawImage(A.c, bx, by - 2); }
    }
    var S = { w: W, h: H, cols: cols, rows: rows, items: items, T: T,
      ground: function (t) { var fr = hasWater ? Math.floor((t || 0) / 1000 * 3) % 4 : 0; return frames[fr] || (frames[fr] = bakeFrame(fr)); },
      drawGround: function (g, t, ox, oy) { g.drawImage(S.ground(t), Math.round(ox || 0), Math.round(oy || 0)); S.items.forEach(function (it) { if (it.flat) it.draw(g, t, ox, oy); }); },
      draw: function (g, t, extras, ox, oy) {
        S.drawGround(g, t, ox, oy);
        var list = S.items.filter(function (it) { return !it.flat; }).map(function (it) { return { y: it.y, d: function () { it.draw(g, t, ox, oy); } }; });
        (extras || []).forEach(function (e) { list.push({ y: e.y, d: function () { e.draw(g); } }); });
        list.sort(function (a, b) { return a.y - b.y; }).forEach(function (e) { e.d(); });
      },
      sorted: function (t, ox, oy) { return S.items.filter(function (it) { return !it.flat; }).map(function (it) { return { y: it.y, draw: function (g) { it.draw(g, t, ox, oy); } }; }); },
      kindAt: function (cx, cy) { var c6 = ch(cx, cy); return CLS[c6] === 'water' ? (c6 === 'b' || c6 === 'B' ? 'bridge' : 'water') : PROPCH[c6] || CLS[c6] || 'grass'; },
      blocked: function (cx, cy) { var c7 = ch(cx, cy); return c7 === 'w' || c7 === '#' || !!blockedSet[cx + ',' + cy]; },
      add: addProp };
    return S;
  }

  /* ---------- interior room ---------- */
  function room(spec) {
    var cols = spec.cols || 16, rows = spec.rows || 14, W = spec.w || cols * T, H = spec.h || rows * T, wallH = spec.wallH || 44, seed = spec.seed == null ? 3 : spec.seed, side = spec.side == null ? 6 : spec.side;
    var floor = spec.floor || 'wood', wall = spec.wall || 'brick', c = mk(W, H), g = c.getContext('2d'), x, y, P = PAL;
    var WB = wall === 'plaster' ? ['#6a5c50', '#a8987c', '#c8b898', '#dccdb0', '#ece0c8'] : wall === 'wood' ? ['#2e1a12', '#4a2c1c', '#6a4228', '#84583a', '#a0704a'] : wall === 'stone' ? ['#2a2636', '#443e52', '#5e586e', '#7a748a', '#9a94a8'] : ['#2a1c2a', '#4a3040', '#6a4450', '#885a5c', '#a8746c'];
    var id = g.createImageData(W, H), buf = id.data, put = function (px, py, col) { var q = (py * W + px) * 4, v = rgb(col); buf[q] = v[0]; buf[q + 1] = v[1]; buf[q + 2] = v[2]; buf[q + 3] = 255; };
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var col;
      if (y < wallH) {
        if (y < 5) col = y === 4 ? '#0c0a14' : y === 3 ? WB[0] : '#16101e';                                  // ceiling cap
        else if (y >= wallH - 6) col = y === wallH - 6 ? P.plank[4] : y === wallH - 1 ? P.plank[0] : (x % 24 === 0 ? P.plank[0] : P.plank[2]);   // skirting board
        else if (wall === 'plaster') { col = hsh(x >> 1, y >> 1, seed + 3) > 0.93 ? WB[2] : WB[3]; if (y < 8) col = WB[1]; if (y === wallH - 20) col = P.plank[2]; if (y > wallH - 20) col = (x % 12 === 0) ? P.plank[1] : (x % 12 === 1) ? P.plank[4] : P.plank[3]; if (y === wallH - 19) col = P.plank[5]; }
        else if (wall === 'wood') { var lx0 = x % 10; col = lx0 === 0 ? WB[0] : lx0 === 1 ? WB[4] : hsh(Math.floor(x / 10), y >> 3, seed + 5) > 0.6 ? WB[2] : WB[3]; if (y < 8) col = WB[1]; }
        else { var bh = wall === 'stone' ? 8 : 5, bw = wall === 'stone' ? 16 : 10, row = Math.floor((y - 5) / bh), off = row % 2 ? bw >> 1 : 0, lx = (x + off) % bw, ly = (y - 5) % bh, tn = hsh(Math.floor((x + off) / bw), row, seed + 7);
          col = ly === bh - 1 || lx === 0 ? WB[0] : ly === 0 ? WB[4] : tn > 0.72 ? WB[3] : tn < 0.2 ? WB[1] : WB[2]; if (y < 8) col = ly === bh - 1 || lx === 0 ? WB[0] : WB[1]; }
      } else {
        if (floor === 'stone') { var fr = Math.floor((y - wallH) / 12), fo = fr % 2 ? 9 : 0, fx = (x + fo) % 18, fy = (y - wallH) % 12, ft = hsh(Math.floor((x + fo) / 18), fr, seed + 9); col = fx === 0 || fy === 0 ? '#3e3850' : fx === 1 || fy === 1 ? '#9890a6' : ft > 0.7 ? '#8a8098' : ft < 0.3 ? '#70667e' : '#7c728a'; if (ft > 0.5 && ft < 0.6 && fx > 4 && fx < 9 && fy === 5 + (fx % 3)) col = '#58506a'; }
        else if (floor === 'checker') { var cxn = Math.floor(x / 16) + Math.floor((y - wallH) / 16), lx3 = x % 16, ly3 = (y - wallH) % 16; col = cxn % 2 ? '#d8cab0' : '#8a5a48'; if (lx3 === 0 || ly3 === 0) col = cxn % 2 ? '#f0e6d0' : '#a8746c'; if (lx3 === 15 || ly3 === 15) col = cxn % 2 ? '#b4a488' : '#6a4450'; }
        else { var pr = Math.floor((y - wallH) / 8), py2 = (y - wallH) % 8, jo = Math.floor(hsh(pr, 0, seed + 11) * 40), jx = (x + jo) % 44, pt = hsh(Math.floor((x + jo) / 44), pr, seed + 13);
          col = py2 === 7 ? '#663e24' : py2 === 0 ? '#a66c3e' : jx === 0 ? '#663e24' : pt > 0.66 ? '#9a6238' : pt < 0.22 ? '#84522e' : '#8e5a32';
          if (py2 === 3 && hsh(x >> 4, pr, seed + 15) > 0.8 && (x & 15) > 3 && (x & 15) < 12) col = '#7c4c2a'; if (jx === 2 && py2 === 4) col = '#4a2c1a'; }
        var dsh = y - wallH; if (dsh < 2) col = '#1a1024'; else if (dsh < 6) { var v = rgb(col); col = '#' + [v[0] * 0.55, v[1] * 0.5, v[2] * 0.62].map(function (n) { return ('0' + Math.round(n).toString(16)).slice(-2); }).join(''); } else if (dsh < 10) { var v2 = rgb(col); col = '#' + [v2[0] * 0.8, v2[1] * 0.77, v2[2] * 0.85].map(function (n) { return ('0' + Math.round(n).toString(16)).slice(-2); }).join(''); }
      }
      if (side && (x < side || x >= W - side)) { var e = x < side ? x : W - 1 - x; col = e === side - 1 ? '#0c0a14' : e === side - 2 ? WB[1] : '#16101e'; if (y < 4) col = '#16101e'; }
      if (spec.bottom !== false && y >= H - 5) col = y === H - 5 ? '#0c0a14' : y === H - 4 ? WB[1] : '#16101e';
      put(x, y, col);
    }
    g.putImageData(id, 0, 0);
    // rugs are part of the floor
    (spec.rugs || []).forEach(function (r) { drawRug(g, r.x, r.y, r.w, r.h, r.color); });
    var items = [];
    function addProp(kind, bx, by, o) {
      var p = prop(kind, o), it = { k: kind, x: bx, y: by, p: p };
      it.draw = function (gg, t, ox, oy) {
        var f = p.frames.length > 1 ? p.frames[Math.floor((t || 0) / 1000 * (p.fps || 6) + bx) % p.frames.length] : p.frames[0], X = Math.round(bx - p.ax + (ox || 0)), Y = Math.round(by - p.ay + (oy || 0));
        if (p.glow) glow(gg, X + p.ax, Y + p.ay + p.glow.dy, p.glow.r, '#ffb050', 0.85 + 0.15 * Math.sin((t || 0) / 120 + bx));
        if (p.sh) { gg.fillStyle = 'rgba(16,8,24,0.32)'; gg.fillRect(X + p.ax - p.sh[0], Y + p.ay - 1, p.sh[0] * 2, 2); gg.fillRect(X + p.ax - p.sh[0] + 2, Y + p.ay + 1, p.sh[0] * 2 - 4, 1); }
        gg.drawImage(f, X, Y);
      };
      if (p.wall) it.flat = true;
      items.push(it); return it;
    }
    (spec.props || []).forEach(function (pr) { var it = addProp(pr.k, pr.x, pr.y, pr.o || pr); if (pr.z != null) it.y = pr.z; });
    var S = { w: W, h: H, items: items, wallH: wallH, T: T, canvas: c,
      ground: function () { return c; },
      drawGround: function (gg, t, ox, oy) { gg.drawImage(c, Math.round(ox || 0), Math.round(oy || 0)); S.items.forEach(function (it) { if (it.flat) it.draw(gg, t, ox, oy); }); },
      draw: function (gg, t, extras, ox, oy) {
        S.drawGround(gg, t, ox, oy);
        var list = S.items.filter(function (it) { return !it.flat; }).map(function (it) { return { y: it.y, d: function () { it.draw(gg, t, ox, oy); } }; });
        (extras || []).forEach(function (e) { list.push({ y: e.y, d: function () { e.draw(gg); } }); });
        list.sort(function (a, b) { return a.y - b.y; }).forEach(function (e) { e.d(); });
      },
      sorted: function (t, ox, oy) { return S.items.filter(function (it) { return !it.flat; }).map(function (it) { return { y: it.y, draw: function (gg) { it.draw(gg, t, ox, oy); } }; }); },
      add: addProp };
    return S;
  }
  function drawRug(g, x, y, w, h, color) {
    var R = PAL.roof[color || 'red'], i, j;
    g.fillStyle = OLN; g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = R[2]; g.fillRect(x, y, w, h); g.fillStyle = R[3]; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h); g.fillStyle = R[1]; g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
    g.fillStyle = '#d8a030'; g.fillRect(x + 3, y + 3, w - 6, 1); g.fillRect(x + 3, y + h - 4, w - 6, 1); g.fillRect(x + 3, y + 3, 1, h - 6); g.fillRect(x + w - 4, y + 3, 1, h - 6);
    g.fillStyle = R[1]; g.fillRect(x + 6, y + 6, w - 12, h - 12);
    for (j = y + 9; j < y + h - 9; j += 6) for (i = x + 10 + ((j - y) % 12 ? 4 : 0); i < x + w - 10; i += 8) { g.fillStyle = '#ffe070'; g.fillRect(i, j, 1, 1); g.fillStyle = R[4]; g.fillRect(i - 1, j, 1, 1); g.fillRect(i + 1, j, 1, 1); g.fillRect(i, j - 1, 1, 1); g.fillRect(i, j + 1, 1, 1); }
    for (i = x + 1; i < x + w - 1; i += 2) { g.fillStyle = '#f0e6d0'; g.fillRect(i, y - 2, 1, 1); g.fillRect(i, y + h + 1, 1, 1); }
  }

  /* ---------- side-view ground: grass-topped earth with strata, stones and roots ---------- */
  // sideGround(g, x, y, w, h, {seed, theme:'meadow'|'cave'|'snow'}): fills a block whose top edge is walkable
  function sideGround(g, x0, y0, w, h, o) {
    o = o || {}; var seed = o.seed == null ? 5 : o.seed, D = PAL.dirt, G = PAL.grass, x, y, c = mk(w, h), cg = c.getContext('2d'), id = cg.createImageData(w, h), buf = id.data;
    var ox = o.ox == null ? x0 : o.ox;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var X = x + ox, lip = 3 + (hsh(X >> 1, 0, seed) > 0.6 ? 1 : 0) + (hsh(X >> 2, 1, seed) > 0.75 ? 1 : 0), col;
      if (y === 0) col = hsh(X, 2, seed) > 0.75 ? G[6] : G[5];
      else if (y < lip - 1) col = y === 1 ? G[5] : G[4];
      else if (y < lip) col = G[3];
      else if (y < lip + 1) col = G[1];
      else { var n = vn(X, y, 9, seed + 3), band = Math.floor((y + Math.round(Math.sin(X * 0.07) * 2 + vn(X, y, 22, seed + 5) * 4)) / 7); col = band % 2 ? D[2] : D[1]; if (n > 0.72) col = D[3]; if (n < 0.2) col = D[0]; if (y < lip + 3) col = D[0]; }
      var v = rgb(col), q = (y * w + x) * 4; buf[q] = v[0]; buf[q + 1] = v[1]; buf[q + 2] = v[2]; buf[q + 3] = 255;
    }
    cg.putImageData(id, 0, 0);
    // embedded stones
    for (x = 0; x < w + 24; x += 24) for (y = 10; y < h; y += 13) { var X2 = Math.floor((x + ox) / 24) * 24, hh = hsh(X2, y, seed + 7); if (hh > 0.42) continue; var sx = X2 - ox + Math.floor(hsh(X2, y, seed + 9) * 16), sy = y + Math.floor(hsh(X2, y, seed + 11) * 6), big = hh < 0.07; var st = prop(big ? 'boulder' : 'rock', { v: Math.floor(hh * 20) }); cg.globalAlpha = 1; cg.drawImage(st.frames[0], sx, sy); }
    g.drawImage(c, x0, y0);
  }

  /* ---------- actor: 16x20 chibi, 4 facings, 2 walk frames ---------- */
  var ACT = {
    down: ['....oooooo....', '...ohhhhhho...', '..ohhhHhhhho..', '..ohhhhhhhHo..', '..oHhsssshHo..', '..ohsesseSho..', '..oHsssssSHo..', '...osssSSSo...', '..oo1ccc11oo..', '.os1ccCcc11so.', '.oS1ccccC11So.', '.oo1bbybb11oo.', '...oc1cc11o...', '...o2oo22oo...', '...o3o.o33o...', '...ooo.oooo...'],
    up: ['....oooooo....', '...ohhhhhho...', '..ohhhHhhhho..', '..ohhhhhhhHo..', '..oHhhhhhhHo..', '..ohhhHhhHho..', '..oHhhhhhHHo..', '...oHHHHHHo...', '..oo1ccc11oo..', '.os1cccc111so.', '.oS1cccc111So.', '.oo1bbbbb11oo.', '...oc1cc11o...', '...o2oo22oo...', '...o3o.o33o...', '...ooo.oooo...'],
    side: ['....oooooo....', '...ohhhhhho...', '..ohhhhHhhho..', '..oHhhhhhhho..', '..oHHhhsssso..', '..oHHhssesso..', '..oHHhsssSo...', '...oHHssSSo...', '...oo1cc1o....', '...o1ccC1o....', '...o1scc1o....', '...o1Sbb1o....', '...oc1c11o....', '...o2o22o.....', '...o3o33o.....', '...oooooo.....']
  };
  var APAL = {
    hero: { h: '#b8642c', H: '#7a3c1c', s: '#f8c8a0', S: '#d09068', e: '#2a1428', c: '#3c72e4', C: '#98c4ff', 1: '#2442a4', b: '#5c3420', y: '#ffe070', 2: '#5c3420', 3: '#3a2014' },
    girl: { h: '#e8c060', H: '#b08030', s: '#f8c8a0', S: '#d09068', e: '#2a1428', c: '#d4442e', C: '#ffa47c', 1: '#901e26', b: '#5c3420', y: '#ffe070', 2: '#f0e6d0', 3: '#7a5630' },
    elder: { h: '#e8ecf4', H: '#a8b0c8', s: '#f0c0a0', S: '#c08868', e: '#2a1428', c: '#8a58a8', C: '#b89adc', 1: '#5a3478', b: '#d8a030', y: '#ffe070', 2: '#5a3478', 3: '#3a2014' },
    guard: { h: '#a8b4d0', H: '#58607e', s: '#f8c8a0', S: '#d09068', e: '#2a1428', c: '#a8383a', C: '#ec8a64', 1: '#7a2430', b: '#58607e', y: '#d0d8ec', 2: '#58607e', 3: '#2e2638' },
    green: { h: '#3a2a1c', H: '#20140e', s: '#e0a880', S: '#b07850', e: '#2a1428', c: '#3c8438', C: '#84c656', 1: '#1c4a2e', b: '#5c3420', y: '#ffe070', 2: '#7a5630', 3: '#3a2014' },
    merchant: { h: '#7a3c1c', H: '#4a2010', s: '#f8c8a0', S: '#d09068', e: '#2a1428', c: '#d8a030', C: '#ffe070', 1: '#96703c', b: '#3a2014', y: '#e04848', 2: '#4a4052', 3: '#2e2638' }
  };
  var AC = {};
  function actorSprite(pal, dir, frame) {
    var key = pal + dir + frame; if (AC[key]) return AC[key];
    var rows = ACT[dir === 'left' || dir === 'right' ? 'side' : dir] || ACT.down, pk = APAL[pal] || APAL.hero, k2 = {}, kk;
    for (kk in KEY) k2[kk] = KEY[kk]; for (kk in pk) k2[kk] = pk[kk];
    rows = rows.slice();
    if (frame === 1) { rows[13] = dir === 'left' || dir === 'right' ? '..o2oo22o.....' : '...o2o.o22o...'; rows[14] = dir === 'left' || dir === 'right' ? '..o3o.o33o....' : '..o3oo..o33o..'; rows[15] = dir === 'left' || dir === 'right' ? '..ooo.oooo....' : '..ooo...oooo..'; }
    var c = strArt(rows, k2, 14).c; if (dir === 'left') c = flip(c);
    return (AC[key] = c);
  }
  function actor(g, x, y, o) {
    o = o || {}; var img = actorSprite(o.pal || 'hero', o.dir || 'down', o.frame ? 1 : 0), X = Math.round(x) - 7, Y = Math.round(y) - 16 - (o.hop || 0);
    if (!o.noShadow) { g.fillStyle = 'rgba(16,10,30,0.35)'; g.fillRect(Math.round(x) - 5, Math.round(y) - 1, 10, 1); g.fillRect(Math.round(x) - 4, Math.round(y), 8, 1); }
    g.drawImage(img, X, Y);
  }

  /* ---------- fighter: 24x32 side-view battle figure facing left (mirror it for the other side) ----------
   * fighter({pal, head, gear, robe, beard, shield}) -> {normal, white, grey, w: 24, h: 32}; feet on row 31, centre x = 11
   *   pal: h/H/x hair or helm (mid, light, dark), t/T/u hat or band, s/S skin, e eye, b/B/d cloth (mid, light, dark), g belt and trim, p/P legs, k/K boots, r plume or knot
   *   head: 'hair' | 'helm' | 'hat' | 'band' | 'hood';  gear: 'sword' 'spear' 'bow' 'staff' 'rod' 'axe' 'club' 'hexrod';  shield: colour triple [mid, light, dark]
   */
  var FHEAD = ['........hhhhhhh.........', '......hhHHhhhhhhh.......', '.....hHHHhhhhhhhxh......', '.....hHHhhhhhhhhxx......', '.....hhhhhhhhhhhxx......', '.....hsshhhhhhhxxx......', '.....sssssshhhhxxx......',
    '.....sesssesshhxxx......', '.....sesssessShxx.......', '.....ssssssssSxx........', '......sssssssSS.........', '.......ssssSS...........'];
  var FBODY = ['......BBBbbbbbd.........', '.....BBBbbbbbbdd........', '....BBBbbbbbbbddd.......', '...BBBdbbbbbbbddd.......', '...BBdbbbbbbbbddd.......', '...ssdbbbbbbbbdd........', '.....ggggggggggg........'];
  var FLEGS = ['.....bbbbbbbbddd........', '.....bbbbbbbdddd........', '......pppp.PPPP.........', '......pppp.PPPP.........', '......pppp.PPPP.........', '......ppp...PPP.........', '......ppp...PPP.........', '.....kkkk..kkkk.........', '....kKkkk.kKkkk.........', '....kkkkk.kkkkk.........'];
  var FROBE = ['.....bbbbbbbbddd........', '....Bbbbbbbbbddd........', '....Bbbbbbbbbdddd.......', '....BbbbbbbbbbddD.......', '...BBbbbbbbbbbddd.......', '...BBbbbbbbbbbdddd......', '...BBbbbbbbbbbbddd......', '...ggggggggggggggg......', '....kkkk....kkkk........', '....kkkk....kkkk........'];
  var FHAT = { hat: ['.............tTu........', '............tTtu........', '...........tTttuu.......', '..........tTtttuu.......', '.........gggggggg.......', '...tttTTtttttttttuuu....', '....uuuuuuuuuuuuuuu.....'],
    helm: ['.........rrrr...........', '........hhrrrrr.........', null, null, null, null, '.....hHhhhhhhhhxxx......', null, '.....sesssesxhhxx.......', '.....sssssssxhxx........'],
    band: [null, null, null, null, '.....tTTttttttttuu......', '.....tttttttttttuutt....', '.....sssssshhhhxxx.tt...'],
    hood: [null, null, '.....hHHHhhhhhhhxxh.....', '.....hHHhhhhhhhhxxx.....', '.....hhhhhhhhhhhxxx.....', '.....hxxxxhhhhhhxxx.....', '.....sssssxhhhhxxx......', '.....sessesxhhhxxx......', '.....sessessxhhxx.......', '.....ssssssssxxxx.......'] };
  var FGEAR = {
    sword: [[3, 7, 2, 14, '#dfe6f2'], [3, 7, 1, 14, '#ffffff'], [3, 6, 1, 1, '#ffffff'], [1, 20, 6, 1, '#d8a030'], [3, 21, 2, 3, '#6a4422']],
    spear: [[3, 3, 1, 28, '#7a5030'], [2, 2, 3, 4, '#c8d4e0'], [3, 0, 1, 3, '#ffffff'], [2, 6, 3, 1, '#e04848']],
    bow: [[2, 10, 1, 1, '#8a5a2a'], [1, 11, 1, 3, '#a8703a'], [0, 14, 1, 7, '#c08848'], [1, 21, 1, 3, '#a8703a'], [2, 24, 1, 1, '#8a5a2a'], [3, 10, 1, 15, '#e8e0c8'], [15, 15, 3, 8, '#6a4422'], [15, 15, 1, 8, '#8a5a2a'], [15, 12, 1, 3, '#e8e0c8'], [17, 13, 1, 2, '#e04848']],
    staff: [[3, 7, 1, 24, '#6a4422'], [2, 2, 3, 5, '#9a6aff'], [1, 3, 1, 3, '#7a4ad8'], [5, 3, 1, 3, '#7a4ad8'], [3, 3, 1, 2, '#f0e8ff']],
    rod: [[3, 6, 1, 25, '#c8a050'], [3, 1, 1, 6, '#ffe8a0'], [1, 3, 5, 1, '#ffe8a0'], [3, 3, 1, 1, '#ffffff']],
    axe: [[3, 9, 1, 22, '#6a4422'], [0, 9, 3, 7, '#aab4c0'], [0, 10, 1, 5, '#ffffff'], [1, 9, 2, 1, '#d8e0ea'], [4, 10, 2, 4, '#7a8694']],
    club: [[3, 15, 1, 12, '#6a4422'], [1, 6, 5, 9, '#8a5a32'], [1, 6, 2, 9, '#b07a48'], [5, 7, 1, 7, '#5a3418'], [2, 8, 1, 1, '#e8e0c8'], [4, 11, 1, 1, '#e8e0c8'], [2, 13, 1, 1, '#e8e0c8']],
    hexrod: [[3, 7, 1, 24, '#3a2a2a'], [2, 2, 3, 5, '#5ae08a'], [1, 3, 1, 3, '#2a9a5a'], [5, 3, 1, 3, '#2a9a5a'], [3, 3, 1, 2, '#e8ffe8']] };
  var FBASE = { s: '#eab58c', S: '#c48a64', e: '#1a1220', k: '#3a2618', K: '#6a4a30', p: '#4a3a2e', P: '#33281f', g: '#e8c060', r: '#e04848', D: '#000000' };
  function fighter(o) {
    o = o || {}; var pal = {}, kk, rows = [], i, hat = FHAT[o.head], OY = 2;
    for (kk in FBASE) pal[kk] = FBASE[kk]; for (kk in (o.pal || {})) pal[kk] = o.pal[kk];
    if (!pal.t) { pal.t = pal.h; pal.T = pal.H; pal.u = pal.x; } if (!pal.D) pal.D = pal.d;
    pal.D = pal.d;
    for (i = 0; i < FHEAD.length; i++) rows.push(hat && hat[i] ? hat[i] : FHEAD[i]);
    rows = rows.concat(FBODY, o.robe ? FROBE : FLEGS);
    function mkm(mode) {
      var A = Art(24, 32), put = function (x, y, col) { if (mode === 'white') col = '#ffffff'; else if (mode === 'grey') { var c = rgb(col), v = Math.round((c[0] * 0.3 + c[1] * 0.5 + c[2] * 0.2) * 0.62) + 26; col = 'rgb(' + v + ',' + v + ',' + (v + 14) + ')'; } A.P(x, y, col); }, x, y, ch, n;
      for (y = 0; y < rows.length; y++) for (x = 0; x < 24; x++) { ch = rows[y].charAt(x); if (ch !== '.' && pal[ch]) put(x, y + OY, pal[ch]); }
      if (o.shield) { var sh = o.shield; for (y = 0; y < 11; y++) { n = y < 6 ? 0 : (y - 4) >> 1; for (x = 11 + n; x < 19 - n; x++) put(x, 16 + y, x === 11 + n || y === 0 ? sh[1] : x >= 17 - n ? sh[2] : sh[0]); } put(14, 19, sh[3] || pal.g); put(14, 20, sh[3] || pal.g); put(13, 20, sh[3] || pal.g); put(15, 20, sh[3] || pal.g); put(14, 21, sh[3] || pal.g); put(14, 22, sh[3] || pal.g); }
      if (o.beard) { for (x = 5; x < 11; x++) { put(x, 10 + OY, pal.x); put(x + 1, 11 + OY, pal.x); } put(7, 9 + OY, pal.x); put(8, 9 + OY, pal.x); }
      (FGEAR[o.gear] || []).forEach(function (r) { for (var yy = 0; yy < r[3]; yy++) for (var xx = 0; xx < r[2]; xx++) put(r[0] + xx, r[1] + yy, r[4]); });
      if (FGEAR[o.gear]) { put(3, 21, pal.s); put(4, 21, pal.s); put(3, 22, pal.S); put(4, 22, pal.S); }   // the front hand closes over the grip
      A.outline(mode === 'white' ? '#ffffff' : OLN);
      return A.c;
    }
    // right-facing variant (painted, not mirrored): body mirrored with the light kept on the top-left, the weapon stays in the
    // same hand (now the far hand, drawn behind the body, its tip showing in front), the shield stays on the same arm (now the
    // near arm, held across the torso over the body)
    var SWAP = { B: 'd', d: 'B', H: 'x', x: 'H', p: 'P', P: 'p' };
    function mkr(mode) {
      var A = Art(24, 32), put = function (x, y, col) { if (mode === 'white') col = '#ffffff'; else if (mode === 'grey') { var c = rgb(col), v = Math.round((c[0] * 0.3 + c[1] * 0.5 + c[2] * 0.2) * 0.62) + 26; col = 'rgb(' + v + ',' + v + ',' + (v + 14) + ')'; } A.P(x, y, col); }, x, y, ch, n;
      (FGEAR[o.gear] || []).forEach(function (r) { for (var yy = 0; yy < r[3]; yy++) for (var xx = 0; xx < r[2]; xx++) put(23 - (r[0] + xx), r[1] + yy, r[4]); });
      if (FGEAR[o.gear]) { put(20, 21, pal.s); put(19, 21, pal.s); put(20, 22, pal.S); put(19, 22, pal.S); }
      for (y = 0; y < rows.length; y++) for (x = 0; x < 24; x++) { ch = rows[y].charAt(23 - x); if (ch === '.' || !pal[ch]) continue; put(x, y + OY, pal[SWAP[ch] && pal[SWAP[ch]] ? SWAP[ch] : ch]); }
      if (o.shield) { var sh = o.shield; for (y = 0; y < 11; y++) { n = y < 6 ? 0 : (y - 4) >> 1; for (x = 8 + n; x < 16 - n; x++) put(x, 16 + y, x === 8 + n || y === 0 ? sh[1] : x >= 14 - n ? sh[2] : sh[0]); } put(12, 19, sh[3] || pal.g); put(12, 20, sh[3] || pal.g); put(11, 20, sh[3] || pal.g); put(13, 20, sh[3] || pal.g); put(12, 21, sh[3] || pal.g); put(12, 22, sh[3] || pal.g); }
      if (o.beard) { for (x = 5; x < 11; x++) { put(23 - x, 10 + OY, pal.x); put(22 - x, 11 + OY, pal.x); } put(16, 9 + OY, pal.x); put(15, 9 + OY, pal.x); }
      A.outline(mode === 'white' ? '#ffffff' : OLN);
      return A.c;
    }
    var out = { normal: mkm('normal'), white: mkm('white'), grey: mkm('grey'), w: 24, h: 32, facing: 'left' }, vr = null;
    // variant('right') -> the same shape facing right (built on first use, so existing pages draw exactly what they drew before)
    out.variant = function (side) { if (side !== 'right') return out; return vr || (vr = { normal: mkr('normal'), white: mkr('white'), grey: mkr('grey'), w: 24, h: 32, facing: 'right', variantOf: 'left' }); };
    return out;
  }
  /* ---------- fighter poses (opt-in, additive: fighter() output is unchanged) ----------
   * fighterPose(o, pose, side) -> canvas 48x48, the same figure as fighter(o) in an action pose, painted for `side`
   *   ('left' = native, 'right' = painted like variant('right'): body mirrored with the light kept top-left, the weapon in the
   *   same hand, now the far hand drawn behind the body). The 24x32 figure sits at offset (12, 16): feet centre at
   *   canvas.footX = 23 or 24, canvas.footY = 48 (one below the last row), so frames line up when drawn by their foot point.
   *   poses: idle, ready, windup, swing, follow, hurt, down (kneel), cast (weapon raised), aim (bow drawn, arrow nocked), release
   *   The weapon layer is the fighter's own gear pixels, turned about the grip and moved to the new hand (nearest sample, no
   *   smoothing); the front arm is redrawn from the shoulder to the hand. Cached per (opts, pose, side). */
  var POSE = {   // hand position (24x32 art coords, left-facing), weapon "up" direction, body lean (+ = back), drop (kneel)
    idle: { h: [3.5, 21.5], d: [0, -1], lean: 0 }, ready: { h: [2, 20], d: [-0.45, -0.89], lean: 1 },
    windup: { h: [12, 12], d: [0.86, -0.5], lean: 1 }, swing: { h: [1, 15], d: [-0.97, -0.24], lean: -1 },
    follow: { h: [2, 21], d: [-0.72, 0.69], lean: -1 }, hurt: { h: [5, 22], d: [0.5, 0.87], lean: 2, shut: 1 },
    down: { h: [1, 27], d: [-0.96, 0.28], lean: 1, drop: 5, shut: 1 }, cast: { h: [4, 9], d: [0, -1], lean: 0 },
    aim: { h: [0, 16], d: [0, -1], lean: 1, bow: 'draw' }, release: { h: [0, 16], d: [0, -1], lean: 0, bow: 'loose' } };
  var POSEC = {};
  function fighterPose(o, pose, side) {
    o = o || {}; pose = POSE[pose] ? pose : 'idle'; side = side === 'right' ? 'right' : 'left';
    if ((pose === 'aim' || pose === 'release') && o.gear !== 'bow') pose = 'cast';
    var key = JSON.stringify(o) + '|' + pose + '|' + side; if (POSEC[key]) return POSEC[key];
    var P = POSE[pose], pal = {}, kk, rows = [], i, hat = FHAT[o.head], OY = 2, W = 48, H = 48, OX = 12, OYC = 16, R = side === 'right';
    for (kk in FBASE) pal[kk] = FBASE[kk]; for (kk in (o.pal || {})) pal[kk] = o.pal[kk];
    if (!pal.t) { pal.t = pal.h; pal.T = pal.H; pal.u = pal.x; } pal.D = pal.d;
    for (i = 0; i < FHEAD.length; i++) rows.push(hat && hat[i] ? hat[i] : FHEAD[i]);
    rows = rows.concat(FBODY, o.robe ? FROBE : FLEGS);
    var SWAP = { B: 'd', d: 'B', H: 'x', x: 'H', p: 'P', P: 'p' };
    var A = Art(W, H), body = Art(W, H), gear = Art(W, H);
    // where a 24x32 art pixel (x, y) lands on the 48x48 canvas for this side
    var X = function (x) { return R ? OX + 23 - x : OX + x; }, Y = function (y) { return OYC + y; };
    var drop = P.drop || 0, upper = 2 + FHEAD.length + FBODY.length;   // rows above the legs (art y < upper) lean and drop
    var weaponArm = !!FGEAR[o.gear];
    // body
    for (var y = 0; y < rows.length; y++) {
      var ay = y + OY, isUpper = ay < upper, legRow = ay - upper;
      if (drop && !isUpper && legRow >= 2 && legRow < 2 + drop) continue;          // kneel: shorten the legs
      var dy = drop && (isUpper || legRow < 2) ? drop : 0, dx = isUpper ? -P.lean : 0;
      if (drop && !isUpper && legRow >= 2 + drop) dy = 0;
      if (drop && !isUpper && legRow < 2) dy = drop;
      for (var x = 0; x < 24; x++) {
        var ch = rows[y].charAt(x); if (ch === '.' || !pal[ch]) continue;
        if (weaponArm && pose !== 'idle' && ay >= 17 && ay <= 21 && x <= 4 && isUpper) continue;   // the resting front arm moves
        var c = ch === 'e' && P.shut ? 'S' : ch;
        if (R && SWAP[c] && pal[SWAP[c]]) c = SWAP[c];
        body.P(X(x + dx), Y(ay + dy), pal[c] || pal[ch]);
      }
    }
    if (o.beard) { var bdy = drop, bdx = -P.lean; for (var bx = 5; bx < 11; bx++) { body.P(X(bx + bdx), Y(10 + OY + bdy), pal.x); body.P(X(bx + 1 + bdx), Y(11 + OY + bdy), pal.x); } body.P(X(7 + bdx), Y(9 + OY + bdy), pal.x); body.P(X(8 + bdx), Y(9 + OY + bdy), pal.x); }
    if (o.shield) { var sh = o.shield, n2, sx0 = R ? 8 : 11; for (y = 0; y < 11; y++) { n2 = y < 6 ? 0 : (y - 4) >> 1; for (x = sx0 + n2; x < sx0 + 8 - n2; x++) body.P(R ? OX + x : OX + x, Y(16 + y + drop), x === sx0 + n2 || y === 0 ? sh[1] : x >= sx0 + 6 - n2 ? sh[2] : sh[0]); } var cxs = R ? 12 : 14; [[0, 3], [0, 4], [-1, 4], [1, 4], [0, 5], [0, 6]].forEach(function (q) { body.P(OX + cxs + q[0], Y(16 + q[1] + drop), sh[3] || pal.g); }); }
    // gear: drawn at rest in its own layer, then turned about the grip and moved to the pose's hand
    var rest = o.gear === 'bow' ? [1.5, 17.5] : [3.5, 21.5], hand = [P.h[0], P.h[1] + drop];
    var src = Art(W, H), statics = [];
    (FGEAR[o.gear] || []).forEach(function (r) { if (r[0] >= 10) { statics.push(r); return; } src.R(OX + r[0], OYC + r[1], r[2], r[3], r[4]); });
    if (P.bow === 'loose' || P.bow === 'draw') { src.g.clearRect(OX + 3, OYC + 10, 1, 15); }   // the bow string is redrawn below
    var sd = src.g.getImageData(0, 0, W, H).data, gd = gear.g.getImageData(0, 0, W, H), gdd = gd.data;
    var ang = Math.atan2(P.d[0], -P.d[1]), ca = Math.cos(ang), sa = Math.sin(ang);
    var hx = OX + hand[0], hy = OYC + hand[1], rx0 = OX + rest[0], ry0 = OYC + rest[1];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {   // inverse map: target pixel centre -> rest-layer pixel
      var vx = x + 0.5 - hx, vy = y + 0.5 - hy, ux = vx * ca + vy * sa, uy = -vx * sa + vy * ca, sxp = Math.floor(rx0 + ux), syp = Math.floor(ry0 + uy);
      if (sxp < 0 || syp < 0 || sxp >= W || syp >= H) continue;
      var q = (syp * W + sxp) * 4; if (sd[q + 3] < 128) continue;
      var tx = R ? (2 * OX + 23 - x) : x, qq = (y * W + tx) * 4; if (tx < 0 || tx >= W) continue;
      gdd[qq] = sd[q]; gdd[qq + 1] = sd[q + 1]; gdd[qq + 2] = sd[q + 2]; gdd[qq + 3] = 255;
    }
    gear.g.putImageData(gd, 0, 0);
    statics.forEach(function (r) { for (var yy = 0; yy < r[3]; yy++) for (var xx = 0; xx < r[2]; xx++) gear.P(X(r[0] + xx), Y(r[1] + yy + drop), r[4]); });
    // bow string / nocked arrow
    if (P.bow) {
      var top = [hand[0] + 0, hand[1] - 7], bot = [hand[0], hand[1] + 7], pull = P.bow === 'draw' ? [hand[0] + 7, hand[1]] : [hand[0] + 1, hand[1]];
      var line = function (a, b, col) { var n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) | 0; for (var k = 0; k <= n; k++) { var t = n ? k / n : 0; gear.P(X(Math.round(a[0] + (b[0] - a[0]) * t)), Y(Math.round(a[1] + (b[1] - a[1]) * t)), col); } };
      line([top[0] + 1, top[1]], pull, '#e8e0c8'); line(pull, [bot[0] + 1, bot[1]], '#e8e0c8');
      if (P.bow === 'draw') { line([hand[0] - 4, hand[1]], [pull[0] + 1, hand[1]], '#c8a070'); gear.P(X(hand[0] - 5), Y(hand[1]), '#e8eef8'); gear.P(X(hand[0] - 4), Y(hand[1] - 1), '#e8eef8'); gear.P(X(hand[0] - 4), Y(hand[1] + 1), '#e8eef8'); gear.P(X(pull[0]), Y(hand[1] - 1), '#e04848'); gear.P(X(pull[0]), Y(hand[1] + 1), '#e04848'); }
    }
    // front arm: shoulder -> hand, 2 px of sleeve, then the hand
    var arm = Art(W, H);
    if (weaponArm && pose !== 'idle') {
      var sh0 = [6 - P.lean, 16 + drop], sh1 = P.bow === 'draw' ? [hand[0] + 1, hand[1]] : hand, n3 = Math.max(Math.abs(sh1[0] - sh0[0]), Math.abs(sh1[1] - sh0[1])) | 0;
      var sleeve = R ? pal.d : pal.B, dark = R ? pal.B : pal.d;
      for (var k = 0; k <= n3; k++) { var t = n3 ? k / n3 : 0, ax = Math.round(sh0[0] + (sh1[0] - sh0[0]) * t), ayy = Math.round(sh0[1] + (sh1[1] - sh0[1]) * t); arm.P(X(ax), Y(ayy), t < 0.8 ? sleeve : pal.s); arm.P(X(ax), Y(ayy + 1), t < 0.8 ? dark : pal.S); }
      arm.R(Math.min(X(Math.floor(hand[0])), X(Math.floor(hand[0]) + 1)), Y(Math.floor(hand[1])), 2, 2, pal.s); arm.P(X(Math.floor(hand[0]) + 1), Y(Math.floor(hand[1]) + 1), pal.S);
      if (P.bow === 'draw') { arm.R(Math.min(X(hand[0] + 6), X(hand[0] + 7)), Y(hand[1]), 2, 2, pal.s); }
    } else if (weaponArm) { arm.P(X(3), Y(21), pal.s); arm.P(X(4), Y(21), pal.s); arm.P(X(3), Y(22), pal.S); arm.P(X(4), Y(22), pal.S); }
    // compose: right side keeps the weapon in the far hand, behind the body
    if (R) { A.g.drawImage(gear.c, 0, 0); A.g.drawImage(arm.c, 0, 0); A.g.drawImage(body.c, 0, 0); }
    else { A.g.drawImage(body.c, 0, 0); A.g.drawImage(gear.c, 0, 0); A.g.drawImage(arm.c, 0, 0); }
    A.outline(OLN);
    A.c.footX = R ? OX + 12 : OX + 12; A.c.footY = OYC + 32; A.c.facing = side; A.c.pose = pose;
    return (POSEC[key] = A.c);
  }
  /* mirror rule: an asset records the side its art looks at (fighter: 'left', actor side frame: 'right');
     flipX(asset, want) = (want !== asset.facing), want = 'left' | 'right' | -1 | 1. Never type the mirror per page. */
  function flipX(asset, want) { var w = want === 'left' || want === -1 ? 'left' : 'right'; return w !== ((asset && asset.facing) || 'right'); }
  /* drawFighter(g, f, x, footY, want, mode): feet centre at (x, footY), looking 'left' | 'right'; mode 'normal' | 'white' | 'grey' */
  function drawFighter(g, f, x, footY, want, mode) {
    var im = f[mode || 'normal'] || f.normal, X = Math.round(x) - 11, Y = Math.round(footY) - 31;
    if (flipX(f, want)) { g.save(); g.translate(X + 24 - 1, Y); g.scale(-1, 1); g.drawImage(im, 0, 0); g.restore(); } else g.drawImage(im, X, Y);
  }

  var API = { T: T, PAL: PAL, scene: scene, room: room, prop: prop, glow: glow, actor: actor, actorSprite: actorSprite, fighter: fighter, fighterPose: fighterPose, poses: Object.keys(POSE), flipX: flipX, drawFighter: drawFighter, sideGround: sideGround, rug: drawRug, strArt: function (rows, key) { return strArt(rows, key).c; }, hash: hsh, noise: vn,
    // draw one prop at its base point
    drawProp: function (g, kind, x, y, o, t) { var p = prop(kind, o), f = p.frames[p.frames.length > 1 ? Math.floor((t || 0) / 1000 * (p.fps || 6)) % p.frames.length : 0]; if (p.glow) glow(g, x, y + p.glow.dy, p.glow.r, '#ffd070', 1); g.drawImage(f, Math.round(x - (p.left ? 0 : p.ax)), Math.round(y - p.ay)); } };
  root.GameDNA_PixelScene = API; root.PXS = API;
})(typeof window !== 'undefined' ? window : this);
