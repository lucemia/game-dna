/* GameDNA skin 'gothic' · Dark gothic painterly · needs skin-api.js first (no other dependency)
 *
 * Near-black grounds with heavy chiaroscuro, procedural brush-noise texture, a desaturated palette with blood-red and
 * old-gold accents, candlelight glows and drifting fog. Windows are engraved dark-iron / leather plates with gold
 * filigree corners; numerals are engraved gold (or blood-red) with a smoke puff; range overlays are smoky washes with
 * glowing edges; the path is a thin gold line ending in a spearhead (the reserved path() hook). Slow, heavy motion.
 *
 * Non-pixel skin: the host scales the canvas ('fit', backing store = native x devicePixelRatio, ctx.setTransform(s,..)).
 * All drawing stays in native coordinates; textures and glyph sprites are rendered at the device scale read from the
 * current transform, so they stay sharp at any zoom. Everything is procedural; fonts are a serif stack
 * (Cinzel when the page has loaded it, else Georgia / Times).
 */
(function (root) {
  'use strict';
  var API = root.GameDNA_Skin;
  if (!API) { if (root.console) console.error('gothic.js: load skin-api.js first'); return; }
  var C = API.color, rgba = C.rgba, mix = C.mix;

  /* ---------- deterministic noise ---------- */
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function hash(str) { var h = 2166136261; str = String(str); for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mk(w, h) { return API.canvas(Math.ceil(w), Math.ceil(h)); }
  // device pixels per native pixel under the current transform (>= 1, capped so caches stay small)
  function devScale(ctx) { var m = ctx.getTransform ? ctx.getTransform() : null; var s = m ? Math.hypot(m.a, m.b) : 1; return Math.max(1, Math.min(6, Math.round(s * 2) / 2 || 1)); }

  /* ---------- palette ---------- */
  var palette = {
    ink: '#0b0709', paper: '#d8ccae',
    ui: {
      fill: '#211719', fillTo: '#0c090a', edge: '#2a1f19', highlight: '#c9a04a', shadow: 'rgba(0,0,0,0.78)',
      select: 'rgba(122,18,24,0.55)', well: 'rgba(0,0,0,0.5)',
      iron: '#3b3029', ironDark: '#120d0c', ironLight: '#6d5b48', gold: '#c9a04a', goldLight: '#f2d78e', goldDark: '#6e4c1a',
      leather: '#2a1a17', blood: '#7a1218', bloodLight: '#c0282a'
    },
    team: { a: '#7d8ea8', b: '#8e1c1f', n: '#4a4038', aLight: '#a9b8cc', aDark: '#3c4658', bLight: '#c86a5a', bDark: '#4a0c10', aText: '#c6d2e2', bText: '#e0a090' },
    overlay: {
      move: { fill: '#5d7ea8', edge: '#bcd8f4', alpha: 0.24, glaze: 0.55, smoke: 3.2, edgeAlpha: 0.9 },
      attack: { fill: '#8a1a1c', edge: '#ff7a3c', alpha: 0.22, glaze: 0.18, smoke: 2.4, edgeAlpha: 0.42, pool: 0.3 },
      threat: { fill: '#5a2c6a', edge: '#b88ae0', alpha: 0.22, glaze: 0.18, smoke: 2.6, edgeAlpha: 0.45, pool: 0.3 },
      heal: { fill: '#4a7a58', edge: '#c8ecb4', alpha: 0.24 },
      // module arrow raster colours (used by grid-range-path until it calls path())
      path: { core: '#fbe7a6', light: '#e2bd62', mid: '#b98a34', dark: '#6e4c1a', outline: '#140c08', spark: '#fff6d8' }
    },
    fx: { hot: '#e0582c', cold: '#9cc0e6', heal: '#a8d896', crit: '#c0282a', status: '#a884d0', white: '#fff3dc', ember: '#ff9a48', smoke: '#2a2224' },
    text: {
      main: '#e6dcc4', main2: '#b9ab8e', shadow: 'rgba(0,0,0,0.9)', outline: '#0a0608', dim: '#6c6256', dim2: '#544b42',
      accent: '#e8be5c', select: '#f8e2a2', title: '#e2bd62', title2: '#9c7430', label: '#a89a80', label2: '#7e705c',
      gold: '#e2bd62', gold2: '#a07a32', plate: '#e6dcc4', plateShadow: 'rgba(0,0,0,0.9)', pointer: '#f2d78e', pointerEdge: '#1a0e08'
    },
    bars: { track: '#0a0708' },
    // numeral gradients: [top highlight, upper, lower, base shade, outline, puff tint]
    numerals: {
      damage: ['#fff6d6', '#f4d27a', '#c8902e', '#6a4210', '#120a06', '#6a5448'],
      crit: ['#ffd2b8', '#e2482e', '#9a1218', '#3e0408', '#120204', '#6a2a26'],
      heal: ['#f2ffe4', '#c4e4ac', '#7aa86a', '#2e4a26', '#0a1206', '#4a5a4c'],
      mp: ['#f0f6ff', '#bcd4f0', '#6c8cb8', '#2a3a58', '#060a14', '#4a5268'],
      miss: ['#ece6dc', '#b4aca0', '#7c746a', '#3a342e', '#0c0a08', '#5a5452'],
      status: ['#f4e8ff', '#c8a8e8', '#8462b0', '#36204e', '#0c0612', '#54465e']
    }
  };

  var SERIF = "Cinzel, 'Cinzel Decorative', 'Trajan Pro', Georgia, 'Times New Roman', serif";
  var fonts = {
    ui: { type: 'canvas', family: SERIF, size: 7.5, weight: 700, letterSpacing: 0.35, uppercase: true },
    plate: { type: 'canvas', family: SERIF, size: 7, weight: 700, letterSpacing: 0.5, uppercase: true },
    num: { type: 'canvas', family: SERIF, size: 14, weight: 900 },
    label: { type: 'canvas', family: SERIF, size: 6, weight: 700, letterSpacing: 1.1, uppercase: true },
    rules: { snap: false, smoothing: true, minSize: 6, lineH: 1.5, uppercase: true, note: 'engraved serif small caps; Cinzel on the docs site, Georgia fallback in games' }
  };

  /* ---------- textures (cached per device scale) ---------- */
  var TEX = {}, DARK = {};
  // painterly brush noise: many short, curved, low-alpha strokes in warm darks + bone, plus grain; tileable (wraps)
  function brushTex(k) {
    var key = 'brush' + k; if (TEX[key]) return TEX[key];
    var N = 96, c = mk(N * k, N * k), g = c.getContext('2d'), r = rng(7331);
    g.fillStyle = '#808080'; g.fillRect(0, 0, c.width, c.height);
    g.lineCap = 'round';
    for (var i = 0; i < 520; i++) {
      var x = r() * N, y = r() * N, a = -0.7 + (r() - 0.5) * 0.9, len = 3 + r() * 11, wdt = 0.6 + r() * 2.4, light = r() < 0.42;
      g.strokeStyle = light ? 'rgba(255,236,200,' + (0.05 + r() * 0.1) + ')' : 'rgba(0,0,0,' + (0.07 + r() * 0.16) + ')';
      g.lineWidth = wdt * k;
      for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {   // wrap so the tile repeats seamlessly
        var X = (x + ox * N) * k, Y = (y + oy * N) * k, bend = (r() - 0.5) * 3 * k;
        if (X < -20 * k || X > (N + 20) * k || Y < -20 * k || Y > (N + 20) * k) continue;
        g.beginPath(); g.moveTo(X, Y);
        g.quadraticCurveTo(X + Math.cos(a) * len * k / 2 - Math.sin(a) * bend, Y + Math.sin(a) * len * k / 2 + Math.cos(a) * bend, X + Math.cos(a) * len * k, Y + Math.sin(a) * len * k);
        g.stroke();
      }
    }
    var d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    for (var j = 0; j < p.length; j += 4) { var n = (r() - 0.5) * 22; p[j] += n; p[j + 1] += n; p[j + 2] += n; }
    g.putImageData(d, 0, 0);
    return (TEX[key] = c);
  }
  // soft fog: blurred blobs, tileable
  function fogTex(k) {
    var key = 'fog' + k; if (TEX[key]) return TEX[key];
    var N = 128, c = mk(N * k, N * k), g = c.getContext('2d'), r = rng(911);
    for (var i = 0; i < 60; i++) {
      var x = r() * N, y = r() * N, rad = 6 + r() * 22, al = 0.08 + r() * 0.2;
      for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {
        var X = (x + ox * N) * k, Y = (y + oy * N) * k, R = rad * k, gr = g.createRadialGradient(X, Y, 0, X, Y, R);
        gr.addColorStop(0, 'rgba(255,255,255,' + al + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(X - R, Y - R, 2 * R, 2 * R);
      }
    }
    return (TEX[key] = c);
  }
  function pattern(ctx, tex, k, dx, dy) {
    var p = ctx.createPattern(tex, 'repeat');
    if (p && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().translate(dx || 0, dy || 0).scale(1 / k));
    return p;
  }
  // a copy of a white texture coloured with one colour (alpha kept); cached
  function tintTex(tex, col, key) {
    if (TEX['t' + key]) return TEX['t' + key];
    var c = mk(tex.width, tex.height), g = c.getContext('2d'); g.drawImage(tex, 0, 0);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
    // boost: the fog blobs are faint; stack twice
    g.globalCompositeOperation = 'source-over'; g.drawImage(c, 0, 0);
    return (TEX['t' + key] = c);
  }
  // painterly texture over a path that is already set up as the clip: multiply-ish darks and screen-ish lights
  function paintTexture(ctx, x, y, w, h, k, strength, seed) {
    var pa = ctx.globalAlpha, op = ctx.globalCompositeOperation, sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = pa * strength;
    ctx.fillStyle = pattern(ctx, brushTex(k), k, (seed || 0) * 37 % 96, (seed || 0) * 53 % 96); ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = op; ctx.globalAlpha = pa; ctx.imageSmoothingEnabled = sm;
  }

  /* ---------- shapes ---------- */
  function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); }
  // chamfered plate (cut corners): the iron frame silhouette
  function plateP(g, x, y, w, h, c) { g.beginPath(); g.moveTo(x + c, y); g.lineTo(x + w - c, y); g.lineTo(x + w, y + c); g.lineTo(x + w, y + h - c); g.lineTo(x + w - c, y + h); g.lineTo(x + c, y + h); g.lineTo(x, y + h - c); g.lineTo(x, y + c); g.closePath(); }
  // gold filigree corner: a scroll curling out from the corner along both edges, a small leaf and a bead.
  // drawn for the top-left corner in local space (0,0) = corner, +x right, +y down; size s
  function filigree(g, s, P, lw) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    var path = function () {
      g.beginPath();
      // horizontal scroll
      g.moveTo(s * 0.18, s * 0.18); g.bezierCurveTo(s * 0.55, s * 0.05, s * 0.85, s * 0.1, s * 1.05, s * 0.32);
      g.bezierCurveTo(s * 1.15, s * 0.46, s * 0.98, s * 0.6, s * 0.86, s * 0.48); g.bezierCurveTo(s * 0.78, s * 0.4, s * 0.86, s * 0.3, s * 0.94, s * 0.36);
      // vertical scroll (mirror)
      g.moveTo(s * 0.18, s * 0.18); g.bezierCurveTo(s * 0.05, s * 0.55, s * 0.1, s * 0.85, s * 0.32, s * 1.05);
      g.bezierCurveTo(s * 0.46, s * 1.15, s * 0.6, s * 0.98, s * 0.48, s * 0.86); g.bezierCurveTo(s * 0.4, s * 0.78, s * 0.3, s * 0.86, s * 0.36, s * 0.94);
      // inner leaf towards the centre of the window
      g.moveTo(s * 0.2, s * 0.2); g.quadraticCurveTo(s * 0.55, s * 0.32, s * 0.62, s * 0.62); g.quadraticCurveTo(s * 0.32, s * 0.55, s * 0.2, s * 0.2);
    };
    g.strokeStyle = P.ui.goldDark; g.lineWidth = lw * 2.2; path(); g.stroke();
    g.strokeStyle = P.ui.gold; g.lineWidth = lw; path(); g.stroke();
    g.strokeStyle = rgba(P.ui.goldLight, 0.7); g.lineWidth = lw * 0.45; g.save(); g.translate(-lw * 0.25, -lw * 0.3); path(); g.stroke(); g.restore();
    // corner bead + spike
    g.fillStyle = P.ui.goldDark; g.beginPath(); g.arc(s * 0.16, s * 0.16, s * 0.15, 0, 7); g.fill();
    var gr = g.createRadialGradient(s * 0.12, s * 0.11, 0, s * 0.16, s * 0.16, s * 0.13); gr.addColorStop(0, P.ui.goldLight); gr.addColorStop(0.6, P.ui.gold); gr.addColorStop(1, P.ui.goldDark);
    g.fillStyle = gr; g.beginPath(); g.arc(s * 0.16, s * 0.16, s * 0.11, 0, 7); g.fill();
  }
  function rivet(g, x, y, r, P) {
    var gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r); gr.addColorStop(0, P.ui.goldLight); gr.addColorStop(0.5, P.ui.gold); gr.addColorStop(1, P.ui.goldDark);
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(x + r * 0.25, y + r * 0.35, r, 0, 7); g.fill();
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  function withSmooth(ctx, fn) { var sm = ctx.imageSmoothingEnabled; ctx.save(); ctx.imageSmoothingEnabled = true; try { return fn(); } finally { ctx.restore(); ctx.imageSmoothingEnabled = sm; } }

  /* ---------- text helpers ---------- */
  function fontOf(skin, name) { return skin.fonts[name || 'ui'] || skin.fonts.ui; }
  function cssOf(f, scale) { return API.font.css(f, scale); }
  function prep(s, f) { s = String(s); return f.uppercase ? s.toUpperCase() : s; }

  /* ---------- glyph sprites for numerals (engraved, rendered at device scale) ---------- */
  var GLY = {};
  function numeral(skin, ch, kind, scale, k, flash) {
    var key = [ch, kind, scale, k, flash ? 1 : 0, skin.fonts.num.family].join('|'); if (GLY[key]) return GLY[key];
    var f = fontOf(skin, 'num'), R = skin.palette.numerals[kind] || skin.palette.numerals.damage, size = f.size * scale;
    var meas = mk(4, 4).getContext('2d'); meas.font = cssOf(f, scale);
    var w = meas.measureText(ch).width, pad = 3 * scale, W = w + pad * 2, H = size * 1.25 + pad * 2;
    var c = mk(W * k, H * k), g = c.getContext('2d');
    g.scale(k, k); g.font = cssOf(f, scale); g.textBaseline = 'alphabetic';
    var bx = pad, by = pad + size * 1.0;   // baseline
    // 1. dark outline (stroke under everything) + soft drop
    g.lineJoin = 'round'; g.strokeStyle = R[4]; g.lineWidth = 2.4 * Math.max(1, scale * 0.8);
    g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 2.5 * k; g.shadowOffsetY = 0.8 * k;
    g.strokeText(ch, bx, by); g.shadowColor = 'transparent';
    // 2. metal fill: vertical gradient top highlight -> base shade
    var top = by - size * 0.74, gr = g.createLinearGradient(0, top, 0, by);
    if (flash) { gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#ffe8c0'); }
    else { gr.addColorStop(0, R[0]); gr.addColorStop(0.32, R[1]); gr.addColorStop(0.62, R[2]); gr.addColorStop(1, R[3]); }
    g.fillStyle = gr; g.fillText(ch, bx, by);
    // 3. engraved inner shadow: the glyph shifted down-right in dark, kept only inside the glyph
    if (!flash) {
      var c2 = mk(W * k, H * k), g2 = c2.getContext('2d'); g2.scale(k, k); g2.font = g.font;
      g2.fillStyle = '#000'; g2.fillText(ch, bx, by);
      g2.globalCompositeOperation = 'destination-out'; g2.fillText(ch, bx - 0.55 * scale, by - 0.7 * scale);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.6; g.drawImage(c2, 0, 0); g.restore();
      // top bevel light
      var c3 = mk(W * k, H * k), g3 = c3.getContext('2d'); g3.scale(k, k); g3.font = g.font;
      g3.fillStyle = R[0]; g3.fillText(ch, bx, by);
      g3.globalCompositeOperation = 'destination-out'; g3.fillText(ch, bx + 0.35 * scale, by + 0.55 * scale);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.85; g.drawImage(c3, 0, 0); g.restore();
      // 4. a little worn texture inside the metal
      var c4 = mk(W * k, H * k), g4 = c4.getContext('2d');
      g4.fillStyle = g4.createPattern(brushTex(k), 'repeat'); g4.fillRect(0, 0, c4.width, c4.height);
      g4.globalCompositeOperation = 'destination-in'; g4.drawImage(c, 0, 0);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.55; g.drawImage(c4, 0, 0); g.restore();
    }
    return (GLY[key] = { c: c, w: w, W: W, H: H, ox: pad, oy: pad, k: k, size: size, asc: size * 0.74 });
  }
  // smoke puff behind a number: a few overlapping soft blobs, deterministic per seed
  function puff(ctx, cx, cy, w, h, tint, alpha, seed) {
    var r = rng(seed), pa = ctx.globalAlpha;
    for (var i = 0; i < 7; i++) {
      var x = cx + (r() - 0.5) * w * 0.9, y = cy + (r() - 0.35) * h * 0.55, R = h * (0.35 + r() * 0.35);
      var g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, rgba(tint, 0.55)); g.addColorStop(0.6, rgba(tint, 0.22)); g.addColorStop(1, rgba(tint, 0));
      ctx.globalAlpha = pa * alpha; ctx.fillStyle = g; ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
    }
    ctx.globalAlpha = pa;
  }


  /* ---------- unframed bands: selected menu row, inset well ---------- */
  function band(skin, ctx, r, st) {
    var P = skin.palette, U = P.ui, x = r.x, y = r.y, w = r.w, h = r.h;
    withSmooth(ctx, function () {
      ctx.globalAlpha *= (st.alpha == null ? 1 : st.alpha) * (st.disabled ? 0.5 : 1);
      if (st.role === 'row') {   // blood-red glaze fading out at both ends, gold hairlines, a candle-lit centre
        var g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, rgba(U.blood, 0)); g.addColorStop(0.12, rgba(U.blood, 0.75)); g.addColorStop(0.6, rgba(U.blood, 0.6)); g.addColorStop(1, rgba(U.blood, 0));
        ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
        var v = ctx.createLinearGradient(0, y, 0, y + h); v.addColorStop(0, 'rgba(255,170,110,0.18)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = v; ctx.fillRect(x, y, w, h);
        var gl = ctx.createLinearGradient(x, 0, x + w, 0); gl.addColorStop(0, rgba(U.gold, 0)); gl.addColorStop(0.2, rgba(U.goldLight, st.focus ? 0.8 : 0.5)); gl.addColorStop(0.8, rgba(U.gold, st.focus ? 0.7 : 0.4)); gl.addColorStop(1, rgba(U.gold, 0));
        ctx.fillStyle = gl; ctx.fillRect(x, y, w, 0.4); ctx.fillRect(x, y + h - 0.4, w, 0.4);
      } else {   // inset well: dark, inner shadow on top, faint gold line at the bottom
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y, w, h);
        var s2 = ctx.createLinearGradient(0, y, 0, y + Math.min(4, h)); s2.addColorStop(0, 'rgba(0,0,0,0.7)'); s2.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = s2; ctx.fillRect(x, y, w, Math.min(4, h));
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 0.5; ctx.strokeRect(x + 0.25, y + 0.25, w - 0.5, h - 0.5);
        ctx.fillStyle = rgba(U.gold, 0.35); ctx.fillRect(x + 1, y + h - 0.4, w - 2, 0.4);
      }
    });
    return { x: x, y: y, w: w, h: h };
  }

  /* ---------- scene art: terrain cells ---------- */
  var TERR = {
    grass: '#24211a', floor: '#2a2224', road: '#2e2824', sand: '#2c2924', forest: '#1e1c16', hill: '#262119',
    mountain: '#24211c', water: '#06080b', bridge: '#06080b', fort: '#23201f', wall: '#1c1719'
  };
  function cellSeed(r, kind) { return hash(Math.round(r.x) + ',' + Math.round(r.y) + kind); }
  function blades(g, x, y, w, h, R, n, cols) {   // dry, dead grass strokes
    g.lineCap = 'round';
    for (var i = 0; i < n; i++) {
      var bx = x + R() * w, by = y + 3 + R() * (h - 3), L = 1.5 + R() * 3, lean = (R() - 0.5) * 2;
      g.strokeStyle = cols[i % cols.length]; g.lineWidth = 0.35 + R() * 0.3;
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + lean * 0.4, by - L * 0.6, bx + lean, by - L); g.stroke();
    }
  }
  function stones(g, x, y, w, h, R, rows, cols, base) {   // flagstones / cobbles with dark joints and a lit top edge
    var cw = w / cols, rh = h / rows;
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
      var off = (j % 2) * cw * 0.5, sx = x + i * cw - off, sy = y + j * rh, v = (R() - 0.5) * 0.18;
      g.fillStyle = mix(base, v > 0 ? '#6a5a50' : '#000000', Math.abs(v)); g.beginPath(); rrect(g, sx + 0.4, sy + 0.4, cw - 0.8, rh - 0.8, Math.min(cw, rh) * 0.25); g.fill();
      g.fillStyle = 'rgba(255,220,180,0.05)'; g.fillRect(sx + 0.8, sy + 0.5, cw - 1.6, 0.4);
    }
  }
  function moss(g, x, y, w, h, R, n) { for (var i = 0; i < n; i++) { g.fillStyle = 'rgba(' + (52 + R() * 20 | 0) + ',' + (64 + R() * 20 | 0) + ',40,' + (0.25 + R() * 0.25) + ')'; g.beginPath(); g.ellipse(x + R() * w, y + R() * h, 0.8 + R() * 2, 0.6 + R() * 1.2, R() * 3, 0, 7); g.fill(); } }
  function deadTree(g, cx, by, sc, R) {
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.ellipse(cx + 1.5, by, 5 * sc, 1.6 * sc, 0, 0, 7); g.fill();
    g.strokeStyle = '#17110e'; g.lineCap = 'round';
    var branch = function (x, y, a, L, wdt, d) {
      if (d > 3 || L < 1) return;
      var x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
      g.lineWidth = wdt; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + x2) / 2 + (R() - 0.5) * 1.5, (y + y2) / 2, x2, y2); g.stroke();
      branch(x2, y2, a - 0.45 - R() * 0.3, L * 0.68, wdt * 0.62, d + 1); branch(x2, y2, a + 0.4 + R() * 0.35, L * 0.62, wdt * 0.6, d + 1);
    };
    branch(cx, by, -Math.PI / 2 + (R() - 0.5) * 0.2, 5.5 * sc, 1.6 * sc, 0);
    g.strokeStyle = 'rgba(190,160,120,0.45)'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(cx - 0.5, by); g.lineTo(cx - 0.6, by - 5 * sc); g.stroke();   // faint rim on the trunk
  }

  /* ---------- scene art: unit figures ---------- */
  function figure(g, u, x, y, w, h, t, P) {
    var team = u.team || 'a', kind = u.kind || 'fighter', f = u.facing === -1 ? -1 : 1;
    var cloak = team === 'b' ? '#3c1012' : team === 'n' ? '#332c26' : '#34425a', cloak2 = team === 'b' ? '#120406' : team === 'n' ? '#16120f' : '#0f131c';
    var rimC = team === 'b' ? 'rgba(244,214,170,0.95)' : team === 'n' ? 'rgba(232,200,140,0.7)' : 'rgba(188,216,244,0.85)';
    var eye = team === 'b' ? '#ff3a2a' : '#e6dcc4', cx = x + w / 2, by = y + h * 0.94, hunch = kind === 'fighter' && team === 'b';
    var body = function () {
      g.beginPath();
      if (hunch) {   // hulking ghoul: wide low back, head thrust forward
        g.moveTo(cx - f * w * 0.4, by); g.quadraticCurveTo(cx - f * w * 0.48, by - h * 0.46, cx - f * w * 0.08, by - h * 0.64);
        g.quadraticCurveTo(cx + f * w * 0.28, by - h * 0.7, cx + f * w * 0.36, by - h * 0.44); g.quadraticCurveTo(cx + f * w * 0.42, by - h * 0.18, cx + f * w * 0.34, by);
      } else {
        g.moveTo(cx - w * 0.36, by); g.quadraticCurveTo(cx - w * 0.33, by - h * 0.4, cx - w * 0.2, by - h * 0.6);
        g.lineTo(cx + w * 0.2, by - h * 0.6); g.quadraticCurveTo(cx + w * 0.33, by - h * 0.4, cx + w * 0.36, by);
      }
      g.closePath();
    };
    var hx = hunch ? cx + f * w * 0.22 : cx, hy = hunch ? by - h * 0.6 : by - h * 0.7, hr = w * (hunch ? 0.17 : 0.19);
    var head = function () {
      g.beginPath();
      if (kind === 'mage') { g.moveTo(hx - hr, hy + hr * 0.9); g.quadraticCurveTo(hx - hr * 1.1, hy - hr * 0.5, hx + f * hr * 0.4, hy - hr * 1.9); g.quadraticCurveTo(hx + hr * 1.1, hy - hr * 0.2, hx + hr, hy + hr * 0.9); g.closePath(); }
      else g.arc(hx, hy, hr, 0, 7);
    };
    // body + head: dark gradient, then the brush texture, then the rim light
    var gr = g.createLinearGradient(0, by - h * 0.75, 0, by); gr.addColorStop(0, cloak); gr.addColorStop(1, cloak2);
    g.fillStyle = gr; body(); g.fill();
    g.fillStyle = team === 'a' && kind === 'knight' ? '#3a4252' : mix(cloak, '#000000', 0.15); head(); g.fill();
    // folds
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(cx - w * 0.08, by - h * 0.5); g.lineTo(cx - w * 0.14, by - 0.5); g.moveTo(cx + w * 0.1, by - h * 0.45); g.lineTo(cx + w * 0.16, by - 0.5); g.stroke();
    // rim light on the lit side (from the upper left by default, or toward the nearest light)
    var side = u._lightSide || -1;
    g.save(); g.beginPath(); g.rect(side < 0 ? x - 4 : cx, y - 6, w / 2 + 4, h + 8); g.clip();
    g.strokeStyle = rimC; g.lineWidth = team === 'b' ? 1.0 : 0.7; g.shadowColor = rimC; g.shadowBlur = team === 'b' ? 3 : 2; body(); g.stroke(); head(); g.stroke(); g.restore();
    if (team === 'b') { g.strokeStyle = 'rgba(232,206,170,0.45)'; g.lineWidth = 0.5; body(); g.stroke(); head(); g.stroke(); }   // faint bone edge all round: readable on red cells
    // face: shadowed hood / helm slit with eyes
    g.fillStyle = '#050304'; g.beginPath(); g.ellipse(hx + f * hr * 0.2, hy + hr * 0.15, hr * 0.62, hr * 0.55, 0, 0, 7); g.fill();
    g.fillStyle = eye; g.shadowColor = eye; g.shadowBlur = team === 'b' ? 3 : 1.5;
    g.fillRect(hx + f * hr * 0.05 - 0.45, hy + hr * 0.05, 0.8, 0.55); g.fillRect(hx + f * hr * 0.5 - 0.35, hy + hr * 0.05, 0.8, 0.55);
    g.shadowBlur = 0; g.shadowColor = 'transparent';
    var U = P.ui, wx = cx + f * w * 0.38;
    if (kind === 'knight') {
      g.fillStyle = team === 'a' ? U.gold : U.blood; g.beginPath(); g.moveTo(hx - 0.4, hy - hr); g.quadraticCurveTo(hx - f * 2, hy - hr - 2.5, hx - f * 3.4, hy - hr + 0.6); g.lineTo(hx + 0.4, hy - hr + 0.4); g.fill();   // crest
      g.strokeStyle = '#b8bcc4'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(wx, by - h * 0.22); g.lineTo(wx + f * 1.5, by - h * 0.78); g.stroke();      // blade
      g.fillStyle = U.gold; g.fillRect(wx - 1.3, by - h * 0.27, 2.6, 0.6);                                                                               // guard
      var sx = cx - f * w * 0.24; g.fillStyle = team === 'a' ? '#1c2434' : '#2a0a0c'; g.beginPath(); g.moveTo(sx - 2.4, by - h * 0.5); g.lineTo(sx + 2.4, by - h * 0.5); g.lineTo(sx + 2, by - h * 0.3); g.lineTo(sx, by - h * 0.18); g.lineTo(sx - 2, by - h * 0.3); g.closePath(); g.fill();
      g.strokeStyle = rgba(U.gold, 0.8); g.lineWidth = 0.35; g.stroke();
    } else if (kind === 'mage') {
      var orb = team === 'b' ? '#b88ae0' : '#9cc0e6';
      g.strokeStyle = '#3a2c20'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(wx, by); g.lineTo(wx, by - h * 0.82); g.stroke();
      var og = g.createRadialGradient(wx, by - h * 0.86, 0, wx, by - h * 0.86, 3.6); og.addColorStop(0, '#ffffff'); og.addColorStop(0.3, orb); og.addColorStop(1, rgba(orb, 0));
      g.fillStyle = og; g.fillRect(wx - 4, by - h * 0.86 - 4, 8, 8);
    } else if (kind === 'archer') {
      g.strokeStyle = '#3a2c20'; g.lineWidth = 0.6; g.beginPath(); g.arc(wx - f * 1, by - h * 0.45, h * 0.24, -Math.PI / 2, Math.PI / 2, f < 0); g.stroke();
      g.strokeStyle = 'rgba(230,220,196,0.5)'; g.lineWidth = 0.25; g.beginPath(); g.moveTo(wx - f, by - h * 0.69); g.lineTo(wx - f, by - h * 0.21); g.stroke();
    } else {   // fighter / monster: clawed arms
      g.strokeStyle = cloak; g.lineWidth = 1.1; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx + f * w * 0.2, by - h * 0.45); g.lineTo(cx + f * w * 0.46, by - h * 0.18); g.moveTo(cx - f * w * 0.24, by - h * 0.42); g.lineTo(cx - f * w * 0.38, by - h * 0.12); g.stroke();
      g.strokeStyle = '#c8bca4'; g.lineWidth = 0.3; for (var c = -1; c <= 1; c++) { g.beginPath(); g.moveTo(cx + f * w * 0.46, by - h * 0.18); g.lineTo(cx + f * w * 0.52 + c * 0.3, by - h * 0.1 + c * 0.6); g.stroke(); }
    }
  }


  /* ---------- scene art: props (SPEC v0.4) ---------- */
  function nearestLight(L, x, y) { var b = null, bd = 1e9; (L || []).forEach(function (l) { if (l.kind === 'magic' || (l.r && l.r < 28)) return; var d = Math.hypot(l.x - x, l.y - y); if (d < bd) { bd = d; b = l; } }); return b && bd < 110 ? b : null; }
  // fill a silhouette with a lit gradient, then rim it: a bone rim from the upper left, a coloured rim toward the nearest light
  function litShape(g, path, x, y, w, h, base, dark, nl, cx) {
    // rims are stroked first and the body filled over them, so only the outer half of each rim shows (no inner seams)
    g.lineJoin = 'round';
    g.save(); g.beginPath(); g.rect(x - 4, y - 4, w * 0.55 + 4, h + 8); g.clip();
    g.strokeStyle = 'rgba(232,210,170,0.6)'; g.lineWidth = 1.3; path(); g.stroke(); g.restore();
    if (nl) {
      var side = nl.x < cx ? -1 : 1, col = nl.col || '#ffb860';
      g.save(); g.beginPath(); g.rect(side < 0 ? x - 4 : cx, y - 4, w / 2 + 4, h + 8); g.clip();
      g.shadowColor = col; g.shadowBlur = 3 * devScale(g); g.strokeStyle = rgba(col, 0.9); g.lineWidth = 1.7; path(); g.stroke(); g.restore();
    }
    var gr = g.createLinearGradient(x, y, x + w * 0.6, y + h); gr.addColorStop(0, base); gr.addColorStop(1, dark);
    g.fillStyle = gr; path(); g.fill();
    g.save(); path(); g.clip(); paintTexture(g, x - 2, y - 2, w + 4, h + 4, devScale(g), 0.8, Math.round(x * 7 + y)); g.restore();
  }
  function flame(g, x, y, t, col, sz, seed) {
    var fl = 0.86 + 0.14 * Math.sin(t * 7.3 + seed) * Math.sin(t * 3.1 + 1), c0 = col === 'cold' ? '#ffffff' : '#fff2c0', c1 = col === 'cold' ? '#7ae8ff' : '#ff9a48';
    g.globalCompositeOperation = 'lighter';
    var hl = g.createRadialGradient(x, y, 0, x, y, 12 * sz * fl); hl.addColorStop(0, rgba(c1, 0.45)); hl.addColorStop(1, rgba(c1, 0)); g.fillStyle = hl; g.fillRect(x - 13 * sz, y - 13 * sz, 26 * sz, 26 * sz);
    g.globalCompositeOperation = 'source-over';
    var f = g.createRadialGradient(x, y, 0, x, y, 4.4 * sz * fl); f.addColorStop(0, c0); f.addColorStop(0.45, c1); f.addColorStop(1, rgba(c1, 0));
    g.fillStyle = f; g.beginPath(); g.ellipse(x, y - 1 * sz, 2.5 * sz * fl, 4.4 * sz * fl, Math.sin(t * 2 + seed) * 0.12, 0, 7); g.fill();
    if (col !== 'cold') {   // embers
      var R = rng(97 + seed); g.globalCompositeOperation = 'lighter';
      for (var e = 0; e < 6; e++) { var ph = (t * (0.35 + R() * 0.3) + R()) % 1, ex = x + (R() - 0.5) * 4 + Math.sin(t * 2 + e) * 1.5 * ph, ey = y - 3 - ph * 16; g.fillStyle = 'rgba(255,' + (140 + R() * 80 | 0) + ',60,' + (0.85 * (1 - ph)) + ')'; g.fillRect(ex, ey, 0.6, 0.6); }
      g.globalCompositeOperation = 'source-over';
    }
  }
  function drawProp(g, r, kind, t, o) {
    var x = r.x, w = r.w, h = r.h, foot = r.y + h - 1.5, cx = x + w / 2, R = rng(1 + (o.seed || 0) * 2654435761 % 1e6), lights = o.lights || [];
    var nl = o.light ? null : nearestLight(lights, cx, foot - 8);
    var shadow = function (sw) { var sg = g.createRadialGradient(cx + 1.5, foot, 0, cx + 1.5, foot, sw); sg.addColorStop(0, 'rgba(0,0,0,0.75)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sg; g.beginPath(); g.ellipse(cx + 1.5, foot, sw, sw * 0.32, 0, 0, 7); g.fill(); };
    if (kind === 'bush') {   // thorn bush: tangled dark mound, thorns, a few blood berries
      shadow(8);
      var blobs = []; for (var i = 0; i < 6; i++) blobs.push([cx + (R() - 0.5) * 9, foot - 3 - R() * 6, 3 + R() * 2.5]);
      var bp = function () { g.beginPath(); blobs.forEach(function (b) { g.moveTo(b[0] + b[2], b[1]); g.arc(b[0], b[1], b[2], 0, 7); }); };
      litShape(g, bp, x, foot - 14, w, 14, '#2e3324', '#0c0e09', nl, cx);
      g.strokeStyle = '#0a0806'; g.lineWidth = 0.45; g.lineCap = 'round';
      for (var j = 0; j < 9; j++) { var a0 = -Math.PI * (0.1 + R() * 0.8), bx = cx + (R() - 0.5) * 8, by = foot - 4 - R() * 5, L = 3 + R() * 3; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a0) * L, by + Math.sin(a0) * L); g.stroke(); }
      g.strokeStyle = 'rgba(210,190,150,0.5)'; g.lineWidth = 0.3; for (var q = 0; q < 6; q++) { var tx = cx + (R() - 0.5) * 12, ty = foot - 3 - R() * 9; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + (R() - 0.5) * 2, ty - 1.2); g.stroke(); }
      for (var bb = 0; bb < 4; bb++) { var ex = cx + (R() - 0.5) * 9, ey = foot - 4 - R() * 6; g.fillStyle = '#8e1418'; g.beginPath(); g.arc(ex, ey, 0.7, 0, 7); g.fill(); g.fillStyle = 'rgba(255,170,150,0.8)'; g.fillRect(ex - 0.3, ey - 0.4, 0.3, 0.3); }
      return;
    }
    if (kind === 'tree') {   // gnarled tree rising one cell above its foot
      shadow(9);
      g.strokeStyle = '#1e1612'; g.lineCap = 'round';
      var segs = [];
      var br = function (bx, by, a, L, wd, d) { if (d > 4 || L < 1.2) return; var x2 = bx + Math.cos(a) * L, y2 = by + Math.sin(a) * L, mx = (bx + x2) / 2 + (R() - 0.5) * 2, my = (by + y2) / 2; segs.push([bx, by, mx, my, x2, y2, wd]); br(x2, y2, a - 0.5 - R() * 0.35, L * 0.7, wd * 0.62, d + 1); br(x2, y2, a + 0.45 + R() * 0.35, L * 0.66, wd * 0.6, d + 1); };
      br(cx, foot, -Math.PI / 2 + (R() - 0.5) * 0.25, 9, 2.6, 0);
      segs.forEach(function (sg) { g.lineWidth = sg[6]; g.beginPath(); g.moveTo(sg[0], sg[1]); g.quadraticCurveTo(sg[2], sg[3], sg[4], sg[5]); g.stroke(); });
      // rim: bone on the upper-left edges, light colour toward the nearest light
      var rimSide = nl ? (nl.x < cx ? -1 : 1) : -1, rc = nl ? rgba(nl.col || '#ffb860', 0.8) : 'rgba(232,210,170,0.55)';
      g.strokeStyle = rc; g.shadowColor = rc; g.shadowBlur = 2 * devScale(g);
      segs.forEach(function (sg) { g.lineWidth = Math.max(0.35, sg[6] * 0.28); var off = rimSide * sg[6] * 0.35; g.beginPath(); g.moveTo(sg[0] + off, sg[1]); g.quadraticCurveTo(sg[2] + off, sg[3], sg[4] + off, sg[5]); g.stroke(); });
      g.shadowBlur = 0; g.shadowColor = 'transparent';
      g.fillStyle = '#1e1612'; g.beginPath(); g.moveTo(cx - 3, foot); g.quadraticCurveTo(cx - 1, foot - 3, cx, foot - 5); g.quadraticCurveTo(cx + 1, foot - 3, cx + 3, foot); g.closePath(); g.fill();   // root flare
      return;
    }
    if (kind === 'brazier' || kind === 'lamp' || kind === 'crystal') {
      var Lt = o.light, lx = Lt ? Lt.x : cx, ly = Lt ? Lt.y : foot - 12;
      if (kind === 'brazier') {   // iron tripod bowl; the flame sits at the light's point (or the bowl)
        shadow(6); var bowlY = Math.min(foot - 6, Math.max(foot - 12, ly + 2)), U = { gold: '#c9a04a', goldDark: '#6e4c1a' };
        g.strokeStyle = '#140e0b'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(cx - 3.5, foot); g.lineTo(cx, bowlY + 2); g.lineTo(cx + 3.5, foot); g.moveTo(cx, foot); g.lineTo(cx, bowlY + 2); g.stroke();
        var bp2 = function () { g.beginPath(); g.moveTo(cx - 4.4, bowlY - 1); g.lineTo(cx + 4.4, bowlY - 1); g.quadraticCurveTo(cx + 3.6, bowlY + 2.8, cx, bowlY + 3); g.quadraticCurveTo(cx - 3.6, bowlY + 2.8, cx - 4.4, bowlY - 1); g.closePath(); };
        litShape(g, bp2, cx - 4.5, bowlY - 1, 9, 4, '#4a3a2c', '#140e0b', null, cx);
        g.fillStyle = U.gold; g.fillRect(cx - 4.4, bowlY - 1.3, 8.8, 0.45);
        g.fillStyle = '#ff7a30'; g.beginPath(); g.ellipse(cx, bowlY - 1, 3.6, 0.9, 0, 0, 7); g.fill();   // coals
        flame(g, cx, bowlY - 4, t, 'warm', 1, o.seed || 1);
      } else if (kind === 'lamp') {   // iron post with a caged lantern
        shadow(5); var top = Math.max(r.y - h * 0.6, Math.min(foot - 14, ly - 4));
        g.fillStyle = '#140e0b'; g.fillRect(cx - 0.6, top + 4, 1.2, foot - top - 4); g.fillRect(cx - 2.2, foot - 1, 4.4, 1);
        g.strokeStyle = 'rgba(232,210,170,0.45)'; g.lineWidth = 0.3; g.beginPath(); g.moveTo(cx - 0.6, top + 5); g.lineTo(cx - 0.6, foot - 1); g.stroke();
        g.fillStyle = '#1a120e'; g.beginPath(); g.moveTo(cx - 3, top - 1); g.lineTo(cx, top - 3.5); g.lineTo(cx + 3, top - 1); g.closePath(); g.fill();   // cap
        flame(g, cx, top + 1.6, t, 'warm', 0.75, o.seed || 2);
        g.strokeStyle = '#1a120e'; g.lineWidth = 0.6; g.strokeRect(cx - 2.6, top - 1, 5.2, 5.2); g.beginPath(); g.moveTo(cx, top - 1); g.lineTo(cx, top + 4.2); g.stroke();
        g.fillStyle = '#c9a04a'; g.fillRect(cx - 2.8, top + 4, 5.6, 0.5);
      } else {   // witch-crystal: pale shards on a dark plinth, cold glow
        shadow(6);
        var pp = function () { g.beginPath(); g.moveTo(cx - 5, foot); g.lineTo(cx - 4, foot - 4); g.lineTo(cx + 4, foot - 4); g.lineTo(cx + 5, foot); g.closePath(); };
        litShape(g, pp, cx - 5, foot - 4, 10, 4, '#3a3432', '#0e0c0c', null, cx);
        var shard = function (sx, sy, sw, sh, lean) { g.beginPath(); g.moveTo(sx - sw, sy); g.lineTo(sx + lean - sw * 0.3, sy - sh); g.lineTo(sx + lean + sw * 0.4, sy - sh * 0.92); g.lineTo(sx + sw, sy); g.closePath(); };
        [[cx, foot - 4, 1.6, 11, 0.6], [cx - 2.4, foot - 4, 1.1, 6.5, -1.4], [cx + 2.4, foot - 4, 1, 5.5, 1.3]].forEach(function (c) {
          shard(c[0], c[1], c[2], c[3], c[4]); var cg = g.createLinearGradient(c[0] - 2, c[1] - c[3], c[0] + 2, c[1]); cg.addColorStop(0, '#f0ffff'); cg.addColorStop(0.4, '#7ae8ff'); cg.addColorStop(1, '#1e4a66'); g.fillStyle = cg; g.fill();
          g.strokeStyle = 'rgba(220,250,255,0.8)'; g.lineWidth = 0.3; g.stroke();
        });
        flame(g, cx, foot - 10, t, 'cold', 0.8, o.seed || 3);
      }
      return;
    }
    // stone / rock / unknown: a leaning tombstone with an engraved cross and moss
    shadow(7);
    var lean = (R() - 0.5) * 0.12, sw2 = 5.2, sh2 = 13;
    var tp = function () { g.beginPath(); g.moveTo(cx - sw2, foot); g.lineTo(cx - sw2 + lean * 10, foot - sh2 + sw2); g.arc(cx + lean * 10, foot - sh2 + sw2, sw2, Math.PI, 0); g.lineTo(cx + sw2, foot); g.closePath(); };
    litShape(g, tp, cx - sw2, foot - sh2, sw2 * 2, sh2, '#6a625a', '#1a1614', nl, cx);
    g.strokeStyle = 'rgba(0,0,0,0.65)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(cx + lean * 6, foot - sh2 + 3); g.lineTo(cx + lean * 3, foot - 4); g.moveTo(cx - 2.4 + lean * 5, foot - sh2 + 5.8); g.lineTo(cx + 2.4 + lean * 5, foot - sh2 + 5.8); g.stroke();
    g.strokeStyle = 'rgba(232,210,170,0.3)'; g.lineWidth = 0.3; g.beginPath(); g.moveTo(cx + lean * 6 + 0.5, foot - sh2 + 3); g.lineTo(cx + lean * 3 + 0.5, foot - 4); g.stroke();
    moss(g, cx - sw2, foot - 4, sw2 * 2, 4, R, 4);
    g.fillStyle = '#2a2420'; g.beginPath(); g.ellipse(cx, foot, sw2 + 1.5, 1.4, 0, 0, 7); g.fill();   // earth at the foot
  }

  /* ---------- the skin ---------- */
  var gothic = {
    id: 'gothic', name: 'Dark gothic painterly', pixel: false,
    native: { w: 256, h: 224, scale: 'fit', smoothing: true, snap: 0, minScale: 2 },
    palette: palette, fonts: fonts,
    frameRoles: ['row', 'backing'],
    shape: { radius: 0, chamfer: 3, edgeWidth: 2, padding: 6, barRadius: 1, plateChamfer: 2 },
    overlayStyle: { mode: 'wash', pattern: 'pulsing', edgeWidth: 1, edgeAlpha: 0.9, smoke: 0.4, drift: 3 },
    particles: { shape: 'blob', size: [1, 3.5], count: 0.8, snap: false, blend: 'lighter', glow: 0.7, gravity: -0.015, drag: 0.04, life: [700, 1600], colors: ['fx.ember', 'fx.hot', 'ui.gold'], trail: 3, smoke: 'fx.smoke' },
    outline: { text: { width: 0 }, number: { width: 1.2, max: 2, drop: 1, mode: 'stroke', color: 'text.outline' }, sprite: { width: 1, color: 'ink', mode: 'stroke' } },
    shadow: { text: { dx: 0, dy: 0.6, blur: 2 }, window: { dx: 0, dy: 2, blur: 10 }, sprite: { kind: 'cast', alpha: 0.55 } },
    motion: { stepMs: 0, snap: false, ease: { move: 'inOutQuad', pop: 'outCubic', fade: 'inOutQuad' }, fadeSteps: null, shakeInt: false, flashMax: 0.3, speed: 0.6 },

    measure: function (str, o) {
      o = o || {}; var f = fontOf(this, o.font), s = prep(str, f);
      var g = mk(4, 4).getContext('2d'); g.font = cssOf(f, o.scale);
      return g.measureText(s).width + (f.letterSpacing || 0) * (o.scale || 1) * Math.max(0, s.length - 1);
    },

    // text: engraved serif. color2 = gilded vertical gradient (top color -> color2), soft dark halo, faint bevel light
    text: function (ctx, str, x, y, o) {
      o = o || {}; var f = fontOf(this, o.font), P = this.palette, s = prep(str, f), sc = o.scale || 1;
      var w = this.measure(s, o), col = this.token(o.color) || P.text.main, col2 = o.color2 ? this.token(o.color2) : null;
      if (o.align === 'center') x -= w / 2; else if (o.align === 'right') x -= w;
      var self = this;
      withSmooth(ctx, function () {
        if (o.alpha != null) ctx.globalAlpha *= o.alpha;
        ctx.font = cssOf(f, sc); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        if ('letterSpacing' in ctx) ctx.letterSpacing = ((f.letterSpacing || 0) * sc) + 'px';
        var yy = y - f.size * sc * 0.06;
        var S = self.shadow.text, shc = o.shadow === false ? null : (o.shadow ? self.token(o.shadow) : P.text.shadow);
        if (shc && S) { ctx.shadowColor = shc; ctx.shadowBlur = (S.blur || 2) * devScale(ctx); ctx.shadowOffsetY = (S.dy || 0) * devScale(ctx); ctx.fillStyle = shc; ctx.fillText(s, x, yy); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
        if (o.outline) { ctx.lineJoin = 'round'; ctx.lineWidth = (o.outlineWidth || 1) * 2; ctx.strokeStyle = self.token(o.outline); ctx.strokeText(s, x, yy); }
        if (col2 && col2 !== col) { var gr = ctx.createLinearGradient(0, yy + f.size * sc * 0.15, 0, yy + f.size * sc * 0.95); gr.addColorStop(0, col); gr.addColorStop(1, col2); ctx.fillStyle = gr; }
        else ctx.fillStyle = col;
        ctx.fillText(s, x, yy);
      });
      return w;
    },

    // frame: chamfered dark-iron rim around a leather / painted body, engraved gold inner line, filigree corners, rivets
    frame: function (ctx, r, st) {
      if (st && (st.role === 'row' || st.role === 'backing')) return band(this, ctx, r, st);
      st = st || {}; var P = this.palette, U = P.ui, self = this, plate = st.role === 'plate' || st.role === 'tooltip', banner = st.role === 'banner';
      var x = r.x, y = r.y, w = r.w, h = r.h, ch = plate ? this.shape.plateChamfer : this.shape.chamfer, pad = this.shape.padding;
      var k = devScale(ctx), seed = hash([Math.round(x), Math.round(y), Math.round(w), Math.round(h)].join());
      var tint = st.team && st.team !== 'n' && P.team[st.team] ? P.team[st.team] : null;
      withSmooth(ctx, function () {
        if (st.alpha != null) ctx.globalAlpha *= st.alpha;
        if (st.disabled) ctx.globalAlpha *= 0.6;
        // drop shadow / candle glow behind
        var S = self.shadow.window;
        if (S) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = S.blur * k; ctx.shadowOffsetY = S.dy * k; ctx.fillStyle = '#000'; plateP(ctx, x, y, w, h, ch); ctx.fill(); ctx.restore(); }
        if (st.focus || st.alert) { ctx.save(); ctx.shadowColor = st.alert ? rgba(U.bloodLight, 0.9) : rgba(U.goldLight, 0.55); ctx.shadowBlur = 9 * k; ctx.strokeStyle = st.alert ? U.bloodLight : U.gold; ctx.lineWidth = 1; plateP(ctx, x, y, w, h, ch); ctx.stroke(); ctx.restore(); }
        // iron rim
        var rim = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
        rim.addColorStop(0, U.ironLight); rim.addColorStop(0.35, U.iron); rim.addColorStop(1, U.ironDark);
        ctx.fillStyle = rim; plateP(ctx, x, y, w, h, ch); ctx.fill();
        // body (leather / painted), team tint low in the body like a coloured glaze
        var e = plate ? 1.5 : 2.5, bx = x + e, by = y + e, bw = w - 2 * e, bh = h - 2 * e;
        var body = ctx.createLinearGradient(0, by, 0, by + bh), f1 = U.fill, f2 = U.fillTo;
        if (tint) { f1 = mix(f1, tint, st.team === 'b' ? 0.18 : 0.12); f2 = mix(f2, tint, st.team === 'b' ? 0.1 : 0.06); }
        body.addColorStop(0, f1); body.addColorStop(1, f2);
        ctx.save(); plateP(ctx, bx, by, bw, bh, Math.max(1, ch - 1)); ctx.clip();
        ctx.fillStyle = body; ctx.fillRect(bx, by, bw, bh);
        paintTexture(ctx, bx, by, bw, bh, k, 0.9, seed);
        // chiaroscuro: a warm candle bloom top-left, deep shade bottom-right
        var lg = ctx.createRadialGradient(bx + bw * 0.22, by + bh * 0.1, 0, bx + bw * 0.22, by + bh * 0.1, Math.max(bw, bh) * 0.9);
        lg.addColorStop(0, 'rgba(255,190,110,0.13)'); lg.addColorStop(0.5, 'rgba(255,160,80,0.03)'); lg.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = lg; ctx.fillRect(bx, by, bw, bh);
        // inner vignette along the rim
        var vg = ctx.createLinearGradient(0, by, 0, by + 3); vg.addColorStop(0, 'rgba(0,0,0,0.6)'); vg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = vg; ctx.fillRect(bx, by, bw, 3);
        ctx.restore();
        // rim bevel: light top-left edge, dark bottom-right edge
        ctx.lineWidth = 0.6; ctx.strokeStyle = rgba(U.goldLight, 0.22); ctx.beginPath(); ctx.moveTo(x + ch, y + 0.3); ctx.lineTo(x + w - ch, y + 0.3); ctx.moveTo(x + 0.3, y + ch); ctx.lineTo(x + 0.3, y + h - ch); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 0.8; plateP(ctx, x + 0.4, y + 0.4, w - 0.8, h - 0.8, ch); ctx.stroke();
        // engraved gold inner line (double: dark groove + gold)
        var il = e + 0.9;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1; plateP(ctx, x + il + 0.3, y + il + 0.4, w - 2 * il, h - 2 * il, Math.max(1, ch - 1)); ctx.stroke();
        var gg = ctx.createLinearGradient(x, y, x + w, y + h); gg.addColorStop(0, U.goldLight); gg.addColorStop(0.4, U.gold); gg.addColorStop(1, U.goldDark);
        ctx.strokeStyle = gg; ctx.lineWidth = plate ? 0.5 : 0.6; plateP(ctx, x + il, y + il, w - 2 * il, h - 2 * il, Math.max(1, ch - 1)); ctx.stroke();
        if (tint && !plate) {   // team: thin glaze line under the top gold line (steel-blue for the party, blood for foes)
          ctx.strokeStyle = rgba(st.team === 'b' ? U.bloodLight : P.team.aLight, 0.45); ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(x + il + 6, y + il + 1.3); ctx.lineTo(x + w - il - 6, y + il + 1.3); ctx.stroke();
        }
        // corners
        if (plate) {
          [[x + 1.6, y + h / 2], [x + w - 1.6, y + h / 2]].forEach(function (p) { ctx.fillStyle = U.goldDark; ctx.beginPath(); ctx.moveTo(p[0], p[1] - 2); ctx.lineTo(p[0] + 1.4, p[1]); ctx.lineTo(p[0], p[1] + 2); ctx.lineTo(p[0] - 1.4, p[1]); ctx.closePath(); ctx.fill(); ctx.fillStyle = U.gold; ctx.beginPath(); ctx.moveTo(p[0], p[1] - 1.3); ctx.lineTo(p[0] + 0.8, p[1]); ctx.lineTo(p[0], p[1] + 1.3); ctx.lineTo(p[0] - 0.8, p[1]); ctx.closePath(); ctx.fill(); });
        } else {
          var fs = Math.max(4.5, Math.min(pad + 0.5, Math.min(w, h) * 0.24)), lw = Math.max(0.45, fs * 0.08);   // never reaches the content rect
          [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(function (c) {
            ctx.save(); ctx.translate(c[0], c[1]); ctx.scale(c[2], c[3]); filigree(ctx, fs, P, lw); ctx.restore();
          });
          if (w > 60) { rivet(ctx, x + w / 2, y + 1.3, 0.9, P); rivet(ctx, x + w / 2, y + h - 1.3, 0.9, P); }
          if (banner) { ctx.fillStyle = rgba(U.blood, 0.35); ctx.fillRect(x + e, y + h - e - 2, w - 2 * e, 2); }
        }
      });
      return { x: x + pad, y: y + pad, w: w - 2 * pad, h: h - 2 * pad };
    },

    // number: engraved metal numerals (gold for damage, blood for crit, pale silver-green / blue for heal / mp), smoke puff
    number: function (ctx, str, x, y, o) {
      o = o || {}; var s = String(str).toUpperCase(), kind = o.kind || 'damage', P = this.palette, self = this, out = [];
      var R = P.numerals[kind] || P.numerals.damage, sc = (o.scale || 1) * (kind === 'crit' && o.big !== false ? 1.3 : 1), k = devScale(ctx);
      var word = !/^[0-9+\-]+$/.test(s), fscale = word ? sc * 0.72 : sc;
      var gl = [], cx = 0, i;
      for (i = 0; i < s.length; i++) { var G = numeral(this, s[i], kind, fscale, k, false); gl.push({ ch: s[i], G: G, x: cx }); cx += G.w + (word ? 0.6 : -0.3) * fscale; }
      var sfx = o.suffix ? String(o.suffix).toUpperCase() : null, sw = 0, sgl = [];
      if (sfx) { cx += 1.5; for (i = 0; i < sfx.length; i++) { var G2 = numeral(this, sfx[i], kind, sc * 0.55, k, false); sgl.push({ ch: sfx[i], G: G2, x: cx }); cx += G2.w + 0.3; } }
      var W = cx, asc = gl.length ? gl[0].G.asc : 10;
      sgl.forEach(function (q) { q.yo = asc - q.G.asc; });   // suffix sits on the numerals' baseline
      if (o.align === 'center') x -= W / 2;
      if (o.baseline === 'bottom') y -= asc;   // y = top of the cap height
      var all = gl.concat(sgl);
      var labelItems = [];
      if (o.label) {   // CRITICAL: small spaced gold caps above, each a glyph (numbered after the number's glyphs)
        var lf = fontOf(this, 'label'), lw = this.measure(o.label, { font: 'label' }), lx = x + (W - lw) / 2, gap = o.labelGap == null ? 3 : o.labelGap;
        var mg = mk(4, 4).getContext('2d'); mg.font = cssOf(lf, 1);
        var L = prep(o.label, lf);
        var lx00 = lx; for (i = 0; i < L.length; i++) { labelItems.push({ ch: L[i], x: lx, y: y - lf.size - gap, lab: 1, lx0: lx - lx00 }); lx += mg.measureText(L[i]).width + (lf.letterSpacing || 0); }
      }
      withSmooth(ctx, function () {
        var pa = ctx.globalAlpha * (o.alpha == null ? 1 : o.alpha);
        // smoke puff at the landing spot (behind everything; follows the mean alpha of the glyphs)
        var ma = 0, n = 0; for (var q = 0; q < all.length; q++) { var d0 = o.glyphOffset ? o.glyphOffset(q, all[q]) || {} : {}; if (!d0.skip) { ma += d0.alpha == null ? 1 : d0.alpha; n++; } }
        ma = n ? ma / n : 0;
        if (n) { var pr = o.life ? Math.max(0, Math.min(1, (o.age || 0) / o.life)) : 0.3, pg = 0.8 + 0.6 * pr; ctx.globalAlpha = pa; puff(ctx, x + W / 2, y + asc * (0.75 - 0.25 * pr), (W + asc * 0.9) * pg, asc * 1.15 * pg, R[5], 0.9 * ma * (o.life ? 1 - pr * 0.5 : 1), hash(s + kind)); }
        // glyphs: outlines are baked into each sprite; draw in order
        var draw = function (it, idx, isLabel) {
          var d = o.glyphOffset ? o.glyphOffset(idx, it) || {} : {}; if (d.skip) return;
          var a = pa * (d.alpha == null ? 1 : d.alpha), dx = d.dx || 0, dy = d.dy || 0;
          ctx.globalAlpha = a;
          if (isLabel) {
            var lf2 = fontOf(self, 'label'); ctx.font = cssOf(lf2, 1); ctx.textBaseline = 'top';
            ctx.lineJoin = 'round'; ctx.strokeStyle = '#120204'; ctx.lineWidth = 1.4; ctx.shadowColor = 'rgba(255,60,30,0.7)'; ctx.shadowBlur = 4 * k; ctx.strokeText(it.ch, it.x + dx, it.y + dy);
            ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
            var lg2 = ctx.createLinearGradient(0, it.y + dy, 0, it.y + dy + lf2.size); lg2.addColorStop(0, '#ff9a80'); lg2.addColorStop(0.45, P.ui.bloodLight); lg2.addColorStop(1, '#6a0a10');
            ctx.fillStyle = d.flash ? '#ffffff' : lg2; ctx.fillText(it.ch, it.x + dx, it.y + dy);
            out.push({ x: it.x + dx, y: it.y + dy, w: ctx.measureText(it.ch).width, h: lf2.size });
            return;
          }
          var G = d.flash ? numeral(self, it.ch, kind, it.G.size / fontOf(self, 'num').size, k, true) : it.G;
          var X = x + it.x + dx - G.ox, Y = y + (it.yo || 0) - (G.oy + G.size * 1.0 - G.asc) + dy;
          // ember glow under crits
          if (kind === 'crit') { ctx.save(); ctx.globalAlpha = a * 0.55; var eg = ctx.createRadialGradient(X + G.W / 2, Y + G.H * 0.55, 0, X + G.W / 2, Y + G.H * 0.55, G.H * 0.6); eg.addColorStop(0, 'rgba(255,90,40,0.6)'); eg.addColorStop(1, 'rgba(255,60,20,0)'); ctx.fillStyle = eg; ctx.fillRect(X - 4, Y - 4, G.W + 8, G.H + 8); ctx.restore(); }
          if (d.sx || d.sy) {   // landing squash from the module: scale about the glyph's foot
            var fx = X + G.W / 2, fy = y + (it.yo || 0) + G.asc + dy; ctx.save(); ctx.translate(fx, fy); ctx.scale(d.sx || 1, d.sy || 1); ctx.drawImage(G.c, X - fx, Y - fy, G.W, G.H); ctx.restore();
          } else ctx.drawImage(G.c, X, Y, G.W, G.H);
          out.push({ x: x + it.x + dx, y: y + (it.yo || 0) + dy, w: G.w, h: G.asc });
        };
        for (var j = 0; j < all.length; j++) draw(all[j], j, false);
        for (var m = 0; m < labelItems.length; m++) draw(labelItems[m], all.length + m, true);
      });
      return out;
    },

    // overlay: smoky wash. Colour fill + drifting fog texture, pigment and light pooled at the set's edge, glowing edge line
    overlay: function (ctx, r, kind, t, o) {
      o = o || {}; var Cc = this.palette.overlay[kind] || this.palette.overlay.move, gr = o.grow == null ? 1 : o.grow, os = this.overlayStyle;
      if (gr <= 0) return;
      var x = r.x, y = r.y, w = r.w, h = r.h, k = devScale(ctx), E = o.edges || {}, tx = o.tile ? o.tile.x : 0, ty = o.tile ? o.tile.y : 0;
      var a = (Cc.alpha == null ? 0.35 : Cc.alpha) * gr;
      if ((o.pattern || os.pattern) === 'pulsing') a *= 0.9 + 0.1 * Math.sin(t * 1.6);   // slow breathing, the whole set at once (a per-cell phase reads as squares)
      withSmooth(ctx, function () {
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        // thin base glaze, then the same colour carried by drifting smoke (world-anchored, so tiles join seamlessly),
        // then a darker smoke layer moving the other way: the wash is never flat
        ctx.fillStyle = rgba(Cc.fill, a * (Cc.glaze == null ? 0.55 : Cc.glaze)); ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = Math.min(1, a * (Cc.smoke == null ? 3.2 : Cc.smoke));
        ctx.fillStyle = pattern(ctx, tintTex(fogTex(k), Cc.fill, 'f' + k + Cc.fill), k, t * os.drift, -t * os.drift * 0.4); ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = Math.min(1, gr * os.smoke);
        ctx.fillStyle = pattern(ctx, tintTex(fogTex(k), '#050304', 'dark' + k), k, 40 - t * os.drift * 0.7, 17 + t * os.drift * 0.3); ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
        // pooled colour + glow inside the set's boundary
        var depth = Math.min(w, h) * (Cc.pool == null ? 0.55 : Cc.pool), glowA = (Cc.edgeAlpha != null ? Cc.edgeAlpha : os.edgeAlpha == null ? 0.9 : os.edgeAlpha) * gr;
        var side = function (x0, y0, x1, y1, fx, fy, fw, fh) {
          var g = ctx.createLinearGradient(x0, y0, x1, y1);
          g.addColorStop(0, rgba(Cc.edge, 0.42 * glowA)); g.addColorStop(0.25, rgba(Cc.fill, 0.38 * glowA)); g.addColorStop(1, rgba(Cc.fill, 0));
          ctx.fillStyle = g; ctx.fillRect(fx, fy, fw, fh);
        };
        if (E.top) side(0, y, 0, y + depth, x, y, w, depth);
        if (E.bottom) side(0, y + h, 0, y + h - depth, x, y + h - depth, w, depth);
        if (E.left) side(x, 0, x + depth, 0, x, y, depth, h);
        if (E.right) side(x + w, 0, x + w - depth, 0, x + w - depth, y, depth, h);
        // glowing edge line: wobbly (hand-drawn) stroke with blur
        ctx.strokeStyle = rgba(Cc.edge, glowA); ctx.lineWidth = (os.edgeWidth || 1) * 0.9; ctx.shadowColor = rgba(Cc.edge, 0.9 * gr); ctx.shadowBlur = 4 * k; ctx.lineCap = 'round';
        var wob = function (x0, y0, x1, y1) {
          var n = 4, i, px, py, nx = -(y1 - y0), ny = x1 - x0, L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
          ctx.beginPath(); ctx.moveTo(x0, y0);
          for (i = 1; i <= n; i++) { var u = i / n, j = i < n ? Math.sin((x0 + y0) * 0.37 + i * 2.1) * 0.35 : 0; px = x0 + (x1 - x0) * u + nx * j; py = y0 + (y1 - y0) * u + ny * j; ctx.lineTo(px, py); }
          ctx.stroke();
        };
        var i2 = 0.7;
        if (E.top) wob(x, y + i2, x + w, y + i2); if (E.bottom) wob(x, y + h - i2, x + w, y + h - i2);
        if (E.left) wob(x + i2, y, x + i2, y + h); if (E.right) wob(x + w - i2, y, x + w - i2, y + h);
        ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      });
    },

    // bar: an engraved iron trough with a gold rim; fill is a lit liquid (blood / gold / ice) with a meniscus highlight
    bar: function (ctx, r, frac, kind, o) {
      o = o || {}; var P = this.palette, U = P.ui, x = r.x, y = r.y, w = r.w, h = r.h, f = Math.max(0, Math.min(1, frac || 0));
      var COL = { hp: ['#d4dcb8', '#6f8a58', '#26341e'], hpLow: ['#ffb08a', '#c0282a', '#3e0408'], charge: ['#fbe7a6', '#c99a42', '#5a3a10'], haste: ['#d8f0c0', '#7aa868', '#2a4422'],
        slow: ['#e4d4f4', '#8a6ab0', '#2e1e44'], ready: ['#fff6e0', '#f2d78e', '#a07a32'], queued: ['#dceaf8', '#7c9cc4', '#26344c'], enemy: ['#e88a70', '#8e1c1f', '#300608'], enemyFull: ['#ffd2b8', '#e2482e', '#5e0a0e'] };
      var k = devScale(ctx);
      withSmooth(ctx, function () {
        // trough
        ctx.fillStyle = U.ironDark; plateP(ctx, x - 0.5, y - 0.5, w + 1, h + 1, 1); ctx.fill();
        ctx.fillStyle = P.bars.track; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = rgba(U.gold, 0.55); ctx.lineWidth = 0.4; ctx.strokeRect(x - 0.3, y - 0.3, w + 0.6, h + 0.6);
        var c = kind ? COL[kind] || COL.charge : null, fw = o.px != null ? o.px * (w / Math.max(1, w - 2)) : w * f;
        if (c && f > 0) {
          var g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, c[0]); g.addColorStop(0.35, c[1]); g.addColorStop(1, c[2]);
          ctx.fillStyle = g; ctx.fillRect(x + 0.4, y + 0.4, Math.max(0, fw - 0.8), h - 0.8);
          ctx.save(); ctx.beginPath(); ctx.rect(x, y, fw, h); ctx.clip(); paintTexture(ctx, x, y, fw, h, k, 0.7, 3); ctx.restore();
          // bright end (meniscus) with a small glow
          ctx.shadowColor = rgba(c[0], 0.8); ctx.shadowBlur = 3 * k; ctx.fillStyle = rgba(c[0], 0.85); ctx.fillRect(x + fw - 0.9, y + 0.4, 0.6, h - 0.8); ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
          ctx.fillStyle = 'rgba(255,240,210,0.22)'; ctx.fillRect(x + 0.4, y + 0.5, Math.max(0, fw - 0.8), Math.max(0.4, h * 0.2));
        }
        // engraved ticks every quarter
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; for (var i = 1; i < 4; i++) ctx.fillRect(x + w * i / 4 - 0.2, y + h * 0.55, 0.4, h * 0.45);
        if (o.tag) {   // status tab: a small blood / ice shield at the right end
          var tc = o.tag === 'haste' ? '#7aa868' : '#8a6ab0', sx = x + w + 1.2, sy = y - 1, sh = h + 2;
          ctx.fillStyle = U.ironDark; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 4, sy); ctx.lineTo(sx + 4, sy + sh * 0.6); ctx.lineTo(sx + 2, sy + sh); ctx.lineTo(sx, sy + sh * 0.6); ctx.closePath(); ctx.fill();
          ctx.fillStyle = tc; ctx.beginPath(); ctx.moveTo(sx + 0.7, sy + 0.7); ctx.lineTo(sx + 3.3, sy + 0.7); ctx.lineTo(sx + 3.3, sy + sh * 0.55); ctx.lineTo(sx + 2, sy + sh - 0.9); ctx.lineTo(sx + 0.7, sy + sh * 0.55); ctx.closePath(); ctx.fill();
        }
      });
    },

    // cursor: 'bracket' = four gold spear-tip corners with a breathing candle glow; 'hand' = a small gold spearhead pointer
    cursor: function (ctx, r, kind, t, o) {
      o = o || {}; var P = this.palette, U = P.ui, k = devScale(ctx), bad = !!o.invalid;
      var main = bad ? U.bloodLight : U.gold, light = bad ? '#ffb08a' : U.goldLight, dark = bad ? '#3e0408' : U.goldDark;
      withSmooth(ctx, function () {
        ctx.globalAlpha *= o.alpha == null ? 1 : o.alpha;
        if (kind === 'hand') {
          // spearhead pointing right: leaf blade + crossguard + short shaft; tip at the right edge, centred vertically
          var x = r.x, y = r.y, w = r.w, h = r.h, cy = y + h / 2, tip = x + w + 0.5, base = x + w * 0.35;
          ctx.shadowColor = rgba(U.goldLight, 0.6); ctx.shadowBlur = 3 * k;
          ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(tip + 0.6, cy); ctx.quadraticCurveTo(base + 1.5, cy - h * 0.62, base - 0.4, cy); ctx.quadraticCurveTo(base + 1.5, cy + h * 0.62, tip + 0.6, cy); ctx.fill();
          ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
          var g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2); g.addColorStop(0, light); g.addColorStop(0.5, main); g.addColorStop(1, dark);
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(tip, cy); ctx.quadraticCurveTo(base + 1.5, cy - h * 0.48, base + 0.2, cy); ctx.quadraticCurveTo(base + 1.5, cy + h * 0.48, tip, cy); ctx.fill();
          ctx.strokeStyle = rgba(dark, 0.9); ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(base + 0.6, cy); ctx.lineTo(tip - 0.8, cy); ctx.stroke();
          ctx.fillStyle = main; ctx.fillRect(base - 0.9, cy - h * 0.45, 0.9, h * 0.9);                       // crossguard
          ctx.fillStyle = dark; ctx.fillRect(x - 1, cy - 0.45, base - x + 0.2, 0.9);                          // shaft
          ctx.fillStyle = light; ctx.fillRect(x - 1, cy - 0.45, base - x + 0.2, 0.3);
          return;
        }
        var x0 = r.x - 1, y0 = r.y - 1, w0 = r.w + 2, h0 = r.h + 2, breathe = 0.65 + 0.35 * Math.sin(t * 2.2), L = Math.min(w0, h0) * 0.36;
        // candle bloom inside the tile
        var bl = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 0, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.75);
        bl.addColorStop(0, rgba(bad ? '#ff5030' : '#ffc870', 0.16 * breathe)); bl.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = bl; ctx.fillRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
        [[x0, y0, 1, 1], [x0 + w0, y0, -1, 1], [x0, y0 + h0, 1, -1], [x0 + w0, y0 + h0, -1, -1]].forEach(function (c) {
          ctx.save(); ctx.translate(c[0], c[1]); ctx.scale(c[2], c[3]);
          ctx.shadowColor = rgba(light, 0.75 * breathe); ctx.shadowBlur = 4 * k;
          ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(-1.2, -1.2); ctx.lineTo(L + 0.6, -0.2); ctx.lineTo(L * 0.55, 1.6); ctx.lineTo(1.6, 1.6); ctx.lineTo(1.6, L * 0.55); ctx.lineTo(-0.2, L + 0.6); ctx.closePath(); ctx.fill();
          ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
          var g2 = ctx.createLinearGradient(-1, -1, L * 0.6, L * 0.6); g2.addColorStop(0, light); g2.addColorStop(0.6, main); g2.addColorStop(1, dark);
          ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(-0.6, -0.6); ctx.lineTo(L, 0); ctx.lineTo(L * 0.5, 1); ctx.lineTo(1, 1); ctx.lineTo(1, L * 0.5); ctx.lineTo(0, L); ctx.closePath(); ctx.fill();
          ctx.restore();
        });
      });
    },

    // path(ctx, points, t, opts): reserved SPEC hook for the move arrow. points = tile centres in native px (start first).
    // A thin gold line (dark under-stroke, rounded corners), a gold ring at the start, a slow glint, a spearhead at the end.
    path: function (ctx, pts, t, o) {
      o = o || {}; if (!pts || pts.length < 2) return;
      var P = this.palette, U = P.ui, k = devScale(ctx), tile = o.tile || 16, rad = tile * 0.42, a = o.alpha == null ? 1 : o.alpha;
      var n = pts.length, end = pts[n - 1], prev = pts[n - 2], ang = Math.atan2(end.y - prev.y, end.x - prev.x), head = tile * 0.5;
      var stopX = end.x - Math.cos(ang) * head * 0.55, stopY = end.y - Math.sin(ang) * head * 0.55;
      var line = function () {
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < n - 1; i++) ctx.arcTo(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, rad);
        ctx.lineTo(stopX, stopY);
      };
      withSmooth(ctx, function () {
        ctx.globalAlpha *= a; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        var sc = Math.hypot(ctx.getTransform().a, ctx.getTransform().b) || 1, lw0 = Math.max(1.4, 2.5 / sc);
        ctx.strokeStyle = 'rgba(8,4,2,0.85)'; ctx.lineWidth = lw0 + 1.6; line(); ctx.stroke();
        ctx.shadowColor = rgba(U.goldLight, 0.7); ctx.shadowBlur = 4 * k;
        ctx.strokeStyle = U.gold; ctx.lineWidth = lw0; line(); ctx.stroke();
        ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
        ctx.strokeStyle = rgba(U.goldLight, 0.85); ctx.lineWidth = 0.35; line(); ctx.stroke();
        // start ring
        ctx.strokeStyle = 'rgba(8,4,2,0.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 2.6, 0, 7); ctx.stroke();
        ctx.strokeStyle = U.gold; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 2.6, 0, 7); ctx.stroke();
        // slow glint travelling along the line (one pass every ~2.4 s)
        var segs = [], tot = 0; for (var i = 1; i < n; i++) { var L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); segs.push(L); tot += L; }
        var u = ((t / 2.4) % 1) * tot, si = 0; while (si < segs.length - 1 && u > segs[si]) { u -= segs[si]; si++; }
        var gx = pts[si].x + (pts[si + 1].x - pts[si].x) * (u / segs[si]), gy = pts[si].y + (pts[si + 1].y - pts[si].y) * (u / segs[si]);
        var gl = ctx.createRadialGradient(gx, gy, 0, gx, gy, 3.5); gl.addColorStop(0, 'rgba(255,246,216,0.95)'); gl.addColorStop(0.35, 'rgba(242,215,142,0.45)'); gl.addColorStop(1, 'rgba(242,215,142,0)');
        ctx.fillStyle = gl; ctx.fillRect(gx - 4, gy - 4, 8, 8);
        // spearhead
        ctx.save(); ctx.translate(end.x, end.y); ctx.rotate(ang);
        var bl = head * 1.05, bw = head * 0.42, back = -head * 0.55;
        var blade = function (grow) { ctx.beginPath(); ctx.moveTo(bl * 0.5 + grow, 0); ctx.quadraticCurveTo(back + bl * 0.45, -bw - grow, back - grow * 0.4, -bw * 0.15); ctx.lineTo(back - grow * 0.4, bw * 0.15); ctx.quadraticCurveTo(back + bl * 0.45, bw + grow, bl * 0.5 + grow, 0); ctx.closePath(); };
        ctx.fillStyle = 'rgba(8,4,2,0.9)'; ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3 * k; blade(0.9); ctx.fill(); ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
        var g = ctx.createLinearGradient(0, -bw, 0, bw); g.addColorStop(0, U.goldLight); g.addColorStop(0.45, U.gold); g.addColorStop(0.55, U.goldDark); g.addColorStop(1, '#4a3010');
        ctx.fillStyle = g; blade(0); ctx.fill();
        ctx.strokeStyle = rgba(U.goldLight, 0.8); ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(back + 0.5, 0); ctx.lineTo(bl * 0.5 - 1, 0); ctx.stroke();   // midrib
        ctx.fillStyle = U.gold; ctx.fillRect(back - 1.1, -bw * 0.75, 1.1, bw * 1.5);                       // socket collar
        ctx.fillStyle = U.goldDark; ctx.fillRect(back - 1.1, bw * 0.2, 1.1, bw * 0.55);
        ctx.restore();
      });
    },


    // tile(ctx, rect, kind, t): one map cell (scene hook, SPEC §2.4). Dark painterly ground: dead grass, worn flagstones,
    // black water with candle glints, crags, dead trees, ruined walls. Static kinds are deterministic per cell; water moves with t.
    tile: function (ctx, r, kind, t) {
      kind = TERR[kind] ? kind : 'grass';
      var x = r.x, y = r.y, w = r.w, h = r.h, R = rng(cellSeed(r, kind)), k = devScale(ctx), P = this.palette;
      withSmooth(ctx, function () {
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        var under = kind === 'forest' || kind === 'hill' || kind === 'mountain' ? 'grass' : kind === 'bridge' ? 'water' : kind;
        ctx.fillStyle = TERR[under]; ctx.fillRect(x, y, w, h);
        if (under === 'grass' || under === 'sand') {
          ctx.fillStyle = under === 'sand' ? 'rgba(120,110,100,0.12)' : 'rgba(70,60,40,0.25)';
          for (var i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(x + R() * w, y + R() * h, 2 + R() * 4, 1.2 + R() * 2, R() * 3, 0, 7); ctx.fill(); }
          blades(ctx, x, y, w, h, R, under === 'sand' ? 4 : 14, under === 'sand' ? ['#4a4640', '#3a3632'] : ['#4e4630', '#5c5238', '#3a3626', '#4a5034']);
          if (under === 'grass' && R() < 0.35) moss(ctx, x, y, w, h, R, 3);
        } else if (under === 'floor' || under === 'road' || under === 'wall') {
          if (under === 'wall') { stones(ctx, x, y, w, h, R, 4, 2, '#2a2224'); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y + h - 2, w, 2); }
          else stones(ctx, x, y, w, h, R, under === 'road' ? 3 : 2, under === 'road' ? 3 : 2, under === 'road' ? '#3a322c' : '#30282a');
          if (R() < 0.4) moss(ctx, x, y, w, h, R, 2);
          if (R() < 0.35) { ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.4; ctx.beginPath(); var cx0 = x + 3 + R() * 10, cy0 = y + 2 + R() * 5; ctx.moveTo(cx0, cy0); ctx.lineTo(cx0 + (R() - 0.5) * 5, cy0 + 4 + R() * 3); ctx.lineTo(cx0 + (R() - 0.5) * 7, cy0 + 8 + R() * 3); ctx.stroke(); }
        } else if (under === 'water') {
          var g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#101826'); g.addColorStop(1, '#05070b'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
          var sheen = ctx.createLinearGradient(x, y, x + w, y); sheen.addColorStop(0, 'rgba(120,150,200,0.05)'); sheen.addColorStop(0.5, 'rgba(150,180,230,0.16)'); sheen.addColorStop(1, 'rgba(120,150,200,0.05)'); ctx.fillStyle = sheen; ctx.fillRect(x, y, w, h);
          var T = t || 0, R2 = rng(cellSeed(r, 'ripple'));
          for (var j = 0; j < 5; j++) {   // slow ripples
            var ry = y + (R2() * h + T * 1.5) % h, rx = x + R2() * w * 0.6;
            ctx.strokeStyle = 'rgba(170,195,230,' + (0.18 + R2() * 0.18) + ')'; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.quadraticCurveTo(rx + 2.5, ry - 0.6, rx + 5 + R2() * 3, ry); ctx.stroke();
          }
          for (var q = 0; q < 2; q++) {   // candle glints that come and go
            var gx = x + 2 + R2() * (w - 4), gy = y + 2 + R2() * (h - 4), on = Math.max(0, Math.sin(T * (0.9 + R2()) + R2() * 6.28));
            if (on > 0.2) { var gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 2.2); gg.addColorStop(0, 'rgba(255,200,120,' + 0.7 * on + ')'); gg.addColorStop(1, 'rgba(255,140,60,0)'); ctx.fillStyle = gg; ctx.fillRect(gx - 3, gy - 2, 6, 4); ctx.fillStyle = 'rgba(255,230,180,' + 0.6 * on + ')'; ctx.fillRect(gx - 1, gy, 2, 0.3); }
          }
        }
        if (kind === 'forest') deadTree(ctx, x + w * (0.4 + R() * 0.2), y + h * 0.92, 1, R);
        if (kind === 'hill') { var hg = ctx.createRadialGradient(x + w * 0.4, y + h * 0.4, 0, x + w / 2, y + h * 0.7, w * 0.6); hg.addColorStop(0, '#3a3226'); hg.addColorStop(1, 'rgba(20,16,12,0)'); ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.72, w * 0.48, h * 0.4, 0, Math.PI, 0); ctx.fill(); moss(ctx, x + 2, y + 6, w - 4, h * 0.5, R, 3); }
        if (kind === 'mountain') {   // a crag: jagged dark rock, lit top-left edge
          ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.ellipse(x + w / 2 + 1.5, y + h * 0.9, w * 0.44, h * 0.12, 0, 0, 7); ctx.fill();
          var pts = [[0.08, 0.92], [0.18, 0.5], [0.32, 0.36], [0.42, 0.14], [0.56, 0.22], [0.66, 0.1], [0.8, 0.4], [0.92, 0.92]];
          ctx.beginPath(); pts.forEach(function (p, i) { var px = x + w * p[0] + (R() - 0.5), py = y + h * p[1] + (R() - 0.5); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.closePath();
          var mg = ctx.createLinearGradient(x, y, x + w, y + h); mg.addColorStop(0, '#6a5a4c'); mg.addColorStop(0.45, '#3a322c'); mg.addColorStop(1, '#100d0b'); ctx.fillStyle = mg; ctx.fill();
          ctx.strokeStyle = 'rgba(240,210,160,0.5)'; ctx.lineWidth = 0.55; ctx.beginPath(); ctx.moveTo(x + w * 0.18, y + h * 0.5); ctx.lineTo(x + w * 0.32, y + h * 0.36); ctx.lineTo(x + w * 0.42, y + h * 0.14); ctx.stroke();
          ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(x + w * 0.5, y + h * 0.22); ctx.lineTo(x + w * 0.46, y + h * 0.6); ctx.lineTo(x + w * 0.56, y + h * 0.85); ctx.stroke();
        }
        if (kind === 'bridge') { for (var b = 0; b < 4; b++) { ctx.fillStyle = b % 2 ? '#2a1e16' : '#33261c'; ctx.fillRect(x + b * w / 4 + 0.3, y + h * 0.18, w / 4 - 0.6, h * 0.64); } ctx.fillStyle = '#120c08'; ctx.fillRect(x, y + h * 0.16, w, 0.8); ctx.fillRect(x, y + h * 0.8, w, 0.8); }
        if (kind === 'fort') {   // ruined pointed arch
          ctx.fillStyle = '#2e2826'; ctx.fillRect(x + w * 0.12, y + h * 0.3, w * 0.76, h * 0.62);
          ctx.fillStyle = '#060405'; ctx.beginPath(); ctx.moveTo(x + w * 0.34, y + h * 0.92); ctx.lineTo(x + w * 0.34, y + h * 0.55); ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.3, x + w * 0.66, y + h * 0.55); ctx.lineTo(x + w * 0.66, y + h * 0.92); ctx.fill();
          ctx.fillStyle = '#2e2826'; for (var m = 0; m < 3; m++) ctx.fillRect(x + w * (0.12 + m * 0.3), y + h * 0.18, w * 0.16, h * 0.14);
          ctx.fillStyle = 'rgba(232,200,150,0.15)'; ctx.fillRect(x + w * 0.12, y + h * 0.3, 0.6, h * 0.6);
        }
        // shared finish: brush texture and a soft per-cell shade so the grid reads without drawn lines
        paintTexture(ctx, x, y, w, h, k, kind === 'water' ? 0.35 : 0.85, cellSeed(r, 'b'));
        var sh = ctx.createLinearGradient(x, y, x + w, y + h); sh.addColorStop(0, 'rgba(255,220,180,0.03)'); sh.addColorStop(1, 'rgba(0,0,0,0.12)'); ctx.fillStyle = sh; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 0.35; ctx.strokeRect(x + 0.2, y + 0.2, w - 0.4, h - 0.4);
        void P;
      });
    },

    // unitToken(ctx, rect, unit, t): dark painted figure; team = cloak colour (steel blue party, blood foes), rim light toward
    // the nearest light in unit.lights (else from the upper left); knight / mage / fighter (ghoul) / archer / monster.
    unitToken: function (ctx, r, u, t) {
      u = u || {}; var P = this.palette, x = r.x, w = r.w, h = r.h, bob = u.selected ? Math.sin((t || 0) * 2.2) * 0.6 - 0.3 : 0, y = r.y + bob;
      var L = u.lights || [], best = null, bd = 1e9; L.forEach(function (l) { var d = Math.hypot(l.x - (x + w / 2), l.y - (r.y + h / 2)); if (d < bd) { bd = d; best = l; } });
      var uu = Object.assign({}, u, { _lightSide: best && bd < 90 ? (best.x < x + w / 2 ? -1 : 1) : -1 });
      withSmooth(ctx, function () {
        ctx.globalAlpha *= u.dead ? 0.35 : 1;
        if (!u.noShadow) { var sg = ctx.createRadialGradient(x + w / 2 + 1, r.y + h * 0.93, 0, x + w / 2 + 1, r.y + h * 0.93, w * 0.5); sg.addColorStop(0, 'rgba(0,0,0,0.75)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(x + w / 2 + 1, r.y + h * 0.93, w * 0.5, h * 0.12, 0, 0, 7); ctx.fill(); }
        if (u.selected) { var ag = ctx.createRadialGradient(x + w / 2, r.y + h * 0.9, 0, x + w / 2, r.y + h * 0.9, w * 0.6); ag.addColorStop(0, rgba(P.ui.goldLight, 0.3)); ag.addColorStop(1, rgba(P.ui.gold, 0)); ctx.fillStyle = ag; ctx.fillRect(x - 4, r.y + h * 0.6, w + 8, h * 0.5); }
        figure(ctx, uu, x, y, w, h, t || 0, P);
      });
    },

    // atmosphere(ctx, view, t, {phase, lights: [{x, y, col, r, i}]}): 'world' = darkness with soft holes at the lights and warm
    // pools (drawn under overlays, props and units, so gameplay stays readable); 'final' = thin fog and a corner vignette.
    // The light sources themselves (brazier, lamp, witch-crystal) are props: prop() draws them after the darkness.
    atmosphere: function (ctx, view, t, o) {
      o = o || {}; var v = view || { x: 0, y: 0, w: 256, h: 224 }, L = o.lights || [], k = devScale(ctx), self = this;
      var warm = function (l) { var c = API.color.rgb(l.col || l.hex || '#ffb860'); return c[0] > c[2] + 40; };
      var radius = function (l) { return warm(l) ? 74 : l.r && l.r < 30 ? 26 : 46; };
      if (o.phase === 'world') {
        var m = ctx.getTransform(), cw = ctx.canvas.width, ch = ctx.canvas.height, c = DARK.c || (DARK.c = document.createElement('canvas'));
        if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
        var q = c.getContext('2d'); q.setTransform(1, 0, 0, 1, 0, 0); q.clearRect(0, 0, cw, ch); q.setTransform(m);
        q.globalCompositeOperation = 'source-over'; q.fillStyle = 'rgba(5,3,4,0.58)'; q.fillRect(v.x, v.y, v.w, v.h);
        q.globalCompositeOperation = 'destination-out';
        L.forEach(function (l) { var R2 = radius(l) * (1 + 0.04 * Math.sin(t * 6 + l.x)), g = q.createRadialGradient(l.x, l.y, 0, l.x, l.y, R2); g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.5, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); q.fillStyle = g; q.fillRect(l.x - R2, l.y - R2, 2 * R2, 2 * R2); });
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(c, 0, 0); ctx.restore();
        withSmooth(ctx, function () {
          ctx.globalCompositeOperation = 'lighter';
          L.forEach(function (l) { var R3 = radius(l) * 0.8 * (1 + 0.06 * Math.sin(t * 7.3 + l.x) * Math.sin(t * 3.1)), col = warm(l) ? '255,140,60' : API.color.rgb(l.col || '#9cc0e6').join(','), g = ctx.createRadialGradient(l.x, l.y + 4, 0, l.x, l.y + 4, R3); g.addColorStop(0, 'rgba(' + col + ',0.42)'); g.addColorStop(0.5, 'rgba(' + col + ',0.13)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(l.x - R3, l.y + 4 - R3, 2 * R3, 2 * R3); });
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.16; ctx.fillStyle = pattern(ctx, tintTex(fogTex(k), '#8090a8', 'fog' + k + '#8090a8'), k, t * 2.5, t * 0.4); ctx.fillRect(v.x, v.y, v.w, v.h);
        });
        return;
      }
      if (o.phase !== 'final') return;
      withSmooth(ctx, function () {
        // thin drifting fog low on the map, then a corner vignette (centre left clear)
        ctx.globalAlpha = 0.1; ctx.fillStyle = pattern(ctx, tintTex(fogTex(k), '#9aa8c0', 'fog' + k + '#9aa8c0'), k, -t * 3.2, 11 + t * 0.6); ctx.fillRect(v.x, v.y + v.h * 0.35, v.w, v.h * 0.65);
        ctx.globalAlpha = 1;
        var vg = ctx.createRadialGradient(v.x + v.w / 2, v.y + v.h / 2, Math.min(v.w, v.h) * 0.42, v.x + v.w / 2, v.y + v.h / 2, Math.hypot(v.w, v.h) * 0.56);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)'); ctx.fillStyle = vg; ctx.fillRect(v.x, v.y, v.w, v.h);
      });
    },


    // prop(ctx, rect, kind, t, {lights, light, seed}) (SPEC v0.4): tombstone (stone / rock / unknown), thorn bush, gnarled tree,
    // iron brazier, caged lantern, witch-crystal. Drawn after the darkness, with a bone rim and a coloured rim toward the nearest
    // light, so blocking terrain always reads; light carriers draw their own flame, halo and embers.
    prop: function (ctx, r, kind, t, o) { o = o || {}; withSmooth(ctx, function () { drawProp(ctx, r, kind || 'stone', t || 0, o); }); },

    // fog(ctx, rect, t, {alpha, color}): optional extra (feature-tested): drifting ground fog for hosts and previews
    fog: function (ctx, r, t, o) {
      o = o || {}; var k = devScale(ctx), col = o.color ? this.token(o.color) : '#ffffff';
      withSmooth(ctx, function () {
        ctx.globalAlpha *= o.alpha == null ? 0.35 : o.alpha;
        ctx.fillStyle = pattern(ctx, tintTex(fogTex(k), col, 'fog' + k + col), k, t * 2.5, t * 0.4); ctx.fillRect(r.x, r.y, r.w, r.h);
      });
    },
    // brush(ctx, rect, strength, seed): optional extra: painterly brush-noise overlay for host art (grounds, sprites)
    brush: function (ctx, r, strength, seed) { var k = devScale(ctx); withSmooth(ctx, function () { ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); paintTexture(ctx, r.x, r.y, r.w, r.h, k, strength == null ? 0.8 : strength, seed || 0); }); }
  };

  API.register(gothic);
})(typeof window !== 'undefined' ? window : this);
