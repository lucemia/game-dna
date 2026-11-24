/* GameDNA A-05 · Real-time sword combat · module v1 (plain script, no dependencies, one global)
 *
 *   const sc = GameDNA_SwordCombat.create({
 *     player: heroObject,                       // {x, y, w, h} feet box in world px (the module moves it only for knockback)
 *     solid: (x, y, w, h) => blocked,           // your wall test (tiles, NPCs, chests); default: nothing is solid
 *     bounds: { x: 0, y: 0, w: 512, h: 416 },   // world rect enemies and projectiles stay inside
 *     seed: 1, params: { dirs: 4, combo: 3, reach: 22 },
 *     onHit(ev) {}, onDefeat(enemy, ev) {}, onPlayerDown() {}, onHitStop(ms) {}   // all optional
 *   });
 *   sc.spawn({ id: 'slime-1', brain: 'chase', look: 'slime', x, y, hp: 3 });
 *   sc.update({ x: -1..1, y: -1..1, attack: pressedThisStep });   // once per fixed 60 Hz step
 *   if (sc.canMove()) walkHero();                                   // your own walking, skipped while swinging / knocked back
 *   sc.draw(ctx, -camX, viewTop - camY);  sc.drawHearts(ctx, 4, 4);  // world (enemies, drops, sword, fx), HUD
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.1', FRAME = 1000 / 60, TAU = Math.PI * 2;
  var DEFAULTS = {
    dirs: 4, antic: 4, active: 4, recover: 10, combo: 3, buffer: 12, link: 3, grace: 12,
    reach: 22, arc: 150, damage: 1, knockback: 3, friction: 0.8,
    iframes: 60, enemyIframes: 6, hitstop: 4, hearts: 3, heartHp: 2,
    telegraph: 24, enemySpeed: 1, overlay: 'off', sparks: 'on', drops: 'on', flash: 'on'
  };
  var DIRS = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
  // built-in looks: sprite size, feet box, default stats (hosts may pass their own art with options.art)
  var LOOKS = {
    slime:  { sw: 14, sh: 12, w: 10, h: 7,  hp: 3,  touch: 1, speed: 0.45, kb: 1,   drops: [{ kind: 'heart', chance: 0.3 }, { kind: 'gem', chance: 0.4 }] },
    hound:  { sw: 16, sh: 13, w: 12, h: 7,  hp: 3,  touch: 1, speed: 0.75, kb: 1,   drops: [{ kind: 'heart', chance: 0.3 }, { kind: 'gem', chance: 0.4 }] },
    boar:   { sw: 20, sh: 15, w: 14, h: 9,  hp: 5,  touch: 2, speed: 0.5,  kb: 0.7, drops: [{ kind: 'heart', chance: 0.5 }, { kind: 'gem', chance: 0.5 }] },
    archer: { sw: 14, sh: 17, w: 10, h: 7,  hp: 3,  touch: 1, speed: 0.6,  kb: 1,   drops: [{ kind: 'heart', chance: 0.35 }, { kind: 'gem', chance: 0.5 }] },
    warden: { sw: 30, sh: 32, w: 22, h: 12, hp: 38, touch: 2, speed: 0.55, kb: 0.25, drops: [{ kind: 'heart', chance: 1 }] }
  };
  var BRAIN_OF = { slime: 'wander', hound: 'chase', boar: 'charge', archer: 'shooter', warden: 'warden' };
  var BUILTIN = {
    id: 'pixel16', palette: { ink: '#06061a', paper: '#f8f0d8', team: { a: '#3a7cf0', b: '#e04848', n: '#c8c8d0' },
      fx: { hot: '#ff7a3a', cold: '#7ad8ff', heal: '#5ae07a', crit: '#ffd23a', white: '#ffffff' },
      overlay: { move: { fill: '#3a8cff', edge: '#a8d8ff' }, attack: { fill: '#ff3a3a', edge: '#ffb0a0' }, threat: { fill: '#ffb000', edge: '#ffe080' } },
      text: { main: '#ffffff', shadow: '#000000' } }
  };

  // ------------------------------------------------------------------ helpers
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sgn(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function normA(a) { a %= TAU; return a < 0 ? a + TAU : a; }
  function mulberry(seed) { var s = (seed >>> 0) || 1; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function quant(a, dirs) { var n = dirs === 8 ? 8 : 4, step = TAU / n; return normA(Math.round(normA(a) / step) * step); }
  function faceName(a) { a = normA(a); var q = Math.round(a / (Math.PI / 2)) % 4; return ['right', 'down', 'left', 'up'][q]; }
  function angleOf(f) { if (typeof f === 'number' && isFinite(f)) return f; return f in DIRS ? DIRS[f] : null; }

  function create(o) {
    o = o || {};
    var SKAPI = root.GameDNA_Skin, SK = null;
    try { SK = o.skin === false || !SKAPI ? null : SKAPI.resolve(o.skin); } catch (e) { SK = null; }
    var P = {}, k; for (k in DEFAULTS) P[k] = DEFAULTS[k];
    setParams(o.params || {});
    var rng = mulberry(num(o.seed, 1)), warned = {}, nextId = 1;
    var playerId = o.playerId || 'player';
    var stats = { updates: 0, frozen: 0, swings: 0, combos: 0, hits: 0, playerHits: 0, kills: 0, parries: 0, shots: 0, charges: 0, wallStuns: 0,
      pickups: 0, gems: 0, iframeBlocks: 0, iframeViolations: 0, stuck: 0, inWall: 0, unstuck: 0, earlyPresses: 0, buffered: 0, downs: 0 };
    var enemies = [], shots = [], drops = [], fx = [], frame = 0, freezeLeft = 0, pendingPress = false;
    var pl = { inv: 0, hurt: 0, kbx: 0, kby: 0, down: false, face: Math.PI / 2, lastHostFace: null, hp: P.hearts * P.heartHp, nextStep: 1, grace: 0 };
    var sw = null, hudRect = null, lastLookFace = {};

    function warn(key, msg) { if (warned[key]) return; warned[key] = 1; try { console.warn('[GameDNA_SwordCombat] ' + msg); } catch (e) { /* no console */ } }
    function call(name, a, b, c) {
      var f = o[name]; if (typeof f !== 'function') return undefined;
      try { return f(a, b, c); } catch (e) { warn('cb-' + name, name + '() threw: ' + (e && e.message)); return undefined; }
    }
    function setParams(p) {
      p = p || {};
      for (var key in p) if (key in DEFAULTS) {
        var v = p[key];
        if (typeof DEFAULTS[key] === 'number') { v = num(v, DEFAULTS[key]); } else v = String(v);
        P[key] = v;
      }
      P.dirs = +P.dirs === 8 ? 8 : 4; P.combo = clamp(Math.round(P.combo), 1, 3);
      P.antic = clamp(Math.round(P.antic), 0, 30); P.active = clamp(Math.round(P.active), 1, 30); P.recover = clamp(Math.round(P.recover), 0, 60);
      P.friction = clamp(P.friction, 0, 0.98); P.arc = clamp(P.arc, 20, 360);
    }

    // ---------------------------------------------------------------- player access
    function pObj() { var p = typeof o.player === 'function' ? call('player') : o.player; return p && isFinite(+p.x) && isFinite(+p.y) ? p : null; }
    function pBox() { var p = pObj(); if (!p) return null; return { x: +p.x, y: +p.y, w: num(p.w, 10), h: num(p.h, 8) }; }
    function getHp() { if (o.hp && typeof o.hp.get === 'function') { var v = num(call2(o.hp, 'get'), NaN); if (isFinite(v)) return v; } return pl.hp; }
    function getMax() { if (o.hp && typeof o.hp.max === 'function') { var v = num(call2(o.hp, 'max'), NaN); if (isFinite(v) && v > 0) return v; } else if (o.hp && isFinite(+o.hp.max)) return +o.hp.max; return P.hearts * P.heartHp; }
    function setHp(v) { v = clamp(v, 0, getMax()); if (o.hp && typeof o.hp.set === 'function') call2(o.hp, 'set', v); pl.hp = v; }
    function call2(obj, name, a) { try { return obj[name](a); } catch (e) { warn('hp-' + name, 'hp.' + name + '() threw: ' + (e && e.message)); return undefined; } }

    // ---------------------------------------------------------------- world / collision
    function bounds() { var b = typeof o.bounds === 'function' ? call('bounds') : o.bounds; return b && isFinite(+b.w) ? b : null; }
    function blocked(x, y, w, h, who) {
      var b = bounds();
      if (b && who !== 'player' && who !== 'ghost' && (x < b.x || y < b.y || x + w > b.x + b.w || y + h > b.y + b.h)) return true;   // bounds hold enemies and shots, not the player
      if (typeof o.solid === 'function') { try { return !!o.solid(x, y, w, h, who); } catch (e) { warn('solid', 'solid() threw: ' + (e && e.message)); } }
      return false;
    }
    // axis-separated slide in <= 1 px sub-steps (fast charges never tunnel through a wall)
    function slide(ent, dx, dy, who) {
      var moved = false, n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)))), sx = dx / n, sy = dy / n, w = num(ent.w, 10), h = num(ent.h, 8);
      var bx = false, by = false;
      for (var i = 0; i < n; i++) {
        if (sx && !bx) { if (!blocked(ent.x + sx, ent.y, w, h, who)) { ent.x += sx; moved = true; } else bx = true; }
        if (sy && !by) { if (!blocked(ent.x, ent.y + sy, w, h, who)) { ent.y += sy; moved = true; } else by = true; }
      }
      return { moved: moved, bx: bx, by: by };
    }
    function lineClear(x0, y0, x1, y1) {
      var d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 4);
      for (var i = 1; i < n; i++) { var t = i / n; if (blocked(x0 + (x1 - x0) * t - 1, y0 + (y1 - y0) * t - 1, 2, 2, 'line')) return false; }
      return true;
    }
    function centre(b) { return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }

    // ---------------------------------------------------------------- sword
    function frameData(step) {
      var fin = step === P.combo && P.combo > 1;
      return { step: step, fin: fin, antic: P.antic + (fin ? 2 : 0), active: P.active + (fin ? 1 : 0), recover: P.recover + (fin ? 6 : 0),
        reach: P.reach + (fin ? 4 : 0), arc: Math.min(360, P.arc + (fin ? 60 : 0)), dmg: P.damage * (fin ? 2 : 1), kb: P.knockback * (fin ? 1.5 : 1), sweep: step % 2 ? 1 : -1 };
    }
    function startSwing(step, aim) {
      var fd = frameData(step), dir = aim != null ? quant(aim, P.dirs) : pl.face;
      pl.face = dir;
      sw = { step: step, fd: fd, f: 0, dir: dir, a0: dir - fd.sweep * fd.arc / 2 * Math.PI / 180, hit: {}, buffered: false, total: fd.antic + fd.active + fd.recover };
      stats.swings++; if (step > 1) stats.combos++;
      event('swing', { step: step, dir: dir, finisher: fd.fin });
    }
    function swingPhase() { if (!sw) return null; var fd = sw.fd; return sw.f < fd.antic ? 'antic' : sw.f < fd.antic + fd.active ? 'active' : 'recover'; }
    function sweptRange() {   // [lo, hi] angles covered so far in the active phase
      var fd = sw.fd, k = sw.f - fd.antic + 1, frac = clamp(k / fd.active, 0, 1), span = fd.arc * Math.PI / 180;
      var a1 = sw.a0 + fd.sweep * span * frac;
      return { a0: sw.a0, a1: a1, cur: a1 };
    }
    function inSector(px, py, cx, cy, reach, a0, a1) {
      var d = Math.hypot(px - cx, py - cy); if (d > reach) return false; if (d < 5) return true;
      var lo = Math.min(a0, a1), hi = Math.max(a0, a1); if (hi - lo >= TAU - 1e-6) return true;
      return normA(Math.atan2(py - cy, px - cx) - lo) <= hi - lo + 1e-6;
    }
    function sectorHitsBox(c, reach, a0, a1, b) {
      var qx = clamp(c.x, b.x, b.x + b.w), qy = clamp(c.y, b.y, b.y + b.h);
      var pts = [[qx, qy], [b.x + b.w / 2, b.y + b.h / 2], [b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h],
        [b.x + b.w / 2, b.y], [b.x + b.w / 2, b.y + b.h], [b.x, b.y + b.h / 2], [b.x + b.w, b.y + b.h / 2]];
      for (var i = 0; i < pts.length; i++) if (inSector(pts[i][0], pts[i][1], c.x, c.y, reach, a0, a1)) return { x: pts[i][0], y: pts[i][1] };
      return null;
    }
    // hurtbox of an enemy: its feet box grown upward a little (sprites stand taller than their feet)
    function hurtbox(e) { var up = Math.min(6, Math.round(e.sh * 0.3)); return { x: e.x - 1, y: e.y - up, w: e.w + 2, h: e.h + up + 1 }; }

    function stepPlayer(inp, press) {
      var p = pObj(); if (!p) return;
      if (pl.inv > 0) pl.inv--;
      if (pl.hurt > 0) pl.hurt--;
      if (Math.abs(pl.kbx) > 0.05 || Math.abs(pl.kby) > 0.05) { slide(p, pl.kbx, pl.kby, 'player'); pl.kbx *= P.friction; pl.kby *= P.friction; }
      else { pl.kbx = 0; pl.kby = 0; }
      if (pl.down) { sw = null; return; }
      if (getHp() <= 0) { down(); return; }
      // facing: explicit face > held direction (when free) > the host object's own face string
      var ix = num(inp.x, 0), iy = num(inp.y, 0), hostFace = angleOf(p.face), ef = angleOf(inp.face);
      if (ef != null) { if (!sw) pl.face = quant(ef, P.dirs); }
      else if ((ix || iy) && !sw) {
        if (P.dirs === 4 && ix && iy && hostFace != null) pl.face = quant(hostFace, 4);
        else pl.face = quant(Math.atan2(iy, ix), P.dirs);
      } else if (hostFace != null && hostFace !== pl.lastHostFace && !sw) pl.face = quant(hostFace, P.dirs);
      pl.lastHostFace = hostFace;
      var aim = inp.aim && (inp.aim.x || inp.aim.y) ? Math.atan2(num(inp.aim.y, 0), num(inp.aim.x, 0)) : null;
      if (sw) {
        var left = sw.total - sw.f;
        if (press) { if (left <= P.buffer && sw.step < P.combo) { if (!sw.buffered) stats.buffered++; sw.buffered = true; sw.aim = aim; } else stats.earlyPresses++; }
        if (swingPhase() === 'active') meleeFrame();
        sw.f++;
        var fd = sw.fd, end = sw.buffered ? fd.antic + fd.active + Math.min(fd.recover, P.link) : sw.total;
        if (sw.f >= end) {
          var s = sw.step, bufAim = sw.aim;
          if (sw.buffered && s < P.combo) { sw = null; startSwing(s + 1, bufAim); }
          else { sw = null; pl.nextStep = s < P.combo ? s + 1 : 1; pl.grace = s < P.combo ? P.grace : 0; }
        }
        return;
      }
      if (pl.grace > 0 && --pl.grace === 0) pl.nextStep = 1;
      if (press && pl.hurt === 0 && Math.abs(pl.kbx) + Math.abs(pl.kby) < 0.6) { var st = pl.grace > 0 ? pl.nextStep : 1; pl.grace = 0; startSwing(st, aim); }
    }
    function meleeFrame() {
      var pb = pBox(); if (!pb) return;
      var c = centre(pb), r = sweptRange(), fd = sw.fd;
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.dying || e.hp <= 0 || sw.hit[e.id] || e.inv > 0) continue;
        var at = sectorHitsBox(c, fd.reach, r.a0, r.a1, hurtbox(e));
        if (at) { sw.hit[e.id] = 1; meleeHit(e, at, c); }
      }
      for (var j = shots.length - 1; j >= 0; j--) {
        var s = shots[j];
        if (inSector(s.x, s.y, c.x, c.y, fd.reach + s.r, r.a0, r.a1)) { shots.splice(j, 1); stats.parries++; spark(s.x, s.y, 'parry', 5); event('parry', { x: s.x, y: s.y }); }
      }
    }
    function meleeHit(e, at, c) {
      var fd = sw.fd, ec = centre(e), dx = ec.x - c.x, dy = ec.y - c.y, d = Math.hypot(dx, dy) || 1;
      var ev = { kind: 'melee', source: playerId, target: e.id, amount: fd.dmg, combo: sw.step, finisher: fd.fin, at: { x: at.x, y: at.y },
        dir: { x: dx / d, y: dy / d }, frame: frame };
      if (!applyToEnemy(e, ev, fd.kb)) return;
      spark(at.x, at.y, ev.killed || fd.fin ? 'crit' : 'hit', ev.killed || fd.fin ? 8 : 5);
    }
    // the one enemy hit site (melee and host damage)
    function applyToEnemy(e, ev, kb) {
      call('beforeHit', ev); if (ev.cancel) return false;
      ev.amount = Math.max(0, num(ev.amount, 0));
      if (e.inv > 0 && ev.kind !== 'host') return false;
      ev.hpBefore = e.hp; e.hp = Math.max(0, e.hp - ev.amount); ev.hpAfter = e.hp; ev.killed = e.hp <= 0; ev.max = e.maxHp;
      ev.strength = ev.killed || ev.finisher ? 'finisher' : ev.amount >= 2 ? 'heavy' : 'light';
      ev.anchor = anchor(e.id);
      e.inv = P.enemyIframes; e.flash = 6; stats.hits++;
      var k = (kb == null ? P.knockback : kb) * e.kbScale;
      if (k > 0) { e.kbx = ev.dir.x * k; e.kby = ev.dir.y * k; }
      e.stun = Math.max(e.stun, e.boss ? 6 : 14);
      if (e.state === 'tele' && !e.boss) { e.state = 'idle'; e.st = 20; }
      if (ev.killed) { e.dying = 22; stats.kills++; rollDrops(e); if (e.boss) { for (var si = 0; si < shots.length; si++) spark(shots[si].x, shots[si].y, 'dust', 3); shots.length = 0; } }
      freeze(ev.killed || ev.finisher ? P.hitstop * 2 : P.hitstop, ev);
      call('onHit', ev);
      if (ev.killed) { poof(e); call('onDefeat', e, ev); event('defeat', { id: e.id }); }
      return true;
    }
    function hurtPlayer(amount, src, kind, dir, at) {
      var p = pObj(); if (!p || pl.down) return false;
      if (pl.inv > 0) { stats.iframeBlocks++; return false; }
      var pb = pBox(), ev = { kind: kind, source: src, target: playerId, amount: amount, at: at || centre(pb), dir: dir, frame: frame };
      call('beforeHit', ev); if (ev.cancel) return false;
      ev.amount = Math.max(0, num(ev.amount, 0));
      if (pl.inv > 0) { stats.iframeViolations++; }
      ev.hpBefore = getHp(); setHp(ev.hpBefore - ev.amount); ev.hpAfter = getHp(); ev.killed = ev.hpAfter <= 0; ev.max = getMax();
      ev.strength = ev.killed ? 'finisher' : ev.amount >= 2 ? 'heavy' : 'light'; ev.anchor = anchor(playerId);
      pl.inv = P.iframes; pl.hurt = 12; sw = null; pl.grace = 0; pl.nextStep = 1;
      var k = P.knockback * 1.2; pl.kbx = dir.x * k; pl.kby = dir.y * k;
      stats.playerHits++;
      spark(ev.at.x, ev.at.y, 'hurt', 5);
      freeze(ev.killed ? P.hitstop * 2 : P.hitstop + 2, ev);
      call('onHit', ev);
      if (ev.killed) down();
      return true;
    }
    function down() { if (pl.down) return; pl.down = true; sw = null; stats.downs++; event('down', {}); call('onPlayerDown'); }
    function freeze(frames, ev) {
      frames = Math.max(0, Math.round(frames)); if (!frames) return;
      if (typeof o.onHitStop === 'function') call('onHitStop', Math.round(frames * FRAME), ev);
      else freezeLeft = Math.max(freezeLeft, frames);
    }
    function event(type, data) { data = data || {}; data.type = type; data.frame = frame; call('onEvent', data); }

    // ---------------------------------------------------------------- enemies
    function spawn(def) {
      def = def || {};
      var look = LOOKS[def.look] ? def.look : (def.look ? def.look : 'slime'), L = LOOKS[look] || LOOKS.slime;
      var e = {
        id: def.id != null ? def.id : 'enemy-' + (nextId++), look: look, brain: def.brain || BRAIN_OF[look] || 'wander',
        x: num(def.x, 0), y: num(def.y, 0), w: num(def.w, L.w), h: num(def.h, L.h), sw: num(def.sw, L.sw), sh: num(def.sh, L.sh),
        hp: num(def.hp, L.hp), maxHp: 0, touch: num(def.touch, L.touch), speed: num(def.speed, L.speed), kbScale: num(def.kb, L.kb),
        sight: num(def.sight, 72), drops: def.drops === undefined ? L.drops : def.drops, boss: !!def.boss || look === 'warden',
        home: def.home || null, data: def.data, state: 'idle', st: 0, t: 0, anim: Math.floor(rng() * 32), face: 1, dx: 0, dy: 0,
        inv: 0, flash: 0, stun: 0, kbx: 0, kby: 0, dying: 0, cd: 0, lastX: 0, lastY: 0, still: 0, unstick: 0, sx: 0, sy: 0
      };
      e.maxHp = num(def.maxHp, e.hp); e.lastX = e.x; e.lastY = e.y; e.sx = e.x; e.sy = e.y;
      var b = brainOf(e); try { if (b && b.init) b.init(e, api); } catch (err) { warn('brain-init', 'brain ' + e.brain + ' init threw: ' + err.message); }
      if (blocked(e.x, e.y, e.w, e.h, e)) pushOut(e);
      enemies.push(e); return e;
    }
    function brainOf(e) { var b = typeof e.brain === 'object' ? e.brain : BRAINS[e.brain]; if (!b) { warn('brain-' + e.brain, 'unknown brain "' + e.brain + '", using wander'); b = BRAINS.wander; } return b; }
    function pushOut(e) {
      for (var r = 1; r <= 48; r++) for (var a = 0; a < 16; a++) {
        var x = e.x + Math.round(Math.cos(a / 16 * TAU) * r), y = e.y + Math.round(Math.sin(a / 16 * TAU) * r);
        if (!blocked(x, y, e.w, e.h, e)) { e.x = x; e.y = y; return true; }
      }
      return false;
    }
    // brain API: what a behaviour may read and do (small, reusable state machines use only this)
    var api = {
      params: function () { return P; },
      rng: function () { return rng(); }, int: function (a, b) { return a + Math.floor(rng() * (b - a + 1)); },
      player: function () { var b = pBox(); if (!b) return null; var c = centre(b); return { x: b.x, y: b.y, w: b.w, h: b.h, cx: c.x, cy: c.y, inv: pl.inv, down: pl.down }; },
      to: function (e) { var p = api.player(); if (!p) return { dx: 0, dy: 0, d: 1e9 }; var c = centre(e), dx = p.cx - c.x, dy = p.cy - c.y; return { dx: dx, dy: dy, d: Math.hypot(dx, dy) }; },
      move: function (e, dx, dy) {
        var s = P.enemySpeed; e.want = (e.want || 0) + Math.hypot(dx, dy) * s; var r = slide(e, dx * s, dy * s, e);
        if (dx) e.face = dx > 0 ? 1 : -1; return r;
      },
      clear: function (e) { var p = api.player(); if (!p) return false; var c = centre(e); return lineClear(c.x, c.y, p.cx, p.cy); },
      set: function (e, state, t) { e.state = state; e.st = t || 0; e.t = 0; },
      shoot: function (e, ang, speed, opt) {
        opt = opt || {}; var c = centre(e);
        shots.push({ id: 'shot-' + (nextId++), x: c.x + Math.cos(ang) * 6, y: c.y - 3 + Math.sin(ang) * 6, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
          r: num(opt.r, 3), dmg: num(opt.dmg, 1), owner: e.id, life: num(opt.life, 240), kind: opt.kind || 'seed', t: 0 });
        stats.shots++; event('shoot', { id: e.id });
      },
      blockedAhead: function (e, dx, dy, dist) { return blocked(e.x + dx * dist, e.y + dy * dist, e.w, e.h, e); },
      laneLength: function (e, dx, dy, max) { var n = 0; while (n < max && !blocked(e.x + dx * (n + 2), e.y + dy * (n + 2), e.w, e.h, e)) n += 2; return n; },
      event: function (type, e, data) { data = data || {}; data.id = e.id; event(type, data); },
      centre: function () { var b = bounds(); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null; },
      wanderStep: function (e, spd) { return BRAINS.wander.step(e, api, spd); }
    };
    // a 4-way walk direction toward (dx, dy), or the free perpendicular when blocked
    function pickDir(dx, dy) { return Math.abs(dx) > Math.abs(dy) ? [sgn(dx), 0] : [0, sgn(dy) || 1]; }

    var BRAINS = {
      // idle <-> walk in a random 4-way direction; turns at walls; optional leash to e.home
      wander: {
        init: function (e, B) { B.set(e, 'idle', B.int(20, 60)); },
        step: function (e, B, spd) {
          spd = spd || e.speed;
          if (e.state !== 'walk' && e.state !== 'idle') B.set(e, 'idle', B.int(20, 50));
          if (e.state === 'idle') { if (--e.st <= 0) { var d = [[1, 0], [-1, 0], [0, 1], [0, -1]][B.int(0, 3)]; e.dx = d[0]; e.dy = d[1]; B.set(e, 'walk', B.int(30, 80)); } return; }
          if (e.home && Math.hypot(e.x - e.home.x, e.y - e.home.y) > num(e.home.r, 48)) { var h = pickDir(e.home.x - e.x, e.home.y - e.y); e.dx = h[0]; e.dy = h[1]; }
          var r = B.move(e, e.dx * spd, e.dy * spd);
          if (!r.moved) { var d2 = [[e.dy, e.dx], [-e.dy, -e.dx], [-e.dx, -e.dy]][B.int(0, 2)]; e.dx = d2[0]; e.dy = d2[1]; }
          if (--e.st <= 0) B.set(e, 'idle', B.int(20, 60));
        }
      },
      // wander until the player is in sight, then home in (8-way); detours around walls; backs off after a contact hit
      chase: {
        init: function (e, B) { B.set(e, 'idle', B.int(10, 40)); },
        step: function (e, B) {
          var p = B.player(), to = B.to(e);
          if (e.state === 'back') { B.move(e, -sgn(to.dx) * e.speed, -sgn(to.dy) * e.speed); if (--e.st <= 0) B.set(e, 'idle', 10); return; }
          if (e.state === 'detour') { var r0 = B.move(e, e.dx * e.speed, e.dy * e.speed); if (--e.st <= 0 || !r0.moved) B.set(e, 'chase'); return; }
          var sees = p && !p.down && to.d < e.sight && (to.d < 24 || B.clear(e));
          if (e.state === 'chase') {
            if (!p || p.down || to.d > e.sight * 1.6) { B.set(e, 'idle', 30); return; }
            var len = to.d || 1, mx = to.dx / len, my = to.dy / len;
            if (Math.abs(mx) < 0.2) mx = 0; if (Math.abs(my) < 0.2) my = 0;
            var r = B.move(e, mx * e.speed, my * e.speed);
            if (!r.moved) { var d = Math.abs(to.dx) > Math.abs(to.dy) ? [0, B.rng() < 0.5 ? 1 : -1] : [B.rng() < 0.5 ? 1 : -1, 0]; e.dx = d[0]; e.dy = d[1]; B.set(e, 'detour', B.int(16, 30)); }
            return;
          }
          if (sees) { B.set(e, 'chase'); B.event('spot', e); return; }
          B.wanderStep(e, e.speed * 0.6);
        }
      },
      // wander; when lined up with the player on an axis: telegraph (shake + mark), charge straight, stun on a wall
      charge: {
        init: function (e, B) { B.set(e, 'idle', B.int(20, 60)); e.cd = 60; },
        step: function (e, B) {
          var p = B.player(), to = B.to(e), Pm = B.params();
          if (e.cd > 0) e.cd--;
          if (e.state === 'tele') {
            if (--e.st <= 0) { B.set(e, 'charge', 100); B.event('charge', e); stats.charges++; }
            return;
          }
          if (e.state === 'charge') {
            var spd = 2.6, r = B.move(e, e.cdx * spd, e.cdy * spd);
            if ((e.cdx && r.bx) || (e.cdy && r.by) || !r.moved) { B.set(e, 'stun', 54); e.cd = 70; stats.wallStuns++; B.event('wall', e, { dx: e.cdx, dy: e.cdy }); return; }
            if (--e.st <= 0) { B.set(e, 'rest', 30); e.cd = 60; }
            return;
          }
          if (e.state === 'stun' || e.state === 'rest') { if (--e.st <= 0) B.set(e, 'idle', B.int(10, 30)); return; }
          if (p && !p.down && e.cd <= 0 && to.d < 120) {
            var ax = Math.abs(to.dy) < 7, ay = Math.abs(to.dx) < 7;
            if ((ax || ay) && B.clear(e)) {
              e.cdx = ax ? sgn(to.dx) : 0; e.cdy = ay && !ax ? sgn(to.dy) : 0; if (e.cdx) e.face = e.cdx;
              e.lane = B.laneLength(e, e.cdx, e.cdy, 240);
              B.set(e, 'tele', Pm.telegraph); B.event('telegraph', e, { dx: e.cdx, dy: e.cdy }); return;
            }
          }
          B.wanderStep(e, e.speed);
        }
      },
      // keep a distance band from the player, strafe, aim (telegraph line) and shoot
      shooter: {
        init: function (e, B) { B.set(e, 'idle', B.int(10, 40)); e.cd = B.int(40, 90); e.strafe = B.rng() < 0.5 ? 1 : -1; },
        step: function (e, B) {
          var p = B.player(), to = B.to(e), Pm = B.params(), near = 44, far = 84;
          if (e.cd > 0) e.cd--;
          if (e.state === 'aim') {
            if (e.st > 6) { e.aim = Math.atan2(to.dy, to.dx); if (to.dx) e.face = sgn(to.dx); }   // tracks (and looks at the player), then locks for the last 6 frames
            if (--e.st <= 0) { B.shoot(e, e.aim, 1.5, { dmg: 1 }); e.cd = B.int(80, 120); B.set(e, 'keep'); }
            return;
          }
          if (!p || p.down || to.d > 130) { B.wanderStep(e, e.speed * 0.6); return; }
          if (e.state !== 'keep') B.set(e, 'keep');
          var len = to.d || 1, ux = to.dx / len, uy = to.dy / len, mx = 0, my = 0;
          if (to.d < near) { mx = -ux; my = -uy; } else if (to.d > far) { mx = ux; my = uy; } else { mx = -uy * e.strafe * 0.5; my = ux * e.strafe * 0.5; }
          if ((e.t % 90) === 89) e.strafe = -e.strafe;
          var r = B.move(e, mx * e.speed, my * e.speed);
          if (!r.moved && (mx || my)) { e.strafe = -e.strafe; B.move(e, -my * e.speed, mx * e.speed); }
          if (e.cd <= 0 && to.d < 110 && B.clear(e)) { e.aim = Math.atan2(to.dy, to.dx); if (to.dx) e.face = sgn(to.dx); B.set(e, 'aim', Math.round(Pm.telegraph * 0.75)); B.event('aim', e); }
        }
      },
      // boss: walk toward the player, then charge (telegraphed, any angle) or fire an aimed volley (only from >= 48 px);
      // stunned on a wall, then it backs off toward the room centre; a hero closer than 24 px gets shoved and the boss backs off;
      // below half HP it rages: faster, shorter stuns, 5-shot volleys, a double charge
      warden: {
        init: function (e, B) { B.set(e, 'walk', 70); e.cycle = 0; e.raged = false; },
        step: function (e, B) {
          var p = B.player(), to = B.to(e), Pm = B.params(), rage = e.hp <= e.maxHp / 2, sp = e.speed * (rage ? 1.35 : 1);
          if (rage && !e.raged) { e.raged = true; B.event('rage', e); }
          if (!p || p.down) { B.set(e, 'walk', 30); return; }
          var len = to.d || 1;
          switch (e.state) {
            case 'walk': {
              if (to.d < 24 && e.t > 10) { B.set(e, 'retreat', 34); return; }
              if (to.d > 34) B.move(e, to.dx / len * sp, to.dy / len * sp);
              if (to.dx) e.face = sgn(to.dx);
              if (--e.st <= 0) {
                e.cycle++;
                if (e.cycle % 2 || to.d < 48) { var a = Math.atan2(to.dy, to.dx); e.cdx = Math.cos(a); e.cdy = Math.sin(a); B.set(e, 'tele', Pm.telegraph + (rage ? 0 : 8)); e.lane = B.laneLength(e, e.cdx, e.cdy, 260); B.event('telegraph', e, { dx: e.cdx, dy: e.cdy }); }
                else { B.set(e, 'aim', rage ? 22 : 26); e.aim = Math.atan2(to.dy, to.dx); B.event('aim', e); }
              }
              return;
            }
            case 'retreat': {   // back off toward the room centre (straight away from the hero when already there or without bounds)
              var c = B.centre(), ec = { x: e.x + e.w / 2, y: e.y + e.h / 2 }, vx = c ? c.x - ec.x : -to.dx, vy = c ? c.y - ec.y : -to.dy;
              if (!c || Math.hypot(vx, vy) < 8) { vx = -to.dx; vy = -to.dy; }
              var l2 = Math.hypot(vx, vy) || 1, r0 = B.move(e, vx / l2 * 1.5, vy / l2 * 1.5);
              if (!r0.moved) B.move(e, -to.dx / len * 1.5, -to.dy / len * 1.5);
              if (--e.st <= 0) B.set(e, 'walk', rage ? 20 : 34);
              return;
            }
            case 'tele': if (--e.st <= 0) { B.set(e, 'charge', 110); stats.charges++; B.event('charge', e); } return;
            case 'charge': {
              var r = B.move(e, e.cdx * (rage ? 2.7 : 2.3), e.cdy * (rage ? 2.7 : 2.3));
              if (!r.moved || (Math.abs(e.cdx) > 0.3 && r.bx) || (Math.abs(e.cdy) > 0.3 && r.by)) {
                stats.wallStuns++; B.event('wall', e, { dx: e.cdx, dy: e.cdy });
                if (rage && !e.again) { e.again = true; var a2 = Math.atan2(to.dy, to.dx); e.cdx = Math.cos(a2); e.cdy = Math.sin(a2); e.lane = B.laneLength(e, e.cdx, e.cdy, 260); B.set(e, 'tele', 16); B.event('telegraph', e, { dx: e.cdx, dy: e.cdy }); return; }
                e.again = false; B.set(e, 'stun', rage ? 36 : 45);
              } else if (--e.st <= 0) { e.again = false; B.set(e, 'walk', 50); }
              return;
            }
            case 'stun': if (--e.st <= 0) B.set(e, 'retreat', 40); return;
            case 'aim': {
              if (e.st > 8) { e.aim = Math.atan2(to.dy, to.dx); if (to.dx) e.face = sgn(to.dx); }
              if (to.d < 40 && e.st > 6) { B.set(e, 'retreat', 30); return; }   // never fire point-blank: back off first
              if (--e.st <= 0) { var n = rage ? 5 : 3; for (var i = 0; i < n; i++) B.shoot(e, e.aim + (i - (n - 1) / 2) * 0.3, rage ? 1.6 : 1.35, { dmg: 1, r: 4, kind: 'orb' }); B.set(e, 'walk', rage ? 40 : 60); }
              return;
            }
            default: B.set(e, 'walk', 40);
          }
        }
      }
    };

    if (o.brains && typeof o.brains === 'object') for (var bn in o.brains) if (o.brains[bn] && typeof o.brains[bn].step === 'function') BRAINS[bn] = o.brains[bn];

    function stepEnemies() {
      var pb = pBox();
      for (var i = enemies.length - 1; i >= 0; i--) {
        var e = enemies[i];
        e.anim++;
        if (e.dying) { if (--e.dying <= 0) enemies.splice(i, 1); continue; }
        if (e.inv > 0) e.inv--; if (e.flash > 0) e.flash--;
        if (Math.abs(e.kbx) > 0.05 || Math.abs(e.kby) > 0.05) { slide(e, e.kbx, e.kby, e); e.kbx *= P.friction; e.kby *= P.friction; } else { e.kbx = 0; e.kby = 0; }
        e.want = 0;
        var x0 = e.x, y0 = e.y;
        if (e.stun > 0) { e.stun--; }
        else {
          e.t++;
          if (e.unstick > 0) { e.unstick--; api.move(e, e.dx * Math.max(0.5, e.speed), e.dy * Math.max(0.5, e.speed)); }
          else { var b = brainOf(e); try { b.step(e, api); } catch (err) { warn('brain-' + e.brain, 'brain ' + e.brain + ' threw: ' + err.message); } }
        }
        // stuck watchdog: a brain that keeps asking to move but never gets anywhere is sent off in a free direction
        if (e.want > 0.05 && Math.hypot(e.x - x0, e.y - y0) < 0.01) e.still++; else if (e.want > 0.05) e.still = 0;
        if (e.still > 45) {
          stats.unstuck++; e.still = 0;
          var opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(function (d) { return !blocked(e.x + d[0] * 3, e.y + d[1] * 3, e.w, e.h, e); });
          if (opts.length) { var d = opts[Math.floor(rng() * opts.length)]; e.dx = d[0]; e.dy = d[1]; e.unstick = 24; if (e.state === 'charge') { e.state = 'stun'; e.st = 30; } }
        }
        if (blocked(e.x, e.y, e.w, e.h, e)) { stats.inWall++; pushOut(e); }
        // contact damage (stunned, dying and knocked-back enemies do not bite)
        if (pb && e.touch > 0 && e.stun <= 0 && !pl.down && overlap(e, pb)) {
          var c = centre(e), pc = centre(pb), dx = pc.x - c.x, dy = pc.y - c.y, d2 = Math.hypot(dx, dy) || 1;
          var dmg = e.state === 'charge' ? e.touch + (e.boss ? 0 : 1) : e.touch;
          if (hurtPlayer(dmg, e.id, e.state === 'charge' ? 'charge' : 'contact', { x: dx / d2, y: dy / d2 }, { x: (c.x + pc.x) / 2, y: (c.y + pc.y) / 2 })) {
            if (e.boss) { pl.kbx *= 1.8; pl.kby *= 1.8; if (e.state === 'walk') api.set(e, 'retreat', 30); }
            if (e.brain === 'chase') api.set(e, 'back', 24);
            if (e.state === 'charge') api.set(e, 'rest', 30);
          }
        }
      }
      // light separation so enemies never stack into one sprite
      for (var a = 0; a < enemies.length; a++) for (var bb = a + 1; bb < enemies.length; bb++) {
        var A = enemies[a], Bn = enemies[bb]; if (A.dying || Bn.dying || !overlap(A, Bn)) continue;
        var ca = centre(A), cb = centre(Bn), sx = sgn(cb.x - ca.x) || 1, sy = sgn(cb.y - ca.y);
        if (!A.boss) slide(A, -sx * 0.5, -sy * 0.5, A); if (!Bn.boss) slide(Bn, sx * 0.5, sy * 0.5, Bn);
      }
    }
    function stepShots() {
      var pb = pBox();
      for (var i = shots.length - 1; i >= 0; i--) {
        var s = shots[i]; s.t++;
        s.x += s.vx; s.y += s.vy;
        if (--s.life <= 0 || blocked(s.x - 1, s.y - 1, 2, 2, 'shot')) { shots.splice(i, 1); spark(s.x, s.y, 'dust', 3); continue; }
        if (pb && !pl.down) {
          var qx = clamp(s.x, pb.x, pb.x + pb.w), qy = clamp(s.y, pb.y - 6, pb.y + pb.h);   // hurtbox reaches a little above the feet box
          if (Math.hypot(s.x - qx, s.y - qy) <= s.r) {
            var v = Math.hypot(s.vx, s.vy) || 1;
            if (hurtPlayer(s.dmg, s.owner, 'projectile', { x: s.vx / v, y: s.vy / v }, { x: s.x, y: s.y }) || pl.inv > 0) { shots.splice(i, 1); spark(s.x, s.y, 'dust', 3); }
          }
        }
      }
    }
    function rollDrops(e) {
      if (P.drops === 'off' || !e.drops) return;
      var list = Array.isArray(e.drops) ? e.drops : [e.drops], c = centre(e);
      for (var i = 0; i < list.length; i++) {
        var d = typeof list[i] === 'string' ? { kind: list[i], chance: 1 } : list[i];
        if (rng() < num(d.chance, 1)) { drop(d.kind, c.x, c.y, d); return; }
      }
    }
    function drop(kind, x, y, opt) {
      opt = opt || {};
      var bb = bounds(); if (bb) { x = clamp(x, bb.x + 10, bb.x + bb.w - 10); y = clamp(y, bb.y + 10, bb.y + bb.h - 10); }
      for (var tries = 0; tries < 12 && blocked(x - 4, y - 4, 8, 8, 'drop'); tries++) { var ang = tries * 2.4; x += Math.cos(ang) * 6; y += Math.sin(ang) * 6; }
      var d = { id: opt.id || 'drop-' + (nextId++), kind: kind || 'gem', x: x, y: y, t: 0, life: opt.life != null ? opt.life : (kind === 'heart' || kind === 'gem' ? 600 : Infinity), value: num(opt.value, 1), data: opt.data };
      drops.push(d); event('drop', { kind: d.kind, id: d.id }); return d;
    }
    function stepDrops() {
      var pb = pBox();
      for (var i = drops.length - 1; i >= 0; i--) {
        var d = drops[i]; d.t++;
        if (d.t > d.life) { drops.splice(i, 1); continue; }
        if (pb && !pl.down && d.t > 12 && overlap({ x: d.x - 5, y: d.y - 5, w: 10, h: 10 }, pb)) {
          var r = call('onPickup', d);
          if (r === false) continue;
          if (d.kind === 'heart') setHp(getHp() + P.heartHp * d.value); else if (d.kind === 'gem') stats.gems += d.value;
          stats.pickups++; drops.splice(i, 1); spark(d.x, d.y, d.kind === 'heart' ? 'heal' : 'gem', 5); event('pickup', { kind: d.kind, id: d.id });
        }
      }
    }
    function spark(x, y, kind, n) {
      if (P.sparks === 'off' && kind !== 'poof') return;
      for (var i = 0; i < n; i++) { var a = rng() * TAU, v = 0.6 + rng() * 1.4; fx.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.3, life: 10 + Math.floor(rng() * 8), max: 18, kind: kind }); }
    }
    function poof(e) { var c = centre(e); fx.push({ ring: true, x: c.x, y: c.y - e.sh / 3, life: 16, max: 16, kind: 'poof', r: Math.max(e.sw, e.sh) / 2 }); spark(c.x, c.y - 3, 'poof', 6); }
    function stepFx() { for (var i = fx.length - 1; i >= 0; i--) { var f = fx[i]; if (!f.ring) { f.x += f.vx; f.y += f.vy; f.vx *= 0.88; f.vy = f.vy * 0.88 + 0.05; } if (--f.life <= 0) fx.splice(i, 1); } }

    // ---------------------------------------------------------------- update
    function update(inp) {
      try {
        inp = inp || {};
        stats.updates++;
        if (freezeLeft > 0) { freezeLeft--; stats.frozen++; if (inp.attack) pendingPress = true; return false; }
        frame++;
        var press = !!inp.attack || pendingPress; pendingPress = false;
        stepPlayer(inp, press);
        stepEnemies();
        stepShots();
        stepDrops();
        stepFx();
      } catch (e) { warn('update', 'update() error: ' + (e && e.message)); }
      return true;
    }

    // ---------------------------------------------------------------- autopilot
    // Suggests this step's input {x, y, attack, aim, target}. It scores 9 moves by the danger met ALONG the path over the next
    // `horizon` frames (projectiles, telegraphed and running charges, enemy bodies), plus distance to the fight spot or waypoint.
    function autopilot(opt) {
      opt = opt || {};
      var out = { x: 0, y: 0, attack: false, aim: null, target: null, danger: 0 };
      try {
        var pb = pBox(); if (!pb || pl.down) return out;
        var spd = num(opt.speed, 1.25), H = num(opt.horizon, 18), engage = num(opt.engage, 80), c = centre(pb);
        var live = enemies.filter(function (e) { return !e.dying && e.hp > 0; });
        var tgt = null, best = 1e9;
        for (var i = 0; i < live.length; i++) {
          var ec = centre(live[i]), d = Math.hypot(ec.x - c.x, ec.y - c.y);
          if (d < engage && d < best && (d < 28 || lineClear(c.x, c.y, ec.x, ec.y))) { best = d; tgt = live[i]; }
        }
        if (opt.target) { var ft = enemyById(opt.target); if (ft && !ft.dying) tgt = ft; }
        var fd = frameData(sw ? sw.step : (pl.grace > 0 ? pl.nextStep : 1)), reach = fd.reach;
        if (sw && swingPhase() !== 'recover') {
          if (tgt && sw.step < P.combo && sw.total - sw.f <= P.buffer && !sw.buffered) {
            var tc0 = centre(tgt); if (sectorHitsBox(c, frameData(sw.step + 1).reach - 2, sw.dir - 1.2, sw.dir + 1.2, hurtbox(tgt))) out.attack = true;
            out.aim = { x: tc0.x - c.x, y: tc0.y - c.y };
          }
          out.target = tgt && tgt.id; return out;
        }
        // where to stand when fighting: on the target's axis (4-way) at ~60% reach
        var spot = null;
        if (tgt) {
          var tb = hurtbox(tgt), tc = { x: tb.x + tb.w / 2, y: tb.y + tb.h / 2 }, vx = c.x - tc.x, vy = c.y - tc.y, stand = reach * 0.55 + Math.max(tb.w, tb.h) / 2;
          if (tgt.state === 'stun' || tgt.state === 'aim' || tgt.state === 'rest') stand = reach * 0.45 + Math.max(tb.w, tb.h) / 2;
          if (P.dirs === 4) { if (Math.abs(vx) > Math.abs(vy)) spot = { x: tc.x + sgn(vx) * stand, y: tc.y }; else spot = { x: tc.x, y: tc.y + (sgn(vy) || 1) * stand }; }
          else { var l = Math.hypot(vx, vy) || 1; spot = { x: tc.x + vx / l * stand, y: tc.y + vy / l * stand }; }
        }
        var goal = spot || (opt.next ? { x: num(opt.next.x, c.x), y: num(opt.next.y, c.y) } : null);
        var moves = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]], bestM = null, bestS = 1e9;
        for (var m = 0; m < moves.length; m++) {
          var mx = moves[m][0], my = moves[m][1], k2 = mx && my ? 0.72 : 1, ghost = { x: pb.x, y: pb.y, w: pb.w, h: pb.h }, danger = 0, near = 1e9;
          if (goal) near = Math.hypot(c.x - goal.x, c.y - goal.y);
          for (var t = 1; t <= H; t++) {
            if (mx || my) slide(ghost, mx * spd * k2, my * spd * k2, 'ghost');
            danger += dangerAt(ghost, t) * (1 - t / (H * 2));
            if (goal) { var gc0 = centre(ghost); near = Math.min(near, Math.hypot(gc0.x - goal.x, gc0.y - goal.y) + t * 0.05); }   // closest approach, so short hops never overshoot
          }
          var cost = danger * 10;
          if (goal) cost += near * (spot ? 0.8 : 1);
          if (!mx && !my) cost += goal && !spot ? 4 : 0.5;
          if (cost < bestS) { bestS = cost; bestM = moves[m]; out.danger = danger; }
        }
        out.x = bestM[0]; out.y = bestM[1];
        // strike when the target is inside reach and standing still is not dangerous right now
        if (tgt && pl.hurt === 0) {
          var tc2 = centre(hurtbox(tgt)), a = Math.atan2(tc2.y - c.y, tc2.x - c.x), qa = quant(a, P.dirs), half = Math.min(fd.arc, 170) / 2 * Math.PI / 180;
          var can = sectorHitsBox(c, reach - 1, qa - half, qa + half, hurtbox(tgt));
          var risk = 0; for (var t2 = 1; t2 <= fd.antic + fd.active; t2++) risk += dangerAt(pb, t2);
          if (can && risk < 2 && tgt.inv === 0) { out.attack = true; out.aim = { x: Math.cos(qa), y: Math.sin(qa) }; out.x = 0; out.y = 0; }
        }
        out.target = tgt && tgt.id;
      } catch (e) { warn('autopilot', 'autopilot() error: ' + (e && e.message)); }
      return out;
    }
    // danger to a player box `t` frames from now (0 = none); used along each candidate path
    function dangerAt(b, t) {
      var d = 0, hb = { x: b.x - 2, y: b.y - 7, w: b.w + 4, h: b.h + 9 }, inv = pl.inv - t > 0;
      for (var i = 0; i < shots.length; i++) {
        var s = shots[i], sx = s.x + s.vx * t, sy = s.y + s.vy * t;
        if (sx > hb.x - s.r - 2 && sx < hb.x + hb.w + s.r + 2 && sy > hb.y - s.r - 2 && sy < hb.y + hb.h + s.r + 2) d += inv ? 0.5 : 6;
      }
      for (var j = 0; j < enemies.length; j++) {
        var e = enemies[j]; if (e.dying || e.hp <= 0) continue;
        if ((e.state === 'tele' || e.state === 'charge') && e.cdx != null) {
          var left = e.state === 'tele' ? e.st : 0, run = Math.max(0, t - left) * 2.6, lane = Math.max(24, (e.lane || 120));
          var ex = e.x + e.cdx * Math.min(run, lane), ey = e.y + e.cdy * Math.min(run, lane);
          var sweep = { x: Math.min(e.x, ex) - 3, y: Math.min(e.y, ey) - 3, w: Math.abs(ex - e.x) + e.w + 6, h: Math.abs(ey - e.y) + e.h + 6 };
          if (overlap(sweep, hb)) d += inv ? 0.5 : (e.state === 'charge' ? 8 : (t > left - 4 ? 6 : 2));
          var laneR = { x: Math.min(e.x, e.x + e.cdx * lane) - 2, y: Math.min(e.y, e.y + e.cdy * lane) - 2, w: Math.abs(e.cdx * lane) + e.w + 4, h: Math.abs(e.cdy * lane) + e.h + 4 };
          if (overlap(laneR, hb)) d += 0.6;
        } else if (e.state === 'aim' && e.aim != null) {
          var ec = centre(e), bc = centre(hb), ax = Math.cos(e.aim), ay = Math.sin(e.aim), rx = bc.x - ec.x, ry = bc.y - ec.y, along = rx * ax + ry * ay, perp = Math.abs(rx * ay - ry * ax);
          if (along > 0 && perp < 9 + (e.boss ? 14 : 0) && t >= e.st - 2) d += inv ? 0.3 : 2.5;
        }
        if (e.touch > 0 && e.stun <= 0) {
          var to = api.to(e), mv = e.state === 'chase' ? e.speed * P.enemySpeed * Math.min(t, 10) : 0, l2 = to.d || 1;
          var pe = { x: e.x + to.dx / l2 * mv - 1, y: e.y + to.dy / l2 * mv - 1, w: e.w + 2, h: e.h + 2 };
          if (overlap(pe, b)) d += inv ? 0.4 : (e.boss ? 5 : 3);
        }
      }
      return d;
    }
    function danger(box, t) { try { return dangerAt(box || pBox(), t || 1); } catch (e) { return 0; } }

    // ---------------------------------------------------------------- queries
    function enemyById(id) { for (var i = 0; i < enemies.length; i++) if (enemies[i].id === id) return enemies[i]; return null; }
    function anchor(id, ox, oy) {
      ox = num(ox, 0); oy = num(oy, 0);
      if (id === playerId || id === 'player') {
        var b = pBox(); if (!b) return null; var ps = o.playerSprite || {}, w = num(ps.w, b.w + 4), h = num(ps.h, b.h + 10);
        return { id: playerId, x: b.x + b.w / 2 + ox, top: b.y + b.h - h + num(ps.dy, 0) + oy, left: b.x + b.w / 2 - w / 2 + ox, w: w, h: h, cy: b.y + b.h - h / 2 + oy, footY: b.y + b.h + oy, dead: pl.down };
      }
      var e = enemyById(id); if (!e) return null;
      var top = e.y + e.h - e.sh + 1;
      return { id: e.id, x: e.x + e.w / 2 + ox, top: top + oy, left: e.x + e.w / 2 - e.sw / 2 + ox, w: e.sw, h: e.sh, cy: top + e.sh / 2 + oy, footY: e.y + e.h + oy, dead: e.dying > 0 || e.hp <= 0 };
    }
    function playerAlpha() { return pl.inv > 0 && ((pl.inv >> 2) & 1) ? 0.4 : 1; }   // translucent flicker, never invisible
    function enemyAlpha(e) { e = typeof e === 'object' ? e : enemyById(e); if (!e) return 1; if (e.dying) return Math.max(0.25, e.dying / 22); return e.inv > 0 && ((e.inv >> 1) & 1) ? 0.55 : 1; }
    function swingInfo() { if (!sw) return null; return { step: sw.step, f: sw.f, phase: swingPhase(), total: sw.total, buffered: sw.buffered, dir: sw.dir, face: faceName(sw.dir), finisher: sw.fd.fin, frames: { antic: sw.fd.antic, active: sw.fd.active, recover: sw.fd.recover } }; }
    function pose() { return { state: pl.down ? 'down' : pl.hurt > 0 ? 'hurt' : sw ? swingPhase() : 'free', face: faceName(sw ? sw.dir : pl.face), angle: sw ? sw.dir : pl.face, alpha: playerAlpha(), swing: swingInfo() }; }

    // ---------------------------------------------------------------- drawing
    var SPR = {}, canDraw = typeof document !== 'undefined';
    function col(path, fb) { if (SK) { try { var v = SK.token ? SK.token(path) : null; if (typeof v === 'string' && v.charAt(0) !== '#' && v.indexOf('rgb') !== 0 && v === path) v = null; if (v && typeof v === 'string') return v; } catch (e) { /* fall through */ } } var pth = path.split('.'), cur = BUILTIN.palette; for (var i = 0; i < pth.length && cur; i++) cur = cur[pth[i]]; return typeof cur === 'string' ? cur : fb; }
    function paint(w, h, fn) {
      var c = document.createElement('canvas'); c.width = w + 2; c.height = h + 2; var x = c.getContext('2d');
      fn(function (px, py, pw, ph, cl) { x.fillStyle = cl; x.fillRect(px + 1, py + 1, pw, ph); });
      var id = x.getImageData(0, 0, c.width, c.height), d = id.data, cw = c.width, mark = [];
      for (var i = 0; i < cw * c.height; i++) { if (d[i * 4 + 3]) continue; var px = i % cw, py = (i / cw) | 0;
        if ((px > 0 && d[(i - 1) * 4 + 3]) || (px < cw - 1 && d[(i + 1) * 4 + 3]) || (py > 0 && d[(i - cw) * 4 + 3]) || (py < c.height - 1 && d[(i + cw) * 4 + 3])) mark.push(i); }
      for (var j = 0; j < mark.length; j++) { var q = mark[j] * 4; d[q] = 16; d[q + 1] = 12; d[q + 2] = 24; d[q + 3] = 255; }
      x.putImageData(id, 0, 0); return c;
    }
    function whiteOf(src) { var c = document.createElement('canvas'); c.width = src.width; c.height = src.height; var x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); return c; }
    function flipOf(src) { var c = document.createElement('canvas'); c.width = src.width; c.height = src.height; var x = c.getContext('2d'); x.scale(-1, 1); x.drawImage(src, -src.width, 0); return c; }
    // original procedural sprites, 3-5 tone ramps, facing right; frame 0/1 = idle bob / step
    var ART = {
      slime: function (f) { return function (R) {
        var B = '#5ac85a', D = '#2e8a3e', DD = '#1e5a2e', L = '#b8f0a0', y = f ? 2 : 0;
        R(4, 1 + y, 6, 1, B); R(2, 2 + y, 10, 1, B); R(1, 3 + y, 12, 6 - y, B); R(0, 6, 14, 3, B); R(0, 8, 14, 2, D); R(1, 10, 12, 1, DD);
        R(3, 2 + y, 3, 1, L); R(2, 3 + y, 1, 2, L); R(8, 4 + y, 2, 2, '#10101a'); R(5, 4 + y, 2, 2, '#10101a'); R(8, 4 + y, 1, 1, '#ffffff'); R(5, 4 + y, 1, 1, '#ffffff'); R(6, 7, 3, 1, DD);
      }; },
      hound: function (f) { return function (R) {
        var B = '#a86a3a', D = '#6e4224', L = '#d8a070', E = '#ffd040';
        R(2, 4, 10, 5, B); R(1, 5, 2, 3, D); R(11, 2, 4, 5, B); R(12, 1, 1, 2, D); R(14, 1, 1, 2, D); R(15, 4, 1, 2, D); R(3, 4, 7, 1, L); R(12, 3, 1, 1, E); R(15, 5, 1, 1, '#1a1010');
        R(0, 3, 2, 2, B);
        if (f) { R(2, 9, 2, 3, D); R(9, 9, 2, 2, D); R(5, 9, 2, 2, D); R(11, 9, 2, 3, D); } else { R(3, 9, 2, 2, D); R(10, 9, 2, 3, D); R(5, 9, 2, 3, D); R(12, 9, 2, 2, D); }
      }; },
      boar: function (f) { return function (R) {
        var B = '#7a5a6a', D = '#4e3646', L = '#a88898', T = '#f0e8d0';
        R(2, 3, 13, 7, B); R(1, 5, 2, 4, D); R(4, 2, 9, 2, D); R(5, 1, 2, 1, D); R(9, 1, 2, 1, D); R(13, 4, 5, 5, B); R(17, 6, 2, 3, '#c89090'); R(18, 7, 1, 1, '#3a1a1a');
        R(3, 3, 9, 1, L); R(14, 5, 1, 1, '#ff3a2a'); R(16, 8, 2, 1, T); R(17, 9, 1, 2, T); R(2, 9, 12, 1, D);
        if (f) { R(3, 10, 2, 3, D); R(7, 10, 2, 2, D); R(10, 10, 2, 3, D); R(13, 10, 2, 2, D); } else { R(4, 10, 2, 2, D); R(7, 10, 2, 3, D); R(11, 10, 2, 2, D); R(13, 10, 2, 3, D); }
      }; },
      archer: function (f) { return function (R) {
        var H = '#4a7a4a', HD = '#2e522e', S = '#e8b890', K = '#5a3a22', W = '#c89a5a';
        R(3, 0, 6, 2, HD); R(2, 2, 8, 5, H); R(4, 4, 4, 3, '#1a1a22'); R(5, 5, 1, 1, '#ffe060'); R(7, 5, 1, 1, '#ffe060');
        R(2, 7, 8, 6, H); R(2, 7, 1, 6, HD); R(3, 10, 6, 1, K); R(9, 8, 2, 2, S);
        R(11, 3, 1, 10, W); R(12, 2, 1, 2, W); R(12, 12, 1, 2, W); R(10, 4, 1, 8, '#e8e8f0');
        if (f) { R(3, 13, 2, 3, HD); R(7, 13, 2, 2, HD); } else { R(3, 13, 2, 2, HD); R(7, 13, 2, 3, HD); }
      }; },
      warden: function (f) { return function (R) {
        var S = '#8a8aa0', D = '#5a5a72', DD = '#3a3a4e', L = '#c0c0d4', M = '#5ac8d8', y = f ? 1 : 0;
        R(9, 0 + y, 12, 3, D); R(7, 3 + y, 16, 9, S); R(7, 3 + y, 16, 1, L); R(10, 6 + y, 10, 3, DD); R(11, 7 + y, 3, 1, M); R(16, 7 + y, 3, 1, M);
        R(3, 12, 24, 12, S); R(3, 12, 24, 2, L); R(3, 22, 24, 2, D); R(12, 14, 6, 6, D); R(14, 15, 2, 4, M);
        R(0, 13, 4, 10, D); R(26, 13, 4, 10, D); R(0, 22, 4, 3, DD); R(26, 22, 4, 3, DD);
        R(5, 24, 7, 6, D); R(18, 24, 7, 6, D); R(5, 29, 8, 2, DD); R(17, 29, 8, 2, DD);
      }; }
    };
    function sprite(look, f, flip, white) {
      if (!canDraw) return null;
      var key = look + f + (flip ? 'L' : 'R') + (white ? 'W' : '');
      if (SPR[key]) return SPR[key];
      var L = LOOKS[look] || LOOKS.slime, base = SPR[look + f + 'R'];
      if (!base) { base = SPR[look + f + 'R'] = paint(L.sw, L.sh, (ART[look] || ART.slime)(f)); }
      var s = base; if (flip) s = SPR[look + f + 'L'] || (SPR[look + f + 'L'] = flipOf(base));
      if (white) s = whiteOf(s);
      SPR[key] = s; return s;
    }
    function drawShadow(ctx, cx, cy, w) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; var hw = Math.max(3, Math.round(w / 2)); ctx.fillRect(Math.round(cx - hw + 1), Math.round(cy), hw * 2 - 2, 2); ctx.fillRect(Math.round(cx - hw + 2), Math.round(cy + 2), hw * 2 - 4, 1); }
    function drawEnemy(ctx, e, ox, oy) {
      try {
        e = typeof e === 'object' ? e : enemyById(e); if (!e) return;
        ox = num(ox, 0); oy = num(oy, 0);
        var f = (e.anim >> 4) & 1, shake = (e.state === 'tele' || (e.boss && e.state === 'aim')) ? ((e.anim >> 1) & 1 ? 1 : -1) : 0;
        if (e.state === 'charge') f = (e.anim >> 2) & 1;
        var sx = Math.round(e.x + e.w / 2 - e.sw / 2 + ox + shake), sy = Math.round(e.y + e.h - e.sh + 1 + oy);
        var alpha = enemyAlpha(e), white = P.flash !== 'off' && e.flash > 3, glow = !white && e.state === 'tele' && ((e.anim >> 2) & 1);
        if (!e.dying) drawShadow(ctx, e.x + e.w / 2 + ox, e.y + e.h + oy - 1, e.w);
        var info = { frame: f, flip: e.face < 0, alpha: alpha, white: white, state: e.state, sx: sx, sy: sy };
        ctx.save(); ctx.globalAlpha *= alpha;
        if (typeof o.art === 'function') { var done = false; try { done = o.art(ctx, e, sx, sy, info) !== false; } catch (er) { warn('art', 'art() threw: ' + er.message); } if (!done) drawBuiltin(ctx, e, sx, sy, f, white); }
        else drawBuiltin(ctx, e, sx, sy, f, white);
        if (e.boss && e.raged && !white && !e.dying && typeof o.art !== 'function') { var rs = sprite(e.look in LOOKS ? e.look : 'slime', f, e.face < 0, true); if (rs) { var tc = rageTint(rs); ctx.globalAlpha *= ((e.anim >> 3) & 1) ? 0.45 : 0.28; ctx.drawImage(tc, sx - 1, sy - 1); ctx.globalAlpha = alpha; } }
        if (glow) { var ws = sprite(e.look in LOOKS ? e.look : 'slime', f, e.face < 0, true); if (ws && typeof o.art !== 'function') { ctx.globalAlpha *= 0.45; ctx.drawImage(ws, sx - 1, sy - 1); } }   // telegraph: a pulsing glow, the sprite stays readable
        ctx.restore();
        if (e.state === 'stun' && !e.dying) { var k = e.anim >> 3; for (var i = 0; i < 3; i++) { var a = (k + i * 2.1); ctx.fillStyle = i % 2 ? col('fx.crit', '#ffd23a') : '#ffffff'; ctx.fillRect(Math.round(sx + e.sw / 2 + Math.cos(a) * 6), Math.round(sy - 2 + Math.sin(a) * 2), 2, 2); } }
        if ((e.state === 'tele' || e.state === 'aim') && !e.dying) drawMark(ctx, Math.round(sx + e.sw / 2), sy - 9, e.state === 'tele');
        if (e.boss && !e.dying) {   // HP bar above the sprite (below its feet when the hero or the field edge is in the way)
          var bw = 28, bx = Math.round(e.x + e.w / 2 - bw / 2 + ox), by = sy - 5, pa = anchor(playerId, ox, oy), bnd = bounds(), vt = oy + (bnd ? +bnd.y || 0 : 0);
          if (bnd) bx = Math.round(clamp(bx, ox + bnd.x + 1, ox + bnd.x + bnd.w - bw - 1));
          var under = by - 1 < vt + 1 || (pa && bx - 1 < pa.left + pa.w && bx + bw + 1 > pa.left && by - 1 < pa.top + pa.h && by + 3 > pa.top);
          if ((e.state === 'tele' || e.state === 'aim') && !under) by -= 10;   // above the mark
          if (under) by = Math.round(e.y + e.h + oy + 3);
          ctx.fillStyle = col('ink', '#06061a'); ctx.fillRect(bx - 1, by - 1, bw + 2, 4); ctx.fillStyle = '#3a1a2a'; ctx.fillRect(bx, by, bw, 2);
          ctx.fillStyle = e.raged && (e.anim >> 3) & 1 ? col('fx.hot', '#ff7a3a') : col('team.b', '#e04848'); ctx.fillRect(bx, by, Math.round(bw * e.hp / e.maxHp), 2);
        }
      } catch (er) { warn('drawEnemy', 'drawEnemy error: ' + er.message); }
    }
    var tintCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
    function rageTint(src) {   // the white silhouette recoloured red (rage pulse)
      if (tintCache && tintCache.has(src)) return tintCache.get(src);
      var c = document.createElement('canvas'); c.width = src.width; c.height = src.height; var x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col('team.b', '#e04848'); x.fillRect(0, 0, c.width, c.height);
      if (tintCache) tintCache.set(src, c); return c;
    }
    function drawBuiltin(ctx, e, sx, sy, f, white) { var s = sprite(e.look, f, e.face < 0, white); if (s) ctx.drawImage(s, sx - 1, sy - 1); else { ctx.fillStyle = white ? '#fff' : '#8a4'; ctx.fillRect(sx, sy, e.sw, e.sh); } }
    function drawMark(ctx, x, y, red) {
      ctx.fillStyle = col('ink', '#06061a'); ctx.fillRect(x - 2, y - 1, 5, 9);
      ctx.fillStyle = red ? col('fx.hot', '#ff7a3a') : col('fx.crit', '#ffd23a'); ctx.fillRect(x - 1, y, 3, 4); ctx.fillRect(x - 1, y + 5, 3, 2);
    }
    function tdot(ctx, x, y, on) {
      x = Math.round(x); y = Math.round(y);
      ctx.globalAlpha = on ? 0.9 : 0.55; ctx.fillStyle = col('ink', '#06061a'); ctx.fillRect(x - 2, y - 2, 4, 4);
      ctx.fillStyle = on ? col('fx.hot', '#ff7a3a') : col('fx.crit', '#ffd23a'); ctx.fillRect(x - 1, y - 1, 2, 2); ctx.globalAlpha = 1;
    }
    function drawGround(ctx, ox, oy) {
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i]; if (e.dying) continue;
        var on = (e.anim >> 2) & 1;
        if (e.state === 'tele' && e.cdx != null) {   // telegraph lane: outlined squares where the charge will run
          var len = Math.max(16, e.lane || 100), cx = e.x + e.w / 2, cy = e.y + e.h / 2;
          for (var s = 8; s < len; s += 6) tdot(ctx, cx + e.cdx * s + ox, cy + e.cdy * s + oy, on);
        }
        if (e.state === 'aim' && e.aim != null) {   // aim line: the same squares toward the hero, a reticle at its end
          var ac = centre(e), p = pBox(), dist = p ? Math.min(130, Math.hypot(p.x + p.w / 2 - ac.x, p.y + p.h / 2 - ac.y) + 6) : 90;
          var ux = Math.cos(e.aim), uy = Math.sin(e.aim), x0 = ac.x + ox, y0 = ac.y - 3 + oy;
          for (var s2 = 10; s2 < dist - 4; s2 += 6) tdot(ctx, x0 + ux * s2, y0 + uy * s2, on);
          var rx = Math.round(x0 + ux * dist), ry = Math.round(y0 + uy * dist), ink = col('ink', '#06061a'), hot = col('fx.hot', '#ff7a3a');
          ctx.fillStyle = ink; ctx.fillRect(rx - 5, ry - 1, 4, 3); ctx.fillRect(rx + 2, ry - 1, 4, 3); ctx.fillRect(rx - 1, ry - 5, 3, 4); ctx.fillRect(rx - 1, ry + 2, 3, 4);
          ctx.fillStyle = hot; ctx.fillRect(rx - 4, ry, 3, 1); ctx.fillRect(rx + 2, ry, 3, 1); ctx.fillRect(rx, ry - 4, 1, 3); ctx.fillRect(rx, ry + 2, 1, 3);
        }
      }
    }
    function drawDrops(ctx, ox, oy) {
      for (var i = 0; i < drops.length; i++) {
        var d = drops[i], left = d.life - d.t; if (left < 120 && ((d.t >> 2) & 1)) continue;   // blink before vanishing
        var hop = d.t < 12 ? -Math.round(Math.sin(d.t / 12 * Math.PI) * 6) : ((d.t >> 4) & 1 ? -1 : 0), x = Math.round(d.x + ox), y = Math.round(d.y + oy);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 3, y + 3, 6, 1);
        var custom = false; if (typeof o.drawDrop === 'function') { try { custom = o.drawDrop(ctx, d, x, y + hop) !== false; } catch (er) { warn('drawDrop', 'drawDrop() threw: ' + er.message); } }
        if (!custom) { if (d.kind === 'heart') heart(ctx, x - 4, y - 4 + hop, 2); else if (d.kind === 'gem') gem(ctx, x - 3, y - 5 + hop, d.t); else { ctx.fillStyle = col('fx.crit', '#ffd23a'); ctx.fillRect(x - 3, y - 3 + hop, 6, 6); } }
      }
    }
    function heart(ctx, x, y, fill) {   // 8x7; fill 0 / 1 (half) / 2 (full)
      var ink = col('ink', '#06061a'), red = col('team.b', '#e04848'), hi = '#ffc0c0', empty = '#3a2430';
      var rows = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
      ctx.fillStyle = ink; ctx.fillRect(x, y + 1, 9, 5); ctx.fillRect(x + 1, y, 3, 1); ctx.fillRect(x + 5, y, 3, 1); ctx.fillRect(x + 1, y + 6, 7, 1); ctx.fillRect(x + 2, y + 7, 5, 1); ctx.fillRect(x + 3, y + 8, 3, 1);
      for (var r = 0; r < rows.length; r++) for (var c = 0; c < 7; c++) if (rows[r][c] === '#') {
        ctx.fillStyle = fill === 2 || (fill === 1 && c < 4) ? red : empty; ctx.fillRect(x + 1 + c, y + 1 + r, 1, 1);
      }
      if (fill) { ctx.fillStyle = hi; ctx.fillRect(x + 2, y + 2, 1, 1); }
    }
    function gem(ctx, x, y, t) { var ink = col('ink', '#06061a'), g = col('fx.cold', '#7ad8ff'); ctx.fillStyle = ink; ctx.fillRect(x + 1, y, 5, 1); ctx.fillRect(x, y + 1, 7, 3); ctx.fillRect(x + 1, y + 4, 5, 1); ctx.fillRect(x + 2, y + 5, 3, 1); ctx.fillRect(x + 3, y + 6, 1, 1); ctx.fillStyle = g; ctx.fillRect(x + 1, y + 1, 5, 3); ctx.fillRect(x + 2, y + 4, 3, 1); ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 2 + ((t >> 3) & 1), y + 1, 1, 1); ctx.fillStyle = '#3a8ab8'; ctx.fillRect(x + 4, y + 2, 2, 2); }
    function drawShots(ctx, ox, oy) {
      for (var i = 0; i < shots.length; i++) {
        var s = shots[i], x = Math.round(s.x + ox), y = Math.round(s.y + oy), r = s.r;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - r + 1, y + r + 3, r * 2 - 1, 1);
        ctx.fillStyle = col('ink', '#06061a'); ctx.fillRect(x - r, y - r + 1, r * 2 + 1, r * 2 - 1); ctx.fillRect(x - r + 1, y - r, r * 2 - 1, r * 2 + 1);
        ctx.fillStyle = s.kind === 'orb' ? col('fx.cold', '#7ad8ff') : col('fx.hot', '#ff7a3a'); ctx.fillRect(x - r + 1, y - r + 1, r * 2 - 1, r * 2 - 1);
        ctx.fillStyle = (s.t >> 2) & 1 ? '#ffffff' : col('fx.crit', '#ffd23a'); ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    function drawWeapon(ctx, ox, oy) {
      try {
        if (!sw) return; var pb = pBox(); if (!pb) return;
        ox = num(ox, 0); oy = num(oy, 0);
        var c = centre(pb), cx = c.x + ox, cy = c.y - 4 + oy, fd = sw.fd, ph = swingPhase(), span = fd.arc * Math.PI / 180, ang, len = fd.reach - 2;
        if (ph === 'antic') ang = sw.a0 - fd.sweep * 0.35 * (sw.f + 1) / Math.max(1, fd.antic);
        else if (ph === 'active') ang = sweptRange().cur;
        else ang = sw.a0 + fd.sweep * span;
        // slash trail: a band of arc segments over the swept angle (active frames, then 3 fading frames)
        var k = sw.f - fd.antic, fade = ph === 'recover' ? 1 - (k - fd.active) / 4 : 1;
        if (ph !== 'antic' && fade > 0) {
          var a1 = ph === 'active' ? ang : sw.a0 + fd.sweep * span, steps = Math.max(6, Math.ceil(Math.abs(a1 - sw.a0) / 0.09)), white = col('fx.white', '#ffffff'), edge = fd.fin ? col('fx.crit', '#ffd23a') : col('fx.cold', '#7ad8ff');
          for (var i = 0; i <= steps; i++) {
            var t = i / steps, a = sw.a0 + (a1 - sw.a0) * t, al = (0.25 + 0.75 * t) * fade;
            ctx.globalAlpha = al * 0.9; ctx.fillStyle = edge;
            for (var r = len - 6; r <= len + 1; r += 2) ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 2, 2);
            ctx.globalAlpha = al; ctx.fillStyle = white; ctx.fillRect(Math.round(cx + Math.cos(a) * (len - 1)), Math.round(cy + Math.sin(a) * (len - 1)), 2, 2);
          }
          ctx.globalAlpha = 1;
        }
        if (ph === 'recover' && k - fd.active > 5) return;
        // blade: hilt -> tip, whole-pixel dots
        var ink = col('ink', '#06061a'), steel = '#d8e0f0', dark = '#7a88a8', gold = col('fx.crit', '#ffd23a');
        for (var p2 = 0; p2 <= 1; p2++) for (var s = 3; s <= len; s++) {
          var x = Math.round(cx + Math.cos(ang) * s), y = Math.round(cy + Math.sin(ang) * s);
          if (p2 === 0) { ctx.fillStyle = ink; ctx.fillRect(x - 1, y - 1, 3, 3); }
          else { ctx.fillStyle = s < 6 ? '#6a4a2a' : s === 6 ? gold : (s & 1 ? steel : dark); ctx.fillRect(x, y, s === 6 ? 2 : 1, s === 6 ? 2 : 1); if (s > 6) { ctx.fillStyle = steel; ctx.fillRect(x, y, 1, 1); } }
        }
        if (ph === 'antic' && sw.f === fd.antic - 1) { ctx.fillStyle = '#ffffff'; var gx = Math.round(cx + Math.cos(ang) * len), gy = Math.round(cy + Math.sin(ang) * len); ctx.fillRect(gx - 2, gy, 5, 1); ctx.fillRect(gx, gy - 2, 1, 5); }
      } catch (e) { warn('drawWeapon', 'drawWeapon error: ' + e.message); }
    }
    function drawFx(ctx, ox, oy) {
      for (var i = 0; i < fx.length; i++) {
        var f = fx[i], x = Math.round(f.x + ox), y = Math.round(f.y + oy), t = 1 - f.life / f.max;
        if (f.ring) { var r = Math.round(f.r * (0.4 + t)); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1 - t; for (var a = 0; a < 12; a++) { var an = a / 12 * TAU; ctx.fillRect(Math.round(x + Math.cos(an) * r), Math.round(y + Math.sin(an) * r * 0.7), 2, 2); } ctx.globalAlpha = 1; continue; }
        ctx.fillStyle = f.kind === 'crit' ? (f.life & 2 ? col('fx.crit', '#ffd23a') : '#ffffff') : f.kind === 'hurt' ? col('team.b', '#e04848') : f.kind === 'heal' ? col('fx.heal', '#5ae07a') : f.kind === 'gem' || f.kind === 'parry' ? col('fx.cold', '#7ad8ff') : f.kind === 'poof' ? '#e8e8f0' : f.kind === 'dust' ? '#c8b898' : '#ffffff';
        var sz = f.kind === 'poof' ? (f.life > 8 ? 3 : 2) : f.life > 10 ? 2 : 1; ctx.fillRect(x, y, sz, sz);
      }
    }
    function drawOverlay(ctx, ox, oy) {
      var pb = pBox();
      function box(b, c) { ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.strokeRect(Math.round(b.x + ox) + 0.5, Math.round(b.y + oy) + 0.5, Math.round(b.w) - 1, Math.round(b.h) - 1); }
      ctx.save(); ctx.globalAlpha = 0.9;
      if (pb) box({ x: pb.x, y: pb.y - 6, w: pb.w, h: pb.h + 6 }, pl.inv > 0 ? '#a0a0a0' : col('overlay.move.edge', '#a8d8ff'));
      for (var i = 0; i < enemies.length; i++) if (!enemies[i].dying) { box(hurtbox(enemies[i]), enemies[i].inv > 0 ? '#a0a0a0' : '#5ae07a'); box(enemies[i], col('overlay.threat.edge', '#ffe080')); }
      for (var j = 0; j < shots.length; j++) box({ x: shots[j].x - shots[j].r, y: shots[j].y - shots[j].r, w: shots[j].r * 2, h: shots[j].r * 2 }, col('fx.hot', '#ff7a3a'));
      if (sw && pb && swingPhase() === 'active') {   // the live hitbox: the sector swept so far
        var c = centre(pb), r = sweptRange(), fd = sw.fd, n = 18;
        ctx.globalAlpha = 0.35; ctx.fillStyle = col('overlay.attack.fill', '#ff3a3a'); ctx.beginPath(); ctx.moveTo(c.x + ox, c.y + oy);
        for (var q = 0; q <= n; q++) { var a = r.a0 + (r.a1 - r.a0) * q / n; ctx.lineTo(c.x + ox + Math.cos(a) * fd.reach, c.y + oy + Math.sin(a) * fd.reach); }
        ctx.closePath(); ctx.fill(); ctx.globalAlpha = 0.9; ctx.strokeStyle = col('overlay.attack.edge', '#ffb0a0'); ctx.stroke();
      }
      ctx.restore();
    }
    // the world layer: telegraph lanes, drops, enemies (y-sorted), projectiles, the sword, sparks, the optional hitbox overlay.
    // opt.layer 'below' = lanes + drops only (before your y-sorted sprites); 'above' = projectiles, sword, sparks, overlay (after them)
    function draw(ctx, ox, oy, opt) {
      try {
        if (!ctx) return; ox = num(ox, 0); oy = num(oy, 0); opt = opt || {};
        var sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
        var below = opt.layer !== 'above', above = opt.layer !== 'below';
        if (below) { drawGround(ctx, ox, oy); drawDrops(ctx, ox, oy); }
        if (!opt.layer && opt.enemies !== false) { var list = enemies.slice().sort(function (a, b) { return (a.y + a.h) - (b.y + b.h); }); for (var i = 0; i < list.length; i++) drawEnemy(ctx, list[i], ox, oy); }
        if (above) {
          drawShots(ctx, ox, oy);
          if (opt.weapon !== false) drawWeapon(ctx, ox, oy);
          drawFx(ctx, ox, oy);
          if (P.overlay === 'on' || opt.overlay) drawOverlay(ctx, ox, oy);
        }
        ctx.imageSmoothingEnabled = sm;
      } catch (e) { warn('draw', 'draw() error: ' + (e && e.message)); }
    }
    function drawHearts(ctx, x, y, opt) {
      try {
        opt = opt || {}; var hp = getHp(), max = getMax(), per = Math.max(1, num(opt.per, P.heartHp)), n = Math.ceil(max / per), cols = num(opt.cols, 10);
        for (var i = 0; i < n; i++) { var v = clamp(hp - i * per, 0, per), fill = v >= per ? 2 : v > 0 ? 1 : 0; heart(ctx, x + (i % cols) * 9, y + Math.floor(i / cols) * 9, fill); }
        hudRect = { name: 'hearts', x: x, y: y, w: Math.min(n, cols) * 9, h: Math.ceil(n / cols) * 9 };
        return hudRect;
      } catch (e) { warn('drawHearts', 'drawHearts() error: ' + e.message); return null; }
    }
    function sprites(ox, oy) {   // for hosts that y-sort: one entry per enemy, draw them with your own sprites
      return enemies.map(function (e) { return { id: e.id, y: e.y + e.h, draw: function (ctx) { drawEnemy(ctx, e, ox, oy); } }; });
    }

    // ---------------------------------------------------------------- public
    var inst = {
      version: VERSION,
      update: update, autopilot: autopilot, danger: danger,
      spawn: spawn, drop: drop,
      remove: function (id) { var e = enemyById(id); if (e) enemies.splice(enemies.indexOf(e), 1); return !!e; },
      clear: function () { enemies.length = 0; shots.length = 0; drops.length = 0; fx.length = 0; sw = null; freezeLeft = 0; pendingPress = false; pl.kbx = pl.kby = 0; pl.hurt = 0; pl.grace = 0; pl.nextStep = 1; },
      reset: function () { inst.clear(); pl.inv = 0; pl.down = false; setHp(getMax()); },
      revive: function (hp) { pl.down = false; pl.inv = P.iframes; setHp(hp != null ? hp : getMax()); },
      damage: function (id, amount, opt) {   // host damage through the same hit site (traps, poison, spells)
        opt = opt || {}; var dir = opt.dir || { x: 0, y: 0 };
        if (id === playerId || id === 'player') return hurtPlayer(num(amount, 1), opt.source || null, opt.kind || 'host', dir, opt.at);
        var e = enemyById(id); if (!e || e.dying) return false;
        return applyToEnemy(e, { kind: 'host', source: opt.source || null, target: e.id, amount: num(amount, 1), at: opt.at || centre(e), dir: dir, frame: frame }, opt.knockback || 0);
      },
      heal: function (n) { setHp(getHp() + num(n, P.heartHp)); },
      knock: function (id, dx, dy) { if (id === playerId || id === 'player') { pl.kbx = dx; pl.kby = dy; } else { var e = enemyById(id); if (e) { e.kbx = dx; e.kby = dy; } } },
      freeze: function (frames) { freezeLeft = Math.max(freezeLeft, Math.round(num(frames, 0))); }, frozen: function () { return freezeLeft > 0; },
      canMove: function () { return !pl.down && !sw && pl.hurt === 0 && Math.abs(pl.kbx) + Math.abs(pl.kby) < 0.6; },
      busy: function () { return !!sw || pl.hurt > 0; }, swinging: function () { return !!sw; },
      down: function () { return pl.down; }, invulnerable: function () { return pl.inv > 0; },
      hp: getHp, maxHp: getMax, swing: swingInfo, pose: pose, facing: function () { return faceName(sw ? sw.dir : pl.face); },
      playerAlpha: playerAlpha, enemyAlpha: enemyAlpha,
      enemies: function () { return enemies.filter(function (e) { return !e.dying && e.hp > 0; }); }, all: function () { return enemies.slice(); },
      enemy: enemyById, count: function () { return inst.enemies().length; }, shots: function () { return shots.slice(); }, drops: function () { return drops.slice(); },
      anchor: anchor, uiRects: function () { return hudRect ? [hudRect] : []; },
      draw: draw, drawEnemy: drawEnemy, drawWeapon: drawWeapon, drawGround: drawGround, drawEffects: function (ctx, ox, oy) { drawShots(ctx, num(ox, 0), num(oy, 0)); drawFx(ctx, num(ox, 0), num(oy, 0)); },
      drawHearts: drawHearts, drawOverlay: function (ctx, ox, oy) { drawOverlay(ctx, num(ox, 0), num(oy, 0)); }, sprites: sprites,
      frameData: function () { var a = []; for (var s = 1; s <= P.combo; s++) { var d = frameData(s); a.push({ step: s, finisher: d.fin, antic: d.antic, active: d.active, recover: d.recover, link: Math.min(d.recover, P.link), reach: d.reach, arc: d.arc, damage: d.dmg }); } return a; },
      setParams: setParams, params: function () { var c = {}; for (var key in P) c[key] = P[key]; return c; },
      stats: function () { var c = {}; for (var key in stats) c[key] = stats[key]; c.frame = frame; c.enemies = inst.count(); c.shotsLive = shots.length; return c; },
      frame: function () { return frame; },
      state: function () {
        return { frame: frame, hp: getHp(), max: getMax(), down: pl.down, inv: pl.inv, swing: swingInfo(),
          enemies: enemies.map(function (e) { return { id: e.id, look: e.look, brain: typeof e.brain === 'string' ? e.brain : 'custom', state: e.state, x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10, hp: e.hp, dying: e.dying > 0 }; }),
          shots: shots.length, drops: drops.map(function (d) { return d.kind; }) };
      }
    };
    return inst;
  }

  root.GameDNA_SwordCombat = { version: VERSION, create: create, defaults: DEFAULTS, looks: LOOKS, brains: ['wander', 'chase', 'charge', 'shooter', 'warden'] };
})(typeof window !== 'undefined' ? window : this);
