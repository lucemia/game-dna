/* GameDNA skin 'neon-vector' · Neon vector arcade · needs skin-api.js first
 *
 * Smooth (non-pixel) rendering on the module's native 256x224 grid (backing store = native x display scale).
 * Everything is a thin glowing line on black, like a vector-display arcade cabinet:
 *   glow    = one path stroked a few times: three wide translucent halo passes ('lighter'), the colour line, a white-hot core.
 *             No shadowBlur, so it stays cheap for hundreds of shapes. Closed shapes are filled black first (hidden-line look).
 *   text    = own stroke font (straight segments, chamfered corners, uppercase), black underlay so it reads over the map
 *   number  = seven-segment numerals (gapped, slightly slanted), crit = yellow with a magenta echo and radiating line sparks,
 *             phosphor smear while the number is moving fast; CRITICAL label in stroke letters between two dashes
 *   frame   = black panel, chamfered corners, glowing 0.75 px edge, dim inner rule, faint terminal scanlines, corner ticks
 *   overlay = faint additive tint, an inset wire square per cell, a glowing line on the set's boundary, a travelling scan wave
 *   bar     = LED segment meter in a thin outline
 *   cursor  = glowing corner brackets with afterimages; 'hand' = a small vector ship with an exhaust flicker
 *   path    = hollow neon tube (two glowing edges), marching white-hot centre dashes, hollow arrowhead, comet spark
 *   scene   = wire-grid floor, wireframe terrain / props / units, light pools, CRT scanlines + vignette ('final')
 * All procedural; no images, no web fonts.
 */
(function (root) {
  'use strict';
  var API = root.GameDNA_Skin;
  if (!API) { if (root.console) console.error('neon-vector.js: load skin-api.js first'); return; }
  var C = API.color;

  var N = { cyan: '#29f3ff', magenta: '#ff2fd8', yellow: '#ffe93b', green: '#3dff86', white: '#ffffff', dimCyan: '#1a7f8f' };

  var palette = {
    ink: '#000000', paper: '#e8fdff',
    neon: N,
    ui: { fill: '#000000', fillTo: '#000000', edge: N.cyan, highlight: '#bffcff', shadow: '#000000',
      select: N.cyan, well: 'rgba(0,0,0,0.78)' },
    team: { a: N.cyan, b: N.magenta, n: N.green, aText: '#bffcff', bText: '#ffc2f3' },
    overlay: {
      move: { fill: N.cyan, edge: N.cyan, alpha: 0.075 },
      attack: { fill: N.magenta, edge: N.magenta, alpha: 0.085 },
      threat: { fill: N.yellow, edge: N.yellow, alpha: 0.05 },
      heal: { fill: N.green, edge: N.green, alpha: 0.075 },
      path: { core: N.yellow, light: '#fff8c0', mid: N.yellow, dark: '#a89400', outline: '#000000', spark: '#ffffff' }
    },
    fx: { hot: N.yellow, cold: N.cyan, heal: N.green, crit: N.yellow, status: N.magenta, white: '#ffffff', echo: N.magenta },
    text: {
      main: '#aefbff', main2: '#aefbff', shadow: '#000000', outline: '#000000', dim: '#2f6a74', dim2: '#2f6a74',
      accent: N.yellow, select: N.yellow, title: N.yellow, title2: N.yellow, label: N.yellow, label2: N.yellow,
      gold: N.yellow, gold2: N.yellow, plate: N.yellow, plateShadow: '#000000', pointer: N.yellow, pointerEdge: '#000000'
    },
    // numerals per kind: [line colour, halo colour]
    numbers: { damage: ['#c8fdff', N.cyan], crit: [N.yellow, N.yellow], heal: [N.green, N.green], mp: [N.cyan, N.cyan], miss: ['#7fa7b4', '#4c8f9a'], status: [N.magenta, N.magenta] },
    bars: { track: '#06171b', charge: N.yellow, haste: N.green, slow: N.cyan, ready: '#ffffff', queued: N.cyan, enemy: N.magenta, enemyFull: N.yellow, hp: N.green, hpLow: N.magenta },
    // terrain line colours (scene hooks); the floor itself is black
    terrain: { grass: '#0d2a2e', forest: N.green, water: N.cyan, hill: N.green, mountain: '#9fdcff', road: N.yellow, bridge: N.yellow, fort: N.yellow, sand: N.yellow, wall: N.cyan, floor: N.cyan, grid: N.cyan }
  };

  /* ---------------- glow ---------------- */
  // halo passes: [width multiplier of lw, alpha]; then the colour line, then a white-hot core
  var HALO = [[7, 0.05], [4.2, 0.1], [2.4, 0.2]];
  function core(col) { return C.mix(col, '#ffffff', 0.62); }
  // stroke the CURRENT path as neon. o = {k: halo strength (default 1), alpha, core: bool, under: px of black underlay per side, haloOnly, dash,
  //   halo: halo colour (default col), base: halo spread unit in px (default lw), cap}
  function neon(g, col, lw, o) {
    o = o || {}; var pa = g.globalAlpha, k = o.k == null ? 1 : o.k, A = o.alpha == null ? 1 : o.alpha;
    if (!(A > 0)) return;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    if (o.dash) { g.setLineDash(o.dash); g.lineDashOffset = o.dashOffset || 0; }
    if (o.under && !o.haloOnly) { g.globalCompositeOperation = 'source-over'; g.globalAlpha = pa * A; g.strokeStyle = '#000000'; g.lineWidth = lw + 2 * o.under; g.stroke(); }
    g.globalCompositeOperation = 'lighter'; g.strokeStyle = o.halo || col;
    for (var i = 0; i < HALO.length; i++) { g.globalAlpha = pa * A * HALO[i][1] * k; g.lineWidth = lw + (HALO[i][0] - 1) * (o.base || lw); g.stroke(); }
    g.strokeStyle = col; g.lineCap = o.cap || 'round';
    if (!o.haloOnly) {
      g.globalAlpha = pa * A; g.lineWidth = lw; g.stroke();
      if (o.core !== false) { g.strokeStyle = core(col); g.lineWidth = lw * 0.42; g.stroke(); }
    }
    g.restore();
  }
  function polyPath(g, pts, closed) { g.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); if (closed) g.closePath(); }
  function blackFill(g, build, alpha) { var pa = g.globalAlpha; g.save(); g.globalCompositeOperation = 'source-over'; g.globalAlpha = pa * (alpha == null ? 1 : alpha); g.fillStyle = '#000000'; g.beginPath(); build(g); g.fill(); g.restore(); }
  function hsh(a, b, c) { var n = (a * 374761393 + (b || 0) * 668265263 + (c || 0) * 2147483647) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; }

  /* ---------------- stroke font ----------------
     Grid: x 0..4 (narrow glyphs 0..w), y 0..6 (cap height; ',' dips to 7). Polylines separated by '|', points "x,y". */
  var GLYPHS = {
    A: '0,6 0,1.5 1.5,0 2.5,0 4,1.5 4,6|0,3.5 4,3.5', B: '0,0 0,6 3,6 4,5 4,4 3,3 0,3|0,0 3,0 4,1 4,2 3,3', C: '4,0 1,0 0,1 0,5 1,6 4,6',
    D: '0,0 0,6 2.5,6 4,4.5 4,1.5 2.5,0 0,0', E: '4,0 0,0 0,6 4,6|0,3 3,3', F: '4,0 0,0 0,6|0,3 3,3', G: '4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5 4,3.4 2.2,3.4',
    H: '0,0 0,6|4,0 4,6|0,3 4,3', I: '0,0 2,0|1,0 1,6|0,6 2,6', J: '1.5,0 4,0 4,5 3,6 1,6 0,5', K: '0,0 0,6|4,0 0,3.4|1.4,2.6 4,6', L: '0,0 0,6 4,6',
    M: '0,6 0,0 2,3 4,0 4,6', N: '0,6 0,0 4,6 4,0', O: '1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0', P: '0,6 0,0 3,0 4,1 4,2 3,3 0,3',
    Q: '1,0 3,0 4,1 4,4.5 2.5,6 1,6 0,5 0,1 1,0|2.4,4.2 4,6', R: '0,6 0,0 3,0 4,1 4,2 3,3 0,3|1.6,3 4,6', S: '4,1 3,0 1,0 0,1 0,2 1,3 3,3 4,4 4,5 3,6 1,6 0,5',
    T: '0,0 4,0|2,0 2,6', U: '0,0 0,5 1,6 3,6 4,5 4,0', V: '0,0 2,6 4,0', W: '0,0 0.8,6 2,3 3.2,6 4,0', X: '0,0 4,6|4,0 0,6', Y: '0,0 2,3 4,0|2,3 2,6', Z: '0,0 4,0 0,6 4,6',
    '0': '1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0|3.4,0.8 0.6,5.2', '1': '0,1 1,0 1,6|0,6 2,6', '2': '0,1 1,0 3,0 4,1 4,2 0,6 4,6', '3': '0,0 4,0 2,2.5 3,2.5 4,3.5 4,5 3,6 1,6 0,5',
    '4': '3,6 3,0 0,4 4,4', '5': '4,0 0,0 0,2.6 3,2.6 4,3.6 4,5 3,6 0,6', '6': '3.5,0 1,0 0,1 0,5 1,6 3,6 4,5 4,3.6 3,2.6 0,2.6', '7': '0,0 4,0 1.5,6',
    '8': '1,0 3,0 4,1 4,2 3,3 1,3 0,4 0,5 1,6 3,6 4,5 4,4 3,3|1,3 0,2 0,1 1,0', '9': '4,3.4 1,3.4 0,2.4 0,1 1,0 3,0 4,1 4,5 3,6 0.5,6',
    '.': '0,5.4 1,5.4 1,6 0,6 0,5.4', ',': '1,5.2 1,6 0.2,7', ':': '0,1.4 1,1.4 1,2 0,2 0,1.4|0,5.4 1,5.4 1,6 0,6 0,5.4', '!': '0.5,0 0.5,4|0.5,5.3 0.5,6',
    '?': '0,1 1,0 3,0 4,1 4,2 2,3.5 2,4.3|2,5.4 2,6', "'": '0.5,0 0.5,1.6', '-': '0.6,3 3.4,3', '+': '0.4,3 3.6,3|2,1.4 2,4.6', '/': '0,6 4,0',
    '%': '0,6 4,0|0,0 1,0 1,1 0,1 0,0|3,5 4,5 4,6 3,6 3,5', '(': '1.6,0 0.4,1.5 0.4,4.5 1.6,6', ')': '0.4,0 1.6,1.5 1.6,4.5 0.4,6', '[': '1.6,0 0.4,0 0.4,6 1.6,6', ']': '0.4,0 1.6,0 1.6,6 0.4,6',
    '=': '0.6,2 3.4,2|0.6,4 3.4,4', '*': '2,1 2,5|0.5,2 3.5,4|3.5,2 0.5,4', '>': '0,0.5 4,3 0,5.5', '<': '4,0.5 0,3 4,5.5', '_': '0,6 4,6',
    '#': '1.3,0 0.7,6|3.3,0 2.7,6|0,2 4,2|0,4 4,4', '▼': '0,1.5 4,1.5 2,5 0,1.5', '▲': '0,5 4,5 2,1.5 0,5', '►': '0,0.5 4,3 0,5.5 0,0.5', '×': '0.6,1.6 3.4,4.4|3.4,1.6 0.6,4.4',
    '♥': '2,6 0,3.5 0,1.5 1,0.6 2,1.5 3,0.6 4,1.5 4,3.5 2,6'
  };
  var WIDTH = { I: 2, '1': 2, '.': 1, ',': 1, ':': 1, '!': 1, "'": 1, '(': 2, ')': 2, '[': 2, ']': 2 };
  var BOX = '0,0 4,0 4,6 0,6 0,0';
  var PARSED = {};
  function glyph(ch) {
    if (PARSED[ch]) return PARSED[ch];
    var src = GLYPHS[ch] != null ? GLYPHS[ch] : BOX;
    var lines = src.split('|').map(function (l) { return l.trim().split(/\s+/).map(function (p) { var q = p.split(','); return [+q[0], +q[1]]; }); });
    return (PARSED[ch] = { w: WIDTH[ch] || 4, lines: lines });
  }
  // seven-segment numerals (gapped segments): a top, b upper right, c lower right, d bottom, e lower left, f upper left, g middle
  var SEG = { a: [[0.55, 0], [3.45, 0]], b: [[4, 0.55], [4, 2.45]], c: [[4, 3.55], [4, 5.45]], d: [[0.55, 6], [3.45, 6]], e: [[0, 3.55], [0, 5.45]], f: [[0, 0.55], [0, 2.45]], g: [[0.55, 3], [3.45, 3]] };
  var DIG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' };
  // add one glyph's subpaths: top-left (x, y), unit u (cap = 6u), horizontal unit ux, skew (x shift per unit of height above the baseline)
  function addGlyph(g, ch, x, y, u, ux, skew, seg) {
    var X = function (px, py) { return x + px * ux + (6 - py) * u * (skew || 0); }, Y = function (py) { return y + py * u; };
    if (seg && DIG[ch]) {
      var S = DIG[ch], sh = ch === '1' ? -2.2 : 0;   // the one is narrow: its two segments sit in a 2-unit cell
      for (var i = 0; i < S.length; i++) { var s = SEG[S[i]]; g.moveTo(X(s[0][0] + sh, s[0][1]), Y(s[0][1])); g.lineTo(X(s[1][0] + sh, s[1][1]), Y(s[1][1])); }
      if (ch === '1') { g.moveTo(X(0.45, 1.5), Y(1.5)); g.lineTo(X(1.35, 0.35), Y(0.35)); }   // top-left flag so a lone '1' never reads as a tick
      return;
    }
    var G = glyph(ch);
    G.lines.forEach(function (L) { g.moveTo(X(L[0][0], L[0][1]), Y(L[0][1])); for (var j = 1; j < L.length; j++) g.lineTo(X(L[j][0], L[j][1]), Y(L[j][1])); if (L.length === 1) g.lineTo(X(L[0][0], L[0][1]) + 0.01, Y(L[0][1])); });
  }
  function gw(ch, seg) { if (ch === ' ') return 3; if (seg && DIG[ch]) return ch === '1' ? 2 : 4; return glyph(ch).w; }
  function metrics(f, scale, seg) { var u = f.size * (scale || 1) / 6; return { u: u, ux: u * (seg ? 1 : (f.narrow || 0.92)), tr: (f.track == null ? 1.5 : f.track) }; }
  function strWidth(f, s, scale, seg) {
    var M = metrics(f, scale, seg), w = 0; for (var i = 0; i < s.length; i++) w += (gw(s[i], seg) + M.tr) * M.ux;
    return Math.max(0, w - M.tr * M.ux);
  }

  function fontOf(skin, name) { return skin.fonts[name || 'ui'] || skin.fonts.ui; }
  function colOf(skin, c, d) { var v = c == null ? null : API.token(skin, c); return v && typeof v === 'string' ? v : d; }

  /* ---------------- the skin ---------------- */
  var skin = {
    id: 'neon-vector', name: 'Neon vector arcade', pixel: false,
    native: { w: 256, h: 224, scale: 'fit', smoothing: true, snap: 0, minScale: 2, note: 'backing store = native x display scale, ctx.setTransform(s,0,0,s,0,0); thin lines need >= 2x display' },
    palette: palette,
    fonts: {
      ui: { type: 'vector', size: 7, height: 7, weight: 0.72, track: 1.5, narrow: 0.92, uppercase: true, note: 'own stroke font (straight segments, chamfered corners); drawn by text()' },
      title: { type: 'vector', size: 7, height: 7, weight: 0.85, track: 1.6, narrow: 0.92, uppercase: true },
      label: { type: 'vector', size: 6, height: 6, weight: 0.7, track: 1.6, narrow: 0.9, uppercase: true },
      plate: { type: 'vector', size: 6, height: 6, weight: 0.75, track: 1.7, narrow: 0.92, uppercase: true },
      num: { type: 'vector', style: 'segment', size: 11, height: 11, weight: 1.3, track: 1.9, skew: 0.09, note: 'seven-segment numerals; letters (MISS) fall back to the stroke font at 0.72 size' },
      rules: { snap: false, smoothing: true, minSize: 6, uppercase: true, lineH: 12 }
    },
    shape: { radius: 0, chamfer: 3, edgeWidth: 0.75, padding: 4, rowRadius: 0, backingRadius: 0, segW: 2, segGap: 1 },
    frameRoles: ['row', 'backing'],
    atmospherePhases: ['world', 'final'],
    layout: { handW: 8, handH: 6, pointerGap: 4, rowFrame: true },
    overlayStyle: { mode: 'wire', pattern: 'pulsing', alpha: 0.075, wave: 0.07, inner: 0.3, edgeWidth: 0.8 },
    particles: { shape: 'line', size: [2, 6], count: 1, snap: false, blend: 'lighter', glow: 1, gravity: 0.04, drag: 0.06, life: [180, 420], colors: ['fx.crit', 'fx.echo', 'fx.cold', 'fx.white'], trail: 3, rays: 10, lineWidth: 0.8 },
    outline: { text: { width: 1.1, mode: 'underlay' }, number: { width: 1.4, max: 2, drop: 0, mode: 'underlay', color: 'ink' }, sprite: { width: 0.75, color: 'team', mode: 'glow' } },
    shadow: { text: null, window: null, sprite: { kind: 'ring', alpha: 0.45 } },
    motion: { stepMs: 0, snap: false, ease: { move: 'outCubic', pop: 'outBack', fade: 'linear' }, fadeSteps: null, shakeInt: false, flashMax: 0.8,
      squash: { x: 1.12, y: 0.88, ms: 60 }, persistence: { ghosts: 2, dtMs: 45, decay: 0.45 } },
    // optional CRT post, drawn in atmosphere('final'); set scanlines / vignette to 0 to switch it off
    crt: { scanlines: 0.2, vignette: 0.42, pitch: 2 },

    measure: function (str, o) {
      o = o || {}; var f = fontOf(this, o.font), s = String(str); if (f.uppercase !== false) s = s.toUpperCase();
      return strWidth(f, s, o.scale, false);
    },

    // text(ctx, str, x, y, {font, color, align, scale, alpha, outline: false, glow}) -> width. (x, y) = top-left of the cap box.
    text: function (ctx, str, x, y, o) {
      o = o || {}; var f = fontOf(this, o.font), s = String(str); if (f.uppercase !== false) s = s.toUpperCase();
      var w = this.measure(s, o), col = colOf(this, o.color, this.palette.text.main);
      if (o.align === 'center') x -= w / 2; else if (o.align === 'right') x -= w;
      var M = metrics(f, o.scale, false), lw = (f.weight || 0.72) * Math.max(0.85, Math.sqrt(o.scale || 1)), cx = x;
      ctx.save(); if (o.alpha != null) ctx.globalAlpha *= o.alpha;
      ctx.beginPath();
      for (var i = 0; i < s.length; i++) { if (s[i] !== ' ') addGlyph(ctx, s[i], cx, y, M.u, M.ux, 0, false); cx += (gw(s[i], false) + M.tr) * M.ux; }
      var dim = col === this.palette.text.dim;   // disabled rows: no white-hot core, weak halo
      neon(ctx, col, lw, { k: o.glow == null ? (dim ? 0.35 : 0.75) : o.glow, core: !dim, under: o.outline === false ? 0 : this.outline.text.width });
      ctx.restore();
      return w;
    },

    // frame: black panel with chamfered corners and one glowing edge. role window | plate | banner | tooltip | row | backing
    frame: function (g, r, st) {
      st = st || {}; var P = this.palette, SH = this.shape, role = st.role || 'window', x = r.x, y = r.y, w = r.w, h = r.h;
      var col = st.alert ? N.magenta : role === 'plate' ? N.yellow : (P.team[st.team] || (role === 'row' ? N.cyan : P.team.a));
      g.save(); if (st.alpha != null) g.globalAlpha *= st.alpha; if (st.disabled) g.globalAlpha *= 0.55;
      if (role === 'row') {
        g.globalCompositeOperation = 'lighter';
        var gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, C.rgba(col, st.focus ? 0.24 : 0.14)); gr.addColorStop(1, C.rgba(col, 0.02));
        g.fillStyle = gr; g.fillRect(x, y, w, h);
        g.globalCompositeOperation = 'source-over';
        g.beginPath(); g.moveTo(x + 0.6, y + 1); g.lineTo(x + 0.6, y + h - 1); neon(g, col, 0.8, { k: 0.8 });
        g.beginPath(); g.moveTo(x + 2, y + h - 0.4); g.lineTo(x + w * 0.85, y + h - 0.4); neon(g, col, 0.4, { k: 0.4, alpha: 0.6, core: false });
        g.restore(); return { x: x, y: y, w: w, h: h };
      }
      if (role === 'backing') {
        g.fillStyle = P.ui.well; g.fillRect(x, y, w, h);
        g.beginPath(); g.rect(x + 0.5, y + 0.5, w - 1, h - 1); neon(g, col, 0.4, { k: 0.3, alpha: 0.45, core: false, dash: [1.5, 1.5] });
        g.restore(); return { x: x, y: y, w: w, h: h };
      }
      var c = role === 'plate' ? Math.min(h / 2, 4) : Math.min(SH.chamfer, h / 3, w / 3), e = 0.5;
      var outline = role === 'plate'
        ? [[x + c, y + e], [x + w - c, y + e], [x + w - e, y + h / 2], [x + w - c, y + h - e], [x + c, y + h - e], [x + e, y + h / 2]]
        : [[x + c, y + e], [x + w - e, y + e], [x + w - e, y + h - c], [x + w - c, y + h - e], [x + e, y + h - e], [x + e, y + c]];
      // body
      g.fillStyle = role === 'tooltip' ? 'rgba(0,0,0,0.82)' : P.ui.fill; g.beginPath(); polyPath(g, outline, true); g.fill();
      // faint terminal scanlines inside
      if (role !== 'plate' && h > 10) {
        g.save(); g.beginPath(); polyPath(g, outline, true); g.clip(); g.globalCompositeOperation = 'lighter'; g.fillStyle = C.rgba(col, 0.045);
        for (var yy = y + 2; yy < y + h - 1; yy += 2) g.fillRect(x, yy, w, 0.5);
        g.restore();
      }
      // inner rule (dim, no glow)
      if (role === 'window' || role === 'banner') {
        var i2 = 2.2; g.beginPath();
        polyPath(g, [[x + c + i2 * 0.6, y + i2], [x + w - i2, y + i2], [x + w - i2, y + h - c - i2 * 0.6], [x + w - c - i2 * 0.6, y + h - i2], [x + i2, y + h - i2], [x + i2, y + c + i2 * 0.6]], true);
        neon(g, col, 0.35, { k: 0.2, alpha: 0.32, core: false });
      }
      // glowing edge
      g.beginPath(); polyPath(g, outline, true);
      neon(g, col, SH.edgeWidth, { k: role === 'plate' ? 0.9 : 0.75, dash: role === 'tooltip' ? [2.5, 1.5] : null });
      // corner ticks on the two square corners (bright accents)
      if (role === 'window' || role === 'banner') {
        g.beginPath(); g.moveTo(x + w - 5, y + e); g.lineTo(x + w - e, y + e); g.lineTo(x + w - e, y + 5);
        g.moveTo(x + e, y + h - 5); g.lineTo(x + e, y + h - e); g.lineTo(x + 5, y + h - e);
        neon(g, '#ffffff', 0.6, { k: 0.6, alpha: 0.75 });
      }
      if (role === 'banner') { g.beginPath(); g.moveTo(x - 6, y + h / 2); g.lineTo(x - 1.5, y + h / 2); g.moveTo(x + w + 1.5, y + h / 2); g.lineTo(x + w + 6, y + h / 2); neon(g, col, 0.7); }
      if (st.focus) { g.beginPath(); polyPath(g, outline.map(function (p) { return [p[0] + (p[0] > x + w / 2 ? 1.5 : -1.5), p[1] + (p[1] > y + h / 2 ? 1.5 : -1.5)]; }), true); neon(g, N.yellow, 0.5, { k: 0.5, alpha: 0.7 }); }
      g.restore();
      var pad = role === 'plate' ? 3 : SH.padding;
      return { x: x + pad, y: y + pad, w: w - 2 * pad, h: h - 2 * pad };
    },

    // number: seven-segment numerals + stroke letters, glyph by glyph through glyphOffset (canonical items)
    number: function (ctx, str, x, y, o) {
      o = o || {}; var self = this, P = this.palette, s = String(str), kind = o.kind || 'damage', K = P.numbers[kind] || P.numbers.damage;
      var Fn = this.fonts.num, Fu = this.fonts.ui, Fl = this.fonts.label, crit = kind === 'crit';
      var sc = (o.scale || 1) * (crit && o.big !== false ? 1.3 : 1), word = /[A-Za-z]/.test(s);
      var items = API.glyphItems(s, o), ul = function (c) { return String(c).toUpperCase(); };
      // per-role metrics
      var R = {
        main: { f: Fn, scale: sc * (word ? 0.72 : 1), seg: !word, col: K[0], halo: K[1], lw: Fn.weight * Math.max(0.9, sc * (word ? 0.75 : 1)), skew: Fn.skew || 0 },
        suffix: { f: Fu, scale: sc * 0.9, seg: false, col: K[0], halo: K[1], lw: Fu.weight * Math.max(1, sc * 0.9), skew: 0 },
        label: { f: Fl, scale: Math.max(1, sc * 0.9), seg: false, col: P.fx.crit, halo: P.fx.crit, lw: Fl.weight * 1.05, skew: 0 }
      };
      Object.keys(R).forEach(function (k) { var r = R[k]; r.M = metrics(r.f, r.scale, r.seg); r.h = r.f.size * r.scale; });
      var adv = function (it) { var r = R[it.role]; return (gw(ul(it.ch), r.seg) + r.M.tr) * r.M.ux; }, wOf = function (role) { var w = 0, r = R[role], n = 0; items.forEach(function (it) { if (it.role === role) { w += adv(it); n++; } }); return n ? w - r.M.tr * r.M.ux : 0; };
      var mw = wOf('main'), swd = wOf('suffix'), lwd = wOf('label'), nh = R.main.h, sw = swd ? swd + 2 : 0;
      if (o.align === 'center') x -= (mw + sw) / 2; if (o.baseline === 'bottom') y -= nh;
      var cx = { main: x, suffix: x + mw + 2, label: x + (mw + sw) / 2 - lwd / 2 };
      var cy = { main: y, suffix: y + nh - R.suffix.h, label: y - R.label.h - (o.labelGap == null ? 3 : o.labelGap) - (crit ? 1 : 0) };
      var age = o.age, life = o.life, fast = age != null && life > 0 && age < 0.2 * life, out = [], lead = null, labFirst = null, labA = 0;
      items.forEach(function (it, j) {
        var r = R[it.role], d = (o.glyphOffset && o.glyphOffset(j, it)) || {}, ch = ul(it.ch), gwp = gw(ch, r.seg) * r.M.ux, gx = cx[it.role] + (d.dx || 0), gy = cy[it.role] + (d.dy || 0);
        cx[it.role] += adv(it);
        if (d.skip || ch === ' ') return;
        var a = d.alpha != null ? d.alpha : o.alpha != null ? o.alpha : 1, sx = d.sx || 1, sy = d.sy || 1;
        if (it.role === 'main' && !lead) lead = { x: gx, y: gy, a: a };
        if (it.role === 'label') { if (!labFirst) labFirst = { dx: d.dx || 0, dy: d.dy || 0 }; labA = Math.max(labA, a); }
        var col = d.flash ? '#ffffff' : r.col, halo = r.halo;   // the flash whitens the line only; the halo keeps its hue (no grey ring)
        var build = function (g, ox, oy) { g.beginPath(); g.save(); g.translate(gx + gwp / 2 + (ox || 0), gy + r.h + (oy || 0)); g.scale(sx, sy); addGlyph(g, ch, -gwp / 2, -r.h, r.M.u, r.M.ux, r.skew, r.seg); g.restore(); };
        var cap = r.seg ? 'butt' : 'round';
        var paint = function (g) {
          build(g); g.save(); g.lineCap = cap; g.lineJoin = 'round'; g.strokeStyle = '#000000'; g.lineWidth = r.lw + 2 * self.outline.number.width; g.stroke(); g.restore();   // black underlay
          if (it.role === 'main' && fast) { [-1, 1].forEach(function (k) { build(g, 0, k * 1.9 * sc); neon(g, halo, r.lw, { haloOnly: true, alpha: 0.6, k: 0.9, base: 0.6 }); }); }   // phosphor smear while moving fast
          if (crit && it.role === 'main') { build(g, -1 * sc, 0.8 * sc); neon(g, P.fx.echo, r.lw * 0.85, { k: 0.5, alpha: 0.9, core: false, cap: cap, base: 0.6 }); }   // magenta echo
          build(g); neon(g, col, r.lw, { halo: halo, k: d.flash ? (r.seg ? 1.6 : 1.15) : r.seg ? 1.3 : 1, cap: cap, base: r.seg ? 0.65 : r.lw });
        };
        if (a >= 1) paint(ctx); else API.fadeLayer(ctx, a, { x: gx - 6, y: gy - 6, w: gwp + 12, h: r.h + 12 }, paint);
        out.push({ i: j, x: gx, y: gy, w: gwp, h: r.h, role: it.role });
      });
      // CRITICAL: two dashes flanking the label
      if (labFirst && labA > 0 && lwd) {
        var ly = cy.label + labFirst.dy + R.label.h / 2, lx0 = x + (mw + sw) / 2 - lwd / 2 + labFirst.dx, lx1 = lx0 + lwd;
        API.fadeLayer(ctx, labA, { x: lx0 - 12, y: ly - 4, w: lwd + 24, h: 8 }, function (g) { g.beginPath(); g.moveTo(lx0 - 8, ly); g.lineTo(lx0 - 3, ly); g.moveTo(lx1 + 3, ly); g.lineTo(lx1 + 8, ly); neon(g, P.fx.echo, 0.8, { k: 0.8 }); });
      }
      // crit: line sparks radiating from the numerals for the first 420 ms
      if (crit && lead && age != null && age < 420) {
        var p = age / 420, ccx = x + mw / 2, ccy = lead.y + nh / 2, n = 12;
        ctx.save();
        for (var k = 0; k < n; k++) {
          var an = k / n * Math.PI * 2 + hsh(k, 7) * 0.4, r0 = mw * 0.55 + 3 + p * 16 * (0.7 + hsh(k, 3) * 0.6), len = 5 * (1 - p) + 1;
          ctx.beginPath(); ctx.moveTo(ccx + Math.cos(an) * r0, ccy + Math.sin(an) * r0 * 0.7); ctx.lineTo(ccx + Math.cos(an) * (r0 + len), ccy + Math.sin(an) * (r0 + len) * 0.7);
          neon(ctx, k % 3 === 0 ? P.fx.echo : k % 3 === 1 ? P.fx.crit : '#ffffff', 0.7, { k: 0.8, alpha: (1 - p) * lead.a });
        }
        ctx.restore();
      }
      return out;
    },

    // overlay: faint additive tint, inset wire square per cell, glowing boundary line; 'pulsing' = a scan wave across the set
    overlay: function (g, r, kind, t, o) {
      o = o || {}; var Cc = this.palette.overlay[kind] || this.palette.overlay.move, OS = this.overlayStyle, gr = o.grow == null ? 1 : o.grow;
      if (!(gr > 0)) return;
      var X = r.x, Y = r.y, W = r.w, H = r.h, tx = o.tile ? o.tile.x : 0, ty = o.tile ? o.tile.y : 0, E = o.edges || {}, pat = o.pattern || OS.pattern, col = Cc.fill;
      var wave = pat === 'pulsing' ? Math.pow(Math.max(0, Math.sin((tx + ty) * 0.55 - (t || 0) * 3.2)), 3) : pat === 'checker' ? ((tx + ty) % 2 ? 0.5 : 0) : 0;
      g.save(); g.globalCompositeOperation = 'lighter';
      g.fillStyle = C.rgba(col, ((Cc.alpha == null ? OS.alpha : Cc.alpha) + wave * OS.wave) * gr); g.fillRect(X, Y, W, H);
      g.strokeStyle = C.rgba(col, (OS.inner + wave * 0.35) * gr); g.lineWidth = 0.45; g.strokeRect(X + 2, Y + 2, W - 4, H - 4);
      g.lineWidth = 0.5; g.strokeStyle = C.rgba(col, (0.45 + wave * 0.3) * gr); g.beginPath();
      var mx = X + W / 2, my = Y + H / 2;
      if (kind === 'attack') { g.moveTo(mx - 1.6, my - 1.6); g.lineTo(mx + 1.6, my + 1.6); g.moveTo(mx + 1.6, my - 1.6); g.lineTo(mx - 1.6, my + 1.6); }
      else if (kind === 'heal') { g.moveTo(mx - 2, my); g.lineTo(mx + 2, my); g.moveTo(mx, my - 2); g.lineTo(mx, my + 2); }
      else if (kind === 'threat') { g.moveTo(X + 2, Y + H * 0.55); g.lineTo(X + W * 0.45, Y + 2); g.moveTo(X + W * 0.55, Y + H - 2); g.lineTo(X + W - 2, Y + H * 0.45); }
      else { g.moveTo(mx - 0.5, my); g.lineTo(mx + 0.5, my); }
      g.stroke(); g.restore();
      var e = 0.6; g.beginPath();
      if (E.top) { g.moveTo(X, Y + e); g.lineTo(X + W, Y + e); } if (E.bottom) { g.moveTo(X, Y + H - e); g.lineTo(X + W, Y + H - e); }
      if (E.left) { g.moveTo(X + e, Y); g.lineTo(X + e, Y + H); } if (E.right) { g.moveTo(X + W - e, Y); g.lineTo(X + W - e, Y + H); }
      if (E.top || E.bottom || E.left || E.right) neon(g, Cc.edge, OS.edgeWidth, { k: 0.85, alpha: gr, cap: 'square', dash: kind === 'threat' ? [2.2, 1.4] : null });
    },

    // bar: LED segment meter. style gauge = bracket ends; meter = plain outline
    bar: function (g, r, frac, kind, o) {
      o = o || {}; var P = this.palette, B = P.bars, SH = this.shape, x = r.x, y = r.y, w = r.w, h = r.h;
      var f = Math.max(0, Math.min(1, frac || 0)), col = kind ? B[kind] || B.charge : N.cyan;
      g.save();
      g.fillStyle = '#000000'; g.fillRect(x - 0.5, y - 0.5, w + 1, h + 1);
      g.beginPath(); g.rect(x - 0.25, y - 0.25, w + 0.5, h + 0.5); neon(g, col, 0.35, { k: 0.25, alpha: 0.55, core: false });
      if (o.style === 'gauge') { g.beginPath(); g.moveTo(x - 1.2, y - 1.5); g.lineTo(x - 2, y - 1.5); g.lineTo(x - 2, y + h + 1.5); g.lineTo(x - 1.2, y + h + 1.5); g.moveTo(x + w + 1.2, y - 1.5); g.lineTo(x + w + 2, y - 1.5); g.lineTo(x + w + 2, y + h + 1.5); g.lineTo(x + w + 1.2, y + h + 1.5); neon(g, col, 0.5, { k: 0.5 }); }
      var sw = SH.segW, gap = SH.segGap, n = Math.max(1, Math.floor((w - 1 + gap) / (sw + gap))), lit = f * n, ix = x + 0.5, iy = y + 0.75, ih = Math.max(0.8, h - 1.5);
      g.globalCompositeOperation = 'lighter';
      for (var i = 0; i < n; i++) {
        var on = Math.max(0, Math.min(1, lit - i)), sx = ix + i * (sw + gap);
        if (!kind || on <= 0) { g.fillStyle = C.rgba(col, 0.1); g.fillRect(sx, iy, sw, ih); continue; }
        g.fillStyle = C.rgba(col, 0.22 * on); g.fillRect(sx - 0.6, iy - 0.8, sw + 1.2, ih + 1.6);
        g.fillStyle = C.rgba(col, 0.9 * on); g.fillRect(sx, iy, sw, ih);
        g.fillStyle = C.rgba(core(col), 0.9 * on); g.fillRect(sx + 0.4, iy + ih * 0.35, sw - 0.8, ih * 0.3);
      }
      if (o.tag && B[o.tag]) { g.fillStyle = B[o.tag]; g.fillRect(x - 3.5, y, 1, h); }
      g.restore();
    },

    // cursor: 'bracket' = glowing corner brackets with afterimages; 'hand' = a small vector ship, tip at the rect's right-middle
    cursor: function (g, r, kind, t, o) {
      o = o || {}; t = t || 0; var P = this.palette, col = o.invalid ? N.magenta : N.yellow, PS = this.motion.persistence;
      g.save(); if (o.alpha != null) g.globalAlpha *= o.alpha;
      if (kind === 'hand') {
        var shipAt = function (tt) {
          var nx = -0.4 * (1 + Math.sin(tt * 9)), x0 = r.x + nx, y0 = r.y, w = r.w, h = r.h, my = y0 + h / 2;   // nudges back only: the tip stays >= 1.3 px off the target
          return [[x0 + w - 1.3, my], [x0, y0], [x0 + w * 0.32, my], [x0, y0 + h]];
        };
        for (var k = PS.ghosts; k >= 1; k--) { g.beginPath(); polyPath(g, shipAt(t - k * PS.dtMs / 1000), true); neon(g, col, 0.6, { haloOnly: true, alpha: Math.pow(PS.decay, k), k: 0.8 }); }
        var S = shipAt(t), fl = 1.4 + Math.abs(Math.sin(t * 23)) * 1.6;
        g.beginPath(); g.moveTo(S[2][0] - 0.4, S[2][1]); g.lineTo(S[2][0] - fl - 0.8, S[2][1]); neon(g, N.magenta, 0.6, { k: 0.8 });
        blackFill(g, function (q) { polyPath(q, S, true); });
        g.beginPath(); polyPath(g, S, true); neon(g, col, 0.75, { k: 1 });
      } else {
        var corners = function (tt) {
          var d = 0.4 + 0.9 * (0.5 + 0.5 * Math.sin(tt * 7)), L = Math.max(4, r.w * 0.32), x0 = r.x - d, y0 = r.y - d, x1 = r.x + r.w + d, y1 = r.y + r.h + d;
          g.beginPath();
          [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(function (c) { g.moveTo(c[0] + c[2] * L, c[1]); g.lineTo(c[0], c[1]); g.lineTo(c[0], c[1] + c[3] * L); });
        };
        for (var j = PS.ghosts; j >= 1; j--) { corners(t - j * PS.dtMs / 1000); neon(g, col, 0.8, { haloOnly: true, alpha: Math.pow(PS.decay, j) * 1.2, k: 0.9 }); }
        corners(t); neon(g, col, 0.9, { k: 1.1, under: 0.6 });
      }
      g.restore();
    },

    // path(ctx, points, t, {alpha, invalid}): hollow neon tube, marching core dashes, hollow arrowhead, comet spark
    path: function (g, pts, t, o) {
      o = o || {}; if (!pts || pts.length < 2) return; t = t || 0;
      var col = o.invalid ? N.magenta : this.palette.overlay.path.core, n = pts.length, end = pts[n - 1], prev = pts[n - 2];
      var L = Math.hypot(end.x - prev.x, end.y - prev.y) || 1, dx = (end.x - prev.x) / L, dy = (end.y - prev.y) / L, nx = -dy, ny = dx;
      var tip = { x: end.x + dx * 3.5, y: end.y + dy * 3.5 }, neck = { x: end.x - dx * 2.5, y: end.y - dy * 2.5 }, hw = 4.6;
      var line = pts.slice(0, n - 1).concat([neck]), head = [[tip.x, tip.y], [neck.x + nx * hw, neck.y + ny * hw], [neck.x - nx * hw, neck.y - ny * hw]];
      var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
      var box = { x: Math.min.apply(null, xs) - 12, y: Math.min.apply(null, ys) - 12, w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + 24, h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + 24 };
      var tube = function (q) { q.beginPath(); q.moveTo(line[0].x, line[0].y); for (var i = 1; i < line.length; i++) q.lineTo(line[i].x, line[i].y); };
      // cumulative lengths for the comet
      var segs = [], tot = 0; for (var i = 1; i < line.length; i++) { var l = Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y); segs.push(l); tot += l; }
      var at = function (u) { var d = ((u % 1) + 1) % 1 * tot; for (var i = 0; i < segs.length; i++) { if (d <= segs[i] || i === segs.length - 1) { var f = segs[i] ? Math.min(1, d / segs[i]) : 0; return { x: line[i].x + (line[i + 1].x - line[i].x) * f, y: line[i].y + (line[i + 1].y - line[i].y) * f }; } d -= segs[i]; } return line[0]; };
      API.fadeLayer(g, o.alpha == null ? 1 : o.alpha, box, function (q) {
        q.save(); q.lineJoin = 'round'; q.lineCap = 'round';
        // hollow tube: glow + colour at full width, then a black core leaves two glowing edges
        tube(q); neon(q, col, 4.8, { haloOnly: true, k: 0.7, base: 0.9 });
        tube(q); q.strokeStyle = col; q.lineWidth = 4.8; q.stroke(); q.strokeStyle = C.mix(col, '#ffffff', 0.5); q.lineWidth = 4.2; q.stroke();
        tube(q); q.strokeStyle = '#000000'; q.lineWidth = 3.1; q.stroke();
        // marching centre dashes
        tube(q); neon(q, col, 0.7, { k: 0.5, dash: [1.6, 2.6], dashOffset: -t * 14, cap: 'butt' });
        // start node: hollow ring
        blackFill(q, function (z) { z.arc(pts[0].x, pts[0].y, 2.6, 0, 7); });
        q.beginPath(); q.arc(pts[0].x, pts[0].y, 2.6, 0, 7); neon(q, col, 0.7, { k: 0.8 });
        // hollow arrowhead
        blackFill(q, function (z) { polyPath(z, head, true); });
        q.beginPath(); polyPath(q, head, true); neon(q, col, 0.85, { k: 1 });
        q.beginPath(); q.moveTo(neck.x + nx * 1.6 + dx * 1.2, neck.y + ny * 1.6 + dy * 1.2); q.lineTo(tip.x - dx * 2.2, tip.y - dy * 2.2); q.lineTo(neck.x - nx * 1.6 + dx * 1.2, neck.y - ny * 1.6 + dy * 1.2); neon(q, col, 0.45, { k: 0.4, alpha: 0.8 });
        // comet spark with a persistence tail
        var u = t * 0.9;
        for (var k = 5; k >= 0; k--) { var p = at(u - k * 0.022); q.beginPath(); q.arc(p.x, p.y, k ? 0.5 : 0.75, 0, 7); neon(q, '#ffffff', 0.5, { k: 1, alpha: k ? Math.pow(0.6, k) : 1 }); }
        q.restore();
      });
    }
  };

  /* ---------------- scene hooks: tile, prop, unitToken, atmosphere ---------------- */
  var LINE_A = 0.62;   // terrain lines sit below units and overlays
  function wire(g, pts, col, closed, o) { o = o || {}; if (closed && o.fill !== false) blackFill(g, function (q) { polyPath(q, pts, true); }); g.beginPath(); polyPath(g, pts, closed); neon(g, col, o.lw || 0.6, { k: o.k == null ? 0.6 : o.k, alpha: o.alpha == null ? LINE_A : o.alpha, core: o.core }); }

  skin.tile = function (g, r, kind, t) {
    var X = r.x, Y = r.y, w = r.w, h = r.h, tx = Math.round(X / 16), ty = Math.round(Y / 16), h1 = hsh(tx, ty, 1), h2 = hsh(tx, ty, 2), Tn = palette.terrain;
    t = t || 0; g.save();
    g.fillStyle = kind === 'water' || kind === 'bridge' ? '#00141c' : '#000000'; g.fillRect(X, Y, w, h);
    // wire-grid floor: the cell's top and left edges, a brighter dot at the crossing
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = C.rgba(N.cyan, kind === 'water' ? 0.08 : 0.13); g.lineWidth = 0.4; g.beginPath(); g.moveTo(X, Y + 0.2); g.lineTo(X + w, Y + 0.2); g.moveTo(X + 0.2, Y); g.lineTo(X + 0.2, Y + h); g.stroke();
    g.fillStyle = C.rgba(N.cyan, 0.42); g.fillRect(X - 0.35, Y - 0.35, 0.9, 0.9);
    g.globalCompositeOperation = 'source-over';
    if (kind === 'grass') {
      if (h1 < 0.22) { g.globalCompositeOperation = 'lighter'; g.fillStyle = C.rgba(N.green, 0.4); g.fillRect(X + 4 + h2 * 8, Y + 5 + h1 * 30, 0.7, 0.7); g.globalCompositeOperation = 'source-over'; }
    } else if (kind === 'water') {
      for (var i = 0; i < 2; i++) {
        var wy = Y + h * (0.32 + i * 0.4), ph = t * 2.2 + tx * 1.3 + i * 2.1;
        g.beginPath(); for (var k = 0; k <= 8; k++) { var px = X + k * w / 8, py = wy + Math.sin(ph + k * 0.8) * 1.1; if (k) g.lineTo(px, py); else g.moveTo(px, py); }
        neon(g, Tn.water, 0.45, { k: 0.5, alpha: 0.5, core: false });
      }
    } else if (kind === 'forest') {
      pine(g, X + 5, Y + h - 2, 0.8); pine(g, X + 11, Y + h - 0.5, 0.95);
    } else if (kind === 'hill') {
      g.beginPath(); g.moveTo(X + 1, Y + h - 2); g.quadraticCurveTo(X + w / 2, Y + 1, X + w - 1, Y + h - 2); g.moveTo(X + 4, Y + h - 2); g.quadraticCurveTo(X + w / 2, Y + 6, X + w - 4, Y + h - 2); neon(g, Tn.hill, 0.5, { k: 0.5, alpha: 0.6 });
    } else if (kind === 'mountain') {
      wire(g, [[X + 1, Y + h - 1.5], [X + w * 0.45, Y + 2], [X + w * 0.62, Y + 6], [X + w * 0.75, Y + 4], [X + w - 1, Y + h - 1.5]], Tn.mountain, true);
      g.beginPath(); g.moveTo(X + w * 0.45, Y + 2); g.lineTo(X + w * 0.52, Y + h - 1.5); g.moveTo(X + w * 0.75, Y + 4); g.lineTo(X + w * 0.66, Y + h - 1.5); neon(g, Tn.mountain, 0.35, { k: 0.3, alpha: 0.45, core: false });
    } else if (kind === 'road' || kind === 'sand') {
      g.beginPath();
      if (kind === 'road') { g.moveTo(X, Y + 3); g.lineTo(X + w, Y + 3); g.moveTo(X, Y + h - 3); g.lineTo(X + w, Y + h - 3); neon(g, Tn.road, 0.45, { k: 0.4, alpha: 0.5, dash: [3, 2], core: false }); }
      else { for (var d = 0; d < 5; d++) { var sx = X + 2 + hsh(tx, ty, 10 + d) * (w - 4), sy = Y + 2 + hsh(tx, ty, 20 + d) * (h - 4); g.moveTo(sx, sy); g.lineTo(sx + 0.3, sy); } neon(g, Tn.sand, 0.6, { k: 0.4, alpha: 0.5 }); }
    } else if (kind === 'bridge') {
      g.beginPath(); for (var p = 0; p < 4; p++) { g.moveTo(X + 1, Y + 2 + p * 4); g.lineTo(X + w - 1, Y + 2 + p * 4); } neon(g, Tn.bridge, 0.4, { k: 0.4, alpha: 0.5, core: false });
      g.beginPath(); g.moveTo(X + 0.6, Y); g.lineTo(X + 0.6, Y + h); g.moveTo(X + w - 0.6, Y); g.lineTo(X + w - 0.6, Y + h); neon(g, Tn.bridge, 0.6, { k: 0.6, alpha: 0.7 });
    } else if (kind === 'fort') {
      wire(g, [[X + 2, Y + h - 1], [X + 2, Y + 5], [X + 4.5, Y + 5], [X + 4.5, Y + 3], [X + 7, Y + 3], [X + 7, Y + 5], [X + 9, Y + 5], [X + 9, Y + 3], [X + 11.5, Y + 3], [X + 11.5, Y + 5], [X + 14, Y + 5], [X + 14, Y + h - 1]], Tn.fort, true);
      g.beginPath(); g.moveTo(X + 6, Y + h - 1); g.lineTo(X + 6, Y + 10); g.lineTo(X + 10, Y + 10); g.lineTo(X + 10, Y + h - 1); neon(g, Tn.fort, 0.45, { k: 0.4, alpha: 0.55 });
    } else if (kind === 'wall') {
      g.beginPath(); for (var row = 0; row < 3; row++) { var yy = Y + 1 + row * 5; g.moveTo(X, yy + 4.5); g.lineTo(X + w, yy + 4.5); for (var b = 0; b < 2; b++) { var bx2 = X + ((b * 8 + (row % 2) * 4) % w) + 0.5; g.moveTo(bx2, yy); g.lineTo(bx2, yy + 4.5); } } neon(g, Tn.wall, 0.4, { k: 0.4, alpha: 0.45, core: false });
    } else if (kind === 'floor') {
      g.beginPath(); g.rect(X + 2, Y + 2, w - 4, h - 4); neon(g, Tn.floor, 0.35, { k: 0.3, alpha: 0.3, core: false });
    }
    g.restore();
  };
  function pine(g, cx, by, s) {
    var pts = [[cx, by - 13 * s], [cx + 3 * s, by - 8 * s], [cx + 1.6 * s, by - 8 * s], [cx + 4.4 * s, by - 3 * s], [cx + 1, by - 3 * s], [cx + 1, by], [cx - 1, by], [cx - 1, by - 3 * s], [cx - 4.4 * s, by - 3 * s], [cx - 1.6 * s, by - 8 * s], [cx - 3 * s, by - 8 * s]];
    wire(g, pts, N.green, true, { lw: 0.55 });
  }

  // prop(ctx, cell, kind, t, {light, lights, seed}): wireframe standing objects; lit props get bright line flames / facets
  skin.prop = function (g, r, kind, t, o) {
    o = o || {}; t = t || 0; var X = r.x, Y = r.y, w = r.w, h = r.h, cx = X + w / 2, by = Y + h - 1.5, sd = o.seed || 0, L = o.light, it = L ? Math.max(0.3, Math.min(1, (L.intensity || 0.5) * 1.6)) : 1;
    g.save();
    var ring = function (col, rr, a) { g.beginPath(); g.ellipse(cx, by + 0.5, rr, rr * 0.3, 0, 0, 7); neon(g, col, 0.4, { k: 0.4, alpha: a, core: false }); };
    if (kind === 'tree') { pine(g, cx, by + 1, 1.15); }
    else if (kind === 'bush') {
      var pts = []; for (var k = 0; k <= 10; k++) { var an = Math.PI + k / 10 * Math.PI, rr = (k % 2 ? 4.2 : 5.6); pts.push([cx + Math.cos(an) * rr * 1.15, by - 0.5 + Math.sin(an) * rr]); }
      wire(g, pts, N.green, true, { lw: 0.55, alpha: 0.8 });
      g.beginPath(); g.moveTo(cx - 3, by - 1); g.lineTo(cx - 1, by - 3.5); g.moveTo(cx + 2.5, by - 1); g.lineTo(cx + 1, by - 4); neon(g, N.green, 0.35, { k: 0.3, alpha: 0.5, core: false });
    }
    else if (kind === 'brazier') {
      ring(N.yellow, 6, 0.35 * it);
      g.beginPath(); g.moveTo(cx - 4, by); g.lineTo(cx - 1.5, by - 6); g.moveTo(cx + 4, by); g.lineTo(cx + 1.5, by - 6); g.moveTo(cx, by); g.lineTo(cx, by - 6); neon(g, '#9fdcff', 0.5, { k: 0.4, alpha: 0.7 });
      wire(g, [[cx - 5, by - 9], [cx + 5, by - 9], [cx + 3, by - 6], [cx - 3, by - 6]], N.yellow, true, { lw: 0.65, alpha: 0.9 });
      // line flames: three tongues whose height follows the host's light intensity
      for (var f = 0; f < 3; f++) {
        var fx = cx + (f - 1) * 2.4, fh = (5 + 3 * Math.sin(t * (9 + f * 2.3) + f * 1.7)) * (0.6 + it * 0.5) * (f === 1 ? 1.25 : 0.9), sw = Math.sin(t * 6 + f) * 0.8;
        g.beginPath(); g.moveTo(fx - 1.2, by - 9); g.quadraticCurveTo(fx - 1 + sw, by - 9 - fh * 0.55, fx + sw * 1.4, by - 9 - fh); g.quadraticCurveTo(fx + 1 + sw, by - 9 - fh * 0.45, fx + 1.2, by - 9);
        neon(g, f === 1 ? N.yellow : N.magenta, 0.55, { k: 1.1, alpha: 0.95 });
      }
    }
    else if (kind === 'lamp') {
      ring(N.yellow, 4.5, 0.3 * it);
      g.beginPath(); g.moveTo(cx, by); g.lineTo(cx, by - 9); g.moveTo(cx - 2.5, by); g.lineTo(cx + 2.5, by); neon(g, '#9fdcff', 0.5, { k: 0.4, alpha: 0.7 });
      wire(g, [[cx - 2.6, by - 9], [cx + 2.6, by - 9], [cx + 2, by - 14.5], [cx - 2, by - 14.5]], N.yellow, true, { lw: 0.6, alpha: 0.9 });
      g.beginPath(); g.moveTo(cx - 3, by - 14.5); g.lineTo(cx, by - 16.5); g.lineTo(cx + 3, by - 14.5); neon(g, '#9fdcff', 0.5, { k: 0.4, alpha: 0.7 });
      g.beginPath(); g.moveTo(cx, by - 10.5); g.lineTo(cx, by - 13); neon(g, '#ffffff', 0.9, { k: 1.3 * it, alpha: 0.6 + 0.4 * it });
    }
    else if (kind === 'crystal') {
      var pulse = 0.75 + 0.25 * Math.sin(t * 3.1), top = by - 15, mid = by - 7;
      ring(N.cyan, 5, 0.45 * pulse);
      var C1 = [[cx, top], [cx + 4, mid], [cx, by - 1], [cx - 4, mid]];
      wire(g, C1, N.cyan, true, { lw: 0.7, alpha: 0.95, k: 1.1 * pulse });
      g.beginPath(); g.moveTo(cx, top); g.lineTo(cx + 1.2, mid); g.lineTo(cx, by - 1); g.moveTo(cx - 4, mid); g.lineTo(cx + 1.2, mid); g.lineTo(cx + 4, mid); neon(g, N.cyan, 0.4, { k: 0.5, alpha: 0.7 * pulse });
      wire(g, [[cx + 5.5, by - 6], [cx + 7, by - 3], [cx + 5.5, by - 1], [cx + 4.4, by - 3]], N.cyan, true, { lw: 0.5, alpha: 0.75 });
    }
    else {   // stone / rock / unknown: low-poly wire boulder
      var j = hsh(sd, 3) * 1.5;
      var R0 = [[X + 2, by], [X + 2.5 + j, by - 5], [X + 6, by - 9], [X + 11, by - 8.5 - j], [X + 14, by - 4], [X + 14, by]];
      wire(g, R0, '#9fdcff', true, { lw: 0.6, alpha: 0.75 });
      g.beginPath(); g.moveTo(X + 6, by - 9); g.lineTo(X + 8, by - 4); g.lineTo(X + 14, by - 4); g.moveTo(X + 8, by - 4); g.lineTo(X + 5, by); g.moveTo(X + 2.5 + j, by - 5); g.lineTo(X + 8, by - 4); neon(g, '#9fdcff', 0.35, { k: 0.3, alpha: 0.45, core: false });
    }
    g.restore();
  };

  // unitToken(ctx, rect, unit, t): wireframe figures, black-filled (hidden lines), team colour glow, a glowing ring at the feet
  var ORB = { a: N.yellow, b: N.magenta, n: N.green };
  function figure(kind) {   // shapes in local units: feet at (0, 0), up is negative; [type, points | circle, accent?]
    var S = [];
    var poly = function (p, accent, open) { S.push({ t: open ? 'line' : 'poly', p: p, accent: accent }); };
    var circ = function (x, y, r, accent, fill) { S.push({ t: 'circle', x: x, y: y, r: r, accent: accent, fill: fill }); };
    if (kind === 'monster') {
      poly([[-6, 0], [-6.5, -6], [-4, -10], [-5.5, -13], [-2, -11], [2, -11], [5.5, -13], [4, -10], [6.5, -6], [6, 0]]);
      circ(-2, -6.5, 0.8, true, true); circ(2, -6.5, 0.8, true, true); poly([[-2.5, -3], [-1.2, -2], [0, -3], [1.2, -2], [2.5, -3]], false, true);
      return S;
    }
    if (kind === 'mage') {
      poly([[5, 0], [5, -14]], false, true); circ(5, -15.8, 1.7, true, true);
      poly([[-3.8, 0], [3.8, 0], [2.2, -9.5], [-2.2, -9.5]]); poly([[-2.6, -5], [2.6, -5]], false, true);
      circ(0, -12, 2.5);
      poly([[-4.4, -13.6], [4.4, -13.6], [0.6, -21], [-0.4, -19]]);
      return S;
    }
    // legs
    poly([[-2, 0], [-1.6, -4]], false, true); poly([[2, 0], [1.6, -4]], false, true);
    if (kind === 'fighter') {
      poly([[5, -1], [5, -14]], false, true); poly([[5, -14.5], [8.6, -15.5], [8.6, -10.5], [5, -11.5]], true);
      poly([[-4.2, -3.6], [4.2, -3.6], [3.4, -10], [-3.4, -10]]);
      poly([[-2.8, -10.2], [-3.4, -13.2], [-2, -15], [2, -15], [3.4, -13.2], [2.8, -10.2]]);
      circ(-1.2, -12.6, 0.55, true, true); circ(1.2, -12.6, 0.55, true, true);
      poly([[-2.4, -15], [-3.6, -17.2]], false, true); poly([[2.4, -15], [3.6, -17.2]], false, true);
      return S;
    }
    if (kind === 'archer') {
      S.push({ t: 'arc', x: 3, y: -8.5, r: 5.5, a0: -1.25, a1: 1.25 }); poly([[4.9, -13.7], [4.9, -3.3]], true, true);
      poly([[-3.6, -3.6], [3.6, -3.6], [3, -10], [-3, -10]]);
      circ(0, -12.6, 2.5); poly([[-2.6, -13], [0, -16.2], [2.6, -13]], false, true);
      return S;
    }
    // knight (default) and lord
    poly([[5, -2.5], [5, -15.5]], true, true); poly([[3.4, -6], [6.6, -6]], true, true);
    poly([[-3.6, -3.6], [3.6, -3.6], [3, -10], [-3, -10]]);
    poly([[-3, -10.4], [-3, -14.4], [-1.6, -16], [1.6, -16], [3, -14.4], [3, -10.4]]); poly([[-3, -13], [3, -13]], false, true);
    poly([[0, -16], [-0.8, -18.4], [-3, -18.8]], true, true);
    poly([[-7.2, -10], [-3.6, -10], [-3.6, -6], [-5.4, -3.8], [-7.2, -6]]); poly([[-6.4, -8.6], [-5.4, -7.2], [-4.4, -8.6]], false, true);
    return S;
  }
  function shapesPath(g, S, pick) {
    g.beginPath();
    S.forEach(function (s) {
      if (!pick(s)) return;
      if (s.t === 'circle') { g.moveTo(s.x + s.r, s.y); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); }
      else if (s.t === 'arc') { g.moveTo(s.x + Math.cos(s.a0) * s.r, s.y + Math.sin(s.a0) * s.r); g.arc(s.x, s.y, s.r, s.a0, s.a1); }
      else polyPath(g, s.p, s.t === 'poly');
    });
  }
  skin.unitToken = function (g, r, u, t) {
    u = u || {}; t = t || 0; var team = u.team || 'a', kind = u.kind || 'fighter', col = u.dead ? '#4c8f9a' : (palette.team[team] || N.cyan), acc = u.dead ? col : (ORB[team] || N.yellow);
    var sc = Math.min(r.w / 16, r.h / 24), cx = r.x + r.w / 2, fy = r.y + r.h - 1.2 * sc, PS = skin.motion.persistence, S = figure(kind);
    var bobAt = function (tt) { return u.selected ? -1.8 * Math.abs(Math.sin(tt * 4.2)) : 0; };
    g.save(); if (u.dead) g.globalAlpha *= 0.45;
    var lw = 0.8 / sc;
    if (!u.noShadow) {
      g.beginPath(); g.ellipse(cx, fy + 0.3, 6.2 * sc, 1.8 * sc, 0, 0, 7); neon(g, col, 0.45, { k: 0.5, alpha: u.selected ? 0.9 : 0.45, core: false });
      if (u.selected) { g.beginPath(); g.ellipse(cx, fy + 0.3, 7.6 * sc, 2.4 * sc, 0, 0, 7); neon(g, N.yellow, 0.45, { k: 0.5, alpha: 0.8, dash: [2, 2.5], dashOffset: -t * 9, core: false }); }
    }
    var place = function (tt) { g.save(); g.translate(cx, fy + bobAt(tt)); g.scale(sc * (u.facing === -1 ? -1 : 1), sc); };
    // afterimages of the hop (stateless: the same bob curve sampled a little earlier)
    if (u.selected) for (var k = PS.ghosts; k >= 1; k--) { var tk = t - k * PS.dtMs / 1000; if (Math.abs(bobAt(tk) - bobAt(t)) < 0.15) continue; place(tk); shapesPath(g, S, function () { return true; }); neon(g, col, lw, { haloOnly: true, alpha: Math.pow(PS.decay, k), k: 0.9 }); g.restore(); }
    place(t);
    S.forEach(function (s) { if (s.t === 'poly' || (s.t === 'circle' && !s.fill)) blackFill(g, function (q) { if (s.t === 'circle') q.arc(s.x, s.y, s.r, 0, 7); else polyPath(q, s.p, true); }); });
    shapesPath(g, S, function (s) { return !s.accent; }); neon(g, col, lw, { k: 0.85 });
    var orbGlow = 0.8 + 0.3 * Math.sin(t * 5);
    shapesPath(g, S, function (s) { return s.accent; }); neon(g, acc, lw, { k: orbGlow });
    g.restore(); g.restore();
  };

  // atmosphere: 'world' = additive light pools under the props; 'final' = CRT scanlines + vignette (optional, skin.crt)
  var LCOL = { fire: N.yellow, lamp: N.yellow, crystal: N.cyan, magic: N.magenta, sun: N.yellow, moon: N.cyan };
  skin.atmosphere = function (g, view, t, o) {
    o = o || {}; var x = view.x, y = view.y, w = view.w, h = view.h;
    g.save();
    if (o.phase === 'world') {
      g.globalCompositeOperation = 'lighter';
      API.normLights(o.lights).forEach(function (l) {
        var col = LCOL[l.kind] || l.col, rr = l.r * 0.85, gr = g.createRadialGradient(l.x, l.y - 2, 0, l.x, l.y - 2, rr);
        gr.addColorStop(0, C.rgba(col, 0.2 * Math.min(1, l.intensity * 1.6))); gr.addColorStop(0.5, C.rgba(col, 0.05 * Math.min(1, l.intensity * 1.6))); gr.addColorStop(1, C.rgba(col, 0));
        g.fillStyle = gr; g.fillRect(l.x - rr, l.y - 2 - rr, rr * 2, rr * 2);
      });
    } else if (o.phase === 'final') {
      var CR = this.crt || {};
      if (CR.vignette > 0) { var vg = g.createRadialGradient(x + w / 2, y + h / 2, h * 0.42, x + w / 2, y + h / 2, Math.hypot(w, h) * 0.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + CR.vignette + ')'); g.fillStyle = vg; g.fillRect(x, y, w, h); }
      if (CR.scanlines > 0) { g.fillStyle = 'rgba(0,0,0,' + CR.scanlines + ')'; var pit = CR.pitch || 2; for (var yy = y + pit / 2; yy < y + h; yy += pit) g.fillRect(x, yy, w, pit / 2); }
    }
    g.restore();
  };

  API.register(skin);
})(typeof window !== 'undefined' ? window : this);
