
  /* =================================================================================================
     Rules: map + road, waves, towers, targeting, projectiles, economy. No DOM, no clock, no Math.random:
     everything comes from the seed and the number of fixed steps.
     ================================================================================================= */
  var DEFAULTS = { speed: 1, gold: null, lives: null, waveGap: 12, earlyBonus: 1, refund: 0.7, hpScale: 1, ring: 'on', grid: 'auto', preview: 'on', lane: 8, autoStart: 0, priority: null };

  function buildMap(spec) {
    spec = spec || MAPS.millbrook;
    var rows = (spec.rows || MAPS.millbrook.rows).slice(), R = rows.length, C = rows[0].length, cell = CELL, ox = MAPX, oy = MAPY;
    var grid = [], r, c;
    for (r = 0; r < R; r++) { grid.push([]); for (c = 0; c < C; c++) grid[r].push(rows[r].charAt(c) || '.'); }
    var road = {}, paths = [];
    (spec.paths || []).forEach(function (wp, pi) {
      var pts = [], i;
      for (i = 0; i < wp.length; i++) pts.push({ x: ox + (wp[i][0] + 0.5) * cell, y: oy + (wp[i][1] + 0.5) * cell });
      for (i = 0; i + 1 < wp.length; i++) {          // road cells of each straight run
        var a = wp[i], b = wp[i + 1], dc = Math.sign(b[0] - a[0]), dr = Math.sign(b[1] - a[1]), n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
        for (var k = 0; k <= n; k++) { var cc = a[0] + dc * k, rr2 = a[1] + dr * k; if (cc >= 0 && rr2 >= 0 && cc < C && rr2 < R) road[cc + ',' + rr2] = pi + 1; }
      }
      paths.push(densePath(pts, 15));
    });
    return { name: spec.name || 'Map', theme: spec.theme || 'meadow', cols: C, rows: R, cell: cell, x: ox, y: oy, w: C * cell, h: R * cell,
      grid: grid, road: road, paths: paths, waypoints: copy(spec.paths || []), gold: spec.gold, lives: spec.lives, spec: spec };
  }
  // dense polyline with rounded corners (radius rad), sampled about every 2 px, with cumulative lengths
  function densePath(pts, rad) {
    var out = [pts[0]], i;
    for (i = 1; i < pts.length - 1; i++) {
      var p = pts[i], a = pts[i - 1], b = pts[i + 1];
      var d1 = dist(a.x, a.y, p.x, p.y), d2 = dist(p.x, p.y, b.x, b.y), r1 = Math.min(rad, d1 / 2), r2 = Math.min(rad, d2 / 2), rr1 = Math.min(r1, r2);
      var A = { x: p.x + (a.x - p.x) / d1 * rr1, y: p.y + (a.y - p.y) / d1 * rr1 }, B = { x: p.x + (b.x - p.x) / d2 * rr1, y: p.y + (b.y - p.y) / d2 * rr1 };
      out.push(A);
      for (var k = 1; k < 8; k++) { var t = k / 8, u = 1 - t; out.push({ x: u * u * A.x + 2 * u * t * p.x + t * t * B.x, y: u * u * A.y + 2 * u * t * p.y + t * t * B.y }); }
      out.push(B);
    }
    out.push(pts[pts.length - 1]);
    var dense = [out[0]];
    for (i = 1; i < out.length; i++) {
      var q = dense[dense.length - 1], s = out[i], L = dist(q.x, q.y, s.x, s.y), n = Math.max(1, Math.ceil(L / 2));
      for (var j = 1; j <= n; j++) dense.push({ x: q.x + (s.x - q.x) * j / n, y: q.y + (s.y - q.y) * j / n });
    }
    var cum = [0], vang = [];
    for (i = 1; i < dense.length; i++) cum.push(cum[i - 1] + dist(dense[i - 1].x, dense[i - 1].y, dense[i].x, dense[i].y));
    // heading at each vertex (central difference); pathAt interpolates it, so the heading and the sideways lane offset turn
    // smoothly and a foe on the inner side of a bend never steps backwards
    for (i = 0; i < dense.length; i++) { var i0 = Math.max(0, i - 1), i1 = Math.min(dense.length - 1, i + 1); vang.push(Math.atan2(dense[i1].y - dense[i0].y, dense[i1].x - dense[i0].x)); }
    return { pts: dense, cum: cum, len: cum[cum.length - 1], vang: vang };
  }
  // position, heading and normal at distance d along path P
  function pathAt(P, d) {
    var cum = P.cum, pts = P.pts, n = pts.length;
    if (d <= 0) { var a0 = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x); return { x: pts[0].x + Math.cos(a0) * d, y: pts[0].y + Math.sin(a0) * d, ang: a0 }; }
    if (d >= P.len) { var a1 = Math.atan2(pts[n - 1].y - pts[n - 2].y, pts[n - 1].x - pts[n - 2].x), e = d - P.len; return { x: pts[n - 1].x + Math.cos(a1) * e, y: pts[n - 1].y + Math.sin(a1) * e, ang: a1 }; }
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
    var seg = cum[hi] - cum[lo] || 1, t = (d - cum[lo]) / seg, A = pts[lo], B = pts[hi];
    var a0 = P.vang[lo], da = Math.atan2(Math.sin(P.vang[hi] - a0), Math.cos(P.vang[hi] - a0)), ang = a0 + da * t;
    return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, ang: ang };
  }

  function makeSim(o) {
    var P = {}; var k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    for (k in (o.params || {})) if (o.params[k] != null) P[k] = o.params[k];
    var LIB = { towers: o.towers, enemies: o.enemies };
    var map = buildMap(o.map), waves = o.waves, R = rng((o.seed >>> 0) || 1);
    var S = {
      frame: 0, time: 0, phase: 'build', gold: P.gold != null ? +P.gold : (map.gold != null ? map.gold : 200), lives: P.lives != null ? +P.lives : (map.lives != null ? map.lives : 20),
      startGold: 0, startLives: 0, wave: 0, waveCount: waves.length, nextWave: 0, countdown: P.autoStart > 0 ? P.autoStart * 1000 : -1,
      towers: [], enemies: [], shots: [], fx: [], decals: [], banners: [], spawners: [], waveLeft: {}, waveSpawned: {}, waveTotal: {}, nextId: 1, nextTower: 1,
      kills: 0, leaks: 0, built: 0, earned: 0, spent: 0, result: null, ended: false, endT: 0
    };
    S.startGold = S.gold; S.startLives = S.lives;
    function emit(ev) { ev.frame = S.frame; safe(o.emit, [ev], 'onEvent'); }
    function gold(delta, why) { S.gold += delta; if (delta > 0) S.earned += delta; else S.spent -= delta; emit({ kind: 'gold', delta: delta, why: why, gold: S.gold }); }
    function towerDef(id) { return LIB.towers[id]; }
    function enemyDef(id) { return LIB.enemies[id] || LIB.enemies.mite || ENEMIES.mite; }
    function lvl(t) { var d = towerDef(t.type); return d.levels[Math.min(t.lvl, d.levels.length - 1)]; }

    /* ---------- cells ---------- */
    function cellAt(x, y) { var c = Math.floor((x - map.x) / map.cell), r = Math.floor((y - map.y) / map.cell); return { c: c, r: r }; }
    function cellCentre(c, r) { return { x: map.x + (c + 0.5) * map.cell, y: map.y + (r + 0.5) * map.cell }; }
    function towerAt(c, r) { for (var i = 0; i < S.towers.length; i++) if (S.towers[i].c === c && S.towers[i].r === r) return S.towers[i]; return null; }
    function isRoad(c, r) { return !!map.road[c + ',' + r]; }
    // why a tower of type id cannot be built on (c, r); null when it can
    function blockedWhy(c, r, id) {
      if (!(c >= 0 && r >= 0 && c < map.cols && r < map.rows)) return 'outside';
      if (isRoad(c, r)) return 'road';
      var ch = map.grid[r][c];
      if (ch !== '.' && ch !== ',') return ch === 'w' ? 'water' : 'blocked';
      if (towerAt(c, r)) return 'occupied';
      var d = id && towerDef(id); if (id && !d) return 'unknown';
      if (d && S.gold < d.levels[0].cost) return 'gold';
      return null;
    }

    /* ---------- towers ---------- */
    function build(id, c, r) {
      var why = blockedWhy(c, r, id);
      if (why) { emit({ kind: 'blocked', type: id, c: c, r: r, why: why }); return { ok: false, why: why }; }
      var d = towerDef(id), cost = d.levels[0].cost, p = cellCentre(c, r);
      var t = { id: 't' + (S.nextTower++), type: id, lvl: 0, c: c, r: r, x: p.x, y: p.y, cd: 0, priority: PRIORITIES.indexOf(P.priority) >= 0 ? P.priority : (d.priority || 'first'), invested: cost, aim: -Math.PI / 2, kick: 0, shots: 0, kills: 0, dealt: 0, born: S.frame, target: null };
      S.towers.push(t); S.built++;
      gold(-cost, 'build');
      emit({ kind: 'build', tower: t.id, type: id, c: c, r: r, cost: cost });
      S.fx.push({ k: 'dust', x: p.x, y: p.y + 10, t: 0, dur: 520, seed: S.nextTower * 7 });
      return { ok: true, tower: t };
    }
    function upgradeCost(t) { var d = towerDef(t.type); return t.lvl + 1 < d.levels.length ? d.levels[t.lvl + 1].cost : null; }
    function upgrade(tid) {
      var t = byTower(tid); if (!t) return { ok: false, why: 'none' };
      var c = upgradeCost(t); if (c == null) return { ok: false, why: 'max' };
      if (S.gold < c) { emit({ kind: 'blocked', type: t.type, c: t.c, r: t.r, why: 'gold' }); return { ok: false, why: 'gold' }; }
      t.lvl++; t.invested += c; gold(-c, 'upgrade');
      emit({ kind: 'upgrade', tower: t.id, type: t.type, level: t.lvl + 1, cost: c });
      S.fx.push({ k: 'lvl', x: t.x, y: t.y, t: 0, dur: 700 });
      return { ok: true, tower: t };
    }
    function refundOf(t) { return Math.floor(t.invested * P.refund); }
    function sell(tid) {
      var t = byTower(tid); if (!t) return { ok: false, why: 'none' };
      var v = refundOf(t); S.towers.splice(S.towers.indexOf(t), 1); gold(v, 'sell');
      emit({ kind: 'sell', tower: t.id, type: t.type, c: t.c, r: t.r, refund: v });
      S.fx.push({ k: 'dust', x: t.x, y: t.y + 10, t: 0, dur: 520, seed: 3 });
      S.fx.push({ k: 'coin', x: t.x, y: t.y - 14, amount: v, t: 0, dur: 900 });
      return { ok: true, refund: v };
    }
    function setPriority(tid, p) { var t = byTower(tid); if (!t || PRIORITIES.indexOf(p) < 0) return false; t.priority = p; emit({ kind: 'target', tower: t.id, priority: p }); return true; }
    function byTower(id) { if (id && typeof id === 'object') return S.towers.indexOf(id) >= 0 ? id : null; for (var i = 0; i < S.towers.length; i++) if (S.towers[i].id === id) return S.towers[i]; return null; }
    function byEnemy(id) { for (var i = 0; i < S.enemies.length; i++) if (S.enemies[i].id === id) return S.enemies[i]; return null; }

    /* ---------- targeting: the whole rule is here (the judge recomputes it) ---------- */
    function remaining(e) { return map.paths[e.path].len - e.dist; }
    function canHit(t, e) { var d = towerDef(t.type); return e.hp > 0 && !e.gone && e.dist > 0 && (e.def.flying ? d.air !== false : d.ground !== false); }
    function inRange(t, e) { var L = lvl(t); return dist(t.x, t.y, e.x, e.y) <= L.range * map.cell; }
    function better(t, a, b, pr) {   // true when a should be chosen over b
      if (pr === 'strong' && a.hp !== b.hp) return a.hp > b.hp;
      if (pr === 'near') { var da = dist(t.x, t.y, a.x, a.y), db = dist(t.x, t.y, b.x, b.y); if (Math.abs(da - db) > 1e-6) return da < db; }
      var ra = remaining(a), rb = remaining(b);
      if (Math.abs(ra - rb) > 1e-6) return ra < rb;      // first: the one closest to the gate
      return a.n < b.n;
    }
    function pickTarget(t, pr) {
      var best = null; pr = pr || t.priority;
      for (var i = 0; i < S.enemies.length; i++) { var e = S.enemies[i]; if (!canHit(t, e) || !inRange(t, e)) continue; if (!best || better(t, e, best, pr)) best = e; }
      return best;
    }

    /* ---------- damage ---------- */
    function damage(e, raw, t, type, pierce, extra) {
      if (!e || e.hp <= 0 || e.gone) return 0;
      var armor = pierce ? 0 : (e.def.armor || 0), amt = Math.max(1, Math.round(raw) - armor), before = e.hp;
      amt = Math.min(amt, e.hp); e.hp -= amt; e.flash = 1;
      var killed = e.hp <= 0;
      if (t) { t.dealt += amt; }
      var ev = { kind: 'damage', source: t ? t.id : null, tower: t ? t.type : null, target: e.id, enemy: e.kind, raw: Math.round(raw), armor: armor, amount: amt, hpBefore: before, hpAfter: e.hp, killed: killed, type: type || 'physical', x: e.x, y: e.y - e.hover };
      for (var q in (extra || {})) ev[q] = extra[q];
      safe(o.hit, [ev], 'onHit');
      if (killed) die(e, t);
      return amt;
    }
    function die(e, t) {
      e.dying = 1; e.deadAt = S.frame; S.kills++; if (t) t.kills++;
      var rw = e.def.reward | 0; if (rw) { gold(rw, 'kill'); S.fx.push({ k: 'coin', x: e.x, y: e.y - e.hover - 12, amount: rw, t: 0, dur: 900 }); }
      S.fx.push({ k: 'pop', x: e.x, y: e.y - e.hover, r: e.def.size || 8, col: (e.def.palette || {}).shell || '#888', t: 0, dur: 520, seed: e.n });
      if (!e.def.flying) S.decals.push({ k: 'splat', x: e.x, y: e.y, r: (e.def.size || 8) * 1.1, col: (e.def.palette || {}).dark || '#333', t: 0, seed: e.n });
      if (S.decals.length > 60) S.decals.shift();
      emit({ kind: 'death', unit: e.id, enemy: e.kind, by: t ? t.id : null, reward: rw, wave: e.wave });
      var od = e.def.onDeath;
      if (od && od.spawn && LIB.enemies[od.spawn]) for (var i = 0; i < (od.n | 0); i++) spawnEnemy(od.spawn, e.path, e.wave, Math.max(0, e.dist - 6 - i * 9), true);
    }

    /* ---------- enemies ---------- */
    function spawnEnemy(kind, path, wave, at, child) {
      var def = enemyDef(kind), hp = Math.max(1, Math.round((def.hp || 20) * P.hpScale * num((waves[wave - 1] || {}).hp, 1)));
      path = clamp(path | 0, 0, map.paths.length - 1);
      var e = { id: 'e' + S.nextId, n: S.nextId++, kind: LIB.enemies[kind] ? kind : 'mite', def: def, hp: hp, maxHp: hp, path: path, dist: at || 0, wave: wave,
        lane: (R() * 2 - 1) * Math.min(P.lane, Math.max(1, 12.5 - (def.size || 8) * 0.55)), x: 0, y: 0, ang: 0, vx: 0, vy: 0, slowK: 0, slowT: 0, flash: 0, walk: R() * 40, hover: def.flying ? 20 : 0, dying: 0, gone: false, child: !!child, born: S.frame };
      place(e);
      S.enemies.push(e);
      S.waveLeft[wave] = (S.waveLeft[wave] || 0) + 1;
      if (!child) S.waveSpawned[wave] = (S.waveSpawned[wave] || 0) + 1;
      emit({ kind: 'spawn', unit: e.id, enemy: e.kind, wave: wave, path: path, child: !!child });
      return e;
    }
    function place(e) {
      var p = pathAt(map.paths[e.path], e.dist), nx = -Math.sin(p.ang), ny = Math.cos(p.ang);
      e.x = p.x + nx * e.lane; e.y = p.y + ny * e.lane; e.ang = p.ang;
    }
    function moveEnemy(e, dt) {
      if (e.dying) { e.dying += dt / 420; if (e.dying >= 2) e.gone = true; return; }
      var slow = e.slowT > 0 ? e.slowK : 0;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) { e.slowT = 0; e.slowK = 0; } }
      var v = (e.def.speed || 1) * map.cell * (1 - slow), step = v * dt / 1000, px = e.x, py = e.y;
      e.dist += step; e.walk += step;
      // crowding: a ground foe that overlaps a neighbour on its road drifts sideways (never faster than a fifth of its
      // forward step, so it still faces where it walks), so a crowd spreads over the road instead of piling up
      if (!e.def.flying && e.dist > 0) {
        var push = 0, se = e.def.size || 8, maxL = Math.max(1, Math.min(8, 13 - se * 0.5));
        for (var i = 0; i < S.enemies.length; i++) { var o2 = S.enemies[i]; if (o2 === e || o2.path !== e.path || o2.dying || o2.gone || o2.def.flying) continue;
          var so = o2.def.size || 8, dd = Math.abs(o2.dist - e.dist), dl = e.lane - o2.lane, need = (se + so) * 0.85;
          if (dd < need && Math.abs(dl) < need) push += (dl === 0 ? (e.n > o2.n ? 1 : -1) : Math.sign(dl)) * (1 - dd / need); }
        if (push) e.lane = clamp(e.lane + clamp(push, -1, 1) * step / 5, -maxL, maxL);
      }
      place(e);
      e.vx = (e.x - px) * 1000 / dt; e.vy = (e.y - py) * 1000 / dt;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt / 120);
      if (e.dist >= map.paths[e.path].len + 10) leak(e);
    }
    function leak(e) {
      e.gone = true; e.leaked = true; S.leaks++;
      var n = e.def.leak == null ? 1 : e.def.leak | 0; S.lives = Math.max(0, S.lives - n);
      S.fx.push({ k: 'leak', x: e.x, y: e.y, t: 0, dur: 700, n: n });
      emit({ kind: 'leak', unit: e.id, enemy: e.kind, lives: n, livesLeft: S.lives, wave: e.wave });
      if (S.lives <= 0) finish('lose');
    }

    /* ---------- waves ---------- */
    function waveTotal(w) { var n = 0; ((waves[w] || {}).groups || []).forEach(function (g) { n += g.count | 0; }); return n; }
    function canCallWave() { return S.phase !== 'won' && S.phase !== 'lost' && S.nextWave < waves.length && (S.phase === 'build' || S.countdown >= 0); }
    function callWave(early) {
      if (!canCallWave()) return false;
      var bonus = 0;
      if (S.phase !== 'build' && S.countdown > 0 && early) bonus = Math.floor(S.countdown / 1000 * P.earlyBonus);
      if (bonus > 0) { gold(bonus, 'early'); S.fx.push({ k: 'coin', x: map.x + 30, y: map.y + 20, amount: bonus, t: 0, dur: 900 }); }
      startWave(S.nextWave, bonus);
      return true;
    }
    function startWave(w, bonus) {
      var W = waves[w]; S.phase = 'running'; S.wave = w + 1; S.nextWave = w + 1; S.countdown = -1;
      S.waveTotal[w + 1] = waveTotal(w); S.waveSpawned[w + 1] = 0; S.waveLeft[w + 1] = S.waveLeft[w + 1] || 0;
      (W.groups || []).forEach(function (g, gi) {
        var path = g.path === 'alt' ? -1 : g.path | 0;
        S.spawners.push({ wave: w + 1, gi: gi, enemy: g.enemy, left: g.count | 0, gap: Math.max(0.05, num(g.gap, 1)) * 1000, t: -num(g.delay, 0) * 1000, path: path, k: 0 });
      });
      S.banners.push({ text: 'WAVE ' + (w + 1), sub: W.name || waveLine(w), t: 0, dur: 1600, kind: 'wave' });
      emit({ kind: 'waveStart', wave: w + 1, total: S.waveTotal[w + 1], bonus: bonus || 0 });
    }
    function waveLine(w) { var W = waves[w]; if (!W) return ''; return (W.groups || []).map(function (g) { return (g.count | 0) + ' ' + (enemyDef(g.enemy).name || g.enemy); }).join(', '); }
    function stepSpawners(dt) {
      for (var i = S.spawners.length - 1; i >= 0; i--) {
        var s = S.spawners[i]; s.t += dt;
        while (s.left > 0 && s.t >= 0) {
          var path = s.path < 0 ? s.k % map.paths.length : s.path;
          spawnEnemy(s.enemy, path, s.wave, 0, false); s.left--; s.k++; s.t -= s.gap;
        }
        if (s.left <= 0) S.spawners.splice(i, 1);
      }
      // a wave whose groups are all out starts the countdown to the next one
      var spawning = {}; S.spawners.forEach(function (s) { spawning[s.wave] = 1; });
      if (S.phase === 'running' && !spawning[S.wave] && S.countdown < 0 && S.nextWave < waves.length) { S.countdown = P.waveGap * 1000; emit({ kind: 'countdown', wave: S.nextWave + 1, ms: S.countdown }); }
      // cleared waves
      for (var w in S.waveLeft) {
        if (S.waveLeft[w] === 0 && !spawning[w] && !S['cleared' + w] && S.waveSpawned[w] >= (S.waveTotal[w] || 0)) {
          S['cleared' + w] = true; var rw = (waves[w - 1] || {}).reward | 0;
          if (rw) gold(rw, 'wave');
          S.banners.push({ text: 'WAVE ' + w + ' CLEARED', sub: rw ? '+' + rw + ' gold' : '', t: 0, dur: 1400, kind: 'clear' });
          emit({ kind: 'waveCleared', wave: +w, reward: rw });
        }
      }
      if (S.phase === 'running' && S.nextWave >= waves.length && !S.spawners.length && !S.enemies.some(function (e) { return !e.gone; })) finish('win');
    }
    function finish(res) {
      if (S.ended) return; S.ended = true; S.result = res; S.phase = res === 'win' ? 'won' : 'lost'; S.endT = 0;
      S.banners.push({ text: res === 'win' ? 'VICTORY' : 'THE GATE FALLS', sub: res === 'win' ? 'Every wave held back' : 'Too many slipped through', t: 0, dur: 1e9, kind: res });
      var info = { result: res, lives: S.lives, gold: S.gold, wave: S.wave, waves: waves.length, kills: S.kills, leaks: S.leaks, towers: S.towers.length, frame: S.frame };
      emit({ kind: 'end', result: res, info: info });
      safe(o.end, [res, info], 'onEnd');
    }

    /* ---------- shots ---------- */
    function fire(t, e) {
      var d = towerDef(t.type), L = lvl(t), dmg = L.damage;
      t.shots++; t.kick = 1; t.cd = 1000 / L.rate;
      emit({ kind: 'fire', tower: t.id, type: t.type, target: e.id, priority: t.priority, x: e.x, y: e.y, rem: remaining(e), hp: e.hp });
      var mx = t.x + Math.cos(t.aim) * 7, my = t.y - 11 + Math.sin(t.aim) * 4;
      if (d.kind === 'chain') {
        var hit = [e], pts = [{ x: t.x, y: t.y - 19 }, { x: e.x, y: e.y - e.hover - 4 }], cur = e, n = L.chain | 0, j = (L.jump || 1.4) * map.cell;
        for (var i = 0; i < n; i++) {
          var nx = null, nd = 1e9;
          for (var q = 0; q < S.enemies.length; q++) { var c = S.enemies[q]; if (hit.indexOf(c) >= 0 || !canHit(t, c)) continue; var dd = dist(cur.x, cur.y, c.x, c.y); if (dd <= j && (dd < nd - 1e-6 || (Math.abs(dd - nd) <= 1e-6 && c.n < nx.n))) { nd = dd; nx = c; } }
          if (!nx) break; hit.push(nx); pts.push({ x: nx.x, y: nx.y - nx.hover - 4 }); cur = nx;
        }
        S.fx.push({ k: 'zap', pts: pts, t: 0, dur: 220, seed: S.frame + t.shots });
        hit.forEach(function (h, i2) { damage(h, dmg * Math.pow(L.falloff || 0.75, i2), t, L.type, L.pierce, { chain: i2 }); S.fx.push({ k: 'spark', x: h.x, y: h.y - h.hover - 4, t: 0, dur: 260, col: '#d8ccff' }); });
        return;
      }
      if (d.kind === 'splash') {
        // aim where the foe will be when the shell lands (same rule as its movement, no randomness)
        var fd = dist(t.x, t.y, e.x, e.y), dur = Math.max(380, fd / (L.speed || 240) * 1000), sp = (e.def.speed || 1) * map.cell * (1 - (e.slowT > 0 ? e.slowK : 0));
        var ahead = pathAt(map.paths[e.path], e.dist + sp * dur / 1000), nx2 = -Math.sin(ahead.ang), ny2 = Math.cos(ahead.ang);
        S.shots.push({ k: 'shell', tower: t.id, t: 0, dur: dur, x0: mx, y0: my, x1: ahead.x + nx2 * e.lane, y1: ahead.y + ny2 * e.lane, h: 34 + fd * 0.25, dmg: dmg, splash: L.splash * map.cell, type: L.type, pierce: L.pierce, x: mx, y: my });
        S.fx.push({ k: 'muzzle', x: mx, y: my - 4, t: 0, dur: 260, col: '#ffb070' });
        return;
      }
      S.shots.push({ k: d.kind === 'slow' ? 'shard' : 'bolt', tower: t.id, target: e.id, x: mx, y: my, tx: e.x, ty: e.y - e.hover - 4, sp: L.speed || 500, dmg: dmg, type: L.type, pierce: L.pierce, slow: L.slow, slowMs: L.slowMs, ang: t.aim, t: 0, trail: [] });
    }
    function stepShots(dt) {
      for (var i = S.shots.length - 1; i >= 0; i--) {
        var s = S.shots[i]; s.t += dt;
        var t = byTower(s.tower);
        if (s.k === 'shell') {
          var u = Math.min(1, s.t / s.dur); s.x = lerp(s.x0, s.x1, u); s.y = lerp(s.y0, s.y1, u); s.z = s.h * 4 * u * (1 - u);
          if (u >= 1) {
            S.shots.splice(i, 1);
            S.fx.push({ k: 'boom', x: s.x1, y: s.y1, r: s.splash, t: 0, dur: 560, seed: S.frame });
            S.decals.push({ k: 'scorch', x: s.x1, y: s.y1, r: s.splash * 0.55, t: 0, seed: S.frame }); if (S.decals.length > 60) S.decals.shift();
            var list = S.enemies.slice();
            for (var q = 0; q < list.length; q++) { var e = list[q]; if (e.hp <= 0 || e.gone || e.def.flying || e.dist <= 0) continue; var dd = dist(s.x1, s.y1, e.x, e.y); if (dd > s.splash) continue; damage(e, s.dmg * (1 - 0.5 * dd / s.splash), t || null, s.type, s.pierce, { splash: true }); }
          }
          continue;
        }
        var e2 = byEnemy(s.target);
        if (e2 && e2.hp > 0 && !e2.gone) { s.tx = e2.x; s.ty = e2.y - e2.hover - 4; }
        var dx = s.tx - s.x, dy = s.ty - s.y, L = Math.sqrt(dx * dx + dy * dy), mv = s.sp * dt / 1000;
        s.trail.push({ x: s.x, y: s.y }); if (s.trail.length > 5) s.trail.shift();
        if (L <= mv + 2) {
          S.shots.splice(i, 1);
          if (e2 && e2.hp > 0 && !e2.gone) {
            if (s.k === 'shard') { e2.slowK = Math.max(e2.slowT > 0 ? e2.slowK : 0, s.slow || 0.4); e2.slowT = Math.max(e2.slowT, s.slowMs || 1500); S.fx.push({ k: 'frost', x: s.tx, y: s.ty, t: 0, dur: 420, seed: S.frame }); }
            else S.fx.push({ k: 'spark', x: s.tx, y: s.ty, t: 0, dur: 220, col: '#fff2c0' });
            damage(e2, s.dmg, t || null, s.type, s.pierce, null);
          } else S.fx.push({ k: 'spark', x: s.tx, y: s.ty, t: 0, dur: 180, col: '#c8c0b0' });
          continue;
        }
        s.ang = Math.atan2(dy, dx); s.x += dx / L * mv; s.y += dy / L * mv;
      }
    }
    function stepTowers(dt) {
      for (var i = 0; i < S.towers.length; i++) {
        var t = S.towers[i], e = pickTarget(t);
        t.target = e ? e.id : null;
        if (t.kick > 0) t.kick = Math.max(0, t.kick - dt / 160);
        if (e) { var want = Math.atan2(e.y - e.hover - t.y + 14, e.x - t.x), da = Math.atan2(Math.sin(want - t.aim), Math.cos(want - t.aim)); t.aim += da * Math.min(1, dt / 70); }
        if (t.cd > 0) t.cd -= dt;
        if (t.cd <= 0) { t.cd = 0; if (e) fire(t, e); }
      }
    }
    function stepFx(dt) {
      var i;
      for (i = S.fx.length - 1; i >= 0; i--) { S.fx[i].t += dt; if (S.fx[i].t >= S.fx[i].dur) S.fx.splice(i, 1); }
      for (i = 0; i < S.decals.length; i++) S.decals[i].t += dt;
      for (i = S.banners.length - 1; i >= 0; i--) { S.banners[i].t += dt; if (S.banners[i].t >= S.banners[i].dur) S.banners.splice(i, 1); }
    }

    /* ---------- one fixed step ---------- */
    function step(dt) {
      S.frame++; S.time += dt;
      if (S.ended) { S.endT += dt; stepFx(dt); for (var j = 0; j < S.enemies.length; j++) if (S.enemies[j].dying) moveEnemy(S.enemies[j], dt); return; }
      if (S.countdown > 0) { S.countdown -= dt; if (S.countdown <= 0) { S.countdown = 0; if (S.phase === 'build') callWave(false); else startWave(S.nextWave, 0); } }
      stepSpawners(dt);
      for (var i = 0; i < S.enemies.length; i++) moveEnemy(S.enemies[i], dt);
      stepTowers(dt);
      stepShots(dt);
      for (i = S.enemies.length - 1; i >= 0; i--) if (S.enemies[i].gone) { var e = S.enemies[i]; S.waveLeft[e.wave] = (S.waveLeft[e.wave] || 1) - 1; S.enemies.splice(i, 1); }
      stepFx(dt);
    }

    return { S: S, P: P, map: map, waves: waves, LIB: LIB, rng: R, step: step, build: build, upgrade: upgrade, upgradeCost: upgradeCost, sell: sell, refundOf: refundOf,
      setPriority: setPriority, blockedWhy: blockedWhy, cellAt: cellAt, cellCentre: cellCentre, towerAt: towerAt, isRoad: isRoad, callWave: callWave, canCallWave: canCallWave,
      pickTarget: pickTarget, better: better, canHit: canHit, inRange: inRange, remaining: remaining, lvl: lvl, towerDef: towerDef, enemyDef: enemyDef,
      byTower: byTower, byEnemy: byEnemy, waveLine: waveLine, waveTotal: waveTotal, finish: finish };
  }
