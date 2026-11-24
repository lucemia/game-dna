/* J-01 demo: an original torch-lit vault drawn on a plain 2D canvas, lit by GameDNA_Lights on top of GameDNA_Post (I-08). */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search);
  var HAS_T = Q.has('t'), FREEZE = Q.get('freeze') === '1', T0 = HAS_T ? Math.max(0, Number(Q.get('t')) || 0) : 0;
  var W = 640, H = 360, T = 32, OY = 0, HUD_H = 30, FACE = 18;
  var S = 2, HS = 1.5;   // the canvas is drawn at S x the logical 640x360 so the art stays crisp when the page scales it up; HS = hero scale
  var cv = document.getElementById('game'); cv.width = W * S; cv.height = H * S; var g = cv.getContext('2d');
  var gameMs = 0, TAU = Math.PI * 2;

  // ---------------------------------------------------------------- map
  var MAP = [
    '####################',
    '####################',
    '#..b......##....b..#',
    '#.........##.......#',
    '#...P...........P..#',
    '#......rrrrr.......#',
    '#####..rrrrr..###..#',
    '#......rrrrr..#....#',
    '#..P.....K....#..c.#',
    '#c.................#',
    '#..b...............#',
    '####################'
  ];
  function at(c, r) { return MAP[r] && MAP[r][c] !== undefined ? MAP[r][c] : '#'; }
  function solid(c, r) { return at(c, r) === '#'; }
  function find(ch) { var out = []; for (var r = 0; r < MAP.length; r++) for (var c = 0; c < 20; c++) if (MAP[r][c] === ch) out.push([c, r]); return out; }
  var PILLARS = find('P'), CRATES = find('c'), BRAZIERS = find('b'), CRYSTAL = find('K')[0];
  function tx(c) { return c * T; } function ty(r) { return r * T + OY; }
  // occluder rects (world px = canvas px here: the room does not scroll)
  var RECTS = PILLARS.map(function (p) { return { x: tx(p[0]) + 7, y: ty(p[1]) + 12, w: 18, h: 16 }; })
    .concat(CRATES.map(function (p) { return { x: tx(p[0]) + 4, y: ty(p[1]) + 8, w: 24, h: 20 }; }));

  // ---------------------------------------------------------------- helpers
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function h2(x, y) { return hash(x * 57.3 + y * 131.9); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
    var f = function (v) { return Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)))); };
    return 'rgb(' + f(r) + ',' + f(gg) + ',' + f(b) + ')';
  }

  // ---------------------------------------------------------------- static art (cached)
  var bg = document.createElement('canvas'); bg.width = W * S; bg.height = H * S; var b = bg.getContext('2d'); b.setTransform(S, 0, 0, S, 0, 0);
  function paintStatic() {
    b.fillStyle = '#16121c'; b.fillRect(0, 0, W, H);
    // floor flagstones
    for (var r = 0; r < MAP.length; r++) for (var c = 0; c < 20; c++) {
      if (solid(c, r)) continue;
      var x = tx(c), y = ty(r), v = h2(c, r);
      var base = ['#5b5466', '#595264', '#5d5668', '#5a5367'][Math.floor(v * 4)];   // close shades: lighter tiles read as baked light shafts under the lights
      b.fillStyle = base; b.fillRect(x, y, T, T);
      // two slabs per tile, offset per row
      var off = (r % 2) * 16;
      b.fillStyle = 'rgba(20,14,28,0.55)';
      b.fillRect(x, y, T, 1); b.fillRect(x + ((off + 8) % 32), y, 1, T / 2); b.fillRect(x + ((off + 24) % 32), y + T / 2, 1, T / 2); b.fillRect(x, y + T / 2, T, 1);
      b.fillStyle = 'rgba(255,240,255,0.06)'; b.fillRect(x, y + 1, T, 1); b.fillRect(x, y + T / 2 + 1, T, 1);
      for (var k = 0; k < 7; k++) { var px = x + Math.floor(h2(c * 7 + k, r) * 30), py = y + Math.floor(h2(c, r * 5 + k) * 30); b.fillStyle = k % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.05)'; b.fillRect(px, py, 2, 1); }
      if (v > 0.82) { b.strokeStyle = 'rgba(15,10,20,0.6)'; b.lineWidth = 1; b.beginPath(); b.moveTo(x + 6, y + 10); b.lineTo(x + 13, y + 15); b.lineTo(x + 12, y + 22); b.stroke(); }
      if (v < 0.1) { b.fillStyle = 'rgba(80,120,70,0.35)'; b.beginPath(); b.ellipse(x + 22, y + 26, 7, 3, 0, 0, TAU); b.fill(); }
    }
    // rug
    var r0 = find('r'), rx = tx(r0[0][0]), ry = ty(r0[0][1]), rw = 5 * T, rh = 3 * T;
    b.fillStyle = '#6e2633'; rr(b, rx + 4, ry + 4, rw - 8, rh - 8, 4); b.fill();
    b.strokeStyle = '#c99a4a'; b.lineWidth = 2; rr(b, rx + 9, ry + 9, rw - 18, rh - 18, 3); b.stroke();
    b.strokeStyle = '#8f3a44'; b.lineWidth = 1; rr(b, rx + 15, ry + 15, rw - 30, rh - 30, 2); b.stroke();
    b.fillStyle = '#c99a4a'; b.save(); b.translate(rx + rw / 2, ry + rh / 2); b.rotate(Math.PI / 4); b.fillRect(-12, -12, 24, 24); b.fillStyle = '#6e2633'; b.fillRect(-7, -7, 14, 14); b.restore();
    for (var f = 0; f < rw - 8; f += 4) { b.fillStyle = '#d8c39a'; b.fillRect(rx + 5 + f, ry + 1, 2, 3); b.fillRect(rx + 5 + f, ry + rh - 4, 2, 3); }
    // walls: caps and front faces (3/4 view)
    for (r = 0; r < MAP.length; r++) for (c = 0; c < 20; c++) {
      if (!solid(c, r)) continue;
      x = tx(c); y = ty(r);
      var face = !solid(c, r + 1);
      var capH = face ? T - FACE : T;
      var cg = b.createLinearGradient(0, y, 0, y + capH);
      cg.addColorStop(0, '#3a3348'); cg.addColorStop(1, '#2e2839');
      b.fillStyle = cg; b.fillRect(x, y, T, capH);
      b.fillStyle = 'rgba(255,255,255,0.05)'; for (k = 0; k < 4; k++) b.fillRect(x + Math.floor(h2(c + k, r) * 28), y + Math.floor(h2(c, r + k) * (capH - 2)), 3, 1);
      if (!solid(c, r - 1)) { b.fillStyle = '#5a5070'; b.fillRect(x, y, T, 2); }
      if (!solid(c - 1, r)) { b.fillStyle = '#4a4260'; b.fillRect(x, y, 2, capH); }
      if (!solid(c + 1, r)) { b.fillStyle = '#231e2c'; b.fillRect(x + T - 2, y, 2, capH); }
      if (face) {
        var fy = y + capH;
        b.fillStyle = '#6a5a62'; b.fillRect(x, fy, T, FACE);
        for (var row = 0; row < 3; row++) {
          var bo = (row + c) % 2 ? 0 : 8;
          for (var bx = -bo; bx < T; bx += 16) {
            var bw = Math.min(15, T - Math.max(bx, 0)), bxx = x + Math.max(bx, 0);
            b.fillStyle = shade('#7a6670', (h2(c * 3 + bx, r * 7 + row) - 0.5) * 0.25); b.fillRect(bxx, fy + row * 6, bw, 5);
          }
        }
        b.fillStyle = '#2a2230'; b.fillRect(x, fy + FACE - 2, T, 2);
        b.fillStyle = 'rgba(255,230,210,0.12)'; b.fillRect(x, fy, T, 1);
      }
    }
    // floor contact shadow under every wall face
    for (r = 0; r < MAP.length; r++) for (c = 0; c < 20; c++) if (solid(c, r) && !solid(c, r + 1)) {
      var sg = b.createLinearGradient(0, ty(r + 1), 0, ty(r + 1) + 9); sg.addColorStop(0, 'rgba(10,6,14,0.55)'); sg.addColorStop(1, 'rgba(10,6,14,0)');
      b.fillStyle = sg; b.fillRect(tx(c), ty(r + 1), T, 9);
    }
    // bones, debris
    [[2, 7, 0.4], [12, 9, -0.6], [17, 3, 1.2], [8, 3, 0.2]].forEach(function (d) {
      var x0 = tx(d[0]) + 10, y0 = ty(d[1]) + 18; b.save(); b.translate(x0, y0); b.rotate(d[2]);
      b.fillStyle = '#cfc4b0'; rr(b, -7, -1.5, 14, 3, 1.5); b.fill(); b.beginPath(); b.arc(-7, -1.5, 2, 0, TAU); b.arc(-7, 1.5, 2, 0, TAU); b.arc(7, -1.5, 2, 0, TAU); b.arc(7, 1.5, 2, 0, TAU); b.fill(); b.restore();
    });
    // pillars
    PILLARS.forEach(function (p) {
      var cx = tx(p[0]) + 16, base = ty(p[1]) + 26;
      b.fillStyle = 'rgba(8,4,12,0.45)'; b.beginPath(); b.ellipse(cx + 2, base + 1, 15, 6, 0, 0, TAU); b.fill();
      var pg = b.createLinearGradient(cx - 11, 0, cx + 11, 0); pg.addColorStop(0, '#5e5670'); pg.addColorStop(0.35, '#8a8098'); pg.addColorStop(1, '#3e3850');
      b.fillStyle = pg; b.fillRect(cx - 10, base - 44, 20, 44);
      b.fillStyle = 'rgba(0,0,0,0.18)'; for (var s = -6; s <= 6; s += 4) b.fillRect(cx + s, base - 42, 1, 40);
      b.fillStyle = '#6f6782'; rr(b, cx - 13, base - 6, 26, 8, 2); b.fill();
      b.fillStyle = '#9a90aa'; rr(b, cx - 13, base - 50, 26, 8, 2); b.fill();
      b.fillStyle = '#b4abc2'; b.fillRect(cx - 12, base - 50, 24, 2);
    });
    // crates
    CRATES.forEach(function (p) {
      var x0 = tx(p[0]) + 4, y0 = ty(p[1]) + 2;
      b.fillStyle = 'rgba(8,4,12,0.45)'; b.fillRect(x0 + 2, y0 + 24, 26, 5);
      b.fillStyle = '#7a5434'; b.fillRect(x0, y0 + 8, 24, 18); b.fillStyle = '#9a6c42'; b.fillRect(x0, y0, 24, 8);
      b.fillStyle = '#5a3a22'; b.fillRect(x0, y0 + 8, 24, 2); b.fillRect(x0 + 2, y0 + 10, 2, 16); b.fillRect(x0 + 20, y0 + 10, 2, 16);
      b.strokeStyle = '#5a3a22'; b.lineWidth = 2; b.beginPath(); b.moveTo(x0 + 3, y0 + 25); b.lineTo(x0 + 21, y0 + 11); b.stroke();
      b.fillStyle = '#b88a5a'; b.fillRect(x0, y0, 24, 1);
    });
    // rune circle (fireball spawner)
    var rc = runePos();
    b.strokeStyle = '#3b6a8a'; b.lineWidth = 1.5; b.beginPath(); b.ellipse(rc.x, rc.y + 4, 13, 6, 0, 0, TAU); b.stroke();
    b.beginPath(); b.ellipse(rc.x, rc.y + 4, 8, 3.6, 0, 0, TAU); b.stroke();
    // brazier bowls
    BRAZIERS.forEach(function (p) {
      var cx = tx(p[0]) + 16, cy = ty(p[1]) + 22;
      b.fillStyle = 'rgba(8,4,12,0.5)'; b.beginPath(); b.ellipse(cx + 1, cy + 6, 11, 4, 0, 0, TAU); b.fill();
      b.fillStyle = '#4a3a36'; b.fillRect(cx - 2, cy - 4, 4, 10); b.fillRect(cx - 7, cy + 4, 14, 2);
      var bg2 = b.createLinearGradient(cx - 10, 0, cx + 10, 0); bg2.addColorStop(0, '#5a4a40'); bg2.addColorStop(0.4, '#9a7a5a'); bg2.addColorStop(1, '#3a2e2a');
      b.fillStyle = bg2; b.beginPath(); b.moveTo(cx - 11, cy - 10); b.lineTo(cx + 11, cy - 10); b.lineTo(cx + 7, cy - 3); b.lineTo(cx - 7, cy - 3); b.closePath(); b.fill();
      b.fillStyle = '#2a1a14'; b.beginPath(); b.ellipse(cx, cy - 10, 11, 3, 0, 0, TAU); b.fill();
    });
    // sentinel eye socket on the north wall face
    var se = sentinelPos();
    b.fillStyle = '#2a2230'; b.beginPath(); b.ellipse(se.x, se.y - 2, 10, 7, 0, 0, TAU); b.fill();
    b.strokeStyle = '#8a7a6a'; b.lineWidth = 2; b.beginPath(); b.ellipse(se.x, se.y - 2, 11, 8, 0, 0, TAU); b.stroke();
  }

  // ---------------------------------------------------------------- actors (pure functions of game time)
  var PATH = [[2.5, 9.5], [6, 9.5], [6, 4.5], [12.5, 4.5], [12.5, 9.5], [17, 9.5], [17, 10.4], [8, 10.4], [2.5, 9.5]].map(function (p) { return [p[0] * T, p[1] * T + OY]; });
  var SEG = [], LEN = 0;
  for (var i = 0; i < PATH.length - 1; i++) { var dl = Math.hypot(PATH[i + 1][0] - PATH[i][0], PATH[i + 1][1] - PATH[i][1]); SEG.push(dl); LEN += dl; }
  var SPEED = 62;   // px per second
  function hero(ms) {
    var d = (ms / 1000 * SPEED) % LEN, k = 0;
    while (k < SEG.length - 1 && d > SEG[k]) { d -= SEG[k]; k++; }
    var a = PATH[k], bb = PATH[k + 1], t = SEG[k] ? d / SEG[k] : 0, dx = bb[0] - a[0], dy = bb[1] - a[1];
    var face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    return { x: mix(a[0], bb[0], t), y: mix(a[1], bb[1], t), face: face, step: Math.floor(ms / 140) % 2 };
  }
  function torchRaw(face) { return { right: { x: 10, y: -17 }, left: { x: -10, y: -17 }, up: { x: 9, y: -20 }, down: { x: -10, y: -13 } }[face]; }
  function torchOffset(face) { var o = torchRaw(face); return { x: o.x * HS, y: (o.y - 10) * HS + 10 }; }   // the hero is drawn HS x about its feet (y + 10)
  function runePos() { return { x: 18.5 * T, y: 9.5 * T + OY - 4 }; }
  function sentinelPos() { return { x: 6.5 * T, y: ty(2) - 6 }; }
  var FB = { period: 3400, speed: 300, start: 600 };
  var FB_LEN = runePos().x - (T + 6), FB_FLIGHT = FB_LEN / FB.speed * 1000;
  var extraShots = [];
  function shotStarts(ms) { var s = []; for (var k = Math.max(0, Math.floor((ms - FB.start - FB_FLIGHT) / FB.period)); k * FB.period + FB.start <= ms; k++) s.push(k * FB.period + FB.start); return s.concat(extraShots.filter(function (x) { return x <= ms; })); }
  function fireballs(ms) {
    var out = [], rp = runePos(), st = shotStarts(ms);
    for (var k = 0; k < st.length; k++) {
      var age = ms - st[k];
      if (age < 0 || age >= FB_FLIGHT) continue;
      out.push({ x: rp.x - age / 1000 * FB.speed, y: rp.y - 10 + Math.sin(age / 90) * 1.5, age: age });
    }
    return out;
  }
  function impactsBetween(a, bms, fn) {   // fireball impacts with game time in (a, b]
    var st = shotStarts(bms);
    for (var k = 0; k < st.length; k++) { var hit = st[k] + FB_FLIGHT; if (hit > a && hit <= bms) fn(hit); }
  }

  // ---------------------------------------------------------------- dynamic drawing
  function flame(c, x, y, s, ms, seed) {
    c.save(); c.globalCompositeOperation = 'lighter';
    var gl = c.createRadialGradient(x, y - 3 * s, 0, x, y - 3 * s, 14 * s); gl.addColorStop(0, 'rgba(255,170,80,0.55)'); gl.addColorStop(1, 'rgba(255,90,20,0)');
    c.fillStyle = gl; c.beginPath(); c.arc(x, y - 3 * s, 14 * s, 0, TAU); c.fill();
    for (var k = 0; k < 3; k++) {
      var w = (6 - k * 1.6) * s, hgt = (14 - k * 3.5) * s * (0.85 + 0.25 * Math.sin(ms / (70 + k * 23) + seed * 3 + k));
      var sway = Math.sin(ms / 160 + seed + k) * 1.6 * s;
      c.fillStyle = ['rgba(255,90,30,0.9)', 'rgba(255,170,60,0.95)', 'rgba(255,240,190,1)'][k];
      c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w * 0.8, y - hgt * 0.5, x + sway, y - hgt); c.quadraticCurveTo(x + w * 0.8, y - hgt * 0.5, x + w, y); c.closePath(); c.fill();
    }
    c.restore();
  }
  function drawHero(c, h, ms) {
    var x = Math.round(h.x), y = Math.round(h.y), bob = h.step ? -1 : 0, side = h.face === 'left' ? -1 : 1, ink = '#140e1c';
    c.fillStyle = 'rgba(6,3,10,0.5)'; c.beginPath(); c.ellipse(x, y + 10, 10 * HS, 4 * HS, 0, 0, TAU); c.fill();
    c.save(); c.translate(x, y + 10); c.scale(HS, HS); c.translate(-x, -(y + 10)); c.lineJoin = 'round'; c.lineCap = 'round';
    var o = torchRaw(h.face), txx = x + o.x, tyy = y + o.y + bob, back = h.face === 'up';
    function torch() {
      c.strokeStyle = ink; c.lineWidth = 4.4; c.beginPath(); c.moveTo(txx - side * 1.5, tyy + 12); c.lineTo(txx, tyy + 1); c.stroke();
      c.strokeStyle = '#7a5028'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(txx - side * 1.5, tyy + 12); c.lineTo(txx, tyy + 1); c.stroke();
      c.fillStyle = '#3a2a22'; c.fillRect(txx - 2.5, tyy - 1, 5, 3.4);
      flame(c, txx, tyy + 1, 0.7, ms, 1.7);
    }
    if (back) torch();
    // legs and boots
    var l1 = h.step ? 0 : -1.5, l2 = h.step ? -1.5 : 0;
    c.fillStyle = '#2c2638'; c.strokeStyle = ink; c.lineWidth = 1;
    c.beginPath(); c.rect(x - 5.5, y + 1, 4.5, 7 + l1); c.rect(x + 1, y + 1, 4.5, 7 + l2); c.fill(); c.stroke();
    c.fillStyle = '#5a3a24'; rr(c, x - 6.5, y + 6.5 + l1, 6, 3.6, 1.4); c.fill(); c.stroke(); rr(c, x + 0.5, y + 6.5 + l2, 6, 3.6, 1.4); c.fill(); c.stroke();
    // cloak
    var cg = c.createLinearGradient(x - 10, 0, x + 10, 0); cg.addColorStop(0, '#2d5a6e'); cg.addColorStop(0.45, '#4a90a8'); cg.addColorStop(1, '#244656');
    c.fillStyle = cg; c.strokeStyle = ink; c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(x - 7, y - 12 + bob); c.lineTo(x + 7, y - 12 + bob); c.quadraticCurveTo(x + 10.5, y - 4, x + 10, y + 4); c.quadraticCurveTo(x + 5, y + 5.6, x, y + 4.4); c.quadraticCurveTo(x - 5, y + 5.6, x - 10, y + 4); c.quadraticCurveTo(x - 10.5, y - 4, x - 7, y - 12 + bob); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(16,30,40,0.45)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(x - 3.5, y - 1 + bob); c.lineTo(x - 4.5, y + 4); c.moveTo(x + 3.5, y - 1 + bob); c.lineTo(x + 4.5, y + 4); c.stroke();
    c.fillStyle = '#d8ac50'; c.fillRect(x - 8.6, y - 3 + bob, 17.2, 2.2); c.fillStyle = '#fff0b0'; c.fillRect(x - 1.6, y - 3.6 + bob, 3.2, 3.4);
    // head and hood
    var hy = y - 17.5 + bob;
    var hg = c.createLinearGradient(x - 7, 0, x + 7, 0); hg.addColorStop(0, '#2d5a6e'); hg.addColorStop(0.45, '#3f8096'); hg.addColorStop(1, '#244656');
    c.fillStyle = hg; c.strokeStyle = ink; c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(x - 7.4, hy + 1); c.arc(x, hy - 0.6, 7.4, Math.PI, TAU); c.quadraticCurveTo(x + 7.6, hy + 5.4, x + 4.6, hy + 6.6); c.lineTo(x - 4.6, hy + 6.6); c.quadraticCurveTo(x - 7.6, hy + 5.4, x - 7.4, hy + 1); c.closePath(); c.fill(); c.stroke();
    if (back) { c.strokeStyle = 'rgba(16,30,40,0.5)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(x, hy - 7); c.quadraticCurveTo(x + 1, hy, x, hy + 6); c.stroke(); }
    else {
      var fx = h.face === 'down' ? x : x + side * 2.8;
      c.fillStyle = '#e8b890'; c.strokeStyle = 'rgba(20,14,28,0.7)'; c.lineWidth = 0.8; c.beginPath(); c.ellipse(fx, hy + 1.2, h.face === 'down' ? 5 : 3.9, 4.5, 0, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = 'rgba(20,40,52,0.35)'; c.beginPath(); c.ellipse(fx, hy - 1.8, h.face === 'down' ? 4.6 : 3.5, 1.6, 0, 0, TAU); c.fill();   // hood shadow on the brow
      c.fillStyle = '#1a1420';
      if (h.face === 'down') { c.fillRect(x - 3, hy + 0.4, 1.7, 2.4); c.fillRect(x + 1.3, hy + 0.4, 1.7, 2.4); c.fillStyle = 'rgba(220,110,100,0.5)'; c.fillRect(x - 4.6, hy + 3, 1.8, 1.1); c.fillRect(x + 2.8, hy + 3, 1.8, 1.1); }
      else { c.fillRect(fx + side * 1.2 - 0.85, hy + 0.4, 1.7, 2.4); c.fillStyle = 'rgba(220,110,100,0.5)'; c.fillRect(fx + side * 0.2 - 0.9, hy + 3.1, 1.8, 1.1); }
    }
    // the torch arm
    if (!back) {
      torch();
      c.strokeStyle = ink; c.lineWidth = 4.6; c.beginPath(); c.moveTo(x + (h.face === 'down' ? -6 : side * 5), y - 8 + bob); c.lineTo(txx - side * 1.2, tyy + 9); c.stroke();
      c.strokeStyle = '#356a80'; c.lineWidth = 3; c.beginPath(); c.moveTo(x + (h.face === 'down' ? -6 : side * 5), y - 8 + bob); c.lineTo(txx - side * 1.2, tyy + 9); c.stroke();
      c.fillStyle = '#e8b890'; c.strokeStyle = ink; c.lineWidth = 0.9; c.beginPath(); c.arc(txx - side * 1.2, tyy + 9.4, 2.2, 0, TAU); c.fill(); c.stroke();
    }
    c.restore();
  }
  function drawFireball(c, f, ms) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (var k = 1; k <= 6; k++) { var a = 0.32 - k * 0.045; c.fillStyle = 'rgba(255,' + (120 - k * 12) + ',40,' + a.toFixed(3) + ')'; c.beginPath(); c.arc(f.x + k * 6, f.y + Math.sin((f.age + k * 40) / 60) * 1.2, 7 - k * 0.8, 0, TAU); c.fill(); }
    var gr = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, 10); gr.addColorStop(0, '#fff6d0'); gr.addColorStop(0.35, '#ffb040'); gr.addColorStop(1, 'rgba(255,80,20,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(f.x, f.y, 10, 0, TAU); c.fill(); c.restore();
  }
  function drawImpacts(c, ms) {
    var st = shotStarts(ms);
    for (var k = 0; k < st.length; k++) {
      var age = ms - (st[k] + FB_FLIGHT); if (age < 0 || age > 420) continue;
      var p = age / 420, x = T + 6, y = runePos().y - 10;
      c.save(); c.globalCompositeOperation = 'lighter';
      for (var s = 0; s < 9; s++) { var a = s / 9 * TAU * 0.5 - Math.PI * 0.25 + hash(s + k) * 0.3, d = 6 + p * (18 + hash(s * 3 + k) * 22); c.fillStyle = 'rgba(255,' + Math.round(200 - p * 120) + ',80,' + (1 - p).toFixed(3) + ')'; c.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 3, 3); }
      c.strokeStyle = 'rgba(255,190,110,' + (0.8 * (1 - p)).toFixed(3) + ')'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 4 + p * 26, -Math.PI / 2, Math.PI / 2); c.stroke();
      c.restore();
    }
  }
  function drawCrystal(c, ms) {
    var x = tx(CRYSTAL[0]) + 16, y = ty(CRYSTAL[1]) + 24, s = Math.sin(ms / 700);
    c.fillStyle = 'rgba(6,3,10,0.5)'; c.beginPath(); c.ellipse(x, y + 2, 12, 4, 0, 0, TAU); c.fill();
    var shards = [[0, -26, 6], [-8, -14, 4], [8, -16, 4.5]];
    shards.forEach(function (sh, k) {
      var cx = x + sh[0], top = y + sh[1] + (k === 0 ? s : 0), w = sh[2];
      c.fillStyle = '#2aa0c8'; c.beginPath(); c.moveTo(cx, top); c.lineTo(cx + w, top + 8); c.lineTo(cx + w * 0.7, y); c.lineTo(cx - w * 0.7, y); c.lineTo(cx - w, top + 8); c.closePath(); c.fill();
      c.fillStyle = '#9af0ff'; c.beginPath(); c.moveTo(cx, top); c.lineTo(cx - w, top + 8); c.lineTo(cx - w * 0.7, y); c.lineTo(cx - 1, y); c.closePath(); c.fill();
    });
    c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(200,255,255,' + (0.5 + 0.4 * s).toFixed(3) + ')'; c.fillRect(x - 1, y - 24 + s, 2, 2); c.restore();
  }
  function drawRune(c, ms) {
    var rp = runePos(), p = 0.5 + 0.5 * Math.sin(ms / 300);
    c.save(); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = 'rgba(120,200,255,' + (0.25 + 0.35 * p).toFixed(3) + ')'; c.lineWidth = 1.5;
    for (var k = 0; k < 6; k++) { var a = ms / 900 + k / 6 * TAU; c.beginPath(); c.arc(rp.x + Math.cos(a) * 11, rp.y + 4 + Math.sin(a) * 5, 1.4, 0, TAU); c.stroke(); }
    c.restore();
  }
  function drawSentinel(c, ms) {
    var se = sentinelPos(), d = sentinelDir(ms);
    c.fillStyle = '#e8f2ff'; c.beginPath(); c.ellipse(se.x + Math.cos(d) * 3, se.y - 2 + Math.sin(d) * 1.5, 4, 3, 0, 0, TAU); c.fill();
    c.fillStyle = '#4060a0'; c.beginPath(); c.arc(se.x + Math.cos(d) * 4, se.y - 2 + Math.sin(d) * 2, 1.6, 0, TAU); c.fill();
  }
  function sentinelDir(ms) { return Math.PI / 2 + 0.85 * Math.sin(ms / 2200); }

  // ---------------------------------------------------------------- HUD (left unlit through uiRects)
  var HUD = { top: { x: 0, y: 0, w: W, h: HUD_H } };
  function drawHud(ms, h) {
    var hg = g.createLinearGradient(0, 0, 0, HUD_H); hg.addColorStop(0, '#120e1acc'); hg.addColorStop(1, '#0c0912ee');
    g.fillStyle = '#0c0912'; g.fillRect(0, 0, W, HUD_H); g.fillStyle = hg; g.fillRect(0, 0, W, HUD_H);
    g.fillStyle = '#ffb86b40'; g.fillRect(0, HUD_H - 1, W, 1);
    for (var k = 0; k < 5; k++) {
      var x = 14 + k * 18, y = 9, full = k < 4;
      g.fillStyle = full ? '#ff5a6a' : '#3a2c3c';
      g.beginPath(); g.moveTo(x + 6, y + 12); g.bezierCurveTo(x - 2, y + 6, x - 1, y - 1, x + 3, y); g.bezierCurveTo(x + 5, y, x + 6, y + 2, x + 6, y + 2);
      g.bezierCurveTo(x + 6, y + 2, x + 7, y, x + 9, y); g.bezierCurveTo(x + 13, y - 1, x + 14, y + 6, x + 6, y + 12); g.fill();
      if (full) { g.fillStyle = '#ffc0c8'; g.fillRect(x + 2, y + 2, 2, 2); }
    }
    g.font = '700 12px ui-sans-serif, -apple-system, Segoe UI, sans-serif'; g.textBaseline = 'middle';
    g.fillStyle = '#ece8f6'; g.textAlign = 'center'; g.fillText('THE EMBER VAULT', W / 2, HUD_H / 2 + 1);
    g.textAlign = 'right'; g.fillStyle = '#7fd4ff'; g.fillText('◆ ' + (12 + Math.floor(ms / 9000) % 9), W - 112, HUD_H / 2 + 1);
    g.fillStyle = '#958fb0'; g.font = '600 10px ui-sans-serif, -apple-system, Segoe UI, sans-serif'; g.fillText('TORCH', W - 68, HUD_H / 2 + 1);
    g.fillStyle = '#2c2742'; rr(g, W - 62, 11, 50, 8, 4); g.fill();
    var fuel = 0.35 + 0.6 * (1 - ((ms / 1000) % 60) / 60);
    var fg = g.createLinearGradient(W - 62, 0, W - 12, 0); fg.addColorStop(0, '#ff8a3a'); fg.addColorStop(1, '#ffd88a'); g.fillStyle = fg; rr(g, W - 62, 11, Math.max(8, 50 * fuel), 8, 4); g.fill();
  }

  // ---------------------------------------------------------------- frame
  function drawScene(ms) {
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(bg, 0, 0); g.setTransform(S, 0, 0, S, 0, 0);
    BRAZIERS.forEach(function (p, k) { flame(g, tx(p[0]) + 16, ty(p[1]) + 12, 1, ms, k * 2.1); });
    drawRune(g, ms);
    drawCrystal(g, ms);
    drawSentinel(g, ms);
    var h = hero(ms);
    drawHero(g, h, ms);
    fireballs(ms).forEach(function (f) { drawFireball(g, f, ms); });
    drawImpacts(g, ms);
    drawHud(ms, h);
  }

  // ---------------------------------------------------------------- lights
  var PRESETS = {
    dungeon: { ambient: 0.16, tint: 'night', over: 0.5, glow: 0.45, intensity: 1, bands: 0, bandPx: 1, softness: 6, blur: 1.5, emissive: 0 },
    night: { ambient: 0.3, tint: 'night', over: 0.5, glow: 0.35, intensity: 1, bands: 0, bandPx: 1, softness: 6, blur: 1.5, emissive: 0 },
    dusk: { ambient: 0.55, tint: 'dusk', over: 0.25, glow: 0.35, intensity: 1, bands: 0, bandPx: 1, softness: 5, blur: 1.5, emissive: 0 },
    day: { ambient: 0.92, tint: 'warm', over: 0.15, glow: 0.15, intensity: 0.8, bands: 0, bandPx: 1, softness: 5, blur: 1.5, emissive: 0 },
    retro: { ambient: 0.2, tint: 'cave', over: 0.6, glow: 0.25, intensity: 1.1, bands: 4, bandPx: 4, softness: 3, blur: 1.5, emissive: 0 }
  };
  var preset = PRESETS[Q.get('preset')] ? Q.get('preset') : 'dungeon';
  var cfg = { shadows: 'on', samples: 3, wallLight: 16 };
  var KEYS = ['over', 'ambient', 'tint', 'glow', 'intensity', 'bands', 'bandPx', 'softness', 'blur', 'emissive', 'wallLight', 'samples', 'shadows'];
  function presetCfg(name) { var o = {}; for (var k in cfg) o[k] = cfg[k]; var p = PRESETS[name]; for (k in p) o[k] = p[k]; return o; }
  var params = presetCfg(preset);
  KEYS.forEach(function (k) { if (Q.has(k)) params[k] = isNaN(Number(Q.get(k))) ? Q.get(k) : Number(Q.get(k)); });

  var post = null, lights = null, splitX = Q.has('split') ? Math.max(0, Math.min(1, Number(Q.get('split')) || 0)) : 0;
  var crystalId = 'crystal', userSeq = 0;
  var lightDefs = [];   // the editable static lights, kept so a WebGL toggle can rebuild them
  function baseLights() {
    var out = [];
    BRAZIERS.forEach(function (p, k) { out.push({ id: 'brazier-' + (k + 1), x: tx(p[0]) + 16, y: ty(p[1]) + 4, radius: 150, color: '#ff9a4a', intensity: 1.1, flicker: 0.35, speed: 1 + k * 0.13 }); });
    out.push({ id: crystalId, x: tx(CRYSTAL[0]) + 16, y: ty(CRYSTAL[1]) + 8, radius: 150, color: '#5fd8ff', intensity: 0.95 });
    var se = sentinelPos();
    out.push({ id: 'sentinel', x: se.x, y: se.y + 2, radius: 300, color: '#cfdcff', intensity: 0.85, cone: { width: 0.5, soft: 0.16, dir: Math.PI / 2 } });
    out.push({ id: 'rune', x: runePos().x, y: runePos().y, radius: 60, color: '#6ab8ff', intensity: 0.6, flicker: 0.1 });
    return out;
  }
  // The module works in canvas px. The demo keeps its 640x360 logical units and converts at this one boundary.
  var PXK = { softness: 1, blur: 1, bandPx: 1, wallLight: 1, radius: 1 };
  function rs(r) { return { x: r.x * S, y: r.y * S, w: r.w * S, h: r.h * S }; }
  function pMap(o, k) { var out = {}; for (var n in o) out[n] = PXK[n] && typeof o[n] === 'number' ? o[n] * k : o[n]; return out; }
  function pUp(o) { return pMap(o, S); }
  function dUp(d) {
    var out = {}; for (var n in d) out[n] = d[n];
    ['x', 'y', 'radius'].forEach(function (n) { if (typeof out[n] === 'number') out[n] *= S; });
    if (typeof d.follow === 'function') out.follow = function () { var p = d.follow(); return p ? { x: p.x * S, y: p.y * S } : p; };
    return out;
  }
  function dDown(L) { if (!L) return L; var out = {}; for (var n in L) out[n] = L[n]; ['x', 'y', 'radius', 'drawnRadius'].forEach(function (n) { if (typeof out[n] === 'number') out[n] /= S; }); return out; }
  function scaled(raw) {
    return {
      raw: raw, get active() { return raw.active; },
      add: function (d) { return raw.add(dUp(d)); }, set: function (id, o) { return raw.set(id, dUp(o)); }, flash: function (d) { return raw.flash(dUp(d)); },
      remove: function (id) { return raw.remove(id); }, get: function (id) { return dDown(raw.get(id)); }, list: function () { return raw.list().map(dDown); },
      params: function () { return pMap(raw.params(), 1 / S); }, setParams: function (o) { return raw.setParams(pUp(o)); },
      setEnabled: function (v) { return raw.setEnabled(v); }, render: function () { return raw.render(); }, stats: function () { return raw.stats(); }, destroy: function () { return raw.destroy(); }
    };
  }
  function makeLights(webglOn) {
    if (lights) lights.destroy();
    if (post) post.destroy();
    post = GameDNA_Post.create({ canvas: cv, clock: function () { return gameMs; }, params: { passes: 'grade', look: 'filmic', vignette: 0.3, webgl: webglOn ? 'auto' : 'off' } });
    lights = scaled(GameDNA_Lights.create({
      canvas: cv, post: post, clock: function () { return gameMs; },
      camera: function () { return { x: 0, y: 0 }; },
      solidAt: function (c, r) { return solid(c, r); }, tile: T * S,
      rects: function () { return RECTS.map(rs); },
      uiRects: function () { var r = [HUD.top]; if (splitX > 0) r.push({ x: 0, y: 0, w: Math.round(splitX * W), h: H }); return r.map(rs); },
      params: pUp(params)
    }));
    lightDefs.forEach(function (d) { lights.add(d); });
    lights.add({ id: 'torch', follow: function () { var h = hero(gameMs), o = torchOffset(h.face); return { x: h.x + o.x, y: h.y + o.y - 2 }; }, radius: 170, color: '#ffb46a', intensity: 1.15, flicker: 0.22, tag: 'hero' });
    for (var k = 0; k < 3; k++) (function (k) {
      lights.add({ id: 'fireball-' + k, keep: true, follow: function () { var f = fireballs(gameMs)[k]; return f || null; }, radius: 110, color: '#ff7a2a', intensity: 1.35, flicker: 0.3, speed: 2 });
    })(k);
    lights.setEnabled($('lon').checked);
    window.__lights = lights.raw; window.__post = post;
    applySplit();
  }
  function tick(ms) {
    if (!lights) return;
    lights.set(crystalId, { intensity: 0.85 + 0.25 * Math.sin(ms / 700) });
    lights.set('sentinel', { cone: { width: 0.5, soft: 0.16, dir: sentinelDir(ms) } });
  }
  function frame() { tick(gameMs); drawScene(gameMs); lights.render(); setTimeout(function () { updateGizmo(); if (FREEZE) status(); }, 0); }   // live pages refresh the status on a timer
  function addImpact(hitMs) { lights.flash({ x: T + 10, y: runePos().y - 10, radius: 170, color: '#ffae5a', intensity: 1.9, ms: 420, start: hitMs }); }

  // ---------------------------------------------------------------- UI
  var $ = function (id) { return document.getElementById(id); };
  function fill(r) { r.style.setProperty('--fill', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); }
  function fmt(k, v) { v = Number(v); return k === 'wallLight' || k === 'radius' || k === 'dir' || k === 'width' ? String(Math.round(v)) : v.toFixed(2); }
  function setOut(r, v) { r.parentNode.querySelector('output').textContent = v; }
  function syncUI() {
    var P = lights.params();
    document.querySelectorAll('input[data-k]').forEach(function (r) { var k = r.dataset.k; r.value = P[k]; fill(r); setOut(r, fmt(k, P[k])); });
    segSet('tint', P.tint); segSet('bands', String(P.bands)); segSet('samples', String(P.samples)); segSet('preset', preset);
    $('shadows').checked = P.shadows !== 'off';
  }
  function segSet(id, v) { document.querySelectorAll('#' + id + ' button').forEach(function (x) { x.setAttribute('aria-checked', String(x.dataset.v === v)); }); }
  function seg(id, fn) {
    document.querySelectorAll('#' + id + ' button').forEach(function (bt) {
      bt.addEventListener('click', function () { segSet(id, bt.dataset.v); fn(bt.dataset.v); if (FREEZE) frame(); });
    });
  }
  function setP(o) { for (var k in o) params[k] = o[k]; lights.setParams(o); }
  document.querySelectorAll('input[data-k]').forEach(function (r) {
    r.addEventListener('input', function () { var o = {}; o[r.dataset.k] = Number(r.value); setP(o); fill(r); setOut(r, fmt(r.dataset.k, r.value)); if (FREEZE) frame(); });
  });
  seg('tint', function (v) { setP({ tint: v }); });
  seg('bands', function (v) { setP({ bands: Number(v), bandPx: Number(v) > 0 ? 4 : 1 }); });   // 4 px cells: steps, not contour rings, on this HD canvas
  seg('samples', function (v) { setP({ samples: Number(v) }); });
  seg('preset', function (v) { preset = v; params = presetCfg(v); lights.setParams(params); syncUI(); });
  $('shadows').addEventListener('change', function () { setP({ shadows: $('shadows').checked ? 'on' : 'off' }); if (FREEZE) frame(); });
  $('lon').addEventListener('change', function () { lights.setEnabled($('lon').checked); if (FREEZE) frame(); });
  $('webgl').addEventListener('change', function () { makeLights($('webgl').checked); syncUI(); frame(); status(); });
  function applySplit() {
    var r = $('splitR'); r.value = splitX; fill(r); $('o-split').textContent = splitX > 0 ? Math.round(splitX * 100) + '%' : 'off';
    var line = $('split'); line.style.display = splitX > 0 && lights && lights.active ? 'block' : 'none'; line.style.left = (splitX * 100) + '%';
  }
  $('splitR').addEventListener('input', function () { splitX = Number($('splitR').value); applySplit(); if (FREEZE) frame(); });

  // light editor
  var selected = Q.get('select') || null, drag = null;
  function toCanvas(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
  function pick(p) {
    var best = null, bd = 26 * 26;
    lights.list().forEach(function (L) { if (!isFinite(L.x) || L.flash) return; var d = (L.x - p.x) * (L.x - p.x) + (L.y - p.y) * (L.y - p.y); if (d < bd) { bd = d; best = L; } });
    return best;
  }
  function editable(id) { var d = lightDefs.filter(function (x) { return x.id === id; })[0]; return d || null; }
  function movable(id) { return /^light-/.test(String(id)); }   // prop lights (braziers, crystal, rune, sentinel) stay on their prop
  cv.addEventListener('pointerdown', function (e) {
    var p = toCanvas(e); if (p.y < HUD_H) return;
    var L = pick(p);
    if (L) { selected = L.id; drag = editable(L.id) && movable(L.id) ? L.id : null; }
    else {
      var id = 'light-' + (++userSeq), c = $('lcolor').value;
      var d = { id: id, x: Math.round(p.x), y: Math.round(p.y), radius: 140, color: c, intensity: 1, flicker: 0.15 };
      lightDefs.push(d); lights.add(d); selected = id; drag = id;
    }
    try { cv.setPointerCapture(e.pointerId); } catch (x) { }
    syncSel(); if (FREEZE) frame();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag) return; var p = toCanvas(e), d = editable(drag); if (!d) return;
    d.x = Math.round(Math.max(0, Math.min(W, p.x))); d.y = Math.round(Math.max(HUD_H, Math.min(H, p.y))); lights.set(drag, { x: d.x, y: d.y }); if (FREEZE) frame();
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) { cv.addEventListener(ev, function () { drag = null; }); });
  window.addEventListener('keydown', function (e) { if ((e.key === 'Delete' || e.key === 'Backspace') && selected && e.target === document.body) { removeSel(); e.preventDefault(); } });
  function removeSel() {
    if (!selected) return;
    lights.remove(selected); lightDefs = lightDefs.filter(function (d) { return d.id !== selected; }); selected = null; syncSel(); if (FREEZE) frame();
  }
  $('ldel').addEventListener('click', removeSel);
  $('fire').addEventListener('click', function () { extraShots.push(gameMs); if (extraShots.length > 6) extraShots.shift(); });
  function selDef() { var L = selected && lights.get(selected); return L; }
  function syncSel() {
    var L = selDef(), on = !!L;
    $('selname').textContent = on ? L.id + (L.follow ? ' (follows its actor)' : movable(L.id) ? ' (drag to move)' : ' (prop light: edit colour and radius)') : 'none: click a light in the scene to edit it';
    document.querySelectorAll('input[data-l]').forEach(function (r) {
      r.disabled = !on; if (!on) return;
      var k = r.dataset.l, v = k === 'dir' ? (L.cone ? Math.round((isFinite(Number(L.cone.dir)) ? L.cone.dir : Math.PI / 2) * 180 / Math.PI) : 90) : k === 'width' ? (L.cone ? Math.round((L.cone.width || 0.9) * 180 / Math.PI) : 50) : L[k];
      r.value = v; fill(r); setOut(r, fmt(k, v));
    });
    $('lcone').checked = on && !!L.cone; $('lcone').disabled = !on; $('ldel').disabled = !on;
    if (on) $('lcolor').value = L.color;
    updateGizmo();
  }
  function patchSel(o) {
    if (!selected) return; lights.set(selected, o);
    var d = editable(selected); if (d) for (var k in o) d[k] = o[k];
    if (FREEZE) frame();
  }
  $('lcolor').addEventListener('input', function () { patchSel({ color: $('lcolor').value }); });
  function coneFromUI() { return { dir: Number(document.querySelector('[data-l=dir]').value) * Math.PI / 180, width: Number(document.querySelector('[data-l=width]').value) * Math.PI / 180, soft: 0.2 }; }
  $('lcone').addEventListener('change', function () { patchSel({ cone: $('lcone').checked ? coneFromUI() : null }); });
  document.querySelectorAll('input[data-l]').forEach(function (r) {
    r.addEventListener('input', function () {
      var k = r.dataset.l; fill(r); setOut(r, fmt(k, r.value));
      if (k === 'dir' || k === 'width') { if ($('lcone').checked) patchSel({ cone: coneFromUI() }); }
      else { var o = {}; o[k] = Number(r.value); patchSel(o); }
    });
  });
  function updateGizmo() {
    var gz = $('gizmo'), L = selected && lights ? lights.get(selected) : null;
    if (!L || !isFinite(L.x) || !lights.active) { gz.style.display = 'none'; return; }
    var r = cv.getBoundingClientRect(), f = $('frame').getBoundingClientRect(), s = r.width / W;
    gz.style.display = 'block'; gz.style.left = (r.left - f.left + L.x * s) + 'px'; gz.style.top = (r.top - f.top + L.y * s) + 'px';
    var d = Math.max(18, Math.min(60, (L.radius || 100) * 0.18)) * s * 2; gz.style.width = gz.style.height = d + 'px';
    $('gname').textContent = L.id;
  }
  function status() {
    var s = lights.stats(), ps = post.stats(), m = $('mode');
    m.className = s.active ? '' : 'off';
    m.innerHTML = s.active ? '<b>' + (s.mode === 'webgl2' ? 'WebGL2' : 'WebGL') + '</b> &middot; ' + ($('lon').checked ? s.drawn + ' lights drawn' : 'lights switched off') : '<b>2D only</b> &middot; ' + (s.reason === 'option' ? 'WebGL switched off' : s.reason === 'url' ? 'off by URL' : 'WebGL unavailable') + ': the plain game';
    $('cost').innerHTML = s.active ? 'light map <b>' + s.map + '</b> &middot; <b>' + s.avgBuildMs.toFixed(2) + ' ms</b> cpu' : 'light map <b>none</b>';
    $('size').innerHTML = s.active ? 'overlay <b>' + ps.w + '&times;' + ps.h + '</b> &middot; ' + s.edges + ' shadow edges' : 'canvas <b>' + W + '&times;' + H + '</b>';
    $('stat').innerHTML = s.active ? 'passes: <b>' + ps.passes.join(' &rarr; ') + '</b><br>lights ' + s.lights + ' (' + s.followers + ' follow actors, ' + s.flashes + ' flashes) &middot; mean light ' + s.meanLight.toFixed(2) : 'lights are tracked, nothing is drawn';
  }

  // ---------------------------------------------------------------- boot
  paintStatic();
  lightDefs = baseLights();
  makeLights(!/[?&]webgl=0/.test(location.search));
  $('webgl').checked = post.active;
  syncUI(); syncSel();
  /* text state for critics and tools/sprites/statecheck.py: one character (the torch bearer, a 4-way figure drawn by drawHero from hero(ms).face;
     the left view is the right view mirrored by `side`). Feet are 10 px below hero().y. The sentinel eye and the fireballs are props. */
  window.__state = function () {
    var h = hero(gameMs), n = hero(gameMs + 16), sideView = h.face === 'left' || h.face === 'right', o = torchOffset(h.face);
    return { t: Math.round(gameMs), actors: [{ id: 'hero', x: Math.round(h.x), y: Math.round(h.y) + 10, facing: sideView ? h.face : null, target: null,
      vx: Math.round((n.x - h.x) * 100) / 100, noFace: sideView ? undefined : h.face + ' frame', torchX: Math.round(h.x + o.x) }] };
  };
  window.__demo = function () { return { gameMs: gameMs, hero: hero(gameMs), fireballs: fireballs(gameMs), lights: lights.stats(), list: lights.list() }; };

  if (HAS_T) {
    impactsBetween(T0 - 500, T0, addImpact);
    gameMs = T0; frame(); setTimeout(function () { status(); syncSel(); }, 0);
    if (FREEZE) { window.__frozen = true; return; }
  } else frame();
  var last = null, acc = 0;
  function loop(now) {
    if (last === null) last = now;
    acc += Math.min(100, now - last); last = now;
    var prev = gameMs;
    while (acc >= 1000 / 60) { gameMs += 1000 / 60; acc -= 1000 / 60; }
    if (gameMs !== prev) { impactsBetween(prev, gameMs, addImpact); frame(); }
    requestAnimationFrame(loop);
  }
  setInterval(status, 500);
  requestAnimationFrame(loop);
})();
