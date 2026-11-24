// ===== Host game: "Ford Skirmish" — a small tile-map skirmish. Select a unit, then pick a destination within its
// (hidden) move limit; it slides there and strikes an adjacent / in-range enemy. Enemies then take simple turns. =====
const W = 240, H = 160;
const cv = document.getElementById('screen'), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
const Q = new URLSearchParams(location.search), FREEZE = Q.get('freeze') === '1', T_AT = +Q.get('t') || 0;
const ROSTER = [
  { name: 'Rowan', side: 'a', x: 6, y: 9, hp: 20, atk: 8, def: 3, mv: 5, rmin: 1, rmax: 1 },
  { name: 'Mira', side: 'a', x: 3, y: 10, hp: 16, atk: 7, def: 1, mv: 5, rmin: 1, rmax: 2 },
  { name: 'Bram', side: 'a', x: 5, y: 6, hp: 26, atk: 9, def: 5, mv: 4, rmin: 1, rmax: 1 },
  { name: 'Brigand', side: 'b', x: 13, y: 6, hp: 22, atk: 8, def: 2, mv: 5, rmin: 1, rmax: 1 },
  { name: 'Brigand', side: 'b', x: 14, y: 9, hp: 22, atk: 8, def: 2, mv: 5, rmin: 1, rmax: 1 },
  { name: 'Hexer', side: 'b', x: 18, y: 11, hp: 15, atk: 7, def: 1, mv: 4, rmin: 1, rmax: 2 }
];
let S;
function newGame() {
  S = { f: 0, t: 0, units: ROSTER.map((u, i) => Object.assign({}, u, { max: u.hp, acted: false, phase: i * 0.37 + 0.2 })),
    cur: { x: 6, y: 9 }, cam: { x: 0, y: 64 }, sel: null, anim: null, pops: [], toast: null, phase: 'player', turn: 1, banner: { txt: 'PLAYER PHASE', th: 'a', p: 0 }, queue: [], wait: 0, over: null };
}
const alive = () => S.units.filter(u => u.hp > 0);
const unitAt = (x, y) => alive().find(u => u.x === x && u.y === y);
const passable = (x, y) => inMap(x, y) && TER[at(x, y)].cost < 99;
// hidden move limit: plain step count over passable tiles; every other unit blocks
function steps(u) {
  const d = new Map([[u.y * MW + u.x, 0]]), q = [[u.x, u.y]];
  while (q.length) {
    const [x, y] = q.shift(), k = d.get(y * MW + x);
    if (k >= u.mv) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy, n = ny * MW + nx;
      if (!passable(nx, ny) || d.has(n) || unitAt(nx, ny)) continue;
      d.set(n, k + 1); q.push([nx, ny]);
    }
  }
  return d;
}
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const inRange = (u, o) => { const d = dist(u, o); return d >= u.rmin && d <= u.rmax; };
function strike(u, o) {
  const dmg = Math.max(1, u.atk - o.def - TER[at(o.x, o.y)].def);
  o.hp = Math.max(0, o.hp - dmg); o.hit = 14;
  S.pops.push({ x: o.x * TS + 8, y: o.y * TS - 6, txt: String(dmg), life: 50, side: o.side });
  if (o.hp === 0) S.pops.push({ x: o.x * TS + 8, y: o.y * TS - 16, txt: 'DOWN', life: 60, side: o.side });
}
function moveUnit(u, x, y, then) { S.anim = { u, fx: u.x, fy: u.y, tx: x, ty: y, p: 0, then }; }
function afterMove(u) {
  const foes = alive().filter(o => o.side !== u.side && inRange(u, o)).sort((a, b) => a.hp - b.hp);
  if (foes[0]) strike(u, foes[0]);
  u.acted = true; checkEnd();
}
function checkEnd() {
  if (!alive().some(u => u.side === 'b')) { S.over = 'VICTORY'; S.banner = { txt: 'VICTORY', th: 'a', p: 0, hold: true }; return; }
  if (!alive().some(u => u.side === 'a')) { S.over = 'DEFEAT'; S.banner = { txt: 'DEFEAT', th: 'b', p: 0, hold: true }; return; }
  if (S.phase === 'player' && alive().filter(u => u.side === 'a').every(u => u.acted)) endTurn();
}
function endTurn() {
  if (S.over || S.phase !== 'player') return;
  S.sel = null; S.phase = 'enemy'; S.banner = { txt: 'ENEMY PHASE', th: 'b', p: 0 };
  S.queue = alive().filter(u => u.side === 'b'); S.wait = 70;
}
function enemyAct(e) {
  if (e.hp <= 0) return;
  const foes = alive().filter(o => o.side === 'a'); if (!foes.length) return;
  const tgt = foes.reduce((a, b) => dist(e, b) < dist(e, a) ? b : a);
  let best = { x: e.x, y: e.y, s: dist(e, tgt) }, D = steps(e);
  D.forEach((_, k) => { const x = k % MW, y = (k / MW) | 0, d = Math.abs(x - tgt.x) + Math.abs(y - tgt.y); const s = d < e.rmin ? 99 : d <= e.rmax ? -10 + d * 0.1 : d; if (s < best.s) best = { x, y, s }; });
  const go = () => { const t = alive().find(o => o.side === 'a' && inRange(e, o)); if (t) strike(e, t); checkEnd(); };
  if (best.x === e.x && best.y === e.y) go(); else moveUnit(e, best.x, best.y, go);
}
// ---- input (one tile per key press; the OS key repeat is all the repeat there is) ----
function moveCursor(dx, dy) { S.cur.x = Math.max(0, Math.min(MW - 1, S.cur.x + dx)); S.cur.y = Math.max(0, Math.min(MH - 1, S.cur.y + dy)); }
function confirm() {
  if (S.phase !== 'player' || S.anim || S.over) return;
  const { x, y } = S.cur, u = unitAt(x, y);
  if (!S.sel) { if (u && u.side === 'a' && !u.acted) S.sel = u; return; }
  if (u === S.sel) { S.sel = null; afterMove(u); return; }
  const D = steps(S.sel);
  if (!D.has(y * MW + x)) { S.toast = { txt: u && u.side === 'b' ? 'MOVE NEXT TO IT' : 'TOO FAR', life: 60 }; return; }
  const m = S.sel; S.sel = null; moveUnit(m, x, y, () => afterMove(m));
}
function cancel() { S.sel = null; }
const KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
addEventListener('keydown', e => {
  if (FREEZE) return;
  if (KEYS[e.code]) { e.preventDefault(); if (S.phase === 'player' && !S.over) moveCursor(...KEYS[e.code]); }
  else if (['KeyZ', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); if (!e.repeat) confirm(); }
  else if (['KeyX', 'Escape'].includes(e.code)) cancel();
  else if (e.code === 'KeyE') endTurn();
  else if (e.code === 'KeyR') newGame();
});
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); if (e.button === 2) return cancel();
  const r = cv.getBoundingClientRect(), x = Math.floor(((e.clientX - r.left) / r.width * W + S.cam.x) / TS), y = Math.floor(((e.clientY - r.top) / r.height * H + S.cam.y) / TS);
  if (S.phase !== 'player' || S.over) return; S.cur.x = x; S.cur.y = y; confirm();
});
cv.addEventListener('contextmenu', e => e.preventDefault());
document.getElementById('end').onclick = endTurn; document.getElementById('restart').onclick = newGame; document.getElementById('cancel').onclick = cancel;
// ---- simulation ----
function step() {
  S.f++; S.t = S.f / 60;
  if (S.banner && !S.banner.hold) { S.banner.p += 1 / 80; if (S.banner.p >= 1) S.banner = null; }
  if (S.banner && S.banner.hold) S.banner.p = Math.min(0.5, S.banner.p + 1 / 80);
  S.units.forEach(u => { if (u.hit) u.hit--; });
  S.pops.forEach(p => { p.life--; p.y -= p.life > 40 ? 0.5 : 0; }); S.pops = S.pops.filter(p => p.life > 0);
  if (S.toast && --S.toast.life <= 0) S.toast = null;
  if (S.anim) { const A = S.anim; A.p += 1 / 12; if (A.p >= 1) { A.u.x = A.tx; A.u.y = A.ty; S.anim = null; A.then && A.then(); } }
  else if (S.phase === 'enemy' && !S.over && !S.banner) {
    if (S.wait > 0) S.wait--;
    else if (S.queue.length) { enemyAct(S.queue.shift()); S.wait = 30; }
    else { S.phase = 'player'; S.turn++; S.units.forEach(u => u.acted = false); S.banner = { txt: 'PLAYER PHASE', th: 'a', p: 0 }; }
  }
  const fx = S.anim ? S.anim.u.x * TS : S.cur.x * TS, fy = S.anim ? S.anim.u.y * TS : S.cur.y * TS;
  let cx = S.cam.x, cy = S.cam.y;
  if (fx - cx < 16) cx = fx - 16; if (fx + 32 - cx > W) cx = fx + 32 - W; if (fy - cy < 16) cy = fy - 16; if (fy + 32 - cy > H) cy = fy + 32 - H;
  cx = Math.max(0, Math.min(MW * TS - W, cx)); cy = Math.max(0, Math.min(MH * TS - H, cy));
  S.cam.x += Math.sign(cx - S.cam.x) * Math.ceil(Math.abs(cx - S.cam.x) * 0.25); S.cam.y += Math.sign(cy - S.cam.y) * Math.ceil(Math.abs(cy - S.cam.y) * 0.25);
}
function unitPos(u) { const A = S.anim; if (A && A.u === u) { const e = A.p * A.p * (3 - 2 * A.p); return [(A.fx + (A.tx - A.fx) * e) * TS, (A.fy + (A.ty - A.fy) * e) * TS]; } return [u.x * TS, u.y * TS]; }
function draw() {
  const cam = S.cam;
  g.drawImage(baseLayer(), -cam.x, -cam.y); drawAnim(g, cam, S.t, W, H);
  alive().map(u => ({ u, p: unitPos(u) })).sort((a, b) => a.p[1] - b.p[1]).forEach(({ u, p }) => {
    const X = Math.round(p[0] - cam.x), Y = Math.round(p[1] - cam.y);
    drawUnit(g, u, X + (u.hit ? (u.hit % 4 < 2 ? 1 : -1) : 0), Y, S.t, { bounce: u === S.sel, walk: S.anim && S.anim.u === u });
    const f = Math.round(12 * u.hp / u.max); g.fillStyle = '#0a0612'; g.fillRect(X + 1, Y + 15, 14, 3); g.fillStyle = u.side === 'a' ? '#7cc8ff' : '#ff8a6a'; g.fillRect(X + 2, Y + 16, f, 1);
  });
  if (S.phase === 'player' && !S.over) {   // simple cursor: a 1px box with dark rim
    const X = S.cur.x * TS - cam.x, Y = S.cur.y * TS - cam.y, on = Math.floor(S.t * 3) % 2;
    g.strokeStyle = '#1a0e08'; g.lineWidth = 1; g.strokeRect(X + 0.5, Y + 0.5, 15, 15); g.strokeStyle = on ? '#fff6c0' : '#f0c040'; g.strokeRect(X + 1.5, Y + 1.5, 13, 13);
  }
  S.pops.forEach(p => { const s = p.txt, X = Math.round(p.x - cam.x - textW(s) / 2), Y = Math.round(p.y - cam.y); drawText(g, s, Math.max(2, Math.min(W - textW(s) - 3, X)), Math.max(2, Y), '#ffffff', p.side === 'a' ? '#ff9c8c' : '#ffe070', '#140608'); });
  vignette(g, W, H);
  win(g, 4, 4, 58, 16, S.phase === 'enemy' ? 'b' : 'a'); drawText(g, 'TURN ' + S.turn, 10, 8, '#fff4c8', '#e8c870');
  if (S.toast) { const w = textW(S.toast.txt) + 14; win(g, Math.round((W - w) / 2), H - 22, w, 16, 'n'); drawText(g, S.toast.txt, Math.round((W - w) / 2) + 7, H - 18, '#ffd8c8', '#ffb098'); }
  if (S.banner) banner(g, W, H, S.banner.txt, S.banner.th, S.banner.p);
}
// ---- boot: ?t=&freeze=1 replays a short scripted turn and draws one frame ----
newGame();
const SCRIPT = [[400, () => { S.cur = { x: 6, y: 9 }; confirm(); }], [900, () => { S.cur = { x: 9, y: 7 }; }], [1300, () => confirm()], [2200, () => endTurn()]];
if (FREEZE) { const n = Math.round(T_AT * 60 / 1000); let si = 0; for (let i = 0; i < n; i++) { while (si < SCRIPT.length && SCRIPT[si][0] <= i * 1000 / 60) SCRIPT[si++][1](); step(); } draw(); }
else { let acc = 0, last = performance.now(); const loop = now => { acc += Math.min(100, now - last); last = now; while (acc >= 1000 / 60) { step(); acc -= 1000 / 60; } draw(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
function fit() { const aw = document.getElementById('stage').clientWidth - 20, ah = Math.max(200, innerHeight - 170); let s = Math.floor(Math.min(aw / W, ah / H)); if (s < 2) s = Math.min(aw / W, ah / H); cv.style.width = Math.floor(W * s) + 'px'; cv.style.height = Math.floor(H * s) + 'px'; }
addEventListener('resize', fit); fit();
