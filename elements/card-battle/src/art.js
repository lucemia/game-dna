/* ART: procedural HD backdrops for The Lantern Road (640x360 logical, cached at device resolution) in four themes, plus the
   animated layer (fog, motes, lantern flicker). Original art; front view: a road that runs away from you, foes stand on it. */
var ART = (function () {
  'use strict';
  var W = 640, H = 360, HOR = 150, TAU = Math.PI * 2;
  function h1(a, b) { var h = Math.imul((a | 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((b | 0) + 0x632BE5AB, 0xC2B2AE35); h ^= h >>> 13; h = Math.imul(h, 0x27D4EB2F); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  var THEMES = {
    marsh:   { sky: ['#0f2a33', '#21454a', '#5d7a63'], glow: '#ffe2a0', far: '#18323a', mid: '#0e2026', floor: ['#2a3a2c', '#0d1612'], fog: '#9fc6b8', mote: '#d8ff9a', lamp: '#ffcf6a', props: 'reeds' },
    bridge:  { sky: ['#2a1f45', '#6b3f5e', '#e08a5a'], glow: '#ffd08a', far: '#3b2a4c', mid: '#24182e', floor: ['#5a4a4e', '#1a1418'], fog: '#e8b8b0', mote: '#ffe0b0', lamp: '#ffc070', props: 'bridge' },
    orchard: { sky: ['#1a0d10', '#4a1a14', '#b8501e'], glow: '#ff9a4a', far: '#2a1210', mid: '#160a0a', floor: ['#3a2420', '#120a0a'], fog: '#c87a5a', mote: '#ffb060', lamp: '#ff9a3c', props: 'orchard' },
    briar:   { sky: ['#0a0a1e', '#1e1a40', '#3e3a6e'], glow: '#c8d8ff', far: '#16142e', mid: '#0c0a1a', floor: ['#262036', '#0a0812'], fog: '#9a90d0', mote: '#b8ffd8', lamp: '#9fe8ff', props: 'briar' },
    title:   { sky: ['#120c22', '#2c1e44', '#7a4a5a'], glow: '#ffd08a', far: '#221a36', mid: '#120c1c', floor: ['#30243a', '#0e0a14'], fog: '#c8a8c8', mote: '#ffe0a0', lamp: '#ffcf6a', props: 'reeds' }
  };
  function ridge(g, y, amp, seed, col, step) {
    g.beginPath(); g.moveTo(0, H); g.lineTo(0, y);
    for (var x = 0; x <= W; x += step || 8) { var v = Math.sin(x * 0.012 + seed) * 0.5 + Math.sin(x * 0.031 + seed * 2.1) * 0.3 + (h1(x >> 4, seed) - 0.5) * 0.25; g.lineTo(x, y - v * amp - amp * 0.5); }
    g.lineTo(W, H); g.closePath(); g.fillStyle = col; g.fill();
  }
  function tree(g, x, y, s, col, seed, burnt) {
    g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-6, 0); g.quadraticCurveTo(-3, -40, -2, -80); g.lineTo(2, -80); g.quadraticCurveTo(4, -40, 7, 0); g.closePath(); g.fill();
    for (var i = 0; i < 6; i++) { var a = (h1(i, seed) - 0.5) * 2.2, len = 26 + h1(i + 4, seed) * 30, by = -34 - i * 8; g.lineWidth = 4 - i * 0.4; g.beginPath(); g.moveTo(0, by); g.quadraticCurveTo(Math.sin(a) * len * 0.5, by - 12, Math.sin(a) * len, by - Math.cos(a) * len * 0.5 - 10); g.stroke();
      if (!burnt) { g.beginPath(); g.ellipse(Math.sin(a) * len, by - Math.cos(a) * len * 0.5 - 12, 14, 9, a, 0, TAU); g.fill(); } }
    g.restore();
  }
  function lampPost(g, x, y, s, T) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = '#120c10'; g.fillRect(-2.5, -70, 5, 70); g.fillRect(-2, -72, 16, 3); g.fillRect(11, -72, 2, 8);
    g.beginPath(); g.moveTo(6, -64); g.lineTo(18, -64); g.lineTo(16, -50); g.lineTo(8, -50); g.closePath(); g.fillStyle = T.lamp; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#120c10'; g.stroke();
    g.restore();
  }
  function paint(g, theme) {
    var T = THEMES[theme] || THEMES.marsh;
    var sky = g.createLinearGradient(0, 0, 0, HOR + 30); sky.addColorStop(0, T.sky[0]); sky.addColorStop(0.6, T.sky[1]); sky.addColorStop(1, T.sky[2]); g.fillStyle = sky; g.fillRect(0, 0, W, HOR + 40);
    var gl = g.createRadialGradient(376, HOR - 10, 4, 376, HOR - 10, 260); gl.addColorStop(0, T.glow); gl.addColorStop(0.25, 'rgba(255,220,170,0.25)'); gl.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gl; g.fillRect(0, 0, W, H);
    if (theme === 'briar' || theme === 'marsh' || theme === 'title') { g.beginPath(); g.arc(theme === 'briar' ? 470 : 150, 54, 20, 0, TAU); g.fillStyle = theme === 'briar' ? '#e8eeff' : '#fff0d0'; g.globalAlpha = 0.9; g.fill(); g.globalAlpha = 1; var mg = g.createRadialGradient(theme === 'briar' ? 470 : 150, 54, 18, theme === 'briar' ? 470 : 150, 54, 90); mg.addColorStop(0, 'rgba(255,255,255,0.25)'); mg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = mg; g.fillRect(0, 0, W, 200); }
    for (var s = 0; s < 70; s++) { var sx = h1(s, 3) * W, sy = h1(s, 5) * HOR * 0.8; g.fillStyle = 'rgba(255,255,255,' + (0.15 + h1(s, 7) * 0.5) + ')'; g.fillRect(sx, sy, 1.2, 1.2); }
    ridge(g, HOR - 18, 46, 1.3, T.far, 6);
    if (T.props === 'bridge') { g.fillStyle = T.mid; for (var a = 0; a < 3; a++) { var ax = 120 + a * 200; g.beginPath(); g.moveTo(ax - 70, HOR + 6); g.lineTo(ax - 70, HOR - 40); g.quadraticCurveTo(ax, HOR - 92, ax + 70, HOR - 40); g.lineTo(ax + 70, HOR + 6); g.lineTo(ax + 48, HOR + 6); g.lineTo(ax + 48, HOR - 30); g.quadraticCurveTo(ax, HOR - 66, ax - 48, HOR - 30); g.lineTo(ax - 48, HOR + 6); g.closePath(); g.fill(); } }
    ridge(g, HOR + 2, 20, 4.7, T.mid, 5);
    if (T.props === 'orchard' || T.props === 'reeds' || T.props === 'briar') for (var t = 0; t < 9; t++) { var tx = 20 + t * 76 + h1(t, 9) * 30; if (tx > 230 && tx < 520) continue; tree(g, tx, HOR + 6, 0.8 + h1(t, 2) * 0.5, T.mid, t, T.props === 'orchard'); }
    var fl = g.createLinearGradient(0, HOR, 0, H); fl.addColorStop(0, T.floor[0]); fl.addColorStop(1, T.floor[1]); g.fillStyle = fl;
    g.beginPath(); g.moveTo(0, HOR + 8); g.lineTo(W, HOR + 8); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
    // the road: a band that widens towards you, stones in perspective
    g.beginPath(); g.moveTo(340, HOR + 8); g.lineTo(412, HOR + 8); g.lineTo(640, H); g.lineTo(80, H); g.closePath(); var rd = g.createLinearGradient(0, HOR, 0, H); rd.addColorStop(0, 'rgba(255,230,190,0.16)'); rd.addColorStop(1, 'rgba(255,230,190,0.04)'); g.fillStyle = rd; g.fill();
    g.save(); g.clip(); g.strokeStyle = 'rgba(10,6,10,0.35)'; g.lineWidth = 1;
    for (var r = 0; r < 16; r++) { var k = r / 16, yy = HOR + 8 + Math.pow(k, 1.9) * (H - HOR); g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.stroke(); }
    for (var c = -8; c <= 8; c++) { g.beginPath(); g.moveTo(376 + c * 4.5, HOR + 8); g.lineTo(376 + c * 36, H); g.stroke(); }
    g.restore();
    var lp = g.createRadialGradient(376, 214, 10, 376, 214, 240); lp.addColorStop(0, 'rgba(255,220,160,0.22)'); lp.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = lp; g.fillRect(0, 100, W, 260);
    // framing props, near and dark
    g.fillStyle = '#07050a';
    if (T.props === 'reeds') for (var q = 0; q < 40; q++) { var qx = q < 20 ? h1(q, 1) * 150 : 500 + h1(q, 1) * 140, qh = 50 + h1(q, 2) * 80; g.beginPath(); g.moveTo(qx - 2, H); g.quadraticCurveTo(qx + (h1(q, 3) - 0.5) * 30, H - qh * 0.6, qx + (h1(q, 4) - 0.5) * 24, H - qh); g.lineTo(qx + 2, H); g.fill(); }
    if (T.props === 'bridge') { g.beginPath(); g.moveTo(0, 200); g.lineTo(130, 176); g.lineTo(130, 196); g.lineTo(0, 236); g.closePath(); g.fill(); g.beginPath(); g.moveTo(W, 200); g.lineTo(560, 176); g.lineTo(560, 196); g.lineTo(W, 236); g.closePath(); g.fill(); for (var p = 0; p < 4; p++) { g.fillRect(14 + p * 32, 198 - p * 6, 9, 50 - p * 8); g.fillRect(W - 23 - p * 32, 198 - p * 6, 9, 50 - p * 8); } }
    if (T.props === 'orchard') { tree(g, 40, H, 2.2, '#07050a', 41, true); tree(g, 600, H - 10, 2.0, '#07050a', 43, true); }
    if (T.props === 'briar') for (var v = 0; v < 2; v++) { var side = v ? 1 : -1, bx = v ? W : 0; g.save(); g.translate(bx, 0); g.scale(side * -1, 1); for (var b = 0; b < 4; b++) { g.beginPath(); g.moveTo(0, 40 + b * 70); g.bezierCurveTo(60, 60 + b * 70, 40, 120 + b * 60, 110 - b * 10, 150 + b * 60); g.lineWidth = 12 - b * 2; g.strokeStyle = '#07050a'; g.stroke(); for (var th = 0; th < 6; th++) { var kk = th / 6, tx2 = 0 + (110 - b * 10) * kk, ty2 = 40 + b * 70 + (110 + b * -10) * kk; g.beginPath(); g.moveTo(tx2, ty2); g.lineTo(tx2 + 8, ty2 - 12); g.lineTo(tx2 + 10, ty2 + 2); g.fill(); } } g.restore(); }
    var vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  var cache = {};
  function draw(g, theme, t) {
    var tr = g.getTransform ? g.getTransform() : { a: 1, d: 1 }, bw = Math.max(1, Math.round(W * Math.abs(tr.a))), bh = Math.max(1, Math.round(H * Math.abs(tr.d))), key = theme + ':' + bw + 'x' + bh;
    var c = cache[key];
    if (!c && typeof document !== 'undefined') { c = document.createElement('canvas'); c.width = bw; c.height = bh; var cg = c.getContext('2d'); cg.scale(bw / W, bh / H); paint(cg, theme); cache[key] = c; }
    if (c) g.drawImage(c, 0, 0, W, H); else paint(g, theme);
    var T = THEMES[theme] || THEMES.marsh;
    g.save();
    for (var f = 0; f < 3; f++) { var y = HOR + 14 + f * 22, off = ((t * (6 + f * 4)) % (W + 300)) - 150; var fg = g.createLinearGradient(0, y - 14, 0, y + 14); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.5, T.fog); fg.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = 0.07 + f * 0.02; g.fillStyle = fg; g.fillRect(off - 300, y - 14, 600, 28); g.fillRect(off + 340, y - 14, 520, 28); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'lighter';
    for (var m = 0; m < 22; m++) { var ph = (t * (0.04 + h1(m, 1) * 0.05) + h1(m, 2)) % 1, mx = h1(m, 3) * W + Math.sin(t * 0.7 + m) * 12, my = H - ph * (H - 40), a = Math.sin(ph * Math.PI) * 0.55; var rg = g.createRadialGradient(mx, my, 0, mx, my, 4); rg.addColorStop(0, T.mote); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = a; g.fillStyle = rg; g.fillRect(mx - 4, my - 4, 8, 8); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    if (T.props !== 'briar') { lampPost(g, 200, 214, 1, T); lampPost(g, 562, 210, 0.9, T); g.globalCompositeOperation = 'lighter'; [[212, 160], [572, 158]].forEach(function (p, i) { var fl = 0.8 + 0.2 * Math.sin(t * 7 + i * 2) + 0.08 * Math.sin(t * 17 + i); var lg = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], 46 * fl); lg.addColorStop(0, T.lamp); lg.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = 0.45; g.fillStyle = lg; g.fillRect(p[0] - 50, p[1] - 50, 100, 100); }); }
    g.restore();
  }
  return { draw: draw, THEMES: THEMES, paint: paint };
})();
