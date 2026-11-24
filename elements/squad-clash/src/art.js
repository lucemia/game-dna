/* ART: the look of the A-14 starter and demo.
   Painted mode (default): the art pack in art/ (generated once, original; see README "Art pack"): one WebP atlas per
   class with its poses (ready, attack / draw / loose) and four painted backdrops of the same meadow (dawn, day, dusk,
   night). ART.init(base) loads it, ART.ready(fn) fires when every image has loaded or failed, then
   ART.drawUnit / ART.drawHead / ART.looks / ART.layout plug into GameDNA_SquadClash.create().
   Fallback: a class whose atlas is missing is drawn by the module's built-in painter, and without the backdrop image
   ART.backdrop paints the procedural vale below; ?art=0 forces the fallback (the game runs without any image file).
   Everything drawn per frame is a pure function of t and the pose it is given (deterministic for ?t=&freeze=1). */
var ART = (function () {
  'use strict';
  var THEMES = {
    dawn:  { sky: ['#2b2f5e', '#b0668a', '#f4b07a'], sun: '#ffd9a0', sunAt: [0.78, 0.36], far: '#6b5a86', mid: '#4e4a6e', hill: '#4c6b4a', hillHi: '#7e9a5a', ground: ['#7a8f4e', '#3f5a33'], path: '#b39a6e', fog: 'rgba(255,196,170,', haze: 0.35, stars: 0 },
    day:   { sky: ['#3d78c4', '#86b8e6', '#d8ecf2'], sun: '#fff7d6', sunAt: [0.2, 0.18], far: '#7d9cc0', mid: '#5f84a0', hill: '#4f7e46', hillHi: '#86b45a', ground: ['#8cae58', '#4b7038'], path: '#c9b27e', fog: 'rgba(225,240,255,', haze: 0.3, stars: 0 },
    dusk:  { sky: ['#1f1d45', '#7a3e6e', '#f08a5a'], sun: '#ffb070', sunAt: [0.5, 0.47], far: '#4d3a66', mid: '#3a3156', hill: '#3a4a3c', hillHi: '#6a6a4a', ground: ['#5e6a3e', '#2e3a26'], path: '#9a7c5a', fog: 'rgba(255,150,120,', haze: 0.4, stars: 0.3 },
    night: { sky: ['#0b1028', '#1c2752', '#3a4a7a'], sun: '#e8f0ff', sunAt: [0.82, 0.16], far: '#26305a', mid: '#1e2748', hill: '#1f3330', hillHi: '#35544a', ground: ['#2d4436', '#16241e'], path: '#5a5a62', fog: 'rgba(140,170,255,', haze: 0.3, stars: 1, moon: true }
  };
  function R(seed) { var a = seed >>> 0 || 1; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  var cache = {};
  function ridge(g, v, y0, amp, seed, step, col) {
    var r = R(seed), pts = [], n = Math.ceil(v.w / step) + 2, y = y0;
    for (var i = 0; i < n; i++) { y = y0 + (r() - 0.5) * amp + Math.sin(i * 0.9 + seed) * amp * 0.4; pts.push([v.x + i * step - step / 2, v.y + y]); }
    g.beginPath(); g.moveTo(v.x - 10, v.y + v.h); g.lineTo(pts[0][0], pts[0][1]);
    for (i = 1; i < pts.length; i++) { var p = pts[i - 1], q = pts[i]; g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
    g.lineTo(v.x + v.w + 10, v.y + v.h); g.closePath(); g.fillStyle = col; g.fill();
  }
  function pine(g, x, y, h, col, hi) {
    g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + h * 0.28, y - h * 0.35); g.lineTo(x + h * 0.16, y - h * 0.36); g.lineTo(x + h * 0.34, y); g.lineTo(x - h * 0.34, y); g.lineTo(x - h * 0.16, y - h * 0.36); g.lineTo(x - h * 0.28, y - h * 0.35); g.closePath();
    g.fillStyle = col; g.fill(); if (hi) { g.beginPath(); g.moveTo(x, y - h); g.lineTo(x - h * 0.28, y - h * 0.35); g.lineTo(x - h * 0.05, y - h * 0.4); g.closePath(); g.fillStyle = hi; g.fill(); }
  }
  function mixA(rgbaPrefix, a) { return rgbaPrefix + a + ')'; }
  function paintStatic(g, v, T) {
    var s = v.h / 360;
    var sky = g.createLinearGradient(0, v.y, 0, v.y + v.h * 0.62); sky.addColorStop(0, T.sky[0]); sky.addColorStop(0.55, T.sky[1]); sky.addColorStop(1, T.sky[2]);
    g.fillStyle = sky; g.fillRect(v.x, v.y, v.w, v.h);
    if (T.stars) { var rs = R(77); for (var i = 0; i < 90; i++) { var sx = v.x + rs() * v.w, sy = v.y + rs() * v.h * 0.45, sr = (0.4 + rs() * 1.1) * s; g.globalAlpha = T.stars * (0.3 + rs() * 0.7) * (1 - sy / (v.h * 0.5)); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(sx, sy, sr, 0, 7); g.fill(); } g.globalAlpha = 1; }
    var sx0 = v.x + v.w * T.sunAt[0], sy0 = v.y + v.h * T.sunAt[1];
    var glow = g.createRadialGradient(sx0, sy0, 0, sx0, sy0, v.w * 0.42); glow.addColorStop(0, mixA('rgba(255,240,210,', T.moon ? 0.25 : 0.6)); glow.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = glow; g.fillRect(v.x, v.y, v.w, v.h);
    g.beginPath(); g.arc(sx0, sy0, (T.moon ? 16 : 22) * s, 0, 7); g.fillStyle = T.sun; g.fill();
    if (T.moon) { g.beginPath(); g.arc(sx0 + 6 * s, sy0 - 3 * s, 14 * s, 0, 7); g.fillStyle = T.sky[0]; g.globalAlpha = 0.85; g.fill(); g.globalAlpha = 1; }
    ridge(g, v, v.h * 0.40, 46 * s, 3, 70 * s, T.far);
    g.fillStyle = mixA(T.fog, T.haze); g.fillRect(v.x, v.y + v.h * 0.3, v.w, v.h * 0.3);
    ridge(g, v, v.h * 0.47, 30 * s, 11, 52 * s, T.mid);
    // a ruined watchtower on the far ridge
    var tx = v.x + v.w * 0.64, ty = v.y + v.h * 0.45;
    g.fillStyle = T.mid; g.beginPath(); g.moveTo(tx - 9 * s, ty); g.lineTo(tx - 7 * s, ty - 46 * s); g.lineTo(tx - 9 * s, ty - 46 * s); g.lineTo(tx - 9 * s, ty - 52 * s); g.lineTo(tx - 4 * s, ty - 52 * s); g.lineTo(tx - 4 * s, ty - 48 * s); g.lineTo(tx + 1 * s, ty - 48 * s); g.lineTo(tx + 1 * s, ty - 54 * s); g.lineTo(tx + 6 * s, ty - 54 * s); g.lineTo(tx + 6 * s, ty - 40 * s); g.lineTo(tx + 9 * s, ty - 30 * s); g.lineTo(tx + 10 * s, ty); g.closePath(); g.fill();
    g.fillStyle = mixA(T.fog, T.haze * 0.7); g.fillRect(v.x, v.y + v.h * 0.4, v.w, v.h * 0.2);
    ridge(g, v, v.h * 0.535, 18 * s, 23, 40 * s, T.hill);
    var rt = R(41);
    for (i = 0; i < 46; i++) { var px = v.x + rt() * v.w, side = px < v.x + v.w * 0.35 || px > v.x + v.w * 0.65 ? 1 : 0.55, ph = (10 + rt() * 18) * s * side; pine(g, px, v.y + v.h * (0.535 + rt() * 0.03), ph, T.hill, T.hillHi); }
    // the clash ground: a broad meadow with a worn path across the middle
    var gr = g.createLinearGradient(0, v.y + v.h * 0.53, 0, v.y + v.h); gr.addColorStop(0, T.ground[0]); gr.addColorStop(1, T.ground[1]);
    g.fillStyle = gr; g.beginPath(); g.moveTo(v.x, v.y + v.h * 0.56); g.quadraticCurveTo(v.x + v.w * 0.5, v.y + v.h * 0.535, v.x + v.w, v.y + v.h * 0.56); g.lineTo(v.x + v.w, v.y + v.h); g.lineTo(v.x, v.y + v.h); g.closePath(); g.fill();
    var pg = g.createLinearGradient(0, v.y + v.h * 0.58, 0, v.y + v.h * 0.78); pg.addColorStop(0, 'rgba(0,0,0,0)'); pg.addColorStop(0.5, T.path); pg.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.45; g.fillStyle = pg; g.beginPath(); g.ellipse(v.x + v.w / 2, v.y + v.h * 0.67, v.w * 0.62, v.h * 0.1, 0, 0, 7); g.fill(); g.globalAlpha = 1;
    var rg = R(5);
    for (i = 0; i < 520; i++) {   // grass strokes, lit from the sun side
      var gx = v.x + rg() * v.w, gy = v.y + v.h * (0.57 + Math.pow(rg(), 0.8) * 0.43), gl = (3 + rg() * 5) * s * (0.6 + (gy - v.y) / v.h);
      g.strokeStyle = rg() < 0.5 ? T.hillHi : T.ground[1]; g.globalAlpha = 0.35 + rg() * 0.4; g.lineWidth = 1 * s; g.beginPath(); g.moveTo(gx, gy); g.quadraticCurveTo(gx + 1.5 * s, gy - gl * 0.5, gx + (rg() - 0.3) * 3 * s, gy - gl); g.stroke();
    }
    for (i = 0; i < 40; i++) { var fx = v.x + rg() * v.w, fy = v.y + v.h * (0.62 + rg() * 0.36); g.globalAlpha = 0.7; g.fillStyle = ['#f4e3a1', '#e9a7c4', '#ffffff', '#b8d8ff'][i % 4]; g.beginPath(); g.arc(fx, fy, (0.9 + rg()) * s, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    // stones at the edges
    [[0.05, 0.86, 16], [0.94, 0.9, 20], [0.12, 0.97, 12], [0.86, 0.66, 9], [0.16, 0.64, 8]].forEach(function (st) {
      var x = v.x + v.w * st[0], y = v.y + v.h * st[1], r = st[2] * s;
      g.beginPath(); g.ellipse(x, y, r * 1.3, r * 0.75, 0, Math.PI, 0); g.closePath(); var sg = g.createLinearGradient(x - r, y - r, x + r, y); sg.addColorStop(0, '#a9a3b4'); sg.addColorStop(1, '#4e4a5c'); g.fillStyle = sg; g.fill(); g.lineWidth = 1.6 * s; g.strokeStyle = 'rgba(20,14,30,0.8)'; g.stroke();
    });
    // vignette
    var vg = g.createRadialGradient(v.x + v.w / 2, v.y + v.h * 0.55, v.h * 0.35, v.x + v.w / 2, v.y + v.h * 0.55, v.w * 0.75); vg.addColorStop(0, 'rgba(10,6,20,0)'); vg.addColorStop(1, 'rgba(10,6,20,0.55)');
    g.fillStyle = vg; g.fillRect(v.x, v.y, v.w, v.h);
  }
  function banner(g, x, y, s, col, t, dir) {
    g.save(); g.lineCap = 'round';
    g.strokeStyle = '#1a1220'; g.lineWidth = 4 * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 70 * s); g.stroke();
    g.strokeStyle = '#8a6a44'; g.lineWidth = 2.2 * s; g.stroke();
    g.beginPath(); g.moveTo(x, y - 68 * s);
    for (var i = 0; i <= 8; i++) { var k = i / 8; g.lineTo(x + dir * k * 30 * s, y - 68 * s + Math.sin(t * 3 + k * 4) * 3 * s * k); }
    for (i = 8; i >= 0; i--) { var k2 = i / 8; g.lineTo(x + dir * k2 * 30 * s, y - 40 * s + Math.sin(t * 3 + k2 * 4) * 3 * s * k2 + (i === 8 ? -4 * s : 0)); }
    g.closePath(); var lg = g.createLinearGradient(x, y - 68 * s, x + dir * 30 * s, y - 40 * s); lg.addColorStop(0, col[0]); lg.addColorStop(1, col[1]); g.fillStyle = lg; g.fill(); g.lineWidth = 1.6 * s; g.strokeStyle = '#1a1220'; g.stroke();
    g.beginPath(); g.arc(x + dir * 14 * s, y - 54 * s + Math.sin(t * 3 + 2) * 1.5 * s, 5 * s, 0, 7); g.fillStyle = col[2]; g.fill();
    g.restore();
  }
  function backdrop(g, v, t, theme) {
    curTheme = THEMES[theme] ? theme : 'dawn';
    if (paintedBackdrop(g, v, t, curTheme)) return;
    var T = THEMES[theme] || THEMES.dawn, m = g.getTransform ? g.getTransform() : { a: 1, d: 1 }, kx = Math.abs(m.a) || 1;
    var W = Math.max(1, Math.round(v.w * kx)), H = Math.max(1, Math.round(v.h * kx)), key = theme + ':' + W + 'x' + H;
    var c = cache[key];
    if (!c && typeof document !== 'undefined') {
      c = document.createElement('canvas'); c.width = W; c.height = H; var cg = c.getContext('2d'); cg.setTransform(W / v.w, 0, 0, H / v.h, 0, 0);
      paintStatic(cg, { x: 0, y: 0, w: v.w, h: v.h }, T); cache = {}; cache[key] = c;
    }
    if (c) g.drawImage(c, v.x, v.y, v.w, v.h); else paintStatic(g, v, T);
    var s = v.h / 360;
    // drifting clouds
    g.save(); var rc = R(9);
    for (var i = 0; i < 5; i++) {
      var cw = (70 + rc() * 90) * s, cx = v.x + ((rc() * v.w + t * (4 + i * 2) * s) % (v.w + cw * 2)) - cw, cy = v.y + v.h * (0.08 + rc() * 0.2);
      g.globalAlpha = T.moon ? 0.12 : 0.28; g.fillStyle = '#ffffff';
      for (var j = 0; j < 4; j++) { g.beginPath(); g.ellipse(cx + j * cw * 0.22, cy + Math.sin(j * 2.1) * 4 * s, cw * 0.24, cw * 0.09, 0, 0, 7); g.fill(); }
    }
    g.restore();
    banner(g, v.x + v.w * 0.04, v.y + v.h * 0.71, s, ['#4a8de0', '#244a8a', '#ffe28a'], t, 1);
    banner(g, v.x + v.w * 0.96, v.y + v.h * 0.71, s, ['#d8463c', '#7a1e1e', '#ffe28a'], t + 1.3, -1);
    // light motes
    var rm = R(17); g.save(); g.globalCompositeOperation = 'lighter';
    for (i = 0; i < 26; i++) {
      var mx = v.x + ((rm() * v.w + Math.sin(t * 0.4 + i) * 20 * s + t * 6 * s) % v.w), my = v.y + v.h * (0.35 + rm() * 0.55) - ((t * (5 + rm() * 6) * s) % (v.h * 0.3));
      g.globalAlpha = (0.25 + 0.35 * Math.sin(t * 2 + i)) * (T.moon ? 1 : 0.7); g.fillStyle = T.moon ? '#bfe0ff' : '#fff2c0'; g.beginPath(); g.arc(mx, my, (0.8 + rm() * 1.4) * s, 0, 7); g.fill();
    }
    g.restore();
  }
  // foreground: dark grass blades along the bottom edge, drawn over the units' feet line at the very bottom only
  function foreground(g, v, t) {
    if (fieldOk(curTheme)) return;   // the painted backdrop has its own foreground
    var s = v.h / 360, r = R(31); g.save();
    for (var i = 0; i < 90; i++) { var x = v.x + r() * v.w, h = (8 + r() * 16) * s, y = v.y + v.h + 2 * s; g.strokeStyle = 'rgba(14,22,14,0.85)'; g.lineWidth = (1.4 + r()) * s; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.sin(t * 1.5 + i) * 2 * s, y - h * 0.6, x + (r() - 0.5) * 8 * s + Math.sin(t * 1.5 + i) * 3 * s, y - h); g.stroke(); }
    g.restore();
  }

  /* ---------------------------------- painted mode: the art pack ---------------------------------- */
  var PACK = null, IMG = {}, BASE = 'art/', curTheme = 'dawn', loadState = { started: false, pending: 0, done: false }, waiters = [], tintCache = {}, fieldCache = {}, layer = null;
  // multiply tints that set the daylight sprites into each backdrop's light (null = as painted)
  var TINT = { day: null, dawn: '#eadfe8', dusk: '#f6c9a2', night: '#6475ad' };
  // night: also 30 % less saturation and a cool rim on the edges that face the moon (upper right of the screen)
  var GRADE = { night: { desat: 0.3, rim: '#c4d8ff', rimA: 0.62, rimPx: 4 } };
  var FOCUS = { night: [1.02, 0, 0] };   // zoom, x and y anchor of the cover fit (night: the moon sits between the HUD pills)
  var MOTE = { day: ['#fff7d0', 0.35], dawn: ['#ffe9dc', 0.45], dusk: ['#ffd9a0', 0.6], night: ['#cfe6ff', 0.8] };
  function fire() { if (loadState.done) return; loadState.done = true; var w = waiters; waiters = []; w.forEach(function (f) { try { f(api); } catch (e) { console.error(e); } }); }
  function init(base, opts) {
    if (loadState.started) return api; loadState.started = true; opts = opts || {};
    if (base != null) BASE = base;
    var off = opts.off || (typeof location !== 'undefined' && /[?&]art=0(&|$)/.test(location.search));
    PACK = !off && typeof window !== 'undefined' && window.GameDNA_SquadClashArt_Pack || null;
    if (!PACK || typeof Image === 'undefined') { PACK = null; fire(); return api; }
    var files = [];
    Object.keys(PACK.classes).forEach(function (c) { var C = PACK.classes[c]; files.push(['c:' + c, C.file]); if (C.left) files.push(['c:' + c + '@left', C.left.file]); if (C.right) files.push(['c:' + c + '@right', C.right.file]); });
    Object.keys(PACK.fields).forEach(function (f) { files.push(['f:' + f, PACK.fields[f].file]); });
    loadState.pending = files.length;
    var one = function () { if (--loadState.pending <= 0) fire(); };
    files.forEach(function (f) {
      var im = new Image(); im.onload = function () { IMG[f[0]] = im; one(); }; im.onerror = function () { one(); };
      im.src = BASE + f[1];
    });
    if (!files.length) fire();
    setTimeout(fire, opts.timeout || 8000);   // never block the game on a slow or missing file
    return api;
  }
  function ready(fn) { if (loadState.done) fn(api); else waiters.push(fn); return api; }
  function clsOf(u) { var k = u && (typeof u.look === 'string' ? u.look : u.cls || u.class); return PACK && k && PACK.classes[k] && IMG['c:' + k] ? k : null; }
  function fieldOk(theme) { return !!(PACK && IMG['f:' + theme]); }
  function on() { return !!PACK && Object.keys(IMG).length > 0; }
  // looks for GameDNA_SquadClash.create({looks}): the size of each painted class (HP bar height, reach, shadow)
  function looks() {
    var o = {}; if (!PACK) return o;
    Object.keys(PACK.classes).forEach(function (c) { if (!IMG['c:' + c]) return; var C = PACK.classes[c]; o[c] = { kind: C.kind, w: C.w, h: C.h, lift: C.lift || 0, shadow: C.shadow || 1, noBody: true, shot: C.shot || null, shotY: C.shotY || null, shotX: C.shotX || null, painted: true }; });
    return o;
  }
  /* Which picture to draw for a unit that must look dir (1 = right, -1 = left). Every class records the side its art
     looks at (pack `facing`, default 'right'); the mirror is computed here and nowhere else: flipX = (want !== facing).
     When the pack has the class painted for the other side (`left` / `right`: its own atlas, poses, feet and head) that
     picture is drawn un-mirrored, so a shield stays on the same arm and the painted light stays on the same side.
     -> {key (IMG key), C (poses, head, size), m (canvas x scale: -1 = mirrored), variant} */
  var pickCache = {};
  function pick(cls, dir) {
    var want = dir < 0 ? -1 : 1, ck = cls + want, r = pickCache[ck]; if (r) return r;
    var C = PACK.classes[cls], nat = C.facing === 'left' ? -1 : 1, side = want < 0 ? 'left' : 'right', V = C[side];
    if (want === nat) r = { key: 'c:' + cls, C: C, m: 1, variant: null, native: nat < 0 ? 'left' : 'right' };
    else if (V && V.poses && IMG['c:' + cls + '@' + side]) r = { key: 'c:' + cls + '@' + side, C: V, m: 1, variant: side, native: nat < 0 ? 'left' : 'right' };
    else r = { key: 'c:' + cls, C: C, m: -1, variant: null, native: nat < 0 ? 'left' : 'right' };
    if (loadState.done) pickCache[ck] = r;
    return r;
  }
  function trace(cls, x, footY, s, dir, P) { if (typeof window !== 'undefined' && window.__spriteTrace) window.__spriteTrace.push({ id: cls, x: x, footY: footY, h: PACK.classes[cls].h * s, facing: dir < 0 ? 'left' : 'right', native: P.native, flipX: P.m < 0, variant: P.variant }); }
  // key = IMG key ('c:<class>' or 'c:<class>@left'); m = -1 when the picture will be drawn mirrored
  function tinted(key, theme, m) {
    var im = IMG[key], col = TINT[theme]; if (!col || typeof document === 'undefined') return im;
    var G = GRADE[theme], dir = m, c; key = key + ':' + theme + (G ? ':' + (dir < 0 ? 'l' : 'r') : ''); c = tintCache[key];
    if (!c) {
      var w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
      c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d');
      x.drawImage(im, 0, 0);
      if (G && G.desat) { x.globalCompositeOperation = 'saturation'; x.globalAlpha = G.desat; x.fillStyle = '#808080'; x.fillRect(0, 0, w, h); x.globalAlpha = 1; }
      x.globalCompositeOperation = 'multiply'; x.fillStyle = col; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'destination-in'; x.drawImage(im, 0, 0);
      if (G && G.rim) {   // rim = the sprite minus itself shifted away from the light; a mirrored unit needs the other edge
        var r = document.createElement('canvas'); r.width = w; r.height = h; var y = r.getContext('2d'), d = dir < 0 ? 1 : -1;
        y.drawImage(im, 0, 0); y.globalCompositeOperation = 'destination-out'; y.drawImage(im, d * G.rimPx, G.rimPx * 0.8);
        y.globalCompositeOperation = 'source-in'; y.fillStyle = G.rim; y.fillRect(0, 0, w, h);
        x.globalCompositeOperation = 'source-atop'; x.globalAlpha = G.rimA; x.drawImage(r, 0, 0); x.globalAlpha = 1;
      }
      x.globalCompositeOperation = 'source-over'; tintCache[key] = c;
    }
    return c;
  }
  function ease(k) { k = k < 0 ? 0 : k > 1 ? 1 : k; return 1 - (1 - k) * (1 - k); }
  function hashOf(s) { var h = 2166136261 >>> 0; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  // which painted pose and what squash / lean / hop a module pose gets: {name, rot, sx, sy, ox, oy, trail}
  function frameOf(C, info, id) {
    var P = C.poses, atk = P.attack ? 'attack' : P.loose ? 'loose' : 'ready', p = info.pose, k = info.k || 0, s = info.s, t = info.t || 0, ph = (hashOf(id) % 628) / 100;
    var f = { name: 'ready', rot: 0, sx: 1, sy: 1, ox: 0, oy: 0, trail: 0 }, beast = C.kind !== 'humanoid', hop = beast ? 11 : 6;
    var br = Math.sin(t * 2.3 + ph);
    if (C.kind === 'bird') { f.oy = -1 * s * (1 + Math.sin(t * 3.1 + ph)); f.rot = 0.035 * Math.sin(t * 1.55 + ph); }
    if (p === 'ready') { f.sy = 1 - 0.045 * ease(k); f.sx = 1 + 0.02 * ease(k); f.rot += -0.05 * ease(k); }
    else if (p === 'dash') {
      f.oy += -hop * s * Math.sin(Math.PI * k);
      if (k < 0.1) { f.rot += -0.05 + 1.2 * k; f.sy = 0.955 + 0.4 * k; }
      else { f.name = atk; f.sx = 1 + 0.05 * (1 - k); f.sy = 1 - 0.03 * (1 - k); f.trail = Math.min(1, (k - 0.1) * 3); if (k < 0.26) { f.under = 'ready'; f.mix = (k - 0.1) / 0.16; } }
    }
    else if (p === 'strike') { f.name = atk; var d = (1 - k) * (1 - k); f.sx = 1 + 0.045 * d; f.sy = 1 - 0.02 * d; f.ox = 3 * s * d; f.trail = k < 0.25 ? 1 - k * 4 : 0; }
    else if (p === 'draw') { if (k < 0.3) { f.rot += -0.04 * (k / 0.3); } else { f.name = P.draw ? 'draw' : atk; var kd = (k - 0.3) / 0.7; f.sx = 1 - 0.015 * kd; f.rot += -0.02 * kd; if (kd < 0.2) { f.under = 'ready'; f.mix = kd / 0.2; } } }
    else if (p === 'loose') { f.name = P.loose ? 'loose' : atk; }
    else if (p === 'cast') { if (k < 0.25) { f.sy = 1 - 0.04 * (k / 0.25); f.rot += -0.05 * (k / 0.25); } else { f.name = atk; var kc = Math.min(1, (k - 0.25) / 0.2); f.sx = 1 + 0.05 * (1 - kc); f.sy = 1 - 0.03 * (1 - kc); f.oy += -1.5 * s * Math.sin(t * 9); if (kc < 0.6) { f.under = 'ready'; f.mix = kc / 0.6; } } }
    else if (p === 'guard') { f.oy += -5 * s * Math.sin(Math.PI * Math.min(1, k)) * (k < 1 ? 1 : 0); f.sy = 1 - 0.035 * k; f.sx = 1 + 0.02 * k; f.rot += 0.03 * k; }
    else if (p === 'hurt') { var hk = Math.sin(Math.PI * Math.min(1, k)); f.rot += -0.13 * hk; f.sy = 1 - 0.03 * hk; f.ox = -2 * s * hk; }
    else if (p === 'cheer') { var ck = Math.abs(Math.sin(Math.PI * k + ph)); f.oy += -6 * s * ck; f.sy = 1 + 0.03 * ck; f.sx = 1 - 0.015 * ck; }
    else {   // idle: breathing; coming back from a melee blow: a short hop home
      if (info.ret != null) { f.oy += -hop * 0.8 * s * Math.sin(Math.PI * info.ret); f.rot += -0.05 * Math.sin(Math.PI * info.ret); if (info.ret < 0.1 && atk !== 'ready') { f.over = atk; f.mix = 1 - info.ret / 0.1; } }
      else if (C.kind !== 'bird') { f.sy = 1 + 0.011 * br; f.sx = 1 - 0.006 * br; }
    }
    if (!P[f.name]) f.name = 'ready';
    if (f.under && (!P[f.under] || f.under === f.name)) f.under = null;
    if (f.over && (!P[f.over] || f.over === f.name)) f.over = null;
    return f;
  }
  // the pose swap is a short cross-fade: the old pose fades out under (or over) the new one
  // C = the picture's own poses (class entry or its variant); dir = the side the unit looks; m = -1 draws the picture mirrored
  function blit(g, img, C, f, x, y, s, dir, alpha, m) {
    if (m == null) m = dir;
    if (f.under) one(g, img, C, f, f.under, x, y, s, dir, alpha * (1 - f.mix * f.mix), m);
    one(g, img, C, f, f.name, x, y, s, dir, alpha * (f.under ? Math.min(1, 0.25 + f.mix) : 1), m);
    if (f.over) one(g, img, C, f, f.over, x, y, s, dir, alpha * f.mix, m);
  }
  function one(g, img, C, f, name, x, y, s, dir, alpha, m) {
    var ps = C.poses[name], r = ps.rect, k = s / PACK.px;
    g.save(); g.translate(x + dir * f.ox, y + f.oy); g.scale(m, 1); g.rotate(f.rot * dir * m); g.scale(k * f.sx, k * f.sy); g.globalAlpha *= alpha;
    g.drawImage(img, r[0], r[1], r[2], r[3], -ps.foot[0], -ps.foot[1], r[2], r[3]);
    g.restore();
  }
  // drawUnit for GameDNA_SquadClash: returns false (built-in painter) when this unit's class has no loaded art
  function drawUnit(g, unit, info) {
    var cls = clsOf(unit); if (!cls) return false;
    var C = PACK.classes[cls], s = info.s, dir = info.dir < 0 ? -1 : 1, x = info.x, y = info.footY - (C.lift || 0) * s;
    var PK = pick(cls, dir), PC = PK.C, m = PK.m, img = tinted(PK.key, curTheme, m);
    trace(cls, x, info.footY, s, dir, PK);
    if (info.dead && info.fall >= 1) return true;   // fallen units leave the field
    var f = frameOf(C, info, unit.id), alpha = 1;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    if (info.fall > 0) {   // knocked back, buckling at the knees (feet stay planted), then gone in a puff of dust
      var fk = info.fall, e1 = ease(Math.min(1, fk / 0.45)), e2 = fk < 0.35 ? 0 : (fk - 0.35) / 0.65;
      f = { name: 'ready', rot: -0.2 * e1, sx: 1 + 0.1 * e1, sy: 1 - 0.3 * e1 - 0.12 * e2, ox: -9 * s * e1, oy: (C.lift || 0) * s * e1, trail: 0 }; alpha = 1 - e2 * e2;
      var R0 = hashOf(unit.id) % 97;
      g.save();
      for (var di = 0; di < 7; di++) {
        var dq = ((R0 + di * 37) % 100) / 100, dk = Math.max(0, Math.min(1, (fk - 0.12 - dq * 0.2) / 0.7)); if (dk <= 0 || dk >= 1) continue;
        var dxp = x + (dq - 0.5) * 46 * s - dir * 7 * s * dk, dyp = info.footY - (2 + dq * 8) * s - 16 * s * dk * (0.4 + dq), dr = (5 + dq * 6) * s * (0.5 + dk);
        var dg = g.createRadialGradient(dxp, dyp, 0, dxp, dyp, dr); dg.addColorStop(0, 'rgba(226,214,190,' + (0.5 * (1 - dk)).toFixed(3) + ')'); dg.addColorStop(1, 'rgba(226,214,190,0)');
        g.fillStyle = dg; g.beginPath(); g.arc(dxp, dyp, dr, 0, 7); g.fill();
      }
      g.restore();
    }
    if (f.trail > 0) { blit(g, img, PC, f, x - dir * 13 * s, y, s, dir, 0.1 * f.trail, m); blit(g, img, PC, f, x - dir * 6.5 * s, y, s, dir, 0.2 * f.trail, m); }
    var fl = info.fall > 0 ? Math.max(0, 0.5 * (1 - info.fall * 3)) : Math.pow(info.flash || 0, 1.5) * (curTheme === 'night' ? 0.11 : 0.4);
    if (fl > 0.01 && typeof document !== 'undefined') {
      try {   // whiten only the sprite's own pixels: compose in a layer at device resolution, then blit that
        var ps = PC.poses[f.name], r = ps.rect, gm = g.getTransform(), dk = Math.max(0.5, Math.hypot(gm.a, gm.b)) * s / PACK.px, W2 = Math.ceil(r[2] * dk) + 2, H2 = Math.ceil(r[3] * dk) + 2;
        if (!layer) layer = document.createElement('canvas');
        if (layer.width < W2 || layer.height < H2) { layer.width = Math.max(layer.width, W2); layer.height = Math.max(layer.height, H2); }
        var o = layer.getContext('2d'); o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1; o.clearRect(0, 0, W2, H2);
        o.imageSmoothingQuality = 'high'; o.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, r[2] * dk, r[3] * dk);
        o.globalCompositeOperation = 'source-atop'; o.globalAlpha = Math.min(0.9, fl); o.fillStyle = '#fff8e8'; o.fillRect(0, 0, W2, H2);
        o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1;
        var k = s / PACK.px;
        g.save(); g.translate(x + dir * f.ox, y + f.oy); g.scale(m, 1); g.rotate(f.rot * dir * m); g.scale(k * f.sx, k * f.sy); g.globalAlpha *= alpha;
        g.drawImage(layer, 0, 0, r[2] * dk, r[3] * dk, -ps.foot[0], -ps.foot[1], r[2], r[3]); g.restore();
        return true;
      } catch (e) { /* fall through to the plain sprite */ }
    }
    blit(g, img, PC, f, x, y, s, dir, alpha, m);
    return true;
  }
  // drawHead for GameDNA_SquadClash (turn-order chips, the why box, unit cards): the painted head, facing its side
  function drawHead(g, unit, cx, cy, r, info) {
    var cls = clsOf(unit); if (!cls) return false;
    var PK = pick(cls, info && (info.facing === 'left' || (info.facing == null && info.side === 'b')) ? -1 : 1), C = PK.C, img = IMG[PK.key], h = C.head, q = 1.22, sw = h[2] * 2 * q, flip = PK.m;
    g.save(); g.translate(cx, cy); g.scale(flip, 1); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    var sx = h[0] - sw / 2, sy = h[1] - sw / 2, dw = r * 2 * q, dx = -dw / 2, dy = -dw / 2, k = dw / sw;
    var x0 = Math.max(0, sx), y0 = Math.max(0, sy), x1 = Math.min(C.size[0], sx + sw), y1 = Math.min(C.size[1], sy + sw);   // Safari wants the source inside the image
    g.drawImage(img, x0, y0, x1 - x0, y1 - y0, dx + (x0 - sx) * k, dy + (y0 - sy) * k, (x1 - x0) * k, (y1 - y0) * k);
    g.restore(); return true;
  }
  // a still figure for menus and title screens (pose: 'ready' | 'attack' ...); false when the class has no art
  function drawFigure(g, cls, x, footY, s, dir, pose, t, theme) {
    if (!(PACK && PACK.classes[cls] && IMG['c:' + cls])) return false;
    var C = PACK.classes[cls]; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    var f = frameOf(C, { pose: 'idle', k: 0, s: s, t: t || 0 }, cls); if (pose && C.poses[pose]) f.name = pose;
    dir = dir < 0 ? -1 : 1; var PK = pick(cls, dir); trace(cls, x, footY, s, dir, PK);
    blit(g, tinted(PK.key, theme || curTheme, PK.m), PK.C, f, x, footY - (C.lift || 0) * s, s, dir, 1, PK.m); return true;
  }
  function paintedBackdrop(g, v, t, theme) {
    var im = IMG['f:' + theme]; if (!PACK || !im) return false;
    var m = g.getTransform ? g.getTransform() : { a: 1, b: 0 }, kx = Math.hypot(m.a, m.b) || 1, W = Math.max(1, Math.round(v.w * kx)), H = Math.max(1, Math.round(v.h * kx)), key = theme + ':' + W + 'x' + H, c = fieldCache[key];
    if (!c && typeof document !== 'undefined') {   // the painting scaled once to the canvas's device size (cover fit), with a soft vignette
      c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
      var iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height, F = FOCUS[theme] || [1, 0.5, 0.5], sc = Math.max(W / iw, H / ih) * F[0], dw = iw * sc, dh = ih * sc;
      x.drawImage(im, (W - dw) * F[1], (H - dh) * F[2], dw, dh);
      var vg = x.createRadialGradient(W / 2, H * 0.56, H * 0.42, W / 2, H * 0.56, W * 0.78); vg.addColorStop(0, 'rgba(8,6,18,0)'); vg.addColorStop(1, 'rgba(8,6,18,0.42)');
      x.fillStyle = vg; x.fillRect(0, 0, W, H);
      fieldCache = {}; fieldCache[key] = c;
    }
    if (c) g.drawImage(c, v.x, v.y, v.w, v.h); else g.drawImage(im, v.x, v.y, v.w, v.h);
    // drifting motes of light (pollen by day, fireflies at night)
    var s = v.h / 360, rm = R(17), M = MOTE[theme] || MOTE.day; g.save(); g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 22; i++) {
      var mx = v.x + ((rm() * v.w + Math.sin(t * 0.4 + i) * 18 * s + t * 5 * s) % v.w), my = v.y + v.h * (0.5 + rm() * 0.46) - ((t * (3 + rm() * 4) * s) % (v.h * 0.16));
      g.globalAlpha = (0.3 + 0.3 * Math.sin(t * 1.7 + i * 1.3)) * M[1]; g.fillStyle = M[0]; g.beginPath(); g.arc(mx, my, (0.7 + rm() * 1.0) * s, 0, 7); g.fill();
    }
    g.restore();
    return true;
  }
  // formation tuned to the painted ground: feet below the far wall, a little more room between the rows
  var LAYOUT = { front: 0.15, back: 0.335, colDx: 0.072, y0: 0.525, colDy: 0.09 };
  var api = { THEMES: THEMES, backdrop: backdrop, foreground: foreground, banner: banner,
    init: init, ready: ready, on: on, has: function (cls) { return !!clsOf({ cls: cls }); }, looks: looks, layout: function () { return on() ? LAYOUT : null; },
    drawUnit: drawUnit, drawHead: drawHead, drawFigure: drawFigure, theme: function () { return curTheme; }, pack: function () { return PACK; } };
  return api;
})();
