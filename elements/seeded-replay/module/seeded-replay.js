/* GameDNA I-07 Seeded replay & ghost (seeded-replay.js) v1.1.0
 * One plain script, no dependencies, no import/export. One global: GameDNA_SeededReplay.
 *
 * Records the player's input once per fixed step together with the run's seed, and can play it back through the game's
 * own step function to the identical end state (checked by hashing the game state at the end and every second on the
 * way). Saves and loads runs as one compact line of text. The best run becomes a translucent ghost that races the
 * player (time trial: best time and a live split), and a replay HUD lets the viewer pause, scrub and change speed.
 *
 *   var rep = GameDNA_SeededReplay.create({
 *     restart: function (seed) { SEED = seed; newGame(); },          // start a fresh run with this seed
 *     step: step,                                                    // ONE fixed step of the game (the loop's function)
 *     state: function () { return { world: STATE, rng: rngState }; },// what must match at the end (no frame counters)
 *     pose: function () { return { x: hero.x, y: hero.y, facing: hero.facing, frame: hero.walk }; },
 *     drawGhost: function (ctx, p) { drawHero(ctx, p.x - cam.x, p.y - cam.y, p.facing, p.frame); },
 *     exit: function () { scene = 'title'; },
 *     view: { w: 320, h: 180 }, canvas: canvasEl, uiRects: function () { return [hudRect]; }
 *   });
 *   // where a run starts (after the seed is set):      rep.begin(seed);
 *   // in the fixed step, on the DEVICE input:          var input = rep.input(readInput());   (before any autopilot)
 *   // where a run is won or lost:                      rep.end({ won: true });
 *   // main loop, per fixed tick:                       for (var n = rep.steps(); n > 0; n--) step();
 *   // world draw, before the hero:                     rep.drawGhost(ctx);
 *   // end of render, after the HUD:                    rep.draw(ctx);
 *
 * Deterministic itself: no Math.random, no wall clock; its HUD animates from step counts. ASCII only.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0';
  var DEF = {
    ghost: 'best', ghostAlpha: 0.8, tint: 'cyan', tag: 'start', split: 'on', hud: 'auto', speed: 2, checkEvery: 60,
    render: 'auto', hudScale: 'auto', watchKey: 'v', pauseKey: 'p', autoExit: 4, store: 'off', guardRandom: 'on', reduced: 'system'
  };
  var TINTS = {
    cyan: { g: '#6fe3ff', ring: '#dffaff', deep: '#0b3550', acc: '#9df0ff' },
    gold: { g: '#ffd36a', ring: '#fff3c8', deep: '#4a3208', acc: '#ffe39a' },
    violet: { g: '#b49bff', ring: '#efe6ff', deep: '#2a1858', acc: '#d2c4ff' },
    white: { g: '#e8eef8', ring: '#ffffff', deep: '#28324a', acc: '#ffffff' }
  };
  var SPEEDS = [0.25, 0.5, 1, 2, 4];
  /* 3x5 pixel font (rows top to bottom, 3 columns each) */
  var PF = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
    K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101010010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
    '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111',
    '9': '111101111001110', '.': '000000000000010', '-': '000000111000000', ':': '000010000010000', '+': '000010111010000',
    'x': '000101010101000', '/': '001001010100100', '!': '010010010000010', '?': '110001010000010', '#': '101111101111101',
    '[': '110100100100110', ']': '011001001001011', '<': '001010100010001', '>': '100010001010100', '=': '000111000111000',
    ' ': '000000000000000', "'": '010010000000000', ',': '000000000010100'
  };

  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function str(v, d, list) { v = v == null || v === '' ? d : String(v); return list && list.indexOf(v) < 0 ? d : v; }
  function warn(m) { try { if (root.console) root.console.warn('[GameDNA_SeededReplay] ' + m); } catch (e) { /* ignore */ } }
  function fmtTime(ms) {
    ms = Math.max(0, Math.round(ms));
    var m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, c = Math.floor(ms / 10) % 100;
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c;
  }

  /* ---------------- state hash ----------------
   * Canonical walk: object keys sorted, functions / undefined / DOM / canvas / image / audio values skipped, numbers by
   * their exact 64-bit pattern, Map / Set in insertion order, typed arrays by bytes, cycles marked. Two 32-bit lanes. */
  var F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
  function isOpaque(v) {
    if (typeof v !== 'object' || v === null) return false;
    if (typeof v.nodeType === 'number' && typeof v.nodeName === 'string') return true;
    if (typeof v.getContext === 'function' || typeof v.drawImage === 'function') return true;
    if (typeof v.decode === 'function' && 'naturalWidth' in v) return true;
    if (typeof root.ImageBitmap !== 'undefined' && v instanceof root.ImageBitmap) return true;
    if (typeof root.AudioNode !== 'undefined' && v instanceof root.AudioNode) return true;
    if (typeof v.then === 'function') return true;
    var tg = Object.prototype.toString.call(v);
    return tg === '[object WeakMap]' || tg === '[object WeakSet]' || tg === '[object Window]';
  }
  function Hasher() { this.a = 0x811c9dc5 | 0; this.b = 0x2f6b9a17 | 0; this.n = 0; }
  Hasher.prototype.u = function (x) {
    x = x | 0; this.n++;
    this.a = Math.imul(this.a ^ x, 16777619);
    var k = Math.imul(x, 0xcc9e2d51); k = (k << 15) | (k >>> 17); k = Math.imul(k, 0x1b873593);
    this.b ^= k; this.b = (this.b << 13) | (this.b >>> 19); this.b = (Math.imul(this.b, 5) + 0xe6546b64) | 0;
  };
  Hasher.prototype.s = function (t) { this.u(t.length); for (var i = 0; i < t.length; i++) this.u(t.charCodeAt(i)); };
  Hasher.prototype.v = function (v, stack, depth) {
    var t = typeof v, i, keys, k;
    if (v === null) { this.u(1); return; }
    if (t === 'boolean') { this.u(v ? 3 : 2); return; }
    if (t === 'number') { this.u(4); F64[0] = v; this.u(U32[0]); this.u(U32[1]); return; }
    if (t === 'string') { this.u(5); this.s(v); return; }
    if (t === 'bigint') { this.u(14); this.s(String(v)); return; }
    if (t !== 'object') { this.u(13); return; }
    if (isOpaque(v)) { this.u(13); return; }
    if (depth > 64) { this.u(15); return; }
    if (stack.indexOf(v) >= 0) { this.u(12); return; }
    stack.push(v);
    if (Array.isArray(v)) { this.u(6); this.u(v.length); for (i = 0; i < v.length; i++) this.v(v[i], stack, depth + 1); }
    else if (ArrayBuffer.isView(v)) { this.u(10); var by = new Uint8Array(v.buffer, v.byteOffset, v.byteLength); this.u(by.length); for (i = 0; i < by.length; i++) this.u(by[i]); }
    else {
      var tag = Object.prototype.toString.call(v), self = this;
      if (tag === '[object Map]') { this.u(8); this.u(v.size); v.forEach(function (val, key) { self.v(key, stack, depth + 1); self.v(val, stack, depth + 1); }); }
      else if (tag === '[object Set]') { this.u(9); this.u(v.size); v.forEach(function (val) { self.v(val, stack, depth + 1); }); }
      else if (tag === '[object Date]') { this.u(11); this.v(v.getTime(), stack, depth + 1); }
      else {
        this.u(7); keys = Object.keys(v).sort();
        for (i = 0; i < keys.length; i++) {
          k = keys[i]; var val = v[k], vt = typeof val;
          if (vt === 'function' || vt === 'undefined' || vt === 'symbol' || isOpaque(val)) continue;
          this.s(k); this.v(val, stack, depth + 1);
        }
      }
    }
    stack.pop();
  };
  function hex8(x) { return ('0000000' + (x >>> 0).toString(16)).slice(-8); }
  function hashOf(v) { var h = new Hasher(); h.v(v, [], 0); var a = h.a ^ h.n, b = h.b ^ Math.imul(h.n, 0x85ebca6b); a = Math.imul(a ^ (a >>> 16), 0x85ebca6b); b = Math.imul(b ^ (b >>> 13), 0xc2b2ae35); return hex8(a ^ (b >>> 7)) + hex8(b ^ (a >>> 11)); }

  /* ---------------- canonical input ---------------- */
  function canon(v) {
    if (v === undefined || typeof v === 'function') return 'null';
    if (v === null || typeof v !== 'object') { if (typeof v === 'number' && !isFinite(v)) return 'null'; return JSON.stringify(v); }
    if (Array.isArray(v)) { var a = []; for (var i = 0; i < v.length; i++) a.push(canon(v[i])); return '[' + a.join(',') + ']'; }
    var keys = Object.keys(v).sort(), out = [];
    for (var j = 0; j < keys.length; j++) { var x = v[keys[j]]; if (x === undefined || typeof x === 'function') continue; out.push(JSON.stringify(keys[j]) + ':' + canon(x)); }
    return '{' + out.join(',') + '}';
  }
  function neutralOf(v) {
    if (v === null || typeof v !== 'object') return typeof v === 'boolean' ? false : typeof v === 'number' ? 0 : typeof v === 'string' ? '' : null;
    if (Array.isArray(v)) return [];
    var o = {}; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) { var x = v[k]; o[k] = typeof x === 'boolean' ? false : typeof x === 'number' ? 0 : typeof x === 'string' ? '' : null; }
    return o;
  }

  /* ---------------- text format ----------------
   * GDR1.<base64url(JSON)>.<crc32 hex>. The JSON holds the seed, step ms, the input dictionary (canonical JSON of each
   * distinct input), the input stream run-length encoded, checkpoint hashes, the end hash, the result and the ghost's
   * pose track (numbers in 1/16 px as run-length encoded deltas, other values as dictionary runs). */
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function utf8(s) { var out = [], i, c; for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); if (c < 128) out.push(c); else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63)); else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); } return out; }
  function unutf8(b) { var s = '', i = 0, c; while (i < b.length) { c = b[i++]; if (c < 128) s += String.fromCharCode(c); else if (c < 224) s += String.fromCharCode(((c & 31) << 6) | (b[i++] & 63)); else { s += String.fromCharCode(((c & 15) << 12) | ((b[i] & 63) << 6) | (b[i + 1] & 63)); i += 2; } } return s; }
  function b64(bytes) { var s = '', i, n; for (i = 0; i < bytes.length; i += 3) { n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0); s += B64[n >> 18] + B64[(n >> 12) & 63]; if (i + 1 < bytes.length) s += B64[(n >> 6) & 63]; if (i + 2 < bytes.length) s += B64[n & 63]; } return s; }
  function unb64(s) { var out = [], i, n, a, len = s.length, v = function (ch) { var k = B64.indexOf(ch); if (k < 0) throw new Error('bad char'); return k; }; for (i = 0; i < len; i += 4) { a = len - i; n = (v(s[i]) << 18) | (v(s[i + 1]) << 12) | (a > 2 ? v(s[i + 2]) << 6 : 0) | (a > 3 ? v(s[i + 3]) : 0); out.push((n >> 16) & 255); if (a > 2) out.push((n >> 8) & 255); if (a > 3) out.push(n & 255); } return out; }
  var CRC = null;
  function crc32(bytes) { if (!CRC) { CRC = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } } var crc = -1; for (var i = 0; i < bytes.length; i++) crc = CRC[(crc ^ bytes[i]) & 255] ^ (crc >>> 8); return hex8(crc ^ -1); }
  function rle(list) { var out = [], i = 0; while (i < list.length) { var v = list[i], n = 1; while (i + n < list.length && list[i + n] === v) n++; out.push(n > 1 ? v + '*' + n.toString(36) : String(v)); i += n; } return out.join(','); }
  function unrle(s, parse) { var out = []; if (!s) return out; s.split(',').forEach(function (tok) { var j = tok.lastIndexOf('*'), v = j > 0 ? tok.slice(0, j) : tok, n = j > 0 ? parseInt(tok.slice(j + 1), 36) : 1; var pv = parse(v); for (var k = 0; k < n; k++) out.push(pv); }); return out; }
  var Q = 16;   // pose numbers are kept in 1/16 px
  function qn(v) { return Math.round(v * Q) / Q; }
  function quantPose(p) {
    if (!p || typeof p !== 'object') return null;
    var o = {}, k, v, ks = Object.keys(p).sort();   // sorted keys: a loaded pose is the same object as the recorded one
    for (var i = 0; i < ks.length; i++) { k = ks[i]; v = p[k]; if (typeof v === 'number') o[k] = isFinite(v) ? qn(v) : 0; else if (typeof v === 'string' || typeof v === 'boolean' || v === null) o[k] = v; }
    return o;
  }
  function encodePoses(poses) {
    var keys = {}, i, k;
    for (i = 0; i < poses.length; i++) if (poses[i]) for (k in poses[i]) keys[k] = 1;
    keys = Object.keys(keys).sort();
    var ch = { _: rle(poses.map(function (p) { return p ? 1 : 0; })) };
    keys.forEach(function (key) {
      var allNum = true;
      for (i = 0; i < poses.length; i++) { var p = poses[i]; if (p && key in p && typeof p[key] !== 'number') { allNum = false; break; } }
      if (allNum) {
        var prev = 0, ds = [];
        for (i = 0; i < poses.length; i++) { var q = poses[i] && key in poses[i] ? Math.round(poses[i][key] * Q) : null; if (q === null) ds.push('~'); else { ds.push((q - prev).toString(36)); prev = q; } }
        ch['n:' + key] = rle(ds);
      } else {
        var dict = [], idx = [];
        for (i = 0; i < poses.length; i++) { var val = poses[i] && key in poses[i] ? JSON.stringify(poses[i][key]) : 'u'; var at = dict.indexOf(val); if (at < 0) { at = dict.length; dict.push(val); } idx.push(at.toString(36)); }
        ch['d:' + key] = { d: dict, r: rle(idx) };
      }
    });
    return ch;
  }
  function decodePoses(ch, n) {
    var poses = [], i, pres = unrle(ch._, function (v) { return v === '1'; });
    for (i = 0; i < n; i++) poses.push(pres[i] ? {} : null);
    Object.keys(ch).forEach(function (ck) {
      if (ck === '_') return;
      var key = ck.slice(2);
      if (ck[0] === 'n') {
        var ds = unrle(ch[ck], function (v) { return v; }), prev = 0;
        for (i = 0; i < n; i++) { if (ds[i] === '~' || ds[i] === undefined) continue; prev += parseInt(ds[i], 36); if (poses[i]) poses[i][key] = prev / Q; }
      } else {
        var d = ch[ck].d, ix = unrle(ch[ck].r, function (v) { return parseInt(v, 36); });
        for (i = 0; i < n; i++) { var s = d[ix[i]]; if (s === undefined || s === 'u' || !poses[i]) continue; poses[i][key] = JSON.parse(s); }
      }
    });
    return poses;
  }
  function encodeRun(r) {
    var obj = { v: 1, seed: r.seed, meta: r.meta == null ? null : r.meta, ms: r.stepMs, n: r.inputs.length, dict: r.dict, in: rle(r.inputs.map(function (x) { return x.toString(36); })),
      ce: r.checkEvery, ck: r.checks.join(''), end: r.endStep, eh: r.endHash, res: r.result, poses: encodePoses(r.poses), label: r.label || '' };
    var bytes = utf8(JSON.stringify(obj));
    return 'GDR1.' + b64(bytes) + '.' + crc32(bytes);
  }
  function decodeRun(text) {
    try {
      text = String(text || '').replace(/\s+/g, '');
      var parts = text.split('.');
      if (parts.length !== 3 || parts[0] !== 'GDR1') return null;
      var bytes = unb64(parts[1]);
      if (crc32(bytes) !== parts[2]) return null;
      var o = JSON.parse(unutf8(bytes));
      if (!o || o.v !== 1 || !Array.isArray(o.dict)) return null;
      var inputs = unrle(o.in, function (v) { return parseInt(v, 36); });
      if (inputs.length !== o.n) return null;
      for (var i = 0; i < inputs.length; i++) if (!(inputs[i] >= 0 && inputs[i] < o.dict.length)) return null;
      var checks = []; for (var j = 0; j < (o.ck || '').length; j += 8) checks.push(o.ck.slice(j, j + 8));
      return { seed: o.seed, meta: o.meta == null ? null : o.meta, stepMs: o.ms, dict: o.dict, inputs: inputs, checkEvery: o.ce, checks: checks, endStep: o.end == null ? null : o.end,
        endHash: o.eh || null, result: o.res || null, poses: decodePoses(o.poses || { _: '' }, o.n), label: o.label || '', loaded: true };
    } catch (e) { return null; }
  }

  /* ---------------- instance ---------------- */
  /* ---------------- ghost compositing ----------------
   * composite(ctx, drawFn, {tint, alpha}): drawFn(layerCtx) draws the host's own sprite (real frames, its own facing and
   * feet) into an offscreen layer with ctx's transform; the layer is tinted (shading kept), ringed with a 1 art-px light
   * outline and drawn onto ctx at `alpha`. drawFn may return its sprite rect {x, y, w, h} in ctx units; otherwise the
   * rect is found by scanning the layer (small canvases only). Returns {box, T} (box in device px) or null. */
  var LAYERS = { a: null, b: null, c: null, scan: true };
  function mkCanvas(w, h) { if (typeof root.document === 'undefined' || !root.document.createElement) return null; var c = root.document.createElement('canvas'); c.width = w; c.height = h; try { c.getContext('2d', { willReadFrequently: w * h <= 600000 }); } catch (e) { /* ignore */ } return c; }
  function composite(ctx, drawFn, opt) {
    opt = opt || {};
    var cv = ctx && ctx.canvas; if (!cv || typeof drawFn !== 'function') return null;
    var W = cv.width, H = cv.height;
    if (!LAYERS.a || LAYERS.a.width !== W || LAYERS.a.height !== H) { LAYERS.a = mkCanvas(W, H); LAYERS.b = mkCanvas(W, H); LAYERS.c = mkCanvas(W, H); }
    var layer = LAYERS.a, layer2 = LAYERS.b, layer3 = LAYERS.c; if (!layer) return null;
    var g1 = layer.getContext('2d'), g2 = layer2.getContext('2d'), g3 = layer3.getContext('2d');
    var T = ctx.getTransform ? ctx.getTransform() : null;
    g1.setTransform(1, 0, 0, 1, 0, 0); g1.globalCompositeOperation = 'source-over'; g1.globalAlpha = 1; g1.clearRect(0, 0, W, H);
    if (T) g1.setTransform(T); g1.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
    var ret = drawFn(g1);
    g1.setTransform(1, 0, 0, 1, 0, 0);
    var box = null;
    if (ret && typeof ret === 'object' && isFinite(ret.x) && isFinite(ret.w)) {
      var sx = T ? T.a : 1, sy = T ? T.d : 1, tx = T ? T.e : 0, ty = T ? T.f : 0;
      box = { x: ret.x * sx + tx, y: ret.y * sy + ty, w: ret.w * sx, h: ret.h * sy };
    } else if (LAYERS.scan && W * H <= 600000) {
      try {
        var d = g1.getImageData(0, 0, W, H).data, x0 = W, y0 = H, x1 = -1, y1 = -1, x, y;
        for (y = 0; y < H; y++) { var row = y * W * 4; for (x = 0; x < W; x++) if (d[row + x * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
        if (x1 >= 0) box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      } catch (e) { LAYERS.scan = false; }
    }
    var TI = TINTS[opt.tint] || TINTS.cyan, k = T ? Math.max(1, Math.round(Math.abs(T.a))) : 1;
    // ring: the silhouette shifted 1 art px four ways, minus the silhouette
    g2.setTransform(1, 0, 0, 1, 0, 0); g2.globalCompositeOperation = 'source-over'; g2.globalAlpha = 1; g2.clearRect(0, 0, W, H);
    g2.drawImage(layer, -k, 0); g2.drawImage(layer, k, 0); g2.drawImage(layer, 0, -k); g2.drawImage(layer, 0, k);
    g2.globalCompositeOperation = 'source-in'; g2.fillStyle = TI.ring; g2.fillRect(0, 0, W, H);
    g2.globalCompositeOperation = 'destination-out'; g2.drawImage(layer, 0, 0);
    // body: the art keeps its own colours, outline and shading (hair, face, clothes, every frame), under a light tint
    g3.setTransform(1, 0, 0, 1, 0, 0); g3.globalCompositeOperation = 'source-over'; g3.globalAlpha = 1; g3.clearRect(0, 0, W, H);
    g3.drawImage(layer, 0, 0);
    g3.globalCompositeOperation = 'source-atop'; g3.globalAlpha = opt.tintAmount == null ? 0.32 : opt.tintAmount; g3.fillStyle = TI.g; g3.fillRect(0, 0, W, H);
    g3.globalAlpha = 1; g3.globalCompositeOperation = 'source-over';
    g2.globalCompositeOperation = 'source-over'; g2.drawImage(layer3, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = opt.alpha == null ? 0.6 : opt.alpha; ctx.imageSmoothingEnabled = false;
    if (box) { var bx = Math.max(0, box.x - k * 2), by = Math.max(0, box.y - k * 2), bw = Math.min(W - bx, box.w + k * 4), bh = Math.min(H - by, box.h + k * 4); if (bw > 0 && bh > 0) ctx.drawImage(layer2, bx, by, bw, bh, bx, by, bw, bh); }
    else ctx.drawImage(layer2, 0, 0);
    ctx.restore();
    return { box: box, T: T };
  }

  var randomHook = null;   // one shared Math.random counter (values unchanged)
  function hookRandom() {
    if (randomHook || typeof Math.random !== 'function') return randomHook;
    var orig = Math.random;
    randomHook = { inStep: 0, calls: 0, orig: orig };
    try { Math.random = function () { if (randomHook.inStep > 0) randomHook.calls++; return orig.apply(Math, arguments); }; } catch (e) { /* frozen Math */ }
    return randomHook;
  }

  function create(o) {
    o = o || {};
    var P = {}, pk;
    for (pk in DEF) P[pk] = DEF[pk];
    var src = o.params || {};
    for (pk in src) if (src[pk] != null && src[pk] !== '') P[pk] = src[pk];
    function norm() {
      P.ghost = str(P.ghost, DEF.ghost, ['best', 'last', 'off']);
      P.ghostAlpha = clamp(num(P.ghostAlpha, DEF.ghostAlpha), 0.15, 1);
      P.tint = str(P.tint, DEF.tint, ['cyan', 'gold', 'violet', 'white']);
      P.tag = str(P.tag, DEF.tag, ['start', 'on', 'off']);
      P.split = str(P.split, DEF.split, ['on', 'off']);
      P.hud = str(P.hud, DEF.hud, ['auto', 'always', 'off']);
      P.speed = clamp(num(P.speed, DEF.speed), 0.25, 4);
      P.checkEvery = clamp(Math.round(num(P.checkEvery, DEF.checkEvery)), 1, 6000);
      P.render = str(P.render, DEF.render, ['auto', 'pixel', 'smooth']);
      P.watchKey = String(P.watchKey == null || P.watchKey === '' ? 'v' : P.watchKey).toLowerCase();
      P.pauseKey = String(P.pauseKey == null || P.pauseKey === '' ? 'p' : P.pauseKey).toLowerCase();
      P.autoExit = clamp(num(P.autoExit, DEF.autoExit), 0, 60);
      P.store = str(P.store, DEF.store, ['off', 'local']);
      P.guardRandom = str(P.guardRandom, DEF.guardRandom, ['on', 'off']);
      P.reduced = str(P.reduced, DEF.reduced, ['system', 'on', 'off']);
    }
    norm();
    var stepMs = num(o.stepMs, 1000 / 60);
    var maxSteps = Math.max(600, Math.round(num(o.maxSteps, 60 * 60 * 60)));
    var errors = 0;
    function call(fn, a, b, d) { if (typeof fn !== 'function') return d; try { return fn(a, b); } catch (e) { errors++; if (errors < 4) warn('callback failed: ' + (e && e.message)); return d; } }
    var RH = P.guardRandom === 'on' ? hookRandom() : null, randomCalls = 0, randomWarned = false;
    var sysReduced = false;
    try { sysReduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { sysReduced = false; }
    function reduced() { return P.reduced === 'on' || (P.reduced === 'system' && sysReduced); }

    var canvasEl = o.canvas || null;
    var mode = 'live';                       // 'live' | 'play' | 'verify'
    var rec = null;                          // run being recorded (live)
    var runs = { last: null, best: null, prev: null };
    var play = null;                         // playback state
    var tick = 0;                            // UI clock (steps)
    var stats = { begins: 0, ends: 0, inputs: 0, recorded: 0, watches: 0, verifies: 0, matches: 0, desyncs: 0, seeks: 0, ghostDraws: 0, saves: 0, loads: 0, badLoads: 0 };
    var banner = null;                       // {kind, text, sub, t0}
    var lastVerify = null, lastDrawn = [], ghostRect = null, inStepFlag = false;
    var seedNow = 0;

    function newRun(seed, meta) {
      return { seed: seed, meta: meta == null ? null : JSON.parse(canon(meta)), stepMs: stepMs, dict: [], dictMap: {}, inputs: [], checkEvery: P.checkEvery, checks: [], poses: [], endStep: null, endHash: null, result: null, label: '' };
    }
    function dictIndex(r, key) {
      if (!r.dictMap) { r.dictMap = {}; for (var i = 0; i < r.dict.length; i++) r.dictMap[r.dict[i]] = i; }
      var at = r.dictMap[key]; if (at === undefined) { at = r.dict.length; r.dict.push(key); r.dictMap[key] = at; }
      return at;
    }
    function stateHash() { return hashOf(call(o.state, undefined, undefined, null)); }
    function better(a, b) {   // is run a better than run b?
      if (!a || !a.result || !a.result.won) return false;
      if (!b) return true;
      if (a.result.score != null && b.result && b.result.score != null && a.result.score !== b.result.score) return a.result.score > b.result.score;
      return a.endStep < b.endStep;
    }
    function storeKey() { return 'gamedna-replay:' + (o.storeKey || (root.location ? root.location.pathname : 'game')); }
    function persist() { if (P.store !== 'local' || !runs.best) return; try { root.localStorage.setItem(storeKey(), encodeRun(runs.best)); } catch (e) { /* storage off */ } }
    if (P.store === 'local') { try { var saved = root.localStorage.getItem(storeKey()); var sr = saved && decodeRun(saved); if (sr) runs.best = sr; } catch (e) { /* storage off */ } }

    /* ---------- recording hooks ---------- */
    function begin(seed, meta) {
      if (mode !== 'live') return false;
      if (seed == null) seed = call(o.seed, undefined, undefined, 0);
      seedNow = seed;
      rec = newRun(seed, meta); stats.begins++;
      banner = banner && banner.kind === 'best' ? banner : null;
      return true;
    }
    function input(raw) {
      tick++; stats.inputs++;
      if (RH) { RH.inStep = 1; inStepFlag = true; }
      var key = canon(raw);
      if (mode === 'live') {
        if (rec && rec.inputs.length < maxSteps) {
          var i = rec.inputs.length;
          if (i % rec.checkEvery === 0) rec.checks.push(stateHash().slice(0, 8));
          rec.poses.push(quantPose(call(o.pose, undefined, undefined, null)));
          rec.inputs.push(dictIndex(rec, key)); stats.recorded++;
        }
        return JSON.parse(key);
      }
      var r = play.run, c = play.cursor;
      if (c < play.limit) {
        if (c % r.checkEvery === 0) {
          var want = r.checks[c / r.checkEvery];
          if (want !== undefined) { var got = stateHash().slice(0, 8); play.checked = Math.max(play.checked, c / r.checkEvery + 1); if (got !== want && play.desyncAt == null) { play.desyncAt = c; stats.desyncs++; call(o.onDesync, { step: c, want: want, got: got }); } }
        }
        play.cursor = c + 1;
        if (play.cursor >= play.limit) { play.done = true; if (play.desyncAt != null && play.cardT == null) play.cardT = tick; }
        return JSON.parse(r.dict[r.inputs[c]]);
      }
      play.done = true;
      return neutralOf(JSON.parse(key));
    }
    function end(result) {
      result = result || {};
      var res = { won: result.won !== false && result.won !== 0, score: result.score == null || isNaN(+result.score) ? null : +result.score };
      if (mode === 'live') {
        if (!rec || rec.endStep != null) return null;
        rec.endStep = rec.inputs.length; rec.endHash = stateHash(); rec.result = res; stats.ends++;
        var prevBest = runs.best, isBest = better(rec, runs.best);
        runs.last = rec;
        if (isBest) { runs.prev = prevBest; runs.best = rec; persist(); }
        var info = { steps: rec.endStep, ms: rec.endStep * stepMs, won: res.won, score: res.score, best: isBest, delta: isBest && prevBest ? (rec.endStep - prevBest.endStep) * stepMs : null, hash: rec.endHash };
        banner = { kind: isBest && prevBest ? 'best' : isBest ? 'first' : res.won ? 'done' : 'lost', ms: info.ms, delta: info.delta, t0: tick };
        call(o.onEnd, info); if (isBest) call(o.onBest, info);
        return info;
      }
      if (play && play.cardT == null) play.cardT = tick;
      if (play && play.endHash == null) {
        play.endHash = stateHash(); play.endAt = play.cursor;
        play.match = play.run.endHash != null && play.endHash === play.run.endHash && play.endAt === play.run.endStep;
        if (play.match) stats.matches++; else if (play.run.endHash != null && play.desyncAt == null) { play.desyncAt = play.cursor; stats.desyncs++; }
      }
      return null;
    }

    /* ---------- playback ---------- */
    function pick(which) {
      if (which && typeof which === 'object') return which;
      if (which === 'best') return runs.best;
      if (which === 'current') return rec;
      if (which === 'prev') return runs.prev;
      return runs.last || runs.best;
    }
    function startPlay(run, kind) {
      var lim = kind === 'play' && run.endStep != null ? Math.min(run.inputs.length, run.endStep + Math.round(750 / stepMs)) : run.inputs.length;
      play = { run: run, kind: kind, limit: lim, cursor: 0, speed: kind === 'play' ? P.speed : 1, paused: false, acc: 0, done: false, desyncAt: null,
        checked: 0, endHash: null, endAt: null, match: null, t0: tick, doneAt: null, drag: false };
      mode = kind;
      call(o.restart, run.seed, run.meta);
      play.cursor = 0;
    }
    function watch(which) {
      var run = pick(which);
      if (!run || typeof o.restart !== 'function' || typeof o.step !== 'function') return false;
      if (mode === 'verify') return false;
      if (rec && rec !== run && rec.endStep == null) rec = null;   // an unfinished live run is abandoned
      rec = null; banner = null;
      startPlay(run, 'play'); stats.watches++;
      play.ghost = ghostFor(run);
      return true;
    }
    function stop() {
      if (mode !== 'play') return false;
      mode = 'live'; play = null;
      if (typeof o.exit === 'function') call(o.exit);
      else call(o.restart, seedNow);
      return true;
    }
    function seek(target) {
      if (mode !== 'play' || !play) return false;
      var r = play.run, n = play.limit;
      target = clamp(Math.round(num(target, 0)), 0, n);
      if (target < play.cursor) {
        var keepDesync = play.desyncAt, keepChecked = play.checked, keepMatch = play.match, keepEnd = play.endHash;
        call(o.restart, r.seed, r.meta); play.cursor = 0; play.done = false; play.endHash = null; play.cardT = null;
        play.desyncAt = keepDesync; play.checked = keepChecked; play.match = keepMatch; if (keepMatch != null) play.endHash = keepEnd;
      }
      var guard = n + 10;
      while (play.cursor < target && guard-- > 0) { var before = play.cursor; call(o.step); if (play.cursor === before) break; }
      play.done = play.cursor >= n; play.doneAt = play.done ? tick : null; play.acc = 0;
      stats.seeks++;
      return true;
    }
    function pause(on) { if (mode !== 'play') return false; play.paused = on == null ? !play.paused : !!on; return play.paused; }
    function setSpeed(x) { if (mode !== 'play') { P.speed = clamp(num(x, P.speed), 0.25, 4); return P.speed; } play.speed = clamp(num(x, 1), 0.25, 4); play.acc = 0; return play.speed; }
    function speedStep(dir) { if (mode !== 'play') return; var i = SPEEDS.indexOf(play.speed); if (i < 0) i = 2; setSpeed(SPEEDS[clamp(i + dir, 0, SPEEDS.length - 1)]); }
    function steps() {
      if (RH) RH.inStep = 0;
      inStepFlag = false;
      if (mode === 'live') return 1;
      if (mode !== 'play') return 0;
      if (play.paused || play.done) {
        tick++;
        if (play.done && play.doneAt == null) play.doneAt = tick;
        if (play.done && P.autoExit > 0 && !play.paused && tick - play.doneAt > P.autoExit * 1000 / stepMs) stop();
        return 0;
      }
      play.acc += play.speed;
      var k = Math.floor(play.acc + 1e-9); play.acc -= k;
      if (k === 0) tick++;
      return k;
    }
    function verify(which) {
      var run = pick(which || 'current');
      if (!run || mode !== 'live' || typeof o.restart !== 'function' || typeof o.step !== 'function') return null;
      var current = run === rec, liveHash = stateHash(), n = run.inputs.length;
      var keepRec = rec, keepBanner = banner;
      startPlay(run, 'verify'); stats.verifies++;
      var guard = n + 10;
      while (play.cursor < n && guard-- > 0) { var before = play.cursor; call(o.step); if (play.cursor === before) break; }
      var finalHash = stateHash();
      var out = { steps: n, cursor: play.cursor, checked: play.checked, desyncAt: play.desyncAt, endHash: run.endHash, replayEndHash: play.endHash,
        match: run.endHash != null ? play.match === true : null, liveHash: current ? liveHash : null, finalHash: finalHash,
        roundTrip: current ? finalHash === liveHash : null };
      out.ok = out.desyncAt == null && out.match !== false && out.roundTrip !== false;
      mode = 'live'; play = null; rec = current ? keepRec : null; banner = keepBanner;
      if (RH) RH.inStep = 0;
      lastVerify = out; call(o.onVerify, out);
      return out;
    }

    /* ---------- ghost ---------- */
    function ghostFor(watching) {
      if (P.ghost === 'off') return null;
      var g = P.ghost === 'last' ? runs.last : runs.best;
      if (watching && g === watching) g = P.ghost === 'last' ? null : runs.prev;
      if (!g || g.endStep == null || !g.poses.length) return null;
      return g;
    }
    function ghostIndex() {
      if (mode === 'live') return rec && rec.endStep == null ? rec.inputs.length : -1;   // pose i = state after i steps
      if (mode === 'play' && play) return play.cursor;
      return -1;
    }
    function ghostInfo() {
      var g = mode === 'play' ? play && play.ghost : ghostFor(null);
      var i = ghostIndex();
      if (!g || i < 0) return null;
      var endI = g.endStep, fin = i >= endI, pi = Math.min(i, endI - 1, g.poses.length - 1), pose = g.poses[pi];
      if (!pose) return null;
      var a = P.ghostAlpha * clamp(i / 20, 0, 1);
      if (fin) a *= clamp(1 - (i - endI) / 90, 0, 1);
      if (a <= 0.01) return null;
      return { run: g, index: pi, pose: pose, alpha: a, finished: fin };
    }
    function drawGhost(ctx) {
      ghostRect = null;
      try {
        if (!ctx || typeof o.drawGhost !== 'function') return null;
        var gi = ghostInfo(); if (!gi) return null;
        var res = composite(ctx, function (lc) { return call(o.drawGhost, lc, gi.pose, null); }, { tint: P.tint, alpha: gi.alpha });
        if (!res) return null;
        stats.ghostDraws++;
        var box = res.box, T = res.T;
        if (box) {
          ghostRect = { x: box.x, y: box.y, w: box.w, h: box.h, T: T ? [T.a, T.d, T.e, T.f] : [1, 1, 0, 0], alpha: gi.alpha };
          if (P.tag === 'on' || (P.tag === 'start' && gi.index < 170)) ghostTag(ctx, box, gi, T, P.tag === 'start' ? clamp((170 - gi.index) / 25, 0, 1) : 1);
        }
        return { pose: gi.pose, index: gi.index, alpha: gi.alpha, rect: box };
      } catch (e) { errors++; return null; }
    }
    function ghostTag(ctx, box, gi, T, fade) {
      var label = gi.finished ? 'FINISH' : 'BEST';
      if (mode === 'play' && play && gi.run === runs.prev) label = gi.finished ? 'FINISH' : 'OLD BEST';
      if (P.ghost === 'last') label = gi.finished ? 'FINISH' : 'LAST';
      var vs = viewScale(ctx), pixel = isPixel(), TI = TINTS[P.tint];
      ctx.save(); ctx.setTransform(vs.sx, 0, 0, vs.sy, 0, 0); ctx.globalAlpha = Math.min(1, gi.alpha + 0.25) * (fade == null ? 1 : fade);
      var cx = (box.x + box.w / 2) / vs.sx, top = box.y / vs.sy;
      if (pixel) {
        var q = hudK, w = textW(label, q), x = Math.round(cx - w / 2), y = Math.round(top - 8 * q);
        var tb = { x: x - 2 * q, y: y - q, w: w + 3 * q, h: 8 * q }, hidden = uiRects().concat(lastDrawn).some(function (r) { return hits(tb, r); });
        if (hidden) { ctx.restore(); return; }   // never half under the game's HUD or the module's own panels
        ctx.fillStyle = 'rgba(6,14,24,0.86)'; ctx.fillRect(x - 2 * q, y - q, w + 3 * q, 7 * q);
        ctx.fillStyle = TI.deep; ctx.fillRect(x - 2 * q, y + 6 * q, w + 3 * q, q);
        pText(ctx, label, x, y, q, TI.acc, null);
      } else {
        var fs = Math.max(10, Math.round(vs.h * 0.022)); ctx.font = '700 ' + fs + 'px ui-monospace, Menlo, Consolas, monospace';
        var tw = ctx.measureText(label).width, px = cx - tw / 2, py = top - fs - 8;
        rr(ctx, px - 6, py - 3, tw + 12, fs + 6, 4); ctx.fillStyle = 'rgba(6,14,24,0.72)'; ctx.fill();
        ctx.fillStyle = TI.acc; ctx.textBaseline = 'top'; ctx.fillText(label, px, py);
      }
      ctx.restore();
    }

    /* ---------- HUD ---------- */
    function viewScale(ctx) {
      var cv = ctx && ctx.canvas, vw = (o.view && o.view.w) || (cv && cv.width) || 320, vh = (o.view && o.view.h) || (cv && cv.height) || 180;
      return { w: vw, h: vh, sx: cv ? cv.width / vw : 1, sy: cv ? cv.height / vh : 1 };
    }
    var viewH = (o.view && o.view.h) || 180, cssK = 1, hudK = 1;
    function measureCss(vs) {   // CSS px per view px of the canvas on the page (phones show a 320 px view at ~1.1x)
      cssK = 1;
      try { var cvEl = canvasEl || null; if (cvEl && cvEl.getBoundingClientRect) { var bw = cvEl.getBoundingClientRect().width; if (bw > 0) cssK = bw / vs.w; } } catch (e) { cssK = 1; }
      if (!(cssK > 0.05)) cssK = 1;
    }
    function pixelK(vs) {   // whole art px per font px: base from the view, raised until 3x5 glyphs are >= 10 CSS px tall
      var base = Math.max(1, Math.floor(vs.h / 180)), need = Math.ceil(2 / cssK - 1e-6);
      return P.hudScale !== 'auto' && num(P.hudScale, 0) > 0 ? Math.round(num(P.hudScale, 1)) : Math.max(base, Math.min(3, need));
    }
    function isPixel() { return P.render === 'pixel' || (P.render === 'auto' && viewH <= 270); }
    function textW(s, k) { return Math.max(0, s.length * 4 - 1) * k; }
    function pText(ctx, s, x, y, k, col, shadow) {
      s = String(s);
      for (var pass = shadow ? 0 : 1; pass < 2; pass++) {
        ctx.fillStyle = pass === 0 ? shadow : col;
        var ox = pass === 0 ? k : 0, oy = pass === 0 ? k : 0;
        for (var i = 0; i < s.length; i++) {
          var gph = PF[s[i]] || PF[s[i].toUpperCase()] || PF[' '];
          for (var b = 0; b < 15; b++) if (gph.charCodeAt(b) === 49) ctx.fillRect(x + (i * 4 + b % 3) * k + ox, y + Math.floor(b / 3) * k + oy, k, k);
        }
      }
    }
    function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); }
    function hits(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
    function uiRects() { var r = call(o.uiRects, undefined, undefined, []); return Array.isArray(r) ? r.filter(function (q) { return q && isFinite(q.x) && isFinite(q.w); }) : []; }
    function place(w, h, prefs, rects, vw, vh, m) {
      for (var i = 0; i < prefs.length; i++) {
        var p = prefs[i], x = p[0] === 'l' ? m : p[0] === 'r' ? vw - m - w : Math.round((vw - w) / 2), y = p[1] === 't' ? m : vh - m - h, tries = 0, moved = true;
        var box = { x: x, y: y, w: w, h: h };
        while (moved && tries++ < 6) { moved = false; for (var j = 0; j < rects.length; j++) if (hits(box, rects[j])) { box.y = p[1] === 't' ? rects[j].y + rects[j].h + 2 : rects[j].y - h - 2; moved = true; } }
        if (box.y >= 0 && box.y + h <= vh) { var ok = true; for (j = 0; j < rects.length; j++) if (hits(box, rects[j])) ok = false; if (ok) return box; }
      }
      return null;
    }
    function spLabel(v) { return 'x' + (v < 1 ? String(v).replace(/^0/, '') : v); }
    function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
    function splitMs() {   // live run vs ghost: negative = ahead
      var g = ghostFor(null); if (!g || !rec || rec.endStep != null || typeof o.progress !== 'function') return null;
      var i = rec.inputs.length - 1; if (i < 30) return null;
      var pNow = num(call(o.progress, undefined, undefined, null), null); if (pNow == null || !g.prog) return null;
      // first ghost step whose progress reached the player's progress
      var a = 0, b = g.prog.length - 1; if (g.prog[b] < pNow) return null;
      while (a < b) { var m = (a + b) >> 1; if (g.prog[m] >= pNow) b = m; else a = m + 1; }
      return (i - a) * stepMs;
    }
    function draw(ctx) {
      lastDrawn = [];
      if (RH) RH.inStep = 0; inStepFlag = false;
      try {
        if (!ctx || !ctx.canvas || P.hud === 'off') return;
        var vs = viewScale(ctx); viewH = vs.h;
        measureCss(vs);
        var pixel = isPixel(), k = pixel ? pixelK(vs) : 1, TI = TINTS[P.tint], rects = uiRects();
        hudK = k;
        ctx.save(); ctx.setTransform(vs.sx, 0, 0, vs.sy, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = !pixel;
        if (mode === 'play' && play) drawReplayHud(ctx, vs, pixel, k, TI, rects);
        else drawLiveHud(ctx, vs, pixel, k, TI, rects);
        ctx.restore();
      } catch (e) { errors++; try { ctx.restore(); } catch (e2) { /* ignore */ } }
    }
    function fontPx(vs) { return Math.max(11, Math.round(vs.h * 0.026), Math.ceil(11 / cssK)); }
    function sText(ctx, s, x, y, fs, col, weight) { ctx.font = (weight || 700) + ' ' + fs + 'px ui-monospace, Menlo, Consolas, monospace'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(s, x + 1, y + 1); ctx.fillStyle = col; ctx.fillText(s, x, y); return ctx.measureText(s).width; }
    function sW(ctx, s, fs, weight) { ctx.font = (weight || 700) + ' ' + fs + 'px ui-monospace, Menlo, Consolas, monospace'; return ctx.measureText(s).width; }
    function panel(ctx, b, pixel, TI, solid) {
      if (pixel) {
        ctx.fillStyle = solid ? 'rgb(10,14,24)' : 'rgba(8,12,22,0.86)'; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(b.x, b.y, b.w, 1);
        ctx.fillStyle = TI.deep; ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1);
        ctx.fillStyle = '#05070d'; ctx.fillRect(b.x - 1, b.y, 1, b.h); ctx.fillRect(b.x + b.w, b.y, 1, b.h); ctx.fillRect(b.x, b.y - 1, b.w, 1); ctx.fillRect(b.x, b.y + b.h, b.w, 1);
      } else {
        rr(ctx, b.x, b.y, b.w, b.h, Math.min(8, b.h / 3)); ctx.fillStyle = solid ? 'rgba(10,14,24,0.96)' : 'rgba(8,12,22,0.78)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    function drawLiveHud(ctx, vs, pixel, k, TI, rects) {
      var g = ghostFor(null), running = rec && rec.endStep == null;
      var showPanel = running;
      if (showPanel) {
        var t = (rec.inputs.length) * stepMs, sp = g && P.split === 'on' ? splitMs() : null;
        var l1 = 'TIME ' + fmtTime(t), l2 = g ? 'BEST ' + fmtTime(g.endStep * stepMs) : 'BEST -:--.--', l3 = sp == null ? '' : (sp <= 0 ? '-' : '+') + (Math.abs(sp) / 1000).toFixed(2);
        var b;
        if (pixel) {
          var w = Math.max(textW(l1, k), textW(l2, k) + (P.split === 'on' && typeof o.progress === 'function' ? textW('+00.00', k) + 6 * k : 0)) + 8 * k, h = 15 * k;   // one size for every run   // the split's room is kept even while it is blank: the panel never resizes mid-run
          b = place(w, h, [['r', 't'], ['l', 't'], ['c', 't'], ['r', 'b']], rects, vs.w, vs.h, 3);
          if (b) {
            panel(ctx, b, true, TI);
            ctx.fillStyle = '#ff4a5a'; ctx.globalAlpha = 0.65 + 0.35 * Math.sin(tick / 12); ctx.fillRect(b.x + 3 * k, b.y + 3 * k, 2 * k, 2 * k); ctx.globalAlpha = 1;
            pText(ctx, l1, b.x + 6 * k, b.y + 2 * k, k, '#f2f5ff', null);
            if (l2) {
              pText(ctx, l2, b.x + 6 * k, b.y + 8 * k, k, g ? TI.acc : '#6a7690', null);
              if (l3) pText(ctx, l3, b.x + b.w - 3 * k - textW(l3, k), b.y + 8 * k, k, sp <= 0 ? '#7dff9a' : '#ff8a7a', null);
            }
          }
        } else {
          var fs = fontPx(vs), pad = Math.round(fs * 0.6), w2 = Math.max(sW(ctx, l1, fs), sW(ctx, l2, fs) + (P.split === 'on' && typeof o.progress === 'function' ? sW(ctx, '+00.00', fs) + fs : 0)) + pad * 2 + fs, h2 = fs * 2 + pad * 2 + 4;
          b = place(w2, h2, [['r', 't'], ['l', 't'], ['c', 't'], ['r', 'b']], rects, vs.w, vs.h, Math.round(vs.h * 0.02));
          if (b) {
            panel(ctx, b, false, TI);
            ctx.fillStyle = '#ff4a5a'; ctx.globalAlpha = 0.65 + 0.35 * Math.sin(tick / 12); ctx.beginPath(); ctx.arc(b.x + pad + fs * 0.3, b.y + pad + fs * 0.5, fs * 0.28, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
            sText(ctx, l1, b.x + pad + fs, b.y + pad, fs, '#f2f5ff');
            if (l2) { sText(ctx, l2, b.x + pad + fs, b.y + pad + fs + 4, fs, TI.acc); if (l3) sText(ctx, l3, b.x + b.w - pad - sW(ctx, l3, fs), b.y + pad + fs + 4, fs, sp <= 0 ? '#7dff9a' : '#ff8a7a'); }
          }
        }
        if (b) lastDrawn.push({ kind: 'trial', x: b.x, y: b.y, w: b.w, h: b.h });
      }
      // end-of-run banner (shown once per run: glides in, holds, fades) and the watch hint
      if (banner && rec && rec.endStep != null) {
        var age = tick - banner.t0, LIFE = 210;
        if (age < LIFE) {
          var a = reduced() ? (age < 12 ? age / 12 : age > LIFE - 30 ? (LIFE - age) / 30 : 1) : ease(age / 14) * (age > LIFE - 30 ? (LIFE - age) / 30 : 1), slide = reduced() ? 0 : (1 - ease(age / 14)) * 6;
          var title = banner.kind === 'best' ? 'NEW BEST' : banner.kind === 'first' ? 'FIRST TIME SET' : banner.kind === 'done' ? 'FINISHED' : 'RUN OVER';
          var sub = banner.kind === 'lost' ? 'NO TIME' : fmtTime(banner.ms) + (banner.delta != null ? '  ' + (banner.delta <= 0 ? '-' : '+') + (Math.abs(banner.delta) / 1000).toFixed(2) : '');
          drawBanner(ctx, vs, pixel, k, TI, rects, title, sub, a, slide, banner.kind === 'best' || banner.kind === 'first');
        }
      }
      var canWatch = (runs.last || runs.best) && (!rec || rec.endStep != null) && typeof o.restart === 'function';
      if (canWatch && o.keyboard !== false && P.hud !== 'off') {
        var hint = P.watchKey.toUpperCase() + ' WATCH REPLAY';
        if (pixel) {
          var cap = P.watchKey.toUpperCase().slice(0, 1), hw = textW(hint.slice(2), k) + 16 * k, hh = 11 * k, hb = place(hw, hh, [['c', 'b'], ['l', 'b'], ['r', 'b']], rects, vs.w, vs.h, 3);
          if (hb) {
            panel(ctx, hb, true, TI);
            ctx.fillStyle = '#e6ecfa'; ctx.fillRect(hb.x + 3 * k, hb.y + 2 * k, 7 * k, 7 * k); ctx.fillStyle = '#9aa6c0'; ctx.fillRect(hb.x + 3 * k, hb.y + 8 * k, 7 * k, k);
            pText(ctx, cap, hb.x + 5 * k, hb.y + 3 * k, k, '#0b1020', null);
            pText(ctx, hint.slice(2), hb.x + 13 * k, hb.y + 3 * k, k, '#e6ecfa', null);
            lastDrawn.push({ kind: 'hint', x: hb.x, y: hb.y, w: hb.w, h: hb.h });
          }
        } else {
          var fs3 = fontPx(vs), hw2 = sW(ctx, hint, fs3) + fs3 * 2, hb2 = place(hw2, fs3 * 2, [['c', 'b'], ['l', 'b'], ['r', 'b']], rects, vs.w, vs.h, Math.round(vs.h * 0.02));
          if (hb2) { panel(ctx, hb2, false, TI); sText(ctx, hint, hb2.x + fs3, hb2.y + fs3 / 2, fs3, '#e6ecfa'); lastDrawn.push({ kind: 'hint', x: hb2.x, y: hb2.y, w: hb2.w, h: hb2.h }); }
        }
      }
    }
    function drawBanner(ctx, vs, pixel, k, TI, rects, title, sub, a, slide, gold) {
      ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
      var b;
      if (pixel) {
        var tk = k * 2; while (tk > k && textW(title, tk) + 16 * k > vs.w - 8) tk--;
        var w = Math.max(textW(title, tk), textW(sub, k)) + 16 * k, h = 9 * k + 5 * tk + 3 * k;
        b = place(w, h, [['c', 't']], rects, vs.w, vs.h, Math.round(vs.h * 0.2));
        if (b) {
          b.y -= Math.round(slide);
          panel(ctx, b, true, TI, true);
          ctx.fillStyle = gold ? '#ffcf4a' : TI.g; ctx.fillRect(b.x, b.y, b.w, k); ctx.fillRect(b.x, b.y + b.h - k, b.w, k);
          pText(ctx, title, Math.round(b.x + (b.w - textW(title, tk)) / 2), b.y + 3 * k, tk, gold ? '#ffe28a' : '#ffffff', null);
          pText(ctx, sub, Math.round(b.x + (b.w - textW(sub, k)) / 2), b.y + 3 * k + 5 * tk + 3 * k, k, '#e6ecfa', null);
        }
      } else {
        var fs = Math.round(fontPx(vs) * 1.9), fs2 = fontPx(vs), w2 = Math.max(sW(ctx, title, fs, 800), sW(ctx, sub, fs2)) + fs * 1.6, h2 = fs + fs2 + fs * 0.9;
        b = place(w2, h2, [['c', 't']], rects, vs.w, vs.h, Math.round(vs.h * 0.2));
        if (b) {
          b.y -= slide * 2;
          panel(ctx, b, false, TI);
          var tw = sW(ctx, title, fs, 800); sText(ctx, title, b.x + (b.w - tw) / 2, b.y + fs * 0.3, fs, gold ? '#ffd86a' : '#ffffff', 800);
          var sw = sW(ctx, sub, fs2); sText(ctx, sub, b.x + (b.w - sw) / 2, b.y + fs * 0.3 + fs + 4, fs2, '#e6ecfa');
        }
      }
      if (b) lastDrawn.push({ kind: 'banner', x: b.x, y: b.y, w: b.w, h: b.h });
      ctx.restore();
    }
    var barRects = null;
    function drawReplayHud(ctx, vs, pixel, k, TI, rects) {
      var r = play.run, n = Math.max(1, play.limit), cur = play.cursor;
      // frame: thin tinted edge and corner marks so the viewer always knows this is a replay
      var m = pixel ? 1 : Math.max(2, Math.round(vs.h * 0.004));
      ctx.fillStyle = 'rgba(8,12,22,0.35)'; ctx.fillRect(0, 0, vs.w, m); ctx.fillRect(0, vs.h - m, vs.w, m); ctx.fillRect(0, 0, m, vs.h); ctx.fillRect(vs.w - m, 0, m, vs.h);
      var cl = pixel ? 8 : Math.round(vs.h * 0.04);
      ctx.fillStyle = TI.g; ctx.globalAlpha = 0.85;
      [[0, 0, 1, 1], [vs.w, 0, -1, 1], [0, vs.h, 1, -1], [vs.w, vs.h, -1, -1]].forEach(function (c) { ctx.fillRect(c[2] > 0 ? c[0] : c[0] - cl, c[3] > 0 ? c[1] : c[1] - m, cl, m); ctx.fillRect(c[2] > 0 ? c[0] : c[0] - m, c[3] > 0 ? c[1] : c[1] - cl, m, cl); });
      ctx.globalAlpha = 1;
      // REPLAY tag
      var status = play.desyncAt != null ? 'DESYNC' : play.match === true ? 'MATCH' : play.done && r.endHash == null ? 'END' : 'SYNC ' + play.checked;
      var stCol = play.desyncAt != null ? '#ff6a6a' : play.match === true ? '#7dff9a' : '#c8d2e8';
      var tag = play.paused ? 'PAUSED' : play.speed !== 1 ? 'REPLAY ' + spLabel(play.speed) : 'REPLAY';
      if (pixel) {
        var tw = textW(tag, k) + 10 * k, tb = place(tw, 9 * k, [['l', 't'], ['r', 't']], rects, vs.w, vs.h, 3);
        if (tb) { panel(ctx, tb, true, TI); if (play.paused) { ctx.fillStyle = TI.g; ctx.fillRect(tb.x + 3 * k, tb.y + 2 * k, k, 5 * k); ctx.fillRect(tb.x + 5 * k, tb.y + 2 * k, k, 5 * k); } else { ctx.fillStyle = '#ff4a5a'; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(tick / 10); ctx.fillRect(tb.x + 3 * k, tb.y + 3 * k, 3 * k, 3 * k); } ctx.globalAlpha = 1; pText(ctx, tag, tb.x + 8 * k, tb.y + 2 * k, k, '#ffffff', null); lastDrawn.push({ kind: 'tag', x: tb.x, y: tb.y, w: tb.w, h: tb.h }); }
      } else {
        var fsT = fontPx(vs), tw2 = sW(ctx, tag, fsT) + fsT * 2.2, tb2 = place(tw2, fsT * 1.9, [['l', 't'], ['r', 't']], rects, vs.w, vs.h, Math.round(vs.h * 0.02));
        if (tb2) { panel(ctx, tb2, false, TI); ctx.fillStyle = '#ff4a5a'; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(tick / 10); ctx.beginPath(); ctx.arc(tb2.x + fsT * 0.8, tb2.y + tb2.h / 2, fsT * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; sText(ctx, tag, tb2.x + fsT * 1.4, tb2.y + (tb2.h - fsT) / 2, fsT, '#ffffff'); lastDrawn.push({ kind: 'tag', x: tb2.x, y: tb2.y, w: tb2.w, h: tb2.h }); }
      }
      // control bar: play/pause, speed, scrubber, time, status
      var tot = r.endStep != null ? r.endStep : n, ft = pixel && k > 1 ? function (ms) { return fmtTime(ms).slice(0, -1); } : fmtTime, timeTxt = ft(Math.min(cur, tot) * stepMs) + '/' + ft(tot * stepMs), spTxt = spLabel(play.speed);
      var resting = play.paused || play.done || (play.endAt != null && cur >= play.endAt);
      var bar;
      if (pixel) {
        var bh = 13 * k, bw = Math.round(Math.min(vs.w - 8, Math.max(220 * k, vs.w * 0.86)));
        bar = place(bw, bh, [['c', 'b'], ['c', 't']], rects, vs.w, vs.h, 3);
        if (!bar) return;
        bar.x = Math.round(bar.x); panel(ctx, bar, true, TI, true);
        var x = bar.x + 4 * k, cy = bar.y + Math.round(bh / 2);
        // play / pause icon
        var ib = { x: x, y: bar.y + 3 * k, w: 7 * k, h: 7 * k };
        ctx.fillStyle = '#ffffff';
        if (resting) { for (var i = 0; i < 4; i++) ctx.fillRect(ib.x + i * k * 1, ib.y + i * k, 2 * k, (7 - 2 * i) * k); }
        else { ctx.fillRect(ib.x, ib.y, 2 * k, 7 * k); ctx.fillRect(ib.x + 4 * k, ib.y, 2 * k, 7 * k); }
        x += 10 * k;
        var spb = { x: x - 2 * k, y: bar.y + 2 * k, w: textW('x.25', k) + 4 * k, h: 9 * k };
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(spb.x, spb.y, spb.w, spb.h);
        pText(ctx, spTxt, spb.x + 2 * k, bar.y + 4 * k, k, play.speed === 1 ? '#e6ecfa' : TI.acc, null);
        x = spb.x + spb.w + 5 * k;
        var stW = textW('SYNC 999', k) + 6 * k, tmW = textW(timeTxt, k);
        var sx1 = bar.x + bar.w - 4 * k - stW - 5 * k - tmW - 6 * k, track = { x: x, y: cy - k, w: Math.max(20, sx1 - x), h: 2 * k };
        ctx.fillStyle = '#2a3348'; ctx.fillRect(track.x, track.y, track.w, track.h);
        var fw = Math.round(track.w * cur / n);
        ctx.fillStyle = TI.g; ctx.fillRect(track.x, track.y, fw, track.h);
        // checkpoint ticks: verified green, desync red, ahead grey
        var every = r.checkEvery;
        for (var c = 0; c * every < n; c++) {
          var tx = track.x + Math.round(track.w * c * every / n), past = c * every < cur;
          ctx.fillStyle = play.desyncAt != null && c * every >= play.desyncAt && past ? '#ff6a6a' : past ? '#7dff9a' : '#55607a';
          if (track.w / Math.max(1, n / every) >= 3 || c % 5 === 0) ctx.fillRect(tx, track.y + track.h, k, k);
        }
        if (r.endStep != null && r.endStep < n) { ctx.fillStyle = '#ffcf4a'; ctx.fillRect(track.x + Math.round(track.w * r.endStep / n), track.y - k, k, track.h + 2 * k); }
        var kx = track.x + fw;
        ctx.fillStyle = '#05070d'; ctx.fillRect(kx - 2 * k, cy - 3 * k, 5 * k, 6 * k); ctx.fillStyle = '#ffffff'; ctx.fillRect(kx - k, cy - 2 * k, 3 * k, 4 * k);
        pText(ctx, timeTxt, track.x + track.w + 6 * k, bar.y + 4 * k, k, '#e6ecfa', null);
        var sbx = bar.x + bar.w - 4 * k - stW;
        ctx.fillStyle = play.desyncAt != null ? 'rgba(255,90,90,0.18)' : play.match ? 'rgba(125,255,154,0.16)' : 'rgba(255,255,255,0.07)'; ctx.fillRect(sbx, bar.y + 2 * k, stW, 9 * k);
        pText(ctx, status.length > 8 ? status.slice(0, 8) : status, sbx + 3 * k, bar.y + 4 * k, k, stCol, null);
        barRects = { bar: bar, play: ib, speed: spb, track: { x: track.x, y: bar.y, w: track.w, h: bh } };
      } else {
        var fs = fontPx(vs), bh2 = Math.round(fs * 2.4), bw2 = Math.min(vs.w * 0.9, Math.max(fs * 40, vs.w * 0.7));
        bar = place(bw2, bh2, [['c', 'b'], ['c', 't']], rects, vs.w, vs.h, Math.round(vs.h * 0.03));
        if (!bar) return;
        panel(ctx, bar, false, TI, true);
        var pad = fs * 0.8, x2 = bar.x + pad, cy2 = bar.y + bh2 / 2;
        var ib2 = { x: x2, y: cy2 - fs * 0.55, w: fs * 1.1, h: fs * 1.1 };
        ctx.fillStyle = '#ffffff';
        if (resting) { ctx.beginPath(); ctx.moveTo(ib2.x, ib2.y); ctx.lineTo(ib2.x + ib2.w, cy2); ctx.lineTo(ib2.x, ib2.y + ib2.h); ctx.closePath(); ctx.fill(); }
        else { ctx.fillRect(ib2.x, ib2.y, ib2.w * 0.36, ib2.h); ctx.fillRect(ib2.x + ib2.w * 0.64, ib2.y, ib2.w * 0.36, ib2.h); }
        x2 += ib2.w + pad;
        var spw = sW(ctx, 'x.25', fs) + fs * 0.8, spb2 = { x: x2, y: cy2 - fs * 0.8, w: spw, h: fs * 1.6 };
        rr(ctx, spb2.x, spb2.y, spb2.w, spb2.h, fs * 0.3); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
        sText(ctx, spTxt, spb2.x + fs * 0.4, cy2 - fs / 2, fs, play.speed === 1 ? '#e6ecfa' : TI.acc);
        x2 += spw + pad;
        var stW2 = sW(ctx, 'SYNC 999', fs) + fs, tmW2 = sW(ctx, timeTxt, fs, 600), sx2 = bar.x + bar.w - pad - stW2 - pad - tmW2 - pad;
        var tr2 = { x: x2, y: cy2 - fs * 0.12, w: Math.max(30, sx2 - x2), h: Math.max(3, fs * 0.24) };
        rr(ctx, tr2.x, tr2.y, tr2.w, tr2.h, tr2.h / 2); ctx.fillStyle = '#2a3348'; ctx.fill();
        var fw2 = tr2.w * cur / n; rr(ctx, tr2.x, tr2.y, Math.max(tr2.h, fw2), tr2.h, tr2.h / 2); ctx.fillStyle = TI.g; ctx.fill();
        for (var c2 = 0; c2 * r.checkEvery < n; c2++) { var tx2 = tr2.x + tr2.w * c2 * r.checkEvery / n, past2 = c2 * r.checkEvery < cur; ctx.fillStyle = play.desyncAt != null && c2 * r.checkEvery >= play.desyncAt && past2 ? '#ff6a6a' : past2 ? '#7dff9a' : '#55607a'; if (tr2.w / Math.max(1, n / r.checkEvery) >= 5 || c2 % 5 === 0) ctx.fillRect(tx2, tr2.y + tr2.h + 2, 1.5, fs * 0.25); }
        if (r.endStep != null && r.endStep < n) { ctx.fillStyle = '#ffcf4a'; ctx.fillRect(tr2.x + tr2.w * r.endStep / n - 1, tr2.y - 3, 2, tr2.h + 6); }
        ctx.beginPath(); ctx.arc(tr2.x + fw2, cy2, fs * 0.45, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#05070d'; ctx.lineWidth = 2; ctx.stroke();
        sText(ctx, timeTxt, tr2.x + tr2.w + pad, cy2 - fs / 2, fs, '#e6ecfa', 600);
        var sbx2 = bar.x + bar.w - pad - stW2;
        rr(ctx, sbx2, cy2 - fs * 0.8, stW2, fs * 1.6, fs * 0.3); ctx.fillStyle = play.desyncAt != null ? 'rgba(255,90,90,0.2)' : play.match ? 'rgba(125,255,154,0.18)' : 'rgba(255,255,255,0.07)'; ctx.fill();
        sText(ctx, status, sbx2 + fs * 0.5, cy2 - fs / 2, fs, stCol);
        barRects = { bar: bar, play: ib2, speed: spb2, track: { x: tr2.x, y: bar.y, w: tr2.w, h: bh2 } };
      }
      lastDrawn.push({ kind: 'bar', x: bar.x, y: bar.y, w: bar.w, h: bar.h });
      // verdict card once the replay reached the run's end (glides in once, stays while the replay rests there)
      if (play.cardT != null && ((play.endAt != null && cur >= play.endAt) || (play.done && play.desyncAt != null))) {
        var age = tick - play.cardT, a = reduced() ? Math.min(1, age / 10) : ease(age / 16), ok = play.match === true && play.desyncAt == null;
        var t1 = ok ? 'END STATE MATCH' : 'DESYNC', t2 = ok ? 'HASH ' + String(play.endHash).slice(0, 8).toUpperCase() + '  ' + play.checked + ' CHECKS OK' : 'FIRST AT ' + fmtTime((play.desyncAt || 0) * stepMs);
        ctx.save(); ctx.globalAlpha = a;
        var cb;
        if (pixel) {
          var ck = 2 * k; while (ck > k && textW(t1, ck) + 14 * k > vs.w - 8) ck--;
          if (k > 1 && textW(t2, k) + 14 * k > vs.w - 8) t2 = ok ? 'HASH ' + String(play.endHash).slice(0, 8).toUpperCase() : t2;
          var cw = Math.max(textW(t1, ck), textW(t2, k)) + 14 * k, chh = 9 * k + 5 * ck + 3 * k;
          cb = place(cw, chh, [['c', 't']], rects.concat(lastDrawn), vs.w, vs.h, Math.round(vs.h * 0.18));
          if (cb) {
            cb.y += Math.round((1 - a) * 5 * (reduced() ? 0 : 1));
            panel(ctx, cb, true, TI, true);
            ctx.fillStyle = ok ? '#7dff9a' : '#ff6a6a'; ctx.fillRect(cb.x, cb.y, cb.w, k); ctx.fillRect(cb.x, cb.y + cb.h - k, cb.w, k);
            pText(ctx, t1, Math.round(cb.x + (cb.w - textW(t1, ck)) / 2), cb.y + 3 * k, ck, ok ? '#b8ffc8' : '#ffb0b0', null);
            pText(ctx, t2, Math.round(cb.x + (cb.w - textW(t2, k)) / 2), cb.y + 3 * k + 5 * ck + 3 * k, k, '#dfe6f4', null);
          }
        } else {
          var f1 = Math.round(fontPx(vs) * 1.6), f2 = fontPx(vs), cw2 = Math.max(sW(ctx, t1, f1, 800), sW(ctx, t2, f2)) + f1 * 1.6, ch2 = f1 + f2 + f1;
          cb = place(cw2, ch2, [['c', 't']], rects.concat(lastDrawn), vs.w, vs.h, Math.round(vs.h * 0.18));
          if (cb) { cb.y += (1 - a) * 8; panel(ctx, cb, false, TI, true); var w1 = sW(ctx, t1, f1, 800); sText(ctx, t1, cb.x + (cb.w - w1) / 2, cb.y + f1 * 0.35, f1, ok ? '#9dffb4' : '#ff9a9a', 800); var w2 = sW(ctx, t2, f2); sText(ctx, t2, cb.x + (cb.w - w2) / 2, cb.y + f1 * 0.35 + f1 + 4, f2, '#dfe6f4'); }
        }
        if (cb) lastDrawn.push({ kind: 'verdict', x: cb.x, y: cb.y, w: cb.w, h: cb.h });
        ctx.restore();
      }
    }

    /* ---------- input (module keys and pointer) ---------- */
    var listeners = [];
    function on(t, ev, fn, opt) { try { t.addEventListener(ev, fn, opt); listeners.push([t, ev, fn, opt]); } catch (e) { /* no DOM */ } }
    function keyName(e) { var kk = (e.key || '').toLowerCase(); return kk === ' ' ? 'space' : kk; }
    function eat(e) { try { e.preventDefault(); e.stopImmediatePropagation(); } catch (x) { /* ignore */ } }
    if (o.keyboard !== false && root.addEventListener) {
      on(root, 'keydown', function (e) {
        try {
          var kk = keyName(e);
          if (mode === 'play') {
            if (e.repeat && (kk === P.watchKey || kk === 'escape' || kk === P.pauseKey)) { eat(e); return; }
            if (kk === P.watchKey || kk === 'escape') { stop(); eat(e); return; }
            if (kk === P.pauseKey) { pause(); eat(e); return; }
            if (kk === ']' || kk === '+' || kk === '=') { speedStep(1); eat(e); return; }
            if (kk === '[' || kk === '-') { speedStep(-1); eat(e); return; }
            if (kk === 'arrowleft' || kk === ',') { seek(play.cursor - (play.paused ? 1 : Math.round(2000 / stepMs))); eat(e); return; }
            if (kk === 'arrowright' || kk === '.') { seek(play.cursor + (play.paused ? 1 : Math.round(2000 / stepMs))); eat(e); return; }
            return;   // other keys reach the game, which ignores device input during a replay
          }
          if (mode === 'live' && kk === P.watchKey && !e.repeat && (runs.last || runs.best) && (!rec || rec.endStep != null)) { if (watch(e.shiftKey ? 'best' : 'last')) eat(e); }
        } catch (x) { errors++; }
      }, true);
    }
    function toView(e) { var vs = viewScale(canvasEl.getContext ? canvasEl.getContext('2d') : null), b = canvasEl.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width * vs.w, y: (e.clientY - b.top) / b.height * vs.h }; }
    function inR(p, q) { return q && p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h; }
    function scrubTo(p) { if (!barRects || !play) return; var t = barRects.track, f = clamp((p.x - t.x) / Math.max(1, t.w), 0, 1); seek(Math.round(f * play.limit)); }
    if (canvasEl && root.addEventListener) {
      on(canvasEl, 'pointerdown', function (e) {
        try {
          if (mode !== 'play' || !barRects) return;
          var p = toView(e);
          if (!inR(p, barRects.bar)) return;
          eat(e);
          if (inR(p, barRects.play)) { pause(); return; }
          if (inR(p, barRects.speed)) { var i = SPEEDS.indexOf(play.speed); setSpeed(SPEEDS[(i + 1) % SPEEDS.length]); return; }
          if (inR(p, barRects.track)) { play.drag = true; scrubTo(p); try { canvasEl.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } }
        } catch (x) { errors++; }
      }, true);
      on(canvasEl, 'pointermove', function (e) { try { if (mode === 'play' && play && play.drag) { eat(e); scrubTo(toView(e)); } } catch (x) { errors++; } }, true);
      on(canvasEl, 'pointerup', function (e) { if (play && play.drag) { play.drag = false; eat(e); } }, true);
    }

    function collectRandom() { if (RH && RH.calls) { randomCalls += RH.calls; RH.calls = 0; if (!randomWarned && mode === 'live' && rec) { randomWarned = true; warn('Math.random() was called during a recorded step: replays of this game will not match. Use the game\'s seeded RNG.'); } } }

    /* ---------- public ---------- */
    var api = {
      version: VERSION,
      begin: function (seed, meta) { try { return begin(seed, meta); } catch (e) { errors++; return false; } },
      input: function (raw) { try { collectRandom(); return input(raw); } catch (e) { errors++; return raw; } },
      end: function (r) { try { return end(r); } catch (e) { errors++; return null; } },
      steps: function () { try { collectRandom(); return steps(); } catch (e) { errors++; return 1; } },
      draw: function (ctx) { collectRandom(); draw(ctx); },
      drawGhost: drawGhost,
      watch: function (w) { try { return watch(w); } catch (e) { errors++; return false; } },
      stop: function () { try { return stop(); } catch (e) { errors++; return false; } },
      seek: function (s) { try { return seek(s); } catch (e) { errors++; return false; } },
      pause: pause, setSpeed: setSpeed,
      stepFrame: function (d) { return play ? seek(play.cursor + (d < 0 ? -1 : 1)) : false; },
      verify: function (w) { try { return verify(w); } catch (e) { errors++; mode = 'live'; play = null; return null; } },
      save: function (which) { var r = pick(which || 'best'); if (!r) return null; stats.saves++; return encodeRun(r); },
      load: function (text, as) { var r = decodeRun(text); if (!r) { stats.badLoads++; return null; } stats.loads++; if (as === 'last') runs.last = r; else { if (runs.best && runs.best !== r) runs.prev = runs.best; runs.best = r; } return { steps: r.inputs.length, endStep: r.endStep, seed: r.seed, result: r.result }; },
      run: function (which) { return pick(which) || null; },
      playing: function () { return mode === 'play'; },
      verifying: function () { return mode === 'verify'; },
      recording: function () { return mode === 'live' && !!rec && rec.endStep == null; },
      ghost: function () { var gi = ghostInfo(); return gi ? { pose: gi.pose, index: gi.index, alpha: gi.alpha, finished: gi.finished, rect: ghostRect } : null; },
      lastDrawn: function () { return lastDrawn.slice(); },
      setParams: function (p) { for (var key in p) if (p[key] != null && p[key] !== '') P[key] = p[key]; norm(); },
      params: function () { var c = {}; for (var key in P) c[key] = P[key]; return c; },
      hash: function () { return stateHash(); },
      stats: function () {
        var g = ghostInfo();
        return { mode: mode, recording: api.recording(), steps: rec ? rec.inputs.length : 0, ended: rec ? rec.endStep != null : false, seed: rec ? rec.seed : seedNow,
          dict: rec ? rec.dict.length : 0, last: runs.last ? { steps: runs.last.endStep, hash: runs.last.endHash, won: runs.last.result && runs.last.result.won } : null,
          best: runs.best ? { steps: runs.best.endStep, ms: runs.best.endStep * stepMs, hash: runs.best.endHash } : null,
          play: play ? { kind: play.kind, cursor: play.cursor, length: play.limit, endStep: play.run.endStep, speed: play.speed, paused: play.paused, done: play.done, checked: play.checked, desyncAt: play.desyncAt, match: play.match } : null,
          ghost: g ? { index: g.index, alpha: Math.round(g.alpha * 100) / 100, finished: g.finished, rect: ghostRect } : null,
          hudScale: hudK, cssScale: Math.round(cssK * 100) / 100, lastVerify: lastVerify, randomCalls: randomCalls, errors: errors, tick: tick, counts: JSON.parse(JSON.stringify(stats)) };
      },
      state: function () { return api.stats(); },
      destroy: function () { listeners.forEach(function (l) { try { l[0].removeEventListener(l[1], l[2], l[3]); } catch (e) { /* ignore */ } }); listeners = []; }
    };
    // ghost progress track: built lazily from the pose track (pose.p) or from o.progress values stored in poses
    var _end = end;
    end = function (r) { var info = _end(r); if (info && runs.last) buildProg(runs.last); return info; };
    function buildProg(run) { if (run.prog || !run.poses.length) return; if (!run.poses.some(function (p) { return p && typeof p.p === 'number'; })) return; var best = -Infinity; run.prog = run.poses.map(function (p) { if (p && typeof p.p === 'number' && p.p > best) best = p.p; return best; }); }
    var _pose = o.pose;
    if (typeof o.progress === 'function') o.pose = function () { var p = typeof _pose === 'function' ? _pose() : null; if (!p) return p; var c = {}; for (var kk in p) c[kk] = p[kk]; var pr = o.progress(); if (typeof pr === 'number' && isFinite(pr)) c.p = pr; return c; };
    var _load = api.load;
    api.load = function (t, as) { var r = _load(t, as); var run = as === 'last' ? runs.last : runs.best; if (r && run) buildProg(run); return r; };
    if (runs.best) buildProg(runs.best);
    return api;
  }

  var API = { create: create, composite: composite, version: VERSION, defaults: DEF, hash: hashOf, encode: encodeRun, decode: decodeRun, canon: canon, fmtTime: fmtTime };
  root.GameDNA_SeededReplay = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
