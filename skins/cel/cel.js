/* GameDNA skin 'cel' · Cel-shaded anime · needs skin-api.js first
 *
 * Smooth (non-pixel) rendering on the module's native 256x224 grid, drawn at native x devicePixelRatio x CSS scale.
 *   frame   = angled panel (parallelogram), thick ink outline, two-tone hard shadow band, diagonal accent stripe, hard drop
 *   text    = bold rounded sans, ink outline, hard drop, two-tone (color top / color2 bottom, hard split)
 *   number  = big italic comic numerals: ink outline + hard drop, 2-tone fill with a glint, speed lines; crit = starburst
 *   overlay = flat tinted tile, bright inner edge + ink rim on the set's boundary, glossy diagonal sweep when pulsing
 *   bar     = slanted gauge, ink outline, two-tone fill, status tab
 *   cursor  = chunky bracket with a pop-in pulse; 'hand' = chunky outlined arrow
 *   path    = chunky outlined move arrow with marching chevrons (the reserved path() hook; SPEC §2)
 * All shapes are procedural; fonts are a system stack (web fonts only on documentation pages).
 */
(function (root) {
  'use strict';
  var API = root.GameDNA_Skin;
  if (!API) { if (root.console) console.error('cel.js: load skin-api.js first'); return; }
  var C = API.color, LAYER = null;

  var FAMILY = '"M PLUS Rounded 1c", "Baloo 2", "Arial Rounded MT Bold", "Nunito", ui-rounded, "Trebuchet MS", system-ui, sans-serif';
  var NUMFAM = '"Baloo 2", "M PLUS Rounded 1c", "Arial Rounded MT Bold", "Nunito", ui-rounded, "Trebuchet MS", system-ui, sans-serif';

  /* ---------- palette: saturated base + one hard shadow tone per colour ---------- */
  var palette = {
    ink: '#1c1433', paper: '#fff8ec',
    ui: {
      fill: '#4a3fb8', shade: '#2f2680', edge: '#1c1433', highlight: '#8f86ff', shadow: '#1c1433',
      stripe: '#ffd23a', stripe2: '#ff4f8b', select: 'rgba(255,210,58,0.28)', well: 'rgba(28,20,51,0.45)'
    },
    // per team: [base, hard shadow, light rim, stripe]
    panels: {
      a: ['#2a6bff', '#1a43c4', '#8cc0ff', '#ffd23a'],
      b: ['#ff3b56', '#c01a3c', '#ffb0bc', '#ffd23a'],
      n: ['#4a3fb8', '#2f2680', '#a49dff', '#ff4f8b'],
      paper: ['#fff8ec', '#ffd9b0', '#ffffff', '#ff4f8b']
    },
    team: { a: '#2a6bff', b: '#ff3b56', n: '#4a3fb8', aLight: '#8cc0ff', aDark: '#1a43c4', bLight: '#ffb0bc', bDark: '#c01a3c', aText: '#d6e8ff', bText: '#ffe0e5' },
    overlay: {
      move: { fill: '#1f8bff', edge: '#bfe4ff', alpha: 0.34 },
      attack: { fill: '#ff2d4b', edge: '#ffd0d8', alpha: 0.34 },
      threat: { fill: '#a234ff', edge: '#efd2ff', alpha: 0.34 },
      heal: { fill: '#16d483', edge: '#c6ffe4', alpha: 0.34 },
      path: { core: '#ffd23a', light: '#fff4b0', mid: '#ffb21a', dark: '#e0700a', outline: '#1c1433', spark: '#ffffff' }
    },
    fx: { hot: '#ff6a1a', cold: '#30d0ff', heal: '#2ff08a', crit: '#ffd21a', status: '#c25cff', white: '#ffffff', burst: '#ff3b56' },
    text: {
      main: '#ffffff', main2: '#d8e2ff', shadow: '#1c1433', outline: '#1c1433', dim: '#a9a2d6', dim2: '#857cbc',
      accent: '#ffd23a', select: '#fff27a', title: '#ffe14d', title2: '#ffb21a', label: '#9fe6ff', label2: '#58c4f0',
      gold: '#ffe14d', gold2: '#ffb21a', plate: '#ffffff', plateShadow: '#1c1433', pointer: '#ffd23a', pointerEdge: '#1c1433'
    },
    // numerals: [fill, hard shadow tone, glint]
    numbers: {
      damage: ['#ffffff', '#c9d3ff', '#ffffff'], crit: ['#ffe14d', '#ff8a1a', '#ffffff'], heal: ['#5cff9e', '#10b060', '#e6fff0'],
      mp: ['#5ce0ff', '#1a8ce0', '#e6fbff'], miss: ['#e4e0f4', '#a09ac0', '#ffffff'], status: ['#d98cff', '#8a32d0', '#f8e8ff']
    },
    bars: {
      track: '#2a2050', charge: ['#ffd23a', '#e09a0a'], haste: ['#7cf05a', '#2fae2a'], slow: ['#b48cff', '#6e44d0'], ready: ['#ffffff', '#c6d0ff'],
      queued: ['#4ad8ff', '#1a8ac8'], enemy: ['#ff5a6e', '#c01a3c'], enemyFull: ['#ffe14d', '#ff9a1a'], hp: ['#5cf07a', '#1fa84a'], hpLow: ['#ff5a4a', '#c0201e']
    }
  };

  /* ---------- small helpers ---------- */
  function poly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
  function slantPts(x, y, w, h, s) { return [[x + s, y], [x + w, y], [x + w - s, y + h], [x, y + h]]; }
  function scaleOf(g) { try { var m = g.getTransform(); return Math.max(1, Math.hypot(m.a, m.b)); } catch (e) { return 1; } }
  function fontCss(f, scale, italic) { return (italic ? 'italic ' : (f.style && f.style !== 'normal' ? f.style + ' ' : '')) + (f.weight || 800) + ' ' + (f.size * (scale || 1)) + 'px ' + f.family; }

  /* ---------- the skin ---------- */
  var skin = {
    id: 'cel', name: 'Cel-shaded anime', pixel: false,
    native: { w: 256, h: 224, scale: 'fit', smoothing: true, snap: 0, minScale: 2, note: 'backing store = native x devicePixelRatio x CSS scale, ctx.setTransform(s,0,0,s,0,0); modules keep native coordinates' },
    palette: palette,
    fonts: {
      ui: { type: 'canvas', family: FAMILY, size: 8, weight: 800, letterSpacing: 0.2, uppercase: true, note: 'heavy rounded sans; first family is a Google Font for doc pages, games get the system fallback' },
      num: { type: 'canvas', family: NUMFAM, size: 17, weight: 800, style: 'italic', letterSpacing: 0.2, note: 'comic numerals; drawn by number() with outline, hard drop and 2-tone fill' },
      label: { type: 'canvas', family: FAMILY, size: 6.5, weight: 800, letterSpacing: 0.6, uppercase: true, note: 'CRITICAL ribbon, MP suffix' },
      plate: { type: 'canvas', family: FAMILY, size: 7, weight: 800, letterSpacing: 0.3, uppercase: true },
      rules: { snap: false, smoothing: true, minSize: 6.5, uppercase: true, lineH: 12 }
    },
    shape: { slant: 4, radius: 0, edgeWidth: 1.2, padding: 5, stripeW: 3, shadeBand: 0.32, plateSlant: 3, barSlant: 2 },
    overlayStyle: { mode: 'flat', pattern: 'pulsing', alpha: 0.42, hueAlpha: 0.68, edgeWidth: 1, rim: 0.6, edgeAlpha: 0.95, seamAlpha: 0.22, sweep: 0.22, checker: [1, 0.72] },
    particles: { shape: 'stroke', size: [2, 6], count: 1, snap: false, blend: 'source-over', glow: 0, gravity: 0.08, drag: 0.08, life: [160, 360], colors: ['fx.white', 'fx.crit', 'fx.hot'], trail: 0, rays: 10, outline: 'ink' },
    outline: { text: { width: 1 }, number: { width: 1.6, max: 2.4, drop: 1.4, mode: 'stroke', color: 'text.outline' }, sprite: { width: 1.2, color: 'ink', mode: 'stroke' } },
    shadow: { text: { dx: 0.8, dy: 1, blur: 0 }, window: { dx: 2, dy: 2, blur: 0 }, sprite: { kind: 'blob', alpha: 0.4, hard: true } },
    motion: { stepMs: 0, snap: false, ease: { move: 'outBack', pop: 'outBack', fade: 'linear' }, fadeSteps: null, shakeInt: false, flashMax: 0.6, squash: { x: 1.22, y: 0.8, ms: 70 }, overshoot: 1.18 },

    // text: ink hard drop + ink outline + fill; color2 = hard-split lower half (cel two-tone)
    text: function (ctx, str, x, y, o) {
      o = o || {}; var f = this.fonts[o.font || 'ui'] || this.fonts.ui, P = this.palette, s = String(str);
      if (f.uppercase) s = s.toUpperCase();
      var w = this.measure(s, o), col = API.token(this, o.color) || P.text.main, col2 = o.color2 ? API.token(this, o.color2) : null;
      if (o.align === 'center') x -= w / 2; else if (o.align === 'right') x -= w;
      var ol = o.outline === false ? null : API.token(this, o.outline) || P.text.outline;
      var sh = o.shadow === false ? null : API.token(this, o.shadow) || P.text.shadow, S = this.shadow.text || { dx: 0.8, dy: 1 };
      var ow = o.outlineWidth != null ? o.outlineWidth : this.outline.text.width, sc = o.scale || 1, size = f.size * sc;
      ctx.save(); if (o.alpha != null) ctx.globalAlpha *= o.alpha;
      ctx.font = fontCss(f, sc); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
      if ('letterSpacing' in ctx) ctx.letterSpacing = (f.letterSpacing || 0) + 'px';
      var yy = y + size * 0.86;   // baseline: caps sit centred in the [y, y + size] box the modules lay out with
      if (sh) { ctx.fillStyle = sh; ctx.strokeStyle = sh; ctx.lineWidth = ow * 2; if (ol) ctx.strokeText(s, x + S.dx, yy + S.dy); ctx.fillText(s, x + S.dx, yy + S.dy); }
      if (ol && ow) { ctx.strokeStyle = ol; ctx.lineWidth = ow * 2; ctx.strokeText(s, x, yy); }
      ctx.fillStyle = col; ctx.fillText(s, x, yy);
      if (col2 && col2 !== col) { ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y + size * 0.55, w + 4, size); ctx.clip(); ctx.fillStyle = col2; ctx.fillText(s, x, yy); ctx.restore(); }
      ctx.restore();
      return w;
    },

    // frame: angled panel. role window | plate | banner | tooltip; team a | b | n | paper
    frame: function (g, r, st) {
      st = st || {}; var P = this.palette, SH = this.shape, role = st.role || 'window';
      var team = role === 'tooltip' ? 'paper' : st.team || 'n', T = P.panels[team] || P.panels.n;
      var x = r.x, y = r.y, w = r.w, h = r.h;
      var s = Math.min(role === 'plate' ? SH.plateSlant : SH.slant, Math.round(h * 0.18)), ew = SH.edgeWidth;
      var base = st.disabled ? C.mix(T[0], '#8a86a0', 0.6) : T[0], shade = st.disabled ? C.mix(T[1], '#5a5670', 0.6) : T[1], stripe = st.alert ? P.fx.burst : T[3];
      var pts = slantPts(x, y, w, h, s), D = this.shadow.window;
      g.save(); if (st.alpha != null) g.globalAlpha *= st.alpha;
      g.lineJoin = 'miter'; g.miterLimit = 4;
      // hard drop (no blur)
      if (D) { g.fillStyle = P.ink; g.globalAlpha *= 0.9; poly(g, slantPts(x + D.dx, y + D.dy, w, h, s)); g.fill(); g.globalAlpha /= 0.9; }
      // body + two-tone shade band (hard diagonal split along the lower edge)
      poly(g, pts); g.fillStyle = base; g.fill();
      g.save(); poly(g, pts); g.clip();
      var bh = Math.max(3, Math.round(h * SH.shadeBand));
      g.fillStyle = shade; g.beginPath(); g.moveTo(x - 2, y + h - bh + 4); g.lineTo(x + w + 2, y + h - bh - 2); g.lineTo(x + w + 2, y + h + 2); g.lineTo(x - 2, y + h + 2); g.closePath(); g.fill();
      // rim light (top) and accent stripes across the top-right corner
      g.fillStyle = T[2]; g.fillRect(x, y + ew, w, 1);
      var sw = SH.stripeW, sx = x + w - Math.min(26, w * 0.28);
      g.fillStyle = stripe; poly(g, [[sx, y - 1], [sx + sw * 2.2, y - 1], [sx + sw * 2.2 - 9, y + 10], [sx - 9, y + 10]]); g.fill();
      g.fillStyle = C.rgba(stripe, 0.85); poly(g, [[sx + sw * 3.2, y - 1], [sx + sw * 3.9, y - 1], [sx + sw * 3.9 - 9, y + 10], [sx + sw * 3.2 - 9, y + 10]]); g.fill();
      if (role === 'banner') { g.fillStyle = C.rgba('#ffffff', 0.18); poly(g, [[x + w * 0.1, y], [x + w * 0.16, y], [x + w * 0.16 - h, y + h], [x + w * 0.1 - h, y + h]]); g.fill(); }
      g.restore();
      // thick ink outline
      g.strokeStyle = P.ink; g.lineWidth = ew; poly(g, slantPts(x + ew / 2, y + ew / 2, w - ew, h - ew, s)); g.stroke();
      if (st.focus) { g.strokeStyle = P.text.accent; g.lineWidth = 1; poly(g, slantPts(x - 1.5, y - 1.5, w + 3, h + 3, s)); g.stroke(); }
      g.restore();
      var pad = role === 'plate' ? 3 : SH.padding, px = role === 'plate' ? s + 2 : Math.max(pad, s + 1);
      return { x: x + px, y: y + pad - (role === 'plate' ? 0 : 1), w: w - 2 * px, h: h - 2 * pad + (role === 'plate' ? 0 : 1) };
    },

    // number: comic numerals. Outline + hard drop for every glyph first, then 2-tone fills; crit adds a starburst and a ribbon label
    number: function (ctx, str, x, y, o) {
      o = o || {}; var self = this, P = this.palette, kind = o.kind || 'damage', s = String(str), K = P.numbers[kind] || P.numbers.damage;
      var crit = kind === 'crit', word = !/^[0-9+\-]+$/.test(s), f = this.fonts.num;
      var sc = (o.scale || 1) * (crit && o.big !== false ? 1.35 : 1) * (word ? 0.62 : 1), size = f.size * sc;
      var ON = this.outline.number, ow = Math.min(ON.max, (o.outline != null ? Math.max(1, o.outline) : 1) * ON.width * Math.max(1, sc * 0.8)), drop = ON.drop * Math.max(1, sc);
      var font = fontCss(f, sc, true), skew = 0;   // synthetic italic from the font; no extra shear (digits collide)
      var g0 = API.canvas(4, 4).getContext('2d');
      g0.font = font; var items = [], cx = 0, ls = (f.letterSpacing || 0) * sc;
      for (var i = 0; i < s.length; i++) { var cw = g0.measureText(s[i]).width; items.push({ ch: s[i], x: cx, w: cw }); cx += cw + ls; }
      var nw = cx - ls, sw = 0, sfx = null;
      if (o.suffix) { var lf = this.fonts.label; sfx = { s: String(o.suffix).toUpperCase(), sc: sc * 1.05 }; g0.font = fontCss(lf, sfx.sc); sw = g0.measureText(sfx.s).width + 2 + lf.letterSpacing * sfx.s.length; }
      var tw = nw + sw, capH = size * 0.7;    // visible digit height
      var x0 = o.align === 'center' ? x - tw / 2 : x, top = o.baseline === 'bottom' ? y - capH : y;
      var plan = items.map(function (it, i) { var d = (o.glyphOffset && o.glyphOffset(i, it)) || {}; return { it: it, d: d }; });
      var lab = o.label ? { s: String(o.label).toUpperCase(), i0: items.length } : null;
      var labD = lab ? (o.glyphOffset && o.glyphOffset(items.length, { ch: lab.s, lab: 1 })) || {} : {};
      var pa = ctx.globalAlpha, aOf = function (d) { return pa * (d.alpha != null ? d.alpha : o.alpha != null ? o.alpha : 1); };
      // fading numbers: draw at full alpha into a layer, then composite once, so outlines never show through the fill
      var rawA = function (d) { return d.alpha != null ? d.alpha : o.alpha != null ? o.alpha : 1; }, gA = 1, host = ctx, layer = null;
      plan.forEach(function (p) { if (!p.d.skip) gA = Math.min(gA, rawA(p.d)); });
      if (gA < 0.999 && gA > 0) {
        layer = LAYER || (LAYER = API.canvas(1, 1)); if (layer.width !== host.canvas.width || layer.height !== host.canvas.height) { layer.width = host.canvas.width; layer.height = host.canvas.height; }
        ctx = layer.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, layer.width, layer.height); ctx.setTransform(host.getTransform());
        pa = 1; aOf = function (d) { return Math.min(1, rawA(d) / gA); };
      }
      var cyMid = top + capH / 2, out = [];
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // 1. starburst (crit) and speed lines, behind everything
      var lead = plan.filter(function (p) { return !p.d.skip; })[0];   // burst and speed lines follow the first digit still drawn; none drawn = none
      var fx = { x: x0 + tw / 2, y: cyMid - capH * 0.3 + ((lead && lead.d.dy) || 0) * 0.6 };
      if (lead) ctx.globalAlpha = aOf(lead.d);
      if (crit && lead) {
        var R = Math.max(tw * 0.62, capH * 1.05), n = 14, spk = [];
        for (var k = 0; k < n * 2; k++) { var a = k / (n * 2) * Math.PI * 2 + 0.11, rr = k % 2 ? R * 0.58 : R * (k % 4 ? 0.92 : 1.08); spk.push([fx.x + Math.cos(a) * rr * 1.2, fx.y + Math.sin(a) * rr * 0.6]); }
        ctx.fillStyle = P.ink; ctx.save(); ctx.translate(1.4, 1.6); poly(ctx, spk); ctx.fill(); ctx.restore();
        poly(ctx, spk); ctx.fillStyle = P.fx.burst; ctx.fill(); ctx.strokeStyle = P.ink; ctx.lineWidth = 1.2; ctx.stroke();
        var inner = spk.map(function (p) { return [fx.x + (p[0] - fx.x) * 0.66, fx.y + (p[1] - fx.y) * 0.66]; });
        poly(ctx, inner); ctx.fillStyle = P.fx.crit; ctx.fill();
        // radial speed lines outside the burst
        ctx.strokeStyle = P.ink; ctx.lineWidth = 1;
        for (k = 0; k < 10; k++) { var b = k / 10 * Math.PI * 2 + 0.3, r0 = R * 1.22, r1 = R * (k % 2 ? 1.45 : 1.62); ctx.beginPath(); ctx.moveTo(fx.x + Math.cos(b) * r0 * 1.2, fx.y + Math.sin(b) * r0 * 0.6); ctx.lineTo(fx.x + Math.cos(b) * r1 * 1.2, fx.y + Math.sin(b) * r1 * 0.6); ctx.stroke(); }
      } else if (lead && (kind === 'damage' || kind === 'heal' || kind === 'mp')) {
        // horizontal speed streaks trailing to the left (impact direction)
        var lines = [[0.22, 0.55], [0.5, 0.85], [0.78, 0.45]];
        lines.forEach(function (L, j) {
          var ly = top + capH * L[0] + ((lead && lead.d.dy) || 0), lx = x0 - 2 - j % 2 * 2, len = Math.max(6, capH * L[1] * 1.3);
          ctx.strokeStyle = P.ink; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(lx - len, ly); ctx.lineTo(lx, ly); ctx.stroke();
          ctx.strokeStyle = kind === 'damage' ? '#ffffff' : K[0]; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx - len + 1, ly); ctx.lineTo(lx - 0.5, ly); ctx.stroke();
        });
      }
      // 2. glyph passes: drop, outline, fill + hard shade split. Baseline = top + capH; d.sx / d.sy squash around the baseline
      ctx.font = font; ctx.textBaseline = 'alphabetic'; if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      var glyphAt = function (p) { return { gx: x0 + p.it.x + (p.d.dx || 0), by: top + capH + (p.d.dy || 0) }; };
      var draw = function (pass) {
        plan.forEach(function (p) {
          if (p.d.skip) return; var q = glyphAt(p), cols = p.d.flash ? ['#ffffff', '#ffffff', '#ffffff'] : K, cwh = p.it.w / 2;
          ctx.globalAlpha = aOf(p.d);
          ctx.save(); ctx.translate(q.gx + cwh, q.by); ctx.scale(p.d.sx || 1, p.d.sy || 1); ctx.transform(1, 0, skew, 1, 0, 0); ctx.translate(-cwh, 0);
          if (pass === 'drop') { ctx.fillStyle = P.ink; ctx.strokeStyle = P.ink; ctx.lineWidth = ow * 2; ctx.strokeText(p.it.ch, drop, drop); ctx.fillText(p.it.ch, drop, drop); }
          else if (pass === 'ol') { ctx.strokeStyle = P.ink; ctx.lineWidth = ow * 2; ctx.strokeText(p.it.ch, 0, 0); }
          else {
            ctx.fillStyle = cols[0]; ctx.fillText(p.it.ch, 0, 0);
            ctx.save(); ctx.beginPath(); ctx.moveTo(-4, -capH * 0.36); ctx.lineTo(p.it.w + 6, -capH * 0.5); ctx.lineTo(p.it.w + 6, size); ctx.lineTo(-4, size); ctx.closePath(); ctx.clip();
            ctx.fillStyle = cols[1]; ctx.fillText(p.it.ch, 0, 0); ctx.restore();
            out.push({ x: q.gx, y: q.by - capH, w: p.it.w, h: capH, ch: p.it.ch });
          }
          ctx.restore();
        });
        if (sfx && !(plan.length && plan[plan.length - 1].d.skip)) {   // MP suffix (appears with the last digit) on the digits' baseline, same passes
          var lf = self.fonts.label, lp = plan[plan.length - 1] || { d: {} }, sx = x0 + nw + 2 + (lp.d.dx || 0), sy = top + capH + (lp.d.dy || 0);
          ctx.save(); ctx.font = fontCss(lf, sfx.sc); ctx.textBaseline = 'alphabetic'; if ('letterSpacing' in ctx) ctx.letterSpacing = lf.letterSpacing + 'px'; ctx.globalAlpha = aOf(lp.d);
          if (pass === 'drop') { ctx.fillStyle = P.ink; ctx.strokeStyle = P.ink; ctx.lineWidth = ow * 1.6; ctx.strokeText(sfx.s, sx + drop * 0.7, sy + drop * 0.7); ctx.fillText(sfx.s, sx + drop * 0.7, sy + drop * 0.7); }
          else if (pass === 'ol') { ctx.strokeStyle = P.ink; ctx.lineWidth = ow * 1.6; ctx.strokeText(sfx.s, sx, sy); }
          else { ctx.fillStyle = K[0]; ctx.fillText(sfx.s, sx, sy); }
          ctx.restore();
        }
      };
      ['drop', 'ol', 'fill'].forEach(draw);
      // 3. glint: a short white slash on the first glyph (cel highlight)
      if (plan[0] && !plan[0].d.skip && !word) {
        var q0 = glyphAt(plan[0]); ctx.globalAlpha = aOf(plan[0].d) * 0.95; ctx.strokeStyle = K[2]; ctx.lineWidth = Math.max(0.8, sc * 0.9); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(q0.gx + plan[0].it.w * 0.5, q0.by - capH * 0.84); ctx.lineTo(q0.gx + plan[0].it.w * 0.8, q0.by - capH * 0.9); ctx.stroke();
      }
      ctx.restore(); ctx.globalAlpha = pa;
      if (layer) { host.save(); host.setTransform(1, 0, 0, 1, 0, 0); host.globalAlpha = host.globalAlpha * gA; host.drawImage(layer, 0, 0); host.restore(); }
      // 4. label ribbon above (CRITICAL): its own timeline and its own fade layer (it outlives the digits in E-01)
      if (lab && !labD.skip && rawA(labD) > 0) {
        var lf2 = this.fonts.label, lsc = Math.max(1, sc * 0.75), lfont = fontCss(lf2, lsc); g0.font = lfont;
        var lw = g0.measureText(lab.s).width + lf2.letterSpacing * lab.s.length, lh = lf2.size * lsc + 4, gap = o.labelGap == null ? 3 : o.labelGap;
        var lx = x0 + tw / 2 - lw / 2 + (labD.dx || 0), ly = top - gap - lh - (crit ? capH * 0.25 : 0) + (labD.dy || 0);
        API.fadeLayer(host, rawA(labD), { x: lx - 10, y: ly - 4, w: lw + 24, h: lh + 10 }, function (q) {
          q.save(); q.font = lfont; if ('letterSpacing' in q) q.letterSpacing = lf2.letterSpacing + 'px';
          q.fillStyle = P.ink; poly(q, slantPts(lx - 5, ly + 1.2, lw + 12, lh, 3)); q.fill();
          poly(q, slantPts(lx - 6, ly, lw + 12, lh, 3)); q.fill(); q.fillStyle = labD.flash ? '#ffffff' : P.fx.burst; poly(q, slantPts(lx - 5, ly + 1, lw + 10, lh - 2, 2.4)); q.fill();
          q.textBaseline = 'alphabetic'; q.fillStyle = labD.flash ? P.fx.burst : '#ffffff'; q.fillText(lab.s, lx, ly + lh / 2 + lf2.size * lsc * 0.36); q.restore();
        });
        out.push({ x: lx, y: ly, w: lw, h: lh, ch: lab.s });
      }
      return out;
    },

    // overlay: flat tint + bright inner edge + ink rim on the boundary; pulsing = glossy diagonal sweep across the set
    overlay: function (g, r, kind, t, o) {
      o = o || {}; var Cc = this.palette.overlay[kind] || this.palette.overlay.move, gr = o.grow == null ? 1 : o.grow, S = this.overlayStyle;
      if (!(gr > 0)) return;
      var X = r.x, Y = r.y, W = r.w, H = r.h, tx = o.tile ? o.tile.x : 0, ty = o.tile ? o.tile.y : 0, E = o.edges || {}, M = o.seams || {}, pat = o.pattern || S.pattern;
      var a = (Cc.alpha == null ? S.alpha : Cc.alpha) * gr;
      if (pat === 'checker') a *= (tx + ty) % 2 ? S.checker[0] : S.checker[1];
      g.save();
      var op = g.globalCompositeOperation; g.globalCompositeOperation = 'color'; g.fillStyle = C.rgba(Cc.fill, S.hueAlpha * gr); g.fillRect(X, Y, W, H); g.globalCompositeOperation = op;   // strip the ground hue so tints stay saturated
      g.fillStyle = C.rgba(Cc.fill, a); g.fillRect(X, Y, W, H);
      // hard cel shade: a darker lower-right triangle on each tile (two-tone)
      g.fillStyle = C.rgba(C.mix(Cc.fill, '#1c1433', 0.35), a * 0.55); g.beginPath(); g.moveTo(X + W, Y + H * 0.35); g.lineTo(X + W, Y + H); g.lineTo(X + W * 0.35, Y + H); g.closePath(); g.fill();
      if (pat === 'pulsing') {   // a bright diagonal band that travels across the whole set (phase from tile coords)
        var ph = ((tx + ty) * 0.5 - t * 1.6) % 4; if (ph < 0) ph += 4;
        if (ph < 1) { var u = ph; g.fillStyle = C.rgba('#ffffff', S.sweep * gr * Math.sin(u * Math.PI)); g.beginPath(); g.moveTo(X + W * (u * 2 - 0.6), Y); g.lineTo(X + W * (u * 2 - 0.1), Y); g.lineTo(X + W * (u * 2 - 1.1), Y + H); g.lineTo(X + W * (u * 2 - 1.6), Y + H); g.closePath(); g.clip(); g.fillRect(X, Y, W, H); g.restore(); g.save(); }
      }
      g.fillStyle = C.rgba(Cc.edge, S.seamAlpha * gr); if (M.right) g.fillRect(X + W - 0.5, Y + 1, 0.5, H - 2); if (M.bottom) g.fillRect(X + 1, Y + H - 0.5, W - 2, 0.5);
      var ew = S.edgeWidth, rim = S.rim;
      g.fillStyle = C.rgba('#1c1433', 0.85 * gr);   // ink rim, outside the bright edge
      if (E.top) g.fillRect(X, Y, W, rim); if (E.bottom) g.fillRect(X, Y + H - rim, W, rim); if (E.left) g.fillRect(X, Y, rim, H); if (E.right) g.fillRect(X + W - rim, Y, rim, H);
      g.fillStyle = C.rgba(Cc.edge, S.edgeAlpha * gr);
      if (E.top) g.fillRect(X, Y + rim, W, ew); if (E.bottom) g.fillRect(X, Y + H - rim - ew, W, ew); if (E.left) g.fillRect(X + rim, Y, ew, H); if (E.right) g.fillRect(X + W - rim - ew, Y, ew, H);
      g.restore();
    },

    // bar: slanted gauge, ink outline, two-tone fill (light top, shade bottom), optional status tab
    bar: function (g, r, frac, kind, o) {
      o = o || {}; var P = this.palette, B = P.bars, x = r.x, y = r.y, w = r.w, h = r.h, s = Math.min(this.shape.barSlant, h * 0.6);
      var f = Math.max(0, Math.min(1, frac || 0)), col = kind ? B[kind] || B.charge : null;
      g.save(); g.lineJoin = 'miter';
      g.fillStyle = P.ink; poly(g, slantPts(x + 1, y + 1, w, h, s)); g.fill();
      poly(g, slantPts(x, y, w, h, s)); g.fillStyle = B.track; g.fill();
      if (col && f > 0) {
        var fw = o.px != null ? o.px : (w - 2) * f;
        g.save(); poly(g, slantPts(x + 1, y + 1, w - 2, h - 2, s)); g.clip();
        g.fillStyle = col[0]; g.fillRect(x, y, fw + 1 + s * (1 - (h - 2) / h), h);
        g.fillStyle = col[1]; g.fillRect(x, y + h * 0.55, fw + 1, h);
        g.fillStyle = C.rgba('#ffffff', 0.55); g.fillRect(x + 2, y + 1.2, Math.max(0, fw - 3), Math.max(0.6, h * 0.14));
        if (fw < w - 3) { g.fillStyle = P.ink; g.beginPath(); g.moveTo(x + 1 + fw + s * 0.9, y); g.lineTo(x + 1.8 + fw + s * 0.9, y); g.lineTo(x + 1.8 + fw - s * 0.2, y + h); g.lineTo(x + 1 + fw - s * 0.2, y + h); g.fill(); }
        g.restore();
      }
      if (o.tag && B[o.tag]) { var tc = B[o.tag]; g.fillStyle = tc[0]; poly(g, slantPts(x + 1, y + 1, 6, h - 2, s)); g.fill(); g.fillStyle = tc[1]; g.fillRect(x + 1, y + h * 0.55, 5, h * 0.45 - 1); }
      g.strokeStyle = P.ink; g.lineWidth = 1; poly(g, slantPts(x + 0.5, y + 0.5, w - 1, h - 1, s)); g.stroke();
      g.restore();
    },

    // cursor: 'bracket' = chunky outlined corners that pop in/out; 'hand' = chunky outlined arrow, tip at rect's right-middle
    cursor: function (g, r, kind, t, o) {
      o = o || {}; var P = this.palette, col = o.invalid ? P.overlay.attack.fill : P.text.accent, hi = o.invalid ? '#ffd0d8' : '#fff6c0';
      g.save(); if (o.alpha != null) g.globalAlpha *= o.alpha; g.lineJoin = 'miter'; g.miterLimit = 3;
      if (kind === 'hand') {
        var tx = r.x + r.w - 1, cy = r.y + r.h / 2, L = 9.5, H = 4.2;   // tip 2 px short of the box edge: clears a target's weapon
        var pts = [[tx, cy], [tx - L * 0.55, cy - H - 1.5], [tx - L * 0.55, cy - H * 0.45], [tx - L, cy - H * 0.45], [tx - L, cy + H * 0.45], [tx - L * 0.55, cy + H * 0.45], [tx - L * 0.55, cy + H + 1.5]];
        g.fillStyle = P.ink; g.save(); g.translate(1, 1.2); poly(g, pts); g.fill(); g.restore();
        poly(g, pts); g.fillStyle = col; g.fill();
        g.save(); poly(g, pts); g.clip(); g.fillStyle = P.fx.hot; g.fillRect(tx - L - 1, cy + 0.6, L + 2, H + 3); g.restore();
        g.strokeStyle = P.ink; g.lineWidth = 1; poly(g, pts); g.stroke();
        g.strokeStyle = hi; g.lineWidth = 0.8; g.beginPath(); g.moveTo(tx - L + 1.2, cy - H * 0.45 + 0.9); g.lineTo(tx - L * 0.6, cy - H * 0.45 + 0.9); g.stroke();
      } else {
        // pop cycle: snaps out 1.5 px with overshoot, then settles (0.6 s period)
        var ph = (t % 0.6) / 0.6, p = ph < 0.25 ? API.ease.outBack(ph / 0.25) : ph < 0.5 ? 1 - API.ease.outQuad((ph - 0.25) / 0.25) : 0, d = -1.5 * p;
        var x0 = r.x + d, y0 = r.y + d, x1 = r.x + r.w - d, y1 = r.y + r.h - d, Lc = Math.max(5, r.w * 0.38), th = 2.6;
        [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(function (c) {
          var pts = [[c[0], c[1]], [c[0] + c[2] * Lc, c[1]], [c[0] + c[2] * (Lc - 1.2), c[1] + c[3] * th], [c[0] + c[2] * th, c[1] + c[3] * th], [c[0] + c[2] * th, c[1] + c[3] * (Lc - 1.2)], [c[0], c[1] + c[3] * Lc]];
          g.fillStyle = P.ink; g.save(); g.translate(0.9, 1.1); poly(g, pts); g.fill(); g.restore();
          poly(g, pts); g.fillStyle = col; g.fill(); g.strokeStyle = P.ink; g.lineWidth = 1; g.stroke();
        });
      }
      g.restore();
    },

    // path(ctx, points [{x, y}] in native px (tile centres), t seconds, {alpha, invalid}): chunky outlined move arrow (reserved SPEC hook)
    path: function (g, pts, t, o) {
      o = o || {}; if (!pts || pts.length < 2) return; var Pp = this.palette.overlay.path, ink = this.palette.ink;
      var n = pts.length, end = pts[n - 1], prev = pts[n - 2], dx = Math.sign(end.x - prev.x), dy = Math.sign(end.y - prev.y), hl = 6.5;
      var tip = { x: end.x + dx * 2, y: end.y + dy * 2 }, neck = { x: end.x - dx * (hl - 2), y: end.y - dy * (hl - 2) };
      var line = pts.slice(0, n - 1).concat([neck]);
      var stroke = function (w, c, off) { g.beginPath(); g.moveTo(line[0].x + (off || 0), line[0].y + (off || 0)); for (var i = 1; i < line.length; i++) g.lineTo(line[i].x + (off || 0), line[i].y + (off || 0)); g.lineWidth = w; g.strokeStyle = c; g.stroke(); };
      var nx = -dy, ny = dx, head = [[tip.x, tip.y], [neck.x + nx * 5.5, neck.y + ny * 5.5], [neck.x - nx * 5.5, neck.y - ny * 5.5]];
      g.save(); if (o.alpha != null) g.globalAlpha *= o.alpha; g.lineJoin = 'miter'; g.miterLimit = 2; g.lineCap = 'butt';
      // hard drop
      g.save(); g.translate(1.2, 1.5); stroke(7, ink); g.fillStyle = ink; poly(g, head); g.fill(); g.restore();
      // outline, body, shade
      stroke(7, ink);
      g.fillStyle = ink; g.lineWidth = 2; g.strokeStyle = ink; poly(g, head); g.fill(); g.stroke();
      stroke(4.4, o.invalid ? '#ff5a6e' : Pp.core);
      stroke(1.6, o.invalid ? '#c01a3c' : Pp.dark, 1.1);
      poly(g, head); g.fillStyle = o.invalid ? '#ff5a6e' : Pp.core; g.fill();
      g.save(); poly(g, head); g.clip(); g.fillStyle = o.invalid ? '#c01a3c' : Pp.dark; g.beginPath(); g.moveTo(tip.x, tip.y); g.lineTo(neck.x - nx * 6, neck.y - ny * 6); g.lineTo(neck.x + dx * 0.5 - nx * 6 + dx, neck.y + dy * 0.5 - ny * 6 + dy); g.closePath(); g.fill(); g.restore();
      // marching chevrons (white dashes travelling toward the tip)
      g.save(); g.setLineDash([2.2, 5]); g.lineDashOffset = -t * 18; stroke(1.4, Pp.spark, -0.5); g.restore();
      g.restore();
    }
  };

  /* ---------------- scene hooks (SPEC v0.2 §2.4): tile, unitToken, atmosphere ---------------- */
  function hsh(a, b, c) { var n = (a * 374761393 + (b || 0) * 668265263 + (c || 0) * 2147483647) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
  var INK = palette.ink;
  // terrain: [base, hard shade, light] per kind (flat saturated, one shade tone each)
  palette.terrain = {
    grass: '#6fd24a', forest: '#2fb45a', water: '#2b9bff', hill: '#a6d84a', mountain: '#8f86b8', road: '#f2cf86',
    bridge: '#d08a46', fort: '#c9c2e0', sand: '#ffe08a', wall: '#7d74a8', floor: '#cfc4f0'
  };
  var TR = {
    grass: ['#6fd24a', '#4fb03a', '#a6f070'], forest: ['#2fb45a', '#18804a', '#7ef08a'], water: ['#2b9bff', '#1a6fe0', '#c8f0ff'],
    hill: ['#a6d84a', '#74a82e', '#e0ff8a'], mountain: ['#8f86b8', '#5e548c', '#ffffff'], road: ['#f2cf86', '#d8a95a', '#fff0c8'],
    bridge: ['#d08a46', '#9a5a26', '#f8c080'], fort: ['#c9c2e0', '#8a80b0', '#ffffff'], sand: ['#ffe08a', '#f0b85a', '#fff6d0'],
    wall: ['#7d74a8', '#4e467c', '#b8b0e0'], floor: ['#cfc4f0', '#a99ad8', '#f0eaff']
  };
  function line(g, w) { g.strokeStyle = INK; g.lineWidth = w || 0.9; g.lineJoin = 'round'; g.lineCap = 'round'; }
  function blade(g, x, y, c) { g.fillStyle = c; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.9, y - 2.6); g.lineTo(x + 1.6, y); g.lineTo(x + 2.4, y - 1.8); g.lineTo(x + 3, y); g.closePath(); g.fill(); }
  function treeAt(g, cx, by, rr, k) {
    var T = TR.forest;
    g.fillStyle = C.rgba(INK, 0.35); g.beginPath(); g.ellipse(cx + 1, by + 0.4, rr * 0.95, rr * 0.32, 0, 0, 7); g.fill();
    g.fillStyle = '#8a4a26'; g.fillRect(cx - 1, by - rr * 0.7, 2, rr * 0.7); line(g, 0.7); g.strokeRect(cx - 1, by - rr * 0.7, 2, rr * 0.7);
    var cy = by - rr * 1.25; g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.fillStyle = T[0]; g.fill();
    g.save(); g.clip(); g.fillStyle = T[1]; g.beginPath(); g.arc(cx + rr * 0.55, cy + rr * 0.55, rr, 0, 7); g.fill();
    g.fillStyle = T[2]; g.beginPath(); g.ellipse(cx - rr * 0.38, cy - rr * 0.42, rr * 0.32, rr * 0.2, -0.6, 0, 7); g.fill(); g.restore();
    line(g, 0.9); g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.stroke();
  }
  // tile(ctx, rect, kind, t): flat base, a hard second tone, ink outlines on the features (not on the cell borders)
  skin.tile = function (g, r, kind, t) {
    var X = r.x, Y = r.y, w = r.w, h = r.h, tx = Math.round(X / 16), ty = Math.round(Y / 16), T = TR[kind] || TR.grass, h1 = hsh(tx, ty, 1), h2 = hsh(tx, ty, 2);
    t = t || 0; g.save();
    var flatBase = kind === 'forest' || kind === 'hill' || kind === 'mountain' || kind === 'fort' ? TR.grass : T;
    g.fillStyle = (tx + ty) % 2 && flatBase === TR.grass ? '#74d64e' : flatBase[0]; g.fillRect(X, Y, w, h);
    if (flatBase === TR.grass && kind !== 'mountain') {
      if (h1 < 0.38) blade(g, X + 2 + h2 * 9, Y + 6 + h1 * 7, TR.grass[1]);
      if (h2 < 0.12) { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(X + 4 + h1 * 8, Y + 4 + h2 * 20, 0.9, 0, 7); g.fill(); g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(X + 4 + h1 * 8, Y + 4 + h2 * 20, 0.4, 0, 7); g.fill(); }
    }
    if (kind === 'water') {
      if (h1 < 0.5) { g.fillStyle = T[1]; poly(g, [[X, Y + h * (0.55 + h2 * 0.3)], [X + w, Y + h * (0.35 + h2 * 0.3)], [X + w, Y + h * (0.5 + h2 * 0.3)], [X, Y + h * (0.7 + h2 * 0.3)]]); g.fill(); }
      var ph = (t * 0.9 + tx * 0.37 + ty * 0.61) % 1;
      g.strokeStyle = T[2]; g.lineWidth = 1.1; g.lineCap = 'round';
      [[0.15, 0.3, 6], [0.55, 0.72, 5]].forEach(function (q, i) {
        var ox = ((q[0] + ph * (i ? -1 : 1) * 0.35) % 1 + 1) % 1 * (w - q[2]);
        g.beginPath(); g.moveTo(X + ox, Y + h * q[1]); g.quadraticCurveTo(X + ox + q[2] / 2, Y + h * q[1] - 1.6, X + ox + q[2], Y + h * q[1]); g.stroke();
      });
    } else if (kind === 'forest') {
      treeAt(g, X + 5.5, Y + h - 3.5, 3.8, 0); treeAt(g, X + 11.5, Y + h - 1.5, 4.2, 1);
    } else if (kind === 'hill') {
      g.beginPath(); g.moveTo(X + 1, Y + h - 2); g.quadraticCurveTo(X + w * 0.5, Y + 1, X + w - 1, Y + h - 2); g.closePath(); g.fillStyle = T[0]; g.fill();
      g.save(); g.clip(); g.fillStyle = T[1]; g.beginPath(); g.moveTo(X + w * 0.55, Y); g.lineTo(X + w, Y); g.lineTo(X + w, Y + h); g.lineTo(X + w * 0.4, Y + h); g.closePath(); g.fill(); g.restore();
      line(g); g.beginPath(); g.moveTo(X + 1, Y + h - 2); g.quadraticCurveTo(X + w * 0.5, Y + 1, X + w - 1, Y + h - 2); g.stroke();
    } else if (kind === 'mountain') {
      var pk = [X + w * 0.5, Y + 1.2], L0 = [X + 0.8, Y + h - 1.6], R0 = [X + w - 0.8, Y + h - 1.6];
      g.fillStyle = C.rgba(INK, 0.35); g.beginPath(); g.ellipse(X + w / 2 + 1, Y + h - 1.4, w * 0.48, 1.6, 0, 0, 7); g.fill();
      poly(g, [pk, R0, L0]); g.fillStyle = T[0]; g.fill();
      g.save(); poly(g, [pk, R0, L0]); g.clip(); poly(g, [pk, R0, [X + w * 0.56, Y + h]]); g.fillStyle = T[1]; g.fill();
      poly(g, [pk, [X + w * 0.68, Y + h * 0.4], [X + w * 0.58, Y + h * 0.34], [X + w * 0.5, Y + h * 0.44], [X + w * 0.4, Y + h * 0.36], [X + w * 0.32, Y + h * 0.42]]); g.fillStyle = '#ffffff'; g.fill(); g.restore();
      line(g); poly(g, [pk, R0, L0]); g.stroke();
    } else if (kind === 'road' || kind === 'sand') {
      g.fillStyle = T[1]; if (kind === 'road') { g.fillRect(X, Y, w, 1.2); g.fillRect(X, Y + h - 1.2, w, 1.2); }
      for (var i = 0; i < 3; i++) { var px = X + 2 + hsh(tx, ty, 20 + i) * (w - 5), py = Y + 3 + hsh(tx, ty, 30 + i) * (h - 6); g.beginPath(); g.ellipse(px, py, 1.3, 0.8, 0, 0, 7); g.fillStyle = T[1]; g.fill(); }
      if (kind === 'sand') { g.strokeStyle = T[1]; g.lineWidth = 0.8; g.beginPath(); g.moveTo(X + 2, Y + h * 0.7); g.quadraticCurveTo(X + w / 2, Y + h * 0.55, X + w - 2, Y + h * 0.7); g.stroke(); }
    } else if (kind === 'bridge') {
      g.fillStyle = TR.water[1]; g.fillRect(X, Y, w, h);
      for (var pl = 0; pl < 4; pl++) { var py2 = Y + pl * 4; g.fillStyle = T[0]; g.fillRect(X, py2 + 0.4, w, 3.2); g.fillStyle = T[1]; g.fillRect(X, py2 + 2.4, w, 1.2); g.fillStyle = INK; g.fillRect(X, py2 + 3.6, w, 0.4); }
      g.fillStyle = INK; g.fillRect(X, Y, 1, h); g.fillRect(X + w - 1, Y, 1, h);
    } else if (kind === 'fort') {
      var fx = X + 2, fy = Y + 5, fw = w - 4, fh = h - 7;
      g.fillStyle = C.rgba(INK, 0.35); g.fillRect(fx + 1.2, fy + fh - 0.5, fw, 1.6);
      g.fillStyle = T[0]; g.fillRect(fx, fy, fw, fh); g.fillStyle = T[1]; g.fillRect(fx + fw * 0.6, fy, fw * 0.4, fh);
      for (var c2 = 0; c2 < 3; c2++) { g.fillStyle = T[0]; g.fillRect(fx + c2 * fw / 2.5, fy - 2, 2.6, 2); line(g, 0.7); g.strokeRect(fx + c2 * fw / 2.5, fy - 2, 2.6, 2); }
      g.fillStyle = INK; g.beginPath(); g.arc(fx + fw / 2, fy + fh, 2.2, Math.PI, 0); g.fill();
      line(g); g.strokeRect(fx, fy, fw, fh);
      g.fillStyle = INK; g.fillRect(fx + fw / 2 - 0.4, Y + 0.5, 0.8, 5); g.fillStyle = palette.fx.burst; poly(g, [[fx + fw / 2 + 0.4, Y + 0.6], [fx + fw / 2 + 4.2, Y + 1.8 + Math.sin(t * 8) * 0.5], [fx + fw / 2 + 0.4, Y + 3]]); g.fill();
    } else if (kind === 'wall') {
      g.fillStyle = T[2]; g.fillRect(X, Y, w, 2);
      for (var row = 0; row < 3; row++) { var by2 = Y + 2 + row * 4.6; g.fillStyle = INK; g.fillRect(X, by2 + 4, w, 0.6); for (var b2 = 0; b2 < 3; b2++) g.fillRect(X + ((b2 * 6 + (row % 2) * 3) % w), by2, 0.6, 4); g.fillStyle = T[1]; g.fillRect(X, by2 + 2.8, w, 1.2); }
    } else if (kind === 'floor') {
      g.fillStyle = (tx + ty) % 2 ? T[0] : C.mix(T[0], T[1], 0.35); g.fillRect(X, Y, w, h);
      g.fillStyle = T[1]; poly(g, [[X + w, Y + h * 0.4], [X + w, Y + h], [X + w * 0.4, Y + h]]); g.fill();
      g.fillStyle = C.rgba(INK, 0.55); g.fillRect(X, Y, w, 0.5); g.fillRect(X, Y, 0.5, h);
    }
    g.restore();
  };

  // unitToken(ctx, rect, unit, t): chunky chibi, big head and eyes, two-tone hard shading, ink outline, team colours
  var HAIR = { a: ['#ff9a2a', '#d0620a'], b: ['#5a3a9a', '#3a2070'], n: ['#e0e0f0', '#a8a8c8'] };
  skin.unitToken = function (g, r, u, t) {
    u = u || {}; t = t || 0; var P = palette, team = u.team || 'a', kind = u.kind || 'fighter';
    var c0 = P.team[team] || P.team.a, c1 = P.team[team + 'Dark'] || C.mix(c0, INK, 0.35), hr = HAIR[team] || HAIR.a;
    var sc = Math.min(r.w / 16, r.h / 24), cx = r.x + r.w / 2, fy = r.y + r.h - 1.2 * sc;
    var bob = 0; if (u.selected) { var ph = (t % 0.8) / 0.8; bob = ph < 0.3 ? -2.2 * Math.sin(ph / 0.3 * Math.PI) : 0; }
    g.save(); if (u.dead) g.globalAlpha *= 0.4;
    if (!u.noShadow) { g.fillStyle = C.rgba(INK, 0.4); g.beginPath(); g.ellipse(cx, fy, 5.6 * sc, 1.7 * sc, 0, 0, 7); g.fill(); }
    g.translate(cx, fy + bob); g.scale(sc * (u.facing === -1 ? -1 : 1), sc);
    if (u.selected && bob < -0.5) g.scale(0.94, 1.06); else if (u.selected && bob === 0 && ((t % 0.8) / 0.8) < 0.36) g.scale(1.08, 0.92);   // stretch up, squash on landing
    g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = 1; g.strokeStyle = INK;
    var fill = function (pts, col, shade, cut) { poly(g, pts); g.fillStyle = col; g.fill(); if (shade) { g.save(); poly(g, pts); g.clip(); g.fillStyle = shade; g.fillRect(cut, -30, 20, 40); g.restore(); } poly(g, pts); g.stroke(); };
    if (kind === 'monster') {
      // round blob with horns and a fang grin
      fill([[-4, -9.5], [-6, -11.5], [-3.6, -11], [-2, -12.6]], '#fff6e0', null); fill([[4, -9.5], [6, -11.5], [3.6, -11], [2, -12.6]], '#fff6e0', null);
      g.beginPath(); g.ellipse(0, -5.5, 6.4, 5.8, 0, 0, 7); g.fillStyle = c0; g.fill(); g.save(); g.clip(); g.fillStyle = c1; g.beginPath(); g.ellipse(3, -2.5, 6.4, 5.8, 0, 0, 7); g.fill(); g.restore(); g.beginPath(); g.ellipse(0, -5.5, 6.4, 5.8, 0, 0, 7); g.stroke();
      eyes(-6.5); g.restore(); return;
    }
    // weapon behind (staff / bow) or in front (sword / axe)
    var weaponBack = kind === 'mage' || kind === 'archer';
    function weapon() {
      if (kind === 'knight') { fill([[3.8, -7], [5, -16.5], [6.2, -7]], '#e8eefc', '#a8b4d8', 5.1); fill([[2.6, -7.2], [7.4, -7.2], [7.4, -6], [2.6, -6]], '#ffd23a', null); fill([[-7.4, -9], [-3.4, -9], [-3.4, -4.4], [-5.4, -2.8], [-7.4, -4.4]], '#ffd23a', '#e09a0a', -5.4); }
      else if (kind === 'fighter') { g.beginPath(); g.moveTo(5, -2); g.lineTo(5, -14); g.lineWidth = 2.6; g.stroke(); g.strokeStyle = '#a0602a'; g.lineWidth = 1.2; g.stroke(); g.lineWidth = 1; g.strokeStyle = INK; fill([[5, -14], [9.4, -15], [9.4, -10], [5, -11]], '#e8eefc', '#a8b4d8', 7.4); }
      else if (kind === 'mage') { g.beginPath(); g.moveTo(5.5, 0); g.lineTo(5.5, -15); g.lineWidth = 2.4; g.stroke(); g.strokeStyle = '#a0602a'; g.lineWidth = 1.1; g.stroke(); g.lineWidth = 1; g.strokeStyle = INK;
        var gl = 0.5 + 0.5 * Math.sin(t * 6); g.beginPath(); g.arc(5.5, -16, 2.2, 0, 7); g.fillStyle = team === 'b' ? '#ff5ad0' : '#4ae8ff'; g.fill(); g.stroke(); g.fillStyle = C.rgba('#ffffff', 0.6 + gl * 0.4); g.beginPath(); g.arc(4.8, -16.7, 0.8, 0, 7); g.fill(); }
      else if (kind === 'archer') { g.beginPath(); g.arc(3, -8, 5, -1.2, 1.2); g.lineWidth = 2.4; g.stroke(); g.strokeStyle = '#a0602a'; g.lineWidth = 1.1; g.stroke(); g.strokeStyle = INK; g.lineWidth = 0.6; g.beginPath(); g.moveTo(4.8, -12.6); g.lineTo(4.8, -3.4); g.stroke(); g.lineWidth = 1; }
    }
    if (weaponBack) weapon();
    // legs + body (trapezoid tunic / robe), hard shade on the far side
    if (kind !== 'mage') { fill([[-3, -3], [-1, -3], [-1, 0], [-3.4, 0]], '#3a2a5a', null); fill([[1, -3], [3, -3], [3.4, 0], [1, 0]], '#3a2a5a', null); }
    var robe = kind === 'mage' ? [[-3.6, -9], [3.6, -9], [5.4, 0], [-5.4, 0]] : [[-3.8, -9.4], [3.8, -9.4], [4.6, -3], [-4.6, -3]];
    fill(robe, c0, c1, 1);
    g.fillStyle = '#ffd23a'; g.fillRect(-3.8, kind === 'mage' ? -5 : -5.2, 7.6, 1); g.strokeRect(-3.8, kind === 'mage' ? -5 : -5.2, 7.6, 1);
    // head: big round face, hair cap with spikes, anime eyes
    g.beginPath(); g.arc(0, -13, 5, 0, 7); g.fillStyle = '#ffdcc0'; g.fill(); g.save(); g.clip(); g.fillStyle = '#f4b898'; g.beginPath(); g.arc(3.2, -10.2, 5, 0, 7); g.fill(); g.restore(); g.beginPath(); g.arc(0, -13, 5, 0, 7); g.stroke();
    if (kind === 'knight') { fill([[-5.4, -13.4], [-4.6, -17.6], [0, -19.4], [4.6, -17.6], [5.4, -13.4], [3.2, -14.6], [-3.2, -14.6]], '#d8e0f4', '#9aa6cc', 1.2); fill([[0, -19.4], [1.2, -22], [-1.6, -21.2]], palette.fx.burst, null); }
    else if (kind === 'mage') { fill([[-6.4, -14.2], [6.4, -14.2], [1.2, -16.4], [-1.5, -23.5], [-2.2, -16.4]], c0, c1, 0.4); fill([[-6.4, -14.2], [6.4, -14.2], [5.2, -12.8], [-5.2, -12.8]], c1, null); }
    else fill([[-5.4, -12.6], [-5, -16.4], [-2.6, -18.4], [0.6, -19.6], [1.2, -18], [4, -17.8], [5.6, -14.4], [5.4, -12.6], [2.8, -15], [0.6, -13.4], [-1.6, -15]], hr[0], hr[1], 1.4);
    eyes(-12.6);
    if (!weaponBack) weapon();
    g.restore();
    function eyes(ey) {
      [[-0.6, 1.5], [2.9, 1.3]].forEach(function (e) { g.fillStyle = INK; g.beginPath(); g.ellipse(e[0], ey, 0.95 * e[1] / 1.5, 1.55, 0, 0, 7); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(e[0] + 0.25, ey - 0.6, 0.42, 0, 7); g.fill(); });
      if (kind === 'monster') { g.fillStyle = '#ffffff'; poly(g, [[-1.6, ey + 3], [-0.6, ey + 4.6], [0.2, ey + 3]]); g.fill(); poly(g, [[1.4, ey + 3], [2.2, ey + 4.6], [3.2, ey + 3]]); g.fill(); }
    }
  };

  // atmosphere: 'final' = faint ink speed lines radiating in the outer 9 px band (frame energy; never over the play area centre)
  skin.atmosphere = function (g, view, t, o) {
    o = o || {}; if (o.phase !== 'final') return;
    var x = view.x, y = view.y, w = view.w, h = view.h, cx = x + w / 2, cy = y + h / 2, R = Math.hypot(w, h) / 2;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.rect(x + 9, y + 9, w - 18, h - 18); g.clip('evenodd');
    g.strokeStyle = C.rgba(INK, 0.16); g.lineCap = 'butt';
    for (var i = 0; i < 64; i++) { var a = i / 64 * Math.PI * 2 + hsh(i, 3) * 0.05, ww = 0.6 + hsh(i, 9) * 1.6, r0 = R * (0.86 + hsh(i, 5) * 0.08);
      g.lineWidth = ww; g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * (h / w)); g.lineTo(cx + Math.cos(a) * R * 1.2, cy + Math.sin(a) * R * 1.2 * (h / w)); g.stroke(); }
    g.restore();
  };

  var S = API.register(skin);
  S.layout = { panelSlant: skin.shape.slant, handW: 11 };   // informational: the hand arrow is drawn wider than the 7x5 box modules reserve
})(typeof window !== 'undefined' ? window : this);
