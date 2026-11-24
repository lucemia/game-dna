/* GameDNA skin 'painted-impasto' · Painted impasto HD · needs skin-api.js first
 *
 * Hand-painted HD 2D: thick oil paint laid in broad impasto strokes, a warm golden key light from the upper left, deep
 * cool plum-brown shadows, a bold dark umber outline around every figure and object, and ornate framed UI (oxblood
 * lacquer panels, hammered-gold rims and corner leaves, Alegreya type). See skins/painted-impasto/STYLE.md.
 *
 * Two layers of art, same look:
 *   1. Code-drawn (always available): every surface is built from `stroke()`, a brush stroke with a ragged bristle edge,
 *      a lit ridge on its upper-left side and a dark lip on its lower-right side, so code-drawn ground, ranges, arrows,
 *      gauges, numbers and windows read as thick paint, not vector fills.
 *   2. Generated art (optional): a small pack of bitmaps made once with Codex image_gen under an L-00 style lock
 *      (assets/assets.json: prompts, sha256, model check). When the pack loads, units, props, the HUD portrait, the
 *      grass / water ground and the window / plate frames use it; anything missing keeps the code-drawn version.
 *      The pack is looked up next to this script (assets/pack/); override with `GameDNA_ImpastoBase = 'url/'` before
 *      loading, or call `skin.impasto.load(baseUrl)`. `skin.impasto.ready` resolves when it settled (loaded or failed);
 *      `skin.impasto.useArt(false)` forces the code-only look. Hosts that cache their ground should draw it after
 *      `ready` (the shared scene's first frame comes after fonts, which load later than the local pack).
 *
 * Host: native 256x224 (or any), scale 'fit': backing store = display px, ctx.setTransform(s, 0, 0, s, 0, 0).
 * Methods: frame text number overlay bar cursor path tile prop unitToken atmosphere.
 */
(function (root) {
  'use strict';
  var API = root.GameDNA_Skin;
  if (!API) { if (root.console) console.error('painted-impasto.js: load skin-api.js first'); return; }
  var C = API.color, rgba = C.rgba, mix = C.mix;

  var SC = '"Alegreya SC", "Alegreya", "Palatino Linotype", Palatino, Georgia, serif';
  var SERIF = '"Alegreya", "Palatino Linotype", Palatino, Georgia, serif';
  var SANS = '"Alegreya Sans", "Gill Sans", "Trebuchet MS", system-ui, sans-serif';
  var INK = '#1f130c', GOLD = '#e0b052', GOLD_L = '#fbe3a0', GOLD_D = '#8a5a22', CREAM = '#f6e7c4', OX = '#4a1c1a', PLUM = '#2a1820';

  var palette = {
    ink: INK, paper: CREAM,
    ui: {
      fill: '#3a1d1a', fillTo: '#22110f', edge: GOLD, highlight: GOLD_L, shadow: 'rgba(16,6,4,0.62)', select: 'rgba(224,176,82,0.30)', well: 'rgba(14,6,4,0.45)',
      accent: GOLD, accent2: '#d0682c',
      lacquer: { a: ['#33282e', '#181216'], b: ['#4e1c1c', '#260c0d'], n: ['#3c261d', '#20120d'] },
      gem: { a: '#6f9ad8', b: '#d8434a', n: '#d79a3a' }
    },
    team: { a: '#4d6e9e', b: '#a8343a', n: '#8a8270', aLight: '#a9c2e4', aDark: '#222f4c', bLight: '#ec9a86', bDark: '#4e1418', nLight: '#cfc6ae', nDark: '#433d30',
      aText: '#d4e2f6', bText: '#f6d2c8' },
    overlay: {
      move: { fill: '#2f6ad8', edge: '#d4e6ff', deep: '#14306c', alpha: 0.4 },
      attack: { fill: '#c83a30', edge: '#ffc4a8', deep: '#5e1410', alpha: 0.34 },
      threat: { fill: '#8a4aa8', edge: '#e2c4f4', deep: '#3a1a4c', alpha: 0.27 },
      heal: { fill: '#4aa45a', edge: '#d0f4b8', deep: '#1a4a24', alpha: 0.32 },
      path: { core: '#fff6dc', light: GOLD_L, mid: GOLD, dark: GOLD_D, outline: INK, spark: '#ffffff' },
      pathBad: { core: '#ffe8de', light: '#f4a890', mid: '#c8463a', dark: '#5e1814', outline: INK, spark: '#ffd6d0' }
    },
    fx: { hot: '#f08a34', cold: '#7ab8e8', heal: '#8ad86a', crit: '#f6c44a', status: '#b07ad8', white: '#fff6e0', ember: '#d0582a' },
    text: {
      main: '#f6ead0', shadow: 'rgba(16,6,4,0.85)', outline: INK, dim: '#9c8a74', accent: GOLD, select: '#fff4d4',
      title: '#fff0c4', title2: '#e0a94a', label: GOLD, label2: '#c27a2c', gold: GOLD, gold2: '#b0702a',
      plate: '#fbeccc', plateShadow: 'rgba(16,6,4,0.85)', pointer: GOLD, onAccent: '#2a1408'
    },
    // pop-up numerals: [top, bottom, swash colour behind (null = none)]
    numbers: {
      damage: ['#fffaf0', '#f2cf9a', null], crit: ['#fff6c8', '#f29a2a', '#a8261e'], heal: ['#f2ffe4', '#6cc85a', '#1e4a24'],
      mp: ['#eef6ff', '#5a9ae0', '#1c3460'], miss: ['#efe6d6', '#a49882', null], status: ['#f8eaff', '#a86ad8', '#3a1a4c'], label: ['#fff2c0', '#e8a23a', null]
    },
    bars: {
      track: '#1c0f0c', charge: ['#f8d488', '#d88a34'], ready: ['#fff2c8', '#f0b44a'], queued: ['#c4d8f4', '#5a80c0'],
      haste: ['#dcf4a0', '#6aa840'], slow: ['#e4d4f4', '#8a64c0'], enemy: ['#f4b4a0', '#b8382e'], enemyFull: ['#fff0c0', '#e0782c'],
      hp: ['#d4f4a4', '#5aa448'], hpLow: ['#fce0a0', '#d86a2a']
    },
    terrain: { grass: '#7a8a3e', forest: '#4a5e2e', water: '#2e5a66', hill: '#9a8a4a', mountain: '#7e7468', road: '#a8804e', bridge: '#8a5a34',
      fort: '#9a8c7a', sand: '#d4b47a', wall: '#6e6258', floor: '#8a7a68' },
    // paint ramps per terrain: [shadow, mid, light, accent]
    ramps: {
      grass: ['#5a5418', '#8a8228', '#c0a03a', '#e0b448'], forest: ['#24301a', '#3e5228', '#6e7a34', '#8a7a34'],
      water: ['#163a48', '#2a5e6e', '#4a8a8a', '#cfe0c8'], hill: ['#5a4e2a', '#8e7e42', '#c0a85a', '#d8b860'],
      mountain: ['#3a3236', '#6e645c', '#a49884', '#c8b48a'], road: ['#5e4024', '#9a7448', '#c8a068', '#e0c08a'],
      sand: ['#8e7044', '#c8a670', '#ecd09a', '#f6e2b0'], floor: ['#4a3e34', '#7a6a58', '#a89478', '#c4ac88'],
      wall: ['#2e2622', '#5a4e46', '#8a7a6a', '#a89070'], fort: ['#4a4038', '#867868', '#b8a68c', '#d0bc98'], bridge: ['#4a2e1a', '#8a5a34', '#c08a54', '#e0b070']
    },
    skin: { a: '#e8b48a', b: '#a8b49a', n: '#e0b090', hair: '#5a2e1a' },
    mood: { warm: '#ffc46a', cool: '#3a2448', pool: 0.9, vignette: '#1a0c10', vignetteAlpha: 0.55 }
  };

  /* ---------------- helpers ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function scaleOf(ctx) { return API.scaleOf ? API.scaleOf(ctx) : 1; }
  function hair(ctx) { return 1 / scaleOf(ctx); }
  function setSh(ctx, col, blur, dx, dy) { API.setShadow(ctx, col, blur, dx || 0, dy || 0); }
  function noSh(ctx) { API.clearShadow(ctx); }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); if (w <= 0 || h <= 0) return; var R = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    ctx.moveTo(x + R, y); ctx.lineTo(x + w - R, y); ctx.arcTo(x + w, y, x + w, y + R, R); ctx.lineTo(x + w, y + h - R);
    ctx.arcTo(x + w, y + h, x + w - R, y + h, R); ctx.lineTo(x + R, y + h); ctx.arcTo(x, y + h, x, y + h - R, R); ctx.lineTo(x, y + R); ctx.arcTo(x, y, x + R, y, R); ctx.closePath();
  }
  function lin(ctx, x0, y0, x1, y1, stops) { var g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  function rad(ctx, x, y, r0, r1, stops) { var g = ctx.createRadialGradient(x, y, r0, x, y, Math.max(r0 + 0.01, r1)); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); }
  function ell(ctx, x, y, rx, ry, a) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), a || 0, 0, Math.PI * 2); }
  function vh(ix, iy, s) { var n = (ix * 374761393 + iy * 668265263 + s * 1442695041) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
  function h3(a, b, c) { return vh(Math.round(a * 7), Math.round(b * 7), c || 0); }
  function vn(x, y, s) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = vh(ix, iy, s), b = vh(ix + 1, iy, s), c = vh(ix, iy + 1, s), d = vh(ix + 1, iy + 1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  var POOL = {};
  function pooled(key, w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    var c = POOL[key]; if (!c) { c = POOL[key] = (typeof document !== 'undefined' ? document.createElement('canvas') : null); if (!c) return null; }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else c.getContext('2d').clearRect(0, 0, w, h);
    return c;
  }
  function stdLights(list) { return API.normLights ? API.normLights(list || []) : (list || []); }
  var LX = -0.7071, LY = -0.7071;   // direction TO the key light (upper left)

  /* ---------------- the brush: one impasto stroke ----------------
     stroke(ctx, x0, y0, x1, y1, w, col, seed, o): a slightly curved stroke from (x0,y0) to (x1,y1), width w (native px),
     ragged bristle edge, a lit ridge on the side facing the key light, a dark lip on the other side, 2 bristle streaks.
     o = {alpha, ridge (0..1), lip (0..1), bend (-1..1), taper (0..1), light (ridge colour), dark (lip colour), streaks}. */
  function stroke(ctx, x0, y0, x1, y1, w, col, seed, o) {
    o = o || {}; var dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 0.001, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    var bend = (o.bend == null ? (vh(seed, 3, 11) - 0.5) * 0.5 : o.bend) * w, taper = o.taper == null ? 0.35 : o.taper, N = 6, i, k, A = [], B = [];
    for (i = 0; i <= N; i++) {
      k = i / N; var cx = x0 + dx * k + nx * bend * Math.sin(Math.PI * k), cy = y0 + dy * k + ny * bend * Math.sin(Math.PI * k);
      var prof = 1 - taper * Math.pow(Math.abs(2 * k - 1), 2.2), ra = (0.42 + 0.14 * vh(seed, i, 1)) * w * prof, rb = (0.42 + 0.14 * vh(seed, i, 2)) * w * prof;
      A.push([cx + nx * ra, cy + ny * ra]); B.push([cx - nx * rb, cy - ny * rb]);
    }
    var pa = ctx.globalAlpha; if (o.alpha != null) ctx.globalAlpha = pa * o.alpha;
    ctx.beginPath(); ctx.moveTo(A[0][0], A[0][1]);
    for (i = 1; i <= N; i++) ctx.lineTo(A[i][0], A[i][1]);
    // rounded-ish bristle end
    ctx.quadraticCurveTo(x1 + ux * w * 0.32, y1 + uy * w * 0.32, B[N][0], B[N][1]);
    for (i = N - 1; i >= 0; i--) ctx.lineTo(B[i][0], B[i][1]);
    ctx.quadraticCurveTo(x0 - ux * w * 0.22, y0 - uy * w * 0.22, A[0][0], A[0][1]); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    // which edge faces the light
    var litA = nx * LX + ny * LY > 0, top = litA ? A : B, bot = litA ? B : A, ridge = o.ridge == null ? 0.55 : o.ridge, lip = o.lip == null ? 0.45 : o.lip;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (ridge > 0) {
      ctx.strokeStyle = o.light || mix(col, '#fff4d6', 0.42); ctx.globalAlpha = (o.alpha == null ? pa : pa * o.alpha) * ridge; ctx.lineWidth = w * 0.16;
      ctx.beginPath(); for (i = 1; i < N; i++) { var p = top[i], q = [p[0] - (top === A ? nx : -nx) * w * 0.1, p[1] - (top === A ? ny : -ny) * w * 0.1]; if (i === 1) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); } ctx.stroke();
    }
    if (lip > 0) {
      ctx.strokeStyle = o.dark || mix(col, '#1a0c10', 0.5); ctx.globalAlpha = (o.alpha == null ? pa : pa * o.alpha) * lip; ctx.lineWidth = w * 0.13;
      ctx.beginPath(); for (i = 1; i < N; i++) { var p2 = bot[i]; if (i === 1) ctx.moveTo(p2[0], p2[1]); else ctx.lineTo(p2[0], p2[1]); } ctx.stroke();
    }
    var st = o.streaks == null ? 2 : o.streaks;
    for (var s = 0; s < st; s++) {
      var off = (vh(seed, s, 7) - 0.5) * w * 0.55, lc = s % 2 ? mix(col, '#fff0d0', 0.25) : mix(col, '#140a0c', 0.25);
      ctx.strokeStyle = lc; ctx.globalAlpha = (o.alpha == null ? pa : pa * o.alpha) * 0.4; ctx.lineWidth = w * 0.07;
      ctx.beginPath(); ctx.moveTo(x0 + ux * L * 0.1 + nx * off, y0 + uy * L * 0.1 + ny * off);
      ctx.quadraticCurveTo(x0 + dx * 0.5 + nx * (off + bend * 0.9), y0 + dy * 0.5 + ny * (off + bend * 0.9), x1 - ux * L * 0.12 + nx * off, y1 - uy * L * 0.12 + ny * off); ctx.stroke();
    }
    ctx.globalAlpha = pa;
  }
  // fill a path, then paint strokes inside it (clipped): base, light strokes upper-left, shade strokes lower-right, ink outline
  function painted(ctx, path, box, base, seed, o) {
    o = o || {}; var x = box.x, y = box.y, w = box.w, h = box.h, n = Math.max(2, Math.round((o.n || 5) * 0.6)), sw = Math.max(1, (o.sw || Math.min(w, h) * 0.32) * 1.5), ang = o.ang == null ? -0.5 : o.ang;   // few big strokes: flat value planes
    var light = o.light || mix(base, '#ffe7b0', 0.38), shade = o.shade || mix(base, '#24101c', 0.5);
    path(); ctx.fillStyle = base; ctx.fill();
    ctx.save(); path(); ctx.clip();
    // shade: lower-right half
    ctx.fillStyle = lin(ctx, x, y, x + w, y + h, [[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(0,0,0,0)'], [1, rgba(shade, 0.85)]]); ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    var ca = Math.cos(ang), sa = Math.sin(ang);
    for (var i = 0; i < n; i++) {
      var u = vh(seed, i, 21), v = vh(seed, i, 22), cx = x + w * (0.1 + 0.8 * u), cy = y + h * (0.1 + 0.8 * v), len = Math.max(w, h) * (0.35 + 0.3 * vh(seed, i, 23));
      var lt = (1 - u) * 0.6 + (1 - v) * 0.4, col = lt > 0.55 ? light : lt < 0.35 ? shade : mix(base, light, 0.2);
      stroke(ctx, cx - ca * len / 2, cy - sa * len / 2, cx + ca * len / 2, cy + sa * len / 2, sw, col, seed * 7 + i, { alpha: 0.92, ridge: 0.6, lip: 0.4, streaks: 0, taper: 0.15 });
    }
    ctx.restore();
    if (o.outline !== false) { path(); ctx.strokeStyle = o.ink || INK; ctx.lineWidth = o.ow || 0.7; ctx.lineJoin = 'round'; ctx.stroke(); }
  }

  /* ---------------- generated art pack (optional) ---------------- */
  // drawn sizes in native px (the pack is stored at ~5x for 1280-wide canvases; smoothing on)
  var ART = {
    'unit-knight': { file: 'pack/unit-knight.webp', h: 25, foot: 0.985 },
    'unit-mage': { file: 'pack/unit-mage.webp', h: 25, foot: 0.985 },
    'unit-ghoul': { file: 'pack/unit-ghoul.webp', h: 23, foot: 0.985 },
    'unit-wraith': { file: 'pack/unit-wraith.webp', h: 27, foot: 0.97 },
    'portrait-knight': { file: 'pack/portrait-knight.webp' },
    'portrait-mage': { file: 'pack/portrait-mage.webp' },
    'prop-tree': { file: 'pack/prop-tree.webp', h: 40 },
    'prop-bush': { file: 'pack/prop-bush.webp', h: 13 },
    'prop-stone': { file: 'pack/prop-stone.webp', h: 15 },
    'prop-brazier': { file: 'pack/prop-brazier.webp', h: 19, fire: [0.45, 0.46] },
    'prop-lamp': { file: 'pack/prop-lamp.webp', h: 30, fire: [0.46, 0.44] },
    'prop-crystal': { file: 'pack/prop-crystal.webp', h: 20, fire: [0.5, 0.48] },
    'tile-grass': { file: 'pack/tile-grass.webp', cells: 4 },
    'tile-water': { file: 'pack/tile-water.webp', cells: 4 },
    'frame-window': { file: 'pack/frame-window.webp', slice: [88, 86, 88, 86], thick: 33, pad: 2 },
    'frame-plate': { file: 'pack/frame-plate.webp', slice: [20, 20, 20, 20], thick: 12, pad: 2 }
  };
  var art = { on: true, loaded: 0, failed: 0, base: null, imgs: {}, ready: null };
  function artOk(key) { var im = art.on && art.imgs[key]; return !!(im && im.complete && im.naturalWidth > 0); }
  function scriptBase() {
    try { if (root.GameDNA_ImpastoBase) return String(root.GameDNA_ImpastoBase); var s = typeof document !== 'undefined' && document.currentScript && document.currentScript.src; return s ? s.replace(/[^\/]*$/, '') + 'assets/' : null; } catch (e) { return null; }
  }
  function loadArt(base) {
    if (typeof Image === 'undefined' || !base) { art.ready = Promise.resolve(0); return art.ready; }
    art.base = base; art.imgs = {}; art.loaded = 0; art.failed = 0;
    art.ready = Promise.all(Object.keys(ART).map(function (k) {
      return new Promise(function (res) {
        var im = new Image(); im.decoding = 'async';
        im.onload = function () { art.loaded++; res(); }; im.onerror = function () { art.failed++; delete art.imgs[k]; res(); };
        art.imgs[k] = im; im.src = base + ART[k].file;
      });
    })).then(function () { return art.loaded; });
    return art.ready;
  }
  // draw image key with foot at (cx, fy), height h native px; flip mirrors
  function drawArt(ctx, key, cx, fy, h, flip, alpha) {
    var im = art.imgs[key], A = ART[key], foot = A.foot || 0.99, w = h * im.naturalWidth / im.naturalHeight, pa = ctx.globalAlpha;
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; if (alpha != null) ctx.globalAlpha = pa * alpha;
    ctx.translate(cx, fy); if (flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -w / 2, -h * foot, w, h); ctx.restore();
  }
  // a generated sprite with an extra umber outline: its silhouette, tinted ink, stamped at 8 offsets behind it
  function drawArtOutlined(ctx, key, cx, fy, h, flip, ow) {
    var im = art.imgs[key], A = ART[key], foot = A.foot || 0.99, w = h * im.naturalWidth / im.naturalHeight, dk = scaleOf(ctx);
    var L = pooled('imp-sil-' + key, Math.ceil(w * dk) + 2, Math.ceil(h * dk) + 2);
    if (L) {
      var q = L.getContext('2d'); q.setTransform(1, 0, 0, 1, 0, 0); q.imageSmoothingEnabled = true; q.drawImage(im, 1, 1, w * dk, h * dk);
      q.globalCompositeOperation = 'source-in'; q.fillStyle = INK; q.fillRect(0, 0, L.width, L.height); q.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(cx, fy); if (flip) ctx.scale(-1, 1);
      for (var k = 0; k < 8; k++) { var an = k * Math.PI / 4; ctx.drawImage(L, -w / 2 - 1 / dk + Math.cos(an) * ow, -h * foot - 1 / dk + Math.sin(an) * ow, L.width / dk, L.height / dk); }
      ctx.restore();
    }
    drawArt(ctx, key, cx, fy, h, flip);
  }
  // nine-slice: the frame's wooden / gold band (A.thick source px) is drawn `thick` native px wide, centred on the rect's edge
  function drawFrame9(ctx, key, x0, y0, w0, h0, thick, alpha) {
    var im = art.imgs[key], A = ART[key], S = A.slice, k = thick / A.thick, iw = im.naturalWidth, ih = im.naturalHeight, pa = ctx.globalAlpha;
    var o = (A.pad + A.thick / 2) * k, x = x0 - o, y = y0 - o, w = w0 + 2 * o, h = h0 + 2 * o;
    var l = S[0] * k, t = S[1] * k, r = S[2] * k, b = S[3] * k;
    if (w < l + r || h < t + b) { var f = Math.min(w / (l + r), h / (t + b)); l *= f; t *= f; r *= f; b *= f; }
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; if (alpha != null) ctx.globalAlpha = pa * alpha;
    var sx = [0, S[0], iw - S[2], iw], sy = [0, S[1], ih - S[3], ih], dx = [x, x + l, x + w - r, x + w], dy = [y, y + t, y + h - b, y + h];
    for (var j = 0; j < 3; j++) for (var i = 0; i < 3; i++) {
      if (i === 1 && j === 1) continue;
      var sw = sx[i + 1] - sx[i], shh = sy[j + 1] - sy[j], dw = dx[i + 1] - dx[i], dh = dy[j + 1] - dy[j];
      if (sw > 0 && shh > 0 && dw > 0 && dh > 0) ctx.drawImage(im, sx[i], sy[j], sw, shh, dx[i], dy[j], dw + (i < 2 ? 0.02 : 0), dh + (j < 2 ? 0.02 : 0));
    }
    ctx.restore();
  }

  /* ---------------- painted ground (continuous across cells) ---------------- */
  // base colour field at world position (two octaves of value noise), mixed through the kind's ramp
  function fieldCol(kind, wx, wy, t) {
    var R = palette.ramps[kind] || palette.ramps.grass, n = 0.62 * vn(wx / 22, wy / 22, 3) + 0.38 * vn(wx / 7 + t * 0.3, wy / 7, 9);
    return n < 0.5 ? mix(R[0], R[1], clamp(n * 2, 0, 1) * 0.8 + 0.2) : mix(R[1], R[2], (n - 0.5) * 1.3);
  }
  // strokes owned by world cell (cx, cy): deterministic; a tile draws its own and its neighbours' strokes clipped to itself
  function cellStrokes(ctx, kind, cx, cy, T, u, t) {
    var R = palette.ramps[kind] || palette.ramps.grass, water = kind === 'water', n = 4, seed = cx * 131 + cy * 977;
    var ang0 = water ? 0.05 : -0.55 + 0.9 * vn(cx * 0.4, cy * 0.4, 5);
    for (var i = 0; i < n; i++) {
      var px = (cx + vh(seed, i, 1)) * T, py = (cy + vh(seed, i, 2)) * T, len = T * (water ? 0.9 + 0.5 * vh(seed, i, 3) : 0.55 + 0.4 * vh(seed, i, 3));
      if (water) px += ((t || 0) * 2.2 + vh(seed, i, 9) * T) % T - T / 2;
      var a = ang0 + (vh(seed, i, 4) - 0.5) * 0.7, ca = Math.cos(a), sa = Math.sin(a), sel = vh(seed, i, 5);
      var col = sel < 0.32 ? R[0] : sel < 0.66 ? R[1] : sel < 0.92 ? R[2] : R[3];
      col = mix(col, fieldCol(kind, px, py, 0), 0.35);
      stroke(ctx, px - ca * len / 2, py - sa * len / 2, px + ca * len / 2, py + sa * len / 2, (water ? 2.6 : 3.6 + 1.6 * vh(seed, i, 6)) * u, col, seed + i,
        { alpha: water ? 0.6 : 0.92, ridge: water ? 0.4 : 0.75, lip: 0.55, streaks: 0, taper: 0.05, bend: 0.08 });   // knife planes: flat ends, hard ridge
    }
    if (water) {   // drifting cream glints
      for (var j = 0; j < 2; j++) {
        var ph = (t || 0) * 0.5 + vh(seed, j, 12) * 6.28, gx = (cx + 0.2 + 0.6 * vh(seed, j, 13)) * T + Math.sin(ph) * 1.5 * u, gy = (cy + 0.25 + 0.5 * vh(seed, j, 14)) * T;
        stroke(ctx, gx - 2.4 * u, gy, gx + 2.4 * u, gy - 0.2 * u, 0.9 * u, R[3], seed + 50 + j, { alpha: 0.35 + 0.3 * Math.max(0, Math.sin(ph * 1.3)), ridge: 0, lip: 0, streaks: 0, taper: 0.8 });
      }
    }
  }
  // water cells drawn this frame (native rects), for the painted banks in atmosphere('world')
  var WATER = {};
  function paintGround(ctx, r, kind, t) {
    if (kind === 'water') WATER[Math.round(r.x / r.w) + ',' + Math.round(r.y / r.h)] = r.w;
    var T = r.w, u = T / 16, cx = Math.round(r.x / T), cy = Math.round(r.y / T), x = r.x, y = r.y, w = r.w, h = r.h;
    // bleed the clip by ~1 device px: neighbours paint the same continuous content, so the overlap hides anti-aliased seams
    var e = 1 / scaleOf(ctx); ctx.save(); ctx.beginPath(); ctx.rect(x - e, y - e, w + 2 * e, h + 2 * e); ctx.clip();
    // field: a padded 7x7 texel grid sampled at world positions, drawn with bilinear smoothing, so neighbouring cells meet
    // on identical samples and the field has no seam
    var F = pooled('imp-field', 7, 7), fg = F && F.getContext('2d');
    if (fg) {
      var img = fg.createImageData(7, 7), dd = img.data;
      for (var j = 0; j < 7; j++) for (var i = 0; i < 7; i++) { var c = C.rgb(fieldCol(kind, x + (i - 1) * w / 4, y + (j - 1) * h / 4, kind === 'water' ? t || 0 : 0)), o4 = (j * 7 + i) * 4; dd[o4] = c[0]; dd[o4 + 1] = c[1]; dd[o4 + 2] = c[2]; dd[o4 + 3] = 255; }
      fg.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true;
      // texel centre i maps to world x + (i - 1) * w / 4  ->  texel edge 0 at x - 1.5 * w / 4
      ctx.drawImage(F, x - 1.5 * w / 4, y - 1.5 * h / 4, 7 * w / 4, 7 * h / 4);
    }
    var key = kind === 'water' ? 'tile-water' : kind === 'grass' || kind === 'forest' || kind === 'hill' ? 'tile-grass' : null;
    if (key && artOk(key)) {
      var im = art.imgs[key], n = ART[key].cells, sw = im.naturalWidth / n, sh = im.naturalHeight / n, ox = 0;
      var ci = ((cx % n) + n) % n, cj = ((cy % n) + n) % n;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      // one repeating pattern in world space (one 4x4-cell block per texture), so block edges never resample the image border
      var pat = ctx.createPattern(im, 'repeat'), BW = n * w / im.naturalWidth, BH = n * h / im.naturalHeight;
      if (kind === 'water') ox = (((t || 0) * 3) % (n * T) + n * T) % (n * T);   // slow drift (wraps)
      if (pat && pat.setTransform && typeof DOMMatrix !== 'undefined') {
        pat.setTransform(new DOMMatrix([BW, 0, 0, BH, -ox, 0])); ctx.fillStyle = pat; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      } else ctx.drawImage(im, x - ci * w - ox, y - cj * h, n * w, n * h);
      // calm the texture under units and ranges: a thin flat layer of the field's mid tone
      if (kind !== 'water') { ctx.fillStyle = rgba(palette.ramps.grass[1], 0.26); ctx.fillRect(x - 1, y - 1, w + 2, h + 2); }
      // break the 4-cell repeat: the continuous colour field laid over at low strength, plus two loose strokes per cell
      if (F && kind !== 'water') { ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.7; ctx.drawImage(F, x - 1.5 * w / 4, y - 1.5 * h / 4, 7 * w / 4, 7 * h / 4); ctx.restore();
        for (var sy3 = -1; sy3 <= 1; sy3++) for (var sx3 = -1; sx3 <= 1; sx3++) looseStrokes(ctx, kind, cx + sx3, cy + sy3, T, u); }
      if (kind === 'grass') scatter(ctx, cx, cy, T, u);
      if (kind === 'forest') { ctx.fillStyle = 'rgba(30,40,14,0.35)'; ctx.fillRect(x, y, w, h); }
      if (kind === 'hill') { ctx.fillStyle = 'rgba(190,150,70,0.22)'; ctx.fillRect(x, y, w, h); }
      if (kind === 'water') for (var dy2 = -1; dy2 <= 1; dy2++) for (var dx2 = -1; dx2 <= 1; dx2++) glints(ctx, cx + dx2, cy + dy2, T, u, t);
    } else {
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) cellStrokes(ctx, kind, cx + dx, cy + dy, T, u, t);
      if (kind === 'grass') scatter(ctx, cx, cy, T, u);
    }
    ctx.restore();
  }
  // seeded per-cell landmarks (the pack's grass has none, so nothing repeats every 4 cells): a cream flower cluster or a
  // flat pebble, painted as knife planes with an umber edge; kept inside the cell so the cell clip never cuts them
  function scatter(ctx, cx, cy, T, u) {
    var seed = cx * 733 + cy * 1913, r = vh(seed, 1, 61);
    var px = (cx + 0.25 + 0.5 * vh(seed, 2, 61)) * T, py = (cy + 0.3 + 0.45 * vh(seed, 3, 61)) * T;
    if (r < 0.13) {
      for (var i = 0; i < 5; i++) { var an = i * 1.2566 + vh(seed, i, 62) * 0.4; stroke(ctx, px, py, px + Math.cos(an) * 2.3 * u, py + Math.sin(an) * 1.7 * u, 2.1 * u, i % 2 ? '#f4e2b4' : '#ecd29a', seed + i, { alpha: 0.95, ridge: 0.6, lip: 0.5, streaks: 0, taper: 0.4 }); }
      ctx.fillStyle = '#c8701e'; circ(ctx, px, py, 0.85 * u); ctx.fill(); ctx.strokeStyle = rgba(INK, 0.6); ctx.lineWidth = 0.3 * u; ctx.stroke();
    } else if (r < 0.21) {
      var rx = (2.2 + 1.4 * vh(seed, 4, 61)) * u, ry = rx * 0.62;
      ctx.fillStyle = 'rgba(40,22,26,0.35)'; ell(ctx, px + 0.5 * u, py + 0.5 * u, rx, ry); ctx.fill();
      ctx.save(); ell(ctx, px, py, rx, ry); ctx.fillStyle = '#8c7a66'; ctx.fill(); ctx.clip();
      ctx.fillStyle = '#b8a688'; ctx.beginPath(); ctx.moveTo(px - rx, py - ry * 0.1); ctx.lineTo(px + rx * 0.3, py - ry); ctx.lineTo(px + rx, py - ry * 0.4); ctx.lineTo(px - rx * 0.1, py + ry * 0.2); ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.strokeStyle = INK; ctx.lineWidth = 0.4 * u; ell(ctx, px, py, rx, ry); ctx.stroke();
    }
  }
  function looseStrokes(ctx, kind, cx, cy, T, u) {
    var R = palette.ramps[kind] || palette.ramps.grass, seed = cx * 211 + cy * 389;
    for (var i = 0; i < 2; i++) {
      if (vh(seed, i, 8) < 0.35) continue;
      var px = (cx + vh(seed, i, 1)) * T, py = (cy + vh(seed, i, 2)) * T, len = T * (0.45 + 0.35 * vh(seed, i, 3)), a = -0.5 + (vh(seed, i, 4) - 0.5) * 0.9;
      len *= 0.6;
      stroke(ctx, px - Math.cos(a) * len / 2, py - Math.sin(a) * len / 2, px + Math.cos(a) * len / 2, py + Math.sin(a) * len / 2, 2.8 * u, vh(seed, i, 5) < 0.5 ? R[3] : R[0], seed + i, { alpha: 0.3, ridge: 0.35, lip: 0.5, streaks: 1 });
    }
  }
  function glints(ctx, cx, cy, T, u, t) {
    var seed = cx * 131 + cy * 977, R = palette.ramps.water;
    for (var j = 0; j < 2; j++) {
      var ph = (t || 0) * 0.5 + vh(seed, j, 12) * 6.28, gx = (cx + 0.2 + 0.6 * vh(seed, j, 13)) * T + Math.sin(ph) * 1.5 * u, gy = (cy + 0.25 + 0.5 * vh(seed, j, 14)) * T;
      stroke(ctx, gx - 2.2 * u, gy, gx + 2.2 * u, gy - 0.2 * u, 0.8 * u, R[3], seed + 50 + j, { alpha: 0.25 + 0.35 * Math.max(0, Math.sin(ph * 1.3)), ridge: 0, lip: 0, streaks: 0, taper: 0.8 });
    }
  }

  /* ---------------- shadows and light ---------------- */
  function contact(ctx, cx, fy, rx, a) {
    ctx.save(); ctx.translate(cx, fy); ctx.scale(1, 0.38);
    ctx.fillStyle = rad(ctx, 0, 0, 0, rx, [[0, rgba('#1a0a14', 0.6 * (a || 1))], [0.6, rgba('#1a0a14', 0.34 * (a || 1))], [1, 'rgba(26,10,20,0)']]);
    circ(ctx, 0, 0, rx); ctx.fill(); ctx.restore();
  }
  // long soft cast shadow down-right (key light upper-left)
  function cast(ctx, cx, fy, w, len, a) {
    ctx.save(); ctx.translate(cx, fy); ctx.transform(1, 0, 0.9, 0.42, 0, 0);
    ctx.fillStyle = lin(ctx, 0, 0, 0, -len, [[0, rgba('#1a0a18', 0.46 * (a || 1))], [1, 'rgba(26,10,24,0)']]);
    ell(ctx, 0, -len / 2, w / 2, len / 2); ctx.fill(); ctx.restore();
  }
  function warmGlow(ctx, x, y, r, col, a) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rad(ctx, x, y, 0, r, [[0, rgba(col, 0.55 * a)], [0.35, rgba(col, 0.22 * a)], [1, rgba(col, 0)]]);
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r); ctx.restore();
  }
  function flame(ctx, x, y, w, h, ph) {
    var sw = Math.sin(ph) * w * 0.18;
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.bezierCurveTo(x - w * 0.6, y - h * 0.5, x + sw - w * 0.15, y - h * 0.7, x + sw, y - h);
    ctx.bezierCurveTo(x + sw + w * 0.2, y - h * 0.65, x + w * 0.6, y - h * 0.45, x + w / 2, y); ctx.closePath();
  }

  /* ---------------- code-drawn figures (fallback when the pack is missing or for kinds it lacks) ---------------- */
  function figure(ctx, cx, fy, u, un, t) {
    var team = un.team === 'b' ? 'b' : un.team === 'n' ? 'n' : 'a', P = palette.team, kind = un.kind || 'fighter', seed = (un.id || kind).length * 17 + (team === 'b' ? 5 : 0);
    var tc = P[team], tl = P[team + 'Light'], td = P[team + 'Dark'], skinC = kind === 'monster' || (team === 'b' && kind === 'fighter') ? '#9aa88a' : palette.skin[team];
    var wraith = team === 'b' && kind === 'mage', metal = '#8e8a86', leather = '#6a4226';
    var o = { ow: 0.75 * u };
    // legs / skirt
    if (!wraith) {
      [-1.6, 1.6].forEach(function (lx, i) { painted(ctx, function () { rr(ctx, cx + lx * u - 1.3 * u, fy - 7.5 * u, 2.6 * u, 7.5 * u, 0.8 * u); }, { x: cx + lx * u - 1.3 * u, y: fy - 7.5 * u, w: 2.6 * u, h: 7.5 * u }, i ? '#3e2a22' : '#4e3428', seed + i, { n: 2, sw: 1.2 * u, ow: o.ow }); });
      painted(ctx, function () { rr(ctx, cx - 3.6 * u, fy - 1.8 * u, 3.2 * u, 1.9 * u, 0.7 * u); rr(ctx, cx + 0.5 * u, fy - 1.8 * u, 3.2 * u, 1.9 * u, 0.7 * u); }, { x: cx - 3.6 * u, y: fy - 1.8 * u, w: 7.3 * u, h: 1.9 * u }, '#2e1c16', seed + 3, { n: 1, sw: 0.8 * u, ow: o.ow });
    }
    // body
    var bodyTop = fy - 15 * u, bw = kind === 'knight' ? 9 : 8;
    var body = wraith ? function () { ctx.beginPath(); ctx.moveTo(cx - 3.5 * u, bodyTop + 1 * u); ctx.quadraticCurveTo(cx - 6 * u, fy - 5 * u, cx - 5 * u, fy - 0.5 * u); ctx.lineTo(cx - 2.6 * u, fy - 2.2 * u); ctx.lineTo(cx - 0.6 * u, fy); ctx.lineTo(cx + 1.6 * u, fy - 2 * u); ctx.lineTo(cx + 4.6 * u, fy - 0.4 * u); ctx.quadraticCurveTo(cx + 5.6 * u, fy - 6 * u, cx + 3.5 * u, bodyTop + 1 * u); ctx.closePath(); }
      : kind === 'mage' ? function () { ctx.beginPath(); ctx.moveTo(cx - 3.4 * u, bodyTop); ctx.lineTo(cx + 3.4 * u, bodyTop); ctx.lineTo(cx + 4.6 * u, fy - 3 * u); ctx.lineTo(cx - 4.6 * u, fy - 3 * u); ctx.closePath(); }
      : function () { rr(ctx, cx - bw / 2 * u, bodyTop, bw * u, 9 * u, 2 * u); };
    painted(ctx, body, { x: cx - 5 * u, y: bodyTop, w: 10 * u, h: fy - bodyTop }, wraith ? '#5a1a22' : tc, seed + 4, { n: 4, sw: 2 * u, ow: o.ow, light: wraith ? '#8a3a3a' : tl, shade: wraith ? '#200a10' : td });
    if (kind === 'knight' || kind === 'fighter') {   // pauldrons / belt
      painted(ctx, function () { ell(ctx, cx - 3.8 * u, bodyTop + 1.6 * u, 2.2 * u, 1.7 * u); ell(ctx, cx + 3.8 * u, bodyTop + 1.6 * u, 2.2 * u, 1.7 * u); }, { x: cx - 6 * u, y: bodyTop, w: 12 * u, h: 3.4 * u }, kind === 'knight' ? metal : '#6a4a3a', seed + 5, { n: 2, sw: 1 * u, ow: o.ow });
      ctx.fillStyle = leather; ctx.fillRect(cx - bw / 2 * u + 0.4 * u, bodyTop + 6 * u, (bw - 0.8) * u, 1.2 * u); ctx.fillStyle = GOLD; ctx.fillRect(cx - 0.6 * u, bodyTop + 6 * u, 1.2 * u, 1.2 * u);
    }
    if (kind === 'mage' && !wraith) { ctx.fillStyle = '#d89a3a'; ctx.beginPath(); ctx.moveTo(cx - 3.6 * u, bodyTop + 4.5 * u); ctx.lineTo(cx + 3.8 * u, bodyTop + 6 * u); ctx.lineTo(cx + 3.8 * u, bodyTop + 7.3 * u); ctx.lineTo(cx - 3.8 * u, bodyTop + 5.8 * u); ctx.closePath(); ctx.fill(); }
    // head
    var hy = bodyTop - 3.2 * u;
    if (wraith) {
      painted(ctx, function () { ctx.beginPath(); ctx.moveTo(cx - 4 * u, bodyTop + 2 * u); ctx.quadraticCurveTo(cx - 4.4 * u, hy - 4 * u, cx + 0.5 * u, hy - 4.6 * u); ctx.quadraticCurveTo(cx + 4.6 * u, hy - 2 * u, cx + 4 * u, bodyTop + 2 * u); ctx.closePath(); }, { x: cx - 4.4 * u, y: hy - 4.6 * u, w: 9 * u, h: 8 * u }, '#4a1620', seed + 6, { n: 3, sw: 1.6 * u, ow: o.ow, light: '#8a3a3a' });
      ctx.fillStyle = '#120608'; ell(ctx, cx + 0.8 * u, hy + 0.2 * u, 2.5 * u, 2.2 * u); ctx.fill();
      warmGlow(ctx, cx + 0.8 * u, hy, 2.4 * u, '#c890ff', 0.9); ctx.fillStyle = '#e6c8ff'; circ(ctx, cx + 0.1 * u, hy, 0.45 * u); ctx.fill(); circ(ctx, cx + 1.7 * u, hy, 0.45 * u); ctx.fill();
    } else {
      painted(ctx, function () { circ(ctx, cx + 0.3 * u, hy, 3 * u); }, { x: cx - 2.7 * u, y: hy - 3 * u, w: 6 * u, h: 6 * u }, skinC, seed + 7, { n: 2, sw: 1.4 * u, ow: o.ow });
      ctx.fillStyle = INK; circ(ctx, cx + 1.6 * u, hy + 0.2 * u, 0.42 * u); ctx.fill();
      if (kind === 'knight') painted(ctx, function () { ctx.beginPath(); ctx.arc(cx + 0.3 * u, hy - 0.2 * u, 3.4 * u, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(cx + 3.7 * u, hy + 0.6 * u); ctx.lineTo(cx - 3.1 * u, hy + 0.6 * u); ctx.closePath(); }, { x: cx - 3.1 * u, y: hy - 3.6 * u, w: 6.8 * u, h: 4.2 * u }, metal, seed + 8, { n: 2, sw: 1.2 * u, ow: o.ow });
      if (kind === 'knight') stroke(ctx, cx - 0.5 * u, hy - 3.6 * u, cx - 3.4 * u, hy - 6 * u, 1.6 * u, '#e0a63a', seed + 9, { ridge: 0.6 });
      if (kind === 'mage') painted(ctx, function () { ctx.beginPath(); ctx.arc(cx + 0.3 * u, hy - 0.4 * u, 3.2 * u, Math.PI * 0.95, Math.PI * 2.05); ctx.quadraticCurveTo(cx + 0.3 * u, hy - 1.2 * u, cx - 2.9 * u, hy); ctx.closePath(); }, { x: cx - 3 * u, y: hy - 3.6 * u, w: 6.6 * u, h: 3.6 * u }, '#b0582a', seed + 10, { n: 2, sw: 1 * u, ow: o.ow });
      if (kind === 'fighter' || kind === 'monster') { stroke(ctx, cx - 1.6 * u, hy - 2.4 * u, cx - 3.4 * u, hy - 4.6 * u, 1.1 * u, '#d8cbb0', seed + 11, { ridge: 0.5 }); stroke(ctx, cx + 2.2 * u, hy - 2.4 * u, cx + 3.8 * u, hy - 4.6 * u, 1.1 * u, '#d8cbb0', seed + 12, { ridge: 0.5 }); }
    }
    // weapon
    if (kind === 'knight') {
      painted(ctx, function () { ell(ctx, cx - 4.6 * u, bodyTop + 5 * u, 3 * u, 3.6 * u); }, { x: cx - 7.6 * u, y: bodyTop + 1.4 * u, w: 6 * u, h: 7.2 * u }, '#7a4a28', seed + 13, { n: 3, sw: 1.2 * u, ow: o.ow });
      ctx.fillStyle = '#c8c0b0'; circ(ctx, cx - 4.6 * u, bodyTop + 5 * u, 0.9 * u); ctx.fill();
      stroke(ctx, cx + 4.4 * u, bodyTop + 7 * u, cx + 6.8 * u, bodyTop - 1 * u, 1.3 * u, '#d4d0c8', seed + 14, { ridge: 0.8, taper: 0.2 });
    } else if (kind === 'mage') {
      var sx = cx + 4.6 * u; stroke(ctx, sx, fy - 1 * u, sx + 0.6 * u, bodyTop - 5 * u, 0.9 * u, '#6a4024', seed + 15, { ridge: 0.5, taper: 0.1 });
      var oc = wraith ? '#c890ff' : '#ffb84a', oy = bodyTop - 5.6 * u, pulse = 0.85 + 0.15 * Math.sin((t || 0) * 3);
      warmGlow(ctx, sx + 0.6 * u, oy, 4 * u, oc, pulse); ctx.fillStyle = mix(oc, '#ffffff', 0.45); circ(ctx, sx + 0.6 * u, oy, 1.2 * u); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.5 * u; ctx.stroke();
    } else if (kind === 'archer') {
      ctx.strokeStyle = '#6a4024'; ctx.lineWidth = 0.9 * u; ctx.beginPath(); ctx.arc(cx + 3 * u, bodyTop + 4 * u, 5.4 * u, -1.2, 1.2); ctx.stroke(); ctx.strokeStyle = 'rgba(240,230,210,0.7)'; ctx.lineWidth = 0.3 * u; ctx.beginPath(); ctx.moveTo(cx + 4.9 * u, bodyTop - 1 * u); ctx.lineTo(cx + 4.9 * u, bodyTop + 9 * u); ctx.stroke();
    } else {
      stroke(ctx, cx + 4.2 * u, bodyTop + 8 * u, cx + 6 * u, bodyTop + 1 * u, 0.8 * u, '#5a3a22', seed + 16, { ridge: 0.3 });
      painted(ctx, function () { ctx.beginPath(); ctx.moveTo(cx + 5 * u, bodyTop + 0.5 * u); ctx.lineTo(cx + 8.6 * u, bodyTop + 1.2 * u); ctx.lineTo(cx + 7.8 * u, bodyTop + 5 * u); ctx.lineTo(cx + 5.6 * u, bodyTop + 3.6 * u); ctx.closePath(); }, { x: cx + 5 * u, y: bodyTop, w: 3.6 * u, h: 5 * u }, '#9a948c', seed + 17, { n: 1, sw: 1 * u, ow: o.ow });
    }
  }

  function codeProp(ctx, kind, cx, fy, u, seed, t, L) {
    var T = t || 0, o = { ow: 0.75 * u };
    if (kind === 'tree') {
      painted(ctx, function () { ctx.beginPath(); ctx.moveTo(cx - 2.8 * u, fy); ctx.quadraticCurveTo(cx - 1.4 * u, fy - 6 * u, cx - 1.6 * u, fy - 12 * u); ctx.lineTo(cx + 1.8 * u, fy - 12 * u); ctx.quadraticCurveTo(cx + 1.6 * u, fy - 6 * u, cx + 3.2 * u, fy); ctx.closePath(); }, { x: cx - 2.8 * u, y: fy - 12 * u, w: 6 * u, h: 12 * u }, '#7a4a26', seed, { n: 3, sw: 1.2 * u, ang: -1.5, ow: o.ow, light: '#c08048' });
      [[-5, -14, 5.6, '#6e6a24'], [4.8, -15, 5.4, '#5e5e20'], [0, -20, 6.4, '#8a8230'], [-3, -25, 4.8, '#b09a34'], [3, -24.5, 4.6, '#a08e30']].forEach(function (b, i) {
        var bx = cx + b[0] * u + Math.sin(T * 0.8 + seed + i) * 0.25 * u, by = fy + b[1] * u, br = b[2] * u;
        painted(ctx, function () { ctx.beginPath(); for (var f = 0; f < 7; f++) { var an = f / 7 * 6.283 + vh(seed, i, f) * 0.3, rr2 = br * (0.86 + 0.18 * vh(seed, f, i)); ctx.lineTo(bx + Math.cos(an) * rr2, by + Math.sin(an) * rr2); } ctx.closePath(); }, { x: bx - br, y: by - br, w: 2 * br, h: 2 * br }, b[3], seed * 3 + i, { n: 4, sw: 2.4 * u, ow: o.ow, light: '#ecc860', shade: '#3a3414' });
      });
      return;
    }
    if (kind === 'bush') {
      [[-3.4, -2.8, 3.6, '#3e5a26'], [3.2, -2.8, 3.8, '#3a5424'], [0, -4.8, 4.4, '#4a682a']].forEach(function (b, i) {
        var bx = cx + b[0] * u, by = fy + b[1] * u, br = b[2] * u;
        painted(ctx, function () { circ(ctx, bx, by, br); }, { x: bx - br, y: by - br, w: 2 * br, h: 2 * br }, b[3], seed * 5 + i, { n: 4, sw: 1.5 * u, ow: o.ow, light: '#a8a844', shade: '#18240e' });
      });
      ctx.fillStyle = '#c8302a'; [[-2.4, -4.2], [2.6, -5.4], [0.8, -2]].forEach(function (q) { circ(ctx, cx + q[0] * u, fy + q[1] * u, 0.6 * u); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.3 * u; ctx.stroke(); });
      return;
    }
    if (kind === 'brazier') {
      [[-3.4, 0], [3.4, 0], [0, 0.8]].forEach(function (q) { stroke(ctx, cx + q[0] * 0.5 * u, fy - 6 * u, cx + q[0] * u, fy + q[1] * u, 1.1 * u, '#4a3a36', seed + q[0], { ridge: 0.4, taper: 0.1 }); });
      painted(ctx, function () { ctx.beginPath(); ctx.moveTo(cx - 5 * u, fy - 9.5 * u); ctx.quadraticCurveTo(cx, fy - 2.5 * u, cx + 5 * u, fy - 9.5 * u); ctx.closePath(); }, { x: cx - 5 * u, y: fy - 9.5 * u, w: 10 * u, h: 7 * u }, '#5a4a44', seed, { n: 2, sw: 1.4 * u, ow: o.ow });
      var fl = L ? clamp(L.intensity == null ? 0.8 : L.intensity, 0.3, 1.3) : 0.8, ph = T * 7 + seed;
      [[7, 10 * fl, '#c8401a'], [5, 7.6 * fl, '#f08a2a'], [2.8, 5 * fl, '#ffe6a0']].forEach(function (f, i) { flame(ctx, cx, fy - 9.3 * u, f[0] * u, f[1] * u, ph + i * 0.7); ctx.fillStyle = f[2]; ctx.fill(); if (!i) { ctx.strokeStyle = rgba(INK, 0.6); ctx.lineWidth = 0.5 * u; ctx.stroke(); } });
      return;
    }
    if (kind === 'lamp') {
      ctx.strokeStyle = INK; ctx.lineWidth = 2.6 * u; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, fy); ctx.lineTo(cx, fy - 21 * u); ctx.stroke();
      stroke(ctx, cx, fy, cx, fy - 22 * u, 1.5 * u, '#5a4a40', seed, { ridge: 0.8, light: '#a08a70', taper: 0.05 });
      painted(ctx, function () { rr(ctx, cx - 2.6 * u, fy - 1.6 * u, 5.2 * u, 1.8 * u, 0.6 * u); }, { x: cx - 2.6 * u, y: fy - 1.6 * u, w: 5.2 * u, h: 1.8 * u }, '#7a7068', seed + 1, { n: 1, sw: 0.8 * u, ow: o.ow });
      var ly = fy - 21 * u;
      ctx.fillStyle = lin(ctx, 0, ly, 0, ly + 5 * u, [[0, '#fff2c0'], [1, '#e8902e']]); rr(ctx, cx - 2.2 * u, ly, 4.4 * u, 5 * u, 0.8 * u); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.7 * u; ctx.stroke();
      ctx.fillStyle = '#2e2422'; ctx.beginPath(); ctx.moveTo(cx - 3 * u, ly + 0.2 * u); ctx.lineTo(cx, ly - 2.6 * u); ctx.lineTo(cx + 3 * u, ly + 0.2 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
      return;
    }
    if (kind === 'crystal') {
      painted(ctx, function () { ell(ctx, cx, fy - 1 * u, 5.4 * u, 2 * u); }, { x: cx - 5.4 * u, y: fy - 3 * u, w: 10.8 * u, h: 4 * u }, '#3e3640', seed, { n: 1, sw: 1 * u, ow: o.ow });
      [[-3, 8, 2.2, -0.3], [3.2, 7, 2, 0.34], [0, 13, 2.8, 0.04]].forEach(function (s, i) {
        var bx = cx + s[0] * u, by = fy - 1 * u, hh = s[1] * u, ww = s[2] * u;
        painted(ctx, function () { ctx.save(); ctx.translate(bx, by); ctx.rotate(s[3]); ctx.beginPath(); ctx.moveTo(-ww, 0); ctx.lineTo(-ww * 0.8, -hh * 0.75); ctx.lineTo(0, -hh); ctx.lineTo(ww * 0.8, -hh * 0.75); ctx.lineTo(ww, 0); ctx.closePath(); ctx.restore(); }, { x: bx - ww, y: by - hh, w: 2 * ww, h: hh }, '#6ad0e8', seed + i, { n: 2, sw: 1 * u, ow: o.ow, light: '#e8fbff', shade: '#1e5a78' });
      });
      return;
    }
    // stone / rock / unknown
    painted(ctx, function () { ctx.beginPath(); ctx.moveTo(cx - 6 * u, fy); ctx.quadraticCurveTo(cx - 6.4 * u, fy - 7 * u, cx - 1 * u, fy - 10 * u); ctx.quadraticCurveTo(cx + 5 * u, fy - 9.6 * u, cx + 6.2 * u, fy - 3 * u); ctx.lineTo(cx + 5.6 * u, fy); ctx.closePath(); }, { x: cx - 6.4 * u, y: fy - 10 * u, w: 12.6 * u, h: 10 * u }, '#7a7266', seed, { n: 5, sw: 2 * u, ow: o.ow, light: '#d4c4a0', shade: '#2a2228' });
    stroke(ctx, cx - 4 * u, fy - 8.4 * u, cx + 1 * u, fy - 9.6 * u, 1.6 * u, '#6a7a34', seed + 3, { ridge: 0.6, alpha: 0.9 });
  }

  /* ---------------- fonts ---------------- */
  var fonts = {
    ui: { type: 'canvas', family: SANS, size: 7.6, weight: 700, letterSpacing: 0.1 },
    title: { type: 'canvas', family: SC, size: 8.8, weight: 700, letterSpacing: 0.3 },
    num: { type: 'canvas', family: SANS, size: 12.5, weight: 900, letterSpacing: 0 },
    label: { type: 'canvas', family: SC, size: 6.2, weight: 800, letterSpacing: 0.5 },
    plate: { type: 'canvas', family: SC, size: 7.6, weight: 700, letterSpacing: 0.4 },
    small: { type: 'canvas', family: SANS, size: 6.6, weight: 700, letterSpacing: 0.1 },
    rules: { snap: false, smoothing: true, minSize: 5, lineH: 1.3, uppercase: false,
      note: 'Alegreya SC (small-caps serif) for titles, plates and labels; Alegreya Sans for UI and numerals. Doc pages load them from Google Fonts; games fall back to Palatino / Gill Sans / system-ui' }
  };

  var skin = {
    id: 'painted-impasto', name: 'Painted impasto HD', pixel: false,
    native: { w: 256, h: 224, scale: 'fit', smoothing: true, snap: 0, minScale: 1, note: 'smooth at device resolution; generated pack stored at ~5x' },
    palette: palette,
    fonts: fonts,
    shape: { radius: 2.5, edgeWidth: 0.8, padding: 6, rowRadius: 2, backingRadius: 2, border: 3.4 },
    frameRoles: ['row', 'backing'],
    atmospherePhases: ['world', 'final'],
    layout: { handW: 8, handH: 6, pointerGap: 4, rowFrame: true },
    overlayStyle: { mode: 'paint', pattern: 'strokes', strokes: 2, rimWidth: 1.6, alpha: 0.34 },
    particles: { shape: 'fleck', size: [0.8, 2.4], count: 1, snap: false, blend: 'source-over', glow: 0.3, gravity: 0.05, drag: 0.05, life: [500, 1100],
      colors: ['fx.hot', 'fx.crit', 'fx.white', 'ui.edge'], trail: 0, note: 'paint flecks: short impasto dabs with a lit ridge and an umber edge, not glowing dots' },
    outline: { text: { width: 0 }, number: { width: 2.4, max: 3, drop: 1.2, mode: 'ink', color: 'text.outline' }, sprite: { width: 0.75, color: 'ink', mode: 'ink' } },
    shadow: { text: { dx: 0.4, dy: 0.7, blur: 1.2 }, window: { dx: 1.2, dy: 2.4, blur: 6 }, sprite: { kind: 'contact+cast', alpha: 0.55 } },
    motion: { stepMs: 0, snap: false, ease: { move: 'outCubic', pop: 'outBack', fade: 'outQuad', open: 'outBack' }, fadeSteps: null, shakeInt: false, flashMax: 0.45,
      squash: { x: 1.14, y: 0.88, ms: 90 }, bobHz: 0.8 },

    // text: Alegreya with a soft umber drop shadow; optional vertical gradient (gilded titles)
    text: function (ctx, str, x, y, o) {
      o = o || {}; var f = this.fonts[o.font || 'ui'] || this.fonts.ui, P = this.palette.text, s = String(str);
      if (f.uppercase) s = s.toUpperCase();
      var w = this.measure(s, o), sc = o.scale || 1, size = f.size * sc;
      if (o.align === 'center') x -= w / 2; else if (o.align === 'right') x -= w;
      if (!s.trim()) return w;
      var c1 = API.token(this, o.color) || P.main, c2 = o.color2 ? API.token(this, o.color2) : null, pa = ctx.globalAlpha;
      ctx.save(); if (o.alpha != null) ctx.globalAlpha = pa * o.alpha;
      ctx.font = API.font.css(f, sc); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      if ('letterSpacing' in ctx) ctx.letterSpacing = ((f.letterSpacing || 0) * sc) + 'px';
      var ol = o.outline ? API.token(this, o.outline) : null;
      if (ol) { ctx.lineJoin = 'round'; ctx.lineWidth = (o.outlineWidth || 1) * 1.8; ctx.strokeStyle = ol; ctx.strokeText(s, x, y); }
      var sh = o.shadow === false ? null : API.token(this, o.shadow) || P.shadow, S = this.shadow.text;
      if (sh && S) setSh(ctx, sh, S.blur * sc, S.dx * sc, S.dy * sc);
      ctx.fillStyle = c2 && c2 !== c1 ? lin(ctx, 0, y + size * 0.1, 0, y + size * 0.95, [[0, c1], [1, c2]]) : c1;
      ctx.fillText(s, x, y); noSh(ctx); ctx.restore(); ctx.globalAlpha = pa;
      return w;
    },

    // frame: oxblood / slate lacquer panel painted with broad strokes, a hammered-gold rim with leaf corners (generated
    // nine-slice when the pack is loaded; code-drawn gilt otherwise). row = a gold paint swash; backing = a recessed well.
    frame: function (ctx, r, st) {
      st = st || {}; var P = this.palette, U = P.ui, S = this.shape, role = st.role || 'window', x = r.x, y = r.y, w = r.w, h = r.h, pa = ctx.globalAlpha;
      var team = st.team === 'a' || st.team === 'b' ? st.team : 'n', seed = Math.round(x * 3 + y * 7 + w);
      if (role === 'row' || role === 'backing') {
        ctx.save(); ctx.globalAlpha = pa * (st.alpha == null ? 1 : st.alpha) * (st.disabled ? 0.5 : 1);
        if (role === 'row') {   // a gold-ochre brush swash behind the selected row, ragged ends
          ctx.save(); rr(ctx, x - 1, y - 1, w + 2, h + 2, 1); ctx.clip();
          stroke(ctx, x + 1, y + h * 0.55, x + w - 1, y + h * 0.48, h * 1.05, '#9a5a1e', seed, { alpha: 0.75, ridge: 0.5, lip: 0.5, bend: 0.05, taper: 0.45, light: '#f0c060', streaks: 3 });
          stroke(ctx, x + 2, y + h * 0.42, x + w * 0.7, y + h * 0.45, h * 0.5, '#d89a3a', seed + 1, { alpha: 0.55, ridge: 0.6, lip: 0, bend: 0.1, taper: 0.7, streaks: 1 });
          ctx.restore();
        } else {
          ctx.fillStyle = U.well; rr(ctx, x, y, w, h, S.backingRadius); ctx.fill();
          ctx.save(); rr(ctx, x, y, w, h, S.backingRadius); ctx.clip();
          ctx.fillStyle = lin(ctx, x, y, x, y + Math.min(5, h), [[0, 'rgba(8,2,2,0.75)'], [1, 'rgba(8,2,2,0)']]); ctx.fillRect(x, y, w, Math.min(5, h));
          ctx.restore();
          ctx.save(); rr(ctx, x, y, w, h, S.backingRadius); ctx.clip(); stroke(ctx, x + 2, y + h * 0.62, x + w - 2, y + h * 0.55, Math.min(6, h * 0.45), '#3a2218', seed, { alpha: 0.5, ridge: 0.35, lip: 0.3, streaks: 2 }); ctx.restore();
          ctx.lineWidth = Math.max(hair(ctx), 0.5); ctx.strokeStyle = rgba(GOLD, 0.85); rr(ctx, x + 0.25, y + 0.25, w - 0.5, h - 0.5, S.backingRadius); ctx.stroke();
        }
        ctx.restore(); ctx.globalAlpha = pa; return { x: x, y: y, w: w, h: h };
      }
      var small = role === 'plate' || role === 'banner' || role === 'tooltip' || h < 20, key = small ? 'frame-plate' : 'frame-window', B = small ? 2.6 : S.border;
      var inner = small ? { x: x + Math.max(4, B + 2), y: y + 2.5, w: w - 2 * Math.max(4, B + 2), h: h - 5 } : { x: x + S.padding, y: y + S.padding - 0.5, w: w - 2 * S.padding, h: h - 2 * S.padding + 1 };
      if (w < 3 || h < 3) return inner;
      var lac = role === 'banner' ? ['#5a1c1a', '#2a0c0c'] : U.lacquer[team];
      ctx.save(); ctx.globalAlpha = pa * (st.alpha == null ? 1 : st.alpha) * (st.disabled ? 0.6 : 1);
      // 1. drop shadow + lacquer body
      var W = this.shadow.window; setSh(ctx, U.shadow, small ? 3 : W.blur, W.dx * (small ? 0.5 : 1), W.dy * (small ? 0.5 : 1));
      ctx.fillStyle = lac[1]; rr(ctx, x, y, w, h, S.radius); ctx.fill(); noSh(ctx);
      ctx.save(); rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, S.radius); ctx.clip();
      ctx.fillStyle = lin(ctx, x, y, x + w * 0.3, y + h, [[0, lac[0]], [1, lac[1]]]); ctx.fillRect(x, y, w, h);
      // broad horizontal impasto strokes across the panel, lit from the upper left
      var rows = Math.max(1, Math.round(h / 7)), cols = Math.max(1, Math.round(w / 34));
      for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
        var sx = x + (i + vh(seed, i * 7 + j, 1) * 0.4 - 0.15) * w / cols, sy = y + (j + 0.5 + (vh(seed, i + j * 5, 2) - 0.5) * 0.5) * h / rows;
        var lt = 1 - (j / rows) * 0.8 - (i / cols) * 0.3, col = mix(lac[1], mix(lac[0], '#e0a060', 0.12), clamp(lt, 0, 1));
        stroke(ctx, sx, sy, sx + w / cols * 1.25, sy + (vh(seed, i, j + 3) - 0.5) * 2, Math.min(7, h / rows * 1.15), col, seed + i * 13 + j, { alpha: 0.55, ridge: 0.28, lip: 0.3, streaks: 2, bend: 0.1 });
      }
      // warm key light pooled at the upper left of the panel
      ctx.fillStyle = rad(ctx, x + w * 0.15, y, 0, Math.max(w, h) * 0.9, [[0, 'rgba(255,200,120,0.16)'], [1, 'rgba(255,200,120,0)']]); ctx.fillRect(x, y, w, h);
      ctx.restore();
      // 2. rim: generated hammered-gold nine-slice, or code-drawn gilt
      if (artOk(key)) {
        drawFrame9(ctx, key, x, y, w, h, small ? Math.min(1.9, h * 0.15) : 3.1);
      } else {
        var gw = small ? 1.5 : 2.2;
        ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = gw + 1.2; rr(ctx, x, y, w, h, S.radius); ctx.stroke();
        if (!small) { ctx.strokeStyle = lin(ctx, x, y, x + w * 0.4, y + h, [[0, '#7a2a24'], [1, '#3a0e0c']]); ctx.lineWidth = gw + 0.4; rr(ctx, x, y, w, h, S.radius); ctx.stroke(); gw *= 0.55; }
        ctx.strokeStyle = lin(ctx, x, y, x + w * 0.4, y + h, [[0, GOLD_L], [0.35, GOLD], [1, GOLD_D]]); ctx.lineWidth = gw; rr(ctx, x - (small ? 0 : 0.9), y - (small ? 0 : 0.9), w + (small ? 0 : 1.8), h + (small ? 0 : 1.8), S.radius + (small ? 0 : 0.9)); ctx.stroke();
        // hammered dents: short lit dabs along the rim
        var per = 2 * (w + h), nD = Math.min(80, Math.floor(per / 5));
        for (var d = 0; d < nD; d++) {
          var p = (d + vh(seed, d, 31) * 0.5) / nD * per, px, py;
          if (p < w) { px = x + p; py = y; } else if (p < w + h) { px = x + w; py = y + p - w; } else if (p < 2 * w + h) { px = x + w - (p - w - h); py = y + h; } else { px = x; py = y + h - (p - 2 * w - h); }
          var lit = (px - x) / w + (py - y) / h < 1; ctx.fillStyle = lit ? rgba('#fff4cc', 0.55) : rgba('#5a3410', 0.5); ell(ctx, px, py, gw * 0.45, gw * 0.22, (d % 3) * 0.6); ctx.fill();
        }
        ctx.strokeStyle = rgba(GOLD_L, 0.45); ctx.lineWidth = Math.max(hair(ctx), 0.35); rr(ctx, x + gw * 0.9, y + gw * 0.9, w - gw * 1.8, h - gw * 1.8, Math.max(0, S.radius - 1)); ctx.stroke();
        if (!small) {   // gold leaf corners with a gem
          var gem = '#b8202a';
          [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(function (q, k) {
            ctx.save(); ctx.translate(q[0], q[1]); ctx.scale(q[2], q[3]);
            ctx.beginPath(); ctx.moveTo(-1.2, -1.2); ctx.quadraticCurveTo(7, -1.6, 8.2, 1.2); ctx.quadraticCurveTo(4.6, 1.2, 3.2, 3.2); ctx.quadraticCurveTo(1.2, 4.6, 1.2, 8.2); ctx.quadraticCurveTo(-1.6, 7, -1.2, -1.2); ctx.closePath();
            ctx.fillStyle = lin(ctx, -1, -1, 6, 6, [[0, GOLD_L], [0.5, GOLD], [1, GOLD_D]]); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.stroke();
            ctx.fillStyle = gem; circ(ctx, 1.6, 1.6, 1.25); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.7)'; circ(ctx, 1.2, 1.2, 0.4); ctx.fill();
            ctx.restore();
          });
        }
      }
      if (role === 'banner') {   // folded ribbon tails at both ends
        [[x, -1], [x + w, 1]].forEach(function (q) { ctx.fillStyle = '#6a1e1a'; ctx.beginPath(); ctx.moveTo(q[0], y + 2); ctx.lineTo(q[0] + q[1] * 6, y + 3); ctx.lineTo(q[0] + q[1] * 3.6, y + h / 2 + 1); ctx.lineTo(q[0] + q[1] * 6, y + h + 1); ctx.lineTo(q[0], y + h - 1); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.stroke(); });
      }
      if (st.focus || st.alert) {
        var fc = st.alert ? '#e8503a' : GOLD_L; ctx.save(); setSh(ctx, rgba(fc, 0.9), 4, 0, 0); ctx.strokeStyle = rgba(fc, 0.8); ctx.lineWidth = 0.7; rr(ctx, x - 1.2, y - 1.2, w + 2.4, h + 2.4, S.radius + 1); ctx.stroke(); ctx.restore();
      }
      ctx.restore(); ctx.globalAlpha = pa;
      return inner;
    },

    // number: heavy Alegreya Sans numerals: a painted swash behind crit / heal / mp / status, a thick umber ink outline with
    // a soft drop, a cream-to-colour fill with two lit brush streaks across each glyph; per-glyph glyphOffset motion
    number: function (ctx, str, x, y, o) {
      o = o || {}; var P = this.palette, s = String(str), kind = o.kind === 'critical' ? 'crit' : (o.kind || 'damage'), K = P.numbers[kind] || P.numbers.damage;
      if (o.scheme === 'contrast') K = [K[0], mix(K[1], '#ffffff', 0.2), K[2]];
      var sc = o.scale || 1, big = kind === 'crit' && o.big !== false ? 1.4 : 1, small = kind === 'miss' || kind === 'status' ? 0.72 : 1, NF = this.fonts.num, LF = this.fonts.label;
      var size = NF.size * sc * big * small, cap = size * 0.72, sz = size * 0.55, lsz = LF.size * sc * (kind === 'crit' ? 1.05 : 1), self = this;
      function fnt(px, f) { return (f.weight || 400) + ' ' + px + 'px ' + f.family; }
      function mw(ch, px, f, ls) { ctx.font = fnt(px, f); return ctx.measureText(ch).width + (ls || 0); }
      ctx.save();
      var items = [], cx = 0, i, track = kind === 'miss' || kind === 'status' ? 0.5 * sc : -0.1 * size / 12;
      for (i = 0; i < s.length; i++) { var aw = mw(s[i], size, NF, track); items.push({ ch: s[i], role: 'main', x: cx, w: aw, px: size, f: NF, yb: cap }); cx += aw; }
      if (o.suffix) { cx += 1 * sc; for (i = 0; i < o.suffix.length; i++) { var sw = mw(o.suffix[i], sz, LF, 0.3 * sc); items.push({ ch: o.suffix[i], role: 'suffix', x: cx, w: sw, px: sz, f: LF, yb: cap }); cx += sw; } }
      var mainW = cx, lab = o.label ? String(o.label) : '', labW = 0, lAdv = [];
      for (i = 0; i < lab.length; i++) { var lw = mw(lab[i], lsz, LF, LF.letterSpacing * sc); lAdv.push(lw); labW += lw; }
      var x0 = o.align === 'center' ? x - mainW / 2 : x, y0 = o.baseline === 'bottom' ? y - cap : y;
      var lh = lsz * 0.72, gap = o.labelGap == null ? 3 : o.labelGap, lx = x0 + mainW / 2 - labW / 2, ly = y0 - gap - lh;
      for (i = 0; i < lab.length; i++) { items.push({ ch: lab[i], role: 'label', x: lx - x0, w: lAdv[i], px: lsz, f: LF, yb: lh, dy0: ly - y0 }); lx += lAdv[i]; }
      var GI = API.glyphItems(s, o), out = [], plans = [];
      items.forEach(function (it, j) {
        var d = (o.glyphOffset && o.glyphOffset(j, GI[j] || it)) || {}; if (d.skip) return;
        var gx = x0 + it.x + (d.dx || 0), gy = y0 + (it.dy0 || 0) + (d.dy || 0), a = d.alpha != null ? d.alpha : o.alpha != null ? o.alpha : 1;
        plans.push({ j: j, it: it, gx: gx, gy: gy, a: clamp(a, 0, 1), flash: !!d.flash, sx: d.sx || 1, sy: d.sy || 1, cols: it.role === 'label' ? P.numbers.label : K });
        out.push({ i: j, x: gx, y: gy, w: it.w, h: it.yb, ch: it.ch });
      });
      var groups = {}, keys = [];
      plans.forEach(function (p) { var kk = String(Math.round(p.a * 100) / 100); if (!groups[kk]) { groups[kk] = []; keys.push(kk); } groups[kk].push(p); });
      keys.forEach(function (kk) {
        var G = groups[kk], bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
        G.forEach(function (p) { bx0 = Math.min(bx0, p.gx); by0 = Math.min(by0, p.gy); bx1 = Math.max(bx1, p.gx + p.it.w); by1 = Math.max(by1, p.gy + p.it.yb); });
        API.fadeLayer(ctx, +kk, { x: bx0 - 12, y: by0 - 12, w: bx1 - bx0 + 24, h: by1 - by0 + 24 }, function (g) {
          g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.lineJoin = 'round'; g.miterLimit = 2;
          var each = function (fn, filter) { G.forEach(function (p) { if (filter && !filter(p)) return; g.save(); var bx = p.gx + p.it.w / 2, by = p.gy + p.it.yb; if (p.sx !== 1 || p.sy !== 1) { g.translate(bx, by); g.scale(p.sx, p.sy); g.translate(-bx, -by); } g.font = fnt(p.it.px, p.it.f); fn(p, by); g.restore(); }); };
          // 1. swash: one broad paint stroke behind the main digits of crit / heal / mp / status
          var mains = G.filter(function (p) { return p.it.role !== 'label'; });
          if (mains.length && K[2]) {
            var m0 = mains[0], m1 = mains[mains.length - 1], wy = (m0.gy + m0.it.yb * 0.55 + m1.gy + m1.it.yb * 0.55) / 2;
            stroke(g, m0.gx - size * 0.35, wy + size * 0.08, m1.gx + m1.it.w + size * 0.35, wy - size * 0.1, size * 0.78, K[2], Math.round(m0.it.px * 10) + mains.length, { alpha: 0.92, ridge: 0.45, lip: 0.5, bend: -0.12, taper: 0.5, streaks: 3 });
          }
          // 2. ink outline with a soft drop
          each(function (p, by) { var olw = (p.it.role === 'label' ? 1.6 : 2.6) * sc * (p.it.role === 'main' ? Math.sqrt(big) : 1); setSh(g, 'rgba(16,6,4,0.7)', 1.6 * sc, 0.5 * sc, 1.1 * sc); g.strokeStyle = INK; g.lineWidth = olw; g.strokeText(p.it.ch, p.gx, by); noSh(g); });
          // 3. fill: cream top -> kind colour bottom (white flash ramp on crits)
          each(function (p, by) {
            var top = p.flash ? '#ffffff' : p.cols[0], bot = p.flash ? mix(p.cols[1], '#ffffff', self.motion.flashMax) : p.cols[1];
            g.fillStyle = lin(g, 0, p.gy, 0, by, [[0, top], [0.4, mix(top, bot, 0.3)], [1, bot]]); g.fillText(p.it.ch, p.gx, by);
            // 4. two lit brush streaks across the glyph (clipped to the glyph by source-atop on a scratch layer)
            if (p.it.role !== 'label') {
              var L2 = pooled('imp-glyph', 1, 1); if (!L2) return;
              var dk = scaleOf(g), pw = Math.ceil((p.it.w + 4) * dk), ph2 = Math.ceil((p.it.yb + 4) * dk); L2.width = pw; L2.height = ph2;
              var q = L2.getContext('2d'); q.setTransform(dk, 0, 0, dk, 0, 0);
              stroke(q, 0, p.it.yb * 0.45, p.it.w + 4, p.it.yb * 0.25, p.it.yb * 0.24, mix(top, '#ffffff', 0.55), p.j + 3, { alpha: 0.8, ridge: 0, lip: 0, streaks: 0, taper: 0.5 });
              stroke(q, 0, p.it.yb * 1.05, p.it.w + 4, p.it.yb * 0.88, p.it.yb * 0.26, mix(bot, '#2a1008', 0.4), p.j + 5, { alpha: 0.7, ridge: 0, lip: 0, streaks: 0, taper: 0.5 });
              q.globalCompositeOperation = 'destination-in'; q.font = fnt(p.it.px, p.it.f); q.textBaseline = 'alphabetic'; q.fillStyle = '#000'; q.fillText(p.it.ch, 2, p.it.yb + 2);
              g.drawImage(L2, p.gx - 2, by - p.it.yb - 2, pw / dk, ph2 / dk);
            }
          });
        });
      });
      ctx.restore();
      return out;
    },

    // overlay: a painted wash per cell (two broad translucent strokes over a flat wash), the set's boundary painted as a thick
    // light rim with an umber edge outside; grow = eased scale-in from the cell centre
    overlay: function (ctx, r, kind, t, o) {
      o = o || {}; var Cc = this.palette.overlay[kind] || this.palette.overlay.move, S = this.overlayStyle, g = o.grow == null ? 1 : o.grow;
      if (!(g > 0)) return;
      var E = o.edges || {}, tx = o.tile ? o.tile.x : Math.round(r.x / r.w), ty = o.tile ? o.tile.y : Math.round(r.y / r.h), a = Cc.alpha * Math.min(1, g * 1.3);
      var k = g < 1 ? 0.55 + 0.45 * API.ease.outBack(clamp(g, 0, 1)) : 1, cxm = r.x + r.w / 2, cym = r.y + r.h / 2, x = cxm - r.w * k / 2, y = cym - r.h * k / 2, w = r.w * k, h = r.h * k, u = r.w / 16;
      if (g >= 1) { var dk = scaleOf(ctx), X0 = Math.round(x * dk) / dk, Y0 = Math.round(y * dk) / dk; w = Math.round((x + w) * dk) / dk - X0; h = Math.round((y + h) * dk) / dk - Y0; x = X0; y = Y0; }
      var seed = tx * 37 + ty * 101, breathe = o.pattern === 'flat' ? 1 : 0.9 + 0.1 * Math.sin((t || 0) * 2.2 - (tx + ty) * 0.5);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.fillStyle = rgba(Cc.fill, a * breathe); ctx.fillRect(x, y, w, h);
      // two long strokes per map row, laid in world space (same for every cell in the row), so the wash reads as one painted band
      var row = ty, ry = row * r.h, span = 512 * u, sx0 = Math.floor(r.x / span) * span;   // one stroke spans 32 cells: no joins on a normal map
      for (var i = 0; i < S.strokes; i++) for (var sx = sx0 - span; sx <= r.x + r.w; sx += span) {
        var sd = row * 53 + i * 7 + Math.round(sx / span) * 131, yy = ry + r.h * (0.3 + 0.42 * i) + (vh(sd, i, 1) - 0.5) * 2 * u;
        stroke(ctx, sx - 4 * u, yy + 1.2 * u, sx + span + 4 * u, yy - 1.2 * u, 6.5 * u, i ? mix(Cc.fill, '#ffffff', 0.22) : Cc.fill, sd, { alpha: a * 0.8 * breathe, ridge: 0.7, lip: 0.45, light: mix(Cc.edge, '#fff4d6', 0.5), streaks: 1, bend: 0.06, taper: 0.1 });
      }
      if (g >= 1) {   // rim: thick light inner stroke + umber line at the very edge
        var rw = S.rimWidth * u;
        ctx.strokeStyle = rgba(Cc.edge, 0.85 * Math.min(1, g)); ctx.lineWidth = rw; ctx.lineCap = 'butt'; ctx.beginPath();
        if (E.top) { ctx.moveTo(x, y + rw / 2); ctx.lineTo(x + w, y + rw / 2); } if (E.bottom) { ctx.moveTo(x, y + h - rw / 2); ctx.lineTo(x + w, y + h - rw / 2); }
        if (E.left) { ctx.moveTo(x + rw / 2, y); ctx.lineTo(x + rw / 2, y + h); } if (E.right) { ctx.moveTo(x + w - rw / 2, y); ctx.lineTo(x + w - rw / 2, y + h); }
        ctx.stroke();
        ctx.strokeStyle = rgba(Cc.deep, 0.9); ctx.lineWidth = 0.6 * u; ctx.beginPath();
        if (E.top) { ctx.moveTo(x, y + 0.3 * u); ctx.lineTo(x + w, y + 0.3 * u); } if (E.bottom) { ctx.moveTo(x, y + h - 0.3 * u); ctx.lineTo(x + w, y + h - 0.3 * u); }
        if (E.left) { ctx.moveTo(x + 0.3 * u, y); ctx.lineTo(x + 0.3 * u, y + h); } if (E.right) { ctx.moveTo(x + w - 0.3 * u, y); ctx.lineTo(x + w - 0.3 * u, y + h); }
        ctx.stroke();
      } else { ctx.strokeStyle = rgba(Cc.edge, 0.8 * g); ctx.lineWidth = 1.2 * u; ctx.strokeRect(x + 0.6 * u, y + 0.6 * u, w - 1.2 * u, h - 1.2 * u); }
      ctx.restore();
    },

    // bar: a dark wooden groove with a gold rim; the fill is laid as one thick paint stroke with a ragged leading end
    bar: function (ctx, r, frac, kind, o) {
      o = o || {}; var P = this.palette, B = P.bars, x = r.x, y = r.y, w = r.w, h = r.h, f = clamp(frac || 0, 0, 1);
      if (o.px != null && w) f = clamp(o.px / w, 0, 1);
      ctx.save();
      ctx.fillStyle = INK; rr(ctx, x - 0.8, y - 0.8, w + 1.6, h + 1.6, 1.2); ctx.fill();
      ctx.fillStyle = B.track; rr(ctx, x, y, w, h, 0.8); ctx.fill();
      ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [[0, 'rgba(0,0,0,0.5)'], [0.6, 'rgba(0,0,0,0)']]); ctx.fillRect(x, y, w, h);
      if (kind) {
        var Cb = B[kind] || B.charge, fw = w * f;
        if (fw > 0.3) {
          ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
          ctx.fillStyle = Cb[1]; ctx.fillRect(x, y, Math.max(0, fw - h * 0.6), h);
          stroke(ctx, x - h * 0.2, y + h * 0.5, x + fw, y + h * 0.46, h * 1.25, Cb[1], Math.round(w * 3 + y), { ridge: 0.7, lip: 0.6, light: Cb[0], bend: 0, taper: 0.25, streaks: 2 });
          ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [[0, rgba('#fff8e0', 0.35)], [0.45, 'rgba(255,248,224,0)']]); ctx.fillRect(x, y, fw, h);
          if (kind === 'ready' || kind === 'enemyFull') { var pu = 0.5 + 0.5 * Math.sin((o.t || 0) * 6); ctx.fillStyle = rgba('#fff6d8', 0.22 * pu); ctx.fillRect(x, y, fw, h); }
          ctx.restore();
        }
      } else { ctx.fillStyle = 'rgba(224,176,82,0.18)'; for (var q = x + 2; q < x + w - 1; q += 3) { circ(ctx, q, y + h / 2, 0.35); ctx.fill(); } }
      ctx.strokeStyle = lin(ctx, x, y, x, y + h, [[0, GOLD_L], [1, GOLD_D]]); ctx.lineWidth = 0.5; rr(ctx, x - 0.4, y - 0.4, w + 0.8, h + 0.8, 1); ctx.stroke();
      if (o.tag === 'haste' || o.tag === 'slow') {
        var tc = (o.tag === 'haste' ? B.haste : B.slow)[1], d = Math.max(h + 1.6, 4.5), cx = x + w + d * 0.6 + 1.4, cy = y + h / 2, dir = o.tag === 'haste' ? 1 : -1;
        for (var c = 0; c < 2; c++) {
          var ox = cx + dir * (c * 2 - 1); ctx.beginPath(); ctx.moveTo(ox - dir * d * 0.24, cy - d * 0.34); ctx.lineTo(ox + dir * d * 0.2, cy); ctx.lineTo(ox - dir * d * 0.24, cy + d * 0.34);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); ctx.strokeStyle = tc; ctx.lineWidth = 0.8; ctx.stroke();
        }
      }
      ctx.restore();
    },

    // cursor: 'bracket' = four hammered-gold leaf corners that breathe outward with an umber outline and a warm glint;
    //         'hand' = a gilded spearhead pointer with an umber outline and a lit ridge
    cursor: function (ctx, r, kind, t, o) {
      o = o || {}; var pa = ctx.globalAlpha, A = o.alpha == null ? 1 : o.alpha, bad = !!o.invalid;
      var c0 = bad ? '#f4a890' : GOLD_L, c1 = bad ? '#c8463a' : GOLD, c2 = bad ? '#5e1814' : GOLD_D;
      ctx.save(); ctx.globalAlpha = pa * A; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (kind === 'hand') {
        var hx = r.x + Math.sin((t || 0) * Math.PI * 2 * 1.1) * 0.7, hy = r.y, hw = r.w, hh = r.h, cy = hy + hh / 2;
        var shape = function () { ctx.beginPath(); ctx.moveTo(hx + hw + 0.6, cy); ctx.lineTo(hx + hw * 0.32, hy - 0.3); ctx.quadraticCurveTo(hx + hw * 0.42, cy - hh * 0.18, hx - 0.4, cy - hh * 0.2); ctx.lineTo(hx - 0.4, cy + hh * 0.2); ctx.quadraticCurveTo(hx + hw * 0.42, cy + hh * 0.18, hx + hw * 0.32, hy + hh + 0.3); ctx.closePath(); };
        setSh(ctx, 'rgba(16,6,4,0.6)', 1.2, 0.5, 0.8); shape(); ctx.fillStyle = lin(ctx, hx, hy, hx + hw * 0.4, hy + hh, [[0, c0], [0.5, c1], [1, c2]]); ctx.fill(); noSh(ctx);
        ctx.strokeStyle = INK; ctx.lineWidth = 0.7; ctx.stroke();
        ctx.strokeStyle = rgba('#fffaf0', 0.8); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(hx + hw * 0.4, cy - hh * 0.06); ctx.lineTo(hx + hw - 0.4, cy - 0.15); ctx.stroke();
      } else {
        var X = r.x, Y = r.y, W = r.w, H = r.h, b = 0.4 + 0.8 * (0.5 + 0.5 * Math.sin((t || 0) * Math.PI * 2 * 0.9)), L = Math.max(4, W * 0.34);
        ctx.fillStyle = rgba('#ffd890', 0.14); ctx.fillRect(X + 0.5, Y + 0.5, W - 1, H - 1);
        [[X - b, Y - b, 1, 1], [X + W + b, Y - b, -1, 1], [X - b, Y + H + b, 1, -1], [X + W + b, Y + H + b, -1, -1]].forEach(function (q) {
          ctx.save(); ctx.translate(q[0], q[1]); ctx.scale(q[2], q[3]);
          ctx.beginPath(); ctx.moveTo(-0.6, -0.6); ctx.lineTo(L, -0.6); ctx.quadraticCurveTo(L * 0.7, 1.3, 1.6, 1.6); ctx.quadraticCurveTo(1.3, L * 0.7, -0.6, L); ctx.closePath();
          setSh(ctx, 'rgba(16,6,4,0.55)', 1, 0.4, 0.6); ctx.fillStyle = lin(ctx, 0, 0, L, L, [[0, c0], [0.45, c1], [1, c2]]); ctx.fill(); noSh(ctx);
          ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.stroke();
          ctx.fillStyle = rgba('#fffaf0', 0.85); ell(ctx, L * 0.3, -0.05, L * 0.2, 0.3); ctx.fill();
          ctx.restore();
        });
      }
      ctx.restore(); ctx.globalAlpha = pa;
    },

    // path: one long loaded brush stroke in gilt cream: umber outline, ochre body, lit ridge, bristle streaks, a painted arrowhead
    path: function (ctx, pts, t, o) {
      o = o || {}; if (!pts || pts.length < 2) return;
      var PP = o.invalid ? this.palette.overlay.pathBad : this.palette.overlay.path, T = o.tile || 16, n = pts.length, last = pts[n - 1], prev = pts[n - 2], self = this, A0 = o.alpha == null ? 1 : o.alpha;
      if (A0 < 1 && !o._inLayer) {
        var bb = pts.reduce(function (b, p) { return { x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y) }; }, { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
        API.fadeLayer(ctx, A0, { x: bb.x0 - T, y: bb.y0 - T, w: bb.x1 - bb.x0 + 2 * T, h: bb.y1 - bb.y0 + 2 * T }, function (g) { self.path(g, pts, t, { tile: T, invalid: o.invalid, _inLayer: true }); });
        return;
      }
      var L0 = Math.hypot(last.x - prev.x, last.y - prev.y) || 1, dx = (last.x - prev.x) / L0, dy = (last.y - prev.y) / L0, headLen = T * 0.5;
      var end = { x: last.x - dx * headLen * 0.55, y: last.y - dy * headLen * 0.55 }, P2 = pts.slice(0, -1).concat([end]), rC = T * 0.45;
      function trace(ox, oy) {
        ox = ox || 0; oy = oy || 0; ctx.beginPath(); ctx.moveTo(P2[0].x + ox, P2[0].y + oy);
        for (var i = 1; i < P2.length - 1; i++) {
          var a = P2[i - 1], b = P2[i], c = P2[i + 1], l1 = Math.hypot(b.x - a.x, b.y - a.y) || 1, l2 = Math.hypot(c.x - b.x, c.y - b.y) || 1, v1 = [(b.x - a.x) / l1, (b.y - a.y) / l1], v2 = [(c.x - b.x) / l2, (c.y - b.y) / l2];
          if (Math.abs(v1[0] - v2[0]) < 1e-6 && Math.abs(v1[1] - v2[1]) < 1e-6) { ctx.lineTo(b.x + ox, b.y + oy); continue; }
          var q = Math.min(rC, l1 / 2, l2 / 2); ctx.lineTo(b.x - v1[0] * q + ox, b.y - v1[1] * q + oy); ctx.quadraticCurveTo(b.x + ox, b.y + oy, b.x + v2[0] * q + ox, b.y + v2[1] * q + oy);
        }
        ctx.lineTo(P2[P2.length - 1].x + ox, P2[P2.length - 1].y + oy);
      }
      var nx = -dy, ny = dx, hw = T * 0.34, tip = { x: last.x + dx * T * 0.16, y: last.y + dy * T * 0.16 }, hb = { x: tip.x - dx * headLen, y: tip.y - dy * headLen };
      function head(gr) { gr = gr || 0; ctx.beginPath(); ctx.moveTo(tip.x + dx * gr, tip.y + dy * gr); ctx.lineTo(hb.x + nx * (hw + gr) - dx * gr * 0.5, hb.y + ny * (hw + gr) - dy * gr * 0.5); ctx.quadraticCurveTo(hb.x + dx * headLen * 0.28, hb.y + dy * headLen * 0.28, hb.x - nx * (hw + gr) - dx * gr * 0.5, hb.y - ny * (hw + gr) - dy * gr * 0.5); ctx.closePath(); }
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // 1. soft shadow down-right
      ctx.strokeStyle = 'rgba(26,10,20,0.35)'; ctx.lineWidth = T * 0.3; trace(0.9, 1.5); ctx.stroke();
      // 2. ink casing, ochre body, lit ridge, core
      ctx.strokeStyle = PP.outline; ctx.lineWidth = T * 0.3; trace(); ctx.stroke(); head(0.9); ctx.fillStyle = PP.outline; ctx.fill();
      ctx.strokeStyle = PP.dark; ctx.lineWidth = T * 0.22; trace(); ctx.stroke();
      ctx.strokeStyle = PP.mid; ctx.lineWidth = T * 0.17; trace(-0.25, -0.25); ctx.stroke();
      ctx.strokeStyle = PP.light; ctx.lineWidth = T * 0.07; trace(-0.7, -0.7); ctx.stroke();
      ctx.strokeStyle = rgba(PP.core, 0.8); ctx.lineWidth = T * 0.03; trace(-0.9, -0.9); ctx.stroke();
      // bristle streaks along the stroke
      ctx.strokeStyle = rgba(PP.dark, 0.5); ctx.lineWidth = T * 0.02; trace(0.6, 0.4); ctx.stroke();
      ctx.fillStyle = lin(ctx, hb.x, hb.y, tip.x, tip.y, [[0, PP.dark], [0.5, PP.mid], [1, PP.light]]); head(); ctx.fill();
      ctx.strokeStyle = rgba(PP.core, 0.75); ctx.lineWidth = T * 0.04; ctx.beginPath(); ctx.moveTo(hb.x + nx * hw * 0.6 + dx * 1, hb.y + ny * hw * 0.6 + dy * 1); ctx.lineTo(tip.x - dx * 1.4, tip.y - dy * 1.4); ctx.stroke();
      // origin: a gilt boss
      ctx.fillStyle = PP.outline; circ(ctx, pts[0].x, pts[0].y, T * 0.24); ctx.fill(); ctx.fillStyle = lin(ctx, pts[0].x - 3, pts[0].y - 3, pts[0].x + 3, pts[0].y + 3, [[0, PP.light], [1, PP.dark]]); circ(ctx, pts[0].x, pts[0].y, T * 0.17); ctx.fill();
      // a travelling glint (1.6 s loop)
      var segs = [], tot = 0, i; for (i = 1; i < P2.length; i++) { var sl = Math.hypot(P2[i].x - P2[i - 1].x, P2[i].y - P2[i - 1].y); segs.push(sl); tot += sl; }
      var ph = ((t || 0) / 1.6) % 1, d = API.ease.inOutQuad(ph) * tot, gi = 0; while (gi < segs.length - 1 && d > segs[gi]) { d -= segs[gi]; gi++; }
      var Aa = P2[gi], Bb = P2[gi + 1], uu = segs[gi] ? clamp(d / segs[gi], 0, 1) : 0, gx = Aa.x + (Bb.x - Aa.x) * uu - 0.7, gy = Aa.y + (Bb.y - Aa.y) * uu - 0.7, ga = Math.sin(Math.PI * ph);
      ctx.fillStyle = rad(ctx, gx, gy, 0, T * 0.22, [[0, rgba('#ffffff', 0.9 * ga)], [1, 'rgba(255,255,255,0)']]); ctx.fillRect(gx - T * 0.3, gy - T * 0.3, T * 0.6, T * 0.6);
      ctx.restore();
    },

    tile: function (ctx, r, kind, t) {
      var k = kind === 'bridge' ? 'water' : (palette.ramps[kind] ? kind : 'grass'), u = r.w / 16, x = r.x, y = r.y, w = r.w, h = r.h, seed = Math.round(x * 3 + y * 11);
      paintGround(ctx, r, k, t);
      ctx.save();
      if (kind === 'bridge') {
        ctx.fillStyle = 'rgba(20,8,10,0.4)'; ctx.fillRect(x - 0.2, y + 3 * u, w + 0.4, h - 4.4 * u);
        for (var pl = 0; pl < 4; pl++) painted(ctx, function () { ctx.beginPath(); ctx.rect(x + pl * w / 4 + 0.2 * u, y + 2.2 * u, w / 4 - 0.4 * u, h - 5 * u); }, { x: x + pl * w / 4, y: y + 2.2 * u, w: w / 4, h: h - 5 * u }, pl % 2 ? '#8a5a34' : '#9a6a3c', seed + pl, { n: 2, sw: 1.4 * u, ang: 1.5, ow: 0.5 * u });
      } else if (kind === 'mountain' || kind === 'wall') {
        codeProp(ctx, 'stone', x + w / 2, y + h * 0.92, u * 0.95, seed, t, null);
      } else if (kind === 'forest' && !artOk('tile-grass')) {
        ctx.fillStyle = 'rgba(20,28,10,0.25)'; ell(ctx, x + w / 2, y + h * 0.6, w * 0.45, h * 0.35); ctx.fill();
      } else if (kind === 'fort' || kind === 'floor') {
        ctx.strokeStyle = 'rgba(30,16,12,0.35)'; ctx.lineWidth = 0.5 * u; ctx.strokeRect(x + 1.2 * u, y + 1.2 * u, w - 2.4 * u, h - 2.4 * u);
      }
      ctx.restore();
    },

    // prop(ctx, cellRect, kind, t, {lights, light, seed}): generated bitmap when the pack is loaded (foot on the cell's
    // bottom centre), else code-drawn; always with a painted contact shadow, a soft cast shadow down-right and, for
    // light carriers, a warm/cool glow and a moving flame / flicker on top
    prop: function (ctx, r, kind, t, o) {
      o = o || {}; var u = r.w / 16, cx = r.x + r.w / 2, fy = r.y + r.h - 1.5 * u, seed = o.seed || 0, T = t || 0, L = o.light ? (API.normLight ? API.normLight(o.light) : o.light) : null;
      var key = 'prop-' + (kind === 'rock' ? 'stone' : kind), A = ART[key], flip = vh(seed, 1, 2) < 0.5 && kind !== 'lamp';
      var inten = L ? clamp(L.intensity == null ? 0.8 : L.intensity, 0, 1.4) : 0.8, sz = { tree: 12, bush: 7, stone: 6.5, rock: 6.5, brazier: 5.5, lamp: 4.2, crystal: 5.5 }[kind] || 6;
      cast(ctx, cx, fy, sz * 1.4 * u, (kind === 'tree' ? 16 : kind === 'lamp' ? 14 : 8) * u, 1);
      contact(ctx, cx, fy, sz * u, 1);
      if (L) warmGlow(ctx, cx, fy - 1 * u, 10 * u, L.col || '#ffb860', 0.5 * inten);
      if (A && artOk(key)) {
        var hh = A.h * u * (kind === 'tree' ? 0.94 + 0.12 * vh(seed, 3, 4) : 1), sway = kind === 'tree' ? Math.sin(T * 0.8 + seed) * 0.004 : 0;
        ctx.save(); if (sway) { ctx.translate(cx, fy); ctx.transform(1, 0, sway, 1, 0, 0); ctx.translate(-cx, -fy); }
        drawArt(ctx, key, cx, fy, hh, flip); ctx.restore();
        if (A.fire) {
          var im = art.imgs[key], ww = hh * im.naturalWidth / im.naturalHeight, fx = cx + (flip ? -1 : 1) * (A.fire[0] - 0.5) * ww, fyy = fy - hh * (1 - A.fire[1]);
          var col = kind === 'crystal' ? '#7ae8ff' : kind === 'lamp' ? '#ffcf7a' : '#ff9a40', fl = 0.85 + 0.15 * Math.sin(T * 9 + seed);
          warmGlow(ctx, fx, fyy, (kind === 'brazier' ? 9 : 7) * u, col, 0.7 * inten * fl);
          if (kind === 'brazier') {   // a painted flame tongue that moves on the game clock, sparks rising
            var ph = T * 7 + seed;
            [[4.6, 6.5 * inten, '#e86a1e', 0.85], [2.8, 4.4 * inten, '#ffd27a', 0.9]].forEach(function (f, i) { flame(ctx, fx, fyy + 1.2 * u, f[0] * u, f[1] * u, ph + i * 0.8); ctx.globalAlpha = f[3]; ctx.fillStyle = f[2]; ctx.fill(); ctx.globalAlpha = 1; });
            for (var s2 = 0; s2 < 4; s2++) { var sp = (T * 0.9 + vh(seed, s2, 3)) % 1, sx2 = fx + (vh(seed, s2, 4) - 0.5) * 5 * u + Math.sin(T * 3 + s2) * u, sy2 = fyy - 3 * u - sp * 12 * u;
              stroke(ctx, sx2, sy2, sx2 + 0.6 * u, sy2 - 1.2 * u, 0.7 * u, '#ffc060', seed + s2, { alpha: Math.sin(Math.PI * sp), ridge: 0, lip: 0, streaks: 0 }); }
          }
        }
        return;
      }
      codeProp(ctx, kind, cx, fy, u, seed, T, L);
      if (kind === 'brazier' || kind === 'lamp' || kind === 'crystal') {
        var gy = kind === 'lamp' ? fy - 18.5 * u : kind === 'crystal' ? fy - 7 * u : fy - 12 * u;
        warmGlow(ctx, cx, gy, 8 * u, kind === 'crystal' ? '#7ae8ff' : kind === 'lamp' ? '#ffcf7a' : '#ff9a40', 0.7 * inten);
      }
    },

    // unitToken: generated sprite for the four scene roles (knight, mage of team a; fighter = ghoul, mage = wraith of team b)
    // or the code-drawn painted figure; contact + cast shadow, bob when selected, desaturated and faded when dead.
    // id 'card' (a HUD portrait slot) draws the bust portrait when the pack has one.
    unitToken: function (ctx, r, un, t) {
      un = un || {}; var u = r.w / 16, cx = r.x + r.w / 2, fy = r.y + r.h - 1 * u, team = un.team === 'b' ? 'b' : un.team === 'n' ? 'n' : 'a', kind = un.kind || 'fighter';
      var key = team === 'a' ? (kind === 'knight' || kind === 'lord' ? 'unit-knight' : kind === 'mage' ? 'unit-mage' : null) : team === 'b' ? (kind === 'mage' ? 'unit-wraith' : kind === 'fighter' || kind === 'monster' ? 'unit-ghoul' : null) : null;
      var flip = un.facing === -1, bob = un.selected ? Math.abs(Math.sin((t || 0) * Math.PI * this.motion.bobHz)) * 1.2 * u : 0, pa = ctx.globalAlpha;
      if (un.id === 'card') {
        var pk = key === 'unit-mage' ? 'portrait-mage' : 'portrait-knight';
        if (artOk(pk)) {
          var im = art.imgs[pk], bx = r.x - 2, by = r.y - 4, bw = r.w + 4, bh = r.h + 6, sc = Math.max(bw / im.naturalWidth, bh / im.naturalHeight), dw = im.naturalWidth * sc, dh = im.naturalHeight * sc;
          ctx.save(); rr(ctx, bx, by, bw, bh, 1.5); ctx.clip(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(im, bx + (bw - dw) / 2, by + bh - dh, dw, dh); ctx.fillStyle = lin(ctx, 0, by + bh * 0.7, 0, by + bh, [[0, 'rgba(20,8,6,0)'], [1, 'rgba(20,8,6,0.45)']]); ctx.fillRect(bx, by, bw, bh); ctx.restore();
          ctx.strokeStyle = INK; ctx.lineWidth = 0.6; rr(ctx, bx, by, bw, bh, 1.5); ctx.stroke();
          return;
        }
      }
      if (!un.noShadow) { cast(ctx, cx, fy, 10 * u, 11 * u, un.dead ? 0.4 : 1); contact(ctx, cx, fy, 6 * u, un.dead ? 0.5 : 1); }
      ctx.save();
      if (un.dead) { ctx.globalAlpha = pa * 0.5; ctx.filter = 'grayscale(0.85) brightness(0.8)'; }
      if (key && artOk(key)) {
        var A = ART[key], hh = A.h * u * (r.h / (24 * u) > 1.15 ? 1 : r.h / (24 * u)), hover = key === 'unit-wraith' ? Math.sin((t || 0) * 2.2) * 0.8 * u - 1.2 * u : 0;
        drawArtOutlined(ctx, key, cx, fy - bob + hover, hh, flip, 0.42 * u);
      } else {
        ctx.translate(cx, fy - bob); if (flip) ctx.scale(-1, 1); ctx.translate(-cx, -fy);
        figure(ctx, cx, fy, u * Math.min(1, r.h / (24 * u)), un, t);
      }
      ctx.restore(); ctx.globalAlpha = pa;
    },

    // atmosphere: world = warm late-afternoon key light from the upper left (screen-gold), cool plum shade toward the lower
    // right (multiply), warm pools under every light; final = a varnish of faint canvas-weave strokes and a plum vignette
    atmosphere: function (ctx, view, t, o) {
      o = o || {}; var ph = o.phase || 'final', M = palette.mood, x = view.x, y = view.y, w = view.w, h = view.h, ls = stdLights(o.lights || []);
      ctx.save();
      if (ph === 'world') {
        banks(ctx, view); WATER = {};
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = lin(ctx, x, y, x + w, y + h, [[0, 'rgba(255,242,220,1)'], [0.45, 'rgba(228,200,196,1)'], [1, 'rgba(118,88,124,1)']]); ctx.fillRect(x, y, w, h);
        ctx.globalCompositeOperation = 'soft-light';
        ctx.fillStyle = rad(ctx, x + w * 0.12, y + h * 0.05, 0, w * 0.9, [[0, rgba(M.warm, 0.6)], [1, rgba(M.warm, 0)]]); ctx.fillRect(x, y, w, h);
        ctx.globalCompositeOperation = 'lighter';
        ls.forEach(function (l) {
          var R = Math.max(24, (l.r || 40) * 1.1), a = (l.intensity == null ? 0.5 : l.intensity) * M.pool;
          ctx.fillStyle = rad(ctx, l.x, l.y, 0, R, [[0, rgba(l.col || '#ffb860', 0.75 * a)], [0.4, rgba(l.col || '#ffb860', 0.32 * a)], [1, rgba(l.col || '#ffb860', 0)]]); ctx.fillRect(l.x - R, l.y - R, 2 * R, 2 * R);
        });
      } else if (ph === 'final') {
        var tex = varnish(ctx, w, h);
        if (tex) { ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.5; ctx.drawImage(tex, x, y, w, h); ctx.globalAlpha = 1; }
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = rad(ctx, x + w * 0.45, y + h * 0.45, Math.min(w, h) * 0.42, Math.max(w, h) * 0.78, [[0, rgba(M.vignette, 0)], [1, rgba(M.vignette, M.vignetteAlpha)]]); ctx.fillRect(x, y, w, h);
      }
      ctx.restore();
    }
  };

  // banks: where a water cell meets a non-water cell, a muddy sienna knife band on the land side, a dark wet line at the
  // waterline and a cream ripple just inside the water. Uses the water cells tile() drew this frame.
  function banks(ctx, view) {
    var keys = Object.keys(WATER); if (!keys.length) return;
    ctx.save(); ctx.lineCap = 'round';
    keys.forEach(function (k) {
      var xy = k.split(','), cx = +xy[0], cy = +xy[1], T = WATER[k], u = T / 16, x = cx * T, y = cy * T, seed = cx * 97 + cy * 389;
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d, i) {
        var nk = (cx + d[0]) + ',' + (cy + d[1]); if (WATER[nk]) return;
        var nx = x + d[0] * T, ny = y + d[1] * T; if (nx < view.x || ny < view.y || nx >= view.x + view.w || ny >= view.y + view.h) return;
        // the edge line, then 3 overlapping short mud strokes along it (jittered across the edge), a wet dark lip and a ripple
        var vert = d[0] !== 0, ex = d[0] > 0 ? x + T : x, ey = d[1] > 0 ? y + T : y, nx2 = d[0], ny2 = d[1];
        for (var j = 0; j < 3; j++) {
          var s0 = (j / 3 - 0.08) * T, s1 = ((j + 1) / 3 + 0.08) * T, off = (0.4 + 1.6 * vh(seed, j + i * 3, 71)) * u, wd = (2.2 + 1.8 * vh(seed, j + i * 3, 72)) * u;
          var A = vert ? [ex + nx2 * off, y + s0] : [x + s0, ey + ny2 * off], B = vert ? [ex + nx2 * (off + (vh(seed, j, 73) - 0.5) * 1.4 * u), y + s1] : [x + s1, ey + ny2 * (off + (vh(seed, j, 73) - 0.5) * 1.4 * u)];
          stroke(ctx, A[0], A[1], B[0], B[1], wd, vh(seed, j, 74) < 0.5 ? '#7a5430' : '#8e6a3a', seed + i * 7 + j, { alpha: 0.92, ridge: 0.7, lip: 0.55, light: '#c8985a', streaks: 1, bend: 0.3, taper: 0.35 });
          var C = vert ? [ex - nx2 * 0.3 * u, y + s0 + 1 * u] : [x + s0 + 1 * u, ey - ny2 * 0.3 * u], D = vert ? [ex - nx2 * 0.3 * u, y + s1 - 1 * u] : [x + s1 - 1 * u, ey - ny2 * 0.3 * u];
          stroke(ctx, C[0], C[1], D[0], D[1], 1.1 * u, '#2a1612', seed + 30 + j, { alpha: 0.6, ridge: 0, lip: 0, streaks: 0, taper: 0.5, bend: 0.2 });
          var E = vert ? [ex - nx2 * 1.8 * u, y + s0 + 2 * u] : [x + s0 + 2 * u, ey - ny2 * 1.8 * u], G = vert ? [ex - nx2 * 1.8 * u, y + s1 - 2 * u] : [x + s1 - 2 * u, ey - ny2 * 1.8 * u];
          stroke(ctx, E[0], E[1], G[0], G[1], 0.8 * u, '#d8e4c8', seed + 40 + j, { alpha: 0.4, ridge: 0, lip: 0, streaks: 0, taper: 0.6 });
        }
      });
    });
    ctx.restore();
  }
  // varnish: a cached canvas of faint crossing strokes (canvas weave + dried paint ridges), overlay-blended
  var VARN = null;
  function varnish(ctx, w, h) {
    var dk = scaleOf(ctx), W = Math.round(w * dk), H = Math.round(h * dk);
    if (VARN && VARN.width === W && VARN.height === H) return VARN;
    if (typeof document === 'undefined') return null;
    VARN = document.createElement('canvas'); VARN.width = W; VARN.height = H; var g = VARN.getContext('2d'); g.setTransform(dk, 0, 0, dk, 0, 0);
    g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, w, h);
    for (var i = 0; i < 520; i++) {
      var px = vh(i, 1, 41) * w, py = vh(i, 2, 41) * h, a = -0.6 + (vh(i, 3, 41) - 0.5) * 0.8, len = 8 + 14 * vh(i, 4, 41), c = vh(i, 5, 41) < 0.5 ? '#9a9a9a' : '#666666';
      stroke(g, px, py, px + Math.cos(a) * len, py + Math.sin(a) * len, 2.4 + 2 * vh(i, 6, 41), c, i, { alpha: 0.35, ridge: 0.6, lip: 0.6, light: '#c8c8c8', dark: '#404040', streaks: 1 });
    }
    return VARN;
  }

  // the bridge lives outside the spec (define() deep-merges the spec, and the pack holds DOM images)
  var REG = API.register(skin);
  REG.impasto = {
    art: art, ART: ART, stroke: stroke, painted: painted,
    useArt: function (on) { art.on = on !== false; return art.on; },
    load: function (base) { REG.impasto.ready = loadArt(base); return REG.impasto.ready; },
    ready: null
  };
  REG.impasto.load(scriptBase());
})(typeof window !== 'undefined' ? window : this);
