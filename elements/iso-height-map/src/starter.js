// =====================================================================================================
// HIGHCLIFF CROSSING: starter game for the B-04 system element (isometric height map + jump + facing + WT turns).
// Built on module/iso-height-map.js (window.GameDNA_IsoHeight, pasted above unchanged).
//
// Structure of this script:
//   1. CONFIG & ROSTER        unit stats (hp atk def mv jump wait rng), URL flags
//   2. EXTENSION POINTS       `game` object: addons, hit site, draw-effects slot, UI rects, unit anchors,
//                             input chain, autoplay, clock / hit-stop, turn and phase events (starter/README.md)
//   3. RULES                  damage() with the module's height / facing modifier, the single hit site applyHit(), combat()
//   4. ISO MODULE WIRING      GameDNA_IsoHeight.create(...): map, units, drawUnit, facing, WT
//   5. TURNS & AI             WT turn loop, player stages (move -> act -> face), plan() shared by the enemy AI and ?auto=1
//   6. INPUT                  keyboard / mouse / touch, in the documented chain order
//   7. UPDATE & DRAW          fixed 60 Hz step(), draw() with the effects slot and the top UI hook
//   8. BOOT                   ADDONS slot, then ?t=<ms>&freeze=1 replays frames and draws once (deterministic)
// =====================================================================================================
'use strict';

// ---------- 1. CONFIG & ROSTER ----------
const W = 256, H = 224;
const cv = document.getElementById('screen'), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
const Q = new URLSearchParams(location.search);
const FREEZE = Q.get('freeze') === '1', T_AT = +Q.get('t') || 0, SCRIPT = Q.get('script') || '';
const AUTO = Q.get('auto') === '1' || (FREEZE && !SCRIPT && Q.get('auto') !== '0');
const MAX_TURNS = 80;   // unit turns before TIME UP
const ROSTER = [
  { id: 'rowan', name: 'Rowan', cls: 'knight', side: 'a', x: 1, y: 7, hp: 34, atk: 12, def: 6, mv: 4, jump: 2, wait: 20, rng: [1, 1] },
  { id: 'mira', name: 'Mira', cls: 'archer', side: 'a', x: 0, y: 8, hp: 24, atk: 11, def: 3, mv: 4, jump: 3, wait: 18, rng: [2, 3] },
  { id: 'tess', name: 'Tess', cls: 'scout', side: 'a', x: 2, y: 8, hp: 26, atk: 10, def: 3, mv: 5, jump: 5, wait: 14, rng: [1, 1] },
  { id: 'brute1', name: 'Brute', cls: 'brute', side: 'b', x: 6, y: 5, hp: 22, atk: 10, def: 3, mv: 4, jump: 2, wait: 24, rng: [1, 1] },
  { id: 'brute2', name: 'Brute', cls: 'brute', side: 'b', x: 2, y: 2, hp: 22, atk: 10, def: 3, mv: 4, jump: 2, wait: 24, rng: [1, 1] },
  { id: 'hexer', name: 'Hexer', cls: 'hexer', side: 'b', x: 4, y: 1, hp: 18, atk: 9, def: 1, mv: 3, jump: 2, wait: 21, rng: [2, 3] },
  { id: 'bowman', name: 'Bowman', cls: 'bowman', side: 'b', x: 9, y: 1, hp: 18, atk: 8, def: 1, mv: 3, jump: 3, wait: 20, rng: [2, 3] }
];
const FACE0 = { a: 3, b: 1 };   // heroes start facing north (-y), enemies south (+y)

let S;   // all mutable game state (see newGame)

// ---------- 2. EXTENSION POINTS ----------
// Addons push an object into game.addons (ADDONS slot in section 8). Every member is optional:
//   onHit(ev)            ev = {attacker, target (ids; attacker may be null), amount (always >= 0), kind: 'attack'|'counter'|'heal',
//                        killed, hpBefore, hpAfter, max, mult, side ('front'|'side'|'back'), dh (height difference), anchor (HOME anchor)}
//   update(game, {dt, frozen})   once per 60 Hz step (dt = 1/60 s), ALSO during hit-stop (frozen = true)
//   drawTile(ctx, x, y, sx, sy, tile)   ground layer: on each tile top, in the module's painter's order (under units in front)
//   draw(ctx, cam, game) draw-effects slot: after the map, units, x-ray and cursor; before HUD (native 256x224, shake applied)
//   drawUI(ctx, game)    top UI layer: after the HUD, forecast and info plate, before banners
//   onKey(e, down)       first in the input chain; return true to consume the key
//   onTurnStart(turn, side, unitId)   a unit's turn begins (turn = unit-turn counter, side 'a' player / 'b' enemy)
//   onPhase(phase)       'player' | 'enemy' | 'over' (the side of the acting unit changed, or the game ended)
const game = {
  addons: [],
  builtinNumbers: true,      // set false when an addon draws damage numbers itself
  builtinForecast: true,     // set false when an addon draws the attack forecast (the red target diamond stays)
  isUnitVisible: u => true,  // drawing only (fog of war): hidden units get no sprite, bar, number or x-ray
  targeting: () => S.target ? { attacker: S.target.u.id, target: S.target.list[S.target.i].id, list: S.target.list.map(t => t.id), index: S.target.i, weapon: null } : null,
  forecastData: (a, d) => {
    const att = typeof a === 'string' ? byId(a) : a, def = typeof d === 'string' ? byId(d) : d; if (!att || !def) return null;
    const m = ISO.damageMod(att, def), dmg = damage(att, def), cc = dmg < def.hp && ISO.canHit(def, def.x, def.y, att.x, att.y);
    const cd = cc ? damage(def, att) : 0;
    return { dmg, hit: 100, crit: 0, hits: 1, hpAfter: Math.max(0, def.hp - dmg), mult: m.mult, side: m.side, dh: m.dh,
      counter: cc ? { dmg: cd, hit: 100, crit: 0, hits: 1, hpAfter: Math.max(0, att.hp - cd) } : null };
  },
  setUIRect: (name, rect) => { if (rect) S.addonRects[name] = rect; else delete S.addonRects[name]; },
  emit(name, ...args) { for (const a of game.addons) if (typeof a[name] === 'function') { try { a[name](...args); } catch (e) { console.error('addon ' + name, e); } } },
  hit: (attackerId, targetId, amount, kind) => applyHit(attackerId == null ? null : byId(attackerId), byId(targetId), amount, kind || 'attack'),
  hitStop: ms => { S.freeze = Math.max(S.freeze, Math.round(ms * 60 / 1000)); },
  shake: (px, ms) => { const f = Math.round(ms * 60 / 1000); if (!S.shake || px >= S.shake.px) S.shake = { px, f, total: f }; },
  flash: (color, ms) => { const f = Math.round(ms * 60 / 1000); S.flashFx = { color: color || '#ffffff', f, total: f }; },
  get frozen() { return S.freeze > 0; },
  uiRects: () => S.hud.concat(ISO.getUIRects(), Object.values(S.addonRects)),
  anchorOf: (id, opts) => {
    const u = byId(id); if (!u) return null;
    if (opts && opts.home) { const p = ISO.project(u.x, u.y); return { x: p.x, left: p.x - 8, top: p.y - 24, w: 16, h: 24, footY: p.y, tileX: u.x, tileY: u.y }; }
    const a = ISO.anchorOf(u); return a && { x: a.x, left: a.left, top: a.top, w: a.w, h: a.h, footY: a.footY, tileX: u.x, tileY: u.y };
  },
  get units() { return S.units; }, get cam() { return ISO.cam; }, get phase() { return S.phase; }, get turn() { return S.turnNo; },
  get active() { return S.active ? S.active.id : null; }, get auto() { return AUTO; }, get iso() { return ISO; }
};
window.game = game;

// ---------- 3. RULES ----------
const byId = id => S.units.find(u => u.id === id);
const alive = () => S.units.filter(u => u.hp > 0);
const unitAt = (x, y) => S.units.find(u => u.hp > 0 && u.x === x && u.y === y) || null;
const foesOf = u => alive().filter(o => o.side !== u.side);
// base = atk - def, times the module's height x facing multiplier (from the attacker's tile ax, ay)
const damage = (a, t, ax = a.x, ay = a.y) => Math.max(1, Math.round(Math.max(1, a.atk - t.def) * ISO.damageMod(a, t, ax, ay).mult));
const targetsFrom = (u, x = u.x, y = u.y) => foesOf(u).filter(o => ISO.canHit(u, x, y, o.x, o.y));

// (1) HIT SITE: every HP change goes through here (attacks, counters, heals). amount >= 0; 'heal' adds HP, any other kind removes it.
function applyHit(att, tgt, amount, kind) {
  if (!tgt || tgt.hp <= 0) return null;
  amount = Math.max(0, Math.round(Math.abs(amount)));
  const hpBefore = tgt.hp, heal = kind === 'heal', m = att && !heal ? ISO.damageMod(att, tgt) : { mult: 1, side: 'front', dh: 0 };
  tgt.hp = Math.max(0, Math.min(tgt.max, heal ? tgt.hp + amount : tgt.hp - amount));
  if (!heal) tgt.flash = 14;
  if (tgt.hp === 0) tgt.dying = 30;
  const ev = { attacker: att ? att.id : null, target: tgt.id, amount, kind, killed: tgt.hp === 0, hpBefore, hpAfter: tgt.hp, max: tgt.max,
    mult: m.mult, side: m.side, dh: m.dh, anchor: game.anchorOf(tgt.id, { home: true }) };
  if (game.builtinNumbers && game.isUnitVisible(tgt)) S.pops.push({ id: tgt.id, txt: heal ? '+' + amount : String(amount), life: 50, heal, tag: !heal && m.side === 'back' ? 'BACK' : !heal && m.dh >= 2 ? 'HIGH' : '' });
  game.emit('onHit', ev);
  return ev;
}
// Attack: lunge, hit, then a counter if the defender survives and can reach back. Calls done() at the end.
function combat(att, tgt, done) {
  S.busy = true;
  ISO.setFacing(att, ISO.facingToward(att.x, att.y, tgt.x, tgt.y));
  const counter = () => tgt.hp > 0 && att.hp > 0 && ISO.canHit(tgt, tgt.x, tgt.y, att.x, att.y);
  later(0, () => { S.lunge = { u: att, to: tgt, t: 0 }; });
  later(8, () => applyHit(att, tgt, damage(att, tgt), 'attack'));
  later(20, () => { S.lunge = null; });
  later(30, () => { if (counter()) S.lunge = { u: tgt, to: att, t: 0 }; });
  later(38, () => { if (S.lunge && S.lunge.u === tgt) applyHit(tgt, att, damage(tgt, att), 'counter'); });
  later(50, () => { S.lunge = null; });
  later(60, () => { S.busy = false; done(); });
}
function later(frames, fn) { S.timers.push({ at: S.f + frames, fn }); }

// ---------- 4. ISO MODULE WIRING ----------
let ISO;
function makeIso() {
  return GameDNA_IsoHeight.create({
    cols: ART.MAP.cols, rows: ART.MAP.rows,
    params: { tileW: 32, step: 4, fall: 2, hgRange: 2, hgDamage: 10, side: 1.25, back: 1.5, meleeH: 4, overlay: 'pulse', xray: 'active', rotate: 'on' },
    height: (x, y) => ART.MAP.height(x, y),
    terrain: (x, y) => ({ kind: ART.MAP.kind(x, y), stairs: ART.MAP.stairs(x, y) }),
    cost: (x, y) => ART.MAP.cost(x, y),
    units: () => S.units.filter(u => u.hp > 0 || u.dying > 0),
    alive: u => u.hp > 0, occupant: unitAt, idOf: u => u.id,
    isEnemy: (a, b) => a.side !== b.side, team: u => u.side,
    moveOf: u => u.mv, jumpOf: u => u.jump, rangeOf: u => u.rng, waitOf: u => u.wait,
    facingOf: u => u.facing, setFacing: (u, f) => { u.facing = f; },
    setUnitPos: (u, x, y) => { u.x = x; u.y = y; },
    isVisible: u => game.isUnitVisible(u),
    drawPos: u => {   // lunge: a short push toward the target, at the unit's own height
      const L = S.lunge; if (!L || L.u !== u) return null;
      const k = Math.sin(Math.min(1, L.t / 16) * Math.PI) * 0.28, dx = Math.sign(L.to.x - u.x), dy = Math.sign(L.to.y - u.y);
      return { x: u.x + dx * k, y: u.y + dy * k, z: ISO.heightAt(u.x, u.y) };
    },
    drawUnit: (ctx, u, fx, fy, info) => drawUnit(ctx, u, fx, fy, info),
    drawPortrait: (ctx, u, x, y, size) => ART.portrait(ctx, u.cls, x, y, size),
    drawTile: (ctx, x, y, sx, sy, tile) => game.emit('drawTile', ctx, x, y, sx, sy, tile),
    getCursor: () => (S.phase === 'over' ? null : S.cur), onCursor: (x, y) => onCursor(x, y), cursorKeys: true,
    focus: () => S.lunge ? { x: S.lunge.to.x, y: S.lunge.to.y } : null,
    view: { x: 0, y: 0, w: W, h: H }
  });
}
function drawUnit(ctx, u, fx, fy, info) {
  const dying = u.hp <= 0;
  if (dying && !info.xray) ctx.globalAlpha = Math.max(0, u.dying / 30);
  const acted = S.phase !== 'over' && u === S.active ? false : false;
  ART.drawUnitSprite(ctx, u.cls, fx, fy, info, { phase: u.phase, flash: u.flash > 0 && (u.flash >> 1) % 2 ? 0.75 : 0, grey: acted });
  ctx.globalAlpha = 1;
  if (!info.xray && u.hp > 0 && !info.water) { ART.bar(ctx, fx - 6, fy - 27, 12, u.hp / u.max, u.side === 'a' ? '#7cd8ff' : '#ff8a6a'); }
  else if (!info.xray && u.hp > 0) ART.bar(ctx, fx - 6, fy - 24, 12, u.hp / u.max, u.side === 'a' ? '#7cd8ff' : '#ff8a6a');
}

// ---------- 5. TURNS & AI ----------
function setPhase(p) { if (S.phase !== p) { S.phase = p; game.emit('onPhase', p); } }
function checkEnd() {
  if (S.phase === 'over') return true;
  const a = alive().some(u => u.side === 'a'), b = alive().some(u => u.side === 'b');
  if (a && b && S.turnNo < MAX_TURNS) return false;
  S.result = !b ? 'VICTORY' : !a ? 'DEFEAT' : 'TIME UP'; ISO.clear(); ISO.cancelFacing(); S.target = null; S.stage = 'over'; setPhase('over'); return true;
}
// WT loop: the unit with the lowest wait acts; ending the turn costs wait (full for move + act, 3/4 for one, 1/2 for neither)
function nextTurn() {
  if (checkEnd()) return;
  const u = ISO.wt.next(); if (!u) { checkEnd(); return; }
  S.active = u; S.turnNo++; S.moved = S.acted = false; S.from = { x: u.x, y: u.y };
  S.cur = { x: u.x, y: u.y }; ISO.setActive(u);
  S.plate = { txt: u.name + "'S TURN", team: u.side, f: 70 };
  setPhase(u.side === 'a' ? 'player' : 'enemy');
  game.emit('onTurnStart', S.turnNo, u.side, u.id);
  if (u.side === 'a' && !AUTO) { S.stage = 'move'; ISO.showRange(u); }
  else { S.stage = 'ai'; S.busy = true; later(24, () => { S.busy = false; aiTurn(u); }); }
}
function endUnitTurn() {
  const u = S.active; if (!u) return;
  ISO.wt.end(u, { moved: S.moved, acted: S.acted }); ISO.clear(); S.target = null; S.stage = 'wait';
  if (checkEnd()) return;
  later(12, nextTurn);
}
// player stages
function toAct() {
  const u = S.active, list = targetsFrom(u);
  if (!list.length) { toFace(); return; }
  S.stage = 'act'; list.sort((a, b) => a.hp - b.hp || a.x - b.x);
  S.target = { u, list, i: 0 }; ISO.show({ move: null, attack: ISO.attackFrom(u, u.x, u.y), target: list[0], path: [] });
  S.cur = { x: list[0].x, y: list[0].y };
}
function toFace() {
  const u = S.active; S.stage = 'face'; S.target = null; ISO.clear(); S.cur = { x: u.x, y: u.y };
  ISO.setFacing(u, ISO.bestFacing(u));
  ISO.chooseFacing(u, () => endUnitTurn());
}
function confirmMove() {
  const u = S.active; if (S.stage !== 'move' || S.busy) return false;
  if (S.cur.x === u.x && S.cur.y === u.y) { toAct(); return true; }
  const path = ISO.pathTo(u, S.cur.x, S.cur.y);
  const R = ISO.reachOf(u); if (!path || !R.stop.has(ISO.tileKey(S.cur.x, S.cur.y))) { ISO.buzz(); return true; }
  S.stage = 'walk'; ISO.show({ move: null, attack: null, path: [] });
  ISO.walk(u, path, () => { S.moved = true; toAct(); }, { frames: 8 });
  return true;
}
function targetKey(name) {
  const T = S.target; if (!T) return false;
  if (name === 'left' || name === 'up') T.i = (T.i + T.list.length - 1) % T.list.length;
  else if (name === 'right' || name === 'down') T.i = (T.i + 1) % T.list.length;
  else if (name === 'a') { const u = T.u, t = T.list[T.i]; S.target = null; ISO.clear(); S.stage = 'anim'; combat(u, t, () => { S.acted = true; if (!checkEnd()) toFace(); }); return true; }
  else if (name === 'b') { S.target = null; ISO.clear(); toFace(); return true; }
  const t = T.list[T.i]; S.cur = { x: t.x, y: t.y }; ISO.show({ target: t, reset: false });
  return true;
}
// (6) AUTOPLAY / AI planner, shared by the enemy turns and ?auto=1. Uses the module's NON-interactive reachOf / canHit /
// damageMod and a height-aware distance field; it never drives the cursor or the facing picker.
function fieldFor(u) {   // steps (as this unit climbs) from every tile to the nearest foe, ignoring units
  const C = ART.MAP.cols, Rr = ART.MAP.rows, d = new Array(C * Rr).fill(1e9), open = [];
  foesOf(u).forEach(f => { d[f.y * C + f.x] = 0; open.push([f.x, f.y]); });
  while (open.length) {
    const [x, y] = open.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= C || ny >= Rr) continue;
      if (!ISO.canStep(u, nx, ny, x, y)) continue;   // the unit must be able to go nb -> cur
      const nd = d[y * C + x] + ART.MAP.cost(nx, ny); if (nd < d[ny * C + nx]) { d[ny * C + nx] = nd; open.push([nx, ny]); }
    }
  }
  return d;
}
function plan(u) {
  const R = ISO.reachOf(u), C = ART.MAP.cols; let best = null;
  R.stop.forEach(k => {
    const x = k % C, y = (k / C) | 0;
    foesOf(u).forEach(f => {
      if (!ISO.canHit(u, x, y, f.x, f.y)) return;
      const dmg = damage(u, f, x, y), kill = dmg >= f.hp, back = !kill && ISO.canHit(f, f.x, f.y, x, y) ? Math.max(1, f.atk - u.def) : 0;
      const score = (kill ? 100 : 0) + dmg * 3 - back * 2 + (ISO.heightAt(x, y) - ISO.heightAt(f.x, f.y)) * 0.5 - R.cost.get(k).cost * 0.05;
      if (!best || score > best.score) best = { x, y, target: f, score };
    });
  });
  if (best) return best;
  const F = fieldFor(u); let ap = null;
  R.stop.forEach(k => { const s = F[k] * 10 + R.cost.get(k).cost * 0.1 - ISO.heightAt(k % C, (k / C) | 0) * 0.2; if (!ap || s < ap.s) ap = { x: k % C, y: (k / C) | 0, s }; });
  return { x: ap.x, y: ap.y, target: null };
}
function aiTurn(u) {
  if (S.phase === 'over' || u.hp <= 0) { endUnitTurn(); return; }
  const p = plan(u), path = ISO.pathTo(u, p.x, p.y) || [{ x: u.x, y: u.y }];
  const face = () => { ISO.setFacing(u, ISO.bestFacing(u)); S.stage = 'wait'; later(10, endUnitTurn); };
  const act = () => {
    S.cur = { x: u.x, y: u.y };
    if (p.target && p.target.hp > 0 && ISO.canHit(u, u.x, u.y, p.target.x, p.target.y)) {
      ISO.show({ attack: ISO.attackFrom(u, u.x, u.y), target: p.target }); S.cur = { x: p.target.x, y: p.target.y };
      later(18, () => { ISO.clear(); combat(u, p.target, () => { S.acted = true; if (!checkEnd()) face(); }); });
    } else face();
  };
  if (path.length < 2) { act(); return; }
  ISO.showRange(u); S.cur = { x: p.x, y: p.y }; ISO.show({ path, reset: false });
  later(20, () => { ISO.show({ move: null, attack: null, path: [] }); S.stage = 'walk'; ISO.walk(u, path, () => { S.moved = true; act(); }, { frames: 8 }); });
}

// ---------- 6. INPUT ----------
// (5) INPUT CHAIN: addons.onKey -> target picker -> iso module (cursor, rotate Q/E, facing picker) -> stage confirm / back -> R restart.
const NAMES = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyZ: 'a', Enter: 'a', Space: 'a', KeyX: 'b', Escape: 'b', Backspace: 'b' };
function onCursor(x, y) { if (S.stage === 'move' || S.stage === 'idle') { S.cur = { x, y }; } }
function playerInput() { return S.phase === 'player' && !AUTO && !S.busy; }
function onKeyDown(e) {
  for (const a of game.addons) if (a.onKey && a.onKey(e, true)) { e.preventDefault(); return; }
  const n = NAMES[e.code];
  if (S.target && n && playerInput()) { e.preventDefault(); if (!e.repeat) targetKey(n); return; }
  if (playerInput() && (S.stage === 'move' || S.stage === 'face') || e.code === 'KeyQ' || e.code === 'KeyE') { if (ISO.key(e.code, true, e.repeat)) { e.preventDefault(); return; } }
  if (n === 'a' && playerInput() && !e.repeat) { e.preventDefault(); if (S.stage === 'move') confirmMove(); return; }
  if (n === 'b' && playerInput() && !e.repeat) { e.preventDefault(); if (S.stage === 'move') { if (S.cur.x !== S.active.x || S.cur.y !== S.active.y) S.cur = { x: S.active.x, y: S.active.y }; else toAct(); } return; }
  if (e.code === 'KeyR') restart();
}
function onKeyUp(e) { for (const a of game.addons) if (a.onKey) a.onKey(e, false); ISO.key(e.code, false); }
function virtualKey(name, down) {   // on-screen buttons and scripted input use the same names as the keyboard
  if (!down) return;
  if (name === 'rotl' || name === 'rotr') { ISO.rotate(name === 'rotr' ? 1 : -1); return; }
  const code = { a: 'KeyZ', b: 'KeyX', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' }[name];
  onKeyDown({ code, repeat: false, preventDefault() {} }); onKeyUp({ code, preventDefault() {} });
}
function canvasPx(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
function onPointerMove(e) {
  if (e.pointerType !== 'mouse' || !playerInput()) return; const t = ISO.pick(...canvasPx(e)); if (!t) return;
  if (S.target) { const i = S.target.list.findIndex(o => o.x === t.x && o.y === t.y); if (i >= 0 && i !== S.target.i) { S.target.i = i; targetKey('none'); } return; }
  if (S.stage === 'move') { S.cur = { x: t.x, y: t.y }; }
}
function onPointerDown(e) {
  e.preventDefault(); if (!playerInput()) return;
  if (e.button === 2) { virtualKey('b', true); return; }
  const t = ISO.pick(...canvasPx(e)); if (!t) return;
  if (S.target) { const i = S.target.list.findIndex(o => o.x === t.x && o.y === t.y); if (i < 0) return; if (i !== S.target.i) { S.target.i = i; targetKey('none'); if (e.pointerType !== 'mouse') return; } targetKey('a'); return; }
  if (S.stage === 'face') {   // tap a neighbouring tile to face it, tap the unit to confirm
    const u = S.active, d = ISO.facingToward(u.x, u.y, t.x, t.y);
    if (t.x === u.x && t.y === u.y) virtualKey('a', true); else { ISO.setFacing(u, d); ISO.cancelFacing(); endUnitTurn(); }
    return;
  }
  if (S.stage === 'move') { if ((t.x !== S.cur.x || t.y !== S.cur.y) && e.pointerType !== 'mouse') { S.cur = { x: t.x, y: t.y }; return; } S.cur = { x: t.x, y: t.y }; confirmMove(); }
}

// ---------- 7. UPDATE & DRAW ----------
function newGame() {
  S = { f: 0, t: 0, turnNo: 0, phase: null, stage: 'idle', active: null, moved: false, acted: false, from: null,
    units: ROSTER.map((u, i) => Object.assign({}, u, { max: u.hp, facing: FACE0[u.side], phase: i * 0.37 + 0.2, flash: 0, dying: 0 })),
    cur: { x: 1, y: 7 }, busy: false, lunge: null, target: null, timers: [], pops: [], plate: null, banner: { txt: 'HIGHCLIFF CROSSING', th: 'a', p: 0 },
    result: null, addonRects: {}, hud: [], freeze: 0, shake: null, flashFx: null };
  ISO = makeIso(); ISO.wt.reset(S.units); ISO.snapCamera();
  game.emit('onTurnStart', 0, 'a', null);
  later(70, nextTurn);
}
function restart() { newGame(); }
function step() {
  if (S.freeze > 0) {   // hit-stop: the world is frozen, addons still update
    S.freeze--; if (S.shake && --S.shake.f <= 0) S.shake = null; if (S.flashFx && --S.flashFx.f <= 0) S.flashFx = null;
    game.emit('update', game, { dt: 1 / 60, frozen: true }); return;
  }
  S.f++; S.t = S.f / 60;
  if (S.shake && --S.shake.f <= 0) S.shake = null; if (S.flashFx && --S.flashFx.f <= 0) S.flashFx = null;
  ISO.update();
  S.timers.filter(t => t.at <= S.f).forEach(t => { S.timers.splice(S.timers.indexOf(t), 1); t.fn(); });
  if (S.banner) { S.banner.p += 1 / 80; if (S.banner.p >= 1) S.banner = null; }
  if (S.plate && --S.plate.f <= 0) S.plate = null;
  if (S.lunge) S.lunge.t++;
  S.units.forEach(u => { if (u.flash) u.flash--; if (u.dying) u.dying--; });
  S.pops.forEach(p => p.life--); S.pops = S.pops.filter(p => p.life > 0);
  if (AUTO && S.stage === 'face' && ISO.choosingFacing) ISO.press('a');
  game.emit('update', game, { dt: 1 / 60, frozen: false });
}
function draw() {
  g.imageSmoothingEnabled = false;
  ART.sky(g, W, H, S.t);
  g.save();   // world layer (map, units, effects slot) gets the shake offset
  if (S.shake) { const k = S.shake.px * S.shake.f / S.shake.total; g.translate(Math.round(Math.sin(S.shake.f * 2.3) * k), Math.round(Math.cos(S.shake.f * 1.7) * k * 0.6)); }
  ISO.draw(g);
  // (2) DRAW-EFFECTS SLOT: after the map, units, x-ray and cursor; before HUD
  if (game.builtinNumbers) S.pops.forEach(p => {
    const a = game.anchorOf(p.id, { home: true }); if (!a) return; const age = 50 - p.life, y = a.top - 4 - Math.min(10, age * 0.8) + (age > 6 && age < 12 ? 1 : 0);
    const X = Math.round(a.x - ART.textW(p.txt) / 2); ART.text(g, p.txt, Math.max(2, Math.min(W - ART.textW(p.txt) - 3, X)), Math.round(y), p.heal ? '#c8ffb8' : '#ffffff', p.heal ? '#5ad860' : '#ffe070', '#140608');
    if (p.tag) { const tx = Math.round(a.x - ART.textW(p.tag) / 2); ART.text(g, p.tag, tx, Math.round(y) - 9, '#ffd0a0', '#ff8a40', '#2a0a04'); }
  });
  game.emit('draw', g, ISO.cam, game);
  if (S.flashFx) { g.globalAlpha = 0.55 * S.flashFx.f / S.flashFx.total; g.fillStyle = S.flashFx.color; g.fillRect(-8, -8, W + 16, H + 16); g.globalAlpha = 1; }
  g.restore();
  drawHud();
  ISO.drawUI(g, S.hud.concat(Object.values(S.addonRects)));
  game.emit('drawUI', g, game);   // (8) top UI layer for addons
  if (S.banner) ART.banner(g, W, H, S.banner.txt, S.banner.th, S.banner.p);
  if (S.phase === 'over') { ART.banner(g, W, H, S.result, S.result === 'VICTORY' ? 'a' : 'b', 0.5); const s = 'R TO PLAY AGAIN'; ART.win(g, Math.round((W - ART.textW(s)) / 2) - 6, H / 2 + 20, ART.textW(s) + 12, 15, 'n'); ART.text(g, s, Math.round((W - ART.textW(s)) / 2), H / 2 + 24, '#fff4c8', '#e8c870'); }
}
function drawHud() {
  S.hud = [];
  const ord = ISO.drawOrder(g, 4, 4, 7); if (ord) S.hud.push(ord);
  const u = S.active;
  if (u && S.phase !== 'over' && S.stage !== 'wait') {   // active unit window, bottom left
    const x = 4, y = H - 40, w = 104, h = 36; ART.win(g, x, y, w, h, u.side);
    g.fillStyle = '#0a0c24'; g.fillRect(x + 5, y + 5, 26, 26); g.fillStyle = u.side === 'a' ? '#c8dcff' : '#ffd8cc'; g.fillRect(x + 6, y + 6, 24, 24);
    ART.portrait(g, u.cls, x + 6, y + 6, 24);
    ART.text(g, u.name, x + 35, y + 5, '#ffffff', u.side === 'a' ? '#d0e0ff' : '#ffd8cc');
    ART.text(g, u.hp + '/' + u.max, x + w - 6 - ART.textW(u.hp + '/' + u.max), y + 5, '#fff4c8', '#e8c870');
    ART.bar(g, x + 35, y + 15, w - 41, u.hp / u.max, u.side === 'a' ? '#7cd8ff' : '#ff8a6a');
    ART.text(g, 'MV' + u.mv, x + 35, y + 21, '#b8d0ff', '#8ca8e8'); ART.text(g, 'JMP' + u.jump, x + 67, y + 21, '#ffe890', '#e8c048');
    S.hud.push({ x, y, w, h });
  }
  if (S.target && game.builtinForecast) drawForecast();
  if (S.plate && S.phase !== 'over') {   // "<NAME>'S TURN" plate under the order bar
    const s = S.plate.txt, w = ART.textW(s) + 14, x = Math.round(W / 2 - w / 2), y = 32; ART.win(g, x, y, w, 15, S.plate.team);
    ART.text(g, s, x + 7, y + 4, '#fff4c8', '#e8c870'); S.hud.push({ x, y, w, h: 15 });
  }
  const hint = S.stage === 'move' && !AUTO ? 'MOVE' : S.stage === 'act' && !AUTO ? 'ATTACK' : S.stage === 'face' && !AUTO ? 'FACING' : '';
  if (hint) { const w = ART.textW(hint) + 12, x = W - w - 4, y = 4; ART.win(g, x, y, w, 15, 'a'); ART.text(g, hint, x + 6, y + 4, '#fff4c8', '#e8c870'); S.hud.push({ x, y, w, h: 15 }); }
}
function drawForecast() {   // attacker -> target: damage with the height / facing modifier, counter
  const T = S.target, u = T.u, t = T.list[T.i], F = game.forecastData(u, t), w = 120, h = 46, x = W - w - 4, y = H - h - 4;
  ART.win(g, x, y, w, h, 'b'); S.hud.push({ x, y, w, h });
  ART.text(g, t.name, x + 6, y + 5, '#ffd8cc', '#ffb0a0'); const hp = t.hp + '>' + F.hpAfter; ART.text(g, hp, x + w - 6 - ART.textW(hp), y + 5, '#ffe890', '#e8c048');
  ART.text(g, 'DMG ' + F.dmg, x + 6, y + 16, '#ffffff', '#ffe070');
  const tag = (F.dh > 0 ? 'HIGH ' : F.dh < 0 ? 'LOW ' : '') + (F.side !== 'front' ? F.side.toUpperCase() + ' ' : '') + 'X' + F.mult.toFixed(2).replace(/0$/, '');
  ART.text(g, tag, x + w - 6 - ART.textW(tag), y + 16, F.mult > 1 ? '#a8f0a0' : F.mult < 1 ? '#ff9a80' : '#c8d4ff', F.mult > 1 ? '#5ac860' : F.mult < 1 ? '#e05a40' : '#8ca8e8');
  ART.text(g, 'COUNTER ' + (F.counter ? F.counter.dmg : '-'), x + 6, y + 28, '#b8d0ff', '#8ca8e8');
  const dh = 'H' + (F.dh >= 0 ? '+' : '') + F.dh; ART.text(g, dh, x + w - 6 - ART.textW(dh), y + 28, '#fff4c8', '#e8c870');
}

// ---------- 8. BOOT ----------
const SCRIPTS = {   // scripted button presses for ?t=&freeze=1 (ms from start, name). The first turn (Tess) opens at about 1.6 s.
  move: [[2000, 'up'], [2200, 'up'], [2400, 'right'], [2600, 'up']],
  walk: [[2000, 'up'], [2200, 'up'], [2400, 'right'], [2600, 'up'], [2900, 'a']],
  face: [[2000, 'up'], [2200, 'up'], [2400, 'right'], [2600, 'up'], [2900, 'a'], [4600, 'b'], [5000, 'left']],
  rotate: [[2000, 'up'], [2200, 'up'], [2400, 'rotr']]
};
// ---------- ADDONS: register addons here, BEFORE newGame(), so they also receive the first onTurnStart / onPhase ----------
// e.g. game.addons.push(myAddon);   game.builtinNumbers = false;   (if the addon draws its own damage numbers)

newGame();
const script = (SCRIPTS[SCRIPT] || []).map(([at, k]) => ({ at, k, s: 0 }));
function scriptStep() { const ms = S.f * 1000 / 60; script.forEach(e => { if (e.s === 0 && ms >= e.at) { e.s = 1; virtualKey(e.k, true); } }); }
if (FREEZE) {
  const n = Math.round(T_AT * 60 / 1000); for (let i = 0; i < n; i++) { scriptStep(); step(); } draw();
  document.documentElement.dataset.state = JSON.stringify({ phase: S.phase, result: S.result, turn: S.turnNo, stage: S.stage, active: game.active, alive: alive().map(u => u.id + ':' + u.hp) });
} else {
  addEventListener('keydown', onKeyDown); addEventListener('keyup', onKeyUp);
  cv.addEventListener('pointermove', onPointerMove); cv.addEventListener('pointerdown', onPointerDown); cv.addEventListener('contextmenu', e => e.preventDefault());
  document.querySelectorAll('[data-k]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); virtualKey(b.dataset.k, true); }));
  document.getElementById('restart').onclick = restart;
  let acc = 0, last = performance.now();
  const loop = now => { acc += Math.min(100, now - last); last = now; while (acc >= 1000 / 60) { scriptStep(); step(); acc -= 1000 / 60; } draw(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
function fit() { const aw = document.getElementById('stage').clientWidth - 20, ah = Math.max(200, innerHeight - 200); let s = Math.floor(Math.min(aw / W, ah / H)); if (s < 1) s = Math.min(aw / W, ah / H); cv.style.width = Math.floor(W * s) + 'px'; cv.style.height = Math.floor(H * s) + 'px'; }
addEventListener('resize', fit); fit();
window.__iso = () => ({ phase: S.phase, result: S.result, turn: S.turnNo, stage: S.stage, active: game.active, alive: alive().map(u => u.id + ':' + u.hp).join(' ') });
