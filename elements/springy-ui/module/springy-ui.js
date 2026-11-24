/* GameDNA C-10 · Springy UI motion · module v1 (plain script, no dependencies, one global)
 *
 *   const ui = GameDNA_SpringyUI.create({
 *     view: { x: 0, y: 0, w: 640, h: 360 },   // the screen in native px (backdrop dim, slide distances)
 *     params: { open: 260, close: 140, bounce: 0.12, style: 'auto', stagger: 30, glide: 140, lift: 2, reduced: 'system' }
 *   });
 *   ui.update(STEP_MS);                                       // every fixed step (also ?t= fast-forward); never gates input
 *   ui.window(ctx, 'shop', rect, () => drawShop(), { selected: cursor, dim: true });   // wrap the EXISTING window draw
 *   ui.row(ctx, 'shop', k, () => drawRow(k), rowRect);        // inside it: stagger-in + lift of the selected row
 *   const hl = ui.glide('shop', rowRect(cursor));             // the highlight / pointer rect, gliding on a spring
 *   const shown = ui.count('coins', coins);                   // a number that rolls to its new value
 *   ui.draw(ctx);                                             // LAST on every render path: closing windows, auto-close
 *
 * The module never reads or blocks input and never changes game state: the game opens, closes and confirms exactly as
 * before, on the same step. It only animates how the windows the game already draws appear, move and disappear.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0', FRAME = 1000 / 60;
  var DEFAULTS = { open: 260, close: 140, bounce: 0.12, style: 'auto', stagger: 30, glide: 140, lift: 2, dim: 0.35, shadow: 0.45, count: 450, reduced: 'system', pixel: 'auto' };
  var STYLES = { auto: 1, pop: 1, slide: 1, unfold: 1, none: 1 };
  var ROW_MS = 220, ROW_MS_REDUCED = 110, GAP = 30, FF = 20, OFF = 6000;
  var BUILTIN = { ink: '#06061a' };   // pixel16 ink: backdrop dim and shadow colour when no skin is loaded

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function c01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function easeOut3(x) { x = c01(x); return 1 - (1 - x) * (1 - x) * (1 - x); }
  function rectOf(o) {
    if (!o) return null;
    if (Array.isArray(o)) o = { x: o[0], y: o[1], w: o[2], h: o[3] };
    var x = num(o.x, NaN), y = num(o.y, NaN), w = num(o.w != null ? o.w : o.width, NaN), h = num(o.h != null ? o.h : o.height, NaN);
    return isFinite(x) && isFinite(y) && w > 0 && h > 0 ? { x: x, y: y, w: w, h: h } : null;
  }
  // damping ratio for a wanted overshoot (0 = none, 0.12 = 12 %)
  function zetaOf(b) { if (b < 0.01) return 0.99; var l = Math.log(b); return Math.min(0.99, -l / Math.sqrt(Math.PI * Math.PI + l * l)); }
  // spring step response over normalised time e (0..1); |1 - x| < 0.004 at e = 1, then exactly 1
  function springCurve(e, b) {
    if (e <= 0) return 0;
    if (e >= 1) return 1;
    if (b < 0.01) { var k = 9 * e; return 1 - (1 + k) * Math.exp(-k); }
    var z = zetaOf(b), wn = 5.8 / z, wd = wn * Math.sqrt(1 - z * z), env = Math.exp(-z * wn * e);
    return 1 - env * (Math.cos(wd * e) + (z * wn / wd) * Math.sin(wd * e));
  }
  // close progress for normalised time c (0..1): moves at once (slope 1.5 at 0, 0.5 at 1) so a close never reads as a hold
  function closeCurve(c) { c = c01(c); return c * (1.5 - 0.5 * c); }
  // exact step of a damped spring {x, v} toward target over t seconds (deterministic for any step length)
  function springStep(s, target, t, z, wn) {
    var x0 = s.x - target, v0 = s.v;
    if (Math.abs(x0) < 1e-3 && Math.abs(v0) < 1e-2) { s.x = target; s.v = 0; return; }
    var wd = wn * Math.sqrt(1 - z * z), env = Math.exp(-z * wn * t), c = Math.cos(wd * t), sn = Math.sin(wd * t);
    s.x = target + env * (x0 * c + (v0 + z * wn * x0) / wd * sn);
    s.v = env * (v0 * c - (wn * wn * x0 + z * wn * v0) / wd * sn);
  }
  function makeCanvas(w, h) {
    try { if (root.document && root.document.createElement) { var c = root.document.createElement('canvas'); c.width = w; c.height = h; return c; } } catch (e) { }
    try { if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h); } catch (e) { }
    return null;
  }

  function create(options) {
    var o = options || {};
    var P = {}, enabled = o.enabled !== false, warned = {};
    var SKAPI = root.GameDNA_Skin || null, SK = null;
    try { SK = o.skin === false || !SKAPI ? null : SKAPI.resolve(o.skin); } catch (e) { SK = null; }
    var ink = (SK && SK.palette && (SK.palette.ink || (SK.palette.ui && SK.palette.ui.shadow))) || BUILTIN.ink;
    var sysReduced = false;
    try { sysReduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { }

    var S = { clock: 0, updates: 0, frame: 0, renderUpd: 0, ff: false, px: false, drawCalls: 0 };
    var W = {}, order = [], G = {}, C = {}, pending = [];
    var st = { updates: 0, draws: 0, windowCalls: 0, rowCalls: 0, glideCalls: 0, countCalls: 0, opens: 0, explicitOpens: 0, settledOpens: 0,
      reopens: 0, closes: 0, autoCloses: 0, explicitCloses: 0, ghostFrames: 0, selects: 0, pulses: 0, clears: 0, errors: 0, openMs: [], closeMs: [], warnings: [] };

    function warn(k, msg) { if (warned[k]) return; warned[k] = 1; st.warnings.push(msg); try { root.console && console.warn('[springy-ui] ' + msg); } catch (e) { } }
    function setParams(p) {
      p = p || {};
      for (var k in DEFAULTS) if (P[k] === undefined) P[k] = DEFAULTS[k];
      if (p.open != null) P.open = clamp(num(p.open, P.open), 0, 2000);
      if (p.close != null) P.close = clamp(num(p.close, P.close), 0, 2000);
      if (p.bounce != null) P.bounce = clamp(num(p.bounce, P.bounce), 0, 0.5);
      if (p.style != null) P.style = STYLES[p.style] ? String(p.style) : P.style;
      if (p.stagger != null) P.stagger = clamp(num(p.stagger, P.stagger), 0, 200);
      if (p.glide != null) P.glide = clamp(num(p.glide, P.glide), 0, 1000);
      if (p.lift != null) P.lift = clamp(num(p.lift, P.lift), 0, 12);
      if (p.dim != null) P.dim = clamp(num(p.dim, P.dim), 0, 0.9);
      if (p.shadow != null) P.shadow = clamp(num(p.shadow, P.shadow), 0, 1);
      if (p.count != null) P.count = clamp(num(p.count, P.count), 0, 3000);
      if (p.reduced != null) P.reduced = { system: 1, on: 1, off: 1 }[p.reduced] ? String(p.reduced) : P.reduced;
      if (p.pixel != null) P.pixel = { auto: 1, on: 1, off: 1 }[p.pixel] ? String(p.pixel) : P.pixel;
    }
    setParams(o.params);
    function reduced() { return P.reduced === 'on' || (P.reduced === 'system' && sysReduced); }
    function view() {
      var v = null;
      try { v = rectOf(typeof o.view === 'function' ? o.view() : (o.view || o.bounds)); } catch (e) { v = null; }
      return v || { x: 0, y: 0, w: 640, h: 360 };
    }
    function unit() { return Math.max(0.5, view().h / 360); }
    function openDur() { return reduced() ? Math.min(P.open, 140) : P.open; }
    function closeDur() { return reduced() ? Math.min(P.close, 90) : P.close; }
    function settleSpan() { return openDur() + (reduced() ? 0 : 10 * P.stagger) + ROW_MS + 1; }
    function springZ() { return zetaOf(P.bounce); }
    function springW() { var g = Math.max(30, P.glide) / 1000; return 4.6 / (springZ() * g); }
    function pxOn(ctx) { return P.pixel === 'on' || (P.pixel === 'auto' && !!ctx && ctx.imageSmoothingEnabled === false); }
    function rnd(v, px) { return px ? Math.round(v) : v; }
    function push(list, v) { list.push(Math.round(v * 10) / 10); if (list.length > 60) list.shift(); }

    // A render begins when the game draws after its step count changed. A render after 20+ silent steps is a fast-forward
    // (?t=&freeze=1, a background tab): windows first seen then are drawn settled, glides and counters snap.
    function frameStart() { if (S.updates !== S.renderUpd) { S.ff = S.updates - S.renderUpd > FF; S.renderUpd = S.updates; } }

    function getW(id) {
      id = String(id);
      var w = W[id];
      if (!w) { w = W[id] = { id: id, phase: 'closed', t0: 0, tc: 0, opts: {}, rect: null, sel: -1, rows: {}, lastFrame: -1, lastUpd: -1e9, drawn: false,
        snap: null, snapCv: null, onDone: null, explicit: false, settleLogged: true, closeLogged: true, cur: null, depth: 0 }; order.push(id); }
      return w;
    }
    function startOpen(w, settled) {
      w.phase = 'open'; w.t0 = settled ? S.clock - settleSpan() : S.clock; w.explicit = false; w.drawn = false; w.snap = null;
      w.settleLogged = !!settled; w.rows = {}; if (w.sel >= 0) rowOf(w, w.sel);
      st.opens++; if (settled) st.settledOpens++;
    }
    function startClose(w, explicit, onDone) {
      if (w.phase !== 'open') { if (typeof onDone === 'function') pending.push(onDone); return; }
      w.phase = 'closing'; w.tc = S.clock; w.explicit = !!explicit; w.onDone = typeof onDone === 'function' ? onDone : null; w.closeLogged = false;
      st.closes++; if (explicit) st.explicitCloses++; else st.autoCloses++;
      if (closeDur() <= 0) finishClose(w);
    }
    function finishClose(w) {
      w.phase = 'closed'; w.snap = null;
      if (!w.closeLogged) { push(st.closeMs, S.clock - w.tc); w.closeLogged = true; }
      var f = w.onDone; w.onDone = null;
      if (f) { try { f(w.id); } catch (e) { st.errors++; warn('onDone', 'an onDone callback threw: ' + e); } }
    }
    function rowOf(w, k) { k = k | 0; return w.rows[k] || (w.rows[k] = { x: 0, v: 0, p: 0, pv: 0 }); }
    function setSel(w, k) {
      k = Math.floor(num(k, -1));
      if (k !== w.sel) { if (w.sel >= 0 || k >= 0) st.selects++; w.sel = k; }
      if (k >= 0) rowOf(w, k);
    }
    // the window was drawn this render: open it if it was closed, reopen after a gap
    function touch(w) {
      if (w.phase === 'closed') startOpen(w, S.ff);
      else if (w.phase === 'closing' && !w.explicit) { startOpen(w, false); st.reopens++; }
      else if (w.phase === 'open' && w.drawn && S.updates - w.lastUpd > GAP) { startOpen(w, S.ff); st.reopens++; }
      w.drawn = true; w.lastFrame = S.frame; w.lastUpd = S.updates;
    }
    // the window's motion now: alpha, scale about (cx, cy), translation, clip fractions
    function anim(w, r, px) {
      var a = { alpha: 1, s: 1, tx: 0, ty: 0, ch: 1, cw: 1, cx: r.x + r.w / 2, cy: r.y + r.h / 2, style: 'none', phase: w.phase, p: 1, px: px };
      var opt = w.opts || {}, style = STYLES[opt.style] ? opt.style : P.style;
      if (style === 'auto') style = px ? 'unfold' : 'pop';
      a.style = style;
      if (!enabled) return a;
      if (opt.origin && isFinite(opt.origin.x) && isFinite(opt.origin.y)) { a.cx = +opt.origin.x; a.cy = +opt.origin.y; }
      var red = reduced(), u = unit(), D = 22 * u, dir = slideDir(r, opt.edge);
      if (w.phase === 'open') {
        var od = openDur(), e = od > 0 ? (S.clock - w.t0) / od : 1, lin = c01(e);
        if (red) { a.alpha = lin; a.p = lin; return a; }
        var p = springCurve(e, P.bounce); a.p = p;
        if (style === 'pop') { a.alpha = c01(lin / 0.35); a.s = 0.82 + 0.18 * p; a.ty = (1 - p) * 6 * u; }
        else if (style === 'slide') { a.alpha = c01(lin / 0.4); a.tx = dir[0] * (1 - p) * D; a.ty = dir[1] * (1 - p) * D; }
        else if (style === 'unfold') { a.alpha = c01(lin / 0.2); a.ch = c01(p); a.cw = 0.7 + 0.3 * c01(p); a.ty = p > 1 ? -(p - 1) * 10 * u : 0; }
        else { a.alpha = c01(lin / 0.5); }
      } else if (w.phase === 'closing') {
        var cd = closeDur(), c = cd > 0 ? c01((S.clock - w.tc) / cd) : 1, q = closeCurve(c);
        a.alpha = 1 - q; a.p = 1 - q;
        if (red) { a.alpha = 1 - c; return a; }
        if (style === 'pop') { a.s = 1 - 0.07 * q; a.ty = 4 * u * q; }
        else if (style === 'slide') { a.tx = dir[0] * q * D * 0.6; a.ty = dir[1] * q * D * 0.6; }
        else if (style === 'unfold') { a.ch = 1 - q; a.cw = 1 - 0.2 * q; a.alpha = 1 - q * q; }
      }
      a.tx = rnd(a.tx, px); a.ty = rnd(a.ty, px);
      return a;
    }
    function slideDir(r, edge) {
      if (edge === 'bottom') return [0, 1]; if (edge === 'top') return [0, -1]; if (edge === 'left') return [-1, 0]; if (edge === 'right') return [1, 0];
      var v = view(), d = [[r.y + r.h - (v.y + v.h), [0, 1]], [v.y - r.y, [0, -1]]].map(function (q) { return [Math.abs(q[0]), q[1]]; });
      var dl = Math.abs(r.x - v.x), dr = Math.abs(v.x + v.w - r.x - r.w);
      d.push([dl * 1.5, [-1, 0]], [dr * 1.5, [1, 0]]);   // prefer vertical slides
      d.sort(function (p, q) { return p[0] - q[0]; });
      return d[0][1];
    }
    function dimAlpha(w, a) {
      var opt = w.opts || {};
      if (!opt.dim) return 0;
      var base = opt.dim === true ? P.dim : clamp(num(opt.dim, P.dim), 0, 0.9);
      if (!enabled) return base;
      if (w.phase === 'open') { var od = openDur(); return base * (od > 0 ? c01((S.clock - w.t0) / (od * 0.6)) : 1); }
      if (w.phase === 'closing') { var cd = closeDur(); return base * (1 - (cd > 0 ? c01((S.clock - w.tc) / cd) : 1)); }
      return 0;
    }
    function fillDim(ctx, alpha) {
      if (alpha <= 0.002) return;
      var v = view();
      ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = ink; ctx.fillRect(v.x, v.y, v.w, v.h); ctx.restore();
    }
    function devScale(ctx) { try { var m = ctx.getTransform(); return Math.hypot(m.a, m.b) || 1; } catch (e) { return 1; } }
    function softShadow(ctx, r, alpha, blur, dy, radius) {
      if (alpha <= 0.01) return;
      var k = devScale(ctx);
      ctx.save();
      ctx.globalAlpha *= alpha; ctx.fillStyle = ink; ctx.shadowColor = ink;
      ctx.shadowBlur = blur * k; ctx.shadowOffsetX = OFF * k; ctx.shadowOffsetY = dy * k;
      ctx.beginPath();
      if (radius > 0 && ctx.roundRect) ctx.roundRect(r.x - OFF, r.y, r.w, r.h, radius); else ctx.rect(r.x - OFF, r.y, r.w, r.h);
      ctx.fill(); ctx.restore();
    }
    function shadowAmt(w) {
      var s = (w.opts || {}).shadow;
      if (s === false || s === 0) return 0;
      return s === true || s == null ? P.shadow : clamp(num(s, P.shadow), 0, 1);
    }

    // ---- window wrapper --------------------------------------------------------------------------------------------
    function begin(ctx, id, rect, opts) {
      if (!ctx || id == null) return null;
      frameStart(); st.windowCalls++;
      var w = getW(id), r = rectOf(rect) || w.rect;
      if (!r) { warn('rect', 'window("' + id + '") without a rect {x, y, w, h}: drawn without motion'); return null; }
      if (opts && typeof opts === 'object') w.opts = opts; else w.opts = {};
      touch(w); w.rect = r;
      if (w.opts.selected != null) setSel(w, w.opts.selected);
      var px = pxOn(ctx); S.px = px;
      var a = anim(w, r, px);
      w.cur = a;
      ctx.save(); w.depth++;
      try {
        if (enabled) fillDim(ctx, dimAlpha(w, a));
        var sh = enabled ? shadowAmt(w) * a.alpha : 0;
        if (sh > 0 && a.style !== 'none') {
          if (px) { var o1 = Math.max(1, Math.round(unit() * 2)); ctx.save(); ctx.globalAlpha *= 0.45 * sh; ctx.fillStyle = ink;
            var sr = clipRect(r, a); ctx.fillRect(Math.round(sr.x + a.tx + o1), Math.round(sr.y + a.ty + o1), Math.round(sr.w), Math.round(sr.h)); ctx.restore(); }
          else {
            var lifted = Math.max(0, a.s - 1) * 40 + Math.max(0, 1 - a.p) * 0.6;
            ctx.save(); ctx.translate(a.cx + a.tx, a.cy + a.ty); ctx.scale(a.s, a.s); ctx.translate(-a.cx, -a.cy);
            softShadow(ctx, r, 0.55 * sh, (14 + 10 * lifted) * unit(), (6 + 6 * lifted) * unit(), num(w.opts.radius, 0));
            ctx.restore();
          }
        }
        if (enabled) {
          ctx.globalAlpha *= a.alpha;
          if (a.style === 'unfold' && (a.ch < 1 || a.cw < 1)) { var cr = clipRect(r, a); ctx.beginPath(); ctx.rect(cr.x + a.tx - 2, cr.y + a.ty - 2, cr.w + 4, cr.h + 4); ctx.clip(); }
          if (a.tx || a.ty || a.s !== 1) { ctx.translate(a.cx + a.tx, a.cy + a.ty); if (a.s !== 1) ctx.scale(a.s, a.s); ctx.translate(-a.cx, -a.cy); }
        }
      } catch (e) { st.errors++; warn('begin', 'begin failed: ' + e); }
      return a;
    }
    function clipRect(r, a) {
      var h = r.h * a.ch, ww = r.w * a.cw, x = r.x + (r.w - ww) / 2, y = r.y + (r.h - h) / 2;
      return a.px ? { x: Math.round(x), y: Math.round(y), w: Math.round(ww), h: Math.round(h) } : { x: x, y: y, w: ww, h: h };
    }
    function end(ctx, id) {
      var w = W[String(id)];
      if (!w || !w.depth || !ctx) return;
      w.depth--;
      try { ctx.restore(); } catch (e) { }
      try { snapshot(ctx, w); } catch (e) { st.errors++; warn('snap', 'snapshot failed: ' + e); }
    }
    // copy the window as drawn (device px) so draw() can play its close after the game stops drawing it
    function snapshot(ctx, w) {
      var a = w.cur, r = w.rect;
      if (!enabled || !S.drawCalls || !a || !r || w.phase !== 'open' || a.alpha < 0.05) return;
      var cv = ctx.canvas; if (!cv || !cv.width || !ctx.getTransform) return;
      var m = ctx.getTransform(), pad = 3, xs = [], ys = [];
      var pts = [[r.x - pad, r.y - pad], [r.x + r.w + pad, r.y - pad], [r.x - pad, r.y + r.h + pad], [r.x + r.w + pad, r.y + r.h + pad]];
      for (var i = 0; i < 4; i++) {
        var x = a.cx + (pts[i][0] - a.cx) * a.s + a.tx, y = a.cy + (pts[i][1] - a.cy) * a.s + a.ty;
        xs.push(m.a * x + m.c * y + m.e); ys.push(m.b * x + m.d * y + m.f);
      }
      var dx = Math.max(0, Math.floor(Math.min.apply(null, xs))), dy = Math.max(0, Math.floor(Math.min.apply(null, ys)));
      var dw = Math.min(cv.width, Math.ceil(Math.max.apply(null, xs))) - dx, dh = Math.min(cv.height, Math.ceil(Math.max.apply(null, ys))) - dy;
      if (dw < 2 || dh < 2) return;
      if (!w.snapCv) w.snapCv = makeCanvas(dw, dh);
      var sc = w.snapCv; if (!sc) return;
      if (sc.width !== dw || sc.height !== dh) { sc.width = dw; sc.height = dh; }
      var g = sc.getContext('2d'); g.clearRect(0, 0, dw, dh); g.drawImage(cv, dx, dy, dw, dh, 0, 0, dw, dh);
      var k = Math.hypot(m.a, m.b) || 1;
      w.snap = { x: dx, y: dy, w: dw, h: dh, s: a.s, k: k, cx: m.a * (a.cx + a.tx) + m.c * (a.cy + a.ty) + m.e, cy: m.b * (a.cx + a.tx) + m.d * (a.cy + a.ty) + m.f, style: a.style, px: a.px, dir: slideDir(r, (w.opts || {}).edge) };
    }
    function windowFn(ctx, id, rect, fn, opts) {
      var a = null, res;
      try { a = begin(ctx, id, rect, opts); } catch (e) { st.errors++; warn('begin', 'begin failed: ' + e); a = null; }
      try { if (typeof fn === 'function') res = fn(a ? a.alpha : 1); }
      finally { if (a) end(ctx, id); }
      return res;
    }

    // ---- rows --------------------------------------------------------------------------------------------------------
    function rowOffset(id, k) {
      var out = { x: 0, y: 0, alpha: 1, lift: 0 };
      var w = W[String(id)];
      if (!w || !enabled || w.phase === 'closed') return out;
      k = Math.max(0, k | 0);
      var red = reduced(), u = unit(), px = S.px;
      if (w.phase === 'open') {
        var d = red ? 0 : Math.min(k, 10) * P.stagger, rd = red ? ROW_MS_REDUCED : ROW_MS;
        var e = (S.clock - w.t0 - d) / rd;
        if (e < 1 && (P.stagger > 0 || red)) { out.alpha = c01(e / 0.6); if (!red) out.x = -(1 - easeOut3(e)) * 12 * u; }
      }
      var L = w.rows[k];
      if (L && !red) { out.lift = L.x; out.y -= P.lift * L.x; out.x += P.lift * 0.75 * L.x + 5 * u * L.p; }
      out.x = rnd(out.x, px); out.y = rnd(out.y, px);
      return out;
    }
    function row(ctx, id, k, fn, rect) {
      st.rowCalls++;
      if (!ctx) { return typeof fn === 'function' ? fn() : undefined; }
      frameStart();
      var w = W[String(id)], off = rowOffset(id, k), r = rectOf(rect), res;
      ctx.save();
      try {
        if (w && w.sel === (k | 0) && r && off.lift > 0.02 && enabled && !reduced() && !S.px && P.shadow > 0)
          softShadow(ctx, { x: r.x + off.x, y: r.y + off.y, w: r.w, h: r.h }, 0.5 * P.shadow * Math.min(1, off.lift) * off.alpha, 8 * unit(), 3 * unit() * off.lift, num((w.opts || {}).radius, 0) * 0.6);
        if (off.alpha < 1) ctx.globalAlpha *= off.alpha;
        if (off.x || off.y) ctx.translate(off.x, off.y);
      } catch (e) { st.errors++; }
      try { if (typeof fn === 'function') res = fn(off); }
      finally { try { ctx.restore(); } catch (e) { } }
      return res;
    }

    // ---- glide and count ---------------------------------------------------------------------------------------------
    function glide(key, rect) {
      st.glideCalls++; frameStart();
      var r = rectOf(rect) || (rect && isFinite(rect.x) && isFinite(rect.y) ? { x: +rect.x, y: +rect.y, w: num(rect.w, 0), h: num(rect.h, 0) } : null);
      if (!r) return rect;
      key = String(key);
      if (!enabled || reduced() || P.glide <= 0) { delete G[key]; return { x: r.x, y: r.y, w: r.w, h: r.h }; }
      var g = G[key];
      if (!g || S.ff || S.updates - g.lastUpd > GAP) g = G[key] = { x: { x: r.x, v: 0 }, y: { x: r.y, v: 0 }, w: { x: r.w, v: 0 }, h: { x: r.h, v: 0 }, t: r, lastUpd: S.updates };
      g.t = r; g.lastUpd = S.updates;
      var px = S.px;
      return { x: rnd(g.x.x, px), y: rnd(g.y.x, px), w: rnd(g.w.x, px), h: rnd(g.h.x, px) };
    }
    function countVal(c) {
      var d = P.count * Math.min(1, 0.45 + Math.abs(c.to - c.from) / 60);
      if (d <= 0 || reduced() || !enabled) return c.to;
      var e = (S.clock - c.t0) / d;
      return e >= 1 ? c.to : c.from + (c.to - c.from) * easeOut3(e);
    }
    function count(key, value) {
      st.countCalls++; frameStart();
      var v = +value; if (!isFinite(v)) return value;
      key = String(key);
      var c = C[key];
      if (!c || S.ff || S.updates - c.lastUpd > GAP) c = C[key] = { from: v, to: v, t0: S.clock, lastUpd: S.updates };
      else if (v !== c.to) { c.from = countVal(c); c.to = v; c.t0 = S.clock; }
      c.lastUpd = S.updates;
      var x = countVal(c);
      return x === c.to ? c.to : (c.to > c.from ? Math.floor(x) : Math.ceil(x));
    }
    function counting(key) { var c = C[String(key)]; if (!c) return 0; var x = countVal(c); return x === c.to ? 0 : c.to > c.from ? 1 : -1; }

    // ---- clock -------------------------------------------------------------------------------------------------------
    function update(dt) {
      dt = num(dt, FRAME); if (!(dt > 0)) dt = FRAME; if (dt > 250) dt = 250;
      S.clock += dt; S.updates++; st.updates++;
      var t = dt / 1000, z = springZ(), wn = springW();
      var f = pending; pending = [];
      for (var i = 0; i < f.length; i++) { try { f[i](); } catch (e) { st.errors++; warn('onDone', 'an onDone callback threw: ' + e); } }
      for (var j = 0; j < order.length; j++) {
        var w = W[order[j]];
        if (w.phase === 'open') {
          if (!w.settleLogged && S.clock - w.t0 >= openDur()) { push(st.openMs, S.clock - w.t0); w.settleLogged = true; }
          for (var k in w.rows) { var L = w.rows[k]; springStep(L, (k | 0) === w.sel ? 1 : 0, t, z, wn); var pp = { x: L.p, v: L.pv }; springStep(pp, 0, t, Math.max(0.35, z), wn * 1.3); L.p = pp.x; L.pv = pp.v; }
        } else if (w.phase === 'closing') {
          if (S.clock - w.tc >= closeDur()) finishClose(w);
        }
      }
      for (var key in G) {
        var g = G[key];
        if (S.updates - g.lastUpd > GAP) { delete G[key]; continue; }
        springStep(g.x, g.t.x, t, z, wn); springStep(g.y, g.t.y, t, z, wn); springStep(g.w, g.t.w, t, z, wn); springStep(g.h, g.t.h, t, z, wn);
      }
      for (var ck in C) if (S.updates - C[ck].lastUpd > GAP * 4) delete C[ck];
    }

    // ---- end of render: auto-close and closing ghosts ----------------------------------------------------------------
    function draw(ctx) {
      frameStart(); st.draws++; S.drawCalls++;
      try {
        for (var i = 0; i < order.length; i++) {
          var w = W[order[i]];
          if (w.phase === 'open' && w.drawn && w.lastFrame !== S.frame) startClose(w, false, null);
        }
        if (ctx && enabled) for (var j = 0; j < order.length; j++) {
          var g = W[order[j]];
          if (g.phase === 'closing' && g.lastFrame !== S.frame && !replaced(g)) ghost(ctx, g);
        }
      } catch (e) { st.errors++; warn('draw', 'draw failed: ' + e); }
      S.frame++;
    }
    // a window opened in the same place since this one started closing (a menu swapping its list): its own open carries the
    // transition, a copy of the old one on top would hide it
    function replaced(g) {
      var r = g.rect; if (!r) return false;
      for (var i = 0; i < order.length; i++) {
        var w = W[order[i]];
        if (w === g || w.phase !== 'open' || w.lastFrame !== S.frame || !w.rect || w.t0 < g.tc - 1) continue;
        var ix = Math.min(r.x + r.w, w.rect.x + w.rect.w) - Math.max(r.x, w.rect.x), iy = Math.min(r.y + r.h, w.rect.y + w.rect.h) - Math.max(r.y, w.rect.y);
        if (ix > 0 && iy > 0 && ix * iy >= 0.5 * r.w * r.h) return true;
      }
      return false;
    }
    // windows that opened since this one started closing and were drawn this render (a hand-off, e.g. dialogue -> shop):
    // the closing copy and its dim are drawn around them, never over them
    function handoffRects(g) {
      var out = [];
      for (var i = 0; i < order.length; i++) {
        var w = W[order[i]];
        if (w !== g && w.phase === 'open' && w.lastFrame === S.frame && w.rect && w.t0 >= g.tc - 1) out.push(w.rect);
      }
      return out;
    }
    function ghost(ctx, w) {
      var hs = handoffRects(w), clipped = false;
      if (hs.length) {
        ctx.save(); clipped = true;
        try {
          ctx.beginPath(); ctx.rect(-1e5, -1e5, 2e5, 2e5);
          for (var h = 0; h < hs.length; h++) ctx.rect(hs[h].x, hs[h].y, hs[h].w, hs[h].h);
          ctx.clip('evenodd');
        } catch (e) { /* no clip support: draw as before */ }
      }
      try { ghostDraw(ctx, w); } finally { if (clipped) ctx.restore(); }
    }
    function ghostDraw(ctx, w) {
      var dimA = dimAlpha(w, null);
      if (dimA > 0) fillDim(ctx, dimA);
      var sn = w.snap; if (!sn || !w.snapCv) return;
      var cd = closeDur(), c = cd > 0 ? c01((S.clock - w.tc) / cd) : 1, q = closeCurve(c), red = reduced();
      var alpha = red ? 1 - c : (sn.style === 'unfold' ? 1 - q * q : 1 - q);
      if (alpha <= 0.004) return;
      var u = unit() * sn.k, gs = 1, ox = 0, oy = 0, sx = 0, sy = 0, sw = sn.w, sh = sn.h;
      if (!red) {
        if (sn.style === 'pop') { gs = 1 - 0.07 * q; oy = 4 * u * q; }
        else if (sn.style === 'slide') { ox = sn.dir[0] * q * 22 * u * 0.6; oy = sn.dir[1] * q * 22 * u * 0.6; }
        else if (sn.style === 'unfold') { sh = Math.max(1, Math.round(sn.h * (1 - q))); sy = Math.round((sn.h - sh) / 2); var nw = Math.max(1, Math.round(sn.w * (1 - 0.2 * q))); sx = Math.round((sn.w - nw) / 2); sw = nw; }
      }
      ctx.save();
      try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = !sn.px;
        var x = sn.cx + (sn.x + sx - sn.cx) * gs + ox, y = sn.cy + (sn.y + sy - sn.cy) * gs + oy;
        if (sn.px) { x = Math.round(x); y = Math.round(y); }
        ctx.drawImage(w.snapCv, sx, sy, sw, sh, x, y, sw * gs, sh * gs);
        st.ghostFrames++;
      } finally { ctx.restore(); }
    }

    // ---- explicit calls ------------------------------------------------------------------------------------------------
    function open(id, opts) {
      if (id == null) return;
      var w = getW(id);
      if (opts && typeof opts === 'object') { w.opts = opts; if (opts.selected != null) setSel(w, opts.selected); }
      if (w.phase !== 'open') { startOpen(w, false); st.explicitOpens++; }
    }
    function close(id, onDone) {
      var w = id == null ? null : W[String(id)];
      if (!w) { if (typeof onDone === 'function') pending.push(onDone); return; }
      startClose(w, true, onDone);
    }
    function select(id, k) { if (id == null) return; setSel(getW(id), k); }
    function pulse(id, k) { if (id == null) return; var w = getW(id); var L = rowOf(w, k == null ? w.sel : k); L.p = 1; L.pv = 0; st.pulses++; }
    function clear() {
      var f = [];
      for (var i = 0; i < order.length; i++) { var w = W[order[i]]; if (w.onDone) f.push(w.onDone); w.onDone = null; w.phase = 'closed'; w.snap = null; w.drawn = false; w.sel = -1; w.rows = {}; }
      G = {}; C = {}; f = f.concat(pending); pending = []; st.clears++;
      for (var j = 0; j < f.length; j++) { try { f[j](); } catch (e) { st.errors++; } }
    }
    function state(id) {
      var w = W[String(id)];
      if (!w) return { id: String(id), phase: 'closed', ms: 0, alpha: 0, selected: -1 };
      var ph = w.phase, ms = 0;
      if (ph === 'open') { ms = S.clock - w.t0; if (ms < openDur()) ph = 'opening'; }
      else if (ph === 'closing') ms = S.clock - w.tc;
      var a = w.rect ? anim(w, w.rect, S.px) : { alpha: ph === 'closed' ? 0 : 1, s: 1 };
      return { id: w.id, phase: ph, ms: Math.round(ms * 10) / 10, alpha: ph === 'closed' ? 0 : Math.round(a.alpha * 1000) / 1000, scale: Math.round(a.s * 1000) / 1000,
        selected: w.sel, explicit: w.explicit, drawnThisFrame: w.lastFrame === S.frame };
    }
    function debug() {
      var ws = [], busy = false;
      for (var i = 0; i < order.length; i++) { var s = state(order[i]); if (s.phase !== 'closed') ws.push(s); if (s.phase === 'opening' || s.phase === 'closing') busy = true; }
      var gt = {}, ct = {};
      for (var gk in G) gt[gk] = [Math.round(G[gk].t.x), Math.round(G[gk].t.y)];
      for (var kk in C) ct[kk] = C[kk].to;
      return { clock: S.clock, updates: S.updates, frame: S.frame, ff: S.ff, px: S.px, windows: ws, animating: busy, glides: gt, counts: ct,
        openMs: openDur(), closeMs: closeDur(), reduced: reduced(), enabled: enabled };
    }
    function stats() {
      var o2 = {}; for (var k in st) o2[k] = Array.isArray(st[k]) ? st[k].slice() : st[k];
      return o2;
    }

    return {
      update: update, window: windowFn, begin: begin, end: end, apply: begin, restore: end,
      row: row, rowOffset: rowOffset, glide: glide, count: count, counting: counting, draw: draw,
      open: open, close: close, select: select, pulse: pulse, clear: clear,
      setParams: setParams, params: function () { var c = {}; for (var k in P) c[k] = P[k]; return c; },
      setEnabled: function (on) { enabled = on !== false; if (!enabled) { G = {}; } }, enabled: function () { return enabled; },
      reduced: reduced, state: state, debug: debug, stats: stats, version: VERSION
    };
  }

  root.GameDNA_SpringyUI = { create: create, version: VERSION, defaults: (function () { var d = {}; for (var k in DEFAULTS) d[k] = DEFAULTS[k]; return d; })(), springCurve: springCurve, closeCurve: closeCurve };
})(typeof window !== 'undefined' ? window : this);
