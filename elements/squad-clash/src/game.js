/* Banners of the Vale: the A-14 squad-clash starter. A complete game built on GameDNA_SquadClash.
   Your squad of five marches through four clashes. Before each clash you arrange the 2x3 formation, pick each unit's
   tactic preset and read the forecast (the same simulation the clash will run); then you commit and watch it play out.
   Search for the "=== n." banners: config and content, the game object (extension points), clash setup, the hit site,
   scenes, the autoplay planner, the main tick, drawing, input, boot. */
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
  var ROUNDS = Math.max(1, Math.min(6, +qs.get('rounds') || 3));
  var REDUCED = qs.get('reduced') === '1' || (!!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Classes: base stats at level 1, the skills they know, traits. Skills are the module's SKILLS (see SKILLS below to add).
  var CLASSES = {
    knight:   { hp: 54, atk: 14, def: 11, mag: 2,  res: 5,  spd: 6,  skills: ['strike', 'cleave'], guard: true, role: 'Guards weak allies' },
    lancer:   { hp: 44, atk: 15, def: 7,  mag: 2,  res: 4,  spd: 10, skills: ['thrust'], followUp: 'lunge', role: 'Reaches from any row, follows up' },
    archer:   { hp: 36, atk: 13, def: 5,  mag: 3,  res: 6,  spd: 12, skills: ['shoot', 'pierce'], followUp: 'chase', role: 'Hits any row, x1.5 vs flyers' },
    mage:     { hp: 32, atk: 4,  def: 4,  mag: 15, res: 10, spd: 8,  skills: ['bolt', 'blaze'], role: 'Spells hit a whole row' },
    cleric:   { hp: 34, atk: 5,  def: 5,  mag: 12, res: 11, spd: 7,  skills: ['mend', 'bolt'], role: 'Heals by rule' },
    brigand:  { hp: 40, atk: 13, def: 6,  mag: 0,  res: 3,  spd: 8,  skills: ['strike'] },
    slinger:  { hp: 30, atk: 11, def: 4,  mag: 0,  res: 4,  spd: 11, skills: ['shoot'] },
    hound:    { hp: 30, atk: 12, def: 4,  mag: 0,  res: 3,  spd: 14, skills: ['bite'], followUp: 'lunge' },
    raptor:   { hp: 34, atk: 12, def: 5,  mag: 0,  res: 5,  spd: 13, skills: ['bite'], tags: ['flying'] },
    ironclad: { hp: 56, atk: 14, def: 13, mag: 0,  res: 3,  spd: 4,  skills: ['strike'], tags: ['armored'], guard: true },
    hexer:    { hp: 30, atk: 3,  def: 4,  mag: 14, res: 9,  spd: 7,  skills: ['hex', 'blaze'] },
    mender:   { hp: 32, atk: 4,  def: 5,  mag: 11, res: 10, spd: 6,  skills: ['mend', 'hex'] },
    warlord:  { hp: 78, atk: 18, def: 12, mag: 4,  res: 6,  spd: 9,  skills: ['strike', 'cleave'], tags: ['armored'], guard: true }
  };
  // Skills: the module's defaults plus anything added here (same shape: kind melee|ranged|magic|heal, power, from, area, uses, follow).
  var SKILLS = {};
  // Tactic presets per class: ordered "condition -> action" rules (module CONDITIONS). The first preset is the default.
  var PRESETS = GameDNA_SquadClash.PRESETS;
  var PRESET_OF = { knight: 'knight', lancer: 'lancer', archer: 'archer', mage: 'mage', cleric: 'cleric', brigand: 'knight', slinger: 'archer', hound: 'lancer', raptor: 'lancer', ironclad: 'knight', hexer: 'mage', mender: 'cleric', warlord: 'knight' };
  // Your squad: slot 0-2 = front row (columns top to bottom), 3-5 = back row.
  var PARTY = [
    { id: 'bryn', name: 'Bryn', cls: 'knight', slot: 1 },
    { id: 'kael', name: 'Kael', cls: 'lancer', slot: 0 },
    { id: 'wren', name: 'Wren', cls: 'archer', slot: 2 },
    { id: 'sola', name: 'Sola', cls: 'mage', slot: 4 },
    { id: 'ilsa', name: 'Ilsa', cls: 'cleric', slot: 5 }
  ];
  // The march: four enemy squads, one clash each (a lost or drawn clash is fought again after a rest).
  var CAMPAIGN = [
    { name: 'Roadside Brigands', theme: 'dawn', level: 1, units: [['brigand', 0], ['hound', 1], ['brigand', 2], ['slinger', 4]] },
    { name: 'Sky Raiders', theme: 'day', level: 2, units: [['raptor', 0], ['brigand', 1], ['raptor', 2], ['slinger', 3], ['slinger', 5]] },
    { name: 'Iron Column', theme: 'dusk', level: 3, units: [['ironclad', 0], ['ironclad', 2], ['hound', 1], ['hexer', 4], ['mender', 5]] },
    { name: "Warlord's Guard", theme: 'night', level: 4, units: [['ironclad', 0], ['warlord', 1], ['raptor', 2], ['hexer', 3], ['mender', 5]] }
  ];
  var MORALE = 3, REST = 0.35, REVIVE = 0.25;

  function makeUnit(cls, level, base) {
    var c = CLASSES[cls], lv = level - 1;
    var u = { cls: cls, level: level, maxHp: c.hp + lv * 5, atk: c.atk + lv, def: c.def + Math.floor(lv * 0.6), mag: c.mag + lv, res: c.res + Math.floor(lv * 0.6), spd: c.spd,
      tags: (c.tags || []).slice(), skills: c.skills.slice(), guard: !!c.guard, followUp: c.followUp || null, preset: 0 };
    for (var k in base) u[k] = base[k];
    u.hp = u.maxHp; u.row = u.slot >= 3 ? 'back' : 'front'; u.col = u.slot % 3;
    applyPreset(u, u.preset);
    return u;
  }
  function presetsOf(u) { return PRESETS[PRESET_OF[u.cls] || u.cls] || []; }
  function applyPreset(u, i) { var list = presetsOf(u); if (!list.length) { u.rules = []; u.presetName = 'Default'; return; } u.preset = ((i % list.length) + list.length) % list.length; u.rules = JSON.parse(JSON.stringify(list[u.preset].rules)); u.presetName = list[u.preset].name; }
  function levelUp(u) { u.level++; u.maxHp += 5; u.atk++; u.mag++; if (u.level % 2) { u.def++; u.res++; } }

  /* =================================================================================================
     === 2. Game object: the public surface and the extension points (see README) ======================= */
  var canvas = document.getElementById('screen'), g = canvas.getContext('2d');
  var game = {
    W: W, H: H, addons: [], waitFor: [], drawUnit: null, drawHead: null, flags: { builtinNumbers: true, builtinShake: true, builtinFlash: true },
    scene: 'title', clash: 0, morale: MORALE, squad: [], enemy: [], enemyName: '', theme: 'dawn', C: null, lastForecast: null, lastOutcome: null, results: [],
    clock: { frame: 0, clashFrame: 0, paused: false, stop: 0 },
    autoplay: { on: AUTO, plan: null },
    classes: CLASSES, skills: SKILLS, presets: PRESETS, presetOf: PRESET_OF, campaign: CAMPAIGN, party: PARTY,
    anchor: function (id) { return game.C ? game.C.anchor(id) : null; },
    unitRects: function () { return game.C ? game.C.unitRects() : []; },
    fieldRect: function () { return { x: 0, y: 0, w: W, h: H }; },
    uiRects: function () { return (game.C ? game.C.uiRects() : []).concat(hudRects.slice()); },
    shake: function (px, frames) { if (REDUCED) return; fxState.shake = Math.max(fxState.shake, frames | 0); fxState.shakePx = Math.max(fxState.shakeFrames > 0 ? fxState.shakePx : 0, px); fxState.shakeFrames = fxState.shake; },
    flash: function (color, frames, alpha) { if (REDUCED) return; fxState.flash = { color: color || '#ffffff', n: frames | 0 || 6, t: 0, a: alpha == null ? 0.3 : alpha }; },
    hitStop: function (f) { var n = typeof f === 'object' && f ? Math.ceil((f.ms || 0) * 60 / 1000) : f | 0; game.clock.stop = Math.max(game.clock.stop, n); },
    hitStopMs: function (ms) { game.hitStop({ ms: ms }); },
    pause: function (on) { game.clock.paused = !!on; },
    forecast: function () { return game.C ? game.C.forecast() : null; },
    state: function () {
      var o = game.lastOutcome;
      return { scene: game.scene, clash: game.clash, morale: game.morale, frame: game.clock.frame, phase: game.C ? game.C.phase() : null,
        results: game.results.slice(), match: o ? o.match : null, matches: game.results.filter(function (r) { return r.match; }).length,
        squad: game.squad.map(function (u) { return u.id + ':' + u.hp + '/' + u.maxHp + '@' + u.slot; }).join(' '),
        forecast: game.lastForecast ? game.lastForecast.result : null, auto: game.autoplay.on };
    }
  };
  window.GAME = game;
  function each(hook, args) {
    var out = false;
    game.addons.forEach(function (a) { if (!a || typeof a[hook] !== 'function') return; try { if (a[hook].apply(a, args) === true) out = true; } catch (e) { console.error('addon ' + (a.name || '?') + '.' + hook + ': ' + e.message); } });
    return out;
  }
  var fxState = { shake: 0, shakePx: 0, shakeFrames: 0, flash: null };
  var hudRects = [];

  /* =================================================================================================
     === 3. Clash setup: one GameDNA_SquadClash instance for the whole game ============================= */
  function newGame() {
    game.squad = PARTY.map(function (p) { return makeUnit(p.cls, 1, { id: p.id, name: p.name, slot: p.slot }); });
    game.clash = 0; game.morale = MORALE; game.results = []; game.lastOutcome = null; game.lastForecast = null;
    loadEnemy();
  }
  function loadEnemy() {
    var E = CAMPAIGN[game.clash];
    game.enemyName = E.name; game.theme = E.theme;
    game.enemy = E.units.map(function (d, i) { return makeUnit(d[0], E.level, { id: 'e' + game.clash + '-' + i + '-' + d[0], name: d[0].charAt(0).toUpperCase() + d[0].slice(1), slot: d[1] }); });
  }
  function clashSeed() { return (SEED * 1000003 + game.clash * 7919 + game.results.length * 104729) >>> 0; }
  function makeInstance() {
    game.C = GameDNA_SquadClash.create({
      view: { x: 0, y: 0, w: W, h: H }, seed: clashSeed(), skills: SKILLS,
      params: { rounds: ROUNDS, speed: SPEED, numbers: game.flags.builtinNumbers ? 'on' : 'off' },
      drawBackground: function (ctx, v, t) { ART.backdrop(ctx, v, t, game.theme); return true; },
      // painted units and heads from the art pack (art/); an addon's drawUnit / drawHead goes first, the module's
      // built-in painter is the fallback when a class has no art (or with ?art=0)
      looks: ART.looks(), layout: ART.layout(),
      drawUnit: function (ctx, u, info) { return (typeof game.drawUnit === 'function' && game.drawUnit(ctx, u, info) === true) || each('drawUnit', [ctx, u, info, game]) || ART.drawUnit(ctx, u, info); },
      drawHead: function (ctx, u, x, y, r, info) { return (typeof game.drawHead === 'function' && game.drawHead(ctx, u, x, y, r, info) === true) || each('drawHead', [ctx, u, x, y, r, info, game]) || ART.drawHead(ctx, u, x, y, r, info); },
      onHit: function (ev) { hitSite(ev); },
      onShake: function (px, ms) { if (game.flags.builtinShake) game.shake(px, Math.round(ms * 60 / 1000)); },
      onEvent: function (ev) { each('onEvent', [ev, game]); if (ev.kind === 'round') each('onTurn', [ev.round, game]); },
      onPhase: function (p) { each('onPhase', [p, game]); },
      onForecast: function (fc) { each('onForecast', [fc, game]); },
      onEnd: function (result, outcome) { endClash(result, outcome); },
      whyRect: function (w, h) { return { x: 12, y: H - h - 10 }; }
    });
  }
  function toPrep() {
    game.C.setSeed(clashSeed());
    game.C.setSquads(game.squad, game.enemy);
    game.lastForecast = game.C.forecast();
    prep.cursor = 'engage'; prep.pick = null; prep.t = 0; prep.keys = null;
    setScene('prep');
  }
  function commit() {
    game.lastForecast = game.C.forecast();
    game.C.commit();
    game.clock.clashFrame = 0;
    setScene('clash');
    each('onClashStart', [game]); each('onBattleStart', [game]);
  }
  function endClash(result, outcome) {
    game.lastOutcome = outcome;
    game.results.push({ clash: game.clash, result: result, match: outcome.match, forecast: outcome.forecastResult });
    each('onClashEnd', [result, outcome, game]); each('onBattleEnd', [result, game]);
    setScene('result');
  }
  function afterResult() {
    var o = game.lastOutcome;
    if (o.result === 'lose') game.morale--;
    if (game.morale <= 0) { setScene('defeat'); return; }
    if (o.result === 'win') { game.clash++; game.squad.forEach(levelUp); }
    if (game.clash >= CAMPAIGN.length) { setScene('victory'); return; }
    // camp: rest between clashes (fallen units get back up)
    game.squad.forEach(function (u) { u.hp = u.hp > 0 ? Math.min(u.maxHp, u.hp + Math.round(u.maxHp * REST)) : Math.round(u.maxHp * REVIVE); });
    if (o.result === 'win') loadEnemy(); else game.theme = CAMPAIGN[game.clash].theme;
    toPrep();
  }

  /* =================================================================================================
     === 4. Hit site: every HP change of a clash arrives here, on its impact frame =======================
     The amounts come from the forecast's simulation, so they are read-only: change outcomes through units,
     skills and rules (section 1), never here, or the clash would no longer match its forecast. */
  function hitSite(ev) {
    if (ev.crit && ev.kind === 'damage' && game.flags.builtinFlash) game.flash('#ffffff', 5, 0.18);
    each('onHit', [ev, game]);
  }

  /* =================================================================================================
     === 5. Scenes: title, prep (formation + tactics + forecast), clash, result, victory, defeat ======== */
  var sceneT = 0;
  var prep = { cursor: 'engage', pick: null, t: 0, keys: null };
  function setScene(s) { game.scene = s; sceneT = 0; if (s === 'title' && game.C) { game.theme = 'dusk'; game.C.setSquads(titleSquads.a, titleSquads.b); } each('onScene', [s, game]); }
  var SLOTS = [0, 1, 2, 3, 4, 5];
  function unitAt(slot) { for (var i = 0; i < game.squad.length; i++) if (game.squad[i].slot === slot) return game.squad[i]; return null; }
  function placeAll() { game.squad.forEach(function (u) { u.row = u.slot >= 3 ? 'back' : 'front'; u.col = u.slot % 3; }); }
  function swapSlots(a, b) { var ua = unitAt(a), ub = unitAt(b); if (ua) ua.slot = b; if (ub) ub.slot = a; placeAll(); game.lastForecast = game.C.forecast(); each('onFormation', [game]); }
  function cyclePreset(u) { applyPreset(u, u.preset + 1); game.lastForecast = game.C.forecast(); each('onTactics', [u, game]); }
  function prepKey(k) {
    var c = prep.cursor;
    if (k && k.tap) { prepTap(k.x, k.y); return; }
    if (k === 'tactic') { var u0 = c === 'engage' ? null : unitAt(c); if (u0) cyclePreset(u0); return; }
    if (c === 'engage') {
      if (k === 'ok') { if (prep.pick !== null) { prep.pick = null; return; } commit(); return; }   // holding a unit: Z here only drops it back
      if (k === 'back') prep.pick = null;
      if (k === 'left' || k === 'up') prep.cursor = 1;
      return;
    }
    var row = c >= 3 ? 1 : 0, col = c % 3;
    if (k === 'up') { if (col > 0) prep.cursor = row * 3 + col - 1; }
    else if (k === 'down') { if (col < 2) prep.cursor = row * 3 + col + 1; else prep.cursor = 'engage'; }
    else if (k === 'left') { if (row === 0) prep.cursor = 3 + col; }
    else if (k === 'right') { if (row === 1) prep.cursor = col; else if (prep.pick === null) prep.cursor = 'engage'; }   // never jump to ENGAGE mid-swap
    else if (k === 'ok') { if (prep.pick === null) prep.pick = c; else { if (prep.pick !== c) swapSlots(prep.pick, c); prep.pick = null; } }
    else if (k === 'back') prep.pick = null;
  }
  function prepTap(x, y) {
    if (inR(BTN.engage, x, y)) { prep.cursor = 'engage'; if (prep.pick !== null) { prep.pick = null; return; } commit(); return; }
    if (inR(BTN.tactic, x, y)) { var u = prep.cursor !== 'engage' ? unitAt(prep.cursor) : null; if (u) cyclePreset(u); return; }
    for (var i = 0; i < 6; i++) { var r = slotBox(i); if (inR(r, x, y)) { prep.cursor = i; prepKey('ok'); return; } }
  }
  function inR(r, x, y) { return r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }
  function slotBox(i) { var s = game.C.slotRect('a', i >= 3 ? 'back' : 'front', i % 3); return { x: s.cx - 26 * s.s, y: s.cy - 62 * s.s, w: 52 * s.s, h: 70 * s.s }; }
  function sceneOk() {
    if (game.scene === 'title') { newGame(); toPrep(); each('onNewGame', [game]); }
    else if (game.scene === 'result' && sceneT > 40) afterResult();
    else if ((game.scene === 'victory' || game.scene === 'defeat') && sceneT > 50) setScene('title');
  }

  /* =================================================================================================
     === 6. Autoplay planner: tries swaps and tactic presets against the forecast, then presses the keys ==
     GAME.autoplay.plan = function (game) { return [keys] } replaces it (keys: up/down/left/right/ok/tactic). */
  function score(fc) { var a = fc.totals.a, b = fc.totals.b; return ({ win: 1000, draw: 300, lose: 0 })[fc.result] + 400 * a.after / Math.max(1, a.max) - 200 * b.after / Math.max(1, b.max) - 60 * a.fall; }
  function trial() { return GameDNA_SquadClash.simulate(game.squad, game.enemy, { seed: game.C.seed(), rounds: ROUNDS, skills: Object.assign({}, GameDNA_SquadClash.SKILLS, SKILLS) }); }
  function planMoves() {
    var moves = [], best = score(trial());
    for (var iter = 0; iter < 3; iter++) {
      var pick = null;
      for (var a = 0; a < 6; a++) for (var b = a + 1; b < 6; b++) {
        if (!unitAt(a) && !unitAt(b)) continue;
        var ua = unitAt(a), ub = unitAt(b); if (ua) ua.slot = b; if (ub) ub.slot = a; placeAll();
        var sc = score(trial()); if (sc > best + 1) { best = sc; pick = { swap: [a, b] }; }
        if (ua) ua.slot = a; if (ub) ub.slot = b; placeAll();
      }
      game.squad.forEach(function (u) {
        var n = presetsOf(u).length, p0 = u.preset;
        for (var k = 1; k < n; k++) { applyPreset(u, p0 + k); var s2 = score(trial()); if (s2 > best + 1) { best = s2; pick = { unit: u.id, presses: k }; } }
        applyPreset(u, p0);
      });
      if (!pick) break;
      if (pick.swap) { var x = unitAt(pick.swap[0]), y = unitAt(pick.swap[1]); if (x) x.slot = pick.swap[1]; if (y) y.slot = pick.swap[0]; placeAll(); }
      else { var uu = game.squad.filter(function (q) { return q.id === pick.unit; })[0]; applyPreset(uu, uu.preset + pick.presses); }
      moves.push(pick);
    }
    // undo: the moves are replayed through the real keys so the player sees them happen
    for (var m = moves.length - 1; m >= 0; m--) {
      var mv = moves[m];
      if (mv.swap) { var p = unitAt(mv.swap[0]), q = unitAt(mv.swap[1]); if (p) p.slot = mv.swap[1]; if (q) q.slot = mv.swap[0]; placeAll(); }
      else { var u2 = game.squad.filter(function (q2) { return q2.id === mv.unit; })[0]; applyPreset(u2, u2.preset - mv.presses); }
    }
    var keys = [], cur = prep.cursor;
    function go(to) { keys.push.apply(keys, path(cur, to)); cur = to; }
    moves.forEach(function (mv) {
      if (mv.swap) { go(mv.swap[0]); keys.push('ok'); go(mv.swap[1]); keys.push('ok'); }
      else { var s = game.squad.filter(function (q3) { return q3.id === mv.unit; })[0].slot; go(s); for (var i = 0; i < mv.presses; i++) keys.push('tactic'); }
    });
    go('engage'); keys.push('ok');
    return keys;
  }
  function path(from, to) {
    var out = [], c = from, n = 0;
    while (c !== to && n++ < 12) {
      var k;
      if (c === 'engage') k = 'left';
      else if (to === 'engage') k = (c % 3 === 2) ? 'down' : 'right';
      else { var r0 = c >= 3 ? 1 : 0, r1 = to >= 3 ? 1 : 0; k = r0 !== r1 ? (r1 ? 'left' : 'right') : (to % 3 > c % 3 ? 'down' : 'up'); if (r0 === 0 && r1 === 0 && c % 3 === to % 3) break; }
      out.push(k); c = sim(c, k);
    }
    return out;
  }
  function sim(c, k) {
    if (c === 'engage') return k === 'left' || k === 'up' ? 1 : c;
    var row = c >= 3 ? 1 : 0, col = c % 3;
    if (k === 'up') return col > 0 ? row * 3 + col - 1 : c;
    if (k === 'down') return col < 2 ? row * 3 + col + 1 : 'engage';
    if (k === 'left') return row === 0 ? 3 + col : c;
    if (k === 'right') return row === 1 ? col : 'engage';
    return c;
  }
  function sceneAuto() {
    if (!game.autoplay.on) return;
    if (game.scene === 'title' && sceneT === 60) sceneOk();
    if (game.scene === 'prep') {
      if (sceneT === 40 && !prep.keys) { var custom = null; if (typeof game.autoplay.plan === 'function') try { custom = game.autoplay.plan(game); } catch (e) { console.error(e); } prep.keys = custom || planMoves(); }
      if (prep.keys && sceneT > 50 && sceneT % 9 === 0 && prep.keys.length) prepKey(prep.keys.shift());
    }
    if (game.scene === 'result' && sceneT === 150) sceneOk();
    if ((game.scene === 'victory' || game.scene === 'defeat') && sceneT === 600) sceneOk();
  }

  /* =================================================================================================
     === 7. Main tick (60 Hz) ========================================================================== */
  var keyQ = [];
  function tick() {
    var c = game.clock; c.frame++;
    var frozen = c.paused || c.stop > 0;
    if (c.stop > 0) c.stop--;
    var keys = keyQ; keyQ = [];
    keys.forEach(function (k) {
      if (each('onKey', [k, game])) return;
      if (k === 'auto') { game.autoplay.on = !game.autoplay.on; prep.keys = null; if (game.scene === 'prep') sceneT = 0; return; }
      if (game.autoplay.on && !(k && k.tap && game.scene !== 'prep')) { game.autoplay.on = false; prep.keys = null; }
      if (game.scene === 'prep') prepKey(k);
      else if (game.scene === 'clash') { if (k === 'ok' || (k && k.tap)) fastOn = !fastOn; }
      else if (k === 'ok' || (k && k.tap)) sceneOk();
    });
    if (!frozen) { sceneT++; prep.t++; }
    if (!frozen) sceneAuto();
    if (game.C) {
      game.C.setParams({ numbers: game.flags.builtinNumbers ? 'on' : 'off', bars: game.scene === 'title' ? 'off' : 'on' });
      game.C.setFast(fastOn || (game.autoplay.on && game.scene === 'clash' && false) ? 3 : 1);
      game.C.update(frozen ? 0 : STEP);
      if (!frozen && game.scene === 'clash') c.clashFrame++;
    }
    if (fxState.shake > 0 && !frozen) fxState.shake--;
    if (fxState.flash && !frozen) { fxState.flash.t++; if (fxState.flash.t >= fxState.flash.n) fxState.flash = null; }
    each('update', [game, { dt: frozen ? 0 : STEP, frozen: frozen, paused: c.paused, hitStop: c.stop }]);
  }
  var fastOn = false;

  /* =================================================================================================
     === 8. Drawing (640x360 logical, devicePixelRatio-aware backing store) ============================== */
  var BTN = { engage: { x: 532, y: 266, w: 100, h: 86 }, tactic: { x: 196, y: 330, w: 108, h: 20 } };
  var FONT = '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, sans-serif';
  function txt(s, x, y, o) { return game.C.text(g, s, x, y, o); }
  function render() {
    g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    g.imageSmoothingEnabled = true;
    hudRects = [];
    var t = game.clock.frame / 60;
    if (!game.C) return;
    g.save();
    if (fxState.shake > 0) { var k = fxState.shake / Math.max(1, fxState.shakeFrames), px = fxState.shakePx * k; g.translate(Math.round(Math.sin(game.clock.frame * 2.1) * px), Math.round(Math.cos(game.clock.frame * 2.9) * px * 0.6)); }
    game.C.drawScene(g);
    if (game.scene === 'prep') drawPrepCursor(t);
    each('draw', [g, 'fx', game]);
    ART.foreground(g, { x: 0, y: 0, w: W, h: H }, t);
    if (fxState.flash) { g.globalAlpha = fxState.flash.a * (1 - fxState.flash.t / fxState.flash.n); g.fillStyle = fxState.flash.color; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    g.restore();
    var endScene = game.scene === 'victory' || game.scene === 'defeat';
    if (game.scene !== 'title' && !endScene) game.C.drawUI(g);
    if (game.scene === 'title') drawTitle(t);
    else if (game.scene === 'prep') drawPrep(t);
    else if (game.scene === 'clash') drawClashHud(t);
    else if (game.scene === 'result') drawResult(t);
    if (game.scene === 'victory' || game.scene === 'defeat') drawEnd(t, game.scene === 'victory');
    if (game.scene !== 'title') drawTopBar(t);
    each('draw', [g, 'overlay', game]);
    each('drawUI', [g, game]);
    infoText();
  }
  // Phone caption: on narrow screens the canvas text is small, so the same facts are mirrored in HTML (13 px) under it
  var infoEl = document.getElementById('info'), infoLast = '';
  function esc(x) { return String(x).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function infoText() {
    if (!infoEl || !game.C) return;
    var h = '', fc = game.lastForecast, W = { win: 'VICTORY', lose: 'DEFEAT', draw: 'DRAW' };
    if (game.scene === 'title') h = '<b>Banners of the Vale</b> <span class="dim">Z or tap to march.</span>';
    else if (game.scene === 'prep') {
      var u = prep.cursor === 'engage' ? null : unitAt(prep.cursor);
      h = '<b>Clash ' + (game.clash + 1) + ' / ' + CAMPAIGN.length + ': ' + esc(game.enemyName) + '</b><br>';
      if (u) h += esc(u.name) + ' <span class="dim">Lv ' + u.level + ' ' + u.cls + ', ' + (u.slot >= 3 ? 'back' : 'front') + ' row, HP ' + u.hp + '/' + u.maxHp + '</span><br>Tactics <b>' + esc(u.presetName) + '</b>: ' +
        u.rules.slice(0, 3).map(function (r, i) { var p = GameDNA_SquadClash.ruleParts(r), sk = game.C.skills[p.use]; return (i + 1) + '. ' + esc(GameDNA_SquadClash.ruleText(r)) + ' → ' + esc(sk ? sk.name : p.use); }).join('; ') + '<br>';
      else h += '<span class="dim">' + (prep.pick !== null ? 'Holding a unit: Z on a slot swaps, X cancels.' : 'Arrows: choose a slot. Z: pick up / swap. T: tactics. ENGAGE: commit.') + '</span><br>';
      if (fc) h += 'Forecast <b class="' + fc.result + '">' + W[fc.result] + '</b> <span class="dim">(ends round ' + fc.endedRound + ')</span> · You ' + fc.totals.a.before + '→' + fc.totals.a.after + (fc.totals.a.fall ? ' ☠' + fc.totals.a.fall : '') + ' · Foe ' + fc.totals.b.before + '→' + fc.totals.b.after + (fc.totals.b.fall ? ' ☠' + fc.totals.b.fall : '');
    } else if (game.scene === 'clash') {
      var w = game.C.why(), cur = game.C.current();
      h = '<b>Clash ' + (game.clash + 1) + '</b>' + (cur && cur.event && cur.event.round ? ' <span class="dim">round ' + cur.event.round + '</span>' : '') + (fc ? ' · forecast <b class="' + fc.result + '">' + W[fc.result] + '</b>' : '') + '<br>' + (w ? esc(w.line1) + '<br><span class="dim">' + esc(w.line2) + '</span>' : '&nbsp;<br>&nbsp;');
    } else if (game.scene === 'result' && game.lastOutcome) {
      var o = game.lastOutcome; h = '<b class="' + o.result + '">' + W[o.result] + '</b> ' + (o.match ? '✔ played exactly as forecast' : '✖ differs from the forecast') + '<br><span class="dim">Z or tap: continue</span>';
    } else if (game.scene === 'victory' || game.scene === 'defeat') {
      h = '<b>' + (game.scene === 'victory' ? 'The vale is held' : 'The march is broken') + '</b> <span class="dim">' + game.results.length + ' clashes, ' + game.results.filter(function (r) { return r.match; }).length + ' played as forecast</span>';
    }
    if (h !== infoLast) { infoLast = h; infoEl.innerHTML = h; }
  }
  var titleSquads = { a: [], b: [] };
  function initTitle() {
    titleSquads.a = PARTY.map(function (p) { return makeUnit(p.cls, 1, { id: 't-' + p.id, name: p.name, slot: p.slot }); });
    titleSquads.b = CAMPAIGN[3].units.map(function (d, i) { return makeUnit(d[0], 4, { id: 't-e' + i, name: d[0], slot: d[1] }); });
  }
  function panelR(x, y, w, h, o) { game.C.panel(g, x, y, w, h, o); hudRects.push({ name: (o && o.name) || 'panel', x: x, y: y, w: w, h: h }); }
  function drawTopBar(t) {
    var title = game.scene === 'victory' || game.scene === 'defeat' ? 'The march is over' : 'Clash ' + (game.clash + 1) + ' / ' + CAMPAIGN.length + ' · ' + game.enemyName;
    if (game.scene === 'victory' || game.scene === 'defeat') { /* the end window says it all */ }
    else if (game.scene === 'clash' || (game.scene === 'result' && game.C.phase() !== 'idle')) {
      // the module's turn-order strip sits at the top centre: keep only the small corners
      panelR(8, 8, 116, 26, { r: 13, alpha: 0.8, name: 'clashTag' }); txt('CLASH ' + (game.clash + 1) + ' / ' + CAMPAIGN.length, 66, 25, { size: 10, weight: 800, align: 'center', color: '#ffe7b0', outline: false });
    } else {
      g.save(); g.font = '800 11px ' + FONT; var tw = Math.ceil(g.measureText(title).width) + 30; g.restore();
      panelR(8, 8, tw, 26, { r: 13, alpha: 0.82, name: 'title' }); txt(title, 23, 25.5, { size: 11, weight: 800, color: '#ffe7b0', outline: false });
    }
    var mx = W - 8 - 84; panelR(mx, 8, 84, 26, { r: 13, alpha: 0.82, name: 'morale' });
    txt('MORALE', mx + 10, 25, { size: 7.5, weight: 800, color: '#bfb3d8', outline: false });
    for (var i = 0; i < MORALE; i++) flag(mx + 48 + i * 11.5, 14, i < game.morale);
  }
  function flag(x, y, on) {
    g.save(); g.strokeStyle = '#1a1220'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 14); g.stroke();
    g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + 10, y + 3); g.lineTo(x + 1, y + 7); g.closePath(); g.fillStyle = on ? '#4a8de0' : '#3a3346'; g.fill(); g.lineWidth = 1; g.stroke(); g.restore();
  }
  function drawPrepCursor(t) {
    for (var i = 0; i < 6; i++) {   // the six slots of your formation on the ground
      var s = game.C.slotRect('a', i >= 3 ? 'back' : 'front', i % 3), cur = prep.cursor === i, pk = prep.pick === i;
      g.save(); g.globalAlpha = cur || pk ? 0.95 : unitAt(i) ? 0.22 : 0.4;
      g.strokeStyle = pk ? '#ffd36a' : cur ? '#ffffff' : '#9fd0ff'; g.lineWidth = (cur || pk ? 2.2 : 1.2) * s.s; g.setLineDash(unitAt(i) || cur || pk ? [] : [4 * s.s, 3 * s.s]);
      g.beginPath(); g.ellipse(s.cx, s.cy, 22 * s.s, 7 * s.s, 0, 0, 7); g.stroke();
      if (cur) {   // the pointer floats above the unit's HP bar (or above the empty slot)
        var cu = unitAt(i), ca = cu ? game.C.anchor(cu.id, { home: true }) : null, ty = (ca ? ca.top - 3 * s.s : s.cy - 34 * s.s) + Math.sin(t * 6) * 2;
        g.fillStyle = pk ? '#ffd36a' : '#ffffff'; g.beginPath(); g.moveTo(s.cx, ty); g.lineTo(s.cx - 6 * s.s, ty - 9 * s.s); g.lineTo(s.cx + 6 * s.s, ty - 9 * s.s); g.closePath(); g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#1a1220'; g.stroke();
      }
      g.restore();
    }
    // row labels beside the nearest slots of each row (left of the ellipse, above the panels)
    ['back', 'front'].forEach(function (row) { var s = game.C.slotRect('a', row, 2); txt(row.toUpperCase(), s.cx - 25 * s.s, s.cy + 3.5, { size: 8, weight: 800, align: 'right', color: row === 'front' ? '#ffe2a8' : '#bfe0ff', ow: 3 }); });
  }
  function drawPrep(t) {
    var u = prep.cursor === 'engage' ? null : unitAt(prep.cursor);
    // left: the unit card with its tactic rules
    panelR(8, 262, 298, 92, { r: 10, name: 'unitCard' });
    if (u) {
      g.save(); g.beginPath(); g.arc(34, 290, 20, 0, 7); g.fillStyle = '#1d3352'; g.fill(); g.clip(); game.C.paintHead(g, u, 34, 293, 19); g.restore();
      g.beginPath(); g.arc(34, 290, 20, 0, 7); g.lineWidth = 1.8; g.strokeStyle = '#58b4ff'; g.stroke();
      txt(u.name, 62, 281, { size: 13, weight: 800, outline: false });
      txt('Lv ' + u.level + ' ' + u.cls.charAt(0).toUpperCase() + u.cls.slice(1) + ' · ' + (u.slot >= 3 ? 'Back' : 'Front'), 62, 294, { size: 9, weight: 600, color: '#c9bce6', outline: false });
      txt('HP ' + u.hp + ' / ' + u.maxHp, 62, 306, { size: 9, weight: 700, color: u.hp / u.maxHp < 0.35 ? '#ffcf4a' : '#9dffb6', outline: false });
      txt((CLASSES[u.cls].role || ''), 14, 326, { size: 8.5, weight: 600, color: '#a99cc8', outline: false });
      txt('TACTICS: ' + u.presetName, 170, 280, { size: 9, weight: 800, color: '#ffd36a', outline: false });
      u.rules.slice(0, 3).forEach(function (r, i) {
        var p = GameDNA_SquadClash.ruleParts(r), sk = game.C.skills[p.use];
        txt((i + 1) + '. ' + GameDNA_SquadClash.ruleText(r) + ' → ' + (sk ? sk.name : p.use), 170, 294 + i * 12, { size: 8.5, weight: 600, color: p.on ? '#e8e0ff' : 'rgba(232,224,255,0.4)', outline: false });
      });
      if (presetsOf(u).length > 1) { var b = BTN.tactic; g.save(); game.C.panel(g, b.x, b.y, b.w, b.h, { r: 10, edge: '#ffd36a', alpha: 0.9 }); g.restore(); txt('T: change tactics', b.x + b.w / 2, b.y + 14, { size: 9, weight: 800, align: 'center', color: '#ffd36a', outline: false }); }
      if (prep.pick !== null) txt('Z on another slot to swap', 14, 344, { size: 9, weight: 700, color: '#ffd36a', outline: false });
      else txt('Z: pick to move · arrows: slots', 14, 344, { size: 9, weight: 600, color: '#a99cc8', outline: false });
    } else if (prep.cursor !== 'engage') {
      txt('Empty slot', 20, 284, { size: 13, weight: 800, outline: false });
      txt(prep.pick !== null ? 'Z here to move the picked unit' : 'Arrows: choose a unit. Z: pick it up, Z again: drop.', 20, 302, { size: 9, weight: 600, color: '#c9bce6', outline: false });
    } else {
      txt('Formation & tactics', 20, 284, { size: 13, weight: 800, outline: false });
      txt('Arrows: choose a unit · Z: pick it up, Z on a slot: swap', 20, 302, { size: 9, weight: 600, color: '#c9bce6', outline: false });
      txt('T: change its tactics · the forecast updates at once', 20, 316, { size: 9, weight: 600, color: '#c9bce6', outline: false });
      txt('Front row takes melee; back row is safe from it,', 20, 334, { size: 8.5, weight: 600, color: '#a99cc8', outline: false });
      txt('but ranged and magic hit it ' + Math.round((game.C.params().backWeak - 1) * 100) + '% harder.', 20, 346, { size: 8.5, weight: 600, color: '#a99cc8', outline: false });
    }
    // middle: the module's forecast panel
    game.C.drawForecast(g, { x: 312, y: 262, w: 214, h: 92 }, { labelA: 'You', labelB: 'Foe' });
    // right: ENGAGE
    var e = BTN.engage, on = prep.cursor === 'engage', pulse = on ? 0.5 + 0.5 * Math.sin(t * 5) : 0;
    g.save(); if (on) { g.shadowColor = '#ffd36a'; g.shadowBlur = 14 + pulse * 8; }
    game.C.panel(g, e.x, e.y, e.w, e.h, { r: 10, top: on ? '#5a3a1a' : '#2a2340', bottom: on ? '#2e1c0e' : '#16121f', edge: on ? '#ffd36a' : '#8a7a5a' });
    g.restore(); hudRects.push({ name: 'engage', x: e.x, y: e.y, w: e.w, h: e.h });
    txt('ENGAGE', e.x + e.w / 2, e.y + 45, { size: 16, weight: 700, font: 'display', spacing: 1.5, align: 'center', color: on ? '#ffe28a' : '#d8cbb0' });
    txt(prep.pick !== null ? 'X: cancel move' : on ? 'Z to commit' : 'down / right', e.x + e.w / 2, e.y + 62, { size: 8.5, weight: 700, align: 'center', color: '#c9bce6', outline: false });
    // enemy squad name plate over their formation
    var ex = game.C.slotRect('b', 'front', 0).cx + 50;
    var en = game.enemyName.toUpperCase() + '  \u00b7  LV ' + CAMPAIGN[game.clash].level;
    g.save(); g.font = '800 10px ' + FONT; var ew = Math.ceil(g.measureText(en).width) + 34; g.restore();
    ex = Math.min(W - 8 - ew / 2, ex);
    g.save(); var eg = g.createLinearGradient(ex - ew / 2, 0, ex + ew / 2, 0); eg.addColorStop(0, 'rgba(60,14,18,0)'); eg.addColorStop(0.18, 'rgba(60,14,18,0.82)'); eg.addColorStop(0.82, 'rgba(60,14,18,0.82)'); eg.addColorStop(1, 'rgba(60,14,18,0)');
    g.fillStyle = eg; g.fillRect(ex - ew / 2, 44, ew, 18); g.fillStyle = 'rgba(255,138,122,0.75)'; g.fillRect(ex - ew / 2 + ew * 0.14, 44, ew * 0.72, 0.8); g.fillRect(ex - ew / 2 + ew * 0.14, 61.2, ew * 0.72, 0.8); g.restore();
    txt(en, ex, 56.6, { size: 10, weight: 800, align: 'center', color: '#ffd0c6', outline: false }); hudRects.push({ name: 'enemyPlate', x: ex - ew / 2, y: 44, w: ew, h: 18 });
  }
  function drawClashHud(t) {
    var fc = game.lastForecast; if (!fc) return;
    var words = { win: 'VICTORY', lose: 'DEFEAT', draw: 'DRAW' }, x = W - 8 - 150, y = H - 10 - 40;
    panelR(x, y, 150, 40, { r: 8, alpha: 0.86, name: 'forecastChip' });
    txt('FORECAST', x + 12, y + 15, { size: 8, weight: 800, color: '#bfb3d8', outline: false });
    txt(words[fc.result], x + 12, y + 32, { size: 13, weight: 900, color: fc.result === 'win' ? '#ffd36a' : fc.result === 'lose' ? '#ff7a7a' : '#cfd8ff', outline: false });
    txt(fastOn ? 'Z: normal speed' : 'Z: fast', x + 138, y + 32, { size: 8.5, weight: 700, align: 'right', color: '#a99cc8', outline: false });
  }
  function drawResult(t) {
    var o = game.lastOutcome; if (!o) return;
    var y = H - 52, msg = o.result === 'win' ? (game.clash + 1 >= CAMPAIGN.length ? 'The last squad breaks.' : 'The road ahead is open. Your squad grows stronger.') : o.result === 'lose' ? 'Your squad falls back. Morale −1.' : 'Neither squad gives way. Rest and engage again.';
    var w = 360, x = (W - w) / 2; panelR(x, y, w, 40, { r: 10, alpha: 0.9, name: 'resultBox' });
    txt(msg, W / 2, y + 17, { size: 10.5, weight: 700, align: 'center', outline: false });
    if (sceneT > 40 && Math.floor(t * 2) % 2 === 0) txt('Z: continue', W / 2, y + 32, { size: 9, weight: 800, align: 'center', color: '#ffd36a', outline: false });
  }
  function drawTitle(t) {
    g.save(); var lg = g.createLinearGradient(0, 14, 0, 124); lg.addColorStop(0, 'rgba(12,8,24,0)'); lg.addColorStop(0.45, 'rgba(12,8,24,0.5)'); lg.addColorStop(1, 'rgba(12,8,24,0)'); g.fillStyle = lg; g.fillRect(0, 14, W, 110); g.restore();
    var tg = g.createLinearGradient(0, 40, 0, 76); tg.addColorStop(0, '#fffbe8'); tg.addColorStop(0.6, '#ffdf9a'); tg.addColorStop(1, '#e9a94e');
    txt('BANNERS OF THE VALE', W / 2, 72, { size: 35, weight: 700, font: 'display', spacing: 3, align: 'center', color: tg, ow: 6 });
    g.save(); g.fillStyle = 'rgba(255,223,154,0.85)'; g.fillRect(W / 2 - 130, 82, 108, 1); g.fillRect(W / 2 + 22, 82, 108, 1); g.translate(W / 2, 82.5); g.rotate(Math.PI / 4); g.fillRect(-3, -3, 6, 6); g.restore();
    txt('Squad clashes, read before they happen', W / 2, 100, { size: 12, weight: 700, align: 'center', color: '#f1e6ff', ow: 4 });
    if (Math.floor(t * 2) % 2 === 0) txt('PRESS Z OR TAP TO MARCH', W / 2, 322, { size: 12, weight: 800, align: 'center', color: '#ffffff', ow: 4 });
    hudRects.push({ name: 'titleText', x: 100, y: 40, w: 440, h: 66 });
  }
  function drawEnd(t, won) {
    g.save(); g.fillStyle = 'rgba(10,6,20,0.55)'; g.fillRect(0, 0, W, H); g.restore();
    var w = 380, h = 150, x = (W - w) / 2, y = 92;
    panelR(x, y, w, h, { r: 12, name: 'endBox', edge: won ? '#ffd36a' : '#ff7a7a' });
    txt(won ? 'THE VALE IS HELD' : 'THE MARCH IS BROKEN', W / 2, y + 41, { size: 24, weight: 700, font: 'display', spacing: 2.5, align: 'center', color: won ? '#ffe28a' : '#ff9a9a' });
    var n = game.results.length, m = game.results.filter(function (r) { return r.match; }).length;
    txt(n + ' clash' + (n === 1 ? '' : 'es') + ' fought · ' + game.results.filter(function (r) { return r.result === 'win'; }).length + ' won', W / 2, y + 68, { size: 11, weight: 700, align: 'center', outline: false });
    txt('Every clash played as forecast: ' + m + ' / ' + n, W / 2, y + 88, { size: 11, weight: 700, align: 'center', color: m === n ? '#b8ffcb' : '#ffb3bd', outline: false });
    if (sceneT > 50 && Math.floor(t * 2) % 2 === 0) txt('Z: back to the title', W / 2, y + 122, { size: 10, weight: 800, align: 'center', color: '#ffd36a', outline: false });
  }
  function fit() {
    var st = document.getElementById('stage'), r = st.getBoundingClientRect(), bar = document.getElementById('bar');
    var availW = r.width || innerWidth, availH = Math.max(200, innerHeight - (bar ? bar.getBoundingClientRect().height : 0) - 40);
    var cssW = Math.min(availW, availH * W / H), cssH = cssW * H / W, dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.style.width = Math.floor(cssW) + 'px'; canvas.style.height = Math.floor(cssH) + 'px';
    var bw = Math.min(2560, Math.round(cssW * dpr)), bh = Math.round(bw * H / W);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  }
  addEventListener('resize', function () { fit(); });

  /* =================================================================================================
     === 9. Input: a key queue (a 0 ms tap still counts) ============================================== */
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', x: 'back', X: 'back', Escape: 'back', Backspace: 'back', p: 'auto', P: 'auto', t: 'tactic', T: 'tactic', c: 'tactic', C: 'tactic' };
  addEventListener('keydown', function (e) { var k = KEYS[e.key]; if (!k) return; e.preventDefault(); if (!e.repeat) keyQ.push(k); });
  canvas.addEventListener('pointerdown', function (e) {
    var r = canvas.getBoundingClientRect(); e.preventDefault();
    keyQ.push({ tap: true, x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-key]'), function (b) { b.addEventListener('pointerdown', function (e) { e.preventDefault(); keyQ.push(b.getAttribute('data-key')); }); });

  /* =================================================================================================
     === 10. Boot ======================================================================================= */
  function boot() {
    fit();
    initTitle(); makeInstance(); newGame(); setScene('title');
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
  // the boot waits for the art pack (and for any promise an addon pushed to GAME.waitFor in the ADDONS SLOT), then runs once
  var booted = false;
  function start() {
    if (booted) return; booted = true;
    ART.init(window.SQUAD_CLASH_ART_BASE || 'art/').ready(function () {
      var w = game.waitFor.filter(function (p) { return p && typeof p.then === 'function'; });
      if (w.length && typeof Promise !== 'undefined') Promise.all(w).then(boot, boot); else boot();
    });
  }
  game.boot = boot; game.art = ART;
  game.step = function (n) { for (var i = 0; i < (n || 1); i++) tick(); };
  game.render = render;
  game.press = function (k) { keyQ.push(k); };
  game.current = function () { return game.C ? game.C.current() : null; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
})();
