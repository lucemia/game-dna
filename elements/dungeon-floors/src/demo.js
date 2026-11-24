/* B-12 demo: the module alone. Left: the dungeon (bot playing, or the whole floor with its room graph). Right: parameters.
   ?t=<ms>&freeze=1 fast-forwards the 60 Hz simulation and draws one frame; ?view=graph, ?seed=, ?floor=, ?<param>= override. */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search), DF = GameDNA_DungeonFloors, STEP = 1000 / 60;
  var FREEZE_AT = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : null, FROZEN = FREEZE_AT !== null && qs.get('freeze') === '1';
  var canvas = document.getElementById('screen'), g = canvas.getContext('2d'), W = 400, H = 240, K = 2;
  var CTL = [
    { key: 'rooms', label: 'Rooms', min: 4, max: 18, step: 1 },
    { key: 'loops', label: 'Extra loops', min: 0, max: 1, step: 0.05 },
    { key: 'doors', label: 'Door chance', min: 0, max: 1, step: 0.05 },
    { key: 'density', label: 'Monster budget', min: 0, max: 2.5, step: 0.1 },
    { key: 'chests', label: 'Chest chance', min: 0, max: 3, step: 0.1 },
    { key: 'light', label: 'Lantern radius', min: 3, max: 10, step: 0.5 },
    { key: 'width', label: 'Map width', min: 30, max: 72, step: 2 },
    { key: 'height', label: 'Map height', min: 24, max: 52, step: 2 },
    { key: 'fog', label: 'Fog of war', options: ['on', 'off'] },
    { key: 'minimap', label: 'Minimap', options: ['on', 'off'] },
    { key: 'numbers', label: 'Combat numbers', options: ['on', 'off'] }
  ];
  var params = {}; Object.keys(DF.DEFAULTS).forEach(function (k) { params[k] = DF.DEFAULTS[k]; });
  CTL.forEach(function (c) { if (qs.has(c.key)) params[c.key] = c.options ? qs.get(c.key) : +qs.get(c.key); });
  var seed = (+qs.get('seed') >>> 0) || 7, floor0 = +qs.get('floor') || 1, view = qs.get('view') === 'graph' ? 'graph' : 'play', auto = qs.get('auto') !== '0';
  var df = null, frame = 0;
  function make() {
    window.__demoLog = [];
    df = DF.create({ view: { x: 0, y: 0, w: W, h: H }, seed: seed, params: params,
      onEvent: function (e) { if (e.kind !== 'turn' && e.kind !== 'move') window.__demoLog.push({ t: Math.round(frame * STEP), kind: e.kind, what: e.monster || e.item || e.floor || '' }); },
      onHit: function (h) { window.__demoLog.push({ t: Math.round(frame * STEP), kind: 'hit', what: h.attacker + '>' + h.defender, crit: h.crit, miss: h.miss }); } });
    df.start({ seed: seed, floor: floor0 }); df.setAuto(auto); frame = 0;
  }
  // controls
  var ctl = document.getElementById('ctl');
  CTL.forEach(function (c) {
    var row = document.createElement('div'); row.className = 'row';
    var inp = c.options ? '<select id="p_' + c.key + '">' + c.options.map(function (o) { return '<option' + (String(params[c.key]) === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>' : '<input id="p_' + c.key + '" type="range" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '" value="' + params[c.key] + '">';
    row.innerHTML = '<label for="p_' + c.key + '">' + c.label + '</label>' + inp + '<output id="o_' + c.key + '">' + params[c.key] + '</output>';
    ctl.appendChild(row);
    row.querySelector('#p_' + c.key).addEventListener('input', function (e) { params[c.key] = c.options ? e.target.value : +e.target.value; document.getElementById('o_' + c.key).textContent = params[c.key]; if (c.key === 'fog' || c.key === 'minimap' || c.key === 'light' || c.key === 'numbers') df.setParams(params); else make(); });
  });
  function btn(id, fn) { document.getElementById(id).addEventListener('click', fn); }
  btn('bView', function () { view = view === 'graph' ? 'play' : 'graph'; syncBtns(); });
  btn('bNew', function () { seed = (seed * 1103515245 + 12345) >>> 0 % 100000; seed = seed % 100000 || 1; make(); });
  btn('bFloor', function () { floor0 = floor0 % (params.floors || 5) + 1; make(); });
  btn('bAuto', function () { auto = !auto; df.setAuto(auto); syncBtns(); });
  function syncBtns() { document.getElementById('legend').style.display = view === 'graph' ? '' : 'none'; document.getElementById('bView').classList.toggle('on', view === 'graph'); document.getElementById('bAuto').classList.toggle('on', auto); }
  document.getElementById('legend').innerHTML = [['#ffe070', 'spanning-tree edge'], ['#78dcff', 'loop edge'], ['#7aff8a', 'start room'], ['#d0a860', 'door'], ['#7ad8ff', 'stairs'], ['#ffd040', 'chest'], ['#ff5a5a', 'monster']].map(function (l) { return '<span><i style="background:' + l[0] + '"></i>' + l[1] + '</span>'; }).join('');
  // input
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'wait', q: 'potion', m: 'map', Home: 'upleft', PageUp: 'upright', End: 'downleft', PageDown: 'downright' };
  addEventListener('keydown', function (e) { var k = KEYS[e.key]; if (!k) return; e.preventDefault(); if (auto) { auto = false; df.setAuto(false); syncBtns(); } if (!e.repeat) df.key(k); });
  canvas.addEventListener('pointerdown', function (e) { var r = canvas.getBoundingClientRect(); if (auto) { auto = false; df.setAuto(false); syncBtns(); } df.pointer('down', (e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height); });
  function fit() {
    var stage = document.getElementById('stage'), cssW = Math.max(200, stage.clientWidth || 640), dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    var devW = Math.floor(cssW * dpr), devH = Math.floor(Math.min((window.innerHeight || 700) - 60, cssW * 0.62) * dpr);
    K = Math.max(1, Math.round(devW / (cssW < 560 ? 220 : 420))); W = Math.floor(devW / K); H = Math.max(150, Math.floor(devH / K));
    canvas.width = W * K; canvas.height = H * K; canvas.style.width = (W * K / dpr) + 'px'; canvas.style.height = (H * K / dpr) + 'px';
    if (df) df.setView({ x: 0, y: 0, w: W, h: H });
  }
  addEventListener('resize', fit);
  function render() {
    g.setTransform(K, 0, 0, K, 0, 0); g.imageSmoothingEnabled = false;
    g.fillStyle = '#08060d'; g.fillRect(0, 0, W, H);
    if (view === 'graph') {
      var m = df.map(), s = Math.max(1, Math.floor(Math.min((W - 12) / m.w, (H - 24) / m.h))), rw = m.w * s, rh = m.h * s, rx = Math.round((W - rw) / 2), ry = Math.round((H - rh) / 2) + 6;
      DF.text(g, 'Seed ' + seed + ', floor ' + m.floor + ': ' + m.rooms.length + ' rooms, ' + m.edges.mst.length + ' tree + ' + m.edges.loops.length + ' loop corridors', W / 2, ry - 12, { align: 'center', color: '#ffe6a0' });
      df.drawOverview(g, { x: rx, y: ry, w: rw, h: rh }, { all: true, graph: true, s: s });
    } else { df.drawScene(g); df.drawUI(g); }
    var st = df.state(), m2 = df.map();
    document.getElementById('read').textContent = 'seed ' + st.seed + '  floor ' + st.floor + '/' + st.floors + '  turn ' + st.turn + '\nrooms ' + m2.rooms.length + ' (' + m2.rooms.map(function (r) { return r.type; }).join(', ') + ')\ncorridors: tree ' + m2.edges.mst.length + ', loops ' + m2.edges.loops.length + '\nmonsters ' + st.monsters + ' left, explored ' + st.explored + '%\nHP ' + st.hp + '/' + st.maxHp + '  LV ' + st.level + '  ' + st.phase;
  }
  window.__state = function () { return { t: Math.round(frame * STEP), view: view, actors: view === 'play' && df ? df.actors() : [] }; };
  window.__demoState = function () { return df ? Object.assign({ view: view }, df.state()) : null; };
  fit(); make(); syncBtns();
  if (FROZEN) { var n = Math.floor(FREEZE_AT / STEP); for (var i = 0; i < n; i++) { df.update(STEP); frame++; } render(); window.__frozen = true; return; }
  var last = performance.now(), acc = 0;
  (function loop(now) { acc += Math.min(250, now - last); last = now; while (acc >= STEP) { df.update(STEP); frame++; acc -= STEP; } render(); requestAnimationFrame(loop); })(last);
})();
