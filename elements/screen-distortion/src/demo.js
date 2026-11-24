/* J-08 demo: a forge hall (shared demo kit: painted backdrop, rigged warden, golem, brazier) drawn on a plain 2D canvas,
   bent by GameDNA_Distort on the I-08 pipeline. */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search);
  var HAS_T = Q.has('t'), FREEZE = Q.get('freeze') === '1', T0 = HAS_T ? Math.max(0, Number(Q.get('t')) || 0) : 0;
  var W = 640, H = 360, GROUND = 262, WATER = 292, CYCLE = 2600, SLAM = 900, BURST = 1500;
  var KIT = GameDNA_DemoKit, HITK = 0.37;
  var HERO = { x: 236, h: 90 }, GOLEM = { x: 372, h: 122 }, BRAZ = { x: 150, y: 244, h: 58 }, HEARTH = { x: 62, y: 142 }, PORTAL = { x: 476, y: 103, rx: 38, ry: 62 };
  var IMPACT = { x: HERO.x + 42, y: GROUND - 43 }, CORE = { x: GOLEM.x - 14, y: GROUND - 72 }, CHEST0 = { x: 0, y: 0 };
  var cv = document.getElementById('game'), g = cv.getContext('2d');
  var gameMs = 0;
  var TAU = Math.PI * 2;

  // ---------------------------------------------------------------- helpers
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function ease(x) { x = clamp01(x); return x * x * (3 - 2 * x); }
  function easeOut(x) { x = clamp01(x); return 1 - Math.pow(1 - x, 3); }
  function easeIn(x) { x = clamp01(x); return x * x * x; }
  function lerp(a, b, x) { return a + (b - a) * x; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function soft(c, x, y, r, rgb, a) {
    var gr = c.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(0.45, 'rgba(' + rgb + ',' + (a * 0.35) + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function cyc(t) { var k = Math.floor(t / CYCLE); return { k: k, p: t - k * CYCLE, big: ((k % 3) + 3) % 3 === 2 }; }

  // ---------------------------------------------------------------- painted forge hall (demo kit backdrop)
  function hall(c, t) {
    KIT.backdrop(c, 'forge-hall', { x: 0, y: 0, w: W, h: WATER, groundY: GROUND });
    var fl = 0.85 + 0.15 * Math.sin(t * 0.011) * Math.sin(t * 0.0047 + 1.3);
    c.save(); c.globalCompositeOperation = 'lighter';
    soft(c, HEARTH.x, HEARTH.y + 6, 110, '255,130,50', 0.2 * fl);          // hearth light on the wall and floor
    c.restore();
    KIT.flame(c, HEARTH.x, HEARTH.y, 34, t);
  }

  // ---------------------------------------------------------------- portal: a veil across the right-hand archway
  function portal(c, t) {
    var x = PORTAL.x, y = PORTAL.y, rx = PORTAL.rx, ry = PORTAL.ry, i;
    c.save(); c.globalCompositeOperation = 'lighter'; soft(c, x, y + 20, 120, '120,80,255', 0.16); c.restore();   // violet spill on the pillars
    // the other side shows through: a translucent nebula over the painted landscape (the pass swirls and refracts all of it)
    c.save(); c.translate(x, y); c.scale(rx / 50, ry / 50);
    c.beginPath(); c.arc(0, 0, 50, 0, TAU); c.clip(); c.globalAlpha = 0.5;
    var ng = c.createRadialGradient(-8, -6, 2, 0, 0, 50);
    ng.addColorStop(0, '#f2e8ff'); ng.addColorStop(0.18, '#a98bff'); ng.addColorStop(0.5, '#4a2aa8'); ng.addColorStop(0.85, '#1b0f4a'); ng.addColorStop(1, '#2b1670');
    c.fillStyle = ng; c.fillRect(-50, -50, 100, 100);
    for (i = 0; i < 5; i++) {   // spiral arms, rotating slowly
      var a0 = i * TAU / 5 + t * 0.0006;
      c.strokeStyle = 'rgba(' + (i % 2 ? '120,220,255' : '220,170,255') + ',0.45)'; c.lineWidth = 3 - i * 0.3; c.beginPath();
      for (var s = 0; s <= 24; s++) { var q = s / 24, rad = 4 + q * 50, an = a0 + q * 2.6; var px = Math.cos(an) * rad, py = Math.sin(an) * rad; if (s) c.lineTo(px, py); else c.moveTo(px, py); }
      c.stroke();
    }
    for (var j = 0; j < 40; j++) {
      var sr = hash(j + 300) * 50, sa = hash(j + 400) * TAU + t * 0.0004 * (1 + hash(j));
      c.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.6 * hash(j + 500)).toFixed(2) + ')';
      c.fillRect(Math.cos(sa) * sr, Math.sin(sa) * sr, 1.4, 1.4);
    }
    c.restore();
    // rim light ring
    c.save(); c.translate(x, y); c.scale(rx / 50, ry / 50);
    c.lineWidth = 5; c.strokeStyle = 'rgba(150,110,255,0.3)'; c.beginPath(); c.arc(0, 0, 50, 0, TAU); c.stroke();
    c.lineWidth = 2; c.strokeStyle = 'rgba(214,190,255,0.92)'; c.beginPath(); c.arc(0, 0, 50, 0, TAU); c.stroke();
    c.restore();
  }

  // ---------------------------------------------------------------- brazier (kit prop) and embers
  function embers(c, t, x, y, n, spread, rise, seed) {
    for (var e = 0; e < n; e++) {
      var life = 1500 + hash(e + seed) * 900, ph = ((t + hash(e + 7 + seed) * 4000) % life) / life;
      var ex = x + (hash(e + 3 + seed) - 0.5) * spread + Math.sin(ph * 8 + e) * 6 * ph, ey = y - ph * rise;
      c.fillStyle = 'rgba(255,' + (150 + Math.round(90 * (1 - ph))) + ',80,' + (1 - ph).toFixed(2) + ')';
      c.fillRect(ex, ey, 1.6, 1.6);
    }
  }
  function brazier(c, t) {
    c.save(); c.globalCompositeOperation = 'lighter'; soft(c, BRAZ.x, BRAZ.y - 10, 70, '255,130,50', 0.16); c.restore();
    KIT.sprite(c, 'brazier', BRAZ.x, BRAZ.y, { h: BRAZ.h });
    KIT.flame(c, BRAZ.x, BRAZ.y - BRAZ.h * 0.78, 40, t);
    embers(c, t, BRAZ.x, BRAZ.y - BRAZ.h * 0.8, 16, 22, 110, 0);
    embers(c, t, HEARTH.x, HEARTH.y - 4, 10, 30, 40, 40);
  }

  // ---------------------------------------------------------------- quench channel along the front of the floor
  function water(c, t) {
    var lip = c.createLinearGradient(0, WATER - 7, 0, WATER); lip.addColorStop(0, 'rgba(24,12,26,0)'); lip.addColorStop(1, 'rgba(24,12,26,0.7)');
    c.fillStyle = lip; c.fillRect(0, WATER - 7, W, 7);
    var gr = c.createLinearGradient(0, WATER, 0, H); gr.addColorStop(0, '#3a2c58'); gr.addColorStop(0.4, '#1d1c40'); gr.addColorStop(1, '#0b0c22');
    c.fillStyle = gr; c.fillRect(0, WATER, W, H - WATER);
    var s = cv.width / W;   // mirror the 90 px of scene above the waterline into the channel (the pass wobbles it)
    c.save(); c.beginPath(); c.rect(0, WATER, W, H - WATER); c.clip();
    c.setTransform(s, 0, 0, -s, 0, 2 * WATER * s); c.globalAlpha = 0.42;
    c.drawImage(cv, 0, Math.round((WATER - 90) * s), Math.round(W * s), Math.round(90 * s), 0, WATER - 90, W, 90);
    c.restore();
    var fd = c.createLinearGradient(0, WATER, 0, H); fd.addColorStop(0, 'rgba(20,18,50,0.15)'); fd.addColorStop(1, 'rgba(8,8,26,0.85)');
    c.fillStyle = fd; c.fillRect(0, WATER, W, H - WATER);
    // reflections: hearth, brazier, portal
    function streak(x, rgb, w0, a) {
      for (var i = 0; i < 18; i++) {
        var y = WATER + 4 + i * 3.6, w = w0 * (1 - i / 22) + Math.sin(t * 0.003 + i * 1.4) * 4;
        c.fillStyle = 'rgba(' + rgb + ',' + (a * (1 - i / 18)).toFixed(3) + ')'; c.fillRect(x - w / 2 + Math.sin(t * 0.002 + i) * 3, y, w, 1.4);
      }
    }
    streak(HEARTH.x, '255,170,90', 54, 0.4); streak(BRAZ.x, '255,140,70', 30, 0.38); streak(PORTAL.x, '180,140,255', 46, 0.32);
    c.fillStyle = 'rgba(255,220,200,0.25)'; c.fillRect(0, WATER, W, 1);
    c.fillStyle = '#1a1222'; c.fillRect(0, WATER - 1, W, 2);
    for (var k = 0; k < 14; k++) { var lx = (hash(k + 90) * W + t * 0.01 * (k % 2 ? 1 : -1)) % W; c.fillStyle = 'rgba(200,190,255,0.18)'; c.fillRect(lx, WATER + 10 + hash(k + 91) * 55, 16 + hash(k) * 20, 1); }
  }

  // ---------------------------------------------------------------- cast: rigged warden (kit `sword`) and the kit golem
  var HERO_F = 1, GOLEM_F = -1;   // the one facing every draw / point / update call of the hero and the golem reads; __state reports it
  var heroA = KIT.actor('sword', { h: HERO.h }), golemA = KIT.actor('golem', { h: GOLEM.h });
  function strikeK(p) {   // warden: idle, wind up from 420 ms, the blade meets the golem's fist at SLAM ms (k = HITK of the overhead cut), recover by 1900 ms
    if (p < 420 || p >= 1900) return -1;
    if (p < 780) return 0.001 + 0.28 * ease((p - 420) / 360);
    if (p < SLAM) return lerp(0.28, HITK, (p - 780) / (SLAM - 780));
    if (p < 1100) return lerp(HITK, 0.4, (p - SLAM) / 200);
    return lerp(0.4, 1, ease((p - 1100) / 800));
  }
  function punchK(p) {    // golem: winds up from 520 ms, its fist lands on the blade at SLAM ms, back by 1500 ms
    if (p < 520 || p >= 1500) return -1;
    if (p < 800) return 0.001 + 0.3 * ease((p - 520) / 280);
    if (p < SLAM) return lerp(0.3, 0.44, (p - 800) / (SLAM - 800));
    if (p < 1020) return lerp(0.44, 0.5, (p - SLAM) / 120);
    return lerp(0.5, 1, (p - 1020) / 480);
  }
  function burstAt(t) { var C = cyc(t); return C.big ? C.p - BURST : -1; }
  function syncCast(t) {   // poses are a pure function of the game clock, so frozen frames equal live play
    var C = cyc(t), k = strikeK(C.p), gk = punchK(C.p), bT = burstAt(t);
    if (k >= 0) heroA.pose('attack', k); else heroA.pose(null);
    if (bT >= 0 && bT < 420) golemA.pose('hurt', bT / 420);
    else if (gk >= 0) golemA.pose('attack', gk);
    else golemA.pose(null);
  }
  function stepCast(t, dt) { syncCast(t); heroA.update(dt, { facing: HERO_F }); golemA.update(dt, { facing: GOLEM_F }); }   // fixed step only (the rig blends pose changes over 140 ms)
  function hero(c, t) { heroA.draw(c, HERO.x, GROUND, { h: HERO.h, facing: HERO_F, swoosh: '255,226,170' }); }
  function impactFx(c, t) {   // sparks where the blade stops the fist
    var C = cyc(t), dt = C.p - SLAM;
    if (dt < 0 || dt > 520) return;
    var q = dt / 520, e = easeOut(q);
    c.save(); c.globalCompositeOperation = 'lighter';
    soft(c, IMPACT.x, IMPACT.y, 16 + 22 * q, '255,206,140', 0.75 * (1 - q) * (1 - q));
    for (var i = 0; i < 12; i++) {
      var an = hash(i + 40) * TAU, sp = 14 + hash(i + 50) * 40, len = 5 * (1 - q) + 1.2;
      var x = IMPACT.x + Math.cos(an) * sp * e, y = IMPACT.y + Math.sin(an) * sp * e + 26 * q * q;
      c.strokeStyle = 'rgba(255,' + (196 + Math.round(50 * hash(i))) + ',130,' + (0.95 * (1 - q)).toFixed(2) + ')'; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - Math.cos(an) * len, y - Math.sin(an) * len); c.stroke();
    }
    c.restore();
  }
  function golem(c, t) {
    var C = cyc(t), p = C.p, burstT = burstAt(t), shattered = burstT >= 0;
    var regrow = 1;
    if (shattered) regrow = 0;
    else if (cyc(t - CYCLE).big) regrow = ease(p / 1600);   // the cycle after a burst: the core lights up again
    var flash = burstT >= 0 && burstT < 60 ? 0.3 : 0;
    golemA.draw(c, GOLEM.x, GROUND, { h: GOLEM.h, facing: GOLEM_F, flash: flash });
    var core = golemA.point('chest', GOLEM.x, GROUND, { h: GOLEM.h, facing: GOLEM_F }), cx = CORE.x + (core.x - CHEST0.x), cy = CORE.y + (core.y - CHEST0.y);
    if (regrow < 0.98) { var dk = c.createRadialGradient(cx, cy, 0, cx, cy, 11); dk.addColorStop(0, 'rgba(16,12,26,' + (0.85 * (1 - regrow)).toFixed(2) + ')'); dk.addColorStop(0.6, 'rgba(16,12,26,' + (0.6 * (1 - regrow)).toFixed(2) + ')'); dk.addColorStop(1, 'rgba(16,12,26,0)'); c.fillStyle = dk; c.fillRect(cx - 11, cy - 11, 22, 22); }
    if (regrow > 0.02) { c.save(); c.globalCompositeOperation = 'lighter'; soft(c, cx, cy, 22 * regrow + 4, '90,220,235', (0.34 + 0.1 * Math.sin(t * 0.005)) * regrow); c.restore(); }
    if (shattered && burstT < 900) {   // flash and shards
      var q = burstT / 900;
      c.save(); c.globalCompositeOperation = 'lighter'; soft(c, CORE.x, CORE.y, 26 + 70 * q, '120,225,255', 0.6 * (1 - q) * (1 - q)); c.restore();
      for (var i = 0; i < 14; i++) {
        var an = hash(i + 200) * TAU, sp = 60 + hash(i + 210) * 120, sx = CORE.x + Math.cos(an) * sp * easeOut(q), sy = CORE.y + Math.sin(an) * sp * easeOut(q) + 90 * q * q;
        c.save(); c.translate(sx, sy); c.rotate(an + q * 6); c.fillStyle = 'rgba(170,244,255,' + (1 - q).toFixed(2) + ')';
        c.beginPath(); c.moveTo(0, -4.5); c.lineTo(2.8, 0); c.lineTo(0, 4.5); c.lineTo(-2.8, 0); c.closePath(); c.fill(); c.restore();
      }
    }
  }

  // ---------------------------------------------------------------- HUD (white text on purpose: it must never bend)
  var HUD = { stat: { x: 12, y: 12, w: 204, h: 52 }, relic: { x: W - 150, y: 12, w: 138, h: 30 }, bar: { x: W / 2 - 118, y: H - 48, w: 236, h: 38 } };
  function uiRects() { function r9(q) { return { x: q.x, y: q.y, w: q.w, h: q.h, r: 9 }; } return [r9(HUD.stat), r9(HUD.relic), r9(HUD.bar)]; }
  var UIF = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  function panel(c, r) {
    c.fillStyle = 'rgba(236,226,255,0.92)'; rr(c, r.x, r.y, r.w, r.h, 9); c.fill();
    c.fillStyle = 'rgba(18,12,34,0.93)'; rr(c, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 8); c.fill();
  }
  function hud(c, t) {
    var C = cyc(t);
    c.save(); c.textBaseline = 'top';
    panel(c, HUD.stat);
    c.fillStyle = '#ffffff'; c.font = '700 13px ' + UIF; c.textAlign = 'left'; c.fillText('Bram', 24, 20);
    c.fillStyle = '#cfc6ea'; c.font = '600 10px ' + UIF; c.fillText('BLADE WARDEN  LV 7', 66, 22);
    c.fillStyle = 'rgba(255,255,255,0.1)'; rr(c, 24, 38, 180, 6, 3); c.fill(); rr(c, 24, 49, 180, 5, 2.5); c.fill();
    c.fillStyle = '#ff6a7a'; rr(c, 24, 38, 142, 6, 3); c.fill();
    var stam = C.p < SLAM ? 1 : Math.min(1, 0.55 + (C.p - SLAM) / 2600);
    c.fillStyle = '#ffd36a'; rr(c, 24, 49, 180 * stam, 5, 2.5); c.fill();
    panel(c, HUD.relic);
    c.fillStyle = '#b99cff'; c.beginPath(); c.moveTo(HUD.relic.x + 18, HUD.relic.y + 7); c.lineTo(HUD.relic.x + 24, HUD.relic.y + 15); c.lineTo(HUD.relic.x + 18, HUD.relic.y + 23); c.lineTo(HUD.relic.x + 12, HUD.relic.y + 15); c.closePath(); c.fill();
    c.fillStyle = '#ffffff'; c.font = '700 13px ' + UIF; c.textAlign = 'right'; c.fillText('Relics 3 / 5', HUD.relic.x + HUD.relic.w - 12, HUD.relic.y + 8);
    panel(c, HUD.bar);
    var names = ['Slam', 'Quake', 'Ward', 'Dash'], icons = ['#ffb04a', '#7fe6ff', '#b99cff', '#8af0a8'];
    for (var i = 0; i < 4; i++) {
      var s = { x: HUD.bar.x + 6 + i * 57, y: HUD.bar.y + 6, w: 54, h: 26 }, sel = i === (C.big ? 1 : 0);
      c.fillStyle = sel ? '#2c2050' : '#1e1838'; rr(c, s.x, s.y, s.w, s.h, 5); c.fill();
      c.fillStyle = icons[i]; c.beginPath(); c.arc(s.x + 12, s.y + 13, 5, 0, TAU); c.fill();
      c.fillStyle = '#ffffff'; c.font = '700 9px ' + UIF; c.textAlign = 'left'; c.fillText(String(i + 1), s.x + 4, s.y + 3);
      c.fillStyle = sel ? '#efe6ff' : '#c8c0e0'; c.font = '600 9px ' + UIF; c.fillText(names[i], s.x + 21, s.y + 9);
      if (sel) { c.strokeStyle = '#b99cff'; c.lineWidth = 1.5; rr(c, s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1, 5); c.stroke(); }
    }
    c.restore();
  }

  // ---------------------------------------------------------------- frame
  function drawScene(t) {
    var c = g, s = cv.width / W;
    c.setTransform(s, 0, 0, s, 0, 0); c.imageSmoothingEnabled = true; c.lineCap = 'butt';
    hall(c, t);
    portal(c, t);
    brazier(c, t);
    golem(c, t);
    hero(c, t);
    impactFx(c, t);
    water(c, t);
    hud(c, t);
  }

  // ---------------------------------------------------------------- distortion
  var PRESETS = {
    'default': {},
    subtle: { strength: 0.6, chroma: 0.15, shine: 0.15, wave: 6 },
    dramatic: { strength: 1.3, wave: 14, waveRadius: 220, chroma: 0.7, shine: 0.6, heat: 3.2, water: 3.2, portal: 1.4 },
    pure: { chroma: 0, shine: 0 },
    pixel: { snap: true, chroma: 0, shine: 0.25 }
  };
  var KEYS = ['strength', 'heat', 'water', 'portal', 'wave', 'waveRadius', 'waveWidth', 'waveMs', 'chroma', 'shine', 'underwater', 'uiFeather'];
  function base() { var o = {}; for (var k in GameDNA_Distort.defaults) o[k] = GameDNA_Distort.defaults[k]; return o; }
  var preset = PRESETS[Q.get('preset')] ? Q.get('preset') : 'default';
  var cfg = Object.assign(base(), PRESETS[preset]);
  KEYS.forEach(function (k) { if (Q.has(k) && isFinite(Number(Q.get(k)))) cfg[k] = Number(Q.get(k)); });
  if (Q.has('snap')) cfg.snap = Q.get('snap') === '1';
  cfg.debug = Q.get('debug') === '1';
  var REG = { heat: Q.get('heat_on') !== '0', water: Q.get('water_on') !== '0', portal: Q.get('portal_on') !== '0' };
  function regions() {
    var out = [];
    if (REG.heat) {
      out.push({ kind: 'heat', x: BRAZ.x - 46, y: 66, w: 92, h: BRAZ.y - BRAZ.h * 0.62 - 66, amount: 0.6 });   // from above the flame tips down to the coals: tools and chains behind it shimmer
      out.push({ kind: 'heat', x: 14, y: 28, w: 100, h: 132 });                                   // the hearth: fire mouth, hood and chimney
    }
    if (REG.water) out.push({ kind: 'water', x: 0, y: WATER + 2, w: W, h: H - WATER - 2 });
    if (REG.portal) out.push({ kind: 'portal', x: PORTAL.x - PORTAL.rx - 2, y: PORTAL.y - PORTAL.ry - 2, w: PORTAL.rx * 2 + 4, h: PORTAL.ry * 2 + 4 });
    return out;
  }
  var uiOn = Q.get('ui') !== '0', fxOn = Q.get('distort') !== '0';
  var post = null, fx = null;
  function make(on) {
    if (fx) fx.destroy(); if (post) post.destroy(); fx = post = null;
    if (on && /[?&]webgl=0/.test(location.search)) { var u = new URL(location.href); u.searchParams.delete('webgl'); history.replaceState(null, '', u); }
    post = GameDNA_Post.create({ canvas: cv, clock: function () { return gameMs; }, params: { passes: 'none', webgl: on ? 'auto' : 'off' } });
    fx = GameDNA_Distort.create({ post: post, view: { w: W, h: H }, clock: function () { return gameMs; }, params: Object.assign({}, cfg, { enabled: fxOn }), regions: regions, uiRects: uiOn ? uiRects : null });
    window.__post = post; window.__distort = fx;
    applySplit();
  }

  // ---------------------------------------------------------------- events on the game clock
  function eventsBetween(a, b, fn) {   // (a, b]: slams and bursts, in time order
    for (var k = Math.max(0, Math.floor(a / CYCLE) - 1); k * CYCLE <= b; k++) {
      var ts = k * CYCLE + SLAM, tb = k * CYCLE + BURST, big = k % 3 === 2;
      if (ts > a && ts <= b) fn(ts, 'slam');
      if (big && tb > a && tb <= b) fn(tb, 'burst');
    }
  }
  function fire(kind) {
    if (kind === 'slam') fx.shockwave(IMPACT.x, IMPACT.y, { strength: 0.8 });
    else fx.shockwave(CORE.x, CORE.y, { strength: 1.4 });
  }
  function frame() { drawScene(gameMs); fx.render(); }

  // ---------------------------------------------------------------- UI
  var $ = function (id) { return document.getElementById(id); };
  function fill(r) { r.style.setProperty('--fill', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); }
  function fmt(k, v) { return /waveMs|waveRadius|waveWidth|uiFeather/.test(k) ? String(Math.round(v)) : Number(v).toFixed(2); }
  function mark(id, v) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.v === v)); }); }
  function syncUI() {
    document.querySelectorAll('input[data-k]').forEach(function (r) { var k = r.dataset.k; r.value = cfg[k]; fill(r); r.parentNode.querySelector('output').textContent = fmt(k, cfg[k]); });
    mark('preset', preset); mark('snap', cfg.snap ? '1' : '0');
  }
  function set(o) { Object.assign(cfg, o); fx.setParams(o); if (FREEZE) frame(); }
  document.querySelectorAll('input[data-k]').forEach(function (r) {
    r.addEventListener('input', function () { var o = {}; o[r.dataset.k] = Number(r.value); preset = ''; mark('preset', ''); set(o); fill(r); r.parentNode.querySelector('output').textContent = fmt(r.dataset.k, r.value); });
  });
  function seg(id, fn) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.addEventListener('click', function () { fn(b.dataset.v); syncUI(); }); }); }
  seg('preset', function (v) { preset = v; var o = Object.assign(base(), PRESETS[v]); delete o.enabled; o.debug = cfg.debug; set(o); });
  seg('snap', function (v) { preset = ''; set({ snap: v === '1' }); });
  ['heat', 'water', 'portal'].forEach(function (k) { var el = $('r-' + k); el.checked = REG[k]; el.addEventListener('change', function () { REG[k] = el.checked; if (FREEZE) frame(); }); });
  $('debug').checked = cfg.debug; $('debug').addEventListener('change', function () { set({ debug: $('debug').checked }); });
  $('on').addEventListener('change', function () { fxOn = $('on').checked; fx.setEnabled(fxOn); if (FREEZE) frame(); });
  $('ui').addEventListener('change', function () { uiOn = $('ui').checked; fx.setUiRects(uiOn ? uiRects : null); if (FREEZE) frame(); });
  $('webgl').addEventListener('change', function () { make($('webgl').checked); frame(); status(); });
  function bigOne() { fx.shockwave(CORE.x, CORE.y, { strength: 1.5 }); if (FREEZE) frame(); }
  $('boom').addEventListener('click', bigOne);
  addEventListener('keydown', function (e) { if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); bigOne(); } });
  cv.addEventListener('pointerdown', function (e) {
    var r = cv.getBoundingClientRect(); if (!r.width) return;
    fx.shockwave((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H, { strength: 1 }); if (FREEZE) frame();
  });
  var splitX = Q.has('split') ? Math.max(0, Math.min(1, Number(Q.get('split')) || 0)) : 0;
  function applySplit() {
    var r = $('splitR'); r.value = splitX; fill(r); $('o-split').textContent = splitX > 0 ? Math.round(splitX * 100) + '%' : 'off';
    if (post && post.canvas) post.canvas.style.clipPath = splitX > 0 ? 'inset(0 0 0 ' + (splitX * 100) + '%)' : '';
    var line = $('split'); line.style.display = splitX > 0 && post && post.active ? 'block' : 'none'; line.style.left = (splitX * 100) + '%';
  }
  $('splitR').addEventListener('input', function () { splitX = Number($('splitR').value); applySplit(); });
  function status() {
    var s = fx.stats(), m = $('mode');
    m.className = s.active ? '' : 'off';
    m.innerHTML = s.active ? '<b>' + (s.mode === 'webgl2' ? 'WebGL2' : 'WebGL') + '</b> &middot; distortion ' + (s.enabled ? 'on' : 'off') : '<b>2D only</b> &middot; WebGL ' + (s.reason === 'option' ? 'switched off' : s.reason === 'url' ? 'off (?webgl=0)' : 'unavailable');
    $('cost').innerHTML = s.active ? 'cpu <b>' + (s.avgMs || 0).toFixed(2) + ' ms</b>/frame' : 'post <b>none</b>';
    $('size').innerHTML = s.active ? 'canvas <b>' + cv.width + '&times;' + cv.height + '</b> &rarr; <b>' + s.w + '&times;' + s.h + '</b> px' : 'canvas <b>' + cv.width + '&times;' + cv.height + '</b>';
    document.querySelectorAll('aside section[data-gl]').forEach(function (x) { x.classList.toggle('dim', !s.active); });
    $('splitRow').classList.toggle('dim', !s.active); $('presetRow').classList.toggle('dim', !s.active); $('onRow').classList.toggle('dim', !s.active); $('offnote').hidden = !!s.active;
    $('stat').innerHTML = s.active ? 'passes: <b>' + s.postPasses.join(' &rarr; ') + '</b><br>regions ' + s.regions + ' &middot; live waves ' + s.live + ' &middot; fired ' + s.waves + ' &middot; HUD rects ' + s.uiRects + '<br>drawn ' + s.drawn + ' / ' + s.frames + ' post frames (idle frames skip the pass)' : 'passes: <b>-</b> (the plain 2D canvas)';
  }

  // ---------------------------------------------------------------- boot
  $('on').checked = fxOn; $('ui').checked = uiOn;
  make(!/[?&]webgl=0/.test(location.search));
  $('webgl').checked = post.active;
  syncUI();
  /* text state for critics and tools/sprites/statecheck.py (stage px): the hero (left) strikes the golem (right); they face each other and never move */
  window.__state = function () { var dir = function (f) { return f > 0 ? 'right' : 'left'; }; return { t: Math.round(gameMs), actors: [
    { id: 'hero', x: HERO.x, y: GROUND, facing: dir(HERO_F), target: 'golem', asset: 'sword' },
    { id: 'golem', x: GOLEM.x, y: GROUND, facing: dir(GOLEM_F), target: 'hero', asset: 'golem' }] }; };
  window.__demo = function () { return { gameMs: gameMs, stats: fx.stats(), hero: heroA, golem: golemA, tip: heroA.point('tip', HERO.x, GROUND, { h: HERO.h, facing: HERO_F }), chest: golemA.point('chest', GOLEM.x, GROUND, { h: GOLEM.h, facing: GOLEM_F }) }; };

  var STEP = 1000 / 60;
  KIT.ready(function () {
    var c0 = golemA.point('chest', GOLEM.x, GROUND, { h: GOLEM.h, facing: GOLEM_F }); CHEST0.x = c0.x; CHEST0.y = c0.y;   // rest pose anchor: the core follows the recoil from here
    if (HAS_T) {
      for (var n = 1, N = Math.floor(T0 / STEP); n <= N; n++) stepCast(n * STEP, STEP);   // idle clocks advance in fixed steps, as in live play
      eventsBetween(Math.max(-1, T0 - 2000), T0, function (ts, kind) { gameMs = ts; fire(kind); });
      gameMs = T0; frame(); setTimeout(status, 0);
      if (FREEZE) { window.__frozen = true; document.documentElement.dataset.frozen = '1'; return; }
    } else frame();
    var last = null, acc = 0;
    function loop(now) {
      if (last === null) last = now;
      acc += Math.min(100, now - last); last = now;
      var prev = gameMs;
      while (acc >= STEP) { var a = gameMs; gameMs += STEP; acc -= STEP; stepCast(gameMs, STEP); eventsBetween(a, gameMs, function (ts, kind) { var keep = gameMs; gameMs = ts; fire(kind); gameMs = keep; }); }
      if (gameMs !== prev) frame();
      requestAnimationFrame(loop);
    }
    setInterval(status, 500);
    requestAnimationFrame(loop);
  });
})();
