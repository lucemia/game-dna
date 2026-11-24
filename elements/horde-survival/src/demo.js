/* A-11 demo: the module alone, with live parameters, scene presets and stress buttons. ?scene=swarm|stress|boss|levelup|early,
   ?t=<ms>&freeze=1 (deterministic still), ?<param>=<value>, ?seed=, ?auto=0 to drive yourself. */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search), M = GameDNA_HordeSurvival, K = window.GameDNA_DemoKit;
  var qn = function (k, d) { var v = Q.get(k); return v == null || v === '' || isNaN(+v) ? d : +v; };
  var FREEZE = Q.get('freeze') === '1', T_MS = qn('t', -1), SEED = qn('seed', 3), STEP = 1000 / 60, W = 640, H = 360;   // narrow screens: the stage is portrait (360 x 640 logical)
  var SCENE = Q.get('scene') || 'swarm', AUTO = Q.get('auto') !== '0';
  var LOOKS = { slime: 'slime', imp: 'imp', wisp: 'wisp', harpy: 'harpy', cultist: 'cultist', golem: 'golem' };
  var VA = window.GameDNA_VigilArt, IMG = {}, HERO_H = 46;
  var ICONS = { bolt: 'staff', blades: 'sword', pulse: 'amulet', lance: 'bow', boots: 'boots', heart: 'potion', magnet: 'gem', hourglass: 'shock', might: 'burn', ring: 'ring', leaf: 'regen', ration: 'bread' };
  function paintHero(g, x, footY, o) { var im = IMG.keeper, A = VA && VA.keeper; if (!im) return false; var f = Math.max(0, Math.min(A.n - 1, o.frame | 0)), k = o.h / A.bodyH;
    g.save(); g.translate(x, footY); if (o.facing !== A.facing) g.scale(-1, 1); g.drawImage(im, f * A.cellW, 0, A.cellW, A.cellH, -A.ax * A.cellW * k, -A.foot * k, A.cellW * k, A.cellH * k); g.restore(); return true; }
  var ICONFN = {}; Object.keys(ICONS).forEach(function (name) { ICONFN[name] = function (g, x, y, sz) { var im = IMG.icons, A = VA && VA.icons; if (!im) return; var i = A.keys.indexOf(ICONS[name]), c = A.cell, d = sz * 1.08;
    g.save(); g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = sz * 0.08; g.shadowOffsetY = sz * 0.04; g.drawImage(im, (i % A.cols) * c, Math.floor(i / A.cols) * c, c, c, x - d / 2, y - d / 2, d, d); g.restore(); }; });
  var CONTROLS = [
    { key: 'enemyCap', label: 'Enemy cap', type: 'range', min: 100, max: 900, step: 50 },
    { key: 'spawnRate', label: 'Spawn rate x', type: 'range', min: 0.5, max: 2.5, step: 0.25 },
    { key: 'heroSpeed', label: 'Hero speed (px/s)', type: 'range', min: 60, max: 160, step: 10 },
    { key: 'magnet', label: 'Gem pull reach (px)', type: 'range', min: 30, max: 200, step: 10 },
    { key: 'hpScale', label: 'Foe toughness x', type: 'range', min: 0.5, max: 2, step: 0.25 },
    { key: 'choices', label: 'Upgrade choices', type: 'range', min: 2, max: 4, step: 1 },
    { key: 'duration', label: 'Boss arrives at (s)', type: 'range', min: 60, max: 600, step: 20, restart: true },
    { key: 'startWeapon', label: 'Start weapon', type: 'select', options: ['bolt', 'blades', 'pulse', 'lance'], restart: true },
    { key: 'numbers', label: 'Hit numbers', type: 'select', options: ['on', 'off'] }
  ];
  var params = {}; CONTROLS.forEach(function (c) { var d = M.DEFAULTS[c.key]; params[c.key] = Q.get(c.key) == null ? d : (c.type === 'select' ? Q.get(c.key) : qn(c.key, d)); });
  if (SCENE === 'stress' && Q.get('enemyCap') == null) params.enemyCap = 900;
  var canvas = document.getElementById('game'), ctx = canvas.getContext('2d'), inst = null, frame = 0, held = {}, drawMs = 0;

  function paintActor(g, look, x, footY, o) { if (look === 'hero') return paintHero(g, x, footY, o); var id = LOOKS[look]; if (!id || !K || !K.has(id)) return false; var tr = window.__spriteTrace; window.__spriteTrace = null; try { K.sprite(g, id, x, footY, { h: o.h, facing: o.facing, shadow: false }); } finally { window.__spriteTrace = tr; } return true; }
  function traceDraw(look, x, footY, h, facing) { if (look === 'hero') { window.__spriteTrace.push({ id: 'keeper-walk', x: x, footY: footY, h: h, facing: facing, native: 'right', flipX: facing !== 'right', variant: null }); return; } var id = LOOKS[look]; if (!id) return; var Mt = K.meta(id) || {}; window.__spriteTrace.push({ id: id, x: x, footY: footY, h: h, facing: facing, native: Mt.facing || 'right', flipX: K.flipX(id, facing), variant: GameDNA_DemoKitArt.sprites[id + '@' + facing] ? facing : null }); }
  function crowd(n, rng) {
    var kinds = ['slime', 'slime', 'slime', 'imp', 'imp', 'harpy', 'wisp', 'cultist', 'harpy'], hero = inst.hero();
    for (var i = 0; i < n; i++) { var a = rng() * Math.PI * 2, r = 130 + Math.sqrt(rng()) * 330; inst.spawn(kinds[(rng() * kinds.length) | 0], hero.x + Math.cos(a) * r, hero.y + Math.sin(a) * r * 0.8); }
  }
  function lcg(s) { return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function restart() {
    inst = M.create({ view: { x: 0, y: 0, w: W, h: H }, seed: SEED, params: params, paintActor: paintActor, traceDraw: traceDraw, heroFrames: { n: 5, stride: 0.62 }, heroH: HERO_H, icons: ICONFN, autoplay: AUTO && SCENE !== 'levelup' || Q.get('auto') === '1' });
    inst.start({ seed: SEED });
    var rng = lcg(SEED * 7 + 1), w;
    if (SCENE === 'swarm' || SCENE === 'stress') {
      inst.skipTo(150000); ['blades', 'pulse', 'lance'].forEach(function (id) { inst.giveWeapon(id); });
      for (w = 0; w < 2; w++) ['bolt', 'blades', 'pulse', 'lance'].forEach(function (id) { inst.giveWeapon(id); });
      inst.setLevel(14); crowd(qn('crowd', SCENE === 'stress' ? 600 : 280), rng);
    } else if (SCENE === 'boss') {
      inst.skipTo(params.duration * 1000 - 1500, { boss: true });
      for (w = 0; w < 3; w++) ['bolt', 'blades', 'pulse', 'lance'].forEach(function (id) { inst.giveWeapon(id); });
      inst.setLevel(18); crowd(60, rng);
      var hb = inst.hero(); inst.spawn('golem', hb.x + 130, hb.y + 105);   // the Colossus starts inside the view, below the HUD, in any layout
    } else if (SCENE === 'early') {
      var h0 = inst.hero(); for (w = 0; w < 9; w++) { var a0 = w / 9 * Math.PI * 2 + 0.3; inst.spawn('slime', h0.x + Math.cos(a0) * 300, h0.y + Math.sin(a0) * 200); }
    } else if (SCENE === 'levelup') {
      inst.giveWeapon('blades'); crowd(40, rng); inst.grantXp(inst.hero().need);
    }
    frame = 0;
  }
  /* ---------- controls ---------- */
  var box = document.getElementById('controls');
  CONTROLS.forEach(function (c) {
    var l = document.createElement('label'), val = document.createElement('b'), el;
    l.textContent = c.label; l.appendChild(val);
    if (c.type === 'select') { el = document.createElement('select'); c.options.forEach(function (o) { var op = document.createElement('option'); op.value = op.textContent = o; el.appendChild(op); }); }
    else { el = document.createElement('input'); el.type = 'range'; el.min = c.min; el.max = c.max; el.step = c.step; }
    el.value = params[c.key]; val.textContent = params[c.key];
    el.addEventListener('input', function () { params[c.key] = c.type === 'select' ? el.value : +el.value; val.textContent = params[c.key]; if (c.restart) restart(); else inst.setParams(params); });
    l.appendChild(el); box.appendChild(l);
  });
  var bar = document.getElementById('buttons');
  function btn(label, fn, cls) { var b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', function () { fn(b); canvas.focus(); }); bar.appendChild(b); return b; }
  ['swarm', 'stress', 'boss', 'levelup', 'early'].forEach(function (s) { btn({ swarm: 'Swarm (280)', stress: 'Stress (600)', boss: 'Boss', levelup: 'Level up', early: 'From the start' }[s], function () { SCENE = s; if (s === 'stress') params.enemyCap = Math.max(params.enemyCap, 900); restart(); }); });
  btn('+100 foes', function () { crowd(100, lcg(frame + 11)); });
  btn('Weapons +1', function () { ['bolt', 'blades', 'pulse', 'lance'].forEach(function (id) { inst.giveWeapon(id); }); });
  var ab = btn('Autoplay', function (b) { AUTO = !AUTO; inst.setAuto(AUTO); b.className = AUTO ? 'on' : ''; }, AUTO ? 'on' : '');
  /* ---------- input ---------- */
  var KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down', z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok' };
  window.addEventListener('keydown', function (e) { var k = KEYS[e.key]; if (!k) return; e.preventDefault(); if (!held[e.key]) { if (!inst.key(k) && AUTO && k !== 'ok') { AUTO = false; inst.setAuto(false); ab.className = ''; } } held[e.key] = true; });
  window.addEventListener('keyup', function (e) { delete held[e.key]; });
  function lp(e) { var r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
  canvas.addEventListener('pointerdown', function (e) { try { canvas.setPointerCapture(e.pointerId); } catch (x) { } var p = lp(e); if (AUTO && !inst.offer()) { AUTO = false; inst.setAuto(false); ab.className = ''; } inst.pointer('down', p[0], p[1]); e.preventDefault(); });
  canvas.addEventListener('pointermove', function (e) { var p = lp(e); inst.pointer('move', p[0], p[1]); });
  canvas.addEventListener('pointerup', function (e) { var p = lp(e); inst.pointer('up', p[0], p[1]); });
  /* ---------- loop ---------- */
  function tick() {
    frame++;
    var hx = (held.ArrowRight || held.d ? 1 : 0) - (held.ArrowLeft || held.a ? 1 : 0), hy = (held.ArrowDown || held.s ? 1 : 0) - (held.ArrowUp || held.w ? 1 : 0);
    inst.setInput(hx, hy); inst.update(STEP);
    if (inst.over() && !FREEZE && frame % 360 === 0) restart();
  }
  function fit() { var r = canvas.getBoundingClientRect(), d = Math.min(3, window.devicePixelRatio || 1), por = r.height > r.width; W = por ? 360 : 640; H = por ? Math.round(360 * r.height / r.width) : 360; canvas.width = Math.round(r.width * d); canvas.height = Math.round(r.height * d); if (inst) inst.setView({ x: 0, y: 0, w: W, h: H }); }
  var statsEl = document.getElementById('stats');
  function render() {
    var t0 = performance.now();
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0); ctx.fillStyle = '#10140e'; ctx.fillRect(0, 0, W, H);
    inst.draw(ctx);
    drawMs = drawMs * 0.9 + (performance.now() - t0) * 0.1;
    if (frame % 15 === 0) { var st = inst.stats(); statsEl.textContent = 'foes ' + st.enemies + ' (drawn ' + st.drawn + ')  shots ' + st.projectiles + '  gems ' + st.gems + '  update ' + st.stepAvgMs.toFixed(2) + ' ms  draw ' + drawMs.toFixed(2) + ' ms  kills ' + st.kills; }
  }
  window.__demo = { inst: function () { return inst; }, restart: restart, render: render, step: function (n) { for (var i = 0; i < (n || 1); i++) tick(); } };
  window.__demoState = function () { return inst.state(); };
  window.__state = function () {
    var out = { t: Math.round(frame * STEP), actors: [] }, h = inst.hero(), ha = inst.anchor('hero');
    out.actors.push({ id: 'hero', x: ha.x, y: ha.footY, facing: h.face > 0 ? 'right' : 'left', vx: Math.abs(h.vx) > 4 ? h.vx : 0, target: null, asset: 'keeper-walk' });
    var list = inst.enemies(); list.sort(function (a, b) { return Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y); });
    list.slice(0, 60).forEach(function (e) { out.actors.push({ id: e.id + '-' + e.kind, x: e.sx, y: e.sy, facing: e.face > 0 ? 'right' : 'left', vx: e.boss || Math.abs(e.vx) <= 3 ? 0 : e.vx, target: e.boss ? 'hero' : null, asset: LOOKS[(inst.lib.enemies[e.kind] || {}).look] || null }); });
    return out;
  };
  function boot() {
    fit(); window.addEventListener('resize', function () { fit(); if (FREEZE) render(); });
    restart();
    if (T_MS >= 0) { var n = Math.round(T_MS / STEP); for (var i = 0; i < n; i++) tick(); render(); window.__frozen = true; if (FREEZE) return; }
    var acc = 0, last = performance.now();
    (function loop(now) { acc += Math.min(250, now - last); last = now; while (acc >= STEP) { tick(); acc -= STEP; } render(); requestAnimationFrame(loop); })(last);
  }
  function loadArt(done) { if (!VA) { done(); return; } var n = 2; ['keeper', 'icons'].forEach(function (k) { var im = new Image(); im.onload = im.onerror = function () { if (im.naturalWidth) IMG[k] = im; if (--n === 0) done(); }; im.src = VA[k].src; }); }
  loadArt(function () { if (K) K.ready(boot); else boot(); });
})();
