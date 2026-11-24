/* GameDNA shared scene · plain script, no import/export, one global: GameDNA_Scene
 *
 * ONE canonical tactics moment used by every style, so a comparison shows only what the skin changes.
 * Load order: skin-api.js, the skin files, the three modules (grid-range-path, damage-numbers, window-cursor), this file.
 *
 *   16x14 tiles of 16 px (256x224 native), seed 7, default t = 1400 ms, 4 s loop.
 *   Hero Rowan (knight) at (4,8), move 4, range 1-2; ally Ilsa (mage) at (1,10); foes Ghoul (8,6) and Wraith (11,11).
 *   Water: column 13, and column 12 below row 8. Blocking props: a stone at (6,4), a brazier at (6,10), a lamp at (9,2) (clear of
 *   the menu) and a crystal at (2,5); cost-2 bushes at (7,9) (8,9) (5,6); trees on the far bank. The path cursor walks
 *   (5,8) (6,8) (7,8) (8,8) (8,7) at 150..750 ms. (2026-11-14 r1 fixes: the lamp moved from (10,3), which the menu cut in half;
 *   the Wraith moved from (11,9), where its crit and CRITICAL label claimed the space above the Ghoul and pushed "128" away;
 *   the Ghoul moved from (9,6), where wide numerals above its head touched the menu and were pushed a tile left.)
 *   Menu 'Rowan' (Attack, Spells 12, Items, Wait disabled) at (168, 8) from 300 ms, selected row 0 -> 1 at 900 ms; pointer on the Ghoul.
 *   Numbers: MISS on Rowan at 1150 ms, 128 on the Ghoul at 1200, crit 57 on the Wraith at 1240, +30 on Ilsa at 1300.
 *   Foe B's threat zone (radius 2, this side of the river) under the hero's range.
 *
 * The scene owns the place and the timing; the skin owns the look. Map cells go through skin.tile, standing objects through
 * skin.prop (depth-sorted with the units, above the range overlays), units through skin.unitToken, mood through
 * skin.atmosphere (generic fallbacks from skin-api.js when a skin has none). A skin without its own prop() keeps the
 * tile-based look: prop cells are drawn as tile('mountain' | 'forest') in the ground, exactly as before. The three real
 * modules run with `skin: <id>`: B-01 draws range + arrow, E-01 places and draws the numbers, C-01 draws the menu + pointer.
 *
 *   GameDNA_Scene.draw(canvas, skinId, tMs, {width: displayDevicePx, focus: 'all'|'grid'|'numbers'|'window'}) -> info
 *   GameDNA_Scene.size(skinId, width) -> {w, h}   backing size the canvas will get
 *
 * Rendering per skin.native:
 *   pixel + scale 'integer' (no supersample): drawn at native 1x into an offscreen canvas, then blown up with nearest-neighbour.
 *   pixel + supersample (hd-diorama): backing = native x integer s (s >= minScale), ctx.setTransform(s); pixel parts stay on
 *     whole native px, light/blur are smooth. When the display width is not native x s, the frame is resampled once.
 *   smooth ('fit'): backing = display width, ctx.setTransform(width / native.w).
 *   A native taller than 224 (pixel8: 256x240) letterboxes the map vertically with the skin's ink colour.
 */
(function (root) {
  'use strict';
  var API = root.GameDNA_Skin;
  var W = 256, H = 224, TS = 16, COLS = 16, ROWS = 14, FRAME = 1000 / 60, LOOP = 4000, DEFAULT_T = 1400, SEED = 7;

  var WATER = {}, STONE = {}, THICKET = {}, COPSE = {}, PROPS = {};
  (function () {
    for (var y = 0; y < ROWS; y++) { WATER[13 + ',' + y] = 1; if (y > 8) WATER[12 + ',' + y] = 1; }
    ['6,4', '6,10', '9,2', '2,5'].forEach(function (k) { STONE[k] = 1; });
    ['7,9', '8,9', '5,6'].forEach(function (k) { THICKET[k] = 1; });
    ['14,1', '15,2', '14,5', '15,6', '14,11', '15,12'].forEach(function (k) { COPSE[k] = 1; });   // far bank, out of every range
    // props: kind and the index of the light it carries (LIGHTS / lightsFor order)
    PROPS['6,4'] = { kind: 'stone' }; PROPS['6,10'] = { kind: 'brazier', light: 0 }; PROPS['9,2'] = { kind: 'lamp', light: 1 }; PROPS['2,5'] = { kind: 'crystal', light: 2 };
    Object.keys(THICKET).forEach(function (k) { PROPS[k] = { kind: 'bush' }; }); Object.keys(COPSE).forEach(function (k) { PROPS[k] = { kind: 'tree' }; });
  })();
  function terrainAt(x, y) { var k = x + ',' + y; return WATER[k] ? 'water' : STONE[k] ? 'mountain' : THICKET[k] || COPSE[k] ? 'forest' : 'grass'; }
  function unitsFresh() {
    return [
      { id: 'rowan', name: 'Rowan', side: 'player', team: 'a', kind: 'knight', x: 4, y: 8, hp: 34, max: 40, move: 4, range: '1-2' },
      { id: 'ilsa', name: 'Ilsa', side: 'player', team: 'a', kind: 'mage', x: 1, y: 10, hp: 12, max: 26, move: 3 },
      { id: 'foeA', name: 'Ghoul', side: 'enemy', team: 'b', kind: 'fighter', x: 8, y: 6, hp: 18, max: 30, facing: -1 },
      { id: 'foeB', name: 'Wraith', side: 'enemy', team: 'b', kind: 'mage', x: 11, y: 11, hp: 22, max: 28, facing: -1 }
    ];
  }
  var STEPS = [[150, 5, 8], [300, 6, 8], [450, 7, 8], [600, 8, 8], [750, 8, 7]];
  var MENU = { at: 300, selAt: 900, x: 168, y: 8, title: 'Rowan', items: ['Attack', { label: 'Spells', note: '12' }, 'Items', { label: 'Wait', disabled: true }] };
  var SPAWNS = [[1150, 'rowan', 0, 'miss'], [1200, 'foeA', 128, 'damage'], [1240, 'foeB', 57, 'crit'], [1300, 'ilsa', 30, 'heal']];
  var HUD = { x: 4, y: 176, w: 96, h: 44 }, PLATE = { x: 4, y: 4, w: 64, h: 13 };
  // Point lights at the stones (brazier at (6,10), lamp at (10,3), crystal at (2,5)) and the Wraith's orb.
  // Every skin gets the STANDARD light format (SPEC §2.4: {x, y, r, col '#rrggbb', intensity 0..1, kind, h, flicker}).
  // ADAPT is kept for the two lit skins whose atmosphere()/unitToken() still read their own pre-standard fields
  // (hd-diorama: col as [r, g, b] 0..1 and i up to 1.35; lowpoly: i, not intensity). Remove an entry once that skin reads
  // the standard fields (GameDNA_Skin.normLights accepts both, so a skin can switch by normalising its input).
  var LIGHTS = [
    { x: 104, y: 160, h: 20, rgb: [1.0, 0.70, 0.38], hex: '#ffb860', flick: 1, kind: 'fire', r: 44, intensity: 0.5 },
    { x: 152, y: 46, h: 22, rgb: [1.0, 0.42, 0.36], hex: '#ffcf7a', flick: 4, kind: 'lamp', r: 40, intensity: 0.45 },
    { x: 40, y: 96, h: 18, rgb: [0.40, 0.86, 1.0], hex: '#7ae8ff', flick: 0, kind: 'crystal', r: 32, intensity: 0.4 },
    { x: 180, y: 174, h: 18, rgb: [0.8, 0.45, 1.0], hex: '#c890ff', flick: 0, small: true, kind: 'magic', r: 24, intensity: 0.35 }
  ];
  function flick(t, s) { return s ? 1 + 0.11 * Math.sin(t * 7.3 + s) + 0.06 * Math.sin(t * 13.1 + s * 2.7) : 1; }
  // 2026-11-14: hd-diorama and lowpoly now normalise standard lights themselves (skin.inLights / normLights), so no adapters remain.
  var ADAPT = {};
  function lightsFor(SK, t) {
    if (ADAPT[SK.id]) return ADAPT[SK.id](t);
    return LIGHTS.map(function (l) { return { x: l.x, y: l.y, r: l.r, col: l.hex, intensity: Math.min(1, l.intensity * flick(t, l.flick)), kind: l.kind, h: l.h, flicker: l.flick ? 0.15 : 0 }; });
  }
  // atmosphere phases this skin draws (SPEC §2.4); default ['world', 'final']
  function phases(SK) { return SK.atmospherePhases || ['world', 'final']; }
  function mood(SK, ctx, view, t, ph, ls) { if (phases(SK).indexOf(ph) >= 0) SK.atmosphere(ctx, view, t, { phase: ph, lights: ls, focus: [70, 176] }); }

  /* ---------------- sizing ---------------- */
  function plan(SK, width) {
    var N = SK.native || {}, nw = N.w || W, nh = N.h || H, dw = Math.max(nw, Math.round(width || nw * 2)), dh = Math.round(dw * nh / nw);
    var mode = SK.pixel && N.scale === 'integer' && !N.supersample ? 'native' : SK.pixel && N.supersample ? 'super' : 'fit';
    var s = mode === 'native' ? 1 : mode === 'super' ? Math.max(N.minScale || 1, Math.round(dw / nw)) : dw / nw;
    return { mode: mode, nw: nw, nh: nh, dw: dw, dh: dh, s: s, oy: Math.round((nh - H) / 2), direct: mode === 'fit' || (mode === 'super' && s * nw === dw) };
  }
  var POOL = {};
  function pooled(key, w, h) { var c = POOL[key]; if (!c) c = POOL[key] = document.createElement('canvas'); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return c; }

  /* ---------------- ground cache (static cells; water is drawn live so it keeps moving) ---------------- */
  // A skin without its own tile() gets the generic one, which reads palette.terrain.<kind> as ONE colour (SPEC §2.4).
  // A skin whose terrain tokens are something else (flat: [top, side] pairs for its own preview art) would paint black,
  // so the scene hands the generic tile a copy of the palette with each entry reduced to its first colour.
  function tileFn(SK) {
    var Tn = SK.palette.terrain;
    if (SK.tile.raw !== API.base.tile || !Tn || !Object.keys(Tn).some(function (k) { return typeof Tn[k] !== 'string'; })) return SK.tile;
    var flat = {}; Object.keys(Tn).forEach(function (k) { var v = Tn[k]; flat[k] = Array.isArray(v) ? v[0] : typeof v === 'string' ? v : undefined; if (flat[k] === undefined) delete flat[k]; });
    var proxy = Object.create(SK); proxy.palette = Object.assign({}, SK.palette, { terrain: flat });
    return function (ctx, r, kind, t) { return API.base.tile.call(proxy, ctx, r, kind, t); };
  }
  function ownProps(SK) { return !!(SK.prop && SK.prop.raw && SK.prop.raw !== API.base.prop); }
  var GROUND = {};
  function ground(SK, s) {
    var key = SK.id + '@' + s, c = GROUND[key];
    if (c) return c;
    c = document.createElement('canvas'); c.width = Math.round(W * s); c.height = Math.round(H * s);
    var g = c.getContext('2d'), tile = tileFn(SK), own = ownProps(SK); g.setTransform(s, 0, 0, s, 0, 0); API.setup(SK, g);
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) { var k = own && PROPS[x + ',' + y] ? 'grass' : terrainAt(x, y); if (k !== 'water') tile(g, { x: x * TS, y: y * TS, w: TS, h: TS }, k, 0); }
    GROUND[key] = c; return c;
  }

  /* ---------------- one deterministic frame ---------------- */
  function scene(ctx, SK, T, s, oy, focus) {
    var t = T / 1000, P = SK.palette, Tx = P.text || {}, show = { grid: focus === 'all' || focus === 'grid', numbers: focus === 'all' || focus === 'numbers', window: focus === 'all' || focus === 'window' };
    var UNITS = unitsFresh(), ls = lightsFor(SK, t), info = { t: T, skin: SK.id, focus: focus };
    var occ = function (x, y) { for (var i = 0; i < UNITS.length; i++) if (UNITS[i].x === x && UNITS[i].y === y) return UNITS[i]; return null; };
    var sprRect = function (u) { return { x: u.x * TS, y: u.y * TS - 8, w: TS, h: TS + 8, id: u.id }; };
    var view = { x: 0, y: 0, w: W, h: H };

    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = SK.lookup('ink') || '#000'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(ground(SK, s), 0, Math.round(oy * s));
    ctx.setTransform(s, 0, 0, s, 0, oy * s); API.setup(SK, ctx);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();

    // 1. ground: live water cells over the cached static ones, then the world-phase mood
    var tile = tileFn(SK);
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (WATER[x + ',' + y]) tile(ctx, { x: x * TS, y: y * TS, w: TS, h: TS }, 'water', t);
    mood(SK, ctx, view, t, 'world', ls);

    // 2. B-01 grid-range-path: the real module (reach, fringe, path); overlays and arrow go through the skin
    var GR = GameDNA_GridRange.create({ cols: COLS, rows: ROWS, tile: TS, occupant: occ, skin: SK,
      cost: function (x, y) { var k = x + ',' + y; return WATER[k] || STONE[k] ? 99 : THICKET[k] ? 2 : 1; },
      terrain: function (x, y) { return { name: terrainAt(x, y), def: 0, avo: 5 }; }, setUnitPos: function (u, x, y) { u.x = x; u.y = y; }, onWait: function () {},
      params: { overlay: 'pulsing' }, cursor: { x: 4, y: 8 } });
    GR.confirm();
    var N = Math.floor(T / FRAME);
    for (var i = 0; i < N; i++) { var ms = i * FRAME; for (var q = 0; q < STEPS.length; q++) if (ms <= STEPS[q][0] && STEPS[q][0] < ms + FRAME) GR.setCursor(STEPS[q][1], STEPS[q][2]); GR.update(); }
    if (show.grid) {
      var thr = new Set(); for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) { var X2 = 11 + dx, Y2 = 11 + dy; if (Math.abs(dx) + Math.abs(dy) <= 2 && X2 < 12 && X2 >= 0) thr.add(Y2 * COLS + X2); }
      var inT = function (kk) { return thr.has(kk) && !(GR.reach && GR.reach.has(kk)); };
      thr.forEach(function (kk) { if (!inT(kk)) return; var tx = kk % COLS, ty = (kk / COLS) | 0;
        SK.overlay(ctx, { x: tx * TS, y: ty * TS, w: TS, h: TS }, 'threat', t, { tile: { x: tx, y: ty }, edges: { top: !inT(kk - COLS), bottom: !inT(kk + COLS), left: tx === 0 || !inT(kk - 1), right: !inT(kk + 1) } }); });
      GR.drawUnder(ctx, { x: 0, y: 0 });
    }
    info.path = (GR.path || []).map(function (p) { return [p.x, p.y]; });

    // 3. props and units, back to front by row (a prop before a unit on the same row), through the skin's own pieces.
    //    A skin without its own prop() already has its props in the ground (tile-based look), so only units are drawn here.
    var own = ownProps(SK), items = UNITS.map(function (u) { return { y: u.y, o: 1, u: u }; });
    if (own) Object.keys(PROPS).forEach(function (k) { var p = PROPS[k], xy = k.split(','); items.push({ y: +xy[1], o: 0, x: +xy[0], p: p }); });
    items.sort(function (a, b) { return a.y - b.y || a.o - b.o || (a.x || 0) - (b.x || 0); }).forEach(function (it) {
      if (it.p) { SK.prop(ctx, { x: it.x * TS, y: it.y * TS, w: TS, h: TS }, it.p.kind, t, { lights: ls, light: it.p.light != null ? ls[it.p.light] || null : null, seed: it.x * 31 + it.y }); return; }
      var u = it.u; SK.unitToken(ctx, { x: u.x * TS, y: u.y * TS - 8, w: TS, h: TS + 8 }, { id: u.id, team: u.team, kind: u.kind, facing: u.facing, selected: u.id === 'rowan', lights: ls }, t);
    });
    mood(SK, ctx, view, t, 'post-props', ls);
    mood(SK, ctx, view, t, 'final', ls);
    if (show.grid) { var cur = GR.cursor; SK.cursor(ctx, { x: cur.px, y: cur.py, w: TS, h: TS }, 'bracket', t); }

    // 4. C-01 window-cursor: the real module (always run, so the numbers avoid the menu in every focus)
    var WC = GameDNA_WindowCursor.create({ view: view, skin: SK, getObstacles: function () { return UNITS.map(sprRect); }, params: { pointer: 'skin', rowH: 13 } });
    for (var j = 0; j * FRAME < T; j++) { var tm = j * FRAME; if (tm >= MENU.at) { WC.menu('cmd', { x: MENU.x, y: MENU.y, title: MENU.title, items: MENU.items, selected: tm >= MENU.selAt ? 1 : 0 }); WC.setCursor({ id: 'foeA' }); } WC.update(FRAME); }
    var menuRect = WC.rect('cmd'); info.menu = menuRect;

    // 5. E-01 damage-numbers: the real module places, bounces and fades; the skin draws every glyph
    // numbers avoid: unit sprites (with id), the HUD card, the turn plate and the menu (no id), and the lit props (brazier, lamp,
    // crystal: soft, avoided when there is room, as the damage-numbers README asks for torches and lamps)
    var hud = [HUD, PLATE].concat(menuRect ? [menuRect] : []), soft = Object.keys(PROPS).filter(function (k) { return PROPS[k].light != null; }).map(function (k) { var xy = k.split(','); return { x: +xy[0] * TS, y: +xy[1] * TS - 6, w: TS, h: TS + 6, soft: true }; });
    var dnLog = []; info.numberLog = dnLog;
    var DN = GameDNA_DamageNumbers.create({ bounds: { x: 0, y: 0, w: W, h: 172 }, skin: SK, debug: function (e) { if (dnLog.length < 60) dnLog.push(e); },
      getAnchor: function (id) { var u = UNITS.filter(function (v) { return v.id === id; })[0]; return u && { x: u.x * TS + 8, top: u.y * TS - 6, w: 16, h: 22 }; },
      getObstacles: function () { return UNITS.map(sprRect).concat(hud, soft); } });
    for (var m = 0; m <= T; m += 10) { for (var n = 0; n < SPAWNS.length; n++) if (SPAWNS[n][0] === m) DN.spawn(SPAWNS[n][1], SPAWNS[n][2], SPAWNS[n][3]); if (m < T) DN.update(10); }
    if (show.numbers) { DN.draw(ctx); var ld = DN.lastDrawn(); info.numbers = ld.length; info.numberRects = ld; }

    // 6. unit card and turn plate straight through the skin, then the menu and pointer last
    if (show.window) {
      var u = UNITS[0], px = HUD.x, py = HUD.y, F = SK.fonts || {};
      SK.frame(ctx, HUD, { role: 'window', team: 'a' });
      SK.frame(ctx, { x: px + 5, y: py + 6, w: 20, h: 31 }, { role: 'backing', team: 'a' });
      SK.unitToken(ctx, { x: px + 7, y: py + 10, w: 16, h: 25 }, { id: 'card', team: 'a', kind: 'knight', noShadow: true, lights: ls }, t);
      SK.text(ctx, u.name, px + 30, py + 6, { font: F.title ? 'title' : 'ui', color: Tx.title || Tx.main, color2: Tx.title2 });
      SK.text(ctx, 'HP', px + 30, py + 18, { font: F.label ? 'label' : 'ui', color: Tx.label || Tx.gold || Tx.main, color2: Tx.label2 || Tx.gold2 });
      SK.text(ctx, u.hp + '/' + u.max, px + 90, py + 18, { align: 'right' });
      SK.bar(ctx, { x: px + 30, y: py + 30, w: 60, h: 4 }, u.hp / u.max, 'hp', { style: 'meter', px: Math.round(58 * u.hp / u.max) });
      // a bitmap 'plate' font without its own glyph table is used only when it declares full coverage (pixel16 does since v0.3)
      var pf = F.plate && !(F.plate.type === 'bitmap' && !F.plate.glyphs && F.plate.coverage !== 'full') ? 'plate' : 'ui', pw = SK.measure('Turn 3', { font: pf });
      SK.frame(ctx, { x: 4, y: 4, w: pw + 14, h: 13 }, { role: 'plate' });
      SK.text(ctx, 'Turn 3', 11, 7, { font: pf, color: Tx.plate || Tx.main, shadow: Tx.plateShadow });
      WC.draw(ctx);
    }
    ctx.restore();
    return info;
  }

  function draw(canvas, skinId, T, opts) {
    opts = opts || {};
    var SK = API.resolve(skinId), p = plan(SK, opts.width), focus = opts.focus || 'all';
    T = Math.max(0, +T || 0);
    if (canvas.width !== p.dw || canvas.height !== p.dh) { canvas.width = p.dw; canvas.height = p.dh; }
    var out = canvas.getContext('2d'), info;
    if (p.direct) info = scene(out, SK, T, p.s, p.oy, focus);
    else {
      var off = pooled(SK.id, Math.round(p.nw * p.s), Math.round(p.nh * p.s));
      info = scene(off.getContext('2d'), SK, T, p.s, p.oy, focus);
      out.setTransform(1, 0, 0, 1, 0, 0); out.imageSmoothingEnabled = p.mode !== 'native'; if (out.imageSmoothingEnabled) out.imageSmoothingQuality = 'high';
      out.clearRect(0, 0, p.dw, p.dh); out.drawImage(off, 0, 0, p.dw, p.dh);
    }
    info.render = { mode: p.mode, scale: p.s, native: [p.nw, p.nh], backing: [p.dw, p.dh], resampled: !p.direct };
    return info;
  }
  function size(skinId, width) { var p = plan(API.resolve(skinId), width); return { w: p.dw, h: p.dh, native: [p.nw, p.nh] }; }
  function ready(ids) { return Promise.all(ids.map(function (id) { return API.ready(id); })); }

  root.GameDNA_Scene = { W: W, H: H, TS: TS, COLS: COLS, ROWS: ROWS, LOOP: LOOP, DEFAULT_T: DEFAULT_T, SEED: SEED,
    MENU: MENU, SPAWNS: SPAWNS, STEPS: STEPS, terrainAt: terrainAt, PROPS: PROPS, draw: draw, size: size, ready: ready };
})(typeof window !== 'undefined' ? window : this);
