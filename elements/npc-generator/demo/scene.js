/* D-03 npc-generator demo: the little town the demo page draws (and the node checks drive without a canvas).
 * Pure logic, no drawing, ASCII only. One global: GameDNA_NpcGenDemo.make(GameDNA_NpcGen, opts) -> sim.
 * One clock: sim.step() advances 1000/60 ms: the traveller's script (or the player's keys), the town's wandering folk and the
 * talk / register timers. Nothing reads the wall clock or Math.random, and nothing depends on the view size.
 * Setting (original): the market square of a river town on a fair morning; a mapmaker walks round and meets the townsfolk,
 * then opens the town register (everyone's name and trade).
 */
(function (root) {
  'use strict';
  var T = 16, COLS = 30, ROWS = 21, STEP = 1000 / 60, END = 33000, SPEED = 44;
  var REG_OPEN = 23200, REG_MS = 5600;

  /* ---------- the map (pixel-kit chars) ---------- */
  function buildRows() {
    var m = [], r, c;
    var hs = function (x, y, s) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; };
    for (r = 0; r < ROWS; r++) { m.push([]); for (c = 0; c < COLS; c++) { var n = hs(c, r, 5); m[r].push(n > 0.8 ? ',' : n < 0.12 ? ':' : '.'); } }
    var rect = function (c0, r0, c1, r1, ch) { for (var y = r0; y <= r1; y++) for (var x = c0; x <= c1; x++) if (x >= 0 && y >= 0 && x < COLS && y < ROWS) m[y][x] = ch; };
    rect(4, 6, 25, 14, 'c');                                          // the market square
    rect(0, 10, 3, 11, 'p'); rect(26, 9, COLS - 1, 10, 'p'); rect(13, 15, 14, ROWS - 1, 'p'); rect(8, 3, 8, 5, 'p'); rect(21, 3, 21, 5, 'p');
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      var edge = Math.min(r, c, ROWS - 1 - r, COLS - 1 - c), ch = m[r][c];
      if (ch === 'c' || ch === 'p') continue;
      if (edge < 1 || r > 17 || (r > 15 && hs(c, r, 8) < 0.45) || (r < 2 && hs(c, r, 6) < 0.5)) m[r][c] = hs(c, r, 9) < 0.3 ? 'P' : 'T';
    }
    [[2, 7], [27, 6], [2, 14], [27, 13], [10, 16], [18, 16]].forEach(function (q) { m[q[1]][q[0]] = 'u'; });
    [[1, 12], [28, 12], [7, 16], [20, 16]].forEach(function (q) { m[q[1]][q[0]] = 'F'; });
    return m.map(function (rw) { return rw.join(''); });
  }
  var ROWS_STR = buildRows();
  var PROPS = [
    { k: 'house', x: 5 * T + 8, y: 5 * T + 12, o: { roof: 'thatch', wall: 'timber' } }, { k: 'house', x: 11 * T + 8, y: 5 * T + 12, o: { roof: 'red', wall: 'plaster' } },
    { k: 'house', x: 24 * T, y: 5 * T + 12, o: { roof: 'slate', wall: 'stone' } },
    { k: 'stall', x: 16 * T + 8, y: 6 * T + 14 }, { k: 'barrel', x: 18 * T + 10, y: 6 * T + 12 }, { k: 'crate', x: 19 * T + 10, y: 6 * T + 13 }, { k: 'banner', x: 14 * T + 2, y: 6 * T + 6 },
    { k: 'well', x: 10 * T + 8, y: 10 * T + 10 }, { k: 'statue', x: 19 * T + 8, y: 10 * T + 6 },
    { k: 'lantern', x: 5 * T + 4, y: 8 * T + 2 }, { k: 'lantern', x: 25 * T - 4, y: 8 * T + 2 },
    { k: 'bench', x: 15 * T, y: 14 * T + 4 }, { k: 'bench', x: 23 * T, y: 14 * T + 4 },
    { k: 'flowers', x: 5 * T + 8, y: 14 * T + 6 }, { k: 'sack', x: 20 * T + 8, y: 7 * T + 2 }
  ];
  /* foot boxes of the props nobody may stand in (x, y, w, h in world px) */
  var SOLIDS = [
    { id: 'stall', x: 16 * T + 8 - 17, y: 6 * T + 4, w: 34, h: 11 }, { id: 'barrel', x: 18 * T + 4, y: 6 * T + 6, w: 12, h: 7 }, { id: 'crate', x: 19 * T + 3, y: 6 * T + 6, w: 14, h: 8 },
    { id: 'sack', x: 20 * T + 3, y: 6 * T + 14, w: 11, h: 5 }, { id: 'well', x: 10 * T - 3, y: 10 * T - 2, w: 23, h: 17 }, { id: 'statue', x: 19 * T - 1, y: 10 * T - 4, w: 18, h: 14 },
    { id: 'lantern', x: 5 * T - 4, y: 8 * T - 12, w: 17, h: 32 }, { id: 'lantern2', x: 25 * T - 12, y: 8 * T - 12, w: 17, h: 32 },
    { id: 'bench', x: 15 * T - 8, y: 14 * T - 2, w: 17, h: 7 }, { id: 'bench2', x: 23 * T - 8, y: 14 * T - 2, w: 17, h: 7 }, { id: 'flowers', x: 5 * T + 1, y: 14 * T, w: 15, h: 7 }
  ];
  /* the props' drawn boxes in world px (for checks) */
  var PROP_SIZE = { well: [18, 17, 9], statue: [12, 19, 6], lantern: [7, 17, 3], bench: [16, 7, 8], stall: [34, 30, 17], barrel: [10, 11, 5], crate: [12, 11, 6], sack: [10, 8, 5], banner: [12, 26, 6], flowers: [14, 8, 7] };
  var PROP_BOXES = PROPS.filter(function (p) { return PROP_SIZE[p.k]; }).map(function (p) { var b = PROP_SIZE[p.k]; return { x: p.x - b[2], y: p.y - b[1], w: b[0], h: b[1] }; });
  var AREA = { x: 4 * T + 4, y: 7 * T + 6, w: 22 * T - 8, h: 8 * T - 10 };   // where townsfolk wander (the square)
  function inSolid(x, y) { for (var i = 0; i < SOLIDS.length; i++) { var b = SOLIDS[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id; } return null; }
  /* a foot box (8 x 4 centred on the feet) against the props */
  function footBlocked(x, y) { return !!(inSolid(x - 4, y - 4) || inSolid(x + 4, y - 4) || inSolid(x - 4, y) || inSolid(x + 4, y) || inSolid(x, y - 2)); }

  /* the traveller's round: meet three townsfolk (the one nearest each point when it sets out), then open the register */
  var MEET = [{ at: 2600, near: [8 * T, 12 * T], ms: 3200 }, { at: 9200, near: [18 * T, 9 * T], ms: 3200 }, { at: 15800, near: [15 * T, 12 * T], ms: 3200 }];
  var ENTER = [[1 * T, 10 * T + 12], [5 * T + 8, 10 * T + 12]];

  function make(NG, opts) {
    opts = opts || {};
    var seed = opts.seed == null ? 7 : opts.seed, count = opts.count == null ? 10 : Math.max(3, Math.min(14, opts.count | 0)), auto = opts.auto !== false;
    /* the player: a mapmaker in a teal coat and a mustard cap; the town keeps look-alikes of the player out of the crowd */
    var travSpec = NG.normalize(Object.assign(NG.make('traveller-mapmaker', { role: 'mapmaker', age: 'adult' }), { top: 'coat', topColor: 'teal', head: 'cap', accColor: 'mustard', hair: 'short', extra: 'satchel', bottom: 'trousers', bottomColor: 'charcoal' }));
    var town = NG.town({ seed: seed, count: count, area: AREA, blocked: function (x, y) { return !!inSolid(x, y); }, speed: opts.speed || 20, stride: 4, avoid: [travSpec] });
    var trav = { id: 'traveller', npc: NG.create(travSpec, { params: { stride: 4 } }),
      x: ENTER[0][0], y: ENTER[0][1], dir: 'right', moving: false, walk: 0, plan: 0, meet: -1, target: null, talkT: -1, wait: 0, stuck: 0 };
    var sim = { clock: 0, town: town, trav: trav, auto: auto, events: [], keys: {}, seed: seed, count: count, T: T, END: END, talking: null,
      register: { open: false, t0: 0 }, met: [], lastTalk: null, byeT: -1e9 };

    function canStand(x, y, self) {
      if (x - 4 < AREA.x - 3 * T || x + 4 > AREA.x + AREA.w + 3 * T || y - 4 < AREA.y - 2 || y > AREA.y + AREA.h + 2) {
        // outside the square only the west road (the way in)
        if (!(y > 9 * T + 8 && y < 12 * T && x > 0 && x < AREA.x + 8)) return false;
      }
      if (footBlocked(x, y)) return false;
      for (var i = 0; i < town.folk.length; i++) { var f = town.folk[i]; if (f === self) continue; if (Math.abs(f.x - x) < 13.5 && Math.abs(f.y - y) < 21.5) return false; }
      return true;
    }
    /* 4-direction walking toward (tx, ty): the y axis first unless it is blocked; returns true on arrival */
    function walkTo(a, tx, ty, dt, ignore) {
      var step = SPEED * dt / 1000, dx = tx - a.x, dy = ty - a.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) { a.x = tx; a.y = ty; a.stuck = 0; return true; }
      var tryAxis = function (ax) {
        if (ax === 'y' && Math.abs(dy) >= 0.5) { var my = Math.sign(dy) * Math.min(step, Math.abs(dy)); if (canStand(a.x, a.y + my + Math.sign(dy) * Math.min(2, Math.abs(dy) - Math.abs(my)), ignore)) { a.y += my; a.dir = dy > 0 ? 'down' : 'up'; a.walk += Math.abs(my); return true; } }
        if (ax === 'x' && Math.abs(dx) >= 0.5) { var mx = Math.sign(dx) * Math.min(step, Math.abs(dx)); if (canStand(a.x + mx + Math.sign(dx) * Math.min(2, Math.abs(dx) - Math.abs(mx)), a.y, ignore)) { a.x += mx; a.dir = dx > 0 ? 'right' : 'left'; a.walk += Math.abs(mx); return true; } }
        return false;
      };
      var first = a.stuck > 30 ? 'x' : 'y';
      if (tryAxis(first) || tryAxis(first === 'y' ? 'x' : 'y')) { a.moving = true; a.stuck = 0; return false; }
      a.moving = false; a.stuck++;
      return false;
    }
    /* path finding on a 4 px grid round the props and the townsfolk: a distance field from the goal (re-made every 0.5 s or
       when someone steps in the way); the walker follows falling distance and keeps its heading when it can, so it turns rarely */
    var G = 4, GW = Math.ceil(COLS * T / G), GH = Math.ceil(ROWS * T / G), NB = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
    function field(goal, ignore) {
      var dist = new Int32Array(GW * GH).fill(-1), gx = Math.round(goal[0] / G), gy = Math.round(goal[1] / G), q = [gy * GW + gx];
      dist[q[0]] = 0;
      for (var h = 0; h < q.length; h++) {
        var k = q[h], cx = k % GW, cy = (k / GW) | 0;
        for (var d in NB) { var nx = cx + NB[d][0], ny = cy + NB[d][1]; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue; var n = ny * GW + nx; if (dist[n] !== -1) continue;
          if (!canStand(nx * G, ny * G, ignore)) { dist[n] = -2; continue; } dist[n] = dist[k] + 1; q.push(n); }
      }
      return dist;
    }
    /* grid-locked steps: from one 4 px cell centre to the next, so the heading only changes on a cell centre (no jitter) */
    function stepTo(a, tx, ty, dt) {
      var step = SPEED * dt / 1000, dx = tx - a.x, dy = ty - a.y;
      if (Math.abs(dy) > 1e-6) { var my = Math.sign(dy) * Math.min(step, Math.abs(dy)); a.y += my; a.dir = dy > 0 ? 'down' : 'up'; a.walk += Math.abs(my); }
      else if (Math.abs(dx) > 1e-6) { var mx = Math.sign(dx) * Math.min(step, Math.abs(dx)); a.x += mx; a.dir = dx > 0 ? 'right' : 'left'; a.walk += Math.abs(mx); }
      a.moving = true;
      return Math.abs(tx - a.x) < 1e-6 && Math.abs(ty - a.y) < 1e-6;
    }
    function followPath(a, goal, dt) {
      if (!a.field || a.replan-- <= 0 || a.stuck > 30) { a.field = field(goal, null); a.replan = 30; if (a.stuck > 30) a.next = null; a.stuck = 0; }
      if (a.final || (Math.abs(a.x - goal[0]) <= G && Math.abs(a.y - goal[1]) <= G)) {   // the last few px: the longer axis, then the other
        if (!a.final) { a.next = null; var xf = canStand(goal[0], a.y, a.target), yf = canStand(a.x, goal[1], a.target);   // the corner it passes must be free
          a.final = xf && (!yf || Math.abs(goal[0] - a.x) >= Math.abs(goal[1] - a.y)) ? 'x' : yf ? 'y' : 'xy'; }
        var fx = a.final === 'x' && Math.abs(goal[0] - a.x) > 1e-6 ? [goal[0], a.y] : a.final === 'y' && Math.abs(goal[1] - a.y) > 1e-6 ? [a.x, goal[1]] : goal;
        stepTo(a, fx[0], fx[1], dt);
        if (Math.abs(a.x - goal[0]) < 1e-6 && Math.abs(a.y - goal[1]) < 1e-6) { a.final = null; a.moving = false; a.next = null; return true; }
        return false;
      }
      if (a.next) {
        if (!canStand(a.next[0], a.next[1], null)) { a.moving = false; a.stuck++; return false; }   // someone in the way: wait half a second, then go round
        if (stepTo(a, a.next[0], a.next[1], dt)) a.next = null;
        return false;
      }
      var F = a.field, cx = Math.round(a.x / G), cy = Math.round(a.y / G);
      if (!(F[cy * GW + cx] >= 0)) [[Math.floor(a.x / G), Math.floor(a.y / G)], [Math.ceil(a.x / G), Math.floor(a.y / G)], [Math.floor(a.x / G), Math.ceil(a.y / G)], [Math.ceil(a.x / G), Math.ceil(a.y / G)]]
        .forEach(function (c) { if (!(F[cy * GW + cx] >= 0) && F[c[1] * GW + c[0]] >= 0) { cx = c[0]; cy = c[1]; } });
      var here = F[cy * GW + cx];
      if (Math.abs(a.x - cx * G) > 1e-6 || Math.abs(a.y - cy * G) > 1e-6) { a.next = [cx * G, cy * G]; if (stepTo(a, a.next[0], a.next[1], dt)) a.next = null; return false; }   // onto the grid first
      if (here < 0) {   // the cell it stands on counts as taken (someone close): step to the best free neighbour, or wait
        var bn = null, bv = 1e9; for (var dd in NB) { var nv = F[(cy + NB[dd][1]) * GW + cx + NB[dd][0]]; if (nv >= 0 && nv < bv) { bv = nv; bn = NB[dd]; } }
        if (!bn) { a.moving = false; a.stuck++; return false; }
        a.next = [(cx + bn[0]) * G, (cy + bn[1]) * G]; if (stepTo(a, a.next[0], a.next[1], dt)) a.next = null; return false;
      }
      var best = null, order = [a.dir].concat(['right', 'left', 'down', 'up'].filter(function (d) { return d !== a.dir; }));
      for (var i = 0; i < 4; i++) { var v = NB[order[i]], n = F[(cy + v[1]) * GW + cx + v[0]]; if (n >= 0 && n < here) { best = v; break; } }
      if (!best) { a.moving = false; a.stuck++; return false; }
      a.next = [(cx + best[0]) * G, (cy + best[1]) * G];
      if (stepTo(a, a.next[0], a.next[1], dt)) a.next = null;
      return false;
    }
    function spotBeside(f) {
      var side = trav.x <= f.x ? -1 : 1, c = [[f.x + side * 16, f.y], [f.x - side * 16, f.y], [f.x, f.y + 24], [f.x, f.y - 24]];
      for (var i = 0; i < c.length; i++) if (canStand(c[i][0], c[i][1], f) && !footBlocked(c[i][0], c[i][1])) return c[i];
      return c[0];
    }
    function travScript(dt) {
      var a = trav;
      if (a.plan === 0) { if (walkTo(a, ENTER[1][0], ENTER[1][1], dt)) a.plan = 1; return; }
      if (a.talkT >= 0) {
        a.talkT += dt; a.moving = false;
        var M = MEET[a.meet];
        if (a.talkT >= M.ms) { sim.lastTalk = a.target; sim.byeT = sim.clock; sim.lastFocus = sim.focus ? sim.focus(sim.lastTalk) : null; town.release(a.target); sim.events.push({ t: Math.round(sim.clock), kind: 'bye', id: a.target.id }); a.target = null; a.spot = null; a.talkT = -1; sim.talking = null; }
        return;
      }
      var next = MEET[a.meet + 1];
      if (!a.target && next && sim.clock >= next.at) {
        a.meet++;
        var f = town.nearest(next.near[0], next.near[1], 9999, sim.met);
        if (f) { a.target = f; a.spot = spotBeside(f); town.talk(f, a, 0, { at: { x: a.spot[0], y: a.spot[1] } }); sim.met.push(f.id); sim.events.push({ t: Math.round(sim.clock), kind: 'notice', id: f.id }); }
      }
      if (a.target) {
        var s = a.spot || spotBeside(a.target);
        if (followPath(a, s, dt) || (Math.abs(a.x - s[0]) < 1 && Math.abs(a.y - s[1]) < 1)) {
          a.dir = Math.abs(a.target.x - a.x) >= Math.abs(a.target.y - a.y) ? (a.target.x > a.x ? 'right' : 'left') : (a.target.y > a.y ? 'down' : 'up');
          a.talkT = 0; a.moving = false; a.final = null; a.next = null; a.field = null; town.talk(a.target, a, 0); /* again on arrival: the talk (and its panel) starts */ sim.talking = a.target; sim.events.push({ t: Math.round(sim.clock), kind: 'talk', id: a.target.id, with: a.target.spec.name });
        }
        return;
      }
      a.moving = false;
      if (!next && a.meet >= MEET.length - 1) { a.dir = 'down'; }
      if (sim.clock >= REG_OPEN && !sim.register.open && !sim.register.done) { sim.register.open = true; sim.register.t0 = sim.clock; sim.events.push({ t: Math.round(sim.clock), kind: 'register' }); }
      if (sim.register.open && sim.clock >= sim.register.t0 + REG_MS) { sim.register.open = false; sim.register.done = true; sim.register.t1 = sim.clock; sim.events.push({ t: Math.round(sim.clock), kind: 'register-closed' }); }
    }
    function playerControl(dt) {
      var a = trav, k = sim.keys;
      if (sim.talking && a.talkT >= 0) a.talkT += dt;   // the talk clock (camera, panel) runs in live play too
      if (sim.register.open) { a.moving = false; return; }
      if (sim.goto) {
        var gf = a.target;
        if (!gf || sim.clock > sim.goto.t0 + 25000) { if (gf) town.release(gf); a.target = null; a.spot = null; sim.goto = null; a.moving = false; return; }
        var gs = a.spot || spotBeside(gf);
        if (followPath(a, gs, dt) || (Math.abs(a.x - gs[0]) < 1 && Math.abs(a.y - gs[1]) < 1)) { sim.goto = null; a.final = null; a.next = null; a.field = null; sim.talkTo(gf); }
        return;
      }
      var mx = (k.right ? 1 : 0) - (k.left ? 1 : 0), my = (k.down ? 1 : 0) - (k.up ? 1 : 0);
      if (mx && my) my = 0;
      if (!mx && !my) { a.moving = false; return; }
      if (sim.talking) { sim.lastTalk = sim.talking; sim.byeT = sim.clock; sim.lastFocus = sim.focus ? sim.focus(sim.lastTalk) : null; town.release(sim.talking); sim.talking = null; a.talkT = -1; a.target = null; a.spot = null; }
      if (!walkTo(a, a.x + mx * 6, a.y + my * 6, dt)) { if (!a.moving) a.dir = mx > 0 ? 'right' : mx < 0 ? 'left' : my > 0 ? 'down' : 'up'; }
    }
    sim.step = function () {
      var dt = STEP;
      sim.clock += dt;
      if (opts.live != null && !sim.liveDone && sim.clock >= opts.live) {   // ?live=<ms>: a player takes over and taps the nearest person (mid-talk: keeps talking)
        sim.liveDone = true; sim.takeOver(); if (!sim.talking) { var lf = town.nearest(trav.x, trav.y, 9999); if (lf) sim.tap(lf); }
      }
      if (sim.auto) travScript(dt); else playerControl(dt);
      town.update(dt, trav);
    };
    sim.runTo = function (ms) { while (sim.clock + STEP / 2 < ms) sim.step(); };
    sim.takeOver = function () { if (sim.auto) { sim.auto = false; trav.moving = false; if (trav.target && trav.target !== sim.talking) { town.release(trav.target); trav.target = null; trav.spot = null; } if (sim.register.open) { sim.register.open = false; sim.register.t1 = sim.clock; } } };
    /* Z: talk to whoever stands in front of the traveller (or close the register / end the talk) */
    sim.talkKey = function () {
      if (sim.register.open) { sim.register.open = false; sim.register.t1 = sim.clock; return 'register-closed'; }
      if (sim.talking) { sim.lastTalk = sim.talking; sim.byeT = sim.clock; sim.lastFocus = sim.focus ? sim.focus(sim.lastTalk) : null; town.release(sim.talking); sim.talking = null; trav.talkT = -1; trav.target = null; trav.spot = null; return 'bye'; }
      // the person in front: along the facing 4-30 px ahead (side views) / 4-34 px (up, down), at most 8 / 10 px off the line
      var V = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] }[trav.dir], f = null, bd = 1e9;
      town.folk.forEach(function (q) { var dx = q.x - trav.x, dy = q.y - trav.y, al = dx * V[0] + dy * V[1], off = Math.abs(V[0] ? dy : dx);
        if (al >= 4 && al <= (V[0] ? 30 : 34) && off <= (V[0] ? 8 : 10) && al + off < bd) { bd = al + off; f = q; } });
      if (!f) return null;
      trav.dir = Math.abs(f.x - trav.x) >= Math.abs(f.y - trav.y) ? (f.x > trav.x ? 'right' : 'left') : (f.y > trav.y ? 'down' : 'up'); trav.moving = false;
      town.talk(f, trav, 0); sim.talking = f; trav.target = f; trav.talkT = 0; trav.meet = Math.min(trav.meet, MEET.length - 1); sim.events.push({ t: Math.round(sim.clock), kind: 'talk', id: f.id, with: f.spec.name });
      return f.id;
    };
    /* a tap on a person: next to the traveller -> talk; farther -> the person waits (turned to the traveller) and the traveller
       walks there with the autopilot's path finder, then the talk starts (the same code path as the autopilot's meetings) */
    sim.tap = function (f) {
      if (sim.talking) sim.talkKey();
      var tdx = Math.abs(f.x - trav.x), tdy = Math.abs(f.y - trav.y);
      if ((tdx <= 30 && tdy <= 8) || (tdy <= 34 && tdx <= 8)) { sim.talkTo(f); return 'talk'; }   // next to them on one axis: talk; otherwise walk to the spot beside them
      if (trav.target && trav.target !== f) town.release(trav.target);
      trav.spot = spotBeside(f); town.talk(f, trav, 0, { at: { x: trav.spot[0], y: trav.spot[1] } }); trav.target = f; trav.field = null; trav.next = null; trav.final = null; sim.goto = { id: f.id, t0: sim.clock };
      sim.events.push({ t: Math.round(sim.clock), kind: 'walk-to', id: f.id }); return 'walk';
    };
    sim.talkTo = function (f) {
      if (sim.talking && sim.talking !== f) town.release(sim.talking);
      trav.dir = Math.abs(f.x - trav.x) >= Math.abs(f.y - trav.y) ? (f.x > trav.x ? 'right' : 'left') : (f.y > trav.y ? 'down' : 'up'); trav.moving = false;
      town.talk(f, trav, 0); sim.talking = f; trav.target = f; trav.talkT = 0; sim.events.push({ t: Math.round(sim.clock), kind: 'talk', id: f.id, with: f.spec.name }); };
    /* the point the camera centres on during a talk: the middle of the two speakers, lifted so they stand in the part of the
       view above the talk panel (the panel takes the bottom 60 px) */
    sim.focus = function (f) {
      var x0 = Math.min(trav.x, f.x) - 10, x1 = Math.max(trav.x, f.x) + 10, y0 = Math.min(trav.y, f.y) - 32, y1 = Math.max(trav.y, f.y) + 2;
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + 30 };
    };
    sim.toggleRegister = function () { if (sim.register.open) { sim.register.open = false; sim.register.t1 = sim.clock; } else { sim.register.open = true; sim.register.t0 = sim.clock; sim.register.t1 = null; } };
    sim.trOpts = function () { return { dir: trav.dir, moving: trav.moving, walk: trav.walk }; };
    sim.state = function () {
      var talkWith = sim.talking ? sim.talking.id : null, actors = [];
      var face = function (o, dir) { if (dir === 'left' || dir === 'right') o.facing = dir; else o.noFace = 'top-down ' + dir + ' view'; return o; };
      var tr = face({ id: 'traveller', x: Math.round(trav.x * 10) / 10, y: Math.round(trav.y * 10) / 10, dir: trav.dir, moving: trav.moving, name: trav.npc.spec.name }, trav.dir);
      if (talkWith) tr.target = talkWith; else if (trav.moving) tr.vx = trav.dir === 'right' ? 1 : trav.dir === 'left' ? -1 : 0; else tr.target = null;
      actors.push(tr);
      town.folk.forEach(function (f) {
        var o = face({ id: f.id, x: Math.round(f.x * 10) / 10, y: Math.round(f.y * 10) / 10, dir: f.dir, moving: f.moving, name: f.spec.name, role: f.spec.title, seed: f.spec.seed }, f.dir);
        if (f.talk) o.target = 'traveller'; else if (f.moving) o.vx = f.dir === 'right' ? 1 : f.dir === 'left' ? -1 : 0; else o.target = null;
        actors.push(o);
      });
      return { t: Math.round(sim.clock), auto: sim.auto, seed: sim.seed, talking: talkWith, talk: sim.talking ? { id: sim.talking.id, name: sim.talking.spec.name, role: sim.talking.spec.title, line: sim.talking.spec.line, seed: sim.talking.spec.seed } : null,
        register: { open: sim.register.open, count: town.folk.length }, actors: actors };
    };
    return sim;
  }
  /* the demo camera (the page and the checks use this one): follows the traveller; while talking it eases (300 ms, from the
     sim clock) to the two speakers, lifted above the talk panel */
  function ease(k) { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); }
  var CAM_MS = 300;
  function camera(sim, W, H) {
    var tr = sim.trav, ww = COLS * T, wh = ROWS * T, cx = tr.x, cy = tr.y - 12, f = sim.talking;
    if (f) { var k = ease((tr.talkT >= 0 ? tr.talkT : 0) / CAM_MS), p = sim.focus(f); cx += (p.x - cx) * k; cy += (p.y - cy) * k; }
    else if (sim.lastFocus && sim.clock - sim.byeT < CAM_MS) { var k2 = 1 - ease((sim.clock - sim.byeT) / CAM_MS); cx += (sim.lastFocus.x - cx) * k2; cy += (sim.lastFocus.y - cy) * k2; }
    return { x: Math.round(Math.max(0, Math.min(ww - W, cx - W / 2))), y: Math.round(Math.max(0, Math.min(wh - H, cy - H / 2))) };
  }
  /* the demo's HUD: a location plate in the top-left corner (the talk panel keeps clear of it) */
  var PLACE = 'Rivermeet Market';
  function hud(NG) { return [{ id: 'place', x: 4, y: 4, w: NG.textWidth(PLACE) + 22, h: 13 }]; }
  root.GameDNA_NpcGenDemo = { camera: camera, hud: hud, PLACE: PLACE, CAM_MS: CAM_MS, T: T, COLS: COLS, ROWS: ROWS, STEP: STEP, END: END, REG_OPEN: REG_OPEN, REG_MS: REG_MS, rows: ROWS_STR, props: PROPS, propBoxes: PROP_BOXES, solids: SOLIDS, area: AREA,
    inSolid: inSolid, footBlocked: footBlocked, make: make };
})(typeof window !== 'undefined' ? window : this);
