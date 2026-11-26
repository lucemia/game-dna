/* A-18 on-map-skirmish demo: a small river-valley map (240 x 160 native, 16 px tiles) whose units fight in place through
 * GameDNA_OnMapSkirmish. A scripted tour plays three exchanges (follow-up and KO, plates moved to the top, a boss that
 * braces); any key or button hands the map to you: arrows move the cursor, Z selects a blue unit and then an adjacent red
 * one to attack, X cancels; during an exchange Z skips and X toggles x2. ?t=<ms>&freeze=1 replays the tour to that moment.
 */
(function () {
  'use strict';
  var NW = 240, NH = 160, T = 16, COLS = 15, ROWS = 10, STEP = 1000 / 60;
  var PARAMS = /*PARAMS*/[], VARIANTS = /*VARIANTS*/[];
  var Q = new URLSearchParams(location.search);
  var FREEZE_T = Q.has('t') ? Math.max(0, +Q.get('t') || 0) : null, FROZEN = FREEZE_T != null && Q.get('freeze') === '1';
  var C = window.GameDNA_SkirmishCast, M = window.GameDNA_OnMapSkirmish;

  /* ---------- map ---------- */
  var LAYOUT = [
    'FFFgggggwggMMMM',
    'FFgggfggwgggMMM',
    'Fgggggggwgggggf',
    'ggggggggwgggggg',
    'ggggggggwggggCg',
    'gfggggggwgggggg',
    'rrrrrrrr=rrrrrr',
    'ggggggggwgggggF',
    'FFgggfggwwgggFF',
    'FFFggggggwggFFF'];
  function tileAt(x, y) { return (LAYOUT[y] || '')[x] || 'g'; }
  function hsh(a, b, c) { var n = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul((c | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
  var GR = ['#4e9a34', '#5aa83c', '#66b444', '#3e8a2c', '#7cc850', '#2e6e24'];
  function paintGround(g) {
    var x, y, i, px, py;
    for (y = 0; y < NH; y++) for (x = 0; x < NW; x++) {
      var n = hsh(x >> 1, y >> 1, 3), k = n < 0.18 ? 0 : n < 0.82 ? 1 : 2;
      g.fillStyle = GR[k]; g.fillRect(x, y, 1, 1);
    }
    // grass tufts
    for (i = 0; i < 260; i++) { px = Math.floor(hsh(i, 1, 9) * NW); py = Math.floor(hsh(i, 2, 9) * NH); g.fillStyle = GR[3]; g.fillRect(px, py, 1, 2); g.fillRect(px + 2, py + 1, 1, 1); g.fillStyle = GR[4]; g.fillRect(px + 1, py - 1, 1, 2); }
    // road
    for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) if (tileAt(x, y) === 'r' || tileAt(x, y) === '=') {
      for (py = 2; py < 14; py++) for (px = 0; px < 16; px++) {
        var e = py === 2 || py === 13, nn = hsh(x * 16 + px, y * 16 + py, 5);
        g.fillStyle = e ? '#9a7a44' : nn < 0.1 ? '#a8844c' : nn > 0.93 ? '#e8cc90' : '#d0ac6c';
        g.fillRect(x * T + px, y * T + py, 1, 1);
      }
    }
    // river: wobbly banks (sand lip, foam), deeper colour in the middle
    function isW(x, y) { var c = tileAt(x, y); return c === 'w' || c === '='; }
    for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) { if (!isW(x, y)) continue;
      for (py = 0; py < 16; py++) for (px = 0; px < 16; px++) {
        var wx = x * T + px, wy = y * T + py, wob = Math.round(hsh(0, wy >> 2, 11) * 2), wobR = Math.round(hsh(1, wy >> 2, 11) * 2);
        var dl = isW(x - 1, y) ? 99 : px - wob, dr = isW(x + 1, y) ? 99 : 15 - px - wobR, du = isW(x, y - 1) || y === 0 ? 99 : py - wob, dd = isW(x, y + 1) || y === ROWS - 1 ? 99 : 15 - py - wobR;
        var de = Math.min(dl, dr, du, dd);
        if (de < 0) continue;
        var wave = Math.sin((wx * 0.7 + wy * 0.35)) * 0.5 + 0.5, col;
        if (de === 0) col = '#3e7a2a'; else if (de === 1) col = '#d8c084'; else if (de === 2) col = '#e8f4ff';
        else if (de < 5) col = wave > 0.75 ? '#58a0f0' : '#3c84e0'; else col = wave > 0.82 ? '#3a7ee0' : '#2a62c4';
        g.fillStyle = col; g.fillRect(wx, wy, 1, 1);
      }
    }
    // flowers and pebbles on the grass
    for (i = 0; i < 70; i++) {
      px = Math.floor(hsh(i, 5, 21) * NW); py = Math.floor(hsh(i, 6, 21) * NH);
      var tc = tileAt(px >> 4, py >> 4); if (tc !== 'g') continue;
      var fc = ['#fff8e0', '#ffe070', '#ffb0c8', '#c8d8ff'][i % 4];
      g.fillStyle = '#2e6e24'; g.fillRect(px, py + 1, 1, 2);
      g.fillStyle = fc; g.fillRect(px - 1, py, 3, 1); g.fillRect(px, py - 1, 1, 3); g.fillStyle = '#ffd040'; g.fillRect(px, py, 1, 1);
    }
  }
  function drawWaterFx(g, t) {
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) { var ch = tileAt(x, y); if (ch !== 'w') continue;
      for (var i = 0; i < 3; i++) {
        var ph = ((t / 90) + hsh(x, y, i) * 16) % 16, sx = x * T + 3 + Math.floor(hsh(x, y, i + 7) * 9), sy = y * T + Math.floor(ph);
        g.fillStyle = i ? '#7ab4f4' : '#d8ecff'; g.fillRect(sx, sy, i ? 2 : 1, 1);
      }
    }
  }
  function drawBridge(g) {
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) if (tileAt(x, y) === '=') {
      var X = x * T, Y = y * T;
      g.fillStyle = '#3a3440'; g.fillRect(X - 1, Y + 1, 18, 14);
      for (var py = 2; py < 14; py++) { g.fillStyle = py % 3 === 0 ? '#7a7484' : py % 3 === 1 ? '#b8b0c0' : '#a098a8'; g.fillRect(X, Y + py, 16, 1); }
      g.fillStyle = '#d8d0e0'; g.fillRect(X, Y + 1, 16, 1); g.fillStyle = '#5a5464'; g.fillRect(X, Y + 14, 16, 1);
    }
  }
  function tree(g, x, y, s) {   // a round canopy tree, 14 px wide, trunk at the tile bottom
    var cx = x + 8, cy = y + 6;
    g.fillStyle = 'rgba(16,40,16,0.35)'; g.fillRect(x + 3, y + 13, 11, 2);
    g.fillStyle = '#5a3418'; g.fillRect(cx - 1, y + 10, 3, 5); g.fillStyle = '#8a5428'; g.fillRect(cx - 1, y + 10, 1, 5);
    for (var py = -6; py <= 5; py++) for (var px = -7; px <= 6; px++) {
      var d = (px + 0.5) * (px + 0.5) / 44 + (py + 0.5) * (py + 0.5) / 34; if (d > 1) continue;
      var n = hsh(x + px, y + py, s), lit = (px + py) < -4;
      g.fillStyle = d > 0.82 ? '#1a4a1c' : lit ? (n > 0.5 ? '#6cc04c' : '#58aa40') : (px + py) > 3 ? '#2a6428' : n > 0.7 ? '#4a9a36' : '#3c8a30';
      g.fillRect(cx + px, cy + py, 1, 1);
    }
    g.fillStyle = '#a8e07c'; g.fillRect(cx - 4, cy - 4, 2, 1); g.fillRect(cx - 2, cy - 5, 2, 1);
  }
  function rock(g, x, y, s) {   // a small crag
    var pts = [[2, 14], [6, 3], [9, 6], [12, 2], [15, 14]];
    for (var py = 2; py < 15; py++) for (var px = 1; px < 16; px++) {
      var l = py >= 14 - (px < 6 ? (px - 2) * 2.75 : px < 9 ? 11 - (px - 6) : px < 12 ? 8 + (px - 9) * 1.3 : 12 - (px - 12) * 4);
      if (!l) continue;
      var edge = !(py - 1 >= 14 - (px < 6 ? (px - 2) * 2.75 : px < 9 ? 11 - (px - 6) : px < 12 ? 8 + (px - 9) * 1.3 : 12 - (px - 12) * 4));
      var n = hsh(x + px, y + py, s);
      g.fillStyle = edge ? '#2a2630' : px < 7 || (px > 9 && px < 12) ? (n > 0.6 ? '#e4dcc8' : '#c8c0aa') : (n > 0.6 ? '#8a8270' : '#a49a84');
      g.fillRect(x + px, y + py, 1, 1);
    }
    void pts;
  }
  function camp(g, x, y) {   // the raiders' palisade hut (two tiles tall)
    var X = x * T, Y = y * T - 12;
    g.fillStyle = 'rgba(16,30,12,0.35)'; g.fillRect(X + 1, Y + 26, 16, 3);
    for (var i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#7a4a22' : '#9a6230'; g.fillRect(X + 1 + i * 2, Y + 12, 2, 16); g.fillStyle = '#c88a48'; g.fillRect(X + 1 + i * 2, Y + 12, 1, 1); }
    g.fillStyle = '#3a2010'; g.fillRect(X + 6, Y + 19, 5, 9);
    for (var r = 0; r < 8; r++) { g.fillStyle = r < 2 ? '#e8c878' : r % 2 ? '#b08a40' : '#c89c4c'; g.fillRect(X + 8 - r - 1, Y + 4 + r, (r + 1) * 2 + 1, 1); }
    g.fillStyle = '#5a3a18'; g.fillRect(X + 8, Y - 4, 1, 9); g.fillStyle = '#e04838'; g.fillRect(X + 9, Y - 4, 5, 3); g.fillStyle = '#a02a20'; g.fillRect(X + 9, Y - 2, 5, 1);
  }
  function post(g, x, y) {   // a wooden fence post with a banner
    var X = x * T + 6, Y = y * T;
    g.fillStyle = '#5a3a18'; g.fillRect(X, Y, 2, 15); g.fillStyle = '#e04838'; g.fillRect(X + 2, Y + 1, 6, 4); g.fillStyle = '#a02a20'; g.fillRect(X + 2, Y + 4, 6, 1);
  }
  var groundCanvas = null;
  function ground() {
    if (groundCanvas) return groundCanvas;
    var c = document.createElement('canvas'); c.width = NW; c.height = NH; var g = c.getContext('2d');
    paintGround(g); drawBridge(g);
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
      var ch = tileAt(x, y);
      if (ch === 'f') tree(g, x * T, y * T, x * 13 + y);
      if (ch === 'F') { tree(g, x * T - 3, y * T - 3, x * 13 + y); tree(g, x * T + 4, y * T + 2, x * 17 + y * 3); }
      if (ch === 'M') rock(g, x * T, y * T, x + y * 7);
      if (ch === 'P') post(g, x, y);
    }
    for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) if (tileAt(x, y) === 'C') camp(g, x, y);
    return (groundCanvas = c);
  }

  /* ---------- units ---------- */
  var ROSTER = [
    { id: 'arden', name: 'Arden', cls: 'lord', team: 'a', at: [3, 4], hp: 22, atk: 11, def: 4, spd: 11, hit: 90 },
    { id: 'bram', name: 'Bram', cls: 'lancer', team: 'a', at: [9, 7], hp: 24, atk: 9, def: 6, spd: 6, hit: 85 },
    { id: 'hale', name: 'Hale', cls: 'brigand', team: 'a', at: [11, 5], hp: 22, atk: 10, def: 3, spd: 8, hit: 80 },
    { id: 'raider', name: 'Brigand', cls: 'brigand', team: 'b', at: [4, 4], hp: 18, atk: 8, def: 1, spd: 5, hit: 70 },
    { id: 'pike1', name: 'Pikeman', cls: 'soldier', team: 'b', at: [6, 3], hp: 20, atk: 8, def: 3, spd: 6, hit: 75 },
    { id: 'pike2', name: 'Pikeman', cls: 'soldier', team: 'b', at: [10, 7], hp: 20, atk: 9, def: 3, spd: 6, hit: 75 },
    { id: 'boss', name: 'Warlord', cls: 'warlord', team: 'b', at: [12, 5], hp: 40, atk: 13, def: 6, spd: 7, hit: 80, boss: true }
  ];
  var BOX = {};
  function opaqueBox(cls) {
    if (BOX[cls]) return BOX[cls];
    var x0 = 99, y0 = 99, x1 = -1, y1 = -1;
    ['idle0', 'idle1'].forEach(function (pose) { var p = C.pixels(cls, pose, 'right'); for (var y = 0; y < p.h; y++) for (var x = 0; x < p.w; x++) if (p.data[(y * p.w + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } });
    return (BOX[cls] = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  var G = null;
  function fresh() {
    G = { t: 0, units: ROSTER.map(function (r) { return Object.assign({}, r, { tx: r.at[0], ty: r.at[1], max: r.hp, done: false, dead: false }); }),
      cursor: { x: 1, y: 6, px: 16, py: 96 }, sel: null, phase: 'player', director: !FROZEN ? !Q.has('play') : true, queue: [], log: [], rng: 0x2f6e2b1 };
    if (sk) sk.clear();
  }
  function unitAt(x, y) { for (var i = 0; i < G.units.length; i++) { var u = G.units[i]; if (!u.dead && u.tx === x && u.ty === y) return u; } return null; }
  function byId(id) { for (var i = 0; i < G.units.length; i++) if (G.units[i].id === id) return G.units[i]; return null; }
  function foot(u) { return { x: u.tx * T + 8, y: u.ty * T + 14 }; }
  function spriteXY(u) { var f = C.foot(u.cls), p = foot(u); return { x: p.x - f.x, y: p.y - f.y }; }
  function screenBox(u) { var s = spriteXY(u), b = opaqueBox(u.cls); return { x: s.x + b.x, y: s.y + b.y, w: b.w, h: b.h }; }
  function rand() { var x = G.rng; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; G.rng = x; return x / 4294967296; }
  function nearestFoe(u) { var best = null, bd = 1e9; G.units.forEach(function (o) { if (o.dead || o.team === u.team) return; var d = Math.abs(o.tx - u.tx) + Math.abs(o.ty - u.ty) * 1.01; if (d < bd) { bd = d; best = o; } }); return best; }
  function idleFacing(u) { var f = nearestFoe(u); if (!f || f.tx === u.tx) return u.team === 'a' ? 'right' : 'left'; return f.tx > u.tx ? 'right' : 'left'; }

  /* ---------- exchanges: the GAME decides; the module stages ---------- */
  function resolve(att, def, forced) {
    var order = M.order({ attSpd: att.spd, defSpd: def.spd, gap: sk.params().gap, counter: true }), hp = { att: att.hp, def: def.hp }, strikes = [];
    for (var i = 0; i < order.length; i++) {
      var by = order[i], A = by === 'att' ? att : def, D = by === 'att' ? def : att, key = by === 'att' ? 'def' : 'att';
      if (hp.att <= 0 || hp.def <= 0) break;
      var f = forced && forced[i], roll = f ? null : rand(), crit = f ? f.result === 'crit' : roll < 0.08;
      var hitOk = f ? f.result !== 'miss' : crit || rand() * 100 < A.hit - D.spd * 2;
      var dmg = !hitOk ? 0 : f && f.dmg != null ? f.dmg : Math.max(1, A.atk - D.def) * (crit ? 3 : 1);
      dmg = Math.min(dmg, hp[key]);
      strikes.push({ by: by, result: hitOk ? (crit ? 'crit' : 'hit') : 'miss', dmg: dmg });
      hp[key] -= dmg;
    }
    return { strikes: strikes, after: hp };
  }
  function fight(att, def, forced) {
    var r = resolve(att, def, forced);
    G.log.push(att.name + ' -> ' + def.name + ': ' + r.strikes.map(function (s) { return s.result + (s.dmg ? ' ' + s.dmg : ''); }).join(', '));
    var ok = sk.play({
      attacker: { id: att.id, name: att.name, team: att.team, hp: att.hp, max: att.max, box: screenBox(att), boss: !!att.boss },
      defender: { id: def.id, name: def.name, team: def.team, hp: def.hp, max: def.max, box: screenBox(def), boss: !!def.boss },
      strikes: r.strikes, after: r.after,
      onDone: function (res) { att.hp = res.att; def.hp = res.def; if (att.hp <= 0) att.dead = true; if (def.hp <= 0) def.dead = true; att.done = true; G.busyUntil = G.t + 200; }
    });
    return ok;
  }

  /* ---------- the scripted tour (also what ?t= replays) ---------- */
  var TOUR = [
    [500, 'cursor', 3, 4], [1250, 'select'], [1550, 'cursor', 4, 4], [2150, 'attack', 'arden', 'raider', [{ result: 'hit', dmg: 7 }, { result: 'miss' }, { result: 'crit', dmg: 11 }]],
    [6900, 'banner', 'enemy'], [7400, 'cursor', 10, 7], [8000, 'attack', 'pike2', 'bram', [{ result: 'hit', dmg: 3 }, { result: 'hit', dmg: 6 }]],
    [11100, 'banner', 'player'], [11500, 'cursor', 11, 5], [12000, 'select'], [12300, 'cursor', 12, 5], [12800, 'attack', 'hale', 'boss', [{ result: 'hit', dmg: 7 }, { result: 'hit', dmg: 9 }]],
    [16600, 'end']
  ];
  var TOUR_LEN = 17000;
  function director() {
    var t = G.t % TOUR_LEN;
    if (t < STEP && G.t >= TOUR_LEN) { var keep = G.t; fresh(); G.t = keep; }
    TOUR.forEach(function (ev) {
      if (!(ev[0] > t - STEP && ev[0] <= t)) return;
      if (ev[1] === 'cursor') { G.cursor.x = ev[2]; G.cursor.y = ev[3]; }
      if (ev[1] === 'select') G.sel = unitAt(G.cursor.x, G.cursor.y);
      if (ev[1] === 'attack') { G.sel = null; fight(byId(ev[2]), byId(ev[3]), ev[4]); }
      if (ev[1] === 'banner') { G.phase = ev[2]; G.banner = { text: ev[2] === 'enemy' ? 'ENEMY PHASE' : 'PLAYER PHASE', t0: G.t, team: ev[2] === 'enemy' ? 'b' : 'a' }; }
    });
  }

  /* ---------- interactive play ---------- */
  function adjacentFoes(u) { return G.units.filter(function (o) { return !o.dead && o.team !== u.team && Math.abs(o.tx - u.tx) + Math.abs(o.ty - u.ty) === 1; }); }
  function press(k) {
    if (sk.busy()) { if (k === 'ok') sk.key('z'); else if (k === 'back') sk.key('x'); return; }
    if (G.phase !== 'player' || G.busyUntil > G.t) return;
    var c = G.cursor;
    if (k === 'left') c.x = Math.max(0, c.x - 1); if (k === 'right') c.x = Math.min(COLS - 1, c.x + 1);
    if (k === 'up') c.y = Math.max(0, c.y - 1); if (k === 'down') c.y = Math.min(ROWS - 1, c.y + 1);
    if (k === 'back') G.sel = null;
    if (k === 'ok') {
      var u = unitAt(c.x, c.y);
      if (!G.sel) { if (u && u.team === 'a' && !u.done) G.sel = u; }
      else if (u && u.team !== G.sel.team && adjacentFoes(G.sel).indexOf(u) >= 0) { var a = G.sel; G.sel = null; fight(a, u); }
      else if (u === G.sel) { G.sel.done = true; G.sel = null; }
      else G.sel = u && u.team === 'a' && !u.done ? u : null;
    }
  }
  function playTurns() {
    if (G.director || sk.busy() || G.busyUntil > G.t) return;
    var blue = G.units.filter(function (u) { return !u.dead && u.team === 'a'; }), red = G.units.filter(function (u) { return !u.dead && u.team === 'b'; });
    if (!blue.length || !red.length) { if (!G.over) G.over = { t0: G.t, win: !red.length }; return; }
    if (G.phase === 'player' && blue.every(function (u) { return u.done || !adjacentFoes(u).length; }) && blue.some(function (u) { return u.done; })) {
      G.phase = 'enemy'; G.banner = { text: 'ENEMY PHASE', t0: G.t, team: 'b' }; G.queue = red.slice(); G.busyUntil = G.t + 900; return;
    }
    if (G.phase === 'enemy') {
      while (G.queue.length) {
        var e = G.queue.shift(); if (e.dead) continue;
        var foes = adjacentFoes(e); if (!foes.length) continue;
        G.cursor.x = e.tx; G.cursor.y = e.ty; fight(e, foes[0]); return;
      }
      G.phase = 'player'; G.units.forEach(function (u) { u.done = false; }); G.banner = { text: 'PLAYER PHASE', t0: G.t, team: 'a' }; G.busyUntil = G.t + 900;
    }
  }

  /* ---------- module ---------- */
  var cssScale = 2;
  var sk = M.create({
    view: { x: 0, y: 0, w: NW, h: NH }, cssPerPx: function () { return cssScale; },
    params: readParams(),
    getObstacles: function () { return G.units.filter(function (u) { return !u.dead; }).map(function (u) { var b = screenBox(u); b.id = u.id; return b; }); },
    uiRects: function () { return []; }
  });
  function readParams() { var p = {}; PARAMS.forEach(function (d) { p[d.key] = Q.has(d.key) ? Q.get(d.key) : d.default; }); return p; }

  function step() {
    G.t += STEP;
    if (G.director) director(); else playTurns();
    // the cursor glides between tiles
    var c = G.cursor, tx = c.x * T, ty = c.y * T;
    c.px += Math.sign(tx - c.px) * Math.min(4, Math.abs(tx - c.px)); c.py += Math.sign(ty - c.py) * Math.min(4, Math.abs(ty - c.py));
    sk.update(STEP);
  }

  /* ---------- drawing ---------- */
  var scr = document.getElementById('screen'), out = scr.getContext('2d'), nat = document.createElement('canvas'); nat.width = NW; nat.height = NH;
  var g = nat.getContext('2d');
  function art(u) {
    return function (pose, want) {
      var side = want || idleFacing(u), p = pose;
      if (pose === 'idle' || pose === 'dodge') p = ((G.t + (u.tx * 131 + u.ty * 71)) % 1000) < 500 ? 'idle0' : 'idle1';
      if (pose === 'brace' && !u.boss) p = 'idle0';
      if (pose === 'dodge') p = 'idle0';
      return { img: C.canvas(u.cls, p, side, u.team), __side: true, __flip: false };
    };
  }
  function drawShadow(u) {
    var p = foot(u), o = sk.offset(u.id), w = u.boss ? 18 : 10;
    if (o.ko >= 1) return;
    g.fillStyle = 'rgba(12,30,10,0.38)'; g.fillRect(p.x - w / 2 + o.x, p.y + 1 + Math.max(0, o.y), w, 2); g.fillRect(p.x - w / 2 + 1 + o.x, p.y + Math.max(0, o.y), w - 2, 1);
  }
  function drawCursor() {
    var c = G.cursor, x = Math.round(c.px), y = Math.round(c.py), o = (Math.floor(G.t / 260) % 2), col = G.phase === 'enemy' ? '#ff7a5a' : '#fff4c0';
    if (sk.busy()) return;
    [[x - o, y - o, 1, 1], [x + 15 + o, y - o, -1, 1], [x - o, y + 15 + o, 1, -1], [x + 15 + o, y + 15 + o, -1, -1]].forEach(function (q) {
      var cx = q[0], cy = q[1], sx = q[2], sy = q[3];
      g.fillStyle = '#1a1024'; g.fillRect(Math.min(cx, cx + sx * 4) - 1, cy - 1, 7, 3); g.fillRect(cx - 1, Math.min(cy, cy + sy * 4) - 1, 3, 7);
      g.fillStyle = col; g.fillRect(Math.min(cx, cx + sx * 4), cy, 5, 1); g.fillRect(cx, Math.min(cy, cy + sy * 4), 1, 5);
    });
  }
  function drawSelect() {
    if (!G.sel || sk.busy()) return;
    adjacentFoes(G.sel).forEach(function (f) { g.fillStyle = 'rgba(224,48,48,0.38)'; g.fillRect(f.tx * T + 1, f.ty * T + 1, 14, 14); g.fillStyle = 'rgba(255,140,120,0.8)'; g.fillRect(f.tx * T + 1, f.ty * T + 1, 14, 1); });
  }
  function drawBanner() {
    var b = G.banner; if (!b || sk.busy()) return;
    var k = (G.t - b.t0) / 900; if (k < 0 || k > 1) return;
    var a = k < 0.2 ? k / 0.2 : k > 0.8 ? (1 - k) / 0.2 : 1, y = 64, h = 26;
    g.globalAlpha = a; g.fillStyle = b.team === 'b' ? '#5a1418' : '#18307a'; g.fillRect(0, y, NW, h);
    g.fillStyle = b.team === 'b' ? '#d4442e' : '#3c72e4'; g.fillRect(0, y + 2, NW, h - 4);
    g.fillStyle = b.team === 'b' ? '#ffa47c' : '#98c4ff'; g.fillRect(0, y + 2, NW, 1);
    var tc = textImg(b.text, 2); if (tc) g.drawImage(tc, Math.round((NW - tc.width) / 2), y + 4);
    g.globalAlpha = 1;
  }
  var TXT = {};
  function textImg(s, sc) {   // the module's 5x8 font, for the demo's banner
    var key = s + sc; if (TXT[key]) return TXT[key];
    var m = M.measure(s, sc), c = document.createElement('canvas'); c.width = m.w; c.height = m.h; var q = c.getContext('2d'), cx = 1;
    String(s).toUpperCase().split('').forEach(function (ch) {
      var gl = M.glyphs[ch]; if (gl) for (var y = 0; y < 8; y++) for (var x = 0; x < gl[y].length; x++) if (gl[y][x] === '#') { q.fillStyle = '#141024'; q.fillRect((cx + x) * sc, (1 + y) * sc + sc, sc, sc); }
      if (gl) for (y = 0; y < 8; y++) for (x = 0; x < gl[y].length; x++) if (gl[y][x] === '#') { q.fillStyle = y < 4 ? '#ffffff' : '#e8ecff'; q.fillRect((cx + x) * sc, (1 + y) * sc, sc, sc); }
      cx += (ch === ' ' ? 3 : gl ? gl[0].length : 5) + 1;
    });
    return (TXT[key] = c);
  }
  function paint() {
    g.imageSmoothingEnabled = false;
    g.drawImage(ground(), 0, 0);
    drawWaterFx(g, G.t);
    drawSelect();
    var live = G.units.filter(function (u) { return !u.dead || sk.fighting(u.id); });
    live.forEach(drawShadow);
    live.slice().sort(function (a, b) { return a.ty - b.ty || a.tx - b.tx; }).forEach(function (u) {
      var s = spriteXY(u), bob = G.sel === u ? -((Math.floor(G.t / 120) % 2)) : 0;
      sk.drawActor(g, u.id, art(u), s.x, s.y + bob, { facing: idleFacing(u) });
      if (u.done && !sk.fighting(u.id) && G.phase === 'player') { /* spent units keep their colours; a small grey tick marks them */ g.fillStyle = '#1a1024'; g.fillRect(s.x + 17, s.y + 3, 4, 4); g.fillStyle = '#b8b4c4'; g.fillRect(s.x + 18, s.y + 4, 2, 2); }
    });
    drawCursor();
    sk.draw(g);
    drawBanner();
    out.imageSmoothingEnabled = false;
    out.drawImage(nat, 0, 0, scr.width, scr.height);
  }

  /* ---------- sizing: whole device pixels per native pixel ---------- */
  function fit() {
    var dpr = window.devicePixelRatio || 1, wrap = scr.parentElement, avail = Math.max(120, Math.min(wrap.parentElement.clientWidth - 12, 960));
    if (window.innerWidth <= 560) avail = window.innerWidth - 32;   // the 16 px page gutters
    var k = Math.max(1, Math.floor(avail * dpr / NW));
    scr.width = NW * k; scr.height = NH * k; scr.style.width = (NW * k / dpr) + 'px'; scr.style.height = (NH * k / dpr) + 'px';
    cssScale = k / dpr;
  }

  /* ---------- state for checks and critics ---------- */
  window.__state = function () {
    var st = sk.state();
    return {
      t: Math.round(G.t), phase: G.phase, busy: sk.busy(), skirmish: st,
      actors: G.units.filter(function (u) { return !u.dead || sk.fighting(u.id); }).map(function (u) {
        var f = sk.fighting(u.id) ? sk.facing(u.id) : null, tg = null, p = foot(u), o = sk.offset(u.id);
        if (sk.fighting(u.id)) { var a = st.actors.filter(function (x) { return x.id === u.id; })[0]; tg = a ? a.target : null; } else { var nf = nearestFoe(u); tg = nf ? nf.id : null; }
        var tgt = tg ? byId(tg) : null, fc = f || idleFacing(u);
        return { id: u.id, x: p.x + o.x, y: p.y + o.y, facing: fc, target: tgt && tgt.tx !== u.tx ? tg : null, asset: u.cls, team: u.team, hp: u.hp, pose: o.pose, flash: o.flash,
          noFace: tgt && tgt.tx === u.tx ? 'its nearest foe stands in the same column' : undefined };
      })
    };
  };
  window.__layout = function () {   // rects for the layout checks (native px)
    var st = sk.state();
    return { units: G.units.filter(function (u) { return !u.dead || sk.fighting(u.id); }).map(function (u) { var b = screenBox(u), o = sk.offset(u.id); return { id: u.id, x: b.x + o.x, y: b.y + o.y, w: b.w, h: b.h, ko: o.ko }; }),
      plates: st.plates || [], labels: st.labels || [], flash: !!st.flash, busy: sk.busy(), view: { w: NW, h: NH }, cssPerPx: cssScale };
  };
  window.__demo = { G: function () { return G; }, sk: sk, press: press, step: step, paint: paint };

  /* ---------- controls ---------- */
  function buildPanel() {
    var box = document.getElementById('params'); if (!box) return;
    PARAMS.forEach(function (d) {
      var row = document.createElement('div'); row.className = 'row';
      var lab = document.createElement('label'); lab.innerHTML = '<span>' + d.label + '</span><output></output>';
      var outp = lab.querySelector('output'), cur = Q.has(d.key) ? Q.get(d.key) : d.default;
      row.appendChild(lab);
      if (d.type === 'select') {
        var seg = document.createElement('div'); seg.className = 'seg';
        d.options.forEach(function (o) { var b = document.createElement('button'); b.textContent = o; b.setAttribute('aria-checked', String(String(cur) === String(o))); b.onclick = function () { seg.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-checked', 'false'); }); b.setAttribute('aria-checked', 'true'); outp.textContent = o; set(d.key, o); }; seg.appendChild(b); });
        row.appendChild(seg); outp.textContent = cur;
      } else {
        var r = document.createElement('input'); r.type = 'range'; r.min = d.min; r.max = d.max; r.step = d.step; r.value = cur;
        var upd = function () { outp.textContent = r.value; r.style.setProperty('--fill', ((r.value - d.min) / (d.max - d.min) * 100) + '%'); };
        r.oninput = function () { upd(); set(d.key, +r.value); }; upd(); row.appendChild(r);
      }
      box.appendChild(row);
    });
    var vb = document.getElementById('variants');
    VARIANTS.forEach(function (v) { var b = document.createElement('button'); b.textContent = v.name; b.onclick = function () { var p = {}; PARAMS.forEach(function (d) { p[d.key] = d.default; }); Object.assign(p, v.params); sk.setParams(p); syncPanel(p); restart(); }; vb.appendChild(b); });
  }
  function syncPanel(p) { document.getElementById('params').innerHTML = ''; document.getElementById('variants').innerHTML = ''; PARAMS.forEach(function (d) { Q.set(d.key, p[d.key]); }); buildPanel(); }
  function set(k, v) { var p = {}; p[k] = v; sk.setParams(p); }
  function restart() { fresh(); G.director = true; setStatus(); }
  function takeOver() { if (G.director) { G.director = false; if (sk.busy()) sk.skip(); G.phase = 'player'; G.banner = null; setStatus(); } }
  function setStatus() { var s = document.getElementById('status'); if (s) s.textContent = G.director ? 'Scripted tour: press a key or a button to take over.' : 'Your turn: pick a blue unit, then an adjacent red one.'; }
  var KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', x: 'back', X: 'back', Escape: 'back' };
  function input(k) { if (G.director && !(sk.busy() && (k === 'ok' || k === 'back'))) takeOver(); else if (G.director && sk.busy()) { takeOver(); return; } press(k); }

  fresh();
  buildPanel();   // the side panel shows its controls in stills too
  if (FROZEN) {
    fit(); var n = Math.round(FREEZE_T / STEP); for (var i = 0; i < n; i++) step(); paint(); window.__frozen = true;
    addEventListener('resize', function () { fit(); paint(); });
  } else {
    fit(); addEventListener('resize', fit); setStatus();
    addEventListener('keydown', function (e) { var k = KEYS[e.key]; if (!k) return; e.preventDefault(); input(k); });
    document.querySelectorAll('[data-k]').forEach(function (b) { b.addEventListener('click', function () { input(b.getAttribute('data-k')); }); });
    scr.addEventListener('pointerdown', function (e) {
      var r = scr.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * COLS), y = Math.floor((e.clientY - r.top) / r.height * ROWS);
      if (G.director) takeOver();
      if (sk.busy()) { sk.tap(); return; }
      G.cursor.x = Math.max(0, Math.min(COLS - 1, x)); G.cursor.y = Math.max(0, Math.min(ROWS - 1, y)); press('ok');
    });
    var rp = document.getElementById('replay'); if (rp) rp.onclick = restart;
    var rs = document.getElementById('reset'); if (rs) rs.onclick = function () { fresh(); G.director = false; setStatus(); };
    var last = performance.now(), bank = 0;
    (function loop(now) { bank += Math.min(250, now - last); last = now; while (bank >= STEP) { step(); bank -= STEP; } paint(); requestAnimationFrame(loop); })(last);
  }
})();
