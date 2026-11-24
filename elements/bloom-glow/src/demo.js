/* J-03 demo: an original moonlit ruin duel (shared demo-kit cast and backdrop) drawn on a plain 2D canvas, bloomed by GameDNA_Bloom on the I-08 pipeline. */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search);
  var HAS_T = Q.has('t'), FREEZE = Q.get('freeze') === '1', T0 = HAS_T ? Math.max(0, Number(Q.get('t')) || 0) : 0;
  var W = 640, H = 360, CYCLE = 2400, LAUNCH = 700, IMPACT = 1500, GROUND = 288;
  var MAGE = { x: 168, y: GROUND + 4 }, GOLEM = { x: 478, y: GROUND + 6 };
  var cv = document.getElementById('game'), g = cv.getContext('2d');
  var gameMs = 0, manualFlares = [];
  var EMIS = Q.get('emissive') !== '0';

  // ---------------------------------------------------------------- helpers
  var TAU = Math.PI * 2;
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function ease(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function easeOut(x) { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function soft(c, x, y, r, rgb, a) {
    var gr = c.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(0.4, 'rgba(' + rgb + ',' + (a * 0.35) + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function castIndexAt(t) { return Math.floor((t - IMPACT) / CYCLE); }
  function isNova(k) { return ((k % 3) + 3) % 3 === 2; }
  function phaseOf(t) { var k = Math.floor(t / CYCLE); return { k: k, p: t - k * CYCLE, nova: isNova(k) }; }

  // ---------------------------------------------------------------- world (2D, exactly what a game without bloom shows)
  // Cast, props and backdrop come from the shared demo kit (demo-kit/): rigged mage, painted golem, lamps, braziers, night ruins.
  var KIT = GameDNA_DemoKit, STEP = 1000 / 60, CAST_AT = LAUNCH - 300;   // the cast animation's strike lands on LAUNCH
  var MAGE_H = 96, GOLEM_H = 134, MAGE_F = 1, GOLEM_F = -1;   // the one facing each draw / point / update call reads (and __state reports)
  var mageA = KIT.actor('mage', { h: MAGE_H }), golemA = KIT.actor('golem', { h: GOLEM_H });
  var HIT = { x: GOLEM.x - 34, y: GOLEM.y - 76 };            // where fireballs land (the golem's chest)
  var SRC = { x: MAGE.x + 40, y: MAGE.y - 92 };              // the staff crystal at the last launch (set in the fixed step)
  var BS = 640 / 1440;                                       // backdrop scale: the 1440x810 painting fills the 640x360 view, mirrored so the moon is on the right
  var MOON = { x: W - 298 * BS, y: 78 * BS };
  var STONE = [[W - 1365 * BS, 472 * BS], [W - 67 * BS, 472 * BS]];   // the two lit stone lanterns painted into the backdrop (luminance only)
  var LAMPS = [{ x: 122, y: 262, h: 164, f: 1 }, { x: 398, y: 262, h: 164, f: -1 }];      // kit lamp posts: emissive
  var BRAZ = [{ x: 66, y: 314, h: 58 }, { x: 590, y: 310, h: 58 }];                        // kit braziers: emissive
  function lampPt(l) { return { x: l.x + 0.147 * l.h * l.f, y: l.y - 0.775 * l.h }; }
  function brazPt(b) { return { x: b.x, y: b.y - 0.82 * b.h }; }
  function lanternLight(t, i) { return 0.86 + 0.14 * Math.sin(t * 0.011 + i * 2.1) * Math.sin(t * 0.0047 + i); }
  function tipPt() { return mageA.point('tip', MAGE.x, MAGE.y, { h: MAGE_H, facing: MAGE_F }); }
  function golemPt(dx, dy) {   // a point on the painted golem (in its heights from the feet centre, dx toward its face), following its recoil
    var p = golemA.point('chest', GOLEM.x, GOLEM.y, { h: GOLEM_H, facing: GOLEM_F });   // it faces left (the mage): art offsets mirror
    return { x: p.x + 0.04 * GOLEM_H - dx * GOLEM_H, y: p.y + 0.55 * GOLEM_H - dy * GOLEM_H };
  }
  function lighter(c, fn) { c.save(); c.globalCompositeOperation = 'lighter'; fn(); c.restore(); }
  function backdrop(c, t) {
    c.save(); c.translate(W, 0); c.scale(-1, 1);
    if (!KIT.backdrop(c, 'ruins-night', { x: 0, y: 0, w: W, h: H, groundY: 0.8 * H })) { c.fillStyle = '#1b1838'; c.fillRect(0, 0, W, H); }
    c.restore();
    var ng = c.createLinearGradient(0, 0, 0, H); ng.addColorStop(0, 'rgba(10,8,40,0.12)'); ng.addColorStop(0.6, 'rgba(10,8,40,0.36)'); ng.addColorStop(1, 'rgba(8,6,30,0.5)');
    c.fillStyle = ng; c.fillRect(0, 0, W, H);                // deepen the night a little so the lights carry the frame
    lighter(c, function () {
      soft(c, MOON.x, MOON.y, 26, '255,236,190', 0.30);
      for (var k = 0; k < STONE.length; k++) { var fl = lanternLight(t, k + 4); soft(c, STONE[k][0], STONE[k][1], 34, '255,170,90', 0.20 * fl); soft(c, STONE[k][0], STONE[k][1], 9, '255,232,170', 0.75 * fl); }
    });
  }
  function lamps(c, t) {
    for (var k = 0; k < LAMPS.length; k++) {
      var l = LAMPS[k], p = lampPt(l), fl = lanternLight(t, k);
      KIT.sprite(c, 'lamp', l.x, l.y, { h: l.h, facing: l.f });
      lighter(c, function () { soft(c, p.x, p.y, 40, '255,170,90', 0.22 * fl); soft(c, p.x, p.y, 8, '255,236,180', 0.7 * fl); soft(c, l.x + 6 * l.f, l.y + 2, 44, '255,170,90', 0.10 * fl); });
    }
  }
  function brazier(c, t, k) {
    var b = BRAZ[k], p = brazPt(b), fl = lanternLight(t, k + 2);
    KIT.sprite(c, 'brazier', b.x, b.y, { h: b.h });
    KIT.flame(c, p.x, p.y, 30, t + k * 400);
    lighter(c, function () { soft(c, b.x, b.y, 50, '255,150,70', 0.10 * fl); });
  }

  // ---------------------------------------------------------------- actors
  function orbAt(t) { var P = phaseOf(t); var grow = P.p < LAUNCH ? ease(P.p / LAUNCH) : P.p < LAUNCH + 120 ? 1 - (P.p - LAUNCH) / 120 : 0; return { grow: grow, nova: P.nova }; }
  function mage(c, t) {
    mageA.draw(c, MAGE.x, MAGE.y, { h: MAGE_H, facing: MAGE_F, light: 'right' });
    var O = orbAt(t), T = tipPt(), r = 2.5 + 3.5 * O.grow * (O.nova ? 1.5 : 1);
    lighter(c, function () {
      soft(c, T.x, T.y, 10 + 16 * O.grow, '255,150,60', 0.16 + 0.3 * O.grow);
      var og = c.createRadialGradient(T.x, T.y, 0, T.x, T.y, r + 2); og.addColorStop(0, 'rgba(255,246,216,' + (0.35 + 0.65 * O.grow).toFixed(3) + ')'); og.addColorStop(0.5, 'rgba(255,176,74,' + (0.3 + 0.6 * O.grow).toFixed(3) + ')'); og.addColorStop(1, 'rgba(255,110,40,0)');
      c.fillStyle = og; c.beginPath(); c.arc(T.x, T.y, r + 2, 0, TAU); c.fill();
    });
  }
  function fireballAt(t) {
    var P = phaseOf(t);
    if (P.p < LAUNCH || P.p >= IMPACT) return null;
    var f = (P.p - LAUNCH) / (IMPACT - LAUNCH), e = f * f * (3 - 2 * f) * 0.35 + f * 0.65;
    var sx = SRC.x, sy = SRC.y, tx = HIT.x, ty = HIT.y;
    return { x: sx + (tx - sx) * e, y: sy + (ty - sy) * e - Math.sin(e * Math.PI) * 40, f: f, nova: P.nova, vx: tx - sx };
  }
  function fireballShape(c, B, core) {
    var r = B.nova ? 9 : 6;
    for (var i = 1; i <= 9; i++) {   // trail
      var tb = fireballAt(gameMs - i * 18); if (!tb) break;
      var a = (1 - i / 10) * (core ? 0.55 : 0.4);
      c.fillStyle = core ? 'rgba(255,' + (150 + i * 8) + ',70,' + a.toFixed(3) + ')' : 'rgba(255,120,50,' + a.toFixed(3) + ')';
      c.beginPath(); c.arc(tb.x, tb.y, r * (1 - i / 12), 0, TAU); c.fill();
    }
    var gr = c.createRadialGradient(B.x - 1, B.y - 1, 0, B.x, B.y, r);
    gr.addColorStop(0, '#fffbe8'); gr.addColorStop(0.35, '#ffd27a'); gr.addColorStop(0.75, '#ff7a2a'); gr.addColorStop(1, 'rgba(230,60,20,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(B.x, B.y, r, 0, TAU); c.fill();
  }
  function lastImpact(t) { var k = castIndexAt(t); return k >= 0 ? { at: k * CYCLE + IMPACT, nova: isNova(k) } : null; }
  var GEM = [0.113, 0.58], EYES = [[0.118, 0.783], [0.182, 0.781]];   // the golem's chest crystal and eyes, in its heights
  function golem(c, t, emis) {
    var pulse = 0.75 + 0.25 * Math.sin(t * 0.005), gp = golemPt(GEM[0], GEM[1]);
    if (!emis) {
      golemA.draw(c, GOLEM.x, GOLEM.y, { h: GOLEM_H, facing: GOLEM_F, flash: 0 });   // no white hurt flash: on a pale stone golem it would bloom into a white blob
      lighter(c, function () { soft(c, gp.x, gp.y, 16, '110,240,255', 0.28 * pulse); soft(c, gp.x, gp.y, 5, '220,255,255', 0.5 * pulse); });
      return;
    }
    // crystal and eyes: also drawn into the emissive layer (teal is not a bright pixel, so it would not bloom by itself)
    bloom.glow(gp.x, gp.y, 15, '#78f0ff', 0.75 * pulse);
    c.fillStyle = 'rgba(150,250,255,' + (0.8 * pulse).toFixed(2) + ')';
    c.beginPath(); c.moveTo(gp.x, gp.y - 8); c.lineTo(gp.x + 6, gp.y); c.lineTo(gp.x, gp.y + 8); c.lineTo(gp.x - 6, gp.y); c.closePath(); c.fill();
    for (var i = 0; i < EYES.length; i++) { var ep = golemPt(EYES[i][0], EYES[i][1]); bloom.glow(ep.x, ep.y, 5, '#aafaff', 0.9 * pulse); }
  }
  function explosion(c, t, emis) {
    var L = lastImpact(t); if (!L) return;
    var since = t - L.at; if (since < 0 || since > 650) return;
    var p = since / 650, x = HIT.x, y = HIT.y, big = L.nova ? 1.6 : 1;
    c.save(); c.globalCompositeOperation = 'lighter';
    if (!emis) soft(c, x, y, 30 * big * (1 - p * 0.4), '255,170,80', 0.35 * (1 - p) * (1 - p));
    c.strokeStyle = 'rgba(255,230,180,' + (0.85 * (1 - p)).toFixed(3) + ')'; c.lineWidth = 2.5 * (1 - p) + 0.5;
    c.beginPath(); c.arc(x, y, 6 + 52 * big * easeOut(p), 0, TAU); c.stroke();
    for (var i = 0; i < 14; i++) {
      var a = hash(i + L.at * 0.001) * TAU, r0 = 4 + 44 * big * easeOut(p) * (0.6 + hash(i + 2) * 0.6), r1 = r0 + 10 * (1 - p);
      c.strokeStyle = i % 4 ? 'rgba(255,190,90,' + (1 - p).toFixed(3) + ')' : 'rgba(255,250,230,' + (1 - p).toFixed(3) + ')'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); c.stroke();
    }
    c.restore();
    if (emis) return;
    var dmg = L.nova ? '312' : String(60 + Math.round(hash(L.at) * 40));
    var ny = y - 44 - 26 * easeOut(Math.min(1, since / 420)), na = Math.min(1, (650 - since) / 180), sc = since < 80 ? 1 + 0.5 * (1 - since / 80) : 1;
    c.save(); c.translate(x + 34, ny); c.scale(sc, sc); c.globalAlpha = Math.max(0, na);
    c.font = '800 ' + (L.nova ? 24 : 18) + 'px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 4; c.strokeStyle = 'rgba(16,10,30,0.85)'; c.strokeText(dmg, 0, 0);
    var tg = c.createLinearGradient(0, -10, 0, 10); tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, L.nova ? '#ffb04a' : '#ffe2b8'); c.fillStyle = tg; c.fillText(dmg, 0, 0);
    c.restore();
  }
  function flies(c, t, emis) {
    for (var i = 0; i < 18; i++) {
      var fx = 30 + hash(i + 400) * 580 + Math.sin(t * 0.0007 + i * 3) * 26, fy = 150 + hash(i + 410) * 150 + Math.sin(t * 0.0011 + i) * 12;
      var fa = Math.max(0, Math.sin(t * 0.0024 + i * 2.1));
      if (emis) soft(c, fx, fy, 7, '200,255,140', 0.9 * fa);
      else { c.fillStyle = 'rgba(214,255,170,' + (0.9 * fa).toFixed(3) + ')'; c.fillRect(fx - 0.8, fy - 0.8, 1.6, 1.6); }
    }
  }

  // ---------------------------------------------------------------- HUD (white text on purpose: it must stay crisp)
  var HUD = { stat: { x: 12, y: 12, w: 196, h: 52 }, gold: { x: 216, y: 12, w: 136, h: 30 }, bar: { x: W / 2 - 116, y: H - 46, w: 232, h: 36 } };
  var SEL = 1;
  function slotRect(i) { return { x: HUD.bar.x + 6 + i * 56, y: HUD.bar.y + 5, w: 54, h: 26 }; }
  function uiRects() {
    var s = slotRect(SEL);
    function rr9(q) { return { x: q.x, y: q.y, w: q.w, h: q.h, r: 9 }; }   // r = the panel's corner radius, so the fade around it is rounded too
    return [rr9(HUD.stat), rr9(HUD.gold), rr9(HUD.bar), { x: s.x, y: s.y, w: s.w, h: s.h, r: 5, glow: true }];   // the hole stays crisp; its rim glow spills onto the bar
  }
  var UIF = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  function panel(c, r) {
    c.fillStyle = 'rgba(232,236,255,0.94)'; rr(c, r.x, r.y, r.w, r.h, 9); c.fill();
    c.fillStyle = 'rgba(14,16,34,0.92)'; rr(c, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 8); c.fill();
  }
  // 5x7 bitmap glyphs for the pixel canvas (system fonts smear at 8 px: 'Wren' read as 'Mrem')
  var GLYPH = { W: '10001100011000110101101011101110001', r: '00000000001011011001100001000010000', e: '00000000000111010001111111000001110',
    n: '00000000001011011001100011000110001', L: '10000100001000010000100001000011111', V: '10001100011000110001100010101000100',
    '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110', '2': '01110100010000100010001000100011111',
    '3': '11110000010000101110000010000111110', '4': '00010001100101010010111110001000010', ',': '00000000000000000000001100010001000', ' ': '' };
  function pixText(c, str, x, y, align) {
    var adv = 6, w = str.length * adv - 1; if (align === 'right') x -= w;
    for (var i = 0; i < str.length; i++) { var gph = GLYPH[str[i]] || ''; for (var b = 0; b < gph.length; b++) if (gph[b] === '1') c.fillRect(x + i * adv + b % 5, y + (b / 5 | 0), 1, 1); }
  }
  function say(c, str, x, y, font, align) {   // HD: the given font; pixel canvas: a 5x7 bitmap font at whole canvas pixels
    if (cv.width >= 640) { c.font = font; c.textAlign = align || 'left'; c.fillText(str, x, y); return; }
    var k = cv.width / W; c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    pixText(c, str, Math.round(x * k), Math.round(y * k), align); c.restore();
  }
  function hud(c, t) {
    c.save(); c.textBaseline = 'top';
    panel(c, HUD.stat);
    c.fillStyle = '#ffffff'; say(c, 'Wren', 24, 20, '700 13px ' + UIF);
    c.fillStyle = '#c8cde8'; say(c, cv.width >= 640 ? 'EMBER MAGE  LV 12' : 'LV 12', cv.width >= 640 ? 64 : 80, 22, '600 10px ' + UIF);
    c.fillStyle = 'rgba(255,255,255,0.1)'; rr(c, 24, 38, 172, 6, 3); c.fill(); rr(c, 24, 49, 172, 5, 2.5); c.fill();
    c.fillStyle = '#ff6a7a'; rr(c, 24, 38, 132, 6, 3); c.fill();
    c.fillStyle = '#6aa8ff'; rr(c, 24, 49, 96 + 30 * (1 - orbAt(t).grow), 5, 2.5); c.fill();
    panel(c, HUD.gold);
    c.fillStyle = '#ffd36a'; c.beginPath(); c.arc(HUD.gold.x + 18, HUD.gold.y + 15, 6, 0, TAU); c.fill();
    c.fillStyle = '#ffffff'; say(c, '1,240', HUD.gold.x + HUD.gold.w - 12, HUD.gold.y + 8, '700 13px ' + UIF, 'right');
    panel(c, HUD.bar);
    var icons = ['#ffb04a', '#ff7a2a', '#7fe8ff', '#b890ff'], names = ['Spark', 'Fireball', 'Frost', 'Ward'];
    for (var i = 0; i < 4; i++) {
      var s = slotRect(i);
      c.fillStyle = i === SEL ? '#2a2246' : '#1c1f3a'; rr(c, s.x, s.y, s.w, s.h, 5); c.fill();
      c.fillStyle = icons[i]; c.beginPath(); c.arc(s.x + (cv.width >= 640 ? 12 : 30), s.y + 13, 5, 0, TAU); c.fill();
      c.fillStyle = '#ffffff'; say(c, String(i + 1), s.x + 3, s.y + 2, '700 9px ' + UIF);
      c.fillStyle = i === SEL ? '#ffe2b8' : '#c8cde8'; if (cv.width >= 640) say(c, names[i], s.x + 20, s.y + 10, '600 8px ' + UIF);
      if (i === SEL) { c.strokeStyle = '#ffc070'; c.lineWidth = 1.5; rr(c, s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1, 5); c.stroke(); }
    }
    c.restore();
  }
  function hudEmissive(c, t) {   // the selected skill's rim: UI the game WANTS to glow (a glow:true hole in the HUD mask)
    var s = slotRect(SEL), a = 0.7 + 0.3 * Math.sin(t * 0.006);
    c.strokeStyle = 'rgba(255,180,90,' + a.toFixed(2) + ')'; c.lineWidth = 2; rr(c, s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1, 5); c.stroke();
  }

  // ---------------------------------------------------------------- frame
  function drawScene(t) {
    var c = g, s = cv.width / W;
    c.setTransform(s, 0, 0, s, 0, 0); c.imageSmoothingEnabled = true;
    backdrop(c, t); lamps(c, t);
    golem(c, t, false); mage(c, t);
    var B = fireballAt(t); if (B) fireballShape(c, B, false);
    explosion(c, t, false);
    brazier(c, t, 0); brazier(c, t, 1);
    flies(c, t, false);
    hud(c, t);
    if (!bloom || !EMIS) return;
    // ---- the emissive layer: only what should glow, at the same coordinates
    var e = bloom.emissive();   // already scaled to view units (640x360)
    var k, p, fl;
    for (k = 0; k < LAMPS.length; k++) { p = lampPt(LAMPS[k]); fl = lanternLight(t, k); bloom.glow(p.x, p.y, 22, '#ffb060', 0.8 * fl); bloom.glow(p.x, p.y, 6, '#ffe2b0', fl); }
    for (k = 0; k < BRAZ.length; k++) { p = brazPt(BRAZ[k]); fl = lanternLight(t, k + 2); bloom.glow(p.x, p.y - 2, 24, '#ff9040', 0.6 * fl); bloom.glow(p.x, p.y - 1, 5, '#ffd9a0', 0.7 * fl); }
    var O = orbAt(t), T = tipPt(); bloom.glow(T.x, T.y, 8 + 14 * O.grow * (O.nova ? 1.6 : 1), '#ffa040', 0.5 + 0.5 * O.grow);
    if (B) fireballShape(e, B, true);
    golem(e, t, true);
    explosion(e, t, true);
    flies(e, t, true);
    hudEmissive(e, t);
  }

  // ---------------------------------------------------------------- bloom
  var PRESETS = {
    soft:   { threshold: 0.78, knee: 0.5, intensity: 1.6, radius: 0.75, tint: '#fff1dc', blend: 'add', source: 'both', emissiveGain: 1.2 },
    neon:   { threshold: 0.7, knee: 0.4, intensity: 2.2, radius: 0.45, tint: '#ffc0f0', blend: 'add', source: 'both', emissiveGain: 1.8 },
    dreamy: { threshold: 0.55, knee: 0.8, intensity: 2.0, radius: 1.0, tint: '#bfe4ff', blend: 'add', source: 'both', emissiveGain: 1.6 },
    crisp:  { threshold: 0.95, knee: 0.2, intensity: 1.8, radius: 0.3, tint: '#ffffff', blend: 'add', source: 'emissive', emissiveGain: 1.5 },
    daylight: { threshold: 0.78, knee: 0.5, intensity: 1.0, radius: 0.6, tint: '#fff1dc', blend: 'screen', source: 'emissive', emissiveGain: 1.2 }   // the setup the prompt gives bright scenes
  };
  var preset = PRESETS[Q.get('preset')] ? Q.get('preset') : 'soft';
  var cfg = Object.assign({}, PRESETS[preset], { uiFeather: 6, flareDecay: 420 });
  ['threshold', 'knee', 'intensity', 'radius', 'emissiveGain', 'uiFeather', 'flareDecay'].forEach(function (k) { if (Q.has(k) && isFinite(Number(Q.get(k)))) cfg[k] = Number(Q.get(k)); });
  ['blend', 'source'].forEach(function (k) { if (Q.has(k)) cfg[k] = Q.get(k); });
  if (Q.has('tint')) cfg.tint = '#' + Q.get('tint').replace('#', '');
  var uiOn = Q.get('ui') !== '0', bloomOn = Q.get('bloom') !== '0';
  var post = null, bloom = null;
  function makeBloom(on) {
    if (bloom) bloom.destroy(); if (post) post.destroy(); bloom = post = null;
    if (on && /[?&]webgl=0/.test(location.search)) { var u = new URL(location.href); u.searchParams.delete('webgl'); history.replaceState(null, '', u); }
    post = GameDNA_Post.create({ canvas: cv, clock: function () { return gameMs; }, params: { passes: 'none', webgl: on ? 'auto' : 'off' } });
    bloom = GameDNA_Bloom.create({ post: post, view: { w: W, h: H }, clock: function () { return gameMs; }, params: Object.assign({}, cfg, { enabled: bloomOn }), uiRects: uiOn ? uiRects : null });
    window.__post = post; window.__bloom = bloom;
    applySplit();
  }

  // ---------------------------------------------------------------- clock
  // Everything that drives drawing advances here, in fixed steps, so a ?t=&freeze=1 frame equals live play.
  function crossed(a, b, off) { return Math.floor((b - off) / CYCLE) > Math.floor((a - off) / CYCLE); }
  function fireFlare(k) { bloom.flare(isNova(k) ? 1.2 : 0.5, { at: { x: HIT.x, y: HIT.y } }); }
  var simMs = -1e-6;
  function stepTo(now) {
    var prev = simMs; simMs = now;
    if (crossed(prev, now, CAST_AT)) mageA.play('cast');
    if (crossed(prev, now, IMPACT)) { var k = castIndexAt(now); gameMs = k * CYCLE + IMPACT; fireFlare(k); golemA.play('hurt', { dur: isNova(k) ? 460 : 340 }); }
    mageA.update(now - Math.max(0, prev), { facing: MAGE_F }); golemA.update(now - Math.max(0, prev), { facing: GOLEM_F });
    if (crossed(prev, now, LAUNCH)) SRC = tipPt();
    gameMs = now;
  }
  function frame() { drawScene(gameMs); bloom.render(); }

  // ---------------------------------------------------------------- UI
  var $ = function (id) { return document.getElementById(id); };
  function fill(r) { r.style.setProperty('--fill', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); }
  function fmt(k, v) { return k === 'flareDecay' || k === 'uiFeather' ? String(Math.round(v)) : Number(v).toFixed(2); }
  function mark(id, v) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.v === v)); }); }
  function syncUI() {
    document.querySelectorAll('input[data-k]').forEach(function (r) { var k = r.dataset.k; r.value = cfg[k]; fill(r); r.parentNode.querySelector('output').textContent = fmt(k, cfg[k]); });
    mark('source', cfg.source); mark('blend', cfg.blend); mark('tint', cfg.tint); mark('preset', preset);
  }
  function set(o) { Object.assign(cfg, o); bloom.setParams(o); if (FREEZE) frame(); }
  document.querySelectorAll('input[data-k]').forEach(function (r) {
    r.addEventListener('input', function () { var o = {}; o[r.dataset.k] = Number(r.value); preset = ''; mark('preset', ''); set(o); fill(r); r.parentNode.querySelector('output').textContent = fmt(r.dataset.k, r.value); });
  });
  function seg(id, fn) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.addEventListener('click', function () { fn(b.dataset.v); syncUI(); }); }); }
  seg('source', function (v) { preset = ''; set({ source: v }); });
  seg('blend', function (v) { preset = ''; set({ blend: v }); });
  seg('tint', function (v) { preset = ''; set({ tint: v }); });
  seg('preset', function (v) { preset = v; set(Object.assign({}, PRESETS[v])); });
  seg('res', function (v) { setRes(v); if (FREEZE) frame(); });
  function setRes(v) {
    var px = v === 'px'; cv.width = px ? 320 : 1280; cv.height = px ? 180 : 720; cv.classList.toggle('px', px); mark('res', v);
  }
  $('on').addEventListener('change', function () { bloomOn = $('on').checked; bloom.setEnabled(bloomOn); if (FREEZE) frame(); });
  $('ui').addEventListener('change', function () { uiOn = $('ui').checked; bloom.setUiRects(uiOn ? uiRects : null); if (FREEZE) frame(); });
  $('webgl').addEventListener('change', function () { makeBloom($('webgl').checked); frame(); status(); });
  $('flare').addEventListener('click', function () { manualFlares.push(gameMs); bloom.flare(1.2, { at: { x: HIT.x, y: HIT.y } }); if (FREEZE) frame(); });
  var splitX = Q.has('split') ? Math.max(0, Math.min(1, Number(Q.get('split')) || 0)) : 0;
  function applySplit() {
    var r = $('splitR'); r.value = splitX; fill(r); $('o-split').textContent = splitX > 0 ? Math.round(splitX * 100) + '%' : 'off';
    if (post && post.canvas) post.canvas.style.clipPath = splitX > 0 ? 'inset(0 0 0 ' + (splitX * 100) + '%)' : '';
    var line = $('split'); line.style.display = splitX > 0 && post && post.active ? 'block' : 'none'; line.style.left = (splitX * 100) + '%';
  }
  $('splitR').addEventListener('input', function () { splitX = Number($('splitR').value); applySplit(); });
  function status() {
    var s = bloom.stats(), m = $('mode');
    m.className = s.active ? '' : 'off';
    m.innerHTML = s.active ? '<b>' + (s.mode === 'webgl2' ? 'WebGL2' : 'WebGL') + '</b> &middot; bloom ' + (s.enabled ? s.passes.length + ' passes' : 'off') : '<b>2D only</b> &middot; WebGL ' + (s.reason === 'option' ? 'switched off' : s.reason === 'url' ? 'off (?webgl=0)' : 'unavailable');
    $('cost').innerHTML = s.active ? 'cpu <b>' + (s.avgMs || 0).toFixed(2) + ' ms</b>/frame' : 'post <b>none</b>';
    $('size').innerHTML = s.active ? 'canvas <b>' + cv.width + '&times;' + cv.height + '</b> &rarr; <b>' + s.w + '&times;' + s.h + '</b> px' : 'canvas <b>' + cv.width + '&times;' + cv.height + '</b>';
    document.querySelectorAll('aside section[data-gl]').forEach(function (x) { x.classList.toggle('dim', !s.active); });
    $('splitRow').classList.toggle('dim', !s.active); $('offnote').hidden = !!s.active;
    $('stat').innerHTML = s.active ? 'passes: <b>' + s.postPasses.join(' &rarr; ') + '</b><br>frames ' + s.frames + ' &middot; emissive ' + (s.emissiveOn ? 'on' : 'off') + ' &middot; HUD rects ' + s.uiRects + ' &middot; flare ' + s.flare.toFixed(2) : 'passes: <b>-</b> (the plain 2D canvas)';
  }

  // ---------------------------------------------------------------- boot
  if (Q.get('res') === 'px') setRes('px');
  $('on').checked = bloomOn; $('ui').checked = uiOn;
  makeBloom(!/[?&]webgl=0/.test(location.search));
  $('webgl').checked = post.active;
  syncUI();
  window.__demo = function () { return { gameMs: gameMs, casts: castIndexAt(gameMs) + 1, stats: bloom.stats() }; };
  /* text state for critics and tools/sprites/statecheck.py: who stands where, which way each is drawn, who it fights */
  window.__state = function () { var dir = function (f) { return f > 0 ? 'right' : 'left'; }; return { t: Math.round(gameMs), actors: [
    { id: 'mage', x: MAGE.x, y: MAGE.y, facing: dir(MAGE_F), target: 'golem', asset: 'mage' },
    { id: 'golem', x: GOLEM.x, y: GOLEM.y, facing: dir(GOLEM_F), target: 'mage', asset: 'golem' }] }; };

  KIT.ready(function () {
    if (HAS_T) {
      for (var tt = 0; tt < T0;) { tt = Math.min(T0, tt + STEP); stepTo(tt); }
      gameMs = T0; frame(); setTimeout(status, 0);
      if (FREEZE) { window.__frozen = true; document.documentElement.dataset.frozen = '1'; return; }
    } else frame();
    var last = null, acc = 0;
    function loop(now) {
      if (last === null) last = now;
      acc += Math.min(100, now - last); last = now;
      var prev = gameMs;
      while (acc >= STEP) { stepTo(simMs < 0 ? STEP : simMs + STEP); acc -= STEP; }
      if (gameMs !== prev) frame();
      requestAnimationFrame(loop);
    }
    setInterval(status, 500);
    requestAnimationFrame(loop);
  });
})();
