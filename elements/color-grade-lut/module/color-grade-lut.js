/* GameDNA J-06 · Colour grading LUT (+ J-07 vignette and film grain) · module v1.1 (plain script, no dependencies, one global)
 *
 *   // after webgl-post.js (I-08) and after the game's own GameDNA_Post.create(...) if it has one
 *   const grade = GameDNA_ColorGrade.create({
 *     canvas: myCanvas,                          // the game's 2D canvas (the same one I-08 post-processes)
 *     clock: () => frameCount * 1000 / 60,       // game time in ms: blends and grain follow it (never Date.now())
 *     params: { preset: 'neutral', strength: 1, vignette: 0.3, grain: 0.05 },
 *     uiRects: () => [{ x: 0, y: 0, w: 256, h: 16 }]   // HUD plates in canvas px ({r} corner radius, {soft} px fade): left untouched
 *   });
 *   grade.to('night', 1200);                     // blend to another LUT over 1.2 s of game time (idempotent: safe every step)
 *   grade.render();                              // once per drawn frame (forwards to post.render())
 *
 * A 32x32x32 3D lookup table is stored as a 1024x32 strip texture. Presets are generated procedurally from small recipes
 * (no image files); designers can also load a .cube file, a PNG strip or grid, a float array or a function. Two LUT slots
 * blend over game time. A second pass adds vignette and deterministic film grain. Both passes leave UI pixels untouched
 * (the 'uiMask' input convention). Without WebGL (or ?webgl=0) every method is a safe no-op and the game looks as before.
 * Never throws.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0';
  var N = 32, STRIP_W = N * N;                       // 32^3 LUT as a 1024 x 32 strip: x = b * 32 + r, y = g
  var ORDER_LUT = 750, ORDER_LENS = 860;              // I-08 order bands: LUT 700-799, built-in grade 800, lens 850-899
  var IN_A = 'gdna-lut-a', IN_B = 'gdna-lut-b', IN_UI = 'uiMask';

  var DEFAULTS = {
    preset: 'neutral',     // LUT at start
    strength: 1,           // 0 = ungraded, 1 = full LUT (mix in the shader)
    blend: 900,            // default ms of game time for to(name) without a duration
    vignette: 0.3,         // 0..1 corner darkening toward the ink colour (this module's own; the built-in one is turned off)
    grain: 0.035,          // 0..0.3 film grain amplitude (luminance, strongest in the midtones)
    grainSize: 1.5,        // grain cell in CSS px
    grainFps: 24,          // how often the grain pattern changes, in game time
    builtin: 'replace',    // the I-08 built-in 'grade' pass: 'replace' (turned off while this runs) | 'keep' (runs after the LUT, its vignette set to 0)
    compare: -1,           // before/after split: x in 0..1 of the canvas (left = untouched), < 0 = off
    webgl: 'auto'          // 'auto' | 'off'
  };

  // ------------------------------------------------------------------ recipes: small, readable grade descriptions
  // All fields optional. exposure (stops), temp (-1 cool .. 1 warm), tint (-1 green .. 1 magenta), contrast (-1..1),
  // lift/gamma/gain [r,g,b], saturation, vibrance, hues [{h deg, w deg, shift deg, sat x, lum x, minSat 0..1, minVal 0..1, keep 0..1 (exempt from global saturation and split toning), hold 0..1 (pull the result back toward the drawn colour)}],
  // shadows '#hex' + shadowAmt, highlights '#hex' + highAmt, balance (-0.3..0.3), black '#hex', white '#hex'.
  var PRESETS = {
    neutral: {},
    dusk: {
      label: 'Dusk', exposure: -0.12, temp: 0.42, tint: 0.18, contrast: 0.18, saturation: 1.04,
      hues: [{ h: 215, w: 55, shift: 28, sat: 0.8 }, { h: 105, w: 55, shift: -16, sat: 0.78 }, { h: 30, w: 35, sat: 1.18 }],
      shadows: '#55306f', shadowAmt: 0.55, highlights: '#ffad66', highAmt: 0.55, black: '#0c0712'
    },
    night: {
      label: 'Cold night', exposure: -1.05, temp: -0.6, contrast: 0.12, saturation: 0.42,
      hues: [{ h: 32, w: 30, keep: 1, sat: 1.15, lum: 1.7, minSat: 0.55 },             // fire, embers, saturated lamp glass
             { h: 44, w: 34, keep: 1, sat: 1.2, lum: 1.95, minSat: 0.1, minVal: 0.95, hold: 0.8 }, // pale warm light at full brightness: stays lit (v1.1: wider, held)
             { h: 210, w: 45, lum: 0.78, minVal: 0.8 }],                                   // bright blue sky about 0.35 EV darker (v1.1)
      shadows: '#1d3a78', shadowAmt: 0.85, highlights: '#bcd6ff', highAmt: 0.35, black: '#03060f', white: '#e2eeff'
    },
    memory: {
      label: 'Faded memory', exposure: 0.06, temp: 0.32, contrast: -0.26, saturation: 0.42,
      shadows: '#6d5a76', shadowAmt: 0.32, highlights: '#ffe0aa', highAmt: 0.45, black: '#231d27', white: '#f6ecda'
    },
    combat: {   // v1.1: teal-to-black shadows, darker midtones, reds kept hot, greens muted toward teal (no neon on green-heavy games)
      label: 'High-contrast combat', exposure: -0.45, contrast: 0.55, saturation: 0.95, balance: 0.12, gamma: [0.82, 0.84, 0.86],
      hues: [{ h: 0, w: 34, keep: 1, sat: 1.45, lum: 1.25 }, { h: 30, w: 22, keep: 0.5, sat: 1.1, lum: 1.12, minSat: 0.5 },
             { h: 105, w: 55, shift: 14, sat: 0.6 }, { h: 200, w: 50, shift: -12, sat: 0.9 }],
      shadows: '#06505e', shadowAmt: 1.05, highlights: '#ffc890', highAmt: 0.2, black: '#010607', white: '#e9e6df'
    },
    toxic: {
      label: 'Toxic swamp', exposure: -0.1, temp: -0.08, tint: -0.55, contrast: 0.28, saturation: 1.08,
      hues: [{ h: 285, w: 60, shift: -70, sat: 0.55 }, { h: 205, w: 45, shift: -40 }, { h: 0, w: 30, shift: 22, sat: 0.8 }],
      shadows: '#123d2b', shadowAmt: 0.75, highlights: '#d8ff73', highAmt: 0.55, black: '#05120b'
    }
  };

  // ------------------------------------------------------------------ helpers
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function c01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function warn(msg) { try { if (root.console && console.warn) console.warn('[GameDNA_ColorGrade] ' + msg); } catch (e) { } }
  function hexRgb(h, d) {
    if (Array.isArray(h) && h.length >= 3) return [num(h[0], 0), num(h[1], 0), num(h[2], 0)];
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h || '').trim());
    if (!m) return d;
    var s = m[1]; if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
  }
  function urlOff() {
    try { var q = new URLSearchParams(root.location ? root.location.search : ''); var w = q.get('webgl'); return w === '0' || w === 'off' || w === 'false'; } catch (e) { return false; }
  }
  function s2l(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function l2s(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
  function luma(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
  function smooth(a, b, x) { var t = c01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function rgb2hsv(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d > 1e-6) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return [h, mx > 0 ? d / mx : 0, mx];
  }
  function hsv2rgb(h, s, v) {
    h = ((h % 360) + 360) % 360; var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [r + m, g + m, b + m];
  }

  // one colour through a recipe (0..1 sRGB in, 0..1 sRGB out)
  function applyRecipe(R, r, g, b) {
    var i, k;
    // 1) exposure and white balance in linear light, soft shoulder instead of a hard clip
    var ev = Math.pow(2, num(R.exposure, 0)), temp = num(R.temp, 0), tint = num(R.tint, 0);
    var wb = [1 + 0.16 * temp + 0.05 * tint, 1 - 0.12 * tint, 1 - 0.16 * temp + 0.05 * tint];
    var c = [s2l(r) * ev * wb[0], s2l(g) * ev * wb[1], s2l(b) * ev * wb[2]];
    var top = Math.max(ev * wb[0], ev * wb[1], ev * wb[2]), knee = 0.75;   // > 1: roll the brightest input off to 1 above the knee
    for (i = 0; i < 3; i++) {
      var x = c[i];
      if (top > 1 && x > knee) { var tt = c01((x - knee) / (top - knee)); x = knee + (1 - knee) * (1 - (1 - tt) * (1 - tt)); }
      c[i] = l2s(c01(x));
    }
    // 2) contrast: S-curve (> 0) or flatten (< 0) around mid-grey
    var ct = num(R.contrast, 0);
    if (ct) for (i = 0; i < 3; i++) { x = c[i]; c[i] = ct > 0 ? x + (x * x * (3 - 2 * x) - x) * Math.min(1, ct) * 1.6 : 0.5 + (x - 0.5) * (1 + ct * 0.7); c[i] = c01(c[i]); }
    // 3) lift / gamma / gain per channel
    if (R.lift || R.gamma || R.gain) for (i = 0; i < 3; i++) {
      var li = R.lift ? num(R.lift[i], 0) : 0, ga = R.gamma ? num(R.gamma[i], 1) : 1, gn = R.gain ? num(R.gain[i], 1) : 1;
      x = gn * (c[i] + li * (1 - c[i])); c[i] = Math.pow(c01(x), 1 / Math.max(0.05, ga));
    }
    // 4) colour bands (hue-selective), weighed once on the colour the game drew (before exposure and contrast)
    var bands = [], keepW = 0, holdW = 0, hsv = rgb2hsv(r, g, b);
    if (R.hues && R.hues.length && hsv[1] > 0.001) for (k = 0; k < R.hues.length; k++) {
      var H = R.hues[k], dist = Math.abs(((hsv[0] - num(H.h, 0)) % 360 + 540) % 360 - 180), wdt = Math.max(1, num(H.w, 30));
      var wgt = (1 - smooth(0, wdt, dist)) * smooth(0.02, 0.18, hsv[1]), ms0 = num(H.minSat, 0), mv0 = num(H.minVal, 0);
      if (ms0 > 0) wgt *= smooth(ms0 - 0.12, ms0 + 0.08, hsv[1]);
      if (mv0 > 0) wgt *= smooth(mv0 - 0.03, mv0 + 0.01, hsv[2]);
      if (wgt <= 0) continue;
      bands.push([H, wgt]); keepW = Math.max(keepW, wgt * c01(num(H.keep, 0))); holdW = Math.max(holdW, wgt * c01(num(H.hold, 0)));
    }
    // 5) saturation and vibrance around luma (a band with keep: 1 is exempt), then the band changes
    var sat = num(R.saturation, 1), vib = num(R.vibrance, 0), l = luma(c[0], c[1], c[2]);
    if (sat !== 1 || vib) {
      var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), cur = mx - mn;
      var f = sat * (1 + vib * (1 - c01(cur * 1.5)));
      f = f + (1 - f) * keepW;
      for (i = 0; i < 3; i++) c[i] = c01(l + (c[i] - l) * f);
    }
    if (bands.length) {
      var hv = rgb2hsv(c[0], c[1], c[2]), dh = 0, ds = 1, dv = 1;
      for (k = 0; k < bands.length; k++) { var HB = bands[k][0], wb2 = bands[k][1];
        dh += num(HB.shift, 0) * wb2; ds *= 1 + (num(HB.sat, 1) - 1) * wb2; dv *= 1 + (num(HB.lum, 1) - 1) * wb2; }
      var out = hsv2rgb(hv[0] + dh, c01(hv[1] * ds), c01(hv[2] * dv));
      c = [c01(out[0]), c01(out[1]), c01(out[2])];
    }
    // 6) split toning: chroma of the tint colour added by luma band (keeps brightness)
    l = luma(c[0], c[1], c[2]);
    var bal = num(R.balance, 0);
    if (R.shadows) { var sc = hexRgb(R.shadows, [0.5, 0.5, 0.5]), sl = luma(sc[0], sc[1], sc[2]), sw = (1 - smooth(0.0, 0.62 + bal, l)) * (0.45 + 0.55 * smooth(0.0, 0.14, l)) * num(R.shadowAmt, 0.5) * (1 - keepW);
      for (i = 0; i < 3; i++) c[i] += (sc[i] - sl) * sw; }
    if (R.highlights) { var hc = hexRgb(R.highlights, [0.5, 0.5, 0.5]), hl = luma(hc[0], hc[1], hc[2]), hw = smooth(0.32 + bal, 1.0, l) * num(R.highAmt, 0.5) * (1 - keepW);
      for (i = 0; i < 3; i++) c[i] += (hc[i] - hl) * hw; }
    // 7) output black and white points (fade / tinted blacks)
    var bk = R.black ? hexRgb(R.black, [0, 0, 0]) : null, wt = R.white ? hexRgb(R.white, [1, 1, 1]) : null;
    for (i = 0; i < 3; i++) { x = c01(c[i]); if (bk || wt) { var lo = bk ? bk[i] : 0, hi = wt ? wt[i] : 1; x = lo + x * (hi - lo); } c[i] = c01(x); }
    // 8) hold: a band with hold > 0 pulls the result back toward the colour the game drew (lamp glass and its halo stay lit at night)
    if (holdW > 0) { var src0 = [r, g, b]; for (i = 0; i < 3; i++) c[i] = c01(c[i] + (src0[i] - c[i]) * holdW); }
    return c;
  }

  // ------------------------------------------------------------------ LUT objects: {size: 32, data: Uint8ClampedArray(1024*32*4), identity, name}
  function newLut() { return { size: N, data: new Uint8ClampedArray(STRIP_W * N * 4), identity: false, image: null }; }
  function fill(fn) {
    var L = newLut(), d = L.data, ident = true;
    for (var g = 0; g < N; g++) for (var b = 0; b < N; b++) for (var r = 0; r < N; r++) {
      var o = ((g * STRIP_W) + b * N + r) * 4, out;
      try { out = fn(r / (N - 1), g / (N - 1), b / (N - 1)); } catch (e) { out = null; }
      if (!out) out = [r / (N - 1), g / (N - 1), b / (N - 1)];
      d[o] = Math.round(c01(num(out[0], 0)) * 255); d[o + 1] = Math.round(c01(num(out[1], 0)) * 255); d[o + 2] = Math.round(c01(num(out[2], 0)) * 255); d[o + 3] = 255;
      if (ident && (Math.abs(d[o] - Math.round(r * 255 / (N - 1))) > 0 || Math.abs(d[o + 1] - Math.round(g * 255 / (N - 1))) > 0 || Math.abs(d[o + 2] - Math.round(b * 255 / (N - 1))) > 0)) ident = false;
    }
    L.identity = ident; return L;
  }
  function identity() { return fill(function (r, g, b) { return [r, g, b]; }); }
  function fromRecipe(R) { R = R || {}; return fill(function (r, g, b) { return applyRecipe(R, r, g, b); }); }
  function fromFunction(fn) { return fill(function (r, g, b) { var o = fn(r, g, b); return o && o.length >= 3 ? o : null; }); }
  // trilinear sample of a float table (size S, r fastest), used to resample any size to 32
  function sampleTable(tab, S, r, g, b) {
    var fr = r * (S - 1), fg = g * (S - 1), fb = b * (S - 1);
    var r0 = Math.floor(fr), g0 = Math.floor(fg), b0 = Math.floor(fb), r1 = Math.min(S - 1, r0 + 1), g1 = Math.min(S - 1, g0 + 1), b1 = Math.min(S - 1, b0 + 1);
    var tr = fr - r0, tg = fg - g0, tb = fb - b0, out = [0, 0, 0];
    for (var ch = 0; ch < 3; ch++) {
      var v = function (R0, G0, B0) { return tab[((B0 * S + G0) * S + R0) * 3 + ch]; };
      var c00 = v(r0, g0, b0) * (1 - tr) + v(r1, g0, b0) * tr, c10 = v(r0, g1, b0) * (1 - tr) + v(r1, g1, b0) * tr;
      var c01v = v(r0, g0, b1) * (1 - tr) + v(r1, g0, b1) * tr, c11 = v(r0, g1, b1) * (1 - tr) + v(r1, g1, b1) * tr;
      out[ch] = (c00 * (1 - tg) + c10 * tg) * (1 - tb) + (c01v * (1 - tg) + c11 * tg) * tb;
    }
    return out;
  }
  // float array in .cube order (r fastest, then g, then b), values 0..1
  function fromArray(size, values) {
    var S = Math.round(num(size, 0));
    if (S < 2 || !values || values.length < S * S * S * 3) { warn('fromArray: need size >= 2 and size^3 * 3 values'); return null; }
    return fill(function (r, g, b) { return sampleTable(values, S, r, g, b); });
  }
  // text of an Adobe/Resolve .cube file (3D only)
  function parseCube(text) {
    try {
      var lines = String(text || '').split(/\r?\n/), S = 0, vals = [], lo = [0, 0, 0], hi = [1, 1, 1];
      for (var i = 0; i < lines.length; i++) {
        var ln = lines[i].replace(/#.*/, '').trim(); if (!ln) continue;
        var p = ln.split(/\s+/);
        if (/^LUT_3D_SIZE$/i.test(p[0])) { S = parseInt(p[1], 10); continue; }
        if (/^LUT_1D_SIZE$/i.test(p[0])) { warn('parseCube: 1D LUTs are not supported'); return null; }
        if (/^DOMAIN_MIN$/i.test(p[0])) { lo = [num(p[1], 0), num(p[2], 0), num(p[3], 0)]; continue; }
        if (/^DOMAIN_MAX$/i.test(p[0])) { hi = [num(p[1], 1), num(p[2], 1), num(p[3], 1)]; continue; }
        if (/^[A-Z_]+$/i.test(p[0])) continue;                    // TITLE and other keywords
        if (p.length >= 3) for (var k = 0; k < 3; k++) vals.push(c01((num(p[k], 0) - lo[k]) / ((hi[k] - lo[k]) || 1)));
      }
      if (!S || vals.length < S * S * S * 3) { warn('parseCube: LUT_3D_SIZE missing or too few rows'); return null; }
      return fromArray(S, vals);
    } catch (e) { warn('parseCube: ' + e.message); return null; }
  }
  // image (strip N*N x N, e.g. 1024x32 / 256x16, or square grid, e.g. 512x512 = 64^3): tile index = blue, x in tile = red, y = green
  function fromStrip(img) {
    try {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      var S = Math.round(Math.cbrt(w * h));
      if (!S || S * S * S !== w * h || w % S || h % S) { warn('fromStrip: image must hold size^3 pixels as size x size tiles (got ' + w + 'x' + h + ')'); return null; }
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var x = cv.getContext('2d'); x.drawImage(img, 0, 0);
      var px = x.getImageData(0, 0, w, h).data, per = w / S, tab = new Float32Array(S * S * S * 3);
      for (var b = 0; b < S; b++) for (var g = 0; g < S; g++) for (var r = 0; r < S; r++) {
        var tx = (b % per) * S + r, ty = Math.floor(b / per) * S + g, o = (ty * w + tx) * 4, q = ((b * S + g) * S + r) * 3;
        tab[q] = px[o] / 255; tab[q + 1] = px[o + 1] / 255; tab[q + 2] = px[o + 2] / 255;
      }
      return fromArray(S, tab);
    } catch (e) { warn('fromStrip: ' + (e && e.message || e) + ' (cross-origin images cannot be read)'); return null; }
  }
  function toLut(src) {
    if (!src) return null;
    if (src.size === N && src.data && src.data.length === STRIP_W * N * 4) return src;
    if (typeof src === 'function') return fromFunction(src);
    if (typeof src === 'string') return /LUT_3D_SIZE/i.test(src) ? parseCube(src) : null;
    if (src.width && src.height && (src.getContext || src.naturalWidth !== undefined || src.close)) return fromStrip(src);
    if (src.size && src.values) return fromArray(src.size, src.values);
    if (typeof src === 'object') return fromRecipe(src);
    return null;
  }
  // CPU lookup (trilinear, same maths as the shader): for tests and for showing a swatch
  function sample(L, r, g, b) {
    if (!L || !L.data) return [r, g, b];
    var d = L.data, fr = c01(r) * (N - 1), fg = c01(g) * (N - 1), fb = c01(b) * (N - 1);
    var r0 = Math.floor(fr), g0 = Math.floor(fg), b0 = Math.floor(fb), r1 = Math.min(N - 1, r0 + 1), g1 = Math.min(N - 1, g0 + 1), b1 = Math.min(N - 1, b0 + 1);
    var tr = fr - r0, tg = fg - g0, tb = fb - b0, out = [0, 0, 0];
    function at(R0, G0, B0, ch) { return d[((G0 * STRIP_W) + B0 * N + R0) * 4 + ch] / 255; }
    for (var ch = 0; ch < 3; ch++) {
      var a0 = (at(r0, g0, b0, ch) * (1 - tr) + at(r1, g0, b0, ch) * tr) * (1 - tg) + (at(r0, g1, b0, ch) * (1 - tr) + at(r1, g1, b0, ch) * tr) * tg;
      var a1 = (at(r0, g0, b1, ch) * (1 - tr) + at(r1, g0, b1, ch) * tr) * (1 - tg) + (at(r0, g1, b1, ch) * (1 - tr) + at(r1, g1, b1, ch) * tr) * tg;
      out[ch] = a0 * (1 - tb) + a1 * tb;
    }
    return out;
  }
  function imageOf(L) {
    if (!L) return null;
    if (!L.image) { try { L.image = new ImageData(L.data, STRIP_W, N); } catch (e) { L.image = null; } }
    return L.image;
  }
  function toCanvas(L) {
    try { var cv = document.createElement('canvas'); cv.width = STRIP_W; cv.height = N; var im = imageOf(L); if (im) cv.getContext('2d').putImageData(im, 0, 0); return cv; } catch (e) { return null; }
  }
  function lerpLut(A, B, m) {
    var L = newLut(), a = A.data, b = B.data, d = L.data, im = 1 - m;
    for (var i = 0; i < d.length; i++) d[i] = a[i] * im + b[i] * m;
    L.identity = A.identity && B.identity; return L;
  }

  // ------------------------------------------------------------------ GLSL (GLSL ES 1.00; the I-08 prelude is added by GameDNA_Post)
  var LUT_FRAG = [
    'uniform sampler2D uLutA; uniform sampler2D uLutB; uniform sampler2D uUi;',
    'uniform float uLutAOn; uniform float uLutBOn; uniform float uUiOn;',
    'uniform float uMix; uniform float uStrength; uniform float uSplit;',
    'vec3 lut(sampler2D t, vec3 c) {',
    '  c = clamp(c, 0.0, 1.0);',
    '  float bz = c.b * 31.0; float b0 = floor(bz); float b1 = min(b0 + 1.0, 31.0);',
    '  float x = c.r * 31.0 + 0.5; float v = 1.0 - (c.g * 31.0 + 0.5) / 32.0;',
    '  vec3 s0 = texture2D(t, vec2((b0 * 32.0 + x) / 1024.0, v)).rgb;',
    '  vec3 s1 = texture2D(t, vec2((b1 * 32.0 + x) / 1024.0, v)).rgb;',
    '  return mix(s0, s1, bz - b0);',
    '}',
    'void main() {',
    '  vec3 c = texture2D(uPrev, vUv).rgb;',
    '  vec3 gr;',
    '  if (uMix >= 0.999 && uLutBOn > 0.5) gr = lut(uLutB, c);              // settled: one table',
    '  else if (uMix <= 0.001 && uLutAOn > 0.5) gr = lut(uLutA, c);',
    '  else { vec3 a = uLutAOn > 0.5 ? lut(uLutA, c) : c; vec3 b = uLutBOn > 0.5 ? lut(uLutB, c) : a; gr = mix(a, b, uMix); }',
    '  vec3 o = mix(c, gr, uStrength);',
    '  o += (hash12(gl_FragCoord.xy + 17.0) - 0.5) / 255.0;',
    '  float ui = texture2D(uUi, vUv).r * uUiOn;',
    '  float before = (uSplit >= 0.0 && vUv.x < uSplit) ? 1.0 : 0.0;',
    '  o = mix(o, c, max(ui, before));',
    '  if (uSplit >= 0.0) { float dx = abs(vUv.x - uSplit) * uRes.x; o = mix(o, vec3(1.0), (1.0 - smoothstep(0.6 * uDpr, 1.6 * uDpr, dx)) * 0.85 * (1.0 - ui)); }',
    '  gl_FragColor = vec4(clamp(o, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  var LENS_FRAG = [
    'uniform sampler2D uUi; uniform float uUiOn;',
    'uniform float uVig; uniform vec3 uInk; uniform float uGrain; uniform float uGrainSize; uniform float uGrainFrame; uniform float uSplit;',
    'void main() {',
    '  vec3 c = texture2D(uPrev, vUv).rgb; vec3 o = c;',
    '  vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);',
    '  float d = length(q) / length(vec2(uRes.x / uRes.y, 1.0) * 0.5);',
    '  float v = uVig * smoothstep(0.32, 1.12, d);',
    '  o = mix(o, vec3(luma(o)), v * 0.35);',
    '  o = mix(o, uInk, v);',
    '  if (uGrain > 0.0) {',
    '    vec2 cell = floor(gl_FragCoord.xy / max(1.0, uGrainSize * uDpr));',
    '    vec2 k = vec2(mod(uGrainFrame, 61.0) * 13.17, mod(uGrainFrame, 47.0) * 7.31);',
    '    float n = hash12(cell + k) + hash12(cell * 1.37 + k.yx + 3.1) - 1.0;',
    '    float l = luma(o); float w = 1.0 - 0.7 * pow(abs(l * 2.0 - 1.0), 2.0);',
    '    o += vec3(n * uGrain * w);',
    '  }',
    '  float ui = texture2D(uUi, vUv).r * uUiOn;',
    '  float before = (uSplit >= 0.0 && vUv.x < uSplit) ? 1.0 : 0.0;',
    '  o = mix(o, c, max(ui, before));',
    '  gl_FragColor = vec4(clamp(o, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  // ------------------------------------------------------------------ shared LUT cache (presets are generated once per page)
  var CACHE = {};
  function presetLut(name, table) {
    if (CACHE[name]) return CACHE[name];
    var src = table[name]; if (!src) return null;
    var L = toLut(src);
    if (!L) return null;
    L.name = name; CACHE[name] = L; return L;
  }

  // ------------------------------------------------------------------ the instance
  function create(o) {
    o = o || {};
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    setP(o.params || {});
    var table = {};                                  // name -> recipe | LUT; this instance's presets
    for (k in PRESETS) table[k] = PRESETS[k];
    var localCache = {};                             // name -> LUT for presets defined on this instance

    var src = o.canvas || null;
    if (typeof src === 'string') { try { src = document.querySelector(src); } catch (e) { src = null; } }
    if (src && src.canvas && src.canvas.getContext) src = src.canvas;
    var clock = typeof o.clock === 'function' ? o.clock : null;
    var ink = [0.02, 0.016, 0.05];
    try { var SK = root.GameDNA_Skin && o.skin ? root.GameDNA_Skin.resolve(o.skin) : null; if (SK && SK.palette && SK.palette.ink) ink = hexRgb(SK.palette.ink, ink); } catch (e) { }
    if (o.ink) ink = hexRgb(o.ink, ink);

    var S = {
      post: null, owned: false, attached: false, saved: null,
      fromLut: null, toLut: null, fromName: P.preset, toName: P.preset, t0: 0, dur: 0, lastMs: 0,
      uiRects: o.uiRects || null, uiSig: '', uiCanvas: null, view: o.view || null,
      stats: { blends: 0, bakes: 0, ignored: 0, unknown: 0, renders: 0, uploads: 0, uiUpdates: 0, reattached: 0, errors: 0 }
    };
    for (k in o.presets || {}) defineOn(k, o.presets[k]);

    function nowMs() {
      if (clock) { try { var v = Number(clock()); if (isFinite(v)) return v; } catch (e) { } }
      return S.lastMs;
    }
    function lutFor(name) {
      if (localCache[name]) return localCache[name];
      if (!table[name]) return null;
      if (table[name] === PRESETS[name]) return presetLut(name, PRESETS);
      var L = toLut(table[name]); if (L) { L.name = name; localCache[name] = L; } return L;
    }
    function defineOn(name, source) {
      try {
        name = String(name);
        var L = toLut(source);
        if (!L) { warn('define("' + name + '"): could not read that LUT source'); return false; }
        L.name = name; table[name] = source; localCache[name] = L;
        if (S.toName === name || S.fromName === name) {   // redefining what is on screen: show the new one
          if (S.toName === name) S.toLut = L; if (S.fromName === name) S.fromLut = L; upload();
        }
        return true;
      } catch (e) { warn('define: ' + e.message); return false; }
    }
    function ease(x) { x = c01(x); return x * x * (3 - 2 * x); }
    function mixAt(ms) {
      if (S.dur <= 0) return 1;
      var dt = ms - S.t0;
      if (dt < 0) return 1;              // the game clock went back (restart): show the target
      return ease(dt / S.dur);
    }
    function live() { return !!(S.post && S.post.active !== false && S.post.mode !== 'off' && S.attached); }

    // ---- LUT slots → textures (ImageData uploaded once, re-uploaded only when a slot changes)
    function upload() {
      if (!live()) return;
      try {
        var A = S.fromLut || identityLut(), B = S.toLut || A;
        S.post.setInput(IN_A, imageOf(A), { filter: 'linear', live: false });
        S.post.setInput(IN_B, imageOf(B), { filter: 'linear', live: false });
        S.stats.uploads++;
      } catch (e) { S.stats.errors++; }
    }
    var ID = null;
    function identityLut() { if (!ID) { ID = presetLut('neutral', PRESETS); } return ID; }

    // ---- UI mask from rects (in view px; default = canvas px)
    function readRects() {
      var r = S.uiRects;
      if (typeof r === 'function') { try { r = r(); } catch (e) { r = null; } }
      return Array.isArray(r) ? r : [];
    }
    function updateUi() {
      if (!S.uiRects || !live()) return;
      try {
        var rects = readRects(), vw = S.view && S.view.w ? S.view.w : src.width, vh = S.view && S.view.h ? S.view.h : src.height;
        var sig = vw + 'x' + vh + ':';
        for (var i = 0; i < rects.length; i++) { var q = rects[i]; if (q) sig += Math.round(num(q.x, 0)) + ',' + Math.round(num(q.y, 0)) + ',' + Math.round(num(q.w, 0)) + ',' + Math.round(num(q.h, 0)) + ',' + num(q.r, 0) + (q.soft ? ',' + num(q.soft, 0) : '') + ';'; }
        if (sig === S.uiSig) return;
        S.uiSig = sig;
        if (!S.uiCanvas) S.uiCanvas = document.createElement('canvas');
        var cv = S.uiCanvas; if (cv.width !== vw || cv.height !== vh) { cv.width = Math.max(1, vw | 0); cv.height = Math.max(1, vh | 0); }
        var x = cv.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, cv.width, cv.height); x.fillStyle = '#fff';
        var rr = function (rx, ry, rw, rh, rad) {
          if (rad <= 0) { x.fillRect(rx, ry, rw, rh); return; }
          x.beginPath(); x.moveTo(rx + rad, ry); x.arcTo(rx + rw, ry, rx + rw, ry + rh, rad); x.arcTo(rx + rw, ry + rh, rx, ry + rh, rad);
          x.arcTo(rx, ry + rh, rx, ry, rad); x.arcTo(rx, ry, rx + rw, ry, rad); x.closePath(); x.fill();
        };
        for (i = 0; i < rects.length; i++) {
          q = rects[i]; if (!q) continue;
          var rx = Math.round(num(q.x, 0)), ry = Math.round(num(q.y, 0)), rw = Math.round(num(q.w, 0)), rh = Math.round(num(q.h, 0)), rad = clamp(num(q.r, 0), 0, Math.min(rw, rh) / 2);
          if (rw <= 0 || rh <= 0) continue;
          // soft (px, v1.1): the rect stays fully masked; the mask fades to 0 over `soft` px outside it (for text drawn without a backing plate)
          var sf = Math.round(clamp(num(q.soft, 0), 0, 32));
          for (var k = sf; k >= 1; k--) { var gv = Math.round(255 * (1 - k / (sf + 1))); x.fillStyle = 'rgb(' + gv + ',' + gv + ',' + gv + ')'; rr(rx - k, ry - k, rw + 2 * k, rh + 2 * k, rad + k); }
          x.fillStyle = '#fff'; rr(rx, ry, rw, rh, rad);
        }
        S.post.setInput(IN_UI, cv, { filter: 'nearest', live: false });
        S.stats.uiUpdates++;
      } catch (e) { S.stats.errors++; }
    }

    // ---- the two passes
    function lutUniforms(s, p) {
      try {
        if (!clock && s && isFinite(s.ms)) S.lastMs = s.ms;
        guardBuiltin(); updateUi();
        var ms = nowMs();
        return { uMix: mixAt(ms), uStrength: c01(num(P.strength, 1)), uSplit: P.compare >= 0 ? c01(num(P.compare, -1)) : -1 };
      } catch (e) { S.stats.errors++; return { uMix: 1, uStrength: 0, uSplit: -1 }; }
    }
    function lutSkip() {
      if (P.compare >= 0) return false;
      if (num(P.strength, 1) <= 0) return true;
      var A = S.fromLut, B = S.toLut;
      return (!A || A.identity) && (!B || B.identity);
    }
    function lensUniforms(s, p) {
      if (!clock && s && isFinite(s.ms)) S.lastMs = s.ms;
      var ms = nowMs();
      return { uVig: clamp(num(P.vignette, 0), 0, 1), uInk: ink, uGrain: clamp(num(P.grain, 0), 0, 0.3), uGrainSize: clamp(num(P.grainSize, 1.5), 0.5, 16),
        uGrainFrame: Math.floor(ms * clamp(num(P.grainFps, 24), 1, 60) / 1000), uSplit: P.compare >= 0 ? c01(num(P.compare, -1)) : -1 };
    }
    function lensSkip() { return num(P.vignette, 0) <= 0 && num(P.grain, 0) <= 0; }

    // ---- I-08's built-in grade: replace it (off while this runs) or keep it after the LUT without its vignette
    function guardBuiltin() {
      var post = S.post; if (!post || !S.saved) return;
      try {
        if (P.builtin === 'keep') {      // one vignette only: ours wins while it is on
          if (num(P.vignette, 0) > 0 && post.params && num(post.params().vignette, 0) > 0) post.setParams({ vignette: 0 });
        } else {
          var g2 = post.get('grade'); if (g2 && g2.enabled) post.enable('grade', false);
        }
      } catch (e) { }
    }
    function attach(post) {
      S.post = post; S.attached = false;
      if (!post || post.active === false || post.mode === 'off') return;
      try {
        var g = post.get ? post.get('grade') : null;
        S.saved = { gradeEnabled: g ? g.enabled : undefined, vignette: post.params ? post.params().vignette : undefined };
        var a = post.addPass({ name: 'color-grade-lut', order: ORDER_LUT, frag: LUT_FRAG, inputs: { uLutA: IN_A, uLutB: IN_B, uUi: IN_UI },
          uniforms: lutUniforms, skip: lutSkip });
        var b = post.addPass({ name: 'lens-grain', order: ORDER_LENS, frag: LENS_FRAG, inputs: { uUi: IN_UI },
          uniforms: lensUniforms, skip: lensSkip });
        S.attached = !!(a && b);
        if (o.uiMask && o.uiMask.getContext) post.setInput(IN_UI, o.uiMask, { filter: 'nearest', live: true });
        S.uiSig = '';
        guardBuiltin(); upload(); updateUi();
      } catch (e) { S.attached = false; S.stats.errors++; warn('attach: ' + e.message); }
    }
    function detach() {
      var post = S.post; if (!post) return;
      try {
        post.removePass('color-grade-lut'); post.removePass('lens-grain');
        post.removeInput(IN_A); post.removeInput(IN_B);
        if (S.uiRects) post.removeInput(IN_UI);
        if (S.saved) {
          if (S.saved.gradeEnabled !== undefined) post.enable('grade', S.saved.gradeEnabled);
          if (S.saved.vignette !== undefined && P.builtin === 'keep') post.setParams({ vignette: S.saved.vignette });
        }
      } catch (e) { }
      S.attached = false; S.saved = null;
    }
    function hostInstance() {
      try {
        var L = root.GameDNA_Post && root.GameDNA_Post.instances ? root.GameDNA_Post.instances() : [];
        for (var i = 0; i < L.length; i++) if (L[i] && L[i].source === src && L[i] !== (S.owned ? S.post : null)) return L[i];
      } catch (e) { }
      return null;
    }

    // ---- public: blend to a LUT over game time
    function to(name, ms) {
      try {
        name = String(name);
        var dur = ms === undefined || ms === null ? num(P.blend, 900) : Math.max(0, num(ms, 0));
        if (name === S.toName && (S.toLut || !live())) { S.stats.ignored++; return api; }   // already there or on the way: no restart
        if (!table[name]) { S.stats.unknown++; if (S.stats.unknown < 4) warn('unknown LUT "' + name + '" (define it first); ignored'); return api; }
        var now = nowMs();
        S.stats.blends++;
        if (live()) {
          var B = lutFor(name); if (!B) return api;
          var A0 = S.fromLut || identityLut(), B0 = S.toLut || A0, m = mixAt(now);
          var A = m >= 1 ? B0 : m <= 0 ? A0 : (S.stats.bakes++, lerpLut(A0, B0, m));   // start from what is on screen now
          S.fromLut = A; S.toLut = B;
        }
        S.fromName = S.toName; S.toName = name; S.t0 = now; S.dur = dur;
        if (dur <= 0) S.fromName = name;
        upload();
      } catch (e) { S.stats.errors++; }
      return api;
    }
    function setNow(name) {
      try {
        name = String(name);
        if (!table[name]) { S.stats.unknown++; if (S.stats.unknown < 4) warn('unknown LUT "' + name + '"; ignored'); return api; }
        S.fromName = S.toName = name; S.dur = 0; S.t0 = nowMs();
        if (live()) { var L = lutFor(name); S.fromLut = S.toLut = L; upload(); }
      } catch (e) { S.stats.errors++; }
      return api;
    }
    function setP(p) {
      for (var key in p || {}) {
        if (!(key in DEFAULTS)) continue;
        var d = DEFAULTS[key];
        P[key] = typeof d === 'number' ? num(p[key], P[key]) : String(p[key]);
      }
      if (P.builtin !== 'keep') P.builtin = 'replace';
    }

    // ---- set up: share the host's I-08 instance for this canvas, or make our own
    var api = {
      version: VERSION, active: false, mode: 'off', reason: '', post: null,
      to: to,
      set: setNow,
      define: function (name, source) { defineOn(name, source); return api; },
      has: function (name) { return !!table[String(name)]; },
      names: function () { return Object.keys(table); },
      setParams: function (p) {
        try {
          var before = P.builtin, beforeVig = P.vignette;
          setP(p || {});
          if (p && p.preset !== undefined && String(p.preset) !== S.toName) setNow(String(p.preset));
          if (before !== P.builtin && S.post && S.saved) {
            if (P.builtin === 'replace') { if (S.saved.vignette !== undefined) S.post.setParams({ vignette: S.saved.vignette }); }
            else if (S.saved.gradeEnabled !== undefined) S.post.enable('grade', S.saved.gradeEnabled);
          }
          if (P.builtin === 'keep' && beforeVig > 0 && P.vignette <= 0 && S.post && S.saved && S.saved.vignette !== undefined) S.post.setParams({ vignette: S.saved.vignette });
          guardBuiltin();
          if (S.post) S.post.render();
        } catch (e) { S.stats.errors++; }
        return api;
      },
      params: function () { var oo = {}; for (var key in P) oo[key] = P[key]; return oo; },
      compare: function (x) { P.compare = x === false || x === null || x === undefined || !isFinite(Number(x)) ? -1 : c01(Number(x)); if (S.post) S.post.render(); return api; },
      setUiRects: function (r) { S.uiRects = r || null; S.uiSig = ''; if (!r && S.post && live()) S.post.removeInput(IN_UI); updateUi(); return api; },
      render: function (arg) {
        try {
          S.stats.renders++;
          if (S.owned) { var h = hostInstance(); if (h) { detach(); try { S.post.destroy(); } catch (e) { } S.owned = false; attach(h); api.post = h; S.stats.reattached++; refresh(); } }
          updateUi();
          if (S.post) S.post.render(arg);
        } catch (e) { S.stats.errors++; }
        return api;
      },
      state: function () {
        var ms = nowMs(), m = mixAt(ms);
        return { from: S.fromName, to: S.toName, mix: m, blending: m < 1, preset: m >= 1 ? S.toName : S.fromName + '>' + S.toName, ms: ms, strength: P.strength };
      },
      lut: function (name) { return name === undefined ? (S.toLut || null) : lutFor(String(name)); },
      strip: function (name) { var L = name === undefined ? (S.toLut || lutFor(S.toName)) : lutFor(String(name)); return L ? toCanvas(L) : null; },
      setEnabled: function (on) { try { if (S.post && S.attached) { S.post.enable('color-grade-lut', on !== false); S.post.enable('lens-grain', on !== false); } } catch (e) { } return api; },
      stats: function () {
        var oo = {}; for (var key in S.stats) oo[key] = S.stats[key];
        oo.mode = api.mode; oo.reason = api.reason; oo.active = api.active; oo.owned = S.owned; oo.attached = S.attached;
        oo.state = api.state(); oo.uiRects = readRects().length;
        try { oo.passes = S.post && S.post.passes ? S.post.passes() : []; } catch (e) { oo.passes = []; }
        try { var g = S.post && S.post.get ? S.post.get('grade') : null; oo.builtinGrade = g ? g.enabled : null; } catch (e) { oo.builtinGrade = null; }
        return oo;
      },
      destroy: function () { detach(); if (S.owned && S.post) { try { S.post.destroy(); } catch (e) { } } S.post = null; api.post = null; api.active = false; api.reason = 'destroyed'; return api; }
    };
    function refresh() {
      var p = S.post;
      api.post = p; api.active = live(); api.mode = api.active ? (p.mode || 'webgl') : 'off';
      if (!api.active && !api.reason) api.reason = p && p.reason ? p.reason : 'off';
      if (api.active) api.reason = '';
    }

    var off = P.webgl === 'off' || urlOff();
    if (!src || !src.getContext) { api.reason = 'no-canvas'; warn('no canvas given; colour grading off'); }
    else if (off) api.reason = P.webgl === 'off' ? 'option' : 'url';
    else if (!root.GameDNA_Post || !root.GameDNA_Post.create) { api.reason = 'no-webgl-post'; warn('webgl-post.js (GameDNA_Post, I-08) must load before color-grade-lut.js; colour grading off'); }
    else {
      var host = o.post && o.post.addPass ? o.post : hostInstance();
      if (!host) {
        try { host = root.GameDNA_Post.create({ canvas: src, clock: clock || undefined, params: { passes: 'none' }, skin: o.skin, ink: o.ink }); S.owned = !!(host && host.active); }
        catch (e) { host = null; }
      }
      attach(host);
      refresh();
      if (api.active) {
        var start = lutFor(P.preset) ? P.preset : 'neutral';
        S.fromName = S.toName = start; S.fromLut = S.toLut = lutFor(start); upload();
        if (P.compare >= 0) P.compare = c01(P.compare);
      }
    }
    return api;
  }

  root.GameDNA_ColorGrade = {
    version: VERSION, create: create, defaults: DEFAULTS, presets: PRESETS, size: N,
    identity: identity, fromRecipe: fromRecipe, fromFunction: fromFunction, fromArray: fromArray, parseCube: parseCube, fromStrip: fromStrip,
    toCanvas: toCanvas, sample: sample, apply: function (recipe, rgb) { return applyRecipe(recipe || {}, c01(num(rgb[0], 0)), c01(num(rgb[1], 0)), c01(num(rgb[2], 0))); },
    shaders: { lut: LUT_FRAG, lens: LENS_FRAG }, orders: { lut: ORDER_LUT, lens: ORDER_LENS }
  };
})(typeof window !== 'undefined' ? window : this);
