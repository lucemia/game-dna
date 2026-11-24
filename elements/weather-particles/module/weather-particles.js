/* GameDNA E-06 · Weather & ambient particles · module v1 (plain script, no dependencies, one global)
 *
 *   const wx = GameDNA_Weather.create({
 *     view: { x: 0, y: 0, w: 320, h: 180 },   // screen rect (native px) the weather fills; keep it above / beside the HUD
 *     seed: 1, weather: 'rain',               // 'none' | 'rain' | 'snow' | 'dust' | 'fireflies' | 'leaves'
 *     params: { density: 1, intensity: 0.5, wind: 0.4, gust: 0.35, ... },   // see DEFAULTS
 *     ground: x => groundTopY,                // optional: number, or function(screenX) -> screen y (null = pit). Omit = top-down.
 *     uiRects: () => [{ x, y, w, h }],        // optional: screen rects never drawn over (HUD, windows, dialog)
 *     skin: 'pixel16'                         // optional; needs GameDNA_Skin, else a built-in pixel16 look
 *   });
 *   wx.update(dtMs)                    // world time, in the fixed step (?t= fast-forward runs it); 0 while frozen
 *   wx.drawBack(ctx, camX, camY)       // after the background, before tiles / sprites (far + mid layers, storm shade)
 *   wx.drawFront(ctx, camX, camY)      // after sprites, before HUD (near layer)
 *   wx.draw(ctx, camX, camY)           // both at once (one slot, e.g. top-down after the map)
 *   wx.setWeather(kind, fadeMs)        // cross-fade
 *
 * Every particle position is a pure function of (seed, clock, camera, view, params, weather history): no particle state,
 * so the same clock and camera always give the same pixels (?t=&freeze=1 stable), whatever the step sizes were.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var KINDS = ['none', 'rain', 'snow', 'dust', 'fireflies', 'leaves'];
  var ALIAS = { clear: 'none', off: 'none', '': 'none', storm: 'rain', drizzle: 'rain', shower: 'rain', blizzard: 'snow', flurry: 'snow',
    motes: 'dust', ash: 'dust', pollen: 'dust', spores: 'dust', firefly: 'fireflies', bugs: 'fireflies', leaf: 'leaves', petals: 'leaves', autumn: 'leaves' };
  var DEFAULTS = { density: 1, intensity: 0.5, wind: 0.4, gust: 0.35, parallax: 1, front: 0.25, night: 0, fade: 1500, cap: 180, shade: 0, splash: 'on', uiMode: 'hide' };
  var LIMITS = { density: [0, 2], intensity: [0, 1], wind: [-2, 2], gust: [0, 1], parallax: [0, 1.5], front: [0, 0.6], night: [0, 1], fade: [0, 6000], cap: [20, 400], shade: [0, 0.5] };
  // particles at density 1 on a 256x224 field (scaled by view area); rain and snow also scale with intensity
  var BASE = { rain: 150, snow: 130, dust: 160, fireflies: 44, leaves: 60 };
  // depth layers: far + mid are drawn by drawBack (behind sprites), near by drawFront
  var LAYERS = [
    { name: 'far', pass: 'back', par: 0.55, spd: 0.62, tone: 0 },
    { name: 'mid', pass: 'back', par: 0.85, spd: 0.85, tone: 1 },
    { name: 'near', pass: 'front', par: 1.25, spd: 1.2, tone: 2 }
  ];
  var BUILTIN = { id: 'pixel16', pixel: true,
    palette: { ink: '#06061a', paper: '#f4f6ff', fx: { hot: '#ff7a3a', cold: '#6ad8f0', heal: '#4ad870', crit: '#ffb43a', white: '#ffffff' } },
    motion: { fadeSteps: [1, 0.75, 0.5, 0.25] } };
  var M = 24, TOP = 16;
  // leaf sprites per flutter frame (0 diagonal, 1 face-on, 2 other diagonal, 3 edge-on): small (mid layer) then big (near)
  var LEAF = [
    // small (far and mid): diagonal, face-on, other diagonal, edge-on
    ['..oo', '.oAo', 'oAao', 'soo.'], ['.ooo.', 'sAaAo', '.ooo.'], ['oo..', 'oaAo', '.oAo', '..os'], ['sAAAo'],
    // big (near): a pointed leaf with a stem and a vein
    ['....ooo', '...oAAo', '..oAaAo', '.oAaAo.', 'oAaAo..', 'oAAo...', 's.o....'], ['..oooo..', '.oAAAAo.', 'sAaaaaAo', '.oAAAAo.', '..oooo..'],
    ['ooo....', 'oAAo...', 'oAaAo..', '.oAaAo.', '..oAaAo', '...oAAo', '....o.s'], ['.oooooo', 'sAaaaAo', '.oooooo']
  ];
  var LEAFC = {};
  function LEAFCOL(base, k) { var key = base + k; return LEAFC[key] || (LEAFC[key] = k === 'o' ? mix(base, '#140c10', 0.55) : mix(base, '#ffffff', 0.35)); }   // horizontal wrap margin, spawn band above the view

  /* ---------- helpers ---------- */
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mod(a, n) { return ((a % n) + n) % n; }
  function hash(a, b, c) { var h = (a * 374761393 + b * 668265263 + c * 2147483647 + 1013904223) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h = Math.imul(h ^ (h >>> 16), 2246822519); return (h ^ (h >>> 13)) >>> 0; }
  function rgb(c) { c = String(c || '#ffffff'); if (c[0] === '#') { if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; } var m = c.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/); return m ? [+m[1], +m[2], +m[3]] : [255, 255, 255]; }
  function hex(a) { return '#' + a.map(function (v) { v = clamp(Math.round(v), 0, 255); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return hex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  function rectOf(o) {
    if (!o) return null;
    if (Array.isArray(o)) o = { x: o[0], y: o[1], w: o[2], h: o[3] };
    var x = num(o.x, NaN), y = num(o.y, NaN), w = num(o.w != null ? o.w : o.width, NaN), h = num(o.h != null ? o.h : o.height, NaN);
    return isFinite(x) && isFinite(y) && w > 0 && h > 0 ? { x: x, y: y, w: w, h: h } : null;
  }
  function hits(r, x, y, w, h) { return x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y; }
  function kindOf(k) { k = String(k == null ? 'none' : k).toLowerCase(); if (ALIAS[k] != null) k = ALIAS[k]; return KINDS.indexOf(k) >= 0 ? k : null; }

  /* ---------- palette: from the skin (palette.weather.* wins), else derived from its fx / ink / paper tokens ---------- */
  function paletteOf(SK) {
    var P = (SK && SK.palette) || BUILTIN.palette, fx = P.fx || BUILTIN.palette.fx, ink = P.ink || '#06061a', paper = P.paper || '#f4f6ff';
    var cold = fx.cold || '#6ad8f0', heal = fx.heal || '#4ad870', crit = fx.crit || '#ffb43a', hot = fx.hot || '#ff7a3a', W = P.weather || {};
    function pick(k, d) { var v = W[k]; return Array.isArray(v) && v.length >= d.length ? v.map(String) : d; }
    return {
      // [far, mid, near, highlight]
      rain: pick('rain', [mix(cold, ink, 0.42), mix(cold, paper, 0.3), mix(cold, paper, 0.62), paper]),
      snow: pick('snow', [mix(paper, cold, 0.18), paper, paper, mix(paper, cold, 0.5)]),
      dust: pick('dust', [mix(paper, crit, 0.42), mix(paper, crit, 0.28), mix(paper, crit, 0.14), paper]),
      // [glow, core, hot centre, halo dark]
      fireflies: pick('fireflies', [mix(crit, heal, 0.38), mix(crit, paper, 0.4), mix(paper, crit, 0.12), mix(heal, ink, 0.7)]),
      // [leaf A, leaf B, leaf C, vein / shade]
      leaves: pick('leaves', [mix(crit, paper, 0.15), hot, mix(hot, ink, 0.42), mix(heal, crit, 0.55)]),
      shade: W.shade || mix(ink, cold, 0.28)
    };
  }

  function create(opts) {
    opts = opts || {};
    var warned = {};
    function warn(key, msg) { if (warned[key]) return; warned[key] = 1; try { (opts.onWarn || (root.console && console.warn) || function () {}).call(root.console, '[GameDNA_Weather] ' + msg); } catch (e) { } }
    var SK = null;
    try { SK = opts.skin === false || !root.GameDNA_Skin ? null : root.GameDNA_Skin.resolve(opts.skin); } catch (e) { SK = null; }
    var PIX = SK ? SK.pixel !== false : true;
    var PAL = paletteOf(SK);
    var FADES = (SK && SK.motion && SK.motion.fadeSteps) || (PIX ? BUILTIN.motion.fadeSteps : null);
    var seed = (num(opts.seed, 1) | 0) || 1;
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    var view = { x: 0, y: 0, w: 256, h: 224 };
    var clockMs = 0;
    var hist = [];          // [{kind, at, fade}] newest last; the weather at time t is the last entry with at <= t, fading from the one before
    var groundOpt = opts.ground;
    var uiOpt = opts.uiRects;
    var last = { back: [], front: [] }, lastStats = { back: null, front: null }, lastUI = [];

    function setParams(o) {
      if (!o) return;
      for (var key in o) {
        if (!(key in DEFAULTS)) continue;
        var v = o[key];
        if (key === 'splash') P.splash = String(v) === 'off' || v === false ? 'off' : 'on';
        else if (key === 'uiMode') P.uiMode = String(v) === 'dim' ? 'dim' : 'hide';
        else { v = num(v, DEFAULTS[key]); P[key] = clamp(v, LIMITS[key][0], LIMITS[key][1]); }
      }
    }
    function setView(r) { var v = rectOf(r); if (v) view = { x: Math.round(v.x), y: Math.round(v.y), w: Math.max(8, Math.round(v.w)), h: Math.max(8, Math.round(v.h)) }; else if (r != null) warn('view', 'bad view rect; keeping ' + JSON.stringify(view)); }
    if (opts.view || opts.bounds) setView(opts.view || opts.bounds); else warn('noview', 'no view given; using 256x224 at 0,0');
    setParams(opts.params);
    var k0 = kindOf(opts.weather != null ? opts.weather : 'rain');
    if (k0 == null) { warn('kind', 'unknown weather "' + opts.weather + '"; using none'); k0 = 'none'; }
    hist.push({ kind: k0, at: -1e9, fade: 0 });

    /* ---------- weather mix at time t: [{kind, w}] (count weights; sum <= 1 per kind) ---------- */
    function mixAt(t) {
      var i = hist.length - 1;
      while (i > 0 && hist[i].at > t) i--;
      var cur = hist[i], out = [];
      var kf = cur.fade > 0 ? clamp((t - cur.at) / cur.fade, 0, 1) : 1;
      if (kf < 1 && i > 0) {
        // the previous weather may itself have been mid-fade; take its mix at the switch time, scaled down
        var prev = mixAt(cur.at - 1e-6);
        prev.forEach(function (m) { if (m.kind !== cur.kind) out.push({ kind: m.kind, w: m.w * (1 - kf) }); else kf = Math.max(kf, m.w); });
      }
      if (cur.kind !== 'none') out.push({ kind: cur.kind, w: kf });
      return out;
    }

    /* ---------- wind: px/s at time T (s), and its integral (analytic, so drift is exact at any T) ---------- */
    var PH = [0, 1, 2, 3].map(function (i) { return hash(seed, i, 91) / 4294967296 * 6.283; });
    var WA = [0.37, 0.91, 2.3, 0.23];
    function windAt(T) {
      var s = P.wind < 0 ? -1 : 1, g = 0.5 * Math.sin(WA[0] * T + PH[0]) + 0.3 * Math.sin(WA[1] * T + PH[1]) + 0.2 * Math.sin(WA[2] * T + PH[2]);
      var b = Math.sin(WA[3] * T + PH[3]); g += 1.6 * b * b - 0.8;   // slow swells: the gusts
      return 30 * (P.wind + s * P.gust * g);
    }
    function windInt(T) {
      var s = P.wind < 0 ? -1 : 1;
      var G = -0.5 / WA[0] * Math.cos(WA[0] * T + PH[0]) - 0.3 / WA[1] * Math.cos(WA[1] * T + PH[1]) - 0.2 / WA[2] * Math.cos(WA[2] * T + PH[2]);
      G += 1.6 * (T / 2 - Math.sin(2 * (WA[3] * T + PH[3])) / (4 * WA[3])) - 0.8 * T;
      return 30 * (P.wind * T + s * P.gust * G);
    }

    /* ---------- host callbacks (never throw) ---------- */
    function readUI() {
      var src = uiOpt, out = [];
      try { if (typeof src === 'function') src = src(); } catch (e) { warn('uiRects', 'uiRects() threw: ' + (e && e.message)); src = null; }
      if (Array.isArray(src)) for (var i = 0; i < src.length; i++) { var r = rectOf(src[i]); if (r) out.push(r); }
      return out;
    }
    function groundFn() {
      var g = groundOpt;
      if (g == null || g === 'scatter' || g === false) return null;
      if (typeof g === 'number' || (typeof g === 'string' && isFinite(+g))) { var y = +g; return function () { return y; }; }
      if (typeof g !== 'function') { warn('ground', 'ground must be a number or function(screenX); treating as top-down'); return null; }
      var cache = {};
      return function (x) {
        var xi = Math.round(x);
        if (xi in cache) return cache[xi];
        var v = null;
        try { v = g(xi); } catch (e) { warn('groundThrow', 'ground() threw: ' + (e && e.message)); v = null; }
        v = v == null || !isFinite(+v) ? null : Math.round(+v);
        return (cache[xi] = v);
      };
    }

    /* ---------- counts per layer for one kind at weight w (the budget cap holds for the whole mix) ---------- */
    function counts(kind, w) {
      var area = (view.w * view.h) / (256 * 224);
      var n = BASE[kind] * P.density * area * w;
      if (kind === 'rain' || kind === 'snow') n *= 0.55 + 0.9 * P.intensity;
      n = Math.min(Math.round(n), Math.round(P.cap * w));
      var near = Math.round(n * P.front), rest = n - near, far = Math.round(rest * 0.45);
      return [far, rest - far, near];
    }

    /* ---------- collect: everything a pass would draw, as plain items (pure: no drawing, no state) ---------- */
    function collect(pass, tMs, camX, camY) {
      camX = num(camX, 0); camY = num(camY, 0);
      var T = tMs / 1000, items = [], G = groundFn(), ui = readUI(), mixes = mixAt(tMs);
      var WW = view.w + 2 * M, stats = { far: 0, mid: 0, near: 0, splashes: 0, resting: 0, uiHidden: 0, uiDimmed: 0, total: 0, shade: 0 };
      var windNow = windAt(T);
      if (pass === 'back' && P.shade > 0) {
        var sw = 0; mixes.forEach(function (m) { if (m.kind === 'rain' || m.kind === 'snow') sw += m.w; });
        stats.shade = Math.round(P.shade * Math.min(1, sw) * 100) / 100;
      }
      // per-layer counts for every weather in the mix; the budget cap holds for the sum of all layers of both passes
      var CN = mixes.map(function (m) { return counts(m.kind, m.w); }), sum = 0;
      CN.forEach(function (c) { sum += c[0] + c[1] + c[2]; });
      if (sum > P.cap) CN = CN.map(function (c) { return c.map(function (n) { return Math.floor(n * P.cap / sum); }); });
      for (var mi = 0; mi < mixes.length; mi++) {
        var kind = mixes[mi].kind, cn = CN[mi], salt = KINDS.indexOf(kind) * 7919;
        for (var li = 0; li < 3; li++) {
          var L = LAYERS[li];
          if (L.pass !== pass) continue;
          var fac = 1 + (L.par - 1) * P.parallax, cx = camX * fac, cy = camY * fac;
          for (var i = 0; i < cn[li]; i++) {
            var id = salt + li * 100003 + i, it = null;
            if (kind === 'rain' || kind === 'snow' || kind === 'leaves') it = faller(kind, L, li, id, T, cx, cy, WW, G);
            else if (kind === 'dust') it = mote(L, li, id, T, cx, cy, WW, G);
            else if (kind === 'fireflies') it = firefly(L, li, id, T, cx, cy, WW, G);
            if (!it) continue;
            it.kind = kind; it.layer = L.name; it.tone = L.tone; it.id = id; it.wind = windNow;
            // keep inside the view
            if (it.x + it.w <= view.x || it.y + it.h <= view.y || it.x >= view.x + view.w || it.y >= view.y + view.h) continue;
            // UI rects: hide (default) or dim
            var inUI = false;
            for (var u = 0; u < ui.length; u++) if (hits(ui[u], it.x - 1, it.y - 1, it.w + 2, it.h + 2)) { inUI = true; break; }
            if (inUI) { if (P.uiMode === 'hide') { stats.uiHidden++; continue; } it.dim = true; stats.uiDimmed++; }
            stats[L.name]++; stats.total++;
            if (it.state === 'splash') stats.splashes++; else if (it.state === 'rest') stats.resting++;
            items.push(it);
          }
        }
      }
      return { items: items, stats: stats, ui: ui };
    }

    // rain, snow, leaves: fall through a band from above the view to its bottom; land on the ground (splash / melt / rest)
    function faller(kind, L, li, id, T, cx, cy, WW, G) {
      var span = view.h + TOP + 8, I = P.intensity;
      var base = kind === 'rain' ? 150 + 230 * I : kind === 'snow' ? 16 + 34 * I : 18 + 22 * I;
      var sp = base * L.spd * (0.85 + 0.3 * hash(id, 1, seed) / 4294967296);
      var u = hash(id, 2, seed) / 4294967296;
      var yo = u * span + T * sp - cy, cyc = Math.floor(yo / span), f = yo - cyc * span;
      var x0 = hash(id, cyc, seed + 3) / 4294967296 * WW;
      var wk = kind === 'rain' ? 3 : kind === 'snow' ? 0.8 : 1.15;
      var ph = hash(id, 5, seed) / 4294967296 * 6.283, om = (kind === 'leaves' ? 1.6 : 0.9) + hash(id, 6, seed) / 4294967296 * 1.4;
      var amp = kind === 'snow' ? 2 + 4 * hash(id, 7, seed) / 4294967296 : kind === 'leaves' ? 5 + 7 * hash(id, 7, seed) / 4294967296 : 0;
      function xAt(t) { var ts = T - f / sp; return x0 + (windInt(t) - windInt(ts)) * wk * L.spd + amp * Math.sin(t * om + ph); }
      var xw = xAt(T) - cx, x = view.x - M + mod(xw, WW), y = view.y - TOP + f;
      // where this particle lands
      var gy, lift = li === 0 ? 3 + Math.floor(12 * hash(id, cyc, seed + 9) / 4294967296) : li === 1 ? Math.floor(3 * hash(id, cyc, seed + 9) / 4294967296) : 0;
      if (G) {
        gy = G(x);
        if (gy == null) gy = view.y + view.h + 8;           // a pit: keep falling
        else gy -= lift;                                     // far drops end farther back
      } else {
        // top-down: each particle lands on a seeded spot in the field
        gy = view.y + Math.floor(view.h * (0.18 + 0.8 * hash(id, cyc, seed + 9) / 4294967296));
      }
      var it = { x: 0, y: 0, w: 1, h: 1, state: 'fall' };
      if (y >= gy) {
        var dl = (y - gy) / sp;                               // seconds since landing
        var xl = view.x - M + mod(xAt(T - dl) - cx, WW);
        if (G) {
          // the ground where it actually landed (after the wind drift): none (a pit) or a different height (a ledge edge) -> no splash / rest
          var gl = G(xl);
          if (gl == null || Math.abs(gl - lift - gy) > 1) return null;
        }
        if (kind === 'rain') {
          if (li === 0 || P.splash === 'off' || dl >= 0.15) return null;
          var fr = Math.floor(dl / 0.05), r = li === 2 ? 1 : 0;
          it.state = 'splash'; it.frame = fr; it.big = r;
          it.x = Math.round(xl) - 2 - fr - r; it.y = gy - 3 - r + (fr === 2 ? 1 : 0); it.w = 5 + 2 * fr + 2 * r; it.h = 3 + r; it.cx = Math.round(xl); it.gy = gy;
          return it;
        }
        if (kind === 'snow') {
          if (dl >= 0.45) return null;
          it.state = 'rest'; it.x = Math.round(xl); it.y = gy - 1; it.w = li === 2 && dl < 0.25 ? 2 : 1; it.h = 1; it.age = dl / 0.45;
          return it;
        }
        // leaves rest on the ground for a moment, then fade
        if (dl >= 1.2 || li === 0) return null;
        it.state = 'rest'; it.age = dl / 1.2; it.big = li === 2 ? 1 : 0; it.frame = 1; it.col = hash(id, cyc, seed + 11) % 4; it.flip = hash(id, cyc, seed + 13) & 1;
        var rr0 = LEAF[it.big * 4 + 1]; it.w = rr0[0].length; it.h = rr0.length; it.x = Math.round(xl) - (it.w >> 1); it.y = gy - it.h + 1;
        return it;
      }
      if (kind === 'rain') {
        var vx = windAt(T) * wk * L.spd, slope = clamp(vx / sp, -1.2, 1.2), len = Math.max(3, Math.round((4 + 9 * I) * L.spd * (li === 2 ? 1.2 : 1)));
        var hx = Math.round(x), hy = Math.round(y), tx = Math.round(x - slope * (len - 1)), ty = hy - len + 1;
        it.x = Math.min(hx, tx); it.y = ty; it.w = Math.abs(hx - tx) + 1; it.h = len; it.hx = hx; it.hy = hy; it.slope = slope; it.len = len;
        // stop the streak at the ground line
        if (G && hy > gy - 1) { var cut = hy - (gy - 1); it.len = Math.max(1, len - cut); it.hy = gy - 1; it.h = it.len; it.y = it.hy - it.len + 1; }
        return it;
      }
      if (kind === 'snow') {
        var s = li === 2 ? 3 : li === 1 ? 2 : 1;
        it.x = Math.round(x) - (s === 3 ? 1 : 0); it.y = Math.round(y) - (s === 3 ? 1 : 0); it.w = s; it.h = s; it.size = s;
        var wn = windAt(T);
        if (li >= 1 && Math.abs(wn) > 30) { it.smear = wn > 0 ? -1 : 1; it.w += 1; if (it.smear < 0) it.x -= 1; }   // driven snow: a trailing pixel upwind
        return it;
      }
      // leaves: flutter frame from the sway phase (0 diag, 1 flat, 2 other diag, 3 edge-on)
      var fl = Math.sin(T * om * 1.7 + ph * 2), fr2 = fl > 0.6 ? 0 : fl > -0.1 ? 1 : fl > -0.7 ? 2 : 3;
      var big = li === 2 ? 1 : 0;
      it.frame = fr2; it.big = big; it.col = hash(id, cyc, seed + 11) % 4;
      var rows = LEAF[big * 4 + fr2];
      it.flip = hash(id, cyc, seed + 13) & 1;
      it.x = Math.round(x) - (rows[0].length >> 1); it.y = Math.round(y) - 1; it.w = rows[0].length; it.h = rows.length;
      return it;
    }

    // dust motes: slow drift and bob in the air above the ground, twinkling
    function mote(L, li, id, T, cx, cy, WW, G) {
      var HH = view.h + 2 * M, I = P.intensity;
      var vx = (hash(id, 1, seed) / 4294967296 - 0.5) * (3 + 6 * I), hy = hash(id, 4, seed) / 4294967296;
      var x0 = hash(id, 3, seed) / 4294967296 * WW, y0 = M + view.h * (0.18 + 0.64 * Math.sqrt(hy));   // denser low (above the ground), where trees and walls give contrast
      var a = 0.4 + hash(id, 5, seed) / 4294967296 * 0.8, b = 0.3 + hash(id, 6, seed) / 4294967296 * 0.7, ph = hash(id, 7, seed) / 4294967296 * 6.283;
      var xw = x0 + vx * T + windInt(T) * 0.12 * L.spd + 5 * Math.sin(T * a + ph) - cx;
      var yw = y0 + 6 * Math.sin(T * b + ph * 1.3) - cy;
      var x = Math.round(view.x - M + mod(xw, WW)), y = Math.round(view.y - M + mod(yw, HH));
      if (G) { var gy = G(x); if (gy != null && y > gy - 2) return null; }
      var tw = 0.5 + 0.5 * Math.sin(T * (1.1 + b * 2) + ph * 3);           // twinkle 0..1
      var br = (0.55 + 0.45 * tw) * (1 - 0.25 * P.night) * (0.7 + 0.3 * I);
      // near: 2x2 speck, a 3x3 sparkle at twinkle peaks; mid: 1 px, a sparkle at peaks; far: 1 px
      var sz = li === 2 ? (tw > 0.65 ? 3 : 2) : li === 1 ? (tw > 0.8 ? 3 : tw > 0.45 ? 2 : 1) : 1;
      var o = sz === 3 ? 1 : 0;
      return { x: x - o, y: y - o, w: sz === 2 ? 2 : 2 * o + 1, h: sz === 2 ? 2 : 2 * o + 1, cx: x, cy: y, state: 'float', bright: br, size: sz };
    }

    // fireflies: wander low above the ground, pulse on and off; glow grows with night
    function firefly(L, li, id, T, cx, cy, WW, G) {
      var HH = view.h + 2 * M;
      var x0 = hash(id, 3, seed) / 4294967296 * WW, yf = 0.3 + 0.62 * hash(id, 4, seed) / 4294967296;
      var a = 0.25 + hash(id, 5, seed) / 4294967296 * 0.5, b = 0.6 + hash(id, 6, seed) / 4294967296 * 0.9, ph = hash(id, 7, seed) / 4294967296 * 6.283;
      var xw = x0 + 16 * Math.sin(T * a + ph) + 6 * Math.sin(T * b * 1.9 + ph * 2) + windInt(T) * 0.04 - cx;
      var x = Math.round(view.x - M + mod(xw, WW));
      var bob = 7 * Math.sin(T * b + ph * 1.7), y;
      if (G) {   // side view: hover a little above the ground under them (screen space)
        var gy = G(x), hh = hash(id, 8, seed) / 4294967296, lo, hi;
        if (gy == null) gy = view.y + Math.round(view.h * 0.82);     // over a pit: keep the band of the field
        lo = gy - 6; hi = li === 0 ? gy - 48 : gy - 32;             // far ones may drift up into a tree line
        y = Math.round(clamp(lo - (lo - hi) * hh + bob * 0.6, hi, lo));
      } else y = Math.round(view.y - M + mod(yf * HH + bob - cy, HH));   // top-down: spread over the field, scroll with the camera
      // pulse: period 2.4-4.4 s, lit for ~55 % of it with a ramp
      var per = 2.4 + 2 * hash(id, 9, seed) / 4294967296, q = mod(T / per + hash(id, 10, seed) / 4294967296, 1);
      var lit = q < 0.55 ? Math.sin(q / 0.55 * Math.PI) : 0;
      lit *= 0.55 + 0.45 * P.intensity;
      if (lit < 0.12) return null;
      var glow = P.night >= 0.6 ? 2 : P.night >= 0.25 ? 1 : 0, rr = glow === 2 ? 2 : 1;
      var core = li === 2 ? 2 : 1;
      return { x: x - rr, y: y - rr, w: core + 2 * rr, h: core + 2 * rr, state: 'glow', lit: lit, glow: glow, core: core, px: x, py: y, near: li === 2 };
    }

    /* ---------- drawing ---------- */
    function alphaStep(a) {
      if (!FADES) return a;
      for (var i = 0; i < FADES.length; i++) if (a >= FADES[i] - 1e-9) return FADES[i];
      return a < FADES[FADES.length - 1] * 0.5 ? 0 : FADES[FADES.length - 1];
    }
    function rect(ctx, x, y, w, h) { ctx.fillRect(x, y, w, h); }
    function drawItem(ctx, it, ga) {
      var a = ga * (it.dim ? 0.5 : 1), pal;
      if (a <= 0) return;
      if (it.kind === 'rain') {
        pal = PAL.rain;
        if (it.state === 'splash') {
          ctx.globalAlpha = alphaStep(a * (it.frame === 2 ? 0.6 : 0.9)); ctx.fillStyle = it.big ? pal[2] : pal[1];
          var c = it.cx, g = it.gy, r = it.big;
          if (it.frame === 0) { rect(ctx, c, g - 1, 1, 1); rect(ctx, c - 1, g - 2 - r, 1, 1); rect(ctx, c + 1, g - 2 - r, 1, 1); }
          else if (it.frame === 1) { rect(ctx, c - 2 - r, g - 2 - r, 1, 1); rect(ctx, c + 2 + r, g - 2 - r, 1, 1); rect(ctx, c - 1, g - 1, 1, 1); rect(ctx, c + 1, g - 1, 1, 1); }
          else { rect(ctx, c - 3 - r, g - 1, 1, 1); rect(ctx, c + 3 + r, g - 1, 1, 1); }
          return;
        }
        ctx.globalAlpha = alphaStep(a * (it.tone === 0 ? 0.75 : 1));
        ctx.fillStyle = pal[it.tone];
        if (!PIX) { ctx.lineWidth = it.tone === 2 ? 1.2 : 1; ctx.strokeStyle = pal[it.tone]; ctx.beginPath(); ctx.moveTo(it.hx + 0.5, it.hy + 1); ctx.lineTo(it.hx - it.slope * it.len + 0.5, it.hy - it.len + 1); ctx.stroke(); return; }
        // stepped streak: vertical runs of whole pixels along the slope; near drops 2 px wide with a bright head
        var run0 = 0, xPrev = it.hx, wdt = 1;
        for (var j = 1; j <= it.len; j++) {
          var xj = j < it.len ? Math.round(it.hx - it.slope * j) : NaN;
          if (xj !== xPrev) { rect(ctx, xPrev, it.hy - j + 1, wdt, j - run0); run0 = j; xPrev = xj; }
        }
        if (it.tone >= 1) { ctx.fillStyle = pal[3]; ctx.globalAlpha = alphaStep(a * (it.tone === 2 ? 1 : 0.5)); rect(ctx, it.hx, it.hy, 1, 1); }
        return;
      }
      if (it.kind === 'snow') {
        pal = PAL.snow;
        if (it.state === 'rest') { ctx.globalAlpha = alphaStep(a * (1 - it.age * 0.7)); ctx.fillStyle = pal[3]; rect(ctx, it.x, it.y, it.w, 1); return; }
        if (it.smear) { ctx.globalAlpha = alphaStep(a * 0.5); ctx.fillStyle = pal[it.tone]; rect(ctx, it.smear < 0 ? it.x : it.x + it.w - 1, it.y + (it.size === 3 ? 1 : 0), 1, 1); }
        ctx.globalAlpha = alphaStep(a); ctx.fillStyle = pal[it.tone];
        var sx0 = it.x + (it.smear < 0 ? 1 : 0); if (it.smear) it = { x: sx0, y: it.y, w: it.size, h: it.size, size: it.size, tone: it.tone };
        if (!PIX) { ctx.beginPath(); ctx.arc(it.x + it.w / 2, it.y + it.h / 2, it.size === 3 ? 1.5 : it.size === 2 ? 1 : 0.7, 0, 6.283); ctx.fill(); return; }
        if (it.size === 3) { rect(ctx, it.x + 1, it.y, 1, 3); rect(ctx, it.x, it.y + 1, 3, 1); ctx.fillStyle = pal[3]; rect(ctx, it.x + 2, it.y + 2, 1, 1); ctx.fillStyle = pal[2]; rect(ctx, it.x + 1, it.y + 1, 1, 1); }
        else if (it.size === 2) { rect(ctx, it.x, it.y, 2, 2); ctx.fillStyle = pal[3]; rect(ctx, it.x + 1, it.y + 1, 1, 1); }
        else rect(ctx, it.x, it.y, 1, 1);
        return;
      }
      if (it.kind === 'dust') {
        pal = PAL.dust;
        var cx = it.cx, cy = it.cy, tn = Math.min(3, it.tone + (it.bright > 0.85 ? 1 : 0));
        ctx.globalAlpha = alphaStep(a * it.bright); ctx.fillStyle = pal[tn];
        if (!PIX) { ctx.beginPath(); ctx.arc(cx + 0.5, cy + 0.5, it.size === 3 ? 1.3 : it.size === 2 ? 1 : 0.6, 0, 6.283); ctx.fill(); return; }
        if (it.size === 3) {   // sparkle: bright centre, arms one step dimmer
          ctx.fillStyle = pal[3]; rect(ctx, cx, cy, 1, 1);
          ctx.globalAlpha = alphaStep(a * it.bright * 0.8); ctx.fillStyle = pal[Math.max(tn, 2)];
          rect(ctx, cx - 1, cy, 1, 1); rect(ctx, cx + 1, cy, 1, 1); rect(ctx, cx, cy - 1, 1, 1); rect(ctx, cx, cy + 1, 1, 1);
        } else if (it.size === 2) { rect(ctx, cx, cy, 2, 2); ctx.fillStyle = pal[3]; rect(ctx, cx, cy, 1, 1); }
        else rect(ctx, cx, cy, 1, 1);
        return;
      }
      if (it.kind === 'fireflies') {
        pal = PAL.fireflies;
        var x = it.px, y = it.py, cr = it.core;
        if (!PIX) {
          var gr = ctx.createRadialGradient(x + cr / 2, y + cr / 2, 0, x + cr / 2, y + cr / 2, 2 + it.glow * 2.5);
          gr.addColorStop(0, pal[2]); gr.addColorStop(0.35, pal[0]); gr.addColorStop(1, 'rgba(0,0,0,0)');
          var op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * it.lit; ctx.fillStyle = gr;
          ctx.fillRect(x - 6, y - 6, 12 + cr, 12 + cr); ctx.globalCompositeOperation = op;
          if (it.glow === 0) { ctx.globalAlpha = a; ctx.fillStyle = pal[3]; ctx.fillRect(x, y + cr, cr, 1); }
          return;
        }
        if (it.glow === 2) {   // night: 5x5 halo, solid inner ring, dithered outer ring
          for (var dy = -2; dy <= 1 + cr; dy++) for (var dx = -2; dx <= 1 + cr; dx++) {
            var ex = dx < 0 ? -dx : dx >= cr ? dx - cr + 1 : 0, ey = dy < 0 ? -dy : dy >= cr ? dy - cr + 1 : 0, e = ex + ey;
            if (e === 0 || e > 3 || (ex === 2 && ey === 2)) continue;
            if (e >= 2 && ((x + dx + y + dy) & 1) && !(it.near && it.lit > 0.8)) continue;
            ctx.globalAlpha = alphaStep(a * it.lit * (e === 1 ? 1 : 0.6)); ctx.fillStyle = pal[0];
            rect(ctx, x + dx, y + dy, 1, 1);
          }
        } else {
          // dusk: a solid cross; day: a cross at half strength over a dark body pixel, so the bug reads against bright grass
          if (it.glow === 0) { ctx.globalAlpha = alphaStep(a); ctx.fillStyle = pal[3]; rect(ctx, x, y + cr, cr, 1); }
          ctx.globalAlpha = alphaStep(a * it.lit * (it.glow === 1 ? 1 : 0.6)); ctx.fillStyle = pal[0];
          rect(ctx, x - 1, y, 1, cr); rect(ctx, x + cr, y, 1, cr); rect(ctx, x, y - 1, cr, 1); if (it.glow === 1) rect(ctx, x, y + cr, cr, 1);
        }
        ctx.globalAlpha = alphaStep(a * Math.min(1, it.lit * 1.5)); ctx.fillStyle = it.lit > 0.6 ? pal[2] : pal[1];
        rect(ctx, x, y, cr, cr);
        return;
      }
      if (it.kind === 'leaves') {
        // o outline, A body, a vein / light side, s stem; each leaf has one of four colours
        var base = PAL.leaves[it.col % 4], CL = { o: LEAFCOL(base, 'o'), A: base, a: LEAFCOL(base, 'a'), s: LEAFCOL(base, 'o') };
        var al = it.state === 'rest' ? a * (it.age > 0.7 ? 1 - (it.age - 0.7) / 0.3 : 1) : a;
        ctx.globalAlpha = alphaStep(al * (it.tone === 0 ? 0.75 : 1));
        var rows = LEAF[(it.big ? 4 : 0) + (it.state === 'rest' ? 1 : it.frame)];
        if (it.flip) rows = rows.map(function (r) { return r.split('').reverse().join(''); });
        for (var ry = 0; ry < rows.length; ry++) for (var rx = 0; rx < rows[ry].length; rx++) {
          var ch = rows[ry][rx]; if (ch === '.') continue;
          ctx.fillStyle = CL[ch]; rect(ctx, it.x + rx, it.y + ry, 1, 1);
        }
      }
    }

    function drawPass(pass, ctx, camX, camY) {
      var res;
      try { res = collect(pass, clockMs, camX, camY); } catch (e) { warn('collect', 'internal error: ' + (e && e.message)); res = { items: [], stats: null, ui: [] }; }
      last[pass] = res.items; lastStats[pass] = res.stats; lastUI = res.ui;
      if (!ctx || typeof ctx.fillRect !== 'function') { warn('ctx', 'draw needs a 2D canvas context'); return; }
      var ga = ctx.globalAlpha, fs = ctx.fillStyle, ss = ctx.strokeStyle, lw = ctx.lineWidth, op = ctx.globalCompositeOperation;
      ctx.save();
      try {
        ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); ctx.clip();
        if (res.stats && res.stats.shade > 0) {
          ctx.globalAlpha = ga * res.stats.shade; ctx.fillStyle = PAL.shade;
          // the storm shade darkens the backdrop, never the UI rects
          ctx.fillRect(view.x, view.y, view.w, view.h);
        }
        for (var i = 0; i < res.items.length; i++) drawItem(ctx, res.items[i], ga);
      } catch (e) { warn('draw', 'draw error: ' + (e && e.message)); }
      ctx.restore();
      ctx.globalAlpha = ga; ctx.fillStyle = fs; ctx.strokeStyle = ss; ctx.lineWidth = lw; ctx.globalCompositeOperation = op;
    }

    function rectsOf(items) { return items.map(function (it) { return { x: it.x, y: it.y, w: it.w, h: it.h, layer: it.layer, kind: it.kind, state: it.state, dim: !!it.dim }; }); }

    var inst = {
      version: VERSION,
      update: function (dt) { dt = num(dt, 0); if (dt > 0) clockMs += Math.min(dt, 1000); },
      drawBack: function (ctx, camX, camY) { drawPass('back', ctx, camX, camY); },
      drawFront: function (ctx, camX, camY) { drawPass('front', ctx, camX, camY); },
      draw: function (ctx, camX, camY) { drawPass('back', ctx, camX, camY); drawPass('front', ctx, camX, camY); },
      setWeather: function (kind, fadeMs) {
        var kk = kindOf(kind);
        if (kk == null) { warn('kind:' + kind, 'unknown weather "' + kind + '"; ignored'); return inst.weather(); }
        var cur = hist[hist.length - 1];
        if (cur.kind === kk) return inst.weather();
        hist.push({ kind: kk, at: clockMs, fade: Math.max(0, num(fadeMs, P.fade)) });
        if (hist.length > 6) hist.splice(0, hist.length - 6);
        return inst.weather();
      },
      weather: function () { var m = mixAt(clockMs); return { kind: hist[hist.length - 1].kind, mix: m.map(function (x) { return { kind: x.kind, w: Math.round(x.w * 100) / 100 }; }) }; },
      wind: function () { return windAt(clockMs / 1000); },
      setParams: function (o) { setParams(o); },
      params: function () { var o = {}; for (var key in P) o[key] = P[key]; return o; },
      setView: function (r) { setView(r); },
      view: function () { return { x: view.x, y: view.y, w: view.w, h: view.h }; },
      setGround: function (g) { groundOpt = g; },
      setUIRects: function (u) { uiOpt = u; },
      setSkin: function (s) { try { SK = s === false || !root.GameDNA_Skin ? null : root.GameDNA_Skin.resolve(s); } catch (e) { SK = null; } PIX = SK ? SK.pixel !== false : true; PAL = paletteOf(SK); FADES = (SK && SK.motion && SK.motion.fadeSteps) || (PIX ? BUILTIN.motion.fadeSteps : null); },
      clock: function () { return clockMs; },
      reset: function (t) { clockMs = Math.max(0, num(t, 0)); var cur = hist[hist.length - 1]; hist = [{ kind: cur.kind, at: -1e9, fade: 0 }]; },
      clear: function () { /* weather has no per-event state; accepted so generic reset code does not break */ },
      // tests and tools
      layout: function (pass, tMs, camX, camY) { return rectsOf(collect(pass || 'back', tMs == null ? clockMs : tMs, camX, camY).items); },
      lastDrawn: function (pass) { return rectsOf(pass ? last[pass] : last.back.concat(last.front)); },
      uiRects: function () { return lastUI.map(function (r) { return { x: r.x, y: r.y, w: r.w, h: r.h }; }); },
      stats: function () {
        var b = lastStats.back || {}, f = lastStats.front || {};
        return { far: b.far || 0, mid: b.mid || 0, near: f.near || 0, back: b.total || 0, front: f.total || 0, total: (b.total || 0) + (f.total || 0),
          splashes: (b.splashes || 0) + (f.splashes || 0), resting: (b.resting || 0) + (f.resting || 0), uiHidden: (b.uiHidden || 0) + (f.uiHidden || 0),
          uiDimmed: (b.uiDimmed || 0) + (f.uiDimmed || 0), shade: b.shade || 0, cap: P.cap };
      }
    };
    return inst;
  }

  root.GameDNA_Weather = { create: create, version: VERSION, kinds: KINDS.slice(), defaults: (function () { var o = {}; for (var k in DEFAULTS) o[k] = DEFAULTS[k]; return o; })() };
})(typeof window !== 'undefined' ? window : this);
