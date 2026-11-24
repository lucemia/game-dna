/* ===== C-11 demo: drives module/damage-pop.js (and, in the comparison strip, E-01 module/damage-numbers.js) ===== */
'use strict';
const VW = 640, VH = 360, STEP = 1000 / 60, LOOP = 6200, HUD_Y = 300, SMALL = 0.4;
const qs = new URLSearchParams(location.search);
const PARAMS = [
  { key: 'size', label: 'Number size (0 = auto)', type: 'range', min: 0, max: 24, step: 1, default: 0, unit: 'px' },
  { key: 'duration', label: 'Duration', type: 'range', min: 600, max: 2400, step: 50, default: 1100, unit: 'ms' },
  { key: 'arc', label: 'Arc', type: 'range', min: 0, max: 2, step: 0.1, default: 1, unit: '×' },
  { key: 'punch', label: 'Punch (overshoot)', type: 'range', min: 0, max: 1.2, step: 0.05, default: 0.6, unit: '' },
  { key: 'merge', label: 'Merge window', type: 'range', min: 0, max: 1500, step: 50, default: 600, unit: 'ms' },
  { key: 'hitstop', label: 'Hit-stop', type: 'range', min: 0, max: 120, step: 10, default: 50, unit: 'ms' },
  { key: 'palette', label: 'Palette', type: 'select', options: ['vivid', 'soft', 'mono'], default: 'vivid' },
  { key: 'icons', label: 'Type icons', type: 'select', options: ['on', 'off'], default: 'on' },
  { key: 'crit', label: 'Critical style', type: 'select', options: ['burst', 'flash', 'plain'], default: 'burst' },
  { key: 'render', label: 'Render', type: 'select', options: ['auto', 'smooth', 'crisp'], default: 'auto' },
  { key: 'stack', label: 'Avoidance', type: 'select', options: ['on', 'off'], default: 'on' }
];
const P = {};
PARAMS.forEach(p => { P[p.key] = p.default; if (qs.has(p.key)) { const v = qs.get(p.key); P[p.key] = p.type === 'range' ? clamp(+v, p.min, p.max) : p.options.includes(v) ? v : p.default; } });
const FREEZE = qs.has('t') && qs.get('freeze') === '1', T0 = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : 0;
let AUTO = qs.get('auto') !== '0', SLOW = qs.get('slow') === '1';
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
const lerp = (a, b, u) => a + (b - a) * u, easeOut = u => 1 - (1 - clamp(u, 0, 1)) ** 3, easeInOut = u => (u = clamp(u, 0, 1), u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
function hash(a, b) { let h = Math.imul((a | 0) * 374761393 + (b | 0) * 668265263, 3266489917); h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

/* ---------- actors (logical 640x360 px; x = feet centre, y = feet) ---------- */
const KIT = GameDNA_DemoKit, GROUND = 252;   // shared HD demo cast + backdrop (demo-kit/); `kit` = the cast id, `kh` = drawn height
const ACTORS = [
  { id: 'knight', name: 'Rowan', side: 'a', kind: 'knight', kit: 'sword', kh: 84, hx: 176, hy: 240, w: 40, h: 80, hp: 420 },
  { id: 'mage', name: 'Mira', side: 'a', kind: 'mage', kit: 'mage', kh: 84, hx: 92, hy: 278, w: 38, h: 80, hp: 300 },
  { id: 'golem', name: 'Golem', side: 'b', kind: 'golem', kit: 'golem', kh: 118, hx: 470, hy: 246, w: 104, h: 112, hp: 1600 },
  { id: 'wisp', name: 'Wisp', side: 'b', kind: 'wisp', kit: 'wisp', kh: 44, hx: 582, hy: 190, w: 30, h: 44, hover: 40, hp: 900 },
  { id: 'imp', name: 'Imp', side: 'b', kind: 'imp', kit: 'imp', kh: 54, hx: 368, hy: 288, w: 44, h: 50, hp: 900 }
];
ACTORS.forEach(a => { a.act = KIT.actor(a.kit, { h: a.kh }); a.face = a.side === 'a' ? 1 : -1; });
ACTORS.forEach(a => { a.x = a.hx; a.y = a.hy; a.maxHp = a.hp; a.flash = -1e9; a.pose = 0; });
const A = id => ACTORS.find(a => a.id === id);
const actorBox = (a, home) => { const x = home ? a.hx : a.x, y = home ? a.hy : a.y, lift = (a.hover || 0); return { x: x - a.w / 2, y: y - a.h - lift, w: a.w, h: a.h, cx: x, top: y - a.h - lift }; };

/* ---------- world ---------- */
const S = { wt: 0, rt: 0, stop: 0, acts: [], fx: [], banner: '', bannerUntil: 0, shake: { t: -1e9, px: 0, ms: 0 }, flash: { t: -1e9, a: 0, ms: 0 }, loopAt: 0, si: 0, log: [] };
const SCRIPT = [
  [200, 'knight', 'golem', 'slash', 'Cleave', [['damage', 34, 'physical']]],
  [700, 'mage', 'imp', 'barrage', 'Arcane Barrage', [['damage', 12, 'arcane'], ['damage', 35, 'arcane'], ['damage', 36, 'arcane'], ['damage', 18, 'arcane'], ['damage', 26, 'arcane']]],
  [1000, 'imp', 'knight', 'claw', '', [['block']]],
  [1560, 'knight', 'wisp', 'throw', 'Piercing Spear', [['crit', 412, 'physical']]],
  [2050, 'wisp', 'mage', 'touch', '', [['dodge']]],
  [2250, 'mage', 'golem', 'fireball', 'Fireball', [['damage', 86, 'fire']]],
  [2700, 'golem', 'knight', 'slam', 'Rock Slam', [['shield', 18, 'shield'], ['damage', 30, 'physical']]],
  [3150, 'mage', 'knight', 'mend', 'Mend', [['heal', 62, 'heal']]],
  [3350, 'imp', 'golem', 'venom', 'Venom Cloud', [['damage', 6, 'poison'], ['damage', 6, 'poison'], ['damage', 6, 'poison'], ['damage', 6, 'poison']]],
  [3700, 'mage', 'imp', 'chain', 'Chain Spark', [['damage', 22, 'shock']], ['wisp', 19], ['golem', 25]],
  [4450, 'knight', 'imp', 'slash', 'Ember Blade', [['crit', 188, 'fire']]],
  [4900, 'wisp', 'mage', 'drain', 'Mana Leech', [['mp', 14, 'mana']]],
  [5050, 'imp', 'knight', 'hex', 'Hex', [['status', 'SLOW']]],
  [5350, 'mage', 'wisp', 'frost', 'Frost Shard', [['damage', 44, 'ice']]]
];
const TIMING = { slash: { imp: 230, gap: 0 }, throw: { imp: 320 }, claw: { imp: 260 }, touch: { imp: 260 }, slam: { imp: 330 }, barrage: { imp: 320, gap: 120 }, fireball: { imp: 360 }, frost: { imp: 340 },
  chain: { imp: 330 }, mend: { imp: 330 }, venom: { imp: 300, gap: 200 }, drain: { imp: 330 }, hex: { imp: 330 } };
const MELEE = { slash: 1, claw: 1, touch: 1 };

/* ---------- the three module instances: HD (main), and the strip's E-01 and C-11 at 256x144 ---------- */
const UI = () => {
  const r = [{ x: 0, y: HUD_Y, w: VW, h: VH - HUD_Y }];
  if (S.banner && S.wt < S.bannerUntil) r.push(bannerBox());
  return r;
};
function obstaclesHD() {
  const o = [];
  for (const a of ACTORS) for (const home of [false, true]) { const b = actorBox(a, home); o.push({ x: b.x, y: b.y, w: b.w, h: b.h, id: a.id }); }
  for (const a of ACTORS) if (a.side === 'b') { const b = actorBox(a, true); o.push({ x: b.cx - 26, y: b.top - 12, w: 52, h: 7, id: a.id }); }   // enemy HP bars sit above the head
  return o.concat(UI());
}
const anchorHD = id => { const a = A(id); if (!a) return null; const b = actorBox(a, MELEE[busyType(a)] ? true : false); return { x: b.cx, top: a.side === 'b' ? b.top - 12 : b.top, w: b.w, h: b.h }; };
const scaleR = (r, k) => r && { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k, id: r.id, soft: r.soft };
function busyType(a) { const x = S.acts.find(q => q.a === a && q.l < q.end); return x ? x.type : null; }
const DP = GameDNA_DamagePop.create({
  bounds: { x: 0, y: 0, w: VW, h: HUD_Y }, params: P,
  debug: qs.get('debug') === '1' ? e => (window.__dpLog = window.__dpLog || []).push(JSON.parse(JSON.stringify(Object.assign({ wt: Math.round(S.wt) }, e)))) : null,
  getAnchor: anchorHD, getObstacles: obstaclesHD,
  onHitStop: ms => { S.stop = Math.max(S.stop, ms); },
  onShake: (px, ms) => { S.shake = { t: S.rt, px: px * 1.5, ms }; },
  onFlash: (al, ms) => { S.flash = { t: S.rt, a: al, ms }; }
});
const small = (id) => { const a = anchorHD(id); return a && { x: a.x * SMALL, top: a.top * SMALL, w: a.w * SMALL, h: a.h * SMALL }; };
const smallObs = () => obstaclesHD().map(r => scaleR(r, SMALL));
const DN = qs.get('strip') === '0' ? { spawn() {}, update() {}, draw() {} } : GameDNA_DamageNumbers.create({ skin: false, bounds: { x: 0, y: 0, w: 256, h: HUD_Y * SMALL }, params: { hitstop: 0 }, getAnchor: small, getObstacles: smallObs });
const STRIP = qs.get('strip') !== '0';
const NOOP = { spawn() {}, update() {}, draw() {}, setParams() {} };
const DPs = !STRIP ? NOOP : GameDNA_DamagePop.create({ bounds: { x: 0, y: 0, w: 256, h: HUD_Y * SMALL }, params: Object.assign({}, P, { size: 0, render: 'crisp', hitstop: 0 }), getAnchor: small, getObstacles: smallObs });
const RETRO_KIND = { damage: 'damage', crit: 'crit', heal: 'heal', mp: 'mp', shield: 'damage', status: 'status', block: 'miss', dodge: 'miss', miss: 'miss' };
function hit(target, kind, amount, type) {
  const t = A(target);
  const isNum = typeof amount === 'number';
  if (isNum && kind !== 'heal' && kind !== 'mp' && kind !== 'shield') { t.hp = Math.max(1, t.hp - amount); t.flash = S.wt; t.act.play('hurt'); }
  else if (kind === 'block' || kind === 'shield') t.act.play('guard', { dur: 420 });
  if (kind === 'heal') t.hp = Math.min(t.maxHp, t.hp + amount);
  DP.spawn(target, amount, kind, { type });
  DPs.spawn(target, amount, kind, { type });
  DN.spawn(target, kind === 'status' ? amount : amount || 0, RETRO_KIND[kind] || 'damage');
  S.fx.push({ kind: 'spark', type: kind === 'crit' ? 'crit' : type || 'physical', x: actorBox(t).cx, y: actorBox(t).top + t.h * 0.45, t0: S.wt, big: kind === 'crit' });
  S.log.push(S.wt);
}

/* ---------- actions ---------- */
function startAct(who, tgt, type, name, hits, extra) {
  const a = A(who), tm = TIMING[type];
  const act = { a, t: A(tgt), type, l: 0, hits: hits.map((h, i) => ({ dt: tm.imp + i * (tm.gap || 0), h, done: false })), extra: extra || [] };
  act.extra.forEach(([id, n], i) => act.hits.push({ dt: tm.imp + 90 * (i + 1), h: ['damage', n, 'shock'], tg: id, done: false }));   // chain lightning jumps on
  act.last = Math.max(...act.hits.map(h => h.dt)); act.end = act.last + (MELEE[type] ? 300 : 260);
  S.acts.push(act);
  a.act.play(MELEE[type] ? (a.kit === 'sword' ? 'slash' : 'attack') : 'cast', { dur: MELEE[type] ? Math.max(420, tm.imp * 2.4) : Math.max(560, act.last + 240) });
  if (name) { S.banner = name; S.bannerUntil = S.wt + Math.max(800, act.last + 260); }
}
function tickActs(dt) {
  for (const act of S.acts) {
    act.l += dt; const { a, t } = act, l = act.l;
    if (MELEE[act.type]) {
      const tb = actorBox(t, true), side = a.hx < t.hx ? -1 : 1, tx = t.hx + side * (t.w / 2 + a.w / 2 + 6), ty = t.hy + (t.kind === 'wisp' ? 40 : a.kind === 'wisp' ? -10 : 2);   // strikes up at the floating wisp from below
      const go = easeOut(l / 200), back = easeInOut((l - act.last - 90) / 200);
      a.x = lerp(lerp(a.hx, tx, go), a.hx, back); a.y = lerp(lerp(a.hy, ty, go), a.hy, back); a.pose = l > 150 && l < act.last + 90 ? 1 : 0;
    } else a.pose = l < act.last + 60 ? 2 : 0;
    for (const h of act.hits) if (!h.done && l >= h.dt) { h.done = true; hit(h.tg || t.id, h.h[0], h.h[1], h.h[2]); }
    if (l >= act.end) { a.x = a.hx; a.y = a.hy; a.pose = 0; }
  }
  S.acts = S.acts.filter(x => x.l < x.end);
}
function stepWorld() {
  S.rt += STEP;
  if (S.stop > 0) { S.stop -= STEP; DP.update(0); DPs.update(0); DN.update(0); return; }
  S.wt += STEP;
  if (AUTO) {
    const lt = S.wt - S.loopAt;
    while (S.si < SCRIPT.length && lt >= SCRIPT[S.si][0]) { const s = SCRIPT[S.si++]; startAct(s[1], s[2], s[3], s[4], s[5], s.slice(6)); }
    if (lt >= LOOP) { S.loopAt = S.wt; S.si = 0; ACTORS.forEach(a => { a.hp = a.maxHp; }); }
  }
  tickActs(STEP);
  for (const a of ACTORS) a.act.update(STEP, { facing: a.face });
  S.fx = S.fx.filter(f => S.wt - f.t0 < 600);
  DP.update(STEP); DPs.update(STEP); DN.update(STEP);
}

/* ---------- drawing: the HD arena (also drawn at 0.4 into the 256x144 strip canvases) ---------- */
function bannerBox() { const w = Math.max(150, S.banner.length * 9 + 60); return { x: VW / 2 - w / 2, y: 14, w, h: 30 }; }
function drawScene(g, k, hd) {
  const t = S.wt;
  g.save(); g.scale(k, k);
  // painted backdrop (demo kit), a warm pool of light from the brazier
  KIT.backdrop(g, 'ruins-night', { x: 0, y: 0, w: VW, h: HUD_Y, groundY: GROUND });
  g.fillStyle = 'rgba(18,10,40,0.22)'; g.fillRect(0, 0, VW, VH);
  const pool = g.createRadialGradient(286, 262, 10, 286, 262, 230); pool.addColorStop(0, 'rgba(255,170,90,0.22)'); pool.addColorStop(1, 'rgba(255,140,80,0)'); g.fillStyle = pool; g.fillRect(0, 150, VW, 210);
  // actors, back to front
  const row = ACTORS.map(a => ({ y: a.y, d: () => drawActor(g, a, t) })); row.push({ y: 226, d: () => { KIT.sprite(g, 'brazier', 286, 226, { h: 50 }); KIT.flame(g, 286, 190, 44, t); } });
  row.sort((p, q) => p.y - q.y).forEach(r => r.d());
  // effects
  for (const f of S.fx) spark(g, f, t);
  for (const act of S.acts) projectile(g, act);
  // dust motes
  for (let i = 0; i < 30; i++) { const ph = (t * 0.00004 * (1 + hash(i, 9)) + hash(i, 7)) % 1, x = (hash(i, 8) * VW + t * 0.006 * (hash(i, 2) - 0.5) * 3 + VW) % VW, y = 300 - ph * 200; g.fillStyle = `rgba(255,214,160,${(0.35 * Math.sin(ph * Math.PI)).toFixed(3)})`; g.beginPath(); g.arc(x, y, 1.2, 0, Math.PI * 2); g.fill(); }
  // vignette
  const vg = g.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VW * 0.65); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(4,2,12,0.55)'); g.fillStyle = vg; g.fillRect(0, 0, VW, VH);
  g.restore();
}
function shadow(g, x, y, rx, ry, a) { const sg = g.createRadialGradient(x, y, 0, x, y, rx); sg.addColorStop(0, `rgba(0,0,0,${a})`); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sg; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
function drawActor(g, a, t) {
  const white = t - a.flash < 90;
  a.act.draw(g, a.x, a.y, { h: a.kh, facing: a.face, flash: white ? 0.85 : 0 });
  if (a.side === 'b') {   // HP bar above the head
    const hb = actorBox(a, true), w = 52, x = hb.cx - w / 2, y = hb.top - 12;
    g.fillStyle = 'rgba(8,6,16,0.75)'; rr(g, x - 1, y - 1, w + 2, 7, 3.5);
    g.fillStyle = '#e2484f'; rr(g, x, y, Math.max(2, w * a.hp / a.maxHp), 5, 2.5); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x + 2, y, Math.max(0, w * a.hp / a.maxHp - 4), 1.5);
  }
}
function rr(g, x, y, w, h, r, stroke) { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); if (stroke) g.stroke(); }
const FXC = { physical: ['#ffffff', '#c8d4ff'], fire: ['#fff0a0', '#ff6a2a'], ice: ['#ffffff', '#6fd6ff'], shock: ['#fffbd0', '#ffd92e'], poison: ['#e0ffb0', '#6fcf3f'], arcane: ['#ffffff', '#b06cff'], heal: ['#eaffef', '#34d96f'], shield: ['#ffffff', '#9fb4d8'], mana: ['#e0f0ff', '#4b9dff'], crit: ['#fff6c8', '#ffab1c'] };
function spark(g, f, t) {
  const u = (t - f.t0) / (f.big ? 420 : 300); if (u >= 1) return; const C = FXC[f.type] || FXC.physical, n = f.big ? 12 : 7;
  g.save(); g.globalCompositeOperation = 'lighter';
  const rg = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, (f.big ? 40 : 22) * (0.4 + u)); rg.addColorStop(0, C[0]); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = (1 - u) * 0.7; g.fillStyle = rg; g.beginPath(); g.arc(f.x, f.y, (f.big ? 40 : 22) * (0.4 + u), 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1 - u; g.strokeStyle = C[1]; g.lineWidth = f.big ? 2.5 : 1.8; g.lineCap = 'round';
  for (let i = 0; i < n; i++) { const an = hash(f.t0 | 0, i) * Math.PI * 2, r0 = 6 + u * 18, r1 = r0 + (1 - u) * (f.big ? 18 : 10); g.beginPath(); g.moveTo(f.x + Math.cos(an) * r0, f.y + Math.sin(an) * r0); g.lineTo(f.x + Math.cos(an) * r1, f.y + Math.sin(an) * r1); g.stroke(); }
  g.restore();
}
function projectile(g, act) {
  const kinds = { throw: ['#ffffff', '#ffd27a', 5], fireball: ['#fff0a0', '#ff6a2a', 9], frost: ['#ffffff', '#6fd6ff', 7], barrage: ['#ffffff', '#b06cff', 5], chain: ['#fffbd0', '#ffd92e', 4], venom: ['#e0ffb0', '#6fcf3f', 6], drain: ['#e0f0ff', '#4b9dff', 5], mend: ['#eaffef', '#34d96f', 6], hex: ['#f0d8ff', '#b06cff', 5] };
  const k = kinds[act.type]; if (!k) return;
  const from = actorBox(act.a), to = actorBox(act.t);
  for (const h of act.hits) {
    const st = h.dt - 260, u = (act.l - st) / 260; if (u < 0 || u > 1 || h.tg) continue;
    const x = lerp(from.cx + 14 * (act.a.side === 'a' ? 1 : -1), to.cx, u), y = lerp(from.top + 10, to.top + act.t.h * 0.45, u) - Math.sin(u * Math.PI) * 30;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 4; i >= 0; i--) { const uu = Math.max(0, u - i * 0.04), xx = lerp(from.cx, to.cx, uu), yy = lerp(from.top + 10, to.top + act.t.h * 0.45, uu) - Math.sin(uu * Math.PI) * 30; g.globalAlpha = 0.18 * (5 - i) / 5; g.fillStyle = k[1]; g.beginPath(); g.arc(xx, yy, k[2] * (1 - i * 0.12), 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1; const pg = g.createRadialGradient(x, y, 0, x, y, k[2] * 1.6); pg.addColorStop(0, k[0]); pg.addColorStop(0.5, k[1]); pg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = pg; g.beginPath(); g.arc(x, y, k[2] * 1.6, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  if (act.type === 'chain') {   // lightning arcs to the chained targets
    const pts = [act.t, ...act.extra.map(e => A(e[0]))]; g.save(); g.strokeStyle = '#fff6a0'; g.lineWidth = 2; g.shadowColor = '#ffd92e'; g.shadowBlur = 8;
    for (let i = 1; i < pts.length; i++) { const hh = act.hits.find(q => q.tg === pts[i].id); if (!hh || act.l < hh.dt - 40 || act.l > hh.dt + 160) continue; const p0 = actorBox(pts[i - 1]), p1 = actorBox(pts[i]); g.beginPath(); g.moveTo(p0.cx, p0.top + 20); for (let s = 1; s < 6; s++) g.lineTo(lerp(p0.cx, p1.cx, s / 6) + (hash(s, act.l / 50 | 0) - 0.5) * 16, lerp(p0.top + 20, p1.top + 20, s / 6) + (hash(s + 9, act.l / 50 | 0) - 0.5) * 16); g.lineTo(p1.cx, p1.top + 20); g.stroke(); }
    g.restore();
  }
}
function drawHUD(g, k) {
  g.save(); g.scale(k, k);
  if (S.banner && S.wt < S.bannerUntil) {
    const b = bannerBox(), al = clamp((S.bannerUntil - S.wt) / 200, 0, 1);
    g.globalAlpha = al; g.fillStyle = 'rgba(14,10,26,0.82)'; rr(g, b.x, b.y, b.w, b.h, 15); g.strokeStyle = 'rgba(242,195,90,0.65)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#ffe9b0'; g.font = '700 15px ' + UIFONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(S.banner, VW / 2, b.y + b.h / 2 + 1); g.globalAlpha = 1;
  }
  const pg = g.createLinearGradient(0, HUD_Y, 0, VH); pg.addColorStop(0, 'rgba(18,14,32,0.92)'); pg.addColorStop(1, 'rgba(10,8,20,0.96)'); g.fillStyle = pg; g.fillRect(0, HUD_Y, VW, VH - HUD_Y);
  g.fillStyle = 'rgba(242,195,90,0.5)'; g.fillRect(0, HUD_Y, VW, 1);
  ACTORS.filter(a => a.side === 'a').forEach((a, i) => {
    const x = 20 + i * 210, y = HUD_Y + 14;
    g.fillStyle = '#ece8f6'; g.font = '700 14px ' + UIFONT; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(a.name, x, y);
    g.fillStyle = '#9a93b4'; g.font = '600 12px ' + UIFONT; g.textAlign = 'right'; g.fillText(Math.round(a.hp) + ' / ' + a.maxHp, x + 180, y + 2);
    g.fillStyle = '#231d36'; rr(g, x, y + 22, 180, 9, 4.5); const hg = g.createLinearGradient(0, y + 22, 0, y + 31); hg.addColorStop(0, '#7af0a0'); hg.addColorStop(1, '#2fb866'); g.fillStyle = hg; rr(g, x, y + 22, 180 * a.hp / a.maxHp, 9, 4.5);
  });
  g.fillStyle = '#9a93b4'; g.font = '600 12px ' + UIFONT; g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText('Turn ' + (1 + Math.floor((S.wt - 0) / LOOP)), VW - 20, HUD_Y + 16);
  g.restore();
}
const UIFONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/* ---------- canvases ---------- */
const cv = document.getElementById('game'), g = cv.getContext('2d');
const cvR = document.getElementById('retro'), gR = cvR.getContext('2d'), cvM = document.getElementById('modern'), gM = cvM.getContext('2d');
function fit() { const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, w = Math.max(VW, Math.round(r.width * dpr)); if (cv.width !== w) { cv.width = w; cv.height = Math.round(w * VH / VW); } }
function render() {
  fit();
  const k = cv.width / VW, sh = shakeOffset();
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#0b0912'; g.fillRect(0, 0, cv.width, cv.height);
  g.setTransform(k, 0, 0, k, sh[0] * k, sh[1] * k);
  drawScene(g, 1, true);
  DP.draw(g);
  g.setTransform(k, 0, 0, k, 0, 0);
  const fa = flashAlpha(); if (fa > 0) { g.fillStyle = `rgba(255,250,235,${fa})`; g.fillRect(0, 0, VW, HUD_Y); }
  drawHUD(g, 1);
  // the strip: the same frame at 256x144, native pixels
  if (!STRIP) document.querySelector('.cmp').hidden = true;
  else for (const [cc, gg, mod] of [[cvR, gR, DN], [cvM, gM, DPs]]) {
    gg.setTransform(1, 0, 0, 1, 0, 0); gg.imageSmoothingEnabled = false; gg.clearRect(0, 0, 256, 144);
    drawScene(gg, SMALL, false); mod.draw(gg); drawHUD(gg, SMALL);
  }
  document.documentElement.dataset.t = Math.round(S.wt);
}
function shakeOffset() { const a = S.rt - S.shake.t; if (a < 0 || a > S.shake.ms) return [0, 0]; const d = 1 - a / S.shake.ms, f = Math.floor(a / 33); return [(hash(f, 1) * 2 - 1) * S.shake.px * d, (hash(f, 2) * 2 - 1) * S.shake.px * d]; }
function flashAlpha() { const a = S.rt - S.flash.t; return a < 0 || a > S.flash.ms ? 0 : S.flash.a * (1 - a / S.flash.ms); }

/* ---------- controls ---------- */
function buildParams() {
  const box = document.getElementById('params'); box.innerHTML = '';
  for (const p of PARAMS) {
    const row = document.createElement('div'); row.className = 'row';
    if (p.type === 'range') {
      row.innerHTML = `<label for="p-${p.key}">${p.label}<output id="o-${p.key}"></output></label><input type="range" id="p-${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${P[p.key]}">`;
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
function buildControls() {
  buildParams();
  document.querySelectorAll('[data-fire]').forEach(b => b.addEventListener('click', () => manual(b.dataset.fire)));
  const tgt = document.getElementById('target');
  tgt.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { tgt.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); }));
  document.getElementById('auto').addEventListener('click', e => { AUTO = !AUTO; e.target.setAttribute('aria-pressed', AUTO); e.target.textContent = AUTO ? 'Script: on' : 'Script: off'; });
  document.getElementById('slow').addEventListener('click', e => { SLOW = !SLOW; e.target.setAttribute('aria-pressed', SLOW); e.target.textContent = SLOW ? 'Speed: ¼' : 'Speed: 1×'; });
  document.getElementById('reset').addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); buildParams(); apply(); });
}
function apply() { DP.setParams(P); DPs.setParams(Object.assign({}, P, { size: 0, render: 'crisp', hitstop: 0 })); }
function curTarget() { const b = document.querySelector('#target [aria-checked=true]'); return b ? b.dataset.v : 'golem'; }
function manual(what) {
  const tg = curTarget(), hero = A(tg).side === 'b' ? 'knight' : 'imp';
  const M = {
    hit: ['slash', 'Strike', [['damage', 20 + Math.round(hash(S.wt | 0, 1) * 30), 'physical']]],
    flurry: ['barrage', 'Flurry', [12, 35, 36, 18, 26].map(n => ['damage', n, 'arcane'])],
    crit: ['slash', 'Critical!', [['crit', 300 + Math.round(hash(S.wt | 0, 2) * 200), 'physical']]],
    fire: ['fireball', 'Fireball', [['damage', 70 + Math.round(hash(S.wt | 0, 3) * 30), 'fire']]],
    ice: ['frost', 'Frost Shard', [['damage', 44, 'ice']]],
    shock: ['chain', 'Spark', [['damage', 22, 'shock']]],
    poison: ['venom', 'Venom', [6, 6, 6, 6].map(n => ['damage', n, 'poison'])],
    heal: ['mend', 'Mend', [['heal', 62, 'heal']]],
    shield: ['claw', '', [['shield', 18, 'shield']]],
    miss: ['claw', '', [['miss']]],
    block: ['claw', '', [['block']]],
    mana: ['drain', 'Mana Leech', [['mp', 14, 'mana']]]
  }[what];
  if (!M) return;
  const who = what === 'heal' ? 'mage' : M[0] === 'claw' ? (A(tg).side === 'a' ? 'imp' : 'knight') : A(tg).side === 'a' ? 'imp' : (what === 'hit' || what === 'crit' ? 'knight' : 'mage');
  if (who === tg) return startAct('mage', tg, M[0], M[1], M[2]);
  startAct(who, tg, M[0], M[1], M[2]);
}

/* ---------- loop ---------- */
KIT.ready(() => {
buildControls();
if (FREEZE) {
  for (let n = Math.floor(T0 / STEP); n > 0; n--) stepWorld();
  render(); document.documentElement.dataset.frozen = '1';
} else {
  for (let n = Math.floor(T0 / STEP); n > 0; n--) stepWorld();
  let last = performance.now(), acc = 0;
  const loop = now => { acc += Math.min(250, now - last) * (SLOW ? 0.25 : 1); last = now; while (acc >= STEP) { stepWorld(); acc -= STEP; } render(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  addEventListener('keydown', e => { const k = { '1': 'hit', '2': 'flurry', '3': 'crit', '4': 'fire', '5': 'ice', '6': 'heal', '7': 'miss', '8': 'poison' }[e.key]; if (k) manual(k); });
}
});
window.__dp = { S, DP, DPs, DN, P };
/* text state for critics and tools/sprites/statecheck.py: who stands where, which way each is drawn, who it fights */
window.__state = () => ({ t: Math.round(S.wt), actors: ACTORS.map(a => { const foes = ACTORS.filter(b => b.side !== a.side);
  return { id: a.id, x: Math.round(a.x), y: Math.round(a.y), facing: a.face > 0 ? 'right' : 'left', target: Math.round(foes.reduce((s, b) => s + b.x, 0) / foes.length), asset: a.kit }; }) });
