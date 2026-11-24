/* D-02 paper-doll demo: the little game the demo page draws (and the node checks drive without a canvas).
 * Pure logic, no drawing, ASCII only. One global: GameDNA_PaperDollDemo.make(GameDNA_PaperDoll, opts) -> sim.
 * One clock: sim.step() advances 1000/60 ms: the hero's script (or the player's keys), the townsfolk, the wardrobe and
 * every doll's update(). Nothing reads the wall clock or Math.random, and nothing depends on the view size.
 * Setting (original): the outfitter's square of a small market town; a traveller tries on gear, then tests it on a straw
 * dummy. Four townsfolk in other outfits walk their rounds.
 */
(function (root) {
  'use strict';
  var T = 16, COLS = 30, ROWS = 18, STEP = 1000 / 60, SPEED = 60, END = 30000, LINEUP = 24000, SWING = 360;

  /* ---------- the map (pixel-kit chars) ---------- */
  function buildRows() {
    var m = [], r, c;
    var hs = function (x, y, s) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; };
    for (r = 0; r < ROWS; r++) { m.push([]); for (c = 0; c < COLS; c++) { var n = hs(c, r, 3); m[r].push(n > 0.82 ? ',' : n < 0.1 ? ':' : '.'); } }
    var rect = function (c0, r0, c1, r1, ch) { for (var y = r0; y <= r1; y++) for (var x = c0; x <= c1; x++) if (x >= 0 && y >= 0 && x < COLS && y < ROWS) m[y][x] = ch; };
    rect(5, 6, 24, 13, 'c');                 // the square
    rect(0, 9, 4, 10, 'p'); rect(25, 9, COLS - 1, 10, 'p'); rect(14, 14, 15, ROWS - 1, 'p');
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      var edge = Math.min(r, c, ROWS - 1 - r, COLS - 1 - c), ch = m[r][c];
      if (ch === 'c' || ch === 'p') continue;
      if (edge < 1 || (r < 3 && hs(c, r, 7) < 0.55) || (r > 15 && hs(c, r, 8) < 0.4)) m[r][c] = hs(c, r, 9) < 0.25 ? 'P' : 'T';
    }
    [[3, 5], [26, 6], [4, 13], [26, 13], [9, 15], [21, 15]].forEach(function (q) { m[q[1]][q[0]] = 'u'; });
    [[2, 7], [27, 12], [11, 16], [19, 16]].forEach(function (q) { m[q[1]][q[0]] = 'F'; });
    return m.map(function (rw) { return rw.join(''); });
  }
  var ROWS_STR = buildRows();
  var PROPS = [
    { k: 'house', x: 8 * T, y: 5 * T + 12, o: { roof: 'red', wall: 'timber' } }, { k: 'house', x: 22 * T, y: 5 * T + 12, o: { roof: 'blue', wall: 'plaster' } },
    { k: 'stall', x: 13 * T + 8, y: 6 * T + 10 }, { k: 'rack', x: 16 * T + 10, y: 6 * T + 8 }, { k: 'banner', x: 11 * T + 4, y: 6 * T + 6 },
    { k: 'barrel', x: 18 * T + 6, y: 6 * T + 10 }, { k: 'crate', x: 19 * T + 4, y: 6 * T + 12 }, { k: 'well', x: 9 * T + 8, y: 11 * T + 8 },
    { k: 'lantern', x: 5 * T + 8, y: 8 * T + 8 }, { k: 'lantern', x: 24 * T + 8, y: 8 * T + 8 }, { k: 'sack', x: 20 * T + 4, y: 7 * T + 2 },
    { k: 'flowers', x: 6 * T + 4, y: 13 * T + 10 }, { k: 'bench', x: 21 * T, y: 13 * T + 10 }
  ];
  var DUMMY = { x: 20 * T + 8, y: 10 * T + 4 };   // feet of the straw dummy
  /* foot boxes of the props nobody may walk through (x, y, w, h in world px) */
  var SOLIDS = [{ id: 'well', x: 9 * T - 6, y: 11 * T - 4, w: 28, h: 16 }, { id: 'dummy', x: DUMMY.x - 8, y: DUMMY.y - 6, w: 16, h: 8 }, { id: 'bench', x: 21 * T - 12, y: 13 * T + 2, w: 24, h: 10 },
    { id: 'lantern', x: 5 * T + 2, y: 8 * T + 2, w: 12, h: 8 }, { id: 'lantern2', x: 24 * T + 2, y: 8 * T + 2, w: 12, h: 8 }, { id: 'flowers', x: 6 * T - 6, y: 13 * T + 4, w: 20, h: 10 }];
  function blocked(x, y) { for (var i = 0; i < SOLIDS.length; i++) { var b = SOLIDS[i]; if (x > b.x - 5 && x < b.x + b.w + 5 && y > b.y - 2 && y < b.y + b.h + 3) return b.id; } return null; }
  /* the closing line-up: everyone walks to a spot in one row (within the narrowest 195 px view) and faces the viewer */
  var LINE = { mage: [[11 * T, 8 * T + 12], [11 * T, 8 * T + 10]], knight: [[13 * T, null], [13 * T, 8 * T + 10]], villager: [[17 * T, null], [17 * T, 8 * T + 10]], ranger: [[23 * T + 8, 8 * T + 10], [19 * T, 8 * T + 10]] };
  var WALK = { x0: 5 * T + 6, y0: 7 * T + 10, x1: 25 * T - 6, y1: 14 * T - 2 };   // where the player may walk

  /* ---------- outfits ---------- */
  var LOOKS = {
    hero: { body: 'base/fair', hair: 'short/auburn', hat: 'none', top: 'tunic/forest', bottom: 'trousers/slate', boots: 'boots/brown', weapon: 'sword/steel', shield: 'none' },
    knight: { body: 'base/tan', hair: 'short/black', hat: 'helm/steel', top: 'plate/steel', bottom: 'trousers/crimson', boots: 'greaves/steel', weapon: 'spear/steel', shield: 'kite/crimson' },
    mage: { body: 'base/rose', hair: 'long/silver', hat: 'wizard/plum', top: 'robe/plum', bottom: 'trousers/black', boots: 'shoes/dark', weapon: 'staff/amethyst', shield: 'none' },
    ranger: { body: 'base/deep', hair: 'tail/black', hat: 'hood/forest', top: 'vest/tan', bottom: 'trousers/ochre', boots: 'boots/dark', weapon: 'axe/steel', shield: 'buckler/bronze' },
    villager: { body: 'base/brown', hair: 'bob/teal', hat: 'circlet/gold', top: 'tunic/ivory', bottom: 'skirt/royal', boots: 'shoes/tan', weapon: 'none', shield: 'none' }
  };
  /* the wardrobe script (ms from the start): the traveller tries on gear */
  var WARD = [[2900, 'open'], [3500, 'right'], [4100, 'right'], [4700, 'ok'], [5300, 'right'], [5900, 'ok'], [6400, 'down'], [6900, 'right'], [7500, 'ok'],
    [8100, 'right'], [8700, 'ok'], [9200, 'down'], [9700, 'right'], [10200, 'down'], [10700, 'down'], [11200, 'right'], [11700, 'right'], [12300, 'ok'],
    [12900, 'right'], [13500, 'back'], [14000, 'down'], [14500, 'down'], [15100, 'ok']];
  /* the hero after the wardrobe: walk to the dummy, swing facing right, go round, swing facing left, walk back up */
  var HERO_PLAN = [
    { walk: [13 * T + 8, 8 * T + 10] }, { face: 'up' }, { until: 15600 },
    { walk: [13 * T + 8, 10 * T + 4] }, { walk: [DUMMY.x - 18, DUMMY.y] }, { face: 'right' }, { wait: 250 }, { attack: 2 }, { wait: 300 },
    { walk: [DUMMY.x - 18, DUMMY.y + 22] }, { walk: [DUMMY.x + 18, DUMMY.y + 22] }, { walk: [DUMMY.x + 18, DUMMY.y] }, { face: 'left' }, { wait: 250 }, { attack: 2 }, { wait: 300 },
    { walk: [DUMMY.x + 18, 8 * T + 10] }, { walk: [15 * T, 8 * T + 10] }, { face: 'down' }, { wait: 99999 }
  ];
  /* townsfolk rounds: points they walk between (4 directions only), with pauses */
  var ROUNDS = {
    knight: { start: [11 * T + 8, 13 * T + 6], pts: [[14 * T + 8, 13 * T + 6], [11 * T + 8, 13 * T + 6]], pause: 900, speed: 40 },   // clear of the well
    ranger: { start: [23 * T + 8, 8 * T + 8], pts: [[23 * T + 8, 12 * T + 8], [23 * T + 8, 8 * T + 8]], pause: 1200, speed: 34 },
    villager: { start: [16 * T, 12 * T + 12], pts: [[19 * T, 12 * T + 12], [19 * T, 13 * T + 8], [16 * T, 13 * T + 8], [16 * T, 12 * T + 12]], pause: 500, speed: 30 },
    mage: { start: [9 * T + 8, 8 * T + 12], pts: [], pause: 0, speed: 0 }
  };

  function make(PD, opts) {
    opts = opts || {};
    var stride = opts.stride || 5, auto = opts.auto !== false;
    var actors = {}, order = ['hero', 'knight', 'mage', 'ranger', 'villager'];
    order.forEach(function (id) {
      var R = ROUNDS[id], st = R ? R.start : [12 * T + 8, 9 * T + 12];
      actors[id] = { id: id, x: st[0], y: st[1], face: id === 'mage' ? 'right' : 'down', walk: 0, moving: false, attackT: -1, swings: 0,
        doll: PD.create({ look: (opts.looks && opts.looks[id]) || LOOKS[id], params: { stride: stride } }), plan: 0, wait: 0, leg: 0, pause: 0, target: null };
    });
    if (opts.heroLook) actors.hero.doll.setLook(opts.heroLook);
    var hero = actors.hero;
    hero.x = 12 * T + 8; hero.y = 13 * T + 4; hero.face = 'up';
    var wr = PD.wardrobe({ doll: hero.doll, view: opts.view || { x: 0, y: 0, w: 320, h: 180 }, onChange: function () { sim.events.push({ t: Math.round(sim.clock), kind: 'change', look: hero.doll.look() }); } });
    var sim = { clock: 0, actors: actors, order: order, wardrobe: wr, hero: hero, auto: auto, events: [], wi: 0, keys: {}, dummyHit: 0, T: T, END: END };

    function moveTo(a, tx, ty, sp, dtMs) {
      // 4-direction walking: the longer axis first; the walk counter grows by the distance covered
      var step = sp * dtMs / 1000, dx = tx - a.x, dy = ty - a.y;
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) { a.moving = false; return true; }
      var horiz = Math.abs(dx) >= 0.01 && (Math.abs(dx) >= Math.abs(dy) || Math.abs(dy) < 0.01) ? true : Math.abs(dy) < 0.01;
      if (Math.abs(dx) >= 0.01 && Math.abs(dy) >= 0.01) horiz = Math.abs(dx) > Math.abs(dy);
      if (horiz) { var mv = Math.min(step, Math.abs(dx)); a.x += Math.sign(dx) * mv; a.face = dx > 0 ? 'right' : 'left'; a.walk += mv; }
      else { var mv2 = Math.min(step, Math.abs(dy)); a.y += Math.sign(dy) * mv2; a.face = dy > 0 ? 'down' : 'up'; a.walk += mv2; }
      a.moving = true;
      return false;
    }
    function heroScript(dt) {
      var h = hero;
      // wardrobe presses
      while (sim.wi < WARD.length && sim.clock >= WARD[sim.wi][0]) { var w = WARD[sim.wi][1]; if (w === 'open') wr.open(); else wr.input(w); sim.wi++; }
      if (wr.isOpen()) { h.moving = false; return; }
      var p = HERO_PLAN[h.plan]; if (!p) { h.moving = false; return; }
      if (p.walk) { if (moveTo(h, p.walk[0], p.walk[1], SPEED, dt)) h.plan++; return; }
      h.moving = false;
      if (p.face) { h.face = p.face; h.plan++; return; }
      if (p.until) { if (sim.clock >= p.until) h.plan++; return; }
      if (p.wait) { h.wait += dt; if (h.wait >= p.wait) { h.wait = 0; h.plan++; } return; }
      if (p.attack) {
        if (h.attackT < 0) { h.attackT = 0; }
        else { h.attackT += dt; if (h.attackT >= SWING) { h.swings++; sim.dummyHit = sim.clock; h.attackT = h.swings < p.attack ? 0 : -1; if (h.attackT < 0) { h.swings = 0; h.plan++; } } }
      }
    }
    function playerControl(dt) {
      var h = hero, k = sim.keys;
      if (wr.isOpen()) { h.moving = false; return; }
      if (h.attackT >= 0) { h.attackT += dt; h.moving = false; if (h.attackT >= SWING) { h.attackT = -1; sim.dummyHit = Math.abs(h.x - DUMMY.x) < 28 && Math.abs(h.y - DUMMY.y) < 14 ? sim.clock : sim.dummyHit; } return; }
      var mx = (k.right ? 1 : 0) - (k.left ? 1 : 0), my = (k.down ? 1 : 0) - (k.up ? 1 : 0);
      if (mx && my) my = 0;
      if (!mx && !my) { h.moving = false; return; }
      var tx = Math.max(WALK.x0, Math.min(WALK.x1, h.x + mx * 8)), ty = Math.max(WALK.y0, Math.min(WALK.y1, h.y + my * 8));
      if (blocked(tx, ty)) { if (!blocked(h.x + mx * 1.2, h.y + my * 1.2)) { tx = h.x + mx; ty = h.y + my; } else { tx = h.x; ty = h.y; } }
      if (tx === h.x && ty === h.y) { h.face = mx > 0 ? 'right' : mx < 0 ? 'left' : my > 0 ? 'down' : 'up'; h.moving = false; return; }
      moveTo(h, tx, ty, SPEED, dt);
    }
    function folk(a, dt) {
      var R = ROUNDS[a.id];
      if (sim.auto && sim.clock >= LINEUP) {
        var L2 = LINE[a.id], k = a.line || 0, q2 = L2[k];
        if (!q2) { a.moving = false; a.face = 'down'; a.target = null; return; }
        if (moveTo(a, q2[0], q2[1] == null ? a.y : q2[1], Math.max(R.speed, 36), dt)) a.line = k + 1;
        return;
      }
      if (a.id === 'mage') {   // stands by the stall and turns to the traveller
        var dx = hero.x - a.x, dy = hero.y - a.y;
        a.face = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); a.target = 'hero'; a.moving = false; return;
      }
      if (a.pause > 0) { a.pause -= dt; a.moving = false; return; }
      var q = R.pts[a.leg % R.pts.length];
      if (moveTo(a, q[0], q[1], R.speed, dt)) { a.leg++; a.pause = R.pause; }
    }
    sim.step = function () {
      var dt = STEP;
      sim.clock += dt;
      if (sim.auto) heroScript(dt); else playerControl(dt);
      order.forEach(function (id) { if (id !== 'hero') folk(actors[id], dt); actors[id].doll.update(dt); });
      wr.update(dt);
    };
    sim.runTo = function (ms) { while (sim.clock + STEP / 2 < ms) sim.step(); };
    sim.attack = function () { if (!wr.isOpen() && hero.attackT < 0) hero.attackT = 0; };
    sim.takeOver = function () { if (sim.auto) { sim.auto = false; hero.attackT = -1; hero.moving = false; } };
    /* what to draw for an actor this frame (the module's pose input) */
    sim.drawOpts = function (a) { return { dir: a.face, walk: a.walk, moving: a.moving, attack: a.attackT >= 0 ? a.attackT / SWING : null }; };
    sim.state = function () {
      return {
        t: Math.round(sim.clock), auto: sim.auto, wardrobe: wr.state(), hero: hero.doll.look(), strike: hero.attackT >= 0 && hero.doll.pose(sim.drawOpts(hero)).i === 1,
        actors: order.map(function (id) {
          var a = actors[id], side = a.face === 'left' || a.face === 'right', o = { id: id, x: Math.round(a.x * 10) / 10, y: Math.round(a.y * 10) / 10, dir: a.face, moving: a.moving, pose: a.doll.pose(sim.drawOpts(a)).pose };
          if (side) o.facing = a.face; else o.noFace = 'top-down ' + a.face + ' view';
          if (id === 'hero' && a.attackT >= 0) o.target = DUMMY.x;
          else if (id === 'mage' && side) o.target = 'hero';
          else if (a.moving) o.vx = a.face === 'right' ? 1 : a.face === 'left' ? -1 : 0;
          else o.target = null;
          return o;
        }), dummy: { x: DUMMY.x, y: DUMMY.y, hitAgo: sim.dummyHit ? Math.round(sim.clock - sim.dummyHit) : null }
      };
    };
    return sim;
  }
  root.GameDNA_PaperDollDemo = { solids: SOLIDS, blocked: blocked, LINEUP: LINEUP, T: T, COLS: COLS, ROWS: ROWS, STEP: STEP, END: END, SWING: SWING, rows: ROWS_STR, props: PROPS, dummy: DUMMY, looks: LOOKS, ward: WARD, make: make };
})(typeof window !== 'undefined' ? window : this);
