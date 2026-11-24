/* GameDNA skin 'lowpoly' · Low-poly 3D, rendered in 2D canvas · needs skin-api.js first
 *
 * A flat-shaded toy world faked in 2D: every surface is a few triangles, each with ONE colour from a
 * facet normal and the time-of-day light (no textures, no outlines, no pure black). Range tiles are
 * bevelled glassy slabs, the path is an extruded ribbon, numbers are chunky extruded digits, and the UI
 * is rounded sans on frosted cream panels with soft shadows. No three.js, no WebGL: everything goes
 * through this 2D skin.
 *
 * Rendering contract: non-pixel. Backing store = native (256x224) x devicePixelRatio x any factor,
 * ctx.setTransform(s, 0, 0, s, 0, 0); modules keep native coordinates (scale: 'fit').
 * Methods: frame text measure number overlay bar cursor (+ optional path, shade, facet, gem, tod).
 */
(function (root) {
  'use strict';
  var API = root.GameDNA_Skin;
  if (!API) { if (root.console) console.error('lowpoly.js: load skin-api.js first'); return; }
  var rgb = API.color.rgb, mix = API.color.mix, rgba = API.color.rgba, hex = API.color.hex;

  var ROUND = '"Nunito", ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Varela Round", "Hiragino Maru Gothic ProN", system-ui, sans-serif';
  var INK = '#33395a', CORAL = '#ff8a5c';

  /* ---------------- utils ---------------- */
  var POOL = {};
  function pooled(key, w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    var c = POOL[key]; if (!c) { c = document.createElement('canvas'); POOL[key] = c; }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else c.getContext('2d').clearRect(0, 0, w, h);
    return c;
  }
  var SCR = null; function scratch() { if (!SCR) SCR = document.createElement('canvas').getContext('2d'); return SCR; }
  function devScale(ctx) { var m = ctx.getTransform ? ctx.getTransform() : null; return m ? Math.abs(m.a) || 1 : 1; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2)); g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function poly(g, pts, col) { g.fillStyle = col; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill(); }
  function halve(src, sx, sy, sw, sh, levels) {
    var cur = src, cx = sx, cy = sy, cw = sw, ch = sh;
    for (var l = 0; l < levels; l++) {
      var w = Math.max(1, Math.round(cw / 2)), h = Math.max(1, Math.round(ch / 2)), c = pooled('lp' + l, w, h), g = c.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(cur, cx, cy, cw, ch, 0, 0, w, h);
      cur = c; cx = 0; cy = 0; cw = w; ch = h;
    }
    return { c: cur, w: cw, h: ch };
  }
  // frosted panel: blur what is already drawn inside a rounded rect
  function frost(ctx, x, y, w, h, rad, blurPx) {
    if (!ctx.canvas || !ctx.getTransform) return;
    var m = ctx.getTransform(), k = Math.abs(m.a) || 1, pad = blurPx * 2;
    var X = (x - pad) * m.a + m.e, Y = (y - pad) * m.d + m.f, W = (w + 2 * pad) * m.a, H = (h + 2 * pad) * m.d;
    var sx = Math.max(0, Math.floor(X)), sy = Math.max(0, Math.floor(Y)), ex = Math.min(ctx.canvas.width, Math.ceil(X + W)), ey = Math.min(ctx.canvas.height, Math.ceil(Y + H));
    if (ex - sx < 4 || ey - sy < 4) return;
    var B = halve(ctx.canvas, sx, sy, ex - sx, ey - sy, Math.max(1, Math.round(Math.log2(Math.max(2, blurPx * k)))));
    ctx.save(); rr(ctx, x, y, w, h, rad); ctx.clip(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(B.c, 0, 0, B.w, B.h, sx, sy, ex - sx, ey - sy); ctx.restore();
  }

  /* ---------------- light: time of day + facet shading ---------------- */
  // sun = direction TO the sun in map space (x right, y down the screen, z up); colours are hex
  var TOD = {
    day:   { sun: [-0.42, -0.62, 0.66], key: '#fff3dc', keyI: 0.62, amb: '#dfe5f6', ambI: 0.52, sky: ['#7fb8ea', '#dcefff'], glow: 0 },
    dusk:  { sun: [0.62, -0.42, 0.40], key: '#ffcf9e', keyI: 0.62, amb: '#c4c4f0', ambI: 0.50, sky: ['#6c6fb8', '#ffbf96'], glow: 0.35 },
    night: { sun: [-0.30, -0.55, 0.78], key: '#9fb2ff', keyI: 0.30, amb: '#46508f', ambI: 0.50, sky: ['#161b46', '#34366e'], glow: 1 }
  };
  var CUR = { tod: 'day' };
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  // shade(col, normal, tod?) -> hex: a flat-up face keeps its base colour under the light's tint; tilted faces brighten / darken
  function shade(col, n, tod) {
    var L = TOD[tod || CUR.tod] || TOD.day, s = norm(L.sun), nn = norm(n), d = Math.max(0, nn[0] * s[0] + nn[1] * s[1] + nn[2] * s[2]);
    var up = L.ambI + L.keyI * Math.max(0, s[2]), a = rgb(L.amb), k = rgb(L.key), c = rgb(col);
    var hemi = 0.82 + 0.18 * clamp(nn[2], 0, 1);                                    // faces looking down get less sky
    return hex([0, 1, 2].map(function (i) { return c[i] * ((a[i] / 255) * L.ambI * hemi + (k[i] / 255) * L.keyI * d) / up * (L.glow > 0.9 ? 0.74 : 1); }));
  }
  // facet(col, tilt [tx, ty], tod) -> hex for a top face tilted a little (tx, ty in -1..1)
  function facet(col, tilt, tod) { return shade(col, [tilt[0], tilt[1], 1], tod); }

  /* ---------------- palette ---------------- */
  var palette = {
    ink: INK, paper: '#fffbf2',
    ui: {
      fill: 'rgba(255,252,244,0.80)', fillTo: 'rgba(250,244,232,0.86)', edge: 'rgba(255,255,255,0.95)', highlight: '#ffffff', shadow: 'rgba(40,46,90,0.26)',
      select: 'rgba(255,138,92,0.16)', well: 'rgba(51,57,90,0.07)', accent: CORAL, hairline: 'rgba(51,57,90,0.10)'
    },
    team: { a: '#5b8de0', b: '#e8705a', n: '#9aa3c0', aLight: '#d6e4ff', aDark: '#9fb9ee', bLight: '#ffd6cc', bDark: '#f0a898', aText: INK, bText: INK },
    overlay: {
      move: { fill: '#5a9cff', edge: '#2f63c8' }, attack: { fill: '#ff4a4a', edge: '#c8303a' },
      threat: { fill: '#9a6bff', edge: '#5a3ad0' }, heal: { fill: '#4cd68a', edge: '#228a55' },
      path: { core: '#ffffff', light: '#ffc6ad', mid: CORAL, dark: '#c95a36', outline: INK, spark: '#ffffff' },
      pathBad: { core: '#ffffff', light: '#d8dbe8', mid: '#a6acc6', dark: '#7c84a8', outline: INK, spark: '#ffffff' }
    },
    fx: { hot: CORAL, cold: '#6fb8ff', heal: '#4cc47a', crit: '#ffb43a', status: '#9a7cf0', white: '#ffffff', shard: '#fff1d6' },
    text: {
      main: INK, main2: INK, shadow: 'rgba(255,255,255,0.75)', outline: '#ffffff', dim: '#a6acc6', dim2: '#a6acc6', accent: CORAL, select: '#e8603a',
      title: INK, title2: INK, label: '#7c84a8', label2: '#7c84a8', gold: '#d07a2a', gold2: '#d07a2a', plate: INK, plateShadow: 'rgba(0,0,0,0)', pointer: CORAL, pointerEdge: '#c95a36'
    },
    // extruded numerals per kind: [face top, face bottom, side]
    numbers: {
      damage: ['#ffffff', '#ffeee4', '#e2694a'], crit: ['#fff6cf', '#ffc94a', '#de5a2c'], heal: ['#f2fff2', '#a6eab2', '#3c9a5a'],
      mp: ['#f0f7ff', '#b2d6ff', '#3f74d6'], miss: ['#ffffff', '#c8ccdc', '#7c84a8'], status: ['#f8f2ff', '#d2bfff', '#7a5cc4']
    },
    bars: {
      track: 'rgba(51,57,90,0.13)', charge: '#ffb43a', haste: '#5ccf86', slow: '#a78bff', ready: CORAL, queued: '#6fb8ff',
      enemy: '#ff8a6a', enemyFull: '#ff6a4a', hp: '#5cc97a', hpLow: CORAL
    },
    ground: { grass: '#9fcb7a', grass2: '#a9d383', soil: '#a06e46', sand: '#ecd9ae', stone: '#c9c2b6', water: '#64a6cf', waterDeep: '#4f86bd', shallow: '#93d9d2', leaf: '#5fa65a', pine: '#4f9a6a', wood: '#b9875a', skin: '#f2c49b' },
    light: TOD
  };

  /* ---------------- text ---------------- */
  function css(f, sc) { return (f.style || 'normal') + ' ' + (f.weight || 700) + ' ' + (f.size * (sc || 1)) + 'px ' + f.family; }
  function fontOf(skin, name) { return skin.fonts[name || 'ui'] || skin.fonts.ui; }
  function measureRaw(f, s, sc) { var g = scratch(); g.font = css(f, sc); if ('letterSpacing' in g) g.letterSpacing = (f.letterSpacing || 0) * (sc || 1) + 'px'; var w = g.measureText(s).width; if ('letterSpacing' in g) g.letterSpacing = '0px'; return w; }

  var skin = {
    id: 'lowpoly', name: 'Low-poly 3D', pixel: false,
    native: { w: 256, h: 224, scale: 'fit', smoothing: true, snap: 0, note: 'backing store = native x devicePixelRatio x k, setTransform(s); everything smooth; UI corner radii and type sizes are in native px' },
    palette: palette,
    fonts: {
      ui: { type: 'canvas', family: ROUND, size: 7, weight: 800, note: 'rounded sans 800, mixed case' },
      num: { type: 'canvas', family: ROUND, size: 12, weight: 900, note: 'extruded chunky digits; crit 1.35x' },
      word: { type: 'canvas', family: ROUND, size: 8, weight: 900, uppercase: true },
      label: { type: 'canvas', family: ROUND, size: 5, weight: 900, letterSpacing: 0.45, uppercase: true },
      title: { type: 'canvas', family: ROUND, size: 8.5, weight: 900 },
      plate: { type: 'canvas', family: ROUND, size: 6.5, weight: 800 },
      small: { type: 'canvas', family: ROUND, size: 5.5, weight: 800 },
      rules: { snap: false, smoothing: true, minSize: 5, uppercase: false, lineH: 12, note: 'numbers and labels the same size as body text or bigger; never pixel fonts' }
    },
    frameRoles: ['row', 'backing'],
    layout: { handW: 7, handH: 5, pointerGap: 5, rowFrame: true },
    shape: { radius: 5, edgeWidth: 0.6, padding: 5, plateRadius: 'half', barRadius: 'half', bevel: 2.2, glassBlur: 3 },
    overlayStyle: { mode: 'glass', pattern: 'pulsing', tint: 0.62, alpha: 0.18, inset: 0.6, bevel: 1.8, wall: 1.4, edgeAlpha: 0.9 },
    particles: { shape: 'shard', size: [1.5, 3.2], count: 1, snap: false, blend: 'source-over', glow: 0, gravity: 0.1, drag: 0.03, life: [400, 800], colors: ['fx.hot', 'fx.crit', 'fx.shard'], trail: 0, spin: true },
    outline: { text: { width: 0 }, number: { width: 0, extrude: 2.2, mode: 'extrude' }, sprite: { width: 0, mode: 'none' } },
    shadow: { text: null, window: { dx: 0, dy: 3, blur: 8 }, sprite: { kind: 'blob', alpha: 0.28 } },
    motion: { stepMs: 0, snap: false, ease: { move: 'inOutQuad', pop: 'pop', fade: 'outQuad' }, fadeSteps: null, shakeInt: false, flashMax: 0.25, squash: { x: 1.12, y: 0.86, ms: 90 } },

    measure: function (str, o) {
      o = o || {}; var f = fontOf(this, o.font), s = String(str); if (f.uppercase) s = s.toUpperCase();
      if (o.font === 'num') return layout(this, s, o).w;
      return measureRaw(f, s, o.scale);
    },
    // text(ctx, str, x, y, {font, color, shadow (false = none), align, scale, alpha}): letterpress white line under ink
    text: function (ctx, str, x, y, o) {
      o = o || {}; var f = fontOf(this, o.font), s = String(str), T = palette.text; if (f.uppercase) s = s.toUpperCase();
      var w = measureRaw(f, s, o.scale); if (o.align === 'center') x -= w / 2; else if (o.align === 'right') x -= w;
      var col = API.token(this, o.color) || T.main;
      ctx.save(); if (o.alpha != null) ctx.globalAlpha *= o.alpha;
      ctx.font = css(f, o.scale); ctx.textBaseline = 'top'; ctx.textAlign = 'left'; if ('letterSpacing' in ctx) ctx.letterSpacing = (f.letterSpacing || 0) * (o.scale || 1) + 'px';
      var top = y - (f.size * (o.scale || 1)) * 0.08;
      if (o.shadow !== false) { ctx.fillStyle = API.token(this, o.shadow) || T.shadow; ctx.fillText(s, x, top + 0.5); }
      if (o.outline) { ctx.lineJoin = 'round'; ctx.lineWidth = (o.outlineWidth || 1) * 2; ctx.strokeStyle = API.token(this, o.outline); ctx.strokeText(s, x, top); }
      ctx.fillStyle = col; ctx.fillText(s, x, top);
      ctx.restore(); return w;
    },

    // frame(ctx, rect, {role, team, focus, alert, disabled, alpha}) -> inner rect
    frame: function (ctx, r, st) {
      st = st || {}; var role = st.role || 'window', U = palette.ui, x = r.x, y = r.y, w = r.w, h = r.h, k = devScale(ctx);
      if (role === 'row' || role === 'backing') return band(ctx, r, st);
      var pad = role === 'plate' ? { x: 6, y: 3 } : role === 'banner' ? { x: 12, y: 4 } : { x: 5, y: 5 };
      var inner = { x: x + pad.x, y: y + pad.y, w: w - 2 * pad.x, h: h - 2 * pad.y };
      if (w < 2 || h < 2) return inner;
      var rad = role === 'plate' || role === 'banner' ? h / 2 : role === 'tooltip' ? 3 : 5;
      ctx.save(); if (st.alpha != null) ctx.globalAlpha *= st.alpha; if (st.disabled) ctx.globalAlpha *= 0.6;
      var S = this.shadow.window;
      ctx.save(); ctx.shadowColor = 'rgba(40,46,90,0.30)'; ctx.shadowBlur = S.blur * k; ctx.shadowOffsetY = S.dy * k; ctx.fillStyle = 'rgba(255,251,242,0.5)'; rr(ctx, x, y, w, h, rad); ctx.fill(); ctx.restore();
      frost(ctx, x, y, w, h, rad, this.shape.glassBlur);
      var gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, st.alert ? 'rgba(255,241,232,0.88)' : U.fill); gr.addColorStop(1, st.alert ? 'rgba(255,230,216,0.92)' : U.fillTo);
      ctx.fillStyle = gr; rr(ctx, x, y, w, h, rad); ctx.fill();
      // two big glass facets (the low-poly sheen)
      ctx.save(); rr(ctx, x, y, w, h, rad); ctx.clip();
      poly(ctx, [[x, y], [x + w * 0.66, y], [x, y + h * 0.92]], 'rgba(255,255,255,0.26)');
      poly(ctx, [[x + w, y + h], [x + w * 0.42, y + h], [x + w, y + h * 0.25]], 'rgba(51,57,90,0.035)');
      // team stripe: a small faceted bar on the left
      if (st.team === 'a' || st.team === 'b') {
        var tc = palette.team[st.team], sx = x + 2.2, sy = y + Math.min(6, h * 0.2), sh = h - 2 * Math.min(6, h * 0.2);
        rr(ctx, sx, sy, 1.8, sh, 0.9); ctx.fillStyle = tc; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(sx, sy + 0.6, 0.8, sh - 1.2);
      }
      ctx.restore();
      ctx.lineWidth = 0.6; ctx.strokeStyle = U.edge; rr(ctx, x + 0.8, y + 0.8, w - 1.6, h - 1.6, Math.max(0.5, rad - 0.8)); ctx.stroke();
      ctx.lineWidth = 0.4; ctx.strokeStyle = U.hairline; rr(ctx, x + 0.2, y + 0.2, w - 0.4, h - 0.4, rad); ctx.stroke();
      if (st.focus || st.alert) { ctx.lineWidth = 1; ctx.strokeStyle = CORAL; rr(ctx, x - 0.8, y - 0.8, w + 1.6, h + 1.6, rad + 0.8); ctx.stroke(); }
      if (role === 'banner') [[x + 6, y + h / 2], [x + w - 6, y + h / 2]].forEach(function (p) { gem(ctx, p[0], p[1], 2.4, 3, CORAL); });
      ctx.restore();
      return inner;
    },

    // number(ctx, str, x, y, {kind, scale, big, suffix, label, labelGap, align, baseline, alpha, glyphOffset}): extruded chunky digits.
    // Digits are one glyph each; a word (MISS), the suffix (MP) and the label (CRITICAL capsule) are each drawn as one block:
    // glyphOffset is still called for every canonical item, the block takes its first item's offset, the largest alpha, any flash.
    number: function (ctx, str, x, y, o) {
      o = o || {}; var self = this, s = String(str), L = layout(this, s, o), kind = o.kind || 'damage', N = palette.numbers, C = N[kind === 'critical' ? 'crit' : kind] || N.damage, k = devScale(ctx);
      var x0 = o.align === 'center' ? x - L.w / 2 : x, y0 = o.baseline === 'bottom' ? y - L.h : y, out = [], pa = ctx.globalAlpha;
      var CI = API.glyphItems(s, o), offs = CI.map(function (it, i) { return (o.glyphOffset && o.glyphOffset(i, it)) || {}; });
      // map layout parts to canonical indices
      var parts = [], isNum = L.items.length && L.items[0].font === 'num', mainN = s.length, sufN = o.suffix ? String(o.suffix).length : 0;
      L.items.forEach(function (it) {
        if (it.font === 'num') parts.push({ it: it, idx: [it.ci] });
        else if (it.font === 'suffix') parts.push({ it: it, idx: range(mainN, sufN) });
        else parts.push({ it: it, idx: range(0, mainN) });
      });
      L.labelItems.forEach(function (it) { parts.push({ it: it, idx: range(mainN + sufN, String(o.label).length) }); });
      function range(a, n) { var r = []; for (var i = 0; i < n; i++) r.push(a + i); return r; }
      var plan = parts.map(function (p) {
        var live = p.idx.filter(function (i) { return !offs[i].skip; }); if (!live.length) return null;
        var d = offs[live[0]], a = 0, fl = false; live.forEach(function (i) { var q = offs[i]; a = Math.max(a, q.alpha != null ? q.alpha : o.alpha != null ? o.alpha : 1); fl = fl || !!q.flash; });
        return { it: p.it, i: live[0], d: d, gx: x0 + p.it.x + (d.dx || 0), gy: y0 + p.it.y + (d.dy || 0), a: a, flash: fl, sx: d.sx || 1, sy: d.sy || 1 };
      }).filter(Boolean);
      var depth = this.outline.number.extrude * (L.s || 1), ex = 0.42, ey = 1;
      var squash = function (g, p) { if (p.sx === 1 && p.sy === 1) return; var cx = p.gx + p.it.w / 2, by = p.gy + p.it.h; g.translate(cx, by); g.scale(p.sx, p.sy); g.translate(-cx, -by); };
      plan.forEach(function (p) {
        var lab = !!p.it.lab, bw = lab ? p.it.w + 8 : p.it.w, bh = lab ? self.fonts.label.size + 3.2 : p.it.h;
        API.fadeLayer(ctx, p.a, { x: p.gx - 6, y: p.gy - 6, w: bw + depth + 14, h: bh + depth + 14 }, function (g) {
          g.save(); squash(g, p); g.textBaseline = 'top'; g.textAlign = 'left';
          if (lab) {   // coral capsule with a darker extruded lip, a light facet and white label type
            var f = self.fonts.label, bx = p.gx - 4, by = p.gy - 1.6;
            rr(g, bx, by + 1.1, bw, bh, bh / 2); g.fillStyle = mix(C[2], INK, 0.25); g.fill();
            rr(g, bx, by, bw, bh, bh / 2); g.fillStyle = p.flash ? '#ffffff' : C[2]; g.fill();
            poly(g, [[bx + bh / 2, by], [bx + bw - bh / 2, by], [bx + bw * 0.6, by + bh * 0.5], [bx + bh / 2, by + bh * 0.5]], 'rgba(255,255,255,0.22)');
            g.font = css(f); if ('letterSpacing' in g) g.letterSpacing = f.letterSpacing + 'px'; g.fillStyle = p.flash ? C[2] : '#ffffff'; g.fillText(p.it.ch, p.gx, p.gy); if ('letterSpacing' in g) g.letterSpacing = '0px';
            out.push({ i: p.i, x: bx, y: by, w: bw, h: bh, ch: p.it.ch });
          } else {
            g.font = css(p.it.f, p.it.s); var side = p.flash ? '#ffe2d6' : C[2], dd = p.it.font === 'num' ? depth : depth * 0.7, h = p.it.h;
            g.save(); g.globalAlpha = 0.3; API.setShadow ? API.setShadow(g, INK, 2.5, 0, 0) : (g.shadowColor = INK, g.shadowBlur = 2.5 * k); g.fillStyle = INK; g.fillText(p.it.ch, p.gx + dd * ex + 0.8, p.gy + dd * ey + 1.6); g.restore();
            for (var q = dd; q > 0.01; q -= 0.25) { g.fillStyle = mix(side, INK, 0.28 * q / dd); g.fillText(p.it.ch, p.gx + q * ex, p.gy + q * ey); }
            g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillText(p.it.ch, p.gx - 0.35, p.gy - 0.35);
            var gr = g.createLinearGradient(0, p.gy + h * 0.15, 0, p.gy + h * 0.95), top = p.flash ? '#ffffff' : C[0], bot = p.flash ? '#fff8f0' : C[1];
            gr.addColorStop(0, top); gr.addColorStop(0.55, top); gr.addColorStop(0.56, bot); gr.addColorStop(1, bot);
            g.fillStyle = gr; g.fillText(p.it.ch, p.gx, p.gy);
            out.push({ i: p.i, x: p.gx, y: p.gy, w: p.it.w, h: h, ch: p.it.ch });
          }
          g.restore();
        });
      });
      ctx.globalAlpha = pa; out.sort(function (a, b) { return a.i - b.i; }); return out;
    },
    // overlay(ctx, tileRect, kind, tSeconds, {grow, pattern, tile, edges, seams}): bevelled translucent slab per cell
    overlay: function (ctx, r, kind, t, o) {
      // tinted glass laid on the ground: the cells of a set join into one slab; the bevel, side wall and rim exist only on the
      // set's outer boundary. 'color' compositing keeps the ground's facets visible through the tint.
      o = o || {}; var C = palette.overlay[kind] || palette.overlay.move, S = this.overlayStyle, gr = o.grow == null ? 1 : o.grow;
      if (!(gr > 0)) return;
      var tx = o.tile ? o.tile.x : 0, ty = o.tile ? o.tile.y : 0, pat = o.pattern || S.pattern, pulse = 0, a = Math.min(1, gr * 1.5);
      if (pat === 'pulsing') pulse = Math.max(0, Math.sin((tx + ty) * 0.55 - t * 3.2));
      if (pat === 'checker') a *= (tx + ty) % 2 ? 1 : 0.75;
      var E = o.edges || {}, i = S.inset, b = S.bevel, base = C.fill, pa = ctx.globalAlpha;
      var x = r.x + (E.left ? i : 0), y = r.y + (E.top ? i : 0), x2 = r.x + r.w - (E.right ? i : 0), y2 = r.y + r.h - (E.bottom ? i : 0), w = x2 - x, h = y2 - y;
      ctx.save();
      ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = pa * a * S.tint; ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = pa * a * S.alpha; ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
      // glass sheen: one light facet per cell, alternating direction, brighter on the pulse
      ctx.globalAlpha = pa * a * (0.10 + pulse * 0.12); var f = (tx + ty) % 2;
      poly(ctx, f ? [[x, y], [x2, y], [x, y2]] : [[x, y], [x2, y], [x2, y2]], '#ffffff');
      // bevel faces on the outer boundary only (light from the upper left)
      ctx.globalAlpha = pa * a * 0.75;
      if (E.top) poly(ctx, [[x, y], [x2, y], [x2 - (E.right ? b : 0), y + b], [x + (E.left ? b : 0), y + b]], mix(base, '#ffffff', 0.55));
      if (E.left) poly(ctx, [[x, y], [x + b, y + (E.top ? b : 0)], [x + b, y2 - (E.bottom ? b : 0)], [x, y2]], mix(base, '#ffffff', 0.32));
      if (E.right) poly(ctx, [[x2, y], [x2, y2], [x2 - b, y2 - (E.bottom ? b : 0)], [x2 - b, y + (E.top ? b : 0)]], mix(base, INK, 0.12));
      if (E.bottom) { poly(ctx, [[x, y2], [x + (E.left ? b : 0), y2 - b], [x2 - (E.right ? b : 0), y2 - b], [x2, y2]], mix(base, INK, 0.25)); poly(ctx, [[x, y2], [x2, y2], [x2, y2 + S.wall], [x, y2 + S.wall]], mix(base, INK, 0.45)); }
      ctx.globalAlpha = pa * a * S.edgeAlpha; ctx.fillStyle = C.edge; var e = 0.7;
      if (E.top) ctx.fillRect(x, y, w, e); if (E.bottom) ctx.fillRect(x, y2 - e, w, e); if (E.left) ctx.fillRect(x, y, e, h); if (E.right) ctx.fillRect(x2 - e, y, e, h);
      ctx.restore();
    },
    // bar(ctx, rect, frac, kind, {style, tag, px, t}): faceted capsule
    bar: function (ctx, r, frac, kind, o) {
      o = o || {}; var B = palette.bars, x = r.x, y = r.y, w = r.w, h = r.h, f = clamp(frac || 0, 0, 1);
      ctx.save();
      rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = B.track; ctx.fill();
      ctx.fillStyle = 'rgba(51,57,90,0.10)'; rr(ctx, x, y, w, h * 0.45, h * 0.22); ctx.fill();
      if (!kind) { ctx.fillStyle = 'rgba(51,57,90,0.28)'; for (var q = x + h; q < x + w - h / 2; q += 3.2) { ctx.beginPath(); ctx.arc(q, y + h / 2, 0.45, 0, 7); ctx.fill(); } ctx.restore(); return; }
      var col = B[kind] || B.charge, fw = o.px != null ? Math.min(w, o.px) : Math.max(h, f * w);
      if (f > 0 || o.px) {
        ctx.save(); rr(ctx, x, y, fw, h, h / 2); ctx.clip();
        ctx.fillStyle = mix(col, INK, 0.1); ctx.fillRect(x, y, fw, h);
        ctx.fillStyle = mix(col, '#ffffff', 0.28); ctx.fillRect(x, y, fw, h * 0.5);
        poly(ctx, [[x + fw - h * 0.2, y], [x + fw, y], [x + fw, y + h], [x + fw - h * 0.9, y + h]], 'rgba(255,255,255,0.25)');
        if (kind === 'ready' || kind === 'enemyFull') { ctx.globalAlpha = 0.2 + 0.25 * Math.sin((o.t || 0) * 9); ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, fw, h); }
        ctx.restore();
      }
      if (o.tag && B[o.tag]) { ctx.beginPath(); ctx.arc(x + h * 0.55, y + h / 2, h * 0.85, 0, 7); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.beginPath(); ctx.arc(x + h * 0.55, y + h / 2, h * 0.58, 0, 7); ctx.fillStyle = B[o.tag]; ctx.fill(); }
      ctx.restore();
    },

    // cursor(ctx, rect, 'bracket' | 'hand', tSeconds, {alpha, invalid})
    cursor: function (ctx, r, kind, t, o) {
      o = o || {}; var col = o.invalid ? '#d9573e' : CORAL, k = devScale(ctx); t = t || 0;
      ctx.save(); if (o.alpha != null) ctx.globalAlpha *= o.alpha;
      if (kind === 'hand') {   // faceted coral arrow pointing right
        var X = r.x + r.w + Math.sin(t * 6) * 0.6, Y = r.y + r.h / 2, hw = r.w + 1, hh = r.h / 2 + 1;
        ctx.save(); ctx.shadowColor = 'rgba(40,46,90,0.35)'; ctx.shadowBlur = 2 * k; ctx.shadowOffsetY = 1 * k;
        poly(ctx, [[X, Y], [X - hw, Y - hh], [X - hw * 0.7, Y], [X - hw, Y + hh]], col); ctx.restore();
        poly(ctx, [[X, Y], [X - hw, Y - hh], [X - hw * 0.7, Y]], mix(col, '#ffffff', 0.35));
        poly(ctx, [[X, Y], [X - hw * 0.7, Y], [X - hw, Y + hh]], mix(col, INK, 0.18));
        ctx.restore(); return;
      }
      var b = Math.sin(t * 5) * 0.5, x = r.x - b, y = r.y - b, w = r.w + 2 * b, h = r.h + 2 * b, L = w * 0.34;
      ctx.save(); ctx.shadowColor = 'rgba(40,46,90,0.35)'; ctx.shadowBlur = 3 * k; ctx.shadowOffsetY = 1.2 * k;
      ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; rr(ctx, x + 0.6, y + 0.6, w - 1.2, h - 1.2, 3); ctx.stroke(); ctx.restore();
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col;
      [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(function (c) { ctx.beginPath(); ctx.moveTo(c[0] + c[2] * L, c[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + c[3] * L); ctx.stroke(); });
      // floating faceted gem above the tile + its shadow on the tile
      var bob = Math.sin(t * 3.2) * 1.2, gx = r.x + r.w / 2, gy = r.y - 6 + bob;
      ctx.fillStyle = 'rgba(40,46,90,' + (0.18 - bob * 0.03) + ')'; ctx.beginPath(); ctx.ellipse(gx, r.y + r.h * 0.5, 3.4 - bob * 0.3, 1.3, 0, 0, 7); ctx.fill();
      gem(ctx, gx, gy, 3.2, 4.4, col);
      ctx.restore();
    }
  };

  // unframed roles: 'row' = selected menu row (a rounded coral-tinted pill with a light top facet); 'backing' = a soft inset well
  function band(ctx, r, st) {
    var x = r.x, y = r.y, w = r.w, h = r.h; if (w <= 0 || h <= 0) return { x: x, y: y, w: w, h: h };
    ctx.save(); if (st.alpha != null) ctx.globalAlpha *= st.alpha; if (st.disabled) ctx.globalAlpha *= 0.5;
    if (st.role === 'row') {
      rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = 'rgba(255,138,92,0.20)'; ctx.fill();
      ctx.save(); rr(ctx, x, y, w, h, h / 2); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y, w, h * 0.45); ctx.restore();
      ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(255,138,92,0.55)'; rr(ctx, x + 0.25, y + 0.25, w - 0.5, h - 0.5, h / 2); ctx.stroke();
    } else {
      rr(ctx, x, y, w, h, Math.min(4, h / 2)); ctx.fillStyle = 'rgba(51,57,90,0.08)'; ctx.fill();
      ctx.save(); rr(ctx, x, y, w, h, Math.min(4, h / 2)); ctx.clip(); ctx.fillStyle = 'rgba(51,57,90,0.07)'; ctx.fillRect(x, y, w, 1.2); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x, y + h - 0.6, w, 0.6); ctx.restore();
    }
    ctx.restore(); return { x: x, y: y, w: w, h: h };
  }

  // octahedron gem seen from the front: four facets (light from the upper left)
  function gem(ctx, x, y, rx, ry, col) {
    poly(ctx, [[x, y - ry], [x - rx, y], [x, y + 0.6]], mix(col, '#ffffff', 0.5));
    poly(ctx, [[x, y - ry], [x + rx, y], [x, y + 0.6]], mix(col, '#ffffff', 0.12));
    poly(ctx, [[x - rx, y], [x, y + 0.6], [x, y + ry]], mix(col, INK, 0.08));
    poly(ctx, [[x + rx, y], [x, y + 0.6], [x, y + ry]], mix(col, INK, 0.3));
  }

  /* ---------------- numerals layout ---------------- */
  function layout(sk, text, o) {
    o = o || {}; var s = o.scale || 1, b = o.big ? s * 1.35 : s, items = [], x = 0, i, f, w, fn = sk.fonts.num, fw = sk.fonts.word;
    text = String(text);
    if (/^[0-9+]+$/.test(text)) {
      for (i = 0; i < text.length; i++) { w = measureRaw(fn, text[i], b) - 0.4 * b; items.push({ font: 'num', f: fn, s: b, ch: text[i], ci: i, x: x, w: w, h: fn.size * b }); x += w; }
      if (o.suffix) { x += 1.5 * s; var sf = { family: fn.family, size: 7, weight: 900 }, sw = measureRaw(sf, o.suffix, s); items.push({ font: 'suffix', f: sf, s: s, ch: String(o.suffix), x: x, w: sw, h: 7 * s }); x += sw; }
    } else {
      var up = text.toUpperCase(); w = measureRaw(fw, up, s); items.push({ font: 'word', f: fw, s: s, ch: up, x: 0, w: w, h: fw.size * s }); x = w;
    }
    var h = 0; items.forEach(function (it) { h = Math.max(h, it.h); }); items.forEach(function (it) { it.y = (h - it.h) * 0.92; });
    var labelItems = [];
    if (o.label) { var lf = sk.fonts.label, lab = String(o.label).toUpperCase(), lw = measureRaw(lf, lab); labelItems.push({ font: 'label', ch: lab, x: (x - lw) / 2, y: -lf.size - (o.labelGap == null ? 4 : o.labelGap) - 2, w: lw, h: lf.size, lab: 1 }); }
    return { items: items, labelItems: labelItems, w: x, h: h, s: b };
  }

  /* ---------------- optional extras ---------------- */
  // path(ctx, points [{x, y}] tile centres, tSeconds, {width}): extruded coral ribbon, faceted arrowhead, travelling beads
  skin.path = function (ctx, pts, t, o) {
    o = o || {}; if (!pts || pts.length < 2) return;
    if (o.alpha != null && o.alpha < 1) { var o2 = {}, q0; for (q0 in o) o2[q0] = o[q0]; o2.alpha = 1; var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
      API.fadeLayer(ctx, o.alpha, { x: Math.min.apply(null, xs) - 12, y: Math.min.apply(null, ys) - 12, w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + 24, h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + 26 }, function (g) { skin.path(g, pts, t, o2); }); return; }
    var P = o.invalid ? palette.overlay.pathBad : palette.overlay.path, k = devScale(ctx), wd = o.width || (o.tile || 16) * 0.25, wall = 1.5;
    var n = pts.length, a = pts[n - 2], z = pts[n - 1], ang = Math.atan2(z.y - a.y, z.x - a.x), hl = 7, cut = hl * 0.75;
    var end = { x: z.x - Math.cos(ang) * cut, y: z.y - Math.sin(ang) * cut }, ca = Math.cos(ang), sa = Math.sin(ang);
    var line = function (dx, dy) { ctx.beginPath(); ctx.moveTo(pts[0].x + dx, pts[0].y + dy); for (var i = 1; i < n - 1; i++) ctx.lineTo(pts[i].x + dx, pts[i].y + dy); ctx.lineTo(end.x + dx, end.y + dy); };
    var tip = [z.x + ca * 1.5, z.y + sa * 1.5], bl = [z.x - ca * hl + (-sa) * 5, z.y - sa * hl + ca * 5], br = [z.x - ca * hl - (-sa) * 5, z.y - sa * hl - ca * 5], mid = [z.x - ca * hl * 0.55, z.y - sa * hl * 0.55];
    var head = function (dx, dy, col) { poly(ctx, [[tip[0] + dx, tip[1] + dy], [bl[0] + dx, bl[1] + dy], [mid[0] + dx, mid[1] + dy], [br[0] + dx, br[1] + dy]], col); };
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.save(); ctx.shadowColor = 'rgba(40,46,90,0.4)'; ctx.shadowBlur = 3 * k; ctx.strokeStyle = 'rgba(40,46,90,0.22)'; ctx.lineWidth = wd + 1; line(0.8, wall + 1.6); ctx.stroke(); head(0.8, wall + 1.6, 'rgba(40,46,90,0.22)'); ctx.restore();
    ctx.strokeStyle = P.dark; ctx.lineWidth = wd; line(0, wall); ctx.stroke(); head(0, wall, P.dark);
    ctx.strokeStyle = P.mid; ctx.lineWidth = wd; line(0, 0); ctx.stroke();
    ctx.strokeStyle = P.light; ctx.lineWidth = wd * 0.32; line(0, -wd * 0.22); ctx.stroke();
    // faceted head: two triangles either side of the spine
    var light = (-sa) * -0.42 + ca * -0.62 > 0;   // which side faces the sun (upper left)
    poly(ctx, [tip, bl, mid], light ? mix(P.mid, '#ffffff', 0.35) : mix(P.mid, INK, 0.12));
    poly(ctx, [tip, br, mid], light ? mix(P.mid, INK, 0.12) : mix(P.mid, '#ffffff', 0.35));
    // start pad: a low hexagonal disc
    var hx = pts[0].x, hy = pts[0].y, hr = 3.2, H = []; for (var q = 0; q < 6; q++) H.push([hx + Math.cos(q * Math.PI / 3) * hr, hy + Math.sin(q * Math.PI / 3) * hr * 0.75]);
    poly(ctx, H.map(function (p) { return [p[0], p[1] + 1.2]; }), P.dark); poly(ctx, H, P.mid); poly(ctx, [H[3], H[4], H[5], [hx, hy]], mix(P.mid, '#ffffff', 0.35));
    // travelling beads
    ctx.setLineDash([0.01, 6]); ctx.lineDashOffset = -(t || 0) * 14; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.5; line(0, -0.2); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  };

  /* ---------------- scene hooks: tile, token, atmosphere ---------------- */
  function hsh(a, b, c) { var n = (a * 374761393 + (b || 0) * 668265263 + (c || 0) * 2147483647) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
  // facets share edges: fill and stroke each in its own colour so no hairline cracks show
  function tri(g, a, b, c, col) { g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 0.35; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.closePath(); g.fill(); g.stroke(); }
  function sh(col, nx, ny, nz) { return shade(col, [nx, ny, nz == null ? 1 : nz]); }
  var G = palette.ground;
  palette.terrain = { grass: G.grass, forest: '#86b866', water: G.water, hill: '#b8c98a', mountain: G.stone, road: G.sand, bridge: G.wood, fort: '#d8d2c6', sand: G.sand, wall: '#c8a088', floor: '#d6cfc2' };
  // tile(ctx, rect, kind, t): two tilted triangles + a bevelled lip per cell (one flat colour per facet); water glints facet by facet
  skin.tile = function (g, r, kind, t) {
    var X = r.x, Y = r.y, w = r.w, h = r.h, tx = Math.round(X / 16), ty = Math.round(Y / 16), h1 = hsh(tx, ty, 1), h2 = hsh(tx, ty, 2), flip = hsh(tx, ty, 3) < 0.5;
    // corners are jittered by their own world position, so neighbouring cells share them and the floor is one continuous mesh
    var J = function (cx, cy) { return kind === 'water' ? [cx, cy] : [cx + (hsh(cx, cy, 71) - 0.5) * w * 0.32, cy + (hsh(cx, cy, 72) - 0.5) * h * 0.32]; };
    var A = J(X, Y), B = J(X + w, Y), C = J(X + w, Y + h), D = J(X, Y + h), M = [X + w / 2 + (h1 - 0.5) * w / 3, Y + h / 2 + (h2 - 0.5) * h / 3];
    g.save(); g.lineJoin = 'round';
    if (kind === 'water') {
      [[A, B], [B, C], [C, D], [D, A]].forEach(function (e, i) { var c = mix(G.water, G.waterDeep, 0.25 + hsh(tx, ty, 10 + i) * 0.4), q = (t || 0);
        tri(g, e[0], e[1], M, sh(c, Math.sin(q * 1.3 + tx * 1.7 + ty * 2.3 + i * 1.9) * 0.45, Math.cos(q * 1.1 + ty * 2.1 + i * 2.7) * 0.45, 1)); });
      g.restore(); return;
    }
    var base = kind === 'road' || kind === 'sand' || kind === 'bridge' ? mix(G.sand, '#e4cd9c', h1 * 0.5) : kind === 'mountain' || kind === 'fort' || kind === 'floor' ? mix(G.stone, '#bdb4a6', h1) : kind === 'wall' ? mix('#c8a088', '#b08870', h1) : kind === 'hill' ? mix('#b8c98a', '#a8bd78', h1) : kind === 'forest' ? mix(G.grass, '#86b866', 0.55 + h1 * 0.3) : (h1 < 0.5 ? G.grass : G.grass2);
    // four facets around a jittered centre, each tilted by a smooth world-space swell plus a little noise
    var swell = function (px, py) { return [Math.sin(px * 0.045 + 1.3) * 0.16 + Math.sin(py * 0.07) * 0.06, Math.cos(py * 0.05 + 0.4) * 0.16 + Math.sin(px * 0.06) * 0.05]; };
    [[A, B], [B, C], [C, D], [D, A]].forEach(function (e, q) {
      var mx = (e[0][0] + e[1][0] + M[0]) / 3, my = (e[0][1] + e[1][1] + M[1]) / 3, sw = swell(mx, my), n = hsh(tx, ty, 80 + q) - 0.5;
      tri(g, e[0], e[1], M, sh(base, sw[0] + n * 0.16, sw[1] + (hsh(tx, ty, 90 + q) - 0.5) * 0.16));
    });
    if ((kind === 'grass' || kind === 'forest') && hsh(tx, ty, 8) < (kind === 'forest' ? 0.9 : 0.55)) for (var k2 = 0; k2 < (kind === 'forest' ? 3 : 2); k2++) {
      var gx = X + 2 + hsh(tx, ty, 50 + k2) * (w - 5), gy = Y + 4 + hsh(tx, ty, 60 + k2) * (h - 7), tc = mix(base, '#4f8a40', 0.5);
      tri(g, [gx, gy], [gx + 1.4, gy - 3.2], [gx + 2.6, gy], sh(tc, -0.6, -0.3, 0.7)); tri(g, [gx + 1.4, gy - 3.2], [gx + 2.6, gy], [gx + 3.6, gy - 1.8], sh(tc, 0.6, -0.2, 0.6));
    }
    if ((kind === 'road' || kind === 'sand') && hsh(tx, ty, 7) < 0.8) for (var i = 0; i < 3; i++) { var px = X + 2 + hsh(tx, ty, 20 + i) * (w - 4), py = Y + 2 + hsh(tx, ty, 30 + i) * (h - 4); poly(g, [[px, py], [px + 1.6, py + 0.4], [px + 0.6, py + 1.3]], sh('#d6be8c', -0.5, -0.5)); }
    if (kind === 'bridge') { g.fillStyle = sh(G.soil, 0, 1, 0.3); g.fillRect(X, Y, w, h); for (var pl = 0; pl < 5; pl++) { var py2 = Y + 0.6 + pl * h / 5.2, wc = mix(G.wood, '#a87a50', hsh(pl, tx, 9)); poly(g, [[X - 0.5, py2], [X + w + 0.5, py2], [X + w + 0.5, py2 + h * 0.14], [X - 0.5, py2 + h * 0.14]], sh(wc, 0, -0.1)); g.fillStyle = sh(wc, 0, 1, 0.3); g.fillRect(X - 0.5, py2 + h * 0.14, w + 1, 0.7); } }
    if (kind === 'hill') { var c0 = [X + w * 0.45, Y + h * 0.3], ring = [[X + 2, Y + h - 2], [X + w * 0.2, Y + h * 0.45], [X + w * 0.8, Y + h * 0.4], [X + w - 2, Y + h - 2]]; tri(g, ring[0], ring[1], c0, sh(base, -0.8, 0, 0.6)); tri(g, ring[1], ring[2], c0, sh(base, 0, -0.9, 0.6)); tri(g, ring[2], ring[3], c0, sh(base, 0.8, 0, 0.5)); tri(g, ring[3], ring[0], c0, sh(base, 0, 0.8, 0.5)); }
    if (kind === 'mountain') { var pk = [X + w * 0.5, Y + 1.5]; tri(g, [X + 1.5, Y + h - 1.5], pk, [X + w * 0.5, Y + h - 1.5], sh(G.stone, -0.8, -0.1, 0.5)); tri(g, [X + w * 0.5, Y + h - 1.5], pk, [X + w - 1.5, Y + h - 1.5], sh(G.stone, 0.8, -0.1, 0.4)); tri(g, [X + w * 0.38, Y + h * 0.35], pk, [X + w * 0.6, Y + h * 0.38], '#f6f4ef'); }
    if (kind === 'fort' || kind === 'wall') { for (var f = 0; f < 4; f++) { var fx0 = X + f * w / 4, j = (hsh(tx, f, 40) - 0.5) * 1.2; poly(g, [[fx0, Y + h * 0.7 + j], [fx0 + w / 4, Y + h * 0.7 - j], [fx0 + w / 4, Y + h], [fx0, Y + h]], sh(mix(base, G.soil, 0.35), f % 2 ? 0.4 : -0.4, 1, 0.15)); } }
    g.restore();
  };
  // token(ctx, rect, unit, t): a flat-shaded toy pawn standing on the bottom of rect (hexagon base in team colour, faceted body and
  //   head, headgear and prop by kind). unit = {team, kind: knight|mage|fighter|archer|monster, selected, dead, facing, id}
  skin.unitToken = function (g, r, u, t) {
    u = u || {}; t = t || 0; var team = palette.team[u.team] || palette.team.a, kind = u.kind || 'fighter', x = r.x + r.w / 2, y = r.y + r.h - 2.5;
    var body = { knight: team, mage: mix(team, '#ffffff', 0.25), fighter: mix(team, '#8a5a40', 0.3), archer: mix(team, '#5a8a50', 0.35), monster: mix(team, '#6fdc9a', 0.25) }[kind] || team;
    var head = { knight: '#d8dce8', mage: mix(team, INK, 0.25), fighter: '#8a5a40', archer: '#5a7a48' }[kind];
    var br = Math.sin(t * 2 + (u.id ? String(u.id).length : 0)) * 0.25, bob = u.selected ? Math.abs(Math.sin(t * 5)) * 1.2 : 0, L = TOD[CUR.tod] || TOD.day, sx = -L.sun[0] * 3.2, sy = -L.sun[1] * 1.6 + 0.6;
    g.save(); if (u.dead) g.globalAlpha *= 0.35; g.lineJoin = 'round';
    g.fillStyle = 'rgba(40,46,90,0.42)'; g.beginPath(); g.ellipse(x + sx, y + sy, 6.6, 2.5, 0, 0, 7); g.fill();
    if (u.facing === -1) { g.translate(x * 2, 0); g.scale(-1, 1); }
    var H = [], q; for (q = 0; q < 6; q++) H.push([x + Math.cos(q * Math.PI / 3 + 0.5) * 5.6, y - 1 + Math.sin(q * Math.PI / 3 + 0.5) * 2.4]);
    poly(g, H.map(function (p) { return [p[0], p[1] + 1.4]; }), sh(team, 0, 1, 0.3));
    for (q = 0; q < 6; q++) tri(g, [x, y - 1], H[q], H[(q + 1) % 6], sh(mix(team, '#ffffff', 0.25), Math.cos(q * Math.PI / 3 + 1.0) * 0.4, Math.sin(q * Math.PI / 3 + 1.0) * 0.4, 1));
    y -= bob;
    if (kind === 'monster') {   // a faceted beast: a big low gem body, two horns, glowing eyes
      var cy = y - 6.5, ring = []; for (q = 0; q < 7; q++) { var a0 = q / 7 * Math.PI * 2; ring.push([x + Math.cos(a0) * 6.2, cy + Math.sin(a0) * 5]); }
      for (q = 0; q < 7; q++) { var p0 = ring[q], p1 = ring[(q + 1) % 7], mx = (p0[0] + p1[0]) / 2 - x, my = (p0[1] + p1[1]) / 2 - cy, l = Math.hypot(mx, my) || 1; tri(g, [x - 1, cy - 1.5], p0, p1, sh(body, mx / l * 0.9, my / l * 0.9, 0.7)); }
      tri(g, [x - 4, cy - 3.6], [x - 2.4, cy - 4.4], [x - 4.6, cy - 8.4], '#f6f4ef'); tri(g, [x + 4, cy - 3.6], [x + 2.4, cy - 4.4], [x + 4.6, cy - 8.4], '#e6e0d6');
      g.fillStyle = '#fff3a0'; g.fillRect(x - 2.6, cy - 1.4, 1.2, 1); g.fillRect(x + 1.4, cy - 1.4, 1.2, 1);
      g.restore(); return;
    }
    var b0 = y - 1.5, b1 = y - 11 + br, bw = kind === 'mage' ? 4.6 : 4, tw = 2.6;
    poly(g, [[x - bw, b0], [x - bw * 0.3, b0 + 0.6], [x - tw * 0.3, b1], [x - tw, b1]], sh(body, -0.85, 0, 0.5));
    poly(g, [[x - bw * 0.3, b0 + 0.6], [x + bw * 0.35, b0 + 0.6], [x + tw * 0.35, b1], [x - tw * 0.3, b1]], sh(body, -0.1, 0.4, 0.8));
    poly(g, [[x + bw * 0.35, b0 + 0.6], [x + bw, b0], [x + tw, b1], [x + tw * 0.35, b1]], sh(body, 0.9, 0.1, 0.4));
    poly(g, [[x - bw * 0.82, b0 - 3.4], [x + bw * 0.82, b0 - 3.4], [x + bw * 0.8, b0 - 2.4], [x - bw * 0.8, b0 - 2.4]], sh('#ffc94a', 0, 0.3, 0.8));
    var hx = x, hy = b1 - 3.2, hr = 3.3, R = []; for (q = 0; q < 6; q++) R.push([hx + Math.cos(q * Math.PI / 3) * hr, hy + Math.sin(q * Math.PI / 3) * hr]);
    for (q = 0; q < 6; q++) { var a = (q + 0.5) * Math.PI / 3; tri(g, [hx - 0.5, hy - 0.5], R[q], R[(q + 1) % 6], sh(G.skin, Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0.7)); }
    g.fillStyle = INK; g.fillRect(hx - 1.5, hy - 0.2, 0.8, 0.9); g.fillRect(hx + 0.7, hy - 0.2, 0.8, 0.9);
    if (kind === 'knight') {
      poly(g, [[hx - hr - 0.3, hy - 0.6], [hx - hr * 0.6, hy - hr - 0.4], [hx, hy - hr - 0.9], [hx, hy - 0.6]], sh(head, -0.6, -0.6, 0.7)); poly(g, [[hx, hy - 0.6], [hx, hy - hr - 0.9], [hx + hr * 0.6, hy - hr - 0.4], [hx + hr + 0.3, hy - 0.6]], sh(head, 0.6, -0.4, 0.6));
      tri(g, [hx - 0.4, hy - hr - 0.8], [hx + 0.8, hy - hr - 0.8], [hx - 1.6, hy - hr - 4.6], '#e8604a');
      poly(g, [[x - 6.2, y - 9], [x - 3.2, y - 9.4], [x - 3.2, y - 4.6], [x - 4.7, y - 3]], sh('#d8dce8', -0.7, -0.1, 0.7)); poly(g, [[x - 6.2, y - 9], [x - 4.7, y - 3], [x - 6, y - 5]], sh('#d8dce8', -0.9, 0.4, 0.4)); g.fillStyle = '#ffc94a'; g.fillRect(x - 5, y - 7.6, 1, 2.6);
      poly(g, [[x + 4.6, y - 3], [x + 5.6, y - 3], [x + 6, y - 15], [x + 5.2, y - 15.6]], sh('#eef2fa', 0.4, -0.5, 0.8)); g.fillStyle = '#ffc94a'; g.fillRect(x + 3.6, y - 4.6, 3.4, 1);
    } else if (kind === 'mage') {
      poly(g, [[hx - hr - 1.6, hy - 1.2], [hx + hr + 1.6, hy - 1.2], [hx + hr + 0.6, hy - 0.2], [hx - hr - 0.6, hy - 0.2]], sh(head, 0, 0.6, 0.5));
      tri(g, [hx - hr, hy - 1.2], [hx + 0.4, hy - 1.2], [hx + 1.6, hy - 10], sh(head, -0.7, -0.4, 0.6)); tri(g, [hx + 0.4, hy - 1.2], [hx + hr, hy - 1.2], [hx + 1.6, hy - 10], sh(head, 0.8, -0.2, 0.5));
      poly(g, [[x + 5.2, y], [x + 6, y], [x + 6, y - 19], [x + 5.2, y - 19]], sh(G.wood, 0.5, 0, 0.6)); gem(g, x + 5.6, y - 20.6, 2, 2.8, u.team === 'b' ? '#c9a0ff' : '#7ad8ea');
    } else {   // fighter / archer: a hood and a prop
      poly(g, [[hx - hr - 0.6, hy + 1.2], [hx - hr * 0.7, hy - hr - 0.3], [hx, hy - hr - 1], [hx, hy - 1.4]], sh(head, -0.7, -0.5, 0.6)); poly(g, [[hx, hy - 1.4], [hx, hy - hr - 1], [hx + hr * 0.7, hy - hr - 0.3], [hx + hr + 0.6, hy + 1.2]], sh(head, 0.7, -0.3, 0.5));
      if (kind === 'archer') { g.strokeStyle = sh(G.wood, 0.6, 0, 0.6); g.lineWidth = 1; g.beginPath(); g.arc(x + 3.6, y - 9, 6.4, -1.1, 1.1); g.stroke(); g.strokeStyle = '#f6f4ef'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(x + 3.6 + Math.cos(-1.1) * 6.4, y - 9 + Math.sin(-1.1) * 6.4); g.lineTo(x + 3.6 + Math.cos(1.1) * 6.4, y - 9 + Math.sin(1.1) * 6.4); g.stroke(); }
      else { poly(g, [[x + 4.8, y - 2], [x + 5.6, y - 2], [x + 5.6, y - 14], [x + 4.8, y - 14]], sh(G.wood, 0.4, 0, 0.6)); poly(g, [[x + 5.6, y - 14], [x + 9, y - 15.4], [x + 9, y - 10.6], [x + 5.6, y - 11.4]], sh('#d8dce8', 0.3, -0.6, 0.7)); poly(g, [[x + 9, y - 13], [x + 9, y - 10.6], [x + 5.6, y - 11.4]], sh('#d8dce8', 0.6, 0.6, 0.4)); }
    }
    g.restore();
  };
  // atmosphere(ctx, view, t, {phase, lights: [{x, y, col, r, i}]}):
  //   'world': warm or saturated light pools on the ground from emissive props (scaled by the time of day: none at noon).
  //   'final': a haze in the sky colour fading out the far (top) edge, and the dusk wash.
  function glowAt(g, x, y, r, col, a) { if (a <= 0.01) return; var gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.35, rgba(col, a * 0.45)); gr.addColorStop(1, rgba(col, 0)); var op = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); g.globalCompositeOperation = op; }
  skin.atmosphere = function (g, view, t, o) {
    o = o || {}; view = view || { x: 0, y: 0, w: 256, h: 224 }; var L = TOD[CUR.tod] || TOD.day;
    var LS = (o.lights || []).map(function (l) { var n = API.normLight ? API.normLight(l) : l; if (l.intensity == null && l.i != null) n.intensity = l.i; return n; }).filter(function (l) { return l.kind !== 'magic'; });
    if ((o.phase || 'world') === 'world') { LS.forEach(function (l) { glowAt(g, l.x, l.y, Math.max(32, l.r || 40), l.col || '#ffb860', Math.min(0.6, l.intensity) * L.glow); }); return; }
    var hz = g.createLinearGradient(0, view.y, 0, view.y + 34); hz.addColorStop(0, rgba(L.sky[1], 0.5)); hz.addColorStop(1, rgba(L.sky[1], 0)); g.fillStyle = hz; g.fillRect(view.x, view.y, view.w, 34);
    if (L.glow > 0.2 && L.glow < 0.9) { var dk = g.createLinearGradient(view.x + view.w, view.y, view.x, view.y + view.h); dk.addColorStop(0, 'rgba(255,170,110,0.10)'); dk.addColorStop(1, 'rgba(110,100,190,0.10)'); g.fillStyle = dk; g.fillRect(view.x, view.y, view.w, view.h); }

  };
  skin.glowAt = glowAt; skin.tri = tri;

  /* ---------------- prop(ctx, rect, kind, t, {lights}): faceted standing objects on the bottom centre of rect ---------------- */
  function blobSh(g, x, y, rx, ry, a) { var L = TOD[CUR.tod] || TOD.day; g.fillStyle = 'rgba(40,46,90,' + a + ')'; g.beginPath(); g.ellipse(x - L.sun[0] * 3.2, y - L.sun[1] * 1.6 + 0.6, rx, ry, 0, 0, 7); g.fill(); }
  function crownP(g, cx, cy, r, col, seed, sway) {
    var n = 7, ring = [], c = [cx - 1.2 + sway, cy - 1.6], i;
    for (i = 0; i < n; i++) { var a = i / n * Math.PI * 2 + seed, rr2 = r * (0.84 + hsh(seed * 7, i) * 0.3); ring.push([cx + Math.cos(a) * rr2 + sway * (Math.sin(a) < 0 ? 1 : 0.4), cy + Math.sin(a) * rr2 * 0.92]); }
    for (i = 0; i < n; i++) { var p = ring[i], q = ring[(i + 1) % n], mx = (p[0] + q[0]) / 2 - cx, my = (p[1] + q[1]) / 2 - cy, l = Math.hypot(mx, my) || 1; tri(g, c, p, q, sh(col, mx / l * 0.9, my / l * 0.9, 0.75)); }
    tri(g, c, ring[4], ring[5], sh(mix(col, '#ffffff', 0.12), -0.5, -0.6, 0.9));
  }
  skin.prop = function (g, r, kind, t, o) {
    o = o || {}; t = t || 0; kind = { rock: 'stone', torch: 'brazier', fire: 'brazier', copse: 'tree', thicket: 'bush' }[kind] || kind;
    var seed = Math.round(r.x / 16) * 7 + Math.round(r.y / 16) + 1, x = r.x + r.w / 2, y = r.y + r.h - 2.5, L = TOD[CUR.tod] || TOD.day, i;
    g.save(); g.lineJoin = 'round';
    if (kind === 'tree') {
      x += (hsh(seed, 1) - 0.5) * 3; var sway = Math.sin(t * 1.4 + seed * 3) * 0.35; blobSh(g, x, y, 6.5, 2.4, 0.24);
      poly(g, [[x - 1.3, y], [x, y], [x, y - 6], [x - 1.1, y - 6]], sh(G.wood, -0.7, 0, 0.6)); poly(g, [[x, y], [x + 1.3, y], [x + 1.1, y - 6], [x, y - 6]], sh(G.wood, 0.8, 0, 0.5));
      crownP(g, x, y - 11, 6.6, mix(G.leaf, '#6ab060', hsh(seed, 2)), seed, sway);
    } else if (kind === 'pine') {
      var sw = Math.sin(t * 1.2 + seed) * 0.3; blobSh(g, x, y, 5.5, 2.1, 0.24);
      poly(g, [[x - 1, y], [x + 1, y], [x + 1, y - 3], [x - 1, y - 3]], sh(G.wood, 0, 0.3, 0.6));
      [[y - 2, 6, 7], [y - 7, 4.8, 6.5], [y - 11.5, 3.4, 6]].forEach(function (T, k) { var top = [x + sw * (k + 1) * 0.5, T[0] - T[2]], bl = [x - T[1], T[0]], br = [x + T[1], T[0]], mid = [x + 0.6, T[0] + 0.6];
        tri(g, top, bl, mid, sh(G.pine, -0.75, 0.1, 0.65)); tri(g, top, mid, br, sh(G.pine, 0.75, 0.1, 0.5)); });
    } else if (kind === 'bush') {
      blobSh(g, x, y, 6.5, 2.2, 0.22); crownP(g, x - 2.4, y - 3.6, 3.6, mix(G.leaf, '#4f9a5a', 0.4), seed, 0); crownP(g, x + 2.6, y - 3.2, 3.4, mix(G.leaf, '#6ab060', 0.5), seed + 3, 0); crownP(g, x, y - 5.4, 3.8, G.leaf, seed + 5, 0);
      tri(g, [x - 3, y - 6], [x - 2, y - 6.6], [x - 2.2, y - 5.4], '#ff8aa8'); tri(g, [x + 2.2, y - 4.6], [x + 3.2, y - 5.2], [x + 3, y - 4], '#ffd36a');
    } else {   // stone, brazier, lamp, crystal: a faceted menhir with its light on top
      blobSh(g, x, y, 5.5, 2, 0.26); var hgt = 15, w = 4.6;
      poly(g, [[x - w, y], [x - 0.4, y + 0.8], [x - 0.6, y - hgt], [x - w + 1.2, y - hgt + 3]], sh(G.stone, -0.85, 0, 0.5));
      poly(g, [[x - 0.4, y + 0.8], [x + w, y], [x + w - 1, y - hgt + 2.2], [x - 0.6, y - hgt]], sh(G.stone, 0.8, 0.2, 0.45));
      tri(g, [x - w + 1.2, y - hgt + 3], [x - 0.6, y - hgt], [x + w - 1, y - hgt + 2.2], sh(G.stone, -0.1, -0.5, 0.9));
      var ty = y - hgt + 1, lit = L.glow;
      if (kind === 'brazier') {
        var fl = 0.85 + 0.15 * Math.sin(t * 9) + 0.08 * Math.sin(t * 15.3);
        poly(g, [[x - 4, ty], [x + 4, ty], [x + 3, ty - 2], [x - 3, ty - 2]], sh('#8a6040', 0, -0.4)); poly(g, [[x - 4, ty], [x + 4, ty], [x + 3.4, ty + 1], [x - 3.4, ty + 1]], sh('#6a4630', 0, 0.8, 0.4));
        tri(g, [x - 3.2, ty - 2], [x + 3.2, ty - 2], [x - 0.4, ty - 2 - 8 * fl], '#ff7a3c'); tri(g, [x - 1.8, ty - 2], [x + 2.4, ty - 2], [x + 0.6, ty - 2 - 5.6 * fl], '#ffc94a'); tri(g, [x - 0.7, ty - 2], [x + 1.1, ty - 2], [x + 0.2, ty - 2 - 3 * fl], '#fff3c4');
        glowAt(g, x, ty - 5, 9 + 6 * lit, '#ffb050', 0.25 + 0.5 * lit);
      } else if (kind === 'lamp') {
        var lamp = lit > 0 ? '#ffd27e' : '#f6e8c8';
        poly(g, [[x - 0.6, ty], [x + 0.6, ty], [x + 0.6, ty - 2], [x - 0.6, ty - 2]], sh('#4a5068', 0, 0));
        poly(g, [[x - 3, ty - 2], [x, ty - 2], [x, ty - 8], [x - 3, ty - 8]], lit > 0 ? lamp : sh(lamp, -0.6, 0, 0.6)); poly(g, [[x, ty - 2], [x + 3, ty - 2], [x + 3, ty - 8], [x, ty - 8]], lit > 0 ? mix(lamp, '#ff9a40', 0.3) : sh(lamp, 0.7, 0, 0.5));
        tri(g, [x - 3.6, ty - 8], [x + 3.6, ty - 8], [x, ty - 11.5], sh('#4a5068', -0.2, -0.5, 0.6));
        glowAt(g, x, ty - 5, 7 + 7 * lit, '#ffd27e', 0.12 + 0.55 * lit);
      } else if (kind === 'crystal') {
        var cc = lit > 0.5 ? '#9ff0ff' : '#7ad8ea'; gem(g, x - 2.6, ty - 2.6, 1.8, 3.2, mix(cc, '#6aa0ff', 0.3)); gem(g, x, ty - 5.5, 3, 6.5, cc); gem(g, x + 2.8, ty - 2.8, 2, 3.4, mix(cc, '#ffffff', 0.2));
        glowAt(g, x, ty - 5, 8 + 6 * lit, '#7ae8ff', 0.18 + 0.45 * lit);
      }
    }
    g.restore();
  };
  skin.shade = shade; skin.facet = facet; skin.gem = gem; skin.frost = frost;
  skin.tod = function (name) { if (TOD[name]) CUR.tod = name; return TOD[CUR.tod]; };

  var S = API.register(skin);
  S.shade = shade; S.facet = facet; S.gem = gem; S.frost = frost; S.tod = skin.tod; S.glowAt = glowAt; S.tri = tri; S.layout = function (s, o) { return layout(S, s, o); };
})(typeof window !== 'undefined' ? window : this);
