/* GameDNA J-01 · Dynamic 2D lights & soft shadows · module v1 (plain script, no dependencies, one global)
 *
 *   const lights = GameDNA_Lights.create({
 *     canvas: myCanvas,                              // the game's 2D canvas (the same one I-08 post-processes)
 *     post: post,                                    // optional: the game's GameDNA_Post instance (else shared / created)
 *     clock: () => frameCount * 1000 / 60,           // game time in ms (flicker, flashes, fades)
 *     camera: () => ({ x: camX, y: camY }),          // world point drawn at canvas pixel (0, 0)
 *     solidAt: (tx, ty) => isWall(tx, ty), tile: 16, // occluders from the tile map (and / or rects: () => [...])
 *     uiRects: () => [{ x: 0, y: 0, w: 256, h: 16 }],// HUD stays unlit (canvas px; {soft: px} fades the edge outward)
 *     when: () => scene === 'play',                  // lighting only on world screens
 *     params: { ambient: 0.55, tint: 'dusk', shadows: 'on', softness: 5, glow: 0.35 }
 *   });
 *   lights.add({ follow: () => hero, radius: 90, color: '#ffb066', flicker: 0.2 });   // torch on the hero
 *   lights.flash({ x, y, radius: 70, color: '#ff8040', ms: 300 });                    // explosion / spell
 *   lights.markFar();                                // optional, side-scrollers: right after drawing sky / parallax
 *   lights.render();                                 // once per drawn frame (it calls post.render())
 *
 * The module builds a small light map on a 2D canvas every post frame (radial lights, cones, soft shadows cast by the
 * host's occluders) and composites it in a GameDNA_Post pass at order 200: picture x (ambient + light), with a glow.
 * HUD pixels (uiRects / the shared 'uiMask' input) pass through unchanged. Without WebGL, with ?webgl=0 or ?lights=0,
 * nothing is drawn and the game looks exactly as before. Never throws; time comes only from the game clock.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0', FRAME = 1000 / 60, TAU = Math.PI * 2;
  var MAP_INPUT = 'gamedna-lightmap', FAR_INPUT = 'gamedna-lights-far', ORDER = 200;

  var TINTS = {   // ambient colour presets (normalised to luma 1 in the shader uniforms)
    dusk: '#b9a8e6', night: '#8ea4ff', cave: '#8fc6bc', warm: '#ffd2a0', neutral: '#ffffff'
  };
  var DEFAULTS = {
    lights: 'on',        // 'on' | 'off' (?lights=0 in the URL also turns it off)
    ambient: 0.55,       // brightness where no light reaches, 0 (black) .. 1 (unlit picture)
    tint: 'dusk',        // ambient colour: preset name or '#rrggbb'
    intensity: 1,        // multiplies every light
    radius: 0,           // default light radius in canvas px (0 = 35 % of the shorter canvas side)
    color: '#ffc58a',    // default light colour
    shadows: 'on',       // 'on' | 'off'
    softness: 5,         // area-light radius in canvas px: wider = softer penumbra
    samples: 3,          // shadow samples per light (1 = hard, 3 default, 5 best)
    wallLight: 4,        // px the light enters an occluder (lit wall faces / platform tops)
    blur: 1.5,           // light-map blur in canvas px (hides the light map's own pixels)
    glow: 0.35,          // additive haze near bright lights (scaled by 1 - ambient)
    over: 0.25,          // headroom above the art's own colour where lights add up (0 = lit pixels never brighter than drawn)
    bands: 0,            // 0 = smooth; 3..8 = banded light per game pixel (retro look)
    bandPx: 1,           // banded light: cell size in canvas px (2..4 = chunkier steps on HD canvases)
    emissive: 0,         // 0 = off; else luma threshold above which pixels keep their own brightness
    fade: 300,           // ms of game time to fade lighting in when when() turns true (off is immediate)
    maxLights: 32,       // most lights drawn per frame (nearest to the view first)
    farLight: 0.2,       // share of light that reaches far pixels marked with markFar() (sky, parallax); ambient is unchanged
    mapScale: 0,         // light map px per canvas px (0 = auto: longest side <= 400)
    webgl: 'auto'        // passed to an I-08 instance the module creates itself
  };

  // ------------------------------------------------------------------ helpers
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function warn(msg) { try { if (root.console && console.warn) console.warn('[GameDNA_Lights] ' + msg); } catch (e) { } }
  function urlOff() {
    try { var q = new URLSearchParams(root.location ? root.location.search : ''); var v = q.get('lights'); return v === '0' || v === 'off' || v === 'false'; } catch (e) { return false; }
  }
  function hexRgb(h, d) {
    if (Array.isArray(h) && h.length >= 3) return [num(h[0], 0), num(h[1], 0), num(h[2], 0)];
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h || '').trim());
    if (!m) return d;
    var s = m[1]; if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
  }
  function rgbCss(c, a) { return 'rgba(' + Math.round(clamp(c[0], 0, 1) * 255) + ',' + Math.round(clamp(c[1], 0, 1) * 255) + ',' + Math.round(clamp(c[2], 0, 1) * 255) + ',' + clamp(a, 0, 1).toFixed(4) + ')'; }
  function hashStr(s) { s = String(s); var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
  function h1(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function vnoise(t) { var i = Math.floor(t), f = t - i; f = f * f * (3 - 2 * f); return h1(i) * (1 - f) + h1(i + 1) * f; }   // 0..1, smooth
  var DIRS = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
  function angleOf(v) {
    if (typeof v === 'string') return v in DIRS ? DIRS[v] : NaN;
    if (v && typeof v === 'object') return Math.atan2(num(v.y, 0), num(v.x, 0));
    return num(v, NaN);
  }
  // falloff: alpha at fraction of the radius (smooth, roughly inverse-square, exactly 0 at the rim)
  var FALL = [[0, 1], [0.12, 0.88], [0.3, 0.64], [0.5, 0.38], [0.7, 0.16], [0.87, 0.04], [1, 0]];

  // ------------------------------------------------------------------ GLSL
  var BLUR_FRAG = [
    'uniform vec2 uDir;   // blur step in game px along x or y',
    'void main() {',
    '  vec2 st = uDir / uSrcRes;',
    '  vec3 c = texture2D(uL, vUv).rgb * 0.2270;',
    '  c += (texture2D(uL, vUv + st * 1.3846).rgb + texture2D(uL, vUv - st * 1.3846).rgb) * 0.3162;',
    '  c += (texture2D(uL, vUv + st * 3.2308).rgb + texture2D(uL, vUv - st * 3.2308).rgb) * 0.0703;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');
  var LIGHT_FRAG = [
    'uniform vec3 uAmb; uniform float uGain, uGlow, uFade, uBands, uBandPx, uEmis, uOver, uAmbL, uFarUse, uFarK;',
    'vec3 shoulder(vec3 x) { vec3 k = max(x - 0.8, 0.0); return min(x, vec3(0.8)) + 0.2 * (1.0 - exp(-k / 0.2)); }',
    'void main() {',
    '  vec3 c = texture2D(uPrev, vUv).rgb;',
    '  vec2 luv = vUv;',
    '  if (uBands > 0.5) luv = uvOfGame((floor(gameOfUv(vUv) / uBandPx) + 0.5) * uBandPx);',
    '  vec3 L = texture2D(uL, luv).rgb * uGain;',
    '  if (uBands > 0.5) { float mx = max(max(L.r, L.g), L.b); if (mx > 0.004) { float q = floor(mx * uBands + 0.35) / uBands; L *= q / mx; } }',
    '  if (uFarUse > 0.5) { vec2 fuv = uvOfGame(floor(gameOfUv(vUv)) + 0.5);   // per game pixel: unchanged since markFar() = far layer',
    '    vec3 dv = abs(texture2D(uFrame, fuv).rgb - texture2D(uFar, fuv).rgb);',
    '    float far = 1.0 - smoothstep(0.012, 0.05, max(max(dv.r, dv.g), dv.b)); L *= mix(1.0, uFarK, far); }',
    '  vec3 m = uAmb + L;                                   // light reaching the pixel',
    '  vec3 hi = 1.0 + uOver * (1.0 - exp(-(m - 1.0) / max(uOver, 0.001)));   // above 1: soft headroom of uOver, never blown out',
    '  m = mix(m, uOver > 0.001 ? hi : vec3(1.0), step(1.0, m));',
    '  vec3 Lg = min(L, vec3(1.5));',
    '  vec3 lit = c * m + uGlow * (1.0 - uAmbL) * Lg * Lg * 0.3;   // haze shows in the dark, fades on day scenes',
    '  if (uEmis > 0.0) { float e = smoothstep(uEmis, min(uEmis + 0.12, 1.0), luma(c)); lit = mix(lit, max(lit, c), e); }',
    '  lit = shoulder(lit) + (hash12(gl_FragCoord.xy) - 0.5) / 255.0;',
    '  vec3 o = mix(c, lit, uFade);',
    '  float ui = uMaskOn > 0.5 ? clamp(texture2D(uMask, vUv).r, 0.0, 1.0) : 0.0;',
    '  gl_FragColor = vec4(clamp(mix(o, c, ui), 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  // ------------------------------------------------------------------ create
  var LIVE = [];
  function create(o) {
    o = o || {};
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    applyParams(P, o.params || {});

    var src = o.canvas || (o.post && o.post.source) || null;
    if (typeof src === 'string') { try { src = document.querySelector(src); } catch (e) { src = null; } }
    if (src && src.canvas && src.canvas.getContext) src = src.canvas;

    var clockFn = typeof o.clock === 'function' ? o.clock : null;
    var camOpt = o.camera, solidAt = typeof o.solidAt === 'function' ? o.solidAt : null, rectsOpt = o.rects || o.occluders || null;
    var tileW = 16, tileH = 16;
    if (o.tile && typeof o.tile === 'object') { tileW = num(o.tile.w, 16); tileH = num(o.tile.h, tileW); } else if (o.tile) { tileW = tileH = num(o.tile, 16); }
    tileW = Math.max(1, tileW); tileH = Math.max(1, tileH);
    var uiRectsFn = typeof o.uiRects === 'function' ? o.uiRects : (Array.isArray(o.uiRects) ? function () { return o.uiRects; } : null);
    var whenFn = typeof o.when === 'function' ? o.when : null;

    var S = { alive: true, enabled: true, flushKey: -1, on: false, fade: -1, lastMs: null, built: 0, buildMs: 0, avgBuildMs: 0,
      drawn: 0, culled: 0, edges: 0, errors: 0, lastError: '', warned: {}, mapW: 0, mapH: 0, q: 1, uiSig: '', ms: 0, meanL: 0, renders: 0, farAt: -1 };
    var lights = [], seq = 0;
    var post = null, ownPost = false, reason = '';

    var api = {
      version: VERSION, active: false, mode: 'off', reason: '', post: null, canvas: src,
      add: add, set: setLight, remove: remove, get: getLight, list: list, clear: clearLights, flash: flash,
      render: render, renderNow: renderNow, markFar: markFar,
      setParams: setParams, params: function () { var r = {}; for (var key in P) r[key] = P[key]; return r; },
      setEnabled: function (on) { S.enabled = on !== false; request(); return api; },
      stats: stats, lightMap: function () { return mapCv; }, destroy: destroy
    };

    function once(key, msg) { if (!S.warned[key]) { S.warned[key] = 1; warn(msg); } }
    function nowMs() {
      if (clockFn) { try { var v = Number(clockFn()); if (isFinite(v)) return v; } catch (e) { once('clock', 'clock() threw; using post time'); } }
      return S.ms;
    }

    // ---- lights
    function normLight(d, base) {
      var L = base || { id: null, seed: 0, x: NaN, y: NaN, cache: null, miss: 0, born: null, gone: false };
      d = d || {};
      if (d.id !== undefined && d.id !== null) L.id = d.id;
      if (L.id === null || L.id === undefined) L.id = 'L' + (++seq);
      L.seed = hashStr(L.id) * 1000;
      var keys = ['x', 'y', 'radius', 'intensity', 'flicker', 'speed', 'size', 'life', 'z'];
      for (var i = 0; i < keys.length; i++) if (d[keys[i]] !== undefined) L[keys[i]] = num(d[keys[i]], L[keys[i]]);
      if (d.follow !== undefined) L.follow = d.follow;
      if (d.offset !== undefined) L.offset = d.offset;
      if (d.color !== undefined) L.color = hexRgb(d.color, L.color || hexRgb(P.color, [1, 0.8, 0.6]));
      if (!L.color) L.color = hexRgb(P.color, [1, 0.8, 0.6]);
      if (d.cone !== undefined) L.cone = d.cone || null;
      if (d.shadows !== undefined) L.shadows = d.shadows !== false && d.shadows !== 'off';
      if (L.shadows === undefined) L.shadows = true;
      if (d.screen !== undefined) L.screen = !!d.screen;
      if (d.on !== undefined) L.on = d.on !== false;
      if (L.on === undefined) L.on = true;
      if (d.keep !== undefined) L.keep = !!d.keep;
      if (d.tag !== undefined) L.tag = d.tag;
      if (d.owner !== undefined) L.owner = d.owner;
      return L;
    }
    function add(d) {
      try {
        if (d && d.id !== undefined && d.id !== null) { var old = find(d.id); if (old) return setLight(d.id, d); }
        if (!api.active && lights.length > 200) lights.splice(0, lights.length - 200);   // nothing renders: just bound the list
        var L = normLight(d);
        if (L.life > 0) L.born = d && isFinite(Number(d.start)) ? Number(d.start) : null;   // game ms it began (else stamped on the first build)
        lights.push(L);
        if (lights.length > 400) { lights.splice(0, lights.length - 400); once('many', 'more than 400 lights: oldest dropped (is add() called every frame?)'); }
        request();
        return L.id;
      } catch (e) { return null; }
    }
    function find(id) { for (var i = 0; i < lights.length; i++) if (lights[i].id === id) return lights[i]; return null; }
    function setLight(id, d) { try { var L = find(id); if (!L) return null; normLight(d, L); request(); return L.id; } catch (e) { return null; } }
    function remove(id) { var L = find(id); if (L) lights.splice(lights.indexOf(L), 1); request(); return api; }
    function getLight(id) { var L = find(id); return L ? pub(L) : null; }
    function pub(L) {
      return { id: L.id, x: L.sx, y: L.sy, radius: L.radius > 0 ? L.radius : L.r, drawnRadius: L.r, on: !!(L.on && L.vis), follow: L.follow !== undefined, tag: L.tag, owner: L.owner,
        color: '#' + L.color.map(function (c) { return ('0' + Math.round(clamp(c, 0, 1) * 255).toString(16)).slice(-2); }).join(''),
        intensity: L.intensity === undefined ? 1 : L.intensity, flicker: L.flicker || 0, cone: L.cone || null, flash: L.life > 0, level: L.level || 0 };
    }
    function list() { var r = []; for (var i = 0; i < lights.length; i++) r.push(pub(lights[i])); return r; }
    function clearLights(which) {
      if (which === 'flashes') lights = lights.filter(function (L) { return !(L.life > 0); });
      else lights = [];
      request(); return api;
    }
    function flash(d) {
      d = d || {};
      var e = {}; for (var key in d) e[key] = d[key];
      e.life = Math.max(16, num(d.ms !== undefined ? d.ms : d.life, 260));
      if (e.intensity === undefined) e.intensity = 1.4;
      if (e.id === undefined) e.id = 'F' + (++seq);
      return add(e);
    }

    // ---- resolve a light's canvas position this frame
    function camera() {
      var c = camOpt;
      try { if (typeof c === 'function') c = c(); } catch (e) { c = null; once('camera', 'camera() threw; using the last camera'); return S.cam || { x: 0, y: 0 }; }
      var v = { x: num(c && c.x, 0), y: num(c && c.y, 0) }; S.cam = v; return v;
    }
    function centre(p) {
      if (!p || typeof p !== 'object') return null;
      if (p.dead === true || p.removed === true || p.alive === false) return null;
      var x = num(p.x, NaN), y = num(p.y, NaN);
      if (!isFinite(x) || !isFinite(y)) return undefined;
      if (isFinite(Number(p.w)) && isFinite(Number(p.h))) { x += Number(p.w) / 2; y += Number(p.h) / 2; }
      return { x: x, y: y };
    }
    function resolve(L, cam) {
      var p;
      if (L.follow !== undefined && L.follow !== null) {
        try { p = centre(typeof L.follow === 'function' ? L.follow() : L.follow); }
        catch (e) { p = undefined; once('follow' + L.id, 'follow() of light ' + L.id + ' threw; keeping its last position'); }
        if (p === null) { if (!L.keep) L.gone = true; return false; }   // the actor is gone
        if (p === undefined) {   // bad value: keep the cached anchor for half a second, then hide (never the screen centre)
          if (L.cache && ++L.miss <= 30) p = L.cache; else return false;
        } else { L.cache = p; L.miss = 0; }
      } else {
        if (!isFinite(L.x) || !isFinite(L.y)) return false;
        p = { x: L.x, y: L.y };
      }
      var ox = 0, oy = 0;
      if (L.offset) { var off = L.offset; try { if (typeof off === 'function') off = off(); } catch (e) { off = null; } ox = num(off && off.x, 0); oy = num(off && off.y, 0); }
      L.sx = p.x + ox - (L.screen ? 0 : cam.x); L.sy = p.y + oy - (L.screen ? 0 : cam.y);
      return isFinite(L.sx) && isFinite(L.sy);
    }

    // ---- canvases
    var mapCv = null, mg = null, tCv = null, tg = null, aCv = null, ag = null, maskCv = null, mkg = null, farCv = null;
    function canvas2d(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    function ctx2d(c) { var x = null; try { x = c.getContext('2d', { willReadFrequently: true }); } catch (e) { } return x || c.getContext('2d'); }   // CPU canvases: small, read back now and then
    function ensureCanvases(W, H) {
      var q = P.mapScale > 0 ? clamp(P.mapScale, 0.125, 2) : Math.min(1, 400 / Math.max(W, H));
      var mw = Math.max(8, Math.ceil(W * q)), mh = Math.max(8, Math.ceil(H * q));
      if (!mapCv) { mapCv = canvas2d(mw, mh); mg = ctx2d(mapCv); tCv = canvas2d(mw, mh); tg = ctx2d(tCv); aCv = canvas2d(mw, mh); ag = ctx2d(aCv); }
      if (mapCv.width !== mw || mapCv.height !== mh) { mapCv.width = tCv.width = aCv.width = mw; mapCv.height = tCv.height = aCv.height = mh; }
      S.mapW = mw; S.mapH = mh; S.q = mw / W;
    }

    // ---- occluder edges (canvas px), each {ax, ay, bx, by, nx, ny} with n pointing out of the solid
    function gatherEdges(cam, W, H, reach) {
      var E = [];
      if (P.shadows === 'off') return E;
      if (solidAt) {
        var x0 = cam.x - reach, y0 = cam.y - reach, x1 = cam.x + W + reach, y1 = cam.y + H + reach;
        var tx0 = Math.floor(x0 / tileW) - 1, ty0 = Math.floor(y0 / tileH) - 1, tx1 = Math.floor(x1 / tileW) + 1, ty1 = Math.floor(y1 / tileH) + 1;
        var nx = tx1 - tx0 + 1, ny = ty1 - ty0 + 1;
        if (nx * ny > 40000) { var sh = Math.sqrt(40000 / (nx * ny)); var cx = (tx0 + tx1) / 2, cy = (ty0 + ty1) / 2; nx = Math.floor(nx * sh); ny = Math.floor(ny * sh); tx0 = Math.round(cx - nx / 2); ty0 = Math.round(cy - ny / 2); }
        var G = new Uint8Array(nx * ny), i, j;
        try {
          for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) G[j * nx + i] = solidAt(tx0 + i, ty0 + j) ? 1 : 0;
        } catch (e) { once('solidAt', 'solidAt() threw (' + (e && e.message) + '); shadows from the tile map skipped this frame'); S.errors++; G = null; }
        if (G) {
          var run, t, b, sx = cam.x, sy = cam.y;
          // horizontal boundaries between row j-1 and j
          for (j = 1; j < ny; j++) {
            run = null;
            for (i = 0; i <= nx; i++) {
              t = i < nx ? G[(j - 1) * nx + i] : 0; b = i < nx ? G[j * nx + i] : 0;
              var kind = i < nx && t !== b ? (t ? 1 : -1) : 0;   // 1: solid above (normal down), -1: solid below (normal up)
              if (run && kind !== run.k) { var yy = (ty0 + j) * tileH - sy; E.push({ ax: (tx0 + run.i0) * tileW - sx, ay: yy, bx: (tx0 + i) * tileW - sx, by: yy, nx: 0, ny: run.k }); run = null; }
              if (kind && !run) run = { k: kind, i0: i };
            }
          }
          // vertical boundaries between column i-1 and i
          for (i = 1; i < nx; i++) {
            run = null;
            for (j = 0; j <= ny; j++) {
              t = j < ny ? G[j * nx + i - 1] : 0; b = j < ny ? G[j * nx + i] : 0;
              var kd = j < ny && t !== b ? (t ? 1 : -1) : 0;   // 1: solid on the left (normal right)
              if (run && kd !== run.k) { var xx = (tx0 + i) * tileW - sx; E.push({ ax: xx, ay: (ty0 + run.j0) * tileH - sy, bx: xx, by: (ty0 + j) * tileH - sy, nx: run.k, ny: 0 }); run = null; }
              if (kd && !run) run = { k: kd, j0: j };
            }
          }
        }
      }
      if (rectsOpt) {
        var R = rectsOpt;
        try { if (typeof R === 'function') R = R(); } catch (e) { R = null; once('rects', 'rects() threw; rect occluders skipped'); }
        if (R && R.length) {
          for (var r = 0; r < R.length && r < 2000; r++) {
            var q = R[r]; if (!q) continue;
            var rx = num(q.x, NaN) - (q.screen ? 0 : cam.x), ry = num(q.y, NaN) - (q.screen ? 0 : cam.y), rw = num(q.w, 0), rh = num(q.h, 0);
            if (!isFinite(rx) || !isFinite(ry) || rw <= 0 || rh <= 0) continue;
            if (rx > W + reach || ry > H + reach || rx + rw < -reach || ry + rh < -reach) continue;
            E.push({ ax: rx, ay: ry, bx: rx + rw, by: ry, nx: 0, ny: -1 }, { ax: rx, ay: ry + rh, bx: rx + rw, by: ry + rh, nx: 0, ny: 1 },
                   { ax: rx, ay: ry, bx: rx, by: ry + rh, nx: -1, ny: 0 }, { ax: rx + rw, ay: ry, bx: rx + rw, by: ry + rh, nx: 1, ny: 0 });
          }
        }
      }
      return E;
    }
    function segDist2(px, py, e) {
      var dx = e.bx - e.ax, dy = e.by - e.ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? ((px - e.ax) * dx + (py - e.ay) * dy) / l2 : 0;
      t = clamp(t, 0, 1); var x = e.ax + dx * t - px, y = e.ay + dy * t - py; return x * x + y * y;
    }
    // shadow polygons of the front-facing edges near (lx, ly), drawn as one path in canvas px
    function shadowPath(c, lx, ly, r, E, pen) {
      var far = r * 2 + 8, n = 0;
      c.beginPath();
      for (var i = 0; i < E.length; i++) {
        var e = E[i];
        if ((lx - e.ax) * e.nx + (ly - e.ay) * e.ny <= 0.01) continue;     // light behind or on the edge
        if (segDist2(lx, ly, e) > r * r) continue;
        var ax = e.ax - e.nx * pen, ay = e.ay - e.ny * pen, bx = e.bx - e.nx * pen, by = e.by - e.ny * pen;
        var aa = Math.atan2(ay - ly, ax - lx), ab = Math.atan2(by - ly, bx - lx), d = ab - aa;
        while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
        var steps = Math.max(1, Math.ceil(Math.abs(d) / (Math.PI / 4)));
        c.moveTo(ax, ay); c.lineTo(bx, by);
        for (var s = 0; s <= steps; s++) { var a = ab - d * s / steps; c.lineTo(lx + Math.cos(a) * far, ly + Math.sin(a) * far); }
        c.closePath(); n++;
      }
      return n;
    }

    // ---- the light map (called once per post frame, from the first pass's skip())
    function flickerOf(L, ms) {
      var f = num(L.flicker, 0); if (f <= 0) return [1, 1];
      var t = ms / 1000 * num(L.speed, 1), s = L.seed;
      var n = 0.55 * vnoise(t * 7 + s) + 0.3 * vnoise(t * 15.3 + s * 1.7 + 17) + 0.15 * vnoise(t * 31.7 + s * 2.3 + 5);
      return [1 - f * 0.75 * n, 1 - f * 0.1 * vnoise(t * 4.1 + s * 0.7 + 9)];
    }
    function build(s) {
      var t0 = root.performance && performance.now ? performance.now() : 0;
      var W = src.width || 1, H = src.height || 1;
      var ms = nowMs(); S.ms = ms;
      // fade toward when()
      var want = S.enabled && P.lights !== 'off';
      if (want && whenFn) { try { want = !!whenFn(); } catch (e) { once('when', 'when() threw; lighting stays on'); want = true; } }
      var tgt = want ? 1 : 0;
      if (S.fade < 0 || S.lastMs === null || ms < S.lastMs || P.fade <= 0) S.fade = tgt;
      else if (tgt < S.fade) S.fade = tgt;   // leaving a world screen: off at once (no old lights over the next screen)
      else S.fade = Math.min(tgt, S.fade + (ms - S.lastMs) / Math.max(1, P.fade));   // entering: fade in
      S.lastMs = ms;
      // expire flashes and gone followers
      var keep = [], i;
      for (i = 0; i < lights.length; i++) {
        var L = lights[i];
        if (L.gone) continue;
        if (L.life > 0) { if (L.born === null || ms < L.born) L.born = ms; if (ms - L.born >= L.life) continue; }
        keep.push(L);
      }
      lights = keep;
      S.on = S.fade > 0.001;
      if (!S.on) { S.drawn = 0; return; }

      ensureCanvases(W, H);
      var q = S.q, cam = camera(), defR = P.radius > 0 ? P.radius : Math.round(0.35 * Math.min(W, H));
      mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalCompositeOperation = 'source-over'; mg.globalAlpha = 1;
      mg.fillStyle = '#000'; mg.fillRect(0, 0, S.mapW, S.mapH);

      // which lights: on, positioned, on screen; nearest the view centre first, at most maxLights
      var vis = [], maxR = 0;
      for (i = 0; i < lights.length; i++) {
        var A = lights[i]; A.vis = false; A.level = 0;
        if (!A.on || !resolve(A, cam)) continue;
        if (A.gone) continue;
        var fl = flickerOf(A, ms);
        var r = Math.max(2, (A.radius > 0 ? A.radius : defR) * fl[1]);
        var I = (A.intensity === undefined ? 1 : A.intensity) * P.intensity * fl[0];
        if (A.life > 0) { var age = clamp((ms - A.born) / A.life, 0, 1); I *= (1 - age) * (1 - age); r *= 0.8 + 0.2 * Math.sqrt(1 - age); }
        A.r = r; A.level = I;
        if (I <= 0.004) continue;
        if (A.sx + r < 0 || A.sy + r < 0 || A.sx - r > W || A.sy - r > H) continue;
        A.vis = true; A.d2 = (A.sx - W / 2) * (A.sx - W / 2) + (A.sy - H / 2) * (A.sy - H / 2);
        vis.push(A); if (r > maxR) maxR = r;
      }
      vis.sort(function (a, b) { return a.d2 - b.d2; });
      var cap = Math.max(1, Math.floor(P.maxLights));
      S.culled = Math.max(0, vis.length - cap);
      for (i = cap; i < vis.length; i++) vis[i].vis = false;
      if (vis.length > cap) vis.length = cap;

      var E = vis.length ? gatherEdges(cam, W, H, Math.min(maxR, Math.max(W, H))) : [];
      S.edges = E.length;
      var soft = Math.max(0, P.softness), nS = clamp(Math.round(P.samples), 1, 8), pen = Math.max(0, P.wallLight);

      for (i = 0; i < vis.length; i++) drawLight(vis[i], E, q, nS, soft, pen);
      S.drawn = vis.length; S.built++;

      // mean light factor (for tests and the judge): ambient + 2 x mean map value, on a coarse grid
      if (S.built % 15 === 1) {
        try {
          var d = mg.getImageData(0, 0, S.mapW, S.mapH).data, sum = 0, cnt = 0, stepx = Math.max(1, Math.floor(S.mapW / 16)), stepy = Math.max(1, Math.floor(S.mapH / 16));
          for (var yy = stepy >> 1; yy < S.mapH; yy += stepy) for (var xx = stepx >> 1; xx < S.mapW; xx += stepx) { var o4 = (yy * S.mapW + xx) * 4; sum += (0.2126 * d[o4] + 0.7152 * d[o4 + 1] + 0.0722 * d[o4 + 2]) / 255; cnt++; }
          S.meanL = P.ambient + 2 * (cnt ? sum / cnt : 0);
        } catch (e) { }
      }
      if (t0) { var dt = performance.now() - t0; S.buildMs = dt; S.avgBuildMs = S.built <= 1 ? dt : S.avgBuildMs * 0.95 + dt * 0.05; }
    }
    function drawLight(L, E, q, nS, soft, pen) {
      var r = L.r, lx = L.sx, ly = L.sy, I = clamp(L.level * 0.5, 0, 1);
      var bx0 = Math.max(0, Math.floor((lx - r - soft) * q) - 1), by0 = Math.max(0, Math.floor((ly - r - soft) * q) - 1);
      var bx1 = Math.min(S.mapW, Math.ceil((lx + r + soft) * q) + 1), by1 = Math.min(S.mapH, Math.ceil((ly + r + soft) * q) + 1);
      var bw = bx1 - bx0, bh = by1 - by0; if (bw <= 0 || bh <= 0) return;
      var shadows = L.shadows && P.shadows !== 'off' && E.length > 0;
      var dst = tg;
      dst.setTransform(1, 0, 0, 1, 0, 0); dst.globalAlpha = 1; dst.globalCompositeOperation = 'source-over'; dst.clearRect(bx0, by0, bw, bh);
      dst.setTransform(q, 0, 0, q, 0, 0);
      if (shadows) {
        // coverage: n samples of the area light, each = full disc minus its shadow polygons, averaged
        ag.setTransform(1, 0, 0, 1, 0, 0); ag.globalAlpha = 1; ag.globalCompositeOperation = 'source-over'; ag.clearRect(bx0, by0, bw, bh);
        ag.setTransform(q, 0, 0, q, 0, 0);
        var n = soft > 0.01 ? nS : 1;
        for (var k = 0; k < n; k++) {
          var a = n === 1 ? 0 : (k / n) * TAU + 0.6, sx = lx + (n === 1 ? 0 : Math.cos(a) * soft), sy = ly + (n === 1 ? 0 : Math.sin(a) * soft);
          ag.globalCompositeOperation = 'source-over'; ag.globalAlpha = 1;
          ag.fillStyle = '#fff'; ag.beginPath(); ag.arc(lx, ly, r + soft + 1, 0, TAU); ag.fill();
          ag.globalCompositeOperation = 'destination-out';
          if (shadowPath(ag, sx, sy, r + soft, E, pen)) ag.fill();
          dst.globalCompositeOperation = 'lighter'; dst.globalAlpha = 1 / n;
          dst.setTransform(1, 0, 0, 1, 0, 0); dst.drawImage(aCv, bx0, by0, bw, bh, bx0, by0, bw, bh); dst.setTransform(q, 0, 0, q, 0, 0);
          ag.globalCompositeOperation = 'source-over'; ag.setTransform(1, 0, 0, 1, 0, 0); ag.clearRect(bx0, by0, bw, bh); ag.setTransform(q, 0, 0, q, 0, 0);
        }
        dst.globalAlpha = 1; dst.globalCompositeOperation = 'source-in';
      } else { dst.globalAlpha = 1; dst.globalCompositeOperation = 'source-over'; }
      var gr = dst.createRadialGradient(lx, ly, 0, lx, ly, r);
      for (var f = 0; f < FALL.length; f++) gr.addColorStop(FALL[f][0], rgbCss(L.color, FALL[f][1] * I));
      dst.fillStyle = gr; dst.beginPath(); dst.rect(lx - r - soft - 2, ly - r - soft - 2, (r + soft + 2) * 2, (r + soft + 2) * 2); dst.fill();
      // spotlight: keep only the cone
      if (L.cone) {
        var cone = L.cone, dir = cone.dir;
        try { if (typeof dir === 'function') dir = dir(); } catch (e) { dir = 0; }
        dir = angleOf(dir); if (!isFinite(dir)) dir = 0;
        var half = clamp(num(cone.width !== undefined ? cone.width : cone.angle, 0.9), 0.05, TAU) / 2, sft = clamp(num(cone.soft, 0.25), 0.01, 1.5);
        dst.globalCompositeOperation = 'destination-in';
        if (dst.createConicGradient) {
          var cg = dst.createConicGradient(dir + Math.PI, lx, ly), a0 = 0.5 - (half + sft) / TAU, a1 = 0.5 - half / TAU;
          cg.addColorStop(0, 'rgba(255,255,255,0)'); cg.addColorStop(clamp(a0, 0, 0.5), 'rgba(255,255,255,0)');
          cg.addColorStop(clamp(a1, 0, 0.5), 'rgba(255,255,255,1)'); cg.addColorStop(clamp(1 - a1, 0.5, 1), 'rgba(255,255,255,1)');
          cg.addColorStop(clamp(1 - a0, 0.5, 1), 'rgba(255,255,255,0)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
          dst.fillStyle = cg;
          dst.beginPath(); dst.rect(lx - r - soft - 2, ly - r - soft - 2, (r + soft + 2) * 2, (r + soft + 2) * 2); dst.fill();
        } else {
          dst.fillStyle = '#fff'; dst.beginPath(); dst.moveTo(lx, ly); dst.arc(lx, ly, r + soft + 2, dir - half, dir + half); dst.closePath(); dst.fill();
        }
      }
      mg.globalCompositeOperation = 'lighter'; mg.globalAlpha = 1;
      mg.drawImage(tCv, bx0, by0, bw, bh, bx0, by0, bw, bh);
    }

    // ---- UI mask (white = HUD pixels, left unlit)
    function updateMask() {
      if (!uiRectsFn) return;
      var R = null;
      try { R = uiRectsFn(); } catch (e) { once('uiRects', 'uiRects() threw; HUD mask unchanged'); return; }
      var W = src.width || 1, H = src.height || 1, sig = W + 'x' + H + ':';
      if (R && R.length) for (var i = 0; i < R.length && i < 64; i++) { var q = R[i]; if (q) sig += [Math.round(num(q.x, 0)), Math.round(num(q.y, 0)), Math.round(num(q.w, 0)), Math.round(num(q.h, 0))].join(',') + (q.soft || q.r ? ',' + softOf(q) + ',' + num(q.r, 0) : '') + ';'; }
      if (sig === S.uiSig) return;
      S.uiSig = sig;
      if (!maskCv) { maskCv = canvas2d(W, H); mkg = maskCv.getContext('2d'); }
      if (maskCv.width !== W || maskCv.height !== H) { maskCv.width = W; maskCv.height = H; }
      mkg.globalCompositeOperation = 'source-over'; mkg.globalAlpha = 1;
      mkg.fillStyle = '#000'; mkg.fillRect(0, 0, W, H); mkg.fillStyle = '#fff';
      if (R && R.length) for (var j = 0; j < R.length && j < 64; j++) {
        var r = R[j]; if (!r || !(num(r.w, 0) > 0) || !(num(r.h, 0) > 0)) continue;
        var rx = Math.floor(num(r.x, 0)), ry = Math.floor(num(r.y, 0)), rw = Math.ceil(num(r.w, 0)), rh = Math.ceil(num(r.h, 0)), sf = softOf(r);
        var rad = clamp(num(r.r, 0), 0, Math.min(rw, rh) / 2);
        if (!sf && !rad) { mkg.fillRect(rx, ry, rw, rh); continue; }
        for (var k = sf; k >= 1; k--) { var g = Math.round(255 * (1 - k / (sf + 1))); mkg.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')'; roundRect(mkg, rx - k, ry - k, rw + 2 * k, rh + 2 * k, rad + k); }
        mkg.fillStyle = '#fff'; if (rad) roundRect(mkg, rx, ry, rw, rh, rad); else mkg.fillRect(rx, ry, rw, rh);
      }
      if (post) post.setInput('uiMask', maskCv, { filter: 'nearest', live: false });
    }
    function softOf(q) { return Math.round(clamp(num(q && q.soft, 0), 0, 32)); }
    function roundRect(c, x, y, w, h, rad) {
      rad = Math.min(rad, w / 2, h / 2);
      c.beginPath(); c.moveTo(x + rad, y); c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad);
      c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath(); c.fill();
    }

    // ---- far layer (side-scrollers): the game calls markFar() right after drawing sky / parallax, before the world.
    // Pixels still unchanged at render time are "far": they keep the ambient but get only farLight x the light.
    // Valid only for the frame it was taken in (until the next render() call); without it everything is near.
    function markFar() {
      try {
        if (!api.active || !src) return api;
        var W = src.width || 1, H = src.height || 1;
        if (!farCv) farCv = canvas2d(W, H);
        if (farCv.width !== W || farCv.height !== H) { farCv.width = W; farCv.height = H; }
        var fg = farCv.getContext('2d'); fg.globalCompositeOperation = 'copy'; fg.globalAlpha = 1; fg.drawImage(src, 0, 0);
        S.farAt = S.renders + 1;   // valid for the render() that follows this draw
        post.setInput(FAR_INPUT, farCv, { filter: 'nearest', live: false });
      } catch (e) { S.errors++; }
      return api;
    }

    // ---- passes on the post instance
    function frameState(s) {   // once per post flush: rebuild the light map and the mask
      var key = s ? s.frame : -2;
      if (key === S.flushKey) return S.on;
      S.flushKey = key;
      try { updateMask(); build(s); }
      catch (e) { S.errors++; S.lastError = String(e && e.message || e).slice(0, 200); S.on = false; once('build', 'light map failed: ' + S.lastError); }
      return S.on;
    }
    function installPasses() {
      if (!post || !post.active) return;
      var blurOn = P.blur > 0.05 && !(P.bands > 0);
      post.removePass('lights-blur-h'); post.removePass('lights-blur-v');
      if (blurOn) {
        post.addPass({ name: 'lights-blur-h', order: ORDER, scale: 0.25, branch: true, inputs: { uL: MAP_INPUT }, params: {},
          skip: function (s) { return !frameState(s); },
          uniforms: function () { return { uDir: [P.blur, 0] }; }, frag: BLUR_FRAG });
        post.addPass({ name: 'lights-blur-v', order: ORDER + 1, scale: 0.25, branch: true, inputs: { uL: 'lights-blur-h' }, params: {},
          skip: function (s) { return !frameState(s); },
          uniforms: function () { return { uDir: [0, P.blur] }; }, frag: BLUR_FRAG });
      }
      post.addPass({ name: 'lights', order: ORDER + 2, inputs: { uL: blurOn ? 'lights-blur-v' : MAP_INPUT, uMask: 'uiMask', uFar: FAR_INPUT }, params: {},
        skip: function (s) { return !frameState(s); },
        uniforms: function () {
          var t = hexRgb(TINTS[P.tint] || P.tint, hexRgb(TINTS.dusk));
          var lum = Math.max(0.05, 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2]), a = clamp(P.ambient, 0, 1.5);
          return { uAmb: [t[0] / lum * a, t[1] / lum * a, t[2] / lum * a], uGain: 2, uGlow: Math.max(0, P.glow), uFade: clamp(S.fade, 0, 1),
            uBands: P.bands > 0 ? Math.round(clamp(P.bands, 2, 12)) : 0, uBandPx: Math.round(clamp(num(P.bandPx, 1), 1, 16)), uEmis: P.emissive > 0 ? clamp(P.emissive, 0.05, 0.98) : 0, uOver: clamp(P.over, 0, 1), uAmbL: clamp(a, 0, 1),
            uFarUse: farCv && S.farAt === S.renders ? 1 : 0, uFarK: clamp(num(P.farLight, 0.2), 0, 1) };
        },
        frag: LIGHT_FRAG });
      post.setInput(MAP_INPUT, mapCv || (ensureCanvases(src.width || 1, src.height || 1), mapCv), { filter: 'linear', live: true });
    }

    function request() { try { if (post && post.active) post.render(); } catch (e) { } }
    function render(arg) { S.renders++; try { if (post) post.render(arg); } catch (e) { } return api; }
    function renderNow(arg) { S.renders++; try { if (post) post.renderNow(arg); } catch (e) { } return api; }

    function setParams(p) {
      try {
        var before = { blur: P.blur, bands: P.bands };
        applyParams(P, p || {});
        if (p && (p.blur !== undefined || p.bands !== undefined) && ((P.blur > 0.05 && !(P.bands > 0)) !== (before.blur > 0.05 && !(before.bands > 0)))) installPasses();
        if (p && p.mapScale !== undefined && src) ensureCanvases(src.width || 1, src.height || 1);
        if (post && post.active) post.enable('lights', P.lights !== 'off');
        request();
      } catch (e) { }
      return api;
    }
    function stats() {
      var fl = 0, fo = 0; for (var i = 0; i < lights.length; i++) { if (lights[i].life > 0) fl++; if (lights[i].follow !== undefined) fo++; }
      return { mode: api.mode, active: api.active, reason: api.reason, lights: lights.length, drawn: S.drawn, culled: S.culled, flashes: fl, followers: fo,
        edges: S.edges, builds: S.built, buildMs: Math.round(S.buildMs * 100) / 100, avgBuildMs: Math.round(S.avgBuildMs * 100) / 100,
        fade: Math.round(S.fade * 1000) / 1000, on: S.on, map: S.mapW + 'x' + S.mapH, meanLight: Math.round(S.meanL * 1000) / 1000,
        ambient: P.ambient, errors: S.errors, lastError: S.lastError, ownPost: ownPost, ui: !!uiRectsFn, far: !!(farCv && S.farAt === S.renders) };
    }
    function destroy() {
      S.alive = false; api.active = false; api.reason = 'destroyed';
      try { if (post) { post.removePass('lights'); post.removePass('lights-blur-h'); post.removePass('lights-blur-v'); post.removeInput(MAP_INPUT); if (ownPost) post.destroy(); } } catch (e) { }
      var li = LIVE.indexOf(api); if (li >= 0) LIVE.splice(li, 1);
      return api;
    }

    // ---- attach to a post instance
    if (!src || !src.getBoundingClientRect) { reason = 'no-canvas'; warn('no canvas given; lights off'); }
    else if (P.lights === 'off' || urlOff()) reason = urlOff() ? 'url' : 'option';
    else {
      var Post = root.GameDNA_Post;
      post = o.post && typeof o.post.addPass === 'function' ? o.post : null;
      if (!post && Post && Post.instances) { try { var inst = Post.instances(); for (var n = 0; n < inst.length; n++) if (inst[n].source === src && inst[n].active) { post = inst[n]; break; } } catch (e) { } }
      if (!post && Post && Post.create) {
        try { post = Post.create({ canvas: src, clock: clockFn || undefined, params: { passes: 'none', webgl: P.webgl } }); ownPost = true; } catch (e) { post = null; }
      }
      if (!post) { reason = 'no-post-module'; once('nopost', 'GameDNA_Post (webgl-post.js) is not loaded; lights off'); }
      else if (!post.active) reason = post.reason || 'no-webgl';
    }
    api.post = post;
    if (post && post.active && !reason) {
      api.active = true; api.mode = post.mode || 'webgl';
      ensureCanvases(src.width || 1, src.height || 1);
      installPasses(); updateMask(); request();
    } else { api.reason = reason || 'off'; }
    if (o.lights && o.lights.length) for (var li0 = 0; li0 < o.lights.length; li0++) add(o.lights[li0]);
    LIVE.push(api);
    return api;
  }

  function applyParams(P, p) {
    for (var key in p) {
      if (!(key in DEFAULTS)) continue;
      var d = DEFAULTS[key];
      if (typeof d === 'number') P[key] = num(p[key], P[key]);
      else if (key === 'lights' || key === 'shadows') P[key] = (p[key] === false || p[key] === 'off' || p[key] === 0 || p[key] === '0') ? 'off' : 'on';
      else P[key] = p[key];
    }
  }

  root.GameDNA_Lights = { version: VERSION, create: create, instances: function () { return LIVE.slice(); }, defaults: DEFAULTS, tints: TINTS };
})(typeof window !== 'undefined' ? window : this);
