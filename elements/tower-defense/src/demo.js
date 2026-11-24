/* A-16 demo: the module alone on a built-in map with the built-in waves, every parameter live. ?t=<ms>&freeze=1 for stills
   (autoplay on unless &auto=0), ?<param>=<value> overrides (map, speed, gold, lives, waveGap, earlyBonus, refund, hpScale,
   ring, grid, preview, priority), ?seed=n. window.__state() lists every enemy (heading) and tower (aim, target). */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search), STEP = 1000 / 60;
  // phones (under 560 px, or ?compact=1): the canvas shows only the field and the panel is a DOM strip (mountPanel)
  var COMPACT = qs.get('compact') === '1' || (qs.get('compact') !== '0' && (window.innerWidth || 640) < 560), W = 640, H = COMPACT ? 404 : 360;
  var FREEZE_AT = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : null, FROZEN = FREEZE_AT !== null && qs.get('freeze') === '1';
  var TD = GameDNA_TowerDefense, canvas = document.getElementById('screen'), g = canvas.getContext('2d');
  var CTRL = [
    { key: 'map', label: 'Map', type: 'select', options: ['millbrook', 'twinford', 'switchback'], def: 'millbrook', restart: true },
    { key: 'speed', label: 'Speed', type: 'select', options: ['1', '2'], def: '1' },
    { key: 'priority', label: 'Default target priority', type: 'select', options: ['first', 'strong', 'near'], def: 'first', restart: true },
    { key: 'gold', label: 'Starting gold', type: 'range', min: 100, max: 600, step: 10, def: 200, restart: true },
    { key: 'lives', label: 'Lives', type: 'range', min: 1, max: 40, step: 1, def: 20, restart: true },
    { key: 'hpScale', label: 'Enemy HP x', type: 'range', min: 0.5, max: 2, step: 0.05, def: 1 },
    { key: 'waveGap', label: 'Seconds between waves', type: 'range', min: 4, max: 30, step: 1, def: 12 },
    { key: 'earlyBonus', label: 'Early-call gold per second', type: 'range', min: 0, max: 4, step: 0.5, def: 1 },
    { key: 'refund', label: 'Sell refund', type: 'range', min: 0.3, max: 1, step: 0.05, def: 0.7 },
    { key: 'ring', label: 'Range ring', type: 'select', options: ['on', 'off'], def: 'on' },
    { key: 'grid', label: 'Build grid', type: 'select', options: ['auto', 'on'], def: 'auto' },
    { key: 'preview', label: 'Next-wave preview', type: 'select', options: ['on', 'off'], def: 'on' }
  ];
  var P = {}; CTRL.forEach(function (c) { var v = qs.has(c.key) ? qs.get(c.key) : c.def; P[c.key] = c.type === 'range' ? +v : v; });
  var seed = (+qs.get('seed') >>> 0) || 5, auto = qs.get('auto') === '1' || (FROZEN && qs.get('auto') !== '0'), frame = 0;
  var td = null;
  function start() {
    td = TD.create({ view: { x: 0, y: 0, w: W, h: H }, seed: seed,
      params: { priority: P.priority, speed: +P.speed, gold: P.gold, lives: P.lives, hpScale: P.hpScale, waveGap: P.waveGap, earlyBonus: P.earlyBonus, refund: P.refund, ring: P.ring, grid: P.grid, preview: P.preview, layout: COMPACT ? 'compact' : 'wide' } });
    td.start({ map: TD.MAPS[P.map] || TD.MAPS.millbrook, waves: TD.WAVES, seed: seed });
    td.setAuto(auto);
    if (panelEl) panelRefresh = TD.mountPanel(panelEl, td, function (k) { keyQ.push(k); });
  }
  var panelEl = COMPACT ? document.getElementById('tdpanel') : null, panelRefresh = null; if (panelEl) panelEl.style.display = 'block';
  // controls
  var box = document.getElementById('controls');
  CTRL.forEach(function (c) {
    var lab = document.createElement('label'), val = document.createElement('b'), inp;
    lab.textContent = c.label + ' '; lab.appendChild(val);
    if (c.type === 'select') { inp = document.createElement('select'); c.options.forEach(function (o) { var op = document.createElement('option'); op.value = o; op.textContent = o; inp.appendChild(op); }); }
    else { inp = document.createElement('input'); inp.type = 'range'; inp.min = c.min; inp.max = c.max; inp.step = c.step; }
    inp.value = P[c.key]; val.textContent = P[c.key];
    inp.addEventListener('input', function () { P[c.key] = c.type === 'range' ? +inp.value : inp.value; val.textContent = P[c.key]; if (c.restart) start(); else { var o = {}; o[c.key] = c.key === 'speed' ? +P[c.key] : P[c.key]; td.setParams(o); } });
    lab.appendChild(inp); box.appendChild(lab);
  });
  var row = document.createElement('div'); row.className = 'row';
  [['Autoplay', function () { auto = !auto; td.setAuto(auto); }], ['Send wave', function () { td.callWave(); }], ['Restart', function () { start(); }]].forEach(function (b) { var e = document.createElement('button'); e.textContent = b[0]; e.addEventListener('click', b[1]); row.appendChild(e); });
  box.appendChild(row);

  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', x: 'back', X: 'back', Escape: 'back', u: 'upgrade', U: 'upgrade', s: 'sell', S: 'sell', t: 'target', T: 'target', n: 'wave', N: 'wave', f: 'speed', F: 'speed', q: 'pause', Q: 'pause', 1: '1', 2: '2', 3: '3', 4: '4' };
  var keyQ = [];
  addEventListener('keydown', function (e) { if (e.target && /INPUT|SELECT/.test(e.target.tagName)) return; if (e.key === 'p' || e.key === 'P') { auto = !auto; td.setAuto(auto); return; } var k = KEYS[e.key]; if (!k) return; e.preventDefault(); if (!e.repeat) keyQ.push(k); });
  function local(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
  ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach(function (n) { canvas.addEventListener(n, function (e) { if (n === 'pointerdown') { e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch (x) { } } var p = local(e); keyQ.push({ ptr: n.slice(7), x: p.x, y: p.y }); }); });
  function tick() {
    frame++; var q = keyQ; keyQ = [];
    q.forEach(function (k) { if (k.ptr) { if (k.ptr === 'down' && auto) { auto = false; td.setAuto(false); } td.pointer(k.ptr, k.x, k.y); } else { if (auto) { auto = false; td.setAuto(false); } td.key(k); } });
    td.update(STEP);
  }
  function fit() {
    var cssW = Math.min(document.getElementById('stage').clientWidth || W, 1280), dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.style.width = Math.round(cssW) + 'px'; canvas.style.height = Math.round(cssW * H / W) + 'px';
    var bw = Math.min(2560, Math.round(cssW * dpr)), bh = Math.round(bw * H / W); if (canvas.width !== bw) { canvas.width = bw; canvas.height = bh; }
  }
  function render() {
    g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    g.fillStyle = '#16110e'; g.fillRect(0, 0, W, H);
    td.drawScene(g); td.drawUI(g);
    if (panelRefresh) panelRefresh();
  }
  addEventListener('resize', fit);
  window.__state = function () { return { t: Math.round(frame * STEP), actors: td.actors(), td: td.state() }; };
  window.__td = function () { return td; };
  function boot() {
    fit(); start();
    if (FROZEN) {
      var n = Math.floor(FREEZE_AT / STEP); for (var i = 0; i < n; i++) tick();
      // ?place=<tower>&cell=c,r: show placing that tower on that cell (a road cell shows the red warning and its message)
      if (qs.has('gold') && qs.get('place')) td.addGold(Math.max(0, +qs.get('gold') - td.gold()), 'demo');
      if (qs.get('place')) { var cr = (qs.get('cell') || '4,4').split(',').map(Number); td.setAuto(false); td.key('back'); td.key('tower:' + qs.get('place')); td.ui.cx = cr[0]; td.ui.cy = cr[1]; td.ui.keyCursor = true; if (td.canBuild(qs.get('place'), cr[0], cr[1])) td.key('ok'); td.update(STEP * 20); }
      if (qs.get('select')) { td.setAuto(false); td.select(qs.get('select')); td.update(STEP); }
      render(); window.__frozen = true; return;
    }
    var last = performance.now(), acc = 0;
    (function loop(now) { acc += Math.min(250, now - last); last = now; while (acc >= STEP) { tick(); acc -= STEP; } render(); requestAnimationFrame(loop); })(last);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
