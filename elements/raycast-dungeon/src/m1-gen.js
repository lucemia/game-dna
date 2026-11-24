  /* =====================================================================================================
     Floors: a seeded generator (rooms, maze corridors, loops, doors, torches) or a map from data (rows of characters)
     ===================================================================================================== */
  var THEMES = {
    cellar: { name: 'The Root Cellars', wall: 'brick', floor: 'flags', ceil: 'beams', fog: '#120c0a', ambient: 0.16, tint: [1.0, 0.92, 0.82] },
    moss: { name: 'The Moss Halls', wall: 'mossy', floor: 'mossflags', ceil: 'rock', fog: '#08100e', ambient: 0.15, tint: [0.86, 1.0, 0.92] },
    ember: { name: 'The Ember Vault', wall: 'basalt', floor: 'cinder', ceil: 'rock', fog: '#140806', ambient: 0.17, tint: [1.0, 0.86, 0.78] }
  };
  var THEME_ORDER = ['cellar', 'moss', 'ember'];
  function idx(m, x, y) { return y * m.w + x; }
  function cellAt(m, x, y) { return x < 0 || y < 0 || x >= m.w || y >= m.h ? WALL : m.cells[y * m.w + x]; }
  function isSolid(t) { return t !== FLOOR; }          // DOOR is solid until open (checked with the door state)
  function blankMap(w, h) { return { w: w, h: h, cells: new Uint8Array(w * h).fill(WALL), room: new Int16Array(w * h).fill(-1), doors: [], spawns: [], items: [], start: null, stairs: null }; }

  // BFS over walkable cells (floor; doors count as walkable for reachability), from (sx, sy); returns Int32Array of distances (-1 = unreachable)
  function bfs(m, sx, sy, passDoors) {
    var d = new Int32Array(m.w * m.h).fill(-1), q = [sx, sy], h = 0; d[idx(m, sx, sy)] = 0;
    while (h < q.length) {
      var x = q[h++], y = q[h++];
      for (var k = 0; k < 4; k++) {
        var nx = x + DX[k], ny = y + DY[k], t = cellAt(m, nx, ny), i = ny * m.w + nx;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || d[i] >= 0) continue;
        if (t === FLOOR || (passDoors !== false && t === DOOR)) { d[i] = d[idx(m, x, y)] + 1; q.push(nx, ny); }
      }
    }
    return d;
  }

  function generateFloor(seed, floor, floors, P, lib) {
    var r = rng((seed >>> 0) * 31 + floor * 7919 + 17), N = Math.max(11, (Math.round(num(P.size, 19)) | 1)), m = blankMap(N, N), x, y, k, i;
    var themeId = P.themes && P.themes[floor - 1] || THEME_ORDER[(floor - 1) % THEME_ORDER.length];
    m.theme = THEMES[themeId] ? themeId : 'cellar'; m.name = THEMES[m.theme].name; m.floor = floor; m.last = floor >= floors; m.generated = true;
    // 1. rooms on odd coordinates
    var rooms = [], want = Math.max(1, Math.round(num(P.rooms, 5))), tries = 0;
    while (rooms.length < want && tries++ < 200) {
      var rw = 3 + 2 * r.int(0, 1), rh = 3 + 2 * r.int(0, 1), rx = 1 + 2 * r.int(0, (N - rw - 2) >> 1), ry = 1 + 2 * r.int(0, (N - rh - 2) >> 1);
      if (rx + rw > N - 1 || ry + rh > N - 1) continue;
      if (rooms.some(function (o) { return rx < o.x + o.w + 1 && o.x < rx + rw + 1 && ry < o.y + o.h + 1 && o.y < ry + rh + 1; })) continue;
      rooms.push({ x: rx, y: ry, w: rw, h: rh, id: rooms.length });
    }
    rooms.forEach(function (o) { for (var yy = o.y; yy < o.y + o.h; yy++) for (var xx = o.x; xx < o.x + o.w; xx++) { m.cells[idx(m, xx, yy)] = FLOOR; m.room[idx(m, xx, yy)] = o.id; } });
    // 2. maze corridors over the odd cells outside rooms (iterative backtracker)
    var seen = new Uint8Array(N * N);
    for (y = 1; y < N - 1; y += 2) for (x = 1; x < N - 1; x += 2) {
      if (seen[idx(m, x, y)] || m.room[idx(m, x, y)] >= 0) continue;
      var stack = [[x, y]]; seen[idx(m, x, y)] = 1; m.cells[idx(m, x, y)] = FLOOR;
      while (stack.length) {
        var c = stack[stack.length - 1], opts = [];
        for (k = 0; k < 4; k++) { var nx = c[0] + DX[k] * 2, ny = c[1] + DY[k] * 2; if (nx < 1 || ny < 1 || nx > N - 2 || ny > N - 2) continue; if (seen[idx(m, nx, ny)] || m.room[idx(m, nx, ny)] >= 0) continue; opts.push(k); }
        if (!opts.length) { stack.pop(); continue; }
        k = r.pick(opts); var ax = c[0] + DX[k] * 2, ay = c[1] + DY[k] * 2;
        m.cells[idx(m, c[0] + DX[k], c[1] + DY[k])] = FLOOR; m.cells[idx(m, ax, ay)] = FLOOR; seen[idx(m, ax, ay)] = 1; stack.push([ax, ay]);
      }
    }
    // 3. join every separate region (rooms, maze pieces) through single wall cells until one region remains
    function regions() {
      var lab = new Int32Array(N * N).fill(-1), n = 0;
      for (var yy = 0; yy < N; yy++) for (var xx = 0; xx < N; xx++) {
        if (m.cells[idx(m, xx, yy)] !== FLOOR || lab[idx(m, xx, yy)] >= 0) continue;
        var q = [xx, yy], h = 0; lab[idx(m, xx, yy)] = n;
        while (h < q.length) { var qx = q[h++], qy = q[h++]; for (var kk = 0; kk < 4; kk++) { var px = qx + DX[kk], py = qy + DY[kk]; if (cellAt(m, px, py) === FLOOR && lab[idx(m, px, py)] < 0) { lab[idx(m, px, py)] = n; q.push(px, py); } } }
        n++;
      }
      return { lab: lab, n: n };
    }
    for (var guard = 0; guard < 400; guard++) {
      var R = regions(); if (R.n <= 1) break;
      var cand = [];
      for (y = 1; y < N - 1; y++) for (x = 1; x < N - 1; x++) {
        if (m.cells[idx(m, x, y)] !== WALL) continue;
        var a = -1, b = -1;
        if (cellAt(m, x - 1, y) === FLOOR && cellAt(m, x + 1, y) === FLOOR) { a = R.lab[idx(m, x - 1, y)]; b = R.lab[idx(m, x + 1, y)]; }
        else if (cellAt(m, x, y - 1) === FLOOR && cellAt(m, x, y + 1) === FLOOR) { a = R.lab[idx(m, x, y - 1)]; b = R.lab[idx(m, x, y + 1)]; }
        if (a >= 0 && b >= 0 && a !== b && (a === 0 || b === 0)) cand.push([x, y]);
      }
      if (!cand.length) break;
      var pick = r.pick(cand); m.cells[idx(m, pick[0], pick[1])] = FLOOR;
    }
    // 4. trim some dead ends (shorter corridors), then a few loops
    var trim = clamp(num(P.trim, 0.55), 0, 1);
    for (var pass = 0; pass < 6; pass++) {
      for (y = 1; y < N - 1; y++) for (x = 1; x < N - 1; x++) {
        if (m.cells[idx(m, x, y)] !== FLOOR || m.room[idx(m, x, y)] >= 0) continue;
        var open = 0; for (k = 0; k < 4; k++) if (cellAt(m, x + DX[k], y + DY[k]) === FLOOR) open++;
        if (open <= 1 && hash(x, y, seed + floor * 13 + pass) < trim * 0.5) m.cells[idx(m, x, y)] = WALL;
      }
    }
    var loops = clamp(num(P.loops, 0.12), 0, 1);
    for (y = 1; y < N - 1; y++) for (x = 1; x < N - 1; x++) {
      if (m.cells[idx(m, x, y)] !== WALL) continue;
      var hor = cellAt(m, x - 1, y) === FLOOR && cellAt(m, x + 1, y) === FLOOR && cellAt(m, x, y - 1) !== FLOOR && cellAt(m, x, y + 1) !== FLOOR;
      var ver = cellAt(m, x, y - 1) === FLOOR && cellAt(m, x, y + 1) === FLOOR && cellAt(m, x - 1, y) !== FLOOR && cellAt(m, x + 1, y) !== FLOOR;
      if ((hor || ver) && r() < loops * 0.25) m.cells[idx(m, x, y)] = FLOOR;
    }
    // a region split by the dead-end trim is impossible (trim only removes leaves); keep only the region of room 0 anyway
    var start = rooms.length ? { x: rooms[0].x + (rooms[0].w >> 1), y: rooms[0].y + (rooms[0].h >> 1) } : null;
    if (!start) { for (y = 1; y < N - 1 && !start; y++) for (x = 1; x < N - 1; x++) if (m.cells[idx(m, x, y)] === FLOOR) { start = { x: x, y: y }; break; } }
    var D0 = bfs(m, start.x, start.y);
    for (i = 0; i < N * N; i++) if (m.cells[i] === FLOOR && D0[i] < 0) m.cells[i] = WALL;
    // 5. doors in room openings: a floor cell next to a room cell, walls on both sides across the passage
    var doorShare = clamp(num(P.doors, 0.5), 0, 1);
    for (y = 1; y < N - 1; y++) for (x = 1; x < N - 1; x++) {
      if (m.cells[idx(m, x, y)] !== FLOOR || m.room[idx(m, x, y)] >= 0) continue;
      var ew = cellAt(m, x - 1, y) === FLOOR && cellAt(m, x + 1, y) === FLOOR && cellAt(m, x, y - 1) === WALL && cellAt(m, x, y + 1) === WALL;
      var ns = cellAt(m, x, y - 1) === FLOOR && cellAt(m, x, y + 1) === FLOOR && cellAt(m, x - 1, y) === WALL && cellAt(m, x + 1, y) === WALL;
      if (!ew && !ns) continue;
      var nextToRoom = ew ? (m.room[idx(m, x - 1, y)] >= 0 || m.room[idx(m, x + 1, y)] >= 0) : (m.room[idx(m, x, y - 1)] >= 0 || m.room[idx(m, x, y + 1)] >= 0);
      if (nextToRoom && Math.abs(x - start.x) + Math.abs(y - start.y) > 2 && hash(x, y, seed + floor * 29) < doorShare) m.cells[idx(m, x, y)] = DOOR;
    }
    // no two doors side by side
    for (y = 1; y < N - 1; y++) for (x = 1; x < N - 1; x++) if (m.cells[idx(m, x, y)] === DOOR) for (k = 1; k < 3; k++) if (cellAt(m, x + DX[k], y + DY[k]) === DOOR) m.cells[idx(m, x + DX[k], y + DY[k])] = FLOOR;
    // 6. start facing an open side; stairs on a wall beside the farthest cell; boss in the farthest room on the last floor
    var D = bfs(m, start.x, start.y), far = null, farD = -1, farRoom = null, farRoomD = -1;
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      i = idx(m, x, y); if (m.cells[i] !== FLOOR || D[i] < 0) continue;
      var wallSide = -1; for (k = 0; k < 4; k++) if (cellAt(m, x + DX[k], y + DY[k]) === WALL) { wallSide = k; break; }
      if (wallSide >= 0 && D[i] > farD) { farD = D[i]; far = { x: x, y: y, side: wallSide }; }
      if (m.room[i] >= 0 && m.room[i] !== m.room[idx(m, start.x, start.y)] && D[i] > farRoomD) { farRoomD = D[i]; farRoom = { x: x, y: y }; }
    }
    m.start = { x: start.x, y: start.y, dir: 0 };
    var bestRun = -1;   // face the longest open run (never a wall at arrival)
    for (k = 0; k < 4; k++) { var run = 0; while (cellAt(m, start.x + DX[k] * (run + 1), start.y + DY[k] * (run + 1)) === FLOOR && run < 12) run++; if (run > bestRun) { bestRun = run; m.start.dir = k; } }
    if (!m.last && far) { var sx2 = far.x + DX[far.side], sy2 = far.y + DY[far.side]; m.cells[idx(m, sx2, sy2)] = STAIRS; m.stairs = { x: sx2, y: sy2, fx: far.x, fy: far.y }; }
    // 7. torches and banners on walls that face a room or a corridor cell
    var walls = [];
    for (y = 1; y < N - 1; y++) for (x = 1; x < N - 1; x++) {
      if (m.cells[idx(m, x, y)] !== WALL) continue;
      var faces = 0, roomFace = false; for (k = 0; k < 4; k++) { var t2 = cellAt(m, x + DX[k], y + DY[k]); if (t2 === FLOOR) { faces++; if (m.room[idx(m, x + DX[k], y + DY[k])] >= 0) roomFace = true; } }
      if (faces) walls.push({ x: x, y: y, room: roomFace, h: hash(x, y, seed + floor * 41) });
    }
    walls.sort(function (a, b) { return (b.room - a.room) || (a.h - b.h); });
    var torchN = Math.max(2, Math.round(num(P.torches, 1) * (rooms.length * 1.6 + 3))), placed = [];
    walls.forEach(function (wl) {
      if (placed.length >= torchN) return;
      if (placed.some(function (p) { return Math.abs(p.x - wl.x) + Math.abs(p.y - wl.y) < 4; })) return;
      if (m.stairs && Math.abs(m.stairs.x - wl.x) + Math.abs(m.stairs.y - wl.y) < 2) return;
      m.cells[idx(m, wl.x, wl.y)] = TORCH; placed.push(wl);
    });
    var banners = 0; walls.forEach(function (wl) { if (banners < 2 + floor && wl.room && m.cells[idx(m, wl.x, wl.y)] === WALL && wl.h > 0.82) { m.cells[idx(m, wl.x, wl.y)] = BANNER; banners++; } });
    // 8. monsters by budget (never within 4 steps of the start), items, the boss
    D = bfs(m, start.x, start.y);
    var free = [];
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) { i = idx(m, x, y); if (m.cells[i] === FLOOR && D[i] >= 0) free.push({ x: x, y: y, d: D[i], h: hash(x, y, seed * 3 + floor) }); }
    free.sort(function (a, b) { return a.h - b.h; });
    var used = {}; used[start.x + ',' + start.y] = 1; if (m.stairs) used[m.stairs.fx + ',' + m.stairs.fy] = 1;
    function take(minD) { for (var j = 0; j < free.length; j++) { var f = free[j]; if (f.d >= minD && !used[f.x + ',' + f.y]) { used[f.x + ',' + f.y] = 1; return f; } } return null; }
    if (m.last && farRoom) { used[farRoom.x + ',' + farRoom.y] = 1; m.spawns.push({ x: farRoom.x, y: farRoom.y, boss: true }); }
    var nMon = Math.round((3 + floor * 1.5) * clamp(num(P.density, 1), 0, 3));
    for (k = 0; k < nMon; k++) { var f2 = take(5); if (f2) m.spawns.push({ x: f2.x, y: f2.y }); }
    var nIt = Math.round((3 + floor) * clamp(num(P.loot, 1), 0, 3));
    for (k = 0; k < nIt; k++) { var f3 = take(2); if (f3) m.items.push({ x: f3.x, y: f3.y }); }
    m.rooms = rooms;
    return m;
  }

  // a floor from data: {name, theme, rows: ['#####', '#^.e#', ...], legend: {char: {enemy: id} | {item: id}}}
  // '#' wall, 'T' torch wall, 'B' banner wall, 'D' door, 'S' stair arch, '.' floor, '^ > v <' start and facing,
  // 'e' a monster (picked by floor), 'i' an item (picked by floor), 'K' the boss; any other char via legend (on floor)
  function parseMap(def, floor, floors) {
    var rows = (def && def.rows) || [], h = rows.length + 2, w = 2 + rows.reduce(function (a, s) { return Math.max(a, String(s).length); }, 0);
    var m = blankMap(w, h), legend = (def && def.legend) || {};
    m.theme = def && THEMES[def.theme] ? def.theme : THEME_ORDER[(floor - 1) % THEME_ORDER.length];
    m.name = (def && def.name) || THEMES[m.theme].name; m.floor = floor; m.last = def && def.last != null ? !!def.last : floor >= floors; m.generated = false;
    rows.forEach(function (s, ry) {
      s = String(s);
      for (var rx = 0; rx < s.length; rx++) {
        var ch = s.charAt(rx), x = rx + 1, y = ry + 1, i = idx(m, x, y), L = legend[ch];
        if (ch === '#' || ch === ' ') continue;
        if (ch === 'T') { m.cells[i] = TORCH; continue; }
        if (ch === 'B') { m.cells[i] = BANNER; continue; }
        if (ch === 'D') { m.cells[i] = DOOR; continue; }
        if (ch === 'S') { m.cells[i] = STAIRS; m.stairs = { x: x, y: y }; continue; }
        m.cells[i] = FLOOR;
        var sd = '^>v<'.indexOf(ch); if (sd >= 0) m.start = { x: x, y: y, dir: sd };
        if (ch === 'e') m.spawns.push({ x: x, y: y });
        if (ch === 'K') m.spawns.push({ x: x, y: y, boss: true });
        if (ch === 'i') m.items.push({ x: x, y: y });
        if (L && L.enemy) m.spawns.push({ x: x, y: y, kind: L.enemy });
        if (L && L.item) m.items.push({ x: x, y: y, kind: L.item });
      }
    });
    if (!m.start) { for (var j = 0; j < m.cells.length; j++) if (m.cells[j] === FLOOR) { m.start = { x: j % w, y: Math.floor(j / w), dir: 1 }; break; } }
    if (m.stairs) { for (var k = 0; k < 4; k++) { var fx = m.stairs.x + DX[k], fy = m.stairs.y + DY[k]; if (cellAt(m, fx, fy) === FLOOR) { m.stairs.fx = fx; m.stairs.fy = fy; break; } } }
    m.rooms = [];
    return m;
  }

