/* ===== host game: turn-based battle in the training cavern =====
   Hits only change HP bars (and flash/shake the target). There are no floating numbers or words.
   Every hit goes through applyHit() on the exact frame it lands. */
const S = { rt: 0, wt: 0, actors: makeActors(), fx: [], act: null, banner: null, bannerUntil: 0, mode: 'menu', turn: 0, sel: 0, tsel: 0, wait: 0, rand: rng(7), shakeT: -1e9, idle: 0 };
const ORDER = ['rowan', 'mira', 'golem', 'wisp'];
const A = id => S.actors.find(a => a.id === id);
const CMDS = { rowan: [['ATTACK', 'sword', 0], ['CLEAVE', 'cleave', 0], ['GUARD', 'guard', 0]], mira: [['SPARK', 'spark', 8], ['MEND', 'mend', 6], ['GUARD', 'guard', 0]] };
const TIMING = { sword: [190], cleave: [190, 330], spark: [330], mend: [330], slam: [300], touch: [260], hex: [330], drain: [330], guard: [120] };
function resetBattle() {
  S.actors = makeActors(); A('golem').hp = A('golem').max = 1200; A('wisp').hp = A('wisp').max = 700;
  for (const a of S.actors) { a.shown = a.ghost = a.hp; a.guard = false; a.poison = false; }
  S.turn = 0; S.fx = []; S.act = null; beginTurn();
}
const R = (a, b) => Math.round(a + S.rand() * (b - a));
const alive = side => S.actors.filter(a => a.side === side && !a.dead);
const current = () => A(ORDER[S.turn % ORDER.length]);

// ---- impact hook: the one place where a landed hit changes the game ----
// kind: 'damage' | 'crit' | 'heal' | 'miss' | 'mp' | 'status' | 'poison'
function applyHit(target, amount, kind) {
  if (kind === 'damage' || kind === 'crit' || kind === 'poison') {
    if (target.guard && kind !== 'poison') amount = Math.round(amount / 2);
    target.hp = Math.max(0, target.hp - amount); target.hurtT = S.wt; target.ghostWait = 400;
    if (kind === 'crit') S.shakeT = S.rt;
    if (target.hp === 0) { target.dead = true; target.deadT = S.wt; }
  } else if (kind === 'heal') target.hp = Math.min(target.max, target.hp + amount);
  else if (kind === 'mp') target.mp = Math.max(0, target.mp - amount);
  else if (kind === 'status') target.poison = true;
  else if (kind === 'miss') target.dodgeT = S.wt;
}

function beginTurn() {
  if (!alive('foe').length) { S.mode = 'win'; S.banner = 'VICTORY'; S.bannerUntil = Infinity; return; }
  if (!alive('hero').length) { S.mode = 'lose'; S.banner = 'DEFEATED'; S.bannerUntil = Infinity; return; }
  let c = current(); while (c.dead) { S.turn++; c = current(); }
  c.guard = false;
  if (c.poison) { applyHit(c, Math.round(c.max * 0.05), 'poison'); S.fx.push({ kind: 'hex', x: c.x, fy: c.y, t0: S.wt, seed: S.turn }); if (c.dead) { S.next = true; S.wait = 500; S.mode = 'pause'; return; } }
  if (c.side === 'hero') { S.mode = 'menu'; S.sel = 0; S.idle = 0; }
  else { S.mode = 'pause'; S.wait = 450; }
}
function enemyMove(c) {
  const heroes = alive('hero'), t = heroes[Math.floor(S.rand() * heroes.length)];
  if (c.id === 'golem') { const miss = S.rand() < 0.2; perform(c, t, 'slam', 'ROCK SLAM', [[miss ? 'miss' : 'damage', R(40, 70)]]); }
  else {
    const r = S.rand(), mira = A('mira');
    if (r < 0.25 && !mira.dead && mira.mp > 0) perform(c, mira, 'drain', 'MANA DRAIN', [['mp', R(6, 14)]]);
    else if (r < 0.45 && !t.poison) perform(c, t, 'hex', 'HEX', [['status', 0]]);
    else perform(c, t, 'touch', '', [[S.rand() < 0.15 ? 'miss' : 'damage', R(18, 34)]]);
  }
}
function perform(a, t, type, name, hits) {
  const tm = TIMING[type];
  S.act = { a, t, type, t0: S.wt, hits: hits.map((h, i) => ({ dt: tm[Math.min(i, tm.length - 1)], kind: h[0], amt: h[1], done: false })) };
  S.act.last = S.act.hits[S.act.hits.length - 1].dt; S.act.end = S.act.last + (type === 'sword' || type === 'cleave' || type === 'touch' ? 330 : 260);
  if (name) { S.banner = name; S.bannerUntil = S.wt + S.act.end; }
  if (type === 'spark' || type === 'mend') S.fx.push({ kind: 'charge', x: a.x - 3, y: a.y - 32, t0: S.wt, dur: tm[0] });
  if (type === 'hex' || type === 'drain') S.fx.push({ kind: 'charge', x: a.x, y: a.y - a.hover - 16, t0: S.wt, dur: tm[0], cols: ['#3a1a5a', '#8a48c8', '#d0a0ff', '#ffffff'] });
  S.mode = 'anim';
}
function tickAct() {
  const act = S.act; if (!act) return;
  const { a, t, type } = act, l = S.wt - act.t0;
  if (type === 'sword' || type === 'cleave') {
    const go = easeOut(clamp(l / 180, 0, 1)), back = clamp((l - act.last - 120) / 180, 0, 1);
    a.x = lerp(lerp(a.hx, t.x + t.half + 12, go), a.hx, back); a.y = lerp(lerp(a.hy, t.y + 3, go), a.hy, back);
    a.pose = l > 140 && l < act.last + 120 ? 'attack' : 'idle';
  } else if (type === 'slam') { a.pose = l < 260 ? 'raise' : l < act.end - 40 ? 'slam' : 'idle'; a.x = a.hx + (a.pose === 'slam' ? 8 : a.pose === 'raise' ? -2 : 0); }
  else if (type === 'touch') { const go = easeOut(clamp(l / 240, 0, 1)), back = clamp((l - act.last - 80) / 200, 0, 1); a.x = lerp(lerp(a.hx, t.x - 24, go), a.hx, back); a.y = lerp(lerp(a.hy, t.y - 4, go), a.hy, back); }
  else if (a.id === 'mira') a.pose = l < act.last + 160 ? 'cast' : 'idle';
  for (const h of act.hits) if (!h.done && l >= h.dt) {
    h.done = true; const b = actorBox(t), cy = b.top + b.h / 2;
    if (type === 'guard') { a.guard = true; continue; }
    applyHit(t, h.amt, h.kind);
    if (h.kind === 'damage' || h.kind === 'crit') {
      if (type === 'sword' || type === 'cleave') S.fx.push({ kind: 'slash', x: t.x, y: cy, t0: S.wt, dir: act.hits.indexOf(h) % 2 ? -1 : 1 });
      if (type === 'spark') S.fx.push({ kind: 'bolt', x: t.x, y: cy, t0: S.wt, seed: S.turn });
      if (type === 'slam') S.fx.push({ kind: 'dust', x: t.x, y: t.y, t0: S.wt });
      S.fx.push({ kind: 'sparks', x: t.x, y: cy, t0: S.wt, P: fxParticles(S.turn * 13 + l, 8, 3.2, 1.6) });
    }
    if (h.kind === 'heal') S.fx.push({ kind: 'mend', x: t.x, fy: t.y, t0: S.wt, seed: S.turn });
    if (h.kind === 'status') S.fx.push({ kind: 'hex', x: t.x, fy: t.y, t0: S.wt, seed: S.turn });
    if (h.kind === 'mp') S.fx.push({ kind: 'drain', x: t.x, y: cy, tx: a.x, ty: a.y - a.hover - 16, t0: S.wt });
    if (h.kind === 'miss') S.fx.push({ kind: 'dust', x: t.x + (t.side === 'hero' ? -6 : 6), y: t.y, t0: S.wt });
  }
  if (l >= act.end) { a.x = a.hx; a.y = a.hy; a.pose = 'idle'; S.act = null; S.mode = 'pause'; S.wait = 280; S.next = true; }
}
// ---- player input ----
function targets() { const c = CMDS[current().id][S.sel]; return c[1] === 'mend' ? alive('hero') : c[1] === 'guard' ? [] : alive('foe'); }
function confirm() {
  const c = current();
  if (S.mode === 'menu') {
    const cmd = CMDS[c.id][S.sel]; if (cmd[2] > (c.mp || 0)) return;
    if (cmd[1] === 'guard') { perform(c, c, 'guard', 'GUARD', [['guard', 0]]); return; }
    S.mode = 'target'; S.tsel = 0; if (cmd[1] === 'mend') { const T = targets(); S.tsel = T.indexOf(T.slice().sort((x, y) => x.hp / x.max - y.hp / y.max)[0]); }
  } else if (S.mode === 'target') {
    const cmd = CMDS[c.id][S.sel], t = targets()[S.tsel];
    if (cmd[2]) c.mp -= cmd[2];
    if (cmd[1] === 'sword') perform(c, t, 'sword', '', [['damage', R(90, 140)]]);
    if (cmd[1] === 'cleave') perform(c, t, 'cleave', 'CLEAVE', [['damage', R(40, 70)], [S.rand() < 0.3 ? 'miss' : 'damage', R(40, 70)]]);
    if (cmd[1] === 'spark') { const crit = S.rand() < 0.2; perform(c, t, 'spark', 'SPARK', [[crit ? 'crit' : 'damage', crit ? R(380, 460) : R(180, 240)]]); }
    if (cmd[1] === 'mend') perform(c, t, 'mend', 'MEND', [['heal', R(120, 180)]]);
  } else if (S.mode === 'win' || S.mode === 'lose') resetBattle();
}
function back() { if (S.mode === 'target') S.mode = 'menu'; }
function move(d) {
  if (S.mode === 'menu') S.sel = (S.sel + d + CMDS[current().id].length) % CMDS[current().id].length;
  if (S.mode === 'target') { const n = targets().length; S.tsel = (S.tsel + d + n) % n; }
}
window.addEventListener('keydown', e => {
  const k = e.key; S.idle = 0;
  if (k === 'ArrowUp' || k === 'ArrowLeft') move(-1); else if (k === 'ArrowDown' || k === 'ArrowRight') move(1);
  else if (k === 'Enter' || k === ' ' || k === 'z' || k === 'Z') confirm(); else if (k === 'Escape' || k === 'x' || k === 'X' || k === 'Backspace') back(); else return;
  e.preventDefault();
});
const cv = document.getElementById('cv'), g = cv.getContext('2d');
cv.addEventListener('pointerdown', e => {
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H; S.idle = 0;
  if (S.mode === 'menu' && x < 100 && y > 160) { const i = Math.floor((y - 164) / 14); if (i >= 0 && i < CMDS[current().id].length) { S.sel = i; confirm(); } return; }
  if (S.mode === 'target') { const T = targets(), i = T.findIndex(a => { const b = actorBox(a); return x > b.x - 4 && x < b.x + b.w + 4 && y > b.y - 4 && y < a.y + 4; }); if (i >= 0) { S.tsel = i; confirm(); } else if (y > 158) back(); return; }
  if (S.mode === 'win' || S.mode === 'lose') confirm();
});
const AUTO = new URLSearchParams(location.search).get('auto') === '1';
function step() {
  S.rt += FRAME; S.wt += FRAME; S.idle += FRAME;
  if (S.mode === 'pause') { S.wait -= FRAME; if (S.wait <= 0) { if (S.next) { S.next = false; S.turn++; beginTurn(); } else { const c = current(); if (c.side === 'foe') enemyMove(c); } } }
  if (S.mode === 'anim') tickAct();
  if (AUTO && S.idle > 500 && (S.mode === 'menu' || S.mode === 'target')) { S.idle = 0; if (S.mode === 'menu') { const c = current(); S.sel = c.id === 'mira' ? (A('rowan').hp < 200 && c.mp >= 6 ? 1 : c.mp >= 8 ? 0 : 2) : (S.turn % 3 === 1 ? 1 : 0); } confirm(); }
  if (AUTO && (S.mode === 'win' || S.mode === 'lose') && S.idle > 2500) { S.idle = 0; resetBattle(); }
  tickBars(S.actors, FRAME);
}
function render() {
  const sa = S.rt - S.shakeT, sx = sa < 200 ? (Math.floor(sa / 33) % 2 ? -2 : 2) : 0;
  rect(g, 0, 0, W, H, '#05040a'); g.save(); g.translate(sx, 0);
  drawBG(g, S.rt);
  [...S.actors].sort((a, b) => a.y - b.y).forEach(a => {
    const dodge = a.dodgeT != null && S.wt - a.dodgeT < 260 ? Math.round(Math.sin((S.wt - a.dodgeT) / 260 * Math.PI) * 6) * (a.side === 'hero' ? 1 : -1) : 0;
    a.x += dodge; drawActor(g, a, S.wt, S.rt); a.x -= dodge;
    if (a.guard && !a.dead) { g.globalAlpha = 0.5 + 0.2 * (Math.floor(S.rt / 120) % 2); ell(g, a.x - 9, a.y - 14, 2, 7, '#9ad8ff'); px(g, a.x - 10, a.y - 19, '#ffffff'); g.globalAlpha = 1; }
    if (a.poison && !a.dead) { const b = actorBox(a), k = Math.floor(S.rt / 300) % 3; ball(g, b.x + b.w - 2, b.top - 2 - k, 2, 2, ['#3a1a5a', '#8a48c8', '#d0a0ff', '#ffffff']); }
  });
  S.fx = S.fx.filter(f => drawFx(g, f, S.wt));
  if (S.mode === 'target') { const t = targets()[S.tsel], b = actorBox(t); drawHand(g, b.x - 2 - (Math.floor(S.rt / 200) % 2), b.top + b.h * 0.45); }
  g.restore();
  if (S.banner && S.wt < S.bannerUntil) drawBanner(g, S.banner);
  const c = current(), menuOpen = S.mode === 'menu';
  drawHUD(g, S.actors, { active: c.side === 'hero' && S.mode !== 'win' && S.mode !== 'lose' ? c.id : null, cursor: S.mode === 'target' && targets()[S.tsel].side === 'foe' ? targets()[S.tsel].id : null });
  if (menuOpen) {
    drawWin(g, 2, 158, 98, 64);
    CMDS[c.id].forEach(([label, , cost], i) => {
      const y = 167 + i * 14, ok = cost <= (c.mp || 0);
      if (i === S.sel) { g.globalAlpha = 0.3; rect(g, 8, y - 3, 86, 13, '#5a6ad0'); g.globalAlpha = 1; drawHand(g, 16 - (Math.floor(S.rt / 200) % 2), y + 3); }
      drawText(g, label, 20, y, ok ? '#ffffff' : '#6a6a88');
      if (cost) { drawText(g, cost + 'MP', 92 - textW(cost + 'MP'), y, ok ? '#c8eeff' : '#6a6a88'); }
    });
  }
  if (S.mode === 'win' || S.mode === 'lose') { g.globalAlpha = 0.45; rect(g, 0, 0, W, FIELD_H, '#05040a'); g.globalAlpha = 1; drawBanner(g, S.banner); drawText(g, 'PRESS ENTER', 128 - textW('PRESS ENTER') / 2, 72, Math.floor(S.rt / 400) % 2 ? '#f2dc98' : '#ffffff'); }
}
function fitCanvas() {
  const avail = Math.min(document.getElementById('stage').clientWidth - 30, 1100), maxH = window.innerHeight - 110;
  const s = Math.max(1, Math.floor(Math.min(avail / W, Math.max(2, maxH / H))));
  cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
}
initSprites(); resetBattle(); fitCanvas(); window.addEventListener('resize', fitCanvas);
const QS = new URLSearchParams(location.search), T0 = QS.has('t') ? +QS.get('t') : 0;
while (S.rt + FRAME <= T0) step();
render();
if (QS.get('freeze') !== '1') { let last = performance.now(), acc = 0; const loop = now => { acc += Math.min(100, now - last); last = now; while (acc >= FRAME) { step(); acc -= FRAME; } render(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
