
  /* =====================================================================================================
     The instance
     ===================================================================================================== */
  var DEFAULTS = { dayMs: 28000, seasonDays: 4, seasons: 3, rain: 0.2, startGold: 120, walkMs: 180, turnMs: 110, toolSpeed: 1, botWait: 110,
    botPlots: 16, botBuy: 8, nightMs: 2600, hud: 'on', night: 'on', cursor: 'on', growth: 'watered', wither: 'on' };

  function create(opt) {
    opt = opt || {};
    var P = copy(DEFAULTS), k; for (k in (opt.params || {})) P[k] = opt.params[k];
    ['dayMs', 'seasonDays', 'seasons', 'rain', 'startGold', 'walkMs', 'turnMs', 'toolSpeed', 'botWait', 'botPlots', 'botBuy', 'nightMs'].forEach(function (key) { P[key] = num(P[key], DEFAULTS[key]); });
    P.seasonDays = Math.max(1, Math.round(P.seasonDays)); P.seasons = Math.max(1, Math.round(P.seasons)); P.dayMs = Math.max(4000, P.dayMs);
    var T = Math.max(4, num(opt.tile, 16)), COLS = Math.max(1, num(opt.cols, 20) | 0), ROWS = Math.max(1, num(opt.rows, 12) | 0);
    var CROPS_ = opt.crops || (function () { var o = {}; for (var id in CROPS) o[id] = copy(CROPS[id]); return o; })();
    var TOOLS_ = opt.tools || (function () { var o = {}; for (var id in TOOLS) o[id] = copy(TOOLS[id]); return o; })();
    var ORDER = (opt.toolOrder || Object.keys(TOOLS_)).slice();
    var SEAS = opt.seasonList || SEASONS;
    var SEED = (num(opt.seed, 1) >>> 0) || 1;
    var walkFn = typeof opt.walkable === 'function' ? opt.walkable : function () { return true; };
    var spots = {}; ['bin', 'shop', 'bed'].forEach(function (s) { var v = opt.spots && opt.spots[s]; if (v) spots[s] = [v[0] | 0, v[1] | 0]; });
    var START = opt.start || [Math.floor(COLS / 2), Math.floor(ROWS / 2), 'down'];
    var LIGHTS = opt.lights || [];
    function emit(ev) { ev.day = S.day; ev.t = Math.round(S.clock); S.recent.push(ev.kind + (ev.tool ? ':' + ev.tool : ev.crop ? ':' + ev.crop : '') + '@' + Math.round(S.clock)); if (S.recent.length > 24) S.recent.shift(); safe(opt.onEvent, [ev], 'onEvent'); }

    /* ---------- state ---------- */
    var S, F;
    function fieldCells() { var out = []; (opt.field || []).forEach(function (c) { if (c && c[0] >= 0 && c[1] >= 0 && c[0] < COLS && c[1] < ROWS) out.push([c[0] | 0, c[1] | 0]); }); return out; }
    function reset(seed) {
      if (seed != null) SEED = (num(seed, 1) >>> 0) || 1;
      var wr = rngOf(SEED * 2654435761 + 17), lastDay = P.seasonDays * P.seasons, rain = [false];
      for (var d = 1; d <= lastDay; d++) { var dos = (d - 1) % P.seasonDays + 1, r = wr(); rain.push(d > 1 && dos > 1 && r < P.rain); }
      S = { clock: 0, day: 1, dayT: 0, phase: 'wake', phaseT: 0, gold: Math.max(0, Math.round(P.startGold)), earned: 0, bag: { seeds: {}, crops: {} }, bin: {}, shipped: {},
        plots: new Array(COLS * ROWS), rain: rain, lastDay: lastDay, auto: !!S && S.auto, toolIdx: 0, seedId: null, shopCur: 0, recent: [], night: null, banner: null,
        fx: [], fxId: 0, keyQ: [], held: {}, heldOrder: [], goal: null, botT: 0, planted: {}, ended: false, result: null, rng: rngOf(SEED + 99), notice: null, stats: { harvests: 0, shipped: 0, bought: 0, grew: 0, withered: 0 } };
      fieldCells().forEach(function (c) { S.plots[c[1] * COLS + c[0]] = { cx: c[0], cy: c[1], tilled: false, watered: false, crop: null }; });
      (opt.tilled || []).forEach(function (c) { var p = S.plots[c[1] * COLS + c[0]]; if (p) p.tilled = true; });
      F = S.farmer = { cx: START[0] | 0, cy: START[1] | 0, dir: START[2] || 'down', x: 0, y: 0, mv: null, walk: 0, use: null, lift: null, holdT: 0, stopT: 1e9 };
      placeFarmer(F.cx, F.cy, F.dir);
      if (opt.startSeeds) for (var id in opt.startSeeds) S.bag.seeds[id] = opt.startSeeds[id] | 0;
      S.seedId = firstSeed();
      emit({ kind: 'day', season: seasonId(1), rain: !!S.rain[1], first: true });
    }
    function placeFarmer(cx, cy, dir) { F.cx = cx; F.cy = cy; F.dir = dir || F.dir; F.x = cx * T + T / 2; F.y = cy * T + T - 2; F.mv = null; F.use = null; }
    function seasonIdx(day) { return Math.floor((day - 1) / P.seasonDays) % SEAS.length; }
    function seasonId(day) { return SEAS[seasonIdx(day == null ? S.day : day)].id; }
    function dayOfSeason(day) { return ((day == null ? S.day : day) - 1) % P.seasonDays + 1; }
    function daysLeft() { return P.seasonDays - dayOfSeason() + 1; }
    function hour() { return 6 + 18 * clamp(S.dayT / P.dayMs, 0, 1); }
    function plotAt(cx, cy) { return cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS ? null : S.plots[cy * COLS + cx] || null; }
    function spotAt(cx, cy) { for (var s in spots) if (spots[s][0] === cx && spots[s][1] === cy) return s; return null; }
    function walkable(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return false;
      if (spotAt(cx, cy)) return false;
      var p = plotAt(cx, cy); if (p && p.crop) return false;
      return !!safe(walkFn, [cx, cy], 'walkable') || !!p;
    }
    function tool() { return toolDef(TOOLS_, ORDER[S.toolIdx]) || toolDef(TOOLS_, ORDER[0]); }
    function seedsHeld() { var out = []; for (var id in CROPS_) if ((S.bag.seeds[id] || 0) > 0) out.push(id); return out; }
    function firstSeed() { var h = seedsHeld(); return h.length ? h[0] : (S.seedId || null); }
    function actx() { return { crops: CROPS_, season: seasonId(), bag: S.bag, seed: S.seedId, day: S.day }; }

    /* ---------- input: everything (keys, taps, the bot) goes through key() ---------- */
    function key(k) {
      if (k == null) return false;
      if (S.keyQ.length < 6) S.keyQ.push(String(k));
      return true;
    }
    function setHeld(dir, on) {
      if (!DIRS[dir]) return; S.held[dir] = !!on;
      var i = S.heldOrder.indexOf(dir); if (i >= 0) S.heldOrder.splice(i, 1); if (on) S.heldOrder.push(dir);
    }
    function heldDir() { for (var i = S.heldOrder.length - 1; i >= 0; i--) if (S.held[S.heldOrder[i]]) return S.heldOrder[i]; return null; }
    function busy() { return !!(F.mv || F.use); }
    function handleKey(k) {
      if (S.phase === 'shop') { shopKey(k); return true; }
      if (S.phase === 'night') { if ((k === 'ok' || k === 'back') && S.phaseT > 700) { S.phase = 'wake'; S.phaseT = 0; } return true; }
      if (S.phase !== 'play') return true;
      if (/^[1-9]$/.test(k)) { var ix = (+k) - 1; if (ix < ORDER.length && ix !== S.toolIdx) { S.toolIdx = ix; emit({ kind: 'tool', tool: ORDER[ix] }); } return true; }
      if (k === 'tool') { S.toolIdx = (S.toolIdx + 1) % ORDER.length; emit({ kind: 'tool', tool: ORDER[S.toolIdx] }); return true; }
      if (k === 'seed') { var h = seedsHeld(); if (h.length) { var j = h.indexOf(S.seedId); S.seedId = h[(j + 1) % h.length]; emit({ kind: 'seed', crop: S.seedId }); } return true; }
      if (k === 'back') { S.goal = null; return true; }
      if (busy()) return false;     // directions and ok wait for the farmer (a 0 ms tap still counts)
      if (DIRS[k]) { stepOrTurn(k); return true; }
      if (k === 'ok') { act(); return true; }
      return true;
    }
    function stepOrTurn(d) {
      if (F.dir !== d) { F.dir = d; F.holdT = 0; emit({ kind: 'turn', dir: d }); return; }
      var nx = F.cx + DIRS[d][0], ny = F.cy + DIRS[d][1];
      if (!walkable(nx, ny)) { emit({ kind: 'bump', dir: d }); return; }
      F.mv = { fx: F.x, fy: F.y, tx: nx * T + T / 2, ty: ny * T + T - 2, t: 0, ms: P.walkMs, cx: nx, cy: ny };
    }
    function front() { var d = DIRS[F.dir]; return [F.cx + d[0], F.cy + d[1]]; }
    function act() {
      var fc = front(), sp = spotAt(fc[0], fc[1]);
      if (sp === 'bin') { var n = 0; for (var id in S.bag.crops) { var c = S.bag.crops[id] | 0; if (c > 0) { S.bin[id] = (S.bin[id] || 0) + c; S.shipped[id] = (S.shipped[id] || 0) + c; n += c; } } S.bag.crops = {}; S.stats.shipped += n; emit({ kind: 'ship', n: n, at: fc }); if (n) fxBurst(fc, 'ship', 6); return; }
      if (sp === 'shop') { S.phase = 'shop'; S.phaseT = 0; S.shopCur = clamp(S.shopCur, 0, Math.max(0, shopList().length - 1)); emit({ kind: 'shopOpen' }); return; }
      if (sp === 'bed') { sleep('bed'); return; }
      var t = tool(); if (!t) return;
      var cells = rules.cellsFor(t, F.cx, F.cy, F.dir);
      F.use = { tool: ORDER[S.toolIdx], def: t, t: 0, ms: t.ms / Math.max(0.25, P.toolSpeed), cells: cells, applied: false, dir: F.dir };
      emit({ kind: 'use', tool: ORDER[S.toolIdx], action: t.action, dir: F.dir, at: [F.cx, F.cy], target: fc, cells: cells });
    }
    function applyUse(u) {
      var any = false, o = actx(), harvested = null;
      u.cells.forEach(function (c) {
        var p = plotAt(c[0], c[1]); if (!p) return;
        var ev = rules.apply(p, u.def.action, o); if (!ev) return; any = true; ev.tool = undefined; emit(ev);
        if (ev.kind === 'till') fxBurst(c, 'dirt', 5);
        if (ev.kind === 'water') fxBurst(c, 'water', 7);
        if (ev.kind === 'plant') { fxBurst(c, 'seed', 4); S.planted[seasonId() + ':' + ev.crop] = 1; if ((S.bag.seeds[ev.crop] || 0) <= 0) S.seedId = firstSeed(); }
        if (ev.kind === 'clear') fxBurst(c, 'chaff', 12);
        if (ev.kind === 'harvest') { S.stats.harvests++; fxBurst(c, 'leaf', 6); harvested = ev.crop; }   // no flying copy: the crop appears in the hands when the lift begins
      });
      if (!any) { emit({ kind: 'thunk', action: u.def.action, at: u.cells[0] }); if (u.def.action === 'plant' && !(S.bag.seeds[S.seedId] > 0)) emit({ kind: 'noSeed' }); }
      return harvested;
    }

    /* ---------- the shop: seeds of the season, Z buys one, X leaves ---------- */
    function shopList() { var out = [], sid = seasonId(); for (var id in CROPS_) { var d = cropDef(CROPS_, id); if (d && d.seasons.indexOf(sid) >= 0 && d.seed > 0) out.push(id); } return out; }
    function shopKey(k) {
      var L = shopList();
      if (k === 'up') S.shopCur = (S.shopCur + L.length - 1) % Math.max(1, L.length);
      else if (k === 'down') S.shopCur = (S.shopCur + 1) % Math.max(1, L.length);
      else if (k === 'ok' || k === 'right') {
        var id = L[S.shopCur]; if (!id) return; var n = rules.buy(S, id, k === 'right' ? 5 : 1, CROPS_);
        if (n > 0) { S.stats.bought += n; S.boughtToday = (S.boughtToday || 0) + n; emit({ kind: 'buy', crop: id, n: n, gold: S.gold }); if (!S.seedId || !(S.bag.seeds[S.seedId] > 0)) S.seedId = id; }
        else emit({ kind: 'poor', crop: id });
      } else if (k === 'back' || k === 'left') { S.phase = 'play'; S.phaseT = 0; emit({ kind: 'shopClose' }); }
    }

    /* ---------- the night ---------- */
    function sleep(why) { if (S.phase !== 'play') return; S.phase = 'sleep'; S.phaseT = 0; F.mv = null; F.use = null; S.goal = null; emit({ kind: 'sleep', why: why }); }
    function night() {
      var sale = rules.sell(S, CROPS_); emit({ kind: 'sell', gold: sale.total, lines: sale.lines });
      var info = { day: S.day, season: seasonId(), sale: sale, why: S.lastSleep, grew: 0, ripe: 0, withered: 0 };
      if (S.day >= S.lastDay) {
        S.phase = 'end'; S.phaseT = 0; S.night = info; S.ended = true;
        S.result = { earned: S.earned, gold: S.gold, shipped: copy(S.shipped), harvests: S.stats.harvests, days: S.day };
        emit({ kind: 'end', earned: S.earned, gold: S.gold }); safe(opt.onEnd, [S.result], 'onEnd'); return;
      }
      var prevSeason = seasonId(); S.day += 1; S.dayT = 0; S.boughtToday = 0;
      var evs = rules.dawn(S.plots, { crops: CROPS_, season: seasonId(), rain: S.rain[S.day] });
      evs.forEach(function (e) { if (e.kind === 'grow') info.grew++; if (e.kind === 'ripe') info.ripe++; if (e.kind === 'wither') info.withered++; emit(e); });
      S.stats.grew += info.grew; S.stats.withered += info.withered;
      info.rain = !!S.rain[S.day]; info.next = { day: S.day, season: seasonId(), dos: dayOfSeason() }; info.newSeason = seasonId() !== prevSeason;
      S.night = info; S.phase = 'night'; S.phaseT = 0;
      placeFarmer(START[0] | 0, START[1] | 0, START[2] || 'down');
      emit({ kind: 'day', season: seasonId(), rain: info.rain, newSeason: info.newSeason });
      if (info.newSeason) { emit({ kind: 'season', season: seasonId(), withered: info.withered }); S.banner = { t: 0, season: seasonId(), withered: info.withered }; }
      if (!(S.bag.seeds[S.seedId] > 0)) S.seedId = firstSeed();
    }

    /* ---------- particles (state lives in update, so ?t= stills equal play) ---------- */
    function fxBurst(c, kind, n) {
      var cx = c[0] * T + T / 2, cy = c[1] * T + T / 2 + 2;
      for (var i = 0; i < n; i++) { var a = S.rng() * Math.PI * 2, sp = 0.02 + S.rng() * 0.04; S.fx.push({ id: S.fxId++, kind: kind, x: cx + (S.rng() - 0.5) * 8, y: cy + (S.rng() - 0.5) * 6, z: kind === 'water' ? 6 + S.rng() * 4 : 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: kind === 'water' ? -0.01 : 0.05 + S.rng() * 0.05, t: 0, life: 420 + S.rng() * 220 }); }
    }
    // the harvest jumps from the plot into the farmer's hands; it ends on the frame the lift pose (the crop held overhead) begins
    function fxPop(c, crop, n, u) { var la = liftAnchor(F.dir); S.fx.push({ id: S.fxId++, kind: 'pop', crop: crop, n: n, x: c[0] * T + T / 2 - 7, y: c[1] * T + 2, tx: Math.round(F.x) - FARMER.cx + la[0], ty: Math.round(F.y) - FARMER.foot + la[1], t: 0, life: Math.max(1, u ? u.ms - u.t : 100) }); }
    function stepFx(dt) {
      for (var i = S.fx.length - 1; i >= 0; i--) {
        var f = S.fx[i]; f.t += dt;
        if (f.kind !== 'pop') { f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.vz -= 0.00025 * dt; if (f.z < 0) { f.z = 0; f.vz = 0; f.vx *= 0.5; f.vy *= 0.5; } }
        if (f.t >= f.life) S.fx.splice(i, 1);
      }
      if (S.fx.length > 160) S.fx.splice(0, S.fx.length - 160);
    }

    /* ---------- paths (BFS over walkable tiles) and the job driver used by the bot and taps ---------- */
    function bfs() {
      var dist = new Int32Array(COLS * ROWS).fill(-1), prev = new Int32Array(COLS * ROWS).fill(-1), q = [F.cy * COLS + F.cx]; dist[q[0]] = 0;
      for (var h = 0; h < q.length; h++) {
        var i = q[h], x = i % COLS, y = (i / COLS) | 0;
        for (var d = 0; d < 4; d++) { var v = DIRS[DIR_ORDER[d]], nx = x + v[0], ny = y + v[1], j = ny * COLS + nx; if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || dist[j] >= 0 || !walkable(nx, ny)) continue; dist[j] = dist[i] + 1; prev[j] = i; q.push(j); }
      }
      return { dist: dist, prev: prev };
    }
    function firstStep(B, cx, cy) {
      var j = cy * COLS + cx; if (B.dist[j] < 0) return null; var me = F.cy * COLS + F.cx; if (j === me) return null;
      while (B.prev[j] !== me && B.prev[j] >= 0) j = B.prev[j];
      var x = j % COLS, y = (j / COLS) | 0; return x > F.cx ? 'right' : x < F.cx ? 'left' : y > F.cy ? 'down' : 'up';
    }
    // job = {stand: [cx, cy], face: dir, toolIdx | null, seed | null, then: 'ok'}; returns the next key to press, or 'done'
    function drive(job, B) {
      if (job.stand[0] !== F.cx || job.stand[1] !== F.cy) { var st = firstStep(B, job.stand[0], job.stand[1]); return st || 'stuck'; }
      if (job.toolIdx != null && job.toolIdx !== S.toolIdx) return String(job.toolIdx + 1);
      if (job.seed && S.seedId !== job.seed) return 'seed';
      if (F.dir !== job.face) return job.face;
      return job.then || 'ok';
    }
    // the best stand / face / tool for working the target cells with an action
    function planWork(B, targets, action) {
      var best = null, o = actx();
      ORDER.forEach(function (tid, ti) {
        var td = toolDef(TOOLS_, tid); if (!td || td.action !== action) return;
        targets.forEach(function (c) {
          DIR_ORDER.forEach(function (dn) {
            var v = DIRS[dn], sx = c[0] - v[0], sy = c[1] - v[1], j = sy * COLS + sx;
            if (sx < 0 || sy < 0 || sx >= COLS || sy >= ROWS || B.dist[j] < 0) return;
            // the tool's cells from that stand must include the target cell
            var cells = rules.cellsFor(td, sx, sy, dn), hit = 0, useful = 0;
            cells.forEach(function (q) { if (q[0] === c[0] && q[1] === c[1]) hit = 1; var p = plotAt(q[0], q[1]); if (p && rules.useful(p, action, o)) useful++; });
            if (!hit || !useful) return;
            var score = B.dist[j] + (F.dir === dn ? 0 : 0.4) - useful * 3 + ti * 0.01 - (S.botPrev && S.botPrev[0] === sx && S.botPrev[1] === sy && S.botPrev[2] === dn ? 0.9 : 0);
            if (!best || score < best.score - 1e-9) best = { stand: [sx, sy], face: dn, toolIdx: ti, score: score, cell: c, useful: useful };
          });
        });
      });
      return best;
    }
    function spotJob(B, name) {
      var s = spots[name]; if (!s) return null; var best = null;
      DIR_ORDER.forEach(function (dn) { var v = DIRS[dn], sx = s[0] - v[0], sy = s[1] - v[1], j = sy * COLS + sx; if (sx < 0 || sy < 0 || sx >= COLS || sy >= ROWS || B.dist[j] < 0) return; if (!best || B.dist[j] < best.d) best = { stand: [sx, sy], face: dn, d: B.dist[j], then: 'ok', spot: name }; });
      return best;
    }
    function plotsWhere(fn) { var out = []; for (var i = 0; i < S.plots.length; i++) { var p = S.plots[i]; if (p && fn(p)) out.push([p.cx, p.cy]); } return out; }
    function viableSeeds() { var out = [], sid = seasonId(), dl = daysLeft(); for (var id in CROPS_) { var d = cropDef(CROPS_, id); if (d && rules.viable(d, sid, dl)) out.push(id); } return out; }
    function botWantSeed() {
      if (hour() >= 17 || (S.boughtToday || 0) >= P.botBuy) return null;
      var V = viableSeeds(); if (!V.length) return null;
      var held = 0; V.forEach(function (id) { held += S.bag.seeds[id] || 0; });
      var planted = plotsWhere(function (p) { return !!p.crop; }).length, cap = Math.min(P.botPlots, plotsWhere(function () { return true; }).length) - planted;
      if (held >= cap) return null;
      var sid = seasonId(), pick = null, bestV = -1e9;
      V.forEach(function (id) { var d = cropDef(CROPS_, id); if (d.seed > S.gold) return; var fresh = !S.planted[sid + ':' + id] && !(S.bag.seeds[id] > 0); var val = (fresh ? 1e6 : 0) + (d.sell * d.yield - d.seed) / d.days - d.seed * (fresh ? 0.001 : 0); if (val > bestV) { bestV = val; pick = id; } });
      return pick;
    }
    function botJob(B) {
      var o = actx(), h = hour(), late = h >= 23;
      if (late) return spotJob(B, 'bed');
      var ripe = plotsWhere(function (p) { return rules.useful(p, 'harvest', o); });
      if (ripe.length) { var j1 = planWork(B, ripe, 'harvest'); if (j1) return j1; }
      var carry = 0; for (var id in S.bag.crops) carry += S.bag.crops[id] | 0;
      if (carry > 0) { var j2 = spotJob(B, 'bin'); if (j2) return j2; }
      if (botWantSeed()) { var j3 = spotJob(B, 'shop'); if (j3) return j3; }
      if (h >= 18) { var dry0 = plotsWhere(function (p) { return rules.useful(p, 'water', o); }); if (dry0.length) { var jw = planWork(B, dry0, 'water'); if (jw) return jw; } return spotJob(B, 'bed'); }
      var V = viableSeeds(), held = 0, seedId = null; V.forEach(function (id) { var n = S.bag.seeds[id] || 0; held += n; if (n > 0 && !seedId) seedId = id; });
      var empty = plotsWhere(function (p) { return p.tilled && !p.crop; });
      if (held > empty.length) {
        var planted = plotsWhere(function (p) { return !!p.crop; }).length;
        if (planted + empty.length < P.botPlots) { var till = plotsWhere(function (p) { return !p.tilled; }); if (till.length) { var j4 = planWork(B, till, 'till'); if (j4) return j4; } }
      }
      if (held > 0 && empty.length) {
        // plant the freshest seed first (each kind of the season goes in the ground at least once)
        var sid = seasonId(); V.forEach(function (id) { if ((S.bag.seeds[id] || 0) > 0 && !S.planted[sid + ':' + id] && seedId && S.planted[sid + ':' + seedId]) seedId = id; });
        var saved = S.seedId; S.seedId = seedId; var j5 = planWork(B, empty, 'plant'); S.seedId = saved;
        if (j5) { j5.seed = seedId; return j5; }
      }
      var dry = plotsWhere(function (p) { return rules.useful(p, 'water', o); });
      if (dry.length) { var j6 = planWork(B, dry, 'water'); if (j6) return j6; }
      return spotJob(B, 'bed');
    }
    function think(dt) {
      if (S.phase === 'shop') {
        S.botT += dt; if (S.botT < P.botWait || S.keyQ.length) return; S.botT = 0;
        var want = botWantSeed(), L = shopList();
        if (!want) { key('back'); return; }
        var ix = L.indexOf(want); if (ix < 0) { key('back'); return; }
        if (S.shopCur !== ix) key(ix > S.shopCur ? 'down' : 'up'); else key('ok');
        return;
      }
      if (S.phase !== 'play' || busy() || S.keyQ.length || F.lift) { S.botT = 0; return; }
      S.botT += dt; if (S.botT < (S.botStep ? 0 : P.botWait)) return; S.botT = 0;
      var B = bfs(), job = botJob(B); if (!job) return;
      var k2 = drive(job, B); S.botPrev = [job.stand[0], job.stand[1], job.face];
      if (k2 === 'stuck') { S.botStep = false; emit({ kind: 'stuck', job: job.spot || job.cell }); return; }
      S.botStep = !!DIRS[k2] && F.dir === k2;
      key(k2);
    }
    // a tap on a tile: walk there, or work it / use the spot from the nearest side
    function tapCell(cx, cy) {
      if (S.phase === 'night') { key('ok'); return; }
      if (S.phase !== 'play') return;
      cx |= 0; cy |= 0; var sp = spotAt(cx, cy), p = plotAt(cx, cy);
      // a tap on a blocked tile near a spot (the stall's roof, the house) goes to that spot
      if (!sp && !p && !walkable(cx, cy)) { var bd = 3; for (var nm in spots) { var dd = Math.max(Math.abs(spots[nm][0] - cx), Math.abs(spots[nm][1] - cy)); if (dd < bd) { bd = dd; sp = nm; } } }
      if (sp) S.goal = { spot: sp }; else if (p) S.goal = { cell: [cx, cy] }; else if (walkable(cx, cy)) S.goal = { walk: [cx, cy] }; else S.goal = null;
    }
    function goalStep() {
      if (!S.goal || S.phase !== 'play' || busy() || S.keyQ.length) return;
      var B = bfs(), g = S.goal, job = null;
      if (g.spot) job = spotJob(B, g.spot);
      else if (g.walk) { if (g.walk[0] === F.cx && g.walk[1] === F.cy) { S.goal = null; return; } var st = firstStep(B, g.walk[0], g.walk[1]); if (!st) { S.goal = null; return; } key(st); return; }
      else if (g.cell) {
        var t = tool(), best = null;
        DIR_ORDER.forEach(function (dn) { var v = DIRS[dn], sx = g.cell[0] - v[0], sy = g.cell[1] - v[1], j = sy * COLS + sx; if (sx < 0 || sy < 0 || sx >= COLS || sy >= ROWS || B.dist[j] < 0) return; if (!best || B.dist[j] < best.d) best = { stand: [sx, sy], face: dn, d: B.dist[j], then: 'ok' }; });
        job = best;
      }
      if (!job) { S.goal = null; return; }
      var k = drive(job, B);
      if (k === 'stuck') { S.goal = null; return; }
      if (k === 'ok') S.goal = null;
      key(k);
    }

    /* ---------- the fixed step ---------- */
    function update(dt) {
      dt = num(dt, 0); if (!(dt > 0)) return;
      S.clock += dt; S.phaseT += dt;
      if (S.banner && (S.phase === 'play' || S.phase === 'wake' || S.phase === 'shop')) { S.banner.t += dt; if (S.banner.t > 4600) S.banner = null; }
      stepFx(dt);
      if (S.phase === 'end') return;
      if (S.phase === 'sleep') { if (S.phaseT >= 700) night(); return; }
      if (S.phase === 'night') { if (S.phaseT >= P.nightMs) { S.phase = 'wake'; S.phaseT = 0; } while (S.keyQ.length) handleKey(S.keyQ.shift()); if (S.auto) S.keyQ.length = 0; return; }
      if (S.phase === 'wake') { S.keyQ.length = 0; if (S.phaseT >= 600) { S.phase = 'play'; S.phaseT = 0; } return; }
      if (S.auto) think(dt); else goalStep();
      // keys: menu keys at once, moves and actions when the farmer is free
      var guard = 0;
      while (S.keyQ.length && guard++ < 6) { if (handleKey(S.keyQ[0]) === false) break; S.keyQ.shift(); if (S.phase !== 'play') break; }
      if (S.phase === 'play') {
        S.dayT += dt;
        // movement
        if (F.mv) {
          var m = F.mv, ox = F.x, oy = F.y; m.t += dt; var q = clamp(m.t / m.ms, 0, 1);
          F.x = m.fx + (m.tx - m.fx) * q; F.y = m.fy + (m.ty - m.fy) * q; F.walk += Math.abs(F.x - ox) + Math.abs(F.y - oy);
          if (q >= 1) { F.cx = m.cx; F.cy = m.cy; F.mv = null; F.stopT = 0; emit({ kind: 'step', at: [F.cx, F.cy], dir: F.dir }); }
        } else F.stopT += dt;
        if (F.use) {
          var u = F.use; u.t += dt;
          if (!u.applied && u.t >= u.ms * 0.62) { u.applied = true; var hv = applyUse(u); if (hv) F.lift = { crop: hv, t: 0, ms: 420 }; }
          if (u.t >= u.ms) F.use = null;
        } else if (F.lift) { F.lift.t += dt; if (F.lift.t >= F.lift.ms) F.lift = null; }
        // a held direction keeps walking (after the turn delay)
        var hd = heldDir();
        if (hd && !busy() && !F.lift && !S.keyQ.length && !S.auto) {
          if (F.dir !== hd) stepOrTurn(hd); else { F.holdT += dt; if (F.holdT >= P.turnMs || F.stopT < 40) stepOrTurn(hd); }
        } else if (!hd) F.holdT = 0;
        if (S.dayT >= P.dayMs) { S.lastSleep = 'late'; sleep('late'); }
      }
    }

    /* ---------- drawing (world px; the host translates by its camera) ---------- */
    function cropSprite(p) {
      var c = p.crop, d = cropDef(CROPS_, c.id); if (!d) return null;
      var st = rules.stageOf(c, d);
      return { y: p.cy * T + 10, draw: function (ctx) {
        if (typeof d.draw === 'function') { safe(d.draw, [ctx, p.cx * T, p.cy * T, st, { dead: c.dead, ripe: rules.ripe(c, d), stages: d.stages, tile: T }], 'crop.draw'); return; }
        var im = cropCanvas(c.id, d, st, c.dead); if (!im) return;
        var sway = !c.dead && st > 0 ? Math.round(Math.sin(S.clock / 700 + p.cx * 1.7 + p.cy) * 0.6) : 0;
        ctx.drawImage(im, p.cx * T + (T - 16) / 2 + sway * 0, p.cy * T + T - 32);
        if (rules.ripe(c, d) && !c.dead) { var tw = (Math.floor(S.clock / 180) + p.cx * 3 + p.cy) % 14; if (tw < 2) { ctx.fillStyle = '#fffbe0'; ctx.fillRect(p.cx * T + 3 + (p.cx * 5 + p.cy) % 9, p.cy * T - 2 + (p.cy * 3) % 6, 1, 1); } }
      } };
    }
    function drawSoil(ctx) {
      try {
        for (var i = 0; i < S.plots.length; i++) {
          var p = S.plots[i]; if (!p || !p.tilled) continue;
          var t = function (x, y) { var q = plotAt(x, y); return q && q.tilled; };
          var mask = (t(p.cx, p.cy - 1) ? 1 : 0) | (t(p.cx + 1, p.cy) ? 2 : 0) | (t(p.cx, p.cy + 1) ? 4 : 0) | (t(p.cx - 1, p.cy) ? 8 : 0);
          var im = soilCanvas(mask, p.watered, (p.cx * 7 + p.cy * 3) & 3); if (im) ctx.drawImage(im, p.cx * T, p.cy * T);
          if (p.watered && p.crop && !p.crop.dead) { ctx.fillStyle = 'rgba(120,170,220,0.18)'; ctx.fillRect(p.cx * T + 3, p.cy * T + 12, 10, 2); }
        }
        // the work cursor: the tile the farmer faces (only where something can happen)
        if (P.cursor !== 'off' && S.phase === 'play' && !F.mv) {
          var fc = front(), pf = plotAt(fc[0], fc[1]), sp = spotAt(fc[0], fc[1]);
          if (pf || sp) {
            var useful = sp ? true : rules.useful(pf, tool().action, actx()), a = 0.75 + 0.25 * Math.sin(S.clock / 160), x = fc[0] * T, y = fc[1] * T;
            ctx.globalAlpha = a; ctx.fillStyle = useful ? '#fff4c0' : 'rgba(255,255,255,0.55)';
            [[0, 0, 4, 1], [0, 0, 1, 4], [T - 4, 0, 4, 1], [T - 1, 0, 1, 4], [0, T - 1, 4, 1], [0, T - 4, 1, 4], [T - 4, T - 1, 4, 1], [T - 1, T - 4, 1, 4]].forEach(function (r) { ctx.fillRect(x + r[0], y + r[1], r[2], r[3]); });
            ctx.globalAlpha = 1;
          }
        }
      } catch (e) { warn('drawSoil', e); }
    }
    function farmerPose() {
      if (F.use) return F.use.t < F.use.ms * 0.42 ? 'raise' : 'strike';
      if (F.lift) return 'lift';
      return null;
    }
    function farmerFrame() { return F.mv || F.stopT < 40 ? Math.floor(F.walk / 6) & 3 : -1; }
    function drawFarmerAt(ctx, x, y, dir, frame, pose, useDef, lift) { var d = lift && cropDef(CROPS_, lift); drawFarmerFull(ctx, x, y, dir, frame, pose, useDef, d ? d.look : null); }
    function sprites() {
      var out = [];
      for (var i = 0; i < S.plots.length; i++) { var p = S.plots[i]; if (p && p.crop) { var s = cropSprite(p); if (s) out.push(s); } }
      if (S.phase !== 'sleep' && S.phase !== 'night' && S.phase !== 'end' || (S.phase === 'sleep' && S.phaseT < 200)) {
        out.push({ y: F.y, farmer: true, draw: function (ctx) {
          var pose = farmerPose();
          if (typeof opt.drawFarmer === 'function' && safe(opt.drawFarmer, [ctx, { x: F.x, y: F.y, dir: F.dir, frame: farmerFrame(), pose: pose, tool: F.use ? F.use.tool : null, lift: F.lift ? F.lift.crop : null }], 'drawFarmer') === true) return;
          drawFarmerAt(ctx, F.x, F.y, F.dir, farmerFrame(), pose, F.use ? F.use.def : null, F.lift ? F.lift.crop : null);
        } });
      }
      return out;
    }
    function drawFx(ctx) {
      try {
        S.fx.forEach(function (f) {
          var a = 1 - f.t / f.life, X = Math.round(f.x), Y = Math.round(f.y - f.z);
          if (f.kind === 'pop') {
            var q = clamp(f.t / f.life, 0, 1), e = 1 - (1 - q) * (1 - q), x = f.x + (f.tx - f.x) * e, y = f.y + (f.ty - f.y) * e - Math.sin(q * Math.PI) * 6;
            var d = cropDef(CROPS_, f.crop); if (d) { LIFT.n++; drawIcon(ctx, 'crop', Math.round(x), Math.round(y), 14, null, d.look); }
            return;
          }
          ctx.globalAlpha = clamp(a * 1.4, 0, 1);
          if (f.kind === 'water') { ctx.fillStyle = '#bfe6ff'; ctx.fillRect(X, Y, 1, 2); ctx.fillStyle = '#4a9ae0'; ctx.fillRect(X, Y + 2, 1, 1); if (f.z <= 0) { ctx.fillStyle = 'rgba(160,210,255,0.6)'; ctx.fillRect(X - 1, Y + 1, 3, 1); } }
          else if (f.kind === 'dirt') { ctx.fillStyle = '#6e4a2c'; ctx.fillRect(X, Y, 2, 2); ctx.fillStyle = '#a47a4a'; ctx.fillRect(X, Y, 1, 1); }
          else if (f.kind === 'seed') { ctx.fillStyle = '#f0e0a8'; ctx.fillRect(X, Y, 1, 1); }
          else if (f.kind === 'leaf') { ctx.fillStyle = '#7cc256'; ctx.fillRect(X, Y, 2, 1); ctx.fillStyle = '#2c6e34'; ctx.fillRect(X + 1, Y + 1, 1, 1); }
          else if (f.kind === 'chaff') { ctx.fillStyle = '#94703c'; ctx.fillRect(X, Y, 2, 2); ctx.fillStyle = '#c8a46a'; ctx.fillRect(X, Y, 1, 1); }
          else if (f.kind === 'ship') { ctx.fillStyle = '#ffe070'; ctx.fillRect(X, Y - 4, 1, 1); ctx.fillStyle = '#fff8d0'; ctx.fillRect(X, Y - 5, 1, 1); }
          ctx.globalAlpha = 1;
        });
      } catch (e) { warn('drawFx', e); }
    }
    // dusk, night, rain and lamp glows over the world rect r (world px) on the world context
    // the light of the day: a colour the world is multiplied by, keyed by the hour (white until 16:00, warm late
    // afternoon, a red-violet sunset at 18:30, blue night from 20:00); darkness() = 1 - its mean brightness
    var GRADE = [[0, 255, 255, 255], [16, 255, 255, 255], [17.5, 255, 226, 186], [18.5, 236, 164, 138], [19.5, 140, 122, 182], [20.5, 92, 92, 150], [24, 70, 74, 132]];
    function grade() {
      if (P.night === 'off') return [255, 255, 255];
      var h = hour(), i = 1; while (i < GRADE.length - 1 && GRADE[i][0] < h) i++;
      var a = GRADE[i - 1], b = GRADE[i], q = clamp((h - a[0]) / Math.max(0.001, b[0] - a[0]), 0, 1);
      return [0, 1, 2].map(function (k) { return Math.round(a[k + 1] + (b[k + 1] - a[k + 1]) * q); });
    }
    function darkness() { var c = grade(); return 1 - (c[0] + c[1] + c[2]) / 765; }
    function drawSky(ctx, r) {
      try {
        r = r || { x: 0, y: 0, w: COLS * T, h: ROWS * T };
        var dk = darkness(), c = grade(), rain = S.rain[S.day] && S.phase !== 'end';
        ctx.save();
        if (rain) {
          // a grey, cooler, darker day: desaturate, then dim toward slate blue
          ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = 'rgba(128,128,128,0.55)'; ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgb(168,178,200)'; ctx.fillRect(r.x, r.y, r.w, r.h);
        }
        if (c[0] < 255 || c[1] < 255 || c[2] < 255) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgb(' + c.join(',') + ')'; ctx.fillRect(r.x, r.y, r.w, r.h); }
        ctx.globalCompositeOperation = 'source-over';
        if (rain) {
          var t = S.clock;
          for (var i = 0; i < 150; i++) {
            var sx = r.x + ((hsh(i, 1, 5) * (r.w + 40) + t * 0.06) % (r.w + 40)) - 20, sy = r.y + ((hsh(i, 2, 5) * r.h + t * 0.34) % r.h);
            ctx.fillStyle = 'rgba(214,226,255,0.55)'; ctx.fillRect(Math.round(sx), Math.round(sy), 1, 4); ctx.fillStyle = 'rgba(214,226,255,0.3)'; ctx.fillRect(Math.round(sx) - 1, Math.round(sy) + 4, 1, 2);
            if (i % 5 === 0) { var ph = (t / 260 + hsh(i, 3, 5) * 10) % 1, rx = r.x + Math.floor(hsh(i, 4, Math.floor(t / 260 + hsh(i, 3, 5) * 10)) * r.w), ry = r.y + Math.floor(hsh(i, 6, Math.floor(t / 260 + hsh(i, 3, 5) * 10)) * r.h); ctx.fillStyle = 'rgba(220,232,255,' + (0.5 * (1 - ph)).toFixed(2) + ')'; ctx.fillRect(rx - 1 - Math.round(ph * 2), ry, 3 + Math.round(ph * 4), 1); }
          }
        }
        var lit = clamp((dk - 0.12) / 0.4, 0, 1);
        if (lit > 0) {
          // lamp pools: warm light added back where the lamps stand (and a little around the farmer's lantern-lit path)
          ctx.globalCompositeOperation = 'lighter';
          LIGHTS.forEach(function (L, li) {
            var rad = (L[2] || 30) * 1.5, fl = 1 + 0.04 * Math.sin(S.clock / 90 + li * 2), g = ctx.createRadialGradient(L[0], L[1], 1, L[0], L[1], rad * fl);
            g.addColorStop(0, 'rgba(255,196,120,' + (0.55 * lit).toFixed(3) + ')'); g.addColorStop(0.35, 'rgba(255,160,80,' + (0.26 * lit).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,140,60,0)');
            ctx.fillStyle = g; ctx.fillRect(L[0] - rad * 1.1, L[1] - rad * 1.1, rad * 2.2, rad * 2.2);
          });
          var gf = ctx.createRadialGradient(F.x, F.y - 8, 1, F.x, F.y - 8, 22); gf.addColorStop(0, 'rgba(255,220,170,' + (0.16 * lit).toFixed(3) + ')'); gf.addColorStop(1, 'rgba(255,200,150,0)'); ctx.fillStyle = gf; ctx.fillRect(F.x - 24, F.y - 32, 48, 48);
        }
        ctx.restore();
      } catch (e) { warn('drawSky', e); }
    }

    /* ---------- HUD (CSS px; view = {w, h, cam: {x, y, scale}}) ---------- */
    function farmerScreen(view) {
      var c = view && view.cam; if (!c) return null; var s = c.scale || 1;
      return { x: (F.x - 9 - c.x) * s, y: (F.y - 24 - c.y) * s, w: 18 * s, h: 26 * s };
    }
    function layout(view) {
      view = view || { w: 640, h: 360 };
      var W = view.w, H = view.h, narrow = W < 520, m = narrow ? 6 : 10, R = {};
      R.clock = { x: W - m - (narrow ? 156 : 178), y: m, w: narrow ? 156 : 178, h: 84 };
      var n = ORDER.length, s = narrow ? 40 : 46, gap = 4, hw = n * s + (n - 1) * gap + 16;
      R.hotbar = { x: Math.round((W - hw) / 2), y: H - m - (s + 16), w: hw, h: s + 16 };
      R.label = { x: Math.round(W / 2 - (narrow ? 120 : 140)), y: R.hotbar.y - 30, w: narrow ? 240 : 280, h: 26 };
      if (S.phase === 'shop') {
        var L = shopList(), rowH = 40, sw = Math.min(narrow ? W - 2 * m : 330, W - 2 * m), sh = 66 + L.length * rowH + 36, fr = farmerScreen(view);
        var x = Math.round((W - sw) / 2), y = Math.round((H - sh) / 2) - 10;
        if (fr) {
          if (!narrow) { x = fr.x + fr.w / 2 > W / 2 ? m + 6 : W - sw - m - 6; y = clamp(Math.round((H - sh) / 2) - 16, R.clock.y + R.clock.h + 8, Math.max(R.clock.y + R.clock.h + 8, R.label.y - sh - 8)); }
          else {
            var topY = R.clock.y + R.clock.h + 8, botY = R.label.y - 8, above = fr.y - 10 - topY, below = botY - (fr.y + fr.h + 10);
            y = above >= below ? Math.max(topY, fr.y - 10 - sh) : fr.y + fr.h + 10; sh = Math.min(sh, Math.max(above, below)); if (sh < 66 + rowH * 2) sh = Math.max(above, below);
          }
        }
        R.shop = { x: x, y: y, w: sw, h: sh };
      }
      if (S.banner) {
        // the season banner: under the clock on phones, high on wide screens; never over the farmer (then above the label, else beside him)
        var bw = Math.min(W - 2 * m, 320), bx = Math.round((W - bw) / 2), fs = farmerScreen(view), cands = [narrow ? R.clock.y + R.clock.h + 10 : Math.round(H * 0.16)];
        if (fs) cands.push(R.label.y - 8 - 58, Math.round(fs.y + fs.h + 14), Math.round(fs.y - 14 - 58 - 16 * (view.cam.scale || 1)));
        var by = cands[0];
        for (var ci = 0; ci < cands.length; ci++) { var cy0 = cands[ci], r0 = { x: bx, y: cy0, w: bw, h: 58 }; if (cy0 < m || cy0 + 58 > R.label.y - 4) continue; if (narrow && cy0 < R.clock.y + R.clock.h + 6 && bx + bw > R.clock.x) continue; if (fs && r0.x < fs.x + fs.w && fs.x < r0.x + r0.w && r0.y < fs.y + fs.h && fs.y - 16 * (view.cam.scale || 1) < r0.y + r0.h) continue; by = cy0; break; }
        R.banner = { x: bx, y: by, w: bw, h: 58 };
      }
      if (S.phase === 'night' || S.phase === 'end') { var cw = Math.min(W - 2 * m, 340), nl = S.night && S.night.sale ? Math.max(1, Math.min(4, S.night.sale.lines.length)) : 1, ch = 150 + nl * 24 + (S.phase === 'end' ? 0 : 28); R.card = { x: Math.round((W - cw) / 2), y: Math.round((H - ch) / 2), w: cw, h: ch }; }
      return R;
    }
    function uiRects(view) {
      if (P.hud === 'off') return [];
      var R = layout(view), out = [];
      var awake = S.phase === 'play' || S.phase === 'shop' || S.phase === 'wake';
      for (var k in R) { if (k === 'label' && !labelText()) continue; if (k === 'hotbar' && !awake) continue; if (k === 'clock' && S.phase === 'night') continue; out.push({ name: k, x: R[k].x, y: R[k].y, w: R[k].w, h: R[k].h }); }
      return out;
    }
    function labelText() {
      if (S.phase !== 'play') return '';
      var fc = front(), sp = spotAt(fc[0], fc[1]);
      if (sp === 'bin') { var n = 0; for (var id in S.bag.crops) n += S.bag.crops[id] | 0; return n ? 'Z  Ship ' + n + ' crop' + (n > 1 ? 's' : '') : 'Shipping bin: paid at night'; }
      if (sp === 'shop') return 'Z  Buy seeds';
      if (sp === 'bed') return 'Z  Sleep (end the day)';
      var t = tool(); if (!t) return '';
      if (t.action === 'plant') { var d = S.seedId && cropDef(CROPS_, S.seedId), c = S.seedId ? (S.bag.seeds[S.seedId] || 0) : 0; return d ? d.name + ' seeds x' + c + (seedsHeld().length > 1 ? '   Q: next' : '') : 'No seeds: buy at the stall'; }
      return t.name;
    }
    function fmtTime() { var mins = Math.floor((hour() * 60) / 10) * 10, hh = Math.floor(mins / 60) % 24, mm = mins % 60, ap = hh >= 12 ? 'pm' : 'am', h12 = hh % 12 === 0 ? 12 : hh % 12; return h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ap; }
    function fmtGold(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function drawUI(ctx, view) {
      if (P.hud === 'off') return;
      try {
        var R = layout(view), W = view.w, H = view.h, narrow = W < 520, sea = SEAS[seasonIdx(S.day)];
        // fades
        if (S.phase === 'sleep') { ctx.fillStyle = 'rgba(6,6,16,' + clamp(S.phaseT / 650, 0, 1).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
        if (S.phase === 'night') { ctx.fillStyle = '#06060f'; ctx.fillRect(0, 0, W, H); }
        if (S.phase === 'end') { ctx.fillStyle = 'rgba(10,8,20,' + (0.55 * clamp(S.phaseT / 500, 0, 1)).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
        if (S.phase === 'wake') { ctx.fillStyle = 'rgba(6,6,16,' + clamp(1 - S.phaseT / 600, 0, 1).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
        // clock panel
        var c = R.clock;
        if (S.phase !== 'night') {
        panel(ctx, c.x, c.y, c.w, c.h);
        drawIcon(ctx, sea.icon, c.x + 9, c.y + 8, 28, null);
        text(ctx, sea.name + ' ' + dayOfSeason() + '  ' + WEEKDAYS[(S.day - 1) % 7], c.x + 40, c.y + 25, { size: narrow ? 14 : 15, weight: 800, color: '#4a2410', max: c.w - 48 });
        var h = hour(), nightIcon = h >= 19 ? 'moon' : S.rain[S.day] ? 'rain' : 'sun';
        drawIcon(ctx, nightIcon, c.x + 39, c.y + 30, 15, null);
        text(ctx, fmtTime(), c.x + 58, c.y + 43, { size: 13, weight: 700, color: '#5a3418' });
        if (S.rain[S.day]) text(ctx, 'rain', c.x + c.w - 12, c.y + 43, { size: 11, weight: 700, align: 'right', color: '#3a5a8a' });
        // the day bar: 6 am .. midnight
        var bx = c.x + 40, bw = c.w - 52, q = clamp(S.dayT / P.dayMs, 0, 1), by0 = c.y + 49;
        ctx.fillStyle = '#4a2c18'; ctx.fillRect(bx, by0, bw, 5); var gg = ctx.createLinearGradient(bx, 0, bx + bw, 0); gg.addColorStop(0, '#ffd870'); gg.addColorStop(0.6, '#f0a040'); gg.addColorStop(0.78, '#c05a4a'); gg.addColorStop(1, '#3a3a8a'); ctx.fillStyle = gg; ctx.fillRect(bx + 1, by0 + 1, Math.max(0, (bw - 2) * q), 3);
        drawIcon(ctx, 'coin', c.x + 12, c.y + c.h - 29, 20, null);
        text(ctx, fmtGold(S.gold) + ' g', c.x + 40, c.y + c.h - 13, { size: 15, weight: 800, color: '#6a3a08' });
        }
        // hotbar (hidden while the farmer sleeps)
        var hb = R.hotbar, n = ORDER.length, s = narrow ? 40 : 46, awake = S.phase === 'play' || S.phase === 'shop' || S.phase === 'wake';
        if (awake) panel(ctx, hb.x, hb.y, hb.w, hb.h, { border: 4, dark: true });
        for (var i = 0; i < n && awake; i++) {
          var td = toolDef(TOOLS_, ORDER[i]), sx = hb.x + 8 + i * (s + 4), sy = hb.y + 8, sel = i === S.toolIdx;
          ctx.fillStyle = sel ? '#f8e0a0' : '#5a3e2c'; ctx.fillRect(sx - (sel ? 2 : 0), sy - (sel ? 2 : 0), s + (sel ? 4 : 0), s + (sel ? 4 : 0));
          ctx.fillStyle = sel ? '#fff4d0' : '#3a281e'; ctx.fillRect(sx + 2, sy + 2, s - 4, s - 4);
          if (td.action === 'plant' && S.seedId && cropDef(CROPS_, S.seedId)) { var cd = cropDef(CROPS_, S.seedId); drawIcon(ctx, 'seeds', sx + 4, sy + 3, s - 8, cd.look.fruit ? [cd.look.leaf[1], cd.look.fruit[1], cd.look.fruit[2]] : null); }
          else drawIcon(ctx, td.icon, sx + 4, sy + 3, s - 8, td.colors);
          text(ctx, String(i + 1), sx + 4, sy + 13, { size: 11, weight: 800, color: sel ? '#6a3a10' : '#e8d8b8', ow: sel ? 0 : 2.5 });
          if (td.action === 'plant') { var cnt = S.seedId ? (S.bag.seeds[S.seedId] || 0) : 0; text(ctx, 'x' + cnt, sx + s - 4, sy + s - 5, { size: 12, weight: 900, align: 'right', color: '#fff8e8', ow: 3 }); }
        }
        // label / prompt above the hotbar
        var lt = labelText();
        if (lt && S.phase === 'play') { var lb = R.label; ctx.save(); ctx.font = '800 13px ' + FONT; var lw = Math.min(lb.w, ctx.measureText(lt).width + 26); ctx.restore(); var lx = Math.round(W / 2 - lw / 2); ctx.fillStyle = 'rgba(30,18,12,0.82)'; rr(ctx, lx, lb.y, lw, lb.h, 8); ctx.fill(); ctx.strokeStyle = 'rgba(240,200,130,0.6)'; ctx.lineWidth = 1; rr(ctx, lx + 0.5, lb.y + 0.5, lw - 1, lb.h - 1, 8); ctx.stroke(); text(ctx, lt, W / 2, lb.y + 18, { size: 13, weight: 800, align: 'center', color: '#fff2d8', max: lb.w - 16 }); }
        // shop
        if (R.shop) { ctx.save(); ctx.globalAlpha = clamp(S.phaseT / 140, 0, 1); drawShop(ctx, R.shop); ctx.restore(); }
        // season banner (crossfades in and out)
        if (R.banner && S.phase !== 'night') {
          var bb = R.banner, bt = S.banner.t, ba = clamp(bt / 300, 0, 1) * clamp((4600 - bt) / 400, 0, 1), bs = SEAS[seasonIdx(S.day)];
          ctx.save(); ctx.globalAlpha = ba; panel(ctx, bb.x, bb.y, bb.w, bb.h);
          drawIcon(ctx, bs.icon, bb.x + 12, bb.y + 13, 32, null);
          text(ctx, bs.name.toUpperCase() + ' HAS COME', bb.x + 52, bb.y + 26, { size: 17, weight: 900, color: '#4a2410', max: bb.w - 60 });
          text(ctx, S.banner.withered ? S.banner.withered + ' crop' + (S.banner.withered > 1 ? 's' : '') + ' out of season withered' : 'New seeds at the stall', bb.x + 52, bb.y + 45, { size: 12, weight: 700, color: '#7a4a28', max: bb.w - 60 });
          ctx.restore();
        }
        if (R.card) drawCard(ctx, R.card);
      } catch (e) { warn('drawUI', e); }
    }
    function drawShop(ctx, r) {
      panel(ctx, r.x, r.y, r.w, r.h);
      text(ctx, 'Seed Stall', r.x + 16, r.y + 30, { size: 17, weight: 900, color: '#4a2410' });
      text(ctx, SEAS[seasonIdx(S.day)].name + ' seeds', r.x + r.w - 16, r.y + 29, { size: 12, weight: 700, align: 'right', color: '#8a5a30' });
      var L = shopList(), rowH = 40, maxRows = Math.max(1, Math.floor((r.h - 102) / rowH)), first = clamp(S.shopCur - maxRows + 1, 0, Math.max(0, L.length - maxRows));
      for (var i = first; i < Math.min(L.length, first + maxRows); i++) {
        var id = L[i], d = cropDef(CROPS_, id), y = r.y + 44 + (i - first) * rowH, sel = i === S.shopCur, afford = S.gold >= d.seed;
        if (sel) { ctx.fillStyle = 'rgba(190,120,40,0.22)'; rr(ctx, r.x + 10, y, r.w - 20, rowH - 4, 6); ctx.fill(); ctx.strokeStyle = '#b8742c'; ctx.lineWidth = 1.5; rr(ctx, r.x + 10.5, y + 0.5, r.w - 21, rowH - 5, 6); ctx.stroke(); }
        drawIcon(ctx, 'crop', r.x + 16, y + 3, 28, null, d.look);
        text(ctx, d.name, r.x + 50, y + 16, { size: 14, weight: 800, color: '#4a2410', max: r.w - 150 });
        text(ctx, d.days + ' days, sells ' + d.sell + 'g' + (d.regrow ? ', regrows' : ''), r.x + 50, y + 31, { size: 11, weight: 600, color: '#7a5030', max: r.w - 150 });
        text(ctx, d.seed + 'g', r.x + r.w - 62, y + 22, { size: 14, weight: 900, align: 'right', color: afford ? '#6a3a08' : '#b03a2a' });
        text(ctx, 'own ' + (S.bag.seeds[id] || 0), r.x + r.w - 18, y + 22, { size: 11, weight: 700, align: 'right', color: '#7a5030' });
      }
      ctx.fillStyle = 'rgba(90,50,20,0.25)'; ctx.fillRect(r.x + 14, r.y + r.h - 34, r.w - 28, 1);
      drawIcon(ctx, 'coin', r.x + 14, r.y + r.h - 29, 18, null);
      text(ctx, fmtGold(S.gold) + ' g', r.x + 36, r.y + r.h - 15, { size: 13, weight: 800, color: '#6a3a08' });
      text(ctx, 'Z buy   X leave', r.x + r.w - 16, r.y + r.h - 15, { size: 12, weight: 700, align: 'right', color: '#7a5030' });
    }
    function drawCard(ctx, r) {
      var nt = S.night; if (!nt) return;
      var a = S.phase === 'end' ? clamp(S.phaseT / 500, 0, 1) : clamp(S.phaseT / 300, 0, 1);
      ctx.save(); ctx.globalAlpha = a;
      panel(ctx, r.x, r.y, r.w, r.h);
      var sea = SEAS[seasonIdx(nt.day)];
      text(ctx, S.phase === 'end' ? 'The Harvest Fair' : 'Night of ' + sea.name + ' ' + dayOfSeason(nt.day), r.x + r.w / 2, r.y + 34, { size: 18, weight: 900, align: 'center', color: '#4a2410', max: r.w - 24 });
      var y = r.y + 62, lines = nt.sale.lines.slice(0, 4);
      if (!lines.length) { text(ctx, 'Nothing shipped today', r.x + r.w / 2, y + 6, { size: 13, weight: 700, align: 'center', color: '#8a5a30' }); y += 26; }
      lines.forEach(function (ln) { var d = cropDef(CROPS_, ln.crop); if (d) drawIcon(ctx, 'crop', r.x + 22, y - 12, 20, null, d.look); text(ctx, (d ? d.name : ln.crop) + ' x' + ln.n, r.x + 48, y + 3, { size: 13, weight: 800, color: '#4a2410' }); text(ctx, '+' + ln.gold + 'g', r.x + r.w - 22, y + 3, { size: 13, weight: 900, align: 'right', color: '#3a7a1a' }); y += 24; });
      ctx.fillStyle = 'rgba(90,50,20,0.3)'; ctx.fillRect(r.x + 18, y - 6, r.w - 36, 1);
      if (S.phase === 'end') {
        text(ctx, 'Earned this year: ' + fmtGold(S.earned) + 'g', r.x + r.w / 2, y + 14, { size: 14, weight: 900, align: 'center', color: '#6a3a08' });
        var rank = S.earned >= 1200 ? 'Gold ribbon' : S.earned >= 700 ? 'Silver ribbon' : 'Bronze ribbon';
        text(ctx, rank, r.x + r.w / 2, y + 36, { size: 13, weight: 800, align: 'center', color: '#8a4a10' });
      } else {
        text(ctx, 'Sold ' + nt.sale.total + 'g    Gold ' + fmtGold(S.gold) + 'g', r.x + r.w / 2, y + 14, { size: 13, weight: 800, align: 'center', color: '#6a3a08', max: r.w - 24 });
        text(ctx, nt.grew + ' crop' + (nt.grew === 1 ? '' : 's') + ' grew' + (nt.ripe ? ', ' + nt.ripe + ' ripe' : '') + (nt.withered ? ', ' + nt.withered + ' withered' : ''), r.x + r.w / 2, y + 36, { size: 12, weight: 700, align: 'center', color: '#5a3418', max: r.w - 24 });
        var nx = nt.next; text(ctx, 'Tomorrow: ' + SEAS[seasonIdx(nx.day)].name + ' ' + nx.dos + (nt.rain ? ', rain' : ', clear'), r.x + r.w / 2, y + 56, { size: 12, weight: 700, align: 'center', color: '#5a3418', max: r.w - 24 });
        drawIcon(ctx, nt.rain ? 'rain' : 'sun', r.x + r.w / 2 - 12, r.y + r.h - 40, 24, null);
      }
      ctx.restore();
    }

    /* ---------- read-only views ---------- */
    function plotsString() { var s = ''; for (var i = 0; i < S.plots.length; i++) { var p = S.plots[i]; if (!p) continue; s += !p.tilled ? '.' : !p.crop ? (p.watered ? 'w' : 't') : p.crop.dead ? 'x' : String(Math.min(9, p.crop.growth)); } return s; }
    function state() {
      return { phase: S.phase, day: S.day, season: seasonId(), dayOfSeason: dayOfSeason(), hour: +hour().toFixed(2), time: fmtTime(), gold: S.gold, earned: S.earned, rain: !!S.rain[S.day],
        bag: { seeds: copy(S.bag.seeds), crops: copy(S.bag.crops) }, bin: copy(S.bin), tool: ORDER[S.toolIdx], seed: S.seedId, auto: S.auto,
        farmer: { cx: F.cx, cy: F.cy, x: +F.x.toFixed(2), y: +F.y.toFixed(2), dir: F.dir, frame: farmerFrame(), pose: farmerPose(), busy: busy(), walk: +F.walk.toFixed(2) },
        plots: plotsString(), shopCur: S.shopCur, recent: S.recent.slice(-8), ended: S.ended, result: S.result, stats: copy(S.stats), lastDay: S.lastDay };
    }
    function hash() { var s = JSON.stringify([S.day, Math.round(S.clock), S.rain.slice(0, S.day + 1), S.gold, S.earned, plotsString(), S.bag, F.cx, F.cy, F.dir]), h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }
    function actors() {
      var fc = front(), side = F.dir === 'left' || F.dir === 'right', working = !!F.use;
      return [{ id: 'farmer', kind: 'farmer', x: +F.x.toFixed(1), y: +F.y.toFixed(1), facing: side ? F.dir : F.dir, dir: F.dir,
        target: working ? fc[0] * T + T / 2 : null, vx: F.mv ? (F.mv.tx - F.mv.fx) : 0, tile: [F.cx, F.cy], workTile: working ? fc : null,
        noFace: side ? undefined : 'top-down ' + F.dir + ' frame' }];
    }

    var inst = {
      version: VERSION, tile: T, cols: COLS, rows: ROWS, params: P, crops: CROPS_, tools: TOOLS_, toolOrder: ORDER, seasons: SEAS,
      update: update, key: key, setHeld: setHeld, tapCell: tapCell, busy: busy,
      setAuto: function (on) { S.auto = !!on; S.keyQ.length = 0; S.goal = null; S.botT = 0; }, auto: function () { return !!S.auto; },
      reset: function (seed) { var a = S && S.auto; reset(seed); S.auto = a; },
      drawSoil: drawSoil, sprites: sprites, drawFx: drawFx, drawSky: drawSky, drawUI: drawUI, uiRects: uiRects, layout: layout,
      drawWorld: function (ctx) { drawSoil(ctx); sprites().sort(function (a, b) { return a.y - b.y; }).forEach(function (s) { s.draw(ctx); }); drawFx(ctx); },
      state: state, hash: hash, actors: actors, farmer: function () { return F; }, plot: plotAt, plots: function () { return S.plots; }, front: front,
      clock: function () { return { day: S.day, dayT: S.dayT, hour: hour(), season: seasonId(), dayOfSeason: dayOfSeason(), daysLeft: daysLeft(), lastDay: S.lastDay, phase: S.phase, darkness: darkness() }; },
      phase: function () { return S.phase; }, gold: function () { return S.gold; }, bag: function () { return S.bag; },
      addCrop: function (id, def) { CROPS_[id] = def; cropDef(CROPS_, id); return id; },
      addTool: function (id, def) { TOOLS_[id] = def; toolDef(TOOLS_, id); if (ORDER.indexOf(id) < 0) ORDER.push(id); return id; },
      giveSeeds: function (id, n) { S.bag.seeds[id] = (S.bag.seeds[id] || 0) + (n | 0); if (!S.seedId) S.seedId = id; },
      // set a plot directly (demo scenes, a loaded save): {tilled, watered, crop: {id, growth, dead}} or crop: null
      setPlot: function (cx, cy, o) { var p = plotAt(cx, cy); if (!p || !o) return false; if (o.tilled != null) p.tilled = !!o.tilled; if (o.watered != null) p.watered = !!o.watered; if (o.crop !== undefined) p.crop = o.crop ? { id: o.crop.id, growth: o.crop.growth | 0, dead: !!o.crop.dead, day: S.day, harvests: 0 } : null; if (p.crop) p.tilled = true; return true; },
      sleep: function () { sleep('bed'); }, spots: spots, walkable: walkable, darkness: darkness,
      // the raw state for checks (do not write)
      _S: function () { return S; }
    };
    reset();
    return inst;
  }
