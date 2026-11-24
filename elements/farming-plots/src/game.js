/* Thistledown Acre: the G-04 farming starter. A complete farm year (Spring, Summer, Fall; four days each) built on
   GameDNA_FarmingPlots. Till the field, buy seeds at the stall, plant, water, harvest, ship produce in the bin (paid each
   night), and earn a ribbon at the Harvest Fair after Fall 4. Seasons repaint the farm and wither crops out of season.
   Search for the "=== n." banners: config and the farm, the game object (extension points), seasons, the instance and the
   hit-like event site, scenes, the main tick, drawing, input, boot. */
(function () {
  'use strict';
  /* =================================================================================================
     === 1. Config and the farm ======================================================================== */
  var qs = new URLSearchParams(location.search);
  var STEP = 1000 / 60;
  var FREEZE_AT = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : null;
  var FROZEN = FREEZE_AT !== null && qs.get('freeze') === '1';
  var AUTO = qs.get('auto') === '1' || (FROZEN && qs.get('auto') !== '0');
  var SEED = (+qs.get('seed') >>> 0) || 7;
  var REDUCED = qs.get('reduced') === '1' || (!!window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var FP = GameDNA_FarmingPlots, PXS = window.GameDNA_PixelScene || null;
/*@@FARM@@*/
  var T = FARM.tile, MW = FARM.cols * T, MH = FARM.rows * T;
  // content tables: copies of the module's built-ins; GAME.addCrop / addTool (ADDONS SLOT) add to them before the farm starts
  function copyOf(t) { var o = {}; for (var k in t) { var v = t[k], c = {}; for (var j in v) c[j] = v[j]; o[k] = c; } return o; }
  var CROPS = copyOf(FP.CROPS), TOOLS = copyOf(FP.TOOLS), TOOL_ORDER = Object.keys(TOOLS);
  var PARAMS = { dayMs: 28000, seasonDays: 4, seasons: 3, rain: 0.2, startGold: 120 };
  ['dayMs', 'seasonDays', 'seasons', 'rain', 'startGold'].forEach(function (k) { if (qs.has(k)) PARAMS[k] = +qs.get(k); });

  /* =================================================================================================
     === 2. Game object: the public surface and the extension points (see README) ======================= */
  var canvas = document.getElementById('screen'), g = canvas.getContext('2d');
  var world = document.createElement('canvas'), wg = world.getContext('2d');
  var game = {
    addons: [], flags: { builtinToasts: true, builtinHud: true },
    scene: 'title', C: null, results: [], lastEnd: null, seed: SEED,
    clock: { frame: 0, paused: false },
    autoplay: { on: AUTO },
    held: {},
    crops: CROPS, tools: TOOLS, toolOrder: TOOL_ORDER, params: PARAMS, farm: FARM,
    shipped: null,
    addCrop: function (id, def) { CROPS[id] = def; if (game.C) game.C.addCrop(id, def); return id; },
    addTool: function (id, def) { TOOLS[id] = def; if (TOOL_ORDER.indexOf(id) < 0) TOOL_ORDER.push(id); if (game.C) game.C.addTool(id, def); return id; },
    toast: function (text, o) { pushNotice(text, o); },
    view: function () { return { w: cssW, h: cssH, cam: { x: cam.x, y: cam.y, scale: K } }; },
    worldToScreen: function (x, y) { return { x: (x - cam.x) * K, y: (y - cam.y) * K }; },
    cellRect: function (cx, cy) { return { x: (cx * T - cam.x) * K, y: (cy * T - cam.y) * K, w: T * K, h: T * K }; },
    anchor: function (id) {
      if (!game.C) return null; var F = game.C.farmer(), p;
      if (id === 'farmer') p = { x: F.x, footY: F.y, top: F.y - 24, w: 18 };
      else if (id === 'merchant') p = { x: MERCHANT.x, footY: MERCHANT.y, top: MERCHANT.y - 18, w: 14 };
      else if (Array.isArray(id)) p = { x: id[0] * T + T / 2, footY: id[1] * T + T - 2, top: id[1] * T - 6, w: T };
      if (!p) return null;
      return { x: (p.x - cam.x) * K, footY: (p.footY - cam.y) * K, top: (p.top - cam.y) * K, left: (p.x - p.w / 2 - cam.x) * K, w: p.w * K, h: (p.footY - p.top) * K, world: p };
    },
    unitRects: function () { var a = game.anchor('farmer'), m = game.anchor('merchant'), out = []; if (a && game.scene === 'farm' && FARMER_VISIBLE()) out.push({ id: 'farmer', kind: 'farmer', x: a.left, y: a.top, w: a.w, h: a.h }); if (m && game.scene === 'farm') out.push({ id: 'merchant', kind: 'npc', x: m.left, y: m.top, w: m.w, h: m.h }); return out; },
    uiRects: function () {
      var out = [];
      if (game.scene === 'farm' && game.C && game.flags.builtinHud) out = out.concat(game.C.uiRects(game.view()));
      if (!(game.C && game.C.phase() === 'shop')) notices.forEach(function (n) { if (n.r) out.push({ name: 'notice', x: n.r.x, y: n.r.y, w: n.r.w, h: n.r.h, text: n.key }); });
      if (game.scene === 'title') out.push(titleRect());
      return out;
    },
    pause: function (on) { game.clock.paused = !!on; },
    holdBoot: function () { bootHolds++; var done = false; return function () { if (done) return; done = true; bootHolds--; if (!bootHolds && bootWaiting) boot(); }; },
    state: function () {
      var s = game.C ? game.C.state() : null;
      return { scene: game.scene, frame: game.clock.frame, auto: game.autoplay.on, farm: s, earned: s ? s.earned : 0, results: game.results.slice() };
    }
  };
  window.GAME = game;
  game.shipped = { crops: Object.keys(CROPS), tools: Object.keys(TOOLS) };
  function each(hook, args) {
    var out = false;
    game.addons.forEach(function (a) { if (!a || typeof a[hook] !== 'function') return; try { if (a[hook].apply(a, args) === true) out = true; } catch (e) { console.error('addon ' + (a.name || '?') + '.' + hook + ': ' + e.message); } });
    return out;
  }

  /* =================================================================================================
     === 3. The farm scenery: pixel-kit ground and props, repainted per season by an exact palette remap === */
  var scene = null, PROPS = [], MERCHANT = { x: 28 * T, y: 5 * T + 4 }, BIN = { x: 11 * T + 8, y: 6 * T + 14 };
  function buildScenery() {
    if (!PXS) return;
    var map = FARM.map.map(function (r) { return r.replace(/[HBKX]/g, '.').replace(/f/g, 'p'); });
    scene = PXS.scene({ seed: 4, map: map, mixed: true });
    PROPS = [
      { k: 'house', x: 8 * T + 8, y: 7 * T - 1, o: { roof: 'red' }, lit: true },
      { k: 'stall', x: 28 * T, y: 6 * T + 14, o: { color: 'green' } },
      { k: 'lantern', x: 6 * T + 8, y: 6 * T + 15 }, { k: 'lantern', x: 25 * T + 8, y: 4 * T + 15 }, { k: 'lantern', x: 12 * T + 8, y: 4 * T + 15 },
      { k: 'barrel', x: 10 * T + 8, y: 6 * T + 14 }, { k: 'sack', x: 26 * T + 4, y: 7 * T - 2, z: 6 * T + 14 }, { k: 'crate', x: 31 * T + 8, y: 6 * T + 14 }, { k: 'hay', x: 4 * T + 8, y: 6 * T + 14 }
    ];
    // fences: rows 8 and 16, posts down columns 4 and 28 (the gaps are the gates)
    [10, 18].forEach(function (ry) { var x0 = null; for (var cx = 0; cx <= FARM.cols; cx++) { var on = FARM.map[ry].charAt(cx) === 'X'; if (on && x0 === null) x0 = cx; if (!on && x0 !== null) { PROPS.push({ k: 'fence', x: x0 * T, y: ry * T + 11, o: { len: (cx - x0) * T }, left: true }); x0 = null; } } });
    [4, 28].forEach(function (cx) { PROPS.push({ k: 'fencev', x: cx * T + 8, y: 18 * T + 4, o: { len: 8 * T - 6 } }); });
    PROPS.forEach(function (p) { try { p.p = PXS.prop(p.k, p.o || {}); if (p.lit) p.pLit = PXS.prop(p.k, Object.assign({}, p.o, { lit: true })); } catch (e) { p.p = null; } });
  }
/*@@SEASONS@@*/
  function recolor(c, season, ground) { return PXS ? SEASON_PAINT.recolor(PXS.PAL, c, season, ground) : c; }
  function propFrame(p, t) { var P = p.lit && p.pLit && game.C && game.C.darkness() > 0.12 ? p.pLit : p.p; if (!P) return null; var f = P.frames.length > 1 ? P.frames[Math.floor(t / 1000 * (P.fps || 6) + (p.x * 7 + p.y * 3)) % P.frames.length] : P.frames[0]; return { P: P, f: f }; }

  /* =================================================================================================
     === 4. The instance and the event site ============================================================== */
  function makeInstance() {
    var C = FP.create({ seed: SEED, cols: FARM.cols, rows: FARM.rows, tile: T, walkable: FARM.walkable, field: FARM.field, spots: FARM.spots, start: FARM.start,
      lights: FARM.lights, crops: CROPS, tools: TOOLS, toolOrder: TOOL_ORDER, params: PARAMS,
      onEvent: eventSite, onEnd: function (r) { endSite(r); } });
    C.setAuto(game.autoplay.on);
    return C;
  }
  // every rules event passes here: built-in notices, then the addons (onEvent and the named hooks)
  function eventSite(ev) {
    var k = ev.kind;
    if (game.flags.builtinToasts) {
      if (k === 'harvest') { var d = CROPS[ev.crop]; pushNotice('+' + ev.n + ' ' + (d ? d.name : ev.crop), { crop: ev.crop, key: 'h:' + ev.crop }); }
      else if (k === 'ship' && ev.n) pushNotice('Shipped ' + ev.n + ' crop' + (ev.n > 1 ? 's' : '') + ': paid tonight', { icon: 'coin', key: 'ship' });
      else if (k === 'poor') pushNotice('Not enough gold', { icon: 'coin', key: 'poor', warn: true });
      else if (k === 'noSeed') pushNotice('No seeds: buy some at the stall', { key: 'noseed', warn: true });
    }
    each('onEvent', [ev, game]);
    var hook = { harvest: 'onHarvest', plant: 'onPlant', water: 'onWater', till: 'onTill', ship: 'onShip', buy: 'onBuy', sell: 'onSell', day: 'onDay', season: 'onSeason', wither: 'onWither', grow: 'onGrow', ripe: 'onRipe', use: 'onUse' }[k];
    if (hook) each(hook, [ev, game]);
  }
  function endSite(r) {
    if (game.scene !== 'farm') return;
    game.lastEnd = r; game.results.push(r); fairT = 0;
    each('onEnd', [r, game]);
  }

  /* =================================================================================================
     === 5. Scenes: title -> farm (the year) -> fair (inside the farm scene, the module's end card) -> title */
  var sceneT = 0, fairT = 0, booted = false, bootHolds = 0, bootWaiting = false, keyQ = [];
  function setScene(s) { game.scene = s; sceneT = 0; each('onScene', [s, game]); }
  function newGame() {
    notices = [];
    game.C = makeInstance(); cam.x = clamp(game.C.farmer().x - viewW / 2, 0, MW - viewW); cam.y = clamp(game.C.farmer().y - 12 - viewH / 2, 0, MH - viewH);
    each('onNewGame', [game]);
    setScene('farm');
  }
  function FARMER_VISIBLE() { var ph = game.C ? game.C.phase() : 'end'; return ph === 'play' || ph === 'shop' || ph === 'wake'; }

  /* =================================================================================================
     === 6. The main tick (fixed 60 Hz; ?t= fast-forwards through the same function) ===================== */
  var cam = { x: 0, y: 0 };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function tick() {
    game.clock.frame++; sceneT++;
    var dt = game.clock.paused ? 0 : STEP;
    // keys: addons first, then P (autoplay), then the scene
    while (keyQ.length) {
      var k = keyQ.shift();
      if (each('onKey', [k, game])) continue;
      if (k === 'auto') { game.autoplay.on = !game.autoplay.on; if (game.C) game.C.setAuto(game.autoplay.on); continue; }
      if (game.autoplay.on && (typeof k === 'string' || (k && k.tap)) && game.scene === 'farm') {   // a key or a tap hands control to the player
        game.autoplay.on = false; if (game.C) game.C.setAuto(false); }
      sceneKey(k);
    }
    if (game.scene === 'title') { if (game.autoplay.on && sceneT > 60) newGame(); }
    else if (game.scene === 'farm' && game.C) {
      if (dt) game.C.update(dt);
      // camera: follows the farmer (deterministic, in the tick), clamped to the map
      var F = game.C.farmer(), tx = clamp(F.x - viewW / 2, 0, Math.max(0, MW - viewW)), ty = clamp(F.y - 12 - viewH / 2, 0, Math.max(0, MH - viewH));
      cam.x += (tx - cam.x) * 0.18; cam.y += (ty - cam.y) * 0.18; if (Math.abs(tx - cam.x) < 0.05) cam.x = tx; if (Math.abs(ty - cam.y) < 0.05) cam.y = ty;
      if (game.C.state().ended) { fairT++; if (game.autoplay.on && fairT > 600) setScene('title'); }
    }
    stepNotices(dt);
    each('update', [game, { dt: dt, frozen: !dt }]);
  }
  function sceneKey(k) {
    if (game.scene === 'title') { if (k === 'ok' || (k && k.tap)) newGame(); return; }
    if (game.scene !== 'farm' || !game.C) return;
    if (game.C.state().ended) { if ((k === 'ok' || (k && k.tap)) && fairT > 60) setScene('title'); return; }
    if (k && k.tap) { tapAt(k.x, k.y); return; }
    if (k && k.hold) { game.C.setHeld(k.hold, k.on); return; }
    game.C.key(k);
  }
  // a tap in CSS px: hotbar slot, shop row, the night card, else a world tile
  function tapAt(x, y) {
    var C = game.C, R = C.layout(game.view()), ph = C.phase(), inR = function (r) { return r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; };
    if (ph === 'night') { C.key('ok'); return; }
    if (ph === 'shop' && R.shop) {
      if (!inR(R.shop)) { C.key('back'); return; }
      var row = Math.floor((y - R.shop.y - 44) / 40), st = C.state(); if (row < 0) return;
      var want = row, cur = st.shopCur; for (var i = 0; i < 8 && cur !== want; i++) { C.key(want > cur ? 'down' : 'up'); cur += want > cur ? 1 : -1; } C.key('ok'); return;
    }
    if (inR(R.hotbar)) { var s = cssW < 520 ? 40 : 46, ix = Math.floor((x - R.hotbar.x - 8) / (s + 4)); if (ix >= 0 && ix < TOOL_ORDER.length) C.key(String(ix + 1)); return; }
    C.tapCell(Math.floor((x / K + cam.x) / T), Math.floor((y / K + cam.y) / T));
  }

  /* ---------- built-in notices (one line, above the hotbar; GAME.flags.builtinToasts = false turns them off) ---------- */
  var notices = [];
  function pushNotice(text, o) {
    o = o || {}; var key = o.key || text, n = notices.filter(function (q) { return q.key === key && q.t < q.life - 300; })[0];
    if (n) { n.count += o.count || 1; n.t = Math.min(n.t, 300); n.text = text; return; }
    notices.push({ key: key, text: text, crop: o.crop, icon: o.icon, warn: o.warn, count: o.count || 1, t: 0, life: 2200, r: null });
    if (notices.length > 3) notices[0].t = Math.max(notices[0].t, notices[0].life - 220);   // the oldest fades out; the rest glide down into its slot
  }
  function stepNotices(dt) { for (var i = notices.length - 1; i >= 0; i--) { notices[i].t += dt; if (notices[i].t >= notices[i].life) notices.splice(i, 1); } layoutNotices(); }
  function layoutNotices() {
    var R = game.C ? game.C.layout(game.view()) : null, base = R ? R.label.y - 8 : cssH - 90;
    if (R && R.banner && R.banner.y > cssH / 2) base = Math.min(base, R.banner.y - 8);   // a season banner above the hotbar: notices stack above it
    // the oldest notice sits lowest; a new one appears above the others, and when the oldest leaves the rest glide down (never in one frame)
    notices.forEach(function (n, i) {
      var j = i, w = Math.min(cssW - 24, 44 + textW(n.text, 13, 800) + (n.count > 1 ? 10 + textW('x' + n.count, 13, 900) : 0)), h = 28, ty = base - h - j * (h + 6);
      n.ty = ty; if (n.y == null) n.y = ty; else n.y += (ty - n.y) * 0.25; if (Math.abs(ty - n.y) < 0.5) n.y = ty;
      n.r = { x: Math.round((cssW - w) / 2), y: Math.round(n.y), w: Math.round(w), h: h };
    });
  }
  // text width in CSS px with the HUD font (the notice card is sized to its text: never cut)
  function textW(str, size, weight) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.font = weight + ' ' + size + 'px "Trebuchet MS", "Segoe UI", system-ui, sans-serif'; var w = g.measureText(String(str)).width; g.restore(); return Math.ceil(w); }
  function drawNotices() {
    if (game.C && game.C.phase() === 'shop') return;
    notices.forEach(function (n) {
      if (!n.r) return; var a = Math.min(1, n.t / 160, (n.life - n.t) / 260), r = n.r, rise = (1 - Math.min(1, n.t / 160)) * 6;
      g.save(); g.globalAlpha = Math.max(0, a);
      g.fillStyle = n.warn ? 'rgba(70,20,16,0.88)' : 'rgba(26,18,12,0.86)'; rrect(r.x, r.y + rise, r.w, r.h, 9); g.fill();
      g.strokeStyle = n.warn ? '#e07050' : 'rgba(240,200,130,0.7)'; g.lineWidth = 1; rrect(r.x + 0.5, r.y + rise + 0.5, r.w - 1, r.h - 1, 9); g.stroke();
      var cd = n.crop && CROPS[n.crop]; if (cd) FP.drawIcon(g, 'crop', r.x + 6, r.y + rise + 3, 22, null, FP.cropDef(CROPS, n.crop).look); else FP.drawIcon(g, n.icon || 'seeds', r.x + 6, r.y + rise + 3, 22, null);
      txt(n.text, r.x + 32, r.y + rise + 19, { size: 13, weight: 800, color: n.warn ? '#ffd0c0' : '#fff2d8', max: r.w - 40 });
      if (n.count > 1) txt('x' + n.count, r.x + r.w - 10, r.y + rise + 19, { size: 13, weight: 900, color: '#ffd36a', align: 'right' });
      g.restore();
    });
  }

  /* =================================================================================================
     === 7. Drawing: the world at native px on an offscreen canvas, integer-scaled; the HUD at CSS px ==== */
  var cssW = 960, cssH = 540, dpr = 1, K = 3, viewW = 320, viewH = 180;
  function rrect(x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
  function txt(s, x, y, o) {
    o = o || {}; g.save(); g.font = (o.weight || 700) + ' ' + (o.size || 13) + 'px "Trebuchet MS", "Segoe UI", system-ui, sans-serif'; g.textAlign = o.align || 'left';
    var str = String(s); if (o.max && g.measureText(str).width > o.max) { window.__fpTrunc = (window.__fpTrunc || 0) + 1; window.__fpTruncS = str; while (str.length > 2 && g.measureText(str).width > o.max) str = str.slice(0, -2) + '.'; }
    if (o.ow) { g.lineJoin = 'round'; g.lineWidth = o.ow; g.strokeStyle = o.oc || 'rgba(26,14,8,0.92)'; g.strokeText(str, x, y); }
    g.fillStyle = o.color || '#fff'; g.fillText(str, x, y); g.restore();
  }
  function drawBin(q, x, y, t) {
    var open = game.C && game.C._S().recent.some(function (r) { var m = /^ship@(\d+)$/.exec(r); return m && (game.C._S().clock - +m[1]) < 450; });
    SHIP_BIN(q, x, y, open);
  }

  function drawWorld(t) {
    var C = game.C, season = C ? C.clock().season : 'spring', cx = Math.round(cam.x), cy = Math.round(cam.y);
    wg.setTransform(1, 0, 0, 1, 0, 0); wg.imageSmoothingEnabled = false;
    wg.fillStyle = '#1c3a24'; wg.fillRect(0, 0, viewW, viewH);
    wg.translate(-cx, -cy);
    if (scene) { wg.drawImage(recolor(scene.ground(t), season, true), 0, 0); }
    if (C) C.drawSoil(wg);
    // depth-sorted: scene props (trees, rocks), our props, the bin, the merchant, crops and the farmer
    var list = [];
    if (scene) scene.items.forEach(function (it) { if (it.flat) return; list.push({ y: it.y, draw: function (q) { var p = it.p, f = p.frames.length > 1 ? p.frames[Math.floor(t / 1000 * (p.fps || 6) + (it.x * 7 + it.y * 3)) % p.frames.length] : p.frames[0]; q.drawImage(recolor(f, season), Math.round(it.x - (p.left ? 0 : p.ax)), Math.round(it.y - p.ay)); } }); });
    PROPS.forEach(function (p) { if (!p.p) return; list.push({ y: p.z || p.y, draw: function (q) { var fr = propFrame(p, t); if (!fr) return; if (fr.P.glow && C && C.darkness() > 0.12) PXS.glow(q, p.x, p.y + fr.P.glow.dy, fr.P.glow.r, '#ffd070', Math.min(1, (C.darkness() - 0.1) * 3)); q.drawImage(recolor(fr.f, season), Math.round(p.x - (p.left ? 0 : fr.P.ax)), Math.round(p.y - fr.P.ay)); } }); });
    list.push({ y: BIN.y, draw: function (q) { drawBin(q, BIN.x, BIN.y, t); } });
    list.push({ y: MERCHANT.y, draw: function (q) { if (PXS) PXS.actor(q, MERCHANT.x, MERCHANT.y, { pal: 'merchant', dir: 'down', frame: 0 }); } });
    if (C) C.sprites().forEach(function (s) { list.push(s); });
    list.sort(function (a, b) { return a.y - b.y; }).forEach(function (s) { try { s.draw(wg); } catch (e) { } });
    if (C) C.drawFx(wg);
    each('draw', [wg, 'world', game]);
    if (C) C.drawSky(wg, { x: cx, y: cy, w: viewW, h: viewH });
    wg.setTransform(1, 0, 0, 1, 0, 0);
  }
  function titleRect() { var w = Math.min(cssW - 32, 460), h = 190; return { name: 'title', x: Math.round((cssW - w) / 2), y: Math.round(cssH * 0.22), w: w, h: h }; }
  function render() {
    var t = game.clock.frame * STEP;
    if (world.width !== viewW || world.height !== viewH) { world.width = viewW; world.height = viewH; }
    if (!game.C) { cam.x = 9 * T; cam.y = 5 * T; }
    drawWorld(t);
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
    g.fillStyle = '#10140c'; g.fillRect(0, 0, canvas.width, canvas.height);
    var ox = Math.round((cssW - viewW * K) / 2 * dpr), oy = Math.round((cssH - viewH * K) / 2 * dpr);
    g.drawImage(world, 0, 0, viewW, viewH, ox, oy, viewW * K * dpr, viewH * K * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (game.scene === 'farm' && game.C) { if (game.flags.builtinHud) game.C.drawUI(g, game.view()); }
    if (game.scene === 'title') drawTitle(t);
    drawNotices();
    each('draw', [g, 'hud', game]);
    each('drawUI', [g, game]);
    each('draw', [g, 'overlay', game]);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  function drawTitle(t) {
    var r = titleRect();
    g.fillStyle = 'rgba(8,12,6,0.35)'; g.fillRect(0, 0, cssW, cssH);
    FP.panel(g, r.x, r.y, r.w, r.h);
    txt('THISTLEDOWN ACRE', cssW / 2, r.y + 54, { size: Math.min(34, r.w / 12), weight: 900, align: 'center', color: '#5a2c10' });
    txt('A farm year: Spring, Summer, Fall', cssW / 2, r.y + 84, { size: 14, weight: 800, align: 'center', color: '#7a4a20' });
    ['turnip', 'cabbage', 'tomato', 'corn', 'pumpkin'].forEach(function (id, i) { var d = FP.cropDef(CROPS, id); if (d) FP.drawIcon(g, 'crop', cssW / 2 + (i - 2) * 44 - 14, r.y + 96 + Math.round(Math.sin(t / 400 + i) * 2), 28, null, d.look); });
    if (Math.floor(t / 500) % 2 === 0) txt('PRESS Z OR TAP TO START', cssW / 2, r.y + r.h - 22, { size: 14, weight: 900, align: 'center', color: '#8a3a10' });
  }
  var infoEl = document.getElementById('info'), lastInfo = '';
  function updateInfo() {
    if (!infoEl) return; var h = '', s = game.C && game.C.state();
    if (game.scene === 'farm' && s) h = s.ended ? '<b>The Harvest Fair</b> earned ' + s.earned + 'g' : '<b>' + s.season[0].toUpperCase() + s.season.slice(1) + ' ' + s.dayOfSeason + '</b> ' + s.time + ', ' + s.gold + 'g';
    else h = '<b>Thistledown Acre</b> <span class="dim">Tap or Z to start.</span>';
    if (h !== lastInfo) { infoEl.innerHTML = h; lastInfo = h; }
  }
  function fit() {
    var stage = document.getElementById('stage'), avW = Math.max(240, Math.min(stage.clientWidth || 960, 1600)), avH = Math.max(240, (window.innerHeight || 540) - (avW < 760 ? 70 : 64));
    cssW = Math.floor(avW); cssH = Math.floor(Math.min(avH, avW * (avW < 760 ? 1.9 : 0.75)));
    // integer scale from the width: native view about 320 px wide on desktops, about 195 on phones
    K = Math.max(2, Math.floor(cssW / 300)); viewW = Math.min(MW, Math.ceil(cssW / K)); viewH = Math.min(MH, Math.ceil(cssH / K));
    dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
    var bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr); if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  }
  addEventListener('resize', function () { fit(); });

  /* =================================================================================================
     === 8. Input: a key queue (a 0 ms tap still counts), held directions, pointer taps ================= */
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', a: 'left', s: 'down', d: 'right', W: 'up', A: 'left', S: 'down', D: 'right',
    z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', x: 'back', X: 'back', Escape: 'back', q: 'seed', Q: 'seed', Tab: 'tool', c: 'tool', C: 'tool', p: 'auto', P: 'auto',
    1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9' };
  var DIRK = { up: 1, down: 1, left: 1, right: 1 };
  addEventListener('keydown', function (e) { game.held[e.key] = true; var k = KEYS[e.key]; if (!k) return; e.preventDefault(); if (e.repeat) return; keyQ.push(k); if (DIRK[k]) keyQ.push({ hold: k, on: true }); });
  addEventListener('keyup', function (e) { game.held[e.key] = false; var k = KEYS[e.key]; if (k && DIRK[k]) keyQ.push({ hold: k, on: false }); });
  addEventListener('blur', function () { for (var k in game.held) game.held[k] = false; ['up', 'down', 'left', 'right'].forEach(function (d) { keyQ.push({ hold: d, on: false }); }); });
  canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); var r = canvas.getBoundingClientRect(); keyQ.push({ tap: true, x: (e.clientX - r.left) * cssW / r.width, y: (e.clientY - r.top) * cssH / r.height }); });

  /* =================================================================================================
     === 9. Boot ======================================================================================== */
  function boot() {
    if (booted) return;
    if (bootHolds > 0) { bootWaiting = true; return; }
    booted = true;
    fit(); buildScenery(); setScene('title');
    if (FROZEN) {
      var n = Math.floor(FREEZE_AT / STEP);
      for (var i = 0; i < n; i++) tick();
      render(); updateInfo();
      document.documentElement.setAttribute('data-state', JSON.stringify(game.state()));
      window.__frozen = true;
      return;
    }
    var last = performance.now(), acc = 0;
    (function loop(now) {
      acc += Math.min(250, now - last); last = now;
      while (acc >= STEP) { tick(); acc -= STEP; }
      render(); updateInfo();
      requestAnimationFrame(loop);
    })(last);
  }
  // text state for checks and critics: the farmer (side frames face left / right, up / down frames have no side) and the merchant
  window.__state = function () {
    var acts = [];
    if (game.C && game.scene === 'farm') {
      if (FARMER_VISIBLE()) game.C.actors().forEach(function (a) { acts.push(a); });
      acts.push({ id: 'merchant', kind: 'npc', x: MERCHANT.x, y: MERCHANT.y, facing: 'down', target: null, noFace: 'top-down down frame (behind the stall counter)' });
    }
    return { t: Math.round(game.clock.frame * STEP), scene: game.scene, farm: game.C ? game.C.state() : null, cam: { x: +cam.x.toFixed(2), y: +cam.y.toFixed(2), k: K, w: viewW, h: viewH }, actors: acts };
  };
  game.boot = boot;
  game.step = function (n) { for (var i = 0; i < (n || 1); i++) tick(); };
  game.render = render;
  game.press = function (k) { keyQ.push(k); };
  game.tick = tick;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { if (!bootHolds) boot(); else bootWaiting = true; }); else setTimeout(function () { if (!bootHolds) boot(); else bootWaiting = true; }, 0);
})();
