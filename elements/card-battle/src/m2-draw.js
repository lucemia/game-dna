  /* ===================================================================================================
     card-battle.js part 2: drawing helpers, the built-in foe painters, the hero portrait, card frames and
     art glyphs, intent tags, status chips. Pure functions of (ctx, data, time); no state.
     =================================================================================================== */
  var FONT = '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, sans-serif';
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function easeOut(k) { k = clamp(k, 0, 1); return 1 - (1 - k) * (1 - k) * (1 - k); }
  function easeBack(k) { k = clamp(k, 0, 1); var c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); }
  function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function hexPath(g, x, y, r) { g.beginPath(); for (var i = 0; i < 6; i++) { var a = -Math.PI / 2 + i * TAU / 6; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); }
  function glow(g, x, y, r, color, a) { if (r <= 0) return; var gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.globalAlpha *= a == null ? 1 : a; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
  function hexToRgb(h) { h = String(h || '#888').replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(h, k) { var c = hexToRgb(h); var f = function (v) { return Math.round(clamp(k < 0 ? v * (1 + k) : v + (255 - v) * k, 0, 255)); }; return 'rgb(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ')'; }
  function rgba(h, a) { var c = hexToRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  var fontFamily = FONT;
  function text(g, s, x, y, o) {
    o = o || {}; s = String(s);
    g.font = (o.italic ? 'italic ' : '') + (o.weight || 700) + ' ' + (o.size || 10) + 'px ' + (o.family || fontFamily);
    g.textAlign = o.align || 'left'; g.textBaseline = o.base || 'alphabetic';
    if (o.ls && g.letterSpacing !== undefined) g.letterSpacing = o.ls + 'px';
    if (o.ow !== 0 && o.outline !== false) { g.lineJoin = 'round'; g.lineWidth = o.ow || 3; g.strokeStyle = o.oc || 'rgba(10,6,18,0.9)'; g.strokeText(s, x, y); }
    g.fillStyle = o.color || '#f4eedf'; g.fillText(s, x, y);
    if (o.ls && g.letterSpacing !== undefined) g.letterSpacing = '0px';
    return g.measureText(s).width;
  }
  function measure(g, s, size, weight) { g.font = (weight || 700) + ' ' + size + 'px ' + fontFamily; return g.measureText(String(s)).width; }

  // ---- Foe painters: origin at the feet (0, 0), up is -y, s = scale. Each returns {w, h} of its sprite box (unscaled by s). ----
  var LOOKS = {};
  var PAL = {
    toad: { body: '#5f8f3e', belly: '#d8cf8a', accent: '#2f4d24', eye: '#ffd23f' },
    wisp: { body: '#ff9a3c', belly: '#fff2b8', accent: '#c4402b', eye: '#2a0d08' },
    brute: { body: '#7b7f86', belly: '#9aa0a6', accent: '#5f9a3a', eye: '#b6ff6a' },
    imp: { body: '#2c2230', belly: '#4a3442', accent: '#ff7a2a', eye: '#ffe066' },
    thief: { body: '#3b4a6b', belly: '#c94b43', accent: '#ffcf6a', eye: '#9ff3ff' },
    golem: { body: '#5a4130', belly: '#3f2d22', accent: '#6fae3f', eye: '#ffb84a' },
    slime: { body: '#5ac2c8', belly: '#bff6f2', accent: '#2c7f8f', eye: '#14313a' },
    bat: { body: '#4b3a5e', belly: '#8a6aa8', accent: '#d65a8a', eye: '#ff6a6a' }
  };
  function bodyGrad(g, x, y, r, base) { var gr = g.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.15); gr.addColorStop(0, shade(base, 0.35)); gr.addColorStop(0.55, base); gr.addColorStop(1, shade(base, -0.45)); return gr; }
  function ink(g, w) { g.lineWidth = w || 2; g.strokeStyle = 'rgba(16,10,20,0.92)'; g.lineJoin = 'round'; g.stroke(); }
  function eyeBall(g, x, y, r, iris, look, blink) {
    g.save(); g.beginPath(); g.ellipse(x, y, r, r * (blink ? 0.15 : 1), 0, 0, TAU); g.fillStyle = '#fbf6e8'; g.fill(); ink(g, 1.6);
    if (!blink) { g.beginPath(); g.arc(x + look * r * 0.25, y + r * 0.1, r * 0.62, 0, TAU); g.fillStyle = iris; g.fill(); g.beginPath(); g.ellipse(x + look * r * 0.25, y + r * 0.1, r * 0.16, r * 0.5, 0, 0, TAU); g.fillStyle = '#140c10'; g.fill();
      g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.2, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fill(); }
    g.restore();
  }
  LOOKS.toad = function (g, P, t, o) {
    var br = Math.sin(t * 2.2) * 0.025, blink = (Math.floor(t * 10 + o.seed * 37) % 47) === 0;
    g.save(); g.scale(1 + br, 1 - br);
    [-1, 1].forEach(function (k) { g.beginPath(); g.ellipse(k * 34, -8, 15, 9, k * 0.2, 0, TAU); g.fillStyle = shade(P.body, -0.25); g.fill(); ink(g); });
    g.beginPath(); g.ellipse(0, -36, 48, 34, 0, 0, TAU); g.fillStyle = bodyGrad(g, 0, -36, 48, P.body); g.fill(); ink(g, 2.4);
    g.save(); g.clip(); for (var i = 0; i < 7; i++) { var a = hash(i, o.seed * 13), b = hash(i + 9, o.seed * 7); g.beginPath(); g.ellipse(-36 + a * 72, -62 + b * 30, 4 + a * 5, 3 + b * 3, a, 0, TAU); g.fillStyle = rgba(P.accent, 0.55); g.fill(); }
    g.beginPath(); g.ellipse(0, -16, 34, 18, 0, 0, TAU); g.fillStyle = P.belly; g.globalAlpha = 0.9; g.fill(); g.restore();
    g.beginPath(); g.moveTo(-30, -40); g.quadraticCurveTo(0, -27 - (o.act ? 8 : 0), 30, -40); g.lineWidth = 2.6; g.strokeStyle = '#1a1010'; g.stroke();
    if (o.act) { g.beginPath(); g.moveTo(-14, -34); g.quadraticCurveTo(0, -20, 14, -34); g.fillStyle = '#d44a5a'; g.fill(); }
    [-1, 1].forEach(function (k) { g.beginPath(); g.arc(k * 20, -64, 14, 0, TAU); g.fillStyle = bodyGrad(g, k * 20, -64, 14, P.body); g.fill(); ink(g); eyeBall(g, k * 20, -66, 9.5, P.eye, o.look || 0, blink); });
    g.restore();
    return { w: 104, h: 84 };
  };
  LOOKS.wisp = function (g, P, t, o) {
    var bob = Math.sin(t * 2.6 + o.seed) * 5, y0 = -46 + bob, fl = Math.sin(t * 11) * 2;
    g.save(); g.globalCompositeOperation = 'lighter'; glow(g, 0, y0, 62, rgba(P.body, 0.55), 1); g.restore();
    g.save(); g.translate(0, y0);
    g.beginPath(); g.moveTo(0, -46 - fl); g.bezierCurveTo(14, -30, 30, -8, 26, 10); g.bezierCurveTo(22, 30, -22, 30, -26, 10); g.bezierCurveTo(-30, -8, -12, -26, 0, -46 - fl); g.closePath();
    var gr = g.createRadialGradient(0, 8, 2, 0, 0, 44); gr.addColorStop(0, P.belly); gr.addColorStop(0.45, P.body); gr.addColorStop(1, P.accent); g.fillStyle = gr; g.fill(); ink(g, 2);
    g.beginPath(); g.moveTo(-6, -20 + fl); g.bezierCurveTo(6, -6, 12, 6, 0, 18); g.bezierCurveTo(-10, 8, -14, -6, -6, -20 + fl); g.fillStyle = rgba(P.belly, 0.7); g.fill();
    [-1, 1].forEach(function (k) { g.save(); g.translate(k * 10, 4); g.rotate(k * 0.25); g.beginPath(); g.ellipse(0, 0, 5, o.act ? 4 : 2.2, 0, 0, TAU); g.fillStyle = P.eye; g.fill(); g.restore(); });
    g.restore();
    g.save(); g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 6; i++) { var a = hash(i, 3), ph = (t * (0.6 + a * 0.5) + a) % 1; glow(g, (a - 0.5) * 40 + Math.sin(t * 3 + i) * 5, y0 - 30 - ph * 46, 5 * (1 - ph) + 1, rgba(P.body, 0.9), 1 - ph); }
    g.restore();
    return { w: 64, h: 104 };
  };
  LOOKS.brute = function (g, P, t, o) {
    var br = Math.sin(t * 1.6) * 1.5, sw = o.act ? 8 : 0;
    g.save();
    [-1, 1].forEach(function (k) { g.beginPath(); rr(g, k * 22 - 12, -30, 24, 30, 8); g.fillStyle = bodyGrad(g, k * 22, -16, 20, shade(P.body, -0.15)); g.fill(); ink(g); });
    g.beginPath(); g.moveTo(-50, -70 + br); g.quadraticCurveTo(-60, -110 + br, -10, -118 + br); g.quadraticCurveTo(46, -122 + br, 54, -76 + br); g.quadraticCurveTo(52, -34, 30, -26); g.lineTo(-30, -26); g.quadraticCurveTo(-50, -36, -50, -70 + br); g.closePath();
    g.fillStyle = bodyGrad(g, -6, -80, 70, P.body); g.fill(); ink(g, 2.6);
    g.save(); g.clip(); for (var i = 0; i < 10; i++) { var a = hash(i, 5), b = hash(i, 11); g.beginPath(); g.ellipse(-46 + a * 92, -76 + b * 46, 7 + a * 6, 4 + b * 3, a * 3, 0, TAU); g.strokeStyle = 'rgba(30,26,34,0.35)'; g.lineWidth = 1.4; g.stroke(); } g.restore();
    g.beginPath(); g.ellipse(0, -96 + br, 22, 15, 0, 0, TAU); g.fillStyle = bodyGrad(g, 0, -100, 22, shade(P.body, -0.1)); g.fill(); ink(g);
    [-1, 1].forEach(function (k) { glow(g, k * 8, -97 + br, 9, rgba(P.eye, 0.9), 1); g.beginPath(); g.ellipse(k * 8, -97 + br, 3.4, 2.2, 0, 0, TAU); g.fillStyle = '#f6ffe0'; g.fill(); });
    [-1, 1].forEach(function (k) {
      g.beginPath(); g.moveTo(k * 44, -96 + br); g.quadraticCurveTo(k * 74, -84 - sw * 2, k * 66, -34 - sw * 3); g.lineTo(k * 48, -38 - sw * 3); g.quadraticCurveTo(k * 52, -70, k * 34, -80 + br); g.closePath();
      g.fillStyle = bodyGrad(g, k * 56, -70, 30, P.body); g.fill(); ink(g);
      g.beginPath(); g.ellipse(k * 58, -26 - sw * 3, 17, 14, 0, 0, TAU); g.fillStyle = bodyGrad(g, k * 58, -30 - sw * 3, 18, shade(P.body, 0.05)); g.fill(); ink(g, 2.2);
    });
    var moss = function (x, y, r) { g.beginPath(); for (var j = 0; j < 7; j++) { var a = j / 7 * Math.PI + Math.PI, rr2 = r * (0.7 + hash(j, x | 0) * 0.4); g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2 * 0.6); } g.closePath(); g.fillStyle = P.accent; g.fill(); g.strokeStyle = shade(P.accent, -0.4); g.lineWidth = 1.5; g.stroke(); };
    moss(-34, -96 + br, 22); moss(36, -98 + br, 20); moss(0, -112 + br, 18);
    g.restore();
    return { w: 150, h: 124 };
  };
  LOOKS.imp = function (g, P, t, o) {
    var bob = Math.sin(t * 5 + o.seed) * 3, y0 = -40 + bob, fl = Math.sin(t * 14 + o.seed) * 0.35;
    g.save(); g.translate(0, y0);
    [-1, 1].forEach(function (k) { g.save(); g.scale(k, 1); g.rotate(-0.2 + fl * 0.6); g.beginPath(); g.moveTo(10, -8); g.quadraticCurveTo(40, -36, 52, -14); g.quadraticCurveTo(42, -12, 40, -2); g.quadraticCurveTo(32, -8, 28, 2); g.quadraticCurveTo(20, -4, 10, 4); g.closePath(); g.fillStyle = shade(P.belly, -0.1); g.fill(); ink(g, 1.8); g.restore(); });
    g.beginPath(); g.moveTo(10, 16); g.quadraticCurveTo(30, 30, 26, 44); g.lineWidth = 3; g.strokeStyle = '#1a1018'; g.stroke(); g.beginPath(); g.moveTo(26, 44); g.lineTo(22, 50); g.lineTo(31, 48); g.closePath(); g.fillStyle = P.accent; g.fill();
    g.beginPath(); g.ellipse(0, 0, 22, 24, 0, 0, TAU); g.fillStyle = bodyGrad(g, 0, 0, 24, P.body); g.fill(); ink(g, 2.2);
    g.save(); g.clip(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = rgba(P.accent, 0.8 + 0.2 * Math.sin(t * 6)); g.lineWidth = 1.6;
    [[-14, -4, -4, 8, 4, 18], [12, -12, 6, 2, 14, 12], [-4, 14, 4, 20, 0, 26]].forEach(function (c) { g.beginPath(); g.moveTo(c[0], c[1]); g.lineTo(c[2], c[3]); g.lineTo(c[4], c[5]); g.stroke(); }); g.restore();
    [-1, 1].forEach(function (k) { g.beginPath(); g.moveTo(k * 10, -20); g.quadraticCurveTo(k * 20, -34, k * 14, -42); g.quadraticCurveTo(k * 14, -30, k * 4, -22); g.closePath(); g.fillStyle = '#e8d6b8'; g.fill(); ink(g, 1.5); });
    [-1, 1].forEach(function (k) { glow(g, k * 8, -6, 8, rgba(P.eye, 0.8), 1); g.beginPath(); g.ellipse(k * 8, -6, 4, o.act ? 4 : 3, k * 0.3, 0, TAU); g.fillStyle = P.eye; g.fill(); });
    g.beginPath(); g.moveTo(-8, 7); g.quadraticCurveTo(0, 13, 8, 7); g.lineWidth = 1.8; g.strokeStyle = '#120a0a'; g.stroke();
    g.restore();
    return { w: 70, h: 86 };
  };
  LOOKS.thief = function (g, P, t, o) {
    var sway = Math.sin(t * 1.8 + o.seed) * 1.5, lunge = o.act ? 6 : 0;
    g.save();
    g.beginPath(); g.moveTo(-30, 0); g.quadraticCurveTo(-36 + sway, -50, -18, -86); g.lineTo(18, -86); g.quadraticCurveTo(36 + sway, -50, 30, 0); g.quadraticCurveTo(14, -6, 0, 0); g.quadraticCurveTo(-14, -6, -30, 0); g.closePath();
    g.fillStyle = bodyGrad(g, -6, -50, 52, P.body); g.fill(); ink(g, 2.4);
    g.beginPath(); g.moveTo(-18, -78); g.quadraticCurveTo(0, -70, 18, -78); g.lineTo(20, -68); g.quadraticCurveTo(0, -60, -20, -68); g.closePath(); g.fillStyle = P.belly; g.fill(); ink(g, 1.6);
    g.beginPath(); g.moveTo(-6, -66); g.quadraticCurveTo(-14, -46, -4, -40); g.lineTo(2, -64); g.fillStyle = shade(P.belly, -0.2); g.fill();
    g.beginPath(); g.moveTo(-22, -84); g.quadraticCurveTo(-24, -118, 2, -122); g.quadraticCurveTo(26, -118, 22, -84); g.quadraticCurveTo(0, -78, -22, -84); g.closePath(); g.fillStyle = bodyGrad(g, -4, -104, 26, shade(P.body, 0.08)); g.fill(); ink(g, 2.2);
    g.beginPath(); g.ellipse(0, -96, 13, 11, 0, 0, TAU); g.fillStyle = '#0c0a12'; g.fill();
    [-1, 1].forEach(function (k) { glow(g, k * 5, -97, 6, rgba(P.eye, 0.9), 1); g.beginPath(); g.ellipse(k * 5, -97, 2.6, 1.6, 0, 0, TAU); g.fillStyle = '#e9feff'; g.fill(); });
    g.save(); g.translate(26 + lunge, -44 - lunge); g.rotate(-0.6 - lunge * 0.05);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(4, -28); g.lineTo(0, -34); g.lineTo(-4, -28); g.closePath(); var bl = g.createLinearGradient(-4, 0, 4, 0); bl.addColorStop(0, '#9fb0c4'); bl.addColorStop(0.5, '#f4f8ff'); bl.addColorStop(1, '#7d8ea3'); g.fillStyle = bl; g.fill(); ink(g, 1.4);
    g.fillStyle = '#6b4a2a'; g.fillRect(-6, 0, 12, 3); g.fillRect(-2, 3, 4, 8); g.restore();
    g.save(); g.translate(-30, -30 + sway);
    g.beginPath(); g.moveTo(0, -18); g.lineTo(0, -10); g.strokeStyle = '#3a2a1a'; g.lineWidth = 1.5; g.stroke();
    g.save(); g.globalCompositeOperation = 'lighter'; glow(g, 0, 0, 26 + Math.sin(t * 7) * 2, rgba(P.accent, 0.6), 1); g.restore();
    rr(g, -6, -10, 12, 16, 3); g.fillStyle = rgba(P.accent, 0.9); g.fill(); g.lineWidth = 1.6; g.strokeStyle = '#3a2a1a'; g.stroke();
    g.beginPath(); g.moveTo(-7, -10); g.lineTo(7, -10); g.moveTo(-7, 6); g.lineTo(7, 6); g.stroke(); g.restore();
    g.restore();
    return { w: 84, h: 124 };
  };
  LOOKS.golem = function (g, P, t, o) {
    var br = Math.sin(t * 1.3) * 2, pulse = 0.6 + 0.4 * Math.sin(t * 3), raise = o.act ? 10 : 0;
    g.save();
    [-1, 1].forEach(function (k) { g.beginPath(); g.moveTo(k * 18, -40); g.quadraticCurveTo(k * 30, -16, k * 40, 0); g.lineTo(k * 14, 0); g.quadraticCurveTo(k * 10, -20, k * 4, -40); g.closePath(); g.fillStyle = bodyGrad(g, k * 22, -20, 24, P.belly); g.fill(); ink(g, 2.2); });
    var root = function (x0, y0, x1, y1, w, c) { g.beginPath(); g.moveTo(x0 - w, y0); g.quadraticCurveTo((x0 + x1) / 2 - w * 1.5, (y0 + y1) / 2, x1, y1); g.quadraticCurveTo((x0 + x1) / 2 + w * 1.5, (y0 + y1) / 2, x0 + w, y0); g.closePath(); g.fillStyle = c; g.fill(); ink(g, 1.8); };
    g.beginPath(); g.moveTo(-46, -40); g.quadraticCurveTo(-64, -110 + br, -18, -128 + br); g.quadraticCurveTo(26, -138 + br, 52, -110 + br); g.quadraticCurveTo(66, -70, 44, -38); g.quadraticCurveTo(0, -30, -46, -40); g.closePath();
    g.fillStyle = bodyGrad(g, -8, -90, 78, P.body); g.fill(); ink(g, 2.8);
    g.save(); g.clip(); for (var i = 0; i < 9; i++) { var a = hash(i, 21), b = hash(i, 33); g.beginPath(); g.moveTo(-50 + a * 100, -40); g.bezierCurveTo(-40 + b * 80, -70, -50 + a * 90, -100, -30 + b * 70, -136); g.lineWidth = 3 + a * 3; g.strokeStyle = rgba('#2a1c14', 0.45); g.stroke(); } g.restore();
    g.save(); g.globalCompositeOperation = 'lighter'; glow(g, 2, -84 + br, 34 * pulse + 10, rgba(P.eye, 0.75), 1); g.restore();
    hexPath(g, 2, -84 + br, 11); g.fillStyle = '#fff1c4'; g.fill(); g.strokeStyle = shade(P.eye, -0.3); g.lineWidth = 2; g.stroke();
    [-1, 1].forEach(function (k) {
      root(k * 46, -100 + br, k * (84 + raise), -46 - raise * 2, 11, bodyGrad(g, k * 62, -76, 34, shade(P.body, 0.05)));
      for (var j = 0; j < 4; j++) { var px = lerp(k * 50, k * (80 + raise), j / 4), py = lerp(-98 + br, -50 - raise * 2, j / 4); g.beginPath(); g.moveTo(px - 3, py); g.lineTo(px + k * 4, py - 9); g.lineTo(px + 3, py); g.closePath(); g.fillStyle = '#d8c7a0'; g.fill(); ink(g, 1); }
      g.beginPath(); g.ellipse(k * (86 + raise), -42 - raise * 2, 16, 13, 0, 0, TAU); g.fillStyle = bodyGrad(g, k * (86 + raise), -46 - raise * 2, 16, P.body); g.fill(); ink(g, 2);
    });
    [-1, 1].forEach(function (k) { glow(g, k * 14, -114 + br, 9, rgba(P.eye, 0.9), 1); g.beginPath(); g.ellipse(k * 14, -114 + br, 4.5, 2.6, k * -0.3, 0, TAU); g.fillStyle = '#fff6d0'; g.fill(); });
    for (var c = 0; c < 5; c++) { var cx = -26 + c * 13, h = 18 + hash(c, 4) * 14; g.beginPath(); g.moveTo(cx - 3, -126 + br); g.quadraticCurveTo(cx - 6, -126 - h / 2 + br, cx + (c - 2) * 3, -126 - h + br); g.quadraticCurveTo(cx + 2, -126 - h / 2 + br, cx + 3, -126 + br); g.fillStyle = shade(P.body, -0.2); g.fill(); ink(g, 1.4);
      g.beginPath(); g.ellipse(cx + (c - 2) * 3 + 4, -126 - h + 4 + br, 5, 2.6, 0.6, 0, TAU); g.fillStyle = P.accent; g.fill(); }
    [[-30, -64, 16], [28, -112, 14], [36, -56, 11]].forEach(function (m) { g.beginPath(); g.ellipse(m[0], m[1] + br, m[2], m[2] * 0.55, 0.3, 0, TAU); g.fillStyle = rgba(P.accent, 0.9); g.fill(); g.strokeStyle = shade(P.accent, -0.45); g.lineWidth = 1.4; g.stroke(); });
    g.restore();
    return { w: 190, h: 150 };
  };
  LOOKS.slime = function (g, P, t, o) {
    var sq = Math.sin(t * 3.4 + o.seed) * 0.06;
    g.save(); g.scale(1 + sq, 1 - sq);
    g.beginPath(); g.moveTo(-40, 0); g.quadraticCurveTo(-46, -50, 0, -58); g.quadraticCurveTo(46, -50, 40, 0); g.quadraticCurveTo(0, 6, -40, 0); g.closePath();
    var gr = g.createLinearGradient(0, -58, 0, 0); gr.addColorStop(0, shade(P.body, 0.25)); gr.addColorStop(1, shade(P.body, -0.3)); g.fillStyle = gr; g.globalAlpha = 0.92; g.fill(); g.globalAlpha = 1; ink(g, 2.2);
    g.beginPath(); g.ellipse(-16, -40, 10, 6, -0.5, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
    [-1, 1].forEach(function (k) { g.beginPath(); g.ellipse(k * 12, -28, 4, o.act ? 6 : 5, 0, 0, TAU); g.fillStyle = P.eye; g.fill(); });
    g.restore(); return { w: 92, h: 60 };
  };
  LOOKS.bat = function (g, P, t, o) {
    var y0 = -60 + Math.sin(t * 4 + o.seed) * 6, fl = Math.sin(t * 16 + o.seed);
    g.save(); g.translate(0, y0);
    [-1, 1].forEach(function (k) { g.save(); g.scale(k, 1); g.rotate(fl * 0.35); g.beginPath(); g.moveTo(8, -4); g.quadraticCurveTo(30, -26, 54, -10); g.quadraticCurveTo(46, -2, 44, 8); g.quadraticCurveTo(36, 0, 30, 10); g.quadraticCurveTo(22, 2, 8, 8); g.closePath(); g.fillStyle = bodyGrad(g, 30, -4, 30, P.belly); g.fill(); ink(g, 1.6); g.restore(); });
    g.beginPath(); g.ellipse(0, 0, 13, 15, 0, 0, TAU); g.fillStyle = bodyGrad(g, 0, 0, 15, P.body); g.fill(); ink(g, 2);
    [-1, 1].forEach(function (k) { g.beginPath(); g.moveTo(k * 4, -12); g.lineTo(k * 10, -24); g.lineTo(k * 11, -10); g.fillStyle = P.body; g.fill(); ink(g, 1.2); glow(g, k * 5, -3, 6, rgba(P.eye, 0.8), 1); g.beginPath(); g.arc(k * 5, -3, 2.4, 0, TAU); g.fillStyle = '#fff'; g.fill(); });
    g.restore(); return { w: 110, h: 90 };
  };

  // The hero's portrait medallion (the lantern bearer).
  function drawHeroPortrait(g, x, y, r, t, hurt) {
    g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    var bg = g.createRadialGradient(x, y + r * 0.5, 2, x, y, r * 1.2); bg.addColorStop(0, '#6b4a2a'); bg.addColorStop(0.5, '#2a1d2e'); bg.addColorStop(1, '#120c18'); g.fillStyle = bg; g.fillRect(x - r, y - r, r * 2, r * 2);
    g.save(); g.globalCompositeOperation = 'lighter'; glow(g, x + r * 0.15, y + r * 0.7, r * 0.9 + Math.sin(t * 6) * 1.5, 'rgba(255,190,90,0.55)', 1); g.restore();
    g.beginPath(); g.moveTo(x - r * 0.75, y + r); g.quadraticCurveTo(x - r * 0.8, y - r * 0.55, x, y - r * 0.72); g.quadraticCurveTo(x + r * 0.8, y - r * 0.55, x + r * 0.75, y + r); g.closePath();
    var cl = g.createLinearGradient(x - r, y, x + r, y); cl.addColorStop(0, '#2c4a3e'); cl.addColorStop(1, '#456f5a'); g.fillStyle = cl; g.fill(); ink(g, 1.6);
    g.beginPath(); g.ellipse(x + r * 0.04, y - r * 0.02, r * 0.36, r * 0.42, 0, 0, TAU); var fc = g.createLinearGradient(x, y - r * 0.4, x, y + r * 0.4); fc.addColorStop(0, '#c99a7a'); fc.addColorStop(1, '#ffd3a0'); g.fillStyle = fc; g.fill(); ink(g, 1.4);
    g.beginPath(); g.moveTo(x - r * 0.42, y - r * 0.2); g.quadraticCurveTo(x, y - r * 0.62, x + r * 0.46, y - r * 0.18); g.quadraticCurveTo(x + r * 0.2, y - r * 0.36, x - r * 0.42, y - r * 0.2); g.fillStyle = '#3a2418'; g.fill();
    [-1, 1].forEach(function (k) { g.beginPath(); g.ellipse(x + k * r * 0.15 + r * 0.04, y - r * 0.02, r * 0.05, hurt ? r * 0.015 : r * 0.07, 0, 0, TAU); g.fillStyle = '#1c1210'; g.fill(); });
    g.beginPath(); g.moveTo(x - r * 0.1, y + r * 0.22); g.quadraticCurveTo(x + r * 0.04, y + r * (hurt ? 0.16 : 0.27), x + r * 0.18, y + r * 0.22); g.lineWidth = 1.3; g.strokeStyle = '#5a2a20'; g.stroke();
    rr(g, x + r * 0.02, y + r * 0.58, r * 0.28, r * 0.34, 3); g.fillStyle = '#ffcf6a'; g.fill(); g.lineWidth = 1.4; g.strokeStyle = '#4a2c14'; g.stroke();
    g.restore();
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.lineWidth = 3; g.strokeStyle = '#d9b46a'; g.stroke(); g.beginPath(); g.arc(x, y, r + 2.5, 0, TAU); g.lineWidth = 1; g.strokeStyle = 'rgba(20,12,8,0.9)'; g.stroke();
  }

  // ---- Status chips: a small round badge with a glyph and the stack count. ----
  function statusGlyph(g, id, x, y, r, color) {
    g.save(); g.translate(x, y); g.fillStyle = '#fff8e8'; g.strokeStyle = '#fff8e8'; g.lineWidth = Math.max(1.2, r * 0.22); g.lineCap = 'round'; g.lineJoin = 'round';
    if (id === 'might') { g.beginPath(); g.moveTo(-r * 0.5, r * 0.3); g.lineTo(0, -r * 0.2); g.lineTo(r * 0.5, r * 0.3); g.moveTo(-r * 0.5, -r * 0.05); g.lineTo(0, -r * 0.55); g.lineTo(r * 0.5, -r * 0.05); g.stroke(); }
    else if (id === 'barbs') { for (var i = 0; i < 3; i++) { var a = -Math.PI / 2 + (i - 1) * 0.9; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.15, Math.sin(a) * r * 0.15 + r * 0.25); g.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7 + r * 0.1); g.stroke(); } }
    else if (id === 'exposed') { g.beginPath(); g.moveTo(-r * 0.45, -r * 0.45); g.lineTo(r * 0.45, -r * 0.45); g.lineTo(r * 0.4, r * 0.1); g.lineTo(0, r * 0.55); g.lineTo(-r * 0.4, r * 0.1); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(r * 0.05, -r * 0.45); g.lineTo(-r * 0.1, -r * 0.05); g.lineTo(r * 0.12, r * 0.15); g.lineTo(0, r * 0.45); g.stroke(); }
    else if (id === 'sapped') { g.beginPath(); g.moveTo(-r * 0.5, -r * 0.3); g.lineTo(0, r * 0.2); g.lineTo(r * 0.5, -r * 0.3); g.stroke(); g.beginPath(); g.arc(0, r * 0.45, r * 0.12, 0, TAU); g.fill(); }
    else if (id === 'burn') { g.beginPath(); g.moveTo(0, -r * 0.62); g.quadraticCurveTo(r * 0.55, -r * 0.05, r * 0.32, r * 0.42); g.quadraticCurveTo(0, r * 0.62, -r * 0.32, r * 0.42); g.quadraticCurveTo(-r * 0.5, 0, 0, -r * 0.62); g.fill(); }
    else { g.beginPath(); g.arc(0, 0, r * 0.32, 0, TAU); g.fill(); }
    g.restore();
  }
  function drawStatusChip(g, id, n, x, y, def, size) {
    var r = size || 7, c = (def && def.color) || '#cccccc';
    g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); var gr = g.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r); gr.addColorStop(0, shade(c, 0.25)); gr.addColorStop(1, shade(c, -0.45)); g.fillStyle = gr; g.fill();
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(12,8,16,0.9)'; g.stroke();
    statusGlyph(g, (def && def.glyph) || id, x, y, r * 0.85, c);
    text(g, n, x + r * 0.75, y + r * 0.95, { size: Math.round(r * 1.05), weight: 900, align: 'center', ow: 2.4 });
    g.restore();
  }

  // ---- Intent tags: a dark glass plate with a coloured rim, one glyph per part of the move, and the numbers. ----
  var INTENT_COLORS = { attack: '#ff5a4f', ward: '#62b6ff', buff: '#ffc95a', debuff: '#c48cff', heal: '#6ee08a', hidden: '#a9a2c0', idle: '#a9a2c0' };
  function intentGlyph(g, k, x, y, r, t) {
    g.save(); g.translate(x, y); var c = INTENT_COLORS[k] || '#ccc';
    if (k === 'attack') {   // a split fang: two curved blades meeting at a point
      for (var s = -1; s <= 1; s += 2) { g.beginPath(); g.moveTo(s * r * 0.15, r * 0.8); g.quadraticCurveTo(s * r * 0.95, r * 0.1, s * r * 0.35, -r * 0.85); g.quadraticCurveTo(s * r * 0.55, r * 0.05, s * r * 0.05, r * 0.45); g.closePath();
        var gr = g.createLinearGradient(0, -r, 0, r); gr.addColorStop(0, '#ffe2d0'); gr.addColorStop(0.5, c); gr.addColorStop(1, shade(c, -0.5)); g.fillStyle = gr; g.fill(); g.lineWidth = 1.1; g.strokeStyle = 'rgba(20,6,6,0.9)'; g.stroke(); }
    } else if (k === 'ward') {
      hexPath(g, 0, 0, r * 0.82); var gw = g.createLinearGradient(0, -r, 0, r); gw.addColorStop(0, '#d6f0ff'); gw.addColorStop(1, shade(c, -0.35)); g.fillStyle = gw; g.fill(); g.lineWidth = 1.1; g.strokeStyle = 'rgba(6,14,26,0.9)'; g.stroke();
      hexPath(g, 0, 0, r * 0.42); g.strokeStyle = 'rgba(255,255,255,0.75)'; g.stroke();
    } else if (k === 'buff') {
      g.lineWidth = r * 0.3; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = c;
      for (var i = 0; i < 2; i++) { var yy = r * 0.45 - i * r * 0.62; g.beginPath(); g.moveTo(-r * 0.62, yy + r * 0.18); g.lineTo(0, yy - r * 0.38); g.lineTo(r * 0.62, yy + r * 0.18); g.stroke(); }
    } else if (k === 'debuff') {
      g.lineWidth = r * 0.24; g.lineCap = 'round'; g.strokeStyle = c; g.beginPath();
      for (var a = 0; a < 11; a++) { var rr2 = r * (0.85 - a * 0.07), an = a * 0.75 + t * 2; g[a ? 'lineTo' : 'moveTo'](Math.cos(an) * rr2, Math.sin(an) * rr2); } g.stroke();
    } else if (k === 'heal') {
      g.beginPath(); g.moveTo(0, -r * 0.85); g.quadraticCurveTo(r * 0.8, 0, r * 0.4, r * 0.55); g.quadraticCurveTo(0, r * 0.9, -r * 0.4, r * 0.55); g.quadraticCurveTo(-r * 0.8, 0, 0, -r * 0.85); g.fillStyle = c; g.fill(); g.lineWidth = 1; g.strokeStyle = 'rgba(6,20,10,0.9)'; g.stroke();
    } else if (k === 'idle') { text(g, 'z', -r * 0.3, r * 0.2, { size: r * 1.1, weight: 900, color: c, align: 'center', ow: 2 }); text(g, 'z', r * 0.35, -r * 0.3, { size: r * 0.8, weight: 900, color: c, align: 'center', ow: 2 }); }
    else { text(g, '?', 0, r * 0.45, { size: r * 1.5, weight: 900, color: c, align: 'center', ow: 2.5 }); }
    g.restore();
  }
  // Returns the tag rect. view = intentView(); x = centre, y = bottom of the tag (its tail tip).
  function drawIntentTag(g, view, x, y, t, o) {
    o = o || {}; if (!view) return null;
    var parts = [], w = 10, gl = 9;
    view.icons.forEach(function (ic) {
      var label = ic.k === 'attack' ? (ic.hits > 1 ? ic.n + '×' + ic.hits : '' + ic.n) : ic.k === 'ward' || ic.k === 'heal' ? '' + ic.n : '';
      var lw = label ? measure(g, label, 12, 900) + 3 : 0; parts.push({ k: ic.k, label: label, w: gl * 2 + lw }); w += gl * 2 + lw + 4;
    });
    w = Math.max(30, w - 4 + 6); var h = 24, bx = x - w / 2, by = y - h - 6, main = view.icons[0].k, col = INTENT_COLORS[main] || '#aaa';
    var bob = Math.sin(t * 3 + x * 0.05) * 1.5; by += bob;
    g.save();
    if (o.focus) { g.save(); g.globalCompositeOperation = 'lighter'; glow(g, x, by + h / 2, w * 0.8, rgba(col, 0.5), 1); g.restore(); }
    g.beginPath(); g.moveTo(bx + 6, by); g.lineTo(bx + w - 6, by); g.quadraticCurveTo(bx + w, by, bx + w, by + 6); g.lineTo(bx + w, by + h - 6); g.quadraticCurveTo(bx + w, by + h, bx + w - 6, by + h);
    g.lineTo(x + 5, by + h); g.lineTo(x, by + h + 5); g.lineTo(x - 5, by + h); g.lineTo(bx + 6, by + h); g.quadraticCurveTo(bx, by + h, bx, by + h - 6); g.lineTo(bx, by + 6); g.quadraticCurveTo(bx, by, bx + 6, by); g.closePath();
    var bg = g.createLinearGradient(0, by, 0, by + h); bg.addColorStop(0, 'rgba(38,30,52,0.94)'); bg.addColorStop(1, 'rgba(14,10,22,0.94)'); g.fillStyle = bg; g.fill();
    g.lineWidth = 1.6; g.strokeStyle = rgba(col, 0.95); g.stroke();
    g.beginPath(); g.moveTo(bx + 5, by + 1.5); g.lineTo(bx + w - 5, by + 1.5); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1; g.stroke();
    var cx = bx + 7;
    parts.forEach(function (p) {
      intentGlyph(g, p.k, cx + gl, by + h / 2, gl, t);
      if (p.label) text(g, p.label, cx + gl * 2 + 2, by + h / 2 + 4.5, { size: 12, weight: 900, color: p.k === 'attack' ? '#fff1ea' : '#eaf6ff', ow: 3 });
      cx += p.w + 4;
    });
    g.restore();
    return { x: bx, y: by, w: w, h: h + 6 };
  }

  // ---- Card art glyphs (used when no illustration is supplied): a painted vignette per art key. ----
  var ART_BG = { blade: '#7a2a32', guard: '#244f72', fire: '#8a3a12', frost: '#2a6a8a', storm: '#3a3a7a', root: '#3d5a24', light: '#8a6a1a', magic: '#55306f', heart: '#7a2a4a', speed: '#2a6a5a', poison: '#3f6a1f', gold: '#7a5a1a' };
  function artGlyph(g, key, x, y, w, h, t) {
    var cx = x + w / 2, cy = y + h * 0.52, r = Math.min(w, h) * 0.34, bgc = ART_BG[key] || '#4a4060';
    var bg = g.createRadialGradient(cx - w * 0.15, y + h * 0.25, 2, cx, cy, Math.max(w, h) * 0.8); bg.addColorStop(0, shade(bgc, 0.25)); bg.addColorStop(0.6, bgc); bg.addColorStop(1, shade(bgc, -0.6)); g.fillStyle = bg; g.fillRect(x, y, w, h);
    g.save(); g.globalAlpha = 0.18; for (var i = 0; i < 5; i++) { g.beginPath(); g.arc(x + hash(i, key.length) * w, y + hash(i + 7, key.length) * h, 2 + hash(i, 3) * r * 0.5, 0, TAU); g.fillStyle = '#ffffff'; g.fill(); } g.restore();
    g.save(); g.globalCompositeOperation = 'lighter'; glow(g, cx, cy, r * 1.6, rgba(shade(bgc, 0.5), 0.5), 1); g.restore();
    g.save(); g.translate(cx, cy); g.lineJoin = 'round'; g.lineCap = 'round';
    var o = function (lw) { g.lineWidth = lw || Math.max(1.2, r * 0.08); g.strokeStyle = 'rgba(14,8,14,0.9)'; g.stroke(); };
    if (key === 'blade') { g.rotate(-0.75); g.beginPath(); g.moveTo(0, -r * 1.1); g.lineTo(r * 0.2, -r * 0.75); g.lineTo(r * 0.16, r * 0.45); g.lineTo(-r * 0.16, r * 0.45); g.lineTo(-r * 0.2, -r * 0.75); g.closePath(); var bl = g.createLinearGradient(-r * 0.2, 0, r * 0.2, 0); bl.addColorStop(0, '#9fb0c4'); bl.addColorStop(0.5, '#ffffff'); bl.addColorStop(1, '#7d8ea3'); g.fillStyle = bl; g.fill(); o();
      g.beginPath(); rr(g, -r * 0.5, r * 0.42, r, r * 0.16, r * 0.06); g.fillStyle = '#d9a84a'; g.fill(); o(); g.beginPath(); rr(g, -r * 0.09, r * 0.58, r * 0.18, r * 0.42, r * 0.05); g.fillStyle = '#5a3a22'; g.fill(); o(); }
    else if (key === 'guard') { g.beginPath(); g.moveTo(0, -r); g.quadraticCurveTo(r * 0.9, -r * 0.85, r * 0.85, -r * 0.2); g.quadraticCurveTo(r * 0.75, r * 0.6, 0, r); g.quadraticCurveTo(-r * 0.75, r * 0.6, -r * 0.85, -r * 0.2); g.quadraticCurveTo(-r * 0.9, -r * 0.85, 0, -r); g.closePath();
      var sg = g.createLinearGradient(0, -r, 0, r); sg.addColorStop(0, '#8fb8d8'); sg.addColorStop(1, '#2c4e74'); g.fillStyle = sg; g.fill(); o(); g.beginPath(); g.moveTo(0, -r * 0.7); g.lineTo(r * 0.45, -r * 0.1); g.lineTo(0, r * 0.65); g.lineTo(-r * 0.45, -r * 0.1); g.closePath(); g.fillStyle = '#e8c870'; g.fill(); o(); }
    else if (key === 'fire') { var f = Math.sin(t * 9) * r * 0.06; g.beginPath(); g.moveTo(0, -r * 1.05 - f); g.bezierCurveTo(r * 0.7, -r * 0.4, r * 0.85, r * 0.3, 0, r * 0.85); g.bezierCurveTo(-r * 0.85, r * 0.3, -r * 0.6, -r * 0.3, -r * 0.2, -r * 0.6); g.quadraticCurveTo(-r * 0.1, -r * 0.2, 0, -r * 1.05 - f); var fg = g.createLinearGradient(0, -r, 0, r); fg.addColorStop(0, '#ffe68a'); fg.addColorStop(0.5, '#ff8a2a'); fg.addColorStop(1, '#c2361e'); g.fillStyle = fg; g.fill(); o();
      g.beginPath(); g.moveTo(0, -r * 0.3); g.bezierCurveTo(r * 0.35, 0, r * 0.35, r * 0.5, 0, r * 0.6); g.bezierCurveTo(-r * 0.35, r * 0.5, -r * 0.3, 0, 0, -r * 0.3); g.fillStyle = '#fff3c4'; g.fill(); }
    else if (key === 'frost') { for (var a = 0; a < 6; a++) { g.save(); g.rotate(a * Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r); g.moveTo(0, -r * 0.55); g.lineTo(r * 0.22, -r * 0.75); g.moveTo(0, -r * 0.55); g.lineTo(-r * 0.22, -r * 0.75); g.lineWidth = r * 0.16; g.strokeStyle = 'rgba(14,30,50,0.9)'; g.stroke(); g.lineWidth = r * 0.08; g.strokeStyle = '#e6f8ff'; g.stroke(); g.restore(); } }
    else if (key === 'storm') { g.beginPath(); g.moveTo(r * 0.15, -r); g.lineTo(-r * 0.45, r * 0.1); g.lineTo(-r * 0.02, r * 0.1); g.lineTo(-r * 0.2, r); g.lineTo(r * 0.5, -r * 0.2); g.lineTo(r * 0.05, -r * 0.2); g.lineTo(r * 0.35, -r); g.closePath(); g.fillStyle = '#fff6b0'; g.fill(); o(); }
    else if (key === 'root') { for (var j = -1; j <= 1; j++) { g.beginPath(); g.moveTo(j * r * 0.2, r); g.bezierCurveTo(j * r * 0.9, r * 0.2, -j * r * 0.5, -r * 0.3, j * r * 0.3, -r); g.lineWidth = r * 0.22; g.strokeStyle = 'rgba(16,10,6,0.9)'; g.stroke(); g.lineWidth = r * 0.13; g.strokeStyle = '#a7804a'; g.stroke(); }
      g.beginPath(); g.ellipse(r * 0.3, -r * 0.95, r * 0.25, r * 0.12, -0.5, 0, TAU); g.fillStyle = '#8fd05a'; g.fill(); o(1); }
    else if (key === 'light') { g.save(); g.globalCompositeOperation = 'lighter'; for (var k = 0; k < 8; k++) { g.save(); g.rotate(k * Math.PI / 4 + t * 0.4); g.beginPath(); g.moveTo(-r * 0.08, 0); g.lineTo(0, -r * 1.1); g.lineTo(r * 0.08, 0); g.fillStyle = 'rgba(255,230,150,0.55)'; g.fill(); g.restore(); } g.restore();
      rr(g, -r * 0.32, -r * 0.45, r * 0.64, r * 0.85, r * 0.12); g.fillStyle = '#ffe9a0'; g.fill(); o(); g.beginPath(); g.moveTo(-r * 0.42, -r * 0.45); g.lineTo(r * 0.42, -r * 0.45); g.moveTo(-r * 0.42, r * 0.4); g.lineTo(r * 0.42, r * 0.4); o(r * 0.14); }
    else if (key === 'magic') { g.beginPath(); for (var p = 0; p < 10; p++) { var rad = p % 2 ? r * 0.42 : r; var an = -Math.PI / 2 + p * Math.PI / 5 + t * 0.3; g.lineTo(Math.cos(an) * rad, Math.sin(an) * rad); } g.closePath(); var mg = g.createRadialGradient(0, 0, 1, 0, 0, r); mg.addColorStop(0, '#ffffff'); mg.addColorStop(1, '#c58cff'); g.fillStyle = mg; g.fill(); o(); }
    else if (key === 'heart') { g.beginPath(); g.moveTo(0, r * 0.85); g.bezierCurveTo(-r * 1.1, 0, -r * 0.6, -r * 0.95, 0, -r * 0.4); g.bezierCurveTo(r * 0.6, -r * 0.95, r * 1.1, 0, 0, r * 0.85); var hg = g.createLinearGradient(0, -r, 0, r); hg.addColorStop(0, '#ff9ab0'); hg.addColorStop(1, '#a8203e'); g.fillStyle = hg; g.fill(); o();
      g.beginPath(); g.moveTo(0, r * 0.85); g.lineTo(0, -r * 0.2); g.moveTo(0, r * 0.2); g.lineTo(r * 0.3, -r * 0.1); g.moveTo(0, r * 0.4); g.lineTo(-r * 0.3, r * 0.1); g.lineWidth = r * 0.07; g.strokeStyle = 'rgba(90,10,30,0.7)'; g.stroke(); }
    else if (key === 'speed') { for (var q = 0; q < 3; q++) { g.beginPath(); g.moveTo(-r * 0.9 + q * r * 0.25, -r * 0.5 + q * r * 0.45); g.quadraticCurveTo(r * 0.2, -r * 0.7 + q * r * 0.45, r * 0.9, -r * 0.3 + q * r * 0.45); g.lineWidth = r * 0.2; g.strokeStyle = 'rgba(10,20,20,0.9)'; g.stroke(); g.lineWidth = r * 0.11; g.strokeStyle = '#c8fff0'; g.stroke(); } }
    else { g.beginPath(); g.moveTo(0, -r); g.lineTo(r * 0.75, -r * 0.2); g.lineTo(0, r); g.lineTo(-r * 0.75, -r * 0.2); g.closePath(); var gg = g.createLinearGradient(0, -r, 0, r); gg.addColorStop(0, '#fff'); gg.addColorStop(1, shade(bgc, 0.2)); g.fillStyle = gg; g.fill(); o(); }
    g.restore();
    var vg = g.createLinearGradient(0, y, 0, y + h); vg.addColorStop(0.6, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = vg; g.fillRect(x, y, w, h);
  }

  // ---- Rich text: [g12] green, [r12] red, [y12] gold, plain words. Wraps into maxW, shrinking from size to minSize. ----
  function richLines(g, s, maxW, size, weight) {
    var words = String(s).split(/\s+/), lines = [], line = [], lw = 0, space = measure(g, ' ', size, weight);
    words.forEach(function (wd) {
      if (!wd) return; var m = /^\[([gry])([^\]]*)\](.*)$/.exec(wd), tok = m ? { t: m[2] + m[3], c: m[1], tail: m[3] } : { t: wd };
      var w = measure(g, m ? m[2] : wd, size, m ? 900 : weight) + (m && m[3] ? measure(g, m[3], size, weight) : 0);
      if (line.length && lw + space + w > maxW) { lines.push({ toks: line, w: lw }); line = []; lw = 0; }
      if (line.length) lw += space; line.push({ tok: tok, m: m, w: w }); lw += w;
    });
    if (line.length) lines.push({ toks: line, w: lw });
    return lines;
  }
  var RICH_COL = { g: '#8ff0a0', r: '#ff8a8a', y: '#ffd76a' };
  function drawRich(g, s, cx, y0, maxW, maxH, size, minSize, color) {
    var sz = size, lines;
    for (; sz >= minSize; sz -= 0.5) { lines = richLines(g, s, maxW, sz, 700); if (lines.length * sz * 1.18 <= maxH && lines.every(function (l) { return l.w <= maxW; })) break; }
    sz = Math.max(sz, minSize); lines = richLines(g, s, maxW, sz, 700);
    var lh = sz * 1.18, y = y0 + (maxH - lines.length * lh) / 2 + sz * 0.92, space = measure(g, ' ', sz, 700);
    lines.forEach(function (l) {
      var x = cx - l.w / 2;
      l.toks.forEach(function (tk, i) {
        if (i) x += space;
        if (tk.m) { var a = tk.m[2]; text(g, a, x, y, { size: sz, weight: 900, color: RICH_COL[tk.m[1]], ow: 0 }); var aw = measure(g, a, sz, 900); if (tk.m[3]) text(g, tk.m[3], x + aw, y, { size: sz, weight: 700, color: color, ow: 0 }); }
        else text(g, tk.tok.t, x, y, { size: sz, weight: 700, color: color, ow: 0 });
        x += tk.w;
      });
      y += lh;
    });
    return sz;
  }

  // ---- The card frame. card = {id, name, cost, type, rarity, art, text (rich)}; (x, y) = top-left, w = width (height 1.5 w).
  // opts: {playable, dim, selected, glow, costNow, t, drawArt(ctx, key, rect, card) -> true when it drew an illustration}.
  var TYPE_COL = { attack: ['#6a2230', '#2a0d16', '#ff9a8a'], skill: ['#1d4d58', '#0b2128', '#9ae6f0'], charm: ['#5a3f16', '#24180a', '#ffd88a'] };
  var RAR_COL = { common: '#c9b68e', rare: '#79c8ff', epic: '#e7a6ff', legendary: '#ffcf5a' };
  function drawCardFrame(g, card, x, y, w, o) {
    o = o || {}; var u = w / 100, h = w * 1.5, tc = TYPE_COL[card.type] || TYPE_COL.skill, rc = RAR_COL[card.rarity] || RAR_COL.common, t = o.t || 0;
    g.save();
    g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 10 * u; g.shadowOffsetY = 5 * u; rr(g, x, y, w, h, 8 * u); g.fillStyle = '#0c0810'; g.fill(); g.restore();
    if (o.glow) { g.save(); g.globalCompositeOperation = 'lighter'; rr(g, x - 2 * u, y - 2 * u, w + 4 * u, h + 4 * u, 9 * u); g.lineWidth = 4 * u; g.strokeStyle = rgba(o.glowColor || '#ffd27a', 0.35 + 0.25 * Math.sin(t * 5)); g.stroke(); g.restore(); }
    rr(g, x, y, w, h, 8 * u); var bg = g.createLinearGradient(x, y, x + w * 0.3, y + h); bg.addColorStop(0, tc[0]); bg.addColorStop(1, tc[1]); g.fillStyle = bg; g.fill();
    g.save(); rr(g, x, y, w, h, 8 * u); g.clip(); g.globalAlpha = 0.08; for (var i = 0; i < 14; i++) { g.beginPath(); g.moveTo(x + i * 9 * u, y); g.lineTo(x + i * 9 * u - h * 0.4, y + h); g.lineWidth = 2 * u; g.strokeStyle = '#ffffff'; g.stroke(); } g.restore();
    rr(g, x + 0.8 * u, y + 0.8 * u, w - 1.6 * u, h - 1.6 * u, 7.5 * u); g.lineWidth = 2.6 * u; var rg = g.createLinearGradient(x, y, x + w, y + h); rg.addColorStop(0, shade(rc, 0.35)); rg.addColorStop(0.5, rc); rg.addColorStop(1, shade(rc, -0.4)); g.strokeStyle = rg; g.stroke();
    rr(g, x + 3.5 * u, y + 3.5 * u, w - 7 * u, h - 7 * u, 5.5 * u); g.lineWidth = 0.8 * u; g.strokeStyle = 'rgba(255,255,255,0.14)'; g.stroke();
    var ax = x + 8 * u, ay = y + 21 * u, aw = 84 * u, ah = 58 * u;
    g.save(); rr(g, ax, ay, aw, ah, 5 * u); g.clip();
    var drew = false; if (typeof o.drawArt === 'function') { try { drew = !!o.drawArt(g, card.art || card.id, { x: ax, y: ay, w: aw, h: ah }, card); } catch (e) { drew = false; } }
    if (!drew) artGlyph(g, card.art || 'gem', ax, ay, aw, ah, t);
    g.restore();
    rr(g, ax, ay, aw, ah, 5 * u); g.lineWidth = 1.6 * u; g.strokeStyle = 'rgba(10,6,12,0.95)'; g.stroke(); rr(g, ax - 1.2 * u, ay - 1.2 * u, aw + 2.4 * u, ah + 2.4 * u, 6 * u); g.lineWidth = 0.9 * u; g.strokeStyle = rgba(rc, 0.7); g.stroke();
    var nm = card.name || card.id, ns = 10.5 * u; while (ns > 7 * u && measure(g, nm, ns, 900) > 66 * u) ns -= 0.5 * u;
    text(g, nm, x + 56 * u, y + 15.5 * u, { size: ns, weight: 900, align: 'center', color: '#fff6e4', ow: 2.6 * u });
    var tl = (card.type || 'skill').toUpperCase(), tw = measure(g, tl, 6 * u, 900) + 12 * u;
    rr(g, x + w / 2 - tw / 2, y + 76 * u, tw, 10 * u, 5 * u); g.fillStyle = shade(tc[0], -0.35); g.fill(); g.lineWidth = 0.9 * u; g.strokeStyle = rgba(rc, 0.85); g.stroke();
    text(g, tl, x + w / 2, y + 83.3 * u, { size: 6 * u, weight: 900, align: 'center', color: tc[2], ow: 0, ls: 0.6 * u });
    rr(g, x + 7 * u, y + 89 * u, w - 14 * u, h - 97 * u, 4 * u); g.fillStyle = 'rgba(8,5,12,0.45)'; g.fill();
    drawRich(g, card.text || '', x + w / 2, y + 90 * u, w - 20 * u, h - 100 * u, 8.6 * u, 6 * u, '#f1e9da');
    var cx = x + 7 * u, cy = y + 8 * u, cr = 11 * u, cost = o.costNow != null ? o.costNow : card.cost;
    g.save(); g.globalCompositeOperation = 'lighter'; glow(g, cx, cy, cr * 1.8, o.playable === false ? 'rgba(120,120,140,0.3)' : 'rgba(255,190,90,0.55)', 1); g.restore();
    g.beginPath(); g.moveTo(cx, cy - cr * 1.15); g.quadraticCurveTo(cx + cr * 1.05, cy - cr * 0.1, cx + cr * 0.72, cy + cr * 0.55); g.quadraticCurveTo(cx, cy + cr * 1.15, cx - cr * 0.72, cy + cr * 0.55); g.quadraticCurveTo(cx - cr * 1.05, cy - cr * 0.1, cx, cy - cr * 1.15); g.closePath();
    var cg = g.createRadialGradient(cx - cr * 0.3, cy - cr * 0.4, 1, cx, cy, cr * 1.2);
    if (o.playable === false) { cg.addColorStop(0, '#a8a2b8'); cg.addColorStop(1, '#3c3848'); } else { cg.addColorStop(0, '#fff2b0'); cg.addColorStop(0.5, '#ffb547'); cg.addColorStop(1, '#a8501a'); }
    g.fillStyle = cg; g.fill(); g.lineWidth = 1.6 * u; g.strokeStyle = 'rgba(30,12,4,0.95)'; g.stroke();
    text(g, cost, cx, cy + 5.2 * u, { size: 14 * u, weight: 900, align: 'center', color: o.playable === false ? '#ffb0b0' : '#fffaf0', ow: 3 * u });
    if (card.rarity && card.rarity !== 'common') { g.save(); g.translate(x + w / 2, y + h - 3.2 * u); g.rotate(Math.PI / 4); g.fillStyle = rc; g.fillRect(-2.6 * u, -2.6 * u, 5.2 * u, 5.2 * u); g.lineWidth = 0.8 * u; g.strokeStyle = 'rgba(10,6,12,0.9)'; g.strokeRect(-2.6 * u, -2.6 * u, 5.2 * u, 5.2 * u); g.restore(); }
    if (o.dim) { rr(g, x, y, w, h, 8 * u); g.fillStyle = 'rgba(8,6,14,' + clamp(o.dim, 0, 1) * 0.55 + ')'; g.fill(); }
    if (o.selected) { rr(g, x - 1.5 * u, y - 1.5 * u, w + 3 * u, h + 3 * u, 9 * u); g.lineWidth = 2 * u; g.strokeStyle = 'rgba(255,240,200,' + (0.7 + 0.3 * Math.sin(t * 6)) + ')'; g.stroke(); }
    g.restore();
    return { x: x, y: y, w: w, h: h };
  }
  function drawCardBack(g, x, y, w, t) {
    var u = w / 100, h = w * 1.5;
    g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 6 * u; g.shadowOffsetY = 3 * u;
    rr(g, x, y, w, h, 8 * u); var bg = g.createLinearGradient(x, y, x + w, y + h); bg.addColorStop(0, '#2e2550'); bg.addColorStop(1, '#120d24'); g.fillStyle = bg; g.fill(); g.restore();
    rr(g, x + 1 * u, y + 1 * u, w - 2 * u, h - 2 * u, 7.5 * u); g.lineWidth = 2.6 * u; g.strokeStyle = '#b89a5a'; g.stroke();
    rr(g, x + 8 * u, y + 8 * u, w - 16 * u, h - 16 * u, 5 * u); g.lineWidth = 1.2 * u; g.strokeStyle = 'rgba(216,186,120,0.55)'; g.stroke();
    var cx = x + w / 2, cy = y + h / 2;
    g.save(); g.globalCompositeOperation = 'lighter'; glow(g, cx, cy, 34 * u, 'rgba(255,190,90,0.4)', 1); g.restore();
    g.beginPath(); for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4, rad = i % 2 ? 9 * u : 22 * u; g.lineTo(cx + Math.cos(a - Math.PI / 2) * rad, cy + Math.sin(a - Math.PI / 2) * rad); } g.closePath(); g.fillStyle = '#d9b46a'; g.fill(); g.lineWidth = 1 * u; g.strokeStyle = '#2a1a10'; g.stroke();
    g.beginPath(); g.arc(cx, cy, 6 * u, 0, TAU); g.fillStyle = '#fff1c0'; g.fill();
  }
  function drawWardBadge(g, x, y, n, r) {
    r = r || 10; hexPath(g, x, y, r); var gr = g.createLinearGradient(0, y - r, 0, y + r); gr.addColorStop(0, '#bfe6ff'); gr.addColorStop(1, '#2f6aa8'); g.fillStyle = gr; g.fill(); g.lineWidth = 1.4; g.strokeStyle = 'rgba(6,14,28,0.95)'; g.stroke();
    text(g, n, x, y + r * 0.42, { size: Math.round(r * 1.1), weight: 900, align: 'center', color: '#ffffff', ow: 2.6, oc: '#0a1a30' });
  }
  function drawBar(g, x, y, w, h, frac, ghost, col, ward) {
    rr(g, x - 1, y - 1, w + 2, h + 2, (h + 2) / 2); g.fillStyle = 'rgba(8,4,10,0.92)'; g.fill();
    if (ghost > frac) { rr(g, x, y, Math.max(h, w * ghost), h, h / 2); g.fillStyle = 'rgba(255,240,210,0.75)'; g.fill(); }
    if (frac > 0) { rr(g, x, y, Math.max(h, w * frac), h, h / 2); var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, shade(col, 0.35)); gr.addColorStop(1, shade(col, -0.25)); g.fillStyle = gr; g.fill(); }
    if (ward) { rr(g, x - 1, y - 1, w + 2, h + 2, (h + 2) / 2); g.lineWidth = 1.6; g.strokeStyle = '#8fd0ff'; g.stroke(); }
    g.beginPath(); g.moveTo(x + h / 2, y + 1.2); g.lineTo(x + w * Math.max(frac, 0) - h / 2, y + 1.2); g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.stroke();
  }
