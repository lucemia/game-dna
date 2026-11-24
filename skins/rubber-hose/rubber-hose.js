/* GameDNA skin 'rubber-hose' · 1930s rubber-hose cartoon · needs skin-api.js first
 *
 * Everything is procedural (no image files, no traced characters). One sepia print ramp plus two two-strip accents
 * (red-orange `hot`, blue-green `teal`), thick EVEN ink lines (no taper), a line "boil" (every outline re-drawn with a
 * slightly different wobble 12 times a second, 3 drawings in a loop), the whole world breathing on a 120 BPM beat, and a
 * film-print post pass (grain, flicker, dust, hair, vignette, rounded gate corners, gate weave).
 *
 *   frame    printed title card: near-black body, white double rule, dot-in-ring corners, hard ink drop; team = corner dots
 *   text     hand-lettered display caps ('Luckiest Guy' in docs; Cooper Black / Arial Rounded fallback); each letter sits a
 *            little off the line and tilts a little (fixed per string, so it never jitters)
 *   number   fat title-card numerals: white face, thick ink outline, ink drop, shine band; stretch while airborne, squash on
 *            landing; crit = red-orange numerals on a jagged POW burst with a ribbon label; MISS on a puff cloud; heal sparkles
 *   overlay  flat print tint + world-anchored hatching (move /, attack \, threat cross-hatch, heal dots), thick boiling ink
 *            boundary; breathes on the beat
 *   bar      a rubber hose: rounded ink tube, flat fill, white highlight; status tab = ink badge with a letter
 *   cursor   bracket = four fat ink corners that bounce on the beat; hand = a white four-finger glove pointing right
 *   path     (extra) a white rubber hose with an ink outline that ends in a pointing glove
 *   tile / prop / unitToken / atmosphere: sepia ground, props with faces that breathe, noodle-limbed units with pie-cut
 *            eyes, white gloves and big shoes; film post pass in the 'final' phase
 *
 * Time: t in seconds. Boil frame = floor(t * 12) % 3 ("on twos"); beat = t * 2 (120 BPM). Same t, same picture.
 */
(function (root) {
  'use strict';
  var API = root.GameDNA_Skin;
  if (!API) { if (root.console) console.error('rubber-hose.js: load skin-api.js first'); return; }
  var C = API.color, rgba = C.rgba, mix = C.mix, TAU = Math.PI * 2;

  /* ---------- seeded noise ---------- */
  function hash2(i, j, s) { var h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function vnoise(x, y, s) {
    var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    var a = hash2(i, j, s), b = hash2(i + 1, j, s), c = hash2(i, j + 1, s), d = hash2(i + 1, j + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function rng(seed) { var a = seed | 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function strSeed(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- clocks ---------- */
  var BOIL_FPS = 12, BPM = 120;
  function boilOf(t) { return Math.floor((t || 0) * BOIL_FPS + 1e-6) % 3; }
  function twos(t) { return Math.floor((t || 0) * BOIL_FPS + 1e-6) / BOIL_FPS; }           // animation held for 2 film frames
  function beatOf(t) { return twos(t) * BPM / 60; }                                           // beats since 0
  function breathe(t, amp) { return 1 + (amp == null ? 0.05 : amp) * Math.cos(TAU * beatOf(t)); }   // >1 on the beat (stretch)
  function hop(t) { var f = beatOf(t) % 1; return Math.max(0, Math.sin(f * Math.PI)); }        // 0..1..0 once a beat

  /* ---------- palette ---------- */
  var PAL = {
    ink: '#16110c', paper: '#efe3c8',
    sepia: { paper: '#efe3c8', light: '#d6c6a4', mid: '#a8936f', dmid: '#7a6648', dark: '#4a3b2b', white: '#fffbf0' },
    ui: { fill: '#16110c', fillTo: '#221911', edge: '#fffbf0', highlight: '#fffbf0', shadow: 'rgba(22,17,12,0.55)', select: '#2c6b61', well: '#3a2d20', rule: '#fffbf0' },
    team: { a: '#3f8a7e', b: '#c4532f', n: '#a8936f', aLight: '#86c2b2', aDark: '#24564e', bLight: '#e58a5e', bDark: '#7e3220', aText: '#86c2b2', bText: '#e58a5e' },
    overlay: {
      move: { fill: '#3f8a7e', edge: '#1d4a42', alpha: 0.36 }, attack: { fill: '#c4532f', edge: '#6e2a18', alpha: 0.38 },
      threat: { fill: '#4a3b2b', edge: '#16110c', alpha: 0.26 }, heal: { fill: '#86c2b2', edge: '#24564e', alpha: 0.4 },
      path: { core: '#fffbf0', light: '#fffbf0', mid: '#d6c6a4', dark: '#16110c', outline: '#16110c', spark: '#fffbf0' }
    },
    fx: { hot: '#c4532f', hotL: '#e58a5e', cold: '#3f8a7e', coldL: '#86c2b2', heal: '#86c2b2', crit: '#c4532f', status: '#a8936f', white: '#fffbf0', ink: '#16110c' },
    text: {
      main: '#fffbf0', main2: '#fffbf0', shadow: 'rgba(0,0,0,0)', outline: '#16110c', dim: '#8a7a62', dim2: '#8a7a62',
      accent: '#e58a5e', select: '#fffbf0', title: '#fffbf0', title2: '#fffbf0', label: '#d6c6a4', label2: '#d6c6a4',
      gold: '#e58a5e', gold2: '#e58a5e', plate: '#fffbf0', plateShadow: 'rgba(0,0,0,0)', pointer: '#fffbf0', pointerEdge: '#16110c'
    },
    // number kinds: [face, accent behind]
    numbers: { damage: ['#fffbf0', null], crit: ['#e8693d', '#efe3c8'], heal: ['#9fd3c3', '#3f8a7e'], mp: ['#9fd3c3', '#3f8a7e'], miss: ['#efe3c8', '#d6c6a4'], status: ['#d6c6a4', null] },
    bars: { track: '#3a2d20', charge: '#d6c6a4', haste: '#86c2b2', slow: '#a8936f', ready: '#fffbf0', queued: '#86c2b2', enemy: '#c4532f', enemyFull: '#e58a5e', hp: '#3f8a7e', hpLow: '#c4532f' },
    terrain: { grass: '#cdbb94', forest: '#9b8763', water: '#6f6553', hill: '#bba67c', mountain: '#9a8a70', road: '#d8c8a2', bridge: '#a08060', fort: '#a3957f', sand: '#dccb9f', wall: '#7a6a55', floor: '#c4b496' }
  };
  var S = PAL.sepia, INK = PAL.ink, WHITE = S.white;
  var DISPLAY = "'Luckiest Guy', 'Cooper Black', 'Arial Rounded MT Bold', 'Arial Black', Impact, sans-serif";

  /* ---------- geometry ---------- */
  function ell(cx, cy, rx, ry, n, a0) { var p = []; n = n || 16; a0 = a0 || 0; for (var i = 0; i < n; i++) { var a = a0 + i / n * TAU; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return p; }
  function arcPts(cx, cy, rx, ry, a0, a1, n) { var p = []; for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return p; }
  function rrect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); var p = [];
    [[x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI]].forEach(function (c) { for (var i = 0; i <= 4; i++) { var a = c[2] + i / 4 * Math.PI / 2; p.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); } });
    return p;
  }
  function quad(a, c, b, n) { var p = []; n = n || 10; for (var i = 0; i <= n; i++) { var t = i / n, u = 1 - t; p.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } return p; }
  // rubber hose: a->b along one quadratic bend, even width w, round ends (returns a closed outline)
  function noodle(a, b, bend, w) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    var mid = quad(a, [(a[0] + b[0]) / 2 + nx * bend, (a[1] + b[1]) / 2 + ny * bend], b, 8), Lp = [], Rp = [], n = mid.length, hw = w / 2;
    for (var i = 0; i < n; i++) {
      var p = mid[i], q = mid[Math.min(n - 1, i + 1)], o = mid[Math.max(0, i - 1)], tx = q[0] - o[0], ty = q[1] - o[1], l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      Lp.push([p[0] - ty * hw, p[1] + tx * hw]); Rp.push([p[0] + ty * hw, p[1] - tx * hw]);
    }
    var eA = Math.atan2(mid[n - 1][1] - mid[n - 2][1], mid[n - 1][0] - mid[n - 2][0]), bA = Math.atan2(mid[1][1] - mid[0][1], mid[1][0] - mid[0][0]);
    return Lp.concat(arcPts(b[0], b[1], hw, hw, eA + Math.PI / 2, eA - Math.PI / 2, 5), Rp.reverse(), arcPts(a[0], a[1], hw, hw, bA - Math.PI / 2, bA - Math.PI * 1.5, 5));
  }
  // resample a polyline to ~step spacing (so the boil wobbles along long straight sides too)
  function dense(pts, closed, step) {
    var out = [], n = pts.length, m = closed ? n : n - 1;
    for (var i = 0; i < m; i++) {
      var a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / step));
      for (var j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]);
    }
    if (!closed) out.push(pts[n - 1]);
    return out;
  }

  /* ---------- the boil: one smooth displacement field per drawing (3 drawings), so shared points stay shared ---------- */
  function disp(x, y, bf, amp) {
    if (!amp) return [x, y];
    var o = bf * 13.7;
    return [x + (vnoise(x * 0.38 + o, y * 0.38, 31) - 0.5) * 2 * amp, y + (vnoise(x * 0.38, y * 0.38 + o, 37) - 0.5) * 2 * amp];
  }
  function tracePath(ctx, pts, closed, amp, bf) {
    var P = amp ? dense(pts, closed, 1.6) : pts;
    ctx.beginPath();
    for (var i = 0; i < P.length; i++) { var q = amp ? disp(P[i][0], P[i][1], bf, amp) : P[i]; if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
    if (closed) ctx.closePath();
  }
  // ink(ctx, pts, {fill, lw, col, closed, amp, bf}) : fill, then an EVEN ink line (round joins and caps, no taper)
  function ink(ctx, pts, o) {
    o = o || {}; var closed = o.closed !== false, amp = o.amp == null ? 0.28 : o.amp;
    tracePath(ctx, pts, closed, amp, o.bf || 0);
    if (o.fill && closed) { ctx.fillStyle = o.fill; ctx.fill(); }
    var lw = o.lw == null ? 0.8 : o.lw;
    if (lw > 0) { ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = o.col || INK; ctx.stroke(); }
  }
  // lit: flat fill + ONE hard crescent of shade on the lower right (light from the upper left); never a gradient
  function lit(ctx, pts, base, shade, o) {
    o = o || {}; var off = o.off || [-0.9, -0.7], amp = o.amp == null ? 0.28 : o.amp, bf = o.bf || 0;
    ctx.save(); tracePath(ctx, pts, true, amp, bf); ctx.fillStyle = shade; ctx.fill(); ctx.clip();
    ctx.beginPath(); for (var i = 0; i < pts.length; i++) { var q = [pts[i][0] + off[0], pts[i][1] + off[1]]; if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); } ctx.closePath();
    ctx.fillStyle = base; ctx.fill(); ctx.restore();
    if (o.lw !== 0) ink(ctx, pts, { lw: o.lw == null ? 0.8 : o.lw, amp: amp, bf: bf });
  }

  /* ---------- character parts ---------- */
  // pie-cut eye: white eyeball, black pupil with a wedge cut out of its upper right
  function pieEye(ctx, x, y, rx, ry, o) {
    o = o || {}; var bf = o.bf || 0, lw = o.lw == null ? 0.45 : o.lw, lk = o.look || [0, 0];
    ink(ctx, ell(x, y, rx, ry, 14), { fill: o.white || WHITE, lw: lw, amp: 0.08, bf: bf });
    if (o.shut) { ink(ctx, [[x - rx, y + ry * 0.1], [x + rx, y + ry * 0.1]], { closed: false, lw: lw * 1.3, amp: 0.05, bf: bf }); return; }
    var px = x + lk[0] * rx * 0.3, py = y + ry * 0.14 + lk[1] * ry * 0.2, prx = rx * 0.66, pry = ry * 0.76, P = [];
    for (var i = 0; i <= 14; i++) { var a = -0.95 + i / 14 * (TAU - 0.95); P.push([px + Math.cos(a) * prx, py + Math.sin(a) * pry]); }
    P.push([px + prx * 0.12, py - pry * 0.08]);
    ctx.beginPath(); P.forEach(function (q, k) { if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.fillStyle = INK; ctx.fill();
  }
  // white cartoon glove pointing along +x. Origin = fingertip; s = 1 is ~8.8 native px long and ~6.6 tall (fits the 9x7 hand
  // box). Rounded cuff band, a heavy palm, thumb on top, two curled knuckles below, one pointing finger. Outlined as a union.
  function glove(ctx, x, y, ang, s, o) {
    o = o || {}; var bf = o.bf || 0, lw = (o.lw == null ? 0.55 : o.lw);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
    var L = lw / s, parts = [
      noodle([-3.6, -0.95], [-0.8, -0.95], 0, 1.75),                  // pointing finger
      ell(-4.7, 0.25, 2.5, 2.3, 16),                                  // palm
      ell(-3.9, -2.2, 1.05, 0.8, 10),                                 // thumb on top
      ell(-2.75, 0.85, 1.0, 0.85, 10), ell(-3.0, 2.15, 0.95, 0.8, 10),   // curled knuckles
      rrect(-8.8, -2.15, 2.6, 4.7, 1.1)                               // rounded cuff band
    ];
    parts.forEach(function (p) { ink(ctx, p, { lw: L * 2.2, amp: 0.06 / s, bf: bf }); });
    parts.forEach(function (p) { ctx.beginPath(); p.forEach(function (q, k) { if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.fillStyle = o.fill || WHITE; ctx.fill(); });
    ink(ctx, [[-6.3, -1.7], [-6.3, 2.3]], { closed: false, lw: L * 0.8, amp: 0 });              // cuff seam
    ink(ctx, [[-3.6, 0.2], [-2.4, 0.15]], { closed: false, lw: L * 0.7, amp: 0 });              // knuckle creases
    ink(ctx, [[-3.8, 1.5], [-2.6, 1.5]], { closed: false, lw: L * 0.7, amp: 0 });
    ctx.restore();
  }
  // unit glove: palm, three finger bumps toward ang, a thumb, a cuff band toward the arm. r ~ palm radius.
  function mitt(ctx, x, y, r, ang, bf) {
    var c = Math.cos(ang), sn = Math.sin(ang), P = function (u, v) { return [x + c * u - sn * v, y + sn * u + c * v]; };
    var parts = [ell(x, y, r, r, 12)];
    [-0.62, 0, 0.62].forEach(function (a) { var q = P(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95); parts.push(ell(q[0], q[1], r * 0.44, r * 0.44, 8)); });
    var th = P(0.1 * r, -r * 0.95); parts.push(ell(th[0], th[1], r * 0.42, r * 0.42, 8));
    var c0 = P(-r * 1.15, -r * 0.62), c1 = P(-r * 0.55, -r * 0.62), c2 = P(-r * 0.55, r * 0.62), c3 = P(-r * 1.15, r * 0.62); parts.push([c0, c1, c2, c3]);
    parts.forEach(function (p) { ink(ctx, p, { lw: 0.9, amp: 0.05, bf: bf }); });
    parts.forEach(function (p) { ctx.beginPath(); p.forEach(function (q, k) { if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath(); ctx.fillStyle = WHITE; ctx.fill(); });
    var a0 = P(-r * 0.55, -r * 0.55), a1 = P(-r * 0.55, r * 0.55); ink(ctx, [a0, a1], { closed: false, lw: 0.3, amp: 0 });
  }
  function star(ctx, x, y, r, o) {
    o = o || {}; var p = [], rot = o.rot || 0, n = o.n || 5;
    for (var i = 0; i < n * 2; i++) { var a = rot - Math.PI / 2 + i / (n * 2) * TAU, rr = i & 1 ? r * (o.inner || 0.45) : r; p.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
    ink(ctx, p, { fill: o.fill || WHITE, lw: o.lw == null ? 0.5 : o.lw, amp: o.amp == null ? 0.06 : o.amp, bf: o.bf || 0 });
  }
  function puffPts(x, y, rx, ry, seed) {
    var p = [], r = rng(seed), n = 7;
    for (var i = 0; i < n; i++) { var a0 = i / n * TAU, a1 = (i + 1) / n * TAU, k = 0.8 + 0.2 * r(); for (var j = 0; j <= 4; j++) { var a = a0 + (a1 - a0) * j / 4, b = 1 + Math.sin(j / 4 * Math.PI) * 0.28; p.push([x + Math.cos(a) * rx * k * b, y + Math.sin(a) * ry * k * b]); } }
    return p;
  }

  /* ---------- textures: film grain (dark and light specks), cached ---------- */
  var TEX = {};
  function grainTex(key, light) {
    if (TEX[key]) return TEX[key];
    if (typeof document === 'undefined') return null;
    var n = 128, c = document.createElement('canvas'); c.width = c.height = n;
    var g = c.getContext('2d'), id = g.createImageData(n, n), d = id.data, r = rng(light ? 4411 : 2207);
    for (var i = 0; i < n * n; i++) {
      var v = r(), k = i * 4;
      if (light) { d[k] = 255; d[k + 1] = 248; d[k + 2] = 230; d[k + 3] = v > 0.86 ? (v - 0.86) * 1300 : 0; }
      else { d[k] = 22; d[k + 1] = 17; d[k + 2] = 12; d[k + 3] = v > 0.8 ? (v - 0.8) * 900 : 0; }
    }
    g.putImageData(id, 0, 0);
    return (TEX[key] = c);
  }
  function texFill(ctx, tex, alpha, ox, oy, px) {
    if (!tex) return;
    var p = ctx.createPattern(tex, 'repeat'), s = API.scaleOf(ctx), k = (px || 1) / s;
    if (p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().translate(ox || 0, oy || 0).scale(k));
    var pa = ctx.globalAlpha; ctx.globalAlpha = pa * alpha; ctx.fillStyle = p; ctx.fill(); ctx.globalAlpha = pa;
  }

  var PK = null;
  function pocketCanvas() { if (!PK && typeof document !== 'undefined') { PK = document.createElement('canvas'); PK.width = PK.height = 5; } return PK; }

  /* ---------- type ---------- */
  var MS = null, CAP = {};
  function mctx() { if (!MS && typeof document !== 'undefined') MS = document.createElement('canvas').getContext('2d'); return MS; }
  function fontCss(f, sc) { return (f.style || 'normal') + ' ' + (f.weight || 400) + ' ' + (f.size * (sc || 1)) + 'px ' + f.family; }
  function fontOf(sk, name) { return sk.fonts[name || 'ui'] || sk.fonts.ui; }
  function caseOf(f, s) { s = String(s); return f.uppercase ? s.toUpperCase() : s; }
  function capRatio(f) {   // cap height / size of the font as the browser resolved it (measured once, reset when fonts load)
    var k = f.family + '|' + (f.weight || 400);
    if (CAP[k]) return CAP[k];
    var g = mctx(); if (!g) return f.ascent || 0.72;
    g.font = fontCss(f, 100 / f.size); var m = g.measureText('H'), r = m.actualBoundingBoxAscent ? m.actualBoundingBoxAscent / 100 : (f.ascent || 0.72);
    return (CAP[k] = clamp(r, 0.55, 0.9));
  }
  function charW(f, ch, sc) { var g = mctx(); if (!g) return f.size * (sc || 1) * 0.6; g.font = fontCss(f, sc); return g.measureText(ch).width; }
  function measureF(f, s, sc) {
    s = caseOf(f, s); var w = 0, ls = (f.letterSpacing || 0) * (sc || 1);
    for (var i = 0; i < s.length; i++) w += charW(f, s[i], sc) + (i < s.length - 1 ? ls : 0);
    return w;
  }
  // hand-lettered: each letter sits a little off the line and tilts a little; the offsets are fixed per string and index
  function letters(ctx, f, str, x, y, sc, seed, jit) {
    var s = caseOf(f, str), ls = (f.letterSpacing || 0) * sc, ch = capRatio(f) * f.size * sc, out = [], cx = x;
    for (var i = 0; i < s.length; i++) {
      var w = charW(f, s[i], sc), r1 = hash2(seed, i, 5), r2 = hash2(seed, i, 9);
      out.push({ ch: s[i], x: cx, w: w, dy: (r1 - 0.5) * jit * sc * 0.9, rot: (r2 - 0.5) * jit * 0.09, cap: ch });
      cx += w + ls;
    }
    return out;
  }
  function drawLetters(ctx, f, L, y, sc, fill, o) {
    o = o || {}; ctx.font = fontCss(f, sc); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    var passes = o.outline ? ['out', 'fill'] : ['fill'];
    passes.forEach(function (pass) {
      L.forEach(function (l) {
        if (l.ch === ' ') return;
        ctx.save(); ctx.translate(l.x + l.w / 2, y + l.cap + l.dy); ctx.rotate(l.rot);
        if (pass === 'out') { ctx.lineWidth = o.ow; ctx.strokeStyle = o.outline; ctx.strokeText(l.ch, 0, 0); ctx.fillStyle = o.outline; ctx.fillText(l.ch, 0, 0); }
        else { ctx.fillStyle = fill; ctx.fillText(l.ch, 0, 0); }
        ctx.restore();
      });
    });
  }

  /* ---------- number layout: canonical order main, suffix, label ---------- */
  function numLayout(sk, s, o) {
    var sc0 = o.scale || 1, sc = sc0 * (o.kind === 'crit' && o.big !== false ? 1.28 : 1), items = [], x = 0, i;
    var fi = o.kind === 'miss' || o.kind === 'status' || !/^[0-9+\-]+$/.test(s) ? fontOf(sk, 'word') : fontOf(sk, 'num');
    var cap = capRatio(fi) * fi.size * sc, ls = (fi.letterSpacing || 0) * sc;
    for (i = 0; i < s.length; i++) { var w = Math.max(charW(fi, caseOf(fi, s[i]), sc), fi.size * sc * 0.42);   /* narrow letters (I, 1) keep room */ items.push({ ch: caseOf(fi, s[i]), role: 'main', x: x, y: 0, w: w, cw: charW(fi, caseOf(fi, s[i]), sc), h: cap, font: fi, s: sc }); x += w + ls; }
    var nw = Math.max(0, x - ls);
    if (o.suffix) {
      var sf = fontOf(sk, 'label'), sh = capRatio(sf) * sf.size * sc0, sx = nw + 1.2;
      for (i = 0; i < o.suffix.length; i++) { var cw = charW(sf, caseOf(sf, o.suffix[i]), sc0); items.push({ ch: caseOf(sf, o.suffix[i]), role: 'suffix', x: sx, y: cap - sh, w: cw, h: sh, font: sf, s: sc0 }); sx += cw + (sf.letterSpacing || 0) * sc0; }
      x = sx;
    }
    var total = o.suffix ? x : nw;
    if (o.label) {
      var lf = fontOf(sk, 'label'), lab = caseOf(lf, o.label), lw = measureF(lf, lab, sc0), lh = capRatio(lf) * lf.size * sc0, gap = o.labelGap == null ? 3 : o.labelGap * 0.5 + 2.5, lx = (nw - lw) / 2, ly = -lh - gap;
      for (i = 0; i < lab.length; i++) { var lcw = charW(lf, lab[i], sc0); items.push({ ch: lab[i], role: 'label', x: lx, y: ly, w: lcw, h: lh, font: lf, s: sc0 }); lx += lcw + (lf.letterSpacing || 0) * sc0; }
    }
    items.forEach(function (it, k) { it.i = k; });
    return { items: items, w: total, nw: nw, h: cap, sc: sc };
  }

  /* ---------- smooth path (rounded corners), sampled ---------- */
  function smoothPath(points, rad) {
    var out = [], P = points;
    if (P.length < 2) return P.map(function (p) { return [p.x, p.y]; });
    var add = function (x, y) { var l = out[out.length - 1]; if (!l || Math.hypot(x - l[0], y - l[1]) > 0.05) out.push([x, y]); };
    add(P[0].x, P[0].y);
    for (var i = 1; i < P.length - 1; i++) {
      var a = P[i - 1], b = P[i], c = P[i + 1], d1 = Math.hypot(b.x - a.x, b.y - a.y), d2 = Math.hypot(c.x - b.x, c.y - b.y), R = Math.min(rad, d1 / 2, d2 / 2);
      var p0 = [b.x - (b.x - a.x) / d1 * R, b.y - (b.y - a.y) / d1 * R], p1 = [b.x + (c.x - b.x) / d2 * R, b.y + (c.y - b.y) / d2 * R];
      var l = out[out.length - 1], seg = Math.hypot(p0[0] - l[0], p0[1] - l[1]), n = Math.ceil(seg / 1);
      for (var k = 1; k <= n; k++) add(l[0] + (p0[0] - l[0]) * k / n, l[1] + (p0[1] - l[1]) * k / n);
      for (k = 1; k <= 8; k++) { var t = k / 8, u = 1 - t; add(u * u * p0[0] + 2 * u * t * b.x + t * t * p1[0], u * u * p0[1] + 2 * u * t * b.y + t * t * p1[1]); }
    }
    var L = out[out.length - 1], E = P[P.length - 1], m = Math.ceil(Math.hypot(E.x - L[0], E.y - L[1]) / 1);
    for (var q = 1; q <= m; q++) add(L[0] + (E.x - L[0]) * q / m, L[1] + (E.y - L[1]) * q / m);
    return out;
  }

  function withSmooth(ctx, fn) { var sm = ctx.imageSmoothingEnabled, pa = ctx.globalAlpha; ctx.save(); ctx.imageSmoothingEnabled = true; try { fn(); } finally { ctx.restore(); ctx.imageSmoothingEnabled = sm; ctx.globalAlpha = pa; } }

  /* =============================== the skin =============================== */
  var skin = {
    id: 'rubber-hose', name: '1930s rubber-hose cartoon', pixel: false,
    native: { w: 256, h: 224, scale: 'fit', smoothing: true, snap: 0, minScale: 2, note: 'draw in native px; host sets backing = native x scale x devicePixelRatio and ctx.setTransform' },
    palette: PAL,
    fonts: {
      ui: { type: 'canvas', family: DISPLAY, size: 8, weight: 400, letterSpacing: 0.35, uppercase: true, note: 'hand-lettered display caps; games fall back to Cooper Black / Arial Rounded' },
      title: { type: 'canvas', family: DISPLAY, size: 9.5, weight: 400, letterSpacing: 0.5, uppercase: true },
      label: { type: 'canvas', family: DISPLAY, size: 6.5, weight: 400, letterSpacing: 0.55, uppercase: true },
      plate: { type: 'canvas', family: DISPLAY, size: 7.5, weight: 400, letterSpacing: 0.5, uppercase: true },
      num: { type: 'canvas', family: DISPLAY, size: 15, weight: 400, letterSpacing: 0.2, note: 'fat title-card numerals' },
      word: { type: 'canvas', family: DISPLAY, size: 10.5, weight: 400, letterSpacing: 0.4, uppercase: true, note: 'MISS / status words' },
      rules: { snap: false, smoothing: true, minSize: 6.5, uppercase: true, lineH: 12, case: 'ALL CAPS, hand-lettered: each letter a little off the line' }
    },
    shape: { radius: 3, edgeWidth: 0.7, padding: 5, ruleInset: 1.4, ruleInset2: 2.6, rowRadius: 3 },
    overlayStyle: { mode: 'hatch', pattern: 'breathing', alpha: 0.36, hatch: 3.2, hatchWidth: 0.55, hatchAlpha: 0.42, edgeWidth: 1.15, boil: 0.32, note: 'flat print tint + world-anchored hatching + a thick boiling ink boundary' },
    particles: { shape: 'star', size: [1.6, 3.4], count: 0.8, snap: false, blend: 'source-over', glow: 0, gravity: 0.1, drag: 0.04, life: [300, 700], colors: ['fx.white', 'fx.hot', 'fx.ink'], trail: 0, rays: 0, outline: 'ink', note: 'white 5-point stars and paper puffs with ink outlines; no glow, no additive blend' },
    outline: { text: { width: 0, mode: 'none' }, number: { width: 1.25, max: 2, drop: 1, mode: 'stroke', color: 'ink' }, sprite: { width: 0.8, color: 'ink', mode: 'boil' } },
    shadow: { text: null, window: { dx: 1.6, dy: 1.6, blur: 0, hard: true }, sprite: { kind: 'ellipse', alpha: 0.3, hard: true } },
    motion: { stepMs: 1000 / 24, snap: false, ease: { move: 'outBack', pop: 'pop', fade: 'linear', open: 'outBack' }, fadeSteps: null, shakeInt: false, flashMax: 0.3, squash: { x: 1.2, y: 0.78, ms: 90 }, boilFps: BOIL_FPS, bpm: BPM, note: 'film rate 24 fps; drawings on twos (12 fps boil); everything idles on a 120 BPM beat' },
    layout: { handW: 9, handH: 7, pointerGap: 4, rowFrame: true, backing: 'none' },
    frameRoles: ['row', 'backing'],
    atmospherePhases: ['final'],
    film: { grain: 0.8, flicker: 0.035, dust: true, scratch: true, vignette: 0.52, gate: 7, weave: 0.35, note: 'post pass in atmosphere(final); set any to 0/false to switch it off' },

    onFontsReady: function () { CAP = {}; },
    measure: function (str, o) { o = o || {}; return measureF(fontOf(this, o.font), String(str), o.scale || 1); },

    // text(ctx, str, x, y, {font, color, align, scale, alpha, outline, outlineWidth}) -> width. Top-left at (x, y).
    text: function (ctx, str, x, y, o) {
      o = o || {}; str = String(str); var f = fontOf(this, o.font), sc = o.scale || 1, w = this.measure(str, o), col = this.token(o.color) || PAL.text.main;
      if (o.align === 'center') x -= w / 2; else if (o.align === 'right') x -= w;
      var L = letters(ctx, f, str, x, y, sc, strSeed(str), 1);
      withSmooth(ctx, function () {
        if (o.alpha != null) ctx.globalAlpha *= o.alpha;
        var ol = o.outline ? (typeof o.outline === 'string' ? skin_token(o.outline) : INK) : null;
        drawLetters(ctx, f, L, y, sc, col, ol ? { outline: ol, ow: (o.outlineWidth || 1) * 2 * sc } : null);
      });
      return w;
    },

    // frame: a printed title card. role window | plate | banner | tooltip | row | backing
    frame: function (ctx, r, st) {
      st = st || {}; var x = r.x, y = r.y, w = r.w, h = r.h, role = st.role || 'window', SH = this.shape;
      if (role === 'row') {   // selected row: a dark teal band cut by hand with a white hairline (white text stays readable on it)
        withSmooth(ctx, function () {
          ctx.globalAlpha *= st.alpha == null ? 1 : st.alpha;
          var P = rrect(x - 0.5, y, w + 1, h, Math.min(SH.rowRadius, h / 2));
          ink(ctx, P, { fill: PAL.ui.select, lw: 0.55, col: WHITE, amp: 0.18, bf: (Math.round(y) >> 2) % 3 });
        });
        return { x: x + 2, y: y, w: w - 4, h: h };
      }
      if (role === 'backing') {   // inset well inside a card / backdrop: dark sepia with a hairline paper ring
        withSmooth(ctx, function () {
          ctx.globalAlpha *= st.alpha == null ? 1 : st.alpha;
          var P = rrect(x, y, w, h, Math.min(2.4, h / 2));
          ink(ctx, P, { fill: PAL.ui.well, lw: 0.4, col: rgba(S.light, 0.7), amp: 0 });
        });
        return { x: x, y: y, w: w, h: h };
      }
      var team = st.team && st.team !== 'n' ? PAL.team[st.team] : null, rad = role === 'plate' || role === 'tooltip' ? 2.2 : SH.radius;
      withSmooth(ctx, function () {
        ctx.globalAlpha *= (st.alpha == null ? 1 : st.alpha) * (st.disabled ? 0.6 : 1);
        // hard ink drop, no blur (print, not light)
        ctx.fillStyle = PAL.ui.shadow; ctx.beginPath(); ctx.roundRect(x + 1.6, y + 1.6, w, h, rad); ctx.fill();
        // card body with a faint film-print speckle
        ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); ctx.fillStyle = INK; ctx.fill();
        ctx.save(); ctx.clip(); ctx.beginPath(); ctx.rect(x, y, w, h); texFill(ctx, grainTex('light', true), 0.22, x * 3.1, y * 2.3, 0.6); ctx.restore();
        var rc = st.alert ? PAL.fx.hot : WHITE;
        if (role === 'plate' || role === 'tooltip' || h < 15) {
          ctx.strokeStyle = rc; ctx.lineWidth = 0.55; ctx.beginPath(); ctx.roundRect(x + 1.3, y + 1.3, w - 2.6, h - 2.6, Math.max(0.5, rad - 1)); ctx.stroke();
        } else {
          // white double rule
          ctx.strokeStyle = rc; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.roundRect(x + SH.ruleInset, y + SH.ruleInset, w - 2 * SH.ruleInset, h - 2 * SH.ruleInset, Math.max(0.5, rad - 1)); ctx.stroke();
          ctx.lineWidth = 0.35; ctx.beginPath(); ctx.roundRect(x + SH.ruleInset2, y + SH.ruleInset2, w - 2 * SH.ruleInset2, h - 2 * SH.ruleInset2, Math.max(0.3, rad - 1.8)); ctx.stroke();
          // corner ornaments: ink dot, white ring, coloured centre (team colour; white for neutral)
          var dc = team || (st.alert ? PAL.fx.hot : WHITE), k = SH.ruleInset2;
          [[x + k, y + k], [x + w - k, y + k], [x + k, y + h - k], [x + w - k, y + h - k]].forEach(function (p) {
            ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(p[0], p[1], 1.5, 0, TAU); ctx.fill();
            ctx.strokeStyle = WHITE; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.arc(p[0], p[1], 1.1, 0, TAU); ctx.stroke();
            ctx.fillStyle = dc; ctx.beginPath(); ctx.arc(p[0], p[1], 0.55, 0, TAU); ctx.fill();
          });
          if (role === 'banner') { ctx.lineWidth = 0.35; ctx.strokeStyle = WHITE; [y + 4.6, y + h - 4.6].forEach(function (yy) { ctx.beginPath(); ctx.moveTo(x + 7, yy); ctx.lineTo(x + w - 7, yy); ctx.stroke(); }); }
        }
        if (st.focus) { ctx.strokeStyle = PAL.paper; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.roundRect(x - 1.2, y - 1.2, w + 2.4, h + 2.4, rad + 1); ctx.stroke(); }
      });
      var pad = role === 'plate' || role === 'tooltip' ? 3 : SH.padding;
      return { x: x + pad, y: y + pad, w: w - 2 * pad, h: h - 2 * pad };
    },

    // number: fat title-card numerals. Canonical glyph order (main, suffix, label); every drop and outline before any face.
    number: function (ctx, str, x, y, o) {
      o = o || {}; var s = String(str), kind = o.kind || 'damage', K = PAL.numbers[kind] || PAL.numbers.damage, L = numLayout(this, s, o), out = [];
      var x0 = o.align === 'center' ? x - L.w / 2 : x, y0 = o.baseline === 'bottom' ? y - L.h : y;
      var ow = (o.outline == null ? this.outline.number.width : clamp(o.outline, 0.8, this.outline.number.max)) * 2 * L.sc / (o.scale || 1);
      var bf = boilOf((o.age || 0) / 1000), sd = strSeed(kind + s);
      var plan = L.items.map(function (it, i) { var d = (o.glyphOffset && o.glyphOffset(i, it)) || {}, a = d.alpha != null ? d.alpha : o.alpha != null ? o.alpha : 1; return { it: it, d: d, a: a }; })
        .filter(function (p) { return !p.d.skip && p.a > 0; });
      if (!plan.length) return out;
      var amax = Math.max.apply(null, plan.map(function (p) { return p.a; }));
      var main = plan.filter(function (p) { return p.it.role === 'main'; }), lab = plan.filter(function (p) { return p.it.role === 'label'; });
      var paint = function (g, rel) {
        var pa = g.globalAlpha;
        // behind the numerals: crit = jagged POW burst, miss = puff cloud, heal/mp = two sparkles. Follows the numerals' bounce.
        if (main.length) {
          var my = 0; main.forEach(function (p) { my += p.d.dy || 0; }); my /= main.length;
          var cx = x0 + L.nw / 2, cy = y0 + L.h * 0.5 + my, am = Math.max.apply(null, main.map(function (p) { return p.a; }));
          g.globalAlpha = pa * rel(am);
          if (kind === 'crit') {
            var R = Math.max(L.nw * 0.62, L.h * 0.95), P = [], rr = rng(sd);
            for (var q = 0; q < 22; q++) { var an = q / 22 * TAU + 0.12, k = q & 1 ? 0.6 + rr() * 0.08 : 1 + rr() * 0.18; P.push([cx + Math.cos(an) * R * k * 1.15, cy + Math.sin(an) * R * k * 0.78]); }
            g.fillStyle = INK; tracePath(g, P.map(function (p) { return [p[0] + 1.2, p[1] + 1.2]; }), true, 0.3, bf); g.fill();
            ink(g, P, { fill: K[1], lw: 0.9, amp: 0.3, bf: bf });
            // a few ink "impact" ticks outside the burst
            for (q = 0; q < 5; q++) { var a2 = -2.6 + q * 0.55, r0 = R * 1.25; ink(g, [[cx + Math.cos(a2) * r0 * 1.15, cy + Math.sin(a2) * r0 * 0.8], [cx + Math.cos(a2) * (r0 + 3) * 1.15, cy + Math.sin(a2) * (r0 + 3) * 0.8]], { closed: false, lw: 0.8, amp: 0.15, bf: bf }); }
          } else if (kind === 'miss') {
            ink(g, puffPts(cx, cy + 0.3, L.nw * 0.5 + 2, L.h * 0.62 + 0.8, sd), { fill: K[1], lw: 0.8, amp: 0.25, bf: bf });
          } else if (kind === 'heal' || kind === 'mp') {
            var tw = 0.75 + 0.25 * Math.cos((o.age || 0) / 1000 * TAU * 2);
            star(g, x0 - 2.6, cy - L.h * 0.45, 2.1 * tw, { fill: WHITE, lw: 0.5, bf: bf, n: 4, inner: 0.35 });
            star(g, x0 + L.w + 2.4, cy - L.h * 0.15, 1.6 * (1.75 - tw), { fill: WHITE, lw: 0.5, bf: bf, n: 4, inner: 0.35 });
          }
        }
        // label: one ribbon block (first letter's offset, largest alpha), white caps on red-orange with ink outline
        if (lab.length) {
          var d0 = lab[0].d, la = Math.max.apply(null, lab.map(function (p) { return p.a; })), all = L.items.filter(function (it) { return it.role === 'label'; });
          var lx = x0 + all[0].x + (d0.dx || 0), ly = y0 + all[0].y + (d0.dy || 0), lw = all[all.length - 1].x + all[all.length - 1].w - all[0].x, lh = all[0].h;
          g.globalAlpha = pa * rel(la);
          var bx = lx - 3.2, bw = lw + 6.4, by = ly - 2, bh = lh + 4, notch = 2;
          var RB = [[bx - notch, by], [bx + bw + notch, by], [bx + bw, by + bh / 2], [bx + bw + notch, by + bh], [bx - notch, by + bh], [bx, by + bh / 2]];
          g.fillStyle = INK; tracePath(g, RB.map(function (p) { return [p[0] + 0.9, p[1] + 0.9]; }), true, 0, 0); g.fill();
          ink(g, RB, { fill: PAL.fx.hot, lw: 0.7, amp: 0.15, bf: bf });
          g.font = fontCss(lab[0].it.font, lab[0].it.s); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = WHITE;
          lab.forEach(function (p) { var it = p.it; g.fillText(it.ch, lx + (it.x - all[0].x), ly + it.h); out.push({ i: it.i, x: lx + (it.x - all[0].x), y: ly, w: it.w, h: it.h, ch: it.ch, role: 'label' }); });
        }
        // numerals and suffix: ink drop, ink outline, face, shine band
        var glyphs = plan.filter(function (p) { return p.it.role !== 'label'; });
        var place = function (g2, p, fn) {
          var it = p.it, d = p.d, gx = x0 + it.x + (d.dx || 0), gy = y0 + it.y + (d.dy || 0), r1 = hash2(sd, it.i * 7 + bf, 3);
          // airborne glyphs stretch, landing glyphs squash (module sx/sy); a hand-drawn tilt that boils
          var air = Math.max(0, -(d.dy || 0)), sy = d.sy || (1 + Math.min(0.16, air * 0.035)), sx = d.sx || 1 / Math.sqrt(sy);
          g2.save(); g2.translate(gx + it.w / 2, gy + it.h); g2.rotate((r1 - 0.5) * 0.09); g2.scale(sx, sy);
          fn(it, -it.w / 2 + (it.w - (it.cw || it.w)) / 2, -it.h, gx, gy); g2.restore();
          return { gx: gx, gy: gy };
        };
        g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
        glyphs.forEach(function (p) { g.globalAlpha = pa * rel(p.a); place(g, p, function (it, lx2, ly2) { g.font = fontCss(it.font, it.s); var dd = 1.1 * it.s; g.fillStyle = INK; g.strokeStyle = INK; g.lineWidth = ow * (it.role === 'main' ? 1 : 0.75); g.strokeText(it.ch, lx2 + dd, ly2 + it.h + dd); g.fillText(it.ch, lx2 + dd, ly2 + it.h + dd); }); });
        glyphs.forEach(function (p) { g.globalAlpha = pa * rel(p.a); place(g, p, function (it, lx2, ly2) { g.font = fontCss(it.font, it.s); g.strokeStyle = INK; g.lineWidth = ow * (it.role === 'main' ? 1 : 0.75); g.strokeText(it.ch, lx2, ly2 + it.h); }); });
        glyphs.forEach(function (p) {
          g.globalAlpha = pa * rel(p.a);
          var pos = place(g, p, function (it, lx2, ly2) {
            g.font = fontCss(it.font, it.s);
            var face = p.d.flash ? WHITE : it.role === 'suffix' ? S.light : K[0];
            if (p.d.flash && kind !== 'crit') face = PAL.fx.hotL;
            g.fillStyle = face; g.fillText(it.ch, lx2, ly2 + it.h);
            // shine: a lighter band across the upper third (printed highlight, hard edged)
            g.save(); g.beginPath(); g.rect(lx2 - 2, ly2 + it.h * 0.08, it.w + 4, it.h * 0.24); g.clip(); g.fillStyle = rgba(WHITE, kind === 'damage' ? 0 : 0.45); g.fillText(it.ch, lx2, ly2 + it.h); g.restore();
            if (kind === 'damage' && !p.d.flash) { g.save(); g.beginPath(); g.rect(lx2 - 2, ly2 + it.h * 0.62, it.w + 4, it.h * 0.5); g.clip(); g.fillStyle = S.light; g.fillText(it.ch, lx2, ly2 + it.h); g.restore(); }
          });
          out.push({ i: p.it.i, x: pos.gx, y: pos.gy, w: p.it.w, h: p.it.h, ch: p.it.ch, role: p.it.role });
        });
        g.globalAlpha = pa;
      };
      withSmooth(ctx, function () {
        if (amax >= 0.999) paint(ctx, function (a) { return a; });
        else API.fadeLayer(ctx, amax, { x: x0 - 16, y: y0 - 24, w: L.w + 32, h: L.h + 40 }, function (g) { g.imageSmoothingEnabled = true; paint(g, function (a) { return a / amax; }); });
      });
      out.sort(function (a, b) { return a.i - b.i; });
      return out;
    },

    // overlay: one grid cell. Flat print tint, world-anchored hatching, thick boiling ink boundary on the set's edges.
    overlay: function (ctx, r, kind, t, o) {
      o = o || {}; var Ck = PAL.overlay[kind] || PAL.overlay.move, OS = this.overlayStyle, gr = o.grow == null ? 1 : o.grow;
      if (!(gr > 0)) return;
      var E = o.edges || {}, pat = o.pattern || OS.pattern, bf = boilOf(t), g1 = API.ease.outBack(clamp(gr, 0, 1));
      var a = (Ck.alpha == null ? OS.alpha : Ck.alpha) * clamp(gr, 0, 1);
      if (pat === 'pulsing' || pat === 'breathing') a *= 1 + 0.12 * Math.cos(TAU * beatOf(t));   // on the beat, whole set in phase
      if (pat === 'checker' && o.tile && (o.tile.x + o.tile.y) % 2) a *= 0.75;
      withSmooth(ctx, function () {
        ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
        ctx.fillStyle = rgba(Ck.fill, a); ctx.fillRect(r.x, r.y, r.w, r.h);
        // hatching anchored to the world (continuous from cell to cell); heal = a dot screen
        ctx.strokeStyle = rgba(Ck.edge, OS.hatchAlpha * clamp(gr, 0, 1)); ctx.lineWidth = OS.hatchWidth; ctx.lineCap = 'round';
        var sp = OS.hatch, dirs = kind === 'threat' ? [1, -1] : kind === 'attack' ? [-1] : kind === 'heal' ? [] : [1];
        dirs.forEach(function (dd) {
          ctx.beginPath();
          var c0 = dd > 0 ? r.x + r.y : r.x - r.y - r.h, k0 = Math.floor(c0 / sp) * sp;
          for (var c = k0; c < c0 + r.w + r.h + sp; c += sp) {
            if (dd > 0) { ctx.moveTo(c - r.y, r.y); ctx.lineTo(c - r.y - r.h, r.y + r.h); }   // x + y = c
            else { ctx.moveTo(c + r.y, r.y); ctx.lineTo(c + r.y + r.h, r.y + r.h); }           // x - y = c
          }
          ctx.stroke();
        });
        if (kind === 'heal') { ctx.fillStyle = rgba(Ck.edge, 0.5 * clamp(gr, 0, 1)); for (var yy = Math.ceil(r.y / 4) * 4; yy < r.y + r.h; yy += 4) for (var xx = Math.ceil(r.x / 4) * 4 + ((yy / 4) & 1) * 2; xx < r.x + r.w; xx += 4) { ctx.beginPath(); ctx.arc(xx, yy, 0.55, 0, TAU); ctx.fill(); } }
        ctx.restore();
        // the boundary: an even ink line on the set's outside edges, inset a little, boiling (shared field -> corners meet)
        var ins = 0.7 + (1 - g1) * 3, x0 = r.x + ins, y0 = r.y + ins, x1 = r.x + r.w - ins, y1 = r.y + r.h - ins, segs = [];
        if (E.top) segs.push([[E.left ? x0 : r.x, y0], [E.right ? x1 : r.x + r.w, y0]]);
        if (E.bottom) segs.push([[E.left ? x0 : r.x, y1], [E.right ? x1 : r.x + r.w, y1]]);
        if (E.left) segs.push([[x0, E.top ? y0 : r.y], [x0, E.bottom ? y1 : r.y + r.h]]);
        if (E.right) segs.push([[x1, E.top ? y0 : r.y], [x1, E.bottom ? y1 : r.y + r.h]]);
        ctx.globalAlpha *= clamp(gr, 0, 1);
        segs.forEach(function (sg) { ink(ctx, sg, { closed: false, lw: OS.edgeWidth, col: kind === 'threat' ? INK : mix(Ck.edge, INK, 0.35), amp: OS.boil, bf: bf }); });
      });
    },

    // bar: a rubber hose. gauge kinds charge haste slow ready queued enemy enemyFull; meter hp hpLow; null = empty
    bar: function (ctx, r, frac, kind, o) {
      o = o || {}; var B = PAL.bars, x = r.x, y = r.y, w = r.w, h = r.h, f = clamp(frac || 0, 0, 1), rad = h / 2;
      withSmooth(ctx, function () {
        ctx.beginPath(); ctx.roundRect(x - 0.6, y - 0.6, w + 1.2, h + 1.2, rad + 0.6); ctx.fillStyle = INK; ctx.fill();
        ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); ctx.fillStyle = B.track; ctx.fill();
        if (kind && f > 0) {
          var c = B[kind] || PAL.fx.hot, fw = o.px != null ? clamp(o.px + 1, 0, w) : w * f;
          ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); ctx.clip();
          ctx.beginPath(); ctx.roundRect(x, y, Math.max(h, fw), h, rad); ctx.fillStyle = c; ctx.fill();
          ctx.fillStyle = rgba(INK, 0.28); ctx.fillRect(x, y + h * 0.62, Math.max(h, fw), h * 0.38);           // hard lower shade
          ctx.strokeStyle = rgba(WHITE, 0.85); ctx.lineWidth = Math.max(0.35, h * 0.16); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x + rad, y + h * 0.3); ctx.lineTo(x + Math.max(rad + 0.5, fw - rad - 0.4), y + h * 0.3); ctx.stroke();
          if (fw < w - 0.5) { ctx.strokeStyle = INK; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x + fw, y); ctx.lineTo(x + fw, y + h); ctx.stroke(); }
          ctx.restore();
          if (kind === 'ready' || kind === 'enemyFull') { ctx.strokeStyle = WHITE; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.roundRect(x - 1.4, y - 1.4, w + 2.8, h + 2.8, rad + 1.4); ctx.stroke(); }
        } else {   // empty: dotted centre line
          ctx.fillStyle = rgba(S.light, 0.5); for (var k = x + 2; k < x + w - 1; k += 2.2) ctx.fillRect(k, y + h / 2 - 0.2, 0.7, 0.4);
        }
        if (o.tag) {
          var tc = o.tag === 'slow' ? B.slow : B.haste, sx = x - 0.5, sy = y + h / 2, sr = Math.max(2.6, h * 0.7);
          ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(sx, sy, sr + 0.6, 0, TAU); ctx.fill();
          ctx.fillStyle = tc; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
          var tf = { family: DISPLAY, size: sr * 1.5, weight: 400 }, ch = o.tag === 'slow' ? 'S' : 'H';
          ctx.font = fontCss(tf, 1); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = INK; ctx.fillText(ch, sx, sy + capRatio(tf) * tf.size / 2);
        }
      });
    },

    // cursor: 'bracket' = four fat ink corners with a white inner line, bouncing on the beat (squash at the bottom);
    //         'hand' = a white four-finger glove pointing right; tip at the box's right-middle
    cursor: function (ctx, r, kind, t, o) {
      o = o || {}; var bf = boilOf(t);
      withSmooth(ctx, function () {
        ctx.globalAlpha *= o.alpha == null ? 1 : o.alpha;
        if (kind === 'hand') {
          var b = hop(t), s = Math.min(r.w / 8.8, r.h / 6.6);   // fills the 9x7 hand box
          glove(ctx, r.x + r.w + 0.2 - b * 1.2, r.y + r.h / 2 + 0.3 * s, 0, s, { bf: bf, lw: 0.55, fill: o.invalid ? PAL.fx.hotL : WHITE });
          return;
        }
        var bb = hop(t), out = 1.1 + bb * 1.5, sq = bb < 0.15 ? 0.6 : 0, L = r.w * 0.38, col = o.invalid ? PAL.fx.hot : WHITE;
        var X0 = r.x - out - sq, Y0 = r.y - out + sq, X1 = r.x + r.w + out + sq, Y1 = r.y + r.h + out - sq * 0.5;
        [[X0, Y0, 1, 1], [X1, Y0, -1, 1], [X0, Y1, 1, -1], [X1, Y1, -1, -1]].forEach(function (c) {
          var P = [[c[0] + c[2] * L, c[1]], [c[0], c[1]], [c[0], c[1] + c[3] * L]];
          ink(ctx, P, { closed: false, lw: 2.6, amp: 0.22, bf: bf });
          ink(ctx, P, { closed: false, lw: 1.0, col: col, amp: 0.22, bf: bf });
        });
      });
    },

    // path: a white rubber hose with an even ink outline from the unit to the end tile, finishing in a pointing glove
    path: function (ctx, points, t, o) {
      o = o || {}; if (!points || points.length < 2) return;
      var bf = boilOf(t), pts = smoothPath(points, 6), n = pts.length, end = pts[n - 1];
      // the glove takes the last ~8 px: stop the hose at the cuff
      var k = n - 1; while (k > 1 && Math.hypot(pts[k][0] - end[0], pts[k][1] - end[1]) < 7.5) k--;
      var body = pts.slice(0, k + 1), prev = pts[Math.max(0, k - 3)], ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      var draw = function (g) {
        g.imageSmoothingEnabled = true;
        // ink drop, ink tube, white core, a highlight stripe and hose bands every 9 px
        g.save(); g.translate(0.9, 1.1); ink(g, body, { closed: false, lw: 5, col: rgba(INK, 0.5), amp: 0.3, bf: bf }); g.restore();
        ink(g, body, { closed: false, lw: 5, amp: 0.3, bf: bf });
        ink(g, body, { closed: false, lw: 3.1, col: o.invalid ? PAL.fx.hotL : WHITE, amp: 0.3, bf: bf });
        var acc = 0;
        for (var i = 1; i < body.length - 1; i++) {
          acc += Math.hypot(body[i][0] - body[i - 1][0], body[i][1] - body[i - 1][1]);
          if (acc >= 9) {
            acc = 0; var dx = body[i + 1][0] - body[i - 1][0], dy = body[i + 1][1] - body[i - 1][1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 1.55, ny = dx / l * 1.55, q = disp(body[i][0], body[i][1], bf, 0.3);
            g.strokeStyle = INK; g.lineWidth = 0.55; g.lineCap = 'round'; g.beginPath(); g.moveTo(q[0] - nx, q[1] - ny); g.lineTo(q[0] + nx, q[1] + ny); g.stroke();
          }
        }
        // nozzle at the unit: a fat ink ring
        ink(g, ell(body[0][0], body[0][1], 2.3, 2.3, 12), { fill: WHITE, lw: 1.1, amp: 0.15, bf: bf });
        ink(g, ell(body[0][0], body[0][1], 0.8, 0.8, 8), { fill: INK, lw: 0, amp: 0 });
        // the glove points along the last segment, fingertip just past the end tile's centre
        glove(g, end[0] + Math.cos(ang) * 3, end[1] + Math.sin(ang) * 3, ang, 1.15, { bf: bf, lw: 0.6, fill: o.invalid ? PAL.fx.hotL : WHITE });
        if (o.invalid) { var ex = end[0], ey = end[1]; ink(g, [[ex - 3, ey - 3], [ex + 3, ey + 3]], { closed: false, lw: 1.4, col: PAL.fx.hot, amp: 0 }); ink(g, [[ex + 3, ey - 3], [ex - 3, ey + 3]], { closed: false, lw: 1.4, col: PAL.fx.hot, amp: 0 }); }
      };
      var al = o.alpha == null ? 1 : o.alpha;
      withSmooth(ctx, function () { if (al >= 0.999) draw(ctx); else API.fadeLayer(ctx, al, null, draw); });
    }
  };
  function skin_token(v) { return API.token(REG_SKIN || { palette: PAL }, v); }
  var REG_SKIN = null;

  /* =============================== scene hooks =============================== */
  // tile(ctx, rect, kind, t): sepia ground printed flat, with soft value pockets, ink tufts and pen lines. No cell borders.
  skin.tile = function (ctx, r, kind, t) {
    var x = r.x, y = r.y, w = r.w, h = r.h, k = w / 16, sd = (Math.round(x) * 73856093 ^ Math.round(y) * 19349663) | 0, rr = rng(sd), T = PAL.terrain, c = T[kind] || T.grass, bf = boilOf(t);
    withSmooth(ctx, function () {
      // base fill overlaps its neighbours by half a pixel (no hairline seams from anti-aliased clips at fractional scales)
      var ground = kind === 'forest' || kind === 'hill' || kind === 'mountain' || kind === 'fort' ? T.grass : c;
      ctx.fillStyle = ground; ctx.fillRect(x - 0.25, y - 0.25, w + 0.5, h + 0.5);
      ctx.beginPath(); ctx.rect(x - 0.25, y - 0.25, w + 0.5, h + 0.5); ctx.clip();
      // value pockets: a 5x5 world-anchored noise sample stretched smoothly over the cell (bilinear), so the soft light and
      // dark patches flow across cells with no blocks and no seams (watercolour-grey background, low contrast)
      var pk = pocketCanvas();
      if (pk) {
        var pg = pk.getContext('2d'), id = pg.createImageData(5, 5), gc = C.rgb(ground), pc = C.rgb(S.paper), dc = C.rgb(S.dark);
        for (var yy = 0; yy < 5; yy++) for (var xx = 0; xx < 5; xx++) {
          var wx = x + xx * 4 * k, wy = y + yy * 4 * k, v = (vnoise(wx * 0.055, wy * 0.055, 3) - 0.5) * 1.2 + (vnoise(wx * 0.17, wy * 0.17, 4) - 0.5) * 0.35, q = (yy * 5 + xx) * 4;
          var tc = v > 0 ? pc : dc, m = v > 0 ? v * 0.55 : -v * 0.4;
          id.data[q] = gc[0] + (tc[0] - gc[0]) * m; id.data[q + 1] = gc[1] + (tc[1] - gc[1]) * m; id.data[q + 2] = gc[2] + (tc[2] - gc[2]) * m; id.data[q + 3] = 255;
        }
        pg.putImageData(id, 0, 0); ctx.imageSmoothingQuality = 'high';
        var e = 0.3 * 4 / w; ctx.drawImage(pk, 0.5 - e, 0.5 - e, 4 + 2 * e, 4 + 2 * e, x - 0.3, y - 0.3, w + 0.6, h + 0.6);
      }
      if (kind === 'water' || kind === 'bridge') {
        // water: a darker pool with lighter wash bands, horizontal wavy ripple lines that drift and boil (phase from world x,
        // so a river reads as one surface), ink troughs under the white crests, and a blinking glint
        var dr = twos(t) * 2.2;
        for (var b2 = 0; b2 < 2; b2++) { var wy0 = y + (2.5 + b2 * 8) * k; ctx.fillStyle = rgba(S.light, 0.22); ctx.fillRect(x - 0.25, wy0, w + 0.5, 2.6 * k); }
        for (var row = 0; row < 3; row++) {
          var ry = y + (3.6 + row * 5.2) * k, P = [], Pd = [];
          for (var sx2 = 0; sx2 <= 16; sx2++) { var wx2 = x + sx2 * k, yy2 = ry + Math.sin((wx2 + dr * (row & 1 ? -1 : 1)) * 0.75 + row * 1.7) * 0.75 * k; P.push([wx2, yy2]); Pd.push([wx2, yy2 + 1.1 * k]); }
          ink(ctx, Pd, { closed: false, lw: 0.5 * k, col: rgba(INK, 0.3), amp: 0.12, bf: bf });
          ink(ctx, P, { closed: false, lw: 0.6 * k, col: rgba(WHITE, 0.85), amp: 0.12, bf: bf });
        }
        if (hash2(x, y, 4) < 0.35 && hop(t + hash2(x, y, 6)) > 0.6) star(ctx, x + (3 + hash2(x, y, 7) * 10) * k, y + (3 + hash2(x, y, 8) * 10) * k, 1.4 * k, { fill: WHITE, lw: 0.3, n: 4, inner: 0.3, bf: bf });
      }
      if (kind === 'bridge') {
        ctx.fillStyle = c; ctx.fillRect(x, y + 3 * k, w, h - 6 * k);
        for (var p = 0; p < 4; p++) ink(ctx, [[x + p * 4 * k + 0.2, y + 3 * k], [x + p * 4 * k + 0.2, y + h - 3 * k]], { closed: false, lw: 0.4 * k, col: S.dark, amp: 0 });
        ink(ctx, [[x, y + 3 * k], [x + w, y + 3 * k]], { closed: false, lw: 0.8 * k, amp: 0 }); ink(ctx, [[x, y + h - 3 * k], [x + w, y + h - 3 * k]], { closed: false, lw: 0.8 * k, amp: 0 });
      } else if (kind === 'grass' || kind === 'sand') {
        for (var g2 = 0; g2 < 2; g2++) if (rr() < 0.75) {
          var gx = x + (2 + rr() * 11) * k, gy = y + (5 + rr() * 9) * k;
          ink(ctx, [[gx - 1.4 * k, gy - 1.6 * k], [gx - 0.5 * k, gy], [gx, gy - 2.1 * k], [gx + 0.5 * k, gy], [gx + 1.4 * k, gy - 1.5 * k]], { closed: false, lw: 0.45 * k, col: rgba(S.dark, 0.75), amp: 0 });
        }
        if (rr() < 0.18) { var fx = x + (3 + rr() * 10) * k, fy = y + (4 + rr() * 9) * k; ink(ctx, ell(fx, fy, 0.9 * k, 0.9 * k, 6), { fill: S.paper, lw: 0.35 * k, col: S.dark, amp: 0 }); }
      } else if (kind === 'forest') {
        ink(ctx, puffPts(x + 8 * k, y + 8 * k, 6 * k, 5 * k, sd), { fill: c, lw: 0.8 * k, amp: 0 });
      } else if (kind === 'hill' || kind === 'mountain') {
        var hh = kind === 'mountain' ? 1.7 : 1, P = [[x + 1 * k, y + 14 * k], [x + 5 * k, y + (10 - 4 * hh) * k], [x + 8 * k, y + (8 - 4 * hh) * k], [x + 11 * k, y + (10 - 3 * hh) * k], [x + 15 * k, y + 14 * k]];
        lit(ctx, P, c, mix(c, S.dark, 0.45), { amp: 0, lw: 0.8 * k, off: [-1.2 * k, -0.8 * k] });
        if (kind === 'mountain') ink(ctx, [[x + 6.4 * k, y + 2.6 * k], [x + 8 * k, y + 1.2 * k], [x + 9.6 * k, y + 2.8 * k], [x + 8 * k, y + 3.6 * k]], { fill: S.paper, lw: 0.5 * k, amp: 0 });
      } else if (kind === 'road' || kind === 'floor') {
        for (var s2 = 0; s2 < 3; s2++) { var px = x + (2 + rr() * 12) * k, py = y + (2 + rr() * 12) * k; ctx.fillStyle = rgba(S.dmid, 0.45); ctx.beginPath(); ctx.arc(px, py, 0.6 * k, 0, TAU); ctx.fill(); }
      } else if (kind === 'fort' || kind === 'wall') {
        var F = [[x + 2 * k, y + 14 * k], [x + 2 * k, y + 5 * k], [x + 14 * k, y + 5 * k], [x + 14 * k, y + 14 * k]];
        lit(ctx, F, c, mix(c, S.dark, 0.4), { amp: 0, lw: 0.8 * k });
        for (var m = 0; m < 3; m++) ink(ctx, [[x + (2.5 + m * 4.5) * k, y + 5 * k], [x + (2.5 + m * 4.5) * k, y + 3 * k], [x + (4.5 + m * 4.5) * k, y + 3 * k], [x + (4.5 + m * 4.5) * k, y + 5 * k]], { fill: c, lw: 0.7 * k, amp: 0 });
      }
    });
  };

  // prop(ctx, rect, kind, t, {light, seed}): standing objects. They breathe on the beat (all in phase), trees and the
  // lamp have faces, light sources throw cartoon emanata (short radiating ink dashes) instead of glow.
  skin.prop = function (ctx, r, kind, t, o) {
    o = o || {}; var k = r.w / 16, cx = r.x + r.w / 2, by = r.y + r.h - 1 * k, bf = boilOf(t), sd = o.seed || 0, br = breathe(t + (kind === 'bush' ? 0 : 0), 0.05);
    withSmooth(ctx, function () {
      // flat hard contact shadow
      ctx.fillStyle = rgba(INK, 0.22); ctx.beginPath(); ctx.ellipse(cx + 1 * k, by + 0.3 * k, 6 * k, 1.8 * k, 0, 0, TAU); ctx.fill();
      ctx.translate(cx, by); ctx.scale(1 / Math.sqrt(br), br); ctx.translate(-cx, -by);   // stretch on the beat, about the foot
      if (kind === 'tree') {
        ink(ctx, noodle([cx, by], [cx + 0.6 * k, by - 7 * k], 0.8 * k, 2.4 * k), { fill: S.dmid, lw: 0.8, amp: 0.2, bf: bf });
        var cy = by - 12 * k, P = puffPts(cx, cy, 7.2 * k, 6.2 * k, sd + 11);
        lit(ctx, P, S.mid, mix(S.mid, S.dark, 0.5), { bf: bf, lw: 0.85, amp: 0.25, off: [-1.4 * k, -1.2 * k] });
        pieEye(ctx, cx - 1.9 * k, cy - 0.6 * k, 1.25 * k, 1.6 * k, { bf: bf, lw: 0.4, look: [-0.4, 0.2], shut: (beatOf(t) % 6) > 5.75 });
        pieEye(ctx, cx + 1.3 * k, cy - 0.6 * k, 1.25 * k, 1.6 * k, { bf: bf, lw: 0.4, look: [-0.4, 0.2], shut: (beatOf(t) % 6) > 5.75 });
        ink(ctx, arcPts(cx - 0.3 * k, cy + 1.6 * k, 2 * k, 1.1 * k, 0.3, Math.PI - 0.3, 6), { closed: false, lw: 0.5, amp: 0.1, bf: bf });
      } else if (kind === 'bush') {
        var P2 = puffPts(cx, by - 4.2 * k, 7 * k, 4.4 * k, sd + 3).map(function (p) { return [p[0], Math.min(by, p[1])]; });
        lit(ctx, P2, mix(S.mid, S.light, 0.25), mix(S.mid, S.dark, 0.4), { bf: bf, lw: 0.8, amp: 0.22, off: [-1.1 * k, -0.9 * k] });
        ink(ctx, arcPts(cx - 2 * k, by - 4.5 * k, 1.6 * k, 1.1 * k, Math.PI * 1.1, Math.PI * 1.85, 5), { closed: false, lw: 0.45, col: rgba(INK, 0.7), amp: 0.1, bf: bf });
      } else if (kind === 'brazier') {
        // iron bowl on three noodle legs, cartoon flame (paper core, red-orange rim) on twos
        [[-3.4, 1.2], [0, 1.5], [3.4, 1.2]].forEach(function (L) { ink(ctx, noodle([cx + L[0] * 0.55 * k, by - 5 * k], [cx + L[0] * k, by], L[0] * 0.15 * k, 1.1 * k), { fill: INK, lw: 0.3, amp: 0.1, bf: bf }); });
        var bowl = arcPts(cx, by - 6 * k, 5.2 * k, 3 * k, 0, Math.PI, 10).concat([[cx - 5.6 * k, by - 6.4 * k], [cx + 5.6 * k, by - 6.4 * k]]);
        lit(ctx, bowl, S.dark, INK, { bf: bf, lw: 0.8, amp: 0.15, off: [-0.8 * k, -0.6 * k] });
        flame(ctx, cx, by - 6.6 * k, k * (0.9 + 0.25 * (o.light ? o.light.intensity || 0.5 : 0.5)), t, bf, sd);
        emanata(ctx, cx, by - 10 * k, 8.5 * k, t, bf, o.light);
      } else if (kind === 'lamp') {
        // a post lamp with a face: ink post, paper lantern that beams on the beat
        ink(ctx, noodle([cx, by], [cx, by - 10 * k], 0.4 * k, 1.5 * k), { fill: INK, lw: 0.3, amp: 0.12, bf: bf });
        ink(ctx, ell(cx, by, 3 * k, 1 * k, 10), { fill: INK, lw: 0.3, amp: 0.1, bf: bf });
        var ly = by - 13.5 * k, LP = rrect(cx - 3.3 * k, ly - 3.6 * k, 6.6 * k, 7.6 * k, 2.4 * k);
        lit(ctx, LP, '#fff3d6', S.light, { bf: bf, lw: 0.85, amp: 0.2, off: [-0.8 * k, -0.6 * k] });
        ink(ctx, [[cx - 4.2 * k, ly - 3.6 * k], [cx, ly - 6.6 * k], [cx + 4.2 * k, ly - 3.6 * k]], { fill: INK, lw: 0.5, amp: 0.12, bf: bf });
        pieEye(ctx, cx - 1.25 * k, ly - 0.4 * k, 0.95 * k, 1.3 * k, { bf: bf, lw: 0.35, look: [0.3, 0.2], shut: (beatOf(t) % 5) > 4.75 });
        pieEye(ctx, cx + 1.25 * k, ly - 0.4 * k, 0.95 * k, 1.3 * k, { bf: bf, lw: 0.35, look: [0.3, 0.2], shut: (beatOf(t) % 5) > 4.75 });
        ink(ctx, arcPts(cx, ly + 1.6 * k, 1.3 * k, 0.8 * k, 0.2, Math.PI - 0.2, 6), { closed: false, lw: 0.45, amp: 0.08, bf: bf });
        emanata(ctx, cx, ly, 6.8 * k, t, bf, o.light);
      } else if (kind === 'crystal') {
        var gy = by - 6 * k, G = [[cx, gy - 7.4 * k], [cx + 3.6 * k, gy - 1.6 * k], [cx + 2.2 * k, gy + 5.6 * k], [cx - 2.4 * k, gy + 5.6 * k], [cx - 3.6 * k, gy - 1.4 * k]];
        lit(ctx, G, PAL.fx.coldL, PAL.fx.cold, { bf: bf, lw: 0.85, amp: 0.15, off: [-1.1 * k, -0.6 * k] });
        ink(ctx, [[cx, gy - 7.4 * k], [cx - 0.4 * k, gy + 5.6 * k]], { closed: false, lw: 0.4, amp: 0.1, bf: bf });
        ink(ctx, [[cx - 3.6 * k, gy - 1.4 * k], [cx + 3.6 * k, gy - 1.6 * k]], { closed: false, lw: 0.4, amp: 0.1, bf: bf });
        var tw = hop(t); star(ctx, cx + 3.4 * k, gy - 5.6 * k, (1.2 + tw * 1.4) * k, { fill: WHITE, lw: 0.45, n: 4, inner: 0.3, bf: bf });
        emanata(ctx, cx, gy - 1 * k, 7.5 * k, t, bf, o.light);
      } else {   // stone / rock / unknown: a lumpy boulder with one hard shade crescent and a crack
        var R = [[cx - 6 * k, by], [cx - 6.4 * k, by - 3.6 * k], [cx - 3.6 * k, by - 7.8 * k], [cx + 0.8 * k, by - 8.6 * k], [cx + 4.8 * k, by - 6.6 * k], [cx + 6.4 * k, by - 2.4 * k], [cx + 5.6 * k, by]];
        lit(ctx, R, S.light, S.mid, { bf: bf, lw: 0.9, amp: 0.2, off: [-1.6 * k, -1.2 * k] });
        ink(ctx, [[cx + 0.6 * k, by - 8.4 * k], [cx + 1.4 * k, by - 5.6 * k], [cx + 0.6 * k, by - 3.8 * k]], { closed: false, lw: 0.5, amp: 0.1, bf: bf });
        ink(ctx, [[cx - 3.8 * k, by - 5.4 * k], [cx - 2.4 * k, by - 6.6 * k]], { closed: false, lw: 0.6, col: WHITE, amp: 0.1, bf: bf });
      }
    });
  };
  function flame(ctx, cx, by, k, t, bf, sd) {
    var f = Math.floor(twos(t) * BOIL_FPS) % 3, sway = [-0.8, 0.4, 1.0][f] * k, hgt = [8.2, 9.4, 8.8][f] * k;
    var outer = [[cx - 4.2 * k, by], [cx - 4.4 * k, by - 3 * k], [cx - 2.8 * k, by - 5 * k], [cx - 2.4 * k, by - 3.4 * k], [cx - 0.8 * k + sway * 0.4, by - hgt * 0.75], [cx + sway, by - hgt], [cx + 1.8 * k + sway * 0.5, by - hgt * 0.55], [cx + 3 * k, by - 4.6 * k], [cx + 4.4 * k, by - 2.6 * k], [cx + 4 * k, by]];
    ink(ctx, outer, { fill: PAL.fx.hot, lw: 0.8, amp: 0.22, bf: bf });
    ink(ctx, [[cx - 2.6 * k, by], [cx - 2.4 * k, by - 2.6 * k], [cx - 0.4 * k + sway * 0.3, by - hgt * 0.62], [cx + 1.6 * k, by - 3 * k], [cx + 2.6 * k, by]], { fill: '#fff3d6', lw: 0, amp: 0.15, bf: bf });
  }
  function emanata(ctx, cx, cy, r0, t, bf, light) {
    var I = light ? clamp(light.intensity == null ? 0.5 : light.intensity, 0, 1) : 0.5, pulse = 0.6 + 0.4 * hop(t), n = 8;
    for (var i = 1; i < n - 1; i++) {   // a fan of six short dashes above the light
      var a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.42;
      var r1 = r0, r2 = r0 + (2.2 + 2.4 * I) * pulse;
      ink(ctx, [[cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.9], [cx + Math.cos(a) * r2, cy + Math.sin(a) * r2 * 0.9]], { closed: false, lw: 0.7, amp: 0.12, bf: bf });
    }
  }

  // unitToken(ctx, rect, {team, kind, selected, dead, facing, noShadow}, t): a noodle-limbed cartoon figure.
  // Bean body in the team colour with one hard shade, white face with pie-cut eyes, white gloves, big black shoes.
  // Idles on the beat (stretch on the beat, squash off it); selected = a hop with stretch up and squash on landing.
  skin.unitToken = function (ctx, r, u, t) {
    u = u || {}; var s = r.h / 22, cx = r.x + r.w / 2, base = r.y + r.h - 0.6 * s, bf = boilOf(t), f = u.facing === -1 ? -1 : 1, kind = u.kind || 'fighter';
    var foe = u.team === 'b', body = PAL.team[u.team] || PAL.team.a, shade = mix(body, INK, 0.38), face = foe ? S.light : WHITE;
    var ph = beatOf(t) + (u.id === 'ilsa' ? 0.5 : 0), lift = 0, sy = 1 + 0.05 * Math.cos(TAU * ph);
    if (u.selected) { var fr = ph % 1; lift = Math.max(0, Math.sin(fr * Math.PI)) * 3.2 * s; sy = fr < 0.1 ? 0.8 : fr > 0.9 ? 0.86 : 1 + 0.14 * Math.sin(fr * Math.PI); }
    var sx = 1 / Math.sqrt(sy);
    withSmooth(ctx, function () {
      if (u.dead) ctx.globalAlpha *= 0.4;
      if (!u.noShadow) { ctx.fillStyle = rgba(INK, 0.28 * (1 - lift / (8 * s))); ctx.beginPath(); ctx.ellipse(cx, base, 6.4 * s * (1 - lift / (16 * s)), 1.7 * s, 0, 0, TAU); ctx.fill(); }
      var X = function (v) { return cx + v * s * f * sx; }, Y = function (v) { return base - lift + (v * s) * sy; };
      var hipY = -7.2, hipW = 1.9;
      // legs: two thin ink hoses that bow outward, then big shoes
      var stepA = Math.sin(TAU * ph) * (u.selected ? 0 : 0.5);
      [[-1, -hipW], [1, hipW]].forEach(function (L, li) {
        var foot = [X(L[1] * 1.35 + (li ? stepA : -stepA)), Y(-1.4)], hip = [X(L[1] * 0.75), Y(hipY + 1)];
        ink(ctx, noodle(hip, foot, L[0] * 1.1 * s * f, 1.15 * s), { fill: INK, lw: 0, amp: 0 });
      });
      [[-1, -hipW], [1, hipW]].forEach(function (L, li) {
        var fx = L[1] * 1.35 + (li ? stepA : -stepA) + 0.9;   // shoes point forward
        ink(ctx, ell(X(fx), Y(-1.3), 3.0 * s, 1.5 * s, 12), { fill: INK, lw: 0.4, amp: 0.1, bf: bf });
        ctx.fillStyle = WHITE; ctx.beginPath(); ctx.ellipse(X(fx + 0.9), Y(-1.75), 0.75 * s, 0.38 * s, 0, 0, TAU); ctx.fill();
      });
      // back arm (behind the body)
      var sw = Math.sin(TAU * ph) * 0.6;
      var bsh = [X(-2.8), Y(-12.6)], bhand = [X(-7.6), Y(-7.6 + sw)];
      ink(ctx, noodle(bsh, bhand, -1.6 * s * f, 1.5 * s), { fill: INK, lw: 0, amp: 0 });
      mitt(ctx, bhand[0], bhand[1], 1.5 * s, Math.atan2(bhand[1] - bsh[1], bhand[0] - bsh[0]), bf);
      // body: a bean, flat team colour with one hard crescent
      var B = [];
      for (var i = 0; i < 16; i++) { var a = i / 16 * TAU, rx = 3.7 + (Math.sin(a) > 0 ? 0.6 : -0.3), ry = 3.9; B.push([X(Math.cos(a) * rx), Y(-10.6 + Math.sin(a) * ry)]); }
      if (kind === 'mage') { B = [[X(-2.6), Y(-14.4)], [X(2.6), Y(-14.4)], [X(4.8), Y(-6.4)], [X(-4.8), Y(-6.4)]]; }
      lit(ctx, B, body, shade, { bf: bf, lw: 0.75, amp: 0.2, off: [-1 * s * f, -0.8 * s] });
      if (kind === 'knight') { ink(ctx, [[X(-3.8), Y(-9.8)], [X(4.2), Y(-9.8)]], { closed: false, lw: 0.9 * s, col: S.light, amp: 0.1, bf: bf }); ctx.fillStyle = S.light; ctx.beginPath(); ctx.arc(X(0.3), Y(-9.8), 0.8 * s, 0, TAU); ctx.fill(); }
      if (kind === 'mage') ink(ctx, [[X(0), Y(-14)], [X(0), Y(-6.8)]], { closed: false, lw: 0.4, col: rgba(INK, 0.7), amp: 0.1, bf: bf });
      // head
      var hx = 0.5, hy = -18.2, hr = 4.6;
      ink(ctx, ell(X(hx), Y(hy), hr * s * sx, hr * 0.95 * s * sy, 18), { fill: face, lw: 0.75, amp: 0.18, bf: bf });
      var blink = (beatOf(t) + (u.id ? (strSeed(u.id) & 7) : 0)) % 7 > 6.75;
      pieEye(ctx, X(hx + 0.2), Y(hy - 0.7), 1.3 * s, 1.9 * s, { bf: bf, lw: 0.35, look: [0.6 * f, 0.1], shut: blink });
      pieEye(ctx, X(hx + 2.7), Y(hy - 0.7), 1.2 * s, 1.85 * s, { bf: bf, lw: 0.35, look: [0.6 * f, 0.1], shut: blink });
      if (foe) {   // brows down, toothy grin
        ink(ctx, [[X(hx - 0.6), Y(hy - 2.6)], [X(hx + 1.4), Y(hy - 1.9)]], { closed: false, lw: 0.6, amp: 0.05, bf: bf });
        ink(ctx, [[X(hx + 1.8), Y(hy - 1.9)], [X(hx + 3.5), Y(hy - 2.6)]], { closed: false, lw: 0.6, amp: 0.05, bf: bf });
        var M = [[X(hx - 0.4), Y(hy + 1.3)], [X(hx + 3.2), Y(hy + 1.3)], [X(hx + 2.8), Y(hy + 2.6)], [X(hx + 0.1), Y(hy + 2.6)]];
        ink(ctx, M, { fill: WHITE, lw: 0.5, amp: 0.05, bf: bf });
        ink(ctx, [[X(hx + 0.9), Y(hy + 1.3)], [X(hx + 1), Y(hy + 2.6)]], { closed: false, lw: 0.3, amp: 0 }); ink(ctx, [[X(hx + 2), Y(hy + 1.3)], [X(hx + 1.9), Y(hy + 2.6)]], { closed: false, lw: 0.3, amp: 0 });
      } else {     // big smile
        ink(ctx, arcPts(X(hx + 1.4), Y(hy + 0.9), 1.9 * s, 1.3 * s, 0.25, Math.PI - 0.25, 7), { closed: false, lw: 0.55, amp: 0.06, bf: bf });
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(X(hx + 3.9), Y(hy + 0.2), 0.45 * s, 0, TAU); ctx.fill();   // nose
      }
      // headgear by kind
      if (kind === 'knight') {
        var Hm = arcPts(X(hx), Y(hy - 0.8), hr * 1.08 * s, hr * 1.02 * s, Math.PI, TAU, 10).map(function (p) { return p; });
        lit(ctx, Hm.concat([[X(hx + hr * 1.08 * f), Y(hy - 0.4)], [X(hx - hr * 1.08 * f), Y(hy - 0.4)]]), S.light, S.mid, { bf: bf, lw: 0.7, amp: 0.15, off: [-0.6 * s * f, -0.5 * s] });
        ink(ctx, noodle([X(hx - 0.6), Y(hy - 4.6)], [X(hx - 4.6), Y(hy - 6.8)], -1.2 * s * f, 1.6 * s), { fill: body, lw: 0.6, amp: 0.15, bf: bf });   // plume
      } else if (kind === 'mage') {
        var Hat = [[X(hx - 4.8), Y(hy - 1.6)], [X(hx + 5.2), Y(hy - 1.6)], [X(hx + 2.2), Y(hy - 3)], [X(hx - 1.4), Y(hy - 10.4)], [X(hx - 1.6), Y(hy - 3)]];
        lit(ctx, Hat, foe ? shade : body, mix(body, INK, 0.55), { bf: bf, lw: 0.7, amp: 0.15, off: [-0.7 * s * f, -0.5 * s] });
        star(ctx, X(hx + 0.2), Y(hy - 4.9), 1.0 * s, { fill: WHITE, lw: 0.3, bf: bf });
      } else if (kind === 'fighter' && foe) {   // a ragged tuft for the ghoul
        ink(ctx, [[X(hx - 2.8), Y(hy - 2.6)], [X(hx - 2.2), Y(hy - 6)], [X(hx - 0.8), Y(hy - 3.6)], [X(hx + 0.4), Y(hy - 6.6)], [X(hx + 1.4), Y(hy - 3.6)], [X(hx + 3), Y(hy - 5.4)], [X(hx + 3.2), Y(hy - 2.4)]], { fill: shade, lw: 0.6, amp: 0.15, bf: bf });
      }
      // front arm + weapon by kind
      var fsh = [X(3.0), Y(-12.8)], hand = [X(7.6), Y(-9.4 - sw)];
      ink(ctx, noodle(fsh, hand, 1.7 * s * f, 1.5 * s), { fill: INK, lw: 0, amp: 0 });
      if (kind === 'knight' || kind === 'lord') {
        ink(ctx, [[hand[0], hand[1]], [X(8.4), Y(-20.5 - sw)]], { closed: false, lw: 2.1 * s, amp: 0.1, bf: bf });
        ink(ctx, [[hand[0], hand[1]], [X(8.4), Y(-20.5 - sw)]], { closed: false, lw: 1.0 * s, col: WHITE, amp: 0.1, bf: bf });
        ink(ctx, [[X(6.1), Y(-11.4 - sw)], [X(9.3), Y(-11.0 - sw)]], { closed: false, lw: 1.0 * s, amp: 0.1, bf: bf });
      } else if (kind === 'mage') {
        ink(ctx, [[X(7.9), Y(-2.2)], [X(7.4), Y(-19)]], { closed: false, lw: 1.2 * s, col: INK, amp: 0.1, bf: bf });
        star(ctx, X(7.4), Y(-20.4), 1.9 * s * (0.85 + 0.25 * hop(t)), { fill: foe ? PAL.fx.hotL : PAL.fx.coldL, lw: 0.45, bf: bf });
      } else if (kind === 'archer') {
        ctx.strokeStyle = INK; ctx.lineWidth = 0.8 * s; ctx.beginPath(); ctx.arc(X(7.4), Y(-10), 5 * s, -Math.PI / 2, Math.PI / 2, f < 0); ctx.stroke();
      } else {   // fighter / monster: a fat club
        ink(ctx, noodle([hand[0], hand[1]], [X(9.6), Y(-17.8 - sw)], 0.6 * s * f, 2.2 * s), { fill: S.mid, lw: 0.6, amp: 0.15, bf: bf });
      }
      mitt(ctx, hand[0], hand[1], 1.6 * s, kind === 'mage' || kind === 'archer' ? Math.atan2(hand[1] - fsh[1], hand[0] - fsh[0]) : -Math.PI / 2, bf);
    });
  };

  // atmosphere(ctx, view, t, {phase: 'final'}): the film-print post pass. Gate weave (whole frame shifts a fraction of a pixel),
  // flicker, grain, dust and the odd hair, a faint scratch, vignette and rounded gate corners. Nothing hides gameplay.
  skin.atmosphere = function (ctx, v, t, o) {
    if (o && o.phase && o.phase !== 'final') return;
    var F = this.film || {}, fr = Math.floor((t || 0) * 24 + 1e-6), R = rng(fr * 7919 + 13), s = API.scaleOf(ctx);
    withSmooth(ctx, function () {
      if (F.weave && ctx.canvas && ctx.getTransform) {   // gate weave: copy the frame onto itself, shifted by whole device pixels
        var wx = Math.round((vnoise(fr * 0.11, 0.5, 71) - 0.5) * 2 * F.weave * s), wy = Math.round(((vnoise(fr * 0.13, 4.5, 73) - 0.5) * 2 + (hash2(fr, 1, 5) < 0.02 ? 1.5 : 0)) * F.weave * s);
        if (wx || wy) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(ctx.canvas, wx, wy); ctx.restore(); }
      }
      if (F.flicker) { var fl = (hash2(fr, 3, 9) - 0.5) * 2 * F.flicker; ctx.fillStyle = fl > 0 ? rgba(WHITE, fl) : rgba(INK, -fl); ctx.fillRect(v.x, v.y, v.w, v.h); }
      if (F.grain) { ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); texFill(ctx, grainTex('dark', false), F.grain, R() * 128, R() * 128, 0.7); ctx.beginPath(); ctx.rect(v.x, v.y, v.w, v.h); texFill(ctx, grainTex('light', true), F.grain * 0.8, R() * 128, R() * 128, 0.7); }
      if (F.dust) {
        var nd = 2 + Math.floor(R() * 5);
        for (var i = 0; i < nd; i++) { var dx = v.x + R() * v.w, dy = v.y + R() * v.h, dr = 0.3 + R() * 0.7; ctx.fillStyle = R() < 0.7 ? rgba(INK, 0.55) : rgba(WHITE, 0.6); ctx.beginPath(); ctx.ellipse(dx, dy, dr, dr * (0.6 + R() * 0.5), R() * 3, 0, TAU); ctx.fill(); }
        if (hash2(fr, 7, 11) < 0.12) { var hx = v.x + R() * v.w, hy = v.y + R() * v.h; ctx.strokeStyle = rgba(INK, 0.45); ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.bezierCurveTo(hx + 3, hy - 2, hx + 1, hy + 4, hx + 5, hy + 3); ctx.stroke(); }
      }
      if (F.scratch && hash2(Math.floor(fr / 6), 2, 17) < 0.35) { var sxp = v.x + hash2(Math.floor(fr / 6), 3, 19) * v.w + (R() - 0.5) * 0.6; ctx.fillStyle = rgba(WHITE, 0.18); ctx.fillRect(sxp, v.y, 0.35, v.h * (0.3 + hash2(Math.floor(fr / 6), 4, 23) * 0.5)); }
      if (F.vignette) {
        var cx = v.x + v.w / 2, cy = v.y + v.h / 2, g = ctx.createRadialGradient(cx, cy, Math.min(v.w, v.h) * 0.42, cx, cy, Math.hypot(v.w, v.h) * 0.56);
        g.addColorStop(0, rgba(INK, 0)); g.addColorStop(1, rgba(INK, F.vignette)); ctx.fillStyle = g; ctx.fillRect(v.x, v.y, v.w, v.h);
      }
      if (F.gate) {   // rounded film-gate corners
        var gr = F.gate; ctx.fillStyle = INK;
        [[v.x, v.y, 1, 1], [v.x + v.w, v.y, -1, 1], [v.x, v.y + v.h, 1, -1], [v.x + v.w, v.y + v.h, -1, -1]].forEach(function (c) {
          ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[0] + c[2] * gr, c[1]); ctx.arc(c[0] + c[2] * gr, c[1] + c[3] * gr, gr, c[3] > 0 ? -Math.PI / 2 : Math.PI / 2, c[2] > 0 ? Math.PI : 0, (c[2] > 0) === (c[3] > 0)); ctx.closePath(); ctx.fill();
        });
      }
    });
  };

  var SK = API.register(skin);
  REG_SKIN = SK;
  // drawing helpers so hosts can draw matching props, characters and effects
  SK.toon = { rng: rng, noise: vnoise, seed: strSeed, ink: ink, lit: lit, noodle: noodle, ell: ell, rrect: rrect, arcPts: arcPts, pieEye: pieEye, glove: glove, mitt: mitt, star: star, puff: puffPts, flame: flame, boil: boilOf, beat: beatOf, breathe: breathe, hop: hop };
  SK.numberLayout = function (text, o) { return numLayout(SK, String(text), o || {}); };
})(typeof window !== 'undefined' ? window : this);
