/* GameDNA skin 'flat' · Flat vector / minimal geometric · needs skin-api.js first
 *
 * Modern mobile-strategy look: smooth vector rendering at device resolution (no pixel snapping), geometric shapes,
 * two-tone faces for elevation, a pastel ground with ONE strong accent (indigo #5b4bff), white rounded-rect cards
 * with soft shadows, an Inter-like geometric sans (system stack in games), numbers as bold rounded sans on a soft
 * pill, translucent rounded overlays, a smooth bezier path arrow, eased (cubic / back) motion, and no outlines
 * except subtle hairlines. See skins/flat/STYLE.md.
 *
 * Host: native coordinates stay 256x224 (or any); the backing store is native x scale x devicePixelRatio and the
 * host sets ctx.setTransform(s, 0, 0, s, 0, 0) (SPEC section 3, scale 'fit'). Every method reads the current transform
 * so shadow blur and hairlines stay the same on screen at any scale.
 *
 * Extras beyond SPEC v0.1 (feature-tested by hosts):
 *   path(ctx, points, t, opts)   the reserved move-arrow hook: points = [{x, y}] tile centres (native px)
 *   palette.terrain / palette.unit / palette.numbers   tokens the preview's host-side ground, units and number pills use
 */
(function (root) {
  'use strict';
  var API = root.GameDNA_Skin;
  if (!API) { if (root.console) console.error('flat.js: load skin-api.js first'); return; }
  var C = API.color, rgba = C.rgba, mix = C.mix;

  var SANS = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  var ACC = '#5b4bff', ACC2 = '#7d6bff', INK = '#29304d', MUTED = '#7b8199';

  var palette = {
    ink: INK, paper: '#f4f6fb',
    ui: {
      fill: '#ffffff', fillTo: '#ffffff', edge: 'rgba(41,48,77,0.10)', highlight: '#ffffff', shadow: 'rgba(41,48,77,0.18)',
      select: 'rgba(91,75,255,0.10)', well: '#f1f3f9', chip: '#f4f6fb', accent: ACC, accent2: ACC2, tooltip: '#2b2f45'
    },
    team: { a: '#6f8cff', b: '#ff8574', n: '#aeb5c6', aDark: '#4d68d6', bDark: '#d9624f', nDark: '#8a91a6',
      aLight: '#e7ecff', bLight: '#ffe9e5', aText: '#4d68d6', bText: '#d9624f' },
    overlay: {
      move: { fill: '#5a86ff', edge: '#4a6cf7', alpha: 0.44 },
      attack: { fill: '#ff6b6b', edge: '#f2545b', alpha: 0.38 },
      threat: { fill: '#8a73ff', edge: '#6a52f5', alpha: 0.36 },
      heal: { fill: '#3fcf8e', edge: '#24b072', alpha: 0.32 },
      // the module-raster fallback colours (B-01 until it calls path()): accent ramp
      path: { core: '#ffffff', light: ACC2, mid: ACC, dark: '#4434d9', outline: '#ffffff', spark: '#ffffff' }
    },
    fx: { hot: '#ff8a5c', cold: '#4aa8ff', heal: '#2fbf7a', crit: ACC, status: '#9a6bff', white: '#ffffff' },
    text: {
      main: INK, main2: INK, shadow: 'rgba(0,0,0,0)', outline: '#ffffff', dim: '#b4b9c8', dim2: '#b4b9c8',
      accent: ACC, select: ACC, title: INK, title2: INK, label: MUTED, label2: MUTED, gold: ACC, gold2: ACC,
      plate: INK, plateShadow: 'rgba(0,0,0,0)', onAccent: '#ffffff', pointer: ACC, pointerEdge: '#ffffff'
    },
    bars: {
      track: '#e9ecf4', hp: '#3fcf8e', hpTo: '#7be0a8', hpLow: '#ff7a66', hpLowTo: '#ffa08f',
      charge: ACC, chargeTo: ACC2, haste: '#3fcf8e', hasteTo: '#7be0a8', slow: '#9a8cff', slowTo: '#c2b8ff',
      ready: '#ffb84d', readyTo: '#ffd27f', queued: '#4aa8ff', queuedTo: '#8cc8ff', enemy: '#ff8574', enemyTo: '#ffab9e',
      enemyFull: '#ff5a5a', enemyFullTo: '#ff8574'
    },
    // pop-up number pills: bg (pill), fg (numerals), sh (shadow tint)
    numbers: {
      damage: { bg: '#ffffff', fg: INK, sh: 'rgba(41,48,77,0.22)' },
      crit: { bg: ACC, bg2: ACC2, fg: '#ffffff', sh: 'rgba(68,52,217,0.40)' },
      heal: { bg: '#e3f8ee', fg: '#1f9a5e', sh: 'rgba(31,154,94,0.22)' },
      mp: { bg: '#e2f0ff', fg: '#2f7fd9', sh: 'rgba(47,127,217,0.22)' },
      miss: { bg: '#f1f2f6', fg: '#8a90a3', sh: 'rgba(41,48,77,0.14)' },
      status: { bg: '#efe8ff', fg: '#7a4fe0', sh: 'rgba(122,79,224,0.22)' }
    },
    // scene tokens (SPEC 2.4): terrain.<kind> is ONE colour (the top face, so the generic tile() also works);
    // terrainSide.<kind> is the darker side face of the two-tone tile; terrainArt holds the feature colours
    terrain: {
      grass: '#cfe8c3', forest: '#c4e2b8', water: '#bfe1f4', hill: '#efe2bd', mountain: '#cfe8c3', road: '#efe6d2',
      bridge: '#ecd3ab', fort: '#cfe8c3', sand: '#f5e9c8', wall: '#dfe3ec', floor: '#eef0f6'
    },
    terrainSide: {
      grass: '#aed29f', forest: '#a0c992', water: '#9ccbe6', hill: '#d2c193', mountain: '#aed29f', road: '#d9cba8',
      bridge: '#c9a173', fort: '#aed29f', sand: '#e2cf9c', wall: '#b4bbcc', floor: '#d6dbe6'
    },
    terrainArt: {
      ground: '#e4e8f1', grassAlt: '#c6e3b8', blade: '#9fcb8f', flower: '#ffc861', tree: ['#8cc79a', '#6fae7e', '#a9d9b3'], trunk: '#b48d6b',
      hillPeak: ['#f3e8c8', '#dcc794'], peak: ['#dfe3ec', '#b4bbcc'], snow: '#ffffff', wave: '#e9f7ff', plank: '#d6b88c', rail: '#b98a58',
      fort: ['#fbfaff', '#d6d1e4'], door: '#8a84a8', pebble: '#e6d6ad', brick: '#ccd2de', tile2: '#e6e9f1'
    },
    unit: { shadow: 'rgba(41,48,77,0.16)', face: '#ffffff' }
  };

  /* ---------- helpers ---------- */
  function scaleOf(ctx) { var m = ctx.getTransform ? ctx.getTransform() : null; return m ? Math.max(0.01, Math.hypot(m.a, m.b)) : 1; }
  function rr(ctx, x, y, w, h, r) {   // rounded rect path; r = number or [tl, tr, br, bl]
    ctx.beginPath();
    var R = Array.isArray(r) ? r : [r, r, r, r], lim = Math.min(w, h) / 2;
    R = R.map(function (v) { return Math.max(0, Math.min(v || 0, lim)); });
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, R); return; }
    ctx.moveTo(x + R[0], y); ctx.lineTo(x + w - R[1], y); ctx.arcTo(x + w, y, x + w, y + R[1], R[1]); ctx.lineTo(x + w, y + h - R[2]);
    ctx.arcTo(x + w, y + h, x + w - R[2], y + h, R[2]); ctx.lineTo(x + R[3], y + h); ctx.arcTo(x, y + h, x, y + h - R[3], R[3]); ctx.lineTo(x, y + R[0]); ctx.arcTo(x, y, x + R[0], y, R[0]); ctx.closePath();
  }
  // soft drop shadow in native units, corrected for the current transform (shadowBlur ignores the transform)
  function softShadow(ctx, col, blur, dy) { var k = scaleOf(ctx); ctx.shadowColor = col; ctx.shadowBlur = blur * k; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = (dy || 0) * k; }
  function noShadow(ctx) { ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
  function hair(ctx) { return 1 / scaleOf(ctx); }   // one device pixel in native units
  function grad(ctx, x0, y0, x1, y1, a, b) { var g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b || a); return g; }
  function h2(a, b, n) { var h = (Math.round(a) * 374761393 + Math.round(b) * 668265263 + (n || 0) * 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); }
  function poly(ctx, pts) { ctx.beginPath(); pts.forEach(function (p, i) { ctx[i ? 'lineTo' : 'moveTo'](p[0], p[1]); }); ctx.closePath(); }
  // geometric emblem on a token face; k = native px per design unit, f = facing (1 / -1)
  function emblem(ctx, kind, cx, cy, col, k, f) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(f || 1, 1); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (kind === 'knight') {   // shield
      ctx.beginPath(); ctx.moveTo(-1.9 * k, -2 * k); ctx.lineTo(1.9 * k, -2 * k); ctx.lineTo(1.9 * k, 0.2 * k); ctx.quadraticCurveTo(1.6 * k, 1.8 * k, 0, 2.5 * k); ctx.quadraticCurveTo(-1.6 * k, 1.8 * k, -1.9 * k, 0.2 * k); ctx.closePath(); ctx.fill();
    } else if (kind === 'mage') {   // five-point star
      ctx.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? 1.05 : 2.5) * k; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, 0.2 * k + Math.sin(a) * r); } ctx.closePath(); ctx.lineWidth = 0.35 * k; ctx.fill(); ctx.stroke();
    } else if (kind === 'archer') {   // bow and arrow
      ctx.lineWidth = 0.6 * k; ctx.beginPath(); ctx.arc(-0.6 * k, 0, 2.3 * k, -Math.PI / 2.3, Math.PI / 2.3); ctx.stroke();
      ctx.lineWidth = 0.35 * k; ctx.beginPath(); ctx.moveTo(0.3 * k, -2.1 * k); ctx.lineTo(0.3 * k, 2.1 * k); ctx.stroke();
      ctx.lineWidth = 0.45 * k; ctx.beginPath(); ctx.moveTo(-2 * k, 0); ctx.lineTo(1.9 * k, 0); ctx.stroke(); poly(ctx, [[2.6 * k, 0], [1.6 * k, -0.7 * k], [1.6 * k, 0.7 * k]]); ctx.fill();
    } else if (kind === 'monster') {   // horns, eyes, fangs
      poly(ctx, [[-2.2 * k, -0.6 * k], [-1.6 * k, -2.6 * k], [-0.7 * k, -1.1 * k]]); ctx.fill(); poly(ctx, [[2.2 * k, -0.6 * k], [1.6 * k, -2.6 * k], [0.7 * k, -1.1 * k]]); ctx.fill();
      circ(ctx, -0.9 * k, 0, 0.55 * k); ctx.fill(); circ(ctx, 0.9 * k, 0, 0.55 * k); ctx.fill();
      poly(ctx, [[-1 * k, 1.2 * k], [-0.4 * k, 1.2 * k], [-0.7 * k, 2.2 * k]]); ctx.fill(); poly(ctx, [[0.4 * k, 1.2 * k], [1 * k, 1.2 * k], [0.7 * k, 2.2 * k]]); ctx.fill();
    } else {   // fighter: axe
      rr(ctx, -1.1 * k, -2.5 * k, 0.75 * k, 5 * k, 0.35 * k); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-0.5 * k, -2.3 * k); ctx.quadraticCurveTo(2.9 * k, -2.4 * k, 2.5 * k, 1.1 * k); ctx.quadraticCurveTo(1.2 * k, -0.2 * k, -0.5 * k, 0.1 * k); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function ease(name, s) { return API.ease[name] ? API.ease[name](Math.max(0, Math.min(1, s))) : s; }

  var fonts = {
    ui: { type: 'canvas', family: SANS, size: 7.5, weight: 600 },
    num: { type: 'canvas', family: SANS, size: 10, weight: 800 },
    title: { type: 'canvas', family: SANS, size: 9, weight: 800, letterSpacing: -0.1 },
    label: { type: 'canvas', family: SANS, size: 5.2, weight: 700, letterSpacing: 0.55, uppercase: true },
    plate: { type: 'canvas', family: SANS, size: 6.2, weight: 700, letterSpacing: 0.35, uppercase: true },
    small: { type: 'canvas', family: SANS, size: 6, weight: 600 },
    rules: { snap: false, smoothing: true, minSize: 5, lineH: 1.3, uppercase: false, note: 'system sans in games; Inter only on documentation pages' }
  };

  var skin = {
    id: 'flat', name: 'Flat vector / minimal geometric', pixel: false,
    native: { w: 256, h: 224, scale: 'fit', smoothing: true, snap: 0, minScale: 1 },
    palette: palette,
    fonts: fonts,
    shape: { radius: 5, plateRadius: 99, edgeWidth: 0, padding: 5, barRadius: 99, barInset: 0, teamTint: 0.06 },
    overlayStyle: { mode: 'wash', pattern: 'solid', radius: 2.5, edgeWidth: 0.75, edgeAlpha: 0.8, seamAlpha: 0.35, lift: 0.3 },
    particles: { shape: 'circle', size: [1.2, 2.8], count: 0.8, snap: false, blend: 'source-over', glow: 0, gravity: 0.05, drag: 0.06,
      life: [380, 760], colors: ['ui.accent', 'ui.accent2', 'fx.hot', 'paper'], trail: 0 },
    outline: { text: { width: 0 }, number: { width: 0, max: 0, drop: 0, mode: 'none' }, sprite: { width: 0, color: 'ink', mode: 'none' } },
    shadow: { text: null, window: { dx: 0, dy: 1.5, blur: 6 }, sprite: { kind: 'blob', alpha: 0.16 } },
    motion: { stepMs: 0, snap: false, ease: { move: 'outCubic', pop: 'outBack', fade: 'outQuad' }, fadeSteps: null, shakeInt: false, flashMax: 0.3, squash: { x: 1.12, y: 0.88, ms: 80 } },
    frameRoles: ['row', 'backing'],
    layout: { handW: 7, handH: 5, pointerGap: 5, rowFrame: true },

    // frame(ctx, rect, {role, team, focus, alert, disabled, alpha}) -> inner rect
    frame: function (ctx, r, st) {
      st = st || {}; var P = this.palette, U = P.ui, S = this.shape, role = st.role || 'window';
      var x = r.x, y = r.y, w = r.w, h = r.h, pa = ctx.globalAlpha, team = st.team && st.team !== 'n' ? st.team : null;
      if (role === 'row' || role === 'backing') {   // unframed: accent-tinted pill for the selected row, a soft rounded well for backings
        ctx.save(); ctx.globalAlpha = pa * (st.alpha == null ? 1 : st.alpha);
        if (role === 'row') { ctx.fillStyle = U.select; rr(ctx, x, y, w, h, Math.min(h / 2, 4)); ctx.fill(); }
        else { ctx.fillStyle = U.well; rr(ctx, x, y, w, h, Math.min(4, h / 2, w / 2)); ctx.fill(); }
        ctx.restore();
        return { x: x, y: y, w: w, h: h };
      }
      var rad = role === 'plate' || role === 'tooltip' || role === 'banner' ? h / 2 : Math.min(S.radius, h / 2, w / 2);
      ctx.save();
      ctx.globalAlpha = pa * (st.alpha == null ? 1 : st.alpha) * (st.disabled ? 0.55 : 1);
      var fill, sh = U.shadow;
      if (role === 'banner') { fill = grad(ctx, x, y, x + w, y, U.accent, U.accent2); sh = 'rgba(68,52,217,0.35)'; }
      else if (role === 'tooltip') { fill = U.tooltip; sh = 'rgba(41,48,77,0.35)'; }
      else fill = team ? mix(U.fill, P.team[team], S.teamTint) : U.fill;
      // soft shadow: one wide, faint ambient + one tight contact shadow
      var W = this.shadow.window || { dy: 1.5, blur: 6 };
      ctx.fillStyle = fill;
      softShadow(ctx, sh, W.blur, W.dy); rr(ctx, x, y, w, h, rad); ctx.fill();
      softShadow(ctx, 'rgba(41,48,77,0.08)', 1.2, 0.4); rr(ctx, x, y, w, h, rad); ctx.fill();
      noShadow(ctx);
      if (role === 'window' || role === 'plate') {   // hairline edge: the only outline the style allows
        ctx.lineWidth = hair(ctx); ctx.strokeStyle = U.edge; rr(ctx, x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth, Math.max(0, rad - ctx.lineWidth / 2)); ctx.stroke();
      }
      if (team && role === 'window' && h > 14) {   // team accent: a rounded bar inside the left edge
        ctx.fillStyle = P.team[team]; rr(ctx, x + 2, y + rad, 1.4, h - 2 * rad, 0.7); ctx.fill();
      }
      if (st.alert || st.focus) {
        ctx.lineWidth = 1; ctx.strokeStyle = st.alert ? P.team.b : U.accent; ctx.globalAlpha *= 0.9;
        rr(ctx, x - 1.5, y - 1.5, w + 3, h + 3, rad + 1.5); ctx.stroke();
      }
      ctx.restore();
      var pad = role === 'plate' || role === 'tooltip' || role === 'banner' ? Math.max(3, h * 0.25) : S.padding;
      var padX = role === 'plate' || role === 'tooltip' || role === 'banner' ? Math.max(pad, h / 2) : pad;
      return { x: x + padX + (team && role === 'window' ? 1 : 0), y: y + pad, w: w - 2 * padX - (team && role === 'window' ? 1 : 0), h: h - 2 * pad };
    },

    // number(ctx, str, x, y, opts) -> [{x, y, w, h}] : bold rounded numerals on a soft pill that bounces as one piece
    number: function (ctx, str, x, y, o) {
      o = o || {}; var P = this.palette, kind = o.kind || 'damage', K = P.numbers[kind] || P.numbers.damage, s = String(str);
      var crit = kind === 'crit', sc = (o.scale || 1) * (crit && o.big !== false ? 1.3 : 1);
      var fN = { font: 'num', scale: sc }, fS = { font: 'label', scale: sc * 1.15 }, fL = { font: 'label', scale: 1 };
      var size = this.fonts.num.size * sc, cap = size * 0.73;
      // glyph list: number chars, then suffix chars (both inside the pill), then label chars (own pill)
      var items = [], cx = 0, i, w;
      for (i = 0; i < s.length; i++) { w = this.measure(s[i], fN); items.push({ ch: s[i], x: cx, w: w, f: 'num' }); cx += w; }
      var numW = cx;
      if (o.suffix) { cx += 1.2 * sc; for (i = 0; i < o.suffix.length; i++) { w = this.measure(o.suffix[i], fS) + this.fonts.label.letterSpacing * sc * 1.15; items.push({ ch: o.suffix[i], x: cx, w: w, f: 'suffix' }); cx += w; } }
      var textW = cx, padX = 3.6 * sc, H = Math.round(size * 1.3 * 2) / 2, PW = Math.max(H, textW + 2 * padX);
      var lab = o.label ? String(o.label) : null, labItems = [];
      if (lab) for (i = 0; i < lab.length; i++) labItems.push({ ch: lab[i], lab: true });
      // anchor
      var px = x, py = y;
      if (o.align === 'center') px -= PW / 2;
      if (o.baseline === 'bottom') py -= H;
      // per-glyph offsets from the module; the pill takes their average, glyphs keep a softened ripple
      var offs = items.concat(labItems).map(function (it, j) { return (o.glyphOffset && o.glyphOffset(j, it)) || {}; });
      // SPEC 2.1 block rule: the part moves with its first item (k = 0), takes the largest alpha and any flash
      function avg(list) {
        var n = 0, a = 0, fl = false, lead = null;
        list.forEach(function (d) { if (d.skip) return; if (!lead) lead = d; n++; a = Math.max(a, d.alpha == null ? (o.alpha == null ? 1 : o.alpha) : d.alpha); fl = fl || !!d.flash; });
        return n ? { dx: lead.dx || 0, dy: lead.dy || 0, a: a, flash: fl, n: n, sx: lead.sx || 1, sy: lead.sy || 1 } : { n: 0 };
      }
      var M = avg(offs.slice(0, items.length)), Lb = avg(offs.slice(items.length)), out = [], pa = ctx.globalAlpha;
      ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      if (M.n) {
        var X = px + M.dx, Y = py + M.dy, A = Math.max(0, Math.min(1, M.a));
        var self = this, base = Y + H / 2 + cap / 2, x0 = X + (PW - textW) / 2;
        var badge = function (g) {
          if (M.sx !== 1 || M.sy !== 1) { g.translate(X + PW / 2, Y + H); g.scale(M.sx, M.sy); g.translate(-(X + PW / 2), -(Y + H)); }
          var bg = crit ? grad(g, X, Y, X + PW, Y + H, K.bg, K.bg2) : K.bg;
          if (M.flash) bg = crit ? mix(K.bg, '#ffffff', self.motion.flashMax) : mix(K.bg, P.ui.accent, 0.15);
          g.fillStyle = bg; softShadow(g, K.sh, 3.5 * sc, 1.2 * sc); rr(g, X, Y, PW, H, H / 2); g.fill(); noShadow(g);
          if (kind === 'damage' || kind === 'miss') { g.lineWidth = hair(g); g.strokeStyle = 'rgba(41,48,77,0.08)'; rr(g, X, Y, PW, H, H / 2); g.stroke(); }
          g.textBaseline = 'alphabetic'; g.textAlign = 'left';
          items.forEach(function (it, j) {
            var d = offs[j]; if (d.skip) return;
            var ry = 0, rx = 0;   // glyphs ride the pill (block rule)
            var f = it.f === 'num' ? self.fonts.num : self.fonts.label, fs = it.f === 'num' ? sc : sc * 1.15;
            g.font = API.font.css(f, fs); if ('letterSpacing' in g) g.letterSpacing = it.f === 'num' ? '0px' : (f.letterSpacing * fs) + 'px';
            g.fillStyle = K.fg;
            var gy = it.f === 'num' ? base : base - (cap - f.size * fs * 0.73) / 2 - 0.1;
            g.fillText(it.ch, x0 + it.x + rx, gy + ry);
            out.push({ x: x0 + it.x + rx, y: base - cap + ry, w: it.w, h: cap });
          });
        };
        // fades go through one offscreen layer so the pill, its shadow and the numerals fade as ONE flat shape
        ctx.globalAlpha = pa; ctx.save(); API.fadeLayer(ctx, A, { x: X - 8 * sc, y: Y - 8 * sc, w: PW + 16 * sc, h: H + 16 * sc }, badge); ctx.restore();
      }
      if (lab && Lb.n) {   // CRITICAL: a small accent-outlined white tag above the pill
        var lw = this.measure(lab, fL), lh = 7, lpx = 3, LW = lw + 2 * lpx, gap = o.labelGap == null ? 2 : Math.min(3, o.labelGap);
        var LX = px + PW / 2 - LW / 2 + Lb.dx, LY = py - lh - gap + Lb.dy;
        var selfL = this; ctx.globalAlpha = pa;
        API.fadeLayer(ctx, Math.max(0, Math.min(1, Lb.a)), { x: LX - 5, y: LY - 5, w: LW + 10, h: lh + 10 }, function (g) {
          g.fillStyle = Lb.flash ? P.ui.accent : '#ffffff'; softShadow(g, 'rgba(68,52,217,0.25)', 2.5, 0.8); rr(g, LX, LY, LW, lh, lh / 2); g.fill(); noShadow(g);
          selfL.text(g, lab, LX + lpx, LY + (lh - selfL.fonts.label.size) / 2 - 0.3, { font: 'label', color: Lb.flash ? '#ffffff' : P.ui.accent });
        });
      }
      ctx.restore(); ctx.globalAlpha = pa;
      return out;
    },

    // overlay: translucent wash; cells merge into one region with rounded convex corners, a thin inset edge on the
    // boundary and faint white seams between cells (a quiet grid); grow = eased scale-in from the cell centre
    overlay: function (ctx, r, kind, t, o) {
      o = o || {}; var Cc = this.palette.overlay[kind] || this.palette.overlay.move, OS = this.overlayStyle, g = o.grow == null ? 1 : o.grow;
      if (g <= 0) return;
      var E = o.edges || {}, Sm = o.seams || {}, tx = o.tile ? o.tile.x : 0, ty = o.tile ? o.tile.y : 0;
      var a = Cc.alpha == null ? 0.33 : Cc.alpha, pat = o.pattern || OS.pattern;
      if (pat === 'pulsing') a *= 1 + 0.16 * Math.sin((tx + ty) * 0.55 - t * 3.2);
      else if (pat === 'checker') a *= (tx + ty) % 2 ? 1.12 : 0.82;
      var k = g < 1 ? 0.55 + 0.45 * ease('outBack', g) : 1, cxm = r.x + r.w / 2, cym = r.y + r.h / 2;
      var x = cxm - r.w * k / 2, y = cym - r.h * k / 2, w = r.w * k, h = r.h * k, R = OS.radius * k;
      var rad = [E.top && E.left ? R : 0, E.top && E.right ? R : 0, E.bottom && E.right ? R : 0, E.bottom && E.left ? R : 0];
      if (g < 1) rad = [R, R, R, R];
      var pa = ctx.globalAlpha; ctx.save();
      ctx.globalAlpha = pa * Math.min(1, g * 1.4);
      rr(ctx, x, y, w, h, rad); ctx.fillStyle = rgba('#ffffff', OS.lift); ctx.fill(); ctx.fillStyle = rgba(Cc.fill, a); ctx.fill();
      if (g >= 1) {
        var hl = hair(ctx);
        ctx.fillStyle = rgba('#ffffff', OS.seamAlpha);   // seams: a faint white grid inside the region
        if (Sm.right) ctx.fillRect(x + w - hl * 0.75, y + (E.top ? R : 0), hl * 1.5, h - (E.top ? R : 0) - (E.bottom ? R : 0));
        if (Sm.bottom) ctx.fillRect(x + (E.left ? R : 0), y + h - hl * 0.75, w - (E.left ? R : 0) - (E.right ? R : 0), hl * 1.5);
      }
      // boundary edge: inset line with arcs at rounded corners
      var lw = OS.edgeWidth, i = lw / 2; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(Cc.edge, OS.edgeAlpha * Math.min(1, g));
      ctx.beginPath();
      var any = g < 1;
      if (g < 1) { rr(ctx, x + i, y + i, w - lw, h - lw, Math.max(0, R - i)); }
      else {
        if (E.top) { ctx.moveTo(x + (rad[0] || 0), y + i); ctx.lineTo(x + w - (rad[1] || 0), y + i); any = true; }
        if (E.right) { ctx.moveTo(x + w - i, y + (rad[1] || 0)); ctx.lineTo(x + w - i, y + h - (rad[2] || 0)); any = true; }
        if (E.bottom) { ctx.moveTo(x + w - (rad[2] || 0), y + h - i); ctx.lineTo(x + (rad[3] || 0), y + h - i); any = true; }
        if (E.left) { ctx.moveTo(x + i, y + h - (rad[3] || 0)); ctx.lineTo(x + i, y + (rad[0] || 0)); any = true; }
        if (rad[0]) { ctx.moveTo(x + i, y + R); ctx.arc(x + R, y + R, R - i, Math.PI, 1.5 * Math.PI); }
        if (rad[1]) { ctx.moveTo(x + w - R, y + i); ctx.arc(x + w - R, y + R, R - i, 1.5 * Math.PI, 2 * Math.PI); }
        if (rad[2]) { ctx.moveTo(x + w - i, y + h - R); ctx.arc(x + w - R, y + h - R, R - i, 0, 0.5 * Math.PI); }
        if (rad[3]) { ctx.moveTo(x + R, y + h - i); ctx.arc(x + R, y + h - R, R - i, 0.5 * Math.PI, Math.PI); }
      }
      if (any) ctx.stroke();
      ctx.restore(); ctx.globalAlpha = pa;
    },

    // bar: rounded pill track, 2-stop gradient fill with a full-round end, white highlight line; status tag = small round chip
    bar: function (ctx, r, frac, kind, o) {
      o = o || {}; var P = this.palette, B = P.bars, x = r.x, y = r.y, w = r.w, h = r.h, f = Math.max(0, Math.min(1, frac || 0));
      if (o.px != null && w) f = Math.max(0, Math.min(1, o.px / w));
      ctx.save();
      ctx.fillStyle = B.track; rr(ctx, x, y, w, h, h / 2); ctx.fill();
      if (kind && f > 0) {
        var c0 = B[kind] || P.ui.accent, c1 = B[kind + 'To'] || mix(c0, '#ffffff', 0.3), fw = Math.max(h, w * f);
        ctx.save(); rr(ctx, x, y, w, h, h / 2); ctx.clip();
        ctx.fillStyle = grad(ctx, x, y, x + fw, y, c0, c1); rr(ctx, x, y, fw, h, h / 2); ctx.fill();
        if (h >= 3) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; rr(ctx, x + h / 2, y + h * 0.18, Math.max(0, fw - h), Math.max(0.5, h * 0.18), h * 0.09); ctx.fill(); }
        ctx.restore();
      }
      if (o.tag && (o.tag === 'haste' || o.tag === 'slow')) {
        var tc = o.tag === 'haste' ? B.haste : B.slow, d = Math.max(h + 2, 5), cx = x + w + d / 2 + 1.5, cy = y + h / 2;
        ctx.fillStyle = '#ffffff'; softShadow(ctx, 'rgba(41,48,77,0.25)', 1.5, 0.4); ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.fill(); noShadow(ctx);
        ctx.fillStyle = tc; ctx.beginPath();
        if (o.tag === 'haste') { ctx.moveTo(cx - d * 0.18, cy - d * 0.26); ctx.lineTo(cx + d * 0.24, cy); ctx.lineTo(cx - d * 0.18, cy + d * 0.26); }
        else { ctx.moveTo(cx + d * 0.18, cy - d * 0.26); ctx.lineTo(cx - d * 0.24, cy); ctx.lineTo(cx + d * 0.18, cy + d * 0.26); }
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    },

    // cursor: 'bracket' = rounded accent ring + four rounded corner ticks that breathe (sine, never stepped);
    //         'hand' = a rounded accent chevron with a white rim (rect = pointer box)
    cursor: function (ctx, r, kind, t, o) {
      o = o || {}; var P = this.palette, col = o.invalid ? P.team.b : P.ui.accent, pa = ctx.globalAlpha;
      ctx.save(); ctx.globalAlpha = pa * (o.alpha == null ? 1 : o.alpha); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (kind === 'hand') {
        var hx = r.x, hy = r.y, hw = r.w, hh = r.h, cy = hy + hh / 2;
        ctx.beginPath(); ctx.moveTo(hx + 0.6, hy); ctx.lineTo(hx + hw, cy); ctx.lineTo(hx + 0.6, hy + hh); ctx.lineTo(hx + hw * 0.3, cy); ctx.closePath();
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; softShadow(ctx, 'rgba(68,52,217,0.35)', 2, 0.6); ctx.stroke(); ctx.fill(); noShadow(ctx);
        ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.stroke(); ctx.fill();
      } else {
        var b = 0.6 + 0.6 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.1)), X = r.x, Y = r.y, W = r.w, H = r.h, L = Math.max(3, W * 0.24), q = 1.6;
        ctx.fillStyle = rgba(col, 0.10); rr(ctx, X + 0.5, Y + 0.5, W - 1, H - 1, 3); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 0.9; rr(ctx, X + 0.45, Y + 0.45, W - 0.9, H - 0.9, 3); ctx.stroke();
        ctx.lineWidth = 1.1;
        [[X - b, Y - b, 1, 1], [X + W + b, Y - b, -1, 1], [X - b, Y + H + b, 1, -1], [X + W + b, Y + H + b, -1, -1]].forEach(function (c) {
          ctx.beginPath(); ctx.moveTo(c[0], c[1] + c[3] * L); ctx.lineTo(c[0], c[1] + c[3] * q); ctx.quadraticCurveTo(c[0], c[1], c[0] + c[2] * q, c[1]); ctx.lineTo(c[0] + c[2] * L, c[1]); ctx.stroke();
        });
      }
      ctx.restore(); ctx.globalAlpha = pa;
    },

    // tile(ctx, rect, kind, t): a soft two-tone tile (darker side face under a lighter top) on the cool ground, with a
    // flat geometric feature. Water and bridges are full-bleed so a river reads as one continuous, lower channel.
    tile: function (ctx, r, kind, t) {
      var P = this.palette, TT = P.terrain, SD = P.terrainSide, AR = P.terrainArt, x = r.x, y = r.y, w = r.w, h = r.h, u = w / 16;
      if (!TT[kind]) kind = 'grass';
      var gap = 0.9 * u, X = x + gap / 2, Y = y + gap / 2, S = w - gap, R = 2.6 * u, DEP = 1.2 * u;
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (kind === 'water' || kind === 'bridge') {
        ctx.fillStyle = TT.water; ctx.fillRect(x, y, w, h);
        if (kind === 'water') for (var k = 0; k < 2; k++) {
          var ph = (t || 0) * 0.9 + h2(x, y, k) * 6, wx = x + 3 * u + h2(x, y, k + 3) * 5 * u + Math.sin(ph) * 0.8 * u, wy = y + 4.5 * u + k * 6 * u;
          ctx.strokeStyle = AR.wave; ctx.lineWidth = 0.7 * u; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 1.4 * u, wy - 1.1 * u, wx + 2.8 * u, wy); ctx.quadraticCurveTo(wx + 4.2 * u, wy + 1.1 * u, wx + 5.6 * u, wy); ctx.stroke();
        } else {
          ctx.fillStyle = SD.bridge; rr(ctx, x - 0.2 * u, y + 2 * u, w + 0.4 * u, h - 3 * u, 1.2 * u); ctx.fill();
          ctx.fillStyle = TT.bridge; rr(ctx, x - 0.2 * u, y + 1.5 * u, w + 0.4 * u, h - 3.8 * u, 1.2 * u); ctx.fill();
          ctx.fillStyle = AR.plank; for (var pl = 1; pl < 5; pl++) ctx.fillRect(x + pl * w / 5 - 0.25 * u, y + 2.6 * u, 0.5 * u, h - 6 * u);
          ctx.fillStyle = AR.rail; rr(ctx, x - 0.4 * u, y + 1.1 * u, w + 0.8 * u, 1.2 * u, 0.6 * u); ctx.fill(); rr(ctx, x - 0.4 * u, y + h - 3.2 * u, w + 0.8 * u, 1.2 * u, 0.6 * u); ctx.fill();
        }
        ctx.restore(); return;
      }
      ctx.fillStyle = AR.ground; ctx.fillRect(x, y, w, h);
      var lift = kind === 'hill' ? 1.4 * u : kind === 'wall' ? 2.6 * u : 0, dep = kind === 'floor' || kind === 'road' || kind === 'sand' ? DEP * 0.6 : DEP;
      var top = TT[kind], alt = (kind === 'grass' || kind === 'mountain' || kind === 'fort') && h2(x, y, 7) < 0.35 ? AR.grassAlt : top;
      ctx.fillStyle = SD[kind]; rr(ctx, X, Y - lift + dep, S, S - dep * 0.4 + lift - dep * 0.6 + dep * 0.6, R); ctx.fill();
      ctx.fillStyle = alt; rr(ctx, X, Y - lift, S, S - dep * 0.4, R); ctx.fill();
      var cx = x + w / 2, cy = y + h / 2, hh = h2(x, y, 3);
      if (kind === 'grass' || kind === 'fort') {
        if (hh < 0.5) { var gx = X + 3 * u + h2(x, y, 4) * (S - 8 * u), gy = Y + 4 * u + h2(x, y, 5) * (S - 9 * u); ctx.strokeStyle = AR.blade; ctx.lineWidth = 0.55 * u; ctx.beginPath(); ctx.moveTo(gx, gy + 2 * u); ctx.lineTo(gx + 0.5 * u, gy); ctx.moveTo(gx + 1.2 * u, gy + 2 * u); ctx.lineTo(gx + 1.2 * u, gy - 0.6 * u); ctx.moveTo(gx + 2.4 * u, gy + 2 * u); ctx.lineTo(gx + 1.9 * u, gy); ctx.stroke(); }
        if (hh < 0.16 && kind === 'grass') { var fx = X + 3 * u + h2(x, y, 8) * (S - 6 * u), fy = Y + 3 * u + h2(x, y, 9) * (S - 7 * u); ctx.fillStyle = '#ffffff'; circ(ctx, fx, fy, 0.75 * u); ctx.fill(); ctx.fillStyle = AR.flower; circ(ctx, fx, fy, 0.32 * u); ctx.fill(); }
      }
      if (kind === 'forest') [[-3, 1.2, 3.4], [2.8, -0.4, 3.2], [-0.4, -2.6, 2.9]].forEach(function (q) {
        var tx = cx + q[0] * u, ty = cy + q[1] * u, tr = q[2] * u;
        ctx.fillStyle = AR.trunk; rr(ctx, tx - 0.5 * u, ty + tr - 1 * u, 1 * u, 2.4 * u, 0.5 * u); ctx.fill();
        ctx.fillStyle = AR.tree[1]; circ(ctx, tx, ty + 0.8 * u, tr); ctx.fill(); ctx.fillStyle = AR.tree[0]; circ(ctx, tx, ty, tr); ctx.fill();
        ctx.fillStyle = AR.tree[2]; circ(ctx, tx - tr * 0.35, ty - tr * 0.35, tr * 0.35); ctx.fill();
      });
      if (kind === 'hill') {
        var by = cy + 2.6 * u - lift; ctx.lineWidth = 1.2 * u;
        ctx.fillStyle = ctx.strokeStyle = AR.hillPeak[1]; poly(ctx, [[cx - 5.4 * u, by], [cx - 1 * u, by - 6.6 * u], [cx + 1.2 * u, by - 3.8 * u], [cx + 2.6 * u, by - 5.4 * u], [cx + 5.6 * u, by]]); ctx.fill(); ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle = AR.hillPeak[0]; poly(ctx, [[cx - 5.4 * u, by], [cx - 1 * u, by - 6.6 * u], [cx - 0.4 * u, by]]); ctx.fill(); ctx.stroke();
      }
      if (kind === 'mountain') {   // faceted peak: light left face, shaded right face, white cap
        var mb = cy + 4.6 * u, ax = cx - 0.4 * u, ay = cy - 6.2 * u; ctx.lineWidth = 0.9 * u;
        ctx.fillStyle = ctx.strokeStyle = AR.peak[1]; poly(ctx, [[cx - 6 * u, mb], [ax, ay], [cx + 6.2 * u, mb]]); ctx.fill(); ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle = AR.peak[0]; poly(ctx, [[cx - 6 * u, mb], [ax, ay], [ax + 1.2 * u, mb]]); ctx.fill(); ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle = AR.snow; poly(ctx, [[ax - 1.9 * u, ay + 3.3 * u], [ax, ay], [ax + 2.1 * u, ay + 3.4 * u], [ax + 0.9 * u, ay + 2.6 * u], [ax - 0.4 * u, ay + 3.6 * u]]); ctx.fill(); ctx.stroke();
      }
      if (kind === 'road') { ctx.fillStyle = AR.pebble; [[4, 5, 0.8], [10.5, 9, 0.7], [7, 12, 0.6]].forEach(function (q) { circ(ctx, x + q[0] * u + h2(x, y, q[0]) * 1.5 * u, y + q[1] * u, q[2] * u); ctx.fill(); }); }
      if (kind === 'sand') {
        ctx.fillStyle = SD.sand; [[4, 4], [11, 6], [6, 11], [12, 12]].forEach(function (q) { circ(ctx, x + q[0] * u, y + q[1] * u, 0.45 * u); ctx.fill(); });
        ctx.strokeStyle = SD.sand; ctx.lineWidth = 0.5 * u; ctx.beginPath(); ctx.moveTo(x + 4 * u, y + 8.2 * u); ctx.quadraticCurveTo(x + 6.5 * u, y + 7 * u, x + 9 * u, y + 8.2 * u); ctx.stroke();
      }
      if (kind === 'wall') { ctx.fillStyle = AR.brick; rr(ctx, X + 2 * u, Y - lift + 2 * u, S - 4 * u, S - 5.5 * u, 1.4 * u); ctx.fill(); ctx.fillStyle = TT.wall; rr(ctx, X + 2.6 * u, Y - lift + 2.4 * u, S - 5.2 * u, S - 6.8 * u, 1.1 * u); ctx.fill(); }
      if (kind === 'floor') { ctx.fillStyle = AR.tile2; rr(ctx, X + 2.2 * u, Y + 2.2 * u, S - 4.4 * u, S - 5 * u, 1.4 * u); ctx.fill(); }
      if (kind === 'fort') {
        var b = cy + 4.2 * u, F = AR.fort;
        ctx.fillStyle = F[0]; rr(ctx, cx - 5.2 * u, b - 6 * u, 10.4 * u, 6 * u, 0.8 * u); ctx.fill(); ctx.fillStyle = F[1]; rr(ctx, cx - 5.2 * u, b - 1.6 * u, 10.4 * u, 1.6 * u, 0.5 * u); ctx.fill();
        [-5.2, 2.6].forEach(function (dx) { ctx.fillStyle = F[0]; rr(ctx, cx + dx * u, b - 8.8 * u, 2.6 * u, 8.8 * u, 0.5 * u); ctx.fill(); ctx.fillStyle = F[1]; rr(ctx, cx + dx * u, b - 9.8 * u, 2.6 * u, 1.6 * u, 0.4 * u); ctx.fill(); });
        ctx.fillStyle = AR.door; ctx.beginPath(); ctx.moveTo(cx - 1.3 * u, b); ctx.lineTo(cx - 1.3 * u, b - 2.6 * u); ctx.arc(cx, b - 2.6 * u, 1.3 * u, Math.PI, 0); ctx.lineTo(cx + 1.3 * u, b); ctx.fill();
        ctx.fillRect(cx - 0.25 * u, b - 12.6 * u, 0.5 * u, 5 * u); ctx.fillStyle = P.ui.accent; poly(ctx, [[cx + 0.25 * u, b - 12.6 * u], [cx + 3.6 * u, b - 11.5 * u], [cx + 0.25 * u, b - 10.4 * u]]); ctx.fill();
      }
      ctx.restore();
    },

    // unitToken(ctx, rect, unit, t): a round two-tone game piece (team top face over a darker side), white face, geometric
    // emblem by kind, contact shadow. rect is the sprite box (bottom = tile bottom). selected = accent halo + a slow eased bob.
    unitToken: function (ctx, r, un, t) {
      un = un || {}; var P = this.palette, team = un.team === 'b' || un.team === 'n' ? un.team : 'a', top = P.team[team], side = P.team[team + 'Dark'] || mix(top, INK, 0.3);
      var rad = Math.min(r.w * 0.39, r.h * 0.3), k = rad / 5.4, cx = r.x + r.w / 2, base = r.y + r.h, cy = un.noShadow ? r.y + r.h / 2 : base - 8.4 * k;
      var bob = un.selected ? (Math.sin((t || 0) * Math.PI * 2 * 0.8) * 0.5 - 0.5) * k : 0, pa = ctx.globalAlpha;
      ctx.save(); ctx.globalAlpha = pa * (un.dead ? 0.35 : 1);
      if (!un.noShadow) { ctx.fillStyle = P.unit.shadow; ctx.beginPath(); ctx.ellipse(cx, cy + rad - 0.3 * k, rad * 0.85 * (1 + bob / 12), rad * 0.3, 0, 0, Math.PI * 2); ctx.fill(); }
      if (un.selected) { ctx.fillStyle = rgba(P.ui.accent, 0.14); circ(ctx, cx, cy + 0.3 * k, rad + 2 * k); ctx.fill(); ctx.strokeStyle = P.ui.accent; ctx.lineWidth = 0.8 * k; circ(ctx, cx, cy + 0.3 * k, rad + 2 * k); ctx.stroke(); }
      cy += bob;
      ctx.fillStyle = side; circ(ctx, cx, cy + 0.9 * k, rad); ctx.fill();
      ctx.fillStyle = top; circ(ctx, cx, cy, rad); ctx.fill();
      ctx.fillStyle = P.unit.face; circ(ctx, cx, cy, rad - 1.6 * k); ctx.fill();
      emblem(ctx, un.kind || 'fighter', cx, cy, side, k, un.facing === -1 ? -1 : 1);
      ctx.restore(); ctx.globalAlpha = pa;
    },

    // path(ctx, points, t, {tile, alpha, invalid}) — the reserved move-arrow hook. points = tile centres [{x, y}] in native px.
    // Smooth bezier arrow: rounded corners (quadratic, radius = 0.45 tile), soft shadow under a white casing, accent gradient
    // core, rounded triangular head, white dots on the nodes, and one white glint that glides along with an eased clock.
    path: function (ctx, pts, t, o) {
      o = o || {}; if (!pts || pts.length < 2) return;
      var P = this.palette, T = o.tile || 16, rC = T * 0.45, col = o.invalid ? P.team.b : P.ui.accent, col2 = o.invalid ? P.team.bDark : P.ui.accent2;
      var n = pts.length, last = pts[n - 1], prev = pts[n - 2], L = Math.hypot(last.x - prev.x, last.y - prev.y) || 1;
      var dx = (last.x - prev.x) / L, dy = (last.y - prev.y) / L, headLen = T * 0.38, end = { x: last.x - dx * headLen * 0.55, y: last.y - dy * headLen * 0.55 };
      var P2 = pts.slice(0, -1).concat([end]);
      function trace() {
        ctx.beginPath(); ctx.moveTo(P2[0].x, P2[0].y);
        for (var i = 1; i < P2.length - 1; i++) {
          var a = P2[i - 1], b = P2[i], c = P2[i + 1];
          var l1 = Math.hypot(b.x - a.x, b.y - a.y) || 1, l2 = Math.hypot(c.x - b.x, c.y - b.y) || 1, v1 = [(b.x - a.x) / l1, (b.y - a.y) / l1], v2 = [(c.x - b.x) / l2, (c.y - b.y) / l2];
          if (Math.abs(v1[0] - v2[0]) < 1e-6 && Math.abs(v1[1] - v2[1]) < 1e-6) { ctx.lineTo(b.x, b.y); continue; }
          var rr1 = Math.min(rC, l1 / 2, l2 / 2);
          ctx.lineTo(b.x - v1[0] * rr1, b.y - v1[1] * rr1); ctx.quadraticCurveTo(b.x, b.y, b.x + v2[0] * rr1, b.y + v2[1] * rr1);
        }
        ctx.lineTo(P2[P2.length - 1].x, P2[P2.length - 1].y);
      }
      var nx = -dy, ny = dx, hw = T * 0.28, tip = { x: last.x + dx * T * 0.12, y: last.y + dy * T * 0.12 }, hb = { x: tip.x - dx * headLen, y: tip.y - dy * headLen };
      function head() { ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(hb.x + nx * hw, hb.y + ny * hw); ctx.lineTo(hb.x - nx * hw, hb.y - ny * hw); ctx.closePath(); }
      var self = this, A0 = o.alpha == null ? 1 : o.alpha;
      if (A0 < 1 && !o._inLayer) { var bb = pts.reduce(function (b, p) { return { x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y) }; }, { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
        API.fadeLayer(ctx, A0, { x: bb.x0 - T, y: bb.y0 - T, w: bb.x1 - bb.x0 + 2 * T, h: bb.y1 - bb.y0 + 2 * T }, function (g) { self.path(g, pts, t, { tile: T, invalid: o.invalid, _inLayer: true }); }); return; }
      var pa = ctx.globalAlpha; ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // casing (white) with a soft shadow
      softShadow(ctx, 'rgba(41,48,77,0.28)', 2.4, 0.9);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = T * 0.30; trace(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.lineWidth = T * 0.16; head(); ctx.stroke(); ctx.fill();
      noShadow(ctx);
      // accent core
      var bx0 = Math.min.apply(null, pts.map(function (p) { return p.x; })), bx1 = Math.max.apply(null, pts.map(function (p) { return p.x; }));
      var by0 = Math.min.apply(null, pts.map(function (p) { return p.y; })), by1 = Math.max.apply(null, pts.map(function (p) { return p.y; }));
      ctx.strokeStyle = grad(ctx, pts[0].x, pts[0].y, last.x + (bx1 - bx0 ? 0 : 1), last.y + (by1 - by0 ? 0 : 1), col, col2); ctx.lineWidth = T * 0.17; trace(); ctx.stroke();
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = T * 0.05; head(); ctx.stroke(); ctx.fill();
      // origin dot and node dots
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, T * 0.12, 0, Math.PI * 2); ctx.fill();
      for (var i = 1; i < n - 1; i++) { ctx.globalAlpha = pa * 0.9; ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, T * 0.055, 0, Math.PI * 2); ctx.fill(); }
      // glint: eased position along the polyline, 1.4 s loop
      var segs = [], tot = 0; for (i = 1; i < P2.length; i++) { var sl = Math.hypot(P2[i].x - P2[i - 1].x, P2[i].y - P2[i - 1].y); segs.push(sl); tot += sl; }
      var ph = ((t || 0) / 1.4) % 1, s = ease('inOutQuad', ph) * tot, gi = 0; while (gi < segs.length - 1 && s > segs[gi]) { s -= segs[gi]; gi++; }
      var A = P2[gi], Bp = P2[gi + 1], u = segs[gi] ? s / segs[gi] : 0, gx = A.x + (Bp.x - A.x) * u, gy = A.y + (Bp.y - A.y) * u;
      ctx.globalAlpha = pa * Math.sin(Math.PI * ph) * 0.95; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(gx, gy, T * 0.06, 0, Math.PI * 2); ctx.fill();
      ctx.restore(); ctx.globalAlpha = pa;
    }
  };

  API.register(skin);
})(typeof window !== 'undefined' ? window : this);
