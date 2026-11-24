/* GameDNA skin API v0.5 · plain script, no dependencies, no import/export, one global: GameDNA_Skin
 *
 * A skin is one object that owns how an addon module LOOKS: palette tokens, fonts, window frames, text,
 * numerals, grid overlays, bars, cursors, and the rules for particles, outlines, shadows and motion.
 * Modules keep their logic and layout; every colour, glyph and frame goes through the skin. See skins/SPEC.md.
 *
 *   <script src="skin-api.js"><\/script> <script src="pixel16.js"><\/script> <script src="module.js"><\/script>
 *   var skin = GameDNA_Skin.resolve(options.skin);   // id, object or undefined (-> 'pixel16')
 *   skin.frame(ctx, {x, y, w, h}, {role: 'window', team: 'a'});
 *   skin.text(ctx, 'HP', x, y, {font: 'ui'});   skin.number(ctx, '128', x, y, {kind: 'damage'});
 *   skin.overlay(ctx, tileRect, 'move', tSeconds, {grow: 1, edges: {top: true}});
 *
 * Everything is in native canvas pixels. Time `t` is in SECONDS (float); `dt` in ms where noted.
 *
 * v0.5: bitmap roles. GameDNA_Skin.bitmaps.set('tile', 'grass', img, meta) registers a generated bitmap; skin.tile(),
 * skin.prop() and skin.frame() then draw it instead of their procedural art, and skin.bitmap(ctx, rect, role, kind, opts)
 * draws any role (portrait, prop, tile, icon, frame9, bg-layer) and returns false when nothing is registered, so the
 * caller keeps its own drawing. With nothing registered every call draws exactly what v0.4 drew.
 */
(function (root) {
  'use strict';
  var VERSION = '0.5.0';
  var REG = {}, ORDER = [];

  /* ---------------- colour helpers ---------------- */
  function rgb(c) {
    if (Array.isArray(c)) return c.slice(0, 3);
    c = String(c).trim();
    var m;
    if (c[0] === '#') {
      if (c.length === 4) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)];
      return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    }
    if ((m = c.match(/^rgba?\(([^)]+)\)$/))) return m[1].split(',').slice(0, 3).map(function (v) { return +v; });
    if ((m = c.match(/^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/))) return [+m[1], +m[2], +m[3]];   // 'r,g,b'
    return [255, 0, 255];
  }
  function hex(a) { return '#' + a.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function rgba(c, a) { var v = rgb(c); return 'rgba(' + v[0] + ',' + v[1] + ',' + v[2] + ',' + (a == null ? 1 : a) + ')'; }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return hex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  // 4-step ramp [edge light, light, base, dark] from one colour (for generic bars / numerals)
  function ramp(c) { return [mix(c, '#ffffff', 0.7), mix(c, '#ffffff', 0.3), hex(rgb(c)), mix(c, '#000000', 0.45)]; }

  /* ---------------- easing (motion.ease names) ---------------- */
  var EASE = {
    linear: function (s) { return s; },
    inQuad: function (s) { return s * s; },
    outQuad: function (s) { return 1 - (1 - s) * (1 - s); },
    inOutQuad: function (s) { return s < 0.5 ? 2 * s * s : 1 - 2 * (1 - s) * (1 - s); },
    outCubic: function (s) { return 1 - Math.pow(1 - s, 3); },
    outBack: function (s) { var c = 1.70158; return 1 + (c + 1) * Math.pow(s - 1, 3) + c * Math.pow(s - 1, 2); },
    pop: function (s) { return 1 - Math.exp(-6 * s) * Math.cos(9 * s); },            // ~25 % overshoot, settles by 0.5
    snap: function (s) { return s < 1 ? 0 : 1; }
  };

  /* ---------------- small utils ---------------- */
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v) && !(typeof HTMLCanvasElement !== 'undefined' && v instanceof HTMLCanvasElement); }
  function merge(a, b) {   // deep merge of plain objects; arrays and functions replace
    var out = {}, k;
    for (k in a) out[k] = isObj(a[k]) ? merge(a[k], {}) : a[k];
    for (k in b) out[k] = isObj(b[k]) && isObj(out[k]) ? merge(out[k], b[k]) : isObj(b[k]) ? merge(b[k], {}) : b[k];
    return out;
  }
  function token(skin, path) {   // token(skin, 'overlay.move.fill') -> value; non-path strings pass through
    if (typeof path !== 'string' || !/^[a-z]+(\.[A-Za-z0-9]+)+$/.test(path)) return path;
    var v = skin.palette, parts = path.split('.');
    for (var i = 0; i < parts.length && v != null; i++) v = v[parts[i]];
    return v == null ? path : v;
  }
  var SCR = null;
  function scratch(w, h) {
    if (typeof document === 'undefined') return null;
    if (!SCR) SCR = document.createElement('canvas');
    if (SCR.width < w) SCR.width = w; if (SCR.height < h) SCR.height = h;
    return SCR.getContext('2d', { willReadFrequently: true });
  }
  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }

  /* ---------------- transform scale ----------------
     shadowBlur and shadowOffsetX/Y ignore the canvas transform: they are always device pixels. A skin that draws in
     native units on a scaled backing store (ctx.setTransform(s, 0, 0, s, 0, 0)) multiplies them by scaleOf(ctx);
     setShadow() does that for you. */
  function scaleOf(ctx) {
    if (!ctx || !ctx.getTransform) return 1;
    var m = ctx.getTransform(), k = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    return k > 0 && isFinite(k) ? k : 1;
  }
  function setShadow(ctx, col, blur, dx, dy) { var k = scaleOf(ctx); ctx.shadowColor = col; ctx.shadowBlur = (blur || 0) * k; ctx.shadowOffsetX = (dx || 0) * k; ctx.shadowOffsetY = (dy || 0) * k; }
  function clearShadow(ctx) { ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }

  /* ---------------- fade layer ----------------
     fadeLayer(ctx, alpha, rect, draw): draw(layerCtx) paints at full opacity into an offscreen layer with the same
     transform as ctx; the layer is composited onto ctx once at globalAlpha * alpha. Use it to fade anything drawn in
     overlapping passes (stroke outline + fill, drop + body, glow + core) in smooth skins: drawing the passes straight
     onto ctx at alpha < 1 lets the outline show through the fill. rect (native units, optional) bounds the layer.
     alpha >= 1 draws directly; alpha <= 0 draws nothing. Pixel skins with stepped fades usually do not need it. */
  var POOL = [];
  function fadeLayer(ctx, alpha, rect, draw) {
    if (!(alpha > 0)) return;
    if (alpha >= 1 || typeof document === 'undefined' || !ctx.getTransform) { draw(ctx); return; }
    var m = ctx.getTransform(), cw = ctx.canvas.width, ch = ctx.canvas.height, bx = 0, by = 0, bw = cw, bh = ch;
    if (rect) {
      var xs = [], ys = [];
      [[rect.x, rect.y], [rect.x + rect.w, rect.y], [rect.x, rect.y + rect.h], [rect.x + rect.w, rect.y + rect.h]].forEach(function (p) { xs.push(m.a * p[0] + m.c * p[1] + m.e); ys.push(m.b * p[0] + m.d * p[1] + m.f); });
      bx = Math.max(0, Math.floor(Math.min.apply(null, xs)) - 2); by = Math.max(0, Math.floor(Math.min.apply(null, ys)) - 2);
      bw = Math.min(cw, Math.ceil(Math.max.apply(null, xs)) + 2) - bx; bh = Math.min(ch, Math.ceil(Math.max.apply(null, ys)) + 2) - by;
      if (bw <= 0 || bh <= 0) return;
    }
    var c = POOL.pop() || document.createElement('canvas');
    if (c.width < bw || c.height < bh) { c.width = Math.max(c.width, bw); c.height = Math.max(c.height, bh); }
    var g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    g.setTransform(m.a, m.b, m.c, m.d, m.e - bx, m.f - by); g.imageSmoothingEnabled = ctx.imageSmoothingEnabled; g.globalAlpha = 1;
    try { draw(g); } finally {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = ctx.globalAlpha * alpha;
      ctx.drawImage(c, 0, 0, bw, bh, bx, by, bw, bh); ctx.restore(); POOL.push(c);
    }
  }

  /* ---------------- canonical glyph items for number(..., {glyphOffset}) ----------------
     Index-based and layout-independent, the same in every skin: the characters of str (role 'main'), then of
     opts.suffix ('suffix'), then of opts.label ('label'). item = {i, ch, role, k (index within its role), n (count in
     its role), u (0..1, centre of the glyph within its role by character count)}. A skin may add layout fields
     (x, y, w, h, font, s, ...); modules must not rely on them. */
  function glyphItems(str, o) {
    o = o || {}; var out = [];
    [['main', String(str)], ['suffix', o.suffix ? String(o.suffix) : ''], ['label', o.label ? String(o.label) : '']].forEach(function (p) {
      for (var k = 0; k < p[1].length; k++) out.push({ i: out.length, ch: p[1][k], role: p[0], k: k, n: p[1].length, u: (k + 0.5) / p[1].length });
    });
    return out;
  }

  /* ---------------- fonts ----------------
     bitmap: {type: 'bitmap', height, glyphs: {ch: 'row|row|...'} ('#'/'1' = ink), sep: '|', spacing: 1, space: 4,
              advance: fixed px per char (optional), uppercase: true, split: rows drawn in color (rest in color2)}
     canvas: {type: 'canvas', family, size, weight, style, letterSpacing, uppercase, threshold (pixel skins: alpha cut-off 0..255)} */
  function fontOf(skin, name) { var f = skin.fonts[name || 'ui'] || skin.fonts.ui; return f; }
  function css(f, scale) { return (f.style || 'normal') + ' ' + (f.weight || 400) + ' ' + (f.size * (scale || 1)) + 'px ' + f.family; }
  function bitmapRows(f, ch) { var g = f.glyphs[ch] || f.glyphs['?']; if (!g) return null; if (!g._r) { var rows = typeof g === 'string' ? g.split(f.sep || '|') : g; f.glyphs[ch] = { _r: rows }; return rows; } return g._r; }
  function bitmapW(f, s) {
    s = String(s); if (f.uppercase) s = s.toUpperCase();
    if (f.advance) return s.length * f.advance - (f.spacing == null ? 1 : f.spacing);
    var w = 0, sp = f.spacing == null ? 1 : f.spacing;
    for (var i = 0; i < s.length; i++) { if (s[i] === ' ') { w += (f.space || 4); continue; } var r = bitmapRows(f, s[i]); w += (r ? r[0].length : 4) + sp; }
    return Math.max(0, w - sp);
  }
  function drawBitmap(ctx, f, s, x, y, col, col2, sh, scale) {
    s = String(s); if (f.uppercase) s = s.toUpperCase(); scale = scale || 1;
    var split = f.split == null ? Math.ceil(f.height * 4 / 7) : f.split, sp = f.spacing == null ? 1 : f.spacing;
    for (var pass = sh ? 0 : 1; pass < 2; pass++) {
      var cx = x;
      for (var i = 0; i < s.length; i++) {
        var ch = s[i];
        if (ch === ' ') { cx += (f.advance || (f.space || 4)) * scale; continue; }
        var rows = bitmapRows(f, ch); if (!rows) { cx += (f.advance || 5) * scale; continue; }
        for (var ry = 0; ry < rows.length; ry++) for (var rx = 0; rx < rows[ry].length; rx++) {
          var c = rows[ry][rx]; if (c !== '#' && c !== '1') continue;
          ctx.fillStyle = pass ? (ry < split || !col2 ? col : col2) : sh;
          ctx.fillRect(cx + (rx + (pass ? 0 : 1)) * scale, y + (ry + (pass ? 0 : 1)) * scale, scale, scale);
        }
        cx += (f.advance || rows[0].length + sp) * scale;
      }
    }
  }
  // canvas font rasterised to hard pixels (pixel skins): returns a cached 1-bit mask
  var MASKS = {};
  function mask(f, s, scale) {
    var key = css(f, scale) + '|' + (f.threshold || 110) + '|' + (f.letterSpacing || 0) + '|' + s;
    if (MASKS[key]) return MASKS[key];
    var g = scratch(4, 4); if (!g) return null;
    g.font = css(f, scale);
    var w = Math.ceil(g.measureText(s).width + (f.letterSpacing || 0) * s.length) + 2, h = Math.ceil(f.size * scale * 1.5) + 2;
    g = scratch(w, h); g.clearRect(0, 0, w, h); g.font = css(f, scale); g.textBaseline = 'top'; g.fillStyle = '#fff';
    if (f.letterSpacing) { var cx = 0; for (var i = 0; i < s.length; i++) { g.fillText(s[i], cx, 0); cx += g.measureText(s[i]).width + f.letterSpacing; } }
    else g.fillText(s, 0, 0);
    var d = g.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h), th = f.threshold || 110, mw = 0, mh = 0;
    for (var p = 0; p < w * h; p++) if (d[p * 4 + 3] > th) { m[p] = 1; mw = Math.max(mw, p % w + 1); mh = Math.max(mh, ((p / w) | 0) + 1); }
    return (MASKS[key] = { w: w, h: h, m: m, iw: mw, ih: mh });
  }
  function drawMask(ctx, M, x, y, col, dx, dy) {
    ctx.fillStyle = col; x = Math.round(x); y = Math.round(y);
    for (var yy = 0; yy < M.h; yy++) {
      var run = -1;
      for (var xx = 0; xx <= M.w; xx++) {
        var on = xx < M.w && M.m[yy * M.w + xx];
        if (on && run < 0) run = xx;
        if (!on && run >= 0) { ctx.fillRect(x + run + (dx || 0), y + yy + (dy || 0), xx - run, 1); run = -1; }
      }
    }
  }

  /* ---------------- generic (token-driven) implementations; any skin may override ---------------- */
  var BASE = {
    measure: function (str, o) {
      o = o || {}; var f = fontOf(this, o.font), s = String(str);
      if (f.uppercase) s = s.toUpperCase();
      if (f.type === 'bitmap') return bitmapW(f, s) * (o.scale || 1);
      if (this.pixel) { var M = mask(f, s, o.scale); return M ? M.iw : 0; }
      var g = scratch(4, 4); if (!g) return s.length * f.size * 0.6;
      g.font = css(f, o.scale); return g.measureText(s).width + (f.letterSpacing || 0) * Math.max(0, s.length - 1);
    },
    // text(ctx, str, x, y, {font, color, color2, shadow (false = none), outline (false = none), align, scale, alpha}) -> width
    text: function (ctx, str, x, y, o) {
      o = o || {}; var f = fontOf(this, o.font), P = this.palette, s = String(str);
      if (f.uppercase) s = s.toUpperCase();
      var w = this.measure(s, o), col = token(this, o.color) || P.text.main;
      if (o.align === 'center') x -= Math.floor(w / 2); else if (o.align === 'right') x -= w;
      var sh = o.shadow === false ? null : token(this, o.shadow) || (this.shadow.text ? P.text.shadow : null);
      var ol = o.outline === false ? null : token(this, o.outline) || (this.outline.text && this.outline.text.width ? P.text.outline : null);
      var pa = ctx.globalAlpha; if (o.alpha != null) ctx.globalAlpha = pa * o.alpha;
      if (f.type === 'bitmap') drawBitmap(ctx, f, s, x, y, col, token(this, o.color2), sh, o.scale);
      else if (this.pixel) {
        var M = mask(f, s, o.scale);
        if (M) {
          if (ol) [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) { drawMask(ctx, M, x, y, ol, d[0], d[1]); });
          if (sh) drawMask(ctx, M, x, y, sh, (this.shadow.text || {}).dx || 1, (this.shadow.text || {}).dy || 1);
          drawMask(ctx, M, x, y, col);
        }
      } else {
        ctx.save(); ctx.font = css(f, o.scale); ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        if (f.letterSpacing && 'letterSpacing' in ctx) ctx.letterSpacing = f.letterSpacing + 'px';
        if (sh) { var S = this.shadow.text || { dx: 1, dy: 1 }; ctx.fillStyle = sh; if (S.blur) setShadow(ctx, sh, S.blur, 0, 0); ctx.fillText(s, x + (S.dx || 0), y + (S.dy == null ? 1 : S.dy)); clearShadow(ctx); }
        if (ol) { ctx.lineJoin = 'round'; ctx.lineWidth = (o.outlineWidth || (this.outline.text && this.outline.text.width) || 1) * 2; ctx.strokeStyle = ol; ctx.strokeText(s, x, y); }
        ctx.fillStyle = col; ctx.fillText(s, x, y); ctx.restore();
      }
      ctx.globalAlpha = pa; return w;
    },
    // frame(ctx, rect, {role: 'window'|'plate'|'banner'|'tooltip'|'row'|'backing', team: 'a'|'b'|'n', focus, alert, disabled, alpha}) -> inner rect
    frame: function (ctx, r, st) {
      st = st || {};
      if (st.role === 'row' || st.role === 'backing') return BASE.frameBand.call(this, ctx, r, st);
      var P = this.palette, U = P.ui, sh = this.shape || {}, rad = st.role === 'plate' ? (sh.plateRadius != null ? sh.plateRadius : sh.radius || 0) : sh.radius || 0;
      var fill = U.fill, fill2 = U.fillTo || U.fill, edge = st.alert ? P.text.accent || U.highlight : U.edge;
      if (st.team && P.team[st.team] && st.team !== 'n') { fill = mix(fill, P.team[st.team], sh.teamTint == null ? 0.35 : sh.teamTint); fill2 = mix(fill2, P.team[st.team], sh.teamTint == null ? 0.35 : sh.teamTint); }
      var x = r.x, y = r.y, w = r.w, h = r.h, pa = ctx.globalAlpha, path = function (g, X, Y, W, H, R) { g.beginPath(); if (g.roundRect && R) g.roundRect(X, Y, W, H, R); else g.rect(X, Y, W, H); };
      ctx.save(); if (st.alpha != null) ctx.globalAlpha = pa * st.alpha;
      var S = this.shadow.window;
      if (S) { ctx.fillStyle = U.shadow; if (S.blur && !this.pixel) { setShadow(ctx, U.shadow, S.blur, S.dx || 0, S.dy || 0); path(ctx, x, y, w, h, rad); ctx.fill(); clearShadow(ctx); } else { path(ctx, x + (S.dx || 0), y + (S.dy == null ? 1 : S.dy), w, h, rad); ctx.fill(); } }
      var gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, fill); gr.addColorStop(1, fill2);
      ctx.fillStyle = gr; path(ctx, x, y, w, h, rad); ctx.fill();
      var ew = sh.edgeWidth == null ? 1 : sh.edgeWidth;
      if (ew) { ctx.lineWidth = ew; ctx.strokeStyle = edge; path(ctx, x + ew / 2, y + ew / 2, w - ew, h - ew, Math.max(0, rad - ew / 2)); ctx.stroke(); }
      if (sh.innerLine) { ctx.lineWidth = sh.innerLine; ctx.strokeStyle = U.highlight; var i2 = ew + 1 + sh.innerLine / 2; path(ctx, x + i2, y + i2, w - 2 * i2, h - 2 * i2, Math.max(0, rad - i2)); ctx.stroke(); }
      else { ctx.fillStyle = U.highlight; ctx.fillRect(x + ew + rad / 2, y + ew, w - 2 * ew - rad, 1); }
      if (st.focus) { ctx.lineWidth = 2; ctx.strokeStyle = P.text.accent || U.highlight; path(ctx, x - 1, y - 1, w + 2, h + 2, rad + 1); ctx.stroke(); }
      ctx.restore();
      var pad = sh.padding == null ? 4 : sh.padding;
      return { x: x + pad, y: y + pad, w: w - 2 * pad, h: h - 2 * pad };
    },
    // the two unframed roles. 'row' = selected-row band inside a menu (fill ui.select; st.focus = brighter, st.disabled = dimmer);
    // 'backing' = a plain backdrop behind text that floats on the scene or a title band inside a window (fill ui.well).
    // Pixel skins: a flat fillRect, so pixel16 matches the modules' own fills exactly.
    frameBand: function (ctx, r, st) {
      st = st || {}; var U = this.palette.ui, row = st.role === 'row', col = row ? U.select || rgba(this.palette.text.main, 0.2) : U.well || rgba(this.palette.ink, 0.4);
      var rad = this.pixel ? 0 : (this.shape && (row ? this.shape.rowRadius : this.shape.backingRadius)) != null ? (row ? this.shape.rowRadius : this.shape.backingRadius) : Math.min(this.shape && this.shape.radius || 0, r.h / 2);
      var pa = ctx.globalAlpha; ctx.globalAlpha = pa * (st.alpha == null ? 1 : st.alpha) * (st.disabled ? 0.5 : 1);
      ctx.fillStyle = col;
      if (rad > 0) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, rad); else ctx.rect(r.x, r.y, r.w, r.h); ctx.fill(); } else ctx.fillRect(r.x, r.y, r.w, r.h);
      if (st.focus && !this.pixel) { ctx.fillStyle = rgba(this.palette.text.accent || U.highlight, 0.9); ctx.fillRect(r.x, r.y + 1, 1.5, r.h - 2); }
      ctx.globalAlpha = pa; return { x: r.x, y: r.y, w: r.w, h: r.h };
    },
    // number(ctx, str, x, y, {kind, scale, big, suffix, label, labelGap, align, baseline, alpha, age (ms since spawn), life (ms),
    //   glyphOffset(i, item) -> {dx, dy, alpha, flash, skip, sx, sy}}) -> [{i, x, y, w, h}] one rect per drawn glyph, canonical order
    number: function (ctx, str, x, y, o) {
      o = o || {}; var self = this, P = this.palette, s = String(str), kind = o.kind || 'damage';
      var col = o.color || ({ damage: P.text.main, crit: P.fx.crit, heal: P.fx.heal, mp: P.fx.cold, miss: P.text.dim || P.text.main, status: P.fx.status || P.text.accent || P.fx.cold })[kind] || P.text.main;
      var ON = this.outline.number || {}, olc = ON.width ? token(this, ON.color || 'text.outline') : false;
      var fo = { font: 'num', color: col, outline: olc, outlineWidth: ON.width, shadow: false, scale: (o.scale || 1) * (kind === 'crit' && o.big !== false ? 1.25 : 1) };
      var so = { font: 'ui', color: col, outline: olc, outlineWidth: ON.width, shadow: false }, lo = { font: 'ui', color: P.fx.crit, outline: olc, outlineWidth: ON.width, shadow: false };
      var fh = function (name, sc) { var f = fontOf(self, name); return (f.height || f.size || 10) * (sc || 1); };
      var nh = fh('num', fo.scale), uh = fh('ui'), sp = this.fonts.num.type === 'bitmap' ? (this.fonts.num.spacing == null ? 1 : this.fonts.num.spacing) : 0;
      var items = glyphItems(s, o), adv = [], w = 0, sw = 0, lw = 0;
      items.forEach(function (it) { var op = it.role === 'main' ? fo : it.role === 'suffix' ? so : lo, cw = self.measure(it.ch, op); adv.push(cw); if (it.role === 'main') w += cw + sp; else if (it.role === 'suffix') sw += cw + 1; else lw += cw + 1; });
      w = Math.max(0, w - sp); if (sw) sw += 1; lw = Math.max(0, lw - 1);
      if (o.align === 'center') x -= (w + sw) / 2; if (o.baseline === 'bottom') y -= nh;
      if (this.motion.snap) { x = Math.round(x); y = Math.round(y); }
      var cx = { main: x, suffix: x + w + 2, label: x + (w + sw) / 2 - lw / 2 }, cy = { main: y, suffix: y + nh - uh, label: y - uh - (o.labelGap == null ? 3 : o.labelGap) }, out = [];
      items.forEach(function (it, j) {
        var d = (o.glyphOffset && o.glyphOffset(j, it)) || {}, op = it.role === 'main' ? fo : it.role === 'suffix' ? so : lo, gx = cx[it.role] + (d.dx || 0), gy = cy[it.role] + (d.dy || 0), gw = adv[j], gh = it.role === 'main' ? nh : uh;
        cx[it.role] += gw + (it.role === 'main' ? sp : 1);
        if (d.skip) return;
        var a = d.alpha != null ? d.alpha : o.alpha != null ? o.alpha : 1, sx = d.sx || 1, sy = d.sy || 1;
        var gop = merge(op, d.flash ? { color: P.fx.white || '#ffffff' } : {});
        var paint = function (g) {
          if (sx !== 1 || sy !== 1) { g.save(); g.translate(gx + gw / 2, gy + gh); g.scale(sx, sy); self.text(g, it.ch, -gw / 2, -gh, gop); g.restore(); }
          else self.text(g, it.ch, gx, gy, gop);
        };
        if (self.pixel || a >= 1) { var pa = ctx.globalAlpha; ctx.globalAlpha = pa * a; paint(ctx); ctx.globalAlpha = pa; }
        else fadeLayer(ctx, a, { x: gx - gw, y: gy - gh, w: gw * 3, h: gh * 3 }, paint);
        out.push({ i: j, x: gx, y: gy, w: gw, h: gh, role: it.role });
      });
      return out;
    },
    // overlay(ctx, tileRect, 'move'|'attack'|'threat'|'heal', t, {grow 0..1, pattern, tile: {x, y}, edges: {top, right, bottom, left}, seams: {right, bottom}})
    overlay: function (ctx, r, kind, t, o) {
      o = o || {}; var C = this.palette.overlay[kind] || this.palette.overlay.move, gr = o.grow == null ? 1 : o.grow, os = this.overlayStyle || {};
      if (gr <= 0) return;
      var a = (C.alpha == null ? 0.3 : C.alpha) * gr, tx = o.tile ? o.tile.x : 0, ty = o.tile ? o.tile.y : 0, x = r.x, y = r.y, w = r.w, h = r.h;
      if ((o.pattern || os.pattern) === 'pulsing' && Math.sin((tx + ty) * 0.55 - t * 3.2) > 0.5) a *= 1.35;
      var pa = ctx.globalAlpha;
      if (os.mode === 'dither') {   // pixel checkerboard: every other pixel at full colour
        ctx.fillStyle = C.fill; for (var j = 0; j < h; j++) for (var i = (j + ((x + y) & 1)) & 1; i < w; i += 2) ctx.fillRect(x + i, y + j, 1, 1);
      } else { ctx.fillStyle = rgba(C.fill, a); ctx.fillRect(x, y, w, h); }
      var E = o.edges || {}, ew = os.edgeWidth || 1; ctx.fillStyle = rgba(C.edge, Math.min(1, (os.edgeAlpha == null ? 0.85 : os.edgeAlpha) * gr));
      if (E.top) ctx.fillRect(x, y, w, ew); if (E.bottom) ctx.fillRect(x, y + h - ew, w, ew);
      if (E.left) ctx.fillRect(x, y, ew, h); if (E.right) ctx.fillRect(x + w - ew, y, ew, h);
      ctx.globalAlpha = pa;
    },
    // bar(ctx, rect, frac 0..1, kind, {style: 'gauge'|'meter', tag}) kind: charge|haste|slow|ready|queued|enemy|enemyFull|hp|hpLow|null (empty)
    bar: function (ctx, r, frac, kind, o) {
      o = o || {}; var P = this.palette, B = P.bars || {}, sh = this.shape || {}, rad = sh.barRadius == null ? 0 : sh.barRadius;
      var x = r.x, y = r.y, w = r.w, h = r.h, f = Math.max(0, Math.min(1, frac || 0));
      var path = function (X, Y, W, H, R) { ctx.beginPath(); if (ctx.roundRect && R) ctx.roundRect(X, Y, W, H, Math.min(R, H / 2)); else ctx.rect(X, Y, W, H); };
      ctx.fillStyle = B.track || P.ui.shadow; path(x, y, w, h, rad); ctx.fill();
      if (!kind || f <= 0) return;
      var c = B[kind] || ({ hp: P.fx.heal, hpLow: P.fx.hot, charge: P.fx.hot, haste: P.fx.heal, slow: P.fx.cold, ready: P.text.main, queued: P.fx.cold, enemy: P.team.b, enemyFull: P.fx.crit })[kind] || P.ui.highlight;
      var b = sh.barInset == null ? 1 : sh.barInset;
      ctx.fillStyle = c; path(x + b, y + b, (w - 2 * b) * f, h - 2 * b, Math.max(0, rad - b)); ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.35); ctx.fillRect(x + b + rad / 2, y + b, Math.max(0, (w - 2 * b) * f - rad), 1);
    },
    // cursor(ctx, rect, 'bracket'|'hand', t, {alpha, invalid})
    cursor: function (ctx, r, kind, t, o) {
      o = o || {}; var P = this.palette, col = o.invalid ? P.overlay.attack.edge : P.text.accent || P.ui.highlight, pa = ctx.globalAlpha;
      ctx.globalAlpha = pa * (o.alpha == null ? 1 : o.alpha);
      if (kind === 'hand') { ctx.fillStyle = P.text.outline; ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y + r.h / 2); ctx.lineTo(r.x, r.y + r.h); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(r.x + 1, r.y + 1.2); ctx.lineTo(r.x + r.w - 1.6, r.y + r.h / 2); ctx.lineTo(r.x + 1, r.y + r.h - 1.2); ctx.fill(); }
      else {
        var b = Math.sin(t * 6) > 0 ? 0 : -1, L = Math.max(3, Math.round(r.w / 3)), x0 = r.x + b, y0 = r.y + b, x1 = r.x + r.w - 1 - b, y1 = r.y + r.h - 1 - b;
        [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(function (c) {
          ctx.fillStyle = P.text.outline; ctx.fillRect(Math.min(c[0], c[0] + c[2] * L) - 1, c[1] - 1, L + 2, 3); ctx.fillRect(c[0] - 1, Math.min(c[1], c[1] + c[3] * L) - 1, 3, L + 2);
          ctx.fillStyle = col; ctx.fillRect(Math.min(c[0], c[0] + c[2] * (L - 1)), c[1], L, 1); ctx.fillRect(c[0], Math.min(c[1], c[1] + c[3] * (L - 1)), 1, L);
        });
      }
      ctx.globalAlpha = pa;
    },
    // path(ctx, points [{x, y}] tile centres in native px, t, {tile, alpha, invalid}): the move arrow. OPTIONAL in skins
    // (define() does not fill it in): modules call skin.path only if the skin has one, else draw their own arrow coloured
    // from palette.overlay.path. A skin may opt into this generic one with path: GameDNA_Skin.base.path.
    path: function (ctx, pts, t, o) {
      o = o || {}; if (!pts || pts.length < 2) return;
      var self = this, P = this.palette, C = (P.overlay && P.overlay.path) || {}, T = o.tile || 16, bad = o.invalid;
      var mid = bad ? P.overlay.attack.fill : C.mid || P.overlay.move.edge, lite = bad ? P.overlay.attack.edge : C.light || P.ui.highlight, ol = C.outline || P.ink;
      var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
      var box = { x: Math.min.apply(null, xs) - T, y: Math.min.apply(null, ys) - T, w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + 2 * T, h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + 2 * T };
      var a = pts[pts.length - 2], b = pts[pts.length - 1], ang = Math.atan2(b.y - a.y, b.x - a.x), hl = T * 0.42, hw = T * 0.34, tip = { x: b.x + Math.cos(ang) * T * 0.3, y: b.y + Math.sin(ang) * T * 0.3 };
      var line = function (g) { g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (var i = 1; i < pts.length - 1; i++) g.lineTo(pts[i].x, pts[i].y); g.lineTo(tip.x - Math.cos(ang) * hl * 0.8, tip.y - Math.sin(ang) * hl * 0.8); };
      var head = function (g) { g.beginPath(); g.moveTo(tip.x, tip.y); g.lineTo(tip.x - Math.cos(ang) * hl - Math.sin(ang) * hw, tip.y - Math.sin(ang) * hl + Math.cos(ang) * hw); g.lineTo(tip.x - Math.cos(ang) * hl + Math.sin(ang) * hw, tip.y - Math.sin(ang) * hl - Math.cos(ang) * hw); g.closePath(); };
      fadeLayer(ctx, o.alpha == null ? 1 : o.alpha, box, function (g) {
        g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
        g.strokeStyle = ol; g.fillStyle = ol; g.lineWidth = T * 0.3 + 2; line(g); g.stroke(); head(g); g.lineWidth = 2; g.stroke(); g.fill();
        g.strokeStyle = mid; g.fillStyle = mid; g.lineWidth = T * 0.3; line(g); g.stroke(); head(g); g.fill();
        g.strokeStyle = lite; g.lineWidth = Math.max(1, T * 0.08); line(g); g.stroke();
        var u = ((t || 0) * 1.2) % 1, n = pts.length - 1, f = u * n, k = Math.min(n - 1, Math.floor(f)), r = f - k;   // a travelling spark
        g.fillStyle = C.spark || '#ffffff'; g.beginPath(); g.arc(pts[k].x + (pts[k + 1].x - pts[k].x) * r, pts[k].y + (pts[k + 1].y - pts[k].y) * r, Math.max(1, T * 0.07), 0, 7); g.fill();
        g.restore();
        void self;
      });
    },
    // tile(ctx, rect, kind, t): one map cell for previews and demos (not used by modules). kind: grass | forest | water | hill |
    // mountain | road | bridge | fort | sand | wall | floor. Colours from palette.terrain.<kind> when present.
    tile: function (ctx, r, kind, t) {
      var Tn = merge(TERRAIN, this.palette.terrain || {}), c = Tn[kind] || Tn.grass, x = r.x, y = r.y, w = r.w, h = r.h, px = this.pixel;
      var dk = mix(c, this.palette.ink, 0.35), lt = mix(c, '#ffffff', 0.3), base = kind === 'forest' || kind === 'hill' || kind === 'mountain' || kind === 'fort' ? Tn.grass : kind === 'bridge' ? Tn.water : c;
      ctx.save(); ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
      var R = function (X, Y, W, H, col) { ctx.fillStyle = col; ctx.fillRect(px ? Math.round(X) : X, px ? Math.round(Y) : Y, px ? Math.round(W) : W, px ? Math.round(H) : H); };
      var tri = function (cx, by, hw, th, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx, by - th); ctx.lineTo(cx + hw, by); ctx.lineTo(cx - hw, by); ctx.closePath(); ctx.fill(); };
      if (kind === 'water' || kind === 'bridge') { var ph = Math.sin((t || 0) * 2 + x * 0.3) > 0 ? 1 : 0; R(x + w * 0.2 + ph, y + h * 0.35, w * 0.3, 1, lt); R(x + w * 0.55 - ph, y + h * 0.7, w * 0.3, 1, lt); }
      else if (kind === 'grass' || kind === 'sand' || kind === 'floor' || kind === 'road') { R(x + w * 0.25, y + h * 0.3, Math.max(1, w * 0.12), 1, lt); R(x + w * 0.6, y + h * 0.65, Math.max(1, w * 0.12), 1, dk); }
      if (kind === 'forest') { R(x + w * 0.45, y + h * 0.6, w * 0.1, h * 0.3, mix(Tn.road, this.palette.ink, 0.4)); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.42, w * 0.3, 0, 7); ctx.fill(); ctx.fillStyle = lt; ctx.beginPath(); ctx.arc(x + w * 0.42, y + h * 0.34, w * 0.1, 0, 7); ctx.fill(); }
      if (kind === 'hill') { tri(x + w / 2, y + h * 0.85, w * 0.42, h * 0.5, c); tri(x + w * 0.42, y + h * 0.85, w * 0.16, h * 0.4, lt); }
      if (kind === 'mountain') { tri(x + w / 2, y + h * 0.9, w * 0.46, h * 0.8, c); tri(x + w / 2, y + h * 0.9 - h * 0.55, w * 0.14, h * 0.25, '#ffffff'); }
      if (kind === 'bridge') { R(x, y + h * 0.2, w, h * 0.6, c); for (var i = 1; i < 4; i++) R(x + w * i / 4, y + h * 0.2, 1, h * 0.6, dk); }
      if (kind === 'fort') { R(x + w * 0.15, y + h * 0.35, w * 0.7, h * 0.55, c); for (var j = 0; j < 3; j++) R(x + w * (0.15 + j * 0.27), y + h * 0.22, w * 0.16, h * 0.15, c); R(x + w * 0.42, y + h * 0.6, w * 0.16, h * 0.3, dk); }
      if (kind === 'wall') { R(x, y + h * 0.5, w, 1, dk); R(x + w / 2, y, 1, h * 0.5, dk); R(x + w / 4, y + h / 2, 1, h / 2, dk); }
      ctx.restore();
    },
    // token(ctx, rect, unit, t): a unit piece for previews (unit = {team: 'a'|'b'|'n', kind: 'knight'|'mage'|'fighter'|'archer'|'monster',
    // selected, dead, facing: 1|-1}). skin.token(path) with a string still looks up a palette token (see define()).
    unitToken: function (ctx, r, u, t) {
      u = u || {}; var P = this.palette, c = P.team[u.team] || P.team.a, ol = token(this, (this.outline.sprite && this.outline.sprite.color) || 'ink'), ow = (this.outline.sprite && this.outline.sprite.width) || 1;
      var bob = u.selected ? (this.pixel ? (Math.floor((t || 0) * 4) % 2) : Math.sin((t || 0) * 6) * 0.8) : 0, x = r.x, y = r.y - bob, w = r.w, h = r.h;
      var pa = ctx.globalAlpha; ctx.save(); ctx.globalAlpha = pa * (u.dead ? 0.35 : 1);
      ctx.fillStyle = rgba(P.ink, 0.3); ctx.beginPath(); ctx.ellipse(r.x + w / 2, r.y + h * 0.92, w * 0.3, h * 0.08, 0, 0, 7); ctx.fill();
      var body = function (g, grow) { g.beginPath(); if (g.roundRect) g.roundRect(x + w * 0.26 - grow, y + h * 0.42 - grow, w * 0.48 + 2 * grow, h * 0.48 + 2 * grow, w * 0.12); else g.rect(x + w * 0.26 - grow, y + h * 0.42 - grow, w * 0.48 + 2 * grow, h * 0.48 + 2 * grow); };
      var head = function (g, grow) { g.beginPath(); g.arc(x + w / 2, y + h * 0.3, w * 0.17 + grow, 0, 7); };
      ctx.fillStyle = ol; body(ctx, ow); ctx.fill(); head(ctx, ow); ctx.fill();
      ctx.fillStyle = c; body(ctx, 0); ctx.fill(); ctx.fillStyle = mix(c, '#ffffff', 0.25); ctx.fillRect(x + w * 0.3, y + h * 0.45, w * 0.4, Math.max(1, h * 0.06));
      ctx.fillStyle = P.skin || '#f2c49b'; head(ctx, 0); ctx.fill();
      var k = u.kind || 'fighter', f = u.facing === -1 ? -1 : 1, hx = x + w / 2 + f * w * 0.32;
      ctx.strokeStyle = ol; ctx.lineWidth = Math.max(1, w * 0.08); ctx.lineCap = 'round'; ctx.beginPath();
      if (k === 'mage') { ctx.moveTo(hx, y + h * 0.2); ctx.lineTo(hx, y + h * 0.88); ctx.stroke(); ctx.fillStyle = P.fx.cold; ctx.beginPath(); ctx.arc(hx, y + h * 0.18, w * 0.08, 0, 7); ctx.fill(); }
      else if (k === 'archer') { ctx.arc(hx - f * w * 0.05, y + h * 0.55, h * 0.22, -Math.PI / 2, Math.PI / 2, f < 0); ctx.stroke(); }
      else if (k === 'monster') { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + w * 0.4, y + h * 0.27, w * 0.06, h * 0.05); ctx.fillRect(x + w * 0.54, y + h * 0.27, w * 0.06, h * 0.05); }
      else { ctx.moveTo(hx, y + h * 0.75); ctx.lineTo(hx, y + h * 0.3); ctx.stroke(); if (k === 'knight') { ctx.fillStyle = mix(c, P.ink, 0.3); ctx.fillRect(x + w / 2 - f * w * 0.42 - w * 0.08, y + h * 0.48, w * 0.16, h * 0.28); } }
      ctx.restore(); ctx.globalAlpha = pa;
    }
  };
  // atmosphere(ctx, view {x, y, w, h}, t, {phase, lights, ambient, focus}): optional full-screen mood layer (fog, light, vignette,
  // darkness, grain). Phases, in draw order: 'world' (after the ground, before props and units: lighting of the floor),
  // 'post-props' (after props and units, before world-space overlays and numbers: tilt-shift, depth blur, fog in front),
  // 'final' (after world-space overlays, before HUD windows: motes, bloom, vignette). Hosts call only the phases listed in
  // skin.atmospherePhases. lights = standard lights (see normLights). Generic: draws nothing.
  BASE.atmosphere = function () { };
  // prop(ctx, rect, kind, t, {lights, light, seed}): one standing object on a map cell, drawn depth-sorted with the units (back to
  // front by the cell's bottom edge), after the ground and the range overlays, so overlays never swallow it. rect = the cell;
  // the prop's foot sits on rect's bottom edge and it may rise up to one cell above rect. kind: stone | rock | tree | bush |
  // brazier | lamp | crystal (free text allowed; unknown kinds draw as stone). light = the standard light this prop carries
  // (brazier, lamp, crystal), if any. Generic: the skin's own tile() for the matching terrain (the pre-prop, tile-based look).
  var PROP_TILE = { stone: 'mountain', rock: 'mountain', brazier: 'mountain', lamp: 'mountain', crystal: 'mountain', tree: 'forest', bush: 'forest' };
  BASE.prop = function (ctx, r, kind, t) { return this.tile(ctx, r, PROP_TILE[kind] || 'mountain', t); };
  BASE.propTile = function (kind) { return PROP_TILE[kind] || 'mountain'; };
  /* ---------------- standard lights ----------------
     {x, y (native px, the light's foot on the ground), r (radius, native px), col: '#rrggbb', intensity (0..1, nominal; a skin may
     scale it internally), kind ('fire' | 'lamp' | 'magic' | 'crystal' | 'sun' | 'moon' | ... free text), h (optional height above
     the ground, native px; default 16), flicker (optional 0..1)}. normLights() also accepts legacy fields: i (intensity),
     col as [r, g, b] 0..1, hex, rgb. It returns NEW objects; never mutate the host's list. */
  function normLight(l) {
    l = l || {}; var c = l.col != null ? l.col : l.hex != null ? l.hex : l.rgb, hx;
    if (Array.isArray(c)) hx = hex(c.map(function (v) { return v <= 1 ? v * 255 : v; })); else hx = c ? hex(rgb(c)) : '#ffffff';
    var it = l.intensity != null ? +l.intensity : l.i != null ? +l.i : 0.5;
    return { x: +l.x || 0, y: +l.y || 0, r: l.r != null ? +l.r : 40, col: hx, intensity: Math.max(0, it), kind: l.kind || 'lamp', h: l.h != null ? +l.h : 16, flicker: l.flicker || 0 };
  }
  function normLights(list) { return (list || []).map(normLight); }
  var TERRAIN = { grass: '#78b456', forest: '#3e7a3a', water: '#4a8ed0', hill: '#b8975a', mountain: '#8c8478', road: '#cdb68a', bridge: '#a0703c', fort: '#9a98a8', sand: '#e0cc92', wall: '#6a6470', floor: '#a8a0a0' };


  /* ---------------- bitmaps (v0.5) ----------------
     Generated or hand-made images registered per role and kind. Registry keys are 'role|kind'; kind '*' is the role's
     default. Global registrations apply to non-pixel skins only (pixel skins need snapped, palette-quantised art: register
     those with meta.pixel = true, or for one skin with opts.skin = id). Per-skin registrations always apply.
     meta (all optional): anchor [ax, ay] (0..1 of the image; default [0.5, 1] = the foot), baseline (px from the top of the
     image to the foot line; overrides anchor y), cellsTall (prop/sprite height in cells; default 2), cells (a tile texture
     that spans cells x cells map cells), slice [l, t, r, b] and scale (frame9), inset [l, t, r, b] (frame9 inner padding,
     native px), fill (frame9 centre, default true), parallax (bg-layer scroll factor, default 1), pixel (true = snapped
     pixel art, drawn without smoothing, allowed on pixel skins). */
  var BMP = { '*': {} }, BMP_N = 0;
  var BITMAP_ROLES = ['portrait', 'prop', 'tile', 'icon', 'frame9', 'bg-layer'];
  function bmpRec(img, meta) {
    if (img && img.img && !img.width && !(typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement)) { meta = merge(img.meta || {}, meta || {}); img = img.img; }   // a GameDNA_Assets record {img, meta}
    if (!img) return null;
    return { img: img, meta: meta || {} };
  }
  function bmpSet(role, kind, img, meta, o) {
    var r = bmpRec(img, meta); var sk = (o && o.skin) || '*'; if (!BMP[sk]) BMP[sk] = {};
    var key = role + '|' + (kind == null ? '*' : kind), had = !!BMP[sk][key];
    if (!r) { if (had) { delete BMP[sk][key]; BMP_N--; } return null; }
    BMP[sk][key] = r; if (!had) BMP_N++; return r;
  }
  function bmpGet(skin, role, kind) {
    if (!BMP_N) return null;
    var id = skin && skin.id, k1 = role + '|' + (kind == null ? '*' : kind), k2 = role + '|*', own = id && BMP[id], g = BMP['*'], r;
    if (own && (r = own[k1] || own[k2])) return r;
    r = g[k1] || g[k2];
    if (r && skin && skin.pixel && !r.meta.pixel) return null;
    return r || null;
  }
  function bmpReady(r) { var im = r && r.img; if (!im) return false; if (typeof im.complete === 'boolean' && (!im.complete || !im.naturalWidth)) return false; return (im.naturalWidth || im.width) > 0; }
  function bmpSize(im) { return { w: im.naturalWidth || im.videoWidth || im.width, h: im.naturalHeight || im.videoHeight || im.height }; }
  // draw one registered bitmap for a role into rect; returns false (nothing drawn), true, or the inner rect (frame9)
  function bmpDraw(skin, ctx, r, role, rec, o) {
    if (!bmpReady(rec) || !ctx || !r) return false;
    o = o || {}; var im = rec.img, m = rec.meta, S = bmpSize(im), res = true;
    var pa = ctx.globalAlpha, sm = ctx.imageSmoothingEnabled;
    ctx.save();
    try {
      if (o.alpha != null) ctx.globalAlpha = pa * o.alpha;
      ctx.imageSmoothingEnabled = !m.pixel; if (!m.pixel && 'imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
      if (role === 'tile') {
        var n = Math.max(1, m.cells || 1), cw = S.w / n, ch = S.h / n;
        var cx = o.col != null ? o.col : Math.round(r.x / (r.w || 1)), cy = o.row != null ? o.row : Math.round(r.y / (r.h || 1));
        cx = ((cx % n) + n) % n; cy = ((cy % n) + n) % n;
        ctx.drawImage(im, cx * cw, cy * ch, cw, ch, r.x, r.y, r.w, r.h);
      } else if (role === 'icon') {
        var pad = o.pad != null ? o.pad : 0, bw = r.w - 2 * pad, bh = r.h - 2 * pad, s1 = Math.min(bw / S.w, bh / S.h), iw = S.w * s1, ih = S.h * s1;
        ctx.drawImage(im, r.x + pad + (bw - iw) / 2, r.y + pad + (bh - ih) / 2, iw, ih);
      } else if (role === 'portrait') {
        var s2 = Math.min(r.w / S.w, (o.h || r.h) / S.h), pw = S.w * s2, ph = S.h * s2, px0 = r.x + (r.w - pw) / 2, py0 = r.y + r.h - ph;
        if (o.flip) { ctx.translate(px0 + pw, py0); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0, pw, ph); } else ctx.drawImage(im, px0, py0, pw, ph);
      } else if (role === 'frame9') {
        var sl = m.slice || [S.w / 3, S.h / 3, S.w / 3, S.h / 3], k = o.scale || m.scale || 1, L = sl[0], T = sl[1], R = sl[2], B = sl[3];
        var dl = L * k, dt = T * k, dr = R * k, db = B * k, x = r.x, y = r.y, w = r.w, h = r.h, mw = S.w - L - R, mh = S.h - T - B;
        var part = function (sx, sy, sw, sh, X, Y, W, H) { if (sw > 0 && sh > 0 && W > 0 && H > 0) ctx.drawImage(im, sx, sy, sw, sh, X, Y, W, H); };
        if (m.fill !== false) part(L, T, mw, mh, x + dl, y + dt, w - dl - dr, h - dt - db);
        part(0, 0, L, T, x, y, dl, dt); part(L, 0, mw, T, x + dl, y, w - dl - dr, dt); part(S.w - R, 0, R, T, x + w - dr, y, dr, dt);
        part(0, T, L, mh, x, y + dt, dl, h - dt - db); part(S.w - R, T, R, mh, x + w - dr, y + dt, dr, h - dt - db);
        part(0, S.h - B, L, B, x, y + h - db, dl, db); part(L, S.h - B, mw, B, x + dl, y + h - db, w - dl - dr, db); part(S.w - R, S.h - B, R, B, x + w - dr, y + h - db, dr, db);
        var ins = m.inset || [dl, dt, dr, db];
        res = { x: x + ins[0], y: y + ins[1], w: w - ins[0] - ins[2], h: h - ins[1] - ins[3] };
      } else if (role === 'bg-layer') {
        var s3 = r.h / S.h, lw = S.w * s3, off = ((o.scroll || 0) * (m.parallax != null ? m.parallax : 1)) % lw; if (off < 0) off += lw;
        ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
        for (var bx = r.x - off; bx < r.x + r.w; bx += lw) ctx.drawImage(im, bx, r.y, lw + 0.5, r.h);
      } else {   // 'prop', 'sprite' and any other role: foot on the rect's bottom centre, may rise above the rect
        var dh = o.h || (m.cellsTall ? m.cellsTall * r.h : r.h * 2), s4 = dh / S.h, dw = S.w * s4;
        var ax = (m.anchor && m.anchor[0] != null) ? m.anchor[0] : 0.5, ay = m.baseline != null ? m.baseline / S.h : (m.anchor && m.anchor[1] != null) ? m.anchor[1] : 1;
        var fx = r.x + r.w / 2 + (o.dx || 0), fy = r.y + r.h + (o.dy || 0), flip = o.flip || o.facing === -1;
        ctx.translate(fx, fy); if (flip) ctx.scale(-1, 1);
        ctx.drawImage(im, -ax * dw, -ay * dh, dw, dh);
      }
    } catch (e) { res = false; }
    ctx.restore(); ctx.globalAlpha = pa; ctx.imageSmoothingEnabled = sm;
    return res;
  }
  // useAssets(assets, map): register records from a GameDNA_Assets instance (anything with get(key) -> {img, meta}).
  // map = {'tile:grass': 'ground', 'prop:well': 'well', 'icon:key': 'icon-key'} (role:kind -> asset key); without a map,
  // every asset whose meta has skinRole {role, kind} (or role + kind) is registered. Returns the number registered.
  function useAssets(A, map, o) {
    if (!A || typeof A.get !== 'function') return 0;
    var n = 0, k, rec, rk;
    if (map) { for (k in map) { rec = A.get(map[k]); rk = k.split(':'); if (rec && bmpSet(rk[0], rk[1] == null ? '*' : rk[1], rec, null, o)) n++; } return n; }
    var keys = typeof A.keys === 'function' ? A.keys() : [];
    keys.forEach(function (key) { rec = A.get(key); var m = rec && rec.meta, sr = m && (m.skinRole || (m.role && BITMAP_ROLES.indexOf(m.role) >= 0 ? { role: m.role, kind: m.kind || key } : null)); if (sr && bmpSet(sr.role, sr.kind == null ? key : sr.kind, rec, null, o)) n++; });
    return n;
  }
  var BITMAPS = {
    roles: BITMAP_ROLES,
    set: bmpSet,
    get: function (role, kind, skin) { return bmpGet(skin && skin._spec ? skin : resolveQuiet(skin), role, kind); },
    has: function (role, kind, skin) { var r = BITMAPS.get(role, kind, skin); return !!(r && bmpReady(r)); },
    remove: function (role, kind, o) { return bmpSet(role, kind, null, null, o); },
    clear: function (skinId) { if (skinId) { BMP_N -= Object.keys(BMP[skinId] || {}).length; delete BMP[skinId]; } else { BMP = { '*': {} }; BMP_N = 0; } },
    list: function () { var out = [], s, k; for (s in BMP) for (k in BMP[s]) out.push({ skin: s, role: k.split('|')[0], kind: k.split('|')[1] }); return out; },
    draw: function (ctx, rect, role, rec, o) { return bmpDraw(null, ctx, rect, role, bmpRec(rec), o); },
    useAssets: useAssets
  };
  function resolveQuiet(x) { return x && x._spec ? x : (REG[x || 'pixel16'] || null); }

  /* ---------------- required shape ---------------- */
  var PALETTE_KEYS = ['ink', 'paper', 'ui.fill', 'ui.edge', 'ui.highlight', 'ui.shadow', 'team.a', 'team.b', 'team.n',
    'overlay.move.fill', 'overlay.move.edge', 'overlay.attack.fill', 'overlay.attack.edge', 'overlay.threat.fill', 'overlay.threat.edge', 'overlay.heal.fill', 'overlay.heal.edge',
    'fx.hot', 'fx.cold', 'fx.heal', 'fx.crit', 'text.main', 'text.shadow', 'text.outline'];
  var METHODS = ['frame', 'text', 'measure', 'number', 'overlay', 'bar', 'cursor', 'tile', 'atmosphere', 'prop'];   // filled from BASE when missing
  var OPTIONAL = ['path'];                                                                         // bound when present, never filled
  function validate(s) {
    var err = [];
    if (!s || typeof s !== 'object') return ['not an object'];
    ['id', 'name'].forEach(function (k) { if (typeof s[k] !== 'string' || !s[k]) err.push('missing ' + k); });
    if (typeof s.pixel !== 'boolean') err.push('pixel must be true or false');
    if (!s.native || !s.native.w || !s.native.h) err.push('native {w, h, scale} missing');
    PALETTE_KEYS.forEach(function (p) { var v = s.palette; p.split('.').forEach(function (k) { v = v == null ? v : v[k]; }); if (v == null) err.push('palette.' + p + ' missing'); });
    if (!s.fonts || !s.fonts.ui) err.push('fonts.ui missing'); if (!s.fonts || !s.fonts.num) err.push('fonts.num missing');
    ['particles', 'outline', 'shadow', 'motion'].forEach(function (k) { if (!s[k]) err.push(k + ' missing'); });
    METHODS.concat(OPTIONAL).forEach(function (m) { if (s[m] != null && typeof s[m] !== 'function') err.push(m + ' must be a function'); });
    return err;
  }

  var DEFAULTS = {
    pixel: false,
    native: { w: 256, h: 224, scale: 'fit', smoothing: true, snap: 0, supersample: false },
    shape: { radius: 0, edgeWidth: 1, padding: 4 },
    frameRoles: null,
    atmospherePhases: ['world', 'final'],   // phases this skin's atmosphere() draws; hosts skip the others (e.g. add 'post-props')   // roles the skin's own frame() draws besides window/plate/banner/tooltip, e.g. ['row', 'backing']; others use the generic band
    layout: { handW: 7, handH: 5, pointerGap: 5, rowFrame: false },
    particles: { shape: 'square', size: [1, 3], count: 1, snap: false, blend: 'source-over', glow: 0, gravity: 0.12, drag: 0.02, life: [300, 700], colors: ['fx.hot', 'fx.crit'], trail: 0 },
    outline: { text: { width: 0 }, number: { width: 1, max: 2, drop: 1 }, sprite: { width: 1, color: 'ink' } },
    shadow: { text: { dx: 1, dy: 1 }, window: null, sprite: { kind: 'blob', alpha: 0.35 } },
    motion: { stepMs: 0, snap: false, ease: { move: 'outQuad', pop: 'pop', fade: 'linear' }, fadeSteps: null, shakeInt: false, flashMax: 0.5, squash: null }
  };

  /* ---------------- registry ---------------- */
  // define(spec, parent?) -> normalised skin. parent = id or skin; palette/rules deep-merge, methods inherit.
  function define(spec, parent) {
    var base = parent ? (typeof parent === 'string' ? REG[parent] : parent) : null;
    if (parent && !base) throw new Error('GameDNA_Skin: unknown parent skin "' + parent + '"');
    var src = base ? base._spec : {};
    var s = merge(merge(DEFAULTS, src), spec);
    METHODS.forEach(function (m) { if (typeof s[m] !== 'function') s[m] = BASE[m]; });
    var drawUnit = typeof s.unitToken === 'function' ? s.unitToken : typeof s.token === 'function' && s.token.length >= 3 ? s.token : BASE.unitToken;
    METHODS.concat(OPTIONAL).forEach(function (m) { var f = s[m]; if (typeof f !== 'function') return; s[m] = function () { return f.apply(s, arguments); }; s[m].raw = f; });
    // frame: 'row' / 'backing' go to the generic band unless the skin lists them in frameRoles
    var fr = s.frame.raw; s.frame = function (ctx, r, st) { var role = st && st.role; if ((role === 'row' || role === 'backing') && !(s.frameRoles && s.frameRoles.indexOf(role) >= 0)) return BASE.frameBand.call(s, ctx, r, st); return fr.call(s, ctx, r, st); }; s.frame.raw = fr;
    // number: every skin receives the canonical item (i, ch, role, k, n, u) merged over its own layout item
    var nr = s.number.raw; s.number = function (ctx, str, x, y, o) {
      if (o && typeof o.glyphOffset === 'function') {
        var C = glyphItems(str, o), user = o.glyphOffset, o2 = {}, k; for (k in o) o2[k] = o[k];
        o2.glyphOffset = function (i, it) { var m = {}, q, c = C[i] || {}; if (it && typeof it === 'object') for (q in it) m[q] = it[q]; for (q in c) m[q] = c[q]; return user(i, m); };
        o = o2;
      }
      return nr.call(s, ctx, str, x, y, o);
    }; s.number.raw = nr;
    // v0.5 bitmap roles: a registered bitmap replaces the procedural tile / prop / framed window; nothing registered = v0.4 call
    var tr = s.tile.raw, pr = s.prop.raw, fw = s.frame;
    s.tile = function (ctx, r, kind) { if (BMP_N) { var b = bmpGet(s, 'tile', kind); if (b && bmpDraw(s, ctx, r, 'tile', b)) return; } return tr.apply(s, arguments); }; s.tile.raw = tr;
    s.prop = function (ctx, r, kind, t, o) { if (BMP_N) { var b = bmpGet(s, 'prop', kind); if (b && bmpDraw(s, ctx, r, 'prop', b, o && { flip: o.flip, h: o.h })) return; } return pr.apply(s, arguments); }; s.prop.raw = pr;
    s.frame = function (ctx, r, st) { if (BMP_N) { var role = (st && st.role) || 'window'; if (role !== 'row' && role !== 'backing') { var b = bmpGet(s, 'frame9', role); if (b) { var inner = bmpDraw(s, ctx, r, 'frame9', b, { alpha: st && st.alpha }); if (inner && inner !== true) return inner; } } } return fw.apply(s, arguments); }; s.frame.raw = fw.raw;
    s.bitmap = function (ctx, r, role, kind, o) { var b = bmpGet(s, role, kind); return b ? bmpDraw(s, ctx, r, role, b, o) : false; };
    s.hasBitmap = function (role, kind) { var b = bmpGet(s, role, kind); return !!(b && bmpReady(b)); };
    s._spec = merge(src, spec); METHODS.concat(OPTIONAL).forEach(function (m) { if (spec[m]) s._spec[m] = spec[m]; else if (src[m]) s._spec[m] = src[m]; });
    if (!spec.token && src.token) s._spec.token = src.token; if (!spec.unitToken && src.unitToken) s._spec.unitToken = src.unitToken;
    // token(path) looks up a palette token; token(ctx, rect, unit, t) draws a unit piece (the skin's own, or the generic one)
    s.token = function (a) { if (a == null || typeof a === 'string') return token(s, a); return drawUnit.apply(s, arguments); };
    s.lookup = function (path) { return token(s, path); };
    s.unitToken = function () { return drawUnit.apply(s, arguments); };
    s.particleColors = function () { return (s.particles.colors || []).map(function (c) { return token(s, c); }); };
    var e = validate(s); if (e.length) throw new Error('GameDNA_Skin "' + (s.id || '?') + '": ' + e.join('; '));
    return s;
  }
  function register(spec, parent) { var s = spec && spec._spec ? spec : define(spec, parent); if (!REG[s.id]) ORDER.push(s.id); REG[s.id] = s; return s; }
  function get(id) { return REG[id] || null; }
  // resolve(options.skin): skin object, registered id, or undefined -> 'pixel16'. Never throws: unknown -> default with a console warning.
  function resolve(x) {
    if (x && typeof x === 'object') return x._spec ? x : register(x);
    var s = REG[x || 'pixel16'];
    if (!s && x && root.console) console.warn('GameDNA_Skin: unknown skin "' + x + '", using pixel16');
    return s || REG.pixel16 || null;
  }

  /* ---------------- motion helpers (modules call these instead of hard-coding pixel rules) ---------------- */
  function stepTime(s, ms) { var st = s.motion.stepMs; return st > 0 ? Math.floor(ms / st) * st : ms; }   // frame-stepped clock for animation
  function snap(s, v) { return s.motion.snap ? Math.round(v) : v; }
  function fade(s, a) { var F = s.motion.fadeSteps; if (!F || !F.length) return a; for (var i = 0; i < F.length; i++) if (a >= F[i] - 1e-9) return F[i]; return F[F.length - 1]; }   // F descending, e.g. [1, .75, .5, .25]
  function ease(s, name, x) { var e = (s.motion.ease && s.motion.ease[name]) || name; return (EASE[e] || EASE.linear)(Math.max(0, Math.min(1, x))); }
  // setupCanvas(skin, canvas, ctx): smoothing per skin; returns integer scale hint for the host's CSS
  function setup(s, ctx) { if (ctx) ctx.imageSmoothingEnabled = !!s.native.smoothing; return s.native; }

  /* ---------------- fonts ready ----------------
     Canvas fonts (web fonts, late system fonts) can change width after first use. ready(skin) resolves with the skin once
     every canvas font in skin.fonts has loaded (document.fonts.load per font, then document.fonts.ready; 3 s cap). It drops
     the 1-bit mask cache and calls skin.onFontsReady() if defined. Hosts await it before the first layout, or lay out
     again after it; modules that cache widths (measure) must re-measure. Bitmap-only skins resolve at once. */
  function ready(x) {
    var sk = x && x._spec ? x : resolve(x), D = typeof document !== 'undefined' ? document : null;
    if (!sk) return Promise.resolve(null);
    var done = function () { MASKS = {}; if (typeof sk.onFontsReady === 'function') try { sk.onFontsReady(); } catch (e) { } return sk; };
    var loads = [], k, f;
    for (k in sk.fonts) { f = sk.fonts[k]; if (f && f.type === 'canvas' && f.family) loads.push(f); }
    if (!loads.length || !D || !D.fonts || !D.fonts.load) return Promise.resolve(done());
    var all = Promise.all(loads.map(function (f) { return D.fonts.load(css(f, 1), 'AZaz09').catch(function () { }); })).then(function () { return D.fonts.ready; });
    var cap = new Promise(function (r) { setTimeout(r, 3000); });
    return Promise.race([all, cap]).then(done, done);
  }

  root.GameDNA_Skin = {
    version: VERSION, define: define, register: register, get: get, resolve: resolve, list: function () { return ORDER.slice(); }, validate: validate,
    base: BASE, defaults: DEFAULTS, ease: EASE, token: token,
    color: { rgb: rgb, hex: hex, rgba: rgba, mix: mix, ramp: ramp },
    font: { bitmapWidth: bitmapW, drawBitmap: drawBitmap, mask: mask, drawMask: drawMask, css: css },
    motion: { stepTime: stepTime, snap: snap, fade: fade, ease: ease }, setup: setup, canvas: mkCanvas,
    normLight: normLight, normLights: normLights,
    scaleOf: scaleOf, setShadow: setShadow, clearShadow: clearShadow, fadeLayer: fadeLayer, glyphItems: glyphItems, ready: ready,
    bitmaps: BITMAPS
  };
})(typeof window !== 'undefined' ? window : this);
