/* ===================== A-01 Active-time gauge battle: demo ===================== */
(function () {
'use strict';
var Q = new URLSearchParams(location.search);
var FPS = 60, FRAME_MS = 1000 / FPS;

/* ---------- parameters (defaults = element.json) ---------- */
var DEF = { speed: 1, mode: 'active', party: 4, spd1: 32, spd2: 24, spd3: 44, spd4: 28, res: '256x224', status: 'none', enemyGauge: 'on', control: 'auto', seed: 3 };
var VARIANTS = {
  'Active (default)': {},
  'Wait mode': { mode: 'wait' },
  'Hasted party': { status: 'haste' },
  'Slowed party': { status: 'slow' },
  'Fast battle (x2)': { speed: 2 },
  'Handheld 240x160': { res: '240x160' },
  'Solo hero': { party: 1, spd1: 50 }
};
var P = {};
Object.keys(DEF).forEach(function (k) {
  var q = Q.get(k), d = DEF[k];
  P[k] = q == null ? d : typeof d === 'number' ? (isFinite(+q) ? +q : d) : q;
});
P.speed = RK.clamp(P.speed, 0.5, 2); P.party = RK.clamp(Math.round(P.party), 1, 4);
if (P.res !== '240x160') P.res = '256x224';
if (P.mode !== 'wait') P.mode = 'active';
if (['none', 'haste', 'slow'].indexOf(P.status) < 0) P.status = 'none';
for (var si = 1; si <= 4; si++) P['spd' + si] = RK.clamp(Math.round(P['spd' + si]), 10, 60);
var freeze = Q.get('freeze') === '1', startMs = +(Q.get('t') || 0);
if (Q.get('t') != null && Q.get('control') == null) P.control = 'auto';

/* ---------- gauges, clock, queues: all in module/active-time-battle.js (GameDNA_ATB) ---------- */
var ATB = null;
function secondsToFill(spd, st) { return ATB ? ATB.ticksToFull(spd, st === 'none' ? null : st) / FPS : 0; }

/* ---------- content (original) ---------- */
var HEROES = [
  { id: 'rowan', name: 'Rowan', cls: 'knight', tint: '#3a64c8', hair: 3, hp: 460, atk: 92, mag: 20 },
  { id: 'mira', name: 'Mira', cls: 'mage', tint: '#8a44c4', hair: 0, hp: 330, atk: 40, mag: 88 },
  { id: 'bram', name: 'Bram', cls: 'rogue', tint: '#2f8a6a', hair: 1, hp: 380, atk: 74, mag: 30 },
  { id: 'ilsa', name: 'Ilsa', cls: 'mage', tint: '#c8603a', hair: 2, hp: 350, atk: 44, mag: 70 }
];
var WAVES = [
  [{ id: 'troll', name: 'Moss Troll', type: 'brute', tint: '#7c9a48', pos: [0.25, 0.93], hp: 1100, spd: 18, atk: 70 },
   { id: 'imp', name: 'Thorn Imp', type: 'imp', tint: '#c4483c', pos: [0.45, 0.66], hp: 380, spd: 38, atk: 42 },
   { id: 'bat', name: 'Dusk Bat', type: 'bat', tint: '#8a5ad0', pos: [0.165, 0.5], hp: 300, spd: 46, atk: 34 }],
  [{ id: 'sent', name: 'Ruin Warden', type: 'sentinel', tint: '#9a8a6a', pos: [0.24, 0.92], hp: 1000, spd: 20, atk: 64 },
   { id: 'hex', name: 'Hex Goblin', type: 'gshaman', tint: '#4aa890', pos: [0.44, 0.66], hp: 420, spd: 30, atk: 46, magic: true },
   { id: 'wisp', name: 'Bog Wisp', type: 'slime', tint: '#5ab4d0', pos: [0.14, 0.6], hp: 340, spd: 34, atk: 36 }]
];
var CMDS = ['Attack', 'Magic', 'Item', 'Defend'];
var SPELLS = [
  { id: 'flame', name: 'Flame', mp: 4, kind: 'dmg', pow: 1.5, elem: 'fire', side: 'enemy' },
  { id: 'frost', name: 'Frost', mp: 5, kind: 'dmg', pow: 1.7, elem: 'ice', side: 'enemy' },
  { id: 'mend', name: 'Mend', mp: 5, kind: 'heal', pow: 2.2, elem: 'heal', side: 'party' },
  { id: 'quick', name: 'Quicken', mp: 8, kind: 'haste', side: 'party' }
];
var ITEMS = [
  { id: 'tonic', name: 'Tonic', n: 4, heal: 160 },
  { id: 'elixir', name: 'Elixir', n: 1, heal: 9999 }
];
var DUR = { attack: [54, 30], magic: [76, 50], item: [50, 28], monAttack: [50, 30], monMagic: [70, 46] };   // [length, hit frame]

/* ---------- layout per resolution ---------- */
var L;
function layout() {
  var snes = P.res === '256x224';
  L = snes ? { W: 256, H: 224, FH: 150, row: 16, pad: 8, lw: 90, gh: 6 } : { W: 240, H: 160, FH: 112, row: 10, pad: 5, lw: 80, gh: 5 };
}

/* ---------- battle state ---------- */
var T = 0, B, fx, pops, hitAt, deadAt, banner, parts, juice, ai, menu, keys, POS;
function newActor(o, side, i) {
  var a = { id: o.id, name: o.name, side: side, slot: i, look: o, maxhp: o.hp, hp: o.hp, spd: o.spd, atk: o.atk, mag: o.mag || 0,
    defending: false, mp: 40, dead: false };
  return a;
}
function reset(keepWave) {
  layout();
  var wave = keepWave && B ? B.wave : (B ? (B.wave + 1) % WAVES.length : 0);
  B = { vf: 0, wave: wave, party: [], mons: [], anim: null, result: null, endAt: null, items: ITEMS.map(function (it) { return it.n; }) };
  for (var i = 0; i < P.party; i++) { var h = HEROES[i]; B.party.push(newActor({ id: h.id, name: h.name, hp: h.hp, atk: h.atk, mag: h.mag, spd: P['spd' + (i + 1)], cls: h.cls, tint: h.tint, hair: h.hair }, 'party', i)); }
  WAVES[wave].forEach(function (m, j) { B.mons.push(newActor(m, 'enemy', j)); });
  B.all = B.party.concat(B.mons);
  POS = {};
  var n = B.party.length;
  B.party.forEach(function (c, i) {
    var f = n === 1 ? 0.5 : i / (n - 1), yf = n === 1 ? 0.74 : 0.45 + f * 0.48;
    POS[c.id] = { x: Math.round(L.W * 0.8 + (f - 0.5) * (L.W === 256 ? 45 : 58) * (n === 1 ? 0 : (n - 1) / 3)), y: Math.round(L.FH * yf) };
  });
  B.mons.forEach(function (m) { POS[m.id] = { x: Math.round(L.W * m.look.pos[0]), y: Math.round(L.FH * m.look.pos[1]) }; });
  fx = []; pops = []; hitAt = {}; deadAt = {}; banner = null; menu = null; keys = [];
  parts = RK.createParticles(11 + wave); juice = RK.createJuice(); ai = RK.rng(P.seed * 131 + wave);
  ATB = GameDNA_ATB.create({
    mode: P.mode, speed: P.speed, partyStatus: P.status, seed: P.seed * 977 + wave * 31 + 1,
    combatants: B.all.map(function (a) { return { id: a.id, side: a.side, speed: a.spd }; }),
    isAlive: function (id) { return !byId(id).dead; },
    onHeroReady: function (id) { byId(id).defending = false; openMenu(id); },
    onMenuCancel: function () { menu = null; },
    chooseEnemyAction: function (id) {
      var m = byId(id), foes = living('party'); if (!foes.length) return null;
      return { cmd: m.look.magic && ai() < 0.5 ? 'monMagic' : 'monAttack', target: foes[Math.floor(ai() * foes.length)].id };
    },
    performAction: startAction,
    onBattleEnd: function () { menu = null; }
  });
  if (scr) scr.resize(L.W, L.H);
  try { document.getElementById('stage').style.setProperty('--ar', L.W + ' / ' + L.H); } catch (e) { }
}
function applyPartyStatus() {
  if (!ATB) return;
  ATB.set({ mode: P.mode, speed: P.speed, partyStatus: P.status });
  B.party.forEach(function (c, i) { c.spd = P['spd' + (i + 1)]; ATB.setSpeed(c.id, c.spd); });
}
var isParty = function (a) { return a.side === 'party'; };
var living = function (side) { return (side === 'party' ? B.party : B.mons).filter(function (a) { return !a.dead; }); };
function byId(id) { for (var i = 0; i < B.all.length; i++) if (B.all[i].id === id) return B.all[i]; return null; }

/* ---------- one 60 Hz tick: menu input always runs; the action plays even while a menu is open ---------- */
function step() {
  if (!B.result) {
    if (menu) menuStep();
    if (B.anim) animStep();
    ATB.update();
  }
  B.vf++; T++;                           // visual frame always advances (idle, ambient, menus)
  if (B.result && B.vf - B.endAt > 330) reset(B.result === 'lose');
  parts.step();
}
// GameDNA_ATB.performAction: play one action, call done() when it ends
function startAction(act, done) {
  var a = byId(act.actor), tg = byId(act.target), d = DUR[act.cmd];
  B.anim = { act: act, f0: B.vf, n: d[0], hit: d[1], done: false, onDone: done };
  if (act.cmd === 'magic') banner = { f0: B.vf, n: d[0], txt: spellOf(act).name };
  if (act.cmd === 'item') banner = { f0: B.vf, n: d[0], txt: ITEMS[act.item].name };
  if (act.cmd === 'monMagic') banner = { f0: B.vf, n: d[0], txt: 'Hex Bolt' };
  stageFx(a, tg, act);
}
function spellOf(act) { return SPELLS[act.spell]; }
function animStep() {
  var an = B.anim, t = B.vf - an.f0;
  if (!an.done && t >= an.hit) { an.done = true; resolve(an.act); }
  if (t >= an.n) { B.anim = null; checkEnd(); an.onDone(); }
}
function vary() { return 0.875 + ai() * 0.25; }
function resolve(act) {
  var a = byId(act.actor), t = byId(act.target), f = B.vf;
  if (!t) return;
  if (act.cmd === 'attack' || act.cmd === 'monAttack' || act.cmd === 'monMagic' || (act.cmd === 'magic' && spellOf(act).kind === 'dmg')) {
    if (t.dead) return;
    var base = act.cmd === 'magic' ? a.mag * spellOf(act).pow : act.cmd === 'monMagic' ? a.atk * 1.3 : a.atk;
    var crit = act.cmd === 'attack' && ai() < 0.08, dmg = Math.round(base * vary() * (crit ? 2 : 1) * (t.defending ? 0.5 : 1));
    t.hp = Math.max(0, t.hp - dmg); hitAt[t.id] = f;
    var c = center(t);
    pops.push({ f0: f, kind: 'num', str: String(dmg), x: c.x, y: Math.max(12, c.top - 6), col: crit ? '#fff07a' : '#f4f6ff', col2: crit ? '#ffb030' : isParty(t) ? '#f0a8b0' : '#a8bcf0', t: t.id });
    var big = crit || dmg >= 150 || a.look.type === 'brute';
    juice.shake(f, big ? 10 : 6, big ? 2 : 1);
    if (act.cmd === 'attack') { fxAt(f, 13, function (g, q) { RK.fxBurst(g, c.x - 2, c.y - 1, q, big, 5); }); parts.emit('spark', c.x, c.y, 6); }
    if (act.cmd === 'magic' || act.cmd === 'monMagic') { juice.flash(f, 8, 0.2); parts.emit('ember', c.x, c.y, 5); }
    if (t.hp <= 0) kill(t);
  } else if (act.cmd === 'magic' && spellOf(act).kind === 'heal' || act.cmd === 'item') {
    var amt = act.cmd === 'item' ? ITEMS[act.item].heal : Math.round(a.mag * spellOf(act).pow * vary());
    if (t.dead) return;
    amt = Math.min(amt, t.maxhp - t.hp); t.hp += amt;
    var c2 = center(t);
    pops.push({ f0: f, kind: 'num', str: String(amt), x: c2.x, y: Math.max(12, c2.top - 6), col: '#9cffb8', col2: '#3ac070', t: t.id });
    parts.emit('heal', c2.x, c2.y + 4, 8);
  } else if (act.cmd === 'magic' && spellOf(act).kind === 'haste') {
    if (t.dead) return;
    ATB.setStatus(t.id, 'haste', 20);
    var c3 = center(t);
    pops.push({ f0: f, kind: 'txt', str: 'Haste', x: c3.x, y: Math.max(12, c3.top - 6), col: '#d8ff8a', t: t.id });
  }
  if (act.cmd === 'magic') a.mp = Math.max(0, a.mp - spellOf(act).mp);
}
function kill(t) {
  t.dead = true; deadAt[t.id] = B.vf + 6;     // the module sees isAlive() turn false on its next update
  if (!isParty(t)) { var c = center(t); parts.emit('dust', c.x, POS[t.id].y - 2, 8); }
}
function checkEnd() {
  if (B.result) return;
  if (!living('enemy').length) { B.result = 'win'; B.endAt = B.vf; menu = null; }
  else if (!living('party').length) { B.result = 'lose'; B.endAt = B.vf; menu = null; }
}

/* ---------- effects staged from the action (timed from its hit frame) ---------- */
function fxAt(f0, n, draw, under) { fx.push({ f0: f0, n: n, draw: draw, under: under }); }
function stageFx(a, t, act) {
  var hit = B.vf + B.anim.hit, c = center(t), p = POS[a.id];
  if (act.cmd === 'attack') fxAt(hit - 7, 10, function (g, q) { RK.fxCrescent(g, c.x, c.y, q, 14); });
  else if (act.cmd === 'monAttack') {
    if (a.look.type === 'bat' || a.look.type === 'imp') fxAt(hit - 8, 18, function (g, q) { RK.fxClaw(g, c.x, c.y, q); });
    else { fxAt(hit - 6, 12, function (g, q) { RK.fxSlash(g, c.x, c.y, q, 11, true); }); fxAt(hit, 10, function (g, q) { RK.fxImpact(g, c.x, c.y, q); }); }
  } else if (act.cmd === 'monMagic') {
    fxAt(B.vf + 8, B.anim.hit - 8, function (g, q) { RK.fxGlyph(g, p.x, p.y, q, '#7affc8'); }, true);
    fxAt(hit - 16, 30, function (g, q) { RK.ELEM.bolt(g, c.x, c.y, q, 3); });
  } else if (act.cmd === 'magic') {
    var sp = spellOf(act), col = sp.kind === 'heal' ? '#9cffb8' : sp.kind === 'haste' ? '#e8ff8a' : '#ffa040';
    fxAt(B.vf + 8, B.anim.hit - 8, function (g, q) { RK.fxGlyph(g, p.x, p.y, q, col); }, true);
    if (sp.elem) fxAt(hit - 16, 30, function (g, q) { RK.ELEM[sp.elem](g, c.x, c.y, q, 3); });
    else fxAt(hit - 14, 26, function (g, q) { RK.fxGlyph(g, c.x, POS[t.id].y, q, '#e8ff8a'); });
  } else if (act.cmd === 'item') fxAt(hit - 10, 24, function (g, q) { RK.ELEM.heal(g, c.x, c.y, q, 2); });
}

/* ---------- command menu: auto player (human-like pacing) or keyboard ---------- */
function autoPlan(c) {
  var foes = living('enemy'), allies = living('party');
  var hurt = allies.filter(function (a) { return a.hp < a.maxhp * 0.45; }).sort(function (a, b) { return a.hp / a.maxhp - b.hp / b.maxhp; });
  var pick = function (arr) { return arr[Math.floor(ai() * arr.length)]; };
  if (!foes.length) return { cmd: 3 };
  if (c.look.cls === 'mage') {
    if (hurt.length && c.mp >= 5) return { cmd: 1, sub: 2, target: hurt[0].id };
    if (c.id === 'ilsa' && ai() < 0.3) { var slowest = allies.filter(function (a) { return ATB.get(a.id).status !== 'haste'; })[0]; if (slowest && c.mp >= 8) return { cmd: 1, sub: 3, target: slowest.id }; }
    if (c.mp >= 5) return { cmd: 1, sub: ai() < 0.5 ? 0 : 1, target: pick(foes).id };
  }
  if (hurt.length && B.items[0] > 0 && ai() < 0.5) return { cmd: 2, sub: 0, target: hurt[0].id };
  if (ai() < 0.08) return { cmd: 3 };
  return { cmd: 0, target: pick(foes).id };
}
function openMenu(id) { menu = { id: id, f0: B.vf, stage: 'cmd', cmd: 0, sub: 0, tgt: null, plan: P.control === 'auto' ? autoPlan(byId(id)) : null }; }
function menuStep() {
  if (byId(menu.id).dead || !living('enemy').length) { menu = null; return; }
  if (P.control === 'auto') autoStep(); else keyStep();
}
// the auto player moves the cursor like a person: ~170 ms per row, pauses on sub menus and targets
function autoStep() {
  if (!menu.plan) menu.plan = autoPlan(byId(menu.id));
  var t = (B.vf - menu.f0) * FRAME_MS, pl = menu.plan, row = 120, t0 = 260;
  var tCmd = t0 + pl.cmd * row, tSub = tCmd + (pl.sub != null ? 220 + pl.sub * row : 0), tTgt = tSub + (pl.target ? 400 : 0);
  if (t < t0) { menu.cmd = 0; return; }
  if (t < tCmd) { menu.cmd = Math.min(pl.cmd, Math.floor((t - t0) / row) + 1); return; }
  menu.cmd = pl.cmd;
  if (pl.sub != null && t < tSub) { menu.stage = 'sub'; menu.sub = Math.min(pl.sub, Math.max(0, Math.floor((t - tCmd - 220) / row) + 1)); return; }
  if (pl.target && t < tTgt) { menu.stage = 'target'; menu.sub = pl.sub || 0; menu.tgt = pl.target; return; }
  commit(pl.cmd, pl.sub, pl.target);
}
function commit(cmd, sub, target) {
  var c = byId(menu.id);
  if (cmd === 3) { c.defending = true; ATB.submit(c.id, { defend: true }); pops.push({ f0: B.vf, kind: 'txt', str: 'Guard', x: POS[c.id].x, y: center(c).top - 6, col: '#90e2ff', t: c.id }); }
  else {
    var act = { target: target };
    if (cmd === 0) act.cmd = 'attack';
    else if (cmd === 1) { act.cmd = 'magic'; act.spell = sub; }
    else { act.cmd = 'item'; act.item = sub; B.items[sub] = Math.max(0, B.items[sub] - 1); }
    menu = null; ATB.submit(c.id, act); return;
  }
  menu = null;
}
// keyboard: arrows move, Z / Enter / Space confirm, X / Esc back. Taps are latched so a 0 ms press still counts.
function keyStep() {
  while (keys.length) {
    var k = keys.shift(), c = byId(menu.id);
    if (menu.stage === 'cmd') {
      if (k === 'up') menu.cmd = (menu.cmd + 3) % 4; else if (k === 'down') menu.cmd = (menu.cmd + 1) % 4;
      else if (k === 'ok') {
        if (menu.cmd === 3) { commit(3); return; }
        if (menu.cmd === 0) { menu.stage = 'target'; menu.tside = 'enemy'; menu.tgt = living('enemy')[0].id; }
        else { menu.stage = 'sub'; menu.sub = 0; }
      }
    } else if (menu.stage === 'sub') {
      var nlist = menu.cmd === 1 ? SPELLS.length : ITEMS.length;
      if (k === 'up') menu.sub = (menu.sub + nlist - 1) % nlist; else if (k === 'down') menu.sub = (menu.sub + 1) % nlist;
      else if (k === 'back') menu.stage = 'cmd';
      else if (k === 'ok') {
        if (menu.cmd === 1 && c.mp < SPELLS[menu.sub].mp) continue;
        if (menu.cmd === 2 && B.items[menu.sub] <= 0) continue;
        var toParty = menu.cmd === 2 || SPELLS[menu.sub].side === 'party';
        menu.tside = toParty ? 'party' : 'enemy'; menu.tgt = (toParty ? c : living('enemy')[0]).id; menu.stage = 'target';
      }
    } else if (menu.stage === 'target') {
      var list = living(menu.tside), i = Math.max(0, list.map(function (a) { return a.id; }).indexOf(menu.tgt));
      if (k === 'up' || k === 'left') menu.tgt = list[(i + list.length - 1) % list.length].id;
      else if (k === 'down' || k === 'right') menu.tgt = list[(i + 1) % list.length].id;
      else if (k === 'back') menu.stage = menu.cmd === 0 ? 'cmd' : 'sub';
      else if (k === 'ok') { commit(menu.cmd, menu.sub, menu.tgt); return; }
    }
  }
}

/* ---------- drawing ---------- */
function spriteOf(c, pose) { var l = c.look; return isParty(c) ? RK.heroSprite(l.cls, l.tint, l.hair, pose, RUIN_RIM) : RK.monSprite(l.type, l.tint, pose, RUIN_RIM); }
function center(c) {
  var p = POS[c.id], s = isParty(c) ? spriteOf(c, 'idle0') : spriteOf(c, { f: 0, atk: 0, hurt: false });
  var fly = isParty(c) ? 0 : (RK.MON[c.look.type].fly || 0);
  return { x: p.x, y: Math.round(p.y - fly - (s.ay - s.top) * 0.5), top: p.y - fly - (s.ay - s.top), left: p.x - s.ax + 2, w: s.w };
}
function bodyBox(c, x, y, spr) {
  var top = Math.round(y - spr.ay + spr.top);
  return isParty(c) ? { left: x - 11, right: x + 11, top: top } : { left: Math.round(x - spr.ax + 2), right: Math.round(x - spr.ax + spr.w - 2), top: top };
}
function poseOf(c) {
  var vf = B.vf, an = B.anim && B.anim.act.actor === c.id ? B.anim : null, p = POS[c.id], dir = isParty(c) ? -1 : 1;
  var hurt = hitAt[c.id] != null && vf - hitAt[c.id] < 24 && !an;
  var white = hitAt[c.id] != null && (vf - hitAt[c.id] < 3 || (vf - hitAt[c.id] < 9 && Math.floor(vf / 2) % 2));
  var x = p.x, y = p.y, pose, walking = false, tS = vf / FPS;
  if (isParty(c)) {
    pose = Math.floor(tS * (c.slot % 2 ? 1.6 : 2.3) + c.slot * 0.5) % 2 ? 'idle1' : 'idle0';
    var cs = ATB.get(c.id).state;
    if (cs === 'ready' || cs === 'queued' || c.defending) pose = 'ready';
    if (B.result === 'win' && !c.dead) pose = Math.floor((vf - B.endAt) / 16) % 2 ? 'wind' : 'ready';
    if (an) {
      var q = (vf - an.f0) / an.n, hq = an.hit / an.n, cmd = an.act.cmd, mag = cmd === 'magic', fwd = mag ? 8 : cmd === 'item' ? 6 : 22;
      if (q < 0.22) { x += dir * Math.round(fwd * q / 0.22); walking = fwd > 8; }
      else if (q < 0.78) { x += dir * fwd; pose = mag ? 'cast' : cmd === 'item' ? 'ready' : (q < hq - 0.06 ? 'wind' : 'strike'); }
      else { x += dir * Math.round(fwd * (1 - (q - 0.78) / 0.22)); walking = fwd > 8; }
      if (walking) pose = Math.floor(vf / 5) % 2 ? 'walkA' : 'walkB';
    } else if (hurt) pose = 'hurt';
    if (hurt && vf - hitAt[c.id] < 6) x += 2;
    return { spr: spriteOf(c, pose), x: x, y: y, white: white, walking: walking };
  }
  var idle = Math.floor(tS * (c.look.type === 'bat' ? 9 : 2.2) + c.slot * 1.3) % 4, atk = 0, pre = false;
  if (an) {
    var t = vf - an.f0, q2 = t / an.n, hq2 = an.hit / an.n;
    pre = ATB.flashAlpha(c.id) > 0;               // the module's 18-frame pre-action flash
    atk = q2 < hq2 - 0.1 ? 1 : q2 < hq2 + 0.25 ? 2 : 0;
    if (atk === 2 && an.act.cmd === 'monAttack') x += 6;
  }
  if (hurt && vf - hitAt[c.id] < 6) x -= 2;
  var fly = (RK.MON[c.look.type].fly || 0) + (c.look.type === 'bat' ? (idle === 2 ? -1 : idle === 0 ? 1 : 0) : 0);
  return { spr: spriteOf(c, { f: ATB.get(c.id).status === 'slow' ? 0 : idle, atk: atk, hurt: hurt }), x: x, y: y, fly: fly, white: white ? 1 : pre ? 2 : 0 };
}

var field, fgc;
function drawField(tSec) {
  if (!field || field.width !== L.W || field.height !== L.FH) { field = RK.mkCanvas(L.W, L.FH); fgc = field.getContext('2d'); }
  var g = fgc, W = L.W, FH = L.FH; g.imageSmoothingEnabled = false;
  var S = ruinScene(W, FH);
  RK.drawSceneBack(g, S, tSec); drawRuinTorch(g, S, tSec);
  var order = B.all.slice().sort(function (a, b) { return POS[a.id].y - POS[b.id].y; });
  var PO = order.map(function (c) { var o = poseOf(c); o.c = c; return o; });
  PO.forEach(function (o) {
    if (o.c.dead && !isParty(o.c) && B.vf - deadAt[o.c.id] > 54) return;
    var rx = Math.max(4, Math.round(o.spr.w * (o.fly ? 0.2 : 0.3)));
    g.globalAlpha = 0.42; RK.oval(g, o.x, o.y, rx, Math.max(1, Math.round(rx * 0.25)), '#0a0612'); g.globalAlpha = 1;
    if (o.c.defending && !o.c.dead) { g.globalAlpha = 0.7; RK.fxGlyph(g, o.x, o.y, 0.5, '#90e2ff'); g.globalAlpha = 1; }
  });
  fx.forEach(function (e) { var q = (B.vf - e.f0) / e.n; if (q >= 0 && q < 1 && e.under) e.draw(g, q); });
  PO.forEach(function (o) {
    var c = o.c, dy = o.fly || 0;
    if (c.dead && deadAt[c.id] != null && B.vf >= deadAt[c.id]) {
      if (isParty(c)) RK.drawSprite(g, RK.heroKO(c.look.cls, c.look.tint, c.look.hair), o.x, o.y);
      else RK.drawDissolve(g, o.spr, o.x, o.y - dy, (B.vf - deadAt[c.id]) / 54);
      return;
    }
    if (o.walking) { g.globalAlpha = 0.35; RK.drawSprite(g, o.spr, o.x + 6, o.y); g.globalAlpha = 1; }
    RK.drawSprite(g, o.spr, o.x, o.y - dy);
    if (o.white) RK.drawSprite(g, o.spr, o.x, o.y - dy, { white: true, alpha: o.white === 2 ? 0.4 : 0.62 });   // tinted flash, the sprite stays readable
    var st = ATB.get(c.id).status;
    if (st) RK.fxStatus(g, st, bodyBox(c, o.x, o.y - dy, o.spr), tSec);
    if (B.anim && B.anim.act.actor === c.id && (B.vf - B.anim.f0) / B.anim.n < 0.7) RK.fxCursor(g, o.x, Math.round(o.y - dy - o.spr.ay + o.spr.top) - 8 + (Math.floor(tSec * 6) % 2));
  });
  if (P.enemyGauge === 'on') ATB.drawEnemyGauges(g, PO.filter(function (o) { return !isParty(o.c); }).map(function (o) { return { id: o.c.id, x: o.x, footY: o.y }; }), FH);
  fx.forEach(function (e) { var q = (B.vf - e.f0) / e.n; if (q >= 0 && q < 1 && !e.under) e.draw(g, q); });
  parts.draw(g);
  if (menu && menu.stage === 'target' && menu.tgt && Math.floor(B.vf / 8) % 4 !== 3) {
    var tt = byId(menu.tgt);
    if (tt && !tt.dead) { var cc = center(tt); RK.drawTargetHand(g, { left: isParty(tt) ? POS[tt.id].x - 11 : cc.left, right: isParty(tt) ? POS[tt.id].x + 11 : cc.left + cc.w - 4, top: cc.top, cy: cc.y }, W); }
  }
  var bb = banner && B.vf - banner.f0 < banner.n ? RK.bannerBox(W, banner.txt) : null;
  pops.forEach(function (p) {
    var age = (B.vf - p.f0) * FRAME_MS; if (age < 0 || age > 1400) return;
    var hw = (p.kind === 'num' ? RK.numWidth(p.str) : RK.textW(p.str)) >> 1, x = RK.clamp(p.x, hw + 2, W - hw - 3), y = p.y;
    if (bb && y - 8 < bb.y + bb.h + 2 && x + hw > bb.x && x - hw < bb.x + bb.w) y = bb.y + bb.h + 10;
    if (p.kind === 'num') RK.drawPopNumber(g, p.str, x, RK.clamp(y, 4, FH - 12), age, { col: p.col, col2: p.col2 });
    else RK.drawPopText(g, p.str, x, RK.clamp(y, 4, FH - 12), age, p.col);
  });
  RK.drawSceneFront(g, S, tSec);
  var j = juice.sample(B.vf);
  RK.drawFlash(g, W, FH, j.flash);
  if (bb) RK.drawBanner(g, W, banner.txt);
  ATB.drawModePlate(g, 4, 4);
  if (B.result && B.vf - B.endAt > 60) {
    var txt = B.result === 'win' ? 'Victory!' : 'The party has fallen', sub = B.result === 'win' ? 'The ruin falls quiet.' : 'Regrouping...';
    var w = Math.max(RK.textW(sub), RK.textW(txt)) + 24, hl = Math.min.apply(null, B.party.map(function (c) { return POS[c.id].x - 11; })) - 6, x0 = Math.max(4, Math.min(hl - w, (W - w) >> 1));
    RK.drawWin(g, x0, 30, w, 34); RK.drawText(g, txt, x0 + ((w - RK.textW(txt)) >> 1), 38, '#fff3a0'); RK.drawText(g, sub, x0 + ((w - RK.textW(sub)) >> 1), 50, '#ffffff');
  }
  return j;
}
function drawHud(g) {
  var y0 = L.FH, HH = L.H - L.FH, R = L.row, pad = L.pad, lw = L.lw, W = L.W, flash = Math.floor(B.vf / 4) % 2;
  RK.rect(g, 0, y0, W, HH, '#05060f');
  RK.drawWin(g, 0, y0 + 1, lw, HH - 2);
  var tx = function (i) { return y0 + pad + i * R + (R > 12 ? 1 : 0); };
  if (menu) {
    var c = byId(menu.id), dim = menu.stage !== 'cmd';
    CMDS.forEach(function (s, i) { RK.drawText(g, s, 18, tx(i), dim && i !== menu.cmd ? '#9aa4d8' : '#ffffff'); });
    if (menu.stage === 'cmd' || (menu.stage === 'target' && menu.cmd === 0)) RK.drawHand(g, 15, tx(menu.cmd) + 3);
    var sub = menu.cmd === 1 || menu.cmd === 2;
    if (sub && menu.stage !== 'cmd') {
      RK.drawWin(g, 0, y0 + 1, lw, HH - 2);
      var list = menu.cmd === 1 ? SPELLS : ITEMS;
      list.forEach(function (it, i) {
        var ok = menu.cmd === 1 ? c.mp >= it.mp : B.items[i] > 0, col = ok ? '#ffffff' : '#7a84b8';
        RK.drawText(g, it.name, 18, tx(i), col);
        var n = menu.cmd === 1 ? String(it.mp) : String(B.items[i]);
        RK.drawText(g, n, lw - 9 - RK.textW(n), tx(i), col);
      });
      RK.drawHand(g, 15, tx(menu.sub) + 3);   // stays on the chosen entry while the target hand blinks
    }
  } else {
    var names = []; B.mons.forEach(function (m) { if (!m.dead) names.push(m.name); });
    names.forEach(function (n, i) { RK.drawText(g, n, 9, tx(i), '#ffffff'); });
  }
  var rx = lw + 1, rw = W - rx - 1;
  RK.drawWin(g, rx, y0 + 1, rw, HH - 2);
  var nameW = Math.max.apply(null, B.party.map(function (p) { return RK.textW(p.name); }));
  B.party.forEach(function (c, i) {
    var y = tx(i), nx = rx + 13, act = menu && menu.id === c.id;
    if (act && Math.floor(B.vf / 10) % 3 !== 2) RK.drawHand(g, nx - 2, y + 3);
    RK.drawText(g, c.name, nx, y, c.dead ? '#8a90b8' : act ? '#fff3a0' : '#ffffff');
    // the module lays out name / HP / gauge so they never overlap, then draws the gauge
    var LR = ATB.layoutRow({ x: nx, y: y, nameW: nameW, hpW: RK.textW('9999'), right: rx + rw - 8, h: L.gh });
    var hp = String(c.hp), low = c.hp * 4 < c.maxhp;
    RK.drawText(g, hp, LR.hpRight - RK.textW(hp), y, c.dead ? '#ff8a8a' : low ? '#ffd860' : '#ffffff');
    ATB.drawGauge(g, c.id, LR.gauge.x, LR.gauge.y, LR.gauge.w, LR.gauge.h);
  });
}

/* ---------- screen: native buffer, integer scale, square pixels ---------- */
var canvas = document.getElementById('screen'), stage = document.getElementById('stage'), scr = null;
scr = (function () {
  var buf = RK.mkCanvas(256, 224), out = canvas.getContext('2d'), last = {};
  var o = {
    buf: buf, g: buf.getContext('2d'), scale: 1,
    resize: function (w, h) { buf.width = w; buf.height = h; o.g = buf.getContext('2d'); o.g.imageSmoothingEnabled = false; },
    present: function (sh) {
      last = sh || last; var w = buf.width, h = buf.height, dpr = window.devicePixelRatio || 1;
      var narrow = matchMedia('(max-width: 760px)').matches, aw = stage.clientWidth || w, ah = narrow ? 1e9 : (stage.clientHeight || h), s = Math.max(1, Math.floor(Math.min(aw * dpr / w, ah * dpr / h)));
      if (canvas.width !== w * s || canvas.height !== h * s) { canvas.width = w * s; canvas.height = h * s; }
      canvas.style.width = (w * s / dpr) + 'px'; canvas.style.height = (h * s / dpr) + 'px'; o.scale = s;
      out.setTransform(1, 0, 0, 1, 0, 0); out.imageSmoothingEnabled = false; out.fillStyle = '#000'; out.fillRect(0, 0, canvas.width, canvas.height);
      var sx = Math.round(last.sx || 0), sy = Math.round(last.sy || 0), split = L.FH;
      out.save(); out.beginPath(); out.rect(0, 0, w * s, split * s); out.clip();
      out.drawImage(buf, 0, 0, w, split, sx * s, sy * s, w * s, split * s); out.restore();
      out.drawImage(buf, 0, split, w, h - split, 0, split * s, w * s, (h - split) * s);
    }
  };
  addEventListener('resize', function () { o.present(); });
  try { new ResizeObserver(function () { o.present(); }).observe(stage); } catch (e) { }
  return o;
})();
function render() {
  var g = scr.g, tSec = B.vf / FPS, j = drawField(tSec);
  g.drawImage(field, 0, 0); drawHud(g);
  scr.present({ sx: j.sx, sy: j.sy });
}

/* ---------- input ---------- */
var KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyZ: 'ok', Enter: 'ok', Space: 'ok', KeyX: 'back', Escape: 'back', Backspace: 'back' };
var inputCount = 0;
function press(k) {
  inputCount++;
  if (P.control === 'auto') { P.control = 'manual'; syncPanel(); if (menu) { menu.plan = null; menu.stage = 'cmd'; } }
  keys.push(k);
}
addEventListener('keydown', function (e) {
  var k = KEYMAP[e.code]; if (!k) return;
  if (e.target && /INPUT|SELECT/.test(e.target.tagName)) return;
  e.preventDefault(); press(k);
});
document.querySelectorAll('[data-key]').forEach(function (b) { b.addEventListener('pointerdown', function (e) { e.preventDefault(); press(b.dataset.key); }); });

/* ---------- control panel (live) ---------- */
var panel = document.getElementById('panel');
function syncPanel() {
  panel.querySelectorAll('[data-p]').forEach(function (el) {
    var k = el.dataset.p; el.value = P[k];
    var o = panel.querySelector('[data-out="' + k + '"]'); if (o) o.textContent = k === 'speed' ? 'x' + (+P[k]).toFixed(2) : P[k];
  });
  var tbl = document.getElementById('fill');
  if (tbl) tbl.innerHTML = HEROES.slice(0, P.party).map(function (h, i) {
    return '<tr><td>' + h.name + '</td><td>' + P['spd' + (i + 1)] + '</td><td>' + secondsToFill(P['spd' + (i + 1)], P.status).toFixed(1) + ' s</td></tr>';
  }).join('');
  panel.querySelectorAll('.hero-row').forEach(function (r, i) { r.hidden = i >= P.party; });
}
function setParam(k, v, quiet) {
  var d = DEF[k]; P[k] = typeof d === 'number' ? +v : v;
  if (k === 'res' || k === 'party' || k === 'seed') reset(true);
  else if (k === 'status' || k === 'mode' || k === 'speed' || /^spd/.test(k)) applyPartyStatus();
  else if (k === 'control' && menu) { menu.plan = null; menu.f0 = B.vf; menu.stage = 'cmd'; }
  if (!quiet) syncPanel();
  try { var u = new URL(location.href); u.searchParams.set(k, P[k]); u.searchParams.delete('t'); u.searchParams.delete('freeze'); history.replaceState(null, '', u); } catch (e) { }
}
panel.querySelectorAll('[data-p]').forEach(function (el) {
  el.addEventListener('input', function () { setParam(el.dataset.p, el.value); });
});
var vs = document.getElementById('variant');
Object.keys(VARIANTS).forEach(function (n) { var o = document.createElement('option'); o.textContent = n; vs.appendChild(o); });
vs.addEventListener('change', function () {
  var v = VARIANTS[vs.value];
  Object.keys(DEF).forEach(function (k) { if (k !== 'control' && k !== 'seed' && k !== 'enemyGauge') P[k] = v[k] != null ? v[k] : DEF[k]; });
  reset(true); syncPanel();
});
document.getElementById('restart').addEventListener('click', function () { reset(true); });

/* ---------- run: ?t= fast-forwards the 60 Hz simulation; freeze=1 draws exactly once ---------- */
reset(true);
syncPanel();
var target = Math.round(startMs / FRAME_MS);
while (T < target) step();
render();
/* text state for critics and tools/sprites/statecheck.py. Nothing in this demo is mirrored: RK.drawSprite() blits the
   kit sprite as authored, so each actor shows its art's native side. The hero art looks LEFT (poseOf() walks the party
   with dir = -1); the monsters are 3/4 views turned right, except the bat and the slime (front views, no side). */
var ART_FACING = { hero: 'left', brute: 'right', imp: 'right', sentinel: 'right', gshaman: 'right', bat: null, slime: null };
window.__state = function () {
  var act = B.anim ? B.anim.act : null, mean = function (L) { var n = 0, sx = 0; L.forEach(function (c) { if (!c.dead) { n++; sx += POS[c.id].x; } }); return n ? Math.round(sx / n) : null; };
  var mp = mean(B.all.filter(isParty)), mm = mean(B.all.filter(function (c) { return !isParty(c); }));
  return { t: Math.round(T * FRAME_MS), actors: B.all.map(function (c) {
    var o = poseOf(c), hero = isParty(c), tg = act && act.actor === c.id && byId(act.target) && isParty(byId(act.target)) !== hero ? act.target : null;
    var r = { id: c.id, x: Math.round(o.x), y: Math.round(o.y), facing: ART_FACING[hero ? 'hero' : c.look.type], target: tg || (hero ? mm : mp) };
    if (o.x !== POS[c.id].x) r.vx = o.x - POS[c.id].x;
    if (c.dead) r.noFace = hero ? 'knocked out (lying)' : 'dead (dissolved)'; else if (!r.facing) r.noFace = 'frontal art';
    return r; }) };
};
window.__game = { get P() { return P; }, get B() { return B; }, get ATB() { return ATB; }, input: { get count() { return inputCount; } }, progress: function () { return B.vf + '|' + B.all.map(function (a) { return a.hp + ':' + ATB.get(a.id).gauge.toFixed(2); }).join(','); } };
if (Q.get('ambient') === '1') { window.__ambient = RK.ambientChange(ruinScene(L.W, L.FH), 0, 4); document.title = JSON.stringify(window.__ambient); }
if (!freeze) {
  var last = null, acc = 0;
  var loop = function (ts) {
    if (last != null) acc += Math.min(250, ts - last);
    last = ts;
    while (acc >= FRAME_MS) { step(); acc -= FRAME_MS; }
    render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
})();
