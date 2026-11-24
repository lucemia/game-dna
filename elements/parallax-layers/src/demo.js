/* ===== I-02 demo: drives the shared module (module/parallax-layers.js) ===== */
const PARAMS = [
  { key: 'layers', label: 'Layers', type: 'range', min: 3, max: 6, step: 1, default: 5, unit: '' },
  { key: 'depth', label: 'Parallax strength', type: 'range', min: 0, max: 1.3, step: 0.1, default: 1, unit: '×' },
  { key: 'vertical', label: 'Vertical parallax', type: 'range', min: 0, max: 1, step: 0.1, default: 0, unit: '×' },
  { key: 'ambient', label: 'Ambient motion', type: 'range', min: 0, max: 2, step: 0.25, default: 1, unit: '×' },
  { key: 'drift', label: 'Cloud drift', type: 'range', min: 0, max: 4, step: 0.5, default: 1, unit: '×' },
  { key: 'horizon', label: 'Horizon', type: 'range', min: 0.15, max: 0.8, step: 0.01, default: 0.5, unit: '' },
  { key: 'ground', label: 'Ground line', type: 'range', min: 0.3, max: 1, step: 0.01, default: 0.82, unit: '' },
  { key: 'idle', label: 'Idle drift', type: 'range', min: -40, max: 40, step: 2, default: 0, unit: 'px/s' },
  { key: 'sway', label: 'Idle sway', type: 'range', min: 0, max: 8, step: 1, default: 0, unit: 'px' },
  { key: 'detail', label: 'Detail', type: 'range', min: 0.5, max: 1.5, step: 0.25, default: 1, unit: '×' },
  { key: 'floor', label: 'Floor plane', type: 'select', options: ['none', 'plain'], default: 'none' }
];
const PRESETS = {
  'Side-scroller forest': { theme: 'forest', time: 'day', cam: 'pan', p: {} },
  'Dusk coast': { theme: 'cliffs', time: 'dusk', cam: 'pan', p: { layers: 6 } },
  'Night city': { theme: 'city', time: 'night', cam: 'pan', p: { layers: 6, vertical: 0.5 } },
  'Crystal cave': { theme: 'cave', time: 'night', cam: 'pan', p: { layers: 6 } },
  'Battle backdrop': { theme: 'forest', time: 'dusk', cam: 'static', p: { floor: 'plain', ground: 0.56, horizon: 0.4, sway: 2, layers: 6 } },
  'Minimal (3 layers)': { theme: 'forest', time: 'day', cam: 'pan', p: { layers: 3, ambient: 0.5 } }
};
const THEMES = ['forest', 'cliffs', 'cave', 'city'], TIMES = ['day', 'dusk', 'night'];
const W = 320, H = 180, STEP = 1000 / 60, TS = 16;
const Q = new URLSearchParams(location.search);
const P = {}; PARAMS.forEach(p => P[p.key] = p.default);
PARAMS.forEach(p => { if (Q.has(p.key)) P[p.key] = p.type === 'range' ? +Q.get(p.key) : Q.get(p.key); });
let THEME = THEMES.includes(Q.get('theme')) ? Q.get('theme') : 'forest';
let TIME = TIMES.includes(Q.get('time')) ? Q.get('time') : 'day';
let CAM = ['pan', 'manual', 'static'].includes(Q.get('cam')) ? Q.get('cam') : 'pan';
let SKIN_ID = Q.get('skin') === 'flat' ? 'flat' : 'pixel16';
const SEED = Q.has('seed') ? (+Q.get('seed') | 0) : 1;
const FREEZE_T = Q.has('t') ? Math.max(0, +Q.get('t') || 0) : null, FROZEN = FREEZE_T !== null && Q.get('freeze') === '1';

/* a token-only, non-pixel skin with its own backdrop palette: proves the look comes from the skin, the layout from the module */
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
    backdrop: {
      forest: { sky: { day: ['#8fb4ff', '#a9c6ff', '#c4d8ff', '#e0eaff', '#f6f0ff'] }, far: ['#9aa6e6', '#a8b4ee', '#b8c2f4', '#c8d0f8', '#ffffff'], back: ['#6fc4a4', '#7ed0ae', '#8edcb8', '#a0e6c2', '#b8f0d0'], mid: ['#2f8a7a', '#3a9c86', '#46ae90', '#58c09a', '#74d2a8'], near: ['#1f5a5a', '#246666', '#2a7272', '#348080', '#3e8e8a'] }
    }
  },
  fonts: { ui: { type: 'canvas', family: 'system-ui, sans-serif', size: 7, weight: 700 }, num: { type: 'canvas', family: 'system-ui, sans-serif', size: 11, weight: 800 } },
  particles: { shape: 'circle', size: [1, 3], blend: 'lighter', glow: 0.6, snap: false },
  motion: { snap: false, fadeSteps: null, flashMax: 0.3 }
});

/* ===== the integration: one instance, update in the fixed step, draw first ===== */
const cv = document.getElementById('cv'), g = cv.getContext('2d');
let BG = null;
function makeBG() {
  BG = GameDNA_Parallax.create({ view: { x: 0, y: 0, w: W, h: H }, seed: SEED, theme: THEME, time: TIME, skin: SKIN_ID, params: P, getObstacles: actorRects });
  BG.prebuild(); buildLayerStrip();
}

/* ===== demo world: deterministic fixed-step sim ===== */
const S = { t: 0, camX: 0, camY: 0, vx: 0, vy: 0, paused: false, keys: {}, face: 1 };   // face: the side the hero looks at (manual camera: the last arrow pressed)
if (Q.get('hold') === 'left' || Q.get('hold') === 'right') S.keys[Q.get('hold') === 'left' ? 'ArrowLeft' : 'ArrowRight'] = true;   // ?cam=manual&hold=left: a held arrow for ?t=&freeze=1 shots
function groundY() { return Math.round(H * P.ground); }
function camPos(t) {
  if (CAM === 'static') return [0, 0];
  if (CAM === 'manual') return [S.camX, S.camY];
  return [Math.floor(t * 0.045), P.vertical > 0 ? Math.round(Math.sin(t / 2600) * 24) : 0];
}
function step() {
  if (S.paused) return;
  S.t += STEP;
  if (CAM === 'manual') {
    const ax = (S.keys.ArrowRight ? 1 : 0) - (S.keys.ArrowLeft ? 1 : 0), ay = (S.keys.ArrowDown ? 1 : 0) - (S.keys.ArrowUp ? 1 : 0);
    if (ax) S.face = ax;
    S.vx = S.vx * 0.85 + ax * 0.45; S.vy = S.vy * 0.85 + ay * 0.3;
    S.camX += S.vx; S.camY = Math.max(-30, Math.min(30, S.camY + S.vy));
  }
  BG.update(STEP);
}

/* ===== original foreground art (tiles, a hero, a slime) so the backdrop is seen behind real sprites ===== */
function sprite(w, h, rows, pal) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); rows.forEach((r, y) => [...r].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, y, 1, 1); } })); return c; }
const HERO_PAL = { o: '#1a1424', h: '#6a3a2a', H: '#8a5236', s: '#f0c090', S: '#c88a62', a: '#4a6ad8', A: '#2e46a0', b: '#7a92f0', l: '#3a2e44', w: '#d8dce8', W: '#9aa0b8', y: '#e8c050' };
const HERO = [
  ['....oooo....', '...ohhhho...', '..ohHHhhho..', '..ohssssho..', '..osossoso..', '..ossSSsso..', '...oosso....', '..oabbaaoo..', '.oabbaaaAo..', '.osabaaaAso.', '.os.ayyA.so.', '...oaaaAo...', '...olo.olo..', '...olo.olo..', '..ooo..ooo..', '............'],
  ['....oooo....', '...ohhhho...', '..ohHHhhho..', '..ohssssho..', '..osossoso..', '..ossSSsso..', '...oosso....', '..oabbaaoo..', '.oabbaaaAo..', '.osabaaaAso.', '.os.ayyA.so.', '...oaaaAo...', '...olooloo..', '..olo..olo..', '..oo....oo..', '............']
].map(r => sprite(12, 16, r, HERO_PAL));
const SLIME = sprite(14, 11, ['.....oooo.....', '...oo8888oo...', '..o88999988o..', '.o8899w99988o.', '.o889ww99988o.', 'o8889w999998o.', 'o88o99999o88o.', 'o88899999888o.', 'o78888888887o.', '.o77777777oo..', '..oooooooo....'], { o: '#1a1424', 7: '#2a7a52', 8: '#3aa86a', 9: '#62d08a', w: '#e8fff0' });
const TILE = (() => { const c = document.createElement('canvas'); c.width = TS; c.height = TS * 2; const x = c.getContext('2d');
  for (let yy = 0; yy < TS * 2; yy++) for (let xx = 0; xx < TS; xx++) {
    const bay = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(yy & 3) * 4 + (xx & 3)] / 16;
    let col; if (yy < 2) col = '#8ad05a'; else if (yy < 4) col = bay < 0.5 ? '#5aa83e' : '#8ad05a'; else if (yy < 6) col = '#3e7a30'; else col = (yy / 32 > bay * 0.6 + 0.3) ? '#4a2c24' : '#6a4230';
    if (yy >= 6 && ((xx * 7 + yy * 3) % 11 === 0)) col = '#8a5a3c';
    x.fillStyle = col; x.fillRect(xx, yy, 1, 1);
  }
  x.fillStyle = '#1a1424'; x.fillRect(0, TS * 2 - 1, TS, 1); return c; })();
const PITS = [[22, 24], [41, 42], [63, 65]];
// foreground from the shared pixel scene kit: an 80-column strip of grass-topped, layered earth (baked once, wraps with the pits),
// small props standing on it, and the pixel16 skin's 18x22 lord as the hero
const PXS = window.GameDNA_PixelScene, STRIP_H = 112;
const STRIP = PXS ? (() => { const c = document.createElement('canvas'); c.width = 80 * TS; c.height = STRIP_H; const x = c.getContext('2d'); PXS.sideGround(x, 0, 0, c.width, STRIP_H, { seed: 6, ox: 0 });
  x.globalCompositeOperation = 'multiply'; x.fillStyle = '#b08e84'; x.fillRect(0, 7, c.width, STRIP_H); x.fillStyle = '#c8b0a8'; x.fillRect(0, 40, c.width, STRIP_H); x.globalCompositeOperation = 'source-over'; return c; })() : null;
// the foreground is drawn into its own layer, graded for the time of day (dusk warm-dark, night blue-dark; caves are always dark), then composited
const FG = document.createElement('canvas'); FG.width = W; FG.height = H; const fgx = FG.getContext('2d');
function fgGrade() { return THEME === 'cave' ? (TIME === 'day' ? 'rgba(20,18,50,0.5)' : 'rgba(10,10,40,0.66)') : TIME === 'night' ? 'rgba(10,12,48,0.6)' : TIME === 'dusk' ? 'rgba(70,24,70,0.3)' : null; }
const FG_PROPS = [[3, 'bush', 0], [9, 'rock', 1], [14, 'flowers', 0], [18, 'stump', 0], [28, 'boulder', 0], [33, 'flowers', 2], [37, 'bush', 1], [46, 'sign', 0], [51, 'flowers', 1], [56, 'rock', 0], [60, 'bush', 0], [69, 'log', 0], [74, 'flowers', 3], [78, 'rock', 1]];
function heroFace() { return CAM === 'manual' ? S.face : 1; }   // auto-pan runs right; static looks at the slime on its right
function drawHero(g, x, y, t, moving) { const sk = window.GameDNA_Skin && GameDNA_Skin.resolve('pixel16');
  if (sk && sk.unitToken) sk.unitToken(g, { x: x - 3, y: y - 6, w: 18, h: 22 }, { team: 'a', kind: 'lord', facing: heroFace(), noShadow: true }, moving ? t / 1000 * 2.6 : t / 1000); else { const im = HERO[Math.floor(t / 160) % 2]; if (heroFace() < 0) { g.save(); g.translate(x + im.width, y); g.scale(-1, 1); g.drawImage(im, 0, 0); g.restore(); } else g.drawImage(im, x, y); } }
function isPit(col) { const m = ((col % 80) + 80) % 80; return PITS.some(([a, b]) => m >= a && m <= b); }
function actorRects() {   // the host's sprites, so bright ambient pixels never sit right next to one
  const gy = groundY();
  return CAM === 'static' ? [{ x: 89, y: gy + 8, w: 18, h: 22, id: 'hero' }, { x: 214, y: gy + 20, w: 14, h: 11, id: 'slime' }] : [{ x: 107, y: gy - 22, w: 18, h: 22, id: 'hero' }];
}
function drawForegroundRaw(g, t, camX, camY, part) {   // part: 'ground' | 'actors' | undefined (both)
  const gy = groundY();
  if (CAM === 'static') {
    if (part !== 'actors' && P.floor !== 'plain') { if (STRIP) g.drawImage(STRIP, 0, 0, W, STRIP_H, 0, gy, W, STRIP_H); else for (let x = 0; x < W; x += TS) g.drawImage(TILE, x, gy); }
    if (part === 'ground') return;
    const bob = Math.floor(t / 400) % 2;
    g.fillStyle = 'rgba(10,8,20,0.35)'; g.fillRect(93, gy + 29, 10, 2); g.fillRect(214, gy + 30, 14, 2);
    drawHero(g, 92, gy + 14, t, false); g.drawImage(SLIME, 214, gy + 20 + bob);
    return;
  }
  const c0 = Math.floor(camX / TS) - 1;
  if (part !== 'actors') for (let c = c0; c <= c0 + W / TS + 2; c++) if (!isPit(c)) { const m = ((c % 80) + 80) % 80, x = c * TS - camX;
    if (STRIP) { g.drawImage(STRIP, m * TS, 0, TS, STRIP_H, x, gy, TS, STRIP_H);
      if (isPit(c - 1)) { g.fillStyle = '#3a2416'; g.fillRect(x, gy + 3, 2, STRIP_H); g.fillStyle = '#1a1024'; g.fillRect(x, gy + 1, 1, STRIP_H); }
      if (isPit(c + 1)) { g.fillStyle = '#3a2416'; g.fillRect(x + TS - 2, gy + 3, 2, STRIP_H); g.fillStyle = '#1a1024'; g.fillRect(x + TS - 1, gy + 1, 1, STRIP_H); } }
    else g.drawImage(TILE, x, gy); }
  if (STRIP && part !== 'actors') { const k0 = Math.floor(camX / (80 * TS)) - 1; for (let k = k0; k <= k0 + 2; k++) FG_PROPS.forEach(([col, kind, v]) => { const x = (k * 80 + col) * TS + 8 - camX; if (x > -24 && x < W + 24) PXS.drawProp(g, kind, x, gy + 1, { v }); }); }
  if (part === 'ground') return;
  // the hero hops over pits (world column under its feet)
  const near = [0, 1, 2, 3].map(k => isPit(Math.floor((camX + 116 + (k - 1.5) * 12) / TS)) ? 1 : 0).reduce((a, b) => a + b, 0);
  const jy = near ? Math.round(Math.sin(Math.min(1, near / 4) * Math.PI / 2) * 18) : 0;
  g.fillStyle = 'rgba(10,8,20,0.35)'; if (!jy) g.fillRect(111, gy, 12, 1);
  drawHero(g, 110, gy - 16 - jy, t, CAM === 'pan' || Math.abs(S.vx) > 0.2);
}

function drawForeground(t, camX, camY) {
  if (!STRIP) return drawForegroundRaw(g, t, camX, camY);
  fgx.clearRect(0, 0, W, H); drawForegroundRaw(fgx, t, camX, camY, 'ground');
  const grade = fgGrade(); if (grade) { fgx.globalCompositeOperation = 'source-atop'; fgx.fillStyle = grade; fgx.fillRect(0, 0, W, H); fgx.globalCompositeOperation = 'source-over'; }
  g.drawImage(FG, 0, 0); drawForegroundRaw(g, t, camX, camY, 'actors');
}
/* ===== draw: the backdrop FIRST, then tiles and sprites ===== */
function draw() {
  const [cx, cy] = camPos(S.t);
  g.imageSmoothingEnabled = false;
  BG.draw(g, cx, cy);                      // replaces the old flat background, before anything else
  drawForeground(S.t, cx, cy);
  document.getElementById('status').textContent = 'Camera ' + (CAM === 'pan' ? 'auto-pan' : CAM) + ' · x ' + cx + (P.vertical > 0 ? ', y ' + cy : '') + (S.paused ? ' · paused' : '');
}

/* text state for critics and tools/sprites/statecheck.py (canvas px, feet). The hero is the pixel16 skin's lord (art looks right; the skin mirrors it for
   facing -1), drawn with heroFace(). The slime (static camera only) is a frontal blob. */
window.__state = () => { const gy = groundY(), st = CAM === 'static', a = actorRects()[0];
  const actors = [{ id: 'hero', x: st ? 98 : 116, y: a.y + a.h, facing: heroFace() > 0 ? 'right' : 'left', target: st ? 'slime' : null, vx: CAM === 'pan' ? 0.75 : CAM === 'manual' && Math.abs(S.vx) > 0.2 ? Math.round(S.vx * 100) / 100 : 0 }];
  if (st) actors.push({ id: 'slime', x: 221, y: gy + 31, facing: null, target: null, noFace: 'frontal art' });
  return { t: Math.round(S.t), cam: CAM, actors }; };

/* ===== loop + ?t=&freeze=1 ===== */
function run() {
  if (FREEZE_T !== null) { const n = Math.floor(FREEZE_T / STEP); for (let i = 0; i < n; i++) step(); }
  draw();
  if (FROZEN) { document.documentElement.dataset.frozen = '1'; return; }
  let last = performance.now(), acc = 0;
  const loop = now => { acc += Math.min(250, now - last); last = now; while (acc >= STEP) { step(); acc -= STEP; } draw(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

/* ===== UI ===== */
function syncURL() {
  const u = new URLSearchParams();
  u.set('theme', THEME); u.set('time', TIME); if (CAM !== 'pan') u.set('cam', CAM); if (SKIN_ID !== 'pixel16') u.set('skin', SKIN_ID);
  PARAMS.forEach(p => { if (P[p.key] !== p.default) u.set(p.key, P[p.key]); });
  history.replaceState(null, '', '?' + u.toString());
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
      inp.oninput = () => { P[p.key] = +inp.value; fill(); row.querySelector('output').textContent = fmt(P[p.key]); BG.setParams({ [p.key]: P[p.key] }); buildLayerStrip(); syncURL(); };
    } else {
      inp = document.createElement('div'); inp.className = 'seg';
      seg(inp, p.options, P[p.key], v => { P[p.key] = v; row.querySelector('output').textContent = v; BG.setParams({ [p.key]: v }); buildLayerStrip(); syncURL(); });
    }
    inp.setAttribute('aria-label', p.label); row.appendChild(inp); box.appendChild(row);
  });
}
function buildLayerStrip() {
  const box = document.getElementById('layers'); box.innerHTML = '';
  BG.layerImages().forEach(l => {
    if (!l.img) return;
    const d = document.createElement('div'); d.className = 'layer';
    const c = document.createElement('canvas'); c.width = Math.min(l.img.width, W); c.height = H; c.getContext('2d').drawImage(l.img, 0, 0);
    d.appendChild(c); d.insertAdjacentHTML('beforeend', `<b>${l.name}</b><span>${l.name === 'sky' || l.name === 'floor' ? 'fixed' : '×' + l.factor.toFixed(2)}</span>`);
    box.appendChild(d);
  });
}
function applyPreset(name) {
  const pr = PRESETS[name]; if (!pr) return;
  PARAMS.forEach(p => P[p.key] = p.default); Object.assign(P, pr.p); THEME = pr.theme; TIME = pr.time; CAM = pr.cam;
  document.getElementById('cam').value = CAM; S.camX = 0; S.camY = 0;
  makeBG(); buildParams(); seg(document.getElementById('themeseg'), THEMES, THEME, setThemeUI); seg(document.getElementById('timeseg'), TIMES, TIME, setTimeUI); syncURL();
}
function setThemeUI(v) { THEME = v; BG.setTheme(v); buildLayerStrip(); syncURL(); }
function setTimeUI(v) { TIME = v; BG.setTime(v); buildLayerStrip(); syncURL(); }
function fit() {
  const avail = Math.min(document.getElementById('stage').clientWidth - 12, 980), k = Math.max(1, Math.floor(avail / W));
  cv.style.width = W * k + 'px'; cv.style.height = H * k + 'px';
  document.getElementById('scaleinfo').textContent = `320×180 native · ${k}×`;
}
seg(document.getElementById('themeseg'), THEMES, THEME, setThemeUI);
seg(document.getElementById('timeseg'), TIMES, TIME, setTimeUI);
const presetSel = document.getElementById('preset');
presetSel.innerHTML = '<option value="">Choose…</option>' + Object.keys(PRESETS).map(n => `<option>${n}</option>`).join('');
presetSel.onchange = () => { applyPreset(presetSel.value); };
document.getElementById('cam').value = CAM;
document.getElementById('cam').onchange = e => { CAM = e.target.value; S.camX = camPos(S.t)[0]; syncURL(); };
document.querySelectorAll('#skinseg button').forEach(b => { b.setAttribute('aria-checked', b.dataset.skin === SKIN_ID); b.onclick = () => { SKIN_ID = b.dataset.skin; document.querySelectorAll('#skinseg button').forEach(c => c.setAttribute('aria-checked', c === b)); makeBG(); syncURL(); }; });
document.getElementById('reset').onclick = () => applyPreset('Side-scroller forest');
addEventListener('keydown', e => { if (e.key.startsWith('Arrow')) { if (CAM !== 'manual') { CAM = 'manual'; S.camX = camPos(S.t)[0]; document.getElementById('cam').value = 'manual'; } S.keys[e.key] = true; e.preventDefault(); } if (e.key === ' ') { S.paused = !S.paused; e.preventDefault(); } });
addEventListener('keyup', e => { S.keys[e.key] = false; });
addEventListener('resize', fit);
makeBG(); buildParams(); fit(); run();
