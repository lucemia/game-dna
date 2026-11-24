/* GameDNA E-04 · Shatter battle transition · module v1 (plain script, no dependencies, one global)
 *
 *   const tr = GameDNA_BattleTransition.create({
 *     view: { x: 0, y: 0, w: 256, h: 224 },   // the screen area to cover, in native pixels (default: the whole canvas)
 *     canvas: myCanvas,                       // optional: your screen canvas (fallback for capture, live reveal)
 *     skin: 'pixel16',                        // optional: GameDNA_Skin id or object; works without skin-api.js
 *     seed: 7,                                // optional: shard layout seed (same seed + same start order = same shards)
 *     params: { variant: 'shatter', reveal: 'match', duration: 900, pieces: 6, spin: 240, flash: 'on' }
 *   });
 *   tr.start({ variant, reveal, capture, onMid, onDone, focus: {x, y} })   // capture: canvas OR function(snapCtx) -> canvas?
 *   tr.busy()            // true from start() until the reveal ends: block input / pause world logic while true
 *   tr.update(dtMs)      // advance the module's own clock from your fixed step (deterministic for ?t=&freeze=1)
 *   tr.draw(ctx)         // LAST thing every frame, after the whole scene and HUD
 *
 * Timeline (D = duration): out 0-55 % (old frame breaks away), hold 55-63 % (backdrop only; onMid fires at 55 %),
 * in 63-100 % (new scene revealed). onDone fires at 100 %. A throwing callback never stops the reveal.
 */
(function (root) {
  'use strict';
  var DEFAULTS = { variant: 'shatter', reveal: 'match', duration: 900, pieces: 6, spin: 240, flash: 'on' };
  var VARIANTS = { shatter: 1, swirl: 1, mosaic: 1, iris: 1 };
  var REVEALS = { match: 1, fade: 1, iris: 1, mosaic: 1, swirl: 1, cut: 1 };
  var MATCH = { shatter: 'fade', swirl: 'swirl', mosaic: 'mosaic', iris: 'iris' };
  var OUT_END = 0.55, HOLD_END = 0.63;
  var STEP = 1000 / 60;

  // built-in pixel16 look, used when skin-api.js is not loaded (tokens match skins/pixel16.js)
  var FALLBACK = {
    id: 'pixel16-builtin', pixel: true, native: { smoothing: false },
    palette: { ink: '#06061a', paper: '#f4f6ff', ui: { highlight: '#c8d4f4', shadow: '#0a0e22' }, fx: { white: '#ffffff', cold: '#6ad8f0', crit: '#ffb43a' }, text: { main: '#ffffff' } },
    motion: { stepMs: STEP, snap: true, fadeSteps: [1, 0.75, 0.5, 0.25] }
  };

  function mk(w, h) { var c = root.document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function rng(seed) {   // mulberry32
    var s = (seed >>> 0) || 1;
    return function () { s = (s + 0x6d2b79f5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function drawable(x) {
    return !!x && typeof x === 'object' && (typeof x.width === 'number' && x.width > 0) && (typeof x.getContext === 'function' || typeof x.naturalWidth === 'number' || typeof x.close === 'function' || typeof x.videoWidth === 'number');
  }
  function smoothIn(x) { return x * x * (3 - 2 * x); }

  function create(options) {
    var O = options || {};
    var SKA = root.GameDNA_Skin, SK = FALLBACK;
    try { if (SKA && SKA.resolve) SK = SKA.resolve(O.skin) || FALLBACK; } catch (e) { SK = FALLBACK; }
    var pixel = SK.pixel !== false;
    function tok(path, dflt) {
      var parts = path.split('.'), v = SK.palette;
      for (var i = 0; i < parts.length && v != null; i++) v = v[parts[i]];
      if (typeof v === 'string') return v;
      v = FALLBACK.palette; for (i = 0; i < parts.length && v != null; i++) v = v[parts[i]];
      return typeof v === 'string' ? v : dflt;
    }
    function fade(a) {   // stepped alpha through the skin; 0 stays 0
      if (a <= 0.001) return 0; if (a >= 0.999) return 1;
      try { if (SKA && SKA.motion && SK !== FALLBACK) return SKA.motion.fade(SK, a); } catch (e) { /* fall through */ }
      var F = (SK.motion && SK.motion.fadeSteps) || FALLBACK.motion.fadeSteps;
      for (var i = 0; i < F.length; i++) if (a >= F[i] - 1e-9) return F[i];
      return F[F.length - 1];
    }
    function stepT(ms) { var st = SK.motion && SK.motion.stepMs; return st > 0 ? Math.floor(ms / st + 1e-6) * st : ms; }

    var P = {}; var k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    function setParams(o) {
      if (!o) return;
      for (var key in o) if (Object.prototype.hasOwnProperty.call(DEFAULTS, key) && o[key] != null) P[key] = o[key];
      if (!VARIANTS[P.variant]) P.variant = DEFAULTS.variant;
      if (!REVEALS[P.reveal]) P.reveal = DEFAULTS.reveal;
      P.duration = clamp(num(P.duration, DEFAULTS.duration), 300, 3000);
      P.pieces = Math.round(clamp(num(P.pieces, DEFAULTS.pieces), 3, 12));
      P.spin = clamp(num(P.spin, DEFAULTS.spin), 0, 1080);
      P.flash = P.flash === 'off' || P.flash === false ? 'off' : 'on';
    }
    setParams(O.params);

    var warned = {};
    function warn(key, msg, err) {
      if (warned[key]) return; warned[key] = 1; stats.warnings++;
      try { if (root.console) root.console.warn('[GameDNA_BattleTransition] ' + msg, err || ''); } catch (e) { /* ignore */ }
      if (typeof O.onWarn === 'function') { try { O.onWarn(key, msg); } catch (e) { /* ignore */ } }
    }
    function call(fn, name) {
      if (typeof fn !== 'function') return;
      try { fn(); } catch (e) { stats.callbackErrors++; warn('cb-' + name, name + ' threw; the transition carries on so the screen is never left covered', e); }
    }

    var stats = { starts: 0, mids: 0, dones: 0, ignored: 0, warnings: 0, callbackErrors: 0, watchdog: 0 };
    var view = null, lastCanvas = null;
    function getView(ctxCanvas) {
      var v = O.view || O.bounds;
      if (v && v.w > 0 && v.h > 0) return { x: num(v.x, 0), y: num(v.y, 0), w: Math.round(v.w), h: Math.round(v.h) };
      var c = O.canvas || ctxCanvas || lastCanvas;
      if (c && c.width > 0) return { x: 0, y: 0, w: c.width, h: c.height };
      return { x: 0, y: 0, w: 256, h: 224 };
    }

    // ---------------------------------------------------------------- state of the running transition
    var R = null;            // running transition
    var drawsSinceUpdate = 0;
    var seed0 = num(O.seed, 0x5eed) >>> 0;
    var scr = [];   // reusable scratch canvases: 0 = live copy / swirl, 1 = mosaic blocks, 2 = kept live frame

    function copyFit(g, src, w, h) {   // copy a source canvas/image into a w x h snapshot
      var sw = src.width || src.naturalWidth || src.videoWidth, sh = src.height || src.naturalHeight || src.videoHeight;
      if (!(sw > 0 && sh > 0)) return false;
      if (sw === w && sh === h) g.drawImage(src, 0, 0);
      else if (view && sw >= view.x + w && sh >= view.y + h && sw < 2 * (view.x + w) && sh < 2 * (view.y + h)) g.drawImage(src, view.x, view.y, w, h, 0, 0, w, h);
      else g.drawImage(src, 0, 0, sw, sh, 0, 0, w, h);
      return true;
    }
    function blank(g, w, h) {
      try {
        var d = g.getImageData(0, 0, w, h).data, step = Math.max(4, ((w * h) / 512) | 0) * 4;
        for (var i = 3; i < d.length; i += step) if (d[i] !== 0) return false;
        return true;
      } catch (e) { return false; }
    }

    function capture(spec, w, h) {
      var snap = mk(w, h), g = snap.getContext('2d'), ok = false, src = spec.capture;
      g.imageSmoothingEnabled = false;
      try {
        if (typeof src === 'function') {
          var r = src(g, snap);
          if (drawable(r)) ok = copyFit(g, r, w, h);
          else ok = !blank(g, w, h);
        } else if (drawable(src)) ok = copyFit(g, src, w, h);
      } catch (e) { warn('capture', 'capture threw; falling back to the screen canvas', e); }
      if (!ok) {
        var c = O.canvas || lastCanvas || (root.document && root.document.querySelector && root.document.querySelector('canvas'));
        if (c && c.width > 0) { try { g.clearRect(0, 0, w, h); ok = copyFit(g, c, w, h); } catch (e) { ok = false; } }
        if (src != null && typeof src !== 'function' && !drawable(src)) warn('capture-type', 'capture must be a canvas/image or a function; used the screen canvas instead');
      }
      if (!ok) { g.fillStyle = tok('ink', '#06061a'); g.fillRect(0, 0, w, h); warn('capture-none', 'nothing to capture; the transition starts from the backdrop'); }
      return snap;
    }

    // ---------------------------------------------------------------- shatter geometry (built once per start)
    function buildShards(snap, w, h, cols, focus, seed) {
      var rand = rng(seed), rows = Math.max(2, Math.round(cols * h / w)), pts = [], i, j;
      var cw = w / cols, ch = h / rows, jx = cw * 0.38, jy = ch * 0.38;
      for (j = 0; j <= rows; j++) for (i = 0; i <= cols; i++) {
        var ex = i === 0 || i === cols, ey = j === 0 || j === rows;
        pts.push([Math.round(i * cw + (ex ? 0 : (rand() - 0.5) * 2 * jx)), Math.round(j * ch + (ey ? 0 : (rand() - 0.5) * 2 * jy))]);
      }
      var Pt = function (a, b) { return pts[b * (cols + 1) + a]; };
      var maxD = 0, corners = [[0, 0], [w, 0], [0, h], [w, h]];
      for (i = 0; i < 4; i++) maxD = Math.max(maxD, Math.hypot(corners[i][0] - focus.x, corners[i][1] - focus.y));
      var shards = [], edges = [], seen = {};
      function edge(a, b) {
        var key = a < b ? a + ',' + b : b + ',' + a; if (seen[key]) return; seen[key] = 1;
        var A = pts[a], B = pts[b];
        if ((A[0] === B[0] && (A[0] === 0 || A[0] === w)) || (A[1] === B[1] && (A[1] === 0 || A[1] === h))) return;   // screen border
        edges.push({ a: A, b: B, d: Math.hypot((A[0] + B[0]) / 2 - focus.x, (A[1] + B[1]) / 2 - focus.y) / maxD });
      }
      var hi = tok('ui.highlight', '#c8d4f4'), lo = tok('ui.shadow', '#0a0e22');
      for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
        var ia = j * (cols + 1) + i, ib = ia + 1, ic = ia + cols + 2, id = ia + cols + 1;
        var flip = rand() < 0.5;
        var tris = flip ? [[ia, ib, ic], [ia, ic, id]] : [[ia, ib, id], [ib, ic, id]];
        edge(ia, ib); edge(ib, ic); edge(ic, id); edge(id, ia); if (flip) edge(ia, ic); else edge(ib, id);
        for (var t = 0; t < 2; t++) {
          var T = tris[t].map(function (n) { return pts[n]; });
          var x0 = Math.min(T[0][0], T[1][0], T[2][0]), y0 = Math.min(T[0][1], T[1][1], T[2][1]);
          var x1 = Math.max(T[0][0], T[1][0], T[2][0]), y1 = Math.max(T[0][1], T[1][1], T[2][1]);
          var sw = x1 - x0 + 2, sh = y1 - y0 + 2, c = mk(sw, sh), q = c.getContext('2d');
          q.imageSmoothingEnabled = false;
          q.save(); q.beginPath(); q.moveTo(T[0][0] - x0 + 1, T[0][1] - y0 + 1); q.lineTo(T[1][0] - x0 + 1, T[1][1] - y0 + 1); q.lineTo(T[2][0] - x0 + 1, T[2][1] - y0 + 1); q.closePath();
          q.clip(); q.drawImage(snap, -x0 + 1, -y0 + 1); q.restore();
          bevel(q, sw, sh, hi, lo);
          var cx = (T[0][0] + T[1][0] + T[2][0]) / 3, cy = (T[0][1] + T[1][1] + T[2][1]) / 3;
          var r1 = rand(), r2 = rand();
          shards.push({ c: c, ox: cx - x0 + 1, oy: cy - y0 + 1, cx: cx, cy: cy, r1: r1, r2: r2, size: Math.max(sw, sh),
            delay: 0.32 * Math.hypot(cx - focus.x, cy - focus.y) / maxD, dir: r1 < 0.5 ? -1 : 1 });
        }
      }
      edges.sort(function (a, b) { return a.d - b.d; });
      var dust = [];
      for (i = 0; i < 26; i++) {
        var p = pts[(rand() * pts.length) | 0];
        dust.push({ x: p[0], y: p[1], vx: (p[0] - focus.x) / maxD * (30 + rand() * 50), vy: -10 - rand() * 30, g: 160 + rand() * 120, at: rand() * 0.3, life: 0.35 + rand() * 0.4, big: rand() < 0.3, cold: rand() < 0.5 });
      }
      return { shards: shards, edges: edges, dust: dust };
    }
    // crisp 1-bit shard edges with a bevel: light on the upper-left rim, dark on the lower-right rim (pixel skins)
    function bevel(q, w, h, hi, lo) {
      var id;
      try { id = q.getImageData(0, 0, w, h); } catch (e) { return; }
      var d = id.data, n = w * h, a = new Uint8Array(n), i, x, y;
      for (i = 0; i < n; i++) a[i] = d[i * 4 + 3] >= (pixel ? 128 : 8) ? 1 : 0;
      if (pixel) for (i = 0; i < n; i++) d[i * 4 + 3] = a[i] ? 255 : 0;
      var H = hex(hi), L = hex(lo);
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        i = y * w + x; if (!a[i]) continue;
        var lit = 0, dark = 0;   // 8-neighbour rim, so stair-stepped diagonals get an unbroken 1 px edge
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          var xx = x + dx, yy = y + dy, open = xx < 0 || yy < 0 || xx >= w || yy >= h || !a[yy * w + xx];
          if (open) { if (dy < 0 || (dy === 0 && dx < 0)) lit++; else dark++; }
        }
        var C = lit && lit >= dark ? H : dark ? L : null;
        if (C) { d[i * 4] = C[0]; d[i * 4 + 1] = C[1]; d[i * 4 + 2] = C[2]; if (!pixel) d[i * 4 + 3] = 255; }
      }
      q.putImageData(id, 0, 0);
    }
    function hex(s) {
      var m = /^#?([0-9a-f]{6})$/i.exec(String(s).trim());
      if (m) { var v = parseInt(m[1], 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; }
      return [200, 212, 244];
    }

    // ---------------------------------------------------------------- public: start
    function start(spec) {
      spec = spec || {};
      if (R) {   // already running: never lose the caller's scene switch; it happens under the running cover
        stats.ignored++;
        warn('busy-start', 'start() called while a transition is running; its onMid/onDone ran at once');
        call(spec.onMid, 'onMid'); call(spec.onDone, 'onDone');
        return false;
      }
      var v = getView(null);
      view = v;
      var variant = VARIANTS[spec.variant] ? spec.variant : P.variant;
      var reveal = REVEALS[spec.reveal] ? spec.reveal : P.reveal;
      if (reveal === 'match') reveal = MATCH[variant];
      var dur = clamp(num(spec.duration, P.duration), 300, 3000);
      var f = spec.focus && isFinite(spec.focus.x) && isFinite(spec.focus.y) ? { x: clamp(spec.focus.x - v.x, 0, v.w), y: clamp(spec.focus.y - v.y, 0, v.h) } : { x: v.w / 2, y: v.h / 2 };
      var seed = (spec.seed != null ? num(spec.seed, 0) : seed0 + stats.starts * 7919) >>> 0;
      var snap = null;
      try { snap = capture(spec, v.w, v.h); } catch (e) { warn('capture2', 'capture failed', e); }
      R = { variant: variant, reveal: reveal, dur: dur, t: 0, focus: f, seed: seed, snap: snap, mid: false, onMid: spec.onMid, onDone: spec.onDone, geo: null, w: v.w, h: v.h };
      if (variant === 'shatter' && snap) { try { R.geo = buildShards(snap, v.w, v.h, P.pieces, f, seed); } catch (e) { warn('shards', 'could not build shards; using a fade', e); R.variant = 'mosaic'; } }
      stats.starts++;
      drawsSinceUpdate = 0;
      return true;
    }
    function finish() {
      if (!R) return;
      var r = R;
      if (!r.mid) { r.mid = true; stats.mids++; call(r.onMid, 'onMid'); }
      R = null; stats.dones++;
      call(r.onDone, 'onDone');
    }
    function advance(dt) {
      if (!R) return;
      dt = num(dt, 0); if (dt < 0) dt = 0; if (dt > 250) dt = 250;
      if (dt > 0 && dt < 0.25) { warn('seconds', 'update(dt) takes milliseconds; ' + dt + ' looks like seconds, multiplied by 1000'); dt *= 1000; }
      R.t += dt;
      if (!R.mid && R.t >= R.dur * OUT_END) { R.mid = true; stats.mids++; call(R.onMid, 'onMid'); }
      if (R && R.t >= R.dur) finish();
    }
    function update(dt) { drawsSinceUpdate = 0; advance(dt); }
    function phase() { if (!R) return 'idle'; var q = R.t / R.dur; return q < OUT_END ? 'out' : q < HOLD_END ? 'hold' : 'in'; }

    // ---------------------------------------------------------------- drawing helpers
    function line(g, a, b, col) {   // 1 px Bresenham line
      var x0 = Math.round(a[0]), y0 = Math.round(a[1]), x1 = Math.round(b[0]), y1 = Math.round(b[1]);
      var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy, n = 0;
      g.fillStyle = col;
      while (n++ < 2000) { g.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; var e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
    }
    function irisMask(g, w, h, cx, cy, r, col) {   // everything outside a pixel-stepped circle
      g.fillStyle = col;
      r = Math.max(0, r);
      if (r < 0.5) { g.fillRect(0, 0, w, h); return; }
      var top = Math.max(0, Math.floor(cy - r)), bot = Math.min(h, Math.ceil(cy + r));
      if (top > 0) g.fillRect(0, 0, w, top);
      if (bot < h) g.fillRect(0, bot, w, h - bot);
      for (var y = top; y < bot; y++) {
        var dy = y + 0.5 - cy, hw = r * r - dy * dy;
        if (hw <= 0) { g.fillRect(0, y, w, 1); continue; }
        hw = Math.sqrt(hw);
        var l = Math.round(cx - hw), rr = Math.round(cx + hw);
        if (l > 0) g.fillRect(0, y, Math.min(w, l), 1);
        if (rr < w) g.fillRect(Math.max(0, rr), y, w - Math.max(0, rr), 1);
      }
    }
    function scratch(w, h, slot) {
      var c = scr[slot];
      if (!c || c.width !== w || c.height !== h) c = scr[slot] = mk(w, h);
      var g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.imageSmoothingEnabled = !pixel;
      return c;
    }
    function mosaic(g, src, w, h, block) {   // draw src (w x h) into g as blocks
      block = Math.max(1, Math.round(block));
      if (block <= 1) { g.drawImage(src, 0, 0); return; }
      var sw = Math.ceil(w / block), sh = Math.ceil(h / block), s = scratch(sw, sh, 1), q = s.getContext('2d');
      q.imageSmoothingEnabled = false; q.drawImage(src, 0, 0, w, h, 0, 0, sw, sh);
      var was = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
      g.drawImage(s, 0, 0, sw, sh, 0, 0, sw * block, sh * block);
      g.imageSmoothingEnabled = was;
    }
    var BLOCKS = [1, 2, 3, 4, 6, 8, 12, 16, 24];
    function blockAt(q) { return BLOCKS[clamp(Math.floor(q * BLOCKS.length), 0, BLOCKS.length - 1)]; }
    function liveCopy(ctx, w, h) {   // what the host drew this frame, in view pixels
      var c = scratch(w, h, 0), q = c.getContext('2d'), src = ctx.canvas;
      if (!src) return null;
      var m = ctx.getTransform ? ctx.getTransform() : { a: 1, d: 1, e: 0, f: 0 };
      var a = m.a || 1, d = m.d || 1;
      q.imageSmoothingEnabled = !pixel;
      q.drawImage(src, view.x * a + m.e, view.y * d + m.f, w * a, h * d, 0, 0, w, h);
      return c;
    }
    function swirlDraw(g, src, w, h, fx, fy, amt, dir) {   // rotate + zoom src about the focus by amt (0 = still)
      var ang = dir * amt * amt * Math.PI * 2 * 1.25, sc = 1 + amt * amt * 2.6;
      if (pixel) ang = Math.round(ang / (Math.PI / 32)) * (Math.PI / 32);
      var c = scratch(w, h, 0), q = c.getContext('2d');
      q.imageSmoothingEnabled = !pixel;
      q.translate(fx, fy); q.rotate(ang); q.scale(sc, sc); q.drawImage(src, -fx, -fy); q.setTransform(1, 0, 0, 1, 0, 0);
      if (pixel) mosaic(g, c, w, h, 1 + Math.floor(amt * 5)); else g.drawImage(c, 0, 0);
    }

    function drawOut(g, w, h, q) {
      var r = R, ink = tok('ink', '#06061a'), f = r.focus;
      g.fillStyle = ink; g.fillRect(-8, -8, w + 16, h + 16);
      if (!r.snap) return;
      if (r.variant === 'shatter' && r.geo) {
        var crackEnd = 0.24, qq = (q - crackEnd) / (1 - crackEnd);
        if (qq <= 0) {
          g.drawImage(r.snap, 0, 0);
          var reach = clamp(q / crackEnd * 1.15, 0, 1), E = r.geo.edges, hi = tok('fx.white', '#ffffff'), cold = tok('ui.highlight', '#c8d4f4');
          for (var i = 0; i < E.length && E[i].d <= reach; i++) line(g, E[i].a, E[i].b, E[i].d < reach * 0.6 ? hi : cold);
        } else {
          var S = r.geo.shards, spin = P.spin * Math.PI / 180;
          for (var s = 0; s < S.length; s++) {
            var sh = S[s], p = clamp((qq - sh.delay) / (1 - sh.delay), 0, 1);
            if (p >= 1) continue;
            var dx = (sh.cx - f.x) / Math.max(1, w) * p * (50 + 70 * sh.r1);
            var dy = -(10 + 14 * sh.r2) * Math.sin(Math.min(1, p * 2.2) * Math.PI) * (p < 0.45 ? 1 : 0) + p * p * (h + sh.size + 40) * (0.95 + 0.5 * sh.r2);
            var ang = sh.dir * spin * (0.45 + 0.55 * sh.r2) * p * p;
            if (pixel) ang = Math.round(ang / (Math.PI / 32)) * (Math.PI / 32);
            var x = sh.cx + dx, y = sh.cy + dy;
            if (pixel) { x = Math.round(x); y = Math.round(y); }
            if (y - sh.size > h) continue;
            g.save(); g.translate(x, y); if (ang) g.rotate(ang); g.drawImage(sh.c, -Math.round(sh.ox), -Math.round(sh.oy)); g.restore();
          }
          var D = r.geo.dust, white = tok('fx.white', '#ffffff'), cyan = tok('fx.cold', '#6ad8f0');
          for (var j = 0; j < D.length; j++) {
            var dd = D[j], a = (qq - dd.at) / dd.life; if (a < 0 || a >= 1) continue;
            var tt = a * dd.life * (r.dur * OUT_END / 1000);
            var px = Math.round(dd.x + dd.vx * tt), py = Math.round(dd.y + dd.vy * tt + dd.g * tt * tt);
            g.fillStyle = dd.cold ? cyan : white; g.globalAlpha = fade(1 - a);
            g.fillRect(px, py, dd.big ? 2 : 1, dd.big ? 2 : 1);
            g.globalAlpha = 1;
          }
        }
        if (P.flash === 'on' && q < 0.14) { g.globalAlpha = fade(0.85 * (1 - q / 0.14)); g.fillStyle = tok('fx.white', '#ffffff'); g.fillRect(-8, -8, w + 16, h + 16); g.globalAlpha = 1; }
        return;
      }
      if (r.variant === 'iris') {
        g.drawImage(r.snap, 0, 0);
        var R0 = Math.hypot(Math.max(f.x, w - f.x), Math.max(f.y, h - f.y)) + 2;
        irisMask(g, w, h, Math.round(f.x), Math.round(f.y), R0 * (1 - smoothIn(clamp(q / 0.92, 0, 1))), ink);
      } else if (r.variant === 'mosaic') {
        mosaic(g, r.snap, w, h, blockAt(q / 0.85));
        var da = clamp((q - 0.45) / 0.45, 0, 1);
        if (da > 0) { g.globalAlpha = fade(da); g.fillStyle = ink; g.fillRect(-8, -8, w + 16, h + 16); g.globalAlpha = 1; }
      } else {   // swirl
        swirlDraw(g, r.snap, w, h, f.x, f.y, clamp(q, 0, 1), (r.seed & 1) ? 1 : -1);
        var sa = clamp((q - 0.5) / 0.42, 0, 1);
        if (sa > 0) { g.globalAlpha = fade(sa); g.fillStyle = ink; g.fillRect(-8, -8, w + 16, h + 16); g.globalAlpha = 1; }
      }
      if (P.flash === 'on' && q < 0.1) { g.globalAlpha = fade(0.7 * (1 - q / 0.1)); g.fillStyle = tok('fx.white', '#ffffff'); g.fillRect(-8, -8, w + 16, h + 16); g.globalAlpha = 1; }
    }
    function drawIn(g, ctx, w, h, p) {
      var r = R, ink = tok('ink', '#06061a'), f = r.focus, mode = r.reveal;
      if (mode === 'cut' || p >= 1) return;
      if (mode === 'iris') { irisMask(g, w, h, Math.round(f.x), Math.round(f.y), (Math.hypot(Math.max(f.x, w - f.x), Math.max(f.y, h - f.y)) + 2) * smoothIn(p), ink); return; }
      if (mode === 'mosaic' || mode === 'swirl') {
        var live = null;
        try { live = liveCopy(ctx, w, h); } catch (e) { live = null; }
        if (live) {
          var keep = scratch(w, h, 2); keep.getContext('2d').drawImage(live, 0, 0);   // slot 0 is reused by swirlDraw
          g.fillStyle = ink; g.fillRect(-8, -8, w + 16, h + 16);
          if (mode === 'mosaic') mosaic(g, keep, w, h, blockAt((1 - p) / 0.9));
          else swirlDraw(g, keep, w, h, f.x, f.y, 1 - p, (r.seed & 1) ? -1 : 1);
          var a = clamp(1 - p / 0.55, 0, 1);
          if (a > 0) { g.globalAlpha = fade(a); g.fillStyle = ink; g.fillRect(-8, -8, w + 16, h + 16); g.globalAlpha = 1; }
          return;
        }
      }
      g.globalAlpha = fade(1 - p); g.fillStyle = ink; g.fillRect(-8, -8, w + 16, h + 16); g.globalAlpha = 1;   // 'fade' and fallback
    }

    function draw(ctx) {
      if (!R || !ctx) return;
      if (ctx.canvas) lastCanvas = ctx.canvas;
      // watchdog: a host that draws but never calls update() would block its input forever
      if (++drawsSinceUpdate > 45) { if (!stats.watchdog) warn('no-update', 'draw() is called but update() is not; advancing on draw calls'); stats.watchdog++; advance(STEP); if (!R) return; }
      var w = R.w, h = R.h, t = stepT(R.t), q = t / R.dur;
      ctx.save();
      try {
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.imageSmoothingEnabled = !pixel;
        ctx.translate(view.x, view.y);
        ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
        if (q < OUT_END) drawOut(ctx, w, h, q / OUT_END);
        else if (q < HOLD_END) { ctx.fillStyle = tok('ink', '#06061a'); ctx.fillRect(-8, -8, w + 16, h + 16); }
        else drawIn(ctx, ctx, w, h, (q - HOLD_END) / (1 - HOLD_END));
      } catch (e) {
        warn('draw', 'draw failed; showing a plain fade instead', e);
        try { if (q < HOLD_END) { ctx.globalAlpha = 1; ctx.fillStyle = tok('ink', '#06061a'); ctx.fillRect(0, 0, w, h); } } catch (e2) { /* ignore */ }
      }
      ctx.restore();
    }

    return {
      start: start,
      busy: function () { return !!R; },
      update: update,
      draw: draw,
      skip: function () { finish(); },                         // jump to the end now: pending onMid, then onDone
      reset: function () { R = null; drawsSinceUpdate = 0; },  // drop silently (new game / restart); no callbacks
      setParams: setParams,
      params: function () { var o = {}; for (var key in P) o[key] = P[key]; return o; },
      phase: phase,
      progress: function () { return R ? clamp(R.t / R.dur, 0, 1) : 0; },
      state: function () { return { phase: phase(), t: R ? R.t : 0, duration: R ? R.dur : P.duration, variant: R ? R.variant : P.variant, reveal: R ? R.reveal : P.reveal, mid: R ? R.mid : false, stats: { starts: stats.starts, mids: stats.mids, dones: stats.dones, ignored: stats.ignored, warnings: stats.warnings, callbackErrors: stats.callbackErrors, watchdog: stats.watchdog } }; },
      skin: function () { return SK.id; }
    };
  }

  root.GameDNA_BattleTransition = { create: create, version: '1.0.0', defaults: DEFAULTS, variants: Object.keys(VARIANTS), reveals: Object.keys(REVEALS) };
})(typeof window !== 'undefined' ? window : this);
