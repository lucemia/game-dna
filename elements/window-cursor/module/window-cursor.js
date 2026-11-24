/* GameDNA C-01 · Bevelled window + pointer cursor · module v1 (plain script, no dependencies, one global)
 *
 *   const wc = GameDNA_WindowCursor.create({
 *     view: { x: 0, y: 0, w: 256, h: 224 },        // screen area windows must stay inside (native px)
 *     skin: 'pixel16',                              // optional; works without skin-api.js (built-in pixel16 look)
 *     getObstacles: () => [{ x, y, w, h, id }],     // sprites (with id) and HUD rects windows must not cover
 *     params: { open: 6, slide: 50, ... }           // see DEFAULTS
 *   });
 *   wc.menu('cmd', { x, y, items: ['Fight', { label: 'Magic', note: '12', disabled: true }], selected: i });
 *   wc.message('The door is locked.');     wc.close('cmd');     wc.setCursor({ id: 'slime1' } | rect | [..] | null);
 *   wc.update(dtMs);   wc.draw(ctx);        // the host keeps its own menu logic and only reports what is selected
 */
(function (root) {
  'use strict';
  var DEFAULTS = { open: 6, slide: 50, bob: 200, rowH: 12, tint: 'a', type: 0, margin: 2, pointer: 'glove', band: 'auto' };
  var FRAME = 1000 / 60;

  /* ---------- built-in pixel16 look (used when skin-api.js is not loaded) ---------- */
  var GLYPH = {
    A: '01110,10001,10001,11111,10001,10001,10001', B: '11110,10001,10001,11110,10001,10001,11110', C: '01110,10001,10000,10000,10000,10001,01110',
    D: '11110,10001,10001,10001,10001,10001,11110', E: '11111,10000,10000,11110,10000,10000,11111', F: '11111,10000,10000,11110,10000,10000,10000',
    G: '01110,10001,10000,10111,10001,10001,01111', H: '10001,10001,10001,11111,10001,10001,10001', I: '01110,00100,00100,00100,00100,00100,01110',
    J: '00111,00010,00010,00010,00010,10010,01100', K: '10001,10010,10100,11000,10100,10010,10001', L: '10000,10000,10000,10000,10000,10000,11111',
    M: '10001,11011,10101,10101,10001,10001,10001', N: '10001,10001,11001,10101,10011,10001,10001', O: '01110,10001,10001,10001,10001,10001,01110',
    P: '11110,10001,10001,11110,10000,10000,10000', Q: '01110,10001,10001,10001,10101,10010,01101', R: '11110,10001,10001,11110,10100,10010,10001',
    S: '01111,10000,10000,01110,00001,00001,11110', T: '11111,00100,00100,00100,00100,00100,00100', U: '10001,10001,10001,10001,10001,10001,01110',
    V: '10001,10001,10001,10001,10001,01010,00100', W: '10001,10001,10001,10101,10101,10101,01010', X: '10001,10001,01010,00100,01010,10001,10001',
    Y: '10001,10001,01010,00100,00100,00100,00100', Z: '11111,00001,00010,00100,01000,10000,11111',
    0: '01110,10001,10011,10101,11001,10001,01110', 1: '00100,01100,00100,00100,00100,00100,01110', 2: '01110,10001,00001,00010,00100,01000,11111',
    3: '11111,00010,00100,00010,00001,10001,01110', 4: '00010,00110,01010,10010,11111,00010,00010', 5: '11111,10000,11110,00001,00001,10001,01110',
    6: '00110,01000,10000,11110,10001,10001,01110', 7: '11111,00001,00010,00100,01000,01000,01000', 8: '01110,10001,10001,01110,10001,10001,01110',
    9: '01110,10001,10001,01111,00001,00010,01100', '/': '00001,00010,00010,00100,01000,01000,10000', '-': '00000,00000,00000,01110,00000,00000,00000',
    '.': '00000,00000,00000,00000,00000,01100,01100', '?': '01110,10001,00001,00010,00100,00000,00100', ' ': '000,000,000,000,000,000,000'
  };
  // punctuation the pixel16 ui font lacks; also drawn on top of any bitmap skin font that lacks them
  var EXTRA = {
    ':': '00,11,11,00,11,11,00', ';': '00,11,11,00,11,01,10', ',': '00,00,00,00,11,01,10', '!': '1,1,1,1,1,0,1', "'": '1,1,0,0,0,0,0',
    '"': '101,101,000,000,000,000,000', '(': '001,010,100,100,100,010,001', ')': '100,010,001,001,001,010,100', '[': '11,10,10,10,10,10,11',
    ']': '11,01,01,01,01,01,11', '+': '00000,00100,00100,11111,00100,00100,00000', '=': '00000,00000,11111,00000,11111,00000,00000',
    '%': '11001,11010,00010,00100,01000,01011,10011', '&': '01100,10010,10100,01000,10101,10010,01101', '*': '00000,10101,01110,11111,01110,10101,00000',
    '#': '01010,11111,01010,01010,01010,11111,01010', '>': '1000,0100,0010,0001,0010,0100,1000', '<': '0001,0010,0100,1000,0100,0010,0001',
    '_': '00000,00000,00000,00000,00000,00000,11111', '$': '00100,01111,10100,01110,00101,11110,00100', '@': '01110,10001,10111,10101,10111,10000,01111'
  };
  // advance of one character in the built-in font: 6 for the mono letters, glyph width + 1 for narrow punctuation, 4 for space
  function fbAdv(ch) { if (ch === ' ') return 4; var e = !GLYPH[ch] && EXTRA[ch]; return e ? e.split(',')[0].length + 1 : 6; }
  function fbMeasure(s) { s = String(s).toUpperCase(); var w = 0; for (var i = 0; i < s.length; i++) w += fbAdv(s[i]); return Math.max(0, w - 1); }
  var FB = {
    windows: {
      a: ['#3a64d8', '#2c50b8', '#223e96', '#1a2e74', '#a8c8ff', '#0a1238'],
      b: ['#d85a48', '#b8402e', '#922c26', '#6a1c1e', '#ffc8b8', '#2a0608'],
      n: ['#4c5a8a', '#3e4a76', '#323c62', '#262e4e', '#c8d4f4', '#0a0e22']
    },
    edge: '#06061a', rivet: '#ffe070', rivetShade: '#7a5410',
    text: { main: '#ffffff', main2: '#c8d4ff', shadow: '#0a0c24', dim: '#8088a8', dim2: '#626a88', label: '#b8d0ff', label2: '#8ca8e8',
      gold: '#ffe890', gold2: '#e8c048', pointer: '#fff8e8', pointerEdge: '#1a0e08', outline: '#120a1e' }
  };
  function fbText(g, s, x, y, c1, c2, sh) {
    for (var pass = sh ? 0 : 1; pass < 2; pass++) {
      var cx = x, str = String(s).toUpperCase();
      for (var i = 0; i < str.length; i++) {
        var ch = str[i], src = GLYPH[ch] || EXTRA[ch] || GLYPH['?'], rows = src.split(',');
        for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < rows[ry].length; rx++) if (rows[ry][rx] === '1') {
          g.fillStyle = pass ? (ry < 4 ? c1 : c2) : sh;
          g.fillRect(cx + rx + (pass ? 0 : 1), y + ry + (pass ? 0 : 1), 1, 1);
        }
        cx += fbAdv(ch);
      }
    }
  }
  function fbFrame(g, r, team, alpha) {
    var x = r.x, y = r.y, w = r.w, h = r.h, C = FB.windows[team] || FB.windows.a, i, pa = g.globalAlpha, a = alpha == null ? 1 : alpha;
    g.globalAlpha = pa * 0.95 * a;
    for (i = 0; i < h - 2; i++) { g.fillStyle = C[Math.min(3, Math.floor(i / (h - 2) * 4))]; g.fillRect(x + 1, y + 1 + i, w - 2, 1); }
    g.globalAlpha = pa * a; g.fillStyle = FB.edge;
    g.fillRect(x + 2, y, w - 4, 1); g.fillRect(x + 2, y + h - 1, w - 4, 1); g.fillRect(x, y + 2, 1, h - 4); g.fillRect(x + w - 1, y + 2, 1, h - 4);
    g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + w - 2, y + 1, 1, 1); g.fillRect(x + 1, y + h - 2, 1, 1); g.fillRect(x + w - 2, y + h - 2, 1, 1);
    g.fillStyle = C[4]; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 5);
    g.fillStyle = C[5]; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
    [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]].forEach(function (p) { g.fillStyle = FB.rivetShade; g.fillRect(p[0], p[1], 2, 2); g.fillStyle = FB.rivet; g.fillRect(p[0], p[1], 1, 1); });
    g.globalAlpha = pa;
    return { x: x + 4, y: y + 4, w: w - 8, h: h - 8 };
  }
  // pointing glove, 10x7, tip at the right edge, row 2 (original art)
  var GLOVE = ['.oooo.....', 'oWWWWboooo', 'oWWWWWWWWo', 'oWWWWboooo', 'oWWWWo....', 'osWWso....', '.oooo.....'];

  /* ---------- skin adapter: everything visible goes through here ---------- */
  function adapter(SK) {
    var T = SK ? SK.palette.text || {} : FB.text, F = SK && SK.fonts ? SK.fonts.ui || {} : {}, L = (SK && SK.layout) || {}, SKAPI = root.GameDNA_Skin;
    var pick = function () { for (var i = 0; i < arguments.length; i++) if (arguments[i]) return arguments[i]; return '#ffffff'; };
    var roles = {
      main: [pick(T.main), pick(T.main2, T.main)], dim: [pick(T.dim, T.label, T.main), pick(T.dim2, T.dim, T.main)],
      title: [pick(T.label, T.accent, T.main), pick(T.label2, T.label, T.accent, T.main)], note: [pick(T.gold, T.accent, T.main), pick(T.gold2, T.gold, T.accent, T.main)],
      sel: [pick(T.select, T.accent, T.main), pick(T.accent, T.select, T.main)]
    };
    roles.dimNote = roles.dim;
    var bitmap = SK && F.type === 'bitmap' && F.glyphs, up = !SK || F.uppercase;
    var adv = SK ? (F.advance || 6) : 6;
    // per-character advance in a bitmap skin font (used only for strings that need EXTRA glyphs)
    function cadv(ch) {
      if (missing(ch)) return fbAdv(up ? ch.toUpperCase() : ch);
      if (ch === ' ') return F.space != null ? F.space : adv;
      return F.advance || (SK.measure(ch, { font: 'ui' }) + (F.spacing || 1));
    }
    function missing(ch) { if (!bitmap) return false; var c = up ? ch.toUpperCase() : ch; return ch !== ' ' && !F.glyphs[c] && !!EXTRA[c]; }
    var A = {
      fontH: SK ? (F.height || F.size || 7) : 7,
      pad: SK ? (SK.shape && SK.shape.padding != null ? SK.shape.padding : 4) : 4,
      // role -> skin font: titles use fonts.title, notes fonts.small when the skin has them; everything else 'ui'
      fontOf: function (role) { var FS = SK && SK.fonts || {}; return role === 'title' && FS.title ? 'title' : (role === 'note' || role === 'dimNote') && FS.small ? 'small' : 'ui'; },
      measure: function (s, role) {
        s = String(s); if (!SK) return fbMeasure(s);
        var fn = A.fontOf(role);
        if (fn !== 'ui') { try { return SK.measure(s, { font: fn }); } catch (e) { return fbMeasure(s); } }
        try {
          var gaps = false, w = 0; for (var i = 0; i < s.length; i++) if (missing(s[i])) gaps = true;
          if (!gaps) return SK.measure(s, { font: 'ui' });
          for (var j = 0; j < s.length; j++) w += cadv(s[j]);
          return Math.max(0, w - 1);
        } catch (e) { return fbMeasure(s); }
      },
      frame: function (g, r, team, alpha) {
        if (!SK) return fbFrame(g, r, team, alpha);
        return SK.frame(g, r, { role: 'window', team: team, alpha: alpha }) || { x: r.x + A.pad, y: r.y + A.pad, w: r.w - 2 * A.pad, h: r.h - 2 * A.pad };
      },
      text: function (g, s, x, y, role, alpha) {
        var c = roles[role] || roles.main, pa = g.globalAlpha; s = String(s);
        if (alpha != null) g.globalAlpha = pa * alpha;
        var fn = SK ? A.fontOf(role) : 'ui';
        if (!SK) fbText(g, s, x, y, c[0], c[1], FB.text.shadow);
        else if (fn !== 'ui') SK.text(g, s, x, y, { font: fn, color: c[0], color2: c[1] });
        else {
          var gaps = false; for (var i = 0; i < s.length; i++) if (missing(s[i])) { gaps = true; break; }
          if (!gaps) SK.text(g, s, x, y, { font: 'ui', color: c[0], color2: c[1] });
          else {   // draw run by run; glyphs the skin font lacks come from EXTRA in the skin's colours
            var cx = x;
            for (var j = 0; j < s.length; j++) {
              if (missing(s[j])) fbText(g, s[j], cx, y, c[0], c[1], T.shadow || FB.text.shadow);
              else if (s[j] !== ' ') SK.text(g, s[j], cx, y, { font: 'ui', color: c[0], color2: c[1] });
              cx += cadv(s[j]);
            }
          }
        }
        g.globalAlpha = pa;
      },
      // pointer: 'glove' = 10x7 glove coloured from the skin's text tokens; 'skin' = the skin's own cursor(..., 'hand')
      hand: function (g, x, y, mirror, alpha, mode, t) {
        var pa = g.globalAlpha;
        if (!(SK && mode === 'skin')) g.globalAlpha = pa * (alpha == null ? 1 : alpha);   // the skin's cursor() applies opts.alpha itself
        if (SK && mode === 'skin') {
          var hw = A.handW(mode), hh = A.handH(mode);
          if (mirror) { g.save(); g.translate(2 * x + hw, 0); g.scale(-1, 1); }
          SK.cursor(g, { x: x, y: y + Math.floor((7 - hh) / 2), w: hw, h: hh }, 'hand', A.skinBob(mode) ? (t || 0) : 0, { alpha: alpha });
          if (mirror) g.restore();
        } else {
          var P = { o: pick(T.pointerEdge, T.outline, SK && SK.palette.ink), W: pick(T.pointer, T.main), s: pick(T.main2, T.dim, T.main), b: pick(T.main2, T.dim, T.main) };
          for (var yy = 0; yy < 7; yy++) for (var xx = 0; xx < 10; xx++) {
            var ch = GLOVE[yy][mirror ? 9 - xx : xx]; if (ch === '.') continue;
            g.fillStyle = P[ch]; g.fillRect(x + xx, y + yy, 1, 1);
          }
        }
        g.globalAlpha = pa;
      },
      // opaque under-fill for a window drawn over another window (skin windows may be slightly translucent)
      backing: function (g, r, team) {
        if (SK && L.backing === 'frame') { SK.frame(g, r, { role: 'backing', team: team }); return; }
        if (SK && (L.backing === 'none' || !SK.pixel || (SK.shape && SK.shape.radius > 0))) return;   // smooth / rounded frames: no square under-fill
        // pixel16's documented 6-colour window ramp (darkest band = [3]); any other skin: ui.fillTo / ui.fill
        var Pp = SK ? SK.palette : null, wr = Pp && Pp.windows && Pp.windows[team], c = Pp ? (wr && wr.length === 6 ? wr[3] : Pp.ui && (Pp.ui.fillTo || Pp.ui.fill)) : (FB.windows[team] || FB.windows.a)[3];
        g.fillStyle = c || '#000000'; g.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      },
      // the skin's own hand: size from skin.layout.handW / handH (default 7x5, the pixel16 hand); the glove is 10x7
      // smooth skins animate their own hand from t (seconds, module clock); pixel skins keep the module's whole-pixel bob
      skinBob: function (mode) { return !!(SK && mode === 'skin' && !SK.pixel); },
      handW: function (mode) { return SK && mode === 'skin' ? Math.max(3, Math.round(num(L.handW, 7))) : 10; },
      // label gap after the hand: glove 3 (unchanged); skin hand: skin.layout.pointerGap (default 5) measured from the hand's right edge
      gap: function (mode) { return SK && mode === 'skin' ? Math.max(1, Math.round(num(L.pointerGap, 5))) - 1 : 3; },
      handH: function (mode) { return SK && mode === 'skin' ? Math.max(3, Math.min(7, Math.round(num(L.handH, 5)))) : 7; },
      // selected-row band: the skin's frame role 'row' (SPEC v2; generic = ui.select fill); built-in look: the pixel16 fill
      band: function (g, r, alpha) {
        var pa = g.globalAlpha; g.globalAlpha = pa * (alpha == null ? 1 : alpha);
        if (SK) SK.frame(g, r, { role: 'row', focus: true });
        else { g.fillStyle = (SK && SK.palette.ui && SK.palette.ui.select) || 'rgba(255,255,255,0.2)'; g.fillRect(r.x, r.y, r.w, r.h); }
        g.globalAlpha = pa;
      },
      bandAuto: !!(SK && (L.rowBand != null ? L.rowBand : !SK.pixel && SK.palette.ui && SK.palette.ui.select)),
      // window grow / shrink curve from the skin's motion rules: an easing other than linear / snap (e.g. outBack = overshoot) is
      // applied to the progress; a frame-stepped skin (motion.stepMs longer than one 60 Hz frame) steps it. pixel16: unchanged.
      openCurve: function (p, openMs) {
        if (!SK || !SKAPI || !SKAPI.motion || !SK.motion) return p;
        var m = SK.motion, nm = m.ease && (m.ease.open || m.ease.pop), st = num(m.stepMs, 0);
        if (st > FRAME + 0.01 && openMs > 0 && p > 0 && p < 1) p = Math.min(1, Math.floor(p * openMs / st + 1e-6) * st / openMs);
        if (nm && nm !== 'linear' && nm !== 'snap' && p > 0 && p < 1) { try { p = SKAPI.motion.ease(SK, m.ease.open ? 'open' : 'pop', p); } catch (e) {} }
        return p;
      },
      // "more text" arrow: 5x3 down triangle with outline
      more: function (g, x, y) {
        if (SK && SK.pixel === false) { try { SK.text(g, '\u25BC', x + 3, y - 2, { font: 'ui', color: roles.title[0], align: 'center' }); return; } catch (e) {} }
        var o = pick(T.pointerEdge, T.outline), w = pick(T.pointer, T.main);
        g.fillStyle = o; g.fillRect(x - 1, y - 1, 7, 2); g.fillRect(x, y + 1, 5, 1); g.fillRect(x + 1, y + 2, 3, 1); g.fillRect(x + 2, y + 3, 1, 1);
        g.fillStyle = w; g.fillRect(x, y, 5, 1); g.fillRect(x + 1, y + 1, 3, 1); g.fillRect(x + 2, y + 2, 1, 1);
      }
    };
    return A;
  }

  /* ---------- helpers ---------- */
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function okRect(r) { return r && isFinite(r.x) && isFinite(r.y) && isFinite(r.w) && isFinite(r.h) && r.w > 0 && r.h > 0; }
  function ov(a, b) { var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; }
  function outQuad(s) { s = Math.max(0, Math.min(1, s)); return 1 - (1 - s) * (1 - s); }
  function normItem(it) {
    if (it == null) return { label: '' };
    if (typeof it !== 'object') return { label: String(it) };
    var lab = it.label != null ? it.label : it.text != null ? it.text : it.name != null ? it.name : '';
    return { label: String(lab), note: it.note != null && it.note !== '' ? String(it.note) : null, disabled: !!it.disabled || it.enabled === false || it.ok === false };
  }

  function create(opt) {
    opt = opt || {};
    var P = {}, k; for (k in DEFAULTS) P[k] = DEFAULTS[k];
    function setParams(o) {
      if (!o) return;
      for (var key in o) if (key in DEFAULTS && o[key] != null && o[key] !== '') {
        P[key] = typeof DEFAULTS[key] === 'number' ? num(o[key], DEFAULTS[key]) : String(o[key]);
      }
      P.open = Math.max(0, Math.min(30, P.open)); P.slide = Math.max(0, P.slide); P.bob = Math.max(50, P.bob); P.rowH = Math.max(8, P.rowH);
    }
    setParams(opt.params);
    var SKIN = root.GameDNA_Skin, SK = null;
    try { SK = opt.skin === false || opt.skin === null ? null : SKIN && SKIN.resolve ? SKIN.resolve(opt.skin) : null; } catch (e) { SK = null; }   // skin: false = built-in look
    // smooth skins: their own hand by default (the 10x7 glove is pixel art); an explicit params.pointer wins
    if (SK && SK.pixel === false && !(opt.params && opt.params.pointer)) P.pointer = 'skin';
    var D = adapter(SK);
    // canvas-font skins: widths can change once web / system fonts finish loading; re-measure and re-wrap every window then
    try {
      var CF = SK && SK.fonts && SK.fonts.ui && SK.fonts.ui.type === 'canvas';
      if (CF && root.document && document.fonts && document.fonts.ready) document.fonts.ready.then(function () { try { wins.forEach(function (w) { w.key = null; relayout(w, true); }); dbg({ event: 'fonts' }); } catch (e) {} });
    } catch (e) {}
    var warned = {};
    function warn(key, msg) { if (warned[key]) return; warned[key] = 1; try { if (root.console) console.warn('GameDNA_WindowCursor: ' + msg); } catch (e) {} dbg({ event: 'warn', key: key, msg: msg }); }
    function dbg(e) { if (typeof opt.debug === 'function') try { opt.debug(e); } catch (er) {} }

    var V = okRect(opt.view) ? { x: opt.view.x, y: opt.view.y, w: opt.view.w, h: opt.view.h } : null;   // null until known (first draw reads the canvas)
    function view() { return V || { x: 0, y: 0, w: 256, h: 224 }; }
    var wins = [], byId = {}, clock = 0, updates = 0, draws = 0, drawsNoUpdate = 0, lastWall = 0, burst = 0, drawn = [];
    var obsCache = [], idRects = {};
    var ptr = { list: null, side: 'auto', delta: null, t: 0, len: 0, key: '', shown: [] };

    function obstacles() {
      var o = [];
      if (typeof opt.getObstacles === 'function') {
        try { o = opt.getObstacles() || []; } catch (e) { warn('obs', 'getObstacles threw: ' + e); o = obsCache; }
      }
      if (!Array.isArray(o)) o = [];
      o = o.filter(okRect);
      o.forEach(function (r) { if (r.id != null) idRects[String(r.id)] = { x: r.x, y: r.y, w: r.w, h: r.h, id: r.id }; });
      obsCache = o;
      return o;
    }

    /* ---------- placement: on screen, off the host's rects ---------- */
    function place(w, h, want, o) {
      o = o || {}; var Vw = view(), m = P.margin;
      w = Math.max(8, Math.min(Math.round(w), Vw.w)); h = Math.max(8, Math.min(Math.round(h), Vw.h));
      var cx = function (x) { return Math.round(Math.max(Vw.x, Math.min(Vw.x + Vw.w - w, x))); }, cy = function (y) { return Math.round(Math.max(Vw.y, Math.min(Vw.y + Vw.h - h, y))); };
      var obs = o.avoid === false ? [] : obstacles().concat(o.extra || []).map(function (r) { return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m }; });
      var cost = function (x, y) { var c = 0, R = { x: x, y: y, w: w, h: h }; for (var i = 0; i < obs.length; i++) c += ov(R, obs[i]); return c; };
      var x0 = cx(num(want && want.x, Vw.x + (Vw.w - w) / 2)), y0 = cy(num(want && want.y, Vw.y + Vw.h - h - 8));
      var tries = [[x0, y0]].concat((o.alts || []).map(function (a) { return [cx(a.x), cy(a.y)]; }));
      for (var i = 0; i < tries.length; i++) if (!cost(tries[i][0], tries[i][1])) return { x: tries[i][0], y: tries[i][1], w: w, h: h, moved: i > 0 };
      var best = null, bs = Infinity, xs = [], ys = [], x, y;
      for (x = Vw.x; x <= Vw.x + Vw.w - w; x += 2) xs.push(x); xs.push(Vw.x + Vw.w - w);
      for (y = Vw.y; y <= Vw.y + Vw.h - h; y += 2) ys.push(y); ys.push(Vw.y + Vw.h - h);
      for (var a = 0; a < ys.length; a++) for (var b = 0; b < xs.length; b++) {
        var s = cost(xs[b], ys[a]) * 1000 + Math.abs(xs[b] - x0) * 1.2 + Math.abs(ys[a] - y0);
        if (s < bs) { bs = s; best = [xs[b], ys[a]]; }
      }
      return { x: best[0], y: best[1], w: w, h: h, moved: true, blocked: bs >= 1000 };
    }
    function nearWant(r, w, h, side) {
      var g = 4, c = { above: { x: r.x + r.w / 2 - w / 2, y: r.y - h - g }, below: { x: r.x + r.w / 2 - w / 2, y: r.y + r.h + g },
        left: { x: r.x - w - g, y: r.y + r.h / 2 - h / 2 }, right: { x: r.x + r.w + g, y: r.y + r.h / 2 - h / 2 } };
      var order = [side in c ? side : 'above'].concat(['above', 'below', 'right', 'left']);
      var seen = {}, out = []; order.forEach(function (s) { if (!seen[s]) { seen[s] = 1; out.push(c[s]); } });
      return out;
    }

    /* ---------- windows ---------- */
    function rowH(win) { return Math.max(D.fontH + 3, num(win.o.rowH, P.rowH)); }
    function gutter() { return D.handW(P.pointer) + D.gap(P.pointer); }
    function layoutMenu(win) {
      var o = win.o, items = win.items, rh = rowH(win), lw = 0, nw = 0;
      items.forEach(function (it) { lw = Math.max(lw, D.measure(it.label)); if (it.note) nw = Math.max(nw, D.measure(it.note, 'note')); });
      var tw = o.title ? D.measure(o.title, 'title') : 0;
      var iw = Math.max(gutter() + lw + (nw ? 8 + nw : 0) + 2, tw + 2), rows = items.length + (o.title ? 1 : 0);
      return { w: Math.max(num(o.w, 0), iw + 2 * D.pad), h: Math.max(num(o.h, 0), Math.max(1, rows) * rh + 2 * D.pad) };
    }
    function wrap(text, width) {
      var out = [];
      String(text).split('\n').forEach(function (para) {
        var line = '';
        para.split(' ').forEach(function (word) {
          var t = line ? line + ' ' + word : word;
          if (line && D.measure(t) > width) { out.push(line); line = word; } else line = t;
          while (D.measure(line) > width && line.length > 1) {   // a single word longer than the line: hard break
            var n = line.length; while (n > 1 && D.measure(line.slice(0, n)) > width) n--;
            out.push(line.slice(0, n)); line = line.slice(n);
          }
        });
        out.push(line);
      });
      return out;
    }
    function layoutMessage(win) {
      var o = win.o, Vw = view(), rh = rowH(win), fit = !!o.fit || o.w === 'fit';
      var w = fit ? Math.min(Vw.w, D.measure(String(win.text).replace(/\n.*/g, '')) + 2 * D.pad + 8) : Math.min(Vw.w, num(o.w, Vw.w - 16));
      win.lines = wrap(win.text, w - 2 * D.pad - 4);
      var rows = Math.max(win.lines.length + (o.title ? 1 : 0), num(o.rows, 1));
      return { w: w, h: Math.max(num(o.h, 0), rows * rh + 2 * D.pad) };
    }
    function want(win, sz) {
      var o = win.o, Vw = view(), alts = [];
      if (okRect(o.near)) { var n = nearWant(o.near, sz.w, sz.h, o.side); return { want: n[0], alts: n.slice(1) }; }
      var x = o.x === 'center' || o.x == null ? Vw.x + Math.round((Vw.w - sz.w) / 2) : num(o.x, 0);
      var y;
      if (o.y === 'top') y = Vw.y + 8; else if (o.y === 'center') y = Vw.y + Math.round((Vw.h - sz.h) / 2);
      else if (o.y === 'bottom' || o.y == null) y = Vw.y + Vw.h - sz.h - 8; else y = num(o.y, 0);
      if (win.kind === 'message' && o.y == null) alts.push({ x: x, y: Vw.y + 8 });   // a bottom message flips to the top when the bottom is taken
      return { want: { x: x, y: y }, alts: alts };
    }
    function relayout(win, force) {
      var sz = win.kind === 'menu' ? layoutMenu(win) : layoutMessage(win), W = want(win, sz);
      var av = avoids(win.o);
      var key = [sz.w, sz.h, W.want.x, W.want.y, av ? 1 : 0, V ? V.w + 'x' + V.h : ''].join(',');
      if (!force && key === win.key && win.rect) return;
      win.key = key;
      var others = av ? wins.filter(function (q) { return q !== win && q.state !== 'closing' && q.rect; }).map(function (q) { return q.rect; }) : [];
      var r = place(sz.w, sz.h, W.want, { avoid: av, alts: W.alts, extra: others });
      win.rect = { x: r.x, y: r.y, w: r.w, h: r.h };
      dbg({ event: 'place', id: win.id, rect: win.rect, moved: !!r.moved, blocked: !!r.blocked });
    }
    // a window the host pins to numeric x AND y stays there (only kept on screen); every other window avoids the host's rects
    function avoids(o) { return o.avoid != null ? !!o.avoid : !(typeof o.x === 'number' && typeof o.y === 'number' && !okRect(o.near)); }
    function touch(win) {
      // consecutive = touched again within one update or one draw (works for calls from update code, render code, 60/120 Hz)
      if (win.touchUpd === updates && win.touchDraw === draws) { /* same cycle */ }
      else if (win.touchUpd >= updates - 1 || win.touchDraw >= draws - 1) win.streak++; else win.streak = 1;
      win.touchDraw = draws; win.touchUpd = updates;
      if (win.streak >= 3) win.immediate = true;
    }
    function getWin(id, kind) {
      id = String(id == null ? kind : id);
      var win = byId[id];
      if (win && win.kind !== kind) { remove(win); win = null; }
      if (!win) {
        win = { id: id, kind: kind, o: {}, items: [], sel: -1, p: P.open > 0 ? 0 : 1, bornUpd: updates, selUpd: -1, textUpd: -1, state: 'opening', streak: 0, touchDraw: -9, touchUpd: -9, immediate: false,
          cur: null, from: 0, to: 0, st: 0, text: '', shown: 0, lines: [] };
        byId[id] = win; wins.push(win); dbg({ event: 'open', id: id, kind: kind });
      } else if (win.state === 'closing') { win.state = 'opening'; dbg({ event: 'reopen', id: id }); }
      return win;
    }
    function remove(win) { var i = wins.indexOf(win); if (i >= 0) wins.splice(i, 1); if (byId[win.id] === win) delete byId[win.id]; dbg({ event: 'closed', id: win.id }); }
    function rowY(win, i) { return (win.o.title ? 1 : 0) * rowH(win) + i * rowH(win); }
    function setSel(win, sel, snap) {
      sel = sel == null || sel === false ? -1 : Math.round(num(sel, -1));
      if (sel >= win.items.length) sel = win.items.length - 1;
      if (sel === win.sel && win.cur != null) return;
      var to = sel >= 0 ? rowY(win, sel) : null;
      if (to == null) { win.sel = -1; win.cur = null; return; }
      win.selUpd = updates;
      if (win.cur == null || snap || P.slide <= 0 || win.p < 1) { win.cur = to; win.from = to; win.to = to; win.st = P.slide; }
      else { win.from = win.cur; win.to = to; win.st = 0; }
      win.sel = sel;
    }

    function menu(id, o) {
      try {
        o = o || {};
        var win = getWin(id, 'menu'); touch(win);
        var items = Array.isArray(o.items) ? o.items.map(normItem) : win.items;
        if (Array.isArray(o.disabled)) o.disabled.forEach(function (i) { if (items[i]) items[i].disabled = true; });
        var oldRowH = win.items.length ? rowH(win) : 0;
        win.o = o; win.items = items;
        if (oldRowH && oldRowH !== rowH(win)) win.cur = null;
        relayout(win);
        setSel(win, o.selected != null ? o.selected : o.selected === null ? -1 : win.sel >= 0 ? win.sel : 0, false);
        return { x: win.rect.x, y: win.rect.y, w: win.rect.w, h: win.rect.h };
      } catch (e) { warn('menu', 'menu() failed: ' + e); return null; }
    }
    function message(text, o) {
      try {
        if (typeof text === 'object' && text && !Array.isArray(text)) { o = text; text = o.text; }
        o = o || {};
        var id = o.id != null ? o.id : 'message';
        if (text == null || text === '' || text === false) { close(id); return null; }
        if (Array.isArray(text)) text = text.join('\n');
        var win = getWin(id, 'message'); touch(win);
        var changed = String(text) !== win.text;
        win.o = o; win.text = String(text);
        if (changed) { win.shown = P.type > 0 ? 0 : 1e9; win.textUpd = updates; win.key = null; }
        relayout(win);
        return { x: win.rect.x, y: win.rect.y, w: win.rect.w, h: win.rect.h };
      } catch (e) { warn('message', 'message() failed: ' + e); return null; }
    }
    function close(id) {
      try {
        var list = id == null ? wins.slice() : byId[String(id)] ? [byId[String(id)]] : [];
        list.forEach(function (win) { if (win.state === 'closing') return; win.state = 'closing'; win.immediate = false; dbg({ event: 'close', id: win.id }); if (P.open <= 0) remove(win); });
      } catch (e) { warn('close', 'close() failed: ' + e); }
    }
    function select(id, i) { var win = byId[String(id)]; if (win && win.kind === 'menu') setSel(win, i, false); }

    /* ---------- target pointer ---------- */
    function resolveTarget(t) {
      if (t == null) return null;
      if (typeof t !== 'object') t = { id: t };
      if (okRect(t)) { if (t.id != null) idRects[String(t.id)] = { x: t.x, y: t.y, w: t.w, h: t.h, id: t.id }; return t; }
      if (t.id != null && idRects[String(t.id)]) return idRects[String(t.id)];
      return null;
    }
    function ptrPos(r, side) {
      var Vw = view(), hw = D.handW(P.pointer), y = Math.round(r.y + r.h / 2 - 3);
      var L = { x: Math.round(r.x) - hw - 2, y: y, w: hw + 1, h: 7, mirror: false }, R = { x: Math.round(r.x + r.w) + 2, y: y, w: hw + 1, h: 7, mirror: true };
      if (side === 'left') return L; if (side === 'right') return R;
      var bad = function (q) {
        var b = 0; if (q.x < Vw.x || q.x + q.w > Vw.x + Vw.w) b += 1000;
        obsCache.forEach(function (o) { if (o.id == null || String(o.id) !== String(r.id)) b += ov(q, o); });
        wins.forEach(function (w) { if (w.rect && w.state !== 'closing') b += ov(q, w.rect); });
        return b;
      };
      var bl = bad(L); if (!bl) return L; var br = bad(R); return br < bl ? R : L;
    }
    function setCursor(t, o) {
      try {
        o = o || {};
        if (t == null || t === false || (Array.isArray(t) && !t.length)) { ptr.list = null; ptr.shown = []; ptr.key = ''; return; }
        var list = Array.isArray(t) ? t : [t];
        var key = list.map(function (q) { return q && typeof q === 'object' ? (q.id != null ? 'i' + q.id : [q.x, q.y, q.w, q.h].map(Math.round).join('_')) : 'i' + q; }).join('|') + '/' + (o.side || 'auto');
        var prev = ptr.shown.length === 1 ? ptr.shown[0] : null;
        ptr.list = list; ptr.side = o.side || 'auto';
        if (key !== ptr.key) {
          ptr.key = key; ptr.delta = null;
          var r = list.length === 1 ? resolveTarget(list[0]) : null;
          if (prev && r && P.slide > 0) { var np = ptrPos(r, ptr.side); ptr.delta = { x: prev.x - np.x, y: prev.y - np.y }; ptr.t = 0; ptr.len = Math.round(P.slide * 1.6); }
        }
      } catch (e) { warn('cursor', 'setCursor() failed: ' + e); }
    }

    /* ---------- clock ---------- */
    function advance(dt) {
      dt = Math.max(0, num(dt, FRAME));
      clock += dt;
      var openMs = P.open * FRAME;
      for (var i = wins.length - 1; i >= 0; i--) {
        var w = wins[i];
        if (w.immediate && w.state !== 'closing' && updates - w.touchUpd >= 3 && (draws - w.touchDraw >= 2 || draws === w.touchDraw)) { w.state = 'closing'; dbg({ event: 'close', id: w.id, auto: true }); }
        if (w.state === 'closing') { w.p = openMs > 0 ? w.p - dt / openMs : 0; if (w.p <= 0) { remove(w); continue; } }
        else if (w.p < 1) { w.p = openMs > 0 ? Math.min(1, w.p + dt / openMs) : 1; if (w.p >= 1) { w.state = 'open'; dbg({ event: 'opened', id: w.id }); } }
        else w.state = 'open';
        if (w.cur != null && w.st < P.slide) { w.st += dt; w.cur = w.from + (w.to - w.from) * outQuad(w.st / P.slide); if (w.st >= P.slide) w.cur = w.to; }
        if (w.kind === 'message' && w.p >= 1 && w.shown < 1e9) w.shown += dt * P.type / 1000;
      }
      if (ptr.delta) { ptr.t += dt; if (ptr.t >= ptr.len) ptr.delta = null; }
    }
    function update(dt) {
      try {
        var now = root.performance && performance.now ? performance.now() : 0;
        burst = now - lastWall < 2 ? burst + 1 : 0; lastWall = now;
        updates++; drawsNoUpdate = 0;
        obstacles();
        advance(dt);
      } catch (e) { warn('update', 'update() failed: ' + e); }
    }
    // first draw after a fast-forward (?t=&freeze=1 runs many updates, then draws once): anything the host opened, selected or
    // wrote AFTER the last update (i.e. from its render code) is shown settled, not at frame 0 of its animation
    function snapFresh() {
      wins.slice().forEach(function (w) {
        if (w.bornUpd === updates) { if (w.state === 'closing') remove(w); else { w.p = 1; w.state = 'open'; } }
        if (w.selUpd === updates && w.cur != null) { w.cur = w.to; w.st = P.slide; }
        if (w.textUpd === updates) w.shown = 1e9;
      });
      ptr.delta = null;
    }

    /* ---------- drawing ---------- */
    function drawMenu(g, w, inner, out) {
      var rh = rowH(w), off = Math.floor((rh - D.fontH) / 2), gx = gutter();
      var band = w.o.band != null ? !!w.o.band : P.band === 'on' ? true : P.band === 'off' ? false : D.bandAuto;
      if (band && w.sel >= 0 && w.cur != null && w.o.cursor !== false) D.band(g, { x: inner.x + gx - 2, y: Math.round(inner.y + w.cur), w: inner.w - gx + 2, h: rh }, w.o.active !== false ? 1 : 0.5);
      if (w.o.title) D.text(g, w.o.title, inner.x + 2, inner.y + off, 'title');
      w.items.forEach(function (it, i) {
        var y = inner.y + rowY(w, i) + off, role = it.disabled ? 'dim' : 'main';
        D.text(g, it.label, inner.x + gx, y, role);
        if (it.note) D.text(g, it.note, inner.x + inner.w - D.measure(it.note, 'note'), y, it.disabled ? 'dimNote' : 'note');
      });
      if (w.sel >= 0 && w.cur != null && w.o.cursor !== false) {
        var active = w.o.active !== false, still = w.st < P.slide;
        var bob = active && !still && !D.skinBob(P.pointer) ? Math.floor(clock / P.bob) % 2 : 0;
        var hx = inner.x - 1 + bob, hy = Math.round(inner.y + w.cur + off + Math.floor(D.fontH / 2) - 3);
        D.hand(g, hx, hy, false, active ? 1 : 0.55, P.pointer, active && !still ? clock / 1000 : 0);
        out.push({ kind: 'hand', id: w.id, x: hx, y: hy, w: D.handW(P.pointer), h: 7, owner: null, sel: w.sel, band: band });
      }
    }
    function drawMessage(g, w, inner) {
      var rh = rowH(w), off = Math.floor((rh - D.fontH) / 2), left = Math.floor(w.shown), y0 = inner.y + off;
      if (w.o.title) { D.text(g, w.o.title, inner.x + 2, y0, 'title'); y0 += rh; }
      for (var i = 0; i < w.lines.length && left > 0; i++) {
        var ln = w.lines[i].slice(0, Math.max(0, left)); left -= w.lines[i].length + 1;
        var x = w.o.align === 'center' || w.o.fit || w.o.w === 'fit' ? inner.x + Math.round((inner.w - D.measure(w.lines[i])) / 2) : inner.x + 2;
        D.text(g, ln, x, y0 + i * rh, w.o.dim ? 'dim' : 'main');
      }
      if (w.o.more && left > 0) D.more(g, w.rect.x + w.rect.w - 12, w.rect.y + w.rect.h - 9 + Math.floor(clock / P.bob) % 2);
    }
    function draw(ctx, ox, oy) {
      if (!ctx) return;
      var saved = false;
      try {
        if (!V && ctx.canvas && ctx.canvas.width) { V = { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height }; wins.forEach(function (w) { relayout(w, true); }); }
        if (draws === 0 && burst >= 20) snapFresh();
        if (++drawsNoUpdate > 30 && updates === 0) { warn('noupdate', 'update() is never called; advancing one frame per draw'); advance(FRAME); }
        draws++;
        ctx.save(); saved = true;
        if (!SK || SK.pixel !== false) ctx.imageSmoothingEnabled = false;   // smooth skins keep the host's smoothing
        if (ox || oy) ctx.translate(Math.round(ox || 0), Math.round(oy || 0));
        var out = [], below = [];
        wins.forEach(function (w) {
          if (!w.rect) return;
          var r = w.rect, team = w.o.tint || P.tint;
          var e = 1, rr = r;
          if (w.p < 1) {
            e = D.openCurve(Math.max(0, w.p), P.open * FRAME);
            var dw = Math.max(8, Math.round(r.w * e)), dh = Math.max(8, Math.round(r.h * e));
            rr = { x: r.x + Math.round((r.w - dw) / 2), y: r.y + Math.round((r.h - dh) / 2), w: dw, h: dh };
            if (e > 1) { var Vv = view(); rr.w = Math.min(rr.w, Vv.w); rr.h = Math.min(rr.h, Vv.h); rr.x = Math.max(Vv.x, Math.min(Vv.x + Vv.w - rr.w, rr.x)); rr.y = Math.max(Vv.y, Math.min(Vv.y + Vv.h - rr.h, rr.y)); }   // overshoot stays on screen
          }
          var over = below.some(function (b) { return ov(b, r) > 0; });
          below.push(r);
          if (w.p < 1) {
            if (w.state === 'closing' && w.p <= 0) return;
            if (over) D.backing(ctx, rr, team);
            D.frame(ctx, rr, w.o.tint || P.tint);
            out.push({ kind: 'window', id: w.id, x: rr.x, y: rr.y, w: rr.w, h: rr.h, owner: null, p: e });
            return;
          }
          if (over) D.backing(ctx, r, team);
          var inner = D.frame(ctx, r, w.o.tint || P.tint);
          out.push({ kind: 'window', id: w.id, x: r.x, y: r.y, w: r.w, h: r.h, owner: null, p: 1 });
          ctx.save(); ctx.beginPath(); ctx.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); ctx.clip();
          if (w.kind === 'menu') drawMenu(ctx, w, inner, out); else drawMessage(ctx, w, inner);
          ctx.restore();
        });
        ptr.shown = [];
        if (ptr.list) {
          var one = ptr.list.length === 1, e2 = ptr.delta ? 1 - outQuad(ptr.t / ptr.len) : 0, bob = ptr.delta || D.skinBob(P.pointer) ? 0 : Math.floor(clock / P.bob) % 2;
          ptr.list.forEach(function (t) {
            var r = resolveTarget(t);
            if (!r) { warn('target', 'setCursor target has no rect (pass {x, y, w, h} or an id that getObstacles() returns); pointer hidden'); return; }
            var q = ptrPos(r, ptr.side), x = q.x + (one && ptr.delta ? Math.round(ptr.delta.x * e2) : 0) + (q.mirror ? -bob : bob), y = q.y + (one && ptr.delta ? Math.round(ptr.delta.y * e2) : 0);
            D.hand(ctx, x, y, q.mirror, 1, P.pointer, ptr.delta ? 0 : clock / 1000);
            ptr.shown.push({ x: q.x, y: q.y });
            out.push({ kind: 'pointer', id: 'pointer', x: x, y: y, w: D.handW(P.pointer), h: 7, owner: r.id != null ? r.id : null, target: { x: r.x, y: r.y, w: r.w, h: r.h }, sliding: !!(one && ptr.delta) });
          });
        }
        drawn = out;
      } catch (e) { warn('draw', 'draw() failed: ' + (e && e.stack || e)); }
      if (saved) try { ctx.restore(); } catch (e) {}
    }

    function itemAt(id, x, y) {
      var w = byId[String(id)]; if (!w || w.kind !== 'menu' || !w.rect || w.state === 'closing') return -1;
      var r = w.rect, top = r.y + D.pad + (w.o.title ? rowH(w) : 0), i = Math.floor((y - top) / rowH(w));
      return x >= r.x && x < r.x + r.w && y >= top && i >= 0 && i < w.items.length ? i : -1;
    }

    return {
      menu: menu, message: message, close: close, select: select, setCursor: setCursor, update: update, draw: draw,
      place: function (w, h, wantXY, o) { var r = place(w, h, wantXY, o); return { x: r.x, y: r.y, w: r.w, h: r.h }; },
      clear: function () { wins.slice().forEach(remove); ptr.list = null; ptr.shown = []; ptr.key = ''; },
      isOpen: function (id) { var w = byId[String(id)]; return !!w && w.state !== 'closing'; },
      isSettled: function (id) { var w = byId[String(id)]; return !!w && w.state === 'open' && w.p >= 1 && (w.cur == null || w.st >= P.slide); },
      typing: function (id) { var w = byId[String(id == null ? 'message' : id)]; return !!w && w.kind === 'message' && w.shown < w.text.length; },
      finish: function (id) { var w = byId[String(id == null ? 'message' : id)]; if (w) { w.shown = 1e9; w.p = w.state === 'closing' ? w.p : 1; } },
      itemAt: itemAt,
      rect: function (id) { var w = byId[String(id)]; return w && w.rect ? { x: w.rect.x, y: w.rect.y, w: w.rect.w, h: w.rect.h } : null; },
      rects: function () { return wins.filter(function (w) { return w.rect; }).map(function (w) { return { x: w.rect.x, y: w.rect.y, w: w.rect.w, h: w.rect.h, id: w.id }; }); },
      ids: function () { return wins.map(function (w) { return w.id; }); },
      lastDrawn: function () { return drawn.slice(); },
      setParams: function (o) { setParams(o); wins.forEach(function (w) { w.cur = w.sel >= 0 ? rowY(w, w.sel) : null; w.st = P.slide; relayout(w, true); }); },
      setView: function (v) { if (okRect(v)) { V = { x: v.x, y: v.y, w: v.w, h: v.h }; wins.forEach(function (w) { relayout(w, true); }); } },
      params: P, skin: SK ? SK.id : 'built-in'
    };
  }

  root.GameDNA_WindowCursor = { create: create, defaults: DEFAULTS, version: '1.1.0' };
})(typeof window !== 'undefined' ? window : this);
