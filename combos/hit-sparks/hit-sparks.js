/* GameDNA E-02 · Hit sparks & spell bursts · module v1 (plain script, no dependencies, one global)
 *
 *   const fx = GameDNA_HitSparks.create({
 *     view: { x: 0, y: 0, w: 256, h: 152 },     // screen rect (native px) effects may cover; keep it above the HUD
 *     seed: 1,                                   // same seed + same calls = same pixels (?t=&freeze=1 stable)
 *     skin: 'pixel16',                           // optional; needs GameDNA_Skin, else a built-in pixel16 look
 *     params: { size: 1, life: 14, sparks: 8, ... },   // see DEFAULTS
 *     getObstacles: () => [{ x, y, w, h, id }],  // optional: unit rects (same space as hit coords) - sparks stay off neighbours
 *     uiRects: () => [{ x, y, w, h }],           // optional: screen rects never drawn over (HUD, banner, menus)
 *     onHitStop: ms => {}, onShake: (px, ms) => {}, onFlash: (alpha, ms) => {}
 *   });
 *   fx.hit(x, y, { kind: 'auto' | 'slash' | 'star' | 'spark' | 'ring', dir: 1 | -1 | {x, y}, crit, element, target, from })
 *   fx.burst(x, y, 'fire' | 'ice' | 'thunder' | 'heal', { target })
 *   fx.update(dtMs)                  // world time; pass 0 while your game is frozen by hit-stop
 *   fx.draw(ctx, offsetX, offsetY)   // after sprites, before HUD; offset = -camera for scrolling worlds
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0', FRAME = 1000 / 60;
  var DEFAULTS = { size: 1, life: 14, sparks: 8, gravity: 0.15, hitstop: 50, shake: 2, critFlash: 'screen', style: 'auto', cycle: 2, cap: 192, reach: 32 };
  var KINDS = ['auto', 'slash', 'star', 'spark', 'ring'];
  var ALIAS = { fire: 'fire', flame: 'fire', burn: 'fire', ember: 'fire', ice: 'ice', frost: 'ice', cold: 'ice', blizzard: 'ice', water: 'ice',
    thunder: 'thunder', bolt: 'thunder', lightning: 'thunder', electric: 'thunder', spark: 'thunder', shock: 'thunder',
    heal: 'heal', cure: 'heal', mend: 'heal', restore: 'heal', regen: 'heal', holy: 'heal', light: 'heal' };
  var BURST_LEN = { fire: 40, ice: 44, thunder: 34, heal: 48, impact: 30 };
  // 6-level ramps, dark -> white. pixel16 ramps are hand-picked; other skins derive them from palette.fx.*
  var P16 = {
    impact: ['#5a1a22', '#c8481e', '#ffa040', '#ffe080', '#fff6c8', '#ffffff'],
    fire: ['#5a2038', '#b02a2a', '#e8562a', '#ff9a30', '#ffd860', '#fff8d0'],
    ice: ['#1a3a78', '#2a68b0', '#46a6e6', '#90e2ff', '#d8f8ff', '#ffffff'],
    thunder: ['#3a2a8a', '#7a6aff', '#a8c8ff', '#fff6a0', '#fffbe0', '#ffffff'],
    heal: ['#145a34', '#2a9a5a', '#3ac070', '#9cffb8', '#e0ffe8', '#ffffff']
  };
  var BUILTIN = { id: 'pixel16', pixel: true, palette: { ink: '#140c1c', fx: { hot: '#ff7a3a', cold: '#6ad8f0', heal: '#4ad870', crit: '#ffb43a', white: '#ffffff' } },
    particles: { shape: 'square', size: [1, 2], snap: true, blend: 'source-over', glow: 0 }, motion: { snap: true, fadeSteps: [1, 0.75, 0.5, 0.25], flashMax: 0.35 } };

  /* ---------- small helpers ---------- */
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hash(a, b) { var h = (a * 374761393 + b * 668265263 + 1013904223) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0); }
  function rng(s) { s = s >>> 0 || 1; return function () { s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function h01(i, s) { return hash(i + 1, s + 7) / 4294967296; }
  function rgb(c) { c = String(c || '#ffffff'); if (c[0] === '#') { if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; } var m = c.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/); return m ? [+m[1], +m[2], +m[3]] : [255, 255, 255]; }
  function hex(a) { return '#' + a.map(function (v) { v = clamp(Math.round(v), 0, 255); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return hex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function distRect(x, y, r) { var dx = Math.max(r.x - x, 0, x - (r.x + r.w)), dy = Math.max(r.y - y, 0, y - (r.y + r.h)); return Math.sqrt(dx * dx + dy * dy); }
  function rectOf(o) {
    if (!o) return null;
    if (Array.isArray(o)) o = { x: o[0], y: o[1], w: o[2], h: o[3] };
    var x = num(o.x, NaN), y = num(o.y, NaN), w = num(o.w != null ? o.w : o.width, NaN), h = num(o.h != null ? o.h : o.height, NaN);
    return isFinite(x) && isFinite(y) && w > 0 && h > 0 ? { x: x, y: y, w: w, h: h, id: o.id } : null;
  }
  function mkCanvas(w, h) { if (typeof document === 'undefined') return null; var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }

  /* ---------- level rasters for the spell-burst sprite sequences (level 0 = empty, 1..6 = ramp index + 1) ---------- */
  function Raster(w, h) { this.w = w; this.h = h; this.d = new Uint8Array(w * h); }
  Raster.prototype.set = function (x, y, L) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = L; };
  Raster.prototype.max = function (x, y, L) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) { var i = y * this.w + x; if (this.d[i] < L) this.d[i] = L; } };
  Raster.prototype.disc = function (cx, cy, r, L) { if (r < 0.5) { this.set(cx, cy, L); return; } for (var y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (var x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { var dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= r * r) this.set(x, y, L); } };
  Raster.prototype.line = function (x0, y0, x1, y1, L, th) { var n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); for (var i = 0; i <= n; i++) { var x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; this.set(x, y, L); if (th > 1) { this.set(x + 1, y, L); } } };
  Raster.prototype.ellipse = function (cx, cy, rx, ry, L, dither, ph) { var n = Math.max(12, Math.ceil(rx * 7)); for (var i = 0; i < n; i++) { if (dither && ((i + ph) & 1)) continue; var a = i / n * Math.PI * 2; this.set(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, L); } };
  Raster.prototype.diamond = function (cx, cy, hh, hw, Lo, Lf, Lc) {   // crystal: outline, fill, centre line
    for (var y = -hh; y <= hh; y++) { var k = Math.round(hw * (1 - Math.abs(y) / (hh + 1))); for (var x = -k - 1; x <= k + 1; x++) this.set(cx + x, cy + y, Math.abs(x) > k ? Lo : x === 0 || (x === -1 && y < 0) ? Lc : Lf); }
    this.set(cx, cy - hh - 1, Lo); this.set(cx, cy + hh + 1, Lo);
  };

  var SEQ = {};   // cache: element:R -> {n, w, h, cx, cy, frames}
  function sequence(el, R) {
    var key = el + ':' + R; if (SEQ[key]) return SEQ[key];
    var len = BURST_LEN[el] || 30, n = Math.ceil(len / 2), W, H, cx, cy, frames = [], i, j;
    if (el === 'thunder') { W = 2 * R + 6; H = 2 * R + 6; cx = R + 3; cy = R + 3; }
    else if (el === 'fire' || el === 'heal') { W = 2 * R + 8; H = Math.round(2.6 * R) + 6; cx = R + 4; cy = Math.round(1.6 * R) + 3; }
    else { W = 2 * R + 8; H = 2 * R + 8; cx = R + 4; cy = R + 4; }
    for (var f = 0; f < n; f++) {
      var q = f / (n - 1), r = new Raster(W, H);
      if (el === 'fire') {
        if (q < 0.08) { r.disc(cx, cy + R * 0.3, R * 0.3 + 1, 5); r.disc(cx, cy + R * 0.3, R * 0.15 + 0.5, 6); }
        for (i = 0; i < 16; i++) {
          var s1 = h01(i, 11), s2 = h01(i, 12), life = q * 1.5 - s1 * 0.45; if (life <= 0 || life >= 1) continue;
          var X = cx + (s2 - 0.5) * 1.5 * R * (1 - life * 0.4) + Math.sin(life * 7 + i) * 1.5, Y = cy + R * 0.45 - life * 1.45 * R - s1 * 3;
          var rr = Math.max(0.6, (1 - life) * R * 0.17), lv = clamp(Math.round((1 - life) * 5.4 - 0.2), 0, 5) + 1;
          r.disc(X, Y, rr + 0.7, Math.max(1, lv - 1)); r.disc(X, Y - rr * 0.9, rr * 0.6, Math.max(1, lv - 1)); r.disc(X, Y + 0.4, rr * 0.55, lv); if (lv >= 5) r.set(X, Y + 1, 6);
          for (var tq = 1; tq <= Math.round(rr * 1.6) + 1; tq++) r.max(X + Math.sin(life * 9 + i + tq * 0.7) * 0.8, Y - rr * 0.9 - rr * 0.6 - tq, Math.max(1, lv - 1 - (tq > rr ? 1 : 0)));   // flame tongue tip
        }
      } else if (el === 'ice') {
        for (i = 0; i < 7; i++) {
          var a = i / 7 * Math.PI * 2 + 0.3, s = h01(i, 21), d = q < 0.5 ? (1 - q * 2) * R * 0.75 : 0;
          if (q < 0.62) r.diamond(Math.round(cx + Math.cos(a) * (d + R * 0.28 + s * R * 0.15)), Math.round(cy + Math.sin(a) * (d + R * 0.22) * 0.8), Math.round(R * 0.22 + s * R * 0.12), 1, 2, 4, 6);
        }
        if (q >= 0.48 && q < 0.66) { r.disc(cx, cy, R * (0.35 + (q - 0.48) * 2.2), 5); r.disc(cx, cy, R * 0.25, 6); }
        if (q >= 0.62) r.ellipse(cx, cy, R * (0.4 + (q - 0.62) * 1.6), R * (0.32 + (q - 0.62) * 1.3), q < 0.8 ? 4 : 2, q > 0.75, f);
      } else if (el === 'thunder') {
        if (q < 0.55) {
          var L = Math.round(Math.sin(clamp(q / 0.55, 0, 1) * Math.PI * 0.85 + 0.25) * R * 0.6);
          for (j = -L; j <= L; j++) { r.max(cx + j, cy, Math.abs(j) < L * 0.4 ? 6 : 4); r.max(cx, cy + j, Math.abs(j) < L * 0.4 ? 6 : 4); }
          for (j = 1; j <= Math.round(L * 0.6); j++) { r.max(cx + j, cy + j, 3); r.max(cx - j, cy - j, 3); r.max(cx + j, cy - j, 3); r.max(cx - j, cy + j, 3); }
          if (q < 0.25) r.ellipse(cx, cy + 2, R * (0.3 + q * 2), R * (0.1 + q * 0.6), 4, false, 0);
          r.disc(cx, cy, 1.5, 6);
        } else {
          for (i = 0; i < 10; i++) { var aa = h01(i, 35) * Math.PI * 2, dd = (q - 0.5) * R * 1.8 * (0.5 + h01(i, 36)); if ((i + f) & 1) r.set(cx + Math.cos(aa) * dd, cy + Math.sin(aa) * dd * 0.7, q < 0.8 ? 4 : 2); }
        }
      } else if (el === 'heal') {
        var g0 = cy + Math.round(R * 0.5);
        if (q > 0.06 && q < 0.75) { var colW = Math.round(R * 0.45 * Math.sin(clamp((q - 0.06) / 0.69, 0, 1) * Math.PI)); for (var yy = g0 - Math.round(R * 1.5); yy <= g0; yy++) for (var xx = -colW; xx <= colW; xx++) if (((xx + yy + f) & 3) === 0) r.max(cx + xx, yy, Math.abs(xx) < colW * 0.4 ? 3 : 2); }
        r.ellipse(cx, g0, R * (0.35 + 0.65 * Math.min(1, q * 1.6)), R * (0.12 + 0.2 * Math.min(1, q * 1.6)), q < 0.5 ? 5 : q < 0.8 ? 4 : 2, q > 0.7, f);
        for (i = 0; i < 10; i++) {
          var lf = q * 1.6 - h01(i, 41) * 0.6; if (lf <= 0 || lf >= 1) continue;
          var px = cx + (h01(i, 42) - 0.5) * 1.5 * R, py = g0 - lf * 1.6 * R, lvh = lf < 0.5 ? 6 : lf < 0.8 ? 4 : 3;
          r.set(px, py, lvh); r.set(px - 1, py, lvh - 1); r.set(px + 1, py, lvh - 1); r.set(px, py - 1, lvh - 1); r.set(px, py + 1, lvh - 1);
        }
      } else {   // impact: generic star + ring
        var R0 = R * Math.min(1, q * 3) * (q > 0.55 ? 1 - (q - 0.55) * 1.6 : 1);
        for (i = 0; i < 8; i++) { var an = i * Math.PI / 4 + 0.2, ln = Math.round(i % 2 ? R0 : R0 * 0.55); for (j = 1; j <= ln; j++) r.set(cx + Math.cos(an) * j, cy + Math.sin(an) * j, j > ln - 2 ? 3 : j > ln * 0.5 ? 5 : 6); }
        r.ellipse(cx, cy, 2 + R * q, 2 + R * q, q < 0.5 ? 4 : 2, q > 0.5, f);
      }
      frames.push(r.d);
    }
    return (SEQ[key] = { n: n, len: len, w: W, h: H, cx: cx, cy: cy, frames: frames });
  }

  /* ---------- the instance ---------- */
  function create(opt) {
    opt = opt || {};
    var SKAPI = root.GameDNA_Skin || null, SK = null;
    try { SK = SKAPI ? SKAPI.resolve(opt.skin) : null; } catch (e) { SK = null; }
    var skin = SK || BUILTIN, pixel = skin.pixel !== false, isP16 = !SK || SK.id === 'pixel16';
    var PR = skin.particles || BUILTIN.particles, MO = skin.motion || BUILTIN.motion;
    var P = {}, k; for (k in DEFAULTS) P[k] = DEFAULTS[k];
    var warned = {}, effects = [], pool = [], live = 0, acc = 0, spawnNo = 0, frameNo = 0, flash = null, layer = null, lctx = null, lastOff = [0, 0];
    var anchors = {}, obsCache = null, drawnRects = [], canvasCache = {}, cacheN = 0, RAMPS = {};
    var view = rectOf(opt.view) || rectOf(opt.bounds);

    function warn(key, msg) { if (warned[key]) return; warned[key] = 1; if (root.console) console.warn('GameDNA_HitSparks: ' + msg); }
    function call(name) { var f = opt[name]; if (typeof f !== 'function') return; try { f.apply(null, [].slice.call(arguments, 1)); } catch (e) { warn('cb-' + name, name + ' threw: ' + (e && e.message)); } }
    function setParams(o) {
      o = o || {};
      for (var key in DEFAULTS) if (o[key] != null) { var d = DEFAULTS[key]; P[key] = typeof d === 'number' ? num(o[key], d) : String(o[key]); }
      P.size = clamp(P.size, 0.5, 3); P.life = clamp(Math.round(P.life), 4, 60); P.sparks = clamp(Math.round(P.sparks), 0, 48); P.cap = clamp(Math.round(P.cap), 16, 1024);
      P.cycle = clamp(Math.round(P.cycle), 1, 12); P.reach = clamp(P.reach, 8, 96); P.hitstop = clamp(P.hitstop, 0, 400); P.shake = clamp(P.shake, 0, 12);
      if (['screen', 'host', 'local', 'off'].indexOf(P.critFlash) < 0) P.critFlash = 'screen';
      if (KINDS.indexOf(P.style) < 0) P.style = 'auto';
      while (pool.length < P.cap) pool.push({ on: false });
      if (pool.length > P.cap) { pool.length = P.cap; live = 0; for (var i = 0; i < pool.length; i++) if (pool[i].on) live++; }
    }
    setParams(opt.params);

    function ramp(el) {
      el = el || 'impact'; if (RAMPS[el]) return RAMPS[el];
      var pal = skin.palette || {}, fx = pal.fx || {}, r;
      if (pal.ramps && pal.ramps.fx && pal.ramps.fx[el]) r = pal.ramps.fx[el];
      else if (isP16) r = P16[el] || P16.impact;
      else {
        var base = { impact: fx.crit, fire: fx.hot, ice: fx.cold, thunder: fx.thunder || mix(fx.crit || '#ffe060', '#ffffff', 0.25), heal: fx.heal }[el] || fx.crit || '#ffb43a', ink = pal.ink || '#202030', wh = fx.white || '#ffffff';
        r = [mix(base, ink, 0.6), mix(base, ink, 0.3), base, mix(base, wh, 0.35), mix(base, wh, 0.7), wh];
      }
      return (RAMPS[el] = r);
    }
    function elementOf(e) { if (e == null || e === '' || e === 'none') return null; var a = ALIAS[String(e).toLowerCase()]; if (!a) warn('el-' + e, 'unknown element "' + e + '", drawn as a plain impact'); return a || 'impact'; }
    function getObs() {
      if (obsCache) return obsCache;
      var list = [];
      if (typeof opt.getObstacles === 'function') { try { list = opt.getObstacles() || []; } catch (e) { warn('obs', 'getObstacles threw: ' + (e && e.message)); list = []; } }
      var out = []; for (var i = 0; i < list.length; i++) { var r = rectOf(list[i]); if (r && r.id != null) out.push(r); }
      return (obsCache = out);
    }
    function uiList() {
      var u = opt.uiRects, list = [];
      try { list = typeof u === 'function' ? u() || [] : u || []; } catch (e) { warn('ui', 'uiRects threw: ' + (e && e.message)); list = []; }
      var out = []; for (var i = 0; i < list.length; i++) { var r = rectOf(list[i]); if (r) out.push(r); } return out;
    }
    // how far an effect at (x, y) may reach before it would touch another unit (2 px margin)
    function reachAt(x, y, owner, want, from) {
      var R = want, obs = getObs();
      for (var i = 0; i < obs.length; i++) {
        var o = obs[i]; if ((owner != null && String(o.id) === String(owner)) || (from != null && String(o.id) === String(from))) continue;
        var d = distRect(x, y, o); if (d <= 0 || (owner == null && d < 3)) continue;   // the contact point is in (or on) it: that is the target itself
        R = Math.min(R, d - 2);
      }
      return Math.max(6, Math.floor(R));
    }
    // resolve the contact point; never fall back to the screen centre
    function point(x, y, o) {
      if (x && typeof x === 'object') { var rr = rectOf(x); o = (y && typeof y === 'object') ? y : o; if (rr) { x = rr.x + rr.w / 2; y = rr.y + rr.h / 2; } else { y = x.y; x = x.x; } }
      o = o || {};
      var tid = o.target != null ? String(o.target) : null;
      x = num(x, NaN); y = num(y, NaN);
      if (isFinite(x) && isFinite(y)) { if (tid) anchors[tid] = [x, y]; return [x, y, o]; }
      if (tid && typeof opt.getAnchor === 'function') { try { var a = opt.getAnchor(o.target); if (a && isFinite(+a.x) && isFinite(+a.y)) { var yy = a.top != null && a.h ? +a.top + a.h / 2 : +a.y; anchors[tid] = [+a.x, yy]; return [+a.x, yy, o]; } } catch (e) {} }
      if (tid && anchors[tid]) return [anchors[tid][0], anchors[tid][1], o];
      warn('nopoint', 'hit/burst without a valid x, y (or a known target) was skipped');
      return null;
    }
    function dirOf(o) {
      var d = o.dir;
      if (d && typeof d === 'object') { var dx = num(d.x, 0), dy = num(d.y, 0); if (dx || dy) return Math.atan2(dy, dx); }
      if (o.angle != null && isFinite(+o.angle)) return +o.angle;
      d = num(d, 0); return d < 0 ? Math.PI - 0.55 : d > 0 ? 0.55 : null;
    }

    /* ---- particles (pooled, hard cap) ---- */
    function emit(e, n, o) {
      var R = e.rng;
      for (var i = 0; i < n; i++) {
        var p = null, j;
        for (j = 0; j < pool.length; j++) if (!pool[j].on) { p = pool[j]; break; }
        if (!p) {   // pool full: recycle the particle closest to its end
          var best = -1, bl = 1e9; for (j = 0; j < pool.length; j++) if (pool[j].life < bl) { bl = pool[j].life; best = j; }
          if (best < 0) return; p = pool[best]; live--;
        }
        var a = o.angle != null ? o.angle + (R() - 0.5) * (o.spread == null ? 1.4 : o.spread) : R() * Math.PI * 2;
        var sp = (o.v[0] + R() * (o.v[1] - o.v[0])) * Math.sqrt(P.size), life = Math.round(o.life[0] + R() * (o.life[1] - o.life[0]));
        var sz = PR.size || [1, 2];
        p.on = true; p.x = e.x + (R() - 0.5) * (o.jitter || 2); p.y = e.y + (o.dy || 0) + (R() - 0.5) * (o.jitter || 2); p.ox = e.x; p.oy = e.y;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp * (o.flat || 0.85) + (o.vy || 0); p.g = o.g; p.drag = o.drag || 0.94; p.life = life; p.max = life;
        p.ramp = o.ramp; p.reach = e.reach + 2; p.owner = e.owner; p.from = e.from; p.size = Math.round(sz[0] + R() * (sz[1] - sz[0])) + (o.big && R() < 0.4 ? 1 : 0);
        live++;
      }
    }
    function sparkSpec(e, crit) {
      var ang = e.dir == null ? -Math.PI / 2 : e.dir, spread = e.dir == null ? Math.PI * 2 : 1.8;
      return { angle: e.dir == null ? null : ang, spread: spread, v: crit ? [1.4, 3.0] : [1.0, 2.4], life: crit ? [12, 24] : [10, 18], g: P.gravity, drag: 0.93, ramp: e.ramp, big: crit, vy: e.dir == null ? -0.6 : -0.3 };
    }

    /* ---- public: hit and burst ---- */
    function hit(x, y, o) {
      try {
        var pt = point(x, y, o); if (!pt) return null; o = pt[2];
        var crit = !!(o.crit || o.kind === 'crit'), el = elementOf(o.element), kind = KINDS.indexOf(o.kind) >= 0 ? o.kind : P.style;
        var want = P.reach * P.size * (crit ? 1.4 : 1);
        var e = { type: 'hit', x: pt[0], y: pt[1], age: 0, len: Math.round(P.life * (crit ? 1.35 : 1)), kind: kind, crit: crit, el: el, owner: o.target != null ? String(o.target) : null, no: ++spawnNo };
        e.rng = rng(hash(num(opt.seed, 1) | 0, e.no)); e.dir = dirOf(o); e.ramp = ramp(el || 'impact');
        e.from = o.from != null ? String(o.from) : null; e.reach = reachAt(e.x, e.y, e.owner, want, e.from); e.R = Math.min(Math.round(want * 0.7), e.reach); e.rot = e.rng() * 0.6;
        if (kind === 'auto') e.kind = e.dir != null ? 'slash' : 'star';
        add(e);
        var n = Math.round(P.sparks * (crit ? 1.75 : 1)); if (n) emit(e, n, sparkSpec(e, crit));
        if (P.hitstop > 0) call('onHitStop', crit ? P.hitstop * 2 : P.hitstop);
        if (crit) {
          if (P.shake > 0) call('onShake', P.shake, 200);
          if (P.critFlash === 'screen') flash = { age: 0, len: 3 };
          if (P.critFlash === 'host') call('onFlash', MO.flashMax || 0.35, 50);
        }
        return e.no;
      } catch (err) { warn('hit', 'hit failed: ' + (err && err.message)); return null; }
    }
    function burst(x, y, element, o) {
      try {
        if (x && typeof x === 'object') { o = (element && typeof element === 'object') ? element : o; element = y; y = o; }
        if (element && typeof element === 'object') { o = element; element = o.element; }
        var pt = point(x, y, o); if (!pt) return null; o = pt[2];
        var el = elementOf(element || o.element) || 'impact';
        var want = Math.round(20 * P.size * (o.big ? 1.3 : 1));
        var e = { type: 'burst', x: pt[0], y: pt[1], age: 0, el: el, owner: o.target != null ? String(o.target) : null, no: ++spawnNo, dir: null };
        e.rng = rng(hash((num(opt.seed, 1) | 0) + 977, e.no)); e.ramp = ramp(el);
        e.from = o.from != null ? String(o.from) : null; e.reach = reachAt(e.x, e.y, e.owner, want * 1.3, e.from);
        e.R = Math.max(8, Math.min(want, Math.round(e.reach / 1.2)));
        e.seq = sequence(el, e.R); e.len = e.seq.len; e.flip = e.rng() < 0.5;
        follow(e); add(e);
        return e.no;
      } catch (err) { warn('burst', 'burst failed: ' + (err && err.message)); return null; }
    }
    function add(e) { effects.push(e); if (effects.length > 32) effects.shift(); }
    function burstEmits(e) {
      var f = e.age, L = e.len, rp = e.ramp;
      if (e.el === 'fire') { if (f === 2) emit(e, 6, { v: [0.8, 1.8], life: [10, 16], g: P.gravity, ramp: rp, vy: -0.8 }); if (f === 6 || f === 14) emit(e, 5, { v: [0.1, 0.5], life: [28, 44], g: -0.04, drag: 0.97, ramp: rp, jitter: e.R, angle: -Math.PI / 2, spread: 2 }); }
      if (e.el === 'ice' && f === Math.round(L * 0.5)) emit(e, 12, { v: [1.0, 2.2], life: [14, 24], g: P.gravity, drag: 0.95, ramp: rp, big: true });
      if (e.el === 'thunder' && (f === 1 || f === Math.round(L * 0.3))) emit(e, 7, { v: [1.2, 2.6], life: [8, 16], g: P.gravity, drag: 0.92, ramp: rp, angle: -Math.PI / 2, spread: 2.6 });
      if (e.el === 'heal' && f < L * 0.6 && f % 6 === 3) emit(e, 2, { v: [0.1, 0.3], life: [24, 36], g: -0.05, drag: 0.97, ramp: rp, jitter: e.R * 1.2, dy: e.R * 0.4, angle: -Math.PI / 2, spread: 1 });
      if (e.el === 'impact' && f === 1) emit(e, 8, { v: [1.0, 2.2], life: [10, 18], g: P.gravity, ramp: rp });
    }

    /* ---- simulation: fixed 60 Hz steps on world time ---- */
    function tick() {
      frameNo++; obsCache = null;
      for (var i = effects.length - 1; i >= 0; i--) { var e = effects[i]; if (e.type === 'burst') { follow(e); burstEmits(e); } e.age++; if (e.age >= e.len) effects.splice(i, 1); }
      if (flash && ++flash.age >= flash.len) flash = null;
      if (!live) return;
      var obs = getObs();
      for (var j = 0; j < pool.length; j++) {
        var p = pool[j]; if (!p.on) continue;
        p.x += p.vx; p.y += p.vy; p.vx *= p.drag; p.vy = p.vy * p.drag + p.g;
        var dx = p.x - p.ox, dy = p.y - p.oy, dead = --p.life <= 0 || dx * dx + dy * dy > p.reach * p.reach;
        if (!dead) for (var k2 = 0; k2 < obs.length; k2++) { var o = obs[k2]; if ((p.owner != null && String(o.id) === p.owner) || (p.from != null && String(o.id) === p.from)) continue; if (p.x >= o.x - 1 && p.x < o.x + o.w + 1 && p.y >= o.y - 1 && p.y < o.y + o.h + 1 && distRect(p.ox, p.oy, o) > 0) { dead = true; break; } }
        if (dead) { p.on = false; live--; }
      }
    }
    function update(dt) {
      try {
        dt = num(dt, 0); if (!(dt > 0)) return;
        acc += Math.min(dt, 2000);
        while (acc >= FRAME - 1e-6) { acc -= FRAME; if (!effects.length && !live && !flash) { acc = acc % FRAME; break; } tick(); }
      } catch (err) { warn('update', 'update failed: ' + (err && err.message)); }
    }

    /* ---- drawing ---- */
    function frameCanvas(e, fi) {
      var seq = e.seq, ph = Math.floor(e.age / P.cycle) % 3, key = e.el + ':' + e.R + ':' + fi + ':' + ph + ':' + (e.flip ? 1 : 0), c = canvasCache[key];
      if (c) return c;
      c = mkCanvas(seq.w, seq.h); if (!c) return null;
      var g = c.getContext('2d'), img = g.createImageData(seq.w, seq.h), d = seq.frames[fi], rp = e.ramp.map(rgb);
      for (var i = 0; i < d.length; i++) {
        var L = d[i]; if (!L) continue;
        if (L >= 3 && L <= 5) L = 3 + ((L - 3 + ph) % 3);   // palette cycling: the three bright bands rotate; dark edge and white core stay
        var col = rp[L - 1], x = i % seq.w, y = (i / seq.w) | 0; if (e.flip) x = seq.w - 1 - x;
        var o = (y * seq.w + x) * 4; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      if (++cacheN > 1500) { canvasCache = {}; cacheN = 0; }
      return (canvasCache[key] = c);
    }
    function px(g, x, y, c, s) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), s || 1, s || 1); }
    // thunder: a bolt from the top of the view (at least 48 px above the target), redrawn every 3 frames, 2 px core + glow
    function drawBolt(g, e, top) {
      var f = e.age; if (f >= Math.round(e.len * 0.55)) return;
      var rp = e.ramp, x = Math.round(e.x), y = Math.round(e.y), seg = Math.floor(f / 3), amp = Math.min(10, Math.max(4, e.R * 0.4)), pts = [[x + Math.round((h01(seg, e.no) - 0.5) * amp), top]], k = 0;
      for (var yy = top; yy < y; k++) { yy = Math.min(y, yy + 6 + Math.round(h01(k + seg * 13, e.no + 3) * 6)); pts.push([yy >= y ? x : x + Math.round((h01(k + seg * 29, e.no + 5) - 0.5) * 2 * amp), yy]); }
      var hot = f < 3 || (f & 1) === 0, i, j, n;
      for (var pass = 0; pass < 3; pass++) for (i = 1; i < pts.length; i++) {
        var a = pts[i - 1], b = pts[i]; n = Math.max(1, Math.abs(b[1] - a[1]), Math.abs(b[0] - a[0]));
        for (j = 0; j <= n; j++) {
          var X = Math.round(a[0] + (b[0] - a[0]) * j / n), Y = Math.round(a[1] + (b[1] - a[1]) * j / n);
          if (pass === 0) { if ((X + Y + f) & 1) { px(g, X - 3, Y, rp[1]); px(g, X + 3, Y, rp[1]); } }
          else if (pass === 1) { px(g, X - 2, Y, rp[2], 1); px(g, X + 2, Y, rp[3]); px(g, X - 1, Y, rp[3]); }
          else { g.fillStyle = hot ? rp[5] : rp[4]; g.fillRect(X, Y, 2, 1); }
        }
      }
      if (f < 8 && pts.length > 3) { var fk = pts[2], d2 = fk[0] < x ? -1 : 1; for (j = 1; j < 10; j++) px(g, fk[0] + d2 * j, fk[1] + Math.round(j * 0.8) + (j % 3 === 0 ? 1 : 0), j < 4 ? rp[4] : rp[3]); }
    }
    function anchorXY(id) {
      if (typeof opt.getAnchor !== 'function') return null;
      try { var a = opt.getAnchor(id); if (!a || !isFinite(+a.x)) return null; var y = a.top != null && a.h ? +a.top + a.h / 2 : +a.y; return isFinite(y) ? [+a.x, y] : null; } catch (err) { return null; }
    }
    function follow(e) {   // bursts ride along with their target (bob, drift) when the game gives getAnchor
      if (e.type !== 'burst' || e.owner == null) return;
      var a = anchorXY(e.owner); if (!a) return;
      if (!e.base) { e.base = a; e.x0 = e.x; e.y0 = e.y; return; }
      var dx = a[0] - e.base[0], dy = a[1] - e.base[1]; if (Math.abs(dx) > 64 || Math.abs(dy) > 64) return;   // a teleport (death, respawn): stay put
      e.x = e.x0 + dx; e.y = e.y0 + dy;
    }
    function drawHit(g, e) {
      var q = e.age / e.len, qg = (e.age + 1) / e.len, f = e.age, R = e.R, rp = e.ramp, x = Math.round(e.x), y = Math.round(e.y), i, d;
      if (e.crit && f < 3) {   // 2-3 frame white flash at the contact point
        var fr = Math.round(R * (f === 0 ? 0.6 : f === 1 ? 0.45 : 0.3)), th = f === 0 ? 2 : 1, dg = Math.round(fr * 0.45); g.fillStyle = rp[5];
        g.fillRect(x - fr, y - th + 1, fr * 2 + 1, th * 2 - 1); g.fillRect(x - th + 1, y - fr, th * 2 - 1, fr * 2 + 1);
        for (var yy = 1; yy <= dg; yy++) { g.fillRect(x + yy, y + yy, 1, 1); g.fillRect(x - yy, y - yy, 1, 1); g.fillRect(x + yy, y - yy, 1, 1); g.fillRect(x - yy, y + yy, 1, 1); }
        g.fillRect(x - 3, y - 3, 7, 7);
      }
      if (e.kind === 'slash') {
        var head = Math.min(1, qg / 0.28), u = Math.cos(e.dir), v = Math.sin(e.dir), nx = -v, ny = u, Lh = R * 1.1, lines = e.crit ? [0, 3] : [0];
        for (var li = 0; li < lines.length; li++) for (var kk = 0; kk <= 28; kk++) {
          var s = kk / 28; if (s > head) break; var tail = head - s; if (q > 0.3 && tail > 1 - (q - 0.3) / 0.7) continue;
          var t = s * 2 - 1, bend = (1 - t * t) * R * 0.28, X = x + u * t * Lh + nx * (bend + lines[li]), Y = y + v * t * Lh + ny * (bend + lines[li]);
          var c = tail < 0.12 ? rp[5] : tail < 0.35 ? rp[4] : tail < 0.65 ? rp[3] : rp[2]; if (tail > 0.7 && (kk & 1)) continue;
          if (tail < 0.5) px(g, X - nx, Y - ny, rp[1]);   // dark under-edge keeps the streak readable on light sprites
          px(g, X - (tail < 0.15 && !li ? 1 : 0), Y - (tail < 0.15 && !li ? 1 : 0), c, tail < 0.15 && !li ? 3 : tail < 0.7 ? 2 : 1);
        }
        if (f < 4) for (i = 0; i < 4; i++) { var a0 = e.dir + Math.PI / 2 + i * Math.PI / 2; for (d = 1; d <= 3 + f; d++) px(g, x + Math.cos(a0) * d, y + Math.sin(a0) * d, d < 3 ? rp[5] : rp[3]); }
      }
      if (e.kind === 'star' || (e.crit && e.kind !== 'ring')) {
        var R0 = Math.round(R * 0.85 * Math.min(1, qg * 3.2) * (q > 0.55 ? 1 - (q - 0.55) * 1.6 : 1)), dark = q > 0.5 ? 1 : 0;
        if (R0 > 1) for (i = 0; i < 8; i++) { var an = i * Math.PI / 4 + e.rot, len = Math.round(i % 2 ? R0 : R0 * 0.55), r1 = q < 0.5 ? 1 : Math.round(len * 0.45); for (d = r1; d <= len; d++) px(g, x + Math.cos(an) * d, y + Math.sin(an) * d, d > len - 2 ? rp[2 - dark] : d > len * 0.5 ? rp[4 - dark] : rp[5 - dark]); }
        if (q < 0.4) { g.fillStyle = rp[5]; g.fillRect(x - 2, y - 1, 5, 3); g.fillRect(x - 1, y - 2, 3, 5); }
      }
      if (e.kind === 'spark') {
        var L = Math.round(Math.sin(Math.min(1, qg * 1.6) * Math.PI) * R * 0.6);
        if (L > 0) { g.fillStyle = rp[4]; g.fillRect(x - L, y, L * 2 + 1, 1); g.fillRect(x, y - L, 1, L * 2 + 1); var dg = Math.round(L * 0.6); for (i = 1; i <= dg; i++) { px(g, x + i, y + i, rp[3]); px(g, x - i, y - i, rp[3]); px(g, x + i, y - i, rp[3]); px(g, x - i, y + i, rp[3]); } g.fillStyle = rp[5]; g.fillRect(x - 1, y - 1, 3, 3); }
      }
      if (e.kind === 'ring' || e.crit) {
        var rr = 2 + (R - 2) * (1 - (1 - qg) * (1 - qg)), n = Math.max(12, Math.ceil(rr * 6.4)), col = q < 0.3 ? rp[5] : q < 0.6 ? rp[4] : rp[2];
        for (i = 0; i < n; i++) { if (q > 0.5 && (i & 1)) continue; var aa = i / n * Math.PI * 2; px(g, x + Math.cos(aa) * rr, y + Math.sin(aa) * rr * (e.kind === 'ring' ? 1 : 0.8), col); if (e.crit && q < 0.4) px(g, x + Math.cos(aa) * (rr - 1), y + Math.sin(aa) * (rr - 1) * 0.8, rp[3]); }
      }
    }
    function drawParticles(g) {
      var shape = PR.shape || 'square', glow = +PR.glow || 0, snap = pixel || PR.snap;
      for (var i = 0; i < pool.length; i++) {
        var p = pool[i]; if (!p.on) continue;
        var f = 1 - p.life / p.max, ci = clamp(5 - Math.floor(f * 4.5), 1, 5), c = p.ramp[ci], s = p.size, x = snap ? Math.round(p.x) : p.x, y = snap ? Math.round(p.y) : p.y;
        if (!pixel) g.globalAlpha = root.GameDNA_Skin && SK ? root.GameDNA_Skin.motion.fade(skin, 1 - f * f) : 1 - f * f;
        if (glow > 0) { var ga = g.globalAlpha; g.globalAlpha = ga * glow * 0.4; g.fillStyle = c; g.beginPath(); g.arc(x, y, s * 2.5, 0, Math.PI * 2); g.fill(); g.globalAlpha = ga; }
        if (shape === 'circle' || shape === 'blob' || shape === 'petal') { g.fillStyle = c; g.beginPath(); g.arc(x, y, Math.max(0.6, s * 0.7), 0, Math.PI * 2); g.fill(); }
        else if (shape === 'stroke') { g.strokeStyle = c; g.lineWidth = Math.max(1, s * 0.6); g.beginPath(); g.moveTo(x - p.vx * 2, y - p.vy * 2); g.lineTo(x, y); g.stroke(); }
        else { g.fillStyle = c; g.fillRect(x - (s >> 1), y - (s >> 1), s, s); if (f < 0.4 && (Math.abs(p.vx) + Math.abs(p.vy)) > 0.8) px(g, x - p.vx, y - p.vy, p.ramp[ci - 1 < 1 ? 1 : ci - 1]); }
      }
      g.globalAlpha = 1;
    }
    function draw(ctx, ox, oy) {
      drawnRects = [];
      if (!ctx || typeof ctx.drawImage !== 'function') return;
      ox = num(ox, 0); oy = num(oy, 0); lastOff = [ox, oy];
      if (!effects.length && !live && !flash) return;
      try {
        var tr = ctx.getTransform ? ctx.getTransform() : { a: 1 }, ks = Math.max(1, Math.round(Math.abs(tr.a) || 1));
        var V = view || { x: 0, y: 0, w: Math.round(ctx.canvas.width / ks), h: Math.round(ctx.canvas.height / ks) };
        if (!layer) { layer = mkCanvas(V.w * ks, V.h * ks); if (!layer) return; lctx = layer.getContext('2d'); }
        if (layer.width !== V.w * ks || layer.height !== V.h * ks) { layer.width = V.w * ks; layer.height = V.h * ks; }
        var g = lctx;
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, layer.width, layer.height);
        g.imageSmoothingEnabled = !pixel;
        g.setTransform(ks, 0, 0, ks, (ox - V.x) * ks, (oy - V.y) * ks);   // world -> layer
        for (var i = 0; i < effects.length; i++) {
          var e = effects[i];
          if (e.type === 'burst') {
            if (e.el === 'thunder') drawBolt(g, e, Math.min(Math.round(e.y) - 48, V.y - oy));
            var fi = Math.min(e.seq.n - 1, e.age >> 1), c = frameCanvas(e, fi);
            if (c) g.drawImage(c, Math.round(e.x) - (e.flip ? e.seq.w - 1 - e.seq.cx : e.seq.cx), Math.round(e.y) - e.seq.cy);
            drawnRects.push({ x: Math.round(e.x) - e.seq.cx + ox, y: Math.round(e.y) - e.seq.cy + oy, w: e.seq.w, h: e.seq.h, owner: e.owner, kind: 'burst:' + e.el });
          } else {
            drawHit(g, e);
            drawnRects.push({ x: e.x - e.R + ox, y: e.y - e.R + oy, w: e.R * 2 + 1, h: e.R * 2 + 1, owner: e.owner, kind: 'hit:' + e.kind + (e.crit ? ':crit' : '') });
          }
        }
        drawParticles(g);
        g.setTransform(ks, 0, 0, ks, -V.x * ks, -V.y * ks);   // screen -> layer
        if (flash) { g.globalAlpha = (MO.flashMax || 0.35) * [1, 0.6, 0.3][flash.age] ; g.fillStyle = (skin.palette && skin.palette.fx && skin.palette.fx.white) || '#ffffff'; g.fillRect(V.x, V.y, V.w, V.h); g.globalAlpha = 1; }
        var ui = uiList(); for (var u = 0; u < ui.length; u++) g.clearRect(ui[u].x, ui[u].y, ui[u].w, ui[u].h);
        ctx.save();
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = PR.blend === 'lighter' && !pixel ? 'lighter' : 'source-over'; ctx.imageSmoothingEnabled = !pixel;
        ctx.drawImage(layer, 0, 0, layer.width, layer.height, V.x, V.y, V.w, V.h);
        ctx.restore();
      } catch (err) { warn('draw', 'draw failed: ' + (err && err.message)); try { ctx.restore(); } catch (e2) {} }
    }

    return {
      hit: hit, burst: burst, update: update, draw: draw, setParams: setParams,
      clear: function () { effects.length = 0; for (var i = 0; i < pool.length; i++) pool[i].on = false; live = 0; flash = null; acc = 0; },
      count: function () { return effects.length; },
      particles: function () { return live; },
      busy: function () { return !!(effects.length || live || flash); },
      lastDrawn: function () { return drawnRects.slice(); },
      params: function () { var o = {}; for (var key in P) o[key] = P[key]; return o; },
      skin: function () { return skin.id; }
    };
  }

  root.GameDNA_HitSparks = { create: create, DEFAULTS: DEFAULTS, KINDS: KINDS, ELEMENTS: ['fire', 'ice', 'thunder', 'heal'], version: VERSION };
})(typeof window !== 'undefined' ? window : this);
