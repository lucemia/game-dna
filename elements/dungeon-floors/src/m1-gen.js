
  /* =====================================================================================================
     Content tables (all plain data; a host adds or overrides entries through create({rooms, monsters, items}))
     ===================================================================================================== */
  // Room types. weight / minFloor / maxFloor / maxPerFloor pick them; floor = a floor style ('flag' | 'tile' | 'brick' |
  // 'moss') or {base, light, dark, gap}; decor = [[kind, density]] (kind = a built-in decor id or a function
  // (ctx, x, y, tMs, v) drawing one 16 px cell at x, y); budget scales the monster budget; chest = chance of a chest;
  // light = a colour that tints the room's torch light; feature = 'fountain' (bump: heal to full once).
  var ROOMS = {
    hall: { name: 'Hall', weight: 4, floor: 'flag', decor: [['rubble', 0.035], ['bones', 0.02], ['moss', 0.05], ['cobweb', 1]], budget: 1, chest: 0.12 },
    crypt: { name: 'Crypt', weight: 2.2, floor: 'tile', decor: [['urn', 0.06], ['bones', 0.05], ['candles', 0.03], ['cobweb', 1]], budget: 1.15, chest: 0.25, light: '#9ab8ff' },
    store: { name: 'Storeroom', weight: 2, floor: 'brick', decor: [['crate', 0.09], ['barrel', 0.07], ['rubble', 0.02]], budget: 0.8, chest: 0.45 },
    flooded: { name: 'Flooded cell', weight: 1.4, minFloor: 2, floor: 'moss', decor: [['puddle', 0.16], ['moss', 0.12], ['rubble', 0.02]], budget: 1, chest: 0.1, light: '#7ad8c8' },
    shrine: { name: 'Shrine', weight: 1, minFloor: 2, maxPerFloor: 1, floor: 'tile', decor: [['candles', 0.06]], budget: 0, chest: 0, feature: 'fountain', light: '#a8e8ff' },
    lair: { name: 'Lair', weight: 1, minFloor: 3, floor: 'flag', decor: [['bones', 0.1], ['rubble', 0.05], ['cobweb', 1]], budget: 1.7, chest: 0.6, light: '#ff9a6a' }
  };
  // Monsters. look = a built-in look ('slime' hops, 'ember' hops (a slime crowned with flame), 'bat' flies, 'spore' hops, 'wisp' glides, 'crown' glides) or
  // draw(ctx, x, footY, o) with o = {t, facing, frame, flash, scale}; palette = {main, light, dark, eye} overrides the look's
  // colours; speed 1 = one action per turn, 2 = two, 0.5 = every other turn; erratic = chance of a random step; cost =
  // budget points; minFloor / maxFloor = where it can be placed; boss: true = only the last floor's throne room.
  var MONSTERS = {
    slime: { name: 'Bog Slime', look: 'slime', hp: 9, atk: 3, def: 0, xp: 3, speed: 1, sight: 6, cost: 2, minFloor: 1, maxFloor: 3 },
    bat: { name: 'Cave Bat', look: 'bat', hp: 6, atk: 2, def: 0, xp: 2, speed: 2, erratic: 0.4, sight: 7, cost: 2, minFloor: 1, maxFloor: 4 },
    spore: { name: 'Sporeling', look: 'spore', hp: 14, atk: 4, def: 1, xp: 5, speed: 0.5, sight: 5, cost: 3, minFloor: 2 },
    wisp: { name: 'Lantern Wisp', look: 'wisp', hp: 12, atk: 5, def: 1, xp: 6, speed: 1, sight: 8, cost: 4, minFloor: 3 },
    ember: { name: 'Ember Slime', look: 'ember', hp: 18, atk: 6, def: 1, xp: 8, speed: 1, sight: 6, cost: 5, minFloor: 4 },
    crown: { name: 'The Hollow Crown', look: 'crown', hp: 64, atk: 8, def: 2, xp: 0, speed: 1, sight: 10, cost: 99, boss: true, size: 1.4 }
  };
  // Items. look = 'potion' | 'coins' | 'scroll' | 'shard' | 'heart' (or draw(ctx, x, y, tMs)); color tints potion / shard;
  // effect = {heal, gold, reveal, atk, def, maxHp}; carry: true = goes to the bag (potions: key 'potion' drinks one);
  // weight = chance in chests and on the floor; minFloor / maxFloor; loose: false = only in chests.
  var ITEMS = {
    potion: { name: 'Red Tonic', look: 'potion', color: '#e8364a', effect: { heal: 16 }, carry: true, weight: 5 },
    coins: { name: 'Gold', look: 'coins', effect: { gold: 12 }, weight: 6 },
    scroll: { name: 'Scroll of Sight', look: 'scroll', effect: { reveal: true }, weight: 1.2, minFloor: 2, loose: false },
    shard: { name: 'Ember Shard', look: 'shard', color: '#ff8a3a', effect: { atk: 1 }, weight: 1.4, loose: false },
    heart: { name: 'Heart Crystal', look: 'heart', color: '#ff5a7a', effect: { maxHp: 6, heal: 6 }, weight: 1.2, loose: false }
  };
  var DEFAULTS = {
    floors: 5, width: 46, height: 34, rooms: 10, loops: 0.25, doors: 0.6, density: 1, chests: 1, light: 6.5, fog: 'on',
    minimap: 'on', numbers: 'on', moveMs: 120, heroHp: 30, heroAtk: 5, heroDef: 1, potions: 1
  };
  var DECOR_BLOCK = { crate: 1, barrel: 1, urn: 1 };

  /* =====================================================================================================
     Floor generator: generate({seed, floor, floors, params, rooms, monsters, items}) -> floor (plain data)
     ===================================================================================================== */
  function eligible(def, floor, isLast) { return (def.minFloor || 1) <= floor && (def.maxFloor == null || def.maxFloor >= floor) && !(def.boss && !isLast); }
  function generate(o) {
    o = o || {};
    var P = o.params || DEFAULTS, floorNo = o.floor || 1, floors = o.floors || P.floors || 5, isLast = floorNo >= floors;
    var LIB = { rooms: o.rooms || ROOMS, monsters: o.monsters || MONSTERS, items: o.items || ITEMS };
    var seed = ((o.seed >>> 0) * 2654435761 + floorNo * 97531) >>> 0, R = rng(seed);
    var W = clamp(Math.round(num(P.width, 46)), 24, 96), H = clamp(Math.round(num(P.height, 34)), 18, 72);
    var tiles = new Uint8Array(W * H), rid = new Int16Array(W * H).fill(-1), corr = new Uint8Array(W * H);
    var at = function (x, y) { return x < 0 || y < 0 || x >= W || y >= H ? ROCK : tiles[y * W + x]; };
    var set = function (x, y, v) { if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = v; };
    // 1. rooms: random rectangles (interior w 4-10, h 3-7) with at least 3 cells of rock between interiors
    var rooms = [], want = clamp(Math.round(num(P.rooms, 10)), 3, 30), tries = 0;
    while (rooms.length < want && tries++ < 900) {
      var w = R.int(4, 10), h = R.int(3, 7);
      if (isLast && rooms.length === 0) { w = 9; h = 6; }
      var x = R.int(2, W - w - 2), y = R.int(3, H - h - 2), ok = true;
      for (var i = 0; i < rooms.length && ok; i++) { var q = rooms[i]; if (x < q.x + q.w + 3 && x + w + 3 > q.x && y < q.y + q.h + 3 && y + h + 3 > q.y) ok = false; }
      if (!ok) continue;
      rooms.push({ id: rooms.length, x: x, y: y, w: w, h: h, cx: x + (w - 1) / 2, cy: y + (h - 1) / 2, doors: [] });
    }
    rooms.forEach(function (r) { for (var yy = r.y; yy < r.y + r.h; yy++) for (var xx = r.x; xx < r.x + r.w; xx++) { set(xx, yy, FLOOR); rid[yy * W + xx] = r.id; } });
    // 2. graph: minimum spanning tree over room centres (Prim), plus loops among each room's 3 nearest neighbours
    var n = rooms.length, d2 = function (a, b) { var dx = a.cx - b.cx, dy = (a.cy - b.cy) * 1.3; return dx * dx + dy * dy; };
    var inT = [true], mst = [], loops = [], has = {};
    for (var k = 1; k < n; k++) inT.push(false);
    for (k = 1; k < n; k++) {
      var best = null;
      for (var a = 0; a < n; a++) if (inT[a]) for (var b = 0; b < n; b++) if (!inT[b]) { var dd = d2(rooms[a], rooms[b]); if (!best || dd < best[2]) best = [a, b, dd]; }
      inT[best[1]] = true; mst.push([best[0], best[1]]); has[Math.min(best[0], best[1]) + ',' + Math.max(best[0], best[1])] = 1;
    }
    var loopP = clamp(num(P.loops, 0.25), 0, 1);
    for (a = 0; a < n; a++) {
      var near = []; for (b = 0; b < n; b++) if (b !== a) near.push([b, d2(rooms[a], rooms[b])]);
      near.sort(function (p, q2) { return p[1] - q2[1]; });
      near.slice(0, 3).forEach(function (e) { var key = Math.min(a, e[0]) + ',' + Math.max(a, e[0]); if (has[key]) return; if (R() < loopP * 0.5) { has[key] = 1; loops.push([a, e[0]]); } });
    }
    // 3. corridors: A* between door cells on facing walls, 4-way, avoiding every room's wall ring, straight runs preferred
    var ring = new Uint8Array(W * H);
    rooms.forEach(function (r) { for (var yy = r.y - 1; yy <= r.y + r.h; yy++) for (var xx = r.x - 1; xx <= r.x + r.w; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) ring[yy * W + xx] = 1; });
    var doors = [];
    function doorOn(r, side, toward) {
      // reuse a door already on this side within 3 cells of the wanted spot; else a new one >= 2 cells from other doors
      var horiz = side === 'n' || side === 's', lo = horiz ? r.x : r.y, hi = horiz ? r.x + r.w - 1 : r.y + r.h - 1;
      var want2 = clamp(Math.round(toward), lo, hi), c, bestD = null;
      r.doors.forEach(function (dd2) { if (dd2.side === side && Math.abs(dd2.p - want2) <= 3 && (!bestD || Math.abs(dd2.p - want2) < Math.abs(bestD.p - want2))) bestD = dd2; });
      if (bestD) return bestD;
      var cands = [];
      for (c = lo; c <= hi; c++) if (!r.doors.some(function (dd2) { return dd2.side === side && Math.abs(dd2.p - c) < 2; })) cands.push(c);
      if (!cands.length) return null;
      cands.sort(function (p, q2) { return Math.abs(p - want2) - Math.abs(q2 - want2) || p - q2; });
      var p = cands[Math.min(cands.length - 1, R.int(0, 1))];
      var dx = side === 'e' ? 1 : side === 'w' ? -1 : 0, dy = side === 's' ? 1 : side === 'n' ? -1 : 0;
      var cx = horiz ? p : side === 'e' ? r.x + r.w : r.x - 1, cy = horiz ? (side === 's' ? r.y + r.h : r.y - 1) : p;
      var dobj = { room: r.id, side: side, p: p, x: cx, y: cy, ox: cx + dx, oy: cy + dy };
      if (dobj.ox < 1 || dobj.oy < 1 || dobj.ox >= W - 1 || dobj.oy >= H - 1) return null;
      r.doors.push(dobj); return dobj;
    }
    function sides(a2, b2) {
      var dx = b2.cx - a2.cx, dy = (b2.cy - a2.cy) * 1.3, out = [];
      if (Math.abs(dx) >= Math.abs(dy)) out.push(dx > 0 ? ['e', 'w'] : ['w', 'e'], dy > 0 ? ['s', 'n'] : ['n', 's']);
      else out.push(dy > 0 ? ['s', 'n'] : ['n', 's'], dx > 0 ? ['e', 'w'] : ['w', 'e']);
      return out;
    }
    function astar(sx, sy, tx, ty) {
      var N = W * H, gS = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), dirA = new Int8Array(N).fill(-1), open = [], closed = new Uint8Array(N);
      var s0 = sy * W + sx, t0 = ty * W + tx; gS[s0] = 0; open.push([Math.abs(sx - tx) + Math.abs(sy - ty), s0]);
      while (open.length) {
        var bi = 0; for (var j = 1; j < open.length; j++) if (open[j][0] < open[bi][0] || (open[j][0] === open[bi][0] && open[j][1] < open[bi][1])) bi = j;
        var cur = open[bi][1]; open[bi] = open[open.length - 1]; open.pop();
        if (closed[cur]) continue; closed[cur] = 1;
        if (cur === t0) break;
        var cx = cur % W, cy = (cur / W) | 0;
        for (var dI = 0; dI < 4; dI++) {
          var nx = cx + DIRS4[dI][0], ny = cy + DIRS4[dI][1];
          if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
          var ni = ny * W + nx; if (closed[ni]) continue;
          if (ring[ni] && ni !== t0) continue;
          var cost = (corr[ni] ? 0.45 : 1) + (dirA[cur] >= 0 && dirA[cur] !== dI ? 0.8 : 0) + hash(nx, ny, seed) * 0.15;
          var ng = gS[cur] + cost;
          if (ng < gS[ni]) { gS[ni] = ng; from[ni] = cur; dirA[ni] = dI; open.push([ng + Math.abs(nx - tx) + Math.abs(ny - ty), ni]); }
        }
      }
      if (from[t0] < 0 && s0 !== t0) return null;
      var path = [], c2 = t0; while (c2 !== -1) { path.push(c2); if (c2 === s0) break; c2 = from[c2]; }
      return path.reverse();
    }
    var failed = 0;
    function connect(ai, bi2) {
      var A = rooms[ai], B = rooms[bi2], opts = sides(A, B);
      for (var t2 = 0; t2 < opts.length; t2++) {
        var sa = opts[t2][0], sb = opts[t2][1];
        var horizA = sa === 'n' || sa === 's', horizB = sb === 'n' || sb === 's';
        var da = doorOn(A, sa, horizA ? B.cx : B.cy), db = doorOn(B, sb, horizB ? A.cx : A.cy);
        if (!da || !db) continue;
        ring[da.oy * W + da.ox] = 0; ring[db.oy * W + db.ox] = 0;
        var path = astar(da.ox, da.oy, db.ox, db.oy);
        if (!path) continue;
        path.forEach(function (ci) { tiles[ci] = FLOOR; corr[ci] = 1; });
        [da, db].forEach(function (dd) { if (tiles[dd.y * W + dd.x] !== DOOR) { set(dd.x, dd.y, DOOR); dd.carved = true; } });
        return true;
      }
      failed++; return false;
    }
    mst.forEach(function (e) { connect(e[0], e[1]); });
    loops.forEach(function (e) { connect(e[0], e[1]); });
    // drop doors that a later corridor did not use (a door must lead somewhere): no floor outside
    // 4. walls: every rock cell next to (8-way) a non-rock cell
    var walls = [];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      if (tiles[y * W + x] !== ROCK) continue;
      for (var d8 = 0; d8 < 8; d8++) { var t3 = at(x + DIRS8[d8][0], y + DIRS8[d8][1]); if (t3 !== ROCK && t3 !== WALL) { tiles[y * W + x] = WALL; walls.push([x, y]); break; } }
    }
    // 5. door kinds: a real door (blocks sight until opened) or an open arch; the cell outside a door is never a door
    var doorList = [];
    for (i = 0; i < W * H; i++) if (tiles[i] === DOOR) {
      var dx0 = i % W, dy0 = (i / W) | 0, vert = at(dx0, dy0 - 1) === WALL && at(dx0, dy0 + 1) === WALL;
      var isDoor = R() < clamp(num(P.doors, 0.6), 0, 1);
      if (!isDoor) tiles[i] = FLOOR;
      doorList.push({ x: dx0, y: dy0, axis: vert ? 'v' : 'h', door: isDoor, open: !isDoor });
    }
    // 6. start and stairs: the start room is random; stairs go in the room farthest (walking distance) from it
    var start = rooms[isLast ? 1 % n : R.int(0, n - 1)];
    var dist = bfs(tiles, W, H, Math.round(start.cx), Math.round(start.cy), true);
    var far = null; rooms.forEach(function (r) { if (r === start) return; var dd = dist[Math.round(r.cy) * W + Math.round(r.cx)]; if (dd >= 0 && (!far || dd > far.d)) far = { r: r, d: dd }; });
    var goal = isLast ? rooms[0] : (far ? far.r : rooms[(start.id + 1) % n]);
    // room types
    var typeIds = Object.keys(LIB.rooms), counts = {};
    rooms.forEach(function (r) {
      if (r === start) { r.type = 'hall'; r.start = true; return; }
      if (isLast && r === goal) { r.type = 'throne'; return; }
      var tid = weighted(R, typeIds, function (id) { var d = LIB.rooms[id]; if (!eligible(d, floorNo, isLast)) return 0; if (d.maxPerFloor != null && (counts[id] || 0) >= d.maxPerFloor) return 0; return num(d.weight, 1); }) || 'hall';
      counts[tid] = (counts[tid] || 0) + 1; r.type = tid;
    });
    // occupied cells: door fronts (inside and outside of every door / arch), the start spot and the stairs stay free
    var busy = new Uint8Array(W * H), keepFree = new Uint8Array(W * H);
    doorList.forEach(function (dd) { DIRS4.forEach(function (v) { var xx = dd.x + v[0], yy = dd.y + v[1]; if (xx >= 0 && yy >= 0 && xx < W && yy < H) keepFree[yy * W + xx] = 1; }); keepFree[dd.y * W + dd.x] = 1; });
    var sx = Math.round(start.cx), sy = Math.round(start.cy);
    keepFree[sy * W + sx] = 1; busy[sy * W + sx] = 1;
    var stairs = null;
    if (!isLast) {
      var sc = [];
      for (y = goal.y + 1; y < goal.y + goal.h - 1; y++) for (x = goal.x + 1; x < goal.x + goal.w - 1; x++) if (!keepFree[y * W + x]) sc.push([x, y]);
      if (!sc.length) for (y = goal.y; y < goal.y + goal.h; y++) for (x = goal.x; x < goal.x + goal.w; x++) if (!keepFree[y * W + x]) sc.push([x, y]);
      var sp = sc.length ? sc[R.int(0, sc.length - 1)] : [Math.round(goal.cx), Math.round(goal.cy)];
      stairs = { x: sp[0], y: sp[1] }; set(sp[0], sp[1], STAIRS); busy[sp[1] * W + sp[0]] = 1; keepFree[sp[1] * W + sp[0]] = 1;
      DIRS8.forEach(function (v) { keepFree[(sp[1] + v[1]) * W + sp[0] + v[0]] = 1; });
    }
    function freeCells(r, edgeOnly) {
      var out = [];
      for (var yy = r.y; yy < r.y + r.h; yy++) for (var xx = r.x; xx < r.x + r.w; xx++) {
        var ii = yy * W + xx; if (busy[ii] || keepFree[ii] || tiles[ii] !== FLOOR) continue;
        if (edgeOnly && !(xx === r.x || yy === r.y || xx === r.x + r.w - 1 || yy === r.y + r.h - 1)) continue;
        out.push([xx, yy]);
      }
      return out;
    }
    function take(list) { if (!list.length) return null; var j = R.int(0, list.length - 1), c = list[j]; list.splice(j, 1); busy[c[1] * W + c[0]] = 1; return c; }
    // 7. features, chests, loose items, decor, torches, monsters
    var features = [], chests = [], items = [], decor = [], torches = [], monsters = [];
    var itemIds = Object.keys(LIB.items);
    function loot(inChest) { return weighted(R, itemIds, function (id) { var d = LIB.items[id]; if (!eligible(d, floorNo, false)) return 0; if (!inChest && d.loose === false) return 0; return num(d.weight, 1); }); }
    rooms.forEach(function (r) {
      var def = LIB.rooms[r.type] || {};
      if (r.type === 'throne') { [0, -1, 1].some(function (dx) { var tx = Math.round(r.cx) + dx, ty = r.y; if (keepFree[ty * W + tx] || busy[ty * W + tx]) return false; busy[ty * W + tx] = 1; features.push({ x: tx, y: ty, kind: 'throne', used: false, room: r.id }); return true; }); }
      if (def.feature === 'fountain') { var fc = [Math.round(r.cx), Math.round(r.cy)]; if (!keepFree[fc[1] * W + fc[0]] && !busy[fc[1] * W + fc[0]]) { busy[fc[1] * W + fc[0]] = 1; features.push({ x: fc[0], y: fc[1], kind: 'fountain', used: false, room: r.id }); } }
      if (r.start || r.type === 'throne') return;
      var chance = num(def.chest, 0.15) * num(P.chests, 1);
      while (chance > 0) {
        if (R() < Math.min(1, chance)) { var top = freeCells(r, true).filter(function (c) { return c[1] === r.y; }); var cc = take(top.length ? top : freeCells(r, true)); if (cc) chests.push({ x: cc[0], y: cc[1], item: loot(true), open: false, room: r.id }); }
        chance -= 1;
      }
      if (R() < 0.3) { var lc = take(freeCells(r)); if (lc) items.push({ x: lc[0], y: lc[1], item: loot(false), room: r.id }); }
    });
    // every floor holds at least one chest
    if (!chests.length) { var rr2 = rooms.filter(function (r) { return !r.start && r.type !== 'throne'; })[0]; var cc2 = rr2 && take(freeCells(rr2, true)); if (cc2) chests.push({ x: cc2[0], y: cc2[1], item: loot(true), open: false, room: rr2.id }); }
    rooms.forEach(function (r) {
      var def = LIB.rooms[r.type] || LIB.rooms.hall || {};
      (def.decor || []).forEach(function (dc) {
        var kind = dc[0], dens = num(dc[1], 0.05);
        if (kind === 'cobweb') { [[r.x, r.y], [r.x + r.w - 1, r.y]].forEach(function (c) { if (!busy[c[1] * W + c[0]] && R() < 0.5) decor.push({ x: c[0], y: c[1], kind: 'cobweb', v: R(), flat: true, room: r.id, corner: c[0] === r.x ? 'l' : 'r' }); }); return; }
        var block = typeof kind === 'string' ? !!DECOR_BLOCK[kind] : !!dc[2];
        var cells = freeCells(r, block), cnt = Math.round(r.w * r.h * dens + R() * 0.6);
        for (var j = 0; j < cnt && cells.length; j++) { var c = take(cells); if (!c) break; decor.push({ x: c[0], y: c[1], kind: kind, v: R(), block: block, room: r.id }); if (!block) busy[c[1] * W + c[0]] = 0; }
      });
      // torches on the room's north wall face (a wall cell with the room floor right below it), about every 4 cells
      for (var xx = r.x + 1; xx < r.x + r.w - 1; xx += 1) if ((xx - r.x) % 4 === 1 && at(xx, r.y - 1) === WALL && at(xx, r.y) === FLOOR) torches.push({ x: xx, y: r.y - 1, room: r.id, light: def.light || null });
    });
    // blocking decor must never cut the floor apart or wall off a chest, item or the stairs: drop offenders
    for (var pass = 0; pass < 40; pass++) {
      var blockAt = new Uint8Array(W * H); decor.forEach(function (dc) { if (dc.block) blockAt[dc.y * W + dc.x] = 1; }); chests.forEach(function (c) { blockAt[c.y * W + c.x] = 1; }); features.forEach(function (f) { blockAt[f.y * W + f.x] = 1; });
      var dm = bfs(tiles, W, H, sx, sy, true, blockAt), bad = -1;
      for (i = 0; i < W * H && bad < 0; i++) if ((tiles[i] === FLOOR || tiles[i] === DOOR || tiles[i] === STAIRS) && !blockAt[i] && dm[i] < 0) bad = i;
      var unreach = function (c) { return !DIRS8.some(function (v) { var ii = (c.y + v[1]) * W + c.x + v[0]; return dm[ii] >= 0; }); };
      var badThing = chests.concat(features).filter(unreach)[0];
      // and inside every room the free cells stay connected (4-way), so no room is split by its own crates
      if (bad < 0 && !badThing) rooms.some(function (r) {
        var seen = {}, first = null, cnt = 0, tot = 0, yy, xx;
        for (yy = r.y; yy < r.y + r.h; yy++) for (xx = r.x; xx < r.x + r.w; xx++) if (!blockAt[yy * W + xx]) { tot++; if (!first) first = [xx, yy]; }
        if (!first) return false;
        var st = [first]; seen[first[0] + ',' + first[1]] = 1;
        while (st.length) { var c = st.pop(); cnt++; DIRS4.forEach(function (v) { var nx = c[0] + v[0], ny = c[1] + v[1]; if (nx < r.x || ny < r.y || nx >= r.x + r.w || ny >= r.y + r.h || seen[nx + ',' + ny] || blockAt[ny * W + nx]) return; seen[nx + ',' + ny] = 1; st.push([nx, ny]); }); }
        if (cnt === tot) return false;
        for (yy = r.y; yy < r.y + r.h && !badThing; yy++) for (xx = r.x; xx < r.x + r.w; xx++) if (!blockAt[yy * W + xx] && !seen[xx + ',' + yy]) { badThing = { x: xx, y: yy }; break; }
        return true;
      });
      if (bad < 0 && !badThing) break;
      var bx = bad >= 0 ? bad % W : badThing.x, by = bad >= 0 ? (bad / W) | 0 : badThing.y, bestJ = -1, bestD2 = 1e9;
      decor.forEach(function (dc, j) { if (!dc.block) return; var q3 = (dc.x - bx) * (dc.x - bx) + (dc.y - by) * (dc.y - by); if (q3 < bestD2) { bestD2 = q3; bestJ = j; } });
      if (bestJ < 0) break; busy[decor[bestJ].y * W + decor[bestJ].x] = 0; decor.splice(bestJ, 1);
    }
    // monsters: a budget per room (area x density x room budget x depth), spent on eligible kinds; never in the start room
    var monIds = Object.keys(LIB.monsters), density = num(P.density, 1);
    rooms.forEach(function (r) {
      var def = LIB.rooms[r.type] || {};
      if (r.start) return;
      if (r.type === 'throne') {
        var bossId = monIds.filter(function (id) { return LIB.monsters[id].boss; })[0];
        var bc = [Math.round(r.cx), r.y + 1]; if (bossId) { busy[bc[1] * W + bc[0]] = 1; monsters.push({ kind: bossId, x: bc[0], y: bc[1], room: r.id, boss: true }); }
        r.budget = 6 * density;
      } else r.budget = r.w * r.h * 0.085 * density * num(def.budget, 1) * (1 + 0.18 * (floorNo - 1));
      var left = r.budget, cells = freeCells(r);
      for (var guard = 0; guard < 20 && left > 0.5 && cells.length; guard++) {
        var id = weighted(R, monIds, function (mid) { var md = LIB.monsters[mid]; if (md.boss || !eligible(md, floorNo, isLast)) return 0; if (num(md.cost, 2) > left + 0.75) return 0; return 1 + (floorNo - (md.minFloor || 1)) * 0.0; });
        if (!id) break;
        var c = take(cells); if (!c) break;
        left -= num(LIB.monsters[id].cost, 2);
        monsters.push({ kind: id, x: c[0], y: c[1], room: r.id });
      }
    });
    return { seed: o.seed >>> 0, floor: floorNo, floors: floors, last: isLast, w: W, h: H, tiles: tiles, room: rid, corridor: corr,
      rooms: rooms.map(function (r) { return { id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, cx: r.cx, cy: r.cy, type: r.type, start: !!r.start, budget: r.budget || 0 }; }),
      doors: doorList, start: { x: sx, y: sy, room: start.id }, stairs: stairs, goal: goal.id, chests: chests, items: items, decor: decor, torches: torches,
      features: features, monsters: monsters, edges: { mst: mst, loops: loops }, failed: failed };
  }
  // breadth-first walking distance from (x, y): 8-way without corner cutting when diag, doors passable; block = extra blockers
  function bfs(tiles, W, H, x, y, diag, block) {
    var d = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H), qh = 0, qt = 0, s = y * W + x;
    d[s] = 0; q[qt++] = s;
    var pass = function (i) { var t = tiles[i]; return (t === FLOOR || t === DOOR || t === STAIRS) && !(block && block[i]); };
    while (qh < qt) {
      var c = q[qh++], cx = c % W, cy = (c / W) | 0;
      for (var k = 0; k < (diag ? 8 : 4); k++) {
        var v = diag ? DIRS8[k] : DIRS4[k], nx = cx + v[0], ny = cy + v[1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var ni = ny * W + nx; if (d[ni] >= 0 || !pass(ni)) continue;
        if (v[0] && v[1]) { var a = cy * W + nx, b = ny * W + cx; if (!pass(a) || !pass(b) || tiles[c] === DOOR || tiles[ni] === DOOR) continue; }
        d[ni] = d[c] + 1; q[qt++] = ni;
      }
    }
    return d;
  }
  // field of view: recursive shadowcasting over 8 octants; opaque(x, y) -> bool; marks vis[y * W + x] = 1
  function fov(W, H, ox, oy, radius, opaque, vis) {
    vis[oy * W + ox] = 1;
    var M = [[1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1], [-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1]];
    function cast(row, s0, e0, xx, xy, yx, yy) {
      if (s0 < e0) return;
      var nextStart = s0;
      for (var j = row; j <= radius; j++) {
        var dx = -j - 1, dy = -j, blocked = false;
        while (dx <= 0) {
          dx++;
          var X = ox + dx * xx + dy * xy, Y = oy + dx * yx + dy * yy, lS = (dx - 0.5) / (dy + 0.5), rS = (dx + 0.5) / (dy - 0.5);
          if (s0 < rS) continue; else if (e0 > lS) break;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          if (dx * dx + dy * dy <= radius * radius + radius) vis[Y * W + X] = 1;
          if (blocked) { if (opaque(X, Y)) { nextStart = rS; continue; } else { blocked = false; s0 = nextStart; } }
          else if (opaque(X, Y) && j < radius) { blocked = true; cast(j + 1, s0, lS, xx, xy, yx, yy); nextStart = rS; }
        }
        if (blocked) break;
      }
    }
    for (var o = 0; o < 8; o++) cast(1, 1, 0, M[o][0], M[o][1], M[o][2], M[o][3]);
  }
