/* I-08 demo: an original dusk glade drawn on a plain 2D canvas, post-processed by GameDNA_Post. */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search);
  var HAS_T = Q.has('t'), FREEZE = Q.get('freeze') === '1', T0 = HAS_T ? Math.max(0, Number(Q.get('t')) || 0) : 0;
  var W = 640, H = 360, CYCLE = 2600, IMPACT = 1260, GROUND = 300;
  var cv = document.getElementById('game'), g = cv.getContext('2d');
  var depth = document.createElement('canvas'); depth.width = 160; depth.height = 90; var dg = depth.getContext('2d');
  var gameMs = 0, manualHits = [];

  // ---------------------------------------------------------------- helpers
  var TAU = Math.PI * 2;
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function ease(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
  function easeOut(x) { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); }
  function ridge(x, seed, f) { return Math.sin(x * f + seed) * 0.5 + Math.sin(x * f * 2.3 + seed * 1.7) * 0.27 + Math.sin(x * f * 5.1 + seed * 2.9) * 0.11; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function glow(c, x, y, r, col, a) {
    var gr = c.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(0.35, col.replace('A', a * 0.45)); gr.addColorStop(1, col.replace('A', 0));
    c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function strikeIndexAt(t) { return Math.floor((t - IMPACT) / CYCLE); }
  function isFinisher(k) { return k % 3 === 2; }

  // ---------------------------------------------------------------- scene
  var SUN = { x: 470, y: 214 };
  function sky(c, t) {
    var gr = c.createLinearGradient(0, 0, 0, 300);
    gr.addColorStop(0, '#0f0b26'); gr.addColorStop(0.32, '#2a1c4e'); gr.addColorStop(0.6, '#6a3868'); gr.addColorStop(0.8, '#d27e5c'); gr.addColorStop(0.93, '#f4bf78');
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    for (var i = 0; i < 70; i++) {
      var x = hash(i) * W, y = hash(i + 99) * 150, tw = 0.5 + 0.5 * Math.sin(t * 0.002 + i * 1.7);
      c.fillStyle = 'rgba(255,240,255,' + (0.15 + 0.55 * tw * (1 - y / 170)).toFixed(3) + ')';
      var s = hash(i + 7) > 0.85 ? 1.6 : 1; c.fillRect(x, y, s, s);
    }
    c.globalCompositeOperation = 'lighter';
    glow(c, SUN.x, SUN.y, 300, 'rgba(255,170,110,A)', 0.42);
    glow(c, SUN.x, SUN.y, 70, 'rgba(255,230,180,A)', 0.9);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#fff1d6'; c.beginPath(); c.arc(SUN.x, SUN.y, 22, 0, TAU); c.fill();
    // soft drifting clouds
    for (var k = 0; k < 6; k++) {
      var cx = ((hash(k + 40) * 900 + t * (0.004 + 0.003 * hash(k))) % 900) - 130, cy = 70 + hash(k + 50) * 90, cw = 110 + hash(k + 60) * 120;
      c.save(); c.translate(cx, cy); c.scale(1, 0.22);
      var cg = c.createRadialGradient(0, 0, 0, 0, 0, cw);
      var warm = cy > 120;
      cg.addColorStop(0, warm ? 'rgba(255,170,140,0.32)' : 'rgba(170,130,200,0.28)'); cg.addColorStop(1, 'rgba(120,80,160,0)');
      c.fillStyle = cg; c.beginPath(); c.arc(0, 0, cw, 0, TAU); c.fill(); c.restore();
    }
  }
  function range(c, cam, base, amp, f, seed, col, rim) {
    c.beginPath(); c.moveTo(0, H);
    for (var x = 0; x <= W + 8; x += 8) c.lineTo(x, base - amp * (0.6 + ridge(x + cam, seed, f)));
    c.lineTo(W, H); c.closePath(); c.fillStyle = col; c.fill();
    if (rim) {
      c.save(); c.globalCompositeOperation = 'lighter'; c.lineWidth = 1.4;
      var rg = c.createLinearGradient(SUN.x - 260, 0, SUN.x + 200, 0);
      rg.addColorStop(0, 'rgba(255,170,120,0)'); rg.addColorStop(0.55, rim); rg.addColorStop(1, 'rgba(255,170,120,0)');
      c.strokeStyle = rg; c.beginPath();
      for (x = 0; x <= W + 8; x += 8) { var y = base - amp * (0.6 + ridge(x + cam, seed, f)); if (x) c.lineTo(x, y); else c.moveTo(x, y); }
      c.stroke(); c.restore();
    }
  }
  function haze(c, y0, y1, col) { var gr = c.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, col.replace('A', 0)); gr.addColorStop(1, col.replace('A', 0.55)); c.fillStyle = gr; c.fillRect(0, y0, W, y1 - y0); }
  function pines(c, cam, base, col, n, seed) {
    c.fillStyle = col;
    for (var i = 0; i < n; i++) {
      var x = ((i * 23 + hash(i + seed) * 14 - cam) % (W + 40) + W + 40) % (W + 40) - 20, h = 38 + hash(i + seed + 5) * 34, w = 12 + hash(i + seed + 9) * 8;
      var y = base - 4 * ridge(x, seed, 0.02);
      c.beginPath(); c.moveTo(x, y - h);
      for (var s = 1; s <= 4; s++) { var yy = y - h + h * s / 4, ww = w * (0.35 + s * 0.17); c.lineTo(x + ww, yy); c.lineTo(x + ww * 0.45, yy); }
      c.lineTo(x + 2, y + 4); c.lineTo(x - 2, y + 4);
      for (s = 4; s >= 1; s--) { yy = y - h + h * s / 4; ww = w * (0.35 + s * 0.17); c.lineTo(x - ww * 0.45, yy); c.lineTo(x - ww, yy); }
      c.closePath(); c.fill();
    }
    c.fillRect(0, base, W, 30);
  }
  function shafts(c, t) {
    c.save(); c.globalCompositeOperation = 'screen';
    for (var i = 0; i < 5; i++) {
      var a = 2.55 + i * 0.13 + Math.sin(t * 0.0004 + i) * 0.015, len = 520, wd = 0.025 + hash(i + 3) * 0.03;
      var gr = c.createLinearGradient(SUN.x, SUN.y, SUN.x + Math.cos(a) * len, SUN.y + Math.sin(a) * len);
      gr.addColorStop(0, 'rgba(255,200,150,0.16)'); gr.addColorStop(1, 'rgba(255,200,150,0)');
      c.fillStyle = gr; c.beginPath(); c.moveTo(SUN.x, SUN.y);
      c.lineTo(SUN.x + Math.cos(a - wd) * len, SUN.y + Math.sin(a - wd) * len); c.lineTo(SUN.x + Math.cos(a + wd) * len, SUN.y + Math.sin(a + wd) * len); c.closePath(); c.fill();
    }
    c.restore();
  }
  function ground(c, t) {
    c.beginPath(); c.moveTo(0, H);
    for (var x = 0; x <= W; x += 10) c.lineTo(x, GROUND - 6 + 5 * Math.sin(x * 0.012 + 1.3) + 3 * Math.sin(x * 0.031));
    c.lineTo(W, H); c.closePath();
    var gr = c.createLinearGradient(0, GROUND - 10, 0, H); gr.addColorStop(0, '#3a3a52'); gr.addColorStop(0.25, '#26243a'); gr.addColorStop(1, '#100e1c');
    c.fillStyle = gr; c.fill();
    c.save(); c.clip();
    c.globalCompositeOperation = 'lighter'; glow(c, SUN.x - 10, GROUND, 260, 'rgba(255,150,90,A)', 0.22); c.globalCompositeOperation = 'source-over';
    // path stones
    for (var i = 0; i < 14; i++) {
      var sx = 60 + i * 44 + hash(i + 70) * 16, sy = GROUND + 18 + hash(i + 80) * 30;
      c.fillStyle = 'rgba(120,110,150,0.18)'; c.beginPath(); c.ellipse(sx, sy, 12 + hash(i) * 8, 3.5, 0, 0, TAU); c.fill();
    }
    c.restore();
    // grass tufts on the rim, lit from the sun side
    for (i = 0; i < 120; i++) {
      var gx = hash(i + 200) * W, gy = GROUND - 5 + 5 * Math.sin(gx * 0.012 + 1.3) + 3 * Math.sin(gx * 0.031) + 2;
      var h = 5 + hash(i + 300) * 9, sway = Math.sin(t * 0.0018 + gx * 0.05) * 2.2, lit = Math.max(0, 1 - Math.abs(gx - SUN.x) / 320);
      c.strokeStyle = 'rgba(' + Math.round(50 + 150 * lit) + ',' + Math.round(70 + 90 * lit) + ',' + Math.round(70 + 40 * lit) + ',0.9)';
      c.lineWidth = 1.3; c.beginPath(); c.moveTo(gx, gy); c.quadraticCurveTo(gx + sway * 0.4, gy - h * 0.6, gx + sway, gy - h); c.stroke();
    }
  }
  function pillars(c) {
    function pillar(x, h, broken) {
      var top = GROUND - h;
      var gr = c.createLinearGradient(x, 0, x + 28, 0); gr.addColorStop(0, '#2c2840'); gr.addColorStop(0.6, '#4d4766'); gr.addColorStop(1, '#8f7a86');
      c.fillStyle = gr;
      c.beginPath(); c.moveTo(x, GROUND);
      if (broken) { c.lineTo(x, top + 8); c.lineTo(x + 9, top); c.lineTo(x + 15, top + 10); c.lineTo(x + 22, top + 3); c.lineTo(x + 28, top + 12); }
      else { c.lineTo(x, top); c.lineTo(x + 28, top); }
      c.lineTo(x + 28, GROUND); c.closePath(); c.fill();
      if (!broken) { c.fillStyle = '#5a5272'; rr(c, x - 5, top - 9, 38, 10, 2); c.fill(); c.fillStyle = 'rgba(255,190,140,0.35)'; c.fillRect(x - 5, top - 9, 38, 1.5); }
      c.fillStyle = '#5a5272'; rr(c, x - 4, GROUND - 8, 36, 8, 2); c.fill();
      c.strokeStyle = 'rgba(10,8,20,0.35)'; c.lineWidth = 1;
      for (var k = 1; k < h / 22; k++) { c.beginPath(); c.moveTo(x, GROUND - k * 22); c.lineTo(x + 28, GROUND - k * 22 + 1); c.stroke(); }
      c.fillStyle = 'rgba(90,140,90,0.55)';
      for (k = 0; k < 6; k++) { c.beginPath(); c.ellipse(x + hash(x + k) * 26, GROUND - 10 - hash(x + k + 9) * (h - 20), 4 + hash(k) * 4, 2.2, 0, 0, TAU); c.fill(); }
      c.fillStyle = 'rgba(255,190,140,0.28)'; c.fillRect(x + 25, top + (broken ? 12 : 0), 3, h - (broken ? 12 : 0));
    }
    pillar(84, 132, false); pillar(150, 86, true);
    c.fillStyle = '#3e3854'; c.save(); c.translate(196, GROUND - 6); c.rotate(-0.12); rr(c, -16, -10, 34, 14, 3); c.fill(); c.restore();
  }
  function shrine(c, t) {
    var x = 566, base = GROUND;
    c.fillStyle = '#3b3550'; rr(c, x - 22, base - 34, 44, 34, 3); c.fill();
    c.fillStyle = '#4e4768'; rr(c, x - 28, base - 40, 56, 9, 3); c.fill();
    c.fillStyle = 'rgba(127,232,255,0.25)'; c.fillRect(x - 22, base - 31, 44, 2);
    var bob = Math.sin(t * 0.0022) * 4, cy = base - 70 + bob, pul = 0.75 + 0.25 * Math.sin(t * 0.004);
    c.save(); c.globalCompositeOperation = 'lighter';
    glow(c, x, cy, 120, 'rgba(90,200,255,A)', 0.32 * pul);
    glow(c, x, base - 2, 90, 'rgba(90,200,255,A)', 0.18 * pul);
    c.restore();
    var cg = c.createLinearGradient(x - 12, cy - 22, x + 12, cy + 22); cg.addColorStop(0, '#e8fbff'); cg.addColorStop(0.45, '#7fe0ff'); cg.addColorStop(1, '#2a7fb8');
    c.fillStyle = cg; c.beginPath(); c.moveTo(x, cy - 24); c.lineTo(x + 12, cy - 4); c.lineTo(x + 5, cy + 22); c.lineTo(x - 5, cy + 22); c.lineTo(x - 12, cy - 4); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.moveTo(x, cy - 24); c.lineTo(x - 12, cy - 4); c.lineTo(x - 3, cy - 2); c.closePath(); c.fill();
    for (var i = 0; i < 3; i++) {
      var a = t * 0.0016 + i * TAU / 3, ox = Math.cos(a) * 24, oy = Math.sin(a) * 7;
      c.fillStyle = 'rgba(190,245,255,' + (0.5 + 0.4 * Math.sin(a)).toFixed(2) + ')'; c.beginPath(); c.arc(x + ox, cy + oy, 2.2, 0, TAU); c.fill();
    }
  }
  function brazier(c, t) {
    var x = 210, y = GROUND - 4;
    c.strokeStyle = '#2a2232'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(x - 10, y); c.lineTo(x, y - 26); c.lineTo(x + 10, y); c.moveTo(x, y); c.lineTo(x, y - 26); c.stroke();
    var fl = 0.85 + 0.15 * Math.sin(t * 0.017) * Math.sin(t * 0.0071 + 1);
    c.save(); c.globalCompositeOperation = 'lighter';
    glow(c, x, y - 40, 150 * fl, 'rgba(255,140,60,A)', 0.4);
    glow(c, x, y, 110, 'rgba(255,120,50,A)', 0.2);
    c.restore();
    var bg = c.createLinearGradient(0, y - 34, 0, y - 22); bg.addColorStop(0, '#6a4a3a'); bg.addColorStop(1, '#2a1c20');
    c.fillStyle = bg; c.beginPath(); c.moveTo(x - 15, y - 34); c.lineTo(x + 15, y - 34); c.lineTo(x + 9, y - 24); c.lineTo(x - 9, y - 24); c.closePath(); c.fill();
    var layers = [['#ff6a2a', 1.0, 16], ['#ffb347', 0.72, 12], ['#fff1b0', 0.42, 7]];
    for (var i = 0; i < 3; i++) {
      var col = layers[i][0], k = layers[i][1], w = layers[i][2], h = 30 * k * fl + 4 * Math.sin(t * 0.02 + i);
      var sw = Math.sin(t * 0.009 + i * 2) * 3 * k;
      c.fillStyle = col; c.beginPath(); c.moveTo(x - w * 0.6, y - 34);
      c.bezierCurveTo(x - w * 0.7, y - 34 - h * 0.5, x + sw - 2, y - 34 - h * 0.7, x + sw, y - 34 - h);
      c.bezierCurveTo(x + sw + 2, y - 34 - h * 0.6, x + w * 0.7, y - 34 - h * 0.5, x + w * 0.6, y - 34); c.closePath(); c.fill();
    }
  }
  function embers(c, t) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 28; i++) {
      var life = 1800 + hash(i) * 1400, p = ((t + hash(i + 5) * life) % life) / life;
      var x = 210 + (hash(i + 11) - 0.5) * 16 + Math.sin(p * 7 + i) * 10 * p + p * 30, y = GROUND - 40 - p * 150;
      var a = (1 - p) * Math.min(1, p * 8);
      c.fillStyle = 'rgba(255,' + Math.round(150 + 80 * (1 - p)) + ',80,' + (a * 0.9).toFixed(3) + ')';
      c.beginPath(); c.arc(x, y, 1.4 + (1 - p) * 0.8, 0, TAU); c.fill();
    }
    for (i = 0; i < 16; i++) {
      var fx = 40 + hash(i + 400) * 560 + Math.sin(t * 0.0007 + i * 3) * 30, fy = 230 + hash(i + 410) * 90 + Math.sin(t * 0.0011 + i) * 14;
      var fa = 0.5 + 0.5 * Math.sin(t * 0.003 + i * 2.1);
      glow(c, fx, fy, 9, 'rgba(210,255,140,A)', 0.55 * fa);
      c.fillStyle = 'rgba(240,255,200,' + (0.9 * fa).toFixed(3) + ')'; c.fillRect(fx - 0.8, fy - 0.8, 1.6, 1.6);
    }
    c.restore();
  }

  // ---------------------------------------------------------------- actors
  function knightPose(t) {
    var cph = ((t % CYCLE) + CYCLE) % CYCLE, x = 262, lean = 0, sword = 0.5, swoosh = 0;
    for (var m = 0; m < manualHits.length; m++) { var d = t - manualHits[m]; if (d >= -260 && d < 700) cph = IMPACT + d; }
    if (cph > 900 && cph <= 1150) { var a = ease((cph - 900) / 250); x -= 10 * a; lean = -0.12 * a; sword = 0.5 - 2.3 * a; }
    else if (cph > 1150 && cph <= IMPACT) { var b = easeOut((cph - 1150) / 110); x = 252 + 74 * b; lean = -0.12 + 0.3 * b; sword = -1.8 + 2.9 * b; swoosh = b; }
    else if (cph > IMPACT && cph <= 1700) { var r = ease((cph - IMPACT - 160) / 280); x = 326 - 64 * r; lean = 0.18 * (1 - r); sword = 1.1 - 0.6 * r; swoosh = Math.max(0, 1 - (cph - IMPACT) / 120); }
    return { x: x, lean: lean, sword: sword, swoosh: swoosh, breathe: Math.sin(t * 0.004) * 1.2 };
  }
  function knight(c, t) {
    var P = knightPose(t), x = P.x, y = GROUND;
    c.fillStyle = 'rgba(5,4,12,0.45)'; c.beginPath(); c.ellipse(x, y + 1, 22, 5, 0, 0, TAU); c.fill();
    c.save(); c.translate(x, y); c.rotate(P.lean);
    var by = -P.breathe;
    // cape
    var sway = Math.sin(t * 0.003) * 4 - P.lean * 30;
    var cg = c.createLinearGradient(-20, -52, 0, 0); cg.addColorStop(0, '#9a2a3a'); cg.addColorStop(1, '#3e0c1c');
    c.fillStyle = cg; c.beginPath(); c.moveTo(-8, -50 + by); c.quadraticCurveTo(-26 + sway, -26, -24 + sway * 1.4, -4); c.lineTo(-6 + sway * 0.6, -8); c.lineTo(4, -46 + by); c.closePath(); c.fill();
    // legs
    c.fillStyle = '#2f3348'; rr(c, -9, -22, 7, 20, 3); c.fill(); rr(c, 2, -22, 7, 20, 3); c.fill();
    c.fillStyle = '#1e1c2a'; rr(c, -11, -5, 10, 6, 2); c.fill(); rr(c, 1, -5, 11, 6, 2); c.fill();
    // torso
    var tg = c.createLinearGradient(-12, 0, 12, 0); tg.addColorStop(0, '#454b6a'); tg.addColorStop(0.55, '#8f97b8'); tg.addColorStop(1, '#d9c3b0');
    c.fillStyle = tg; rr(c, -12, -48 + by, 24, 28, 7); c.fill();
    c.fillStyle = '#5a3a24'; c.fillRect(-12, -25 + by, 24, 4); c.fillStyle = '#f0c060'; c.fillRect(-2, -25 + by, 4, 4);
    c.strokeStyle = 'rgba(255,200,150,0.75)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(11, -44 + by); c.lineTo(11, -26 + by); c.stroke();
    // head
    var hg = c.createLinearGradient(-9, 0, 9, 0); hg.addColorStop(0, '#4c5272'); hg.addColorStop(0.6, '#a4acc8'); hg.addColorStop(1, '#ffe0c0');
    c.fillStyle = hg; c.beginPath(); c.arc(0, -58 + by, 10, 0, TAU); c.fill();
    c.fillStyle = '#14121f'; rr(c, 1, -60 + by, 9, 3, 1.5); c.fill();
    c.strokeStyle = '#c23a4a'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(-2, -67 + by); c.quadraticCurveTo(-12, -78 + by, -20 + sway * 0.3, -66 + by); c.stroke();
    // sword arm
    c.save(); c.translate(6, -42 + by); c.rotate(P.sword);
    c.fillStyle = '#7a82a2'; rr(c, -3, -3, 16, 7, 3); c.fill();
    c.translate(14, 0);
    c.fillStyle = '#e0b050'; c.fillRect(-2, -6, 4, 12); c.fillStyle = '#5a3a24'; c.fillRect(-7, -2, 6, 4);
    var sg = c.createLinearGradient(0, -3, 0, 3); sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.5, '#c8d4ec'); sg.addColorStop(1, '#6a7898');
    c.fillStyle = sg; c.beginPath(); c.moveTo(2, -2.5); c.lineTo(38, -1.5); c.lineTo(43, 0); c.lineTo(38, 1.5); c.lineTo(2, 2.5); c.closePath(); c.fill();
    c.restore();
    c.restore();
    if (P.swoosh > 0.02) {
      c.save(); c.globalCompositeOperation = 'lighter';
      var sx = x + 6, sy = y - 42;
      var ag = c.createRadialGradient(sx, sy, 30, sx, sy, 62); ag.addColorStop(0, 'rgba(255,240,210,0)'); ag.addColorStop(0.75, 'rgba(255,230,190,' + (0.55 * P.swoosh).toFixed(3) + ')'); ag.addColorStop(1, 'rgba(255,200,150,0)');
      c.strokeStyle = ag; c.lineWidth = 14; c.lineCap = 'round'; c.beginPath(); c.arc(sx, sy, 50, -1.5, Math.min(1.0, -1.5 + 2.6 * Math.min(1, P.swoosh * 1.4))); c.stroke();
      c.restore();
    }
  }
  function lastImpact(t) {
    var best = -1e9;
    var k = strikeIndexAt(t); if (k >= 0) best = k * CYCLE + IMPACT;
    for (var m = 0; m < manualHits.length; m++) if (manualHits[m] <= t && manualHits[m] > best) best = manualHits[m];
    return best;
  }
  function slime(c, t) {
    var since = t - lastImpact(t), hit = since >= 0 && since < 600;
    var kb = hit ? 22 * Math.exp(-since / 140) * Math.sin(Math.min(1, since / 60) * Math.PI / 2) : 0;
    var x = 432 + kb, y = GROUND;
    var sq = hit ? Math.exp(-since / 120) * Math.cos(since / 40) * 0.28 : 0;
    var wob = Math.sin(t * 0.005) * 0.05;
    var sx = 1 + sq + wob, sy = 1 - sq - wob;
    c.fillStyle = 'rgba(5,4,12,0.45)'; c.beginPath(); c.ellipse(x, y + 1, 30 * sx, 5, 0, 0, TAU); c.fill();
    c.save(); c.translate(x, y); c.scale(sx, sy);
    c.beginPath(); c.moveTo(-32, 0); c.bezierCurveTo(-36, -30, -14, -48, 2, -48); c.bezierCurveTo(22, -48, 36, -28, 32, 0); c.closePath();
    var bg = c.createRadialGradient(-6, -30, 4, 0, -18, 44); bg.addColorStop(0, '#9ff8dc'); bg.addColorStop(0.5, '#3cc8a8'); bg.addColorStop(1, '#14605a');
    c.fillStyle = bg; c.fill();
    c.save(); c.clip();
    c.fillStyle = 'rgba(10,60,60,0.45)'; c.beginPath(); c.ellipse(4, -6, 26, 10, 0, 0, TAU); c.fill();
    c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,170,120,0.35)'; c.beginPath(); c.ellipse(30, -22, 8, 26, 0, 0, TAU); c.fill();
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(-12, -34, 8, 4, -0.5, 0, TAU); c.fill();
    var blink = (Math.floor(t / 2900) % 2 === 0 && (t % 2900) < 120) || hit && since < 250;
    c.fillStyle = '#0d1a22';
    if (blink) { c.fillRect(-14, -24, 9, 2.5); c.fillRect(4, -24, 9, 2.5); }
    else { c.beginPath(); c.ellipse(-10, -23, 4, 5.5, 0, 0, TAU); c.ellipse(9, -23, 4, 5.5, 0, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.fillRect(-9, -26, 2, 2); c.fillRect(10, -26, 2, 2); }
    if (hit && since < 90) { c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,255,255,' + (0.8 * (1 - since / 90)).toFixed(3) + ')'; c.beginPath(); c.moveTo(-32, 0); c.bezierCurveTo(-36, -30, -14, -48, 2, -48); c.bezierCurveTo(22, -48, 36, -28, 32, 0); c.closePath(); c.fill(); }
    c.restore();
  }
  function impactFx(c, t) {
    var at = lastImpact(t), since = t - at; if (since < 0 || since > 520) return;
    var k = strikeIndexAt(at + 1), fin = at % CYCLE === IMPACT && isFinisher(k);
    var x = 402, y = GROUND - 30, p = since / 520;
    c.save(); c.globalCompositeOperation = 'lighter';
    glow(c, x, y, 70 * (1 - p * 0.5) * (fin ? 1.4 : 1), 'rgba(255,220,170,A)', 0.8 * (1 - p));
    c.strokeStyle = 'rgba(255,240,220,' + (0.9 * (1 - p)).toFixed(3) + ')'; c.lineWidth = 3 * (1 - p) + 0.5;
    c.beginPath(); c.arc(x, y, 8 + 70 * easeOut(p), 0, TAU); c.stroke();
    for (var i = 0; i < 12; i++) {
      var a = hash(i + at * 0.001) * TAU, r0 = 6 + 60 * easeOut(p) * (0.6 + hash(i + 2) * 0.6), r1 = r0 + 14 * (1 - p);
      c.strokeStyle = i % 3 ? 'rgba(255,200,120,' + (1 - p).toFixed(3) + ')' : 'rgba(170,240,255,' + (1 - p).toFixed(3) + ')'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); c.stroke();
    }
    c.restore();
    var dmg = fin ? '148' : String(40 + Math.round(hash(k + 3) * 30));
    var ny = y - 30 - 34 * easeOut(Math.min(1, since / 400)), na = Math.min(1, (520 - since) / 160);
    var sc = since < 80 ? 1 + 0.6 * (1 - since / 80) : 1;
    c.save(); c.translate(x + 26, ny); c.scale(sc, sc); c.globalAlpha = Math.max(0, na);
    c.font = '800 ' + (fin ? 26 : 20) + 'px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 4; c.strokeStyle = 'rgba(20,10,30,0.85)'; c.strokeText(dmg, 0, 0);
    var tg = c.createLinearGradient(0, -12, 0, 12); tg.addColorStop(0, '#fff'); tg.addColorStop(1, fin ? '#ffb347' : '#ffe2b8'); c.fillStyle = tg; c.fillText(dmg, 0, 0);
    c.restore();
  }
  function foreground(c, t) {
    c.fillStyle = '#07060e';
    c.beginPath(); c.moveTo(0, H);
    for (var x = 0; x <= W; x += 6) { var h = 10 + 9 * hash(x * 0.37) + 6 * Math.sin(x * 0.05); c.lineTo(x, H - h + Math.sin(t * 0.002 + x * 0.04) * 1.5); }
    c.lineTo(W, H); c.closePath(); c.fill();
    // corner foliage
    c.save(); c.translate(-10, H + 6);
    for (var i = 0; i < 7; i++) {
      c.save(); c.rotate(-1.35 + i * 0.2 + Math.sin(t * 0.0012 + i) * 0.03);
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(40, -16, 92 + i * 6, 0); c.quadraticCurveTo(40, 12, 0, 0); c.fill(); c.restore();
    }
    c.restore();
    c.save(); c.translate(W + 4, -6);
    c.strokeStyle = '#07060e'; c.lineWidth = 5; c.beginPath(); c.moveTo(0, 20); c.quadraticCurveTo(-60, 30, -130, 18); c.stroke();
    for (i = 0; i < 9; i++) {
      var lx = -20 - i * 13, ly = 22 + Math.sin(i) * 3, sw = Math.sin(t * 0.0015 + i * 0.7) * 0.12;
      c.save(); c.translate(lx, ly); c.rotate(1.2 + sw + (i % 2) * 0.5);
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(10, -5, 22, 0); c.quadraticCurveTo(10, 5, 0, 0); c.fill(); c.restore();
    }
    c.restore();
  }
  function hud(c) {
    c.save();
    c.fillStyle = 'rgba(12,9,24,0.55)'; rr(c, 14, 14, 176, 46, 10); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1; rr(c, 14.5, 14.5, 175, 45, 10); c.stroke();
    c.fillStyle = '#f4ecff'; c.font = '700 13px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'; c.textBaseline = 'top'; c.fillText('Knight', 26, 22);
    c.fillStyle = '#b8b0d0'; c.font = '600 11px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'; c.fillText('LV 7', 150, 23);
    c.fillStyle = 'rgba(255,255,255,0.1)'; rr(c, 26, 41, 152, 7, 3.5); c.fill();
    var hg = c.createLinearGradient(26, 0, 178, 0); hg.addColorStop(0, '#ff5a6e'); hg.addColorStop(1, '#ffb36b'); c.fillStyle = hg; rr(c, 26, 41, 118, 7, 3.5); c.fill();
    c.fillStyle = 'rgba(12,9,24,0.45)'; rr(c, W - 148, 14, 134, 32, 9); c.fill();   // a backing chip, so the title can be masked as a plate
    c.textAlign = 'right'; c.fillStyle = 'rgba(255,240,220,0.85)'; c.font = '700 11px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    c.fillText('EMBERWOOD GLADE', W - 22, 22);
    c.fillStyle = 'rgba(255,240,220,0.35)'; c.fillRect(W - 122, 38, 100, 1);
    c.restore();
  }
  function drawDepth(t) {
    var c = dg; c.setTransform(depth.width / W, 0, 0, depth.height / H, 0, 0);
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    var cam = Math.sin(t * 0.00012) * 14;
    range(c, cam * 0.15, 238, 52, 0.009, 1.0, '#d8d8d8');
    range(c, cam * 0.3, 262, 34, 0.014, 4.0, '#a8a8a8');
    pines(c, cam * 0.55, 286, '#787878', 34, 20);
    c.beginPath(); c.moveTo(0, H); for (var x = 0; x <= W; x += 10) c.lineTo(x, GROUND - 6 + 5 * Math.sin(x * 0.012 + 1.3)); c.lineTo(W, H); c.closePath();
    var gr = c.createLinearGradient(0, GROUND, 0, H); gr.addColorStop(0, '#585858'); gr.addColorStop(1, '#101010'); c.fillStyle = gr; c.fill();
  }
  function drawScene(t) {
    var c = g, s = cv.width / W;
    c.setTransform(s, 0, 0, s, 0, 0); c.imageSmoothingEnabled = true;
    var cam = Math.sin(t * 0.00012) * 14;
    sky(c, t);
    range(c, cam * 0.15, 238, 52, 0.009, 1.0, '#5a3a72', 'rgba(255,190,150,0.55)'); haze(c, 170, 250, 'rgba(210,120,130,A)');
    range(c, cam * 0.3, 262, 34, 0.014, 4.0, '#36244f', 'rgba(255,170,130,0.45)'); haze(c, 220, 280, 'rgba(150,80,120,A)');
    shafts(c, t);
    pines(c, cam * 0.55, 286, '#1b1430', 34, 20);
    ground(c, t);
    pillars(c); shrine(c, t); brazier(c, t);
    slime(c, t); knight(c, t); impactFx(c, t); embers(c, t);
    foreground(c, t); hud(c);
    drawDepth(t);
  }

  // ---------------------------------------------------------------- post
  var DEF = { look: 'filmic', passes: 'grade+pulse', sample: 'auto' };
  var overrides = {};
  ['look', 'passes', 'sample'].forEach(function (k) { if (Q.has(k)) overrides[k] = Q.get(k); });
  ['exposure', 'contrast', 'saturation', 'warmth', 'filmic', 'vignette', 'lift', 'chroma', 'decay', 'punch'].forEach(function (k) { if (Q.has(k) && isFinite(Number(Q.get(k)))) overrides[k] = Number(Q.get(k)); });
  var cfg = Object.assign({}, DEF, overrides);
  var hazeOn = Q.has('haze'), hazeAmt = hazeOn ? (Number(Q.get('haze')) || 0.55) : 0.55;
  var post = null;
  var uiOn = Q.get('ui') !== '0';
  // HUD panels in game canvas px (the canvas is 640 or 320 wide): the grade and the pulse leave them untouched
  // mask the plates, not the text: the Knight panel and the title's backing chip, each with its corner radius
  function hudRects() { var k = cv.width / W; return [{ x: 14 * k, y: 14 * k, w: 176 * k, h: 46 * k, r: 10 * k }, { x: (W - 148) * k, y: 14 * k, w: 134 * k, h: 32 * k, r: 9 * k }]; }

  var HAZE = {
    name: 'depth-haze', order: 300, inputs: { uDepth: 'depth', uUi: 'uiMask' }, params: { amount: 0.55, color: [0.62, 0.5, 0.78] },
    frag: [
      'uniform float uAmount; uniform vec3 uColor;',
      'void main() {',
      '  vec3 c = texture2D(uPrev, vUv).rgb;',
      '  float d = texture2D(uDepth, vUv).r * uDepthOn;          // 1 = far',
      '  float ui = clamp(texture2D(uUi, vUv).r, 0.0, 1.0) * uUiOn;   // shared HUD mask: never haze the HUD',
      '  float f = uAmount * smoothstep(0.45, 1.0, d) * (1.0 - ui);',
      '  gl_FragColor = vec4(mix(c, uColor * (0.7 + 0.5 * luma(c)), f * 0.75), 1.0);',
      '}'
    ].join('\n'),
    uniforms: function (s, p) { return { uAmount: p.amount, uColor: p.color }; }
  };
  function makePost(on) {
    if (post) { post.destroy(); post = null; }
    if (on && /[?&]webgl=0/.test(location.search)) { var u = new URL(location.href); u.searchParams.delete('webgl'); history.replaceState(null, '', u); }
    var params = Object.assign({}, cfg);
    if (!on && !/[?&]webgl=0/.test(location.search)) params.webgl = 'off';   // ?webgl=0: the module reads the URL itself (reason 'url')
    post = GameDNA_Post.create({ canvas: cv, clock: function () { return gameMs; }, params: params, uiRects: uiOn ? hudRects : null });
    post.addPass(Object.assign({}, HAZE, { enabled: hazeOn }));
    post.set('depth-haze', { amount: hazeAmt });
    post.setInput('depth', depth);
    window.__post = post;
    applySplit();
    post.render();
  }

  // ---------------------------------------------------------------- clock
  function strikesBetween(a, b, fn) {
    for (var k = Math.max(0, strikeIndexAt(a) + 1); k * CYCLE + IMPACT <= b; k++) fn(k, k * CYCLE + IMPACT);
  }
  function firePulse(k) { post.pulse(isFinisher(k) ? 1.25 : 0.7, { at: { x: 402 * cv.width / W, y: (GROUND - 30) * cv.width / W } }); }
  function frame() { drawScene(gameMs); post.render(); if (FREEZE) status(); }

  // ---------------------------------------------------------------- UI
  var $ = function (id) { return document.getElementById(id); };
  function fill(r) { r.style.setProperty('--fill', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); }
  function fmt(k, v) { return k === 'decay' ? String(Math.round(v)) : k === 'punch' ? Number(v).toFixed(3) : Number(v).toFixed(2); }
  function syncSliders() {
    var P = post.params();
    document.querySelectorAll('input[data-k]').forEach(function (r) { var k = r.dataset.k; r.value = P[k]; fill(r); r.parentNode.querySelector('output').textContent = fmt(k, P[k]); });
    document.querySelectorAll('#look button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.v === P.look)); });
  }
  document.querySelectorAll('input[data-k]').forEach(function (r) {
    r.addEventListener('input', function () { var o = {}; o[r.dataset.k] = Number(r.value); cfg[r.dataset.k] = Number(r.value); post.setParams(o); fill(r); r.parentNode.querySelector('output').textContent = fmt(r.dataset.k, r.value); if (FREEZE) frame(); });
  });
  function seg(id, fn) {
    document.querySelectorAll('#' + id + ' button').forEach(function (b) {
      b.addEventListener('click', function () { document.querySelectorAll('#' + id + ' button').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); }); fn(b.dataset.v); if (FREEZE) frame(); });
    });
  }
  seg('look', function (v) {
    cfg.look = v; ['exposure', 'contrast', 'saturation', 'warmth', 'filmic', 'lift'].forEach(function (k) { delete cfg[k]; });
    post.setParams({ look: v }); syncSliders();
  });
  seg('sample', function (v) { cfg.sample = v; post.setParams({ sample: v }); });
  seg('res', function (v) { setRes(v); });
  function setRes(v) {
    var px = v === 'px'; cv.width = px ? 320 : 640; cv.height = px ? 180 : 360; cv.classList.toggle('px', px);
    document.querySelectorAll('#res button').forEach(function (x) { x.setAttribute('aria-checked', String(x.dataset.v === v)); });
  }
  function passFlags() { return ($('p-grade').checked ? 'grade' : '') + ($('p-grade').checked && $('p-pulse').checked ? '+' : '') + ($('p-pulse').checked ? 'pulse' : '') || 'none'; }
  $('p-grade').addEventListener('change', function () { cfg.passes = passFlags(); post.setParams({ passes: cfg.passes }); if (FREEZE) frame(); });
  $('p-pulse').addEventListener('change', function () { cfg.passes = passFlags(); post.setParams({ passes: cfg.passes }); if (FREEZE) frame(); });
  $('p-ui').addEventListener('change', function () { uiOn = $('p-ui').checked; post.setParams({ uiRects: uiOn ? hudRects : null }); if (FREEZE) frame(); });
  $('p-haze').addEventListener('change', function () { hazeOn = $('p-haze').checked; post.enable('depth-haze', hazeOn); if (FREEZE) frame(); });
  $('haze').addEventListener('input', function () { hazeAmt = Number($('haze').value); post.set('depth-haze', { amount: hazeAmt }); fill($('haze')); $('haze').parentNode.querySelector('output').textContent = hazeAmt.toFixed(2); if (FREEZE) frame(); });
  $('webgl').addEventListener('change', function () { makePost($('webgl').checked); syncSliders(); frame(); status(); });
  $('hit').addEventListener('click', function () {
    manualHits.push(gameMs + 260); if (manualHits.length > 4) manualHits.shift();
    if (FREEZE) {   // frozen page: jump to 80 ms after this strike's impact, fire its pulse and draw once
      var at = gameMs + 260; gameMs = at + 80; post.pulse(1, { at: { x: 402 * cv.width / W, y: (GROUND - 30) * cv.width / W } }); frame();
    }
  });
  // hold to see the plain 2D canvas (button or C key): the whole frame flips, so any object can be compared
  function hold(on) { $('hold').classList.toggle('on', on); if (post.active || !on) { post.setEnabled(!on); if (!on) frame(); } }
  $('hold').addEventListener('pointerdown', function (e) { e.preventDefault(); hold(true); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { $('hold').addEventListener(ev, function () { if ($('hold').classList.contains('on')) hold(false); }); });
  addEventListener('keydown', function (e) { if ((e.key === 'c' || e.key === 'C') && !e.repeat && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) hold(true); });
  addEventListener('keyup', function (e) { if (e.key === 'c' || e.key === 'C') hold(false); });
  var splitX = Q.has('split') ? Math.max(0, Math.min(1, Number(Q.get('split')) || 0)) : 0;
  function applySplit() {
    var r = $('splitR'); r.value = splitX; fill(r); $('o-split').textContent = splitX > 0 ? Math.round(splitX * 100) + '%' : 'off';
    var line = $('split');
    if (post && post.canvas) post.canvas.style.clipPath = splitX > 0 ? 'inset(0 0 0 ' + (splitX * 100) + '%)' : '';
    line.style.display = splitX > 0 && post && post.active ? 'block' : 'none'; line.style.left = (splitX * 100) + '%';
  }
  $('splitR').addEventListener('input', function () { splitX = Number($('splitR').value); applySplit(); });
  function dimOff() {   // WebGL off: grade / pulse / haze / compare controls would do nothing, so dim them and say why
    var off = !post.active;
    ['sec-grade', 'sec-pulse', 'sec-haze', 'cmp'].forEach(function (id) { $(id).classList.toggle('dim', off); });
    $('offnote').style.display = off ? 'block' : 'none';
  }
  function status() {
    var s = post.stats();
    var m = $('mode');
    m.className = s.mode === 'off' ? 'off' : '';
    m.innerHTML = s.mode === 'off' ? '<b>2D only</b> &middot; WebGL ' + (s.reason === 'option' ? 'switched off' : s.reason === 'url' ? 'off (?webgl=0)' : 'unavailable') : '<b>' + (s.mode === 'webgl2' ? 'WebGL2' : 'WebGL') + '</b> &middot; ' + s.passes.length + (s.passes.length === 1 ? ' pass on' : ' passes on');
    $('cost').innerHTML = s.mode === 'off' ? 'post <b>none</b>' : 'cpu <b>' + s.avgMs.toFixed(2) + ' ms</b>/frame';
    $('size').innerHTML = s.mode === 'off' ? 'canvas <b>' + cv.width + '&times;' + cv.height + '</b>' : 'canvas <b>' + s.srcW + '&times;' + s.srcH + '</b> &rarr; <b>' + s.w + '&times;' + s.h + '</b> px';
    dimOff();
    $('stat').innerHTML = s.mode === 'off' ? 'passes: <b>-</b>' : 'passes: <b>' + s.passes.join(' &rarr; ') + '</b><br>frames ' + s.frames + ' &middot; pulse ' + s.pulse.toFixed(2) + ' &middot; dpr ' + s.dpr.toFixed(2);
  }

  // ---------------------------------------------------------------- boot
  if (Q.get('res') === 'px') setRes('px');
  $('p-grade').checked = /grade/.test(cfg.passes); $('p-pulse').checked = /pulse/.test(cfg.passes); $('p-haze').checked = hazeOn; $('p-ui').checked = uiOn;
  $('haze').value = hazeAmt; fill($('haze')); $('haze').parentNode.querySelector('output').textContent = hazeAmt.toFixed(2);
  makePost(!/[?&]webgl=0/.test(location.search));
  $('webgl').checked = post.active;
  syncSliders();
  /* text state for critics and tools/sprites/statecheck.py. knight() is vector art drawn facing RIGHT (visor, sword arm and
     lean all point +x) and is never mirrored, so its facing is that constant; slime() is a frontal blob. 640x360 units. */
  window.__state = function () {
    var kx = knightPose(gameMs).x, since = gameMs - lastImpact(gameMs), hit = since >= 0 && since < 600;
    var sx = 432 + (hit ? 22 * Math.exp(-since / 140) * Math.sin(Math.min(1, since / 60) * Math.PI / 2) : 0);
    return { t: Math.round(gameMs), actors: [
      { id: 'knight', x: Math.round(kx), y: GROUND, facing: 'right', target: 'slime' },
      { id: 'slime', x: Math.round(sx), y: GROUND, facing: null, target: 'knight', noFace: 'frontal art' }] };
  };
  window.__demo = function () { return { gameMs: gameMs, strikes: strikeIndexAt(gameMs) + 1, stats: post.stats() }; };

  if (HAS_T) {
    strikesBetween(-1, T0, function (k, at) { gameMs = at; firePulse(k); });
    gameMs = T0; frame(); setTimeout(status, 0);
    if (FREEZE) { window.__frozen = true; return; }
  } else frame();
  var last = null, acc = 0;
  function loop(now) {
    if (last === null) last = now;
    acc += Math.min(100, now - last); last = now;
    var prev = gameMs;
    while (acc >= 1000 / 60) { gameMs += 1000 / 60; acc -= 1000 / 60; }
    if (gameMs !== prev) {
      strikesBetween(prev, gameMs, function (k) { firePulse(k); });
      for (var m = 0; m < manualHits.length; m++) if (manualHits[m] > prev && manualHits[m] <= gameMs) post.pulse(1, { at: { x: 402 * cv.width / W, y: (GROUND - 30) * cv.width / W } });
      frame();
    }
    requestAnimationFrame(loop);
  }
  setInterval(status, 500);
  requestAnimationFrame(loop);
})();
