/* GameDNA I-01 · Native resolution + integer scaling · module v1 (plain script, no dependencies, one global: GameDNA_PixelScaler)
 *
 *   const scaler = GameDNA_PixelScaler.create({
 *     canvas: document.getElementById('game'),   // the canvas the game draws on (element or CSS selector)
 *     native: { w: 256, h: 224 },                // optional: defaults to canvas.width x canvas.height (never changed)
 *     skin: 'pixel16',                           // optional; border drawn through GameDNA_Skin when skin-api.js is loaded
 *     params: { mode: 'integer', border: 'frame', crt: 'off' }
 *   });
 *   scaler.apply();                    // wraps the canvas, sizes it to the largest whole device-pixel scale, watches resizes
 *   const p = scaler.toGame(e.clientX, e.clientY);   // -> { x, y, inside } in native game pixels (also toGame(event))
 *   scaler.scale()                     // -> { n, css, dpr, integer, mode, rect, letterbox }
 *   scaler.setParams({ crt: 'scanlines' }); scaler.toggleFullscreen(); scaler.destroy();
 *
 * What it changes: only CSS and DOM around the canvas (a wrapper div, a border canvas behind, an optional CRT canvas and a
 * fullscreen button in the border). It never touches canvas.width/height, the 2D context, requestAnimationFrame or game input.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var DEFAULTS = { mode: 'integer', border: 'frame', color: 'ink', crt: 'off', scanlines: 0.3, fill: 'auto', align: 'center',
    maxScale: 0, button: 'corner', key: 'off', pad: 4 };
  var OPTIONS = { mode: ['integer', 'fit'], border: ['frame', 'dither', 'solid', 'none'], color: ['ink', 'ui.shadow', 'ui.edge', 'ui.fill', 'team.a'],
    crt: ['off', 'scanlines', 'crt'], fill: ['auto', 'page', 'window'], align: ['center', 'top'], button: ['corner', 'off'], key: ['off', 'KeyF', 'Backquote', 'F2'] };

  /* ---------- built-in pixel16 fallback (used when skin-api.js is not loaded) ---------- */
  var PAL16 = { ink: '#06061a', ui: { fill: '#4c5a8a', fillTo: '#262e4e', edge: '#06061a', highlight: '#c8d4f4', shadow: '#0a0e22', rivet: '#ffe070', rivetShade: '#7a5410' },
    team: { a: '#3a64d8' }, text: { main: '#ffffff' }, windows: { n: ['#4c5a8a', '#3e4a76', '#323c62', '#262e4e', '#c8d4f4', '#0a0e22'] } };
  function frame16(g, r) {   // same look as pixel16 frame(role 'window', team 'n')
    var x = r.x, y = r.y, w = r.w, h = r.h, C = PAL16.windows.n, U = PAL16.ui, i;
    for (i = 0; i < h - 2; i++) { g.fillStyle = C[Math.min(3, Math.floor(i / (h - 2) * 4))]; g.fillRect(x + 1, y + 1 + i, w - 2, 1); }
    g.fillStyle = U.edge; g.fillRect(x + 2, y, w - 4, 1); g.fillRect(x + 2, y + h - 1, w - 4, 1); g.fillRect(x, y + 2, 1, h - 4); g.fillRect(x + w - 1, y + 2, 1, h - 4);
    g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + w - 2, y + 1, 1, 1); g.fillRect(x + 1, y + h - 2, 1, 1); g.fillRect(x + w - 2, y + h - 2, 1, 1);
    g.fillStyle = C[4]; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 5);
    g.fillStyle = C[5]; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
    [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]].forEach(function (p) { g.fillStyle = U.rivetShade; g.fillRect(p[0], p[1], 2, 2); g.fillStyle = U.rivet; g.fillRect(p[0], p[1], 1, 1); });
  }

  /* ---------- small helpers ---------- */
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function rgb(c) {
    c = String(c || '').trim(); var m;
    if (c[0] === '#' && c.length === 4) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)];
    if (c[0] === '#') return [parseInt(c.slice(1, 3), 16) || 0, parseInt(c.slice(3, 5), 16) || 0, parseInt(c.slice(5, 7), 16) || 0];
    if ((m = c.match(/^rgba?\(([^)]+)\)$/))) return m[1].split(',').slice(0, 3).map(function (v) { return +v || 0; });
    return [6, 6, 26];
  }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * t); }).join(',') + ')'; }
  function setCss(el, props) { for (var k in props) { try { el.style.setProperty(k, props[k], 'important'); } catch (e) { /* ignore */ } } }
  // put an element at (x, y) CSS px inside its positioned parent, w x h CSS px scaled by (sx, sy): all in one transform
  function place(el, x, y, w, h, sx, sy) {
    setCss(el, { left: '0px', top: '0px', width: w + 'px', height: h + 'px', 'transform-origin': '0 0',
      transform: 'translate(' + x + 'px,' + y + 'px) scale(' + sx + ',' + sy + ')' });
  }
  var warned = {};
  function warn(key, msg) { if (warned[key]) return; warned[key] = 1; try { console.warn('[GameDNA_PixelScaler] ' + msg); } catch (e) { /* ignore */ } }
  function clean(p) {   // validate params; unknown keys are kept (harmless), bad values fall back to defaults
    var o = {}, k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    for (k in p || {}) if (p[k] !== undefined && p[k] !== null) o[k] = p[k];
    for (k in OPTIONS) if (OPTIONS[k].indexOf(String(o[k])) < 0 && !(k === 'color' && /^#|^rgb/.test(String(o[k])))) o[k] = DEFAULTS[k];
    o.scanlines = Math.max(0, Math.min(0.8, num(o.scanlines, DEFAULTS.scanlines)));
    o.maxScale = Math.max(0, Math.floor(num(o.maxScale, 0)));
    o.pad = Math.max(0, Math.min(12, Math.floor(num(o.pad, DEFAULTS.pad))));
    return o;
  }

  function create(options) {
    var o = options || {}, doc = root.document;
    var canvas = o.canvas;
    if (typeof canvas === 'string' && doc) canvas = doc.querySelector(canvas);
    if (!canvas && doc) canvas = doc.querySelector('canvas');
    var P = clean(o.params);
    var SKAPI = root.GameDNA_Skin || null, SK = null;
    try { SK = SKAPI ? SKAPI.resolve(o.skin) : null; } catch (e) { SK = null; }
    var native = { w: Math.max(1, Math.round(num(o.native && o.native.w, canvas ? canvas.width : 256))), h: Math.max(1, Math.round(num(o.native && o.native.h, canvas ? canvas.height : 224))) };
    var onLayout = typeof o.onLayout === 'function' ? o.onLayout : null;
    var state = { applied: false, destroyed: false, n: 1, s: 1, css: 1, dpr: 1, integer: true, fit: false, rect: null, area: null, lb: { l: 0, r: 0, t: 0, b: 0 },
      layouts: 0, fought: 0, style: null, device: null, key: '', unit: 1, devL: 0, devT: 0, gx: 0, gy: 0 };
    var wrap = null, ownWrap = false, bg = null, crt = null, btn = null, saved = null, ro = null, mo = null, mq = null, busy = false, listeners = [];

    if (!canvas || !canvas.getContext) {
      warn('nocanvas', 'no canvas found; the scaler does nothing (toGame returns the input unchanged)');
    }

    function palette() { return (SK && SK.palette) || PAL16; }
    function tok(path) {
      if (/^#|^rgb/.test(path)) return path;
      if (SK && SKAPI && SKAPI.token) { var v = SKAPI.token(SK, path); if (typeof v === 'string' && v !== path) return v; }
      var cur = PAL16, parts = String(path).split('.');
      for (var i = 0; i < parts.length && cur; i++) cur = cur[parts[i]];
      return typeof cur === 'string' ? cur : PAL16.ink;
    }
    function on(target, type, fn, opt) { if (!target || !target.addEventListener) return; target.addEventListener(type, fn, opt); listeners.push([target, type, fn, opt]); }
    function isPhone() {
      try { if (root.matchMedia && root.matchMedia('(pointer: coarse)').matches) return true; } catch (e) { /* ignore */ }
      return Math.min(root.innerWidth || 9999, root.innerHeight || 9999) <= 600 || (root.innerWidth || 9999) <= 820;
    }
    function isFs() { return !!(doc && wrap && (doc.fullscreenElement === wrap || doc.webkitFullscreenElement === wrap)); }

    /* ---------- DOM setup ---------- */
    function apply() {
      if (state.applied || state.destroyed || !canvas || !doc) return api;
      state.applied = true;
      saved = { style: canvas.getAttribute('style'), parent: canvas.parentNode, next: canvas.nextSibling };
      if (o.container && o.container.nodeType === 1) {
        wrap = o.container;
        if (canvas.parentNode !== wrap) wrap.appendChild(canvas);
        saved.wrapStyle = wrap.getAttribute('style');
        if ((root.getComputedStyle ? root.getComputedStyle(wrap).position : '') === 'static') setCss(wrap, { position: 'relative' });
        setCss(wrap, { overflow: 'hidden' });
      } else {
        ownWrap = true;
        wrap = doc.createElement('div');
        wrap.className = 'gdna-pixel-scaler';
        setCss(wrap, { position: 'relative', display: 'block', width: '100%', overflow: 'hidden', margin: '0', padding: '0', border: '0', 'box-sizing': 'border-box' });
        canvas.parentNode.insertBefore(wrap, canvas);
        wrap.appendChild(canvas);
      }
      bg = doc.createElement('canvas'); bg.className = 'gdna-ps-border'; bg.setAttribute('aria-hidden', 'true');
      setCss(bg, { position: 'absolute', left: '0', top: '0', 'image-rendering': 'pixelated', 'pointer-events': 'none', 'z-index': '0', margin: '0', padding: '0', border: '0', 'max-width': 'none' });
      wrap.insertBefore(bg, canvas);
      setCss(canvas, { position: 'absolute', margin: '0', padding: '0', border: '0', 'max-width': 'none', 'max-height': 'none', 'min-width': '0', 'min-height': '0',
        'object-fit': 'fill', 'image-rendering': 'pixelated', 'z-index': '1', 'box-sizing': 'content-box', display: 'block' });
      try { canvas.style.setProperty('image-rendering', 'crisp-edges', 'important'); canvas.style.setProperty('image-rendering', 'pixelated', 'important'); } catch (e) { /* ignore */ }
      on(root, 'resize', relayout); on(root, 'orientationchange', relayout); on(root, 'load', relayout);
      if (root.visualViewport) on(root.visualViewport, 'resize', relayout);
      on(doc, 'fullscreenchange', onFs); on(doc, 'webkitfullscreenchange', onFs);
      on(root, 'keydown', onKey);
      if (root.ResizeObserver) {
        try {
          ro = new root.ResizeObserver(function (entries) {
            relayout();
            for (var i = 0; i < entries.length; i++) if (entries[i].target === canvas && entries[i].devicePixelContentBoxSize) { var d = entries[i].devicePixelContentBoxSize[0]; state.device = { w: d.inlineSize, h: d.blockSize }; }
          });
          ro.observe(wrap.parentNode || doc.body); if (doc.body) ro.observe(doc.body); if (!ownWrap) ro.observe(wrap);
          try { ro.observe(canvas, { box: 'device-pixel-content-box' }); } catch (e) { ro.observe(canvas); }
        } catch (e) { ro = null; }
      }
      if (root.MutationObserver) {   // a host resize handler that rewrites the canvas style gets overridden again
        try {
          mo = new root.MutationObserver(function () {
            if (busy || canvas.getAttribute('style') === state.style) return;   // our own writes
            state.fought++; state.key = ''; relayout();
          });
          mo.observe(canvas, { attributes: true, attributeFilter: ['style', 'class'] });
        } catch (e) { mo = null; }
      }
      watchDpr();
      api.layout();
      return api;
    }
    function watchDpr() {
      if (!root.matchMedia) return;
      try {
        if (mq) mq.removeEventListener('change', onDpr);
        mq = root.matchMedia('(resolution: ' + (root.devicePixelRatio || 1) + 'dppx)');
        mq.addEventListener('change', onDpr);
      } catch (e) { mq = null; }
    }
    function onDpr() { watchDpr(); state.key = ''; relayout(); }
    function onFs() { state.key = ''; relayout(); }
    function relayout() { try { api.layout(); } catch (e) { warn('layout', 'layout failed: ' + (e && e.message)); } }
    function onKey(e) {
      if (P.key === 'off' || !e || e.code !== P.key || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      var t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
      toggleFullscreen();
    }
    /* ---------- layout ---------- */
    function layout() {
      if (!state.applied || state.destroyed || !wrap) return api;
      var dpr = num(o.dpr, 0) || root.devicePixelRatio || 1, fs = isFs(), iw = root.innerWidth || 0, ih = root.innerHeight || 0, aw, ah;
      busy = true;
      try {
        if (fs) { if (ownWrap) setCss(wrap, { height: '100%' }); aw = wrap.clientWidth; ah = wrap.clientHeight; }
        else if (ownWrap) {
          aw = wrap.clientWidth;
          if (P.fill === 'window') ah = ih;
          else {   // 'page': the viewport height minus the rest of the page, so the whole page fits;
                   // 'auto': the same, unless that costs a whole scale step (then the rest of the page scrolls below)
            setCss(wrap, { height: ih + 'px' });
            var extra = Math.max(0, (doc.documentElement.scrollHeight || 0) - ih);
            ah = ih - Math.min(extra, Math.floor(ih * 0.4));
            if (P.fill === 'auto') {
              var d0 = num(o.dpr, 0) || root.devicePixelRatio || 1, ww = wrap.clientWidth * d0;
              var nPage = Math.floor(Math.min(ww / native.w, ah * d0 / native.h)), nWin = Math.floor(Math.min(ww / native.w, ih * d0 / native.h));
              if (nWin > nPage && nPage < 4) ah = ih;
            }
          }
          ah = Math.max(1, Math.floor(ah));
          setCss(wrap, { height: ah + 'px' });
          aw = wrap.clientWidth;   // a vertical scrollbar may have appeared or gone
        } else { aw = wrap.clientWidth; ah = wrap.clientHeight; }
        var wr = wrap.getBoundingClientRect(), cl = wrap.clientLeft || 0, ct = wrap.clientTop || 0;
        var devL = (wr.left + cl) * dpr, devT = (wr.top + ct) * dpr;
        var availW = Math.max(1, Math.floor(aw * dpr)), availH = Math.max(1, Math.floor(ah * dpr));
        var w = native.w, h = native.h, fitS = Math.min(availW / w, availH / h), n = Math.floor(fitS);
        if (P.maxScale > 0) n = Math.min(n, Math.max(1, Math.floor(P.maxScale * dpr)));
        var s = n, integer = true, fitUsed = false;
        if (n < 1) { s = fitS; integer = false; fitUsed = true; }                                   // window smaller than 1:1: shrink, never overflow
        else if (P.mode === 'fit' && n < 2 && isPhone() && fitS > n) { s = fitS; integer = false; fitUsed = true; }
        if (P.maxScale > 0 && fitUsed) s = Math.min(s, P.maxScale * dpr);
        var dw = Math.round(w * s), dh = Math.round(h * s);
        var offX = Math.floor((availW - dw) / 2), offY = P.align === 'top' ? 0 : Math.floor((availH - dh) / 2);
        var gx = Math.round(devL + offX), gy = Math.round(devT + offY);   // canvas origin on the device-pixel grid
        var key = [aw, ah, dpr, dw, dh, gx, gy, fs, P.mode, P.border, P.color, P.crt, P.scanlines, P.button, P.pad, P.align, SK && SK.id].join('|');
        state.dpr = dpr; state.s = s; state.n = integer ? n : s; state.css = s / dpr; state.integer = integer; state.fit = fitUsed;
        state.devL = devL; state.devT = devT; state.gx = gx; state.gy = gy;
        state.lb = { l: gx - Math.round(devL), r: Math.round(devL) + availW - (gx + dw), t: gy - Math.round(devT), b: Math.round(devT) + availH - (gy + dh) };
        if (key !== state.key || !state.rect) {
          state.key = key;
          // sizes and offsets go into a transform (float precision): CSS lengths are rounded to 1/64 px, which blurs at
          // devicePixelRatio 1.25, 1.5, 3 ... A transformed canvas still reports its on-screen rect to getBoundingClientRect.
          place(canvas, (gx - devL) / dpr, (gy - devT) / dpr, w, h, dw / w / dpr, dh / h / dpr);
          setCss(canvas, {
            'image-rendering': integer || SK == null || SK.pixel !== false ? 'pixelated' : 'auto' });
          drawBorder(availW, availH, dw, dh);
          drawCrt(dw, dh);
          placeButton(aw, ah, dw / dpr, dh / dpr, (gx - devL) / dpr, (gy - devT) / dpr);
          state.layouts++; state.style = canvas.getAttribute('style');
          var cr = canvas.getBoundingClientRect();
          state.rect = { x: cr.left, y: cr.top, w: cr.width, h: cr.height };
          state.area = { x: wr.left, y: wr.top, w: aw, h: ah };
          if (onLayout) { try { onLayout(api.scale()); } catch (e) { warn('onLayout', 'onLayout threw: ' + (e && e.message)); } }
        } else {
          var cr2 = canvas.getBoundingClientRect(); state.rect = { x: cr2.left, y: cr2.top, w: cr2.width, h: cr2.height };
        }
      } finally { busy = false; }
      return api;
    }

    /* ---------- border: one low-res canvas on the same pixel grid as the game ---------- */
    function drawBorder(availW, availH, dw, dh) {
      if (!bg) return;
      var u = Math.max(1, Math.round(state.s)), dpr = state.dpr;
      if (P.border === 'none') { setCss(bg, { display: 'none' }); return; }
      setCss(bg, { display: 'block' });
      var rl = state.gx - Math.round(state.devL), rt = state.gy - Math.round(state.devT);   // game origin inside the area (device px)
      var kx = Math.ceil(rl / u) + 1, ky = Math.ceil(rt / u) + 1;                          // border cells left of / above the game
      var cols = Math.ceil((availW + 2 * u) / u) + 2, rows = Math.ceil((availH + 2 * u) / u) + 2;
      if (bg.width !== cols) bg.width = cols; if (bg.height !== rows) bg.height = rows;
      var ox = state.gx - kx * u, oy = state.gy - ky * u;                                 // device position of cell (0,0)
      place(bg, (ox - state.devL) / dpr, (oy - state.devT) / dpr, cols, rows, u / dpr, u / dpr);
      var g = bg.getContext('2d'); if (!g) return;
      g.imageSmoothingEnabled = false;
      var base = tok(String(P.color)), PAL = palette(), gw = Math.round(dw / u), gh = Math.round(dh / u);
      g.fillStyle = base; g.fillRect(0, 0, cols, rows);
      if (P.border === 'dither' || P.border === 'frame') {   // sparse ordered dither, phase locked to the game's pixel grid
        g.fillStyle = mix(base, (PAL.ui && PAL.ui.fill) || PAL16.ui.fill, 0.22);
        for (var y = 0; y < rows; y++) {
          var ry = ((y - ky) % 4 + 4) % 4; if (ry & 1) continue;
          for (var x = 0; x < cols; x++) { var rx = ((x - kx) % 4 + 4) % 4; if (rx === ry) g.fillRect(x, y, 1, 1); }
        }
        g.fillStyle = mix(base, '#000000', 0.35);   // soft shadow under the game rect
        g.fillRect(kx + 2, ky + gh, gw, 2); g.fillRect(kx + gw, ky + 2, 2, gh);
      }
      if (P.border === 'frame' && P.pad > 0) {
        var pad = P.pad, room = Math.min(rl, rt, availW - rl - dw, availH - rt - dh) / u;
        var fr = { x: kx - pad, y: ky - pad, w: gw + 2 * pad, h: gh + 2 * pad };
        if (room >= pad) {
          try { if (SK && SK.frame) SK.frame(g, fr, { role: 'window', team: 'n' }); else frame16(g, fr); } catch (e) { frame16(g, fr); }
        } else {   // no room for the full frame: a 1-cell bevel lip only where the border is visible
          var hi = (PAL.ui && PAL.ui.highlight) || PAL16.ui.highlight, sh = (PAL.ui && PAL.ui.shadow) || PAL16.ui.shadow;
          g.fillStyle = hi; g.fillRect(kx - 1, ky - 1, gw + 2, 1); g.fillRect(kx - 1, ky - 1, 1, gh + 2);
          g.fillStyle = mix(sh, '#000000', 0.2); g.fillRect(kx - 1, ky + gh, gw + 2, 1); g.fillRect(kx + gw, ky - 1, 1, gh + 2);
        }
      }
      g.clearRect(kx, ky, gw, gh);   // never show border colour through a transparent game canvas edge
    }

    /* ---------- optional CRT / scanline overlay (pointer-events: none, never over the border) ---------- */
    function drawCrt(dw, dh) {
      if (P.crt === 'off') { if (crt) setCss(crt, { display: 'none' }); return; }
      if (!crt) {
        crt = doc.createElement('canvas'); crt.className = 'gdna-ps-crt'; crt.setAttribute('aria-hidden', 'true');
        setCss(crt, { position: 'absolute', 'pointer-events': 'none', 'z-index': '2', margin: '0', padding: '0', border: '0', 'max-width': 'none', 'image-rendering': 'pixelated' });
        wrap.insertBefore(crt, canvas.nextSibling);
      }
      var dpr = state.dpr;
      setCss(crt, { display: 'block' });
      place(crt, (state.gx - state.devL) / dpr, (state.gy - state.devT) / dpr, dw, dh, 1 / dpr, 1 / dpr);
      if (crt.width !== dw) crt.width = dw; if (crt.height !== dh) crt.height = dh;
      var g = crt.getContext('2d'); if (!g) return;
      g.clearRect(0, 0, dw, dh);
      var s = state.s, a = P.scanlines;
      if (s >= 2) {   // one dark device row band at the bottom of every game row (a third of it, at least 1 px)
        var k = Math.max(1, Math.round(s / 3));
        g.fillStyle = 'rgba(0,0,0,' + a + ')';
        for (var r = 0; r < native.h; r++) { var y1 = Math.round((r + 1) * s); g.fillRect(0, y1 - k, dw, k); }
      }
      if (P.crt === 'crt') {
        var gr = g.createRadialGradient(dw / 2, dh / 2, Math.min(dw, dh) * 0.35, dw / 2, dh / 2, Math.hypot(dw, dh) / 2);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.75, a * 1.6 + 0.15) + ')');
        g.fillStyle = gr; g.fillRect(0, 0, dw, dh);
        if (s >= 3) {   // faint aperture columns
          g.fillStyle = 'rgba(255,255,255,' + (a * 0.12) + ')';
          for (var c = 0; c < native.w; c++) g.fillRect(Math.round(c * s), 0, 1, dh);
        }
      }
    }

    /* ---------- fullscreen ---------- */
    function fsSupported() { return !!(doc && (doc.fullscreenEnabled || doc.webkitFullscreenEnabled) && wrap && (wrap.requestFullscreen || wrap.webkitRequestFullscreen)); }
    function toggleFullscreen() {
      try {
        if (!fsSupported()) { warn('fs', 'fullscreen is not available here'); return false; }
        if (isFs()) { (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc); return true; }
        var pr = (wrap.requestFullscreen || wrap.webkitRequestFullscreen).call(wrap);
        if (pr && pr.catch) pr.catch(function () { warn('fsdenied', 'fullscreen request was refused (needs a click or key press)'); });
        return true;
      } catch (e) { warn('fserr', 'fullscreen failed: ' + (e && e.message)); return false; }
    }
    var ICON = { open: ['###...###', '#.......#', '#.......#', '.........', '.........', '.........', '#.......#', '#.......#', '###...###'],
      close: ['..#...#..', '..#...#..', '###...###', '.........', '.........', '.........', '###...###', '..#...#..', '..#...#..'] };
    function placeButton(aw, ah, cw, ch, cx, cy) {
      if (P.button === 'off' || !fsSupported()) { if (btn) setCss(btn, { display: 'none' }); return; }
      var dpr = state.dpr, u = Math.max(1, Math.round(2 * dpr)), size = (11 * u) / dpr, m = 6;
      var right = aw - cx - cw, top = cy, bottom = ah - cy - ch, x = null, y = null;
      if (right >= size + 2 * m) { x = aw - size - m; y = m; }                        // in the right border
      else if (top >= size + 2 * m) { x = aw - size - m; y = m; }                    // in the top border
      else if (bottom >= size + 2 * m) { x = aw - size - m; y = ah - size - m; }     // in the bottom border
      if (x === null) { if (btn) setCss(btn, { display: 'none' }); return; }          // never over the game
      if (!btn) {
        btn = doc.createElement('button'); btn.type = 'button'; btn.className = 'gdna-ps-fullscreen'; btn.tabIndex = -1;
        btn.appendChild(doc.createElement('canvas'));
        on(btn, 'pointerdown', function (e) { e.stopPropagation(); });
        on(btn, 'click', function (e) { e.stopPropagation(); e.preventDefault(); toggleFullscreen(); try { btn.blur(); } catch (er) { /* ignore */ } });
        wrap.appendChild(btn);
      }
      var fs = isFs(); btn.setAttribute('aria-label', fs ? 'Exit fullscreen' : 'Fullscreen'); btn.title = fs ? 'Exit fullscreen' : 'Fullscreen';
      var ic = btn.firstChild; ic.width = 11; ic.height = 11;
      var g = ic.getContext('2d'), PAL = palette(), rows = fs ? ICON.close : ICON.open;
      if (g) {
        g.clearRect(0, 0, 11, 11);
        g.fillStyle = (PAL.ui && PAL.ui.shadow) || PAL16.ui.shadow; g.fillRect(0, 0, 11, 11);
        g.fillStyle = (PAL.ui && PAL.ui.edge) || PAL16.ui.edge; g.fillRect(0, 0, 11, 1); g.fillRect(0, 10, 11, 1); g.fillRect(0, 0, 1, 11); g.fillRect(10, 0, 1, 11);
        g.fillStyle = (PAL.ui && PAL.ui.highlight) || PAL16.ui.highlight;
        for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) if (rows[r][c] === '#') g.fillRect(c + 1, r + 1, 1, 1);
      }
      setCss(btn, { position: 'absolute', display: 'block', left: x + 'px', top: y + 'px', width: size + 'px', height: size + 'px', padding: '0', margin: '0', border: '0',
        background: 'transparent', cursor: 'pointer', 'z-index': '3', opacity: '0.75', 'line-height': '0' });
      setCss(ic, { width: size + 'px', height: size + 'px', display: 'block', 'image-rendering': 'pixelated', 'pointer-events': 'none' });
    }

    /* ---------- input mapping ---------- */
    function toGame(cx, cy) {
      if (cx && typeof cx === 'object') {   // an event: mouse, pointer or touch
        var ev = cx, t = (ev.changedTouches && ev.changedTouches[0]) || (ev.touches && ev.touches[0]) || ev;
        cx = t.clientX; cy = t.clientY;
      }
      cx = num(cx, 0); cy = num(cy, 0);
      if (!canvas || !canvas.getBoundingClientRect) return { x: cx, y: cy, inside: false };
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return { x: 0, y: 0, inside: false };
      var x = (cx - r.left) * native.w / r.width, y = (cy - r.top) * native.h / r.height;
      return { x: x, y: y, inside: x >= 0 && y >= 0 && x < native.w && y < native.h };
    }
    function fromGame(gx, gy) {   // native -> client (CSS) px, for tests and DOM overlays
      if (!canvas || !canvas.getBoundingClientRect) return { x: gx, y: gy };
      var r = canvas.getBoundingClientRect();
      return { x: r.left + gx * r.width / native.w, y: r.top + gy * r.height / native.h };
    }

    function destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      listeners.forEach(function (L) { try { L[0].removeEventListener(L[1], L[2], L[3]); } catch (e) { /* ignore */ } }); listeners = [];
      try { if (ro) ro.disconnect(); if (mo) mo.disconnect(); if (mq) mq.removeEventListener('change', onDpr); } catch (e) { /* ignore */ }
      if (!saved || !canvas) return;
      [bg, crt, btn].forEach(function (el) { if (el && el.parentNode) el.parentNode.removeChild(el); });
      if (saved.style == null) canvas.removeAttribute('style'); else canvas.setAttribute('style', saved.style);
      if (ownWrap && wrap && wrap.parentNode) { wrap.parentNode.insertBefore(canvas, wrap); wrap.parentNode.removeChild(wrap); }
      else if (wrap) { if (saved.wrapStyle == null) wrap.removeAttribute('style'); else wrap.setAttribute('style', saved.wrapStyle); }
    }

    var api = {
      version: VERSION, native: native, canvas: canvas,
      apply: apply,
      layout: function () { try { return layout(); } catch (e) { busy = false; warn('layout', 'layout failed: ' + (e && e.message)); return api; } },
      toGame: toGame, fromGame: fromGame,
      scale: function () {
        return { n: state.n, css: state.css, dpr: state.dpr, integer: state.integer, fit: state.fit, mode: P.mode, native: { w: native.w, h: native.h },
          rect: state.rect && { x: state.rect.x, y: state.rect.y, w: state.rect.w, h: state.rect.h },
          area: state.area && { x: state.area.x, y: state.area.y, w: state.area.w, h: state.area.h },
          letterbox: { l: state.lb.l, r: state.lb.r, t: state.lb.t, b: state.lb.b }, layouts: state.layouts, fought: state.fought,
          device: state.device && { w: state.device.w, h: state.device.h }, fullscreen: isFs() };
      },
      params: function () { var c = {}; for (var k in P) c[k] = P[k]; return c; },
      setParams: function (p) { var m = {}, k; for (k in P) m[k] = P[k]; for (k in p || {}) m[k] = p[k]; P = clean(m); state.key = ''; relayout(); return api; },
      setSkin: function (s) { try { SK = SKAPI ? SKAPI.resolve(s) : null; } catch (e) { SK = null; } state.key = ''; relayout(); return api; },
      toggleFullscreen: toggleFullscreen,
      isFullscreen: isFs,
      destroy: destroy
    };
    return api;
  }

  root.GameDNA_PixelScaler = { version: VERSION, create: create, DEFAULTS: DEFAULTS, OPTIONS: OPTIONS };
})(typeof window !== 'undefined' ? window : this);
