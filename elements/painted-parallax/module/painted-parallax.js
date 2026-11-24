/* GameDNA L-01 painted-parallax v1.0.1
 * Painted parallax layers: 3-4 pre-generated, hand-painted background bitmaps (far sky + mountains, optional drifting
 * clouds, mid hills, near silhouettes) loaded once with GameDNA_Assets (L-00), each scrolled at its own fraction of the
 * host camera, repeated horizontally without a seam, with an atmospheric depth tint per layer. When a layer's image is
 * missing the host's old drawing for that layer runs instead (fallback), so the game never shows a hole.
 *
 *   GameDNA_Assets.load(PACK, { base: 'art/', onReady: boot });           // L-00 loader, before the game's first step
 *   var bg = GameDNA_PaintedParallax.create({
 *     view: { x: 0, y: 0, w: 640, h: 360 },     // screen rect it fills (native px): the play field
 *     set: 'dusk',                              // which painted set (keys '<set>-far', '<set>-mid', ...)
 *     params: { depth: 1, tint: 1, drift: 1 },
 *     fallback: { far: drawOldSky, mid: drawOldHills }   // optional: the host's old drawing per layer
 *   });
 *   bg.update(dtMs);              // fixed step (cloud drift clock)
 *   bg.draw(ctx, camX, camY);     // FIRST in the draw pass, where the old flat background was drawn
 *
 * Layer roles and default scroll factors are the ones of I-02 parallax-layers (code-drawn pixel layers), so either
 * element can stand in for the other: clouds 0.08, far 0.16, back 0.3, mid 0.48, near 0.72.
 * Plain script, no import/export, no dependencies (uses GameDNA_Assets when present, else plain images you add).
 * One global: GameDNA_PaintedParallax. Never calls an image generator; never reads input; never throws from draw.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.1';
  // 'under' (optional, opaque): the painted continuation of the near layer BELOW its ground line, shown when the game's ground
  // is higher than the painted one (ground < 1): drawn just under the near layer's ground strip, same factor
  var ORDER = ['far', 'clouds', 'back', 'mid', 'under', 'near'];
  var OPTIONAL = { back: 1, under: 1 };
  var FACTOR = { far: 0.16, clouds: 0.08, back: 0.3, mid: 0.48, under: 0.72, near: 0.72 };
  var TINT = { far: 0.34, clouds: 0.2, back: 0.24, mid: 0.14, under: 0, near: 0 };    // share of haze colour at tint = 1
  var LIFT = { far: 0.25, clouds: 0.25, back: 0.5, mid: 0.75, under: 1, near: 1 };     // how much each layer follows `ground`
  var DEFAULTS = { depth: 1, tint: 1, haze: 'auto', drift: 1, vertical: 0, maxShift: 0.15, restY: 0, ground: 1, backing: 0, layers: 4, brightness: 1 };
  var LIMITS = { depth: [0, 1.5], tint: [0, 2], drift: [0, 4], vertical: [0, 1], maxShift: [0, 0.4], ground: [0.4, 1], backing: [0, 4], layers: [3, 4], brightness: [0.3, 1.5] };
  var warned = {};
  function warn(k, m) { if (warned[k]) return; warned[k] = 1; try { console.warn('[GameDNA_PaintedParallax] ' + m); } catch (e) { } }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function hexOk(h) { return typeof h === 'string' && /^#?[0-9a-f]{6}$/i.test(h); }

  function makeCanvas(w, h) {
    try { if (typeof document !== 'undefined') { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; } } catch (e) { }
    try { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); } catch (e) { }
    return null;
  }

  function create(options) {
    var opt = options || {};
    var A = opt.assets || root.GameDNA_Assets || null;
    var st = { clock: 0, view: null, set: opt.set || null, cache: {}, last: null, frames: 0, own: {} };
    var P = {};
    for (var k in DEFAULTS) P[k] = DEFAULTS[k];
    function setParams(p) {
      p = p || {};
      for (var key in p) {
        if (!(key in DEFAULTS)) continue;
        if (key === 'haze') { P.haze = (p.haze === 'auto' || hexOk(p.haze)) ? p.haze : 'auto'; if (p.haze !== 'auto' && !hexOk(p.haze)) warn('haze', 'haze must be "auto" or "#rrggbb"'); continue; }
        var v = num(p[key], DEFAULTS[key]), L = LIMITS[key];
        P[key] = L ? clamp(v, L[0], L[1]) : v;
      }
      if (p.factors && typeof p.factors === 'object') st.factors = p.factors;
      st.cache = {};
    }
    function setView(v) {
      if (!v || !(v.w > 0) || !(v.h > 0)) { warn('view', 'no view {x, y, w, h}: using 640x360 at 0,0'); v = { x: 0, y: 0, w: 640, h: 360 }; }
      st.view = { x: Math.round(num(v.x, 0)), y: Math.round(num(v.y, 0)), w: Math.round(v.w), h: Math.round(v.h) };
      st.cache = {};
    }
    setView(opt.view || opt.bounds);
    setParams(opt.params);
    var keys = opt.keys || null, fallback = opt.fallback || {};

    function sets() {
      var out = [];
      try {
        var ks = A && A.keys ? A.keys() : [];
        for (var i = 0; i < ks.length; i++) { var m = A.meta(ks[i]) || {}; if (m.role === 'bg-layer' && m.set && out.indexOf(m.set) < 0) out.push(m.set); }
      } catch (e) { }
      for (var s in st.own) if (out.indexOf(s) < 0) out.push(s);
      return out;
    }
    if (!st.set) st.set = sets()[0] || 'default';
    function roles() { return P.layers >= 4 ? ORDER : ORDER.filter(function (r) { return r !== 'clouds'; }); }
    function keyFor(role) {
      if (keys && keys[role]) return keys[role];
      return st.set + '-' + role;
    }
    function record(role) {          // {img, w, h, meta} or null
      var own = st.own[st.set] && st.own[st.set][role];
      if (own) return own;
      try { var r = A && A.get ? A.get(keyFor(role)) : null; return r && r.img ? r : null; } catch (e) { return null; }
    }
    function factorOf(role, meta) {
      var f = st.factors && isFinite(st.factors[role]) ? +st.factors[role] : (meta && isFinite(meta.parallax) ? +meta.parallax : FACTOR[role]);
      return f * P.depth;
    }
    function hazeOf() {
      if (P.haze !== 'auto') return P.haze;
      var far = record('far'), m = far && far.meta;
      return m && hexOk(m.haze) ? m.haze : '#8088b0';
    }
    // one cached canvas per layer, at the view height x backing, tint baked in: drawn 1:1 at whole pixels (no gaps, no shimmer)
    // fade (cache px, near only): the near layer's bottom rows fade out over the painted under-strip behind it, so the
    // ground strip melts into the undergrowth instead of ending on a straight line (only while the under-strip shows)
    function cached(role, bk, fade) {
      var rec = record(role);
      if (!rec) return null;
      fade = fade > 0 ? fade : 0;
      var c = st.cache[role + (fade ? '~' + fade : '')];
      if (c && c.src === rec.img && c.bk === bk) return c;
      var m = rec.meta || {}, H = Math.round(st.view.h * bk * (role === 'under' ? clamp(num(m.hFrac, 0.5), 0.1, 1) : 1));
      var iw = rec.w || rec.img.width, ih = rec.h || rec.img.height;
      if (!(iw > 0 && ih > 0)) return null;
      var W = Math.max(1, Math.round(iw * H / ih));
      var cv = makeCanvas(W, H);
      if (!cv) { warn('canvas', 'cannot create an offscreen canvas'); return null; }
      var g = cv.getContext('2d');
      g.imageSmoothingEnabled = true; try { g.imageSmoothingQuality = 'high'; } catch (e) { }
      g.drawImage(rec.img, 0, 0, W, H);
      var tAmt = clamp((m.tint != null ? +m.tint : TINT[role]) * P.tint, 0, 0.9);
      if (tAmt > 0) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = tAmt; g.fillStyle = hazeOf(); g.fillRect(0, 0, W, H); }
      if (P.brightness !== 1) {
        g.globalCompositeOperation = 'source-atop';
        if (P.brightness < 1) { g.globalAlpha = 1 - P.brightness; g.fillStyle = '#000'; } else { g.globalAlpha = P.brightness - 1; g.fillStyle = '#fff'; }
        g.fillRect(0, 0, W, H);
      }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      if (fade) {
        var fg = g.createLinearGradient(0, H - fade, 0, H); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,1)');
        g.globalCompositeOperation = 'destination-out'; g.fillStyle = fg; g.fillRect(0, H - fade, W, fade);
        g.globalCompositeOperation = 'source-over';
      }
      // edge colours for the extension bands (a lifted or shifted layer): the bottom / top rows averaged down to 1 px by
      // the browser's own resampling (no pixel reads, so a file:// image never taints anything)
      var edge = function (y0) { var e = makeCanvas(1, 1); if (!e) return null; var eg = e.getContext('2d'); eg.imageSmoothingEnabled = true; try { eg.imageSmoothingQuality = 'high'; } catch (x) { } var mid = makeCanvas(32, 1); if (!mid) return null; var mg = mid.getContext('2d'); mg.imageSmoothingEnabled = true; try { mg.imageSmoothingQuality = 'high'; } catch (x) { } mg.drawImage(cv, 0, y0, W, 3, 0, 0, 32, 1); eg.drawImage(mid, 0, 0, 32, 1, 0, 0, 1, 1); return e; };
      c = st.cache[role + (fade ? '~' + fade : '')] = { canvas: cv, w: W, h: H, bk: bk, src: rec.img, bottom: edge(H - 3), top: edge(0), meta: m, key: rec.key || keyFor(role), opaque: m.alpha === false };
      return c;
    }

    // the under-strip again, darker, with its top 30 % faded out: tiles downwards below the strip when the game's ground is
    // so high (ground < ~0.55) that one strip does not reach the bottom of the view
    function deepOf(c) {
      if (c.deep !== undefined) return c.deep;
      var d = makeCanvas(c.w, c.h);
      if (!d) { c.deep = null; return null; }
      var g = d.getContext('2d');
      g.drawImage(c.canvas, 0, 0);
      g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.3; g.fillStyle = '#000'; g.fillRect(0, 0, c.w, c.h);
      g.globalAlpha = 1; g.globalCompositeOperation = 'destination-out';
      var fg = g.createLinearGradient(0, 0, 0, Math.round(c.h * 0.3)); fg.addColorStop(0, 'rgba(0,0,0,1)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = fg; g.fillRect(0, 0, c.w, Math.round(c.h * 0.3));
      g.globalCompositeOperation = 'source-over';
      c.deep = d; return d;
    }

    function callFallback(role, ctx, camX, camY) {
      var fn = fallback && fallback[role];
      if (typeof fn !== 'function') return false;
      try { ctx.save(); fn(ctx, camX, camY, st.view); } catch (e) { warn('fb' + role, 'fallback for ' + role + ' threw: ' + (e && e.message)); }
      try { ctx.restore(); } catch (e) { }
      return true;
    }

    // device scale of the context: hosts that size the canvas to devicePixelRatio and setTransform(scale) get a cache at
    // device resolution, drawn with an identity transform at whole device pixels (crisp, no seams, no shimmer)
    function deviceOf(ctx) {
      var T = null;
      try { T = ctx.getTransform ? ctx.getTransform() : null; } catch (e) { T = null; }
      if (P.backing > 0 || !T || T.b || T.c || !(T.a > 0) || !(T.d > 0)) { var b = P.backing > 0 ? P.backing : 1; return { s: b, e: 0, f: 0, own: P.backing > 0 && !!T, T: T }; }
      return { s: Math.round(T.a * 1000) / 1000, e: T.e, f: T.f, own: true, T: T };
    }
    function drawLayer(ctx, role, camX, camY, info) {
      var v = st.view, D = deviceOf(ctx), bk = D.s;
      // cache at device resolution (one 1:1 blit per repeat: ~2 ms for four layers at 1920x1080), but never above twice the
      // stored resolution (a 4K screen would otherwise build ~200 MB of layer canvases); above that, scaled blits
      var rec0 = record(role), sh = rec0 ? (rec0.h || (rec0.img && rec0.img.height) || 0) : 0;
      var cs = sh > 0 ? Math.min(bk, Math.max(1, 2 * sh / v.h)) : bk;
      cs = Math.round(cs * 1000) / 1000;
      var lift0 = Math.round((1 - P.ground) * v.h * (LIFT[role] || 0) * bk), fade = 0;
      if (role === 'near') {   // the under-strip was drawn just before (same frame): fade the near bottom into it
        var U = st.underShown;
        st.underShown = null;
        if (U && U.t === st.tNow && U.camX === camX && lift0 > 0) {
          var ov = Math.round(v.h * clamp(num(U.overlap, 0.04), 0, 0.3) * cs);
          fade = Math.min(Math.round(12 * cs), Math.max(0, ov - Math.round(2 * cs)));
        }
      }
      var c = cached(role, cs, fade);
      if (!c) { var fb = callFallback(role, ctx, camX, camY); if (info) info.push({ role: role, bitmap: false, fallback: fb }); return false; }
      var f = factorOf(role, c.meta), t = st.tNow;
      var drift = role === 'clouds' || c.meta.drift ? (c.meta.drift != null ? +c.meta.drift : 6) * P.drift * t / 1000 : 0;
      var ox = Math.floor((camX * f + drift) * bk);                         // device px, whole
      var lift = lift0;
      var M = Math.round(v.h * P.maxShift * bk);
      var oy = P.vertical > 0 ? clamp(-Math.round((camY - P.restY) * f * P.vertical * bk), -M, M) : 0;
      var dev = D.own && D.T && P.backing <= 0;          // draw in device pixels with an identity transform
      var X0 = Math.round((dev ? D.e : 0) + v.x * bk), Y0 = Math.round((dev ? D.f : 0) + v.y * bk);
      var VW = Math.round(v.w * bk), VH = Math.round(v.h * bk), y = Y0 + oy - lift;
      if (role === 'under') {   // top just under the near layer's ground strip (overlap = how far the near strip covers it)
        y = Y0 + oy - lift + VH - Math.round(VH * clamp(num(c.meta.overlap, 0.04), 0, 0.3));
        if (y >= Y0 + VH) { if (info) info.push({ role: role, key: c.key, bitmap: true, hidden: true, factor: +f.toFixed(4), x: 0, y: 0, w: 0, h: 0 }); return true; }
        st.underShown = { t: st.tNow, camX: camX, overlap: c.meta.overlap };
      }
      var wD = c.w * bk / cs, hD = c.h * bk / cs;   // one repeat in device px (may be fractional)
      var off = ((ox % wD) + wD) % wD;
      ctx.save();
      if (dev) ctx.setTransform(1, 0, 0, 1, 0, 0);
      else if (bk !== 1) ctx.scale(1 / bk, 1 / bk);
      ctx.beginPath(); ctx.rect(X0, Y0, VW, VH); ctx.clip();
      for (var k = 0, x0 = -off; x0 < VW; k++, x0 = -off + k * wD) {
        // whole device px; each repeat ends exactly where the next begins (no gap, no overlap, even at fractional scales)
        var xa = Math.round(X0 + x0), xb = Math.round(X0 + x0 + wD), x = xa - X0, cw = xb - xa;
        if (cs === bk) ctx.drawImage(c.canvas, xa, y); else ctx.drawImage(c.canvas, 0, 0, c.w, c.h, xa, y, cw, Math.round(hD));
        // extend: a layer lifted or shifted leaves a band; stretch its bottom (and the far layer's top) rows over it
        var bot = y + Math.round(hD);
        if (bot < Y0 + VH && role === 'under') {   // a very high game ground: continue the floor downwards, darker with depth
          var dc = deepOf(c);
          if (c.bottom) ctx.drawImage(c.bottom, 0, 0, 1, 1, xa, bot - 1, cw, Y0 + VH - bot + 1);
          if (dc) {
            for (var yy = bot - Math.round(hD * 0.3); yy < Y0 + VH; yy += Math.round(hD * 0.7)) {
              if (cs === bk) ctx.drawImage(dc, xa, yy); else ctx.drawImage(dc, 0, 0, c.w, c.h, xa, yy, cw, Math.round(hD));
            }
          }
          continue;
        }
        if (bot < Y0 + VH && role !== 'clouds' && c.bottom && !(st.underDrawn && (role === 'near' || role === 'mid'))) ctx.drawImage(c.bottom, 0, 0, 1, 1, xa, bot - 1, cw, Y0 + VH - bot + 1);
        if (y > Y0 && role === 'far' && c.top) ctx.drawImage(c.top, 0, 0, 1, 1, xa, Y0, cw, y - Y0 + 1);
      }
      ctx.restore();
      if (info) {
        var sw = c.meta.w || c.src.width || c.w;
        info.push({ role: role, key: c.key, bitmap: true, factor: +f.toFixed(4), x: ox / bk, y: (oy - lift) / bk, w: wD / bk, h: v.h, scale: bk, cacheScale: cs,
          joins: (c.meta.joins || []).map(function (j) { return j * (wD / bk) / sw; }) });
      }
      return true;
    }

    function draw(ctx, camX, camY, tMs) {
      if (!ctx || !ctx.drawImage) { warn('ctx', 'draw() needs a 2D canvas context'); return false; }
      var n = 0, info = [];
      try {
        camX = num(camX, 0); camY = num(camY, 0);
        st.tNow = tMs != null && isFinite(tMs) ? +tMs : st.clock;
        var R = roles();
        st.underDrawn = !!record('under');   // a painted under-strip replaces the flat fill below lifted layers
        for (var i = 0; i < R.length; i++) {
          var role = R[i];
          if (OPTIONAL[role] && !record(role) && !(fallback && fallback[role])) continue;   // back and under are optional
          if (drawLayer(ctx, role, camX, camY, info)) n++;
        }
        st.last = { t: st.tNow, camX: camX, camY: camY, layers: info, bitmaps: n }; st.frames++;
      } catch (e) { try { ctx.restore(); } catch (e2) { } warn('draw', 'draw failed: ' + (e && e.message)); }
      return n > 0;
    }

    var inst = {
      version: VERSION,
      update: function (dt) { dt = +dt; if (isFinite(dt) && dt > 0) st.clock += Math.min(dt, 1000); },
      draw: draw,
      drawLayer: function (ctx, role, camX, camY, tMs) {
        if (!ctx || !ctx.drawImage || ORDER.indexOf(role) < 0) return false;
        try {
          st.tNow = tMs != null && isFinite(tMs) ? +tMs : st.clock; camX = num(camX, 0); camY = num(camY, 0);
          st.underDrawn = !!record('under');
          var info = [], ok = drawLayer(ctx, role, camX, camY, info);
          // keep lastDrawn() current when a game draws layer by layer (one entry per role, the latest call wins)
          var L = st.last && st.last.t === st.tNow && st.last.camX === camX ? st.last : { t: st.tNow, camX: camX, camY: camY, layers: [], bitmaps: 0 };
          L.layers = L.layers.filter(function (l) { return l.role !== role; }).concat(info);
          L.layers.sort(function (a, b) { return ORDER.indexOf(a.role) - ORDER.indexOf(b.role); });
          L.bitmaps = L.layers.filter(function (l) { return l.bitmap; }).length; st.last = L;
          return ok;
        } catch (e) { warn('dl', 'drawLayer failed: ' + (e && e.message)); return false; }
      },
      setSet: function (name) { if (name && name !== st.set) { st.set = String(name); st.cache = {}; } return inst; },
      set: function () { return st.set; },
      sets: sets,
      setParams: function (p) { setParams(p); return inst; },
      setView: function (v) { setView(v); return inst; },
      setFallback: function (fb) { fallback = fb || {}; return inst; },
      add: function (setName, role, img, meta) {          // plain images without GameDNA_Assets
        if (!img || ORDER.indexOf(role) < 0) return inst;
        var s = st.own[setName] = st.own[setName] || {};
        s[role] = { img: img, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height, meta: meta || {}, key: setName + '-' + role };
        st.cache = {}; return inst;
      },
      ready: function () { var R = roles(); for (var i = 0; i < R.length; i++) if (!OPTIONAL[R[i]] && !record(R[i])) return false; return true; },
      reset: function (t) { st.clock = isFinite(t) ? +t : 0; },
      clock: function () { return st.clock; },
      clear: function () { },
      params: function () { var o = {}; for (var k2 in DEFAULTS) o[k2] = P[k2]; return o; },
      layers: function () {
        return roles().map(function (r) { var rec = record(r), m = rec && rec.meta || {}; return { role: r, key: keyFor(r), loaded: !!rec, factor: +factorOf(r, m).toFixed(4), w: rec ? (rec.w || rec.img.width) : 0, h: rec ? (rec.h || rec.img.height) : 0, tint: clamp((m.tint != null ? +m.tint : TINT[r]) * P.tint, 0, 0.9), fallback: !rec && typeof (fallback && fallback[r]) === 'function' }; })
          .filter(function (l) { return !OPTIONAL[l.role] || l.loaded || l.fallback; });
      },
      lastDrawn: function () { return st.last ? [{ x: st.view.x, y: st.view.y, w: st.view.w, h: st.view.h, owner: null, kind: 'backdrop', t: st.last.t, camX: st.last.camX, camY: st.last.camY, layers: st.last.layers, bitmaps: st.last.bitmaps }] : []; },
      prebuild: function (scale) { var b = scale > 0 ? +scale : (P.backing > 0 ? P.backing : 1); roles().forEach(function (r) { cached(r, b); }); return inst; }
    };
    return inst;
  }

  var instances = [];
  root.GameDNA_PaintedParallax = {
    version: VERSION, create: function (o) { var i = create(o); instances.push(i); if (instances.length > 8) instances.shift(); return i; }, roles: ORDER.slice(), instances: instances,
    factors: function () { var o = {}; for (var k in FACTOR) o[k] = FACTOR[k]; return o; },
    defaults: function () { var o = {}; for (var k in DEFAULTS) o[k] = DEFAULTS[k]; return o; }
  };
})(typeof window !== 'undefined' ? window : this);
