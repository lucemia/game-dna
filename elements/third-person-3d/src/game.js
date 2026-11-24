/* Sunshard Isle: the N-01 third-person-3d starter game. Built on GameDNA_ThirdPerson3D (pasted above, unchanged).
   Sections are marked "=== n." (see starter/README.md). Addons plug in through the ADDONS SLOT after this script. */
(function () {
  'use strict';
  var TP3 = window.GameDNA_ThirdPerson3D, THREE = window.THREE;

  // ======================================================================= 1. Config and content
  var Q = new URLSearchParams(location.search);
  var OPT = {
    t: Q.has('t') ? +Q.get('t') : null, freeze: Q.get('freeze') === '1', seed: +(Q.get('seed') || 7),
    auto: Q.has('auto') ? Q.get('auto') === '1' : Q.has('t'), touch: Q.get('touch') === '1' || ('ontouchstart' in window),
    palette: Q.get('palette') || 'meadow', gear: Q.get('gear') || 'both', shadows: Q.get('shadows') || 'soft', dpr: Q.has('dpr') ? +Q.get('dpr') : 2
  };
  var NEED = 3;                      // sun shards needed to relight the beacon
  var LAYOUT = [                     // props: kind, x, z, rot (rad), s (scale), extra options per kind
    { kind: 'arch', x: 0, z: 9.6, rot: 0 },
    { kind: 'wall', x: -4.4, z: 9.6, len: 4.6 }, { kind: 'wall', x: 4.4, z: 9.6, len: 4.6 },
    { kind: 'wall', x: -8.6, z: 8.2, len: 3.0, rot: 0.6, h: 0.8 }, { kind: 'wall', x: 8.4, z: 8.4, len: 2.6, rot: -0.7, h: 0.7 },
    { kind: 'fountain', x: 0, z: 1 },
    { kind: 'pillar', x: 5.1, z: 6.1 }, { kind: 'pillar', x: -5.1, z: 6.1, broken: true, v: 1 }, { kind: 'pillar', x: 6.9, z: -2.4, broken: true, v: 2 },
    { kind: 'pillar', x: -6.9, z: -2.4 }, { kind: 'pillar', x: 6.6, z: -6.2, broken: true, v: 3 }, { kind: 'pillar', x: -4.2, z: -4.9, broken: true },
    { kind: 'beacon', x: 0, z: -11 },
    { kind: 'lantern', x: 1.9, z: 6.4, rot: Math.PI }, { kind: 'lantern', x: -1.9, z: -6.2 }, { kind: 'lantern', x: 2.1, z: -13.2, rot: Math.PI / 2 },
    { kind: 'lantern', x: 8.6, z: 3.6, rot: -Math.PI / 2 },
    { kind: 'stall', x: -9.6, z: 3.4, rot: 0.55, cloth: '#3f7fb8' }, { kind: 'barrel', x: -11.4, z: 5.4 }, { kind: 'crate', x: -7.6, z: 5.6, rot: 0.3 },
    { kind: 'crate', x: -7.9, z: 6.4, rot: 0.9, size: 0.55 }, { kind: 'barrel', x: -12.1, z: 2.0 },
    { kind: 'wall', x: -13.4, z: -7.6, len: 3.6, rot: 1.2, h: 1.1 }, { kind: 'pillar', x: -10.4, z: -8.6, broken: true, v: 3 }, { kind: 'pillar', x: -14.6, z: -2.2, broken: true, v: 2 },
    { kind: 'rock', x: 9.8, z: -12.2, s: 1.3 }, { kind: 'rock', x: 5.4, z: -14.4, s: 0.9 }, { kind: 'rock', x: 10.9, z: -9.1, s: 0.8 },
    { kind: 'rock', x: -3.6, z: 15.6, s: 1.1 }, { kind: 'rock', x: 15.6, z: 6.6, s: 1.2 }, { kind: 'rock', x: -16.2, z: 4.6, s: 1.0 }, { kind: 'rock', x: 3.4, z: 16.2, s: 0.8 },
    { kind: 'rock', x: -6.4, z: -15.6, s: 1.2 }, { kind: 'rock', x: 16.8, z: -4.0, s: 0.9 },
    { kind: 'tree', x: 11.2, z: -1.6, s: 1.1 }, { kind: 'tree', x: 14.6, z: 2.0, s: 1.25 }, { kind: 'tree', x: 11.6, z: 5.8, s: 0.95 }, { kind: 'tree', x: 15.4, z: -2.6, s: 1.0, pine: true },
    { kind: 'tree', x: -15.2, z: -5.8, s: 1.2, pine: true }, { kind: 'tree', x: -11.8, z: -11.6, s: 1.15 }, { kind: 'tree', x: -15.8, z: 1.0, s: 1.05 },
    { kind: 'tree', x: 7.2, z: 13.6, s: 1.15 }, { kind: 'tree', x: -7.8, z: 13.8, s: 1.2, pine: true }, { kind: 'tree', x: 12.8, z: 10.6, s: 1.0, pine: true },
    { kind: 'tree', x: -12.6, z: 10.2, s: 1.1 }, { kind: 'tree', x: 5.6, z: -16.6, s: 1.0, pine: true }, { kind: 'tree', x: -2.6, z: -16.8, s: 1.1 }, { kind: 'tree', x: 13.4, z: -9.8, s: 1.05 },
    { kind: 'bush', x: 3.2, z: 11.4 }, { kind: 'bush', x: -3.4, z: 11.2, berries: true }, { kind: 'bush', x: 9.4, z: -5.6 }, { kind: 'bush', x: -8.6, z: -5.2, berries: true },
    { kind: 'bush', x: 12.8, z: -6.2 }, { kind: 'bush', x: -4.2, z: -13.4 }, { kind: 'bush', x: 4.8, z: -9.0, berries: true }
  ];
  var SHARDS = [{ id: 'shard-east', x: 13.0, z: 1.6 }, { id: 'shard-west', x: -12.6, z: -4.6 }, { id: 'shard-north', x: 8.0, z: -13.6 }];
  var PATHS = [[[0, 19], [0, 13], [0, 9.6], [0, 7]], [[0, -4.5], [0, -8.6]], [[6.6, 1.2], [10, 1.5], [13, 1.6]], [[-6.6, 0.6], [-9.6, -2.4], [-12.6, -4.6]], [[3.4, -6.4], [6.4, -10.4], [8, -13.6]]];
  var KEEPER = { id: 'keeper', x: 2.7, z: -8.4, yaw: 0, look: { base: 'keeper' } };
  var TEXT = {
    title: 'SUNSHARD ISLE', sub: 'Find the three sun shards and relight the beacon',
    obj1: 'Find the sun shards', obj2: 'Bring the shards to the Keeper', objTalk: 'Listen to the Keeper', obj3: 'The beacon burns again',
    keeperGreet: 'Over here, traveller!',
    keeperNeed: ['The storm put out our beacon and scattered its sun shards.', 'Three of them fell on this isle. Bring them back to me.'],
    keeperDone: ['You found all three! Hand them here and stand back...', 'Now watch the top of the beacon. Ships will find their way home tonight.']
  };

  // ======================================================================= 2. Game object
  var glCanvas = document.getElementById('gl'), ui = document.getElementById('ui'), g = ui.getContext('2d');
  var game = window.GAME = {
    addons: [], opt: OPT, phase: 'title', shards: 0, need: NEED, frame: 0, worldFrame: 0, time: 0,
    clock: { frame: 0, worldFrame: 0, paused: false }, autoplay: { on: OPT.auto, decide: null, goal: null },
    flags: { builtinBurst: true, builtinBubble: true, builtinHud: true },
    npcs: [], talk: null, toasts: [], bubbles: {}, result: null, ui: ui, gl: glCanvas
  };
  function each(name) {
    var args = Array.prototype.slice.call(arguments, 1), out;
    for (var i = 0; i < game.addons.length; i++) {
      var a = game.addons[i], f = a && a[name]; if (typeof f !== 'function') continue;
      try { var r = f.apply(a, args.concat([game])); if (r !== undefined && out === undefined) out = r; } catch (e) { console.error('addon ' + (a.name || i) + '.' + name, e); }
    }
    return out;
  }
  game.each = each;
  game.toast = function (text, ms) { game.toasts.push({ text: text, until: game.time + (ms || 2400) }); };
  game.say = function (id, text, ms) { game.bubbles[id] = { text: text, until: game.time + (ms || 2600) }; };
  function setPhase(p) { if (game.phase === p) return; game.phase = p; each('onPhase', p); }

  // ======================================================================= 3. World
  var TP = game.TP = TP3.create({ THREE: THREE, canvas: glCanvas, overlay: ui, seed: OPT.seed,
    glCheck: Q.get('glcheck') === '1', params: { palette: OPT.palette, gear: OPT.gear, shadows: OPT.shadows, maxDpr: OPT.dpr }, onEvent: function (ev) { worldEvent(ev); } });
  game.three = TP.ok ? { THREE: THREE, scene: TP.scene, camera: TP.camera, renderer: TP.renderer } : null;
  var hero = null, keeper = null, beacon = null;
  if (TP.ok) {
    TP.buildIsland({ radius: 20, seed: OPT.seed + 4 });
    PATHS.forEach(function (p) { TP.paint.path(p, 1.5); });
    TP.paint.plaza(0, 1, 1.9, 6.4);
    TP.paint.plaza(0, -11, 2.5, 3.6);
    TP.paint.flowers(-3, 13, 2.5, ['#f6f0e0', '#f2c84a'], 120); TP.paint.flowers(11, -6, 3, ['#e86a8a', '#f6f0e0'], 120); TP.paint.flowers(-11, 8, 3, ['#b48ae6', '#f2c84a'], 120);
    TP.paint.done();
    var props = TP.buildLayout(LAYOUT);
    beacon = props[LAYOUT.findIndex(function (p) { return p.kind === 'beacon'; })];
    TP.scatter({ count: 900, flowers: 160, seed: OPT.seed + 9, avoid: function (x, z) {
      if (Math.hypot(x, z - 1) < 6.8 || Math.hypot(x, z + 11) < 3.9) return true;
      for (var i = 0; i < PATHS.length; i++) for (var j = 0; j < PATHS[i].length - 1; j++) {
        var a = PATHS[i][j], b = PATHS[i][j + 1], vx = b[0] - a[0], vz = b[1] - a[1], L2 = vx * vx + vz * vz, t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / L2));
        if (Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t) < 1.1) return true;
      }
      return false;
    } });
    hero = TP.addActor({ id: 'hero', kind: 'hero', x: 0, z: 14.5, yaw: Math.PI });
    TP.setHero('hero'); TP.snapCamera(0);
    keeper = TP.addActor({ id: KEEPER.id, kind: 'npc', x: KEEPER.x, z: KEEPER.z, yaw: KEEPER.yaw, look: KEEPER.look, height: 1.75 });
    SHARDS.forEach(function (s) { TP.addPickup(s); });
  }
  // NPCs: talkable characters. addNPC is an extension point (see README)
  game.addNPC = function (o) {
    if (!TP.ok) return null;
    var a = TP.actor(o.id) || TP.addActor({ id: o.id, kind: 'npc', x: o.x, z: o.z, yaw: o.yaw || 0, look: o.look || { base: 'villager' }, height: o.height });
    var npc = { id: o.id, actor: a, name: o.name || o.id, lines: o.lines || ['...'], greet: o.greet || null, waveNear: o.waveNear !== false, near: o.near || 4,
      talkR: o.talkR || 2.2, onTalk: o.onTalk || null, greeted: false, waving: 0 };
    game.npcs.push(npc); return npc;
  };
  game.addNPC({ id: 'keeper', name: 'Keeper', greet: TEXT.keeperGreet, onTalk: keeperTalk, near: 6 });
  game.addActor = function (o) { return TP.addActor(o); };
  game.actors = function () { return TP.actors(); };
  game.anchor = function (id) { return TP.anchor(id); };
  game.worldToScreen = function (x, y, z) { return TP.project(x, y, z); };
  game.addPickup = function (o) { return TP.addPickup(o); };
  game.hero = hero; game.keeper = keeper; game.beacon = beacon;

  // ======================================================================= 4. Events: pickups, talking, the beacon
  function worldEvent(ev) {
    if (ev.type === 'pickup' && ev.kind === 'shard') {
      game.shards += ev.value; game.toast('Sun shard ' + game.shards + ' / ' + NEED);
      if (game.shards >= NEED) { game.toast('All shards found! Return to the Keeper', 3200); game.say('keeper', 'You have them all!', 3000); }
    }
    if (ev.type === 'pickup') each('onPickup', ev);
    each('onEvent', ev);
  }
  function keeperTalk() { return game.shards >= NEED ? TEXT.keeperDone : TEXT.keeperNeed; }
  function startTalk(npc) {
    var lines = npc.onTalk ? npc.onTalk(npc, game) : npc.lines;
    game.talk = { npc: npc, lines: lines, i: 0, shown: 0, since: game.time };
    hero.target = npc.id; npc.actor.target = 'hero'; npc.actor.play(null); npc.waving = 0; delete game.bubbles[npc.id];
    setPhase('talk'); each('onTalk', npc.id, npc);
  }
  function advanceTalk() {
    var tk = game.talk; if (!tk) return;
    var full = tk.lines[tk.i].length; if (tk.shown < full) { tk.shown = full; return; }
    tk.i++; tk.shown = 0; tk.since = game.time;
    if (tk.i >= tk.lines.length) {
      var npc = tk.npc; game.talk = null; hero.target = null;
      if (npc.id === 'keeper' && game.shards >= NEED) lightBeacon(); else setPhase('play');
    }
  }
  function lightBeacon() {
    setPhase('victory'); game.result = { at: game.time };
    var cry = beacon.userData.crystal, glow = beacon.userData.glow, light = new THREE.PointLight(0xffc870, 0, 18, 1.6);
    light.position.set(0, 4.6, -11); TP.scene.add(light);
    var t0 = game.time;
    TP.animate(function () {
      var k = Math.min(1, (game.time - t0) / 1500);
      cry.material.color.setHex(0xffe6a0); cry.material.emissive.setRGB(0.95 * k, 0.65 * k, 0.2 * k); glow.material.opacity = 0.95 * k;
      glow.scale.setScalar(5 + Math.sin(game.time / 300) * 0.4); cry.rotation.y += 0.02; light.intensity = 2.2 * k;
    });
    if (game.flags.builtinBurst) for (var i = 0; i < 3; i++) TP.burst(0, 4.4 + i * 0.3, -11, 0xffe08a, 22);
    hero.play('cheer'); keeper.play('cheer');
    each('onEnd', 'victory');
  }

  // ======================================================================= 5. Autoplay
  function autoInput() {
    if (game.autoplay.decide) { var d = game.autoplay.decide(game); if (d) return d; }
    var goal = null, id = null;
    if (game.shards < NEED) {
      var best = null, bd = 1e9; TP.pickups().forEach(function (p) { if (p.taken || p.kind !== 'shard') return; var d2 = Math.hypot(p.x - hero.x, p.z - hero.z); if (d2 < bd) { bd = d2; best = p; } });
      if (best) { goal = { x: best.x, z: best.z }; id = best.id; }
    }
    if (!goal) { goal = { x: keeper.x, z: keeper.z + 1.6 }; id = 'keeper'; }
    game.autoplay.goal = id; hero.target = id;
    var inp = TP.autopilot(goal, { near: id === 'keeper' ? 0.5 : 0.3 });
    if (inp.arrived && id === 'keeper') inp.ok = true;
    return inp;
  }

  // ======================================================================= 6. Input
  var held = {}, queue = [], KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ShiftLeft: 'walk', ShiftRight: 'walk', Space: 'ok', Enter: 'ok', KeyF: 'ok', KeyQ: 'camL', KeyE: 'camR', Escape: 'pause', KeyP: 'auto' };
  addEventListener('keydown', function (e) {
    var k = KEYMAP[e.code]; if (!k) return; e.preventDefault();
    if (!held[k]) queue.push(k); held[k] = true;
    if (game.autoplay.on && game.phase !== 'title' && /up|down|left|right/.test(k)) { game.autoplay.on = false; game.toast('Autoplay off'); }
  });
  addEventListener('keyup', function (e) { var k = KEYMAP[e.code]; if (k) held[k] = false; });
  addEventListener('blur', function () { held = {}; });
  // pointer: drag to turn the camera; on touch, a stick (bottom left) and a TALK button (bottom right)
  var stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, drag = { id: null, x: 0, y: 0 }, touchUI = OPT.touch;
  function talkBtn() { var s = TP.size ? TP.size() : { w: ui.clientWidth, h: ui.clientHeight }; return { x: s.w - 78, y: s.h - 92, r: 40 }; }
  ui.addEventListener('pointerdown', function (e) {
    var r = ui.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (e.pointerType === 'touch') touchUI = true;
    if (game.phase === 'title' || game.phase === 'end') { queue.push('ok'); return; }
    var b = talkBtn();
    if (touchUI && Math.hypot(x - b.x, y - b.y) < b.r + 10) { queue.push('ok'); return; }
    if (touchUI && x < r.width * 0.45 && y > r.height * 0.35 && stick.id == null) { stick.id = e.pointerId; stick.ox = x; stick.oy = y; stick.x = 0; stick.y = 0; ui.setPointerCapture(e.pointerId); return; }
    drag.id = e.pointerId; drag.x = x; drag.y = y; ui.setPointerCapture(e.pointerId);
  });
  ui.addEventListener('pointermove', function (e) {
    var r = ui.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (e.pointerId === stick.id) { var dx = x - stick.ox, dy = y - stick.oy, d = Math.hypot(dx, dy), m = 56; if (d > m) { dx *= m / d; dy *= m / d; } stick.x = dx / m; stick.y = -dy / m; if (game.autoplay.on && d > 12) game.autoplay.on = false; }
    else if (e.pointerId === drag.id && TP.ok) { TP.rotateCamera(-(x - drag.x) * 0.006, (y - drag.y) * 0.004); drag.x = x; drag.y = y; }
  });
  function up(e) { if (e.pointerId === stick.id) { stick.id = null; stick.x = stick.y = 0; } if (e.pointerId === drag.id) drag.id = null; }
  ui.addEventListener('pointerup', up); ui.addEventListener('pointercancel', up);
  game.virtualKey = function (k, down) { if (down && !held[k]) queue.push(k); held[k] = !!down; };
  function handleKey(k) {
    if (each('onKey', k) === true) return;
    if (k === 'auto') { game.autoplay.on = !game.autoplay.on; game.toast('Autoplay ' + (game.autoplay.on ? 'on' : 'off')); return; }
    if (k === 'pause' && (game.phase === 'play' || game.phase === 'talk')) { game.clock.paused = !game.clock.paused; return; }
    if (k !== 'ok') return;
    if (game.phase === 'title') { setPhase('play'); game.toast('Find the three sun shards', 2600); return; }
    if (game.phase === 'end') { location.search = OPT.auto ? '?auto=1' : ''; return; }
    if (game.phase === 'talk') { advanceTalk(); return; }
    if (game.phase === 'play') { var n = nearNPC(); if (n) startTalk(n); }
  }
  function nearNPC() {
    var best = null, bd = 1e9;
    game.npcs.forEach(function (n) { var d = Math.hypot(n.actor.x - hero.x, n.actor.z - hero.z); if (d < n.talkR && d < bd) { bd = d; best = n; } });
    return best;
  }
  game.nearNPC = nearNPC;

  // ======================================================================= 7. Main step (fixed 60 Hz; also run by the ?t= fast-forward)
  var DT = 1 / 60;
  function step() {
    game.frame++; game.clock.frame = game.frame; game.time += DT * 1000;
    while (queue.length) handleKey(queue.shift());
    var hold = game.clock.paused;
    for (var gi = 0; gi < game.addons.length && !hold; gi++) { var ad = game.addons[gi]; if (ad && typeof ad.gate === 'function') { try { if (ad.gate(game) === false) hold = true; } catch (e) { console.error(e); } } }
    if (TP.ok && !hold) {
      var inp = { x: 0, y: 0, run: null };
      if (game.phase === 'title') {
        TP.rotateCamera(0.0025, 0); TP.cam.lastManual = -99;
        if (game.autoplay.on && game.time > 900) handleKey('ok');
      } else if (game.phase === 'play') {
        if (game.autoplay.on) { inp = autoInput(); if (inp.ok) queue.push('ok'); }
        else {
          inp.x = (held.right ? 1 : 0) - (held.left ? 1 : 0) + stick.x; inp.y = (held.up ? 1 : 0) - (held.down ? 1 : 0) + stick.y;
          var m = Math.hypot(inp.x, inp.y); if (m > 1) { inp.x /= m; inp.y /= m; }
          inp.run = stick.id != null ? null : !held.walk;
        }
      } else if (game.phase === 'talk') {
        if (game.autoplay.on && game.time - game.talk.since > 1400) queue.push('ok');
      }
      if (held.camL) inp.camYaw = 1.8 * DT; if (held.camR) inp.camYaw = -1.8 * DT;
      npcLogic();
      frameScene();
      TP.step(inp, DT);
      if (game.talk) { var tk = game.talk; tk.shown = Math.min(tk.lines[tk.i].length, tk.shown + 1.4); }
      if (game.phase === 'victory' && game.time - game.result.at > 3200) setPhase('end');
      game.worldFrame++; game.clock.worldFrame = game.worldFrame;
      each('onStep', { dt: DT, t: game.time, frame: game.worldFrame });
    }
    each('update', { dt: hold ? 0 : DT * 1000, frozen: !!OPT.freeze, paused: game.clock.paused, t: game.time });
    game.toasts = game.toasts.filter(function (t) { return t.until > game.time; });
  }
  // while talking and at the end the camera swings round behind the hero to frame the beacon (the payoff)
  function frameScene() {
    if (!(game.phase === 'talk' && game.talk && game.talk.npc.id === 'keeper') && game.phase !== 'victory' && game.phase !== 'end') return;
    if (game.frameAt == null) game.frameAt = game.time;
    if (!game.frameYaw || game.time - game.frameAt < 500) {   // re-pick while the focus settles on the hero
      var base = Math.atan2(hero.x - 0, hero.z + 11), best = base, bestD = -1;
      for (var o = -1.4; o <= 1.41; o += 0.1) { var dd = TP.probeCamera(base + o, 0.32) - 1.2 * Math.abs(o); if (dd > bestD) { bestD = dd; best = base + o; } }
      game.frameYaw = best;
    }
    var want = game.frameYaw, d = ((want - TP.cam.yaw) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    var end = game.phase !== 'talk', k = Math.min(1, 2 * DT);
    TP.rotateCamera(d * Math.min(1, 2.5 * DT), ((end ? 0.3 : 0.32) - TP.cam.pitch) * k);
    TP.cam.lift += ((end ? 1.7 : 1.3) - TP.cam.lift) * k; TP.cam.distMul += ((end ? 1.3 : 1.2) - TP.cam.distMul) * k;
  }
  function npcLogic() {
    game.npcs.forEach(function (n) {
      var a = n.actor, d = Math.hypot(a.x - hero.x, a.z - hero.z);
      if (game.talk && game.talk.npc === n) return;
      if (d < n.near) {
        a.target = 'hero';
        if (!n.greeted && n.greet) { n.greeted = true; if (game.flags.builtinBubble) game.say(n.id, n.greet, 2600); if (n.waveNear) n.waving = 110; }
      } else if (d > n.near + 1.5) { a.target = null; n.greeted = d > n.near + 6 ? false : n.greeted; }
      if (n.waving > 0) { n.waving--; a.play(n.waving > 0 ? 'wave' : null); }
      if (game.phase === 'victory' || game.phase === 'end') { a.target = 'hero'; }
    });
  }

  // ======================================================================= 8. Drawing (3D render, then the 2D overlay in CSS px)
  var dpr = 1, W = 1, H = 1;
  function resize() {
    var r = glCanvas.parentNode.getBoundingClientRect(); W = Math.max(1, r.width | 0); H = Math.max(1, r.height | 0);
    dpr = Math.min(window.devicePixelRatio || 1, OPT.dpr); ui.width = Math.round(W * dpr); ui.height = Math.round(H * dpr);
    if (TP.ok) TP.resize(W, H); else { glCanvas.width = ui.width; glCanvas.height = ui.height; }
  }
  addEventListener('resize', resize);
  var FONT = "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif", SERIF = "Georgia, 'Times New Roman', serif";
  function panel(x, y, w, h, r, a) {
    g.save(); g.globalAlpha = a == null ? 1 : a;
    g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h);
    var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(34,40,66,0.86)'); gr.addColorStop(1, 'rgba(18,22,40,0.9)');
    g.fillStyle = gr; g.fill(); g.lineWidth = 1.5; g.strokeStyle = 'rgba(232,200,106,0.75)'; g.stroke();
    g.beginPath(); g.roundRect ? g.roundRect(x + 3, y + 3, w - 6, h - 6, Math.max(1, r - 3)) : g.rect(x + 3, y + 3, w - 6, h - 6); g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.08)'; g.stroke();
    g.restore();
  }
  function shardIcon(x, y, s, on) {
    g.save(); g.translate(x, y);
    if (on) { var gl2 = g.createRadialGradient(0, 0, 0, 0, 0, s * 1.6); gl2.addColorStop(0, 'rgba(255,220,120,0.6)'); gl2.addColorStop(1, 'rgba(255,200,80,0)'); g.fillStyle = gl2; g.fillRect(-s * 2, -s * 2, s * 4, s * 4); }
    g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.62, 0); g.lineTo(0, s); g.lineTo(-s * 0.62, 0); g.closePath();
    g.fillStyle = on ? '#ffd45e' : 'rgba(255,255,255,0.08)'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = on ? '#fff2c0' : 'rgba(232,200,106,0.55)'; g.stroke();
    if (on) { g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.62, 0); g.lineTo(0, 0); g.closePath(); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill(); }
    g.restore();
  }
  function wrap(text, maxW) { var words = text.split(' '), lines = [], cur = ''; words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur); return lines; }
  function bubble(id, text) {
    var a = TP.anchor(id); if (!a || !a.visible) return;
    g.font = '600 14px ' + FONT; var lines = wrap(text, 200), w = Math.max.apply(null, lines.map(function (l) { return g.measureText(l).width; })) + 22, h = lines.length * 18 + 14;
    var x = Math.max(8, Math.min(W - w - 8, a.x - w / 2)), y = Math.max(8, a.y - h - 16);
    g.save(); g.fillStyle = 'rgba(255,250,236,0.96)'; g.strokeStyle = 'rgba(60,44,30,0.85)'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 9) : g.rect(x, y, w, h); g.fill(); g.stroke();
    var tx = Math.max(x + 12, Math.min(x + w - 12, a.x)); g.beginPath(); g.moveTo(tx - 7, y + h - 0.5); g.lineTo(tx, y + h + 10); g.lineTo(tx + 7, y + h - 0.5); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(tx - 7, y + h); g.lineTo(tx, y + h + 10); g.lineTo(tx + 7, y + h); g.stroke();
    g.fillStyle = '#3a2a1e'; g.textAlign = 'left'; lines.forEach(function (l, i) { g.fillText(l, x + 11, y + 21 + i * 18); }); g.restore();
  }
  function hud() {
    var sc = W < 520 ? 0.86 : 1, obj = game.phase === 'victory' || game.phase === 'end' ? TEXT.obj3 : game.phase === 'talk' && game.shards >= NEED ? TEXT.objTalk : game.shards >= NEED ? TEXT.obj2 : TEXT.obj1;
    g.font = '600 14px ' + FONT; var pw = Math.max(200, g.measureText(obj).width + 30), px = 14, py = 14;
    panel(px, py, pw * sc, 64 * sc, 10);
    g.save(); g.translate(px, py); g.scale(sc, sc);
    g.fillStyle = '#e8c86a'; g.font = '700 11px ' + FONT; g.textAlign = 'left'; g.fillText('SUN SHARDS', 14, 21);
    for (var i = 0; i < NEED; i++) shardIcon(110 + i * 30, 17, 9, i < game.shards);
    g.fillStyle = '#f2ead8'; g.font = '600 14px ' + FONT; g.fillText(obj, 14, 48);
    g.restore();
    if (game.autoplay.on && game.phase !== 'title') { g.font = '700 11px ' + FONT; var apw = g.measureText('AUTOPLAY  P').width + 22; panel(W - 14 - apw, 14, apw, 24, 12, 0.9); g.textAlign = 'center'; g.fillStyle = '#e8c86a'; g.fillText('AUTOPLAY  P', W - 14 - apw / 2, 30); }
    // talk prompt
    var n = game.phase === 'play' && nearNPC();
    if (n) {
      var label = (touchUI ? 'TALK' : 'Space') + '   Talk to ' + n.name; g.font = '700 14px ' + FONT; var w = g.measureText(label).width + 34;
      panel(W / 2 - w / 2, H - 70, w, 36, 18, 0.95); g.fillStyle = '#f2ead8'; g.textAlign = 'center'; g.fillText(label, W / 2, H - 47);
    }
    // toasts
    game.toasts.forEach(function (t, i) {
      var a = Math.min(1, (t.until - game.time) / 150); if (a < 0.2) return; g.font = '700 15px ' + FONT; var w = g.measureText(t.text).width + 36;
      panel(W / 2 - w / 2, 18 + i * 44 + (W < 560 ? 70 : 0), w, 34, 17, a); g.globalAlpha = a; g.fillStyle = '#ffe6a0'; g.textAlign = 'center'; g.fillText(t.text, W / 2, 40 + i * 44 + (W < 560 ? 70 : 0)); g.globalAlpha = 1;
    });
  }
  function dialog() {
    var tk = game.talk; if (!tk) return;
    var w = Math.min(640, W - 24), h = 104, x = (W - w) / 2, y = H - h - 16 - (touchUI ? 132 : 0);
    g.fillStyle = '#141a30'; g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 12) : g.rect(x, y, w, h); g.fill();
    panel(x, y, w, h, 12, 1);
    g.font = '700 13px ' + FONT; var nm = tk.npc.name.toUpperCase(), nw = g.measureText(nm).width + 26;
    panel(x + 16, y - 15, nw, 28, 8, 1); g.fillStyle = '#e8c86a'; g.textAlign = 'left'; g.fillText(nm, x + 29, y + 4);
    g.font = '16px ' + FONT; g.fillStyle = '#f2ead8';
    wrap(tk.lines[tk.i].slice(0, Math.floor(tk.shown)), w - 40).forEach(function (l, i) { g.fillText(l, x + 20, y + 40 + i * 22); });
    if (tk.shown >= tk.lines[tk.i].length) {
      g.font = '700 11px ' + FONT; g.textAlign = 'right'; g.fillStyle = 'rgba(232,200,106,0.85)'; g.fillText((touchUI ? 'TALK' : 'Space') + '  next', x + w - 34, y + h - 15);
      if (Math.floor(game.time / 400) % 2) { g.fillStyle = '#e8c86a'; g.beginPath(); g.moveTo(x + w - 26, y + h - 23); g.lineTo(x + w - 16, y + h - 23); g.lineTo(x + w - 21, y + h - 16); g.fill(); }
      g.textAlign = 'left';
    }
  }
  function titleScreen() {
    var gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(10,16,34,0.55)'); gr.addColorStop(0.5, 'rgba(10,16,34,0.05)'); gr.addColorStop(1, 'rgba(10,16,34,0.6)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    var big = Math.max(30, Math.min(64, W / 11)); g.textAlign = 'center';
    g.font = '700 ' + big + 'px ' + SERIF; g.lineWidth = 6; g.strokeStyle = 'rgba(30,20,10,0.7)'; g.strokeText(TEXT.title, W / 2, H * 0.3);
    var tg = g.createLinearGradient(0, H * 0.3 - big, 0, H * 0.3); tg.addColorStop(0, '#fff2c0'); tg.addColorStop(1, '#e8a83a'); g.fillStyle = tg; g.fillText(TEXT.title, W / 2, H * 0.3);
    g.font = 'italic ' + Math.max(14, big * 0.32) + 'px ' + SERIF; g.fillStyle = '#f2ead8'; g.fillText(TEXT.sub, W / 2, H * 0.3 + big * 0.62);
    for (var i = 0; i < 3; i++) shardIcon(W / 2 - 30 + i * 30, H * 0.3 + big * 1.15, 9, true);
    if (Math.floor(game.time / 600) % 2 === 0) { g.font = '700 16px ' + FONT; g.fillStyle = '#ffe6a0'; g.fillText(touchUI ? 'Tap to start' : 'Press Enter to start', W / 2, H * 0.78); }
    g.font = '13px ' + FONT; g.fillStyle = 'rgba(242,234,216,0.85)';
    g.fillText(touchUI ? 'Left stick: move   Drag: camera   TALK: talk' : 'WASD / arrows: move   Shift: walk   Drag or Q / E: camera   Space: talk', W / 2, H * 0.78 + 26);
  }
  function endScreen() {
    var k = game.phase === 'end' ? 1 : Math.min(1, (game.time - game.result.at) / 1200);
    g.fillStyle = 'rgba(255,200,110,' + (0.06 * k).toFixed(3) + ')'; g.fillRect(0, 0, W, H);
    var big = Math.max(26, Math.min(52, W / 13)); g.textAlign = 'center'; g.globalAlpha = k;
    g.font = '700 ' + big + 'px ' + SERIF; g.lineWidth = 6; g.strokeStyle = 'rgba(30,20,10,0.7)'; g.strokeText('THE BEACON BURNS', W / 2, H * 0.13 + big * 0.4);
    g.fillStyle = '#fff0c0'; g.fillText('THE BEACON BURNS', W / 2, H * 0.13 + big * 0.4);
    if (game.phase === 'end') {
      var msg = 'Shards returned in ' + (game.result.at / 1000).toFixed(1) + ' s'; g.font = '600 15px ' + FONT; var mw = g.measureText(msg).width + 36;
      var my = H * 0.13 + big * 0.4 + 16; panel(W / 2 - mw / 2, my, mw, 30, 15, 0.95); g.fillStyle = '#f2ead8'; g.textAlign = 'center'; g.fillText(msg, W / 2, my + 20);
      var again = touchUI ? 'Tap to play again' : 'Press Enter to play again'; g.font = '700 15px ' + FONT; var aw = g.measureText(again).width + 40;
      panel(W / 2 - aw / 2, H - 52, aw, 34, 17, 0.95); g.fillStyle = Math.floor(game.time / 600) % 2 === 0 ? '#ffe6a0' : '#c8b88a'; g.textAlign = 'center'; g.fillText(again, W / 2, H - 30);
    }
    g.globalAlpha = 1;
  }
  function touchControls() {
    if (!touchUI || game.phase === 'title' || game.phase === 'end' || game.phase === 'victory') return;
    var bx = stick.id != null ? stick.ox : 92, by = stick.id != null ? stick.oy : H - 110;
    g.save(); g.globalAlpha = 0.85; g.fillStyle = 'rgba(20,26,44,0.45)'; g.strokeStyle = 'rgba(232,200,106,0.7)'; g.lineWidth = 2;
    if (!game.talk) { g.beginPath(); g.arc(bx, by, 56, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(242,234,216,0.9)'; g.beginPath(); g.arc(bx + stick.x * 56, by - stick.y * 56, 24, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(20,26,44,0.45)'; }
    var b = talkBtn(); g.fillStyle = nearNPC() || game.talk ? 'rgba(232,200,106,0.9)' : 'rgba(20,26,44,0.55)'; g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = nearNPC() || game.talk ? '#2a2030' : '#f2ead8'; g.font = '700 13px ' + FONT; g.textAlign = 'center'; g.fillText('TALK', b.x, b.y + 5); g.restore();
  }
  game.uiRects = function () {
    var r = [{ name: 'hud', x: 14, y: 14, w: 214, h: 64 }];
    if (game.talk) r.push({ name: 'dialog', x: (W - Math.min(640, W - 24)) / 2, y: H - 120 - (touchUI ? 132 : 0), w: Math.min(640, W - 24), h: 120 });
    if (touchUI) r.push({ name: 'stick', x: 36, y: H - 166, w: 112, h: 112 }, { name: 'talk', x: W - 118, y: H - 132, w: 80, h: 80 });
    return r;
  };
  function draw() {
    if (!TP.ok) { TP.drawFallback && TP.drawFallback(); return; }
    TP.render();
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    each('draw', g, 'world');
    for (var id in game.bubbles) { var b = game.bubbles[id]; if (b.until > game.time && game.phase !== 'title') bubble(id, b.text); }
    if (game.phase === 'title') titleScreen();
    else if (game.flags.builtinHud) { hud(); dialog(); touchControls(); }
    if (game.phase === 'victory' || game.phase === 'end') endScreen();
    if (game.clock.paused) { g.fillStyle = 'rgba(10,14,28,0.5)'; g.fillRect(0, 0, W, H); g.fillStyle = '#f2ead8'; g.font = '700 28px ' + SERIF; g.textAlign = 'center'; g.fillText('PAUSED', W / 2, H / 2); }
    each('draw', g, 'hud');
    each('draw', g, 'overlay');
  }

  // ======================================================================= 9. Boot (called after the ADDONS SLOT)
  window.__state = function () {
    var s = TP.state(); s.phase = game.phase; s.shards = game.shards; s.need = NEED; s.autoplay = game.autoplay.on;
    s.actors.forEach(function (a) { if (a.id === 'hero' && game.autoplay.on && game.phase === 'play') a.target = game.autoplay.goal; });
    return s;
  };
  game.state = window.__state;
  // test hook: advance the simulation by ms (fixed steps) and draw once; used by checks with a frozen page
  window.__advance = function (ms) { var n = Math.round(ms / (DT * 1000)); for (var i = 0; i < n; i++) step(); draw(); return window.__state(); };
  game.boot = function () {
    resize(); each('init'); if (TP.ok) TP.precompile();
    if (!TP.ok) { draw(); window.__frozen = true; return; }
    if (OPT.t != null) {
      var n = Math.round(OPT.t / (DT * 1000)); for (var i = 0; i < n; i++) step();
      draw(); document.documentElement.setAttribute('data-state', JSON.stringify({ phase: game.phase, shards: game.shards, t: Math.round(game.time) }));
      if (OPT.freeze) { window.__frozen = true; return; }
    }
    var acc = 0, last = performance.now();
    (function loop(now) {
      acc += Math.min(100, now - last); last = now; var n = 0;
      while (acc >= DT * 1000 && n < 5) { step(); acc -= DT * 1000; n++; }
      draw(); requestAnimationFrame(loop);
    })(last);
  };
})();
