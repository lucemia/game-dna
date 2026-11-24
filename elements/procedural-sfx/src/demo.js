/* F-02 procedural-sfx demo: sound board + a small pixel scene that triggers the sounds from game events.
 * ?t=<ms>&freeze=1 runs the scene's autoplay to that time and stops (deterministic); ?<param>=<value> overrides; ?preset=<id> selects a pad.
 * window.__state() = {t, actors, sounds (the module's recent events), unlocked, mode, params}. ASCII only. */
(function () {
  'use strict';
  var SX = window.GameDNA_Sfx, PXS = window.GameDNA_PixelScene;
  var Q = new URLSearchParams(location.search), HAS_T = Q.has('t'), FREEZE = Q.get('freeze') === '1', START_T = +Q.get('t') || 0;
  var STEP = 1000 / 60;
  var GROUPS = [
    { id: 'combat', label: 'Combat', color: '#ff7a5c', presets: ['hit', 'crit', 'laser', 'explosion', 'hurt'] },
    { id: 'pickup', label: 'Pickups', color: '#ffd166', presets: ['coin', 'powerup', 'heal'] },
    { id: 'move', label: 'Movement', color: '#7cc4ff', presets: ['jump', 'land', 'footstep'] },
    { id: 'ui', label: 'Menus', color: '#c79bff', presets: ['menu-move', 'menu-confirm', 'menu-cancel'] }
  ];
  var GROUP_OF = {}, COLOR_OF = {};
  GROUPS.forEach(function (g) { g.presets.forEach(function (p) { GROUP_OF[p] = g; COLOR_OF[p] = g.color; }); });
  var CTLS = [
    { key: 'master', label: 'Master', min: 0, max: 1, step: 0.05 },
    { key: 'sfx', label: 'SFX volume', min: 0, max: 1, step: 0.05 },
    { key: 'variation', label: 'Variation', min: 0, max: 1, step: 0.05 },
    { key: 'style', label: 'Style', options: ['modern', 'retro', 'soft'] },
    { key: 'pitch', label: 'Pitch (st)', min: -12, max: 12, step: 1 },
    { key: 'brightness', label: 'Brightness', min: 0.4, max: 1.6, step: 0.05 },
    { key: 'length', label: 'Length', min: 0.5, max: 1.6, step: 0.05 },
    { key: 'maxVoices', label: 'Max voices', min: 1, max: 32, step: 1 },
    { key: 'duck', label: 'Duck (dB)', min: 0, max: 18, step: 1 },
    { key: 'stride', label: 'Step stride', min: 4, max: 200, step: 1 },
    { key: 'mute', label: 'Mute', check: true }
  ];
  var init = {};
  CTLS.forEach(function (c) { if (Q.has(c.key)) init[c.key] = c.options || c.check ? Q.get(c.key) : +Q.get(c.key); });
  var lastFrom = 'none', selected = SX.resolve(Q.get('preset')) || 'coin', fiveMode = null;
  var sfx = SX.create({ seed: 7, params: init, onEvent: function (ev) { onSound(ev); } });
  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- sound board ---------------- */
  var thumbs = {};
  GROUPS.forEach(function (g) {
    var d = document.createElement('div'); d.className = 'group g-' + g.id; d.style.setProperty('--gc', g.color);
    d.innerHTML = '<h3>' + g.label + '</h3><div class="pads"></div>';
    g.presets.forEach(function (p) {
      var b = document.createElement('button'); b.className = 'pad'; b.dataset.p = p; b.style.setProperty('--gc', g.color);
      b.title = p; b.innerHTML = '<span class="nm">' + SX.meta[p].label + '<small class="db" title="peak level; the waveform is drawn to its own peak"></small></span><canvas width="200" height="26"></canvas><span class="flash"></span>';
      b.addEventListener('click', function () { select(p); lastFrom = 'board'; fiveMode = null; sfx.unlock(); sfx.play(p); });
      d.querySelector('.pads').appendChild(b); thumbs[p] = b;
    });
    $('groups').appendChild(d);
  });
  function select(p) { selected = p; Object.keys(thumbs).forEach(function (k) { thumbs[k].classList.toggle('sel', k === p); }); }
  select(selected);
  function flashPad(p) { var b = thumbs[p]; if (!b) return; b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); }

  // waveform helpers (offline render = exactly what plays for that seed and those params)
  var renderCache = {};
  function renderOf(p, seed) {
    var key = p + ':' + seed + ':' + JSON.stringify(sfx.params());
    if (!renderCache[key]) { renderCache[key] = SX.render(p, seed, { params: sfx.params() }); var ks = Object.keys(renderCache); if (ks.length > 80) delete renderCache[ks[0]]; }
    return renderCache[key];
  }
  function envelope(r, cols) {
    var L = r.left, R = r.right, n = r.length, out = [], per = n / cols, peak = 0;
    for (var c = 0; c < cols; c++) {
      var a = Math.floor(c * per), b = Math.min(n, Math.floor((c + 1) * per)), mn = 0, mx = 0;
      for (var i = a; i < b; i++) { var v = (L[i] + R[i]) * 0.5; if (v < mn) mn = v; if (v > mx) mx = v; }
      out.push([mn, mx]); peak = Math.max(peak, -mn, mx);
    }
    return { cols: out, peak: peak };
  }
  function drawThumb(p) {
    var cv = thumbs[p].querySelector('canvas'), g = cv.getContext('2d');
    return renderOf(p, 1).then(function (r) {
      if (!r) return;
      var W = cv.width, H = cv.height, e = envelope(r, W / 2), col = COLOR_OF[p], nk = 0.95 / Math.max(0.02, e.peak);   // each pad drawn to its own peak
      g.clearRect(0, 0, W, H);
      var tag = thumbs[p].querySelector('.db'); if (tag) tag.textContent = (20 * Math.log10(Math.max(1e-6, e.peak))).toFixed(0) + ' dB';
      g.fillStyle = col; g.globalAlpha = 0.9;
      e.cols.forEach(function (c, i) { var y0 = H / 2 - c[1] * nk * H * 0.5, y1 = H / 2 - c[0] * nk * H * 0.5; g.fillRect(i * 2, y0, 1.4, Math.max(1, y1 - y0)); });
      g.globalAlpha = 1;
    });
  }
  function drawThumbs() { return Promise.all(SX.presets.map(drawThumb)); }

  /* ---------------- last sound panel ---------------- */
  var last = [];   // [{ev, r, at}] (at = performance.now() when it played, or scene ms for still frames)
  function onSound(ev) {
    if (!ev || !ev.preset || ev.status === 'unknown') return;
    if (!fastForward) flashPad(ev.preset);
    if (fiveMode && ev.preset === fiveMode.p && fiveMode.left > 0) { fiveMode.left--; } else if (!fiveMode || ev.preset !== fiveMode.p) { last = []; fiveMode = null; }
    var item = { ev: ev, r: null, at: performance.now(), from: lastFrom };
    last.push(item); if (last.length > 5) last.shift();
    if (!fastForward) renderOf(ev.preset, ev.seed).then(function (r) { item.r = r; });
    lastFrom = 'scene';
    logDirty = true;
  }
  function drawWave(nowAt) {
    var cv = $('wave'), dpr = Math.min(3, window.devicePixelRatio || 1), cw = cv.clientWidth || 900, ch = cv.clientHeight || 150;
    if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    var g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    // grid
    g.strokeStyle = '#ffffff10'; g.lineWidth = 1;
    for (var x = 0; x <= 10; x++) { g.beginPath(); g.moveTo(Math.round(x * W / 10) + 0.5, 0); g.lineTo(Math.round(x * W / 10) + 0.5, H); g.stroke(); }
    var items = last.filter(function (it) { return it.r; });
    if (!items.length) {
      g.fillStyle = '#9c95b8'; g.font = (13 * dpr) + 'px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText('Click a pad: its waveform shows here', W / 2, H / 2 + 4 * dpr); return;
    }
    var maxDur = Math.max.apply(null, items.map(function (it) { return it.r.length / it.r.rate; })), rows = items.length, rh = H / rows;
    items.forEach(function (it, k) {
      var r = it.r, col = COLOR_OF[it.ev.preset], cols = Math.max(10, Math.round(W * (r.length / r.rate) / maxDur / (2 * dpr))), e = envelope(r, cols), cy = rh * k + rh / 2, amp = rh * 0.46 / Math.max(0.3, e.peak);
      var grad = g.createLinearGradient(0, cy - rh / 2, 0, cy + rh / 2); grad.addColorStop(0, col); grad.addColorStop(0.5, '#ffffff'); grad.addColorStop(1, col);
      g.fillStyle = grad; g.globalAlpha = it.ev.status === 'played' ? 0.95 : 0.55;
      var colW = 2 * dpr;
      e.cols.forEach(function (c, i) { var y0 = cy - c[1] * amp, y1 = cy - c[0] * amp; g.fillRect(i * colW, y0, Math.max(1, colW - dpr * 0.6), Math.max(dpr, y1 - y0)); });
      g.globalAlpha = 1;
      // playhead
      var el = ((nowAt != null ? nowAt - it.ev.t : performance.now() - it.at)) / 1000, dur = r.length / r.rate;
      if (el >= 0 && el <= dur) { var px = (el / maxDur) * W; g.fillStyle = '#ffffffd0'; g.fillRect(px, cy - rh / 2 + 2 * dpr, 1.5 * dpr, rh - 4 * dpr); }
      if (rows > 1) { g.fillStyle = '#9c95b8'; g.font = (10 * dpr) + 'px ui-monospace, Menlo, monospace'; g.textAlign = 'left'; g.fillText('seed ' + it.ev.seed, 6 * dpr, cy - rh / 2 + 12 * dpr); }
    });
    var lastIt = items[items.length - 1], ev = lastIt.ev, pk = envelope(lastIt.r, 64).peak;
    $('info').innerHTML = '<span><b>' + SX.meta[ev.preset].label + '</b> (' + ev.preset + ')</span><span>seed <b>' + ev.seed + '</b></span><span>length <b>' + Math.round(lastIt.r.length / lastIt.r.rate * 1000 - 60) + ' ms</b></span><span>peak <b>' + (20 * Math.log10(Math.max(1e-6, pk))).toFixed(1) + ' dBFS</b></span><span>pan <b>' + (ev.pan || 0) + '</b></span><span>status <b>' + ev.status + '</b></span>' + (rows > 1 ? '<span><b>' + rows + '</b> variations, top = first</span>' : '');
  }
  $('again').addEventListener('click', function () { lastFrom = 'board'; fiveMode = null; sfx.unlock(); sfx.play(selected); });
  $('five').addEventListener('click', function () {
    sfx.unlock(); last = []; fiveMode = { p: selected, left: 5 }; lastFrom = 'board';
    for (var i = 0; i < 5; i++) (function (i) { setTimeout(function () { lastFrom = 'board'; sfx.play(selected, { force: true }); }, i * Math.max(260, SX.describe(selected, 1, sfx.params()).dur * 1000 + 120)); })(i);
  });

  /* ---------------- controls ---------------- */
  var thumbTimer = null;
  CTLS.forEach(function (c) {
    var row = document.createElement('div'); row.className = 'ctl';
    var val = sfx.params()[c.key], input;
    if (c.options) { input = document.createElement('select'); c.options.forEach(function (o) { var op = document.createElement('option'); op.value = o; op.textContent = o; input.appendChild(op); }); input.value = val; }
    else if (c.check) { input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!val; }
    else { input = document.createElement('input'); input.type = 'range'; input.min = c.min; input.max = c.max; input.step = c.step; input.value = val; }
    var lab = document.createElement('label'); lab.textContent = c.label; var out = document.createElement('output');
    var show = function () { var v = sfx.params()[c.key]; out.textContent = c.check ? (v ? 'on' : 'off') : typeof v === 'number' ? (Math.abs(v) < 2 && c.step < 1 ? v.toFixed(2) : String(v)) : v; };
    input.addEventListener('input', function () {
      var p = {}; p[c.key] = c.check ? input.checked : c.options ? input.value : +input.value; sfx.setParams(p); show(); updateSoundState();
      if (['variation', 'style', 'pitch', 'brightness', 'length'].indexOf(c.key) >= 0) { clearTimeout(thumbTimer); thumbTimer = setTimeout(drawThumbs, 120); }
    });
    input.id = 'ctl-' + c.key; lab.htmlFor = input.id;
    row.appendChild(lab); row.appendChild(input); row.appendChild(out); show();
    $('ctls').appendChild(row);
  });

  /* ---------------- sound state, log, voices ---------------- */
  function updateSoundState() {
    var el = $('soundState'), on = sfx.isUnlocked(), mu = sfx.params().mute;
    el.className = on ? (mu ? 'muted' : 'on') : '';
    $('soundText').textContent = !SX.supported() ? 'This browser has no Web Audio: silent' : on ? (mu ? 'Muted (click to unmute)' : 'Sound on (click to mute)') : 'Sound off: click anywhere to turn it on';
  }
  $('soundState').addEventListener('click', function () { if (sfx.isUnlocked()) { sfx.mute(); var m = $('ctl-mute'); if (m) m.checked = sfx.params().mute; } else sfx.unlock(); setTimeout(updateSoundState, 60); });
  document.addEventListener('pointerdown', function () { setTimeout(updateSoundState, 80); }, true);
  document.addEventListener('keydown', function () { setTimeout(updateSoundState, 80); }, true);
  var logDirty = true, meterN = -1;
  function drawLog() {
    var mv = sfx.params().maxVoices, act = sfx.active();
    if (meterN !== mv) { $('meter').innerHTML = new Array(mv + 1).join('<i></i>'); meterN = mv; }
    var is = $('meter').children; for (var i = 0; i < is.length; i++) is[i].className = i < act ? 'on' : '';
    $('voices').textContent = act + ' / ' + mv + ' voices';
    if (!logDirty) return; logDirty = false;
    $('log').innerHTML = sfx.recent(9).reverse().map(function (e) {
      var st = e.status === 'locked' ? 'locked' : e.status;
      return '<li style="--gc:' + (COLOR_OF[e.preset] || '#888') + '"><span class="t">' + (e.t / 1000).toFixed(2) + 's</span><span class="p">' + (SX.meta[e.preset] ? SX.meta[e.preset].label : e.preset) + '</span><span class="pill ' + st + '">' + (st === 'locked' ? 'needs click' : st) + '</span></li>';
    }).join('');
  }

  /* ================= the little scene ================= */
  var W = 224, H = 126, GY = 108, PLAT = { x0: 96, x1: 150, y: 80 };
  var off = document.createElement('canvas'); off.width = W; off.height = H;
  var g = off.getContext('2d'); g.imageSmoothingEnabled = false;
  var view = $('game'), vg = view.getContext('2d');
  var rs = 1;
  function rngOf(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---- baked background: sky, sun, clouds, far hills, trees, ground and the floating ledge
  var BG = document.createElement('canvas'); BG.width = W; BG.height = H;
  (function bake() {
    var b = BG.getContext('2d'), y, x;
    var SKY = ['#243a74', '#2c4a88', '#36609c', '#4878b0', '#5e90c0', '#7aa8cc', '#9cbed4', '#c4d0cc', '#e8d2b0', '#f4c896'];
    for (y = 0; y < GY; y++) {
      var f = y / (GY - 6) * (SKY.length - 1), i0 = Math.min(SKY.length - 1, Math.floor(f)), fr = f - i0;
      for (x = 0; x < W; x++) { var up = fr > 0.84 || (fr > 0.66 && ((x + y) & 1) === 0); b.fillStyle = SKY[Math.min(SKY.length - 1, up ? i0 + 1 : i0)]; b.fillRect(x, y, 1, 1); }
    }
    // sun with soft rings
    var sx = 168, sy = 70;
    [[22, '#f8d8a855'], [16, '#fae0b066'], [11, '#fdeac088'], [7, '#fff4d8'], [5, '#fffaf0']].forEach(function (r) { b.fillStyle = r[1]; for (var yy = -r[0]; yy <= r[0]; yy++) { var hw = Math.floor(Math.sqrt(r[0] * r[0] - yy * yy)); b.fillRect(sx - hw, sy + yy, hw * 2 + 1, 1); } });
    // clouds
    function cloud(cx, cy, s) { [[0, 0, 7], [6, -2, 6], [12, 0, 6], [-6, 1, 5], [17, 2, 4]].forEach(function (p) { var r = p[2] * s; for (var yy = -r; yy <= r * 0.6; yy++) { var hw = Math.floor(Math.sqrt(Math.max(0, r * r - yy * yy))); b.fillStyle = yy < -r * 0.3 ? '#fdf6ec' : yy < r * 0.2 ? '#e6e0e4' : '#b8bccc'; b.fillRect(Math.round(cx + p[0] * s - hw), Math.round(cy + p[1] * s + yy), hw * 2, 1); } }); }
    cloud(40, 22, 1); cloud(124, 14, 0.8); cloud(196, 32, 0.7);
    // far hills, two layers
    function ridge(base, amp, sc, seed, col, hl) { for (x = 0; x < W; x++) { var h = Math.round(base - PXS.noise(x, 0, sc, seed) * amp - PXS.noise(x, 7, sc / 3, seed + 1) * amp * 0.25); b.fillStyle = col; b.fillRect(x, h, 1, GY - h); b.fillStyle = hl; b.fillRect(x, h, 1, 1); } }
    ridge(92, 30, 46, 11, '#5a6c9c', '#7c8cb4'); ridge(100, 18, 30, 23, '#3e5a74', '#56768a');
    // tree line
    [[6, 'pine'], [30, 'smalltree'], [52, 'pine'], [74, 'tree'], [150, 'pine'], [176, 'smalltree'], [214, 'pine']].forEach(function (t, i) { PXS.drawProp(b, t[1], t[0], GY + 1, { v: i }, 0); });
    PXS.sideGround(b, 0, GY, W, H - GY, { seed: 3 });
    PXS.sideGround(b, PLAT.x0, PLAT.y, PLAT.x1 - PLAT.x0, 8, { seed: 9 });
    b.fillStyle = '#1a1024'; b.fillRect(PLAT.x0, PLAT.y + 8, PLAT.x1 - PLAT.x0, 1);
    b.fillStyle = 'rgba(16,10,30,0.25)'; b.fillRect(PLAT.x0 + 2, PLAT.y + 9, PLAT.x1 - PLAT.x0 - 4, 1);
    PXS.drawProp(b, 'flowers', 118, GY + 1, { v: 2 }, 0); PXS.drawProp(b, 'bush', 40, GY + 1, { v: 1 }, 0); PXS.drawProp(b, 'flowers', 190, GY + 1, { v: 5 }, 0);
  })();

  // ---- tiny 3x5 pixel font (HUD and menu)
  var FONT = { A: '7d7d5', B: '6d6d6', C: '74447', D: '6555 6', E: '74647', F: '74644', G: '74557', H: '55755', I: '72227', J: '11157', K: '55655', L: '44447', M: '57755', N: '75555', O: '75557', P: '75744', R: '75765', S: '74717', T: '72222', U: '55557', V: '55552', W: '55775', X: '55255', Y: '55222', Z: '71247',
    '0': '75557', '1': '26227', '2': '71747', '3': '71717', '4': '55711', '5': '74717', '6': '74757', '7': '71111', '8': '75757', '9': '75711', ':': '02020', 'x': '00525', '-': '00700', ' ': '00000' };
  FONT.D = '65556';
  function text(str, x, y, col, shadow) {
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      var gl = FONT[str[i]] || FONT[str[i].toUpperCase()] || FONT[' '];
      for (var r = 0; r < 5; r++) { var bits = parseInt(gl[r], 16); for (var c = 0; c < 3; c++) if (bits & (4 >> c)) { if (shadow) { g.fillStyle = shadow; g.fillRect(x + i * 4 + c, y + r + 1, 1, 1); } g.fillStyle = col; g.fillRect(x + i * 4 + c, y + r, 1, 1); } }
    }
  }

  // ---- sprites drawn in code
  var SL = {};
  function slimeArt(squash, flash) {
    var key = squash + ':' + flash; if (SL[key]) return SL[key];
    var w = 16, h = 13, c = document.createElement('canvas'); c.width = w; c.height = h; var s = c.getContext('2d');
    var bw = squash > 0 ? 7.5 : squash < 0 ? 5.5 : 6.5, bh = squash > 0 ? 4.6 : squash < 0 ? 6.4 : 5.4, cx = 7.5, by = 12;
    var RAMP = flash ? ['#ffffff', '#ffffff', '#f0f4ff', '#dfe6ff', '#ffffff'] : ['#1c4a3a', '#2f7a4c', '#46a85a', '#6cd06c', '#c8f8b0'];
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var dx = (x + 0.5 - cx) / bw, dy = (y + 0.5 - (by - bh)) / bh, inside = dy <= 1 && y < by && dx * dx + Math.min(0, dy) * Math.min(0, dy) * 1 + Math.max(0, dy) * 0 <= 1 && dx * dx + dy * dy * (dy < 0 ? 1 : 0.35) <= 1.02;
      if (!inside) continue;
      var lx = dx + 0.35, ly = dy + 0.5, l = 1 - (lx * lx + ly * ly) * 0.55, k = l > 0.8 ? 3 : l > 0.45 ? 2 : l > 0.1 ? 1 : 0;
      if (y === by - 1) k = Math.max(0, k - 1);
      s.fillStyle = RAMP[k]; s.fillRect(x, y, 1, 1);
    }
    var d = s.getImageData(0, 0, w, h), a = d.data, add = [];
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) { if (a[(y * w + x) * 4 + 3]) continue; var n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (q) { var X = x + q[0], Y = y + q[1]; return X >= 0 && Y >= 0 && X < w && Y < h && a[(Y * w + X) * 4 + 3]; }); if (n) add.push([x, y]); }
    s.fillStyle = flash ? '#c0c8e0' : '#10261e'; add.forEach(function (p) { s.fillRect(p[0], p[1], 1, 1); });
    if (!flash) { var ey = Math.round(by - bh * 1.05); s.fillStyle = '#10261e'; s.fillRect(5, ey, 2, 3); s.fillRect(9, ey, 2, 3); s.fillStyle = '#ffffff'; s.fillRect(5, ey, 1, 1); s.fillRect(9, ey, 1, 1); s.fillStyle = '#f8fff0'; s.fillRect(4, Math.round(by - bh * 1.6), 2, 1); }
    return (SL[key] = c);
  }
  function drawCoin(x, y, t) {
    var f = Math.floor(t / 110) % 6, wv = [6, 5, 3, 1, 3, 5][f], X = Math.round(x - wv / 2), Y = Math.round(y - 3);
    g.fillStyle = '#7a4a10'; g.fillRect(X - 1, Y, wv + 2, 6); g.fillRect(X, Y - 1, wv, 8);
    g.fillStyle = '#f8c838'; g.fillRect(X, Y, wv, 6); g.fillStyle = '#fff2a0'; if (wv > 2) g.fillRect(X, Y, 1, 4); g.fillStyle = '#d08a18'; if (wv > 2) g.fillRect(X + wv - 1, Y + 1, 1, 5);
  }
  function drawGem(x, y, t) {
    var bob = Math.round(Math.sin(t / 260) * 1.5), X = Math.round(x), Y = Math.round(y + bob);
    PXS.glow(g, X, Y, 9, '#ffe890', 1);
    var rows = ['...a...', '..aba..', 'aabbbaa', '.abcba.', '..aba..', '.ab.ba.', '.a...a.'], P = { a: '#c87a10', b: '#ffd848', c: '#fffbe0' };
    rows.forEach(function (r, j) { for (var i = 0; i < 7; i++) { var ch = r[i]; if (ch === '.') continue; g.fillStyle = P[ch]; g.fillRect(X - 3 + i, Y - 3 + j, 1, 1); } });
  }
  function heart(x, y, full) {
    var rows = ['.aa.aa.', 'abbabba', 'abbbbba', '.abbba.', '..aba..', '...a...'];
    rows.forEach(function (r, j) { for (var i = 0; i < 7; i++) { var ch = r[i]; if (ch === '.') continue; g.fillStyle = ch === 'a' ? '#2a1020' : full ? (j < 2 && i < 3 ? '#ff9aa8' : '#e8384c') : '#4a3248'; g.fillRect(x + i, y + j, 1, 1); } });
  }

  // ---- world state
  var Wd;
  function newWorld() {
    return {
      f: 0, rng: rngOf(4242), shake: 0, coins: 0, menu: null,
      hero: { id: 'hero', x: 34, y: GY, vx: 0, vy: 0, face: 1, ground: true, air: 0, swing: 0, swung: {}, inv: 0, hp: 5, max: 5, cd: 0, anim: 0, combo: 0, comboT: 0, target: null, hurtT: 0 },
      slimes: [
        { id: 'slimeA', x0: 62, x1: 84, x: 74, y: GY, dir: -1, hp: 3, hop: 0, wait: 40, kb: 0, flash: 0, stun: 0, dead: 0 },
        { id: 'slimeB', x0: 162, x1: 180, x: 172, y: GY, dir: 1, hp: 3, hop: 0, wait: 70, kb: 0, flash: 0, stun: 0, dead: 0 }
      ],
      coinsOn: [{ x: 114, y: 99, t: 0 }, { x: 105, y: 66, t: 0 }, { x: 160, y: 99, t: 0 }],
      gem: { x: 132, y: 69, t: 0 }, barrel: { x: 210, t: 0 }, shrine: { x: 14, cd: 0 },
      bolts: [], parts: [], auto: { phase: 0, pf: 0, n: 0 }
    };
  }
  Wd = newWorld();
  function snd(name, x, o) { o = o || {}; o.x = x; o.width = W; return sfx.play(name, o); }
  function part(x, y, vx, vy, life, col, kind) { Wd.parts.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, col: col, kind: kind || 'dot' }); }
  function burst(x, y, n, cols, sp, life, up) { for (var i = 0; i < n; i++) { var a = Wd.rng() * Math.PI * 2, v = sp * (0.4 + Wd.rng() * 0.8); part(x, y, Math.cos(a) * v, Math.sin(a) * v - (up || 0), life * (0.6 + Wd.rng() * 0.6), cols[i % cols.length]); } }

  function damageSlime(s, dmg, kbDir, crit) {
    s.hp -= dmg; s.flash = 8; s.stun = 26; s.kb = kbDir * (crit ? 2.6 : 1.7);
    burst(s.x, s.y - 5, crit ? 12 : 6, crit ? ['#fff7c0', '#ffd848', '#ffffff'] : ['#ffffff', '#c8f8b0'], crit ? 1.6 : 1.1, 16, 0.4);
    if (s.hp <= 0) { s.dead = 900; burst(s.x, s.y - 4, 14, ['#6cd06c', '#46a85a', '#c8f8b0', '#ffffff'], 1.2, 26, 0.6); }
    if (crit) { Wd.shake = Math.max(Wd.shake, 6); part(s.x, s.y - 6, 0, 0, 14, '#fff7c0', 'star'); }
  }
  function explode(x, y) {
    Wd.barrel.t = 300; Wd.shake = 14; part(x, y - 7, 0, 0, 12, '#fff8e0', 'ring');
    for (var i = 0; i < 26; i++) { var a = Wd.rng() * Math.PI * 2, v = 0.6 + Wd.rng() * 2.2; part(x, y - 6, Math.cos(a) * v, Math.sin(a) * v - 0.8, 18 + Wd.rng() * 18, ['#fff4c0', '#ffd060', '#ff8a30', '#e04a28'][i % 4], 'fire'); }
    for (i = 0; i < 12; i++) part(x + (Wd.rng() - 0.5) * 12, y - 6 - Wd.rng() * 8, (Wd.rng() - 0.5) * 0.6, -0.3 - Wd.rng() * 0.5, 40 + Wd.rng() * 30, '#5a5068', 'smoke');
    for (i = 0; i < 8; i++) part(x, y - 4, (Wd.rng() - 0.5) * 3.4, -1.6 - Wd.rng() * 2, 40, ['#82502c', '#5c3420', '#a87240'][i % 3], 'debris');
    snd('explosion', x);
    Wd.slimes.forEach(function (s) { if (!s.dead && Math.abs(s.x - x) < 36) damageSlime(s, 2, s.x < x ? -1 : 1, false); });
  }

  function stepWorld(inp) {
    var w = Wd, h = w.hero; w.f++;
    if (w.shake > 0) w.shake--;
    // ---- menu (pauses the world, not the sound clock)
    if (w.menu) {
      var m = w.menu, items = 3;
      if (inp.up) { m.i = (m.i + items - 1) % items; sfx.play('menu-move'); }
      if (inp.down) { m.i = (m.i + 1) % items; sfx.play('menu-move'); }
      if (inp.cancel) { w.menu = null; sfx.play('menu-cancel'); }
      else if (inp.ok) {
        sfx.play('menu-confirm');
        if (m.i === 0) w.menu = null;
        else if (m.i === 1) sfx.mute();
        else { var keepAuto = w.auto; Wd = newWorld(); Wd.auto = keepAuto; Wd.auto.phase = 0; Wd.auto.pf = 0; Wd.auto.n++; }
      }
      return;
    }
    if (inp.menu) { w.menu = { i: 0 }; sfx.play('menu-confirm'); return; }
    // ---- hero
    var dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (h.hurtT > 0) { h.hurtT--; dir = 0; }
    if (dir && h.swing === 0 && h.hurtT === 0) h.face = dir;
    var tv = dir * 1.15; h.vx += (tv - h.vx) * (h.ground ? (dir ? 0.3 : 0.4) : 0.12);
    if (Math.abs(h.vx) < 0.02) h.vx = 0;
    if (inp.jump && h.ground && h.hurtT === 0) { h.vy = -4.25; h.ground = false; snd('jump', h.x); }
    var wasGround = h.ground, prevY = h.y;
    h.vy = Math.min(h.vy + 0.22, 4.6); h.y += h.vy;
    var nx = Math.max(6, Math.min(W - 6, h.x + h.vx)), dx = nx - h.x; h.x = nx;
    h.ground = false;
    if (h.y >= GY) { h.y = GY; h.ground = true; }
    else if (h.vy >= 0 && prevY <= PLAT.y && h.y >= PLAT.y && h.x > PLAT.x0 - 3 && h.x < PLAT.x1 + 3) { h.y = PLAT.y; h.ground = true; }
    else if (h.vy >= 0 && Math.abs(h.y - PLAT.y) < 0.01 && h.x > PLAT.x0 - 3 && h.x < PLAT.x1 + 3) h.ground = true;
    if (h.ground) {
      if (!wasGround && h.air > 8) snd('land', h.x, { volume: Math.min(1, 0.45 + h.vy / 6) });
      h.vy = 0; h.air = 0;
    } else h.air++;
    sfx.walk('hero', dx, h.ground && Math.abs(h.vx) > 0.3, 16);
    h.anim += Math.abs(dx);
    // sword
    if (inp.attack && h.swing === 0 && h.hurtT === 0) { h.swing = 18; h.swung = {}; }
    if (h.swing > 0) {
      var sf = 18 - h.swing;
      if (sf >= 4 && sf <= 9) {
        var bx = h.face > 0 ? h.x + 2 : h.x - 18;
        w.slimes.forEach(function (s) {
          if (s.dead || h.swung[s.id] || s.x + 7 < bx || s.x - 7 > bx + 16 || Math.abs(s.y - h.y) > 14) return;
          h.swung[s.id] = 1;
          h.combo = h.comboT > 0 ? h.combo + 1 : 1; h.comboT = 75;
          var crit = h.combo % 3 === 0;
          damageSlime(s, crit ? 2 : 1, h.face, crit); snd(crit ? 'crit' : 'hit', s.x);
        });
      }
      h.swing--;
    }
    if (h.comboT > 0) h.comboT--;
    // bolt
    if (h.cd > 0) h.cd--;
    if (inp.fire && h.cd === 0 && h.hurtT === 0) { h.cd = 28; w.bolts.push({ x: h.x + h.face * 8, y: h.y - 8, vx: h.face * 3.2, life: 80 }); snd('laser', h.x); }
    w.bolts.forEach(function (b) {
      b.x += b.vx; b.life--;
      if (w.f % 2) part(b.x - b.vx * 0.5, b.y, -b.vx * 0.1, (w.rng() - 0.5) * 0.3, 10, '#9ee8ff');
      w.slimes.forEach(function (s) { if (b.life > 0 && !s.dead && Math.abs(s.x - b.x) < 7 && Math.abs(s.y - 5 - b.y) < 7) { b.life = 0; damageSlime(s, 1, b.vx > 0 ? 1 : -1, false); snd('hit', s.x, { volume: 0.85 }); } });
      if (b.life > 0 && !w.barrel.t && Math.abs(w.barrel.x - b.x) < 7 && b.y > GY - 16) { b.life = 0; explode(w.barrel.x, GY); }
      if (b.x < -8 || b.x > W + 8) b.life = 0;
    });
    w.bolts = w.bolts.filter(function (b) { return b.life > 0; });
    // pickups
    w.coinsOn.forEach(function (c) {
      if (c.t > 0) { c.t--; return; }
      if (Math.abs(c.x - h.x) < 7 && Math.abs(c.y - (h.y - 8)) < 10) { c.t = 420; w.coins++; snd('coin', c.x); burst(c.x, c.y, 6, ['#fff2a0', '#ffd848'], 0.8, 14, 0.3); }
    });
    if (w.gem.t > 0) w.gem.t--;
    else if (Math.abs(w.gem.x - h.x) < 7 && Math.abs(w.gem.y - (h.y - 8)) < 10) { w.gem.t = 600; snd('powerup', w.gem.x); burst(w.gem.x, w.gem.y, 14, ['#fffbe0', '#ffd848', '#9ee8ff'], 1.2, 26, 0.5); h.max = 5; }
    if (w.barrel.t > 0) w.barrel.t--;
    if (w.shrine.cd > 0) w.shrine.cd--;
    if (Math.abs(h.x - w.shrine.x) < 20 && h.ground && h.y === GY && h.hp < h.max && w.shrine.cd === 0) {
      h.hp = h.max; w.shrine.cd = 240; snd('heal', w.shrine.x);
      for (var i = 0; i < 12; i++) part(h.x + (w.rng() - 0.5) * 14, h.y - w.rng() * 14, 0, -0.35 - w.rng() * 0.4, 40 + w.rng() * 20, i % 2 ? '#9cf8b4' : '#e8fff0', 'plus');
    }
    // slimes
    w.slimes.forEach(function (s) {
      if (s.dead) { s.dead--; if (s.dead === 0) { s.hp = 3; s.x = s.dir > 0 ? s.x0 : s.x1; s.flash = 0; } return; }
      if (s.flash > 0) s.flash--;
      s.x += s.kb; s.kb *= 0.85; if (Math.abs(s.kb) < 0.05) s.kb = 0;
      if (s.stun > 0) { s.stun--; s.hop = 0; }
      else if (s.hop > 0) { s.hop--; s.x += s.dir * 0.75; if (s.hop === 0) s.wait = 34 + Math.floor(w.rng() * 30); }
      else if (Math.abs(s.x - h.x) < 30 && h.hurtT === 0 && h.inv === 0) { s.wait = Math.max(s.wait, 8); }   // braces (wobbles in place) while the hero is close
      else if (--s.wait <= 0) { s.hop = 20; if (s.x <= s.x0) s.dir = 1; else if (s.x >= s.x1) s.dir = -1; }
      s.x = Math.max(s.x0 - 14, Math.min(s.x1 + 14, s.x));
      s.y = GY - (s.hop > 0 ? Math.round(Math.sin((20 - s.hop) / 20 * Math.PI) * 7) : 0);
      if (h.inv === 0 && Math.abs(s.x - h.x) < 9 && Math.abs((s.y - 4) - (h.y - 8)) < 10) {
        h.hp = Math.max(1, h.hp - 1); h.inv = 80; h.hurtT = 20; h.face = s.x > h.x ? 1 : -1; h.vx = -h.face * 1.9; h.vy = -2.1; h.ground = false; h.target = s.id;
        snd('hurt', h.x); burst(h.x, h.y - 8, 6, ['#ff6a7a', '#ffffff'], 1.1, 14, 0.4);
      }
    });
    if (h.inv > 0) h.inv--;
    if (h.hurtT === 0 && h.inv < 60) h.target = null;
    // particles
    w.parts.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.life--; if (p.kind === 'fire') { p.vx *= 0.9; p.vy *= 0.9; } else if (p.kind === 'smoke') { p.vx *= 0.98; } else if (p.kind === 'debris') { p.vy += 0.15; if (p.y > GY) { p.y = GY; p.vy *= -0.3; p.vx *= 0.6; } } else if (p.kind === 'dot') { p.vy += 0.05; p.vx *= 0.95; } });
    w.parts = w.parts.filter(function (p) { return p.life > 0; });
  }

  // ---- autoplay script (deterministic): slime A (hit, hit, crit), coin, jump to the ledge (coin in the air, land), star gem (power-up),
  //      drop off the ledge (land, coin), walk into slime B (hurt), slime B (hit, hit, crit), bolt at the barrel (laser, explosion),
  //      walk home (footsteps), shrine (heal), menu (open, move, move, move, cancel), menu again -> Restart (loop)
  function autoInput() {
    var w = Wd, h = w.hero, A = w.auto, inp = {};
    A.pf++;
    function go(x, tol) { if (h.x < x - (tol || 2)) inp.right = true; else if (h.x > x + (tol || 2)) inp.left = true; else return true; return false; }
    function next() { A.phase++; A.pf = 0; }
    function fight(s, side) { if (h.hurtT > 0) return; if (s.dead) { next(); return; } if (go(s.x + side * 14, 1.5)) { if (h.face === side) { if (side > 0) inp.left = true; else inp.right = true; } else if (A.pf % 24 === 0) inp.attack = true; } if (A.pf > 500) next(); }
    var sA = w.slimes[0], sB = w.slimes[1];
    switch (A.phase) {
      case 0: if (A.pf > 40) next(); break;
      case 1: fight(sA, -1); break;                                                          // hit, hit, crit
      case 2: if (go(114)) next(); break;                                                    // coin under the ledge
      case 3: if (go(90)) next(); break;                                                     // back off
      case 4: inp.right = true; if (A.pf === 4) inp.jump = true; if (A.pf > 8 && h.ground && h.y === PLAT.y) next(); if (A.pf > 120) next(); break;   // jump up: air coin, land
      case 5: if (go(132)) next(); break;                                                    // star gem: power-up
      case 6: if (A.pf > 24) next(); break;
      case 7: inp.right = true; if (h.ground && h.y === GY && h.x > 152) next(); if (A.pf > 160) next(); break;   // off the edge: land
      case 8: if (sB.x > h.x) inp.right = true; else inp.left = true; if (h.inv > 0) next(); if (A.pf > 400) next(); break;   // into slime B: hurt
      case 9: fight(sB, -1); break;                                                          // hit, hit, crit
      case 10: if (go(150)) next(); break;                                                   // step back
      case 11: if (h.face < 0) inp.right = true; if (A.pf === 10) inp.fire = true; if (A.pf > 80) next(); break;   // bolt -> barrel
      case 12: if (go(31, 1)) next(); if (A.pf > 500) next(); break;                         // walk home, shrine: heal
      case 13: if (A.pf > 50) next(); break;
      case 14: if (A.pf === 1) inp.menu = true; if (A.pf === 30) inp.down = true; if (A.pf === 52) inp.down = true; if (A.pf === 74) inp.up = true; if (A.pf === 110) inp.cancel = true; if (A.pf > 140) next(); break;
      case 15: if (go(34)) next(); if (A.pf > 200) next(); break;
      case 16: if (A.pf === 1) inp.menu = true; if (A.pf === 34) inp.down = true; if (A.pf === 56) inp.down = true; if (A.pf === 90) inp.ok = true; break;   // Restart
    }
    return inp;
  }

  // ---- player input (only in "Play" mode; never while typing in a control)
  var held = {}, pressed = {}, mode = HAS_T ? 'auto' : 'paused';
  var KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyZ: 'jump', Space: 'jump', KeyX: 'attack', KeyC: 'fire', Escape: 'menu', KeyP: 'menu', Enter: 'ok' };
  addEventListener('keydown', function (e) {
    if (mode !== 'you' || /INPUT|SELECT|TEXTAREA/.test((e.target && e.target.tagName) || '')) return;
    var k = KEYS[e.code]; if (!k) return; e.preventDefault();
    if (!held[k]) pressed[k] = true; held[k] = true;
  });
  addEventListener('keyup', function (e) { var k = KEYS[e.code]; if (k) held[k] = false; });
  function humanInput() {
    var inp = { left: held.left, right: held.right, jump: pressed.jump || pressed.up, attack: pressed.attack, fire: pressed.fire, menu: pressed.menu };
    if (Wd.menu) inp = { up: pressed.up, down: pressed.down, ok: pressed.jump || pressed.ok, cancel: pressed.menu || pressed.attack || pressed.fire };
    pressed = {}; return inp;
  }
  function setMode(m) {
    mode = m; held = {}; pressed = {};
    Array.prototype.forEach.call($('mode').children, function (b) { b.classList.toggle('on', b.dataset.m === m); });
    $('gameOver').classList.toggle('hide', m !== 'paused');
    if (m === 'you') { view.focus(); if (Wd.auto.phase > 0 && Wd.menu) Wd.menu = null; }
    if (m === 'auto') { Wd = newWorld(); }
  }
  Array.prototype.forEach.call($('mode').children, function (b) { b.addEventListener('click', function () { sfx.unlock(); setMode(b.dataset.m); }); });
  $('playScene').addEventListener('click', function () { sfx.unlock(); setMode('you'); });
  $('watchScene').addEventListener('click', function (e) { e.preventDefault(); sfx.unlock(); setMode('auto'); });

  function step() {
    var inp = mode === 'auto' ? autoInput() : mode === 'you' ? humanInput() : {};
    if (mode !== 'paused') stepWorld(inp);
    sfx.update(STEP);
    T += STEP;
  }

  // ---- draw the scene
  function drawScene() {
    var w = Wd, h = w.hero, t = w.f * STEP;
    var sx = w.shake ? Math.round((w.rng ? Math.sin(w.f * 2.3) : 0) * Math.min(3, w.shake / 4)) : 0, sy = w.shake ? Math.round(Math.cos(w.f * 3.1) * Math.min(2, w.shake / 5)) : 0;
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(BG, 0, 0);   // under-fill so a shaken frame never shows a black edge
    g.setTransform(1, 0, 0, 1, sx, sy);
    g.drawImage(BG, 0, 0);
    // shrine (statue) with a glow when ready
    if (w.shrine.cd === 0) PXS.glow(g, w.shrine.x, GY - 12, 12, '#9cf8b4', 1);
    PXS.drawProp(g, 'statue', w.shrine.x, GY + 1, { v: 0 }, t);
    // barrel
    if (!w.barrel.t) PXS.drawProp(g, 'barrel', w.barrel.x, GY + 1, { v: 1 }, t);
    else if (w.barrel.t < 40 && (w.barrel.t >> 2) % 2) { g.globalAlpha = 0.5; PXS.drawProp(g, 'barrel', w.barrel.x, GY + 1, { v: 1 }, t); g.globalAlpha = 1; }
    // pickups
    w.coinsOn.forEach(function (c) { if (!c.t) drawCoin(c.x, c.y, t + c.x * 7); });
    if (!w.gem.t) drawGem(w.gem.x, w.gem.y, t);
    // slimes
    w.slimes.forEach(function (s) {
      if (s.dead) return;
      var sq = s.hop > 14 || (s.hop > 0 && s.hop < 4) ? 1 : s.hop > 0 ? -1 : (Math.floor(t / 400 + s.x0) % 2 ? 0 : 1);
      var art = slimeArt(sq, s.flash > 0 && s.flash % 4 < 2);
      g.fillStyle = 'rgba(16,10,30,0.3)'; g.fillRect(Math.round(s.x) - 5, GY, 10, 1);
      g.drawImage(art, Math.round(s.x) - 8, Math.round(s.y) - 12);
    });
    // hero (pixel-kit actor: native side frame faces right, the kit mirrors it for 'left')
    var walking = h.ground && Math.abs(h.vx) > 0.3, frame = walking ? Math.floor(h.anim / 7) % 2 : 0;
    if (h.inv > 0 && h.hurtT === 0 && (h.inv >> 2) % 2) g.globalAlpha = 0.5;   // full opacity during the knockback, then blink
    PXS.actor(g, h.x, h.y, { pal: 'hero', dir: h.face > 0 ? 'right' : 'left', frame: frame, noShadow: !h.ground });
    g.globalAlpha = 1;
    // sword slash
    if (h.swing > 0) {
      var sf = 18 - h.swing, fx = h.face, cx = Math.round(h.x + fx * 4), cy = Math.round(h.y - 9);
      // blade in the hand: swings from up-behind to forward-down (facing space), drawn in front of the hero
      var sa = Math.min(0.75, -2.1 + sf * 0.26), hx2 = h.x + fx * 3, hy2 = h.y - 7;
      for (var rb = 0; rb <= 10; rb++) {
        var bx2 = Math.round(hx2 + Math.cos(sa) * rb * fx), by2 = Math.round(hy2 + Math.sin(sa) * rb);
        if (rb < 2) { g.fillStyle = '#5c3420'; g.fillRect(bx2, by2, 1, 1); }
        else if (rb === 2) { g.fillStyle = '#d8a030'; g.fillRect(bx2 - 1, by2, 3, 1); g.fillRect(bx2, by2 - 1, 1, 3); }
        else { g.fillStyle = '#4a5068'; g.fillRect(bx2, by2 + 1, 1, 1); g.fillStyle = rb > 8 ? '#ffffff' : '#e4eaf8'; g.fillRect(bx2, by2, 1, 1); }
      }
      if (sf >= 4 && sf <= 10) {
        var a0 = -1.9 + (sf - 2) * 0.32;
        for (var k = 0; k < 7; k++) {
          var a = a0 - k * 0.16; if (a < -1.9) continue;
          var r = 11 - (k > 3 ? 1 : 0), px = Math.round(cx + Math.cos(a) * r * fx), py = Math.round(cy + Math.sin(a) * r);
          g.fillStyle = k === 0 ? '#ffffff' : k < 3 ? '#fff4c0' : '#c8d8ff'; g.fillRect(px, py, 2, k < 2 ? 2 : 1);
        }
      }
    }
    // bolts
    w.bolts.forEach(function (b) { PXS.glow(g, Math.round(b.x), Math.round(b.y), 6, '#9ee8ff', 1); g.fillStyle = '#e8fbff'; g.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 1, 4, 2); g.fillStyle = '#5ac8f0'; g.fillRect(Math.round(b.x - b.vx) - 1, Math.round(b.y), 3, 1); });
    // particles
    w.parts.forEach(function (p) {
      var k = p.life / p.max, X = Math.round(p.x), Y = Math.round(p.y);
      if (p.kind === 'fire') {   // shaded blob: dark rim, mid body, hot core
        var rr2 = k > 0.65 ? 3 : k > 0.35 ? 2 : 1, rim = k > 0.5 ? '#b8401c' : '#6a2418', mid = k > 0.6 ? '#ff9a30' : k > 0.3 ? '#e8602a' : '#a83a28', core = k > 0.7 ? '#fffbe0' : '#ffd060';
        g.fillStyle = rim; g.fillRect(X - rr2, Y - rr2 + 1, rr2 * 2 + 1, rr2 * 2 - 1); g.fillRect(X - rr2 + 1, Y - rr2, rr2 * 2 - 1, rr2 * 2 + 1);
        g.fillStyle = mid; g.fillRect(X - rr2 + 1, Y - rr2 + 1, rr2 * 2 - 1, rr2 * 2 - 1);
        if (rr2 > 1) { g.fillStyle = core; g.fillRect(X - 1, Y - 1, 2, 2); } }
      else if (p.kind === 'smoke') { g.globalAlpha = Math.min(0.85, k * 1.4); g.fillStyle = '#2a2234'; g.fillRect(X - 3, Y - 2, 6, 5); g.fillRect(X - 2, Y - 3, 4, 7); g.fillStyle = '#4a4058'; g.fillRect(X - 2, Y - 2, 4, 3); g.fillStyle = '#7a7088'; g.fillRect(X - 2, Y - 2, 2, 1); g.globalAlpha = 1; }
      else if (p.kind === 'star') { var sr = Math.round(2 + (1 - k) * 6); g.globalAlpha = Math.min(1, k * 2); g.fillStyle = '#ffd848'; g.fillRect(X - sr, Y, sr * 2 + 1, 1); g.fillRect(X, Y - sr, 1, sr * 2 + 1); g.fillStyle = '#ffffff'; g.fillRect(X - 1, Y - 1, 3, 3); g.fillRect(X - (sr >> 1), Y, sr + 1, 1); g.fillRect(X, Y - (sr >> 1), 1, sr + 1); g.globalAlpha = 1; }
      else if (p.kind === 'debris') { g.fillStyle = '#1a1024'; g.fillRect(X - 1, Y, 4, 2); g.fillStyle = p.col; g.fillRect(X - 1, Y, 3, 1); }
      else if (p.kind === 'ring') { var rr = (1 - k) * 22 + 3; g.globalAlpha = k; g.fillStyle = '#fff8e0'; for (var yy = -rr; yy <= rr; yy++) { var hw = Math.round(Math.sqrt(Math.max(0, rr * rr - yy * yy))), iw = Math.round(Math.sqrt(Math.max(0, (rr - 2) * (rr - 2) - yy * yy))); g.fillRect(X - hw, Y + yy, hw - iw, 1); g.fillRect(X + iw, Y + yy, hw - iw, 1); } if (k > 0.6) { g.globalAlpha = (k - 0.6) * 1.5; PXS.glow(g, X, Y, 14, '#fff4c0', 1); } g.globalAlpha = 1; }
      else if (p.kind === 'plus') { g.globalAlpha = Math.min(1, k * 1.6); g.fillStyle = p.col; g.fillRect(X - 1, Y, 3, 1); g.fillRect(X, Y - 1, 1, 3); g.globalAlpha = 1; }
      else { g.fillStyle = p.col; g.fillRect(X, Y, p.kind === 'debris' ? 2 : 1, p.kind === 'debris' ? 2 : 1); }
    });
    g.setTransform(1, 0, 0, 1, 0, 0);
    // phones (scene under 460 CSS px): show a 160x90 window that follows the hero, so characters stay readable;
    // the HUD and the menu are drawn inside that window
    var cssW = view.clientWidth || W * 3, phone = cssW < 460, VW = phone ? 160 : W, VH = phone ? 90 : H;
    var VX = phone ? Math.round(Math.max(0, Math.min(W - VW, h.x - VW / 2))) : 0, VY = H - VH;
    // HUD
    g.fillStyle = 'rgba(10,8,24,0.55)'; g.fillRect(VX + 3, VY + 3, 5 * 8 + 4, 10); g.fillRect(VX + VW - 37, VY + 3, 34, 10);
    for (var i = 0; i < h.max; i++) heart(VX + 5 + i * 8, VY + 5, i < h.hp);
    drawCoin(VX + VW - 30, VY + 8, 0); text('x' + (w.coins < 10 ? '0' : '') + w.coins, VX + VW - 24, VY + 6, '#fff2c0', '#2a1020');
    // pause menu
    if (w.menu) {
      g.fillStyle = 'rgba(8,6,20,0.55)'; g.fillRect(0, 0, W, H);
      var mx = VX + Math.round((VW - 80) / 2), my = VY + Math.round((VH - 56) / 2), mw = 80, mh = 56;
      g.fillStyle = '#1a1030'; g.fillRect(mx - 1, my - 1, mw + 2, mh + 2); g.fillStyle = '#f0e6d0'; g.fillRect(mx, my, mw, mh); g.fillStyle = '#2c2050'; g.fillRect(mx + 1, my + 1, mw - 2, mh - 2);
      g.fillStyle = '#3c3070'; g.fillRect(mx + 1, my + 1, mw - 2, 1);
      text('PAUSED', mx + 28, my + 6, '#ffd848', '#120a24');
      ['RESUME', 'SOUND: ' + (sfx.params().mute ? 'OFF' : 'ON'), 'RESTART'].forEach(function (s, j) {
        var yy = my + 18 + j * 11, on = w.menu.i === j;
        if (on) { g.fillStyle = '#4a3c8c'; g.fillRect(mx + 6, yy - 2, mw - 12, 9); g.fillStyle = '#ffd848'; g.fillRect(mx + 9, yy, 2, 5); g.fillRect(mx + 11, yy + 1, 1, 3); }
        text(s, mx + 16, yy, on ? '#ffffff' : '#b8b0d8', '#120a24');
      });
    }
    // present at an integer scale
    var dpr = window.devicePixelRatio || 1, s = Math.max(1, Math.round(cssW * dpr / VW));
    if (view.width !== VW * s || view.height !== VH * s) { view.width = VW * s; view.height = VH * s; }
    vg.imageSmoothingEnabled = false; vg.drawImage(off, VX, VY, VW, VH, 0, 0, VW * s, VH * s);
  }

  // ---- state for tools
  window.__state = function () {
    var h = Wd.hero;
    var actors = [{ id: 'hero', x: Math.round(h.x), y: Math.round(h.y), facing: h.face > 0 ? 'right' : 'left', target: h.target, vx: +h.vx.toFixed(2) }];
    Wd.slimes.forEach(function (s) { if (!s.dead) actors.push({ id: s.id, x: Math.round(s.x), y: Math.round(s.y), facing: s.dir > 0 ? 'right' : 'left', target: null, noFace: 'frontal blob (symmetric art, eyes front)' }); });
    return { t: Math.round(T), mode: mode, unlocked: sfx.isUnlocked(), actors: actors, sounds: sfx.recent(12), stats: (function (s) { return { played: s.played, merged: s.merged, dropped: s.dropped, locked: s.locked, active: s.active }; })(sfx.stats()), params: sfx.params(), menu: Wd.menu ? Wd.menu.i : null, hp: h.hp, coins: Wd.coins };
  };

  // ---- loop
  var T = 0, acc = 0, lastNow = null, stopped = false, fastForward = false;
  function frame(now) {
    if (stopped) return;
    if (lastNow === null) lastNow = now;
    acc += Math.min(250, now - lastNow); lastNow = now;
    while (acc >= STEP) { step(); acc -= STEP; }
    drawScene(); drawWave(); drawLog();
    requestAnimationFrame(frame);
  }
  setMode(mode);
  if (HAS_T) {
    var n = Math.floor(START_T / STEP);
    fastForward = true; for (var i = 0; i < n; i++) step(); fastForward = false;
  }
  drawScene(); drawLog();
  var ready = drawThumbs();
  if (FREEZE) {
    stopped = true;
    // the still shows the newest scene sound's waveform with its playhead at the frozen time
    var evs = sfx.recent(5), lastEv = evs[evs.length - 1];
    var waits = [ready];
    if (lastEv && lastEv.preset && SX.meta[lastEv.preset]) { last = [{ ev: lastEv, r: null, at: 0 }]; waits.push(renderOf(lastEv.preset, lastEv.seed).then(function (r) { last[0].r = r; })); }
    Promise.all(waits).then(function () { drawWave(T); drawLog(); updateSoundState(); window.__frozen = true; });
  } else {
    ready.then(function () { window.__ready = true; });
    requestAnimationFrame(frame);
  }
  updateSoundState();
})();
