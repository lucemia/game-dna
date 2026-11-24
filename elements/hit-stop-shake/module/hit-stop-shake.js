/* GameDNA E-05 · Hit-stop, shake & flash · module v1 (plain script, no dependencies, one global)
 *
 *   const juice = GameDNA_HitStop.create({
 *     view: { x: 0, y: 0, w: 256, h: 152 },   // screen rect (native px) that shakes and flashes; keep it above the HUD
 *     seed: 1,                                 // same seed + same calls = same offsets (?t=&freeze=1 stable)
 *     skin: 'pixel16',                         // optional; needs GameDNA_Skin, else a built-in pixel16 look
 *     params: { strength: 'heavy', stop: 6, shake: 4, flash: 'on', reduced: 'system' },
 *     uiRects: () => [{ x, y, w, h }]          // optional: screen rects the screen flash never covers (HUD, menus)
 *   });
 *   juice.hit({ strength: 'light' | 'heavy' | 'finisher', at: { x, y }, target: id, dir: 1 | -1 })   // on the impact frame
 *   if (!juice.step(STEP_MS)) return;    // FIRST line of the fixed step: false = hit-stop, skip the whole world step
 *   juice.begin(ctx); drawWorld(); juice.end(ctx);   // world shakes (integer px), HUD drawn after end() does not
 *   juice.sprite(ctx, id, rect, () => drawUnit(u));  // optional: struck sprite turns white for 1-2 frames
 *   juice.draw(ctx, -camX, -camY);       // screen flash (finishers) + fallback flashes; before the HUD
 *   juice.clear();                       // scene / level / battle start
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0', FRAME = 1000 / 60;
  var DEFAULTS = { strength: 'heavy', stop: 6, shake: 4, flash: 'on', reduced: 'system', chain: 30 };
  var STRENGTHS = ['light', 'heavy', 'finisher'];
  var ALIAS = { light: 'light', weak: 'light', jab: 'light', small: 'light', chip: 'light', normal: 'heavy', heavy: 'heavy', medium: 'heavy', hit: 'heavy', strong: 'heavy',
    finisher: 'finisher', finish: 'finisher', crit: 'finisher', critical: 'finisher', kill: 'finisher', ko: 'finisher', final: 'finisher', big: 'finisher', boss: 'finisher' };
  // per preset: hit-stop = stop x k.stop; shake amplitude = shake x k.amp (min 1 px when shake > 0); shake length, sprite flash and screen flash in frames
  var PRESET = {
    light:    { stop: 0.5, amp: 0.25, len: 6,  spr: 1, scr: 0 },
    heavy:    { stop: 1,   amp: 0.5,  len: 10, spr: 2, scr: 0 },
    finisher: { stop: 2,   amp: 1,    len: 18, spr: 2, scr: 2 }
  };
  var BUILTIN = { id: 'pixel16', pixel: true, palette: { ink: '#06061a', fx: { white: '#ffffff', crit: '#ffb43a' } }, motion: { shakeInt: true, flashMax: 0.35 } };

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hash(a, b) { var h = (a * 374761393 + b * 668265263 + 1013904223) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0); }
  function rectOf(o) {
    if (!o) return null;
    if (Array.isArray(o)) o = { x: o[0], y: o[1], w: o[2], h: o[3] };
    var x = num(o.x, NaN), y = num(o.y, NaN), w = num(o.w != null ? o.w : o.width, NaN), h = num(o.h != null ? o.h : o.height, NaN);
    return isFinite(x) && isFinite(y) && w > 0 && h > 0 ? { x: x, y: y, w: w, h: h } : null;
  }
  function pointOf(o) {
    if (!o) return null;
    if (Array.isArray(o)) return o.length >= 4 ? pointOf(rectOf(o)) : (isFinite(+o[0]) && isFinite(+o[1]) ? { x: +o[0], y: +o[1] } : null);
    var r = rectOf(o); if (r) return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    var x = num(o.x, NaN), y = num(o.y, NaN); return isFinite(x) && isFinite(y) ? { x: x, y: y } : null;
  }
  // rects minus one rect -> disjoint rects (up to 4 pieces each)
  function subtract(list, u) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i], x0 = Math.max(r.x, u.x), y0 = Math.max(r.y, u.y), x1 = Math.min(r.x + r.w, u.x + u.w), y1 = Math.min(r.y + r.h, u.y + u.h);
      if (x1 <= x0 || y1 <= y0) { out.push(r); continue; }
      if (y0 > r.y) out.push({ x: r.x, y: r.y, w: r.w, h: y0 - r.y });
      if (y1 < r.y + r.h) out.push({ x: r.x, y: y1, w: r.w, h: r.y + r.h - y1 });
      if (x0 > r.x) out.push({ x: r.x, y: y0, w: x0 - r.x, h: y1 - y0 });
      if (x1 < r.x + r.w) out.push({ x: x1, y: y0, w: r.x + r.w - x1, h: y1 - y0 });
    }
    return out;
  }
  function rgb(c) { c = String(c || '#ffffff'); if (c[0] === '#') { if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; } var m = c.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/); return m ? [+m[1], +m[2], +m[3]] : [255, 255, 255]; }

  function create(opt) {
    opt = opt || {};
    var SKAPI = root.GameDNA_Skin || null, SK = null;
    try { SK = opt.skin === false || !SKAPI ? null : SKAPI.resolve(opt.skin); } catch (e) { SK = null; }
    var skin = SK || BUILTIN, pixel = skin.pixel !== false;
    var pal = skin.palette || BUILTIN.palette, fx = pal.fx || BUILTIN.palette.fx, MO = skin.motion || BUILTIN.motion;
    var WHITE = fx.white || '#ffffff', WRGB = rgb(WHITE), ACCENT = fx.crit || '#ffb43a', EDGE = opt.edge || pal.ink || '#06061a';
    var FLASHMAX = clamp(num(MO.flashMax, 0.35), 0.1, 0.8), DITHER = MO.flashMode === 'dither';
    var P = {}, k; for (k in DEFAULTS) P[k] = DEFAULTS[k];
    var view = rectOf(opt.view) || rectOf(opt.bounds), seed = num(opt.seed, 1) | 0;
    var warned = {}, sysReduced = false;
    try { sysReduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { sysReduced = false; }

    // state: everything advances only in step(), so ?t= fast-forward and ?auto=1 are deterministic
    var S = { stopLeft: 0, chain: 0, cool: 0, acc: 0, lastSteps: -1, idleDraws: 0, shake: null, scr: 0, scrN: 0, flashes: {}, locals: [], hitNo: 0, frame: 0, ox: 0, oy: 0 };
    var ST = { hits: 0, light: 0, heavy: 0, finisher: 0, steps: 0, frozenSteps: 0, runSteps: 0, maxChain: 0, capped: 0, maxOffset: 0, shakeFrames: 0,
      screenFlashFrames: 0, spriteFlashFrames: 0, localFlashFrames: 0, unwired: 0, vanished: 0, cooled: 0, drawTicks: 0, freezes: 0, clears: 0, beginEnd: 0, unbalanced: 0, draws: 0 };
    var begun = null, drawnRects = [], wiredIds = {}, seen = {}, tainted = false;   // wiredIds: ids ever drawn through sprite() / asked flashing(); seen: since the last draw()

    function warn(key, msg) { if (warned[key]) return; warned[key] = 1; if (root.console) console.warn('GameDNA_HitStop: ' + msg); }
    function cbRects(src) {
      var v = src; if (typeof v === 'function') { try { v = v(); } catch (e) { warn('cb-ui', 'uiRects threw: ' + (e && e.message)); v = null; } }
      var out = []; if (v && v.length) for (var i = 0; i < v.length; i++) { var r = rectOf(v[i]); if (r) out.push(r); }
      return out;
    }
    function reducedOn() { return P.reduced === 'on' || P.reduced === true || (P.reduced === 'system' && sysReduced); }
    function setParams(o) {
      o = o || {};
      for (var key in DEFAULTS) if (o[key] != null) { var d = DEFAULTS[key]; P[key] = typeof d === 'number' ? num(o[key], d) : String(o[key]); }
      P.strength = ALIAS[String(P.strength).toLowerCase()] || 'heavy';
      P.stop = clamp(Math.round(P.stop), 0, 20); P.shake = clamp(Math.round(P.shake), 0, 8); P.chain = clamp(Math.round(P.chain), 6, 120);
      if (['on', 'sprite', 'screen', 'off'].indexOf(P.flash) < 0) P.flash = P.flash === 'true' ? 'on' : P.flash === 'false' ? 'off' : 'on';
      if (['system', 'on', 'off'].indexOf(P.reduced) < 0) P.reduced = P.reduced === 'true' ? 'on' : 'off';
    }
    setParams(opt.params);

    function viewRect(ctx) {
      if (view) return view;
      if (ctx && ctx.canvas) return { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height };
      return null;
    }
    function strengthOf(s) {
      if (typeof s === 'number' && isFinite(s)) return s < 0.4 ? 'light' : s < 0.8 ? 'heavy' : 'finisher';
      return ALIAS[String(s == null ? P.strength : s).toLowerCase()] || P.strength;
    }
    function startShake(amp, len, dir) {
      amp = Math.round(amp); if (amp <= 0 || len <= 0 || reducedOn()) return;
      var cur = S.shake, curAmp = cur ? cur.amp * (1 - cur.f / cur.len) : 0;
      if (cur && curAmp >= amp) return;                   // a stronger shake is still running: keep it
      S.hitNo++;
      S.shake = { amp: amp, len: Math.round(len), f: 0, dir: dir === -1 ? -1 : 1, key: hash(seed, S.hitNo) };
      sampleShake();
    }
    // deterministic decaying shake: x alternates every 2 frames starting in the blow's direction, y a seeded +-1/2 amplitude; integers only
    function sampleShake() {
      var s = S.shake; S.ox = 0; S.oy = 0;
      if (!s || s.f >= s.len) { S.shake = null; return; }
      var a = Math.round(s.amp * (1 - s.f / s.len)); if (a < 1) a = s.f < s.len ? 1 : 0;
      var side = ((s.f >> 1) & 1) ? -1 : 1, ry = hash(s.key, s.f) & 3;
      S.ox = side * s.dir * a;
      S.oy = s.amp >= 2 ? (ry === 0 ? -1 : ry === 1 ? 1 : 0) * Math.max(1, a >> 1) : 0;
      var m = Math.max(Math.abs(S.ox), Math.abs(S.oy)); if (m > ST.maxOffset) ST.maxOffset = m;
    }
    function freezeFrames(n) {
      n = Math.round(n); if (n <= 0) return;
      if (S.cool > 0) { ST.cooled++; return; }          // just hit the chain cap: let the world run before freezing again
      ST.freezes++;
      if (n > S.stopLeft) S.stopLeft = n;               // overlapping hits never stack: the longest remaining stop wins
    }

    // ---- public: events ----
    function hit(a, b) {
      try {
        var o = a && typeof a === 'object' && !Array.isArray(a) ? a : Object.assign({}, b && typeof b === 'object' ? b : {}, a != null ? { strength: a } : {});
        var st = strengthOf(o.crit ? 'finisher' : o.strength), pr = PRESET[st], red = reducedOn();
        ST.hits++; ST[st]++;
        freezeFrames(P.stop * pr.stop);
        if (P.shake > 0) startShake(Math.max(1, P.shake * pr.amp), pr.len, o.dir === -1 || (o.dir && o.dir.x < 0) ? -1 : 1);
        if (P.flash === 'on' || P.flash === 'sprite') {
          var n = red ? 1 : pr.spr, id = o.target != null ? String(o.target) : null, at = pointOf(o.at);
          if (id != null) {
            var f = S.flashes[id] || (S.flashes[id] = { left: 0, n: n, at: null });
            if (n >= f.left) { f.left = n; f.n = n; } if (at) f.at = at;
          } else if (at) S.locals.push({ at: at, left: n, n: n, owner: null });
        }
        if ((P.flash === 'on' && pr.scr) || (P.flash === 'screen' && st !== 'light')) {
          var sn = red ? 1 : Math.max(1, pr.scr || 1);
          if (sn >= S.scr) { S.scr = sn; S.scrN = sn; }
        }
        return st;
      } catch (e) { warn('hit', 'hit() failed: ' + (e && e.message)); return null; }
    }
    function freeze(ms) { freezeFrames(Math.ceil(num(ms, 0) / FRAME - 1e-6)); }
    function shake(px, ms) { startShake(clamp(num(px, 0), 0, 8), Math.max(1, Math.round(num(ms, 200) / FRAME)), 1); }

    // ---- public: the step gate ----
    function tickFrame(fromDraw) {
      S.frame++; if (!fromDraw) ST.steps++;
      var frozen = false;
      if (S.stopLeft > 0) {
        if (S.chain >= P.chain) { S.stopLeft = 0; S.cool = P.chain; ST.capped++; warn('chain', 'hit-stop ran ' + P.chain + ' frames in a row; forcing a world step (is hit() called every frame?)'); }
        else { S.stopLeft--; S.chain++; frozen = true; }
      }
      if (!frozen) { S.chain = 0; if (S.cool > 0) S.cool--; }
      if (S.chain > ST.maxChain) ST.maxChain = S.chain;
      if (!fromDraw) { if (frozen) ST.frozenSteps++; else ST.runSteps++; }
      // shake and flashes keep running through the freeze (the classic look: the frozen frame trembles)
      if (S.shake) { S.shake.f++; sampleShake(); if (S.shake) ST.shakeFrames++; }
      if (S.scr > 0) S.scr--;
      for (var id in S.flashes) if (--S.flashes[id].left <= 0) delete S.flashes[id];
      for (var i = S.locals.length - 1; i >= 0; i--) if (--S.locals[i].left <= 0) S.locals.splice(i, 1);
      return !frozen;
    }
    // call FIRST in the fixed step; true = run the world this step, false = hit-stop (skip everything that changes the game)
    function step(dtMs) {
      try {
        var dt = dtMs == null ? FRAME : num(dtMs, FRAME);
        if (dt <= 0) return S.stopLeft <= 0;
        S.acc += dt;
        var run = true, n = 0;
        while (S.acc >= FRAME - 1e-6 && n < 30) { S.acc -= FRAME; n++; run = tickFrame() && run; }
        if (S.acc < 0) S.acc = 0;
        return run;
      } catch (e) { warn('step', 'step() failed: ' + (e && e.message)); return true; }
    }
    function frozen() { return S.stopLeft > 0; }
    function offset() { return { x: S.ox | 0, y: S.oy | 0 }; }

    // ---- public: drawing ----
    function begin(ctx) {
      try {
        if (!ctx) return offset();
        if (begun) { ST.unbalanced++; warn('begin', 'begin() called twice without end()'); return offset(); }
        var V = viewRect(ctx);
        ctx.save();
        if (V) { ctx.beginPath(); ctx.rect(V.x, V.y, V.w, V.h); ctx.clip(); }
        ctx.translate(S.ox | 0, S.oy | 0);
        begun = { ctx: ctx, ox: S.ox | 0, oy: S.oy | 0, V: V };
        ST.beginEnd++;
      } catch (e) { warn('begin', 'begin() failed: ' + (e && e.message)); }
      return offset();
    }
    function end(ctx) {
      try {
        if (!begun) { ST.unbalanced++; warn('end', 'end() without begin()'); return; }
        var b = begun; begun = null; ctx = ctx || b.ctx;
        ctx.restore();
        var V = b.V; if (!V || (!b.ox && !b.oy)) return;
        // the world moved by (ox, oy): paint the strip it uncovered (stale pixels otherwise)
        ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = EDGE;
        if (b.ox > 0) ctx.fillRect(V.x, V.y, b.ox, V.h); else if (b.ox < 0) ctx.fillRect(V.x + V.w + b.ox, V.y, -b.ox, V.h);
        if (b.oy > 0) ctx.fillRect(V.x, V.y, V.w, b.oy); else if (b.oy < 0) ctx.fillRect(V.x, V.y + V.h + b.oy, V.w, -b.oy);
        ctx.restore();
      } catch (e) { warn('end', 'end() failed: ' + (e && e.message)); }
    }
    function flashing(id) {
      var f = id != null && S.flashes[String(id)];
      if (id != null) { wiredIds[String(id)] = 1; seen[String(id)] = 1; }
      return f && f.left > 0 ? 1 : 0;
    }
    // draws the host's sprite; while that id flashes, every pixel the draw changed becomes white
    function sprite(ctx, id, rect, drawFn) {
      if (typeof rect === 'function' && drawFn == null) { drawFn = rect; rect = null; }
      var key = id != null ? String(id) : null, f = key != null ? S.flashes[key] : null;
      if (key != null) { wiredIds[key] = 1; seen[key] = 1; }
      if (!f || f.left <= 0 || !ctx || tainted) return runDraw(drawFn);
      var R = null, before = null, ok = false;
      try {
        var r = rectOf(rect) || viewRect(ctx), T = ctx.getTransform ? ctx.getTransform() : null, cw = ctx.canvas.width, ch = ctx.canvas.height;
        var xs = [r.x, r.x + r.w], ys = [r.y, r.y + r.h], x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) {
          var X = T ? T.a * xs[i] + T.c * ys[j] + T.e : xs[i], Y = T ? T.b * xs[i] + T.d * ys[j] + T.f : ys[j];
          x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y);
        }
        x0 = clamp(Math.floor(x0) - 1, 0, cw); y0 = clamp(Math.floor(y0) - 1, 0, ch); x1 = clamp(Math.ceil(x1) + 1, 0, cw); y1 = clamp(Math.ceil(y1) + 1, 0, ch);
        if (x1 > x0 && y1 > y0) { R = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; before = ctx.getImageData(R.x, R.y, R.w, R.h).data; ok = true; }
      } catch (e) { tainted = true; warn('taint', 'cannot read canvas pixels (' + (e && e.message) + '); sprite flash falls back to a contact flash'); }
      var out = runDraw(drawFn);
      if (ok) {
        try {
          var img = ctx.getImageData(R.x, R.y, R.w, R.h), d = img.data, mixA = pixel ? 1 : 0.85, n = 0;
          for (var p = 0; p < d.length; p += 4) {
            if ((d[p] !== before[p] || d[p + 1] !== before[p + 1] || d[p + 2] !== before[p + 2] || d[p + 3] !== before[p + 3]) && d[p] + d[p + 1] + d[p + 2] > 96) {   // keep near-black outline pixels: the silhouette still reads
              d[p] += (WRGB[0] - d[p]) * mixA; d[p + 1] += (WRGB[1] - d[p + 1]) * mixA; d[p + 2] += (WRGB[2] - d[p + 2]) * mixA; n++;
            }
          }
          if (n) { ctx.putImageData(img, R.x, R.y); ST.spriteFlashFrames++; }
        } catch (e) { tainted = true; }
      }
      return out;
    }
    function runDraw(fn) { if (typeof fn !== 'function') return undefined; return fn(); }   // host errors surface as before: we do not hide them

    function drawLocal(g, p, n, left, ox, oy) {
      var x = Math.round(p.x + ox), y = Math.round(p.y + oy), age = n - left, r = age === 0 ? 4 : 3;
      g.fillStyle = WHITE;
      g.fillRect(x - r, y, r * 2 + 1, 1); g.fillRect(x, y - r, 1, r * 2 + 1);
      g.fillRect(x - 1, y - 1, 3, 3);
      if (age === 0) { g.fillStyle = ACCENT; g.fillRect(x - r - 1, y, 1, 1); g.fillRect(x + r + 1, y, 1, 1); g.fillRect(x, y - r - 1, 1, 1); g.fillRect(x, y + r + 1, 1, 1); }
      return { x: x - r - 1, y: y - r - 1, w: r * 2 + 3, h: r * 2 + 3 };
    }
    // screen flash (finishers) over the view minus uiRects, plus a contact flash for struck ids whose sprite draw is not wrapped
    function draw(ctx, offX, offY) {
      drawnRects = [];
      if (!ctx) return;
      var seenNow = seen; seen = {};
      try {
        ST.draws++;
        // sloppy wiring: step() is never called -> after 10 draws in a row without a step (not a fast display: that is 2+ missed 60 Hz steps even at 240 Hz), each draw advances one frame itself,
        // so flashes and shakes still end (no hit-stop then: there is no step to skip)
        if (ST.steps === S.lastSteps) { if (++S.idleDraws >= 10 && busy()) { tickFrame(true); ST.drawTicks++; warn('nostep', 'draw() runs but step() is never called: no hit-stop; flashes and shake advance per draw instead'); } }
        else S.idleDraws = 0;
        S.lastSteps = ST.steps;
        var V = viewRect(ctx); if (!V) return;
        var ox = num(offX, 0), oy = num(offY, 0), UI = cbRects(opt.uiRects);
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        var area = [V]; for (var i = 0; i < UI.length; i++) area = subtract(area, UI[i]);   // view minus UI rects, as disjoint rects
        ctx.beginPath(); for (var ai = 0; ai < area.length; ai++) ctx.rect(area[ai].x, area[ai].y, area[ai].w, area[ai].h);
        ctx.clip();
        var locals = [];   // contact flashes: struck ids never wrapped, or not drawn this frame (removed on a killing blow)
        for (var id in S.flashes) { var f = S.flashes[id]; if (f.left > 0 && (!seenNow[id] || tainted)) { if (f.at) locals.push({ p: f.at, n: f.n || 1, left: f.left, owner: id }); else warn('noat-' + id, 'flash for "' + id + '" has no sprite() wrapper and no hit point `at`'); } }
        for (var j = 0; j < S.locals.length; j++) locals.push({ p: S.locals[j].at, n: S.locals[j].n, left: S.locals[j].left, owner: null });
        if (locals.length) {
          ctx.translate(S.ox | 0, S.oy | 0);   // contact flashes ride the shake with the world
          for (var q = 0; q < locals.length; q++) { var L = locals[q], rr = drawLocal(ctx, L.p, L.n, L.left, ox, oy); rr.x += S.ox | 0; rr.y += S.oy | 0; rr.owner = L.owner; rr.kind = 'local'; drawnRects.push(rr); }
          ctx.translate(-(S.ox | 0), -(S.oy | 0));
          ST.localFlashFrames++;
          // a struck id not drawn this frame: removed on a killing blow (vanished) or never wrapped (unwired); the first 30 draws cannot tell
          for (var lq = 0; lq < locals.length; lq++) if (locals[lq].owner != null) {
            if (wiredIds[locals[lq].owner] || ST.draws <= 30) ST.vanished++; else { ST.unwired++; warn('unwired', 'struck sprite "' + locals[lq].owner + '" is not drawn through sprite() or flashing(): showing a contact flash at `at` instead'); }
          }
        }
        if (S.scr > 0) {
          var age = S.scrN - S.scr, red = reducedOn(), a = red ? Math.min(0.25, FLASHMAX) : age === 0 ? Math.min(0.8, FLASHMAX * 2) : FLASHMAX;
          if (DITHER && pixel) {
            ctx.fillStyle = WHITE;
            for (var yy = V.y; yy < V.y + V.h; yy++) for (var xx = V.x + ((yy + (age === 0 ? 0 : 1)) & 1); xx < V.x + V.w; xx += age === 0 ? 2 : 4) ctx.fillRect(xx, yy, 1, 1);
          } else { ctx.globalAlpha = a; ctx.fillStyle = WHITE; ctx.fillRect(V.x, V.y, V.w, V.h); ctx.globalAlpha = 1; }
          drawnRects.push({ x: V.x, y: V.y, w: V.w, h: V.h, owner: null, kind: 'screen', alpha: a });
          ST.screenFlashFrames++;
        }
        ctx.restore();
      } catch (e) { warn('draw', 'draw() failed: ' + (e && e.message)); try { ctx.restore(); } catch (e2) { /* nothing */ } }
    }
    function clear() {
      S.stopLeft = 0; S.chain = 0; S.cool = 0; S.acc = 0; S.shake = null; S.scr = 0; S.flashes = {}; S.locals = []; S.ox = 0; S.oy = 0;
      ST.clears++;
    }
    function stats() { var o = {}; for (var key in ST) o[key] = ST[key]; o.frozen = S.stopLeft > 0; o.stopLeft = S.stopLeft; o.screenLeft = S.scr; o.offsetX = S.ox | 0; o.offsetY = S.oy | 0; return o; }
    function busy() { return S.stopLeft > 0 || !!S.shake || S.scr > 0 || S.locals.length > 0 || Object.keys(S.flashes).some(function (id) { return S.flashes[id].left > 0; }); }
    function params() { var o = {}; for (var key in P) o[key] = P[key]; return o; }

    return {
      version: VERSION, hit: hit, freeze: freeze, shake: shake, step: step, frozen: frozen, offset: offset,
      begin: begin, end: end, sprite: sprite, flashing: flashing, draw: draw, clear: clear,
      setParams: setParams, params: params, stats: stats, busy: busy, lastDrawn: function () { return drawnRects.slice(); },
      reduced: reducedOn
    };
  }

  root.GameDNA_HitStop = { version: VERSION, create: create, defaults: DEFAULTS, presets: PRESET, strengths: STRENGTHS };
})(typeof window !== 'undefined' ? window : this);
