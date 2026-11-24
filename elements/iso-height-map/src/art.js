/* ===== shared art: the Highcliff map, procedural 16x24 unit sprites (front / back, 2 idle + 2 walk frames), sky backdrop,
   5x7 pixel font and window frame. All original, drawn by code. ===== */
'use strict';
const ART = (() => {
  const mkC = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const hx = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const mix = (a, b, t) => { const A = hx(a), B = hx(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const h2 = (x, y, s) => { let n = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; };
  const ramp = (c) => [mix(c, '#100818', 0.62), mix(c, '#100818', 0.32), c, mix(c, '#fff4e0', 0.3), mix(c, '#fff4e0', 0.6)];

  /* ---------- the map: 10 x 10, heights in levels (4 px each), terrain kinds ---------- */
  // height: 0-9 then a=10 b=11 c=12 d=13 e=14 ; '.' = no tile
  const HEIGHT = [
    '2388885567',
    '288e885467',
    '2888884346',
    '2888883225',
    '1236882104',
    '1124321003',
    '1112211112',
    '1111110012',
    '2111100122',
    '2211001223'
  ];
  // kinds: k rock, s stone, t stairs, g grass, m moss, d dirt, r road, w water, p planks (bridge), n sand
  const KIND = [
    'kkssssggmk',
    'ksssssgmgk',
    'ksssssgggg',
    'ksssssgdgg',
    'gggtskggwg',
    'gggtkggwwg',
    'gmggddgpng',
    'ggddrrwwng',
    'mgdrrwwngg',
    'gdrrwwnggm'
  ];
  const lv = c => c === '.' ? null : c >= 'a' ? c.charCodeAt(0) - 87 : +c;
  const NAMES = { k: 'rock', s: 'stone', t: 'stairs', g: 'grass', m: 'moss', d: 'dirt', r: 'road', w: 'water', p: 'wood', n: 'sand' };
  const MAP = { cols: 10, rows: 10,
    height: (x, y) => lv(HEIGHT[y][x]),
    kind: (x, y) => NAMES[KIND[y][x]] || 'grass' };
  // the two stair tiles descend toward +y (south) from the plateau
  MAP.stairs = (x, y) => KIND[y][x] === 't' ? 1 : null;
  MAP.cost = (x, y) => MAP.kind(x, y) === 'water' ? 2 : 1;

  /* ---------- unit sprites: 16 x 24, feet at (8, 23); drawn with code, outlined by dilation ---------- */
  const SKIN = ['#6a3a2a', '#b06a4a', '#e0a07a', '#f8c8a0'];
  const LOOK = {
    knight: { coat: '#3a64c8', trim: '#e0c060', helm: '#a8b0c0', weapon: 'sword', shield: '#2a4aa0', hat: 'helm', plume: '#e04a3a' },
    archer: { coat: '#3a8a5a', trim: '#e8d8a0', hood: '#2e6a44', weapon: 'bow', hat: 'hood' },
    scout: { coat: '#4a7ad8', trim: '#f0f0f8', hair: '#e8b040', weapon: 'dagger', hat: 'hair', band: '#e04a5a' },
    brute: { coat: '#a83a2e', trim: '#4a3020', helm: '#6a6a72', weapon: 'axe', hat: 'horns' },
    hexer: { coat: '#6a3a9a', trim: '#e070c0', hatC: '#2e2440', weapon: 'staff', hat: 'tall', robe: true },
    bowman: { coat: '#9a5a2a', trim: '#e0c080', hood: '#5a3a24', weapon: 'bow', hat: 'hood' }
  };
  function sprite(cls, back, frame) {
    const L = LOOK[cls], c = mkC(16, 24), g = c.getContext('2d');
    const P = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); }, R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const C = ramp(L.coat), T = ramp(L.trim), walk = frame >= 2, bob = frame === 1 ? 1 : 0, lf = walk ? (frame === 2 ? 1 : -1) : 0;
    const by = 0 + bob;   // upper body sinks 1 px on the second idle frame
    // legs and boots
    const leg = (x, dy) => { R(x, 17 + Math.max(0, dy), 2, 5 - Math.abs(dy), mix(L.coat, '#2a2030', 0.55)); R(x, 21, 2, 2, '#2a1a14'); P(x, 21, '#5a3a24'); };
    leg(5, lf); leg(9, -lf);
    // torso (robe reaches the ankles for the hexer)
    const th = L.robe ? 11 : 8;
    for (let y = 0; y < th; y++) for (let x = 0; x < 8; x++) {
      const t = x < 2 ? 3 : x > 5 ? 1 : 2, yy = 10 + y + by;
      if (L.robe && y > 7 && (x === 0 || x === 7)) continue;
      P(4 + x, yy, C[t - (y > th - 3 ? 1 : 0)]);
    }
    R(4, 15 + by, 8, 1, T[1]); P(7, 15 + by, T[3]);   // belt + buckle
    R(4, 10 + by, 8, 1, T[2]);                          // collar trim
    // arms (sleeves) and hands
    R(3, 11 + by, 1, 4, C[3]); R(12, 11 + by, 1, 4, C[1]); P(3, 15 + by, SKIN[2]); P(12, 15 + by, SKIN[1]);
    // head
    const hy = 4 + by;
    if (!back) {
      R(5, hy, 6, 6, SKIN[2]); R(5, hy, 1, 6, SKIN[3]); R(10, hy, 1, 6, SKIN[1]); R(5, hy + 5, 6, 1, SKIN[1]);
      P(7, hy + 3, '#1a1020'); P(10, hy + 3, '#1a1020'); P(9, hy + 4, SKIN[1]);
    } else { R(5, hy, 6, 6, '#3a2418'); R(5, hy, 1, 6, '#5a3a24'); }
    // headgear
    if (L.hat === 'helm') {
      const H = ramp(L.helm); R(4, hy - 1, 8, 4, H[2]); R(4, hy - 1, 8, 1, H[4]); R(4, hy - 1, 1, 4, H[3]); R(11, hy - 1, 1, 4, H[1]);
      if (!back) { R(5, hy + 2, 6, 1, H[1]); P(5, hy + 3, H[2]); } else R(4, hy + 2, 8, 3, H[1]);
      R(7, hy - 4, 2, 3, L.plume); P(7, hy - 4, mix(L.plume, '#ffffff', 0.4));
    } else if (L.hat === 'hood') {
      const H = ramp(L.hood); R(4, hy - 1, 8, 3, H[2]); R(4, hy - 1, 8, 1, H[3]); R(4, hy, 1, 6, H[2]); R(11, hy, 1, 6, H[1]); P(5, hy - 2, H[2]); R(6, hy - 2, 4, 1, H[3]);
      if (back) R(5, hy, 6, 7, H[2]);
    } else if (L.hat === 'hair') {
      R(4, hy - 1, 8, 3, L.hair); R(4, hy - 1, 8, 1, mix(L.hair, '#ffffff', 0.4)); R(4, hy + 2, 1, 3, L.hair); R(11, hy + 2, 1, 2, mix(L.hair, '#000000', 0.3));
      R(4, hy + 1, 8, 1, L.band); if (back) { R(5, hy, 6, 5, L.hair); P(3, hy + 2, L.band); P(2, hy + 3, L.band); }
    } else if (L.hat === 'horns') {
      const H = ramp(L.helm); R(4, hy - 1, 8, 4, H[2]); R(4, hy - 1, 8, 1, H[3]); R(11, hy - 1, 1, 4, H[1]);
      R(2, hy - 3, 2, 3, '#e8dcc0'); P(2, hy - 4, '#fff8e8'); R(12, hy - 3, 2, 3, '#c8b898'); P(13, hy - 4, '#fff8e8');
      if (!back) R(5, hy + 2, 6, 1, H[1]); else R(4, hy + 2, 8, 3, H[1]);
    } else if (L.hat === 'tall') {
      const H = ramp(L.hatC); R(3, hy, 10, 2, H[2]); R(3, hy, 10, 1, H[3]); R(5, hy - 3, 6, 3, H[2]); R(6, hy - 5, 4, 2, H[2]); R(7, hy - 7, 2, 2, H[3]); R(5, hy - 1, 6, 1, L.trim);
      if (back) R(5, hy + 2, 6, 4, '#c8c0d0');
    }
    // weapon and shield (front: weapon on the right hand; back: drawn first-ish, partly hidden)
    const W = L.weapon;
    if (W === 'sword') { R(13, 6 + by, 1, 9, '#e8eef8'); P(13, 6 + by, '#ffffff'); R(12, 14 + by, 3, 1, '#c8a040'); P(13, 15 + by, '#6a4020'); if (!back) { R(1, 11 + by, 4, 6, ramp(L.shield)[2]); R(1, 11 + by, 4, 1, ramp(L.shield)[4]); P(2, 13 + by, L.trim); P(3, 14 + by, L.trim); } }
    if (W === 'bow') { for (let k = 0; k < 11; k++) P(13 + (k > 2 && k < 8 ? 1 : 0), 6 + k + by, '#8a5a2a'); for (let k = 1; k < 10; k++) P(13, 6 + k + by, back ? '#8a5a2a' : '#e8e0c8'); if (back) R(6, 9 + by, 4, 7, '#6a4020'); }
    if (W === 'dagger') { R(13, 12 + by, 1, 4, '#e8eef8'); P(13, 16 + by, '#6a4020'); }
    if (W === 'axe') { R(13, 4 + by, 1, 13, '#7a5030'); R(12, 4 + by, 3, 4, '#b8b8c4'); R(14, 5 + by, 1, 2, '#e8e8f0'); }
    if (W === 'staff') { R(2, 6 + by, 1, 15, '#7a5030'); R(1, 4 + by, 3, 3, '#c058e8'); P(1, 4 + by, '#f8d0ff'); }
    // outline by dilation (4-neighbour), ink colour
    const img = g.getImageData(0, 0, 16, 24), D = img.data, out = g.createImageData(16, 24), O = out.data;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4; if (D[i + 3]) { O[i] = D[i]; O[i + 1] = D[i + 1]; O[i + 2] = D[i + 2]; O[i + 3] = 255; continue; }
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < 16 && Y < 24 && D[(Y * 16 + X) * 4 + 3]; });
      if (nb) { O[i] = 20; O[i + 1] = 12; O[i + 2] = 24; O[i + 3] = 255; }
    }
    g.putImageData(out, 0, 0);
    return c;
  }
  const SPR = {};
  function frames(cls) { if (!SPR[cls]) SPR[cls] = { f: [0, 1, 2, 3].map(k => sprite(cls, false, k)), b: [0, 1, 2, 3].map(k => sprite(cls, true, k)) }; return SPR[cls]; }
  const greyCache = {};
  function grey(img) {
    if (greyCache[img.__k]) return greyCache[img.__k];
    const c = mkC(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height); for (let i = 0; i < d.data.length; i += 4) { const v = (d.data[i] * 0.3 + d.data[i + 1] * 0.5 + d.data[i + 2] * 0.2) * 0.7; d.data[i] = v; d.data[i + 1] = v; d.data[i + 2] = v + 12; }
    g.putImageData(d, 0, 0); return c;
  }
  // draw a unit with its feet at (fx, fy). info = module draw info {flip, back, walking, xray, t}
  function drawUnitSprite(g, cls, fx, fy, info, opts) {
    opts = opts || {};
    const F = frames(cls), t = info.t || 0, ph = opts.phase || 0;
    const k = info.walking ? 2 + (Math.floor(t * 8) % 2) : (Math.floor(t * 1.6 + ph) % 2);
    let img = (info.back ? F.b : F.f)[k];
    if (opts.grey) { img.__k = img.__k || cls + (info.back ? 'b' : 'f') + k; img = grey(img); }
    if (!info.xray && !opts.noShadow) { g.fillStyle = 'rgba(16,8,28,0.45)'; g.fillRect(fx - 5, fy - 1, 10, 3); g.fillRect(fx - 6, fy, 12, 1); }
    const x = fx - 8, y = fy - 23 - (opts.lift || 0);
    if (info.flip) { g.save(); g.translate(x + 16, y); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore(); } else g.drawImage(img, x, y);
    if (opts.flash && !info.xray) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = opts.flash; if (info.flip) { g.translate(x + 16, y); g.scale(-1, 1); g.drawImage(img, 0, 0); } else g.drawImage(img, x, y); g.restore(); }
  }
  function portrait(g, cls, x, y, size) {   // head-and-shoulders crop of the front idle frame
    const img = frames(cls).f[0]; g.drawImage(img, 1, 0, 14, 14, x, y, size, size);
  }

  /* ---------- backdrop: dusk sky, two ridge lines, cloud bands (cached), drifting clouds ---------- */
  let bg = null;
  function backdrop(W, H) {
    if (bg) return bg;
    const c = mkC(W, H), g = c.getContext('2d');
    const SKY = ['#1a2450', '#2a3a6c', '#465489', '#6e6aa0', '#a07aa0', '#d4948a', '#f0bc8c'];
    const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const f = Math.min(1, y / (H * 0.62)) * (SKY.length - 1), k = Math.floor(f), q = f - k;
      g.fillStyle = SKY[Math.min(SKY.length - 1, k + (B[(y % 4) * 4 + (x % 4)] / 16 < q ? 1 : 0))]; g.fillRect(x, y, 1, 1);
    }
    const ridge = (base, amp, sc, seed, cols) => {
      for (let x = 0; x < W; x++) {
        const v = (Math.sin(x / sc + seed) + Math.sin(x / (sc * 0.43) + seed * 2.1) * 0.5 + h2(x >> 2, 0, seed) * 0.3);
        const top = Math.round(base - v * amp);
        for (let y = top; y < H; y++) { g.fillStyle = y === top ? cols[0] : (y - top < 3 && (x + y) % 3 === 0) ? cols[1] : cols[2]; g.fillRect(x, y, 1, 1); }
      }
    };
    ridge(H * 0.5, 9, 23, 1.3, ['#c8a0b0', '#9a84a8', '#86749c']);
    ridge(H * 0.62, 12, 17, 4.1, ['#7a7a8e', '#5c6078', '#4a4c66']);
    ridge(H * 0.76, 10, 11, 7.7, ['#4e5a54', '#3a463e', '#2c3630']);
    // a warm sun glow low on the right
    for (let y = 60; y < 130; y++) for (let x = 150; x < W; x++) { const d = Math.hypot(x - 226, (y - 100) * 1.3); if (d < 40 && B[(y % 4) * 4 + (x % 4)] / 16 < (1 - d / 40) * 0.7 && y < H * 0.6) { g.fillStyle = d < 9 ? '#fff4d0' : '#f8d0a0'; g.fillRect(x, y, 1, 1); } }
    return (bg = c);
  }
  function cloud(g, cx, cy, w, seed) {
    for (let x = -w; x <= w; x++) {
      const t = 1 - (x / w) * (x / w), hh = Math.round(t * (2 + h2(x + 40, 1, seed) * 3) + 1);
      for (let y = -hh; y <= 1; y++) { g.fillStyle = y === -hh ? '#f8e4d8' : y >= 0 ? '#b88aa0' : '#e0b8c0'; g.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1); }
    }
  }
  function sky(g, W, H, t) {
    g.drawImage(backdrop(W, H), 0, 0);
    [[30, 26, 20, 1, 2.2], [140, 18, 15, 2, 2.2], [220, 34, 24, 3, 2.2], [90, 48, 10, 4, 4.2]].forEach(([x, y, w, s, sp]) => cloud(g, ((x + t * sp) % (W + 60)) - 30, y, w, s));
  }

  /* ---------- 5x7 font and the window frame ---------- */
  const GL = {
    A: '01110,10001,10001,11111,10001,10001,10001', B: '11110,10001,10001,11110,10001,10001,11110', C: '01110,10001,10000,10000,10000,10001,01110',
    D: '11110,10001,10001,10001,10001,10001,11110', E: '11111,10000,10000,11110,10000,10000,11111', F: '11111,10000,10000,11110,10000,10000,10000',
    G: '01110,10001,10000,10111,10001,10001,01111', H: '10001,10001,10001,11111,10001,10001,10001', I: '01110,00100,00100,00100,00100,00100,01110',
    J: '00111,00010,00010,00010,00010,10010,01100', K: '10001,10010,10100,11000,10100,10010,10001', L: '10000,10000,10000,10000,10000,10000,11111',
    M: '10001,11011,10101,10101,10001,10001,10001', N: '10001,10001,11001,10101,10011,10001,10001', O: '01110,10001,10001,10001,10001,10001,01110',
    P: '11110,10001,10001,11110,10000,10000,10000', Q: '01110,10001,10001,10001,10101,10010,01101', R: '11110,10001,10001,11110,10100,10010,10001',
    S: '01111,10000,10000,01110,00001,00001,11110', T: '11111,00100,00100,00100,00100,00100,00100', U: '10001,10001,10001,10001,10001,10001,01110',
    V: '10001,10001,10001,10001,10001,01010,00100', W: '10001,10001,10001,10101,10101,10101,01010', X: '10001,10001,01010,00100,01010,10001,10001',
    Y: '10001,10001,01010,00100,00100,00100,00100', Z: '11111,00001,00010,00100,01000,10000,11111',
    0: '01110,10001,10011,10101,11001,10001,01110', 1: '00100,01100,00100,00100,00100,00100,01110', 2: '01110,10001,00001,00010,00100,01000,11111',
    3: '11111,00010,00100,00010,00001,10001,01110', 4: '00010,00110,01010,10010,11111,00010,00010', 5: '11111,10000,11110,00001,00001,10001,01110',
    6: '00110,01000,10000,11110,10001,10001,01110', 7: '11111,00001,00010,00100,01000,01000,01000', 8: '01110,10001,10001,01110,10001,10001,01110',
    9: '01110,10001,10001,01111,00001,00010,01100', '-': '00000,00000,00000,01110,00000,00000,00000', '+': '00000,00100,00100,11111,00100,00100,00000',
    '/': '00001,00010,00010,00100,01000,01000,10000', '.': '00000,00000,00000,00000,00000,01100,01100', '%': '11001,11010,00010,00100,01000,01011,10011',
    '>': '01000,00100,00010,00001,00010,00100,01000', ':': '00000,01100,01100,00000,01100,01100,00000', '!': '00100,00100,00100,00100,00100,00000,00100',
    '?': '01110,10001,00001,00010,00100,00000,00100', "'": '00100,00100,01000,00000,00000,00000,00000'
  };
  const textW = s => { let w = 0; for (const ch of String(s)) w += ch === ' ' ? 4 : 6; return Math.max(0, w - 1); };
  function text(g, s, x, y, c1 = '#ffffff', c2 = '#c8d4ff', sh = '#0a0c24') {
    const str = String(s).toUpperCase();
    for (let pass = 0; pass < 2; pass++) { let cx = x; for (const ch of str) { if (ch !== ' ') { const rows = (GL[ch] || GL['?']).split(','); for (let ry = 0; ry < 7; ry++) for (let rx = 0; rx < 5; rx++) if (rows[ry][rx] === '1') { g.fillStyle = pass ? (ry < 4 ? c1 : c2) : sh; g.fillRect(cx + rx + (pass ? 0 : 1), y + ry + (pass ? 0 : 1), 1, 1); } } cx += ch === ' ' ? 4 : 6; } }
    return textW(str);
  }
  const WIN = { a: ['#2a4ab0', '#1e3488', '#16266a', '#101a4e', '#a8c4ff', '#0a1030'], b: ['#a8402e', '#862e22', '#66221a', '#4a1812', '#ffc0a8', '#2a0a08'], n: ['#3e4a7e', '#303a66', '#262e52', '#1c2240', '#b4c0ec', '#0c1028'] };
  function win(g, x, y, w, h, team = 'n', alpha = 0.95) {
    const C = WIN[team] || WIN.n; g.globalAlpha = alpha;
    g.fillStyle = '#06061a'; g.fillRect(x + 1, y, w - 2, h); g.fillRect(x, y + 1, w, h - 2);
    for (let i = 0; i < 4; i++) { g.fillStyle = C[i]; const y0 = y + 1 + Math.floor((h - 2) * i / 4), y1 = y + 1 + Math.floor((h - 2) * (i + 1) / 4); g.fillRect(x + 1, y0, w - 2, y1 - y0); }
    g.fillStyle = C[4]; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 4);
    g.fillStyle = C[5]; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
    [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]].forEach(([a, b]) => { g.fillStyle = '#7a5410'; g.fillRect(a, b, 2, 2); g.fillStyle = '#ffe070'; g.fillRect(a, b, 1, 1); });
    g.globalAlpha = 1;
  }
  function bar(g, x, y, w, frac, col) {
    g.fillStyle = '#0a0612'; g.fillRect(x - 1, y - 1, w + 2, 4); g.fillStyle = '#2a2236'; g.fillRect(x, y, w, 2);
    const f = Math.max(0, Math.round(w * frac)); g.fillStyle = col; g.fillRect(x, y, f, 2); g.fillStyle = mix(col, '#ffffff', 0.45); g.fillRect(x, y, f, 1);
  }
  function banner(g, W, H, txt, team, p) {   // phase banner sliding through the middle; p 0..1
    const k = p < 0.2 ? p / 0.2 : p > 0.8 ? (1 - p) / 0.2 : 1, h = Math.round(26 * k); if (h < 2) return;
    const y = Math.round(H / 2 - h / 2), C = WIN[team] || WIN.n;
    g.globalAlpha = 0.86; g.fillStyle = C[3]; g.fillRect(0, y, W, h); g.globalAlpha = 1; g.fillStyle = C[4]; g.fillRect(0, y, W, 1); g.fillRect(0, y + h - 1, W, 1);
    if (h > 12) text(g, txt, Math.round(W / 2 - textW(txt) / 2), y + Math.round(h / 2) - 4, '#fff4c8', '#e8c870');
  }
  return { MAP, LOOK, frames, drawUnitSprite, portrait, sky, text, textW, win, bar, banner, mix, h2 };
})();
