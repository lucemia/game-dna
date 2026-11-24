/* K-03 demo: the module plays its own generated floors with the bot; controls change the view and the generator live. */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search), STEP = 1000 / 60, RD = GameDNA_RaycastDungeon;
  var FREEZE_AT = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : null, FROZEN = FREEZE_AT !== null && qs.get('freeze') === '1';
  var seed = (+qs.get('seed') >>> 0) || 7, canvas = document.getElementById('screen'), g = canvas.getContext('2d');
  var W = 420, H = 252, K = 2, C = null, frame = 0, manual = false, endAt = null;
  var ids = ['fov', 'eyeBack', 'fog', 'lantern', 'minimap', 'theme', 'size', 'rooms', 'doors', 'density', 'torches'], REGEN = { theme: 1, size: 1, rooms: 1, doors: 1, density: 1, torches: 1 };
  ids.forEach(function (id) { var el = document.getElementById(id); if (qs.has(id)) el.value = qs.get(id); });
  function val(id) { var el = document.getElementById(id); return el.tagName === 'SELECT' ? el.value : +el.value; }
  function params() { var th = val('theme'); return { fov: val('fov'), eyeBack: val('eyeBack'), fog: val('fog'), lantern: val('lantern'), minimap: val('minimap'), themes: [th, th, th], size: val('size'), rooms: val('rooms'), doors: val('doors'), density: val('density'), torches: val('torches'), floors: 3 }; }
  function outputs() { ids.forEach(function (id) { var el = document.getElementById(id), o = el.parentNode.querySelector('output'); if (o) o.textContent = el.tagName === 'SELECT' ? '' : el.value; }); document.getElementById('info').textContent = 'seed ' + seed + (manual ? ' - you play' : ' - autoplay'); }
  function fit() {
    var cssW = Math.max(280, canvas.parentNode.clientWidth || 640), dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1)), phone = cssW < 520;
    var devW = Math.floor(cssW * dpr), target = phone ? 200 : 420; K = Math.max(1, Math.round(devW / target)); W = Math.floor(devW / K); H = Math.floor(W * (phone ? 0.95 : 0.6));
    canvas.width = W * K; canvas.height = H * K; canvas.style.width = (W * K / dpr) + 'px'; canvas.style.height = (H * K / dpr) + 'px';
    if (C) C.setView({ x: 0, y: 0, w: W, h: H });
  }
  function make() {
    C = RD.create({ view: { x: 0, y: 0, w: W, h: H }, seed: seed, params: params(), onEnd: function () { endAt = frame + 180; } });
    C.start({ seed: seed }); C.setAuto(!manual); endAt = null;
  }
  ids.forEach(function (id) { document.getElementById(id).addEventListener('input', function () { outputs(); if (REGEN[id]) make(); else C.setParams(params()); }); });
  document.getElementById('reseed').addEventListener('click', function () { seed = (seed * 48271 + 11) % 99991 + 1; make(); outputs(); });
  document.getElementById('play').addEventListener('click', function () { manual = !manual; C.setAuto(!manual); this.textContent = manual ? 'Autoplay' : 'Take control'; outputs(); });
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', q: 'left', e: 'right', a: 'strafeleft', d: 'straferight', z: 'attack', ' ': 'wait', c: 'potion', m: 'map' };
  addEventListener('keydown', function (e) { var k = KEYS[e.key] || KEYS[(e.key || '').toLowerCase()]; if (!k) return; e.preventDefault(); if (!manual) { manual = true; C.setAuto(false); document.getElementById('play').textContent = 'Autoplay'; outputs(); } if (!e.repeat) C.key(k); });
  canvas.addEventListener('pointerdown', function (e) { var r = canvas.getBoundingClientRect(); if (!manual) { manual = true; C.setAuto(false); outputs(); } C.pointer('down', (e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height); });
  function tick() { frame++; C.update(STEP); if (endAt != null && frame >= endAt) { seed = seed % 97 + 3; make(); } }
  function render() {
    g.setTransform(K, 0, 0, K, 0, 0); g.imageSmoothingEnabled = false; g.fillStyle = '#060408'; g.fillRect(0, 0, W, H);
    C.drawScene(g); C.drawUI(g); drawRays(); 
  }
  // top-down: the explored map and the camera's rays (every 4th column)
  var rc = document.getElementById('rays'), rg = rc.getContext('2d');
  function drawRays() {
    var m = C.map(), ex = C.explored(), cam = C.camera(), F = C.fieldRect(), s = Math.floor(rc.width / Math.max(m.w, m.h)), ox = Math.floor((rc.width - m.w * s) / 2), oy = Math.floor((rc.height - m.h * s) / 2);
    rg.fillStyle = '#0a070e'; rg.fillRect(0, 0, rc.width, rc.height);
    for (var y = 0; y < m.h; y++) for (var x = 0; x < m.w; x++) { var t = m.cells[y * m.w + x]; rg.fillStyle = t === 0 ? (ex[y * m.w + x] ? '#3a3046' : '#1c1624') : t === 3 ? '#a86a34' : t === 4 ? '#5ad0d8' : t === 2 ? '#e89a3a' : (ex[y * m.w + x] ? '#8a7a9a' : '#2c2438'); rg.fillRect(ox + x * s, oy + y * s, s - (t === 0 ? 0 : 1), s - (t === 0 ? 0 : 1)); }
    var cols = RD.castColumns(m, cam, F.w), B = { dx: Math.cos(cam.a), dy: Math.sin(cam.a) }, half = Math.tan(cam.fov * Math.PI / 360);
    rg.strokeStyle = 'rgba(255,214,120,0.55)'; rg.lineWidth = 1; rg.beginPath();
    for (var c = 0; c < F.w; c += 4) { var cx = ((c + 0.5) / F.w) * 2 - 1, rdx = B.dx - B.dy * half * cx, rdy = B.dy + B.dx * half * cx, d = cols.zbuf[c]; rg.moveTo(ox + cam.x * s, oy + cam.y * s); rg.lineTo(ox + (cam.x + rdx * d) * s, oy + (cam.y + rdy * d) * s); }
    rg.stroke();
    C.enemies().forEach(function (e) { if (e.gone) return; rg.fillStyle = e.boss ? '#ff40c0' : '#ff4a3a'; rg.fillRect(ox + e.x * s + s * 0.25, oy + e.y * s + s * 0.25, s * 0.5, s * 0.5); });
    rg.fillStyle = '#fff4c0'; rg.beginPath(); rg.arc(ox + cam.x * s, oy + cam.y * s, Math.max(2, s * 0.25), 0, 7); rg.fill();
  }
  // the cast: every built-in monster in its poses, plus the white hit-flash silhouette
  function drawCast() {
    var cc = document.getElementById('cast'), cg = cc.getContext('2d'), list = ['slime', 'bat', 'knight', 'king'], poses = ['idle0', 'wind', 'strike', 'hurt', 'flash'], cw = 96, ch = 52;
    cc.width = poses.length * cw; cc.height = list.length * ch; cg.imageSmoothingEnabled = false; cg.fillStyle = '#0a070e'; cg.fillRect(0, 0, cc.width, cc.height);
    list.forEach(function (id, r) {
      var d = RD.ENEMIES[id];
      poses.forEach(function (p, i) {
        var x = i * cw + cw / 2, foot = r * ch + ch - 4, spr = RD.spriteFor(d.look, p === 'flash' ? 'hurt' : p, null), k = Math.max(0.5, (ch - 8) / (spr.foot + 1));
        var t = document.createElement('canvas'); t.width = spr.w; t.height = spr.h; var tg = t.getContext('2d'), im = tg.createImageData(spr.w, spr.h); im.data.set(spr.d);
        if (p === 'flash') for (var j = 0; j < im.data.length; j += 4) if (im.data[j + 3]) { im.data[j] = im.data[j + 1] = im.data[j + 2] = 255; im.data[j + 3] = 255; }
        tg.putImageData(im, 0, 0); cg.drawImage(t, Math.round(x - spr.w * k / 2), Math.round(foot - (spr.foot + 1) * k), Math.round(spr.w * k), Math.round(spr.h * k));
        if (r === 0) { cg.fillStyle = '#a898b8'; cg.font = '11px sans-serif'; cg.textAlign = 'center'; }
      });
    });
  }
  window.__state = function () { return { t: Math.round(frame * STEP), actors: C ? C.actors() : [] }; };
  window.__demo = { C: function () { return C; } };
  addEventListener('resize', function () { fit(); if (FROZEN && C) render(); });
  fit(); outputs(); make(); drawCast();
  if (FROZEN) { var n = Math.floor(FREEZE_AT / STEP); for (var i = 0; i < n; i++) tick(); render(); window.__frozen = true; return; }
  var last = performance.now(), acc = 0;
  (function loop(now) { acc += Math.min(250, now - last); last = now; while (acc >= STEP) { tick(); acc -= STEP; } render(); requestAnimationFrame(loop); })(last);
})();
