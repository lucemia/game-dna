/* A-07 motion-inputs demo: the training-arena simulation (no drawing). Plain script, one global: MotionArena.
 * World units = the pixel look's native pixels (320 x 180, ground line y = 150); the HD look draws the same world x2.
 * Deterministic: no Math.random, no wall clock; the scripted tape is fixed input frames fed through the same step as live play.
 *
 *   var A = MotionArena.create(GameDNA_MotionInputs, {miOptions});   A.step(deviceInputOrNull);   A.S (state)
 */
(function (root) {
  'use strict';
  var GROUND = 150, LEFT = 18, RIGHT = 302;
  var MOVES = ['236B Ember Wave', '623A Rising Fang', '[4]6A Gale Rush', '214B Ward Sigil', '360A Earthbreaker'];

  /* ---------- the scripted tape: absolute directions (6 = right), D*n holds, D+A one step with A pressed ---------- */
  function buildTape() {
    var T = [], marks = [];
    function add(s) {
      s.trim().split(/\s+/).forEach(function (tok) {
        var m = tok.match(/^([1-9])\*(\d+)$/), d, n = 1, b = '';
        if (m) { d = +m[1]; n = +m[2]; } else { m = tok.match(/^([1-9])\+([AB]+)$/); d = +m[1]; b = m[2]; }
        for (var i = 0; i < n; i++) T.push({ x: ((d - 1) % 3) - 1, y: Math.floor((d - 1) / 3) - 1, a: i === 0 && b.indexOf('A') >= 0, b: i === 0 && b.indexOf('B') >= 0 });
      });
    }
    function mark(name, note) { marks.push({ step: T.length, name: name, note: note || '' }); }
    mark('ready', 'idle, facing the partner');
    add('5*50');
    mark('walk', 'walks forward with real walk frames; the display counts the held right arrow');
    add('6*42 5*16');
    mark('ember-wave', '236B: down, down-forward, forward + B -> Ember Wave');
    add('2*4 3*3 6*2 6+B 5*60');
    mark('buffered', 'a slash (A), then 236B typed during its recovery: the special waits in the busy buffer and fires when the hero can act');
    add('5+A 5*3 2*3 3*3 6*2 6+B 5*60 6*64 5*12');
    mark('rising-fang', '623A: forward, down, down-forward + A -> Rising Fang');
    add('6*4 2*3 3*2 3+A 5*84');
    mark('too-slow', 'the same 236B shape, too slow: no special, the display says TOO SLOW and the normal spell comes out');
    add('2*14 3*14 6*14 6+B 5*60');
    mark('charge', 'hold back (the row counts the charge)');
    add('4*52');
    mark('gale-rush', '[4]6A: charge back, then forward + A -> Gale Rush');
    add('6*1 6+A 5*60');
    mark('cross-up', 'jumps over the partner: the hero turns to face left, the move list mirrors');
    add('6*40 9*3 5*58 6*24 5*6');
    mark('ember-left', 'facing left: 236B is now down, down-left, left + B');
    add('2*4 1*3 4*2 4+B 5*76');
    mark('ward-sigil', 'facing left, the first fireball motion (down, down-right, right + B) reads as 214B -> Ward Sigil');
    add('2*4 3*3 6*2 6+B 5*80');
    mark('earthbreaker', '360A: a full turn of the stick + A (the jump never starts)');
    add('4*2 1*2 2*2 3*2 6*2 9*1 8*1 8+A 5*86');
    mark('no-false', 'walking, jumping and plain attacks: no special fires');
    add('4*20 5*6 5+A 5*24 8*2 5*50 5+B 5*30 4*10 5*30');
    mark('end', 'loop');
    return { frames: T, marks: marks };
  }

  function create(MI, opt) {
    opt = opt || {};
    var tape = buildTape(), B = opt.body || {}, PUSH = B.push || 26, REACH = B.reach || PUSH + 10, SHOT = B.shot || 8, JVX = B.jumpVx || 1.3, MUT = opt.mutant || '';
    var S, mi, events = [];
    var hooks = { onHit: null };
    function newWorld() {
      return { step: 0, loopStep: 0, loop: 0, live: false, shake: 0,
        hero: { id: 'hero', x: 112, y: GROUND, vx: 0, vy: 0, face: 1, ground: true, st: 'idle', t: 0, walkT: 0, pre: 0, move: null, hit: false, trail: [], prevA: false, prevB: false, landT: 0, jumpVx: 0 },
        foe: { id: 'partner', x: 222, y: GROUND, vx: 0, face: -1, hp: 140, maxHp: 140, hurt: 0, down: 0, walkT: 0, home: 222, hits: 0, lastHit: null },
        shots: [], shotLog: [], jumps: 0, fx: [], fired: [], beat: 'ready', lastSpecial: null, lastNormal: null };
    }
    S = newWorld();
    var miOpt = { moves: MOVES, buttons: { A: { key: 'a', color: '#e8553a', light: '#ffa070', dark: '#7a1e14' }, B: { key: 'b', color: '#3a8ae8', light: '#90c8ff', dark: '#143a7a' } },
      onSpecial: function (m, info) { return startSpecial(m.id, info); },
      canAct: function () { return canAct(); } };
    for (var q in opt.mi || {}) miOpt[q] = opt.mi[q];
    mi = MI.create(miOpt);

    function canAct() { var h = S.hero; return h.ground && (h.st === 'idle' || h.st === 'walk' || h.st === 'crouch' || h.st === 'prejump'); }
    function startSpecial(id, info) {
      var h = S.hero;
      if (!canAct()) return false;
      h.st = id; h.t = 0; h.hit = false; h.pre = 0; h.trail = [];
      S.lastSpecial = { id: id, step: S.step, buffered: !!(info && info.buffered), face: h.face };
      S.fired.push({ id: id, step: S.step, loopStep: S.loopStep, buffered: !!(info && info.buffered) });
      events.push({ type: 'special', id: id, step: S.step });
      return true;
    }
    function hitFoe(dmg, kb, kind) {
      var f = S.foe, h = S.hero;
      if (f.down > 0) return;
      f.hp = Math.max(0, f.hp - dmg); f.hurt = 16; f.vx = (f.x >= h.x ? 1 : -1) * kb; f.hits++;
      f.lastHit = { kind: kind, step: S.step, dmg: dmg };
      S.fx.push(kind === 'quake' ? { k: 'spark', x: f.x - (f.x > h.x ? 6 : -6), y: GROUND - 4, t: 0, big: true } : { k: 'spark', x: (f.x + h.x) / 2 + (f.x > h.x ? 4 : -4), y: f.y - 20, t: 0, big: dmg >= 14 });
      if (f.hp <= 0) { f.down = 70; f.hurt = 0; }
      if (hooks.onHit) hooks.onHit(kind, dmg);
    }
    function foeRect() { return { x: S.foe.x - 10, y: S.foe.y - 30, w: 20, h: 30 }; }

    function stepHero(inp, rawA, rawB) {
      var h = S.hero, f = S.foe, dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), up = !!inp.up, down = !!inp.down;
      var pA = inp.a && !h.prevA, pB = inp.b && !h.prevB; h.prevA = rawA; h.prevB = rawB;
      h.t++;
      var free = h.st === 'idle' || h.st === 'walk' || h.st === 'crouch';
      // face the partner (not during an attack)
      if ((free || h.st === 'air' || h.st === 'prejump') && Math.abs(f.x - h.x) > 4) h.face = f.x > h.x ? 1 : -1;
      if (free && h.ground) {
        if (pA) { h.st = 'slash'; h.t = 0; h.hit = false; S.lastNormal = { id: 'slash', step: S.step }; }
        else if (pB) { h.st = 'cast'; h.t = 0; S.lastNormal = { id: 'spell', step: S.step }; S.fx.push({ k: 'twinkle', x: h.x + h.face * 6, y: h.y - 36, t: 0 }); }
        else if (up) { h.st = 'prejump'; h.t = 0; h.held = false; h.jumpVx = dir * JVX; }
        else if (down) { h.st = 'crouch'; h.vx = 0; }
        else if (dir) { h.st = 'walk'; h.vx = dir === h.face ? dir * 0.85 : dir * 0.65; }
        else { h.st = 'idle'; h.vx = 0; }
      }
      if (h.st === 'walk') h.walkT += Math.abs(h.vx);
      // the jump starts after 3 steps, held open (up to jumpHold steps) while a motion through up may be under way (360)
      var hold = h.st === 'prejump' && MUT !== 'nohold' ? mi.jumpHold() : 0;
      if (h.st === 'prejump' && hold > 0) h.held = true;
      if (h.st === 'prejump' && h.t >= 3 && hold === 0) { h.held = false; S.jumps++; h.st = 'air'; h.t = 0; h.ground = false; h.vy = -4.2; h.vx = h.jumpVx; }
      // attacks
      var st = h.st, t = h.t;
      if (st === 'slash') { h.vx = 0; if (t >= 5 && t <= 8 && !h.hit && Math.abs(f.x - h.x) < REACH && (f.x - h.x) * h.face > 0) { h.hit = true; hitFoe(6, 1.4, 'slash'); } if (t >= 22) h.st = 'idle'; }
      if (st === 'cast') { h.vx = 0; if (t >= 18) h.st = 'idle'; }
      if (st === 'ember-wave') { h.vx = 0; if (t === 6) { var sx0 = MUT === 'spawn' ? f.x : h.x + h.face * 16; S.shots.push({ k: 'ember', x: sx0, x0: sx0, caster: h.x, y: h.y - 19, vx: h.face * 2.6, t: 0, face: h.face }); } if (t >= 34) h.st = 'idle'; }
      if (st === 'rising-fang') {
        if (t === 4) { h.ground = false; h.vy = -4.3; h.vx = h.face * 0.55; }
        if (t >= 4 && h.vy < 0 && !h.hit && Math.abs(f.x - h.x) < REACH && (f.x - h.x) * h.face > 0) { h.hit = true; hitFoe(16, 2.2, 'fang'); }
        if (t > 6 && h.ground) { h.st = 'land'; h.t = 0; }
      }
      if (st === 'gale-rush') {
        if (t >= 4 && t < 18) {
          h.vx = h.face * 4.2; h.trail.unshift({ x: h.x, y: h.y }); if (h.trail.length > 6) h.trail.pop();
          if (Math.abs(f.x - h.x) < PUSH + 4 && (f.x - h.x) * h.face > 0) { h.vx = 0; if (!h.hit) { h.hit = true; hitFoe(14, 3.4, 'rush'); } h.t = Math.max(h.t, 18); }
        } else { h.vx = 0; if (h.trail.length && t % 2) h.trail.pop(); }
        if (t >= 32) { h.st = 'idle'; h.trail = []; }
      }
      if (st === 'ward-sigil') { h.vx = 0; if (t === 4) S.fx.push({ k: 'ward', x: h.x + h.face * 18, y: h.y - 18, t: 0, face: h.face }); if (t >= 40) h.st = 'idle'; }
      if (st === 'earthbreaker') {
        if (t === 6) { h.ground = false; h.vy = -2.6; h.vx = h.face * 0.4; }
        if (t > 8 && h.ground && !h.hit) { h.hit = true; h.t = 100; S.shake = 8; S.fx.push({ k: 'quake', x: h.x + h.face * 10, y: GROUND, t: 0 }); if (Math.abs(f.x - h.x) < 52 + PUSH) hitFoe(18, 2.6, 'quake'); }
        if (h.hit && h.t >= 116) { h.st = 'idle'; }
      }
      if (st === 'land') { h.vx = 0; if (t >= 8) h.st = 'idle'; }
      // physics
      if (!h.ground) { h.vy += 0.17; h.y += h.vy; if (h.y >= GROUND) { h.y = GROUND; h.ground = true; h.vy = 0; if (h.st === 'air') { h.st = 'land'; h.t = 0; h.landT = 6; } } }
      h.x += h.vx;
      if (h.st === 'air' || h.st === 'land') { if (h.st === 'land') h.vx = 0; }
      // push boxes (on the ground only: a jump may cross over the partner); a standing partner holds his ground
      if (h.ground && f.down === 0) { var d = h.x - f.x; if (Math.abs(d) < PUSH) { var push = (PUSH - Math.abs(d)) * (d >= 0 ? 1 : -1), wall = f.x - push * 0.5 < LEFT + 6 || f.x - push * 0.5 > RIGHT - 6; if (f.hurt > 0 && !wall) { h.x += push * 0.5; f.x -= push * 0.5; } else h.x += push; } }
      // in the air only a plain jump may pass over the partner; attacks that leave the ground keep their distance
      if (!h.ground && h.st !== 'air' && f.down === 0) { var d2 = h.x - f.x; if (Math.abs(d2) < PUSH) h.x = f.x + (d2 >= 0 ? PUSH : -PUSH); }
      h.x = Math.max(LEFT, Math.min(RIGHT, h.x));
    }
    function stepFoe() {
      var f = S.foe, h = S.hero;
      f.face = h.x >= f.x ? 1 : -1;
      if (f.down > 0) { f.down--; if (f.down === 0) { f.hp = f.maxHp; f.hurt = 0; } }
      if (f.hurt > 0) { f.hurt--; f.x += f.vx; f.vx *= 0.82; }
      else if (f.down === 0) {
        var home = f.home, d = home - f.x;
        // walk back home slowly when pushed away (and the hero is not standing there)
        if (Math.abs(d) > 2 && Math.abs(h.x - home) > PUSH + 6) { var sp = 0.55 * (d > 0 ? 1 : -1); f.x += sp; f.walkT += Math.abs(sp); f.vx = sp; } else f.vx = 0;
      }
      f.x = Math.max(LEFT + 6, Math.min(RIGHT - 6, f.x));
    }
    function stepShots() {
      var f = S.foe;
      for (var i = S.shots.length - 1; i >= 0; i--) {
        var s = S.shots[i]; s.t++; s.x += s.vx;
        if (f.down === 0 && Math.abs(s.x - f.x) < SHOT) { S.shotLog.push({ x0: s.x0, caster: s.caster, face: s.face, hitX: s.x, travel: Math.abs(s.x - s.x0), step: S.step }); hitFoe(12, 2, 'ember'); S.fx.push({ k: 'burst', x: s.x, y: s.y, t: 0 }); S.shots.splice(i, 1); continue; }
        if (s.x < -20 || s.x > 340) S.shots.splice(i, 1);
      }
      for (i = S.fx.length - 1; i >= 0; i--) { var e = S.fx[i]; e.t++; var life = e.k === 'ward' ? 40 : e.k === 'quake' ? 40 : e.k === 'spark' ? 12 : e.k === 'burst' ? 16 : 18; if (e.t > life) S.fx.splice(i, 1); }
      if (S.shake > 0) S.shake--;
    }
    function beatAt(ls) { var b = tape.marks[0]; for (var i = 0; i < tape.marks.length; i++) if (tape.marks[i].step <= ls) b = tape.marks[i]; return b.name; }

    // one fixed step. device = null -> the scripted tape plays; an object -> live input {left,right,up,down,a,b}
    function step(device) {
      var inp;
      if (device && !S.live) { S.live = true; }
      if (S.live) inp = device || { left: false, right: false, up: false, down: false, a: false, b: false };
      else {
        if (S.loopStep >= tape.frames.length) { loopReset(); }
        var fr = tape.frames[S.loopStep];
        inp = { left: fr.x < 0, right: fr.x > 0, up: fr.y > 0, down: fr.y < 0, a: fr.a, b: fr.b };
      }
      var rawA = !!inp.a, rawB = !!inp.b;
      inp.facing = S.hero.face;
      // the element: one call per fixed step, before the hero reads the input (the special's button comes back consumed)
      inp = mi.step(inp);
      S.step++; S.loopStep++;
      S.beat = S.live ? 'live' : beatAt(S.loopStep);
      stepHero(inp, rawA, rawB);
      stepFoe();
      stepShots();
    }
    function loopReset() {
      var keep = { step: S.step, loop: S.loop + 1 };
      S = newWorld(); S.step = keep.step; S.loop = keep.loop; mi.reset();
    }
    function restartScript() { var st = S.step; S = newWorld(); S.step = st; mi.reset(); }
    return {
      step: step, get S() { return S; }, mi: mi, tape: tape, events: events, hooks: hooks, restartScript: restartScript,
      heroRect: function () { var h = S.hero; return { x: h.x - 12, y: h.y - 36, w: 24, h: 36 }; },
      foeRect: foeRect, GROUND: GROUND, PUSH: PUSH, MOVES: MOVES, canAct: canAct
    };
  }
  root.MotionArena = { create: create, MOVES: MOVES, GROUND: GROUND };
})(typeof window !== 'undefined' ? window : this);
