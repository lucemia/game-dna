/* The Long Vigil: the A-11 starter game. Uses GameDNA_HordeSurvival (the module above, verbatim) and the demo-kit cast
   (art/kit.js + art/cast-art.js). Sections are marked "=== n."; extension points are documented in README.md. */
(function () {
  'use strict';
  /* === 1. Config and content ======================================================================================== */
  var Q = new URLSearchParams(location.search);
  var qn = function (k, d) { var v = Q.get(k); return v == null || v === '' || isNaN(+v) ? d : +v; };
  var FREEZE = Q.get('freeze') === '1', T_MS = qn('t', -1), SEED = qn('seed', 7), SPEED = Math.max(0.25, Math.min(4, qn('speed', 1)));
  var AUTO = Q.get('auto') === '1' || (T_MS >= 0 && Q.get('auto') !== '0');
  var REDUCED = Q.get('reduced') === '1' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches && Q.get('reduced') !== '0');
  var W = 640, H = 360, STEP = 1000 / 60;   // logical view; a portrait screen gets 360 wide and taller (see fit())
  /* which demo-kit sprite draws each look (the module asks for a look, the kit draws it; flipX is the kit's, never typed here) */
  var LOOKS = { slime: 'slime', imp: 'imp', wisp: 'wisp', harpy: 'harpy', cultist: 'cultist', golem: 'golem' };   // the hero is the walk sheet in art/vigil-art.js
  var HERO_H = 46, HERO_FRAMES = { n: 5, stride: 0.62 };
  /* module icon name -> painted-ui atlas cell (art/vigil-art.js) */
  var ICONS = { bolt: 'staff', blades: 'sword', pulse: 'amulet', lance: 'bow', boots: 'boots', heart: 'potion', magnet: 'gem', hourglass: 'shock', might: 'burn', ring: 'ring', leaf: 'regen', ration: 'bread' };
  var PARAMS = { enemyCap: qn('cap', 400), duration: qn('duration', 200), choices: 3, numbers: 'on', reduced: REDUCED ? 'on' : 'off', shake: REDUCED ? 'off' : 'on' };
  var START_WEAPONS = ['bolt'];
  var RESULT_HOLD = 12000;   // autoplay leaves the results screen after this (a player presses Z)

  /* === 2. Game object: the public surface and extension points ======================================================== */
  var game = {
    version: '1.0.0', scene: 'boot', addons: [], flags: { builtinNumbers: true, builtinShake: true, builtinFlash: true },
    held: {}, autoplay: { on: AUTO }, clock: { frame: 0, runFrame: 0, paused: false, stop: 0 }, seed: SEED, runs: 0, results: [], H: null,
    weapons: {}, enemies: {}, upgrades: {}, waves: null, looks: LOOKS, params: PARAMS, startWeapons: START_WEAPONS, shipped: null, holds: 0,
    addWeapon: function (id, def) { game.weapons[id] = def; if (game.H) game.H.addWeapon(id, def); return game; },
    addEnemy: function (id, def, o) { game.enemies[id] = def; if (game.H) game.H.addEnemy(id, def); if (o && (o.mix || o.event)) game.addToWaves(id, o); if (o && o.look) LOOKS[def.look || id] = o.look; return game; },
    addUpgrade: function (id, def) { game.upgrades[id] = def; if (game.H) game.H.addUpgrade(id, def); return game; },
    /* o.mix = {from, to, weight}: join every wave segment overlapping [from, to) (seconds of the 200 s table) with that weight;
       o.event = {at, kind: 'ring' | 'burst' | 'elite', n}: one scripted wave */
    addToWaves: function (id, o) {
      var Wv = game.waves || (game.waves = JSON.parse(JSON.stringify(GameDNA_HordeSurvival.WAVES)));
      if (o.mix) Wv.segments.forEach(function (s) { if (s.to > (o.mix.from || 0) && s.from < (o.mix.to == null ? 1e9 : o.mix.to)) s.mix[id] = o.mix.weight || 1; });
      if (o.event) { Wv.events.push({ at: o.event.at, kind: o.event.kind || 'burst', enemy: id, n: o.event.n || 8 }); Wv.events.sort(function (a, b) { return a.at - b.at; }); }
      return game;
    },
    anchor: function (id) { return game.H ? game.H.anchor(id) : null; },
    unitRects: function () { return game.H && game.scene === 'play' ? game.H.unitRects() : []; },
    uiRects: function () { var r = game.H && game.scene !== 'title' ? game.H.uiRects() : []; return r.concat(sceneRects); },
    shake: function (px) { if (!REDUCED && game.H) game.H._sim.shake(px); },
    flash: function (color, frames, alpha) { if (!REDUCED) flashFx = { color: color || '#fff', t: frames || 6, n: frames || 6, a: alpha == null ? 0.3 : alpha }; },
    hitStop: function (frames) { if (game.H) game.H.hitStop(frames * STEP); }, hitStopMs: function (ms) { if (game.H) game.H.hitStop(ms); },
    pause: function (on) { game.clock.paused = !!on; if (game.H) game.H.pause(!!on); },
    holdBoot: function () { game.holds++; var done = false; return function () { if (!done) { done = true; game.holds--; maybeBoot(); } }; },
    state: function () { var s = game.H ? game.H.state() : {}; return { scene: game.scene, frame: game.clock.frame, runs: game.runs, results: game.results.join(''), auto: game.autoplay.on, seed: game.seed,
      phase: s.phase, t: s.t, level: s.level, hp: s.hp, kills: s.kills, enemies: s.enemies, boss: s.boss, weapons: s.weapons, passives: s.passives,
      hero: game.H ? { x: Math.round(game.H.hero().x), y: Math.round(game.H.hero().y) } : null, picks: game.H ? game.H.stats().picks.length : 0 }; },
    step: function (n) { for (var i = 0; i < (n || 1); i++) tick(); }, render: function () { render(); }, press: function (k) { queueKey(k); }
  };
  window.GAME = game;
  var sceneRects = [], flashFx = null, sceneT = 0, endInfo = null, canvas, ctx, dpr = 1;

  /* === 3. Run setup =================================================================================================== */
  function makeInstance() {
    var K = window.GameDNA_DemoKit;
    game.H = GameDNA_HordeSurvival.create({
      view: { x: 0, y: 0, w: W, h: H }, seed: game.seed, params: game.params,
      weapons: game.weapons, enemies: game.enemies, upgrades: game.upgrades, waves: game.waves || undefined,
      paintActor: function (g, look, x, footY, o) {   // paints one still pose once; the module caches it and animates it
        if (look === 'hero') return paintHero(g, x, footY, o);
        var id = LOOKS[look]; if (!id || !K || !K.has(id)) return false;
        var tr = window.__spriteTrace; window.__spriteTrace = null;
        try { K.sprite(g, id, x, footY, { h: o.h, facing: o.facing, shadow: false }); } finally { window.__spriteTrace = tr; }
        return true;
      },
      heroFrames: HERO_FRAMES, heroH: HERO_H, icons: iconFns(),
      traceDraw: function (look, x, footY, h, facing) {   // the text-state tools compare this trace with __state()
        if (look === 'hero') { window.__spriteTrace.push({ id: 'keeper-walk', x: x, footY: footY, h: h, facing: facing, native: 'right', flipX: facing !== 'right', variant: null }); return; }
        var id = LOOKS[look]; if (!id || !K) return; var M = K.meta(id) || {};
        window.__spriteTrace.push({ id: id, x: x, footY: footY, h: h, facing: facing, native: M.facing || 'right', flipX: K.flipX(id, facing), variant: window.GameDNA_DemoKitArt && GameDNA_DemoKitArt.sprites[id + '@' + facing] ? facing : null });
      },
      onHit: hitSite, onEvent: function (ev) { each('onEvent', ev); if (ev.kind === 'pick') each('onPick', ev); if (ev.kind === 'level') each('onLevel', ev.level); if (ev.kind === 'death') each('onKill', ev); },
      onEnd: endRun, autoplay: game.autoplay.on
    });
    game.H.setParams({ numbers: game.flags.builtinNumbers ? 'on' : 'off' });
  }
  /* the hero: a 5-cell walk sheet (idle + 4 walk poses; registry: mirror ok, three-quarter view, soft top light) */
  var VA = window.GameDNA_VigilArt || null, IMG = {};
  function loadArt(done) {
    if (!VA) { done(); return; } var n = 2;
    ['keeper', 'icons'].forEach(function (k) { var im = new Image(); im.onload = im.onerror = function () { if (im.naturalWidth) IMG[k] = im; if (--n === 0) done(); }; im.src = VA[k].src; });
  }
  function paintHero(g, x, footY, o) {
    var im = IMG.keeper, A = VA && VA.keeper; if (!im) return false;
    var f = Math.max(0, Math.min(A.n - 1, o.frame | 0)), k = o.h / A.bodyH, flip = o.facing !== A.facing;
    g.save(); g.translate(x, footY); if (flip) g.scale(-1, 1);
    g.drawImage(im, f * A.cellW, 0, A.cellW, A.cellH, -A.ax * A.cellW * k, -A.foot * k, A.cellW * k, A.cellH * k);
    g.restore(); return true;
  }
  function iconFns() {
    var out = {}; Object.keys(ICONS).forEach(function (name) {
      out[name] = function (g, x, y, sz) { var im = IMG.icons, A = VA && VA.icons; if (!im) return; var i = A.keys.indexOf(ICONS[name]); if (i < 0) return;
        var c = A.cell, sx = (i % A.cols) * c, sy = Math.floor(i / A.cols) * c, d = sz * 1.08;
        g.save(); g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = sz * 0.08; g.shadowOffsetY = sz * 0.04; g.drawImage(im, sx, sy, c, c, x - d / 2, y - d / 2, d, d); g.restore(); };
    }); return out;
  }
  function newRun() {
    game.runs++; game.clock.runFrame = 0;
    makeInstance();
    game.H.start({ seed: game.seed + game.runs - 1, weapons: game.startWeapons.slice() });
    game.H.setAuto(game.autoplay.on);
    setScene('play'); each('onRunStart');
  }
  function endRun(result, info) {
    endInfo = info; endInfo.result = result; game.results.push(result === 'win' ? 'w' : 'l');
    setScene(result === 'win' ? 'victory' : 'defeat'); each('onRunEnd', result, info);
  }
  function setScene(s) { game.scene = s; sceneT = 0; each('onScene', s); }

  /* === 4. Hit site ===================================================================================================== */
  function hitSite(ev) {
    if (ev.target === 'hero' && ev.kind === 'damage' && game.flags.builtinFlash) game.flash('#ff4040', 6, 0.12);
    if (ev.killed && ev.boss && game.flags.builtinShake) game.shake(8);
    each('onHit', ev);
  }

  /* === 5. Scenes ======================================================================================================= */
  function sceneAuto() {
    if (!game.autoplay.on) return;
    if (game.scene === 'title' && sceneT > 1200) newRun();
    else if ((game.scene === 'victory' || game.scene === 'defeat') && sceneT > RESULT_HOLD) setScene('title');
  }
  function sceneKey(k) {
    if (game.scene === 'title') { if (k === 'ok') newRun(); return; }
    if (game.scene === 'play') { if (game.H.key(k)) return; return; }
    if ((game.scene === 'victory' || game.scene === 'defeat') && k === 'ok' && sceneT > 600) setScene('title');
  }

  /* === 6. Main tick ==================================================================================================== */
  var keyQ = [], ptrQ = [];
  function tick() {
    game.clock.frame++; sceneT += STEP;
    while (keyQ.length) {
      var k = keyQ.shift(), used = false;
      for (var i = 0; i < game.addons.length && !used; i++) { var a = game.addons[i]; if (a.onKey) { try { used = a.onKey(k, game) === true; } catch (e) { console.warn(e); } } }
      if (used) continue;
      if (k === 'auto') { game.autoplay.on = !game.autoplay.on; if (game.H) game.H.setAuto(game.autoplay.on); continue; }
      if (game.autoplay.on && typeof k === 'string' && !FREEZE_RUN) { game.autoplay.on = false; if (game.H) game.H.setAuto(false); }
      sceneKey(k);
    }
    while (ptrQ.length) { var p = ptrQ.shift(); if (game.scene === 'play' && game.H) game.H.pointer(p.type, p.x, p.y); else if (p.type === 'down') sceneKey('ok'); }
    var hx = (game.held.ArrowRight || game.held.d || game.held.D ? 1 : 0) - (game.held.ArrowLeft || game.held.a || game.held.A ? 1 : 0);
    var hy = (game.held.ArrowDown || game.held.s || game.held.S ? 1 : 0) - (game.held.ArrowUp || game.held.w || game.held.W ? 1 : 0);
    if (game.H) game.H.setInput(hx, hy);
    sceneAuto();
    var dt = game.clock.paused ? 0 : STEP;
    if (game.H && (game.scene === 'play' || game.scene === 'victory' || game.scene === 'defeat')) { game.H.update(dt); if (dt) game.clock.runFrame++; }
    if (flashFx && --flashFx.t <= 0) flashFx = null;
    each('update', { dt: dt, frozen: dt === 0, paused: game.clock.paused, scene: game.scene });
  }
  function each(name, a, b, c) { for (var i = 0; i < game.addons.length; i++) { var f = game.addons[i][name]; if (typeof f === 'function') { try { f.call(game.addons[i], a, b === undefined ? game : b, c === undefined ? game : c); } catch (e) { console.warn('[addon ' + (game.addons[i].name || i) + ']', e); } } } }

  /* === 7. Drawing ====================================================================================================== */
  function render() {
    var g = ctx; if (!g) return;
    g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    g.fillStyle = '#10140e'; g.fillRect(0, 0, W, H);
    sceneRects = [];
    if (!game.H) makeInstance();
    game.H.drawWorld(g);
    vignette(g);
    if (game.scene === 'play') for (var i = 0; i < game.addons.length; i++) if (game.addons[i].draw) { try { game.addons[i].draw(g, 'fx', game); } catch (e) { console.warn(e); } }
    if (game.scene !== 'title') game.H.drawUI(g);
    if (flashFx) { g.globalAlpha = flashFx.a * flashFx.t / flashFx.n; g.fillStyle = flashFx.color; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    if (game.scene === 'title') drawTitle(g);
    if ((game.scene === 'victory' || game.scene === 'defeat') && endInfo) drawResults(g);
    for (i = 0; i < game.addons.length; i++) if (game.addons[i].draw) { try { game.addons[i].draw(g, 'overlay', game); } catch (e) { console.warn(e); } }
    for (i = 0; i < game.addons.length; i++) if (game.addons[i].drawUI) { try { game.addons[i].drawUI(g, game); } catch (e) { console.warn(e); } }
    document.documentElement.setAttribute('data-scene', game.scene);
  }
  var vigC = null;
  function vignette(g) {
    if (!vigC) { vigC = document.createElement('canvas'); vigC.width = 320; vigC.height = 180; var q = vigC.getContext('2d'), rg = q.createRadialGradient(160, 92, 50, 160, 92, 200); rg.addColorStop(0, 'rgba(6,8,20,0)'); rg.addColorStop(0.7, 'rgba(6,8,20,0.18)'); rg.addColorStop(1, 'rgba(6,8,20,0.55)'); q.fillStyle = rg; q.fillRect(0, 0, 320, 180); }
    g.drawImage(vigC, 0, 0, W, H);
  }
  var P = { font: 'system-ui, "Segoe UI", Roboto, sans-serif', serif: 'Georgia, "Times New Roman", serif' };
  function txt(g, s, x, y, size, color, align, weight, font) { g.font = (weight || 700) + ' ' + size + 'px ' + (font || P.font); g.textAlign = align || 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.strokeStyle = 'rgba(8,6,14,0.85)'; g.lineWidth = Math.max(2, size * 0.2); g.strokeText(s, x, y); g.fillStyle = color; g.fillText(s, x, y); }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function panel(g, x, y, w, h) { game.H._painter.panel(g, x, y, w, h, 10); }
  function drawTitle(g) {
    var t = sceneT, k = Math.min(1, t / 600), cx = W / 2, por = W < 500, ts = por ? 30 : 38, y = por ? H * 0.2 : 92;
    g.fillStyle = 'rgba(6,8,18,0.42)'; g.fillRect(0, 0, W, H);
    g.save(); g.globalAlpha = k;
    /* the keeper, large, with lantern light: idle frame of the walk sheet */
    var hx = por ? cx : cx - 170, hy = por ? H * 0.62 : 300, hh = por ? 150 : 170, A = VA && VA.keeper;
    var lg2 = g.createRadialGradient(hx + hh * 0.3, hy - hh * 0.42, 4, hx + hh * 0.3, hy - hh * 0.42, hh * 0.9);
    lg2.addColorStop(0, 'rgba(255,200,110,' + (0.32 + 0.04 * Math.sin(t / 90)) + ')'); lg2.addColorStop(1, 'rgba(255,170,80,0)');
    g.fillStyle = lg2; g.beginPath(); g.arc(hx + hh * 0.3, hy - hh * 0.42, hh * 0.9, 0, Math.PI * 2); g.fill();
    var sh = g.createRadialGradient(hx, hy, 2, hx, hy, hh * 0.32); sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(hx, hy); g.scale(1, 0.3); g.fillStyle = sh; g.beginPath(); g.arc(0, 0, hh * 0.32, 0, Math.PI * 2); g.fill(); g.restore();
    if (A) paintHero(g, hx, hy, { h: hh, facing: 'right', frame: 0 });
    var tx = por ? cx : cx + 70;
    var band = g.createLinearGradient(0, y - 34, 0, y + 34); band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(0.5, 'rgba(10,10,24,0.7)'); band.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = band; g.fillRect(0, y - 40, W, 80);
    txt(g, 'THE LONG VIGIL', tx, y - 4, ts, '#fff1c2', 'center', 800, P.serif);
    g.fillStyle = '#d6be82'; g.fillRect(tx - ts * 4, y + ts * 0.62, ts * 8, 1.2);
    txt(g, 'Hold the meadow until dawn.', tx, y + ts * 0.62 + 16, 10.5, '#e8e2d0', 'center', 600);
    txt(g, 'Your weapons strike on their own.', tx, y + ts * 0.62 + 31, 10.5, '#e8e2d0', 'center', 600);
    var py = por ? H - 104 : 214, pw = por ? 300 : 300;
    var blink = 0.55 + 0.45 * Math.sin(t / 260);
    g.globalAlpha = k * blink; txt(g, por ? 'TAP OR PRESS Z TO BEGIN' : 'PRESS Z TO BEGIN', tx, por ? H * 0.68 + 30 : py - 34 + 24, 14, '#ffffff', 'center', 800);
    g.globalAlpha = k;
    if (!por) {
      panel(g, tx - pw / 2, py + 12, pw, 74);
      txt(g, 'Move  Arrows / WASD / drag', tx, py + 30, 9.5, '#ffe9b0', 'center', 700);
      txt(g, 'Level up  Left / Right, Z (or tap a card)', tx, py + 47, 9.5, '#ffe9b0', 'center', 700);
      txt(g, 'P  autoplay', tx, py + 64, 9.5, '#ffe9b0', 'center', 700);
    } else {
      panel(g, cx - 150, H - 74, 300, 58);
      txt(g, 'Drag anywhere to walk', cx, H - 56, 11, '#ffe9b0', 'center', 700);
      txt(g, 'Tap a card to level up', cx, H - 36, 11, '#ffe9b0', 'center', 700);
    }
    g.restore();
    sceneRects.push({ name: 'title', x: tx - ts * 4.5, y: y - 40, w: ts * 9, h: 90 }, { name: 'titlePanel', x: (por ? cx : tx) - 150, y: por ? H - 74 : py + 12, w: 300, h: por ? 58 : 74 });
  }
  function fmt(ms) { var s = Math.floor(ms / 1000); return (s / 60 | 0) + ':' + ('0' + s % 60).slice(-2); }
  function drawResults(g) {
    if (sceneT < 300) return;
    var k = Math.min(1, (sceneT - 300) / 400), cx = W / 2, y = W < 500 ? H * 0.58 : 222;
    g.save(); g.globalAlpha = k;
    panel(g, cx - 140, y, 280, 116);
    var rows = [['Survived', fmt(endInfo.time)], ['Foes felled', String(endInfo.kills)], ['Level', String(endInfo.level)]];
    rows.forEach(function (r, i) { txt(g, r[0], cx - 120, y + 18 + i * 18, 10, '#d6dcf0', 'left', 600); txt(g, r[1], cx + 120, y + 18 + i * 18, 11, '#fff1c2', 'right', 800); });
    var ws = endInfo.weapons || [];
    for (var i = 0; i < ws.length; i++) { var d = game.H.lib.weapons[ws[i].id]; game.H._painter.slot(g, cx - ws.length * 13 + i * 26, y + 70, ws[i].id, d, ws[i].lv, true); }
    var blink = 0.55 + 0.45 * Math.sin(sceneT / 260);
    g.globalAlpha = k * blink; txt(g, 'PRESS Z', cx, y + 104, 9.5, '#ffffff', 'center', 800);
    g.restore();
    sceneRects.push({ name: 'results', x: cx - 140, y: y, w: 280, h: 116 });
  }

  /* === 8. Input ======================================================================================================== */
  var KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down', z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', x: 'back', X: 'back', Escape: 'back', p: 'auto', P: 'auto' };
  var FREEZE_RUN = false;
  function queueKey(k) { keyQ.push(KEYMAP[k] || k); }
  window.addEventListener('keydown', function (e) { if (KEYMAP[e.key] == null) return; e.preventDefault(); if (!game.held[e.key]) queueKey(e.key); game.held[e.key] = true; });
  window.addEventListener('keyup', function (e) { delete game.held[e.key]; });
  window.addEventListener('blur', function () { game.held = {}; });
  function toLogical(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
  function ptr(type) { return function (e) { if (type === 'down') { try { canvas.setPointerCapture(e.pointerId); } catch (x) { } } var p = toLogical(e); ptrQ.push({ type: type, x: p.x, y: p.y }); if (type === 'down') e.preventDefault(); }; }

  /* === 9. Boot ========================================================================================================= */
  var booted = false, artLoaded = false, artLoading = false;
  /* landscape: 640x360 logical; portrait (a phone held upright): 360 wide and as tall as the screen allows (up to 780), so the
     hero and the HUD keep their size in CSS px instead of shrinking into a letterbox strip */
  function fit() {
    var iw = window.innerWidth, ih = window.innerHeight, portrait = ih > iw * 1.15 && iw < 760;
    W = portrait ? 360 : 640; H = portrait ? Math.max(360, Math.min(780, Math.round(360 * (ih - 8) / iw))) : 360;
    var cw = Math.min(iw, 1280), ch = cw * H / W;
    if (ch > ih - 8 && ih > 200) { ch = ih - 8; cw = ch * W / H; }
    canvas.style.width = Math.floor(cw) + 'px'; canvas.style.height = Math.floor(ch) + 'px';
    dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(Math.floor(cw) * dpr); canvas.height = Math.round(Math.floor(ch) * dpr);
    ctx.imageSmoothingEnabled = true;
    if (game.H) game.H.setView({ x: 0, y: 0, w: W, h: H });
    game.view = { w: W, h: H, portrait: portrait };
  }
  function maybeBoot() {
    if (booted || game.holds > 0 || !document.body) return;
    var K = window.GameDNA_DemoKit; if (K && !K.isReady()) { K.ready(maybeBoot); return; }
    if (!artLoaded) { if (!artLoading) { artLoading = true; loadArt(function () { artLoaded = true; maybeBoot(); }); } return; }
    booted = true;
    canvas = document.getElementById('game'); ctx = canvas.getContext('2d');
    fit(); window.addEventListener('resize', function () { fit(); if (FREEZE) render(); });
    canvas.addEventListener('pointerdown', ptr('down')); canvas.addEventListener('pointermove', ptr('move')); canvas.addEventListener('pointerup', ptr('up')); canvas.addEventListener('pointercancel', ptr('cancel'));
    game.shipped = { weapons: Object.keys(GameDNA_HordeSurvival.WEAPONS), enemies: Object.keys(GameDNA_HordeSurvival.ENEMIES), upgrades: Object.keys(GameDNA_HordeSurvival.UPGRADES) };
    makeInstance();
    setScene('title');
    window.__state = stateForTools;
    if (T_MS >= 0) {
      FREEZE_RUN = true; var n = Math.round(T_MS / STEP); for (var i = 0; i < n; i++) tick(); FREEZE_RUN = false;
      render(); window.__frozen = true; document.documentElement.setAttribute('data-state', JSON.stringify(game.state()));
      if (FREEZE) return;
    }
    var acc = 0, last = performance.now();
    (function loop(now) {
      acc += Math.min(250, now - last) * SPEED; last = now;
      while (acc >= STEP) { tick(); acc -= STEP; }
      render(); requestAnimationFrame(loop);
    })(last);
  }
  /* window.__state() for tools/sprites/statecheck.py: the hero and the on-screen foes, facing = what is drawn this frame */
  function stateForTools() {
    var out = { t: Math.round(game.clock.frame * STEP), scene: game.scene, actors: [] }; if (!game.H) return out;
    var h = game.H.hero(), ha = game.H.anchor('hero');
    out.actors.push({ id: 'hero', x: ha.x, y: ha.footY, facing: h.face > 0 ? 'right' : 'left', vx: Math.abs(h.vx) > 4 ? h.vx : 0, target: null, asset: 'keeper-walk' });
    if (game.scene === 'title') return out;
    var list = game.H.enemies(); list.sort(function (a, b) { return Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y); });
    list.slice(0, 60).forEach(function (e) { out.actors.push({ id: e.id + '-' + e.kind, x: e.sx, y: e.sy, facing: e.face > 0 ? 'right' : 'left', vx: e.boss || Math.abs(e.vx) <= 3 ? 0 : e.vx, target: e.boss ? 'hero' : null, asset: LOOKS[(game.H.lib.enemies[e.kind] || {}).look] || null }); });
    return out;
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', maybeBoot); else Promise.resolve().then(maybeBoot);
})();
