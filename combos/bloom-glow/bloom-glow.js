/* GameDNA J-03 · Bloom & glow · module v1 (plain script, no dependencies, one global). Needs I-08 webgl-post.js (GameDNA_Post).
 *
 *   const bloom = GameDNA_Bloom.create({
 *     canvas: gameCanvas,                      // the game's 2D canvas (or post: an existing GameDNA_Post instance)
 *     clock: () => frameCount * 1000 / 60,     // game time in ms (flares fade on it; keeps ?t=&freeze=1 deterministic)
 *     params: { threshold: 0.78, knee: 0.5, intensity: 1.6, radius: 0.75, tint: '#fff1dc', blend: 'add', source: 'both' },
 *     uiRects: () => [{ x: 0, y: 0, w: 320, h: 14 }]   // HUD rects in canvas px: never bloomed, never glow
 *   });
 *   const e = bloom.emissive();                 // in draw: a 2D context the size of the game canvas, cleared once per frame
 *   e.drawImage(fireballSprite, x, y);          //   draw ONLY what should glow, at the same canvas px as the game
 *   bloom.glow(x, y, 18, '#ffb050');            //   or a soft round glow (lantern, spark, projectile)
 *   bloom.flare(0.8, { at: { x, y } });         // on a big hit: a short flash of bloom from that point
 *   bloom.render();                             // once per drawn frame (same as post.render(); either is enough)
 *
 * Bright pixels (above a soft-kneed threshold, 0..1) and everything drawn into the emissive canvas are blurred with a
 * 13-tap mip chain at 1/2 .. 1/16 resolution and added back (soft add: never a flat clip) or screened, tinted. Six passes on the shared I-08
 * pipeline (order 600-605). HUD pixels (uiRects or a 'uiMask' input) are neither sources nor receivers.
 * Without WebGL, without GameDNA_Post, or with ?webgl=0, every method is a safe no-op. Never throws.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0';
  var DEFAULTS = {
    threshold: 0.78,     // 0..1: brightness (brightest RGB channel) where bloom starts
    knee: 0.5,           // 0..1: soft knee width as a fraction of threshold (0 = hard cut)
    intensity: 1.6,      // 0..3: bloom strength
    radius: 0.75,        // 0..1: 0 tight halo, 1 wide soft glow
    tint: '#fff1dc',     // bloom colour multiplier ('#rrggbb')
    blend: 'add',        // 'add' | 'screen' (screen never clips to white)
    source: 'both',      // 'both' | 'luma' (bright pixels only) | 'emissive' (only what the game draws into emissive())
    emissiveGain: 1.2,   // 0..3: strength of the emissive canvas
    flareDecay: 420,     // ms of game time a flare takes to fade
    uiFeather: 6,        // canvas px over which glow fades out before a HUD rect (0 = stop at the rect edge)
    adapt: 1,            // 0..1: scene-brightness guard (bright-pixel bloom and flares back off on bright scenes)
    enabled: true
  };
  var NAMES = ['bloom-bright', 'bloom-down1', 'bloom-down2', 'bloom-down3', 'bloom-up', 'bloom'];

  // ------------------------------------------------------------------ GLSL (ES 1.00; the I-08 prelude is added)
  var BRIGHT = [
    'uniform float uThr, uKnee, uNorm, uLumaW, uEmisW, uEmisGain;',
    'vec3 pre(vec3 c) {',
    '  float br = max(c.r, max(c.g, c.b));',
    '  float kw = max(uThr * uKnee, 0.0001);',
    '  float rq = clamp(br - uThr + kw, 0.0, 2.0 * kw);',
    '  rq = rq * rq / (4.0 * kw);',
    '  return c * clamp(max(rq, br - uThr) * uNorm, 0.0, 1.0);',   // uNorm = 1 / curve(1): pure white passes at full strength (8-bit, no HDR)
    '}',
    'void main() {',
    '  vec2 t = 1.0 / uPrevRes;',
    '  vec3 a = texture2D(uPrev, vUv + t * vec2(-1.0, -1.0)).rgb, b = texture2D(uPrev, vUv + t * vec2(1.0, -1.0)).rgb;',
    '  vec3 c = texture2D(uPrev, vUv + t * vec2(-1.0, 1.0)).rgb, d = texture2D(uPrev, vUv + t * vec2(1.0, 1.0)).rgb;',
    '  float wa = 1.0 / (1.0 + luma(a)), wb = 1.0 / (1.0 + luma(b)), wc = 1.0 / (1.0 + luma(c)), wd = 1.0 / (1.0 + luma(d));',   // Karis average: no single-pixel fireflies
    '  vec3 s = (pre(a) * wa + pre(b) * wb + pre(c) * wc + pre(d) * wd) / (wa + wb + wc + wd) * uLumaW;',
    '  vec4 e = texture2D(uEm, vUv);',
    '  s += e.rgb * e.a * uEmisW * uEmisGain * uEmOn;',
    '  vec3 mk = texture2D(uUi, vUv).rgb;',
    '  float m = mk.r * (1.0 - mk.b * (1.0 - mk.g)) * uUiOn;',   // HUD (white) never emits; a glow hole (blue, no green) does
    '  gl_FragColor = vec4(clamp(s * (1.0 - m), 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');
  var DOWN = [   // 13-tap downsample (no blocky columns at coarse levels)
    'uniform float uSpread;',
    'vec3 T(float x, float y) { return texture2D(uIn, vUv + vec2(x, y) * uSpread / uInRes).rgb; }',
    'void main() {',
    '  vec3 g = T(0.0, 0.0);',
    '  vec3 inner = (T(-1.0, -1.0) + T(1.0, -1.0) + T(-1.0, 1.0) + T(1.0, 1.0)) * 0.125;',
    '  vec3 a = T(-2.0, -2.0), b = T(0.0, -2.0), c = T(2.0, -2.0), f = T(-2.0, 0.0), h = T(2.0, 0.0), k = T(-2.0, 2.0), l = T(0.0, 2.0), m = T(2.0, 2.0);',
    '  vec3 outer = (a + c + k + m) * 0.03125 + (b + f + h + l) * 0.0625 + g * 0.125;',
    '  gl_FragColor = vec4(inner + outer, 1.0);',
    '}'
  ].join('\n');
  var UPFN = [
    'vec3 upTent(sampler2D t, vec2 res, float spread) {',
    '  vec2 h = spread / res;',
    '  vec3 s = texture2D(t, vUv + vec2(-2.0 * h.x, 0.0)).rgb + texture2D(t, vUv + vec2(2.0 * h.x, 0.0)).rgb;',
    '  s += texture2D(t, vUv + vec2(0.0, -2.0 * h.y)).rgb + texture2D(t, vUv + vec2(0.0, 2.0 * h.y)).rgb;',
    '  s += (texture2D(t, vUv + vec2(-h.x, -h.y)).rgb + texture2D(t, vUv + vec2(h.x, -h.y)).rgb) * 2.0;',
    '  s += (texture2D(t, vUv + vec2(-h.x, h.y)).rgb + texture2D(t, vUv + vec2(h.x, h.y)).rgb) * 2.0;',
    '  return s / 12.0;',
    '}'
  ].join('\n');
  var UP = [   // 1/4 res: the wide levels (tent of 1/16 and 1/8) mixed with the 1/4 level
    'uniform float uSpread, uWc, uK;',
    UPFN,
    'void main() {',
    '  vec3 wide = upTent(uIn, uInRes, uSpread) * uWc + upTent(uMid, uMidRes, uSpread) * (1.0 - uWc);',
    '  gl_FragColor = vec4(clamp(mix(texture2D(uLo, vUv).rgb, wide, uK), 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');
  var COMPOSITE = [   // full res: 5 texture reads per pixel
    'uniform vec3 uTint; uniform float uInt, uScreen, uWUp, uWCore, uBurst, uBurstR; uniform vec2 uBurstAt;',
    'void main() {',
    '  vec3 c = texture2D(uPrev, vUv).rgb;',
    '  float hi = max(c.r, max(c.g, c.b));',
    '  vec3 core = texture2D(uCore, vUv).rgb * uWCore * (1.0 - smoothstep(0.65, 1.0, hi));',   // the tight level stays off what is already near white
    '  vec3 b = (texture2D(uB, vUv).rgb * uWUp + core) * uTint * uInt;',
    '  if (uBurst > 0.0) {',
    '    vec2 d = (vUv - uvOfGame(uBurstAt)) * vec2(uRes.x / uRes.y, 1.0);',
    '    float q = dot(d, d) / (uBurstR * uBurstR);',
    '    b += uTint * uBurst * (0.75 * exp(-q) + 0.25 * exp(-q / 9.0));',
    '  }',
    '  float m = 0.0;',
    '  if (uUiOn > 0.5) {',
    '    vec3 mc = texture2D(uUi, vUv).rgb;',              // r = HUD; blue without green = glow hole (exact, nearest)
    '    vec2 f = texture2D(uFade, vUv).rg * uFadeOn;',     // r = near a HUD rect, g = near a glow hole (ramps drawn on the CPU)
    '    float inHole = mc.b * (1.0 - mc.g), hole = max(inHole, f.g);',
    '    b *= 1.0 - f.r * (1.0 - hole);',                   // glow fades out before it reaches the HUD
    '    m = mc.r * (1.0 - f.g * (1.0 - inHole));',         // the hole itself stays crisp; its glow spills softly onto the HUD around it
    '  }',
    '  vec3 o = uScreen > 0.5 ? 1.0 - (1.0 - c) * (1.0 - clamp(b, 0.0, 1.0)) : c + (1.0 - c) * (1.0 - exp(-b));',   // soft add: ~c + b on dark pixels, never a flat clip
    '  o += (hash12(gl_FragCoord.xy) - 0.5) / 255.0 * step(0.002, max(b.r, max(b.g, b.b)));',
    '  gl_FragColor = vec4(mix(clamp(o, 0.0, 1.0), c, m), 1.0);',
    '}'
  ].join('\n');

  // ------------------------------------------------------------------ helpers
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function warn(msg) { try { if (root.console && console.warn) console.warn('[GameDNA_Bloom] ' + msg); } catch (e) { } }
  var colorCtx = null, colorCache = {};
  function rgbOf(col, d) {   // any CSS colour (or [r,g,b] 0..1) -> [r, g, b] 0..1
    if (Array.isArray(col) && col.length >= 3) return [num(col[0], 1), num(col[1], 1), num(col[2], 1)];
    var key = String(col == null ? '' : col).trim(); if (!key) return d;
    if (colorCache[key]) return colorCache[key];
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(key), out = null;
    if (m) {
      var s = m[1]; if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
      out = [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
    } else {
      try {
        if (!colorCtx) colorCtx = document.createElement('canvas').getContext('2d');
        colorCtx.fillStyle = '#000'; colorCtx.fillStyle = key; var v = String(colorCtx.fillStyle);
        var h = /^#([0-9a-f]{6})$/i.exec(v), r = /rgba?\(([^)]+)\)/.exec(v);
        if (h) out = rgbOf(v, d); else if (r) { var p = r[1].split(','); out = [num(p[0], 255) / 255, num(p[1], 255) / 255, num(p[2], 255) / 255]; }
      } catch (e) { out = null; }
    }
    if (!out) return d;
    colorCache[key] = out; return out;
  }
  function css(rgb, a) { return 'rgba(' + Math.round(rgb[0] * 255) + ',' + Math.round(rgb[1] * 255) + ',' + Math.round(rgb[2] * 255) + ',' + a + ')'; }
  function okRect(r) { return r && isFinite(r.x) && isFinite(r.y) && isFinite(r.w) && isFinite(r.h) && r.w > 0 && r.h > 0; }

  function applyParams(P, p) {
    for (var k in p) {
      if (!(k in DEFAULTS)) continue;
      var d = DEFAULTS[k];
      if (typeof d === 'number') P[k] = num(p[k], P[k]);
      else if (typeof d === 'boolean') P[k] = p[k] !== false && p[k] !== 'false' && p[k] !== 0 && p[k] !== '0';
      else P[k] = String(p[k]);
    }
    P.threshold = clamp(P.threshold, 0, 1); P.knee = clamp(P.knee, 0, 1); P.intensity = clamp(P.intensity, 0, 3);
    P.radius = clamp(P.radius, 0, 1); P.emissiveGain = clamp(P.emissiveGain, 0, 3); P.flareDecay = Math.max(16, P.flareDecay); P.uiFeather = clamp(P.uiFeather, 0, 32); P.adapt = clamp(P.adapt, 0, 1);
    if (P.blend !== 'screen') P.blend = 'add';
    if (P.source !== 'luma' && P.source !== 'emissive') P.source = 'both';
  }

  // ------------------------------------------------------------------ the no-op instance
  var DUMMY = null;
  function dummyCtx() {
    try { if (!DUMMY) { var c = document.createElement('canvas'); c.width = 1; c.height = 1; DUMMY = c.getContext('2d'); } } catch (e) { DUMMY = null; }
    return DUMMY;
  }
  function offInstance(reason, P, post) {
    var api = {
      version: VERSION, active: false, reason: reason, post: post || null, shared: false,
      emissive: function () { var c = dummyCtx(); try { if (c) c.clearRect(0, 0, 1, 1); } catch (e) { } return c; },
      glow: function () { return api; }, flare: function () { return api; }, clear: function () { return api; },
      render: function (a) { try { if (post && post.render) post.render(a); } catch (e) { } return api; },
      setParams: function (p) { try { applyParams(P, p || {}); } catch (e) { } return api; },
      params: function () { var o = {}; for (var k in P) o[k] = P[k]; return o; },
      setEnabled: function () { return api; }, setUiRects: function () { return api; }, flareValue: function () { return 0; },
      stats: function () { return { active: false, reason: reason, mode: post && post.mode || 'off', frames: 0, emissiveFrames: 0, flares: 0, passes: [] }; },
      destroy: function () { return api; }
    };
    return api;
  }

  // ------------------------------------------------------------------ create
  function create(o) {
    o = o || {};
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    try { applyParams(P, o.params || {}); } catch (e) { }
    var SK = null;
    try { SK = o.skin === false || !root.GameDNA_Skin ? null : root.GameDNA_Skin.resolve(o.skin); } catch (e) { SK = null; }
    var tok = function (c) { try { if (SK && typeof c === 'string' && /^[a-z]+(\.[a-zA-Z]+)+$/.test(c) && SK.token) return SK.token(c) || c; } catch (e) { } return c; };

    var GP = root.GameDNA_Post;
    var src = o.canvas || null;
    if (typeof src === 'string') { try { src = document.querySelector(src); } catch (e) { src = null; } }
    if (src && src.canvas && src.canvas.getContext) src = src.canvas;
    var post = o.post || null, own = false;
    if (!post && src && GP && GP.instances) {   // share the game's GameDNA_Post if it already made one for this canvas
      try { var L = GP.instances(); for (var i = 0; i < L.length; i++) if (L[i].source === src) { post = L[i]; break; } } catch (e) { }
    }
    if (!src && post && post.source) src = post.source;
    if (!post) {
      if (!GP || !GP.create) { warn('GameDNA_Post (webgl-post.js) is not loaded; bloom off'); return offInstance('no-post', P, null); }
      if (!src) { warn('no canvas given; bloom off'); return offInstance('no-canvas', P, null); }
      var pp = { passes: 'none' }; if (o.postParams) for (k in o.postParams) pp[k] = o.postParams[k];
      try { post = GP.create({ canvas: src, clock: o.clock, params: pp, skin: o.skin }); own = true; } catch (e) { post = null; }
      if (!post) return offInstance('no-post', P, null);
    }
    if (!post.active || !post.addPass) return offInstance(post.reason || 'off', P, post);
    if (P.enabled === false) P.enabled = false;

    var clock = typeof o.clock === 'function' ? o.clock : null;
    // coordinate space of uiRects, flare({at}), glow() and the emissive context: o.view {w, h} (e.g. 640x360 while the
    // canvas backing store is 1280x720), default the canvas's own pixels
    var view = o.view && Number(o.view.w) > 0 && Number(o.view.h) > 0 ? { w: Number(o.view.w), h: Number(o.view.h) } : null;
    function vs() { return view && src && src.width ? [src.width / view.w, src.height / view.h] : [1, 1]; }
    var S = { lastMs: 0, frames: 0, emisFrames: 0, flares: 0, touched: false, needClear: true, lastReq: -2, hostFrames: 0, cover: 0, mean: 0, useEmis: false, uiSig: '', uiCount: 0,
      flare: { amp: 0, t0: 0, decay: P.flareDecay, at: null }, errors: 0, alive: true };
    function nowMs() {
      if (clock) { try { var v = Number(clock()); if (isFinite(v)) return v; } catch (e) { } }
      try { var st = post.stats(); if (st && isFinite(st.ms)) return st.ms; } catch (e) { }
      return S.lastMs;
    }
    function flareValue(ms) {
      var f = S.flare; if (f.amp <= 0) return 0;
      var dt = ms - f.t0;
      if (dt < 0) { f.amp = 0; return 0; }   // the game clock went back (restart): drop it
      if (dt >= f.decay) return 0;
      var x = 1 - dt / f.decay; return f.amp * x * x;
    }

    // ---- emissive canvas (same size as the game canvas)
    var hostEmis = o.emissive && o.emissive.getContext ? o.emissive : null;
    var emis = null, eg = null;
    function es() { return Math.min(1, 640 / Math.max(1, src.width | 0)); }   // the emissive layer is at most 640 px wide: it only feeds a blur
    function ensureEmis() {
      if (hostEmis) return null;
      try {
        var w = Math.max(1, Math.round(src.width * es())), h = Math.max(1, Math.round(src.height * es()));
        if (!emis) { emis = document.createElement('canvas'); eg = emis.getContext('2d'); post.setInput('emissive', emis, { filter: 'linear', live: true }); }
        if (emis.width !== w || emis.height !== h) { emis.width = w; emis.height = h; S.needClear = false; }
      } catch (e) { }
      return eg;
    }
    if (hostEmis) post.setInput('emissive', hostEmis, { filter: 'linear', live: true });
    else ensureEmis();
    function emissive() {
      try {
        if (!P.enabled || !post.active) return dummyCtx();
        var c = ensureEmis();
        if (!c) return hostEmis ? hostEmis.getContext('2d') : dummyCtx();
        if (S.needClear) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, emis.width, emis.height); S.needClear = false; }
        var k = vs(), e0 = es(); c.setTransform(k[0] * e0, 0, 0, k[1] * e0, 0, 0);   // every call hands the context back in view units
        S.touched = true;
        return c;
      } catch (e) { return dummyCtx(); }
    }
    function glow(x, y, r, color, alpha) {
      try {
        x = Number(x); y = Number(y); r = Number(r);
        if (!isFinite(x) || !isFinite(y) || !isFinite(r) || r <= 0) return api;
        var a = clamp(num(alpha, 1), 0, 1); if (a <= 0) return api;
        var rgb = rgbOf(tok(color == null ? '#ffffff' : color), [1, 1, 1]);
        var c = emissive(); if (!c || c === DUMMY) return api;
        var gr = c.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, css(rgb, a)); gr.addColorStop(0.3, css(rgb, a * 0.55)); gr.addColorStop(0.65, css(rgb, a * 0.16)); gr.addColorStop(1, css(rgb, 0));
        c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
      } catch (e) { }
      return api;
    }

    // ---- HUD mask from uiRects (exact, nearest: red = HUD, blue = glow hole) and a fade map (linear, low res: red = near
    // a HUD rect, green = near a glow hole), both redrawn and re-uploaded only when the rects change. A game may pass its own
    // 'uiMask' canvas instead (white = HUD, #0000ff = hole that also receives glow, #ff00ff = hole that stays crisp; no fade map then).
    var uiFn = o.uiRects, mask = null, mg = null, fade = null, fg = null;
    if (o.uiMask && o.uiMask.getContext) post.setInput('uiMask', o.uiMask, { filter: 'nearest', live: true });
    function ensureMask() {
      if (mask) return;
      try {
        mask = document.createElement('canvas'); mask.width = Math.max(1, src.width | 0); mask.height = Math.max(1, src.height | 0); mg = mask.getContext('2d');
        fade = document.createElement('canvas'); fade.width = 4; fade.height = 4; fg = fade.getContext('2d');
      } catch (e) { mask = null; }
    }
    if (uiFn && !(o.uiMask && o.uiMask.getContext)) ensureMask();
    function rectFill(g, r, pad) {   // r.r = corner radius (grows with pad, so ramps keep the panel's shape)
      var x0 = Math.floor(r.x - pad), y0 = Math.floor(r.y - pad), w = Math.ceil(r.x + r.w + pad) - x0, h = Math.ceil(r.y + r.h + pad) - y0;
      var rad = r.r > 0 ? Math.min(r.r + pad, w / 2, h / 2) : 0;
      if (rad <= 0.5) { g.fillRect(x0, y0, w, h); return; }
      g.beginPath(); g.moveTo(x0 + rad, y0); g.arcTo(x0 + w, y0, x0 + w, y0 + h, rad); g.arcTo(x0 + w, y0 + h, x0, y0 + h, rad);
      g.arcTo(x0, y0 + h, x0, y0, rad); g.arcTo(x0, y0, x0 + w, y0, rad); g.closePath(); g.fill();
    }
    function updateMask(force) {
      if (!mask) return;
      var list = null;
      if (uiFn) { try { list = typeof uiFn === 'function' ? uiFn() : uiFn; } catch (e) { list = null; S.errors++; } }
      var rects = [], k = vs(), i;
      if (list && list.length) for (i = 0; i < list.length; i++) if (okRect(list[i])) { var q = list[i]; rects.push({ x: q.x * k[0], y: q.y * k[1], w: q.w * k[0], h: q.h * k[1], glow: !!q.glow, r: Math.max(0, +q.r || 0) * k[0], soft: Math.min(32, Math.max(0, +q.soft || 0)) * k[0] }); }
      var w = Math.max(1, src.width | 0), h = Math.max(1, src.height | 0), F = P.uiFeather * k[0];
      var sig = w + 'x' + h + ':' + F + ':' + rects.map(function (r) { return [Math.floor(r.x), Math.floor(r.y), Math.ceil(r.w), Math.ceil(r.h), r.glow ? 1 : 0, Math.round(r.r * 4), Math.round(r.soft * 4)].join(','); }).join(';');
      if (sig === S.uiSig && !force) return;
      S.uiSig = sig; S.uiCount = rects.length;
      if (mask.width !== w || mask.height !== h) { mask.width = w; mask.height = h; }
      mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalCompositeOperation = 'source-over'; mg.fillStyle = '#000'; mg.fillRect(0, 0, w, h);
      for (i = 0; i < rects.length; i++) if (!rects[i].glow && rects[i].soft >= 1) {   // {soft: px}: a red ramp outside the rect, 1 at its edge, 0 at soft px out
        var sf = rects[i].soft, ns = Math.ceil(sf);
        for (var sk = ns; sk >= 1; sk--) { var L = Math.round(255 * (1 - sk / (sf + 1))); mg.fillStyle = 'rgb(' + L + ',0,0)'; rectFill(mg, rects[i], sk); }
      }
      for (var pass = 0; pass < 2; pass++) {   // white = HUD; then blue holes = UI the game wants to glow ({glow: true})
        mg.fillStyle = pass ? '#ff00ff' : '#ffffff';
        for (i = 0; i < rects.length; i++) if (!!rects[i].glow === !!pass) rectFill(mg, rects[i], 0);
      }
      var fs = Math.min(1, 320 / w), fw = Math.max(1, Math.round(w * fs)), fh = Math.max(1, Math.round(h * fs)), N = 8;
      if (fade.width !== fw || fade.height !== fh) { fade.width = fw; fade.height = fh; }
      fg.setTransform(1, 0, 0, 1, 0, 0); fg.globalCompositeOperation = 'source-over'; fg.fillStyle = '#000'; fg.fillRect(0, 0, fw, fh);
      if (F > 0) {   // linear ramps: 1 at the rect edge, 0 at uiFeather px out (N stacked rects of 1/N each)
        fg.setTransform(fs, 0, 0, fs, 0, 0); fg.globalCompositeOperation = 'lighter';
        for (i = 0; i < rects.length; i++) for (var n = 0; n < N; n++) { fg.fillStyle = rects[i].glow ? 'rgba(0,255,0,' + (1 / N) + ')' : 'rgba(255,0,0,' + (1 / N) + ')'; rectFill(fg, rects[i], (rects[i].glow ? 0 : rects[i].soft) + F * n / N); }
      }
      try { post.setInput('uiMask', mask, { filter: 'nearest', live: false }); post.setInput('uiFade', fade, { filter: 'linear', live: false }); } catch (e) { }
    }

    // ---- per-frame bookkeeping: runs inside the post flush, before any pass draws (from the first pass's skip())
    function preFrame(s) {
      try {
        S.lastMs = s.ms; S.frames++;
        var req = -1; try { req = post.stats().requests; } catch (e) { }
        if (req === S.lastReq && S.frames > 1) { if (mask) updateMask(); return false; }   // a watchdog repaint (no new game frame): keep this frame's glow
        S.lastReq = req;
        S.useEmis = hostEmis ? true : S.touched;
        if (S.useEmis) S.emisFrames++;
        if (!hostEmis && !S.touched && emis && !S.needClear) { eg.setTransform(1, 0, 0, 1, 0, 0); eg.clearRect(0, 0, emis.width, emis.height); }
        S.touched = false; S.needClear = true;
        if (mask) updateMask();
        if (S.hostFrames++ % 4 === 0) measure();
      } catch (e) { S.errors++; }
      return false;
    }
    // ---- scene-brightness guard: every 4th game frame the game canvas is shrunk to 16 px wide on the CPU. `cover` = share
    // of the screen above the threshold (sky, sand, snow, white UI), `mean` = mean brightness. A bright scene gets less
    // bright-pixel bloom and smaller flares, so 'both' never washes a daylight frame and a flare never whites it out.
    var meter = null, mctx = null;
    function measure() {
      try {
        var mw = 16, mh = Math.max(1, Math.min(16, Math.round(16 * src.height / Math.max(1, src.width))));
        if (!meter) { meter = document.createElement('canvas'); mctx = meter.getContext('2d', { willReadFrequently: true }); }
        if (meter.width !== mw || meter.height !== mh) { meter.width = mw; meter.height = mh; }
        mctx.imageSmoothingEnabled = true; mctx.drawImage(src, 0, 0, mw, mh);
        var d = mctx.getImageData(0, 0, mw, mh).data, n = mw * mh, over = 0, sum = 0, t = P.threshold * (1 - 0.5 * P.knee);
        for (var i = 0; i < d.length; i += 4) {
          var mx = Math.max(d[i], d[i + 1], d[i + 2]) / 255; sum += mx;
          if (mx > t) over++;
        }
        S.cover = over / n; S.mean = sum / n;
      } catch (e) { S.cover = 0; S.mean = 0; }
    }
    function sstep(a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
    function guard() {   // {luma: weight of bright-pixel bloom, flare: flare scale, gain: overall}
      var a = P.adapt, c = S.cover || 0, m = S.mean || 0;
      return { luma: 1 - a * 0.97 * sstep(0.06, 0.3, c), flare: 1 - a * 0.65 * sstep(0.3, 0.65, m), gain: 1 - a * 0.4 * sstep(0.45, 0.8, m) };
    }
    function curve(br, thr, knee) {   // the soft-knee response, same as pre() in the shader
      var kw = Math.max(thr * knee, 0.0001), rq = clamp(br - thr + kw, 0, 2 * kw); rq = rq * rq / (4 * kw);
      return Math.max(rq, br - thr);
    }
    function off(s) { return !P.enabled || (P.intensity <= 0 && flareValue(s.ms) <= 0.002); }
    function weights() {
      var r = P.radius;
      // weights of the tight (core), middle (1/4) and wide (1/8 + 1/16) levels: they sum to 1.5 (x1.6 gain); radius moves light outward
      return { up: 0.45 + 0.75 * r, d1: 0.45 - 0.2 * r, core: 0.45 - 0.35 * r, wc: 0.45 + 0.45 * r, spread: 1 + 0.75 * r };
    }

    // ---- passes (band 600-699 of the I-08 order)
    var defs = [
      { name: 'bloom-bright', order: 600, scale: 0.5, branch: true, inputs: { uEm: 'emissive', uUi: 'uiMask' }, frag: BRIGHT,
        skip: function (s) { preFrame(s); return off(s); },
        uniforms: function (s) {
          var f = flareValue(s.ms);
          var G = guard(), lw = P.source === 'emissive' ? 0 : G.luma, ew = P.source === 'luma' ? 0 : (S.useEmis ? 1 : 0);
          var thr = clamp(P.threshold, 0.02, 0.995);   // a flare boosts only the wide levels (composite), never the threshold
          return { uThr: thr, uKnee: P.knee, uNorm: 1 / Math.max(0.005, curve(1, thr, P.knee)), uLumaW: lw, uEmisW: ew, uEmisGain: P.emissiveGain };
        } },
      { name: 'bloom-down1', skip: function (s) { return off(s); }, order: 601, scale: 0.25, branch: true, inputs: { uIn: 'bloom-bright' }, frag: DOWN,
        uniforms: function () { return { uSpread: weights().spread }; } },
      { name: 'bloom-down2', skip: function (s) { return off(s); }, order: 602, scale: 0.125, branch: true, inputs: { uIn: 'bloom-down1' }, frag: DOWN,
        uniforms: function () { return { uSpread: weights().spread }; } },
      { name: 'bloom-down3', skip: function (s) { return off(s); }, order: 603, scale: 0.0625, branch: true, inputs: { uIn: 'bloom-down2' }, frag: DOWN,
        uniforms: function () { return { uSpread: weights().spread }; } },
      { name: 'bloom-up', skip: function (s) { return off(s); }, order: 604, scale: 0.25, branch: true, inputs: { uIn: 'bloom-down3', uMid: 'bloom-down2', uLo: 'bloom-down1' }, frag: UP,
        uniforms: function () { var w = weights(); return { uSpread: w.spread, uWc: w.wc, uK: w.up / (w.up + w.d1) }; } },
      { name: 'bloom', order: 605, scale: 1, inputs: { uB: 'bloom-up', uCore: 'bloom-bright', uUi: 'uiMask', uFade: 'uiFade' }, frag: COMPOSITE,
        skip: function (s) { return off(s); },
        uniforms: function (s) {
          var f = flareValue(s.ms), w = weights(), fl = S.flare, at = fl.at;
          var G = guard(); f = Math.min(f * G.flare, 1.2);   // the flare is scaled down on bright scenes and capped
          var burst = at ? 0.45 * f : 0;
          return { uTint: rgbOf(tok(P.tint), [1, 1, 1]), uInt: P.intensity * G.gain, uScreen: P.blend === 'screen' ? 1 : 0,
            uWUp: (w.up + w.d1) * 1.6 * (1 + 1.2 * f), uWCore: w.core * 1.6,
            uBurst: burst, uBurstR: 0.06 + 0.06 * Math.min(1.5, fl.amp), uBurstAt: at ? [at.x, at.y] : [0, 0] };
        } }
    ];
    for (var di = 0; di < defs.length; di++) { defs[di].enabled = P.enabled !== false; defs[di].defaults = {}; post.addPass(defs[di]); }
    var broken = [];
    for (di = 0; di < NAMES.length; di++) { var g0 = post.get(NAMES[di]); if (!g0 || g0.error) broken.push(NAMES[di]); }
    if (broken.length) warn('bloom passes failed to compile: ' + broken.join(', '));

    function flare(strength, opts) {
      try {
        opts = opts || {};
        if (strength && typeof strength === 'object') { opts = strength; strength = opts.strength; }
        var s = clamp(num(strength, 1), 0, 1.5), ms = nowMs(), cur = flareValue(ms), f = S.flare;
        f.amp = Math.max(cur, s); f.t0 = ms; f.decay = Math.max(16, num(opts.decay, P.flareDecay));
        var at = opts.at;
        var kk = vs();
        f.at = at && isFinite(Number(at.x)) && isFinite(Number(at.y)) ? { x: Number(at.x) * kk[0], y: Number(at.y) * kk[1] } : null;
        S.flares++;
      } catch (e) { }
      return api;
    }
    function setEnabled(on) {
      P.enabled = on !== false;
      try { for (var i = 0; i < NAMES.length; i++) post.enable(NAMES[i], P.enabled); } catch (e) { }
      return api;
    }

    var api = {
      version: VERSION, active: true, reason: '', post: post, shared: !own,
      emissive: emissive, glow: glow, flare: flare,
      flareValue: function () { return flareValue(nowMs()); },
      clear: function () { S.flare.amp = 0; try { if (eg && emis) { eg.setTransform(1, 0, 0, 1, 0, 0); eg.clearRect(0, 0, emis.width, emis.height); } } catch (e) { } return api; },
      render: function (a) { try { post.render(a); } catch (e) { } return api; },
      setParams: function (p) {
        try { var was = P.enabled; applyParams(P, p || {}); if (P.enabled !== was) setEnabled(P.enabled); post.render(); } catch (e) { }
        return api;
      },
      params: function () { var oo = {}; for (var key in P) oo[key] = P[key]; return oo; },
      setEnabled: setEnabled,
      setUiRects: function (fn) { try { uiFn = fn || null; if (uiFn) ensureMask(); if (mask) updateMask(true); } catch (e) { } return api; },
      stats: function () {
        var st = {}; try { st = post.stats() || {}; } catch (e) { }
        return { active: !!post.active, reason: post.reason || '', mode: post.mode, shared: !own, enabled: P.enabled,
          frames: S.frames, emissiveFrames: S.emisFrames, emissiveOn: S.useEmis, flares: S.flares, flare: flareValue(nowMs()),
          uiRects: S.uiCount, errors: S.errors, sceneCover: Math.round(S.cover * 100) / 100, sceneMean: Math.round(S.mean * 100) / 100, guard: guard(), broken: broken.slice(),
          passes: (st.passes || []).filter(function (n) { return NAMES.indexOf(n) >= 0; }), postPasses: st.passes || [],
          w: st.w, h: st.h, avgMs: st.avgMs, lastMs: st.lastMs };
      },
      destroy: function () {
        try { for (var i = 0; i < NAMES.length; i++) post.removePass(NAMES[i]); } catch (e) { }
        try { if (emis) post.removeInput('emissive'); if (mask) { post.removeInput('uiMask'); post.removeInput('uiFade'); } } catch (e) { }
        try { if (own) post.destroy(); } catch (e) { }
        api.active = false; api.reason = 'destroyed'; return api;
      }
    };
    try { post.render(); } catch (e) { }
    return api;
  }

  root.GameDNA_Bloom = { version: VERSION, create: create, defaults: DEFAULTS, passNames: NAMES.slice() };
})(typeof window !== 'undefined' ? window : this);
