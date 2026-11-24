/* Meadowlark Cup: the N-05 kart-racer-3d starter game. Built on GameDNA_KartRacer3D (pasted above, unchanged).
   Sections are marked "=== n." (see starter/README.md). Addons plug in through the ADDONS SLOT after this script. */
(function () {
  'use strict';
  var KR3 = window.GameDNA_KartRacer3D, THREE = window.THREE;

  // ======================================================================= 1. Config and content
  var Q = new URLSearchParams(location.search);
  var OPT = {
    t: Q.has('t') ? +Q.get('t') : null, freeze: Q.get('freeze') === '1', seed: +(Q.get('seed') || 7),
    auto: Q.has('auto') ? Q.get('auto') === '1' : Q.has('t'), touch: Q.get('touch') === '1' || ('ontouchstart' in window),
    laps: Q.has('laps') ? +Q.get('laps') : null, race: Q.has('race') ? +Q.get('race') : 0,
    shadows: Q.get('shadows') || 'soft', dpr: Q.has('dpr') ? +Q.get('dpr') : 2, glcheck: Q.get('glcheck') === '1'
  };
  var POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
  var TEXT = { title: 'MEADOWLARK CUP', sub: 'A three-lap kart grand prix', start: 'Press Enter to start', startTouch: 'Tap to start' };
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  // the cup: every entry of GAME.tracks is raced in order (track defs: see module README "Tracks")
  var TRACKS = [Object.assign({ id: 'meadow' }, copy(KR3.TRACKS.meadow)), Object.assign({ id: 'canyon' }, copy(KR3.TRACKS.canyon))];
  // the grid: the first entry is the player (racer defs: see module README "Karts")
  var ROSTER = ['rook', 'wren', 'juno', 'bram', 'tilly', 'odo'].map(function (id) { return Object.assign({ id: id }, KR3.KARTS[id]); });
  ROSTER[0].player = true;

  // ======================================================================= 2. Game object (window.GAME)
  var game = window.GAME = {
    version: '1.0.0', addons: [], tracks: TRACKS, roster: ROSTER, phase: 'title', time: 0, frame: 0, worldFrame: 0,
    raceIndex: 0, standings: {}, lastResults: null, cupResults: [], toasts: [], flags: { builtinHud: true, builtinToasts: true },
    autoplay: { on: OPT.auto, decide: null }, clock: { paused: false, frame: 0, worldFrame: 0 }, held: {}, OPT: OPT, POINTS: POINTS
  };
  function each(hook) {
    var args = Array.prototype.slice.call(arguments, 1), ret;
    for (var i = 0; i < game.addons.length; i++) {
      var a = game.addons[i]; if (!a || typeof a[hook] !== 'function') continue;
      try { var r = a[hook].apply(a, args.concat([game])); if (r !== undefined && ret === undefined) ret = r; } catch (e) { console.error('[addon ' + (a.name || i) + '] ' + hook, e); }
    }
    return ret;
  }
  game.each = each;
  game.toast = function (text, ms, color) { game.toasts.push({ text: text, until: game.time + (ms || 1800), at: game.time, color: color || '#ffe6a0' }); if (game.toasts.length > 3) game.toasts.shift(); };
  // extension points for content (call them in the ADDONS SLOT, before boot)
  game.addTrack = function (def) {
    if (!def || !def.points || def.points.length < 4) { console.error('addTrack: a track needs >= 4 points'); return null; }
    var d = copy(def); d.id = d.id || 'track' + (TRACKS.length + 1); d.width = d.width || 13; d.palette = d.palette || 'meadow';
    var probs = KR3.checkTrack(d); if (probs.length) console.warn('addTrack ' + d.id + ': ' + probs.join('; '));
    TRACKS.push(d); return d;
  };
  game.addKart = function (def) {
    if (ROSTER.length >= 8) { console.error('addKart: the grid holds 8 karts'); return null; }
    var d = Object.assign({ number: ROSTER.length + 1, speed: 1, accel: 1, grip: 1 }, def); d.id = d.id || 'kart' + (ROSTER.length + 1);
    ['body', 'accent', 'suit', 'helmet', 'stripe'].forEach(function (k) { if (typeof d[k] === 'string') d[k] = parseInt(d[k].replace('#', ''), 16); });
    d.stripe = d.stripe == null ? d.accent : d.stripe; d.suit = d.suit == null ? 0x2a3550 : d.suit; d.helmet = d.helmet == null ? 0xf4efe2 : d.helmet;
    ['speed', 'accel', 'grip'].forEach(function (k) { d[k] = Math.max(0.9, Math.min(1.1, +d[k] || 1)); });
    ROSTER.push(d); return d;
  };

  // ======================================================================= 3. World (the module instance)
  var glCanvas = document.getElementById('gl'), ui = document.getElementById('ui'), g = ui.getContext('2d');
  var KR = KR3.create({ THREE: THREE, canvas: glCanvas, params: { shadows: OPT.shadows, maxDpr: OPT.dpr }, preserve: OPT.glcheck, onEvent: onEvent });
  game.KR = KR; game.three = KR.ok ? { THREE: THREE, scene: KR.scene, camera: KR.camera, renderer: KR.renderer } : null;
  game.karts = function () { return KR.karts(); };
  game.actors = game.karts;
  game.anchor = function (id) { return KR.anchor(id); };
  game.worldToScreen = function (x, y, z) { return KR.project(x, y, z); };
  game.track = function () { return TRACKS[game.raceIndex]; };

  // ======================================================================= 4. Events and the cup
  function onEvent(ev) {
    each('onEvent', ev);
    var pl = ev.kart === 'player';
    if (ev.type === 'lap') each('onLap', ev);
    else if (ev.type === 'checkpoint') each('onCheckpoint', ev);
    else if (ev.type === 'boost') { each('onBoost', ev); if (pl && ev.source === 'start' && game.flags.builtinToasts) game.toast('ROCKET START!', 1600, '#7ad8ff'); }
    else if (ev.type === 'driftStart' || ev.type === 'driftEnd') each('onDrift', ev);
    else if (ev.type === 'jump' || ev.type === 'land') each('onJump', ev);
    else if (ev.type === 'bump' || ev.type === 'wall') each('onHit', ev);
    else if (ev.type === 'finish') each('onFinish', ev);
    else if (ev.type === 'raceEnd') { game.finishAt = game.time; each('onRaceEnd', ev); }
    else if (ev.type === 'go') each('onRaceStart', ev);
    if (pl && ev.type === 'lap' && ev.lapMs != null && game.flags.builtinToasts) {
      var k = KR.kart('player'); if (k && k.bestLap === ev.lapMs && k.lapTimes.length > 1) game.toast('BEST LAP  ' + KR.fmtTime(ev.lapMs), 2000, '#7af27a');
    }
  }
  function setPhase(p) { if (game.phase === p) return; game.phase = p; game.phaseAt = game.time; each('onPhase', p); }
  game.setPhase = setPhase;
  function startRace(i) {
    i = Math.max(0, Math.min(TRACKS.length - 1, (+i || 0) | 0));      // ?race= is 0-based; out of range is clamped
    game.raceIndex = i; var def = TRACKS[i];
    var list = ROSTER.map(function (r) { return { id: r.player ? 'player' : r.id, def: r, name: r.name, player: !!r.player }; });
    KR.startRace({ track: def, karts: list, laps: OPT.laps || def.laps || 3, seed: OPT.seed * 101 + i });
    KR.setAI('player', game.autoplay.on);
    game.finishAt = null; game.lastResults = null; setPhase('intro'); each('onRaceSetup', def);
  }
  game.startRace = startRace;
  function scoreRace() {
    var res = KR.results(); game.lastResults = res;
    res.forEach(function (r, i) { var key = r.id; game.standings[key] = game.standings[key] || { id: key, name: r.name, color: r.color, points: 0, player: r.player }; r.points = POINTS[i] || 0; game.standings[key].points += r.points; });
    game.cupResults.push({ track: TRACKS[game.raceIndex].id, results: res });
    each('onResults', res);
  }
  game.table = function () { var a = Object.keys(game.standings).map(function (k) { return game.standings[k]; }); a.sort(function (x, y) { return y.points - x.points || (x.player ? -1 : 1); }); return a; };
  function nextRace() {
    if (game.raceIndex + 1 < TRACKS.length) startRace(game.raceIndex + 1);
    else {
      setPhase('cup'); var t = game.table(); var me = t.findIndex(function (r) { return r.player; }) + 1; game.cupPlace = me;
      // the top three on a podium line in front of the camera, clear of the standings panel
      KR.podium(t.slice(0, 3).map(function (r) { return r.id; }), { side: W >= 900 ? -3.2 : 0, lift: H > W ? 1.9 : 0 });
      each('onEnd', me === 1 ? 'win' : 'done', game);
    }
  }

  // ======================================================================= 5. Autoplay (the player's kart is driven by the module's AI driver)
  function autoInput() {
    if (typeof game.autoplay.decide === 'function') { try { var d = game.autoplay.decide(game); if (d) return d; } catch (e) { console.error(e); } }
    return null;    // null: the module's AI drives the player kart (KR.setAI)
  }

  // ======================================================================= 6. Input
  var held = game.held, queue = [], KEYMAP = { ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Space: 'drift', ShiftLeft: 'drift', ShiftRight: 'drift', KeyK: 'drift', Enter: 'ok', KeyZ: 'ok', Escape: 'pause', KeyP: 'auto' };
  addEventListener('keydown', function (e) {
    var k = KEYMAP[e.code]; if (!k) return; e.preventDefault();
    if (!held[k]) queue.push(k); held[k] = true;
    if (game.autoplay.on && game.phase === 'race' && /gas|brake|left|right/.test(k)) setAuto(false);
  });
  addEventListener('keyup', function (e) { var k = KEYMAP[e.code]; if (k) held[k] = false; });
  addEventListener('blur', function () { for (var k in held) held[k] = false; });
  var touchUI = OPT.touch, pointers = {};
  function touchButtons() {
    var W = ui.clientWidth, H = ui.clientHeight, r = W < 560 ? 36 : 42, y = H - r - 22;
    return [{ key: 'left', x: r + 18, y: y, r: r, label: '<' }, { key: 'right', x: r * 3 + 30, y: y, r: r, label: '>' },
      { key: 'brake', x: W - r * 3 - 30, y: y, r: r, label: 'BRAKE' }, { key: 'drift', x: W - r - 18, y: y - r * 0.9, r: r * 1.1, label: 'DRIFT' }];
  }
  function btnAt(x, y) { var b = touchButtons(); for (var i = 0; i < b.length; i++) if (Math.hypot(x - b[i].x, y - b[i].y) < b[i].r + 8) return b[i].key; return null; }
  ui.addEventListener('pointerdown', function (e) {
    var r = ui.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (e.pointerType === 'touch') touchUI = true;
    if (game.phase !== 'race') { queue.push('ok'); return; }
    var k = touchUI ? btnAt(x, y) : null;
    if (k) { pointers[e.pointerId] = k; if (!held[k]) queue.push(k); held[k] = true; if (game.autoplay.on && k !== 'drift') setAuto(false); ui.setPointerCapture(e.pointerId); }
  });
  function up(e) { var k = pointers[e.pointerId]; if (k) { held[k] = false; delete pointers[e.pointerId]; } }
  ui.addEventListener('pointerup', up); ui.addEventListener('pointercancel', up);
  game.virtualKey = function (k, down) { if (down && !held[k]) queue.push(k); held[k] = !!down; };
  function setAuto(on) { game.autoplay.on = on; KR.setAI('player', on && !game.autoplay.decide); game.toast('Autoplay ' + (on ? 'on' : 'off'), 1200); }
  game.setAuto = setAuto;
  function handleKey(k) {
    if (each('onKey', k) === true) return;
    if (k === 'auto') { setAuto(!game.autoplay.on); return; }
    if (k === 'pause' && game.phase === 'race') { game.clock.paused = !game.clock.paused; return; }
    if (k !== 'ok') return;
    if (game.phase === 'title') { game.standings = {}; game.cupResults = []; startRace(OPT.race | 0); }
    else if (game.phase === 'intro') { setPhase('race'); KR.countdown(); }
    else if (game.phase === 'results') nextRace();
    else if (game.phase === 'cup') { setPhase('title'); KR.startRace({ track: TRACKS[0], karts: ROSTER.map(function (r) { return { id: r.player ? 'player' : r.id, def: r, player: !!r.player }; }), seed: OPT.seed }); KR.setCamera('orbit', { target: 'player' }); }
  }

  // ======================================================================= 7. Main step (fixed 60 Hz; also run by the ?t= fast-forward)
  var DT = 1 / 60;
  function step() {
    game.frame++; game.clock.frame = game.frame; game.time += DT * 1000;
    while (queue.length) handleKey(queue.shift());
    var hold = game.clock.paused;
    for (var gi = 0; gi < game.addons.length && !hold; gi++) { var ad = game.addons[gi]; if (ad && typeof ad.gate === 'function') { try { if (ad.gate(game) === false) hold = true; } catch (e) { console.error(e); } } }
    if (KR.ok && !hold) {
      var since = game.time - (game.phaseAt || 0), inp = null;
      if (game.phase === 'title') { if (game.autoplay.on && game.time > 900) handleKey('ok'); }
      else if (game.phase === 'intro') { if (since > (game.autoplay.on ? 1800 : 2600)) handleKey('ok'); }
      else if (game.phase === 'race') {
        var rp = KR.race.phase;
        if (game.autoplay.on) inp = autoInput();
        if (!inp) inp = { steer: (held.right ? 1 : 0) - (held.left ? 1 : 0), throttle: held.gas || (touchUI && !held.brake) ? 1 : 0, brake: held.brake ? 1 : 0, drift: !!held.drift };
        if (rp === 'finished' && game.finishAt != null) {
          if (game.time - game.finishAt > 1600 && KR.cam.mode !== 'orbit') KR.setCamera('orbit', { target: 'player', side: W >= 900 ? 4.5 : 0 });   // the results panel sits right on wide screens
          if (game.time - game.finishAt > 3600) { scoreRace(); setPhase('results'); }
        }
      } else if (game.phase === 'results') { if (game.autoplay.on && since > 4200 && game.raceIndex + 1 < TRACKS.length) handleKey('ok'); else if (game.autoplay.on && since > 4200) handleKey('ok'); }
      KR.step(inp, DT);
      game.worldFrame++; game.clock.worldFrame = game.worldFrame;
      each('onStep', { dt: DT, t: game.time, frame: game.worldFrame });
    }
    each('update', { dt: hold ? 0 : DT * 1000, frozen: !!OPT.freeze, paused: game.clock.paused, t: game.time });
    game.toasts = game.toasts.filter(function (t) { return t.until > game.time; });
    // toasts glide to their slot (never jump a row in one frame when the one above leaves)
    game.toasts.forEach(function (t, i) { var want = i * 42; t.y = t.y == null ? want : t.y + (want - t.y) * 0.2; });
  }

  // ======================================================================= 8. Drawing (3D render, then the 2D overlay in CSS px)
  var dpr = 1, W = 1, H = 1;
  function resize() {
    var r = glCanvas.parentNode.getBoundingClientRect(); W = Math.max(1, r.width | 0); H = Math.max(1, r.height | 0);
    dpr = Math.min(window.devicePixelRatio || 1, OPT.dpr); ui.width = Math.round(W * dpr); ui.height = Math.round(H * dpr);
    if (KR.ok) KR.resize(W, H); else { glCanvas.width = ui.width; glCanvas.height = ui.height; }
  }
  addEventListener('resize', resize);
  var FONT = "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif";
  function rr(x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
  function panel(x, y, w, h, r, a) {
    g.save(); g.globalAlpha = a == null ? 1 : a; rr(x, y, w, h, r);
    var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(24,30,62,0.9)'); gr.addColorStop(1, 'rgba(12,16,36,0.93)'); g.fillStyle = gr; g.fill();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,214,90,0.75)'; g.stroke(); g.restore();
  }
  function slanted(txt, x, y, px, c1, c2, align) {
    g.save(); g.translate(x, y); g.transform(1, 0, -0.16, 1, 0, 0); g.font = 'italic 900 ' + px + 'px ' + FONT; g.textAlign = align || 'center';
    g.lineJoin = 'round'; g.lineWidth = Math.max(4, px * 0.13); g.strokeStyle = 'rgba(16,14,36,0.92)'; g.strokeText(txt, 0, 0);
    var gr = g.createLinearGradient(0, -px * 0.8, 0, 0); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillText(txt, 0, 0);
    var w = g.measureText(txt).width; g.restore(); return w;
  }
  var rects = [];
  function note(name, x, y, w, h) { rects.push({ name: name, x: x, y: y, w: w, h: h }); }
  function titleScreen() {
    var gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(10,16,40,0.6)'); gr.addColorStop(0.45, 'rgba(10,16,40,0.05)'); gr.addColorStop(1, 'rgba(10,16,40,0.6)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    var big = Math.max(34, Math.min(84, W / 11)), ty = H * 0.26;
    var tw = slanted(TEXT.title, W / 2, ty, big, '#fff3a8', '#ff9a2e'); note('title', W / 2 - tw / 2, ty - big * 0.85, tw, big);
    g.font = '700 ' + Math.max(15, big * 0.26) + 'px ' + FONT; g.fillStyle = '#f4f2ea'; g.textAlign = 'center'; g.fillText(TEXT.sub, W / 2, ty + big * 0.55);
    // the cup's tracks as chips
    var cw = Math.min(200, (W - 40) / TRACKS.length - 10), cx0 = W / 2 - (TRACKS.length * (cw + 10) - 10) / 2, cy = ty + big * 0.85;
    TRACKS.forEach(function (t, i) { panel(cx0 + i * (cw + 10), cy, cw, 30, 15, 0.92); g.font = '700 13px ' + FONT; g.fillStyle = '#ffd25a'; g.textAlign = 'center'; g.fillText((i + 1) + '. ' + t.name, cx0 + i * (cw + 10) + cw / 2, cy + 20); note('chip' + i, cx0 + i * (cw + 10), cy, cw, 30); });
    if (Math.floor(game.time / 600) % 2 === 0) { g.font = '800 18px ' + FONT; g.fillStyle = '#ffe6a0'; g.textAlign = 'center'; g.fillText(touchUI ? TEXT.startTouch : TEXT.start, W / 2, H * 0.8); }
    g.font = '13px ' + FONT; g.fillStyle = 'rgba(244,242,234,0.9)'; g.textAlign = 'center';
    var help = touchUI ? 'Auto gas   < > steer   DRIFT: hold in a turn, release to boost' : 'Up: gas   Down: brake   Left / Right: steer   Space: drift (hold in a turn, release to boost)';
    // wrap the controls hint into as many centred lines as the width needs (never clipped at the edges)
    var parts = help.split('   '), lines = [], cur = '';
    parts.forEach(function (p) { var t = cur ? cur + '   ' + p : p; if (g.measureText(t).width > W - 28 && cur) { lines.push(cur); cur = p; } else cur = t; }); if (cur) lines.push(cur);
    lines.forEach(function (l, i) { var lw = g.measureText(l).width, ly = H * 0.8 + 26 + i * 18; g.fillText(l, W / 2, ly); note('help' + i, W / 2 - lw / 2, ly - 14, lw, 18); });
  }
  function introCard() {
    var t = TRACKS[game.raceIndex], k = Math.min(1, (game.time - game.phaseAt) / 300), w = Math.min(460, W - 32), h = 112, x = W / 2 - w / 2, y = H * 0.16;
    g.save(); g.globalAlpha = k; panel(x, y, w, h, 16, 1);
    g.font = '700 12px ' + FONT; g.fillStyle = '#ffd25a'; g.textAlign = 'center'; g.fillText('RACE ' + (game.raceIndex + 1) + ' OF ' + TRACKS.length, W / 2, y + 26);
    var tw = slanted(t.name.toUpperCase(), W / 2, y + 66, Math.min(40, (w - 30) / Math.max(6, t.name.length) * 1.7), '#ffffff', '#ffd25a');
    g.font = '600 13px ' + FONT; g.fillStyle = '#c8d0e8'; g.fillText(KR.race.laps + ' laps  -  ' + KR.karts().length + ' racers  -  ' + Math.round(KR.T.L) + ' m', W / 2, y + 92);
    g.restore(); note('intro', x, y, w, h);
  }
  function resultsPanel(rows, title, sub, pointsKey) {
    var n = rows.length, rowH = W < 560 ? 30 : 34, w = Math.min(520, W - 24), h = 92 + n * rowH + 40, x = W >= 900 ? W - w - 28 : W / 2 - w / 2, y = W < 560 || H > W ? Math.max(12, H - h - 16) : Math.max(12, H / 2 - h / 2);   // beside (wide) or under (phone) the karts, never over them
    var k = Math.min(1, (game.time - game.phaseAt) / 350); g.save(); g.globalAlpha = k; panel(x, y, w, h, 16, 1);
    slanted(title, x + w / 2, y + 44, W < 560 ? 26 : 32, '#fff3a8', '#ffb92e'); g.font = '600 13px ' + FONT; g.fillStyle = '#c8d0e8'; g.textAlign = 'center'; g.fillText(sub, x + w / 2, y + 68);
    rows.forEach(function (r, i) {
      var ry = y + 84 + i * rowH; if (r.player) { rr(x + 10, ry, w - 20, rowH - 4, 8); g.fillStyle = 'rgba(255,214,90,0.18)'; g.fill(); }
      g.font = 'italic 900 ' + (rowH * 0.6 | 0) + 'px ' + FONT; g.textAlign = 'left'; g.fillStyle = i === 0 ? '#ffd25a' : i === 1 ? '#e0e8f4' : i === 2 ? '#e8a46a' : '#a8b4d0'; g.fillText((i + 1) + KR.ordinal(i + 1), x + 20, ry + rowH * 0.68);
      g.beginPath(); g.arc(x + 76, ry + rowH / 2 - 2, 7, 0, Math.PI * 2); g.fillStyle = r.color; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke();
      g.font = (r.player ? '800 ' : '600 ') + '15px ' + FONT; g.fillStyle = '#f4f2ea'; g.fillText(r.name + (r.player ? '  (you)' : ''), x + 92, ry + rowH * 0.66);
      g.textAlign = 'right'; g.font = '700 14px ' + FONT;
      if (pointsKey) { g.fillStyle = '#ffd25a'; g.fillText(r.points + ' pts', x + w - 22, ry + rowH * 0.66); }
      else { g.fillStyle = r.est ? '#a8b4d0' : '#f4f2ea'; g.fillText((r.est ? '~' : '') + KR.fmtTime(r.ms), x + w - 86, ry + rowH * 0.66); g.fillStyle = '#ffd25a'; g.fillText('+' + r.points, x + w - 22, ry + rowH * 0.66); }
    });
    if (Math.floor(game.time / 600) % 2 === 0) { g.font = '800 14px ' + FONT; g.textAlign = 'center'; g.fillStyle = '#ffe6a0'; g.fillText(touchUI ? 'Tap to continue' : 'Press Enter to continue', x + w / 2, y + h - 16); }
    g.restore(); note('results', x, y, w, h);
  }
  function toasts() {
    var phone = W < 560, y0 = phone ? 150 : 22;
    game.toasts.forEach(function (t, i) {
      var a = Math.min(1, (t.until - game.time) / 200, (game.time - t.at) / 120 + 0.2); if (a <= 0.05) return;
      g.font = '800 15px ' + FONT; var w = g.measureText(t.text).width + 36, y = y0 + (t.y == null ? i * 42 : t.y);
      panel(W / 2 - w / 2, y, w, 34, 17, a); g.globalAlpha = a; g.fillStyle = t.color; g.textAlign = 'center'; g.fillText(t.text, W / 2, y + 22); g.globalAlpha = 1;
      note('toast' + i, W / 2 - w / 2, y, w, 34);
    });
  }
  function touchControls() {
    if (!touchUI || game.phase !== 'race') return;
    touchButtons().forEach(function (b) {
      var on = held[b.key]; g.save(); g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fillStyle = on ? 'rgba(255,214,90,0.85)' : 'rgba(16,22,48,0.55)'; g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(255,214,90,0.8)'; g.stroke(); g.fillStyle = on ? '#1c1c30' : '#f4f2ea'; g.textAlign = 'center';
      if (b.label.length === 1) { g.beginPath(); var d = b.key === 'left' ? -1 : 1; g.moveTo(b.x + d * b.r * 0.38, b.y); g.lineTo(b.x - d * b.r * 0.22, b.y - b.r * 0.36); g.lineTo(b.x - d * b.r * 0.22, b.y + b.r * 0.36); g.closePath(); g.fill(); }
      else { g.font = '800 ' + Math.round(b.r * 0.32) + 'px ' + FONT; g.fillText(b.label, b.x, b.y + b.r * 0.12); }
      g.restore(); note('btn-' + b.key, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    });
  }
  // GAME.uiRects(): the rects of THIS frame. When nothing was drawn since the last step (fast-forward, before the first
  // draw), the overlay layout is run on a 1x1 scratch context so addons always get current rects.
  var rectsFrame = -1, scratch = null;
  game.uiRects = function () {
    if (rectsFrame !== game.frame && KR.ok) {
      var keep = g; scratch = scratch || document.createElement('canvas').getContext('2d'); g = scratch; rects = [];
      try { overlay(); } catch (e) { console.error(e); } g = keep; rectsFrame = game.frame;
    }
    return rects.slice();
  };
  function overlay() {
    if (game.phase === 'title') titleScreen();
    else if (game.flags.builtinHud) {
      if (game.phase === 'race') KR.drawHud(g, W, H, { touch: touchUI }).forEach(function (r) { rects.push(r); });
      if (game.phase === 'intro') introCard();
      if (game.phase === 'results') resultsPanel(game.lastResults || [], TRACKS[game.raceIndex].name.toUpperCase(), 'Race ' + (game.raceIndex + 1) + ' of ' + TRACKS.length + ' results', false);
      if (game.phase === 'cup') { var t = game.table(); resultsPanel(t, game.cupPlace === 1 ? 'CUP CHAMPION!' : 'CUP COMPLETE', 'Final standings  -  you placed ' + game.cupPlace + KR.ordinal(game.cupPlace), true); }
      touchControls();
    }
    toasts();
  }
  function draw() {
    if (!KR.ok) { KR.drawFallback && KR.drawFallback(); return; }
    KR.render();
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); rects = [];
    each('draw', g, 'world');
    overlay(); rectsFrame = game.frame;
    if (game.clock.paused) { g.fillStyle = 'rgba(10,14,28,0.5)'; g.fillRect(0, 0, W, H); slanted('PAUSED', W / 2, H / 2, 40, '#ffffff', '#ffd25a'); }
    each('draw', g, 'hud');
    each('draw', g, 'overlay');
  }

  // ======================================================================= 9. Boot (called after the ADDONS SLOT)
  window.__state = function () {
    var s = KR.state(); s.phase = game.phase; s.racePhase = KR.race.phase; s.race = game.raceIndex; s.races = TRACKS.length; s.autoplay = game.autoplay.on;
    s.standings = game.table().map(function (r) { return r.id + ':' + r.points; }).join(' '); s.cupPlace = game.cupPlace || null;
    return s;
  };
  game.state = window.__state;
  window.__advance = function (ms) { var n = Math.round(ms / (DT * 1000)); for (var i = 0; i < n; i++) step(); draw(); return window.__state(); };
  game.boot = function () {
    game.shipped = game.shipped || { tracks: ['meadow', 'canyon'], karts: ['rook', 'wren', 'juno', 'bram', 'tilly', 'odo'] };
    resize();
    if (KR.ok) { KR.startRace({ track: TRACKS[OPT.race | 0] || TRACKS[0], karts: ROSTER.map(function (r) { return { id: r.player ? 'player' : r.id, def: r, name: r.name, player: !!r.player }; }), seed: OPT.seed }); KR.setCamera('grid'); KR.snapCamera(); }
    each('init');
    if (KR.ok) KR.precompile();
    if (!KR.ok) { draw(); window.__frozen = true; return; }
    if (OPT.t != null) {
      var n = Math.round(OPT.t / (DT * 1000)); for (var i = 0; i < n; i++) step();
      draw(); document.documentElement.setAttribute('data-state', JSON.stringify({ phase: game.phase, race: game.raceIndex, t: Math.round(game.time) }));
      if (OPT.freeze) { window.__frozen = true; return; }
    }
    var acc = 0, last = performance.now();
    (function loop(now) {
      acc += Math.min(100, now - last); last = now; var n2 = 0;
      while (acc >= DT * 1000 && n2 < 5) { step(); acc -= DT * 1000; n2++; }
      draw(); requestAnimationFrame(loop);
    })(last);
  };
  // the ids the starter ships with, recorded BEFORE the ADDONS SLOT runs (a probe compares against them)
  game.shipped = { tracks: TRACKS.map(function (t) { return t.id; }), karts: ROSTER.map(function (r) { return r.id; }) };
})();
