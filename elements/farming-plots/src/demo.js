/* G-04 farming-plots demo: one small farm on GameDNA_FarmingPlots with live parameters and presets.
   ?preset=year|growth|season|night|tools|sheet  ?t=<ms>&freeze=1  ?<param>=<value> */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search), STEP = 1000 / 60;
  var FREEZE_AT = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : null, FROZEN = FREEZE_AT !== null && qs.get('freeze') === '1';
  var FP = GameDNA_FarmingPlots, PXS = window.GameDNA_PixelScene, T = 16;
  var MAP = [
    'TTTTTTTTTTTTTTTTTTTTTT',
    'TTt..HHH.X..u...KKKKTT',
    'TT...HHHXB......KKKKTT',
    'TT......p.......,,p.TT',
    'TTu.....pppppppppppuTT',
    'TT..ffffff..ffffff..TT',
    'TT..ffffff..ffffff..TT',
    'TT..ffffff..........TT',
    'TT..ffffff..ffffff..TT',
    'TT..ffffff..ffffff.,TT',
    'TTww..........F...tTTT',
    'TTTTTTTTTTTTTTTTTTTTTT'
  ];
  var COLS = MAP[0].length, ROWS = MAP.length, MW = COLS * T, MH = ROWS * T;
  var walk = function (cx, cy) { var r = MAP[cy]; if (!r) return false; var c = r.charAt(cx); return c === '.' || c === ',' || c === 'p' || c === 'f' || c === 'F'; };
  var field = []; MAP.forEach(function (r, y) { for (var x = 0; x < r.length; x++) if (r.charAt(x) === 'f') field.push([x, y]); });
  var SPOTS = { bed: [6, 2], bin: [9, 2], shop: [18, 2] }, START = [6, 3, 'down'], TOOLS_START = [6, 7, 'left'];
/*@@SEASONS@@*/
  var PRESETS = {
    year: { label: 'A farm year (autoplay)', params: {} },
    growth: { label: 'Growth: one row per crop, a night every 3.3 s', params: { dayMs: 60000, rain: 0, nightMs: 900 } },
    season: { label: 'Season change: summer tomatoes wither in fall, corn grows on', params: { dayMs: 60000, rain: 0, nightMs: 900 } },
    night: { label: 'Dusk to night: lamps and the clock', params: { dayMs: 12000, rain: 0 } },
    tools: { label: 'Tools: till, plant, water, harvest in four directions', params: { rain: 0 } },
    sheet: { label: 'Art sheet: farmer frames and crop stages', params: {} }
  };
  var preset = PRESETS[qs.get('preset')] ? qs.get('preset') : 'year';
  var PARAM_KEYS = ['dayMs', 'seasonDays', 'seasons', 'rain', 'startGold', 'walkMs', 'turnMs', 'toolSpeed', 'night', 'cursor'];
  function params() { var p = {}; for (var k in PRESETS[preset].params) p[k] = PRESETS[preset].params[k]; PARAM_KEYS.forEach(function (k) { if (qs.has(k)) p[k] = isNaN(+qs.get(k)) ? qs.get(k) : +qs.get(k); }); return p; }
  var canvas = document.getElementById('cv'), g = canvas.getContext('2d'), world = document.createElement('canvas'), wg = world.getContext('2d');
  var scene = PXS.scene({ seed: 9, map: MAP.map(function (r) { return r.replace(/[HBKX]/g, '.').replace(/f/g, 'p'); }) });
  var PROPS = [{ k: 'house', x: 6 * T + 8, y: 3 * T - 1, o: { roof: 'blue' } }, { k: 'stall', x: 18 * T, y: 2 * T + 14, o: { color: 'red' } }, { k: 'lantern', x: 4 * T + 8, y: 2 * T + 15 }, { k: 'barrel', x: 8 * T + 8, y: 2 * T + 14 }];
  PROPS.forEach(function (p) { p.p = PXS.prop(p.k, p.o || {}); });
  var C = null, frame = 0, script = [], LOOP = 0, cam = { x: 0, y: 0 }, K = 3, VW = 0, VH = 0;
  function make() {
    var p = params();
    window.__demoEvents = [];
    var crops = null;
    if (preset === 'growth') { crops = {}; for (var id in FP.CROPS) { crops[id] = Object.assign({}, FP.CROPS[id]); crops[id].seasons = ['spring', 'summer', 'fall', 'winter']; } }
    C = FP.create({ crops: crops, seed: +qs.get('seed') || 5, cols: COLS, rows: ROWS, tile: T, walkable: walk, field: field, spots: SPOTS, start: preset === 'tools' ? TOOLS_START : START, params: p, lights: [[4 * T + 8, 2 * T + 2, 30]], onEvent: function (e) { if (window.__demoEvents.length < 4000) window.__demoEvents.push({ kind: e.kind, dir: e.dir, target: e.target || e.cell, t: e.t }); } });
    frame = 0; script = []; LOOP = 0;
    var S = function (f, k) { script.push({ f: f, k: k }); };
    if (preset === 'year') C.setAuto(true);
    if (preset === 'growth') {
      ['turnip', 'cabbage', 'tomato', 'corn', 'pumpkin'].forEach(function (id, row) { var y = [5, 6, 8, 9, 5][row], x0 = row === 4 ? 12 : 4; for (var i = 0; i < 4; i++) C.setPlot(x0 + i, y, { tilled: true, watered: true, crop: { id: id, growth: Math.min(i, 3) } }); });
      // every 4 s the farmer sleeps; rain keeps everything watered in this preset (setPlot waters each morning)
      for (var d = 0; d < 8; d++) S(60 + d * 200, 'sleep');
    }
    if (preset === 'season') {
      for (var i2 = 0; i2 < 6; i2++) { C.setPlot(4 + i2, 5, { tilled: true, watered: true, crop: { id: 'tomato', growth: 1 } }); C.setPlot(12 + i2, 5, { tilled: true, watered: true, crop: { id: 'corn', growth: 1 } }); }
      var st = C._S(); st.day = 7; for (var d2 = 0; d2 < 2; d2++) S(60 + d2 * 200, 'sleep');
    }
    if (preset === 'night') { for (var i3 = 0; i3 < 6; i3++) C.setPlot(4 + i3, 5, { tilled: true, watered: true, crop: { id: 'cabbage', growth: 3 } }); C._S().dayT = 0.55 * C.params.dayMs; }
    if (preset === 'tools') {
      // after the wake fade (keys during it are dropped) the farmer stands in the middle of a field block and works each side in turn: hoe, seeds, can, then (the crop
      // set ripe) the sickle; one facing every 260 frames, looping
      C.giveSeeds('turnip', 99);
      ['down', 'right', 'up', 'left'].forEach(function (d, i) {
        var f0 = 60 + i * 260;
        S(f0, d); S(f0 + 30, '1'); S(f0 + 40, 'ok'); S(f0 + 80, '3'); S(f0 + 90, 'ok'); S(f0 + 130, '2'); S(f0 + 140, 'ok');
        S(f0 + 180, 'ripe:' + d); S(f0 + 190, '4'); S(f0 + 200, 'ok');
      });
      LOOP = 60 + 4 * 260;
    }
    return C;
  }
  function tick() {
    frame++;
    var ff = LOOP ? ((frame - 1) % LOOP) + 1 : frame;
    if (LOOP && ff === 1 && frame > 1) C.plots().forEach(function (p) { if (p) { p.tilled = false; p.watered = false; p.crop = null; } });
    script.forEach(function (s) { if (s.f === ff) { if (/^ripe:/.test(s.k)) { var v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[s.k.slice(5)], F2 = C.farmer(); C.setPlot(F2.cx + v[0], F2.cy + v[1], { crop: { id: 'turnip', growth: 2 } }); return; } if (s.k === 'sleep') { if (preset === 'growth') C.plots().forEach(function (p) { if (p && p.crop) p.watered = true; }); C.sleep(); } else C.key(s.k); } });
    C.update(STEP);
    var F = C.farmer(), tx = Math.max(0, Math.min(MW - VW, F.x - VW / 2)), ty = Math.max(0, Math.min(MH - VH, F.y - 12 - VH / 2));
    cam.x += (tx - cam.x) * 0.2; cam.y += (ty - cam.y) * 0.2;
  }
  function fit() {
    var box = document.getElementById('stage'), w = Math.max(280, Math.min(box.clientWidth, 1100)), h = Math.round(w * (preset === 'sheet' ? 0.95 : 0.6));
    K = Math.max(2, Math.floor(w / 300)); VW = Math.min(MW, Math.ceil(w / K)); VH = Math.min(MH, Math.ceil(h / K));
    var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1)); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    fit.w = w; fit.h = h; fit.dpr = dpr; world.width = VW; world.height = VH;
  }
  function drawSheet() {
    var dpr = fit.dpr, s = Math.max(2, Math.floor(fit.w / 320)); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#2a3a26'; g.fillRect(0, 0, canvas.width, canvas.height); g.setTransform(dpr * s, 0, 0, dpr * s, 0, 0); g.imageSmoothingEnabled = false;
    var dirs = ['down', 'up', 'right', 'left'];
    dirs.forEach(function (d, i) {
      [-1, 0, 1, 2, 3].forEach(function (f, j) { FP.drawFarmer(g, 12 + j * 20, 30 + i * 30, { dir: d, frame: f }); });
      ['hoe', 'can', 'seeds', 'sickle'].forEach(function (tl, k) { ['raise', 'strike'].forEach(function (pz, m) { FP.drawFarmer(g, 116 + k * 44 + m * 22, 30 + i * 30, { dir: d, pose: pz, tool: FP.TOOLS[tl] }); }); });
      FP.drawFarmer(g, 300, 30 + i * 30, { dir: d, pose: 'lift', lift: FP.CROPS.corn.look });
    });
    var crops = ['turnip', 'cabbage', 'tomato', 'corn', 'pumpkin'];
    crops.forEach(function (id, i) { var d = FP.CROPS[id], X = 6 + (i % 2) * 110, Y = 104 + Math.floor(i / 2) * 34; for (var st = 0; st < d.stages; st++) { var sc = FP.soilCanvas(0, st === 0, 0); if (sc) g.drawImage(sc, X + st * 17, Y + 16); var im = FP.cropCanvas(id, d, st, false); if (im) g.drawImage(im, X + st * 17, Y); } var dd = FP.cropCanvas(id, d, d.stages - 1, true); if (dd) g.drawImage(dd, X + d.stages * 17 + 3, Y); });
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function render() {
    if (preset === 'sheet') { drawSheet(); return; }
    var dpr = fit.dpr, t = frame * STEP, cx = Math.round(cam.x), cy = Math.round(cam.y);
    wg.setTransform(1, 0, 0, 1, -cx, -cy); wg.imageSmoothingEnabled = false;
    var season = C.clock().season; wg.drawImage(SEASON_PAINT.recolor(PXS.PAL, scene.ground(t), season, true), 0, 0); C.drawSoil(wg);
    var list = scene.items.filter(function (it) { return !it.flat; }).map(function (it) { return { y: it.y, draw: function (q) { var p = it.p, f = p.frames.length > 1 ? p.frames[Math.floor(t / 1000 * (p.fps || 6) + (it.x * 7 + it.y * 3)) % p.frames.length] : p.frames[0]; q.drawImage(SEASON_PAINT.recolor(PXS.PAL, f, season), Math.round(it.x - (p.left ? 0 : p.ax)), Math.round(it.y - p.ay)); } }; });
    PROPS.forEach(function (p) { list.push({ y: p.y, draw: function (q) { var f = p.p.frames[Math.floor(t / 1000 * (p.p.fps || 6)) % p.p.frames.length]; if (p.p.glow && C.darkness() > 0.12) PXS.glow(q, p.x, p.y + p.p.glow.dy, p.p.glow.r, '#ffd070', Math.min(1, (C.darkness() - 0.1) * 3)); q.drawImage(SEASON_PAINT.recolor(PXS.PAL, f, season), Math.round(p.x - p.p.ax), Math.round(p.y - p.p.ay)); } }); });
    list.push({ y: 2 * T + 14, draw: function (q) { var S2 = C._S(), open = S2.recent.some(function (r) { var m = /^ship@(\d+)$/.exec(r); return m && S2.clock - +m[1] < 450; }); SHIP_BIN(q, 9 * T + 8, 2 * T + 14, open); } });
    list.push({ y: T + 4 + 14, draw: function (q) { PXS.actor(q, 18 * T, T + 18, { pal: 'merchant', dir: 'down', frame: 0 }); } });
    C.sprites().forEach(function (s) { list.push(s); }); list.sort(function (a, b) { return a.y - b.y; }).forEach(function (s) { s.draw(wg); });
    C.drawFx(wg); C.drawSky(wg, { x: cx, y: cy, w: VW, h: VH });
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false; g.drawImage(world, 0, 0, VW, VH, 0, 0, VW * K * dpr, VH * K * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); C.drawUI(g, { w: fit.w, h: fit.h, cam: { x: cx, y: cy, scale: K } });
  }
  // controls
  var panel = document.getElementById('controls');
  function control(label, key, opts) {
    var row = document.createElement('label'); row.className = 'row'; row.innerHTML = '<span>' + label + '</span>';
    var el;
    if (opts.options) { el = document.createElement('select'); opts.options.forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; el.appendChild(op); }); el.value = key === 'preset' ? preset : (qs.get(key) || opts.def); }
    else { el = document.createElement('input'); el.type = 'range'; el.min = opts.min; el.max = opts.max; el.step = opts.step; el.value = qs.has(key) ? qs.get(key) : opts.def; }
    var out = document.createElement('b'); out.textContent = el.value; row.appendChild(el); row.appendChild(out); panel.appendChild(row);
    el.addEventListener('input', function () { out.textContent = el.value; if (key === 'preset') { preset = el.value; } else qs.set(key, el.value); make(); });
  }
  control('Scene', 'preset', { options: Object.keys(PRESETS).map(function (k) { return [k, PRESETS[k].label]; }) });
  control('Day length (ms)', 'dayMs', { min: 6000, max: 60000, step: 1000, def: FP.DEFAULTS.dayMs });
  control('Days per season', 'seasonDays', { min: 2, max: 10, step: 1, def: FP.DEFAULTS.seasonDays });
  control('Rain chance', 'rain', { min: 0, max: 0.8, step: 0.05, def: FP.DEFAULTS.rain });
  control('Walk ms per tile', 'walkMs', { min: 120, max: 320, step: 10, def: FP.DEFAULTS.walkMs });
  control('Tool speed', 'toolSpeed', { min: 0.5, max: 2, step: 0.25, def: 1 });
  control('Night', 'night', { options: [['on', 'on'], ['off', 'off']], def: 'on' });
  control('Work cursor', 'cursor', { options: [['on', 'on'], ['off', 'off']], def: 'on' });
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'ok', Z: 'ok', ' ': 'ok', x: 'back', X: 'back', q: 'seed', Tab: 'tool', 1: '1', 2: '2', 3: '3', 4: '4' };
  addEventListener('keydown', function (e) { var k = KEYS[e.key]; if (!k) return; e.preventDefault(); if (C.auto()) C.setAuto(false); if (!e.repeat) C.key(k); if (/^(up|down|left|right)$/.test(k)) C.setHeld(k, true); });
  addEventListener('keyup', function (e) { var k = KEYS[e.key]; if (k && /^(up|down|left|right)$/.test(k)) C.setHeld(k, false); });
  canvas.addEventListener('pointerdown', function (e) { var r = canvas.getBoundingClientRect(); if (C.auto()) C.setAuto(false); C.tapCell(Math.floor(((e.clientX - r.left) / K + cam.x) / T), Math.floor(((e.clientY - r.top) / K + cam.y) / T)); });
  window.__demoStep = function (n) { for (var i = 0; i < n; i++) tick(); render(); };
  window.__state = function () { return { t: Math.round(frame * STEP), preset: preset, farm: C.state(), actors: C.actors() }; };
  window.__fpCast = { draw: function (g2, id, x, footY, want, pose) { return FP.drawFarmer(g2, x, footY, { dir: (pose && pose.dir) || want, frame: pose && pose.frame != null ? pose.frame : -1, pose: pose && pose.pose, tool: pose && pose.tool ? FP.TOOLS[pose.tool] : null, lift: pose && pose.lift ? FP.CROPS[pose.lift].look : null }); } };
  fit(); make();
  var F0 = C.farmer(); cam.x = Math.max(0, Math.min(MW - VW, F0.x - VW / 2)); cam.y = Math.max(0, Math.min(MH - VH, F0.y - 12 - VH / 2));
  if (FROZEN) { var n = Math.floor(FREEZE_AT / STEP); for (var i = 0; i < n; i++) tick(); render(); window.__frozen = true; return; }
  var last = performance.now(), acc = 0;
  (function loop(now) { acc += Math.min(250, now - last); last = now; while (acc >= STEP) { tick(); acc -= STEP; } render(); requestAnimationFrame(loop); })(last);
  addEventListener('resize', function () { fit(); });
})();
