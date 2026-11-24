/* GameDNA skin 'hd-diorama' · HD pixel diorama · needs skin-api.js first
 *
 * Pixel sprites stand as cards inside a lit, miniature 3D-looking scene: a cool ambient light against warm
 * point lights that throw soft shadows, tilt-shift blur bands, dust motes in the air, bloom, a vignette.
 * The UI floats on top as thin gold-edged dark glass panels (frosted: the scene behind is blurred) with
 * crisp pixel text. Everything here is procedural; no images, no font files.
 *
 * Rendering contract (see STYLE.md §10):
 *   backing store = native (256x224) x an integer s, ctx.setTransform(s, 0, 0, s, 0, 0).
 *   Pixel things (text, numerals, sprite cards) are drawn at integer native coordinates with smoothing off,
 *   so each art pixel is an s x s square; light, glass, glow and blur are smooth at device resolution.
 *   A host that CSS-scales a native-size canvas still works, but loses the sub-pixel gold lines.
 *
 * Methods: frame text measure number overlay bar cursor (+ optional path, post.*, light).
 */
(function (root) {
  'use strict';
  var API = root.GameDNA_Skin;
  if (!API) { if (root.console) console.error('hd-diorama.js: load skin-api.js first'); return; }
  var rgb = API.color.rgb, mix = API.color.mix, rgba = API.color.rgba;

  /* ---------------- small canvas utils ---------------- */
  var POOL = {};
  function pooled(key, w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    var c = POOL[key]; if (!c) { c = document.createElement('canvas'); POOL[key] = c; }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else c.getContext('2d').clearRect(0, 0, w, h);
    return c;
  }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function devScale(ctx) { var m = ctx.getTransform ? ctx.getTransform() : null; return m ? Math.abs(m.a) || 1 : 1; }
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2)); g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function diamond(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hash(a, b, c) { var n = (a * 374761393 + (b || 0) * 668265263 + (c || 0) * 2147483647) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; }

  // blur by repeated halving (no ctx.filter); src = any canvas, returns a small canvas to draw back up
  function halve(src, sx, sy, sw, sh, levels, tag) {
    var cur = src, cx = sx, cy = sy, cw = sw, ch = sh;
    for (var l = 0; l < levels; l++) {
      var w = Math.max(1, Math.round(cw / 2)), h = Math.max(1, Math.round(ch / 2)), c = pooled('hv' + tag + l, w, h), g = c.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(cur, cx, cy, cw, ch, 0, 0, w, h);
      cur = c; cx = 0; cy = 0; cw = w; ch = h;
    }
    return { c: cur, w: cw, h: ch };
  }
  // frosted glass: blur what is already on ctx inside a rounded rect (native coords)
  function frost(ctx, x, y, w, h, rad, blurPx) {
    if (!ctx.canvas || !ctx.getTransform) return;
    var m = ctx.getTransform(), k = Math.abs(m.a) || 1, pad = blurPx * 2;
    var X = (x - pad) * m.a + m.e, Y = (y - pad) * m.d + m.f, W = (w + 2 * pad) * m.a, H = (h + 2 * pad) * m.d;
    var sx = Math.max(0, Math.floor(X)), sy = Math.max(0, Math.floor(Y)), ex = Math.min(ctx.canvas.width, Math.ceil(X + W)), ey = Math.min(ctx.canvas.height, Math.ceil(Y + H));
    if (ex - sx < 4 || ey - sy < 4) return;
    var lv = Math.max(1, Math.round(Math.log2(Math.max(2, blurPx * k)))), B = halve(ctx.canvas, sx, sy, ex - sx, ey - sy, lv, 'fr');
    ctx.save(); rr(ctx, x, y, w, h, rad); ctx.clip(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(B.c, 0, 0, B.w, B.h, sx, sy, ex - sx, ey - sy); ctx.restore();
  }
  // draw only the blurred shadow of an image (the image itself is pushed off-canvas)
  function glowImage(ctx, img, x, y, col, blurNative, alpha) {
    var k = devScale(ctx), off = 4000;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.shadowColor = col; ctx.shadowBlur = blurNative * k; ctx.shadowOffsetX = off * k; ctx.shadowOffsetY = 0;
    ctx.drawImage(img, x - off, y); ctx.restore();
  }

  /* ---------------- pixel fonts ---------------- */
  // UI: 5x7 proportional capitals, '#' = ink. Drawn row-shaded (lit from above) on a 1 px hard drop + soft halo.
  var UI_GLYPHS = {
    A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.', C: '.###.|#...#|#....|#....|#....|#...#|.###.',
    D: '###..|#..#.|#...#|#...#|#...#|#..#.|###..', E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
    G: '.###.|#...#|#....|#.###|#...#|#...#|.###.', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#', I: '###|.#.|.#.|.#.|.#.|.#.|###',
    J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..', K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
    M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#', O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
    P: '####.|#...#|#...#|####.|#....|#....|#....', Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..', U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
    V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..', W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
    0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '.#.|##.|.#.|.#.|.#.|.#.|###', 2: '.###.|#...#|....#|...#.|..#..|.#...|#####',
    3: '####.|....#|....#|.###.|....#|....#|####.', 4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
    6: '.###.|#....|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|..#..|..#..|..#..', 8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
    9: '.###.|#...#|#...#|.####|....#|....#|.###.', '.': '.|.|.|.|.|.|#', ',': '..|..|..|..|..|.#|#.', ':': '.|.|#|.|.|#|.', ';': '..|..|.#|..|..|.#|#.',
    '!': '#|#|#|#|#|.|#', '?': '.###.|#...#|....#|...#.|..#..|.....|..#..', '-': '....|....|....|####|....|....|....', '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
    '/': '....#|...#.|...#.|..#..|.#...|.#...|#....', "'": '#|#|.|.|.|.|.', '(': '.#|#.|#.|#.|#.|#.|.#', ')': '#.|.#|.#|.#|.#|.#|#.',
    '%': '#...#|#..#.|...#.|..#..|.#...|.#..#|#...#', '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....', '=': '....|....|####|....|####|....|....',
    '<': '...#|..#.|.#..|#...|.#..|..#.|...#', '>': '#...|.#..|..#.|...#|..#.|.#..|#...', '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.'
  };
  // Numerals: 6x9 high-contrast pixel digits (2 px stems, 1 px hairlines, footed 1 and 4), drawn at 1x or 2x.
  var NUM_GLYPHS = {
    0: '.####.|##..##|##..##|##..##|##..##|##..##|##..##|##..##|.####.', 1: '..##..|.###..|..##..|..##..|..##..|..##..|..##..|..##..|.####.',
    2: '.####.|##..##|....##|...##.|..##..|.##...|##....|##...#|######', 3: '.####.|##..##|....##|....##|..###.|....##|....##|##..##|.####.',
    4: '...##.|..###.|.#.##.|#..##.|######|...##.|...##.|...##.|..####', 5: '######|##....|##....|#####.|....##|....##|....##|##..##|.####.',
    6: '..###.|.##...|##....|#####.|##..##|##..##|##..##|##..##|.####.', 7: '######|#...##|....##|...##.|...##.|..##..|..##..|..##..|..##..',
    8: '.####.|##..##|##..##|.####.|##..##|##..##|##..##|##..##|.####.', 9: '.####.|##..##|##..##|##..##|.#####|....##|....##|...##.|.###..',
    '+': '......|......|..##..|..##..|######|..##..|..##..|......|......'
  };
  var ROWS = {};
  function rows(set, ch) {
    var k = (set === NUM_GLYPHS ? 'n' : 'u') + ch; if (ROWS[k]) return ROWS[k];
    var g = set[ch]; if (g == null && set === NUM_GLYPHS) return rows(UI_GLYPHS, ch);
    if (g == null) g = UI_GLYPHS['?'];
    return (ROWS[k] = g.split('|'));
  }
  function uiAdv(ch) { return ch === ' ' ? 3 : rows(UI_GLYPHS, ch)[0].length + 1; }
  function uiW(s, sc) { s = String(s).toUpperCase(); var w = 0; for (var i = 0; i < s.length; i++) w += uiAdv(s[i]); return Math.max(0, w - (s.length && s[s.length - 1] !== ' ' ? 1 : 0)) * (sc || 1); }

  // glyph run -> native-resolution canvas: fill (row-shaded c1 -> c2), sil (single colour), ol (1 px dilated outline)
  var TXT = {};
  function runCanvas(str, set, sc, c1, c2, kind) {
    var key = kind + '|' + (set === NUM_GLYPHS ? 'n' : 'u') + '|' + str + '|' + sc + '|' + c1 + '|' + c2;
    if (TXT[key]) return TXT[key];
    var H = (set === NUM_GLYPHS ? 9 : 7), list = [], w = 0, i, ch, r;
    for (i = 0; i < str.length; i++) {
      ch = str[i]; if (ch === ' ') { w += 3 * sc; continue; }
      r = rows(set, ch); list.push([w, r]); w += (r[0].length + 1) * sc;
    }
    w = Math.max(1, w - sc);
    var o = kind === 'ol' ? 1 : 0, c = mk(w + 2 * o, H * sc + 2 * o), g = c.getContext('2d');
    var plot = function (dx, dy, colAt) {
      list.forEach(function (it) {
        var rs = it[1];
        for (var y = 0; y < rs.length; y++) for (var x = 0; x < rs[y].length; x++) if (rs[y][x] === '#') { g.fillStyle = colAt(y, rs.length); g.fillRect(it[0] + x * sc + dx + o, y * sc + dy + o, sc, sc); }
      });
    };
    if (kind === 'ol') { for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) plot(dx, dy, function () { return c1; }); }
    else if (kind === 'sil') plot(0, 0, function () { return c1; });
    else plot(0, 0, function (y, n) {
      var t = n > 1 ? y / (n - 1) : 0, base = mix(c1, c2 || mix(c1, '#6a5a44', 0.45), t);
      return y === 0 ? mix(base, '#ffffff', 0.35) : base;
    });
    var out = { c: c, w: w, h: H * sc, o: o };
    if (Object.keys(TXT).length > 600) TXT = {};
    return (TXT[key] = out);
  }

  /* ---------------- palette ---------------- */
  var palette = {
    ink: '#0b0a10', paper: '#f2ead8',
    ui: {
      fill: 'rgba(22,24,40,0.78)', fillTo: 'rgba(10,12,22,0.84)', edge: '#6e5426', highlight: '#c9a45c', shadow: 'rgba(2,2,8,0.55)',
      gold: '#c9a45c', goldHi: '#f0d898', goldDk: '#6e5426', select: 'rgba(255,226,150,0.14)', selectEdge: 'rgba(240,216,152,0.55)', well: 'rgba(0,0,0,0.30)',
      glass: { a: ['rgba(26,40,74,0.74)', 'rgba(10,16,34,0.84)'], b: ['rgba(64,22,28,0.74)', 'rgba(28,8,14,0.84)'], n: ['rgba(26,26,42,0.72)', 'rgba(10,10,20,0.82)'] }
    },
    team: { a: '#5f8fe0', b: '#e0624e', n: '#8d8a9c', aLight: '#a8c4ff', aDark: '#2c4680', bLight: '#ffb8a8', bDark: '#7a2a24', aText: '#cfe0ff', bText: '#ffd2c6' },
    overlay: {
      move: { fill: '#4a86ff', edge: '#cfe2ff', glow: '#6aa8ff', alpha: 0.24 }, attack: { fill: '#ff3a3a', edge: '#ffd0c4', glow: '#ff5048', alpha: 0.22 },
      threat: { fill: '#b04ae0', edge: '#f0d4ff', glow: '#c070ff', alpha: 0.22 }, heal: { fill: '#3ad07a', edge: '#d4ffe0', glow: '#5aff9a', alpha: 0.24 },
      path: { core: '#fff8e4', light: '#ffe6a0', mid: '#e8b860', dark: '#8a5a20', outline: '#160c06', spark: '#ffffff', glow: '#ffc870' },
      pathBad: { core: '#f0e4e0', light: '#c8a8a0', mid: '#8a6a68', dark: '#4a3434', outline: '#140a0a', spark: '#ffd0c8', glow: '#ff6a5a' }
    },
    fx: { hot: '#ffa860', cold: '#7ac8ff', heal: '#7aff9a', crit: '#ffd870', status: '#c89aff', white: '#fff6e0', ember: '#ff7a3a' },
    text: {
      main: '#f2ead8', main2: '#cdbf9e', shadow: '#05040a', outline: '#0b0a10', dim: '#8d8a9c', dim2: '#625f72', accent: '#ffe6a0',
      select: '#fff0c0', title: '#fff4d8', title2: '#d8b870', label: '#d8b46a', label2: '#a07a3e', gold: '#f0d898', gold2: '#c09048',
      plate: '#f2ead8', plateShadow: '#05040a', pointer: '#f0d898', pointerEdge: '#1a1008'
    },
    // number colours per kind: [top, bottom, glow]
    numbers: {
      damage: ['#ffffff', '#c4d0f0', '#a8c0ff'], crit: ['#fffbe0', '#ffa830', '#ffc860'], heal: ['#f0fff0', '#4ad880', '#5aff9a'],
      mp: ['#eaf6ff', '#4a9cff', '#7ac8ff'], miss: ['#f4f0e8', '#8e8a9c', null], status: ['#f8eeff', '#a872f0', '#c89aff'], label: ['#fff0b0', '#e09a30', '#ffc860']
    },
    // gauge fills [top, mid, bottom]
    bars: {
      track: 'rgba(4,4,10,0.62)', charge: ['#f6e6b0', '#d6ae5c', '#8a6428'], ready: ['#ffffff', '#fff0b8', '#e0b860'], queued: ['#d8e4ff', '#8ea8e8', '#4a5c9a'],
      haste: ['#eaffb8', '#a8e060', '#5a8a2a'], slow: ['#e8d8ff', '#a88ae0', '#5a4290'], enemy: ['#ffd0c0', '#e0705a', '#8a2a2a'], enemyFull: ['#fff6d0', '#ffd060', '#c08020'],
      hp: ['#e0ffd0', '#7ad070', '#2f7a3a'], hpLow: ['#ffe0a0', '#e09030', '#8a4a10']
    },
    // scene light recipe (colours 0..1); the host lights its own world with these
    light: {
      ambient: [0.18, 0.22, 0.46], ambientDark: [0.16, 0.17, 0.30], key: [1.0, 0.70, 0.38], spell: [1.0, 0.82, 0.48], magic: [0.40, 0.86, 1.0],
      heal: [0.45, 1.0, 0.62], danger: [1.0, 0.34, 0.40], fog: '#8ea4bc', vignette: '#05060c', cardCap: 0.3, ambientFloor: 0.6
    }
  };

  /* ---------------- the skin ---------------- */
  var skin = {
    id: 'hd-diorama', name: 'HD pixel diorama', pixel: true,
    native: { w: 256, h: 224, scale: 'integer', supersample: true, smoothing: false, snap: 1, minScale: 3,
      note: 'backing store = native x integer s, setTransform(s); pixel cards and text at integer native coords with smoothing off; light, glass and blur smooth at device resolution' },
    palette: palette,
    fonts: {
      ui: { type: 'bitmap', height: 7, sep: '|', spacing: 1, space: 3, uppercase: true, glyphs: UI_GLYPHS, note: '5x7 proportional capitals, row-shaded, 1 px hard drop + soft halo' },
      num: { type: 'bitmap', height: 9, sep: '|', spacing: 1, glyphs: NUM_GLYPHS, note: '6x9 high-contrast digits (2 px stems, 1 px hairlines); 2x for big crits' },
      label: { type: 'bitmap', height: 7, sep: '|', spacing: 1, space: 3, uppercase: true, glyphs: UI_GLYPHS },
      rules: { snap: true, smoothing: false, minSize: 7, uppercase: true, lineH: 12, note: 'text never goes through blur, bloom or tilt-shift' }
    },
    frameRoles: ['row', 'backing'],
    atmospherePhases: ['world', 'post-props', 'final'],
    layout: { handW: 7, handH: 5, pointerGap: 5, rowFrame: true },
    shape: { radius: 2, edgeWidth: 0.5, innerLine: 0.35, padding: 4, plateRadius: 1.5, barRadius: 'half', glassBlur: 2.5 },
    overlayStyle: { mode: 'glow', pattern: 'pulsing', alpha: 0.24, edgeAlpha: 0.9, glowWidth: 4, glowAlpha: 0.42, seamAlpha: 0.10, blend: 'lighter' },
    particles: { shape: 'circle', size: [0.6, 1.8], count: 1, snap: false, blend: 'lighter', glow: 0.8, gravity: 0.04, drag: 0.04, life: [450, 950], colors: ['fx.white', 'fx.crit', 'fx.hot'], trail: 2, rays: 6,
      motes: { count: 48, size: [0.5, 2.6], alpha: [0.25, 0.7], drift: 0.12, colors: ['fx.white', 'fx.crit'] } },
    outline: { text: { width: 0, mode: 'drop' }, number: { width: 1, max: 1, drop: 0, mode: 'dilate', color: 'text.outline' }, sprite: { width: 1, color: 'ink', mode: 'pixel', rim: 0.6 } },
    shadow: { text: { dx: 1, dy: 1, blur: 2 }, window: { dx: 0, dy: 2, blur: 6 }, sprite: { kind: 'cast', alpha: 0.6, contact: 0.62, lights: 3, len: [0.35, 3.6] } },
    motion: { stepMs: 0, spriteStepMs: 433, snap: true, ease: { move: 'inOutQuad', pop: 'outBack', fade: 'linear' }, fadeSteps: null, shakeInt: false, flashMax: 0.42, hitLightMs: 233, breathe: 0.2 },

    measure: function (str, o) {
      o = o || {}; var s = String(str), f = o.font || 'ui', sc = o.scale || 1;
      if (f === 'num') return layout(s, o).w;
      return uiW(s, sc);
    },

    // text(ctx, str, x, y, {font, color, color2, shadow, outline, align, scale, alpha})
    text: function (ctx, str, x, y, o) {
      o = o || {}; var s = String(str).toUpperCase(), P = palette.text, sc = Math.max(1, Math.round(o.scale || 1)), set = o.font === 'num' ? NUM_GLYPHS : UI_GLYPHS;
      var w = set === NUM_GLYPHS ? layout(s, { scale: sc }).w : uiW(s, sc);
      if (o.align === 'center') x -= Math.floor(w / 2); else if (o.align === 'right') x -= w;
      x = Math.round(x); y = Math.round(y); if (!s.trim()) return w;
      var c1 = API.token(this, o.color) || P.main, c2 = o.color2 ? API.token(this, o.color2) : null;
      var pa = ctx.globalAlpha, ps = ctx.imageSmoothingEnabled; if (o.alpha != null) ctx.globalAlpha = pa * o.alpha;
      ctx.imageSmoothingEnabled = false;
      var sh = o.shadow === false ? null : API.token(this, o.shadow) || P.shadow;
      if (sh) {
        var S = runCanvas(s, set, sc, sh, null, 'sil');
        glowImage(ctx, S.c, x, y + 0.5, rgba(sh, 0.9), 2.2, 0.55);
        ctx.globalAlpha = (o.alpha != null ? pa * o.alpha : pa) * 0.92; ctx.drawImage(S.c, x + 1, y + 1); ctx.globalAlpha = o.alpha != null ? pa * o.alpha : pa;
      }
      var ol = o.outline ? API.token(this, o.outline) : null;
      if (ol) { var Ol = runCanvas(s, set, sc, ol, null, 'ol'); ctx.drawImage(Ol.c, x - 1, y - 1); }
      var F = runCanvas(s, set, sc, c1, c2, 'fill'); ctx.drawImage(F.c, x, y);
      ctx.imageSmoothingEnabled = ps; ctx.globalAlpha = pa; return w;
    },

    // frame(ctx, rect, {role, team, focus, alert, disabled, alpha}) -> inner rect
    frame: function (ctx, r, st) {
      st = st || {}; var role = st.role || 'window', U = palette.ui, x = r.x, y = r.y, w = r.w, h = r.h, k = devScale(ctx);
      if (role === 'row' || role === 'backing') return band(ctx, r, st);
      var pad = role === 'plate' ? { x: 5, y: 3 } : role === 'banner' ? { x: 10, y: 4 } : { x: 4, y: 4 };
      var inner = { x: x + pad.x, y: y + pad.y, w: w - 2 * pad.x, h: h - 2 * pad.y };
      if (w < 2 || h < 2) return inner;
      var rad = role === 'plate' || role === 'tooltip' ? 1.5 : 2, glass = U.glass[st.team] || U.glass.n;
      ctx.save(); if (st.alpha != null) ctx.globalAlpha *= st.alpha; if (st.disabled) ctx.globalAlpha *= 0.6;
      // soft drop shadow (light comes from above the diorama)
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6 * k; ctx.shadowOffsetY = 2 * k; ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(ctx, x, y, w, h, rad); ctx.fill(); ctx.restore();
      // frosted dark glass
      frost(ctx, x, y, w, h, rad, this.shape.glassBlur);
      var gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, glass[0]); gr.addColorStop(1, glass[1]);
      ctx.fillStyle = gr; rr(ctx, x, y, w, h, rad); ctx.fill();
      // diagonal sheen + top edge catch-light
      ctx.save(); rr(ctx, x, y, w, h, rad); ctx.clip();
      var sg = ctx.createLinearGradient(x, y, x + Math.min(w, 80) * 0.7, y + h); sg.addColorStop(0, 'rgba(255,240,210,0.10)'); sg.addColorStop(0.45, 'rgba(255,240,210,0.02)'); sg.addColorStop(1, 'rgba(255,240,210,0)');
      ctx.fillStyle = sg; ctx.fillRect(x, y, w, h); ctx.fillStyle = 'rgba(255,236,200,0.16)'; ctx.fillRect(x + 2, y + 0.9, w - 4, 0.45); ctx.restore();
      // metal: outer dark-gold hairline, inner gold hairline, corner diamonds
      var edge = st.alert ? '#ffe6a0' : U.gold;
      ctx.lineWidth = 0.5; ctx.strokeStyle = U.goldDk; rr(ctx, x + 0.25, y + 0.25, w - 0.5, h - 0.5, rad); ctx.stroke();
      if (role !== 'tooltip') { ctx.lineWidth = st.focus || st.alert ? 0.5 : 0.35; ctx.strokeStyle = edge; rr(ctx, x + 1.6, y + 1.6, w - 3.2, h - 3.2, Math.max(0.5, rad - 0.8)); ctx.stroke(); }
      if (st.focus || st.alert) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = 'rgba(255,210,120,0.8)'; ctx.shadowBlur = 4 * k; ctx.strokeStyle = 'rgba(255,220,150,0.35)'; ctx.lineWidth = 0.5; rr(ctx, x + 1.6, y + 1.6, w - 3.2, h - 3.2, 1); ctx.stroke(); ctx.restore(); }
      if (role === 'window' || role === 'banner') [[x + 1.6, y + 1.6], [x + w - 1.6, y + 1.6], [x + 1.6, y + h - 1.6], [x + w - 1.6, y + h - 1.6]].forEach(function (p) { diamond(ctx, p[0], p[1], 1.5, U.goldHi); });
      if (role === 'banner') { diamond(ctx, x + 6, y + h / 2, 1.8, U.gold); diamond(ctx, x + w - 6, y + h / 2, 1.8, U.gold); }
      if (role === 'plate') { var lg = ctx.createLinearGradient(x, 0, x + w, 0); lg.addColorStop(0, 'rgba(201,164,92,0)'); lg.addColorStop(0.5, 'rgba(240,216,152,0.8)'); lg.addColorStop(1, 'rgba(201,164,92,0)'); ctx.fillStyle = lg; ctx.fillRect(x + 2, y + h - 1.4, w - 4, 0.4); }
      ctx.restore();
      return inner;
    },

    // number(ctx, str, x, y, {kind, scheme, scale, big, suffix, label, labelGap, align, baseline, alpha, glyphOffset})
    number: function (ctx, str, x, y, o) {
      o = o || {}; var L = layout(String(str), o), kind = o.kind || 'damage', N = palette.numbers, C = N[kind === 'critical' ? 'crit' : kind] || N.damage;
      if (o.scheme === 'contrast') C = [C[0], mix(C[1], '#ffffff', 0.25), C[2]];
      var x0 = o.align === 'center' ? Math.round(x - L.w / 2) : Math.round(x), y0 = Math.round(o.baseline === 'bottom' ? y - L.h : y);
      var all = L.items.concat(L.labelItems), out = [], pa = ctx.globalAlpha, ps = ctx.imageSmoothingEnabled, op = ctx.globalCompositeOperation;
      var plan = all.map(function (it, i) {
        var d = (o.glyphOffset && o.glyphOffset(i, it)) || {}; if (d.skip || it.sp) return null;
        var cols = it.lab ? N.label : C, set = it.font === 'num' ? NUM_GLYPHS : UI_GLYPHS;
        var top = d.flash ? '#ffffff' : cols[0], bot = d.flash ? '#fff4dc' : cols[1];
        return { i: i, it: it, d: d, gx: Math.round(x0 + it.x + (d.dx || 0)), gy: Math.round(y0 + it.y + (d.dy || 0)), a: d.alpha != null ? d.alpha : o.alpha != null ? o.alpha : 1,
          fill: runCanvas(it.ch, set, it.s, top, bot, 'fill'), ol: runCanvas(it.ch, set, it.s, palette.text.outline, null, 'ol'), glow: d.flash ? '#ffffff' : cols[2] };
      }).filter(Boolean);
      // glyphs that share an alpha are drawn together in one fade layer, so a fading outline never shows through its fill
      var groups = {}, keys = [];
      plan.forEach(function (p) { var k = String(Math.round(p.a * 1000) / 1000); if (!groups[k]) { groups[k] = []; keys.push(k); } groups[k].push(p); });
      keys.forEach(function (k) {
        var G = groups[k], a = +k, x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
        G.forEach(function (p) { x1 = Math.min(x1, p.gx); y1 = Math.min(y1, p.gy); x2 = Math.max(x2, p.gx + p.fill.w); y2 = Math.max(y2, p.gy + p.fill.h); });
        API.fadeLayer(ctx, a, { x: x1 - 8, y: y1 - 8, w: x2 - x1 + 16, h: y2 - y1 + 16 }, function (g) {
          var gop = g.globalCompositeOperation; g.imageSmoothingEnabled = false;
          g.globalCompositeOperation = 'lighter';   // 1. soft coloured glow behind
          G.forEach(function (p) { if (p.glow) glowImage(g, p.fill.c, p.gx, p.gy, rgba(p.glow, 0.85), 3, 0.7); });
          g.globalCompositeOperation = gop;
          G.forEach(function (p) { g.drawImage(p.ol.c, p.gx - 1, p.gy - 1); });   // 2. every outline before any fill
          G.forEach(function (p) { g.drawImage(p.fill.c, p.gx, p.gy); });           // 3. fills
        });
      });
      plan.forEach(function (p) { out.push({ i: p.i, x: p.gx, y: p.gy, w: p.fill.w, h: p.fill.h, ch: p.it.ch }); });
      ctx.globalAlpha = pa; ctx.imageSmoothingEnabled = ps; return out;
    },

    // overlay(ctx, tileRect, kind, tSeconds, {grow, pattern, tile, edges, seams})
    overlay: function (ctx, r, kind, t, o) {
      o = o || {}; var C = palette.overlay[kind] || palette.overlay.move, S = this.overlayStyle, gr = o.grow == null ? 1 : o.grow;
      if (!(gr > 0)) return;
      var x = r.x, y = r.y, w = r.w, h = r.h, tx = o.tile ? o.tile.x : 0, ty = o.tile ? o.tile.y : 0, pat = o.pattern || S.pattern;
      var a = (C.alpha || S.alpha) * gr, pulse = 0;
      if (pat === 'pulsing') pulse = Math.max(0, Math.sin((tx + ty) * 0.55 - t * 3.2)) * 0.6;
      if (pat === 'checker') a *= (tx + ty) % 2 ? 1.25 : 0.7;
      var E = o.edges || {}, M = o.seams || {}, pa = ctx.globalAlpha, op = ctx.globalCompositeOperation;
      ctx.save();
      // tinted light on the floor: soft wash + a little lift in the middle of the tile
      ctx.fillStyle = rgba(C.fill, a * (1 + pulse * 0.5)); ctx.fillRect(x, y, w, h);
      ctx.globalCompositeOperation = 'lighter';
      var rg = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w * 0.75);
      rg.addColorStop(0, rgba(C.glow, (0.10 + pulse * 0.16) * gr)); rg.addColorStop(1, rgba(C.glow, 0));
      ctx.fillStyle = rg; ctx.fillRect(x, y, w, h);
      // emissive rim on the boundary of the set: a glow strip fading inward + a bright hairline
      var gw = S.glowWidth, ga = S.glowAlpha * gr;
      var strip = function (x0, y0, x1, y1, X, Y, W, H) { var g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, rgba(C.glow, ga)); g.addColorStop(1, rgba(C.glow, 0)); ctx.fillStyle = g; ctx.fillRect(X, Y, W, H); };
      if (E.top) strip(0, y, 0, y + gw, x, y, w, gw); if (E.bottom) strip(0, y + h, 0, y + h - gw, x, y + h - gw, w, gw);
      if (E.left) strip(x, 0, x + gw, 0, x, y, gw, h); if (E.right) strip(x + w, 0, x + w - gw, 0, x + w - gw, y, gw, h);
      ctx.fillStyle = rgba(C.edge, S.edgeAlpha * gr);
      if (E.top) ctx.fillRect(x, y, w, 0.6); if (E.bottom) ctx.fillRect(x, y + h - 0.6, w, 0.6); if (E.left) ctx.fillRect(x, y, 0.6, h); if (E.right) ctx.fillRect(x + w - 0.6, y, 0.6, h);
      ctx.globalCompositeOperation = op;
      ctx.fillStyle = rgba(C.edge, S.seamAlpha * gr); if (M.right) ctx.fillRect(x + w - 0.3, y + 2, 0.3, h - 4); if (M.bottom) ctx.fillRect(x + 2, y + h - 0.3, w - 4, 0.3);
      ctx.restore(); ctx.globalAlpha = pa;
    },

    // bar(ctx, rect, frac, kind, {style, tag, px, t})
    bar: function (ctx, r, frac, kind, o) {
      o = o || {}; var B = palette.bars, U = palette.ui, x = r.x, y = r.y, w = r.w, h = r.h, rad = h / 2, f = clamp(frac || 0, 0, 1), k = devScale(ctx);
      ctx.save();
      ctx.fillStyle = B.track; rr(ctx, x, y, w, h, rad); ctx.fill();
      ctx.lineWidth = 0.4; ctx.strokeStyle = U.goldDk; rr(ctx, x, y, w, h, rad); ctx.stroke();
      if (!kind) { ctx.fillStyle = 'rgba(201,164,92,0.35)'; for (var q = x + 2; q < x + w - 1; q += 3) ctx.fillRect(q, y + h / 2 - 0.25, 0.6, 0.5); ctx.restore(); return; }
      var C = B[kind] || B.charge, iw = w - 1.2, fw = o.px != null ? Math.min(iw, o.px) : f * iw;
      if (fw > 0.3) {
        var g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, C[0]); g.addColorStop(0.45, C[1]); g.addColorStop(1, C[2]);
        ctx.fillStyle = g; rr(ctx, x + 0.6, y + 0.6, fw, h - 1.2, (h - 1.2) / 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 0.6 + rad * 0.6, y + 0.8, Math.max(0, fw - rad * 1.2), Math.min(0.5, h * 0.12));
        ctx.globalCompositeOperation = 'lighter';
        if (kind === 'ready' || kind === 'enemyFull') { ctx.globalAlpha *= 0.3 + 0.3 * Math.sin((o.t || 0) * 9); ctx.fillStyle = '#fff4d0'; rr(ctx, x + 0.6, y + 0.6, fw, h - 1.2, (h - 1.2) / 2); ctx.fill(); ctx.globalAlpha = 1; }
        if (fw < iw - 0.5) { var eg = ctx.createRadialGradient(x + 0.6 + fw, y + h / 2, 0, x + 0.6 + fw, y + h / 2, h * 0.9); eg.addColorStop(0, rgba(C[0], 0.35)); eg.addColorStop(1, rgba(C[0], 0)); ctx.fillStyle = eg; ctx.fillRect(x + fw - h, y - h, h * 3, h * 3); }
        ctx.globalCompositeOperation = 'source-over';
      }
      if (o.tag && B[o.tag]) { diamond(ctx, x + 2.6, y + h / 2, Math.max(1.6, h * 0.55), U.goldDk); diamond(ctx, x + 2.6, y + h / 2, Math.max(1.1, h * 0.42), B[o.tag][1]); }
      ctx.restore();
    },

    // cursor(ctx, rect, 'bracket' | 'hand', tSeconds, {alpha, invalid})
    cursor: function (ctx, r, kind, t, o) {
      o = o || {}; var U = palette.ui, k = devScale(ctx), hi = o.invalid ? '#ffc0b0' : U.goldHi, lo = o.invalid ? '#d0503c' : U.gold;
      ctx.save(); if (o.alpha != null) ctx.globalAlpha *= o.alpha;
      if (kind === 'hand') {   // gold triangle pointing right, 1 px sway
        var b = Math.round(Math.sin((t || 0) * 6) * 1.6) / 2, X = r.x + r.w - b, Y = r.y + r.h / 2;
        var tri = function (dx, dy) { ctx.beginPath(); ctx.moveTo(X + dx, Y + dy); ctx.lineTo(X - r.w + dx, Y - r.h / 2 - 0.6 + dy); ctx.lineTo(X - r.w * 0.68 + dx, Y + dy); ctx.lineTo(X - r.w + dx, Y + r.h / 2 + 0.6 + dy); ctx.closePath(); ctx.fill(); };
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; tri(0.5, 0.7);
        var g = ctx.createLinearGradient(0, Y - r.h / 2, 0, Y + r.h / 2); g.addColorStop(0, hi); g.addColorStop(1, lo); ctx.fillStyle = g; tri(0, 0);
        ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = 'rgba(255,200,110,0.7)'; ctx.shadowBlur = 3 * k; ctx.fillStyle = 'rgba(255,220,150,0.25)'; tri(0, 0);
        ctx.restore(); return;
      }
      var x = r.x, y = r.y, w = r.w, h = r.h, br = Math.sin((t || 0) * 5) * 0.6, L = Math.max(3, w * 0.3);
      // warm light pool on the tile (the cursor is a small lamp)
      ctx.globalCompositeOperation = 'lighter';
      var pg = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w * 0.8); pg.addColorStop(0, 'rgba(255,214,140,0.42)'); pg.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = pg; ctx.fillRect(x - w / 2, y - h / 2, w * 2, h * 2);
      ctx.globalCompositeOperation = 'source-over';
      var corners = [[x - br, y - br, 1, 1], [x + w + br, y - br, -1, 1], [x - br, y + h + br, 1, -1], [x + w + br, y + h + br, -1, -1]];
      var draw = function (col, lw, dx, dy) {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'square';
        corners.forEach(function (c) { ctx.beginPath(); ctx.moveTo(c[0] + c[2] * L + dx, c[1] + dy); ctx.lineTo(c[0] + dx, c[1] + dy); ctx.lineTo(c[0] + dx, c[1] + c[3] * L + dy); ctx.stroke(); });
      };
      draw('rgba(0,0,0,0.7)', 2.4, 0.4, 0.6);
      ctx.save(); ctx.shadowColor = 'rgba(255,200,110,1)'; ctx.shadowBlur = 6 * k; draw(lo, 1.8, 0, 0); ctx.restore();
      draw(hi, 0.8, 0, 0);
      ctx.restore();
    }
  };

  // unframed roles: 'row' = selected menu row (warm light band between two fading gold hairlines); 'backing' = a dark glass well
  function band(ctx, r, st) {
    var x = r.x, y = r.y, w = r.w, h = r.h, U = palette.ui; if (w <= 0 || h <= 0) return { x: x, y: y, w: w, h: h };
    ctx.save(); if (st.alpha != null) ctx.globalAlpha *= st.alpha; if (st.disabled) ctx.globalAlpha *= 0.5;
    if (st.role === 'row') {
      var g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, 'rgba(255,214,140,0.30)'); g.addColorStop(0.6, 'rgba(255,214,140,0.12)'); g.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      var l = ctx.createLinearGradient(x, 0, x + w, 0); l.addColorStop(0, 'rgba(240,216,152,0.85)'); l.addColorStop(0.7, 'rgba(240,216,152,0.25)'); l.addColorStop(1, 'rgba(240,216,152,0)');
      ctx.fillStyle = l; ctx.fillRect(x, y, w, 0.35); ctx.fillRect(x, y + h - 0.35, w, 0.35);
      if (st.focus !== false) diamond(ctx, x + 1.2, y + h / 2, 1.1, U.goldHi);
    } else {
      rr(ctx, x, y, w, h, 1); ctx.fillStyle = 'rgba(0,0,0,0.34)'; ctx.fill();
      ctx.lineWidth = 0.35; ctx.strokeStyle = U.goldDk; rr(ctx, x + 0.2, y + 0.2, w - 0.4, h - 0.4, 1); ctx.stroke();
      ctx.fillStyle = 'rgba(255,236,200,0.08)'; ctx.fillRect(x + 1, y + h - 0.8, w - 2, 0.4);
    }
    ctx.restore(); return { x: x, y: y, w: w, h: h };
  }

  /* ---------------- numerals layout ---------------- */
  function layout(text, o) {
    o = o || {}; var s = Math.max(1, Math.round(o.scale || 1)), b = o.big ? Math.min(s + 1, 2) : s, items = [], x = 0, i, ch, r;
    text = String(text).toUpperCase();
    if (/^[0-9+]+$/.test(text)) {
      for (i = 0; i < text.length; i++) { ch = text[i]; r = rows(NUM_GLYPHS, ch); items.push({ font: 'num', ch: ch, x: x, s: b, w: r[0].length * b, h: 9 * b }); x += (r[0].length + 1) * b; }
      x -= b;
      if (o.suffix) { x += 2 * s; var suf = String(o.suffix).toUpperCase(); for (i = 0; i < suf.length; i++) { ch = suf[i]; r = rows(UI_GLYPHS, ch); items.push({ font: 'ui', ch: ch, x: x, s: s, w: r[0].length * s, h: 7 * s }); x += (r[0].length + 1) * s; } x -= s; }
    } else {
      for (i = 0; i < text.length; i++) { ch = text[i]; if (ch === ' ') { items.push({ sp: 1, ch: ' ', x: x, s: s, w: 0, h: 0 }); x += 3 * s; continue; } r = rows(UI_GLYPHS, ch); items.push({ font: 'ui', ch: ch, x: x, s: s, w: r[0].length * s, h: 7 * s }); x += (r[0].length + 2) * s; }
      x -= 2 * s;
    }
    var h = 0; items.forEach(function (it) { h = Math.max(h, it.h); }); items.forEach(function (it) { it.y = h - it.h; });
    var labelItems = [];
    if (o.suffix && !/^[0-9+]+$/.test(text)) for (i = 0; i < String(o.suffix).length; i++) items.push({ sp: 1, ch: String(o.suffix)[i], x: x, s: s, w: 0, h: 0, y: 0 });   // suffix only follows numerals
    if (o.label) {
      var lab = String(o.label).toUpperCase(), lw = uiW(lab, 1), lx = Math.round((x - lw) / 2), gap = o.labelGap == null ? 3 : o.labelGap;
      for (i = 0; i < lab.length; i++) { ch = lab[i]; if (ch === ' ') { labelItems.push({ sp: 1, ch: ' ', x: lx, y: -7 - gap, s: 1, w: 0, h: 0, lab: 1 }); lx += 3; continue; } r = rows(UI_GLYPHS, ch); labelItems.push({ font: 'ui', ch: ch, x: lx, y: -7 - gap, s: 1, w: r[0].length, h: 7, lab: 1 }); lx += r[0].length + 1; }
    }
    return { items: items, labelItems: labelItems, w: Math.max(0, x), h: h };
  }

  /* ---------------- optional extras ---------------- */
  // path(ctx, points [{x, y}] (tile centres, native px), tSeconds, {width}): glowing gold ribbon with an arrowhead and travelling sparks
  skin.path = function (ctx, pts, t, o) {
    o = o || {}; if (!pts || pts.length < 2) return;
    if (o.alpha != null && o.alpha < 1) { var o2 = {}, q; for (q in o) o2[q] = o[q]; o2.alpha = 1; var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
      API.fadeLayer(ctx, o.alpha, { x: Math.min.apply(null, xs) - 12, y: Math.min.apply(null, ys) - 12, w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + 24, h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + 24 }, function (g) { skin.path(g, pts, t, o2); }); return; }
    var P = o.invalid ? palette.overlay.pathBad : palette.overlay.path, k = devScale(ctx), wd = o.width || ((o.tile || 16) * 0.21);
    var n = pts.length, a = pts[n - 2], z = pts[n - 1], ang = Math.atan2(z.y - a.y, z.x - a.x), hl = 6.5, cut = hl * 0.7;
    var end = { x: z.x - Math.cos(ang) * cut, y: z.y - Math.sin(ang) * cut };
    var line = function (dx, dy) { ctx.beginPath(); ctx.moveTo(pts[0].x + dx, pts[0].y + dy); for (var i = 1; i < n - 1; i++) ctx.lineTo(pts[i].x + dx, pts[i].y + dy); ctx.lineTo(end.x + dx, end.y + dy); };
    var head = function (dx, dy, s) { ctx.beginPath(); ctx.moveTo(z.x + Math.cos(ang) * s * 0.4 + dx, z.y + Math.sin(ang) * s * 0.4 + dy);
      ctx.lineTo(z.x - Math.cos(ang) * hl * s + Math.cos(ang + Math.PI / 2) * 4.2 * s + dx, z.y - Math.sin(ang) * hl * s + Math.sin(ang + Math.PI / 2) * 4.2 * s + dy);
      ctx.lineTo(z.x - Math.cos(ang) * hl * 0.62 * s + dx, z.y - Math.sin(ang) * hl * 0.62 * s + dy);
      ctx.lineTo(z.x - Math.cos(ang) * hl * s + Math.cos(ang - Math.PI / 2) * 4.2 * s + dx, z.y - Math.sin(ang) * hl * s + Math.sin(ang - Math.PI / 2) * 4.2 * s + dy); ctx.closePath(); };
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // cast shadow on the floor
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 2.5 * k; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = wd + 1; line(0.8, 1.6); ctx.stroke(); ctx.fillStyle = 'rgba(0,0,0,0.45)'; head(0.8, 1.6, 1); ctx.fill(); ctx.restore();
    // emissive halo
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = rgba(P.glow, 0.9); ctx.shadowBlur = 6 * k; ctx.strokeStyle = rgba(P.glow, 0.28); ctx.lineWidth = wd + 3; line(0, 0); ctx.stroke(); ctx.restore();
    // body: dark rim, gold, bright core
    ctx.strokeStyle = P.outline; ctx.lineWidth = wd + 1.2; line(0, 0); ctx.stroke(); ctx.fillStyle = P.outline; head(0, 0, 1.12); ctx.fill();
    ctx.strokeStyle = P.mid; ctx.lineWidth = wd; line(0, 0); ctx.stroke();
    ctx.strokeStyle = P.light; ctx.lineWidth = wd * 0.55; line(0, -0.25); ctx.stroke();
    ctx.strokeStyle = P.core; ctx.lineWidth = wd * 0.22; line(0, -0.35); ctx.stroke();
    var hg = ctx.createLinearGradient(z.x - 5, z.y - 5, z.x + 5, z.y + 5); hg.addColorStop(0, P.core); hg.addColorStop(0.5, P.light); hg.addColorStop(1, P.mid); ctx.fillStyle = hg; head(0, 0, 1); ctx.fill();
    // start socket
    ctx.fillStyle = P.outline; ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, wd * 0.9, 0, 7); ctx.fill(); ctx.fillStyle = P.light; ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, wd * 0.55, 0, 7); ctx.fill();
    // travelling sparks
    var segs = [], total = 0, i; for (i = 1; i < n; i++) { var L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); segs.push(L); total += L; }
    ctx.globalCompositeOperation = 'lighter';
    for (var sIdx = 0; sIdx < 3; sIdx++) {
      var d = (((t || 0) * 0.7 + sIdx / 3) % 1) * total, j = 0; while (j < segs.length - 1 && d > segs[j]) { d -= segs[j]; j++; }
      var q = segs[j] ? d / segs[j] : 0, sx = pts[j].x + (pts[j + 1].x - pts[j].x) * q, sy = pts[j].y + (pts[j + 1].y - pts[j].y) * q;
      var sg = ctx.createRadialGradient(sx, sy - 0.3, 0, sx, sy - 0.3, 3); sg.addColorStop(0, 'rgba(255,255,240,0.95)'); sg.addColorStop(0.35, rgba(P.glow, 0.5)); sg.addColorStop(1, rgba(P.glow, 0));
      ctx.fillStyle = sg; ctx.fillRect(sx - 3, sy - 3.3, 6, 6);
    }
    ctx.restore();
  };

  // post-processing the style needs (all device-space, all without ctx.filter)
  skin.post = {
    frost: frost,
    // blur everything outside the focus band [top, bot] (native y), feathered; strength = blur in native px
    tiltShift: function (ctx, top, bot, feather, strength) {
      var cv = ctx.canvas, m = ctx.getTransform(), k = Math.abs(m.a) || 1, W = cv.width, H = cv.height;
      var lv = Math.max(1, Math.round(Math.log2(Math.max(2, (strength || 1.2) * k * 2)))), B = halve(cv, 0, 0, W, H, lv, 'ts');
      var t = pooled('tsm', W, H), g = t.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(B.c, 0, 0, B.w, B.h, 0, 0, W, H);
      var p = function (v) { return clamp((v * m.d + m.f) / H, 0, 1); }, gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(p(top - feather), 'rgba(0,0,0,0.9)'); gr.addColorStop(p(top), 'rgba(0,0,0,0)');
      gr.addColorStop(p(bot), 'rgba(0,0,0,0)'); gr.addColorStop(p(bot + feather), 'rgba(0,0,0,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-in'; g.fillStyle = gr; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(t, 0, 0); ctx.restore();
    },
    // bloom: em = canvas of emissive things (same size as ctx.canvas)
    bloom: function (ctx, em, k1, k2) {
      var W = em.width, H = em.height, b1 = halve(em, 0, 0, W, H, 3, 'b1'), b2 = halve(em, 0, 0, W, H, 5, 'b2');
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = k1 == null ? 0.9 : k1; ctx.drawImage(b1.c, 0, 0, b1.w, b1.h, 0, 0, W, H);
      ctx.globalAlpha = k2 == null ? 0.75 : k2; ctx.drawImage(b2.c, 0, 0, b2.w, b2.h, 0, 0, W, H);
      ctx.globalAlpha = 0.85; ctx.drawImage(em, 0, 0); ctx.restore();
    },
    vignette: function (ctx, w, h, amt) {
      amt = amt == null ? 0.62 : amt; var col = palette.light.vignette;
      var g = ctx.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.hypot(w, h) * 0.6);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.55, rgba(col, amt * 0.35)); g.addColorStop(1, rgba(col, amt)); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    },
    // dust motes in depth: blurred bokeh far from the focus depth, small sharp specks near it; deterministic in t
    motes: function (ctx, rect, t, o) {
      o = o || {}; var n = o.count || 48, focusY = o.focusY == null ? rect.y + rect.h / 2 : o.focusY, op = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < n; i++) {
        var depth = hash(i, 3), sx = hash(i, 1), sy = hash(i, 2), sp = 0.15 + hash(i, 4) * 0.5;
        var x = rect.x + ((sx * rect.w + Math.sin(t * sp + i) * 6 + t * 2.2 * (0.5 + depth)) % rect.w + rect.w) % rect.w;
        var y = rect.y + ((sy * rect.h - t * 1.6 * sp + Math.cos(t * sp * 1.3 + i * 2) * 3) % rect.h + rect.h) % rect.h;
        var blur = Math.abs(y - focusY) / rect.h * 2.4 + depth * 1.2, r = 0.45 + blur * 1.2, a = (0.75 - Math.min(0.5, blur * 0.18)) * (0.5 + 0.5 * Math.sin(t * 1.7 + i));
        var col = (o.colorAt && o.colorAt(x, y)) || [1, 0.9, 0.7];
        var g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col.map(function (v) { return Math.min(255, v * 255); }), a * 0.8)); g.addColorStop(blur > 1 ? 0.75 : 0.4, rgba(col.map(function (v) { return Math.min(255, v * 255); }), a * 0.35)); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = op;
    },
    // shaft of volumetric light (additive), soft edges, fading at both ends
    shaft: function (ctx, x0, y0, x1, y1, w0, w1, col, a) {
      var dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      [[1, 0.35], [0.55, 0.6], [0.22, 1]].forEach(function (q) {
        ctx.beginPath(); ctx.moveTo(x0 + nx * w0 * q[0], y0 + ny * w0 * q[0]); ctx.lineTo(x1 + nx * w1 * q[0], y1 + ny * w1 * q[0]); ctx.lineTo(x1 - nx * w1 * q[0], y1 - ny * w1 * q[0]); ctx.lineTo(x0 - nx * w0 * q[0], y0 - ny * w0 * q[0]); ctx.closePath();
        var g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.2, rgba(col, a * q[1])); g.addColorStop(0.7, rgba(col, a * q[1] * 0.8)); g.addColorStop(1, rgba(col, 0)); ctx.fillStyle = g; ctx.fill();
      });
      ctx.globalCompositeOperation = op;
    },
    halve: halve
  };


  /* ---------------- scene hooks: tile, token, atmosphere ---------------- */
  var BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function rampPick(cols, v, x, y, dz) { var n = cols.length, p = clamp(v, 0, 0.9999) * n - 0.5, i = Math.floor(p), f = p - i, lo = 0.5 - dz / 2; var j = f < lo ? i : f > 1 - lo ? i + 1 : ((BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16 < (f - lo) / dz ? i + 1 : i); return cols[clamp(j, 0, n - 1)]; }
  var TR = {
    grass: ['#2a4628', '#365a2e', '#456e36', '#557f3c', '#689446', '#7ea852'], water: ['#0e2440', '#163658', '#1f4a72', '#2c6290', '#4a86b0'],
    road: ['#3a2a1e', '#4e3826', '#664a30', '#7e5e3c', '#967448'], stone: ['#3c3a40', '#55525a', '#6e6a70', '#8a8488', '#a8a0a0'],
    wood: ['#2a1a10', '#45301e', '#5e432a', '#7a5a38', '#94704a'], sand: ['#6a5634', '#86704a', '#a08a5e', '#b8a272', '#d0bc8a'], brick: ['#2e2226', '#4a3434', '#664848', '#80605a']
  };
  palette.terrain = { grass: '#557f3c', forest: '#2e4524', water: '#1f4a72', hill: '#6e7a48', mountain: '#6e6a70', road: '#664a30', bridge: '#5e432a', fort: '#8a8488', sand: '#a08a5e', wall: '#4a3434', floor: '#6e6a70' };
  var TILES = {}, NT = 0;
  // tile(ctx, rect, kind, t): one map cell as pixel texture locked to world pixels (neighbouring cells join up); water is frame-stepped
  skin.tile = function (ctx, r, kind, t) {
    var f = kind === 'water' ? Math.floor((t || 0) * 1000 / 433) % 2 : 0, X0 = Math.round(r.x), Y0 = Math.round(r.y), W = Math.max(1, Math.round(r.w)), H = Math.max(1, Math.round(r.h));
    var key = kind + '|' + X0 + '|' + Y0 + '|' + W + '|' + H + '|' + f, c = TILES[key];
    if (!c) {
      if (NT++ > 1500) { TILES = {}; NT = 0; }
      c = mk(W, H); var g = c.getContext('2d'), id = g.createImageData(W, H), d = id.data;
      for (var ly = 0; ly < H; ly++) for (var lx = 0; lx < W; lx++) {
        var x = X0 + lx, y = Y0 + ly, col, v, edge = lx === 0 || ly === 0;
        if (kind === 'water') { v = 0.45 + Math.sin(x * 0.9 + y * 0.35 + f * 1.7) * 0.08 + (hash(x >> 1, y >> 2, 7) - 0.5) * 0.18; if ((y * 3 + ((x * 7 + f * 5) >> 1)) % 23 === 0) v = 0.95; col = rampPick(TR.water, v, x, y, 0.3); }
        else if (kind === 'bridge') { var b = Math.floor(ly / 3), q = ly % 3; col = TR.wood[q === 0 ? 0 : Math.min(4, 1 + Math.floor(hash(b, x >> 3, 3) * 3))]; if ((lx === 2 || lx === W - 3) && q === 1) col = '#a8885a'; }
        else if (kind === 'road' || kind === 'sand') { v = 0.55 + (hash(x >> 1, y >> 1, 11) - 0.5) * 0.3; if (hash(x, y, 12) < 0.03) v = 0.95; col = rampPick(kind === 'road' ? TR.road : TR.sand, v, x, y, 0.3); }
        else if (kind === 'mountain' || kind === 'fort' || kind === 'floor') {
          v = 0.6 + (hash(x >> 2, y >> 2, 21) - 0.5) * 0.35 + (hash(x, y, 22) - 0.5) * 0.12;
          if (kind === 'mountain') { var px = lx / W - 0.5, py = ly / H; if (Math.abs(px) < py * 0.55) v += 0.2 - px * 0.6; else v -= 0.25; }
          if (kind === 'floor' && (lx % 8 === 0 || ly % 8 === 0)) v = 0.2; if (kind === 'fort' && ly > H - 5) v = 0.2 + (H - ly) * 0.02;
          col = rampPick(TR.stone, v, x, y, 0.25);
        } else if (kind === 'wall') { var row = ly >> 2, off = row % 2 ? 4 : 0; v = (ly % 4 === 0 || (lx + off) % 8 === 0) ? 0.1 : 0.55 + (hash(x >> 3, row, 31) - 0.5) * 0.3; col = rampPick(TR.brick, v, x, y, 0.2); }
        else {   // grass, forest, hill
          v = 0.52 + (hash(x >> 2, y >> 1, 1) - 0.5) * 0.22 + (hash(x, y, 2) - 0.5) * 0.14 + (kind === 'forest' ? -0.22 : 0);
          if (kind === 'hill') { var hx = lx / W - 0.45, hy = ly / H - 0.5; v += 0.28 - (hx * 0.6 + hy * 0.9) * 0.5 - (hx * hx + hy * hy) * 0.8; if (ly > H - 3) v -= 0.3; }
          if (kind === 'forest') { var bx = (lx - W * 0.5) / (W * 0.32), by = (ly - H * 0.42) / (H * 0.3), bq = bx * bx + by * by; if (bq < 1) v = 0.55 - (bx * 0.5 + by * 0.7) * 0.35 + (hash(x, y, 5) - 0.5) * 0.25; else if (bq < 1.5 && by > 0) v = 0.12; }
          if (hash(x, y, 3) < 0.04) v += 0.3;
          col = rampPick(TR.grass, v, x, y, 0.22);
          if (kind === 'grass' && hash(x >> 4, y >> 4, 5) < 0.3 && hash(x, y, 6) < 0.012) col = ['#f0d860', '#f08aa0', '#e0e8ff'][Math.floor(hash(x, y, 8) * 3)];
        }
        if (edge && kind !== 'water') col = mix(col, '#000000', 0.12);   // faint tile seams
        var cc = rgb(col), k2 = (ly * W + lx) * 4; d[k2] = cc[0]; d[k2 + 1] = cc[1]; d[k2 + 2] = cc[2]; d[k2 + 3] = 255;
      }
      g.putImageData(id, 0, 0); TILES[key] = c;
    }
    var ps = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false; ctx.drawImage(c, r.x, r.y, r.w, r.h); ctx.imageSmoothingEnabled = ps;
  };

  // pixel figure cards: 16x24, outlined, lit from the upper left; body in the team colour, headgear and weapon by kind
  var OUT = '#120e18', FIG = {};
  function ramp4(b) { return [mix(b, '#ffffff', 0.38), b, mix(b, '#000000', 0.28), mix(b, '#000000', 0.5)]; }
  function cardFrom(W, H, paint) {
    var px = new Array(W * H), set = function (x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = c; };
    paint(set);
    var c = mk(W, H), g = c.getContext('2d');
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var v = px[y * W + x]; if (v) { g.fillStyle = v; g.fillRect(x, y, 1, 1); continue; }
      if ((x > 0 && px[y * W + x - 1]) || (x < W - 1 && px[y * W + x + 1]) || (y > 0 && px[(y - 1) * W + x]) || (y < H - 1 && px[(y + 1) * W + x])) { g.fillStyle = OUT; g.fillRect(x, y, 1, 1); }
    }
    return c;
  }
  function bandOf(d) { return d < -0.4 ? 0 : d < 0.3 ? 1 : d < 0.72 ? 2 : 3; }
  function figure(kind, team) {
    var key = kind + team; if (FIG[key]) return FIG[key];
    var body = { a: '#4a78d0', b: '#b04a36', n: '#8d8a9c' }[team] || '#4a78d0', head = { knight: '#c8ccd8', mage: mix(body, '#20102a', 0.45), fighter: '#5a3a2a', archer: '#3a5a2a', monster: body }[kind] || '#c8ccd8';
    var R = ramp4(body), HR = ramp4(head), SKN = ramp4(kind === 'monster' ? mix(body, '#9aff9a', 0.4) : '#f0c09a'), BOOT = ramp4('#4a3226'), AC = ramp4('#e8c060');
    return (FIG[key] = cardFrom(16, 24, function (set) {
      var y, x;
      if (kind === 'monster') {   // a lumpy beast: one big shaded body, horns, glowing eyes
        for (y = 6; y <= 22; y++) for (x = 1; x <= 14; x++) { var mx = (x + 0.5 - 8) / 6.6, my = (y + 0.5 - 15) / 8; if (mx * mx + my * my <= 1) set(x, y, R[bandOf(mx * 0.8 + my * 0.6)]); }
        set(4, 5, '#e8e0c8'); set(4, 4, '#e8e0c8'); set(11, 5, '#e8e0c8'); set(11, 4, '#e8e0c8'); set(6, 11, '#fff27a'); set(10, 11, '#fff27a'); set(6, 12, '#ff9a3a'); set(10, 12, '#ff9a3a');
        return;
      }
      for (y = 19; y <= 22; y++) [5, 6, 9, 10].forEach(function (xx) { set(xx, y, BOOT[xx === 5 ? 1 : xx === 10 ? 3 : 2]); });
      for (y = 11; y <= 19; y++) { var hw = 3.2 + (y - 11) * (kind === 'mage' ? 0.42 : 0.22); for (x = 0; x < 16; x++) { var d = (x + 0.5 - 8) / hw; if (Math.abs(d) <= 1) set(x, y, R[Math.max(0, bandOf(d) - (y === 11 ? 1 : 0))]); } }
      for (x = 4; x <= 11; x++) set(x, 15, AC[x < 7 ? 0 : x < 10 ? 1 : 2]);
      for (y = 12; y <= 16; y++) { set(3, y, R[1]); set(12, y, R[3]); } set(3, 17, SKN[1]); set(12, 17, SKN[2]);
      for (y = 4; y <= 11; y++) for (x = 4; x <= 12; x++) { var dx = x + 0.5 - 8, dy = y + 0.5 - 7.6; if (dx * dx + dy * dy <= 11.5) set(x, y, SKN[bandOf(dx / 3.4 + dy / 8)]); }
      set(7, 8, '#2a1c20'); set(9, 8, '#2a1c20');
      if (kind === 'knight') {
        for (y = 3; y <= 6; y++) for (x = 4; x <= 12; x++) { var ex = x + 0.5 - 8, ey = y + 0.5 - 7.4; if (ex * ex + ey * ey <= 13) set(x, y, HR[bandOf(ex / 3.6 + ey / 6)]); }
        for (x = 4; x <= 12; x++) set(x, 7, HR[x < 7 ? 1 : 2]); set(8, 1, '#e05040'); set(8, 2, '#c03a30'); set(9, 1, '#ff7060');
        for (y = 6; y <= 18; y++) set(14, y, y < 8 ? '#fff8f0' : '#d8e0f0'); set(13, 16, '#e8c060'); set(14, 16, '#e8c060'); set(15, 16, '#a07a30');
        for (y = 12; y <= 18; y++) for (x = 1; x <= 3; x++) set(x, y, ['#d8dce8', '#9aa0b8', '#6a7088'][x - 1]); set(2, 14, '#e8c060');
      } else if (kind === 'mage') {
        for (y = 0; y <= 6; y++) for (x = 3; x <= 13; x++) { var w = y === 6 ? 5 : y * 0.7; if (Math.abs(x + 0.5 - 8 - (6 - y) * 0.3) <= w) set(x, y, HR[bandOf((x + 0.5 - 8) / (w + 0.5))]); }
        for (x = 3; x <= 13; x++) set(x, 6, AC[x < 7 ? 1 : 2]);
        for (y = 3; y <= 22; y++) set(1, y, '#6a4a30'); set(1, 1, team === 'b' ? '#f0a0ff' : '#a0f0ff'); set(0, 2, team === 'b' ? '#c060f0' : '#40b8f0'); set(2, 2, team === 'b' ? '#c060f0' : '#40b8f0'); set(1, 2, '#ffffff'); set(1, 3, team === 'b' ? '#c060f0' : '#40b8f0');
      } else {   // fighter (axe) / archer (bow): a hood
        for (y = 3; y <= 10; y++) for (x = 3; x <= 13; x++) { var bx = x + 0.5 - 8, by = y + 0.5 - 7.4; if (bx * bx + by * by <= 21 && !(Math.abs(bx) < 2.6 && y >= 7 && y <= 10)) set(x, y, HR[bandOf(bx / 4.6 + by / 7)]); }
        if (kind === 'archer') { for (y = 6; y <= 20; y++) set(14 - Math.round(Math.sin((y - 6) / 14 * Math.PI) * 2), y, '#8a6040'); for (y = 6; y <= 20; y++) set(13, y, '#e8e0d0'); }
        else { for (y = 5; y <= 18; y++) set(14, y, '#8a6040'); for (y = 4; y <= 8; y++) { set(12, y, '#c8ccd8'); set(13, y, '#e8ecf4'); } set(12, 9, '#7a8098'); }
      }
    }));
  }
  // standard lights (SPEC §2.5: {x, y, r, col '#rrggbb', intensity 0..1, kind, h}) -> internal {x, y, h, col [r,g,b] 0..1, i, r}.
  // The diorama over-exposes on purpose: intensity x3.0 (fire 0.5 -> 1.5) and radius x2.4 (the pool spreads past the nominal reach).
  function inLights(list) {
    return (list || []).map(function (l) {
      if (l && l.intensity == null && l.i != null && Array.isArray(l.col)) return l;   // already internal (pre-standard hosts)
      var n = API.normLight ? API.normLight(l) : l;
      var warm = /fire|lamp|torch|brazier|candle/.test(n.kind || '') ? mix(n.col, '#ff8a40', 0.35) : n.col;   // warm sources lean orange so they read against green and the cool ambient
      return { x: n.x, y: n.y, h: n.h || 16, col: rgb(warm).map(function (v) { return v / 255; }), i: n.intensity * 3.0, r: n.r * 2.4, kind: n.kind };
    });
  }
  skin.inLights = inLights;
  var LITC = {};
  // litCard: card x ambient (floor 0.6) + side light from each point light, capped at 0.3 in total
  function litCard(key, src, lights, amb, fx, fy) {
    var w = src.width, h = src.height, c = LITC[key] || (LITC[key] = mk(w, h)), g = c.getContext('2d');
    var A = lightAt(lights, amb, fx, fy - h / 2, h / 2), ca = A.map(function (v) { return Math.max(palette.light.ambientFloor, Math.min(1, v * 0.85)); });
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h); g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = rgba(ca.map(function (v) { return v * 255; }), 1); g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter'; var total = 0;
    (lights || []).forEach(function (l) {
      var dx = l.x - fx, dy = (l.y - l.h) - (fy - h / 2), d = Math.hypot(dx, dy) || 1, q = (dx * dx + dy * dy) / (l.r * l.r); if (q >= 1) return;
      var k = Math.min(palette.light.cardCap - total, (1 - q) * (1 - q) * l.i * 0.55); if (k < 0.02) return; total += k;
      var ux = dx / d, uy = dy / d, R = Math.max(w, h) / 2, gr = g.createLinearGradient(w / 2 + ux * R, h / 2 + uy * R, w / 2 - ux * R, h / 2 - uy * R), col = l.col.map(function (v) { return v * 255; });
      gr.addColorStop(0, rgba(col, k)); gr.addColorStop(0.45, rgba(col, k * 0.4)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-over';
    return c;
  }
  function lightAt(ls, amb, x, y, h) { var o = (amb || palette.light.ambient).slice(); (ls || []).forEach(function (l) { var dx = x - l.x, dy = y - l.y, dz = (h || 8) - l.h, d2 = dx * dx + dy * dy + dz * dz, q = d2 / (l.r * l.r); if (q >= 1) return; var f = (1 - q) * (1 - q) * l.i; o[0] += l.col[0] * f; o[1] += l.col[1] * f; o[2] += l.col[2] * f; }); return o; }
  var SIL = new Map();
  function silhouette(src) { var c = SIL.get(src); if (c) return c; c = mk(src.width, src.height); var g = c.getContext('2d'); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#05040a'; g.fillRect(0, 0, c.width, c.height); SIL.set(src, c); return c; }
  // castShadows: the card's silhouette laid on the floor away from up to 3 lights, plus a contact shadow
  // soft shadow silhouette: fades toward the head (far end of the shadow) and is stored at half resolution with a 1 px margin,
  // so drawing it back up through the skew transform gives soft edges (no ctx.filter)
  var SOFT = new Map();
  function softSil(src) {
    var c = SOFT.get(src); if (c) return c;
    var w = src.width, h = src.height, full = mk(w + 4, h + 4), g = full.getContext('2d');
    g.drawImage(silhouette(src), 2, 2); g.globalCompositeOperation = 'destination-in';
    var gr = g.createLinearGradient(0, 2, 0, h + 2); gr.addColorStop(0, 'rgba(0,0,0,0.15)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.fillRect(0, 0, w + 4, h + 4);
    c = mk(Math.ceil(w / 2) + 2, Math.ceil(h / 2) + 2); var g2 = c.getContext('2d'); g2.imageSmoothingEnabled = true; g2.imageSmoothingQuality = 'high'; g2.drawImage(full, 0, 0, c.width, c.height);
    SOFT.set(src, c); return c;
  }
  function castShadows(ctx, src, fx, fy, lights, skipIndex) {
    var h = src.height, w = src.width, m = ctx.getTransform(), k = Math.abs(m.a) || 1;
    (lights || []).map(function (l, i) { var dx = fx - l.x, dy = fy - l.y, d = Math.hypot(dx, dy), q = (d * d + l.h * l.h) / (l.r * l.r); return { l: l, i: i, d: d, dx: dx, dy: dy, c: q >= 1 ? 0 : (1 - q) * (1 - q) * l.i }; })
      .filter(function (c) { return c.c > 0.06 && c.i !== skipIndex; }).sort(function (a, b) { return b.c - a.c; }).slice(0, 3)
      .forEach(function (c) {
        var len = Math.max(6, Math.min(h * 1.25, 30, h * c.d / Math.max(4, c.l.h * 1.1))), ux = c.dx / (c.d || 1), uy = c.dy / (c.d || 1), vx = ux * len, vy = uy * len * 0.85;
        var px = -uy, py = ux; if (px < 0) { px = -px; py = -py; } var pl = Math.max(0.8, Math.hypot(px, py)); px /= pl; py /= pl;
        ctx.save(); ctx.globalAlpha *= Math.min(0.72, c.c * 1.25); ctx.imageSmoothingEnabled = true;
        ctx.setTransform(k * px, k * py, k * (-vx / h), k * (-vy / h), m.a * fx + m.e, m.d * fy + m.f); ctx.drawImage(softSil(src), 0, 0, Math.ceil(w / 2) + 2, Math.ceil(h / 2) + 2, -w / 2 - 2, -h - 2, w + 4, h + 4); ctx.restore();
      });
    var gr = ctx.createRadialGradient(fx, fy, 0, fx, fy, w * 0.42); gr.addColorStop(0, 'rgba(4,3,10,0.62)'); gr.addColorStop(1, 'rgba(4,3,10,0)');
    ctx.save(); ctx.translate(fx, fy); ctx.scale(1, 0.4); ctx.translate(-fx, -fy); ctx.fillStyle = gr; ctx.fillRect(fx - w, fy - w, w * 2, w * 2); ctx.restore();
  }
  // token(ctx, rect, unit, t): a lit pixel card standing on the bottom of rect. unit = {team, kind, selected, dead, facing, id,
  //   lights (scene lights, native px), ambient}. Idle breath is frame-stepped (433 ms); selected units also bob 1 px.
  skin.unitToken = function (ctx, r, u, t) {
    u = u || {}; var ULS = inLights(u.lights), src = figure(u.kind || 'fighter', u.team || 'a'), fx = r.x + r.w / 2, fy = r.y + r.h - 1, ms = (t || 0) * 1000;
    var bob = Math.floor(ms / 433 + (u.id ? hash(String(u.id).length, String(u.id).charCodeAt(0)) * 2 : 0)) % 2, sel = u.selected ? Math.floor(ms / 250) % 2 : 0;
    ctx.save(); if (u.dead) ctx.globalAlpha *= 0.35;
    if (!u.noShadow) castShadows(ctx, src, fx, fy, ULS);
    var c = litCard('tok' + (u.id || u.kind + u.team), src, ULS, u.ambient, fx, fy);
    ctx.imageSmoothingEnabled = false;
    if (u.facing === -1) { ctx.translate(Math.round(fx) * 2, 0); ctx.scale(-1, 1); }
    ctx.drawImage(c, 0, bob, 16, 24 - bob, Math.round(fx - 8), Math.round(fy - 23 - sel) + bob, 16, 24 - bob);
    if (u.kind === 'mage' && !u.dead) { var ox = Math.round(fx - 8) + 1.5, oy = Math.round(fy - 23 - sel) + bob + 2, oc = u.team === 'b' ? '#d080ff' : '#7ae8ff';
      ctx.globalCompositeOperation = 'lighter'; var og = ctx.createRadialGradient(ox, oy, 0, ox, oy, 7); og.addColorStop(0, rgba(oc, 0.75)); og.addColorStop(0.3, rgba(oc, 0.3)); og.addColorStop(1, rgba(oc, 0)); ctx.fillStyle = og; ctx.fillRect(ox - 7, oy - 7, 14, 14); }
    ctx.restore();
  };
  // atmosphere(ctx, view, t, {phase, lights, ambient, focus: [top, bot], emissive}):
  //   'world' (after floor and props, before overlays and units): floor x light map, light shafts, tilt-shift.
  //   'final' (after units, before HUD text): dust motes coloured by the local light, bloom of opts.emissive, vignette.
  var LMC = null;
  skin.atmosphere = function (ctx, view, t, o) {
    o = o || {}; view = view || { x: 0, y: 0, w: 256, h: 224 }; t = t || 0; var ls = inLights(o.lights), amb = o.ambient || palette.light.ambient, ph = o.phase || 'world';
    if (ph === 'post-props') {
      var fp = o.focus || [view.y + view.h * 0.3, view.y + view.h * 0.76]; skin.post.tiltShift(ctx, Math.min(fp[0], view.y + 44), fp[1], 30, 1.8);
      EMQ.forEach(function (f) { f(ctx); }); EMQ = []; return;   // emissive sources drawn after the blur: lamps stay sharp in the far band
    }
    if (ph === 'world') {
      var W = Math.ceil(view.w / 2), H = Math.ceil(view.h / 2);
      if (!LMC || LMC.w !== W || LMC.h !== H) LMC = { w: W, h: H, mul: mk(W, H), add: mk(W, H) };
      var gm = LMC.mul.getContext('2d'), ga = LMC.add.getContext('2d'), im = gm.createImageData(W, H), ia = ga.createImageData(W, H);
      for (var j = 0; j < H; j++) for (var i = 0; i < W; i++) {
        var X = view.x + i * 2 + 1, Y = view.y + j * 2 + 1, r = amb[0], g = amb[1], b = amb[2];
        for (var n = 0; n < ls.length; n++) { var l = ls[n], dx = X - l.x, dy = Y - l.y, d2 = dx * dx + dy * dy + l.h * l.h, q = d2 / (l.r * l.r); if (q >= 1) continue; var f = (1 - q) * (1 - q) * l.i * (l.h / Math.sqrt(d2) * 0.6 + 0.4); r += l.col[0] * f; g += l.col[1] * f; b += l.col[2] * f; }
        var k = (j * W + i) * 4; im.data[k] = Math.min(255, r * 255); im.data[k + 1] = Math.min(255, g * 255); im.data[k + 2] = Math.min(255, b * 255); im.data[k + 3] = 255;
        ia.data[k] = clamp(r - 1, 0, 1) * 70; ia.data[k + 1] = clamp(g - 1, 0, 1) * 58; ia.data[k + 2] = clamp(b - 1, 0, 1) * 40; ia.data[k + 3] = 255;
      }
      gm.putImageData(im, 0, 0); ga.putImageData(ia, 0, 0);
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(LMC.mul, view.x, view.y, view.w, view.h);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(LMC.add, view.x, view.y, view.w, view.h);
      // saturated pool on the floor around each light (warm fire / lamp, cyan crystal): light is the subject
      ls.forEach(function (l) { var rp = l.r * 0.5, a = Math.min(0.34, 0.2 * l.i), c3 = l.col.map(function (v) { return Math.min(255, v * 255); }), gp = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, rp);
        gp.addColorStop(0, rgba(c3, a)); gp.addColorStop(0.45, rgba(c3, a * 0.45)); gp.addColorStop(1, rgba(c3, 0)); ctx.fillStyle = gp; ctx.fillRect(l.x - rp, l.y - rp, rp * 2, rp * 2); });
      ctx.restore(); EMQ = [];
      if (o.shafts !== false) { skin.post.shaft(ctx, view.x - 30, view.y - 20, view.x + 120, view.y + view.h + 6, 10, 34, '#9ab4e0', 0.05 + 0.02 * Math.sin(t * 0.6)); skin.post.shaft(ctx, view.x + 30, view.y - 20, view.x + 190, view.y + view.h + 6, 6, 22, '#9ab4e0', 0.04); }
      var fb = o.focus || [view.y + view.h * 0.3, view.y + view.h * 0.76];
      if (o.tiltShift === true) skin.post.tiltShift(ctx, fb[0], fb[1], 30, 1.8);   // hosts without the post-props phase may ask for it here
    } else {
      var fy0 = o.focus ? (o.focus[0] + o.focus[1]) / 2 : view.y + view.h * 0.53;
      skin.post.motes(ctx, view, t, { count: o.motes || 56, focusY: fy0, colorAt: function (x, y) { return lightAt(ls, [0.35, 0.4, 0.6], x, y, 12).map(function (v) { return Math.min(1, v); }); } });
      if (o.emissive) skin.post.bloom(ctx, o.emissive, 0.9, 0.7);
      skin.post.vignette(ctx, view.w, view.h, o.vignette == null ? 0.62 : o.vignette);
    }
  };
  // without a host emissive layer: a soft additive halo at every light source, so each light reads as a glowing thing
  function bloomLights(ctx, ls, t) {
    var op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    ls.forEach(function (l) {
      var y0 = l.y - l.h * 0.9, rr2 = 6 + l.i * 6, col = l.col.map(function (v) { return Math.min(255, v * 255 + 40); });
      var g = ctx.createRadialGradient(l.x, y0, 0, l.x, y0, rr2 * 2.2); g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(0.25, rgba(col, 0.25)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(l.x - rr2 * 2.2, y0 - rr2 * 2.2, rr2 * 4.4, rr2 * 4.4);
    });
    ctx.globalCompositeOperation = op;
  }
  skin.post.litCard = litCard; skin.post.castShadows = castShadows; skin.post.lightAt = lightAt; skin.figure = figure;


  /* ---------------- prop(ctx, rect, kind, t, {lights}): standing scene objects as lit pixel cards ---------------- */
  // Cards stand on the bottom centre of rect. '*'-prefixed colours are emissive: drawn unlit on top of the lit card and haloed.
  function cardE(W, H, paint) {
    var px = new Array(W * H), set = function (x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = c; };
    paint(set);
    var c = mk(W, H), e = mk(W, H), g = c.getContext('2d'), ge = e.getContext('2d'), any = false, ex = 0, ey = 0, n = 0;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var v = px[y * W + x];
      if (v) { var em = v[0] === '*', col = em ? v.slice(1) : v; g.fillStyle = col; g.fillRect(x, y, 1, 1); if (em) { ge.fillStyle = col; ge.fillRect(x, y, 1, 1); any = true; ex += x; ey += y; n++; } continue; }
      var nb = function (q) { return q && true; };
      if ((x > 0 && nb(px[y * W + x - 1])) || (x < W - 1 && nb(px[y * W + x + 1])) || (y > 0 && nb(px[(y - 1) * W + x])) || (y < H - 1 && nb(px[(y + 1) * W + x]))) { g.fillStyle = OUT; g.fillRect(x, y, 1, 1); }
    }
    return { c: c, em: any ? e : null, ex: n ? ex / n + 0.5 : 0, ey: n ? ey / n + 0.5 : 0 };
  }
  var PROPC = {};
  function propCard(kind, seed) {
    var key = kind + (kind === 'tree' || kind === 'bush' || kind === 'pine' ? seed % 3 : ''), ST = ['#3c3a40', '#55525a', '#6e6a70', '#8a8488', '#a8a0a0'];
    if (PROPC[key]) return PROPC[key];
    var c;
    if (kind === 'tree') { var GT = ['#173020', '#22472a', '#335f33', '#4c7a3a', '#6c9a48'];
      c = cardE(18, 26, function (set) { var y, x; for (y = 18; y <= 24; y++) { set(8, y, '#5a3a24'); set(9, y, '#3a2416'); }
        var bl = [[9, 9, 6.5], [5.5, 13, 4.5], [12.5, 13, 4.5], [9, 15, 4.5]];
        for (y = 1; y < 20; y++) for (x = 1; x < 17; x++) { var best = null; bl.forEach(function (b) { var dx = x + 0.5 - b[0], dy = y + 0.5 - b[1], q = (dx * dx + dy * dy) / (b[2] * b[2]); if (q <= 1 && (!best || q < best.q)) best = { q: q, dx: dx / b[2], dy: dy / b[2] }; });
          if (best) set(x, y, GT[clamp(Math.floor((0.62 - (best.dx * 0.55 + best.dy * 0.75) * 0.32 + (hash(x, y, seed) - 0.5) * 0.24 - best.q * 0.12) * 5), 0, 4)]); } }); }
    else if (kind === 'pine') { var GP = ['#12281c', '#1c3e28', '#2a5634', '#3e7040', '#5a8c4a'];
      c = cardE(16, 26, function (set) { for (var y = 20; y <= 24; y++) { set(7, y, '#5a3a24'); set(8, y, '#3a2416'); }
        for (var y2 = 1; y2 < 21; y2++) { var tier = y2 < 8 ? (y2 - 1) / 7 : y2 < 14 ? (y2 - 6) / 8 : (y2 - 11) / 9, hw = 1 + tier * 6.5; for (var x2 = 0; x2 < 16; x2++) { var d = (x2 + 0.5 - 8) / hw; if (Math.abs(d) <= 1) set(x2, y2, GP[clamp(Math.floor((0.6 - d * 0.35 - tier * 0.15 + (hash(x2, y2, seed) - 0.5) * 0.2) * 5), 0, 4)]); } } }); }
    else if (kind === 'bush') { var GB = ['#1a3420', '#26502c', '#386a34', '#52823e', '#74a04c'];
      c = cardE(16, 12, function (set) { for (var y = 0; y < 12; y++) for (var x = 0; x < 16; x++) { var dx = (x + 0.5 - 8) / 7, dy = (y + 0.5 - 7) / 5; if (dx * dx + dy * dy - hash(x >> 1, y >> 1, seed) * 0.35 > 1) continue; set(x, y, GB[clamp(Math.floor((0.6 - (dx * 0.5 + dy * 0.7) * 0.35 + (hash(x, y, seed + 1) - 0.5) * 0.3) * 5), 0, 4)]); }
        set(4, 4, '#e86a8a'); set(11, 5, '#e86a8a'); set(8, 3, '#f0d860'); }); }
    else c = cardE(14, 28, function (set) {   // stone, brazier, lamp, crystal: a menhir, with its light on top
      for (var y = 11; y < 28; y++) for (var x = 2; x < 12; x++) { var w = 4.6 - Math.max(0, 14 - y) * 0.25, d = (x + 0.5 - 7) / w; if (Math.abs(d) > 1) continue; var v = 0.66 - d * 0.32 + (hash(x, y, 9) - 0.5) * 0.2 - (y > 25 ? 0.2 : 0); if ((y * 5 + x * 3) % 17 === 0) v -= 0.25; set(x, y, ST[clamp(Math.floor(v * 5), 0, 4)]); }
      if (kind === 'brazier') { for (var bx = 2; bx <= 11; bx++) { set(bx, 10, '#4a3020'); set(bx, 9, bx < 6 ? '#9a7048' : '#6a4630'); }
        for (var fy = 0; fy < 9; fy++) for (var fx = 3; fx <= 10; fx++) { var q = 1 - Math.abs(fx + 0.5 - 7) / (4.2 - fy * 0.38) - (8 - fy) * 0.04; if (q > 0) set(fx, fy, q > 0.6 ? '*#fff8d0' : q > 0.35 ? '*#ffd060' : '*#ff7a30'); } }
      if (kind === 'lamp') { for (var ly = 1; ly <= 9; ly++) for (var lx = 3; lx <= 10; lx++) set(lx, ly, ly === 1 || ly === 9 || lx === 3 || lx === 10 ? '#2a1e14' : ly < 5 ? '*#fff0d8' : '*#ff9a70'); set(6, 0, '#2a1e14'); set(7, 0, '#2a1e14'); set(6, 10, '#2a1e14'); set(7, 10, '#2a1e14'); }
      if (kind === 'crystal') for (var cy = 0; cy < 11; cy++) for (var cx = 2; cx < 12; cx++) { var w2 = cy < 6 ? cy * 0.8 : (11 - cy) * 0.9, d2 = cx + 0.5 - 7; if (Math.abs(d2) <= w2) set(cx, cy, d2 < -w2 * 0.3 ? '*#f0ffff' : d2 < w2 * 0.25 ? '*#8ae8f8' : '*#3a9ac0'); }
    });
    return (PROPC[key] = c);
  }
  var EMQ = [];   // emissive draws queued by prop(), flushed by atmosphere('post-props') after the tilt-shift
  var EMC = { brazier: '#ffc070', lamp: '#ff9a78', crystal: '#8ae8ff' };
  skin.prop = function (ctx, r, kind, t, o) {
    o = o || {}; t = t || 0; kind = { rock: 'stone', torch: 'brazier', fire: 'brazier', copse: 'tree', thicket: 'bush' }[kind] || kind;
    var seed = Math.round(r.x / 16) * 7 + Math.round(r.y / 16), P = propCard(kind, seed), src = P.c, fx = r.x + r.w / 2 + (kind === 'tree' || kind === 'pine' ? (hash(seed, 1) - 0.5) * 3 : 0), fy = r.y + r.h - 1;
    var ls = inLights(o.lights), own = o.light && o.lights ? o.lights.indexOf(o.light) : -1;
    if (own < 0 && EMC[kind]) ls.forEach(function (l, i) { if (Math.abs(l.x - fx) < 16 && Math.abs(l.y - fy) < 28 && own < 0) own = i; });
    if (o.seed != null) seed = o.seed;
    ctx.save();
    castShadows(ctx, src, fx, fy, ls, own);
    var amb = palette.light.ambient.map(function (v) { return v * (kind === 'tree' || kind === 'pine' ? 1.35 : 1.15); });
    var c = litCard('prop' + kind + seed, src, ls, amb, fx, fy), X = Math.round(fx - src.width / 2), Y = Math.round(fy - src.height + 1);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(c, X, Y);
    if (kind === 'tree' || kind === 'pine') {   // cool moonlight rim on the upper-left edge so trees read on a dark bank
      ctx.globalCompositeOperation = 'lighter'; var rg = ctx.createLinearGradient(X, Y, X + src.width * 0.6, Y + src.height * 0.6); rg.addColorStop(0, 'rgba(150,180,255,0.22)'); rg.addColorStop(1, 'rgba(150,180,255,0)');
      var tmp = PROPC['rim' + kind + seed]; if (!tmp) { tmp = PROPC['rim' + kind + seed] = mk(src.width, src.height); }
      var tg = tmp.getContext('2d'); tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, tmp.width, tmp.height); tg.drawImage(src, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = 'rgba(150,180,255,0.35)'; tg.fillRect(0, 0, tmp.width, tmp.height * 0.5);
      ctx.globalAlpha *= 0.6; ctx.drawImage(tmp, X - 0.5, Y - 0.5); ctx.globalAlpha /= 0.6; ctx.globalCompositeOperation = 'source-over';
    }
    if (P.em) {   // emissive pixels unlit on top, flickering, with a bloom halo
      var fl = kind === 'brazier' ? 1 + 0.12 * Math.sin(t * 7.3 + seed) + 0.06 * Math.sin(t * 13.1) : 1, hx = X + P.ex, hy = Y + P.ey, col = EMC[kind];
      var drawEm = function (cx2) { cx2.save(); cx2.imageSmoothingEnabled = false; cx2.drawImage(P.em, X, Y); cx2.globalCompositeOperation = 'lighter';
        [[16, 0.32], [7, 0.6]].forEach(function (q) { var g = cx2.createRadialGradient(hx, hy, 0, hx, hy, q[0] * fl); g.addColorStop(0, rgba(col, q[1])); g.addColorStop(0.35, rgba(col, q[1] * 0.4)); g.addColorStop(1, rgba(col, 0)); cx2.fillStyle = g; cx2.fillRect(hx - q[0] * 1.2, hy - q[0] * 1.2, q[0] * 2.4, q[0] * 2.4); }); cx2.restore(); };
      if (o.deferEmissive !== false) EMQ.push(drawEm);
      ctx.drawImage(P.em, X, Y);
      ctx.globalCompositeOperation = 'lighter';
      [[16, 0.28], [7, 0.55]].forEach(function (q) { var g = ctx.createRadialGradient(hx, hy, 0, hx, hy, q[0] * fl); g.addColorStop(0, rgba(col, q[1])); g.addColorStop(0.35, rgba(col, q[1] * 0.4)); g.addColorStop(1, rgba(col, 0)); ctx.fillStyle = g; ctx.fillRect(hx - q[0] * 1.2, hy - q[0] * 1.2, q[0] * 2.4, q[0] * 2.4); });
      if (kind === 'brazier') for (var k2 = 0; k2 < 3; k2++) { var a = ((t * 0.9 + k2 / 3) % 1), sx = hx + Math.sin(t * 3 + k2 * 2) * 2, sy = hy - 3 - a * 14; ctx.fillStyle = rgba('#ffcf70', (1 - a) * 0.9); ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1); }
    }
    ctx.restore();
  };

  var S = API.register(skin);
  S.post = skin.post; S.layout = layout; S.figure = figure;
})(typeof window !== 'undefined' ? window : this);
