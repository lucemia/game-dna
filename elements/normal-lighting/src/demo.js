/* J-02 demo: a dusk clearing ("Lanternwood") drawn on a plain 2D canvas. Painted sprites from the L-05 pack are drawn with
 * GameDNA_NormalLight.drawSprite and their nh2 maps; the oak (no map) uses 'derive'; the moss slimes are the demo kit's
 * painted slime with a map derived by the same L-05 tool (demo/slime.nh.webp =
 * `tools/assets/normalmap.py derive demo-kit/assets/sprites/slime.webp elements/normal-lighting/demo/slime.nh.webp --gloss 0.6`). J-01 GameDNA_Lights gives the dusk darkness, lantern pools and shadows; J-02 reads its light list. */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search);
  var HAS_T = Q.has('t'), FREEZE = Q.get('freeze') === '1', T0 = HAS_T ? Math.max(0, Number(Q.get('t')) || 0) : 0;
  var W = 640, H = 360, K = 2, STEP = 1000 / 60, TAU = Math.PI * 2;
  var cv = document.getElementById('game'), g = cv.getContext('2d');
  var gameMs = 0;
  var NM = '../../normal-maps/assets/', L0 = '../../art-direction-lock/assets/';

  // ---------------------------------------------------------------- assets
  var IMG = {}, MAP = {}, pending = 0, ready = false;
  function load(u) { var i = new Image(); pending++; i.onload = i.onerror = function () { if (--pending === 0) { prep(); ready = true; boot(); } }; i.src = u; return i; }
  ['keeper', 'lamppost', 'well', 'herbalist', 'vial', 'key'].forEach(function (n) { IMG[n] = load(NM + 'albedo/' + n + '.webp'); MAP[n] = load(NM + 'maps/' + n + '.nh.webp'); });
  IMG.oak = load(L0 + 'with/oak.webp'); IMG.ground = load(L0 + 'with/ground.webp'); IMG.patch = load(L0 + 'sheet-parts/patch.webp');
  IMG.slime = load('../../../demo-kit/assets/sprites/slime.webp'); MAP.slime = load('slime.nh.webp');

  // ---------------------------------------------------------------- helpers
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function ok(i) { return i && (i.getContext ? i.width > 0 : i.complete && i.naturalWidth > 0); }   // images, and the canvases prep() makes from them
  function sizeOf(n, h) { var i = IMG[n]; return ok(i) ? { w: h * (i.naturalWidth || i.width) / (i.naturalHeight || i.height), h: h } : { w: h * 0.5, h: h }; }

  // ---------------------------------------------------------------- one-time art prep (after the images load; every step falls back to the untouched image)
  function canvasOf(i) { var c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; return c; }
  // The two characters were painted standing on a pale grey ground pad: on bright ground it reads as a fringe under the feet.
  // Remove it (grey pixels connected to the bottom edge, then anything left unattached to the body); the demo draws its own contact shadow.
  function dropPad(i) {
    try {
      var c = canvasOf(i), x = c.getContext('2d', { willReadFrequently: true }), w = c.width, h = c.height, y0 = Math.floor(h * 0.82);
      x.drawImage(i, 0, 0); var id = x.getImageData(0, 0, w, h), d = id.data, pad = new Uint8Array(w * h), keep = new Uint8Array(w * h), st = [], p, q, k, X, Y;
      var grey = function (p, c0, l0) { var r = d[p * 4], g2 = d[p * 4 + 1], b = d[p * 4 + 2]; if (!d[p * 4 + 3]) return false; var l = 0.299 * r + 0.587 * g2 + 0.114 * b; return Math.max(r, g2, b) - Math.min(r, g2, b) < c0 && l > l0 && l < 165; };
      var N = [1, 0, -1, 0, 0, 1, 0, -1];
      for (Y = h - 5; Y < h; Y++) for (X = 0; X < w; X++) if (grey(Y * w + X, 34, 56)) { pad[Y * w + X] = 1; st.push(Y * w + X); }
      while (st.length) { p = st.pop(); for (k = 0; k < 8; k += 2) { X = p % w + N[k]; Y = (p / w | 0) + N[k + 1]; q = Y * w + X; if (X >= 0 && X < w && Y >= y0 && Y < h && !pad[q] && grey(q, 34, 56)) { pad[q] = 1; st.push(q); } } }
      for (X = 0; X < w; X++) { q = y0 * w + X; if (d[q * 4 + 3] > 40 && !pad[q]) { keep[q] = 1; st.push(q); } }
      while (st.length) { p = st.pop(); for (k = 0; k < 8; k += 2) { X = p % w + N[k]; Y = (p / w | 0) + N[k + 1]; q = Y * w + X; if (X >= 0 && X < w && Y >= y0 && Y < h && !keep[q] && !pad[q] && d[q * 4 + 3] > 40) { keep[q] = 1; st.push(q); } } }
      for (q = y0 * w; q < w * h; q++) if (!keep[q]) pad[q] = 1;
      for (q = y0 * w; q < w * h; q++) {
        if (pad[q]) { d[q * 4 + 3] = 0; continue; }
        var nb = 0; for (k = 0; k < 8; k += 2) { X = q % w + N[k]; Y = (q / w | 0) + N[k + 1]; if (X >= 0 && X < w && Y < h && pad[Y * w + X]) nb++; }
        if (nb && grey(q, 48, 46)) d[q * 4 + 3] = d[q * 4 + 3] * (4 - nb) / 6;   // soften what is left of the pad's rim
      }
      x.putImageData(id, 0, 0); return c;
    } catch (e) { return i; }
  }
  // The cobble patches are cut-outs with hard edges: fade each one out toward its border (compositing only, no pixel reads).
  function feather(i) {
    var c = canvasOf(i), x = c.getContext('2d'), w = c.width, h = c.height;
    x.drawImage(i, 0, 0); x.globalCompositeOperation = 'destination-in';
    x.translate(w / 2, h / 2); x.scale(w / 2, h / 2);
    var gr = x.createRadialGradient(0, 0, 0.5, 0, 0, 1.04); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.8, 'rgba(0,0,0,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(-1, -1, 2, 2); return c;
  }
  // The second slime is the same painted sprite, hue-shifted to teal (its map is shared: same shape).
  function tinted(i, f) { try { var c = canvasOf(i), x = c.getContext('2d'); x.filter = f; x.drawImage(i, 0, 0); return c; } catch (e) { return i; } }
  function prep() {
    ['keeper', 'herbalist'].forEach(function (n) { if (ok(IMG[n])) IMG[n] = dropPad(IMG[n]); });
    if (ok(IMG.patch)) IMG.patch = feather(IMG.patch);
    if (ok(IMG.slime)) { IMG.slime2 = tinted(IMG.slime, 'hue-rotate(62deg) saturate(0.9)'); MAP.slime2 = MAP.slime; }
  }

  // ---------------------------------------------------------------- world (view units, 640 x 360)
  var PROPS = [
    { n: 'oak', x: 112, y: 252, h: 250, map: 'derive', solid: { x: 96, y: 228, w: 34, h: 20 } },
    { n: 'lamppost', x: 300, y: 212, h: 190, lamp: [0.217, 0.4], solid: { x: 294, y: 202, w: 18, h: 10 } },
    { n: 'well', x: 474, y: 262, h: 168, lamp: [0.25, 0.41], solid: { x: 418, y: 238, w: 112, h: 24 } },
    { n: 'herbalist', x: 58, y: 318, h: 108, want: 'right' },
    { n: 'lamppost', x: 604, y: 372, h: 170, lamp: [0.217, 0.4], solid: { x: 598, y: 362, w: 18, h: 10 } }
  ];
  /* Native facing (tools/sprites/README.md rule 2): each sprite records the side its art looks at; the mirror is computed in ONE place,
     flipOf(), as want !== asset.facing, and never typed in the scene. The keeper (lit lantern in one hand), the herbalist (basket, stick) and
     the lamppost (lantern on its left arm) are mirror: 'never' and have no left-facing painting, so the scene is staged to draw them on their
     native side only: the herbalist stands at the left edge and looks right at the keeper, the keeper only ever walks to the right (he comes
     up from the bottom edge, crosses, leaves at the right edge), and both lampposts hang their lantern to the left. */
  var ASSET = {
    keeper: { facing: 'right', mirror: 'never', why: 'carries a lit lantern in one hand' },
    herbalist: { facing: 'right', mirror: 'never', why: 'basket and walking stick' },
    lamppost: { facing: 'left', mirror: 'never', why: 'lit lantern hangs on one arm' },
    slime: { facing: 'right', mirror: 'ok', why: 'symmetric blob, soft top light' },
    slime2: { facing: 'right', mirror: 'ok', why: 'symmetric blob, soft top light' }
  };
  var refused = 0;   // draws that asked a mirror: 'never' asset for its other side (stays 0 when the staging holds)
  function flipOf(n, want) {
    var a = ASSET[n]; if (!a || !want || want === a.facing) return false;
    if (a.mirror === 'never') { refused++; return false; }
    return true;
  }
  function drawnSide(n, want) { var a = ASSET[n]; return flipOf(n, want) ? want : a.facing; }
  var HERB = PROPS[3], HERO_MIN_X = HERB.x + 44;
  var PICK = [{ n: 'vial', x: 186, y: 334, h: 30 }, { n: 'key', x: 520, y: 344, h: 28 }];
  var SLIMES = [{ x: 236, y: 224, n: 'slime', ph: 0, h: 40 }, { x: 436, y: 346, n: 'slime2', ph: 1.7, h: 40, amp: 16 }];
  // one pass every 6.4 s, always to the right: up from below the bottom edge, across the clearing, out past the right edge
  var LOOP = 6400, PHASE = 5000, PATH_X0 = 100, PATH_DX = 590;
  var PATH = function (t) { var u = ((t + PHASE) % LOOP) / LOOP, k = 1 - Math.min(1, u / 0.22); return { x: PATH_X0 + PATH_DX * u, y: 296 + 170 * k * k + Math.sin(u * TAU) * 10 }; };
  var hero = { x: 340, y: 286, want: 'right', walk: 0, manual: false };
  var keys = {}, target = null;

  function heroAt(t) {   // auto path: deterministic from the game clock
    var p = PATH(t);
    return { x: p.x, y: p.y, want: 'right', walk: t };
  }
  function step() {
    gameMs += STEP;
    if (!hero.manual) { var a = heroAt(gameMs); hero.x = a.x; hero.y = a.y; hero.want = a.want; hero.walk = a.walk; return; }
    var dx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), dy = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
    if (!dx && !dy && target) { var tx = target.x - hero.x, ty = target.y - hero.y, d = Math.hypot(tx, ty); if (d < 2) target = null; else { dx = tx / d; dy = ty / d; } }
    var m = Math.hypot(dx, dy);
    // manual: the keeper has no left-facing painting, so he keeps looking right and backs up (slower) when told to go left
    if (m > 0) { var sp = dx < 0 ? 1.0 : 1.6; hero.x += dx / m * sp; hero.y += dy / m * sp; hero.walk += dx < 0 ? STEP * 0.6 : STEP; hero.want = 'right'; }
    hero.x = Math.max(HERO_MIN_X, Math.min(W - 24, hero.x)); hero.y = Math.max(170, Math.min(H - 8, hero.y));
  }

  // ---------------------------------------------------------------- drawing
  function ground() {
    if (ok(IMG.ground)) { for (var x = 0; x < W; x += 160) for (var y = 0; y < H; y += 160) g.drawImage(IMG.ground, x, y, 160.5, 160.5); }
    else { g.fillStyle = '#4a5a32'; g.fillRect(0, 0, W, H); }
    if (ok(IMG.patch)) { g.globalAlpha = 0.95; g.drawImage(IMG.patch, 300, 250, 120, 112); g.drawImage(IMG.patch, 196, 268, 96, 90); g.globalAlpha = 1; }
    // a soft dusk vignette and a path of trodden earth (painted, so it survives without WebGL too)
    var vg = g.createRadialGradient(330, 250, 80, 330, 250, 420); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(14,10,24,0.55)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  function sprite(n, x, y, h, want, map, bob) {
    var s = sizeOf(n, h), m = map === undefined ? MAP[n] : map;
    if (!ok(IMG[n])) return;
    if (m && m !== 'derive' && !ok(m)) m = null;
    g.save(); g.translate(x, y + (bob || 0));
    if (flipOf(n, want)) g.scale(-1, 1);
    nl.drawSprite(IMG[n], m, -s.w / 2, -s.h, s.w, s.h);
    g.restore();
  }
  function shadow(x, y, rx, ry, a) { g.fillStyle = 'rgba(10,8,20,' + a + ')'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); }
  // A slime hops in place-to-place arcs: it only moves sideways while it is in the air, squashes when it lands, and faces the way it hops.
  function slimeWant(a, b) { return b < a ? 'left' : 'right'; }
  function slimeX(sl, n) { return sl.x + Math.sin(n * 1.38 + sl.ph) * (sl.amp || 22); }
  function slime(sl, t) {
    var ph = t / 420 + sl.ph, n = Math.floor(ph / TAU), u = ph / TAU - n, air = u < 0.5;
    var hop = air ? Math.sin(u * TAU) : 0, up = hop * 14, a = slimeX(sl, n), b = slimeX(sl, n + 1), e = air ? u * 2 : 1;
    var x = a + (b - a) * (e * e * (3 - 2 * e)), y = sl.y, land = air ? 0 : Math.exp(-(u - 0.5) * 14) * 0.16;
    var sx = 1 - hop * 0.08 + land, sy = 1 + hop * 0.12 - land, s = sizeOf(sl.n, sl.h);
    shadow(x, y - 1, s.w * (0.42 - hop * 0.1), 4.5 - hop * 1.2, 0.34 - hop * 0.1);
    if (ok(IMG[sl.n])) {
      var m = MAP[sl.n]; if (!ok(m)) m = null;
      g.save(); g.translate(x, y - up); g.scale((flipOf(sl.n, slimeWant(a, b)) ? -1 : 1) * sx, sy);   // squash about the base; mirror: 'ok' (ASSET)
      nl.drawSprite(IMG[sl.n], m, -s.w / 2, -s.h, s.w, s.h);
      g.restore();
    }
    return { x: x, y: y - up - 12 };
  }
  function wispAt(t) { var a = t / 2300; return { x: 150 + Math.cos(a) * 110, y: 150 + Math.sin(a * 1.3) * 60 }; }
  function drawWisp(t) {
    var p = wispAt(t), gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14);
    gr.addColorStop(0, 'rgba(230,255,250,1)'); gr.addColorStop(0.3, 'rgba(120,240,220,0.7)'); gr.addColorStop(1, 'rgba(120,240,220,0)');
    g.fillStyle = gr; g.fillRect(p.x - 14, p.y - 14, 28, 28);
    for (var i = 1; i <= 5; i++) { var q = wispAt(t - i * 70); g.fillStyle = 'rgba(160,255,230,' + (0.35 - i * 0.06) + ')'; g.fillRect(q.x - 1, q.y - 1, 2, 2); }
  }
  function hud() {
    g.save();
    g.fillStyle = 'rgba(18,14,26,0.78)'; g.beginPath(); g.roundRect(10, 10, 170, 40, 8); g.fill();
    g.strokeStyle = 'rgba(255,200,140,0.45)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#ffe2b8'; g.font = '600 13px ui-sans-serif, system-ui, sans-serif'; g.textBaseline = 'top'; g.fillText('Lanternwood', 20, 16);
    g.fillStyle = '#c8b8a8'; g.font = '500 10.5px ui-sans-serif, system-ui, sans-serif'; g.fillText(({ dusk: 'dusk \u00b7 3 lanterns \u00b7 1 wisp', night: 'night \u00b7 3 lanterns \u00b7 1 wisp', daylight: 'daylight \u00b7 sun only', moon: 'moonlit rim', soft: 'soft dusk' }[preset] || 'custom light'), 20, 33);
    g.restore();
  }
  var UI = [{ x: 10, y: 10, w: 170, h: 40, r: 8 }];
  function drawScene(t) {
    g.setTransform(K, 0, 0, K, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    ground();
    var list = [];
    PROPS.forEach(function (p) { list.push({ y: p.y, f: function () { if (p.n !== 'oak') shadow(p.x, p.y - 2, p.h * 0.18, 5, 0.25); sprite(p.n, p.x, p.y, p.h, p.want, p.map); } }); });
    PICK.forEach(function (p, i) { list.push({ y: p.y, f: function () { var b = -3 - Math.sin(t / 380 + i * 2) * 3; shadow(p.x, p.y, 8, 2.5, 0.28); sprite(p.n, p.x, p.y, p.h, null, undefined, b); } }); });
    SLIMES.forEach(function (sl) { list.push({ y: sl.y, f: function () { sl.top = slime(sl, t); } }); });
    list.push({ y: hero.y, f: function () {
      var bob = hero.manual && !(keys.l || keys.r || keys.u || keys.d || target) ? 0 : -Math.abs(Math.sin(hero.walk / 140)) * 2.5;
      shadow(hero.x, hero.y - 1, 20, 6, 0.3); sprite('keeper', hero.x, hero.y, 96, hero.want, undefined, bob);
    } });
    list.sort(function (a, b) { return a.y - b.y; }).forEach(function (o) { o.f(); });
    if (preset !== 'daylight') drawWisp(t);
    hud();
  }

  // ---------------------------------------------------------------- lights: one list, given to J-01 (J-02 reads it) or to J-02 itself
  function lampPos(p) { var s = sizeOf(p.n, p.h); return { x: p.x + (p.lamp[0] - 0.5) * s.w, y: p.y - p.h + p.lamp[1] * p.h }; }
  function lightDefs() {
    var out = [];
    PROPS.forEach(function (p, i) { if (p.lamp) { var q = lampPos(p); out.push({ id: 'lamp' + i, x: q.x, y: q.y, radius: p.n === 'well' ? 110 : 150, color: '#ffb466', flicker: 0.25, intensity: p.n === 'well' ? 0.8 : 1 }); } });
    out.push({ id: 'hero', follow: function () { var s = sizeOf('keeper', 96); return { x: hero.x + 0.375 * s.w, y: hero.y - 96 + 0.59 * 96 }; }, radius: 120, color: '#ffc27a', flicker: 0.2 });
    out.push({ id: 'wisp', follow: function () { return wispAt(gameMs); }, radius: 150, color: '#7af0d8', intensity: 1.1 });
    return out;
  }
  var post = null, nl = null, lights = null, j01On = Q.get('j01') !== '0', nlOn = Q.get('normals_on') !== '0';
  // demo presets = the module's presets (GameDNA_NormalLight.presets) plus a 'rim' look; 'daylight' = no lamps lit (J-01 near day)
  var MP = GameDNA_NormalLight.presets;
  var PRESETS = {
    dusk: Object.assign({ preset: 'dusk' }, MP.dusk),
    night: Object.assign({ preset: 'night' }, MP.night),
    daylight: Object.assign({ preset: 'daylight' }, MP.daylight),
    moon: Object.assign({ preset: 'dusk' }, MP.dusk, { key: 0.3, rim: 1.1, rimWidth: 2, rimAngle: 30, rimColor: '#c8a8ff', pointRim: 1, specular: 0.5 }),
    soft: Object.assign({ preset: 'soft' }, MP.soft)
  };
  var AMB = { dusk: 0.5, night: 0.22, daylight: 0.97, moon: 0.3, soft: 0.6 };
  var preset = PRESETS[Q.get('preset')] ? Q.get('preset') : 'dusk';
  var KEYS = ['strength', 'warmth', 'key', 'keyAngle', 'keyHeight', 'points', 'fill', 'lightHeight', 'specular', 'gloss', 'rim', 'rimAngle', 'rimWidth', 'pointRim', 'bevel', 'detail'];
  function base() { var o = {}; for (var k in GameDNA_NormalLight.defaults) o[k] = GameDNA_NormalLight.defaults[k]; delete o.preset; return o; }
  var cfg = Object.assign(base(), PRESETS[preset]);
  KEYS.forEach(function (k) { if (Q.has(k) && isFinite(Number(Q.get(k)))) cfg[k] = Number(Q.get(k)); });
  if (Q.has('rimColor')) cfg.rimColor = '#' + Q.get('rimColor').replace('#', '');
  cfg.debug = /^(normals|coverage)$/.test(Q.get('debug') || '') ? Q.get('debug') : 'off';
  var splitX = Q.has('split') ? Math.max(0, Math.min(1, Number(Q.get('split')) || 0)) : 0;
  cfg.compare = splitX;

  function make(on) {
    if (nl) nl.destroy(); if (lights) lights.destroy(); if (post) post.destroy(); nl = lights = post = null;
    if (on && /[?&]webgl=0/.test(location.search)) { var u = new URL(location.href); u.searchParams.delete('webgl'); history.replaceState(null, '', u); }
    post = GameDNA_Post.create({ canvas: cv, clock: function () { return gameMs; }, uiRects: function () { return UI.map(function (r) { return { x: r.x * K, y: r.y * K, w: r.w * K, h: r.h * K, r: r.r * K }; }); }, params: { passes: 'grade', look: 'warm', vignette: 0.25, webgl: on ? 'auto' : 'off' } });
    if (j01On) {
      lights = GameDNA_Lights.create({ canvas: cv, post: post, clock: function () { return gameMs; },
        rects: function () { return PROPS.map(function (p) { return { x: p.solid.x * K, y: p.solid.y * K, w: p.solid.w * K, h: p.solid.h * K }; }); },
        uiRects: function () { return UI.map(function (r) { return { x: r.x * K, y: r.y * K, w: r.w * K, h: r.h * K, r: r.r * K }; }); },
        params: { ambient: AMB[preset] || 0.5, tint: preset === 'daylight' ? 'neutral' : preset === 'dusk' || preset === 'soft' ? 'dusk' : 'night', shadows: 'on', softness: 8, glow: 0.4, over: 0.4 } });
    }
    nl = GameDNA_NormalLight.create({ post: post, canvas: cv, view: { w: W, h: H }, clock: function () { return gameMs; }, params: Object.assign({}, cfg, { enabled: nlOn }) });
    (preset === 'daylight' ? [] : lightDefs()).forEach(function (d) {
      if (lights && lights.active) { var d2 = Object.assign({}, d); d2.radius *= K; if (d2.x !== undefined) { d2.x *= K; d2.y *= K; } if (d.follow) d2.follow = function () { var p = d.follow(); return { x: p.x * K, y: p.y * K }; }; lights.add(d2); }
      else nl.add(d);
    });
    window.__post = post; window.__nl = nl; window.__lights = lights;
    applySplit();
  }
  function spell(x, y) {
    var d = { x: x, y: y, radius: 170, color: '#c8b0ff', ms: 520, intensity: 1.6 };
    if (lights && lights.active) lights.flash({ x: x * K, y: y * K, radius: 170 * K, color: d.color, ms: d.ms, intensity: d.intensity });
    else nl.flash(d);
  }
  function frame() { if (!ready) return; drawScene(gameMs); nl.render(); }
  // the herbalist casts a small spell on her own every 4 s (deterministic on the game clock)
  var CAST = 4000;
  function eventsBetween(a, b, fn) { for (var k = Math.max(1, Math.floor(a / CAST)); k * CAST <= b; k++) { var ts = k * CAST; if (ts > a && ts <= b) fn(ts); } }
  function cast(ts) { var keep = gameMs; gameMs = ts; spell(HERB.x + 30, HERB.y - 68); gameMs = keep; }

  // ---------------------------------------------------------------- UI
  var $ = function (id) { return document.getElementById(id); };
  function fill(r) { r.style.setProperty('--fill', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); }
  function fmt(k, v) { return /Angle|gloss|lightHeight/.test(k) ? String(Math.round(v)) : Number(v).toFixed(2); }
  function mark(id, v) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.v === v)); }); }
  function syncUI() {
    document.querySelectorAll('input[data-k]').forEach(function (r) { var k = r.dataset.k; r.value = cfg[k]; fill(r); r.parentNode.querySelector('output').textContent = fmt(k, cfg[k]); });
    mark('preset', preset); mark('debugSeg', cfg.debug); mark('rimCol', cfg.rimColor);
  }
  function set(o) { Object.assign(cfg, o); nl.setParams(o); if (FREEZE) frame(); }
  document.querySelectorAll('input[data-k]').forEach(function (r) {
    r.addEventListener('input', function () { var o = {}; o[r.dataset.k] = Number(r.value); preset = ''; mark('preset', ''); set(o); fill(r); r.parentNode.querySelector('output').textContent = fmt(r.dataset.k, r.value); });
  });
  function seg(id, fn) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.addEventListener('click', function () { fn(b.dataset.v); syncUI(); }); }); }
  seg('preset', function (v) { preset = v; var o = Object.assign(base(), PRESETS[v]); delete o.enabled; o.debug = cfg.debug; o.compare = splitX; Object.assign(cfg, o); make(post.active); if (FREEZE) frame(); });
  seg('debugSeg', function (v) { set({ debug: v }); });
  seg('rimCol', function (v) { preset = ''; set({ rimColor: v }); });
  $('on').addEventListener('change', function () { nlOn = $('on').checked; nl.setEnabled(nlOn); if (FREEZE) frame(); });
  $('j01').addEventListener('change', function () { j01On = $('j01').checked; make(post.active); frame(); status(); });
  $('webgl').addEventListener('change', function () { make($('webgl').checked); frame(); status(); });
  $('cast').addEventListener('click', function () { spell(hero.x, hero.y - 40); if (FREEZE) frame(); });
  var KM = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };
  addEventListener('keydown', function (e) {
    if (e.target !== document.body) return;
    if (KM[e.code]) { e.preventDefault(); keys[KM[e.code]] = true; hero.manual = true; target = null; }
    if (e.code === 'Space') { e.preventDefault(); spell(hero.x, hero.y - 40); }
  });
  addEventListener('keyup', function (e) { if (KM[e.code]) keys[KM[e.code]] = false; });
  cv.addEventListener('pointerdown', function (e) {
    var r = cv.getBoundingClientRect(); if (!r.width) return;
    var x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    if (e.pointerType === 'touch') { hero.manual = true; target = { x: x, y: Math.max(170, y) }; } else spell(x, y);   // mouse: a flash where you click; touch: walk there
    if (FREEZE) frame();
  });
  function applySplit() {
    var r = $('splitR'); r.value = splitX; fill(r); $('o-split').textContent = splitX > 0 ? Math.round(splitX * 100) + '%' : 'off';
    if (nl) nl.setParams({ compare: splitX });
    var line = $('split'); line.style.display = splitX > 0 && nl && nl.active ? 'block' : 'none'; line.style.left = (splitX * 100) + '%';
  }
  $('splitR').addEventListener('input', function () { splitX = Number($('splitR').value); cfg.compare = splitX; applySplit(); if (FREEZE) frame(); });
  function status() {
    var s = nl.stats(), m = $('mode');
    m.className = s.active ? '' : 'off';
    m.innerHTML = s.active ? '<b>' + (s.mode === 'webgl2' ? 'WebGL2' : 'WebGL') + '</b> &middot; normal lighting ' + (s.enabled ? 'on' : 'off') : '<b>2D only</b> &middot; WebGL ' + (s.reason === 'option' || s.reason === 'off' ? 'switched off' : s.reason === 'url' ? 'off (?webgl=0)' : 'unavailable');
    $('cost').innerHTML = s.active ? 'cpu <b>' + (s.avgMs || 0).toFixed(2) + ' ms</b>/frame &middot; derive <b>' + (s.avgDeriveMs || 0).toFixed(2) + ' ms</b>/shape' : 'post <b>none</b>';
    $('size').innerHTML = s.active ? 'canvas <b>' + cv.width + '&times;' + cv.height + '</b> &middot; buffers <b>' + s.buffer + '</b>' : 'canvas <b>' + cv.width + '&times;' + cv.height + '</b>';
    document.querySelectorAll('aside section[data-gl]').forEach(function (x) { x.classList.toggle('dim', !s.active); });
    ['splitRow', 'presetRow', 'onRow', 'j01Row', 'viewRow'].forEach(function (id) { $(id).classList.toggle('dim', !s.active); });
    $('offnote').hidden = !!s.active;
    $('stat').innerHTML = s.active ? 'passes: <b>' + s.postPasses.join(' &rarr; ') + '</b><br>sprites ' + s.frameSprites + ' &middot; shapes ' + s.frameShapes + ' &middot; lights ' + s.lights + (s.j01 ? ' (from J-01: ' + s.j01 + ')' : ' (own)') + '<br>lit ' + s.lit + ' / ' + s.frames + ' post frames' : 'passes: <b>-</b> (the plain 2D canvas)';
  }

  // ---------------------------------------------------------------- boot (after the images load)
  $('on').checked = nlOn; $('j01').checked = j01On;
  make(!/[?&]webgl=0/.test(location.search));
  $('webgl').checked = post.active;
  syncUI();
  /* text state for critics and tools/sprites/statecheck.py (view units, 640 x 360; feet). `facing` comes from drawnSide(), the same
     flipOf() the draw calls use; keeper and herbalist are never mirrored (ASSET), the slimes are (mirror: 'ok'). */
  window.__state = function () {
    var t = gameMs, actors = [{ id: 'hero', x: Math.round(hero.x), y: Math.round(hero.y), facing: drawnSide('keeper', hero.want), target: null,
      vx: hero.manual ? 0 : Math.round(PATH_DX / LOOP * STEP * 100) / 100, asset: { facing: ASSET.keeper.facing, mirror: ASSET.keeper.mirror }, flipX: flipOf('keeper', hero.want) }];
    actors.push({ id: 'herbalist', x: HERB.x, y: HERB.y, facing: drawnSide('herbalist', HERB.want), target: 'hero', asset: { facing: ASSET.herbalist.facing, mirror: ASSET.herbalist.mirror }, flipX: flipOf('herbalist', HERB.want) });
    SLIMES.forEach(function (sl) {
      var ph = t / 420 + sl.ph, n = Math.floor(ph / TAU), u = ph / TAU - n, air = u < 0.5, a = slimeX(sl, n), b = slimeX(sl, n + 1), e = air ? u * 2 : 1;
      actors.push({ id: sl.n, x: Math.round(a + (b - a) * (e * e * (3 - 2 * e))), y: sl.y, facing: drawnSide(sl.n, slimeWant(a, b)), target: null, vx: air ? Math.round((b - a) * 100) / 100 : 0 });
    });
    return { t: Math.round(t), mirrorRefused: refused, actors: actors };
  };
  window.__demo = function () { return { gameMs: gameMs, hero: { x: hero.x, y: hero.y, face: hero.want === 'left' ? -1 : 1 }, ready: ready, stats: nl.stats() }; };
  function boot() {
    if (HAS_T) {
      var n = Math.floor(T0 / STEP);
      for (var i = 0; i < n; i++) { var a = gameMs; step(); eventsBetween(a, gameMs, cast); }
      frame(); setTimeout(status, 0);
      if (FREEZE) { window.__frozen = true; return; }
    } else frame();
    var last = null, acc = 0;
    function loop(now) {
      if (last === null) last = now;
      acc += Math.min(100, now - last); last = now;
      var prev = gameMs;
      while (acc >= STEP) { var a = gameMs; step(); acc -= STEP; eventsBetween(a, gameMs, cast); }
      if (gameMs !== prev) frame();
      requestAnimationFrame(loop);
    }
    setInterval(status, 500);
    requestAnimationFrame(loop);
  }
})();
