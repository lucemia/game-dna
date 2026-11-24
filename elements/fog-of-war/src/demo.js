/* B-03 fog of war demo: a small scouting skirmish on a 16x12 tile map, 256x224 native (map 256x192 + HUD 32).
 * Everything fog-related goes through the module (GameDNA_FogOfWar); this file is only the host. */
const W = 256, H = 224, T = 16, COLS = 16, ROWS = 12, MAP_H = ROWS * T, FRAME = 1000 / 60, LOOP = 16000;
const Q = new URLSearchParams(location.search);
const FREEZE = Q.get('freeze') === '1', T_AT = Math.max(0, +Q.get('t') || 0);

const PARAMS = [
  { key: 'radius', label: 'Base vision', type: 'range', min: 1, max: 8, step: 1, default: 3, unit: 'tiles' },
  { key: 'density', label: 'Fog density', type: 'range', min: 0.3, max: 0.85, step: 0.05, default: 0.6, unit: '' },
  { key: 'edge', label: 'Soft edge', type: 'range', min: 0, max: 1.5, step: 0.25, default: 1, unit: 'tiles' },
  { key: 'drift', label: 'Drift speed', type: 'range', min: 0, max: 20, step: 1, default: 6, unit: 'px/s' },
  { key: 'fade', label: 'Reveal fade', type: 'range', min: 0, max: 600, step: 20, default: 240, unit: 'ms' },
  { key: 'shape', label: 'Vision shape', type: 'select', options: ['diamond', 'circle', 'square'], default: 'diamond' },
  { key: 'scheme', label: 'Fog colour', type: 'select', options: ['night', 'mist', 'ash'], default: 'night' },
  { key: 'dither', label: 'Dither', type: 'select', options: ['auto', 'on', 'off'], default: 'auto' },
  { key: 'ghosts', label: 'Last-seen ghosts', type: 'select', options: ['on', 'off'], default: 'on' },
  { key: 'pop', label: '"!" on reveal', type: 'select', options: ['on', 'off'], default: 'on' },
  { key: 'shroud', label: 'Unexplored darker', type: 'select', options: ['off', 'on'], default: 'off' }
];
const HOST = [
  { key: 'forest', label: 'Forest blocks sight', options: ['on', 'off'], default: 'on' },
  { key: 'hills', label: 'Hills +2 vision', options: ['on', 'off'], default: 'on' },
  { key: 'xray', label: 'Show hidden enemies', options: ['off', 'on'], default: 'off' },
  { key: 'fog', label: 'Fog', options: ['on', 'off'], default: 'on' }
];
const P = {}; PARAMS.forEach(p => { P[p.key] = Q.has(p.key) ? (p.type === 'range' ? +Q.get(p.key) : Q.get(p.key)) : p.default; });
const HO = {}; HOST.forEach(p => { HO[p.key] = Q.has(p.key) ? Q.get(p.key) : p.default; });
let SKIN_ID = Q.get('skin') === 'flat' ? 'flat' : 'pixel16';

/* a token-only, non-pixel skin: proves the fog colours and dithering come from the skin */
if (window.GameDNA_Skin) GameDNA_Skin.register({
  id: 'flat', name: 'flat (demo)', pixel: false,
  native: { w: 256, h: 224, scale: 'fit', smoothing: true },
  palette: {
    ink: '#29304d', paper: '#f4f6fb',
    ui: { fill: '#ffffff', edge: '#cdd2de', highlight: '#ffffff', shadow: '#5a6290' },
    team: { a: '#6f8cff', b: '#ff8574', n: '#aeb5c6' },
    overlay: { move: { fill: '#6f8cff', edge: '#4d68d6' }, attack: { fill: '#ff6f6f', edge: '#d9624f' }, threat: { fill: '#8f86ff', edge: '#5b4bff' }, heal: { fill: '#3fcf8e', edge: '#2f9e63' } },
    fx: { hot: '#ff6a4a', cold: '#4ab8ff', heal: '#3fcf8e', crit: '#ffcf4a', status: '#8f86ff', white: '#ffffff' },
    text: { main: '#29304d', shadow: 'rgba(0,0,0,0)', outline: '#ffffff', accent: '#ff5a4a', dim: '#e8ecff' },
    fog: { deep: '#1c2246', mist: '#7a84b8', ghost: '#eef0ff', ghostEdge: '#6a74a8' }
  },
  overlayStyle: { mode: 'wash' },
  fonts: { ui: { type: 'canvas', family: 'system-ui, sans-serif', size: 7, weight: 700 }, num: { type: 'canvas', family: 'system-ui, sans-serif', size: 11, weight: 800 } },
  motion: { snap: false, fadeSteps: null, flashMax: 0.3 }
});
const UI = window.GameDNA_Skin ? GameDNA_Skin.get('pixel16') : null;   // the host's own HUD stays pixel16

/* ===== map ===== */
// . grass  , meadow  F forest (blocks sight)  H hill (+2 vision)  ~ river  = bridge  R road  W stone wall (blocks)  r ruin floor
const MAP = [
  'FF...,..F..~~HFF',
  'F..,...FF..~~HHF',
  '...RRRRRRRR==RRR',
  '.,.R..F....~~...',
  '...R.FFF...~~.WW',
  'HH.R..F...~~..Wr',
  'HH.R......~~.,rr',
  '...RRRRRRR==RRRr',
  '.,......F.~~.WWW',
  '..FF...FF.~~...F',
  '.FFF..,...~~..FF',
  'FFF.......~~.FFF'
];
const at = (x, y) => (MAP[y] || '')[x] || '.';
const inMap = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const blocksSight = (x, y) => { const c = at(x, y); return c === 'W' || (HO.forest === 'on' && c === 'F'); };

function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function hh(x, y, s) { let n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
const C = {
  g0: '#2f6a2a', g1: '#3e822e', g2: '#56983a', g3: '#74b04a', g4: '#a2d062',
  f0: '#12301e', f1: '#1d4a28', f2: '#2c6630', f3: '#468a3a', f4: '#76b04a', bark: '#4a2e1c',
  h0: '#4a7a30', h1: '#6a9e40', h2: '#8cbc54', h3: '#b8dc78', rock: '#8a8a7a', rockD: '#5a5a50',
  w0: '#183c7a', w1: '#22549c', w2: '#3472ba', w3: '#5a98d8', w4: '#cfe8ff',
  d0: '#7a5a34', d1: '#9c7a48', d2: '#bc9a62', d3: '#d8bc84',
  s0: '#2c2a36', s1: '#585664', s2: '#7c7a88', s3: '#a6a4b0', s4: '#cac8d2',
  r0: '#5e5444', r1: '#857a64', r2: '#a69a7e', r3: '#c4b896',
  wood0: '#4a2c16', wood1: '#7a4e28', wood2: '#a6743a', wood3: '#c8965a'
};
function paintGround() {
  const c = mk(COLS * T, ROWS * T), g = c.getContext('2d');
  const px = (x, y, col, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
    const X = tx * T, Y = ty * T, k = at(tx, ty), r = (i) => hh(tx, ty, i);
    // grass everywhere first (dithered three-tone)
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const n = hh(X + x, Y + y, 3);
      px(X + x, Y + y, n < 0.12 ? C.g1 : n > 0.9 ? C.g3 : C.g2);
    }
    for (let i = 0; i < 3; i++) { const x = X + 2 + Math.floor(r(10 + i) * 11), y = Y + 3 + Math.floor(r(20 + i) * 10); px(x, y, C.g3); px(x - 1, y + 1, C.g4); px(x + 1, y + 1, C.g1); }
    if (k === ',') for (let i = 0; i < 4; i++) { const x = X + 2 + Math.floor(r(30 + i) * 12), y = Y + 2 + Math.floor(r(40 + i) * 12); px(x, y, i % 2 ? '#f6e27a' : '#f49ac0'); px(x, y + 1, C.g1); }
    if (k === 'R') {
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const edgeX = (x < 2 && at(tx - 1, ty) !== 'R' && at(tx - 1, ty) !== '=') || (x > 13 && at(tx + 1, ty) !== 'R' && at(tx + 1, ty) !== '='), edgeY = (y < 2 && at(tx, ty - 1) !== 'R') || (y > 13 && at(tx, ty + 1) !== 'R');
        if ((edgeX || edgeY) && hh(X + x, Y + y, 5) < 0.6) continue;
        const n = hh(X + x, Y + y, 6); px(X + x, Y + y, n < 0.15 ? C.d1 : n > 0.93 ? C.d3 : C.d2);
      }
      for (let i = 0; i < 3; i++) { const x = X + 3 + Math.floor(r(50 + i) * 10), y = Y + 3 + Math.floor(r(60 + i) * 10); px(x, y, C.d0); px(x + 1, y, C.d1); }
    }
    if (k === 'H') {
      g.fillStyle = C.h0; ell(g, X + 8, Y + 10, 8, 5);
      g.fillStyle = C.h1; ell(g, X + 8, Y + 9, 7, 4);
      g.fillStyle = C.h2; ell(g, X + 7, Y + 8, 5, 3);
      g.fillStyle = C.h3; ell(g, X + 6, Y + 7, 2, 1);
      px(X + 11, Y + 11, C.rockD, 3, 2); px(X + 11, Y + 11, C.rock, 2, 1);
    }
    if (k === '~' || k === '=') {
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const n = hh(X + x, Y + y, 7); px(X + x, Y + y, n < 0.2 ? C.w1 : C.w2); }
      if (at(tx - 1, ty) !== '~' && at(tx - 1, ty) !== '=') { px(X, Y, C.w0, 2, T); px(X, Y, C.g1, 1, T); }
      if (at(tx + 1, ty) !== '~' && at(tx + 1, ty) !== '=') { px(X + T - 2, Y, C.w0, 2, T); px(X + T - 1, Y, C.g1, 1, T); }
    }
    if (k === '=') {
      for (let x = 0; x < T; x++) for (let y = 2; y < 14; y++) px(X + x, Y + y, x % 4 === 3 ? C.wood0 : y === 2 ? C.wood3 : hh(X + x, Y + y, 9) < 0.2 ? C.wood1 : C.wood2);
      px(X, Y + 1, C.wood0, T, 1); px(X, Y + 14, C.wood0, T, 1); px(X, Y + 15, C.w0, T, 1);
    }
    if (k === 'r') for (const [x, y, w, h] of [[1, 1, 7, 6], [9, 1, 6, 6], [1, 8, 5, 7], [7, 8, 8, 7]]) { px(X + x, Y + y, C.r0, w, h); px(X + x, Y + y, hh(tx, ty, x + y) < 0.4 ? C.r1 : C.r2, w - 1, h - 1); px(X + x, Y + y, C.r3, w - 1, 1); }
  }
  // walls and trees in row order so lower ones overlap upper ones (depth)
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
    const X = tx * T, Y = ty * T, k = at(tx, ty);
    if (k === 'W') {
      px(X, Y - 4, C.s0, T, T + 4);
      for (let row = 0; row < 5; row++) for (let col = -1; col < 3; col++) {
        const x = X + col * 7 + (row % 2) * 3 + 1, y = Y - 3 + row * 4;
        const x0 = Math.max(X + 1, x), x1 = Math.min(X + T - 1, x + 6); if (x1 <= x0) continue;
        px(x0, y, hh(x, y, 11) < 0.3 ? C.s1 : C.s2, x1 - x0, 3); px(x0, y, C.s3, x1 - x0, 1);
      }
      px(X, Y - 4, C.s4, T, 1); px(X, Y + T - 2, C.s0, T, 2);
    }
    if (k === 'F') {
      const trees = [[4, 6, 5], [11, 5, 5], [7, 11, 5], [13, 12, 4]];
      for (const [cx, cy, rr] of trees) {
        const x = X + cx + Math.round((hh(tx, ty, cx) - 0.5) * 2), y = Y + cy;
        px(x - 1, y + rr - 1, C.bark, 2, 3);
        g.fillStyle = C.f0; ell(g, x, y, rr + 1, rr);
        g.fillStyle = C.f1; ell(g, x, y - 1, rr, rr - 1);
        g.fillStyle = C.f2; ell(g, x - 1, y - 2, rr - 1, rr - 2);
        g.fillStyle = C.f3; ell(g, x - 2, y - 3, Math.max(1, rr - 3), Math.max(1, rr - 3));
        px(x - 3, y - 4, C.f4, 2, 1);
      }
    }
  }
  return c;
}
function ell(g, cx, cy, rx, ry) {
  for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.25)))); g.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
}
const GROUND = paintGround();
function drawWater(g, t) {
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) if (at(tx, ty) === '~') {
    for (let i = 0; i < 3; i++) {
      const ph = Math.floor(t / 140 + tx * 3 + ty * 5 + i * 7) % 18, x = tx * T + 2 + (ph + i * 5) % 11, y = ty * T + 3 + i * 5;
      g.fillStyle = i === 1 ? C.w3 : C.w1; g.fillRect(x, y, 3, 1);
      if (ph % 9 === 0) { g.fillStyle = C.w4; g.fillRect(x + 1, y, 1, 1); }
    }
  }
}

/* ===== sprites (16x16, facing right; enemies are flipped) ===== */
const FIG = [
  '................',
  '......kkkk......',
  '.....kHHHHk.....',
  '....kHhHHHHk....',
  '....kHssssHk....',
  '....ksesesk.....',
  '.....kssssk.....',
  '....kbBBBBbk....',
  '...kbBBlBBBbk...',
  '...kbBBlBBBdk...',
  '...ksdBBBBdsk...',
  '....kdddddk.....',
  '....kLLkLLk.....',
  '....kLk.kLk.....',
  '...kKKk.kKKk....',
  '...kkk...kkk....'
];
const LOOK = {
  scout: { H: '#2a6a5a', h: '#5aa890', B: '#3a7a5a', b: '#5aa878', l: '#8ad0a0', d: '#1e4a38', tool: 'bow' },
  knight: { H: '#a8b0c0', h: '#e8eef8', B: '#2f5fb0', b: '#4a7ad0', l: '#8ab0f0', d: '#1e3a74', tool: 'sword' },
  archer: { H: '#6a4a8a', h: '#9a7ac0', B: '#5a3a90', b: '#7a5ab8', l: '#b09ae0', d: '#34205a', tool: 'staff' },
  raider: { H: '#5a2a24', h: '#8a4a3a', B: '#9a3a2a', b: '#c0583a', l: '#e08a5a', d: '#5a1a14', tool: 'spear' },
  brute: { H: '#3a3a3a', h: '#6a6a6a', B: '#7a2a6a', b: '#a04a8a', l: '#c87ab0', d: '#4a1442', tool: 'axe' }
};
const TOOLS = {
  sword: [[13, 3, 1, 7, '#eef4fc'], [14, 4, 1, 5, '#a8b4c8'], [12, 10, 3, 1, '#c89a3a'], [13, 11, 1, 2, '#6a4422']],
  bow: [[13, 3, 1, 1, '#8a5a2a'], [14, 4, 1, 7, '#a06a32'], [13, 11, 1, 1, '#8a5a2a'], [12, 4, 1, 7, '#e8e0c8']],
  staff: [[13, 1, 1, 14, '#7a5230'], [12, 0, 3, 3, '#7ad0ff'], [13, 1, 1, 1, '#ffffff']],
  spear: [[14, 1, 1, 14, '#5a3e28'], [13, 0, 3, 2, '#d8dce4'], [14, 0, 1, 1, '#ffffff']],
  axe: [[14, 3, 1, 11, '#5a3e28'], [11, 2, 4, 5, '#9a9aa6'], [11, 2, 4, 1, '#d0d0dc']]
};
function figure(kind, grey) {
  const c = mk(16, 16), g = c.getContext('2d'), L = LOOK[kind], pal = Object.assign({ k: '#120c18', s: '#e8b48a', e: '#120c18', L: '#3a2c22', K: '#1e140e' }, L);
  FIG.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  for (const [x, y, w, h, col] of TOOLS[L.tool]) { g.fillStyle = col; g.fillRect(x, y, w, h); }
  if (grey) { const d = g.getImageData(0, 0, 16, 16); for (let i = 0; i < d.data.length; i += 4) { const v = d.data[i] * 0.3 + d.data[i + 1] * 0.5 + d.data[i + 2] * 0.2; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; } g.putImageData(d, 0, 0); }
  return c;
}
const ART = {}; Object.keys(LOOK).forEach(k => { ART[k] = figure(k); });

/* ===== units and the scripted loop ===== */
const START = [
  { id: 'wren', name: 'WREN', kind: 'scout', side: 'player', x: 2, y: 3, vision: 1 },
  { id: 'aldric', name: 'ALDRIC', kind: 'knight', side: 'player', x: 1, y: 7, vision: 0 },
  { id: 'lysa', name: 'LYSA', kind: 'archer', side: 'player', x: 2, y: 9, vision: 0 },
  { id: 'raider1', name: 'RAIDER', kind: 'raider', side: 'enemy', x: 8, y: 6 },
  { id: 'raider2', name: 'RAIDER', kind: 'raider', side: 'enemy', x: 13, y: 3 },
  { id: 'raider3', name: 'RAIDER', kind: 'raider', side: 'enemy', x: 7, y: 10 },
  { id: 'brute', name: 'BRUTE', kind: 'brute', side: 'enemy', x: 15, y: 6 },
  { id: 'raider4', name: 'RAIDER', kind: 'raider', side: 'enemy', x: 12, y: 9 }
];
// [ms, unit, path of tiles]; walking is 220 ms per tile
const SCRIPT = [
  [800, 'wren', [[3, 3], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2]]],
  [1400, 'lysa', [[2, 8], [2, 7], [2, 6], [1, 6], [0, 6], [0, 5]]],
  [3900, 'raider1', [[8, 5], [8, 4]]],
  [5600, 'wren', [[9, 2], [8, 2], [7, 2], [6, 2], [5, 2], [4, 2], [3, 2]]],
  [6000, 'aldric', [[2, 7], [3, 7], [4, 7], [5, 7]]],
  [8600, 'raider2', [[12, 3], [11, 3]]],
  [9200, 'raider3', [[7, 9], [6, 9], [5, 9], [5, 8]]],
  [11200, 'aldric', [[6, 7], [7, 7], [8, 7], [9, 7]]],
  [13200, 'aldric', [[8, 7], [7, 7]]]
];
const STEP_MS = 220;
const S = { t: 0, loopT: 0, units: [], walks: [], sel: 'wren', manual: false, scriptI: 0, revealLog: [] };
function resetWorld() {
  S.units = START.map(u => Object.assign({}, u, { px: u.x * T, py: u.y * T, hp: 1, face: u.side === 'enemy' ? -1 : 1 }));   // the two sides start facing each other; a walk turns the unit (face = last sideways step)
  S.walks = []; S.scriptI = 0; S.loopT = 0; S.revealLog = [];
  if (FOG) { FOG.reset(); FOG.recompute(S.units); }
}
const U = id => S.units.find(u => u.id === id);
function startWalk(u, path) { S.walks = S.walks.filter(w => w.u !== u); if (path.length) S.walks.push({ u, path: path.slice(), i: 0, p: 0 }); }
function stepWorld(dt) {
  S.t += dt;
  if (!S.manual) {
    S.loopT += dt;
    while (S.scriptI < SCRIPT.length && S.loopT >= SCRIPT[S.scriptI][0]) { const [, id, path] = SCRIPT[S.scriptI++]; startWalk(U(id), path); }
    if (S.loopT >= LOOP) resetWorld();
  }
  for (const w of S.walks) {
    w.p += dt / STEP_MS;
    while (w.p >= 1 && w.i < w.path.length) { w.u.x = w.path[w.i][0]; w.u.y = w.path[w.i][1]; w.i++; w.p -= 1; }
    const from = [w.u.x, w.u.y], to = w.path[w.i] || from, f = w.i < w.path.length ? w.p : 0;
    if (to[0] !== from[0]) w.u.face = to[0] > from[0] ? 1 : -1;
    w.u.px = Math.round((from[0] + (to[0] - from[0]) * f) * T); w.u.py = Math.round((from[1] + (to[1] - from[1]) * f) * T);
  }
  S.walks = S.walks.filter(w => w.i < w.path.length);
  FOG.update(dt);   // re-reads the unit list (posOf = drawn tile), animates the fog, ages the pops
}

/* ===== the module ===== */
let FOG = null;
function makeFog() {
  FOG = GameDNA_FogOfWar.create({
    cols: COLS, rows: ROWS, tile: T, view: { x: 0, y: 0, w: W, h: MAP_H }, skin: SKIN_ID, params: P,
    units: () => S.units,
    posOf: u => ({ x: Math.round(u.px / T), y: Math.round(u.py / T) }),   // the tile the unit is drawn on (mid-walk too)
    isPlayer: u => u.side === 'player',
    visionOf: (u, x, y) => P.radius + (u.vision || 0) + (HO.hills === 'on' && at(x, y) === 'H' ? 2 : 0),
    blocks: (x, y) => blocksSight(x, y),
    ghostSprite: u => ({ img: ART[u.kind], flip: flipOf(u) }),
    uiRects: () => [{ x: 0, y: MAP_H, w: W, h: H - MAP_H }],
    getObstacles: () => S.units.map(u => ({ x: u.px, y: u.py, w: T, h: T, id: u.id })),
    onReveal: (u, x, y) => { S.revealLog.push({ t: S.t, id: u.id, x, y }); }
  });
  FOG.recompute(S.units);
}
resetWorld(); makeFog();

/* ===== drawing ===== */
const cv = document.getElementById('cv'), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
const ART_FACING = 1;   // every 16x16 unit sprite is painted looking right
function flipOf(u) { return (u.face < 0 ? -1 : 1) !== ART_FACING; }
function drawUnit(u) {
  const bob = U(S.sel) === u && S.manual ? Math.floor(S.t / 260) % 2 : 0;
  g.fillStyle = 'rgba(10,20,10,0.35)'; g.fillRect(u.px + 3, u.py + 14, 10, 2);
  if (flipOf(u)) { g.save(); g.translate(u.px + T, u.py - bob); g.scale(-1, 1); g.drawImage(ART[u.kind], 0, 0); g.restore(); }
  else g.drawImage(ART[u.kind], u.px, u.py - bob);
}
function drawXray(u) {   // debug: what the fog hides
  g.save(); g.globalAlpha = 0.5; g.strokeStyle = '#ff5a4a'; g.setLineDash([2, 2]); g.strokeRect(u.px + 0.5, u.py + 0.5, T - 1, T - 1); g.restore();
}
function bracket(x, y, col) {
  const o = Math.floor(S.t / 270) % 2;
  for (const [cx, cy, sx, sy] of [[x - o, y - o, 1, 1], [x + 15 + o, y - o, -1, 1], [x - o, y + 15 + o, 1, -1], [x + 15 + o, y + 15 + o, -1, -1]]) {
    g.fillStyle = '#101010'; g.fillRect(Math.min(cx, cx + sx * 3) + 1, cy + 1, 4, 1); g.fillRect(cx + 1, Math.min(cy, cy + sy * 3) + 1, 1, 4);
    g.fillStyle = col; g.fillRect(Math.min(cx, cx + sx * 3), cy, 4, 1); g.fillRect(cx, Math.min(cy, cy + sy * 3), 1, 4);
  }
}
function hud() {
  const y = MAP_H;
  if (UI) { UI.frame(g, { x: 0, y, w: W, h: H - y }, { role: 'window', team: 'a' }); }
  else { g.fillStyle = '#1a2040'; g.fillRect(0, y, W, H - y); }
  const u = U(S.sel), vis = P.radius + (u.vision || 0) + (HO.hills === 'on' && at(u.x, u.y) === 'H' ? 2 : 0);
  const seen = S.units.filter(e => e.side === 'enemy' && FOG.isUnitVisible(e)).length, ghosts = FOG.ghosts().length;
  const T_ = (s, x, yy, c, c2) => UI ? UI.text(g, s, x, yy, { font: 'ui', color: c || '#fff4c8', color2: c2 || '#e8c870' }) : (g.fillStyle = '#fff', g.fillText(s, x, yy + 7));
  g.drawImage(ART[u.kind], 8, y + 8);
  T_(u.name, 28, y + 7); T_('VISION ' + vis + (HO.hills === 'on' && at(u.x, u.y) === 'H' ? ' HILL' : ''), 28, y + 17, '#c8e0ff', '#8cb0e8');
  T_('ENEMIES IN SIGHT ' + seen + '/5', 132, y + 7, '#ffd8cc', '#ffb0a0');
  T_('LAST SEEN ' + ghosts, 132, y + 17, '#d0d8f8', '#a0acd8');
}
function draw() {
  g.globalAlpha = 1; g.clearRect(0, 0, W, H);
  g.drawImage(GROUND, 0, 0); drawWater(g, S.t);
  if (HO.fog === 'on') FOG.draw(g, { x: 0, y: 0 });
  const sorted = S.units.slice().sort((a, b) => a.py - b.py);
  for (const u of sorted) if (u.side === 'player' || HO.fog === 'off' || FOG.isUnitVisible(u)) drawUnit(u);
  if (HO.xray === 'on') for (const u of sorted) if (u.side === 'enemy' && HO.fog === 'on' && !FOG.isUnitVisible(u)) drawXray(u);
  if (HO.fog === 'on') FOG.drawGhosts(g, { x: 0, y: 0 });
  const su = U(S.sel); bracket(su.px, su.py, S.manual ? '#ffe066' : '#ffffff');
  hud();
}

/* ===== boot: ?t=<ms>&freeze=1 replays fixed 60 Hz steps and draws once ===== */
if (FREEZE) {
  const n = Math.round(T_AT / FRAME); for (let i = 0; i < n; i++) stepWorld(FRAME);
  draw();
  document.documentElement.dataset.state = JSON.stringify({ t: Math.round(S.t), seen: S.units.filter(e => e.side === 'enemy' && FOG.isUnitVisible(e)).map(e => e.id), ghosts: FOG.ghosts().map(g2 => g2.unit.id), reveals: S.revealLog.map(r => r.id), pops: FOG.lastDrawn().filter(r => r.kind === 'pop').map(r => [r.owner, r.x, r.y]) });
} else {
  let acc = 0, last = performance.now();
  const loop = now => { acc += Math.min(100, now - last); last = now; while (acc >= FRAME) { stepWorld(FRAME); acc -= FRAME; } draw(); status(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

/* ===== interaction ===== */
function status() {
  const el = document.getElementById('status'); if (!el) return;
  const txt = S.manual ? 'Manual: click a tile to walk ' + U(S.sel).name.toLowerCase() : 'Auto-loop ' + (S.loopT / 1000).toFixed(1) + ' s';
  if (el.textContent !== txt) el.textContent = txt;
}
function pathTo(u, x, y) {   // L-shaped path, stops before walls and water
  const out = []; let cx = u.x, cy = u.y;
  const ok = (a, b) => inMap(a, b) && !'W~'.includes(at(a, b)) && !S.units.some(o => o !== u && o.x === a && o.y === b);
  while (cx !== x) { const nx = cx + Math.sign(x - cx); if (!ok(nx, cy)) break; cx = nx; out.push([cx, cy]); }
  while (cy !== y) { const ny = cy + Math.sign(y - cy); if (!ok(cx, ny)) break; cy = ny; out.push([cx, cy]); }
  return out;
}
function goManual() { if (!S.manual) { S.manual = true; S.walks = []; S.units.forEach(u => { u.px = u.x * T; u.py = u.y * T; }); } }
if (!FREEZE) {
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * W / T), y = Math.floor((e.clientY - r.top) / r.height * H / T);
    if (y >= ROWS) return;
    goManual();
    const there = S.units.find(u => u.side === 'player' && u.x === x && u.y === y);
    if (there) { S.sel = there.id; return; }
    startWalk(U(S.sel), pathTo(U(S.sel), x, y));
  });
  addEventListener('keydown', e => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key, u = U(S.sel);
    if (k === '1' || k === '2' || k === '3') { goManual(); S.sel = ['wren', 'aldric', 'lysa'][+k - 1]; e.preventDefault(); return; }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (d) { goManual(); if (!S.walks.length) startWalk(u, pathTo(u, u.x + d[0], u.y + d[1])); e.preventDefault(); }
  });
  document.getElementById('resume').onclick = () => { S.manual = false; resetWorld(); };
  // parameter controls
  const box = document.getElementById('params');
  PARAMS.forEach(p => {
    const row = document.createElement('div'); row.className = 'row';
    if (p.type === 'range') {
      row.innerHTML = `<label for="p-${p.key}">${p.label}<output id="o-${p.key}"></output></label><input type="range" id="p-${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${P[p.key]}">`;
      box.appendChild(row);
      const inp = row.querySelector('input'), out = row.querySelector('output');
      const sync = () => { out.textContent = P[p.key] + (p.unit ? ' ' + p.unit : ''); inp.style.setProperty('--fill', ((P[p.key] - p.min) / (p.max - p.min) * 100) + '%'); };
      inp.oninput = () => { P[p.key] = +inp.value; FOG.setParams({ [p.key]: P[p.key] }); sync(); };
      sync();
    } else {
      row.innerHTML = `<label for="p-${p.key}">${p.label}</label><select id="p-${p.key}">${p.options.map(o => `<option${o === P[p.key] ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
      box.appendChild(row);
      const sel = row.querySelector('select'); sel.onchange = () => { P[p.key] = sel.value; FOG.setParams({ [p.key]: P[p.key] }); };
    }
  });
  const hb = document.getElementById('host');
  HOST.forEach(p => {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<label>${p.label}</label><div class="seg">${p.options.map(o => `<button type="button" data-v="${o}" aria-checked="${o === HO[p.key]}">${o}</button>`).join('')}</div>`;
    hb.appendChild(row);
    row.querySelectorAll('button').forEach(b => b.onclick = () => { HO[p.key] = b.dataset.v; row.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); });
  });
  document.querySelectorAll('#skinseg button').forEach(b => b.onclick = () => {
    SKIN_ID = b.dataset.skin; document.querySelectorAll('#skinseg button').forEach(x => x.setAttribute('aria-checked', x === b));
    makeFog();
  });
  document.querySelectorAll('[data-variant]').forEach(b => b.onclick = () => {
    const v = JSON.parse(b.dataset.variant); Object.assign(P, v); FOG.setParams(v);
    PARAMS.forEach(p => { const el = document.getElementById('p-' + p.key); if (el) { el.value = P[p.key]; el.dispatchEvent(new Event(p.type === 'range' ? 'input' : 'change')); } });
  });
}
{
  function fit() { const aw = Math.min(document.getElementById('stage').clientWidth - 16, 900), ah = innerHeight - 120; let s = Math.max(1, Math.floor(Math.min(aw / W, Math.max(ah, 300) / H))); cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px'; const si = document.getElementById('scaleinfo'); if (si) si.textContent = `256×224 native · ${s}×`; }
  addEventListener('resize', fit); fit();
}
/* text state for critics and tools/sprites/statecheck.py: every unit (feet = bottom centre of its tile cell, canvas px). facing = u.face, the value
   flipOf() mirrors the sprite by; an enemy the fog hides is not drawn (noFace). */
window.__state = () => ({ t: Math.round(S.t), actors: S.units.map(u => { const w = S.walks.find(k => k.u === u), to = w && w.path[w.i];
  const hidden = u.side === 'enemy' && HO.fog !== 'off' && !FOG.isUnitVisible(u);
  return { id: u.id, x: u.px + T / 2, y: u.py + T, facing: u.face < 0 ? 'left' : 'right', target: null, vx: to ? to[0] - u.x : 0, flipX: flipOf(u), noFace: hidden ? 'hidden by fog, not drawn' : undefined }; }) });
