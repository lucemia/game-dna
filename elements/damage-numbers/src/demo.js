/* ===== E-01 demo: drives the shared module (module/damage-numbers.js) ===== */
const PARAMS = [
  { key: 'bounce', label: 'Bounce height', type: 'range', min: 2, max: 24, step: 1, default: 10, unit: 'px' },
  { key: 'duration', label: 'Duration', type: 'range', min: 500, max: 2000, step: 50, default: 1000, unit: 'ms' },
  { key: 'stagger', label: 'Digit stagger', type: 'range', min: 0, max: 120, step: 5, default: 40, unit: 'ms' },
  { key: 'hitstop', label: 'Hit-stop', type: 'range', min: 0, max: 150, step: 10, default: 60, unit: 'ms' },
  { key: 'scale', label: 'Font scale', type: 'select', options: ['1', '2'], default: '1' },
  { key: 'scheme', label: 'Color scheme', type: 'select', options: ['classic', 'warm', 'contrast'], default: 'classic' },
  { key: 'crit', label: 'Critical style', type: 'select', options: ['burst', 'flash', 'plain'], default: 'burst' },
  { key: 'stack', label: 'Stacking', type: 'select', options: ['on', 'off'], default: 'on' },
  { key: 'outline', label: 'Outline', type: 'select', options: ['1', '2'], default: '1' }
];
const P = {}; PARAMS.forEach(p => P[p.key] = p.default);
const AUDIT = new URLSearchParams(location.search).get('log') === '3';
/* ===== demo world: deterministic fixed-step sim ===== */
const S = { dnT: 0, rt: 0, wt: 0, stop: 0, pops: [], fx: [], acts: [], queue: [], banner: null, bannerUntil: 0, shakeT: -1e9, shakeAmp: 0, flashT: -1e9, flashA: 0, lastInput: -1e9, loopStart: 0, scriptI: 0, pendingLoop: false, seq: 0, rand: rng(42) };
S.actors = makeActors();
const A = id => S.actors.find(a => a.id === id);
// --- integration: the module asks the game where targets and obstacles are; the game draws/advances it ---
const lunging = a => S.acts.some(x => x.a === a && (x.type === 'sword' || x.type === 'touch'));
const DN = GameDNA_DamageNumbers.create({
  bounds: { x: 0, y: 0, w: W, h: FIELD_H },
  params: P,
  // while a target dashes at someone its numbers stay at its home spot; the wisp bobs 2px, so its top is 3px higher
  getAnchor: id => { const a = A(id); if (!a) return null; const home = lunging(a), b = actorBox({ ...a, x: home ? a.hx : a.x, y: home ? a.hy : a.y }); return { x: home ? a.hx : a.x, top: b.top - (a.id === 'wisp' ? 3 : 0), w: b.w, h: b.h }; },
  getObstacles: () => {
    const o = [];
    for (const a of S.actors) if (!a.dead) for (const p of [[a.x, a.y], [a.hx, a.hy]]) { const b = actorBox({ ...a, x: p[0], y: p[1] }); o.push({ x: b.x + 1, y: b.top, w: b.w - 2, h: b.h, id: a.id }); }
    if (S.banner && S.wt < S.bannerUntil) o.push(bannerBox(S.banner));
    for (const [x, y] of TORCHES) o.push({ x: x - 4, y: y - 8, w: 9, h: 12, soft: true });
    return o;
  },
  onHitStop: ms => { S.stop = Math.max(S.stop, ms); },
  onShake: px => { S.shakeT = S.rt; S.shakeAmp = px; },
  onFlash: alpha => { S.flashT = S.rt; S.flashA = alpha; }
});
function auditReport() {
  const bad = [], D = DN.lastDrawn();
  for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) if (D[i].pop !== D[j].pop && overlap2({ x: D[i].x - 4, y: D[i].y - 2, w: D[i].w + 8, h: D[i].h + 4 }, D[j])) bad.push('pop ' + D[i].text + '/' + D[j].text);
  for (const d of D) for (const s of S.actors) { if (s.dead || s.id === d.target) continue; /* own sprite is allowed as a last resort */ const b = actorBox(s); if (overlap2(d, { x: b.x + 2, y: b.top, w: b.w - 4, h: b.h })) bad.push('sprite ' + d.text + '@' + s.id); }
  return [...new Set(bad)];
}
function overlap2(a, b) { return Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y); }
const SCRIPT = [
  [100, 'rowan', 'golem', 'sword', 'SWORD', [['dmg', 128]]],
  [700, 'golem', 'mira', 'slam', 'ROCK SLAM', [['dmg', 46]]],
  [880, 'mira', 'mira', 'mend', 'MEND', [['heal', 182]]],
  [1040, 'wisp', 'mira', 'touch', '', [['miss']]],
  [1500, 'rowan', 'golem', 'sword', 'FLURRY', [['dmg', 41], ['dmg', 57], ['dmg', 38], ['dmg', 64]]],
  [1380, 'mira', 'wisp', 'spark', 'SPARK', [['crit', 728]]],
  [3300, 'wisp', 'mira', 'drain', 'MANA DRAIN', [['mp', 18]]],
  [3900, 'wisp', 'rowan', 'hex', 'HEX', [['status', 'POISON']]],
  [5000, 'rowan', 'wisp', 'sword', 'SWORD', [['dmg', 133]]],
  [5600, 'golem', 'rowan', 'slam', 'ROCK SLAM', [['dmg', 52]]]
];
SCRIPT.sort((a, b) => a[0] - b[0]);
const LOOP = 6800;
const T = { sword: { imp: 190, gap: 130 }, slam: { imp: 300, gap: 0 }, mend: { imp: 330 }, spark: { imp: 330 }, touch: { imp: 260, gap: 140 }, drain: { imp: 330 }, hex: { imp: 330 }, slow: { imp: 330 } };
function startAct(who, tgt, type, name, hits) {
  const a = A(who), t = A(tgt), tm = T[type];
  const act = { a, t, type, t0: S.wt, hits: hits.map((h, i) => ({ dt: tm.imp + i * (tm.gap || 0), kind: h[0], val: h[1], done: false })) };
  act.last = act.hits[act.hits.length - 1].dt; act.end = act.last + (type === 'sword' || type === 'touch' ? 320 : 220);
  S.acts.push(act);
  if (name) { S.banner = name; S.bannerUntil = S.wt + Math.max(700, act.last + 200); }
  if (type === 'mend' || type === 'spark' || type === 'slow') S.fx.push({ kind: 'charge', x: a.x - 3, y: a.y - 32, t0: S.wt, dur: tm.imp });
  if (type === 'drain' || type === 'hex') S.fx.push({ kind: 'charge', x: a.x, y: a.y - a.hover - 16, t0: S.wt, dur: tm.imp, cols: ['#3a1a5a', '#8a48c8', '#d0a0ff', '#ffffff'] });
}
function busy(id) { return S.acts.some(x => x.a.id === id); }
function tickActs() {
  for (const act of S.acts) {
    const { a, t, type } = act, l = S.wt - act.t0;
    if (type === 'sword') {
      const tx = t.x + t.half + 12, ty = t.y + 3, back = clamp((l - act.last - 120) / 180, 0, 1), go = easeOut(clamp(l / 180, 0, 1));
      a.x = lerp(lerp(a.hx, tx, go), a.hx, back); a.y = lerp(lerp(a.hy, ty, go), a.hy, back);
      a.pose = l > 140 && l < act.last + 120 ? 'attack' : 'idle';
    } else if (type === 'slam') {
      a.pose = l < 260 ? 'raise' : l < act.end - 40 ? 'slam' : 'idle'; a.x = a.hx + (a.pose === 'slam' ? 8 : a.pose === 'raise' ? -2 : 0);
    } else if (type === 'touch') {
      const go = easeOut(clamp(l / 240, 0, 1)), back = clamp((l - act.last - 80) / 200, 0, 1);
      a.x = lerp(lerp(a.hx, t.x - 24, go), a.hx, back); a.y = lerp(lerp(a.hy, t.y - 4, go), a.hy, back);
    } else if (a.id === 'mira') a.pose = l < act.last + 160 ? 'cast' : 'idle';
    for (const h of act.hits) if (!h.done && l >= h.dt) { h.done = true; impact(act, h); }
  }
  for (const act of S.acts) if (S.wt - act.t0 >= act.end) { act.a.x = act.a.hx; act.a.y = act.a.hy; act.a.pose = 'idle'; }
  S.acts = S.acts.filter(x => S.wt - x.t0 < x.end);
  for (let i = S.queue.length - 1; i >= 0; i--) { const q = S.queue[i]; if (!busy(q[0])) { S.queue.splice(i, 1); startAct(...q); } }
}
function impact(act, h) {
  S.seq++;
  const t = act.t, b = actorBox(t), cy = b.top + b.h * 0.5, kind = h.kind;
  if (kind === 'dmg' || kind === 'crit') {
    t.hp = Math.max(1, t.hp - h.val); t.hurtT = S.wt; t.ghostWait = 400; DN.spawn(t.id, h.val, kind === 'crit' ? 'crit' : 'damage');
    if (act.type === 'sword') S.fx.push({ kind: 'slash', x: t.x, y: cy, t0: S.wt, dir: act.hits.indexOf(h) % 2 ? -1 : 1 });
    if (act.type === 'spark') S.fx.push({ kind: 'bolt', x: t.x, y: cy, t0: S.wt, seed: S.seq });
    if (act.type === 'slam') S.fx.push({ kind: 'dust', x: t.x, y: t.y, t0: S.wt });
    const crit = kind === 'crit';
    S.fx.push({ kind: 'sparks', x: t.x, y: cy, t0: S.wt, P: fxParticles(S.seq * 7 + 3, crit ? 16 : 8, crit ? 6.2 : 3.2, crit ? 2.4 : 1.6), cols: crit ? ['#ffffff', '#fff2a8', '#ffb050'] : ['#ffffff', '#c8e0ff', '#6a8ac8'] });
  } else if (kind === 'heal') {
    t.hp = Math.min(t.max, t.hp + h.val); DN.spawn(t.id, h.val, 'heal'); S.fx.push({ kind: 'mend', x: t.x, fy: t.y, t0: S.wt, seed: S.seq });
  } else if (kind === 'miss') {
    DN.spawn(t.id, 0, 'miss'); S.fx.push({ kind: 'dust', x: t.x + (t.side === 'hero' ? -6 : 6), y: t.y, t0: S.wt });
  } else if (kind === 'mp') {
    t.mp = Math.max(0, t.mp - h.val); DN.spawn(t.id, h.val, 'mp'); S.fx.push({ kind: 'drain', x: t.x, y: cy, tx: act.a.x, ty: act.a.y - act.a.hover - 16, t0: S.wt });
  } else if (kind === 'status') {
    DN.spawn(t.id, h.val, 'status'); S.fx.push({ kind: 'hex', x: t.x, fy: t.y, t0: S.wt, seed: S.seq });
  }
}
function userAct(kind) {
  S.lastInput = S.rt; S.pendingLoop = true;
  const tsel = document.getElementById('target').value, R = S.rand, v = (a, b) => Math.round(a + R() * (b - a));
  const tg = A(tsel), foe = tg.side === 'foe', lowHero = ['rowan', 'mira'].map(A).sort((x, y) => x.hp / x.max - y.hp / y.max)[0];
  const Q = (...q) => S.queue.push(q);
  if (kind === 'hit') foe ? Q('rowan', tsel, 'sword', 'SWORD', [['dmg', v(90, 160)]]) : Q('golem', tsel, 'slam', 'ROCK SLAM', [['dmg', v(30, 70)]]);
  if (kind === 'crit') foe ? Q('mira', tsel, 'spark', 'SPARK', [['crit', v(600, 990)]]) : Q('golem', tsel, 'slam', 'ROCK SLAM', [['crit', v(110, 160)]]);
  if (kind === 'heal') Q('mira', foe ? lowHero.id : tsel, 'mend', 'MEND', [['heal', v(120, 240)]]);
  if (kind === 'miss') foe ? Q('rowan', tsel, 'sword', 'SWORD', [['miss']]) : Q('wisp', tsel, 'touch', '', [['miss']]);
  if (kind === 'multi') foe ? Q('rowan', tsel, 'sword', 'FLURRY', [0, 1, 2, 3].map(() => ['dmg', v(30, 70)])) : Q('wisp', tsel, 'touch', 'WISP SWARM', [0, 1, 2].map(() => ['dmg', v(12, 30)]));
  if (kind === 'mp') Q('wisp', 'mira', 'drain', 'MANA DRAIN', [['mp', v(8, 24)]]);
  if (kind === 'status') foe ? Q('mira', tsel, 'slow', 'SLOW', [['status', 'SLOW']]) : Q('wisp', tsel, 'hex', 'HEX', [['status', 'POISON']]);
  for (const a of S.actors) if (a.hp < a.max * 0.3) a.hp = a.max;
  if (A('mira').mp < 20) A('mira').mp = A('mira').maxMp;
}
function startLoop() { S.loopStart = S.wt; S.scriptI = 0; for (const a of S.actors) { a.hp = a.max; if (a.maxMp) a.mp = a.maxMp; } }
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
  DN.update(S.wt - S.dnT); S.dnT = S.wt;   // world time only: numbers freeze with the hit-stop
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
  S.fx = S.fx.filter(f => drawFx(g, f, S.wt));
  DN.draw(g);
  g.restore();
  if (S.banner && S.wt < S.bannerUntil) drawBanner(g, S.banner);
  drawHUD(g, S.actors);
  const fa = S.rt - S.flashT; if (fa >= 0 && fa < 100) { g.globalAlpha = S.flashA * (1 - fa / 100); rect(g, 0, 0, W, FIELD_H, '#fff8e0'); g.globalAlpha = 1; }
  const st = document.getElementById('status');
  if (st) st.textContent = (S.pendingLoop ? 'Manual · auto-loop resumes after 3 s idle' : 'Auto-loop') + ' · ' + DN.count() + ' number' + (DN.count() === 1 ? '' : 's') + ' on screen' + (S.stop > 0 ? ' · HIT-STOP' : '');
}

/* ===== page wiring ===== */
const Q = new URLSearchParams(location.search);
PARAMS.forEach(p => { if (Q.has(p.key)) { const v = Q.get(p.key); P[p.key] = p.type === 'range' ? clamp(+v, p.min, p.max) : p.options.includes(v) ? v : p.default; } });
DN.setParams(P);
function buildParams() {
  const box = document.getElementById('params');
  for (const p of PARAMS) {
    const row = document.createElement('div'); row.className = 'row';
    if (p.type === 'range') {
      row.innerHTML = `<label for="p-${p.key}"><span>${p.label}</span><output id="o-${p.key}"></output></label><input type="range" id="p-${p.key}" min="${p.min}" max="${p.max}" step="${p.step}">`;
      box.appendChild(row); const inp = row.querySelector('input'), out = row.querySelector('output');
      const sync = () => { out.textContent = P[p.key] + ' ' + p.unit; inp.style.setProperty('--fill', ((P[p.key] - p.min) / (p.max - p.min) * 100) + '%'); };
      inp.value = P[p.key]; sync(); inp.addEventListener('input', () => { P[p.key] = +inp.value; DN.setParams(P); sync(); syncURL(); });
    } else {
      const names = { '1': p.key === 'scale' ? '1×' : '1 px', '2': p.key === 'scale' ? '2×' : '2 px' };
      row.innerHTML = `<label><span>${p.label}</span></label><div class="seg" role="radiogroup" aria-label="${p.label}">` + p.options.map(o => `<button type="button" role="radio" data-v="${o}">${names[o] || o}</button>`).join('') + '</div>';
      box.appendChild(row);
      const btns = [...row.querySelectorAll('button')], sync = () => btns.forEach(b => b.setAttribute('aria-checked', b.dataset.v === String(P[p.key])));
      sync(); btns.forEach(b => b.addEventListener('click', () => { P[p.key] = b.dataset.v; DN.setParams(P); sync(); syncURL(); }));
    }
  }
}
function wire() {
  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => userAct(b.dataset.act)));
  document.getElementById('reset').addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); DN.setParams(P); document.getElementById('params').innerHTML = ''; buildParams(); syncURL(); });
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { SPEED = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach(x => x.setAttribute('aria-checked', x === b)); }));
}
function syncURL() { const u = new URLSearchParams(); PARAMS.forEach(p => { if (String(P[p.key]) !== String(p.default)) u.set(p.key, P[p.key]); }); history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : '')); }
let SPEED = 1;
window.addEventListener('keydown', e => { const k = { 1: 'hit', 2: 'crit', 3: 'heal', 4: 'miss', 5: 'multi', 6: 'mp', 7: 'status' }[e.key]; if (k && !e.target.closest('input')) userAct(k); });
function fitCanvas() {
  const stage = document.getElementById('stage'), avail = stage.clientWidth - 14, maxH = window.innerHeight - 140;
  const s = Math.max(1, Math.floor(Math.min(avail / W, Math.max(2, maxH / H))));
  cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
  const sc = document.getElementById('scaleinfo'); if (sc) sc.textContent = '256×224 native · ' + s + '× integer scale';
}
/* text state for critics and tools/sprites/statecheck.py. drawActor() never mirrors a sprite, so every actor is drawn
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
if (AUDIT) console.log('AUDIT t=' + Q.get('t') + ' ' + JSON.stringify(auditReport()));
if (Q.get('log') === '1') console.log(JSON.stringify({ rt: S.rt, wt: S.wt, numbers: DN.count() }));
if (Q.get('freeze') !== '1') {
  let last = performance.now(), acc = 0;
  const loop = now => { acc += Math.min(100, now - last) * SPEED; last = now; while (acc >= FRAME) { step(); acc -= FRAME; } render(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
