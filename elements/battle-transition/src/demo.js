/* ===== E-04 demo: drives the shared module (module/battle-transition.js) through the pixel16 skin ===== */
const PARAMS = [
  { key: 'variant', label: 'Enter effect', type: 'seg', options: ['shatter', 'swirl', 'mosaic', 'iris'], default: 'shatter' },
  { key: 'reveal', label: 'Reveal of the new scene', type: 'select', options: ['match', 'fade', 'iris', 'mosaic', 'swirl', 'cut'], default: 'match' },
  { key: 'duration', label: 'Duration', type: 'range', min: 600, max: 1200, step: 50, default: 900, unit: 'ms' },
  { key: 'pieces', label: 'Shards across', type: 'range', min: 4, max: 10, step: 1, default: 6, unit: '' },
  { key: 'spin', label: 'Shard spin', type: 'range', min: 0, max: 720, step: 30, default: 240, unit: '°' },
  { key: 'flash', label: 'Impact flash', type: 'seg', options: ['on', 'off'], default: 'on' },
  { key: 'leave', label: 'Leave effect (battle → map)', type: 'select', options: ['iris', 'mosaic', 'swirl', 'shatter', 'none'], default: 'iris' }
];
const MOD_KEYS = ['variant', 'reveal', 'duration', 'pieces', 'spin', 'flash'];
const Q = new URLSearchParams(location.search);
const P = {}; PARAMS.forEach(p => { P[p.key] = p.default; if (Q.has(p.key)) P[p.key] = p.type === 'range' ? Number(Q.get(p.key)) : Q.get(p.key); });
const W = 256, H = 224, STEP = 1000 / 60;
const SK = GameDNA_Skin.resolve(Q.get('skin') || 'pixel16');
const cv = document.getElementById('cv'), g = cv.getContext('2d');
g.imageSmoothingEnabled = false;

/* ---------- tiny pixel helpers ---------- */
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function hash(x, y, k) { let h = Math.imul(x * 374761393 + y * 668265263 + k * 2147483647, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function sprite(rows, pal) {   // rows of palette letters; '.' = clear; outline drawn by the art itself
  const h = rows.length, w = rows[0].length, c = mk(w, h), q = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ch = rows[y][x]; if (ch !== '.' && pal[ch]) { q.fillStyle = pal[ch]; q.fillRect(x, y, 1, 1); } }
  return c;
}
function outlined(src, col) {   // 1 px dark outline around any sprite
  const w = src.width + 2, h = src.height + 2, c = mk(w, h), q = c.getContext('2d');
  q.drawImage(src, 1, 1); const id = q.getImageData(0, 0, w, h), d = id.data, a = i => d[i * 4 + 3] > 0, mark = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (a(i)) continue; if ((x > 0 && a(i - 1)) || (x < w - 1 && a(i + 1)) || (y > 0 && a(i - w)) || (y < h - 1 && a(i + w))) mark.push(i); }
  const [r, gg, b] = [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)];
  for (const i of mark) { d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
  q.putImageData(id, 0, 0); return c;
}
function blob(w, h, ramp, eyes) {   // shaded round creature: ramp = [dark, base, light, shine]
  const c = mk(w, h), q = c.getContext('2d'), cx = w / 2, cy = h * 0.58, rx = w / 2 - 0.5, ry = h * 0.42;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dy < 0) dy *= 0.78 + 0.22 * (1 - Math.abs(dx)); else dy *= 1;
    const d = dx * dx + dy * dy; if (d > 1) continue;
    const l = -dx * 0.5 - dy * 0.75 + (1 - d) * 0.4;
    q.fillStyle = l > 0.62 ? ramp[3] : l > 0.18 ? ramp[2] : l > -0.3 ? ramp[1] : ramp[0]; q.fillRect(x, y, 1, 1);
  }
  if (eyes) { const ey = Math.round(h * 0.5), ex = Math.round(w * 0.3); q.fillStyle = '#1a0e22'; q.fillRect(ex, ey, 2, 3); q.fillRect(w - ex - 2, ey, 2, 3); q.fillStyle = '#ffffff'; q.fillRect(ex, ey, 1, 1); q.fillRect(w - ex - 2, ey, 1, 1); }
  return outlined(c, '#120a1e');
}

/* ---------- art ---------- */
const ART = {};
function initArt() {
  const T = 16;
  const tile = fn => { const c = mk(T, T), q = c.getContext('2d'); fn((x, y, w, h, col) => { q.fillStyle = col; q.fillRect(x, y, w, h); }); return c; };
  ART.grass = [0, 1, 2].map(k => tile(R => { R(0, 0, 16, 16, '#5aa83e'); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const n = hash(x, y, k + 3); if (n < 0.06) { R(x, y, 1, 2, '#3f8a2e'); } else if (n > 0.965) R(x, y, 1, 1, '#8ed060'); } }));
  ART.tall = [0, 1].map(k => tile(R => { R(0, 0, 16, 16, '#4c9a36'); for (let i = 0; i < 6; i++) { const x = (i * 5 + k * 3) % 15, y = (i * 7 + 2) % 12 + 2; R(x, y, 1, 3, '#2e6e22'); R(x + 1, y - 1, 1, 4, '#3a8a2a'); R(x + 1, y - 1, 1, 1, '#9ad86a'); R(x + 2, y, 1, 3, '#2e6e22'); } }));
  ART.road = tile(R => { R(0, 0, 16, 16, '#d6ae6e'); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const n = hash(x, y, 40); if (n < 0.05) R(x, y, 1, 1, '#b08848'); else if (n > 0.95) R(x, y, 1, 1, '#ecd09a'); } });
  ART.water = [0, 1].map(f => tile(R => { R(0, 0, 16, 16, '#3a70d0'); for (let y = 2; y < 16; y += 5) { const o = (y * 3 + f * 5) % 16; R(o, y, 5, 1, '#78aef0'); R((o + 9) % 16, y + 2, 3, 1, '#2c5ab0'); } }));
  ART.flower = tile(R => { R(0, 0, 16, 16, '#5aa83e'); [[3, 4, '#f4f0e8'], [10, 3, '#f0d040'], [6, 10, '#e85a6a'], [12, 11, '#f4f0e8']].forEach(([x, y, c]) => { R(x, y - 1, 1, 1, c); R(x - 1, y, 3, 1, c); R(x, y + 1, 1, 1, c); R(x, y, 1, 1, '#f4c430'); }); });
  const tree = mk(20, 24), tq = tree.getContext('2d');
  const disc = (x, y, r, c) => { tq.fillStyle = c; for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r + r * 0.6) tq.fillRect(x + xx, y + yy, 1, 1); };
  tq.fillStyle = '#5a3a1e'; tq.fillRect(8, 15, 4, 8); tq.fillStyle = '#7a5230'; tq.fillRect(8, 15, 1, 8);
  disc(10, 10, 9, '#1e5a26'); disc(9, 9, 8, '#2e7a34'); disc(7, 7, 5, '#3e9a40'); disc(6, 5, 2, '#68c058');
  ART.tree = outlined(tree, '#14240e');
  ART.treeShadow = (() => { const c = mk(20, 6), q = c.getContext('2d'); q.fillStyle = 'rgba(16,40,12,0.45)'; for (let y = 0; y < 6; y++) { const hw = Math.round(9 * Math.sqrt(1 - ((y - 2.5) / 3) ** 2)); q.fillRect(10 - hw, y, hw * 2, 1); } return c; })();
  const HP = { k: '#1c1426', h: '#7a4a22', H: '#a8682e', s: '#f2c08f', S: '#d89a70', t: '#3a64d8', T: '#7aa0f0', d: '#223e96', b: '#c89a3a', p: '#5a4632', w: '#ffffff', c: '#e85a4a' };
  const heroRows = [
    ['....hhhh....', '...hHHHHh...', '..hHHHHHHh..', '..hhssssh...', '..hsskskh...', '...ssSss....', '..dtTTttd...', '.sdtTttTds..', '.sdtbbbbds..', '..dtttttd...', '...pp.pp....', '...kk.kk....'],
    ['....hhhh....', '...hHHHHh...', '..hHHHHHHh..', '..hhssssh...', '..hsskskh...', '...ssSss....', '..dtTTttd...', '.sdtTttTds..', '.sdtbbbbds..', '..dtttttd...', '...pp..pp...', '..kk....kk..']
  ];
  ART.hero = heroRows.map(r => outlined(sprite(r, HP), '#1c1426'));
  const bigHero = (cape, tunic, light) => {
    const rows = [
      '......hhhh......', '....hhHHHHhh....', '...hHHHHHHHHh...', '...hHhhhhhhHh...', '...hhssssssh....', '...hsskssksh....', '....ssssSss.....', '.....sSSSs......',
      '...ccttTTttcc...', '..cctttTTtttcc..', '..cctTTttTTtcc..', '..sctttttttcs...', '..ss.bbbbbb.ss..', '....ttttttt.....', '....ttt.ttt.....', '....ppp.ppp.....', '....ppp.ppp.....', '...kkkk.kkkk....'];
    return outlined(sprite(rows, { ...HP, c: cape, t: tunic, T: light }), '#1c1426');
  };
  ART.knight = bigHero('#b83a3a', '#3a64d8', '#7aa0f0');
  ART.mage = bigHero('#5a3a8a', '#2e8a5a', '#6ad08a');
  ART.slime = blob(26, 20, ['#1e5a8a', '#2e86c8', '#5ab4ec', '#d0f0ff'], true);
  ART.jelly = blob(30, 24, ['#6a2a7a', '#9a4ab0', '#c87ad8', '#f4d0ff'], true);
  ART.ember = blob(22, 18, ['#8a2a14', '#d0541e', '#f49a3a', '#fff0b0'], true);
  // battle backdrop: stepped sky, two hill layers, ground stripes
  const bd = mk(W, 152), b = bd.getContext('2d');
  ['#2a3a7a', '#34508e', '#4268a2', '#5282b4', '#6aa0c4', '#8abed0'].forEach((c, i) => { b.fillStyle = c; b.fillRect(0, i * 11, W, 11); });
  for (let x = 0; x < W; x++) { const y1 = 52 + Math.round(Math.sin(x * 0.045) * 6 + Math.sin(x * 0.13 + 1) * 3); b.fillStyle = '#5a7aa8'; b.fillRect(x, y1, 1, 70 - y1); b.fillStyle = '#7a98c0'; b.fillRect(x, y1, 1, 1); }
  for (let x = 0; x < W; x++) { const y2 = 62 + Math.round(Math.sin(x * 0.07 + 2) * 5 + Math.sin(x * 0.21) * 2); b.fillStyle = '#3e6a4a'; b.fillRect(x, y2, 1, 72 - y2); b.fillStyle = '#5a8a58'; b.fillRect(x, y2, 1, 1); }
  ['#6aa848', '#5e9a40', '#548e3a', '#4a8234', '#40762e', '#386a28', '#2f5e22'].forEach((c, i) => { const y0 = 70 + Math.round((i * i) * 1.7 + i * 2); b.fillStyle = c; b.fillRect(0, y0, W, 152 - y0); });
  for (let i = 0; i < 70; i++) { const x = Math.floor(hash(i, 1, 9) * W), y = 74 + Math.floor(hash(i, 2, 9) ** 0.7 * 76); b.fillStyle = y > 120 ? '#2a5420' : '#7ab854'; b.fillRect(x, y, 1, 2); }
  ART.backdrop = bd;
  ART.map = buildMap();
}
const MAP = [
  'TTTTTTTTTTTTTTTT',
  'Tgg..gTTggwwwggT',
  'T.g...g..gwwwwgT',
  'Tg..T..g..wwwg.T',
  '..g......g..g..T',
  'rrrrrg..g..,,,.T',
  'g..rrrrrrrr,,,,T',
  '.g...g...rr,,,,T',
  'T..f...g.rr,,,.T',
  'TT...T...rrg...T',
  'T..g....grr..T.T',
  'Tg..f.g..rr..g.T',
  'TTT.....grr.TTTT',
  'TTTTTTTTTrrTTTTT'
];
function buildMap() {   // ground layer only (trees are drawn as objects so the hero can pass behind them)
  const c = mk(W, H), q = c.getContext('2d');
  for (let r = 0; r < 14; r++) for (let col = 0; col < 16; col++) {
    const ch = MAP[r][col], x = col * 16, y = r * 16;
    q.drawImage(ch === 'r' ? ART.road : ch === 'w' ? ART.water[0] : ch === 'f' ? ART.flower : ch === ',' ? ART.tall[(r + col) & 1] : ART.grass[Math.floor(hash(col, r, 5) * 3)], x, y);
    if (ch === 'w') { q.fillStyle = '#c8e4ff'; if (MAP[r - 1] && MAP[r - 1][col] !== 'w') q.fillRect(x, y, 16, 1); }
  }
  return c;
}
const TREES = [];
for (let r = 0; r < 14; r++) for (let col = 0; col < 16; col++) if (MAP[r][col] === 'T') TREES.push([col * 16 - 2, r * 16 - 8]);
// pixel skins: the overworld is drawn by the shared pixel scene kit (pixel-kit/pixel-scene.js); same road, pond and tall grass cells
const PXS = window.GameDNA_PixelScene, KIT = !!PXS && SK.pixel !== false;
const KMAP = [
  'TTTTTTTTTTTTTTTT',
  'TT....TT..www.TT',
  'T....u....wwww.T',
  'T...t.....www..T',
  '............r..T',
  'ppppp......,,,.T',
  '...pppppppp,,,,T',
  '.........pp,,,,T',
  'T..F...r.pp,,,.T',
  'TT...t...pp....T',
  'T........pp..t.T',
  'T...F....pp....T',
  'TTT......pp.TTTT',
  'TTTTTTT.Tpp.TTTT'];
const SCENE = KIT ? PXS.scene({ seed: 41, map: KMAP, props: [{ k: 'sign', x: 132, y: 92 }, { k: 'fence', x: 16, y: 122, o: { len: 38 } }, { k: 'stump', x: 70, y: 150 }, { k: 'boulder', x: 40, y: 60 }, { k: 'flowers', x: 110, y: 60, o: { v: 2 } }, { k: 'log', x: 60, y: 176 }] }) : null;
const BLADES = KIT ? PXS.strArt(['l...l..d...l.l', 'ld.ldl.dl.dl.l', 'dd.ddl.dd.dldd'], { l: '#57a044', d: '#2a6238' }) : null;
function heroDir(ms) { const a = heroAt(ms), b = heroAt(ms + 20); return !a.moving ? 'right' : Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? (b.x >= a.x ? 'right' : 'left') : (b.y < a.y ? 'up' : 'down'); }

/* ---------- battle scene for pixel skins: same kit, same 256x224 native pixels as the overworld ---------- */
const BY = 72;                                                   // the kit ground starts here; sky, hills and the tree line sit above
function sculpt(w, h, parts, detail, post, ol) {   // shaded lobes, light from the top left; ramp = [crease, dark, mid, light, highlight]
  const c = mk(w, h), q = c.getContext('2d'), tone = new Int8Array(w * h).fill(-1), owner = new Int8Array(w * h).fill(-1);
  const put = (x, y, col) => { if (x < 0 || y < 0 || x >= w || y >= h) return; q.fillStyle = col; q.fillRect(x | 0, y | 0, 1, 1); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let hit = -1, under = false, hx = 0, hy = 0, hd = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]; if ((p.y1 != null && y > p.y1) || (p.y0 != null && y < p.y0)) continue;
      const dx = (x + 0.5 - p.x) / p.rx, dy = (y + 0.5 - p.y) / p.ry, d = dx * dx + dy * dy;
      if (d <= 1) { under = hit >= 0 && !p.nc; hit = i; hx = dx; hy = dy; hd = d; }
    }
    if (hit < 0) continue;
    const p = parts[hit], n = p.ramp.length, s = hx * 0.62 + hy * 0.78, lit = -s + (1 - hd) * 0.2;
    let k = lit > 0.66 ? n - 1 : lit > 0.24 ? n - 2 : lit > -0.3 ? n - 3 : n - 4;
    if (under && hd > 0.7 && s > -0.1) k = 0; else if (p.rim && hd > 0.6 && s > 0.55) k = n - 3;
    k = Math.max(0, k); tone[y * w + x] = k; owner[y * w + x] = hit;
    put(x, y, (p.alt && p.alt(x, y) ? p.ramp2 : p.ramp)[k]);
  }
  if (detail) detail(put, (x, y) => tone[y * w + x], (x, y) => owner[y * w + x]);
  const o = outlined(c, ol || '#1a1024');
  if (post) { const oq = o.getContext('2d'); post((x, y, col) => { oq.fillStyle = col; oq.fillRect(x + 1, y + 1, 1, 1); }); }
  return o;
}
function buildFoes() {
  const F = {};
  // slime: gel dome on a puddle skirt, wet highlight, bounce light on the shadow side; 2 frames (rest, squash)
  const SL = ['#123264', '#1c5296', '#2c7ec6', '#56b0ea', '#a4e0fc'];
  F.slime = [0, 1].map(sq => sculpt(32, 22, [
    { x: 5, y: 18.6, rx: 4.6, ry: 2.6, ramp: SL }, { x: 12, y: 19.4, rx: 5, ry: 2.5, ramp: SL }, { x: 21, y: 19.4, rx: 5, ry: 2.5, ramp: SL }, { x: 27.4, y: 18.6, rx: 4.2, ry: 2.6, ramp: SL },
    { x: 16, y: 13 + sq, rx: 13 + sq, ry: 11.4 - sq, y1: 19, ramp: SL, nc: true, rim: true }
  ], put => {
    const d = sq * 2;
    [[9, 5], [10, 5], [11, 5], [8, 6], [9, 6], [8, 7]].forEach(([x, y]) => put(x, y + d, '#ffffff')); put(13, 4 + d, '#e4f6ff'); put(10, 6 + d, '#e4f6ff'); put(7, 9 + d, SL[4]);
    for (const ex of [17, 23]) { for (let y = 10; y < 14; y++) { put(ex, y + sq, '#0c1838'); put(ex + 1, y + sq, '#0c1838'); } put(ex, 10 + sq, '#ffffff'); }
    for (let x = 19; x < 23; x++) put(x, 15 + sq, '#0c1838'); put(20, 16 + sq, '#e86a84'); put(21, 16 + sq, '#e86a84'); put(19, 14 + sq, '#0c1838'); put(22, 14 + sq, '#0c1838');
    put(12, 13 + sq, SL[4]); put(11, 14 + sq, SL[3]); put(13, 14 + sq, SL[3]); put(12, 15 + sq, SL[3]); put(26, 13 + sq, SL[4]); put(14, 17, SL[4]); put(6, 17, SL[4]);
  }));
  // capling: spotted cap, gills, cream body with a scowl, stub arms and feet
  const CP = ['#4a1024', '#7c1c30', '#b02c38', '#dc5444', '#f8906a'], ST = ['#5c4838', '#9a8262', '#ccb890', '#ecdcb8', '#fff8e4'], FT = ['#2a1a14', '#4a3020', '#6e4a2c', '#96683c', '#c08c54'], GL = ['#3a2028', '#5c3a3a', '#84584c', '#a87860', '#c89878'];
  F.capling = [0, 1].map(fr => sculpt(32, 32, [
    { x: 10.5, y: 29.4, rx: 3.8, ry: 2.4, ramp: FT }, { x: 21.5, y: 29.4, rx: 3.8, ry: 2.4, ramp: FT },
    { x: 6.4, y: 23.5 - fr, rx: 2.8, ry: 2.6, ramp: ST }, { x: 25.6, y: 23.5 - fr, rx: 2.8, ry: 2.6, ramp: ST },
    { x: 16, y: 22, rx: 8.8, ry: 7.8, ramp: ST, rim: true, nc: true },
    { x: 16, y: 14.4, rx: 14, ry: 3.2, ramp: GL },
    { x: 16, y: 12, rx: 15.4, ry: 11.4, y1: 14, ramp: CP, nc: true }
  ], (put, tone, owner) => {
    const spot = (cx, cy, rx, ry) => { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1 && owner(x, y) === 6) put(x, y, dx * 0.6 + dy * 0.8 > 0.35 ? '#c8b088' : tone(x, y) >= 3 ? '#fff8e4' : '#ecdcb8'); } };
    spot(8, 8, 3, 2.4); spot(17.5, 4.6, 3.4, 2.2); spot(25, 9, 2.4, 2); spot(13.5, 11.8, 1.6, 1.4); spot(21, 12.2, 1.4, 1.2); spot(3.6, 12.4, 1.4, 1.2);
    for (let x = 4; x < 29; x += 3) if (owner(x, 15) === 5) put(x, 15, GL[0]);
    const K = '#1a1024';
    for (const ex of [12, 19]) { for (let y = 20; y < 23; y++) { put(ex, y, K); put(ex + 1, y, K); } put(ex, 20, '#ffffff'); }
    [[10, 18], [11, 18], [12, 19], [13, 19], [22, 18], [21, 18], [20, 19], [19, 19]].forEach(([x, y]) => put(x, y, '#4a342c'));
    [[14, 26], [15, 25], [16, 25], [17, 25], [18, 26]].forEach(([x, y]) => put(x, y, '#4a342c'));
    put(10, 23, '#f0b0a0'); put(11, 23, '#f0b0a0'); put(21, 23, '#f0b0a0'); put(22, 23, '#f0b0a0');
  }));
  // stinger: striped abdomen, fuzzy thorax, big eye, glassy wings; 2 wing frames
  const YL = ['#5a3008', '#a86414', '#e09c1c', '#f8cc44', '#fff2a8'], BK = ['#0e0810', '#1e1218', '#342026', '#523436', '#7a5650'], TH = ['#1a1016', '#3a2420', '#5e3e2c', '#8a6240', '#b88c5c'], WG = ['#6484b8', '#8caad4', '#b8d0ee', '#dcecfa', '#ffffff'];
  const WK = { o: '#3e5c96', w: '#ffffff', l: '#cfe2f6', v: '#8caad4' };
  const WUP = [['...ooooo......', '.oowwwwwoo....', 'owwllllwwwo...', 'owlllvllllwo..', 'owllllvllllwo.', '.owllllvlllwo.', '..owllllvllwo.', '...oowlllvllo.', '.....oowllvlo.', '.......ooolvo.', '..........ooo.'], 6, 0, ['..ooo..', '.owwwo.', 'owlllwo', 'owlvlo.', '.owlo..', '..oo...'], 17, 4];
  const WDN = [['..ooooooooo...', '.owwwwwwwwwoo.', 'owllvllvllvlwo', '.oollllllllloo', '...ooooooooo..'], 5, 7, ['.ooooo.', 'owwwwwo', '.ollvlo', '..oooo.'], 19, 6];
  F.stinger = [0, 1].map(fr => sculpt(31, 25, [
    { x: 10, y: 16, rx: 7.6, ry: 5.2, ramp: YL, ramp2: BK, alt: (x, y) => ((x + (y > 17 ? 1 : y < 14 ? 1 : 0)) % 5) >= 3, rim: true },
    { x: 18.6, y: 14, rx: 4.6, ry: 4.6, ramp: TH },
    { x: 24.6, y: 14.4, rx: 4.2, ry: 4.2, ramp: YL }
  ], put => {
    for (let y = 12; y < 15; y++) for (let x = 25; x < 28; x++) put(x, y, '#3a0a1a'); put(26, 12, '#ffffff'); put(25, 13, '#7a1c30'); put(24, 12, '#3a0a1a');
    put(27, 17, '#7a3a10'); put(26, 17, '#5a3008');
  }, put => {
    const K = '#1a1024', wing = (rows, ox, oy) => rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (WK[r[i]]) put(ox + i, oy + j, WK[r[i]]); }), WS = fr ? WDN : WUP;
    [[2, 16, '#f4ecd8'], [1, 17, '#f4ecd8'], [0, 17, '#b8ac98']].forEach(([x, y, c]) => put(x, y, c));
    [[26, 9], [27, 8], [28, 7], [29, 7], [23, 9], [23, 8], [24, 7]].forEach(([x, y]) => put(x, y, K));
    [[16, 19], [16, 20], [15, 21], [19, 19], [19, 20], [20, 21], [20, 22], [22, 18], [23, 19], [23, 20], [24, 21]].forEach(([x, y]) => put(x, y, K));
    wing(WS[3], WS[4], WS[5]); wing(WS[0], WS[1], WS[2]);
  }));
  return F;
}
function buildSky() {   // dithered sky, shaded clouds, a far range and a wooded ridge; baked once at native size
  const c = mk(W, BY + 8), q = c.getContext('2d'), put = (x, y, col) => { q.fillStyle = col; q.fillRect(x, y, 1, 1); }, N = PXS.noise;
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], SKY = ['#3264ba', '#3e76ca', '#5290dc', '#6eaae8', '#90c4f0', '#b6dcf6', '#d6eefa'];
  const dith = (x, y, f, R) => { f = Math.max(0, Math.min(R.length - 1.001, f)); const i = Math.floor(f); return R[i + ((f - i) > (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? 1 : 0)]; };
  for (let y = 0; y < BY + 8; y++) for (let x = 0; x < W; x++) put(x, y, dith(x, y, y / 56 * (SKY.length - 1), SKY));
  const CL = ['#88a6d8', '#b4cbee', '#dce9fa', '#ffffff'];
  const cloud = (lobes, base) => {
    for (let y = 0; y < base; y++) for (let x = 0; x < W; x++) {
      let best = null, bs = -1e9; for (const L of lobes) { const d = Math.hypot(x + 0.5 - L[0], (y + 0.5 - L[1]) * 1.25); if (d <= L[2] && L[2] - d + L[1] * 0.3 > bs) { bs = L[2] - d + L[1] * 0.3; best = L; } }
      if (!best) continue;
      const lit = -((x + 0.5 - best[0]) * 0.55 + (y + 0.5 - best[1]) * 1.25 * 0.83) / best[2];
      let k = lit > 0.5 ? 3 : lit > 0.05 ? 2 : lit > -0.45 ? 1 : 0; if (y >= base - 2 && k > 1) k = 1; if (y === base - 1) k = 0;
      put(x, y, CL[k]);
    }
  };
  cloud([[30, 15, 7], [40, 11, 9], [52, 13, 8], [62, 16, 6], [22, 18, 5], [70, 18, 4]], 20);
  cloud([[150, 10, 5], [158, 7, 7], [168, 9, 6], [176, 11, 4]], 13);
  cloud([[214, 21, 6], [224, 17, 9], [236, 19, 8], [246, 22, 5], [205, 24, 4]], 26);
  cloud([[100, 27, 3], [106, 26, 4], [113, 27, 3]], 29); cloud([[128, 3, 3], [134, 2, 4]], 5);
  // far range: lit left faces, hazy feet
  const r1 = x => 44 - Math.round(N(x, 0, 52, 31) * 22 + N(x, 0, 15, 33) * 6), FAR = ['#5874b0', '#6c8cc4', '#86a6d8', '#a8c2e8'];
  for (let x = 0; x < W; x++) { const top = r1(x); for (let y = top; y < BY; y++) { const xs = Math.round(x - (y - top) * 0.7), face = r1(xs + 2) < r1(xs - 2) ? 2 : r1(xs + 2) > r1(xs - 2) ? 0 : 1; put(x, y, y === top && face ? FAR[3] : dith(x, y, face + (y - top) / 26, FAR.slice(0, 3).concat([FAR[2]]))); } }
  // wooded ridge: canopy bumps, lit crowns, dark feet behind the tree line
  const r2 = x => 56 - Math.round(N(x, 0, 40, 41) * 10 + Math.abs(Math.sin(x * 0.37 + N(x, 0, 9, 43) * 3)) * 3), RG = ['#1c4634', '#28603c', '#387a46', '#4e9652', '#74b862'];
  for (let x = 0; x < W; x++) { const top = r2(x); for (let y = top; y < BY + 8; y++) { const dpt = y - top, lit = r2(x + 1) < r2(x - 1) ? 1 : 0; let f = 3.4 - dpt * 0.3 + lit * 0.8 - (PXS.hash(x >> 1, y >> 1, 47) > 0.7 ? 1 : 0); put(x, y, dpt === 0 ? RG[4 - (1 - lit)] : dith(x, y, f, RG)); } }
  return c;
}
function buildBattle() {
  const props = [], kinds = [['tree', 0], ['pine', 0], ['tree', 1], ['smalltree', 1], ['tree', 2], ['pine', 1], ['smalltree', 0], ['tree', 1], ['pine', 0], ['smalltree', 2], ['tree', 0], ['tree', 2], ['pine', 1], ['smalltree', 1], ['tree', 1], ['pine', 0], ['tree', 0], ['smalltree', 0], ['tree', 2]];
  kinds.forEach(([k, v], i) => props.push({ k, x: -4 + i * 15 + Math.round(PXS.hash(i, 1, 61) * 4), y: (k === 'smalltree' ? 6 : 3) + Math.round(PXS.hash(i, 2, 61) * 4), o: { v } }));
  props.push({ k: 'boulder', x: 20, y: 22, o: { v: 1, moss: true } }, { k: 'bush', x: 238, y: 20, o: { v: 0 } }, { k: 'rock', x: 132, y: 30, o: { v: 1 } }, { k: 'bush', x: 112, y: 16, o: { v: 1 } },
    { k: 'flowers', x: 150, y: 58, o: { v: 2 } }, { k: 'flowers', x: 74, y: 26, o: { v: 1 } }, { k: 'flowers', x: 232, y: 46, o: { v: 0 } }, { k: 'stump', x: 164, y: 24 }, { k: 'rock', x: 120, y: 74, o: { v: 0 } },
    { k: 'bush', x: 250, y: 81, o: { v: 1 } }, { k: 'bush', x: 6, y: 82, o: { v: 0 } });
  const scene = PXS.scene({ seed: 23, map: ['................', '..,,,......,,,..', '.,,,,,....,,,,,.', '..,,,..,,...,,..', '......,,,,......'], props });
  const party = [
    PXS.fighter({ head: 'hair', gear: 'sword', shield: ['#c8ccd8', '#ffffff', '#8a90a4', '#2e5cc0'], pal: { h: '#8a5428', H: '#c08a4a', x: '#5a3418', b: '#2e5cc0', B: '#6a94ea', d: '#1c3a80', g: '#e8c060', p: '#7a8498', P: '#565e72', k: '#3a2618', K: '#6a4a30' } }),
    PXS.fighter({ head: 'hat', gear: 'staff', robe: true, pal: { h: '#e8d8a8', H: '#fff4d0', x: '#b8a070', t: '#2a7a5a', T: '#62c08a', u: '#144a34', b: '#2e8a5a', B: '#6ad08a', d: '#1a5438', g: '#e8c060' } })
  ];
  return { scene, sky: buildSky(), foes: buildFoes(), party };
}
const BATTLE = KIT ? buildBattle() : null;
function shadow(q, x, y, rx) { q.fillStyle = 'rgba(16,8,24,0.32)'; q.fillRect(x - rx + 2, y - 2, rx * 2 - 4, 1); q.fillRect(x - rx, y - 1, rx * 2, 2); q.fillRect(x - rx + 2, y + 1, rx * 2 - 4, 1); }
function drawBattleKit(q, ms) {
  const B = BATTLE, ex = [], fr = p => Math.floor(ms / p) & 1;
  q.drawImage(B.sky, 0, 0);
  const unit = (img, x, y, lift, rx) => ex.push({ y: y - BY, draw: c => { shadow(c, x, y, rx); c.drawImage(img, x - (img.width >> 1), y - img.height - lift); } });
  unit(B.foes.capling[fr(520)], 38, 106, 0, 11);
  unit(B.foes.slime[fr(430)], 98, 124, 0, 13);
  unit(B.foes.stinger[fr(70)], 58, 148, 7 + Math.round(Math.sin(ms / 300) * 2), 9);
  B.party.forEach((f, i) => { const x = [196, 220][i], y = [112, 141][i]; ex.push({ y: y - BY, draw: c => { shadow(c, x, y, 9); c.drawImage(f.normal, x - 11, y - 31); } }); });
  [[78, 112], [128, 140], [176, 120], [238, 128], [156, 146]].forEach(([x, y]) => ex.push({ y: y - BY, draw: c => c.drawImage(BLADES, x - 7, y - 3) }));
  B.scene.draw(q, S.t, ex, 0, BY);
  battleHud(q, ms, ['CAPLING', 'SLIME', 'STINGER']);
}
function battleHud(q, ms, names) {
  SK.frame(q, { x: 0, y: 152, w: 96, h: 72 }, { role: 'window', team: 'b' });
  names.forEach((n, i) => SK.text(q, n, 10, 166 + i * 17));
  SK.frame(q, { x: 96, y: 152, w: 160, h: 72 }, { role: 'window', team: 'a' });
  [['ARDEN', 64, 72], ['LIS', 38, 41]].forEach(([n, hp, mx], i) => {
    const y = 166 + i * 27; SK.text(q, n, 106, y, { color: SK.palette.text.title, color2: SK.palette.text.title2 }); SK.text(q, hp + '/' + mx, 246, y, { align: 'right' });
    SK.bar(q, { x: 106, y: y + 11, w: 140, h: 5 }, hp / mx, hp / mx < 0.6 ? 'hpLow' : 'hp', { style: 'meter' });
  });
  if (ms < 1300) { const a = ms < 900 ? 1 : 1 - (ms - 900) / 400; SK.frame(q, { x: 64, y: 20, w: 128, h: 17 }, { role: 'window', team: 'n', alpha: a }); SK.text(q, 'MONSTERS APPEAR', 128, 25, { align: 'center', alpha: a }); }
}

/* ---------- the demo game (deterministic fixed step) ---------- */
const LOOP = 6400, ENC_AT = 1500;
const S = { t: 0, scene: 'map', sceneT: 0, auto: Q.get('auto') !== '0', path: 0, log: [], hero: { x: 8, y: 84 }, mids: 0, dones: 0, leaveAt: null };
const PATH = [[8, 84], [80, 84], [80, 100], [150, 100], [176, 100], [184, 102]];
function heroAt(ms) {   // walk the road into the tall grass
  const speed = 0.13; let d = ms * speed;
  for (let i = 0; i < PATH.length - 1; i++) { const [x0, y0] = PATH[i], [x1, y1] = PATH[i + 1], L = Math.hypot(x1 - x0, y1 - y0); if (d <= L) return { x: x0 + (x1 - x0) * d / L, y: y0 + (y1 - y0) * d / L, moving: true }; d -= L; }
  const e = PATH[PATH.length - 1]; return { x: e[0], y: e[1], moving: false };
}
const TR = GameDNA_BattleTransition.create({ view: { x: 0, y: 0, w: W, h: H }, canvas: cv, skin: SK, seed: 41, params: pick(P, MOD_KEYS) });
function pick(o, keys) { const r = {}; keys.forEach(k => r[k] = o[k]); return r; }
const THROW_MID = Q.get('throwmid') === '1';
function enterBattle() {
  if (S.scene !== 'map' || TR.busy()) return;
  const h = heroAt(S.sceneT);
  TR.start({
    capture: q => drawScene(q),                                  // draw the current scene straight into the snapshot
    focus: { x: Math.round(h.x), y: Math.round(h.y) - 6 },
    onMid: () => { S.mids++; S.log.push('mid ' + Math.round(S.t)); if (THROW_MID) throw new Error('demo: onMid throws on purpose'); setScene('battle'); },
    onDone: () => { S.dones++; S.log.push('done ' + Math.round(S.t)); }
  });
}
function leaveBattle() {
  if (S.scene !== 'battle' || TR.busy()) return;
  if (P.leave === 'none') { setScene('map'); return; }
  TR.start({ variant: P.leave, reveal: 'match', capture: q => drawScene(q), onMid: () => { S.mids++; setScene('map'); }, onDone: () => { S.dones++; } });
}
function setScene(s) { S.scene = s; S.sceneT = 0; }
function restart() { TR.reset(); S.t = 0; setScene('map'); S.log = []; }
function step() {
  S.t += STEP;
  if (TR.busy()) { TR.update(STEP); return; }                     // world and input pause while the transition runs
  S.sceneT += STEP;
  if (S.auto) {
    if (S.scene === 'map' && S.sceneT >= ENC_AT && S.sceneT < ENC_AT + STEP) enterBattle();
    if (S.scene === 'battle' && S.sceneT >= 2600 && S.sceneT < 2600 + STEP) leaveBattle();
    if (S.t >= LOOP) restart();
  }
}

/* ---------- drawing ---------- */
function drawMapKit(q, ms) {
  const h = heroAt(ms), hx = Math.round(h.x), hy = Math.round(h.y) + 2;
  SCENE.draw(q, S.t, [{ y: hy, draw: c => {
    PXS.actor(c, hx, hy, { pal: 'hero', dir: heroDir(ms), frame: h.moving ? (Math.floor(ms / 150) & 1) : 0 });
    if (KMAP[Math.floor(h.y / 16)] && KMAP[Math.floor(h.y / 16)][Math.floor(h.x / 16)] === ',') c.drawImage(BLADES, hx - 7, hy - 2);
  } }]);
  if (ms > ENC_AT - 300 && ms < ENC_AT + 200 && S.auto) {
    const x = hx - 4, y = hy - 30;
    SK.frame(q, { x, y, w: 9, h: 11 }, { role: 'window', team: 'b' }); q.fillStyle = '#ffffff'; q.fillRect(x + 4, y + 2, 1, 4); q.fillRect(x + 4, y + 7, 1, 1);
  }
  SK.frame(q, { x: 4, y: 4, w: 92, h: 17 }, { role: 'window', team: 'n' });
  SK.text(q, 'MEADOW ROAD', 13, 9, { color: SK.palette.text.title, color2: SK.palette.text.title2 });
}
function drawMap(q, ms) {
  if (KIT) return drawMapKit(q, ms);
  q.drawImage(ART.map, 0, 0);
  const wf = Math.floor(S.t / 500) & 1;
  for (let r = 0; r < 14; r++) for (let c = 0; c < 16; c++) if (MAP[r][c] === 'w' && wf) { q.drawImage(ART.water[1], c * 16, r * 16); if (MAP[r - 1] && MAP[r - 1][c] !== 'w') { q.fillStyle = '#c8e4ff'; q.fillRect(c * 16, r * 16, 16, 1); } }
  const h = heroAt(ms), objs = TREES.map(([x, y]) => ({ y: y + 22, d: () => { q.drawImage(ART.treeShadow, x, y + 19); q.drawImage(ART.tree, x, y); } }));
  objs.push({ y: h.y + 1, d: () => {
    const f = h.moving ? (Math.floor(ms / 150) & 1) : 0, x = Math.round(h.x) - 7, y = Math.round(h.y) - 13;
    q.fillStyle = 'rgba(16,40,12,0.4)'; q.fillRect(x + 3, y + 13, 8, 2);
    q.drawImage(ART.hero[f], x, y);
    if (MAP[Math.floor(h.y / 16)] && MAP[Math.floor(h.y / 16)][Math.floor(h.x / 16)] === ',') { q.drawImage(ART.tall[0], 0, 9, 16, 7, x - 1, y + 9, 16, 7); }
  } });
  objs.sort((a, b) => a.y - b.y).forEach(o => o.d());
  if (ms > ENC_AT - 300 && ms < ENC_AT + 200 && S.auto) {   // surprise mark over the hero
    const x = Math.round(h.x) - 3, y = Math.round(h.y) - 26;
    SK.frame(q, { x, y, w: 9, h: 11 }, { role: 'window', team: 'b' }); q.fillStyle = '#ffffff'; q.fillRect(x + 4, y + 2, 1, 4); q.fillRect(x + 4, y + 7, 1, 1);
  }
  SK.frame(q, { x: 4, y: 4, w: 92, h: 17 }, { role: 'window', team: 'n' });
  SK.text(q, 'MEADOW ROAD', 13, 9, { color: SK.palette.text.title, color2: SK.palette.text.title2 });
}
function drawBattle(q, ms) {
  if (KIT) return drawBattleKit(q, ms);
  q.drawImage(ART.backdrop, 0, 0);
  const bob = (k, p) => Math.round(Math.sin(ms / p + k) * 1.5);
  const foes = [[ART.jelly, 34, 70, 0], [ART.slime, 72, 92, 1], [ART.ember, 30, 106, 2]];
  for (const [a, x, y, k] of foes) { q.fillStyle = 'rgba(10,30,10,0.35)'; q.fillRect(x + 3, y + a.height - 2, a.width - 6, 3); q.drawImage(a, x, y + bob(k, 260)); }
  const party = [[ART.knight, 178, 66], [ART.mage, 204, 96]];
  for (const [a, x, y] of party) { q.fillStyle = 'rgba(10,30,10,0.35)'; q.fillRect(x + 4, y + a.height * 2 - 3, a.width * 2 - 8, 3); q.drawImage(a, x, y, a.width * 2, a.height * 2); }
  battleHud(q, ms, ['JELLY', 'SLIME', 'EMBERLING']);
}
function drawScene(q) { if (S.scene === 'map') drawMap(q, S.sceneT); else drawBattle(q, S.sceneT); }
function render() {
  g.imageSmoothingEnabled = false;
  drawScene(g);
  TR.draw(g);                                                      // last: covers the whole view while busy
  updateHud();
}

/* ---------- page UI ---------- */
const $ = id => document.getElementById(id);
function updateHud() {
  const st = TR.state(), ph = st.phase;
  $('status').textContent = ph === 'idle' ? (S.scene === 'map' ? 'Map · walking' : 'Battle') : 'Transition · ' + ph + ' · ' + Math.round(TR.progress() * 100) + '%';
  const bar = $('tl'); if (!bar) return;
  const cur = $('tlhead'); cur.style.left = (TR.progress() * 100) + '%'; cur.style.opacity = ph === 'idle' ? 0 : 1;
  $('busy').textContent = TR.busy() ? 'busy() = true · input blocked' : 'busy() = false';
  $('busy').className = TR.busy() ? 'on' : '';
  $('calls').textContent = 'onMid ' + S.mids + ' · onDone ' + S.dones;
}
function buildParams() {
  const box = $('params'); box.innerHTML = '';
  for (const p of PARAMS) {
    const row = document.createElement('div'); row.className = 'row';
    if (p.type === 'range') {
      row.innerHTML = `<label><span>${p.label}</span><output>${P[p.key]}${p.unit}</output></label><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${P[p.key]}">`;
      const inp = row.querySelector('input'), out = row.querySelector('output');
      const fill = () => inp.style.setProperty('--fill', ((P[p.key] - p.min) / (p.max - p.min) * 100) + '%'); fill();
      inp.addEventListener('input', () => { P[p.key] = Number(inp.value); out.textContent = P[p.key] + p.unit; fill(); changed(); });
    } else if (p.type === 'seg') {
      row.innerHTML = `<label><span>${p.label}</span></label><div class="seg">${p.options.map(o => `<button type="button" data-v="${o}" aria-checked="${o === P[p.key]}">${o}</button>`).join('')}</div>`;
      row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { P[p.key] = b.dataset.v; row.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); changed(); }));
    } else {
      row.innerHTML = `<label><span>${p.label}</span></label><select>${p.options.map(o => `<option ${o === P[p.key] ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
      row.querySelector('select').addEventListener('change', e => { P[p.key] = e.target.value; changed(); });
    }
    box.appendChild(row);
  }
}
function changed() {
  TR.setParams(pick(P, MOD_KEYS));
  const u = new URLSearchParams(location.search);
  PARAMS.forEach(p => { if (String(P[p.key]) === String(p.default)) u.delete(p.key); else u.set(p.key, P[p.key]); });
  history.replaceState(null, '', '?' + u.toString());
}
let speed = 1;
function wire() {
  $('go').addEventListener('click', () => { if (S.scene === 'map') enterBattle(); else leaveBattle(); });
  $('auto').addEventListener('change', e => { S.auto = e.target.checked; });
  $('replay').addEventListener('click', () => { restart(); S.auto = true; $('auto').checked = true; });
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { speed = Number(b.dataset.speed); document.querySelectorAll('[data-speed]').forEach(x => x.setAttribute('aria-checked', x === b)); }));
  $('reset').addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); buildParams(); changed(); });
  window.addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'Enter') { if (TR.busy()) return; e.preventDefault(); $('go').click(); } });
}
function fitCanvas() {
  const box = $('stage'), avail = Math.min(box.clientWidth - 16, window.innerHeight - 140), s = Math.max(1, Math.floor(avail / W));
  cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
  $('scaleinfo').textContent = '256×224 native · ' + s + '× integer scale';
}
initArt(); buildParams(); wire(); fitCanvas(); window.addEventListener('resize', fitCanvas);
$('auto').checked = S.auto;
/* text state for critics and tools/sprites/statecheck.py. Nothing is mirrored by this demo's own draw calls.
   Map: one hero; the kit actor has a side frame (native right, the kit mirrors it for dir 'left') and up / down frames
   (no side). Battle: foes on the left, party on the right. Kit party = PXS.fighter art, which looks LEFT, drawn as is;
   capling and stinger are 3/4 views turned right; the slimes and the non-pixel-skin sprites are front views (no side). */
window.__state = () => {
  const ms = S.sceneT, L = [];
  if (S.scene === 'map') {
    const h = heroAt(ms), d = KIT ? heroDir(ms) : 'down', o = { id: 'hero', x: Math.round(h.x), y: Math.round(h.y) + 2, facing: d === 'left' || d === 'right' ? d : null, target: null };
    if (h.moving && o.facing) o.vx = o.facing === 'right' ? 1 : -1;
    if (!o.facing) o.noFace = KIT ? 'top-down ' + d + ' frame' : 'front-view sprite (non-pixel skin)';
    L.push(o);
  } else if (KIT) {
    const foes = [['capling', 38, 106, 'right'], ['slime', 98, 124, null], ['stinger', 58, 148, 'right']], party = [['knight', 196, 112, BATTLE.party[0].facing || 'left'], ['mage', 220, 141, BATTLE.party[1].facing || 'left']];
    foes.forEach(f => L.push({ id: f[0], x: f[1], y: f[2], facing: f[3], target: 208, noFace: f[3] ? undefined : 'frontal art' }));
    party.forEach(f => L.push({ id: f[0], x: f[1], y: f[2], facing: f[3], target: 65 }));
  } else {
    [['jelly', 46, 96], ['slime', 86, 112], ['ember', 42, 128], ['knight', 194, 110], ['mage', 220, 140]].forEach((f, i) => L.push({ id: f[0], x: f[1], y: f[2], facing: null, target: i < 3 ? 207 : 58, noFace: 'front-view sprite (non-pixel skin)' }));
  }
  return { t: Math.round(S.t), scene: S.scene, actors: L };
};
window.__demo = { S, TR, step, render };
if (Q.has('t')) {
  const n = Math.floor(Number(Q.get('t')) / STEP); for (let i = 0; i < n; i++) step();
}
render();
if (Q.get('freeze') !== '1') {
  let last = performance.now(), acc = 0;
  const loop = now => { acc += Math.min(250, now - last) * speed; last = now; while (acc >= STEP) { step(); acc -= STEP; } render(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
} else window.__frozen = true;
