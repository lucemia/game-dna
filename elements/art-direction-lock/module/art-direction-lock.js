/* GameDNA_Assets v1.0 · L-00 Art-direction lock · plain script, no dependencies, no import/export, one global.
 *
 * Loads a set of pre-generated bitmaps ONCE at boot, then hands them out synchronously, so the game can draw them
 * every frame and `?t=<ms>&freeze=1` stays deterministic. The game never calls an image generator.
 *
 *   GameDNA_Assets.load(listOrManifest, {base, onReady, timeoutMs, bitmap}) -> Promise (never rejects)
 *   GameDNA_Assets.onReady(fn)            fn(assets) now if loaded, else once loading finishes (for hosts that don't await)
 *   GameDNA_Assets.get(key)               {key, img, w, h, meta} or null (missing / failed / not loaded yet); never throws
 *   GameDNA_Assets.img(key)               the image (ImageBitmap or HTMLImageElement) or null
 *   GameDNA_Assets.draw(ctx, key, x, y, o)   draw with the asset's anchor at (x, y); false when missing (draw your fallback)
 *   GameDNA_Assets.drawFrame(ctx, key, i, x, y, o)   one cell of a grid asset (sprite sheet), same anchoring
 *   GameDNA_Assets.create()               a separate instance (several packs); the global itself is the default instance
 *
 * listOrManifest: an assets.json object ({assets: [{key, file, ...}]}) or an array of {key, src, ...} where src is a URL
 * (relative to opts.base) or a data: URI. Every other field (role, kind, anchor, baseline, drawH, grid, cells, slice,
 * skinRole...) is kept as the asset's meta. A string is fetched as JSON (needs http://; file:// pages should inline it).
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';

  function make() {
    var A = {}, MAP = {}, ORDER = [], FAILED = [], state = 'idle', waiters = [], loadPromise = null;

    function safe(fn, arg) { try { if (typeof fn === 'function') fn(arg); } catch (e) { if (root.console) console.warn('GameDNA_Assets: callback error', e); } }
    function finish() { state = 'ready'; var w = waiters; waiters = []; w.forEach(function (fn) { safe(fn, A); }); }

    function entries(x, base) {
      var list = Array.isArray(x) ? x : (x && Array.isArray(x.assets) ? x.assets : []);
      return list.filter(function (e) { return e && e.key != null; }).map(function (e) {
        var meta = {}, k; for (k in e) if (k !== 'src' && k !== 'img') meta[k] = e[k];
        var src = e.src || e.file || null;
        if (src && base && !/^(data:|blob:|https?:|file:|\/)/.test(src)) src = base.replace(/\/?$/, '/') + src;
        return { key: String(e.key), src: src, img: e.img || null, meta: meta };
      });
    }
    function loadOne(e, opts) {
      return new Promise(function (res) {
        var done = false, timer = null;
        function ok(img) { if (done) return; done = true; clearTimeout(timer); var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height; MAP[e.key] = { key: e.key, img: img, w: w, h: h, meta: e.meta }; res(); }
        function fail(why) { if (done) return; done = true; clearTimeout(timer); FAILED.push({ key: e.key, src: e.src && String(e.src).slice(0, 80), why: why }); res(); }
        if (e.img && (e.img.width || e.img.naturalWidth)) return ok(e.img);
        if (!e.src || typeof Image === 'undefined') return fail('no src');
        timer = setTimeout(function () { fail('timeout'); }, opts.timeoutMs || 10000);
        var im = new Image();
        im.onload = function () {
          if (opts.bitmap !== false && typeof createImageBitmap === 'function') createImageBitmap(im).then(ok, function () { ok(im); });
          else ok(im);
        };
        im.onerror = function () { fail('load error'); };
        try { im.src = e.src; } catch (err) { fail('bad src'); }
      });
    }

    A.version = VERSION;
    A.load = function (x, opts) {
      opts = opts || {};
      if (opts.onReady) A.onReady(opts.onReady);
      if (loadPromise && state !== 'ready') return loadPromise.then(function () { return A.load(x, { base: opts.base, timeoutMs: opts.timeoutMs, bitmap: opts.bitmap }); });
      state = 'loading';
      var p;
      if (typeof x === 'string') {
        var url = x, base = opts.base != null ? opts.base : url.replace(/[^\/]*$/, '');
        p = (typeof fetch === 'function' ? fetch(url).then(function (r) { return r.json(); }) : Promise.reject(new Error('no fetch')))
          .then(function (m) { return Promise.all(entries(m, base).map(function (e) { ORDER.indexOf(e.key) < 0 && ORDER.push(e.key); return loadOne(e, opts); })); },
            function (err) { FAILED.push({ key: '*', src: url, why: 'manifest: ' + (err && err.message) }); });
      } else {
        var list = entries(x, opts.base);
        list.forEach(function (e) { if (ORDER.indexOf(e.key) < 0) ORDER.push(e.key); });
        p = Promise.all(list.map(function (e) { return loadOne(e, opts); }));
      }
      loadPromise = p.then(function () { finish(); return A; }, function () { finish(); return A; });
      return loadPromise;
    };
    A.onReady = function (fn) { if (state === 'ready') safe(fn, A); else waiters.push(fn); return A; };
    A.isReady = function () { return state === 'ready'; };
    A.get = function (key) { var r = MAP[key]; return r || null; };
    A.img = function (key) { var r = MAP[key]; return r ? r.img : null; };
    A.meta = function (key) { var r = MAP[key]; return r ? r.meta : null; };
    A.has = function (key) { return !!MAP[key]; };
    A.keys = function () { return ORDER.filter(function (k) { return !!MAP[k]; }); };
    A.status = function () { return { state: state, loaded: A.keys().length, failed: FAILED.slice(), total: ORDER.length }; };
    A.add = function (key, img, meta) { if (!img) return null; ORDER.indexOf(key) < 0 && ORDER.push(key); MAP[key] = { key: key, img: img, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height, meta: meta || {} }; return MAP[key]; };
    A.clear = function () { MAP = {}; ORDER = []; FAILED = []; state = 'idle'; loadPromise = null; };

    // drawing: (x, y) is the anchor point in the host's canvas pixels (default anchor = the foot: bottom centre).
    // o = {h (draw height), w, scale, flip, alpha, anchor [ax, ay]}. Size: o.w/o.h/o.scale, else meta.drawH, else the
    // file's own size. Returns false (and draws nothing) when the asset is missing, so the host can draw its old art.
    function place(r, sw, sh, o) {
      var m = r.meta || {}, s;
      if (o.h) s = o.h / sh; else if (o.w) s = o.w / sw; else if (o.scale) s = o.scale; else if (m.drawH) s = m.drawH / sh; else s = 1;
      var an = o.anchor || m.anchor || [0.5, 1], ax = an[0] == null ? 0.5 : an[0], ay = m.baseline != null && !o.anchor ? m.baseline / (m.h || r.h) : (an[1] == null ? 1 : an[1]);
      return { s: s, dw: sw * s, dh: sh * s, ax: ax, ay: ay };
    }
    function blit(ctx, img, sx, sy, sw, sh, x, y, P, o) {
      var pa = ctx.globalAlpha;
      ctx.save();
      try {
        if (o.alpha != null) ctx.globalAlpha = pa * o.alpha;
        if (o.smooth !== undefined) ctx.imageSmoothingEnabled = !!o.smooth;
        ctx.translate(x, y); if (o.flip) ctx.scale(-1, 1);
        ctx.drawImage(img, sx, sy, sw, sh, -P.ax * P.dw, -P.ay * P.dh, P.dw, P.dh);
      } catch (e) { ctx.restore(); return false; }
      ctx.restore();
      return true;
    }
    A.draw = function (ctx, key, x, y, o) {
      var r = MAP[key]; if (!r || !ctx) return false; o = o || {};
      return blit(ctx, r.img, 0, 0, r.w, r.h, x, y, place(r, r.w, r.h, o), o);
    };
    A.drawFrame = function (ctx, key, i, x, y, o) {
      var r = MAP[key]; if (!r || !ctx) return false; o = o || {};
      var g = (r.meta && r.meta.grid) || { cols: 1, rows: 1 }, cols = g.cols || 1, rows = g.rows || 1, n = cols * rows;
      var cw = r.w / cols, ch = r.h / rows, k = ((Math.floor(i) % n) + n) % n;
      var P = place({ meta: { anchor: r.meta && r.meta.anchor, drawH: r.meta && r.meta.drawH, baseline: g.baselines ? g.baselines[k] : undefined, h: ch } }, cw, ch, o);
      return blit(ctx, r.img, (k % cols) * cw, Math.floor(k / cols) * ch, cw, ch, x, y, P, o);
    };
    // fill a rect with a tiling texture (role tile), aligned to world origin (ox, oy) so tiles do not swim when scrolling
    A.fillTiled = function (ctx, key, rect, o) {
      var r = MAP[key]; if (!r || !ctx || !rect) return false; o = o || {};
      var tw = o.tileW || (r.meta && r.meta.tileW) || r.w, th = o.tileH || (r.meta && r.meta.tileH) || r.h, ox = o.ox || 0, oy = o.oy || 0;
      ctx.save();
      try {
        ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
        var x0 = rect.x - ((((rect.x - ox) % tw) + tw) % tw), y0 = rect.y - ((((rect.y - oy) % th) + th) % th);
        for (var y = y0; y < rect.y + rect.h; y += th) for (var x = x0; x < rect.x + rect.w; x += tw) ctx.drawImage(r.img, x, y, tw + 0.5, th + 0.5);
      } catch (e) { ctx.restore(); return false; }
      ctx.restore();
      return true;
    };
    A.create = make;
    return A;
  }

  root.GameDNA_Assets = make();
})(typeof window !== 'undefined' ? window : this);
