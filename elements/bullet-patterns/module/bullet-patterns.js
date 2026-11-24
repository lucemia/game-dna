/* bullet-patterns.js - Game DNA A-08 Bullet-pattern emitter (module v1.0.0)
 *
 * One plain script, no dependencies, no import/export. Defines one global: GameDNA_Bullets.
 * Bullet patterns described as data (fan, ring, spiral, aimed, flower, wave, line; layered and
 * split into sub-patterns; speed / acceleration / turn curves), a fixed pool of bullets (no
 * per-frame garbage), drawn in code with a bright core, coloured rim, dark outline and a soft
 * halo, tiny hit circles, optional grazing, bullet cancel, and a static safeGap() analysis that
 * says whether a pattern leaves the player a way through.
 *
 * Deterministic: everything advances in update(dtMs) from a seed; no Math.random, no wall clock.
 * The host keeps its own rules: the module only calls player() to read the hit circle, onHit()
 * to report a hit and onGraze() to report a graze. Source is ASCII only.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0';
  var TAU = Math.PI * 2, D2R = Math.PI / 180;

  /* ------------------------------------------------------------------ colours */
  // per hue: [core, body, rim, outline, halo]
  var HUES = {
    violet: ['#ffffff', '#d9a8ff', '#a548ff', '#26084e', '#9a48ff'],
    magenta: ['#ffffff', '#ffa8de', '#ff3aa8', '#46052e', '#ff3aa8'],
    cyan: ['#ffffff', '#9cf0ff', '#18bfff', '#032c48', '#22c0ff'],
    azure: ['#ffffff', '#a8c2ff', '#3c6cff', '#091648', '#3d6aff'],
    gold: ['#ffffff', '#ffe08a', '#ffa412', '#462600', '#ffa010'],
    ember: ['#ffffff', '#ffb894', '#ff5a1c', '#460e00', '#ff5418'],
    rose: ['#ffffff', '#ffaab2', '#ff3448', '#460510', '#ff3448'],
    lime: ['#ffffff', '#ccff96', '#6ed62a', '#143806', '#72dc26'],
    white: ['#ffffff', '#e2e8ff', '#a8b8ff', '#1e2246', '#b4c2ff']
  };
  var PALETTES = {
    arcane: ['violet', 'magenta'], ember: ['ember', 'gold'], frost: ['cyan', 'azure'],
    venom: ['lime', 'gold'], royal: ['gold', 'azure'], blood: ['rose', 'magenta'], mono: ['white', 'white']
  };
  function parseCol(c) {
    if (Array.isArray(c)) return c;
    if (typeof c !== 'string') return null;
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
    if (m) { var h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h, 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
    m = /^rgba?\(([^)]+)\)$/i.exec(c.trim());
    if (m) { var p = m[1].split(',').map(parseFloat); if (p.length >= 3) return [p[0] | 0, p[1] | 0, p[2] | 0]; }
    return null;
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function hueFrom(rgb) {   // a hue entry made from one colour (custom colours, skins)
    return [[255, 255, 255], mix(rgb, [255, 255, 255], 0.45), rgb, mix(rgb, [8, 4, 20], 0.78), rgb];
  }
  function hueEntry(name) {
    if (HUES[name]) return HUES[name].map(parseCol);
    var c = parseCol(name);
    return c ? hueFrom(c) : HUES.violet.map(parseCol);
  }

  /* ------------------------------------------------------------------ presets */
  // speeds px/s and sizes px at scale 1 (view height 360); angles in degrees, 0 = +x, 90 = +y (down)
  var PRESETS = {
    fan: { shape: 'fan', count: 7, spread: 70, speed: 120, aim: true, bursts: 3, interval: 260, kind: 'rice', size: 5 },
    ring: { shape: 'ring', count: 20, speed: 95, bursts: 3, interval: 420, rotate: 9, kind: 'orb', size: 5 },
    spiral: { shape: 'spiral', count: 4, speed: 100, bursts: 40, interval: 90, spin: 12, kind: 'orb', size: 4.5, colorBy: 'arm' },
    aimed: { shape: 'aimed', count: 3, spread: 24, speed: 170, aim: true, bursts: 4, interval: 170, kind: 'shard', size: 5.5, accel: 40 },
    flower: { shape: 'flower', count: 60, petals: 6, depth: 0.7, speed: 125, bursts: 1, kind: 'orb', size: 4, colorBy: 'petal' },
    wave: { shape: 'wave', count: 9, spread: 100, speed: 85, aim: true, bursts: 4, interval: 380, amp: 14, freq: 1.4, kind: 'rice', size: 4.5 },
    line: { shape: 'line', count: 14, width: 300, gapEvery: 5, speed: 70, bursts: 4, interval: 700, shiftGap: 2, kind: 'orb', size: 5 },
    bloom: { shape: 'ring', count: 6, speed: 95, accel: -70, min: 0, bursts: 1, kind: 'orb', size: 8,
      split: { at: 1300, pattern: { shape: 'ring', count: 8, speed: 80, kind: 'rice', size: 4, relative: true } } },
    helix: [{ shape: 'spiral', count: 2, speed: 100, bursts: 40, interval: 80, spin: 11, kind: 'rice', size: 4.5 },
      { shape: 'spiral', count: 2, speed: 100, bursts: 40, interval: 80, spin: -11, angle: 90, kind: 'rice', size: 4.5, color: 1 }],
    whirl: { shape: 'ring', count: 16, speed: 80, turn: 50, turnCurve: [[0, 1], [900, 0.2], [2000, 0]], bursts: 3, interval: 500, rotate: 11, kind: 'shard', size: 4.5 },
    rain: { shape: 'line', count: 16, width: 320, gapEvery: 4, speed: 60, speedJitter: 0.14, gravity: 90, bursts: 5, interval: 650, shiftGap: 1, kind: 'shard', size: 4.5 }
  };
  var SHAPES = ['single', 'fan', 'ring', 'spiral', 'aimed', 'flower', 'wave', 'line'];
  var KINDS = ['orb', 'rice', 'shard'];

  var DEFAULTS = { speed: 1, density: 1, size: 1, hitbox: 0.4, halo: 0.6, graze: 'on', grazeRange: 9, palette: 'arcane',
    render: 'auto', max: 2000, flash: 'on', reduced: 'system', damage: 2, clearRadius: 0 };

  function num(v, d) { if (v == null || v === '') return d; v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // piecewise-linear curve [[ms, value], ...] at age ms
  function curveAt(c, ms) {
    if (!c || !c.length) return 1;
    if (ms <= c[0][0]) return c[0][1];
    for (var i = 1; i < c.length; i++) if (ms <= c[i][0]) {
      var a = c[i - 1], b = c[i], t = (ms - a[0]) / ((b[0] - a[0]) || 1);
      return a[1] + (b[1] - a[1]) * t;
    }
    return c[c.length - 1][1];
  }

  // normalise one pattern (object) into a frozen-ish record with defaults; arrays become layers
  function normPattern(p, depth) {
    if (typeof p === 'string') p = PRESETS[p];
    if (!p) return null;
    if (Array.isArray(p)) {
      var layers = [];
      for (var i = 0; i < p.length; i++) { var q = normPattern(p[i], depth); if (q) layers.push(q); }
      return layers.length ? { __norm: true, layers: layers, name: '' } : null;
    }
    if (p.__norm) return p;
    var shape = SHAPES.indexOf(p.shape) >= 0 ? p.shape : 'fan';
    var n = {
      __norm: true, name: p.name || '', shape: shape,
      count: Math.max(1, Math.round(num(p.count, shape === 'single' ? 1 : shape === 'ring' ? 16 : shape === 'spiral' ? 3 : 5))),
      spread: num(p.spread, shape === 'aimed' ? 12 : 60), angle: num(p.angle, 0), aim: p.aim === true || (p.aim == null && shape === 'aimed'),
      speed: num(p.speed, 110), accel: num(p.accel, 0), min: num(p.min, 0), max: num(p.max, 9999), speedCurve: p.speedCurve || null,
      turn: num(p.turn, 0), turnCurve: p.turnCurve || null, gravity: num(p.gravity, 0),
      bursts: Math.max(1, Math.round(num(p.bursts, 1))), interval: Math.max(16, num(p.interval, 150)), rotate: num(p.rotate, 0),
      spin: num(p.spin, shape === 'spiral' ? 12 : 0), speedStep: num(p.speedStep, 0), jitter: num(p.jitter, 0), speedJitter: clamp(num(p.speedJitter, 0), 0, 0.9),
      petals: Math.max(1, Math.round(num(p.petals, 5))), depth: clamp(num(p.depth, 0.5), 0, 0.95),
      amp: num(p.amp, shape === 'wave' ? 14 : 0), freq: num(p.freq, 1.4), width: num(p.width, 240),
      gapEvery: Math.max(0, Math.round(num(p.gapEvery, 0))), shiftGap: Math.round(num(p.shiftGap, 0)),
      kind: KINDS.indexOf(p.kind) >= 0 ? p.kind : 'orb', size: Math.max(1.5, num(p.size, 5)), life: num(p.life, 9000),
      color: p.color == null ? null : p.color, colorBy: p.colorBy || 'burst', damage: num(p.damage, 0),
      relative: !!p.relative, split: null
    };
    if (p.split && p.split.pattern && (depth | 0) < 3) {
      var sp = normPattern(p.split.pattern, (depth | 0) + 1);
      if (sp) n.split = { at: Math.max(16, num(p.split.at, 800)), pattern: sp, keep: !!p.split.keep };
    }
    return n;
  }

  /* ------------------------------------------------------------------ sprite generation */
  // signed distance (px) to a bullet shape of radius r, local coords with +x = heading
  function sdf(kind, x, y, r) {
    if (kind === 'rice') { var a = r * 1.55, b = r * 0.72, k = Math.sqrt((x * x) / (a * a) + (y * y) / (b * b)); return (k - 1) * b; }
    if (kind === 'shard') {
      // kite: long point forward, short tail
      var ax = x >= 0 ? r * 1.75 : r * 1.05, by = r * 0.62;
      return (Math.abs(x) / ax + Math.abs(y) / by - 1) * Math.min(ax, by) * 0.85;
    }
    return Math.sqrt(x * x + y * y) - r;
  }
  function makeCanvas(w, h) {
    if (typeof document !== 'undefined' && document.createElement) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    return null;
  }
  // one bullet sprite: body (outline, rim, body, core) or halo; dev = device px per game px; pixel = hard edges at dev 1
  function buildSprite(kind, r, hue, dev, angle, layer, pixel) {
    var ext = layer === 'halo' ? (pixel ? r * 1.5 + 2.5 : r * 2.1 + 2) : r * (kind === 'orb' ? 1 : 1.8) + 2;
    var half = Math.ceil(ext * dev) + 1, W = half * 2 + (pixel ? 1 : 0);
    var c = makeCanvas(W, W); if (!c) return null;
    var g = c.getContext('2d'); if (!g) return null;
    var img = g.createImageData(W, W), d = img.data, ca = Math.cos(-angle), sa = Math.sin(-angle);
    var core = hue[0], body = hue[1], rim = hue[2], out = hue[3], halo = hue[4];
    var ow = pixel ? 1 : Math.max(0.9, r * 0.2);
    var cx = pixel ? half + 0.5 : half, aa = pixel ? 0 : 1 / dev;
    for (var py = 0; py < W; py++) for (var px = 0; px < W; px++) {
      var gx = (px + 0.5 - cx) / dev, gy = (py + 0.5 - cx) / dev;
      var lx = gx * ca - gy * sa, ly = gx * sa + gy * ca, s = sdf(kind, lx, ly, r);
      var R = 0, G = 0, B = 0, A = 0;
      var over = function (col, a) { if (a <= 0) return; var na = a + A * (1 - a); if (na <= 0) return; R = (col[0] * a + R * A * (1 - a)) / na; G = (col[1] * a + G * A * (1 - a)) / na; B = (col[2] * a + B * A * (1 - a)) / na; A = na; };
      var cov = function (edge) { return pixel ? (s < edge ? 1 : 0) : clamp((edge - s) / aa + 0.5, 0, 1); };
      if (layer === 'halo') {
        if (s > 0) {
          var hr = s / (r * 1.25 + 1);
          var ha = pixel ? (s < r * 0.75 + 1 ? 0.24 : s < r * 1.45 + 1.5 ? 0.09 : 0) : 0.6 * Math.exp(-hr * 2.4) * clamp(1 - s / (r * 1.1 + 2), 0, 1);
          over(halo, ha);
        }
      } else {
        over(out, cov(ow) * 0.95);
        over(rim, cov(0));
        over(body, cov(pixel ? -1 : -r * 0.24));
        over(core, cov(pixel ? Math.min(-1.6, -r * 0.48) : -r * 0.5));
      }
      var q = (py * W + px) * 4;
      d[q] = R; d[q + 1] = G; d[q + 2] = B; d[q + 3] = Math.round(A * 255);
    }
    g.putImageData(img, 0, 0);
    return { c: c, half: pixel ? half + 0.5 : half, w: W };
  }

  /* ------------------------------------------------------------------ instance */
  function create(options) {
    var o = options || {};
    var P = {}; var k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    setParams(o.params || {});

    var SK = null;
    try { SK = (o.skin == null || o.skin === false || !root.GameDNA_Skin) ? null : root.GameDNA_Skin.resolve(o.skin); } catch (e) { SK = null; }
    var skinPixel = !!(SK && (SK.pixel || (SK.motion && SK.motion.snap)));
    var skinHues = null;
    if (SK && SK.palette) {
      try {
        var fx = SK.palette.fx || {}, look = function (v) { if (typeof v === 'string' && SK.lookup) { try { var r = SK.lookup(v); if (typeof r === 'string') return r; } catch (e) { } } return v; };
        var h1 = parseCol(look(fx.hot)), h2 = parseCol(look(fx.cold));
        if (h1 && h2) skinHues = [hueFrom(h1), hueFrom(h2)];
      } catch (e) { skinHues = null; }
    }

    var seed = (num(o.seed, 1) >>> 0) || 1, rngS = seed;
    function rnd() { var x = rngS; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; rngS = x; return x / 4294967296; }

    var scaleOpt = o.scale, viewOpt = o.view;
    function scale() {
      try {
        if (typeof scaleOpt === 'function') return num(scaleOpt(), 1) || 1;
        if (scaleOpt != null) return num(scaleOpt, 1) || 1;
        if (viewOpt && viewOpt.h) return viewOpt.h / 360;
      } catch (e) { }
      return 1;
    }

    // ---- pools (allocated once)
    var MAXB = Math.max(16, Math.min(20000, Math.round(num(P.max, 2000))));
    var pool = new Array(MAXB), act = [], free = [];
    for (var i = 0; i < MAXB; i++) pool[i] = newBullet();
    for (i = MAXB - 1; i >= 0; i--) free.push(pool[i]);
    var allocated = MAXB;
    function newBullet() {
      return { alive: false, st: 0, x: 0, y: 0, bx: 0, by: 0, px: 0, py: 0, h: 0, h0: 0, s0: 0, age: 0, life: 0, size: 4, hitR: 2,
        kind: 'orb', hue: null, pat: null, accel: 0, min: 0, max: 0, turn: 0, amp: 0, freq: 0, ph: 0, gy: 0, vgy: 0,
        split: false, grazed: false, owner: null, seq: 0, sAge: 0, vx: 0, vy: 0, dmg: 1, cKey: -1, cBody: null, cHaloKey: -1, cHalo: null };
    }
    var MAXFX = 640, fxp = new Array(MAXFX), fxAct = [], fxFree = [];
    for (i = 0; i < MAXFX; i++) fxp[i] = { k: 0, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, r: 1, hue: null };
    for (i = MAXFX - 1; i >= 0; i--) fxFree.push(fxp[i]);
    var MAXSHOT = 256, shotPool = [], shots = [];
    for (i = 0; i < MAXSHOT; i++) shotPool.push({ pat: null, x: 0, y: 0, src: null, aim: false, aimAt: null, angle: 90, left: 0, wait: 0, idx: 0, owner: null, hue: null, rel: 0, layer: 0 });

    var emitters = {}, emitterIds = [];
    var S = { bullets: 0, peak: 0, fired: 0, bursts: 0, spawned: 0, dropped: 0, hits: 0, grazes: 0, cancels: 0, culled: 0, blocked: 0,
      splits: 0, expired: 0, updates: 0, draws: 0, drawn: 0, sprites: 0, sourceErrors: 0, cbErrors: 0, badInput: 0, shotsDropped: 0,
      passed: 0, drawErrors: 0, pixelDraws: 0, t: 0 };
    var seqN = 0, timeMs = 0, lastView = null, lastPlayer = null, lastDrawnInfo = { count: 0, x0: 0, y0: 0, x1: 0, y1: 0, cam: null };

    function setParams(q) {
      if (!q) return;
      for (var kk in q) if (Object.prototype.hasOwnProperty.call(DEFAULTS, kk)) {
        var d = DEFAULTS[kk];
        P[kk] = typeof d === 'number' ? num(q[kk], d) : (q[kk] == null || q[kk] === '' ? d : String(q[kk]));
      }
      P.hitbox = clamp(P.hitbox, 0.05, 1.2); P.halo = clamp(P.halo, 0, 1.5); P.speed = clamp(P.speed, 0.1, 4);
      P.density = clamp(P.density, 0.1, 4); P.size = clamp(P.size, 0.3, 4);
    }
    function reduced() {
      if (P.reduced === 'on') return true; if (P.reduced === 'off') return false;
      try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
    }
    function hues() {
      if (P.palette === 'skin' && skinHues) return skinHues;
      var pal = PALETTES[P.palette] || PALETTES.arcane;
      return [hueEntry(pal[0]), hueEntry(pal[1])];
    }
    var hueCache = {};
    function hueOf(c, idx) {
      if (c == null) { var hs = hues(); return hs[idx & 1]; }
      if (typeof c === 'number') { var h2 = hues(); return h2[c & 1]; }
      var key = String(c); return hueCache[key] || (hueCache[key] = hueEntry(key));
    }

    function readPlayer() {
      if (typeof o.player !== 'function') return null;
      try {
        var p = o.player();
        if (!p || !isFinite(p.x) || !isFinite(p.y)) return null;
        return p;
      } catch (e) { S.sourceErrors++; return null; }
    }
    function call(fn, a) { if (typeof fn !== 'function') return undefined; try { return fn(a); } catch (e) { S.cbErrors++; return undefined; } }

    // ---- spawning
    function spawn(pat, x, y, headDeg, speedMul, hue, owner, sizeMul) {
      if (!free.length) { S.dropped++; return null; }
      var sc = scale(), b = free.pop();
      b.alive = true; b.st = 0; b.x = b.bx = b.px = x; b.y = b.by = b.py = y; b.h = b.h0 = headDeg * D2R;
      b.s0 = pat.speed * speedMul * P.speed * sc; b.age = 0; b.life = pat.life; b.size = pat.size * (sizeMul || 1) * P.size * sc;
      b.hitR = b.size * P.hitbox; b.kind = pat.kind; b.hue = hue; b.pat = pat; b.accel = pat.accel * P.speed * sc;
      b.min = pat.min * P.speed * sc; b.max = pat.max * P.speed * sc; b.turn = pat.turn * D2R; b.amp = pat.amp * sc; b.freq = pat.freq;
      b.ph = 0; b.gy = pat.gravity * P.speed * P.speed * sc; b.vgy = 0; b.split = !!pat.split; b.grazed = false; b.owner = owner;
      b.seq = ++seqN; b.sAge = 0; b.cKey = -1; b.cHaloKey = -1; b.cBody = null; b.cHalo = null; b.vx = Math.cos(b.h) * b.s0; b.vy = Math.sin(b.h) * b.s0; b.dmg = pat.damage || P.damage;
      act.push(b); S.spawned++;
      if (act.length > S.peak) S.peak = act.length;
      return b;
    }
    function aimAngle(x, y, sh) {
      var tx = null, ty = null;
      if (sh.aimAt && isFinite(sh.aimAt.x)) { tx = sh.aimAt.x; ty = sh.aimAt.y; }
      else { var p = readPlayer(); if (p) { tx = p.x; ty = p.y; } }
      if (tx == null) return null;
      return Math.atan2(ty - y, tx - x) / D2R;
    }
    // fire one burst of a normalised (non-layer) pattern
    function burst(sh) {
      var pat = sh.pat, x = sh.x, y = sh.y;
      if (sh.src) {
        var s = null;
        try { s = sh.src(); } catch (e) { S.sourceErrors++; s = null; }
        if (!s || !isFinite(s.x) || !isFinite(s.y)) return false;
        x = sh.x = s.x; y = sh.y = s.y;
      }
      var base = sh.angle;
      if (sh.aim) { var a = aimAngle(x, y, sh); if (a != null) base = a; }
      var idx = sh.idx, n = Math.max(1, Math.round(pat.count * (pat.shape === 'spiral' || pat.shape === 'single' ? 1 : P.density)));
      base += pat.angle + pat.rotate * idx + pat.spin * idx;
      var sm = 1 + pat.speedStep * idx, hueB = sh.hue != null ? hueOf(sh.hue, idx) : hueOf(pat.color, idx);
      S.bursts++;
      var sc = scale();
      for (var j = 0; j < n; j++) {
        var ang = base, mul = sm, ox = 0, oy = 0, hue = hueB;
        if (pat.shape === 'fan' || pat.shape === 'aimed' || pat.shape === 'wave') ang = base + (n > 1 ? (j / (n - 1) - 0.5) * pat.spread : 0);
        else if (pat.shape === 'ring' || pat.shape === 'spiral' || pat.shape === 'flower') ang = base + 360 * j / n;
        if (pat.shape === 'flower') {
          var th = (ang - base) * D2R * pat.petals;
          mul *= 1 - pat.depth * (0.5 - 0.5 * Math.cos(th));
          if (pat.colorBy === 'petal') hue = hueOf(pat.color != null ? pat.color : null, Math.floor(((ang - base) / 360 * pat.petals) + 0.5 + pat.petals) % 2);
        }
        if (pat.shape === 'line') {
          if (pat.gapEvery > 0) { var gi = ((j + pat.shiftGap * idx) % pat.gapEvery + pat.gapEvery) % pat.gapEvery; if (gi === 0) continue; }
          var off = (n > 1 ? (j / (n - 1) - 0.5) : 0) * pat.width * sc, pr = (base + 90) * D2R;
          ox = Math.cos(pr) * off; oy = Math.sin(pr) * off;
        }
        if (pat.colorBy === 'bullet' || pat.colorBy === 'arm') hue = sh.hue != null ? hueOf(sh.hue, j) : hueOf(pat.color, j);
        if (pat.jitter) ang += (rnd() - 0.5) * 2 * pat.jitter;
        if (pat.speedJitter) mul *= 1 + (rnd() - 0.5) * 2 * pat.speedJitter;
        if (sh.muzzle) { var mr = (pat.shape === 'line' ? base : ang) * D2R; ox += Math.cos(mr) * sh.muzzle * sc; oy += Math.sin(mr) * sh.muzzle * sc; }
        var b = spawn(pat, x + ox, y + oy, ang, mul, hue, sh.owner);
        if (b && pat.amp) b.ph = (j % 2) * Math.PI;
      }
      S.fired++;
      if (P.flash !== 'off' && !reduced()) { var fr2 = sh.muzzle ? sh.muzzle * sc * 0.6 : 0, fa = base * D2R; fxAdd(1, x + (pat.shape === 'ring' || pat.shape === 'spiral' || pat.shape === 'flower' ? 0 : Math.cos(fa) * fr2), y + (pat.shape === 'ring' || pat.shape === 'spiral' || pat.shape === 'flower' ? 0 : Math.sin(fa) * fr2), 0, 0, 170, pat.size * 2.2 * P.size * sc + fr2, hueB); }
      return true;
    }
    function takeShot() {
      if (!shotPool.length) { S.shotsDropped++; return null; }
      var sh = shotPool.pop(); sh.src = null; sh.aimAt = null; sh.hue = null; sh.muzzle = 0; return sh;
    }
    function startPattern(pat, x, y, angle, aim, aimAt, src, owner, hue, delay, muzzle) {
      if (pat.layers) { for (var i2 = 0; i2 < pat.layers.length; i2++) startPattern(pat.layers[i2], x, y, angle, aim, aimAt, src, owner, hue, delay, muzzle); return; }
      var sh = takeShot(); if (!sh) return;
      sh.muzzle = Math.max(0, num(muzzle, 0));
      sh.pat = pat; sh.x = x; sh.y = y; sh.src = src || null; sh.aim = aim == null ? pat.aim : !!aim; sh.aimAt = aimAt || null;
      sh.angle = angle; sh.left = pat.bursts; sh.wait = Math.max(0, delay || 0); sh.idx = 0;
      sh.owner = owner == null ? null : owner; sh.hue = hue == null ? null : hue;
      if (sh.wait <= 0) { burst(sh); sh.idx++; sh.left--; sh.wait = pat.interval; }
      if (sh.left > 0) shots.push(sh); else shotPool.push(sh);
    }

    function fire(pattern, at) {
      at = at || {};
      var pat = normPattern(pattern, 0);
      if (!pat) { S.badInput++; return false; }
      var src = typeof at.source === 'function' ? at.source : null;
      var x = num(at.x, NaN), y = num(at.y, NaN);
      if (!src && (!isFinite(x) || !isFinite(y))) { S.badInput++; return false; }
      // angle: 90 = down (+y). A pattern's own `angle` is added relative to 90; aimed patterns use the player direction
      var ang = num(at.angle, 90);
      startPattern(pat, x, y, ang, at.aim == null ? null : !!at.aim, at.aimAt || null, src, at.owner, at.color, num(at.delay, 0), at.muzzle);
      return true;
    }

    function emit(id, spec) {
      if (id == null || !spec) { S.badInput++; return null; }
      var pat = normPattern(spec.pattern, 0);
      if (!pat) { S.badInput++; return null; }
      var e = emitters[id];
      if (!e) { e = emitters[id] = { id: id }; emitterIds.push(id); }
      e.pat = pat; e.source = typeof spec.source === 'function' ? spec.source : null; e.every = Math.max(50, num(spec.every, 1600));
      e.timer = num(spec.delay, e.every * 0.5); e.aim = spec.aim == null ? null : !!spec.aim; e.angle = num(spec.angle, 90);
      e.owner = spec.owner == null ? id : spec.owner; e.color = spec.color; e.range = num(spec.range, 0); e.on = true; e.count = 0;
      e.muzzle = num(spec.muzzle, 0);
      e.cycle = Array.isArray(spec.cycle) ? spec.cycle.map(function (c) { return normPattern(c, 0); }).filter(Boolean) : null;
      return id;
    }
    function stop(id) {
      if (!emitters[id]) return false;
      delete emitters[id]; emitterIds.splice(emitterIds.indexOf(id), 1); return true;
    }

    function fxAdd(kind, x, y, vx, vy, life, r, hue) {
      if (!fxFree.length) return;
      var f = fxFree.pop(); f.k = kind; f.x = x; f.y = y; f.vx = vx; f.vy = vy; f.age = 0; f.life = life; f.r = r; f.hue = hue; fxAct.push(f);
    }
    function kill(b, idx) {
      b.alive = false; b.pat = null; b.owner = null; b.hue = null;
      var last = act.pop(); if (idx < act.length) act[idx] = last;
      free.push(b);
    }

    // segment (ax,ay)-(bx,by) to point distance squared
    function segD2(ax, ay, bx, by, px, py) {
      var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l > 0 ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t; var qx = ax + dx * t - px, qy = ay + dy * t - py; return qx * qx + qy * qy;
    }

    function bounds() {
      var b = null;
      if (typeof o.bounds === 'function') { try { b = o.bounds(); } catch (e) { S.sourceErrors++; b = null; } }
      else if (o.bounds && isFinite(o.bounds.w)) b = o.bounds;
      if (!b && lastView) b = lastView;
      return b && isFinite(b.x) && isFinite(b.w) ? b : null;
    }

    function update(dtMs) {
      dtMs = num(dtMs, 0);
      if (!(dtMs > 0)) return;           // update(0): the world is stopped, nothing moves or ages
      if (dtMs > 100) dtMs = 100;
      var dt = dtMs / 1000, sc = scale(), i, b;
      S.updates++; timeMs += dtMs; S.t = timeMs;
      // emitters
      for (i = 0; i < emitterIds.length; i++) {
        var e = emitters[emitterIds[i]]; if (!e || !e.on) continue;
        var src = null;
        if (e.source) { try { src = e.source(); } catch (er) { S.sourceErrors++; src = null; } }
        if (!src || !isFinite(src.x) || !isFinite(src.y)) { e.timer = Math.max(e.timer, e.every * 0.5); continue; }
        if (e.range > 0) { var pl = readPlayer(); if (!pl || Math.hypot(pl.x - src.x, pl.y - src.y) > e.range) { e.timer = Math.max(e.timer, e.every * 0.35); continue; } }
        e.timer -= dtMs;
        if (e.timer <= 0) {
          e.timer += e.every;
          var pat = e.cycle && e.cycle.length ? e.cycle[e.count % e.cycle.length] : e.pat; e.count++;
          startPattern(pat, src.x, src.y, e.angle, e.aim, null, e.source, e.owner, e.color, 0, e.muzzle);
        }
      }
      // pending bursts
      for (i = shots.length - 1; i >= 0; i--) {
        var sh = shots[i]; sh.wait -= dtMs;
        while (sh.left > 0 && sh.wait <= 0) {
          var ok = burst(sh); sh.idx++; sh.left--; sh.wait += sh.pat.interval;
          if (!ok) { sh.left = 0; }
        }
        if (sh.left <= 0) { var l2 = shots.pop(); if (i < shots.length) shots[i] = l2; sh.src = null; sh.pat = null; shotPool.push(sh); }
      }
      // bullets
      var pl2 = readPlayer(), canHit = true;
      if (typeof o.canHit === 'function') { try { canHit = !!o.canHit(); } catch (er2) { S.cbErrors++; canHit = true; } }
      lastPlayer = pl2;
      var pr = pl2 ? Math.max(0.5, num(pl2.r, 3)) : 0, grazeOn = P.graze !== 'off' && pl2;
      var gR = P.grazeRange * sc, bb = bounds(), margin = 48 * sc, hitsThis = 0;
      var solid = typeof o.solid === 'function' ? o.solid : null;
      for (i = act.length - 1; i >= 0; i--) {
        b = act[i];
        b.age += dtMs;
        if (b.st !== 0) { b.sAge += dtMs; if (b.sAge > (b.st === 1 ? 260 : 150)) { kill(b, i); } continue; }
        b.px = b.x; b.py = b.y;
        var pat = b.pat, sp = b.s0 + b.accel * (b.age / 1000);
        if (pat.speedCurve) sp *= curveAt(pat.speedCurve, b.age);
        if (sp < b.min) sp = b.min; if (sp > b.max) sp = b.max;
        if (b.turn) b.h += b.turn * (pat.turnCurve ? curveAt(pat.turnCurve, b.age) : 1) * dt;
        var cx = Math.cos(b.h), cy = Math.sin(b.h);
        if (b.gy) b.vgy += b.gy * dt;
        b.bx += cx * sp * dt; b.by += cy * sp * dt + b.vgy * dt;
        if (b.amp) {
          var w = Math.sin(TAU * b.freq * b.age / 1000 + b.ph) * b.amp;
          b.x = b.bx - cy * w; b.y = b.by + cx * w;
        } else { b.x = b.bx; b.y = b.by; }
        b.vx = (b.x - b.px) / dt; b.vy = (b.y - b.py) / dt;
        // split into a sub-pattern
        if (b.split && b.age >= pat.split.at) {
          b.split = false; S.splits++;
          var sp2 = pat.split.pattern, hd = Math.atan2(b.vy, b.vx) / D2R;
          startPattern(sp2, b.x, b.y, sp2.relative ? hd : 90, sp2.aim ? true : false, null, null, b.owner, null, 0);
          if (!pat.split.keep) { b.st = 1; b.sAge = 130; continue; }
        }
        if (b.age > b.life) { S.expired++; kill(b, i); continue; }
        if (bb && (b.x < bb.x - margin || b.y < bb.y - margin || b.x > bb.x + bb.w + margin || b.y > bb.y + bb.h + margin)) { S.culled++; kill(b, i); continue; }
        if (solid && b.age > 60) {
          var hitW = false; try { hitW = !!solid(b.x, b.y); } catch (er3) { S.cbErrors++; }
          if (hitW) { S.blocked++; b.st = 2; b.sAge = 0; continue; }
        }
        if (pl2) {
          var lim = pr + b.hitR, d2 = segD2(b.px, b.py, b.x, b.y, pl2.x, pl2.y);
          if (d2 < lim * lim) {
            if (canHit && hitsThis === 0) {
              hitsThis++; S.hits++;
              var res = call(o.onHit, { x: b.x, y: b.y, owner: b.owner, damage: b.dmg, pattern: pat.name || pat.shape, kind: b.kind, seq: b.seq });
              if (res !== false) {
                b.st = 2; b.sAge = 0; fxBurst(b.x, b.y, b.hue, 10, sc); fxAdd(1, pl2.x, pl2.y, 0, 0, 260, 16 * sc, HUES_W);
                if (P.clearRadius > 0) { var cr = P.clearRadius * sc; for (var q2 = 0; q2 < act.length; q2++) { var o2 = act[q2]; if (o2.st === 0 && (o2.x - pl2.x) * (o2.x - pl2.x) + (o2.y - pl2.y) * (o2.y - pl2.y) < cr * cr) { o2.st = 1; o2.sAge = 0; S.cancels++; } } }
                continue;
              }
            } else if (!canHit) S.passed++;
          } else if (grazeOn && !b.grazed && canHit) {
            var gl = pr + b.size + gR;
            if (d2 < gl * gl) {
              b.grazed = true; S.grazes++;
              call(o.onGraze, { x: b.x, y: b.y, owner: b.owner, seq: b.seq });
              if (!reduced()) fxBurst((b.x + pl2.x) / 2, (b.y + pl2.y) / 2, HUES_W, 2, sc);
            }
          }
        }
      }
      S.bullets = act.length;
      // effects
      for (i = fxAct.length - 1; i >= 0; i--) {
        var f = fxAct[i]; f.age += dtMs;
        if (f.age >= f.life) { var lf = fxAct.pop(); if (i < fxAct.length) fxAct[i] = lf; fxFree.push(f); continue; }
        f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.9; f.vy *= 0.9;
      }
    }
    var HUES_W = hueEntry('white');
    function fxBurst(x, y, hue, n, sc) {
      for (var j = 0; j < n; j++) {
        var a = (j / n) * TAU + rnd() * 0.8, v = (50 + rnd() * 70) * sc;
        fxAdd(2, x, y, Math.cos(a) * v, Math.sin(a) * v, 220 + rnd() * 120, 1, hue);
      }
      fxAdd(1, x, y, 0, 0, 160, 6 * sc, hue);
    }

    function cancel(owner, how) {
      var n = 0;
      for (var i = 0; i < act.length; i++) {
        var b = act[i]; if (b.st !== 0) continue;
        if (owner != null && b.owner !== owner) continue;
        b.st = 1; b.sAge = 0; n++;
      }
      for (var j = shots.length - 1; j >= 0; j--) if (owner == null || shots[j].owner === owner) { shots[j].left = 0; shots[j].wait = 1e9; }
      S.cancels += n;
      return n;
    }
    function clear() {
      for (var i = act.length - 1; i >= 0; i--) kill(act[i], i);
      for (var j = shots.length - 1; j >= 0; j--) { shots[j].src = null; shots[j].pat = null; shotPool.push(shots[j]); }
      shots.length = 0;
      for (var k2 = fxAct.length - 1; k2 >= 0; k2--) fxFree.push(fxAct[k2]);
      fxAct.length = 0;
      for (var e = 0; e < emitterIds.length; e++) { var em = emitters[emitterIds[e]]; if (em) em.timer = em.every * 0.5; }
      S.bullets = 0;
    }

    // clearance (px) between a circle at (x, y, r) and every live bullet, now and along the next aheadMs (straight-line guess)
    function danger(x, y, r, aheadMs) {
      r = num(r, 3); aheadMs = num(aheadMs, 250);
      var best = Infinity, steps = aheadMs > 0 ? 3 : 0;
      for (var i = 0; i < act.length; i++) {
        var b = act[i]; if (b.st !== 0) continue;
        for (var s = 0; s <= steps; s++) {
          var t = steps ? (aheadMs / 1000) * s / steps : 0, bx = b.x + b.vx * t, by = b.y + b.vy * t;
          var d = Math.sqrt((bx - x) * (bx - x) + (by - y) * (by - y)) - r - b.hitR;
          if (d < best) best = d;
        }
      }
      return best;
    }

    // ---- drawing
    var cache = {}, cacheN = 0, lastDev = 0, lastPix = null;
    function bucketOf(kind, ang, layer, pixel) {
      if (kind === 'orb') return 0;
      var nb = layer === 'halo' ? 8 : pixel ? 16 : 32;
      return Math.round(((ang % TAU) + TAU) % TAU / TAU * nb) % nb;
    }
    var gen = 1;   // bumps when the device scale or render mode changes: per-bullet sprite refs are then refreshed
    function sprite(kind, size, hue, dev, ang, layer, pixel) {
      var bucket = bucketOf(kind, ang, layer, pixel);
      var sz = pixel ? Math.max(2.5, Math.floor(size) + 0.5) : Math.round(size * dev * 2) / (2 * dev);
      var key = kind + (pixel ? 'p' : 's') + layer + '|' + sz + '|' + dev + '|' + bucket + '|' + hue[2].join(',');
      var c = cache[key];
      if (c === undefined) {
        if (cacheN > 1500) { cache = {}; cacheN = 0; gen++; }
        var nb = kind !== 'orb' ? (layer === 'halo' ? 8 : pixel ? 16 : 32) : 1;
        c = cache[key] = buildSprite(kind, sz, hue, pixel ? 1 : dev, bucket * TAU / nb, layer, pixel); cacheN++; S.sprites = cacheN;
        if (c && pixel) {
          // pixel sprites are also kept enlarged to whole device px (nearest neighbour), so they blit 1:1 like smooth ones
          var up = Math.round(dev);
          c.nhalf = c.half; c.nw = c.w; c.nc = c.c; c.up = 0;
          if (up >= 1 && Math.abs(dev - up) < 0.01) {
            var cu = up === 1 ? c.c : makeCanvas(c.w * up, c.w * up);
            if (cu && up > 1) { var gu = cu.getContext('2d'); gu.imageSmoothingEnabled = false; gu.drawImage(c.c, 0, 0, c.w * up, c.w * up); }
            if (cu) { c.c = cu; c.up = up; c.w = c.w * up; c.half = c.nhalf * up; }
          }
        }
      }
      return c;
    }
    function isPixel(ctx) {
      if (P.render === 'pixel') return true; if (P.render === 'smooth') return false;
      if (skinPixel) return true;
      try { return ctx.imageSmoothingEnabled === false; } catch (e) { return false; }
    }
    function draw(ctx, camX, camY) {
      if (!ctx || typeof ctx.drawImage !== 'function') { S.badInput++; return; }
      try { drawInner(ctx, num(camX, 0), num(camY, 0)); } catch (e) { S.drawErrors++; try { ctx.restore(); } catch (e2) { } }
    }
    function drawInner(ctx, cx, cy) {
      S.draws++;
      var m = ctx.getTransform ? ctx.getTransform() : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      var dev = Math.round(Math.hypot(m.a, m.b) * 4) / 4 || 1, pixel = isPixel(ctx), skew = Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6 || Math.abs(m.a - m.d) > 1e-6;
      if (pixel) S.pixelDraws++;
      if (dev !== lastDev || pixel !== lastPix) { lastDev = dev; lastPix = pixel; gen++; }
      var cw = ctx.canvas ? ctx.canvas.width : 0, chh = ctx.canvas ? ctx.canvas.height : 0;
      // visible world rect (native px) for culling and the default bounds
      var vx0 = (-m.e) / (m.a || 1) + cx, vy0 = (-m.f) / (m.d || 1) + cy, vw = cw / (m.a || 1), vh = chh / (m.d || 1);
      if (!o.bounds) lastView = { x: vx0, y: vy0, w: vw, h: vh };
      var red = reduced(), haloA = red ? P.halo * 0.5 : P.halo, n = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, i, b, sp, sz, a, X, Y;
      var pad = 24;
      ctx.save();
      var prevSmooth = ctx.imageSmoothingEnabled;
      var ident = !skew;
      if (ident) ctx.setTransform(1, 0, 0, 1, 0, 0);
      // 1. halos (under every body so a crowd never hides its cores)
      if (haloA > 0) {
        for (i = 0; i < act.length; i++) {
          b = act[i]; if (b.st === 2) continue;
          if (b.x < vx0 - pad || b.y < vy0 - pad || b.x > vx0 + vw + pad || b.y > vy0 + vh + pad) continue;
          sz = b.size * birth(b);
          var hk = gen * 64 + bucketOf(b.kind, b.h, 'halo', pixel);
          if (b.cHaloKey !== hk) { b.cHalo = sprite(b.kind, b.size, b.hue, dev, b.h, 'halo', pixel); b.cHaloKey = hk; }
          sp = b.cHalo; if (!sp) continue;
          a = haloA * fade(b); if (a <= 0.01) continue;
          ctx.globalAlpha = Math.min(1, a);
          blit(ctx, sp, b.x - cx, b.y - cy, m, dev, pixel, ident, sz / b.size);
        }
      }
      // 2. bodies
      for (i = 0; i < act.length; i++) {
        b = act[i]; if (b.st === 2) continue;
        if (b.x < vx0 - pad || b.y < vy0 - pad || b.x > vx0 + vw + pad || b.y > vy0 + vh + pad) continue;
        var bf = birth(b);
        var ang = b.kind === 'orb' ? 0 : Math.atan2(b.vy, b.vx);
        if (b.kind !== 'orb' && b.vx === 0 && b.vy === 0) ang = b.h;
        var bk = gen * 64 + bucketOf(b.kind, ang, 'body', pixel);
        if (b.cKey !== bk) { b.cBody = sprite(b.kind, b.size, b.hue, dev, ang, 'body', pixel); b.cKey = bk; }
        sp = b.cBody; if (!sp) continue;
        a = fade(b); if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        blit(ctx, sp, b.x - cx, b.y - cy, m, dev, pixel, ident, bf);
        n++;
        if (b.x < x0) x0 = b.x; if (b.y < y0) y0 = b.y; if (b.x > x1) x1 = b.x; if (b.y > y1) y1 = b.y;
      }
      // 3. effects: flashes, hit pops, graze sparks (sparks are drawn in native px through the game's transform)
      if (ident) ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      ident = false;
      for (i = 0; i < fxAct.length; i++) {
        var f = fxAct[i], u = f.age / f.life;
        if (f.k === 1) {
          var rr = f.r * (0.5 + 0.8 * u);
          sp = sprite('orb', Math.max(1.5, rr * 0.45), f.hue, dev, 0, 'halo', pixel); if (!sp) continue;
          ctx.globalAlpha = (1 - u) * 0.9;
          blit(ctx, sp, f.x - cx, f.y - cy, m, dev, pixel, ident, 1);
        } else {
          ctx.globalAlpha = 1 - u;
          var col = f.hue ? f.hue[u < 0.4 ? 0 : 2] : [255, 255, 255];
          ctx.fillStyle = 'rgb(' + (col[0] | 0) + ',' + (col[1] | 0) + ',' + (col[2] | 0) + ')';
          var s2 = pixel ? 1 : Math.max(1 / dev, 1.6 * (1 - u * 0.6));
          var fx2 = f.x - cx, fy2 = f.y - cy;
          if (pixel) ctx.fillRect(Math.round(fx2), Math.round(fy2), 1, 1); else ctx.fillRect(fx2 - s2 / 2, fy2 - s2 / 2, s2, s2);
        }
      }
      // 4. popping / blocked bullets: a short ring
      for (i = 0; i < act.length; i++) {
        b = act[i]; if (b.st !== 2) continue;
        var pu = b.sAge / 150; sp = sprite('orb', Math.max(1.5, b.size * (1 + pu)), b.hue, dev, 0, 'halo', pixel); if (!sp) continue;
        ctx.globalAlpha = (1 - pu) * 0.8;
        blit(ctx, sp, b.x - cx, b.y - cy, m, dev, pixel, ident, 1);
      }
      ctx.restore();
      ctx.imageSmoothingEnabled = prevSmooth;
      S.drawn = n;
      lastDrawnInfo = { count: n, x0: x0 - cx, y0: y0 - cy, x1: x1 - cx, y1: y1 - cy, cam: { x: cx, y: cy } };
    }
    function birth(b) { if (b.st === 1) return 1 + b.sAge / 260 * 0.6; return b.age < 90 ? 0.45 + 0.55 * (b.age / 90) : 1; }
    function fade(b) { if (b.st === 1) return Math.max(0, 1 - b.sAge / 260); var tl = b.life - b.age, f = tl < 300 ? Math.max(0, tl / 300) : 1; return b.age < 110 ? f * (0.35 + 0.65 * b.age / 110) : f; }
    // draw a cached sprite centred at native (x, y). ident: the context holds the identity transform and (x, y) is mapped
    // through m here, so sprites cached at device resolution land 1:1 on whole device pixels (fast, crisp)
    function blit(ctx, sp, x, y, m, dev, pixel, ident, sc) {
      var scaled = sc < 0.999 || sc > 1.001;
      if (pixel) {
        ctx.imageSmoothingEnabled = false;
        if (ident && sp.up) {
          var X0 = Math.round(x - sp.nhalf), Y0 = Math.round(y - sp.nhalf);
          ctx.drawImage(sp.c, Math.round(m.a * X0 + m.e), Math.round(m.d * Y0 + m.f));
          return;
        }
        if (ident) ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
        ctx.drawImage(sp.nc, Math.round(x - sp.nhalf), Math.round(y - sp.nhalf));
        if (ident) ctx.setTransform(1, 0, 0, 1, 0, 0);
        return;
      }
      if (!ident) { var wn = sp.w / dev * sc; ctx.drawImage(sp.c, x - wn / 2, y - wn / 2, wn, wn); return; }
      var DX = m.a * x + m.e, DY = m.d * y + m.f;
      if (scaled) { var ww = sp.w * sc; ctx.imageSmoothingEnabled = true; ctx.drawImage(sp.c, DX - ww / 2, DY - ww / 2, ww, ww); }
      else ctx.drawImage(sp.c, Math.round(DX - sp.half), Math.round(DY - sp.half));
    }

    function list() {
      var out = [];
      for (var i = 0; i < act.length; i++) { var b = act[i]; out.push({ x: b.x, y: b.y, r: b.size, hitR: b.hitR, kind: b.kind, owner: b.owner, age: b.age, state: b.st === 0 ? 'live' : b.st === 1 ? 'cancel' : 'pop', seq: b.seq }); }
      return out;
    }
    // compact hash of every live bullet (determinism tests)
    function hash() {
      var h = 2166136261 >>> 0;
      for (var i = 0; i < act.length; i++) {
        var b = act[i], v = [Math.round(b.x * 100), Math.round(b.y * 100), b.st, Math.round(b.age)];
        for (var j = 0; j < v.length; j++) { h ^= v[j] & 0xffff; h = Math.imul(h, 16777619) >>> 0; h ^= (v[j] >>> 16) & 0xffff; h = Math.imul(h, 16777619) >>> 0; }
      }
      return (h >>> 0).toString(16) + ':' + act.length;
    }
    function stats() {
      var o2 = {}; for (var k3 in S) o2[k3] = S[k3];
      o2.bullets = act.length; o2.shots = shots.length; o2.effects = fxAct.length; o2.emitters = emitterIds.length; o2.pool = MAXB; o2.allocated = allocated;
      o2.free = free.length; o2.player = lastPlayer ? { x: lastPlayer.x, y: lastPlayer.y, r: lastPlayer.r } : null; o2.view = lastView;
      return o2;
    }

    return {
      fire: fire, emit: emit, stop: stop, update: update, draw: draw, cancel: cancel, clear: clear, danger: danger,
      setParams: function (q) { setParams(q); hueCache = {}; }, params: function () { var c = {}; for (var kk in P) c[kk] = P[kk]; return c; },
      stats: stats, list: list, hash: hash, reduced: reduced, lastDrawn: function () { return lastDrawnInfo; },
      emitters: function () { return emitterIds.slice(); }, time: function () { return timeMs; },
      _pool: function () { return pool; }, _live: function () { return act; }
    };
  }

  /* ------------------------------------------------------------------ safeGap analysis */
  // Fires `pattern` from `from` toward a player standing `dist` px away and sweeps the band the player can reach
  // (an arc of radius dist around the emitter, or a straight line across the aim), every step:
  //   free = band positions where a player circle of radius playerR is touched by no bullet hit circle;
  //   gapOK  : the widest bullet-free gap between hit circles is >= the player's hitbox (2 * playerR) at every step;
  //   reachOK: a player moving at most playerSpeed px/s along the band can stay inside the free set the whole time.
  function safeGap(pattern, opt) {
    opt = opt || {};
    var dist = num(opt.dist, 120), W = num(opt.width, 260), R = num(opt.playerR, 3), v = num(opt.playerSpeed, 120);
    var toward = num(opt.toward, 90) * D2R, band = opt.band === 'line' ? 'line' : 'arc', dt = num(opt.dt, 1000 / 60), res = num(opt.res, 0.5);
    var pat = normPattern(pattern, 0);
    if (!pat) return { ok: false, error: 'unknown pattern' };
    var fx = 0, fy = 0, px = fx + Math.cos(toward) * dist, py = fy + Math.sin(toward) * dist;
    var inst = create({ seed: num(opt.seed, 1), scale: num(opt.scale, 1), params: opt.params || {}, player: function () { return { x: px, y: py, r: 0.01 }; },
      canHit: function () { return false; }, bounds: { x: -2000, y: -2000, w: 4000, h: 4000 } });
    if (opt.params) inst.setParams(opt.params);
    inst.setParams({ graze: 'off', flash: 'off' });
    var total = num(opt.duration, 0);
    if (!total) { var lay = pat.layers || [pat], mx = 0; lay.forEach(function (l) { var tt = l.bursts * l.interval + (dist + 40) / Math.max(20, l.speed * 0.6) * 1000 + (l.split ? l.split.at + 2500 : 0); if (tt > mx) mx = tt; }); total = Math.min(30000, mx); }
    inst.fire(pat, { x: fx, y: fy, angle: toward / D2R, aimAt: { x: px, y: py }, muzzle: num(opt.muzzle, 0) });
    var N = Math.max(1, Math.round(W / res)), free = new Uint8Array(N), reach = new Uint8Array(N), tmp = new Uint8Array(N);
    for (var i = 0; i < N; i++) reach[i] = 1;
    var steps = Math.ceil(total / dt), minGap = Infinity, worstT = 0, gapFail = -1, reachFail = -1, busySteps = 0, dCells = Math.max(1, Math.round(v * dt / 1000 / res));
    var ux = -Math.sin(toward), uy = Math.cos(toward), nx = Math.cos(toward), ny = Math.sin(toward);
    var samples = [];
    for (var s = 1; s <= steps; s++) {
      inst.update(dt);
      for (i = 0; i < N; i++) free[i] = 1;
      var L = inst.list(), any = false;
      for (var j = 0; j < L.length; j++) {
        var b = L[j]; if (b.state !== 'live') continue;
        var bx = b.x - fx, by = b.y - fy, u, p;
        if (band === 'arc') { var rho = Math.sqrt(bx * bx + by * by), th = Math.atan2(by, bx) - toward; th = Math.atan2(Math.sin(th), Math.cos(th)); u = th * dist; p = rho - dist; }
        else { u = bx * ux + by * uy; p = bx * nx + by * ny - dist; }
        var lim = R + b.hitR; if (Math.abs(p) >= lim) continue;
        var hw = Math.sqrt(lim * lim - p * p), c0 = Math.max(0, Math.floor((u - hw + W / 2) / res)), c1 = Math.min(N - 1, Math.ceil((u + hw + W / 2) / res));
        for (var c = c0; c <= c1; c++) free[c] = 0;
        any = true;
      }
      if (any) busySteps++;
      // widest free run (player centre positions) -> gap between hit circles = run + 2R
      var run = 0, best = 0;
      for (i = 0; i < N; i++) { if (free[i]) { run++; if (run > best) best = run; } else run = 0; }
      var gap = best * res + 2 * R;
      if (best === 0) gap = 0;
      if (gap < minGap) { minGap = gap; worstT = s * dt; }
      if (best === 0 && gapFail < 0) gapFail = s * dt;
      // reachability: dilate by the distance the player can move this step, then keep only free cells
      var anyR = false;
      for (i = 0; i < N; i++) tmp[i] = 0;
      for (i = 0; i < N; i++) if (reach[i]) { var a0 = Math.max(0, i - dCells), a1 = Math.min(N - 1, i + dCells); for (var q = a0; q <= a1; q++) tmp[q] = 1; }
      for (i = 0; i < N; i++) { reach[i] = tmp[i] && free[i] ? 1 : 0; if (reach[i]) anyR = true; }
      if (!anyR && reachFail < 0) reachFail = s * dt;
      if (!anyR) for (i = 0; i < N; i++) reach[i] = free[i];   // keep sweeping after a failure
      if (opt.trace && s % 6 === 0) samples.push({ t: Math.round(s * dt), gap: Math.round(gap * 10) / 10 });
    }
    var need = 2 * R, gapOK = gapFail < 0, reachOK = v <= 0 ? true : reachFail < 0;
    return { ok: gapOK && reachOK, gapOK: gapOK, reachOK: reachOK, minGap: Math.round((minGap === Infinity ? W : minGap) * 10) / 10, need: need,
      worstT: Math.round(worstT), gapFailT: gapFail < 0 ? null : Math.round(gapFail), reachFailT: reachFail < 0 ? null : Math.round(reachFail),
      steps: steps, busySteps: busySteps, band: band, dist: dist, width: W, playerR: R, playerSpeed: v, peak: inst.stats().peak, trace: opt.trace ? samples : undefined };
  }

  root.GameDNA_Bullets = { create: create, safeGap: safeGap, version: VERSION, presets: PRESETS, shapes: SHAPES.slice(), kinds: KINDS.slice(),
    palettes: Object.keys(PALETTES).concat(['skin']), hues: Object.keys(HUES), normalize: function (p) { return normPattern(p, 0); } };
})(typeof window !== 'undefined' ? window : this);
