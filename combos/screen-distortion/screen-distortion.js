/* GameDNA J-08 · Screen-space distortion · module v1 (plain script, no dependencies, one global). Needs I-08 webgl-post.js (GameDNA_Post).
 *
 *   const fx = GameDNA_Distort.create({
 *     canvas: gameCanvas,                       // the game's 2D canvas (or post: an existing GameDNA_Post instance)
 *     clock: () => frameCount * 1000 / 60,      // game time in ms (waves and ripples move on it; ?t=&freeze=1 stays deterministic)
 *     regions: () => [                          // read every frame, in on-screen units (camera already subtracted)
 *       { kind: 'heat',   x: 300, y: 120, w: 60, h: 90 },          // shimmer rising over a fire, lava, a hot vent
 *       { kind: 'water',  x: 0,   y: 250, w: 640, h: 110 },        // wobble under a water surface
 *       { kind: 'portal', x: 520, y: 150, r: 40 }                  // swirl + lens refraction inside a circle
 *     ],
 *     uiRects: () => [{ x: 0, y: 0, w: 640, h: 24 }]               // HUD in the same units: never distorted, never pulled into the world
 *   });
 *   fx.shockwave(x, y, { strength: 1 });        // on an explosion, a slam, a big hit: a ring of refraction expanding from a point
 *   fx.render();                                // once per drawn frame (same as post.render(); either is enough)
 *
 * One full-screen pass ('distort', order 350, the I-08 distortion band) that offsets where each pixel samples the frame
 * (a UV offset; colours are never repainted, apart from an optional faint light on wave fronts, portal rims and water
 * caustics). Skipped (zero cost) when nothing is active. HUD pixels (uiRects or the shared 'uiMask') stay exactly as drawn.
 * Without WebGL, without GameDNA_Post, or with ?webgl=0, every method is a safe no-op and the 2D frame is unchanged. Never throws.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0';
  var MAXW = 8, MAXR = 8;
  var DEFAULTS = {
    strength: 1,         // 0..2: multiplies everything below
    heat: 2.2,           // heat-haze amplitude (px at a 360 px tall view; scales with the view height)
    water: 2.2,          // water wobble amplitude (same units)
    portal: 1,           // 0..2: portal swirl and lens strength
    wave: 9,             // shockwave amplitude at strength 1 (same units)
    waveRadius: 150,     // how far a strength-1 wave travels (same units)
    waveWidth: 22,       // width of the refracting band (same units)
    waveMs: 650,         // ms of game time a wave lives
    chroma: 0.35,        // 0..1: colour fringe on wave fronts and portal rims (0 = none)
    shine: 0.35,         // 0..1: faint light on wave fronts, portal rims, water caustics (0 = pure UV offset)
    tint: '#fff2dc',     // colour of that light (a skin token such as 'fx.hot' works with skin-api.js)
    underwater: 0,       // 0..1: the whole view wobbles (a level that is entirely under water)
    snap: false,         // true: offsets snap to whole canvas pixels (a chunkier pixel-art wobble)
    uiFeather: 6,        // view px over which distortion fades out before a HUD rect
    debug: false,        // tints regions so you can see where they are
    enabled: true
  };
  var NAME = 'distort';
  var KIND = { heat: 1, water: 2, portal: 3 };

  // ------------------------------------------------------------------ GLSL (ES 1.00; the I-08 prelude is added)
  var FRAG = [
    'uniform mat4 uWA0, uWB0, uWA1, uWB1;   // waves (columns): A = (x, y, radius, amp) canvas px; B = (width, chroma, light, 0)',
    'uniform mat4 uRA0, uRB0, uRA1, uRB1;   // regions (columns): A = (x0, y0, x1, y1) canvas px; B = (kind, amount, soft px, ellipse)',
    'uniform float uNW, uNR, uUnit, uT, uSnap, uChroma, uDebug, uShine;',
    'uniform vec3 uTint;',
    'void region(vec2 p, vec4 a, vec4 b, inout vec2 o, inout float ch, inout float li, inout vec3 gw, inout vec3 dbg) {',
    '  if (b.x < 0.5) return;',
    '  if (p.x < a.x || p.y < a.y || p.x > a.z || p.y > a.w) return;',
    '  vec2 c = (a.xy + a.zw) * 0.5, hs = max((a.zw - a.xy) * 0.5, vec2(0.5));',
    '  vec2 q = (p - c) / hs; float r = length(q);',
    '  float soft = max(b.z, 0.5), w;',
    '  if (b.w > 0.5) { if (r >= 1.0) return; w = clamp((1.0 - r) * min(hs.x, hs.y) / soft, 0.0, 1.0); }',
    '  else { vec2 e = min(p - a.xy, a.zw - p); w = clamp(min(e.x, e.y) / soft, 0.0, 1.0); }',
    '  w = w * w * (3.0 - 2.0 * w);',
    '  vec2 lp = (p - a.xy) / uUnit;   // region-local, in 360-view units: the pattern moves with the region, not the screen',
    '  float t = uT, k = b.y;',
    '  if (b.x < 1.5) {',   // heat: fine rising shimmer (about 11 px ripples), stronger near the bottom (the source)
    '    float rise = clamp((p.y - a.y) / max(1.0, a.w - a.y), 0.0, 1.0);',
    '    float amp = k * uUnit * w * (0.45 + 0.55 * rise);',
    '    float sx = sin(lp.y * 0.55 + t * 9.0 + sin(lp.x * 0.08 + t * 1.7) * 1.6) * 0.6 + sin(lp.y * 1.1 + t * 13.0 + lp.x * 0.05) * 0.4;',
    '    float sy = sin(lp.y * 0.42 + lp.x * 0.13 + t * 7.5) * 0.5;',
    '    o += vec2(sx, sy) * amp;',
    '    dbg += vec3(1.0, 0.45, 0.1) * w;',
    '  } else if (b.x < 2.5) {',   // water: slow, wide wobble plus caustic glints
    '    float amp = k * uUnit * w;',
    '    o += vec2(sin(lp.y * 0.11 + t * 2.1 + sin(lp.x * 0.03 + t * 0.7)) + 0.45 * sin(lp.y * 0.29 - t * 3.3 + lp.x * 0.04),',
    '              0.55 * sin(lp.x * 0.085 + t * 1.6 + lp.y * 0.02)) * amp;',
    '    float cz = sin(lp.x * 0.07 + t * 1.3 + sin(lp.y * 0.09 - t * 0.9) * 1.8) * sin(lp.y * 0.11 - t * 1.1 + sin(lp.x * 0.06 + t * 0.8) * 1.8);',
    '    gw += vec3(0.62, 0.9, 1.0) * 0.16 * w * smoothstep(0.3, 0.95, cz) * min(k / 2.2, 1.5);',   // soft, rounded, pale cyan glints
    '    dbg += vec3(0.2, 0.7, 1.0) * w;',
    '  } else {',   // portal: swirl that breathes, lens pull toward the centre, a rippling refractive rim
    '    float fall = 1.0 - clamp(r, 0.0, 1.0);',
    '    float sw = k * (1.7 + 0.45 * sin(t * 1.3)) * fall * fall;',
    '    float cs = cos(sw), sn = sin(sw);',
    '    vec2 rq = vec2(cs * q.x - sn * q.y, sn * q.x + cs * q.y) * mix(1.0, 0.45 + 0.55 * r, clamp(k, 0.0, 1.5) / 1.5);',
    '    float rim = exp(-(r - 0.86) * (r - 0.86) * 90.0);',
    '    float ang = atan(q.y, q.x);',
    '    rq += q / max(r, 0.001) * rim * 0.05 * k * sin(ang * 7.0 + t * 4.0);',
    '    o += (c + rq * hs - p) * w;',
    '    ch += rim * k * 0.7 + fall * 0.25 * k;',
    '    li += rim * 0.12 * k * w * uShine / 0.35;',
    '    dbg += vec3(0.75, 0.4, 1.0) * w;',
    '  }',
    '}',
    'void wave(vec2 p, vec4 a, vec4 b, inout vec2 o, inout float ch, inout float li) {',
    '  if (a.w <= 0.0) return;',
    '  vec2 d = p - a.xy; float r = length(d);',
    '  float x = (r - a.z) / max(b.x, 0.5);',
    '  if (abs(x) > 3.0) return;',
    '  float prof = x * exp(-x * x) * 2.33;',   // +-1 at x = +-0.71: pushes outward ahead of the front, pulls in behind
    '  float inner = smoothstep(0.0, b.x, r);',   // no singularity at the centre
    '  o -= d / max(r, 0.001) * prof * a.w * inner;',
    '  ch += abs(prof) * b.y * inner;',
    '  li += b.z * exp(-(x - 0.35) * (x - 0.35) * 3.0) * inner;',
    '}',
    'void main() {',
    '  vec2 p = gameOfUv(vUv);',
    '  vec2 o = vec2(0.0); float ch = 0.0, li = 0.0; vec3 gw = vec3(0.0), dbg = vec3(0.0);',
    '  for (int i = 0; i < 4; i++) { if (float(i) >= uNR) break; region(p, uRA0[i], uRB0[i], o, ch, li, gw, dbg); }',   // loops with a uniform break:
    '  for (int i = 0; i < 4; i++) { if (float(i + 4) >= uNR) break; region(p, uRA1[i], uRB1[i], o, ch, li, gw, dbg); }',   // measured about 2x faster on
    '  for (int i = 0; i < 4; i++) { if (float(i) >= uNW) break; wave(p, uWA0[i], uWB0[i], o, ch, li); }',              // SwiftShader than the same calls
    '  for (int i = 0; i < 4; i++) { if (float(i + 4) >= uNW) break; wave(p, uWA1[i], uWB1[i], o, ch, li); }',          // unrolled behind uniform ifs
    '  if (uSnap > 0.5) o = floor(o + 0.5);',
    '  float k = 1.0 - texture2D(uDm, vUv).g * uDmOn;',   // own feathered HUD map: 1 on and near a HUD rect
    '  if (uUiOn > 0.5 && texture2D(uUi, vUv).r > 0.5) k = 0.0;',   // the shared uiMask (I-08 or another element)
    '  o *= k; li *= k; gw *= k * uShine / 0.35; dbg *= k;',
    '  vec2 du = vec2(o.x / uSrcRes.x, -o.y / uSrcRes.y);',
    '  vec2 uv = vUv + du;',
    '  if ((uUiOn > 0.5 && texture2D(uUi, uv).r > 0.5) || (uDmOn > 0.5 && texture2D(uDm, uv).r > 0.5)) { du = vec2(0.0); uv = vUv; }',   // never pull HUD pixels into the world
    '  vec2 lim = 0.5 / uPrevRes; uv = clamp(uv, lim, 1.0 - lim);',
    '  vec3 col;',
    '  float cf = clamp(ch, 0.0, 1.0) * uChroma * k;',
    '  if (cf > 0.002) {',
    '    col = vec3(texture2D(uPrev, clamp(uv + du * cf, lim, 1.0 - lim)).r, texture2D(uPrev, uv).g, texture2D(uPrev, clamp(uv - du * cf, lim, 1.0 - lim)).b);',
    '  } else col = texture2D(uPrev, uv).rgb;',
    '  if (li > 0.001) col += (1.0 - col) * uTint * clamp(li, 0.0, 0.6);',
    '  col += (1.0 - col) * clamp(gw, 0.0, 0.5);',
    '  if (uDebug > 0.5) col = mix(col, clamp(dbg, 0.0, 1.0), 0.22 * clamp(max(dbg.r, max(dbg.g, dbg.b)), 0.0, 1.0));',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  // ------------------------------------------------------------------ helpers
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function warn(msg) { try { if (root.console && console.warn) console.warn('[GameDNA_Distort] ' + msg); } catch (e) { } }
  var colorCtx = null, colorCache = {};
  function rgbOf(col, d) {
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
  function okRect(r) { return r && isFinite(r.x) && isFinite(r.y) && isFinite(r.w) && isFinite(r.h) && r.w > 0 && r.h > 0; }
  function applyParams(P, p) {
    for (var k in p) {
      if (!(k in DEFAULTS)) continue;
      var d = DEFAULTS[k];
      if (typeof d === 'number') P[k] = num(p[k], P[k]);
      else if (typeof d === 'boolean') P[k] = d ? !(p[k] === false || p[k] === 'false' || p[k] === 0 || p[k] === '0') : (p[k] === true || p[k] === 'true' || p[k] === 1 || p[k] === '1');
      else P[k] = String(p[k]);
    }
    P.strength = clamp(P.strength, 0, 2); P.heat = clamp(P.heat, 0, 8); P.water = clamp(P.water, 0, 10); P.portal = clamp(P.portal, 0, 2);
    P.wave = clamp(P.wave, 0, 40); P.waveRadius = clamp(P.waveRadius, 10, 2000); P.waveWidth = clamp(P.waveWidth, 2, 200); P.waveMs = Math.max(60, P.waveMs);
    P.chroma = clamp(P.chroma, 0, 1); P.shine = clamp(P.shine, 0, 1); P.underwater = clamp(P.underwater, 0, 1); P.uiFeather = clamp(P.uiFeather, 0, 32);
  }
  function mat(list, off, n, fn) {   // 4 slots of 4 floats -> a mat4 (column i = slot i)
    var m = []; for (var i = 0; i < 4; i++) { var v = i + off < n ? fn(list[i + off]) : [0, 0, 0, 0]; m.push(v[0], v[1], v[2], v[3]); } return m;
  }

  // ------------------------------------------------------------------ the no-op instance
  function offInstance(reason, P, post) {
    var api = {
      version: VERSION, active: false, reason: reason, post: post || null, shared: false,
      shockwave: function () { return api; }, clear: function () { return api; },
      render: function (a) { try { if (post && post.render) post.render(a); } catch (e) { } return api; },
      setRegions: function () { return api; }, setUiRects: function () { return api; },
      setParams: function (p) { try { applyParams(P, p || {}); } catch (e) { } return api; },
      params: function () { var o = {}; for (var k in P) o[k] = P[k]; return o; },
      setEnabled: function () { return api; }, liveWaves: function () { return 0; },
      stats: function () { return { active: false, reason: reason, mode: post && post.mode || 'off', frames: 0, drawn: 0, waves: 0, live: 0, regions: 0, passes: [] }; },
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
      if (!GP || !GP.create) { warn('GameDNA_Post (webgl-post.js) is not loaded; distortion off'); return offInstance('no-post', P, null); }
      if (!src) { warn('no canvas given; distortion off'); return offInstance('no-canvas', P, null); }
      var pp = { passes: 'none' }; if (o.postParams) for (k in o.postParams) pp[k] = o.postParams[k];
      try { post = GP.create({ canvas: src, clock: o.clock, params: pp, skin: o.skin }); own = true; } catch (e) { post = null; }
      if (!post) return offInstance('no-post', P, null);
    }
    if (!post.active || !post.addPass) return offInstance(post.reason || 'off', P, post);

    var clock = typeof o.clock === 'function' ? o.clock : null;
    var view = o.view && Number(o.view.w) > 0 && Number(o.view.h) > 0 ? { w: Number(o.view.w), h: Number(o.view.h) } : null;
    function vs() { return view && src && src.width ? [src.width / view.w, src.height / view.h] : [1, 1]; }
    function unit() { return Math.max(0.05, (src && src.height ? src.height : 360) / 360); }   // canvas px per "360-view" unit
    var S = { lastMs: 0, frames: 0, drawn: 0, fired: 0, merged: 0, regions: 0, dropped: 0, regionErrors: 0, uiErrors: 0, errors: 0, uiSig: '', uiCount: 0 };
    var waves = [], cur = { R: [], W: [] };
    function nowMs() {
      if (clock) { try { var v = Number(clock()); if (isFinite(v)) return v; } catch (e) { } }
      try { var st = post.stats(); if (st && isFinite(st.ms)) return st.ms; } catch (e) { }
      return S.lastMs;
    }

    // ---- regions: a function (read once per post frame) or an array, in view units
    var regFn = o.regions || null;
    function readRegions() {
      var list = null, out = [], kk = vs(), u = unit(), cw = src.width || 1, chh = src.height || 1;
      if (regFn) { try { list = typeof regFn === 'function' ? regFn() : regFn; } catch (e) { list = null; S.regionErrors++; } }
      if (P.underwater > 0) out.push({ a: [0, 0, cw, chh], b: [2, P.water * P.underwater * P.strength, 0.5, 0] });
      if (list && list.length) for (var i = 0; i < list.length; i++) {
        var q = list[i]; if (!q) continue;
        var kind = KIND[q.kind] || 0; if (!kind) continue;
        var amt = clamp(num(q.amount, num(q.strength, 1)), 0, 3); if (amt <= 0) continue;
        var x0, y0, x1, y1, ell = q.shape === 'ellipse' || (q.shape !== 'rect' && kind === 3);
        if (isFinite(q.r) && Number(q.r) > 0 && !(q.w > 0)) { var rr = Number(q.r); x0 = q.x - rr; x1 = q.x + rr; y0 = q.y - rr; y1 = q.y + rr; if (q.shape !== 'rect') ell = true; }
        else if (okRect(q)) { x0 = q.x; y0 = q.y; x1 = q.x + q.w; y1 = q.y + q.h; }
        else continue;
        x0 *= kk[0]; x1 *= kk[0]; y0 *= kk[1]; y1 *= kk[1];
        if (!(isFinite(x0) && isFinite(y0) && isFinite(x1) && isFinite(y1))) continue;
        if (x1 <= 0 || y1 <= 0 || x0 >= cw || y0 >= chh) continue;   // off screen
        var base = kind === 1 ? P.heat : kind === 2 ? P.water : P.portal;
        var softDef = Math.min(x1 - x0, y1 - y0) * (kind === 2 ? 0.08 : kind === 1 ? 0.2 : 0.3);
        var soft = q.soft != null && isFinite(q.soft) ? Math.max(0.5, Number(q.soft) * kk[0]) : Math.max(0.5, Math.min(softDef, 24 * u));
        if (out.length >= MAXR) { S.dropped++; continue; }
        out.push({ a: [x0, y0, x1, y1], b: [kind, base * amt * P.strength, soft, ell ? 1 : 0] });
      }
      return out;
    }

    // ---- shockwaves: start time in game ms; everything else is derived from the clock each frame
    function liveWaves(ms) {
      var out = [];
      for (var i = 0; i < waves.length; i++) {
        var w = waves[i], dt = ms - w.t0;
        if (dt < 0 || dt >= w.dur) continue;
        var x = dt / w.dur, e = 1 - Math.pow(1 - x, 3), fade = (1 - x) * (1 - x) * Math.min(1, x / 0.06 + 0.25);
        out.push({ a: [w.x, w.y, Math.max(0.5, w.R * e), w.amp * fade * P.strength], b: [w.wd * (0.55 + 0.9 * x), w.ch, P.shine * 0.5 * fade * Math.min(1.2, w.s), 0] });
      }
      return out;
    }
    function prune(ms) { waves = waves.filter(function (w) { var dt = ms - w.t0; return dt >= 0 && dt < w.dur; }); }
    function shockwave(x, y, opts) {
      try {
        if (x && typeof x === 'object') { opts = x; x = opts.x; y = opts.y; }
        opts = opts || {};
        x = Number(x); y = Number(y);
        if (!isFinite(x) || !isFinite(y)) return api;   // never falls back to the screen centre
        var kk = vs(), u = unit(), s = clamp(num(opts.strength, 1), 0, 1.5);
        if (s <= 0) return api;
        var ms = nowMs(); prune(ms);
        var cx = x * kk[0], cy = y * kk[1];
        for (var i = 0; i < waves.length; i++) {   // the same spot within 3 frames: one wave (a per-frame caller cannot stack 60)
          var w0 = waves[i];
          if (ms - w0.t0 <= 50 && Math.abs(w0.x - cx) < 8 * u && Math.abs(w0.y - cy) < 8 * u) { if (s > w0.s) { w0.s = s; w0.amp = P.wave * u * s; } S.merged++; return api; }
        }
        var R = opts.radius != null && isFinite(opts.radius) ? Number(opts.radius) * kk[0] : P.waveRadius * u * (0.55 + 0.45 * s);
        var wd = opts.width != null && isFinite(opts.width) ? Number(opts.width) * kk[0] : P.waveWidth * u * (0.7 + 0.3 * s);
        var w = { x: cx, y: cy, t0: ms, dur: Math.max(60, num(opts.duration, P.waveMs * (0.8 + 0.2 * s))), R: R, wd: wd, s: s,
          amp: (opts.amplitude != null && isFinite(opts.amplitude) ? Number(opts.amplitude) * kk[0] : P.wave * u * s), ch: clamp(num(opts.chroma, 1), 0, 2) };
        if (waves.length >= MAXW) waves.shift();
        waves.push(w); S.fired++;
      } catch (e) { S.errors++; }
      return api;
    }

    // ---- HUD: an own feather map (g = 1 on a HUD rect, ramping to 0 at uiFeather view px out; r = the rect itself),
    // low resolution, linear, redrawn and uploaded only when the rects change. The shared 'uiMask' (I-08's uiRects or
    // another element) is read as well, but never written: other J elements own that slot.
    var uiFn = o.uiRects || null, dm = null, dg = null;
    function rectFill(g, r, pad) {
      var x0 = r.x - pad, y0 = r.y - pad, w = r.w + 2 * pad, h = r.h + 2 * pad, rad = r.r > 0 ? Math.min(r.r + pad, w / 2, h / 2) : 0;
      if (rad <= 0.5) { g.fillRect(x0, y0, w, h); return; }
      g.beginPath(); g.moveTo(x0 + rad, y0); g.arcTo(x0 + w, y0, x0 + w, y0 + h, rad); g.arcTo(x0 + w, y0 + h, x0, y0 + h, rad);
      g.arcTo(x0, y0 + h, x0, y0, rad); g.arcTo(x0, y0, x0 + w, y0, rad); g.closePath(); g.fill();
    }
    function updateMask() {
      if (!uiFn) { if (dm && S.uiCount) { S.uiCount = 0; S.uiSig = ''; try { post.removeInput('distortMask'); } catch (e) { } } return; }
      var list = null;
      try { list = typeof uiFn === 'function' ? uiFn() : uiFn; } catch (e) { list = null; S.uiErrors++; }
      var rects = [], kk = vs(), i;
      if (list && list.length) for (i = 0; i < list.length && i < 64; i++) if (okRect(list[i])) {
        var q = list[i]; rects.push({ x: q.x * kk[0], y: q.y * kk[1], w: q.w * kk[0], h: q.h * kk[1], r: Math.max(0, +q.r || 0) * kk[0] });
      }
      var W = Math.max(1, src.width | 0), H = Math.max(1, src.height | 0), F = P.uiFeather * kk[0];
      var sig = W + 'x' + H + ':' + Math.round(F * 4) + ':' + rects.map(function (r) { return [Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h), Math.round(r.r)].join(','); }).join(';');
      if (sig === S.uiSig) return;
      S.uiSig = sig; S.uiCount = rects.length;
      try {
        if (!dm) { dm = document.createElement('canvas'); dg = dm.getContext('2d'); }
        var fs = Math.min(1, 320 / W), fw = Math.max(1, Math.round(W * fs)), fh = Math.max(1, Math.round(H * fs)), N = 8;
        if (dm.width !== fw || dm.height !== fh) { dm.width = fw; dm.height = fh; }
        dg.setTransform(1, 0, 0, 1, 0, 0); dg.globalCompositeOperation = 'source-over'; dg.fillStyle = '#000'; dg.fillRect(0, 0, fw, fh);
        dg.setTransform(fs, 0, 0, fs, 0, 0);
        if (F > 0) {
          dg.globalCompositeOperation = 'lighter'; dg.fillStyle = 'rgba(0,255,0,' + (1 / N) + ')';
          for (i = 0; i < rects.length; i++) for (var n = 0; n < N; n++) rectFill(dg, rects[i], F * n / N);
          dg.globalCompositeOperation = 'source-over';
        }
        dg.fillStyle = '#ffff00';
        for (i = 0; i < rects.length; i++) rectFill(dg, rects[i], 0);
        post.setInput('distortMask', dm, { filter: 'linear', live: false });
      } catch (e) { S.errors++; }
    }

    // ---- the pass (band 300-399 of the I-08 order)
    var def = {
      name: NAME, order: 350, scale: 1, inputs: { uUi: 'uiMask', uDm: 'distortMask' }, frag: FRAG, defaults: {}, enabled: P.enabled !== false,
      skip: function (s) {
        try {
          S.lastMs = clock ? nowMs() : s.ms; S.frames++;
          updateMask();
          prune(S.lastMs);
          cur.R = readRegions(); cur.W = liveWaves(S.lastMs);
          S.regions = cur.R.length;
          var idle = !P.enabled || P.strength <= 0 || (!cur.R.length && !cur.W.length);
          if (!idle) S.drawn++;
          return idle;
        } catch (e) { S.errors++; return true; }
      },
      uniforms: function () {
        var R = cur.R, Wv = cur.W, ga = function (q) { return q.a; }, gb = function (q) { return q.b; };
        return {
          uRA0: mat(R, 0, R.length, ga), uRB0: mat(R, 0, R.length, gb), uRA1: mat(R, 4, R.length, ga), uRB1: mat(R, 4, R.length, gb),
          uWA0: mat(Wv, 0, Wv.length, ga), uWB0: mat(Wv, 0, Wv.length, gb), uWA1: mat(Wv, 4, Wv.length, ga), uWB1: mat(Wv, 4, Wv.length, gb),
          uNR: R.length, uNW: Wv.length, uUnit: unit(), uT: (S.lastMs || 0) / 1000, uSnap: P.snap ? 1 : 0,
          uChroma: P.chroma, uShine: P.shine, uDebug: P.debug ? 1 : 0, uTint: rgbOf(tok(P.tint), [1, 0.95, 0.86])
        };
      }
    };
    post.addPass(def);
    var broken = [], g0 = post.get(NAME);
    if (!g0 || g0.error) { broken.push(NAME); warn('distortion pass failed to compile' + (g0 && g0.error ? ': ' + String(g0.error).slice(0, 200) : '')); }

    function setEnabled(on) { P.enabled = on !== false; try { post.enable(NAME, P.enabled); post.render(); } catch (e) { } return api; }
    var api = {
      version: VERSION, active: true, reason: '', post: post, shared: !own,
      shockwave: shockwave,
      liveWaves: function () { return liveWaves(nowMs()).length; },
      clear: function () { waves = []; return api; },
      render: function (a) { try { post.render(a); } catch (e) { } return api; },
      setRegions: function (fn) { regFn = fn || null; return api; },
      setUiRects: function (fn) { uiFn = fn || null; S.uiSig = ''; try { updateMask(); post.render(); } catch (e) { } return api; },
      setParams: function (p) {
        try { var was = P.enabled; applyParams(P, p || {}); if (P.enabled !== was) setEnabled(P.enabled); S.uiSig = ''; post.render(); } catch (e) { }
        return api;
      },
      params: function () { var oo = {}; for (var key in P) oo[key] = P[key]; return oo; },
      setEnabled: setEnabled,
      stats: function () {
        var st = {}; try { st = post.stats() || {}; } catch (e) { }
        return { active: !!post.active, reason: post.reason || '', mode: post.mode, shared: !own, enabled: P.enabled,
          frames: S.frames, drawn: S.drawn, waves: S.fired, merged: S.merged, live: liveWaves(nowMs()).length, regions: S.regions, dropped: S.dropped,
          uiRects: S.uiCount, regionErrors: S.regionErrors, uiErrors: S.uiErrors, errors: S.errors, broken: broken.slice(),
          passes: (st.passes || []).filter(function (n) { return n === NAME; }), postPasses: st.passes || [], w: st.w, h: st.h, avgMs: st.avgMs, lastMs: st.lastMs };
      },
      destroy: function () {
        try { post.removePass(NAME); } catch (e) { }
        try { if (dm) post.removeInput('distortMask'); } catch (e) { }
        try { if (own) post.destroy(); } catch (e) { }
        api.active = false; api.reason = 'destroyed'; return api;
      }
    };
    try { post.render(); } catch (e) { }
    return api;
  }

  root.GameDNA_Distort = { version: VERSION, create: create, defaults: DEFAULTS, passName: NAME, kinds: ['heat', 'water', 'portal'] };
})(typeof window !== 'undefined' ? window : this);
