/* N-05 demo: the module alone. Modes: race (six AI karts, the camera rides with kart #1; a new race starts after the
   finish), play (you drive kart #1: arrows / WASD, Space drift), eight (eight karts drive out along the eight compass
   directions on a test plaza, seen from above), sheet (every kart in six views and poses, studio light).
   ?t=<ms>&freeze=1 fast-forwards the fixed 60 Hz simulation and draws one frame; ?<param>=<value> overrides a parameter;
   ?drive=<dx>,<dz> drives one kart on the plaza toward a world direction from a sideways start (checks/facing-3d.py). */
(function () {
  'use strict';
  var PARAMS = /*PARAMS*/[], VARIANTS = /*VARIANTS*/[];
  var KR3 = window.GameDNA_KartRacer3D, THREE = window.THREE, Q = new URLSearchParams(location.search), DT = 1 / 60;
  var P = {}; PARAMS.forEach(function (p) { P[p.key] = Q.has(p.key) ? (p.type === 'range' ? +Q.get(p.key) : Q.get(p.key)) : p.default; });
  var OPT = { t: Q.has('t') ? +Q.get('t') : null, freeze: Q.get('freeze') === '1', drive: Q.get('drive'), seed: +(Q.get('seed') || 3), glcheck: Q.get('glcheck') === '1' };
  var mode = OPT.drive ? 'drive' : P.mode;
  var glc = document.getElementById('gl'), ui = document.getElementById('ui'), g = ui.getContext('2d'), stage = document.getElementById('stage');
  var mp = {}; PARAMS.forEach(function (p) { if (['mode', 'track', 'palette'].indexOf(p.key) < 0) mp[p.key] = P[p.key]; });
  if (P.palette !== 'track') mp.palette = P.palette;
  var KR = KR3.create({ THREE: THREE, canvas: glc, params: mp, preserve: OPT.glcheck });
  var D = window.DEMO = { KR: KR, mode: mode, P: P, time: 0 };
  var IDS = ['rook', 'wren', 'juno', 'bram', 'tilly', 'odo'], race = 0, finishAt = null, held = {};
  function grid(ai) { return IDS.map(function (id, i) { return { id: i === 0 ? 'player' : id, kart: id, player: i === 0, ai: ai }; }); }
  var EIGHT = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
  function setup() {
    if (!KR.ok) return;
    if (mode === 'race' || mode === 'play') {
      KR.startRace({ track: P.track, karts: grid(mode === 'race'), laps: P.laps, seed: OPT.seed + race, playerSlot: 2 });
      KR.setAI('player', mode === 'race'); KR.countdown(); finishAt = null;
    } else if (mode === 'eight' || mode === 'drive') {
      var list = mode === 'drive' ? [{ id: 'player', kart: 'rook', player: true }] : EIGHT.map(function (e, i) { return { id: 'k' + i, kart: IDS[i % 6], player: i === 0 }; });
      KR.startRace({ track: 'plaza', karts: list, seed: OPT.seed }); KR.setPhase('free');
      var c = KR.track;
      list.forEach(function (l, i) {
        var dir = mode === 'drive' ? OPT.drive.split(',').map(Number) : EIGHT[i], a = Math.atan2(dir[0], dir[1]);
        // drive mode: start sideways (90 deg off) so the kart has to turn into the commanded direction
        var h0 = mode === 'drive' ? a + Math.PI / 2 : a, r0 = mode === 'drive' ? 0 : 4;
        KR.teleport(l.id, c.cx + Math.sin(a) * r0, c.cz + Math.cos(a) * r0, h0, 0); KR.setAI(l.id, false); KR.kart(l.id).want = a;
      });
      KR.setCamera(mode === 'drive' ? 'fixed' : 'top', { target: list[0].id }); KR.snapCamera();
    } else if (mode === 'sheet') {
      KR.startRace({ track: 'plaza', karts: IDS.map(function (id, i) { return { id: id, kart: id, player: i === 0, ai: false }; }), seed: 1 });
      KR.world().visible = false; KR.scene.background = new THREE.Color(0x2a3150); KR.scene.fog = null;
      var floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x56627c })); floor.receiveShadow = true; KR.scene.add(floor);
      var line = new THREE.Mesh(new THREE.PlaneGeometry(200, 0.04).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8382c })); line.position.y = 0.002; KR.scene.add(line);
      IDS.forEach(function (id, i) { KR.teleport(id, i * 8 - 20, 0, 0, 0); });
      D.floor = floor;
    }
  }
  // world-direction controller for the eight / drive modes: steer toward the commanded heading, full throttle
  function dirInput(k) { var err = Math.atan2(Math.sin(k.want - k.h), Math.cos(k.want - k.h)); return { steer: Math.max(-1, Math.min(1, -err * 3)), throttle: 1, brake: 0, drift: false }; }
  function step() {
    D.time += DT;
    if (!KR.ok) return;
    if (mode === 'eight' || mode === 'drive') {
      // non-player karts in eight mode are steered through the same controller (they are not AI)
      KR.karts().forEach(function (k) { if (!k.player) KR.setInput(k.id, dirInput(k)); });
      KR.step(dirInput(KR.player()), DT);
      return;
    }
    if (mode === 'sheet') return;
    var inp = { steer: (held.ArrowRight || held.KeyD ? 1 : 0) - (held.ArrowLeft || held.KeyA ? 1 : 0), throttle: held.ArrowUp || held.KeyW ? 1 : 0, brake: held.ArrowDown || held.KeyS ? 1 : 0, drift: !!(held.Space || held.ShiftLeft) };
    KR.step(inp, DT);
    if (KR.race.phase === 'finished') { if (finishAt == null) finishAt = D.time; if (D.time - finishAt > 1.5) KR.setCamera('orbit', { target: 'player' }); if (D.time - finishAt > 6) { race++; setup(); } }
  }
  addEventListener('keydown', function (e) { held[e.code] = true; if (/Arrow|Space/.test(e.code)) e.preventDefault(); if (/^Digit[1-4]$/.test(e.code)) setParam('mode', ['race', 'play', 'eight', 'sheet'][+e.code.slice(5) - 1]); });
  addEventListener('keyup', function (e) { held[e.code] = false; });

  // ---------------------------------------------------------------- drawing
  var dpr = 1, W = 1, H = 1;
  function resize() {
    var r = stage.getBoundingClientRect(); W = Math.max(1, r.width | 0); H = Math.max(1, r.height | 0);
    dpr = Math.min(window.devicePixelRatio || 1, 2); ui.width = Math.round(W * dpr); ui.height = Math.round(H * dpr);
    if (KR.ok) KR.resize(W, H);
  }
  addEventListener('resize', resize);
  var FONT = "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif";
  var SHEET_COLS = [{ name: 'front 3/4', a: Math.PI * 0.22, h: 1.3 }, { name: 'left side', a: Math.PI * 0.5, h: 0.9 }, { name: 'back 3/4', a: Math.PI * 0.8, h: 1.4 },
    { name: 'rear', a: Math.PI, h: 1.2 }, { name: 'drift right + boost', a: Math.PI * 0.72, h: 1.5, pose: { drift: 1, steer: 1, boost: 1 } }, { name: 'airborne', a: Math.PI * 0.35, h: 1.0, pose: { air: 0.9, steer: -0.6 } }];
  function drawSheet() {
    var R = KR.renderer, cam = KR.camera, cols = SHEET_COLS.length, rows = IDS.length, top = 30, cw = W / cols, chh = (H - top) / rows;
    R.setScissorTest(true); R.setClearColor(0x2a3150); R.clear();
    IDS.forEach(function (id, r) {
      SHEET_COLS.forEach(function (c, ci) {
        KR.pose(id, c.pose || {}); var k = KR.kart(id), x = ci * cw, y = H - (top + (r + 1) * chh);
        R.setViewport(x, y, cw, chh); R.setScissor(x + 1, y + 1, cw - 2, chh - 2);
        cam.aspect = cw / chh; cam.fov = 34; cam.updateProjectionMatrix();
        var d = 4.6; cam.position.set(k.x + Math.sin(c.a) * d, c.h + (c.pose && c.pose.air ? 0.9 : 0), k.z + Math.cos(c.a) * d); cam.lookAt(k.x, 0.55 + (c.pose && c.pose.air ? 0.9 : 0), k.z);
        R.render(KR.scene, cam);
      });
      KR.pose(id, {});
    });
    R.setScissorTest(false);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.fillStyle = '#ffd25a'; g.font = '700 14px ' + FONT; g.textAlign = 'center';
    SHEET_COLS.forEach(function (c, ci) { g.fillText(c.name, (ci + 0.5) * cw, 20); });
    g.textAlign = 'left'; g.font = '700 12px ' + FONT; g.fillStyle = '#f4f2ea';
    IDS.forEach(function (id, r) { g.fillText(KR3.KARTS[id].name + ' #' + KR3.KARTS[id].number, 8, top + r * chh + 16); });
    g.strokeStyle = 'rgba(255,214,90,0.35)'; g.lineWidth = 1; for (var i = 1; i < cols; i++) { g.beginPath(); g.moveTo(i * cw, top); g.lineTo(i * cw, H); g.stroke(); } for (i = 1; i < rows; i++) { g.beginPath(); g.moveTo(0, top + i * chh); g.lineTo(W, top + i * chh); g.stroke(); }
  }
  function draw() {
    if (!KR.ok) { KR.drawFallback && KR.drawFallback(); return; }
    if (mode === 'sheet') { drawSheet(); return; }
    KR.render();
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (mode === 'race' || mode === 'play') KR.drawHud(g, W, H, {});
    if (mode === 'eight') {
      KR.karts().forEach(function (k) { var a = KR.anchor(k.id); if (!a || !a.visible) return; var e = EIGHT[+k.id.slice(1)], lab = (e[1] > 0 ? 'N' : e[1] < 0 ? 'S' : '') + (e[0] > 0 ? 'W' : e[0] < 0 ? 'E' : '')    /* +x is west: screen-left in the top view, as on the minimap */;
        g.font = '800 13px ' + FONT; var w = g.measureText(lab).width + 14; g.fillStyle = 'rgba(12,16,36,0.75)'; g.beginPath(); g.roundRect ? g.roundRect(a.x - w / 2, a.y - 26, w, 20, 10) : g.rect(a.x - w / 2, a.y - 26, w, 20); g.fill(); g.fillStyle = '#ffd25a'; g.textAlign = 'center'; g.fillText(lab, a.x, a.y - 11); });
    }
  }

  // ---------------------------------------------------------------- panel
  function setParam(k, v) { var q = new URLSearchParams(location.search); q.set(k, v); q.delete('t'); q.delete('freeze'); location.search = q.toString(); }
  function buildPanel() {
    var vb = document.getElementById('variants'), cb = document.getElementById('controls'); if (!vb || !cb) return;
    VARIANTS.forEach(function (v) { var b = document.createElement('button'); b.textContent = v.name; b.onclick = function () { var q = new URLSearchParams(); for (var k in v.params) q.set(k, v.params[k]); location.search = q.toString(); }; vb.appendChild(b); });
    PARAMS.forEach(function (p) {
      var row = document.createElement('div'); row.className = 'row'; var lab = document.createElement('label'); lab.innerHTML = p.label + ' <b>' + P[p.key] + '</b>'; row.appendChild(lab);
      var el;
      if (p.type === 'range') { el = document.createElement('input'); el.type = 'range'; el.min = p.min; el.max = p.max; el.step = p.step; el.value = P[p.key]; el.oninput = function () { lab.querySelector('b').textContent = el.value; }; el.onchange = function () { setParam(p.key, el.value); }; }
      else { el = document.createElement('select'); p.options.forEach(function (o) { var op = document.createElement('option'); op.value = op.textContent = o; if (o === P[p.key]) op.selected = true; el.appendChild(op); }); el.onchange = function () { setParam(p.key, el.value); }; }
      row.appendChild(el); cb.appendChild(row);
    });
  }

  // ---------------------------------------------------------------- boot
  window.__state = function () { var s = KR.state(); s.mode = mode; return s; };
  window.__advance = function (ms) { var n = Math.round(ms / (DT * 1000)); for (var i = 0; i < n; i++) step(); draw(); return window.__state(); };
  buildPanel(); resize(); setup(); if (KR.ok) KR.precompile();
  if (!KR.ok) { window.__frozen = true; return; }
  if (OPT.t != null) { var n = Math.round(OPT.t / (DT * 1000)); for (var i = 0; i < n; i++) step(); draw(); if (OPT.freeze) { window.__frozen = true; return; } }
  var acc = 0, last = performance.now();
  (function loop(now) { acc += Math.min(100, now - last); last = now; var k = 0; while (acc >= DT * 1000 && k < 5) { step(); acc -= DT * 1000; k++; } draw(); requestAnimationFrame(loop); })(last);
})();
