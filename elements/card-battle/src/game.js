/* The Lantern Road: the A-10 card-battle starter. A complete run built on GameDNA_CardBattle.
   You carry a lantern down a road of four fights. Each fight is a card battle: draw five cards, spend Lumen to play them
   (drag a card onto a foe, or pick it with keys / taps), read what every foe intends to do next, end the turn and take
   what comes. After each won fight you rest (+HP) and may add one of three cards to your deck.
   Search for the "=== n." banners: config and content, the game object (extension points), battle setup, the hit site,
   scenes, the main tick, drawing, input, boot. */
(function () {
  'use strict';
  /* =================================================================================================
     === 1. Config and content ========================================================================= */
  var qs = new URLSearchParams(location.search);
  var W = 640, H = 360, STEP = 1000 / 60;
  var FREEZE_AT = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : null;
  var FROZEN = FREEZE_AT !== null && qs.get('freeze') === '1';
  var AUTO = qs.get('auto') === '1' || (FROZEN && qs.get('auto') !== '0');
  var SEED = (+qs.get('seed') >>> 0) || 7;
  var SPEED = Math.max(0.25, Math.min(4, +qs.get('speed') || 1));
  var REDUCED = qs.get('reduced') === '1' || (!!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var CB = GameDNA_CardBattle;

  // Cards, foes and statuses. The module ships the built-in tables (GameDNA_CardBattle.CARDS / ENEMIES / STATUSES, read
  // module/README.md for the format); add or override entries here, or later through GAME.addCard / addEnemy / addStatus.
  var CARDS = {};
  var ENEMIES = {};
  var STATUSES = {};
  // The deck you start with (card ids; copies repeat).
  var START_DECK = ['thorn-jab', 'thorn-jab', 'thorn-jab', 'thorn-jab', 'bark-ward', 'bark-ward', 'bark-ward', 'bark-ward', 'ember-toss', 'root-snare'];
  // Cards a won fight may offer (three are dealt from this pool, seeded). Built-in cards marked pool: true.
  var REWARD_POOL = Object.keys(CB.CARDS).filter(function (k) { return CB.CARDS[k].pool; });
  // The road: one fight per stop. theme = ART backdrop (marsh, bridge, orchard, briar).
  var FIGHTS = [
    { name: 'The Sunken Path', theme: 'marsh', foes: ['mire-toad', 'ash-wisp'] },
    { name: 'Old Stone Bridge', theme: 'bridge', foes: ['moss-brute'] },
    { name: 'The Charred Orchard', theme: 'orchard', foes: ['cinder-imp', 'lantern-thief', 'cinder-imp'] },
    { name: 'Heart of the Briar', theme: 'briar', foes: ['bramble-golem'], boss: true }
  ];
  var HERO = { name: 'Lanternbearer', maxHp: 64 };
  var REST_HP = 14, ENERGY = 3, DRAW = 5;
  var RARITY_RANK = { common: 1, rare: 2, epic: 3, legendary: 4 };

  /* =================================================================================================
     === 2. Game object: the public surface and the extension points (see README) ======================= */
  var canvas = document.getElementById('screen'), g = canvas.getContext('2d');
  var game = {
    W: W, H: H, addons: [], flags: { builtinNumbers: true, builtinShake: true, builtinFlash: true },
    scene: 'title', fight: 0, deck: [], hero: { hp: HERO.maxHp, maxHp: HERO.maxHp, name: HERO.name }, C: null, results: [], lastEnd: null, reward: null,
    clock: { frame: 0, battleFrame: 0, paused: false, stop: 0 },
    autoplay: { on: AUTO, plan: null, pick: null },
    held: {},                                   // keys held right now ({ArrowLeft: true}); scenes and windows never clear it
    cards: CARDS, enemies: ENEMIES, statuses: STATUSES, startDeck: START_DECK, rewardPool: REWARD_POOL, fights: FIGHTS, seed: SEED,
    shipped: null,                              // the content ids this file ships with (set below, before the ADDONS SLOT)
    addCard: function (id, def, o) {
      o = o || {}; if (def) { CARDS[id] = def; if (game.C) game.C.lib.cards[id] = def; }
      for (var i = 0; i < (o.deck | 0); i++) START_DECK.push(id);
      if (o.pool && REWARD_POOL.indexOf(id) < 0) REWARD_POOL.push(id);
      return id;
    },
    addEnemy: function (id, def, o) {
      o = o || {}; if (def) { ENEMIES[id] = def; if (game.C) game.C.lib.enemies[id] = def; }
      if (o.fight != null) { var f = FIGHTS[o.fight]; if (!f) { f = { name: o.name || (def && def.name) || id, theme: o.theme || 'marsh', foes: [] }; FIGHTS.splice(Math.min(o.fight, FIGHTS.length), 0, f); } if (o.replace) f.foes = []; f.foes.push(id); }
      return id;
    },
    addStatus: function (id, def) { STATUSES[id] = def; if (game.C) game.C.lib.statuses[id] = def; return id; },
    anchor: function (id) { return game.C ? game.C.anchor(id) : null; },
    unitRects: function () { return game.C && game.scene === 'battle' ? game.C.unitRects() : []; },
    fieldRect: function () { return { x: 0, y: 0, w: W, h: 250 }; },
    uiRects: function () { return (game.C && game.scene === 'battle' ? game.C.uiRects() : []).concat(hudRects.slice()); },
    shake: function (px, frames) { if (REDUCED) return; fxState.shake = Math.max(fxState.shake, frames | 0); fxState.shakePx = Math.max(fxState.shakeFrames > 0 ? fxState.shakePx : 0, px); fxState.shakeFrames = fxState.shake; },
    flash: function (color, frames, alpha) { if (REDUCED) return; fxState.flash = { color: color || '#ffffff', n: frames | 0 || 6, t: 0, a: alpha == null ? 0.3 : alpha }; },
    hitStop: function (f) { var n = typeof f === 'object' && f ? Math.ceil((f.ms || 0) * 60 / 1000) : f | 0; game.clock.stop = Math.max(game.clock.stop, n); },
    hitStopMs: function (ms) { game.hitStop({ ms: ms }); },
    pause: function (on) { game.clock.paused = !!on; },
    holdBoot: function () { bootHolds++; var done = false; return function () { if (done) return; done = true; bootHolds--; if (!bootHolds && bootWaiting) boot(); }; },
    state: function () {
      var c = game.C && game.scene === 'battle' ? game.C.state() : null;
      return { scene: game.scene, fight: game.fight, hp: game.hero.hp, maxHp: game.hero.maxHp, deck: game.deck.length, frame: game.clock.frame,
        results: game.results.map(function (r) { return r.result[0]; }).join(''), turns: game.results.map(function (r) { return r.turns; }).join(','),
        battle: c, auto: game.autoplay.on };
    }
  };
  window.GAME = game;
  game.shipped = { cards: Object.keys(CB.CARDS), enemies: Object.keys(CB.ENEMIES), statuses: Object.keys(CB.STATUSES) };
  function each(hook, args) {
    var out = false;
    game.addons.forEach(function (a) { if (!a || typeof a[hook] !== 'function') return; try { if (a[hook].apply(a, args) === true) out = true; } catch (e) { console.error('addon ' + (a.name || '?') + '.' + hook + ': ' + e.message); } });
    return out;
  }
  var fxState = { shake: 0, shakePx: 0, shakeFrames: 0, flash: null };
  var hudRects = [], bootHolds = 0, bootWaiting = false, booted = false;

  /* =================================================================================================
     === 3. Battle setup: one GameDNA_CardBattle instance, a fight per stop ============================= */
  function makeInstance() {
    game.C = CB.create({
      view: { x: 0, y: 0, w: W, h: H }, seed: SEED, cards: CARDS, enemies: ENEMIES, statuses: STATUSES,
      params: { speed: SPEED, energy: ENERGY, draw: DRAW, reduced: REDUCED ? 'on' : 'off' },
      drawBackground: function (ctx, view, t) { ART.draw(ctx, (FIGHTS[game.fight] || {}).theme || 'marsh', t); },
      drawArt: function (ctx, key, rect, card) { return typeof game.drawArt === 'function' ? game.drawArt(ctx, key, rect, card) : false; },
      onHit: hitSite,
      onEvent: function (ev) {
        each('onEvent', [ev, game]);
        if (ev.kind === 'play') each('onPlay', [ev, game]);
      },
      onTurn: function (turn, side) { each('onTurn', [turn, side, game]); },
      onEnd: endBattle
    });
  }
  function newGame() {
    game.fight = 0; game.results = []; game.deck = START_DECK.slice(); game.hero = { hp: HERO.maxHp, maxHp: HERO.maxHp, name: HERO.name }; game.lastEnd = null;
    each('onNewGame', [game]);
  }
  function startBattle() {
    var f = FIGHTS[game.fight];
    game.C.start({ deck: game.deck.slice(), foes: f.foes.slice(), hero: { id: 'hero', hp: game.hero.hp, maxHp: game.hero.maxHp, name: game.hero.name }, seed: (SEED * 1009 + game.fight * 97) >>> 0 });
    game.C.setAuto(game.autoplay.on);
    game.clock.battleFrame = 0;
    setScene('battle');
    each('onBattleStart', [game]);
  }
  function endBattle(result, info) {
    game.hero.hp = info.hero.hp;
    game.lastEnd = { result: result, turns: info.turns, stats: info.stats };
    game.results.push({ fight: game.fight, result: result, turns: info.turns, hp: info.hero.hp, played: info.stats.played });
    each('onBattleEnd', [result, info, game]);
    if (result !== 'win') { setScene('defeat'); return; }
    if (game.fight + 1 >= FIGHTS.length) { setScene('victory'); return; }
    openReward();
  }

  /* =================================================================================================
     === 4. Hit site: every HP change of a battle, on its impact frame ================================== */
  function hitSite(ev) {
    if (ev.kind === 'damage' && ev.side === 'hero' && ev.amount >= 10 && game.flags.builtinFlash) game.flash('#ff3020', 6, 0.16);
    each('onHit', [ev, game]);
  }

  /* =================================================================================================
     === 5. Scenes: title, road (map between stops), battle, reward, victory, defeat ==================== */
  var sceneT = 0;
  function setScene(s) { game.scene = s; sceneT = 0; hudRects = []; each('onScene', [s, game]); }
  // reward: three cards dealt from REWARD_POOL with a seeded shuffle; pick one or skip. Resting heals first.
  function openReward() {
    var r = CB.rules.mkRng((SEED * 31 + game.fight * 7 + 3) >>> 0), pool = CB.rules.shuffle(r, REWARD_POOL.slice()).filter(function (id) { return game.C.lib.cards[id]; });
    var healed = Math.min(REST_HP, game.hero.maxHp - game.hero.hp); game.hero.hp += healed;
    game.reward = { offer: pool.slice(0, 3), cursor: 1, healed: healed, picked: null, t: 0, skip: false };
    setScene('reward');
  }
  function autoPickIndex() {
    if (typeof game.autoplay.pick === 'function') { try { var i = game.autoplay.pick(game.reward.offer.slice(), game); if (i != null) return i; } catch (e) { console.error(e); } }
    var best = 0, bs = -1, atk = game.deck.filter(function (id) { var d = game.C.lib.cards[id]; return d && d.type === 'attack'; }).length;
    game.reward.offer.forEach(function (id, i) { var d = game.C.lib.cards[id] || {}, s = (RARITY_RANK[d.rarity] || 1) * 10 + (d.type === 'attack' && atk < game.deck.length / 2 ? 3 : 0) - (d.cost | 0); if (s > bs) { bs = s; best = i; } });
    return best;
  }
  function takeReward(i) {
    var R = game.reward; if (!R || R.picked !== null || R.skip) return;
    if (i < 0) { R.skip = true; R.t = 0; each('onReward', [null, game]); return; }
    R.picked = i; R.t = 0; game.deck.push(R.offer[i]); each('onReward', [R.offer[i], game]);
  }
  function rewardKey(k) {
    var R = game.reward; if (!R) return;
    if (R.picked !== null || R.skip) { if ((k === 'ok' || (k && k.tap)) && R.t > 20) toRoad(); return; }
    if (k === 'left') R.cursor = Math.max(0, R.cursor - 1);
    else if (k === 'right') R.cursor = Math.min(R.offer.length, R.cursor + 1);
    else if (k === 'ok') takeReward(R.cursor >= R.offer.length ? -1 : R.cursor);
    else if (k === 'back') takeReward(-1);
    else if (k && k.tap) { var hit = -2; rewardRects().forEach(function (r, i) { if (k.x >= r.x && k.x <= r.x + r.w && k.y >= r.y && k.y <= r.y + r.h) hit = i; }); if (hit === R.offer.length) takeReward(-1); else if (hit >= 0) { if (R.cursor === hit) takeReward(hit); else R.cursor = hit; } }
  }
  function toRoad() { game.fight++; game.reward = null; setScene('road'); }
  function sceneOk() {
    if (game.scene === 'title') { newGame(); setScene('road'); }
    else if (game.scene === 'road' && sceneT > 20) startBattle();
    else if ((game.scene === 'victory' || game.scene === 'defeat') && sceneT > 50) setScene('title');
  }
  function sceneAuto() {
    if (!game.autoplay.on) return;
    if (game.scene === 'title' && sceneT === 60) sceneOk();
    if (game.scene === 'road' && sceneT === 80) sceneOk();
    if (game.scene === 'reward') { var R = game.reward; if (R.picked === null && !R.skip) { if (sceneT === 50) R.cursor = autoPickIndex(); if (sceneT === 80) takeReward(R.cursor); } else if (R.t === 70) toRoad(); }
    if ((game.scene === 'victory' || game.scene === 'defeat') && sceneT === 600) sceneOk();
  }

  /* =================================================================================================
     === 6. Main tick (60 Hz) ========================================================================== */
  var keyQ = [];
  function tick() {
    var c = game.clock; c.frame++;
    var frozen = c.paused || c.stop > 0;
    if (c.stop > 0) c.stop--;
    var keys = keyQ; keyQ = [];
    keys.forEach(function (k) {
      var isPtr = k && k.ptr;
      if (!isPtr || k.ptr === 'down') { var asKey = isPtr ? { tap: true, x: k.x, y: k.y } : k; if (each('onKey', [asKey, game])) return; }
      if (k === 'auto') { game.autoplay.on = !game.autoplay.on; if (game.C) game.C.setAuto(game.autoplay.on && game.scene === 'battle'); return; }
      if (game.autoplay.on && !(isPtr && k.ptr !== 'down')) { game.autoplay.on = false; if (game.C) game.C.setAuto(false); }
      if (game.scene === 'battle') { if (isPtr) game.C.pointer(k.ptr, k.x, k.y); else if (k !== 'tactic') game.C.key(k); return; }
      if (isPtr && k.ptr !== 'down') return;
      var kk = isPtr ? { tap: true, x: k.x, y: k.y } : k;
      if (game.scene === 'reward') rewardKey(kk);
      else if (kk === 'ok' || (kk && kk.tap)) sceneOk();
    });
    if (!frozen) { sceneT++; if (game.reward) game.reward.t++; }
    if (!frozen) sceneAuto();
    if (game.C && game.scene === 'battle') {
      game.C.setParams({ numbers: game.flags.builtinNumbers ? 'on' : 'off', shake: game.flags.builtinShake ? 'on' : 'off' });
      if (game.C.auto() !== game.autoplay.on) game.C.setAuto(game.autoplay.on);
      game.C.update(frozen ? 0 : STEP);
      if (!frozen) c.battleFrame++;
    }
    if (fxState.shake > 0 && !frozen) fxState.shake--;
    if (fxState.flash && !frozen) { fxState.flash.t++; if (fxState.flash.t >= fxState.flash.n) fxState.flash = null; }
    each('update', [game, { dt: frozen ? 0 : STEP, frozen: frozen, paused: c.paused, hitStop: c.stop }]);
  }

  /* =================================================================================================
     === 7. Drawing (640x360 logical, devicePixelRatio-aware backing store) ============================== */
  function txt(s, x, y, o) { return CB.text(g, s, x, y, o); }
  function panel(x, y, w, h, o) {
    o = o || {}; g.save(); g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, o.r || 10) : g.rect(x, y, w, h);
    var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, o.top || 'rgba(40,30,54,0.94)'); gr.addColorStop(1, o.bottom || 'rgba(14,10,22,0.96)'); g.fillStyle = gr; g.fill();
    g.lineWidth = o.lw || 1.6; g.strokeStyle = o.stroke || 'rgba(217,180,106,0.85)'; g.stroke(); g.restore();
  }
  function render() {
    g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    g.imageSmoothingEnabled = true; hudRects = [];
    var t = game.clock.frame / 60;
    if (!game.C) return;
    g.save();
    if (fxState.shake > 0) { var k = fxState.shake / Math.max(1, fxState.shakeFrames), px = fxState.shakePx * k; g.translate(Math.round(Math.sin(game.clock.frame * 2.1) * px), Math.round(Math.cos(game.clock.frame * 2.9) * px * 0.6)); }
    if (game.scene === 'battle') { game.C.drawScene(g); each('draw', [g, 'fx', game]); }
    else ART.draw(g, game.scene === 'title' ? 'title' : game.scene === 'road' || game.scene === 'reward' ? ((FIGHTS[Math.min(game.fight + (game.scene === 'reward' ? 0 : 0), FIGHTS.length - 1)] || {}).theme || 'marsh') : ((FIGHTS[Math.min(game.fight, FIGHTS.length - 1)] || {}).theme || 'marsh'), t);
    g.restore();
    if (fxState.flash) { var fl = fxState.flash; g.save(); g.globalAlpha = fl.a * (1 - fl.t / fl.n); g.fillStyle = fl.color; g.fillRect(0, 0, W, H); g.restore(); }
    if (game.scene === 'battle') { game.C.drawUI(g); drawTopBar(); }
    else if (game.scene === 'title') drawTitle(t);
    else if (game.scene === 'road') drawRoad(t);
    else if (game.scene === 'reward') drawReward(t);
    else drawEnd(t, game.scene === 'victory');
    each('draw', [g, 'overlay', game]);
    each('drawUI', [g, game]);
    updateInfo();
  }
  function drawTopBar() {
    var f = FIGHTS[game.fight] || {}, s = 'Stop ' + (game.fight + 1) + ' / ' + FIGHTS.length + ' · ' + f.name;
    var w = CB.text(g, '', 0, 0, {}) || 0; g.font = '800 10px "Trebuchet MS", system-ui, sans-serif'; w = g.measureText(s).width + 26;
    panel(8, 6, w, 20, { r: 10, lw: 1.2 });
    txt(s, 21, 20, { size: 10, weight: 800, color: f.boss ? '#ffb0a0' : '#f2e2c4', ow: 0 });
    hudRects.push({ name: 'stopTag', x: 8, y: 6, w: w, h: 20 });
    var d = 'Deck ' + game.deck.length; panel(w + 14, 6, 62, 20, { r: 10, lw: 1.2 }); txt(d, w + 45, 20, { size: 10, weight: 800, align: 'center', color: '#d8ccf0', ow: 0 });
    hudRects.push({ name: 'deckTag', x: w + 14, y: 6, w: 62, h: 20 });
  }
  function drawTitle(t) {
    var cards = ['lantern-flare', 'thorn-jab', 'bark-ward', 'kindle', 'heartwood'];
    cards.forEach(function (id, i) {
      var off = i - 2, x = W / 2 + off * 74, y = 236 + off * off * 6 + Math.sin(t * 1.4 + i) * 3, r = off * 0.12;
      g.save(); g.translate(x, y); g.rotate(r); game.C.drawCard(g, id, -48, -72, 96, { playable: true, glow: i === 2, t: t }); g.restore();
    });
    g.save(); g.globalCompositeOperation = 'lighter'; var gr = g.createRadialGradient(W / 2, 80, 4, W / 2, 80, 200); gr.addColorStop(0, 'rgba(255,200,120,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, 200); g.restore();
    txt('THE LANTERN ROAD', W / 2, 74, { size: 38, weight: 900, align: 'center', color: '#ffe2a0', ow: 6, oc: '#1a0c08', ls: 3 });
    txt('A card battle with foes that show their hand', W / 2, 98, { size: 12, weight: 700, align: 'center', color: '#f2e6d6', ow: 3 });
    if (Math.floor(t * 2) % 2 === 0) txt('PRESS Z OR TAP TO SET OUT', W / 2, 136, { size: 12, weight: 900, align: 'center', color: '#ffffff', ow: 4, ls: 1 });
    hudRects.push({ name: 'title', x: 120, y: 40, w: 400, h: 104 });
  }
  function drawRoad(t) {
    var f = FIGHTS[game.fight] || {}, n = FIGHTS.length, x0 = 130, x1 = 510, y = 118;
    panel(70, 30, 500, 280, { r: 14 });
    txt('THE ROAD AHEAD', W / 2, 58, { size: 16, weight: 900, align: 'center', color: '#ffe2a0', ow: 4, ls: 2 });
    g.save(); g.beginPath(); for (var i = 0; i <= 40; i++) { var k = i / 40, xx = x0 + (x1 - x0) * k, yy = y + Math.sin(k * Math.PI * 2) * 12; g[i ? 'lineTo' : 'moveTo'](xx, yy); }
    g.lineWidth = 6; g.strokeStyle = 'rgba(10,6,10,0.8)'; g.stroke(); g.setLineDash([6, 6]); g.lineWidth = 2; g.strokeStyle = 'rgba(255,220,160,0.6)'; g.stroke(); g.setLineDash([]); g.restore();
    FIGHTS.forEach(function (F, i) {
      var k = n > 1 ? i / (n - 1) : 0, xx = x0 + (x1 - x0) * k, yy = y + Math.sin(k * Math.PI * 2) * 12, done = i < game.fight, cur = i === game.fight, r = F.boss ? 16 : 12;
      if (cur) { g.save(); g.globalCompositeOperation = 'lighter'; var gl = g.createRadialGradient(xx, yy, 0, xx, yy, 40); gl.addColorStop(0, 'rgba(255,200,110,' + (0.5 + 0.2 * Math.sin(t * 4)) + ')'); gl.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gl; g.fillRect(xx - 40, yy - 40, 80, 80); g.restore(); }
      g.beginPath(); g.arc(xx, yy, r, 0, Math.PI * 2); var cg = g.createRadialGradient(xx - 4, yy - 5, 1, xx, yy, r); cg.addColorStop(0, done ? '#fff0c0' : cur ? '#ffb85a' : '#6a6080'); cg.addColorStop(1, done ? '#b8803a' : cur ? '#8a3a12' : '#2a2438'); g.fillStyle = cg; g.fill(); g.lineWidth = 2; g.strokeStyle = '#1a0e08'; g.stroke();
      txt(done ? '\u2713' : F.boss ? '!' : '' + (i + 1), xx, yy + 5, { size: F.boss ? 15 : 12, weight: 900, align: 'center', color: done ? '#3a2008' : '#fff', ow: done ? 0 : 3 });
      txt(F.name, xx, yy + (i % 2 ? -r - 8 : r + 15), { size: 9, weight: 800, align: 'center', color: cur ? '#ffe2a0' : '#bcb0d0', ow: 3 });
    });
    // the next foes, painted small on a lit patch of road
    var foes = f.foes || [], nf = foes.length, gx = W / 2, gy = 232;
    g.save(); var lp = g.createRadialGradient(gx, gy, 4, gx, gy, 150); lp.addColorStop(0, 'rgba(255,210,150,0.22)'); lp.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = lp; g.fillRect(gx - 160, gy - 90, 320, 110); g.restore();
    foes.forEach(function (id, i) {
      var d = game.C.lib.enemies[id] || {}, look = CB.LOOKS[d.look] || CB.LOOKS.slime, pal = Object.assign({}, CB.PALETTES[d.look] || CB.PALETTES.slime, d.palette || {}), s = 0.5 * (d.size || 1), x = gx + (i - (nf - 1) / 2) * 92;
      g.save(); g.globalAlpha = 0.45; g.beginPath(); g.ellipse(x, gy + 2, 26 * s / 0.5, 5, 0, 0, Math.PI * 2); g.fillStyle = '#000'; g.fill(); g.restore();
      g.save(); g.translate(x, gy); g.scale(s, s); try { if (typeof d.draw === 'function') d.draw(g, { id: id, kind: id, hp: 1, maxHp: 1, st: {} }, { t: t, act: false, seed: i + 1 }); else look(g, pal, t, { t: t, act: false, seed: i + 1 }); } catch (e) { } g.restore();
    });
    var fo = foes.map(function (id) { var d = game.C.lib.enemies[id]; return d ? d.name : id; });
    txt((f.boss ? 'Final stop: ' : 'Next: ') + fo.join(', '), W / 2, 254, { size: 11, weight: 800, align: 'center', color: f.boss ? '#ffb0a0' : '#f2e6d6', ow: 3 });
    txt('HP ' + game.hero.hp + ' / ' + game.hero.maxHp + '   \u00b7   Deck ' + game.deck.length + ' cards', W / 2, 272, { size: 10, weight: 700, align: 'center', color: '#c8bce0', ow: 3 });
    if (sceneT > 20 && Math.floor(t * 2) % 2 === 0) txt('Z or tap: walk on', W / 2, 296, { size: 11, weight: 900, align: 'center', color: '#ffd36a', ow: 4 });
    hudRects.push({ name: 'roadPanel', x: 70, y: 30, w: 500, h: 280 });
  }
  function rewardRects() {
    var R = game.reward, n = R ? R.offer.length : 0, w = 112, gap = 20, x0 = W / 2 - (n * w + (n - 1) * gap) / 2, out = [];
    for (var i = 0; i < n; i++) out.push({ x: x0 + i * (w + gap), y: 84, w: w, h: w * 1.5 });
    out.push({ x: W / 2 - 50, y: 264 + 22, w: 100, h: 24 });
    return out;
  }
  function drawReward(t) {
    var R = game.reward; if (!R) return; var rects = rewardRects();
    g.save(); g.fillStyle = 'rgba(8,5,14,0.55)'; g.fillRect(0, 0, W, H); g.restore();
    txt(R.picked !== null || R.skip ? 'ON TO THE NEXT STOP' : 'CHOOSE A CARD FOR YOUR DECK', W / 2, 40, { size: 17, weight: 900, align: 'center', color: '#ffe2a0', ow: 4, ls: 1.5 });
    txt(R.healed > 0 ? 'You rest by the lantern: +' + R.healed + ' HP (' + game.hero.hp + ' / ' + game.hero.maxHp + ')' : 'You rest by the lantern (HP full).', W / 2, 60, { size: 10.5, weight: 700, align: 'center', color: '#9ff0b0', ow: 3 });
    hudRects.push({ name: 'rewardTitle', x: 120, y: 24, w: 400, h: 44 });
    R.offer.forEach(function (id, i) {
      var r = rects[i], sel = R.cursor === i && R.picked === null && !R.skip, deal = Math.min(1, Math.max(0, (sceneT - i * 6) / 18)), k = 1 - Math.pow(1 - deal, 3);
      var gone = R.picked !== null ? (R.picked === i ? 0 : Math.min(1, R.t / 14)) : R.skip ? Math.min(1, R.t / 14) : 0;
      var fly = R.picked === i ? Math.min(1, R.t / 30) : 0;
      g.save(); g.globalAlpha = (1 - gone) * k;
      var cx = r.x + r.w / 2, cy = r.y + r.h / 2 + (1 - k) * 60 - (sel ? 8 : 0) + fly * 120, sc = (sel ? 1.06 : 1) * (1 - fly * 0.6);
      g.translate(cx + fly * (590 - cx), cy); g.scale(sc, sc);
      game.C.drawCard(g, id, -r.w / 2, -r.h / 2, r.w, { playable: true, glow: sel || R.picked === i, selected: sel, t: t });
      g.restore();
      hudRects.push({ name: 'rewardCard', x: r.x, y: r.y, w: r.w, h: r.h });
    });
    var sk = rects[R.offer.length], skSel = R.cursor === R.offer.length && R.picked === null && !R.skip;
    if (R.picked === null && !R.skip) {
      panel(sk.x, sk.y, sk.w, sk.h, { r: 12, stroke: skSel ? '#ffe2a0' : 'rgba(217,180,106,0.6)', lw: skSel ? 2.2 : 1.2 });
      txt('Skip (X)', sk.x + sk.w / 2, sk.y + 16, { size: 10, weight: 900, align: 'center', color: skSel ? '#fff' : '#c8bce0', ow: 0 });
      txt('Arrows choose · Z takes · tap twice', W / 2, 340, { size: 9.5, weight: 700, align: 'center', color: '#bcb0d0', ow: 3 });
    } else if (R.t > 20 && Math.floor(t * 2) % 2 === 0) txt('Z or tap: continue', W / 2, 330, { size: 11, weight: 900, align: 'center', color: '#ffd36a', ow: 4 });
    hudRects.push({ name: 'skip', x: sk.x, y: sk.y, w: sk.w, h: sk.h });
  }
  function drawEnd(t, won) {
    g.save(); g.fillStyle = 'rgba(8,5,14,0.5)'; g.fillRect(0, 0, W, H); g.restore();
    var found = game.deck.slice(START_DECK.length).slice(-4), cw = 72, ch = cw * 1.5;
    var x = W / 2 - 200, y = 22, w = 400, h = found.length ? 300 : 178; panel(x, y, w, h, { r: 16, stroke: won ? '#ffe2a0' : '#ff8a7a', lw: 2 });
    txt(won ? 'THE ROAD IS LIT' : 'THE LANTERN GOES OUT', W / 2, y + 40, { size: 24, weight: 900, align: 'center', color: won ? '#ffe2a0' : '#ff9a8a', ow: 5, ls: 2 });
    var played = game.results.reduce(function (a, r) { return a + (r.played || 0); }, 0), turns = game.results.reduce(function (a, r) { return a + (r.turns || 0); }, 0), F = FIGHTS[Math.min(game.fight, FIGHTS.length - 1)] || {};
    txt(won ? 'All ' + FIGHTS.length + ' stops cleared' : 'Fell at stop ' + (game.fight + 1) + ' of ' + FIGHTS.length + ': ' + F.name, W / 2, y + 66, { size: 12, weight: 800, align: 'center', color: '#f2e6d6', ow: 0 });
    txt(turns + ' turns \u00b7 ' + played + ' cards played \u00b7 deck of ' + game.deck.length + ' \u00b7 HP ' + game.hero.hp + ' / ' + game.hero.maxHp, W / 2, y + 86, { size: 10.5, weight: 700, align: 'center', color: won ? '#c8f0d0' : '#e8c0c0', ow: 0 });
    // the road walked: one pip per stop
    FIGHTS.forEach(function (Fi, i) { var px = W / 2 + (i - (FIGHTS.length - 1) / 2) * 34, r = game.results.filter(function (q) { return q.fight === i; }).pop(), c = r ? (r.result === 'win' ? '#ffd27a' : '#ff6a5a') : '#4a4060';
      g.beginPath(); g.arc(px, y + 110, 7, 0, Math.PI * 2); g.fillStyle = c; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#1a0e08'; g.stroke(); if (i) { g.beginPath(); g.moveTo(px - 27, y + 110); g.lineTo(px - 7, y + 110); g.strokeStyle = 'rgba(255,220,160,0.5)'; g.stroke(); } });
    if (found.length) {
      txt('Found on the road', W / 2, y + 140, { size: 9, weight: 800, align: 'center', color: '#bcb0d0', ow: 0, ls: 1 });
      found.forEach(function (id, i) { var x0 = W / 2 - (found.length * (cw + 10) - 10) / 2 + i * (cw + 10); game.C.drawCard(g, id, x0, y + 148, cw, { playable: true, t: t }); });
    } else txt(won ? '' : 'No cards were added to the deck.', W / 2, y + 140, { size: 10, weight: 700, align: 'center', color: '#bcb0d0', ow: 0 });
    if (sceneT > 50 && Math.floor(t * 2) % 2 === 0) txt('Z: back to the title', W / 2, y + h + 20, { size: 10.5, weight: 900, align: 'center', color: '#ffd36a', ow: 3 });
    hudRects.push({ name: 'endBox', x: x, y: y, w: w, h: h });
  }
  // A 13 px HTML caption under the canvas on narrow screens mirrors what matters (the canvas text is small there).
  var info = document.getElementById('info'), lastInfo = '';
  function updateInfo() {
    if (!info) return; var h = '';
    if (game.scene === 'title') h = '<b>The Lantern Road</b> <span class="dim">Tap or Z to set out.</span>';
    else if (game.scene === 'road') h = '<b>Next stop:</b> ' + (FIGHTS[game.fight] || {}).name + ' <span class="dim">HP ' + game.hero.hp + '/' + game.hero.maxHp + ', deck ' + game.deck.length + '. Tap to walk on.</span>';
    else if (game.scene === 'battle' && game.C) {
      var s = game.C._state(); if (s) {
        var foes = s.foes.filter(function (f) { return f.hp > 0; }).map(function (f) { var v = game.C.intentOf(f.id); return '<b>' + f.name + '</b> ' + f.hp + '/' + f.maxHp + (v ? ' <span class="dim">→ ' + v.name + (v.damage ? ' ' + v.damage : '') + '</span>' : ''); }).join(' · ');
        h = 'Turn ' + s.turn + ' · HP ' + s.hero.hp + '/' + s.hero.maxHp + (s.hero.ward ? ' · Ward ' + s.hero.ward : '') + ' · Lumen ' + s.energy + '/' + s.energyMax + '<br>' + foes;
      }
    } else if (game.scene === 'reward' && game.reward) { var R = game.reward, id = R.offer[R.cursor], d = id && game.C.lib.cards[id]; h = '<b>Choose a card</b> ' + (d ? '<span class="dim">' + d.name + ' (' + d.cost + '): ' + CB.cardText(d).replace(/\[[gry]([^\]]*)\]/g, '$1') + '</span>' : '<span class="dim">Skip</span>'); }
    else h = '<b>' + (game.scene === 'victory' ? 'The road is lit' : 'The lantern goes out') + '</b>';
    if (h !== lastInfo) { info.innerHTML = h; lastInfo = h; }
  }
  var bar = document.getElementById('bar');
  function fit() {
    var r = document.getElementById('stage').getBoundingClientRect();
    var availW = r.width || innerWidth, availH = Math.max(200, innerHeight - (bar ? bar.getBoundingClientRect().height : 0) - 40);
    var cssW = Math.min(availW, availH * W / H), cssH = cssW * H / W, dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.style.width = Math.floor(cssW) + 'px'; canvas.style.height = Math.floor(cssH) + 'px';
    var bw = Math.min(2560, Math.round(cssW * dpr)), bh = Math.round(bw * H / W);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  }
  addEventListener('resize', function () { fit(); });

  /* =================================================================================================
     === 8. Input: a key queue (a 0 ms tap still counts), pointer drags, held keys ====================== */
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', x: 'back', X: 'back', Escape: 'back', Backspace: 'back', p: 'auto', P: 'auto', e: 'end', E: 'end' };
  addEventListener('keydown', function (e) { game.held[e.key] = true; var k = KEYS[e.key]; if (!k) return; e.preventDefault(); if (!e.repeat) keyQ.push(k); });
  addEventListener('keyup', function (e) { game.held[e.key] = false; });
  addEventListener('blur', function () { for (var k in game.held) game.held[k] = false; });
  function local(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
  canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch (x) { } var p = local(e); keyQ.push({ ptr: 'down', x: p.x, y: p.y }); });
  canvas.addEventListener('pointermove', function (e) { var p = local(e); keyQ.push({ ptr: 'move', x: p.x, y: p.y }); });
  canvas.addEventListener('pointerup', function (e) { var p = local(e); keyQ.push({ ptr: 'up', x: p.x, y: p.y }); });
  canvas.addEventListener('pointercancel', function (e) { var p = local(e); keyQ.push({ ptr: 'cancel', x: p.x, y: p.y }); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-key]'), function (b) { b.addEventListener('pointerdown', function (e) { e.preventDefault(); keyQ.push(b.getAttribute('data-key')); }); });

  /* =================================================================================================
     === 9. Boot ======================================================================================== */
  function boot() {
    if (booted) return;
    if (bootHolds > 0) { bootWaiting = true; return; }
    booted = true;
    fit(); makeInstance(); newGame(); setScene('title');
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
  game.step = function (n) { for (var i = 0; i < (n || 1); i++) tick(); };
  game.render = render;
  game.press = function (k) { keyQ.push(k); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
