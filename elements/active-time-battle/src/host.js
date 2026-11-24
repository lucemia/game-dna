/* ===================== Host game: turn-based ruin battle (no gauges) =====================
   Fixed turn order: every living hero (top to bottom), then every living enemy, then a new round.
   On a hero's turn the command window opens; enemies act on their own turn.
   Controls: arrows move, Z / Enter / Space confirm, X / Esc back. ?auto=1 lets the computer play.
   ?t=<ms>&freeze=1 fast-forwards the 60 Hz simulation (auto-play) and draws one frame. */
(function () {
'use strict';
/* ---------------------------------------------------------------------------------------------
   HOST API (read before changing anything). Everything below lives inside one IIFE: nothing here is
   global. Art helpers are ONLY reachable as RK.<name> (e.g. RK.clamp, never bare clamp).
   Game state and functions in this script:
     B            battle: {vf frame, wave, party[], mons[], all[], order[], turn, round, anim, result, endAt, nextAt}
                  combatant: {id, name, side 'party'|'enemy', slot, look, hp, maxhp, atk, mag, mp, dead, defending}
     POS[id]      {x, y} foot position on the field (native px)
     menu         null or {id, f0, stage 'cmd'|'sub'|'target', cmd, sub, tgt, tside, plan}
     reset(sameWave)  new battle            nextTurn()   fixed turn order: opens a hero menu or runs an enemy
     step()       one 60 Hz tick: menuStep (if a menu is open) -> animStep (if an action plays) -> else nextTurn
     act(a, onDone)  start one action {actor, cmd 'attack'|'magic'|'enemy', spell, target}; plays B.anim, calls onDone() at its end
     animStep()   advance B.anim one frame (resolve at the hit frame; at the end: checkEnd, then onDone)
     resolve(a)   apply damage/heal at the hit frame (marks deaths)     stageFx(a)  effects for an action
     checkEnd()   sets B.result 'win'|'lose' when one side has nobody living
     autoPlan(c)  auto player's choice for hero c     menuStep()  auto/keyboard menu     commit(cmd, sub, target)
     living(side) living combatants ('party'|'enemy'), may be EMPTY     byId(id)   current()   isParty(a)
     center(c)    {x, y, top, left, w} of a sprite    poseOf(c)   spriteOf(c, pose)
     drawField(tSec)  field: backdrop, shadows, sprites, fx, target hand, pop-ups, banner, Round plate (top-left)
     drawHud(g)   HUD below y=FH: left window x 0-89 (enemy names / command list), right window x 91-254,
                  rows at y = 159 + 16*i: name x 104, HP 'cur/max' right-aligned at x 201, 'MP' label ~x 224, MP right x 246
     present(), render(), press(k), KEYMAP
   Constants: W 256, H 224, FH 150 (field height), ROW 16, PAD 8, LW 90, FPS 60, FRAME_MS.
   Useful RK helpers: RK.clamp(v,a,b) RK.rect(g,x,y,w,h,col) RK.drawText(g,s,x,y,col)->width RK.textW(s)
     RK.drawSmall(g,s,x,y,col) (3x5 caps/digits) RK.drawWin(g,x,y,w,h)
     RK.drawGauge(g,x,y,w,h,fraction,kind) kind: hero|haste|slow|wait|flashW|flashY|mon|off
     RK.drawSprite(g,spr,x,y,{white,alpha}) RK.fxCursor(g,x,y) RK.drawBanner(g,W,txt) RK.rng(seed)
   --------------------------------------------------------------------------------------------- */
var Q = new URLSearchParams(location.search);
var FPS = 60, FRAME_MS = 1000 / FPS;
var W = 256, H = 224, FH = 150, ROW = 16, PAD = 8, LW = 90;   // native resolution; field 256x150, HUD 74 px
var freeze = Q.get('freeze') === '1', startMs = +(Q.get('t') || 0);
var auto = Q.get('auto') === '1' || Q.get('t') != null;
var seed = +(Q.get('seed') || 3);

/* ---------- content ---------- */
var HEROES = [
  { id: 'rowan', name: 'Rowan', cls: 'knight', tint: '#3a64c8', hair: 3, hp: 460, atk: 92, mag: 20 },
  { id: 'mira', name: 'Mira', cls: 'mage', tint: '#8a44c4', hair: 0, hp: 330, atk: 40, mag: 88 },
  { id: 'bram', name: 'Bram', cls: 'rogue', tint: '#2f8a6a', hair: 1, hp: 380, atk: 74, mag: 30 },
  { id: 'ilsa', name: 'Ilsa', cls: 'mage', tint: '#c8603a', hair: 2, hp: 350, atk: 44, mag: 70 }
];
var WAVES = [
  [{ id: 'troll', name: 'Moss Troll', type: 'brute', tint: '#7c9a48', pos: [0.25, 0.93], hp: 1100, atk: 70 },
   { id: 'imp', name: 'Thorn Imp', type: 'imp', tint: '#c4483c', pos: [0.45, 0.66], hp: 380, atk: 42 },
   { id: 'bat', name: 'Dusk Bat', type: 'bat', tint: '#8a5ad0', pos: [0.165, 0.5], hp: 300, atk: 34 }],
  [{ id: 'sent', name: 'Ruin Warden', type: 'sentinel', tint: '#9a8a6a', pos: [0.24, 0.92], hp: 1000, atk: 64 },
   { id: 'hex', name: 'Hex Goblin', type: 'gshaman', tint: '#4aa890', pos: [0.44, 0.66], hp: 420, atk: 46 },
   { id: 'wisp', name: 'Bog Wisp', type: 'slime', tint: '#5ab4d0', pos: [0.14, 0.6], hp: 340, atk: 36 }]
];
var CMDS = ['Attack', 'Magic', 'Defend'];
var SPELLS = [
  { name: 'Flame', mp: 4, kind: 'dmg', pow: 1.5, elem: 'fire' },
  { name: 'Frost', mp: 5, kind: 'dmg', pow: 1.7, elem: 'ice' },
  { name: 'Mend', mp: 5, kind: 'heal', pow: 2.2, elem: 'heal' }
];
var DUR = { attack: [54, 30], magic: [76, 50], enemy: [50, 30] };   // [frames, hit frame]

/* ---------- state ---------- */
var B, fx, pops, hitAt, deadAt, banner, parts, juice, rnd, menu, keys = [], T = 0, POS;
function actor(o, side, i) { return { id: o.id, name: o.name, side: side, slot: i, look: o, maxhp: o.hp, hp: o.hp, atk: o.atk, mag: o.mag || 0, mp: 40, dead: false, defending: false }; }
function reset(sameWave) {
  var wave = B ? (sameWave ? B.wave : (B.wave + 1) % WAVES.length) : 0;
  B = { vf: 0, wave: wave, party: HEROES.map(function (h, i) { return actor(h, 'party', i); }), mons: WAVES[wave].map(function (m, j) { return actor(m, 'enemy', j); }),
    order: [], turn: -1, round: 0, anim: null, result: null, endAt: 0, nextAt: 30 };
  B.all = B.party.concat(B.mons);
  POS = {};
  B.party.forEach(function (c, i) { POS[c.id] = { x: Math.round(W * 0.8 + (i / 3 - 0.5) * 45), y: Math.round(FH * (0.45 + i / 3 * 0.48)) }; });
  B.mons.forEach(function (m) { POS[m.id] = { x: Math.round(W * m.look.pos[0]), y: Math.round(FH * m.look.pos[1]) }; });
  fx = []; pops = []; hitAt = {}; deadAt = {}; banner = null; menu = null;
  parts = RK.createParticles(11 + wave); juice = RK.createJuice(); rnd = RK.rng(seed * 977 + wave);
}
var isParty = function (a) { return a.side === 'party'; };
var living = function (side) { return (side === 'party' ? B.party : B.mons).filter(function (a) { return !a.dead; }); };
function byId(id) { for (var i = 0; i < B.all.length; i++) if (B.all[i].id === id) return B.all[i]; return null; }
function current() { return B.order[B.turn] ? byId(B.order[B.turn]) : null; }

/* ---------- turn flow ---------- */
function nextTurn() {
  do {
    B.turn++;
    if (B.turn >= B.order.length) { B.round++; B.order = B.all.filter(function (a) { return !a.dead; }).map(function (a) { return a.id; }); B.turn = 0; }
  } while (current().dead);
  var c = current();
  if (isParty(c)) { c.defending = false; menu = { id: c.id, f0: B.vf, stage: 'cmd', cmd: 0, sub: 0, tgt: null, plan: auto ? autoPlan(c) : null }; }
  else { var foes = living('party'); act({ actor: c.id, cmd: 'enemy', target: foes[Math.floor(rnd() * foes.length)].id }); }
}
function act(a, onDone) {
  var d = DUR[a.cmd];
  B.anim = { act: a, f0: B.vf, n: d[0], hit: d[1], done: false, onDone: onDone || null };
  if (a.cmd === 'magic') banner = { f0: B.vf, n: d[0], txt: SPELLS[a.spell].name };
  stageFx(a);
}
function animStep() {
  var an = B.anim, t = B.vf - an.f0;
  if (!an.done && t >= an.hit) { an.done = true; resolve(an.act); }
  if (t >= an.n) { B.anim = null; B.nextAt = B.vf + 12; checkEnd(); if (an.onDone) an.onDone(); }
}
function step() {
  if (!B.result) {
    if (menu) menuStep();
    if (B.anim) animStep();
    else if (!menu && B.vf >= B.nextAt) nextTurn();
  } else if (B.vf - B.endAt > 330) reset(B.result === 'lose');
  B.vf++; T++;
  parts.step();
}
function checkEnd() {
  if (!living('enemy').length) { B.result = 'win'; B.endAt = B.vf; }
  else if (!living('party').length) { B.result = 'lose'; B.endAt = B.vf; }
}
function resolve(a) {
  var src = byId(a.actor), t = byId(a.target), f = B.vf;
  if (!t || t.dead) { var pool = living(a.cmd === 'magic' && SPELLS[a.spell].kind === 'heal' ? 'party' : isParty(src) ? 'enemy' : 'party'); t = pool[0]; if (!t) return; }
  var c = center(t), v = 0.875 + rnd() * 0.25;
  if (a.cmd === 'magic') src.mp = Math.max(0, src.mp - SPELLS[a.spell].mp);
  if (a.cmd === 'magic' && SPELLS[a.spell].kind === 'heal') {
    var amt = Math.min(Math.round(src.mag * SPELLS[a.spell].pow * v), t.maxhp - t.hp); t.hp += amt;
    pops.push({ f0: f, kind: 'num', str: String(amt), x: c.x, y: Math.max(12, c.top - 6), col: '#9cffb8', col2: '#3ac070' });
    parts.emit('heal', c.x, c.y + 4, 8); return;
  }
  var base = a.cmd === 'magic' ? src.mag * SPELLS[a.spell].pow : src.atk;
  var dmg = Math.round(base * v * (t.defending ? 0.5 : 1));
  t.hp = Math.max(0, t.hp - dmg); hitAt[t.id] = f;
  pops.push({ f0: f, kind: 'num', str: String(dmg), x: c.x, y: Math.max(12, c.top - 6), col: '#f4f6ff', col2: isParty(t) ? '#f0a8b0' : '#a8bcf0' });
  var big = dmg >= 150 || src.look.type === 'brute';
  juice.shake(f, big ? 10 : 6, big ? 2 : 1);
  if (a.cmd === 'attack') { fx.push({ f0: f, n: 13, draw: function (g, q) { RK.fxBurst(g, c.x - 2, c.y - 1, q, big, 5); } }); parts.emit('spark', c.x, c.y, 6); }
  if (a.cmd === 'magic') { juice.flash(f, 8, 0.2); parts.emit('ember', c.x, c.y, 5); }
  if (t.hp <= 0) { t.dead = true; deadAt[t.id] = f + 6; if (!isParty(t)) parts.emit('dust', c.x, POS[t.id].y - 2, 8); }
}
function stageFx(a) {
  var src = byId(a.actor), t = byId(a.target), hit = B.vf + B.anim.hit, c = center(t), p = POS[src.id];
  var add = function (f0, n, draw, under) { fx.push({ f0: f0, n: n, draw: draw, under: under }); };
  if (a.cmd === 'attack') add(hit - 7, 10, function (g, q) { RK.fxCrescent(g, c.x, c.y, q, 14); });
  else if (a.cmd === 'enemy') {
    if (src.look.type === 'bat' || src.look.type === 'imp') add(hit - 8, 18, function (g, q) { RK.fxClaw(g, c.x, c.y, q); });
    else { add(hit - 6, 12, function (g, q) { RK.fxSlash(g, c.x, c.y, q, 11, true); }); add(hit, 10, function (g, q) { RK.fxImpact(g, c.x, c.y, q); }); }
  } else {
    var sp = SPELLS[a.spell];
    add(B.vf + 8, B.anim.hit - 8, function (g, q) { RK.fxGlyph(g, p.x, p.y, q, sp.kind === 'heal' ? '#9cffb8' : '#ffa040'); }, true);
    add(hit - 16, 30, function (g, q) { RK.ELEM[sp.elem](g, c.x, c.y, q, 3); });
  }
}

/* ---------- command menu: keyboard, or the auto player ---------- */
function autoPlan(c) {
  var foes = living('enemy'), hurt = living('party').filter(function (a) { return a.hp < a.maxhp * 0.45; });
  if (c.look.cls === 'mage' && hurt.length && c.mp >= 5) return { cmd: 1, sub: 2, target: hurt[0].id };
  if (c.look.cls === 'mage' && c.mp >= 5) return { cmd: 1, sub: rnd() < 0.5 ? 0 : 1, target: foes[Math.floor(rnd() * foes.length)].id };
  if (rnd() < 0.08) return { cmd: 2 };
  return { cmd: 0, target: foes[Math.floor(rnd() * foes.length)].id };
}
function menuStep() {
  if (menu.plan) {
    var t = (B.vf - menu.f0) * FRAME_MS, pl = menu.plan, tc = 260 + pl.cmd * 120, ts = tc + (pl.sub != null ? 220 + pl.sub * 120 : 0), tt = ts + (pl.target ? 400 : 0);
    if (t < tc) { menu.cmd = Math.min(pl.cmd, Math.max(0, Math.floor((t - 260) / 120) + 1)); return; }
    if (pl.sub != null && t < ts) { menu.stage = 'sub'; menu.sub = Math.min(pl.sub, Math.max(0, Math.floor((t - tc - 220) / 120) + 1)); return; }
    if (pl.target && t < tt) { menu.stage = 'target'; menu.tgt = pl.target; return; }
    return commit(pl.cmd, pl.sub, pl.target);
  }
  while (keys.length && menu) {
    var k = keys.shift(), c = byId(menu.id);
    if (menu.stage === 'cmd') {
      if (k === 'up') menu.cmd = (menu.cmd + 2) % 3; else if (k === 'down') menu.cmd = (menu.cmd + 1) % 3;
      else if (k === 'ok') { if (menu.cmd === 2) return commit(2); if (menu.cmd === 0) { menu.stage = 'target'; menu.tside = 'enemy'; menu.tgt = living('enemy')[0].id; } else { menu.stage = 'sub'; menu.sub = 0; } }
    } else if (menu.stage === 'sub') {
      if (k === 'up') menu.sub = (menu.sub + 2) % 3; else if (k === 'down') menu.sub = (menu.sub + 1) % 3;
      else if (k === 'back') menu.stage = 'cmd';
      else if (k === 'ok' && c.mp >= SPELLS[menu.sub].mp) { var heal = SPELLS[menu.sub].kind === 'heal'; menu.tside = heal ? 'party' : 'enemy'; menu.tgt = (heal ? c : living('enemy')[0]).id; menu.stage = 'target'; }
    } else {
      var list = living(menu.tside), i = Math.max(0, list.map(function (a) { return a.id; }).indexOf(menu.tgt));
      if (k === 'up' || k === 'left') menu.tgt = list[(i + list.length - 1) % list.length].id;
      else if (k === 'down' || k === 'right') menu.tgt = list[(i + 1) % list.length].id;
      else if (k === 'back') menu.stage = menu.cmd === 0 ? 'cmd' : 'sub';
      else if (k === 'ok') return commit(menu.cmd, menu.sub, menu.tgt);
    }
  }
}
function commit(cmd, sub, target) {
  var c = byId(menu.id); menu = null;
  if (cmd === 2) { c.defending = true; pops.push({ f0: B.vf, kind: 'txt', str: 'Guard', x: POS[c.id].x, y: center(c).top - 6, col: '#90e2ff' }); B.nextAt = B.vf + 20; return; }
  act(cmd === 0 ? { actor: c.id, cmd: 'attack', target: target } : { actor: c.id, cmd: 'magic', spell: sub, target: target });
}

/* ---------- drawing ---------- */
function spriteOf(c, pose) { var l = c.look; return isParty(c) ? RK.heroSprite(l.cls, l.tint, l.hair, pose, RUIN_RIM) : RK.monSprite(l.type, l.tint, pose, RUIN_RIM); }
function center(c) {
  var p = POS[c.id], s = isParty(c) ? spriteOf(c, 'idle0') : spriteOf(c, { f: 0, atk: 0, hurt: false }), fly = isParty(c) ? 0 : (RK.MON[c.look.type].fly || 0);
  return { x: p.x, y: Math.round(p.y - fly - (s.ay - s.top) * 0.5), top: p.y - fly - (s.ay - s.top), left: p.x - s.ax + 2, w: s.w };
}
function poseOf(c) {
  var vf = B.vf, an = B.anim && B.anim.act.actor === c.id ? B.anim : null, p = POS[c.id], tS = vf / FPS;
  var hurt = hitAt[c.id] != null && vf - hitAt[c.id] < 24 && !an, white = hitAt[c.id] != null && (vf - hitAt[c.id] < 3 || (vf - hitAt[c.id] < 9 && Math.floor(vf / 2) % 2));
  var x = p.x, pose, walking = false;
  if (isParty(c)) {
    pose = Math.floor(tS * (c.slot % 2 ? 1.6 : 2.3) + c.slot * 0.5) % 2 ? 'idle1' : 'idle0';
    if ((menu && menu.id === c.id) || c.defending) pose = 'ready';
    if (B.result === 'win' && !c.dead) pose = Math.floor((vf - B.endAt) / 16) % 2 ? 'wind' : 'ready';
    if (an) {
      var q = (vf - an.f0) / an.n, hq = an.hit / an.n, mag = an.act.cmd === 'magic', fwd = mag ? 8 : 22;
      if (q < 0.22) { x -= Math.round(fwd * q / 0.22); walking = !mag; }
      else if (q < 0.78) { x -= fwd; pose = mag ? 'cast' : q < hq - 0.06 ? 'wind' : 'strike'; }
      else { x -= Math.round(fwd * (1 - (q - 0.78) / 0.22)); walking = !mag; }
      if (walking) pose = Math.floor(vf / 5) % 2 ? 'walkA' : 'walkB';
    } else if (hurt) pose = 'hurt';
    if (hurt && vf - hitAt[c.id] < 6) x += 2;
    return { spr: spriteOf(c, pose), x: x, y: p.y, white: white ? 1 : 0, walking: walking };
  }
  var idle = Math.floor(tS * (c.look.type === 'bat' ? 9 : 2.2) + c.slot * 1.3) % 4, atk = 0, pre = false;
  if (an) { var t = vf - an.f0, q2 = t / an.n, hq2 = an.hit / an.n; pre = t < 18 && Math.floor(t / 3) % 2 === 0; atk = q2 < hq2 - 0.1 ? 1 : q2 < hq2 + 0.25 ? 2 : 0; if (atk === 2) x += 6; }
  if (hurt && vf - hitAt[c.id] < 6) x -= 2;
  var fly = (RK.MON[c.look.type].fly || 0) + (c.look.type === 'bat' ? (idle === 2 ? -1 : idle === 0 ? 1 : 0) : 0);
  return { spr: spriteOf(c, { f: idle, atk: atk, hurt: hurt }), x: x, y: p.y, fly: fly, white: white ? 1 : pre ? 2 : 0 };
}
var field = RK.mkCanvas(W, FH), fgc = field.getContext('2d');
function drawField(tSec) {
  var g = fgc, S = ruinScene(W, FH); g.imageSmoothingEnabled = false;
  RK.drawSceneBack(g, S, tSec); drawRuinTorch(g, S, tSec);
  var PO = B.all.slice().sort(function (a, b) { return POS[a.id].y - POS[b.id].y; }).map(function (c) { var o = poseOf(c); o.c = c; return o; });
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
    if (o.white) RK.drawSprite(g, o.spr, o.x, o.y - dy, { white: true, alpha: o.white === 2 ? 0.4 : 0.62 });
    var cur = current();
    if (cur === c && !B.result) RK.fxCursor(g, o.x, Math.round(o.y - dy - o.spr.ay + o.spr.top) - 8 + (Math.floor(tSec * 6) % 2));
  });
  fx.forEach(function (e) { var q = (B.vf - e.f0) / e.n; if (q >= 0 && q < 1 && !e.under) e.draw(g, q); });
  parts.draw(g);
  if (menu && menu.stage === 'target' && Math.floor(B.vf / 8) % 4 !== 3) {
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
  // round plate, top-left
  var lbl = 'Round ' + Math.max(1, B.round), pw = RK.textW(lbl) + 10;
  RK.rect(g, 4, 4, pw, 13, '#0a0c24'); RK.rect(g, 5, 5, pw - 2, 11, '#1c2458'); RK.rect(g, 5, 5, pw - 2, 1, '#5a6ac0'); RK.drawText(g, lbl, 9, 7, '#e8ecff');
  if (B.result && B.vf - B.endAt > 60) {
    var txt = B.result === 'win' ? 'Victory!' : 'The party has fallen', sub = B.result === 'win' ? 'The ruin falls quiet.' : 'Regrouping...';
    var w = Math.max(RK.textW(sub), RK.textW(txt)) + 24, x0 = Math.max(4, Math.min(POS.rowan.x - 40 - w, (W - w) >> 1));
    RK.drawWin(g, x0, 30, w, 34); RK.drawText(g, txt, x0 + ((w - RK.textW(txt)) >> 1), 38, '#fff3a0'); RK.drawText(g, sub, x0 + ((w - RK.textW(sub)) >> 1), 50, '#ffffff');
  }
  return j;
}
function drawHud(g) {
  var y0 = FH, HH = H - FH, tx = function (i) { return y0 + PAD + 1 + i * ROW; };
  RK.rect(g, 0, y0, W, HH, '#05060f');
  RK.drawWin(g, 0, y0 + 1, LW, HH - 2);
  if (menu) {
    var c = byId(menu.id);
    if (menu.stage === 'sub' || (menu.stage === 'target' && menu.cmd === 1)) {
      SPELLS.forEach(function (s, i) { var ok = c.mp >= s.mp; RK.drawText(g, s.name, 18, tx(i), ok ? '#ffffff' : '#7a84b8'); RK.drawText(g, String(s.mp), LW - 9 - RK.textW(String(s.mp)), tx(i), ok ? '#ffffff' : '#7a84b8'); });
      RK.drawHand(g, 15, tx(menu.sub) + 3);
    } else {
      CMDS.forEach(function (s, i) { RK.drawText(g, s, 18, tx(i), '#ffffff'); });
      RK.drawHand(g, 15, tx(menu.cmd) + 3);
    }
  } else B.mons.forEach(function (m, i) { if (!m.dead) RK.drawText(g, m.name, 9, tx(living('enemy').indexOf(m)), '#ffffff'); });
  var rx = LW + 1, rw = W - rx - 1, cur = current();
  RK.drawWin(g, rx, y0 + 1, rw, HH - 2);
  B.party.forEach(function (c, i) {
    var y = tx(i), turn = cur === c && !B.result;
    if (turn && Math.floor(B.vf / 10) % 3 !== 2) RK.drawHand(g, rx + 11, y + 3);
    RK.drawText(g, c.name, rx + 13, y, c.dead ? '#8a90b8' : turn ? '#fff3a0' : '#ffffff');
    var hp = String(c.hp) + '/' + c.maxhp, low = c.hp * 4 < c.maxhp;
    RK.drawText(g, hp, rx + 110 - RK.textW(hp), y, c.dead ? '#ff8a8a' : low ? '#ffd860' : '#ffffff');
    var mp = String(c.mp), mx = rx + rw - 9 - RK.textW(mp);
    RK.drawSmall(g, 'MP', mx - 11, y + 2, '#9aa4d8'); RK.drawText(g, mp, mx, y, '#c8d0ff');
  });
}

/* ---------- screen: native buffer, integer scale, square pixels ---------- */
var canvas = document.getElementById('screen'), stage = document.getElementById('stage');
var buf = RK.mkCanvas(W, H), bg = buf.getContext('2d'), out = canvas.getContext('2d'), lastShake = { sx: 0, sy: 0 };
function present(sh) {
  lastShake = sh || lastShake;
  var dpr = window.devicePixelRatio || 1, ah = matchMedia('(max-width: 760px)').matches ? 1e9 : (stage.clientHeight || H);
  var s = Math.max(1, Math.floor(Math.min((stage.clientWidth || W) * dpr / W, ah * dpr / H)));
  if (canvas.width !== W * s) { canvas.width = W * s; canvas.height = H * s; }
  canvas.style.width = (W * s / dpr) + 'px'; canvas.style.height = (H * s / dpr) + 'px';
  out.imageSmoothingEnabled = false; out.fillStyle = '#000'; out.fillRect(0, 0, canvas.width, canvas.height);
  out.save(); out.beginPath(); out.rect(0, 0, W * s, FH * s); out.clip();
  out.drawImage(buf, 0, 0, W, FH, lastShake.sx * s, lastShake.sy * s, W * s, FH * s); out.restore();
  out.drawImage(buf, 0, FH, W, H - FH, 0, FH * s, W * s, (H - FH) * s);
}
addEventListener('resize', function () { present(); });
function render() { var j = drawField(B.vf / FPS); bg.drawImage(field, 0, 0); drawHud(bg); present({ sx: j.sx, sy: j.sy }); }

/* ---------- input: key taps are queued, so a 0 ms press still counts ---------- */
var KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyZ: 'ok', Enter: 'ok', Space: 'ok', KeyX: 'back', Escape: 'back', Backspace: 'back' };
var inputCount = 0;
function press(k) { inputCount++; if (auto) { auto = false; if (menu) { menu.plan = null; menu.stage = 'cmd'; } } keys.push(k); }
addEventListener('keydown', function (e) { var k = KEYMAP[e.code]; if (k) { e.preventDefault(); press(k); } });
document.querySelectorAll('[data-key]').forEach(function (b) { b.addEventListener('pointerdown', function (e) { e.preventDefault(); press(b.dataset.key); }); });

/* ---------- run ---------- */
reset();
var target = Math.round(startMs / FRAME_MS);
while (T < target) step();
render();
window.__game = { get B() { return B; }, input: { get count() { return inputCount; } }, progress: function () { return T + '|' + B.all.map(function (a) { return a.hp; }).join(','); } };
if (!freeze) {
  var last = null, acc = 0;
  requestAnimationFrame(function loop(ts) {
    if (last != null) acc += Math.min(250, ts - last);
    last = ts;
    while (acc >= FRAME_MS) { step(); acc -= FRAME_MS; }
    render(); requestAnimationFrame(loop);
  });
}
})();
