/* Crossroads Cup: the four-move battle starter. Three rival battles in a row on a hill-top meadow ring; your team of
   three (Ember, Tide, Bloom) heals between rounds. Built on GameDNA_FourMove (the module above, verbatim): the module
   owns turn resolution, the message queue, the menus and the battle screen; this script owns content, scenes,
   autoplay wiring, the extension points (section 2) and the screen. Search for the "=== n." banners. */
(function () {
  'use strict';

  /* =================================================================================================
     === 1. Config and content ========================================================================= */
  var W = 240, H = 160, STEP = 1000 / 60;
  var qs = new URLSearchParams(location.search);
  var FREEZE_AT = qs.has('t') ? Math.max(0, Number(qs.get('t')) || 0) : null;
  var FROZEN = FREEZE_AT !== null && qs.get('freeze') === '1';
  var AUTO = qs.get('auto') === '1' || (FROZEN && qs.get('auto') !== '0');
  var FORMAT = qs.get('format') === 'double' ? 'double' : 'single';
  var SEED = Number(qs.get('seed')) || 7;
  var TEXT_SPEED = ['slow', 'normal', 'fast', 'instant'].indexOf(qs.get('text')) >= 0 ? qs.get('text') : 'normal';
  var REDUCED = qs.get('reduced') === '1' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Six types; strong = x2, weak = x0.5, none = x0 (attacker -> defender). immune: statuses the type never gets.
  var TYPES = {
    ember: { label: 'Ember', color: '#f0783a', strong: ['bloom'], weak: ['tide', 'ember', 'stone'], immune: ['burn'] },
    tide: { label: 'Tide', color: '#3e8ee8', strong: ['ember', 'stone'], weak: ['tide', 'bloom'] },
    bloom: { label: 'Bloom', color: '#5cbf4a', strong: ['tide', 'stone'], weak: ['ember', 'bloom', 'gale'] },
    gale: { label: 'Gale', color: '#8ccbe8', strong: ['bloom'], weak: ['stone', 'volt'] },
    stone: { label: 'Stone', color: '#b49a62', strong: ['ember', 'gale', 'volt'], weak: ['bloom'] },
    volt: { label: 'Volt', color: '#f2cc3a', strong: ['tide', 'gale'], weak: ['bloom', 'volt'], none: ['stone'], immune: ['numb'] }
  };
  // Moves: power 0 = support move. accuracy 0-100. uses = uses per battle. effect: {status, chance} | {heal} | {guard} | {drain}
  var MOVES = {
    bump: { name: 'Bump', power: 35, uses: 35 },
    quickpeck: { name: 'Quick Peck', power: 30, uses: 30, priority: 1 },
    brace: { name: 'Brace', kind: 'status', target: 'self', effect: { guard: true }, uses: 10, priority: 3 },
    cinder: { name: 'Cinder', type: 'ember', power: 40, uses: 25, effect: { status: 'burn', chance: 10 } },
    flaredash: { name: 'Flare Dash', type: 'ember', power: 70, accuracy: 90, uses: 10 },
    waveslap: { name: 'Wave Slap', type: 'tide', power: 40, uses: 25 },
    undertow: { name: 'Undertow', type: 'tide', power: 65, accuracy: 95, uses: 10 },
    lullaby: { name: 'Lullaby', kind: 'status', accuracy: 65, uses: 10, effect: { status: 'sleep' } },
    vinelash: { name: 'Vine Lash', type: 'bloom', power: 45, uses: 25 },
    sapdrain: { name: 'Sap Drain', type: 'bloom', power: 40, uses: 15, effect: { drain: 0.5 } },
    prickle: { name: 'Spore Dust', type: 'bloom', kind: 'status', accuracy: 75, uses: 15, effect: { status: 'numb' } },
    mend: { name: 'Mend', kind: 'status', target: 'self', effect: { heal: 0.5 }, uses: 8 },
    gust: { name: 'Gust', type: 'gale', power: 40, uses: 30 },
    airslice: { name: 'Air Slice', type: 'gale', power: 60, accuracy: 95, uses: 15, highCrit: true },
    whirl: { name: 'Whirlwind', type: 'gale', power: 35, uses: 15, target: 'allFoes' },
    pebble: { name: 'Pebble Toss', type: 'stone', power: 50, accuracy: 90, uses: 15 },
    rockroll: { name: 'Rock Roll', type: 'stone', power: 70, accuracy: 85, uses: 10 },
    zap: { name: 'Zap', type: 'volt', power: 40, uses: 30, effect: { status: 'numb', chance: 10 } },
    staticweb: { name: 'Static Web', type: 'volt', kind: 'status', accuracy: 90, uses: 15, effect: { status: 'numb' } },
    sparkrush: { name: 'Spark Rush', type: 'volt', power: 65, uses: 10 }
  };
  // Species (art keys match ART.species). base stats feed statsFor().
  var SPECIES = {
    cindle: { name: 'Cindle', types: ['ember'], base: { hp: 45, atk: 56, def: 42, spd: 62 }, moves: ['cinder', 'bump', 'flaredash', 'brace'] },
    brookit: { name: 'Brookit', types: ['tide'], base: { hp: 55, atk: 50, def: 52, spd: 42 }, moves: ['waveslap', 'undertow', 'lullaby', 'bump'] },
    sproutle: { name: 'Sproutle', types: ['bloom'], base: { hp: 52, atk: 50, def: 50, spd: 46 }, moves: ['vinelash', 'sapdrain', 'prickle', 'mend'] },
    gustling: { name: 'Gustling', types: ['gale'], base: { hp: 42, atk: 50, def: 38, spd: 70 }, moves: ['gust', 'quickpeck', 'airslice', 'whirl'] },
    cobblet: { name: 'Cobblet', types: ['stone'], base: { hp: 55, atk: 58, def: 66, spd: 26 }, moves: ['pebble', 'rockroll', 'brace', 'bump'] },
    voltick: { name: 'Voltick', types: ['volt'], base: { hp: 44, atk: 56, def: 44, spd: 68 }, moves: ['zap', 'staticweb', 'sparkrush', 'bump'] },
    mosshell: { name: 'Mosshell', types: ['bloom', 'stone'], base: { hp: 60, atk: 48, def: 64, spd: 24 }, moves: ['vinelash', 'pebble', 'sapdrain', 'brace'] }
  };
  var TEAM = [{ species: 'cindle', level: 15 }, { species: 'brookit', level: 15 }, { species: 'sproutle', level: 15 }];
  var RIVALS = [
    { name: 'Rival Pip', stage: 'day', intro: 'ROOKIE PIP STEPS INTO THE RING!', team: [{ species: 'gustling', level: 12 }, { species: 'cobblet', level: 12 }] },
    { name: 'Rival Marrow', stage: 'sunset', intro: 'MARROW THE DRIFTER BLOCKS THE ROAD!', team: [{ species: 'voltick', level: 14 }, { species: 'mosshell', level: 14 }, { species: 'gustling', level: 14 }] },
    { name: 'Warden Vessa', stage: 'dusk', intro: 'WARDEN VESSA GUARDS THE CROSSROADS!', team: [{ species: 'cobblet', level: 16 }, { species: 'voltick', level: 16 }, { species: 'mosshell', level: 17 }] }
  ];
  var BAG = { tonic: { label: 'Tonic', heal: 25, count: 2 } };
  function statsFor(sp, lv) {
    var b = SPECIES[sp].base;
    return { maxHp: Math.floor(2 * b.hp * lv / 100) + lv + 12, atk: Math.floor(2 * b.atk * lv / 100) + 5, def: Math.floor(2 * b.def * lv / 100) + 5, spd: Math.floor(2 * b.spd * lv / 100) + 5 };
  }
  function creature(entry, i, side) {
    var sp = SPECIES[entry.species], st = statsFor(entry.species, entry.level);
    return { id: side + '-' + entry.species + '-' + i, species: entry.species, name: sp.name, types: sp.types, level: entry.level, maxHp: st.maxHp, hp: st.maxHp, atk: st.atk, def: st.def, spd: st.spd, moves: sp.moves.slice() };
  }

  /* =================================================================================================
     === 2. Game object: the public surface and the extension points (see README) ======================= */
  var canvas = document.getElementById('screen'), g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  var game = {
    W: W, H: H, FH: 112,
    addons: [],
    flags: { builtinShake: true, builtinFlash: true },
    scene: 'title', round: 0, cupResult: null, B: null, bag: {}, rival: null,
    clock: { frame: 0, battleFrame: 0, paused: false, stop: 0 },
    autoplay: { on: AUTO, decide: null },
    foeAI: null,                                      // (view, game) -> pick or null (module default AI)
    applyHit: function (targetId, kind, amount) { return game.B ? game.B.applyHit(targetId, kind || 'damage', amount) : null; },
    hit: function (targetId, kind, amount) { return game.applyHit(targetId, kind, amount); },
    anchor: function (id) { return game.B ? game.B.anchor(id) : null; },
    uiRects: function () {
      var out = game.B && game.scene === 'battle' ? game.B.uiRects() : [];
      if (overlayRect) out.push({ name: 'result', x: overlayRect.x, y: overlayRect.y, w: overlayRect.w, h: overlayRect.h });
      return out;
    },
    shake: function (px, frames) { if (REDUCED) return; if (px >= fxState.shakePx || fxState.shake <= 0) { fxState.shakePx = px; fxState.shake = frames | 0; } },
    flash: function (color, frames, alpha) { if (REDUCED) return; fxState.flash = { color: color || '#ffffff', n: frames | 0, t: 0, a: alpha == null ? 0.3 : alpha }; },
    hitStop: function (f) { var n = typeof f === 'object' && f ? Math.ceil((f.ms || 0) * 60 / 1000) : f | 0; game.clock.stop = Math.max(game.clock.stop, n); if (game.B) game.B.hitStop(n * STEP); },
    hitStopMs: function (ms) { game.hitStop({ ms: ms }); },
    pause: function (on) { game.clock.paused = !!on; if (game.B) game.B.pause(!!on); },
    state: function () {
      var B = game.B;
      return { scene: game.scene, round: game.round + 1, cup: game.cupResult, frame: game.clock.frame, format: FORMAT,
        battle: B ? { phase: B.phase(), turn: B.turn(), result: B.result() } : null,
        own: B ? B.team('own').map(function (c) { return c.hp; }).join(',') : '', foe: B ? B.team('foe').map(function (c) { return c.hp; }).join(',') : '' };
    }
  };
  window.GAME = game;
  function each(hook, args) {
    var out = false;
    game.addons.forEach(function (a) { if (!a || typeof a[hook] !== 'function') return; try { if (a[hook].apply(a, args) === true) out = true; } catch (e) { console.error('addon ' + (a.name || '?') + '.' + hook + ': ' + e.message); } });
    return out;
  }
  var fxState = { shake: 0, shakePx: 0, flash: null };
  var overlayRect = null;

  /* =================================================================================================
     === 3. Battle setup ================================================================================ */
  function newBattle() {
    var R = RIVALS[game.round];
    game.rival = R; game.clock.battleFrame = 0;
    game.bag = { tonic: BAG.tonic.count };
    var own = TEAM.map(function (e, i) { return creature(e, i, 'own'); }), foe = R.team.map(function (e, i) { return creature(e, i, 'foe'); });
    game.B = GameDNA_FourMove.create({
      view: { x: 0, y: 0, w: W, h: H }, seed: SEED * 97 + game.round * 13 + 1, foeName: R.name, intro: R.intro,
      types: TYPES, moves: MOVES, teams: { own: own, foe: foe },
      params: { format: FORMAT, textSpeed: TEXT_SPEED, advance: 'key', hold: 650, auto: game.autoplay.on },
      sprite: function (src, view) { return ART.sprite(src.species, view); },
      drawBackground: function (ctx, r, t) { ART.backdrop(ctx, r, t, R.stage); },
      platform: function (ctx, pl, side) { ART.platform(ctx, pl, side, R.stage); },
      items: function () { return [{ id: 'tonic', label: BAG.tonic.label, note: 'x' + game.bag.tonic, ok: game.bag.tonic > 0 }]; },
      useItem: function (u) { if (u.item === 'tonic' && game.bag.tonic > 0) { game.bag.tonic--; return { heal: BAG.tonic.heal }; } return { text: 'NOTHING HAPPENED.' }; },
      chooseFoe: function (view) { return game.foeAI ? game.foeAI(view, game) : null; },
      chooseOwn: function (view) { return game.autoplay.decide ? game.autoplay.decide(view, game) : null; },
      beforeHit: function (ev) { each('beforeHit', [ev, game]); },
      onHit: function (ev) { applyHitFeedback(ev); },
      onTurn: function (n) { each('onTurn', [n, game]); },
      onPhase: function (p) { each('onPhase', [p, game]); },
      onEvent: function (ev) { if (ev.type !== 'hit') each('onEvent', [ev, game]); },
      onEnd: function (res) { endBattle(res); }
    });
    game.FH = game.B.fieldRect().h;
    game.scene = 'battle';
    each('onBattleStart', [game]);
  }
  function endBattle(res) {
    var st = game.stats || (game.stats = { turns: 0, faints: 0, ko: 0 });
    st.turns += game.B.turn(); st.faints += game.B.team('own').filter(function (c) { return c.hp <= 0; }).length; st.ko += game.B.team('foe').filter(function (c) { return c.hp <= 0; }).length;
    each('onBattleEnd', [res, game]);
    if (res === 'win' && game.round + 1 >= RIVALS.length) { game.cupResult = 'champion'; setScene('champion'); }
    else if (res === 'win') setScene('between');
    else { game.cupResult = 'defeat'; setScene('over'); }
  }

  /* =================================================================================================
     === 4. Hit site =====================================================================================
     The module calls beforeHit(ev) then changes HP / status, then onHit(ev). ev = {kind: 'damage' | 'heal' |
     'status' | 'cure', source, target (ids), side, amount, move, moveName, type, eff, crit, status, cause, hpBefore,
     hpAfter, killed, anchor}. Addons see it in their own beforeHit / onHit. */
  function applyHitFeedback(ev) {
    if (ev.kind === 'damage' && ev.amount > 0 && ev.cause === 'move') {
      if (game.flags.builtinShake && (ev.eff > 1 || ev.crit)) game.shake(2, 10);
      if (game.flags.builtinFlash && ev.crit) game.flash('#ffffff', 8, 0.35);
    }
    each('onHit', [ev, game]);
  }

  /* =================================================================================================
     === 5. Scenes (title, battle, between rounds, champion, defeat) =================================== */
  var sceneT = 0;
  function setScene(s) { game.scene = s; sceneT = 0; }
  function startCup() { game.round = 0; game.cupResult = null; game.stats = { turns: 0, faints: 0, ko: 0 }; newBattle(); }
  function sceneOk() {
    if (game.scene === 'title') startCup();
    else if (game.scene === 'between' && sceneT > 30) { game.round++; newBattle(); }
    else if ((game.scene === 'champion' || game.scene === 'over') && sceneT > 40) { game.B = null; setScene('title'); }
  }
  function sceneAuto() {   // autoplay presses OK on the title and between rounds; it stays on the cup's last screen
    if (!game.autoplay.on) return;
    if (game.scene === 'title' && sceneT === 50) sceneOk();
    if (game.scene === 'between' && sceneT === 110) sceneOk();
  }

  /* =================================================================================================
     === 6. Default autoplay tactics ===================================================================
     The module's own AI already plays for the player when autoplay is on (best expected damage, switches out of bad
     matchups). Set game.autoplay.decide = (view, game) => ({move: i, target: id} | {switchTo: id} | {item: id}) to
     change it; return null to fall back. The module then presses the same menu keys a player would. */
  game.autoplay.decide = null;

  /* =================================================================================================
     === 7. Main tick (60 Hz) ========================================================================== */
  var keyQ = [];
  function tick() {
    var c = game.clock; c.frame++;
    var frozen = c.paused || c.stop > 0;
    if (c.stop > 0) c.stop--;
    // input chain: addons first, then the game
    var keys = keyQ; keyQ = [];
    keys.forEach(function (k) {
      if (each('onKey', [k, game])) return;
      if (k === 'auto') { game.autoplay.on = !game.autoplay.on; if (game.B) game.B.setAuto(game.autoplay.on); return; }
      if (game.autoplay.on && k !== 'tap') { game.autoplay.on = false; if (game.B) game.B.setAuto(false); }
      if (game.scene === 'battle' && game.B) { if (k.tap) game.B.tap(k.x, k.y); else game.B.key(k); }
      else if (k === 'ok' || (k && k.tap)) sceneOk();
    });
    if (!frozen) sceneT++;
    if (!frozen) sceneAuto();
    if (game.B && (game.scene === 'battle' || game.scene === 'between' || game.scene === 'over' || game.scene === 'champion')) {
      game.B.update();                     // the module keeps its own hit-stop / pause (set through game.hitStop / pause)
      if (!frozen && game.scene === 'battle') c.battleFrame++;
    }
    if (fxState.shake > 0 && !frozen) fxState.shake--;
    if (fxState.flash && !frozen) { fxState.flash.t++; if (fxState.flash.t >= fxState.flash.n) fxState.flash = null; }
    each('update', [game, { dt: frozen ? 0 : STEP, frozen: frozen, paused: c.paused, hitStop: c.stop }]);
  }

  /* =================================================================================================
     === 8. Drawing ===================================================================================== */
  function win(x, y, w, h) {   // the same bevelled window as the module's pixel16 look
    var C = ['#3a64d8', '#2c50b8', '#223e96', '#1a2e74', '#a8c8ff', '#0a1238'];
    for (var i = 0; i < h - 2; i++) { g.fillStyle = C[Math.min(3, Math.floor(i / (h - 2) * 4))]; g.fillRect(x + 1, y + 1 + i, w - 2, 1); }
    g.fillStyle = '#06061a'; g.fillRect(x + 2, y, w - 4, 1); g.fillRect(x + 2, y + h - 1, w - 4, 1); g.fillRect(x, y + 2, 1, h - 4); g.fillRect(x + w - 1, y + 2, 1, h - 4);
    g.fillStyle = C[4]; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 5); g.fillStyle = C[5]; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
  }
  var GOLD = ['#fff4c8', '#f0c040'], OL = '#1a0e20';
  function centerText(s, y, cols, sc, ol) { ART.text(g, s, Math.round((W - ART.textW(s, sc)) / 2), y, cols, sc, ol); }
  function drawTitle(t) {
    ART.backdrop(g, { x: 0, y: 0, w: W, h: H }, t, 'day');
    g.fillStyle = 'rgba(10,8,30,0.35)'; g.fillRect(0, 0, W, 54);
    centerText('CROSSROADS', 8, GOLD, 3, OL); centerText('CUP', 32, ['#ffe0b0', '#ff9a5a'], 2, OL);
    ['cindle', 'brookit', 'sproutle'].forEach(function (k, i) { var s = ART.sprite(k, 'front'), bob = Math.floor(t * 2 + i) % 2; g.drawImage(s, 40 + i * 58, 62 - bob); });
    win(16, 116, W - 32, 36);
    if (Math.floor(t * 2) % 2 === 0) centerText('PRESS Z OR TAP TO BEGIN', 124, ['#ffffff', '#c8d4ff'], 1, OL);
    centerText('THREE RIVALS. FOUR MOVES EACH.', 138, ['#ffe070', '#e8c870'], 1, OL);
    overlayRect = { x: 16, y: 116, w: W - 32, h: 36 };
  }
  function drawBetween(t) {
    var next = RIVALS[game.round + 1], wy = 22;
    g.fillStyle = 'rgba(8,6,24,0.5)'; g.fillRect(0, 0, W, H);
    win(20, wy, W - 40, 76); overlayRect = { x: 20, y: wy, w: W - 40, h: 76 };
    win(0, game.FH, W, H - game.FH);
    ART.text(g, 'THE NEXT RIVAL IS WAITING...', 10, game.FH + 10, ['#ffffff', '#c8d4ff'], 1, OL);
    centerText('ROUND ' + (game.round + 1) + ' CLEAR!', wy + 8, GOLD, 2, OL);
    centerText('YOUR TEAM RESTS AND HEALS.', wy + 30, ['#ffffff', '#c8d4ff'], 1, OL);
    centerText('NEXT: ' + next.name.toUpperCase(), wy + 44, ['#ffe070', '#e8c870'], 1, OL);
    if (sceneT > 30 && Math.floor(t * 2) % 2 === 0) centerText('Z: ONWARD', wy + 60, ['#ffffff', '#c8d4ff'], 1, OL);
  }
  function drawEnd(t, won) {
    // a screen of its own: the round's backdrop, dimmed, with the team line-up (no battle UI behind the window)
    ART.backdrop(g, { x: 0, y: 0, w: W, h: H }, t, game.rival ? game.rival.stage : 'dusk');
    g.fillStyle = won ? 'rgba(8,6,24,0.35)' : 'rgba(6,4,20,0.62)'; g.fillRect(0, 0, W, H);
    var snap = game.B ? game.B.team('own') : [];
    TEAM.forEach(function (e, i) {
      var spr = ART.sprite(e.species, 'front'), up = snap[i] ? snap[i].hp > 0 : true, x = 46 + i * 56 + (spr.width >> 1), bob = won && up ? Math.floor(t * 3 + i) % 2 : 0;
      g.globalAlpha = up ? 1 : 0.45; g.drawImage(spr, Math.round(x - spr.width / 2), 104 - bob); g.globalAlpha = 1;
    });
    if (won) for (var k = 0; k < 7; k++) {   // fireworks
      var ph2 = (t * 0.45 + k * 0.19) % 1, fx = 20 + ((k * 67) % 200), fy = 10 + (k * 17) % 26, rr = 3 + ph2 * 18;
      for (var m = 0; m < 14; m++) { var an2 = m / 14 * 6.283; g.fillStyle = ['#ffe070', '#ff8a7a', '#8ad8ff', '#c8a0ff', '#a0ffb0'][k % 5]; g.globalAlpha = Math.max(0, 1 - ph2); g.fillRect(Math.round(fx + Math.cos(an2) * rr), Math.round(fy + Math.sin(an2) * rr * 0.8 + ph2 * ph2 * 8), 2, 2); }
      g.globalAlpha = 1;
    }
    var st = game.stats || { turns: 0, faints: 0, ko: 0 };
    win(20, 28, W - 40, 70); overlayRect = { x: 20, y: 28, w: W - 40, h: 70 };
    if (won) { trophy(24, 36, t); trophy(W - 38, 36, t + 0.5); }
    var line = 'TURNS ' + st.turns + '   BEATEN ' + st.ko + '   FAINTS ' + st.faints;
    centerText(won ? 'CUP CHAMPION!' : 'DEFEATED...', 38, won ? GOLD : ['#c8d4ff', '#8a9ad8'], 2, OL);
    centerText(won ? 'THE CROSSROADS CUP IS YOURS.' : 'THE ROAD ENDS AT ROUND ' + (game.round + 1) + '.', 62, ['#ffffff', '#c8d4ff'], 1, OL);
    centerText(line, 74, ['#c8d4ff', '#8ca8e8'], 1, OL);
    if (sceneT > 40 && Math.floor(t * 2) % 2 === 0) centerText('Z: BACK TO THE TITLE', 86, ['#ffe070', '#e8c870'], 1, OL);
  }
  function trophy(x, y, t) {   // a small gold cup with a glint, drawn in pixels
    var rows = ['.oooooooooo.', 'oYYYYYYYYYYo', 'oYyYYYYYYYdo', 'oYyYYYYYYYdo', '.oYyYYYYYdo.', '..oYYYYYdo..', '...ooYdoo...', '....oYdo....', '...oYYYdo...', '..oddddddo..', '..oooooooo..'];
    var C = { o: '#2a1406', Y: '#f0c040', y: '#fff4b0', d: '#b07818' };
    rows.forEach(function (r, j) { for (var i = 0; i < r.length; i++) if (C[r[i]]) { g.fillStyle = C[r[i]]; g.fillRect(x + i, y + j, 1, 1); } });
    g.fillStyle = '#f0c040'; g.fillRect(x - 2, y + 2, 2, 1); g.fillRect(x - 2, y + 2, 1, 3); g.fillRect(x - 2, y + 4, 2, 1); g.fillRect(x + 12, y + 2, 2, 1); g.fillRect(x + 13, y + 2, 1, 3); g.fillRect(x + 12, y + 4, 2, 1);
    if (Math.floor(t * 2) % 3 === 0) { g.fillStyle = '#ffffff'; g.fillRect(x + 3, y - 2, 1, 3); g.fillRect(x + 2, y - 1, 3, 1); }
  }
  function render() {
    var t = game.clock.frame / 60;
    overlayRect = null;
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
    if (game.scene === 'title' || !game.B) { drawTitle(t); each('drawUI', [g, game]); return; }
    var B = game.B, sx = fxState.shake > 0 ? (fxState.shake % 4 < 2 ? fxState.shakePx : -fxState.shakePx) : 0;
    g.save(); g.translate(sx, 0);
    B.drawScene(g);                                        // backdrop, platforms, creatures, module effects
    each('draw', [g, 'fx', game]);                         // draw-effects slot (shakes with the field)
    if (fxState.flash) { var f = fxState.flash; g.globalAlpha = f.a * (1 - f.t / f.n); g.fillStyle = f.color; g.fillRect(0, 0, W, game.FH); g.globalAlpha = 1; }
    g.restore();
    if (game.scene !== 'between') B.drawUI(g);             // info boxes, message box, menus (hidden behind the round-clear window)
    each('draw', [g, 'overlay', game]);
    if (game.scene === 'between') drawBetween(t);
    if (game.scene === 'champion') drawEnd(t, true);
    if (game.scene === 'over') drawEnd(t, false);
    each('drawUI', [g, game]);                             // top UI hook: after everything
  }
  function fit() {
    var st = document.getElementById('stage'), r = st.getBoundingClientRect(), bar = document.getElementById('bar');
    var room = innerHeight - (bar ? bar.getBoundingClientRect().height : 0) - 48;
    var k = Math.max(1, Math.floor(Math.min((r.width || innerWidth) / W, Math.max(H, room) / H)));
    canvas.style.width = W * k + 'px'; canvas.style.height = H * k + 'px';
  }
  addEventListener('resize', fit);

  /* =================================================================================================
     === 9. Input: a key queue (a 0 ms tap still counts) ============================================== */
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', x: 'back', X: 'back', Escape: 'back', Backspace: 'back', p: 'auto', P: 'auto' };
  addEventListener('keydown', function (e) { var k = KEYS[e.key]; if (!k) return; e.preventDefault(); if (!e.repeat) keyQ.push(k); });
  canvas.addEventListener('pointerdown', function (e) {
    var r = canvas.getBoundingClientRect(); e.preventDefault();
    keyQ.push({ tap: true, x: Math.floor((e.clientX - r.left) * W / r.width), y: Math.floor((e.clientY - r.top) * H / r.height) });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-key]'), function (b) { b.addEventListener('pointerdown', function (e) { e.preventDefault(); keyQ.push(b.getAttribute('data-key')); }); });

  /* =================================================================================================
     === 10. Boot ======================================================================================= */
  function boot() {
    fit();
    if (FROZEN) {
      var n = Math.floor(FREEZE_AT / STEP);
      for (var i = 0; i < n; i++) tick();
      render();
      document.documentElement.setAttribute('data-state', JSON.stringify(game.state()));
      return;
    }
    var last = performance.now(), acc = 0;
    (function loop(now) {
      acc += Math.min(250, now - last); last = now;
      while (acc >= STEP) { tick(); acc -= STEP; }
      render();
      requestAnimationFrame(loop);
    })(last);
  }
  game.boot = boot;
  game.step = function (n) { for (var i = 0; i < (n || 1); i++) tick(); };   // test hook: advance n 60 Hz frames (no drawing)
  game.render = render;
  // boots after the ADDONS SLOT script below has run (scripts at the end of <body> run before DOMContentLoaded)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
