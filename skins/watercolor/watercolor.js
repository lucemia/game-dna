/* GameDNA skin 'watercolor' · hand-painted watercolor storybook · needs skin-api.js first
 *
 * Everything is procedural (no image files): paper grain and granulation come from seeded value noise rendered once into
 * small cached canvases; washes are stacks of low-alpha jittered polygons with pigment pooled at the edge; ink lines wobble
 * along smooth noise. All randomness is seeded from positions or sizes, so the same frame always paints the same picture.
 *
 *   frame    parchment card with a deckled (torn) edge, aged rim, soft drop shadow, wobbly ink rule; team = tinted rule + top wash
 *   text     classical serif (Cormorant Garamond / IM Fell English in docs; Georgia / Times in games) in sepia ink, faint bleed
 *   number   inked serif numerals over a wash splash in the kind's colour, paper halo for legibility; CRITICAL in italic caps
 *   overlay  'wash' mode: per-cell wash whose boundary sides wobble with world-anchored noise (continuous across tiles),
 *            rounded convex corners, granulation speckle, pigment pooled on the boundary only; breathing, not blinking
 *   bar      ragged wash stroke inside a pencil-ruled well; status tab = small ink seal with a letter
 *   cursor   bracket = four tapered brush ticks that breathe; hand = an ink pen-nib with a red wash blot
 *   path     (extra) brush-stroke move arrow: tapered ribbon with dry-brush streaks and a two-flick arrowhead
 *   brush    (extra) wash / ink / paper helpers so a host can paint terrain and pawns that match
 */
(function (root) {
  'use strict';
  var API = root.GameDNA_Skin;
  if (!API) { if (root.console) console.error('watercolor.js: load skin-api.js first'); return; }
  var C = API.color, rgba = C.rgba, mix = C.mix;

  /* ---------- seeded noise ---------- */
  function hash2(i, j, s) { var h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function vnoise(x, y, s) {
    var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    var a = hash2(i, j, s), b = hash2(i + 1, j, s), c = hash2(i, j + 1, s), d = hash2(i + 1, j + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s) { return vnoise(x, y, s) * 0.62 + vnoise(x * 2.3 + 17, y * 2.3 + 5, s + 7) * 0.38; }   // 0..1
  function rng(seed) { var a = seed | 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function strSeed(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; }

  /* ---------- device scale (patterns and blur stay at device resolution) ---------- */
  function devScale(ctx) { if (!ctx.getTransform) return 1; var m = ctx.getTransform(); return Math.hypot(m.a, m.b) || 1; }

  /* ---------- cached textures ---------- */
  var TEX = {};
  function texCanvas(key, size, paint) {
    if (TEX[key]) return TEX[key];
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas'); c.width = c.height = size; paint(c.getContext('2d'), size); return (TEX[key] = c);
  }
  // paper tooth: brown speckle + fibres, alpha only where the paper is darker (multiply-friendly)
  function grainTex() {
    return texCanvas('grain', 192, function (g, n) {
      var id = g.createImageData(n, n), d = id.data, r = rng(9187);
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
        var v = vnoise(x / 6, y / 6, 3) * 0.55 + vnoise(x / 2.2, y / 2.2, 4) * 0.3 + r() * 0.15, i = (y * n + x) * 4;   // tileable enough at this size
        d[i] = 120; d[i + 1] = 88; d[i + 2] = 52; d[i + 3] = Math.max(0, (v - 0.42)) * 120;
      }
      g.putImageData(id, 0, 0);
      g.strokeStyle = 'rgba(110,80,46,0.10)'; g.lineWidth = 0.7;
      for (var k = 0; k < 60; k++) { var x0 = r() * n, y0 = r() * n, a = r() * Math.PI, l = 5 + r() * 16; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + Math.cos(a + 0.6) * l * 0.5, y0 + Math.sin(a + 0.6) * l * 0.5, x0 + Math.cos(a) * l, y0 + Math.sin(a) * l); g.stroke(); }
    });
  }
  // granulation: pigment specks that settle into the paper tooth (per colour)
  function granTex(col) {
    return texCanvas('gran' + col, 128, function (g, n) {
      var id = g.createImageData(n, n), d = id.data, c = C.rgb(col), r = rng(strSeed(col));
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
        var v = vnoise(x / 3.1, y / 3.1, 11) * 0.7 + r() * 0.3, i = (y * n + x) * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = v > 0.6 ? (v - 0.6) * 520 : 0;
      }
      g.putImageData(id, 0, 0);
    });
  }
  // mottle: large soft blooms and back-runs so a flat wash varies in strength (world-anchored, seamless across cells)
  function mottleTex(col) {
    return texCanvas('mot' + col, 256, function (g, n) {
      var id = g.createImageData(n, n), d = id.data, c = C.rgb(col);
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
        // periodic noise (wraps at n) so the pattern tiles without a seam
        var a = x / n * Math.PI * 2, b = y / n * Math.PI * 2, v = vnoise(3 + Math.cos(a) * 1.6, 3 + Math.sin(a) * 1.6, 21) * 0.5 + vnoise(8 + Math.cos(b) * 1.6, 8 + Math.sin(b) * 1.6, 22) * 0.5;
        v += (vnoise(Math.cos(a) * 3 + Math.sin(b) * 3 + 20, Math.sin(a) * 3 + Math.cos(b) * 3 + 20, 23) - 0.5) * 0.6;
        var i = (y * n + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = Math.max(0, Math.min(1, (v - 0.35) * 1.6)) * 255;
      }
      g.putImageData(id, 0, 0);
    });
  }
  // fill the current path with a texture at device resolution, anchored to the world
  function texFill(ctx, tex, alpha, comp) {
    if (!tex) return;
    var p = ctx.createPattern(tex, 'repeat'), s = devScale(ctx);
    if (p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().scale(1 / s));
    var pa = ctx.globalAlpha, op = ctx.globalCompositeOperation;
    ctx.globalAlpha = pa * alpha; if (comp) ctx.globalCompositeOperation = comp;
    ctx.fillStyle = p; ctx.fill();
    ctx.globalAlpha = pa; ctx.globalCompositeOperation = op;
  }

  /* ---------- brush helpers (also exported as skin.brush) ---------- */
  function polyPath(ctx, p) { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (var i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); }
  function deform(poly, depth, v, r) {
    var p = poly;
    for (var d = 0; d < depth; d++) {
      var q = [];
      for (var i = 0; i < p.length; i++) {
        var a = p[i], b = p[(i + 1) % p.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        q.push(a); q.push([(a[0] + b[0]) / 2 + (r() - 0.5) * v * len * 0.7, (a[1] + b[1]) / 2 + (r() - 0.5) * v * len * 0.7]);
      }
      p = q;
    }
    return p;
  }
  function blob(cx, cy, rx, ry, n, rot) { var p = []; n = n || 10; rot = rot || 0; for (var i = 0; i < n; i++) { var a = rot + i / n * Math.PI * 2; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return p; }
  // wash(ctx, poly, colour, {layers, alpha, v (wobble), edge (pooled rim alpha), seed, gran}) : watercolour pigment in many thin layers
  function wash(ctx, poly, col, o) {
    o = o || {}; var r = rng(o.seed == null ? 7 : o.seed), base = deform(poly, 2, (o.v == null ? 0.5 : o.v) * 0.7, r), L = o.layers || 6, a = o.alpha == null ? 0.08 : o.alpha;
    ctx.save(); if (o.comp) ctx.globalCompositeOperation = o.comp;
    for (var i = 0; i < L; i++) { polyPath(ctx, deform(base, 2, (o.v == null ? 0.5 : o.v) * 0.45, r)); ctx.fillStyle = rgba(col, a); ctx.fill(); }
    if (o.gran) { polyPath(ctx, base); texFill(ctx, granTex(mix(col, '#2a1a10', 0.35)), o.gran); }
    if (o.edge) { ctx.lineJoin = 'round'; ctx.lineWidth = o.edgeW || 0.6; ctx.strokeStyle = rgba(mix(col, '#2a1a10', 0.25), o.edge); polyPath(ctx, deform(base, 1, 0.12, r)); ctx.stroke(); }
    ctx.restore();
  }
  // ink(ctx, points, {w, color, a, j (wobble px), seed, twice, taper}) : a hand-drawn line that wobbles along smooth noise
  function ink(ctx, pts, o) {
    o = o || {}; var seed = o.seed == null ? 3 : o.seed, j = o.j == null ? 0.5 : o.j, col = o.color || PAL.ink;
    var line = function (jit, alpha, lw, s2) {
      ctx.beginPath(); var first = true, acc = 0;
      for (var i = 0; i < pts.length - 1; i++) {
        var x0 = pts[i][0], y0 = pts[i][1], x1 = pts[i + 1][0], y1 = pts[i + 1][1], len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(len / 1.5)), nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
        for (var k = (i ? 1 : 0); k <= n; k++) {
          var t = k / n, s = acc + len * t, d = (vnoise(s * 0.18, 0.5, s2) - 0.5) * 2 * jit;
          var x = x0 + (x1 - x0) * t + nx * d, y = y0 + (y1 - y0) * t + ny * d;
          if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
        acc += len;
      }
      ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    };
    ctx.save(); line(j, o.a == null ? 0.85 : o.a, o.w || 0.7, seed); if (o.twice !== false) line(j * 1.6, (o.a == null ? 0.85 : o.a) * 0.3, (o.w || 0.7) * 0.7, seed + 31); ctx.restore();
  }
  // paper(ctx, rect, {seed, stains, vignette}) : the page itself
  function paper(ctx, R, o) {
    o = o || {}; var r = rng(o.seed == null ? 20261114 : o.seed);
    ctx.save(); ctx.fillStyle = PAL.paper; ctx.fillRect(R.x, R.y, R.w, R.h);
    for (var i = 0; i < (o.stains == null ? 10 : o.stains); i++) {
      var x = R.x + r() * R.w, y = R.y + r() * R.h, rad = (0.15 + r() * 0.45) * Math.max(R.w, R.h) * 0.5, g = ctx.createRadialGradient(x, y, 0, x, y, rad), c = r() < 0.5 ? '#b08c5a' : '#d2be96';
      g.addColorStop(0, rgba(c, 0.05 + r() * 0.05)); g.addColorStop(1, rgba(c, 0)); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); texFill(ctx, grainTex(), 0.9);
    if (o.vignette !== false) {
      var cx = R.x + R.w / 2, cy = R.y + R.h / 2, v = ctx.createRadialGradient(cx, cy, Math.min(R.w, R.h) * 0.35, cx, cy, Math.max(R.w, R.h) * 0.72);
      v.addColorStop(0, 'rgba(120,80,30,0)'); v.addColorStop(1, 'rgba(120,80,30,0.22)'); ctx.fillStyle = v; ctx.fillRect(R.x, R.y, R.w, R.h);
    }
    ctx.restore();
  }

  /* ---------- palette ---------- */
  var PAL = {
    ink: '#3a2a1e', paper: '#f1e6cf',
    ui: { fill: '#f6ecd4', fillTo: '#e9d7b0', edge: '#7a5a3a', highlight: '#fbf5e4', shadow: 'rgba(58,42,30,0.30)', select: 'rgba(176,112,52,0.16)', well: 'rgba(150,110,60,0.13)', rule: '#6b4a2e', rim: '#9a7444' },
    team: { a: '#4a72a8', b: '#b04a3a', n: '#8f8060', aLight: '#d4e0ee', aDark: '#a8bcd8', aText: '#2a4470', bLight: '#f0d4cc', bDark: '#dca898', bText: '#7a2a1e' },
    overlay: {
      move: { fill: '#7aa2cc', edge: '#2d5a8c', alpha: 0.42 }, attack: { fill: '#d98a68', edge: '#9a3a26', alpha: 0.42 },
      threat: { fill: '#a488c0', edge: '#5e3c80', alpha: 0.36 }, heal: { fill: '#94bf78', edge: '#3f6e2c', alpha: 0.40 },
      path: { core: '#2c4a78', light: '#7aa2cc', mid: '#3d5f92', dark: '#1e3356', outline: '#3a2a1e', spark: '#f6efe0' }
    },
    fx: { hot: '#c8603a', cold: '#4a7fb5', heal: '#5d9a48', crit: '#a8281e', status: '#7a5aa0', ink: '#3a2a1e', gold: '#c49a3a', paper: '#f6eedb' },
    text: {
      main: '#3a2a1e', main2: '#3a2a1e', shadow: 'rgba(0,0,0,0)', outline: '#f6eedb', dim: '#a3927a', dim2: '#a3927a', accent: '#a8281e',
      select: '#7a2a1a', title: '#2c1e14', title2: '#2c1e14', label: '#7a5634', label2: '#7a5634', gold: '#8a6420', gold2: '#8a6420',
      plate: '#3a2a1e', plateShadow: 'rgba(0,0,0,0)', pointer: '#3a2a1e', pointerEdge: '#f6eedb'
    },
    // number kinds: [numeral ink, splash wash]
    numbers: { damage: ['#3a2a1e', '#d0794e'], crit: ['#8a1c14', '#c84a32'], heal: ['#2c5a26', '#86b86a'], mp: ['#23446f', '#6f9ccc'], miss: ['#7d6e5e', null], status: ['#4f3474', '#a68cc4'] },
    bars: { track: 'rgba(150,110,60,0.14)', charge: '#c99a3a', haste: '#6f9e4f', slow: '#8a6aa8', ready: '#d8a940', queued: '#4f80b8', enemy: '#b04a3a', enemyFull: '#c88a30', hp: '#6f9e4f', hpLow: '#b8503a' }
  };
  var SERIF = "'Cormorant Garamond', 'Cormorant', 'IM Fell English', Georgia, 'Times New Roman', serif";
  var FELL = "'IM Fell English', 'Cormorant Garamond', Georgia, 'Times New Roman', serif";
  var NUMS = "'Playfair Display', 'Cormorant Garamond', Georgia, 'Times New Roman', serif";   // lining figures read at a glance

  /* ---------- text helpers ---------- */
  var MS = null;
  function mctx() { if (!MS && typeof document !== 'undefined') MS = document.createElement('canvas').getContext('2d'); return MS; }
  function fontCss(f, scale) { return (f.style || 'normal') + ' ' + (f.weight || 400) + ' ' + (f.size * (scale || 1)) + 'px ' + f.family; }
  function fontOf(sk, name) { return sk.fonts[name || 'ui'] || sk.fonts.ui; }
  function caseOf(f, s) { s = String(s); return f.uppercase ? s.toUpperCase() : s; }
  function measureF(f, s, scale) {
    var g = mctx(); s = caseOf(f, s); if (!g) return s.length * f.size * (scale || 1) * 0.5;
    g.font = fontCss(f, scale); return g.measureText(s).width + (f.letterSpacing || 0) * (scale || 1) * Math.max(0, s.length - 1);
  }
  // draw with the glyph box top at y (alphabetic baseline at y + ascent): same placement whichever serif the system resolves
  function drawF(ctx, f, s, x, y, col, o) {
    o = o || {}; var sc = o.scale || 1; s = caseOf(f, s);
    ctx.save(); ctx.font = fontCss(f, sc); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    var ls = (f.letterSpacing || 0) * sc;
    if (ls && 'letterSpacing' in ctx) ctx.letterSpacing = ls + 'px';
    var by = y + f.size * sc * (f.ascent || 0.8);
    if (o.halo) { ctx.lineJoin = 'round'; ctx.lineWidth = o.halo * sc; ctx.strokeStyle = o.haloColor || PAL.text.outline; ctx.globalAlpha *= o.haloAlpha == null ? 0.9 : o.haloAlpha; ctx.strokeText(s, x, by); ctx.globalAlpha /= o.haloAlpha == null ? 0.9 : o.haloAlpha; }
    if (!o.haloOnly) {
      ctx.fillStyle = col; ctx.fillText(s, x, by);
      if (o.bleed !== false) { ctx.globalAlpha *= 0.28; ctx.fillText(s, x + 0.22 * sc, by + 0.28 * sc); }   // wet ink feathering into the paper
    }
    ctx.restore();
  }

  /* ---------- deckled card ---------- */
  function deckle(r, seed, amp, step) {
    var pts = [], x = r.x, y = r.y, w = r.w, h = r.h, A = amp == null ? 1.1 : amp, st = step || 2.2;
    var sides = [[x, y, x + w, y, 0, 1], [x + w, y, x + w, y + h, -1, 0], [x + w, y + h, x, y + h, 0, -1], [x, y + h, x, y, 1, 0]];
    sides.forEach(function (S, si) {
      var len = Math.hypot(S[2] - S[0], S[3] - S[1]), n = Math.max(2, Math.round(len / st));
      for (var k = 0; k < n; k++) {
        var t = k / n, px = S[0] + (S[2] - S[0]) * t, py = S[1] + (S[3] - S[1]) * t;
        var cut = k === 0 ? 0.9 : 0;   // nibbled corners
        var d = (fbm(px * 0.21, py * 0.21, seed + si) * A + hash2(Math.round(px * 3), Math.round(py * 3), seed) * 0.45 * A) + cut;
        pts.push([px + S[4] * d + (k === 0 ? (si === 0 || si === 3 ? 1 : -1) * 0.5 : 0), py + S[5] * d + (k === 0 ? (si < 2 ? 1 : -1) * 0.5 : 0)]);
      }
    });
    return pts;
  }
  function wobRect(ctx, x, y, w, h, o) { ink(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y + 0.01]], o); }

  /* ---------- overlay cell polygon ----------
     The cell outline is pushed through one smooth world-anchored warp field (the same for every cell of every set), so
     points that neighbouring cells share always land in the same place: no gaps, no notches, and a straight run of
     boundary becomes one continuous wavering edge. Convex corners are rounded before the warp. */
  var SIDES = [
    { k: 'top', a: [0, 0], b: [1, 0], d: [1, 0] }, { k: 'right', a: [1, 0], b: [1, 1], d: [0, 1] },
    { k: 'bottom', a: [1, 1], b: [0, 1], d: [-1, 0] }, { k: 'left', a: [0, 1], b: [0, 0], d: [0, -1] }
  ];
  function warp(px, py, seed, amp, layer) {
    var f = 0.095, l = layer ? 0.55 : 0;
    var wx = (vnoise(px * f, py * f, seed) - 0.5) * 2.2 + (vnoise(px * 0.24, py * 0.24, seed + 2) - 0.5) * 0.45 + (layer ? (vnoise(px * 0.15, py * 0.15, seed + 40 + layer) - 0.5) * l : 0);
    var wy = (vnoise(px * f + 31.7, py * f, seed + 1) - 0.5) * 2.2 + (vnoise(px * 0.24, py * 0.24 + 9.1, seed + 3) - 0.5) * 0.45 + (layer ? (vnoise(px * 0.15, py * 0.15 + 5, seed + 50 + layer) - 0.5) * l : 0);
    return [px + wx * amp, py + wy * amp];
  }
  function cellPoly(r, E, seed, amp, layer) {
    var pts = [], flags = [], step = 2;
    for (var si = 0; si < 4; si++) {
      var S = SIDES[si], Pv = SIDES[(si + 3) % 4], on = !!E[S.k], pon = !!E[Pv.k];
      var ax = r.x + S.a[0] * r.w, ay = r.y + S.a[1] * r.h, bx = r.x + S.b[0] * r.w, by = r.y + S.b[1] * r.h, len = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.round(len / step));
      for (var k = 0; k < n; k++) {
        var t = k / n, px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
        if (k === 0 && on && pon) {   // convex corner: replace by a short arc
          var rc = 2.6;
          for (var q = 0; q <= 4; q++) {
            var u = q / 4, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
            pts.push(warp(w0 * (px - Pv.d[0] * rc) + w1 * px + w2 * (px + S.d[0] * rc), w0 * (py - Pv.d[1] * rc) + w1 * py + w2 * (py + S.d[1] * rc), seed, amp, layer)); flags.push(true);
          }
          continue;
        }
        if (k > 0 && k * step < 2.7 && on && pon) continue;   // inside the arc
        if (k === n - 1 && on && E[SIDES[(si + 1) % 4].k] && (n - k) * step < 2.7) continue;
        pts.push(warp(px, py, seed, amp, layer)); flags.push(k === 0 ? on || pon : on);
      }
    }
    return { pts: pts, flags: flags };
  }

  /* ---------- number layout: canonical glyph order main, suffix, label (skin-api v0.2 glyphItems) ---------- */
  function numLayout(sk, s, o) {
    var sc0 = o.scale || 1, sc = sc0 * (o.kind === 'crit' && o.big !== false ? 1.3 : 1), items = [], x = 0, i;
    var fi = o.kind === 'miss' || o.kind === 'status' || !/^[0-9+\-]+$/.test(s) ? fontOf(sk, 'word') : fontOf(sk, 'num');
    for (i = 0; i < s.length; i++) { var w = measureF(fi, s[i], sc); items.push({ ch: s[i], role: 'main', x: x, y: 0, w: w, font: fi, s: sc }); x += w + (fi.letterSpacing || 0) * sc; }
    var nw = Math.max(0, x - (fi.letterSpacing || 0) * sc), h = fi.size * sc * 0.74;
    if (o.suffix) {
      var sf = fontOf(sk, 'label'), sx = nw + 1.5, sh = sf.size * sc0 * 0.74;
      for (i = 0; i < o.suffix.length; i++) { var cw = measureF(sf, o.suffix[i], sc0); items.push({ ch: o.suffix[i], role: 'suffix', x: sx, y: h - sh, w: cw, font: sf, s: sc0, h: sh }); sx += cw + (sf.letterSpacing || 0) * sc0; }
      x = sx;
    }
    var total = o.suffix ? x : nw;
    if (o.label) {
      var lf = fontOf(sk, 'label'), lw = measureF(lf, o.label, sc0), lx = (nw - lw) / 2, gap = o.labelGap == null ? 2 : o.labelGap * 0.5, lh = lf.size * sc0 * 0.74, ly = -lh - gap;
      for (i = 0; i < o.label.length; i++) { var lcw = measureF(lf, o.label[i], sc0); items.push({ ch: o.label[i], role: 'label', lab: 1, x: lx, y: ly, w: lcw, font: lf, s: sc0, h: lh }); lx += lcw + (lf.letterSpacing || 0) * sc0; }
    }
    items.forEach(function (it, k) { it.i = k; if (it.h == null) it.h = h; });
    return { items: items, w: total, nw: nw, h: h, sc: sc };
  }

  /* ---------- brush-stroke path ---------- */
  function smoothPath(points, rad) {
    // round each corner with a quadratic curve, then sample to ~0.8 px spacing
    var out = [], P = points;
    if (P.length < 2) return P.map(function (p) { return [p.x, p.y]; });
    var add = function (x, y) { var l = out[out.length - 1]; if (!l || Math.hypot(x - l[0], y - l[1]) > 0.05) out.push([x, y]); };
    add(P[0].x, P[0].y);
    for (var i = 1; i < P.length - 1; i++) {
      var a = P[i - 1], b = P[i], c = P[i + 1], d1 = Math.hypot(b.x - a.x, b.y - a.y), d2 = Math.hypot(c.x - b.x, c.y - b.y), R = Math.min(rad, d1 / 2, d2 / 2);
      var p0 = [b.x - (b.x - a.x) / d1 * R, b.y - (b.y - a.y) / d1 * R], p1 = [b.x + (c.x - b.x) / d2 * R, b.y + (c.y - b.y) / d2 * R];
      var l = out[out.length - 1], seg = Math.hypot(p0[0] - l[0], p0[1] - l[1]), n = Math.ceil(seg / 0.8);
      for (var k = 1; k <= n; k++) add(l[0] + (p0[0] - l[0]) * k / n, l[1] + (p0[1] - l[1]) * k / n);
      for (k = 1; k <= 8; k++) { var t = k / 8, u = 1 - t; add(u * u * p0[0] + 2 * u * t * b.x + t * t * p1[0], u * u * p0[1] + 2 * u * t * b.y + t * t * p1[1]); }
    }
    var L = out[out.length - 1], E = P[P.length - 1], s2 = Math.hypot(E.x - L[0], E.y - L[1]), m = Math.ceil(s2 / 0.8);
    for (var q = 1; q <= m; q++) add(L[0] + (E.x - L[0]) * q / m, L[1] + (E.y - L[1]) * q / m);
    return out;
  }

  var skin = {
    id: 'watercolor', name: 'Hand-painted watercolor storybook', pixel: false,
    native: { w: 256, h: 224, scale: 'fit', smoothing: true, snap: 0, minScale: 2, note: 'draw in native px; host sets backing = native x scale x devicePixelRatio and ctx.setTransform' },
    palette: PAL,
    fonts: {
      ui: { type: 'canvas', family: SERIF, size: 8.5, weight: 600, ascent: 0.74, note: 'Georgia / Times fallback in games (web fonts only in docs)' },
      title: { type: 'canvas', family: FELL, size: 10, weight: 400, ascent: 0.76 },
      label: { type: 'canvas', family: SERIF, size: 6.5, weight: 600, style: 'italic', letterSpacing: 0.35, uppercase: true, ascent: 0.74 },
      plate: { type: 'canvas', family: SERIF, size: 7.5, weight: 600, style: 'italic', ascent: 0.74 },
      num: { type: 'canvas', family: NUMS, size: 13, weight: 700, ascent: 0.72, note: 'inked high-contrast serif numerals, lining figures' },
      word: { type: 'canvas', family: SERIF, size: 10, weight: 700, style: 'italic', ascent: 0.74, note: 'MISS / status words' },
      rules: { snap: false, smoothing: true, minSize: 6.5, uppercase: false, lineH: 12, case: 'Title case in windows; small caps (uppercase + tracking) for labels' }
    },
    shape: { radius: 0, edgeWidth: 0.5, padding: 5, deckle: 1.1, rule: 2.6 },
    overlayStyle: { mode: 'wash', pattern: 'breathing', alpha: 0.42, layers: 3, wobble: 1.7, veil: 0.16, mottle: 0.55, pool: 0.11, granulation: 0.5, edgeAlpha: 0.65, bleed: 0.1, composite: 'source-over', note: 'pale body colour over the terrain, never multiply (keeps water clear)' },
    particles: { shape: 'blob', size: [0.8, 2.6], count: 0.8, snap: false, blend: 'source-over', glow: 0, gravity: 0.06, drag: 0.05, life: [500, 1100], colors: ['fx.hot', 'fx.crit', 'fx.ink'], trail: 0, rays: 0, note: 'paint droplets and spatter; soft edges, no glow' },
    outline: { text: { width: 0, mode: 'none' }, number: { width: 1.3, max: 2, drop: 0, mode: 'halo', color: 'text.outline' }, sprite: { width: 0.7, color: 'fx.ink', mode: 'wobble-stroke' } },
    shadow: { text: null, window: { dx: 0, dy: 1.2, blur: 3 }, sprite: { kind: 'blob', alpha: 0.22 } },
    motion: { stepMs: 0, snap: false, ease: { move: 'inOutQuad', pop: 'outCubic', fade: 'linear', open: 'outCubic' }, fadeSteps: null, shakeInt: false, flashMax: 0.22, squash: { x: 1.05, y: 0.93, ms: 90 }, note: 'slow eased fades, washes bloom in; no blinking' },
    // hints for modules that lay out around the skin (window-cursor v1.1): pen-nib pointer size, wash row band, no square backing
    layout: { handW: 8, handH: 5, pointerGap: 5, rowFrame: true, backing: 'none' },
    frameRoles: ['row', 'backing'],

    measure: function (str, o) { o = o || {}; return measureF(fontOf(this, o.font), str, o.scale); },

    // text(ctx, str, x, y, {font, color, align, scale, alpha, outline (halo colour), shadow ignored})
    text: function (ctx, str, x, y, o) {
      o = o || {}; var f = fontOf(this, o.font), w = this.measure(str, o), col = this.token(o.color) || PAL.text.main;
      if (o.align === 'center') x -= w / 2; else if (o.align === 'right') x -= w;
      var pa = ctx.globalAlpha; if (o.alpha != null) ctx.globalAlpha = pa * o.alpha;
      var halo = o.outline ? (o.outlineWidth || 1.2) * 2 : 0;
      drawF(ctx, f, str, x, y, col, { scale: o.scale, halo: halo, haloColor: this.token(o.outline) });
      ctx.globalAlpha = pa; return w;
    },

    // frame: parchment card with deckled edge. role window | plate | banner | tooltip; team a | b | n; focus; alert; disabled; alpha
    frame: function (ctx, r, st) {
      st = st || {}; var U = PAL.ui, x = r.x, y = r.y, w = r.w, h = r.h, role = st.role || 'window', s = devScale(ctx);
      if (role === 'row') {   // selected menu row: a loose ochre wash stroke, ragged at both ends
        var pa0 = ctx.globalAlpha; ctx.save(); ctx.globalAlpha = pa0 * (st.alpha == null ? 1 : st.alpha);
        var cy0 = y + h / 2, rp = [[x - 1, cy0 - h * 0.32], [x + w * 0.5, cy0 - h * 0.42], [x + w + 1, cy0 - h * 0.3], [x + w + 2, cy0 + h * 0.28], [x + w * 0.5, cy0 + h * 0.4], [x - 1.5, cy0 + h * 0.3]];
        wash(ctx, rp, PAL.fx.gold, { layers: 4, alpha: 0.09, v: 0.25, edge: 0.18, edgeW: 0.5, seed: (Math.round(w) * 17 + Math.round(y) * 3) | 0, gran: 0.25 });
        ctx.restore(); return { x: x + 2, y: y, w: w - 4, h: h };
      }
      if (role === 'backing') {   // inset well / title band: a soft umber wash, no hard rectangle
        var pa1 = ctx.globalAlpha; ctx.save(); ctx.globalAlpha = pa1 * (st.alpha == null ? 1 : st.alpha);
        wash(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], U.rim, { layers: 3, alpha: 0.07, v: 0.12, seed: (Math.round(w) * 13 + Math.round(h)) | 0, gran: 0.2 });
        ctx.restore(); return { x: x, y: y, w: w, h: h };
      }
      var team = st.team && st.team !== 'n' ? PAL.team[st.team] : null, seed = (Math.round(w) * 31 + Math.round(h) * 7 + (role.length * 101)) | 0;
      var pts = deckle(r, seed, role === 'tooltip' ? 0.6 : this.shape.deckle), pa = ctx.globalAlpha, sm = ctx.imageSmoothingEnabled;
      ctx.save(); ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = pa * (st.alpha == null ? 1 : st.alpha) * (st.disabled ? 0.6 : 1);
      // soft drop shadow (paper lifted off the page)
      if (role !== 'tooltip') { ctx.save(); ctx.shadowColor = 'rgba(58,40,22,0.38)'; ctx.shadowBlur = 3 * s; ctx.shadowOffsetY = 1.2 * s; ctx.fillStyle = U.fillTo; polyPath(ctx, pts); ctx.fill(); ctx.restore(); }
      // body: parchment gradient, nudged toward the team colour
      var f0 = team ? mix(U.fill, team, 0.06) : U.fill, f1 = team ? mix(U.fillTo, team, 0.08) : U.fillTo;
      if (st.alert) { f0 = mix(f0, PAL.fx.crit, 0.08); f1 = mix(f1, PAL.fx.crit, 0.12); }
      var gr = ctx.createLinearGradient(x, y, x + w * 0.3, y + h); gr.addColorStop(0, f0); gr.addColorStop(1, f1);
      polyPath(ctx, pts); ctx.fillStyle = gr; ctx.fill();
      ctx.save(); polyPath(ctx, pts); ctx.clip();
      // a couple of tea stains and the paper tooth
      var rr = rng(seed);
      for (var i = 0; i < 2; i++) { var sx = x + rr() * w, sy = y + rr() * h, rad = Math.max(w, h) * (0.25 + rr() * 0.3), g2 = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad); g2.addColorStop(0, 'rgba(176,136,80,0.10)'); g2.addColorStop(1, 'rgba(176,136,80,0)'); ctx.fillStyle = g2; ctx.fillRect(x, y, w, h); }
      polyPath(ctx, pts); texFill(ctx, grainTex(), 0.85);
      // aged rim: pigment darkening inward from the torn edge
      ctx.lineJoin = 'round'; polyPath(ctx, pts);
      ctx.strokeStyle = rgba(U.rim, 0.20); ctx.lineWidth = 3.2; ctx.stroke();
      ctx.strokeStyle = rgba(U.rim, 0.30); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
      polyPath(ctx, pts); ctx.strokeStyle = rgba(PAL.ink, 0.45); ctx.lineWidth = 0.4; ctx.stroke();
      // ink rule(s)
      var ruleC = team ? mix(team, PAL.ink, 0.45) : st.alert ? PAL.fx.crit : U.rule, ri = this.shape.rule;
      if ((role === 'window' || role === 'banner') && w > 18 && h > 14) {
        wobRect(ctx, x + ri, y + ri, w - 2 * ri, h - 2 * ri, { w: 0.5, a: 0.6, j: 0.28, color: ruleC, seed: seed + 5, twice: false });
        if (role === 'banner') wobRect(ctx, x + ri + 1.3, y + ri + 1.3, w - 2 * ri - 2.6, h - 2 * ri - 2.6, { w: 0.3, a: 0.45, j: 0.2, color: ruleC, seed: seed + 9, twice: false });
        // tiny corner diamonds where the rule meets
        ctx.fillStyle = rgba(team || (st.alert ? PAL.fx.crit : PAL.fx.hot), 0.75);
        [[x + ri, y + ri], [x + w - ri, y + ri], [x + ri, y + h - ri], [x + w - ri, y + h - ri]].forEach(function (p) { ctx.beginPath(); ctx.moveTo(p[0], p[1] - 1.1); ctx.lineTo(p[0] + 1.1, p[1]); ctx.lineTo(p[0], p[1] + 1.1); ctx.lineTo(p[0] - 1.1, p[1]); ctx.closePath(); ctx.fill(); });
      } else if (role === 'plate' && st.alert) {
        ink(ctx, [[x + 3, y + h - 2.2], [x + w - 3, y + h - 2.4]], { w: 0.6, a: 0.7, j: 0.3, color: PAL.fx.crit, seed: seed + 3, twice: false });
      }
      if (st.focus) wobRect(ctx, x - 1.2, y - 1.2, w + 2.4, h + 2.4, { w: 0.7, a: 0.8, j: 0.4, color: PAL.text.accent, seed: seed + 11 });
      ctx.restore(); ctx.imageSmoothingEnabled = sm; ctx.globalAlpha = pa;
      var pad = role === 'plate' || role === 'tooltip' ? 3 : this.shape.padding;
      return { x: x + pad, y: y + pad, w: w - 2 * pad, h: h - 2 * pad };
    },

    // number: inked serif numerals over a wash splash. Glyphs in canonical order (main, suffix, label); every paper halo
    // is drawn before any ink. A fading number is composited once (skin-api fadeLayer) so halos never show through the ink.
    number: function (ctx, str, x, y, o) {
      o = o || {}; var self = this, s = String(str), kind = o.kind || 'damage', K = PAL.numbers[kind] || PAL.numbers.damage, L = numLayout(this, s, o), out = [];
      var x0 = o.align === 'center' ? x - L.w / 2 : x, y0 = o.baseline === 'bottom' ? y - L.h : y, sm = ctx.imageSmoothingEnabled;
      var halo = (o.outline == null ? this.outline.number.width : Math.min(2, o.outline * 1.1)) * 2;
      var plan = L.items.map(function (it, i) { var d = (o.glyphOffset && o.glyphOffset(i, it)) || {}, a = d.alpha != null ? d.alpha : o.alpha != null ? o.alpha : 1; return { it: it, d: d, a: a }; })
        .filter(function (p) { return !p.d.skip && p.a > 0; });
      if (!plan.length) return out;
      var amax = Math.max.apply(null, plan.map(function (p) { return p.a; }));
      var main = plan.filter(function (p) { return p.it.role === 'main'; });
      var paint = function (g, rel) {
        g.save(); g.imageSmoothingEnabled = true; var pa = g.globalAlpha;
        // splash: follows the numerals at half their bounce; shape fixed per string and kind
        if (K[1] && main.length) {
          var my = 0; main.forEach(function (p) { my += p.d.dy || 0; }); my /= main.length;
          var cx = x0 + L.nw / 2, cy = y0 + L.h * 0.55 + my * 0.5, sd = strSeed(kind + s), r = rng(sd), rx = L.nw / 2 + 3.5 * L.sc, ry = L.h / 2 + 2.2 * L.sc;
          g.globalAlpha = pa * rel(Math.max.apply(null, main.map(function (p) { return p.a; })));
          wash(g, blob(cx, cy, rx, ry, 9, r() * 3), K[1], { layers: 4, alpha: kind === 'crit' ? 0.2 : 0.16, v: 0.55, edge: 0.4, edgeW: 0.5, seed: sd, gran: 0.35 });
          for (var q = 0, drops = kind === 'crit' ? 7 : 3; q < drops; q++) {
            var an = r() * Math.PI * 2, dist = 1.05 + r() * (kind === 'crit' ? 0.6 : 0.3), dr = (0.4 + r() * 0.9) * L.sc * (kind === 'crit' ? 1.2 : 0.8);
            g.fillStyle = rgba(K[1], 0.5); g.beginPath(); g.ellipse(cx + Math.cos(an) * rx * dist, cy + Math.sin(an) * ry * dist, dr, dr * 0.85, an, 0, 7); g.fill();
          }
        }
        ['halo', 'fill'].forEach(function (pass) {
          plan.forEach(function (p) {
            var it = p.it, gx = x0 + it.x + (p.d.dx || 0), gy = y0 + it.y + (p.d.dy || 0), lab = it.role === 'label';
            var col = lab ? PAL.fx.crit : p.d.flash ? mix(K[0], '#e8b040', 0.6) : K[0], sq = (p.d.sx && p.d.sx !== 1) || (p.d.sy && p.d.sy !== 1);
            g.globalAlpha = pa * rel(p.a);
            if (sq) { g.save(); g.translate(gx + it.w / 2, gy + it.h); g.scale(p.d.sx || 1, p.d.sy || 1); g.translate(-(gx + it.w / 2), -(gy + it.h)); }
            if (pass === 'halo') drawF(g, it.font, it.ch, gx, gy, col, { scale: it.s, halo: it.role === 'main' ? halo : 2, haloOnly: true, haloAlpha: 0.85 });
            else { drawF(g, it.font, it.ch, gx, gy, col, { scale: it.s }); out.push({ i: it.i, x: gx, y: gy, w: it.w, h: it.h, ch: it.ch, role: it.role }); }
            if (sq) g.restore();
          });
        });
        g.restore();
      };
      if (amax >= 0.999 || !API.fadeLayer) paint(ctx, function (a) { return a; });
      else API.fadeLayer(ctx, amax, { x: x0 - 12, y: y0 - 18, w: L.w + 24, h: L.h + 30 }, function (g) { paint(g, function (a) { return a / amax; }); });
      ctx.imageSmoothingEnabled = sm;
      out.sort(function (a, b) { return a.i - b.i; });
      return out;
    },

    // overlay: one wash cell. Boundary sides wobble (world-anchored, continuous between tiles), interior sides meet exactly.
    overlay: function (ctx, r, kind, t, o) {
      o = o || {}; var Ck = PAL.overlay[kind] || PAL.overlay.move, OS = this.overlayStyle, gr = o.grow == null ? 1 : o.grow;
      if (!(gr > 0)) return;
      var E = o.edges || {}, tx = o.tile ? o.tile.x : 0, ty = o.tile ? o.tile.y : 0, seed = strSeed(kind) & 0xffff, pat = o.pattern || OS.pattern;
      var a = (Ck.alpha == null ? OS.alpha : Ck.alpha) * API.ease.outCubic(gr);
      if (pat === 'pulsing' || pat === 'breathing') a *= 1 + 0.1 * Math.sin(t * 1.7 - (tx + ty) * 0.45);   // a slow breath across the set
      if (pat === 'checker' && (tx + ty) % 2) a *= 0.72;
      var pa = ctx.globalAlpha, sm = ctx.imageSmoothingEnabled; ctx.save(); ctx.imageSmoothingEnabled = true;
      var amp = OS.wobble * (0.6 + 0.4 * gr), base = cellPoly(r, E, seed, amp, 0);
      // body colour veil (keeps the hue clean over dark terrain such as water), then thin pigment layers, mottle and granulation
      polyPath(ctx, base.pts); ctx.fillStyle = rgba(PAL.paper, OS.veil * gr); ctx.fill();
      for (var l = 0; l < OS.layers; l++) { var P = l ? cellPoly(r, E, seed, amp, l).pts : base.pts; polyPath(ctx, P); ctx.fillStyle = rgba(Ck.fill, a / OS.layers * (l ? 0.8 : 1.4)); ctx.fill(); }
      polyPath(ctx, base.pts); texFill(ctx, mottleTex(Ck.fill), a * OS.mottle);
      polyPath(ctx, base.pts); texFill(ctx, granTex(Ck.edge), OS.granulation * gr);
      // pigment pooled at the boundary + a soft bleed outward
      var pts = base.pts, fl = base.flags, n = pts.length, runs = [], cur = null, seg = function (i) { return fl[i % n] && fl[(i + 1) % n]; }, s0 = 0;
      while (s0 < n && seg(s0)) s0++;   // start on a non-boundary segment so runs never wrap
      if (s0 < n) for (var i = s0; i < s0 + n; i++) { if (seg(i)) { if (!cur) { cur = [pts[i % n]]; runs.push(cur); } cur.push(pts[(i + 1) % n]); } else cur = null; }
      else runs.push(pts.concat([pts[0]]));   // a lone cell: the whole outline is boundary
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var line = function (run) { ctx.beginPath(); ctx.moveTo(run[0][0], run[0][1]); for (var k = 1; k < run.length; k++) ctx.lineTo(run[k][0], run[k][1]); };
      ctx.save(); polyPath(ctx, base.pts); ctx.clip();   // pigment drying at the edge: a darker band just inside the boundary
      runs.forEach(function (run) { if (run.length < 2) return; line(run); ctx.strokeStyle = rgba(Ck.edge, OS.pool * gr); ctx.lineWidth = 4; ctx.stroke(); line(run); ctx.lineWidth = 1.8; ctx.stroke(); });
      ctx.restore();
      runs.forEach(function (run) {
        if (run.length < 2) return;
        line(run); ctx.strokeStyle = rgba(Ck.fill, OS.bleed * gr); ctx.lineWidth = 2.2; ctx.stroke();
        line(run); ctx.strokeStyle = rgba(Ck.edge, OS.edgeAlpha * gr); ctx.lineWidth = 0.7; ctx.stroke();
      });
      ctx.restore(); ctx.imageSmoothingEnabled = sm; ctx.globalAlpha = pa;
    },

    // bar: ragged wash in a pencil-ruled well. gauge kinds charge haste slow ready queued enemy enemyFull; meter hp hpLow; null = empty
    bar: function (ctx, r, frac, kind, o) {
      o = o || {}; var B = PAL.bars, x = r.x, y = r.y, w = r.w, h = r.h, f = Math.max(0, Math.min(1, frac || 0)), seed = (Math.round(x) * 13 + Math.round(y) * 7) | 0;
      var pa = ctx.globalAlpha, sm = ctx.imageSmoothingEnabled; ctx.save(); ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = B.track; ctx.fillRect(x, y, w, h);
      wobRect(ctx, x - 0.3, y - 0.3, w + 0.6, h + 0.6, { w: 0.4, a: 0.55, j: 0.18, color: PAL.ui.rule, seed: seed, twice: false });
      if (!kind || f <= 0) {
        ctx.setLineDash([0.6, 1.6]); ink(ctx, [[x + 1.5, y + h / 2], [x + w - 1.5, y + h / 2]], { w: 0.4, a: 0.5, j: 0.1, seed: seed + 1, twice: false }); ctx.setLineDash([]);
      } else {
        var c = B[kind] || PAL.fx.hot, fw = o.px != null ? o.px : (w - 1) * f, x1 = x + 0.5 + fw, top = y + 0.6, bot = y + h - 0.6, P = [[x + 0.5, top]];
        for (var k = 1; k <= 6; k++) P.push([x + 0.5 + fw * k / 6, top + (vnoise(k * 1.7, seed, 5) - 0.5) * 0.6]);
        for (k = 0; k <= 4; k++) P.push([x1 + (vnoise(k * 2.3, seed, 9) - 0.5) * Math.min(2, fw * 0.2) - (k === 0 || k === 4 ? 0.4 : 0), top + (bot - top) * k / 4]);
        for (k = 6; k >= 0; k--) P.push([x + 0.5 + fw * k / 6, bot + (vnoise(k * 1.3, seed, 7) - 0.5) * 0.6]);
        ctx.save(); ctx.beginPath(); ctx.rect(x, y - 1, w, h + 2); ctx.clip();
        var lg = ctx.createLinearGradient(x, 0, x1, 0); lg.addColorStop(0, rgba(c, 0.55)); lg.addColorStop(0.85, rgba(c, 0.78)); lg.addColorStop(1, rgba(mix(c, PAL.ink, 0.3), 0.95));
        polyPath(ctx, P); ctx.fillStyle = lg; ctx.fill(); polyPath(ctx, P); texFill(ctx, granTex(mix(c, PAL.ink, 0.4)), 0.5);
        ink(ctx, [[x + 0.8, top + 0.2], [x1 - 0.5, top + 0.2]], { w: 0.35, a: 0.35, j: 0.15, color: '#ffffff', seed: seed + 2, twice: false });
        if (kind === 'ready' || kind === 'enemyFull') { ctx.fillStyle = rgba('#fff6dc', 0.45); ctx.fillRect(x + 1, top + 0.4, fw - 1, 0.7); }
        ctx.restore();
      }
      if (o.tag) {   // ink seal on the left end: H = haste, S = slow
        var tc = o.tag === 'slow' ? B.slow : B.haste, sx = x + 0.5, sy = y + h / 2, sr = Math.max(2.6, h * 0.62);
        ctx.fillStyle = rgba(PAL.ui.fill, 0.95); ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 7); ctx.fill();
        ctx.fillStyle = rgba(tc, 0.85); ctx.beginPath(); ctx.arc(sx, sy, sr - 0.5, 0, 7); ctx.fill();
        var tf = { family: SERIF, size: sr * 1.5, weight: 700, style: 'italic', ascent: 0.7 };
        drawF(ctx, tf, o.tag === 'slow' ? 'S' : 'H', sx - measureF(tf, o.tag === 'slow' ? 'S' : 'H') / 2, sy - sr * 0.55, '#fbf4e2', { bleed: false });
      }
      ctx.restore(); ctx.imageSmoothingEnabled = sm; ctx.globalAlpha = pa;
    },

    // cursor: 'bracket' = four tapered brush ticks breathing around the tile; 'hand' = ink pen-nib pointing right (rect = 7x5 box)
    cursor: function (ctx, r, kind, t, o) {
      o = o || {}; var pa = ctx.globalAlpha, sm = ctx.imageSmoothingEnabled, col = o.invalid ? PAL.fx.crit : PAL.ink;
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = pa * (o.alpha == null ? 1 : o.alpha);
      if (kind === 'hand') {
        var x = r.x + 0.9 * (0.5 - 0.5 * Math.cos((t || 0) * Math.PI * 2 / 1.1)), y = r.y + r.h / 2, L = r.w + 1.5, H = r.h * 0.62;   // slow eased sway, not a blink
        ctx.fillStyle = rgba(PAL.fx.crit, 0.28); ctx.beginPath(); ctx.ellipse(x + L * 0.35, y + 0.4, L * 0.48, H * 0.95, -0.1, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 1.5, y - H); ctx.quadraticCurveTo(x + L * 0.45, y - H * 1.05, x + L, y); ctx.quadraticCurveTo(x + L * 0.45, y + H * 1.05, x - 1.5, y + H); ctx.quadraticCurveTo(x - 0.5, y, x - 1.5, y - H); ctx.closePath();
        ctx.fillStyle = rgba(PAL.text.outline, 0.9); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(PAL.text.outline, 0.85); ctx.stroke();
        ctx.fillStyle = col; ctx.fill();
        ctx.strokeStyle = rgba(PAL.text.outline, 0.9); ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(x + L * 0.3, y); ctx.lineTo(x + L - 0.8, y); ctx.stroke();
        ctx.fillStyle = PAL.text.outline; ctx.beginPath(); ctx.arc(x + L * 0.3, y, 0.55, 0, 7); ctx.fill();
      } else {
        var br = 0.5 + 0.5 * Math.sin(t * 2.4), off = -0.3 - br * 0.9, X0 = r.x + off, Y0 = r.y + off, X1 = r.x + r.w - off, Y1 = r.y + r.h - off, Lt = r.w * 0.36;
        ctx.fillStyle = rgba(o.invalid ? PAL.fx.crit : PAL.fx.gold, 0.12 + 0.06 * br); ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        [[X0, Y0, 1, 1], [X1, Y0, -1, 1], [X0, Y1, 1, -1], [X1, Y1, -1, -1]].forEach(function (c, i) {
          // tapered L: thick at the corner, thinning to a flick
          ctx.fillStyle = rgba(col, 0.9); ctx.beginPath();
          ctx.moveTo(c[0] - c[2] * 0.6, c[1] - c[3] * 0.6); ctx.lineTo(c[0] + c[2] * Lt, c[1] - c[3] * 0.1); ctx.lineTo(c[0] + c[2] * Lt * 0.8, c[1] + c[3] * 0.55);
          ctx.lineTo(c[0] + c[2] * 0.9, c[1] + c[3] * 0.9); ctx.lineTo(c[0] + c[2] * 0.55, c[1] + c[3] * Lt * 0.8); ctx.lineTo(c[0] - c[3] * 0, c[1] + c[3] * Lt); ctx.closePath(); ctx.fill();
          ctx.fillStyle = rgba(col, 0.25); ctx.beginPath(); ctx.arc(c[0] + c[2] * 0.2, c[1] + c[3] * 0.2, 1.3, 0, 7); ctx.fill();
        });
      }
      ctx.restore(); ctx.imageSmoothingEnabled = sm; ctx.globalAlpha = pa;
    }
  };


  // path(ctx, points [{x, y}] native px (tile centres, start first), t seconds, {color, draw 0..1, width}) : brush-stroke move arrow
  skin.path = function (ctx, points, t, o) {
    o = o || {}; if (!points || points.length < 2) return;
    var Pc = PAL.overlay.path, col = o.color || Pc.core, sd = strSeed(JSON.stringify(points)) & 0xffff, pa = ctx.globalAlpha, sm = ctx.imageSmoothingEnabled;
    var pts = smoothPath(points, 5.5), n = pts.length, drawTo = Math.max(2, Math.round(n * (o.draw == null ? 1 : o.draw)));
    pts = pts.slice(0, drawTo); n = pts.length;
    // stop short of the end so the arrowhead owns the last tile
    var end = pts[n - 1], prev = pts[Math.max(0, n - 6)], ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]), headL = 7, cut = 0;
    while (n > 3 && Math.hypot(pts[n - 1][0] - end[0], pts[n - 1][1] - end[1]) < headL * 0.7) { n--; cut++; }
    var body = pts.slice(0, n), W0 = o.width || 3.4, left = [], right = [], total = n;
    for (var i = 0; i < n; i++) {
      var a = body[Math.max(0, i - 1)], b = body[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, u = i / Math.max(1, total - 1);
      var wob = (vnoise(i * 0.12, 1, sd) - 0.5) * 0.7, wd = W0 * (0.55 + 0.45 * Math.min(1, u * 5)) * (0.86 + 0.28 * vnoise(i * 0.07, 3, sd)) / 2;
      left.push([body[i][0] + nx * (wd + wob), body[i][1] + ny * (wd + wob)]); right.push([body[i][0] - nx * (wd - wob), body[i][1] - ny * (wd - wob)]);
    }
    var ribbon = left.concat(right.slice().reverse());
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // wet bleed halo, then the stroke body, then pooled edges and dry-brush streaks
    ctx.beginPath(); ctx.moveTo(body[0][0], body[0][1]); for (i = 1; i < n; i++) ctx.lineTo(body[i][0], body[i][1]);
    ctx.lineTo(end[0], end[1]); ctx.strokeStyle = rgba(Pc.light, 0.32); ctx.lineWidth = W0 + 3.4; ctx.stroke();
    polyPath(ctx, ribbon); ctx.fillStyle = rgba(col, 0.82); ctx.fill();
    polyPath(ctx, ribbon); texFill(ctx, granTex(Pc.dark), 0.6);
    ctx.strokeStyle = rgba(Pc.dark, 0.7); ctx.lineWidth = 0.45;
    [left, right].forEach(function (side) { ctx.beginPath(); ctx.moveTo(side[0][0], side[0][1]); for (var k = 1; k < side.length; k++) ctx.lineTo(side[k][0], side[k][1]); ctx.stroke(); });
    [-0.35, 0.3].forEach(function (f, si) {   // bristle gaps
      ctx.beginPath(); var on = false;
      for (var k = 2; k < n - 2; k++) {
        var gap = vnoise(k * 0.09, si * 7, sd + 3) > 0.52, px = body[k][0] + (left[k][0] - body[k][0]) * f * 2, py = body[k][1] + (left[k][1] - body[k][1]) * f * 2;
        if (gap) { if (!on) { ctx.moveTo(px, py); on = true; } else ctx.lineTo(px, py); } else on = false;
      }
      ctx.strokeStyle = rgba(Pc.spark, 0.4); ctx.lineWidth = 0.35; ctx.stroke();
    });
    // start: a blot where the brush landed
    ctx.fillStyle = rgba(col, 0.7); ctx.beginPath(); ctx.ellipse(body[0][0], body[0][1], 1.9, 1.6, 0.4, 0, 7); ctx.fill();
    // head: two flicks and a filled barb
    var tip = [end[0] + Math.cos(ang) * 2.2, end[1] + Math.sin(ang) * 2.2], back = function (da, L) { return [tip[0] - Math.cos(ang + da) * L, tip[1] - Math.sin(ang + da) * L]; };
    var bl = back(0.58, headL + 1), brr = back(-0.58, headL + 1), mid = back(0, headL * 0.55);
    ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.quadraticCurveTo(mid[0] + (bl[0] - mid[0]) * 0.4, mid[1] + (bl[1] - mid[1]) * 0.4, bl[0], bl[1]);
    ctx.lineTo(mid[0], mid[1]); ctx.lineTo(brr[0], brr[1]); ctx.quadraticCurveTo(mid[0] + (brr[0] - mid[0]) * 0.4, mid[1] + (brr[1] - mid[1]) * 0.4, tip[0], tip[1]); ctx.closePath();
    ctx.strokeStyle = rgba(Pc.light, 0.35); ctx.lineWidth = 2.2; ctx.stroke();
    ctx.fillStyle = rgba(col, 0.9); ctx.fill(); ctx.strokeStyle = rgba(Pc.dark, 0.8); ctx.lineWidth = 0.45; ctx.stroke();
    ctx.restore(); ctx.imageSmoothingEnabled = sm; ctx.globalAlpha = pa;
  };

  /* ---------- preview / demo helpers (skin-api v0.2: tile, unitToken, atmosphere; not used by modules) ---------- */
  var TCOL = { grass: '#bcd084', forest: '#5f8f46', water: '#86b6d4', hill: '#c99b5a', mountain: '#8f9198', road: '#d8bf8e', bridge: '#b58552', fort: '#a9a39a', sand: '#e6d29a', wall: '#8a8478', floor: '#cdbd9c' };
  // tile(ctx, rect, kind, t): paper + pigment for one map cell. Washes stay inside the cell so tiles can be drawn in any order.
  skin.tile = function (ctx, r, kind, t) {
    var x = r.x, y = r.y, w = r.w, h = r.h, sd = (Math.round(x) * 73856093 ^ Math.round(y) * 19349663) | 0, rr = rng(sd), cx = x + w / 2, cy = y + h / 2, k = w / 16, c = TCOL[kind] || TCOL.grass;
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = PAL.paper; ctx.fillRect(x, y, w, h); ctx.beginPath(); ctx.rect(x, y, w, h); texFill(ctx, grainTex(), 0.9);
    var ground = kind === 'water' || kind === 'bridge' ? TCOL.water : kind === 'road' || kind === 'sand' || kind === 'floor' || kind === 'wall' ? c : TCOL.grass;
    wash(ctx, [[x - 3, y - 3], [x + w + 3, y - 3], [x + w + 3, y + h + 3], [x - 3, y + h + 3]], ground, { layers: 4, alpha: kind === 'water' || kind === 'bridge' ? 0.16 : 0.1, v: 0.12, seed: sd, gran: 0.3 });
    if (kind === 'water' || kind === 'bridge') ink(ctx, [[x + 3 * k, cy - 1.5 * k], [x + 5 * k, cy - 2.5 * k], [x + 7 * k, cy - 1.5 * k], [x + 9 * k, cy - 2.3 * k]], { w: 0.4 * k, a: 0.5, j: 0.2, color: '#2c5d86', twice: false, seed: sd });
    if (kind === 'bridge') {
      wash(ctx, [[x, y + 3.5 * k], [x + w, y + 3.5 * k], [x + w, y + h - 3.5 * k], [x, y + h - 3.5 * k]], c, { layers: 4, alpha: 0.2, v: 0.08, edge: 0.3, seed: sd + 1 });
      ink(ctx, [[x, y + 3.4 * k], [x + w, y + 3.6 * k]], { w: 0.6 * k, a: 0.85, seed: sd + 2 }); ink(ctx, [[x, y + h - 3.4 * k], [x + w, y + h - 3.6 * k]], { w: 0.6 * k, a: 0.85, seed: sd + 3 });
    } else if (kind === 'forest') {
      [[-3.2, 1.2, 3.8], [3.2, -0.2, 3.6], [0.2, -3.4, 3.4]].sort(function (a, b) { return a[1] - b[1]; }).forEach(function (q, i) {
        var tx = cx + q[0] * k, ty = cy + q[1] * k, tr = q[2] * k;
        ink(ctx, [[tx, ty + tr * 0.6], [tx + 0.2, ty + tr + 1.6 * k]], { w: 0.6 * k, a: 0.75, j: 0.1, twice: false, seed: sd + 10 + i });
        wash(ctx, blob(tx, ty, tr, tr * 0.92, 9, i), c, { layers: 5, alpha: 0.2, v: 0.35, edge: 0.4, seed: sd + i, gran: 0.35 });
        wash(ctx, blob(tx - tr * 0.3, ty - tr * 0.3, tr * 0.5, tr * 0.45, 7), '#a9c972', { layers: 2, alpha: 0.25, v: 0.4, seed: sd + 20 + i });
        ink(ctx, blob(tx, ty, tr * 1.02, tr * 0.95, 11, i).concat([[tx + tr * 1.02, ty]]), { w: 0.45 * k, a: 0.65, j: 0.35, twice: false, seed: sd + 30 + i });
      });
    } else if (kind === 'hill' || kind === 'mountain') {
      var hh = kind === 'mountain' ? 1.6 : 1, hill = [[cx - 7 * k, cy + 4 * k], [cx - 4 * k, cy - 1.5 * k * hh], [cx - 0.5 * k, cy - 4.5 * k * hh], [cx + 3 * k, cy - 3.2 * k * hh], [cx + 6 * k, cy + 0.5 * k], [cx + 7.5 * k, cy + 4 * k]];
      wash(ctx, hill, c, { layers: 5, alpha: 0.17, v: 0.15, edge: 0.3, seed: sd, gran: 0.3 });
      if (kind === 'mountain') wash(ctx, [[cx - 2.5 * k, cy - 4 * k], [cx - 0.5 * k, cy - 7 * k], [cx + 2 * k, cy - 5 * k], [cx, cy - 3.5 * k]], '#ffffff', { layers: 3, alpha: 0.4, v: 0.1, seed: sd + 1 });
      ink(ctx, hill, { w: 0.6 * k, a: 0.8, j: 0.3, seed: sd + 2 });
      for (var j = 0; j < 3; j++) ink(ctx, [[cx + (1.5 + j * 1.6) * k, cy + (-1.8 + j * 0.9) * k], [cx + (2.5 + j * 1.6) * k, cy + 2.6 * k]], { w: 0.3 * k, a: 0.5, j: 0.1, twice: false, seed: sd + 3 + j });
    } else if (kind === 'fort' || kind === 'wall') {
      var fw = [[cx - 6 * k, cy + 5 * k], [cx - 6 * k, cy - 3 * k], [cx + 6 * k, cy - 3 * k], [cx + 6 * k, cy + 5 * k]];
      wash(ctx, fw, c, { layers: 4, alpha: 0.22, v: 0.06, edge: 0.4, seed: sd, gran: 0.4 }); ink(ctx, fw.concat([fw[0]]), { w: 0.55 * k, a: 0.85, j: 0.2, seed: sd + 1 });
      for (var m = 0; m < 3; m++) ink(ctx, [[cx + (-5 + m * 4) * k, cy - 3 * k], [cx + (-5 + m * 4) * k, cy - 5 * k], [cx + (-3 + m * 4) * k, cy - 5 * k], [cx + (-3 + m * 4) * k, cy - 3 * k]], { w: 0.5 * k, a: 0.85, j: 0.15, twice: false, seed: sd + 2 + m });
    } else if (kind === 'grass') {
      for (var g2 = 0; g2 < 2; g2++) { var gx = x + (2 + rr() * 11) * k, gy = y + (4 + rr() * 9) * k; ink(ctx, [[gx, gy], [gx - 0.6 * k, gy - 2 * k]], { w: 0.3 * k, a: 0.45, j: 0.1, color: '#4f7a34', twice: false, seed: sd + g2 }); ink(ctx, [[gx + 0.8 * k, gy], [gx + 1.3 * k, gy - 1.8 * k]], { w: 0.3 * k, a: 0.45, j: 0.1, color: '#4f7a34', twice: false, seed: sd + 5 + g2 }); }
    }
    ctx.restore();
  };
  // unitToken(ctx, rect, {team, kind, selected, dead, facing}, t): a painted pawn standing on a little wooden base
  skin.unitToken = function (ctx, r, u, t) {
    u = u || {}; var s = r.h / 19, cx = r.x + r.w / 2, by = r.y + r.h * 0.92 - (u.selected ? (0.5 - 0.5 * Math.cos((t || 0) * 3)) * 1.2 * s : 0);
    var team = PAL.team[u.team] || PAL.team.a, sd = strSeed((u.id || '') + (u.kind || '') + (u.team || '')), dark = mix(team, PAL.ink, 0.45), f = u.facing === -1 ? -1 : 1;
    var X = function (v) { return cx + v * s * f; }, Y = function (v) { return by + v * s; };
    var pa = ctx.globalAlpha; ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = pa * (u.dead ? 0.35 : 1);
    ctx.fillStyle = 'rgba(58,42,30,0.2)'; ctx.beginPath(); ctx.ellipse(X(0.6), Y(0.2), 6 * s, 1.9 * s, 0, 0, 7); ctx.fill();
    wash(ctx, blob(X(0), Y(-0.6), 5 * s, 1.7 * s, 10), '#8a6a48', { layers: 3, alpha: 0.35, v: 0.1, seed: sd + 1 });
    ink(ctx, blob(X(0), Y(-0.6), 5 * s, 1.7 * s, 14).concat([[X(5), Y(-0.6)]]), { w: 0.5 * s, a: 0.8, j: 0.15, twice: false, seed: sd + 2 });
    var body = [[X(-4), Y(-1.2)], [X(-3), Y(-6.5)], [X(-1.9), Y(-8.6)], [X(1.9), Y(-8.6)], [X(3), Y(-6.5)], [X(4), Y(-1.2)]];
    wash(ctx, body, team, { layers: 5, alpha: 0.32, v: 0.08, edge: 0.4, seed: sd + 3, gran: 0.3 });
    wash(ctx, [[X(-3.2), Y(-1.5)], [X(-2.2), Y(-7)], [X(-0.6), Y(-8.2)], [X(-0.8), Y(-1.5)]], '#ffffff', { layers: 2, alpha: 0.2, v: 0.1, seed: sd + 4 });
    ink(ctx, body, { w: 0.55 * s, a: 0.85, j: 0.2, seed: sd + 5 });
    ctx.fillStyle = '#f0d6b4'; ctx.beginPath(); ctx.arc(X(0), Y(-10.6), 2.5 * s, 0, 7); ctx.fill();
    ink(ctx, blob(X(0), Y(-10.6), 2.5 * s, 2.5 * s, 12).concat([[X(2.5 * f), Y(-10.6)]]), { w: 0.5 * s, a: 0.85, j: 0.12, twice: false, seed: sd + 6 });
    var k = u.kind || 'fighter';
    if (k === 'mage') {
      wash(ctx, [[X(-3.2), Y(-11)], [X(0.8), Y(-17.5)], [X(3.2), Y(-11)]], dark, { layers: 4, alpha: 0.3, v: 0.08, seed: sd + 7 });
      ink(ctx, [[X(-3.2), Y(-11)], [X(0.8), Y(-17.5)], [X(3.2), Y(-11)], [X(-3.2), Y(-11)]], { w: 0.5 * s, a: 0.85, j: 0.12, twice: false, seed: sd + 8 });
      ink(ctx, [[X(5), Y(-1)], [X(5.2), Y(-13)]], { w: 0.6 * s, a: 0.85, j: 0.1, color: '#6b4a2e', twice: false, seed: sd + 9 });
      ctx.fillStyle = 'rgba(122,170,214,0.85)'; ctx.beginPath(); ctx.arc(X(5.2), Y(-13.8), 1.3 * s, 0, 7); ctx.fill();
    } else if (k === 'knight') {
      wash(ctx, blob(X(0), Y(-11.6), 2.8 * s, 1.9 * s, 9), '#7c8088', { layers: 3, alpha: 0.45, v: 0.05, seed: sd + 7 });
      ink(ctx, [[X(-2.8), Y(-11)], [X(-2.4), Y(-13)], [X(0), Y(-14)], [X(2.4), Y(-13)], [X(2.8), Y(-11)]], { w: 0.5 * s, a: 0.85, j: 0.1, twice: false, seed: sd + 8 });
      ink(ctx, [[X(5), Y(-1)], [X(5.1), Y(-16)]], { w: 0.55 * s, a: 0.9, j: 0.08, color: '#5a3e26', twice: false, seed: sd + 9 });
      wash(ctx, [[X(5.1), Y(-16)], [X(9.5), Y(-14.6)], [X(5.1), Y(-13)]], '#d8a940', { layers: 3, alpha: 0.45, v: 0.1, edge: 0.5, seed: sd + 10 });
    } else if (k === 'archer') {
      ctx.strokeStyle = rgba('#5a3e26', 0.9); ctx.lineWidth = 0.6 * s; ctx.beginPath(); ctx.arc(X(4.2), Y(-7), 5 * s, -Math.PI / 2, Math.PI / 2, f < 0); ctx.stroke();
      ink(ctx, [[X(4.2), Y(-12)], [X(4.2), Y(-2)]], { w: 0.25 * s, a: 0.7, j: 0.05, twice: false, seed: sd + 9 });
    } else if (k === 'monster') {
      wash(ctx, blob(X(0), Y(-9), 5 * s, 3 * s, 9), dark, { layers: 3, alpha: 0.3, v: 0.2, seed: sd + 7 });
      ctx.fillStyle = PAL.paper; ctx.fillRect(X(-1.6), Y(-11.2), 0.9 * s, 0.9 * s); ctx.fillRect(X(0.8), Y(-11.2), 0.9 * s, 0.9 * s);
    } else {
      ink(ctx, [[X(-5), Y(-2)], [X(-5.6), Y(-12)]], { w: 0.6 * s, a: 0.9, j: 0.08, color: '#5a3e26', twice: false, seed: sd + 9 });
      wash(ctx, [[X(-5.6), Y(-12)], [X(-8.6), Y(-11.6)], [X(-8.2), Y(-8.6)], [X(-5.4), Y(-9.6)]], '#8e939c', { layers: 3, alpha: 0.5, v: 0.1, edge: 0.6, seed: sd + 10 });
    }
    ctx.restore(); ctx.globalAlpha = pa;
  };
  // atmosphere(ctx, view, t, {phase}): 'world' = pigment settles into the paper tooth + warm vignette; 'final' = nothing (UI stays clean)
  skin.atmosphere = function (ctx, v, t, o) {
    if (o && o.phase === 'final') return;
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); texFill(ctx, grainTex(), 0.45, 'multiply');
    var cx = v.x + v.w / 2, cy = v.y + v.h / 2, g = ctx.createRadialGradient(cx, cy, Math.min(v.w, v.h) * 0.4, cx, cy, Math.max(v.w, v.h) * 0.75);
    g.addColorStop(0, 'rgba(120,80,30,0)'); g.addColorStop(1, 'rgba(120,80,30,0.16)'); ctx.fillStyle = g; ctx.fillRect(v.x, v.y, v.w, v.h); ctx.restore();
  };

  var S = API.register(skin);
  // paint helpers so hosts can match terrain, props and pawns to the skin
  S.brush = { rng: rng, noise: vnoise, fbm: fbm, seed: strSeed, wash: wash, ink: ink, paper: paper, blob: blob, deform: deform, poly: polyPath, texFill: texFill, grain: grainTex, gran: granTex };
  S.numberLayout = function (text, o) { return numLayout(S, String(text), o || {}); };
})(typeof window !== 'undefined' ? window : this);
