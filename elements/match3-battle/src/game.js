/* Shardbound: the A-17 match-3 battle starter. A complete three-stage journey built on GameDNA_Match3Battle.
   Four heroes (Knight, Archer, Herbalist, Keeper) walk the Ember Road: the Meadow Road, the Mirrormere Shore and the
   Barrow Ruins, two waves each, the Barrow Colossus last. Swap gems; every colour powers the hero of that colour and
   charges a skill; hearts heal; foes strike when their countdown reaches 0.
   Search for the "=== n." banners: config and content, the game object (extension points), battle setup, the hit site,
   scenes, the main tick, drawing, input, boot. */
(function () {
  'use strict';
  /* =================================================================================================
     === 1. Config and content ========================================================================= */
  var qs = new URLSearchParams(location.search);
  // Layout: 'wide' (stage left, board right; 960 x 540 logical) or 'tall' (stage above the board; 540 x 960) from the
  // window when the page loads (?layout=wide|tall to force). The rules never depend on it: same seed, same game.
  var vw = window.innerWidth || 960, vh = window.innerHeight || 540;
  var LAYOUT = qs.get('layout') === 'tall' || qs.get('layout') === 'wide' ? qs.get('layout') : (vw < 760 || vw / vh < 1 ? 'tall' : 'wide');
  var W = LAYOUT === 'tall' ? 540 : 960, H = LAYOUT === 'tall' ? 960 : 540, STEP = 1000 / 60;
  var FREEZE_AT = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : null;
  var FROZEN = FREEZE_AT !== null && qs.get('freeze') === '1';
  var AUTO = qs.get('auto') === '1' || (FROZEN && qs.get('auto') !== '0');
  var SEED = (+qs.get('seed') >>> 0) || 7;
  var STAGE0 = Math.max(0, (+qs.get('stage') || 1) - 1);       // ?stage=3 starts the journey at the third stage (testing)
  var REDUCED = qs.get('reduced') === '1' || (!!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var M3 = GameDNA_Match3Battle;

  // Content tables. The module ships the built-ins (GameDNA_Match3Battle.GEMS / HEROES / SKILLS / ENEMIES, formats in
  // module/README.md); these copies are what the battle uses, so entries added here or later through GAME.addGem /
  // addSkill / addHero / addEnemy take part in every battle.
  function copyOf(t) { var o = {}; for (var k in t) o[k] = t[k]; return o; }
  var GEMS = copyOf(M3.GEMS), HEROES = copyOf(M3.HEROES), SKILLS = copyOf(M3.SKILLS), ENEMIES = copyOf(M3.ENEMIES);
  var PARTY = ['knight', 'archer', 'herbalist', 'keeper'];
  // The journey: one stage per entry. scene = a backdrop id (meadow-dusk, lakeside-day, ruins-night); waves = lists of enemy ids.
  var STAGES = [
    { name: 'Meadow Road', scene: 'meadow-dusk', waves: [['slime', 'slime'], ['wolf', 'slime']] },
    { name: 'Mirrormere Shore', scene: 'lakeside-day', waves: [['imp', 'wisp', 'imp'], ['harpy', 'wolf']] },
    { name: 'Barrow Ruins', scene: 'ruins-night', waves: [['skeleton', 'cultist'], ['golem']] }
  ];
  var PARAMS = { layout: LAYOUT, hints: 'on', numbers: 'on', specials: 'on', speed: 1 };

  /* =================================================================================================
     === 2. Game object: the public surface and the extension points (see README) ======================= */
  var canvas = document.getElementById('screen'), g = canvas.getContext('2d');
  var game = {
    W: W, H: H, layout: LAYOUT, addons: [], flags: { builtinShake: true, builtinFlash: true },
    scene: 'title', stage: 0, C: null, results: [], lastEnd: null,
    clock: { frame: 0, battleFrame: 0, paused: false, stop: 0 },
    autoplay: { on: AUTO },
    held: {},                                   // keys held right now ({ArrowLeft: true}); maintained by keydown / keyup only
    gems: GEMS, heroes: HEROES, skills: SKILLS, enemies: ENEMIES, party: PARTY, stages: STAGES, params: PARAMS, seed: SEED,
    shipped: null,                              // the content ids this file ships with (set below, before the ADDONS SLOT)
    addGem: function (id, def) { GEMS[id] = def; return id; },
    addSkill: function (id, def, o) { SKILLS[id] = def; o = o || {}; if (o.hero && HEROES[o.hero]) HEROES[o.hero] = Object.assign({}, HEROES[o.hero], { skill: id }); return id; },
    addHero: function (id, def, o) { HEROES[id] = def; o = o || {}; if (o.slot != null) PARTY[o.slot] = id; else if (PARTY.indexOf(id) < 0 && PARTY.length < 4) PARTY.push(id); return id; },
    addEnemy: function (id, def, o) {
      ENEMIES[id] = def; o = o || {};
      if (o.stage != null) { var S = STAGES[o.stage]; if (S) { var wi = Math.max(1, o.wave || 1) - 1; while (S.waves.length <= wi) S.waves.push([]); var w = S.waves[wi]; for (var n = 0; n < (o.count || 1); n++) { if (w.length >= 3) w.shift(); w.push(id); } } }
      return id;
    },
    addStage: function (st, at) { var i = at == null ? STAGES.length : Math.max(0, Math.min(at, STAGES.length)); STAGES.splice(i, 0, st); return i; },
    anchor: function (id) { return game.C && game.scene === 'battle' ? game.C.anchor(id) : null; },
    unitRects: function () { return game.C && game.scene === 'battle' ? game.C.unitRects() : []; },
    fieldRect: function () { return game.C ? game.C.fieldRect() : { x: 12, y: 48, w: 456, h: 282 }; },
    boardRect: function () { return game.C ? game.C.boardRect() : { x: 484, y: 38, w: 464, h: 464 }; },
    uiRects: function () { return (game.C && game.scene === 'battle' ? game.C.uiRects() : []).concat(hudRects.slice()); },
    shake: function (px, frames) { if (REDUCED) return; fxState.shake = Math.max(fxState.shake, frames | 0); fxState.shakePx = Math.max(fxState.shake > 0 ? fxState.shakePx : 0, px); fxState.shakeFrames = fxState.shake; },
    flash: function (color, frames, alpha) { if (REDUCED) return; fxState.flash = { color: color || '#ffffff', n: frames | 0 || 6, t: 0, a: alpha == null ? 0.3 : alpha }; },
    hitStop: function (f) { var n = typeof f === 'object' && f ? Math.ceil((f.ms || 0) * 60 / 1000) : f | 0; game.clock.stop = Math.max(game.clock.stop, n); },
    hitStopMs: function (ms) { game.hitStop({ ms: ms }); },
    pause: function (on) { game.clock.paused = !!on; },
    holdBoot: function () { bootHolds++; var done = false; return function () { if (done) return; done = true; bootHolds--; if (!bootHolds && bootWaiting) boot(); }; },
    state: function () {
      var c = game.C && game.scene === 'battle' ? game.C.state() : null;
      return { scene: game.scene, stage: game.stage, frame: game.clock.frame, results: game.results.map(function (r) { return r.result[0]; }).join(''),
        hp: game.results.map(function (r) { return r.hp; }).join(','), m3: c, auto: game.autoplay.on, layout: LAYOUT };
    }
  };
  window.GAME = game;
  game.shipped = { gems: Object.keys(GEMS), heroes: Object.keys(HEROES), skills: Object.keys(SKILLS), enemies: Object.keys(ENEMIES) };
  function each(hook, args) {
    var out = false;
    game.addons.forEach(function (a) { if (!a || typeof a[hook] !== 'function') return; try { if (a[hook].apply(a, args) === true) out = true; } catch (e) { console.error('addon ' + (a.name || '?') + '.' + hook + ': ' + e.message); } });
    return out;
  }
  var fxState = { shake: 0, shakePx: 0, shakeFrames: 0, flash: null };
  var hudRects = [], bootHolds = 0, bootWaiting = false, booted = false, sceneT = 0;

  /* =================================================================================================
     === 3. Battle setup: one GameDNA_Match3Battle instance, started once per stage ===================== */
  var Kit = window.GameDNA_DemoKit, ICONS = window.GameDNA_ShardIcons, iconImg = null;
  if (ICONS) { iconImg = new Image(); var relIcons = game.holdBoot(); iconImg.onload = relIcons; iconImg.onerror = relIcons; iconImg.src = ICONS.src; }
  function spriteBox(look, h) { var A = window.GameDNA_DemoKitArt && GameDNA_DemoKitArt.sprites[look]; return A ? { w: A.bodyW / A.bodyH * h } : { w: h * 0.6 }; }
  // Characters: the demo-kit painting. A hit never touches the sprite's colours or opacity: the sprite is drawn on an
  // offscreen layer at full colour, a bright rim is stamped around its outline (its own silhouette, offset in 8 directions)
  // and, for the first 2 frames only, a light red tint goes inside its pixels (source-atop). Then both are composited once.
  var flashLayer = null, rimLayer = null;
  game.lastActors = {};
  function layerOf(c, w, h) { if (!c) c = document.createElement('canvas'); if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); } return c; }
  function drawActor(gx, a) {
    if (!Kit || !Kit.has(a.look)) return false;
    if (!a.portrait) game.lastActors[a.id] = Object.assign({}, a);
    var o = { h: a.h, facing: a.facing, alpha: a.alpha, lift: a.lift, squash: a.squash, shadow: !a.portrait };
    if (!(a.flash > 0.02) || a.portrait) { gx.save(); if (a.tint) gx.filter = a.tint; Kit.sprite(gx, a.look, a.x, a.footY, o); gx.restore(); return true; }
    var T = gx.getTransform(), ds = Math.sqrt(Math.abs(T.a * T.d - T.b * T.c)) || 1, bw = spriteBox(a.look, a.h).w * 1.5 + 12, bh = a.h * 1.5 + a.lift + 12;
    var ox = a.x - bw / 2, oy = a.footY - bh + a.h * 0.2, lw = Math.ceil(bw * ds), lh = Math.ceil(bh * ds);
    flashLayer = layerOf(flashLayer, lw, lh); rimLayer = layerOf(rimLayer, lw, lh);
    var q = flashLayer.getContext('2d'); q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'source-over'; q.globalAlpha = 1; q.filter = 'none'; q.clearRect(0, 0, flashLayer.width, flashLayer.height);
    q.setTransform(ds, 0, 0, ds, -ox * ds, -oy * ds); if (a.tint) q.filter = a.tint;
    Kit.sprite(q, a.look, a.x, a.footY, { h: a.h, facing: a.facing, alpha: 1, lift: a.lift, squash: a.squash, shadow: false });
    q.filter = 'none'; q.setTransform(1, 0, 0, 1, 0, 0);
    var k = Math.min(1, a.flash / 0.4), rq = rimLayer.getContext('2d'); rq.setTransform(1, 0, 0, 1, 0, 0); rq.globalCompositeOperation = 'source-over'; rq.clearRect(0, 0, rimLayer.width, rimLayer.height);
    rq.drawImage(flashLayer, 0, 0); rq.globalCompositeOperation = 'source-in'; rq.fillStyle = '#fff1c4'; rq.fillRect(0, 0, lw, lh); rq.globalCompositeOperation = 'source-over';
    if (k > 0.85) { q.globalCompositeOperation = 'source-atop'; q.fillStyle = 'rgba(255,70,50,0.12)'; q.fillRect(0, 0, lw, lh); q.globalCompositeOperation = 'source-over'; }
    if (o.shadow) Kit.shadow(gx, a.x, a.footY + a.h * 0.012, spriteBox(a.look, a.h).w * 0.42, Math.max(1.5, a.h * 0.05), 0.42 * a.alpha);
    var rr = Math.max(1.5, a.h * 0.022);
    gx.save(); gx.globalAlpha *= a.alpha * k;
    for (var i = 0; i < 8; i++) { var an = i * Math.PI / 4; gx.drawImage(rimLayer, 0, 0, lw, lh, ox + Math.cos(an) * rr, oy + Math.sin(an) * rr, lw / ds, lh / ds); }
    gx.restore();
    gx.save(); gx.globalAlpha *= a.alpha; gx.drawImage(flashLayer, 0, 0, lw, lh, ox, oy, lw / ds, lh / ds); gx.restore();
    return true;
  }
  function actorBox(a) { var w = spriteBox(a.look, a.h).w * 0.86; return { x: a.x - w / 2, y: a.footY - a.lift - a.h, w: w, h: a.h }; }
  function drawIcon(gx, key, x, y, size) {
    if (!iconImg || !iconImg.width || !ICONS) return false; var i = ICONS.keys.indexOf(key); if (i < 0) return false;
    gx.save(); gx.imageSmoothingEnabled = true; gx.imageSmoothingQuality = 'high'; gx.drawImage(iconImg, (i % ICONS.cols) * ICONS.cell, Math.floor(i / ICONS.cols) * ICONS.cell, ICONS.cell, ICONS.cell, x - size / 2, y - size / 2, size, size); gx.restore();
    return true;
  }
  function drawBackdrop(gx, r, info) {
    var S = STAGES[game.stage] || STAGES[0];
    if (!Kit || !Kit.backdrop(gx, S.scene || 'meadow-dusk', { x: r.x, y: r.y, w: r.w, h: r.h, groundY: r.groundY + 6 })) return false;
    return true;
  }
  function makeInstance() {
    game.C = M3.create({
      view: { x: 0, y: 0, w: W, h: H }, seed: SEED, gems: GEMS, heroes: HEROES, skills: SKILLS, enemies: ENEMIES, params: PARAMS,
      drawActor: drawActor, actorBox: actorBox, drawIcon: drawIcon, drawBackdrop: drawBackdrop,
      onHit: hitSite,
      onEvent: function (ev) {
        if (ev.kind === 'partyHit' && game.flags.builtinShake) game.shake(ev.raw > 90 ? 6 : 3, ev.raw > 90 ? 16 : 9);
        if (ev.kind === 'partyHit' && game.flags.builtinFlash && ev.amount > 0) game.flash('#ff2a1a', 8, 0.12);
        if (ev.kind === 'foeTurn') each('onTurn', [ev.turn, game]);
        if (ev.kind === 'waveStart') each('onWave', [ev.wave, game]);
        each('onEvent', [ev, game]);
      },
      onEnd: function (result, info) { endBattle(result, info); }
    });
  }
  function newGame() { game.stage = Math.min(STAGE0, STAGES.length - 1); game.results = []; game.lastEnd = null; each('onNewGame', [game]); }
  function startBattle() {
    var S = STAGES[game.stage];
    game.C.start({ waves: S.waves, seed: SEED * 31 + game.stage, name: S.name, stage: 'Stage ' + (game.stage + 1), party: PARTY });
    game.C.setAuto(game.autoplay.on);
    game.clock.battleFrame = 0; game.lastEnd = null;
    setScene('battle');
    each('onBattleStart', [game]);
  }
  function endBattle(result, info) {
    game.lastEnd = { result: result, info: info, at: game.clock.frame };
    game.results.push({ stage: game.stage, result: result, hp: info.hp, max: info.max, turns: info.turns, kills: info.kills, chain: info.maxChain });
    each('onBattleEnd', [result, info, game]);
  }
  function afterBattle() {
    var r = game.lastEnd && game.lastEnd.result;
    if (r === 'win' && game.stage + 1 < STAGES.length) { game.stage++; setScene('map'); }
    else setScene(r === 'win' ? 'victory' : 'defeat');
  }

  /* =================================================================================================
     === 4. Hit site: every HP change (foes, the party), on its impact frame =========================== */
  function hitSite(ev) {
    if (ev.killed && ev.defender !== 'party' && game.C) { var d = ENEMIES[ev.enemy]; if (d && d.boss && game.flags.builtinShake) game.shake(7, 22); }
    each('onHit', [ev, game]);
  }

  /* =================================================================================================
     === 5. Scenes: title, map (the road between stages), battle, victory, defeat ======================= */
  function setScene(s) { game.scene = s; sceneT = 0; each('onScene', [s, game]); }
  function sceneOk() {
    if (game.scene === 'title') { newGame(); setScene('map'); }
    else if (game.scene === 'map' && sceneT > 20) startBattle();
    else if (game.scene === 'battle' && game.lastEnd && game.clock.frame - game.lastEnd.at > 90) afterBattle();
    else if ((game.scene === 'victory' || game.scene === 'defeat') && sceneT > 50) setScene('title');
  }
  function sceneAuto() {
    if (!game.autoplay.on) return;
    if (game.scene === 'title' && sceneT === 60) sceneOk();
    if (game.scene === 'map' && sceneT === 100) sceneOk();
    if (game.scene === 'battle' && game.lastEnd && game.clock.frame - game.lastEnd.at === 150) sceneOk();
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
      if (game.scene === 'battle' && !game.lastEnd) { if (isPtr) game.C.pointer(k.ptr, k.x, k.y); else game.C.key(k); return; }
      if (isPtr && k.ptr !== 'down') return;
      if (k === 'ok' || (k && k.tap)) sceneOk();
    });
    if (!frozen) sceneT++;
    if (!frozen) sceneAuto();
    if (game.C && game.scene === 'battle') {
      if (game.C.auto() !== game.autoplay.on) game.C.setAuto(game.autoplay.on);
      game.C.update(frozen ? 0 : STEP);
      if (!frozen) c.battleFrame++;
    }
    if (fxState.shake > 0 && !frozen) fxState.shake--;
    if (fxState.flash && !frozen) { fxState.flash.t++; if (fxState.flash.t >= fxState.flash.n) fxState.flash = null; }
    each('update', [game, { dt: frozen ? 0 : STEP, frozen: frozen, paused: c.paused, hitStop: c.stop }]);
  }

  /* =================================================================================================
     === 7. Drawing (logical W x H, devicePixelRatio-aware backing store) =============================== */
  function txt(s, x, y, o) { return M3.text(g, s, x, y, o); }
  function panel(x, y, w, h, o) {
    o = o || {}; g.save(); g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, o.r || 12); else g.rect(x, y, w, h);
    var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, o.top || 'rgba(48,34,40,0.94)'); gr.addColorStop(1, o.bottom || 'rgba(18,12,18,0.96)'); g.fillStyle = gr; g.fill();
    g.lineWidth = o.lw || 2; g.strokeStyle = o.stroke || 'rgba(226,186,112,0.95)'; g.stroke(); g.restore();
    hudRects.push({ name: o.name || 'panel', x: x, y: y, w: w, h: h });
  }
  var F = LAYOUT === 'tall' ? 19 : 14;
  function backdropFull(id) { if (!Kit || !Kit.backdrop(g, id, { x: 0, y: 0, w: W, h: H, groundY: H * (LAYOUT === 'tall' ? 0.7 : 0.8) })) { g.fillStyle = '#2a2030'; g.fillRect(0, 0, W, H); } var v = g.createLinearGradient(0, 0, 0, H); v.addColorStop(0, 'rgba(14,8,20,0.55)'); v.addColorStop(0.4, 'rgba(14,8,20,0.1)'); v.addColorStop(1, 'rgba(14,8,20,0.6)'); g.fillStyle = v; g.fillRect(0, 0, W, H); }
  function render() {
    g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    g.imageSmoothingEnabled = true; hudRects = [];
    var t = game.clock.frame / 60;
    if (!game.C) return;
    g.fillStyle = '#140e14'; g.fillRect(0, 0, W, H);
    g.save();
    if (fxState.shake > 0) { var k = fxState.shake / Math.max(1, fxState.shakeFrames), px = fxState.shakePx * k; g.translate(Math.round(Math.sin(game.clock.frame * 2.1) * px), Math.round(Math.cos(game.clock.frame * 2.9) * px * 0.6)); }
    if (game.scene === 'battle') { drawTable(); game.C.drawScene(g); each('draw', [g, 'fx', game]); }
    g.restore();
    if (fxState.flash && game.scene === 'battle') { var fr = game.C.fieldRect(); g.save(); g.fillStyle = fxState.flash.color; g.globalAlpha = fxState.flash.a * (1 - fxState.flash.t / fxState.flash.n); g.fillRect(fr.x, fr.y, fr.w, fr.h); g.restore(); }
    if (game.scene === 'battle') { game.C.drawUI(g); if (game.lastEnd && game.clock.frame - game.lastEnd.at > 90) { var fr2 = game.C.fieldRect(); blink('Z or tap: ' + (game.lastEnd.result === 'win' && game.stage + 1 < STAGES.length ? 'onward' : 'continue'), fr2.x + fr2.w / 2, fr2.y + fr2.h - 26, t); } }
    else if (game.scene === 'title') drawTitle(t); else if (game.scene === 'map') drawMap(t); else drawEnd(t, game.scene === 'victory');
    each('draw', [g, 'overlay', game]);
    each('drawUI', [g, game]);
    updateInfo();
  }
  var tableCache = null;
  function drawTable() {
    // the table the board and the stage sit on: dark wood with a soft vignette (cached at the backing size)
    if (!tableCache || tableCache.width !== canvas.width || tableCache.height !== canvas.height) {
      tableCache = document.createElement('canvas'); tableCache.width = canvas.width; tableCache.height = canvas.height;
      var g0 = g; g = tableCache.getContext('2d'); g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0); paintTable(); g = g0;
    }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(tableCache, 0, 0); g.restore();
  }
  function paintTable() {
    var gr = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.7); gr.addColorStop(0, '#3a2a26'); gr.addColorStop(1, '#120c10'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.save(); g.globalAlpha = 0.07; g.strokeStyle = '#f0c890'; g.lineWidth = 1;
    for (var i = 0; i < 26; i++) { var y = (i * 41.3) % H; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + 12, W * 0.6, y - 10, W, y + 6); g.stroke(); }
    g.restore();
  }
  function blink(s, x, y, t) { if (Math.floor(t * 2) % 2 === 0) txt(s, x, y, { size: F, weight: 900, align: 'center', color: '#ffd36a', ow: 4 }); }
  function lineup(cx, footY, h, ids, facing, gap) { ids.forEach(function (id, i) { if (Kit && Kit.has(id)) Kit.sprite(g, id, cx + (i - (ids.length - 1) / 2) * gap, footY, { h: h * Kit.rel(id), facing: facing }); }); }
  function drawTitle(t) {
    backdropFull('meadow-dusk');
    var tall = LAYOUT === 'tall';
    txt('SHARDBOUND', W / 2, tall ? 150 : 92, { size: tall ? 58 : 60, weight: 900, align: 'center', color: '#ffe6b0', ow: 9, ls: 3 });
    txt('The Ember Road', W / 2, tall ? 202 : 144, { size: F + 6, weight: 800, align: 'center', color: '#fff4e4', ow: 5 });
    // the four gems of the party and the heart, turning slowly
    var ids = ['ember', 'grove', 'tide', 'spark', 'heart'];
    ids.forEach(function (id, i) { var x = W / 2 + (i - 2) * (tall ? 74 : 70), y = (tall ? 266 : 198) + Math.sin(t * 2 + i) * 4; M3.paintGem(g, GEMS[id], x, y, tall ? 25 : 24); });
    if (tall) { lineup(W / 2 - 120, 620, 150, ['knight', 'archer'], 'right', 100); lineup(W / 2 + 125, 620, 150, ['herbalist', 'keeper'], 'right', 100); }
    else { lineup(W * 0.3, 440, 128, PARTY.slice(0, 4), 'right', 80); lineup(W * 0.76, 440, 128, ['slime', 'wolf', 'golem'].filter(function (i) { return true; }), 'left', 95); }
    blink('PRESS Z OR TAP TO BEGIN', W / 2, tall ? 720 : 268, t);
    txt('Swap gems to match 3. Each colour powers its hero; hearts heal.', W / 2, H - (tall ? 120 : 40), { size: F - 1, weight: 700, align: 'center', color: '#f4e8d8', ow: 3.5, max: W - 40 });
    if (tall) txt('Drag or tap two gems. Tap a hero card to use a ready skill.', W / 2, H - 92, { size: F - 1, weight: 700, align: 'center', color: '#f4e8d8', ow: 3.5, max: W - 40 });
  }
  function drawMap(t) {
    var S = STAGES[game.stage] || STAGES[0], tall = LAYOUT === 'tall';
    backdropFull(S.scene || 'meadow-dusk');
    var pw = tall ? 460 : 440, ph = tall ? 340 : 270, px = (W - pw) / 2, py = tall ? 200 : 110;
    panel(px, py, pw, ph, { name: 'mapPanel' });
    txt('STAGE ' + (game.stage + 1) + ' OF ' + STAGES.length, W / 2, py + 30, { size: F - 1, weight: 900, align: 'center', color: '#d8c49a' });
    txt(S.name, W / 2, py + 64, { size: F + 12, weight: 900, align: 'center', color: '#ffe6b0', ow: 5 });
    txt(S.waves.length + ' waves', W / 2, py + 96, { size: F, weight: 800, align: 'center', color: '#f4ead4' });
    var kinds = []; S.waves.forEach(function (w) { w.forEach(function (id) { if (kinds.indexOf(id) < 0) kinds.push(id); }); });
    kinds = kinds.slice(0, 5);
    kinds.forEach(function (id, i) { var d = ENEMIES[id] || {}, x = W / 2 + (i - (kinds.length - 1) / 2) * (pw / Math.max(4, kinds.length + 0.6)), fy = py + ph - 74; if (Kit && Kit.has(d.look)) Kit.sprite(g, d.look, x, fy, { h: Math.min(84, 62 * Kit.rel(d.look) * (d.boss ? 1.1 : 1.4)), facing: 'left' }); txt((d.name || id).split(' ').pop(), x, fy + 18, { size: F - 3, weight: 800, align: 'center', color: '#e8dcc4', ow: 3 }); });
    game.results.forEach(function (r, i) { txt((STAGES[r.stage] || {}).name + ': won, ' + r.hp + ' HP left', W / 2, py + ph + 24 + i * (F + 6), { size: F - 1, weight: 800, align: 'center', color: '#a8f08a', ow: 3.5 }); });
    if (sceneT > 20) blink('Z or tap: to battle', W / 2, py + ph - 28, t);
  }
  function starShape(x, y, r) { g.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; if (i) g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); else g.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); }
  function drawEnd(t, won) {
    var tall = LAYOUT === 'tall';
    backdropFull(won ? 'meadow-dusk' : 'ruins-night');
    var pw = tall ? 480 : 480, ph = tall ? 400 : 300, px = (W - pw) / 2, py = tall ? 160 : 70;
    panel(px, py, pw, ph, { name: 'endBox' });
    txt(won ? 'THE ROAD IS CLEAR' : 'THE PARTY HAS FALLEN', W / 2, py + 40, { size: F + 12, weight: 900, align: 'center', color: won ? '#ffd25a' : '#ff6a5a', ow: 5, max: pw - 30 });
    game.results.forEach(function (r, i) {
      var y = py + 92 + i * (F + 30), n = r.result !== 'win' ? 0 : r.hp >= r.max * 0.6 ? 3 : r.hp >= r.max * 0.3 ? 2 : 1;
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); if (g.roundRect) g.roundRect(px + 16, y - F - 4, pw - 32, F * 2 + 14, 9); else g.rect(px + 16, y - F - 4, pw - 32, F * 2 + 14); g.fill();
      for (var k = 0; k < 3; k++) { var on = k < n, sx = px + 40 + k * 22, d = Math.max(0, Math.min(1, (sceneT - 20 - k * 12 - i * 30) / 14)); starShape(sx, y, 9); g.fillStyle = '#2a2018'; g.fill(); if (on && d > 0) { g.save(); g.translate(sx, y); g.scale(d, d); g.translate(-sx, -y); starShape(sx, y, 9); g.fillStyle = '#ffd25a'; g.fill(); g.strokeStyle = '#7a4a10'; g.lineWidth = 1; g.stroke(); g.restore(); } }
      txt((STAGES[r.stage] || {}).name, px + 112, y - 7, { size: F, weight: 900, color: '#ffe8b8' });
      txt(r.result === 'win' ? r.hp + ' HP left, ' + r.turns + ' turns, combo x' + r.chain : 'lost after ' + r.turns + ' turns', px + 112, y + 12, { size: F - 2, weight: 700, color: r.result === 'win' ? '#cfe8b0' : '#ffb0a0', max: pw - 130 });
    });
    if (sceneT > 50) blink('Z: back to the title', W / 2, py + ph - 26, t);
    lineup(W / 2, py + ph + (tall ? 190 : 120), tall ? 140 : 100, PARTY, 'right', tall ? 110 : 90);
  }
  var infoEl = document.getElementById('info'), lastInfo = '';
  function updateInfo() {
    if (!infoEl) return; var h = '';
    if (game.scene === 'battle' && game.C) { var s = game.C.state(); h = '<b>' + (STAGES[game.stage] || {}).name + '</b> wave ' + s.wave + '/' + s.waves + ', turn ' + s.turn + ', party ' + s.hp + '/' + s.max; }
    else if (game.scene === 'title') h = '<b>Shardbound</b> <span class="dim">Tap or Z to begin.</span>';
    else if (game.scene === 'map') h = '<b>Next:</b> ' + (STAGES[game.stage] || {}).name;
    else h = '<b>' + (game.scene === 'victory' ? 'The road is clear' : 'The party has fallen') + '</b>';
    if (h !== lastInfo) { infoEl.innerHTML = h; lastInfo = h; }
  }
  var cssW = W, dpr = 1;
  function fit() {
    var stage = document.getElementById('stage'), avail = Math.max(240, Math.min(stage.clientWidth || W, 1600)), vh2 = Math.max(240, (window.innerHeight || H) - (LAYOUT === 'tall' ? 40 : 90));
    cssW = Math.max(240, Math.min(avail, vh2 * W / H)); dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.style.width = Math.round(cssW) + 'px'; canvas.style.height = Math.round(cssW * H / W) + 'px';
    var bw = Math.min(2880, Math.round(cssW * dpr)), bh = Math.round(bw * H / W);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  }
  addEventListener('resize', function () { fit(); });

  /* =================================================================================================
     === 8. Input: a key queue (a 0 ms tap still counts), pointer, held keys ============================ */
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', a: 'left', s: 'down', d: 'right', W: 'up', A: 'left', S: 'down', D: 'right',
    z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', x: 'back', X: 'back', Escape: 'back', Backspace: 'back', p: 'auto', P: 'auto', t: 'target', T: 'target', Tab: 'target',
    1: '1', 2: '2', 3: '3', 4: '4' };
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
      window.__frozen = true;
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
  // text state for checks and critics: heroes (face right, target = the foe they strike) and foes (face left, target = the hero they strike next)
  window.__state = function () { return { t: Math.round(game.clock.frame * STEP), scene: game.scene, layout: LAYOUT, m3: game.C && game.scene === 'battle' ? game.C.state() : null, actors: game.C && game.scene === 'battle' ? game.C.actors() : [] }; };
  game.drawActor = drawActor;   // the character hook the battle uses (exposed for checks/flash.py)
  game.boot = boot;
  game.step = function (n) { for (var i = 0; i < (n || 1); i++) tick(); };
  game.render = render;
  game.press = function (k) { keyQ.push(k); };
  var relKit = game.holdBoot();
  if (Kit) Kit.ready(function () { relKit(); }); else relKit();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { if (!bootHolds) boot(); else bootWaiting = true; }); else setTimeout(function () { if (!bootHolds) boot(); else bootWaiting = true; }, 0);
})();
