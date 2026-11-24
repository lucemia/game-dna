/* N-01 demo: the module alone on a small courtyard island. Modes: tour (autopilot loop), play (keyboard / touch drag),
   eight (walks the 8 camera-relative directions with a fixed camera), sheet (every character and pose, one cell each).
   ?t=<ms>&freeze=1 fast-forwards the fixed 60 Hz simulation and draws one frame; ?<param>=<value> overrides a parameter;
   ?drive=<x>,<y>[&run=1] holds one camera-relative stick direction from the start (used by checks/facing-3d.py). */
(function () {
  'use strict';
  var PARAMS = /*PARAMS*/[], VARIANTS = /*VARIANTS*/[];
  var TP3 = window.GameDNA_ThirdPerson3D, THREE = window.THREE, Q = new URLSearchParams(location.search), DT = 1 / 60;
  var P = {}; PARAMS.forEach(function (p) { P[p.key] = Q.has(p.key) ? (p.type === 'range' ? +Q.get(p.key) : Q.get(p.key)) : p.default; });
  var REBUILD = { gear: 1, palette: 1, shadows: 1, mode: 1 };
  var OPT = { t: Q.has('t') ? +Q.get('t') : null, freeze: Q.get('freeze') === '1', drive: Q.get('drive'), run: Q.get('run') === '1' };
  var mode = OPT.drive ? 'drive' : P.mode;
  var glc = document.getElementById('gl'), ui = document.getElementById('ui'), g = ui.getContext('2d'), stage = document.getElementById('stage');
  var mp = {}; for (var k in P) if (k !== 'mode') mp[k] = P[k];
  if (mode === 'eight' || mode === 'drive' || mode === 'sheet') mp.autoAlign = 0;
  var TP = TP3.create({ THREE: THREE, canvas: glc, overlay: ui, params: mp, seed: 5, glCheck: Q.get('glcheck') === '1' });
  var D = window.DEMO = { TP: TP, mode: mode, P: P, time: 0 };

  // ---------------------------------------------------------------- scene (a compact courtyard, open in the middle)
  var hero = null, cast = [];
  if (TP.ok) {
    TP.buildIsland({ radius: 15, seed: 3 });
    TP.paint.path([[0, 14], [0, 5]], 1.5); TP.paint.path([[-5, -1], [-12, -4]], 1.3); TP.paint.path([[4.6, -2], [11, -6]], 1.3); TP.paint.plaza(0, 0, 0.6, 5.2);
    TP.paint.flowers(7, 7, 3, ['#f6f0e0', '#f2c84a', '#e86a8a'], 160); TP.paint.flowers(-8, 7, 3, ['#b48ae6', '#f6f0e0'], 140); TP.paint.done();
    TP.buildLayout([
      { kind: 'arch', x: 0, z: 7.2 }, { kind: 'wall', x: -4.2, z: 7.2, len: 4.4 }, { kind: 'wall', x: 4.2, z: 7.2, len: 4.4 },
      { kind: 'pillar', x: 5.6, z: 2.4 }, { kind: 'pillar', x: -5.6, z: 2.4, broken: true, v: 1 }, { kind: 'pillar', x: 4.4, z: -4.6, broken: true, v: 2 }, { kind: 'pillar', x: -4.4, z: -4.6 },
      { kind: 'fountain', x: 0, z: -8.4 }, { kind: 'lantern', x: 2.0, z: 5.6, rot: Math.PI }, { kind: 'lantern', x: -6.8, z: -1.6 },
      { kind: 'stall', x: -8.8, z: 4.6, rot: 0.7, cloth: '#c8463c' }, { kind: 'barrel', x: -10.4, z: 2.4 }, { kind: 'crate', x: -7.0, z: 6.6, rot: 0.4 },
      { kind: 'tree', x: 8.6, z: -2.4, s: 1.1 }, { kind: 'tree', x: 10.4, z: 3.4, s: 1.0, pine: true }, { kind: 'tree', x: -10.6, z: -6.0, s: 1.15 }, { kind: 'tree', x: 6.6, z: 10.4, s: 1.0 },
      { kind: 'tree', x: -7.2, z: 10.6, s: 1.1, pine: true }, { kind: 'tree', x: 4.2, z: -11.6, s: 1.0, pine: true }, { kind: 'tree', x: -4.4, z: -11.8, s: 1.05 },
      { kind: 'rock', x: 9.4, z: -8.4, s: 1.1 }, { kind: 'rock', x: -11.6, z: 1.0, s: 0.9 }, { kind: 'rock', x: 11.8, z: 6.8, s: 0.8 },
      { kind: 'bush', x: 2.8, z: 9.0 }, { kind: 'bush', x: -2.9, z: 9.2, berries: true }, { kind: 'bush', x: 7.4, z: -6.2, berries: true }, { kind: 'bush', x: -8.0, z: -2.6 }
    ]);
    TP.scatter({ count: 520, flowers: 100, seed: 4, avoid: function (x, z) { return Math.hypot(x, z) < 5.6 || (Math.abs(x) < 1.2 && z > 5); } });
    hero = TP.addActor({ id: 'hero', kind: 'hero', x: 0, z: mode === 'tour' ? 11.5 : 0, yaw: Math.PI });
    TP.setHero('hero'); TP.snapCamera(0);
    if (mode !== 'drive' && mode !== 'eight') {
      var k1 = TP.addActor({ id: 'keeper', kind: 'npc', x: -7.6, z: -6.6, yaw: 0.4, look: { base: 'keeper' }, height: 1.75 });
      var v1 = TP.addActor({ id: 'villager', kind: 'npc', x: 7.2, z: 5.6, yaw: -1.2, look: { base: 'villager' }, height: 1.6 });
      cast.push(k1, v1);
    }
    TP.addPickup({ id: 'shard-a', x: 9.0, z: 0.6 }); TP.addPickup({ id: 'shard-b', x: -9.4, z: -3.0 });
  }

  // ---------------------------------------------------------------- modes
  var TOUR = [[0, 3, 0], [3.2, -1.4, 1], [9.0, 0.6, 1], [6.8, -5.4, 0], [0.4, -5.6, 1], [-6.2, -4.2, 1], [-9.4, -3.0, 0], [-6.8, 0.8, 1], [-2.2, 5.2, 0], [0, 11.5, 1]];
  var tourI = 0, eightI = 0, eightT = 0, held = {}, drag = null;
  var EIGHT = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
  function input() {
    if (mode === 'drive') { var d = OPT.drive.split(',').map(Number); return { x: d[0], y: d[1], run: OPT.run }; }
    if (mode === 'tour') {
      var w = TOUR[tourI], r = TP.autopilot({ x: w[0], z: w[1] }, { near: 0.5, run: !!w[2] });
      if (r.arrived) tourI = (tourI + 1) % TOUR.length; return r;
    }
    if (mode === 'eight') {
      eightT += DT; var ph = eightT % 1.6, e = EIGHT[eightI % 8];
      if (eightT >= 1.6) { eightT = 0; eightI++; }
      if (ph < 1.1) { var l = Math.hypot(e[0], e[1]); return { x: e[0] / l, y: e[1] / l, run: false }; }
      return { x: 0, y: 0 };
    }
    var x = (held.KeyD || held.ArrowRight ? 1 : 0) - (held.KeyA || held.ArrowLeft ? 1 : 0), y = (held.KeyW || held.ArrowUp ? 1 : 0) - (held.KeyS || held.ArrowDown ? 1 : 0);
    var o = { x: x, y: y, run: !(held.ShiftLeft || held.ShiftRight) };
    if (held.KeyQ) o.camYaw = 1.8 * DT; if (held.KeyE) o.camYaw = -1.8 * DT; return o;
  }
  addEventListener('keydown', function (e) {
    held[e.code] = true; if (/^Digit[1-4]$/.test(e.code)) setParam('mode', ['tour', 'play', 'eight', 'sheet'][+e.code.slice(5) - 1]);
    if (/Arrow|Space/.test(e.code)) e.preventDefault();
  });
  addEventListener('keyup', function (e) { held[e.code] = false; });
  ui.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY }; ui.setPointerCapture(e.pointerId); });
  ui.addEventListener('pointermove', function (e) { if (!drag || !TP.ok) return; TP.rotateCamera(-(e.clientX - drag.x) * 0.006, (e.clientY - drag.y) * 0.004); drag = { x: e.clientX, y: e.clientY }; });
  ui.addEventListener('pointerup', function () { drag = null; });

  function step() {
    D.time += DT;
    var inp = input();
    cast.forEach(function (a) { a.target = Math.hypot(a.x - hero.x, a.z - hero.z) < 6 ? 'hero' : null; a.play(Math.hypot(a.x - hero.x, a.z - hero.z) < 3.2 ? 'wave' : null); });
    TP.step(inp, DT);
  }

  // ---------------------------------------------------------------- sheet: every character alone, 4 views + walk / run poses, one scissored cell each
  var sheet = null;
  function buildSheet() {
    var specs = [], views = [['front', 0], ['faces left', -Math.PI / 2], ['back', Math.PI], ['three-quarter', -Math.PI / 4]];
    ['hero', 'keeper', 'villager'].forEach(function (base, row) {
      views.forEach(function (v, col) { specs.push({ base: base, view: v[0], yaw: v[1], row: row, col: col }); });
    });
    [['walk', 0.0], ['walk', 0.25], ['run', 0.0], ['run', 0.25]].forEach(function (p, col) { specs.push({ base: 'hero', view: p[0] + ' ' + p[1], yaw: -Math.PI / 2, row: 3, col: col, pose: p }); });
    [['hero', 'wave'], ['hero', 'cheer'], ['hero', 'bow'], ['keeper', 'wave']].forEach(function (p, col) { specs.push({ base: p[0], view: p[1], yaw: -Math.PI / 5, row: 4, col: col, gesture: p[1] }); });
    TP.actors().forEach(function (a) { a.root.visible = false; });
    TP.pickups().forEach(function (p) { p.obj.visible = false; });
    sheet = specs.map(function (s, i) {
      var x = 60 + (i % 4) * 40, z = 60 + Math.floor(i / 4) * 40;
      var a = TP.addActor({ id: 'sheet-' + i, kind: s.base === 'hero' ? 'hero' : 'npc', x: x, z: z, yaw: s.yaw, look: { base: s.base, gear: s.base === 'hero' ? P.gear : undefined }, height: s.base === 'villager' ? 1.6 : 1.7 });
      a.external = true; a.ghost = true; s.actor = a;
      var disc = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshLambertMaterial({ color: 0xd8cfb8 })); disc.rotation.x = -Math.PI / 2; disc.position.set(x, 0, z); disc.receiveShadow = true; TP.scene.add(disc);
      var line = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.02), new THREE.MeshBasicMaterial({ color: 0xc0392b })); line.rotation.x = -Math.PI / 2; line.position.set(x, 0.004, z + 0.9); TP.scene.add(line);
      if (s.pose || s.gesture) { var run = !!s.pose && s.pose[0] === 'run', walk = !!s.pose;
        TP3.poseAdventurer(a.parts, { amp: run ? 0.82 : walk ? 0.5 : 0, phase: walk ? s.pose[1] * Math.PI * 2 : 0, run: run ? 1 : 0, time: 0.17, robe: s.base === 'keeper', headPitch: 0, headYaw: 0, capeAngle: run ? 0.5 : 0.25, gesture: s.gesture || null, gestureW: s.gesture ? 1 : 0 });
        a.parts.body.position.y = 0; var my = 1e9; a.root.updateMatrixWorld(true);
        a.model.traverse(function (o) { if (!o.isMesh || o.userData.noBounds) return; var p = o.geometry.attributes.position, v = new THREE.Vector3(); for (var j = 0; j < p.count; j++) { v.fromBufferAttribute(p, j).applyMatrix4(o.matrixWorld); if (v.y < my) my = v.y; } });
        a.parts.body.position.y = -my / a.scale; a.root.updateMatrixWorld(true); }

      return s;
    });
    TP.scene.fog.near = 200; TP.scene.fog.far = 400;
    (TP.distant || []).forEach(function (o) { o.visible = false; }); if (TP.clouds) TP.clouds.visible = false;
  }
  function renderSheet() {
    var R = TP.renderer, sz = TP.size(), cols = 4, rows = 5, cw = sz.w / cols, ch = sz.h / rows, cam = new THREE.PerspectiveCamera(30, cw / ch, 0.1, 100);
    R.setScissorTest(true);
    sheet.forEach(function (s) {
      var a = s.actor, x = s.col * cw, y = (rows - 1 - s.row) * ch;
      R.setViewport(x, y, cw, ch); R.setScissor(x, y, cw, ch);
      cam.position.set(a.x, 1.25, a.z + 5.6); cam.lookAt(a.x, 0.95, a.z); cam.updateMatrixWorld();
      TP.sun.target.position.set(a.x, 0, a.z); TP.sun.position.set(a.x + 12, 30, a.z + 20); TP.sun.target.updateMatrixWorld();
      R.render(TP.scene, cam);
    });
    R.setScissorTest(false); R.setViewport(0, 0, sz.w, sz.h);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.font = '600 12px Trebuchet MS, sans-serif'; g.textAlign = 'center';
    sheet.forEach(function (s) {
      var x = s.col * cw, y = s.row * ch; g.strokeStyle = 'rgba(232,200,106,0.35)'; g.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
      g.fillStyle = 'rgba(16,22,42,0.75)'; g.fillRect(x + cw / 2 - 70, y + ch - 24, 140, 18); g.fillStyle = '#f2ead8'; g.fillText(s.base + ': ' + s.view, x + cw / 2, y + ch - 11);
      // foot line tick: projected y = 0 under the actor
    });
  }

  // ---------------------------------------------------------------- overlay: mode caption and, in tour, a name tag from the actor anchor
  var dpr = 1, W = 1, H = 1;
  function resize() {
    var r = stage.getBoundingClientRect(); W = Math.max(1, r.width | 0); H = Math.max(1, r.height | 0); dpr = Math.min(devicePixelRatio || 1, 2);
    ui.width = Math.round(W * dpr); ui.height = Math.round(H * dpr); if (TP.ok) TP.resize(W, H);
  }
  addEventListener('resize', resize);
  var CAP = { tour: 'Tour: the autopilot walks and runs a loop; props between camera and hero fade', play: 'Play: WASD / arrows, Shift to walk, drag or Q / E to turn the camera',
    eight: 'Eight directions: camera fixed, the hero turns to every move direction', drive: 'Drive', sheet: 'Sheet' };
  function overlay() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (mode === 'drive') return;
    cast.forEach(function (a) {
      var an = TP.anchor(a.id); if (!an || !an.visible || an.depth > 14) return;
      var name = a.id === 'keeper' ? 'Keeper' : 'Villager'; g.font = '700 12px Trebuchet MS, sans-serif'; var w = g.measureText(name).width + 16;
      g.fillStyle = 'rgba(16,22,42,0.72)'; g.beginPath(); g.roundRect ? g.roundRect(an.x - w / 2, an.y - 24, w, 19, 9) : g.rect(an.x - w / 2, an.y - 24, w, 19); g.fill();
      g.fillStyle = '#ffe6a0'; g.textAlign = 'center'; g.fillText(name, an.x, an.y - 10);
    });
    var cap = CAP[mode] || ''; g.font = '600 13px Trebuchet MS, sans-serif'; var cw = Math.min(W - 24, g.measureText(cap).width + 24);
    g.fillStyle = 'rgba(16,22,42,0.78)'; g.beginPath(); g.roundRect ? g.roundRect(12, H - 40, cw, 28, 14) : g.rect(12, H - 40, cw, 28); g.fill();
    g.strokeStyle = 'rgba(232,200,106,0.6)'; g.stroke(); g.fillStyle = '#f2ead8'; g.textAlign = 'left';
    g.save(); g.beginPath(); g.rect(12, H - 40, cw - 8, 28); g.clip(); g.fillText(cap, 24, H - 21); g.restore();
  }
  function draw() { if (!TP.ok) { TP.drawFallback(); return; } if (mode === 'sheet') { renderSheet(); return; } TP.render(); overlay(); }

  // ---------------------------------------------------------------- controls (from element.json params)
  function setParam(key, val) {
    P[key] = val;
    if (REBUILD[key] || key === 'heroHeight') { var q = new URLSearchParams(location.search); q.set(key, val); q.delete('t'); q.delete('freeze'); location.search = q.toString(); return; }
    TP.params[key] = +val;
    if (key === 'fov') { TP.camera.fov = +val; TP.camera.updateProjectionMatrix(); }
    if (key === 'camPitch') TP.cam.pitch = +val * Math.PI / 180;
    var lab = document.getElementById('v-' + key); if (lab) lab.textContent = val;
  }
  var box = document.getElementById('controls');
  PARAMS.forEach(function (p) {
    var row = document.createElement('div'); row.className = 'row';
    if (p.type === 'range') {
      row.innerHTML = '<label>' + p.label + ' <b id="v-' + p.key + '">' + P[p.key] + '</b></label><input type="range" min="' + p.min + '" max="' + p.max + '" step="' + p.step + '" value="' + P[p.key] + '">';
      var inp = row.querySelector('input'); inp.addEventListener(p.key === 'heroHeight' ? 'change' : 'input', function () { setParam(p.key, inp.value); });
      if (p.key === 'heroHeight') inp.addEventListener('input', function () { document.getElementById('v-heroHeight').textContent = inp.value; });
    } else {
      row.innerHTML = '<label>' + p.label + '</label><select>' + p.options.map(function (o) { return '<option' + (String(P[p.key]) === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>';
      var sel = row.querySelector('select'); sel.addEventListener('change', function () { setParam(p.key, sel.value); });
    }
    box.appendChild(row);
  });
  var vb = document.getElementById('variants');
  VARIANTS.forEach(function (v) {
    var b = document.createElement('button'); b.textContent = v.name;
    b.onclick = function () { var q = new URLSearchParams(); PARAMS.forEach(function (p) { var val = v.params[p.key] != null ? v.params[p.key] : p.default; if (val !== p.default) q.set(p.key, val); }); location.search = q.toString(); };
    vb.appendChild(b);
  });

  // ---------------------------------------------------------------- boot
  window.__state = function () { var s = TP.state(); s.mode = mode; return s; };
  resize();
  if (TP.ok && mode === 'sheet') buildSheet();
  if (!TP.ok) { draw(); window.__frozen = true; return; }
  if (OPT.t != null) { var n = Math.round(OPT.t / (DT * 1000)); for (var i = 0; i < n; i++) if (mode !== 'sheet') step(); draw(); if (OPT.freeze) { window.__frozen = true; return; } }
  var acc = 0, last = performance.now();
  (function loop(now) { acc += Math.min(100, now - last); last = now; var c = 0; while (acc >= DT * 1000 && c < 5) { if (mode !== 'sheet') step(); acc -= DT * 1000; c++; } draw(); requestAnimationFrame(loop); })(last);
})();
