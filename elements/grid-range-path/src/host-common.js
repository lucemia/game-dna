// ===== shared: map, terrain, procedural 16-bit tile art, unit sprites, pixel font, windows =====
const TS = 16, MW = 22, MH = 16;
// . plain  , meadow  F forest  H hill  M peak  ~ river  s ford  = bridge  R road  W ruined wall  r ruins floor  T fort
const MAP = [
  'MMMH..FF..~~...HHMMMMM',
  'MMH..FFF..~~....HHMMMM',
  'MH...FF..~~..F...HHMMM',
  'H.,....F.~~.FF....HHMM',
  '..,..,...~~..F.....HHM',
  '.FF.......~~.......,.H',
  'FFF.......~~..,.......',
  'FF..RRRRRR==RRRRR.....',
  'F...R.....~~....R.....',
  '..,.R....~~.....RWWrWW',
  '.FF.R...~~....,.rrrrrW',
  'FFF.R...ss.....Wr.TrrW',
  'FF..R...~~.....WrrrrrW',
  'F..HR..~~..FF..WWrWWrW',
  '.HHH..~~..FFF.......,.',
  'HHMH..~~.FFF..H.....FF'
];
const TER = {
  '.': { n: 'PLAIN', cost: 1, def: 0, avo: 0 },
  ',': { n: 'MEADOW', cost: 1, def: 0, avo: 5 },
  F: { n: 'FOREST', cost: 2, def: 1, avo: 20 },
  H: { n: 'HILL', cost: 3, def: 2, avo: 30 },
  M: { n: 'PEAK', cost: 99, def: 0, avo: 0 },
  '~': { n: 'RIVER', cost: 99, def: 0, avo: 0 },
  s: { n: 'FORD', cost: 3, def: 0, avo: -10 },
  '=': { n: 'BRIDGE', cost: 1, def: 0, avo: 0 },
  R: { n: 'ROAD', cost: 1, def: 0, avo: 0 },
  W: { n: 'WALL', cost: 99, def: 0, avo: 0 },
  r: { n: 'RUINS', cost: 1, def: 1, avo: 10 },
  T: { n: 'FORT', cost: 1, def: 2, avo: 20 }
};
const inMap = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
const at = (x, y) => MAP[Math.max(0, Math.min(MH - 1, y))][Math.max(0, Math.min(MW - 1, x))];
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

// ---- noise ----
const hh = (x, y, s) => { let n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; };
function vn(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hh(xi, yi, s), b = hh(xi + 1, yi, s), c = hh(xi, yi + 1, s), d = hh(xi + 1, yi + 1, s);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
const fbm = (x, y, s) => vn(x, y, s) * 0.6 + vn(x * 2.3, y * 2.3, s + 9) * 0.3 + vn(x * 5.1, y * 5.1, s + 17) * 0.1;
// smooth tile mask: 1 at tile centres that pass test, bilinear+smoothstep between -> rounded autotiled edges
function maskAt(test, px, py) {
  const fx = px / TS - 0.5, fy = py / TS - 0.5, ix = Math.floor(fx), iy = Math.floor(fy);
  let u = fx - ix, v = fy - iy; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  const m = (x, y) => test(at(x, y)) ? 1 : 0;
  const a = m(ix, iy), b = m(ix + 1, iy), c = m(ix, iy + 1), d = m(ix + 1, iy + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
const isWater = c => c === '~' || c === 's' || c === '=';
const isRoad = c => c === 'R' || c === '=';
const isWood = c => c === 'F', isHill = c => c === 'H', isPeak = c => c === 'M';
const isFort = c => c === 'W' || c === 'r' || c === 'T';

const GRASS = ['#24502c', '#346c30', '#4c8c38', '#6aa844', '#92c858'];
const WOODF = ['#163220', '#1f4426', '#2a5a2c', '#3c7232'];
const HILLC = ['#2a4220', '#3e5e28', '#5a7e30', '#7c9e3c', '#a6c056'];
const ROCK = ['#2e2836', '#4c4250', '#6e6264', '#968876', '#c2b498'];
const DIRT = ['#5e4026', '#80593a', '#a27848', '#c49a5e', '#e2c27e'];
const WATER = ['#122868', '#1a3e90', '#2658b8', '#3a80d4', '#66aee8', '#b8e2ff'];
const SAND = ['#5c4c34', '#7c6844', '#a08a5c'];
const STONE = ['#2c2834', '#4a4454', '#6c6476', '#908898', '#b8b0bc', '#ddd6de'];

const hillH = (x, y) => Math.pow(maskAt(isHill, x, y), 1.4) * (0.55 + 0.45 * vn(x / 10, y / 9, 61));
const rockH = (x, y) => { const m = maskAt(isPeak, x, y), r1 = 1 - Math.abs(2 * vn(x / 11, y / 9, 401) - 1), r2 = 1 - Math.abs(2 * vn(x / 4.5, y / 4, 403) - 1); return Math.pow(m, 1.3) * (0.25 + 0.5 * r1 + 0.25 * r2); };

let BASE = null;
function baseLayer() {
  if (BASE) return BASE;
  const Wp = MW * TS, Hp = MH * TS, c = mk(Wp, Hp), g = c.getContext('2d'), img = g.createImageData(Wp, Hp), D = img.data;
  const put = (x, y, h) => { const n = parseInt(h.slice(1), 16), i = (y * Wp + x) * 4; D[i] = n >> 16; D[i + 1] = (n >> 8) & 255; D[i + 2] = n & 255; D[i + 3] = 255; };
  for (let y = 0; y < Hp; y++) for (let x = 0; x < Wp; x++) {
    const jit = (fbm(x / 5, y / 5, 3) - 0.5) * 0.22, big = fbm(x / 44, y / 44, 1), fine = vn(x / 3.2, y / 2.2, 7);
    let gi = big > 0.56 ? 3 : big < 0.4 ? 1 : 2; if (fine > 0.8) gi++; else if (fine < 0.16) gi--;
    let col = GRASS[Math.max(0, Math.min(4, gi))];
    if (maskAt(isWood, x, y) > 0.42 + jit) col = vn(x / 2, y / 2, 11) > 0.8 ? '#4a3c22' : WOODF[big > 0.5 ? 2 : 1];
    if (maskAt(isHill, x, y) > 0.45 + jit) col = big > 0.5 ? HILLC[1] : '#4a6a2c';
    const rm = maskAt(isPeak, x, y);
    if (rm > 0.4 + jit) {
      const sh = (rockH(x - 1, y - 1) - rockH(x + 1, y + 1)) * 9 + (rockH(x, y) - 0.45) * 0.9;
      const ri = sh > 0.55 ? 4 : sh > 0.18 ? 3 : sh > -0.15 ? 2 : sh > -0.5 ? 1 : 0;
      col = ROCK[ri];
      if (rm < 0.52 + jit) col = ri >= 3 ? '#5a7238' : '#3a502c';
      if (rockH(x, y) > 0.78) col = ri >= 3 ? '#f4f8ff' : ri >= 2 ? '#c8d4ee' : '#8890b4';
    }
    const rd = maskAt(isRoad, x, y);
    if (rd > 0.6 + jit * 0.5) {
      const e = rd - (0.6 + jit * 0.5); let di = e < 0.05 ? 1 : big > 0.5 ? 3 : 2;
      if (e >= 0.05 && vn(x / 1.6, y / 1.6, 21) > 0.86) di = 4; if (e >= 0.05 && vn(x / 1.7, y / 1.7, 23) < 0.1) di = 1;
      col = DIRT[di];
    }
    const w = maskAt(isWater, x, y), th = 0.5 + jit * 0.35;
    if (w > th - 0.1 && w <= th) col = w > th - 0.04 ? SAND[0] : SAND[1 + (fine > 0.5 ? 1 : 0)];
    if (w > th) {
      const d = (w - th) / (1 - th), fm = maskAt(q => q === 's', x, y), fth = 0.5 + (fbm(x / 4, y / 4, 51) - 0.5) * 0.55, fe = fm - fth, ford = fe > 0;
      let wi = d < 0.08 ? 4 : d < 0.3 ? 3 : d < 0.62 ? 2 : 1;
      if (ford) wi = d < 0.08 ? 5 : 4; else if (fe > -0.09 && fm > 0.05) wi = Math.max(wi, 3);
      if (!ford && d > 0.3 && vn(x / 2.5, y / 9, 31) > 0.78) wi++;
      if (!ford && d > 0.7 && vn(x / 3, y / 6, 33) < 0.2) wi = 0;
      col = WATER[Math.min(5, wi)];
      if (ford && vn(x / 2.6, y / 2.6, 41) > 0.8) col = vn(x / 2.6, y / 2.6 - 0.35, 41) > 0.8 ? '#a8a49c' : '#5a5a6c';
      if (d < 0.05 && vn(x / 1.5, y / 1.5, 57) > 0.3) col = '#e8f6ff';
      if (fm > 0.05 && Math.abs(fe) < 0.05 && vn(x / 1.5, y / 1.5, 57) > 0.32) col = fe > 0 ? '#f4fbff' : '#d0ecff';
    }
    if (isFort(at(x / TS | 0, y / TS | 0))) col = '#000000';
    put(x, y, col);
  }
  g.putImageData(img, 0, 0);
  const px = (x, y, k) => { g.fillStyle = k; g.fillRect(x, y, 1, 1); };
  // tufts, flowers, pebbles on open ground
  for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
    const c0 = at(tx, ty); if (c0 !== '.' && c0 !== ',') continue;
    for (let i = 0; i < (c0 === ',' ? 6 : 3); i++) {
      const x = tx * TS + 2 + Math.floor(hh(tx, ty, i * 3) * 12), y = ty * TS + 2 + Math.floor(hh(tx, ty, i * 3 + 1) * 12), k = hh(tx, ty, i * 3 + 2);
      if (maskAt(isWater, x, y) > 0.3 || maskAt(isRoad, x, y) > 0.45) continue;
      if (c0 === ',' && k < 0.7) { const fc = ['#ffe868', '#ff9cc8', '#ffffff'][i % 3]; px(x, y, fc); px(x + 1, y + 1, '#24502c'); px(x - 1, y, mix(fc, '#4c8c38', 0.5)); }
      else if (k < 0.6) { px(x, y, GRASS[4]); px(x + 2, y, GRASS[4]); px(x + 1, y + 1, GRASS[3]); px(x + 1, y + 2, GRASS[1]); px(x, y + 1, GRASS[1]); }
      else { px(x, y, '#b0aca8'); px(x + 1, y, '#8a8690'); px(x, y + 1, '#5a5664'); px(x + 1, y + 1, '#34323e'); }
    }
  }
  drawFort(g, px); drawBridge(g, px); drawHills(g, px); drawTrees(g, px);
  BASE = c; return c;
}
function drawHills(g, px) {
  const ms = [];
  for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) if (at(tx, ty) === 'H')
    for (let i = 0; i < 2; i++) ms.push({ x: tx * TS + 4 + Math.floor(hh(tx, ty, 200 + i) * 8), y: ty * TS + 6 + i * 5 + Math.floor(hh(tx, ty, 210 + i) * 3), rx: 7 + Math.floor(hh(tx, ty, 220 + i) * 3) - i * 2, ry: 5 + Math.floor(hh(tx, ty, 230 + i) * 2) - i });
  ms.sort((a, b) => a.y - b.y);
  ms.forEach(m => {
    g.fillStyle = 'rgba(16,28,10,0.4)'; for (let xx = -m.rx + 1; xx <= m.rx; xx++) g.fillRect(m.x + xx + 1, m.y + m.ry - 1 + Math.round(Math.abs(xx) / m.rx), 1, 2);
    for (let yy = -m.ry - 1; yy <= m.ry; yy++) for (let xx = -m.rx - 1; xx <= m.rx + 1; xx++) {
      const nx = xx / m.rx, ny = (yy + 0.5) / m.ry, r = nx * nx + ny * ny; if (r > 1.05) continue;
      if (ny > 0.15 && r > 0.98) continue;
      if (r > 0.8 && ny <= 0.15) { px(m.x + xx, m.y + yy, HILLC[0]); continue; }
      const z = Math.sqrt(Math.max(0, 1 - Math.min(1, r))), l = -0.75 * nx - 0.85 * ny + 0.25 * z + (vn((m.x + xx) / 1.5, (m.y + yy) / 1.5, 235) - 0.5) * 0.25;
      px(m.x + xx, m.y + yy, HILLC[l > 0.6 ? 4 : l > 0.22 ? 3 : l > -0.15 ? 2 : l > -0.55 ? 1 : 0]);
      if (ny > 0.55 && r > 0.6) px(m.x + xx, m.y + yy, HILLC[0]);
    }
  });
}
function drawTrees(g, px) {
  const trees = [];
  for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) if (at(tx, ty) === 'F')
    for (let i = 0; i < 3; i++) trees.push({ x: tx * TS + 3 + Math.floor(hh(tx, ty, 70 + i) * 10), y: ty * TS + 5 + Math.floor(hh(tx, ty, 80 + i) * 9), r: 4 + Math.floor(hh(tx, ty, 90 + i) * 2.5), s: hh(tx, ty, 95 + i) });
  trees.sort((a, b) => a.y - b.y);
  const C = ['#0e2416', '#1a3c20', '#28582a', '#3a7832', '#5a9a3e', '#8cc458'];
  trees.forEach(T => {
    g.fillStyle = 'rgba(8,20,12,0.45)'; for (let yy = -1; yy <= 1; yy++) g.fillRect(T.x - T.r + 1 + Math.abs(yy), T.y + 3 + yy, T.r * 2 - Math.abs(yy) * 2, 1);
    px(T.x, T.y + 2, '#3a2414'); px(T.x, T.y + 1, '#5c3a1e'); px(T.x + 1, T.y + 2, '#2a180c');
    const cy = T.y - T.r + 1;
    for (let yy = -T.r - 1; yy <= T.r + 1; yy++) for (let xx = -T.r - 1; xx <= T.r + 1; xx++) {
      const d = Math.sqrt(xx * xx + yy * yy * 1.15) + (vn((T.x + xx) / 1.6, (cy + yy) / 1.6, 77) - 0.5) * 1.6;
      if (d > T.r + 0.6) continue;
      if (d > T.r - 0.4) { px(T.x + xx, cy + yy, C[0]); continue; }
      const l = (-xx - yy) / T.r * 0.9 + (vn((T.x + xx) / 1.4, (cy + yy) / 1.4, 79) - 0.5) * 0.9;
      px(T.x + xx, cy + yy, C[l > 0.75 ? 5 : l > 0.3 ? 4 : l > -0.2 ? 3 : l > -0.7 ? 2 : 1]);
    }
  });
}
function drawFort(g, px) {
  for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
    const c0 = at(tx, ty); if (!isFort(c0)) continue;
    const X = tx * TS, Y = ty * TS;
    // flagstone floor everywhere first
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const row = (y >> 3), sx = (x + (row % 2) * 4) >> 3, id = hh(tx * 4 + sx, ty * 4 + row, 5);
      const edge = (y % 8 === 0) || ((x + (row % 2) * 4) % 8 === 0);
      let k = edge ? STONE[1] : STONE[id > 0.66 ? 3 : 2];
      if (!edge && (y % 8 === 1 || (x + (row % 2) * 4) % 8 === 1)) k = STONE[id > 0.66 ? 4 : 3];
      if (!edge && vn((X + x) / 3, (Y + y) / 3, 9) > 0.8) k = '#5c7a3c';
      px(X + x, Y + y, k);
    }
    if (c0 === 'T') {   // raised dais with a carved ring
      g.fillStyle = STONE[0]; g.fillRect(X + 1, Y + 2, 14, 13); g.fillStyle = STONE[4]; g.fillRect(X + 2, Y + 2, 12, 11); g.fillStyle = STONE[3]; g.fillRect(X + 3, Y + 3, 11, 10);
      g.fillStyle = STONE[2]; g.fillRect(X + 2, Y + 13, 12, 2);
      for (let a = 0; a < 24; a++) { const q = a / 24 * Math.PI * 2; px(X + 8 + Math.round(Math.cos(q) * 3.6), Y + 8 + Math.round(Math.sin(q) * 3.2), a % 6 ? '#e6c870' : '#fff0b0'); }
    }
    if (c0 === 'r' && hh(tx, ty, 3) > 0.5) { const x = X + 3 + Math.floor(hh(tx, ty, 4) * 9), y = Y + 4 + Math.floor(hh(tx, ty, 6) * 8); [[0, 0, 4], [1, 0, 3], [0, 1, 2], [1, 1, 1], [2, 1, 2], [2, 0, 4]].forEach(([a, b, s]) => px(x + a, y + b, STONE[s])); px(x + 1, y + 2, STONE[0]); px(x + 2, y + 2, STONE[0]); }
    if (c0 !== 'W') continue;
    const below = at(tx, ty + 1) === 'W' && ty + 1 < MH, above = at(tx, ty - 1) === 'W' && ty > 0, left = at(tx - 1, ty) === 'W', right = at(tx + 1, ty) === 'W';
    const topH = below ? 16 : 10;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let k;
      if (y < topH) {
        const bx = (x + ((y >> 2) % 2) * 3) % 6; k = (y % 4 === 3 || bx === 5) ? STONE[2] : STONE[hh(tx * 7 + ((x + ((y >> 2) % 2) * 3) / 6 | 0), ty * 9 + (y >> 2), 12) > 0.5 ? 4 : 3];
        if (!above && y === 0) k = STONE[5]; if (!left && x === 0) k = STONE[1]; if (!right && x === 15) k = STONE[1];
        if (vn((X + x) / 2.2, (Y + y) / 2.2, 14) > 0.82) k = y < 4 ? '#7a9a48' : '#56743a';
      } else { const bx = (x + ((y >> 1) % 2) * 2) % 5; k = (y % 3 === 0 || bx === 4) ? STONE[0] : STONE[y > 13 ? 1 : 2]; if (y === topH) k = STONE[0]; }
      // broken crenel: carve the top corners of some wall tiles down to floor
      if (!above && hh(tx, ty, 21) > 0.45 && y < 4 && (x < 4 - y || x > 11 + y)) continue;
      px(X + x, Y + y, k);
    }
    if (!below && ty + 1 < MH) { g.fillStyle = 'rgba(10,8,20,0.42)'; g.fillRect(X, Y + 16, 16, 2); }
  }
}
function drawBridge(g, px) {
  for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
    if (at(tx, ty) !== '=') continue;
    const X = tx * TS, Y = ty * TS;
    g.fillStyle = 'rgba(8,16,48,0.55)'; g.fillRect(X, Y + 15, 16, 3);
    for (let x = 0; x < 16; x++) for (let y = 2; y < 15; y++) { const pl = x % 4; px(X + x, Y + y, pl === 3 ? '#4a2c16' : pl === 0 ? '#c49058' : (hh(tx * 4 + (x >> 2), y, 31) > 0.85 ? '#7a4e28' : '#a87442')); }
    for (let x = 0; x < 16; x++) { px(X + x, Y + 1, '#e2b878'); px(X + x, Y + 2, '#5c3418'); px(X + x, Y + 13, '#e2b878'); px(X + x, Y + 14, '#5c3418'); }
    [2, 9].forEach(p => { [0, 12].forEach(yo => { g.fillStyle = '#3a200e'; g.fillRect(X + p - 1, Y + yo - 1, 4, 4); g.fillStyle = '#d6a466'; g.fillRect(X + p, Y + yo, 2, 2); }); });
  }
}
// animated layer: water flow streaks and glints, fort banner
function drawAnim(g, cam, t, W, H) {
  const px = (x, y, k) => { g.fillStyle = k; g.fillRect(x, y, 1, 1); };
  const x0 = Math.max(0, Math.floor(cam.x / TS)), x1 = Math.min(MW - 1, Math.ceil((cam.x + W) / TS)), y0 = Math.max(0, Math.floor(cam.y / TS)), y1 = Math.min(MH - 1, Math.ceil((cam.y + H) / TS));
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const c0 = at(tx, ty); if (c0 !== '~' && c0 !== 's') continue;
    for (let i = 0; i < 2; i++) {
      const sx = tx * TS + 3 + Math.floor(hh(tx, ty, 120 + i) * 10), yy = (t * (9 + hh(tx, ty, 140 + i) * 5) + hh(tx, ty, 130 + i) * TS) % TS, sy = ty * TS + Math.floor(yy);
      if (maskAt(isWater, sx, sy) < 0.7) continue;
      const X = sx - cam.x, Y = sy - cam.y;
      if (c0 === 's') { px(X, Y, '#ffffff'); px(X + 1, Y, '#b8e2ff'); continue; }
      px(X, Y, '#b8e2ff'); px(X, Y + 1, '#66aee8'); px(X, Y - 1, '#3a80d4');
    }
    if (Math.floor(t * 2 + hh(tx, ty, 150) * 7) % 7 === 0 && c0 === '~') { const X = tx * TS + 4 + Math.floor(hh(tx, ty, 151) * 8) - cam.x, Y = ty * TS + 5 + Math.floor(hh(tx, ty, 152) * 6) - cam.y; if (maskAt(isWater, X + cam.x, Y + cam.y) > 0.7) { px(X, Y, '#ffffff'); px(X - 1, Y, '#b8e2ff'); px(X + 1, Y, '#b8e2ff'); } }
  }
  // tattered banner on the fort's north wall
  const fx = 18 * TS + 6 - cam.x, fy = 9 * TS - 9 - cam.y, fr = Math.floor(t * 6) % 4;
  g.fillStyle = '#2a1a10'; g.fillRect(fx, fy, 1, 14); px(fx, fy - 1, '#ffd858');
  for (let y = 0; y < 6; y++) for (let x = 0; x < 7 - (y === 5 ? 2 : 0); x++) px(fx + 1 + x, fy + y + ((fr + x) % 4 === 0 && x > 2 ? 1 : 0), y === 0 ? '#ff9c7c' : y > 3 ? '#701820' : '#c83a30');
}

// ---- unit sprites (hand-authored templates, palette swapped per unit; outline added automatically) ----
const TPL = {
  sword: [
    '.....hhhh.....',
    '...hhjjjjhh...',
    '..hjjhhhhhhH..',
    '..hjhhhhhhHH.l',
    '..hhsssssHHH.l',
    '..hsessesSHH.l',
    '...sssssSSH..l',
    '...2SsssS2...l',
    '..234444432.ml',
    '.2s3444433sGgG',
    '.2s34443332.b.',
    '.2.3gGGgG32...',
    '.2.33333332...',
    '..2333.3332...',
    '...bbB.bbB....',
    '...bbB.bbB....',
    '..BBBB.BBBB...'],
  heavy: [
    '....aaaaa.....',
    '...aaAAAAc..l.',
    '..aAAAAAAAc.lm',
    '..AsssssssA.mM',
    '..AseSsesSA..k',
    '..cSssssSSc..k',
    '..2444443322.k',
    '.4l3444433l2sk',
    '.43l44443322sk',
    '.32.l44332.1.k',
    '..23gGGgG32..k',
    '...3333322...k',
    '...mmM.mmM....',
    '...mmM.mmM....',
    '..lmmM.lmmM...',
    '..MMMM.MMMM...'],
  robe: [
    '..p..hhhh.....',
    '.pwp.hjjjhh...',
    '..k.hjhhhhhH..',
    '..k.hhssssHH..',
    '..k.hseseSHH..',
    '..k.hsssSSHh..',
    '..ks4wSSw4Hh..',
    '..k34wwww43...',
    '..k344ww443...',
    '..k3444w4432..',
    '..k34444w432..',
    '..k344444w32..',
    '..k3444444322.',
    '..k34444443322',
    '...2222222222.',
    '....bB...bB...']
};
const BASEPAL = { s: '#f8c8a0', S: '#c8845c', e: '#2a1428', l: '#f0f6ff', m: '#a8b4d0', M: '#58607e', b: '#a86c38', B: '#5c3418', g: '#ffd858', G: '#b87a1c', w: '#f4f4ff', v: '#a8b0d8', k: '#8a5a30', p: '#7af0ff', h: '#8a4a24', j: '#c07a3a', H: '#4e2414', a: '#d8dee8', A: '#9aa4bc', c: '#56607a' };
const TEAMPAL = { a: { 1: '#14205a', 2: '#2848b0', 3: '#4078e8', 4: '#9cc8ff' }, b: { 1: '#4a0c16', 2: '#982028', 3: '#d84430', 4: '#ffa078' } };
const LOOKS = {
  Rowan: { tpl: 'sword', pal: {} },
  Mira: { tpl: 'robe', pal: { h: '#e0a040', j: '#ffe08a', H: '#9a5a1c' } },
  Bram: { tpl: 'heavy', pal: {} },
  Brigand: { tpl: 'heavy', pal: { a: '#a83a2a', A: '#6e2018', c: '#3e0c0c', s: '#d8986a', S: '#9a5c38', l: '#d0d4dc', m: '#8a8e9c', M: '#4a4c5a' } },
  Hexer: { tpl: 'robe', pal: { h: '#3a1a40', j: '#6a3870', H: '#1c0a22', s: '#a090b0', S: '#6a5a80', e: '#ffe040', w: '#d8c8f0', p: '#ff6ad0' } }
};
const SPR = {};
function spriteFrames(name, side) {
  const key = name + side; if (SPR[key]) return SPR[key];
  const L = LOOKS[name], T = TPL[L.tpl], pal = Object.assign({}, BASEPAL, TEAMPAL[side], L.pal);
  const legRow = T.length - (L.tpl === 'robe' ? 2 : 3);
  const blank = '.'.repeat(T[0].length);
  const idle1 = [blank].concat(T.slice(0, legRow), T.slice(legRow + 1));
  const lift = (rows, half) => rows.map((r, i) => i === rows.length - 1 ? r.split('').map((ch, x) => (half ? x >= 7 : x < 7) ? '.' : ch).join('') : r);
  const build = (rows, grey) => {
    const w = rows[0].length + 2, h = rows.length + 2, cv = mk(w, h), q = cv.getContext('2d');
    const f = (x, y) => y >= 0 && y < rows.length && x >= 0 && x < rows[0].length && rows[y][x] !== '.';
    for (let y = -1; y <= rows.length; y++) for (let x = -1; x <= rows[0].length; x++) {
      let k = null;
      if (f(x, y)) k = pal[rows[y][x]]; else if (f(x - 1, y) || f(x + 1, y) || f(x, y - 1) || f(x, y + 1)) k = '#140c1c';
      if (!k) continue;
      if (grey) { const [r, gg, b] = rgb(k), l = Math.round((r * 0.3 + gg * 0.55 + b * 0.15) * 0.75 + 20); k = '#' + [l, l, l + 8].map(v => Math.min(255, v).toString(16).padStart(2, '0')).join(''); }
      q.fillStyle = k; q.fillRect(x + 1, y + 1, 1, 1);
    }
    return cv;
  };
  const out = { idle0: build(T), idle1: build(idle1), walk0: build(lift(idle1, 0)), walk1: build(lift(T, 1)), grey0: build(T, 1), grey1: build(idle1, 1) };
  SPR[key] = out; return out;
}
// draw a unit standing on tile (px,py are the tile's top-left in screen px)
function drawUnit(g, u, X, Y, t, opt) {
  opt = opt || {};
  const F = spriteFrames(u.name, u.side), ph = Math.floor(t * 2.2 + u.phase) % 2;
  let img = u.acted ? (ph ? F.grey1 : F.grey0) : opt.walk ? (Math.floor(t * 8) % 2 ? F.walk0 : F.walk1) : (ph ? F.idle1 : F.idle0);
  const jump = opt.bounce ? Math.round(Math.abs(Math.sin(t * 7)) * 3) : 0;
  const sw = jump ? 5 : 6;
  g.fillStyle = 'rgba(10,16,10,0.42)'; g.fillRect(X + 8 - sw, Y + 14, sw * 2, 2); g.fillRect(X + 9 - sw, Y + 13, sw * 2 - 2, 1);
  const flip = u.side === 'b';
  const dx = X + Math.floor((16 - img.width) / 2), dy = Y + 16 - img.height - jump;
  if (flip) { g.save(); g.translate(dx + img.width, dy); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore(); } else g.drawImage(img, dx, dy);
}

// ---- 5x7 pixel font (uppercase), two-tone fill with a drop shadow ----
const GLYPH = {
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
  9: '01110,10001,10001,01111,00001,00010,01100', '/': '00001,00010,00010,00100,01000,01000,10000', '-': '00000,00000,00000,01110,00000,00000,00000',
  '.': '00000,00000,00000,00000,00000,01100,01100', ':': '00000,01100,01100,00000,01100,01100,00000', '+': '00000,00100,00100,11111,00100,00100,00000',
  '!': '00100,00100,00100,00100,00100,00000,00100', '?': '01110,10001,00001,00010,00100,00000,00100', ' ': '000,000,000,000,000,000,000'
};
const textW = (s, sc) => s.length * 6 * (sc || 1) - (sc || 1);
function drawText(g, s, x, y, c1, c2, sh, sc) {
  sc = sc || 1; c1 = c1 || '#ffffff'; c2 = c2 || '#c8d4ff'; sh = sh || '#0a0c24';
  for (let pass = 0; pass < 2; pass++) {
    let cx = x;
    for (const ch of s.toUpperCase()) {
      const gl = GLYPH[ch] || GLYPH['?'], rows = gl.split(',');
      rows.forEach((r, ry) => { for (let rx = 0; rx < r.length; rx++) if (r[rx] === '1') { g.fillStyle = pass ? (ry < 4 ? c1 : c2) : sh; g.fillRect(cx + rx * sc + (pass ? 0 : sc), y + ry * sc + (pass ? 0 : sc), sc, sc); } });
      cx += (ch === ' ' ? 4 : 6) * sc;
    }
  }
}
// ---- window frame: dark rounded border, 4-band gradient, bevel, gold corner studs ----
const WTH = { a: ['#3a64d8', '#2c50b8', '#223e96', '#1a2e74', '#a8c8ff', '#0a1238'], b: ['#d85a48', '#b8402e', '#922c26', '#6a1c1e', '#ffc8b8', '#2a0608'], n: ['#4c5a8a', '#3e4a76', '#323c62', '#262e4e', '#c8d4f4', '#0a0e22'] };
function win(g, x, y, w, h, th) {
  const C = WTH[th || 'n'];
  g.globalAlpha = 0.95;
  for (let i = 0; i < h - 2; i++) { g.fillStyle = C[Math.min(3, Math.floor(i / (h - 2) * 4))]; g.fillRect(x + 1, y + 1 + i, w - 2, 1); }
  g.globalAlpha = 1;
  g.fillStyle = '#06061a';
  g.fillRect(x + 2, y, w - 4, 1); g.fillRect(x + 2, y + h - 1, w - 4, 1); g.fillRect(x, y + 2, 1, h - 4); g.fillRect(x + w - 1, y + 2, 1, h - 4);
  g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + w - 2, y + 1, 1, 1); g.fillRect(x + 1, y + h - 2, 1, 1); g.fillRect(x + w - 2, y + h - 2, 1, 1);
  g.fillStyle = C[4]; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 5);
  g.fillStyle = C[5]; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
  [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]].forEach(([a, b]) => { g.fillStyle = '#7a5410'; g.fillRect(a, b, 2, 2); g.fillStyle = '#ffe070'; g.fillRect(a, b, 1, 1); });
}
function hpBar(g, x, y, w, hp, max) {
  const f = Math.round(w * hp / max), low = hp / max < 0.34;
  g.fillStyle = '#06040e'; g.fillRect(x - 1, y - 1, w + 2, 5); g.fillStyle = '#2a1e36'; g.fillRect(x, y, w, 3);
  g.fillStyle = low ? '#f05848' : '#7ce060'; g.fillRect(x, y, f, 3); g.fillStyle = low ? '#ffb0a0' : '#d8ffb8'; g.fillRect(x, y, f, 1); g.fillStyle = low ? '#901c20' : '#2c8a30'; g.fillRect(x, y + 2, f, 1);
}
// vignette on the four corners only
let VIG = null;
function vignette(g, W, H) {
  if (!VIG || VIG.width !== W || VIG.height !== H) {
    VIG = mk(W, H); const q = VIG.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2), d = dx ** 4 + dy ** 4; if (d > 0.55) { q.fillStyle = `rgba(8,6,28,${Math.min(0.26, (d - 0.55) * 0.5).toFixed(3)})`; q.fillRect(x, y, 1, 1); } }
  }
  g.drawImage(VIG, 0, 0);
}
// big banner across the middle (turn / phase)
function banner(g, W, H, txt, th, p) {
  const ease = q => q < 0 ? 0 : q > 1 ? 1 : 1 - Math.pow(1 - q, 3);
  const X = Math.round(p < 0.2 ? (1 - ease(p / 0.2)) * -W : p > 0.8 ? ease((p - 0.8) / 0.2) * W : 0), bh = 26, by = Math.round(H / 2 - bh / 2);
  const C = th === 'b' ? ['#4a0812', '#8a1a22', '#c43a2e', '#ffb0a0'] : ['#0c1a5a', '#1a3a9a', '#2e5ad0', '#9cc4ff'];
  g.globalAlpha = 0.92; for (let i = 0; i < bh; i++) { const f = Math.abs(i - bh / 2) / (bh / 2); g.fillStyle = C[f < 0.35 ? 2 : f < 0.75 ? 1 : 0]; g.fillRect(X, by + i, W, 1); } g.globalAlpha = 1;
  g.fillStyle = C[3]; g.fillRect(X, by, W, 1); g.fillRect(X, by + bh - 1, W, 1); g.fillStyle = '#05040c'; g.fillRect(X, by - 1, W, 1); g.fillRect(X, by + bh, W, 1);
  drawText(g, txt, X + Math.round((W - textW(txt, 2)) / 2), by + 6, '#ffffff', th === 'b' ? '#ffc0a8' : '#b8d8ff', '#05040c', 2);
}
