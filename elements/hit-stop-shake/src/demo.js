/* ===== E-05 demo: drives the shared module (module/hit-stop-shake.js) ===== */
const PARAMS = [
  { key: 'stop', label: 'Hit-stop (heavy)', type: 'range', min: 0, max: 20, step: 1, default: 6, unit: 'frames' },
  { key: 'shake', label: 'Max shake', type: 'range', min: 0, max: 8, step: 1, default: 4, unit: 'px' },
  { key: 'strength', label: 'Default strength', type: 'select', options: ['light', 'heavy', 'finisher'], default: 'heavy' },
  { key: 'flash', label: 'Flash', type: 'select', options: ['on', 'sprite', 'screen', 'off'], default: 'on' },
  { key: 'reduced', label: 'Reduced motion', type: 'select', options: ['system', 'on', 'off'], default: 'system' }
];
const VARIANTS = [
  { name: 'Classic 16-bit', params: { stop: 6, shake: 4, flash: 'on', reduced: 'system' } },
  { name: 'Arcade heavy', params: { stop: 9, shake: 6, flash: 'on' } },
  { name: 'Subtle', params: { stop: 3, shake: 2, flash: 'sprite' } },
  { name: 'Reduced motion', params: { reduced: 'on' } }
];
const P = {}; PARAMS.forEach(p => P[p.key] = p.default);
const Q = new URLSearchParams(location.search);
let SKIN_ID = Q.get('skin') === 'flat' ? 'flat' : 'pixel16';
const SEED = Q.has('seed') ? (+Q.get('seed') | 0) : 7;

/* a token-only, non-pixel skin: the flash colour and strength come from the skin */
if (window.GameDNA_Skin) GameDNA_Skin.register({
  id: 'flat', name: 'flat (demo)', pixel: false,
  native: { w: 256, h: 224, scale: 'fit', smoothing: true },
  palette: {
    ink: '#29304d', paper: '#f4f6fb',
    ui: { fill: '#ffffff', edge: '#cdd2de', highlight: '#ffffff', shadow: 'rgba(40,46,90,0.25)' },
    team: { a: '#6f8cff', b: '#ff8574', n: '#aeb5c6' },
    overlay: { move: { fill: '#6f8cff', edge: '#4d68d6' }, attack: { fill: '#ff6f6f', edge: '#d9624f' }, threat: { fill: '#8f86ff', edge: '#5b4bff' }, heal: { fill: '#3fcf8e', edge: '#2f9e63' } },
    fx: { hot: '#ff6a4a', cold: '#4ab8ff', heal: '#3fcf8e', crit: '#ffcf4a', status: '#8f86ff', white: '#fff6e8' },
    text: { main: '#29304d', shadow: 'rgba(0,0,0,0)', outline: '#ffffff' }
  },
  fonts: { ui: { type: 'canvas', family: 'system-ui, sans-serif', size: 7, weight: 700 }, num: { type: 'canvas', family: 'system-ui, sans-serif', size: 11, weight: 800 } },
  motion: { snap: false, fadeSteps: null, flashMax: 0.3 }
});

/* ===== demo world: deterministic fixed-step sim ===== */
const S = { rt: 0, wt: 0, acts: [], queue: [], fx: [], banner: null, bannerUntil: 0, lastInput: -1e9, loopStart: 0, scriptI: 0, pendingLoop: false, seq: 0, events: [], hist: [] };
S.actors = makeActors();
const A = id => S.actors.find(a => a.id === id);
const HUD_RECT = { x: 0, y: FIELD_H, w: W, h: H - FIELD_H };
// --- integration: one instance; the game gates its step, wraps its world draw and its sprites ---
let JUICE = null;
function makeJuice() {
  JUICE = GameDNA_HitStop.create({
    view: { x: 0, y: 0, w: W, h: FIELD_H }, seed: SEED, skin: SKIN_ID, params: P,
    uiRects: () => (S.banner && S.wt < S.bannerUntil ? [bannerBox(S.banner), HUD_RECT] : [HUD_RECT])
  });
}
makeJuice();

function contact(att, t) { const b = actorBox({ ...t, x: t.hx, y: t.hy }), side = att.hx > t.hx ? 1 : -1; return [t.hx + side * Math.round(t.half * 0.45), Math.round(b.top + b.h * 0.45)]; }

const SCRIPT = [
  [150, 'rowan', 'golem', 'sword', 'LIGHT', ['light']],
  [1050, 'rowan', 'golem', 'sword', 'HEAVY', ['heavy']],
  [2000, 'golem', 'rowan', 'slam', 'ROCK SLAM', ['heavy']],
  [3000, 'rowan', 'wisp', 'sword', 'COMBO', ['light', 'light', 'heavy', 'finisher']],
  [4700, 'rowan', 'golem', 'sword', 'FINISHER', ['finisher']]
];
const LOOP = 6300;
const T = { sword: { imp: 190, gap: 160 }, slam: { imp: 300 } };
const DMG = { light: 40, heavy: 110, finisher: 260 };
function startAct(who, tgt, type, name, hits) {
  const a = A(who), t = A(tgt), tm = T[type];
  const act = { a, t, type, t0: S.wt, hits: hits.map((k, i) => ({ dt: tm.imp + i * (tm.gap || 0), kind: k, done: false, i })) };
  act.last = act.hits[act.hits.length - 1].dt; act.end = act.last + (type === 'sword' ? 320 : 260);
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
    }
    for (const h of act.hits) if (!h.done && l >= h.dt) { h.done = true; impact(act, h); }
  }
  for (const act of S.acts) if (S.wt - act.t0 >= act.end) { act.a.x = act.a.hx; act.a.y = act.a.hy; act.a.pose = 'idle'; }
  S.acts = S.acts.filter(x => S.wt - x.t0 < x.end);
  for (let i = S.queue.length - 1; i >= 0; i--) { const q = S.queue[i]; if (!busy(q[0])) { S.queue.splice(i, 1); startAct(...q); } }
  S.fx = S.fx.filter(f => S.wt - f.t0 < 520);
}
// the hit site: the game's own effects + HP, and one call into the module on the impact frame
function impact(act, h) {
  const a = act.a, t = act.t, k = h.kind, dir = a.hx > t.hx ? -1 : 1, [x, y] = contact(a, t);
  S.seq++; S.events.push([k, t.id, Math.round(S.rt), Math.round(S.wt)]);
  S.fx.push({ kind: 'slash', x, y, dir: h.i % 2 ? -dir : dir, t0: S.wt, off: 0 });
  S.fx.push({ kind: 'sparks', x, y, t0: S.wt, P: fxParticles(S.seq * 31 + 7, k === 'finisher' ? 14 : k === 'heavy' ? 9 : 5, 2.6, k === 'finisher' ? 3 : 2) });
  t.hp = Math.max(1, t.hp - DMG[k]); t.hurtT = S.wt;
  JUICE.hit({ strength: k, at: { x, y }, target: t.id, dir });
}
function userAct(kind) {
  S.lastInput = S.rt; S.pendingLoop = true;
  const tsel = document.getElementById('target').value, foe = A(tsel).side === 'foe';
  const who = foe ? 'rowan' : 'golem', type = foe ? 'sword' : 'slam';
  if (kind === 'combo') S.queue.push([who, tsel, type, 'COMBO', type === 'sword' ? ['light', 'light', 'heavy', 'finisher'] : ['finisher']]);
  else S.queue.push([who, tsel, type, kind.toUpperCase(), [kind]]);
}
function startLoop() { S.loopStart = S.wt; S.scriptI = 0; for (const a of S.actors) { a.hp = a.max; } }
function tickLoop() {
  if (S.pendingLoop) { if (S.rt - S.lastInput > 3000 && !S.acts.length && !S.queue.length) { S.pendingLoop = false; startLoop(); } else return; }
  const l = S.wt - S.loopStart;
  while (S.scriptI < SCRIPT.length && l >= SCRIPT[S.scriptI][0]) { const s = SCRIPT[S.scriptI++]; startAct(s[1], s[2], s[3], s[4], s[5]); }
  if (S.scriptI >= SCRIPT.length && l >= LOOP) startLoop();
}
function step() {
  S.rt += FRAME;
  const run = JUICE.step(FRAME);          // gate FIRST: a frozen step changes nothing in the world
  if (run) { S.wt += FRAME; tickLoop(); tickActs(); tickBars(S.actors, FRAME); }
  const o = JUICE.offset(), st = JUICE.stats();
  S.hist.push({ run, ox: o.x, oy: o.y, scr: st.screenLeft > 0, spr: S.actors.some(a => JUICE.flashing(a.id)) });
  if (S.hist.length > 111) S.hist.shift();
}

/* ===== render ===== */
const cv = document.getElementById('cv'), g = cv.getContext('2d', { willReadFrequently: true });
g.imageSmoothingEnabled = false;
function drawBody(g, a) {   // drawActor from the kit minus its shadow and hurt blink: the module's flash replaces the blink
  if (a.dead && S.wt - a.deadT > 600) return;
  const wt = S.wt, bob = a.id === 'wisp' ? Math.round(Math.sin(wt / 260) * 2) : (Math.floor((wt + a.hx * 7) / 420) % 2), lift = (a.hover || 0) + (a.id === 'wisp' ? bob : 0);
  const hurtAge = wt - a.hurtT, kx = hurtAge >= 0 && hurtAge < 140 ? (a.side === 'foe' ? -2 : 2) : 0;
  drawSpr(g, actorSprite(a, wt), a.x + kx, a.y - lift - (a.id === 'wisp' ? 0 : bob === 1 && a.pose === 'idle' ? 1 : 0), {});
}
function render() {
  rect(g, 0, 0, W, H, '#05040a');
  JUICE.begin(g);                                       // world shakes from here...
  drawBG(g, S.wt);
  for (const a of [...S.actors].sort((p, q) => p.y - q.y)) {
    const bob = a.id === 'wisp' ? Math.round(Math.sin(S.wt / 260) * 2) : 0;
    shadow(g, a.x, a.y, a.id === 'golem' ? 20 : a.id === 'wisp' ? 8 : 9);
    if (a.id === 'wisp') { g.globalCompositeOperation = 'lighter'; for (const [r, al] of [[16, 0.06], [11, 0.08]]) { g.globalAlpha = al; ell(g, a.x, a.y - (a.hover || 0) - bob - 16, r, r, '#4affc0'); } g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    const b = actorBox(a);
    JUICE.sprite(g, a.id, { x: b.x - 4, y: b.top - 4, w: b.w + 8, h: b.h + 8 }, () => drawBody(g, a));
  }
  S.fx = S.fx.filter(f => drawFx(g, f, S.wt));
  JUICE.end(g);                                         // ...to here; HUD and banner below stay still
  JUICE.draw(g);
  if (S.banner && S.wt < S.bannerUntil) drawBanner(g, S.banner);
  drawHUD(g, S.actors);
  drawMeter();
  const st = JUICE.stats(), o = JUICE.offset(), el = document.getElementById('status');
  if (el) el.textContent = (S.pendingLoop ? 'Manual · auto-loop resumes after 3 s idle' : 'Auto-loop') + ' · ' + st.hits + ' hits, ' + st.frozenSteps + ' frozen frames'
    + (JUICE.frozen() ? ' · HIT-STOP ' + st.stopLeft + 'f' : '') + (o.x || o.y ? ' · shake ' + o.x + ',' + o.y : '') + (JUICE.reduced() ? ' · reduced motion' : '');
}
// frame meter: last 111 fixed steps, 2 px each. Row 1 world running (dim) / frozen (amber); row 2 shake x offset; row 3 flashes
const mv = document.getElementById('meter'), mg = mv.getContext('2d');
function drawMeter() {
  rect(mg, 0, 0, 256, 40, '#0b0912');
  drawText(mg, 'WORLD', 2, 2, '#9a93b4'); drawText(mg, 'SHAKE', 2, 15, '#9a93b4'); drawText(mg, 'FLASH', 2, 30, '#9a93b4');
  rect(mg, 32, 21, 222, 1, '#2c2740');
  S.hist.forEach((h, i) => {
    const x = 32 + i * 2;
    rect(mg, x, 2, 2, 8, h.run ? '#2a3a5a' : '#ffb43a');
    if (h.ox) rect(mg, x, h.ox > 0 ? 21 - h.ox * 2 : 22, 2, Math.abs(h.ox) * 2, '#e8ecff');
    if (h.scr) rect(mg, x, 30, 2, 8, '#ffffff'); else if (h.spr) rect(mg, x, 32, 2, 5, '#c8e0ff');
  });
}

/* ===== page wiring ===== */
PARAMS.forEach(p => { if (Q.has(p.key)) { const v = Q.get(p.key); P[p.key] = p.type === 'range' ? clamp(+v, p.min, p.max) : p.options.includes(v) ? v : p.default; } });
JUICE.setParams(P);
function fmt(p) { const v = P[p.key]; return v + (p.unit ? ' ' + p.unit : ''); }
function buildParams() {
  const box = document.getElementById('params'); box.innerHTML = '';
  for (const p of PARAMS) {
    const row = document.createElement('div'); row.className = 'row';
    if (p.type === 'range') {
      row.innerHTML = `<label for="p-${p.key}"><span>${p.label}</span><output id="o-${p.key}"></output></label><input type="range" id="p-${p.key}" min="${p.min}" max="${p.max}" step="${p.step}">`;
      box.appendChild(row); const inp = row.querySelector('input'), out = row.querySelector('output');
      const sync = () => { out.textContent = fmt(p) + (p.key === 'stop' ? ' (light ' + Math.round(P.stop * 0.5) + ', finisher ' + P.stop * 2 + ')' : ''); inp.style.setProperty('--fill', ((P[p.key] - p.min) / (p.max - p.min) * 100) + '%'); };
      inp.value = P[p.key]; sync(); inp.addEventListener('input', () => { P[p.key] = +inp.value; JUICE.setParams(P); sync(); syncURL(); });
    } else {
      row.innerHTML = `<label><span>${p.label}</span></label><div class="seg" role="radiogroup" aria-label="${p.label}">` + p.options.map(o => `<button type="button" role="radio" data-v="${o}">${o}</button>`).join('') + '</div>';
      box.appendChild(row);
      const btns = [...row.querySelectorAll('button')], sync = () => btns.forEach(b => b.setAttribute('aria-checked', b.dataset.v === String(P[p.key])));
      sync(); btns.forEach(b => b.addEventListener('click', () => { P[p.key] = b.dataset.v; JUICE.setParams(P); sync(); syncURL(); }));
    }
  }
}
function syncSkin() { document.querySelectorAll('[data-skin]').forEach(b => b.setAttribute('aria-checked', b.dataset.skin === SKIN_ID)); }
function wire() {
  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => userAct(b.dataset.act)));
  document.getElementById('reset').addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); JUICE.setParams(P); buildParams(); syncURL(); });
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { SPEED = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach(x => x.setAttribute('aria-checked', x === b)); }));
  document.querySelectorAll('[data-skin]').forEach(b => b.addEventListener('click', () => { SKIN_ID = b.dataset.skin; makeJuice(); JUICE.setParams(P); syncSkin(); syncURL(); }));
  const vs = document.getElementById('varseg');
  VARIANTS.forEach(v => { const b = document.createElement('button'); b.type = 'button'; b.textContent = v.name; b.setAttribute('aria-checked', 'false');
    b.addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); Object.assign(P, v.params); JUICE.setParams(P); buildParams(); syncURL(); vs.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); });
    vs.appendChild(b); });
  syncSkin();
}
function syncURL() { const u = new URLSearchParams(); PARAMS.forEach(p => { if (String(P[p.key]) !== String(p.default)) u.set(p.key, P[p.key]); }); if (SKIN_ID !== 'pixel16') u.set('skin', SKIN_ID); history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : '')); }
let SPEED = 1;
window.addEventListener('keydown', e => { const k = { 1: 'light', 2: 'heavy', 3: 'finisher', 4: 'combo' }[e.key]; if (k && !e.target.closest('input')) userAct(k); });
function fitCanvas() {
  const stage = document.getElementById('stage'), avail = stage.clientWidth - 14, maxH = window.innerHeight - 190;
  const s = Math.max(1, Math.floor(Math.min(avail / W, Math.max(2, maxH / H))));
  cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
  mv.style.width = W * s + 'px'; mv.style.height = 40 * s + 'px';
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
window.__demo = () => ({ rt: S.rt, wt: S.wt, events: S.events, stats: JUICE.stats(), offset: JUICE.offset() });
if (Q.get('log') === '1') console.log(JSON.stringify(window.__demo()));
if (Q.get('freeze') !== '1') {
  let last = performance.now(), acc = 0;
  const loop = now => { acc += Math.min(100, now - last) * SPEED; last = now; while (acc >= FRAME) { step(); acc -= FRAME; } render(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
