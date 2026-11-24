/* GameDNA_NormalMaps v1.2.0 (L-05 Material & normal maps): light painted bitmaps on a plain 2D canvas with their
 * derived normal + material maps (nh2 layout from tools/assets/normalmap.py). One global, no dependencies; reads images
 * through GameDNA_Assets (L-00 loader) or any object with get(key) -> {img, w, h, meta}.
 *
 *   const nm = GameDNA_NormalMaps.create({ assets: GameDNA_Assets, lights: () => myLights, ambient: 0.7 });
 *   if (!nm.draw(ctx, 'herbalist', feetX, feetY, { h: 60 })) drawOldHerbalist();
 *
 * How it lights without WebGL: per (sprite, drawn size, light colour) it builds five small "basis" canvases once
 * (albedo x max(0, +nx), -nx, +ny, -ny, +nz, plus a gloss sheen), then each frame draws them with 'lighter' and
 * globalAlpha = the light direction's components x attenuation. Smooth in light position, ~3-5 drawImage per light.
 * Never throws from draw; missing map / tainted canvas / ?normals=0 -> plain albedo (still returns true);
 * missing albedo -> returns false so the caller keeps its old drawing. Output depends only on its inputs (no clock,
 * no random), so ?t=&freeze=1 stills match play.
 */
(function (root) {
  'use strict';
  var VERSION = '1.2.0';
  var AX = ['px', 'nx', 'py', 'ny', 'pz'];

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function parseColor(c, fallback) {
    if (Array.isArray(c)) return [num(c[0], 1), num(c[1], 1), num(c[2], 1)];
    if (typeof c === 'string') {
      var s = c.trim();
      if (s[0] === '#') {
        if (s.length === 4) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
        var n = parseInt(s.slice(1, 7), 16);
        if (isFinite(n)) return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
      }
      var m = /rgba?\(([^)]+)\)/.exec(s);
      if (m) { var p = m[1].split(','); return [num(p[0], 255) / 255, num(p[1], 255) / 255, num(p[2], 255) / 255]; }
    }
    return fallback || [1, 1, 1];
  }
  function ckey(c) { return Math.round(c[0] * 63) + ',' + Math.round(c[1] * 63) + ',' + Math.round(c[2] * 63); }
  function canvas(w, h) {
    try {
      if (typeof document !== 'undefined' && document.createElement) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
      if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    } catch (e) { }
    return null;
  }
  function urlOff() {
    try { var q = new URLSearchParams(root.location && root.location.search || ''); return q.get('normals') === '0'; } catch (e) { return false; }
  }

  function create(options) {
    var o = options || {};
    var P = {
      ambient: clamp(num(o.ambient, 0.7), 0, 1.5),
      ambientColor: parseColor(o.ambientColor, [1, 1, 1]),
      lightZ: num(o.lightZ, 48),
      strength: num(o.strength, 1),
      maxLights: Math.max(0, Math.floor(num(o.maxLights, 3))),
      sizeStep: Math.max(1, Math.floor(num(o.sizeStep, 1))),
      sheen: num(o.sheen, 1),
      wrap: clamp(num(o.wrap, 0.15), 0, 1),
      rim: clamp(num(o.rim, 0.4), 0, 2),
      maxLight: num(o.maxLight, 1.3),
      smoothing: /^(low|medium|high)$/.test(o.smoothing) ? o.smoothing : 'low',
      key: o.key === false ? null : (o.key || { x: -0.55, y: 0.6, z: 0.6, color: '#fff3e0', intensity: 0.35 }),
      enabled: o.enabled !== false && !urlOff()
    };
    var assets = o.assets || root.GameDNA_Assets || null;
    var lightsSrc = o.lights || null;
    var srcCache = {};      // key -> {state, w, h, n: Float32Array(3*w*h), m: Uint8ClampedArray(4*w*h)} or {state:'bad', why}
    var prep = {};          // key|w|h -> {w, h, base: {}, basis: {}, used}
    var prepOrder = [];
    var S = { draws: 0, lit: 0, flat: 0, missing: 0, builds: 0, buildMs: 0, errors: 0, reason: '' };
    var warned = {};

    function now() { try { return root.performance ? root.performance.now() : 0; } catch (e) { return 0; } }
    function warn(k, msg) { if (!warned[k]) { warned[k] = 1; try { console.warn('[GameDNA_NormalMaps] ' + msg); } catch (e) { } } }
    function rec(key) { try { return assets && assets.get ? assets.get(key) : null; } catch (e) { return null; } }
    function mapKey(key, r) {
      var m = r && r.meta || {};
      return m.normal || (key + '-nh');
    }

    // decode the packed map once at full size
    function source(key) {
      var s = srcCache[key];
      if (s) return s.state === 'ok' ? s : null;
      var r = rec(key), nr = r && rec(mapKey(key, r));
      if (!r || !nr || !nr.img) { return null; }    // not loaded (yet): try again next time
      var W = r.w || (r.img && (r.img.naturalWidth || r.img.width)), H = r.h || (r.img && (r.img.naturalHeight || r.img.height));
      var NW = nr.w || nr.img.width, NH = nr.h || nr.img.height;
      if (!W || !H || NW !== 2 * W || NH !== H) {
        srcCache[key] = { state: 'bad', why: 'map ' + NW + 'x' + NH + ' is not 2x the albedo ' + W + 'x' + H };
        warn('size' + key, key + ': ' + srcCache[key].why + ' (expected the nh2 layout)'); return null;
      }
      var c = canvas(NW, NH);
      if (!c) { srcCache[key] = { state: 'bad', why: 'no canvas' }; return null; }
      try {
        var g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(nr.img, 0, 0, NW, NH);
        var d = g.getImageData(0, 0, NW, NH).data;
        s = { state: 'ok', w: W, h: H, nh: c };
        srcCache[key] = s;
        return s;
      } catch (e) {
        srcCache[key] = { state: 'bad', why: 'cannot read pixels (' + (e && e.name) + '; serve the page over http, not file://)' };
        S.reason = srcCache[key].why; warn('taint', srcCache[key].why); return null;
      }
    }

    // resample albedo + maps to the drawn size and decode
    function prepared(key, r, s, w, h) {
      var id = key + '|' + w + '|' + h;
      var p = prep[id];
      if (p) { p.used = S.draws; return p; }
      var t0 = now();
      var ca = canvas(w, h), cn = canvas(w, h), cm = canvas(w, h);
      if (!ca || !cn || !cm) return null;
      try {
        var RF = { willReadFrequently: true };
        var ga = ca.getContext('2d', RF), gn = cn.getContext('2d', RF), gm = cm.getContext('2d', RF);
        ga.imageSmoothingEnabled = gn.imageSmoothingEnabled = gm.imageSmoothingEnabled = true;
        try { ga.imageSmoothingQuality = gn.imageSmoothingQuality = gm.imageSmoothingQuality = P.smoothing; } catch (e) { }
        ga.drawImage(r.img, 0, 0, w, h);
        gn.drawImage(s.nh, 0, 0, s.w, s.h, 0, 0, w, h);
        gm.drawImage(s.nh, s.w, 0, s.w, s.h, 0, 0, w, h);
        var A = ga.getImageData(0, 0, w, h), N = gn.getImageData(0, 0, w, h).data, M = gm.getImageData(0, 0, w, h).data;
        var n = new Float32Array(w * h * 3), ao = new Float32Array(w * h), gl = new Float32Array(w * h);
        for (var i = 0, j = 0; i < w * h; i++, j += 4) {
          var x = N[j] / 127.5 - 1, y = N[j + 1] / 127.5 - 1, z = N[j + 2] / 127.5 - 1;
          var L = Math.sqrt(x * x + y * y + z * z) || 1;
          n[i * 3] = x / L; n[i * 3 + 1] = y / L; n[i * 3 + 2] = z / L;
          ao[i] = M[j + 1] / 255; gl[i] = M[j + 2] / 255;
        }
        p = { w: w, h: h, albedo: A, n: n, ao: ao, gl: gl, base: {}, basis: {}, used: S.draws };
      } catch (e) {
        srcCache[key] = { state: 'bad', why: 'cannot read pixels (' + (e && e.name) + ')' }; S.reason = srcCache[key].why; return null;
      }
      prep[id] = p; prepOrder.push(id);
      if (prepOrder.length > 96) {             // drop the least recently used
        prepOrder.sort(function (a, b) { return (prep[a] ? prep[a].used : -1) - (prep[b] ? prep[b].used : -1); });
        var drop = prepOrder.splice(0, prepOrder.length - 80);
        for (var k = 0; k < drop.length; k++) delete prep[drop[k]];
      }
      S.builds++; S.buildMs += now() - t0;
      return p;
    }

    function layer(p, fn) {
      var c = canvas(p.w, p.h); if (!c) return null;
      var g = c.getContext('2d'), out = g.createImageData(p.w, p.h), D = out.data, A = p.albedo.data;
      for (var i = 0, j = 0; i < p.w * p.h; i++, j += 4) {
        if (!A[j + 3]) continue;
        fn(i, j, A, D);
      }
      g.putImageData(out, 0, 0);
      return c;
    }
    function baseLayer(p, amb, col, noAo) {
      var id = Math.round(amb * 40) + '|' + ckey(col) + (noAo ? '|f' : '');
      if (p.base[id]) return p.base[id];
      var k0 = amb * col[0], k1 = amb * col[1], k2 = amb * col[2];
      var c = layer(p, function (i, j, A, D) {
        var a = noAo ? 1 : 0.35 + 0.65 * p.ao[i];
        D[j] = A[j] * k0 * a; D[j + 1] = A[j + 1] * k1 * a; D[j + 2] = A[j + 2] * k2 * a; D[j + 3] = A[j + 3];
      });
      S.builds++;
      return (p.base[id] = c);
    }
    function basisSet(p, col) {
      var id = ckey(col);
      if (p.basis[id]) return p.basis[id];
      var set = { ratio: {} };
      set.fz = layer(p, function (i, j, A, D) {        // flat card: albedo x colour (for normals: false comparisons)
        D[j] = A[j] * col[0]; D[j + 1] = A[j + 1] * col[1]; D[j + 2] = A[j + 2] * col[2]; D[j + 3] = A[j + 3];
      });
      for (var a = 0; a < 5; a++) {
        (function (ax) {
          var comp = ax === 4 ? 2 : (ax >> 1), sign = ax === 4 ? 1 : (ax & 1 ? -1 : 1), sa = 0, sb = 0;
          set[AX[ax]] = layer(p, function (i, j, A, D) {
            var v = sign * p.n[i * 3 + comp], la = (A[j] + A[j + 1] + A[j + 2]) * A[j + 3];
            sa += la;
            if (v <= 0) { D[j + 3] = A[j + 3]; return; }
            var sh = P.sheen * p.gl[i] * Math.pow(v, 8) * 255;
            if (ax !== 4 && P.rim > 0) sh += P.rim * v * v * (1 - p.n[i * 3 + 2]) * 255;   // rim: edges turned to the light catch its colour
            D[j] = Math.min(255, (A[j] * v + sh) * col[0]);
            D[j + 1] = Math.min(255, (A[j + 1] * v + sh) * col[1]);
            D[j + 2] = Math.min(255, (A[j + 2] * v + sh) * col[2]);
            D[j + 3] = A[j + 3];
            sb += (Math.min(255, A[j] * v + sh) + Math.min(255, A[j + 1] * v + sh) + Math.min(255, A[j + 2] * v + sh)) * A[j + 3];
          });
          set.ratio[AX[ax]] = sa > 0 ? sb / sa : 0;   // light this layer adds, as a share of the plain picture (flat-card energy match)
        })(a);
      }
      S.builds++;
      return (p.basis[id] = set);
    }

    function lightList(o2) {
      var L = o2 && o2.lights !== undefined ? o2.lights : lightsSrc;
      try { if (typeof L === 'function') L = L(); } catch (e) { S.errors++; L = null; }
      return Array.isArray(L) ? L : [];
    }

    // weights for one light hitting a sprite whose box is (bx, by, bw, bh); returns null when out of reach
    function weigh(l, bx, by, bw, bh, flip) {
      if (!l || l.on === false) return null;
      var lx = num(l.x, NaN), ly = num(l.y, NaN);
      if (!isFinite(lx) || !isFinite(ly)) return null;
      var r = num(l.drawnRadius || l.radius, 120), inten = num(l.intensity, 1) * num(l.level, 1);
      if (r <= 0 || inten <= 0) return null;
      var px = clamp(lx, bx, bx + bw), py = clamp(ly, by, by + bh);
      var d = Math.sqrt((lx - px) * (lx - px) + (ly - py) * (ly - py));
      if (d >= r) return null;
      var att = 1 - d / r; att = att * att * (3 - 2 * att);
      var cx = bx + bw / 2, cy = by + bh / 2;
      var vx = lx - cx, vy = -(ly - cy), vz = num(l.z, P.lightZ);
      var len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      vx /= len; vy /= len; vz /= len;
      if (flip) vx = -vx;
      return { col: parseColor(l.color, [1, 0.85, 0.6]), k: att * inten * P.strength, v: [vx, vy, vz] };
    }

    function blit(ctx, c, k, x, y, w, h, alpha) {
      if (!c || k <= 0.003) return;
      var n = 0;
      while (k > 0.003 && n < 3) {
        ctx.globalAlpha = Math.min(1, k) * alpha;
        ctx.drawImage(c, x, y, w, h);
        k -= 1; n++;
      }
    }

    function size(r, o2) {
      var m = r.meta || {}, w0 = r.w || r.img.width, h0 = r.h || r.img.height, sc;
      if (o2.h) sc = o2.h / h0; else if (o2.w) sc = o2.w / w0; else if (o2.scale) sc = o2.scale;
      else if (m.drawH) sc = m.drawH / h0; else sc = 1;
      return [w0 * sc, h0 * sc];
    }

    function draw(ctx, key, x, y, opts) {
      var o2 = opts || {};
      S.draws++;
      var r = rec(key);
      if (!r || !r.img || !ctx) { S.missing++; return false; }
      try {
        var sz = size(r, o2), dw = sz[0], dh = sz[1];
        var an = o2.anchor || (r.meta && r.meta.anchor) || [0.5, 1];
        var bx = x - an[0] * dw, by = y - an[1] * dh;
        var alpha = o2.alpha == null ? 1 : clamp(num(o2.alpha, 1), 0, 1);
        var s = (P.enabled && o2.lit !== false) ? source(key) : null;
        if (!s) { S.flat++; return flat(ctx, r, bx, by, dw, dh, alpha, o2.flip, key, o2.flash); }
        // build at the size it lands on the device (drawn size x the context's scale), rounded up to sizeStep, capped
        // at the source size
        var st = P.sizeStep, cs = 1;
        var m = null;
        try { m = ctx.getTransform ? ctx.getTransform() : null; if (m) cs = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; } catch (e) { cs = 1; m = null; }
        var pw = Math.min(s.w, Math.max(4, Math.round(dw * cs / st) * st)), ph = Math.min(s.h, Math.max(4, Math.round(dh * cs / st) * st));
        // snap to whole device pixels (an axis-aligned transform): a small canvas drawn half a pixel off looks blurred
        if (m && !m.b && !m.c && m.a > 0 && m.d > 0 && pw < s.w) {
          var dx0 = Math.round(m.a * bx + m.e), dy0 = Math.round(m.d * (by + dh) + m.f);   // keep the feet line
          dw = pw / m.a; dh = ph / m.d; bx = (dx0 - m.e) / m.a; by = (dy0 - m.f) / m.d - dh;
          if (an[1] !== 1) { by = (Math.round(m.d * by + m.f) - m.f) / m.d; }
        }
        var p = prepared(key, r, s, pw, ph);
        if (!p) { S.flat++; return flat(ctx, r, bx, by, dw, dh, alpha, o2.flip, key, o2.flash); }
        var amb = o2.ambient != null ? num(o2.ambient, P.ambient) : P.ambient;
        var hits = [];
        var kl = o2.key !== undefined ? o2.key : P.key;
        if (kl) {
          var kv = [num(kl.x, -0.55), num(kl.y, 0.6), num(kl.z, 0.6)], kn = Math.sqrt(kv[0] * kv[0] + kv[1] * kv[1] + kv[2] * kv[2]) || 1;
          hits.push({ key: true, col: parseColor(kl.color, [1, 1, 1]), k: num(kl.intensity, 0.35), v: [(o2.flip ? -kv[0] : kv[0]) / kn, kv[1] / kn, kv[2] / kn] });
        }
        var ls = lightList(o2), found = [];
        for (var i = 0; i < ls.length; i++) { var w = weigh(ls[i], bx, by, dw, dh, o2.flip); if (w) found.push(w); }
        if (found.length > P.maxLights) { found.sort(function (a, b) { return b.k - a.k; }); found.length = P.maxLights; }
        hits = hits.concat(found);
        // exposure: the light added on top of the ambient never exceeds the headroom up to maxLight (default 1.3x
        // the painted colour), so several strong lights cannot wash a sprite out to white; direction contrast stays
        var add = 0;
        for (var q = 0; q < hits.length; q++) {
          var hv = hits[q].v; add += hits[q].k * ((hits[q].key ? 0 : P.wrap) + 0.5 * Math.abs(hv[0]) + 0.5 * Math.abs(hv[1]) + 0.8 * Math.max(0, hv[2]));
        }
        var room = Math.max(0.05, P.maxLight - amb);
        if (add > room) { var f = room / add; for (q = 0; q < hits.length; q++) hits[q] = { key: hits[q].key, col: hits[q].col, v: hits[q].v, k: hits[q].k * f }; }
        ctx.save();
        if (o2.flip) { ctx.translate(bx + dw / 2, 0); ctx.scale(-1, 1); ctx.translate(-(bx + dw / 2), 0); }
        ctx.globalAlpha = alpha;
        var flatCard = o2.normals === false;
        if (flatCard && p.aoMean == null) { var sm = 0, cnt = 0, AA = p.albedo.data; for (var q2 = 0; q2 < p.w * p.h; q2++) if (AA[q2 * 4 + 3]) { sm += 0.35 + 0.65 * p.ao[q2]; cnt++; } p.aoMean = cnt ? sm / cnt : 1; }
        ctx.drawImage(baseLayer(p, flatCard ? amb * p.aoMean : amb, P.ambientColor, flatCard), bx, by, dw, dh);
        ctx.globalCompositeOperation = 'lighter';
        for (var h = 0; h < hits.length; h++) {
          var L = hits[h], B = basisSet(p, L.col), v = L.v;
          if (flatCard) {   // the same light energy spread evenly (no direction): what a plain 2D light map gives
            var R0 = B.ratio, e = (L.key ? 0 : P.wrap) + Math.abs(v[0]) * R0[v[0] >= 0 ? 'px' : 'nx'] + Math.abs(v[1]) * R0[v[1] >= 0 ? 'py' : 'ny'] + Math.max(0, v[2]) * R0.pz;
            blit(ctx, B.fz, L.k * e, bx, by, dw, dh, alpha); continue;
          }
          if (P.wrap > 0 && !L.key) blit(ctx, B.fz, L.k * P.wrap, bx, by, dw, dh, alpha);   // light that wraps round
          blit(ctx, B[v[0] >= 0 ? 'px' : 'nx'], Math.abs(v[0]) * L.k, bx, by, dw, dh, alpha);
          blit(ctx, B[v[1] >= 0 ? 'py' : 'ny'], Math.abs(v[1]) * L.k, bx, by, dw, dh, alpha);
          blit(ctx, B.pz, Math.max(0, v[2]) * L.k, bx, by, dw, dh, alpha);
        }
        ctx.globalCompositeOperation = 'source-over';
        whiteFlash(ctx, key, r, bx, by, dw, dh, alpha, o2.flash);
        ctx.restore();
        S.lit++;
        return true;
      } catch (e) {
        S.errors++; warn('draw', 'draw(' + key + ') failed: ' + (e && e.message));
        try { ctx.restore(); } catch (e2) { }
        try { return assets.draw ? assets.draw(ctx, key, x, y, o2) : false; } catch (e3) { return false; }
      }
    }

    function flat(ctx, r, bx, by, dw, dh, alpha, flip, key, flash) {
      ctx.save();
      ctx.globalAlpha = alpha;
      if (flip) { ctx.translate(bx + dw / 2, 0); ctx.scale(-1, 1); ctx.translate(-(bx + dw / 2), 0); }
      ctx.drawImage(r.img, bx, by, dw, dh);
      whiteFlash(ctx, key, r, bx, by, dw, dh, alpha, flash);
      ctx.restore();
      return true;
    }
    // hurt flash: the sprite's own silhouette in white (or o.flashColor) over it, alpha = flash 0..1. Built once per key
    // with 'source-in' on an offscreen canvas (no pixel reads, so it also works on file:// pages).
    var whites = {};
    function whiteFlash(ctx, key, r, bx, by, dw, dh, alpha, flash) {
      var f = num(flash, 0);
      if (!(f > 0)) return;
      var c = whites[key];
      if (!c) {
        var w = r.w || r.img.width, h = r.h || r.img.height;
        c = canvas(w, h); if (!c) return;
        var g = c.getContext('2d');
        g.drawImage(r.img, 0, 0, w, h);
        g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
        whites[key] = c;
      }
      ctx.globalAlpha = clamp(f, 0, 1) * alpha;
      ctx.drawImage(c, bx, by, dw, dh);
    }

    // visual canvases of the maps at the source size (for viewers, J-02 uploads, demos)
    function maps(key) {
      var s = source(key), r = rec(key);
      if (!s || !r) return null;
      try {
        var w = s.w, h = s.h, src = s.nh.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 2 * w, h).data;
        var mk = function (fn) {
          var c = canvas(w, h), g = c.getContext('2d'), out = g.createImageData(w, h), D = out.data;
          for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var j = (y * w + x) * 4; fn(D, j, (y * 2 * w + x) * 4, (y * 2 * w + w + x) * 4, src); }
          g.putImageData(out, 0, 0); return c;
        };
        return {
          w: w, h: h, albedo: r.img, packed: s.nh,
          normal: mk(function (D, j, a, b, S2) { D[j] = S2[a]; D[j + 1] = S2[a + 1]; D[j + 2] = S2[a + 2]; D[j + 3] = 255; }),
          height: mk(function (D, j, a, b, S2) { D[j] = D[j + 1] = D[j + 2] = S2[b]; D[j + 3] = 255; }),
          ao: mk(function (D, j, a, b, S2) { D[j] = D[j + 1] = D[j + 2] = S2[b + 1]; D[j + 3] = 255; }),
          gloss: mk(function (D, j, a, b, S2) { D[j] = D[j + 1] = D[j + 2] = S2[b + 2]; D[j + 3] = 255; })
        };
      } catch (e) { return null; }
    }

    // the decoded normal (y up) + material at albedo pixel (x, y); null outside / unavailable
    function sample(key, x, y) {
      var s = source(key);
      if (!s) return null;
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= s.w || y >= s.h) return null;
      try {
        var g = s.nh.getContext('2d', { willReadFrequently: true }), a = g.getImageData(x, y, 1, 1).data, b = g.getImageData(x + s.w, y, 1, 1).data;
        return { n: [a[0] / 127.5 - 1, a[1] / 127.5 - 1, a[2] / 127.5 - 1], height: b[0] / 255, ao: b[1] / 255, gloss: b[2] / 255 };
      } catch (e) { return null; }
    }

    var inst = {
      version: VERSION,
      draw: draw,
      has: function (key) { return !!source(key); },
      why: function (key) { var s = srcCache[key]; return s && s.why || (rec(key) ? (rec(mapKey(key, rec(key))) ? '' : 'no map loaded (' + mapKey(key, rec(key)) + ')') : 'no albedo'); },
      maps: maps,
      sample: sample,
      setLights: function (l) { lightsSrc = l; },
      set: function (k, v) {
        if (k === 'ambient') P.ambient = clamp(num(v, P.ambient), 0, 1.5);
        else if (k === 'ambientColor') P.ambientColor = parseColor(v, P.ambientColor);
        else if (k === 'key') P.key = v || null;
        else if (k === 'enabled') P.enabled = !!v;
        else if (k in P) P[k] = num(v, P[k]);
      },
      params: function () { return JSON.parse(JSON.stringify(P)); },
      stats: function () {
        return { version: VERSION, enabled: P.enabled, draws: S.draws, lit: S.lit, flat: S.flat, missing: S.missing, builds: S.builds,
          buildMs: Math.round(S.buildMs * 10) / 10, prepared: prepOrder.length, errors: S.errors, reason: S.reason };
      },
      clear: function () { srcCache = {}; prep = {}; prepOrder = []; whites = {}; }
    };
    ALL.push(inst);
    return inst;
  }
  var ALL = [];

  root.GameDNA_NormalMaps = { version: VERSION, create: create, instances: function () { return ALL.slice(); } };
})(typeof window !== 'undefined' ? window : this);
