/* GameDNA E-03 · Dissolve-out defeat · module v1 (plain script, no dependencies, one global)
 *
 *   const dd = GameDNA_DissolveDefeat.create({
 *     view: { x: 0, y: 0, w: 256, h: 152 },      // play field in native px; nothing is drawn outside it
 *     skin: 'pixel16', seed: 1,                  // optional; skin needs skin-api.js, else a built-in pixel16 look
 *     params: { variant: 'dither', duration: 700, flash: 100, edge: 'white', chunk: 1, spill: 3 },
 *     uiRects: () => [{ x, y, w, h }]            // optional: never draw over these (HUD, windows)
 *   });
 *   dd.defeat(id, { rect: {x, y, w, h}, image: spriteCanvas, flipX }) // or { rect, drawSprite: ctx => ... }
 *        -> Promise (resolves when the effect is over); the host removes the unit at once
 *   dd.update(dtMs)                    // world time in ms; 0 while frozen
 *   dd.draw(ctx, offsetX, offsetY)     // native-resolution 2D context, after units, before banner/HUD
 *   dd.busy(id?)                       // true while any (or that id's) effect still plays
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var DEFAULTS = { variant: 'dither', duration: 700, flash: 100, edge: 'white', chunk: 1, spill: 3 };
  var VARIANTS = ['dither', 'slice', 'crumble', 'flash'];
  var EDGE = { white: 'fx.white', hot: 'fx.hot', cold: 'fx.cold', crit: 'fx.crit', heal: 'fx.heal' };
  var FRAME = 1000 / 60;
  // Built-in look when skin-api.js is not loaded: the pixel16 values this module uses.
  var FB = {
    pixel: true,
    palette: { ink: '#06061a', fx: { white: '#ffffff', hot: '#ff7a3a', cold: '#6ad8f0', crit: '#ffb43a', heal: '#4ad870' } },
    particles: { gravity: 0.12, drag: 0.02 },
    motion: { stepMs: FRAME, snap: true, fadeSteps: [1, 0.75, 0.5, 0.25] }
  };
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  var warned = {};
  function warn(k, msg) { if (warned[k]) return; warned[k] = 1; try { root.console && console.warn('GameDNA_DissolveDefeat: ' + msg); } catch (e) {} }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hash(s) { var x = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  function h2(x, y, seed) {
    var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(seed | 0, 0x9e3779b1);
    n = Math.imul(n ^ (n >>> 13), 0x85ebca6b); n ^= n >>> 16; n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 15;
    return (n >>> 0) / 4294967296;
  }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
  function ctx2d(c) { var g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false; return g; }
  function parse(c) {
    if (Array.isArray(c)) return c.slice(0, 3);
    c = String(c || '').trim(); var m;
    if (c[0] === '#' && c.length === 4) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)];
    if (c[0] === '#' && c.length >= 7) return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    if ((m = c.match(/^rgba?\(([^)]+)\)$/))) return m[1].split(',').slice(0, 3).map(function (v) { return +v || 0; });
    return [255, 255, 255];
  }
  function css(rgb) { return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')'; }
  function same(a, b) { return a === b || String(a) === String(b); }
  function okRect(r) { return r && isFinite(+r.x) && isFinite(+r.y) && +r.w > 0 && +r.h > 0; }
  function inter(a, b) { var x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h); return x2 > x && y2 > y ? { x: x, y: y, w: x2 - x, h: y2 - y } : null; }

  function create(options) {
    var opt = options || {};
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    setParams(opt.params || {});
    var SK = null;
    try { SK = root.GameDNA_Skin ? root.GameDNA_Skin.resolve(opt.skin) : null; } catch (e) { SK = null; }
    var seed = num(opt.seed, 1) | 0;
    var list = [], drawn = [], rectCache = {}, nth = {};

    function setParams(p) {
      p = p || {};
      if (p.variant != null) P.variant = VARIANTS.indexOf(String(p.variant)) >= 0 ? String(p.variant) : (warn('variant', 'unknown variant "' + p.variant + '", using dither'), 'dither');
      if (p.duration != null) P.duration = clamp(num(p.duration, DEFAULTS.duration), 200, 3000);
      if (p.flash != null) P.flash = clamp(num(p.flash, DEFAULTS.flash), 0, 400);
      if (p.edge != null) P.edge = EDGE[p.edge] || p.edge === 'none' ? String(p.edge) : 'white';
      if (p.chunk != null) P.chunk = clamp(Math.round(num(p.chunk, 1)), 1, 3);
      if (p.spill != null) P.spill = clamp(Math.round(num(p.spill, 3)), 0, 16);
    }
    function look(path) {   // skin token, else built-in pixel16 value
      var v = null;
      if (SK) { try { v = SK.token(path); } catch (e) { v = null; } if (v === path) v = null; }
      if (v == null) { v = FB.palette; path.split('.').forEach(function (p) { v = v == null ? v : v[p]; }); }
      return v;
    }
    function rule(group, key, d) { var g = SK && SK[group]; return g && g[key] != null ? g[key] : FB[group] && FB[group][key] != null ? FB[group][key] : d; }
    function stepAlpha(a) {   // skin fade steps (pixel16: 1 / .75 / .5 / .25); below half the last step = gone
      a = clamp(a, 0, 1);
      var F = rule('motion', 'fadeSteps', null);
      if (!F || !F.length) return a < 0.02 ? 0 : a;
      if (a < F[F.length - 1] * 0.5) return 0;
      for (var i = 0; i < F.length; i++) if (a >= F[i] - 1e-9) return F[i];
      return F[F.length - 1];
    }
    function stepT(ms) { var st = rule('motion', 'stepMs', 0); return st > 0 ? Math.floor(ms / st + 1e-6) * st : ms; }
    function edgeRGB(name) { if (name === 'none') return null; return parse(look(EDGE[name] || 'fx.white') || '#ffffff'); }
    function safeRects(fn) { if (typeof fn !== 'function') return []; try { var r = fn(); return Array.isArray(r) ? r.filter(okRect) : []; } catch (e) { warn('rects', 'uiRects() threw: ' + e); return []; } }
    function view() { var v = opt.view || opt.bounds; if (typeof v === 'function') { try { v = v(); } catch (e) { v = null; } } return okRect(v) ? v : null; }
    function resolved() { return typeof Promise !== 'undefined' ? Promise.resolve(false) : null; }

    /* ---------- snapshot ---------- */
    function snapshot(id, r, o) {
      var w = r.w, h = r.h, c = mk(w, h), g = ctx2d(c), img = o.image || o.source, drew = false;
      try {
        if (img && (img.width || img.naturalWidth)) {
          g.save(); if (o.flipX) { g.translate(w, 0); g.scale(-1, 1); }
          var s = o.src;
          if (okRect(s)) g.drawImage(img, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h); else g.drawImage(img, 0, 0);
          g.restore(); drew = true;
        } else {
          var fn = typeof o.drawSprite === 'function' ? function (gg) { o.drawSprite(gg, { x: r.x, y: r.y, w: w, h: h }); }
            : typeof opt.drawSprite === 'function' ? function (gg) { opt.drawSprite(gg, id, { x: r.x, y: r.y, w: w, h: h }); } : null;
          if (fn) { g.save(); g.translate(-r.x, -r.y); try { fn(g); drew = true; } catch (e) { warn('draw', 'drawSprite threw: ' + e); } g.restore(); }
          else warn('nosprite', 'defeat() got neither image nor drawSprite; showing a dust puff at the rect');
        }
      } catch (e) { warn('snap', 'could not draw the sprite: ' + e); }
      var data = null;
      try { data = g.getImageData(0, 0, w, h); } catch (e) { warn('taint', 'sprite pixels are not readable (cross-origin image?); using the flash variant'); }
      var opaque = 0;
      if (data) for (var i = 3; i < data.data.length; i += 4) if (data.data[i] > 8) opaque++;
      if (drew && data && !opaque) warn('empty', 'the snapshot is empty: drawSprite must draw on the ctx it receives (at its normal screen position), not on your screen context; showing a dust puff');
      return { c: c, data: data, opaque: opaque };
    }
    function silhouette(src, rgb) { var c = mk(src.width, src.height), g = ctx2d(c); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = css(rgb); g.fillRect(0, 0, c.width, c.height); return c; }

    function build(id, r, o) {
      var S = snapshot(id, r, o), w = r.w, h = r.h, v = o.variant && VARIANTS.indexOf(o.variant) >= 0 ? o.variant : P.variant;
      var esd = (seed ^ hash(id) ^ Math.imul((nth[id] = (nth[id] || 0) + 1), 0x27d4eb2d)) | 0;
      var e = { id: id, x: r.x, y: r.y, w: w, h: h, variant: v, age: 0, acc: 0, flash: num(o.flash, P.flash), dur: clamp(num(o.duration, P.duration), 200, 3000),
        edge: edgeRGB(o.edge || P.edge), spill: P.spill, chunk: P.chunk, seed: esd, snap: S.c, src: S.data, done: false, cbs: [] };
      if (typeof o.onDone === 'function') e.cbs.push(o.onDone);
      if (!S.data && S.opaque === 0 && (o.image || o.drawSprite || opt.drawSprite)) e.variant = 'flash';   // unreadable pixels: canvas-only variant
      if (S.data && !S.opaque) e.variant = 'puff';
      if (!S.data && !(o.image || o.drawSprite || opt.drawSprite)) e.variant = 'puff';
      if (e.variant === 'flash') e.flash = Math.max(e.flash, 120);
      e.life = e.flash + e.dur;
      e.white = silhouette(S.c, parse(look('fx.white') || '#ffffff'));
      e.tint = e.edge ? silhouette(S.c, e.edge) : null;
      e.B = mk(w + 2 * e.spill, h + 2 * e.spill); e.g = ctx2d(e.B);
      if ((e.variant === 'dither' || e.variant === 'flash') && S.data) {
        e.thr = new Float32Array(w * h);
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++)
          e.thr[y * w + x] = 0.5 * (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 + 0.3 * h2(x, y, esd) + 0.2 * (y / Math.max(1, h - 1));
      }
      if (e.variant === 'crumble' || e.variant === 'puff') makeParticles(e);
      e.promise = typeof Promise !== 'undefined' ? new Promise(function (res) { e.resolve = res; }) : null;
      return e;
    }
    function makeParticles(e) {
      var w = e.w, h = e.h, ch = e.chunk, d = e.src && e.src.data, ps = [], x, y, i, j;
      if (e.variant === 'crumble' && d) {
        for (y = 0; y < h; y += ch) for (x = 0; x < w; x += ch) {
          var col = null;
          for (j = 0; j < ch && !col; j++) for (i = 0; i < ch && !col; i++) { var p = ((y + j) * w + x + i) * 4; if (x + i < w && y + j < h && d[p + 3] > 8) col = [d[p], d[p + 1], d[p + 2], d[p + 3]]; }
          if (col) ps.push({ hx: x, hy: y, x: x, y: y, vx: 0, vy: 0, col: col, rel: 0.62 * (y / Math.max(1, h - 1)) + 0.18 * h2(x, y, e.seed), on: false });
        }
      } else {   // dust puff: no readable sprite pixels
        var cx = w / 2, cy = h * 0.6, ink = parse(look('ink') || '#06061a'), base = e.edge || [200, 200, 200];
        for (i = 0; i < 18; i++) {
          var a = h2(i, 1, e.seed) * Math.PI * 2, rr = h2(i, 2, e.seed);
          ps.push({ hx: Math.round(cx + Math.cos(a) * rr * w * 0.35), hy: Math.round(cy + Math.sin(a) * rr * h * 0.3), x: 0, y: 0, vx: 0, vy: 0,
            col: [Math.round(base[0] * 0.7 + ink[0] * 0.3), Math.round(base[1] * 0.7 + ink[1] * 0.3), Math.round(base[2] * 0.7 + ink[2] * 0.3), 255], rel: 0.3 * h2(i, 3, e.seed), on: false, hidden: true });
        }
        e.chunk = 1;
      }
      e.ps = ps;
    }

    /* ---------- simulation ---------- */
    function prog(e) { var a = stepT(e.age); return a < e.flash ? -1 : clamp((a - e.flash) / e.dur, 0, 1); }
    function tick(e) {
      e.age += FRAME;
      if (!e.ps) return;
      var q = clamp((e.age - e.flash) / e.dur, 0, 1), grav = num(rule('particles', 'gravity', 0.12), 0.12), drag = num(rule('particles', 'drag', 0.02), 0.02);
      var floor = e.h - e.chunk + Math.min(e.spill, 2);
      for (var i = 0; i < e.ps.length; i++) {
        var p = e.ps[i];
        if (q < p.rel || e.age < e.flash) continue;
        if (!p.on) { p.on = true; p.x = p.hx; p.y = p.hy; p.vx = (h2(i, 7, e.seed) - 0.5) * 0.7; p.vy = -h2(i, 9, e.seed) * (p.hidden ? 1.2 : 0.45); p.t0 = q; }
        p.vy += grav; p.vx *= 1 - drag; p.x += p.vx; p.y += p.vy;
        if (p.y >= floor) { p.y = floor; p.vy = Math.abs(p.vy) > 0.6 ? -p.vy * 0.3 : 0; p.vx *= p.vy ? 0.6 : 0.5; p.land = true; }
        // a piece that would touch the buffer edge is gone at once: no straight clip edge is ever visible
        if (p.x < 1 - e.spill || p.x + e.chunk > e.w + e.spill - 1 || p.y < 1 - e.spill) p.dead = true;
      }
    }
    function finish(e) {
      if (e.done) return; e.done = true;
      for (var i = 0; i < e.cbs.length; i++) { try { e.cbs[i](e.id); } catch (err) { warn('cb', 'onDone threw: ' + err); } }
      if (typeof opt.onDone === 'function') { try { opt.onDone(e.id); } catch (err) { warn('cb', 'onDone threw: ' + err); } }
      if (e.resolve) e.resolve(true);
    }

    /* ---------- drawing (into the entry's own buffer, then clipped and copied) ---------- */
    function put(D, W, x, y, rgb, a) { if (x < 0 || y < 0 || x >= W || y >= D.length / 4 / W) return; var p = (y * W + x) * 4; D[p] = rgb[0]; D[p + 1] = rgb[1]; D[p + 2] = rgb[2]; D[p + 3] = a; }
    function render(e) {   // returns the content bbox in entry-local px (relative to the sprite rect) or null
      var g = e.g, s = e.spill, w = e.w, h = e.h, q = prog(e), a = stepT(e.age);
      g.clearRect(0, 0, e.B.width, e.B.height);
      if (q < 0) {   // white flash prelude: blink every 2 frames
        g.drawImage(Math.floor(a / (2 * FRAME)) % 2 === 0 ? e.white : e.snap, s, s);
        return { x: 0, y: 0, w: w, h: h };
      }
      if (q >= 1) return null;
      var V = e.variant, box = null;
      var grow = function (x, y, ww, hh) { if (!box) box = { x: x, y: y, x2: x + ww, y2: y + hh }; else { box.x = Math.min(box.x, x); box.y = Math.min(box.y, y); box.x2 = Math.max(box.x2, x + ww); box.y2 = Math.max(box.y2, y + hh); } };
      if (V === 'dither') {
        var qd = q * 1.12, img = g.createImageData(w, h), O = img.data, D = e.src.data, E = e.edge, any = false;
        for (var i = 0, n = w * h; i < n; i++) {
          if (D[i * 4 + 3] <= 8) continue; var t = e.thr[i], p = i * 4;
          if (t < qd) continue;
          any = true;
          if (E && t < qd + 0.1) { O[p] = E[0]; O[p + 1] = E[1]; O[p + 2] = E[2]; O[p + 3] = 255; }
          else { O[p] = D[p]; O[p + 1] = D[p + 1]; O[p + 2] = D[p + 2]; O[p + 3] = D[p + 3]; }
        }
        if (!any) return null;
        g.putImageData(img, s, s); return { x: 0, y: 0, w: w, h: h };
      }
      if (V === 'slice') {
        var bh = h < 24 ? 1 : 2, nb = Math.ceil(h / bh), maxSlide = Math.max(4, Math.round(w * (h < 24 ? 0.8 : 0.6)));
        for (var b = 0; b < nb; b++) {
          var d = 0.5 * b / Math.max(1, nb - 1), k = clamp((q - d) / 0.5, 0, 1);
          if (k >= 1) continue;
          var al = stepAlpha(1 - k); if (!al) continue;
          var dx = Math.round((b % 2 ? 1 : -1) * k * k * maxSlide), y0 = b * bh, hh = Math.min(bh, h - y0);
          g.globalAlpha = al; g.drawImage(e.snap, 0, y0, w, hh, s + dx, s + y0, w, hh);
          if (k > 0 && e.tint) { g.globalAlpha = al * (k < 0.2 ? 1 : 0.6); g.drawImage(e.tint, 0, y0, w, hh, s + dx, s + y0, w, hh); }
          g.globalAlpha = 1; grow(dx, y0, w, hh);
        }
      } else if (V === 'flash') {
        if (e.thr) {   // the silhouette breaks up in a dither pattern (no lingering grey statue)
          var qf = (q - 0.1) * 1.25, fim = g.createImageData(w, h), FO = fim.data, FD = e.src.data, FE = e.edge, fal = q < 0.3 ? 255 : stepAlpha(0.75) * 255 | 0, anyf = false;
          for (var fi = 0, fn = w * h; fi < fn; fi++) {
            if (FD[fi * 4 + 3] <= 8 || e.thr[fi] < qf) continue; var fp = fi * 4; anyf = true;
            if (FE) { FO[fp] = FE[0]; FO[fp + 1] = FE[1]; FO[fp + 2] = FE[2]; } else { FO[fp] = FD[fp]; FO[fp + 1] = FD[fp + 1]; FO[fp + 2] = FD[fp + 2]; }
            FO[fp + 3] = Math.min(FD[fp + 3], fal);
          }
          if (!anyf) return null;
          g.putImageData(fim, s, s); return { x: 0, y: 0, w: w, h: h };
        }
        var fa = stepAlpha((1 - q) * (1 - q)); if (!fa) return null;   // unreadable pixels: front-loaded stepped fade
        g.globalAlpha = fa; g.drawImage(e.tint || e.snap, s, s); g.globalAlpha = 1; grow(0, 0, w, h);
      } else {   // crumble / puff
        var W = e.B.width, im = g.createImageData(W, e.B.height), OD = im.data, SD = e.src && e.src.data, ch = e.chunk, ink = parse(look('ink') || '#06061a');
        for (var j = 0; j < e.ps.length; j++) {
          var P2 = e.ps[j];
          if (!P2.on) {
            if (P2.hidden) continue;
            for (var yy = 0; yy < ch; yy++) for (var xx = 0; xx < ch; xx++) {
              var px = P2.hx + xx, py = P2.hy + yy; if (px >= w || py >= h) continue; var sp = (py * w + px) * 4;
              if (SD[sp + 3] > 8) put(OD, W, px + s, py + s, [SD[sp], SD[sp + 1], SD[sp + 2]], SD[sp + 3]);
            }
            grow(P2.hx, P2.hy, ch, ch); continue;
          }
          if (P2.dead) continue;
          // each piece blinks out on its own (seeded moment), so the dust thins out pixel by pixel instead of fading as one sheet
          var fs = P2.t0 + 0.25 * (1 - P2.t0), gone = fs + (1 - fs) * (0.15 + 0.85 * h2(j, 11, e.seed));
          if (q >= gone) continue;
          var pa = q > gone - 0.06 ? stepAlpha(0.5) || 0.5 : 1;
          var spark = e.edge && q - P2.t0 < 0.06 && h2(j, 5, e.seed) < 0.4, c = P2.col;
          var rgb = spark ? e.edge : [Math.round(c[0] * 0.8 + ink[0] * 0.2), Math.round(c[1] * 0.8 + ink[1] * 0.2), Math.round(c[2] * 0.8 + ink[2] * 0.2)];
          var rx = Math.round(P2.x), ry = Math.round(P2.y);
          for (var y2 = 0; y2 < ch; y2++) for (var x2 = 0; x2 < ch; x2++) put(OD, W, rx + x2 + s, ry + y2 + s, rgb, Math.round(255 * pa));
          grow(rx, ry, ch, ch);
        }
        g.putImageData(im, 0, 0);
      }
      if (!box) return null;
      var bx = Math.max(box.x, -s), by = Math.max(box.y, -s), bx2 = Math.min(box.x2, w + s), by2 = Math.min(box.y2, h + s);
      return bx2 > bx && by2 > by ? { x: bx, y: by, w: bx2 - bx, h: by2 - by } : null;
    }

    /* ---------- public API ---------- */
    var api = {
      version: VERSION,
      // defeat(id, {rect, image | drawSprite(ctx, rect), flipX, src, variant, duration, flash, edge, onDone}) -> Promise | null
      defeat: function (id, o) {
        try {
          o = o || {};
          var r = o.rect;
          if (!okRect(r) && typeof opt.getRect === 'function') { try { r = opt.getRect(id); } catch (e) { r = null; } }
          var im = o.image || o.source;
          if (r && isFinite(+r.x) && isFinite(+r.y) && !(+r.w > 0) && im && im.width) r = { x: r.x, y: r.y, w: im.width, h: im.height };
          if (!okRect(r)) r = rectCache[id];
          if (!okRect(r)) { warn('norect', 'defeat("' + id + '") without a rect: nothing drawn (pass {rect: {x, y, w, h}} from BEFORE you remove the unit)'); return resolved(); }
          r = { x: Math.round(+r.x), y: Math.round(+r.y), w: Math.max(1, Math.round(+r.w)), h: Math.max(1, Math.round(+r.h)) };
          rectCache[id] = r;
          for (var i = 0; i < list.length; i++) if (same(list[i].id, id) && !list[i].done) return list[i].promise;   // already dissolving
          var e = build(id, r, o);
          list.push(e);
          return e.promise;
        } catch (err) { warn('defeat', 'defeat() failed: ' + err); return resolved(); }
      },
      update: function (dt) {
        try {
          dt = +dt;
          if (!isFinite(dt)) dt = FRAME;
          if (dt > 0 && dt < 1) { warn('sec', 'update() takes milliseconds; got ' + dt + ', treating it as seconds'); dt *= 1000; }
          dt = clamp(dt, 0, 250);
          for (var i = 0; i < list.length; i++) {
            var e = list[i]; e.acc += dt;
            var n = 0; while (e.acc >= FRAME - 1e-6 && n++ < 20) { e.acc -= FRAME; tick(e); }
            if (e.acc >= FRAME) e.acc = 0;
            if (e.age >= e.life - 1e-6) finish(e);
          }
          list = list.filter(function (e) { return !e.done; });
        } catch (err) { warn('update', 'update() failed: ' + err); }
      },
      draw: function (ctx, ox, oy) {
        drawn = [];
        if (!ctx || !list.length) return;
        ox = num(ox, 0); oy = num(oy, 0);
        var V = view(), ui = safeRects(opt.uiRects);
        for (var i = 0; i < list.length; i++) {
          var e = list[i];
          try {
            var bb = render(e); if (!bb) continue;
            var s = e.spill, X = e.x - s, Y = e.y - s, BW = e.B.width, BH = e.B.height;
            if (V) {   // clear what falls outside the play field
              var L = V.x - X, T = V.y - Y, R = V.x + V.w - X, Bt = V.y + V.h - Y;
              if (L > 0) e.g.clearRect(0, 0, L, BH); if (T > 0) e.g.clearRect(0, 0, BW, T);
              if (R < BW) e.g.clearRect(R, 0, BW - R, BH); if (Bt < BH) e.g.clearRect(0, Bt, BW, BH - Bt);
            }
            for (var u = 0; u < ui.length; u++) e.g.clearRect(ui[u].x - X, ui[u].y - Y, ui[u].w, ui[u].h);
            var pa = ctx.globalAlpha, pc = ctx.globalCompositeOperation, ps = ctx.imageSmoothingEnabled;
            ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
            ctx.drawImage(e.B, Math.round(X + ox), Math.round(Y + oy));
            ctx.globalAlpha = pa; ctx.globalCompositeOperation = pc; ctx.imageSmoothingEnabled = ps;
            var rr = { x: e.x + bb.x, y: e.y + bb.y, w: bb.w, h: bb.h };
            if (V) rr = inter(rr, V);
            for (u = 0; rr && u < ui.length; u++) if (inter(rr, ui[u]) && inter(rr, ui[u]).w * inter(rr, ui[u]).h === rr.w * rr.h) rr = null;
            if (rr) drawn.push({ x: rr.x, y: rr.y, w: rr.w, h: rr.h, id: e.id, variant: e.variant, age: Math.round(e.age) });
          } catch (err) { warn('draw', 'draw failed for "' + e.id + '": ' + err); }
        }
      },
      busy: function (id) { for (var i = 0; i < list.length; i++) if (!list[i].done && (id === undefined || id === null || same(list[i].id, id))) return true; return false; },
      clear: function () { var L = list; list = []; drawn = []; for (var i = 0; i < L.length; i++) finish(L[i]); },
      count: function () { return list.length; },
      lastDrawn: function () { return drawn.slice(); },
      setParams: setParams,
      params: function () { var o = {}; for (var k2 in P) o[k2] = P[k2]; return o; },
      skin: function () { return SK; }
    };
    return api;
  }

  root.GameDNA_DissolveDefeat = { version: VERSION, create: create, defaults: DEFAULTS, variants: VARIANTS.slice() };
})(typeof window !== 'undefined' ? window : this);
