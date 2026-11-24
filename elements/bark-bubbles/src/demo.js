/* ===== H-05 demo: drives module/bark-bubbles.js on a painted HD village square at dusk (640x360 logical, dpr-aware) and a 384x216 native pixel strip ===== */
'use strict';
const VW = 640, VH = 360, WW = 1040, STEP = 1000 / 60, LOOP = 16000;
const qs = new URLSearchParams(location.search);
const PARAMS = [
  { key: 'size', label: 'Text size (0 = auto)', type: 'range', min: 0, max: 28, step: 1, default: 0, unit: 'px' },
  { key: 'width', label: 'Line width', type: 'range', min: 8, max: 40, step: 1, default: 20, unit: 'ch' },
  { key: 'cps', label: 'Typing speed (0 = instant)', type: 'range', min: 0, max: 120, step: 5, default: 45, unit: '/s' },
  { key: 'read', label: 'Reading time', type: 'range', min: 20, max: 120, step: 5, default: 55, unit: 'ms/ch' },
  { key: 'hold', label: 'Minimum hold', type: 'range', min: 600, max: 4000, step: 100, default: 1500, unit: 'ms' },
  { key: 'max', label: 'Max on screen (0 = auto)', type: 'range', min: 0, max: 8, step: 1, default: 0, unit: '' },
  { key: 'cooldown', label: 'Same-event cooldown', type: 'range', min: 0, max: 15000, step: 500, default: 4000, unit: 'ms' },
  { key: 'stagger', label: 'Crowd stagger (one voice per event)', type: 'range', min: 0, max: 2000, step: 50, default: 600, unit: 'ms' },
  { key: 'pop', label: 'Pop (overshoot)', type: 'range', min: 0, max: 1.5, step: 0.05, default: 0.5, unit: '' },
  { key: 'idle', label: 'Idle chatter (script off)', type: 'range', min: 0, max: 12000, step: 500, default: 7000, unit: 'ms' },
  { key: 'palette', label: 'Palette', type: 'select', options: ['light', 'dark', 'parchment'], default: 'light' },
  { key: 'render', label: 'Render', type: 'select', options: ['auto', 'smooth', 'crisp'], default: 'auto' },
  { key: 'edge', label: 'Speaker off screen', type: 'select', options: ['pointer', 'hide'], default: 'pointer' }
];
const VARIANTS = [
  ['Modern action RPG', { cps: 45, palette: 'light', pop: 0.5 }], ['Night / dark UI', { palette: 'dark' }], ['Storybook', { palette: 'parchment', cps: 30, read: 70 }],
  ['Busy town', { idle: 3500, max: 5, width: 16 }], ['Pixel host', { render: 'crisp', size: 8 }], ['Instant, terse', { cps: 0, hold: 1000, read: 40 }]
];
const P = {};
PARAMS.forEach(p => { P[p.key] = p.default; if (qs.has(p.key)) { const v = qs.get(p.key); P[p.key] = p.type === 'range' ? clamp(+v || 0, p.min, p.max) : p.options.includes(v) ? v : p.default; } });
const FREEZE = qs.has('t') && qs.get('freeze') === '1', T0 = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : 0;
let SCRIPT_ON = qs.get('script') !== '0', WINDOW_ON = qs.get('window') === '1';
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
const lerp = (a, b, u) => a + (b - a) * u, smooth = u => (u = clamp(u, 0, 1), u * u * (3 - 2 * u));
function hash(a, b) { let h = Math.imul((a | 0) * 374761393 + (b | 0) * 668265263, 3266489917); h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function track(keys, t) { if (t <= keys[0][0]) return keys[0].slice(1); for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const a = keys[i - 1], b = keys[i], u = smooth((t - a[0]) / (b[0] - a[0])); return a.slice(1).map((v, k) => lerp(v, b[k + 1], u)); } return keys[keys.length - 1].slice(1); }

/* ---------- cast (world px; x = feet centre, y = feet) ---------- */
const CAST = [
  { id: 'hero', name: 'Wren', voice: 'hero', kind: 'person',
    path: [[0, 330, 262], [2600, 560, 232], [4000, 690, 214], [6750, 692, 212], [6950, 676, 224], [7300, 684, 218], [10000, 700, 214], [11000, 690, 226], [13600, 690, 226], [15600, 330, 262], [16000, 330, 262]] },
  { id: 'guard', name: 'Guard', voice: 'guard', kind: 'guard', path: [[0, 842, 186]] },
  { id: 'merchant', name: 'Herbalist', voice: 'merchant', kind: 'merchant', path: [[0, 186, 190]] },
  { id: 'tamsin', name: 'Tamsin', voice: 'villager', kind: 'villager',
    path: [[0, 250, 318], [3000, 420, 314], [6000, 390, 322], [9600, 40, 304], [12200, -110, 300], [14200, 160, 314], [16000, 250, 318]] },
  { id: 'bram', name: 'Old Bram', voice: 'elder', kind: 'elder', path: [[0, 552, 276]] },
  { id: 'slime-1', name: 'Jelly', voice: 'critter', kind: 'slime',
    path: [[0, 1010, 150], [5600, 790, 128], [6700, 716, 196], [7000, 744, 176], [8200, 772, 150], [10000, 790, 204], [12500, 900, 210], [15000, 1000, 152], [16000, 1010, 150]] },
  { id: 'slime-2', name: 'Teal jelly', voice: 'critter', kind: 'slime',
    path: [[0, 1040, 176], [6000, 800, 138], [11000, 786, 130], [13200, 786, 130], [15000, 1030, 176], [16000, 1040, 176]] }
];
const C = id => CAST.find(c => c.id === id);
const CAM = [[0, 0], [3000, 0], [5300, 300], [9000, 400], [13400, 400], [15500, 0], [16000, 0]];
const LINES = { elder: { idle: ['In my day, jellies were polite.', "The well's humming again.", 'Sit a while, young one.'], greet: ['Ah, a fresh face.'],
  hurt: ['My back!'], spotted: ['Eh? Who is that?'], wonder: ['Where did I leave my pipe?'], secret: ['The mill key is under the bell.'], taunt: ['Off with you, goo!'] },
  hero: { taunt: ['Back off, goo!'], secret: ['Keep this between us.'], wonder: ['Which way to the old mill?'] }, guard: { taunt: ['Stand fast!'], secret: ['Captain sleeps on duty.'], wonder: ['Was that a cat?'] },
  merchant: { secret: ['Psst... rare goods, cheap.'], wonder: ['Did I lock the cellar?'], taunt: ['No haggling!'], lost: ['Customers, come back!'] },
  villager: { idle: ['Have you seen my cat?', 'Lovely weather today.', 'Mind the geese.'], secret: ['I hid the pie in the well.'], wonder: ['Was it left at the bakery?'], taunt: ['Shoo, shoo!'] },
  critter: { secret: ['...blub blub'], wonder: ['Blub?'], taunt: ['BLORP!'] } };
const SCRIPT = [
  [400, 'merchant', 'Fresh stock today!', 'talk'],
  [1100, 'tamsin', 'Have you seen my cat?', 'talk'],
  [2200, 'bram', "The well's humming again.", 'talk'],
  [3300, 'guard', 'Halt! Who goes there?', 'alarm'],
  [4300, 'hero', 'Just passing through.', 'talk'],
  [5100, 'guard', 'Move along, then.', 'talk'],
  [5900, 'slime-1', 'Blorp!', 'alarm'], [6100, 'slime-2', 'Blorp!', 'alarm'],
  [6820, 'hero', 'Oof!', 'hurt'],
  [7950, 'hero', 'Back off, goo!', 'shout'],
  [8350, 'slime-1', 'Splut!', 'hurt'],
  [8700, 'tamsin', 'Kitty, come back!', 'talk'],
  [9500, 'merchant', 'Psst... rare goods, cheap.', 'whisper'],
  [10500, 'hero', 'Which way to the old mill?', 'think'],
  [11900, 'guard', 'Gate closes at dusk.', 'talk'], [11950, 'bram', 'In my day, jellies were polite.', 'talk'], [12000, 'hero', 'Noted.', 'talk'], [12050, 'slime-2', '...blub', 'talk']
];

/* ---------- art: painted Lanternwood set (L-00 lock). Everything the scene draws is in demo/assets/ (the L-00 / L-06 files are vendored copies),
   so the demo runs from this element's folder alone; the pixel strip's props come from tools/pixelize.py, its cast from pixelcast.js ---------- */
const OWN = 'assets/';
const ART = {
  ground: 'art/ground.webp', patch: 'art/patch.webp', oak: 'art/oak.webp', well: 'art/well.webp', lamp: 'art/lamppost.webp',
  hero: 'art/walk-keeper.webp', merchant: 'art/herbalist.webp', guard: 'art/guard.webp', bram: 'art/elder.webp', tamsin: 'art/walk-girl.webp',
  'slime-1': 'art/jelly-amber.webp', 'slime-2': 'art/jelly-teal.webp', stall: 'art/stall.webp', gate: 'art/gate.webp',
  frameS: 'art/frame-small.webp', frameW: 'art/frame-window.webp', atlas: 'pixel/atlas.png'
};
// walk sheets: 5 equal cells in a row (idle, then a 4-pose walk cycle); ax = where the body centre sits in a cell
const SHEET = { hero: { n: 5, ax: 0.5218 }, tamsin: { n: 5, ax: 0.5797 } };
const IMG = {}, MISSING = [];
const artReady = Promise.all(Object.keys(ART).map(k => new Promise(res => { const im = new Image(); im.onload = () => { IMG[k] = im; res(); }; im.onerror = () => { MISSING.push(ART[k]); res(); }; im.src = OWN + ART[k]; })));
const ATLAS = window.BARK_PIXEL_ATLAS || {};
// static props (world px; x = foot centre, y = foot line; h = drawn height). lit: lantern position as a fraction of the drawn box from the foot point
const PROPS = [
  { k: 'gate', x: 842, y: 104, h: 112, lit: [-0.33, -0.5], r: 120 },
  { k: 'stall', x: 104, y: 176, h: 108, lit: [0.2, -0.56], r: 120 },
  { k: 'well', x: 480, y: 222, h: 96, lit: [-0.26, -0.68], r: 110 },
  { k: 'lamp', x: 236, y: 266, h: 104, lit: [-0.3, -0.6], r: 150 },
  { k: 'lamp', x: 626, y: 338, h: 104, lit: [-0.3, -0.6], r: 150, flip: true },
  { k: 'lamp', x: 986, y: 236, h: 104, lit: [-0.3, -0.6], r: 140 },
  { k: 'oak', x: 34, y: 86, h: 168 }, { k: 'oak', x: 262, y: 64, h: 150, flip: true }, { k: 'oak', x: 452, y: 40, h: 140 }, { k: 'oak', x: 634, y: 70, h: 160, flip: true },
  { k: 'oak', x: 1012, y: 96, h: 170 }, { k: 'oak', x: 16, y: 262, h: 150, flip: true }, { k: 'oak', x: 1024, y: 372, h: 170, flip: true }, { k: 'oak', x: 820, y: 420, h: 150, flip: true }
];
// cobble patches under the square and along the lane to the gate: [x, y (foot), h, flip]
// the cobbled lane: blobs along a few polylines (radius varies with a hash) make one irregular outline; the cobble patch is tiled inside it
const LANE = [];
(function () {
  const run = (pts, r, seed) => { for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 7));
    for (let i = 0; i <= n; i++) { const u = i / n, q = LANE.length + seed, w = 0.5 + 0.5 * Math.sin(q * 0.55) * Math.sin(q * 0.17 + 1);
      LANE.push([a[0] + (b[0] - a[0]) * u + (hash(q, 1) - 0.5) * 8, a[1] + (b[1] - a[1]) * u + (hash(q, 2) - 0.5) * 8, r * (0.78 + 0.3 * w + 0.16 * hash(q, 3))]); } } };
  run([[842, 100], [846, 150], [838, 196], [790, 232], [700, 250], [600, 256]], 27, 3);        // gate lane
  run([[600, 258], [520, 262], [440, 258], [360, 262]], 40, 40);                              // the square around the well
  run([[360, 262], [290, 250], [226, 232], [160, 212], [112, 196]], 25, 90);                 // to the stall
  run([[330, 290], [250, 306], [150, 308], [40, 302], [-30, 300]], 19, 130);                 // west lane
  [[486, 236, 46], [560, 280, 38], [430, 288, 30], [846, 120, 34]].forEach(b => LANE.push(b));
})();
const DRAW_H = { hero: 58, guard: 68, merchant: 58, tamsin: 52, bram: 54, 'slime-1': 27, 'slime-2': 27 };
const FACE = { hero: 1, guard: -1, merchant: 1, tamsin: -1, bram: 1, 'slime-1': 1, 'slime-2': 1 };   // which way each picture looks (1 = right)

/* ---------- canvases ---------- */
const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const pcv = document.getElementById('pixel'), pctx = pcv.getContext('2d');
const PW = 384, PH = 216, K = 0.6;
const S = { t: 0, lt: 0, si: 0, cam: 0, flash: {}, who: 'hero', pos: {}, dir: {}, dist: {} };
const HUD = [{ x: 10, y: 10, w: 168, h: 44 }, { x: VW - 208, y: 10, w: 198, h: 30 }];
const WIN = { x: 40, y: 262, w: 560, h: 88 };
function uiRects() { return WINDOW_ON ? HUD.concat([WIN]) : HUD; }
function where(c) { const p = S.pos[c.id]; return p || { x: c.path[0][1], y: c.path[0][2] }; }
function ratio(k) { const im = IMG[k]; return im ? im.width / (SHEET[k] ? SHEET[k].n : 1) / im.height : 0.5; }
function sprite(c) { const p = where(c), h = DRAW_H[c.id], w = Math.min(h * ratio(c.id) * (SHEET[c.id] ? 0.8 : 1), 30); return { x: p.x - w / 2 - S.cam, y: p.y - h, w, h: h + 2 }; }

const barks = GameDNA_BarkBubbles.create({
  bounds: { x: 0, y: 0, w: VW, h: VH },
  getAnchor: id => { const c = C(id); if (!c) return null; const r = sprite(c); return { x: r.x + r.w / 2, top: r.y + (c.kind === 'slime' ? 5 : 2), w: r.w, h: r.h }; },
  getObstacles: () => CAST.map(c => Object.assign(sprite(c), { id: c.id })).concat(uiRects()),
  speakers: () => SCRIPT_ON ? [] : CAST.map(c => ({ id: c.id, voice: c.voice })),
  lines: LINES,
  params: Object.assign({}, P)
});
// the pixel strip: the same cast at 0.6 scale on a 384x216 native canvas (crisp mode is picked by the module itself)
const PBOX = { hero: [16, 33], merchant: [20, 32], guard: [18, 33], bram: [16, 33], tamsin: [16, 31], 'slime-1': [20, 13], 'slime-2': [20, 13] };   // drawn size of each authored pixel sprite
function pSprite(c) { const p = where(c), w = PBOX[c.id][0], h = PBOX[c.id][1]; return { x: Math.round(p.x * K - S.cam * K) - w / 2, y: Math.round(p.y * K) - h, w, h }; }
const pbarks = GameDNA_BarkBubbles.create({
  bounds: { x: 0, y: 0, w: PW, h: PH },
  getAnchor: id => { const c = C(id); if (!c) return null; const r = pSprite(c); return { x: Math.round(r.x + r.w / 2), top: r.y + (c.kind === 'slime' ? 2 : 0), w: r.w, h: r.h }; },
  getObstacles: () => CAST.map(c => Object.assign(pSprite(c), { id: c.id })).concat([{ x: 5, y: 5, w: 92, h: 24 }]),
  lines: LINES,
  params: Object.assign({}, P, { size: 0, width: 18, max: P.max || 4, render: P.render === 'smooth' ? 'auto' : P.render })
});

/* ---------- step ---------- */
function step() {
  S.t += STEP;
  if (SCRIPT_ON) {
    S.lt += STEP;
    if (S.lt >= LOOP) { S.lt -= LOOP; S.si = 0; barks.clear(); pbarks.clear(); }
    while (S.si < SCRIPT.length && SCRIPT[S.si][0] <= S.lt) {
      const [, id, text, tone] = SCRIPT[S.si++]; barks.say(id, text, { tone }); pbarks.say(id, text, { tone });
      if (tone === 'hurt') S.flash[id] = S.t;
    }
    S.cam = track(CAM, S.lt)[0];
    CAST.forEach(c => { const [x, y] = track(c.path, S.lt), n = track(c.path, S.lt + 120), dx = n[0] - x; const o = S.pos[c.id]; if (o && o.lt != null && S.lt > o.lt) S.dist[c.id] = (S.dist[c.id] || 0) + Math.hypot(x - o.x, y - o.y); else S.dist[c.id] = 0;
      S.pos[c.id] = { x, y, lt: S.lt }; if (Math.abs(dx) > 0.4) S.dir[c.id] = dx > 0 ? 1 : -1; S.pos[c.id].moving = Math.hypot(dx, n[1] - y) > 0.5; });
  } else CAST.forEach(c => { if (S.pos[c.id]) S.pos[c.id].moving = false; });
  barks.update(STEP); pbarks.update(STEP);
}
// who each character looks at when standing still
// the hero's opponent / partner by script time: answers the guard, fights the jelly (knock-back and the step back included), answers the guard again
function heroLook() { const lt = S.lt; return !SCRIPT_ON ? null : lt >= 3300 && lt < 5600 ? 'guard' : lt >= 5600 && lt < 11200 ? 'slime-1' : lt >= 11200 && lt < 13600 ? 'guard' : null; }
function facing(c) {
  const p = where(c);
  if (c.id === 'hero' && S.lt >= 5600 && heroLook()) { const q = where(C(heroLook())); return q.x >= p.x ? 1 : -1; }   // keeps looking at them while knocked back or stepping away
  if (p.moving && S.dir[c.id]) return S.dir[c.id];
  if (c.id === 'hero') return S.dir.hero || 1;
  if (c.id === 'merchant') return 1; if (c.id === 'guard') return -1;
  const h = where(C('hero')); return h.x >= p.x ? 1 : -1;
}

/* ---------- world art (static ground pre-rendered at the backing scale) ---------- */
let ground = null, groundR = 0;
function buildGround(R) {
  const c = document.createElement('canvas'); c.width = Math.ceil(WW * R); c.height = Math.ceil(VH * R);
  const g = c.getContext('2d'); g.setTransform(R, 0, 0, R, 0, 0);
  g.fillStyle = '#4a5d3a'; g.fillRect(0, 0, WW, VH);
  if (IMG.ground) { const T = 128; g.imageSmoothingQuality = 'high'; for (let y = 0; y < VH; y += T) for (let x = 0; x < WW; x += T) g.drawImage(IMG.ground, x, y, T + 0.5, T + 0.5); }
  // packed earth: a soft worn band under and around the cobbles
  g.save(); g.globalCompositeOperation = 'soft-light'; g.fillStyle = 'rgba(232,206,150,0.5)'; try { g.filter = 'blur(9px)'; } catch (e) {}
  g.beginPath(); LANE.forEach(([x, y, r]) => { g.moveTo(x + r * 1.25, y); g.ellipse(x, y, r * 1.25, r * 0.95, 0, 0, 7); }); g.fill(); g.restore();
  // cobbles: the patch tiled on a staggered, turned grid, then cut to the lane's irregular, slightly soft outline
  if (IMG.patch) {
    const lane = document.createElement('canvas'); lane.width = c.width; lane.height = c.height; const q = lane.getContext('2d'); q.setTransform(R, 0, 0, R, 0, 0); q.imageSmoothingQuality = 'high';
    const ph = 54, pw = ph * ratio('patch'); let n = 0;
    for (let row = 0, y = 60; y < VH + ph; y += ph * 0.56, row++) for (let x = -(row % 2) * pw * 0.4; x < WW + pw; x += pw * 0.72, n++) {
      if (!LANE.some(([lx, ly, lr]) => Math.abs(lx - x) < lr + pw && Math.abs(ly - y) < lr + ph)) continue;
      q.save(); q.translate(x + (hash(n, 5) - 0.5) * 10, y + (hash(n, 6) - 0.5) * 8); q.rotate((hash(n, 7) - 0.5) * 1.1); if (hash(n, 8) < 0.5) q.scale(-1, 1); q.drawImage(IMG.patch, -pw / 2, -ph / 2, pw, ph); q.restore();
    }
    const mask = document.createElement('canvas'); mask.width = c.width; mask.height = c.height; const mq = mask.getContext('2d'); mq.setTransform(R, 0, 0, R, 0, 0);
    mq.beginPath(); LANE.forEach(([x, y, r]) => { mq.moveTo(x + r, y); mq.ellipse(x, y, r, r * 0.74, 0, 0, 7); }); mq.fill();
    q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'destination-in'; try { q.filter = 'blur(' + (2.2 * R).toFixed(1) + 'px)'; } catch (e) {} q.drawImage(mask, 0, 0);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 0.97; g.drawImage(lane, 0, 0); g.restore();
  }
  // contact shadows of the props
  PROPS.forEach(p => { const w = p.h * ratio(p.k) * (p.k === 'oak' ? 0.34 : p.k === 'lamp' ? 0.3 : 0.5); shadow(g, p.x, p.y - 2, w, 0.42); });
  return c;
}
function shadow(g, x, y, w, a) {
  g.save(); const gr = g.createRadialGradient(x, y, 0, x, y, w);
  gr.addColorStop(0, 'rgba(10,14,20,' + a + ')'); gr.addColorStop(0.6, 'rgba(10,14,20,' + a * 0.6 + ')'); gr.addColorStop(1, 'rgba(10,14,20,0)');
  g.fillStyle = gr; g.translate(x, y); g.scale(1, 0.34); g.beginPath(); g.arc(0, 0, w, 0, 7); g.fill(); g.restore();
}
function drawImg(g, k, x, y, h, o) {   // foot-anchored, crisp at any backing scale
  const im = IMG[k]; if (!im) return; o = o || {}; const sh = SHEET[k], cw = im.width / (sh ? sh.n : 1), w = h * cw / im.height;
  g.save(); g.translate(x, y + (o.dy || 0)); if (o.rot) g.rotate(o.rot); g.scale((o.flip ? -1 : 1) * (o.sx || 1), o.sy || 1);
  g.imageSmoothingQuality = 'high'; g.drawImage(o.src || im, (o.frame || 0) * cw, 0, cw, im.height, -w * (sh ? sh.ax : 0.5), -h, w, h); g.restore();
}
// a white silhouette of a sprite (hit flash), cached
const WHITE = {};
function whiteOf(k) {
  if (WHITE[k]) return WHITE[k]; const im = IMG[k]; if (!im) return null;
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d');
  g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,244,230,0.86)'; g.fillRect(0, 0, c.width, c.height); return (WHITE[k] = c);
}

/* ---------- characters: the walkers (Wren, Tamsin) step through a 4-pose walk cycle by distance covered; jellies hop; the others breathe ---------- */
const STRIDE = { hero: 27, tamsin: 23 };   // ground covered by one step (px): the planted foot stays put while the body passes over it
function walkFrame(c) { const p = where(c); return SHEET[c.id] && p.moving ? 1 + Math.floor((S.dist[c.id] || 0) / (STRIDE[c.id] / 2)) % 4 : 0; }
function actor(g, c, x, y, t, hurt) {
  const p = where(c), h = DRAW_H[c.id], slime = c.kind === 'slime', ts = t / 1000, ph = ts * 6.2 + c.id.length * 1.7, frame = walkFrame(c);
  let dy = 0, rot = 0, sx = 1, sy = 1;
  if (slime && p.moving) { const s = Math.abs(Math.sin(ph)); dy = -s * 5; sy = 1 - 0.16 * (1 - s) + 0.1 * s; sx = 1 + 0.16 * (1 - s) - 0.06 * s; }   // jellies hop
  else if (!p.moving) { const b = Math.sin(ts * (slime ? 2.6 : 1.6) + c.id.length); sy = 1 + (slime ? 0.05 : 0.012) * b; sx = 1 - (slime ? 0.04 : 0) * b; }   // breathing
  else if (frame === 2 || frame === 4) dy = -1;                                                                                                // passing pose: the body rises a little
  const fa = S.flash[c.id] != null ? t - S.flash[c.id] : 1e9; if (fa < 320) { rot += 0.1 * Math.sin(fa / 26) * (1 - fa / 320); dy -= 2.5 * Math.sin(Math.PI * fa / 320); }   // flinch
  shadow(g, x, y - 1, slime ? 13 : 15, 0.5 * (1 + dy / 14));
  drawImg(g, c.id, x, y, h, { dy, rot, sx, sy, frame, flip: facing(c) !== FACE[c.id], src: hurt ? whiteOf(c.id) : null });
}

/* ---------- render ---------- */
let lightLayer = null;
function fit() {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const w = Math.max(VW, Math.round((r.width || VW) * dpr)), h = Math.round(w * VH / VW);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const R = cv.width / VW; if (!ground || Math.abs(R - groundR) > 0.01) { ground = buildGround(R); groundR = R; }
  // the pixel strip is shown at a whole number of device pixels per native pixel
  const box = pcv.parentNode.getBoundingClientRect(), n = Math.max(1, Math.floor((box.width - 28) * dpr / PW)), cw = PW * n / dpr;
  if (pcv.style.width !== cw + 'px') { pcv.style.width = cw + 'px'; pcv.style.height = PH * n / dpr + 'px'; }
}
function flick(i, ts) { return 0.88 + 0.07 * Math.sin(ts * 9.1 + i * 2.3) + 0.05 * Math.sin(ts * 23.7 + i * 5.1); }
function lights(ts) {
  const L = [];
  PROPS.forEach((p, i) => { if (!p.lit) return; const w = p.h * ratio(p.k); L.push({ x: p.x + (p.flip ? -1 : 1) * p.lit[0] * w, y: p.y + p.lit[1] * p.h, r: p.r, i: flick(i, ts) }); });
  const hero = C('hero'), hp = where(hero), f = facing(hero) === FACE.hero ? 1 : -1;
  L.push({ x: hp.x + f * 0.2 * DRAW_H.hero, y: hp.y - 0.36 * DRAW_H.hero, r: 96, i: flick(9, ts) });
  CAST.forEach(c => { if (c.id === 'hero') return; const p = where(c); L.push({ x: p.x, y: p.y - DRAW_H[c.id] * 0.55, r: c.kind === 'slime' ? 46 : 64, i: 0.5, fill: true }); });   // a dim fill so every speaker stays readable
  return L;
}
function render() {
  fit();
  const R = cv.width / VW, g = ctx, t = S.t, ts = t / 1000, cam = S.cam;
  g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingQuality = 'high'; g.drawImage(ground, Math.round(cam * R), 0, VW * R, VH * R, 0, 0, cv.width, cv.height);
  g.setTransform(R, 0, 0, R, 0, 0);
  // selection ring (under the sprites)
  const sel = C(S.who); if (sel && !FREEZE) { const p = where(sel); g.strokeStyle = 'rgba(255,214,120,0.85)'; g.lineWidth = 1.6; g.setLineDash([5, 4]); g.lineDashOffset = -t / 60; g.beginPath(); g.ellipse(p.x - cam, p.y, 17, 6, 0, 0, 7); g.stroke(); g.setLineDash([]); }
  // y-sorted world objects
  const list = [];
  PROPS.forEach(p => list.push({ y: p.y, d: () => drawImg(g, p.k, p.x - cam, p.y, p.h, { flip: p.flip, rot: p.k === 'oak' ? Math.sin(ts * 0.7 + p.x) * 0.006 : 0 }) }));
  CAST.forEach(c => { const p = where(c), hurt = S.flash[c.id] != null && t - S.flash[c.id] < 150 && Math.floor((t - S.flash[c.id]) / 50) % 2 === 0; list.push({ y: p.y, d: () => actor(g, c, p.x - cam, p.y, t, hurt) }); });
  list.sort((a, b) => a.y - b.y).forEach(o => o.d());
  // dusk: a cool wash with holes at the lanterns, then warm glows and fireflies
  const L = lights(ts);
  if (!lightLayer) lightLayer = document.createElement('canvas');
  const lw = Math.ceil(VW / 2), lh = Math.ceil(VH / 2); if (lightLayer.width !== lw) { lightLayer.width = lw; lightLayer.height = lh; }
  const o = lightLayer.getContext('2d'); o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-over'; o.clearRect(0, 0, lw, lh); o.fillStyle = 'rgba(22,28,60,0.5)'; o.fillRect(0, 0, lw, lh);
  o.setTransform(0.5, 0, 0, 0.5, 0, 0); o.globalCompositeOperation = 'destination-out';
  L.forEach(l => { const x = l.x - cam, gr = o.createRadialGradient(x, l.y, 0, x, l.y, l.r); gr.addColorStop(0, 'rgba(0,0,0,' + Math.min(1, 0.95 * l.i) + ')'); gr.addColorStop(0.55, 'rgba(0,0,0,' + Math.min(1, 0.45 * l.i) + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)'); o.fillStyle = gr; o.beginPath(); o.arc(x, l.y, l.r, 0, 7); o.fill(); });
  g.imageSmoothingEnabled = true; g.drawImage(lightLayer, 0, 0, VW, VH);
  g.save(); g.globalCompositeOperation = 'lighter';
  L.forEach(l => { if (l.fill) return; const x = l.x - cam, gr = g.createRadialGradient(x, l.y, 0, x, l.y, l.r * 0.75); gr.addColorStop(0, 'rgba(255,196,110,' + (0.5 * l.i) + ')'); gr.addColorStop(0.3, 'rgba(255,150,60,' + (0.2 * l.i) + ')'); gr.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, l.y, l.r, 0, 7); g.fill(); });
  for (let i = 0; i < 34; i++) {
    const bx = hash(i, 1) * WW, by = 70 + hash(i, 2) * (VH - 110), sp = 0.2 + hash(i, 3) * 0.5;
    const x = bx + Math.sin(ts * sp + i) * 40 - cam, y = by + Math.cos(ts * sp * 1.3 + i * 2) * 22, a = Math.max(0, Math.sin(ts * (0.8 + hash(i, 4)) + i * 1.7));
    if (x < -10 || x > VW + 10) continue;
    const gr = g.createRadialGradient(x, y, 0, x, y, 7); gr.addColorStop(0, 'rgba(220,255,150,' + (0.85 * a) + ')'); gr.addColorStop(1, 'rgba(180,255,120,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
  }
  g.restore();
  const vg = g.createRadialGradient(VW / 2, VH / 2, VH * 0.45, VW / 2, VH / 2, VW * 0.68); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(4,6,16,0.5)'); g.fillStyle = vg; g.fillRect(0, 0, VW, VH);
  // bubbles: after the world, before the HUD
  barks.draw(g);
  hud(g);
  renderPixel();
}
// nine-slice frame from the painted UI kit (L-06) over a dark walnut panel
function nine(g, im, sl, r, corner) {
  const [l, tp, rt, bt] = sl, iw = im.width, ih = im.height, c = corner, mw = r.w - 2 * c, mh = r.h - 2 * c;
  const xs = [[0, l, r.x, c], [l, iw - l - rt, r.x + c, mw], [iw - rt, rt, r.x + c + mw, c]], ys = [[0, tp, r.y, c], [tp, ih - tp - bt, r.y + c, mh], [ih - bt, bt, r.y + c + mh, c]];
  g.imageSmoothingQuality = 'high';
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { if (i === 1 && j === 1) continue; if (xs[i][3] > 0 && ys[j][3] > 0) g.drawImage(im, xs[i][0], ys[j][0], xs[i][1], ys[j][1], xs[i][2] - (i === 1 ? 0.3 : 0), ys[j][2] - (j === 1 ? 0.3 : 0), xs[i][3] + (i === 1 ? 0.6 : 0), ys[j][3] + (j === 1 ? 0.6 : 0)); }
}
function panel(g, r, big) {
  const im = IMG[big ? 'frameW' : 'frameS'], corner = big ? 24 : 9, inset = big ? 6.2 : 3.6;
  const gr = g.createLinearGradient(0, r.y, 0, r.y + r.h); gr.addColorStop(0, 'rgba(48,33,22,0.95)'); gr.addColorStop(1, 'rgba(26,17,12,0.95)');
  g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 10 * (cv.width / VW); g.shadowOffsetY = 3 * (cv.width / VW); g.fillStyle = gr; g.beginPath(); g.roundRect(r.x + inset, r.y + inset, r.w - 2 * inset, r.h - 2 * inset, 3); g.fill(); g.restore();
  if (im) nine(g, im, big ? [71, 66, 71, 66] : [17, 16, 17, 16], r, corner);
  else { g.strokeStyle = '#b98a4a'; g.lineWidth = 2; g.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6); }
}
function hud(g) {
  const SERIF = 'Georgia, "Palatino Linotype", "Book Antiqua", Palatino, serif', SANS = '"Arial Rounded MT Bold", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  const low = S.flash.hero != null && S.lt > 6800 && S.lt < 15000, hp = low ? 0.72 : 0.9;
  panel(g, HUD[0]); g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = '700 12px ' + SERIF; g.fillStyle = '#f3d68a'; g.fillText('Wren', 23, 28); const nw = g.measureText('Wren').width; g.font = '600 9.5px ' + SANS; g.fillStyle = '#cdbb9a'; g.fillText('Lv 4', 23 + nw + 7, 28);
  g.textAlign = 'right'; g.fillStyle = '#f4ead2'; g.fillText(Math.round(60 * hp) + ' / 60', 165, 28); g.textAlign = 'left';
  const bx = 23, by = 34, bw = 142, bh = 8;
  g.fillStyle = '#120b08'; g.beginPath(); g.roundRect(bx - 1, by - 1, bw + 2, bh + 2, 4); g.fill();
  const hg = g.createLinearGradient(0, by, 0, by + bh); hg.addColorStop(0, low ? '#ffb07a' : '#ff8f7a'); hg.addColorStop(0.5, low ? '#e8662c' : '#d9473c'); hg.addColorStop(1, low ? '#a83e14' : '#8e2420');
  g.fillStyle = hg; g.beginPath(); g.roundRect(bx, by, bw * hp, bh, 3); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.roundRect(bx + 2, by + 1.2, bw * hp - 4, 1.6, 1); g.fill();
  g.strokeStyle = '#b98a4a'; g.lineWidth = 1; g.beginPath(); g.roundRect(bx - 1, by - 1, bw + 2, bh + 2, 4); g.stroke();
  panel(g, HUD[1]); g.font = '700 11.5px ' + SERIF; g.fillStyle = '#f3d68a'; g.textAlign = 'center'; g.fillText('Find the old mill', HUD[1].x + HUD[1].w / 2 + 6, 29); g.textAlign = 'left';
  g.fillStyle = '#f3d68a'; g.beginPath(); const qx = HUD[1].x + 22, qy = 25; g.moveTo(qx, qy - 5); g.lineTo(qx + 4, qy); g.lineTo(qx, qy + 5); g.lineTo(qx - 4, qy); g.closePath(); g.fill(); g.strokeStyle = '#6b4a1e'; g.lineWidth = 0.8; g.stroke();
  if (WINDOW_ON) { panel(g, WIN, true); g.fillStyle = '#f3d68a'; g.font = '700 14px ' + SERIF; g.fillText('Old Bram', 66, 290); g.fillStyle = '#f4ead2'; g.font = '500 13px ' + SANS; g.fillText('A window like this one is a UI rect: bubbles stay clear of it,', 66, 310); g.fillText('and hide while a window sits over every free spot.', 66, 328); }
}
let pGround = null, pLight = null;
function pDraw(g, k, x, y, flip) {   // native-pixel sprite, foot-anchored (the atlas cells carry a 1 px outline margin)
  const a = ATLAS[k], im = IMG.atlas; if (!a || !im) return;
  const dx = Math.round(x - a[2] / 2), dy = Math.round(y - a[3] + 1);
  if (flip) { g.save(); g.translate(dx + a[2], dy); g.scale(-1, 1); g.drawImage(im, a[0], a[1], a[2], a[3], 0, 0, a[2], a[3]); g.restore(); }
  else g.drawImage(im, a[0], a[1], a[2], a[3], dx, dy, a[2], a[3]);
}
let pCast = null;
function renderPixel() {
  const g = pctx, cam = Math.round(S.cam * K), t = S.t, ts = t / 1000, im = IMG.atlas;
  g.imageSmoothingEnabled = false;
  if (!im) { g.fillStyle = '#4a5d3a'; g.fillRect(0, 0, PW, PH); pbarks.draw(g); return; }
  if (!pGround) {   // the static ground: tiles, cobbles and prop shadows, once
    pGround = document.createElement('canvas'); pGround.width = Math.ceil(WW * K); pGround.height = PH; const q = pGround.getContext('2d'); q.imageSmoothingEnabled = false;
    const a = ATLAS.ground; for (let y = 0; y < PH; y += a[3]) for (let x = 0; x < pGround.width; x += a[2]) q.drawImage(im, a[0], a[1], a[2], a[3], x, y, a[2], a[3]);
    const ln = document.createElement('canvas'); ln.width = pGround.width; ln.height = PH; const lq = ln.getContext('2d'), pa = ATLAS.patch; lq.imageSmoothingEnabled = false;   // cobbles: tiled, then cut to the lane outline (hard pixel edge)
    for (let row = 0, y = 30; y < PH + pa[3]; y += Math.round(pa[3] * 0.6), row++) for (let x = -(row % 2) * 20; x < ln.width + pa[2]; x += Math.round(pa[2] * 0.76)) { const fl = hash(x, row) < 0.5; lq.save(); lq.translate(x + (fl ? pa[2] : 0), y); if (fl) lq.scale(-1, 1); lq.drawImage(im, pa[0], pa[1], pa[2], pa[3], 0, 0, pa[2], pa[3]); lq.restore(); }
    const mk = document.createElement('canvas'); mk.width = ln.width; mk.height = PH; const mq = mk.getContext('2d'); mq.fillStyle = '#000';
    LANE.forEach(([x, y, r]) => { const rx = Math.round(r * K), ry = Math.round(r * 0.74 * K), cx = Math.round(x * K), cy = Math.round(y * K); for (let j = -ry; j <= ry; j++) { const hw = Math.round(rx * Math.sqrt(1 - (j / (ry + 0.5)) ** 2)); mq.fillRect(cx - hw, cy + j, 2 * hw, 1); } });
    lq.globalCompositeOperation = 'destination-in'; lq.drawImage(mk, 0, 0); q.drawImage(ln, 0, 0);
    q.fillStyle = 'rgba(16,14,24,0.4)'; PROPS.forEach(p => { const w = Math.round(ATLAS[p.k][2] * (p.k === 'oak' ? 0.3 : 0.42)), x = Math.round(p.x * K), y = Math.round(p.y * K); q.fillRect(x - w, y - 2, 2 * w, 3); q.fillRect(x - w + 2, y - 3, 2 * w - 4, 5); });
    pCast = PIXEL_CAST.build();
  }
  g.drawImage(pGround, cam, 0, PW, PH, 0, 0, PW, PH);
  const list = [];
  PROPS.forEach(p => list.push({ y: p.y, d: () => pDraw(g, p.k, Math.round(p.x * K) - cam, Math.round(p.y * K), !!p.flip) }));
  CAST.forEach(c => {
    const p = where(c), hurt = S.flash[c.id] != null && t - S.flash[c.id] < 150 && Math.floor((t - S.flash[c.id]) / 50) % 2 === 0;
    list.push({ y: p.y, d: () => {
      const x = Math.round(p.x * K) - cam, y = Math.round(p.y * K), slime = c.kind === 'slime', F = pCast[c.id], PC = PIXEL_CAST;
      const up = slime && p.moving ? Math.floor(ts * 4 + c.id.length) % 2 : 0, fr = slime ? (p.moving ? 1 - up : 0) : F.length > 1 && p.moving ? 1 + Math.floor((S.dist[c.id] || 0) / (STRIDE[c.id] / 2)) % 4 - 1 : 0;   // jellies: squash on the ground, round in the air
      g.fillStyle = 'rgba(16,14,24,0.45)'; const sw = slime ? 9 : 6; g.fillRect(x - sw, y - 1, 2 * sw, 2); g.fillRect(x - sw + 1, y - 2, 2 * sw - 2, 4);
      const flip = facing(c) < 0, dx = x - PC.W / 2, dy = y - PC.H + 1 - up * 3 - (!slime && fr % 2 ? 1 : 0);   // step frames: the body rises one pixel
      g.save(); if (flip) { g.translate(dx + PC.W, dy); g.scale(-1, 1); } else g.translate(dx, dy);
      g.drawImage(F[Math.max(0, fr) % F.length], 0, 0);
      if (hurt) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.75; g.drawImage(F[Math.max(0, fr) % F.length], 0, 0); }
      g.restore();
    } });
  });
  list.sort((a, b) => a.y - b.y).forEach(o => o.d());
  // dusk at native resolution: a cool wash with holes at the lanterns
  if (!pLight) { pLight = document.createElement('canvas'); pLight.width = PW; pLight.height = PH; }
  const o = pLight.getContext('2d'); o.globalCompositeOperation = 'source-over'; o.clearRect(0, 0, PW, PH); o.fillStyle = 'rgba(22,28,60,0.46)'; o.fillRect(0, 0, PW, PH); o.globalCompositeOperation = 'destination-out';
  lights(ts).forEach(l => { const x = Math.round(l.x * K) - cam, y = Math.round(l.y * K), r = l.r * K; const gr = o.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,' + Math.min(1, 0.95 * (l.fill ? l.i : 1)) + ')'); gr.addColorStop(0.55, 'rgba(0,0,0,' + (l.fill ? 0.22 : 0.45) + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)'); o.fillStyle = gr; o.beginPath(); o.arc(x, y, r, 0, 7); o.fill(); });
  g.drawImage(pLight, 0, 0);
  for (let i = 0; i < 20; i++) {   // fireflies: single lit pixels
    const bx = hash(i, 1) * WW, by = 70 + hash(i, 2) * (VH - 110), sp = 0.2 + hash(i, 3) * 0.5, x = Math.round((bx + Math.sin(ts * sp + i) * 40) * K) - cam, y = Math.round((by + Math.cos(ts * sp * 1.3 + i * 2) * 22) * K);
    if (Math.sin(ts * (0.8 + hash(i, 4)) + i * 1.7) > 0.3 && x >= 0 && x < PW) { g.fillStyle = '#e6ff9a'; g.fillRect(x, y, 1, 1); g.fillStyle = 'rgba(200,255,130,0.35)'; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
  }
  pbarks.draw(g);
  // HUD plate: name, HP bar
  const low = S.flash.hero != null && S.lt > 6800 && S.lt < 15000, hp = low ? 0.72 : 0.9;
  g.fillStyle = '#1e140e'; g.fillRect(6, 5, 90, 24); g.fillRect(5, 6, 92, 22); g.fillStyle = '#b98a4a'; g.fillRect(7, 6, 88, 1); g.fillRect(7, 27, 88, 1); g.fillRect(6, 7, 1, 20); g.fillRect(95, 7, 1, 20); g.fillStyle = '#3a271a'; g.fillRect(7, 7, 88, 20);
  g.fillStyle = '#f3d68a'; [[0, '#.#.# #.#.# #.#.# #.#.# .#.#.'], [6, '###. #..# ###. #.#. #..#'], [11, '#### #... ###. #... ####'], [16, '#..# ##.# #.## #..# #..#']].forEach(([ox, rows]) => rows.split(' ').forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') g.fillRect(11 + ox + i, 10 + j, 1, 1); }));
  g.fillStyle = '#120b08'; g.fillRect(10, 18, 82, 6); g.fillStyle = low ? '#e8662c' : '#d9473c'; g.fillRect(11, 19, Math.round(80 * hp), 4); g.fillStyle = low ? '#ffb07a' : '#ff8f7a'; g.fillRect(11, 19, Math.round(80 * hp), 1);
}

/* ---------- controls ---------- */
const whoEl = document.getElementById('who');
['hero', 'guard', 'merchant', 'tamsin', 'bram', 'slime-1'].forEach(id => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.v = id; b.textContent = C(id).name; b.setAttribute('aria-checked', id === S.who); whoEl.appendChild(b); });
whoEl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.who = b.dataset.v; [...whoEl.children].forEach(x => x.setAttribute('aria-checked', x === b)); });
function trigger(ev) {
  const c = C(S.who); if (!c) return;
  if (ev === 'long') { barks.say(c.id, 'I have been standing here since dawn and not one soul has asked about the turnips.', { tone: 'talk' }); pbarks.say(c.id, 'I have been standing here since dawn and not one soul has asked about the turnips.', { tone: 'talk' }); return; }
  if (ev === 'crowd') { const vis = CAST.filter(k => { const r = sprite(k); return r.x > 0 && r.x < VW; }).slice(0, 4); vis.forEach(k => { barks.bark(k.id, 'idle', { voice: k.voice, cooldown: 0 }); pbarks.bark(k.id, 'idle', { voice: k.voice, cooldown: 0 }); }); return; }
  barks.bark(c.id, ev, { voice: c.voice, cooldown: 0 }); pbarks.bark(c.id, ev, { voice: c.voice, cooldown: 0 });
  if (ev === 'hurt') S.flash[c.id] = S.t;
}
document.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', () => trigger(b.dataset.ev)));
const KEYS = ['idle', 'spotted', 'hurt', 'taunt', 'secret', 'wonder', 'long'];
addEventListener('keydown', e => { const i = '1234567'.indexOf(e.key); if (i >= 0) trigger(KEYS[i]); });
cv.addEventListener('pointerdown', e => { const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * VW / r.width, y = (e.clientY - r.top) * VH / r.height; let best = null, bd = 40; CAST.forEach(c => { const s = sprite(c), d = Math.hypot(s.x + s.w / 2 - x, s.y + s.h / 2 - y); if (d < bd) { bd = d; best = c; } }); if (best) { S.who = best.id; [...whoEl.children].forEach(x => x.setAttribute('aria-checked', x.dataset.v === best.id)); trigger('idle'); } });
const scriptBtn = document.getElementById('script'), winBtn = document.getElementById('window');
function syncTog() { scriptBtn.setAttribute('aria-pressed', SCRIPT_ON); scriptBtn.textContent = 'Script: ' + (SCRIPT_ON ? 'on' : 'off'); winBtn.setAttribute('aria-pressed', WINDOW_ON); winBtn.textContent = 'Window: ' + (WINDOW_ON ? 'on' : 'off'); }
scriptBtn.onclick = () => { SCRIPT_ON = !SCRIPT_ON; syncTog(); };
winBtn.onclick = () => { WINDOW_ON = !WINDOW_ON; syncTog(); };
document.getElementById('reset').onclick = () => { S.lt = 0; S.si = 0; barks.clear(); pbarks.clear(); S.flash = {}; };
syncTog();
const pEl = document.getElementById('params');
const vRow = document.createElement('div'); vRow.className = 'row';
vRow.innerHTML = `<label><span>Variant</span></label><select id="variant" aria-label="Variant preset"><option value="">Custom</option>${VARIANTS.map((v, i) => `<option value="${i}">${v[0]}</option>`).join('')}</select>`;
pEl.appendChild(vRow);
const controls = {};
vRow.querySelector('select').onchange = e => { const v = VARIANTS[+e.target.value]; if (!v || e.target.value === '') return; PARAMS.forEach(p => { P[p.key] = p.default; }); Object.assign(P, v[1]); PARAMS.forEach(p => controls[p.key] && controls[p.key](P[p.key])); apply(); };
PARAMS.forEach(p => {
  const row = document.createElement('div'); row.className = 'row';
  if (p.type === 'range') {
    row.innerHTML = `<label><span>${p.label}</span><output>${P[p.key]}${p.unit ? ' ' + p.unit : ''}</output></label><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${P[p.key]}" aria-label="${p.label}">`;
    const inp = row.querySelector('input'), out = row.querySelector('output'), fill = () => inp.style.setProperty('--fill', ((inp.value - p.min) / (p.max - p.min) * 100) + '%');
    fill(); inp.oninput = () => { P[p.key] = +inp.value; out.textContent = inp.value + (p.unit ? ' ' + p.unit : ''); fill(); apply(); };
    controls[p.key] = v => { inp.value = v; out.textContent = v + (p.unit ? ' ' + p.unit : ''); fill(); };
  } else {
    row.innerHTML = `<label><span>${p.label}</span></label><div class="seg" role="radiogroup">${p.options.map(o => `<button type="button" role="radio" aria-checked="${o === P[p.key]}" data-v="${o}">${o}</button>`).join('')}</div>`;
    controls[p.key] = v => [...row.querySelectorAll('.seg button')].forEach(x => x.setAttribute('aria-checked', x.dataset.v === v));
    row.querySelector('.seg').onclick = e => { const b = e.target.closest('button'); if (!b) return; P[p.key] = b.dataset.v; [...b.parentNode.children].forEach(x => x.setAttribute('aria-checked', x === b)); apply(); };
  }
  pEl.appendChild(row);
});
function apply() { barks.setParams(P); pbarks.setParams(Object.assign({}, P, { size: 0, width: 18, max: P.max || 4, render: P.render === 'smooth' ? 'auto' : P.render })); }

/* ---------- loop ---------- */
CAST.forEach(c => { const [x, y] = track(c.path, 0); S.pos[c.id] = { x, y }; });
/* text state for critics and tools/sprites/statecheck.py. Painted scene (view px, x = world x - camera): the mirror is facing(c) !== FACE[c.id], so the
   drawn side is facing(c) itself. The pixel strip (second canvas, canvas:'px', ids px-*) draws the same cast from pixelcast.js, whose sprites all look
   right: flip = facing(c) < 0. Who looks at whom: a walker faces its way; the hero answers the guard, then fights the jellies, then answers the guard
   again; everyone else who stands looks at the hero. */
window.__state = () => {
  const lt = S.lt, side = v => v > 0 ? 'right' : 'left';
  const look = c => { const p = where(c); if (c.id === 'hero') return p.moving && lt < 5600 ? null : heroLook(); return p.moving ? null : 'hero'; };
  const vx = c => { const p = where(c); return p.moving && SCRIPT_ON ? Math.round((track(c.path, lt + 120)[0] - p.x) * 100) / 100 : 0; };
  const actors = CAST.map(c => { const p = where(c); return { id: c.id, x: Math.round(p.x - S.cam), y: Math.round(p.y), facing: side(facing(c)), target: look(c), vx: vx(c), native: side(FACE[c.id]), flipX: facing(c) !== FACE[c.id] }; });
  CAST.forEach(c => { const p = where(c), t = look(c); actors.push({ id: 'px-' + c.id, canvas: 'px', x: Math.round(p.x * K) - Math.round(S.cam * K), y: Math.round(p.y * K), facing: side(facing(c)), target: t ? 'px-' + t : null, vx: vx(c), native: 'right', flipX: facing(c) < 0 }); });
  return { t: Math.round(S.t), lt: Math.round(lt), actors };
};
window.__barkDemo = () => ({ t: S.t, lt: S.lt, cam: S.cam, bubbles: barks.lastDrawn().map(d => ({ speaker: d.speaker, text: d.text, tone: d.tone, x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.w), h: Math.round(d.h), pointer: d.pointer, clamped: d.clamped })), pixel: pbarks.lastDrawn().length });
for (let n = Math.floor(T0 / STEP); n > 0; n--) step();
artReady.then(() => {
  render();
  if (MISSING.length) {   // never fail silently: say which files are missing, on the canvas
    const g = ctx, R = cv.width / VW; g.setTransform(R, 0, 0, R, 0, 0); g.fillStyle = 'rgba(20,8,8,0.92)'; g.fillRect(0, VH / 2 - 44, VW, 88); g.fillStyle = '#ffd0c0'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 15px system-ui, sans-serif'; g.fillText('Demo art did not load (' + MISSING.length + ' of ' + Object.keys(ART).length + ' files)', VW / 2, VH / 2 - 18);
    g.font = '500 11px system-ui, sans-serif'; g.fillText('Missing under demo/assets/: ' + MISSING.slice(0, 4).join(', ') + (MISSING.length > 4 ? ', ...' : ''), VW / 2, VH / 2 + 4); g.fillText('Serve the element folder with its demo/assets/ directory. The bubbles themselves need no files.', VW / 2, VH / 2 + 22);
    window.__artMissing = MISSING.slice(); if (FREEZE) window.__frozen = true; return;
  }
  if (FREEZE) { window.__frozen = true; return; }
  let acc = 0, prev = null;
  const frame = now => { if (prev === null) prev = now; acc += Math.min(250, now - prev); prev = now; while (acc >= STEP) { step(); acc -= STEP; } render(); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  addEventListener('resize', render);
});
