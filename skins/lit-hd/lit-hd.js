/* GameDNA skin 'lit-hd' · Lit HD 2D · needs skin-api.js first
 *
 * Smooth, hand-painted-looking HD 2D made to be lit by real-time light. No pixel grid: every shape is a soft vector
 * or a smoothly interpolated painted texture at device resolution. The ground is one continuous painted field (low
 * frequency colour noise, brush dabs, grass tufts), units and props are soft-shaded figures with a rim of the nearest
 * light's colour, and the UI is soft rounded dusk-glass panels with an inner glow, a Marcellus (serif) / Figtree (sans)
 * pairing and numerals with soft drop shadows. See skins/lit-hd/STYLE.md.
 *
 * The skin is a normal 2D skin and looks finished on its own (the "unlit" fallback paints a dusk wash, light pools,
 * a vignette and soft halos in 2D). For the full look a host adds the M9 light stack on the same canvas:
 *   I-08 webgl-post (GameDNA_Post), J-01 dynamic-lights (GameDNA_Lights), J-03 bloom-glow (GameDNA_Bloom),
 *   optionally J-06 color-grade-lut (GameDNA_ColorGrade).
 * The bridge is `skin.lit` (STYLE.md §10):
 *   skin.lit.begin()                  call before drawing a frame: clears the frame's records
 *   skin.lit.post / skin.lit.bloom    set true when J-01 / J-03 are active: the skin then skips its 2D light wash and
 *                                     pools / tones its own 2D halos down, so light is never counted twice
 *   skin.lit.lights                   the standard lights (SPEC §2.5) the scene handed to atmosphere/prop/unitToken
 *   skin.lit.occluders                footprints (native px) of units, stones, bushes and trees drawn this frame: J-01 `rects`
 *   skin.lit.emissive                 what should glow (flames, crystal, lamp glass, glowing eyes, staff orbs, the move
 *                                     arrow core, the map cursor, motes), recorded in native px while drawing
 *   skin.lit.drawEmissive(g, s)       replays those records into J-03's emissive() context (s = canvas px per native px)
 * Records are made only by world drawing (prop, unitToken, path, cursor 'bracket', atmosphere), never by number(),
 * text() or frame(), so a module that measures off-screen never leaves stray glow.
 *
 * Host: native 256x224 (or any), scale 'fit': backing store = display px, ctx.setTransform(s, 0, 0, s, 0, 0).
 * Methods: frame text number overlay bar cursor path tile prop unitToken atmosphere (+ lit bridge).
 */
(function (root) {
  'use strict';
  var API = root.GameDNA_Skin;
  if (!API) { if (root.console) console.error('lit-hd.js: load skin-api.js first'); return; }
  var C = API.color, rgba = C.rgba, mix = C.mix, rgbOf = C.rgb;

  var SERIF = '"Marcellus", "Cormorant Garamond", "Palatino Linotype", Palatino, Georgia, serif';
  var SANS = '"Figtree", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  var AMBER = '#ffc46b', EMBER = '#ff8a4c', COOL = '#8fdcff', INK = '#130f1d';

  var palette = {
    ink: INK, paper: '#f6efe2',
    ui: {
      fill: 'rgba(30,32,54,0.90)', fillTo: 'rgba(15,15,30,0.93)', edge: 'rgba(255,255,255,0.13)', highlight: 'rgba(255,226,186,0.30)',
      shadow: 'rgba(5,3,14,0.58)', select: 'rgba(255,196,107,0.22)', well: 'rgba(4,3,12,0.34)', accent: AMBER, accent2: EMBER, cool: COOL,
      glass: { a: ['rgba(30,40,74,0.90)', 'rgba(14,17,36,0.94)'], b: ['rgba(62,26,40,0.90)', 'rgba(28,10,20,0.94)'], n: ['rgba(32,32,52,0.90)', 'rgba(15,14,28,0.93)'] },
      glow: { a: '#7fb4ff', b: '#ff7d8e', n: '#ffd9a8' }
    },
    team: { a: '#4f8cff', b: '#e0566a', n: '#9a96a8', aLight: '#a9c8ff', aDark: '#1f3a78', bLight: '#ffb3bd', bDark: '#5e1a2e', nLight: '#d4d0de', nDark: '#4a4658',
      aText: '#cfe0ff', bText: '#ffd2d8' },
    overlay: {
      move: { fill: '#4f9bff', edge: '#cfe6ff', glow: '#6fb2ff', alpha: 0.30 },
      attack: { fill: '#ff3d64', edge: '#ffd6de', glow: '#ff5a7a', alpha: 0.30 },
      threat: { fill: '#a86cff', edge: '#ead8ff', glow: '#b98aff', alpha: 0.24 },
      heal: { fill: '#3fd894', edge: '#d4ffe8', glow: '#62f0aa', alpha: 0.28 },
      path: { core: '#fffaf0', light: '#ffe2a8', mid: AMBER, dark: '#b0662a', outline: '#1a0f08', spark: '#ffffff', glow: '#ffb45a' },
      pathBad: { core: '#fff0ee', light: '#ffc0b8', mid: '#ff6a5a', dark: '#8a2a2a', outline: '#1a0808', spark: '#ffd6d0', glow: '#ff5a4a' }
    },
    fx: { hot: '#ffae5c', cold: '#79d4ff', heal: '#6ff0a8', crit: '#ffd36b', status: '#c79bff', white: '#fff7ea', ember: EMBER },
    text: {
      main: '#f3ede2', main2: '#ddd2c2', shadow: 'rgba(6,4,16,0.80)', outline: INK, dim: '#858196', dim2: '#6c687e',
      accent: AMBER, select: '#fff3da', title: '#fff6e6', title2: '#f0d6ae', label: AMBER, label2: '#e89a52', gold: COOL, gold2: '#5fb8e8',
      plate: '#f3ede2', plateShadow: 'rgba(6,4,16,0.8)', pointer: AMBER, pointerEdge: '#3a1e08', onAccent: '#24140a'
    },
    // pop-up numerals: [top, bottom, glow (null = none)]
    numbers: {
      damage: ['#ffffff', '#ffe0c0', null], crit: ['#fff8d0', '#ffa63a', '#ffb347'], heal: ['#f0fff4', '#48dc8a', '#5cf0a0'],
      mp: ['#f0f8ff', '#5aa8ff', '#6fb8ff'], miss: ['#eeecf4', '#9a97ac', null], status: ['#f8eeff', '#a872f0', '#c89aff'], label: ['#fff3cc', '#ffad42', '#ffb347']
    },
    // gauge fills [from, to]
    bars: {
      track: 'rgba(4,3,12,0.55)', charge: ['#ffd88a', '#ff9a4c'], ready: ['#fff4d6', '#ffc46b'], queued: ['#bcd6ff', '#5a86e8'],
      haste: ['#d8ffa0', '#5ccc6a'], slow: ['#e2d2ff', '#8a68e0'], enemy: ['#ffb0a0', '#e0485a'], enemyFull: ['#fff0c0', '#ff8a4c'],
      hp: ['#b8ffcc', '#36c27a'], hpLow: ['#ffe2a0', '#f07a32']
    },
    // painted terrain: ramps [dark, mid, light] + an accent; terrain.<kind> (one colour) keeps the generic tile working
    terrain: { grass: '#5f8f4c', forest: '#3f6e44', water: '#24606e', hill: '#8c9a5a', mountain: '#7c7a86', road: '#a08462', bridge: '#8a6440',
      fort: '#9a94a2', sand: '#d6bf8c', wall: '#6c6878', floor: '#8a8090' },
    ramps: {
      grass: [[50, 92, 58], [86, 132, 74], [124, 166, 88], [150, 160, 92]], forest: [[34, 70, 50], [52, 98, 60], [80, 128, 72], [96, 110, 64]],
      water: [[12, 60, 50], [22, 104, 84], [58, 154, 120], [120, 210, 176]], hill: [[96, 110, 70], [134, 146, 88], [170, 172, 110], [180, 150, 96]],
      mountain: [[84, 82, 98], [118, 116, 130], [156, 152, 164], [104, 120, 96]], road: [[120, 96, 74], [156, 128, 96], [186, 160, 124], [140, 126, 96]],
      sand: [[176, 150, 104], [210, 186, 136], [232, 214, 170], [200, 170, 120]], floor: [[96, 88, 104], [126, 118, 134], [150, 142, 158], [112, 104, 120]],
      wall: [[74, 70, 86], [100, 96, 112], [128, 124, 140], [84, 80, 96]], fort: [[100, 96, 110], [134, 130, 144], [166, 162, 176], [120, 110, 100]]
    },
    skin: { a: '#f1c7a2', b: '#b7c4b0', bWraith: '#2a2034', n: '#e6c2a4', hair: '#5a3a26', eyeB: '#ff6a7a', eyeW: '#d8a8ff' },
    // 2D fallback mood (used only when J-01 is not running): dusk wash, pool strength, vignette
    mood: { wash: '#7f8cc0', washAlpha: 0.55, unitTint: 'rgba(40,40,92,0.22)', pool: 0.62, vignette: '#0a0816', vignetteAlpha: 0.55 }
  };

  /* ---------------- helpers ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function scaleOf(ctx) { return API.scaleOf ? API.scaleOf(ctx) : 1; }
  function hair(ctx) { return 1 / scaleOf(ctx); }
  function setSh(ctx, col, blur, dx, dy) { API.setShadow(ctx, col, blur, dx || 0, dy || 0); }
  function noSh(ctx) { API.clearShadow(ctx); }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); var R = Array.isArray(r) ? r : [r, r, r, r], lim = Math.max(0, Math.min(w, h) / 2);
    R = R.map(function (v) { return Math.max(0, Math.min(v || 0, lim)); });
    if (w <= 0 || h <= 0) return;
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, R); return; }
    ctx.moveTo(x + R[0], y); ctx.lineTo(x + w - R[1], y); ctx.arcTo(x + w, y, x + w, y + R[1], R[1]); ctx.lineTo(x + w, y + h - R[2]);
    ctx.arcTo(x + w, y + h, x + w - R[2], y + h, R[2]); ctx.lineTo(x + R[3], y + h); ctx.arcTo(x, y + h, x, y + h - R[3], R[3]); ctx.lineTo(x, y + R[0]); ctx.arcTo(x, y, x + R[0], y, R[0]); ctx.closePath();
  }
  function lin(ctx, x0, y0, x1, y1, stops) { var g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  function rad(ctx, x, y, r0, r1, stops) { var g = ctx.createRadialGradient(x, y, r0, x, y, Math.max(r0 + 0.01, r1)); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); }
  function ell(ctx, x, y, rx, ry, a) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), a || 0, 0, Math.PI * 2); }
  function h3(a, b, c) { var n = (Math.round(a * 7) * 374761393 + Math.round(b * 7) * 668265263 + (c || 0) * 2246822519) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
  function vh(ix, iy, s) { var n = (ix * 374761393 + iy * 668265263 + s * 1442695041) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
  function vn(x, y, s) {   // smooth value noise 0..1
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = vh(ix, iy, s), b = vh(ix + 1, iy, s), c = vh(ix, iy + 1, s), d = vh(ix + 1, iy + 1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function hexA(c, a) { return rgba(c, a); }
  var POOL = {};
  function pooled(key, w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    var c = POOL[key]; if (!c) { c = POOL[key] = (typeof document !== 'undefined' ? document.createElement('canvas') : null); if (!c) return null; }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else c.getContext('2d').clearRect(0, 0, w, h);
    return c;
  }
  // light helpers (standard lights, SPEC §2.5)
  function stdLights(list) { return API.normLights ? API.normLights(list || []) : (list || []); }
  function nearest(ls, x, y) {
    var best = null, bs = 0;
    (ls || []).forEach(function (l) { var d = Math.hypot(l.x - x, l.y - y), reach = (l.r || 40) * 2.4, s = (l.intensity == null ? 1 : l.intensity) * clamp(1 - d / reach, 0, 1); if (s > bs) { bs = s; best = { l: l, s: s, d: d }; } });
    return best;
  }

  /* ---------------- lit bridge: what the light stack needs from this frame's drawing ---------------- */
  var lit = {
    post: false, bloom: false, lights: [], occluders: [], emissive: [], ui: [], recording: true,
    begin: function () { this.lights = []; this.occluders = []; this.emissive = []; this.ui = []; return this; },
    emit: function (rec) { if (this.recording && this.emissive.length < 1500) this.emissive.push(rec); },
    // UI coverage (framed windows and number glyphs) for the shared 'uiMask' input; rec.cv = the canvas it was drawn on
    mark: function (rec) { if (this.recording && this.ui.length < 400) this.ui.push(rec); },
    // paint the UI mask (white = UI, soft-edged glyph silhouettes, so no ungraded box shows around a number); only records made on `canvas`
    drawUiMask: function (g, s, canvas) {
      if (!g || !g.save) return 0; var n = 0;
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
      g.setTransform(s, 0, 0, s, 0, 0); g.lineJoin = 'round'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
      this.ui.forEach(function (u) {
        if (canvas && u.cv !== canvas) return; n++; g.globalAlpha = clamp(u.a == null ? 1 : u.a, 0, 1);
        if (u.t === 'rect') { g.fillStyle = '#fff'; rr(g, u.x, u.y, u.w, u.h, u.r || 0); g.fill(); }
        else if (u.t === 'glyph') {
          g.save(); if (u.sx !== 1 || u.sy !== 1) { g.translate(u.bx, u.y); g.scale(u.sx, u.sy); g.translate(-u.bx, -u.y); }
          g.font = u.font; g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = u.olw * 0.55; API.setShadow(g, '#fff', 0.5, 0, 0);
          g.strokeText(u.ch, u.x, u.y); g.fillText(u.ch, u.x, u.y); API.clearShadow(g); g.restore();
        }
      });
      g.restore(); return n;
    },
    occlude: function (r) { if (this.recording && this.occluders.length < 200) this.occluders.push(r); },
    seeLights: function (ls) { if (ls && ls.length && !this.lights.length) this.lights = stdLights(ls).map(function (l) { return Object.assign({}, l); }); },
    // replay the emissive records into a 2D context (J-03 emissive(), whose transform maps canvas px); s = canvas px per native px
    drawEmissive: function (g, s) {
      if (!g || !g.save) return 0;
      g.save(); g.scale(s, s); g.globalCompositeOperation = 'lighter';   // on top of the context's own transform (J-03 maps canvas px to its layer) g.lineCap = 'round'; g.lineJoin = 'round';
      this.emissive.forEach(function (e) {
        g.globalAlpha = clamp(e.a == null ? 1 : e.a, 0, 1);
        if (e.t === 'glow') { g.fillStyle = rad(g, e.x, e.y, 0, e.r, [[0, rgba(e.col, 1)], [0.35, rgba(e.col, 0.55)], [1, rgba(e.col, 0)]]); g.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2); }
        else if (e.t === 'dot') { g.fillStyle = e.col; circ(g, e.x, e.y, e.r); g.fill(); }
        else if (e.t === 'line' && e.pts && e.pts.length > 1) { g.strokeStyle = e.col; g.lineWidth = e.w; g.beginPath(); e.pts.forEach(function (p, i) { g[i ? 'lineTo' : 'moveTo'](p.x, p.y); }); g.stroke(); }
        else if (e.t === 'ring') { g.strokeStyle = e.col; g.lineWidth = e.w; ell(g, e.x, e.y, e.rx, e.ry); g.stroke(); }
        else if (e.t === 'flame') { flameShape(g, e.x, e.y, e.w, e.h, e.ph); g.fillStyle = e.col; g.fill(); }
      });
      g.restore(); return this.emissive.length;
    }
  };
  // halo strength of the skin's own 2D glows: full when no bloom runs, toned down under J-03 (it adds the real glow)
  function haloK() { return lit.bloom ? 0.45 : 1; }

  /* ---------------- painted textures ---------------- */
  // A tile's colour field is sampled at world positions on a padded texel grid and drawn with bilinear smoothing, so
  // neighbouring tiles join without seams: one continuous painted ground.
  function field(kind, wx, wy, t) {
    var R = palette.ramps[kind] || palette.ramps.grass, n1 = vn(wx / 34, wy / 34, 11), n2 = vn(wx / 11, wy / 11, 12), n3 = vn(wx / 60 + 3, wy / 60, 13);
    if (kind === 'water') { n1 = vn(wx / 22 + t * 0.12, wy / 22 - t * 0.05, 21); n2 = vn(wx / 8 - t * 0.3, wy / 8 + t * 0.18, 22); }
    var v = clamp(n1 * 0.68 + n2 * 0.32, 0, 1), c = v < 0.5 ? lerp3(R[0], R[1], v * 2) : lerp3(R[1], R[2], (v - 0.5) * 2);
    if (kind !== 'water') c = lerp3(c, R[3], clamp((n3 - 0.55) * 2.2, 0, 0.55));   // drier / warmer patches
    return c;
  }
  var TEX = null;
  function paintField(ctx, r, kind, t) {
    var N = 8, P = 1, M = N + 2 * P, c = TEX || (TEX = typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (!c) { ctx.fillStyle = palette.terrain[kind] || palette.terrain.grass; ctx.fillRect(r.x, r.y, r.w, r.h); return; }
    if (c.width !== M) { c.width = M; c.height = M; }
    var g = c.getContext('2d'), img = g.createImageData(M, M), d = img.data, tw = r.w / N, th = r.h / N;
    for (var j = 0; j < M; j++) for (var i = 0; i < M; i++) {
      var col = field(kind, r.x + (i - P + 0.5) * tw, r.y + (j - P + 0.5) * th, t || 0), o = (j * M + i) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    var ps = ctx.imageSmoothingEnabled, pq = ctx.imageSmoothingQuality; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    // a hair of overdraw hides anti-aliased tile edges
    ctx.drawImage(c, P - 0.04, P - 0.04, N + 0.08, N + 0.08, r.x - 0.05, r.y - 0.05, r.w + 0.1, r.h + 0.1);
    ctx.imageSmoothingEnabled = ps; if (pq) ctx.imageSmoothingQuality = pq;
  }
  // soft painterly dabs (elongated, rotated, low alpha), seeded by world position
  function dabs(ctx, r, n, cols, seed, size) {
    var u = r.w / 16;
    for (var i = 0; i < n; i++) {
      var hx = h3(r.x, r.y, seed + i * 3), hy = h3(r.y, r.x, seed + i * 3 + 1), hs = h3(r.x + i, r.y, seed + i * 3 + 2);
      var x = r.x + hx * r.w, y = r.y + hy * r.h, col = cols[Math.floor(hs * cols.length) % cols.length];
      ctx.fillStyle = col; ell(ctx, x, y, (size || 2.2) * u * (0.6 + hs * 0.8), (size || 2.2) * u * 0.42, -0.5 + hs * 0.6); ctx.fill();
    }
  }
  function tuft(ctx, x, y, u, dark, light, s) {   // three curved grass blades, dark at the root, light at the tip (light from top-left)
    ctx.lineCap = 'round';
    [[-1.3, -2.6, -2.1], [0, -3.6, 0.4], [1.3, -2.8, 1.8]].forEach(function (b, i) {
      var tx = x + b[2] * u * 0.7 * s, ty = y + b[1] * u * s;
      ctx.strokeStyle = lin(ctx, x, y, tx, ty, [[0, dark], [1, light]]); ctx.lineWidth = (0.75 - i * 0.08) * u;
      ctx.beginPath(); ctx.moveTo(x + b[0] * u * 0.4, y); ctx.quadraticCurveTo(x + b[0] * u * 0.5, y + b[1] * u * 0.55 * s, tx, ty); ctx.stroke();
    });
  }

  /* ---------------- figures: a soft-shaded layer with a light rim ---------------- */
  // draw(g) paints the figure in native coords into an offscreen layer at device resolution; then the layer gets
  // (a) the dusk tint in the 2D fallback, (b) a rim of the nearest light's colour on the side facing it, (c) a soft
  // ground occlusion at the feet; then it is composited onto ctx.
  function litLayer(ctx, box, ls, footY, draw, opts) {
    opts = opts || {};
    var k = Math.max(1, scaleOf(ctx)), cw = Math.ceil(box.w * k), ch = Math.ceil(box.h * k), L = pooled('fig', cw, ch);
    if (!L) { draw(ctx); return; }
    var g = L.getContext('2d'); g.setTransform(k, 0, 0, k, -box.x * k, -box.y * k); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.imageSmoothingEnabled = true; draw(g);
    // edge bands from the silhouette: band(dx, dy) = pixels of the figure whose neighbour 1 native px toward (dx, dy) is empty
    var band = function (key, dx, dy, w, col, a) {
      var B = pooled(key, cw, ch); if (!B || !(a > 0)) return; var b = B.getContext('2d');
      b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over'; b.drawImage(L, 0, 0);
      b.globalCompositeOperation = 'destination-out'; b.drawImage(L, -dx * w * k, -dy * w * k);
      b.globalCompositeOperation = 'source-in'; b.fillStyle = col; b.fillRect(0, 0, cw, ch);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a; g.drawImage(B, 0, 0); g.restore();
    };
    if (!opts.noModel) band('core', 0.75, 0.6, 1.1, '#140a26', 0.42);   // form shadow on the side away from the upper-left key
    g.globalCompositeOperation = 'source-atop';
    if (!lit.post && !opts.noTint) { g.fillStyle = palette.mood.unitTint; g.fillRect(box.x, box.y, box.w, box.h); }
    var cx = box.x + box.w / 2, n = opts.noRim ? null : nearest(ls, cx, footY);
    if (n && n.s > 0.02) {
      var dx = n.l.x - cx, dy = (n.l.y - (n.l.h || 16) * 0.6) - (footY - box.h * 0.45), dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      var R = Math.max(box.w, box.h) * 0.55, mx = cx, my = footY - box.h * 0.45, lc = n.l.col || '#ffc070';
      g.fillStyle = lin(g, mx + dx * R, my + dy * R, mx - dx * R * 0.2, my - dy * R * 0.2, [[0, rgba(lc, clamp(0.35 * n.s, 0, 0.3))], [0.4, rgba(lc, 0)], [1, rgba(lc, 0)]]);
      g.fillRect(box.x, box.y, box.w, box.h);
      // the rim itself: a narrow bright band (1 native px) on the silhouette edge facing the light
      band('rim', dx, dy, 1, mix(lc, '#ffffff', 0.35), clamp(0.45 + 0.9 * n.s, 0, 0.9));
      g.globalCompositeOperation = 'source-atop';
    }
    if (!opts.noAO) { g.fillStyle = lin(g, 0, footY - 4, 0, footY + 0.5, [[0, 'rgba(10,6,24,0)'], [1, 'rgba(10,6,24,0.38)']]); g.fillRect(box.x, footY - 4, box.w, 5); }
    g.globalCompositeOperation = 'source-over';
    var pa = ctx.globalAlpha; if (opts.alpha != null) ctx.globalAlpha = pa * opts.alpha;
    ctx.drawImage(L, 0, 0, cw, ch, box.x, box.y, cw / k, ch / k); ctx.globalAlpha = pa;
  }
  // soft contact shadow + (2D fallback only) a short cast shadow away from the nearest light; J-01 casts the real one
  function groundShadow(ctx, cx, fy, rx, ls, strength) {
    var a = strength == null ? 1 : strength;
    if (!lit.post) {
      var n = nearest(ls, cx, fy);
      if (n && n.s > 0.05) {
        var ang = Math.atan2(fy - n.l.y, cx - n.l.x), len = rx * (1.2 + 1.6 * clamp(1 - n.d / ((n.l.r || 40) * 2), 0, 1));
        ctx.save(); ctx.translate(cx, fy); ctx.rotate(ang); ctx.fillStyle = rad(ctx, len * 0.55, 0, 0, len * 0.95, [[0, 'rgba(8,4,22,' + (0.34 * a * n.s * 1.6).toFixed(3) + ')'], [1, 'rgba(8,4,22,0)']]);
        ctx.scale(1, 0.42); circ(ctx, len * 0.55, 0, len * 0.95); ctx.fill(); ctx.restore();
      }
    }
    ctx.fillStyle = rad(ctx, cx, fy, 0, rx * 1.15, [[0, 'rgba(8,4,22,' + (0.5 * a).toFixed(3) + ')'], [0.6, 'rgba(8,4,22,' + (0.22 * a).toFixed(3) + ')'], [1, 'rgba(8,4,22,0)']]);
    ctx.save(); ctx.translate(cx, fy); ctx.scale(1, 0.38); circ(ctx, 0, 0, rx * 1.15); ctx.restore(); ctx.fill();
  }
  function flameShape(g, x, y, w, h, ph) {   // teardrop flame, base centre (x, y), sways with ph
    var sw = Math.sin(ph) * w * 0.28, sw2 = Math.sin(ph * 1.7 + 1) * w * 0.12;
    g.beginPath(); g.moveTo(x - w / 2, y - h * 0.2);
    g.bezierCurveTo(x - w * 0.55, y - h * 0.62, x + sw - w * 0.1, y - h * 0.8, x + sw + sw2, y - h);
    g.bezierCurveTo(x + sw + w * 0.18, y - h * 0.72, x + w * 0.6, y - h * 0.55, x + w / 2, y - h * 0.2);
    g.bezierCurveTo(x + w * 0.45, y + h * 0.05, x - w * 0.45, y + h * 0.05, x - w / 2, y - h * 0.2); g.closePath();
  }

  /* ---------------- fonts ---------------- */
  var fonts = {
    ui: { type: 'canvas', family: SANS, size: 7.2, weight: 600, letterSpacing: 0.05 },
    title: { type: 'canvas', family: SERIF, size: 8.4, weight: 400, letterSpacing: 0.35 },
    num: { type: 'canvas', family: SANS, size: 11.5, weight: 800, letterSpacing: 0 },
    label: { type: 'canvas', family: SANS, size: 5.4, weight: 800, letterSpacing: 0.7, uppercase: true },
    plate: { type: 'canvas', family: SERIF, size: 7.4, weight: 400, letterSpacing: 0.5 },
    small: { type: 'canvas', family: SANS, size: 6.4, weight: 700, letterSpacing: 0.1 },
    rules: { snap: false, smoothing: true, minSize: 5, lineH: 1.3, uppercase: false,
      note: 'Marcellus (serif) for titles and plates, Figtree (sans) for UI and numerals; doc pages load them from Google Fonts, games fall back to Georgia / system-ui' }
  };

  var skin = {
    id: 'lit-hd', name: 'Lit HD 2D', pixel: false,
    native: { w: 256, h: 224, scale: 'fit', smoothing: true, snap: 0, minScale: 1,
      note: 'smooth at device resolution, no pixel grid; designed to sit under I-08 + J-01 + J-03 (+ J-06)' },
    palette: palette,
    fonts: fonts,
    lit: lit,
    shape: { radius: 5, plateRadius: 99, edgeWidth: 0.6, padding: 5, rowRadius: 3.5, backingRadius: 3, barRadius: 99, innerGlow: 0.22 },
    frameRoles: ['row', 'backing'],
    atmospherePhases: ['world', 'final'],
    layout: { handW: 7, handH: 5, pointerGap: 5, rowFrame: true },
    overlayStyle: { mode: 'glow', pattern: 'pulsing', radius: 3, edgeWidth: 0.7, edgeAlpha: 0.85, glowWidth: 3.5, glowAlpha: 0.38, seamAlpha: 0, sweep: 0 },
    particles: { shape: 'circle', size: [0.6, 2.2], count: 1.2, snap: false, blend: 'lighter', glow: 1, gravity: -0.015, drag: 0.04, life: [600, 1400],
      colors: ['fx.hot', 'fx.crit', 'fx.white', 'fx.cold'], trail: 0, emissive: true,
      motes: { perLight: 6, size: [0.45, 1.1], rise: 26, alpha: 0.8 } },
    outline: { text: { width: 0 }, number: { width: 1.1, max: 1.6, drop: 1.2, mode: 'soft', color: 'text.outline' }, sprite: { width: 0, color: 'ink', mode: 'rim' } },
    shadow: { text: { dx: 0, dy: 0.6, blur: 1.6 }, window: { dx: 0, dy: 3, blur: 9 }, sprite: { kind: 'contact+cast', alpha: 0.5 } },
    motion: { stepMs: 0, snap: false, ease: { move: 'outCubic', pop: 'outBack', fade: 'outQuad', open: 'outBack' }, fadeSteps: null, shakeInt: false, flashMax: 0.5,
      squash: { x: 1.16, y: 0.86, ms: 80 }, breathe: { amp: 0.025, hz: 0.55 }, bobHz: 0.9 },

    // text(ctx, str, x, y, {font, color, color2, shadow, outline, align, scale, alpha}) -> width: soft drop shadow, optional vertical gradient
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
      if (ol) { ctx.lineJoin = 'round'; ctx.lineWidth = (o.outlineWidth || 1) * 1.6; ctx.strokeStyle = ol; ctx.strokeText(s, x, y); }
      var sh = o.shadow === false ? null : API.token(this, o.shadow) || P.shadow, S = this.shadow.text;
      if (sh && S) setSh(ctx, sh, S.blur * sc, S.dx, S.dy * sc);
      ctx.fillStyle = c2 && c2 !== c1 ? lin(ctx, 0, y, 0, y + size, [[0, c1], [1, c2]]) : c1;
      ctx.fillText(s, x, y); noSh(ctx); ctx.restore(); ctx.globalAlpha = pa;
      return w;
    },

    // frame(ctx, rect, {role, team, focus, alert, disabled, alpha}) -> inner rect: soft rounded dusk glass, inner glow, light leak
    frame: function (ctx, r, st) {
      st = st || {}; var P = this.palette, U = P.ui, S = this.shape, role = st.role || 'window', x = r.x, y = r.y, w = r.w, h = r.h;
      var team = st.team === 'a' || st.team === 'b' ? st.team : 'n', pa = ctx.globalAlpha;
      if (role === 'row' || role === 'backing') {
        ctx.save(); ctx.globalAlpha = pa * (st.alpha == null ? 1 : st.alpha) * (st.disabled ? 0.5 : 1);
        if (role === 'row') {   // a warm light band: amber gradient fading right, a bright lit edge on the left, a soft halo
          var rh = Math.min(S.rowRadius, h / 2);
          ctx.fillStyle = lin(ctx, x, 0, x + w, 0, [[0, rgba(AMBER, 0.34)], [0.55, rgba(AMBER, 0.12)], [1, rgba(AMBER, 0.03)]]); rr(ctx, x, y, w, h, rh); ctx.fill();
          ctx.lineWidth = hair(ctx); ctx.strokeStyle = lin(ctx, x, 0, x + w, 0, [[0, rgba('#ffe2b0', 0.55)], [0.7, rgba('#ffe2b0', 0.08)], [1, rgba('#ffe2b0', 0)]]); rr(ctx, x + 0.25, y + 0.25, w - 0.5, h - 0.5, rh); ctx.stroke();
          ctx.globalCompositeOperation = 'lighter';   // a soft warm bloom at the band's left end (no bar: it read as a text caret)
          ctx.fillStyle = rad(ctx, x, y + h / 2, 0, h * 1.1, [[0, rgba(AMBER, 0.32 * haloK())], [1, rgba(AMBER, 0)]]); ctx.fillRect(x - h, y - h * 0.2, h * 2.2, h * 1.4);
        } else {
          var br = Math.min(S.backingRadius, h / 2, w / 2);
          ctx.fillStyle = U.well; rr(ctx, x, y, w, h, br); ctx.fill();
          ctx.lineWidth = hair(ctx); ctx.strokeStyle = 'rgba(255,255,255,0.07)'; rr(ctx, x + 0.3, y + 0.3, w - 0.6, h - 0.6, br); ctx.stroke();
          ctx.fillStyle = lin(ctx, 0, y, 0, y + Math.min(4, h), [[0, 'rgba(0,0,0,0.28)'], [1, 'rgba(0,0,0,0)']]); rr(ctx, x, y, w, Math.min(4, h), [br, br, 0, 0]); ctx.fill();
        }
        ctx.restore(); ctx.globalAlpha = pa; return { x: x, y: y, w: w, h: h };
      }
      var pill = role === 'plate' || role === 'banner', R = pill ? h / 2 : role === 'tooltip' ? 3 : Math.min(S.radius, h / 2, w / 2), glass = U.glass[team], glowC = U.glow[team];
      var inner = pill ? { x: x + Math.max(5, h * 0.45), y: y + 2.5, w: w - 2 * Math.max(5, h * 0.45), h: h - 5 } : { x: x + S.padding, y: y + S.padding - 0.5, w: w - 2 * S.padding, h: h - 2 * S.padding + 1 };
      if (w < 2 || h < 2) return inner;
      ctx.save(); ctx.globalAlpha = pa * (st.alpha == null ? 1 : st.alpha) * (st.disabled ? 0.6 : 1);
      lit.mark({ t: 'rect', cv: ctx.canvas, x: x, y: y, w: w, h: h, r: R, a: ctx.globalAlpha });
      // 1. soft shadow: a wide ambient one + a tight contact one
      var W = this.shadow.window;
      ctx.fillStyle = glass[1]; setSh(ctx, U.shadow, W.blur, W.dx, W.dy); rr(ctx, x, y, w, h, R); ctx.fill();
      setSh(ctx, 'rgba(5,3,14,0.4)', 1.4, 0, 0.6); ctx.fill(); noSh(ctx);
      // 2. body: dusk glass, top -> bottom
      ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [[0, glass[0]], [1, glass[1]]]); rr(ctx, x, y, w, h, R); ctx.fill();
      ctx.save(); rr(ctx, x, y, w, h, R); ctx.clip();
      // 3. inner glow: warm light pooled under the top edge, plus a cooler team glow from the lower left
      var gr = Math.max(w, h) * 0.9;
      ctx.fillStyle = rad(ctx, x + w * 0.42, y - h * 0.15, 0, gr, [[0, rgba('#ffdcb0', S.innerGlow * 0.8)], [0.45, rgba('#ffdcb0', S.innerGlow * 0.22)], [1, 'rgba(255,220,176,0)']]); ctx.fillRect(x, y, w, h);
      ctx.fillStyle = rad(ctx, x, y + h, 0, Math.max(w, h) * 0.7, [[0, rgba(glowC, 0.13)], [1, rgba(glowC, 0)]]); ctx.fillRect(x, y, w, h);
      // fine painted grain so the glass is not a flat vector fill (seeded by position, deterministic)
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      for (var gi = 0; gi < Math.min(60, (w * h) / 40); gi++) { var gx = x + h3(x, y, gi) * w, gy = y + h3(y, x, gi + 99) * h; ell(ctx, gx, gy, 2.2, 0.5, h3(gi, x, 5) * 3); ctx.fill(); }
      ctx.restore();
      // 4. edges: a hairline rim, a bright inner top line (light catching the bevel), a team light leak at the top-left
      var hl = hair(ctx);
      ctx.lineWidth = S.edgeWidth; ctx.strokeStyle = 'rgba(8,6,18,0.7)'; rr(ctx, x - 0.15, y - 0.15, w + 0.3, h + 0.3, R + 0.15); ctx.stroke();
      ctx.lineWidth = Math.max(hl, 0.45); ctx.strokeStyle = lin(ctx, 0, y, 0, y + h, [[0, 'rgba(255,240,220,0.42)'], [0.18, 'rgba(255,240,220,0.12)'], [1, 'rgba(255,255,255,0.05)']]);
      rr(ctx, x + 0.55, y + 0.55, w - 1.1, h - 1.1, Math.max(0, R - 0.55)); ctx.stroke();
      if (role !== 'tooltip') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = lin(ctx, x, y, x + Math.min(w, 70), y + Math.min(h, 30), [[0, rgba(glowC, 0.85)], [0.35, rgba(glowC, 0.25)], [1, rgba(glowC, 0)]]);
        ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x + 0.6, y + Math.min(h - R, 22)); ctx.lineTo(x + 0.6, y + R); ctx.arcTo(x + 0.6, y + 0.6, x + R, y + 0.6, Math.max(0.1, R - 0.6)); ctx.lineTo(x + Math.min(w - R, 60), y + 0.6); ctx.stroke();
        ctx.restore();
      }
      if (role === 'banner') {   // ember accents at both ends
        [x + h * 0.55, x + w - h * 0.55].forEach(function (bx) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rad(ctx, bx, y + h / 2, 0, h * 0.5, [[0, rgba(AMBER, 0.75 * haloK())], [1, rgba(AMBER, 0)]]); ctx.fillRect(bx - h, y, 2 * h, h); ctx.restore(); ctx.fillStyle = '#ffe6b8'; circ(ctx, bx, y + h / 2, 0.9); ctx.fill(); });
      }
      if (st.focus || st.alert) {
        var fc = st.alert ? P.team.b : AMBER;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; setSh(ctx, rgba(fc, 0.9), 4, 0, 0); ctx.strokeStyle = rgba(fc, 0.7); ctx.lineWidth = 0.6;
        rr(ctx, x - 0.4, y - 0.4, w + 0.8, h + 0.8, R + 0.4); ctx.stroke(); ctx.restore();
      }
      ctx.restore(); ctx.globalAlpha = pa;
      return inner;
    },

    // number(ctx, str, x, y, opts) -> glyph rects: smooth heavy sans numerals, dark soft outline + drop shadow, top-lit gradient,
    // a warm glow behind crits and heals; each glyph moves on its own (glyphOffset dx, dy, alpha, flash, sx/sy squash)
    number: function (ctx, str, x, y, o) {
      o = o || {}; var P = this.palette, s = String(str), kind = o.kind === 'critical' ? 'crit' : (o.kind || 'damage'), K = P.numbers[kind] || P.numbers.damage;
      if (o.scheme === 'contrast') K = [K[0], mix(K[1], '#ffffff', 0.2), K[2]];
      var sc = o.scale || 1, big = kind === 'crit' && o.big !== false ? 1.42 : 1, small = kind === 'miss' || kind === 'status' ? 0.74 : 1, NF = this.fonts.num, LF = this.fonts.label;
      var size = NF.size * sc * big * small, cap = size * 0.74, sz = size * 0.56, lsz = LF.size * sc * (kind === 'crit' ? 1.05 : 1);
      var mctx = ctx, self = this;
      function fnt(px, f) { return (f.weight || 400) + ' ' + px + 'px ' + f.family; }
      function mw(ch, px, f, ls) { mctx.font = fnt(px, f); return mctx.measureText(ch).width + (ls || 0); }
      ctx.save();
      var items = [], cx = 0, i;
      var track = kind === 'miss' || kind === 'status' ? 0.6 * sc : -0.15 * size / 11;
      for (i = 0; i < s.length; i++) { var aw = mw(s[i], size, NF, track); items.push({ ch: s[i], role: 'main', x: cx, w: aw, px: size, f: NF, yb: cap }); cx += aw; }
      if (o.suffix) { cx += 1 * sc; for (i = 0; i < o.suffix.length; i++) { var sw = mw(o.suffix[i], sz, LF, 0.3 * sc); items.push({ ch: o.suffix[i], role: 'suffix', x: cx, w: sw, px: sz, f: LF, yb: cap }); cx += sw; } }
      var mainW = cx, lab = o.label ? String(o.label) : '', labW = 0;
      var lAdv = []; for (i = 0; i < lab.length; i++) { var lw = mw(lab[i], lsz, LF, LF.letterSpacing * sc); lAdv.push(lw); labW += lw; }
      var x0 = o.align === 'center' ? x - mainW / 2 : x, y0 = o.baseline === 'bottom' ? y - cap : y;
      var lh = lsz * 0.74, gap = o.labelGap == null ? 3 : o.labelGap, lx = x0 + mainW / 2 - labW / 2, ly = y0 - gap - lh;
      for (i = 0; i < lab.length; i++) { items.push({ ch: lab[i], role: 'label', x: lx - x0, w: lAdv[i], px: lsz, f: LF, yb: lh, dy0: ly - y0 }); lx += lAdv[i]; }
      var GI = API.glyphItems(s, o), out = [], plans = [];
      items.forEach(function (it, j) {
        var d = (o.glyphOffset && o.glyphOffset(j, GI[j] || it)) || {}; if (d.skip) return;
        var lab = it.role === 'label', cols = lab ? P.numbers.label : K, gx = x0 + it.x + (d.dx || 0), gy = y0 + (it.dy0 || 0) + (d.dy || 0);
        var a = d.alpha != null ? d.alpha : o.alpha != null ? o.alpha : 1;
        plans.push({ j: j, it: it, gx: gx, gy: gy, a: clamp(a, 0, 1), flash: !!d.flash, sx: d.sx || 1, sy: d.sy || 1, cols: cols });
        out.push({ i: j, x: gx, y: gy, w: it.w, h: it.yb, ch: it.ch });
      });
      plans.forEach(function (p) { var olw = (p.it.role === 'label' ? 1.5 : 2.3) * sc * (p.it.role === 'main' ? Math.sqrt(big) : 1);
        lit.mark({ t: 'glyph', cv: ctx.canvas, ch: p.it.ch, font: fnt(p.it.px, p.it.f), x: p.gx, y: p.gy + p.it.yb, bx: p.gx + p.it.w / 2, sx: p.sx, sy: p.sy, olw: olw, a: p.a * ctx.globalAlpha }); });
      // glyphs sharing an alpha are drawn in one fade layer: every outline first, then every fill, so neighbours never cut each other
      var groups = {}, keys = [];
      plans.forEach(function (p) { var kk = String(Math.round(p.a * 100) / 100); if (!groups[kk]) { groups[kk] = []; keys.push(kk); } groups[kk].push(p); });
      keys.forEach(function (kk) {
        var G = groups[kk], bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
        G.forEach(function (p) { bx0 = Math.min(bx0, p.gx); by0 = Math.min(by0, p.gy); bx1 = Math.max(bx1, p.gx + p.it.w); by1 = Math.max(by1, p.gy + p.it.yb); });
        API.fadeLayer(ctx, +kk, { x: bx0 - 10, y: by0 - 10, w: bx1 - bx0 + 20, h: by1 - by0 + 20 }, function (g) {
          g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.lineJoin = 'round'; g.miterLimit = 2;
          var each = function (fn) { G.forEach(function (p) { g.save(); var bx = p.gx + p.it.w / 2, by = p.gy + p.it.yb; if (p.sx !== 1 || p.sy !== 1) { g.translate(bx, by); g.scale(p.sx, p.sy); g.translate(-bx, -by); } g.font = fnt(p.it.px, p.it.f); fn(p, by); g.restore(); }); };
          // 1. glow behind (crit, heal, mp, status): drawn with a coloured shadow only
          each(function (p, by) { var gc = p.flash ? '#ffffff' : p.cols[2]; if (!gc) return; g.globalCompositeOperation = 'lighter'; setSh(g, rgba(gc, 0.95 * haloK()), 5 * sc, 0, 0); g.fillStyle = rgba(gc, 0.35 * haloK()); g.fillText(p.it.ch, p.gx, by); noSh(g); });
          // 2. soft dark outline with a drop shadow under it
          each(function (p, by) { var olw = (p.it.role === 'label' ? 1.5 : 2.3) * sc * (p.it.role === 'main' ? Math.sqrt(big) : 1); setSh(g, 'rgba(4,2,12,0.7)', 2.2 * sc, 0, 1.1 * sc); g.strokeStyle = P.text.outline; g.lineWidth = olw; g.strokeText(p.it.ch, p.gx, by); noSh(g); });
          // 3. fill: top-lit vertical gradient, white flash ramp on crits
          each(function (p, by) {
            var top = p.flash ? '#ffffff' : p.cols[0], bot = p.flash ? mix(p.cols[1], '#ffffff', self.motion.flashMax) : p.cols[1];
            g.fillStyle = lin(g, 0, p.gy - p.it.yb * 0.05, 0, by, [[0, top], [0.45, mix(top, bot, 0.35)], [1, bot]]); g.fillText(p.it.ch, p.gx, by);
          });
        });
      });
      ctx.restore();
      return out;
    },

    // overlay: a translucent light wash per cell; the set's boundary glows (bright hairline + a strip fading inward); a slow
    // diagonal sheen sweeps across ('pulsing'); grow = eased scale-in from the cell centre
    overlay: function (ctx, r, kind, t, o) {
      o = o || {}; var Cc = this.palette.overlay[kind] || this.palette.overlay.move, S = this.overlayStyle, g = o.grow == null ? 1 : o.grow;
      if (!(g > 0)) return;
      var E = o.edges || {}, M = o.seams || {}, tx = o.tile ? o.tile.x : 0, ty = o.tile ? o.tile.y : 0, pat = o.pattern || S.pattern, a = Cc.alpha * Math.min(1, g * 1.3);
      var k = g < 1 ? 0.55 + 0.45 * API.ease.outBack(clamp(g, 0, 1)) : 1, cxm = r.x + r.w / 2, cym = r.y + r.h / 2;
      var x = cxm - r.w * k / 2, y = cym - r.h * k / 2, w = r.w * k, h = r.h * k, R = S.radius * k;
      if (g >= 1) { var dk = scaleOf(ctx), X0 = Math.round(x * dk) / dk, Y0 = Math.round(y * dk) / dk; w = Math.round((x + w) * dk) / dk - X0; h = Math.round((y + h) * dk) / dk - Y0; x = X0; y = Y0; }   // cells meet on whole device px: no double-alpha seam
      var cr = g < 1 ? [R, R, R, R] : [E.top && E.left ? R : 0, E.top && E.right ? R : 0, E.bottom && E.right ? R : 0, E.bottom && E.left ? R : 0];
      var sweep = pat === 'pulsing' ? Math.pow(Math.max(0, Math.sin((tx + ty) * 0.42 - t * 2.4)), 3) : 0;
      if (pat === 'checker') a *= (tx + ty) % 2 ? 1.15 : 0.8;
      ctx.save();
      rr(ctx, x, y, w, h, cr); ctx.fillStyle = rgba(Cc.fill, a); ctx.fill();
      ctx.save(); rr(ctx, x, y, w, h, cr); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
      if (g < 1) { ctx.fillStyle = rad(ctx, cxm, cym, 0, w * 0.75, [[0, rgba(Cc.glow, 0.1 * g)], [1, rgba(Cc.glow, 0)]]); ctx.fillRect(x, y, w, h); }
      var gw = S.glowWidth, ga = S.glowAlpha * Math.min(1, g);
      var strip = function (x0, y0, x1, y1, X, Y, W2, H2) { ctx.fillStyle = lin(ctx, x0, y0, x1, y1, [[0, rgba(Cc.glow, ga)], [1, rgba(Cc.glow, 0)]]); ctx.fillRect(X, Y, W2, H2); };
      if (E.top) strip(0, y, 0, y + gw, x, y, w, gw); if (E.bottom) strip(0, y + h, 0, y + h - gw, x, y + h - gw, w, gw);
      if (E.left) strip(x, 0, x + gw, 0, x, y, gw, h); if (E.right) strip(x + w, 0, x + w - gw, 0, x + w - gw, y, gw, h);
      ctx.restore();
      if (g >= 1) {   // faint seams keep the cells countable
        ctx.fillStyle = rgba(Cc.edge, S.seamAlpha); var hl = hair(ctx);
        if (M.right) ctx.fillRect(x + w - hl / 2, y + 2, hl, h - 4); if (M.bottom) ctx.fillRect(x + 2, y + h - hl / 2, w - 4, hl);
      }
      var lw = S.edgeWidth, i2 = lw / 2; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(Cc.edge, S.edgeAlpha * Math.min(1, g));
      ctx.beginPath(); var any = false;
      if (g < 1) { rr(ctx, x + i2, y + i2, w - lw, h - lw, Math.max(0, R - i2)); any = true; }
      else {
        if (E.top) { ctx.moveTo(x + cr[0], y + i2); ctx.lineTo(x + w - cr[1], y + i2); any = true; }
        if (E.right) { ctx.moveTo(x + w - i2, y + cr[1]); ctx.lineTo(x + w - i2, y + h - cr[2]); any = true; }
        if (E.bottom) { ctx.moveTo(x + w - cr[2], y + h - i2); ctx.lineTo(x + cr[3], y + h - i2); any = true; }
        if (E.left) { ctx.moveTo(x + i2, y + h - cr[3]); ctx.lineTo(x + i2, y + cr[0]); any = true; }
        if (cr[0]) { ctx.moveTo(x + i2, y + R); ctx.arc(x + R, y + R, R - i2, Math.PI, 1.5 * Math.PI); }
        if (cr[1]) { ctx.moveTo(x + w - R, y + i2); ctx.arc(x + w - R, y + R, R - i2, 1.5 * Math.PI, 2 * Math.PI); }
        if (cr[2]) { ctx.moveTo(x + w - i2, y + h - R); ctx.arc(x + w - R, y + h - R, R - i2, 0, 0.5 * Math.PI); }
        if (cr[3]) { ctx.moveTo(x + R, y + h - i2); ctx.arc(x + R, y + h - R, R - i2, 0.5 * Math.PI, Math.PI); }
      }
      if (any) { setSh(ctx, rgba(Cc.glow, 0.8 * haloK()), 2, 0, 0); ctx.stroke(); noSh(ctx); }
      if (g >= 1) {   // the set's rim is a line of light: J-03 picks it up
        var eg = function (ax, ay, bx2, by2) { lit.emit({ t: 'line', pts: [{ x: ax, y: ay }, { x: bx2, y: by2 }], w: 0.9, col: Cc.glow, a: 0.42 * ctx.globalAlpha }); };
        if (E.top) eg(x, y + i2, x + w, y + i2); if (E.bottom) eg(x, y + h - i2, x + w, y + h - i2); if (E.left) eg(x + i2, y, x + i2, y + h); if (E.right) eg(x + w - i2, y, x + w - i2, y + h);
      }
      ctx.restore();
    },

    // bar: an inset rounded track, a gradient fill with a glossy top line and a glowing tip; status tags = small lit chevrons
    bar: function (ctx, r, frac, kind, o) {
      o = o || {}; var P = this.palette, B = P.bars, x = r.x, y = r.y, w = r.w, h = r.h, f = clamp(frac || 0, 0, 1), R = h / 2;
      if (o.px != null && w) f = clamp(o.px / w, 0, 1);
      ctx.save();
      ctx.fillStyle = B.track; rr(ctx, x, y, w, h, R); ctx.fill();
      ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [[0, 'rgba(0,0,0,0.45)'], [0.5, 'rgba(0,0,0,0)']]); rr(ctx, x, y, w, h, R); ctx.fill();
      ctx.lineWidth = hair(ctx); ctx.strokeStyle = 'rgba(255,255,255,0.10)'; rr(ctx, x, y, w, h, R); ctx.stroke();
      if (!kind) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; for (var q = x + 2; q < x + w - 1; q += 3) { circ(ctx, q, y + h / 2, 0.35); ctx.fill(); } ctx.restore(); return; }
      var Cb = B[kind] || B.charge, fw = Math.max(Math.min(h, w * f), w * f);
      if (f > 0) {
        ctx.save(); rr(ctx, x, y, w, h, R); ctx.clip();
        ctx.fillStyle = lin(ctx, x, 0, x + Math.max(fw, 1), 0, [[0, Cb[1]], [1, Cb[0]]]); rr(ctx, x, y, fw, h, R); ctx.fill();
        ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [[0, 'rgba(255,255,255,0.40)'], [0.45, 'rgba(255,255,255,0.05)'], [1, 'rgba(0,0,0,0.18)']]); rr(ctx, x, y, fw, h, R); ctx.fill();
        ctx.restore();
        // glowing tip (stronger when the gauge is full / ready)
        var full = kind === 'ready' || kind === 'enemyFull', pulse = full ? 0.65 + 0.35 * Math.sin((o.t || 0) * 6) : 0.55;
        ctx.globalCompositeOperation = 'lighter';
        var tx = x + fw - R * 0.8; ctx.fillStyle = rad(ctx, tx, y + h / 2, 0, h * 1.8, [[0, rgba(Cb[0], 0.7 * pulse * haloK())], [1, rgba(Cb[0], 0)]]); ctx.fillRect(tx - h * 2, y - h, h * 4, h * 3);
        if (full) { ctx.fillStyle = rgba('#ffffff', 0.18 * pulse); rr(ctx, x, y, fw, h, R); ctx.fill(); }
        ctx.globalCompositeOperation = 'source-over';
      }
      if (o.tag === 'haste' || o.tag === 'slow') {
        var tc = (o.tag === 'haste' ? B.haste : B.slow)[0], d = Math.max(h + 1.6, 4.5), cx = x + w + d * 0.6 + 1.2, cy = y + h / 2, dir = o.tag === 'haste' ? 1 : -1;
        ctx.strokeStyle = tc; ctx.lineWidth = 0.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; setSh(ctx, rgba(tc, 0.9), 2, 0, 0);
        for (var c = 0; c < 2; c++) { var ox = cx + dir * (c * 1.8 - 0.9); ctx.beginPath(); ctx.moveTo(ox - dir * d * 0.22, cy - d * 0.32); ctx.lineTo(ox + dir * d * 0.18, cy); ctx.lineTo(ox - dir * d * 0.22, cy + d * 0.32); ctx.stroke(); }
        noSh(ctx);
      }
      ctx.restore();
    },

    // cursor: 'bracket' = four soft amber corner arcs that breathe outward + a faint light pool on the tile (emissive);
    //         'hand' = a glowing amber leaf-shaped pointer with a white-hot core
    cursor: function (ctx, r, kind, t, o) {
      o = o || {}; var P = this.palette, col = o.invalid ? P.team.b : AMBER, pa = ctx.globalAlpha, A = o.alpha == null ? 1 : o.alpha;
      ctx.save(); ctx.globalAlpha = pa * A; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (kind === 'hand') {
        var hx = r.x, hy = r.y, hw = r.w, hh = r.h, cy = hy + hh / 2, nud = Math.sin((t || 0) * Math.PI * 2 * 1.2) * 0.6;
        hx += nud;
        var leaf = function () { ctx.beginPath(); ctx.moveTo(hx + hw + 0.4, cy); ctx.quadraticCurveTo(hx + hw * 0.45, hy - 0.6, hx - 0.2, hy + 0.2); ctx.quadraticCurveTo(hx + hw * 0.35, cy, hx - 0.2, hy + hh - 0.2); ctx.quadraticCurveTo(hx + hw * 0.45, hy + hh + 0.6, hx + hw + 0.4, cy); ctx.closePath(); };
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rad(ctx, hx + hw * 0.6, cy, 0, hw * 1.3, [[0, rgba(col, 0.55 * haloK())], [1, rgba(col, 0)]]); ctx.fillRect(hx - hw, cy - hw * 1.3, hw * 3, hw * 2.6);
        ctx.globalCompositeOperation = 'source-over';
        setSh(ctx, 'rgba(10,4,0,0.6)', 1.2, 0, 0.6); leaf(); ctx.fillStyle = lin(ctx, hx, hy, hx + hw, hy + hh, [[0, '#ffe8b8'], [0.5, col], [1, EMBER]]); ctx.fill(); noSh(ctx);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.moveTo(hx + hw - 0.2, cy); ctx.quadraticCurveTo(hx + hw * 0.55, cy - hh * 0.22, hx + hw * 0.25, cy - hh * 0.05); ctx.quadraticCurveTo(hx + hw * 0.55, cy + 0.2, hx + hw - 0.2, cy); ctx.fill();
      } else {
        var X = r.x, Y = r.y, W = r.w, H = r.h, b = 0.5 + 0.9 * (0.5 + 0.5 * Math.sin((t || 0) * Math.PI * 2 * 0.9)), L = Math.max(3, W * 0.28);
        ctx.fillStyle = rad(ctx, X + W / 2, Y + H / 2, 0, W * 0.75, [[0, rgba(col, 0.16)], [1, rgba(col, 0.02)]]); rr(ctx, X + 0.5, Y + 0.5, W - 1, H - 1, 3); ctx.fill();
        var corners = [[X - b, Y - b, 1, 1], [X + W + b, Y - b, -1, 1], [X - b, Y + H + b, 1, -1], [X + W + b, Y + H + b, -1, -1]];
        var arcs = function (lw, c) { ctx.strokeStyle = c; ctx.lineWidth = lw; corners.forEach(function (q) { ctx.beginPath(); ctx.moveTo(q[0], q[1] + q[3] * L); ctx.lineTo(q[0], q[1] + q[3] * 2.2); ctx.quadraticCurveTo(q[0], q[1], q[0] + q[2] * 2.2, q[1]); ctx.lineTo(q[0] + q[2] * L, q[1]); ctx.stroke(); }); };
        setSh(ctx, 'rgba(10,4,0,0.55)', 1.2, 0, 0.5); arcs(1.5, rgba('#3a1e08', 0.6)); noSh(ctx);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; setSh(ctx, rgba(col, 0.9 * haloK()), 3, 0, 0); arcs(1.1, col); ctx.restore();
        arcs(0.45, '#fff2d6');
        corners.forEach(function (q) { lit.emit({ t: 'line', pts: [{ x: q[0], y: q[1] + q[3] * L }, { x: q[0], y: q[1] }, { x: q[0] + q[2] * L, y: q[1] }], w: 1, col: col, a: 0.8 }); });
      }
      ctx.restore(); ctx.globalAlpha = pa;
    },

    // path: a glowing ribbon of light: soft shadow, wide translucent amber halo, white-hot core, a rounded head, and two
    // comets of light travelling start -> end on an eased loop. The core is recorded as emissive.
    path: function (ctx, pts, t, o) {
      o = o || {}; if (!pts || pts.length < 2) return;
      var PP = o.invalid ? this.palette.overlay.pathBad : this.palette.overlay.path, T = o.tile || 16, n = pts.length, last = pts[n - 1], prev = pts[n - 2];
      var L0 = Math.hypot(last.x - prev.x, last.y - prev.y) || 1, dx = (last.x - prev.x) / L0, dy = (last.y - prev.y) / L0, headLen = T * 0.42;
      var end = { x: last.x - dx * headLen * 0.6, y: last.y - dy * headLen * 0.6 }, P2 = pts.slice(0, -1).concat([end]), rC = T * 0.45;
      var self = this, A0 = o.alpha == null ? 1 : o.alpha;
      if (A0 < 1 && !o._inLayer) {
        var bb = pts.reduce(function (b, p) { return { x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y) }; }, { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
        API.fadeLayer(ctx, A0, { x: bb.x0 - T, y: bb.y0 - T, w: bb.x1 - bb.x0 + 2 * T, h: bb.y1 - bb.y0 + 2 * T }, function (g) { self.path(g, pts, t, { tile: T, invalid: o.invalid, _inLayer: true }); });
        return;
      }
      function trace() {
        ctx.beginPath(); ctx.moveTo(P2[0].x, P2[0].y);
        for (var i = 1; i < P2.length - 1; i++) {
          var a = P2[i - 1], b = P2[i], c = P2[i + 1], l1 = Math.hypot(b.x - a.x, b.y - a.y) || 1, l2 = Math.hypot(c.x - b.x, c.y - b.y) || 1;
          var v1 = [(b.x - a.x) / l1, (b.y - a.y) / l1], v2 = [(c.x - b.x) / l2, (c.y - b.y) / l2];
          if (Math.abs(v1[0] - v2[0]) < 1e-6 && Math.abs(v1[1] - v2[1]) < 1e-6) { ctx.lineTo(b.x, b.y); continue; }
          var q = Math.min(rC, l1 / 2, l2 / 2); ctx.lineTo(b.x - v1[0] * q, b.y - v1[1] * q); ctx.quadraticCurveTo(b.x, b.y, b.x + v2[0] * q, b.y + v2[1] * q);
        }
        ctx.lineTo(P2[P2.length - 1].x, P2[P2.length - 1].y);
      }
      var nx = -dy, ny = dx, hw = T * 0.3, tip = { x: last.x + dx * T * 0.14, y: last.y + dy * T * 0.14 }, hb = { x: tip.x - dx * headLen, y: tip.y - dy * headLen };
      function head(grow) { var g2 = grow || 0; ctx.beginPath(); ctx.moveTo(tip.x + dx * g2, tip.y + dy * g2); ctx.quadraticCurveTo(hb.x + nx * (hw + g2) * 0.55 + dx * headLen * 0.35, hb.y + ny * (hw + g2) * 0.55 + dy * headLen * 0.35, hb.x + nx * (hw + g2), hb.y + ny * (hw + g2)); ctx.quadraticCurveTo(hb.x + dx * headLen * 0.2, hb.y + dy * headLen * 0.2, hb.x - nx * (hw + g2), hb.y - ny * (hw + g2)); ctx.quadraticCurveTo(hb.x - nx * (hw + g2) * 0.55 + dx * headLen * 0.35, hb.y - ny * (hw + g2) * 0.55 + dy * headLen * 0.35, tip.x + dx * g2, tip.y + dy * g2); ctx.closePath(); }
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // 1. soft shadow on the ground (offset down-right, away from the key light)
      ctx.save(); ctx.translate(0.8, 1.4); ctx.strokeStyle = 'rgba(8,4,20,0.35)'; setSh(ctx, 'rgba(8,4,20,0.5)', 2.5, 0, 0); ctx.lineWidth = T * 0.24; trace(); ctx.stroke(); head(); ctx.fillStyle = 'rgba(8,4,20,0.35)'; ctx.fill(); noSh(ctx); ctx.restore();
      // 2. halo
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(PP.glow, 0.22 * haloK()); ctx.lineWidth = T * 0.62; trace(); ctx.stroke();
      ctx.strokeStyle = rgba(PP.glow, 0.32 * haloK()); ctx.lineWidth = T * 0.36; trace(); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      // 3. body: dark amber casing, warm mid, white-hot core
      ctx.strokeStyle = PP.dark; ctx.lineWidth = T * 0.24; trace(); ctx.stroke(); ctx.fillStyle = PP.dark; head(0.8); ctx.fill();
      ctx.strokeStyle = PP.mid; ctx.lineWidth = T * 0.17; trace(); ctx.stroke(); ctx.fillStyle = lin(ctx, hb.x, hb.y, tip.x, tip.y, [[0, PP.mid], [1, PP.light]]); head(); ctx.fill();
      ctx.strokeStyle = PP.light; ctx.lineWidth = T * 0.09; trace(); ctx.stroke();
      ctx.strokeStyle = PP.core; ctx.lineWidth = T * 0.04; trace(); ctx.stroke();
      // origin: a small lit ring
      ctx.strokeStyle = PP.light; ctx.lineWidth = 0.8; circ(ctx, pts[0].x, pts[0].y, T * 0.17); ctx.stroke(); ctx.fillStyle = PP.core; circ(ctx, pts[0].x, pts[0].y, T * 0.07); ctx.fill();
      // 4. comets: two eased light pulses travelling along the path (1.6 s loop)
      var segs = [], tot = 0, i; for (i = 1; i < P2.length; i++) { var sl = Math.hypot(P2[i].x - P2[i - 1].x, P2[i].y - P2[i - 1].y); segs.push(sl); tot += sl; }
      var at = function (dist) { var gi = 0; while (gi < segs.length - 1 && dist > segs[gi]) { dist -= segs[gi]; gi++; } var A = P2[gi], B = P2[gi + 1], u = segs[gi] ? clamp(dist / segs[gi], 0, 1) : 0; return { x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u }; };
      ctx.globalCompositeOperation = 'lighter';
      [0, 0.5].forEach(function (off) {
        var ph = (((t || 0) / 1.6) + off) % 1, d = API.ease.inOutQuad(ph) * tot, p = at(d), al = Math.sin(Math.PI * ph);
        ctx.fillStyle = rad(ctx, p.x, p.y, 0, T * 0.4, [[0, rgba('#ffffff', 0.9 * al)], [0.3, rgba(PP.glow, 0.5 * al)], [1, rgba(PP.glow, 0)]]); ctx.fillRect(p.x - T * 0.4, p.y - T * 0.4, T * 0.8, T * 0.8);
        lit.emit({ t: 'glow', x: p.x, y: p.y, r: T * 0.5, col: PP.glow, a: 0.8 * al });
      });
      ctx.restore();
      lit.emit({ t: 'line', pts: P2, w: T * 0.12, col: PP.glow, a: 0.55 });
    },

    // tile: one cell of the painted ground. The colour field is continuous across cells; brush dabs and tufts sit on top.
    tile: function (ctx, r, kind, t) {
      var u = r.w / 16, x = r.x, y = r.y, w = r.w, h = r.h, k = palette.ramps[kind] ? kind : kind === 'bridge' ? 'bridge' : 'grass';
      ctx.save();
      if (kind === 'bridge') { paintField(ctx, r, 'water', t || 0); }
      else paintField(ctx, r, k === 'bridge' ? 'grass' : k, kind === 'water' ? t || 0 : 0);
      var R = palette.ramps[k] || palette.ramps.grass, c = function (i, a) { return 'rgba(' + R[i].map(Math.round).join(',') + ',' + a + ')'; };
      if (kind === 'grass' || kind === 'forest' || kind === 'hill') {
        dabs(ctx, r, 7, [c(2, 0.35), c(0, 0.3), c(3, 0.22), 'rgba(255,240,200,0.06)'], 3, 2.2);
        var nt = kind === 'forest' ? 6 : 3;
        for (var i = 0; i < nt; i++) {
          if (kind !== 'forest' && h3(x, y, 40 + i) > 0.6) continue;
          var gx = x + (0.12 + 0.76 * h3(x, y, 50 + i)) * w, gy = y + (0.3 + 0.62 * h3(y, x, 60 + i)) * h;
          tuft(ctx, gx, gy, u, c(0, 0.9), c(2, 0.95), 0.75 + 0.4 * h3(x, i, 70));
        }
        if (kind === 'grass' && h3(x, y, 80) < 0.14) {   // a few tiny flowers
          var fx = x + (0.2 + 0.6 * h3(x, y, 81)) * w, fy = y + (0.2 + 0.6 * h3(x, y, 82)) * h, fc = h3(x, y, 83) < 0.5 ? '#f4eadc' : '#d8c4f0';
          ctx.fillStyle = fc; [[0, -0.6], [0.6, 0], [0, 0.6], [-0.6, 0]].forEach(function (q) { circ(ctx, fx + q[0] * u, fy + q[1] * u, 0.45 * u); ctx.fill(); });
          ctx.fillStyle = '#ffd36b'; circ(ctx, fx, fy, 0.3 * u); ctx.fill();
        }
        if (kind === 'forest') { ctx.fillStyle = 'rgba(14,30,22,0.35)'; ell(ctx, x + w / 2, y + h * 0.6, w * 0.45, h * 0.35); ctx.fill(); }
      } else if (kind === 'water' || kind === 'bridge') {
        // moving highlights: soft curved glints that drift with t, plus a cool deep edge on the far side
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (var j = 0; j < 3; j++) {
          var ph = (t || 0) * 0.55 + h3(x, y, j) * 6.28, wx = x + w * (0.15 + 0.7 * h3(x, y, j + 5)) + Math.sin(ph) * 1.4 * u, wy = y + h * (0.2 + 0.3 * j) + Math.cos(ph * 0.7) * 0.6 * u;
          ctx.strokeStyle = 'rgba(170,230,240,' + (0.16 + 0.14 * Math.sin(ph * 1.3)).toFixed(3) + ')'; ctx.lineWidth = 0.55 * u;
          ctx.beginPath(); ctx.moveTo(wx - 2.4 * u, wy); ctx.quadraticCurveTo(wx, wy - 0.9 * u, wx + 2.4 * u, wy); ctx.stroke();
        }
        var sp = ((t || 0) * 0.7 + h3(x, y, 9)) % 1;
        if (h3(x, y, 10) < 0.45) {   // a sparkle that blinks
          var sx = x + w * (0.2 + 0.6 * h3(x, y, 11)), sy = y + h * (0.2 + 0.6 * h3(x, y, 12)), sa = Math.pow(Math.sin(Math.PI * sp), 6);
          ctx.fillStyle = rad(ctx, sx, sy, 0, 1.6 * u, [[0, rgba('#ffffff', 0.8 * sa)], [1, rgba('#bfefff', 0)]]); ctx.fillRect(sx - 2 * u, sy - 2 * u, 4 * u, 4 * u);
          if (sa > 0.05) lit.emit({ t: 'glow', x: sx, y: sy, r: 1.8 * u, col: '#cdf4ff', a: 0.7 * sa });
        }
        ctx.restore();
        if (kind === 'bridge') {
          ctx.fillStyle = 'rgba(8,4,20,0.35)'; rr(ctx, x - 0.2, y + 2.6 * u, w + 0.4, h - 4.2 * u, 1); ctx.fill();
          ctx.fillStyle = lin(ctx, 0, y + 2, 0, y + h - 2, [[0, '#a8805a'], [1, '#6e4a30']]); rr(ctx, x - 0.2, y + 2 * u, w + 0.4, h - 4.6 * u, 1.2 * u); ctx.fill();
          ctx.strokeStyle = 'rgba(40,22,12,0.55)'; ctx.lineWidth = 0.35 * u; for (var pl = 1; pl < 5; pl++) { ctx.beginPath(); ctx.moveTo(x + pl * w / 5, y + 2.4 * u); ctx.lineTo(x + pl * w / 5, y + h - 3 * u); ctx.stroke(); }
          ctx.fillStyle = 'rgba(255,230,190,0.25)'; ctx.fillRect(x, y + 2 * u, w, 0.5 * u);
        }
      } else if (kind === 'mountain' || kind === 'wall') {
        dabs(ctx, r, 6, [c(2, 0.4), c(0, 0.4)], 5, 2.6);
        // a soft-shaded rock outcrop
        var mx = x + w / 2, mb = y + h * 0.86;
        ctx.fillStyle = lin(ctx, mx - 6 * u, y + 2 * u, mx + 6 * u, mb, [[0, mix('#c9c4d4', '#8e8a9c', 0.2)], [0.5, '#7c7888'], [1, '#3e3a4c']]);
        ctx.beginPath(); ctx.moveTo(mx - 7 * u, mb); ctx.quadraticCurveTo(mx - 6 * u, y + 5 * u, mx - 1 * u, y + 2.2 * u); ctx.quadraticCurveTo(mx + 3 * u, y + 1.6 * u, mx + 5 * u, y + 6 * u); ctx.quadraticCurveTo(mx + 7.5 * u, mb - 3 * u, mx + 7 * u, mb); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,250,240,0.25)'; ctx.beginPath(); ctx.moveTo(mx - 5 * u, y + 6 * u); ctx.quadraticCurveTo(mx - 3 * u, y + 2.6 * u, mx, y + 2.6 * u); ctx.quadraticCurveTo(mx - 2.5 * u, y + 4 * u, mx - 5 * u, y + 6 * u); ctx.fill();
      } else {
        dabs(ctx, r, 6, [c(2, 0.3), c(0, 0.28), c(3, 0.2)], 7, 2.4);
        if (kind === 'road') { ctx.fillStyle = 'rgba(60,40,24,0.25)'; [[4, 5], [11, 9], [7, 12]].forEach(function (q) { ell(ctx, x + q[0] * u, y + q[1] * u, 0.9 * u, 0.6 * u); ctx.fill(); }); }
        if (kind === 'fort' || kind === 'floor') { ctx.strokeStyle = 'rgba(20,14,30,0.25)'; ctx.lineWidth = 0.4 * u; rr(ctx, x + 1.5 * u, y + 1.5 * u, w - 3 * u, h - 3 * u, 1.5 * u); ctx.stroke(); }
      }
      ctx.restore();
    },

    // prop(ctx, cellRect, kind, t, {lights, light, seed}): soft-shaded standing objects; light carriers emit
    prop: function (ctx, r, kind, t, o) {
      o = o || {}; var ls = stdLights(o.lights || []); lit.seeLights(o.lights);
      var u = r.w / 16, cx = r.x + r.w / 2, fy = r.y + r.h - 2 * u, seed = o.seed || 0, T = t || 0, L = o.light ? (API.normLight ? API.normLight(o.light) : o.light) : null;
      var box = { x: r.x - 4 * u, y: r.y - r.h - 2 * u, w: r.w + 8 * u, h: r.h * 2 + 4 * u };
      if (kind === 'tree') {
        groundShadow(ctx, cx, fy, 7 * u, ls, 0.9);
        lit.occlude({ x: cx - 2 * u, y: fy - 3 * u, w: 4 * u, h: 3 * u });
        litLayer(ctx, { x: r.x - 6 * u, y: r.y - r.h - 6 * u, w: r.w + 12 * u, h: r.h * 2 + 8 * u }, ls, fy, function (g) {
          g.fillStyle = lin(g, cx - 2 * u, 0, cx + 2 * u, 0, [[0, '#6a4a34'], [1, '#2e1e18']]); rr(g, cx - 1.4 * u, fy - 9 * u, 2.8 * u, 9 * u, 1 * u); g.fill();
          var blobs = [[-4.2, -11, 5.2, 0], [4, -12, 5, 1], [0, -16.5, 6, 2], [-2.5, -21, 4.4, 3], [2.6, -20, 4.2, 4]];
          blobs.forEach(function (b, i) {
            var bx = cx + b[0] * u + (h3(seed, i, 1) - 0.5) * u, by = fy + b[1] * u, br = b[2] * u, sway = Math.sin(T * 0.8 + seed + i) * 0.25 * u;
            g.fillStyle = rad(g, bx - br * 0.35 + sway, by - br * 0.4, br * 0.1, br * 1.15, [[0, '#7fae62'], [0.5, '#4b7f48'], [1, '#22412e']]); circ(g, bx + sway, by, br); g.fill();
          });
          g.fillStyle = 'rgba(200,240,160,0.18)'; [[-2, -19], [1, -17.5], [-4.5, -13]].forEach(function (q) { ell(g, cx + q[0] * u, fy + q[1] * u, 1.6 * u, 0.8 * u, -0.4); g.fill(); });
        });
        return;
      }
      if (kind === 'bush') {
        groundShadow(ctx, cx, fy, 6.5 * u, ls, 0.85);
        lit.occlude({ x: cx - 5 * u, y: fy - 4 * u, w: 10 * u, h: 4 * u });
        litLayer(ctx, box, ls, fy, function (g) {
          [[-3.6, -2.6, 3.6], [3.4, -2.4, 3.8], [0, -4.6, 4.4], [-1.6, -1.6, 3.4], [2, -1.2, 3.2]].forEach(function (b, i) {
            var bx = cx + b[0] * u, by = fy + b[1] * u, br = b[2] * u;
            g.fillStyle = rad(g, bx - br * 0.4, by - br * 0.5, br * 0.1, br * 1.1, [[0, '#8cbc6a'], [0.55, '#4f8a4a'], [1, '#1f3f2c']]); circ(g, bx, by, br); g.fill();
          });
          g.fillStyle = '#d65a6a'; [[-2.5, -4], [2.4, -5.2], [0.6, -2]].forEach(function (q, i) { if (h3(seed, i, 9) < 0.7) { circ(g, cx + q[0] * u, fy + q[1] * u, 0.55 * u); g.fill(); } });
          g.fillStyle = 'rgba(230,255,200,0.22)'; ell(g, cx - 1.4 * u, fy - 7 * u, 2 * u, 0.9 * u, -0.3); g.fill();
        });
        return;
      }
      if (kind === 'brazier') {
        groundShadow(ctx, cx, fy, 5.5 * u, [], 0.9);
        var fl = L ? clamp(L.intensity == null ? 1 : L.intensity, 0, 1.4) : 0.8, by0 = fy - 7 * u;
        // light on the ground under it (2D fallback; J-01 draws the real pool)
        if (!lit.post) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rad(ctx, cx, fy - u, 0, 9 * u, [[0, rgba('#ffb060', 0.35 * fl)], [1, rgba('#ffb060', 0)]]); ctx.fillRect(cx - 9 * u, fy - 10 * u, 18 * u, 18 * u); ctx.restore(); }
        litLayer(ctx, box, [], fy, function (g) {
          g.strokeStyle = '#2a2230'; g.lineWidth = 0.9 * u; g.lineCap = 'round';
          [[-3.6, 0], [3.6, 0], [0, 0.6]].forEach(function (q) { g.beginPath(); g.moveTo(cx + q[0] * 0.55 * u, by0 + 1.5 * u); g.lineTo(cx + q[0] * u, fy + q[1] * u); g.stroke(); });
          g.fillStyle = lin(g, cx - 5 * u, 0, cx + 5 * u, 0, [[0, '#4a4252'], [0.35, '#6e6474'], [1, '#1e1824']]);
          g.beginPath(); g.moveTo(cx - 5 * u, by0 - 2 * u); g.quadraticCurveTo(cx, by0 + 4.5 * u, cx + 5 * u, by0 - 2 * u); g.closePath(); g.fill();
          g.fillStyle = rad(g, cx, by0 - 2 * u, 0, 5 * u, [[0, '#fff0b0'], [0.4, '#ff9a3c'], [1, '#7a2410']]); ell(g, cx, by0 - 2 * u, 5 * u, 1.3 * u); g.fill();
        }, { noRim: true, noTint: true });
        // flame: three nested soft teardrops, swaying on the game clock; sparks rise
        var ph = T * 7 + seed;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rad(ctx, cx, by0 - 6 * u, 0, 10 * u, [[0, rgba('#ff9a40', 0.5 * fl * haloK())], [1, rgba('#ff7020', 0)]]); ctx.fillRect(cx - 10 * u, by0 - 16 * u, 20 * u, 20 * u);
        ctx.restore();
        [[7.2, 11 * fl, '#ff5a1e', 0.9], [5.2, 8.6 * fl, '#ffa236', 0.95], [3, 5.6 * fl, '#fff2b8', 1]].forEach(function (f, i) {
          flameShape(ctx, cx, by0 - 1.6 * u, f[0] * u, f[1] * u, ph + i * 0.7); ctx.globalAlpha = f[3]; ctx.fillStyle = f[2]; ctx.fill(); ctx.globalAlpha = 1;
          lit.emit({ t: 'flame', x: cx, y: by0 - 1.6 * u, w: f[0] * u, h: f[1] * u, ph: ph + i * 0.7, col: f[2], a: 0.75 });
        });
        for (var s2 = 0; s2 < 5; s2++) {
          var sp = ((T * 0.9 + h3(seed, s2, 3)) % 1), sx2 = cx + (h3(seed, s2, 4) - 0.5) * 6 * u + Math.sin(T * 3 + s2) * 1.2 * u, sy2 = by0 - 4 * u - sp * 14 * u, sa2 = Math.sin(Math.PI * sp) * 0.9;
          ctx.fillStyle = rgba('#ffd28a', sa2); circ(ctx, sx2, sy2, 0.45 * u); ctx.fill(); lit.emit({ t: 'dot', x: sx2, y: sy2, r: 0.6 * u, col: '#ffb860', a: sa2 });
        }
        lit.emit({ t: 'glow', x: cx, y: by0 - 4 * u, r: 9 * u, col: '#ff9a40', a: 0.55 * fl });
        return;
      }
      if (kind === 'lamp') {
        groundShadow(ctx, cx, fy, 4 * u, [], 0.8);
        var li = L ? clamp(L.intensity == null ? 1 : L.intensity, 0, 1.4) : 0.8, ly = fy - 17 * u;
        if (!lit.post) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rad(ctx, cx, fy - u, 0, 8 * u, [[0, rgba('#ffcf7a', 0.28 * li)], [1, rgba('#ffcf7a', 0)]]); ctx.fillRect(cx - 8 * u, fy - 9 * u, 16 * u, 16 * u); ctx.restore(); }
        litLayer(ctx, box, [], fy, function (g) {
          g.fillStyle = lin(g, cx - u, 0, cx + u, 0, [[0, '#5a4a46'], [1, '#221a20']]); rr(g, cx - 0.7 * u, ly + 3 * u, 1.4 * u, fy - ly - 3 * u, 0.5 * u); g.fill();
          g.fillStyle = '#2a2230'; rr(g, cx - 2.4 * u, fy - 1.2 * u, 4.8 * u, 1.6 * u, 0.6 * u); g.fill();
          g.fillStyle = lin(g, cx - 3 * u, ly, cx + 3 * u, ly + 6 * u, [[0, '#fff6d0'], [0.5, '#ffc46b'], [1, '#e07a2a']]); rr(g, cx - 2.3 * u, ly - 1.5 * u, 4.6 * u, 5 * u, 1 * u); g.fill();
          g.strokeStyle = '#2a2230'; g.lineWidth = 0.6 * u; rr(g, cx - 2.3 * u, ly - 1.5 * u, 4.6 * u, 5 * u, 1 * u); g.stroke(); g.beginPath(); g.moveTo(cx, ly - 1.5 * u); g.lineTo(cx, ly + 3.5 * u); g.stroke();
          g.fillStyle = '#3a3040'; g.beginPath(); g.moveTo(cx - 3.2 * u, ly - 1.4 * u); g.lineTo(cx, ly - 4 * u); g.lineTo(cx + 3.2 * u, ly - 1.4 * u); g.closePath(); g.fill();
        }, { noRim: true, noTint: true });
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rad(ctx, cx, ly + u, 0, 9 * u, [[0, rgba('#ffcf7a', 0.55 * li * haloK())], [1, rgba('#ffcf7a', 0)]]); ctx.fillRect(cx - 9 * u, ly - 8 * u, 18 * u, 18 * u); ctx.restore();
        lit.emit({ t: 'glow', x: cx, y: ly + u, r: 6 * u, col: '#ffd890', a: 0.9 * li }); lit.emit({ t: 'dot', x: cx, y: ly + u, r: 1.6 * u, col: '#fff2c8', a: 1 });
        return;
      }
      if (kind === 'crystal') {
        groundShadow(ctx, cx, fy, 5 * u, [], 0.8);
        var ci = L ? clamp(L.intensity == null ? 1 : L.intensity, 0, 1.4) : 0.8, pulse = 0.85 + 0.15 * Math.sin(T * 2.2 + seed);
        if (!lit.post) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rad(ctx, cx, fy - u, 0, 9 * u, [[0, rgba('#7ae8ff', 0.3 * ci)], [1, rgba('#7ae8ff', 0)]]); ctx.fillRect(cx - 9 * u, fy - 10 * u, 18 * u, 18 * u); ctx.restore(); }
        var shards = [[-3.2, 7.5, 2.2, -0.32], [3.4, 6.5, 2, 0.36], [0, 12.5, 2.8, 0.04]];
        litLayer(ctx, box, [], fy, function (g) {
          g.fillStyle = '#3a3448'; ell(g, cx, fy - 0.6 * u, 5.4 * u, 1.8 * u); g.fill();
          shards.forEach(function (s) {
            g.save(); g.translate(cx + s[0] * u, fy - 0.8 * u); g.rotate(s[3]); var hh = s[1] * u, ww = s[2] * u;
            g.fillStyle = lin(g, -ww, 0, ww, 0, [[0, '#a8f4ff'], [0.45, '#18b4e0'], [1, '#08386a']]); g.beginPath(); g.moveTo(-ww, 0); g.lineTo(-ww, -hh * 0.72); g.lineTo(0, -hh); g.lineTo(ww, -hh * 0.72); g.lineTo(ww, 0); g.closePath(); g.fill();
            g.fillStyle = 'rgba(220,250,255,0.4)'; g.beginPath(); g.moveTo(-ww * 0.6, -hh * 0.1); g.lineTo(-ww * 0.6, -hh * 0.7); g.lineTo(0, -hh * 0.93); g.lineTo(-ww * 0.1, -hh * 0.7); g.closePath(); g.fill();
            g.restore();
          });
        }, { noRim: true, noTint: true });
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rad(ctx, cx, fy - 6 * u, 0, 10 * u, [[0, rgba('#7ae8ff', 0.5 * ci * pulse * haloK())], [1, rgba('#7ae8ff', 0)]]); ctx.fillRect(cx - 10 * u, fy - 16 * u, 20 * u, 20 * u); ctx.restore();
        shards.forEach(function (s) { lit.emit({ t: 'line', pts: [{ x: cx + s[0] * u, y: fy - u }, { x: cx + s[0] * u + Math.sin(s[3]) * s[1] * u, y: fy - u - Math.cos(s[3]) * s[1] * u }], w: s[2] * 0.8 * u, col: '#7ae8ff', a: 0.35 * pulse }); });
        lit.emit({ t: 'glow', x: cx, y: fy - 6 * u, r: 8 * u, col: '#4fd6ff', a: 0.35 * ci * pulse });
        return;
      }
      // stone (and anything unknown): a rounded mossy boulder
      groundShadow(ctx, cx, fy, 6.5 * u, ls, 1);
      lit.occlude({ x: cx - 5 * u, y: fy - 5 * u, w: 10 * u, h: 5 * u });
      litLayer(ctx, box, ls, fy, function (g) {
        g.fillStyle = lin(g, cx - 6 * u, fy - 10 * u, cx + 6 * u, fy, [[0, '#b4aec2'], [0.45, '#7a7488'], [1, '#2e2a3a']]);
        g.beginPath(); g.moveTo(cx - 6.5 * u, fy); g.bezierCurveTo(cx - 7.5 * u, fy - 6 * u, cx - 3 * u, fy - 10.5 * u, cx + 0.5 * u, fy - 10 * u); g.bezierCurveTo(cx + 5 * u, fy - 9.5 * u, cx + 7.5 * u, fy - 5 * u, cx + 6.5 * u, fy); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(30,24,40,0.45)'; g.lineWidth = 0.45 * u; g.beginPath(); g.moveTo(cx + 1 * u, fy - 9.6 * u); g.quadraticCurveTo(cx + 2 * u, fy - 5 * u, cx + 0.5 * u, fy - 1 * u); g.stroke();
        g.fillStyle = lin(g, 0, fy - 10.5 * u, 0, fy - 6 * u, [[0, '#8ab868'], [1, 'rgba(70,110,60,0)']]);
        g.beginPath(); g.moveTo(cx - 5.8 * u, fy - 6 * u); g.bezierCurveTo(cx - 4 * u, fy - 10.4 * u, cx + 3 * u, fy - 11 * u, cx + 5.4 * u, fy - 7 * u); g.quadraticCurveTo(cx, fy - 8.4 * u, cx - 5.8 * u, fy - 6 * u); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.22)'; ell(g, cx - 2.6 * u, fy - 6.6 * u, 1.8 * u, 0.8 * u, -0.5); g.fill();
      });
    },

    // unitToken(ctx, rect, unit, t): a soft-shaded small figure (feet on the rect's bottom), rim-lit by the nearest light
    unitToken: function (ctx, r, un, t) {
      un = un || {}; var P = this.palette, team = un.team === 'b' || un.team === 'n' ? un.team : 'a', kind = un.kind || 'fighter', T = t || 0;
      var ls = stdLights(un.lights || []); if (un.lights && !un.noShadow) lit.seeLights(un.lights);
      var u = Math.min(r.w / 16, r.h / 24), cx = r.x + r.w / 2, base = r.y + r.h - (un.noShadow ? 0.5 : 1.2) * u, f = un.facing === -1 ? -1 : 1;
      var TL = P.team[team + 'Light'], TM = P.team[team], TD = P.team[team + 'Dark'], undead = team === 'b', wraith = undead && kind === 'mage';
      var bob = un.selected ? -0.8 * u * (0.5 + 0.5 * Math.sin(T * Math.PI * 2 * this.motion.bobHz)) : 0, br = 1 + this.motion.breathe.amp * Math.sin(T * Math.PI * 2 * this.motion.breathe.hz + (cx + r.y) * 0.1);
      var pa = ctx.globalAlpha;
      if (!un.noShadow) {
        if (un.selected) {   // a lit ring under the selected unit
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; setSh(ctx, rgba(TL, 0.9 * haloK()), 2.5, 0, 0); ctx.strokeStyle = rgba(TL, 0.85); ctx.lineWidth = 0.8 * u;
          ell(ctx, cx, base, 6.6 * u, 2.4 * u); ctx.stroke(); noSh(ctx); ctx.restore();
          lit.emit({ t: 'ring', x: cx, y: base, rx: 6.6 * u, ry: 2.4 * u, w: 1 * u, col: TL, a: 0.7 });
        }
        groundShadow(ctx, cx, base, 5 * u, ls, 0.95);
        lit.occlude({ x: cx - 3.5 * u, y: base - 4.5 * u, w: 7 * u, h: 4 * u });
      }
      var skinC = undead ? (wraith ? P.skin.bWraith : P.skin.b) : P.skin[team] || P.skin.a;
      var box = { x: r.x - 6 * u, y: r.y - 6 * u, w: r.w + 12 * u, h: r.h + 8 * u };
      litLayer(ctx, box, un.noShadow ? [] : ls, base, function (g) {
        g.save(); g.translate(cx, base + bob); g.scale(f, 1);
        var Y = function (v) { return -v * u; }, X = function (v) { return v * u; };
        var bodyGrad = function (c1, c2, c3) { return lin(g, X(-5), Y(16), X(5), Y(4), [[0, c1], [0.5, c2], [1, c3]]); };
        // legs (hidden under robes)
        if (kind !== 'mage') { g.fillStyle = '#2a2236'; rr(g, X(-2.6), Y(6), X(2.2), X(6), X(0.9)); g.fill(); rr(g, X(0.5), Y(6), X(2.2), X(6), X(0.9)); g.fill(); g.fillStyle = '#4a3a3a'; rr(g, X(-2.9), Y(1.4), X(2.6), X(1.6), X(0.7)); g.fill(); rr(g, X(0.4), Y(1.4), X(2.6), X(1.6), X(0.7)); g.fill(); }
        // body
        g.save(); g.translate(0, Y(10)); g.scale(1, br); g.translate(0, -Y(10));
        if (kind === 'mage') {   // long robe; the wraith's hem is ragged
          g.fillStyle = wraith ? bodyGrad('#9a7ab8', '#4e3070', '#1a0c2c') : bodyGrad(TL, TM, TD); g.beginPath(); g.moveTo(X(-3.4), Y(15)); g.quadraticCurveTo(X(-5.8), Y(6), X(-5.6), Y(0.4));
          if (wraith) { for (var z = 0; z < 5; z++) { g.lineTo(X(-5.6 + (z + 0.5) * 2.24), Y(z % 2 ? 0.2 : 2.4)); } } else g.quadraticCurveTo(0, Y(-0.6), X(5.6), Y(0.4));
          g.lineTo(X(5.6), Y(0.4)); g.quadraticCurveTo(X(5.8), Y(6), X(3.4), Y(15)); g.closePath(); g.fill();
          g.fillStyle = rgba(wraith ? '#c89aff' : '#ffe2a8', 0.55); rr(g, X(-0.5), Y(14), X(1), X(13), X(0.5)); g.fill();
        } else {
          var top = kind === 'knight' ? '#c8ccd8' : kind === 'archer' ? '#5e7a4a' : undead ? '#5a4e5e' : '#8a5e3e', mid = kind === 'knight' ? '#868ca0' : kind === 'archer' ? '#3e5634' : undead ? '#3a3040' : '#5e3e28', bot = kind === 'knight' ? '#3e4254' : '#24182a';
          g.fillStyle = bodyGrad(top, mid, bot); g.beginPath(); g.moveTo(X(-4.4), Y(15)); g.quadraticCurveTo(X(-5.4), Y(10), X(-4.6), Y(5)); g.lineTo(X(4.6), Y(5)); g.quadraticCurveTo(X(5.4), Y(10), X(4.4), Y(15)); g.closePath(); g.fill();
          g.fillStyle = bodyGrad(TL, TM, TD); g.beginPath(); g.moveTo(X(-2.4), Y(14.6)); g.lineTo(X(2.4), Y(14.6)); g.lineTo(X(3), Y(4.4)); g.quadraticCurveTo(0, Y(3.2), X(-3), Y(4.4)); g.closePath(); g.fill();   // tabard / sash
          g.fillStyle = '#2a1e1a'; rr(g, X(-4.6), Y(8), X(9.2), X(1.3), X(0.5)); g.fill(); g.fillStyle = '#e8c27a'; rr(g, X(-0.8), Y(8.1), X(1.6), X(1.5), X(0.3)); g.fill();
          if (kind === 'knight') { g.fillStyle = bodyGrad('#e4e8f0', '#9aa0b4', '#4a4e60'); ell(g, X(-4.4), Y(13.8), X(2.2), X(1.6)); g.fill(); ell(g, X(4.4), Y(13.8), X(2.2), X(1.6)); g.fill(); }
        }
        g.restore();
        // back arm, head
        var hy = Y(18.6 + (br - 1) * 6);
        g.fillStyle = wraith ? rgba(TD, 1) : skinC; circ(g, 0, hy, X(3.5)); g.fill();
        g.fillStyle = rad(g, X(-1.2), hy - X(1.4), X(0.2), X(4), [[0, 'rgba(255,255,255,0.28)'], [1, 'rgba(255,255,255,0)']]); circ(g, 0, hy, X(3.5)); g.fill();
        if (kind === 'knight') {
          g.fillStyle = bodyGrad('#eef0f6', '#a0a6ba', '#4a4e62'); g.beginPath(); g.arc(0, hy, X(3.9), Math.PI * 1.02, Math.PI * 1.98); g.lineTo(X(3.9), hy + X(1)); g.lineTo(X(-3.9), hy + X(1)); g.closePath(); g.fill();
          g.fillStyle = '#1a1622'; rr(g, X(0.2), hy - X(0.2), X(3.6), X(0.9), X(0.4)); g.fill();
          g.fillStyle = TM; g.beginPath(); g.moveTo(X(-0.6), hy - X(3.8)); g.quadraticCurveTo(X(-5), hy - X(6.4), X(-6.4), hy - X(2)); g.quadraticCurveTo(X(-3.4), hy - X(3.8), X(0.6), hy - X(3.4)); g.closePath(); g.fill();
        } else if (kind === 'mage') {
          g.fillStyle = wraith ? bodyGrad('#a888c4', '#5a3a80', '#22123a') : bodyGrad(TL, TM, TD); g.beginPath(); g.moveTo(X(-4.4), hy + X(1.8)); g.quadraticCurveTo(X(-4.6), hy - X(4), X(-1), hy - X(7.4)); g.quadraticCurveTo(X(1.6), hy - X(5), X(4.4), hy + X(1.8)); g.quadraticCurveTo(0, hy + X(0.4), X(-4.4), hy + X(1.8)); g.fill();
          g.fillStyle = 'rgba(12,6,22,0.55)'; ell(g, X(0.9), hy + X(0.3), X(2.6), X(2.2)); g.fill();   // face in the hood's shadow
          if (!wraith) { g.fillStyle = '#e8e2d6'; g.beginPath(); g.moveTo(X(-1.2), hy + X(2)); g.quadraticCurveTo(X(0.8), hy + X(6), X(2.4), hy + X(1.6)); g.fill(); }
        } else if (kind === 'archer') {
          g.fillStyle = bodyGrad('#7e9a5e', '#4a6a3a', '#24361e'); g.beginPath(); g.arc(0, hy, X(3.9), Math.PI * 0.9, Math.PI * 2.1); g.quadraticCurveTo(X(-2), hy - X(1.4), X(-3.9), hy + X(1.4)); g.fill();
        } else {   // fighter / monster: hair or horns
          if (undead || kind === 'monster') { g.fillStyle = '#d8ccb4'; [[-2.4, -1], [2.4, 1]].forEach(function (q) { g.beginPath(); g.moveTo(X(q[0]), hy - X(2.4)); g.quadraticCurveTo(X(q[0] * 1.9), hy - X(4.4), X(q[0] * 1.7), hy - X(6.6)); g.quadraticCurveTo(X(q[0] * 1.2), hy - X(4.4), X(q[0] * 0.5), hy - X(3)); g.fill(); }); }
          else { g.fillStyle = P.skin.hair; g.beginPath(); g.arc(0, hy, X(3.7), Math.PI * 1.05, Math.PI * 1.95); g.quadraticCurveTo(X(1), hy - X(1.6), X(-3.6), hy - X(0.2)); g.fill(); }
        }
        // eyes: dark for the living, glowing for the undead
        var eyeC = undead ? (wraith ? P.skin.eyeW : P.skin.eyeB) : '#1a1420';
        if (kind !== 'knight' || undead) { g.fillStyle = eyeC; [0.4, 2.2].forEach(function (ex) { ell(g, X(ex), hy + X(0.2), X(0.55), X(undead ? 0.4 : 0.7)); g.fill(); }); }
        // weapon / off-hand
        if (kind === 'knight') {
          g.fillStyle = lin(g, X(-7), Y(14), X(-2), Y(6), [[0, TL], [0.6, TM], [1, TD]]); ell(g, X(-5.2), Y(10), X(3.2), X(3.8)); g.fill();
          g.strokeStyle = '#e8c27a'; g.lineWidth = X(0.6); ell(g, X(-5.2), Y(10), X(3.2), X(3.8)); g.stroke(); g.fillStyle = '#ffe2a8'; circ(g, X(-5.2), Y(10), X(0.9)); g.fill();
          g.save(); g.translate(X(5.2), Y(8.5)); g.rotate(-0.35); g.fillStyle = lin(g, X(-0.8), 0, X(0.8), 0, [[0, '#ffffff'], [0.5, '#c4cad8'], [1, '#6a7084']]); g.beginPath(); g.moveTo(X(-0.75), 0); g.lineTo(X(-0.75), Y(9)); g.lineTo(0, Y(10.6)); g.lineTo(X(0.75), Y(9)); g.lineTo(X(0.75), 0); g.closePath(); g.fill();
          g.fillStyle = '#e8c27a'; rr(g, X(-2), X(-0.2), X(4), X(1), X(0.4)); g.fill(); g.fillStyle = '#4a2e1e'; rr(g, X(-0.5), X(0.6), X(1), X(2.4), X(0.4)); g.fill(); g.restore();
        } else if (kind === 'mage') {
          g.strokeStyle = lin(g, 0, Y(0), 0, Y(20), [[0, '#3e2a1c'], [1, '#8a6040']]); g.lineWidth = X(0.9); g.lineCap = 'round'; g.beginPath(); g.moveTo(X(5), Y(0.5)); g.lineTo(X(5.6), Y(19)); g.stroke();
          var oc = wraith ? '#c890ff' : '#8fe0ff'; g.fillStyle = rad(g, X(5.4), Y(20.6), X(0.2), X(2), [[0, '#ffffff'], [0.5, oc], [1, mix(oc, '#000000', 0.4)]]); circ(g, X(5.6), Y(20.4), X(1.7)); g.fill();
        } else if (kind === 'archer') {
          g.strokeStyle = '#6a4228'; g.lineWidth = X(0.8); g.beginPath(); g.arc(X(3), Y(10), X(6), -1.15, 1.15); g.stroke();
          g.strokeStyle = 'rgba(240,230,210,0.8)'; g.lineWidth = X(0.25); g.beginPath(); g.moveTo(X(3 + 6 * Math.cos(1.15)), Y(10) - X(6 * Math.sin(1.15))); g.lineTo(X(3 + 6 * Math.cos(1.15)), Y(10) + X(6 * Math.sin(1.15))); g.stroke();
        } else {   // axe
          g.save(); g.translate(X(4.6), Y(5.5)); g.rotate(-0.25);
          g.fillStyle = '#4a2e1e'; rr(g, X(-0.5), Y(11), X(1), X(11.5), X(0.4)); g.fill();
          g.fillStyle = lin(g, 0, Y(11), X(4), Y(6), [[0, '#f4f6fa'], [0.5, '#a8aec0'], [1, '#585e72']]); g.beginPath(); g.moveTo(X(0.4), Y(10.6)); g.quadraticCurveTo(X(4.6), Y(11.6), X(4.2), Y(6.4)); g.quadraticCurveTo(X(2.4), Y(7.6), X(0.4), Y(7.4)); g.closePath(); g.fill();
          g.restore();
        }
        g.restore();
      }, { alpha: un.dead ? 0.4 : 1, noRim: !!un.noShadow, noAO: !!un.noShadow, noTint: !!un.noShadow });
      // what glows on a figure: undead eyes and staff orbs
      if (!un.noShadow && !un.dead) {
        var hyW = base + bob - (18.6 + (br - 1) * 6) * u, eyeCol = wraith ? P.skin.eyeW : P.skin.eyeB;
        if (undead) [0.4, 2.2].forEach(function (ex) { var ex2 = cx + f * ex * u; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rad(ctx, ex2, hyW, 0, 2 * u, [[0, rgba(eyeCol, 0.8 * haloK())], [1, rgba(eyeCol, 0)]]); ctx.fillRect(ex2 - 2 * u, hyW - 2 * u, 4 * u, 4 * u); ctx.restore(); lit.emit({ t: 'dot', x: ex2, y: hyW + 0.2 * u, r: 0.45 * u, col: '#ffffff', a: 0.9 }); lit.emit({ t: 'glow', x: ex2, y: hyW + 0.2 * u, r: 1.1 * u, col: eyeCol, a: 0.7 }); });
        if (kind === 'mage') { var ox = cx + f * 5.6 * u, oy = base + bob - 20.4 * u, oc2 = wraith ? '#c890ff' : '#8fe0ff'; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rad(ctx, ox, oy, 0, 5 * u, [[0, rgba(oc2, 0.6 * haloK())], [1, rgba(oc2, 0)]]); ctx.fillRect(ox - 5 * u, oy - 5 * u, 10 * u, 10 * u); ctx.restore(); lit.emit({ t: 'glow', x: ox, y: oy, r: 4.5 * u, col: oc2, a: 0.9 }); }
      }
      ctx.globalAlpha = pa;
    },

    // atmosphere: the 2D stand-in for J-01 (dusk wash + light pools + vignette) when no light stack runs; motes always
    atmosphere: function (ctx, view, t, o) {
      o = o || {}; var ph = o.phase || 'final', ls = stdLights(o.lights || []), M = this.palette.mood, T = t || 0; lit.seeLights(o.lights);
      ctx.save();
      if (ph === 'world' && !lit.post) {
        ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = M.washAlpha; ctx.fillStyle = M.wash; ctx.fillRect(view.x, view.y, view.w, view.h); ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'lighter';
        // pools: warm lights are pushed toward ember so they read amber on green grass (not lime); a hot core, a wide soft skirt
        ls.forEach(function (l) {
          var warm = l.kind === 'fire' || l.kind === 'lamp' || l.kind === 'sun', c = warm ? mix(l.col || '#ffc070', '#ff7a2a', 0.45) : (l.col || '#7ae8ff');
          var rr2 = (l.r || 40) * (l.kind === 'lamp' ? 1.5 : 2.0), a = M.pool * Math.min(1, 0.4 + (l.intensity == null ? 1 : l.intensity));
          ctx.fillStyle = rad(ctx, l.x, l.y, 0, rr2, [[0, rgba(c, a)], [0.3, rgba(c, a * 0.55)], [0.65, rgba(c, a * 0.16)], [1, rgba(c, 0)]]); ctx.fillRect(l.x - rr2, l.y - rr2, rr2 * 2, rr2 * 2);
          // then pull the lit grass toward the light's hue (multiply by the light colour), so a pool reads as coloured light, not lighter grass
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = rad(ctx, l.x, l.y, 0, rr2 * 0.85, [[0, rgba(warm ? '#ffa860' : c, 0.75)], [0.5, rgba(warm ? '#ffa860' : c, 0.3)], [1, rgba(warm ? '#ffa860' : c, 0)]]); ctx.fillRect(l.x - rr2, l.y - rr2, rr2 * 2, rr2 * 2);
          ctx.globalCompositeOperation = 'lighter';
        });
      }
      if (ph === 'world' && lit.post) {
        // under J-01: no wash or pools (the light map does them), but pull the floor under warm lights toward amber first,
        // so warm light on green grass reads amber instead of lime (J-01 multiplies, it cannot shift hue per surface)
        ctx.globalCompositeOperation = 'multiply';
        ls.forEach(function (l) {
          if (!(l.kind === 'fire' || l.kind === 'lamp' || l.kind === 'sun')) return; var rr3 = (l.r || 40) * (l.kind === 'lamp' ? 1.3 : 1.8);
          ctx.fillStyle = rad(ctx, l.x, l.y, 0, rr3, [[0, rgba('#ffb070', 0.6)], [0.55, rgba('#ffb070', 0.25)], [1, rgba('#ffb070', 0)]]); ctx.fillRect(l.x - rr3, l.y - rr3, rr3 * 2, rr3 * 2);
        });
        ctx.globalCompositeOperation = 'source-over';
      }
      if (ph === 'final') {
        // motes: warm and cool specks rising slowly around each light, deterministic from t
        var Pm = this.particles.motes;
        ctx.globalCompositeOperation = 'lighter';
        ls.forEach(function (l, i) {
          for (var j = 0; j < Pm.perLight; j++) {
            var p = ((T * 0.16 + h3(i, j, 1)) % 1), x = l.x + (h3(i, j, 2) - 0.5) * (l.r || 40) * 1.1 + Math.sin(T * 0.9 + j * 2.1) * 2.2, y = l.y - 4 - p * Pm.rise, a = Math.pow(Math.sin(Math.PI * p), 1.5) * Pm.alpha, sz = Pm.size[0] + (Pm.size[1] - Pm.size[0]) * h3(i, j, 3);
            ctx.fillStyle = rad(ctx, x, y, 0, sz * 2.6, [[0, rgba('#ffffff', a)], [0.35, rgba(l.col || '#ffc070', a * 0.7)], [1, rgba(l.col || '#ffc070', 0)]]); ctx.fillRect(x - sz * 3, y - sz * 3, sz * 6, sz * 6);
            lit.emit({ t: 'dot', x: x, y: y, r: sz, col: l.col || '#ffc070', a: a });
          }
        });
        if (!lit.post) {
          ctx.globalCompositeOperation = 'source-over';
          var cx = view.x + view.w / 2, cy = view.y + view.h * 0.46, R = Math.hypot(view.w, view.h) * 0.62;
          ctx.fillStyle = rad(ctx, cx, cy, R * 0.45, R, [[0, rgba(M.vignette, 0)], [1, rgba(M.vignette, M.vignetteAlpha)]]); ctx.fillRect(view.x, view.y, view.w, view.h);
        }
      }
      ctx.restore();
    }
  };

  API.register(skin);
  // define() deep-copies plain objects; point the registered skin at the one live bridge the methods use
  var REGD = API.get('lit-hd'); if (REGD) REGD.lit = lit;
})(typeof window !== 'undefined' ? window : this);
