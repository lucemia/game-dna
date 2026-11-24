/* GameDNA J-02 · Normal-mapped sprite lighting · module v1 (plain script, no dependencies, one global). Needs I-08 webgl-post.js (GameDNA_Post).
 *
 *   const nl = GameDNA_NormalLight.create({
 *     canvas: gameCanvas,                         // the game's 2D canvas (or post: the game's GameDNA_Post instance)
 *     clock: () => frameCount * 1000 / 60,        // game time in ms (flicker, flashes); never Date.now()
 *     camera: () => ({ x: camX, y: camY }),       // world point drawn at view (0, 0), for lights given in world units
 *     view: { w: 640, h: 360 }                    // optional: the units the game draws in when the backing store is scaled
 *   });
 *   // a bitmap sprite with its normal map (L-05): same arguments as ctx.drawImage after the two images
 *   nl.drawSprite(heroImg, heroNormalImg, x, y, w, h);
 *   // a sprite drawn with canvas calls: wrap the existing draw; the module derives its normals from the drawn shape
 *   nl.shape(null, { x: e.x - 20, y: e.y - 44, w: 40, h: 48 }, () => drawEnemy(e));
 *   nl.add({ id: 'torch', x: 300, y: 180, radius: 160, color: '#ffb066', flicker: 0.3 });   // a light (world units)
 *   nl.flash({ x, y, radius: 120, color: '#ffd28a', ms: 280 });                              // a short light on a hit
 *   nl.render();                                  // once per drawn frame (same as post.render(); either is enough)
 *
 * Every sprite drawn through the module also writes its normals into a normal buffer and its colour into an albedo buffer
 * (canvases the size of the game canvas). One I-08 pass ('normal-light', order 250, the scene-light band) relights only
 * those pixels: a key light, up to 8 point lights (its own, plus J-01 GameDNA_Lights lights when present) and a rim light.
 * The relief term keeps a surface that faces the viewer exactly as drawn (factor 1), brightens faces turned toward a
 * light and darkens faces turned away; specular and rim are added on top. Pixels drawn over a sprite afterwards (a tree
 * in front, a HUD box) no longer match the albedo buffer and are left alone. Without WebGL, without GameDNA_Post, with
 * ?webgl=0 / ?normals=0, or for a sprite without a normal map, the sprite is drawn exactly as before. Never throws.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0';
  var NAME = 'normal-light', NIN = 'nlNormal', AIN = 'nlAlbedo';
  var MAXL = 8;
  var DEFAULTS = {
    preset: 'daylight',   // a starting set ('daylight', 'dusk', 'night', 'soft'); keys given beside it override it
    strength: 1.4,        // 0..2: relief (how much faces turned to / from a light brighten / darken, in exposure stops)
    key: 0.6,             // 0..1.5: directional key light (the sun, the moon, the room's main light)
    keyAngle: 225,        // degrees, the screen direction the key light comes FROM (0 right, 90 down, 225 up-left)
    keyHeight: 0.35,      // 0.1 (raking, long relief) .. 0.95 (from the viewer, flat)
    keyColor: '#ffd9a0',  // faces toward the key are tinted this (hue only: brightness comes from the relief)
    shadowColor: '#7f9cff', // faces turned away are tinted this (a cool sky ambient)
    warmth: 0.6,          // 0..2: how strongly key / shadow colours tint (0 = brightness only)
    points: 1,            // 0..2: point lights (own lights, flashes and J-01 lights)
    lightHeight: 30,      // view px: how high point lights hang above the sprites (low = long relief, high = flat)
    backside: 1,          // 0..1: share of the darkening that faces turned away from a light get
    fill: 0.35,           // 0..1.5: extra light on faces turned toward a point light (never on faces toward the viewer)
    specular: 0.25,       // 0..1.5: glints on curved edges turned toward a light
    gloss: 18,            // 2..64: glint tightness
    rim: 0.7,             // 0..1.5: rim light on silhouette edges (multiplies the edge colour)
    rimColor: '#bfe0ff',
    rimAngle: 315,        // degrees, the screen direction the rim light comes FROM (default up-right: behind the sprite, across from the key; never the feet)
    rimWidth: 2.5,        // 1 (wide) .. 6 (thin edge)
    pointRim: 0.6,        // 0..1.5: rim light a point light puts on the edges that face it
    bevel: 8,             // view px: how far in from the edge a drawn shape rounds off (derived normals)
    detail: 0.2,          // 0..1: how much the shape's own shading bumps its derived normals
    overdraw: true,       // pixels drawn over a sprite later (not through the module) stay unlit
    normalFormat: 'auto', // bitmap maps: 'auto' = L-05 'nh2' when the map is twice as wide as the sprite, else 'gl' (green = up); 'dx' = green down
    lights: 'auto',       // 'auto' = also read J-01 GameDNA_Lights on the same post; 'own' = only lights added here
    maxPixels: 1600000,   // normal / albedo buffers are scaled down above this many pixels
    compare: 0,           // 0..1: pixels left of this share of the width are left flat (a before / after split)
    debug: 'off',         // 'normals' shows the normal buffer, 'coverage' the lit area
    enabled: true
  };
  // presets: daylight = the defaults (a lamp-less game lit by the sun: warm key from up-left, cool shadows, bright rim)
  var PRESETS = {
    daylight: {},
    dusk: { strength: 1.2, key: 0.35, keyHeight: 0.5, keyColor: '#ffc890', shadowColor: '#8a7cff', warmth: 0.5, fill: 0.4, pointRim: 0.9, rim: 0.45, specular: 0.4 },
    night: { strength: 1.2, key: 0.2, keyHeight: 0.6, keyColor: '#a8bcff', shadowColor: '#5a6aa8', warmth: 0.5, fill: 0.5, pointRim: 0.9, rim: 0.4, specular: 0.4 },
    soft: { strength: 0.8, key: 0.7, keyHeight: 0.5, warmth: 0.35, rim: 0.4, specular: 0.15, bevel: 9 }
  };


  // ------------------------------------------------------------------ GLSL (ES 1.00; the I-08 prelude is added)
  // Energy-neutral, multiplicative model (v1.1): the relief uses only the sideways part of the normal (n.xy . L.xy), so a
  // face toward the viewer is unchanged and a round sprite keeps about its mean brightness; it scales the colour in log space
  // (x (1 + 0.7 e), symmetric toward and away) and tints by luminance-normalised colours (warm key, cool shadow), so saturation is kept and
  // nothing is lifted toward grey. Lamp fill, rim and glints only brighten faces / edges turned toward their light.
  var FRAG = [
    'uniform mat4 uLA0, uLA1, uLB0, uLB1;   // point lights (columns): A = (x, y, radius, height) canvas px; B = (r, g, b, on) x intensity',
    'uniform vec3 uKeyL, uKeyT, uShT, uRimT, uLampT;',
    'uniform vec2 uRimD;',
    'uniform float uKey, uStr, uSpec, uGloss, uRimP, uRim, uPtRim, uOver, uDebug, uFill, uCmp, uBack;',
    'void pointLight(vec3 n, float gs, vec2 p, vec4 a, vec4 b, inout vec3 rel, inout vec3 add, inout vec3 hi) {',
    '  if (b.w < 0.5) return;',
    '  vec2 d = a.xy - p; float dist = length(d);',
    '  if (dist >= a.z) return;',
    '  float at = 1.0 - dist / a.z; at *= at;',
    '  vec3 L = normalize(vec3(d, a.w));',
    '  float r = dot(n.xy, L.xy);',
    '  rel += b.rgb * at * r;',
    '  add += b.rgb * at * max(r, 0.0) * uFill;',
    '  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));',
    '  float sp = max(pow(max(dot(n, H), 0.0), uGloss) - pow(H.z, uGloss), 0.0);',
    '  vec2 nx = n.xy / max(length(n.xy), 1e-4), dx = d / max(dist, 1e-4);',
    '  float rv = pow(clamp(1.0 - n.z, 0.0, 1.0), uRimP) * max(dot(nx, dx), 0.0);',
    '  hi += b.rgb * at * (uSpec * sp * gs + uPtRim * rv);',
    '}',
    'vec3 back(vec3 e) { return vec3(e.r < 0.0 ? e.r * uBack : e.r, e.g < 0.0 ? e.g * uBack : e.g, e.b < 0.0 ? e.b * uBack : e.b); }',
    'void main() {',
    '  vec4 c = texture2D(uPrev, vUv);',
    '  if (uNrmOn < 0.5 || uAlbOn < 0.5 || vUv.x < uCmp) { gl_FragColor = c; return; }',
    '  vec4 al = texture2D(uAlb, vUv);',
    '  float cov = al.a;',
    '  if (cov < 0.003 && uDebug < 0.5) { gl_FragColor = c; return; }   // most of the screen: one extra fetch, then out',
    '  if (uUiOn > 0.5) cov *= 1.0 - smoothstep(0.4, 0.6, texture2D(uUi, vUv).r);',
    '  if (uOver > 0.5) {',
    '    vec3 df = abs(texture2D(uFrame, vUv).rgb - al.rgb);',
    '    cov *= 1.0 - smoothstep(0.07, 0.2, max(df.r, max(df.g, df.b)));',
    '  }',
    '  vec3 nb = texture2D(uNrm, vUv).rgb;',
    '  vec2 nxy = nb.rg * 2.0 - 1.0; float q = dot(nxy, nxy); if (q > 1.0) { nxy /= sqrt(q); q = 1.0; }',
    '  vec3 n = vec3(nxy, sqrt(1.0 - q));',
    '  float gs = nb.b * 2.0;   // gloss mask (0..1 stored, 0.5 = plain)',
    '  if (uDebug > 0.5) { gl_FragColor = vec4(uDebug > 1.5 ? mix(c.rgb * 0.35, vec3(1.0, 0.85, 0.2), cov) : mix(c.rgb * 0.35, vec3(n.xy * vec2(0.5, -0.5) + 0.5, n.z), step(0.01, al.a)), 1.0); return; }',
    '  if (cov < 0.003) { gl_FragColor = c; return; }',
    '  vec2 p = gameOfUv(vUv);',
    '  // key light: e > 0 toward it (warm), e < 0 away (cool), 0 for a face toward the viewer',
    '  float ek = uStr * uKey * dot(n.xy, uKeyL.xy);',
    '  if (ek < 0.0) ek *= uBack;',
    '  vec3 tint = ek > 0.0 ? mix(vec3(1.0), uKeyT, min(ek, 1.0)) : mix(vec3(1.0), uShT, min(-ek, 1.0));',
    '  vec3 Hk = normalize(uKeyL + vec3(0.0, 0.0, 1.0));',
    '  vec3 hi = uKeyT * uKey * uSpec * gs * max(pow(max(dot(n, Hk), 0.0), uGloss) - pow(Hk.z, uGloss), 0.0);',
    '  vec3 rel = vec3(0.0), add = vec3(0.0);',
    '  pointLight(n, gs, p, uLA0[0], uLB0[0], rel, add, hi); pointLight(n, gs, p, uLA0[1], uLB0[1], rel, add, hi);',
    '  pointLight(n, gs, p, uLA0[2], uLB0[2], rel, add, hi); pointLight(n, gs, p, uLA0[3], uLB0[3], rel, add, hi);',
    '  pointLight(n, gs, p, uLA1[0], uLB1[0], rel, add, hi); pointLight(n, gs, p, uLA1[1], uLB1[1], rel, add, hi);',
    '  pointLight(n, gs, p, uLA1[2], uLB1[2], rel, add, hi); pointLight(n, gs, p, uLA1[3], uLB1[3], rel, add, hi);',
    '  vec3 e = vec3(ek) + back(uStr * rel);',
    '  vec3 lit = c.rgb * max(vec3(1.0) + 0.7 * clamp(e, -1.5, 1.5), vec3(0.2)) * tint * (1.0 + add);   // linear: a round sprite keeps its mean',
    '  vec2 nx = n.xy / max(length(n.xy), 1e-4);',
    '  float rr = uRim * pow(clamp(1.0 - n.z, 0.0, 1.0), uRimP) * max(dot(nx, uRimD), 0.0);',
    '  lit *= 1.0 + rr * uRimT;                  // rim: the edge brightens in the rim colour, keeping its own hue',
    '  lit += (uRimT * rr * 0.10 + hi * 0.5) * (0.4 + 0.6 * c.rgb);   // a little light on dark outlines, glints tinted by the surface',
    '  float m = max(lit.r, max(lit.g, lit.b));   // a soft shoulder on the brightest channel, applied to all three: no clipping to white',
    '  if (m > 0.8) lit *= (0.8 + 0.2 * (1.0 - exp(-(m - 0.8) / 0.2))) / m;',
    '  lit += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;',
    '  gl_FragColor = vec4(mix(c.rgb, clamp(lit, 0.0, 1.0), clamp(cov, 0.0, 1.0)), 1.0);',
    '}'
  ].join('\n');

  // ------------------------------------------------------------------ helpers
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var warned = {};
  function warn(m) { if (warned[m]) return; warned[m] = 1; try { console.warn('[GameDNA_NormalLight] ' + m); } catch (e) { } }
  function rgbOf(c, d) {
    if (Array.isArray(c) && c.length >= 3) return [c[0] > 1 ? c[0] / 255 : c[0], c[1] > 1 ? c[1] / 255 : c[1], c[2] > 1 ? c[2] / 255 : c[2]];
    if (typeof c !== 'string') return d;
    var s = c.trim(), m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(s))) { var t = m[1]; return [parseInt(t[0] + t[0], 16) / 255, parseInt(t[1] + t[1], 16) / 255, parseInt(t[2] + t[2], 16) / 255]; }
    if ((m = /^#([0-9a-f]{6})/i.exec(s))) { var h = m[1]; return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; }
    if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s))) return [num(m[1], 0) / 255, num(m[2], 0) / 255, num(m[3], 0) / 255];
    return d;
  }
  // a colour scaled to luminance 1 (a hue shift that keeps brightness), blended toward white by (1 - amount)
  function normTint(c, d, amount) {
    var v = rgbOf(c, d), l = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2], k = clamp(num(amount, 1), 0, 2);
    if (!(l > 0.01)) return [1, 1, 1];
    return [1 + (v[0] / l - 1) * k, 1 + (v[1] / l - 1) * k, 1 + (v[2] / l - 1) * k];
  }
  function urlOff() {
    try { var q = new URLSearchParams(root.location.search); return q.get('webgl') === '0' || q.get('normals') === '0'; } catch (e) { return false; }
  }
  function canvas2d(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  function ctxRead(c) { var x = null; try { x = c.getContext('2d', { willReadFrequently: true }); } catch (e) { } return x || c.getContext('2d'); }
  function okBox(b) { return b && isFinite(b.x) && isFinite(b.y) && isFinite(b.w) && isFinite(b.h) && b.w > 0 && b.h > 0; }

  // ------------------------------------------------------------------ normals from a drawn shape (alpha distance field + luminance, Sobel)
  // RGBA (straight alpha) of w x h -> normal RGBA: R = x right, G = y DOWN, B = z toward the viewer, A = how solid to write it.
  var POOL = { n: 0, D: null, H: null, G: null };
  function pool(n) {
    if (POOL.n < n) { POOL.n = n; POOL.D = new Float32Array(n); POOL.H = new Float32Array(n); POOL.G = new Float32Array(n); }
    return POOL;
  }
  function deriveInto(src, w, h, bevel, detail, out, std) {
    var N = w * h, P = pool(N), D = P.D, H = P.H, G = P.G, x, y, i, INF = 1e6, B = Math.max(0.75, bevel);
    // chamfer distance to the outside (alpha < 0.5); the region border counts as outside
    for (i = 0; i < N; i++) D[i] = src[i * 4 + 3] >= 128 ? INF : 0;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x; if (D[i] === 0) continue;
      var v = (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? 1 : INF;
      if (x > 0) v = Math.min(v, D[i - 1] + 1);
      if (y > 0) { v = Math.min(v, D[i - w] + 1); if (x > 0) v = Math.min(v, D[i - w - 1] + 1.414); if (x < w - 1) v = Math.min(v, D[i - w + 1] + 1.414); }
      D[i] = v;
    }
    for (y = h - 1; y >= 0; y--) for (x = w - 1; x >= 0; x--) {
      i = y * w + x; if (D[i] === 0) continue;
      var u = D[i];
      if (x < w - 1) u = Math.min(u, D[i + 1] + 1);
      if (y < h - 1) { u = Math.min(u, D[i + w] + 1); if (x < w - 1) u = Math.min(u, D[i + w + 1] + 1.414); if (x > 0) u = Math.min(u, D[i + w - 1] + 1.414); }
      D[i] = u;
    }
    // height: a rounded (quarter-circle) bevel of B px, plus the drawn shading as small bumps
    var det = clamp(detail, 0, 1) * B * 0.55;
    for (i = 0; i < N; i++) {
      var d = D[i];
      if (d <= 0) { H[i] = 0; continue; }
      var t = Math.min(1, (d - 0.5) / B); if (t < 0) t = 0;
      var o = i * 4, lum = (0.2126 * src[o] + 0.7152 * src[o + 1] + 0.0722 * src[o + 2]) / 255;
      H[i] = B * Math.sqrt(1 - (1 - t) * (1 - t)) + det * (lum - 0.5) * Math.min(1, t * 2 + 0.2);
    }
    // soften the steps of the distance field: one 3x3 box blur
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var s = 0, c = 0;
      for (var yy = y - 1; yy <= y + 1; yy++) { if (yy < 0 || yy >= h) continue; for (var xx = x - 1; xx <= x + 1; xx++) { if (xx < 0 || xx >= w) continue; s += H[yy * w + xx]; c++; } }
      G[y * w + x] = s / c;
    }
    // a second 3x3 pass (5x5 in all): no ridges where overlapping circles or flat fills meet
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var s2 = 0, c2 = 0;
      for (var y2 = y - 1; y2 <= y + 1; y2++) { if (y2 < 0 || y2 >= h) continue; for (var x2 = x - 1; x2 <= x + 1; x2++) { if (x2 < 0 || x2 >= w) continue; s2 += G[y2 * w + x2]; c2++; } }
      H[y * w + x] = s2 / c2;
    }
    for (i = 0; i < N; i++) G[i] = H[i];
    // Sobel -> normal (heights are in px, so the slope is geometric)
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x;
      var a = src[i * 4 + 3];
      var xm = x > 0 ? x - 1 : x, xp = x < w - 1 ? x + 1 : x, ym = y > 0 ? y - 1 : y, yp = y < h - 1 ? y + 1 : y;
      var tl = G[ym * w + xm], tc = G[ym * w + x], tr = G[ym * w + xp], ml = G[y * w + xm], mr = G[y * w + xp], bl = G[yp * w + xm], bc = G[yp * w + x], br = G[yp * w + xp];
      var gx = ((tr + 2 * mr + br) - (tl + 2 * ml + bl)) / 8, gy = ((bl + 2 * bc + br) - (tl + 2 * tc + tr)) / 8;
      if (a > 0 && a < 128 && G[i] < 0.05) {   // the anti-aliased rim outside the solid shape: point it outward
        var ox = 0, oy = 0;
        if (xm !== x && src[(y * w + xm) * 4 + 3] >= 128) ox -= 1; if (xp !== x && src[(y * w + xp) * 4 + 3] >= 128) ox += 1;
        if (ym !== y && src[(ym * w + x) * 4 + 3] >= 128) oy -= 1; if (yp !== y && src[(yp * w + x) * 4 + 3] >= 128) oy += 1;
        gx = ox * 2; gy = oy * 2;
      }
      var nx = -gx, ny = -gy, nz = 1, L = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= L; ny /= L; nz /= L;
      var q = i * 4;
      out[q] = Math.round((nx * 0.5 + 0.5) * 255); out[q + 1] = Math.round((ny * 0.5 + 0.5) * 255); out[q + 2] = std ? Math.round((nz * 0.5 + 0.5) * 255) : 128;
      out[q + 3] = a >= 64 ? 255 : a * 4;
    }
    return out;
  }

  // a normal map from any image or canvas (straight alpha), y-down ('dx') encoding; null if it cannot be read (cross-origin)
  function deriveCanvas(img, opts) {
    opts = opts || {};
    try {
      var w = img.naturalWidth || img.videoWidth || img.width, h = img.naturalHeight || img.videoHeight || img.height;
      if (!(w > 0 && h > 0)) return null;
      var c = canvas2d(w, h), g = ctxRead(c);
      g.drawImage(img, 0, 0);
      var id = g.getImageData(0, 0, w, h), out = g.createImageData(w, h);
      deriveInto(id.data, w, h, num(opts.bevel, 6), num(opts.detail, 0.3), out.data, !opts.buffer);
      g.putImageData(out, 0, 0);
      return c;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------------ the 2D context "tee": while a shape is open, every
  // drawing call and state change on the game's context is also made on a scratch canvas (same transform, minus the shape's
  // device-pixel origin). The game's own drawing is untouched: the original methods run first, with the same arguments.
  var PROTO = (root.CanvasRenderingContext2D && root.CanvasRenderingContext2D.prototype) || null;
  var PROPS = ['fillStyle', 'strokeStyle', 'globalAlpha', 'globalCompositeOperation', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit',
    'lineDashOffset', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY', 'font', 'textAlign', 'textBaseline', 'direction',
    'imageSmoothingEnabled', 'imageSmoothingQuality', 'filter', 'letterSpacing', 'wordSpacing', 'fontKerning', 'textRendering'];
  var METHODS = ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo',
    'ellipse', 'rect', 'roundRect', 'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'drawImage',
    'setLineDash', 'translate', 'scale', 'rotate', 'transform'];
  function protoDesc(p) { var o = PROTO; while (o) { var d = Object.getOwnPropertyDescriptor(o, p); if (d) return d; o = Object.getPrototypeOf(o); } return null; }

  // ------------------------------------------------------------------ off instance
  function offInstance(reason, P, post, ctx) {
    var api = {
      version: VERSION, active: false, reason: reason, post: post || null, shared: false,
      drawSprite: function (img) {
        try { if (ctx && img) ctx.drawImage.apply(ctx, [img].concat(Array.prototype.slice.call(arguments, 2))); } catch (e) { }
        return api;
      },
      shape: function (key, box, fn) { if (typeof fn === 'function') fn(); return api; },
      begin: function () { return api; }, end: function () { return api; },
      add: function () { return null; }, set: function () { return null; }, remove: function () { return api; }, flash: function () { return null; },
      clear: function () { return api; }, list: function () { return []; }, lightsNow: function () { return []; },
      render: function (a) { try { if (post && post.render) post.render(a); } catch (e) { } return api; },
      renderNow: function (a) { try { if (post && post.renderNow) post.renderNow(a); } catch (e) { } return api; },
      setParams: function (p) { try { applyParams(P, p || {}); } catch (e) { } return api; },
      params: function () { var o = {}; for (var k in P) o[k] = P[k]; return o; },
      setEnabled: function () { return api; }, forget: function () { return api; },
      drawnBoxes: function () { return []; },
      stats: function () { return { active: false, reason: reason, mode: post && post.mode || 'off', frames: 0, lit: 0, shapes: 0, sprites: 0, passes: [] }; },
      destroy: function () { return api; }
    };
    return api;
  }

  function applyParams(P, p) {
    if (p && p.preset && PRESETS[p.preset]) { var pr = PRESETS[p.preset]; for (var k0 in DEFAULTS) if (k0 !== 'enabled' && k0 !== 'compare' && k0 !== 'debug' && typeof DEFAULTS[k0] !== 'boolean' && k0 !== 'lights' && k0 !== 'maxPixels' && k0 !== 'normalFormat') P[k0] = k0 in pr ? pr[k0] : DEFAULTS[k0]; P.preset = p.preset; }
    for (var key in p) {
      if (key === 'preset') continue;
      if (!(key in DEFAULTS)) continue;
      var d = DEFAULTS[key];
      if (typeof d === 'number') P[key] = num(p[key], P[key]);
      else if (typeof d === 'boolean') P[key] = !(p[key] === false || p[key] === 'off' || p[key] === 0 || p[key] === '0' || p[key] === 'false');
      else if (p[key] != null) P[key] = String(p[key]);
    }
  }

  // ------------------------------------------------------------------ create
  function create(o) {
    o = o || {};
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    try { applyParams(P, o.params || {}); } catch (e) { }

    var GP = root.GameDNA_Post;
    var src = o.canvas || null;
    if (typeof src === 'string') { try { src = document.querySelector(src); } catch (e) { src = null; } }
    if (src && src.canvas && src.canvas.getContext) src = src.canvas;
    var post = o.post && typeof o.post.addPass === 'function' ? o.post : null, own = false;
    if (!src && post && post.source) src = post.source;
    var ctx = null;
    if (o.ctx && o.ctx.drawImage) ctx = o.ctx;
    else if (o.canvas && o.canvas.drawImage) ctx = o.canvas;
    else if (src && src.getContext) { try { ctx = src.getContext('2d'); } catch (e) { ctx = null; } }
    if (!post && src && GP && GP.instances) {   // share the game's GameDNA_Post if it already made one for this canvas
      try { var L0 = GP.instances(); for (var i0 = 0; i0 < L0.length; i0++) if (L0[i0].source === src) { post = L0[i0]; break; } } catch (e) { }
    }
    if (P.enabled === false && o.params && o.params.enabled === false) { /* created switched off: still attach, setEnabled can turn it on */ }
    if (urlOff()) return offInstance('url', P, post, ctx);
    if (!post) {
      if (!GP || !GP.create) { warn('GameDNA_Post (webgl-post.js) is not loaded; normal lighting off'); return offInstance('no-post', P, null, ctx); }
      if (!src) { warn('no canvas given; normal lighting off'); return offInstance('no-canvas', P, null, ctx); }
      try { post = GP.create({ canvas: src, clock: o.clock, params: { passes: 'none' } }); own = true; } catch (e) { post = null; }
      if (!post) return offInstance('no-post', P, null, ctx);
    }
    if (!post.active || !post.addPass) return offInstance(post.reason || 'no-webgl', P, post, ctx);
    if (!ctx || !PROTO) return offInstance('no-context', P, post, ctx);

    var clock = typeof o.clock === 'function' ? o.clock : null;
    var camFn = typeof o.camera === 'function' ? o.camera : null;
    var view = o.view && Number(o.view.w) > 0 && Number(o.view.h) > 0 ? { w: Number(o.view.w), h: Number(o.view.h) } : null;
    var j01 = o.lights && typeof o.lights.list === 'function' ? o.lights : null;
    function vs() { return view && src && src.width ? [src.width / view.w, src.height / view.h] : [1, 1]; }
    var S = { frames: 0, lit: 0, shapes: 0, sprites: 0, frameShapes: 0, frameSprites: 0, derived: 0, cacheHits: 0, deriveMs: 0, avgDeriveMs: 0,
      unbalanced: 0, tainted: 0, noNormal: 0, errors: 0, consumed: true, bufMs: null, lastMs: 0, lights: 0, j01: 0, offscreen: 0, boxes: [], lastBoxes: [] };

    function nowMs() {
      if (clock) { try { var v = Number(clock()); if (isFinite(v)) return v; } catch (e) { } }
      try { var st = post.stats(); if (st && isFinite(st.ms)) return st.ms; } catch (e) { }
      return S.lastMs;
    }

    // ---- buffers: normals (opaque, cleared to the flat normal) and albedo (the sprites' own colours, alpha = coverage)
    var nCv = null, nG = null, aCv = null, aG = null, Q = 1;
    function ensureBuffers() {
      var W = Math.max(1, src.width | 0), H = Math.max(1, src.height | 0);
      var q = Math.min(1, Math.sqrt(Math.max(10000, P.maxPixels) / (W * H)));
      var bw = Math.max(1, Math.round(W * q)), bh = Math.max(1, Math.round(H * q));
      if (!nCv) { nCv = canvas2d(bw, bh); nG = nCv.getContext('2d'); aCv = canvas2d(bw, bh); aG = aCv.getContext('2d'); }
      if (nCv.width !== bw || nCv.height !== bh) { nCv.width = bw; nCv.height = bh; aCv.width = bw; aCv.height = bh; }
      Q = bw / W;
    }
    function clearBuffers() {
      ensureBuffers();
      nG.setTransform(1, 0, 0, 1, 0, 0); nG.globalAlpha = 1; nG.globalCompositeOperation = 'source-over';
      nG.fillStyle = 'rgb(128,128,255)'; nG.fillRect(0, 0, nCv.width, nCv.height);
      aG.setTransform(1, 0, 0, 1, 0, 0); aG.globalAlpha = 1; aG.globalCompositeOperation = 'source-over';
      aG.clearRect(0, 0, aCv.width, aCv.height);
    }
    // a new frame starts at the first sprite after the post frame used the buffers (or when the game clock moved)
    function frameStart() {
      var ms = nowMs();
      var w0 = nCv ? nCv.width : 0, h0 = nCv ? nCv.height : 0;
      ensureBuffers();
      if (S.consumed || S.bufMs === null || ms !== S.bufMs || nCv.width !== w0 || nCv.height !== h0) {
        clearBuffers(); S.consumed = false; S.bufMs = ms; S.frameShapes = 0; S.frameSprites = 0; S.boxes = [];
      }
    }

    // ---- bitmap normal maps: converted once per (image, format, flip) to y-down, so a cross-origin map is caught here
    var conv = typeof WeakMap === 'function' ? new WeakMap() : null, safeImg = typeof WeakMap === 'function' ? new WeakMap() : null;
    function readable(img) {
      if (!safeImg) return false;
      var v = safeImg.get(img); if (v !== undefined) return v;
      try { var t = canvas2d(1, 1), g = t.getContext('2d'); g.drawImage(img, 0, 0, 1, 1); g.getImageData(0, 0, 1, 1); v = true; } catch (e) { v = false; S.tainted++; warn('an image cannot be read (cross-origin without CORS): drawn without lighting'); }
      safeImg.set(img, v); return v;
    }
    // -> the buffer format: R = nx, G = ny (screen y down), B = gloss (0.5 = plain), alpha = the colour image's alpha.
    // fmt: 'nh2' (L-05: [normal | material], twice as wide, y up, gloss in the material's B), 'gl' (y up), 'dx' (y down), 'buf' (already converted).
    function converted(nimg, img, fmt, fx, fy) {
      if (!conv) return null;
      var m = conv.get(nimg); if (!m) { m = {}; conv.set(nimg, m); }
      var key = fmt + (fx ? 'X' : '') + (fy ? 'Y' : '');
      if (m[key] !== undefined) return m[key];
      var out = null;
      try {
        var w = nimg.naturalWidth || nimg.videoWidth || nimg.width, h = nimg.naturalHeight || nimg.videoHeight || nimg.height;
        var iw = img ? (img.naturalWidth || img.videoWidth || img.width) : 0, ih = img ? (img.naturalHeight || img.videoHeight || img.height) : 0;
        if (w > 0 && h > 0) {
          var nh2 = fmt === 'nh2', ow = nh2 ? Math.floor(w / 2) : w;
          var c = canvas2d(w, h), g = ctxRead(c); g.drawImage(nimg, 0, 0);
          var d = g.getImageData(0, 0, w, h).data, A = null;
          if (img && fmt !== 'buf') {   // alpha from the colour image (an opaque map would paint flat normals over its neighbours)
            var ac = canvas2d(ow, h), agc = ctxRead(ac); agc.drawImage(img, 0, 0, iw, ih, 0, 0, ow, h); A = agc.getImageData(0, 0, ow, h).data;
          }
          var oc = canvas2d(ow, h), og = ctxRead(oc), od = og.createImageData(ow, h), o2 = od.data, yUp = fmt === 'nh2' || fmt === 'gl';
          for (var y = 0; y < h; y++) for (var x = 0; x < ow; x++) {
            var i = (y * w + x) * 4, j = (y * ow + x) * 4;
            var r = d[i], gg = d[i + 1];
            if (yUp) gg = 255 - gg;
            if (fx) r = 255 - r;
            if (fy) gg = 255 - gg;
            o2[j] = r; o2[j + 1] = gg;
            o2[j + 2] = nh2 ? Math.round(d[(y * w + x + ow) * 4 + 2] * 0.5 + 32) : fmt === 'buf' ? d[i + 2] : 128;
            o2[j + 3] = A ? A[j + 3] : d[i + 3];
          }
          og.putImageData(od, 0, 0); out = oc;
        }
      } catch (e) { out = null; S.tainted++; warn('a normal map cannot be read (cross-origin without CORS, or not loaded): drawn without lighting'); }
      if (out || (nimg.complete !== false && (nimg.naturalWidth || nimg.width))) m[key] = out;   // retry images that were still loading
      return out;
    }
    var derivedImg = typeof WeakMap === 'function' ? new WeakMap() : null;
    function derivedFor(img) {
      if (!derivedImg) return null;
      var c = derivedImg.get(img); if (c !== undefined) return c;
      var kk = vs();
      c = deriveCanvas(img, { bevel: P.bevel * kk[0], detail: P.detail, buffer: true });
      if (c || (img.complete !== false && (img.naturalWidth || img.width))) derivedImg.set(img, c);
      return c;
    }

    function drawSprite(img, nimg) {
      var args = Array.prototype.slice.call(arguments, 2);
      try { ctx.drawImage.apply(ctx, [img].concat(args)); } catch (e) { return api; }   // the game's own draw, exactly as before
      if (!P.enabled) return api;
      try {
        if (opened) endShape();
        if (!nimg) { S.noNormal++; return api; }
        if (!readable(img)) return api;
        // a mirrored draw mirrors the map's pixels with the transform; its x (or y) normals must be negated as well
        var m = ctx.getTransform(), det = m.a * m.d - m.b * m.c, fx = false, fy = false;
        if (det < 0) { if (m.a < 0) fx = true; else fy = true; }
        else if (m.a < 0 && m.d < 0) { fx = true; fy = true; }   // turned 180 degrees
        var nm;
        if (nimg === 'derive') { nm = derivedFor(img); if (nm && (fx || fy)) nm = converted(nm, null, 'buf', fx, fy); }
        else {
          var nw0 = nimg.naturalWidth || nimg.width, iw0 = img.naturalWidth || img.videoWidth || img.width;
          var fmt = P.normalFormat === 'nh2' || P.normalFormat === 'dx' || P.normalFormat === 'gl' ? P.normalFormat : 'gl';
          if (P.normalFormat === 'auto' || P.normalFormat === 'gl') { if (nw0 && iw0 && Math.abs(nw0 - 2 * iw0) <= 1) fmt = 'nh2'; }
          nm = converted(nimg, img, fmt, fx, fy);
        }
        if (!nm) { S.noNormal++; return api; }
        frameStart();
        var iw = img.naturalWidth || img.videoWidth || img.width, ih = img.naturalHeight || img.videoHeight || img.height;
        var sx = nm.width / iw, sy = nm.height / ih;
        nG.setTransform(Q * m.a, Q * m.b, Q * m.c, Q * m.d, Q * m.e, Q * m.f); aG.setTransform(Q * m.a, Q * m.b, Q * m.c, Q * m.d, Q * m.e, Q * m.f);
        nG.globalAlpha = 1; aG.globalAlpha = ctx.globalAlpha;
        if (args.length >= 8) {   // source rect: the same rect of the normal map (it may be a different size than the colour image)
          nG.drawImage(nm, args[0] * sx, args[1] * sy, args[2] * sx, args[3] * sy, args[4], args[5], args[6], args[7]);
          aG.drawImage(img, args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7]);
        } else {
          var dw = args.length >= 4 ? args[2] : iw, dh = args.length >= 4 ? args[3] : ih;
          nG.drawImage(nm, args[0], args[1], dw, dh);
          aG.drawImage(img, args[0], args[1], dw, dh);
        }
        nG.setTransform(1, 0, 0, 1, 0, 0); aG.setTransform(1, 0, 0, 1, 0, 0); aG.globalAlpha = 1;
        S.sprites++; S.frameSprites++;
        noteBox(m, args);
      } catch (e) { S.errors++; }
      return api;
    }
    function noteBox(m, args) {
      try {
        var x, y, w, h;
        if (args.length >= 8) { x = args[4]; y = args[5]; w = args[6]; h = args[7]; } else { x = args[0]; y = args[1]; w = args[2] || 0; h = args[3] || 0; }
        var bb = devBox(m, { x: x, y: y, w: w, h: h }, 0); if (bb) pushBox(bb, 'sprite');
      } catch (e) { }
    }
    function pushBox(bb, kind) { if (S.boxes.length < 64) { var kk = vs(); S.boxes.push({ x: bb.x / kk[0], y: bb.y / kk[1], w: bb.w / kk[0], h: bb.h / kk[1], kind: kind }); } }

    // ---- shapes drawn with canvas calls
    var mCv = null, mG = null, opened = null, cache = {}, cacheKeys = [];
    function devBox(m, b, pad) {
      var xs = [b.x, b.x + b.w, b.x, b.x + b.w], ys = [b.y, b.y, b.y + b.h, b.y + b.h], x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (var i = 0; i < 4; i++) {
        var X = m.a * xs[i] + m.c * ys[i] + m.e, Y = m.b * xs[i] + m.d * ys[i] + m.f;
        if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
      }
      if (!isFinite(x0 + y0 + x1 + y1)) return null;
      x0 = Math.floor(x0 - pad); y0 = Math.floor(y0 - pad); x1 = Math.ceil(x1 + pad); y1 = Math.ceil(y1 + pad);
      var W = src.width, H = src.height;
      var cx0 = Math.max(0, x0), cy0 = Math.max(0, y0), cx1 = Math.min(W, x1), cy1 = Math.min(H, y1);
      if (cx1 - cx0 < 1 || cy1 - cy0 < 1) return null;
      return { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0, full: cx0 === x0 && cy0 === y0 && cx1 === x1 && cy1 === y1, ux: x0, uy: y0, uw: x1 - x0, uh: y1 - y0 };
    }
    function teeOn(bx, by) {
      var mir = mG, own = {};
      for (var i = 0; i < PROPS.length; i++) (function (p) {
        var d = protoDesc(p); if (!d || !d.set || !d.get) return;
        try { mir[p] = d.get.call(ctx); } catch (e) { }
        try {
          Object.defineProperty(ctx, p, { configurable: true, enumerable: true,
            get: function () { return d.get.call(ctx); },
            set: function (v) { d.set.call(ctx, v); try { mir[p] = v; } catch (e) { } } });
          own[p] = 1;
        } catch (e) { }
      })(PROPS[i]);
      try { mir.setLineDash(ctx.getLineDash()); } catch (e) { }
      for (i = 0; i < METHODS.length; i++) (function (name) {
        var f = PROTO[name]; if (typeof f !== 'function') return;
        ctx[name] = function () { var r = f.apply(ctx, arguments); try { mir[name].apply(mir, arguments); } catch (e) { } return r; };
      })(METHODS[i]);
      var fST = PROTO.setTransform, fRT = PROTO.resetTransform;
      ctx.setTransform = function (a, b, c, d, e, f) {
        var r = fST.apply(ctx, arguments);
        try { var t = arguments.length === 1 && a ? a : { a: a, b: b, c: c, d: d, e: e, f: f }; if (arguments.length === 0) t = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; mir.setTransform(t.a, t.b, t.c, t.d, t.e - bx, t.f - by); } catch (e2) { }
        return r;
      };
      if (fRT) ctx.resetTransform = function () { var r = fRT.apply(ctx, arguments); try { mir.setTransform(1, 0, 0, 1, -bx, -by); } catch (e) { } return r; };
      var m = ctx.getTransform();
      mir.setTransform(m.a, m.b, m.c, m.d, m.e - bx, m.f - by);
      return own;
    }
    function teeOff() {
      for (var i = 0; i < PROPS.length; i++) { try { if (Object.prototype.hasOwnProperty.call(ctx, PROPS[i])) delete ctx[PROPS[i]]; } catch (e) { } }
      for (i = 0; i < METHODS.length; i++) { try { if (Object.prototype.hasOwnProperty.call(ctx, METHODS[i])) delete ctx[METHODS[i]]; } catch (e) { } }
      try { delete ctx.setTransform; delete ctx.resetTransform; } catch (e) { }
    }
    function begin(key, box) {
      try {
        if (opened) { S.unbalanced++; warn('begin() while a shape is open: the previous one was closed (call end() after each shape)'); endShape(); }
        if (!P.enabled) return api;
        var m = ctx.getTransform(), kk = vs();
        var b = okBox(box) ? box : null;
        if (!b) { warn('shape without a box: the whole canvas is scanned (slow); pass {x, y, w, h} around the sprite'); }
        var pad = Math.ceil(3 * Math.max(1, Math.abs(m.a), Math.abs(m.d)));
        var bb = b ? devBox(m, b, pad) : { x: 0, y: 0, w: src.width, h: src.height };
        if (!bb) { S.offscreen++; return api; }
        frameStart();
        var ck = key != null && key !== '' ? String(key) : null;
        if (ck && cache[ck] && Math.abs(cache[ck].w - bb.uw) <= 2 && Math.abs(cache[ck].h - bb.uh) <= 2) {
          // same key = same look: no tee; the cached maps are placed where the box is now
          var ce = cache[ck];
          opened = { key: ck, hit: ce, x: bb.ux, y: bb.uy, w: ce.w, h: ce.h };
          return api;
        }
        // a keyed shape is captured whole (also the part off the canvas), so the cached maps fit wherever it is drawn later
        if (ck && !bb.full && bb.uw * bb.uh <= 512 * 512) bb = { x: bb.ux, y: bb.uy, w: bb.uw, h: bb.uh, full: true, ux: bb.ux, uy: bb.uy, uw: bb.uw, uh: bb.uh };
        if (!mCv) { mCv = canvas2d(bb.w, bb.h); mG = ctxRead(mCv); }
        if (mCv.width < bb.w || mCv.height < bb.h) { mCv.width = Math.max(mCv.width, bb.w); mCv.height = Math.max(mCv.height, bb.h); mG = ctxRead(mCv); }
        mG.setTransform(1, 0, 0, 1, 0, 0); mG.globalAlpha = 1; mG.globalCompositeOperation = 'source-over'; mG.clearRect(0, 0, bb.w + 2, bb.h + 2);
        mG.save();
        teeOn(bb.x, bb.y);
        opened = { key: ck && bb.full ? ck : null, x: bb.x, y: bb.y, w: bb.w, h: bb.h };
      } catch (e) { S.errors++; try { teeOff(); } catch (e2) { } opened = null; }
      return api;
    }
    function endShape() {
      var op = opened; opened = null;
      if (!op) return api;
      try {
        if (op.hit) { place(op.hit.n, op.hit.a, op.x, op.y, op.w, op.h); S.cacheHits++; S.shapes++; S.frameShapes++; pushBox(op, 'shape'); return api; }
        teeOff();
        try { mG.restore(); } catch (e) { }
        mG.setTransform(1, 0, 0, 1, 0, 0);
        var t0 = root.performance ? performance.now() : 0, id;
        try { id = mG.getImageData(0, 0, op.w, op.h); } catch (e) { S.tainted++; warn('a shape drew a cross-origin image: drawn without lighting'); return api; }
        var kk = vs(), scaleUp = 1, w = op.w, h = op.h, srcData = id.data, nCanvas, aCanvas;
        // a big region is derived at a lower resolution (normals are smooth anyway)
        if (w * h > 160000) {
          scaleUp = Math.sqrt(w * h / 160000);
          var sw = Math.max(1, Math.round(w / scaleUp)), sh = Math.max(1, Math.round(h / scaleUp)), sc = canvas2d(sw, sh), sg = ctxRead(sc);
          sg.drawImage(mCv, 0, 0, w, h, 0, 0, sw, sh); srcData = sg.getImageData(0, 0, sw, sh).data; w = sw; h = sh;
        }
        var outC = canvas2d(w, h), outG = outC.getContext('2d'), out = outG.createImageData(w, h);
        deriveInto(srcData, w, h, P.bevel * kk[0] / scaleUp, P.detail, out.data);
        outG.putImageData(out, 0, 0); nCanvas = outC;
        aCanvas = canvas2d(op.w, op.h); aCanvas.getContext('2d').drawImage(mCv, 0, 0, op.w, op.h, 0, 0, op.w, op.h);
        var dt = t0 ? performance.now() - t0 : 0; S.deriveMs = dt; S.avgDeriveMs = S.derived < 1 ? dt : S.avgDeriveMs * 0.95 + dt * 0.05; S.derived++;
        place(nCanvas, aCanvas, op.x, op.y, op.w, op.h);
        if (op.key) {
          if (!cache[op.key]) { cacheKeys.push(op.key); if (cacheKeys.length > 256) delete cache[cacheKeys.shift()]; }
          cache[op.key] = { n: nCanvas, a: aCanvas, w: op.w, h: op.h };
        }
        S.shapes++; S.frameShapes++; pushBox(op, 'shape');
      } catch (e) { S.errors++; try { teeOff(); } catch (e2) { } }
      return api;
    }
    function place(nC, aC, x, y, w, h) {
      nG.setTransform(1, 0, 0, 1, 0, 0); aG.setTransform(1, 0, 0, 1, 0, 0); nG.globalAlpha = 1; aG.globalAlpha = 1;
      nG.drawImage(nC, 0, 0, nC.width, nC.height, x * Q, y * Q, w * Q, h * Q);
      aG.drawImage(aC, 0, 0, aC.width, aC.height, x * Q, y * Q, w * Q, h * Q);
    }
    function shape(key, box, fn) {
      if (typeof fn !== 'function') return api;
      begin(key, box);
      try { fn(); }
      finally { if (opened) endShape(); }
      return api;
    }

    // ---- lights (world units unless screen: true; same units as the game's drawing)
    var lights = [], seq = 0;
    function normLight(d, L) {
      L = L || { id: null, on: true };
      d = d || {};
      if (d.id !== undefined && d.id !== null) L.id = d.id;
      if (L.id === null || L.id === undefined) L.id = 'N' + (++seq);
      var keys = ['x', 'y', 'radius', 'intensity', 'height', 'flicker', 'speed'];
      for (var i = 0; i < keys.length; i++) if (d[keys[i]] !== undefined) L[keys[i]] = num(d[keys[i]], L[keys[i]]);
      if (d.color !== undefined) L.color = rgbOf(d.color, L.color || [1, 0.8, 0.55]);
      if (!L.color) L.color = [1, 0.8, 0.55];
      if (d.follow !== undefined) L.follow = d.follow;
      if (d.offset !== undefined) L.offset = d.offset;
      if (d.screen !== undefined) L.screen = !!d.screen;
      if (d.on !== undefined) L.on = d.on !== false;
      if (d.keep !== undefined) L.keep = !!d.keep;
      if (d.ms !== undefined) L.life = Math.max(16, num(d.ms, 260));
      if (d.start !== undefined) L.born = num(d.start, null);
      return L;
    }
    function find(id) { for (var i = 0; i < lights.length; i++) if (lights[i].id === id) return lights[i]; return null; }
    function add(d) {
      try {
        if (d && d.id != null) { var old = find(d.id); if (old) { normLight(d, old); return old.id; } }
        var L = normLight(d); lights.push(L);
        if (lights.length > 200) { lights.splice(0, lights.length - 200); warn('more than 200 lights: oldest dropped (is add() called every frame?)'); }
        return L.id;
      } catch (e) { return null; }
    }
    function flash(d) {
      try {
        d = d || {};
        var L = normLight(d); L.life = Math.max(16, num(d.ms, 260)); if (L.born == null) L.born = nowMs();
        if (!(d.x !== undefined || d.follow !== undefined)) return null;
        var ms = L.born;   // the same spot within 3 frames: one flash (a per-frame caller cannot stack them)
        for (var i = 0; i < lights.length; i++) { var q = lights[i]; if (q.life && Math.abs(q.born - ms) <= 50 && Math.abs(num(q.x, 0) - num(L.x, 0)) < 8 && Math.abs(num(q.y, 0) - num(L.y, 0)) < 8) { q.intensity = Math.max(num(q.intensity, 1), num(L.intensity, 1)); return q.id; } }
        lights.push(L); if (lights.length > 200) lights.splice(0, lights.length - 200);
        return L.id;
      } catch (e) { return null; }
    }
    function centre(a) {
      if (!a || a.dead === true || a.alive === false) return null;
      var x = num(a.x, NaN), y = num(a.y, NaN);
      if (!isFinite(x) || !isFinite(y)) return undefined;
      if (isFinite(a.w) && isFinite(a.h)) { x += a.w / 2; y += a.h / 2; }
      return { x: x, y: y };
    }
    function hashId(id) { var s = String(id), h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; }
    function gather(ms) {
      var out = [], kk = vs(), cam = { x: 0, y: 0 };
      if (camFn) { try { var c = camFn(); if (c && isFinite(c.x) && isFinite(c.y)) cam = c; } catch (e) { warn('camera() threw; using (0, 0)'); } }
      var keep = [];
      for (var i = 0; i < lights.length; i++) {
        var L = lights[i];
        if (L.life) { if (L.born == null || ms < L.born) L.born = ms; if (ms - L.born >= L.life) continue; }
        keep.push(L);
        if (L.on === false) continue;
        var p;
        if (L.follow !== undefined && L.follow !== null) {
          try { p = centre(typeof L.follow === 'function' ? L.follow() : L.follow); } catch (e) { p = undefined; }
          if (p === null) { if (!L.keep) { keep.pop(); } continue; }
          if (p === undefined) { if (L.cache && ++L.miss <= 30) p = L.cache; else continue; } else { L.cache = p; L.miss = 0; }
        } else { if (!isFinite(L.x) || !isFinite(L.y)) continue; p = { x: L.x, y: L.y }; }
        var ox = 0, oy = 0;
        if (L.offset) { var off = L.offset; try { if (typeof off === 'function') off = off(); } catch (e) { off = null; } ox = num(off && off.x, 0); oy = num(off && off.y, 0); }
        var vx = p.x + ox - (L.screen ? 0 : cam.x), vy = p.y + oy - (L.screen ? 0 : cam.y);
        var r = num(L.radius, 0) > 0 ? L.radius : 0.4 * Math.min(view ? view.w : src.width, view ? view.h : src.height);
        var I = num(L.intensity, 1);
        if (L.flicker > 0) {
          var t = ms / 1000 * num(L.speed, 1), ph = hashId(L.id) * 6.283;
          var f = 0.55 * Math.sin(t * 7.1 + ph) + 0.3 * Math.sin(t * 13.7 + ph * 2.3) + 0.15 * Math.sin(t * 23.3 + ph * 3.1);
          I *= 1 - L.flicker * 0.35 * (0.5 + 0.5 * f); r *= 1 - L.flicker * 0.06 * (0.5 + 0.5 * f);
        }
        if (L.life) { var age = clamp((ms - L.born) / L.life, 0, 1); I *= (1 - age) * (1 - age); }
        if (I <= 0.004) continue;
        out.push({ x: vx * kk[0], y: vy * kk[1], r: r * kk[0], z: (L.height > 0 ? L.height : P.lightHeight) * kk[0], c: L.color, I: I });
      }
      lights = keep;
      var nOwn = out.length;
      // J-01 lights on the same post (their list() is in canvas px, last built frame)
      S.j01 = 0;
      if (P.lights !== 'own') {
        var srcL = j01;
        if (!srcL && root.GameDNA_Lights && root.GameDNA_Lights.instances) {
          try { var LI = root.GameDNA_Lights.instances(); for (var n = 0; n < LI.length; n++) if (LI[n].active && LI[n].post === post) { srcL = LI[n]; break; } } catch (e) { }
        }
        if (srcL) {
          try {
            var JL = srcL.list();
            for (var j = 0; j < JL.length; j++) {
              var q = JL[j]; if (!q || !q.on || !(q.level > 0.004) || !isFinite(q.x) || !isFinite(q.y)) continue;
              var rr = num(q.drawnRadius, num(q.radius, 0)); if (!(rr > 1)) continue;
              out.push({ x: q.x, y: q.y, r: rr, z: P.lightHeight * vs()[0], c: rgbOf(q.color, [1, 0.8, 0.55]), I: q.level }); S.j01++;
            }
          } catch (e) { }
        }
      }
      // the strongest lights near the view first
      var W = src.width, H = src.height;
      for (i = 0; i < out.length; i++) {
        var o2 = out[i], dxv = Math.max(0, Math.abs(o2.x - W / 2) - W / 2), dyv = Math.max(0, Math.abs(o2.y - H / 2) - H / 2);
        o2.off = Math.sqrt(dxv * dxv + dyv * dyv) >= o2.r; o2.w = o2.I * o2.r;
      }
      out = out.filter(function (q) { return !q.off; });
      out.sort(function (a, b) { return b.w - a.w; });
      if (out.length > MAXL) out.length = MAXL;
      S.lights = out.length; S.ownLights = nOwn;
      return out;
    }

    // ---- the pass (band 100-299 of the I-08 order: after J-01 lights at 200)
    var cur = { L: [] };
    function packs(L, base, part) {
      var a = new Array(16);
      for (var i = 0; i < 4; i++) {
        var q = L[base + i], o2 = i * 4;
        if (!q) { a[o2] = 0; a[o2 + 1] = 0; a[o2 + 2] = 1; a[o2 + 3] = part ? 0 : 1; continue; }
        if (part === 0) { a[o2] = q.x; a[o2 + 1] = q.y; a[o2 + 2] = Math.max(1, q.r); a[o2 + 3] = Math.max(1, q.z); }
        else { var k2 = q.I * P.points; a[o2] = q.c[0] * k2; a[o2 + 1] = q.c[1] * k2; a[o2 + 2] = q.c[2] * k2; a[o2 + 3] = 1; }
      }
      return a;
    }
    var def = {
      name: NAME, order: 250, scale: 1, inputs: { uNrm: NIN, uAlb: AIN, uUi: 'uiMask' }, frag: FRAG, defaults: {}, enabled: true,
      skip: function (s) {
        try {
          S.frames++;
          if (opened) { S.unbalanced++; warn('a shape was still open when the frame was shown: call end() after each begin()'); endShape(); }
          // a frame the game asked for (render()) with no sprite since the last one: the buffers are stale. A repaint
          // the I-08 watchdog made by itself (a frozen ?t= still, a screen that stopped calling render) keeps them.
          var req = -1; try { req = post.stats().requests; } catch (e) { }
          if (req !== S.lastReq && S.consumed && S.lastReq !== undefined) { S.frameShapes = 0; S.frameSprites = 0; S.boxes = []; }
          S.lastReq = req;
          var drew = (S.frameShapes + S.frameSprites) > 0;
          S.lastBoxes = drew ? S.boxes.slice() : [];
          S.consumed = true;   // the next sprite starts a new frame
          S.lastMs = clock ? nowMs() : s.ms;
          var idle = !P.enabled || !drew || (P.strength <= 0 && P.rim <= 0 && P.specular <= 0 && P.pointRim <= 0 && P.debug === 'off');
          cur.L = idle ? [] : gather(S.lastMs);
          if (!idle) S.lit++;
          return idle;
        } catch (e) { S.errors++; return true; }
      },
      uniforms: function () {
        var L = cur.L, ka = P.keyAngle * Math.PI / 180, kh = clamp(P.keyHeight, 0.05, 0.99), kc = Math.sqrt(1 - kh * kh), ra = P.rimAngle * Math.PI / 180;
        return {
          uLA0: packs(L, 0, 0), uLA1: packs(L, 4, 0), uLB0: packs(L, 0, 1), uLB1: packs(L, 4, 1),
          uKeyL: [Math.cos(ka) * kc, Math.sin(ka) * kc, kh], uKey: P.key,
          uKeyT: normTint(P.keyColor, [1, 0.95, 0.86], P.warmth), uShT: normTint(P.shadowColor, [0.75, 0.82, 1], P.warmth),
          uRimT: normTint(P.rimColor, [0.66, 0.83, 1], 1), uRim: P.rim, uRimD: [Math.cos(ra), Math.sin(ra)],
          uCmp: clamp(P.compare, 0, 1), uBack: clamp(P.backside, 0, 1), uFill: P.fill, uStr: P.strength, uSpec: P.specular,
          uGloss: clamp(P.gloss, 1, 128), uRimP: clamp(P.rimWidth, 0.5, 8), uPtRim: P.pointRim,
          uOver: P.overdraw ? 1 : 0, uDebug: P.debug === 'normals' ? 1 : P.debug === 'coverage' ? 2 : 0
        };
      }
    };
    ensureBuffers(); clearBuffers();
    post.setInput(NIN, nCv, { filter: 'linear', live: true });
    post.setInput(AIN, aCv, { filter: 'linear', live: true });
    post.addPass(def);
    var broken = [], g0 = post.get(NAME);
    if (!g0 || g0.error) { broken.push(NAME); warn('normal-light pass failed to compile' + (g0 && g0.error ? ': ' + String(g0.error).slice(0, 200) : '')); }

    function setEnabled(on) { P.enabled = on !== false; try { post.enable(NAME, P.enabled); post.render(); } catch (e) { } return api; }
    var api = {
      version: VERSION, active: true, reason: '', post: post, shared: !own,
      drawSprite: drawSprite,
      shape: shape,
      begin: begin,
      end: function () { endShape(); return api; },
      add: add, flash: flash,
      set: function (id, patch) { var L = find(id); if (!L) return null; normLight(patch, L); return L.id; },
      remove: function (id) { var L = find(id); if (L) lights.splice(lights.indexOf(L), 1); return api; },
      clear: function (which) { lights = which === 'flashes' ? lights.filter(function (L) { return !L.life; }) : []; return api; },
      list: function () { return lights.map(function (L) { return { id: L.id, x: L.x, y: L.y, radius: L.radius, intensity: L.intensity, on: L.on !== false, flash: !!L.life, follow: L.follow !== undefined }; }); },
      lightsNow: function () { var kk = vs(); return cur.L.map(function (q) { return { x: q.x / kk[0], y: q.y / kk[1], radius: q.r / kk[0], intensity: q.I }; }); },
      forget: function (key) { if (key == null) { cache = {}; cacheKeys = []; } else { delete cache[String(key)]; } return api; },
      drawnBoxes: function () { return S.lastBoxes.slice(); },
      render: function (a) { try { if (opened) endShape(); post.render(a); } catch (e) { } return api; },
      renderNow: function (a) { try { if (opened) endShape(); post.renderNow(a); } catch (e) { } return api; },
      setParams: function (p) {
        try { var was = P.enabled, b0 = P.bevel, d0 = P.detail; applyParams(P, p || {}); if (P.enabled !== was) setEnabled(P.enabled); if (P.bevel !== b0 || P.detail !== d0) { cache = {}; cacheKeys = []; if (typeof WeakMap === 'function') derivedImg = new WeakMap(); } post.render(); } catch (e) { }
        return api;
      },
      params: function () { var oo = {}; for (var key in P) oo[key] = P[key]; return oo; },
      setEnabled: setEnabled,
      stats: function () {
        var st = {}; try { st = post.stats() || {}; } catch (e) { }
        return { active: !!post.active, reason: post.reason || '', mode: post.mode, shared: !own, enabled: P.enabled,
          frames: S.frames, lit: S.lit, shapes: S.shapes, sprites: S.sprites, frameShapes: S.frameShapes, frameSprites: S.frameSprites,
          derived: S.derived, cacheHits: S.cacheHits, cached: cacheKeys.length, deriveMs: Math.round(S.deriveMs * 100) / 100, avgDeriveMs: Math.round(S.avgDeriveMs * 100) / 100,
          lights: S.lights, ownLights: S.ownLights || 0, j01: S.j01, unbalanced: S.unbalanced, tainted: S.tainted, noNormal: S.noNormal, offscreen: S.offscreen,
          errors: S.errors, broken: broken.slice(), buffer: nCv ? nCv.width + 'x' + nCv.height : '',
          passes: (st.passes || []).filter(function (n) { return n === NAME; }), postPasses: st.passes || [], w: st.w, h: st.h, avgMs: st.avgMs };
      },
      destroy: function () {
        try { if (opened) endShape(); } catch (e) { }
        try { post.removePass(NAME); post.removeInput(NIN); post.removeInput(AIN); } catch (e) { }
        try { if (own) post.destroy(); } catch (e) { }
        api.active = false; api.reason = 'destroyed'; return api;
      }
    };
    if (P.enabled === false) { try { post.enable(NAME, false); } catch (e) { } }
    try { post.render(); } catch (e) { }
    return api;
  }

  root.GameDNA_NormalLight = { version: VERSION, create: create, defaults: DEFAULTS, presets: PRESETS, passName: NAME, derive: deriveCanvas };
})(typeof window !== 'undefined' ? window : this);
