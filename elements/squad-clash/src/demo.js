/* A-14 squad-clash demo: one clash at a time on the module, with live parameters, formation swaps, tactic presets,
   the forecast panel, the staged playback and an in-page check that replays many seeds and compares. */
(function () {
  'use strict';
  var SC = GameDNA_SquadClash, qs = new URLSearchParams(location.search);
  var W = 640, H = 360, STEP = 1000 / 60;
  var FREEZE_AT = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : null, FROZEN = FREEZE_AT !== null && qs.get('freeze') === '1';
  var canvas = document.getElementById('game'), g = canvas.getContext('2d');
  var STATS = {
    knight: [54, 15, 11, 2, 5, 6, ['strike', 'cleave'], { guard: true }], lancer: [46, 16, 7, 2, 4, 10, ['thrust'], { followUp: 'lunge' }],
    archer: [38, 14, 5, 3, 6, 12, ['shoot', 'pierce'], { followUp: 'chase' }], mage: [34, 4, 4, 16, 10, 8, ['bolt', 'blaze']], cleric: [36, 5, 5, 13, 11, 7, ['mend', 'bolt']],
    brigand: [44, 14, 6, 0, 3, 8, ['strike']], slinger: [32, 12, 4, 0, 4, 11, ['shoot']], hound: [32, 13, 4, 0, 3, 14, ['bite'], { followUp: 'lunge' }],
    raptor: [36, 13, 5, 0, 5, 13, ['bite'], { tags: ['flying'] }], ironclad: [58, 15, 13, 0, 3, 4, ['strike'], { tags: ['armored'], guard: true }],
    hexer: [32, 3, 4, 15, 9, 7, ['hex', 'blaze']], mender: [34, 4, 5, 12, 10, 6, ['mend', 'hex']]
  };
  var PRE = { knight: 'knight', lancer: 'lancer', archer: 'archer', mage: 'mage', cleric: 'cleric', brigand: 'knight', slinger: 'archer', hound: 'lancer', raptor: 'lancer', ironclad: 'knight', hexer: 'mage', mender: 'cleric' };
  var SCEN = {
    shieldwall: { name: 'Shield wall vs sky raiders', theme: 'day', a: [['knight', 1, 'Bryn'], ['lancer', 0, 'Kael'], ['archer', 3, 'Wren'], ['mage', 4, 'Sola'], ['cleric', 5, 'Ilsa']], b: [['raptor', 0], ['hound', 1], ['raptor', 2], ['slinger', 4], ['slinger', 5]] },
    casters:    { name: 'Casters behind a wall', theme: 'dusk', a: [['ironclad', 0, 'Odo'], ['knight', 2, 'Bryn'], ['mage', 3, 'Sola'], ['mage', 4, 'Vey'], ['cleric', 5, 'Ilsa']], b: [['brigand', 0], ['brigand', 1], ['brigand', 2], ['slinger', 3], ['hexer', 5]] },
    rush:       { name: 'Melee rush vs the back row', theme: 'dawn', a: [['knight', 1, 'Bryn'], ['archer', 3, 'Wren'], ['archer', 4, 'Pell'], ['cleric', 5, 'Ilsa']], b: [['hound', 0], ['brigand', 1], ['hound', 2], ['brigand', 4]] },
    iron:       { name: 'Iron column at night', theme: 'night', a: [['knight', 0, 'Bryn'], ['lancer', 2, 'Kael'], ['archer', 3, 'Wren'], ['mage', 4, 'Sola'], ['cleric', 5, 'Ilsa']], b: [['ironclad', 0], ['ironclad', 2], ['hound', 1], ['hexer', 4], ['mender', 5]] }
  };
  var DEF = { scenario: 'shieldwall', seed: 3, rounds: 3, speed: 1, crit: 0.08, guard: 'on', followUps: 'on', margin: 0.1, forecast: 'bars', numbers: 'on', order: 'on', why: 'on' };
  var S = {}; for (var k in DEF) S[k] = qs.has(k) ? (typeof DEF[k] === 'number' ? +qs.get(k) : qs.get(k)) : DEF[k];
  if (!SCEN[S.scenario]) S.scenario = DEF.scenario;
  var A = [], B = [], C = null, mode = 'prep', modeT = 0, auto = qs.get('auto') !== '0', sel = null, pick = null, frame = 0, history = [];

  function unit(def, side, i) {
    var st = STATS[def[0]], ex = st[7] || {};
    var u = { id: side + i + '-' + def[0], name: def[2] || def[0].charAt(0).toUpperCase() + def[0].slice(1), cls: def[0], slot: def[1], row: def[1] >= 3 ? 'back' : 'front', col: def[1] % 3,
      maxHp: st[0], hp: st[0], atk: st[1], def: st[2], mag: st[3], res: st[4], spd: st[5], skills: st[6].slice(), tags: (ex.tags || []).slice(), guard: !!ex.guard, followUp: ex.followUp || null, preset: 0 };
    preset(u, 0); return u;
  }
  function preset(u, i) { var L = SC.PRESETS[PRE[u.cls]] || []; if (!L.length) { u.rules = []; u.presetName = 'Default'; return; } u.preset = ((i % L.length) + L.length) % L.length; u.rules = JSON.parse(JSON.stringify(L[u.preset].rules)); u.presetName = L[u.preset].name; }
  function load() {
    var sc = SCEN[S.scenario];
    A = sc.a.map(function (d, i) { return unit(d, 'a', i); }); B = sc.b.map(function (d, i) { return unit(d, 'b', i); });
    C.setParams(params()); C.setSeed(S.seed); C.setSquads(A, B); C.forecast(); mode = 'prep'; modeT = 0; sel = null; pick = null; syncInfo();
  }
  function params() { return { rounds: S.rounds, speed: S.speed, crit: S.crit, guard: S.guard, followUps: S.followUps, margin: S.margin, forecast: S.forecast, numbers: S.numbers, order: S.order, why: S.why }; }
  C = SC.create({
    view: { x: 0, y: 0, w: W, h: H }, seed: S.seed, params: params(),
    drawBackground: function (ctx, v, t) { ART.backdrop(ctx, v, t, SCEN[S.scenario].theme); return true; },
    looks: ART.looks(), layout: ART.layout(), drawUnit: ART.drawUnit, drawHead: ART.drawHead,
    onEnd: function (result, o) { history.unshift({ seed: o.seed, forecast: o.forecastResult, played: result, match: o.match }); history = history.slice(0, 6); mode = 'done'; modeT = 0; syncInfo(); }
  });
  function commit() { if (mode !== 'prep') return; C.setParams(params()); C.forecast(); C.commit(); mode = 'play'; modeT = 0; }
  function tick() {
    frame++; modeT++;
    if (auto) {
      if (mode === 'prep' && modeT === 150) commit();
      if (mode === 'done' && modeT === 200) { S.seed = (S.seed % 999) + 1; var seedEl = document.getElementById('seed'); if (seedEl) { seedEl.value = S.seed; out('seed'); } load(); }
    }
    C.update(STEP);
  }
  function slotAt(x, y) { for (var i = 0; i < 6; i++) { var s = C.slotRect('a', i >= 3 ? 'back' : 'front', i % 3); if (Math.abs(x - s.cx) < 26 * s.s && y > s.cy - 66 * s.s && y < s.cy + 10 * s.s) return i; } return -1; }
  function unitAt(slot) { for (var i = 0; i < A.length; i++) if (A[i].slot === slot) return A[i]; return null; }
  function render() {
    g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    C.drawScene(g);
    if (mode === 'prep') {
      for (var i = 0; i < 6; i++) { var s = C.slotRect('a', i >= 3 ? 'back' : 'front', i % 3), on = sel === i, pk = pick === i; g.save(); g.globalAlpha = on || pk ? 0.95 : unitAt(i) ? 0.25 : 0.45; g.strokeStyle = pk ? '#ffd36a' : on ? '#ffffff' : '#9fd0ff'; g.lineWidth = (on || pk ? 2.2 : 1.2) * s.s; if (!unitAt(i) && !on && !pk) g.setLineDash([4 * s.s, 3 * s.s]); g.beginPath(); g.ellipse(s.cx, s.cy, 22 * s.s, 7 * s.s, 0, 0, 7); g.stroke(); g.restore(); }
      C.drawForecast(g, { x: W - 226, y: H - 102, w: 214, h: 92 });
      var u = sel != null ? unitAt(sel) : null, x = 12, y = H - 102, w = 300, h = 92;
      C.panel(g, x, y, w, h);
      if (u) {
        C.text(g, u.name + ' · ' + u.cls, x + 12, y + 20, { size: 12, weight: 800, outline: false });
        C.text(g, 'Tactics: ' + u.presetName + '  (T or click again: next)', x + 12, y + 36, { size: 9, weight: 700, color: '#ffd36a', outline: false });
        u.rules.slice(0, 3).forEach(function (r, i2) { var p = SC.ruleParts(r), sk = C.skills[p.use]; C.text(g, (i2 + 1) + '. ' + SC.ruleText(r) + ' → ' + (sk ? sk.name : p.use), x + 12, y + 52 + i2 * 12, { size: 9, weight: 600, color: '#e8e0ff', outline: false }); });
      } else {
        C.text(g, 'Click two of your slots to swap them', x + 12, y + 22, { size: 11, weight: 800, outline: false });
        C.text(g, 'Click a unit twice to change its tactic preset.', x + 12, y + 40, { size: 9.5, weight: 600, color: '#c9bce6', outline: false });
        C.text(g, 'The forecast is the clash itself, run ahead:', x + 12, y + 58, { size: 9.5, weight: 600, color: '#c9bce6', outline: false });
        C.text(g, 'Enter / Commit plays it out exactly.', x + 12, y + 72, { size: 9.5, weight: 600, color: '#c9bce6', outline: false });
      }
      C.text(g, SCEN[S.scenario].name.toUpperCase(), W / 2, 30, { size: 12, weight: 900, align: 'center', color: '#ffe7b0' });
      if (auto) C.text(g, 'auto: commits in ' + Math.max(0, Math.ceil((150 - modeT) / 60)) + ' s', W / 2, 46, { size: 9, weight: 700, align: 'center', color: '#c9bce6' });
    }
    C.drawUI(g);
    ART.foreground(g, { x: 0, y: 0, w: W, h: H }, frame / 60);    live();
  }
  var liveEl = null, liveLast = '';
  function esc(x) { return String(x).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function live() {   // the readout and forecast as HTML text (readable on phones, where canvas text is small)
    liveEl = liveEl || document.getElementById('live'); if (!liveEl) return;
    var fc = C.forecast(), Wd = { win: 'VICTORY', lose: 'DEFEAT', draw: 'DRAW' }, h = '';
    if (fc) h = 'Forecast <b>' + Wd[fc.result] + '</b> <span class="dim">(ends round ' + fc.endedRound + '; ' + fc.counts.guards + ' guards, ' + fc.counts.follows + ' follow-ups, ' + fc.counts.crits + ' crits)</span> · You ' + fc.totals.a.before + '→' + fc.totals.a.after + ' · Foe ' + fc.totals.b.before + '→' + fc.totals.b.after;
    var w = C.why(), o = C.outcome();
    if (mode === 'play' && w) h += '<br>' + esc(w.line1) + ' <span class="dim">' + esc(w.line2) + '</span>';
    else if (mode === 'done' && o) h += '<br><b>' + Wd[o.result] + '</b> ' + (o.match ? '✔ played exactly as forecast' : '✖ differs');
    else h += '<br><span class="dim">' + (mode === 'prep' ? 'Click two of your slots to swap; click a unit twice for its next tactics; Enter commits.' : '&nbsp;') + '</span>';
    if (h !== liveLast) { liveLast = h; liveEl.innerHTML = h; }
  }
  function fit() {
    var r = canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1), bw = Math.min(2560, Math.max(320, Math.round((r.width || W) * dpr))), bh = Math.round(bw * H / W);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  }
  // controls
  function out(id) { var el = document.getElementById(id), o = document.querySelector('output[for=' + id + ']'); if (!el) return; if (o) o.textContent = el.value; if (el.type === 'range') el.style.setProperty('--fill', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); }
  function bind() {
    ['seed', 'rounds', 'speed', 'crit', 'margin'].forEach(function (id) {
      var el = document.getElementById(id); el.value = S[id]; out(id);
      el.addEventListener('input', function () { S[id] = +el.value; out(id); if (id === 'speed') C.setParams({ speed: S.speed }); else if (mode !== 'play') load(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.seg'), function (seg) {
      var key = seg.getAttribute('data-key');
      Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
        b.setAttribute('aria-checked', String(b.value === String(S[key])));
        b.addEventListener('click', function () { S[key] = b.value; Array.prototype.forEach.call(seg.querySelectorAll('button'), function (x) { x.setAttribute('aria-checked', String(x === b)); }); if (key === 'scenario' || mode !== 'play') load(); else C.setParams(params()); });
      });
    });
    document.getElementById('commit').addEventListener('click', function () { auto = false; syncAuto(); commit(); });
    document.getElementById('again').addEventListener('click', function () { load(); });
    document.getElementById('auto').addEventListener('click', function () { auto = !auto; syncAuto(); });
    document.getElementById('verify').addEventListener('click', verify);
    canvas.addEventListener('pointerdown', function (e) {
      var r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
      if (mode === 'done') { load(); return; }
      if (mode !== 'prep') { C.setFast(3); return; }
      auto = false; syncAuto();
      var s = slotAt(x, y); if (s < 0) { sel = null; pick = null; return; }
      if (pick !== null && pick !== s) { var p = unitAt(pick), q = unitAt(s); if (p) { p.slot = s; p.row = s >= 3 ? 'back' : 'front'; p.col = s % 3; } if (q) { q.slot = pick; q.row = pick >= 3 ? 'back' : 'front'; q.col = pick % 3; } pick = null; sel = s; C.forecast(); return; }
      if (sel === s && unitAt(s)) { preset(unitAt(s), unitAt(s).preset + 1); C.forecast(); pick = null; return; }
      sel = s; pick = s;
    });
    addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === 'z' || e.key === 'Z') { if (mode === 'prep') { auto = false; syncAuto(); commit(); } else if (mode === 'done') load(); }
      if ((e.key === 't' || e.key === 'T') && sel != null && unitAt(sel)) { preset(unitAt(sel), unitAt(sel).preset + 1); C.forecast(); }
    });
    syncAuto();
  }
  function syncAuto() { var b = document.getElementById('auto'); if (b) { b.setAttribute('aria-pressed', String(auto)); b.textContent = auto ? 'Auto loop: on' : 'Auto loop: off'; } }
  function syncInfo() {
    var el = document.getElementById('history'); if (!el) return;
    el.innerHTML = history.length ? history.map(function (h) { return '<li><span>seed ' + h.seed + '</span><span>forecast <b>' + h.forecast + '</b></span><span>played <b>' + h.played + '</b></span><span class="' + (h.match ? 'ok' : 'bad') + '">' + (h.match ? '✔ exact' : '✖ differs') + '</span></li>'; }).join('') : '<li class="muted">No clash played yet.</li>';
  }
  function verify() {
    // replay many seeds through a separate instance (no drawing): forecast, commit, 60 Hz updates, compare live HP
    var n = 200, ok = 0, el = document.getElementById('verifyOut'), t0 = performance.now();
    for (var sd = 1; sd <= n; sd++) {
      var sc = SCEN[Object.keys(SCEN)[sd % 4]], a = sc.a.map(function (d, i) { return unit(d, 'a', i); }), b = sc.b.map(function (d, i) { return unit(d, 'b', i); });
      a.forEach(function (u, i) { if ((sd + i) % 3 === 0) preset(u, 1); }); b.forEach(function (u, i) { if ((sd + i) % 2) u.hp = Math.max(1, Math.round(u.maxHp * 0.6)); });
      var inst = SC.create({ seed: sd * 7 + 1, params: params() }); inst.setSquads(a, b); var fc = inst.forecast(); inst.commit();
      for (var f = 0; f < 60 * 400 && inst.phase() === 'playing'; f++) inst.update(STEP);
      var o = inst.outcome(); if (o && o.match && a.concat(b).every(function (u) { return u.hp === fc.units[u.id].hpAfter; })) ok++;
    }
    el.textContent = ok + ' / ' + n + ' seeded clashes played exactly as forecast (' + Math.round(performance.now() - t0) + ' ms)';
    el.className = ok === n ? 'ok' : 'bad';
  }
  function boot() {
    fit(); bind(); load();
    if (FROZEN) { var n = Math.floor(FREEZE_AT / STEP); for (var i = 0; i < n; i++) tick(); render(); document.documentElement.setAttribute('data-state', JSON.stringify({ mode: mode, phase: C.phase(), seed: S.seed, history: history })); return; }
    addEventListener('resize', fit);
    var last = performance.now(), acc = 0;
    (function loop(now) { acc += Math.min(250, now - last); last = now; while (acc >= STEP) { tick(); acc -= STEP; } render(); requestAnimationFrame(loop); })(last);
  }
  window.DEMO = { C: C, commit: commit, load: load, step: function (n) { for (var i = 0; i < (n || 1); i++) tick(); }, render: function () { render(); }, state: function () { return { mode: mode, seed: S.seed, history: history }; } };
  /* text state for critics and tools/sprites/statecheck.py. The module draws every unit with dir = side 'a' ? 1 : -1
     (ART.drawUnit gets it as info.dir) and the pack art faces RIGHT, so side a looks right and side b is the mirror. */
  window.__state = function () {
    var mean = function (L) { var n = 0, sx = 0; L.forEach(function (u) { var a = C.anchor(u.id); if (a && !a.dead) { n++; sx += a.x; } }); return n ? Math.round(sx / n) : null; };
    var ma = mean(A), mb = mean(B);
    return { t: Math.round(frame * STEP), actors: A.concat(B).map(function (u) {
      var a = C.anchor(u.id) || {}, dir = a.side === 'a' ? 1 : -1, o = { id: u.id, x: Math.round(a.x), y: Math.round(a.footY), facing: dir > 0 ? 'right' : 'left', target: a.side === 'a' ? mb : ma };
      if (a.homeX != null) o.vx = +(a.x - a.homeX).toFixed(1);
      if (a.dead) o.noFace = 'dead (lying or gone)';
      return o; }) };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
