/* K-04 belt-depth demo: "Lantern Row", a dusk street brawl drawn at 256x144 (pixel art in code, pixel-kit fighters).
 * The simulation is deterministic from the step count; the module GameDNA_BeltDepth owns depth (z), reach, shadows,
 * the draw order and the floor band. ASCII only. */
(function (root) {
  'use strict';
  var BD = root.GameDNA_BeltDepth, PXS = root.GameDNA_PixelScene;
  var W = 256, H = 144, FLOOR = 92, DEPTH = 40, WORLD_W = 900, STEP_MS = 1000 / 60;

  /* ---------------- cast (pixel-kit fighters, every side painted, never mirrored) ---------------- */
  var CAST = {
    hero: { name: 'WREN', o: { pal: { h: '#3a2216', H: '#5e3a24', x: '#1e100a', t: '#e8b030', T: '#ffd860', u: '#9a6a10', b: '#2a8a8a', B: '#5ac8c0', d: '#1a5a62' }, head: 'band', gear: 'sword' }, hp: 100, reach: 25, dmg: 12 },
    raider: { name: 'RAIDER', o: { pal: { h: '#a8b4d0', H: '#d0d8ec', x: '#58607e', b: '#8a4a2a', B: '#c07a4a', d: '#5a2e18', r: '#e0b040' }, head: 'helm', gear: 'axe', shield: ['#8a6a40', '#c09a60', '#5a4020'] }, hp: 24, reach: 24, dmg: 9 },
    brute: { name: 'BRUTE', o: { pal: { h: '#6a3420', H: '#94502e', x: '#3a1a0e', b: '#6a2a4a', B: '#a04a72', d: '#401830', p: '#3a3040', P: '#28202e' }, head: 'hair', gear: 'club', beard: true }, hp: 36, reach: 25, dmg: 12 },
    lancer: { name: 'LANCER', o: { pal: { h: '#3a5a34', H: '#5a8a4c', x: '#20341e', b: '#4a5a7a', B: '#7a8cb4', d: '#2c3650', r: '#e04848' }, head: 'hood', gear: 'spear' }, hp: 24, reach: 31, dmg: 9 }
  };

  /* ---------------- frames: real poses from fighterPose + walk / crouch / tuck / breathe derived from the stance ---------------- */
  var FC = {};
  function derive(o, side, kind, ph) {
    var key = JSON.stringify(o) + side + kind + ph; if (FC[key]) return FC[key];
    var base = PXS.fighterPose(o, 'ready', side), Wd = 48, Hd = 48;
    var src = base.getContext('2d').getImageData(0, 0, Wd, Hd), out = new ImageData(Wd, Hd), s = src.data, d = out.data;
    var put = function (x, y, i) { if (x < 0 || y < 0 || x >= Wd || y >= Hd) return; var q = (y * Wd + x) * 4; if (d[q + 3] && s[i + 3] && d[q] === 26 && d[q + 1] === 16) { d[q] = s[i]; d[q + 1] = s[i + 1]; d[q + 2] = s[i + 2]; d[q + 3] = 255; return; } if (d[q + 3]) return; d[q] = s[i]; d[q + 1] = s[i + 1]; d[q + 2] = s[i + 2]; d[q + 3] = s[i + 3]; };
    var split = side === 'right' ? 25.5 : 21.5, front = side === 'right' ? 1 : -1;
    for (var y = 0; y < Hd; y++) for (var x = 0; x < Wd; x++) {
      var i = (y * Wd + x) * 4; if (!s[i + 3]) continue;
      var nx = x, ny = y, isFront = (x - split) * front > 0;
      if (kind === 'walk') {
        if (y >= 40) { var k = (y - 39) / 8, amp = ph === 0 ? 2.4 : ph === 2 ? -2.4 : 0; nx = x + Math.round((isFront ? amp : -amp) * k * front); if (((ph === 1 && isFront) || (ph === 3 && !isFront)) && y >= 44) ny = y - 1; }
      } else if (kind === 'crouch') { if (y < 39) ny = y + 4; else if (y < 43) continue; }
      else if (kind === 'tuck') {
        if (y >= 41 && y < 46) continue;
        if (y >= 46) { ny = y - 5; if (isFront) nx = x + 2 * front; } else if (y >= 39) { if (isFront) nx = x + (y - 38) * front; }
      } else if (kind === 'breathe') { if (y < 37) ny = y + 1; }
      else if (kind === 'hurt') { if (y < 39) { nx = x - 2 * front; if (y < 30) ny = y + 1; } }
      put(nx, ny, i);
    }
    var c = document.createElement('canvas'); c.width = Wd; c.height = Hd; c.getContext('2d').putImageData(out, 0, 0);
    c.footX = base.footX; c.footY = base.footY;
    return (FC[key] = c);
  }
  var TINT = {}, TN = 0;
  // hit flash: a solid white silhouette (offscreen layer, source-atop), shown for 3 steps
  function flashed(c) {
    var key = c.__id || (c.__id = 'c' + (++TN)); if (TINT[key]) return TINT[key];
    var d = blank(c.width, c.height), g = d.getContext('2d'); g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, d.width, d.height);
    g.globalCompositeOperation = 'source-over'; outline(d);   // keep the shape: a 1 px dark rim round the white
    d.footX = c.footX; d.footY = c.footY; return (TINT[key] = d);
  }
  var FBASE = { s: '#eab58c', S: '#c48a64', e: '#1a1220', k: '#3a2618', K: '#6a4a30', p: '#4a3a2e', P: '#33281f', g: '#e8c060' }, OLN = '#1a1024';
  function palOf(o) { var P = {}, k; for (k in FBASE) P[k] = FBASE[k]; for (k in (o.pal || {})) P[k] = o.pal[k]; return P; }
  function blank(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  // 1 px outline around the opaque pixels of one layer (drawn on transparent pixels only)
  function outline(c) {
    var g = c.getContext('2d'), W = c.width, H = c.height, im = g.getImageData(0, 0, W, H), d = im.data, add = [];
    var op = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 0; };
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (!op(x, y) && (op(x + 1, y) || op(x - 1, y) || op(x, y + 1) || op(x, y - 1))) add.push([x, y]);
    g.fillStyle = OLN; add.forEach(function (q) { g.fillRect(q[0], q[1], 1, 1); }); return c;
  }
  var PADX = 16;
  // every frame lives on a 72 x 48 canvas (12 px spare at each side), so no weapon is ever cut off at the frame edge
  function padded(c) { var d = blank(48 + PADX * 2, 48); d.getContext('2d').drawImage(c, PADX, 0); d.footX = c.footX + PADX; d.footY = c.footY; return d; }
  // a weapon drawn along a direction from the grip (art px, left-facing art coords; dx < 0 points forward)
  function weapon(put, gear, gx, gy, dx, dy) {
    var n = Math.sqrt(dx * dx + dy * dy); dx /= n; dy /= n; var px = -dy, py = dx;   // perpendicular (toward the top for a level weapon)
    if (py > 0) { px = -px; py = -py; }
    var at = function (t, o, col) { put(Math.round(gx + dx * t + px * o), Math.round(gy + dy * t + py * o), col); }, t;
    if (gear === 'sword') {
      for (t = -3; t <= 3; t++) at(0.5, t, '#d8a030');
      for (t = -2; t < 0; t++) { at(t, 0, '#6a4422'); at(t, -1, '#6a4422'); }
      for (t = 1; t <= 15; t++) { at(t, 0, '#ffffff'); at(t, -1, '#c8d0e0'); }
      at(16, 0, '#ffffff');
    } else if (gear === 'axe') {
      for (t = -3; t <= 14; t++) { at(t, 0, '#8a5a30'); at(t, -1, '#5a3418'); }
      for (t = 10; t <= 14; t++) for (var o = -6; o <= 5; o++) { var edge = t === 14 || (t === 13 && Math.abs(o) > 4); if (Math.abs(o) > 3 + (t - 10)) continue; at(t, o, edge ? '#ffffff' : o > 0 ? '#d8e0ea' : '#8a94a4'); }
    } else if (gear === 'club') {
      for (t = -3; t <= 4; t++) { at(t, 0, '#8a5a30'); at(t, -1, '#5a3418'); }
      for (t = 5; t <= 15; t++) for (o = -3; o <= 2; o++) at(t, o, o >= 2 ? '#c08a52' : o <= -3 ? '#5a3418' : '#8a5a32');
      at(8, 1, '#e8e0c8'); at(12, -1, '#e8e0c8'); at(10, -2, '#e8e0c8');
    } else {
      for (t = -6; t <= 13; t++) at(t, 0, '#7a5030');
      for (t = 14; t <= 19; t++) { var w = Math.min(2, t - 13) - (t >= 18 ? 1 : 0); for (o = -w; o <= w; o++) at(t, o, o > 0 ? '#ffffff' : '#c8d4e0'); }
      at(20, 0, '#ffffff'); at(13, -1, '#e04848'); at(12, -2, '#e04848'); at(13, -2, '#a82830');
    }
  }
  // strike frames painted in code (fighterPose's own swing runs off its canvas):
  //   'swing'  torso leaning into the blow, arm stretched forward, weapon level
  //   'follow' arm swept down past the body, weapon angled down behind the stroke
  //   'air'    the jump-attack frame: knees tucked, weapon driven down-forward at about 40 degrees
  function strikeFrame(kind, side, mode) {
    var o = CAST[kind].o, P = palOf(o), R = side === 'right', bo = {}, k;
    for (k in o) if (k !== 'gear') bo[k] = o[k];
    var src = mode === 'air' ? derive(bo, side, 'tuck', 0) : PXS.fighterPose(bo, 'swing', side);
    var base = padded(src), g0 = base.getContext('2d');
    var lean = mode === 'swing' ? 2 : 0;
    if (lean) { var im = g0.getImageData(0, 0, base.width, 40), sh = blank(base.width, 40); sh.getContext('2d').putImageData(im, 0, 0); g0.clearRect(0, 0, base.width, 40); g0.drawImage(sh, R ? lean : -lean, 0); }
    var X = function (x) { return R ? PADX + 12 + 23 - x : PADX + 12 + x; }, Y = function (y) { return 16 + y; };
    for (var y = 17; y <= 22; y++) for (var x = -3; x <= 5; x++) g0.clearRect(X(x - lean), Y(y), 1, 1);   // the resting front arm
    var L = blank(base.width, 48), g = L.getContext('2d'), put = function (xx, yy, col) { if (yy < -16 || yy > 31) return; g.fillStyle = col; g.fillRect(X(xx), Y(yy), 1, 1); };
    var shx = 7 - lean, shy = 16, hx, hy, dx, dy;
    if (mode === 'swing') { hx = -2 - lean; hy = 16; dx = -1; dy = -0.05; }
    else if (mode === 'follow') { hx = 1; hy = 22; dx = -0.75; dy = 0.66; }
    else { hx = 0; hy = 19; dx = -0.72; dy = 0.7; }
    var n = Math.max(Math.abs(hx - shx), Math.abs(hy - shy));
    for (var i = 0; i <= n; i++) { var ax = Math.round(shx + (hx - shx) * i / n), ay = Math.round(shy + (hy - shy) * i / n); put(ax, ay, R ? P.d : P.B); put(ax, ay + 1, R ? P.B : P.d); }
    weapon(put, o.gear, hx - 1, hy + 0.5, dx, dy);
    put(hx, hy, P.s); put(hx - 1, hy, P.s); put(hx, hy + 1, P.S); put(hx - 1, hy + 1, P.S);
    outline(L);
    var out = blank(base.width, 48), go = out.getContext('2d');
    if (R) { go.drawImage(L, 0, 0); go.drawImage(base, 0, 0); } else { go.drawImage(base, 0, 0); go.drawImage(L, 0, 0); }
    out.footX = base.footX; out.footY = base.footY; return out;
  }
  // knocked down: lying on the back, head toward the side it was knocked to, arms out, boots up, headgear on, weapon dropped beside
  function lyingFrame(kind, side) {
    var o = CAST[kind].o, P = palOf(o), W = 48, H = 16, L = blank(W, H), g = L.getContext('2d'), R = side === 'right';
    var OX = 8, put = function (x, y, col) { g.fillStyle = col; g.fillRect(R ? W - 1 - (x + OX) : x + OX, y + 3, 1, 1); }, x, y;
    // the weapon on the ground, behind the body (drawn first, the far hand still touches the grip)
    if (o.gear) weapon(function (xx, yy, col) { if (yy <= 11) put(xx, yy, col); }, o.gear, 22, 10, -1, 0.0);
    // boots, toes up
    for (y = 4; y <= 9; y++) for (x = 0; x <= 2; x++) put(x, y, y === 4 || x === 0 ? P.K : P.k);
    put(1, 3, P.k); put(2, 3, P.k);
    // legs: the near leg bent at the knee, the far leg flat
    for (x = 3; x <= 11; x++) { put(x, 8, P.P); put(x, 9, P.P); }
    for (x = 3; x <= 11; x++) { var ky = x < 7 ? 6 + (7 - x) * 0 : x < 9 ? 5 : 6; put(x, ky, P.p); put(x, ky + 1, P.p); }
    put(7, 4, P.p); put(8, 4, P.p);
    for (y = 4; y <= 9; y++) { put(12, y, P.g); put(13, y, P.g); }
    // torso
    for (x = 14; x <= 21; x++) for (y = 3; y <= 9; y++) put(x, y, y <= 4 ? P.B : y <= 7 ? P.b : P.d);
    if (o.shield) { var sh = o.shield; for (x = 15; x <= 20; x++) for (y = 1; y <= 5; y++) put(x, y, y === 1 || x === 15 ? sh[1] : x >= 19 ? sh[2] : sh[0]); put(17, 3, P.g); put(18, 3, P.g); }
    // near arm flung out over the head side, far arm reaching to the dropped weapon
    for (x = 17; x <= 21; x++) put(x, 2, P.B); put(22, 1, P.s); put(23, 1, P.s); put(22, 2, P.S); put(23, 0, P.s);
    for (y = 10; y <= 11; y++) { put(21, y, P.d); put(22, y, P.s); }
    for (y = 5; y <= 8; y++) put(22, y, P.S);
    // head in profile, face up
    for (x = 23; x <= 30; x++) for (y = 2; y <= 10; y++) {
      var ex = x - 26.5, ey = y - 6; if (ex * ex / 13 + ey * ey / 16 > 1) continue;
      put(x, y, x >= 29 || y >= 9 ? (y >= 9 ? P.x : P.h) : P.s);
    }
    put(25, 5, P.e); put(26, 5, P.e); put(25, 1, P.s); put(24, 7, P.S); put(25, 8, P.S);
    if (o.head === 'band') { for (y = 3; y <= 9; y++) put(28, y, y < 5 ? P.T : P.t); put(31, 8, P.t); put(32, 9, P.t); put(32, 8, P.u); }
    else if (o.head === 'helm') { for (y = 2; y <= 10; y++) for (x = 27; x <= 31; x++) { var hx2 = x - 26.5, hy2 = y - 6; if (hx2 * hx2 / 20 + hy2 * hy2 / 20 > 1) continue; put(x, y, x === 27 ? P.H : y < 4 ? P.H : P.h); } put(32, 5, P.r || '#e0b040'); put(32, 6, P.r || '#e0b040'); put(33, 6, P.r || '#e0b040'); }
    else if (o.head === 'hood') { for (y = 1; y <= 10; y++) for (x = 26; x <= 32; x++) { var qx = x - 27.5, qy = y - 6; if (qx * qx / 26 + qy * qy / 24 > 1 || (x < 28 && y > 2 && y < 9)) continue; put(x, y, y < 3 ? P.H : x > 30 ? P.x : P.h); } }
    if (o.beard) { for (y = 2; y <= 6; y++) put(23, y, P.x); put(24, 2, P.x); put(24, 3, P.x); }
    outline(L);
    var out = blank(W, H + 1); out.getContext('2d').drawImage(L, 0, 0); out.footX = R ? W - 1 - (OX + 13) : OX + 13; out.footY = H + 1; return out;
  }
  var LF = {};
  function frameFor(kind, poseName, side) {
    var o = CAST[kind].o, key = kind + poseName + side;
    if (LF[key]) return LF[key];
    var c;
    if (/^walk[0-3]$/.test(poseName)) c = padded(derive(o, side, 'walk', +poseName.slice(4)));
    else if (poseName === 'crouch' || poseName === 'tuck' || poseName === 'breathe' || poseName === 'hurt') c = padded(derive(o, side, poseName, 0));
    else if (poseName === 'swing' || poseName === 'follow' || poseName === 'air') c = strikeFrame(kind, side, poseName);
    else if (poseName === 'down') c = lyingFrame(kind, side);
    else c = padded(PXS.fighterPose(o, poseName, side));
    return (LF[key] = c);
  }

  /* ---------------- 5x7 pixel font ---------------- */
  var FONT = {
    'A': [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11], 'B': [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e], 'C': [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e], 'D': [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e], 'E': [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f], 'F': [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
    'G': [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f], 'H': [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11], 'I': [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e], 'J': [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c], 'K': [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11], 'L': [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
    'M': [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11], 'N': [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11], 'O': [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e], 'P': [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10], 'Q': [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d], 'R': [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
    'S': [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e], 'T': [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04], 'U': [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e], 'V': [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04], 'W': [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11], 'X': [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
    'Y': [0x11, 0x11, 0x11, 0x0a, 0x04, 0x04, 0x04], 'Z': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f], '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e], '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e], '2': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f], '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
    '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02], '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e], '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e], '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08], '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e], '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
    '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04], '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c], '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00], '+': [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00], '/': [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10], '\'': [0x04, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00]
  };
  FONT[' '] = [0, 0, 0, 0, 0, 0, 0];
  function textW(s, k) { return String(s).length * 6 * k - k; }
  function pText(g, s, x, y, k, col, sh) {
    s = String(s).toUpperCase(); x = Math.round(x); y = Math.round(y);
    for (var pass = sh ? 0 : 1; pass < 2; pass++) {
      g.fillStyle = pass ? col : sh;
      for (var i = 0; i < s.length; i++) { var gl = FONT[s[i]] || FONT[' ']; for (var r = 0; r < 7; r++) for (var c = 0; c < 5; c++) if (gl[r] & (16 >> c)) { if (pass) g.fillRect(x + (i * 6 + c) * k, y + r * k, k, k); else for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) if (ox || oy) g.fillRect(x + (i * 6 + c) * k + ox * k, y + r * k + oy * k, k, k); } }
    }
  }

  /* ---------------- backdrop: lantern-lit market street at dusk ---------------- */
  function hsh(x, y, s) { return PXS.hash(x, y, s); }
  var LAYERS = null;
  function buildLayers() {
    var sky = document.createElement('canvas'); sky.width = W; sky.height = FLOOR + 2; var g = sky.getContext('2d');
    var bands = ['#1c1430', '#26183c', '#341e48', '#46264e', '#5e3052', '#7c3c52', '#a04e50', '#c46a52', '#e0905a'];
    for (var y = 0; y < sky.height; y++) { var t = y / 78, k = Math.min(bands.length - 1, Math.floor(t * bands.length + ((y % 9) > 6 && hsh(1, y, 3) < 0.6 ? 1 : 0))); g.fillStyle = bands[k]; g.fillRect(0, y, W, 1); }
    for (var i = 0; i < 26; i++) { var sx = Math.floor(hsh(i, 1, 9) * W), sy = Math.floor(hsh(i, 2, 9) * 34); g.fillStyle = i % 4 ? '#8a7aa8' : '#e8e0ff'; g.fillRect(sx, sy, 1, 1); }
    // moon low in the sky
    for (var yy = -9; yy <= 9; yy++) for (var xx = -9; xx <= 9; xx++) { var r2 = xx * xx + yy * yy; if (r2 > 81) continue; var inner = (xx - 3) * (xx - 3) + (yy + 2) * (yy + 2) < 50; g.fillStyle = inner ? '#fff2c8' : '#e8c890'; g.fillRect(196 + xx, 24 + yy, 1, 1); }
    // far hills (parallax 0.15) and castle silhouettes (0.3), drawn wide
    var far = document.createElement('canvas'); far.width = 520; far.height = 70; var gf = far.getContext('2d');
    for (var x = 0; x < far.width; x++) { var top = Math.round(30 - PXS.noise(x, 0, 52, 4) * 24 - PXS.noise(x, 5, 14, 6) * 6); gf.fillStyle = '#3a2448'; gf.fillRect(x, top, 1, 70 - top); gf.fillStyle = '#54325a'; gf.fillRect(x, top, 1, 1); }
    var mid = document.createElement('canvas'); mid.width = 700; mid.height = 80; var gm = mid.getContext('2d');
    for (x = 0; x < mid.width; x++) { var tp = Math.round(50 - PXS.noise(x, 9, 30, 12) * 14); gm.fillStyle = '#2a1a36'; gm.fillRect(x, tp, 1, 80 - tp); }
    [[60, 22, 9], [150, 30, 7], [300, 14, 11], [420, 26, 8], [560, 18, 10], [640, 30, 6]].forEach(function (tw) {
      var x0 = tw[0], hgt = 80 - tw[1], wd = tw[2];
      gm.fillStyle = '#24162e'; gm.fillRect(x0, tw[1], wd, hgt);
      for (var q = 0; q <= wd; q++) { var ry = tw[1] - Math.round((wd / 2 - Math.abs(q - wd / 2)) * 1.4); gm.fillRect(x0 + q, ry, 1, tw[1] - ry); }
      gm.fillStyle = '#ffc860'; gm.fillRect(x0 + (wd >> 1), tw[1] + 6, 1, 2); if (wd > 8) gm.fillRect(x0 + 2, tw[1] + 14, 1, 2);
    });
    LAYERS = { sky: sky, far: far, mid: mid, street: buildStreet() };
  }
  // the house row along the back edge of the street (scrolls with the world)
  function buildStreet() {
    var c = document.createElement('canvas'); c.width = WORLD_W; c.height = FLOOR + 2; var g = c.getContext('2d');
    var roofs = ['red', 'slate', 'blue', 'thatch', 'green'], walls = ['plaster', 'timber', 'stone', 'plaster', 'timber'];
    var x = -10, n = 0;
    while (x < WORLD_W) {
      var w = 52 + Math.floor(hsh(n, 1, 21) * 4) * 8, wallH = 26 + Math.floor(hsh(n, 2, 21) * 3) * 4, roofH = 18 + Math.floor(hsh(n, 3, 21) * 3) * 3;
      var p = PXS.prop('house', { w: w, wallH: wallH, roofH: roofH, roof: roofs[n % roofs.length], wall: walls[(n * 3) % walls.length], lit: n % 3 !== 1, chimney: n % 2 === 0, boxes: n % 2 === 1 });
      g.drawImage(p.frames[0], x, FLOOR + 1 - (p.frames[0].height - 2));
      x += w - 2; n++;
      if (n % 3 === 0) x += 22;     // alleys between some houses
    }
    // alley shade at the gaps is the sky showing through: darken the lower part
    return c;
  }
  var DECOR = [];
  (function () {
    var k = ['barrel', 'crate', 'sack', 'barrel', 'pot', 'crate', 'hay', 'bench', 'stall', 'sign'];
    for (var i = 0; i < 22; i++) { var x = 30 + i * 41 + Math.floor(hsh(i, 4, 33) * 16); DECOR.push({ k: k[i % k.length], x: x, v: i % 3 }); }
  })();
  var LANTERNS = [70, 210, 350, 490, 630, 770];
  function lantern(g, x, cam, t) {
    var sx = Math.round(x - cam); if (sx < -40 || sx > W + 40) return;
    var fl = Math.floor(t / 110 + x) % 3;
    PXS.glow(g, sx, FLOOR - 33, 24 + fl, '#ffb04a', 0.85);
    g.fillStyle = '#1a1024'; g.fillRect(sx - 1, FLOOR - 32, 3, 34); g.fillStyle = '#3a2a3a'; g.fillRect(sx, FLOOR - 31, 1, 32);
    g.fillStyle = '#1a1024'; g.fillRect(sx - 3, FLOOR - 38, 7, 7); g.fillStyle = fl === 1 ? '#ffe090' : '#ffd070'; g.fillRect(sx - 2, FLOOR - 37, 5, 5); g.fillStyle = '#fff6c8'; g.fillRect(sx - 1, FLOOR - 36, 2, 2);
    g.fillStyle = '#1a1024'; g.fillRect(sx - 3, FLOOR - 39, 7, 1); g.fillRect(sx - 1, FLOOR - 40, 3, 1); g.fillRect(sx - 2, FLOOR + 1, 5, 1);
  }
  function drawBackdrop(g, cam, tMs) {
    if (!LAYERS) buildLayers();
    g.drawImage(LAYERS.sky, 0, 0);
    var fo = -Math.round(cam * 0.15) % LAYERS.far.width; g.drawImage(LAYERS.far, fo, 22); g.drawImage(LAYERS.far, fo + LAYERS.far.width, 22);
    var mo = -Math.round(cam * 0.32) % LAYERS.mid.width; g.drawImage(LAYERS.mid, mo, 14); g.drawImage(LAYERS.mid, mo + LAYERS.mid.width, 14);
    g.drawImage(LAYERS.street, -Math.round(cam), 0);
    for (var i = 0; i < DECOR.length; i++) { var d = DECOR[i], sx = d.x - Math.round(cam); if (sx < -40 || sx > W + 40) continue; PXS.drawProp(g, d.k, sx, FLOOR + 1, { v: d.v }, tMs); }
    for (i = 0; i < LANTERNS.length; i++) lantern(g, LANTERNS[i], cam, tMs);
  }
  // the curb: front face of the street below the floor band
  function drawCurb(g, cam) {
    var y0 = FLOOR + DEPTH + 2;
    for (var y = y0; y < H; y++) { g.fillStyle = y === y0 ? '#3a3444' : y < y0 + 3 ? '#4c4658' : '#2c2836'; g.fillRect(0, y, W, 1); }
    for (var x = -(Math.round(cam) % 14); x < W; x += 14) { g.fillStyle = '#1e1a26'; g.fillRect(x, y0 + 1, 1, H - y0); g.fillStyle = '#5a5468'; g.fillRect(x + 1, y0 + 1, 5, 1); }
  }

  /* ---------------- simulation ---------------- */
  function newActor(id, kind, x, z, face) {
    var c = CAST[kind];
    return { id: id, kind: kind, x: x, z: z, h: 0, vh: 0, jvx: 0, face: face, st: 'idle', t: 0, walkT: 0, hp: c.hp, maxHp: c.hp, kb: 0, flash: 0,
      inv: 0, cmds: [], target: null, vx: 0, vz: 0, airAtk: false, hitIds: [], cd: 0, w: 18, ai: 0 };
  }
  function create(opt) {
    opt = opt || {};
    var MUT = opt.mutant || '';
    var S, belt;
    var events = [];
    function mkBelt() {
      var o = { depth: DEPTH, tolerance: opt.tolerance == null ? 7 : opt.tolerance, laneSpeed: 0.62, chaseSpeed: 0.4, shadowAlpha: 0.72, render: 'pixel', floor: 'cobble', cue: opt.cue === 'off' ? 'off' : 'on', view: { w: W, h: H },
        feet: function (a) { return { x: a.x, y: FLOOR - (a.h || 0) }; },
        toScreen: function (x, y) { return { x: x - S.cam, y: y }; }, camera: function () { return { x: S.cam, y: 0 }; },
        player: function () { return S.hero; }, seed: 4 };
      if (MUT === 'shadow') o.floorAt = function (x, y) { return y; };    // mutant: the shadow follows the body into the air
      var b = BD.create(o); b.setFloors([{ x0: -64, x1: WORLD_W + 64, y: FLOOR, kind: 'street' }]);
      if (MUT === 'nodepth') b.inReach = function () { return true; };    // mutant: no depth check
      return b;
    }
    function reset() {
      S = { step: 0, cam: 0, hero: newActor('hero', 'hero', 26, 30, 1), foes: [], fx: [], floats: [], live: false, wave: 0, last: { foe: null }, order: [], shake: 0 };
      S.foes.push(newActor('raider', 'raider', 150, 10, -1));
      S.foes.push(newActor('brute', 'brute', 226, 31, -1));
      S.foes.push(newActor('lancer', 'lancer', 196, 0, -1));
      belt = mkBelt();
      events = [];
      script();
    }
    function all() { return [S.hero].concat(S.foes); }
    function byId(id) { var L = all(); for (var i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; }
    function ev(name, info) { events.push({ step: S.step, name: name, info: info || null }); }

    /* ---- the recorded show (director): command queues per actor ---- */
    function q(id) { var a = byId(id); var api = {
      go: function (x, z, tgt) { a.cmds.push({ do: 'go', x: x, z: z, tgt: tgt }); return api; },
      atk: function (tgt) { a.cmds.push({ do: 'atk', tgt: tgt }); return api; },
      jump: function (vx, atkAt) { a.cmds.push({ do: 'jump', vx: vx, atkAt: atkAt }); return api; },
      until: function (step) { a.cmds.push({ do: 'until', step: step }); return api; },
      wait: function (n) { a.cmds.push({ do: 'wait', n: n }); return api; },
      near: function (tgt, gap) { a.cmds.push({ do: 'near', tgt: tgt, gap: gap }); return api; },
      tgt: function (t) { a.cmds.push({ do: 'tgt', tgt: t }); return api; } }; return api; }
    var LOOP = 960;
    function script() {
      // 1. walk in; swing at the raider from the wrong lane (whiff), step up into its lane, two hits
      q('hero').tgt('raider').go(128, 30).atk('raider').go(null, 10).atk('raider').near('raider', 20).atk('raider')
      // 2. the brute crosses in front, the lancer behind; the brute lines up and swings: jump, strike on the way down
        .tgt('brute').until(352).jump(0.3, 12).wait(6)
      // 3. it swings again: sidestep out of its lane, it whiffs; it follows into the lane and is finished
        .until(448).go(null, 30).until(560).near('brute', 20).atk('brute').near('brute', 20).atk('brute')
      // 4. the lancer lines up and its thrust lands; two hits finish it
        .tgt('lancer').until(740).near('lancer', 22).atk('lancer').near('lancer', 20).atk('lancer').wait(30).go(170, 20);
      q('raider').tgt('hero').until(9999);
      q('brute').tgt('hero').until(150).go(100, 31).go(null, 10).near('hero', 24).until(346).atk('hero').until(420).near('hero', 24).until(452).atk('hero').until(500).go(null, 30).until(9999);
      q('lancer').tgt('hero').until(214).go(48, 0).until(630).go(null, 30).near('hero', 27).until(690).atk('hero').until(9999);
    }

    /* ---- per-actor step ---- */
    function opponents(a) { return a === S.hero ? S.foes : [S.hero]; }
    function alive(a) { return a && a.st !== 'down' && a.st !== 'gone'; }
    function busy(a) { return a.st === 'atk' || a.st === 'hurt' || a.st === 'air' || a.st === 'land' || a.st === 'down' || a.st === 'gone'; }
    function intentScript(a) {
      var I = { mx: 0, mz: 0, atk: false, jump: false };
      while (a.cmds.length) {
        var c = a.cmds[0];
        if (c.do === 'tgt') { a.target = c.tgt; a.cmds.shift(); continue; }
        if (c.do === 'until') { if (S.step < c.step) return I; a.cmds.shift(); continue; }
        if (c.do === 'wait') { if (c.n-- > 0) return I; a.cmds.shift(); continue; }
        if (c.do === 'near') {
          var tn = byId(c.tgt); if (!alive(tn)) { a.cmds.shift(); continue; }
          var side = a.x <= tn.x ? -1 : 1, dxn = tn.x + side * c.gap - a.x;
          if (Math.abs(dxn) < 0.6) { a.cmds.shift(); continue; }
          I.mx = dxn > 0 ? 1 : -1; I.fine = { dx: dxn, dz: 0 }; return I;
        }
        if (c.do === 'go') {
          var dx = c.x == null ? 0 : c.x - a.x, dz = c.z == null ? 0 : c.z - a.z;
          if (Math.abs(dx) < 0.6 && Math.abs(dz) < 0.4) { a.cmds.shift(); continue; }
          I.mx = Math.abs(dx) < 0.6 ? 0 : dx > 0 ? 1 : -1; I.mz = Math.abs(dz) < 0.4 ? 0 : dz > 0 ? 1 : -1; I.fine = { dx: dx, dz: dz }; return I;
        }
        if (c.do === 'atk') { if (c.started && a.st !== 'atk') { a.cmds.shift(); continue; } if (!c.started && !busy(a)) { c.started = true; I.atk = true; } return I; }
        if (c.do === 'jump') { if (c.started && a.st !== 'air' && a.st !== 'land') { a.cmds.shift(); continue; } if (!c.started && !busy(a)) { c.started = true; I.jump = true; I.jvx = c.vx; a.jumpAtk = c.atkAt; } if (a.st === 'air' && a.jumpAtk != null && a.t === a.jumpAtk) I.atk = true; return I; }
        a.cmds.shift();
      }
      return I;
    }
    // live play: foes approach, line up in depth and attack on a cooldown
    function intentAI(a) {
      var I = { mx: 0, mz: 0, atk: false, jump: false }, h = S.hero; if (!alive(h)) return I;
      a.target = 'hero';
      var live = S.foes.filter(alive), idx = live.indexOf(a); if (a.cd > 0) a.cd--;
      var mine = S.token === a.id, holder = byId(S.token);
      // the attacker takes the near side with room; the others hold slots on the other side or farther out, on spread lanes
      var room = function (sd, gp) { var x = h.x + sd * gp; return x > 14 && x < WORLD_W - 14; };
      var hs = holder ? (holder.x < h.x ? -1 : 1) : 1; if (holder && !room(hs, 20)) hs = -hs;
      var side, gap;
      if (mine) { side = a.x < h.x ? -1 : 1; gap = CAST[a.kind].reach - 5; if (!room(side, gap)) side = -side; }
      else { var k = live.filter(function (f) { return f.id !== S.token; }).indexOf(a); side = k % 2 ? hs : -hs; gap = 46 + k * 26; if (!room(side, gap)) side = -side; a.slotZ = DEPTH * (k % 2 ? 0.9 : 0.1); if (Math.abs(a.slotZ - h.z) < 9) a.slotZ = DEPTH * 0.5; }
      var want = Math.max(14, Math.min(WORLD_W - 14, h.x + side * gap)), dx = want - a.x;
      var wantZ = mine ? h.z : a.slotZ;
      if (Math.abs(dx) > 3) I.mx = dx > 0 ? 1 : -1;
      var dz = wantZ - a.z; if (Math.abs(dz) > 2) I.mz = dz > 0 ? 1 : -1;
      // give way: never walk into another foe on a nearby lane; step around it in depth instead
      live.forEach(function (o) { if (o === a) return; var ox = o.x - a.x, oz = o.z - a.z;
        if (Math.abs(oz) < 11 && Math.abs(ox) < 20 && I.mx && Math.sign(ox) === I.mx) { I.mx = 0; if (!I.mz) I.mz = oz > 0 ? -1 : 1; if ((I.mz < 0 && a.z < 1) || (I.mz > 0 && a.z > DEPTH - 1)) I.mz = -I.mz; } });
      if (mine && !busy(a) && a.cd === 0 && Math.abs(h.x - a.x) <= CAST[a.kind].reach - 2 && Math.abs(h.z - a.z) <= 4) { I.atk = true; a.cd = 70; S.tokenT = Math.min(S.tokenT, 90); }
      return I;
    }
    function faceTarget(a, I) {
      var t = a.target ? byId(a.target) : null;
      if (I && I.mx && t && (Math.sign(t.x - a.x) !== I.mx || Math.abs(t.x - a.x) <= 2)) { a.face = I.mx; a.facesMove = true; return; }
      a.facesMove = false;
      if (I && I.mx && !t) { a.face = I.mx; return; }
      if (t && alive(t) && Math.abs(t.x - a.x) > 2) a.face = t.x > a.x ? 1 : -1;
    }
    function swingWindow(a) { var c = CAST[a.kind]; return a === S.hero ? { w0: 5, w1: 10, end: 19 } : { w0: 18, w1: 23, end: 36 }; }
    function tryHits(a, jumpAtk) {
      var c = CAST[a.kind], any = false, missed = null;
      opponents(a).forEach(function (t) {
        if (!alive(t) || a.hitIds.indexOf(t.id) >= 0 || t.inv > 0) return;
        var dx = (t.x - a.x) * a.face;
        if (dx < -2 || dx > c.reach) return;
        var air = jumpAtk ? false : Math.abs((t.h || 0) - (a.h || 0)) > 12;
        if (air) { if (!jumpAtk) { missed = missed || { t: t, why: 'air' }; } return; }
        if (!belt.inReach(a, t)) { missed = { t: t, why: 'lane' }; return; }
        a.hitIds.push(t.id); any = true; hit(a, t, c.dmg);
      });
      if (!any && missed && a.hitIds.indexOf('miss:' + missed.t.id) < 0) {
        a.hitIds.push('miss:' + missed.t.id);
        var mOn = a === S.hero ? missed.t : a; addFloat({ kind: 'miss', text: 'MISS', on: mOn.id, t: 0 }, mOn);
        ev(missed.why === 'lane' ? (a === S.hero ? 'whiff' : 'dodge-lane') : 'dodge-jump', { by: a.id, on: missed.t.id, dz: Math.abs(belt.z(a) - belt.z(missed.t)) });
      }
    }
    // floating text: a free slot (line) above its fighter, chosen once when it appears so it never jumps
    function floatAnchor(e) { var t = byId(e.on); if (!t) return null; return { x: t.x, y: FLOOR + t.z - e.h0 - Math.min(8, e.t * 0.4) }; }
    function addFloat(e, t) {
      if (e.kind === 'miss') {   // one MISS per spot: a repeat near an older one refreshes it instead of stacking
        var old = S.floats.find(function (f) { var o = byId(f.on); return f.kind === 'miss' && o && Math.abs(o.x - t.x) < 30; });
        if (old) { old.on = t.id; old.t = 0; old.h0 = Math.round(t.h || 0); return; }
      }
      S.floats = S.floats.filter(function (f) { return f.on !== e.on; });
      e.h0 = Math.round(t.h || 0); var me = { x: t.x, y: FLOOR + t.z - e.h0 }, slot = 0;
      for (var tries = 0; tries < 6; tries++) {
        var clash = S.floats.some(function (f) { var an = floatAnchor(f); if (!an) return false; return Math.abs(an.x - me.x) < 48 && Math.abs((an.y - f.slot * 9) - (me.y - slot * 9)) < 10; });
        if (!clash) break; slot++;
      }
      e.slot = slot; S.floats.push(e);
    }
    function hit(a, t, dmg) {
      t.hp = Math.max(0, t.hp - dmg); t.flash = 7; t.kb = a.face * (t.hp > 0 ? 0.9 : 2.0); t.inv = 8;
      if (t.st === 'air') { t.h = Math.max(t.h, 0); }
      t.st = t.hp > 0 ? 'hurt' : 'down'; t.t = 0; t.cmdHold = true;
      if (t !== S.hero) S.last.foe = t.id;
      S.fx.push({ kind: 'spark', x: t.x - a.face * 3, z: t.z, h: (t.h || 0) + 17, t: 0, face: a.face });
      addFloat({ kind: 'dmg', text: String(dmg), on: t.id, t: 0 }, t);
      S.shake = 4;
      ev(t.hp > 0 ? 'hit' : 'ko', { by: a.id, on: t.id, dz: Math.abs(belt.z(a) - belt.z(t)), hp: t.hp });
    }
    function stepActor(a, I) {
      var c = CAST[a.kind];
      a.t++; if (a.flash > 0) a.flash--; if (a.inv > 0) a.inv--;
      a.vx = 0; a.vz = 0;
      if (a.st === 'gone') return;
      if (a.st === 'down') { a.x += a.kb; a.kb *= 0.86; a.h = a.t < 16 ? Math.round(7 * Math.sin(Math.PI * a.t / 16) * 10) / 10 : 0; if (a.t === 16) S.floats = S.floats.filter(function (f) { return f.on !== a.id; });
        if (a.t === 16) S.fx.push({ kind: 'dust', x: a.x + a.face * 10, z: a.z, h: 1, t: 0, small: true, seed: a.id.length + S.step }); if (a.t > 96) { a.st = 'gone'; S.fx.push({ kind: 'dust', x: a.x - a.face * 6, z: a.z, h: 2, t: 0, seed: S.step }); } return; }
      if (a.st === 'hurt') { a.x += a.kb; a.kb *= 0.84; if (a.h > 0) { a.h = Math.max(0, a.h + a.vh); a.vh -= 0.2; } if (a.t > 18 && a.h <= 0) { a.st = 'idle'; a.t = 0; } return; }
      if (a.st === 'land') { if (a.t > 6) { a.st = 'idle'; a.t = 0; } return; }
      if (a.st === 'air') {
        a.h += a.vh; a.vh -= 0.17; a.x += a.jvx * a.face; a.vx = a.jvx * a.face;
        if (I.atk && !a.airAtk) { a.airAtk = true; a.hitIds = []; a.atkT = 0; }
        if (a.airAtk) { a.atkT++; if (a.atkT >= 4 && a.vh < 0 && a.h <= 20 && a.h >= 3) tryHits(a, true); }
        if (a.h <= 0) { a.h = 0; a.vh = 0; a.st = 'land'; a.t = 0; a.airAtk = false; S.fx.push({ kind: 'dust', x: a.x, z: a.z, h: 1, t: 0, small: true }); ev('land', { by: a.id }); }
        return;
      }
      if (a.st === 'atk') {
        var sw = swingWindow(a);
        if (a.t >= sw.w0 && a.t <= sw.w1) tryHits(a, false);
        if (a.t === sw.w0) ev('swing', { by: a.id });
        if (a.t >= sw.end) { a.st = 'idle'; a.t = 0; }
        return;
      }
      faceTarget(a, I);
      if (I.jump) { a.st = 'air'; a.t = 0; a.vh = 3.0; a.jvx = I.jvx || 0; a.airAtk = false; a.hitIds = []; ev('jump', { by: a.id }); return; }
      if (I.atk) { a.st = 'atk'; a.t = 0; a.hitIds = []; return; }
      var sx = a === S.hero && S.live ? 1.05 : 0.9, mxv = I.mx * sx;
      if (I.fine && Math.abs(I.fine.dx) < sx) mxv = I.fine.dx;
      a.x += mxv; a.vx = mxv;
      var dz = I.mz ? belt.walk(a, I.mz, I.fine && Math.abs(I.fine.dz) < 0.62 ? Math.abs(I.fine.dz) : 0.62) : 0; a.vz = dz;
      a.x = Math.max(8, Math.min(WORLD_W - 8, a.x));
      var moved = Math.abs(mxv) + Math.abs(dz);
      if (moved > 0.01) { a.st = 'walk'; a.walkT += moved; } else { a.st = 'idle'; }
    }
    function stepWorld(device) {
      if (device && !S.live) { S.live = true; S.hero.cmds = []; S.foes.forEach(function (f) { f.cmds = []; }); ev('live'); }
      S.step++;
      var h = S.hero;
      var I = S.live ? (device || { mx: 0, mz: 0 }) : intentScript(h);
      if (S.live) { I = { mx: device ? device.mx : 0, mz: device ? device.mz : 0, atk: device && device.atk, jump: device && device.jump, jvx: device && device.mx ? 0.9 : 0 }; if (I.jump && I.mx) h.face = I.mx; h.target = nearestFoe(); }
      stepActor(h, I);
      if (S.live) {   // one foe at a time holds the attack token; it passes on after a while or after its blow
        var lv = S.foes.filter(alive), cur = byId(S.token);
        if (!cur || !alive(cur)) { var best = null; lv.forEach(function (f) { if (!best || Math.abs(f.x - h.x) < Math.abs(best.x - h.x)) best = f; }); S.token = best ? best.id : null; S.tokenT = 240; }
        else if (--S.tokenT <= 0 && cur.st !== 'atk') { var nx = lv[(lv.indexOf(cur) + 1) % lv.length]; S.token = nx.id; S.tokenT = 360; }
      }
      S.foes.forEach(function (f) { stepActor(f, S.live ? intentAI(f) : intentScript(f)); });
      // keep foes and the hero from standing inside each other on the same lane (soft push)
      var L = all().filter(alive);
      for (var i = 0; i < L.length; i++) for (var j = i + 1; j < L.length; j++) { var p = L[i], r = L[j]; if (Math.abs(p.z - r.z) > 5 || p.h > 8 || r.h > 8) continue; var d = r.x - p.x; if (Math.abs(d) < 12) { var push = (12 - Math.abs(d)) * 0.25 * (d >= 0 ? 1 : -1); if (p !== S.hero) p.x -= push * (r === S.hero ? 2 : 1); if (r !== S.hero) r.x += push * (p === S.hero ? 2 : 1); } }
      // a foe walking past the hero on another lane: drawn in front of him (nearer) or behind him (farther)
      S.foes.forEach(function (f) { if (!alive(f)) return; var side = f.x < h.x ? -1 : 1; if (f.side != null && f.side !== side && Math.abs(f.z - h.z) > belt.params().tolerance) ev(f.z > h.z ? 'cross-front' : 'cross-behind', { by: f.id, dz: Math.abs(f.z - h.z) }); f.side = side; });
      all().forEach(function (q) { q.x = Math.max(8, Math.min(WORLD_W - 8, q.x)); });
      if (S.live && h.st === 'down' && h.t > 90) { h.st = 'idle'; h.t = 0; h.hp = h.maxHp; h.inv = 90; h.kb = 0; h.h = 0; ev('revive', { by: 'hero' }); }
      S.fx.forEach(function (e) { e.t++; }); S.fx = S.fx.filter(function (e) { return e.t < (e.kind === 'spark' ? 12 : 22); });
      S.floats.forEach(function (e) { e.t++; }); S.floats = S.floats.filter(function (e) { return e.t < 64; });
      if (S.shake > 0) S.shake--;
      if (S.live) { S.foes = S.foes.filter(function (f) { return f.st !== 'gone'; }); if (!S.foes.length) spawnWave(); }
      S.cam = Math.round(Math.max(0, Math.min(WORLD_W - W, h.x - W * 0.42)));
      belt.update();
    }
    function nearestFoe() { var best = null, bd = 1e9; S.foes.forEach(function (f) { if (!alive(f)) return; var d = Math.abs(f.x - S.hero.x) + Math.abs(f.z - S.hero.z) * 2; if (d < bd) { bd = d; best = f.id; } }); return best; }
    function spawnWave() {
      S.wave++; var kinds = ['raider', 'brute', 'lancer'], hx = S.hero.x;
      for (var i = 0; i < 3; i++) { var side = i % 2 ? -1 : 1, x = Math.max(16, Math.min(WORLD_W - 16, hx + side * (130 + i * 26))), f = newActor(kinds[(i + S.wave) % 3] , kinds[(i + S.wave) % 3], x, 0, -side); f.id = f.kind + '-' + S.wave; belt.place(f, belt.lane(S.wave * 3 + i)); S.foes.push(f); }
    }

    /* ---- drawing ---- */
    function poseOf(a) {
      if (a.st === 'down') return a.t < 16 ? 'hurt' : 'down';
      if (a.st === 'hurt') return 'hurt';
      if (a.st === 'air') { if (a.airAtk) return a.atkT < 4 ? 'windup' : 'air'; return 'tuck'; }
      if (a.st === 'land') return 'crouch';
      if (a.st === 'atk') { var sw = swingWindow(a); return a.t < sw.w0 ? 'windup' : a.t <= sw.w1 + 1 ? 'swing' : 'follow'; }
      if (a.st === 'walk') return 'walk' + (Math.floor(a.walkT / 4) % 4);
      return Math.floor((S.step + a.id.length * 11) / 34) % 2 ? 'breathe' : 'ready';
    }
    var DRAWN = {}, ORDER = [];
    function drawActor(g, a) {
      var side = (MUT === 'face' && a === S.hero ? -a.face : a.face) > 0 ? 'right' : 'left';
      DRAWN[a.id] = side; ORDER.push(a.id);
      var c = frameFor(a.kind, poseOf(a), side); if (a.flash > 4 && a.st !== 'down') c = flashed(c);
      var sx = Math.round(a.x - S.cam) - c.footX, sy = Math.round(FLOOR - a.h) - c.footY;
      g.drawImage(c, sx, sy);
      // blade arc on the swing frames
      var sw = swingWindow(a), on = (a.st === 'atk' && a.t >= sw.w0 && a.t <= sw.w1 + 1) ;
      if (on) arc(g, Math.round(a.x - S.cam), Math.round(FLOOR - a.h) - 17, a.face, a.kind);
    }
    function arc(g, x, y, f, kind) {
      var R = kind === 'lancer' ? 0 : 15;
      if (kind === 'lancer') { for (var i = 0; i < 18; i++) { g.fillStyle = i > 13 ? '#fff6d8' : 'rgba(255,240,200,0.55)'; g.fillRect(x + f * (8 + i), y + 2, 1, i > 13 ? 2 : 1); } return; }
      for (var k = 4; k < 16; k++) { var an = -1.35 + k * 0.17, xx = x + f * (4 + Math.cos(an) * R), yy = y + Math.sin(an) * R * 0.9, w = k < 3 || k > 13 ? 1 : 2;
        g.fillStyle = k > 4 && k < 12 ? '#ffffff' : '#bfe8ff'; g.fillRect(Math.round(xx), Math.round(yy), w, w); g.fillStyle = 'rgba(160,220,255,0.45)'; g.fillRect(Math.round(xx - f * 2), Math.round(yy), 1, w); }
    }
    function drawFx(g, e) {
      var x = Math.round(e.x - S.cam), y = Math.round(FLOOR - e.h);
      if (e.kind === 'spark') {
        var r = 2 + e.t, col = e.t < 4 ? '#ffffff' : e.t < 8 ? '#ffe070' : '#ff9040';
        for (var i = 0; i < 8; i++) { var an = i * Math.PI / 4 + 0.3, l = i % 2 ? r * 0.6 : r; for (var s = Math.max(1, r - 4); s <= l; s++) { g.fillStyle = col; g.fillRect(Math.round(x + Math.cos(an) * s), Math.round(y + Math.sin(an) * s), 1, 1); } }
        if (e.t < 3) { g.fillStyle = '#ffffff'; g.fillRect(x - 2, y - 2, 5, 5); }
      } else if (e.kind === 'dust') {
        var n = e.small ? 3 : 4, sd = e.seed || 1;
        for (var j = 0; j < n; j++) { var r0 = hsh(j, sd, 5), dir = j % 2 ? 1 : -1, dx = dir * (2 + j * 2.5 + r0 * 3) * (1 + e.t / 12), dy = -e.t * (0.15 + r0 * 0.25) - r0 * 2;
          var rr = Math.max(1, Math.round((e.small ? 1.5 : 2.5) + r0 * 1.5 + e.t / 8 - (e.t > 12 ? (e.t - 12) / 2.5 : 0))); if (e.t > 18 && j % 2) continue;
          disc(g, x + dx, y + dy - rr, rr, e.t > 10 ? '#8a8098' : '#b0a8bc'); if (rr > 1) disc(g, x + dx - 1, y + dy - rr - 1, rr - 1, '#d4ccdc'); }
      }
    }
    function disc(g, x, y, r, col) { g.fillStyle = col; for (var dy = -r; dy <= r; dy++) { var w = Math.floor(Math.sqrt(r * r - dy * dy + 0.5)); g.fillRect(Math.round(x) - w, Math.round(y) + dy, w * 2 + 1, 1); } }
    function renderWorld(g, tMs) {
      g.imageSmoothingEnabled = false;
      var sh = S.shake ? (S.shake % 2 ? 1 : -1) : 0;
      g.save(); g.translate(sh, 0);
      drawBackdrop(g, S.cam, tMs);
      belt.drawFloor(g);
      drawCurb(g, S.cam);
      ORDER = []; DRAWN = {};
      var items = [];
      all().forEach(function (a) {
        if (a.st === 'gone') return;
        var it = { a: a, draw: function (gg) { drawActor(gg, a); }, shadow: 17 };
        var sw = swingWindow(a), act = (a.st === 'atk' && a.t >= sw.w0 && a.t <= sw.w1 + 1) || (a.st === 'air' && a.airAtk && a.atkT >= 4 && a.vh < 0 && a.h <= 20);
        if (act) it.reach = { x0: a.x + a.face * 2, x1: a.x + a.face * CAST[a.kind].reach, k: 1 };
        items.push(it);
      });
      S.fx.forEach(function (e) { items.push({ a: { id: 'fx', x: e.x, z: e.z, h: e.kind === 'spark' ? 0 : 0 }, draw: function (gg) { drawFx(gg, e); }, shadow: false }); });
      if (MUT === 'sort') {   // mutant: actors drawn in list order, shifted by depth by hand (no sort)
        items.forEach(function (it) { if (it.shadow !== false) { var sx = it.a.x - S.cam, sy = FLOOR + belt.z(it.a); g.fillStyle = 'rgba(18,10,30,0.38)'; g.fillRect(Math.round(sx - 8), Math.round(sy - 1), 17, 3); } });
        items.forEach(function (it) { g.save(); g.translate(0, Math.round(belt.z(it.a))); it.draw(g); g.restore(); });
      } else belt.render(g, items);
      S.order = ORDER.slice();
      g.restore();
    }
    return { reset: reset, step: stepWorld, render: renderWorld, get S() { return S; }, get belt() { return belt; }, events: function () { return events; },
      drawn: function () { return DRAWN; }, LOOP: LOOP, poseOf: poseOf, alive: alive, CAST: CAST };
  }

  root.BeltStage = { create: create, W: W, H: H, FLOOR: FLOOR, DEPTH: DEPTH, WORLD_W: WORLD_W, STEP_MS: STEP_MS, CAST: CAST, frameFor: frameFor, pText: pText, textW: textW, FONT: FONT };
})(window);
