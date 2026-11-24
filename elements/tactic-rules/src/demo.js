/* ===== A-13 demo: a small auto-battle where every action comes from module/tactic-rules.js ===== */
'use strict';
const VW = 640, VH = 360, STEP = 1000 / 60, LOOP = 30000;
const qs = new URLSearchParams(location.search);
const PARAMS = [
  { key: 'why', label: 'Why plate', type: 'select', options: ['on', 'off'], default: 'on' },
  { key: 'whyMs', label: 'Plate time', type: 'range', min: 800, max: 4000, step: 100, default: 1800, unit: 'ms' },
  { key: 'theme', label: 'Theme', type: 'select', options: ['dusk', 'slate'], default: 'dusk' },
  { key: 'size', label: 'Text size (0 = auto)', type: 'range', min: 0, max: 20, step: 1, default: 0, unit: 'px' },
  { key: 'maxRules', label: 'Max rules per unit', type: 'range', min: 3, max: 8, step: 1, default: 8, unit: '' },
  { key: 'render', label: 'Render', type: 'select', options: ['auto', 'smooth', 'crisp'], default: 'auto' }
];
const P = {};
PARAMS.forEach(p => { P[p.key] = p.default; if (qs.has(p.key)) { const v = qs.get(p.key); P[p.key] = p.type === 'range' ? clamp(+v, p.min, p.max) : p.options.includes(v) ? v : p.default; } });
const FREEZE = qs.has('t') && qs.get('freeze') === '1', T0 = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : 0;
let SCRIPT = qs.get('script') !== '0', SLOW = qs.get('slow') === '1', PAUSED = false;
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
const lerp = (a, b, u) => a + (b - a) * u, ease = u => 1 - Math.pow(1 - clamp(u, 0, 1), 3), easeIO = u => (u = clamp(u, 0, 1), u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
function hash(a, b) { let h = Math.imul((a | 0) * 374761393 + (b | 0) * 668265263, 3266489917); h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
const KIT = GameDNA_DemoKit, SCENE = 'meadow-dusk', GROUND = 276, ZOOM = 1.06;   // shared HD demo cast + backdrop (demo-kit/)
const UIFONT = '"Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';

/* ---------- the game's own data: skills, units, waves ---------- */
const SKILLS = {
  strike: { label: 'Strike', aim: 'enemy', role: 'attack', melee: true, pow: 1.0, fx: 'slash' },
  guard:  { label: 'Guard', aim: 'self', role: 'guard', fx: 'guard' },
  shoot:  { label: 'Shoot', aim: 'enemy', role: 'attack', pow: 0.95, vsFlying: 1.7, fx: 'arrow' },
  volley: { label: 'Volley', aim: 'allEnemies', role: 'aoe', mp: 6, pow: 0.62, fx: 'volley' },
  smite:  { label: 'Smite', aim: 'enemy', role: 'magic', mp: 3, mag: true, pow: 1.15, vsArmoured: 1.8, fx: 'smite' },
  mend:   { label: 'Mend', aim: 'ally', role: 'heal', mp: 4, heal: 2.6, fx: 'mend' },
  prayer: { label: 'Prayer', aim: 'allAllies', role: 'healAll', mp: 10, heal: 1.4, fx: 'prayer' },
  ether:  { label: 'Ether', aim: 'self', role: 'restore', item: true, fx: 'ether' },
  claw:   { label: 'Claw', aim: 'enemy', role: 'attack', pow: 1.0, fx: 'claw' },
  slam:   { label: 'Slam', aim: 'enemy', role: 'attack', melee: true, pow: 1.0, fx: 'slam' },
  arrow:  { label: 'Bone Arrow', aim: 'enemy', role: 'attack', pow: 0.9, fx: 'arrow' },
  hex:    { label: 'Hex Bolt', aim: 'enemy', role: 'magic', mag: true, pow: 1.0, fx: 'bolt' },
  quake:  { label: 'Quake', aim: 'allEnemies', role: 'aoe', pow: 0.55, fx: 'quake', every: 3 }
};
const HEROES = [
  { key: 'maren', name: 'Maren', cls: 'guardian', hp: 130, mp: 0, atk: 17, mag: 0, def: 8, spd: 5, skills: ['strike', 'guard'], tags: ['front row'], pos: [458, 268], kit: 'sword', kh: 86, bw: 38, bh: 84, at: [446, 290], col: ['#3e6fd0', '#20367a', '#9fc3ff'], hair: '#c9b48a' },
  { key: 'sel', name: 'Sel', cls: 'striker', hp: 86, mp: 24, atk: 15, mag: 0, def: 4, spd: 9, skills: ['shoot', 'volley', 'strike'], tags: ['back row'], pos: [540, 226], kit: 'archer', kh: 84, bw: 36, bh: 82, at: [524, 264], col: ['#3f9a63', '#1f5236', '#a8f0c0'], hair: '#7a3e22' },
  { key: 'ivo', name: 'Ivo', cls: 'healer', hp: 78, mp: 30, atk: 8, mag: 15, def: 4, spd: 7, skills: ['smite', 'mend', 'prayer', 'ether', 'strike'], tags: ['back row'], pos: [556, 304], kit: 'mage', kh: 86, bw: 38, bh: 86, at: [594, 300], col: ['#e8e2d0', '#9a8c6a', '#fff6dc'], hair: '#2c2230' }
];
const FOES = {
  harpy:  { name: 'Harpy', kind: 'harpy', cls: 'striker', hp: 64, atk: 15, def: 3, spd: 10, skills: ['claw'], tags: ['flying'], kit: 'harpy', kh: 76, bw: 58, bh: 70, hover: 42, fly: 44 },
  golem:  { name: 'Iron Golem', kind: 'golem', cls: 'brute', hp: 150, atk: 19, def: 12, spd: 3, skills: ['slam', 'quake'], tags: ['armoured', 'front row'], kit: 'golem', kh: 108, bw: 84, bh: 104, hop: 14 },
  archer: { name: 'Bone Archer', kind: 'archer', cls: 'striker', hp: 56, atk: 13, def: 3, spd: 8, skills: ['arrow'], tags: ['back row'], kit: 'skeleton', kh: 84, bw: 42, bh: 82 },
  cultist: { name: 'Cultist', kind: 'cultist', cls: 'caster', hp: 70, atk: 6, mag: 15, def: 4, spd: 6, skills: ['hex'], tags: ['back row'], kit: 'cultist', kh: 84, bw: 46, bh: 82 }
};
const WAVES = [
  [['golem', 188, 270, 214, 292], ['harpy', 150, 196, 326, 270], ['archer', 92, 292, 60, 300]],
  [['cultist', 96, 250, 128, 262], ['harpy', 176, 192, 334, 270], ['golem', 206, 296, 226, 294], ['archer', 70, 318, 44, 300]]
];
const START_RULES = {
  maren: { rules: [{ if: 'selfHpBelow', n: 30, do: 'guard' }, { if: 'foeHpBelow', n: 35, do: 'strike', pick: 'lowest' }, { if: 'foeIs', tag: 'armoured', do: 'strike' }], otherwise: { do: 'strike', pick: 'toughest' } },
  sel:   { rules: [{ if: 'foeIs', tag: 'flying', do: 'shoot' }, { if: 'foeHpBelow', n: 30, do: 'shoot', pick: 'lowest' }, { if: 'foesAtLeast', n: 3, do: 'volley' }], otherwise: { do: 'shoot', pick: 'weakest' } },
  ivo:   { rules: [{ if: 'allyHpBelow', n: 45, do: 'mend', pick: 'weakest' }, { if: 'alliesAtMost', n: 2, do: 'prayer' }, { if: 'foeIs', tag: 'armoured', do: 'smite' }, { if: 'selfResBelow', n: 25, do: 'ether' }], otherwise: { do: 'smite', pick: 'lowest' } }
};

/* ---------- world ---------- */
const W = {};
function unitFrom(spec, side, i, ox, oy, x, y) {   // (ox, oy): the old layout, kept for the pixel strip and as the damage-roll seed; (x, y): feet on the painted stage
  return { ox, oy, act: KIT.actor(spec.kit, { h: spec.kh }), rig: spec.kit === 'sword' || spec.kit === 'spear' || spec.kit === 'mage', face: side === 'hero' ? -1 : 1, id: side + '-' + i + '-' + (spec.key || spec.kind), side, spec, name: spec.name, key: spec.key || spec.kind, cls: spec.cls, hp: spec.hp, maxHp: spec.hp, mp: spec.mp || 0, maxMp: spec.mp || 0,
    tags: spec.tags.slice(), hx: x, hy: y, guard: false, flash: 0, shownHp: spec.hp, lunge: 0, dieT: -1, items: spec.key === 'ivo' ? 2 : 0, turns: 0 };
}
function resetWorld() {
  Object.assign(W, { st: 0, wave: 0, round: 0, turnNo: 0, queue: [], cur: null, phase: 'intro', pt: 0, fx: [], nums: [], banner: null, log: [] });
  W.heroes = HEROES.map((h, i) => unitFrom(h, 'hero', i, h.pos[0], h.pos[1], h.at[0], h.at[1]));
  spawnWave(0);
  W.phase = 'intro'; W.pt = 0; W.banner = { text: 'Wave 1', sub: 'Every move below comes from a rule', t: 0 };
}
function spawnWave(n) { W.wave = n; W.foes = WAVES[n].map(([k, ox, oy, x, y], i) => unitFrom(FOES[k], 'foe', i, ox, oy, x, y)); W.round = 0; W.queue = []; }
const alive = L => L.filter(u => u.hp > 0);
const sideOf = u => u.side === 'hero' ? W.heroes : W.foes, otherOf = u => u.side === 'hero' ? W.foes : W.heroes;

/* ---------- reach: melee can't hit flying, nor a back row while a front row stands ---------- */
function reachFor(u, id) {
  const sk = SKILLS[id], foes = alive(otherOf(u));
  if (!sk || sk.aim !== 'enemy') return undefined;
  if (!sk.melee) return foes;
  const ground = foes.filter(f => !f.tags.includes('flying')), front = ground.filter(f => !f.tags.includes('back row'));
  return front.length ? front : ground;
}

/* ---------- the module ---------- */
const BAR_H = 13;   // the HP bar under a unit belongs to its box, so plates and ticks never sit on it
const anchorHD = u => { const b = boxOf(u); return { x: b.x, y: b.y, w: b.w, h: b.h + BAR_H }; };
const HUDR = { cards: { x: 286, y: 318, w: 344, h: 36 }, top: { x: 10, y: 10, w: 184, h: 26 }, hint: { x: VW - 136, y: 10, w: 126, h: 26 } };
const uiRectsHD = () => [HUDR.cards, HUDR.top, HUDR.hint].concat(W.banner ? [{ x: 0, y: 128, w: VW, h: 70 }] : []);
const obstaclesHD = () => alive(W.heroes.concat(W.foes)).map(u => Object.assign({ id: u.id }, anchorHD(u)));
function adapters(extra) {
  return Object.assign({
    actions: Object.keys(SKILLS).map(id => ({ id, label: SKILLS[id].label, aim: SKILLS[id].aim, role: SKILLS[id].role })),
    actionsOf: u => u.spec.skills,
    allies: u => alive(sideOf(u)), enemies: u => alive(otherOf(u)),
    canUse: (u, id) => {
      const sk = SKILLS[id]; if (!sk) return false;
      if (sk.mp && u.mp < sk.mp) return 'needs ' + sk.mp + ' MP';
      if (sk.item) return u.items > 0 ? (u.mp < u.maxMp ? true : 'MP is full') : 'no Ether left';
      if (sk.every && (u.turns % sk.every) !== sk.every - 1) return 'charging';
      return true;
    },
    targets: (u, id) => reachFor(u, id),
    fields: { id: 'id', name: 'name', hp: 'hp', maxHp: 'maxHp', res: 'mp', maxRes: 'maxMp', tags: 'tags', cls: 'cls', key: 'key' },
    tags: ['flying', 'armoured', 'front row', 'back row'],
    turn: () => Math.max(1, W.round),
    rules: JSON.parse(JSON.stringify(START_RULES))
  }, extra);
}
const TR = GameDNA_TacticRules.create(adapters({
  bounds: { x: 0, y: 0, w: VW, h: VH }, getAnchor: anchorHD, uiRects: uiRectsHD, getObstacles: obstaclesHD, params: Object.assign({}, P),
  debug: e => { if (e.event === 'change') refreshUnits(); }
}));
// pixel strip: a crisp instance that mirrors every decision on a 256 x 144 field, and a crisp editor on 256 x 224
const PXK = 0.4;
const pxBox = u => { const b = oldBoxOf(u); return { x: Math.round(b.x * PXK), y: Math.round(b.y * PXK), w: Math.max(6, Math.round(b.w * PXK)), h: Math.max(8, Math.round(b.h * PXK)) }; };
const PX1 = GameDNA_TacticRules.create(adapters({ bounds: { x: 0, y: 0, w: 256, h: 144 }, getAnchor: pxBox, params: { render: 'crisp', whyMs: P.whyMs },
  uiRects: () => [{ x: 127, y: 127, w: 125, h: 15 }], getObstacles: () => alive(W.heroes.concat(W.foes)).map(u => Object.assign({ id: u.id }, pxBox(u))) }));
const PX2 = GameDNA_TacticRules.create(adapters({ bounds: { x: 0, y: 0, w: 256, h: 224 }, params: { render: 'crisp', maxRules: 6 } }));

/* ---------- turns ---------- */
function nextActor() {
  for (let guard = 0; guard < 20; guard++) {
    if (!W.queue.length) { W.round++; W.queue = alive(W.heroes.concat(W.foes)).sort((a, b) => b.spec.spd - a.spec.spd || (a.side === b.side ? 0 : a.side === 'hero' ? -1 : 1)); }
    const u = W.queue.shift(); if (u && u.hp > 0) return u;
  }
  return null;
}
function startTurn() {
  const u = nextActor(); if (!u) return;
  u.guard = false; u.act.pose(null); W.turnNo++;
  const d = TR.decide(u);
  PX1.showWhy(u, d);
  logDecision(u, d);
  W.cur = { u, d, t: 0, hit: false };
  animStart(W.cur);
  W.phase = 'act'; W.pt = 0;
}
function dmgOf(a, t, sk) {
  const v = hash(W.turnNo, t.ox | 0), base = sk.mag ? a.spec.mag * 2.2 : a.spec.atk * 2.0;
  let d = base * (sk.pow || 1) * (0.9 + 0.25 * v) - t.spec.def * (sk.mag ? 0.4 : 1);
  if (sk.vsFlying && t.tags.includes('flying')) d *= sk.vsFlying;
  if (sk.vsArmoured && t.tags.includes('armoured')) d *= sk.vsArmoured;
  if (t.guard) d *= 0.45;
  return Math.max(1, Math.round(d));
}
function resolve(c) {
  const { u, d } = c, sk = SKILLS[d.action]; if (!sk) return;
  if (sk.mp) u.mp -= sk.mp;
  if (sk.item) { u.items--; u.mp = Math.min(u.maxMp, u.mp + 14); num(u, '+14 MP', '#8fc8ff'); }
  if (d.action === 'guard') { u.guard = true; num(u, 'Guard', '#9fd8ff'); }
  for (const t of d.targetUnits) {
    if (sk.heal) { const h = Math.round(u.spec.mag * sk.heal * (0.92 + 0.16 * hash(W.turnNo, t.ox | 0))); t.hp = Math.min(t.maxHp, t.hp + h); t.flash = 10; num(t, '+' + h, '#7dffb0'); continue; }
    if (sk.aim === 'self') continue;
    const n = dmgOf(u, t, sk); t.hp = Math.max(0, t.hp - n); t.flash = 14; t.act.pose(null); t.act.play(t.hp <= 0 ? 'down' : 'hurt', t.hp <= 0 ? { dur: 560 } : undefined); num(t, String(n), sk.vsFlying && t.tags.includes('flying') || sk.vsArmoured && t.tags.includes('armoured') ? '#ffd257' : '#ffffff', true);
    if (t.hp <= 0) t.dieT = W.st;
  }
}
function num(u, text, col, big) { const b = boxOf(u); W.nums.push({ x: b.x + b.w / 2, y: b.y - 4, text, col, t: W.st, big: !!big }); }
function stepSim() {
  W.st += STEP; W.pt += STEP;
  for (const u of W.heroes.concat(W.foes)) { if (u.flash > 0) u.flash--; u.shownHp += (u.hp - u.shownHp) * 0.16; }
  W.nums = W.nums.filter(n => W.st - n.t < 1100);
  if (W.phase === 'intro') { if (W.pt > 1200) { W.banner = null; startTurn(); } return; }
  if (W.phase === 'clear') { if (W.pt > 1600) { W.banner = null; spawnWave((W.wave + 1) % WAVES.length); W.heroes.forEach(h => { h.hp = h.hp > 0 ? Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.35)) : Math.round(h.maxHp * 0.3); if (h.dieT >= 0) h.act.reset(); h.dieT = -1; h.mp = Math.min(h.maxMp, h.mp + 8); }); startTurn(); } return; }
  if (W.phase === 'lost') { if (W.pt > 1800) { const keep = TR.exportBook(); resetWorld(); TR.importBook(keep); W.banner = null; startTurn(); } return; }
  if (W.phase === 'act') {
    const c = W.cur; c.t += STEP; animStep(c);
    if (!c.hit && c.t >= 560) { c.hit = true; resolve(c); }
    if (c.t >= 1080) {
      c.u.turns++;
      if (!alive(W.foes).length) { W.phase = 'clear'; W.pt = 0; W.banner = { text: 'Wave cleared', sub: W.wave + 1 < WAVES.length ? 'The next wave rides in' : 'The arena falls quiet', t: W.st }; W.cur = null; return; }
      if (!alive(W.heroes).length) { W.phase = 'lost'; W.pt = 0; W.banner = { text: 'Defeat', sub: 'Edit the rules and try again', t: W.st }; W.cur = null; return; }
      startTurn();
    }
  }
}

/* ---------- the demo clock and the scripted edit ---------- */
const S = { wt: 0, lt: 0, si: 0 };
const EDIT_AT = 9500;
const EDIT_KEYS = [[600, 'down'], [950, 'down'], [1400, 'z'], [1800, 'right'], [2250, 'down'], [2800, 'left'], [3100, 'left'], [3400, 'left'], [3800, 'up'], [4150, 'up'], [4700, 'z'], [5100, 'down'], [5400, 'down'], [5700, 'down'], [6200, 'z']];
function resetAll() {
  resetWorld();
  TR.resetRules(); TR.importBook(JSON.parse(JSON.stringify(START_RULES))); TR.clearWhy(); PX1.clearWhy();
  if (TR.busy()) TR.closeEditor();
  S.lt = 0; S.si = 0; LOG.length = 0; logDirty = true; refreshUnits();
}
function stepWorld() {
  S.wt += STEP;
  if (SCRIPT) {
    S.lt += STEP;
    if (S.lt >= LOOP) resetAll();
    if (S.lt >= EDIT_AT && S.si === 0) { S.si = 1; TR.openEditor(W.heroes, { focus: W.heroes[1] }); }
    while (S.si >= 1 && S.si <= EDIT_KEYS.length && S.lt >= EDIT_AT + EDIT_KEYS[S.si - 1][0]) { if (TR.busy()) TR.key(EDIT_KEYS[S.si - 1][1]); S.si++; }
  }
  TR.update(STEP); PX1.update(STEP); PX2.update(STEP);
  if (!TR.busy()) { stepSim(); animAll(); }
}

/* ---------- drawing: scene (cast and backdrop from the shared demo kit, demo-kit/) ---------- */
function moveOf(u) {   // a melee dash: where the unit is on its way to the target and back
  const c = W.cur; if (!c || c.u !== u) return null;
  const sk = SKILLS[c.d.action]; if (!sk || !(sk.melee || c.d.action === 'claw')) return null;
  const tg = c.d.targetUnits[0]; if (!tg) return null;
  const t = c.t, k = t < 420 ? easeIO(t / 420) : t < 700 ? 1 : 1 - easeIO(clamp((t - 700) / 300, 0, 1));
  const air = t < 420 ? Math.sin(t / 420 * Math.PI) : t >= 700 && t < 1000 ? Math.sin((t - 700) / 300 * Math.PI) * 0.7 : 0;
  const dir = tg.hx > u.hx ? 1 : -1, gap = u.spec.fly ? 12 : tg.spec.bw / 2 + u.spec.bw / 2 + 16;
  return { k, air, tg, dx: (tg.hx - dir * gap - u.hx) * k, dy: (tg.hy - u.hy) * k };
}
function posOf(u) {   // feet centre on the ground (x, gy) and how far the feet are above it (lift)
  const m = moveOf(u), fly = u.spec.fly || 0;
  let lift = fly;
  if (m) lift = fly ? lerp(fly, 46, m.k) : m.air * (u.spec.hop || 26);
  return { x: u.hx + (m ? m.dx : 0), gy: u.hy + (m ? m.dy : 0), lift };
}
function boxOf(u) {
  const p = posOf(u), w = u.spec.bw, h = u.spec.bh;
  return { x: Math.round(p.x - w / 2), y: Math.round(p.gy - p.lift - (u.spec.hover || 0) - h), w, h };
}
/* the old code-drawn layout: the pixel strip below still uses it (its sprites are drawn to these boxes) */
function oldBoxOf(u) {
  const k = u.spec.kind, bob = k === 'harpy' ? Math.sin(W.st / 260 + u.ox) * 5 : 0;
  const w = k === 'golem' ? 62 : k === 'harpy' ? 56 : 34, h = k === 'golem' ? 74 : k === 'harpy' ? 46 : 58;
  let lx = 0; const c = W.cur;
  if (c && c.u === u) { const sk = SKILLS[c.d.action], t = c.d.targetUnits[0]; if (sk && (sk.melee || c.d.action === 'claw') && t) lx = (t.ox - u.ox) * 0.55 * (c.t < 420 ? easeIO(c.t / 420) : c.t < 700 ? 1 : 1 - easeIO((c.t - 700) / 300)); }
  return { x: Math.round(u.ox - w / 2 + lx), y: Math.round(u.oy - h + bob - (k === 'harpy' ? 30 : 0)), w, h };
}
/* cast animation, advanced in the fixed step so frozen frames equal live play */
function animStart(c) {
  const u = c.u, sk = SKILLS[c.d.action]; if (!sk) return;
  u.act.pose(null);
  if (sk.melee || c.d.action === 'claw') return;   // dashes are driven by animStep
  if (c.d.action === 'guard') u.act.play('guard', { dur: 1100 });
  else u.act.play(u.spec.kit === 'golem' ? 'attack' : 'cast', { dur: u.spec.kit === 'golem' ? 760 : 820 });
}
function animStep(c) {
  const u = c.u, a = u.act, t = c.t; if (!moveOf(u)) return;
  if (u.rig) {
    if (t < 420) a.pose('jump', t / 420);
    else if (t < 700) { if (c.an !== 1) { c.an = 1; a.pose(null); a.play('slash', { dur: 280 }); } }
    else if (t < 1000) a.pose('jump', 0.25 + 0.75 * (t - 700) / 300);
    else if (c.an !== 2) { c.an = 2; a.pose(null); }
  } else if (t >= 380 && !c.an) { c.an = 1; a.play('attack', { dur: 440 }); }
}
function animAll() {
  for (const u of W.heroes.concat(W.foes)) {
    if (u.rig && u.guard && u.hp > 0 && !(W.cur && W.cur.u === u)) u.act.pose('guard', 0.5);
    u.act.update(STEP, { facing: u.face });
  }
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function glow(g, x, y, r, col, a) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
function drawScene(g) {
  const t = S.wt;
  KIT.backdrop(g, SCENE, { x: 0, y: 0, w: VW, h: VH, groundY: GROUND, zoom: ZOOM });
  g.fillStyle = 'rgba(40,16,58,0.16)'; g.fillRect(0, 0, VW, VH);   // a touch later in the evening, so plates and numbers read
  // units, back to front
  const cast = W.heroes.concat(W.foes).map(u => ({ u, y: posOf(u).gy + (W.cur && W.cur.u === u ? 0.5 : 0) }))   // the acting unit in front of its target.sort((a, b) => a.y - b.y);
  for (const c of cast) drawUnit(g, c.u);
  for (const c of cast) drawBar(g, c.u);
  drawFx(g);
  // fireflies + vignette
  for (let i = 0; i < 22; i++) { const x = (hash(i, 31) * VW + t * (0.006 + hash(i, 32) * 0.01) * 10) % VW, y = 170 + hash(i, 33) * 170 + Math.sin(t / 900 + i) * 8; glow(g, x, y, 3.5, '255,232,170', 0.22 + 0.18 * Math.sin(t / 500 + i)); }
  const vg = g.createRadialGradient(VW / 2, VH * 0.55, VH * 0.34, VW / 2, VH * 0.55, VW * 0.72); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(14,6,26,0.55)'); g.fillStyle = vg; g.fillRect(0, 0, VW, VH);
}
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); const f = c => clamp(Math.round(c * k), 0, 255); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
function fadeOf(u) { return u.hp > 0 ? 1 : clamp(1 - (W.st - u.dieT - 420) / 480, 0, 1); }
function drawUnit(g, u) {
  const dead = u.hp <= 0, fade = fadeOf(u);
  if (dead && fade <= 0) return;
  const p = posOf(u), b = boxOf(u), cx = p.x, high = clamp((p.lift + (u.spec.hover || 0)) / 110, 0, 1);
  KIT.shadow(g, cx, p.gy + 1, u.spec.bw * (0.62 - 0.2 * high), 4.5 - 1.2 * high, (0.46 - 0.18 * high) * fade);
  if (W.cur && W.cur.u === u && !dead) {   // whose turn: a ring on the ground
    const col = u.side === 'hero' ? '150,205,255' : '255,130,110';
    g.save(); g.translate(cx, p.gy + 1); g.scale(1, 0.24); g.beginPath(); g.arc(0, 0, u.spec.bw * 0.72 + 6, 0, Math.PI * 2);
    g.fillStyle = `rgba(${col},0.14)`; g.fill(); g.restore();
    g.save(); g.beginPath(); g.ellipse(cx, p.gy + 1, u.spec.bw * 0.72 + 6, (u.spec.bw * 0.72 + 6) * 0.24, 0, 0, Math.PI * 2); g.strokeStyle = `rgba(${col},0.8)`; g.lineWidth = 1.4; g.stroke(); g.restore();
  }
  u.act.draw(g, cx, p.gy - p.lift, { h: u.spec.kh, facing: u.face, flash: u.flash > 12 ? 0.3 : 0, alpha: fade, shadow: false, swoosh: u.rig ? '255,244,220' : undefined });
  if (u.guard && !dead) {   // a held guard: a soft dome
    const gx = cx, gy = b.y + b.h * 0.52, r = b.h * 0.72;
    g.save(); g.translate(gx, gy); g.scale(0.74, 1);
    const dg = g.createRadialGradient(0, 0, r * 0.35, 0, 0, r); dg.addColorStop(0, 'rgba(150,210,255,0)'); dg.addColorStop(0.8, 'rgba(150,210,255,0.13)'); dg.addColorStop(0.94, 'rgba(205,236,255,0.6)'); dg.addColorStop(1, 'rgba(150,210,255,0)');
    g.fillStyle = dg; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.restore();
  }
}
function drawBar(g, u) {   // HP bar under the feet (under the talons for a flyer), never on a body
  if (u.hp <= 0 || u.spec.fly && moveOf(u)) return;   // a flyer's bar hides while it swoops (it would land on the target)
  const p = posOf(u), bw = clamp(u.spec.bw * 0.9, 34, 60), bx = Math.round(p.x - bw / 2), by = Math.round(u.spec.fly ? p.gy - p.lift - u.spec.hover + 7 : p.gy + 8);
  g.fillStyle = 'rgba(14,8,22,0.82)'; rr(g, bx - 1.5, by - 1.5, bw + 3, 7, 3.5); g.fill();
  const f = clamp(u.shownHp / u.maxHp, 0, 1), col = u.side === 'hero' ? (f < 0.3 ? '#ffb04a' : '#5ae08a') : '#ff6a5a';
  if (f > 0.01) { const hg = g.createLinearGradient(0, by, 0, by + 4); hg.addColorStop(0, col); hg.addColorStop(1, shade(col, 0.6)); g.fillStyle = hg; rr(g, bx, by, Math.max(3, bw * f), 4, 2); g.fill(); }
}
function originOf(u) {   // where a shot or a spell leaves the unit
  const p = posOf(u), o = u.act.point(u.spec.kit === 'mage' ? 'tip' : 'hand', p.x, p.gy - p.lift, { h: u.spec.kh, facing: u.face });
  return o && isFinite(o.x) && isFinite(o.y) ? o : { x: p.x, y: p.gy - u.spec.kh * 0.55 };
}
function drawFx(g) {
  const c = W.cur;
  if (c) {
    const sk = SKILLS[c.d.action] || {}, u = c.u, ub = boxOf(u), t = c.t, o = originOf(u), ux = o.x, uy = o.y, bx = ub.x + ub.w / 2, by = ub.y + ub.h * 0.5;
    for (const tg of c.d.targetUnits) {
      const b = boxOf(tg), tx = b.x + b.w / 2, ty = b.y + b.h * 0.5;
      const fly = clamp((t - 300) / 260, 0, 1);
      if ((sk.fx === 'arrow' || sk.fx === 'volley') && t > 300 && t < 600) {
        const at = f => [lerp(ux, tx, f), lerp(uy, ty, f) - Math.sin(f * Math.PI) * 26], [x, y] = at(fly), [x0, y0] = at(fly - 0.04), a = Math.atan2(y - y0, x - x0);
        g.save(); g.translate(x, y); g.rotate(a); g.lineCap = 'round';
        g.strokeStyle = 'rgba(30,14,20,0.75)'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(-17, 0); g.lineTo(0, 0); g.stroke();
        g.strokeStyle = sk.fx === 'volley' ? '#ffe7a8' : '#f6ead0'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(-17, 0); g.lineTo(0, 0); g.stroke();
        g.fillStyle = '#fff6dc'; g.beginPath(); g.moveTo(3.5, 0); g.lineTo(-3, -3); g.lineTo(-3, 3); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-17, 0); g.lineTo(-21, -3); g.moveTo(-17, 0); g.lineTo(-21, 3); g.stroke();
        g.restore(); glow(g, x, y, 9, '255,230,170', 0.4);
      }
      if ((sk.fx === 'smite' || sk.fx === 'bolt') && t > 260 && t < 600) {
        const x = lerp(ux, tx, fly), y = lerp(uy, ty, fly); const col = sk.fx === 'smite' ? '255,236,150' : '220,120,255';
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let i = 6; i >= 1; i--) glow(g, lerp(ux, tx, Math.max(0, fly - i * 0.045)), lerp(uy, ty, Math.max(0, fly - i * 0.045)), 11 - i, col, 0.3);
        glow(g, x, y, 20, col, 0.85); g.restore(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill();
      }
      if ((sk.fx === 'slash' || sk.fx === 'claw' || sk.fx === 'slam') && t > 480 && t < 760) {
        const k = (t - 480) / 280, dir = tx > bx ? 1 : -1, R = Math.min(34, b.h * 0.42) + k * 8, a0 = -1.25 + k * 0.5, a1 = 0.75 + k * 0.5;   // a tapered crescent, opening away from the attacker
        g.save(); g.translate(tx - dir * b.w * 0.22, ty); g.scale(dir, 1); g.globalAlpha = (1 - k) * 0.92;
        const cg = g.createLinearGradient(0, -R, 0, R); cg.addColorStop(0, 'rgba(255,255,255,0)'); cg.addColorStop(0.45, sk.fx === 'claw' ? '#ffd0de' : '#ffffff'); cg.addColorStop(1, 'rgba(255,255,255,0.15)');
        g.fillStyle = cg; g.beginPath(); g.arc(0, 0, R, a0, a1); g.arc(-R * 0.26 * (1 - k * 0.5), 0, R * 0.9, a1 - 0.12, a0 + 0.12, true); g.closePath(); g.fill(); g.restore(); g.save(); g.globalCompositeOperation = 'lighter'; glow(g, tx, ty, 34 * (1 - k) + 6, '255,236,210', 0.45 * (1 - k)); g.restore();
      }
      if (sk.fx === 'quake' && t > 420 && t < 900) { const k = (t - 420) / 480, tp = posOf(tg); g.strokeStyle = `rgba(255,214,150,${(0.9 * (1 - k)).toFixed(2)})`; g.lineWidth = 2.5; g.beginPath(); g.ellipse(tp.x, tp.gy + 1, 18 + k * 30, 4 + k * 7, 0, 0, Math.PI * 2); g.stroke(); }
      if ((sk.fx === 'mend' || sk.fx === 'prayer') && t > 400 && t < 1050) {
        const k = (t - 400) / 650; g.save(); g.globalCompositeOperation = 'lighter'; glow(g, tx, ty, 40, sk.fx === 'prayer' ? '255,226,140' : '130,255,180', 0.36 * (1 - k)); g.restore();
        for (let i = 0; i < 9; i++) { const ph = (k + i / 9) % 1, x = tx + Math.sin(i * 2.3) * b.w * 0.5, y = b.y + b.h - ph * b.h * 1.1; glow(g, x, y, 4.5, sk.fx === 'prayer' ? '255,236,170' : '160,255,205', 0.85 * (1 - ph)); }
      }
    }
    if ((sk.fx === 'guard' || sk.fx === 'ether') && t > 300 && t < 900) { const k = (t - 300) / 600; g.save(); g.globalCompositeOperation = 'lighter'; glow(g, bx, by, 40 * k + 10, sk.fx === 'ether' ? '140,190,255' : '170,220,255', 0.45 * (1 - k)); g.restore(); }
  }
  // damage numbers
  for (const n of W.nums) {
    const a = (W.st - n.t) / 1100, y = n.y - ease(Math.min(1, a * 2.2)) * 18, s = n.big ? 17 : 13;
    g.save(); g.globalAlpha = a > 0.75 ? (1 - a) / 0.25 : 1; g.font = `800 ${s}px ${UIFONT}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.lineWidth = 4; g.strokeStyle = 'rgba(16,6,20,0.9)'; g.lineJoin = 'round'; g.strokeText(n.text, n.x, y); g.fillStyle = n.col; g.fillText(n.text, n.x, y); g.restore();
  }
}
function drawHUD(g) {
  const tp = HUDR.top, hn = HUDR.hint, cd = HUDR.cards;
  g.fillStyle = 'rgba(16,12,26,0.78)'; rr(g, tp.x, tp.y, tp.w, tp.h, 13); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1; g.stroke();
  g.font = `800 11px ${UIFONT}`; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#ffc857'; g.fillText('WAVE ' + (W.wave + 1) + '/' + WAVES.length, tp.x + 12, tp.y + 13.5);
  g.fillStyle = '#b9b3cf'; g.font = `600 11px ${UIFONT}`; g.fillText('Round ' + Math.max(1, W.round) + '  ·  ' + alive(W.foes).length + ' foes', tp.x + 80, tp.y + 13.5);
  g.fillStyle = 'rgba(16,12,26,0.78)'; rr(g, hn.x, hn.y, hn.w, hn.h, 13); g.fill(); g.strokeStyle = 'rgba(255,200,87,0.4)'; g.stroke();
  g.fillStyle = '#ffc857'; rr(g, hn.x + 6, hn.y + 5, 16, 16, 4); g.fill(); g.fillStyle = '#1a1424'; g.font = `800 10px ${UIFONT}`; g.textAlign = 'center'; g.fillText('T', hn.x + 14, hn.y + 13.5);
  g.fillStyle = '#ece8f6'; g.textAlign = 'left'; g.font = `600 11px ${UIFONT}`; g.fillText('Edit tactics', hn.x + 30, hn.y + 13.5);
  // hero cards
  const cw = (cd.w - 8) / 3;
  W.heroes.forEach((h, i) => {
    const x = cd.x + i * (cw + 4), y = cd.y, active = W.cur && W.cur.u === h;
    g.fillStyle = active ? 'rgba(46,36,70,0.92)' : 'rgba(16,12,26,0.82)'; rr(g, x, y, cw, cd.h, 9); g.fill(); g.strokeStyle = active ? 'rgba(255,200,87,0.7)' : 'rgba(255,255,255,0.1)'; g.stroke();
    g.fillStyle = h.spec.col[0]; g.beginPath(); g.arc(x + 12, y + 12, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = h.hp > 0 ? '#ece8f6' : '#ff7a68'; g.font = `700 11px ${UIFONT}`; g.textAlign = 'left'; g.fillText(h.name, x + 21, y + 12.5);
    g.fillStyle = '#9a93b4'; g.font = `600 9.5px ${UIFONT}`; g.textAlign = 'right'; g.fillText(Math.max(0, Math.round(h.hp)) + '/' + h.maxHp, x + cw - 8, y + 12.5);
    const f = clamp(h.shownHp / h.maxHp, 0, 1); g.fillStyle = 'rgba(0,0,0,0.5)'; rr(g, x + 8, y + 21, cw - 16, 4, 2); g.fill(); g.fillStyle = f < 0.3 ? '#ffb04a' : '#5ae08a'; rr(g, x + 8, y + 21, (cw - 16) * f, 4, 2); g.fill();
    if (h.maxMp) { g.fillStyle = 'rgba(0,0,0,0.5)'; rr(g, x + 8, y + 28, cw - 16, 3, 1.5); g.fill(); g.fillStyle = '#6ab0ff'; rr(g, x + 8, y + 28, (cw - 16) * h.mp / h.maxMp, 3, 1.5); g.fill(); }
  });
  if (W.banner) {
    const a = clamp((W.st - W.banner.t) / 250, 0, 1);
    g.save(); g.globalAlpha = a; const bg = g.createLinearGradient(0, 128, 0, 198); bg.addColorStop(0, 'rgba(10,6,20,0)'); bg.addColorStop(0.3, 'rgba(10,6,20,0.7)'); bg.addColorStop(0.7, 'rgba(10,6,20,0.7)'); bg.addColorStop(1, 'rgba(10,6,20,0)'); g.fillStyle = bg; g.fillRect(0, 128, VW, 70);
    g.textAlign = 'center'; g.font = `800 26px ${UIFONT}`; g.fillStyle = W.phase === 'lost' ? '#ff7a68' : '#ffe08a'; g.fillText(W.banner.text, VW / 2, 156); g.font = `600 12px ${UIFONT}`; g.fillStyle = '#d8d0ea'; g.fillText(W.banner.sub, VW / 2, 180); g.restore();
  }
}

/* ---------- pixel strip ---------- */
function drawPixel(gg) {
  gg.setTransform(1, 0, 0, 1, 0, 0); gg.imageSmoothingEnabled = false;
  const sky = ['#1d1838', '#33284e', '#5a3458', '#94506a', '#d07e6a'];
  for (let y = 0; y < 88; y++) { gg.fillStyle = sky[Math.min(4, Math.floor(y / 18))]; gg.fillRect(0, y, 256, 1); }
  gg.fillStyle = '#ffe0b0'; gg.fillRect(126, 62, 12, 8); gg.fillRect(128, 60, 8, 12);
  gg.fillStyle = '#4a2a44'; for (let x = 0; x < 256; x += 2) { const h = 6 + Math.round(hash(x >> 4, 5) * 12); gg.fillRect(x, 86 - h, 2, h); }
  gg.fillStyle = '#4a3038'; gg.fillRect(0, 86, 256, 58); gg.fillStyle = '#3a262e'; for (let i = 0; i < 40; i++) gg.fillRect(Math.floor(hash(i, 7) * 256), 90 + Math.floor(hash(i, 8) * 50), 3, 1);
  const cast = W.heroes.concat(W.foes).slice().sort((a, b) => a.oy - b.oy);
  for (const u of cast) {
    if (u.hp <= 0 && W.st - u.dieT > 400) continue;
    const b = pxBox(u);
    pxSprite(gg, u, b);
    if (u.flash > 0 && u.flash % 4 < 2) { gg.globalCompositeOperation = 'lighter'; pxSprite(gg, u, b, '#ffffff'); gg.globalCompositeOperation = 'source-over'; }
    if (u.hp > 0) { gg.fillStyle = '#100810'; gg.fillRect(b.x + 1, u.oy * PXK + 3, b.w - 2, 3); gg.fillStyle = u.side === 'hero' ? '#5ae08a' : '#ff6a5a'; gg.fillRect(b.x + 2, u.oy * PXK + 4, Math.max(1, Math.round((b.w - 4) * u.hp / u.maxHp)), 1); }
  }
  gg.fillStyle = '#100c1a'; gg.fillRect(127, 127, 125, 15); gg.fillStyle = '#3a3352'; gg.fillRect(127, 127, 125, 1);
  W.heroes.forEach((h, i) => { const x = 130 + i * 41; gg.fillStyle = h.spec.col[0]; gg.fillRect(x, 131, 3, 3); gg.fillStyle = '#2a2440'; gg.fillRect(x + 5, 132, 32, 2); gg.fillStyle = h.hp / h.maxHp < 0.3 ? '#ffb04a' : '#5ae08a'; gg.fillRect(x + 5, 132, Math.round(32 * h.hp / h.maxHp), 2); });
  PX1.draw(gg);
}
/* pixel sprites for the strip: parts [x, y, w, h, colour] in a box, drawn with a 1 px ink outline pass, heroes facing left */
function pxParts(u, b) {
  const k = u.spec.kind, w = b.w, h = b.h, fr = Math.floor(W.st / 220) % 2, P = [];
  const add = (x, y, ww, hh, c) => P.push([x, y, ww, hh, c]);
  if (k === 'golem') {
    add(3, h - 7, 6, 7, '#4a4f5c'); add(w - 9, h - 7, 6, 7, '#4a4f5c');
    add(2, 9, w - 4, h - 16, '#7a8090'); add(2, 9, 3, h - 16, '#a8aebb'); add(w - 6, 9, 4, h - 16, '#4a4f5c');
    add(0, 10, 3, 11, '#6a707e'); add(w - 3, 10, 3, 11, '#6a707e');
    add((w >> 1) - 4, 2, 8, 7, '#8a909c'); add((w >> 1) - 3, 4, 2, 1, '#ffcf6a'); add((w >> 1) + 1, 4, 2, 1, '#ffcf6a');
    add((w >> 1) - 1, 15, 3, 3, fr ? '#ffd08a' : '#ff9a4a');
  } else if (k === 'harpy') {
    const wy = fr ? 2 : 6;
    add(0, wy, 7, 4, '#a84a6a'); add(w - 7, wy, 7, 4, '#a84a6a'); add(2, wy + 3, 4, 3, '#c86a8a'); add(w - 6, wy + 3, 4, 3, '#c86a8a');
    add((w >> 1) - 3, 5, 6, 9, '#e8a0b8'); add((w >> 1) - 3, 5, 2, 9, '#f6c8d6');
    add((w >> 1) - 2, 1, 5, 4, '#f6d8c0'); add((w >> 1) - 2, 0, 5, 2, '#4a1e3a'); add((w >> 1) - 4, 2, 2, 1, '#ffcf5a');
    add((w >> 1) - 2, 14, 1, 3, '#d8a050'); add((w >> 1) + 1, 14, 1, 3, '#d8a050');
  } else if (k === 'archer') {
    add((w >> 1) - 3, 0, 6, 5, '#efe8d8'); add((w >> 1) - 2, 2, 1, 1, '#1a0c18'); add((w >> 1) + 1, 2, 1, 1, '#1a0c18');
    add((w >> 1) - 3, 6, 6, 9, '#3a2a3a'); for (let i = 0; i < 4; i++) add((w >> 1) - 3, 7 + i * 2, 6, 1, '#e8e2d2');
    add((w >> 1) - 2, 15, 1, h - 15, '#e8e2d2'); add((w >> 1) + 1, 15, 1, h - 15, '#e8e2d2');
    add(0, 4, 1, 12, '#7a5a34'); add(1, 3, 1, 1, '#7a5a34'); add(1, 16, 1, 1, '#7a5a34');
  } else if (k === 'cultist') {
    add(2, 5, w - 4, h - 5, '#5a2a80'); add(2, 5, 2, h - 5, '#8a4ab8'); add((w >> 1) - 2, 1, 5, 5, '#5a2a80');
    add((w >> 1) - 1, 3, 3, 3, '#12081a'); add((w >> 1) - 1, 4, 1, 1, '#ff9ae8'); add((w >> 1) + 1, 4, 1, 1, '#ff9ae8');
    add(0, 0, 1, h, '#4a3a2a'); add(0, 0, 2, 2, fr ? '#f0c8ff' : '#c06aff');
  } else {
    const [c0, c1, c2] = u.spec.col, mx = w >> 1;
    add(mx - 3, 1, 6, 6, '#f2cfae'); add(mx - 3, 0, 6, 2, u.spec.hair); add(mx - 3, 1, 1, 3, u.spec.hair); add(mx - 2, 3, 1, 1, '#1b1320');
    if (u.spec.key === 'maren') { add(mx - 3, 0, 6, 2, '#b8c4d8'); }
    add(mx - 4, 7, 8, 10, c0); add(mx - 4, 7, 2, 10, c2); add(mx + 2, 7, 2, 10, c1); add(mx - 4, 12, 8, 1, '#4a3020');
    add(mx - 3, 17, 2, h - 17, '#2a1e28'); add(mx + 1, 17, 2, h - 17, '#2a1e28');
    if (u.spec.key === 'maren') { add(0, 5, 1, 9, '#e8eef8'); add(0, 13, 3, 1, '#8a6a3a'); add(w - 4, 9, 4, 6, '#5a6a8a'); add(w - 3, 11, 2, 2, '#ffc857'); }
    else if (u.spec.key === 'sel') { add(0, 6, 1, 9, '#8a5a2a'); add(1, 5, 1, 1, '#8a5a2a'); add(1, 15, 1, 1, '#8a5a2a'); }
    else { add(1, 0, 1, h, '#7a5a34'); add(0, 0, 3, 2, fr ? '#fff3c4' : '#ffd86a'); }
  }
  return P;
}
function pxSprite(gg, u, b, only) {
  const parts = pxParts(u, b), dead = u.hp <= 0;
  if (!only) { gg.fillStyle = 'rgba(16,6,16,0.5)'; gg.fillRect(b.x + 1, Math.round(u.oy * PXK) + 1, b.w - 2, 2); }
  if (!only) { gg.fillStyle = '#120a14'; for (const [x, y, w, h] of parts) gg.fillRect(b.x + x - 1, b.y + y - 1, w + 2, h + 2); }
  for (const [x, y, w, h, c] of parts) { gg.fillStyle = only || (dead ? '#5a5060' : c); gg.fillRect(b.x + x, b.y + y, w, h); }
}
function drawPixelEditor(gg) {
  gg.setTransform(1, 0, 0, 1, 0, 0); gg.imageSmoothingEnabled = false;
  for (let y = 0; y < 224; y += 8) for (let x = 0; x < 256; x += 8) { gg.fillStyle = ((x + y) >> 3) % 2 ? '#2a2236' : '#241d30'; gg.fillRect(x, y, 8, 8); }
  if (!PX2.busy()) openPX2();
  PX2.draw(gg);
}

/* ---------- decision log ---------- */
const LOG = []; let logDirty = true;
function logDecision(u, d) { LOG.unshift({ who: u.name, side: u.side, d, t: Math.round(S.lt) }); if (LOG.length > 9) LOG.pop(); logDirty = true; }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function renderLog() {
  if (!logDirty) return; logDirty = false;
  const ol = document.getElementById('log');
  ol.innerHTML = LOG.map(e => {
    const d = e.d, cls = d.kind === 'rule' ? '' : d.kind === 'otherwise' ? 'else' : d.kind === 'fallback' ? 'auto' : 'none';
    const chip = d.kind === 'rule' ? 'R' + (d.rule + 1) : d.kind === 'otherwise' ? 'ELSE' : d.kind === 'fallback' ? 'AUTO' : '–';
    const nice = t => esc(t).replace(/&lt;=/g, '\u2264').replace(/&gt;=/g, '\u2265');
    const what = `<b>${esc(e.who)}:</b> <b>${esc(d.label)}</b>${d.targetText ? ' \u2192 ' + esc(d.targetText) : ''}${d.kind === 'rule' ? ' <span style="color:#ffc857">\u00b7 ' + nice(d.ruleText) + '</span>' : ''}${d.reason ? ' <span style="color:#9a93b4">(' + nice(d.reason) + ')</span>' : ''}`;
    const tr = d.trace.filter(x => x.i >= 0 || x.state !== 'fired').map(x => `<span class="${x.state}">${x.i >= 0 ? 'R' + (x.i + 1) : 'Else'} ${x.state === 'fired' ? '✓' : x.state === 'off' ? 'off' : '✗'} ${nice(x.state === 'off' ? '' : x.note)}</span>`).join('');
    return `<li><span class="chip ${cls}">${chip}</span><span class="what">${what}</span>${tr ? `<span class="trace">${tr}</span>` : ''}</li>`;
  }).join('');
}

/* ---------- canvases + loop ---------- */
const cv = document.getElementById('game'), g = cv.getContext('2d');
const cvP = document.getElementById('px'), gP = cvP.getContext('2d'), cvP2 = document.getElementById('px2'), gP2 = cvP2.getContext('2d');
function fit() { const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, w = Math.max(VW, Math.round(r.width * dpr)); if (r.width > 0 && cv.width !== w) { cv.width = w; cv.height = Math.round(w * VH / VW); } }
function render() {
  fit();
  const k = cv.width / VW; g.setTransform(k, 0, 0, k, 0, 0);
  drawScene(g); drawHUD(g); TR.draw(g);
  if (PAUSED) { g.fillStyle = 'rgba(8,6,14,0.35)'; g.fillRect(0, 0, VW, VH); g.fillStyle = '#ece8f6'; g.font = `800 14px ${UIFONT}`; g.textAlign = 'center'; g.fillText('PAUSED', VW / 2, 24); }
  drawPixel(gP); drawPixelEditor(gP2);
  renderLog();
  document.documentElement.dataset.t = Math.round(S.wt);
}
function toLogical(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * VW / r.width, (e.clientY - r.top) * VH / r.height]; }
cv.addEventListener('pointerdown', e => { const [x, y] = toLogical(e); if (TR.busy()) { TR.pointer('down', x, y); e.preventDefault(); return; } if (x >= HUDR.hint.x && y <= HUDR.hint.y + HUDR.hint.h) openEditor(); });
cv.addEventListener('pointermove', e => { if (TR.busy()) { const [x, y] = toLogical(e); TR.pointer('move', x, y); } });
addEventListener('pointerup', e => { if (TR.busy()) { const [x, y] = toLogical(e); TR.pointer('up', x, y); } });
function openEditor() { if (!TR.busy()) { SCRIPT = false; syncTog(); TR.openEditor(W.heroes, { focus: W.cur && W.cur.u.side === 'hero' ? W.cur.u : W.heroes[0], onClose: () => refreshUnits() }); } }
addEventListener('keydown', e => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (TR.busy()) { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab', 'Enter', 'Escape'].includes(e.key)) e.preventDefault(); if (!e.repeat) TR.key(e.key); return; }
  if (e.key === 't' || e.key === 'T') { e.preventDefault(); openEditor(); }
  if (e.key === ' ') { e.preventDefault(); PAUSED = !PAUSED; syncTog(); }
});

/* ---------- controls ---------- */
function buildParams() {
  const box = document.getElementById('params'); box.innerHTML = '';
  for (const p of PARAMS) {
    const row = document.createElement('div'); row.className = 'row';
    if (p.type === 'range') {
      row.innerHTML = `<label for="p-${p.key}">${p.label}<output></output></label><input type="range" id="p-${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${P[p.key]}">`;
      const inp = row.querySelector('input'), out = row.querySelector('output');
      const show = () => { out.textContent = p.key === 'size' && +inp.value === 0 ? 'auto' : inp.value + (p.unit ? ' ' + p.unit : ''); inp.style.setProperty('--fill', ((inp.value - p.min) / (p.max - p.min) * 100) + '%'); };
      inp.addEventListener('input', () => { P[p.key] = +inp.value; apply(); show(); }); show();
    } else {
      row.innerHTML = `<label>${p.label}</label><div class="seg" role="radiogroup">${p.options.map(o => `<button type="button" role="radio" data-v="${o}" aria-checked="${o === P[p.key]}">${o}</button>`).join('')}</div>`;
      row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { P[p.key] = b.dataset.v; row.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); apply(); }));
    }
    box.appendChild(row);
  }
}
function apply() { TR.setParams(P); PX1.setParams({ whyMs: P.whyMs, theme: P.theme, why: P.why }); PX2.setParams({ theme: P.theme }); }
function refreshUnits() {
  const box = document.getElementById('units'); if (!box) return;
  const presets = TR.presets();
  box.innerHTML = W.heroes.map(h => { const set = TR.rulesFor(h); return `<div class="unit"><span><b>${esc(h.name)}</b><small>${esc(h.cls)} · ${set.rules.length} rules${set.preset ? '' : ' · custom'}</small></span><select data-u="${h.key}" aria-label="Preset for ${esc(h.name)}"><option value="">${set.preset ? 'Preset' : 'Custom'}</option>${presets.map(p => `<option value="${p.id}"${set.preset === p.id ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select></div>`; }).join('');
  box.querySelectorAll('select').forEach(s => s.addEventListener('change', () => { const h = W.heroes.find(x => x.key === s.dataset.u); if (h && s.value) { TR.applyPreset(h, s.value); SCRIPT = false; syncTog(); refreshUnits(); } }));
}
function syncTog() {
  const sb = document.getElementById('script'); sb.setAttribute('aria-pressed', SCRIPT); sb.textContent = SCRIPT ? 'Script: on' : 'Script: off';
  const pb = document.getElementById('pause'); pb.setAttribute('aria-pressed', PAUSED); pb.textContent = PAUSED ? 'Resume' : 'Pause';
  const sl = document.getElementById('slow'); sl.setAttribute('aria-pressed', SLOW); sl.textContent = SLOW ? 'Speed: ½' : 'Speed: 1×';
}
document.getElementById('edit').addEventListener('click', openEditor);
document.getElementById('pause').addEventListener('click', () => { PAUSED = !PAUSED; syncTog(); });
document.getElementById('script').addEventListener('click', () => { SCRIPT = !SCRIPT; syncTog(); });
document.getElementById('slow').addEventListener('click', () => { SLOW = !SLOW; syncTog(); });
document.getElementById('restart').addEventListener('click', () => { resetAll(); S.wt = 0; });

function openPX2() { PX2.openEditor(W.heroes, { focus: W.heroes[2] }); PX2.key('down'); PX2.key('z'); PX2.key('right'); for (let i = 0; i < 12; i++) PX2.update(STEP); }
buildParams(); resetWorld(); refreshUnits(); syncTog(); openPX2();
if (qs.get('editor') === '1') { SCRIPT = false; syncTog(); TR.openEditor(W.heroes, { focus: W.heroes[+qs.get('unit') || 0] }); }
KIT.ready(() => {   // the cast's art is decoded: fast-forward, then the frozen paint or the live loop
  for (let n = Math.floor(T0 / STEP); n > 0; n--) stepWorld();
  refreshUnits();
  if (FREEZE) { render(); document.documentElement.dataset.frozen = '1'; }
  else {
    let last = performance.now(), acc = 0;
    const loop = now => { acc += Math.min(250, now - last) * (SLOW ? 0.5 : 1); last = now; if (!PAUSED) while (acc >= STEP) { stepWorld(); acc -= STEP; } else acc = 0; render(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
});
window.__tactics = { W, S, TR, PX1, PX2, P, LOG };
/* text state for critics and tools/sprites/statecheck.py (640x360 stage px; feet, lunges included). Heroes stand on the right and face left, foes on
   the left face right; target = the enemy unit it is acting on this turn, else the mean x of the living units of the other side. u.face is the
   value update() and draw() get. The pixel strip below the stage repeats the same battle with code-drawn sprites (not listed). */
window.__state = () => ({ t: Math.round(W.st), actors: W.heroes.concat(W.foes).map(u => { const p = posOf(u), foes = alive(otherOf(u)), c = W.cur;
  const tg = c && c.u === u && c.d && c.d.targetUnits && c.d.targetUnits[0], aim = tg && tg.side !== u.side && tg.hp > 0 ? tg.id : null;
  return Object.assign({ id: u.id, x: Math.round(p.x), y: Math.round(p.gy - p.lift), facing: u.face > 0 ? 'right' : 'left',
    target: aim || (foes.length ? Math.round(foes.reduce((n, f) => n + f.hx, 0) / foes.length) : null), asset: u.spec.kit }, u.hp <= 0 ? { noFace: 'dead (fading or gone)' } : null); }) });
