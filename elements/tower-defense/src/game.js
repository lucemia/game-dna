/* The Thornwall Watch: the A-16 tower-defense starter. A complete two-field campaign built on GameDNA_TowerDefense.
   A brood of giant beetles, spiders and moths marches on the river villages. Build towers beside the road (never on it),
   upgrade them, choose whom each one shoots, and hold the gate through every wave: first Millbrook Road, then the Twin Fords,
   where two roads meet and the Brood Matron comes last.
   Search for the "=== n." banners: config and content, the game object (extension points), field setup, the hit site,
   scenes, the main tick, drawing, input, boot. */
(function () {
  'use strict';
  /* =================================================================================================
     === 1. Config and content ========================================================================= */
  var qs = new URLSearchParams(location.search);
  // Phones (under 560 px wide, or ?compact=1): the canvas shows only the field, larger, and the HUD and build panel become a
  // DOM strip at CSS size under it (GameDNA_TowerDefense.mountPanel). Title and march screens keep their 640x360 frame.
  var COMPACT = qs.get('compact') === '1' || (qs.get('compact') !== '0' && (window.innerWidth || 640) < 560);
  var SH0 = 360, W = 640, H = COMPACT ? 404 : 360, STEP = 1000 / 60;
  var FREEZE_AT = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : null;
  var FROZEN = FREEZE_AT !== null && qs.get('freeze') === '1';
  var AUTO = qs.get('auto') === '1' || (FROZEN && qs.get('auto') !== '0');
  var SEED = (+qs.get('seed') >>> 0) || 7;
  var FIELD0 = Math.max(0, (+qs.get('field') || 1) - 1);       // ?field=2 starts the campaign at the second field (testing)
  var REDUCED = qs.get('reduced') === '1' || (!!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var TD = GameDNA_TowerDefense;

  // Towers and enemies. The module ships the built-in tables (GameDNA_TowerDefense.TOWERS / ENEMIES, format in
  // module/README.md); add or override entries here, or later through GAME.addTower / GAME.addEnemy.
  var TOWERS = {};
  var ENEMIES = {};
  // The build menu, in order (keys 1-9). A tower added with GAME.addTower(id, def) joins it.
  var SHOP = ['bolt', 'mortar', 'frost', 'storm'];
  // The campaign: one field per entry. map = a built-in map id or a map object {name, rows, paths, gold, lives};
  // waves = [{groups: [{enemy, count, gap, delay, path}], reward, hp, name}].
  var FIELDS = [
    { name: 'Millbrook Road', map: 'millbrook', waves: [
      { groups: [{ enemy: 'mite', count: 8, gap: 0.9 }], reward: 20 },
      { groups: [{ enemy: 'mite', count: 10, gap: 0.7 }, { enemy: 'skitter', count: 4, gap: 0.8, delay: 4 }], reward: 25 },
      { groups: [{ enemy: 'crawler', count: 6, gap: 1.2 }, { enemy: 'mite', count: 8, gap: 0.6, delay: 3 }], reward: 30, hp: 1.1 },
      { groups: [{ enemy: 'moth', count: 9, gap: 0.8 }, { enemy: 'skitter', count: 8, gap: 0.45, delay: 2 }], reward: 30, hp: 1.15 },
      { groups: [{ enemy: 'shell', count: 2, gap: 4 }, { enemy: 'crawler', count: 9, gap: 0.85, delay: 1.5 }], reward: 40, hp: 1.2 },
      { groups: [{ enemy: 'skitter', count: 18, gap: 0.33 }, { enemy: 'moth', count: 8, gap: 0.7, delay: 3 }, { enemy: 'shell', count: 2, gap: 3, delay: 6 }], reward: 0, hp: 1.3, name: 'The swarm' }
    ] },
    { name: 'Twin Fords', map: 'twinford', waves: [
      { groups: [{ enemy: 'mite', count: 12, gap: 0.6, path: 'alt' }], reward: 25, hp: 0.75 },
      { groups: [{ enemy: 'crawler', count: 8, gap: 1, path: 'alt' }, { enemy: 'skitter', count: 6, gap: 0.5, delay: 3, path: 1 }], reward: 30, hp: 0.82 },
      { groups: [{ enemy: 'moth', count: 10, gap: 0.7, path: 0 }, { enemy: 'mite', count: 10, gap: 0.5, delay: 2, path: 1 }], reward: 35, hp: 0.9 },
      { groups: [{ enemy: 'shell', count: 3, gap: 3, path: 'alt' }, { enemy: 'skitter', count: 14, gap: 0.35, delay: 2, path: 'alt' }], reward: 45, hp: 1.0 },
      { groups: [{ enemy: 'crawler', count: 12, gap: 0.7, path: 'alt' }, { enemy: 'moth', count: 10, gap: 0.6, delay: 4, path: 1 }], reward: 50, hp: 1.1 },
      { groups: [{ enemy: 'shell', count: 4, gap: 2.4, path: 'alt' }, { enemy: 'skitter', count: 18, gap: 0.3, delay: 1, path: 'alt' }, { enemy: 'mite', count: 12, gap: 0.4, delay: 5, path: 0 }], reward: 60, hp: 1.1 },
      { groups: [{ enemy: 'matron', count: 1, gap: 1, path: 0 }, { enemy: 'crawler', count: 10, gap: 0.9, delay: 3, path: 1 }, { enemy: 'moth', count: 10, gap: 0.8, delay: 7, path: 'alt' }], reward: 0, hp: 1.12, name: 'The Brood Matron' }
    ] }
  ];
  var PARAMS = { waveGap: 12, earlyBonus: 1, refund: 0.7, layout: COMPACT ? 'compact' : 'wide' };

  /* =================================================================================================
     === 2. Game object: the public surface and the extension points (see README) ======================= */
  var canvas = document.getElementById('screen'), g = canvas.getContext('2d');
  var game = {
    W: W, H: H, addons: [], flags: { builtinShake: true, builtinFlash: true },
    scene: 'title', field: 0, C: null, results: [], lastEnd: null,
    clock: { frame: 0, fieldFrame: 0, paused: false, stop: 0 },
    autoplay: { on: AUTO },
    held: {},                                   // keys held right now ({ArrowLeft: true}); scenes and windows never clear it
    towers: TOWERS, enemies: ENEMIES, shop: SHOP, fields: FIELDS, params: PARAMS, seed: SEED,
    shipped: null,                              // the content ids this file ships with (set below, before the ADDONS SLOT)
    addTower: function (id, def, o) {
      o = o || {}; if (def) { TOWERS[id] = def; if (game.C) game.C.lib.towers[id] = def; }
      if (o.shop !== false && SHOP.indexOf(id) < 0) SHOP.push(id);
      return id;
    },
    addEnemy: function (id, def, o) {
      o = o || {}; if (def) { ENEMIES[id] = def; if (game.C) game.C.lib.enemies[id] = def; }
      if (o.field != null && o.wave != null) {          // also march it in: {field, wave (1-based), count, gap, delay, path}
        var F = FIELDS[o.field]; if (F) { var w = F.waves[o.wave - 1]; if (!w) { w = { groups: [], reward: 30 }; F.waves.push(w); } w.groups.push({ enemy: id, count: o.count || 6, gap: o.gap || 0.8, delay: o.delay || 0, path: o.path == null ? 0 : o.path }); }
      }
      return id;
    },
    addWave: function (fieldIndex, wave, at) { var F = FIELDS[fieldIndex]; if (!F) return -1; var i = at == null ? F.waves.length : Math.max(0, Math.min(at, F.waves.length)); F.waves.splice(i, 0, wave); return i; },
    addField: function (field) { FIELDS.push(field); return FIELDS.length - 1; },
    anchor: function (id) { return game.C && game.scene === 'field' ? game.C.anchor(id) : null; },
    unitRects: function () { return game.C && game.scene === 'field' ? game.C.unitRects() : []; },
    fieldRect: function () { return game.C ? game.C.fieldRect() : { x: 8, y: 36, w: 512, h: 320 }; },
    uiRects: function () { return (game.C && game.scene === 'field' ? game.C.uiRects() : []).concat(hudRects.slice()); },
    shake: function (px, frames) { if (REDUCED) return; fxState.shake = Math.max(fxState.shake, frames | 0); fxState.shakePx = Math.max(fxState.shakeFrames > 0 ? fxState.shakePx : 0, px); fxState.shakeFrames = fxState.shake; },
    flash: function (color, frames, alpha) { if (REDUCED) return; fxState.flash = { color: color || '#ffffff', n: frames | 0 || 6, t: 0, a: alpha == null ? 0.3 : alpha }; },
    hitStop: function (f) { var n = typeof f === 'object' && f ? Math.ceil((f.ms || 0) * 60 / 1000) : f | 0; game.clock.stop = Math.max(game.clock.stop, n); },
    hitStopMs: function (ms) { game.hitStop({ ms: ms }); },
    pause: function (on) { game.clock.paused = !!on; },
    holdBoot: function () { bootHolds++; var done = false; return function () { if (done) return; done = true; bootHolds--; if (!bootHolds && bootWaiting) boot(); }; },
    state: function () {
      var c = game.C && game.scene === 'field' ? game.C.state() : null;
      return { scene: game.scene, field: game.field, frame: game.clock.frame, results: game.results.map(function (r) { return r.result[0]; }).join(''),
        lives: game.results.map(function (r) { return r.lives; }).join(','), td: c, auto: game.autoplay.on };
    }
  };
  window.GAME = game;
  game.shipped = { towers: Object.keys(TD.TOWERS), enemies: Object.keys(TD.ENEMIES) };
  function each(hook, args) {
    var out = false;
    game.addons.forEach(function (a) { if (!a || typeof a[hook] !== 'function') return; try { if (a[hook].apply(a, args) === true) out = true; } catch (e) { console.error('addon ' + (a.name || '?') + '.' + hook + ': ' + e.message); } });
    return out;
  }
  var fxState = { shake: 0, shakePx: 0, shakeFrames: 0, flash: null };
  var hudRects = [], bootHolds = 0, bootWaiting = false, booted = false, sceneT = 0;

  /* =================================================================================================
     === 3. Field setup: one GameDNA_TowerDefense instance, started once per field ======================= */
  function makeInstance() {
    game.C = TD.create({
      view: { x: 0, y: 0, w: W, h: H }, seed: SEED, towers: TOWERS, enemies: ENEMIES, shop: SHOP, params: PARAMS,
      onHit: hitSite,
      onEvent: function (ev) {
        if (ev.kind === 'leak' && game.flags.builtinShake) game.shake(3, 10);
        if (ev.kind === 'leak' && game.flags.builtinFlash) game.flash('#ff2a1a', 8, 0.14);
        if (ev.kind === 'waveStart') each('onWave', [ev.wave, game]);
        if (ev.kind === 'build' || ev.kind === 'upgrade' || ev.kind === 'sell') each('onBuild', [ev, game]);
        each('onEvent', [ev, game]);
      },
      onEnd: function (result, info) { endField(result, info); }
    });
  }
  function newGame() { game.field = Math.min(FIELD0, FIELDS.length - 1); game.results = []; game.lastEnd = null; each('onNewGame', [game]); }
  function startField() {
    var F = FIELDS[game.field];
    game.C.start({ map: typeof F.map === 'string' ? TD.MAPS[F.map] : F.map, waves: F.waves, seed: SEED * 31 + game.field, shop: SHOP });
    game.C.setAuto(game.autoplay.on);
    game.clock.fieldFrame = 0; game.lastEnd = null;
    setScene('field');
    each('onFieldStart', [game]);
  }
  function endField(result, info) {
    game.lastEnd = { result: result, info: info, at: game.clock.frame };
    game.results.push({ field: game.field, result: result, lives: info.lives, kills: info.kills });
    each('onFieldEnd', [result, info, game]);
  }
  function afterField() {
    var r = game.lastEnd && game.lastEnd.result;
    if (r === 'win' && game.field + 1 < FIELDS.length) { game.field++; setScene('map'); }
    else setScene(r === 'win' ? 'victory' : 'defeat');
  }

  /* =================================================================================================
     === 4. Hit site: every HP change of an enemy, on its impact frame ================================== */
  function hitSite(ev) {
    if (ev.killed && game.C) { var d = game.C.lib.enemies[ev.enemy]; if (d && d.boss && game.flags.builtinShake) game.shake(5, 18); }
    each('onHit', [ev, game]);
  }

  /* =================================================================================================
     === 5. Scenes: title, map (the march between fields), field, victory, defeat ======================== */
  function setScene(s) { game.scene = s; sceneT = 0; each('onScene', [s, game]); }
  function sceneOk() {
    if (game.scene === 'title') { newGame(); setScene('map'); }
    else if (game.scene === 'map' && sceneT > 20) startField();
    else if (game.scene === 'field' && game.lastEnd && sceneT > 0 && game.C && game.C.phase() !== 'build' && game.clock.frame - game.lastEnd.at > 90) afterField();
    else if ((game.scene === 'victory' || game.scene === 'defeat') && sceneT > 50) setScene('title');
  }
  function sceneAuto() {
    if (!game.autoplay.on) return;
    if (game.scene === 'title' && sceneT === 60) sceneOk();
    if (game.scene === 'map' && sceneT === 90) sceneOk();
    if (game.scene === 'field' && game.lastEnd && game.clock.frame - game.lastEnd.at === 240) sceneOk();
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
      if (k === 'auto') { game.autoplay.on = !game.autoplay.on; if (game.C) game.C.setAuto(game.autoplay.on && game.scene === 'field'); return; }
      if (game.autoplay.on && !(isPtr && k.ptr !== 'down')) { game.autoplay.on = false; if (game.C) game.C.setAuto(false); }
      if (game.scene === 'field' && !game.lastEnd) { if (isPtr) game.C.pointer(k.ptr, k.x, k.y); else game.C.key(k); return; }
      if (isPtr && k.ptr !== 'down') { if (game.C && game.scene === 'field') game.C.pointer(k.ptr, k.x, k.y); return; }
      if (k === 'ok' || (k && k.tap)) sceneOk();
    });
    if (!frozen) sceneT++;
    if (!frozen) sceneAuto();
    if (game.C && game.scene === 'field') {
      if (game.C.auto() !== game.autoplay.on) game.C.setAuto(game.autoplay.on);
      game.C.update(frozen ? 0 : STEP);
      if (!frozen) c.fieldFrame++;
    }
    if (fxState.shake > 0 && !frozen) fxState.shake--;
    if (fxState.flash && !frozen) { fxState.flash.t++; if (fxState.flash.t >= fxState.flash.n) fxState.flash = null; }
    each('update', [game, { dt: frozen ? 0 : STEP, frozen: frozen, paused: c.paused, hitStop: c.stop, speed: game.C ? game.C.params().speed : 1 }]);
  }

  /* =================================================================================================
     === 7. Drawing (640x360 logical, devicePixelRatio-aware backing store) ============================== */
  function txt(s, x, y, o) { return TD.text(g, s, x, y, o); }
  function panel(x, y, w, h, o) {
    o = o || {}; g.save(); g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, o.r || 10); else g.rect(x, y, w, h);
    var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, o.top || 'rgba(58,44,34,0.96)'); gr.addColorStop(1, o.bottom || 'rgba(24,18,14,0.97)'); g.fillStyle = gr; g.fill();
    g.lineWidth = o.lw || 1.6; g.strokeStyle = o.stroke || 'rgba(214,176,108,0.9)'; g.stroke(); g.restore();
    hudRects.push({ name: o.name || 'panel', x: x, y: y, w: w, h: h });
  }
  function backdrop(t) {
    // a dusk sky over a river valley, drawn in code (title and the march screen)
    var sky = g.createLinearGradient(0, 0, 0, SH0); sky.addColorStop(0, '#2a2a5a'); sky.addColorStop(0.45, '#c86a5a'); sky.addColorStop(0.62, '#f2b070'); sky.addColorStop(1, '#2c3a2a'); g.fillStyle = sky; g.fillRect(0, 0, W, SH0);
    var sun = g.createRadialGradient(470, 205, 4, 470, 205, 120); sun.addColorStop(0, 'rgba(255,240,190,0.95)'); sun.addColorStop(0.15, 'rgba(255,200,120,0.6)'); sun.addColorStop(1, 'rgba(255,160,90,0)'); g.fillStyle = sun; g.fillRect(0, 0, W, SH0);
    var hills = [[214, '#5a4a6a', 0.9, 11], [236, '#3e3a52', 0.7, 23], [262, '#2a3a2e', 0.5, 37], [292, '#1c2a1e', 0.35, 53]];
    hills.forEach(function (h, i) {
      g.fillStyle = h[1]; g.beginPath(); g.moveTo(0, SH0);
      for (var x = 0; x <= W; x += 8) { var y = h[0] + Math.sin(x * 0.012 * h[2] + h[3]) * 14 + Math.sin(x * 0.031 + h[3] * 2) * 6 - (i === 2 && x > 520 && x < 610 ? 30 * Math.sin((x - 520) / 90 * Math.PI) : 0); g.lineTo(x, y); }
      g.lineTo(W, SH0); g.closePath(); g.fill();
      if (i === 2) {   // a watch tower on the ridge
        g.fillStyle = '#1e2620'; g.fillRect(560, 202, 14, 40); g.beginPath(); g.moveTo(556, 204); g.lineTo(567, 190); g.lineTo(578, 204); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,200,110,' + (0.7 + 0.3 * Math.sin(t * 3)) + ')'; g.fillRect(565, 211, 4, 5);
      }
    });
    // the river
    g.fillStyle = 'rgba(255,190,130,0.35)'; g.beginPath(); g.moveTo(0, 318); g.bezierCurveTo(200, 300, 380, 336, 640, 312); g.lineTo(640, 322); g.bezierCurveTo(380, 346, 200, 312, 0, 330); g.closePath(); g.fill();
    // drifting motes
    for (var i = 0; i < 30; i++) { var mx = (i * 97 + t * (8 + i % 5 * 3)) % (W + 40) - 20, my = 80 + (i * 53) % 200 + Math.sin(t * 1.3 + i) * 6; g.fillStyle = 'rgba(255,230,170,' + (0.25 + 0.25 * Math.sin(t * 2 + i)) + ')'; g.beginPath(); g.arc(mx, my, 1 + (i % 3) * 0.4, 0, Math.PI * 2); g.fill(); }
  }
  function render() {
    g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    g.imageSmoothingEnabled = true; hudRects = [];
    var t = game.clock.frame / 60;
    if (!game.C) return;
    g.fillStyle = '#16110e'; g.fillRect(0, 0, W, H);
    g.save();
    if (fxState.shake > 0) { var k = fxState.shake / Math.max(1, fxState.shakeFrames), px = fxState.shakePx * k; g.translate(Math.round(Math.sin(game.clock.frame * 2.1) * px), Math.round(Math.cos(game.clock.frame * 2.9) * px * 0.6)); }
    if (game.scene === 'field') { game.C.drawScene(g); each('draw', [g, 'fx', game]); }
    else { g.translate(0, (H - SH0) / 2); backdrop(t); }
    g.restore();
    if (fxState.flash) { g.fillStyle = fxState.flash.color; g.globalAlpha = fxState.flash.a * (1 - fxState.flash.t / fxState.flash.n); g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    if (game.scene === 'field') { game.C.drawUI(g); var fr = game.C.fieldRect(); if (game.lastEnd && game.clock.frame - game.lastEnd.at > 90) blink('Z or tap: ' + (game.lastEnd.result === 'win' && game.field + 1 < FIELDS.length ? 'march on' : 'continue'), fr.x + fr.w / 2, fr.y + fr.h * 0.82, t); }
    else { g.save(); g.translate(0, (H - SH0) / 2);
      if (game.scene === 'title') drawTitle(t); else if (game.scene === 'map') drawMarch(t); else drawEnd(t, game.scene === 'victory');
      g.restore(); }
    if (panelEl) { var show = game.scene === 'field' && !game.lastEnd; panelEl.style.display = show ? 'block' : 'none'; if (infoEl) infoEl.style.display = show ? 'none' : ''; if (show && panelRefresh) panelRefresh(); }
    each('draw', [g, 'overlay', game]);
    each('drawUI', [g, game]);
    updateInfo();
  }
  function blink(s, x, y, t) { if (Math.floor(t * 2) % 2 === 0) txt(s, x, y, { size: 11, weight: 900, align: 'center', color: '#ffd36a', ow: 4 }); }
  function drawTitle(t) {
    txt('THE THORNWALL WATCH', W / 2, 74, { size: 34, weight: 900, align: 'center', color: '#ffe6b0', ow: 7, ls: 3 });
    txt('Hold the river roads against the brood', W / 2, 106, { size: 13, weight: 800, align: 'center', color: '#fff4e4', ow: 4 });
    // the four towers on a row, and some of the brood
    TD.STAGE && ['bolt', 'mortar', 'frost', 'storm'].forEach(function (id, i) { game.C.drawTowerIcon(g, id, 214 + i * 70, 248, 1.6); });
    ['mite', 'crawler', 'moth'].forEach(function (id, i) { game.C.drawEnemyIcon(g, id, 140 - i * 34, 292 + (i % 2) * 10, 1.5); });
    blink('PRESS Z OR TAP TO BEGIN', W / 2, 150, t);
    txt('Build beside the road, never on it. 1-4 pick a tower, arrows or the pointer choose a cell, Z builds.', W / 2, 336, { size: 9.5, weight: 700, align: 'center', color: '#f4e8d8', ow: 3 });
  }
  function drawMarch(t) {
    var F = FIELDS[game.field] || FIELDS[0];
    panel(150, 70, 340, 190, { name: 'marchPanel' });
    txt('FIELD ' + (game.field + 1) + ' OF ' + FIELDS.length, W / 2, 92, { size: 10, weight: 900, align: 'center', color: '#d8c49a', ls: 2 });
    txt(F.name, W / 2, 116, { size: 22, weight: 900, align: 'center', color: '#ffe6b0', ow: 5 });
    txt(F.waves.length + ' waves', W / 2, 140, { size: 11, weight: 800, align: 'center', color: '#f4ead4' });
    var kinds = []; F.waves.forEach(function (w) { (w.groups || []).forEach(function (gr) { if (kinds.indexOf(gr.enemy) < 0) kinds.push(gr.enemy); }); });
    kinds.slice(0, 6).forEach(function (id, i) { var x = W / 2 + (i - (Math.min(6, kinds.length) - 1) / 2) * 44; game.C.drawEnemyIcon(g, id, x, 186, 1.25); var d = game.C.lib.enemies[id]; txt(d ? d.name.split(' ').pop() : id, x, 214, { size: 8, weight: 800, align: 'center', color: '#d8ccb4' }); });
    game.results.forEach(function (r, i) { txt((FIELDS[r.field] || {}).name + ': held, ' + r.lives + ' lives left', W / 2, 236 + i * 12, { size: 9, weight: 800, align: 'center', color: '#9ae07a' }); });
    if (sceneT > 20) blink('Z or tap: take the field', W / 2, 282, t);
  }
  function starShape(x, y, r) { g.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; if (i) g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); else g.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); }
  function drawEnd(t, won) {
    panel(150, 60, 340, 220, { name: 'endBox' });
    txt(won ? 'THE WATCH HOLDS' : 'THE GATE HAS FALLEN', W / 2, 90, { size: 22, weight: 900, align: 'center', color: won ? '#ffd25a' : '#ff6a5a', ow: 5, ls: 1 });
    // one row per field: up to three stars (lives left: 15+ three, 8+ two, any one), the name and the totals
    game.results.forEach(function (r, i) {
      var y = 124 + i * 30, n = r.result !== 'win' ? 0 : r.lives >= 15 ? 3 : r.lives >= 8 ? 2 : 1;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); if (g.roundRect) g.roundRect(166, y - 12, 308, 24, 8); else g.rect(166, y - 12, 308, 24); g.fill();
      for (var k = 0; k < 3; k++) { var on = k < n, sx = 186 + k * 17, d = Math.max(0, Math.min(1, (sceneT - 20 - k * 12 - i * 30) / 14)); starShape(sx, y, 7); g.fillStyle = '#2a2018'; g.fill(); if (on && d > 0) { g.save(); g.translate(sx, y); g.scale(d, d); g.translate(-sx, -y); starShape(sx, y, 7); g.fillStyle = '#ffd25a'; g.fill(); g.strokeStyle = '#7a4a10'; g.lineWidth = 0.8; g.stroke(); g.restore(); } }
      txt((FIELDS[r.field] || {}).name, 244, y - 4, { size: 11, weight: 900, color: '#ffe8b8' });
      txt(r.result === 'win' ? 'held, ' + r.lives + ' lives left, ' + r.kills + ' foes' : 'lost, ' + r.kills + ' foes', 244, y + 7, { size: 9, weight: 700, color: r.result === 'win' ? '#cfe8b0' : '#ffb0a0' });
    });
    if (won) ['bolt', 'mortar', 'frost', 'storm'].forEach(function (id, i) { game.C.drawTowerIcon(g, id, W / 2 + (i - 1.5) * 50, 222, 0.95); });
    else ['mite', 'crawler', 'skitter', 'moth'].forEach(function (id, i) { game.C.drawEnemyIcon(g, id, W / 2 + (i - 1.5) * 46, 212, 1.2); });
    if (sceneT > 50) blink('Z: back to the title', W / 2, 262, t);
  }
  var infoEl = document.getElementById('info'), lastInfo = '', panelEl = COMPACT ? document.getElementById('tdpanel') : null, panelRefresh = null;
  function updateInfo() {
    if (!infoEl) return; var h = '';
    if (game.scene === 'field' && game.C) { var s = game.C.state(), nw = game.C.nextWave(); h = '<b>' + (FIELDS[game.field] || {}).name + '</b> Wave ' + s.wave + '/' + s.waves + ', lives ' + s.lives + ', gold ' + s.gold + (nw ? '. <span class="dim">Next: ' + nw.line + '</span>' : ''); }
    else if (game.scene === 'title') h = '<b>The Thornwall Watch</b> <span class="dim">Tap or Z to begin.</span>';
    else if (game.scene === 'map') h = '<b>Next field:</b> ' + (FIELDS[game.field] || {}).name;
    else h = '<b>' + (game.scene === 'victory' ? 'The watch holds' : 'The gate has fallen') + '</b>';
    if (h !== lastInfo) { infoEl.innerHTML = h; lastInfo = h; }
  }
  var cssW = W, dpr = 1;
  function fit() {
    var stage = document.getElementById('stage'), avail = Math.max(240, Math.min(stage.clientWidth || W, 1600)), vh = Math.max(200, (window.innerHeight || H) - 150);
    cssW = Math.max(240, Math.min(avail, vh * W / H)); dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.style.width = Math.round(cssW) + 'px'; canvas.style.height = Math.round(cssW * H / W) + 'px';
    var bw = Math.min(2560, Math.round(cssW * dpr)), bh = Math.round(bw * H / W);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  }
  addEventListener('resize', function () { fit(); });

  /* =================================================================================================
     === 8. Input: a key queue (a 0 ms tap still counts), pointer, held keys ============================ */
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', x: 'back', X: 'back', Escape: 'back', Backspace: 'back',
    p: 'auto', P: 'auto', u: 'upgrade', U: 'upgrade', s: 'sell', S: 'sell', t: 'target', T: 'target', n: 'wave', N: 'wave', f: 'speed', F: 'speed', q: 'pause', Q: 'pause',
    1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9' };
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
    if (panelEl) panelRefresh = TD.mountPanel(panelEl, game.C, function (k) { keyQ.push(k); });
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
  // text state for checks and critics: every enemy (facing = its heading, the angle the draw call rotates by) and tower
  window.__state = function () { return { t: Math.round(game.clock.frame * STEP), scene: game.scene, actors: game.C && game.scene === 'field' ? game.C.actors() : [] }; };
  game.boot = boot;
  game.step = function (n) { for (var i = 0; i < (n || 1); i++) tick(); };
  game.render = render;
  game.press = function (k) { keyQ.push(k); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
