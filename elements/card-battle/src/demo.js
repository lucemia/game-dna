/* A-10 demo: one fight at a time on GameDNA_CardBattle, live parameters, an intent-honesty counter. */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search), W = 640, H = 360, STEP = 1000 / 60;
  var FREEZE_AT = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : null, FROZEN = FREEZE_AT !== null && qs.get('freeze') === '1';
  var GROUPS = {
    'toad-wisp': { name: 'Mire Toad + Ash Wisp', theme: 'marsh', foes: ['mire-toad', 'ash-wisp'] },
    'brute': { name: 'Moss Brute', theme: 'bridge', foes: ['moss-brute'] },
    'orchard': { name: 'Imps and a Lantern Thief', theme: 'orchard', foes: ['cinder-imp', 'lantern-thief', 'cinder-imp'] },
    'golem': { name: 'Bramble Golem (boss)', theme: 'briar', foes: ['bramble-golem'] },
    'swarm': { name: 'Bog swarm (4)', theme: 'marsh', foes: ['ash-wisp', 'mire-toad', 'cinder-imp', 'ash-wisp'] }
  };
  var DECKS = {
    starter: ['thorn-jab', 'thorn-jab', 'thorn-jab', 'thorn-jab', 'bark-ward', 'bark-ward', 'bark-ward', 'bark-ward', 'ember-toss', 'root-snare'],
    grown: ['thorn-jab', 'thorn-jab', 'thorn-jab', 'bark-ward', 'bark-ward', 'bark-ward', 'ember-toss', 'root-snare', 'briar-flurry', 'kindle', 'quickstep', 'ash-sweep', 'frost-pin', 'brittle-hex', 'chain-spark', 'lantern-flare', 'heartwood', 'briar-coat', 'fresh-wick', 'moss-shield'],
    status: ['kindle', 'kindle', 'ember-toss', 'ember-toss', 'frost-pin', 'frost-pin', 'brittle-hex', 'root-snare', 'bark-ward', 'bark-ward', 'briar-coat', 'heartwood']
  };
  var CONTROLS = [
    { key: 'group', label: 'Foes', type: 'select', options: Object.keys(GROUPS), names: Object.keys(GROUPS).map(function (k) { return GROUPS[k].name; }), def: 'toad-wisp', restart: true },
    { key: 'deck', label: 'Deck', type: 'select', options: Object.keys(DECKS), names: ['Starter (10)', 'Grown (20, every card)', 'Status build (12)'], def: 'grown', restart: true },
    { key: 'energy', label: 'Lumen per turn', type: 'range', min: 1, max: 6, step: 1, def: 3, restart: true },
    { key: 'draw', label: 'Cards drawn per turn', type: 'range', min: 3, max: 8, step: 1, def: 5, restart: true },
    { key: 'fan', label: 'Hand fan (degrees per card)', type: 'range', min: 0, max: 10, step: 1, def: 6 },
    { key: 'speed', label: 'Playback speed', type: 'range', min: 0.5, max: 3, step: 0.25, def: 1 },
    { key: 'intents', label: 'Intent tags', type: 'select', options: ['on', 'off'], def: 'on' },
    { key: 'numbers', label: 'Built-in numbers', type: 'select', options: ['on', 'off'], def: 'on' },
    { key: 'arrow', label: 'Target arrow', type: 'select', options: ['on', 'off'], def: 'on' },
    { key: 'art', label: 'Card illustrations', type: 'select', options: ['glyph', 'pack'], names: ['Code-drawn glyphs', 'L-07 painted pack'], def: 'glyph' },
    { key: 'seed', label: 'Seed', type: 'range', min: 1, max: 50, step: 1, def: 3, restart: true }
  ];
  var P = {}; CONTROLS.forEach(function (c) { var v = qs.get(c.key); P[c.key] = v == null ? c.def : c.type === 'range' ? +v : v; });
  var canvas = document.getElementById('game'), g = canvas.getContext('2d'), live = document.getElementById('live');
  var auto = qs.get('auto') !== '0', honesty = { acts: 0, kept: 0, shownSum: 0, dealtSum: 0 }, intents = {}, pend = {}, frame = 0, fights = 0, results = [];
  // L-07 pack (optional): its 2:3 painted illustrations, cover-fitted into the card's art window. Keys map from this deck's art keys.
  var PACK_KEY = { blade: 'blade', guard: 'guard', fire: 'fire', frost: 'frost', storm: 'storm', root: 'regen', light: 'light', magic: 'magic', heart: 'heart', speed: 'speed' }, imgs = {};
  function loadPack(done) {
    var keys = Object.keys(PACK_KEY).map(function (k) { return PACK_KEY[k]; }).filter(function (v, i, a) { return a.indexOf(v) === i; }), left = keys.length;
    keys.forEach(function (k) { var im = new Image(); im.onload = im.onerror = function () { if (--left === 0) done(); }; im.src = '../../card-art/assets/cards/' + k + '.webp'; imgs[k] = im; });
  }
  function drawArt(ctx, key, r) {
    if (P.art !== 'pack') return false; var im = imgs[PACK_KEY[key] || key]; if (!im || !im.complete || !im.naturalWidth) return false;
    var s = Math.max(r.w / im.naturalWidth, r.h / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s;
    ctx.drawImage(im, r.x + (r.w - w) / 2, r.y + (r.h - h) * 0.28, w, h); return true;
  }
  var C = GameDNA_CardBattle.create({
    view: { x: 0, y: 0, w: W, h: H }, seed: P.seed, autoplay: auto,
    params: { energy: P.energy, draw: P.draw, fan: P.fan, speed: P.speed, intents: P.intents, numbers: P.numbers, arrow: P.arrow },
    drawBackground: function (ctx, view, t) { ART.draw(ctx, GROUPS[P.group].theme, t); }, drawArt: drawArt,
    onEvent: function (e) {
      if (e.kind === 'intent') intents[e.unit] = e.move;
      if (e.kind === 'act') { honesty.acts++; if (intents[e.unit] === e.move) honesty.kept++; pend[e.unit] = { shown: e.shown, dealt: 0 }; }
      if (e.kind === 'damage' && e.side === 'hero' && pend[e.source] && !e.tag) pend[e.source].dealt += e.raw;
      if (e.kind === 'actDone' && pend[e.unit]) { honesty.shownSum += pend[e.unit].shown; honesty.dealtSum += pend[e.unit].dealt; delete pend[e.unit]; }
    },
    onEnd: function (r) { results.push(r); restartIn = 150; }
  });
  var restartIn = -1;
  function start() { fights++; intents = {}; pend = {}; C.setParams({ energy: P.energy, draw: P.draw }); C.start({ deck: DECKS[P.deck].slice(), foes: GROUPS[P.group].foes.slice(), seed: (P.seed * 131 + fights * 7) >>> 0, energy: P.energy, draw: P.draw, hero: { hp: 70, maxHp: 70, name: 'Lanternbearer' } }); C.setAuto(auto); }
  // controls
  var box = document.getElementById('controls');
  CONTROLS.forEach(function (c) {
    var l = document.createElement('label'), s = document.createElement('span'), el;
    if (c.type === 'range') { el = document.createElement('input'); el.type = 'range'; el.min = c.min; el.max = c.max; el.step = c.step; el.value = P[c.key]; }
    else { el = document.createElement('select'); c.options.forEach(function (o, i) { var op = document.createElement('option'); op.value = o; op.textContent = c.names ? c.names[i] : o; el.appendChild(op); }); el.value = P[c.key]; }
    function lab() { s.innerHTML = c.label + ': <b>' + (c.type === 'range' ? P[c.key] : (c.names ? c.names[c.options.indexOf(P[c.key])] : P[c.key])) + '</b>'; }
    el.addEventListener('input', function () { P[c.key] = c.type === 'range' ? +el.value : el.value; lab(); var p = {}; p[c.key] = P[c.key]; C.setParams(p); if (c.key === 'art' && P.art === 'pack' && !imgs.blade) loadPack(function () { }); if (c.restart) start(); });
    lab(); l.appendChild(s); l.appendChild(el); box.appendChild(l);
  });
  document.getElementById('restart').onclick = function () { start(); };
  var ab = document.getElementById('autoBtn'); function setAuto(on) { auto = on; C.setAuto(on); ab.textContent = 'Auto: ' + (on ? 'on' : 'off'); } ab.onclick = function () { setAuto(!auto); };
  document.getElementById('endBtn').onclick = function () { C.key('end'); };
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', x: 'back', X: 'back', Escape: 'back', e: 'end', E: 'end' };
  var q = [];
  addEventListener('keydown', function (e) { if (e.target && e.target.tagName === 'SELECT') return; if (e.key === 'p' || e.key === 'P') { setAuto(!auto); return; } var k = KEYS[e.key]; if (!k) return; e.preventDefault(); if (auto) setAuto(false); q.push(k); });
  function loc(e) { var r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; }
  canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch (x) { } if (auto) setAuto(false); var p = loc(e); q.push(['down', p[0], p[1]]); });
  canvas.addEventListener('pointermove', function (e) { var p = loc(e); q.push(['move', p[0], p[1]]); });
  canvas.addEventListener('pointerup', function (e) { var p = loc(e); q.push(['up', p[0], p[1]]); });
  function tick() {
    frame++; var k = q; q = []; k.forEach(function (x) { if (Array.isArray(x)) C.pointer(x[0], x[1], x[2]); else C.key(x); });
    C.update(STEP);
    if (restartIn > 0 && --restartIn === 0) { if (auto) start(); }
  }
  function fit() { var r = canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1), bw = Math.min(2560, Math.round((r.width || 640) * dpr)), bh = Math.round(bw * H / W); if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; } }
  addEventListener('resize', fit);
  function render() {
    g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0); g.imageSmoothingEnabled = true;
    C.drawScene(g); C.drawUI(g);
    var s = C._state(), h = '';
    if (s) {
      h = '<b>Turn ' + s.turn + '</b> · HP ' + s.hero.hp + '/' + s.hero.maxHp + (s.hero.ward ? ' · Ward ' + s.hero.ward : '') + ' · Lumen ' + s.energy + '/' + s.energyMax + ' · draw ' + s.draw.length + ', discard ' + s.discard.length + (s.stats.reshuffles ? ' (reshuffled ' + s.stats.reshuffles + '×)' : '') + '<br>' +
        s.foes.filter(function (f) { return f.hp > 0; }).map(function (f) { var v = C.intentOf(f.id); return '<b>' + f.name + '</b> ' + f.hp + '/' + f.maxHp + (v ? ' <span class="dim">intends ' + v.name + (v.damage ? ' (' + v.damage + ')' : '') + '</span>' : ''); }).join(' · ') +
        '<br><span class="' + (honesty.kept === honesty.acts && honesty.shownSum === honesty.dealtSum ? 'ok' : 'bad') + '">Intents kept: ' + honesty.kept + ' / ' + honesty.acts + ' moves, damage shown ' + honesty.shownSum + ' = dealt ' + honesty.dealtSum + '</span>' +
        (results.length ? ' <span class="dim">· fights: ' + results.map(function (r) { return r === 'win' ? 'W' : 'L'; }).join('') + '</span>' : '');
    }
    if (h !== live._h) { live.innerHTML = h; live._h = h; }
  }
  function boot() {
    fit(); start();
    if (FROZEN) { var n = Math.floor(FREEZE_AT / STEP); for (var i = 0; i < n; i++) tick(); render(); document.documentElement.setAttribute('data-state', JSON.stringify(C.state())); return; }
    var last = performance.now(), acc = 0;
    (function loop(now) { acc += Math.min(250, now - last); last = now; while (acc >= STEP) { tick(); acc -= STEP; } render(); requestAnimationFrame(loop); })(last);
  }
  window.DEMO = { C: C, P: P, step: function (n) { for (var i = 0; i < n; i++) tick(); render(); } };
  /* text state for critics and tools/sprites/statecheck.py. Every foe is a front-view monster the module paints without
     any mirror (first-person card battler) and the hero is a frontal portrait in the HUD panel: nobody has a side. */
  window.__state = function () {
    var s = C._state(), L = []; if (!s) return { t: Math.round(frame * STEP), actors: L };
    var ha = C.anchor(s.hero.id) || {}, alive = s.foes.filter(function (f) { return f.hp > 0; });
    L.push({ id: s.hero.id, x: Math.round(ha.x), y: Math.round(ha.footY), facing: null, target: alive.length ? alive[0].id : null, noFace: 'frontal portrait in the HUD panel' });
    s.foes.forEach(function (f) { var a = C.anchor(f.id) || {}; L.push({ id: f.id, x: Math.round(a.x), y: Math.round(a.footY), facing: null, target: s.hero.id, noFace: f.hp > 0 ? 'front-view monster (looks at the player)' : 'dead' }); });
    return { t: Math.round(frame * STEP), actors: L };
  };
  var go = function () { if (P.art === 'pack') loadPack(boot); else boot(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else setTimeout(go, 0);
})();
