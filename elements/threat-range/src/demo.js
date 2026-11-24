'use strict';
// B-02 demo: a small original tactics map. Every zone, outline and the THREAT button come from GameDNA_ThreatRange;
// the scene keeps its own units, cursor and selection (like a host game) and answers the module's callbacks.
(() => {
  const W = 256, H = 224, T = 16, COLS = 16, ROWS = 12, HUD_Y = 192, FRAME = 1000 / 60, LOOP = 12000;
  const PARAMS = /*PARAMS*/[];
  const VARIANTS = /*VARIANTS*/[];
  const Q = new URLSearchParams(location.search);
  const FREEZE = Q.get('freeze') === '1', T0 = Q.has('t') ? Math.max(0, Number(Q.get('t')) || 0) : 0;
  const P = {}; PARAMS.forEach(p => { P[p.key] = Q.has(p.key) ? (p.type === 'range' ? Number(Q.get(p.key)) : Q.get(p.key)) : p.default; });
  const canvas = document.getElementById('screen'), g = canvas.getContext('2d');
  const SK = GameDNA_Skin.resolve('pixel16');

  /* ---------- map (original) ---------- */
  const MAP = [
    '..ff....~..hh...',
    '.fff....~...h..f',
    '..f..,,,=,,,...f',
    '....,...~...,..f',
    '#.#.,..~~..f,...',
    '....,..~..ff,.hh',
    '..,,,..~..f.,..h',
    '..,....=,,,,,...',
    '.ff...~~.....##.',
    '.f....~..hh..#..',
    '......~...h.....',
    '..hh..~.........'
  ];
  const TER = { '.': { n: 'Grass', c: 1 }, ',': { n: 'Road', c: 1 }, f: { n: 'Forest', c: 2 }, h: { n: 'Hill', c: 3 }, '~': { n: 'River', c: 99 }, '=': { n: 'Bridge', c: 1 }, '#': { n: 'Wall', c: 99 } };
  const at = (x, y) => MAP[y][x];
  const hash = (x, y, k) => { let h = Math.imul(x + 374761 * k, 668265263) ^ Math.imul(y + 9, 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  // ground and scenery: shared pixel scene kit (pixel-kit/pixel-scene.js). The logic grid above is unchanged; each cell maps to one kit char.
  const PXS = window.GameDNA_PixelScene, KITCH = { '.': '.', ',': 'p', f: ',', h: 'h', '~': 'w', '=': 'b', '#': '#' };
  const TREES = [];
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) if (at(tx, ty) === 'f') {
    const two = hash(tx, ty, 3) < 0.55;
    if (two) { TREES.push({ k: 'smalltree', x: tx * T + 5, y: ty * T + 13, o: { v: Math.floor(hash(tx, ty, 5) * 3) } }); TREES.push({ k: 'bush', x: tx * T + 12, y: ty * T + 16, o: { v: Math.floor(hash(tx, ty, 6) * 2) } }); }
    else TREES.push({ k: 'smalltree', x: tx * T + 8 + Math.round((hash(tx, ty, 7) - 0.5) * 3), y: ty * T + 16, o: { v: Math.floor(hash(tx, ty, 9) * 3) } });
  }
  const SCENE = PXS.scene({ seed: 31, map: MAP.map(r => [...r].map(c => KITCH[c] || '.').join('')), props: TREES });
  const SCENERY = SCENE.items.slice().sort((a, b) => a.y - b.y);
  function drawGround(tMs) { SCENE.drawGround(g, tMs, 0, 0); SCENERY.forEach(it => { if (!it.flat) it.draw(g, tMs, 0, 0); }); }

  /* ---------- units (original pixel art) ---------- */
  const BODY = [
    '.....oooooo.....', '....ohhhhhho....', '...ohhHHhhhho...', '...ohsssssho....', '...osseseesso...', '....osssssso....', '.....oooooo.....',
    '....obbBBbbbo...', '...obbBBBbbbbo..', '..oabbbbbbbbdao.', '..oaobbbbbbdoao.', '...o.oddddddo.o.', '.....oppppppo...', '.....opp..ppo...', '....okko..okko..', '....oooo..oooo..'
  ];
  const BASE = { o: '#120c18', s: '#f0c098', e: '#120c18', p: '#3a2e40', k: '#2a1c14' };
  function bake(pal, gear) {
    const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d');
    BODY.forEach((row, y) => [...row].forEach((ch, i) => { const col = pal[ch] || BASE[ch]; if (col && ch !== '.') { x.fillStyle = col; x.fillRect(i, y, 1, 1); } }));
    gear.forEach(([gx, gy, w, h, col]) => { x.fillStyle = col; x.fillRect(gx, gy, w, h); });
    return c;
  }
  const BLUE = { h: '#9aa6c0', H: '#d8e0f0', b: '#3a64d8', B: '#7aa0f8', d: '#223e96', a: '#e8eef8' };
  const RED = { h: '#6a2a24', H: '#a04a3a', b: '#b8402e', B: '#e8705a', d: '#6a1c1e', a: '#f0c098' };
  const GEAR = {
    sword: [[14, 2, 1, 8, '#e8f0f8'], [13, 10, 3, 1, '#a07030']], staff: [[14, 1, 1, 14, '#8a5a2a'], [13, 0, 3, 2, '#7af0d0']],
    bow: [[13, 3, 1, 9, '#a0703a'], [14, 2, 1, 1, '#a0703a'], [14, 12, 1, 1, '#a0703a'], [15, 3, 1, 9, '#e8e0c8']],
    axe: [[14, 3, 1, 11, '#6a4a2a'], [12, 2, 4, 4, '#b8b8c4'], [12, 2, 4, 1, '#e8e8f0']],
    lance: [[14, 0, 1, 15, '#6a4a2a'], [13, 0, 3, 2, '#e0e8f0']], orb: [[13, 6, 3, 3, '#c070ff'], [13, 6, 1, 1, '#f0d0ff']]
  };
  const ROSTER = [
    { id: 'knight', name: 'Knight', side: 'a', x: 2, y: 6, mv: 5, rng: [1, 1], hp: 34, max: 34, pal: BLUE, gear: 'sword' },
    { id: 'cleric', name: 'Cleric', side: 'a', x: 1, y: 9, mv: 5, rng: [1, 1], hp: 22, max: 24, pal: Object.assign({}, BLUE, { b: '#e8e8f0', B: '#ffffff', d: '#9aa0c0', h: '#e0b040', H: '#f8d870' }), gear: 'staff' },
    { id: 'scout', name: 'Scout', side: 'a', x: 4, y: 3, mv: 6, rng: [1, 2], hp: 26, max: 26, pal: Object.assign({}, BLUE, { b: '#3a8a52', B: '#78c488', d: '#1e5a34', h: '#6a3e22', H: '#9a6a3a' }), gear: 'bow' },
    { id: 'brute', name: 'Brute', side: 'b', x: 11, y: 1, mv: 4, rng: [1, 1], hp: 30, max: 30, pal: RED, gear: 'axe' },
    { id: 'archer', name: 'Archer', side: 'b', x: 13, y: 5, mv: 4, rng: [2, 2], hp: 20, max: 20, pal: Object.assign({}, RED, { b: '#8a6a2a', B: '#c0a050', d: '#5a4018' }), gear: 'bow' },
    { id: 'rider', name: 'Rider', side: 'b', x: 14, y: 10, mv: 7, rng: [1, 1], hp: 28, max: 28, pal: Object.assign({}, RED, { b: '#7a2a5a', B: '#b05a90', d: '#4a1438' }), gear: 'lance' },
    { id: 'hexer', name: 'Hexer', side: 'b', x: 10, y: 3, mv: 4, rng: [1, 2], hp: 18, max: 18, pal: Object.assign({}, RED, { b: '#4a2a7a', B: '#7a5ab8', d: '#2a1450', h: '#2a1450', H: '#4a2a7a' }), gear: 'orb' }
  ];
  ROSTER.forEach(r => { r.art = bake(r.pal, GEAR[r.gear]); });

  /* ---------- scene state + scripted demo ---------- */
  let S, tr;
  const SCRIPT = [   // [ms, action]: what the demo does by itself until a key is pressed
    [900, 'toggle'], [2400, 'walkRider'], [4300, 'cursor:knight'], [4700, 'select'], [6200, 'deselect'], [6500, 'cursor:archer'],
    [8000, 'cursor:5,8'], [8200, 'toggle'], [8500, 'cursor:hexer'], [8800, 'pin'], [9300, 'cursor:brute'], [9600, 'pin'], [10200, 'cursor:5,8'], [10800, 'toggle']
  ];
  function reset() {
    S = { f: 0, units: ROSTER.map(r => Object.assign({}, r)), cur: { x: 5, y: 8, px: 5 * T, py: 8 * T }, sel: null, walk: null, script: !Q.has('manual'), done: 0, msg: '' };
  }
  const byId = id => S.units.find(u => u.id === id);
  const unitAt = (x, y) => S.units.find(u => u.hp > 0 && u.x === x && u.y === y) || null;
  function makeTR() {
    tr = GameDNA_ThreatRange.create({
      cols: COLS, rows: ROWS, tile: T, view: { x: 0, y: 0, w: W, h: HUD_Y }, skin: 'pixel16', params: P,
      cost: (x, y) => TER[at(x, y)].c, occupant: unitAt, posOf: u => ({ x: u.x, y: u.y }), moveOf: u => u.mv, rangeOf: u => u.rng,
      enemies: () => S.units.filter(u => u.side === 'b'), idOf: u => u.id,
      playerRange: () => S.sel ? S.selMove : null,
      getObstacles: () => S.units.filter(u => u.hp > 0).flatMap(u => { const p = unitDrawPos(u); return [   // sprite image (redrawn over the zone with layer 'over') + its HP bar
        { x: p.x, y: p.y, w: T, h: T, id: u.id, img: u.art, flip: faceOf(u) !== ART_FACING }, { x: p.x + 1, y: p.y + p.bob + 15, w: 14, h: 3 }]; }),
      uiRects: () => [{ x: 0, y: HUD_Y, w: W, h: H - HUD_Y }]
    });
  }
  function act(a) {
    if (a === 'toggle') tr.toggle();
    else if (a === 'walkRider') { const u = byId('rider'); S.walk = { u, path: [[14, 10], [13, 10], [12, 10], [11, 10], [11, 9], [10, 8]], i: 0, f: 0 }; }
    else if (a.startsWith('cursor:')) { const v = a.slice(7), u = byId(v); if (u) { S.cur.x = u.x; S.cur.y = u.y; } else { const [x, y] = v.split(',').map(Number); S.cur.x = x; S.cur.y = y; } }
    else if (a === 'select' || a === 'pin' || a === 'deselect') press(a === 'deselect' ? 'back' : 'ok');
  }
  function press(k) {
    const c = S.cur;
    if (k === 'left') c.x = Math.max(0, c.x - 1); if (k === 'right') c.x = Math.min(COLS - 1, c.x + 1);
    if (k === 'up') c.y = Math.max(0, c.y - 1); if (k === 'down') c.y = Math.min(ROWS - 1, c.y + 1);
    if (k === 'threat') tr.toggle();
    if (k === 'ok') {
      const u = unitAt(c.x, c.y);
      if (S.sel) { S.sel = null; }
      else if (u && u.side === 'a') { S.sel = u; S.selMove = tr.zoneOf(u).move; }
      else if (u && u.side === 'b') tr.toggleUnit(u);
    }
    if (k === 'back') { if (S.sel) S.sel = null; else tr.clearPins(); }
  }
  function step(keys) {
    S.f++;
    const ms = S.f * FRAME;
    if (S.script) {
      SCRIPT.forEach(([at, a], i) => { if (S.done <= i && ms >= at) { act(a); S.done = i + 1; } });
      if (ms >= LOOP) { const keepScript = S.script; reset(); S.script = keepScript; tr.clear(); }
    }
    keys.forEach(press);
    if (S.walk) {   // the host moves its unit one tile at a time; the module notices and redraws the zone
      const w = S.walk; w.f++;
      if (w.f >= 8) { w.f = 0; w.i++; w.u.x = w.path[w.i][0]; w.u.y = w.path[w.i][1]; if (w.i >= w.path.length - 1) S.walk = null; }
    }
    // pointing at an enemy (no unit selected) shows just its reach
    const there = unitAt(S.cur.x, S.cur.y);
    tr.showUnit(!S.sel && there && there.side === 'b' ? there : null);
    S.cur.px += Math.sign(S.cur.x * T - S.cur.px) * Math.ceil(Math.abs(S.cur.x * T - S.cur.px) / 2);
    S.cur.py += Math.sign(S.cur.y * T - S.cur.py) * Math.ceil(Math.abs(S.cur.y * T - S.cur.py) / 2);
    tr.update(FRAME);
  }

  /* ---------- drawing ---------- */
  function drawWater(t) {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (at(x, y) === '~') for (let i = 0; i < 2; i++) {
      const ph = (Math.floor(t / 140) + x * 3 + y * 5 + i * 7) % 12;
      g.fillStyle = i ? '#9ad0f0' : '#5a9ad0'; g.fillRect(x * T + 2 + ((ph * 3 + i * 5) % 11), y * T + 4 + i * 6 + ((x + y) % 3), 3, 1);
    }
  }
  function unitDrawPos(u) {
    const walking = S.walk && S.walk.u === u, w = S.walk;
    let X = u.x * T, Y = u.y * T;
    if (walking && w.i < w.path.length - 1) { const [ax, ay] = w.path[w.i], [bx, by] = w.path[w.i + 1], k = w.f / 8; X = Math.round((ax + (bx - ax) * k) * T); Y = Math.round((ay + (by - ay) * k) * T); }
    const bob = (Math.floor((S.f + u.x * 7) / 24) % 2) && !walking ? 1 : 0;
    return { x: X, y: Y - bob, bob, walking };
  }
  // facing: BODY is a front-view figure whose side is its weapon hand, on the RIGHT of the sprite (native side: right).
  // A unit turns its weapon side to the other army (mean x of its living units); the mirror is computed from that, never typed per side.
  const ART_FACING = 'right';
  function foeX(u) { const f = S.units.filter(v => v.side !== u.side && v.hp > 0); return f.length ? f.reduce((n, v) => n + v.x, 0) / f.length : null; }
  function faceOf(u) { const fx = foeX(u); return fx == null || fx === u.x ? (u.side === 'a' ? 'right' : 'left') : fx > u.x ? 'right' : 'left'; }
  function drawUnit(u) {
    const q = unitDrawPos(u), X = q.x, Y = q.y + q.bob, bob = q.bob;
    g.fillStyle = 'rgba(10,24,8,0.45)'; g.fillRect(X + 3, Y + 14, 10, 2);
    g.save();
    if (faceOf(u) !== ART_FACING) { g.translate(X + T, Y - bob); g.scale(-1, 1); g.drawImage(u.art, 0, 0); } else g.drawImage(u.art, X, Y - bob);
    g.restore();
    if (S.sel === u) { g.fillStyle = '#ffffff'; g.globalAlpha = (S.f >> 3) % 2 ? 0.35 : 0; g.globalCompositeOperation = 'lighter'; g.drawImage(u.art, X, Y - bob); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    g.fillStyle = '#0a0612'; g.fillRect(X + 1, Y + 15, 14, 3); g.fillStyle = u.side === 'a' ? '#7cc8ff' : '#ff8a6a'; g.fillRect(X + 2, Y + 16, Math.round(12 * u.hp / u.max), 1);
    if (tr.state().pinned.includes(u.id)) {   // pin flag: 5x7 with ink rim, above the head and clear of the cursor corners
      const px = X + 5, py = Y - 9 - bob;
      g.fillStyle = SK.palette.ink; g.fillRect(px - 1, py - 1, 7, 6); g.fillRect(px - 1, py + 4, 2, 5);
      g.fillStyle = SK.palette.text.accent; g.fillRect(px, py, 5, 4); g.fillStyle = SK.palette.overlay.attack.fill; g.fillRect(px + 1, py + 1, 3, 2);
      g.fillStyle = '#c8c8d8'; g.fillRect(px, py + 4, 1, 4);
    }
  }
  function drawPlayerRange(t) {
    if (!S.sel) return;
    const set = S.selMove, has = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && set.has(y * COLS + x);
    set.forEach(k => { const x = k % COLS, y = (k / COLS) | 0; SK.overlay(g, { x: x * T, y: y * T, w: T, h: T }, 'move', t, { grow: 1, pattern: 'pulsing', tile: { x, y }, edges: { top: !has(x, y - 1), bottom: !has(x, y + 1), left: !has(x - 1, y), right: !has(x + 1, y) }, seams: { right: has(x + 1, y), bottom: has(x, y + 1) } }); });
  }
  function drawHud() {
    const r = { x: 0, y: HUD_Y, w: W, h: H - HUD_Y };
    SK.frame(g, r, { role: 'window', team: 'n' });
    const c = S.cur, u = unitAt(c.x, c.y), by = tr.threatAt(c.x, c.y), st = tr.state();
    SK.text(g, (u ? u.name : TER[at(c.x, c.y)].n).toUpperCase(), 8, HUD_Y + 7, { font: 'ui', color: SK.palette.text.title, color2: SK.palette.text.title2 });
    const danger = by.length ? 'DANGER ' + by.length : 'SAFE';
    SK.text(g, danger, 8, HUD_Y + 18, { font: 'ui', color: by.length ? '#ffb0a0' : '#b8f0b0', color2: by.length ? '#ff6a50' : '#6ad070' });
    const others = st.pinned.filter(id => id !== st.focus).length, mode = st.focus ? (others ? st.focus.toUpperCase() + ' AND PINS' : 'ONLY ' + st.focus.toUpperCase()) : st.all ? (st.pinned.length ? 'ALL AND PINS' : 'ALL ENEMIES') : st.pinned.length ? 'PINNED ' + st.pinned.length : 'HIDDEN';
    SK.text(g, mode, 96, HUD_Y + 7, { font: 'ui', color: SK.palette.text.label, color2: SK.palette.text.label2 });
    SK.text(g, S.sel ? 'MOVE SHOWN' : 'T ZONE  Z PIN', 96, HUD_Y + 18, { font: 'ui', color: SK.palette.text.main, color2: SK.palette.text.main2 });
    SK.text(g, String(st.tiles), 230, HUD_Y + 7, { font: 'ui', align: 'right', color: SK.palette.text.gold, color2: SK.palette.text.gold2 });
    SK.text(g, 'TILES', 248, HUD_Y + 18, { font: 'ui', align: 'right', color: SK.palette.text.dim, color2: SK.palette.text.dim2 });
  }
  function render() {
    const t = S.f / 60;
    drawGround(S.f * FRAME);
    drawPlayerRange(t);
    const under = P.layer === 'under';
    if (under) tr.draw(g, { x: 0, y: 0 });
    S.units.filter(u => u.hp > 0).sort((a, b) => a.y - b.y).forEach(drawUnit);
    if (!under) tr.draw(g, { x: 0, y: 0 });
    SK.cursor(g, { x: S.cur.px, y: S.cur.py, w: T, h: T }, 'bracket', t, {});
    drawHud();
    tr.drawButton(g);
    document.getElementById('clock').textContent = 't = ' + Math.round(S.f * FRAME) + ' ms';
    document.getElementById('status').textContent = S.script ? 'Script running: press a key to take over.' : 'Your turn: T zone, Z pin / select, X back.';
  }

  /* ---------- controls ---------- */
  function fit() {
    const avail = Math.min(780, (canvas.parentElement.parentElement.clientWidth || W) - 12), k = Math.max(1, Math.floor(avail / W));
    canvas.style.width = W * k + 'px'; canvas.style.height = H * k + 'px';
  }
  addEventListener('resize', fit);
  function syncURL() { const u = new URLSearchParams(); PARAMS.forEach(p => { if (String(P[p.key]) !== String(p.default)) u.set(p.key, P[p.key]); }); history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : '')); }
  function apply() { tr.setParams(P); syncURL(); if (FREEZE) render(); }
  function buildParams() {
    const box = document.getElementById('params'); box.innerHTML = '';
    PARAMS.forEach(p => {
      const row = document.createElement('div'); row.className = 'row';
      if (p.type === 'range') {
        row.innerHTML = `<label><span>${p.label}</span><output>${P[p.key]}</output></label><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${P[p.key]}">`;
        const inp = row.querySelector('input'), out = row.querySelector('output');
        const paint = () => inp.style.setProperty('--fill', ((inp.value - p.min) / (p.max - p.min) * 100) + '%'); paint();
        inp.addEventListener('input', () => { P[p.key] = Number(inp.value); out.textContent = inp.value; paint(); apply(); });
      } else {
        row.innerHTML = `<label><span>${p.label}</span></label><div class="seg" role="radiogroup">${p.options.map(o => `<button role="radio" data-v="${o}" aria-checked="${String(P[p.key]) === o}">${o.replace(/^Key/, '')}</button>`).join('')}</div>`;
        row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { P[p.key] = b.dataset.v; row.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); apply(); }));
      }
      box.appendChild(row);
    });
    const vb = document.getElementById('variants'); vb.innerHTML = '';
    VARIANTS.forEach(v => { const b = document.createElement('button'); b.textContent = v.name; b.addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); Object.assign(P, v.params); buildParams(); apply(); }); vb.appendChild(b); });
  }
  let pending = [];
  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'ok', Z: 'ok', Enter: 'ok', x: 'back', X: 'back', Escape: 'back' };
  function human(k) { if (S.script) { S.script = false; } pending.push(k); }
  addEventListener('keydown', e => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (tr.key(e.code, true, e.repeat)) { e.preventDefault(); if (S.script) S.script = false; return; }   // the module's own toggle key
    const k = KEYS[e.key]; if (!k) return; e.preventDefault(); if (!e.repeat) human(k);
  });
  addEventListener('keyup', e => tr.key(e.code, false));
  document.querySelectorAll('.keys button').forEach(b => b.addEventListener('click', () => human(b.dataset.k)));
  canvas.addEventListener('pointerdown', e => {
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    if (tr.click(x, y)) { S.script = false; return; }
    if (y < HUD_Y) { human('noop'); S.cur.x = Math.floor(x / T); S.cur.y = Math.floor(y / T); pending.push('ok'); }
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || S.script) return;
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    if (y < HUD_Y) { S.cur.x = Math.floor(x / T); S.cur.y = Math.floor(y / T); }
  });
  document.getElementById('replay').addEventListener('click', () => { reset(); makeTR(); });
  document.getElementById('reset').addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); buildParams(); apply(); });

  /* ---------- boot ---------- */
  fit(); buildParams(); reset(); makeTR();
  const n = Math.floor(T0 / FRAME);
  for (let i = 0; i < n; i++) step([]);
  if (FREEZE) { render(); document.documentElement.dataset.ready = '1'; }
  else {
    let last = performance.now(), acc = 0;
    const loop = now => { acc += Math.min(250, now - last); last = now; while (acc >= FRAME) { step(pending); pending = []; acc -= FRAME; } render(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  /* text state for critics and tools/sprites/statecheck.py: facing = faceOf(u), the value drawUnit() mirrors by;
     target = mean x (canvas px) of the other army; vx while a unit walks its path */
  window.__state = () => ({ t: Math.round(S.f * FRAME), actors: S.units.map(u => {
    const q = unitDrawPos(u), fx = foeX(u), o = { id: u.id, x: q.x + 8, y: q.y + q.bob + 16, facing: faceOf(u), target: fx == null ? null : Math.round(fx * T + 8) };
    if (q.walking && S.walk.i < S.walk.path.length - 1) o.vx = S.walk.path[S.walk.i + 1][0] - S.walk.path[S.walk.i][0];
    if (u.hp <= 0) o.noFace = 'dead (not drawn)';
    return o; }) });
  window.__trDemo = { state: () => S, tr: () => tr };
})();
