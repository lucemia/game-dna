/* GameDNA skin 'glass-ui' · Glass & gradient UI (modern mobile game) · needs skin-api.js first
 *
 * A bright, clean daytime board under frosted-glass HUD: every framed window samples the pixels already drawn under it,
 * blurs them (canvas filter blur where the browser has it, a mip-chain downsample blur where it does not) and lays an indigo
 * glass tint, a top sheen, a diagonal reflection streak and a gradient rim over them, with three layered soft shadows
 * that are drawn only OUTSIDE the panel (so the glass stays clear). Vivid gradients (cyan -> violet -> pink -> amber) carry
 * every accent: selected-row pills, gauges, range tiles, the path ribbon, the cursor ring, crit numerals. Type is one crisp
 * geometric sans (Outfit on documentation pages, the system UI stack in games). Motion is springy and matches C-10
 * springy-ui defaults (open 260 ms with ~12 % overshoot, close 140 ms, glide 140 ms, lift 2 px): windows open on 'outBack',
 * numbers land with a squash, the cursor ring breathes on a damped spring.
 *
 * Host: native coordinates stay 256x224 (or any); backing store = native x scale x devicePixelRatio and the host calls
 * ctx.setTransform(s, 0, 0, s, 0, 0) (SPEC section 3, scale 'fit'). Blur radius, shadows and hairlines are scaled from the
 * current transform, so the look is the same at 390 px and at 1280 px.
 *
 * Graceful degradation (skin.glass.mode):
 *   'auto'   (default) 'filter' when ctx.filter works, else 'scale'
 *   'filter' ctx.filter = blur() saturate() on a copy of the backdrop
 *   'scale'  downsample / upsample blur (works in every canvas 2D implementation)
 *   'off'    no backdrop read at all: a more opaque tinted glass (same rim, sheen and shadows), also used automatically when
 *            the transform is rotated / mirrored or the canvas cannot be read
 * The panel never depends on what is under it to be readable: the tint alone keeps white text above 4.5:1.
 *
 * Extras beyond SPEC (feature-tested by hosts): path(), prop(), atmosphere(), skin.glass (blur config), motion.spring
 * (the C-10 springy-ui parameters this style is tuned for).
 */
(function (root) {
  'use strict';
  var API = root.GameDNA_Skin;
  if (!API) { if (root.console) console.error('glass-ui.js: load skin-api.js first'); return; }
  var C = API.color, rgba = C.rgba, mix = C.mix;

  var SANS = '"Outfit", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  var CYAN = '#22d3ee', BLUE = '#3b82f6', VIOLET = '#8b5cf6', PINK = '#ec4899', AMBER = '#fbbf24', ORANGE = '#fb923c', MINT = '#34d399';
  var INK = '#14113a', GLASS = '#221d5c';

  var palette = {
    ink: INK, paper: '#f5f7ff',
    ui: {
      fill: 'rgba(34,29,92,0.52)', fillTo: 'rgba(18,15,56,0.62)', edge: 'rgba(255,255,255,0.42)', highlight: 'rgba(255,255,255,0.30)',
      shadow: 'rgba(24,14,82,0.30)', select: 'rgba(139,92,246,0.85)', well: 'rgba(10,8,40,0.34)', accent: CYAN, accent2: VIOLET, accent3: PINK,
      glass: GLASS, tintTop: '#33288c', tintBot: '#191358'
    },
    team: { a: '#38bdf8', b: '#fb7185', n: '#cbd5e1', aDark: '#4f46e5', bDark: '#be185d', nDark: '#64748b', aLight: '#a5f3fc', bLight: '#fecdd3', aMid: '#3b82f6', bMid: '#f43f5e', nMid: '#94a3b8' },
    overlay: {
      move: { fill: '#22d3ee', fill2: '#3b82f6', edge: '#e0f7ff', alpha: 0.55 },
      attack: { fill: '#ff3d9a', fill2: '#ff9a3c', edge: '#ffe4e6', alpha: 0.56, lift: 0.26 },
      threat: { fill: '#b26bff', fill2: '#7c3aed', edge: '#f3e8ff', alpha: 0.55 },
      heal: { fill: '#5eead4', fill2: '#10b981', edge: '#d1fae5', alpha: 0.6 },
      path: { core: '#ffffff', light: CYAN, mid: VIOLET, dark: '#4c1d95', outline: '#ffffff', spark: '#ffffff' }
    },
    fx: { hot: ORANGE, cold: CYAN, heal: MINT, crit: PINK, status: VIOLET, white: '#ffffff' },
    text: {
      main: '#f8faff', main2: '#f8faff', shadow: 'rgba(10,8,40,0.55)', outline: INK, dim: 'rgba(214,220,255,0.42)', dim2: 'rgba(214,220,255,0.42)',
      accent: '#67e8f9', select: '#ffffff', title: '#ffffff', title2: '#ffffff', label: '#a5b4fc', label2: '#a5b4fc', gold: '#fde68a', gold2: '#fde68a',
      plate: '#ffffff', plateShadow: 'rgba(10,8,40,0.45)', onAccent: '#ffffff', pointer: CYAN, pointerEdge: '#ffffff'
    },
    bars: {
      track: 'rgba(8,8,36,0.5)', hp: '#34d399', hpTo: '#a3e635', hpLow: '#fb7185', hpLowTo: ORANGE,
      charge: CYAN, chargeTo: VIOLET, haste: MINT, hasteTo: CYAN, slow: '#a78bfa', slowTo: '#c084fc', ready: AMBER, readyTo: PINK,
      queued: '#60a5fa', queuedTo: '#a78bfa', enemy: '#f472b6', enemyTo: '#fb7185', enemyFull: '#f43f5e', enemyFullTo: ORANGE
    },
    // numerals: top -> bottom fill gradient, edge (outline), glow (soft coloured shadow)
    numbers: {
      damage: { top: '#ffffff', bot: '#e9e3ff', edge: '#2a1f7a', glow: 'rgba(139,92,246,0.75)' },
      crit: { top: '#fff7b0', mid: '#ffb03b', bot: '#ff3d7f', edge: '#4a0d4f', glow: 'rgba(236,72,153,0.95)', pill: [PINK, ORANGE] },
      heal: { top: '#f0fff8', bot: '#4ff0b8', edge: '#05543e', glow: 'rgba(52,211,153,0.8)' },
      mp: { top: '#f0fdff', bot: '#67e8f9', edge: '#0e3d6b', glow: 'rgba(34,211,238,0.8)' },
      miss: { top: '#ffffff', bot: '#cbd2f5', edge: '#3a3f75', glow: 'rgba(100,116,139,0.55)' },
      status: { top: '#faf5ff', bot: '#c4a1ff', edge: '#3b1a74', glow: 'rgba(168,85,247,0.8)' }
    },
    terrain: {
      grass: '#74dca0', forest: '#5ccb8c', water: '#22b8e6', hill: '#a9e3a0', mountain: '#74dca0', road: '#f1e4c8',
      bridge: '#e8c79a', fort: '#74dca0', sand: '#f7e6b5', wall: '#c7cff0', floor: '#e6eaf8'
    },
    unit: { shadow: 'rgba(20,30,80,0.28)', face: '#fff1e6', face2: '#f3c7ad', steel: ['#ffffff', '#cbd5e1', '#64748b'], wood: ['#d6a578', '#8b5a3c'] }
  };

  /* ---------- helpers ---------- */
  function scaleOf(ctx) { return API.scaleOf ? API.scaleOf(ctx) : 1; }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    var R = Array.isArray(r) ? r : [r, r, r, r], lim = Math.max(0, Math.min(w, h) / 2);
    R = R.map(function (v) { return Math.max(0, Math.min(v || 0, lim)); });
    if (ctx.roundRect) { ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), R); return; }
    ctx.moveTo(x + R[0], y); ctx.lineTo(x + w - R[1], y); ctx.arcTo(x + w, y, x + w, y + R[1], R[1]); ctx.lineTo(x + w, y + h - R[2]);
    ctx.arcTo(x + w, y + h, x + w - R[2], y + h, R[2]); ctx.lineTo(x + R[3], y + h); ctx.arcTo(x, y + h, x, y + h - R[3], R[3]); ctx.lineTo(x, y + R[0]); ctx.arcTo(x, y, x + R[0], y, R[0]); ctx.closePath();
  }
  function shadowOn(ctx, col, blur, dy, dx) { var k = scaleOf(ctx); ctx.shadowColor = col; ctx.shadowBlur = blur * k; ctx.shadowOffsetX = (dx || 0) * k; ctx.shadowOffsetY = (dy || 0) * k; }
  function shadowOff(ctx) { ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
  function hair(ctx) { return 1 / scaleOf(ctx); }
  function lin(ctx, x0, y0, x1, y1, stops) { var g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(function (c, i) { if (Array.isArray(c)) g.addColorStop(c[0], c[1]); else g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c); }); return g; }
  function rad(ctx, x, y, r0, r1, stops) { var g = ctx.createRadialGradient(x, y, Math.max(0, r0), x, y, Math.max(0.01, r1)); stops.forEach(function (c, i) { if (Array.isArray(c)) g.addColorStop(c[0], c[1]); else g.addColorStop(i / (stops.length - 1), c); }); return g; }
  function h2(a, b, n) { var h = (Math.round(a) * 374761393 + Math.round(b) * 668265263 + (n || 0) * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); }
  function ell(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2); }
  function poly(ctx, pts) { ctx.beginPath(); pts.forEach(function (p, i) { ctx[i ? 'lineTo' : 'moveTo'](p[0], p[1]); }); ctx.closePath(); }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  // damped spring step response, same shape as C-10 springy-ui (overshoot ~ bounce)
  function spring(e, bounce) { e = clamp01(e); if (e >= 1) return 1; var b = bounce == null ? 0.12 : bounce, z = b <= 0 ? 1 : Math.sqrt(Math.pow(Math.log(b), 2) / (Math.PI * Math.PI + Math.pow(Math.log(b), 2))), wn = 7.2; if (z >= 1) return 1 - Math.exp(-wn * e) * (1 + wn * e); var wd = wn * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * wn * e) * (Math.cos(wd * e) + z / Math.sqrt(1 - z * z) * Math.sin(wd * e)); }

  /* ---------- frosted glass: blur the pixels already under a panel ---------- */
  var DETECTED = null, BUFS = {};
  function detect() {
    if (DETECTED) return DETECTED;
    try { var c = document.createElement('canvas'); c.width = c.height = 4; var g = c.getContext('2d'); g.filter = 'blur(1px)'; DETECTED = g.filter === 'blur(1px)' ? 'filter' : 'scale'; }
    catch (e) { DETECTED = 'off'; }
    return DETECTED;
  }
  function buf(key, w, h) { var c = BUFS[key]; if (!c) { c = BUFS[key] = document.createElement('canvas'); } if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return c; }
  // returns the mode used ('filter' | 'scale') or false when it drew nothing (then the caller uses the opaque tint)
  function frost(ctx, x, y, w, h, R, G, alpha) {
    var mode = G.mode === 'auto' || !G.mode ? detect() : G.mode;
    if (mode === 'off' || typeof document === 'undefined' || !ctx.getTransform || !ctx.canvas || !ctx.canvas.width) return false;
    var m = ctx.getTransform();
    if (Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6 || m.a <= 0 || m.d <= 0) return false;
    var s = m.a, bd = Math.max(1, G.blur * s), X0 = m.a * x + m.e, Y0 = m.d * y + m.f, W = m.a * w, H = m.d * h;
    var mg = Math.ceil(bd * 2), cw = ctx.canvas.width, ch = ctx.canvas.height;
    var sx = Math.max(0, Math.floor(X0 - mg)), sy = Math.max(0, Math.floor(Y0 - mg)), ex = Math.min(cw, Math.ceil(X0 + W + mg)), ey = Math.min(ch, Math.ceil(Y0 + H + mg));
    var sw = ex - sx, sh = ey - sy; if (sw < 4 || sh < 4) return false;
    var out, og;
    try {
      out = buf('out', sw, sh); og = out.getContext('2d'); og.setTransform(1, 0, 0, 1, 0, 0); og.globalAlpha = 1; og.globalCompositeOperation = 'source-over'; og.clearRect(0, 0, sw, sh);
      if (mode === 'filter') {
        og.filter = 'blur(' + bd.toFixed(2) + 'px) saturate(' + (G.saturate || 1.5) + ')';
        og.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, sw, sh); og.filter = 'none';
      } else {
        // mip chain: halve until the cell is about the blur radius, then come back up twice (bilinear each time)
        var k = Math.max(2, Math.min(32, Math.pow(2, Math.round(Math.log(bd * 1.1) / Math.LN2)))), dw = Math.max(1, Math.ceil(sw / k)), dh = Math.max(1, Math.ceil(sh / k));
        var a = buf('dn', dw, dh), ag = a.getContext('2d'); ag.setTransform(1, 0, 0, 1, 0, 0); ag.clearRect(0, 0, dw, dh); ag.imageSmoothingEnabled = true; ag.imageSmoothingQuality = 'high';
        ag.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, dw, dh);
        var mw = Math.max(1, Math.ceil(sw / 2)), mh = Math.max(1, Math.ceil(sh / 2)), b = buf('mid', Math.min(mw, dw * 4), Math.min(mh, dh * 4)), bg = b.getContext('2d');
        bg.setTransform(1, 0, 0, 1, 0, 0); bg.clearRect(0, 0, b.width, b.height); bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = 'high'; bg.drawImage(a, 0, 0, dw, dh, 0, 0, b.width, b.height);
        og.imageSmoothingEnabled = true; og.imageSmoothingQuality = 'high'; og.drawImage(b, 0, 0, b.width, b.height, 0, 0, sw, sh);
      }
    } catch (e) { return false; }   // unreadable canvas or a missing feature: tint only
    ctx.save(); rr(ctx, x, y, w, h, R); ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = (ctx.globalAlpha) * (alpha == null ? 1 : alpha); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(out, 0, 0, sw, sh, sx, sy, sw, sh);
    ctx.restore();
    return mode;
  }
  // three layered soft shadows, painted only outside the panel shape (glass must not darken itself)
  function layeredShadow(ctx, x, y, w, h, R, tint, k) {
    k = k == null ? 1 : k;
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 40, y - 40, w + 80, h + 80);
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, R); else { ctx.rect(x, y, w, h); }
    ctx.clip('evenodd');
    ctx.fillStyle = '#000';
    [[rgba(tint, 0.30 * k), 12, 6], [rgba(tint, 0.24 * k), 4, 2], [rgba('#0a0828', 0.30 * k), 1.1, 0.5]].forEach(function (L) { shadowOn(ctx, L[0], L[1], L[2]); rr(ctx, x, y, w, h, R); ctx.fill(); });
    shadowOff(ctx); ctx.restore();
  }


  // fine frost grain in device pixels (deterministic hash noise, one cached tile), so the glass reads as a frosted material
  var GRAIN = null;
  function grain(ctx, x, y, w, h, a) {
    if (!a || typeof document === 'undefined' || !ctx.getTransform || !ctx.createPattern) return;
    if (!GRAIN) { var c = document.createElement('canvas'); c.width = c.height = 96; var g = c.getContext('2d'), id = g.createImageData(96, 96);
      for (var i = 0; i < 96 * 96; i++) { var v = h2(i % 96, (i / 96) | 0, 5), on = v > 0.5; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = on ? 255 : 0; id.data[i * 4 + 3] = Math.round(Math.abs(v - 0.5) * 2 * 255); }
      g.putImageData(id, 0, 0); GRAIN = c; }
    var m = ctx.getTransform(); if (Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha *= a; ctx.fillStyle = ctx.createPattern(GRAIN, 'repeat');
    ctx.fillRect(m.a * x + m.e, m.d * y + m.f, m.a * w, m.d * h); ctx.restore();
  }

  var fonts = {
    ui: { type: 'canvas', family: SANS, size: 7.6, weight: 600 },
    num: { type: 'canvas', family: SANS, size: 11.5, weight: 800 },
    title: { type: 'canvas', family: SANS, size: 8.8, weight: 700, letterSpacing: 0 },
    label: { type: 'canvas', family: SANS, size: 5.8, weight: 700, letterSpacing: 0.5, uppercase: true },
    plate: { type: 'canvas', family: SANS, size: 6.6, weight: 700, letterSpacing: 0.4, uppercase: true },
    small: { type: 'canvas', family: SANS, size: 6.2, weight: 600 },
    rules: { snap: false, smoothing: true, minSize: 5.5, lineH: 1.3, uppercase: false, note: 'system UI sans in games; Outfit only on documentation pages' }
  };

  var skin = {
    id: 'glass-ui', name: 'Glass & gradient UI', pixel: false,
    native: { w: 256, h: 224, scale: 'fit', smoothing: true, snap: 0, minScale: 1 },
    palette: palette,
    fonts: fonts,
    glass: { mode: 'auto', blur: 3, saturate: 2, tint: 0.5, tintOff: 0.94, grain: 0.07, halo: 'rgba(12,8,52,0.8)', last: null },
    shape: { radius: 6, plateRadius: 99, edgeWidth: 0.6, padding: 5, barRadius: 99, rowRadius: 99 },
    overlayStyle: { mode: 'wash', pattern: 'solid', radius: 2.6, gap: 0.8, sheen: 0.32, lift: 0.22 },
    particles: { shape: 'circle', size: [1, 2.6], count: 1, snap: false, blend: 'lighter', glow: 3, gravity: 0.04, drag: 0.05,
      life: [360, 720], colors: ['ui.accent', 'ui.accent2', 'ui.accent3', 'fx.white'], trail: 0 },
    outline: { text: { width: 0 }, number: { width: 1.3, max: 1.6, drop: 0, mode: 'round', color: 'ink' }, sprite: { width: 0, color: 'ink', mode: 'none' } },
    shadow: { text: { dx: 0, dy: 0.45, blur: 1.1 }, window: { dx: 0, dy: 2, blur: 4 }, sprite: { kind: 'blob', alpha: 0.28 } },
    motion: { stepMs: 0, snap: false, ease: { move: 'outCubic', pop: 'pop', fade: 'outQuad', open: 'outBack' }, fadeSteps: null, shakeInt: false, flashMax: 0.55,
      squash: { x: 1.2, y: 0.82, ms: 90 },
      spring: { open: 260, close: 140, bounce: 0.12, stagger: 30, glide: 140, lift: 2 } },
    frameRoles: ['row', 'backing'],
    atmospherePhases: ['world', 'final'],
    layout: { handW: 7, handH: 6, pointerGap: 4, rowFrame: true },


    // text: the generic canvas text, plus a soft dark halo hugging the glyphs (a local scrim: the glass stays clear between rows)
    text: function (ctx, str, x, y, o) {
      o = o || {};
      if (o.halo !== false && this.glass.halo) {
        var f = this.fonts[o.font || 'ui'] || this.fonts.ui, s0 = String(str); if (f.uppercase) s0 = s0.toUpperCase();
        var wv = this.measure(s0, o), hx = o.align === 'center' ? x - Math.floor(wv / 2) : o.align === 'right' ? x - wv : x, pa = ctx.globalAlpha;
        ctx.save(); if (o.alpha != null) ctx.globalAlpha = pa * o.alpha;
        ctx.font = API.font.css(f, o.scale); ctx.textBaseline = 'top'; ctx.textAlign = 'left'; if (f.letterSpacing && 'letterSpacing' in ctx) ctx.letterSpacing = f.letterSpacing + 'px';
        ctx.fillStyle = this.glass.halo; ctx.strokeStyle = this.glass.halo; ctx.lineJoin = 'round'; ctx.lineWidth = 1.6;
        shadowOn(ctx, this.glass.halo, 3.2, 0); ctx.globalAlpha *= 0.55; ctx.strokeText(s0, hx, y); ctx.fillText(s0, hx, y); shadowOff(ctx);
        ctx.restore();
      }
      return API.base.text.call(this, ctx, str, x, y, o);
    },

    // frame(ctx, rect, {role, team, focus, alert, disabled, alpha}) -> inner rect
    frame: function (ctx, r, st) {
      st = st || {}; var P = this.palette, U = P.ui, S = this.shape, G = this.glass, role = st.role || 'window';
      var x = r.x, y = r.y, w = r.w, h = r.h, pa = ctx.globalAlpha, A = (st.alpha == null ? 1 : st.alpha) * (st.disabled ? 0.55 : 1);
      var team = st.team && st.team !== 'n' && P.team[st.team] ? st.team : null;
      if (role === 'row') {   // selected row: a vivid violet -> pink gradient pill with a glossy top and a soft coloured glow
        x -= 1.5; w += 4.5;   // a little air past the row's end so a right-aligned note never touches the pill's round end
        var Rr = Math.min(h / 2, 99);
        ctx.save(); ctx.globalAlpha = pa * A;
        shadowOn(ctx, 'rgba(236,72,153,0.45)', 3, 0.8); ctx.fillStyle = lin(ctx, x, y, x + w, y, [VIOLET, mix(VIOLET, PINK, 0.55), PINK]); rr(ctx, x, y, w, h, Rr); ctx.fill(); shadowOff(ctx);
        ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [[0, 'rgba(255,255,255,0.38)'], [0.5, 'rgba(255,255,255,0.06)'], [1, 'rgba(255,255,255,0)']]); rr(ctx, x + 0.5, y + 0.4, w - 1, h * 0.55, [Rr, Rr, 2, 2]); ctx.fill();
        ctx.lineWidth = hair(ctx); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; rr(ctx, x + 0.3, y + 0.3, w - 0.6, h - 0.6, Rr); ctx.stroke();
        ctx.restore(); return { x: x, y: y, w: w, h: h };
      }
      if (role === 'backing') {   // a recessed darker glass well with an inner top shadow
        var Rb = Math.min(4, h / 2, w / 2);
        ctx.save(); ctx.globalAlpha = pa * A;
        ctx.fillStyle = U.well; rr(ctx, x, y, w, h, Rb); ctx.fill();
        ctx.save(); rr(ctx, x, y, w, h, Rb); ctx.clip(); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(6,4,30,0.35)'; shadowOn(ctx, 'rgba(6,4,30,0.5)', 1.6, 0.6); rr(ctx, x - 0.7, y - 0.7, w + 1.4, h + 1.4, Rb + 0.7); ctx.stroke(); shadowOff(ctx); ctx.restore();
        ctx.lineWidth = hair(ctx); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; rr(ctx, x + 0.25, y + 0.25, w - 0.5, h - 0.5, Rb); ctx.stroke();
        ctx.restore(); return { x: x, y: y, w: w, h: h };
      }
      var pill = role === 'plate' || role === 'tooltip' || role === 'banner', R = pill ? h / 2 : Math.min(S.radius, h / 2, w / 2);
      ctx.save(); ctx.globalAlpha = pa * A;
      // 1. shadows outside, 2. blurred backdrop, 3. tint, 4. sheen + streak, 5. rim
      var shTint = team === 'b' ? '#5a0f3a' : role === 'banner' ? '#5b1460' : '#1b1260';
      layeredShadow(ctx, x, y, w, h, R, shTint, role === 'tooltip' ? 0.7 : 1);
      var used = frost(ctx, x, y, w, h, R, G, 1); G.last = used || 'off';
      var ta = used ? G.tint : G.tintOff;
      if (role === 'banner') ctx.fillStyle = lin(ctx, x, y, x + w, y + h, [[0, rgba(VIOLET, used ? 0.78 : 0.95)], [0.55, rgba(PINK, used ? 0.74 : 0.94)], [1, rgba(ORANGE, used ? 0.72 : 0.94)]]);
      else {
        var top = team ? mix(U.tintTop, P.team[team + 'Dark'], 0.22) : U.tintTop, bot = team ? mix(U.tintBot, P.team[team + 'Dark'], 0.12) : U.tintBot;
        ctx.fillStyle = lin(ctx, x, y, x, y + h, [rgba(top, ta * 0.86), rgba(bot, Math.min(1, ta * 1.12))]);
      }
      rr(ctx, x, y, w, h, R); ctx.fill();
      ctx.save(); rr(ctx, x, y, w, h, R); ctx.clip();
      grain(ctx, x, y, w, h, used ? G.grain : G.grain * 1.4);
      // top sheen and one diagonal reflection streak across the glass
      ctx.fillStyle = lin(ctx, 0, y, 0, y + Math.min(h, 22), [[0, 'rgba(255,255,255,0.20)'], [1, 'rgba(255,255,255,0)']]); ctx.fillRect(x, y, w, Math.min(h, 22));
      if (w > 30) { var sx0 = x + w * 0.58; ctx.fillStyle = 'rgba(255,255,255,0.055)'; poly(ctx, [[sx0, y], [sx0 + 14, y], [sx0 + 14 - h * 0.55, y + h], [sx0 - h * 0.55, y + h]]); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.035)'; poly(ctx, [[sx0 + 17, y], [sx0 + 20, y], [sx0 + 20 - h * 0.55, y + h], [sx0 + 17 - h * 0.55, y + h]]); ctx.fill(); }
      // team glow: a soft coloured bloom in the top-left corner of team windows (cyan for the player, rose for the enemy)
      if (team && role === 'window') { ctx.fillStyle = rad(ctx, x + 6, y + 2, 0, Math.max(w, h) * 0.7, [rgba(P.team[team], 0.26), rgba(P.team[team], 0)]); ctx.fillRect(x, y, w, h); }
      ctx.restore();
      // rim: gradient hairline, bright top-left fading to the bottom-right; a team or accent tint on the far end
      var hl = Math.max(hair(ctx), S.edgeWidth), far = team ? rgba(P.team[team], 0.55) : role === 'banner' ? 'rgba(255,255,255,0.35)' : rgba(PINK, 0.38);
      ctx.lineWidth = hl; ctx.strokeStyle = lin(ctx, x, y, x + w, y + h, [[0, 'rgba(255,255,255,0.75)'], [0.45, 'rgba(255,255,255,0.18)'], [1, far]]);
      rr(ctx, x + hl / 2, y + hl / 2, w - hl, h - hl, Math.max(0, R - hl / 2)); ctx.stroke();
      if (st.alert || st.focus) {
        var ac = st.alert ? '#fb7185' : CYAN; ctx.lineWidth = 0.9; ctx.strokeStyle = ac; shadowOn(ctx, rgba(ac, 0.8), 3, 0); rr(ctx, x - 1.2, y - 1.2, w + 2.4, h + 2.4, R + 1.2); ctx.stroke(); shadowOff(ctx);
      }
      ctx.restore(); ctx.globalAlpha = pa;
      var pad = pill ? Math.max(3, h * 0.25) : S.padding, padX = pill ? Math.max(pad, h / 2) : pad;
      return { x: x + padX, y: y + pad, w: w - 2 * padX, h: h - 2 * pad };
    },

    // bar: a recessed glass track, a vivid two-stop gradient fill with a glossy top half and a glowing tip
    bar: function (ctx, r, frac, kind, o) {
      o = o || {}; var P = this.palette, B = P.bars, x = r.x, y = r.y, w = r.w, h = r.h, f = clamp01(frac || 0);
      if (o.px != null && w) f = clamp01(o.px / w);
      var R = h / 2; ctx.save();
      ctx.fillStyle = B.track; rr(ctx, x, y, w, h, R); ctx.fill();
      ctx.lineWidth = hair(ctx); ctx.strokeStyle = 'rgba(255,255,255,0.16)'; rr(ctx, x, y, w, h, R); ctx.stroke();
      if (kind && f > 0) {
        var c0 = B[kind] || CYAN, c1 = B[kind + 'To'] || mix(c0, '#ffffff', 0.3), fw = Math.max(h, w * f);
        ctx.save(); rr(ctx, x, y, w, h, R); ctx.clip();
        shadowOn(ctx, rgba(c1, 0.7), 2.2, 0); ctx.fillStyle = lin(ctx, x, y, x + fw, y, [c0, c1]); rr(ctx, x, y, fw, h, R); ctx.fill(); shadowOff(ctx);
        ctx.fillStyle = 'rgba(255,255,255,0.42)'; rr(ctx, x + R * 0.6, y + h * 0.12, Math.max(0, fw - R * 1.2), h * 0.36, h * 0.18); ctx.fill();
        if (kind === 'ready' || kind === 'enemyFull') { var ph = ((o.t || 0) * 0.9) % 1, gx = x + ph * (fw + 12) - 6; ctx.fillStyle = lin(ctx, gx - 5, 0, gx + 5, 0, ['rgba(255,255,255,0)', 'rgba(255,255,255,0.65)', 'rgba(255,255,255,0)']); ctx.fillRect(gx - 5, y, 10, h); }
        ctx.restore();
        if (f < 1 && h >= 2.5) { ctx.fillStyle = '#ffffff'; shadowOn(ctx, rgba(c1, 0.9), 2.5, 0); circ(ctx, x + fw - R, y + h / 2, R * 0.55); ctx.fill(); shadowOff(ctx); }
      }
      if (o.tag === 'haste' || o.tag === 'slow') {
        var tc = o.tag === 'haste' ? B.haste : B.slow, d = Math.max(h + 2.5, 5.5), cx = x + w + d / 2 + 1.5, cy = y + h / 2;
        shadowOn(ctx, rgba(tc, 0.7), 2, 0); ctx.fillStyle = lin(ctx, cx - d / 2, cy - d / 2, cx + d / 2, cy + d / 2, [tc, o.tag === 'haste' ? CYAN : PINK]); circ(ctx, cx, cy, d / 2); ctx.fill(); shadowOff(ctx);
        ctx.fillStyle = '#ffffff'; ctx.beginPath();
        if (o.tag === 'haste') { ctx.moveTo(cx - d * 0.16, cy - d * 0.24); ctx.lineTo(cx + d * 0.22, cy); ctx.lineTo(cx - d * 0.16, cy + d * 0.24); }
        else { ctx.moveTo(cx + d * 0.16, cy - d * 0.24); ctx.lineTo(cx - d * 0.22, cy); ctx.lineTo(cx + d * 0.16, cy + d * 0.24); }
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    },

    // number: bold geometric numerals, each glyph filled with a vertical gradient over a round dark edge and a coloured glow;
    // glyphs move one by one (dx/dy and the landing squash sx/sy); CRITICAL is a gradient glass chip above (one block)
    number: function (ctx, str, x, y, o) {
      o = o || {}; var P = this.palette, kind = o.kind || 'damage', K = P.numbers[kind] || P.numbers.damage, s = String(str), self = this;
      var crit = kind === 'crit', sc = (o.scale || 1) * (crit && o.big !== false ? 1.3 : 1) * (kind === 'miss' || kind === 'status' ? 0.78 : 1);
      var fN = this.fonts.num, size = fN.size * sc, cap = size * 0.74, fS = this.fonts.label, sS = sc * 1.05;
      var meas = function (ch, f, k) { var g = ctx; g.save(); g.font = API.font.css(f, k); var wv = g.measureText(ch).width; g.restore(); return wv; };
      var items = [], cx = 0, i, w, track = -0.35 * sc;
      for (i = 0; i < s.length; i++) { w = meas(s[i], fN, sc); items.push({ ch: s[i], x: cx, w: w, f: 'num' }); cx += w + track; }
      if (o.suffix) { cx += 1.2 * sc; for (i = 0; i < o.suffix.length; i++) { w = meas(o.suffix[i], fS, sS) + fS.letterSpacing * sS; items.push({ ch: o.suffix[i], x: cx, w: w, f: 'suffix' }); cx += w; } }
      var tw = cx - (o.suffix ? 0 : track), px = x, py = y;
      if (o.align === 'center') px -= tw / 2; else if (o.align === 'right') px -= tw;
      if (o.baseline === 'bottom') py -= cap; else if (o.baseline === 'middle') py -= cap / 2;
      var lab = o.label ? String(o.label) : null, all = items.slice(), out = [], pa = ctx.globalAlpha;
      if (lab) for (i = 0; i < lab.length; i++) all.push({ ch: lab[i], lab: true });
      var offs = all.map(function (it, j) { return (o.glyphOffset && o.glyphOffset(j, it)) || {}; });
      var base = py + cap, ew = Math.min(this.outline.number.max, this.outline.number.width * Math.max(1, sc)) * 2;
      items.forEach(function (it, j) {
        var d = offs[j]; if (d.skip) return;
        var A = clamp01(d.alpha == null ? (o.alpha == null ? 1 : o.alpha) : d.alpha); if (A <= 0) return;
        var gx = px + it.x + (d.dx || 0), gb = base + (d.dy || 0), isN = it.f === 'num', f = isN ? fN : fS, k = isN ? sc : sS;
        var gy = isN ? gb : gb - (cap - f.size * k * 0.74) / 2, gh = isN ? cap : f.size * k * 0.74, sx = d.sx || 1, sy = d.sy || 1;
        API.fadeLayer(ctx, A, { x: gx - 7 * sc, y: gy - gh - 7 * sc, w: it.w + 14 * sc, h: gh + 14 * sc }, function (g) {
          g.save();
          if (sx !== 1 || sy !== 1) { g.translate(gx + it.w / 2, gb); g.scale(sx, sy); g.translate(-(gx + it.w / 2), -gb); }
          g.font = API.font.css(f, k); g.textBaseline = 'alphabetic'; g.textAlign = 'left'; if ('letterSpacing' in g) g.letterSpacing = '0px';
          g.lineJoin = 'round'; g.lineWidth = ew * (isN ? 1 : 0.8); g.strokeStyle = K.edge;
          shadowOn(g, K.glow, (crit ? 5 : 3.2) * Math.min(1.4, sc), 0.6 * sc); g.strokeText(it.ch, gx, gy); shadowOff(g);
          g.strokeText(it.ch, gx, gy);
          var fill = d.flash ? lin(g, 0, gy - gh, 0, gy, ['#ffffff', mix(K.top, '#ffffff', self.motion.flashMax)]) : crit ? lin(g, 0, gy - gh, 0, gy, [K.top, K.mid, K.bot]) : lin(g, 0, gy - gh, 0, gy, [[0, K.top], [0.5, K.top], [1, K.bot]]);
          g.fillStyle = fill; g.fillText(it.ch, gx, gy);
          // a glossy upper highlight inside the glyph
          g.save(); g.beginPath(); g.rect(gx - 2, gy - gh - 2, it.w + 4, gh * 0.42 + 2); g.clip(); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillText(it.ch, gx, gy); g.restore();
          g.restore();
        });
        out.push({ x: gx, y: gy - gh, w: it.w, h: gh });
      });
      if (lab) {   // block rule: the label part moves with its first item, takes the largest alpha and any flash
        var Ls = offs.slice(items.length), lead = null, la = 0, lf = false;
        Ls.forEach(function (d) { if (d.skip) return; if (!lead) lead = d; la = Math.max(la, d.alpha == null ? 1 : d.alpha); lf = lf || !!d.flash; });
        if (lead && la > 0) {
          var fL = { font: 'label' }, lw = this.measure(lab, fL), lh = 8, lpx = 3.4, LW = lw + 2 * lpx, gap = o.labelGap == null ? 2 : Math.min(3, o.labelGap);
          var LX = px + tw / 2 - LW / 2 + (lead.dx || 0), LY = py - lh - gap + (lead.dy || 0), pc = K.pill || [VIOLET, PINK];
          ctx.globalAlpha = pa;
          API.fadeLayer(ctx, clamp01(la), { x: LX - 6, y: LY - 6, w: LW + 12, h: lh + 12 }, function (g) {
            shadowOn(g, 'rgba(236,72,153,0.6)', 3, 0.8); g.fillStyle = lf ? '#ffffff' : lin(g, LX, LY, LX + LW, LY, pc); rr(g, LX, LY, LW, lh, lh / 2); g.fill(); shadowOff(g);
            g.fillStyle = 'rgba(255,255,255,0.35)'; rr(g, LX + 1, LY + 0.5, LW - 2, lh * 0.42, lh * 0.2); g.fill();
            g.lineWidth = hair(g); g.strokeStyle = 'rgba(255,255,255,0.8)'; rr(g, LX, LY, LW, lh, lh / 2); g.stroke();
            self.text(g, lab, LX + lpx, LY + (lh - fS.size) / 2 - 0.4, { font: 'label', color: lf ? PINK : '#ffffff', shadow: false, halo: false });
          });
          out.push({ x: LX, y: LY, w: LW, h: lh });
        }
      }
      ctx.globalAlpha = pa;
      return out;
    },

    // overlay: each cell is its own rounded glass tile with a diagonal two-colour gradient, a top sheen and a bright inner rim;
    // adjacent tiles read as one zone by colour; 'pulsing' = a light sweep that travels diagonally across the region;
    // threat = hatched violet; grow = spring scale-in from the cell centre
    overlay: function (ctx, r, kind, t, o) {
      o = o || {}; var Cc = this.palette.overlay[kind] || this.palette.overlay.move, OS = this.overlayStyle, g = o.grow == null ? 1 : o.grow;
      if (g <= 0) return;
      var E = o.edges || {}, tx = o.tile ? o.tile.x : 0, ty = o.tile ? o.tile.y : 0, a = Cc.alpha == null ? 0.45 : Cc.alpha, pat = o.pattern || OS.pattern;
      var k = g < 1 ? spring(g, 0.14) : 1, gp = OS.gap, cxm = r.x + r.w / 2, cym = r.y + r.h / 2;
      var w = (r.w - gp) * k, h = (r.h - gp) * k, x = cxm - w / 2, y = cym - h / 2, R = OS.radius * k, pa = ctx.globalAlpha;
      ctx.save(); ctx.globalAlpha = pa * Math.min(1, g * 1.5);
      rr(ctx, x, y, w, h, R); ctx.fillStyle = 'rgba(255,255,255,' + (Cc.lift == null ? OS.lift : Cc.lift) + ')'; ctx.fill(); ctx.fillStyle = lin(ctx, x, y, x + w, y + h, [rgba(Cc.fill, a), rgba(Cc.fill2 || Cc.fill, Math.min(1, a * 1.1))]); ctx.fill();
      ctx.save(); rr(ctx, x, y, w, h, R); ctx.clip();
      ctx.fillStyle = lin(ctx, 0, y, 0, y + h * 0.55, [[0, 'rgba(255,255,255,' + OS.sheen + ')'], [1, 'rgba(255,255,255,0)']]); ctx.fillRect(x, y, w, h * 0.55);
      if (kind === 'threat') { ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.7; ctx.beginPath(); for (var q = -16; q < 20; q += 3.2) { ctx.moveTo(x + q, y + h); ctx.lineTo(x + q + h, y); } ctx.stroke(); }
      if (pat === 'pulsing' && g >= 1) {   // a diagonal light sweep, 2.2 s period
        var ph = ((t || 0) / 2.2 - (tx + ty) * 0.045) % 1, sp = ph < 0 ? ph + 1 : ph, band = (sp * 2.4 - 0.7);
        var bx = x + band * (w + h);
        ctx.fillStyle = lin(ctx, bx - 7, y, bx + 7, y + 7, ['rgba(255,255,255,0)', 'rgba(255,255,255,0.32)', 'rgba(255,255,255,0)']); poly(ctx, [[bx - 9, y + h], [bx - 9 + h, y], [bx + 9 + h, y], [bx + 9, y + h]]); ctx.fill();
      }
      ctx.restore();
      ctx.lineWidth = Math.max(hair(ctx), 0.5); ctx.strokeStyle = rgba(Cc.edge, 0.8); rr(ctx, x + 0.25, y + 0.25, w - 0.5, h - 0.5, Math.max(0, R - 0.25)); ctx.stroke();
      ctx.restore(); ctx.globalAlpha = pa;
    },

    // cursor: 'bracket' = a gradient ring (cyan -> violet -> pink) with four thick corner arcs that breathe on a damped spring
    //         and a soft glow; 'hand' = a glossy gradient arrowhead with a white rim that nudges right on the same spring
    cursor: function (ctx, r, kind, t, o) {
      o = o || {}; var pa = ctx.globalAlpha, inv = !!o.invalid, c0 = inv ? '#fb7185' : CYAN, c1 = inv ? '#f97316' : VIOLET, c2 = inv ? '#f43f5e' : PINK;
      var tt = (t || 0), cyc = (tt % 1.1) / 1.1, br = spring(Math.min(1, cyc * 2.2), 0.3);   // a spring "tap" every 1.1 s
      ctx.save(); ctx.globalAlpha = pa * (o.alpha == null ? 1 : o.alpha); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (kind === 'hand') {
        var nud = (1 - br) * 1.1, hx = r.x + nud, hy = r.y, hw = r.w, hh = r.h, cy = hy + hh / 2;
        var tri = function () { ctx.beginPath(); ctx.moveTo(hx + 0.4, hy + 0.3); ctx.quadraticCurveTo(hx + hw * 0.55, hy + hh * 0.18, hx + hw, cy); ctx.quadraticCurveTo(hx + hw * 0.55, hy + hh * 0.82, hx + 0.4, hy + hh - 0.3); ctx.quadraticCurveTo(hx + hw * 0.3, cy, hx + 0.4, hy + 0.3); ctx.closePath(); };
        shadowOn(ctx, rgba(c2, 0.7), 2.4, 0.4); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; tri(); ctx.stroke(); ctx.fill(); shadowOff(ctx);
        ctx.fillStyle = lin(ctx, hx, hy, hx + hw, hy + hh, [c0, c1, c2]); tri(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.moveTo(hx + 1.2, hy + 1.1); ctx.quadraticCurveTo(hx + hw * 0.5, hy + hh * 0.3, hx + hw * 0.8, cy - 0.3); ctx.lineTo(hx + 1.6, cy - 0.3); ctx.closePath(); ctx.fill();
      } else {
        var b = 0.4 + 1.0 * (1 - br), X = r.x - b, Y = r.y - b, W = r.w + 2 * b, H = r.h + 2 * b, R = 3.6, gr = lin(ctx, X, Y, X + W, Y + H, [c0, c1, c2]);
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(ctx, r.x + 0.6, r.y + 0.6, r.w - 1.2, r.h - 1.2, 3); ctx.fill();
        shadowOn(ctx, rgba(c1, 0.85), 3, 0); ctx.strokeStyle = gr; ctx.lineWidth = 0.75; rr(ctx, X, Y, W, H, R); ctx.stroke();
        var L = Math.max(3.5, W * 0.26); ctx.lineWidth = 1.7; ctx.strokeStyle = '#ffffff';
        var corners = function () { ctx.beginPath();
          ctx.moveTo(X, Y + L); ctx.lineTo(X, Y + R); ctx.arcTo(X, Y, X + R, Y, R); ctx.lineTo(X + L, Y);
          ctx.moveTo(X + W - L, Y); ctx.lineTo(X + W - R, Y); ctx.arcTo(X + W, Y, X + W, Y + R, R); ctx.lineTo(X + W, Y + L);
          ctx.moveTo(X + W, Y + H - L); ctx.lineTo(X + W, Y + H - R); ctx.arcTo(X + W, Y + H, X + W - R, Y + H, R); ctx.lineTo(X + W - L, Y + H);
          ctx.moveTo(X + L, Y + H); ctx.lineTo(X + R, Y + H); ctx.arcTo(X, Y + H, X, Y + H - R, R); ctx.lineTo(X, Y + H - L); };
        corners(); ctx.stroke(); shadowOff(ctx); ctx.lineWidth = 1.05; ctx.strokeStyle = gr; corners(); ctx.stroke();
      }
      ctx.restore(); ctx.globalAlpha = pa;
    },

    // path: a gradient light ribbon (cyan -> violet -> pink) in a white casing with a coloured glow, rounded corners,
    // a rounded arrowhead and light dashes that flow toward the head
    path: function (ctx, pts, t, o) {
      o = o || {}; if (!pts || pts.length < 2) return;
      var T = o.tile || 16, rC = T * 0.45, inv = !!o.invalid, c0 = inv ? '#fb7185' : CYAN, c1 = inv ? '#f43f5e' : VIOLET, c2 = inv ? '#be185d' : PINK;
      var n = pts.length, last = pts[n - 1], prev = pts[n - 2], L = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
      var dx = (last.x - prev.x) / L, dy = (last.y - prev.y) / L, headLen = T * 0.42, end = { x: last.x - dx * headLen * 0.55, y: last.y - dy * headLen * 0.55 };
      var P2 = pts.slice(0, -1).concat([end]);
      function trace(g) {
        g.beginPath(); g.moveTo(P2[0].x, P2[0].y);
        for (var i = 1; i < P2.length - 1; i++) {
          var a = P2[i - 1], b = P2[i], c = P2[i + 1], l1 = Math.hypot(b.x - a.x, b.y - a.y) || 1, l2 = Math.hypot(c.x - b.x, c.y - b.y) || 1, v1 = [(b.x - a.x) / l1, (b.y - a.y) / l1], v2 = [(c.x - b.x) / l2, (c.y - b.y) / l2];
          if (Math.abs(v1[0] - v2[0]) < 1e-6 && Math.abs(v1[1] - v2[1]) < 1e-6) { g.lineTo(b.x, b.y); continue; }
          var r1 = Math.min(rC, l1 / 2, l2 / 2); g.lineTo(b.x - v1[0] * r1, b.y - v1[1] * r1); g.quadraticCurveTo(b.x, b.y, b.x + v2[0] * r1, b.y + v2[1] * r1);
        }
        g.lineTo(P2[P2.length - 1].x, P2[P2.length - 1].y);
      }
      var nx = -dy, ny = dx, hw = T * 0.3, tip = { x: last.x + dx * T * 0.14, y: last.y + dy * T * 0.14 }, hb = { x: tip.x - dx * headLen, y: tip.y - dy * headLen };
      function head(g) { g.beginPath(); g.moveTo(tip.x, tip.y); g.lineTo(hb.x + nx * hw, hb.y + ny * hw); g.quadraticCurveTo(hb.x + dx * T * 0.08, hb.y + dy * T * 0.08, hb.x - nx * hw, hb.y - ny * hw); g.closePath(); }
      var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
      var bb = { x: Math.min.apply(null, xs) - T, y: Math.min.apply(null, ys) - T, w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + 2 * T, h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + 2 * T };
      var A0 = o.alpha == null ? 1 : o.alpha;
      API.fadeLayer(ctx, A0, bb, function (g) {
        g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
        shadowOn(g, rgba(c1, 0.7), 3.5, 0.6); g.strokeStyle = '#ffffff'; g.lineWidth = T * 0.34; trace(g); g.stroke();
        g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff'; g.lineWidth = T * 0.16; head(g); g.stroke(); g.fill(); shadowOff(g);
        var gr = lin(g, pts[0].x, pts[0].y, last.x + 0.01, last.y + 0.01, [c0, c1, c2]);
        g.strokeStyle = gr; g.lineWidth = T * 0.2; trace(g); g.stroke();
        g.fillStyle = c2; g.strokeStyle = c2; g.lineWidth = T * 0.05; head(g); g.stroke(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.moveTo(tip.x - dx * 1, tip.y - dy * 1); g.lineTo(hb.x + nx * hw * 0.6, hb.y + ny * hw * 0.6); g.lineTo(hb.x, hb.y); g.closePath(); g.fill();
        if (g.setLineDash) { g.setLineDash([T * 0.12, T * 0.38]); g.lineDashOffset = -((t || 0) * T * 1.6); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = T * 0.07; trace(g); g.stroke(); g.setLineDash([]); }
        g.fillStyle = '#ffffff'; shadowOn(g, rgba(c0, 0.8), 2, 0); circ(g, pts[0].x, pts[0].y, T * 0.13); g.fill(); shadowOff(g); g.fillStyle = c0; circ(g, pts[0].x, pts[0].y, T * 0.07); g.fill();
        g.restore();
      });
    },

    // tile: a clean bright board. Grass is a smooth world-position gradient (no seams) with a faint inset tile grid and
    // a few rounded tufts; water is a vivid turquoise gradient with moving gloss lines and sparkles.
    tile: function (ctx, r, kind, t) {
      var P = this.palette, TT = P.terrain, x = r.x, y = r.y, w = r.w, h = r.h, u = w / 16;
      if (!TT[kind]) kind = 'grass';
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var gx = x / 256, gy = y / 224;
      if (kind === 'water' || kind === 'bridge') {
        ctx.fillStyle = lin(ctx, x, y, x, y + h, [mix('#2fd0f0', '#1a8ce0', gy), mix('#2fd0f0', '#1a8ce0', gy + h / 224)]); ctx.fillRect(x, y, w, h);
        if (kind === 'water') {
          for (var k = 0; k < 2; k++) {
            var ph = (t || 0) * 0.8 + h2(x, y, k) * 6, wx = x + 2 * u + h2(x, y, k + 3) * 6 * u + Math.sin(ph) * 1.2 * u, wy = y + 4.5 * u + k * 7 * u;
            ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.75 * u; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 2 * u, wy - 1.2 * u, wx + 4.4 * u, wy); ctx.stroke();
          }
          var sp = ((t || 0) * 0.7 + h2(x, y, 9)) % 1; if (sp < 0.35) { ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * Math.sin(sp / 0.35 * Math.PI)).toFixed(3) + ')'; circ(ctx, x + (3 + h2(x, y, 11) * 10) * u, y + (3 + h2(x, y, 12) * 10) * u, 0.7 * u); ctx.fill(); }
        } else {
          ctx.fillStyle = lin(ctx, 0, y + 2 * u, 0, y + h - 2 * u, ['#f6dcb6', '#d6a46e']); rr(ctx, x - 0.2 * u, y + 2 * u, w + 0.4 * u, h - 4 * u, 1.5 * u); ctx.fill();
          ctx.fillStyle = 'rgba(120,70,30,0.25)'; for (var pl = 1; pl < 5; pl++) ctx.fillRect(x + pl * w / 5 - 0.2 * u, y + 2.5 * u, 0.4 * u, h - 5 * u);
          ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x, y + 2.3 * u, w, 0.6 * u);
        }
        ctx.restore(); return;
      }
      // ground: smooth gradient by world position (one continuous field)
      var g0 = mix('#86e6ad', '#5ccf96', gy * 0.9 + gx * 0.15), g1 = mix('#86e6ad', '#5ccf96', (gy + h / 224) * 0.9 + gx * 0.15);
      var base = kind === 'road' ? [TT.road, mix(TT.road, '#d9c39a', 0.5)] : kind === 'sand' ? [TT.sand, '#efd38f'] : kind === 'floor' ? [TT.floor, '#d3d9f0'] : kind === 'wall' ? [TT.wall, '#9aa6d6'] : kind === 'hill' ? [mix(g0, '#d9f0a0', 0.4), mix(g1, '#b5dc84', 0.4)] : [g0, g1];
      ctx.fillStyle = lin(ctx, x, y, x, y + h, base); ctx.fillRect(x, y, w, h);
      // faint inset grid: a 1 device px light line on the top-left of each cell, a darker one on the bottom-right
      var hl = hair(ctx); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x, y, w, hl); ctx.fillRect(x, y, hl, h);
      ctx.fillStyle = 'rgba(20,90,70,0.10)'; ctx.fillRect(x, y + h - hl, w, hl); ctx.fillRect(x + w - hl, y, hl, h);
      var hh = h2(x, y, 3), cx = x + w / 2, cy = y + h / 2;
      if (kind === 'grass' || kind === 'fort' || kind === 'hill' || kind === 'mountain' || kind === 'forest') {
        if (hh < 0.3) { var tx0 = x + 3 * u + h2(x, y, 4) * 9 * u, ty0 = y + 6 * u + h2(x, y, 5) * 7 * u; ctx.strokeStyle = 'rgba(30,140,90,0.32)'; ctx.lineWidth = 0.6 * u; ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.quadraticCurveTo(tx0 - 0.3 * u, ty0 - 1.8 * u, tx0 - 1 * u, ty0 - 2.4 * u); ctx.moveTo(tx0 + 0.9 * u, ty0); ctx.quadraticCurveTo(tx0 + 1 * u, ty0 - 2 * u, tx0 + 1.8 * u, ty0 - 2.8 * u); ctx.stroke(); }
        if (hh < 0.13 && kind === 'grass') { var fx = x + 3 * u + h2(x, y, 8) * 10 * u, fy = y + 3 * u + h2(x, y, 9) * 10 * u; ctx.fillStyle = '#ffffff'; circ(ctx, fx, fy, 0.9 * u); ctx.fill(); ctx.fillStyle = h2(x, y, 10) < 0.5 ? AMBER : PINK; circ(ctx, fx, fy, 0.4 * u); ctx.fill(); }
      }
      if (kind === 'forest') { this.prop(ctx, r, 'bush', t, { seed: x * 3 + y }); }
      if (kind === 'mountain') { this.prop(ctx, r, 'rock', t, { seed: x * 3 + y }); }
      if (kind === 'fort') {
        ctx.fillStyle = lin(ctx, 0, cy - 5 * u, 0, cy + 5 * u, ['#ffffff', '#c7cff0']); rr(ctx, cx - 5.5 * u, cy - 4 * u, 11 * u, 8.5 * u, 1.6 * u); ctx.fill();
        ctx.fillStyle = lin(ctx, cx - 2 * u, 0, cx + 2 * u, 0, [VIOLET, PINK]); rr(ctx, cx - 1.6 * u, cy, 3.2 * u, 4.5 * u, [1.6 * u, 1.6 * u, 0, 0]); ctx.fill();
      }
      if (kind === 'wall') { ctx.fillStyle = 'rgba(255,255,255,0.4)'; rr(ctx, x + 2 * u, y + 2 * u, w - 4 * u, h * 0.35, 1.2 * u); ctx.fill(); }
      ctx.restore();
    },

    // prop(ctx, rect, kind, t, {light, seed}): glossy rounded objects with gradient shading lit from the upper left,
    // a soft contact shadow and a specular dot; light carriers glow (brazier flame, lamp orb, crystal)
    prop: function (ctx, r, kind, t, o) {
      o = o || {}; var x = r.x, y = r.y, w = r.w, h = r.h, u = w / 16, cx = x + w / 2, by = y + h - 2.2 * u, sd = o.seed || 0, L = o.light, li = L ? (L.intensity == null ? 0.5 : L.intensity) : 0;
      var pa = ctx.globalAlpha; ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      function shadow(rx, ry) { ctx.fillStyle = 'rgba(20,40,90,0.22)'; ell(ctx, cx + 0.8 * u, by + 0.6 * u, rx, ry); ctx.fill(); }
      function sphere(sx, sy, sr, c) { ctx.fillStyle = rad(ctx, sx - sr * 0.4, sy - sr * 0.45, sr * 0.1, sr * 1.15, c); circ(ctx, sx, sy, sr); ctx.fill(); }
      function glow(gx, gy, gr, col, a) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rad(ctx, gx, gy, 0, gr, [rgba(col, a), rgba(col, a * 0.35), rgba(col, 0)]); circ(ctx, gx, gy, gr); ctx.fill(); ctx.restore(); }
      if (kind === 'tree') {
        shadow(6.5 * u, 2 * u);
        ctx.fillStyle = lin(ctx, cx - 1.2 * u, 0, cx + 1.2 * u, 0, ['#c98b5e', '#8b5a3c']); rr(ctx, cx - 1.2 * u, by - 7 * u, 2.4 * u, 7.4 * u, 1 * u); ctx.fill();
        sphere(cx - 2.8 * u, by - 8.5 * u, 4.6 * u, ['#b6f5c6', '#3fcf7a', '#15924f']);
        sphere(cx + 2.6 * u, by - 9.5 * u, 4.4 * u, ['#b6f5c6', '#3fcf7a', '#15924f']);
        sphere(cx, by - 13 * u, 5.4 * u, ['#c8f9d4', '#4ad884', '#17985a']);
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ell(ctx, cx - 2 * u, by - 15.6 * u, 1.8 * u, 1 * u); ctx.fill();
      } else if (kind === 'bush') {
        shadow(6 * u, 1.7 * u);
        sphere(cx - 3.2 * u, by - 2.6 * u, 3.4 * u, ['#b6f5c6', '#34c477', '#13874a']); sphere(cx + 3.2 * u, by - 2.4 * u, 3.2 * u, ['#b6f5c6', '#34c477', '#13874a']);
        sphere(cx, by - 4.2 * u, 3.9 * u, ['#c8f9d4', '#41d283', '#168f52']);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ell(ctx, cx - 1.2 * u, by - 6.6 * u, 1.4 * u, 0.7 * u); ctx.fill();
        if (h2(sd, 1, 2) < 0.6) { ctx.fillStyle = PINK; circ(ctx, cx + 2.4 * u, by - 4.6 * u, 0.7 * u); ctx.fill(); ctx.fillStyle = '#fff'; circ(ctx, cx + 2.2 * u, by - 4.8 * u, 0.25 * u); ctx.fill(); }
      } else if (kind === 'brazier') {
        shadow(4.5 * u, 1.4 * u);
        ctx.fillStyle = lin(ctx, cx - 1 * u, 0, cx + 1 * u, 0, ['#94a3b8', '#334155']); rr(ctx, cx - 0.9 * u, by - 6 * u, 1.8 * u, 6.2 * u, 0.6 * u); ctx.fill();
        ctx.fillStyle = lin(ctx, cx - 4.5 * u, 0, cx + 4.5 * u, 0, ['#e2e8f0', '#64748b', '#1e293b']); ctx.beginPath(); ctx.moveTo(cx - 4.6 * u, by - 8 * u); ctx.lineTo(cx + 4.6 * u, by - 8 * u); ctx.quadraticCurveTo(cx + 4 * u, by - 4.6 * u, cx, by - 4.8 * u); ctx.quadraticCurveTo(cx - 4 * u, by - 4.6 * u, cx - 4.6 * u, by - 8 * u); ctx.fill();
        ctx.fillStyle = lin(ctx, cx - 4.6 * u, 0, cx + 4.6 * u, 0, [CYAN, VIOLET]); rr(ctx, cx - 4.8 * u, by - 8.6 * u, 9.6 * u, 1.2 * u, 0.6 * u); ctx.fill();
        var fl = 1 + 0.12 * Math.sin((t || 0) * 9 + sd);
        glow(cx, by - 11 * u, 13 * u * (0.8 + li * 0.6), '#ffb347', 0.38 + li * 0.25);
        ctx.fillStyle = lin(ctx, 0, by - 17 * u * fl, 0, by - 8 * u, ['#ff3d7f', ORANGE, '#fff3a8']); ctx.beginPath(); ctx.moveTo(cx, by - 17 * u * fl); ctx.quadraticCurveTo(cx + 4.4 * u, by - 11 * u, cx + 3 * u, by - 8.4 * u); ctx.lineTo(cx - 3 * u, by - 8.4 * u); ctx.quadraticCurveTo(cx - 4.4 * u, by - 11 * u, cx, by - 17 * u * fl); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,240,0.95)'; ctx.beginPath(); ctx.moveTo(cx, by - 13 * u * fl); ctx.quadraticCurveTo(cx + 1.9 * u, by - 10 * u, cx, by - 8.6 * u); ctx.quadraticCurveTo(cx - 1.9 * u, by - 10 * u, cx, by - 13 * u * fl); ctx.fill();
      } else if (kind === 'lamp') {
        shadow(3 * u, 1.1 * u);
        ctx.fillStyle = lin(ctx, cx - 0.8 * u, 0, cx + 0.8 * u, 0, ['#cbd5e1', '#334155']); rr(ctx, cx - 0.7 * u, by - 12 * u, 1.4 * u, 12.2 * u, 0.6 * u); ctx.fill();
        ctx.fillStyle = lin(ctx, cx - 2.4 * u, 0, cx + 2.4 * u, 0, ['#e2e8f0', '#475569']); rr(ctx, cx - 2.4 * u, by - 1.2 * u, 4.8 * u, 1.4 * u, 0.6 * u); ctx.fill();
        glow(cx, by - 14 * u, 11 * u * (0.8 + li * 0.6), '#ffd27a', 0.42 + li * 0.25);
        sphere(cx, by - 14 * u, 2.9 * u, ['#ffffff', '#ffe7a3', '#ffb347']);
        ctx.fillStyle = lin(ctx, 0, by - 18 * u, 0, by - 16.4 * u, ['#e2e8f0', '#475569']); rr(ctx, cx - 2.2 * u, by - 17.8 * u, 4.4 * u, 1.3 * u, 0.6 * u); ctx.fill();
      } else if (kind === 'crystal') {
        shadow(4.2 * u, 1.3 * u);
        glow(cx, by - 7 * u, 13 * u * (0.8 + li * 0.6), '#5ee7ff', 0.4 + li * 0.25);
        var pts = [[cx, by - 15 * u], [cx + 3.6 * u, by - 8 * u], [cx + 2 * u, by], [cx - 2 * u, by], [cx - 3.6 * u, by - 8 * u]];
        ctx.fillStyle = lin(ctx, cx - 4 * u, by - 15 * u, cx + 4 * u, by, ['#e0fbff', CYAN, VIOLET]); poly(ctx, pts); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; poly(ctx, [[cx, by - 15 * u], [cx - 3.6 * u, by - 8 * u], [cx - 0.6 * u, by - 7 * u]]); ctx.fill();
        ctx.fillStyle = 'rgba(76,29,149,0.28)'; poly(ctx, [[cx, by - 15 * u], [cx + 3.6 * u, by - 8 * u], [cx + 2 * u, by], [cx + 0.4 * u, by - 7 * u]]); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = hair(ctx) * 1.5; poly(ctx, pts); ctx.stroke();
        var tw = 0.5 + 0.5 * Math.sin((t || 0) * 3 + sd); ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + 0.5 * tw).toFixed(3) + ')'; ctx.beginPath(); var sx = cx - 1.2 * u, sy = by - 11 * u, ss = 1.6 * u * (0.6 + tw * 0.4); ctx.moveTo(sx, sy - ss); ctx.lineTo(sx + ss * 0.25, sy - ss * 0.25); ctx.lineTo(sx + ss, sy); ctx.lineTo(sx + ss * 0.25, sy + ss * 0.25); ctx.lineTo(sx, sy + ss); ctx.lineTo(sx - ss * 0.25, sy + ss * 0.25); ctx.lineTo(sx - ss, sy); ctx.lineTo(sx - ss * 0.25, sy - ss * 0.25); ctx.closePath(); ctx.fill();
      } else {   // stone / rock: a rounded boulder with cool gradient shading and a specular dot
        shadow(6 * u, 1.8 * u);
        var bw = (kind === 'rock' ? 5 : 6) * u, bh = (kind === 'rock' ? 6 : 8) * u;
        ctx.fillStyle = rad(ctx, cx - bw * 0.4, by - bh * 0.8, bw * 0.1, bw * 1.6, ['#f8fafc', '#a5b4cf', '#5b6b8c']);
        ctx.beginPath(); ctx.moveTo(cx - bw, by); ctx.quadraticCurveTo(cx - bw * 1.1, by - bh * 0.7, cx - bw * 0.35, by - bh); ctx.quadraticCurveTo(cx + bw * 0.5, by - bh * 1.15, cx + bw * 0.95, by - bh * 0.45); ctx.quadraticCurveTo(cx + bw * 1.1, by - bh * 0.05, cx + bw * 0.8, by); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ell(ctx, cx - bw * 0.35, by - bh * 0.75, bw * 0.28, bh * 0.1); ctx.fill();
        ctx.strokeStyle = 'rgba(91,107,140,0.5)'; ctx.lineWidth = 0.5 * u; ctx.beginPath(); ctx.moveTo(cx + bw * 0.1, by - bh * 0.55); ctx.lineTo(cx + bw * 0.45, by - bh * 0.3); ctx.stroke();
      }
      ctx.restore(); ctx.globalAlpha = pa;
    },

    // unitToken: a glossy capsule pawn on a glass base disc. Body = team gradient capsule with a specular streak, a white
    // chest emblem by kind; porcelain head with a team-coloured helmet / hat / hood; a weapon by kind. Selected = a glowing
    // gradient ring and a slow spring bob. Enemies of kind monster get horns and glowing eyes.
    unitToken: function (ctx, r, un, t) {
      un = un || {}; var P = this.palette, U = P.unit, team = un.team === 'b' || un.team === 'n' ? un.team : 'a';
      var cL = P.team[team + 'Light'] || '#ffffff', cM = P.team[team] , cD = P.team[team + 'Dark'], kind = un.kind || 'fighter', f = un.facing === -1 ? -1 : 1;
      var k = Math.min(r.w / 16, r.h / 24), cx = r.x + r.w / 2, base = un.noShadow ? r.y + r.h - 0.5 * k : r.y + r.h - 2.4 * k;
      var tt = t || 0, bob = un.selected ? -(0.5 + 0.5 * Math.sin(tt * Math.PI * 2 * 0.7)) * 1.1 * k : 0, pa = ctx.globalAlpha;
      ctx.save(); ctx.globalAlpha = pa * (un.dead ? 0.35 : 1); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (!un.noShadow) {
        ctx.fillStyle = U.shadow; ell(ctx, cx + 0.6 * k, base + 0.9 * k, 6.6 * k, 2.2 * k); ctx.fill();
        ctx.fillStyle = lin(ctx, cx - 6 * k, base, cx + 6 * k, base, [rgba(cL, 0.75), rgba(cM, 0.6), rgba(cD, 0.75)]); ell(ctx, cx, base, 6.2 * k, 2.1 * k); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.45 * k; ell(ctx, cx, base - 0.2 * k, 6.2 * k, 2.1 * k); ctx.stroke();
        if (un.selected) { var sp = 0.5 + 0.5 * Math.sin(tt * Math.PI * 2 * 0.7); shadowOn(ctx, rgba(CYAN, 0.9), 3, 0); ctx.strokeStyle = lin(ctx, cx - 7 * k, 0, cx + 7 * k, 0, [CYAN, VIOLET, PINK]); ctx.lineWidth = 0.9 * k; ell(ctx, cx, base, (7.4 + sp * 0.6) * k, (2.6 + sp * 0.2) * k); ctx.stroke(); shadowOff(ctx); }
      }
      ctx.translate(cx, base + bob); ctx.scale(f, 1);
      // weapon behind the body (drawn on the facing side)
      var steel = U.steel, wood = U.wood;
      if (kind === 'knight') { ctx.fillStyle = lin(ctx, 4.2 * k, 0, 6 * k, 0, [steel[0], steel[1]]); rr(ctx, 4.3 * k, -16.5 * k, 1.5 * k, 10 * k, 0.6 * k); ctx.fill(); ctx.fillStyle = AMBER; rr(ctx, 3.2 * k, -7 * k, 3.7 * k, 1.1 * k, 0.5 * k); ctx.fill(); }
      else if (kind === 'mage') { ctx.fillStyle = lin(ctx, 4 * k, 0, 5.6 * k, 0, wood); rr(ctx, 4.4 * k, -17 * k, 1.1 * k, 15 * k, 0.5 * k); ctx.fill(); var oc = team === 'b' ? PINK : CYAN; shadowOn(ctx, rgba(oc, 0.95), 3, 0); ctx.fillStyle = rad(ctx, 4.6 * k, -18.4 * k, 0.2 * k, 2.2 * k, ['#ffffff', oc, team === 'b' ? '#9d174d' : VIOLET]); circ(ctx, 4.95 * k, -18 * k, 2 * k); ctx.fill(); shadowOff(ctx); }
      else if (kind === 'archer') { ctx.strokeStyle = lin(ctx, 0, -16 * k, 0, -3 * k, wood); ctx.lineWidth = 1 * k; ctx.beginPath(); ctx.arc(3 * k, -9.5 * k, 6 * k, -1.1, 1.1); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.3 * k; ctx.beginPath(); ctx.moveTo(3 * k + Math.cos(-1.1) * 6 * k, -9.5 * k + Math.sin(-1.1) * 6 * k); ctx.lineTo(3 * k + Math.cos(1.1) * 6 * k, -9.5 * k + Math.sin(1.1) * 6 * k); ctx.stroke(); }
      else if (kind === 'fighter') { ctx.fillStyle = lin(ctx, 0, -15 * k, 0, -2 * k, wood); rr(ctx, 4.6 * k, -15 * k, 1.2 * k, 12 * k, 0.5 * k); ctx.fill(); ctx.fillStyle = lin(ctx, 5 * k, -15 * k, 9 * k, -10 * k, [steel[0], steel[1], steel[2]]); ctx.beginPath(); ctx.moveTo(5.2 * k, -15.4 * k); ctx.quadraticCurveTo(9.6 * k, -15 * k, 9 * k, -10.2 * k); ctx.quadraticCurveTo(7.2 * k, -12 * k, 5.2 * k, -11.6 * k); ctx.closePath(); ctx.fill(); }
      // body capsule
      var bw = 4.6 * k, bt = -12.5 * k, bb = -0.6 * k;
      ctx.fillStyle = lin(ctx, -bw, bt, bw, bb, [cL, cM, cD]); rr(ctx, -bw, bt, bw * 2, bb - bt, [bw, bw, 2 * k, 2 * k]); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; rr(ctx, -bw + 1 * k, bt + 1.6 * k, 1.3 * k, 6 * k, 0.65 * k); ctx.fill();
      ctx.fillStyle = rgba(cD, 0.55); rr(ctx, -bw, -3.2 * k, bw * 2, 1.3 * k, 0.4 * k); ctx.fill();   // belt
      // chest emblem (white)
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; var ey = -7.6 * k;
      if (kind === 'knight') { ctx.beginPath(); ctx.moveTo(-1.5 * k, ey - 1.6 * k); ctx.lineTo(1.5 * k, ey - 1.6 * k); ctx.lineTo(1.5 * k, ey); ctx.quadraticCurveTo(1.2 * k, ey + 1.4 * k, 0, ey + 2 * k); ctx.quadraticCurveTo(-1.2 * k, ey + 1.4 * k, -1.5 * k, ey); ctx.closePath(); ctx.fill(); }
      else if (kind === 'mage') { ctx.beginPath(); for (var i = 0; i < 8; i++) { var an = -Math.PI / 2 + i * Math.PI / 4, rr0 = (i % 2 ? 0.6 : 1.8) * k; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(an) * rr0, ey + Math.sin(an) * rr0); } ctx.closePath(); ctx.fill(); }
      else if (kind === 'monster') { poly(ctx, [[-1.6 * k, ey - 1 * k], [1.6 * k, ey - 1 * k], [0, ey + 1.6 * k]]); ctx.fill(); }
      else { circ(ctx, 0, ey, 1.4 * k); ctx.fill(); ctx.fillStyle = cM; circ(ctx, 0, ey, 0.6 * k); ctx.fill(); }
      // head
      var hy = -15.6 * k, hr = 3.7 * k, monster = kind === 'monster';
      var skinC = monster ? ['#e9d5ff', '#a78bfa', '#5b21b6'] : team === 'b' ? ['#f5f3ff', '#d8d4f0', '#9b95c9'] : [U.face, U.face, U.face2];
      ctx.fillStyle = rad(ctx, -hr * 0.4, hy - hr * 0.5, hr * 0.1, hr * 1.3, skinC); circ(ctx, 0, hy, hr); ctx.fill();
      // eyes (facing side)
      var eyeC = team === 'b' ? (monster ? '#fde047' : '#ff4d8d') : '#1e1b4b';
      if (team === 'b') shadowOn(ctx, rgba(eyeC, 0.9), 1.6, 0);
      ctx.fillStyle = eyeC; ell(ctx, 1 * k, hy + 0.3 * k, 0.5 * k, 0.75 * k); ctx.fill(); ell(ctx, 2.7 * k, hy + 0.3 * k, 0.45 * k, 0.7 * k); ctx.fill(); shadowOff(ctx);
      // headgear by kind
      if (kind === 'knight') { ctx.fillStyle = lin(ctx, -hr, hy - hr, hr, hy, [cL, cM, cD]); ctx.beginPath(); ctx.arc(0, hy, hr + 0.4 * k, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(hr + 0.4 * k, hy - 0.8 * k); ctx.lineTo(-hr - 0.4 * k, hy - 0.8 * k); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.6)'; rr(ctx, -0.5 * k, hy - hr - 1.8 * k, 1 * k, 2.4 * k, 0.5 * k); ctx.fill(); ctx.fillStyle = PINK; rr(ctx, -0.5 * k, hy - hr - 2.6 * k, 1 * k, 1.4 * k, 0.5 * k); ctx.fill(); }
      else if (kind === 'mage') { ctx.fillStyle = lin(ctx, -hr, hy - 9 * k, hr, hy, [cL, cM, cD]); ctx.beginPath(); ctx.moveTo(-hr - 1.4 * k, hy - 1 * k); ctx.quadraticCurveTo(-1 * k, hy - 4 * k, -0.6 * k, hy - 9.6 * k); ctx.quadraticCurveTo(1.6 * k, hy - 5 * k, hr + 1.4 * k, hy - 1 * k); ctx.closePath(); ctx.fill(); ctx.fillStyle = AMBER; circ(ctx, -0.6 * k, hy - 9.6 * k, 0.8 * k); ctx.fill(); }
      else if (kind === 'archer') { ctx.fillStyle = lin(ctx, -hr, hy - hr, hr, hy, [cL, cD]); ctx.beginPath(); ctx.arc(0, hy, hr + 0.6 * k, Math.PI * 0.85, Math.PI * 2.05); ctx.quadraticCurveTo(0, hy - 1.6 * k, -hr - 0.5 * k, hy + 1.2 * k); ctx.closePath(); ctx.fill(); }
      else if (monster) { ctx.fillStyle = '#f8fafc'; poly(ctx, [[-2.6 * k, hy - 2.4 * k], [-3.8 * k, hy - 6.2 * k], [-1.2 * k, hy - 3.4 * k]]); ctx.fill(); poly(ctx, [[2.6 * k, hy - 2.4 * k], [3.8 * k, hy - 6.2 * k], [1.2 * k, hy - 3.4 * k]]); ctx.fill(); }
      else { ctx.fillStyle = lin(ctx, -hr, 0, hr, 0, [cM, cD]); rr(ctx, -hr - 0.2 * k, hy - 2.2 * k, hr * 2 + 0.4 * k, 1.5 * k, 0.7 * k); ctx.fill(); ctx.fillStyle = lin(ctx, -hr, hy - hr, hr, hy, [cL, cM]); ctx.beginPath(); ctx.arc(0, hy, hr + 0.2 * k, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ell(ctx, -1.5 * k, hy - 2.2 * k, 1 * k, 0.55 * k); ctx.fill();
      // shield in front for knights
      if (kind === 'knight') { ctx.fillStyle = lin(ctx, -7 * k, -11 * k, -2 * k, -3 * k, ['#ffffff', cM, cD]); ctx.beginPath(); ctx.moveTo(-7 * k, -10.6 * k); ctx.lineTo(-2.6 * k, -10.6 * k); ctx.lineTo(-2.6 * k, -6.4 * k); ctx.quadraticCurveTo(-3 * k, -3.4 * k, -4.8 * k, -2.6 * k); ctx.quadraticCurveTo(-6.6 * k, -3.4 * k, -7 * k, -6.4 * k); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.45 * k; ctx.stroke(); }
      ctx.restore(); ctx.globalAlpha = pa;
    },

    // atmosphere: 'world' = soft coloured light pools on the ground under each light; 'final' = a daylight sheen from the
    // top-left, a faint indigo vignette and a few slow bokeh discs (never over the HUD: it runs before windows)
    atmosphere: function (ctx, view, t, o) {
      o = o || {}; var ph = o.phase || 'final', L = o.lights || [], x = view.x, y = view.y, w = view.w, h = view.h, pa = ctx.globalAlpha;
      ctx.save();
      if (ph === 'world') {
        ctx.globalCompositeOperation = 'lighter';
        L.forEach(function (l0) { var l = API.normLight ? API.normLight(l0) : l0, i = l.intensity == null ? 0.5 : l.intensity, R = (l.r || 40) * 0.95; ctx.fillStyle = rad(ctx, l.x, l.y, 0, R, [rgba(l.col || '#ffd27a', 0.30 * i), rgba(l.col || '#ffd27a', 0.10 * i), rgba(l.col || '#ffd27a', 0)]); ctx.fillRect(l.x - R, l.y - R, R * 2, R * 2); });
      } else if (ph === 'final') {
        ctx.fillStyle = lin(ctx, x, y, x + w * 0.6, y + h * 0.6, [[0, 'rgba(255,255,255,0.16)'], [1, 'rgba(255,255,255,0)']]); ctx.fillRect(x, y, w, h);
        ctx.fillStyle = rad(ctx, x + w * 0.5, y + h * 0.48, Math.min(w, h) * 0.45, Math.max(w, h) * 0.78, ['rgba(40,20,120,0)', 'rgba(40,20,120,0.20)']); ctx.fillRect(x, y, w, h);
        ctx.globalCompositeOperation = 'lighter';
        for (var i = 0; i < 7; i++) { var s1 = h2(i, 7, 1), s2 = h2(i, 7, 2), bx = x + ((s1 * w + (t || 0) * (3 + s2 * 4)) % w), by2 = y + ((s2 * h - (t || 0) * (2 + s1 * 3)) % h + h) % h, br = 3 + s1 * 6;
          ctx.fillStyle = rad(ctx, bx, by2, 0, br, [rgba(i % 2 ? '#a5f3fc' : '#fbcfe8', 0.10), rgba('#ffffff', 0)]); circ(ctx, bx, by2, br); ctx.fill(); }
      }
      ctx.restore(); ctx.globalAlpha = pa;
    }
  };

  API.register(skin);
})(typeof window !== 'undefined' ? window : this);
