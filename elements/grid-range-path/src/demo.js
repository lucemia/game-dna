// ===== B-01 demo: map, units, camera and controls panel; ALL element logic and drawing comes from module/grid-range-path.js =====
const DEF = { move: 5, range: '1', costs: 'on', overlay: 'pulsing', repeat: 'normal', res: '240x160' };
const P = Object.assign({}, DEF);
const Q = new URLSearchParams(location.search);
Object.keys(DEF).forEach(k => { if (Q.has(k)) P[k] = k === 'move' ? Math.max(3, Math.min(9, +Q.get(k) || DEF.move)) : Q.get(k); });
const FREEZE = Q.get('freeze') === '1', T_AT = +Q.get('t') || 0, SCRIPT = Q.get('script') || (FREEZE ? 'arrow' : '');
const cv = document.getElementById('screen'), g = cv.getContext('2d');
let W = 240, H = 160;
function applyRes() { [W, H] = P.res === '256x224' ? [256, 224] : [240, 160]; cv.width = W; cv.height = H; g.imageSmoothingEnabled = false; fit(); }

// ---- world (host side) ----
let S, GR;
function newState() {
  const units = [
    { name: 'Rowan', side: 'a', x: 6, y: 9, hp: 20, max: 20 }, { name: 'Mira', side: 'a', x: 3, y: 10, hp: 14, max: 16 }, { name: 'Bram', side: 'a', x: 5, y: 6, hp: 26, max: 26 },
    { name: 'Brigand', side: 'b', x: 13, y: 6, hp: 22, max: 22 }, { name: 'Brigand', side: 'b', x: 14, y: 9, hp: 22, max: 22 }, { name: 'Hexer', side: 'b', x: 18, y: 11, hp: 15, max: 15 }
  ];
  units.forEach((u, i) => { u.phase = i * 0.37 + 0.2; u.acted = false; });
  S = { f: 0, t: 0, units, banner: 0, cam: { x: 0, y: 0 } };
  GR = GameDNA_GridRange.create({
    cols: MW, rows: MH, tile: TS, params: P,
    cost: (x, y) => TER[at(x, y)].cost,
    occupant: (x, y) => S.units.find(u => u.x === x && u.y === y && u.hp > 0) || null,
    canSelect: u => u.side === 'a' && !u.acted,
    terrain: (x, y) => TER[at(x, y)],
    setUnitPos: (u, x, y) => { u.x = x; u.y = y; },
    onWait: u => { u.acted = true; if (S.units.filter(v => v.side === 'a').every(v => v.acted)) { S.units.forEach(v => v.acted = false); S.banner = 1; } },
    drawPortrait: (ctx, u, x, y, t) => drawUnit(ctx, Object.assign({}, u, { acted: false }), x, y, t)
  });
  GR.setCursor(6, 9);
  S.cam = camTarget();
}
function step() {
  S.f++; S.t = S.f / 60;
  GR.update();
  { const u = GR.mode === 'walk' ? GR.unit : null, p = u && GR.drawPos(u); S.walkVx = 0;   // a walking unit looks the way it steps
    if (p) { if (S.walkU === u && p[0] !== S.walkX) { S.walkVx = Math.sign(p[0] - S.walkX); u.face = S.walkVx; } S.walkU = u; S.walkX = p[0]; } else S.walkU = null; }
  if (S.banner > 0) S.banner = Math.max(0, S.banner - 1 / 90);
  const ct = camTarget();
  S.cam.x += Math.sign(ct.x - S.cam.x) * Math.max(Math.min(Math.abs(ct.x - S.cam.x), 1), Math.round(Math.abs(ct.x - S.cam.x) * 0.25));
  S.cam.y += Math.sign(ct.y - S.cam.y) * Math.max(Math.min(Math.abs(ct.y - S.cam.y), 1), Math.round(Math.abs(ct.y - S.cam.y) * 0.25));
}
function camTarget() {   // keep the module's focus (cursor or walking unit) one tile inside the view
  const f = GR.focus(); let x = S.cam.x, y = S.cam.y;
  if (f.x - x < TS) x = f.x - TS; if (f.x + TS - x > W - TS) x = f.x + 2 * TS - W;
  if (f.y - y < TS) y = f.y - TS; if (f.y + TS - y > H - TS) y = f.y + 2 * TS - H;
  return { x: Math.max(0, Math.min(MW * TS - W, x)), y: Math.max(0, Math.min(MH * TS - H, y)) };
}
function draw() {
  const cam = S.cam;
  g.globalCompositeOperation = 'source-over'; g.drawImage(baseLayer(), -cam.x, -cam.y);
  drawAnim(g, cam, S.t, W, H);
  GR.drawUnder(g, cam);
  S.units.filter(u => u.hp > 0).map(u => ({ u, p: GR.drawPos(u) || [u.x * TS, u.y * TS] })).sort((a, b) => a.p[1] - b.p[1])
    .forEach(({ u, p }) => drawUnit(g, u, p[0] - cam.x, p[1] - cam.y, S.t, { bounce: u === GR.unit && GR.mode === 'select', walk: u === GR.unit && GR.mode === 'walk' }));
  vignette(g, W, H);
  GR.drawOver(g, cam, []);
  if (S.banner > 0) banner(g, W, H, 'NEW TURN', 'a', 1 - S.banner);
}

// ---- scripted keys for ?t=&freeze=1 (and the Replay button) ----
const SCRIPTS = {
  arrow: [[300, 'a'], [800, 'right'], [1000, 'right'], [1250, 'up'], [1500, 'up'], [1750, 'right']],
  walk: [[300, 'a'], [800, 'right'], [1000, 'right'], [1250, 'up'], [1500, 'up'], [1750, 'right'], [2100, 'a']],
  menu: [[300, 'a'], [800, 'right'], [1000, 'right'], [1250, 'up'], [1500, 'up'], [1750, 'right'], [2100, 'a'], [3200, 'down']],
  back: [[300, 'a'], [800, 'right'], [1000, 'right'], [1250, 'up'], [1500, 'up'], [1750, 'right'], [2100, 'a'], [3200, 'b'], [3600, 'down']],
  left: [[300, 'a'], [800, 'left'], [1000, 'left'], [1250, 'up'], [1600, 'a']],   // Rowan walks left: it must turn
  cut: [[300, 'a'], [700, 'up'], [900, 'up'], [1100, 'right'], [1300, 'right'], [1500, 'right'], [1800, 'left'], [2000, 'left'], [2200, 'down']],
  hold: [[200, 'right', 1500]],
  enemy: [[200, 'right', 520], [1000, 'up'], [1200, 'up'], [1400, 'up'], [1600, 'right']]
};
let script = [], scriptT0 = 0;
function runScript(name) { script = (SCRIPTS[name] || []).map(e => ({ at: e[0], key: e[1], dur: e[2] || 50, down: false, done: false })); scriptT0 = S.f; }
function scriptStep() {
  const ms = (S.f - scriptT0) * 1000 / 60;
  script.forEach(e => { if (!e.down && ms >= e.at) { e.down = true; GR.press(e.key); } if (e.down && !e.done && ms >= e.at + e.dur) { e.done = true; GR.release(e.key); } });
}

/* text state for critics and tools/sprites/statecheck.py: every living unit (feet = bottom centre of its tile cell, canvas px after the camera).
   facing = faceOf(u), the value drawUnit() mirrors by. */
window.__state = () => ({ t: Math.round(S.f * 1000 / 60), actors: S.units.filter(u => u.hp > 0).map((u, i) => { const p = GR.drawPos(u) || [u.x * TS, u.y * TS];
  return { id: u.name.toLowerCase() + '-' + i, x: p[0] - S.cam.x + 8, y: p[1] - S.cam.y + 16, facing: faceOf(u) > 0 ? 'right' : 'left', target: null, vx: S.walkU === u ? S.walkVx : 0, flipX: faceOf(u) !== ART_FACING }; }) });

// ---- boot + loop ----
applyRes(); newState();
if (SCRIPT) runScript(SCRIPT);
if (FREEZE) { const n = Math.round(T_AT * 60 / 1000); for (let i = 0; i < n; i++) { scriptStep(); step(); } draw(); }
else {
  addEventListener('keydown', e => { if (e.target.closest && e.target.closest('select,input')) return; if (GR.key(e.code, true, e.repeat)) e.preventDefault(); });
  addEventListener('keyup', e => GR.key(e.code, false));
  addEventListener('blur', () => ['left', 'right', 'up', 'down', 'a', 'b'].forEach(n => GR.release(n)));
  let acc = 0, last = performance.now();
  const loop = now => { acc += Math.min(100, now - last); last = now; while (acc >= 1000 / 60) { scriptStep(); step(); acc -= 1000 / 60; } draw(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
// ---- pointer: mouse hover aims, click = aim + confirm, right-click = cancel; touch: tap aims, tap the same tile again confirms ----
function tileFromEvent(e) { const r = cv.getBoundingClientRect(); return [Math.floor(((e.clientX - r.left) / r.width * W + S.cam.x) / TS), Math.floor(((e.clientY - r.top) / r.height * H + S.cam.y) / TS)]; }
cv.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') GR.hover(...tileFromEvent(e)); });
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); if (e.button === 2) { GR.cancel(); return; }
  const [x, y] = tileFromEvent(e), c = GR.cursor;
  if (e.pointerType !== 'mouse' && GR.mode !== 'menu' && (x !== c.x || y !== c.y)) { GR.hover(x, y); return; }
  GR.click(x, y);
});
cv.addEventListener('contextmenu', e => e.preventDefault());
document.querySelectorAll('[data-k]').forEach(b => { b.addEventListener('pointerdown', e => { e.preventDefault(); GR.press(b.dataset.k); }); ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => GR.release(b.dataset.k))); });

// ---- controls panel ----
function bindControls() {
  const set = (k, v) => { P[k] = k === 'move' ? +v : v; const o = document.getElementById('o-' + k); if (o) o.textContent = v; if (k === 'res') { applyRes(); S.cam = camTarget(); } else GR.setParams({ [k]: P[k] }); };
  Object.keys(DEF).forEach(k => { const el = document.getElementById('p-' + k); if (!el) return; el.value = P[k]; const o = document.getElementById('o-' + k); if (o) o.textContent = P[k]; el.addEventListener('input', () => set(k, el.value)); });
  document.getElementById('reset').onclick = () => newState();
  document.getElementById('replay').onclick = () => { newState(); runScript('walk'); };
}
bindControls();
function fit() {
  const st = document.getElementById('stage'), aw = st.clientWidth, ah = Math.max(240, innerHeight - 140);
  let s = Math.floor(Math.min(aw / W, ah / H)); if (s < 1) s = aw / W; if (s < 2 && aw / W > 1.4) s = Math.min(aw / W, ah / H);
  cv.style.width = Math.floor(W * s) + 'px'; cv.style.height = Math.floor(H * s) + 'px';
}
addEventListener('resize', fit);

