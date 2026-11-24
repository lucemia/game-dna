/* Thornvale: A-05 sword-combat starter. Four rooms of real-time sword fights on the map, a sealed hall, a boss and a shrine.
   Sections are marked "=== n." (see starter/README.md). Addons plug in through the ADDONS SLOT after this script. */
(function () {
  'use strict';

  // ======================================================================= 1. Config and content
  const W = 256, H = 224, HUD = 16, FH = H - HUD, T = 16, COLS = 16, ROWS = 13, FRAME_MS = 1000 / 60;
  const Q = new URLSearchParams(location.search);
  const OPT = {
    t: Q.has('t') ? Math.max(0, Number(Q.get('t')) || 0) : null, freeze: Q.get('freeze') === '1', seed: (Number(Q.get('seed')) || 11) >>> 0,
    overlay: Q.get('overlay') === 'on', dirs: Q.get('dirs') === '8' ? 8 : 4, hearts: Math.max(1, Math.min(10, Number(Q.get('hearts')) || 5))
  };
  OPT.auto = Q.get('auto') === '1' || (OPT.t !== null && Q.get('auto') !== '0');
  const HERO_SPEED = 1.25, HERO_DIAG = 0.9;
  // Tiles: . grass  f flowers  = path  T tree  b bush  o rock  ~ water  # ruin wall  _ stone floor  I pillar  G sealed gate  S shrine
  const SOLID = new Set(['T', 'b', 'o', '~', '#', 'I', 'G', 'S']);
  const TILE_ART = { '.': 'grass', f: 'flowers', '=': 'path', T: 'tree', b: 'bush', o: 'rock', '~': 'water', '#': 'wall', _: 'floor', I: 'pillar', G: 'gate', S: 'floor' };
  const ROOMS = {
    meadow: {
      name: 'MEADOW GATE', short: 'MEADOW', grid: [
        'TTTTTTTTTTTTTTTT',
        'T.f....T.....f.T',
        'T..b.......b...T',
        'T.....f........T',
        'T.o.......T....T',
        'T.....=........T',
        'T.....=========.',
        'T.....=........=',
        'T..T..=...f....T',
        'T.....=......o.T',
        'T.f...=...b....T',
        'T.....=........T',
        'TTTTTTTTTTTTTTTT'],
      exits: { east: 'wood' },
      enemies: [{ id: 'slime-1', look: 'slime', tx: 9, ty: 3 }, { id: 'slime-2', look: 'slime', tx: 12, ty: 9 }, { id: 'slime-3', look: 'slime', tx: 3, ty: 6 }, { id: 'hound-0', look: 'hound', tx: 11, ty: 5 }]
    },
    wood: {
      name: 'OLD WOOD', short: 'WOOD', grid: [
        'TTTTTTT==TTTTTTT',
        'T......==...T..T',
        'T.TT...==......T',
        'T.TT...=.....~~T',
        'T......=....~~~T',
        'T..b...=.....~.T',
        '========.......T',
        '=..............T',
        'T....T....TT...T',
        'T.o..T....TT.b.T',
        'T..........f...T',
        'T...b.....f....T',
        'TTTTTTTTTTTTTTTT'],
      exits: { west: 'meadow', north: 'ruins' },
      enemies: [{ id: 'hound-1', look: 'hound', tx: 4, ty: 7 }, { id: 'hound-2', look: 'hound', tx: 3, ty: 3 }, { id: 'boar-1', look: 'boar', tx: 9, ty: 7 }, { id: 'boar-3', look: 'boar', tx: 12, ty: 10 }]
    },
    ruins: {
      name: 'BROKEN RUINS', short: 'RUINS', grid: [
        '################',
        '#______________#',
        '#_I____##____I_#',
        '#______##______#',
        '#______________#',
        '#___#______#___#',
        '#___#______#___G',
        '#______________G',
        '#_I__________I_#',
        '#__##______##__#',
        '#__##______##__#',
        '#______________#',
        '#######__#######'],
      exits: { south: 'wood', east: 'hall' }, seal: true,
      enemies: [{ id: 'archer-1', look: 'archer', tx: 3, ty: 2 }, { id: 'archer-2', look: 'archer', tx: 12, ty: 3 }, { id: 'boar-2', look: 'boar', tx: 7, ty: 5 }, { id: 'hound-3', look: 'hound', tx: 13, ty: 10 }]
    },
    hall: {
      name: 'WARDEN HALL', short: 'HALL', grid: [
        '################',
        '#_I____SS____I_#',
        '#______________#',
        '#______________#',
        '#_I__________I_#',
        '#______________#',
        '_______________#',
        '_______________#',
        '#_I__________I_#',
        '#______________#',
        '#______________#',
        '#_I__________I_#',
        '################'],
      exits: { west: 'ruins' }, boss: true,
      enemies: [{ id: 'warden', look: 'warden', tx: 7, ty: 5, boss: true }]
    }
  };
  const ROUTE = { meadow: 'east', wood: 'north', ruins: 'east', hall: 'shrine' };   // the autoplay's way through
  const SHRINE = { x: 7 * T, y: 1 * T, w: 32, h: 16 };
  const DIRV = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] };
  const OPP = { east: 'west', west: 'east', north: 'south', south: 'north' };

  // ======================================================================= 2. Game object (public surface, extension points)
  const game = {
    W, H, HUD, FH, T, addons: [],
    flags: { builtinHitStop: true, builtinShake: true, builtinSparks: true, builtinFlash: true, builtinEnemyFlash: true },
    field: { x: 0, y: HUD, w: W, h: FH },
    clock: { frame: 0, worldFrame: 0, paused: false, stop: 0 },
    autoplay: { on: OPT.auto, decide: null },
    scene: 'title', room: 'meadow', hero: null, SC: null, opt: OPT,
    defeated: new Set(), sealed: true, bossDown: false, gems: 0, kills: 0, result: null, endFrame: 0
  };
  window.GAME = game;
  let rng = mulberry(OPT.seed);
  function mulberry(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function each(hook, ...args) {   // call one hook on every addon, in push order; a throwing addon never stops the game
    let out;
    for (const a of game.addons) if (a && typeof a[hook] === 'function') { try { const r = a[hook](...args, game); if (r !== undefined) out = r; } catch (e) { warnOnce(hook + (a.name || ''), e); } }
    return out;
  }
  // addons' update(game, info): both arguments are ONE object, the game extended with this frame's info
  // {dt, frozen, paused, hitStop}, so hooks written as update(info, game) work too. info.hitStop is the hold
  // left (compares like a number) and still callable like GAME.hitStop(frames).
  function tick(info) {
    const I = Object.create(game);
    I.dt = info.dt; I.frozen = info.frozen; I.paused = info.paused;
    const hs = function () { return game.hitStop.apply(game, arguments); }; hs.valueOf = () => info.hitStop; hs.toJSON = () => info.hitStop; I.hitStop = hs;
    for (const a of game.addons) if (a && typeof a.update === 'function') { try { a.update(I, I); } catch (e) { warnOnce('update' + (a.name || ''), e); } }
  }
  const warned = {};
  function warnOnce(k, e) { if (warned[k]) return; warned[k] = 1; console.warn('[Thornvale] addon hook ' + k + ' threw:', e && e.message); }

  // feedback helpers (shake and flash cover the field only; the HUD stays still)
  const fb = { hold: 0, shake: 0, shakeMax: 0, shakeLen: 1, flash: 0, flashLen: 1, flashCol: '#fff', flashA: 0.3, reduce: false };
  try { fb.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* no matchMedia */ }
  game.hitStop = f => { const n = typeof f === 'object' && f ? Math.ceil((+f.ms || 0) / FRAME_MS) : Math.round(+f || 0); fb.hold = Math.max(fb.hold, Math.min(30, n)); };
  game.hitStopMs = ms => game.hitStop({ ms });
  game.shake = (px, frames) => { if (fb.reduce) return; if (px >= fb.shakeMax * fb.shake / Math.max(1, fb.shakeLen)) { fb.shakeMax = px; fb.shake = fb.shakeLen = Math.max(1, frames | 0); } };
  game.flash = (color, frames, alpha = 0.3) => { if (fb.reduce) return; fb.flashCol = color; fb.flash = fb.flashLen = Math.max(1, frames | 0); fb.flashA = alpha; };
  game.pause = on => { game.clock.paused = on === undefined ? !game.clock.paused : !!on; };
  game.frozen = () => fb.hold > 0 || game.clock.paused;

  // ======================================================================= 3. Rooms and the combat module
  let grid = ROOMS.meadow.grid.map(r => r.split(''));
  function tileAt(c, r) {   // outside the room: the nearest edge tile, so a doorway continues outward
    c = Math.max(0, Math.min(COLS - 1, c)); r = Math.max(0, Math.min(ROWS - 1, r));
    return grid[r][c];
  }
  function solidTile(ch) { return SOLID.has(ch) && !(ch === 'G' && !game.sealed); }
  function solid(x, y, w, h) {
    for (const [px, py] of [[x, y], [x + w - 0.01, y], [x, y + h - 0.01], [x + w - 0.01, y + h - 0.01]]) if (solidTile(tileAt(Math.floor(px / T), Math.floor(py / T)))) return true;
    return false;
  }
  function makeCombat() {
    game.SC = GameDNA_SwordCombat.create({
      player: () => game.hero, playerId: 'hero', playerSprite: { w: 12, h: 16 },
      solid, bounds: { x: 0, y: 0, w: W, h: FH }, seed: OPT.seed, skin: 'pixel16',
      params: { dirs: OPT.dirs, hearts: OPT.hearts, overlay: OPT.overlay ? 'on' : 'off' },
      beforeHit: ev => { ev.screen = toScreen(ev.at); each('beforeHit', ev); },
      onHit: ev => hitSite(ev),
      onDefeat: (e, ev) => { game.defeated.add(e.id); game.kills++; if (e.boss) bossDefeated(); each('onDefeat', e, ev); },
      onHitStop: ms => { if (game.flags.builtinHitStop) game.hitStopMs(ms); },
      onPickup: d => { if (d.kind === 'gem') game.gems += d.value; return true; },
      onPlayerDown: () => { downT = 1; },
      onEvent: ev => {
        if (ev.type === 'wall' && game.flags.builtinShake) game.shake(ev.id === 'warden' ? 3 : 1, ev.id === 'warden' ? 14 : 6);
        if (ev.type === 'wall' && ev.id === 'warden') { const e = game.SC.enemy('warden'); if (e && cracks.length < 12) cracks.push({ x: Math.round(e.x + e.w / 2 + ev.dx * 14), y: Math.round(e.y + e.h / 2 + ev.dy * 10), k: cracks.length }); }
        if (ev.type === 'rage') { banner = { text: 'THE WARDEN RAGES', t: 100 }; if (game.flags.builtinFlash) game.flash('#e04848', 10, 0.3); }
        if (ev.type === 'defeat' && ev.id === 'warden' && game.flags.builtinFlash) game.flash('#ffffff', 10, 0.45);
        each('onEvent', ev);
      }
    });
  }
  function enterRoom(id, from) {
    game.room = id; grid = ROOMS[id].grid.map(r => r.split(''));
    game.SC.clear();
    for (const d of ROOMS[id].enemies) if (!game.defeated.has(d.id))
      game.SC.spawn({ id: d.id, look: d.look, x: d.tx * T + 3, y: d.ty * T + 6, hp: d.hp, boss: d.boss });
    banner = { text: ROOMS[id].name, t: 100 };
    pilot.path = null;
    each('onRoomStart', id);
    if (ROOMS[id].boss && !game.bossDown) setPhase('boss');
  }

  // ======================================================================= 4. Hit site
  // Every HP change goes through the module's hit site: sword hits, contact, charges, projectiles and game.hurt().
  function toScreen(p) { return p ? { x: Math.round(p.x), y: Math.round(p.y) + HUD } : null; }
  function hitSite(ev) {
    ev.screen = toScreen(ev.at); ev.anchor = game.anchor(ev.target);
    if (ev.target === 'hero') { if (game.flags.builtinShake) game.shake(2, 8); if (game.flags.builtinFlash && ev.killed) game.flash('#e04848', 12, 0.35); }
    else if (ev.strength === 'finisher' && game.flags.builtinShake) game.shake(ev.killed ? 2 : 1, 6);
    each('onHit', ev);
  }
  game.hurt = (id, amount, opts) => game.SC.damage(id, amount, opts);   // traps, poison, spells: same hit site
  function bossDefeated() {
    game.bossDown = true; setPhase('cleared'); banner = { text: 'THE SHRINE AWAKENS', t: 150 };
  }

  // ======================================================================= 5. Autoplay
  // A route through the rooms (clear each room, then its exit). Fighting and dodging come from the module's autopilot,
  // which scores each move by the danger met ALONG its path (projectiles, telegraphed charges, enemy bodies).
  const pilot = { path: null, goal: '', t: 0 };
  function bfs(from, isGoal) {
    const key = (c, r) => r * COLS + c, prev = new Map([[key(from[0], from[1]), -1]]), q = [from];
    while (q.length) {
      const [c, r] = q.shift();
      if (isGoal(c, r)) { const out = []; let k = key(c, r); while (k !== -1) { out.unshift([k % COLS, Math.floor(k / COLS)]); k = prev.get(k); } return out; }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || solidTile(grid[nr][nc]) || prev.has(key(nc, nr))) continue;
        prev.set(key(nc, nr), key(c, r)); q.push([nc, nr]);
      }
    }
    return null;
  }
  function heroTile() { const h = game.hero; return [Math.max(0, Math.min(COLS - 1, Math.floor((h.x + h.w / 2) / T))), Math.max(0, Math.min(ROWS - 1, Math.floor((h.y + h.h / 2) / T)))]; }
  function waypointTo(isGoal, beyond) {
    const path = bfs(heroTile(), isGoal);
    if (!path) return null;
    const n = path[Math.min(1, path.length - 1)];
    if (path.length <= 1 && beyond) return beyond;
    return { x: n[0] * T + 8, y: n[1] * T + 8 };
  }
  function autoInput() {
    const SC = game.SC, h = game.hero, here = heroTile(), live = SC.enemies();
    if (game.autoplay.decide) { try { const d = game.autoplay.decide(game); if (d) return d; } catch (e) { warnOnce('decide', e); } }
    let next = null;
    if (live.length) {   // walk (by tiles) toward the nearest enemy; the module takes over once it is in sight
      const tiles = new Set(live.map(e => Math.floor((e.x + e.w / 2) / T) + ',' + Math.floor((e.y + e.h / 2) / T)));
      next = waypointTo((c, r) => tiles.has(c + ',' + r));
    } else {
      const heart = SC.drops().find(d => d.kind === 'heart' || d.kind === 'gem');
      if (heart && (heart.kind === 'gem' || SC.hp() < SC.maxHp())) next = waypointTo((c, r) => c === Math.floor(heart.x / T) && r === Math.floor(heart.y / T), { x: heart.x, y: heart.y });
      else {
        const way = ROUTE[game.room];
        if (way === 'shrine') next = waypointTo((c, r) => r === 2 && (c === 7 || c === 8), { x: SHRINE.x + 16, y: SHRINE.y + 8 });
        else {
          const [dx, dy] = DIRV[way], edge = (c, r) => (dx > 0 && c === COLS - 1) || (dx < 0 && c === 0) || (dy < 0 && r === 0) || (dy > 0 && r === ROWS - 1);
          next = waypointTo((c, r) => edge(c, r) && !solidTile(grid[r][c]), { x: h.x + h.w / 2 + dx * 24, y: h.y + h.h / 2 + dy * 24 });
        }
      }
    }
    return SC.autopilot({ next, speed: HERO_SPEED, engage: 120 });
  }

  // ======================================================================= 6. Input (edge-latched: a 0 ms tap still swings)
  const held = new Set(), keyQ = [];
  let pressLatched = false;
  const BIND = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
    KeyZ: 'ok', Space: 'ok', Enter: 'ok', KeyJ: 'ok', KeyX: 'back', Escape: 'pause', KeyP: 'auto', KeyH: 'overlay' };
  addEventListener('keydown', e => {
    const k = BIND[e.code]; if (!k) return; e.preventDefault();
    if (['up', 'down', 'left', 'right'].includes(k)) { if (!held.has(k)) keyQ.push(k); held.add(k); return; }
    if (!e.repeat) keyQ.push(k);
  });
  addEventListener('keyup', e => { const k = BIND[e.code]; if (k) held.delete(k); });
  game.virtualKey = (k, down) => {   // on-screen buttons (touch): same queue and held set as the keyboard
    if (['up', 'down', 'left', 'right'].includes(k)) { if (down) { if (!held.has(k)) keyQ.push(k); held.add(k); } else held.delete(k); return; }
    if (down) keyQ.push(k);
  };
  addEventListener('blur', () => held.clear());
  function takeKeys() {   // the input chain: addons first (true = consumed), then the game
    while (keyQ.length) {
      const k = keyQ.shift();
      if (each('onKey', k) === true) continue;
      if (k === 'auto') { game.autoplay.on = !game.autoplay.on; continue; }
      if (k === 'overlay') { game.SC.setParams({ overlay: game.SC.params().overlay === 'on' ? 'off' : 'on' }); continue; }
      if (k === 'pause' && game.scene === 'play') { game.pause(); continue; }
      if (game.autoplay.on && ['up', 'down', 'left', 'right', 'ok'].includes(k) && game.scene === 'play') game.autoplay.on = false;   // a game key takes over
      if (k === 'ok') pressLatched = true;
    }
  }

  // ======================================================================= 7. Main step (60 Hz)
  let banner = null, intro = 0, downT = 0, slide = null, phase = '', cracks = [], burst = 0;
  function setPhase(p) { if (p === phase) return; phase = p; each('onPhase', p); }
  function newGame() {
    rng = mulberry(OPT.seed);
    game.defeated = new Set(); game.sealed = true; game.bossDown = false; game.gems = 0; game.kills = 0; game.result = null;
    game.hero = { x: 6 * T + 3, y: 10 * T + 4, w: 10, h: 8, face: 'up', walk: 0, moving: false };
    makeCombat(); game.SC.reset();
    downT = 0; slide = null; intro = 260; cracks = []; burst = 0;
    enterRoom('meadow');
    setPhase('play');
  }
  function step() {
    const C = game.clock; C.frame++;
    takeKeys();
    if (game.scene === 'title') {
      if (pressLatched || (game.autoplay.on && C.frame >= 40)) { pressLatched = false; game.scene = 'play'; newGame(); }
      tick({ dt: 0, frozen: true, paused: false, hitStop: 0 });
      return;
    }
    if (game.scene === 'victory' || game.scene === 'gameover') {
      if (pressLatched && C.frame - game.endFrame > 40) { pressLatched = false; game.scene = 'title'; C.frame = 0; setPhase('title'); }
      pressLatched = false;
      if (fb.shake > 0) fb.shake--; if (fb.flash > 0) fb.flash--; fb.hold = 0;
      game.SC.update({});   // let the last puffs and sparks finish under the result window
      tick({ dt: FRAME_MS, frozen: false, paused: false, hitStop: 0 });
      return;
    }
    // play: hit-stop gates first (addon gates such as a hit-stop module, then the built-in hold), so a frozen step changes nothing
    let frozen = false;
    for (const a of game.addons) if (a && typeof a.gate === 'function') { try { if (a.gate(game) === false) frozen = true; } catch (e) { warnOnce('gate', e); } }
    if (fb.hold > 0) { fb.hold--; frozen = true; }
    if (C.paused) frozen = true;
    if (fb.shake > 0) fb.shake--; if (fb.flash > 0) fb.flash--;
    if (!frozen) worldStep(); else C.stop++;
    tick({ dt: frozen ? 0 : FRAME_MS, frozen, paused: C.paused, hitStop: fb.hold });
  }
  function worldStep() {
    const C = game.clock, SC = game.SC, h = game.hero; C.worldFrame++;
    if (!game.flags.builtinSparks && SC.params().sparks !== 'off') SC.setParams({ sparks: 'off' });
    if (!game.flags.builtinEnemyFlash && SC.params().flash !== 'off') SC.setParams({ flash: 'off' });
    if (intro > 0) intro--;
    if (banner && --banner.t <= 0) banner = null;
    if (slide) { stepSlide(); return; }
    if (downT) { if (++downT > 70) end('gameover'); SC.update({}); return; }
    let inp;
    if (game.autoplay.on) inp = autoInput();
    else inp = { x: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0), y: (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0), attack: pressLatched };
    pressLatched = false;
    if (SC.update(inp) === false) return;
    h.moving = false;
    if (SC.canMove() && (inp.x || inp.y)) {
      const sp = inp.x && inp.y ? HERO_DIAG : HERO_SPEED;
      if (inp.x && !solid(h.x + inp.x * sp, h.y, h.w, h.h)) { h.x += inp.x * sp; h.moving = true; }
      if (inp.y && !solid(h.x, h.y + inp.y * sp, h.w, h.h)) { h.y += inp.y * sp; h.moving = true; }
      h.face = inp.x && (!inp.y || h.face === 'left' || h.face === 'right') ? (inp.x > 0 ? 'right' : 'left') : (inp.y > 0 ? 'down' : 'up');
      if (h.moving) h.walk++;
    }
    if (SC.swinging()) h.face = SC.pose().face;
    roomLogic();
  }
  function roomLogic() {
    const SC = game.SC, h = game.hero, R = ROOMS[game.room];
    if (R.seal && game.sealed && SC.count() === 0) { game.sealed = false; banner = { text: 'THE HALL GATE OPENS', t: 120 }; if (game.flags.builtinShake) game.shake(2, 20); each('onEvent', { type: 'unseal' }); }
    if (R.boss && game.bossDown && SC.count() === 0) {
      const near = { x: SHRINE.x - 2, y: SHRINE.y, w: SHRINE.w + 4, h: SHRINE.h + 6 };
      if (h.x < near.x + near.w && h.x + h.w > near.x && h.y < near.y + near.h && h.y + h.h > near.y) return end('victory');
    }
    const cx = h.x + h.w / 2, cy = h.y + h.h / 2;
    const out = cx > W ? 'east' : cx < 0 ? 'west' : cy < 0 ? 'north' : cy > FH ? 'south' : null;
    if (out && R.exits[out]) slide = { dir: out, to: R.exits[out], t: 0, len: 36 };
  }
  function stepSlide() {   // room transition: the old and new room scroll by together; the hero walks in
    slide.t++;
    if (slide.t === slide.len) {
      const [dx, dy] = DIRV[slide.dir], h = game.hero;
      if (dx) h.x = dx > 0 ? 2 : W - h.w - 2; if (dy) h.y = dy > 0 ? 4 : FH - h.h - 4;
      enterRoom(slide.to, slide.dir);
      slide = null;
    }
  }
  function end(result) {
    if (game.scene !== 'play') return;
    game.result = result; game.scene = result; game.endFrame = game.clock.frame; burst = result === 'victory' ? 1 : 0;
    setPhase(result); each('onEnd', result);
  }

  // ======================================================================= 8. Drawing
  const cv = document.getElementById('view'), g = cv.getContext('2d', { willReadFrequently: true });
  const SK = window.GameDNA_Skin ? GameDNA_Skin.resolve('pixel16') : null;
  function text(s, x, y, color, align) { if (SK) SK.text(g, s, x, y, { font: 'ui', color: color || '#ffffff', align: align || 'left' }); else { g.font = '8px monospace'; g.textBaseline = 'top'; g.textAlign = align || 'left'; g.fillStyle = color || '#fff'; g.fillText(s, x, y); } }
  function frame(r, role, team) { if (SK) SK.frame(g, r, { role: role || 'window', team: team || 'n' }); else { g.fillStyle = '#10142a'; g.fillRect(r.x, r.y, r.w, r.h); g.strokeStyle = '#fff'; g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); } }
  // Outdoor rooms (meadow, wood) are painted by the pixel scene kit: per-pixel grass, a dirt path with soft rims, a pond with
  // banks, shaded trees / pines / bushes / boulders as standing props that y-sort with the hero and enemies. Drawing only:
  // collision still reads the room grid above, tile for tile. Without the kit the plain 16 px tiles below are used.
  const PXS = window.GameDNA_PixelScene, SCENES = {}, OUTDOOR = { meadow: 11, wood: 23 };
  function sceneOf(id) {
    if (!PXS || !OUTDOOR[id]) return null;
    if (!SCENES[id]) {
      const seed = OUTDOOR[id], rows = ROOMS[id].grid;
      const edge = (c, r) => c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1;
      const map = rows.map((row, r) => row.split('').map((ch, c) => {
        const v = (c * 7 + r * 13 + seed) % 10;
        if (ch === 'T') return edge(c, r) ? (v < 3 ? 'P' : 'T') : (v < 3 ? 'P' : v < 5 ? 't' : 'T');
        return ch === '=' ? 'p' : ch === 'b' ? 'u' : ch === 'o' ? (v < 5 ? 'R' : 'r') : ch === '~' ? 'w' : ch === 'f' ? 'F' : '.';
      }).join(''));
      try { SCENES[id] = PXS.scene({ map, seed }); } catch (e) { OUTDOOR[id] = 0; return null; }
    }
    return SCENES[id];
  }
  const sceneMs = () => game.clock.worldFrame * FRAME_MS;
  function drawRoom(id, ox, oy, whole) {
    const sc = sceneOf(id);
    if (sc) { if (whole) sc.draw(g, sceneMs(), [], ox, oy); else sc.drawGround(g, sceneMs(), ox, oy); return; }
    const gr = id === game.room ? grid : ROOMS[id].grid;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      let ch = gr[r][c]; if (ch === 'G' && !game.sealed) ch = '_';
      const base = id === 'ruins' || id === 'hall' ? 'floor' : 'grass';
      const kind = ch === 'G' ? 'gate' : TILE_ART[ch] || base;
      g.drawImage(SCART.tile(kind, c, r, game.clock.worldFrame), c * T + ox, r * T + oy);
    }
    if (id === 'hall') {   // a carpet runner from the door to the shrine, braziers, cracks where the warden hit the walls
      const t = game.clock.worldFrame;
      const run = (x, y, w, h) => { g.fillStyle = '#3a1822'; g.fillRect(x + ox, y + oy, w, h); g.fillStyle = '#6a2232'; g.fillRect(x + 2 + ox, y + 2 + oy, w - 4, h - 4); g.fillStyle = '#c89a3a'; g.fillRect(x + 3 + ox, y + 3 + oy, w - 6, 1); g.fillRect(x + 3 + ox, y + h - 4 + oy, w - 6, 1); };
      run(0, 6 * T + 4, 8 * T + 12, 2 * T - 8); run(7 * T + 4, 2 * T, 2 * T - 8, 5 * T + 12);
      g.fillStyle = '#6a2232'; g.fillRect(7 * T + 6 + ox, 6 * T + 6 + oy, 2 * T - 12, 2 * T - 12);
      for (const k of cracks) { g.fillStyle = '#4a4656'; const cx = k.x + ox, cy = k.y + oy; for (let i = 0; i < 4; i++) { const a = k.k * 1.7 + i * 1.6, l = 4 + (i & 1) * 3; for (let d = 1; d < l; d++) g.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d * 0.7), 1, 1); } }
      for (const [bx, byy] of [[4, 2], [11, 2], [4, 10], [11, 10]]) {
        const x = bx * T + 4 + ox, y = byy * T + 6 + oy, fl = (t + bx * 5) >> 3 & 1;
        g.fillStyle = 'rgba(255,170,80,0.12)'; g.fillRect(x - 10, y - 6, 28, 22);
        g.fillStyle = '#2a2430'; g.fillRect(x, y + 6, 8, 4); g.fillStyle = '#6a6278'; g.fillRect(x - 1, y + 4, 10, 3); g.fillStyle = '#3a3448'; g.fillRect(x + 3, y + 10, 2, 3);
        g.fillStyle = fl ? '#ff9a3a' : '#ffc84a'; g.fillRect(x + 1, y + 1 - fl, 6, 4); g.fillStyle = '#fff2b0'; g.fillRect(x + 3, y + 2, 2, 2); g.fillStyle = '#e05a2a'; g.fillRect(x + 2 + fl, y - 1, 2, 2);
      }
    }
    if (id === 'hall') {   // the shrine: a pedestal and a crystal that wakes when the warden falls
      const lit = game.bossDown, t = game.clock.worldFrame, x = SHRINE.x + ox, y = SHRINE.y + oy;
      g.fillStyle = '#c4bcd4'; g.fillRect(x + 4, y + 8, 24, 8); g.fillStyle = '#e4dcf4'; g.fillRect(x + 4, y + 8, 24, 1); g.fillStyle = '#6a6280'; g.fillRect(x + 4, y + 15, 24, 1);
      g.fillStyle = '#10142a'; g.fillRect(x + 11, y - 9, 10, 18); g.fillStyle = lit ? ((t >> 3) & 1 ? '#9af0ff' : '#5ac8e8') : '#4a5a7a'; g.fillRect(x + 12, y - 8, 8, 16);
      g.fillStyle = lit ? '#e8fcff' : '#6a7a9a'; g.fillRect(x + 13, y - 6, 2, 8);
      if (lit) { g.fillStyle = 'rgba(154,240,255,0.18)'; g.fillRect(x - 4, y - 14, 40, 34); }
    }
  }
  function drawHero(ox, oy) {
    const h = game.hero, SC = game.SC, pose = SC.pose();
    const img = SCART.hero(h.face, h.moving ? (h.walk >> 3) & 1 : 0, pose.state === 'active');
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(Math.round(h.x + ox), Math.round(h.y + h.h - 1 + oy), 10, 2);
    const rect = game.anchor('hero');
    wrapSprite('hero', rect, () => {
      g.globalAlpha = SC.down() ? 0.6 : SC.playerAlpha();   // i-frames: translucent flicker, never invisible
      g.drawImage(img, Math.round(h.x - 2 + ox), Math.round(h.y - 9 + oy) + (pose.state === 'hurt' ? -1 : 0));
      g.globalAlpha = 1;
    });
  }
  function wrapSprite(id, rect, fn) {   // addons may wrap one sprite draw (white flash, palette swap)
    const a = game.addons.find(x => x && typeof x.wrapSprite === 'function');
    if (!a) return fn();
    try { a.wrapSprite(g, id, rect, fn, game); } catch (e) { warnOnce('wrapSprite', e); fn(); }
  }
  function drawField() {
    const SC = game.SC, sh = fb.shake > 0 ? Math.round(fb.shakeMax * fb.shake / fb.shakeLen) * ((fb.shake >> 1) & 1 ? 1 : -1) : 0;
    g.save(); g.beginPath(); g.rect(0, HUD, W, FH); g.clip(); g.translate(sh, 0);
    each('draw', g, 'begin');
    let ox = 0, oy = HUD;
    if (slide) {   // scroll the two rooms together
      const k = slide.t / slide.len, [dx, dy] = DIRV[slide.dir], sx = -dx * W * k, sy = -dy * FH * k;
      drawRoom(game.room, Math.round(sx), Math.round(HUD + sy), true); drawRoom(slide.to, Math.round(sx + dx * W), Math.round(HUD + sy + dy * FH), true);
      const h = game.hero; ox = Math.round(sx); oy = Math.round(HUD + sy);
      drawHero(ox, oy);
    } else {
      drawRoom(game.room, 0, HUD);
      each('draw', g, 'ground');
      SC.draw(g, ox, oy, { layer: 'below' });
      const list = SC.sprites(ox, oy).map(s => ({ y: s.y, draw: () => wrapSprite(s.id, game.anchor(s.id), () => s.draw(g)) }));
      list.push({ y: game.hero.y + game.hero.h, draw: () => drawHero(ox, oy) });
      const sc = sceneOf(game.room); if (sc) for (const it of sc.items) list.push({ y: it.y, draw: () => it.draw(g, sceneMs(), ox, oy) });   // trees, bushes, rocks stand in the same y-sort
      list.sort((a, b) => a.y - b.y).forEach(s => s.draw());
      SC.draw(g, ox, oy, { layer: 'above' });
    }
    if (fb.flash > 0) { g.globalAlpha = fb.flashA * fb.flash / fb.flashLen; g.fillStyle = fb.flashCol; g.fillRect(-4, HUD, W + 8, FH); g.globalAlpha = 1; }
    each('draw', g, 'fx');
    each('draw', g, 'end');
    g.restore();
  }
  function drawHud() {
    g.fillStyle = '#0a0814'; g.fillRect(0, 0, W, HUD); g.fillStyle = '#3a2e56'; g.fillRect(0, HUD - 1, W, 1);
    game.SC.drawHearts(g, 4, 4);
    const gx = 156; g.fillStyle = '#10142a'; g.fillRect(gx, 4, 7, 7); g.fillStyle = '#7ad8ff'; g.fillRect(gx + 1, 5, 5, 3); g.fillRect(gx + 2, 8, 3, 1); g.fillStyle = '#fff'; g.fillRect(gx + 2, 5, 1, 1);
    text('x' + game.gems, gx + 9, 5, '#ffffff');
    text(ROOMS[game.room].short, W - 4, 5, '#9a90b0', 'right');
    if (game.autoplay.on) text('AUTO', 136, 5, '#5a5078', 'right');
  }
  function drawBanners() {
    if (intro > 0 && game.scene === 'play') {
      const r = { x: 16, y: H - 50, w: W - 32, h: 38 }; frame(r, 'window');
      text('THE WARDEN HAS SEALED THE SHRINE.', 26, H - 42, '#ffffff');
      text('CLEAR THE RUINS TO BREAK THE SEAL.', 26, H - 30, '#ffd23a');
    }
    if (banner && game.scene === 'play') {
      const w = Math.max(96, banner.text.length * 6 + 20), r = { x: (W - w) >> 1, y: HUD + 8, w, h: 19 };
      frame(r, 'plate'); text(banner.text, W / 2, r.y + 6, '#ffffff', 'center');
    }
    if (game.clock.paused && game.scene === 'play') { const r = { x: 88, y: 100, w: 80, h: 22 }; frame(r, 'banner'); text('PAUSED', 128, 108, '#ffffff', 'center'); }
  }
  function drawTitle() {
    const t = game.clock.frame;
    const tsc = sceneOf('meadow');
    if (tsc) { g.fillStyle = '#1c4630'; g.fillRect(0, 0, W, H); tsc.draw(g, t * FRAME_MS, [], 0, HUD >> 1); }
    else for (let r = 0; r < 14; r++) for (let c = 0; c < COLS; c++) g.drawImage(SCART.tile(r < 2 || r > 11 || c < 1 || c > 14 ? 'tree' : (r + c) % 7 ? 'grass' : 'flowers', c, r, t), c * T, r * T);
    g.fillStyle = 'rgba(10,8,20,0.55)'; g.fillRect(0, 0, W, H);
    // sword emblem behind the title window
    const ex = W / 2, ink = '#10142a';
    g.fillStyle = ink; g.fillRect(ex - 3, 4, 7, 40); g.fillRect(ex - 1, 2, 3, 3); g.fillRect(ex - 13, 42, 27, 7); g.fillRect(ex - 3, 48, 7, 14);
    g.fillStyle = '#d8e0f0'; g.fillRect(ex - 1, 5, 3, 38); g.fillStyle = '#ffffff'; g.fillRect(ex - 1, 5, 1, 36); g.fillStyle = '#7a88a8'; g.fillRect(ex + 1, 7, 1, 36);
    g.fillStyle = '#ffd23a'; g.fillRect(ex - 11, 44, 23, 3); g.fillStyle = '#c8963a'; g.fillRect(ex - 11, 46, 23, 1); g.fillStyle = '#6a4a2a'; g.fillRect(ex - 1, 49, 3, 9); g.fillStyle = '#ffd23a'; g.fillRect(ex - 2, 58, 5, 3);
    if ((t >> 2) % 24 === 0) { g.fillStyle = '#ffffff'; g.fillRect(ex - 3, 12, 7, 1); g.fillRect(ex, 9, 1, 7); }
    const r = { x: 40, y: 64, w: 176, h: 56 }; frame(r, 'window');
    if (SK) { SK.text(g, 'THORNVALE', W / 2 + 1, 75, { font: 'ui', align: 'center', color: '#000000', scale: 2 }); SK.text(g, 'THORNVALE', W / 2, 74, { font: 'ui', align: 'center', color: '#ffd23a', scale: 2 }); } else text('THORNVALE', W / 2, 74, '#ffd23a', 'center');
    text('A SWORD AND A SEALED SHRINE', W / 2, 100, '#c8c0dc', 'center');
    // attract loop: the hero spars with a slime (swing, hop back, again)
    const ph = t % 96, swing = ph >= 20 && ph < 34, hx = 104, hy = 134, sx = 136 + (ph >= 24 && ph < 44 ? Math.min(8, (ph - 24) >> 1) : ph >= 44 ? Math.max(0, 8 - ((ph - 44) >> 2)) : 0);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(hx + 2, hy + 16, 10, 2); g.fillRect(sx + 2, hy + 14, 12, 2);
    g.drawImage(SCART.hero('right', swing ? 0 : (t >> 4) & 1, swing), hx, hy);
    const slimeSpr = SCART.paint(14, 12, R => { const B = '#5ac85a', D = '#2e8a3e', y = (t >> 3) & 1; R(4, 1 + y, 6, 1, B); R(2, 2 + y, 10, 1, B); R(1, 3 + y, 12, 6 - y, B); R(0, 6, 14, 3, B); R(0, 8, 14, 2, D); R(5, 4 + y, 2, 2, '#10101a'); R(8, 4 + y, 2, 2, '#10101a'); }, true);
    g.globalAlpha = ph >= 24 && ph < 30 ? 0.6 : 1; g.drawImage(slimeSpr, sx, hy + 3); g.globalAlpha = 1;
    if (swing) { const k = (ph - 20) / 14; for (let i = 0; i <= 8; i++) { const a = -1.3 + 2.6 * k * i / 8; g.fillStyle = i === 8 ? '#ffffff' : '#7ad8ff'; g.fillRect(Math.round(hx + 8 + Math.cos(a) * 16), Math.round(hy + 6 + Math.sin(a) * 16), 2, 2); } }
    if ((t >> 5) & 1) text('PRESS Z', W / 2, 166, '#ffffff', 'center');
    text('ARROWS WALK  Z SWING  P AUTO', W / 2, 200, '#8a80a8', 'center');
  }
  function drawEnd() {
    const won = game.scene === 'victory', r = { x: 40, y: 66, w: 176, h: 84 }, since = game.clock.frame - game.endFrame;
    if (won) {   // shrine light burst: rays and sparkles for the first second, then a soft glow
      const cx = SHRINE.x + 16, cy = SHRINE.y + HUD, k = Math.min(1, since / 50);
      g.save(); g.beginPath(); g.rect(0, HUD, W, FH); g.clip(); g.globalAlpha = 0.35 * (1 - k * 0.7); g.fillStyle = '#e8fcff';
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + since * 0.01, L = 30 + 140 * k; for (let d = 6; d < L; d += 5) g.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 2, 2); }
      g.globalAlpha = 1; for (let i = 0; i < 16; i++) { const a = i * 2.4, d = (since * (1 + (i % 3)) + i * 9) % 120; g.fillStyle = i & 1 ? '#ffd23a' : '#9af0ff'; g.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d * 0.8), 2, 2); }
      g.restore();
    }
    frame(r, 'window', won ? 'a' : 'b');
    text(won ? 'THE VALE IS SAFE' : 'YOU FELL', W / 2, r.y + 10, won ? '#ffd23a' : '#ff8a7a', 'center');
    const secs = Math.floor(game.clock.worldFrame / 60);
    text('DEFEATED  ' + game.kills, 60, r.y + 28, '#ffffff'); text('GEMS      ' + game.gems, 60, r.y + 40, '#ffffff'); text('TIME      ' + Math.floor(secs / 60) + 'M ' + String(secs % 60).padStart(2, '0') + 'S', 60, r.y + 52, '#ffffff');
    if (game.clock.frame - game.endFrame > 40 && (game.clock.frame >> 5) & 1) text('PRESS Z', W / 2, r.y + 68, '#c8c0dc', 'center');
  }
  function render() {
    g.imageSmoothingEnabled = false;
    if (game.scene === 'title') { drawTitle(); each('draw', g, 'overlay'); return; }
    drawField(); drawHud(); drawBanners();
    each('draw', g, 'overlay');
    if (game.scene === 'victory' || game.scene === 'gameover') drawEnd();
  }

  // public extension points that need the drawing state
  game.anchor = id => { const a = game.SC && game.SC.anchor(id, 0, HUD); if (!a) return null; return { id: a.id, x: a.x, top: a.top, left: a.left, w: a.w, h: a.h, y: a.top, cy: a.cy, footY: a.footY, dead: a.dead }; };
  game.uiRects = () => {
    const out = [{ name: 'hud', x: 0, y: 0, w: W, h: HUD }];
    if (intro > 0 && game.scene === 'play') out.push({ name: 'intro', x: 16, y: H - 50, w: W - 32, h: 38 });
    if (banner && game.scene === 'play') { const w = Math.max(96, banner.text.length * 6 + 20); out.push({ name: 'banner', x: (W - w) >> 1, y: HUD + 8, w, h: 19 }); }
    if (game.scene === 'victory' || game.scene === 'gameover') out.push({ name: 'result', x: 40, y: 66, w: 176, h: 84 });
    return out;
  };
  game.units = () => game.SC ? [{ id: 'hero', side: 'a' }].concat(game.SC.enemies().map(e => ({ id: e.id, side: 'b', look: e.look }))) : [];
  game.state = () => ({
    scene: game.scene, room: game.room, frame: game.clock.frame, worldFrame: game.clock.worldFrame, auto: game.autoplay.on, result: game.result,
    hp: game.SC ? game.SC.hp() : 0, maxHp: game.SC ? game.SC.maxHp() : 0, kills: game.kills, gems: game.gems, sealed: game.sealed, bossDown: game.bossDown,
    hero: game.hero && { x: Math.round(game.hero.x), y: Math.round(game.hero.y), face: game.hero.face },
    enemies: game.SC ? game.SC.enemies().map(e => ({ id: e.id, look: e.look, state: e.state, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp })) : []
  });

  // ======================================================================= 9. Boot (called after the ADDONS SLOT)
  game.boot = () => {
    makeCombat();
    game.hero = { x: 6 * T + 3, y: 10 * T + 4, w: 10, h: 8, face: 'up', walk: 0, moving: false };
    function fit() { const a = Math.min((innerWidth - 16) / W, (innerHeight - 60) / H), s = a >= 2 ? Math.floor(a) : Math.max(1, a); cv.style.width = Math.floor(W * s) + 'px'; cv.style.height = Math.floor(H * s) + 'px'; }
    fit(); addEventListener('resize', fit);
    if (OPT.t !== null) {
      for (let n = Math.floor(OPT.t / FRAME_MS); n > 0; n--) step();
      render();
      document.documentElement.dataset.state = JSON.stringify({ scene: game.scene, room: game.room, hp: game.SC.hp(), kills: game.kills });
      if (OPT.freeze) { window.__frozen = true; return; }
    } else render();
    let acc = 0, prev = null;
    (function loop(now) {
      if (prev === null) prev = now;
      acc += Math.min(250, now - prev); prev = now;
      while (acc >= FRAME_MS) { step(); acc -= FRAME_MS; }
      render(); requestAnimationFrame(loop);
    })(performance.now());
  };
})();
