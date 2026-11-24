/* ===== E-02 demo: drives the shared module (module/hit-sparks.js) ===== */
const PARAMS = [
  { key: 'size', label: 'Effect size', type: 'range', min: 0.5, max: 2, step: 0.25, default: 1, unit: '×' },
  { key: 'life', label: 'Hit length', type: 'range', min: 6, max: 30, step: 1, default: 14, unit: 'frames' },
  { key: 'sparks', label: 'Sparks per hit', type: 'range', min: 0, max: 24, step: 1, default: 8, unit: '' },
  { key: 'gravity', label: 'Spark gravity', type: 'range', min: 0, max: 0.4, step: 0.05, default: 0.15, unit: 'px/f²' },
  { key: 'hitstop', label: 'Hit-stop', type: 'range', min: 0, max: 120, step: 10, default: 50, unit: 'ms' },
  { key: 'shake', label: 'Critical shake', type: 'range', min: 0, max: 4, step: 1, default: 2, unit: 'px' },
  { key: 'cycle', label: 'Palette cycle', type: 'range', min: 1, max: 6, step: 1, default: 2, unit: 'frames' },
  { key: 'cap', label: 'Particle cap', type: 'range', min: 32, max: 512, step: 32, default: 192, unit: '' },
  { key: 'style', label: 'Default hit shape', type: 'select', options: ['auto', 'slash', 'star', 'spark', 'ring'], default: 'auto' },
  { key: 'critFlash', label: 'Critical flash', type: 'select', options: ['screen', 'local', 'off'], default: 'screen' }
];
const P = {}; PARAMS.forEach(p => P[p.key] = p.default);
const Q = new URLSearchParams(location.search);
let SKIN_ID = Q.get('skin') === 'flat' ? 'flat' : 'pixel16';
const SEED = Q.has('seed') ? (+Q.get('seed') | 0) : 7;

/* a token-only, non-pixel skin: proves every colour and particle rule comes from the skin */
if (window.GameDNA_Skin) GameDNA_Skin.register({
  id: 'flat', name: 'flat (demo)', pixel: false,
  native: { w: 256, h: 224, scale: 'fit', smoothing: true },
  palette: {
    ink: '#29304d', paper: '#f4f6fb',
    ui: { fill: '#ffffff', edge: '#cdd2de', highlight: '#ffffff', shadow: 'rgba(40,46,90,0.25)' },
    team: { a: '#6f8cff', b: '#ff8574', n: '#aeb5c6' },
    overlay: { move: { fill: '#6f8cff', edge: '#4d68d6' }, attack: { fill: '#ff6f6f', edge: '#d9624f' }, threat: { fill: '#8f86ff', edge: '#5b4bff' }, heal: { fill: '#3fcf8e', edge: '#2f9e63' } },
    fx: { hot: '#ff6a4a', cold: '#4ab8ff', heal: '#3fcf8e', crit: '#ffcf4a', status: '#8f86ff', white: '#ffffff' },
    text: { main: '#29304d', shadow: 'rgba(0,0,0,0)', outline: '#ffffff' }
  },
  fonts: { ui: { type: 'canvas', family: 'system-ui, sans-serif', size: 7, weight: 700 }, num: { type: 'canvas', family: 'system-ui, sans-serif', size: 11, weight: 800 } },
  particles: { shape: 'circle', size: [1, 3], blend: 'lighter', glow: 0.6, snap: false },
  motion: { snap: false, fadeSteps: null, flashMax: 0.3 }
});

/* ===== demo world: deterministic fixed-step sim ===== */
const S = { rt: 0, wt: 0, fxT: 0, stop: 0, acts: [], queue: [], banner: null, bannerUntil: 0, shakeT: -1e9, shakeAmp: 0, lastInput: -1e9, loopStart: 0, scriptI: 0, pendingLoop: false, seq: 0 };
S.actors = makeActors();
const A = id => S.actors.find(a => a.id === id);
const HUD_RECT = { x: 0, y: FIELD_H, w: W, h: H - FIELD_H };
// --- integration: the module asks where units and UI are; the game advances and draws it ---
let FX = null;
function makeFX() {
  FX = GameDNA_HitSparks.create({
    view: { x: 0, y: 0, w: W, h: FIELD_H }, seed: SEED, skin: SKIN_ID, params: P,
    getObstacles: () => S.actors.filter(a => !a.dead).map(a => { const b = actorBox({ ...a, x: a.hx, y: a.hy }); return { x: b.x + 1, y: b.top, w: b.w - 2, h: b.h, id: a.id }; }),
    uiRects: () => (S.banner && S.wt < S.bannerUntil ? [bannerBox(S.banner), HUD_RECT] : [HUD_RECT]),
    getAnchor: id => { const a = A(id); if (!a) return null; const bob = a.id === 'wisp' ? Math.round(Math.sin(S.wt / 260) * 2) : 0, b = actorBox(a); return { x: a.x, y: b.top - bob + b.h / 2 }; },   // bursts follow the target (wisp bob, lunges)
    onHitStop: ms => { S.stop = Math.max(S.stop, ms); },
    onShake: px => { S.shakeT = S.rt; S.shakeAmp = px; }
  });
}
makeFX();

// contact point: on the target's body, on the side facing the attacker
function contact(att, t, k) { const b = actorBox({ ...t, x: t.hx, y: t.hy }), side = att.hx > t.hx ? 1 : -1; return [t.hx + side * Math.round(t.half * 0.45) + (k || 0), Math.round(b.top + b.h * 0.45)]; }
function centre(t) { const b = actorBox({ ...t, x: t.hx, y: t.hy }); return [t.hx, Math.round(b.top + b.h * 0.5)]; }

const SCRIPT = [
  [100, 'rowan', 'golem', 'sword', 'SWORD', [['slash']]],
  [800, 'golem', 'rowan', 'slam', 'ROCK SLAM', [['ring']]],
  [1500, 'mira', 'golem', 'cast', 'FIRE', [['fire']]],
  [2400, 'rowan', 'wisp', 'sword', 'FLURRY', [['slash'], ['star'], ['slash'], ['crit']]],
  [3500, 'mira', 'wisp', 'cast', 'ICE', [['ice']]],
  [4400, 'wisp', 'rowan', 'touch', 'THUNDER', [['thunder']]],
  [5300, 'mira', 'rowan', 'cast', 'HEAL', [['heal']]],
  [6100, 'rowan', 'golem', 'sword', 'SWORD', [['crit']]]
];
const LOOP = 7400;
const T = { sword: { imp: 190, gap: 150 }, slam: { imp: 300 }, cast: { imp: 360 }, touch: { imp: 260 } };
function startAct(who, tgt, type, name, hits) {
  const a = A(who), t = A(tgt), tm = T[type];
  const act = { a, t, type, t0: S.wt, hits: hits.map((h, i) => ({ dt: tm.imp + i * (tm.gap || 0), kind: h[0], done: false, i })) };
  act.last = act.hits[act.hits.length - 1].dt; act.end = act.last + (type === 'sword' || type === 'touch' ? 320 : 260);
  S.acts.push(act);
  if (name) { S.banner = name; S.bannerUntil = S.wt + Math.max(700, act.last + 220); }
}
function busy(id) { return S.acts.some(x => x.a.id === id); }
function tickActs() {
  for (const act of S.acts) {
    const { a, t, type } = act, l = S.wt - act.t0;
    if (type === 'sword') {
      const tx = t.hx + (a.hx > t.hx ? 1 : -1) * (t.half + 12), ty = t.hy + 3, back = clamp((l - act.last - 120) / 180, 0, 1), go = easeOut(clamp(l / 180, 0, 1));
      a.x = lerp(lerp(a.hx, tx, go), a.hx, back); a.y = lerp(lerp(a.hy, ty, go), a.hy, back);
      a.pose = l > 140 && l < act.last + 120 ? 'attack' : 'idle';
    } else if (type === 'slam') {
      a.pose = l < 260 ? 'raise' : l < act.end - 40 ? 'slam' : 'idle'; a.x = a.hx + (a.pose === 'slam' ? 8 : a.pose === 'raise' ? -2 : 0);
    } else if (type === 'touch') {
      const go = easeOut(clamp(l / 240, 0, 1)), back = clamp((l - act.last - 80) / 200, 0, 1);
      a.x = lerp(lerp(a.hx, t.hx - 24, go), a.hx, back); a.y = lerp(lerp(a.hy, t.hy - 4, go), a.hy, back);
    } else if (a.id === 'mira') a.pose = l < act.last + 160 ? 'cast' : 'idle';
    for (const h of act.hits) if (!h.done && l >= h.dt) { h.done = true; impact(act, h); }
  }
  for (const act of S.acts) if (S.wt - act.t0 >= act.end) { act.a.x = act.a.hx; act.a.y = act.a.hy; act.a.pose = 'idle'; }
  S.acts = S.acts.filter(x => S.wt - x.t0 < x.end);
  for (let i = S.queue.length - 1; i >= 0; i--) { const q = S.queue[i]; if (!busy(q[0])) { S.queue.splice(i, 1); startAct(...q); } }
}
// the hit site: one call into the module per landed hit, on the impact frame
function impact(act, h) {
  S.seq++; (S.events = S.events || []).push([h.kind, act.t.id, Math.round(S.rt)]);
  const a = act.a, t = act.t, k = h.kind, dir = a.hx > t.hx ? -1 : 1;
  if (k === 'fire' || k === 'ice' || k === 'thunder' || k === 'heal') {
    const [x, y] = centre(t);
    FX.burst(x, y, k, { target: t.id, from: a.id });
    if (k !== 'heal') FX.hit(x, y, { kind: 'spark', element: k, target: t.id });
  } else {
    const [x, y] = contact(a, t, (h.i % 2) * 2);
    FX.hit(x, y, { kind: k === 'crit' ? 'auto' : k, dir: k === 'slash' || k === 'crit' ? (h.i % 2 ? -dir : dir) : 0, crit: k === 'crit', target: t.id, from: a.id });
  }
  if (k !== 'heal') t.hurtT = S.wt;
}
function userAct(kind) {
  S.lastInput = S.rt; S.pendingLoop = true;
  const tsel = document.getElementById('target').value, tg = A(tsel), foe = tg.side === 'foe';
  const Qa = (...q) => S.queue.push(q);
  const melee = foe ? 'rowan' : 'golem', mType = foe ? 'sword' : 'slam';
  if (['slash', 'star', 'spark', 'ring'].includes(kind)) Qa(melee, tsel, mType, kind.toUpperCase(), [[kind]]);
  if (kind === 'crit') Qa(melee, tsel, mType, 'CRITICAL', [['crit']]);
  if (kind === 'combo') Qa(melee, tsel, mType, 'COMBO', [['slash'], ['slash'], ['star'], ['spark'], ['crit']]);
  if (['fire', 'ice', 'thunder'].includes(kind)) Qa(foe ? 'mira' : 'wisp', tsel, foe ? 'cast' : 'touch', kind.toUpperCase(), [[kind]]);
  if (kind === 'heal') Qa('mira', tsel, 'cast', 'HEAL', [['heal']]);
}
function startLoop() { S.loopStart = S.wt; S.scriptI = 0; }
function tickLoop() {
  if (S.pendingLoop) { if (S.rt - S.lastInput > 3000 && !S.acts.length && !S.queue.length) { S.pendingLoop = false; startLoop(); } else return; }
  const l = S.wt - S.loopStart;
  while (S.scriptI < SCRIPT.length && l >= SCRIPT[S.scriptI][0]) { const s = SCRIPT[S.scriptI++]; startAct(s[1], s[2], s[3], s[4], s[5]); }
  if (S.scriptI >= SCRIPT.length && l >= LOOP) startLoop();
}
function step() {
  S.rt += FRAME;
  if (S.stop > 0) { S.stop -= FRAME; if (S.stop < 0) { S.wt += -S.stop; S.stop = 0; } }
  else S.wt += FRAME;
  if (S.stop <= 0) { tickLoop(); tickActs(); }
  FX.update(S.wt - S.fxT); S.fxT = S.wt;   // world time only: effects freeze with the hit-stop
  tickBars(S.actors, FRAME);
}

/* ===== render ===== */
const cv = document.getElementById('cv'), g = cv.getContext('2d');
g.imageSmoothingEnabled = false;
function render() {
  const sa = S.rt - S.shakeT, shaking = sa < 200, sx = shaking ? (Math.floor(sa / 33) % 2 ? -S.shakeAmp : S.shakeAmp) : 0, sy = shaking ? (Math.floor(sa / 50) % 2 ? 1 : 0) : 0;
  rect(g, 0, 0, W, H, '#05040a');
  g.save(); g.translate(sx, sy);
  drawBG(g, S.rt);
  [...S.actors].sort((a, b) => a.y - b.y).forEach(a => drawActor(g, a, S.wt, S.rt));
  FX.draw(g);
  g.restore();
  if (S.banner && S.wt < S.bannerUntil) drawBanner(g, S.banner);
  drawHUD(g, S.actors);
  const st = document.getElementById('status');
  if (st) st.textContent = (S.pendingLoop ? 'Manual · auto-loop resumes after 3 s idle' : 'Auto-loop') + ' · ' + FX.count() + ' effect' + (FX.count() === 1 ? '' : 's') + ', ' + FX.particles() + '/' + P.cap + ' sparks' + (S.stop > 0 ? ' · HIT-STOP' : '');
}

/* ===== page wiring ===== */
PARAMS.forEach(p => { if (Q.has(p.key)) { const v = Q.get(p.key); P[p.key] = p.type === 'range' ? clamp(+v, p.min, p.max) : p.options.includes(v) ? v : p.default; } });
FX.setParams(P);
function fmt(p) { const v = P[p.key]; return (p.step < 1 ? (+v).toFixed(2).replace(/0$/, '') : v) + (p.unit ? ' ' + p.unit : ''); }
function buildParams() {
  const box = document.getElementById('params');
  for (const p of PARAMS) {
    const row = document.createElement('div'); row.className = 'row';
    if (p.type === 'range') {
      row.innerHTML = `<label for="p-${p.key}"><span>${p.label}</span><output id="o-${p.key}"></output></label><input type="range" id="p-${p.key}" min="${p.min}" max="${p.max}" step="${p.step}">`;
      box.appendChild(row); const inp = row.querySelector('input'), out = row.querySelector('output');
      const sync = () => { out.textContent = fmt(p); inp.style.setProperty('--fill', ((P[p.key] - p.min) / (p.max - p.min) * 100) + '%'); };
      inp.value = P[p.key]; sync(); inp.addEventListener('input', () => { P[p.key] = +inp.value; FX.setParams(P); sync(); syncURL(); });
    } else {
      row.innerHTML = `<label><span>${p.label}</span></label><div class="seg" role="radiogroup" aria-label="${p.label}">` + p.options.map(o => `<button type="button" role="radio" data-v="${o}">${o}</button>`).join('') + '</div>';
      box.appendChild(row);
      const btns = [...row.querySelectorAll('button')], sync = () => btns.forEach(b => b.setAttribute('aria-checked', b.dataset.v === String(P[p.key])));
      sync(); btns.forEach(b => b.addEventListener('click', () => { P[p.key] = b.dataset.v; FX.setParams(P); sync(); syncURL(); }));
    }
  }
}
function syncSkin() { document.querySelectorAll('[data-skin]').forEach(b => b.setAttribute('aria-checked', b.dataset.skin === SKIN_ID)); }
function wire() {
  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => userAct(b.dataset.act)));
  document.getElementById('reset').addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); FX.setParams(P); document.getElementById('params').innerHTML = ''; buildParams(); syncURL(); });
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { SPEED = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach(x => x.setAttribute('aria-checked', x === b)); }));
  document.querySelectorAll('[data-skin]').forEach(b => b.addEventListener('click', () => { SKIN_ID = b.dataset.skin; makeFX(); FX.setParams(P); syncSkin(); syncURL(); }));
  syncSkin();
}
function syncURL() { const u = new URLSearchParams(); PARAMS.forEach(p => { if (String(P[p.key]) !== String(p.default)) u.set(p.key, P[p.key]); }); if (SKIN_ID !== 'pixel16') u.set('skin', SKIN_ID); history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : '')); }
let SPEED = 1;
window.addEventListener('keydown', e => { const k = { 1: 'slash', 2: 'star', 3: 'spark', 4: 'ring', 5: 'crit', 6: 'fire', 7: 'ice', 8: 'thunder', 9: 'heal', 0: 'combo' }[e.key]; if (k && !e.target.closest('input')) userAct(k); });
function fitCanvas() {
  const stage = document.getElementById('stage'), avail = stage.clientWidth - 14, maxH = window.innerHeight - 140;
  const s = Math.max(1, Math.floor(Math.min(avail / W, Math.max(2, maxH / H))));
  cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
  const sc = document.getElementById('scaleinfo'); if (sc) sc.textContent = '256×224 native · ' + s + '× integer scale';
}
/* text state for critics and tools/sprites/statecheck.py. The actor draw never mirrors a sprite, so every actor is drawn
   in its art's native side (ART_FACING, read off the sprites in common.js): the golem is a 3/4 view turned right, the
   heroes look left, the wisp is a round frontal face (no side). */
const ART_FACING = { golem: 'right', wisp: null, rowan: 'left', mira: 'left' };
window.__state = () => ({ t: Math.round(S.wt), actors: S.actors.map(a => {
  const act = S.acts.find(x => x.a === a && x.t !== a), foes = S.actors.filter(b => b.side !== a.side && !b.dead);
  const o = { id: a.id, x: Math.round(a.x), y: Math.round(a.y), facing: ART_FACING[a.id], target: act ? act.t.id : foes.length ? Math.round(foes.reduce((n, b) => n + b.x, 0) / foes.length) : null };
  if (a.dead) o.noFace = 'dead'; else if (!o.facing) o.noFace = 'frontal art'; return o; }) });
initSprites(); buildParams(); wire(); startLoop(); fitCanvas(); window.addEventListener('resize', fitCanvas);
const T0 = Q.has('t') ? Math.max(0, +Q.get('t')) : 0;
while (S.rt + FRAME <= T0) step();
render();
if (Q.get('log') === '1') console.log(JSON.stringify({ events: S.events, rt: S.rt, wt: S.wt, effects: FX.count(), particles: FX.particles(), drawn: FX.lastDrawn() }));
if (Q.get('freeze') !== '1') {
  let last = performance.now(), acc = 0;
  const loop = now => { acc += Math.min(100, now - last) * SPEED; last = now; while (acc >= FRAME) { step(); acc -= FRAME; } render(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
