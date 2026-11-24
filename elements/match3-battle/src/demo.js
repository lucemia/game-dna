/* A-17 demo: one battle with parameter controls and preset boards that show each special.
   ?preset=battle|line|shard|blast|boom|prism|rainbow|reshuffle  ?foes=slime,wolf  ?specials= ?hints= ?numbers= ?speed= ?combo= ?layout=
   ?t=<ms>&freeze=1 fast-forwards (autoplay on for preset=battle), ?auto=1 lets the bot play. */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search), M3 = GameDNA_Match3Battle, Kit = window.GameDNA_DemoKit;
  var vw = window.innerWidth || 960, vh = window.innerHeight || 600;
  var LAYOUT = qs.get('layout') === 'tall' || qs.get('layout') === 'wide' ? qs.get('layout') : (vw < 760 || vw / vh < 1 ? 'tall' : 'wide');
  var W = LAYOUT === 'tall' ? 540 : 960, H = LAYOUT === 'tall' ? 960 : 540, STEP = 1000 / 60;
  var FREEZE_AT = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : null, FROZEN = FREEZE_AT !== null && qs.get('freeze') === '1';
  var PRESET = qs.get('preset') || 'battle', AUTO = qs.get('auto') === '1' || (FROZEN && PRESET === 'battle' && qs.get('auto') !== '0');
  var SEED = (+qs.get('seed') >>> 0) || 3;
  var FOES = (qs.get('foes') || (PRESET === 'battle' ? 'imp,wisp,imp' : 'golem')).split(',').filter(function (k) { return M3.ENEMIES[k]; });
  var SCENE = qs.get('scene') || (FOES.indexOf('golem') >= 0 || FOES.indexOf('skeleton') >= 0 ? 'ruins-night' : FOES.indexOf('imp') >= 0 || FOES.indexOf('harpy') >= 0 ? 'lakeside-day' : 'meadow-dusk');
  var P = { layout: LAYOUT, specials: qs.get('specials') || 'on', hints: qs.get('hints') || 'on', numbers: qs.get('numbers') || 'on', speed: +qs.get('speed') || 1, combo: qs.has('combo') ? +qs.get('combo') : 0.25 };
  // preset boards: overrides on a seeded no-match board, then one scripted swap [from, to] (row, col)
  var DEAD = ['e t g s e t g s', 'g s e t g s e t', 't g s e t g s e', 's e t g s e t g', 'e t g s e t g s', 'g s e t g s e t', 't g s e t g s e', 's e t g s e t g'];
  var PRESETS = {
    line: { note: '4 in a row leaves a Row Shard', set: [[6, 0, 'g'], [6, 1, 'e'], [6, 2, 'e'], [6, 3, 't'], [6, 4, 'e'], [6, 5, 'g'], [5, 3, 'e'], [4, 3, 'g'], [7, 3, 'g']], move: [[5, 3], [6, 3]] },
    shard: { note: 'a match with a Row Shard clears its row', set: [[6, 1, 'g'], [6, 2, 'e-'], [6, 3, 'e'], [6, 4, 't'], [5, 4, 'e'], [6, 5, 'g'], [4, 4, 'g'], [7, 4, 'g']], move: [[5, 4], [6, 4]] },
    blast: { note: 'an L or T leaves a Blast gem', set: [[3, 2, 'g'], [4, 2, 's'], [5, 2, 's'], [6, 2, 't'], [7, 2, 's'], [6, 1, 'g'], [6, 3, 's'], [6, 4, 's'], [6, 5, 'g'], [7, 1, 'e'], [7, 3, 'e']], move: [[7, 2], [6, 2]] },
    boom: { note: 'a match with a Blast gem clears 3 x 3', set: [[5, 2, 'g'], [5, 3, 's*'], [5, 4, 's'], [5, 5, 't'], [4, 5, 's'], [5, 6, 'g'], [3, 5, 'g'], [6, 5, 'g']], move: [[4, 5], [5, 5]] },
    prism: { note: '5 in a row leaves a Prism', set: [[6, 0, 'g'], [6, 1, 'h'], [6, 2, 'h'], [6, 3, 't'], [6, 4, 'h'], [6, 5, 'h'], [6, 6, 'g'], [5, 3, 'h'], [4, 3, 'g'], [7, 3, 'g']], move: [[5, 3], [6, 3]] },
    rainbow: { note: 'a Prism swapped with a gem clears that colour', set: [[5, 3, 'P'], [5, 4, 'e']], move: [[5, 3], [5, 4]] },
    reshuffle: { note: 'no move left: the board reshuffles', dead: true }
  };
  var canvas = document.getElementById('screen'), g = canvas.getContext('2d'), frame = 0, applied = -1, script = [];
  var m3 = M3.create({ view: { x: 0, y: 0, w: W, h: H }, seed: SEED, params: P,
    drawActor: function (gx, a) {   // a hit: full-colour sprite, a bright rim around its outline, a red tint for 2 frames (never translucent)
      if (!Kit || !Kit.has(a.look)) return false;
      if (!(a.flash > 0.02) || a.portrait) { gx.save(); if (a.tint) gx.filter = a.tint; Kit.sprite(gx, a.look, a.x, a.footY, { h: a.h, facing: a.facing, alpha: a.alpha, lift: a.lift, squash: a.squash, shadow: !a.portrait }); gx.restore(); return true; }
      var T = gx.getTransform(), ds = Math.sqrt(Math.abs(T.a * T.d - T.b * T.c)) || 1, A = window.GameDNA_DemoKitArt.sprites[a.look], sw = (A ? A.bodyW / A.bodyH : 0.6) * a.h, bw = sw * 1.5 + 12, bh = a.h * 1.5 + a.lift + 12, ox = a.x - bw / 2, oy = a.footY - bh + a.h * 0.2, lw = Math.ceil(bw * ds), lh = Math.ceil(bh * ds);
      var c = document.createElement('canvas'); c.width = lw; c.height = lh; var q = c.getContext('2d'); q.setTransform(ds, 0, 0, ds, -ox * ds, -oy * ds); if (a.tint) q.filter = a.tint;
      Kit.sprite(q, a.look, a.x, a.footY, { h: a.h, facing: a.facing, alpha: 1, lift: a.lift, squash: a.squash, shadow: false }); q.filter = 'none'; q.setTransform(1, 0, 0, 1, 0, 0);
      var k = Math.min(1, a.flash / 0.4), rc = document.createElement('canvas'); rc.width = lw; rc.height = lh; var rq = rc.getContext('2d'); rq.drawImage(c, 0, 0); rq.globalCompositeOperation = 'source-in'; rq.fillStyle = '#fff1c4'; rq.fillRect(0, 0, lw, lh);
      if (k > 0.85) { q.globalCompositeOperation = 'source-atop'; q.fillStyle = 'rgba(255,70,50,0.12)'; q.fillRect(0, 0, lw, lh); }
      Kit.shadow(gx, a.x, a.footY + a.h * 0.012, sw * 0.42, Math.max(1.5, a.h * 0.05), 0.42 * a.alpha);
      var rr = Math.max(1.5, a.h * 0.022); gx.save(); gx.globalAlpha *= a.alpha * k; for (var i = 0; i < 8; i++) { var an = i * Math.PI / 4; gx.drawImage(rc, ox + Math.cos(an) * rr, oy + Math.sin(an) * rr, lw / ds, lh / ds); } gx.restore();
      gx.save(); gx.globalAlpha *= a.alpha; gx.drawImage(c, ox, oy, lw / ds, lh / ds); gx.restore(); return true; },
    actorBox: function (a) { var A = window.GameDNA_DemoKitArt && GameDNA_DemoKitArt.sprites[a.look], w = (A ? A.bodyW / A.bodyH : 0.6) * a.h * 0.86; return { x: a.x - w / 2, y: a.footY - a.lift - a.h, w: w, h: a.h }; },
    drawIcon: function (gx, key, x, y, s) { var I = window.GameDNA_ShardIcons; if (!I || !iconImg.width) return false; var i = I.keys.indexOf(key); if (i < 0) return false; gx.drawImage(iconImg, (i % I.cols) * I.cell, Math.floor(i / I.cols) * I.cell, I.cell, I.cell, x - s / 2, y - s / 2, s, s); return true; },
    drawBackdrop: function (gx, r) { return !!(Kit && Kit.backdrop(gx, SCENE, { x: r.x, y: r.y, w: r.w, h: r.h, groundY: r.groundY + 6 })); },
    onEnd: function () { } });
  var iconImg = new Image(); if (window.GameDNA_ShardIcons) iconImg.src = GameDNA_ShardIcons.src;
  function presetRows(pr) {
    if (pr.dead) return DEAD;
    var R = M3.rules, letters = { ember: 'e', tide: 't', grove: 'g', spark: 's', heart: 'h' };
    for (var s = 1; s < 400; s++) {   // a seeded base board where the overrides make no match on their own
      var b = R.make(8, 8); R.fill(b, M3.rng(SEED * 1000 + s), M3.GEMS);
      var rows = []; for (var r = 0; r < 8; r++) { var row = []; for (var c = 0; c < 8; c++) row.push(letters[b.cells[r * 8 + c].t]); rows.push(row); }
      pr.set.forEach(function (o) { rows[o[0]][o[1]] = o[2]; });
      var t = R.make(8, 8); rows.forEach(function (row, r) { row.forEach(function (tok, c) { var id = { e: 'ember', t: 'tide', g: 'grove', s: 'spark', h: 'heart', P: 'prism' }[tok.charAt(0)]; t.cells[r * 8 + c] = R.gem(t, id, tok.charAt(0) === 'P' ? 'prism' : { '-': 'h', '|': 'v', '*': 'bomb' }[tok.charAt(1)] || null); }); });
      if (!R.hasMatch(t) && R.valid(t, pr.move[0][0] * 8 + pr.move[0][1], pr.move[1][0] * 8 + pr.move[1][1])) return rows.map(function (row) { return row.join(' '); });
    }
    return null;
  }
  function tick() {
    frame++;
    var pr = PRESETS[PRESET];
    if (pr && applied < 0 && m3.phase() === 'idle' && !m3.busy()) {
      applied = frame; m3.setBoard(presetRows(pr));
    }
    if (pr && applied > 0 && !script.length && !pr.done && pr.move && m3.phase() === 'idle' && !m3.busy()) {
      pr.done = true;
      if (pr.move) { var a = pr.move[0][0] * 8 + pr.move[0][1], b = pr.move[1][0] * 8 + pr.move[1][1], dir = pr.move[1][0] > pr.move[0][0] ? 'down' : pr.move[1][0] < pr.move[0][0] ? 'up' : pr.move[1][1] > pr.move[0][1] ? 'right' : 'left';
        script = [{ f: frame + 24, fn: function () { m3.pointer('down', m3.cellRect(a).x + 2, m3.cellRect(a).y + 2); m3.pointer('up', m3.cellRect(a).x + 2, m3.cellRect(a).y + 2); } }, { f: frame + 42, fn: function () { m3.key(dir); } }]; }
    }
    script = script.filter(function (s) { if (frame >= s.f) { s.fn(); return false; } return true; });
    m3.update(STEP);
  }
  function render() {
    g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    var gr = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.7); gr.addColorStop(0, '#3a2a26'); gr.addColorStop(1, '#120c10'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    m3.drawScene(g); m3.drawUI(g);
  }
  function fit() {
    var avail = Math.min(document.getElementById('stage').clientWidth || W, 1400), vh2 = (window.innerHeight || H) - (LAYOUT === 'tall' ? 40 : 160), css = Math.max(240, Math.min(avail, vh2 * W / H)), dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.style.width = Math.round(css) + 'px'; canvas.style.height = Math.round(css * H / W) + 'px'; canvas.width = Math.round(css * dpr); canvas.height = Math.round(css * dpr * H / W);
  }
  function local(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
  ['pointerdown', 'pointermove', 'pointerup'].forEach(function (t) { canvas.addEventListener(t, function (e) { e.preventDefault(); var p = local(e); m3.setAuto(false); m3.pointer(t.slice(7), p.x, p.y); }); });
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'ok', Z: 'ok', ' ': 'ok', Enter: 'ok', x: 'back', X: 'back', t: 'target', T: 'target', 1: '1', 2: '2', 3: '3', 4: '4' };
  addEventListener('keydown', function (e) { if (e.key === 'p' || e.key === 'P') { m3.setAuto(!m3.auto()); return; } var k = KEYS[e.key]; if (!k || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return; e.preventDefault(); m3.setAuto(false); m3.key(k); });
  // controls: each one reloads the page with the new parameter (the battle is seeded, so the same settings give the same battle)
  document.querySelectorAll('[data-q]').forEach(function (el) { var k = el.getAttribute('data-q'); if (qs.has(k)) el.value = qs.get(k); el.addEventListener('change', function () { qs.set(k, el.value); qs.delete('t'); qs.delete('freeze'); location.search = qs.toString(); }); });
  var noteEl = document.getElementById('note'); if (noteEl) noteEl.textContent = PRESETS[PRESET] ? 'Preset: ' + PRESETS[PRESET].note + ' (one scripted swap).' : 'The bot plays; press any key or tap to take over.';
  window.__state = function () { return { t: Math.round(frame * STEP), preset: PRESET, layout: LAYOUT, m3: m3.state(), actors: m3.actors() }; };
  window.__m3 = m3;
  function boot() {
    fit(); m3.start({ waves: [FOES], seed: SEED, name: 'Demo', stage: PRESET === 'battle' ? 'Demo' : 'Preset' }); m3.setAuto(AUTO);
    if (FROZEN) { var n = Math.floor(FREEZE_AT / STEP); for (var i = 0; i < n; i++) tick(); render(); window.__frozen = true; return; }
    var last = performance.now(), acc = 0;
    (function loop(now) { acc += Math.min(250, now - last); last = now; while (acc >= STEP) { tick(); acc -= STEP; } render(); requestAnimationFrame(loop); })(last);
  }
  var ready = function () { if (iconImg.complete) boot(); else { iconImg.onload = boot; iconImg.onerror = boot; } };
  if (Kit) Kit.ready(ready); else ready();
})();
