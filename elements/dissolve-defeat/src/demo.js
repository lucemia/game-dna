/* ===== E-03 demo: four monsters, one per variant; the battle ends as soon as the last one falls ===== */
const cv = document.getElementById('cv'), g = cv.getContext('2d');
g.imageSmoothingEnabled = false;

const PARAMS = [
  { key: 'variant', label: 'Variant', type: 'select', options: ['mixed', 'dither', 'slice', 'crumble', 'flash'], default: 'mixed' },
  { key: 'duration', label: 'Duration', type: 'range', min: 300, max: 1200, step: 50, default: 700, unit: 'ms' },
  { key: 'flash', label: 'White flash first', type: 'range', min: 0, max: 240, step: 20, default: 100, unit: 'ms' },
  { key: 'edge', label: 'Edge colour', type: 'select', options: ['white', 'hot', 'cold', 'crit', 'none'], default: 'white' },
  { key: 'chunk', label: 'Crumble chunk', type: 'select', options: ['1', '2', '3'], default: '1' },
  { key: 'spill', label: 'Spill margin', type: 'range', min: 0, max: 8, step: 1, default: 3, unit: 'px' }
];
const P = {}; PARAMS.forEach(p => P[p.key] = p.default);
const MIX = { golem: 'crumble', wisp: 'dither', slime: 'slice', bat: 'flash' };
const KILLS = [['golem', 600], ['wisp', 760], ['slime', 920], ['bat', 1080]];
const LOOP = 5600, RESPAWN = 3800;
let END = 'now';

/* ----- two extra monsters for this demo (original art) ----- */
function buildSlime(fr) {
  return sprite(26, 18, 13, 17, g2 => {
    const sq = fr ? 1 : 0, R = ['#1a5a3a', '#2e9a52', '#6ad86a', '#d8ffc0'];
    ell(g2, 13, 11 + sq, 12 + sq, 6 - sq, R[0]); ell(g2, 12, 10 + sq, 11 + sq, 5 - sq, R[1]);
    ell(g2, 13, 7 + sq, 6, 4 - sq, R[1]); ell(g2, 10, 7 + sq, 4, 2, R[2]); px(g2, 8, 6 + sq, R[3]); px(g2, 9, 6 + sq, R[3]);
    rect(g2, 2, 15, 22, 1, '#14402a');
    rect(g2, 9, 10 + sq, 2, 3, '#0a1a12'); rect(g2, 15, 10 + sq, 2, 3, '#0a1a12'); px(g2, 9, 10 + sq, '#ffffff'); px(g2, 15, 10 + sq, '#ffffff');
    rect(g2, 11, 14, 4, 1, '#0a1a12');
    for (const [x, y] of [[19, 8], [5, 12], [21, 12]]) { px(g2, x, y + sq, R[2]); px(g2, x + 1, y + sq, R[0]); }
  }, '#0a1a12');
}
function buildBat(fr) {
  return sprite(30, 18, 15, 17, g2 => {
    const up = fr === 0, W1 = ['#2a1a3a', '#4a2a6a', '#7a4aa0', '#c8a0e8'];
    for (const s of [-1, 1]) for (let i = 0; i < 11; i++) {
      const x = 15 + s * (3 + i), y0 = up ? 7 - Math.round(i * 0.5) : 8 + Math.round(i * 0.35), h = Math.max(1, 6 - (i >> 1) - (i % 3 === 2 ? 2 : 0));
      rect(g2, x, y0, 1, h, i < 3 ? W1[1] : W1[0]); px(g2, x, y0, W1[2]);
    }
    ball(g2, 15, 10, 4, 5, W1); px(g2, 12, 4, W1[1]); px(g2, 13, 5, W1[1]); px(g2, 18, 4, W1[1]); px(g2, 17, 5, W1[1]);
    px(g2, 13, 9, '#ffe070'); px(g2, 17, 9, '#ffe070'); px(g2, 14, 12, '#ffffff'); px(g2, 16, 12, '#ffffff');
  }, '#120a1c');
}
function initDemoSprites() { initSprites(); for (let f = 0; f < 2; f++) { SPR['slime_' + f] = buildSlime(f); SPR['bat_' + f] = buildBat(f); } }

function makeCast() {
  const a = makeActors();
  a.find(x => x.id === 'golem').hx = 50; a.find(x => x.id === 'golem').hy = 142;
  a.push({ id: 'slime', name: 'MOSS SLIME', side: 'foe', hx: 120, hy: 150, hp: 1, max: 1, top: 18, half: 12 });
  a.push({ id: 'bat', name: 'DUSK BAT', side: 'foe', hx: 84, hy: 70, hp: 1, max: 1, top: 18, half: 14 });
  return a.map(x => Object.assign(x, { x: x.hx, y: x.hy, pose: 'idle', gone: false, spawnT: -1e9 }));
}
function foeSprite(a, wt) {
  if (a.id === 'wisp') return SPR['wisp_' + (Math.floor(wt / 140) % 4)];
  if (a.id === 'slime') return SPR['slime_' + (Math.floor(wt / 300) % 2)];
  if (a.id === 'bat') return SPR['bat_' + (Math.floor(wt / 120) % 2)];
  return SPR[a.id + '_' + a.pose] || SPR[a.id + '_idle'];
}
function lift(a, wt) { return a.id === 'wisp' ? (a.hover || 0) + Math.round(Math.sin(wt / 260) * 2) : a.id === 'bat' ? Math.round(Math.sin(wt / 200) * 2) : 0; }
// where the sprite is drawn right now (the rect the snapshot uses)
function spriteRect(a, wt) { const s = foeSprite(a, wt); return { x: Math.round(a.x - s.ax), y: Math.round(a.y - lift(a, wt) - s.ay), w: s.w, h: s.h, s }; }

/* ----- the dissolve module (skin: pixel16) ----- */
const DD = GameDNA_DissolveDefeat.create({
  view: { x: 0, y: 0, w: W, h: FIELD_H }, skin: 'pixel16', seed: 7,
  params: { variant: 'dither', duration: P.duration, flash: P.flash, edge: P.edge, chunk: +P.chunk, spill: P.spill },
  uiRects: () => S.won != null ? [bannerBox('VICTORY')] : []
});
function ddParams() { DD.setParams({ variant: P.variant === 'mixed' ? 'dither' : P.variant, duration: +P.duration, flash: +P.flash, edge: P.edge, chunk: +P.chunk, spill: +P.spill }); }

/* ----- state ----- */
const S = { rt: 0, wt: 0, lt: 0, actors: [], fx: [], queue: [], won: null, manualT: -1e9 };
function restart() { S.lt = 0; S.actors = makeCast(); S.fx = []; S.queue = []; S.won = null; DD.clear(); }
function A(id) { return S.actors.find(a => a.id === id); }
function strike(id, delay) {
  const a = A(id); if (!a || a.gone || S.queue.some(q => q.id === id)) return;
  const r = spriteRect(a, S.wt);
  S.fx.push({ kind: 'slash', x: a.x, y: r.y + r.h / 2, t0: S.wt, dir: 1 });
  S.queue.push({ id, at: S.wt + (delay == null ? 60 : delay) });
}
function defeat(id) {
  const a = A(id); if (!a || a.gone) return;
  const r = spriteRect(a, S.wt), variant = P.variant === 'mixed' ? MIX[id] : P.variant;
  if (id === 'golem') DD.defeat(id, { rect: r, variant, drawSprite: ctx => drawSpr(ctx, r.s, a.x, a.y - lift(a, S.wt)) });   // callback form
  else DD.defeat(id, { rect: r, image: r.s.c, variant });                                                                     // image form
  a.gone = true; a.goneT = S.wt;          // the game removes the unit at once
  S.fx.push({ kind: 'sparks', x: a.x, y: r.y + r.h / 2, t0: S.wt, P: fxParticles(id.length * 31 + Math.round(S.wt), 10, Math.PI * 1.6, 1.6) });
}
function step() {
  S.rt += FRAME; S.wt += FRAME; const lt0 = S.lt; S.lt += FRAME;
  const crossed = T => lt0 < T && S.lt >= T;
  if (S.wt - S.manualT > 2500) for (const [id, T] of KILLS) if (crossed(T - 60)) strike(id);
  for (const q of S.queue.filter(q => S.wt >= q.at)) defeat(q.id);
  S.queue = S.queue.filter(q => S.wt < q.at);
  const foes = S.actors.filter(a => a.side === 'foe');
  // battle end: 'now' never waits for the effect; 'await' waits until busy() is false (the effect always ends)
  if (S.won == null && foes.every(a => a.gone) && (END === 'now' || !DD.busy())) S.won = S.wt;
  if (crossed(RESPAWN)) { for (const a of foes) if (a.gone) { a.gone = false; a.spawnT = S.wt; } S.won = null; }
  if (S.lt >= LOOP) restart();
  const r = A('rowan'); if (r) r.pose = S.fx.some(f => f.kind === 'slash' && S.wt - f.t0 < 160) ? 'attack' : 'idle';
  DD.update(FRAME);
}

/* ----- drawing ----- */
const VC = { dither: '#6ae8b8', slice: '#6ad8f0', crumble: '#ffb43a', flash: '#ffffff' };
function drawFoe(a) {
  if (a.gone) return;
  const r = spriteRect(a, S.wt), sa = S.wt - a.spawnT;
  if (sa < 300) { const al = [0.25, 0.5, 0.75, 1][Math.floor(sa / 75)]; g.globalAlpha = al; }
  if (a.id === 'bat') { g.globalAlpha *= 0.45; ell(g, a.x, 104, 6, 1, '#05040a'); g.globalAlpha = sa < 300 ? [0.25, 0.5, 0.75, 1][Math.floor(sa / 75)] : 1; }
  else shadow(g, a.x, a.y, a.id === 'golem' ? 20 : a.id === 'wisp' ? 8 : 11);
  if (a.id === 'wisp') { g.globalCompositeOperation = 'lighter'; for (const [rr, al] of [[16, 0.06], [11, 0.08]]) { g.globalAlpha = al; ell(g, a.x, r.y + 18, rr, rr, '#4affc0'); } g.globalAlpha = sa < 300 ? 0.5 : 1; g.globalCompositeOperation = 'source-over'; }
  g.drawImage(r.s.c, r.x, r.y); g.globalAlpha = 1;
}
function drawHero(a) {
  const s = SPR[a.id + '_' + a.pose] || SPR[a.id + '_idle'], bob = Math.floor((S.wt + a.hx * 7) / 420) % 2;
  shadow(g, a.x, a.y, 9); drawSpr(g, s, a.x, a.y - (bob && a.pose === 'idle' ? 1 : 0));
}
function render() {
  drawBG(g, S.rt);
  const cast = S.actors.slice().sort((p, q) => p.y - q.y);
  for (const a of cast) a.side === 'foe' ? drawFoe(a) : drawHero(a);
  DD.draw(g);                                                    // after the units, before banner and HUD
  S.fx = S.fx.filter(f => drawFx(g, f, S.wt));
  if (S.won != null) drawBanner(g, 'VICTORY');
  drawWin(g, 2, 158, 140, 64); drawWin(g, 144, 158, 110, 64);
  const foes = S.actors.filter(a => a.side === 'foe');
  foes.forEach((a, i) => {
    const y = 166 + i * 13, v = P.variant === 'mixed' ? MIX[a.id] : P.variant, busy = DD.busy(a.id);
    drawText(g, a.name, 12, y, a.gone ? '#6a6a88' : '#ffffff');
    drawText(g, v.toUpperCase(), 84, y, VC[v]);
    if (busy) { rect(g, 131, y + 2, 3, 3, '#ffe070'); px(g, 131, y + 2, '#fff8d0'); } else if (a.gone) rect(g, 130, y + 3, 5, 1, '#6a6a88');
  });
  [['ROWAN', 0], ['MIRA', 1]].forEach(([n, i]) => { drawText(g, n, 154, 166 + i * 12, '#ffffff'); drawGauge(g, 196, 167 + i * 12, 50, 5, 1, 'hp'); });
  drawText(g, 'BUSY', 154, 192, '#9ab0e0'); drawText(g, DD.busy() ? 'YES' : 'NO', 196, 192, DD.busy() ? '#ffe070' : '#9ab0e0');
  drawText(g, 'END', 154, 204, '#9ab0e0'); drawText(g, END === 'now' ? 'AT ONCE' : 'AWAIT', 196, 204, '#c8eeff');
  const st = document.getElementById('status');
  if (st) st.textContent = (S.wt - S.manualT < 2500 ? 'Manual' : 'Auto-loop') + ' · ' + DD.count() + ' dissolving' + (S.won != null ? ' · VICTORY shown' : '');
}

/* ===== page wiring ===== */
const Q = new URLSearchParams(location.search);
PARAMS.forEach(p => { if (Q.has(p.key)) { const v = Q.get(p.key); P[p.key] = p.type === 'range' ? clamp(+v, p.min, p.max) : p.options.includes(v) ? v : p.default; } });
if (Q.get('end') === 'await') END = 'await';
ddParams();
function buildParams() {
  const box = document.getElementById('params');
  for (const p of PARAMS) {
    const row = document.createElement('div'); row.className = 'row';
    if (p.type === 'range') {
      row.innerHTML = `<label for="p-${p.key}"><span>${p.label}</span><output id="o-${p.key}"></output></label><input type="range" id="p-${p.key}" min="${p.min}" max="${p.max}" step="${p.step}">`;
      box.appendChild(row); const inp = row.querySelector('input'), out = row.querySelector('output');
      const sync = () => { out.textContent = P[p.key] + ' ' + p.unit; inp.style.setProperty('--fill', ((P[p.key] - p.min) / (p.max - p.min) * 100) + '%'); };
      inp.value = P[p.key]; sync(); inp.addEventListener('input', () => { P[p.key] = +inp.value; ddParams(); sync(); syncURL(); });
    } else {
      row.innerHTML = `<label><span>${p.label}</span></label><div class="seg" role="radiogroup" aria-label="${p.label}">` + p.options.map(o => `<button type="button" role="radio" data-v="${o}">${p.key === 'chunk' ? o + ' px' : o}</button>`).join('') + '</div>';
      box.appendChild(row);
      const btns = [...row.querySelectorAll('button')], sync = () => btns.forEach(b => b.setAttribute('aria-checked', b.dataset.v === String(P[p.key])));
      sync(); btns.forEach(b => b.addEventListener('click', () => { P[p.key] = b.dataset.v; ddParams(); sync(); syncURL(); }));
    }
  }
}
function userAct(k) {
  if (k === 'replay') { S.manualT = -1e9; restart(); return; }
  S.manualT = S.wt;
  if (k === 'all') { ['golem', 'wisp', 'slime', 'bat'].forEach((id, i) => strike(id, 60 + i * 120)); return; }
  const a = A(k); if (!a) return;
  if (a.gone && !DD.busy(k)) { a.gone = false; a.spawnT = S.wt; S.won = null; return; }   // revive to try again
  strike(k);
}
function wire() {
  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => userAct(b.dataset.act)));
  document.getElementById('reset').addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); ddParams(); document.getElementById('params').innerHTML = ''; buildParams(); syncURL(); });
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { SPEED = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach(x => x.setAttribute('aria-checked', x === b)); }));
  document.querySelectorAll('[data-end]').forEach(b => { b.setAttribute('aria-checked', b.dataset.end === END); b.addEventListener('click', () => { END = b.dataset.end; document.querySelectorAll('[data-end]').forEach(x => x.setAttribute('aria-checked', x === b)); syncURL(); }); });
  cv.addEventListener('pointerdown', e => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    const hit = S.actors.filter(a => a.side === 'foe').find(a => { const b = spriteRect(a, S.wt); return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h; });
    if (hit) userAct(hit.id);
  });
}
function syncURL() { const u = new URLSearchParams(); PARAMS.forEach(p => { if (String(P[p.key]) !== String(p.default)) u.set(p.key, P[p.key]); }); if (END !== 'now') u.set('end', END); history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : '')); }
let SPEED = 1;
window.addEventListener('keydown', e => { if (e.target.closest && e.target.closest('input')) return; const k = { 1: 'golem', 2: 'wisp', 3: 'slime', 4: 'bat', a: 'all', r: 'replay' }[e.key]; if (k) userAct(k); });
function fitCanvas() {
  const stage = document.getElementById('stage'), avail = stage.clientWidth - 14, maxH = window.innerHeight - 140;
  const s = Math.max(1, Math.floor(Math.min(avail / W, Math.max(2, maxH / H))));
  cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
  const sc = document.getElementById('scaleinfo'); if (sc) sc.textContent = '256×224 native · ' + s + '× integer scale';
}
initDemoSprites(); restart(); buildParams(); wire(); fitCanvas(); window.addEventListener('resize', fitCanvas);
/* text state for critics and tools/sprites/statecheck.py. Nothing here is mirrored: drawFoe() / drawHero() blit each
   sprite in its art's native side (ART_FACING, read off the sprites): the golem is a 3/4 view turned right, the heroes
   look left; the wisp, slime and bat are symmetric frontal faces (no side). A defeated foe is not drawn (the module
   plays its dissolve from a snapshot). */
const ART_FACING = { golem: 'right', wisp: null, slime: null, bat: null, rowan: 'left', mira: 'left' };
window.__state = () => ({ t: Math.round(S.wt), actors: S.actors.map(a => {
  const foes = S.actors.filter(b => b.side !== a.side && !b.gone);
  const o = { id: a.id, x: Math.round(a.x), y: Math.round(a.y), facing: ART_FACING[a.id], target: foes.length ? Math.round(foes.reduce((n, b) => n + b.x, 0) / foes.length) : null };
  if (a.gone) o.noFace = 'defeated (not drawn)'; else if (!o.facing) o.noFace = 'frontal art'; return o; }) });
window.__demo = { S, DD, P };
const T0 = Q.has('t') ? Math.max(0, +Q.get('t')) : 0;
while (S.rt + FRAME <= T0) step();
render();
if (Q.get('log') === '1') console.log(JSON.stringify({ rt: S.rt, dissolving: DD.count(), won: S.won, drawn: DD.lastDrawn() }));
if (Q.get('freeze') !== '1') {
  let last = performance.now(), acc = 0;
  const loop = now => { acc += Math.min(100, now - last) * SPEED; last = now; while (acc >= FRAME) { step(); acc -= FRAME; } render(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
