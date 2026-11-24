/* ===== C-14 demo: drives module/toasts.js (HD instance + two crisp 256x144 instances) ===== */
'use strict';
const VW = 640, VH = 360, STEP = 1000 / 60, LOOP = 14000, PXK = 0.4;
const qs = new URLSearchParams(location.search);
const PARAMS = [
  { key: 'edge', label: 'Edge', type: 'select', options: ['top-right', 'top-left', 'top', 'bottom-right', 'bottom-left', 'bottom'], default: 'top-right' },
  { key: 'max', label: 'Max on screen', type: 'range', min: 1, max: 5, step: 1, default: 3, unit: '' },
  { key: 'hold', label: 'Hold', type: 'range', min: 1200, max: 6000, step: 100, default: 2800, unit: 'ms' },
  { key: 'size', label: 'Text size (0 = auto)', type: 'range', min: 0, max: 24, step: 1, default: 0, unit: 'px' },
  { key: 'margin', label: 'Safe-area margin (0 = auto)', type: 'range', min: 0, max: 40, step: 1, default: 0, unit: 'px' },
  { key: 'enter', label: 'Enter', type: 'select', options: ['slide', 'pop', 'fade'], default: 'slide' },
  { key: 'theme', label: 'Theme', type: 'select', options: ['dusk', 'frost', 'ink'], default: 'dusk' },
  { key: 'merge', label: 'Merge duplicates', type: 'select', options: ['on', 'off'], default: 'on' },
  { key: 'progress', label: 'Timer line', type: 'select', options: ['on', 'off'], default: 'on' },
  { key: 'more', label: '“+N more” chip', type: 'select', options: ['on', 'off'], default: 'on' },
  { key: 'render', label: 'Render', type: 'select', options: ['auto', 'smooth', 'crisp'], default: 'auto' }
];
const P = {};
PARAMS.forEach(p => { P[p.key] = p.default; if (qs.has(p.key)) { const v = qs.get(p.key); P[p.key] = p.type === 'range' ? clamp(+v, p.min, p.max) : p.options.includes(v) ? v : p.default; } });
const FREEZE = qs.has('t') && qs.get('freeze') === '1', T0 = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : 0;
let AUTO = qs.get('auto') !== '0', SLOW = qs.get('slow') === '1', HUD = qs.get('hud') !== '0', SHOWR = qs.get('rects') === '1';
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
const lerp = (a, b, u) => a + (b - a) * u, easeInOut = u => (u = clamp(u, 0, 1), u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
function hash(a, b) { let h = Math.imul((a | 0) * 374761393 + (b | 0) * 668265263, 3266489917); h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
const UIFONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/* ---------- world: a dusk camp; the hero walks a scripted path and things happen ---------- */
const KIT = GameDNA_DemoKit;   // shared painted HD demo cast, props and backdrop (demo-kit/)
const WALK = 284, HY = 294, HERO_H = 90, PAN = 45;   // backdrop walk line, the hero's foot line (nearer the camera than the props), strip camera shift
/* layout: everything stands in x 190..445 and the two people keep their heads out of x 290..350, so no edge's stack (incl. the top-centre '+N more' chip) lands on a character */
const FIRE = { x: 218, y: 282, h: 52 }, GRAN = { x: 264, y: 285, h: 76 }, CRATE = { x: 410, y: 281, h: 36 }, LAMP = { x: 426, y: 252, h: 104 };
const HERBS = [{ x: 72, t: 1500 }, { x: 117, t: 2100 }, { x: 162, t: 2700 }];
const PATH = [[0, 22], [1400, 51], [1500, 54], [2000, 96], [2100, 99], [2600, 141], [2700, 144], [3400, 166], [4000, 166], [6100, 360], [9600, 360], [10300, 320], [11700, 320], [14000, 22]];   // ... stops by the herbalist when the quest completes
const S = { wt: 0, lt: 0, si: 0, fire: 0, chest: -1e9, stone: -1e9, picked: [], lv: 3, log: [], hx: PATH[0][1], gf: -1 };   // gf: the side the herbalist looks at (she watches the hero)
const hero = KIT.actor('sword', { h: HERO_H }), gran = KIT.actor('herbalist', { h: GRAN.h });
const SCRIPT = [
  [600, 'info', 'Whisperwood Vale', { label: 'New area', icon: 'star', text: 'Discovered' }],
  [1500, 'item', 'Moonherb', { icon: 'leaf' }], [1520, 'quest', 'Gather Moonherbs', { key: 'q-herbs', text: '1 / 5 collected', count: 0 }],
  [2100, 'item', 'Moonherb', { icon: 'leaf' }], [2120, 'quest', 'Gather Moonherbs', { key: 'q-herbs', text: '2 / 5 collected', count: 0 }],
  [2700, 'item', 'Moonherb', { icon: 'leaf' }], [2720, 'quest', 'Gather Moonherbs', { key: 'q-herbs', text: '3 / 5 collected', count: 0 }],
  [3600, 'achievement', 'First Light', { text: 'Stoke a campfire at night' }],
  [4700, 'level', 'Level 4', { text: 'Attack +2 · Max HP +10' }],
  [6200, 'item', 'Ember Shard', { rarity: 'rare' }], [6260, 'item', '+{n} Old Coins', { key: 'coins', count: 12, icon: 'coin', accent: '#ffd257' }],
  [6320, 'item', 'Wolf Pelt', { icon: 'pouch' }], [6380, 'item', 'Silver Key', { rarity: 'epic', icon: 'lock' }], [6440, 'item', '+{n} Old Coins', { key: 'coins', count: 8, icon: 'coin', accent: '#ffd257' }],
  [6500, 'item', 'Healing Tonic', { icon: 'potion' }],
  [8600, 'unlock', 'Fast travel: Old Mill', { text: 'You lit a waypost lantern' }],
  [9900, 'warning', 'Bag nearly full', { text: '18 / 20 slots used' }],
  [11400, 'quest', 'Gather Moonherbs', { key: 'q-herbs2', label: 'Quest complete', text: 'Return to the herbalist', icon: 'flag' }]
];

/* ---------- HUD rects (logical px) ---------- */
const HUDR = { panel: { x: 12, y: 12, w: 184, h: 54 }, map: { x: VW - 92, y: 12, w: 80, h: 80 }, bar: { x: VW / 2 - 132, y: VH - 46, w: 264, h: 36 } };
const uiRects = () => HUD ? [HUDR.panel, HUDR.map, HUDR.bar] : [];
const scaleR = (r, k) => ({ x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k });

/* ---------- module instances ---------- */
const TO = GameDNA_Toasts.create({ bounds: { x: 0, y: 0, w: VW, h: VH }, uiRects, params: P,
  debug: qs.get('debug') === '1' ? e => (window.__toLog = window.__toLog || []).push(Object.assign({ wt: Math.round(S.wt) }, e)) : null });
const STRIP = qs.get('strip') !== '0';
const NOOP = { push() {}, update() {}, draw() {}, setParams() {}, clear() {} };
const pxParams = extra => Object.assign({}, P, { size: 0, margin: 0, render: 'crisp' }, extra);
const TP = !STRIP ? NOOP : GameDNA_Toasts.create({ bounds: { x: 0, y: 0, w: 256, h: 144 }, uiRects: () => uiRects().map(r => scaleR(r, PXK)), params: pxParams({}) });
const TP2 = !STRIP ? NOOP : GameDNA_Toasts.create({ bounds: { x: 0, y: 0, w: 256, h: 144 }, uiRects: () => uiRects().map(r => scaleR(r, PXK)), params: pxParams({ edge: 'bottom-left', theme: 'frost' }) });
const ALL = [TO, TP, TP2];
function push(kind, title, o) { for (const m of ALL) m.push(kind, title, Object.assign({}, o)); S.log.push([Math.round(S.wt), kind, title]); }

/* ---------- stepping ---------- */
const walkEase = u => { const r = 0.18, v = 1 / (1 - r); u = clamp(u, 0, 1); return u < r ? v * u * u / (2 * r) : u > 1 - r ? 1 - v * (1 - u) * (1 - u) / (2 * r) : v * (u - r / 2); };   // short ramps, steady pace between
function heroX(lt) { for (let i = 1; i < PATH.length; i++) if (lt <= PATH[i][0]) { const a = PATH[i - 1], b = PATH[i]; return lerp(a[1], b[1], walkEase((lt - a[0]) / (b[0] - a[0]))); } return PATH[0][1]; }
function stepWorld() {
  S.wt += STEP;
  if (AUTO) {
    S.lt += STEP;
    if (S.lt >= LOOP) { S.lt -= LOOP; S.si = 0; S.picked = []; S.fire = 0; S.chest = -1e9; S.stone = -1e9; }
    while (S.si < SCRIPT.length && S.lt >= SCRIPT[S.si][0]) { const s = SCRIPT[S.si++]; push(s[1], s[2], s[3]); }
    HERBS.forEach((h, i) => { if (S.lt >= h.t && !S.picked.includes(i)) S.picked.push(i); });
    if (S.lt >= 3600 && !S.fire) S.fire = S.wt;
    if (S.lt >= 6200 && S.chest < 0) S.chest = S.wt;
    if (S.lt >= 8600 && S.stone < 0) S.stone = S.wt;
  }
  S.hx = heroX(S.lt);
  hero.walk(AUTO ? (heroX(S.lt + STEP) - S.hx) / STEP * 1000 : 0); hero.update(STEP);
  if (Math.abs(S.hx - GRAN.x) > 14) S.gf = S.hx > GRAN.x ? 1 : -1;   // the herbalist turns to the hero once he is clearly on her other side (he hands the quest in from her right)
  gran.update(STEP, { facing: S.gf });   // in the fixed step: frozen frames equal live play
  for (const m of ALL) m.update(STEP);
}

/* ---------- drawing the HD scene ---------- */
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function glowAt(g, x, y, r, col, a) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
function herb(g, x, y, p) {   // a small glowing moonherb
  glowAt(g, x, y - 11, 20, '150,230,255', 0.3 * p);
  g.save(); g.translate(x, y); g.lineJoin = g.lineCap = 'round'; g.lineWidth = 0.9;
  const leaf = (ang, len, w, c1, c2) => { g.save(); g.rotate(ang); const lg = g.createLinearGradient(0, 0, 0, -len); lg.addColorStop(0, c2); lg.addColorStop(1, c1); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(w, -len * 0.5, 0, -len); g.quadraticCurveTo(-w, -len * 0.55, 0, 0); g.fillStyle = lg; g.strokeStyle = '#173730'; g.fill(); g.stroke(); g.restore(); };
  leaf(-0.95, 11, 3.8, '#7fd6a0', '#2c7558'); leaf(0.9, 10, 3.6, '#6cc894', '#27694f'); leaf(-0.3, 15, 3.4, '#93e2b4', '#317f63'); leaf(0.32, 13, 3.2, '#7fd6a0', '#2c7558');
  for (const [bx, by, br] of [[-4.5, -15.5, 2.9], [4, -13, 2.5], [0.5, -18.5, 3.1]]) { const bg = g.createRadialGradient(bx - 0.8, by - 0.8, 0.2, bx, by, br); bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.6, '#cfefff'); bg.addColorStop(1, '#86bfee'); g.fillStyle = bg; g.strokeStyle = '#2f5d86'; g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill(); g.stroke(); }
  g.restore();
}
function drawScene(g, cam, flip) {   // cam / flip: only the small pixel canvases use them (see render)
  const t = S.wt, lit = S.fire ? clamp((t - S.fire) / 500, 0, 1) : 0, fx = FIRE.x, fy = FIRE.y - FIRE.h * 0.3;
  g.save(); if (flip) { g.translate(VW, 0); g.scale(-1, 1); } g.translate(-(cam || 0), 0);
  // painted backdrop (demo kit), cooled and darkened into night
  KIT.backdrop(g, 'meadow-dusk', { x: -PAN, y: 0, w: VW + 2 * PAN, h: VH, groundY: WALK });
  g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#8f86c6'; g.fillRect(-PAN, 0, VW + 2 * PAN, VH); g.restore();
  // warm pool of light on the road around the campfire (bigger once stoked)
  g.save(); g.globalCompositeOperation = 'lighter'; g.translate(fx, WALK + 4); g.scale(1, 0.3); glowAt(g, 0, 0, 110 + 110 * lit, '255,150,70', 0.2 + 0.22 * lit); g.restore();
  // waypost lantern
  const wake = S.stone > 0 ? clamp((t - S.stone) / 600, 0, 1) : 0, lx = LAMP.x + LAMP.h * 0.14, ly = LAMP.y - LAMP.h * 0.775;
  KIT.sprite(g, 'lamp', LAMP.x, LAMP.y, { h: LAMP.h });
  KIT.flame(g, lx, ly, 13 + 15 * wake, t + 900);
  if (wake) { g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, lx, ly, 34 + 30 * wake, '190,140,255', 0.5 * wake * (1 - 0.5 * clamp((t - S.stone - 900) / 2500, 0, 1))); g.restore(); }
  // supply crates (the loot cache)
  const open = S.chest > 0 ? clamp((t - S.chest) / 300, 0, 1) : 0;
  KIT.sprite(g, 'crates', CRATE.x, CRATE.y, { h: CRATE.h });
  if (open) { g.save(); g.globalCompositeOperation = 'lighter'; glowAt(g, CRATE.x, CRATE.y - CRATE.h * 0.55, 46, '255,214,120', 0.5 * open * (1 - clamp((t - S.chest - 900) / 2000, 0, 0.75))); g.restore(); }
  // campfire, its sparks, the herbalist warming herself
  KIT.sprite(g, 'campfire', fx, FIRE.y, { h: FIRE.h });
  KIT.flame(g, fx, fy, 16 + 30 * lit, t);
  if (S.fire) for (let i = 0; i < 10; i++) { const ph = ((t / 1300 + hash(i, 4)) % 1), x = fx + Math.sin(ph * 6 + i) * 8, y = fy - 6 - ph * 66; g.fillStyle = `rgba(255,200,120,${(1 - ph).toFixed(3)})`; g.fillRect(x, y, 1.6, 1.6); }
  gran.draw(g, GRAN.x, GRAN.y, { h: GRAN.h, facing: S.gf });
  // moonherbs, then the hero on the nearer foot line
  HERBS.forEach((h, i) => { if (!S.picked.includes(i)) herb(g, h.x, HY - 5, 0.6 + 0.4 * Math.sin(t / 300 + i)); });
  hero.draw(g, S.hx, HY, { h: HERO_H });
  // night falls off away from the fire; fireflies
  const ng = g.createRadialGradient(fx, fy, 30, fx, fy, 230 + 110 * lit); ng.addColorStop(0, '#ffffff'); ng.addColorStop(0.25, '#f3e6e0'); ng.addColorStop(1, '#8e88c4');
  g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = ng; g.fillRect(-PAN, 0, VW + 2 * PAN, VH); g.restore();
  for (let i = 0; i < 18; i++) { const x = (hash(i, 21) * VW + Math.sin(t / 900 + i) * 20 + VW) % VW, y = 196 + hash(i, 22) * 104 + Math.cos(t / 700 + i * 2) * 8, a = 0.4 + 0.6 * Math.max(0, Math.sin(t / 400 + i * 1.7)); glowAt(g, x, y, 6, '210,255,150', 0.35 * a); }
  g.restore();
  const vg = g.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VW * 0.65); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(4,2,12,0.5)'); g.fillStyle = vg; g.fillRect(0, 0, VW, VH);
}
function drawHUD(g, flip) {
  if (!HUD) return;
  const t = S.wt, pnl = HUDR.panel, mp = HUDR.map, bar = HUDR.bar;
  g.fillStyle = 'rgba(14,12,24,0.72)'; rr(g, pnl.x, pnl.y, pnl.w, pnl.h, 12); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1; g.stroke();
  const pg = g.createLinearGradient(0, pnl.y + 8, 0, pnl.y + 46); pg.addColorStop(0, '#5aa8c8'); pg.addColorStop(1, '#2a5a7a'); g.fillStyle = pg; g.beginPath(); g.arc(pnl.x + 27, pnl.y + 27, 19, 0, Math.PI * 2); g.fill();
  const cut = KIT.cutout(); g.save(); g.beginPath(); g.arc(pnl.x + 27, pnl.y + 27, 18, 0, Math.PI * 2); g.clip();   // portrait: the hero's own head
  if (!(cut && cut.drawHead(g, 'sword', pnl.x + 27, pnl.y + 29, 13))) { g.fillStyle = '#f0d0b0'; g.beginPath(); g.arc(pnl.x + 27, pnl.y + 25, 8, 0, Math.PI * 2); g.fill(); }
  g.restore();
  g.fillStyle = '#ffc56a'; g.font = '800 10px ' + UIFONT; g.textAlign = 'center'; g.textBaseline = 'middle'; const lv = S.lt >= 4700 ? 4 : 3; rr(g, pnl.x + 34, pnl.y + 36, 18, 13, 6); g.fill(); g.fillStyle = '#20140a'; g.fillText(String(lv), pnl.x + 43, pnl.y + 43);
  const bars = [['#ff6a6a', '#c0303a', 0.82], ['#6ab8ff', '#2a68c0', 0.6]];
  bars.forEach(([a, b, f], i) => { const y = pnl.y + 15 + i * 16; g.fillStyle = 'rgba(0,0,0,0.5)'; rr(g, pnl.x + 54, y, 118, 8, 4); g.fill(); const bg = g.createLinearGradient(0, y, 0, y + 8); bg.addColorStop(0, a); bg.addColorStop(1, b); g.fillStyle = bg; rr(g, pnl.x + 54, y, 118 * f, 8, 4); g.fill(); });
  // minimap
  const mx = mp.x + mp.w / 2, my = mp.y + mp.h / 2;
  g.save(); g.beginPath(); g.arc(mx, my, 36, 0, Math.PI * 2); g.fillStyle = 'rgba(16,24,26,0.85)'; g.fill(); g.clip();
  g.fillStyle = '#2f4a3a'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(mp.x + hash(i, 41) * mp.w, mp.y + hash(i, 42) * mp.h, 6 + hash(i, 43) * 9, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(214,180,140,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(mp.x, my + 8); g.quadraticCurveTo(mx, my - 4, mp.x + mp.w, my + 4); g.stroke(); g.restore();
  g.strokeStyle = 'rgba(255,230,190,0.45)'; g.lineWidth = 2; g.beginPath(); g.arc(mx, my, 36, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#ffd66a'; g.beginPath(); const px = mp.x + (flip ? 1 - S.hx / VW : S.hx / VW) * mp.w; g.moveTo(px, my - 4); g.lineTo(px + 4, my + 4); g.lineTo(px - 4, my + 4); g.fill();
  g.fillStyle = '#f4ecd8'; g.font = '700 9px ' + UIFONT; g.textAlign = 'center'; g.fillText('N', mx, mp.y + 8);
  // hotbar
  g.fillStyle = 'rgba(14,12,24,0.72)'; rr(g, bar.x, bar.y, bar.w, bar.h, 10); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.1)'; g.stroke();
  const cols = ['#ff7a6a', '#6ab8ff', '#7fe39a', '#ffd257', '#c48bff', '#a9b7d6'];
  for (let i = 0; i < 6; i++) { const x = bar.x + 8 + i * 42.5, y = bar.y + 5; g.fillStyle = 'rgba(255,255,255,0.06)'; rr(g, x, y, 36, 26, 6); g.fill(); g.fillStyle = cols[i]; g.globalAlpha = 0.8; g.beginPath(); g.arc(x + 18, y + 13, 6, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = '700 8px ' + UIFONT; g.textAlign = 'left'; g.fillText(String(i + 1), x + 3, y + 6); }
}
function drawRects(g, k) {
  if (!SHOWR) return;
  g.save(); g.setLineDash([4 * k, 3 * k]); g.lineWidth = Math.max(1, k); g.strokeStyle = '#ff5ad0';
  for (const r of uiRects()) g.strokeRect(r.x * k + 0.5, r.y * k + 0.5, r.w * k - 1, r.h * k - 1);
  g.restore();
}

/* ---------- canvases ---------- */
const cv = document.getElementById('game'), g = cv.getContext('2d');
const cvP = document.getElementById('px'), gP = cvP.getContext('2d'), cvP2 = document.getElementById('px2'), gP2 = cvP2.getContext('2d');
function fit() { const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, w = Math.max(VW, Math.round(r.width * dpr)); if (cv.width !== w) { cv.width = w; cv.height = Math.round(w * VH / VW); } }
function render() {
  fit();
  const k = cv.width / VW;
  g.setTransform(k, 0, 0, k, 0, 0);
  drawScene(g); drawHUD(g); TO.draw(g); drawRects(g, 1);
  if (!STRIP) document.querySelector('.cmp').hidden = true;
  else for (const [gg, mod, edge] of [[gP, TP, P.edge], [gP2, TP2, 'bottom-left']]) {   // cards are far larger on the small canvases: show the camp from the side away from their stack
    const flip = /left/.test(edge), cam = flip || /right/.test(edge) ? PAN : 0;
    gg.setTransform(1, 0, 0, 1, 0, 0); gg.imageSmoothingEnabled = false; gg.clearRect(0, 0, 256, 144);
    gg.save(); gg.scale(PXK, PXK); drawScene(gg, cam, flip); drawHUD(gg, flip); gg.restore(); mod.draw(gg); drawRects(gg, PXK);
  }
  document.documentElement.dataset.t = Math.round(S.wt);
}

/* ---------- controls ---------- */
function buildParams() {
  const box = document.getElementById('params'); box.innerHTML = '';
  for (const p of PARAMS) {
    const row = document.createElement('div'); row.className = 'row';
    if (p.type === 'range') {
      row.innerHTML = `<label for="p-${p.key}">${p.label}<output id="o-${p.key}"></output></label><input type="range" id="p-${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${P[p.key]}">`;
      const inp = row.querySelector('input'), out = row.querySelector('output');
      const show = () => { out.textContent = (p.key === 'size' || p.key === 'margin') && +inp.value === 0 ? 'auto' : inp.value + (p.unit ? ' ' + p.unit : ''); inp.style.setProperty('--fill', ((inp.value - p.min) / (p.max - p.min) * 100) + '%'); };
      inp.addEventListener('input', () => { P[p.key] = +inp.value; apply(); show(); }); show();
    } else {
      row.innerHTML = `<label>${p.label}</label><div class="seg${p.options.length > 3 ? ' wrap' : ''}" role="radiogroup">${p.options.map(o => `<button type="button" role="radio" data-v="${o}" aria-checked="${o === P[p.key]}">${o}</button>`).join('')}</div>`;
      row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { P[p.key] = b.dataset.v; row.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); apply(); }));
    }
    box.appendChild(row);
  }
}
let manualN = 0;
const MANUAL = {
  achievement: () => push('achievement', ['Night Owl', 'Light Footed', 'Lore Seeker', 'Steady Hand'][manualN % 4], { text: 'Hidden achievement' }),
  quest: () => push('quest', 'Gather Moonherbs', { key: 'q-herbs', text: Math.min(5, 3 + manualN % 3) + ' / 5 collected', count: 0 }),
  item: () => push('item', 'Moonherb', { icon: 'leaf' }),
  burst: () => { push('item', 'Ember Shard', { rarity: 'rare' }); push('item', '+{n} Old Coins', { key: 'coins', count: 5, icon: 'coin', accent: '#ffd257' }); push('item', 'Wolf Pelt', { icon: 'pouch' }); push('item', 'Iron Sword', { rarity: 'uncommon', icon: 'sword' }); push('item', 'Starglass Lens', { rarity: 'legendary', icon: 'star' }); push('item', '+{n} Old Coins', { key: 'coins', count: 7, icon: 'coin', accent: '#ffd257' }); },
  unlock: () => push('unlock', ['Fast travel: Old Mill', 'New recipe: Herb Tea', 'Skill: Second Wind'][manualN % 3], { text: 'Now available' }),
  level: () => push('level', 'Level ' + (4 + manualN % 6), { text: 'Attack +2 · Max HP +10' }),
  info: () => push('info', 'Autosaved', { icon: 'info' }),
  warning: () => push('warning', 'Torch burning low', { text: '30 s of light left' }),
  clear: () => ALL.forEach(m => m.clear())
};
function buildControls() {
  buildParams();
  document.querySelectorAll('[data-fire]').forEach(b => b.addEventListener('click', () => { MANUAL[b.dataset.fire](); manualN++; }));
  const tog = (id, get, set, on, off) => { const b = document.getElementById(id); const sync = () => { b.setAttribute('aria-pressed', get()); b.textContent = get() ? on : off; }; b.addEventListener('click', () => { set(!get()); sync(); }); sync(); };
  tog('auto', () => AUTO, v => AUTO = v, 'Script: on', 'Script: off');
  tog('slow', () => SLOW, v => SLOW = v, 'Speed: ¼', 'Speed: 1×');
  tog('hud', () => HUD, v => HUD = v, 'HUD: on', 'HUD: off');
  tog('rects', () => SHOWR, v => SHOWR = v, 'Avoid rects: shown', 'Avoid rects: hidden');
  document.getElementById('reset').addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); buildParams(); apply(); });
}
function apply() { TO.setParams(P); TP.setParams(pxParams({})); TP2.setParams(pxParams({ edge: 'bottom-left', theme: 'frost' })); }

/* ---------- loop ---------- */
buildControls();
KIT.ready(() => {   // the cast is drawn from decoded art: fast-forward and first paint wait for it
  for (let n = Math.floor(T0 / STEP); n > 0; n--) stepWorld();
  if (FREEZE) { render(); document.documentElement.dataset.frozen = '1'; }
  else {
    let last = performance.now(), acc = 0;
    const loop = now => { acc += Math.min(250, now - last) * (SLOW ? 0.25 : 1); last = now; while (acc >= STEP) { stepWorld(); acc -= STEP; } render(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    addEventListener('keydown', e => { const k = { '1': 'achievement', '2': 'quest', '3': 'item', '4': 'burst', '5': 'unlock', '6': 'level', '7': 'warning' }[e.key]; if (k) { MANUAL[k](); manualN++; } });
  }
});
window.__toasts = { S, TO, TP, TP2, P, hero, gran };
/* text state for critics and tools/sprites/statecheck.py (640x360 stage px, feet): the hero walks the scripted path (faces his move direction; when he
   stops beside the herbalist he faces her), the herbalist by the fire watches him. Fire, crates, lamp and herbs are props. */
window.__state = () => { const vx = AUTO ? (heroX(S.lt + STEP) - S.hx) / STEP * 1000 : 0, moving = Math.abs(vx) > 1, dir = f => f > 0 ? 'right' : 'left';
  return { t: Math.round(S.wt), actors: [
    { id: 'hero', x: Math.round(S.hx), y: HY, facing: dir(hero.facing), target: !moving && Math.abs(S.hx - GRAN.x) < 60 ? 'herbalist' : null, vx: moving ? +vx.toFixed(1) : 0, asset: 'sword' },
    { id: 'herbalist', x: GRAN.x, y: GRAN.y, facing: dir(S.gf), target: 'hero', asset: 'herbalist' }] }; };
