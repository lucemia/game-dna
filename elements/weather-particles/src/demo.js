/* ===== E-06 demo: drives the shared module (module/weather-particles.js) ===== */
const PARAMS = [
  { key: 'density', label: 'Density', type: 'range', min: 0, max: 2, step: 0.1, default: 1, unit: '×' },
  { key: 'intensity', label: 'Intensity', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5, unit: '' },
  { key: 'wind', label: 'Wind', type: 'range', min: -2, max: 2, step: 0.1, default: 0.4, unit: '' },
  { key: 'gust', label: 'Gusts', type: 'range', min: 0, max: 1, step: 0.05, default: 0.35, unit: '' },
  { key: 'parallax', label: 'Depth parallax', type: 'range', min: 0, max: 1.5, step: 0.1, default: 1, unit: '×' },
  { key: 'front', label: 'Share in front of sprites', type: 'range', min: 0, max: 0.6, step: 0.05, default: 0.25, unit: '' },
  { key: 'night', label: 'Night glow', type: 'range', min: 0, max: 1, step: 0.05, default: 0, unit: '' },
  { key: 'shade', label: 'Storm shade', type: 'range', min: 0, max: 0.5, step: 0.05, default: 0, unit: '' },
  { key: 'fade', label: 'Cross-fade', type: 'range', min: 0, max: 4000, step: 100, default: 1500, unit: 'ms' },
  { key: 'cap', label: 'Particle budget', type: 'range', min: 20, max: 400, step: 10, default: 180, unit: '' },
  { key: 'splash', label: 'Rain splashes', type: 'select', options: ['on', 'off'], default: 'on' },
  { key: 'uiMode', label: 'Over UI windows', type: 'select', options: ['hide', 'dim'], default: 'hide' }
];
const WEATHERS = ['rain', 'snow', 'leaves', 'dust', 'fireflies', 'none'];
const PRESETS = {
  'Drizzle': { weather: 'rain', tod: 'day', p: { intensity: 0.2, density: 0.7, wind: 0.2 } },
  'Storm': { weather: 'rain', tod: 'dusk', p: { intensity: 1, density: 1.6, wind: 1.2, gust: 0.8, shade: 0.25, front: 0.35 } },
  'Blizzard': { weather: 'snow', tod: 'day', p: { intensity: 0.9, density: 1.6, wind: 1.3, gust: 0.7, shade: 0.1 } },
  'Quiet snowfall': { weather: 'snow', tod: 'night', p: { intensity: 0.25, wind: 0.1, gust: 0.1, night: 1 } },
  'Autumn gusts': { weather: 'leaves', tod: 'dusk', p: { wind: 1.1, gust: 0.7, density: 1.2, night: 0.4 } },
  'Dusty hall': { weather: 'dust', tod: 'dusk', p: { wind: 0.1, gust: 0.1, density: 1.3, front: 0.3 } },
  'Firefly night': { weather: 'fireflies', tod: 'night', p: { night: 1, density: 1.4, wind: 0.1, gust: 0.15 } }
};
const W = 320, H = 180, STEP = 1000 / 60, TS = 16, PERIOD = 48;
const Q = new URLSearchParams(location.search);
const P = {}; PARAMS.forEach(p => P[p.key] = p.default);
let WEATHER = WEATHERS.includes(Q.get('weather')) ? Q.get('weather') : 'rain';
let TOD = ['day', 'dusk', 'night'].includes(Q.get('tod')) ? Q.get('tod') : 'day';
if (!Q.has('night')) P.night = TOD === 'night' ? 1 : TOD === 'dusk' ? 0.4 : 0;
PARAMS.forEach(p => { if (Q.has(p.key)) P[p.key] = p.type === 'range' ? +Q.get(p.key) : Q.get(p.key); });
let CAM = ['pan', 'manual', 'static'].includes(Q.get('cam')) ? Q.get('cam') : 'pan';
let UI_ON = Q.get('ui') !== 'off';
let SKIN_ID = Q.get('skin') === 'flat' ? 'flat' : 'pixel16';
const TOUR = Q.get('tour') === '1';
const SEED = Q.has('seed') ? (+Q.get('seed') | 0) : 1;
const FREEZE_T = Q.has('t') ? Math.max(0, +Q.get('t') || 0) : null, FROZEN = FREEZE_T !== null && Q.get('freeze') === '1';

/* a token-only, non-pixel skin: proves the colours come from the skin and the motion from the module */
if (window.GameDNA_Skin) GameDNA_Skin.register({
  id: 'flat', name: 'flat (demo)', pixel: false,
  native: { w: 320, h: 180, scale: 'fit', smoothing: true },
  palette: {
    ink: '#29304d', paper: '#f4f6fb',
    ui: { fill: '#ffffff', edge: '#cdd2de', highlight: '#ffffff', shadow: 'rgba(40,46,90,0.25)' },
    team: { a: '#6f8cff', b: '#ff8574', n: '#aeb5c6' },
    overlay: { move: { fill: '#6f8cff', edge: '#4d68d6' }, attack: { fill: '#ff6f6f', edge: '#d9624f' }, threat: { fill: '#8f86ff', edge: '#5b4bff' }, heal: { fill: '#3fcf8e', edge: '#2f9e63' } },
    fx: { hot: '#ff6a4a', cold: '#4ab8ff', heal: '#3fcf8e', crit: '#ffcf4a', status: '#8f86ff' },
    text: { main: '#29304d', shadow: 'rgba(0,0,0,0)', outline: '#ffffff' },
    weather: { leaves: ['#ff8a5c', '#ffc65c', '#ff6f8f', '#b0485a'] }
  },
  fonts: { ui: { type: 'canvas', family: 'system-ui, sans-serif', size: 7, weight: 700 }, num: { type: 'canvas', family: 'system-ui, sans-serif', size: 11, weight: 800 } },
  motion: { snap: false, fadeSteps: null, flashMax: 0.3 }
});
const SK = () => (window.GameDNA_Skin ? GameDNA_Skin.resolve(SKIN_ID) : null);

/* ===== world: a looping side-view meadow (ground profile per 16 px column, with pits) ===== */
//            0         1         2         3         4
//            0123456789012345678901234567890123456789012345678
const PROF = '000000111110000__0000000222220000000__000011000000';   // 0 = y148, 1 = y140, 2 = y132, _ = pit
function colTop(c) { const ch = PROF[((c % PERIOD) + PERIOD) % PERIOD]; return ch === '_' ? null : 148 - (+ch) * 8; }
function groundAtWorld(wx) { return colTop(Math.floor(wx / TS)); }

/* ===== art: original sprites and tiles, re-tinted per time of day ===== */
const TINT = { day: [1, 1, 1], dusk: [1.0, 0.78, 0.72], night: [0.42, 0.5, 0.82] };
function tint(hex) { const t = TINT[TOD], n = parseInt(hex.slice(1), 16); return 'rgb(' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v * t[i])).join(',') + ')'; }
function sprite(w, h, rows, pal) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); rows.forEach((r, y) => [...r].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = tint(pal[ch]); x.fillRect(i, y, 1, 1); } })); return c; }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const SKY = {
  day: ['#4a8ad8', '#5a9ae0', '#6aaae6', '#80bcec', '#98ccf0', '#b4dcf4'],
  dusk: ['#3a2a68', '#5a3a7a', '#8a4a7a', '#c0607a', '#e88a6a', '#f8b86a'],
  night: ['#06081a', '#0a0e26', '#101632', '#18203e', '#1e2a4a', '#283656']
};
const OVERCAST = {
  day: ['#4e5a6e', '#5a6679', '#667385', '#738092', '#818e9e', '#909cab'],
  dusk: ['#2e2a40', '#3c344c', '#4c3e56', '#5e4a5e', '#705664', '#80626a'],
  night: ['#05060c', '#090b14', '#0d111c', '#121724', '#171d2c', '#1c2434']
};
let ART = null;
function overcastSky() {   // grey bands and low cloud banks, no sun or moon: drawn over the clear sky by the rain / snow weight
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), S = OVERCAST[TOD], bh = 132 / (S.length - 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const f = Math.min(S.length - 1.001, y / bh), i = Math.floor(f), fr = f - i;
    g.fillStyle = fr * 16 > BAYER[(y & 3) * 4 + (x & 3)] ? S[i + 1] : S[i]; g.fillRect(x, y, 1, 1);
  }
  // soft cloud banks: low contrast to the bands, ragged dithered edges, varying thickness (no hard stripes)
  const cl = TOD === 'night' ? '#141a28' : TOD === 'dusk' ? '#54465a' : '#7c8898';
  for (let k = 0; k < 2; k++) for (let x = 0; x < W; x++) {
    const mid = 18 + k * 34 + 5 * Math.sin(x / 31 + k * 2.3) + 3 * Math.sin(x / 11 + k), th = 4 + 3 * Math.sin(x / 19 + k * 1.7) + 2 * Math.sin(x / 7);
    for (let y = Math.floor(mid - th - 2); y <= Math.ceil(mid + th + 2); y++) {
      const d = Math.abs(y - mid) - th;                      // < 0 inside the bank, 0..2 the ragged edge
      if (d < 0 || (d < 2 && BAYER[(y & 3) * 4 + (x & 3)] / 16 > d / 2)) { g.fillStyle = cl; g.fillRect(x, y, 1, 1); }
    }
  }
  return c;
}
function buildArt() {
  const A = {};
  A.overcast = overcastSky();
  // sky: dithered bands, sun / moon, a few clouds
  A.sky = document.createElement('canvas'); A.sky.width = W; A.sky.height = H; let g = A.sky.getContext('2d');
  const S = SKY[TOD], bh = 132 / (S.length - 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const f = Math.min(S.length - 1.001, y / bh), i = Math.floor(f), fr = f - i;
    g.fillStyle = fr * 16 > BAYER[(y & 3) * 4 + (x & 3)] ? S[i + 1] : S[i]; g.fillRect(x, y, 1, 1);
  }
  if (TOD === 'night') {
    for (let i = 0; i < 70; i++) { const x = (i * 97 + 13) % W, y = (i * 53 + 7) % 100; g.fillStyle = i % 7 === 0 ? '#fff6d8' : '#8a96c8'; g.fillRect(x, y, 1, 1); }
    g.fillStyle = '#e8ecff'; for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (x * x + y * y <= 36 && (x - 3) * (x - 3) + (y + 2) * (y + 2) > 30) g.fillRect(262 + x, 30 + y, 1, 1);
  } else {
    const sc = TOD === 'day' ? ['#fff8d0', '#ffe68a'] : ['#ffe0a0', '#ff9a5a'], sx = TOD === 'day' ? 250 : 236, sy = TOD === 'day' ? 26 : 92;
    for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) { const d = x * x + y * y; if (d <= 64) { g.fillStyle = d <= 30 ? sc[0] : sc[1]; g.fillRect(sx + x, sy + y, 1, 1); } }
    const cl = TOD === 'day' ? ['#ffffff', '#dbe8f6', '#b8cce4'] : ['#ffd0b0', '#e8a090', '#a06a80'];
    for (const [cx, cy, w] of [[30, 30, 44], [128, 18, 30], [190, 44, 36]]) {
      g.fillStyle = cl[2]; g.fillRect(cx + 2, cy + 6, w - 4, 3);
      g.fillStyle = cl[1]; g.fillRect(cx, cy + 3, w, 4); g.fillRect(cx + 6, cy, w - 16, 3);
      g.fillStyle = cl[0]; g.fillRect(cx + 8, cy, w - 20, 2); g.fillRect(cx + 2, cy + 3, w - 10, 2);
    }
  }
  // far hills and a tree line, tiling every 640 px
  const strip = (h, paint) => { const c = document.createElement('canvas'); c.width = 640; c.height = H; paint(c.getContext('2d')); return c; };
  A.hills = strip(H, g => {
    const c = ['#5a78a8', '#6888b4'].map(tint);
    for (let x = 0; x < 640; x++) { const t = x / 640 * Math.PI * 2, hh = 34 + Math.round(14 * Math.sin(t * 2 + 1) + 9 * Math.sin(t * 5) + 4 * Math.sin(t * 11)); g.fillStyle = c[0]; g.fillRect(x, 150 - hh, 1, hh + 30); g.fillStyle = c[1]; g.fillRect(x, 150 - hh, 1, 2); }
  });
  A.trees = strip(H, g => {
    const c = ['#2a5a4a', '#346a52', '#22463e', '#1a3a34'].map(tint);
    g.fillStyle = c[2]; g.fillRect(0, 136, 640, 44);
    for (let i = 0; i < 40; i++) {
      const x = i * 16 + ((i * 37) % 9), hgt = 18 + ((i * 53) % 17);
      for (let y = 0; y < hgt; y++) { const w = Math.max(1, Math.round((y / hgt) * 7)); g.fillStyle = y % 5 === 4 ? c[3] : x % 3 ? c[0] : c[1]; g.fillRect(x - w, 138 - hgt + y, 2 * w + 1, 1); }
      g.fillStyle = c[3]; g.fillRect(x, 138, 1, 4);
    }
  });
  // ground tile column: grass lip + dirt with dither, drawn from the top of the column to the bottom of the screen
  A.tile = document.createElement('canvas'); A.tile.width = TS; A.tile.height = 48; g = A.tile.getContext('2d');
  for (let y = 0; y < 48; y++) for (let x = 0; x < TS; x++) {
    const b = BAYER[(y & 3) * 4 + (x & 3)] / 16; let col;
    if (y === 0) col = '#a8e070'; else if (y < 3) col = '#7cc850'; else if (y < 5) col = b < 0.5 ? '#4e9a3a' : '#7cc850'; else if (y < 7) col = '#3e7a30';
    else col = (y / 48 > b * 0.55 + 0.25) ? '#4a2c24' : '#6a4230';
    if (y >= 8 && ((x * 7 + y * 3) % 13 === 0)) col = '#8a5a3c';
    g.fillStyle = tint(col); g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = tint('#c8f090'); g.fillRect(3, 0, 1, 1); g.fillRect(11, 0, 2, 1);
  g.fillStyle = tint('#1a1424'); g.fillRect(0, 47, TS, 1);
  // sprites (hero 2 frames, slime 2 frames, a signpost, flowers)
  const HP = { o: '#1a1424', h: '#6a3a2a', H: '#8a5236', s: '#f0c090', S: '#c88a62', a: '#4a6ad8', A: '#2e46a0', b: '#7a92f0', l: '#3a2e44', y: '#e8c050' };
  A.hero = [
    ['....oooo....', '...ohhhho...', '..ohHHhhho..', '..ohssssho..', '..osossoso..', '..ossSSsso..', '...oosso....', '..oabbaaoo..', '.oabbaaaAo..', '.osabaaaAso.', '.os.ayyA.so.', '...oaaaAo...', '...olo.olo..', '...olo.olo..', '..ooo..ooo..', '............'],
    ['....oooo....', '...ohhhho...', '..ohHHhhho..', '..ohssssho..', '..osossoso..', '..ossSSsso..', '...oosso....', '..oabbaaoo..', '.oabbaaaAo..', '.osabaaaAso.', '.os.ayyA.so.', '...oaaaAo...', '...olooloo..', '..olo..olo..', '..oo....oo..', '............']
  ].map(r => sprite(12, 16, r, HP));
  const SP = { o: '#1a1424', 7: '#2a7a52', 8: '#3aa86a', 9: '#62d08a', w: '#e8fff0' };
  A.slime = [
    ['..............', '.....oooo.....', '...oo8888oo...', '..o88999988o..', '.o8899w99988o.', '.o889ww99988o.', 'o8889w999998o.', 'o88o99999o88o.', 'o88899999888o.', 'o78888888887o.', '.oooooooooooo.'],
    ['.....oooo.....', '...oo8888oo...', '..o88999988o..', '.o8899w99988o.', '.o889ww99988o.', 'o8889w999998o.', 'o88o99999o88o.', 'o88899999888o.', 'o88888888888o.', 'o77777777777o.', '.oooooooooooo.']
  ].map(r => sprite(14, 11, r, SP));
  A.sign = sprite(12, 14, ['oooooooooooo', 'oyyyyyyyyyyo', 'oyHHyHHHyHyo', 'oyyyyyyyyyyo', 'oooooooooooo', '....oHo.....', '....oHo.....', '....oHo.....', '....oHo.....', '....oHo.....', '....oHo.....', '....oHo.....', '...ooHoo....', '..oooooooo..'], { o: '#2a1a14', y: '#c89a5a', H: '#6a4630' });
  // shared pixel scene kit: layered earth strip (one world period, wraps), small props and the pixel16 lord as the hero, all re-tinted
  const PXS = window.GameDNA_PixelScene, sk16 = window.GameDNA_Skin && GameDNA_Skin.resolve('pixel16');
  const tinted = src => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'), m = TINT[TOD];
    x.drawImage(src, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = 'rgb(' + m.map(v => Math.round(255 * v)).join(',') + ')'; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0); return c; };
  if (PXS) {
    const c = document.createElement('canvas'); c.width = PERIOD * TS; c.height = 64; const x = c.getContext('2d'); PXS.sideGround(x, 0, 0, c.width, 64, { seed: 8, ox: 0 });
    x.globalCompositeOperation = 'multiply'; x.fillStyle = '#b08e84'; x.fillRect(0, 7, c.width, 64); x.globalCompositeOperation = 'source-over';
    A.strip = tinted(c);
    A.props = {}; [['bush', 0], ['bush', 1], ['rock', 0], ['boulder', 1], ['stump', 0], ['log', 0], ['flowers', 1], ['flowers', 2]].forEach(([k, v]) => { const pr = PXS.prop(k, { v }); A.props[k + v] = { img: tinted(pr.frames[0]), ax: pr.ax, ay: pr.ay }; });
  }
  if (sk16 && sk16.unitToken) A.lord = [0, 1].map(f => { const c = document.createElement('canvas'); c.width = 18; c.height = 23; sk16.unitToken(c.getContext('2d'), { x: 0, y: 0, w: 18, h: 22 }, { team: 'a', kind: 'lord', facing: 1, noShadow: true }, f * 26 / 60 + 0.01); return tinted(c); });
  if (A.lord) A.pose = heroPoses(A.lord[0]);
  A.flower = sprite(5, 5, ['.r.r.', 'rrYrr', '.rgr.', '..g..', '..g..'], { r: '#f0607a', Y: '#ffe070', g: '#3e8a3a' });
  return A;
}

/* ===== hero poses, drawn in code from the baked pixel16 lord (18x23, frontal, soles on row 21):
   the body (rows 0-18) and the two legs (left cols 4-8, right cols 10-14, rows 19-21) are cut apart and put back
   with per-pose offsets. walk = 4 frames (plant left / pass with the right leg up / plant right / pass with the
   left leg up; body 1 px up on the passing frames), jump = both legs tucked, land = body 1 px down, legs wide.
   A planted leg always ends on row 21, so feet sit on the ground line in every ground frame. ===== */
const HERO_POSES = {
  //        body dy, left leg [dx, dy], right leg [dx, dy]   (leg dy < 0 = lifted)
  walk0: [0, [-1, 0], [0, -1]],
  walk1: [-1, [0, 0], [0, -2]],
  walk2: [0, [0, -1], [1, 0]],
  walk3: [-1, [0, -2], [0, 0]],
  stand: [0, [0, 0], [0, 0]],
  jump: [0, [0, -3], [1, -2]],
  land: [1, [-1, 0], [1, 0]]
};
const WALK_FRAMES = ['walk0', 'walk1', 'walk2', 'walk3'], STRIDE = 5;   // one walk frame per 5 px of ground covered: feet move with the ground
function heroPoses(src) {
  const out = {};
  for (const [k, [bdy, L, R]] of Object.entries(HERO_POSES)) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d');
    for (const [lx, w, [dx, dy]] of [[4, 5, L], [10, 5, R]]) {
      x.drawImage(src, lx, 19, w, 3, lx + dx, 19 + dy, w, 3);
      for (let f = 19 + dy - 1; f >= 18 + bdy; f--) x.drawImage(src, lx, 19, w, 1, lx + dx, f, w, 1);   // stretch the shin up to the hips when the body rose or the leg is planted under a raised body
    }
    x.drawImage(src, 0, 0, src.width, 19, 0, bdy, src.width, 19);
    out[k] = c;
  }
  return out;
}

/* ===== the integration: one instance; update in the fixed step; drawBack before the ground, drawFront after the sprites ===== */
const cv = document.getElementById('cv'), g = cv.getContext('2d');
const S = { t: 0, camX: 0, vx: 0, paused: false, keys: {}, tourIdx: -1, face: 1, hero: null };   // face: the side the hero looks at (manual camera: the last arrow pressed)
if (Q.get('hold') === 'left' || Q.get('hold') === 'right') S.keys[Q.get('hold') === 'left' ? 'ArrowLeft' : 'ArrowRight'] = true;   // ?cam=manual&hold=left: a held arrow for ?t=&freeze=1 shots
function camNow() { return CAM === 'static' ? 0 : CAM === 'manual' ? Math.round(S.camX) : Math.floor(S.t * 0.032); }
function uiRects() { return UI_ON ? UI.map(u => u.r) : [{ x: 4, y: 3, w: 98, h: 14 }]; }
const UI = [
  { r: { x: 4, y: 3, w: 98, h: 14 }, kind: 'plate' },
  { r: { x: 214, y: 3, w: 102, h: 14 }, kind: 'plate2' },
  { r: { x: 188, y: 118, w: 126, h: 52 }, kind: 'window' }
];
let WX = null;
function makeWX() {
  WX = GameDNA_Weather.create({
    view: { x: 0, y: 0, w: W, h: H }, seed: SEED, weather: WEATHER, skin: SKIN_ID, params: P,
    ground: x => groundAtWorld(x + camNow()),          // screen x -> screen y of the ground top (null over a pit)
    uiRects
  });
  WX.reset(S.t);
}
const TOUR_SEQ = [[0, 'rain'], [7000, 'snow'], [14000, 'leaves'], [21000, 'dust'], [28000, 'fireflies']];
function step() {
  if (S.paused) return;
  S.t += STEP;
  if (CAM === 'manual') { const ax = (S.keys.ArrowRight ? 1 : 0) - (S.keys.ArrowLeft ? 1 : 0); if (ax) S.face = ax; S.vx = S.vx * 0.85 + ax * 0.3; S.camX += S.vx; }
  if (TOUR) {
    const tt = S.t % 35000; let idx = 0; TOUR_SEQ.forEach(([at], i) => { if (tt >= at) idx = i; });
    if (idx !== S.tourIdx) { S.tourIdx = idx; WEATHER = TOUR_SEQ[idx][1]; WX.setWeather(WEATHER, S.t < 100 ? 0 : P.fade); markWeather(); }
  }
  heroStep();
  WX.update(STEP);
}

/* ===== the hero: walks to keep near screen x 104, hops up steps, falls down them, jumps the pits on a parabola =====
   hx = world x of the sprite box (feet span hx+1..hx+11), y = feet line. Air time of a pit jump: 2*JUMP_V/GRAV = 0.6 s. */
const GRAV = 440, JUMP_V = 132, PIT_VX = 90, MAX_V = 130, ANCHOR = 104, LAND_MS = 120;
function groundUnder(hx) { const a = colTop(Math.floor((hx + 2) / TS)), b = colTop(Math.floor((hx + 10) / TS)); return a === null ? b : b === null ? a : Math.min(a, b); }
function heroInit() { const hx = camNow() + ANCHOR; S.hero = { hx, y: groundUnder(hx) ?? 148, vx: 0, vy: 0, air: false, dist: 0, land: 0, airMs: 0, prevCam: camNow(), camV: CAM === 'pan' ? 32 : 0 }; }
function heroStep() {
  const H = S.hero, dt = STEP / 1000, cam = camNow(); H.camV += ((cam - H.prevCam) / dt - H.camV) * 0.1; H.prevCam = cam; const camV = Math.abs(H.camV) < 1 ? 0 : H.camV;   // camera speed, smoothed (the pan moves in whole px)
  if (H.air) {
    H.vy += GRAV * dt; H.y += H.vy * dt; H.hx += H.vx * dt; H.airMs += STEP;
    const gr = groundUnder(H.hx);
    if (H.vy > 0 && gr !== null && H.y >= gr) { H.y = gr; H.air = false; H.vy = 0; H.land = LAND_MS; H.vx = 0; }
    else if (H.y > 260) heroInit();   // safety: never lost in a pit
    return;
  }
  H.airMs = 0; if (H.land > 0) H.land -= STEP;
  const dx = cam + ANCHOR - H.hx; let v = camV + Math.max(-40, Math.min(40, dx * 1.5));
  if (camV > 0) v = Math.max(v, camV * 0.5); else if (camV < 0) v = Math.min(v, camV * 0.5); else if (Math.abs(dx) < 2) v = 0;
  v = Math.max(-MAX_V, Math.min(MAX_V, v));
  if (v) {
    const dir = Math.sign(v), front = H.hx + (dir > 0 ? 10 : 2);
    const pitAhead = colTop(Math.floor((front + dir * 3) / TS)) === null;
    const upAhead = colTop(Math.floor((front + dir * 6) / TS)), stepUp = upAhead !== null && upAhead < H.y - 2;
    if (pitAhead) {
      if (Math.abs(camV) > 10 || dx * dir > 24) { H.air = true; H.vy = -JUMP_V; H.vx = dir * PIT_VX; H.dist += Math.abs(v * dt); return; }   // a pit: jump it
      v = 0;   // the camera parked over the pit: wait at the edge
    } else if (stepUp) { H.air = true; H.vy = -JUMP_V; H.vx = dir * Math.max(30, Math.abs(v)); H.dist += Math.abs(v * dt); return; }   // a higher column: hop up
  }
  H.hx += v * dt; H.vx = v; H.dist += Math.abs(v * dt);
  const gr = groundUnder(H.hx);
  if (gr === null || gr > H.y + 0.5) { H.air = true; H.vy = 0; H.vx = v; }   // walked off a step: fall
  else H.y = gr;
  const sx = H.hx - cam; if (sx < 8) H.hx = cam + 8; else if (sx > 296) H.hx = cam + 296;   // fast manual camera: keep him on screen
}
function heroPose() {
  const H = S.hero;
  if (H.air) return 'jump';
  if (H.land > 0) return 'land';
  if (!H.vx) return 'stand';
  return WALK_FRAMES[Math.floor(H.dist / STRIDE) % WALK_FRAMES.length];
}

function heroPos(camX) {   // screen box of the 12x16 fallback sprite; the lord is drawn at (x - 3, y - 6), soles at y + 15
  const H = S.hero; return { x: Math.round(H.hx - camX), y: Math.round(H.y) - 16, jump: H.air, pose: heroPose() };
}
function drawScene(camX) {
  g.drawImage(ART.sky, 0, 0);
  let ov = 0; WX.weather().mix.forEach(m => { if (m.kind === 'rain' || m.kind === 'snow') ov += m.w; });
  if (P.shade > 0.1) ov = Math.max(ov, 1);
  if (ov > 0) { g.globalAlpha = Math.min(1, ov); g.drawImage(ART.overcast, 0, 0); g.globalAlpha = 1; }
  const par = (img, f) => { const o = ((Math.floor(camX * f) % 640) + 640) % 640; g.drawImage(img, -o, 0); g.drawImage(img, 640 - o, 0); };
  par(ART.hills, 0.2); par(ART.trees, 0.5);
}
const FG_PROPS = { 2: 'bush0', 8: 'rock0', 13: 'flowers1', 20: 'stump0', 26: 'boulder1', 31: 'bush1', 35: 'flowers2', 40: 'log0', 46: 'rock0' };   // column -> kit prop (never on the sign, slime or pit columns)
function drawGround(camX) {
  const c0 = Math.floor(camX / TS);
  for (let c = c0; c <= c0 + W / TS + 1; c++) {
    const top = colTop(c); if (top === null) continue;
    const x = c * TS - camX, m = ((c % PERIOD) + PERIOD) % PERIOD;
    if (ART.strip) { g.drawImage(ART.strip, m * TS, 0, TS, 64, x, top, TS, 64);
      const l = colTop(c - 1), r = colTop(c + 1);   // a dark wall where the neighbour column is lower or a pit
      if (l === null || l > top) { g.fillStyle = '#1a1024'; g.fillRect(x, top + 1, 1, (l === null ? 64 : l - top) + 2); g.fillStyle = 'rgba(26,16,36,0.45)'; g.fillRect(x + 1, top + 4, 1, (l === null ? 64 : l - top)); }
      if (r === null || r > top) { g.fillStyle = '#1a1024'; g.fillRect(x + TS - 1, top + 1, 1, (r === null ? 64 : r - top) + 2); g.fillStyle = 'rgba(26,16,36,0.45)'; g.fillRect(x + TS - 2, top + 4, 1, (r === null ? 64 : r - top)); }
      const pk = FG_PROPS[m]; if (pk && ART.props[pk]) { const pr = ART.props[pk]; g.drawImage(pr.img, x + 8 - pr.ax, top + 1 - pr.ay); }
    } else g.drawImage(ART.tile, x, top);
    if (m % 7 === 3 && !FG_PROPS[m]) g.drawImage(ART.flower, x + 5, top - 4);
  }
  for (const wx of [200, 200 + 768]) { const sx = wx - (camX % 768); if (sx > -20 && sx < W) g.drawImage(ART.sign, sx, colTop(Math.floor(wx / TS)) - 14); }
}
function drawSprites(camX) {
  const bob = Math.floor(S.t / 300) % 2;
  for (const base of [470, 470 + 768, 700, 700 + 768]) { const sx = base - (camX % 768); if (sx > -20 && sx < W) { const top = colTop(Math.floor((base) / TS)) ?? 148; g.drawImage(ART.slime[bob], sx, top - 11); } }
  const h = heroPos(camX);
  const im = ART.pose ? ART.pose[h.pose] : ART.hero[h.jump ? 1 : Math.floor(S.hero.dist / 8) % 2], ix = ART.lord ? h.x - 3 : h.x, iy = ART.lord ? h.y - 6 : h.y;
  if (heroFace() !== HERO_ART_FACING) { g.save(); g.translate(ix + im.width, iy); g.scale(-1, 1); g.drawImage(im, 0, 0); g.restore(); } else g.drawImage(im, ix, iy);
}
const HERO_ART_FACING = 1;   // both hero pictures (the baked pixel16 lord, the fallback sprite) look right
function heroFace() { const v = S.hero ? S.hero.vx : 0; return v > 5 ? 1 : v < -5 ? -1 : CAM === 'manual' ? S.face : 1; }   // he looks the way he moves (auto-pan: right)
function col(sk, path, alt) { const v = sk.lookup(path); return typeof v === 'string' && /^(#|rgb|hsl)/.test(v) ? v : alt ? col(sk, alt) : '#ffffff'; }
function drawUI() {
  const sk = SK();
  if (!sk) return;
  sk.frame(g, UI[0].r, { role: 'plate' });
  sk.text(g, 'HP 42/42', 10, 7, { font: 'ui', color: col(sk, 'text.main') });
  sk.bar(g, { x: 60, y: 8, w: 36, h: 4 }, 1, 'hp', { style: 'meter' });
  if (!UI_ON) return;
  sk.frame(g, UI[1].r, { role: 'plate' });
  const mx = WX.weather().mix, name = mx.length ? mx.map(m => m.kind.toUpperCase()).join(' TO ') : 'CLEAR';
  sk.text(g, name, 220, 7, { font: 'ui', color: col(sk, 'text.accent', 'text.main') });
  const inner = sk.frame(g, UI[2].r, { role: 'window', team: 'n' }) || UI[2].r;
  sk.text(g, 'ELDER WREN', inner.x + 6, inner.y + 5, { font: 'ui', color: col(sk, 'text.accent', 'text.main') });
  const lines = { rain: ['The wind turns.', 'Rain by noon.'], snow: ['First snow of', 'the season.'], leaves: ['Hold on to', 'your hat.'], dust: ['Old roads.', 'Old dust.'], fireflies: ['The meadow', 'lights up.'], none: ['Fair weather', 'today.'] }[WEATHER] || ['', ''];
  lines.forEach((l, i) => sk.text(g, l, inner.x + 6, inner.y + 18 + i * 10, { font: 'ui', color: col(sk, 'text.main') }));
}
function draw() {
  const camX = camNow();
  g.imageSmoothingEnabled = false;
  drawScene(camX);
  WX.drawBack(g, camX, 0);      // far + mid layers (and storm shade) behind the ground and sprites
  drawGround(camX);
  drawSprites(camX);
  // near layer in front of the sprites, before the UI. With 'Over UI windows: dim' the demo draws it after the windows instead,
  // to show what dim does for games that draw weather over translucent or late UI: half-strength particles cross the windows.
  if (P.uiMode === 'dim') { drawUI(); WX.drawFront(g, camX, 0); } else { WX.drawFront(g, camX, 0); drawUI(); }
  updateMeters();
}

/* text state for critics and tools/sprites/statecheck.py (canvas px, feet). One hero, drawn with heroFace(); the slimes are frontal blobs. */
window.__state = () => { const camX = camNow(), h = heroPos(camX), actors = [{ id: 'hero', x: h.x + 6, y: h.y + 16, facing: heroFace() > 0 ? 'right' : 'left', target: null,
    vx: Math.round(S.hero.vx / 60 * 100) / 100, pose: h.pose, air: S.hero.air, flipX: heroFace() !== HERO_ART_FACING }];
  for (const base of [470, 470 + 768, 700, 700 + 768]) { const sx = base - (camX % 768); if (sx > -20 && sx < W) actors.push({ id: 'slime-' + base, x: Math.round(sx + 7), y: (colTop(Math.floor(base / TS)) ?? 148), facing: null, target: null, noFace: 'frontal art' }); }
  return { t: Math.round(S.t), cam: CAM, actors, hero: { pose: h.pose, air: S.hero.air, airMs: Math.round(S.hero.airMs), feetY: Math.round(S.hero.y), ground: groundUnder(S.hero.hx) } }; };

/* ===== loop + ?t=&freeze=1 ===== */
function run() {
  if (FREEZE_T !== null) { const n = Math.floor(FREEZE_T / STEP); for (let i = 0; i < n; i++) step(); }
  draw();
  if (FROZEN) { document.documentElement.dataset.frozen = '1'; window.__frozen = true; return; }
  let last = performance.now(), acc = 0;
  const loop = now => { acc += Math.min(250, now - last); last = now; while (acc >= STEP) { step(); acc -= STEP; } draw(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

/* ===== UI ===== */
const METERS = [['far', 'Far layer'], ['mid', 'Mid layer'], ['near', 'Near (front)'], ['total', 'On screen'], ['splashes', 'Splashes / resting'], ['uiHidden', 'Kept off UI'], ['wind', 'Wind px/s']];
function updateMeters() {
  const st = WX.stats(), box = document.getElementById('meters');
  if (!box.children.length) box.innerHTML = METERS.map(([k, l]) => `<div class="meter" data-k="${k}">${l}<b>0</b><i></i></div>`).join('');
  const val = { far: st.far, mid: st.mid, near: st.near, total: st.total + ' / ' + st.cap, splashes: st.splashes + st.resting, uiHidden: st.uiHidden, wind: WX.wind().toFixed(0) };
  for (const el of box.children) {
    const k = el.dataset.k; el.querySelector('b').textContent = val[k];
    el.querySelector('i').style.setProperty('--w', k === 'total' ? Math.round(st.total / st.cap * 100) + '%' : k === 'wind' ? Math.min(100, Math.abs(WX.wind()) / 0.9) + '%' : Math.min(100, (+val[k] || 0) / 1.2) + '%');
    el.classList.toggle('good', k === 'uiHidden');
  }
  const mx = WX.weather().mix;
  document.getElementById('status').textContent = (mx.length ? mx.map(m => m.kind + (m.w < 1 ? ' ' + Math.round(m.w * 100) + '%' : '')).join(' → ') : 'clear') + ' · ' + TOD + (S.paused ? ' · paused' : '') + (TOUR ? ' · tour' : '');
}
function syncURL() {
  if (FROZEN) return;
  const u = new URLSearchParams();
  u.set('weather', WEATHER); if (TOD !== 'day') u.set('tod', TOD); if (CAM !== 'pan') u.set('cam', CAM); if (!UI_ON) u.set('ui', 'off'); if (SKIN_ID !== 'pixel16') u.set('skin', SKIN_ID); if (TOUR) u.set('tour', '1');
  PARAMS.forEach(p => { if (P[p.key] !== p.default) u.set(p.key, P[p.key]); });
  history.replaceState(null, '', '?' + u.toString());
}
function markWeather() { [...document.getElementById('weatherseg').children].forEach(c => c.setAttribute('aria-checked', c.dataset.w === WEATHER)); }
function setWeatherUI(v) { WEATHER = v; WX.setWeather(v, P.fade); markWeather(); syncURL(); }
function buildWeather() {
  const el = document.getElementById('weatherseg'); el.innerHTML = '';
  WEATHERS.forEach((v, i) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.w = v; b.textContent = (i + 1) + ' · ' + (v === 'none' ? 'clear' : v); b.onclick = () => setWeatherUI(v); el.appendChild(b); });
  markWeather();
}
function seg(el, items, cur, on) {
  el.innerHTML = '';
  items.forEach(v => { const b = document.createElement('button'); b.type = 'button'; b.textContent = v; b.setAttribute('aria-checked', v === cur); b.onclick = () => { [...el.children].forEach(c => c.setAttribute('aria-checked', c === b)); on(v); }; el.appendChild(b); });
}
function buildParams() {
  const box = document.getElementById('params'); box.innerHTML = '';
  PARAMS.forEach(p => {
    const row = document.createElement('div'); row.className = 'row';
    const fmt = v => (p.type === 'range' ? (Number.isInteger(p.step) ? v : (+v).toFixed(2).replace(/0$/, '')) + (p.unit ? ' ' + p.unit : '') : v);
    row.innerHTML = `<label><span>${p.label}</span><output>${fmt(P[p.key])}</output></label>`;
    let inp;
    if (p.type === 'range') {
      inp = document.createElement('input'); inp.type = 'range'; inp.min = p.min; inp.max = p.max; inp.step = p.step; inp.value = P[p.key];
      const fill = () => inp.style.setProperty('--fill', ((inp.value - p.min) / (p.max - p.min) * 100) + '%'); fill();
      inp.oninput = () => { P[p.key] = +inp.value; fill(); row.querySelector('output').textContent = fmt(P[p.key]); WX.setParams({ [p.key]: P[p.key] }); syncURL(); };
    } else {
      inp = document.createElement('div'); inp.className = 'seg';
      seg(inp, p.options, P[p.key], v => { P[p.key] = v; row.querySelector('output').textContent = v; WX.setParams({ [p.key]: v }); syncURL(); });
    }
    inp.setAttribute('aria-label', p.label); row.appendChild(inp); box.appendChild(row);
  });
}
function applyPreset(name) {
  const pr = PRESETS[name]; if (!pr) return;
  PARAMS.forEach(p => P[p.key] = p.default); Object.assign(P, pr.p);
  if (pr.tod !== TOD) { TOD = pr.tod; ART = buildArt(); document.getElementById('tod').value = TOD; }
  if (!('night' in pr.p)) P.night = TOD === 'night' ? 1 : TOD === 'dusk' ? 0.4 : 0;
  WX.setParams(P); WEATHER = pr.weather; WX.setWeather(WEATHER, P.fade); markWeather(); buildParams(); syncURL();
}
function fit() {
  const avail = Math.min(document.getElementById('stage').clientWidth - 6, 1300), k = Math.max(1, Math.floor(avail / W));
  cv.style.width = W * k + 'px'; cv.style.height = H * k + 'px';
  document.getElementById('scaleinfo').textContent = `320×180 native · ${k}×`;
}
ART = buildArt();
heroInit();
makeWX();
buildWeather();
const presetSel = document.getElementById('preset');
presetSel.innerHTML = '<option value="">Choose…</option>' + Object.keys(PRESETS).map(n => `<option>${n}</option>`).join('');
presetSel.onchange = () => applyPreset(presetSel.value);
document.getElementById('tod').value = TOD;
document.getElementById('tod').onchange = e => { TOD = e.target.value; ART = buildArt(); P.night = TOD === 'night' ? 1 : TOD === 'dusk' ? 0.4 : 0; WX.setParams({ night: P.night }); buildParams(); syncURL(); };
document.getElementById('cam').value = CAM;
document.getElementById('cam').onchange = e => { S.camX = camNow(); CAM = e.target.value; syncURL(); };
document.getElementById('ui').value = UI_ON ? 'on' : 'off';
document.getElementById('ui').onchange = e => { UI_ON = e.target.value === 'on'; syncURL(); };
document.querySelectorAll('#skinseg button').forEach(b => { b.setAttribute('aria-checked', b.dataset.skin === SKIN_ID); b.onclick = () => { SKIN_ID = b.dataset.skin; document.querySelectorAll('#skinseg button').forEach(c => c.setAttribute('aria-checked', c === b)); WX.setSkin(SKIN_ID); syncURL(); }; });
document.getElementById('reset').onclick = () => { PARAMS.forEach(p => P[p.key] = p.default); TOD = 'day'; ART = buildArt(); document.getElementById('tod').value = 'day'; WX.setParams(P); setWeatherUI('rain'); buildParams(); syncURL(); };
addEventListener('keydown', e => {
  if (e.target && /INPUT|SELECT/.test(e.target.tagName)) return;
  if (e.key >= '1' && e.key <= '6') { setWeatherUI(WEATHERS[+e.key - 1]); e.preventDefault(); }
  if (e.key.startsWith('Arrow')) { if (CAM !== 'manual') { S.camX = camNow(); CAM = 'manual'; document.getElementById('cam').value = 'manual'; } S.keys[e.key] = true; e.preventDefault(); }
  if (e.key === ' ') { S.paused = !S.paused; e.preventDefault(); }
});
addEventListener('keyup', e => { S.keys[e.key] = false; });
addEventListener('resize', fit);
buildParams(); fit(); run();
