/* J-06 demo: a lakeside camp in plain daylight (painted demo-kit scene and cast) on a 2D canvas, graded by GameDNA_ColorGrade over GameDNA_Post. */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search);
  var HAS_T = Q.has('t'), FREEZE = Q.get('freeze') === '1', T0 = HAS_T ? Math.max(0, Number(Q.get('t')) || 0) : 0;
  var W = 640, H = 360, STEP = 1000 / 60, TAU = Math.PI * 2;
  var cv = document.getElementById('game'), g = cv.getContext('2d');
  var frame = 0;                                   // fixed-step counter: the only clock
  function gameMs() { return frame * STEP; }

  var BEATS = [
    { id: 'neutral', title: 'Noon', place: 'Willowmere Shore' },
    { id: 'dusk', title: 'Dusk', place: 'Willowmere Shore' },
    { id: 'night', title: 'Cold night', place: 'Willowmere Shore' },
    { id: 'memory', title: 'Faded memory', place: 'Ten years earlier' },
    { id: 'combat', title: 'Ambush', place: 'Combat' },
    { id: 'toxic', title: 'Toxic fen', place: 'Mirefall Marsh' }
  ];
  var BEAT_MS = 3600;

  // ---------------------------------------------------------------- helpers
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function lin(c, x0, y0, x1, y1, stops) { var gr = c.createLinearGradient(x0, y0, x1, y1); for (var i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]); return gr; }
  function rad(c, x, y, r, stops) { var gr = c.createRadialGradient(x, y, 0, x, y, r); for (var i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]); return gr; }
  function ell(c, x, y, rx, ry, fill) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = fill; c.fill(); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function poly(c, pts, fill) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = fill; c.fill(); }
  function ridge(x, s, f) { return Math.sin(x * f + s) * 0.5 + Math.sin(x * f * 2.3 + s * 1.7) * 0.27 + Math.sin(x * f * 5.1 + s * 2.9) * 0.11; }

  // ---------------------------------------------------------------- scene: the shared painted demo kit (demo-kit/)
  // Backdrop 'lakeside-day' is painted in neutral daylight so every LUT has something to grade. The 2D canvas is drawn at
  // SS x the 640x360 stage so the painted art stays sharp on HiDPI screens; all coordinates below are stage units.
  var KIT = window.GameDNA_DemoKit;
  var SS = 2;
  cv.width = W * SS; cv.height = H * SS;
  var back = document.createElement('canvas'); back.width = W * SS; back.height = H * SS;
  function paintBack() {
    var c = back.getContext('2d'); c.setTransform(SS, 0, 0, SS, 0, 0);
    KIT.backdrop(c, 'lakeside-day', { x: 0, y: 0, w: W, h: H });
    // Scene prep (once): strongly saturated orange PIGMENT (roof tiles, sand path, timber) is eased below the saturation where
    // the night look treats a colour as a light source, so at night only the lamp, the fire and the windows stay warm.
    // Light sources are drawn live on top and are not touched. The art is data URIs, so the canvas is readable on file://.
    try {
      var im = c.getImageData(0, 0, back.width, back.height), d = im.data, KNEE = 0.38, K = 0.22;
      for (var i = 0; i < d.length; i += 4) {
        var r = d[i], g2 = d[i + 1], b = d[i + 2], mx = r > g2 ? (r > b ? r : b) : (g2 > b ? g2 : b), mn = r < g2 ? (r < b ? r : b) : (g2 < b ? g2 : b);
        if (mx !== r || mx === mn) continue;                               // warm hues only (red is the largest channel)
        var sat = (mx - mn) / mx, hue = 60 * (g2 - b) / (mx - mn);
        if (mx > 226 && sat > 0.06 && hue > 8) {                           // sunlit sand and plaster: just under "full brightness"
          var v = (226 + (mx - 226) * 0.25) / mx; d[i] = r = r * v; d[i + 1] = g2 = g2 * v; d[i + 2] = b = b * v;
        }
        if (sat <= KNEE) continue;
        var dist = Math.abs(hue - 32); if (dist >= 34) continue;
        var u = Math.min(1, (34 - dist) / 12), wgt = u * u * (3 - 2 * u), s2 = KNEE + (sat - KNEE) * K, f = 1 - wgt * (1 - s2 / sat);
        // keep the perceived lightness: desaturate toward the pixel's own luma, not toward its max channel
        var l = 0.299 * r + 0.587 * g2 + 0.114 * b;
        d[i] = l + (r - l) * f; d[i + 1] = l + (g2 - l) * f; d[i + 2] = l + (b - l) * f;
      }
      c.putImageData(im, 0, 0);
    } catch (e) { }
  }
  var LAKE = { x0: 300, x1: 636, y0: 184, y1: 244 };
  var HERO = { x: 296, y: 300, h: 98 }, FIRE = { x: 380, y: 305, h: 64 }, LAMP = { x: 440, y: 290, h: 150 }, WISP = { x: 516, y: 254, h: 38 };
  var HERO_F = 1, WISP_F = -1;   // the one facing every draw / update call of the hero (and its HUD portrait) and of the wisp reads; __state reports it
  function wispX(t) { return WISP.x + Math.sin(t * 0.0011) * 16; }
  var heroA = KIT.actor('sword', { h: HERO.h }), faceA = KIT.actor('sword', { h: 120 }), wispA = KIT.actor('wisp', { h: WISP.h });

  // warm / cool light pools are drawn OVER the picture (normal blending), never added: an additive halo over the pale sky or the
  // sand path clips to plain white and no LUT can bring the warmth back (the night look keys on warm, unclipped light colours)
  function glow(c, x, y, r, rgb, a) {
    c.fillStyle = rad(c, x, y, r, [0, 'rgba(' + rgb + ',' + a + ')', 0.4, 'rgba(' + rgb + ',' + (a * 0.4) + ')', 1, 'rgba(' + rgb + ',0)']);
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function water(c, t) {
    for (var i = 0; i < 22; i++) {
      var y = LAKE.y0 + hash(i + 30) * (LAKE.y1 - LAKE.y0), ph = (t * 0.0006 * (0.5 + hash(i)) + hash(i + 40)) % 1, span = LAKE.x1 - LAKE.x0;
      var w = 8 + hash(i + 60) * 22, x = LAKE.x0 + (hash(i + 50) * span + ph * 50) % (span - w);
      var a = (0.1 + 0.2 * Math.sin(ph * Math.PI)).toFixed(3);
      c.fillStyle = lin(c, x, 0, x + w, 0, [0, 'rgba(240,248,255,0)', 0.5, 'rgba(240,248,255,' + a + ')', 1, 'rgba(240,248,255,0)']); c.fillRect(x, y, w, 0.8);
    }
  }
  function windows(c, t) {
    var fl = 0.85 + 0.15 * Math.sin(t * 0.004) * Math.sin(t * 0.0023);
    glow(c, 103.5, 125, 13, '255,196,96', 0.5 * fl);      // gable window
    glow(c, 87.5, 167.5, 15, '255,196,96', 0.5 * fl);     // ground-floor window
    glow(c, 158.7, 166, 17, '255,190,90', 0.62 * fl);     // lantern on the porch beam
  }
  function lamp(c, t) {
    c.save(); c.translate(LAMP.x + 10, LAMP.y); c.scale(1, 0.28); glow(c, 0, 0, 62, '255,170,80', 0.2); c.restore();   // its pool on the ground
    KIT.sprite(c, 'lamp', LAMP.x, LAMP.y, { h: LAMP.h });
    var s = LAMP.h / 540, lx = LAMP.x + 76 * s, ly = LAMP.y - 405 * s, hr = 40 + Math.sin(t * 0.005) * 1.5;
    glow(c, lx, ly, hr, '255,196,104', 0.5);
    glow(c, lx, ly, 9, '255,226,150', 0.75);
  }
  function fire(c, t) {
    var x = FIRE.x, y = FIRE.y, s = FIRE.h / 250, fy = y - 62 * s, fl = 1 + Math.sin(t * 0.011) * 0.06 + Math.sin(t * 0.027 + 1.7) * 0.04;
    c.save(); c.translate(x, y - 2); c.scale(1, 0.3); glow(c, 0, 0, 92 * fl, '255,140,50', 0.34); c.restore();   // light pool on the path
    KIT.sprite(c, 'campfire', x, y, { h: FIRE.h });
    glow(c, x, fy, 30 * fl, '255,168,70', 0.42);
    // live flame tongues over the painted fire: soft-edged, same palette as the painted flame
    c.save(); c.globalAlpha = 0.85;
    for (var k = 0; k < 3; k++) {
      var sw = Math.sin(t * 0.012 + k * 2.1) * 1.6, hh = (11 + k % 2 * 4) * (0.8 + 0.2 * Math.sin(t * 0.019 + k * 1.7)), bx = x + (k - 1) * 4.5, by = y - 44 * s, hw = 3.6;
      c.beginPath(); c.moveTo(bx - hw, by); c.bezierCurveTo(bx - hw, by - hh * 0.5, bx + sw * 0.5 - 1, by - hh * 0.7, bx + sw, by - hh);
      c.bezierCurveTo(bx + sw * 0.5 + 1, by - hh * 0.7, bx + hw, by - hh * 0.5, bx + hw, by); c.closePath();
      c.fillStyle = lin(c, 0, by, 0, by - hh, [0, 'rgba(255,236,170,0.95)', 0.45, 'rgba(255,176,60,0.85)', 1, 'rgba(240,96,30,0)']); c.fill();
    }
    c.restore();
    for (var i = 0; i < 9; i++) {
      var k2 = ((t * 0.0007 + hash(i + 900)) % 1), sx = x + Math.sin(k2 * 9 + i) * 9 * k2, sy = y - 26 - k2 * 70;
      ell(c, sx, sy, 1.1 - k2 * 0.5, 1.1 - k2 * 0.5, 'rgba(255,' + (200 - k2 * 100 | 0) + ',80,' + (1 - k2).toFixed(2) + ')');
    }
  }
  function hero(c) { heroA.draw(c, HERO.x, HERO.y, { h: HERO.h, facing: HERO_F, light: 'right' }); }
  function wisp(c, t) {
    var x = wispX(t), y = WISP.y + Math.sin(t * 0.0023) * 5, cy = y - WISP.h * 1.42;
    glow(c, x, cy, 30, '90,235,215', 0.34);
    wispA.draw(c, x, y, { h: WISP.h, facing: WISP_F, shadow: false });
    // its light on the water below
    c.save(); c.translate(x, y - 22); c.scale(1, 0.22); glow(c, 0, 0, 26, '120,240,220', 0.3); c.restore();
  }
  function fireflies(c, t) {
    for (var i = 0; i < 12; i++) {
      var x = 120 + hash(i + 1100) * 420 + Math.sin(t * 0.0009 + i) * 20, y = 236 + hash(i + 1200) * 56 + Math.cos(t * 0.0013 + i * 2) * 8;
      var a = 0.4 + 0.6 * Math.max(0, Math.sin(t * 0.003 + i * 1.9));
      glow(c, x, y, 5, '226,255,130', 0.5 * a); ell(c, x, y, 0.9, 0.9, 'rgba(248,255,200,' + a.toFixed(2) + ')');
    }
  }
  // HUD portrait: the same rigged hero, cropped to the head (posed once, never animated)
  function portrait(c, cx, cy, r) {
    var o = { h: 120, facing: HERO_F, light: 'right', shadow: false }, hp = faceA.point('head', 0, 0, o);
    c.save(); c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.clip();
    c.fillStyle = lin(c, 0, cy - r, 0, cy + r, [0, '#4a5f8a', 1, '#2a2540']); c.fillRect(cx - r, cy - r, r * 2, r * 2);
    faceA.draw(c, cx - hp.x + PORT.dx, cy - hp.y + PORT.dy, o); c.restore();
  }
  var PORT = { dx: -1, dy: -9 };

  // ---------------------------------------------------------------- HUD (crisp UI, protected by uiRects)
  var HUD = { card: { x: 12, y: 12, w: 196, h: 54 }, zone: { x: 0, y: 12, w: 0, h: 40 }, bar: { x: 214, y: 316, w: 212, h: 34 } };
  function hudText(c, s, x, y, size, col, weight, align) { c.font = (weight || 600) + ' ' + size + 'px ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif'; c.textAlign = align || 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = col; c.fillText(s, x, y); }
  function panel(c, r) {
    c.save(); c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 10; c.shadowOffsetY = 3;
    rr(c, r.x, r.y, r.w, r.h, 9); c.fillStyle = 'rgba(16,14,26,0.86)'; c.fill(); c.restore();
    rr(c, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 9); c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 1; c.stroke();
  }
  function drawHud(c, t, beat) {
    var r = HUD.card; panel(c, r);
    portrait(c, r.x + 27, r.y + 27, 18);
    c.beginPath(); c.arc(r.x + 27, r.y + 27, 18, 0, TAU); c.strokeStyle = '#e8c04a'; c.lineWidth = 2; c.stroke();
    hudText(c, 'Wren', r.x + 54, r.y + 19, 13, '#ffffff', 700);
    hudText(c, 'Lv 7', r.x + r.w - 10, r.y + 19, 11, '#c9c2e0', 600, 'right');
    function bar(y, frac, a, b, label) {
      rr(c, r.x + 54, y, r.w - 64, 8, 4); c.fillStyle = '#2a2540'; c.fill();
      rr(c, r.x + 54, y, (r.w - 64) * frac, 8, 4); c.fillStyle = lin(c, r.x + 54, 0, r.x + r.w - 10, 0, [0, a, 1, b]); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(r.x + 58, y + 1, (r.w - 72) * frac, 1.5);
      hudText(c, label, r.x + r.w - 12, y + 7.5, 8.5, '#ffffff', 700, 'right');
    }
    bar(r.y + 27, 0.78, '#e8423a', '#ff8a5a', '62/80'); bar(r.y + 40, 0.55, '#3a7ae8', '#6ac8ff', '22/40');
    // zone card (right)
    c.font = '700 11px ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif';
    var w1 = c.measureText(beat.place.toUpperCase()).width; c.font = '600 15px ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif';
    var w = Math.ceil(Math.max(w1 + 8, c.measureText(beat.title).width) + 28);
    var z = HUD.zone; z.w = w; z.x = W - 12 - w; panel(c, z);
    hudText(c, beat.place.toUpperCase(), z.x + 14, z.y + 16, 10, '#e8c04a', 700);
    hudText(c, beat.title, z.x + 14, z.y + 33, 15, '#ffffff', 600);
    // hotbar: saturated item icons (the HUD must keep these exact colours)
    var hb = HUD.bar; panel(c, hb);
    var items = [['#e8423a', 'potion'], ['#4fbf4a', 'herb'], ['#4a8ae8', 'crystal'], ['#e8c04a', 'key'], ['#b06ae0', 'rune']];
    for (var i = 0; i < 5; i++) {
      var sx = hb.x + 8 + i * 41, sy = hb.y + 5;
      rr(c, sx, sy, 34, 24, 5); c.fillStyle = i === 0 ? '#3a3258' : '#24203a'; c.fill();
      var col = items[i][0], mx = sx + 17, my = sy + 12;
      if (i === 0) { ell(c, mx, my + 2, 6, 6, col); c.fillStyle = '#d8d0e8'; c.fillRect(mx - 2, my - 8, 4, 5); }
      else if (i === 1) { poly(c, [mx, my - 8, mx + 6, my, mx, my + 8, mx - 6, my], col); }
      else if (i === 2) { poly(c, [mx, my - 9, mx + 5, my - 2, mx, my + 9, mx - 5, my - 2], col); }
      else if (i === 3) { ell(c, mx - 4, my, 4, 4, col); c.fillStyle = col; c.fillRect(mx, my - 1.5, 9, 3); c.fillRect(mx + 6, my, 2, 4); }
      else { rr(c, mx - 6, my - 7, 12, 14, 3); c.fillStyle = col; c.fill(); c.fillStyle = '#fff'; c.fillRect(mx - 1, my - 4, 2, 8); }
      hudText(c, String(i + 1), sx + 31, sy + 22, 8, '#c9c2e0', 700, 'right');
    }
  }
  function hudRects() {
    if (!S.hud) return [];
    return [HUD.card, HUD.zone, HUD.bar].map(function (r) { return { x: r.x * SS, y: r.y * SS, w: r.w * SS, h: r.h * SS, r: 9 * SS }; });   // exactly the panels, rounded like them (canvas px)
  }

  // ---------------------------------------------------------------- state, params, URL overrides
  var S = { tour: Q.get('tour') !== '0' && !Q.has('preset'), beat: 0, picked: Q.get('preset') || 'neutral', hud: Q.get('hud') !== '0', webgl: true };
  var P0 = { strength: 1, blend: 1200, vignette: 0.3, grain: 0.035, grainSize: 1.5, builtin: 'replace' };
  ['strength', 'blend', 'vignette', 'grain', 'grainSize'].forEach(function (k) { if (Q.has(k) && isFinite(Number(Q.get(k)))) P0[k] = Number(Q.get(k)); });
  if (Q.get('builtin') === 'keep') P0.builtin = 'keep';
  var split = Q.has('split') ? Math.max(0.05, Math.min(0.95, Number(Q.get('split')) || 0.5)) : 0.5;
  var cmpOn = Q.has('split');

  // the game's own I-08 instance (as a game with I-08 would have), then the grade shares it
  var post = GameDNA_Post.create({ canvas: cv, clock: gameMs, params: { passes: 'grade+pulse', look: 'filmic', vignette: 0.35 } });
  var grade = GameDNA_ColorGrade.create({
    canvas: cv, clock: gameMs,
    params: { preset: S.tour ? 'neutral' : S.picked, strength: P0.strength, blend: P0.blend, vignette: P0.vignette, grain: P0.grain, grainSize: P0.grainSize, builtin: P0.builtin, compare: cmpOn ? split : -1 },
    uiRects: hudRects
  });
  // ?to=night&at=1000: start one blend at a fixed game time (deterministic mid-blend screenshots)
  var TO = Q.get('to'), AT = Q.has('at') ? Number(Q.get('at')) || 0 : 0;

  function wanted() {
    if (S.tour) return BEATS[Math.floor(gameMs() / BEAT_MS) % BEATS.length].id;
    if (TO && gameMs() >= AT) return TO;
    return S.picked;
  }
  function beatOf(id) { for (var i = 0; i < BEATS.length; i++) if (BEATS[i].id === id) return BEATS[i]; return { id: id, title: id === 'custom' ? 'Custom LUT' : id, place: 'Loaded strip' }; }
  function step() {
    frame++;
    heroA.update(STEP, { facing: HERO_F }); wispA.update(STEP, { facing: WISP_F });
    grade.to(wanted(), grade.params().blend);   // idempotent: the look follows the beat / pick
  }
  function draw() {
    var t = gameMs();
    var st = grade.active ? grade.state() : { to: wanted() };
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(back, 0, 0);
    g.setTransform(SS, 0, 0, SS, 0, 0);
    water(g, t); windows(g, t); wisp(g, t);
    lamp(g, t); hero(g); fire(g, t); fireflies(g, t);
    drawHud(g, t, beatOf(st.to));
    grade.render();
  }

  // ---------------------------------------------------------------- panel
  function $(id) { return document.getElementById(id); }
  // ?t=&freeze=1 pages have no loop: after a control change, cut to the wanted look and draw one frame (no blend can run in frozen time)
  var FROZEN = false;
  function refresh() {
    if (!FROZEN) return;
    try { if (grade.active && grade.state().to !== wanted()) grade.set(wanted()); draw(); post.renderNow(); panelTick(); } catch (e) { }
  }
  function pipelineOn() { return !!(grade.active && post.active && S.webgl); }
  var beatsEl = $('beats');
  BEATS.forEach(function (b) {
    var btn = document.createElement('button'); btn.className = 'beat'; btn.dataset.id = b.id;
    var sw = document.createElement('canvas'); sw.width = 120; sw.height = 22; btn.appendChild(sw);
    btn.appendChild(document.createTextNode(b.title));
    var L = GameDNA_ColorGrade.fromRecipe(GameDNA_ColorGrade.presets[b.id]), x = sw.getContext('2d'), sky = [[0.25, 0.47, 0.77], [0.5, 0.69, 0.89], [0.36, 0.62, 0.27], [0.94, 0.76, 0.6], [1, 0.65, 0.2], [0.85, 0.23, 0.17], [0.42, 0.23, 0.6], [0.5, 0.5, 0.5]];
    sky.forEach(function (col, i) { var o = GameDNA_ColorGrade.sample(L, col[0], col[1], col[2]); x.fillStyle = 'rgb(' + o.map(function (v) { return Math.round(v * 255); }).join(',') + ')'; x.fillRect(i * 15, 0, 15, 22); });
    btn.onclick = function () { S.tour = false; $('tour').checked = false; S.picked = b.id; TO = null; syncBeats(); refresh(); };
    beatsEl.appendChild(btn);
  });
  function syncBeats() { var id = grade.active ? grade.state().to : wanted(); [].forEach.call(beatsEl.children, function (b) { b.setAttribute('aria-pressed', b.dataset.id === id ? 'true' : 'false'); }); }
  function fillRange(r) { var a = Number(r.min), b = Number(r.max); r.style.setProperty('--fill', ((Number(r.value) - a) / (b - a) * 100) + '%'); }
  [].forEach.call(document.querySelectorAll('input[data-k]'), function (r) {
    var k = r.dataset.k, out = r.parentNode.querySelector('output');
    r.value = P0[k]; fillRange(r); out.textContent = r.value;
    r.oninput = function () { var o = {}; o[k] = Number(r.value); grade.setParams(o); out.textContent = r.value; fillRange(r); refresh(); };
  });
  $('tour').checked = S.tour; $('tour').onchange = function () { S.tour = this.checked; if (!S.tour) S.picked = grade.state().to; refresh(); };
  $('hud').checked = S.hud; $('hud').onchange = function () { S.hud = this.checked; refresh(); };
  // without WebGL (or with ?webgl=0) the switch shows off and cannot be turned on
  $('webgl').checked = !!grade.active; $('webgl').disabled = !grade.active;
  $('webgl').onchange = function () { S.webgl = this.checked; if (post.active || post.mode !== 'off') post.setEnabled(S.webgl); applySplit(); panelTick(); refresh(); };
  var splitR = $('split'); splitR.value = split; fillRange(splitR); $('o-split').textContent = split.toFixed(2);
  $('cmp').checked = cmpOn;
  function applySplit() { grade.compare(cmpOn ? split : false); var tg = cmpOn && pipelineOn(); $('tagL').classList.toggle('on', tg); $('tagR').classList.toggle('on', tg); splitR.value = split; fillRange(splitR); $('o-split').textContent = split.toFixed(2); refresh(); }
  $('cmp').onchange = function () { cmpOn = this.checked; applySplit(); };
  splitR.oninput = function () { split = Number(splitR.value); cmpOn = true; $('cmp').checked = true; applySplit(); };
  var dragging = false;
  function dragTo(e) { var r = cv.getBoundingClientRect(); split = Math.max(0.05, Math.min(0.95, (e.clientX - r.left) / r.width)); cmpOn = true; $('cmp').checked = true; applySplit(); }
  $('frame').addEventListener('pointerdown', function (e) { dragging = true; dragTo(e); });
  addEventListener('pointermove', function (e) { if (dragging) dragTo(e); });
  addEventListener('pointerup', function () { dragging = false; });
  [].forEach.call($('builtin').children, function (b) {
    b.setAttribute('aria-checked', b.dataset.v === P0.builtin ? 'true' : 'false');
    b.onclick = function () { grade.setParams({ builtin: b.dataset.v }); [].forEach.call($('builtin').children, function (x) { x.setAttribute('aria-checked', x === b ? 'true' : 'false'); }); refresh(); };
  });
  $('file').onchange = function () {
    var f = this.files && this.files[0]; if (!f) return;
    var done = function (ok) { if (ok) { S.tour = false; $('tour').checked = false; S.picked = 'custom'; TO = null; grade.set('custom'); syncBeats(); refresh(); } else alert('Could not read that LUT (need a 3D .cube or a strip / grid PNG).'); };
    if (/\.cube$/i.test(f.name)) { f.text().then(function (txt) { grade.define('custom', txt); done(grade.has('custom')); }); }
    else { var img = new Image(); img.onload = function () { grade.define('custom', img); done(grade.has('custom')); }; img.onerror = function () { done(false); }; img.src = URL.createObjectURL(f); }
  };
  $('save').onclick = function () { try { var c2 = grade.strip(grade.active ? grade.state().to : S.picked) || GameDNA_ColorGrade.toCanvas(GameDNA_ColorGrade.identity()); this.href = c2.toDataURL('image/png'); this.download = (grade.active ? grade.state().to : 'neutral') + '-lut-strip.png'; } catch (e) { } };
  applySplit();

  var shownA = null, shownB = null;
  function panelTick() {
    var st = grade.active ? grade.state() : null;
    var on = pipelineOn();
    $('mode').textContent = on ? (post.mode.toUpperCase() + ' · ' + grade.stats().passes.filter(function (n) { return post.get(n) && post.get(n).enabled; }).join(' → '))
      : grade.active ? 'Pipeline off · plain 2D canvas' : 'WebGL off · plain 2D canvas (' + (grade.reason || 'off') + ')';
    $('mode').classList.toggle('off', !on);
    ['sec-lut', 'sec-lens', 'sec-hud'].forEach(function (id) { $(id).classList.toggle('dim', !on); });
    $('beats').classList.toggle('dim', !on); $('offnote').classList.toggle('on', !on);
    var tg = cmpOn && on; $('tagL').classList.toggle('on', tg); $('tagR').classList.toggle('on', tg);
    if (st) {
      $('now').innerHTML = 'look <b>' + (st.blending ? st.from + ' → ' + st.to + ' ' + Math.round(st.mix * 100) + '%' : st.to) + '</b>';
      $('fromN').textContent = st.from; $('toN').textContent = st.to; $('mix').style.width = (st.mix * 100).toFixed(1) + '%';
      if (shownA !== st.from) { shownA = st.from; var a = grade.strip(st.from); if (a) $('stripA').getContext('2d').drawImage(a, 0, 0); }
      if (shownB !== st.to) { shownB = st.to; var b = grade.strip(st.to); if (b) $('stripB').getContext('2d').drawImage(b, 0, 0); }
      var ps = post.stats();
      $('cost').innerHTML = 'post <b>' + (ps.avgMs || 0).toFixed(1) + ' ms</b> CPU · ' + ps.w + '×' + ps.h;
      var gs = grade.stats();
      $('stat').innerHTML = 'chain <b>' + ps.passes.join(' → ') + '</b><br>built-in grade <b>' + (gs.builtinGrade ? 'on (after LUT)' : 'off (replaced)') + '</b> · HUD rects <b>' + gs.uiRects + '</b><br>blends <b>' + gs.blends + '</b> · baked mid-blend <b>' + gs.bakes + '</b> · game <b>' + (gameMs() / 1000).toFixed(1) + ' s</b>';
    } else {
      $('now').innerHTML = 'look <b>' + wanted() + ' (not applied)</b>';
      $('stat').innerHTML = 'GameDNA_ColorGrade inactive: <b>' + grade.reason + '</b>. The canvas shows exactly as drawn.';
    }
    syncBeats();
  }

  // ---------------------------------------------------------------- loop (fixed step; ?t=&freeze=1 deterministic)
  /* text state for critics and tools/sprites/statecheck.py (640x360 stage px): the hero by the fire looks at the wisp over the water, the wisp
     looks back; the HUD portrait is the same rig cropped to the head (a UI picture: it looks into the HUD card, no target) */
  window.__state = function () { var t = gameMs(), dir = function (f) { return f > 0 ? 'right' : 'left'; }, hp = faceA.point('head', 0, 0, { h: 120, facing: HERO_F });
    return { t: Math.round(t), actors: [
      { id: 'hero', x: HERO.x, y: HERO.y, facing: dir(HERO_F), target: 'wisp', asset: 'sword' },
      { id: 'wisp', x: Math.round(wispX(t)), y: Math.round(WISP.y + Math.sin(t * 0.0023) * 5), facing: dir(WISP_F), target: 'hero', asset: 'wisp' },
      { id: 'hud-portrait', x: Math.round(HUD.card.x + 27 - hp.x + PORT.dx), y: Math.round(HUD.card.y + 27 - hp.y + PORT.dy), facing: dir(HERO_F), target: null, asset: 'sword' }] }; };
  window.__demo = { grade: grade, post: post, state: function () { return { ms: gameMs(), frame: frame, grade: grade.state(), active: grade.active }; } };
  var acc = 0, prev = null, pt = 0;
  function loop(now) {
    if (prev === null) prev = now;
    acc += Math.min(250, now - prev); prev = now;
    while (acc >= STEP) { step(); acc -= STEP; }
    draw();
    if (++pt % 6 === 0) panelTick();
    requestAnimationFrame(loop);
  }
  // boot once the kit art has decoded (no timers: safe under fake clocks); the frozen paint happens in here
  KIT.ready(function () {
    paintBack(); faceA.update(0, { facing: HERO_F });
    if (HAS_T) { var n = Math.floor(T0 / STEP); for (var i = 0; i < n; i++) step(); }
    draw(); panelTick();
    if (HAS_T && FREEZE) { post.renderNow(); panelTick(); FROZEN = true; window.__frozen = true; document.documentElement.dataset.frozen = '1'; return; }
    requestAnimationFrame(loop);
  });
})();
