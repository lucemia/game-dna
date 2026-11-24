/* ===== shared pixel kit: 256x224 native, original art, light from top-left ===== */
const W = 256, H = 224, FIELD_H = 156, FRAME = 1000 / 60;
const OUT = '#140c1c';
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function px(g, x, y, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
function hash(a, b) { let h = (a * 374761393 + b * 668265263 + 1013904223) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function rng(seed) { let s = (seed * 2654435761 >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - (1 - t) * (1 - t);
function ell(g, cx, cy, rx, ry, c) {
  g.fillStyle = c; cx = Math.round(cx); cy = Math.round(cy);
  for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.25)))); g.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
}
// shaded ball, ramp = [dark, mid, light, highlight]
function ball(g, cx, cy, rx, ry, R) {
  ell(g, cx, cy, rx, ry, R[0]); ell(g, cx - 1, cy - 1, Math.max(0, rx - 1), Math.max(0, ry - 1), R[1]);
  if (rx > 2 && ry > 2) ell(g, cx - Math.round(rx * 0.3), cy - Math.round(ry * 0.35), Math.round(rx * 0.45), Math.round(ry * 0.4), R[2]);
  if (R[3] && rx > 4) ell(g, cx - Math.round(rx * 0.45), cy - Math.round(ry * 0.55), Math.max(1, Math.round(rx * 0.15)), 0, R[3]);
}
function alphaAt(d, w, h, x, y) { return x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 40; }
function outlined(src, col) {
  const w = src.width + 2, h = src.height + 2, c = mk(w, h), g = c.getContext('2d');
  const d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data, sw = src.width, sh = src.height;
  g.fillStyle = col;
  for (let y = -1; y <= sh; y++) for (let x = -1; x <= sw; x++)
    if (!alphaAt(d, sw, sh, x, y) && (alphaAt(d, sw, sh, x - 1, y) || alphaAt(d, sw, sh, x + 1, y) || alphaAt(d, sw, sh, x, y - 1) || alphaAt(d, sw, sh, x, y + 1))) g.fillRect(x + 1, y + 1, 1, 1);
  g.drawImage(src, 1, 1); return c;
}
function tint(src, col, a) { const c = mk(src.width, src.height), g = c.getContext('2d'); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height); return c; }
// sprite = {c, hit, ax, ay}: anchor = feet; hit = tinted interior, outline kept
function sprite(w, h, ax, ay, draw, ol) {
  const raw = mk(w, h); draw(raw.getContext('2d'));
  return { c: outlined(raw, ol || OUT), hit: outlined(tint(raw, '#ffe8e0', 0.62), ol || OUT), ax: ax + 1, ay: ay + 1, w: w + 2, h: h + 2 };
}
function drawSpr(g, s, x, y, o) { o = o || {}; if (o.alpha != null) g.globalAlpha = o.alpha; g.drawImage(o.hit ? s.hit : s.c, Math.round(x - s.ax), Math.round(y - s.ay)); g.globalAlpha = 1; }

/* ----- 5x7 pixel font (original) ----- */
const F5SRC = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.', C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.', E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#', I: '###|.#.|.#.|.#.|.#.|.#.|###',
  J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..', K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#', O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....', Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..', U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..', W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.', 2: '.###.|#...#|....#|...#.|..#..|.#...|#####',
  3: '####.|....#|....#|.###.|....#|....#|####.', 4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
  6: '.###.|#....|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...', 8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  9: '.###.|#...#|#...#|.####|....#|....#|.###.', '/': '....#|...#.|...#.|..#..|.#...|.#...|#....', '-': '....|....|....|####|....|....|....',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....', ':': '.|#|.|.|.|#|.', '.': '.|.|.|.|.|.|#', '!': '#|#|#|#|#|.|#', "'": '#|#|.|.|.|.|.',
  ' ': '...|...|...|...|...|...|...', '>': '#...|.#..|..#.|...#|..#.|.#..|#...', '?': '.###.|#...#|....#|...#.|..#..|.....|..#..', '(': '.#|#.|#.|#.|#.|#.|.#', ')': '#.|.#|.#|.#|.#|.#|#.'
};
const F5 = {}; for (const k in F5SRC) F5[k] = F5SRC[k].split('|');
function textW(s) { let w = 0; for (const ch of s) w += (F5[ch] || F5['?'])[0].length + 1; return Math.max(0, w - 1); }
const TXC = {};
function textImg(s, col, sh, col2) {
  const key = s + '|' + col + '|' + sh + '|' + col2; if (TXC[key]) return TXC[key];
  const c = mk(textW(s) + 2, 9), g = c.getContext('2d');
  for (const pass of [0, 1]) {
    let x = 0;
    for (const ch of s) {
      const rows = F5[ch] || F5['?'];
      for (let y = 0; y < 7; y++) for (let i = 0; i < rows[y].length; i++) if (rows[y][i] === '#') {
        if (!pass) { if (sh) px(g, x + i + 1, y + 1, sh); } else px(g, x + i, y, col2 && y >= 4 ? col2 : col);
      }
      x += rows[0].length + 1;
    }
  }
  return (TXC[key] = c);
}
function drawText(g, s, x, y, col, sh, col2) { g.drawImage(textImg(s, col || '#fff', sh === undefined ? '#0a0814' : sh, col2), Math.round(x), Math.round(y)); return textW(s); }

/* ----- windows, gauges ----- */
const WINC = {};
function winImg(w, h) {
  const key = w + 'x' + h; if (WINC[key]) return WINC[key];
  const c = mk(w, h), g = c.getContext('2d'), bands = ['#2c3870', '#26305f', '#212a54', '#1c2449', '#181f3f', '#141a36'];
  for (let y = 0; y < h; y++) rect(g, 0, y, w, 1, bands[Math.min(5, Math.floor(y / h * 6))]);
  rect(g, 0, 0, w, 1, '#07060e'); rect(g, 0, h - 1, w, 1, '#07060e'); rect(g, 0, 0, 1, h, '#07060e'); rect(g, w - 1, 0, 1, h, '#07060e');
  rect(g, 1, 1, w - 2, 1, '#f2dc98'); rect(g, 1, 1, 1, h - 2, '#f2dc98'); rect(g, 1, h - 2, w - 2, 1, '#8a6428'); rect(g, w - 2, 1, 1, h - 2, '#8a6428');
  rect(g, 2, 2, w - 4, 1, '#c09848'); rect(g, 2, 2, 1, h - 4, '#c09848'); rect(g, 2, h - 3, w - 4, 1, '#5a4020'); rect(g, w - 3, 2, 1, h - 4, '#5a4020');
  rect(g, 3, 3, w - 6, 1, '#0c1028'); rect(g, 3, 3, 1, h - 6, '#0c1028');
  g.clearRect(0, 0, 1, 1); g.clearRect(w - 1, 0, 1, 1); g.clearRect(0, h - 1, 1, 1); g.clearRect(w - 1, h - 1, 1, 1);
  for (const [x, y] of [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]]) px(g, x, y, '#fff4c8');
  return (WINC[key] = c);
}
function drawWin(g, x, y, w, h) { g.drawImage(winImg(w, h), Math.round(x), Math.round(y)); }
const GAUGE = { hp: ['#e0ffe8', '#5ce08e', '#2a9a5a', '#145a34'], low: ['#fff2c0', '#ffc444', '#c07818', '#6a3e10'], crit: ['#ffd8d0', '#f05a50', '#b42a3a', '#6a1424'],
  mp: ['#e0f6ff', '#5ac8f8', '#2a80c0', '#14406a'], foe: ['#ffe4d0', '#f08a50', '#b44a2a', '#6a2414'], ghost: ['#fff', '#ffffff', '#d8d8f0', '#a0a0c8'] };
function drawGauge(g, x, y, w, h, fr, kind, ghostFr) {
  rect(g, x + 1, y, w - 2, 1, '#07060e'); rect(g, x + 1, y + h - 1, w - 2, 1, '#07060e'); rect(g, x, y + 1, 1, h - 2, '#07060e'); rect(g, x + w - 1, y + 1, 1, h - 2, '#07060e');
  const iw = w - 2, ih = h - 2; rect(g, x + 1, y + 1, iw, ih, '#1a1c3e'); rect(g, x + 1, y + 1, iw, 1, '#0e1030');
  if (ghostFr != null && ghostFr > fr) { const gw = Math.round(clamp(ghostFr, 0, 1) * iw); rect(g, x + 1, y + 1, gw, ih, '#e8e4ff'); rect(g, x + 1, y + h - 2, gw, 1, '#a8a0d0'); }
  const fw = Math.round(clamp(fr, 0, 1) * iw); if (fw <= 0) return;
  const C = GAUGE[kind] || GAUGE.hp;
  rect(g, x + 1, y + 1, fw, ih, C[1]); rect(g, x + 1, y + 1, fw, 1, C[0]); if (ih > 2) rect(g, x + 1, y + h - 2, fw, 1, C[2]);
  if (fw < iw) rect(g, x + fw, y + 1, 1, ih, C[3]);
}
function drawBanner(g, txt) { const w = textW(txt) + 24, x = Math.round((W - w) / 2); drawWin(g, x, 4, w, 17); drawText(g, txt, x + 12, 9, '#ffffff', '#0a0814', '#f2dc98'); px(g, x + 6, 12, '#f2dc98'); px(g, x + w - 7, 12, '#f2dc98'); }
function bannerBox(txt) { const w = textW(txt) + 24; return { x: Math.round((W - w) / 2), y: 4, w, h: 17 }; }
// pointing hand, tip at (x,y), pointing right
function drawHand(g, x, y) {
  const rows = ['.oooo.....', 'oWWWWoooo.', 'oWWWWWWWWo', 'oWWWWooooo', 'oWWWWo....', 'osWWso....', '.oooo.....'], P = { o: '#140c1c', W: '#ffffff', s: '#b8c0dc' };
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (P[r[i]]) px(g, x - 10 + i, y - 3 + j, P[r[i]]); });
}

/* ----- sprites ----- */
const SKIN = ['#8a4a30', '#d88a60', '#f6c098', '#fff0d8'];
function buildRowan(pose) {
  return sprite(34, 32, 20, 31, g => {
    const lean = pose === 'attack' ? -2 : pose === 'hurt' ? 2 : 0, ox = 14 + lean;
    rect(g, ox + 2, 25, 3, 6, '#3a2418'); rect(g, ox + 7, 25, 3, 6, '#3a2418'); rect(g, ox + 2, 25, 1, 5, '#6a4430'); rect(g, ox + 1, 30, 4, 1, '#2a1810'); rect(g, ox + 6, 30, 4, 1, '#2a1810');
    rect(g, ox + 2, 20, 8, 6, '#4a3a5c'); rect(g, ox + 2, 20, 3, 5, '#6a5a84');
    rect(g, ox + 9, 11, 4, 14, '#7a1a2a'); rect(g, ox + 11, 12, 2, 13, '#520f1c'); rect(g, ox + 9, 11, 1, 10, '#a83040');
    rect(g, ox + 1, 11, 10, 10, '#235084'); rect(g, ox + 1, 11, 4, 9, '#3478b8'); rect(g, ox + 2, 12, 1, 6, '#78b8ee'); rect(g, ox + 8, 12, 2, 8, '#183a62');
    rect(g, ox + 1, 19, 10, 2, '#7a4e22'); px(g, ox + 4, 19, '#ffe070'); px(g, ox + 4, 20, '#c09030');
    rect(g, ox + 1, 10, 9, 2, '#9aa8c8'); rect(g, ox + 1, 10, 4, 1, '#dde6ff');
    ball(g, ox + 5, 6, 4, 4, SKIN); rect(g, ox + 4, 1, 7, 3, '#6a2a14'); rect(g, ox + 7, 2, 4, 7, '#6a2a14'); rect(g, ox + 3, 1, 5, 1, '#b8582a'); px(g, ox + 2, 3, '#6a2a14'); rect(g, ox + 5, 2, 3, 1, '#e07a3a');
    px(g, ox + 3, 6, '#1a1020'); px(g, ox + 3, 8, '#b06048');
    if (pose === 'attack') {
      rect(g, ox - 3, 13, 5, 3, '#235084'); rect(g, ox - 4, 14, 2, 2, SKIN[2]);
      rect(g, ox - 18, 13, 14, 1, '#f4f8ff'); rect(g, ox - 18, 14, 14, 1, '#9aa8c8'); px(g, ox - 19, 14, '#f4f8ff'); px(g, ox - 13, 13, '#ffffff');
      rect(g, ox - 4, 11, 1, 6, '#e0b040'); rect(g, ox - 2, 14, 2, 1, '#6a4020');
    } else {
      const ay = pose === 'hurt' ? 1 : 0;
      rect(g, ox - 1, 13 + ay, 3, 6, '#235084'); rect(g, ox - 1, 18 + ay, 2, 2, SKIN[2]);
      rect(g, ox - 2, 2 + ay, 2, 15, '#d8e2f8'); rect(g, ox - 1, 2 + ay, 1, 15, '#8a98b8'); px(g, ox - 2, 1 + ay, '#ffffff'); px(g, ox - 2, 4 + ay, '#ffffff');
      rect(g, ox - 4, 17 + ay, 6, 1, '#e0b040'); rect(g, ox - 4, 17 + ay, 2, 1, '#fff0a0'); rect(g, ox - 2, 18 + ay, 2, 3, '#6a4020'); px(g, ox - 2, 21 + ay, '#e0b040');
    }
  });
}
function buildMira(pose) {
  return sprite(30, 36, 17, 35, g => {
    const ox = 12 + (pose === 'hurt' ? 2 : 0);
    for (let y = 14; y < 35; y++) { const w = 4 + Math.floor((y - 14) * 0.42); rect(g, ox + 6 - w, y, w * 2, 1, '#4a2470'); rect(g, ox + 6 - w, y, Math.max(1, Math.round(w * 0.7)), 1, '#6e3aa0'); px(g, ox + 7 - w, y, '#9a68d0'); rect(g, ox + 6 + w - 2, y, 2, 1, '#2e1450'); }
    rect(g, ox, 34, 13, 1, '#2e1450'); rect(g, ox + 2, 22, 9, 1, '#e8c060'); rect(g, ox + 2, 22, 3, 1, '#fff0a8');
    rect(g, ox + 1, 12, 10, 4, '#5a2e86'); rect(g, ox + 1, 12, 4, 3, '#8050b8');
    ball(g, ox + 6, 8, 4, 4, SKIN);
    rect(g, ox + 3, 2, 8, 4, '#e8d8a0'); rect(g, ox + 8, 4, 4, 11, '#e8d8a0'); rect(g, ox + 10, 6, 2, 9, '#b8a070'); rect(g, ox + 4, 2, 4, 1, '#fff8d8');
    for (let i = 0; i < 7; i++) rect(g, ox + 1 + i, 3 - Math.min(i, 6 - i), 1, 1, '#3a1c5e');
    rect(g, ox + 1, 3, 11, 2, '#3a1c5e'); rect(g, ox + 1, 3, 5, 1, '#6e3aa0'); rect(g, ox - 1, 5, 14, 1, '#2e1450'); rect(g, ox - 1, 5, 6, 1, '#5a2e86');
    px(g, ox + 4, 8, '#1a1020'); px(g, ox + 4, 10, '#b06048');
    const up = pose === 'cast' ? -5 : 0, sx = ox - 3 + (pose === 'cast' ? -2 : 0);
    rect(g, sx, 8 + up, 2, 26 - up * 0, '#7a4a24'); rect(g, sx, 8 + up, 1, 26, '#a8703a');
    rect(g, sx - 1, 16 + up, 6, 3, '#5a2e86'); rect(g, sx + 1, 17 + up, 2, 2, SKIN[2]);
    ball(g, sx + 1, 5 + up, 3, 3, ['#1a5a8a', '#3aa8e0', '#9ae8ff', '#ffffff']);
    rect(g, sx - 1, 8 + up, 4, 1, '#e8c060');
  });
}
const STONE = ['#3a3442', '#5e5868', '#8a8494', '#c0bac8'];
function buildGolem(pose) {
  return sprite(56, 54, 26, 53, g => {
    const raise = pose === 'raise', slam = pose === 'slam', hurt = pose === 'hurt', lx = hurt ? -2 : slam ? 3 : 0;
    ball(g, 17 + lx, 45, 6, 7, STONE); ball(g, 34 + lx, 45, 6, 7, STONE);
    rect(g, 11 + lx, 50, 13, 3, '#2a2430'); rect(g, 28 + lx, 50, 13, 3, '#2a2430');
    ball(g, 9 + lx, 24, 7, 7, STONE);
    if (!raise && !slam) ball(g, 7 + lx, 38, 6, 6, STONE);
    ball(g, 25 + lx, 30, 16, 14, STONE);
    for (const [a, b, c2] of [[18, 24, 9], [30, 34, 7], [22, 38, 6]]) for (let i = 0; i < c2; i++) px(g, a + lx + i, b + ((i * 3) % 4 === 0 ? 1 : 0), '#2e2836');
    ball(g, 25 + lx, 13, 9, 7, STONE); rect(g, 17 + lx, 11, 16, 2, '#2e2836');
    rect(g, 18 + lx, 13, 4, 2, '#ff9a30'); rect(g, 27 + lx, 13, 4, 2, '#ff9a30'); px(g, 19 + lx, 13, '#fff0a0'); px(g, 28 + lx, 13, '#fff0a0');
    rect(g, 22 + lx, 26, 6, 1, '#ffb040'); rect(g, 24 + lx, 24, 2, 5, '#ffb040'); px(g, 24 + lx, 26, '#fff0a0');
    for (const [x, y, r] of [[19, 7, 4], [8, 18, 3], [35, 20, 3], [14, 27, 2]]) { ell(g, x + lx, y, r, Math.max(1, r - 2), '#3e6a32'); ell(g, x + lx - 1, y - 1, Math.max(1, r - 2), 0, '#7aaa4a'); }
    if (raise) { ball(g, 43, 18, 7, 7, STONE); ball(g, 46, 6, 7, 6, STONE); }
    else if (slam) { ball(g, 44, 22, 7, 7, STONE); ball(g, 51, 34, 6, 7, STONE); rect(g, 47, 40, 7, 1, '#2a2430'); }
    else { ball(g, 41 + lx, 24, 7, 7, STONE); ball(g, 44 + lx, 38, 6, 6, STONE); }
    if (raise || slam) ball(g, 7 + lx, 38, 6, 6, STONE);
  });
}
function buildWisp(fr) {
  return sprite(30, 34, 15, 33, g => {
    const sway = [0, 1, 0, -1][fr];
    for (let i = 0; i < 6; i++) { const y = 26 + i, x = 15 + Math.round(Math.sin(i * 0.9 + fr * 1.57) * 3); ell(g, x, y, Math.max(1, 3 - (i >> 1)), 1, i < 3 ? '#2aa888' : '#1e6a5a'); }
    ell(g, 15, 17, 9, 10, '#1e6a5a'); ell(g, 14, 17, 8, 9, '#2aa888'); ell(g, 13, 16, 5, 6, '#6ae8b8'); ell(g, 12, 15, 2, 3, '#d8fff0');
    const tips = [[8, 9], [12, 4], [16, 2], [20, 6], [23, 11]];
    tips.forEach(([x, y], i) => { const xx = x + (i % 2 ? sway : -sway); for (let k = 0; k < 6; k++) ell(g, lerp(xx, 15, k / 6), lerp(y, 12, k / 6), 1 + (k >> 2), 1, k < 2 ? '#6ae8b8' : '#2aa888'); px(g, xx, y, '#d8fff0'); });
    rect(g, 10, 17, 2, 3, '#0a2420'); rect(g, 16, 17, 2, 3, '#0a2420'); px(g, 10, 17, '#ffffff'); px(g, 16, 17, '#ffffff');
    rect(g, 12, 22, 4, 1, '#0a2420'); px(g, 13, 23, '#0a2420');
  }, '#0a2420');
}
const SPR = {};
function initSprites() {
  for (const p of ['idle', 'attack', 'hurt']) SPR['rowan_' + p] = buildRowan(p);
  for (const p of ['idle', 'cast', 'hurt']) SPR['mira_' + p] = buildMira(p);
  for (const p of ['idle', 'raise', 'slam', 'hurt']) SPR['golem_' + p] = buildGolem(p);
  for (let f = 0; f < 4; f++) SPR['wisp_' + f] = buildWisp(f);
}

/* ----- background: torch-lit training cavern ----- */
let BG = null;
const TORCHES = [[34, 58], [222, 54]];
function buildBG() {
  const c = mk(W, FIELD_H), g = c.getContext('2d');
  const wall = ['#100c1a', '#151022', '#1a1428', '#20182e', '#261d35', '#2c223c'];
  for (let y = 0; y < 104; y++) for (let x = 0; x < W; x += 4) { const n = hash(x >> 2, y >> 3) * 6 - 3; rect(g, x, y, 4, 1, wall[clamp(Math.floor((y + n) / 104 * 6), 0, 5)]); }
  // rock blocks on the wall
  const R = rng(11);
  for (let i = 0; i < 46; i++) {
    const x = R() * W, y = 18 + R() * 82, rx = 6 + R() * 12, ry = 4 + R() * 6, k = clamp(Math.floor(y / 26), 0, 3);
    const tones = [['#120e1c', '#18122a', '#1e1830'], ['#171226', '#1e1830', '#272038'], ['#1c1630', '#251e3a', '#30283f'], ['#211a34', '#2c2440', '#3a3048']][k];
    ell(g, x, y, rx, ry, tones[0]); ell(g, x - 1, y - 1, rx - 1, ry - 1, tones[1]); ell(g, x - 2, y - ry * 0.5, rx * 0.6, 0, tones[2]);
  }
  // distant opening with a cold light shaft
  ell(g, 150, 44, 22, 18, '#0a0812'); ell(g, 150, 46, 18, 15, '#070610'); ell(g, 152, 40, 10, 8, '#141a30'); ell(g, 154, 37, 5, 4, '#26304e');
  g.globalAlpha = 0.07; for (let k = 0; k < 3; k++) { g.fillStyle = '#9ab8ff'; g.beginPath(); g.moveTo(140 + k * 4, 30); g.lineTo(162 - k * 3, 30); g.lineTo(190 - k * 6, 112); g.lineTo(150 + k * 6, 112); g.fill(); } g.globalAlpha = 1;
  // crystals
  const crystal = (x, y, s, C) => { for (let i = 0; i < 3; i++) { const h = s + i * 3 - (i === 2 ? 5 : 0), xx = x + (i - 1) * 4; for (let k = 0; k < h; k++) { const w = Math.max(0, Math.round(2 - Math.max(0, k - h + 3) * 0.7)); rect(g, xx - w, y - k, w * 2 + 1, 1, C[1]); px(g, xx - w, y - k, C[2]); if (w > 0) px(g, xx + w, y - k, C[0]); } px(g, xx, y - h, C[3]); } };
  crystal(92, 96, 9, ['#26407a', '#3a6ac8', '#7ab8ff', '#e0f4ff']); crystal(246, 92, 7, ['#4a2a7a', '#7a48c8', '#c098ff', '#f4e8ff']); crystal(8, 98, 6, ['#26407a', '#3a6ac8', '#7ab8ff', '#e0f4ff']);
  // weapon rack against the back wall
  rect(g, 176, 74, 34, 3, '#5a3a20'); rect(g, 176, 74, 34, 1, '#9a6a3a'); rect(g, 178, 74, 3, 30, '#4a2e18'); rect(g, 205, 74, 3, 30, '#4a2e18'); rect(g, 178, 74, 1, 30, '#7a5230');
  for (let i = 0; i < 4; i++) { const x = 184 + i * 6; rect(g, x, 62 + (i % 2) * 3, 1, 40, '#8a6a48'); rect(g, x - 1, 60 + (i % 2) * 3, 3, 4, '#c8d0e0'); px(g, x - 1, 60 + (i % 2) * 3, '#ffffff'); }
  // floor flagstones
  const rows = [4, 5, 6, 7, 8, 9, 9, 10]; let y = 100;
  rect(g, 0, 98, W, 3, '#0c0914');
  rows.forEach((rh, r) => {
    const tw = 16 + r * 4, off = hash(r, 3) * tw;
    for (let x = -off; x < W; x += tw) {
      const v = hash(Math.round(x), r + 7), lit = Math.max(0, 1 - Math.min(...TORCHES.map(t => Math.abs(x + tw / 2 - t[0]))) / 90) * 0.5 + (1 - Math.abs(x + tw / 2 - 128) / 160) * 0.5;
      const k = clamp(Math.floor(lit * 3 + v * 1.4 - (r > 5 ? 0.6 : 0)), 0, 3);
      const base = ['#2a2232', '#352b3e', '#40354a', '#4c3f56'][k], hi = ['#3a3044', '#463a52', '#54475e', '#62546c'][k];
      rect(g, x + 1, y + 1, tw - 2, rh - 1, base); rect(g, x + 1, y + 1, tw - 2, 1, hi); rect(g, x + 1, y + 1, 1, rh - 1, hi);
      rect(g, x, y, tw, 1, '#140f1c'); rect(g, x, y, 1, rh, '#140f1c');
      if (v > 0.72) { const cx = x + 3 + Math.round(v * (tw - 8)); px(g, cx, y + 2, '#1c1624'); px(g, cx + 1, y + 3, '#1c1624'); if (rh > 6) px(g, cx + 1, y + 4, '#1c1624'); }
      if (v < 0.15) { rect(g, x + 3, y + rh - 2, 4 + r, 1, '#3a5a34'); rect(g, x + 4, y + rh - 3, 2 + (r >> 1), 1, '#5a8a48'); }
    }
    y += rh;
  });
  // foreground rubble + hanging roots
  const rock = (x, y, rx, ry) => ball(g, x, y, rx, ry, ['#0c0912', '#1a1424', '#2a2236', '#4a3e58']);
  rock(4, 154, 12, 8); rock(20, 158, 9, 6); rock(250, 152, 14, 9); rock(232, 158, 8, 5); rock(128, 160, 10, 4);
  for (let i = 0; i < 9; i++) { const x = 4 + i * 29 + Math.round(hash(i, 5) * 12), h = 6 + Math.round(hash(i, 9) * 12); for (let k = 0; k < h; k++) { const w = Math.max(0, Math.round((1 - k / h) * 3)); rect(g, x - w, k, w * 2 + 1, 1, '#0c0914'); px(g, x - w, k, '#2a2036'); } }
  for (let i = 0; i < 5; i++) { const x = 6 + i * 5; for (let k = 0; k < 14 + i * 4; k++) px(g, x + Math.round(Math.sin(k * 0.4 + i) * 1.5), k, i % 2 ? '#2a3a22' : '#3a5030'); }
  // torch brackets
  for (const [tx, ty] of TORCHES) { rect(g, tx - 2, ty + 2, 5, 3, '#4a3a2a'); rect(g, tx - 1, ty + 5, 3, 6, '#3a2a1e'); rect(g, tx - 2, ty + 2, 5, 1, '#8a6a48'); rect(g, tx - 3, ty + 11, 7, 2, '#2a1e16'); }
  // vignette corners
  // ordered-dither vignette: three 6 px bands (solid, checker, sparse), no smooth alpha
  for (let y = 0; y < FIELD_H; y++) for (let x = 0; x < 18; x++) {
    const band = Math.floor(x / 6), on = band === 0 ? (x + y) % 4 !== 3 : band === 1 ? (x + y) % 2 === 0 : (x % 2 === 0 && y % 2 === 0);
    if (on) { px(g, x, y, '#05040a'); px(g, W - 1 - x, y, '#05040a'); }
  }
  return c;
}
// torch glow as ordered-dither pixels in three warm steps (two sizes for flicker), no smooth gradients
const GLOW = [];
function torchGlow(k) {
  if (GLOW[k]) return GLOW[k];
  const c = mk(95, 83), q = c.getContext('2d'), B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], R = 44 + k * 2;
  for (let y = 0; y < 83; y++) for (let x = 0; x < 95; x++) {
    const d = Math.hypot(x - 47, (y - 41) / 0.85) / R; if (d >= 1) continue;
    const v = (1 - d) * (1 - d), th = B[(y & 3) * 4 + (x & 3)] / 16;
    if (v * 0.9 > th) px(q, x, y, v > 0.5 ? '#6a3a18' : v > 0.22 ? '#4a2810' : '#2e180a');
  }
  return (GLOW[k] = c);
}
function drawBG(g, rt) {
  if (!BG) BG = buildBG();
  g.drawImage(BG, 0, 0);
  const f = Math.floor(rt / 90);
  g.globalCompositeOperation = 'lighter';
  for (const [i, [tx, ty]] of TORCHES.entries()) g.drawImage(torchGlow((f + i) % 3 === 0 ? 1 : 0), tx - 47, ty - 41);
  g.globalCompositeOperation = 'source-over';
  for (const [i, [tx, ty]] of TORCHES.entries()) {
    const k = (f + i) % 3;
    ell(g, tx, ty - 1, 3, 4 + (k === 1 ? 1 : 0), '#e8501e'); ell(g, tx + (k === 2 ? 1 : 0), ty - 2, 2, 3, '#ffa030'); ell(g, tx, ty - 1, 1, 2, '#fff0a0'); px(g, tx + (k - 1), ty - 7 - k, '#ffa030');
  }
  for (let i = 0; i < 14; i++) { const t = rt / 1000, x = (hash(i, 1) * W + t * (3 + i % 4)) % W, y = 20 + ((hash(i, 2) * 80 - t * (2 + i % 3) * 2) % 80 + 80) % 80; px(g, x, y, i % 3 ? '#5a4a6a' : '#8a7aa0'); }
}
function shadow(g, x, y, rx) { g.globalAlpha = 0.45; ell(g, x, y, rx, Math.max(1, Math.round(rx / 4)), '#05040a'); g.globalAlpha = 1; }

/* ----- actors ----- */
function makeActors() {
  return [
    { id: 'golem', name: 'STONE GOLEM', side: 'foe', hx: 54, hy: 140, hp: 2400, max: 2400, top: 46, half: 22 },
    { id: 'wisp', name: 'BOG WISP', side: 'foe', hx: 112, hy: 120, hp: 1600, max: 1600, top: 34, half: 10, hover: 10 },
    { id: 'rowan', name: 'ROWAN', side: 'hero', hx: 194, hy: 126, hp: 420, max: 420, top: 32, half: 8 },
    { id: 'mira', name: 'MIRA', side: 'hero', hx: 218, hy: 146, hp: 260, max: 260, mp: 80, maxMp: 80, top: 36, half: 8 }
  ].map(a => Object.assign(a, { x: a.hx, y: a.hy, pose: 'idle', hurtT: -1e9, shown: a.hp, ghost: a.hp, dead: false }));
}
function actorSprite(a, wt) {
  if (a.id === 'wisp') return SPR['wisp_' + (Math.floor(wt / 140) % 4)];
  return SPR[a.id + '_' + a.pose] || SPR[a.id + '_idle'];
}
// screen box of an actor at rest (for anchors and collision)
function actorBox(a) { const lift = a.hover || 0; return { x: a.x - a.half - 2, y: a.y - lift - a.top, w: a.half * 2 + 4, h: a.top, cx: a.x, top: a.y - lift - a.top }; }
function drawActor(g, a, wt, rt) {
  if (a.dead && wt - a.deadT > 600) return;
  const bob = a.id === 'wisp' ? Math.round(Math.sin(wt / 260) * 2) : (Math.floor((wt + a.hx * 7) / 420) % 2), lift = (a.hover || 0) + (a.id === 'wisp' ? bob : 0);
  shadow(g, a.x, a.y, a.id === 'golem' ? 20 : a.id === 'wisp' ? 8 : 9);
  if (a.id === 'wisp') { g.globalCompositeOperation = 'lighter'; for (const [r, al] of [[16, 0.06], [11, 0.08]]) { g.globalAlpha = al; ell(g, a.x, a.y - lift - 16, r, r, '#4affc0'); } g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
  const hurtAge = wt - a.hurtT, hit = hurtAge >= 0 && hurtAge < 220 && Math.floor(rt / 50) % 2 === 0;
  const kx = hurtAge >= 0 && hurtAge < 140 ? (a.side === 'foe' ? -2 : 2) : 0;
  const s = actorSprite(a, wt), alpha = a.dead ? clamp(1 - (wt - a.deadT) / 600, 0, 1) : 1;
  drawSpr(g, s, a.x + kx, a.y - lift - (a.id === 'wisp' ? 0 : bob === 1 && a.pose === 'idle' ? 1 : 0), { hit, alpha });
}

/* ----- effects (pure functions of age; deterministic) ----- */
function fxParticles(seed, n, spread, speed) { const R = rng(seed), P = []; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (R() - 0.5) * spread; const v = speed * (0.5 + R() * 0.7); P.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 260 + R() * 220, c: (R() * 3) | 0 }); } return P; }
function drawFx(g, fx, wt) {
  const age = wt - fx.t0; if (age < 0) return true;
  const { x, y } = fx;
  if (fx.kind === 'slash') {
    if (age > 220) return false;
    const q = Math.min(1, age / 90), fade = age > 120 ? 1 - (age - 120) / 100 : 1, dir = fx.dir || 1;
    for (let k = 0; k < 3; k++) { g.globalAlpha = fade * (1 - k * 0.28); const r = 14 - k * 3; for (let i = 0; i <= 18 * q; i++) { const t = -1.1 + i / 18 * 2.2; px(g, x + Math.cos(t) * r * dir * -1 + (fx.off || 0), y + Math.sin(t) * r, ['#ffffff', '#c8e0ff', '#6a8ac8'][k]); px(g, x + Math.cos(t) * (r - 1) * -dir + (fx.off || 0), y + Math.sin(t) * (r - 1), ['#ffffff', '#c8e0ff', '#6a8ac8'][k]); } }
    g.globalAlpha = 1; return true;
  }
  if (fx.kind === 'sparks') {
    if (age > 500) return false;
    const C = fx.cols || ['#ffffff', '#fff2a8', '#ffb050'];
    for (const p of fx.P) { if (age > p.life) continue; const t = age / 1000, X = x + p.vx * t * 60, Y = y + p.vy * t * 60 + 90 * t * t * 1.5; px(g, X, Y, C[Math.min(2, p.c + (age > p.life * 0.6 ? 1 : 0))]); if (age < p.life * 0.4) px(g, X - p.vx * 0.6, Y - p.vy * 0.6, C[2]); }
    return true;
  }
  if (fx.kind === 'bolt') {
    if (age > 260) return false;
    if (Math.floor(age / 33) % 3 === 2) return true;
    const R = rng(fx.seed + Math.floor(age / 66)); let px0 = x + (R() - 0.5) * 10, py0 = 0;
    for (let s = 0; s < 7; s++) {
      const nx = s === 6 ? x : x + (R() - 0.5) * 16, ny = s === 6 ? y : (y / 7) * (s + 1);
      const n = Math.ceil(Math.max(Math.abs(nx - px0), Math.abs(ny - py0)));
      for (let i = 0; i <= n; i++) { const X = lerp(px0, nx, i / n), Y = lerp(py0, ny, i / n); rect(g, X - 1, Y, 3, 1, '#3a8af0'); px(g, X, Y, '#e8f8ff'); }
      px0 = nx; py0 = ny;
    }
    g.globalAlpha = 0.5; ell(g, x, y, 9, 6, '#9ae8ff'); g.globalAlpha = 1; ell(g, x, y, 4, 3, '#ffffff');
    return true;
  }
  if (fx.kind === 'mend' || fx.kind === 'hex') {
    if (age > 700) return false;
    const C = fx.kind === 'mend' ? ['#1a6a4a', '#3ac070', '#9cffb8', '#ffffff'] : ['#3a1a5a', '#8a48c8', '#d0a0ff', '#ffffff'];
    const rr = Math.round(6 + easeOut(Math.min(1, age / 300)) * 10); g.globalAlpha = clamp(1 - age / 700, 0, 1);
    for (let i = 0; i < 40; i++) { const t = i / 40 * Math.PI * 2; px(g, x + Math.cos(t) * rr, fx.fy + Math.sin(t) * rr * 0.35, C[2]); }
    g.globalAlpha = 1;
    for (let i = 0; i < 12; i++) { const life = age / 700 * 1.4 - hash(i, fx.seed) * 0.4; if (life <= 0 || life >= 1) continue; const X = x + (hash(i, fx.seed + 1) - 0.5) * 22, Y = fx.fy - life * 34, k = life < 0.3 ? 3 : life < 0.6 ? 2 : 1; px(g, X, Y, C[k]); if (i % 3 === 0) { px(g, X - 1, Y, C[k - 1]); px(g, X + 1, Y, C[k - 1]); px(g, X, Y - 1, C[k - 1]); px(g, X, Y + 1, C[k - 1]); } }
    return true;
  }
  if (fx.kind === 'charge') {
    if (age > fx.dur) return false;
    const C = fx.cols || ['#1a5a8a', '#3aa8e0', '#9ae8ff', '#ffffff'];
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.18 + 0.1 * (Math.floor(age / 66) % 2); ell(g, x, y, 7, 7, C[1]); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 8; i++) { const t = ((age / 400 + i / 8) % 1), a = i / 8 * Math.PI * 2 + age / 300, r = 12 * (1 - t); px(g, x + Math.cos(a) * r, y + Math.sin(a) * r, C[t > 0.6 ? 3 : 2]); }
    return true;
  }
  if (fx.kind === 'dust') {
    if (age > 500) return false;
    const q = age / 500;
    for (let i = 0; i < 6; i++) { const d = (i % 2 ? 1 : -1) * (4 + i * 3) * easeOut(q), r = Math.max(1, Math.round(3 - q * 2 + (i % 3))); g.globalAlpha = 0.8 * (1 - q); ell(g, x + d, y - 2 - q * 4 - (i % 3), r, Math.max(1, r - 1), i % 2 ? '#8a7a96' : '#b8a8c0'); }
    g.globalAlpha = 1; return true;
  }
  if (fx.kind === 'drain') {
    if (age > 520) return false;
    for (let i = 0; i < 7; i++) { const t = clamp((age - i * 40) / 360, 0, 1); if (t <= 0 || t >= 1) continue; const X = lerp(x, fx.tx, t), Y = lerp(y, fx.ty, t) - Math.sin(t * Math.PI) * 14; ell(g, X, Y, 1, 1, '#3aa8e0'); px(g, X, Y, '#e0f8ff'); }
    return true;
  }
  return false;
}

/* ----- HUD ----- */
function drawHUD(g, actors, opt) {
  opt = opt || {};
  drawWin(g, 2, 158, 98, 64); drawWin(g, 102, 158, 152, 64);
  const foes = actors.filter(a => a.side === 'foe'), heroes = actors.filter(a => a.side === 'hero');
  foes.forEach((a, i) => {
    const y = 167 + i * 26, col = a.dead ? '#6a6a88' : '#ffffff';
    if (opt.cursor === a.id) drawHand(g, 17, y + 3);
    drawText(g, a.name, 19, y, col);
    drawGauge(g, 19, y + 10, 72, 4, a.shown / a.max, 'foe', a.ghost / a.max);
  });
  heroes.forEach((a, i) => {
    const y = 166 + i * 27, low = a.shown / a.max < 0.25, col = a.dead ? '#a05060' : opt.active === a.id ? '#fff0a0' : '#ffffff';
    if (opt.active === a.id) { g.globalAlpha = 0.25; rect(g, 106, y - 3, 144, 25, '#5a6ad0'); g.globalAlpha = 1; }
    drawText(g, a.name, 112, y, col);
    drawText(g, 'HP', 160, y, '#9ab0e0');
    const hpS = Math.round(a.shown) + '/' + a.max; drawText(g, hpS, 244 - textW(hpS), y, low ? '#ffc444' : '#ffffff');
    drawGauge(g, 112, y + 10, 132, 5, a.shown / a.max, low ? 'low' : 'hp', a.ghost / a.max);
    if (a.maxMp) { drawText(g, 'MP', 112, y + 17, '#9ab0e0'); drawGauge(g, 126, y + 18, 50, 4, a.mp / a.maxMp, 'mp'); const ms = String(Math.round(a.mp)); drawText(g, ms, 182, y + 17, '#c8eeff'); }
  });
}
// smooth HP readouts: shown follows hp; ghost (white) lags then drains
function tickBars(actors, dt) {
  for (const a of actors) {
    const d = a.hp - a.shown; a.shown += Math.sign(d) * Math.min(Math.abs(d), Math.max(1, Math.abs(d) * 0.18) * dt / FRAME);
    if (a.ghost < a.shown) a.ghost = a.shown; else if (a.ghost > a.shown) { a.ghostWait = (a.ghostWait || 0) - dt; if (a.ghostWait <= 0) a.ghost = Math.max(a.shown, a.ghost - a.max * 0.012 * dt / FRAME); }
  }
}
