// B-04 demo: the module alone on the Highcliff map. A scripted tour (deterministic: ?t=<ms>&freeze=1 replays it) shows the jump
// rule, a hop up the stairs, a back attack, the facing picker, the x-ray outline behind the tower, a camera turn and the
// high-ground range bonus. Any key or click switches to manual play. ?<param>=<value> overrides the controls.
'use strict';
const W = 256, H = 224, cv = document.getElementById('screen'), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
const Q = new URLSearchParams(location.search), FREEZE = Q.get('freeze') === '1', T_AT = +Q.get('t') || 0;
const PARAMS = { jump: 3, fall: 2, hgRange: 2, hgDamage: 10, side: 1.25, back: 1.5, step: 4, xray: 'active', overlay: 'pulse' };
for (const k in PARAMS) if (Q.has(k)) PARAMS[k] = typeof PARAMS[k] === 'number' ? +Q.get(k) : Q.get(k);
const CAST = [   // heroes have no jump of their own: the Jump slider sets it (module param 'jump')
  { id: 'rowan', name: 'Rowan', cls: 'knight', side: 'a', x: 2, y: 6, hp: 34, atk: 12, def: 6, mv: 4, rng: [1, 1], facing: 3, wait: 20 },
  { id: 'mira', name: 'Mira', cls: 'archer', side: 'a', x: 1, y: 3, hp: 24, atk: 11, def: 3, mv: 4, rng: [2, 3], facing: 0, wait: 18 },
  { id: 'tess', name: 'Tess', cls: 'scout', side: 'a', x: 1, y: 8, hp: 26, atk: 10, def: 3, mv: 5, rng: [1, 1], facing: 3, wait: 14 },
  { id: 'brute', name: 'Brute', cls: 'brute', side: 'b', x: 4, y: 3, hp: 22, atk: 10, def: 3, mv: 4, jump: 2, rng: [1, 1], facing: 0, wait: 24 },
  { id: 'hexer', name: 'Hexer', cls: 'hexer', side: 'b', x: 2, y: 0, hp: 18, atk: 9, def: 1, mv: 3, jump: 2, rng: [2, 3], facing: 1, wait: 21 },
  { id: 'bowman', name: 'Bowman', cls: 'bowman', side: 'b', x: 9, y: 1, hp: 18, atk: 8, def: 1, mv: 3, jump: 3, rng: [2, 3], facing: 2, wait: 20 }
];
let S, ISO;
const byId = id => S.units.find(u => u.id === id);
const unitAt = (x, y) => S.units.find(u => u.hp > 0 && u.x === x && u.y === y) || null;
function make() {
  return GameDNA_IsoHeight.create({
    cols: ART.MAP.cols, rows: ART.MAP.rows, params: Object.assign({ tileW: 32, rotate: 'on' }, PARAMS),
    height: ART.MAP.height, terrain: (x, y) => ({ kind: ART.MAP.kind(x, y), stairs: ART.MAP.stairs(x, y) }), cost: ART.MAP.cost,
    units: () => S.units, occupant: unitAt, idOf: u => u.id, team: u => u.side,
    moveOf: u => u.mv, rangeOf: u => u.rng, waitOf: u => u.wait, setUnitPos: (u, x, y) => { u.x = x; u.y = y; },
    drawPos: u => { const L = S.lunge; if (!L || L.u !== u) return null; const k = Math.sin(Math.min(1, L.t / 16) * Math.PI) * 0.28; return { x: u.x + Math.sign(L.to.x - u.x) * k, y: u.y + Math.sign(L.to.y - u.y) * k, z: ISO.heightAt(u.x, u.y) }; },
    drawUnit: (ctx, u, fx, fy, info) => { if (!info.xray) u._drawn = { x: fx, y: fy, flip: !!info.flip, back: !!info.back, walking: !!info.walking, f: S.f };   /* for __state() only */ ART.drawUnitSprite(ctx, u.cls, fx, fy, info, { phase: CAST.indexOf(CAST.find(c => c.id === u.id)) * 0.37, flash: u.flash > 0 && (u.flash >> 1) % 2 ? 0.75 : 0 }); if (!info.xray) ART.bar(ctx, fx - 6, fy - (info.water ? 24 : 27), 12, u.hp / u.max, u.side === 'a' ? '#7cd8ff' : '#ff8a6a'); },
    drawPortrait: (ctx, u, x, y, s) => ART.portrait(ctx, u.cls, x, y, s),
    getCursor: () => S.cur, onCursor: (x, y) => { S.cur = { x, y }; }, cursorKeys: true,
    view: { x: 0, y: 0, w: W, h: H }
  });
}
function reset() {
  S = { f: 0, t: 0, units: CAST.map(c => Object.assign({}, c, { max: c.hp, flash: 0 })), cur: { x: 2, y: 6 }, sel: null, lunge: null, pops: [], caption: '', forecast: null, manual: S ? S.manual : false };
  ISO = make(); ISO.wt.reset(S.units); ISO.snapCamera();
}
// ---- the tour: [frame, action] ----
const TOUR = [
  [1, () => { S.sel = byId('rowan'); ISO.showRange(S.sel); ISO.setActive(S.sel); S.caption = 'JUMP ' + ISO.params.jump + ': CLIFFS NEED THE STAIRS'; }],
  [50, () => cur(2, 5)], [70, () => cur(3, 5)], [90, () => cur(3, 4)], [110, () => cur(3, 3)],
  [150, () => { const u = S.sel, p = ISO.pathTo(u, 3, 3); S.caption = 'HOPS UP THE STAIRS'; if (!p) { S.caption = 'JUMP TOO LOW FOR THE STAIRS'; return; } ISO.show({ move: null, attack: null, path: [] }); ISO.walk(u, p, () => {
    const t = byId('brute'); if (!ISO.canHit(u, u.x, u.y, t.x, t.y)) return; ISO.show({ attack: ISO.attackFrom(u, u.x, u.y), target: t }); S.cur = { x: t.x, y: t.y };
    const m = ISO.damageMod(u, t), d = Math.max(1, Math.round((u.atk - t.def) * m.mult)); S.forecast = { u, t, m, d }; S.caption = m.side === 'back' ? 'BEHIND THE BRUTE: BACK HIT' : 'ATTACK';
  }, { frames: 8 }); }],
  [290, () => { const F = S.forecast; if (!F) return; ISO.setFacing(F.u, ISO.facingToward(F.u.x, F.u.y, F.t.x, F.t.y)); S.lunge = { u: F.u, to: F.t, t: 0 }; }],
  [298, () => { const F = S.forecast; if (!F) return; F.t.hp = Math.max(1, F.t.hp - F.d); F.t.flash = 14; S.pops.push({ id: F.t.id, txt: String(F.d), tag: F.m.side === 'back' ? 'BACK' : '', life: 60 }); }],
  [312, () => { S.lunge = null; }],
  [360, () => { S.forecast = null; ISO.clear(); const u = byId('rowan'); S.cur = { x: u.x, y: u.y }; ISO.chooseFacing(u, () => {}); S.caption = 'CHOOSE A FACING'; }],
  [395, () => ISO.press('left')], [425, () => ISO.press('down')], [455, () => ISO.press('a')],
  [480, () => { cur(2, 0); S.caption = 'HIDDEN BEHIND THE TOWER: OUTLINE'; }],
  [575, () => { ISO.rotate(1); S.caption = 'CAMERA TURNS 90 DEGREES'; }],
  [665, () => { ISO.rotate(-1); }],
  [700, () => { S.sel = byId('mira'); ISO.setActive(S.sel); ISO.showRange(S.sel); cur(1, 3); S.caption = 'HIGH GROUND: LONGER RANGE'; }],
  [780, () => cur(4, 7)],
  [900, () => { ISO.clear(); S.sel = null; S.caption = ''; }]
];
const LOOP = 960;
function cur(x, y) { S.cur = { x, y }; }
function step() {
  S.f++; S.t = S.f / 60;
  if (!S.manual) { const lf = S.f % LOOP; if (lf === 0) { const m = S.manual; reset(); S.manual = m; } TOUR.forEach(([at, fn]) => { if (lf === at) fn(); }); }
  ISO.update();
  { const o = ISO.project(0, 0).x; S.units.forEach(u => { const x = ISO.project(u.x, u.y).x - o; if (u._rot === ISO.rot && u._px != null && x !== u._px) u._vx = Math.sign(x - u._px); u._px = x; u._rot = ISO.rot; }); }   // __state() only: screen side of the last tile step
  if (S.lunge) S.lunge.t++;
  S.units.forEach(u => { if (u.flash) u.flash--; });
  S.pops.forEach(p => p.life--); S.pops = S.pops.filter(p => p.life > 0);
}
function draw() {
  g.imageSmoothingEnabled = false; ART.sky(g, W, H, S.t);
  ISO.draw(g);
  S.pops.forEach(p => { const u = byId(p.id), a = ISO.project(u.x, u.y), age = 60 - p.life, y = Math.round(a.y - 34 - Math.min(10, age * 0.8));
    ART.text(g, p.txt, Math.round(a.x - ART.textW(p.txt) / 2), y, '#ffffff', '#ffe070', '#140608'); if (p.tag) ART.text(g, p.tag, Math.round(a.x - ART.textW(p.tag) / 2), y - 9, '#ffd0a0', '#ff8a40', '#2a0a04'); });
  const hud = [];
  const ord = ISO.drawOrder(g, 4, 4, 7); if (ord) hud.push(ord);
  if (S.forecast) {   // what the module's damageMod says about this pair
    const F = S.forecast, w = 122, h = 46, x = W - w - 4, y = 34; ART.win(g, x, y, w, h, 'b'); hud.push({ x, y, w, h });
    ART.text(g, F.t.name, x + 6, y + 5, '#ffd8cc', '#ffb0a0'); ART.text(g, 'DMG ' + F.d, x + w - 6 - ART.textW('DMG ' + F.d), y + 5, '#ffffff', '#ffe070');
    const tag = F.m.side.toUpperCase() + ' X' + F.m.facing; ART.text(g, tag, x + 6, y + 17, F.m.facing > 1 ? '#a8f0a0' : '#c8d4ff', F.m.facing > 1 ? '#5ac860' : '#8ca8e8');
    const ht = 'HEIGHT X' + F.m.height.toFixed(2).replace(/0$/, ''); ART.text(g, ht, x + 6, y + 29, F.m.height > 1 ? '#a8f0a0' : F.m.height < 1 ? '#ff9a80' : '#c8d4ff', '#8ca8e8');
  }
  if (S.caption) { const s = S.caption, w = ART.textW(s) + 14, x = 4, y = H - 19; ART.win(g, x, y, w, 15, 'a'); ART.text(g, s, x + 7, y + 4, '#fff4c8', '#e8c870'); hud.push({ x, y, w, h: 15 }); }
  ISO.drawUI(g, hud);
}
// ---- manual play ----
function manualOn() { if (!S.manual) { S.manual = true; S.caption = ''; S.forecast = null; } }
const ACT = {
  a: () => {
    if (ISO.choosingFacing) { ISO.press('a'); return; }
    const u = unitAt(S.cur.x, S.cur.y);
    if (!S.sel || (u && u !== S.sel)) { if (u) { S.sel = u; ISO.setActive(u); ISO.showRange(u); } return; }
    if (S.cur.x === S.sel.x && S.cur.y === S.sel.y) { ISO.clear(); ISO.chooseFacing(S.sel, () => {}); return; }
    const R = ISO.reachOf(S.sel), p = ISO.pathTo(S.sel, S.cur.x, S.cur.y);
    if (!p || !R.stop.has(ISO.tileKey(S.cur.x, S.cur.y))) { ISO.buzz(); return; }
    const u2 = S.sel; ISO.show({ move: null, attack: null, path: [] }); ISO.walk(u2, p, () => { ISO.showRange(u2); }, { frames: 8 });
  },
  b: () => { if (ISO.choosingFacing) { ISO.cancelFacing(); return; } ISO.clear(); S.sel = null; },
  f: () => { const u = S.sel || unitAt(S.cur.x, S.cur.y); if (u) { ISO.clear(); ISO.chooseFacing(u, () => {}); } }
};
addEventListener('keydown', e => {
  if (FREEZE) return; const n = { KeyZ: 'a', Enter: 'a', Space: 'a', KeyX: 'b', Escape: 'b', KeyF: 'f' }[e.code];
  if (!n && !/^(Arrow|Key[WASDQE])/.test(e.code)) return; manualOn(); e.preventDefault();
  if (ISO.key(e.code, true, e.repeat)) return; if (n && !e.repeat) ACT[n]();
});
addEventListener('keyup', e => { if (!FREEZE) ISO.key(e.code, false); });
const px = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
cv.addEventListener('pointermove', e => { if (FREEZE || !S.manual || e.pointerType !== 'mouse') return; const t = ISO.pick(...px(e)); if (t && !ISO.choosingFacing) S.cur = { x: t.x, y: t.y }; });
cv.addEventListener('pointerdown', e => {
  if (FREEZE) return; e.preventDefault(); manualOn(); const t = ISO.pick(...px(e)); if (!t) return;
  if (ISO.choosingFacing) { const u = S.sel; if (u) { ISO.setFacing(u, ISO.facingToward(u.x, u.y, t.x, t.y)); ISO.cancelFacing(); } return; }
  if (t.x !== S.cur.x || t.y !== S.cur.y) { S.cur = { x: t.x, y: t.y }; if (e.pointerType !== 'mouse') return; }
  ACT.a();
});
document.querySelectorAll('[data-k]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); manualOn(); const k = b.dataset.k; if (k === 'rotl' || k === 'rotr') ISO.rotate(k === 'rotr' ? 1 : -1); else ACT[k](); }));
document.getElementById('replay').onclick = () => { S.manual = false; S.f = 0; reset(); };
// ---- parameter controls ----
const fmt = { side: v => 'x' + (+v).toFixed(2), back: v => 'x' + (+v).toFixed(1), hgDamage: v => v + '%', hgRange: v => v + ' lv', jump: v => v + ' lv', fall: v => '+' + v + ' lv' };
for (const k in PARAMS) {
  const el = document.getElementById('p-' + k); if (!el) continue; el.value = PARAMS[k]; const out = document.getElementById('o-' + k);
  const show = () => { if (out) out.textContent = (fmt[k] || String)(el.value); }; show();
  el.addEventListener('input', () => { PARAMS[k] = el.type === 'range' || k === 'step' ? +el.value : el.value; show(); ISO.setParams({ [k]: PARAMS[k] }); if (S.caption.startsWith('JUMP')) S.caption = 'JUMP ' + PARAMS.jump + ': CLIFFS NEED THE STAIRS'; });
}
/* text state for critics and tools/sprites/statecheck.py: every unit as drawn this frame (feet, canvas px). The module hands drawUnit()
   info.flip / info.back; the sprites are painted looking screen-right (front frame: down-right, back frame: up-right), so flip = looks screen-left. */
const ART_FACING = 'right';
window.__state = () => ({ t: Math.round(S.f * 1000 / 60), rot: ISO.rot, actors: S.units.filter(u => u.hp > 0).map(u => { const d = u._drawn && u._drawn.f === S.f ? u._drawn : null, L = S.lunge;
  if (!d) { const a = ISO.project(u.x, u.y); return { id: u.id, x: Math.round(a.x), y: Math.round(a.y), facing: null, target: null, noFace: 'not drawn this frame' }; }
  return { id: u.id, x: Math.round(d.x), y: Math.round(d.y), facing: d.flip ? (ART_FACING === 'right' ? 'left' : 'right') : ART_FACING, target: L && L.u === u ? L.to.id : null,
    vx: d.walking ? u._vx || 0 : 0, flipX: d.flip, view: d.back ? 'back' : 'front', gridFacing: u.facing }; }) });
// ---- boot ----
reset();
if (FREEZE) { const n = Math.round(T_AT * 60 / 1000); for (let i = 0; i < n; i++) step(); draw(); document.documentElement.dataset.state = JSON.stringify({ f: S.f, rot: ISO.rot, caption: S.caption, occluded: ISO.stats().occluded }); }
else { let acc = 0, last = performance.now(); const loop = now => { acc += Math.min(100, now - last); last = now; while (acc >= 1000 / 60) { step(); acc -= 1000 / 60; } draw(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
function fit() { const st = document.getElementById('stage'), aw = st.clientWidth - 22, ah = Math.max(240, innerHeight - 200); let s = Math.floor(Math.min(aw / W, ah / H)); if (s < 1) s = Math.min(aw / W, ah / H); cv.style.width = Math.floor(W * s) + 'px'; cv.style.height = Math.floor(H * s) + 'px'; }
addEventListener('resize', fit); fit();
