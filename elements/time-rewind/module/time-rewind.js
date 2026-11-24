/* GameDNA E-16 Time rewind (time-rewind.js) v1.0.0
 * One plain script, no dependencies, no import/export. One global: GameDNA_TimeRewind.
 *
 * Hold a key (default R) or the touch button and the world runs backwards: every fixed step the module records a deep
 * copy of the game's state into a ring buffer; while the key is held it restores older copies, 1x-3x as fast as the game
 * ran, and draws a rewind filter (desaturate, tint, scanlines, a soft ripple and a rolling band), a "REWIND" indicator
 * and a history scrubber. On release the game simply continues from the restored state: newer copies are dropped.
 *
 *   var rw = GameDNA_TimeRewind.create({
 *     snapshot: function () { return { world: STATE, rng: rngState }; },   // live refs are fine: the module deep-copies
 *     restore:  function (s) { STATE = s.world; rngState = s.rng; },       // s is a fresh copy: keep it
 *     canRecord: function () { return scene === 'play' && !menuOpen; },
 *     view: { w: 640, h: 360 }, canvas: canvasEl, uiRects: function () { return [hudRect]; },
 *     params: { speed: 2, seconds: 6, energy: 'meter' }
 *   });
 *   // fixed step, after input is read, before the world moves:   if (rw.step(STEP_MS)) return;
 *   // end of render, after the HUD:                               rw.draw(ctx);
 *   // new game / level / respawn-to-title:                        rw.clear();
 *
 * Deterministic: no Math.random, no wall clock; effects advance in step(), so ?t=&freeze=1 stills repeat exactly.
 * ASCII only.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var DEF = {
    seconds: 6, speed: 2, energy: 'meter', meter: 3, charges: 3, recharge: 6,
    filter: 'full', ripple: 0.5, scanlines: 0.5, tint: 'cool', hud: 'auto', render: 'auto',
    reduced: 'system', touch: 'auto', key: 'r', hint: 'on'
  };
  var TINTS = {
    cool: { c: '#5aa8ff', a: '#9be7ff', b: '#3d5cff', warn: '#ffb04a' },
    sepia: { c: '#d39a52', a: '#ffd58a', b: '#a8642c', warn: '#ff7a5a' },
    violet: { c: '#9b74ff', a: '#dcc4ff', b: '#6a3df0', warn: '#ffb04a' },
    mono: { c: '#b9c2d4', a: '#f2f5fb', b: '#7d889c', warn: '#ffb04a' }
  };
  /* 3x5 pixel font (rows top to bottom, 3 chars each) for native pixel canvases */
  var PF = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
    K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
    '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111',
    '9': '111101111001110', '.': '000000000000010', '-': '000000111000000', ':': '000010000010000', '+': '000010111010000',
    'x': '000101010101000', ' ': '000000000000000'
  };

  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function str(v, d, list) { v = v == null || v === '' ? d : String(v); return list && list.indexOf(v) < 0 ? d : v; }
  function hash(a, b) { var h = Math.imul((a | 0) * 374761393 + (b | 0) * 668265263, 3266489917); h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function warn(m) { try { if (root.console) root.console.warn('[GameDNA_TimeRewind] ' + m); } catch (e) { /* ignore */ } }

  /* ---------------- deep copy ----------------
   * Plain objects, class instances (prototype kept), arrays, typed arrays, Map, Set, Date. Shared references and cycles
   * stay shared in the copy. Functions, DOM nodes, canvases, images, contexts, audio and other host objects are kept by
   * reference (opaque). `size` accumulates an estimate of the bytes the copy holds. */
  function isOpaque(v) {
    if (typeof v !== 'object' || v === null) return false;
    if (typeof v.nodeType === 'number' && typeof v.nodeName === 'string') return true;     // DOM node, canvas, image
    if (typeof v.getContext === 'function' || typeof v.drawImage === 'function') return true;
    if (typeof v.decode === 'function' && 'naturalWidth' in v) return true;
    if (typeof root.ImageBitmap !== 'undefined' && v instanceof root.ImageBitmap) return true;
    if (typeof root.AudioNode !== 'undefined' && v instanceof root.AudioNode) return true;
    if (typeof root.AudioContext !== 'undefined' && v instanceof root.AudioContext) return true;
    if (typeof root.Window !== 'undefined' && v instanceof root.Window) return true;
    if (typeof v.then === 'function') return true;                                            // promises
    var tg = Object.prototype.toString.call(v);
    if (tg === '[object WeakMap]' || tg === '[object WeakSet]' || tg === '[object Promise]') return true;
    return false;
  }
  function Copier() { this.seen = new Map(); this.bytes = 0; }
  Copier.prototype.copy = function (v) {
    var t = typeof v;
    if (t === 'number') { this.bytes += 8; return v; }
    if (t === 'string') { this.bytes += 16 + v.length * 2; return v; }
    if (t !== 'object' || v === null) { this.bytes += 4; return v; }                         // boolean, undefined, function, symbol, bigint
    if (isOpaque(v)) { this.bytes += 8; return v; }
    var hit = this.seen.get(v); if (hit !== undefined) { this.bytes += 8; return hit; }
    var out, i, k, keys;
    if (Array.isArray(v)) {
      out = new Array(v.length); this.seen.set(v, out); this.bytes += 32 + v.length * 8;
      for (i = 0; i < v.length; i++) if (i in v) out[i] = this.copy(v[i]);
      return out;
    }
    if (ArrayBuffer.isView(v)) { out = v.slice ? v.slice() : new v.constructor(v); this.seen.set(v, out); this.bytes += 64 + v.byteLength; return out; }
    if (Object.prototype.toString.call(v) === '[object ArrayBuffer]') { out = v.slice(0); this.seen.set(v, out); this.bytes += 64 + v.byteLength; return out; }
    var tag = Object.prototype.toString.call(v);   // realm-safe (frames, workers)
    if (tag === '[object Date]') { out = new Date(v.getTime()); this.seen.set(v, out); this.bytes += 24; return out; }
    if (tag === '[object Map]') { out = new Map(); this.seen.set(v, out); this.bytes += 48; var self = this; v.forEach(function (val, key) { out.set(self.copy(key), self.copy(val)); }); return out; }
    if (tag === '[object Set]') { out = new Set(); this.seen.set(v, out); this.bytes += 48; var me = this; v.forEach(function (val) { out.add(me.copy(val)); }); return out; }
    out = Object.create(Object.getPrototypeOf(v)); this.seen.set(v, out);
    keys = Object.keys(v); this.bytes += 40 + keys.length * 16;
    for (i = 0; i < keys.length; i++) { k = keys[i]; out[k] = this.copy(v[k]); }
    return out;
  };
  function deepClone(v) { var c = new Copier(); var out = c.copy(v); return { v: out, bytes: c.bytes }; }
  function kindOf(v) {
    if (typeof v !== 'object' || v === null || isOpaque(v)) return '';
    if (Array.isArray(v)) return 'array';
    if (ArrayBuffer.isView(v)) return '';
    var tg = Object.prototype.toString.call(v);
    if (tg === '[object ArrayBuffer]' || tg === '[object Date]' || tg === '[object Map]' || tg === '[object Set]') return '';
    return 'object';
  }
  /* write snapshot value `s` INTO live container `live` (same kind), keeping the identity of live objects where the shape
     matches, so references the game holds elsewhere (closures, caches) stay valid. Everything written is a fresh copy. */
  function assignInto(live, s, seen, cp) {
    seen.set(s, live);
    var i, k, keys, lk;
    if (Array.isArray(s)) {
      live.length = s.length;
      for (i = 0; i < s.length; i++) live[i] = into(live[i], s[i], seen, cp);
      return live;
    }
    keys = Object.keys(live);
    for (i = 0; i < keys.length; i++) if (!Object.prototype.hasOwnProperty.call(s, keys[i])) delete live[keys[i]];
    keys = Object.keys(s);
    for (i = 0; i < keys.length; i++) { k = keys[i]; lk = live[k]; live[k] = into(lk, s[k], seen, cp); }
    return live;
  }
  function into(liveV, sV, seen, cp) {
    var ks = kindOf(sV);
    if (!ks) return cp.copy(sV);
    var hit = seen.get(sV); if (hit !== undefined) return hit;
    if (ks === kindOf(liveV) && (ks === 'array' || Object.getPrototypeOf(liveV) === Object.getPrototypeOf(sV))) return assignInto(liveV, sV, seen, cp);
    var fresh = cp.copy(sV); seen.set(sV, fresh); return fresh;
  }

  /* ---------------- instance ---------------- */
  function create(o) {
    o = o || {};
    var P = {}, pk;
    for (pk in DEF) P[pk] = DEF[pk];
    var src = o.params || {};
    for (pk in src) if (src[pk] != null && src[pk] !== '') P[pk] = src[pk];
    function norm() {
      P.seconds = clamp(num(P.seconds, DEF.seconds), 0.5, 60);
      P.speed = clamp(num(P.speed, DEF.speed), 0.25, 4);
      P.energy = str(P.energy, DEF.energy, ['meter', 'charges', 'free']);
      P.meter = clamp(num(P.meter, DEF.meter), 0.25, 60);
      P.charges = clamp(Math.round(num(P.charges, DEF.charges)), 1, 9);
      P.recharge = clamp(num(P.recharge, DEF.recharge), 0, 120);
      P.filter = str(P.filter, DEF.filter, ['full', 'light', 'off']);
      P.ripple = clamp(num(P.ripple, DEF.ripple), 0, 1);
      P.scanlines = clamp(num(P.scanlines, DEF.scanlines), 0, 1);
      P.tint = str(P.tint, DEF.tint, ['cool', 'sepia', 'violet', 'mono']);
      P.hud = str(P.hud, DEF.hud, ['auto', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'off']);
      P.render = str(P.render, DEF.render, ['auto', 'smooth', 'pixel']);
      P.reduced = str(P.reduced, DEF.reduced, ['system', 'on', 'off']);
      P.touch = str(P.touch, DEF.touch, ['auto', 'on', 'off']);
      P.key = P.key == null || P.key === '' ? 'r' : String(P.key);
      P.hint = str(P.hint, DEF.hint, ['on', 'off']);
    }
    norm();

    var stepMsDef = num(o.stepMs, 1000 / 60);
    var stride = Math.max(1, Math.round(num(o.stride, 1)));
    var maxBytes = Math.max(1e5, num(o.maxBytes, 32 * 1024 * 1024));
    var SK = null;
    try { SK = (o.skin == null || o.skin === false || !root.GameDNA_Skin) ? null : root.GameDNA_Skin.resolve(o.skin); } catch (e) { SK = null; }
    var sysReduced = false;
    try { sysReduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { sysReduced = false; }
    var coarse = false;
    try { coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches); } catch (e) { coarse = false; }

    /* ring buffer of entries {s: copy, n: serial, b: bytes} */
    var cap = 0, buf = [], head = 0, count = 0, bytes = 0, serial = 0;
    function capFor() { return Math.max(2, Math.ceil(P.seconds * 1000 / (stepMsDef * stride))); }
    function resize() {
      var c = capFor(); if (c === cap) return;
      var keep = [], i;
      for (i = Math.max(0, count - c); i < count; i++) keep.push(buf[(head + i) % cap]);
      cap = c; buf = new Array(cap); head = 0; count = keep.length; bytes = 0;
      for (i = 0; i < keep.length; i++) { buf[i] = keep[i]; bytes += keep[i].b; }
    }
    function idx(i) { return (head + i) % cap; }
    function dropOldest() { if (!count) return; var e = buf[head]; bytes -= e.b; buf[head] = null; head = (head + 1) % cap; count--; if (cursor > 0) cursor--; }
    function push(entry) {
      if (count === cap) dropOldest();
      buf[idx(count)] = entry; count++; bytes += entry.b;
      while (bytes > maxBytes && count > 2) dropOldest();
    }
    function truncate(newest) {   // keep entries 0..newest
      while (count - 1 > newest) { var j = idx(count - 1); bytes -= buf[j].b; buf[j] = null; count--; }
    }

    /* host access */
    var mode = typeof o.snapshot === 'function' && typeof o.restore === 'function' ? 'snapshot' : typeof o.targets === 'function' ? 'targets' : 'none';
    if (mode === 'none') warn('create(): pass snapshot() + restore(s), or targets(); nothing will be recorded');
    var errors = 0;
    function call(fn, a, d) { if (typeof fn !== 'function') return d; try { return fn(a); } catch (e) { errors++; if (errors < 4) warn('callback failed: ' + (e && e.message)); return d; } }
    function copyIn(raw) { return deepClone(raw); }
    function copyOut(s) { return deepClone(s).v; }
    function grab() {
      var raw;
      if (mode === 'snapshot') raw = call(o.snapshot, undefined, undefined);
      else if (mode === 'targets') { raw = call(o.targets, undefined, null); if (!Array.isArray(raw)) raw = raw == null ? [] : [raw]; }
      else return null;
      var c = copyIn(raw);
      serial++;
      return { s: c.v, n: serial, b: c.bytes + 48 };
    }
    function restoreEntry(e) {
      if (!e) return false;
      if (mode === 'snapshot') { call(o.restore, copyOut(e.s)); }
      else if (mode === 'targets') {
        var live = call(o.targets, undefined, null); if (!Array.isArray(live)) live = live == null ? [] : [live];
        var cp = new Copier(), seen = new Map();
        for (var i = 0; i < e.s.length && i < live.length; i++) {
          if (kindOf(live[i]) && kindOf(live[i]) === kindOf(e.s[i])) { try { assignInto(live[i], e.s[i], seen, cp); } catch (er) { errors++; } }
        }
      }
      restores++; restoredSerial = e.n;
      call(o.onRestore, { serial: e.n, cursor: cursor });
      return true;
    }

    /* state */
    var keyHeld = false, ptrHeld = false, hostHeld = false, ptrId = null, touchSeen = false;
    var rewinding = false, cursor = -1, acc = 0, atEnd = false, lockUntilUp = false, pushSkip = false;
    var energy = 1, charges = P.charges, chargeT = 0;
    var fx = 0, fxClock = 0, snapT = 0, denyT = 0, endT = 0, startCount = 0, startCursor = 0;
    var steps = 0, records = 0, restores = 0, rewindSteps = 0, rewoundMs = 0, restoredSerial = 0, sessions = 0, blockedSteps = 0, lastMs = 0;
    var lastRelease = null, drawnRects = [], live = false;
    resize();

    function heldNow() { return keyHeld || ptrHeld || hostHeld; }
    function reducedOn() { return P.reduced === 'on' || (P.reduced === 'system' && sysReduced); }
    function canRec() { return typeof o.canRecord === 'function' ? !!call(o.canRecord, undefined, false) : true; }
    function canStart() {
      if (count < 1) return false;
      if (P.energy === 'meter') return energy > 0.06;
      if (P.energy === 'charges') return charges >= 1;
      return true;
    }
    function begin() {
      var e = grab(); if (e) { push(e); records++; }
      if (!count) return false;
      if (P.energy === 'charges') charges--;
      rewinding = true; cursor = count - 1; acc = 0; atEnd = false; sessions++; rewoundMs = 0; rewindSteps = 0;
      startCount = count; startCursor = cursor;
      call(o.onStart, { frames: count });
      return true;
    }
    function finish(why) {
      if (!rewinding) return;
      truncate(cursor);
      rewinding = false; atEnd = false; snapT = 1; pushSkip = true;
      lastRelease = { serial: restoredSerial, cursor: cursor, steps: rewindSteps, ms: Math.round(rewoundMs), why: why };
      call(o.onEnd, lastRelease);
    }

    /* the gate: returns true when this step was a rewind step (the game must not run its update) */
    function step(dt) {
      var ms = num(dt, stepMsDef); if (!(ms >= 0)) ms = stepMsDef;
      lastMs = ms;
      steps++;
      var rec = mode !== 'none' && canRec();
      live = rec;
      if (P.energy === 'meter' && !rewinding && rec && P.recharge > 0) energy = Math.min(1, energy + ms / (P.recharge * 1000));
      if (P.energy === 'charges' && charges < P.charges && rec && P.recharge > 0) { chargeT += ms / (P.recharge * 1000); if (chargeT >= 1) { chargeT = 0; charges++; } }
      if (P.energy === 'free') energy = 1;
      var held = heldNow();
      if (!held) lockUntilUp = false;
      if (snapT > 0) snapT = Math.max(0, snapT - 0.09);
      if (denyT > 0) denyT = Math.max(0, denyT - 0.05);
      if (endT > 0) endT = Math.max(0, endT - 0.05);
      if (!rec) {
        if (rewinding) finish('blocked');
        if (held) blockedSteps++;
        fx = Math.max(0, fx - 0.12); if (fx > 0) fxClock++;
        return false;
      }
      if (held && !rewinding && !lockUntilUp) {
        if (canStart()) { if (!begin()) lockUntilUp = true; }
        else { lockUntilUp = true; denyT = 1; call(o.onBlocked, { energy: energy, charges: charges }); }
      }
      if (rewinding && (!held || (P.energy === 'meter' && energy <= 0))) {
        if (held) { lockUntilUp = true; denyT = 1; }
        finish(held ? 'empty' : 'release');
      }
      if (rewinding) {
        fx = Math.min(1, fx + 0.2); fxClock++;
        if (P.energy === 'meter') energy = Math.max(0, energy - ms / (P.meter * 1000));
        acc += P.speed / stride;
        var n = Math.floor(acc + 1e-9); acc -= n;
        rewindSteps++;
        if (n > 0) {
          var to = Math.max(0, cursor - n);
          if (to === cursor) { atEnd = true; endT = 1; }
          else { rewoundMs += (cursor - to) * stride * ms; cursor = to; atEnd = to === 0; restoreEntry(buf[idx(cursor)]); }
        }
        return true;
      }
      fx = Math.max(0, fx - 0.12); if (fx > 0) fxClock++;
      if (pushSkip) { pushSkip = false; return false; }   // the restored state is already the newest entry
      if (steps % stride === 0 || count === 0) { var e2 = grab(); if (e2) { push(e2); records++; } }
      return false;
    }

    /* ---------------- input ---------------- */
    var KEY = P.key.toLowerCase();
    function keyMatch(e) {
      var k = (e.key || '').toLowerCase(), c = e.code || '';
      if (KEY === 'shift') return k === 'shift';
      if (KEY === 'backspace') return k === 'backspace';
      return k === KEY || c.toLowerCase() === 'key' + KEY;
    }
    var listeners = [];
    function on(t, ev, fn, opt) { try { t.addEventListener(ev, fn, opt); listeners.push([t, ev, fn, opt]); } catch (e) { /* no DOM */ } }
    if (o.keyboard !== false && root.addEventListener) {
      on(root, 'keydown', function (e) { if (keyMatch(e)) keyHeld = true; });
      on(root, 'keyup', function (e) { if (keyMatch(e)) keyHeld = false; });
      on(root, 'blur', function () { keyHeld = false; ptrHeld = false; ptrId = null; });
    }
    var canvasEl = o.canvas || null;
    function touchOn() { return P.touch === 'on' || (P.touch === 'auto' && (coarse || touchSeen)); }
    function toLogical(e) {
      if (!canvasEl || !canvasEl.getBoundingClientRect) return null;
      var r = canvasEl.getBoundingClientRect(), V = view();
      if (!r.width || !r.height) return null;
      return { x: (e.clientX - r.left) / r.width * V.w, y: (e.clientY - r.top) / r.height * V.h };
    }
    function inButton(p) { var b = buttonRect(); if (!b || !p) return false; var dx = p.x - b.cx, dy = p.y - b.cy; return dx * dx + dy * dy <= b.r * b.r * 1.3; }
    if (canvasEl && root.addEventListener) {
      on(root, 'pointerdown', function (e) {
        if (e.pointerType === 'touch') touchSeen = true;
        if (!touchOn() || ptrHeld) return;
        var p = toLogical(e); if (!inButton(p)) return;
        ptrHeld = true; ptrId = e.pointerId;
        try { e.preventDefault(); e.stopPropagation(); } catch (er) { /* ignore */ }
      }, { capture: true, passive: false });
      var up = function (e) { if (ptrHeld && e.pointerId === ptrId) { ptrHeld = false; ptrId = null; try { e.stopPropagation(); } catch (er) { /* ignore */ } } };
      on(root, 'pointerup', up, { capture: true }); on(root, 'pointercancel', up, { capture: true });
    }

    /* ---------------- layout ---------------- */
    function view() {
      var v = typeof o.view === 'function' ? call(o.view, undefined, null) : o.view;
      var w = num(v && v.w, 0), h = num(v && v.h, 0);
      if (!(w > 0 && h > 0)) { w = canvasEl ? canvasEl.width : 640; h = canvasEl ? canvasEl.height : 360; }
      return { w: w, h: h };
    }
    function pixelMode(ctx) {
      if (P.render === 'pixel') return true;
      if (P.render === 'smooth') return false;
      if (SK && SK.pixel) return true;
      var V = view(); return V.h <= 270 || (ctx && ctx.imageSmoothingEnabled === false && V.h <= 300);
    }
    function uScale(V, px) { return px ? Math.max(1, Math.round(V.h / 180)) : V.h / 360; }
    function hits(a, list) {
      for (var i = 0; i < list.length; i++) { var b = list[i]; if (b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) return true; }
      return false;
    }
    function uiList() { var r = call(o.uiRects, undefined, null); return Array.isArray(r) ? r.filter(function (q) { return q && q.w > 0 && q.h > 0; }) : []; }
    function meterSize(V, px) {
      var u = uScale(V, px);
      if (px) return { w: (P.energy === 'charges' ? 8 + P.charges * 6 : 44) * u, h: 9 * u, u: u };
      return { w: (P.energy === 'charges' ? 50 + P.charges * 15 : 118) * u, h: 26 * u, u: u };
    }
    function corners(V, s, m) {
      return {
        'top-right': { x: V.w - m - s.w, y: m, w: s.w, h: s.h }, 'top-left': { x: m, y: m, w: s.w, h: s.h },
        'bottom-right': { x: V.w - m - s.w, y: V.h - m - s.h, w: s.w, h: s.h }, 'bottom-left': { x: m, y: V.h - m - s.h, w: s.w, h: s.h }
      };
    }
    function meterRect(px) {
      if (P.hud === 'off' || (P.energy === 'free' && P.hint === 'off')) return null;
      var V = view(), s = meterSize(V, px), m = px ? 3 * s.u : 12 * s.u, C = corners(V, s, m), ui = uiList(), b = buttonRect();
      if (b) ui = ui.concat([{ x: b.cx - b.r - 4, y: b.cy - b.r - 4, w: b.r * 2 + 8, h: b.r * 2 + 8 }]);
      if (P.hud !== 'auto') return C[P.hud];
      var order = ['top-right', 'bottom-right', 'bottom-left', 'top-left'];
      for (var i = 0; i < order.length; i++) if (!hits(C[order[i]], ui)) return C[order[i]];
      return C['top-right'];
    }
    function buttonRect() {
      if (!touchOn()) return null;
      var V = view(), r = Math.round(V.h * 0.075), m = Math.round(V.h * 0.05);
      return { cx: V.w - m - r, cy: V.h - m - r - Math.round(V.h * 0.1), r: r };
    }

    /* ---------------- drawing ---------------- */
    var scr = null, scanPat = null, scanKey = '';
    function scratch(w, h) {
      if (!root.document) return null;
      if (!scr) scr = root.document.createElement('canvas');
      if (scr.width !== w || scr.height !== h) { scr.width = w; scr.height = h; }
      return scr;
    }
    function tint() { return TINTS[P.tint] || TINTS.cool; }
    function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
    function pxText(ctx, s, x, y, u, col, align) {
      s = String(s).toUpperCase().replace(/\u00d7/g, 'x');
      var w = s.length * 4 * u - u;
      if (align === 'center') x -= Math.round(w / 2); else if (align === 'right') x -= w;
      x = Math.round(x); y = Math.round(y);
      ctx.fillStyle = col;
      for (var i = 0; i < s.length; i++) {
        var g = PF[s[i]] || PF[s[i].toUpperCase()] || PF[' '];
        for (var b = 0; b < 15; b++) if (g.charCodeAt(b) === 49) ctx.fillRect(x + i * 4 * u + (b % 3) * u, y + Math.floor(b / 3) * u, u, u);
      }
      return w;
    }
    function pxTextShadow(ctx, s, x, y, u, col, sh, align) { pxText(ctx, s, x + u, y + u, u, sh, align); return pxText(ctx, s, x, y, u, col, align); }
    var FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    function hdText(ctx, s, x, y, size, col, align, weight, track) {
      ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT;
      ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
      try { ctx.letterSpacing = (track || 0) + 'px'; } catch (e) { /* older canvas */ }
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(s, x, y + Math.max(1, size * 0.08));
      ctx.fillStyle = col; ctx.fillText(s, x, y);
      var w = ctx.measureText(s).width;
      try { ctx.letterSpacing = '0px'; } catch (e) { /* ignore */ }
      return w;
    }
    function rrect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
      else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    }
    function glass(ctx, x, y, w, h, r, alpha) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = h * 0.5; ctx.shadowOffsetY = h * 0.12;
      rrect(ctx, x, y, w, h, r);
      var g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, 'rgba(30,34,56,' + 0.86 * alpha + ')'); g.addColorStop(1, 'rgba(12,14,26,' + 0.9 * alpha + ')');
      ctx.fillStyle = g; ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = Math.max(1, h * 0.045); ctx.strokeStyle = 'rgba(255,255,255,' + 0.16 * alpha + ')'; ctx.stroke();
      rrect(ctx, x + ctx.lineWidth, y + ctx.lineWidth, w - ctx.lineWidth * 2, h * 0.45, r * 0.8);
      ctx.fillStyle = 'rgba(255,255,255,' + 0.05 * alpha + ')'; ctx.fill();
      ctx.restore();
    }
    function chevrons(ctx, x, y, s, col, phase, alpha) {   // two left-pointing triangles, the leading one brighter in turn
      for (var i = 0; i < 2; i++) {
        var on = ((phase >> 3) + i) % 2 === 0 ? 1 : 0.55;
        ctx.globalAlpha = alpha * on;
        ctx.beginPath(); var x0 = x + i * s * 0.78;
        ctx.moveTo(x0, y); ctx.lineTo(x0 + s * 0.85, y - s * 0.58); ctx.lineTo(x0 + s * 0.85, y + s * 0.58); ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    function hourglass(ctx, x, y, s, col, sand, fill, spin) {   // centre (x, y), height s
      ctx.save(); ctx.translate(x, y); if (spin) ctx.rotate(spin);
      var w = s * 0.42, h = s * 0.5;
      ctx.lineWidth = Math.max(1, s * 0.09); ctx.lineJoin = 'round'; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.moveTo(-w, -h); ctx.lineTo(w, -h); ctx.lineTo(w * 0.12, 0); ctx.lineTo(w, h); ctx.lineTo(-w, h); ctx.lineTo(-w * 0.12, 0); ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill(); ctx.stroke();
      var top = clamp(fill, 0, 1), bot = 1 - top;
      ctx.fillStyle = sand;
      if (top > 0.02) { var ty = -h * 0.12 - (h * 0.8) * top; ctx.beginPath(); ctx.moveTo(-w * 0.78 * top - w * 0.1, ty); ctx.lineTo(w * 0.78 * top + w * 0.1, ty); ctx.lineTo(0, -h * 0.06); ctx.closePath(); ctx.fill(); }
      if (bot > 0.02) { var by = h * 0.86 - (h * 0.7) * bot; ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(w * 0.8, h * 0.86); ctx.lineTo(-w * 0.8, h * 0.86); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }

    function drawFilter(ctx, V, px, ui) {
      var cv = ctx.canvas, W = cv.width, H = cv.height, T = tint(), red = reducedOn(), a = fx * (P.filter === 'light' ? 0.55 : 1);
      if (a <= 0.001) return;
      var k = W / V.w, ky = H / V.h;   // device px per logical px
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
      if (ui.length) {   // the game's HUD rects stay readable: the filter goes around them
        ctx.beginPath(); ctx.rect(0, 0, W, H);
        for (var q = 0; q < ui.length; q++) {
          var U = ui[q], ux = Math.ceil(U.x * k) + 1, uy = Math.ceil(U.y * ky) + 1, uw = Math.floor(U.w * k) - 2, uh = Math.floor(U.h * ky) - 2, ur = num(U.r, 0) * k;   // 1 px inside: no unfiltered rim
          if (ur > 0 && ctx.roundRect) ctx.roundRect(ux, uy, uw, uh, ur); else ctx.rect(ux, uy, uw, uh);
        }
        ctx.clip('evenodd');
      }
      // 1. ripple: horizontal bands slide sideways, stronger in the rolling band
      var bandY = H * (1 - ((fxClock * 1.35) % 120) / 100) ;   // moves upward: time runs backwards
      if (P.ripple > 0 && !red && rewinding) {
        var c = scratch(W, H);
        if (c) {
          var g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'copy'; g.drawImage(cv, 0, 0);
          var bh = px ? Math.max(1, Math.round(k)) * 2 : Math.max(2, Math.round(H / 120)), amp = P.ripple * a * (px ? 2 : 2.4) * k, bandH = H * 0.09;
          ctx.imageSmoothingEnabled = !px;
          for (var y = 0; y < H; y += bh) {
            var d = Math.abs(y - bandY), inBand = d < bandH ? 1 - d / bandH : 0;
            var off = Math.sin(y / H * 18 + fxClock * 0.33) * amp * 0.45 + Math.sin(y / H * 51 - fxClock * 0.21) * amp * 0.2 + inBand * inBand * amp * 2.6 * (hash(fxClock >> 1, y) > 0.5 ? 1 : -0.6);
            off = px ? Math.round(off / k) * k : Math.round(off);
            if (off !== 0) ctx.drawImage(c, 0, y, W, Math.min(bh, H - y), off, y, W, Math.min(bh, H - y));
          }
        }
      }
      // 2. desaturate, 3. tint
      var sat = (P.filter === 'light' ? 0.6 : 0.88) * fx;
      ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = 'rgb(128,128,128)'; ctx.globalAlpha = sat; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'color'; ctx.fillStyle = T.c; ctx.globalAlpha = 0.34 * a; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = T.b; ctx.globalAlpha = 0.28 * a; ctx.fillRect(0, 0, W, H);
      // 4. vignette
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.hypot(W, H) * 0.56);
      vg.addColorStop(0, 'rgba(4,6,18,0)'); vg.addColorStop(1, 'rgba(4,6,18,' + 0.55 * a + ')');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      // 5. scanlines
      if (P.scanlines > 0) {
        var period = px ? Math.max(2, Math.round(k * 2)) : Math.max(3, Math.round(k * 3)), dark = Math.max(1, Math.round(period / 3));
        var key = period + ':' + dark;
        if (!scanPat || scanKey !== key) {
          var pc = root.document && root.document.createElement('canvas');
          if (pc) { pc.width = 4; pc.height = period; var pg = pc.getContext('2d'); pg.fillStyle = '#000'; pg.fillRect(0, period - dark, 4, dark); scanPat = ctx.createPattern(pc, 'repeat'); scanKey = key; }
        }
        if (scanPat) { ctx.globalAlpha = P.scanlines * 0.42 * a; ctx.fillStyle = scanPat; ctx.fillRect(0, 0, W, H); }
      }
      // 6. rolling band glow and tracking specks (motion off when reduced)
      if (!red && rewinding) {
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.22 * a;
        var bg = ctx.createLinearGradient(0, bandY - H * 0.06, 0, bandY + H * 0.06);
        bg.addColorStop(0, 'rgba(255,255,255,0)'); bg.addColorStop(0.5, T.a); bg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = bg; ctx.fillRect(0, bandY - H * 0.06, W, H * 0.12);
        ctx.globalAlpha = 0.5 * a; ctx.fillStyle = '#ffffff';
        for (var i = 0; i < 14; i++) {
          var r1 = hash(fxClock >> 1, i * 7 + 1), r2 = hash(i * 13 + 5, fxClock >> 1), r3 = hash(fxClock + i, 99);
          var sw = (px ? Math.round(2 + r3 * 6) : 6 + r3 * 30) * k, sy = Math.round((bandY + (r2 - 0.5) * H * 0.16) / k) * k;
          ctx.fillRect(Math.round(r1 * W), sy, sw, Math.max(1, Math.round(k * (px ? 1 : 0.8))));
        }
      }
      // 7. release flash
      if (snapT > 0 && !red) { ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = snapT * 0.35; ctx.fillStyle = T.a; ctx.fillRect(0, 0, W, H); }
      ctx.restore();
    }

    function drawIndicator(ctx, V, px, ui) {
      var T = tint(), u = uScale(V, px), a = clamp(fx * 1.6, 0, 1);
      if (a <= 0.01) return;
      var secs = (rewoundMs / 1000).toFixed(2), sp = (Math.round(P.speed * 100) / 100) + '';
      var label = atEnd ? 'END OF HISTORY' : 'REWIND';
      if (px) {
        var w = (label.length + 9) * 4 * u + 8 * u, h = 11 * u, x = Math.round(V.w / 2 - w / 2), y = 3 * u;
        var r = { x: x, y: y, w: w, h: h };
        if (hits(r, ui)) { r.y = y = 16 * u; }
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(8,10,22,0.82)'; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = rgba(T.a, 0.9); ctx.fillRect(x, y, w, u); ctx.fillRect(x, y + h - u, w, u);
        var cx = x + 3 * u, cy = y + 3 * u;
        for (var i = 0; i < 2; i++) {   // pixel chevrons
          ctx.fillStyle = ((fxClock >> 3) + i) % 2 === 0 ? T.a : rgba(T.a, 0.5);
          var bx = cx + i * 4 * u;
          ctx.fillRect(bx, cy + 2 * u, u, u); ctx.fillRect(bx + u, cy + u, u, 3 * u); ctx.fillRect(bx + 2 * u, cy, u, 5 * u);
        }
        var tx = cx + 10 * u;
        tx += pxTextShadow(ctx, label, tx, cy, u, atEnd && (fxClock >> 3) % 2 ? T.warn : '#ffffff', '#000', 'left') + 4 * u;
        pxTextShadow(ctx, '-' + secs.slice(0, 4), tx, cy, u, T.a, '#000', 'left');
        ctx.globalAlpha = 1;
        drawnRects.push({ kind: 'indicator', x: r.x, y: r.y, w: r.w, h: r.h });
        return;
      }
      var s = u, fs = Math.round(15 * s), H = Math.round(34 * s);
      ctx.font = '800 ' + fs + 'px ' + FONT;
      var lw = ctx.measureText(label).width + label.length * 2.2 * s, nw = Math.round(64 * s), W = Math.round(52 * s + lw + nw + 24 * s);
      var x0 = Math.round(V.w / 2 - W / 2), y0 = Math.round(10 * s);
      var R = { x: x0, y: y0, w: W, h: H };
      if (hits(R, ui)) { y0 = Math.round(V.h * 0.16); R.y = y0; }
      ctx.save(); ctx.globalAlpha = a;
      glass(ctx, x0, y0, W, H, H / 2, 1);
      ctx.globalAlpha = a;
      chevrons(ctx, x0 + 14 * s, y0 + H / 2, 14 * s, T.a, fxClock, a);
      ctx.globalAlpha = a;
      hdText(ctx, label, x0 + 44 * s, y0 + H / 2 + 0.5 * s, fs, atEnd && (fxClock >> 3) % 2 ? T.warn : '#ffffff', 'left', 800, 2.2 * s);
      var nx = x0 + 44 * s + lw + 10 * s;
      ctx.fillStyle = rgba(T.a, 0.22); rrect(ctx, nx, y0 + 7 * s, nw, H - 14 * s, (H - 14 * s) / 2); ctx.fill();
      hdText(ctx, '\u00d7' + sp + '  -' + secs + 's', nx + nw / 2, y0 + H / 2 + 0.5 * s, Math.round(11 * s), T.a, 'center', 700, 0.3 * s);
      ctx.restore();
      drawnRects.push({ kind: 'indicator', x: R.x, y: R.y, w: R.w, h: R.h });
    }

    function drawScrubber(ctx, V, px, ui) {
      var a = clamp(fx * 1.6, 0, 1); if (a <= 0.01 || !count) return;
      var T = tint(), u = uScale(V, px);
      var w = Math.round(V.w * (px ? 0.5 : 0.46)), h = px ? 3 * u : Math.round(6 * u), x = Math.round(V.w / 2 - w / 2), y = Math.round(V.h - (px ? 8 : 26) * u);
      var R = { x: x - 6 * u, y: y - 8 * u, w: w + 12 * u, h: h + 16 * u };
      if (hits(R, ui)) { y = Math.round(V.h * 0.8); R.y = y - 8 * u; }
      var total = rewinding ? Math.max(startCount, count) : count, capS = cap;
      var fHist = total / capS, fCur = (rewinding ? cursor + 1 : count) / capS;
      ctx.save(); ctx.globalAlpha = a;
      if (px) {
        ctx.fillStyle = 'rgba(8,10,22,0.8)'; ctx.fillRect(x - u, y - u, w + 2 * u, h + 2 * u);
        ctx.fillStyle = rgba(T.c, 0.35); ctx.fillRect(x, y, Math.round(w * fHist), h);
        ctx.fillStyle = T.a; ctx.fillRect(x, y, Math.round(w * fCur), h);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x + Math.round(w * fCur) - u, y - 2 * u, u * 2, h + 4 * u);
      } else {
        rrect(ctx, x - 3 * u, y - 3 * u, w + 6 * u, h + 6 * u, (h + 6 * u) / 2); ctx.fillStyle = 'rgba(8,10,22,0.66)'; ctx.fill();
        rrect(ctx, x, y, w, h, h / 2); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
        if (fHist > fCur) {   // the future being undone: hatched
          ctx.save(); rrect(ctx, x, y, w * fHist, h, h / 2); ctx.clip();
          ctx.fillStyle = rgba(T.c, 0.28); ctx.fillRect(x + w * fCur, y, w * (fHist - fCur), h);
          ctx.strokeStyle = rgba(T.a, 0.35); ctx.lineWidth = 1.2 * u;
          for (var hx = x + w * fCur - h * 2; hx < x + w * fHist; hx += 5 * u) { ctx.beginPath(); ctx.moveTo(hx, y + h); ctx.lineTo(hx + h, y); ctx.stroke(); }
          ctx.restore();
        }
        var g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, T.b); g.addColorStop(1, T.a);
        rrect(ctx, x, y, Math.max(h, w * fCur), h, h / 2); ctx.fillStyle = g; ctx.fill();
        var secTicks = Math.floor(P.seconds);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        for (var i = 1; i < secTicks; i++) ctx.fillRect(Math.round(x + w * i / P.seconds), y + h + 2 * u, Math.max(1, u), 3 * u);
        var hxp = x + w * fCur;
        ctx.shadowColor = T.a; ctx.shadowBlur = 10 * u;
        ctx.fillStyle = '#ffffff'; rrect(ctx, hxp - 2 * u, y - 5 * u, 4 * u, h + 10 * u, 2 * u); ctx.fill();
        ctx.shadowBlur = 0;
        hdText(ctx, '-' + (total * stride * stepMsDef / 1000).toFixed(1) + 's', x - 8 * u, y + h / 2, Math.round(10 * u), 'rgba(255,255,255,0.75)', 'right', 600);
        hdText(ctx, 'now', x + w + 8 * u, y + h / 2, Math.round(10 * u), 'rgba(255,255,255,0.75)', 'left', 600);
      }
      ctx.restore();
      drawnRects.push({ kind: 'scrubber', x: R.x, y: R.y, w: R.w, h: R.h });
    }

    function drawMeter(ctx, V, px) {
      var r = meterRect(px); if (!r) return;
      var T = tint(), u = meterSize(V, px).u, deny = denyT > 0 && (Math.floor(denyT * 10) % 2 === 0);
      var frac = P.energy === 'meter' ? energy : P.energy === 'charges' ? charges / P.charges : 1;
      var shakeX = denyT > 0 ? Math.round(Math.sin(denyT * 40) * 2 * u * denyT) : 0;
      var x = r.x + shakeX, y = r.y, w = r.w, h = r.h;
      if (px) {
        ctx.fillStyle = 'rgba(8,10,22,0.85)'; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = rewinding ? T.a : 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y, w, u); ctx.fillRect(x, y + h - u, w, u);
        // hourglass glyph 5x7
        var gx = x + 2 * u, gy = y + u, col = deny ? T.warn : T.a;
        var HG = ['11111', '01110', '00100', '00100', '01010', '01110', '11111'];   // 5x7 hourglass
        ctx.fillStyle = col;
        for (var hr = 0; hr < 7; hr++) for (var hc = 0; hc < 5; hc++) if (HG[hr].charAt(hc) === '1') ctx.fillRect(gx + hc * u, gy + hr * u, u, u);
        var bx = gx + 7 * u, bw = w - (bx - x) - 2 * u;
        if (P.energy === 'charges') {
          for (var i = 0; i < P.charges; i++) {
            var px0 = bx + i * 6 * u, full = i < charges;
            ctx.fillStyle = full ? (deny ? T.warn : T.a) : 'rgba(255,255,255,0.18)'; ctx.fillRect(px0, y + 3 * u, 4 * u, 3 * u);
            if (!full && i === charges) { ctx.fillStyle = rgba(T.a, 0.6); ctx.fillRect(px0, y + 5 * u, Math.round(4 * u * chargeT), u); }
          }
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(bx, y + 3 * u, bw, 3 * u);
          ctx.fillStyle = deny ? T.warn : frac < 0.25 && rewinding ? T.warn : T.a; ctx.fillRect(bx, y + 3 * u, Math.round(bw * frac), 3 * u);
        }
        drawnRects.push({ kind: 'meter', x: r.x, y: r.y, w: r.w, h: r.h });
        return;
      }
      ctx.save();
      glass(ctx, x, y, w, h, h / 2, 1);
      hourglass(ctx, x + h * 0.55, y + h / 2, h * 0.62, deny ? T.warn : '#e9eefc', deny ? T.warn : T.a, frac, 0);
      var bx2 = x + h * 1.05, kw = P.hint === 'on' ? h * 0.78 : 0, bw2 = w - (bx2 - x) - h * 0.4 - kw;
      if (P.energy === 'charges') {
        var step2 = bw2 / P.charges;
        for (var j = 0; j < P.charges; j++) {
          var cx = bx2 + step2 * (j + 0.5), cy = y + h / 2, rr = Math.min(step2 * 0.36, h * 0.24), fullJ = j < charges;
          ctx.beginPath(); ctx.moveTo(cx, cy - rr); ctx.lineTo(cx + rr * 0.8, cy); ctx.lineTo(cx, cy + rr); ctx.lineTo(cx - rr * 0.8, cy); ctx.closePath();
          if (fullJ) { var dg = ctx.createLinearGradient(0, cy - rr, 0, cy + rr); dg.addColorStop(0, '#ffffff'); dg.addColorStop(0.45, deny ? T.warn : T.a); dg.addColorStop(1, deny ? T.warn : T.b); ctx.fillStyle = dg; ctx.shadowColor = T.a; ctx.shadowBlur = 6 * u; ctx.fill(); ctx.shadowBlur = 0; }
          else { ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1 * u; ctx.stroke(); if (j === charges && chargeT > 0) { ctx.save(); ctx.clip(); ctx.fillStyle = rgba(T.a, 0.55); ctx.fillRect(cx - rr, cy + rr - rr * 2 * chargeT, rr * 2, rr * 2 * chargeT); ctx.restore(); } }
        }
      } else {
        var bh = h * 0.3, by = y + h / 2 - bh / 2;
        if (SK && SK.bar) { try { SK.bar(ctx, { x: bx2, y: by, w: bw2, h: bh }, frac, 'energy', {}); } catch (e) { SK = null; } }
        if (!SK || !SK.bar) {
          rrect(ctx, bx2, by, bw2, bh, bh / 2); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
          if (frac > 0.005) {
            var lg = ctx.createLinearGradient(bx2, 0, bx2 + bw2, 0);
            var low = deny || (frac < 0.25 && rewinding);
            lg.addColorStop(0, low ? T.warn : T.b); lg.addColorStop(1, low ? '#ffe2b0' : T.a);
            rrect(ctx, bx2, by, Math.max(bh, bw2 * frac), bh, bh / 2); ctx.fillStyle = lg;
            if (rewinding) { ctx.shadowColor = T.a; ctx.shadowBlur = 8 * u; }
            ctx.fill(); ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255,255,255,0.35)'; rrect(ctx, bx2 + bh * 0.3, by + bh * 0.15, Math.max(0, bw2 * frac - bh * 0.6), bh * 0.28, bh * 0.14); ctx.fill();
          }
          ctx.fillStyle = 'rgba(8,10,22,0.6)';
          for (var t = 1; t < 4; t++) ctx.fillRect(Math.round(bx2 + bw2 * t / 4), by, Math.max(1, u), bh);
        }
      }
      if (kw) {   // key cap
        var kx = x + w - h * 0.32 - kw, ky = y + h * 0.18, kh = h * 0.64;
        rrect(ctx, kx, ky, kw * 0.86, kh, h * 0.14); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = Math.max(1, u); ctx.stroke();
        var kl = P.key.length === 1 ? P.key.toUpperCase() : P.key.slice(0, 1).toUpperCase() + P.key.slice(1, 3);
        hdText(ctx, kl, kx + kw * 0.43, ky + kh / 2 + 0.5 * u, Math.round(h * (kl.length > 1 ? 0.3 : 0.4)), '#ffffff', 'center', 700);
      }
      ctx.restore();
      drawnRects.push({ kind: 'meter', x: r.x, y: r.y, w: r.w, h: r.h });
    }

    function drawButton(ctx, V, px) {
      var b = buttonRect(); if (!b) return;
      var T = tint(), down = heldNow() && rewinding;
      ctx.save();
      if (px) {
        var s = b.r * 2, x = Math.round(b.cx - b.r), y = Math.round(b.cy - b.r), u = uScale(V, true);
        ctx.fillStyle = down ? rgba(T.a, 0.5) : 'rgba(8,10,22,0.7)'; ctx.fillRect(x + u, y, s - 2 * u, s); ctx.fillRect(x, y + u, s, s - 2 * u);
        ctx.fillStyle = T.a; var cy = Math.round(b.cy);
        for (var i = 0; i < 2; i++) { var bx = Math.round(b.cx - 4 * u + i * 4 * u); ctx.fillRect(bx, cy - u, u, 3 * u); ctx.fillRect(bx + u, cy - 2 * u, u, 5 * u); ctx.fillRect(bx + 2 * u, cy - 3 * u, u, 7 * u); }
      } else {
        ctx.beginPath(); ctx.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
        var g = ctx.createRadialGradient(b.cx, b.cy - b.r * 0.4, b.r * 0.1, b.cx, b.cy, b.r);
        g.addColorStop(0, down ? rgba(T.a, 0.65) : 'rgba(44,50,80,0.82)'); g.addColorStop(1, down ? rgba(T.b, 0.75) : 'rgba(10,12,24,0.82)');
        ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = Math.max(1.5, b.r * 0.08); ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.stroke();
        var frac = P.energy === 'meter' ? energy : P.energy === 'charges' ? charges / P.charges : 1;
        ctx.beginPath(); ctx.arc(b.cx, b.cy, b.r * 0.86, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.strokeStyle = T.a; ctx.lineWidth = Math.max(2, b.r * 0.1); ctx.lineCap = 'round'; ctx.stroke();
        chevrons(ctx, b.cx - b.r * 0.42, b.cy, b.r * 0.46, '#ffffff', down ? fxClock : 0, 1);
      }
      ctx.restore();
      drawnRects.push({ kind: 'button', x: b.cx - b.r, y: b.cy - b.r, w: b.r * 2, h: b.r * 2 });
    }

    function draw(ctx) {
      drawnRects = [];
      if (!ctx || !ctx.canvas) return;
      try {
        var V = view(), px = pixelMode(ctx), cv = ctx.canvas, ui = uiList();
        ctx.save();
        if (P.filter !== 'off' && fx > 0) drawFilter(ctx, V, px, ui);
        if (P.filter === 'off' && snapT > 0) { /* no flash without filter */ }
        ctx.setTransform(cv.width / V.w, 0, 0, cv.height / V.h, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = !px;
        if (live || rewinding) { drawMeter(ctx, V, px); drawButton(ctx, V, px); }   // hidden on title, pause and menu screens
        drawScrubber(ctx, V, px, ui);
        drawIndicator(ctx, V, px, ui);
        ctx.restore();
      } catch (e) { errors++; if (errors < 4) warn('draw failed: ' + (e && e.message)); try { ctx.restore(); } catch (e2) { /* ignore */ } }
    }

    function clear() {
      for (var i = 0; i < cap; i++) buf[i] = null;
      head = 0; count = 0; bytes = 0; rewinding = false; cursor = -1; acc = 0; atEnd = false; pushSkip = false; lockUntilUp = heldNow();
      energy = 1; charges = P.charges; chargeT = 0; fx = 0; snapT = 0; denyT = 0; endT = 0; rewoundMs = 0;
    }
    function stats() {
      var avg = count ? bytes / count : 0, perSec = avg * 1000 / (stepMsDef * stride);
      return {
        version: VERSION, mode: mode, frames: count, capacity: cap, stride: stride, seconds: +(count * stride * stepMsDef / 1000).toFixed(3),
        bytes: Math.round(bytes), avgBytes: Math.round(avg), bytesPerSecond: Math.round(perSec), maxBytes: maxBytes,
        rewinding: rewinding, held: heldNow(), atEnd: atEnd, cursor: cursor, restoredSerial: restoredSerial, newestSerial: count ? buf[idx(count - 1)].n : 0,
        rewindSteps: rewindSteps, rewoundMs: Math.round(rewoundMs), sessions: sessions, records: records, restores: restores, steps: steps,
        blockedSteps: blockedSteps, energy: +energy.toFixed(4), charges: charges, fx: +fx.toFixed(3), errors: errors, lastRelease: lastRelease,
        speed: P.speed, energyMode: P.energy, touch: touchOn()
      };
    }

    var inst = {
      version: VERSION,
      step: step,
      draw: draw,
      clear: clear,
      hold: function (on) { hostHeld = !!on; return inst; },
      held: heldNow,
      rewinding: function () { return rewinding; },
      amount: function () { return fx; },
      stats: stats,
      state: stats,
      lastDrawn: function () { return drawnRects.slice(); },
      // debug and tests: a fresh copy of history entry i (0 = oldest), or null
      peek: function (i) { if (i < 0 || i >= count) return null; var e = buf[idx(i)]; return { serial: e.n, bytes: e.b, state: copyOut(e.s) }; },
      setParams: function (p) { if (!p) return inst; for (var k in p) if (p[k] != null && p[k] !== '') P[k] = p[k]; var oldKey = KEY; norm(); KEY = P.key.toLowerCase(); if (KEY !== oldKey) keyHeld = false; if (charges > P.charges) charges = P.charges; resize(); return inst; },
      params: function () { var c = {}; for (var k in P) c[k] = P[k]; return c; },
      destroy: function () { for (var i = 0; i < listeners.length; i++) { try { listeners[i][0].removeEventListener(listeners[i][1], listeners[i][2], listeners[i][3]); } catch (e) { /* ignore */ } } listeners = []; clear(); }
    };
    return inst;
  }

  root.GameDNA_TimeRewind = { version: VERSION, create: create, defaults: DEF, clone: function (v) { return deepClone(v).v; } };
})(typeof window !== 'undefined' ? window : this);
