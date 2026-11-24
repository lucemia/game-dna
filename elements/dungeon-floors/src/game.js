/* Lanternfall: the B-12 dungeon-floors starter. A complete five-floor dungeon run built on GameDNA_DungeonFloors.
   A wanderer with a lantern goes down through five seeded floors (cellars, mossy halls, drowned crypts, the ember deep)
   to the Hollow Crown on its throne. Step in eight directions, bump to fight, open doors and chests, drink tonics,
   find the stairs. Kill the Hollow Crown to win; fall to 0 HP and the lantern goes out.
   Search for the "=== n." banners: config and content, the game object (extension points), run setup, the hit site,
   scenes, the main tick, drawing, input, boot. */
(function () {
  'use strict';
  /* =================================================================================================
     === 1. Config and content ========================================================================= */
  var qs = new URLSearchParams(location.search);
  var STEP = 1000 / 60;
  var FREEZE_AT = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : null;
  var FROZEN = FREEZE_AT !== null && qs.get('freeze') === '1';
  var AUTO = qs.get('auto') === '1' || (FROZEN && qs.get('auto') !== '0');
  var SEED = (+qs.get('seed') >>> 0) || 7;
  var REDUCED = qs.get('reduced') === '1' || (!!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var DF = GameDNA_DungeonFloors;

  // Room types, monsters and items. The module ships the built-in tables (GameDNA_DungeonFloors.ROOMS / MONSTERS / ITEMS,
  // format in module/README.md); add or override entries here, or later through GAME.addRoom / addMonster / addItem.
  var ROOMS = {};
  var MONSTERS = {};
  var ITEMS = {};
  // Run parameters (module/README.md "params"): floors, map size, room count, loops, doors, monster density, light radius...
  // numbers: the module's own damage / crit / miss / heal numbers; an addon that draws its own (C-11) sets GAME.params.numbers = 'off'
  var PARAMS = { floors: +qs.get('floors') || 5, fog: qs.get('fog') || 'on', minimap: qs.get('minimap') || 'on', numbers: qs.get('numbers') || 'on' };

  /* =================================================================================================
     === 2. Game object: the public surface and the extension points (see README) ======================= */
  var canvas = document.getElementById('screen'), g = canvas.getContext('2d');
  var W = 420, H = 240, K = 1;                  // logical view (changes with the window: integer device px per art px)
  var game = {
    addons: [], flags: { builtinShake: true, builtinFlash: true },
    scene: 'title', C: null, lastEnd: null, runs: 0,
    clock: { frame: 0, playFrame: 0, paused: false, stop: 0 },
    autoplay: { on: AUTO },
    held: {},                                   // keys held right now ({ArrowLeft: true}); scenes never clear it
    rooms: ROOMS, monsters: MONSTERS, items: ITEMS, params: PARAMS, seed: SEED,
    shipped: null,                              // the content ids this file ships with (set below, before the ADDONS SLOT)
    addRoom: function (id, def) { ROOMS[id] = def; if (game.C) game.C.addRoom(id, def); return id; },
    addMonster: function (id, def) { MONSTERS[id] = def; if (game.C) game.C.addMonster(id, def); return id; },
    addItem: function (id, def) { ITEMS[id] = def; if (game.C) game.C.addItem(id, def); return id; },
    view: function () { return { w: W, h: H, scale: K }; },
    anchor: function (id) { return game.C && game.scene === 'play' ? game.C.anchor(id) : null; },
    unitRects: function () { return game.C && game.scene === 'play' ? game.C.unitRects() : []; },
    fieldRect: function () { return { x: 0, y: 0, w: W, h: H }; },
    uiRects: function () { return (game.C && game.scene === 'play' ? game.C.uiRects() : []).concat(hudRects.slice()); },
    shake: function (px, frames) { if (REDUCED) return; fxState.shake = Math.max(fxState.shake, frames | 0); fxState.shakePx = Math.max(fxState.shake > 0 ? fxState.shakePx : 0, px); fxState.shakeFrames = fxState.shake; },
    flash: function (color, frames, alpha) { if (REDUCED) return; fxState.flash = { color: color || '#ffffff', n: frames | 0 || 6, t: 0, a: alpha == null ? 0.3 : alpha }; },
    hitStop: function (f) { var n = typeof f === 'object' && f ? Math.ceil((f.ms || 0) * 60 / 1000) : f | 0; game.clock.stop = Math.max(game.clock.stop, n); },
    hitStopMs: function (ms) { game.hitStop({ ms: ms }); },
    pause: function (on) { game.clock.paused = !!on; },
    holdBoot: function () { bootHolds++; var done = false; return function () { if (done) return; done = true; bootHolds--; if (!bootHolds && bootWaiting) boot(); }; },
    state: function () {
      var c = game.C ? game.C.state() : null;
      return { scene: game.scene, frame: game.clock.frame, result: game.lastEnd ? game.lastEnd.result : null, end: game.lastEnd ? game.lastEnd.info : null, df: c, auto: game.autoplay.on, view: [W, H] };
    }
  };
  window.GAME = game;
  game.shipped = { rooms: Object.keys(DF.ROOMS).concat(['throne']), monsters: Object.keys(DF.MONSTERS), items: Object.keys(DF.ITEMS) };
  function each(hook, args) {
    var out = false;
    game.addons.forEach(function (a) { if (!a || typeof a[hook] !== 'function') return; try { if (a[hook].apply(a, args) === true) out = true; } catch (e) { console.error('addon ' + (a.name || '?') + '.' + hook + ': ' + e.message); } });
    return out;
  }
  var fxState = { shake: 0, shakePx: 0, shakeFrames: 0, flash: null };
  var hudRects = [], bootHolds = 0, bootWaiting = false, booted = false, sceneT = 0;

  /* =================================================================================================
     === 3. Run setup: one GameDNA_DungeonFloors instance, started once per run =========================== */
  function makeInstance() {
    game.C = DF.create({
      view: { x: 0, y: 0, w: W, h: H }, seed: SEED, rooms: ROOMS, monsters: MONSTERS, items: ITEMS, params: PARAMS,
      onHit: hitSite,
      onEvent: function (ev) {
        if (ev.kind === 'floorStart') each('onFloorStart', [ev, game]);
        if (ev.kind === 'pickup') each('onPickup', [ev, game]);
        if (ev.kind === 'death') each('onDeath', [ev, game]);
        each('onEvent', [ev, game]);
      },
      onEnd: function (result, info) { game.lastEnd = { result: result, info: info, at: game.clock.frame }; each('onEnd', [result, info, game]); }
    });
  }
  function newRun() {
    game.runs++; game.lastEnd = null;
    game.C.start({ seed: SEED + (game.runs - 1) * 1013 });
    game.C.setAuto(false);
    each('onNewGame', [game]);
  }

  /* =================================================================================================
     === 4. Hit site: every HP change (hero or monster), on its impact frame ============================= */
  function hitSite(ev) {
    if (ev.defender === 'hero' && ev.amount > 0) { if (game.flags.builtinShake) game.shake(2, 8); if (game.flags.builtinFlash) game.flash('#ff2a1a', 6, 0.12); }
    if (ev.killed && ev.defender !== 'hero' && game.C) { var d = game.C.lib.monsters[ev.defender]; if (d && d.boss && game.flags.builtinShake) game.shake(4, 24); }
    each('onHit', [ev, game]);
  }

  /* =================================================================================================
     === 5. Scenes: title, play, victory, defeat ======================================================== */
  function setScene(s) { game.scene = s; sceneT = 0; each('onScene', [s, game]); }
  function sceneOk() {
    if (game.scene === 'title' && sceneT > 10) { setScene('play'); game.C.setAuto(game.autoplay.on); game.clock.playFrame = 0; }
    else if ((game.scene === 'victory' || game.scene === 'defeat') && sceneT > 50) { newRun(); setScene('title'); }
  }
  function sceneAuto() {
    if (!game.autoplay.on) return;
    if (game.scene === 'title' && sceneT === 60) sceneOk();
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
      if (isPtr && k.ptr !== 'down') return;
      var asKey = isPtr ? { tap: true, x: k.x, y: k.y } : k;
      if (each('onKey', [asKey, game])) return;
      if (k === 'auto') { game.autoplay.on = !game.autoplay.on; game.C.setAuto(game.autoplay.on && game.scene === 'play'); return; }
      if (game.autoplay.on) { game.autoplay.on = false; game.C.setAuto(false); }
      if (game.scene === 'play' && !game.lastEnd) { if (isPtr) game.C.pointer('down', k.x, k.y); else game.C.key(k); return; }
      if (k === 'ok' || k === 'wait' || isPtr) sceneOk();
    });
    if (game.scene === 'play' && !game.autoplay.on) game.C.setHeld({ up: game.held.ArrowUp || game.held.w || game.held.W, down: game.held.ArrowDown || game.held.s || game.held.S, left: game.held.ArrowLeft || game.held.a || game.held.A, right: game.held.ArrowRight || game.held.d || game.held.D });
    else game.C.setHeld(null);
    if (!frozen) sceneT++;
    if (!frozen) sceneAuto();
    if (game.C.auto() !== (game.autoplay.on && game.scene === 'play')) game.C.setAuto(game.autoplay.on && game.scene === 'play');
    game.C.update(frozen ? 0 : STEP);
    if (game.scene === 'play' && !frozen) c.playFrame++;
    if (game.scene === 'play' && game.lastEnd && game.clock.frame - game.lastEnd.at === 90) setScene(game.lastEnd.result === 'win' ? 'victory' : 'defeat');
    if (fxState.shake > 0 && !frozen) fxState.shake--;
    if (fxState.flash && !frozen) { fxState.flash.t++; if (fxState.flash.t >= fxState.flash.n) fxState.flash = null; }
    each('update', [game, { dt: frozen ? 0 : STEP, frozen: frozen, paused: c.paused, hitStop: c.stop }]);
  }

  /* =================================================================================================
     === 7. Drawing (logical px, an integer number of device px per art px) ============================== */
  function txt(s, x, y, o) { return DF.text(g, s, x, y, o); }
  function big(s, x, y, scale, o) {   // pixel text scaled by an integer, centred
    g.save(); g.translate(Math.round(x), Math.round(y)); g.scale(scale, scale); txt(s, 0, 0, Object.assign({ align: 'center' }, o || {})); g.restore();
  }
  function panel(x, y, w, h, name) {
    x = Math.round(x); y = Math.round(y);
    g.fillStyle = '#120c1a'; g.fillRect(x + 1, y, w - 2, h); g.fillRect(x, y + 1, w, h - 2);
    g.fillStyle = 'rgba(24,16,34,0.94)'; g.fillRect(x + 1, y + 1, w - 2, h - 2);
    g.fillStyle = '#5c4a78'; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 4);
    g.fillStyle = '#2a2038'; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
    g.fillStyle = '#d8a848'; [[x + 1, y + 1], [x + w - 3, y + 1], [x + 1, y + h - 3], [x + w - 3, y + h - 3]].forEach(function (p) { g.fillRect(p[0], p[1], 2, 2); });
    hudRects.push({ name: name || 'panel', x: x, y: y, w: w, h: h });
  }
  function blink(s, x, y) { if (Math.floor(game.clock.frame / 30) % 2 === 0) txt(s, x, y, { align: 'center', color: '#ffd36a', outline: '#120c1a' }); }
  function render() {
    g.setTransform(K, 0, 0, K, 0, 0); g.imageSmoothingEnabled = false; hudRects = [];
    if (!game.C) return;
    g.fillStyle = '#08060d'; g.fillRect(0, 0, W, H);
    g.save();
    if (fxState.shake > 0) { var k = fxState.shake / Math.max(1, fxState.shakeFrames), px = fxState.shakePx * k; g.translate(Math.round(Math.sin(game.clock.frame * 2.1) * px), Math.round(Math.cos(game.clock.frame * 2.9) * px * 0.6)); }
    game.C.drawScene(g);
    if (game.scene === 'play') each('draw', [g, 'fx', game]);
    g.restore();
    if (fxState.flash) { g.fillStyle = fxState.flash.color; g.globalAlpha = fxState.flash.a * (1 - fxState.flash.t / fxState.flash.n); g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    if (game.scene === 'play' || game.scene === 'victory' || game.scene === 'defeat') game.C.drawUI(g);
    if (game.scene === 'title') drawTitle();
    else if (game.scene === 'victory' || game.scene === 'defeat') drawEnd(game.scene === 'victory');
    each('draw', [g, 'overlay', game]);
    each('drawUI', [g, game]);
  }
  function vignette(a) {
    var gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
    gr.addColorStop(0, 'rgba(8,6,13,' + (a * 0.35) + ')'); gr.addColorStop(1, 'rgba(8,6,13,' + a + ')'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  function drawTitle() {
    g.fillStyle = 'rgba(8,6,13,0.9)'; g.fillRect(0, 0, W, H); vignette(0.9);
    var sc = W >= 360 ? 3 : 2, ty = Math.round(H * 0.14);
    big('LANTERNFALL', W / 2 + 1, ty + 1, sc, { color: '#3a1a08', shadow: false });
    big('LANTERNFALL', W / 2, ty, sc, { color: '#ffd070', shadow: '#7a3a10' });
    txt('Five floors down to the Hollow Crown', W / 2, ty + 9 * sc + 6, { align: 'center', color: '#f0e2cc', outline: '#120c1a' });
    // the cast at 2x on a lit strip of floor, drawn by the module's own art; every monster faces the hero
    var cs = W >= 300 ? 2 : 1, cy = Math.round(H * 0.6), gap = W >= 360 ? 30 : 22, ids = ['slime', 'bat', 'spore', 'wisp'], f = game.clock.frame;
    var gr = g.createRadialGradient(W / 2, cy, 4, W / 2, cy, gap * cs * 2.6); gr.addColorStop(0, 'rgba(255,170,80,0.22)'); gr.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = gr; g.fillRect(0, cy - gap * cs * 3, W, gap * cs * 6);
    g.save(); g.translate(Math.round(W / 2), cy); g.scale(cs, cs);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-gap * 2.6, 1, gap * 5.2, 2);
    DF.drawHero(g, 0, 0, { dir: 'down', frame: 0 });
    ids.forEach(function (id, i) { var d = game.C.lib.monsters[id], side = i < 2 ? -1 : 1, x = side * gap * (1 + (i % 2)); DF.drawMonster(g, d, x, (d.look === 'bat' || d.look === 'wisp' ? -6 : 0), { facing: side < 0 ? 'right' : 'left', frame: Math.floor(f / 12 + i) % 4 }); });
    g.restore();
    blink('PRESS Z OR TAP TO BEGIN', W / 2, Math.round(H * 0.74));
    txt(W >= 360 ? 'Arrows / WASD move, numpad diagonals, bump to fight, Q tonic, M map' : 'Tap a tile to walk, bump to fight', W / 2, H - 14, { align: 'center', color: '#b8a8c8', outline: '#120c1a' });
  }
  function drawEnd(won) {
    var e = (game.lastEnd && game.lastEnd.info) || {}, w = Math.min(W - 16, 220), h = 80, x = Math.round((W - w) / 2), y = Math.round(Math.max(40, (H - h) / 2));
    panel(x, y, w, h, 'endBox');
    txt(won ? 'THE CROWN IS BROKEN' : 'THE LANTERN GOES OUT', W / 2, y + 8, { align: 'center', color: won ? '#ffd070' : '#ff7a6a' });
    g.fillStyle = '#d8a848'; g.fillRect(x + 12, y + 19, w - 24, 1);
    var rows = [['Floor', (e.floor || 1) + ' of ' + (e.floors || 5)], ['Level', e.level || 1], ['Foes felled', e.kills || 0], ['Gold', e.gold || 0], ['Turns', e.turns || 0]];
    rows.forEach(function (r, i) { txt(r[0], x + 14, y + 25 + i * 10, { color: '#c8b8d8' }); txt(String(r[1]), x + w - 14, y + 25 + i * 10, { align: 'right', color: '#fff0d8' }); });
    if (sceneT > 50) blink('Z or tap: a new descent', W / 2, y + h + 6);
  }
  var dpr = 1;
  function fit() {
    var stage = document.getElementById('stage'), cssW = Math.max(200, Math.min(stage.clientWidth || 640, 1600)), vh = Math.max(200, (window.innerHeight || 600) - (cssW < 560 ? 230 : 120));
    dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    var devW = Math.floor(cssW * dpr), devH = Math.floor(Math.min(vh, cssW * (cssW < 560 ? 1.3 : 0.62)) * dpr);
    var target = cssW < 560 ? 220 : 460;
    K = Math.max(1, Math.round(devW / target));
    W = Math.floor(devW / K); H = Math.max(150, Math.floor(devH / K));
    if (canvas.width !== W * K || canvas.height !== H * K) { canvas.width = W * K; canvas.height = H * K; }
    canvas.style.width = (W * K / dpr) + 'px'; canvas.style.height = (H * K / dpr) + 'px';
    if (game.C) game.C.setView({ x: 0, y: 0, w: W, h: H });
  }
  addEventListener('resize', function () { fit(); });

  /* =================================================================================================
     === 8. Input: a key queue (a 0 ms tap still counts), pointer taps, held keys ======================== */
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right',
    Home: 'upleft', PageUp: 'upright', End: 'downleft', PageDown: 'downright', 7: 'upleft', 9: 'upright', 1: 'downleft', 3: 'downright', 8: 'up', 2: 'down', 4: 'left', 6: 'right', 5: 'wait',
    z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'wait', '.': 'wait', x: 'back', X: 'back', Escape: 'back', q: 'potion', Q: 'potion', m: 'map', M: 'map', p: 'auto', P: 'auto' };
  addEventListener('keydown', function (e) { game.held[e.key] = true; var k = KEYS[e.key]; if (!k) return; e.preventDefault(); if (!e.repeat) keyQ.push(k); });
  addEventListener('keyup', function (e) { game.held[e.key] = false; });
  addEventListener('blur', function () { for (var k in game.held) game.held[k] = false; });
  function local(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
  canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); var p = local(e); keyQ.push({ ptr: 'down', x: p.x, y: p.y }); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-key]'), function (b) { b.addEventListener('pointerdown', function (e) { e.preventDefault(); keyQ.push(b.getAttribute('data-key')); }); });

  /* =================================================================================================
     === 9. Boot ======================================================================================== */
  function boot() {
    if (booted) return;
    if (bootHolds > 0) { bootWaiting = true; return; }
    booted = true;
    fit(); makeInstance(); newRun(); setScene('title');
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
  // text state for checks and critics: the hero and every visible monster (facing = the side the drawn sprite looks at)
  window.__state = function () { return { t: Math.round(game.clock.frame * STEP), scene: game.scene, actors: game.C && game.scene === 'play' ? game.C.actors() : [] }; };
  game.boot = boot;
  game.step = function (n) { for (var i = 0; i < (n || 1); i++) tick(); };
  game.render = render;
  game.press = function (k) { keyQ.push(k); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
