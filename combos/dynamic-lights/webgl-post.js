/* GameDNA I-08 · WebGL post-process pipeline · module v1 (plain script, no dependencies, one global)
 *
 *   const post = GameDNA_Post.create({
 *     canvas: myCanvas,                        // the game's existing 2D canvas (any size, any CSS scaling)
 *     clock: () => frameCount * 1000 / 60,     // game time in ms (optional; keeps ?t=&freeze=1 deterministic)
 *     params: { passes: 'grade+pulse', look: 'filmic', vignette: 0.35, chroma: 5, decay: 260, sample: 'auto' }
 *   });
 *   post.render();                            // once per drawn frame, after (or before) the game draws: safe anywhere
 *   post.pulse(0.8, { at: { x, y } });         // on a hit: chromatic punch at a canvas point, decays in game time
 *   post.addPass({ name, frag, uniforms: (s, p) => ({...}), scale: 1 | 0.5, inputs: { uMask: 'lights' } });   // J-family passes
 *
 * A WebGL canvas is laid exactly over the game canvas (same CSS box, pointer-events: none, device resolution). Each frame the
 * game canvas is uploaded as a texture and run through a chain of fragment-shader passes. Without WebGL (or with ?webgl=0,
 * or after a lost context) every method is a safe no-op and the 2D canvas shows exactly as before. Never throws.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.1', FRAME = 1000 / 60;
  var SCRATCH = 7;
  var UI_INPUT = 'uiMask';   // shared HUD mask input (white / red channel = HUD pixels every pass leaves unchanged)   // texture unit used only to create and upload textures, never to sample

  var LOOKS = {
    filmic:  { exposure: 1.00, contrast: 0.20, saturation: 1.08, warmth: 0.25, lift: 0.03, filmic: 0.70 },
    warm:    { exposure: 1.04, contrast: 0.18, saturation: 1.14, warmth: 0.60, lift: 0.02, filmic: 0.60 },
    cold:    { exposure: 0.96, contrast: 0.22, saturation: 0.86, warmth: -0.55, lift: 0.04, filmic: 0.60 },
    punchy:  { exposure: 1.04, contrast: 0.36, saturation: 1.28, warmth: 0.12, lift: 0.00, filmic: 0.80 },
    neutral: { exposure: 1.00, contrast: 0.00, saturation: 1.00, warmth: 0.00, lift: 0.00, filmic: 0.00 }
  };
  var DEFAULTS = {
    passes: 'grade+pulse',   // built-ins enabled at start: 'grade+pulse' | 'grade' | 'pulse' | 'none'
    look: 'filmic',          // grade preset (sets exposure, contrast, saturation, warmth, lift, filmic)
    exposure: 1, contrast: 0.2, saturation: 1.08, warmth: 0.25, lift: 0.03, filmic: 0.7,
    vignette: 0.35,          // 0..1 darkening toward the corners
    chroma: 5,               // pulse: colour split at full strength, CSS px
    punch: 0.012,            // pulse: zoom toward the hit point at full strength (fraction)
    decay: 260,              // pulse: ms of game time to fade out
    sample: 'auto',          // how the game canvas is magnified: 'auto' | 'sharp' | 'nearest' | 'linear'
    dpr: 2,                  // most device px per CSS px rendered
    maxPixels: 2400000,      // cap on the overlay's backing store (w x h)
    webgl: 'auto'            // 'auto' | 'off' (?webgl=0 in the page URL also turns it off)
  };

  // ------------------------------------------------------------------ GLSL
  var VERT = 'attribute vec2 aPos; varying vec2 vUv; void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }';
  var PRELUDE = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'varying vec2 vUv;',
    'uniform sampler2D uPrev;   // the chain so far (device resolution)',
    'uniform sampler2D uFrame;  // the game frame, magnified to device resolution',
    'uniform vec2 uRes;         // this pass output size, px',
    'uniform vec2 uPrevRes;',
    'uniform vec2 uSrcRes;      // game canvas size, px',
    'uniform float uTime;       // game time, seconds',
    'uniform float uPulse;      // current pulse 0..1.5',
    'uniform vec2 uPulseAt;     // pulse point, uv',
    'uniform float uDpr;        // device px per CSS px',
    'uniform float uScale;      // output px per game px',
    'vec2 uvOfGame(vec2 px) { return vec2(px.x / uSrcRes.x, 1.0 - px.y / uSrcRes.y); }',
    'vec2 gameOfUv(vec2 uv) { return vec2(uv.x, 1.0 - uv.y) * uSrcRes; }',
    'float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }',
    'float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }'
  ].join('\n');

  var INPUT_FRAG = [
    'uniform sampler2D uRaw; uniform float uMode;   // 0 linear/nearest (filter), 1 sharp bilinear',
    'void main() {',
    '  vec2 uv = vUv;',
    '  if (uMode > 0.5) {',
    '    vec2 texel = vUv * uSrcRes; vec2 sc = max(uRes / uSrcRes, vec2(1.0));',
    '    vec2 fl = floor(texel); vec2 cd = fract(texel) - 0.5; vec2 rr = 0.5 - 0.5 / sc;',
    '    vec2 f = (cd - clamp(cd, -rr, rr)) * sc + 0.5; uv = (fl + f) / uSrcRes;',
    '  }',
    '  gl_FragColor = vec4(texture2D(uRaw, uv).rgb, 1.0);',
    '}'
  ].join('\n');
  var COPY_FRAG = 'void main() { gl_FragColor = vec4(texture2D(uPrev, vUv).rgb, 1.0); }';

  var GRADE_FRAG = [
    'uniform float uExposure, uContrast, uSaturation, uWarmth, uLift, uFilmic, uVignette; uniform vec3 uInk;',
    'vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }',
    'void main() {',
    '  vec3 c = texture2D(uPrev, vUv).rgb;',
    '  vec3 c0 = c;',
    '  float ui = clamp(texture2D(uUi, vUv).r, 0.0, 1.0) * uUiOn;   // shared uiMask: white = HUD, left unchanged',
    '  vec3 lin = pow(c, vec3(2.2)) * uExposure;',
    '  vec3 film = aces(lin * 0.6) / 0.6732;          // white stays white, mid-grey 0.18 -> 0.21, toe darkens',
    '  lin = mix(lin, film, uFilmic);',
    '  c = pow(clamp(lin, 0.0, 1.0), vec3(1.0 / 2.2));',
    '  c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);',
    '  c = c * (1.0 - uLift) + uLift * vec3(0.80, 0.90, 1.15);',
    '  float l = luma(c);',
    '  c = mix(vec3(l), c, uSaturation);',
    '  vec3 tone = mix(vec3(0.90, 0.99, 1.10), vec3(1.08, 1.00, 0.88), smoothstep(0.15, 0.85, l));',
    '  c *= mix(vec3(1.0), uWarmth >= 0.0 ? tone : vec3(2.0) - tone, abs(uWarmth));',
    '  vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);',
    '  float d = length(q) / length(vec2(uRes.x / uRes.y, 1.0) * 0.5);',
    '  c = mix(c, uInk, uVignette * smoothstep(0.38, 1.08, d));',
    '  c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;',
    '  gl_FragColor = vec4(mix(clamp(c, 0.0, 1.0), c0, ui), 1.0);',
    '}'
  ].join('\n');

  var PULSE_FRAG = [
    'uniform float uChroma, uPunch;',
    'void main() {',
    '  float p = uPulse;',
    '  vec2 d = vUv - uPulseAt;',
    '  vec2 dpx = d * uRes; float len = length(dpx) + 0.001;',
    '  vec2 uv = vUv - d * uPunch * p;',
    '  float k = uChroma * uDpr * p * smoothstep(0.0, 0.45 * max(uRes.x, uRes.y), len);',
    '  vec2 off = (dpx / len) * k / uRes;',
    '  vec3 c = vec3(texture2D(uPrev, uv + off).r, texture2D(uPrev, uv).g, texture2D(uPrev, uv - off).b);',
    '  c += vec3(1.0, 0.92, 0.8) * (0.07 * p * exp(-len / (0.22 * uRes.y)));',
    '  float ui = clamp(texture2D(uUi, vUv).r, 0.0, 1.0) * uUiOn;   // shared uiMask: HUD pixels pass through',
    '  gl_FragColor = vec4(mix(clamp(c, 0.0, 1.0), texture2D(uPrev, vUv).rgb, ui), 1.0);',
    '}'
  ].join('\n');

  function builtinPasses() {
    return [
      { name: 'grade', order: 800, frag: GRADE_FRAG, builtin: true, inputs: { uUi: UI_INPUT },
        uniforms: function (s, p) {
          return { uExposure: p.exposure, uContrast: p.contrast, uSaturation: p.saturation, uWarmth: p.warmth, uLift: p.lift,
            uFilmic: p.filmic, uVignette: p.vignette, uInk: p.ink };
        } },
      { name: 'pulse', order: 900, frag: PULSE_FRAG, builtin: true, inputs: { uUi: UI_INPUT },
        skip: function (s) { return s.pulse < 0.002; },
        uniforms: function (s, p) { var w = s.res[0] / (s.dpr || 1); return { uChroma: p.chroma * clamp(w / 800, 0.4, 1.25), uPunch: p.punch }; } }   // chroma in CSS px at an 800 px wide canvas
    ];
  }

  // ------------------------------------------------------------------ helpers
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function urlOff() {
    try { var q = new URLSearchParams(root.location ? root.location.search : ''); var w = q.get('webgl'); return w === '0' || w === 'off' || w === 'false'; } catch (e) { return false; }
  }
  function hexRgb(h, d) {
    if (Array.isArray(h) && h.length >= 3) return [num(h[0], 0), num(h[1], 0), num(h[2], 0)];
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h || '').trim());
    if (!m) return d;
    var s = m[1]; if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
  }
  var LIVE = [];   // live WebGL instances, for tests and judges: GameDNA_Post.instances()
  var supportCache = null;
  function supported() {
    if (supportCache) return supportCache;
    try {
      var c = document.createElement('canvas');
      supportCache = c.getContext('webgl2') ? 'webgl2' : (c.getContext('webgl') || c.getContext('experimental-webgl')) ? 'webgl' : 'none';
    } catch (e) { supportCache = 'none'; }
    return supportCache;
  }
  function warn(msg) { try { if (root.console && console.warn) console.warn('[GameDNA_Post] ' + msg); } catch (e) { } }

  // ------------------------------------------------------------------ the no-op instance
  function offInstance(reason, P) {
    var noop = function () { return api; };
    var api = {
      version: VERSION, active: false, mode: 'off', reason: reason, canvas: null,
      render: noop, renderNow: noop, pulse: noop, clear: noop, resize: noop, destroy: noop, setEnabled: noop,
      addPass: function (def) { return def && def.name ? String(def.name) : null; }, removePass: noop, enable: noop, set: noop,
      get: function () { return null; }, passes: function () { return []; }, setInput: noop, removeInput: noop,
      setParams: noop, params: function () { var o = {}; for (var k in P) o[k] = P[k]; return o; },
      pulseValue: function () { return 0; },
      stats: function () { return { mode: 'off', reason: reason, frames: 0, requests: 0, watchdog: 0, errors: 0, lost: 0, passes: [] }; }
    };
    return api;
  }

  // ------------------------------------------------------------------ create
  function create(o) {
    o = o || {};
    var P = {}; var k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    applyParams(P, o.params || {});
    var src = o.canvas || null;
    if (typeof src === 'string') { try { src = document.querySelector(src); } catch (e) { src = null; } }
    if (src && src.canvas && src.canvas.getContext) src = src.canvas;   // a 2D context was passed
    if (!src || !src.getBoundingClientRect) { warn('no canvas given; post-processing off'); return offInstance('no-canvas', P); }
    if (P.webgl === 'off' || P.webgl === false || o.webgl === false) return offInstance('option', P);
    if (urlOff()) return offInstance('url', P);

    // vignette ink colour from the skin when there is one
    var ink = [0.02, 0.016, 0.05];
    try { var SK = root.GameDNA_Skin && o.skin ? root.GameDNA_Skin.resolve(o.skin) : null; if (SK && SK.palette && SK.palette.ink) ink = hexRgb(SK.palette.ink, ink); } catch (e) { }
    if (o.ink) ink = hexRgb(o.ink, ink);
    P.ink = ink;

    var ov = document.createElement('canvas');
    ov.setAttribute('aria-hidden', 'true');
    ov.className = 'gamedna-post';
    var st = ov.style;
    st.position = 'absolute'; st.pointerEvents = 'none'; st.margin = '0'; st.padding = '0'; st.border = '0';
    st.left = '0px'; st.top = '0px'; st.width = '0px'; st.height = '0px'; st.visibility = 'hidden'; st.display = 'block';
    var attrs = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' };
    var gl = null, mode = 'none';
    try { gl = ov.getContext('webgl2', attrs); if (gl) mode = 'webgl2'; } catch (e) { gl = null; }
    if (!gl) { try { gl = ov.getContext('webgl', attrs) || ov.getContext('experimental-webgl', attrs); if (gl) mode = 'webgl'; } catch (e) { gl = null; } }
    if (!gl) return offInstance('no-webgl', P);
    try { src.parentNode.insertBefore(ov, src.nextSibling); } catch (e) { return offInstance('no-parent', P); }

    var clock = typeof o.clock === 'function' ? o.clock : null;
    var uiRects = o.uiRects || (o.params && o.params.uiRects) || null;   // [{x, y, w, h, r?, soft?}] in game canvas px, or a function returning them
    var uiCv = null, uiSig = '';
    var S = {
      alive: true, enabled: true, lost: false, dead: false, shown: false, requested: false, queued: false,
      ms: 0, flushes: 0, lastHost: null, idle: 0, idleRun: 0,
      pulse: { amp: 0, t0: 0, decay: P.decay, at: [0.5, 0.5] },
      box: { l: NaN, t: NaN, w: NaN, h: NaN, W: 0, H: 0, dpr: 1 }, srcW: 0, srcH: 0
    };
    var ST = { frames: 0, requests: 0, watchdog: 0, skipped: 0, errors: 0, consecutiveErrors: 0, lost: 0, restored: 0, lastError: '',
      lastMs: 0, avgMs: 0, maxMs: 0, pulses: 0, resizes: 0, hidden: 0, uploads: 0 };

    // ---- GL resources
    var R = null;    // {buf, frameTex, programs: {}, targets: {}, white, black}
    var defs = [];   // pass definitions in insertion order
    var inputs = {}; // name -> {source, filter, live, tex, w, h, dirty}
    try { setup(); } catch (e) { try { ov.parentNode.removeChild(ov); } catch (x) { } return offInstance('setup: ' + String(e && e.message || e), P); }

    function compile(type, srcText) {
      var sh = gl.createShader(type); gl.shaderSource(sh, srcText); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) { var log = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error(log || 'compile failed'); }
      return sh;
    }
    function declFor(name, v) {
      var t = typeof v === 'number' || typeof v === 'boolean' ? 'float' : Array.isArray(v) ? (v.length === 2 ? 'vec2' : v.length === 3 ? 'vec3' : v.length === 4 ? 'vec4' : v.length === 9 ? 'mat3' : v.length === 16 ? 'mat4' : null) : null;
      return t ? 'uniform ' + t + ' ' + name + ';' : '';
    }
    var STD = ['uPrev', 'uFrame', 'uRes', 'uPrevRes', 'uSrcRes', 'uTime', 'uPulse', 'uPulseAt', 'uDpr', 'uScale'];
    function declared(text, name) { return new RegExp('uniform\\s+\\w+\\s+(\\w+\\s*,\\s*)*' + name + '\\b').test(text); }
    function fragSource(def) {
      var body = String(def.frag || '');
      // a builder who re-declares a standard uniform gets it removed instead of a compile error
      for (var i = 0; i < STD.length; i++) body = body.replace(new RegExp('^[ \\t]*uniform\\s+\\w+\\s+' + STD[i] + '\\s*;', 'm'), '');
      if (/^\s*precision\s+\w+\s+float\s*;/m.test(body)) body = body.replace(/^\s*precision\s+\w+\s+float\s*;/m, '');
      var head = PRELUDE + '\n' + body, extra = [];
      var ins = def.inputs || {};
      for (var key in ins) {
        if (!declared(head, key)) extra.push('uniform sampler2D ' + key + ';');
        if (!declared(head, key + 'On')) extra.push('uniform float ' + key + 'On;');
        if (!declared(head, key + 'Res')) extra.push('uniform vec2 ' + key + 'Res;');
      }
      var u = {};
      try { u = def.uniforms ? (def.uniforms(stateFor(def), def.params) || {}) : {}; } catch (e) { u = {}; }
      for (var name in u) if (!declared(head, name)) { var d = declFor(name, u[name]); if (d) extra.push(d); }
      return PRELUDE + '\n' + extra.join('\n') + '\n#line 1\n' + body;
    }
    function program(fragText) {
      var vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, fragText);
      var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.bindAttribLocation(pr, 0, 'aPos'); gl.linkProgram(pr);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS) && !gl.isContextLost()) { var log = gl.getProgramInfoLog(pr); gl.deleteProgram(pr); throw new Error(log || 'link failed'); }
      return { pr: pr, loc: {}, units: {} };
    }
    function loc(p, name) { if (!(name in p.loc)) p.loc[name] = gl.getUniformLocation(p.pr, name); return p.loc[name]; }
    function texture(filter) {
      var t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + SCRATCH); gl.bindTexture(gl.TEXTURE_2D, t);
      var f = filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    function solid(rgba) { var t = texture('nearest'); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(rgba)); return t; }
    function setup() {
      R = { programs: {}, targets: {}, frameFilter: null };
      R.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, R.buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
      R.black = solid([0, 0, 0, 255]); R.white = solid([255, 255, 255, 255]);
      R.frameTex = texture('linear'); R.frameFilter = 'linear';
      R.inputProg = program(PRELUDE + '\n' + INPUT_FRAG);
      R.copyProg = program(PRELUDE + '\n' + COPY_FRAG);
      for (var i = 0; i < defs.length; i++) { defs[i].prog = null; defs[i].broken = ''; }
      for (var n in inputs) inputs[n].tex = null;
    }
    function target(key, w, h) {
      var T = R.targets[key];
      if (T && T.w === w && T.h === h) return T;
      if (!T) { T = R.targets[key] = { tex: texture('linear'), fb: gl.createFramebuffer(), w: 0, h: 0 }; }
      gl.activeTexture(gl.TEXTURE0 + SCRATCH); gl.bindTexture(gl.TEXTURE_2D, T.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.tex, 0);
      gl.bindTexture(gl.TEXTURE_2D, null);
      T.w = w; T.h = h; return T;
    }

    // ---- passes
    function normDef(def) {
      var d = { name: String(def.name), frag: String(def.frag || ''), uniforms: typeof def.uniforms === 'function' ? def.uniforms : null,
        skip: typeof def.skip === 'function' ? def.skip : null,
        scale: clamp(num(def.scale, 1), 0.0625, 1), inputs: def.inputs && typeof def.inputs === 'object' ? def.inputs : {},
        order: num(def.order, 500), branch: !!def.branch, keep: !!def.keep, enabled: def.enabled !== false, builtin: !!def.builtin,
        defaults: def.defaults && typeof def.defaults === 'object' ? def.defaults : {}, params: {}, prog: null, broken: '', seq: 0 };
      if (def.params) for (var key in def.params) d.params[key] = def.params[key];
      if (d.builtin) d.params = P;
      return d;
    }
    function find(name) { for (var i = 0; i < defs.length; i++) if (defs[i].name === name) return defs[i]; return null; }
    var seq = 0;
    function addPass(def) {
      try {
        if (!def || !def.name || !def.frag) { warn('addPass needs {name, frag}'); return null; }
        var d = normDef(def); d.seq = seq++;
        var old = find(d.name); if (old) defs.splice(defs.indexOf(old), 1);
        defs.push(d);
        if (R && !S.lost) build(d);
        request();
        return d.name;
      } catch (e) { warn('addPass ' + (def && def.name) + ': ' + e.message); return null; }
    }
    function build(d) {
      if (d.prog || d.broken) return;
      try { d.prog = program(fragSource(d)); }
      catch (e) { d.broken = String(e.message || e).slice(0, 400); warn('pass "' + d.name + '" disabled, shader error:\n' + d.broken); }
    }
    function ordered() { return defs.slice().sort(function (a, b) { return a.order - b.order || a.seq - b.seq; }); }

    // ---- state passed to uniforms()
    var renderMs = null;   // game ms passed to render(ms) when there is no clock()
    function nowMs() {
      if (clock) { try { var v = Number(clock()); if (isFinite(v)) return v; } catch (e) { } }
      if (renderMs !== null) return renderMs;
      return S.flushes * FRAME;
    }
    function pulseValue(ms) {
      var pu = S.pulse; if (pu.amp <= 0) return 0;
      var dt = ms - pu.t0;
      if (dt < 0) { pu.amp = 0; return 0; }        // the game clock went back (restart): drop the pulse
      if (dt >= pu.decay) return 0;
      var x = 1 - dt / pu.decay; return pu.amp * x * x;
    }
    function stateFor(def) {
      var b = S.box, ms = S.ms;
      return { ms: ms, time: ms / 1000, frame: ST.frames, pulse: pulseValue(ms), pulseAt: S.pulse.at,
        res: [Math.max(1, Math.round(b.W * (def ? def.scale : 1))), Math.max(1, Math.round(b.H * (def ? def.scale : 1)))],
        src: [S.srcW, S.srcH], scale: S.srcW ? b.W / S.srcW : 1, dpr: b.dpr, host: S.lastHost, mode: mode };
    }

    // ---- layout: keep the overlay exactly on the canvas's content box
    var csCache = null;
    function contentRect() {
      var r = src.getBoundingClientRect();
      csCache = null;
      if (!csCache) {
        try {
          var cs = root.getComputedStyle(src);
          csCache = { l: parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft) || 0, t: parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop) || 0,
            r: parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.borderBottomWidth) + parseFloat(cs.paddingBottom) || 0,
            display: cs.display, z: cs.position !== 'static' ? cs.zIndex : 'auto' };
        } catch (e) { csCache = { l: 0, t: 0, r: 0, b: 0, display: 'block', z: 'auto' }; }
      }
      var c = csCache;
      return { left: r.left + c.l, top: r.top + c.t, w: Math.max(0, r.width - c.l - c.r), h: Math.max(0, r.height - c.t - c.b), display: c.display, z: c.z };
    }
    function layout() {
      var cr = contentRect();
      if (src.isConnected === false || cr.display === 'none' || cr.w < 1 || cr.h < 1 || !src.width || !src.height) return false;
      var op = ov.offsetParent, ox, oy;
      var docRoot = !op || op === document.body || op === document.documentElement;
      var opStatic = true;
      if (op) { try { opStatic = root.getComputedStyle(op).position === 'static'; } catch (e) { } }
      if (docRoot && opStatic) { ox = root.pageXOffset || 0; oy = root.pageYOffset || 0; }
      else { var pr = op.getBoundingClientRect(); ox = -pr.left - op.clientLeft + op.scrollLeft; oy = -pr.top - op.clientTop + op.scrollTop; }
      var l = cr.left + ox, t = cr.top + oy;
      var dpr = clamp(num(root.devicePixelRatio, 1), 0.5, Math.max(0.5, num(P.dpr, 2)));
      var W = Math.max(1, Math.round(cr.w * dpr)), H = Math.max(1, Math.round(cr.h * dpr));
      var cap = Math.max(65536, num(P.maxPixels, 2400000));
      if (W * H > cap) { var f = Math.sqrt(cap / (W * H)); W = Math.max(1, Math.floor(W * f)); H = Math.max(1, Math.floor(H * f)); dpr = W / cr.w; }
      var b = S.box;
      if (b.l !== l || b.t !== t || b.w !== cr.w || b.h !== cr.h) {
        st.left = l + 'px'; st.top = t + 'px'; st.width = cr.w + 'px'; st.height = cr.h + 'px';
        b.l = l; b.t = t; b.w = cr.w; b.h = cr.h; ST.resizes++;
      }
      if (st.zIndex !== (cr.z === 'auto' ? '' : String(cr.z))) st.zIndex = cr.z === 'auto' ? '' : String(cr.z);
      if (ov.width !== W || ov.height !== H) { ov.width = W; ov.height = H; }
      b.W = W; b.H = H; b.dpr = dpr;
      return true;
    }
    function sampleMode() {
      var m = P.sample;
      if (m === 'auto') {
        var ir = '';
        try { ir = root.getComputedStyle(src).imageRendering || ''; } catch (e) { }
        m = /pixelated|crisp|optimize-contrast/.test(ir) ? 'sharp' : 'linear';
      }
      return m === 'sharp' || m === 'nearest' || m === 'linear' ? m : 'linear';
    }

    // ---- draw one pass
    function bindTex(unit, tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); }
    function setU(p, name, v) {
      var l = loc(p, name); if (l === null || l === undefined) return;
      if (typeof v === 'boolean') v = v ? 1 : 0;
      if (typeof v === 'number') gl.uniform1f(l, v);
      else if (Array.isArray(v) || (v && v.length !== undefined)) {
        if (v.length === 2) gl.uniform2f(l, v[0], v[1]); else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
        else if (v.length === 4) gl.uniform4f(l, v[0], v[1], v[2], v[3]); else if (v.length === 9) gl.uniformMatrix3fv(l, false, v);
        else if (v.length === 16) gl.uniformMatrix4fv(l, false, v); else if (v.length === 1) gl.uniform1f(l, v[0]);
      }
    }
    function common(p, st0, w, h, prevW, prevH) {
      setU(p, 'uRes', [w, h]); setU(p, 'uPrevRes', [prevW, prevH]); setU(p, 'uSrcRes', [S.srcW, S.srcH]);
      setU(p, 'uTime', st0.time); setU(p, 'uPulse', st0.pulse); setU(p, 'uPulseAt', st0.pulseAt);
      setU(p, 'uDpr', S.box.dpr); setU(p, 'uScale', S.srcW ? w / S.srcW : 1);
    }
    function sampler(p, name, unit, tex) { var l = loc(p, name); if (l !== null && l !== undefined) { bindTex(unit, tex); gl.uniform1i(l, unit); } }
    function drawTo(T, w, h) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, T ? T.fb : null); gl.viewport(0, 0, w, h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // ---- the frame
    function upload() {
      var mode2 = sampleMode(), filt = mode2 === 'nearest' ? 'nearest' : 'linear';
      bindTex(SCRATCH, R.frameTex);
      if (R.frameFilter !== filt) {
        var f = filt === 'nearest' ? gl.NEAREST : gl.LINEAR;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f); R.frameFilter = filt;
      }
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      S.srcW = src.width; S.srcH = src.height; ST.uploads++;
      return mode2;
    }
    function uploadInput(name) {
      var I = inputs[name]; if (!I || !I.source) return null;
      if (!I.tex) { I.tex = texture(I.filter); I.dirty = true; }
      if (I.live || I.dirty) {
        try {
          bindTex(SCRATCH, I.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, I.source);
          I.w = I.source.width || I.source.videoWidth || 1; I.h = I.source.height || I.source.videoHeight || 1; I.dirty = false; I.ok = true;
        } catch (e) { I.ok = false; I.error = String(e.message || e); }
      }
      return I.ok ? I : null;
    }

    function roundRect(c, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      if (r <= 0) { c.fillRect(x, y, w, h); return; }
      c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); c.fill();
    }
    // HUD mask from uiRects. Another element (a J pass) that already put its own canvas in the 'uiMask' slot wins: I-08 then only reads it.
    function updateUiMask() {
      if (!uiRects) return;
      var cur = inputs[UI_INPUT];
      if (cur && cur.source && cur.source !== uiCv) return;
      var list = uiRects;
      if (typeof list === 'function') { try { list = list(); } catch (e) { list = null; } }
      var w = Math.max(1, src.width | 0), h = Math.max(1, src.height | 0), sig = w + 'x' + h + ':';
      var R = [];
      if (Array.isArray(list)) for (var i = 0; i < list.length && i < 64; i++) {
        var q = list[i]; if (!q) continue;
        var x = num(q.x, NaN), y = num(q.y, NaN), rw = num(q.w, 0), rh = num(q.h, 0);
        if (!isFinite(x) || !isFinite(y) || rw <= 0 || rh <= 0) continue;
        var sf = Math.round(Math.max(0, Math.min(32, num(q.soft, 0)))), rd = Math.max(0, Math.min(Math.min(rw, rh) / 2, num(q.r, 0)));
        R.push([Math.floor(x), Math.floor(y), Math.ceil(rw), Math.ceil(rh), sf, rd]); sig += R[R.length - 1].join(',') + ';';
      }
      if (sig === uiSig && cur) return;
      uiSig = sig;
      if (!uiCv) uiCv = document.createElement('canvas');
      if (uiCv.width !== w || uiCv.height !== h) { uiCv.width = w; uiCv.height = h; }
      var g2 = uiCv.getContext('2d'); g2.setTransform(1, 0, 0, 1, 0, 0); g2.fillStyle = '#000'; g2.fillRect(0, 0, w, h); g2.fillStyle = '#fff';
      for (var j = 0; j < R.length; j++) {
        var a = R[j];
        if (!a[4] && !a[5]) { g2.fillStyle = '#fff'; g2.fillRect(a[0], a[1], a[2], a[3]); continue; }
        // soft: the rect stays fully masked; the mask fades to 0 over `soft` px outside it (rounded corners)
        for (var k = a[4]; k >= 0; k--) {
          var v = Math.round(255 * (1 - k / (a[4] + 1)));
          g2.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
          roundRect(g2, a[0] - k, a[1] - k, a[2] + 2 * k, a[3] + 2 * k, a[5] + k);
        }
      }
      setInput(UI_INPUT, uiCv, { filter: 'nearest', live: false });
    }

    function flush() {
      S.queued = false;
      if (!S.alive || S.dead || S.lost || !S.enabled) return;
      var t0 = (root.performance && performance.now) ? performance.now() : 0;
      try {
        if (gl.isContextLost()) { onLost(); return; }
        if (!layout()) { if (S.shown) { st.visibility = 'hidden'; S.shown = false; } ST.hidden++; return; }
        S.ms = nowMs();
        try { updateUiMask(); } catch (e) { }
        var smode = upload();
        var W = S.box.W, H = S.box.H;
        var list = ordered().filter(function (d) { return d.enabled && !d.broken; });
        for (var i = 0; i < list.length; i++) build(list[i]);
        list = list.filter(function (d) { return d.prog; });
        // skip passes that say so this frame (e.g. pulse at 0)
        var stBase = stateFor(null);
        list = list.filter(function (d) { if (!d.skip) return true; try { return !d.skip(stBase, d.params); } catch (e) { return true; } });
        // which outputs are read later by name
        var kept = {};
        for (i = 0; i < list.length; i++) { var ins = list[i].inputs; for (var key in ins) kept[ins[key]] = true; if (list[i].keep) kept[list[i].name] = true; }
        list = list.filter(function (d) { return !d.branch || kept[d.name]; });
        var lastChain = -1;
        for (i = 0; i < list.length; i++) if (!list[i].branch) lastChain = i;
        list = list.slice(0, lastChain + 1);

        // 1) magnify the game frame to device resolution
        var p = R.inputProg; gl.useProgram(p.pr);
        common(p, stBase, W, H, S.srcW, S.srcH);
        sampler(p, 'uRaw', 0, R.frameTex); setU(p, 'uMode', smode === 'sharp' ? 1 : 0);
        var frameT = null;
        if (!list.length) { drawTo(null, W, H); }
        else { frameT = target('@frame', W, H); drawTo(frameT, W, H); }
        var named = { frame: frameT, '@frame': frameT };
        var chain = frameT, chainW = W, chainH = H;
        // 2) the chain
        for (i = 0; i < list.length; i++) {
          var d = list[i], w = Math.max(1, Math.round(W * d.scale)), h = Math.max(1, Math.round(H * d.scale));
          var toScreen = i === lastChain && !kept[d.name] && w === W && h === H;
          var T = null;
          if (!toScreen) {
            if (kept[d.name]) T = target('#' + d.name, w, h);
            else {
              var sk = w + 'x' + h;
              var a = target('@pp-' + sk + '-0', w, h), b = target('@pp-' + sk + '-1', w, h);
              T = (chain === a) ? b : a;
            }
          }
          var sd = stateFor(d); sd.pulse = stBase.pulse;
          var pr2 = d.prog; gl.useProgram(pr2.pr);
          common(pr2, sd, w, h, chainW, chainH);
          sampler(pr2, 'uPrev', 0, chain.tex); sampler(pr2, 'uFrame', 1, frameT.tex);
          var unit = 2;
          for (key in d.inputs) {
            if (unit >= SCRATCH) break;   // at most 5 extra inputs per pass
            var ref = d.inputs[key], tex = null, iw = 1, ih = 1, on = 0;
            var nt = named[ref] || null;
            if (nt) { tex = nt.tex; iw = nt.w; ih = nt.h; on = 1; }
            else if (inputs[ref]) { var I = uploadInput(ref); if (I) { tex = I.tex; iw = I.w; ih = I.h; on = 1; } }
            if (!tex) tex = d.defaults[key] === 'white' ? R.white : R.black;
            sampler(pr2, key, unit++, tex); setU(pr2, key + 'On', on); setU(pr2, key + 'Res', [iw, ih]);
          }
          var U = null;
          try { U = d.uniforms ? d.uniforms(sd, d.params) : null; } catch (e) { U = null; ST.errors++; ST.lastError = 'uniforms(' + d.name + '): ' + e.message; }
          if (U) for (var un in U) setU(pr2, un, U[un]);
          drawTo(T, w, h);
          if (T) named[d.name] = T;
          if (!d.branch) { chain = T; chainW = w; chainH = h; }
        }
        // 3) the last chain output went to a texture (it is read by name, or scaled): copy it to the screen
        if (list.length && chain) {
          p = R.copyProg; gl.useProgram(p.pr); common(p, stBase, W, H, chainW, chainH); sampler(p, 'uPrev', 0, chain.tex); drawTo(null, W, H);
        }
        ST.frames++; S.flushes++; ST.consecutiveErrors = 0;
        if (!S.shown) { st.visibility = 'visible'; S.shown = true; }
      } catch (e) {
        ST.errors++; ST.consecutiveErrors++; ST.lastError = String(e && e.message || e).slice(0, 300);
        if (/SecurityError|tainted|cross-origin/i.test(ST.lastError)) { kill('tainted canvas: ' + ST.lastError); }
        else if (ST.consecutiveErrors >= 3) kill('render error: ' + ST.lastError);
      }
      if (t0) { var dt = performance.now() - t0; ST.lastMs = dt; ST.maxMs = Math.max(ST.maxMs, dt); ST.avgMs = ST.frames <= 1 ? dt : ST.avgMs * 0.95 + dt * 0.05; }
    }

    function kill(reason) {
      S.dead = true; api.active = false; api.reason = reason; api.mode = 'off';
      st.visibility = 'hidden'; st.display = 'none'; S.shown = false; warn('post-processing off: ' + reason);
    }

    // ---- requests: render after the current task, so call order around the game's draw does not matter
    var mq = typeof root.queueMicrotask === 'function' ? function (f) { root.queueMicrotask(f); } : function (f) { Promise.resolve().then(f); };
    function request() {
      if (S.queued || !S.alive) return;
      S.queued = true; mq(flush);
    }
    function render(arg) {
      try {
        ST.requests++; S.requested = true;
        if (typeof arg === 'number' && isFinite(arg)) renderMs = arg;
        else if (arg && typeof arg === 'object') { S.lastHost = arg; if (arg.ms !== undefined && isFinite(Number(arg.ms))) renderMs = Number(arg.ms); }
        request();
      } catch (e) { }
      return api;
    }
    function renderNow(arg) { render(arg); if (S.queued) flush(); return api; }

    // watchdog: if the game stops calling render() (a title screen it did not wire), repaint from the canvas ourselves
    var rafId = 0;
    function tick() {
      rafId = 0;
      if (!S.alive) return;
      try {
        if (S.requested) { S.requested = false; S.idle = 0; S.idleRun = 0; }
        else if (!S.dead && !S.lost && S.enabled) {
          S.idle++;
          if (S.idle >= 2 && (S.idleRun < 120 || S.idle % 15 === 0)) { S.idleRun++; ST.watchdog++; request(); }
        }
      } catch (e) { }
      rafId = root.requestAnimationFrame ? root.requestAnimationFrame(tick) : 0;
    }
    if (root.requestAnimationFrame) rafId = root.requestAnimationFrame(tick);

    // ---- pulse
    function pulse(strength, opts) {
      try {
        opts = opts || {};
        if (strength && typeof strength === 'object') { opts = strength; strength = opts.strength; }
        var s = clamp(num(strength, 1), 0, 1.5);
        var ms = nowMs();
        var cur = pulseValue(ms);
        var pu = S.pulse;
        pu.amp = Math.max(cur, s); pu.t0 = ms; pu.decay = Math.max(16, num(opts.decay, P.decay));
        var at = opts.at;
        if (at && isFinite(Number(at.x)) && isFinite(Number(at.y)) && src.width && src.height) pu.at = [clamp(at.x / src.width, 0, 1), clamp(1 - at.y / src.height, 0, 1)];
        else pu.at = [0.5, 0.5];
        ST.pulses++;
      } catch (e) { }
      return api;
    }

    // ---- inputs (host canvases: depth, light mask...)
    function setInput(name, source, opts) {
      try {
        opts = opts || {}; name = String(name);
        if (!source) { delete inputs[name]; return api; }
        var I = inputs[name] || (inputs[name] = {});
        if (I.tex && I.filter !== (opts.filter || 'linear') && R && !S.lost) { gl.deleteTexture(I.tex); I.tex = null; }
        I.source = source; I.filter = opts.filter === 'nearest' ? 'nearest' : 'linear'; I.live = opts.live !== false; I.dirty = true;
        request();
      } catch (e) { }
      return api;
    }

    // ---- context loss
    function onLost(e) {
      try { if (e && e.preventDefault) e.preventDefault(); } catch (x) { }
      if (S.lost) return;
      S.lost = true; ST.lost++; api.active = false; api.reason = 'lost'; st.visibility = 'hidden'; S.shown = false;
    }
    function onRestored() {
      try {
        if (!S.alive || S.dead) return;
        S.lost = false; setup(); ST.restored++; api.active = true; api.reason = ''; request();
      } catch (e) { kill('restore failed: ' + e.message); }
    }
    ov.addEventListener('webglcontextlost', onLost, false);
    ov.addEventListener('webglcontextrestored', onRestored, false);
    var onResize = function () { csCache = null; request(); };
    try { root.addEventListener('resize', onResize); } catch (e) { }
    var ro = null;
    try { if (root.ResizeObserver) { ro = new root.ResizeObserver(onResize); ro.observe(src); } } catch (e) { ro = null; }

    function setParams(p) {
      try {
        var before = P.passes; applyParams(P, p || {});
        if (p && p.passes !== undefined && p.passes !== before) applyPassesParam();
        if (p && p.ink) P.ink = hexRgb(p.ink, P.ink);
        if (p && p.uiRects !== undefined) {
          var had = inputs[UI_INPUT] && inputs[UI_INPUT].source === uiCv;
          uiRects = p.uiRects || null; uiSig = '';
          if (!uiRects && had) delete inputs[UI_INPUT];
        }
        if (p && p.decay !== undefined) S.pulse.decay = Math.max(16, num(P.decay, 260));
        request();
      } catch (e) { }
      return api;
    }
    function applyPassesParam() {
      var v = String(P.passes || '');
      var g = find('grade'), pu = find('pulse');
      if (g) g.enabled = /grade/.test(v); if (pu) pu.enabled = /pulse/.test(v);
    }

    var api = {
      version: VERSION, active: true, mode: mode, reason: '', canvas: ov, source: src,
      render: render, renderNow: renderNow, pulse: pulse,
      pulseValue: function () { return pulseValue(nowMs()); },
      clear: function () { S.pulse.amp = 0; request(); return api; },
      resize: function () { csCache = null; request(); return api; },
      setEnabled: function (on) {
        S.enabled = on !== false;
        if (!S.enabled) { st.visibility = 'hidden'; S.shown = false; } else request();
        api.active = S.enabled && !S.dead && !S.lost; return api;
      },
      addPass: addPass,
      removePass: function (name) { var d = find(name); if (d && !d.builtin) { defs.splice(defs.indexOf(d), 1); try { if (d.prog) gl.deleteProgram(d.prog.pr); } catch (e) { } request(); } return api; },
      enable: function (name, on) { var d = find(name); if (d) { d.enabled = on !== false; request(); } return api; },
      set: function (name, params) {
        var d = find(name); if (!d) return api;
        if (d.builtin) return setParams(params);
        for (var key in params || {}) d.params[key] = params[key];
        request(); return api;
      },
      get: function (name) {
        var d = find(name); if (!d) return null;
        var pp = {}; for (var key in d.params) pp[key] = d.params[key];
        return { name: d.name, enabled: d.enabled, order: d.order, scale: d.scale, branch: d.branch, inputs: d.inputs, params: pp, error: d.broken || '' };
      },
      passes: function () { return ordered().map(function (d) { return d.name; }); },
      setInput: setInput,
      removeInput: function (name) { delete inputs[String(name)]; request(); return api; },
      setParams: setParams,
      params: function () { var oo = {}; for (var key in P) oo[key] = P[key]; return oo; },
      stats: function () {
        var oo = {}; for (var key in ST) oo[key] = ST[key];
        oo.mode = api.mode; oo.reason = api.reason; oo.active = api.active;
        oo.passes = ordered().filter(function (d) { return d.enabled && !d.broken; }).map(function (d) { return d.name; });
        oo.broken = defs.filter(function (d) { return d.broken; }).map(function (d) { return d.name; });
        oo.w = S.box.W; oo.h = S.box.H; oo.cssW = S.box.w; oo.cssH = S.box.h; oo.dpr = S.box.dpr; oo.srcW = S.srcW; oo.srcH = S.srcH;
        oo.pulse = pulseValue(nowMs()); oo.ms = S.ms; oo.shown = S.shown;
        return oo;
      },
      destroy: function () {
        S.alive = false; api.active = false; api.reason = 'destroyed';
        try { if (rafId && root.cancelAnimationFrame) root.cancelAnimationFrame(rafId); } catch (e) { }
        try { root.removeEventListener('resize', onResize); if (ro) ro.disconnect(); } catch (e) { }
        try { var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) { }
        try { if (ov.parentNode) ov.parentNode.removeChild(ov); } catch (e) { }
        var li = LIVE.indexOf(api); if (li >= 0) LIVE.splice(li, 1);
        return api;
      }
    };

    var B = builtinPasses();
    for (var bi = 0; bi < B.length; bi++) addPass(B[bi]);
    applyPassesParam();
    request();
    LIVE.push(api);
    return api;
  }

  function applyParams(P, p) {
    if (p.look !== undefined && LOOKS[p.look]) { P.look = p.look; var L = LOOKS[p.look]; for (var k in L) P[k] = L[k]; }
    for (var key in p) {
      if (key === 'look' || key === 'ink') continue;
      if (!(key in DEFAULTS)) continue;
      var d = DEFAULTS[key];
      P[key] = typeof d === 'number' ? num(p[key], P[key]) : p[key];
    }
  }

  root.GameDNA_Post = { version: VERSION, create: create, supported: supported, instances: function () { return LIVE.slice(); }, defaults: DEFAULTS, looks: LOOKS, glslPrelude: PRELUDE };
})(typeof window !== 'undefined' ? window : this);
