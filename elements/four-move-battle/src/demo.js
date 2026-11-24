/* A-02 demo: the real module (../module/four-move-battle.js) driven by a small content set and the control panel. */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search), STEP = 1000 / 60;
  var FREEZE_AT = qs.has('t') ? Math.max(0, Number(qs.get('t')) || 0) : null, FROZEN = FREEZE_AT !== null && qs.get('freeze') === '1';
  var TYPES = {
    ember: { label: 'Ember', color: '#f0783a', strong: ['bloom'], weak: ['tide', 'ember', 'stone'], immune: ['burn'] },
    tide: { label: 'Tide', color: '#3e8ee8', strong: ['ember', 'stone'], weak: ['tide', 'bloom'] },
    bloom: { label: 'Bloom', color: '#5cbf4a', strong: ['tide', 'stone'], weak: ['ember', 'bloom', 'gale'] },
    gale: { label: 'Gale', color: '#8ccbe8', strong: ['bloom'], weak: ['stone', 'volt'] },
    stone: { label: 'Stone', color: '#b49a62', strong: ['ember', 'gale', 'volt'], weak: ['bloom'] },
    volt: { label: 'Volt', color: '#f2cc3a', strong: ['tide', 'gale'], weak: ['bloom', 'volt'], none: ['stone'], immune: ['numb'] }
  };
  var MOVES = {
    bump: { name: 'Bump', power: 35, uses: 35 }, quickpeck: { name: 'Quick Peck', power: 30, uses: 30, priority: 1 },
    brace: { name: 'Brace', kind: 'status', target: 'self', effect: { guard: true }, uses: 10, priority: 3 },
    cinder: { name: 'Cinder', type: 'ember', power: 40, uses: 25, effect: { status: 'burn', chance: 10 } }, flaredash: { name: 'Flare Dash', type: 'ember', power: 70, accuracy: 90, uses: 10 },
    waveslap: { name: 'Wave Slap', type: 'tide', power: 40, uses: 25 }, undertow: { name: 'Undertow', type: 'tide', power: 65, accuracy: 95, uses: 10 },
    lullaby: { name: 'Lullaby', kind: 'status', accuracy: 65, uses: 10, effect: { status: 'sleep' } },
    vinelash: { name: 'Vine Lash', type: 'bloom', power: 45, uses: 25 }, sapdrain: { name: 'Sap Drain', type: 'bloom', power: 40, uses: 15, effect: { drain: 0.5 } },
    prickle: { name: 'Spore Dust', type: 'bloom', kind: 'status', accuracy: 75, uses: 15, effect: { status: 'numb' } },
    mend: { name: 'Mend', kind: 'status', target: 'self', effect: { heal: 0.5 }, uses: 8 },
    gust: { name: 'Gust', type: 'gale', power: 40, uses: 30 }, airslice: { name: 'Air Slice', type: 'gale', power: 60, accuracy: 95, uses: 15, highCrit: true },
    whirl: { name: 'Whirlwind', type: 'gale', power: 35, uses: 15, target: 'allFoes' },
    pebble: { name: 'Pebble Toss', type: 'stone', power: 50, accuracy: 90, uses: 15 }, rockroll: { name: 'Rock Roll', type: 'stone', power: 70, accuracy: 85, uses: 10 },
    zap: { name: 'Zap', type: 'volt', power: 40, uses: 30, effect: { status: 'numb', chance: 10 } },
    staticweb: { name: 'Static Web', type: 'volt', kind: 'status', accuracy: 90, uses: 15, effect: { status: 'numb' } }, sparkrush: { name: 'Spark Rush', type: 'volt', power: 65, uses: 10 }
  };
  var SPECIES = {
    cindle: { name: 'Cindle', types: ['ember'], base: [45, 56, 42, 62], moves: ['cinder', 'bump', 'flaredash', 'brace'] },
    brookit: { name: 'Brookit', types: ['tide'], base: [55, 50, 52, 42], moves: ['waveslap', 'undertow', 'lullaby', 'bump'] },
    sproutle: { name: 'Sproutle', types: ['bloom'], base: [52, 50, 50, 46], moves: ['vinelash', 'sapdrain', 'prickle', 'mend'] },
    gustling: { name: 'Gustling', types: ['gale'], base: [42, 50, 38, 70], moves: ['gust', 'quickpeck', 'airslice', 'whirl'] },
    cobblet: { name: 'Cobblet', types: ['stone'], base: [55, 58, 66, 26], moves: ['pebble', 'rockroll', 'brace', 'bump'] },
    voltick: { name: 'Voltick', types: ['volt'], base: [44, 56, 44, 68], moves: ['zap', 'staticweb', 'sparkrush', 'bump'] },
    mosshell: { name: 'Mosshell', types: ['bloom', 'stone'], base: [60, 48, 64, 24], moves: ['vinelash', 'pebble', 'sapdrain', 'brace'] }
  };
  var SCEN = {
    cup: { foe: 'Rival Pip', own: [['cindle', 15], ['brookit', 15], ['sproutle', 15]], foes: [['gustling', 12], ['cobblet', 12]], stage: 'day' },
    strong: { foe: 'Rival Marrow', own: [['cindle', 16], ['brookit', 15]], foes: [['sproutle', 14], ['mosshell', 14]], stage: 'sunset' },
    none: { foe: 'Warden Vessa', own: [['voltick', 15], ['brookit', 15]], foes: [['cobblet', 15], ['gustling', 14]], stage: 'dusk' },
    status: { foe: 'Rival Pip', own: [['voltick', 15, 'burn'], ['brookit', 15], ['cindle', 15, 'sleep']], foes: [['gustling', 14, 'numb'], ['cobblet', 14], ['sproutle', 13]], stage: 'day' }
  };
  function mon(e, i, side) {
    var s = SPECIES[e[0]], b = s.base, L = e[1];
    return { id: side + '-' + e[0] + '-' + i, species: e[0], name: s.name, types: s.types, level: L, maxHp: Math.floor(2 * b[0] * L / 100) + L + 12, atk: Math.floor(2 * b[1] * L / 100) + 5, def: Math.floor(2 * b[2] * L / 100) + 5, spd: Math.floor(2 * b[3] * L / 100) + 5, moves: s.moves.slice(), status: e[2] || null };
  }

  // token-only smooth skin: same module, different look (the rules and timing never change)
  var FLAT = GameDNA_Skin.define({
    id: 'demo-flat', name: 'token-only smooth', pixel: false, native: { w: 240, h: 160, scale: 'fit', smoothing: true },
    palette: {
      ink: '#29304d', paper: '#f4f6fb',
      ui: { fill: '#ffffff', fillTo: '#eef1f8', edge: '#cdd2de', highlight: '#ffffff', shadow: 'rgba(40,46,90,0.25)', select: 'rgba(91,75,255,0.14)', well: '#eef0f6' },
      team: { a: '#6f8cff', b: '#ff8574', n: '#aeb5c6' },
      overlay: { move: { fill: '#6f8cff', edge: '#4d68d6' }, attack: { fill: '#ff6f6f', edge: '#d9624f' }, threat: { fill: '#8f86ff', edge: '#5b4bff' }, heal: { fill: '#3fcf8e', edge: '#2f9e63' } },
      fx: { hot: '#ff8a5c', cold: '#4aa8ff', heal: '#2f9e63', crit: '#e8a020', status: '#8f86ff', white: '#ffffff' },
      text: { main: '#29304d', main2: '#29304d', shadow: 'rgba(0,0,0,0)', outline: '#ffffff', dim: '#aeb5c6', dim2: '#aeb5c6', accent: '#5b4bff', select: '#5b4bff', title: '#5b4bff', title2: '#5b4bff', label: '#7b8199', label2: '#7b8199' }
    },
    fonts: { ui: { type: 'canvas', family: 'system-ui, sans-serif', size: 7, weight: 700 }, num: { type: 'canvas', family: 'system-ui, sans-serif', size: 11, weight: 800 } },
    shape: { radius: 4, edgeWidth: 0.5, padding: 4, barRadius: 3 }, shadow: { text: null, window: { blur: 4, dy: 1 } }, outline: { text: { width: 0 }, number: { width: 1 } }, motion: { snap: false }
  });

  var P = {
    format: qs.get('format') === 'double' ? 'double' : 'single', textSpeed: qs.get('text') || 'normal', advance: qs.get('advance') || 'auto',
    hints: qs.get('hints') || 'on', drain: qs.get('drain') || 'normal', critRate: qs.has('crit') ? +qs.get('crit') : 0.0625,
    scenario: SCEN[qs.get('scenario')] ? qs.get('scenario') : 'cup', look: qs.get('look') || 'pixel16', seed: Number(qs.get('seed')) || 11
  };
  var auto = FROZEN ? qs.get('auto') !== '0' : qs.get('auto') !== '0';
  var cv = document.getElementById('cv'), g = cv.getContext('2d'), B = null, W = 240, H = 160, K = 1, tick = 0;
  function setup() {
    var look = P.look; W = look === 'pixel16-224' ? 256 : 240; H = look === 'pixel16-224' ? 224 : 160; K = look === 'flat' ? 3 : 1;
    cv.width = W * K; cv.height = H * K; g = cv.getContext('2d'); g.setTransform(K, 0, 0, K, 0, 0); g.imageSmoothingEnabled = false;
    var sc = Math.max(1, Math.floor(Math.min(780, (window.innerWidth || 800) - 40) / W)); cv.style.width = W * sc + 'px'; cv.style.height = H * sc + 'px';
    document.getElementById('res').textContent = W + '×' + H + (K > 1 ? ' (smooth skin, ×3 backing)' : ' native') + ' · ×' + sc;
    var S = SCEN[P.scenario];
    B = GameDNA_FourMove.create({
      view: { x: 0, y: 0, w: W, h: H }, seed: P.seed, foeName: S.foe, skin: look === 'flat' ? FLAT : 'pixel16', types: TYPES, moves: MOVES,
      teams: { own: S.own.map(function (e, i) { return mon(e, i, 'own'); }), foe: S.foes.map(function (e, i) { return mon(e, i, 'foe'); }) },
      params: { format: P.format, textSpeed: P.textSpeed, advance: P.advance, hints: P.hints, drain: P.drain, critRate: P.critRate, auto: auto },
      sprite: function (src, view) { VIEW[src.id] = view; return ART.sprite(src.species, view); },
      drawBackground: function (ctx, r, t) { ART.backdrop(ctx, r, t, S.stage); },
      platform: function (ctx, pl, side) { ART.platform(ctx, pl, side, S.stage); },
      items: function () { return [{ id: 'tonic', label: 'Tonic', note: 'x' + bag, ok: bag > 0 }]; },
      useItem: function () { if (bag > 0) { bag--; return { heal: 25 }; } return { text: 'THE BAG IS EMPTY.' }; },
      onMessage: function (m) { var d = document.createElement('div'); d.textContent = m; logEl.appendChild(d); while (logEl.children.length > 60) logEl.removeChild(logEl.firstChild); logEl.scrollTop = 1e9; }
    });
    bag = 2; tick = 0; logEl.textContent = '';
    document.getElementById('seedOut').textContent = P.seed;
  }
  var bag = 2, logEl = document.getElementById('log'), VIEW = {};   // VIEW: the view ('front' | 'back') the module last asked for per creature id

  // controls
  Array.prototype.forEach.call(document.querySelectorAll('.seg'), function (seg) {
    var key = seg.getAttribute('data-key');
    Array.prototype.forEach.call(seg.children, function (b) {
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(b.textContent === String(P[key])));
      b.addEventListener('click', function () {
        P[key] = b.textContent; Array.prototype.forEach.call(seg.children, function (x) { x.setAttribute('aria-checked', String(x === b)); });
        if (key === 'format') setup(); else { var o = {}; o[key] = P[key]; B.setParams(o); }
      });
    });
  });
  var crit = document.getElementById('crit'), critOut = document.getElementById('critOut');
  crit.value = P.critRate; critOut.textContent = (P.critRate * 100).toFixed(1) + '%';
  crit.addEventListener('input', function () { P.critRate = +crit.value; critOut.textContent = (P.critRate * 100).toFixed(1) + '%'; B.setParams({ critRate: P.critRate }); });
  var scen = document.getElementById('scenario'); scen.value = P.scenario; scen.addEventListener('change', function () { P.scenario = scen.value; setup(); });
  var lookSel = document.getElementById('look'); lookSel.value = P.look; lookSel.addEventListener('change', function () { P.look = lookSel.value; setup(); });
  document.getElementById('restart').addEventListener('click', setup);
  document.getElementById('reroll').addEventListener('click', function () { P.seed = (P.seed * 7 + 13) % 997; setup(); });
  var autoBtn = document.getElementById('autoBtn');
  function setAuto(on) { auto = on; B.setAuto(on); autoBtn.classList.toggle('on', on); autoBtn.textContent = on ? 'Autoplay: on' : 'Autoplay: off'; }
  autoBtn.addEventListener('click', function () { setAuto(!auto); });
  function press(k) { if (auto) setAuto(false); B.key(k); }
  Array.prototype.forEach.call(document.querySelectorAll('[data-key]'), function (b) { if (b.parentNode.classList.contains('pad')) b.addEventListener('pointerdown', function (e) { e.preventDefault(); press(b.getAttribute('data-key')); }); });
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', x: 'back', X: 'back', Escape: 'back' };
  addEventListener('keydown', function (e) { var k = KEYS[e.key]; if (!k) return; e.preventDefault(); if (!e.repeat) press(k); });
  cv.addEventListener('pointerdown', function (e) { var r = cv.getBoundingClientRect(); if (auto) setAuto(false); B.tap(Math.floor((e.clientX - r.left) * W / r.width), Math.floor((e.clientY - r.top) * H / r.height)); });

  // type chart table
  (function () {
    var ids = Object.keys(TYPES), t = document.getElementById('chart'), h = '<tr><th></th>' + ids.map(function (d) { return '<th><i style="background:' + TYPES[d].color + '"></i>' + TYPES[d].label.slice(0, 3) + '</th>'; }).join('') + '</tr>';
    ids.forEach(function (a) {
      h += '<tr><th><i style="background:' + TYPES[a].color + '"></i>' + TYPES[a].label.slice(0, 3) + '</th>';
      ids.forEach(function (d) { var T = TYPES[a], m = T.strong.indexOf(d) >= 0 ? 2 : (T.none || []).indexOf(d) >= 0 ? 0 : T.weak.indexOf(d) >= 0 ? 0.5 : 1; h += '<td class="' + (m === 2 ? 'x2' : m === 0.5 ? 'x05' : m === 0 ? 'x0' : '') + '">' + (m === 1 ? '' : m === 0.5 ? '½' : '×' + m) + '</td>'; });
      h += '</tr>';
    });
    t.innerHTML = h;
  })();

  function draw() {
    g.setTransform(K, 0, 0, K, 0, 0); g.clearRect(0, 0, W, H); B.draw(g);
    document.getElementById('phase').textContent = B.phase(); document.getElementById('turn').textContent = B.turn(); document.getElementById('msg').textContent = B.message();
  }
  setup(); setAuto(auto);
  /* text state for critics and tools/sprites/statecheck.py. The module never mirrors a sprite: it asks sprite(src, view)
     for a 'front' art (foe, top right) or a 'back' art (own side, bottom left). ART's front models are 3/4 views turned
     LEFT, toward the own side; the back view is the same model seen from behind, turned RIGHT, toward the foe. Cobblet
     and Sproutle are left-right symmetric in both views (no side). */
  var VIEW_FACING = { front: 'left', back: 'right' }, SYMMETRIC = { cobblet: 1, sproutle: 1 };
  window.__state = function () {
    var L = [], T = B.stats().tick;
    ['own', 'foe'].forEach(function (side) {
      var foes = B.active(side === 'own' ? 'foe' : 'own');
      B.active(side).forEach(function (c) {
        var a = B.anchor(c.id); if (!a) return;
        var o = { id: c.id, x: Math.round(a.x), y: Math.round(a.footY), facing: VIEW_FACING[VIEW[c.id]] || null, target: foes.length ? foes[0].id : null, view: VIEW[c.id] };
        if (SYMMETRIC[c.src && c.src.species]) o.noFace = 'left-right symmetric model (' + VIEW[c.id] + ' view)';
        L.push(o);
      });
    });
    return { t: Math.round(T * STEP), actors: L };
  };
  window.DEMO = { battle: function () { return B; }, step: function (n) { for (var i = 0; i < (n || 1); i++) B.update(); }, draw: draw };
  if (FROZEN) {
    var n = Math.floor(FREEZE_AT / STEP); for (var i = 0; i < n; i++) B.update();
    (qs.get('press') || '').split(',').filter(Boolean).forEach(function (k) { B.key(k); for (var j = 0; j < 12; j++) B.update(); });
    draw(); document.documentElement.setAttribute('data-state', JSON.stringify(B.stats()));
    return;
  }
  var last = performance.now(), acc = 0;
  (function loop(now) { acc += Math.min(250, now - last); last = now; while (acc >= STEP) { B.update(); acc -= STEP; } draw(); requestAnimationFrame(loop); })(last);
})();
