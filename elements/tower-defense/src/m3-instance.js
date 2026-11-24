
  /* =================================================================================================
     The instance: view mapping, input, the side panel and HUD, the bot, the public API.
     ================================================================================================= */
  var PANEL = { x: 528, y: 36, w: 104, h: 320 };
  var WHY = { road: 'Keep the road clear', water: 'Cannot build on water', blocked: 'Something is in the way', occupied: 'A tower stands here', gold: 'Not enough gold', outside: 'Outside the field', unknown: 'Unknown tower' };

  function create(opt) {
    opt = opt || {};
    var view = opt.view || { x: 0, y: 0, w: SW, h: SH };
    var towers = {}, enemies = {}, k;
    for (k in TOWERS) towers[k] = TOWERS[k]; for (k in (opt.towers || {})) towers[k] = opt.towers[k];
    for (k in ENEMIES) enemies[k] = ENEMIES[k]; for (k in (opt.enemies || {})) enemies[k] = opt.enemies[k];
    var lib = { towers: towers, enemies: enemies };
    var SK = null; try { SK = root.GameDNA_Skin && opt.skin != null && opt.skin !== false ? root.GameDNA_Skin.resolve(opt.skin) : null; } catch (e) { SK = null; }
    var sim = null, S = null, map = null, cache = null, cacheKey = '', acc = 0, uiT = 0, paused = false, auto = false, params = {};
    var U = { mode: 'idle', type: null, sel: null, cx: 2, cy: 4, keyCursor: false, hover: null, msg: null, drag: null, press: null, lastRects: [], lastUI: [] };
    var shop = [], bot = { wait: 0, plan: 0, log: [] };
    var api = {};
    for (k in DEFAULTS) params[k] = DEFAULTS[k]; for (k in (opt.params || {})) if (opt.params[k] != null) params[k] = opt.params[k];

    function kf() { var v = typeof view === 'function' ? safe(view, [], 'view') || { x: 0, y: 0, w: SW, h: SH } : view; return v; }
    // the part of the 640x360 stage shown in view: all of it, or (layout 'compact', for phones) only the field, with the
    // HUD and build panel left to the host (panelState() / mountPanel())
    function crop() { return params.layout === 'compact' ? { x: MAPX - 4, y: MAPY - 4, w: 16 * CELL + 8, h: 10 * CELL + 8 } : { x: 0, y: 0, w: SW, h: SH }; }
    function scl() { var v = kf(), C = crop(); return Math.min(v.w / C.w, v.h / C.h); }
    function sc() { return scl(); }
    function toStage(x, y) { var v = kf(), s = scl(), C = crop(); return { x: (x - v.x) / s + C.x, y: (y - v.y) / s + C.y }; }
    function toHost(r) { var v = kf(), s = scl(), C = crop(); return { x: v.x + (r.x - C.x) * s, y: v.y + (r.y - C.y) * s, w: r.w * s, h: r.h * s }; }
    function enter(g) { var v = kf(), s = scl(), C = crop(); g.translate(v.x, v.y); g.scale(s, s); g.translate(-C.x, -C.y); }

    function start(o2) {
      o2 = o2 || {};
      var mspec = o2.map || opt.map || MAPS.millbrook; if (typeof mspec === 'string') mspec = MAPS[mspec] || MAPS.millbrook;
      var p2 = {}; for (var q in params) p2[q] = params[q]; for (q in (o2.params || {})) p2[q] = o2.params[q];
      sim = makeSim({ map: mspec, waves: o2.waves || opt.waves || WAVES, towers: lib.towers, enemies: lib.enemies, seed: o2.seed != null ? o2.seed : (opt.seed || 1), params: p2,
        emit: onEvent, hit: function (ev) { safe(opt.onHit, [ev], 'onHit'); }, end: function (res, info) { U.mode = 'idle'; U.sel = null; safe(opt.onEnd, [res, info], 'onEnd'); } });
      S = sim.S; map = sim.map; cache = null; acc = 0;
      shop = (o2.shop || opt.shop || Object.keys(lib.towers)).filter(function (id) { return lib.towers[id]; });
      U.mode = 'idle'; U.type = null; U.sel = null; U.msg = null; U.drag = null; U.cx = 2; U.cy = 4;
      bot = { wait: 60, plan: 0, log: [], cover: null };
      return api;
    }
    function onEvent(ev) {
      if (ev.kind === 'sell' && U.sel === ev.tower) { U.sel = null; U.mode = 'idle'; }
      safe(opt.onEvent, [ev], 'onEvent');
    }

    /* ---------- update ---------- */
    function update(dt) {
      dt = +dt || 0; if (!sim) return;
      if (dt > 0) uiT += dt;
      if (U.msg) { U.msg.t += dt; if (U.msg.t > 1400) U.msg = null; }
      if (dt <= 0 || paused) return;
      acc += dt * (params.speed >= 2 ? 2 : 1);
      var n = 0;
      while (acc >= STEP - 1e-6 && n < 8) { acc -= STEP; n++; if (auto && !S.ended) botStep(); sim.step(STEP); }
    }

    /* ---------- commands (keys, pointer and the bot all come through here) ---------- */
    function say(text2) { U.msg = { text: text2, t: 0 }; }
    function choose(id) {
      if (!sim || S.ended) return false;
      if (!lib.towers[id]) return false;
      if (U.mode === 'place' && U.type === id) { U.mode = 'idle'; U.type = null; return true; }
      U.mode = 'place'; U.type = id; U.sel = null;
      var c = lib.towers[id].levels[0].cost; if (S.gold < c) say('Not enough gold (' + c + ')');
      return true;
    }
    function tryBuild(c, r) {
      if (!sim || S.ended || U.mode !== 'place') return false;
      var res = sim.build(U.type, c, r);
      if (!res.ok) { say(WHY[res.why] || 'Cannot build here'); return false; }
      U.mode = 'select'; U.sel = res.tower.id; U.type = null;
      return true;
    }
    function selectAt(c, r) {
      var t = sim.towerAt(c, r);
      if (t) { U.mode = 'select'; U.sel = t.id; return true; }
      U.mode = 'idle'; U.sel = null; return false;
    }
    function upgradeSel() { if (!U.sel) return false; var r = sim.upgrade(U.sel); if (!r.ok) say(r.why === 'max' ? 'Already at the top level' : r.why === 'gold' ? 'Not enough gold (' + sim.upgradeCost(sim.byTower(U.sel)) + ')' : 'No tower'); return r.ok; }
    function sellSel() { if (!U.sel) return false; var r = sim.sell(U.sel); if (r.ok) { U.sel = null; U.mode = 'idle'; } return r.ok; }
    function cycleTarget(p) { var t = U.sel && sim.byTower(U.sel); if (!t) return false; var i = PRIORITIES.indexOf(t.priority); return sim.setPriority(t.id, p || PRIORITIES[(i + 1) % PRIORITIES.length]); }
    function callWave() { if (!sim) return false; var ok = sim.callWave(true); if (!ok && !S.ended) say(S.nextWave >= S.waveCount ? 'That was the last wave' : 'Wait for this wave to finish arriving'); return ok; }
    function setSpeed(v) { params.speed = v >= 2 ? 2 : 1; if (sim) sim.P.speed = params.speed; safe(opt.onEvent, [{ kind: 'speed', speed: params.speed, frame: S ? S.frame : 0 }], 'onEvent'); }
    function key(k2) {
      if (!sim) return false;
      if (k2 === 'speed') { setSpeed(params.speed >= 2 ? 1 : 2); return true; }
      if (k2 === 'pause') { paused = !paused; return true; }
      if (S.ended) return false;
      if (typeof k2 === 'string' && /^[1-9]$/.test(k2)) { var id = shop[+k2 - 1]; return id ? choose(id) : false; }
      if (typeof k2 === 'string' && k2.indexOf('tower:') === 0) return choose(k2.slice(6));
      var mv = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[k2];
      if (mv) { U.keyCursor = true; U.hover = null; U.cx = clamp(U.cx + mv[0], 0, map.cols - 1); U.cy = clamp(U.cy + mv[1], 0, map.rows - 1); return true; }
      if (k2 === 'ok') {
        if (U.mode === 'place') return tryBuild(U.cx, U.cy);
        var t = sim.towerAt(U.cx, U.cy);
        if (U.mode === 'select' && t && t.id === U.sel) return upgradeSel();
        return selectAt(U.cx, U.cy);
      }
      if (k2 === 'back') { if (U.mode !== 'idle') { U.mode = 'idle'; U.type = null; U.sel = null; return true; } return false; }
      if (k2 === 'upgrade') return upgradeSel();
      if (k2 === 'sell') return sellSel();
      if (k2 === 'target') return cycleTarget();
      if (typeof k2 === 'string' && k2.indexOf('target:') === 0) return cycleTarget(k2.slice(7));
      if (k2 === 'wave') return callWave();
      return false;
    }
    function hitButton(x, y) { var L = layout(); for (var i = L.length - 1; i >= 0; i--) { var b = L[i]; if (b.act && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b; } return null; }
    function onMap(p) { return p.x >= map.x && p.y >= map.y && p.x < map.x + map.w && p.y < map.y + map.h; }
    function pointer(type, x, y) {
      if (!sim) return false;
      var p = toStage(x, y), b;
      if (type === 'move') {
        U.hover = p; if (onMap(p)) { var ce = sim.cellAt(p.x, p.y); U.cx = ce.c; U.cy = ce.r; U.keyCursor = false; }
        if (U.press && dist(U.press.x, U.press.y, p.x, p.y) > 6) U.press.moved = true;
        return false;
      }
      if (type === 'down') {
        U.hover = p; U.keyCursor = false;
        b = hitButton(p.x, p.y);
        if (b) { U.press = { x: p.x, y: p.y, act: b.act, moved: false }; return runButton(b.act); }
        U.press = null;
        if (S.ended) return false;
        if (onMap(p)) {
          var c = sim.cellAt(p.x, p.y); U.cx = c.c; U.cy = c.r;
          if (U.mode === 'place') return tryBuild(c.c, c.r);
          return selectAt(c.c, c.r);
        }
        return false;
      }
      if (type === 'up' || type === 'cancel') {
        var pr = U.press; U.press = null;
        // drag a shop card onto the map: build where it is let go
        if (type === 'up' && pr && pr.moved && pr.act && pr.act.indexOf('tower:') === 0 && U.mode === 'place' && onMap(p)) { var c2 = sim.cellAt(p.x, p.y); U.cx = c2.c; U.cy = c2.r; return tryBuild(c2.c, c2.r); }
        return false;
      }
      return false;
    }
    function runButton(act) {
      if (act === 'speed') { setSpeed(params.speed >= 2 ? 1 : 2); return true; }
      if (act === 'pause') { paused = !paused; return true; }
      if (S.ended) return false;
      if (act.indexOf('tower:') === 0) { var id = act.slice(6); if (!(U.mode === 'place' && U.type === id)) return choose(id); return true; }
      if (act === 'upgrade') return upgradeSel();
      if (act === 'sell') return sellSel();
      if (act.indexOf('target:') === 0) return cycleTarget(act.slice(7));
      if (act === 'wave') return callWave();
      return false;
    }

    /* ---------- the bot: picks a plan step, then performs it through key() and pointer() ---------- */
    var PLAN = ['bolt', 'bolt', 'mortar', 'frost', 'up', 'storm', 'up', 'bolt', 'up', 'mortar', 'up', 'storm', 'up', 'frost', 'up', 'bolt', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'up'];
    function coverage(c, r, rangeCells, early) {
      if (!bot.cover) bot.cover = {};
      var key2 = c + ',' + r + ',' + rangeCells + ',' + (early ? 1 : 0); if (bot.cover[key2] != null) return bot.cover[key2];
      var p = sim.cellCentre(c, r), R2 = rangeCells * map.cell, n = 0;
      map.paths.forEach(function (P2) { for (var i = 0; i < P2.pts.length; i += 3) { var q = P2.pts[i]; if (q.x < map.x || q.x > map.x + map.w) continue; if (dist(p.x, p.y, q.x, q.y) <= R2) n += early ? (1.5 - i / P2.pts.length) : 1; } });
      return (bot.cover[key2] = n);
    }
    function bestCell(type) {
      var d = lib.towers[type], L0 = d.levels[0], best = null, bs = -1;
      for (var r = 0; r < map.rows; r++) for (var c = 0; c < map.cols; c++) {
        if (sim.blockedWhy(c, r, null)) continue;
        var s2 = coverage(c, r, L0.range, d.kind === 'slow');
        if (d.kind === 'single' || d.kind === 'chain') s2 += 0.01 * (map.cols - Math.abs(c - map.cols / 2));
        if (s2 > bs + 1e-9) { bs = s2; best = { c: c, r: r }; }
      }
      return best;
    }
    function upgradeTarget() {
      var best = null, bs = -1;
      S.towers.forEach(function (t) { var cost = sim.upgradeCost(t); if (cost == null) return; var s2 = coverage(t.c, t.r, sim.lvl(t).range, false) * (lib.towers[t.type].kind === 'splash' ? 1.3 : 1) / (1 + t.lvl * 0.6); if (s2 > bs) { bs = s2; best = t; } });
      return best;
    }
    function botStep() {
      if (bot.wait > 0) { bot.wait--; return; }
      if (bot.job) {   // a job is a list of input steps, one every few frames
        var j = bot.job.shift();
        if (j) { if (j.ptr) pointer(j.ptr, j.x, j.y); else key(j.key); bot.wait = j.wait == null ? 8 : j.wait; return; }
        bot.job = null;
      }
      var alive = S.enemies.filter(function (e) { return !e.gone && !e.dying; }).length;
      // boss on the field: point the single-shot towers at the strongest foe
      var boss = S.enemies.some(function (e) { return e.def.boss && !e.dying; });
      var want = boss ? 'strong' : null;
      for (var i = 0; i < S.towers.length; i++) {
        var t = S.towers[i], d = lib.towers[t.type], wp = want && d.kind === 'single' ? 'strong' : d.kind === 'splash' ? 'strong' : (PRIORITIES.indexOf(params.priority) >= 0 ? params.priority : d.priority || 'first');
        if (t.priority !== wp) { bot.job = selectJob(t).concat([{ key: 'target', wait: 6 }]); var n = PRIORITIES.indexOf(wp) - PRIORITIES.indexOf(t.priority); n = (n + 3) % 3; for (var z = 1; z < n; z++) bot.job.push({ key: 'target', wait: 6 }); bot.job.push({ key: 'back', wait: 10 }); return; }
      }
      var step2 = bot.plan < PLAN.length ? PLAN[bot.plan] : (bot.plan % 3 === 2 ? shop[Math.floor(bot.plan / 3) % shop.length] : 'up');
      // a tower type the plan does not know (a host's own) gets one copy as soon as six towers stand
      bot.extra = false;
      if (S.towers.length >= 6) for (var si = 0; si < shop.length; si++) { var sid = shop[si]; if (PLAN.indexOf(sid) < 0 && !S.towers.some(function (q) { return q.type === sid; })) { step2 = sid; bot.extra = true; break; } }
      if (step2 === 'up') {
        var ut = upgradeTarget();
        if (!ut) { bot.plan++; return; }
        else if (S.gold >= sim.upgradeCost(ut)) { bot.job = selectJob(ut).concat([{ key: 'upgrade', wait: 12 }, { key: 'back', wait: 10 }]); bot.plan++; return; }
      } else {
        var dd = lib.towers[step2] || lib.towers[shop[0]];
        if (dd && S.gold >= dd.levels[0].cost) {
          var cell = bestCell(lib.towers[step2] ? step2 : shop[0]);
          if (cell) { var p = sim.cellCentre(cell.c, cell.r), hp = toHost({ x: p.x, y: p.y, w: 0, h: 0 }), n2 = shop.indexOf(step2) + 1;
            bot.job = [{ key: n2 > 0 && n2 < 10 ? String(n2) : 'tower:' + step2, wait: 10 }, { ptr: 'move', x: hp.x, y: hp.y, wait: 14 }, { ptr: 'down', x: hp.x, y: hp.y, wait: 2 }, { ptr: 'up', x: hp.x, y: hp.y, wait: 10 }, { key: 'back', wait: 12 }];
            if (!bot.extra) bot.plan++; bot.extra = false; return; }
          if (!bot.extra) bot.plan++; bot.extra = false;
        }
      }
      // send the next wave: at the start once something stands, early when the field is nearly clear
      var nextCost = step2 === 'up' ? (upgradeTarget() ? sim.upgradeCost(upgradeTarget()) : 1e9) : ((lib.towers[step2] || {}).levels || [{ cost: 0 }])[0].cost;
      if (sim.canCallWave() && ((S.phase === 'build' && (S.towers.length >= 2 || S.gold < nextCost)) || (S.phase !== 'build' && alive <= 2 && S.countdown > 0 && S.countdown < params.waveGap * 1000 - 1500))) { bot.job = [{ key: 'wave', wait: 30 }]; return; }
      bot.wait = 6;
    }
    function selectJob(t) { var hp = toHost({ x: t.x, y: t.y, w: 0, h: 0 }); return [{ key: 'back', wait: 4 }, { ptr: 'move', x: hp.x, y: hp.y, wait: 10 }, { ptr: 'down', x: hp.x, y: hp.y, wait: 2 }, { ptr: 'up', x: hp.x, y: hp.y, wait: 10 }]; }

    /* ---------- layout of the HUD and panel (stage px); the same rects draw and take taps ---------- */
    function layout() {
      var L = [];
      if (!sim || params.layout === 'compact') return L;
      L.push({ name: 'stats', x: 8, y: 4, w: 168, h: 26 });
      L.push({ name: 'wave', x: 184, y: 4, w: 200, h: 26 });
      L.push({ name: 'speed', act: 'speed', x: 528, y: 4, w: 50, h: 26 });
      L.push({ name: 'pause', act: 'pause', x: 582, y: 4, w: 50, h: 26 });
      L.push({ name: 'panel', x: PANEL.x, y: PANEL.y, w: PANEL.w, h: PANEL.h });
      var n = shop.length, rows = Math.max(1, Math.ceil(n / 2)), ch = Math.min(54, (118 - (rows - 1) * 4) / rows);
      shop.forEach(function (id, i) { L.push({ name: 'card', id: id, act: 'tower:' + id, x: PANEL.x + 2 + (i % 2) * 52, y: PANEL.y + 22 + Math.floor(i / 2) * (ch + 4), w: 48, h: ch }); });
      var t = U.sel && sim.byTower(U.sel);
      if (t && U.mode === 'select') {
        var by0 = infoRows(t.type, t, true).bottom + 4;    // the buttons start under the last stat row, whatever the row count
        L.push({ name: 'upgrade', act: 'upgrade', x: PANEL.x + 4, y: by0, w: 47, h: 21 });
        L.push({ name: 'sell', act: 'sell', x: PANEL.x + 53, y: by0, w: 47, h: 21 });
        PRIORITIES.forEach(function (p, i) { L.push({ name: 'target', id: p, act: 'target:' + p, x: PANEL.x + 4 + i * 32.5, y: by0 + 24, w: 31, h: 16 }); });
      }
      L.push({ name: 'next', x: PANEL.x + 4, y: PANEL.y + 244, w: PANEL.w - 8, h: 72 });
      if (sim.canCallWave()) L.push({ name: 'call', act: 'wave', x: PANEL.x + 8, y: PANEL.y + 294, w: PANEL.w - 16, h: 18 });
      return L;
    }

    /* ---------- drawing ---------- */
    function devScale(g) { var m = g.getTransform ? g.getTransform() : { a: 1 }; return Math.abs(m.a) || 1; }
    function now() { return S ? S.time / 1000 : 0; }
    function sortedItems() {
      var items = [], r, c, t = now();
      for (r = 0; r < map.rows; r++) for (c = 0; c < map.cols; c++) {
        var ch = map.grid[r][c]; if (map.road[c + ',' + r]) continue;
        if (ch === 'T' || ch === 'r' || ch === 'b') (function (ch2, cc, rr3) { var p = sim.cellCentre(cc, rr3), j = (hash(cc, rr3, 11) - 0.5) * 6, s3 = 0.9 + hash(cc, rr3, 12) * 0.25;
          items.push({ y: p.y + 8, d: function (g) { propSprite(g, ch2 + cc + ',' + rr3, p.x + j, p.y + 9, function (q, X, Y) { if (ch2 === 'T') drawTree(q, X, Y, s3, cc * 31 + rr3, 0); else if (ch2 === 'r') drawRock(q, X, Y - 1, s3, cc + rr3); else drawBush(q, X, Y - 1, s3, cc * 7 + rr3); }); } }); })(ch, c, r);
      }
      S.towers.forEach(function (tw) { var d = lib.towers[tw.type]; items.push({ y: tw.y + 6, d: function (g) { drawTower(g, { x: tw.x, y: tw.y, lvl: tw.lvl, look: d.look || tw.type, aim: tw.aim, kick: tw.kick, color: d.color }, t, { custom: d.draw }); } }); });
      S.enemies.forEach(function (e) { if (!e.def.flying && !e.def.boss) items.push({ y: e.y, d: function (g) { drawEnemy(g, e, t); } }); });
      var seenEnd = {};
      map.paths.forEach(function (P2) { var a = P2.pts[0], b = P2.pts[P2.pts.length - 1], b2 = P2.pts[P2.pts.length - 4] || a, ek = Math.round(b.x) + ',' + Math.round(b.y), dupe = seenEnd[ek]; seenEnd[ek] = 1;
        items.push({ y: a.y - 20, d: function (g) { drawEntry(g, Math.max(map.x + 12, a.x + 12), a.y, 0, t); } });
        if (!dupe) items.push({ y: b.y + 12, d: function (g) { var hurt = 0; S.fx.forEach(function (f) { if (f.k === 'leak') hurt = Math.max(hurt, 1 - f.t / f.dur); }); drawGate(g, Math.min(map.x + map.w - 18, b.x - 12), b.y - 2, Math.atan2(b.y - b2.y, b.x - b2.x), t, hurt); } }); });
      items.sort(function (p, q) { return p.y - q.y; });
      return items;
    }
    function drawScene(g) {
      if (!sim) return;
      try {
        var t = now();
        g.save(); enter(g);
        var ds = Math.min(4, devScale(g)), key2 = map.name + '|' + ds.toFixed(3);
        if (!cache || cacheKey !== key2) { cache = drawGround(map, ds, map.theme); cacheKey = key2; }
        // frame around the field
        g.fillStyle = '#1c1612'; rr(g, map.x - 4, map.y - 4, map.w + 8, map.h + 8, 7); g.fill();
        g.save(); rr(g, map.x, map.y, map.w, map.h, 4); g.clip();
        if (cache) g.drawImage(cache, map.x, map.y, map.w, map.h); else { g.fillStyle = '#3d7432'; g.fillRect(map.x, map.y, map.w, map.h); }
        S.decals.forEach(function (d) { drawDecal(g, d); });
        drawUnder(g, t);
        sortedItems().forEach(function (it) { it.d(g); });
        S.towers.forEach(function (tw) { drawStars(g, tw); });
        // a boss walks above the tower art, flyers above everything on the ground
        S.enemies.forEach(function (e) { if (e.def.boss && !e.def.flying) drawEnemy(g, e, t); });
        S.enemies.forEach(function (e) { if (e.def.flying) drawEnemy(g, e, t); });
        S.shots.forEach(function (sh) { drawShot(g, sh, t); });
        S.fx.forEach(function (f) { if (f.k !== 'coin') drawFx(g, f, t); });
        hpBars(g);
        S.fx.forEach(function (f) { if (f.k === 'coin') drawFx(g, f, t); });
        drawOver(g, t);
        g.restore();
        g.strokeStyle = '#6a5038'; g.lineWidth = 1.5; rr(g, map.x - 1.5, map.y - 1.5, map.w + 3, map.h + 3, 5); g.stroke();
        g.strokeStyle = 'rgba(255,230,180,0.18)'; g.lineWidth = 1; rr(g, map.x - 3.5, map.y - 3.5, map.w + 7, map.h + 7, 7); g.stroke();
        g.restore();
      } catch (e) { warn('drawScene', e); }
    }
    // standing props are painted once per device scale into a small canvas (64 x 64 stage px around the base point)
    var props = {}, propScale = 0;
    function propSprite(g, key2, x, y, paint) {
      var ds = Math.min(4, devScale(g)); if (Math.abs(ds - propScale) > 1e-3) { props = {}; propScale = ds; }
      var P2 = props[key2];
      if (P2 === undefined) { var c = mk(64 * ds, 64 * ds); if (c) { var q = c.getContext('2d'); q.scale(ds, ds); paint(q, 32, 48); } P2 = props[key2] = c; }
      if (P2) g.drawImage(P2, x - 32, y - 48, 64, 64); else paint(g, x, y);
    }
    // HP bars only once hurt, never on top of each other (a later bar moves up past the ones already placed); a boss gets
    // a named bar at the top of the field instead
    function hpBars(g) {
      var placed = [], list = S.enemies.filter(function (e) { return !e.dying && e.hp < e.maxHp && e.dist > 0 && !e.def.boss; }).sort(function (a, b) { return b.y - a.y || a.n - b.n; });
      list.forEach(function (e) {
        var w = 18, x = e.x - w / 2, y = e.y - e.hover - (e.def.size || 8) - 9;
        for (var k3 = 0; k3 < 6; k3++) { var hit = false; for (var i = 0; i < placed.length; i++) { var q = placed[i]; if (x < q.x + q.w + 1 && q.x < x + w + 1 && y < q.y + 5 && q.y < y + 5) { hit = true; y = q.y - 6; } } if (!hit) break; }
        placed.push({ x: x, y: y, w: w }); hpBar(g, e, x, y, w);
      });
      S.enemies.forEach(function (e) { if (e.def.boss && !e.dying && e.dist > 0) bossBar(g, e); });
    }
    function bossBar(g, e) {
      var w = 220, x = map.x + map.w / 2 - w / 2, y = map.y + 10, f = e.hp / e.maxHp;
      g.fillStyle = 'rgba(14,8,12,0.85)'; rr(g, x - 6, y - 4, w + 12, 24, 8); g.fill(); g.strokeStyle = 'rgba(224,120,176,0.9)'; g.lineWidth = 1.2; g.stroke();
      text(g, (e.def.name || 'Boss').toUpperCase(), x + w / 2, y + 3.5, { size: 8.5, weight: 900, align: 'center', color: '#ffd8ec', ls: 1.5 });
      g.fillStyle = 'rgba(0,0,0,0.6)'; rr(g, x, y + 9, w, 7, 3.5); g.fill();
      var gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#ff5a8a'); gr.addColorStop(1, '#c02a6a'); g.fillStyle = gr; rr(g, x + 1, y + 10, Math.max(2, (w - 2) * f), 5, 2.5); g.fill();
      // a ring under the boss itself so it is found at a glance
      g.strokeStyle = 'rgba(255,120,180,0.7)'; g.lineWidth = 1.4; ell(g, e.x, e.y + 2, (e.def.size || 20) * 1.3, (e.def.size || 20) * 0.75); g.stroke();
    }
    function hpBar(g, e, x, y, w) {
      var f = e.hp / e.maxHp;
      g.fillStyle = 'rgba(10,8,8,0.8)'; rr(g, x - 1, y - 1, w + 2, 5, 2); g.fill();
      g.fillStyle = f > 0.5 ? '#6ad04a' : f > 0.25 ? '#f0c040' : '#f0503a'; rr(g, x, y, Math.max(1, w * f), 3, 1.5); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 1, y, Math.max(0, w * f - 2), 1);
      if (e.slowT > 0) { g.fillStyle = 'rgba(20,50,80,0.85)'; ell(g, x + w + 4.5, y + 1.5, 3.8, 3.8); g.fill(); flake(g, x + w + 4.5, y + 1.5, 2.6); }
    }
    function cellRect(c, r) { return { x: map.x + c * map.cell, y: map.y + r * map.cell, w: map.cell, h: map.cell }; }
    // under the units: the build grid, a red cell for a blocked spot, the selected tower's ring
    function drawUnder(g, t) {
      var placing = U.mode === 'place' && U.type;
      if (placing || params.grid === 'on') {
        g.save(); g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 0.8;
        for (var r = 0; r < map.rows; r++) for (var c = 0; c < map.cols; c++) { if (sim.blockedWhy(c, r, null)) continue; var R2 = cellRect(c, r); rr(g, R2.x + 2, R2.y + 2, R2.w - 4, R2.h - 4, 4); g.stroke(); }
        g.restore();
      }
    }
    function ring(g, x, y, rad, col, t) {
      g.save();
      g.fillStyle = rgba(col, 0.13); ell(g, x, y, rad, rad); g.fill();
      g.strokeStyle = rgba(col, 0.85); g.lineWidth = 1.4; g.setLineDash([5, 4]); g.lineDashOffset = -t * 12; ell(g, x, y, rad, rad); g.stroke(); g.setLineDash([]);
      g.restore();
    }
    function drawOver(g, t) {
      if (S.ended) return;
      var placing = U.mode === 'place' && U.type, cur = { c: U.cx, r: U.cy };
      if (U.mode === 'select' && U.sel) {
        var tw = sim.byTower(U.sel);
        if (tw) { if (params.ring !== 'off') ring(g, tw.x, tw.y, sim.lvl(tw).range * map.cell, '#ffe8a0', t); brackets(g, cellRect(tw.c, tw.r), '#ffe27a', t); }
      }
      var showCur = placing || U.keyCursor || (U.hover && onMap(U.hover));
      if (!showCur) return;
      var R2 = cellRect(cur.c, cur.r);
      if (placing) {
        var why = sim.blockedWhy(cur.c, cur.r, U.type), d = lib.towers[U.type], p = sim.cellCentre(cur.c, cur.r);
        if (why && why !== 'gold') {
          g.fillStyle = 'rgba(230,50,40,0.32)'; rr(g, R2.x + 1, R2.y + 1, R2.w - 2, R2.h - 2, 4); g.fill();
          g.strokeStyle = '#ff5a4a'; g.lineWidth = 1.6; rr(g, R2.x + 1, R2.y + 1, R2.w - 2, R2.h - 2, 4); g.stroke();
          g.strokeStyle = '#ffd0c8'; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x - 6, p.y - 6); g.lineTo(p.x + 6, p.y + 6); g.moveTo(p.x + 6, p.y - 6); g.lineTo(p.x - 6, p.y + 6); g.stroke();
        } else {
          var col = why === 'gold' ? '#ffb04a' : '#8af07a';
          if (params.ring !== 'off') ring(g, p.x, p.y, d.levels[0].range * map.cell, col, t);
          g.fillStyle = rgba(col, 0.22); rr(g, R2.x + 1, R2.y + 1, R2.w - 2, R2.h - 2, 4); g.fill();
          drawTower(g, { x: p.x, y: p.y, lvl: 0, look: d.look || U.type, aim: -Math.PI / 2 + Math.sin(t) * 0.5, kick: 0, color: d.color }, t, { ghost: true, custom: d.draw });
        }
      } else brackets(g, R2, U.keyCursor ? '#ffffff' : 'rgba(255,255,255,0.7)', t);
    }
    function brackets(g, R2, col, t) {
      var p = 1 + Math.sin(t * 6) * 1, L = 7, x0 = R2.x - p, y0 = R2.y - p, x1 = R2.x + R2.w + p, y1 = R2.y + R2.h + p;
      g.save(); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3.2; g.lineCap = 'round';
      var path = function () { g.beginPath(); g.moveTo(x0, y0 + L); g.lineTo(x0, y0); g.lineTo(x0 + L, y0); g.moveTo(x1 - L, y0); g.lineTo(x1, y0); g.lineTo(x1, y0 + L); g.moveTo(x1, y1 - L); g.lineTo(x1, y1); g.lineTo(x1 - L, y1); g.moveTo(x0 + L, y1); g.lineTo(x0, y1); g.lineTo(x0, y1 - L); };
      path(); g.stroke(); g.strokeStyle = col; g.lineWidth = 1.6; path(); g.stroke(); g.restore();
    }
    function glass(g, x, y, w, h, o) {
      o = o || {};
      g.save(); rr(g, x, y, w, h, o.r || 7);
      var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, o.top || 'rgba(58,44,34,0.96)'); gr.addColorStop(1, o.bottom || 'rgba(26,20,16,0.97)'); g.fillStyle = gr; g.fill();
      g.lineWidth = o.lw || 1.2; g.strokeStyle = o.stroke || 'rgba(214,176,108,0.85)'; g.stroke();
      if (!o.flat) { rr(g, x + 2, y + 2, w - 4, h * 0.42, (o.r || 7) - 2); g.fillStyle = 'rgba(255,240,210,0.06)'; g.fill(); }
      g.restore();
    }
    function button(g, b, label, o) {
      o = o || {};
      var on = !o.disabled, hot = o.hot || (U.hover && U.hover.x >= b.x && U.hover.x <= b.x + b.w && U.hover.y >= b.y && U.hover.y <= b.y + b.h);
      glass(g, b.x, b.y, b.w, b.h, { r: 5, top: o.on ? '#8a6a2a' : on ? (hot ? '#5a4a36' : '#45372a') : '#2e2620', bottom: o.on ? '#4a3410' : on ? '#2a2018' : '#201a16', stroke: o.on ? '#ffe08a' : on ? 'rgba(214,176,108,0.8)' : 'rgba(120,100,80,0.6)', flat: false });
      text(g, label, b.x + b.w / 2, b.y + b.h / 2 + 0.5, { size: o.size || 9.5, weight: 800, align: 'center', color: on ? (o.color || '#fff4dc') : '#8a7e70', ow: 2.5, maxW: b.w - 4 });
    }
    function drawUI(g) {
      if (!sim) return;
      try {
        var t = now(), compact = params.layout === 'compact';
        g.save(); enter(g);
        var L = layout(), by = {}; L.forEach(function (b) { (by[b.name] = by[b.name] || []).push(b); });
        if (!compact) {
        // top bar: lives and gold
        var st = by.stats[0]; glass(g, st.x, st.y, st.w, st.h, { r: 13 });
        heart(g, st.x + 16, st.y + 13, 6.5); text(g, String(S.lives), st.x + 27, st.y + 13.5, { size: 13, weight: 900, color: S.lives <= 5 ? '#ff8a7a' : '#fff4dc', ow: 3 });
        coin(g, st.x + 80, st.y + 13, 6.5); text(g, String(S.gold), st.x + 91, st.y + 13.5, { size: 13, weight: 900, color: '#ffe27a', ow: 3 });
        // wave pill with progress
        var wv = by.wave[0]; glass(g, wv.x, wv.y, wv.w, wv.h, { r: 13 });
        text(g, 'WAVE', wv.x + 14, wv.y + 13.5, { size: 9, weight: 900, color: '#d8c49a', ls: 1 });
        text(g, Math.max(S.wave, 0) + ' / ' + S.waveCount, wv.x + 46, wv.y + 13.5, { size: 13, weight: 900, color: '#fff4dc', ow: 3 });
        var tot = S.waveTotal[S.wave] || 0, out = S.waveSpawned[S.wave] || 0, bx = wv.x + 92, bw = wv.w - 104;
        g.fillStyle = 'rgba(0,0,0,0.5)'; rr(g, bx, wv.y + 10, bw, 7, 3.5); g.fill();
        var frac = S.phase === 'build' ? 0 : S.countdown > 0 ? 1 - S.countdown / (params.waveGap * 1000) : tot ? out / tot : 0;
        g.fillStyle = S.countdown > 0 ? '#7ac8ff' : '#e86a4a'; rr(g, bx + 1, wv.y + 11, Math.max(0, (bw - 2) * clamp(frac, 0, 1)), 5, 2.5); g.fill();
        var lab = S.phase === 'build' ? 'Build, then send wave 1' : S.countdown > 0 ? 'Next in ' + Math.ceil(S.countdown / 1000) + 's' : S.nextWave >= S.waveCount && !S.spawners.length ? 'Last wave' : 'Incoming';
        text(g, lab, bx + bw / 2, wv.y + 21.5, { size: 7.5, weight: 800, align: 'center', color: '#e8dcc0', alpha: 0.9 });
        // speed and pause
        button(g, by.speed[0], params.speed >= 2 ? 'x2 >>' : 'x1 >', { on: params.speed >= 2, size: 10 });
        button(g, by.pause[0], paused ? 'Resume' : 'Pause', { on: paused, size: 9.5 });
        drawPanel(g, by, t);
        }
        drawBanners(g, t);
        if (U.msg) { var a = U.msg.t < 1100 ? 1 : 1 - (U.msg.t - 1100) / 300, mw = measure(g, U.msg.text, 10, 800) + 22, mx = map.x + map.w / 2 - mw / 2, my = map.y + map.h - 30;
          g.save(); g.globalAlpha *= a; glass(g, mx, my, mw, 20, { r: 10, top: 'rgba(110,30,24,0.95)', bottom: 'rgba(60,14,12,0.95)', stroke: '#ff8a6a' }); text(g, U.msg.text, mx + mw / 2, my + 10.5, { size: 10, weight: 800, align: 'center', color: '#fff0e8' }); g.restore(); }
        if (paused && !S.ended) { g.fillStyle = 'rgba(10,8,14,0.35)'; g.fillRect(map.x, map.y, map.w, map.h); text(g, 'PAUSED', map.x + map.w / 2, map.y + map.h / 2, { size: 26, weight: 900, align: 'center', color: '#fff4dc', ow: 5, ls: 3 }); }
        U.lastUI = L;
        g.restore();
      } catch (e) { warn('drawUI', e); }
    }
    function miniTower(g, id, cx, cy, sc2, t) { var d = lib.towers[id]; g.save(); g.translate(cx, cy - 5 * sc2); g.scale(sc2, sc2); drawTower(g, { x: 0, y: 0, lvl: 0, look: d.look || id, aim: -0.6, kick: 0, color: d.color }, t, { custom: d.draw, noPips: true, scale: 1 }); g.restore(); }
    function miniEnemy(g, id, cx, cy, sc2, t) { var d = lib.enemies[id]; if (!d) return; var e = { def: d, x: 0, y: 0, ang: 0, walk: t * 30, n: 1, hover: 0, flash: 0, slowT: 0 }; g.save(); g.translate(cx, cy); g.scale(sc2, sc2); drawEnemy(g, e, t); g.restore(); }
    // the stat rows of the info box, as rects (stage px): one column while placing, two columns for a selected tower so the
    // upgrade / sell / target buttons always fit under them (checks/rules.mjs 'panel' tests every tower x level)
    function infoRows(id, tw, sel) {
      var d2 = lib.towers[id], Lv = sel && tw ? sim.lvl(tw) : d2.levels[0], iy = PANEL.y + 146, x0 = PANEL.x + 6, w = PANEL.w - 12;
      var list = [['DMG', Lv.damage + (d2.kind === 'chain' ? ' x' + (1 + (Lv.chain | 0)) : '')], ['RANGE', Lv.range.toFixed(1)], ['RATE', Lv.rate.toFixed(1) + '/s']];
      if (d2.kind === 'splash') list.push(['AREA', Lv.splash.toFixed(1)]); if (d2.kind === 'slow') list.push(['SLOW', Math.round(Lv.slow * 100) + '%']);
      if (!sel) list.push(['', d2.air === false ? 'Ground only' : 'Ground + air']);
      list = list.slice(0, 4);
      var rows = list.map(function (r2, i) { return sel ? { label: r2[0], value: r2[1], x: x0 + (i % 2) * (w / 2 + 1), y: iy + 16 + Math.floor(i / 2) * 11, w: w / 2 - 1, h: 10 } : { label: r2[0], value: r2[1], x: x0, y: iy + 16 + i * 10.5, w: w, h: 10 }; });
      var bottom = rows.reduce(function (m, r2) { return Math.max(m, r2.y + r2.h); }, iy + 16);
      return { rows: rows, bottom: bottom };
    }
    function drawPanel(g, by, t) {
      var pn = by.panel[0]; glass(g, pn.x, pn.y, pn.w, pn.h, { r: 9 });
      text(g, 'BUILD', pn.x + pn.w / 2, pn.y + 11, { size: 9, weight: 900, align: 'center', color: '#d8c49a', ls: 2 });
      (by.card || []).forEach(function (b, i) {
        var d = lib.towers[b.id], cost = d.levels[0].cost, can = S.gold >= cost && !S.ended, on = U.mode === 'place' && U.type === b.id;
        glass(g, b.x, b.y, b.w, b.h, { r: 6, top: on ? '#7a5a26' : '#3e3128', bottom: on ? '#3a280e' : '#221a14', stroke: on ? '#ffe08a' : 'rgba(214,176,108,0.6)', lw: on ? 1.6 : 1 });
        g.save(); rr(g, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 5); g.clip(); if (!can) g.globalAlpha *= 0.45;
        var ms = Math.min(0.8, b.h / 66); miniTower(g, b.id, b.x + b.w / 2, b.y + b.h - 14 * ms - 4, ms, t); g.restore();
        text(g, String(i + 1), b.x + 6, b.y + 7, { size: 8, weight: 900, color: '#d8c49a', ow: 2 });
        coin(g, b.x + b.w - 19, b.y + b.h - 6.5, 3.2); text(g, String(cost), b.x + b.w - 14, b.y + b.h - 6, { size: 8.5, weight: 900, color: can ? '#ffe27a' : '#ff8a7a', ow: 2.5 });
      });
      // info box: the chosen tower type or the selected tower
      var iy = pn.y + 146, tw = U.sel && sim.byTower(U.sel), id = U.mode === 'place' ? U.type : tw ? tw.type : null;
      g.fillStyle = 'rgba(0,0,0,0.22)'; rr(g, pn.x + 4, iy, pn.w - 8, 94, 6); g.fill();
      if (id) {
        var d2 = lib.towers[id], Lv = tw && U.mode === 'select' ? sim.lvl(tw) : d2.levels[0], nm = d2.name + (tw && U.mode === 'select' ? '  ' : '');
        text(g, d2.name, pn.x + 8, iy + 9, { size: 9.5, weight: 900, color: '#ffe8b8', maxW: tw && U.mode === 'select' ? 62 : 88 });
        if (tw && U.mode === 'select') text(g, 'Lv ' + (tw.lvl + 1), pn.x + pn.w - 8, iy + 9, { size: 9, weight: 900, align: 'right', color: '#ffd25a' });
        var IR = infoRows(id, tw, tw && U.mode === 'select'), rows = IR.rows;
        rows.forEach(function (r2) { text(g, r2.label, r2.x + 2, r2.y + r2.h / 2, { size: 7.5, weight: 800, color: '#a8987c' }); text(g, r2.value, r2.x + r2.w - 2, r2.y + r2.h / 2, { size: 8.5, weight: 800, align: 'right', color: '#f4ead4', maxW: r2.w - 22 }); });
        if (tw && U.mode === 'select') {
          var uc = sim.upgradeCost(tw), up = by.upgrade[0], sl = by.sell[0];
          button(g, up, uc == null ? 'MAX' : 'Up ' + uc, { disabled: uc == null || S.gold < uc, color: '#ffe27a', size: 9 });
          button(g, sl, 'Sell ' + sim.refundOf(tw), { size: 9 });
          text(g, 'TARGET', pn.x + 8, iy + 66, { size: 0.1, color: 'rgba(0,0,0,0)' });
          (by.target || []).forEach(function (b) { button(g, b, PRIORITY_LABEL[b.id], { on: tw.priority === b.id, size: 7.5 }); });
        } else {
          var words = String(d2.text || '').split(' '), lines = [''], li = 0;
          words.forEach(function (wd) { var tryL = lines[li] ? lines[li] + ' ' + wd : wd; if (measure(g, tryL, 7.5, 700) > pn.w - 16 && lines[li]) { lines.push(wd); li++; } else lines[li] = tryL; });
          lines.slice(0, 2).forEach(function (ln, i) { text(g, ln, pn.x + 8, iy + 66 + i * 9.5, { size: 7.5, weight: 700, color: '#d8ccb4', maxW: pn.w - 16 }); });
          if (U.mode === 'place') text(g, 'Tap a grass cell', pn.x + 8, iy + 87, { size: 7.5, weight: 800, color: '#8af07a', maxW: pn.w - 16 });
        }
      } else {
        text(g, 'Pick a tower,', pn.x + pn.w / 2, iy + 34, { size: 9, weight: 800, align: 'center', color: '#d8ccb4' });
        text(g, 'then a grass cell.', pn.x + pn.w / 2, iy + 47, { size: 9, weight: 800, align: 'center', color: '#d8ccb4' });
        text(g, 'Tap a tower to', pn.x + pn.w / 2, iy + 64, { size: 8, weight: 700, align: 'center', color: '#a8987c' });
        text(g, 'upgrade or sell it.', pn.x + pn.w / 2, iy + 75, { size: 8, weight: 700, align: 'center', color: '#a8987c' });
      }
      // next wave preview
      var nx = by.next[0]; g.fillStyle = 'rgba(0,0,0,0.22)'; rr(g, nx.x, nx.y, nx.w, nx.h, 6); g.fill();
      if (params.preview !== 'off' && S.nextWave < S.waveCount) {
        var W2 = sim.waves[S.nextWave];
        text(g, 'NEXT  ' + (S.nextWave + 1) + '/' + S.waveCount, nx.x + 5, nx.y + 8, { size: 8, weight: 900, color: '#d8c49a', ls: 0.5 });
        (W2.groups || []).slice(0, 3).forEach(function (gr2, i) {
          var gx = nx.x + 5 + i * 31, gy = nx.y + 30, d3 = lib.enemies[gr2.enemy] || {};
          g.fillStyle = d3.boss ? 'rgba(160,40,90,0.35)' : 'rgba(255,255,255,0.06)'; rr(g, gx, gy - 12, 29, 26, 5); g.fill();
          miniEnemy(g, gr2.enemy, gx + 14.5, gy, Math.min(1, 9 / (d3.size || 8)), t);
          text(g, 'x' + (gr2.count | 0), gx + 27, gy + 10, { size: 8.5, weight: 900, align: 'right', color: '#fff4dc', ow: 2.5 });
        });
        var cb = by.call && by.call[0];
        if (cb) { var bonus = S.phase !== 'build' && S.countdown > 0 ? Math.floor(S.countdown / 1000 * params.earlyBonus) : 0; button(g, cb, S.phase === 'build' ? 'Send wave  [N]' : 'Send now +' + bonus, { color: '#bfe8ff', size: 8.5, hot: S.phase === 'build' && Math.sin(uiT / 200) > 0.3 }); }
        else text(g, 'Arriving...', nx.x + nx.w / 2, nx.y + 59, { size: 8.5, weight: 800, align: 'center', color: '#a8987c' });
      } else {
        text(g, 'FINAL WAVE', nx.x + nx.w / 2, nx.y + 26, { size: 10, weight: 900, align: 'center', color: '#ffb0a0', ls: 1 });
        text(g, S.ended ? '' : 'Hold the gate!', nx.x + nx.w / 2, nx.y + 44, { size: 8.5, weight: 800, align: 'center', color: '#d8ccb4' });
      }
    }
    function drawBanners(g, t) {
      S.banners.forEach(function (b) {
        var big = b.kind === 'win' || b.kind === 'lose', u = b.t / Math.min(b.dur, 1600), cx = map.x + map.w / 2, cy = big ? map.y + map.h / 2 - 20 : map.y + 64;
        var a = big ? Math.min(1, b.t / 300) : (u < 0.15 ? u / 0.15 : u > 0.8 ? (1 - u) / 0.2 : 1), sc3 = big ? backOut(Math.min(1, b.t / 500)) : 0.9 + 0.1 * backOut(Math.min(1, u / 0.2));
        if (a <= 0) return;
        g.save(); g.globalAlpha *= clamp(a, 0, 1);
        if (big) { g.fillStyle = 'rgba(8,6,12,' + (0.55 * Math.min(1, b.t / 600)) + ')'; g.fillRect(map.x, map.y, map.w, map.h); }
        g.translate(cx, cy); g.scale(sc3, sc3);
        var w = big ? 300 : 240, h = big ? 74 : 44, col = b.kind === 'win' ? '#ffd25a' : b.kind === 'lose' ? '#ff6a5a' : b.kind === 'clear' ? '#9ae07a' : '#ffe8b8';
        var gr = g.createLinearGradient(-w / 2, 0, w / 2, 0); gr.addColorStop(0, 'rgba(20,14,10,0)'); gr.addColorStop(0.18, 'rgba(26,18,12,0.88)'); gr.addColorStop(0.82, 'rgba(26,18,12,0.88)'); gr.addColorStop(1, 'rgba(20,14,10,0)');
        g.fillStyle = gr; g.fillRect(-w / 2, -h / 2, w, h);
        g.fillStyle = rgba(col, 0.8); g.fillRect(-w * 0.36, -h / 2, w * 0.72, 1.4); g.fillRect(-w * 0.36, h / 2 - 1.4, w * 0.72, 1.4);
        text(g, b.text, 0, b.sub ? -7 : 0, { size: big ? 28 : 18, weight: 900, align: 'center', color: col, ow: 5, ls: big ? 3 : 2 });
        if (b.sub) text(g, b.sub, 0, big ? 20 : 12, { size: big ? 11 : 9.5, weight: 800, align: 'center', color: '#f4ead4', ow: 3 });
        if (big && S.endT > 1200) {
          text(g, 'Waves ' + Math.min(S.wave, S.waveCount) + '/' + S.waveCount + '   Foes ' + S.kills + '   Lives ' + S.lives, 0, 46, { size: 10, weight: 800, align: 'center', color: '#e8dcc0', ow: 3 });
        }
        g.restore();
      });
    }

    /* ---------- read-only views for hosts, addons and the judge ---------- */
    function anchor(id) {
      if (!sim) return null;
      var e = sim.byEnemy(id);
      if (e) { var s2 = e.def.size || 8, top = e.y - e.hover - s2 - 10; return mapR({ x: e.x, top: top, left: e.x - s2 * 1.4, w: s2 * 2.8, h: e.y - top + 3, cy: e.y - e.hover, footY: e.y + 3, dead: e.hp <= 0, flying: !!e.def.flying, kind: e.kind }); }
      var t = sim.byTower(id);
      if (t) return mapR({ x: t.x, top: t.y - 40, left: t.x - 14, w: 28, h: 54, cy: t.y - 16, footY: t.y + 14, dead: false, tower: t.type });
      if (id === 'gate' && map.paths[0]) { var b = map.paths[0].pts[map.paths[0].pts.length - 1]; return mapR({ x: b.x - 12, top: b.y - 46, left: b.x - 32, w: 40, h: 60, cy: b.y - 18, footY: b.y + 14, dead: S.lives <= 0 }); }
      return null;
    }
    function mapR(a) { var v = kf(), s2 = scl(), C = crop(), o = {}; for (var q in a) o[q] = a[q]; ['x', 'left'].forEach(function (q) { if (o[q] != null) o[q] = v.x + (o[q] - C.x) * s2; }); ['top', 'cy', 'footY'].forEach(function (q) { if (o[q] != null) o[q] = v.y + (o[q] - C.y) * s2; }); o.w *= s2; o.h *= s2; return o; }
    function unitRects() {
      if (!sim) return [];
      var out = [];
      S.enemies.forEach(function (e) { if (e.dying) return; var a = anchor(e.id); out.push({ id: e.id, x: a.left, y: a.top, w: a.w, h: a.h, kind: 'enemy' }); });
      S.towers.forEach(function (t) { var a = anchor(t.id); out.push({ id: t.id, x: a.left, y: a.top, w: a.w, h: a.h, kind: 'tower' }); });
      return out;
    }
    function uiRects() {
      if (!sim) return [];
      var L = layout().filter(function (b) { return ['stats', 'wave', 'speed', 'pause', 'panel'].indexOf(b.name) >= 0; }).map(function (b) { var r = toHost(b); r.name = b.name; return r; });
      if (S.banners.length) { var big = S.ended, r2 = toHost({ x: map.x + map.w / 2 - (big ? 150 : 120), y: big ? map.y + map.h / 2 - 57 : map.y + 42, w: big ? 300 : 240, h: big ? 100 : 44 }); r2.name = 'banner'; L.push(r2); }
      if (U.msg) { var r3 = toHost({ x: map.x + map.w / 2 - 110, y: map.y + map.h - 30, w: 220, h: 20 }); r3.name = 'toast'; L.push(r3); }
      return L;
    }
    function fieldRect() { return toHost({ x: map.x, y: map.y, w: map.w, h: map.h }); }
    function actors() {
      if (!sim) return [];
      var s2 = scl(), out = [], H = function (x, y) { return toHost({ x: x, y: y, w: 0, h: 0 }); };
      S.enemies.forEach(function (e) {
        var c = Math.cos(e.ang), hp = H(e.x, e.y), a = { id: e.id, kind: e.kind, x: hp.x, y: hp.y, vx: +(e.vx * s2).toFixed(2), vy: +(e.vy * s2).toFixed(2), heading: +(e.ang * 180 / Math.PI).toFixed(1), target: null, hp: e.hp };
        if (e.dying) a.noFace = 'dying';
        else if (Math.abs(c) < 0.3) { a.noFace = 'seen from above, heading ' + (Math.sin(e.ang) > 0 ? 'down' : 'up') + ' the road'; a.facing = c >= 0 ? 'right' : 'left'; }
        else a.facing = c > 0 ? 'right' : 'left';
        out.push(a);
      });
      S.towers.forEach(function (t) {
        var e = t.target && sim.byEnemy(t.target), aimDeg = Math.atan2(Math.sin(t.aim), Math.cos(t.aim)) * 180 / Math.PI, want = e ? Math.atan2(e.y - e.hover - t.y + 14, e.x - t.x) * 180 / Math.PI : null;
        var tp = H(t.x, t.y);
        out.push({ id: t.id, kind: 'tower-' + t.type, x: tp.x, y: tp.y, target: null, aimAt: t.target, aim: +aimDeg.toFixed(1), aimErr: want == null ? null : +Math.abs(((aimDeg - want + 540) % 360) - 180).toFixed(1), priority: t.priority, noFace: 'turret seen from above, turns 360 degrees (aim, aimAt)' });
      });
      return out;
    }
    function state() {
      if (!sim) return { phase: 'none' };
      return { phase: S.phase, result: S.result, frame: S.frame, wave: S.wave, waves: S.waveCount, gold: S.gold, lives: S.lives, towers: S.towers.length, enemies: S.enemies.filter(function (e) { return !e.dying; }).length,
        kills: S.kills, leaks: S.leaks, countdown: Math.max(0, Math.round(S.countdown)), mode: U.mode, sel: U.sel, speed: params.speed, paused: paused, auto: auto,
        build: S.towers.map(function (t) { return t.type.charAt(0) + (t.lvl + 1) + '@' + t.c + ',' + t.r; }).join(' ') };
    }

    // everything the build panel and HUD show, as data (for a host that draws them itself, e.g. layout 'compact' on phones)
    function panelState() {
      if (!sim) return null;
      var tw = U.sel && sim.byTower(U.sel), nw = S.nextWave < S.waveCount ? sim.waves[S.nextWave] : null;
      return { lives: S.lives, gold: S.gold, wave: S.wave, waves: S.waveCount, phase: S.phase, countdown: Math.max(0, Math.ceil(S.countdown / 1000)), speed: params.speed, paused: paused, mode: U.mode,
        shop: shop.map(function (id, i) { var d = lib.towers[id]; return { id: id, key: String(i + 1), name: d.name, cost: d.levels[0].cost, can: S.gold >= d.levels[0].cost, on: U.mode === 'place' && U.type === id, text: d.text || '' }; }),
        sel: tw ? { id: tw.id, type: tw.type, name: lib.towers[tw.type].name, level: tw.lvl + 1, upgradeCost: sim.upgradeCost(tw), canUpgrade: sim.upgradeCost(tw) != null && S.gold >= sim.upgradeCost(tw), refund: sim.refundOf(tw), priority: tw.priority } : null,
        next: nw ? { index: S.nextWave + 1, line: sim.waveLine(S.nextWave), canCall: sim.canCallWave(), bonus: S.phase !== 'build' && S.countdown > 0 ? Math.floor(S.countdown / 1000 * params.earlyBonus) : 0, build: S.phase === 'build' } : null,
        message: U.msg ? U.msg.text : null, ended: S.ended, result: S.result };
    }
    api.panelState = panelState;
    // for checks: the stat rows and the panel buttons as drawn for a selected tower (stage px)
    api._infoLayout = function (towerId) { var t = sim && sim.byTower(towerId); if (!t) return null; var keep = [U.mode, U.sel]; U.mode = 'select'; U.sel = t.id; var L = layout().filter(function (b) { return b.name === 'upgrade' || b.name === 'sell' || b.name === 'target'; }); U.mode = keep[0]; U.sel = keep[1]; return { rows: infoRows(t.type, t, true).rows, buttons: L, box: { x: PANEL.x + 4, y: PANEL.y + 146, w: PANEL.w - 8, h: 94 } }; };
    api.version = VERSION;
    api.start = start; api.update = update; api.drawScene = drawScene; api.drawUI = drawUI; api.key = key; api.pointer = pointer;
    api.setAuto = function (on) { auto = !!on; if (auto && bot) { bot.job = null; bot.wait = Math.max(bot.wait, 20); } };
    api.auto = function () { return auto; };
    api.setParams = function (p) { for (var q in (p || {})) if (p[q] != null) { params[q] = p[q]; if (sim) sim.P[q] = p[q]; } if (p && p.speed != null) setSpeed(p.speed); };
    api.params = function () { return params; };
    api.pause = function (on) { paused = on == null ? !paused : !!on; return paused; };
    api.paused = function () { return paused; };
    api.build = function (type, c, r) { return sim ? sim.build(type, c, r) : { ok: false, why: 'none' }; };
    api.upgrade = function (id) { return sim ? sim.upgrade(id) : { ok: false }; };
    api.sell = function (id) { return sim ? sim.sell(id) : { ok: false }; };
    api.setPriority = function (id, p) { return sim ? sim.setPriority(id, p) : false; };
    api.callWave = function () { return sim ? sim.callWave(true) : false; };
    api.canBuild = function (type, c, r) { return sim ? sim.blockedWhy(c, r, type) : 'none'; };
    api.select = function (id) { var t = sim && sim.byTower(id); U.sel = t ? t.id : null; U.mode = t ? 'select' : 'idle'; return !!t; };
    api.enemies = function () { return sim ? S.enemies.slice() : []; };
    api.towers = function () { return sim ? S.towers.slice() : []; };
    api.tower = function (id) { return sim ? sim.byTower(id) : null; };
    api.enemy = function (id) { return sim ? sim.byEnemy(id) : null; };
    api.map = function () { return map; };
    api.waves = function () { return sim ? sim.waves : []; };
    api.nextWave = function () { return sim && S.nextWave < S.waveCount ? { index: S.nextWave + 1, groups: copy(sim.waves[S.nextWave].groups), line: sim.waveLine(S.nextWave) } : null; };
    api.pickTarget = function (towerId, priority) { var t = sim && sim.byTower(towerId); if (!t) return null; var e = sim.pickTarget(t, priority); return e ? e.id : null; };
    api.remaining = function (id) { var e = sim && sim.byEnemy(id); return e ? sim.remaining(e) : null; };
    api.rangeOf = function (id) { var t = sim && sim.byTower(id); return t ? sim.lvl(t).range * map.cell : null; };
    api.cellAt = function (x, y) { var p = toStage(x, y); return sim ? sim.cellAt(p.x, p.y) : null; };
    api.cellCentre = function (c, r) { if (!sim) return null; var p = sim.cellCentre(c, r), h = toHost({ x: p.x, y: p.y, w: 0, h: 0 }); return { x: h.x, y: h.y }; };
    api.isRoad = function (c, r) { return sim ? sim.isRoad(c, r) : false; };
    api.anchor = anchor; api.unitRects = unitRects; api.uiRects = uiRects; api.fieldRect = fieldRect; api.actors = actors; api.state = state;
    api.gold = function () { return S ? S.gold : 0; }; api.lives = function () { return S ? S.lives : 0; };
    api.phase = function () { return S ? S.phase : 'none'; }; api.result = function () { return S ? S.result : null; };
    api.addGold = function (n, why) { if (!sim) return; sim.S.gold += n | 0; safe(opt.onEvent, [{ kind: 'gold', delta: n | 0, why: why || 'host', gold: S.gold, frame: S.frame }], 'onEvent'); };
    api.lib = lib; api.shop = function () { return shop.slice(); };
    api.frame = function () { return S ? S.frame : 0; };
    api.time = function () { return S ? S.time : 0; };
    api.rng = function () { return sim ? sim.rng() : 0; };
    api.drawTowerIcon = function (g, id, x, y, s2) { try { miniTower(g, id, x, y, s2 || 1, now()); } catch (e) { warn('drawTowerIcon', e); } };
    api.drawEnemyIcon = function (g, id, x, y, s2) { try { miniEnemy(g, id, x, y, s2 || 1, now()); } catch (e) { warn('drawEnemyIcon', e); } };
    api.ui = U;
    if (opt.autoStart !== false && (opt.map || opt.waves)) start({});
    return api;
  }
