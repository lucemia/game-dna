/* H-04 scripted-cutscenes demo: the little game the demo page draws (and the node checks drive without a canvas).
 * Pure logic, no drawing, ASCII only. One global: GameDNA_CutsceneDemo.make(GameDNA_Cutscenes, opts) -> sim.
 * One clock: sim.step() advances 1000/60 ms of free play, the autopilot, the triggers and the cutscene module.
 * Story (original): a traveller reaches the river village of Ashford; the bridge north is down; the guard captain and the
 * elder send the traveller to the ford upstream; the captain leads the way (that second scene is skipped by the autopilot).
 */
(function (root) {
  'use strict';
  var T = 16, COLS = 40, ROWS = 26, STEP = 1000 / 60;

  /* ---------- the map (pixel-kit chars) ---------- */
  function buildRows() {
    var m = [], r, c;
    for (r = 0; r < ROWS; r++) { m.push([]); for (c = 0; c < COLS; c++) m[r].push('.'); }
    var set = function (cc, rr, ch) { if (cc >= 0 && rr >= 0 && cc < COLS && rr < ROWS) m[rr][cc] = ch; };
    var rect = function (c0, r0, c1, r1, ch) { for (var y = r0; y <= r1; y++) for (var x = c0; x <= c1; x++) set(x, y, ch); };
    var hs = function (x, y, s) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; };
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) { var n = hs(c, r, 11); if (n > 0.8) m[r][c] = ','; else if (n < 0.12) m[r][c] = ':'; }
    // river across the north (rows 4-6), a broken bridge at cols 19-20, a ford (sand) at cols 33-34
    rect(0, 4, COLS - 1, 6, 'w');
    set(19, 4, 'B'); set(20, 4, 'B'); set(19, 6, 'B'); set(20, 6, 'B');           // the middle span is gone
    rect(33, 4, 34, 6, 's'); set(32, 5, 's'); set(35, 5, 's');
    // roads: west road -> square -> east gate; north lane to the broken bridge; river path east to the ford
    rect(0, 15, 29, 16, 'p'); rect(19, 7, 20, 14, 'p'); rect(21, 8, 34, 8, 'p'); rect(33, 7, 34, 7, 'p');
    rect(13, 12, 24, 17, 'c');
    rect(31, 15, COLS - 1, 16, 'p');
    // the east wall with its gate (the gate gap is the road)
    for (r = 9; r <= 22; r++) if (r !== 15 && r !== 16) set(30, r, '#');
    // north bank: mill lane and fields
    rect(33, 0, 34, 3, 'p'); rect(23, 1, 29, 2, 'f');
    // borders and woods
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      var edge = Math.min(r, c, ROWS - 1 - r, COLS - 1 - c);
      if (m[r][c] === 'w' || m[r][c] === 'p' || m[r][c] === 's' || m[r][c] === 'B') continue;
      if (edge < 1 || (r > 19 && hs(c, r, 5) < 0.35) || (r < 4 && (c < 17 || c > 37) && hs(c, r, 7) < 0.45)) m[r][c] = hs(c, r, 9) < 0.3 ? 'P' : 'T';
    }
    rect(3, 19, 8, 21, 'f'); rect(22, 19, 27, 21, 'f');
    [[2, 9], [26, 10], [27, 18], [12, 19], [37, 11], [37, 20], [16, 9], [8, 12]].forEach(function (q) { set(q[0], q[1], 'u'); });
    [[25, 13], [10, 18], [36, 13]].forEach(function (q) { set(q[0], q[1], 'F'); });
    return m.map(function (rw) { return rw.join(''); });
  }
  var ROWS_STR = buildRows();
  var PROPS = [
    { k: 'house', x: 10 * T + 8, y: 13 * T + 6, o: { roof: 'red' } }, { k: 'house', x: 5 * T, y: 13 * T + 6, o: { roof: 'thatch', wall: 'timber', w: 40 } },
    { k: 'house', x: 26 * T, y: 13 * T + 4, o: { roof: 'blue', wall: 'stone' } }, { k: 'well', x: 17 * T + 8, y: 13 * T + 4 },
    { k: 'lantern', x: 12 * T + 10, y: 14 * T + 10 }, { k: 'lantern', x: 22 * T + 6, y: 14 * T + 10 }, { k: 'barrel', x: 23 * T + 10, y: 17 * T + 12 },
    { k: 'crate', x: 14 * T + 2, y: 17 * T + 12 }, { k: 'sign', x: 18 * T + 4, y: 10 * T + 10 }, { k: 'stall', x: 21 * T + 8, y: 12 * T + 12 },
    { k: 'torch', x: 29 * T + 10, y: 14 * T + 10 }, { k: 'torch', x: 29 * T + 10, y: 17 * T + 10 }, { k: 'hay', x: 4 * T + 8, y: 18 * T + 6 },
    { k: 'log', x: 24 * T, y: 9 * T + 12 }, { k: 'stump', x: 37 * T, y: 9 * T + 8 }, { k: 'rock', x: 21 * T + 12, y: 3 * T + 8 }
  ];
  var SOLID_CH = { w: 1, T: 1, P: 1, '#': 1, u: 1, t: 1, R: 1 };
  var HOUSES = [{ x: 10 * T + 8, y: 13 * T + 6, w: 52, h: 20 }, { x: 5 * T, y: 13 * T + 6, w: 40, h: 20 }, { x: 26 * T, y: 13 * T + 4, w: 52, h: 20 }];
  function solid(x, y) {
    var c = Math.floor(x / T), r = Math.floor(y / T);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
    if (SOLID_CH[ROWS_STR[r].charAt(c)]) return true;
    for (var i = 0; i < HOUSES.length; i++) { var H = HOUSES[i]; if (x > H.x - H.w / 2 && x < H.x + H.w / 2 && y > H.y - H.h && y < H.y) return true; }
    return false;
  }

  /* ---------- the cast (feet in world px) ---------- */
  var DOOR = { x: 10 * T + 8, y: 13 * T + 8 };
  var CAST0 = {
    hero: { name: 'Wren', pal: 'hero', x: 4 * T + 8, y: 15 * T + 12, face: 'right' },
    guard: { name: 'Captain Brannoc', pal: 'guard', x: 35 * T + 8, y: 15 * T + 12, face: 'left' },
    elder: { name: 'Elder Isolde', pal: 'elder', x: DOOR.x, y: DOOR.y, face: 'down' }
  };

  /* ---------- the scripts (data) ---------- */
  var HERO_STOP = { x: 15 * T + 8, y: 15 * T + 12 };
  var BRIDGE = { x: 19.5 * T + 8, y: 5 * T };
  var SCRIPTS = {
    bridge: [
      { face: 'hero', to: 'right' },
      { cue: 'horn' },
      { emote: 'hero', icon: '!', ms: 900 },
      { all: [{ move: 'guard', path: [[22 * T, 15 * T + 12], [HERO_STOP.x + 30, HERO_STOP.y]], speed: 96, run: true }, { cam: [HERO_STOP.x + 15, HERO_STOP.y - 12], ms: 1500, frame: ['hero'] }] },
      { face: 'hero', to: 'guard' },
      { say: 'guard', to: 'hero', text: 'Hold there, traveller! The north bridge came down in last night\'s storm.' },
      { emote: 'hero', icon: '?', ms: 900, wait: false },
      { say: 'hero', to: 'guard', text: 'Then how do I reach the old mill?' },
      { all: [{ move: 'elder', path: [[DOOR.x, 14 * T + 8], [13 * T + 4, 14 * T + 8], [13 * T + 4, 15 * T + 2]], speed: 34 }, { cam: [(HERO_STOP.x + 13 * T + 4) / 2 + 8, HERO_STOP.y - 14], ms: 1300, frame: ['hero'] }] },
      { all: [{ face: 'guard', to: 'elder' }, { face: 'hero', to: 'elder' }] },
      { say: 'elder', to: 'hero', text: 'There is a ford upstream, past the reeds. Captain, show our guest the way.' },
      { emote: 'guard', icon: 'note', ms: 900, wait: false },
      { say: 'guard', to: 'elder', text: 'Right away, Elder.' },
      { all: [{ cam: [BRIDGE.x, 11 * T], ms: 1300, frame: ['hero', 'guard', 'elder'] }, [{ wait: 500 }, { face: 'guard', to: 'up' }, { wait: 250 }, { face: 'hero', to: 'up' }, { wait: 150 }, { face: 'elder', to: 'up' }]] },
      { cam: BRIDGE, ms: 1200 },
      { say: 'guard', text: 'See the gap? The middle span went down with the flood.' },
      { cue: 'creak' },
      { wait: 1100 },
      { fade: 'out', ms: 260 }, { cam: 'hero', zoom: 2, ms: 0 }, { all: [{ face: 'hero', to: 'guard' }, { face: 'guard', to: 'hero' }, { face: 'elder', to: 'hero' }] }, { fade: 'in', ms: 260 },
      { emote: 'hero', icon: 'idea', ms: 900 },
      { say: 'hero', text: 'Upstream it is.' },
      { fade: 'out', ms: 220 }, { cam: 'hero', zoom: 1, ms: 0 }, { fade: 'in', ms: 220 },
      { all: [{ move: 'elder', path: [[13 * T + 4, 14 * T + 8], [DOOR.x, 14 * T + 8], [DOOR.x, DOOR.y]], speed: 34, face: 'down' },
        { move: 'guard', path: [[19 * T + 8, 15 * T + 12], [19 * T + 8, 9 * T + 12]], speed: 60, face: 'down' }] },
      { call: 'objective-ford' }
    ],
    ford: [
      { face: 'guard', to: 'hero' },
      { say: 'guard', to: 'hero', text: 'This way. Keep to the bank.' },
      { all: [
        { move: 'guard', path: [[19 * T + 8, 8 * T + 8], [35 * T + 10, 8 * T + 8]], speed: 58, face: 'left' },
        [{ wait: 750 }, { move: 'hero', path: [[19 * T + 8, 9 * T + 4], [19 * T + 8, 8 * T + 8], [32 * T + 6, 8 * T + 8]], speed: 58, face: 'right' }],
        { cam: 'guard', ms: 1600, follow: true }] },
      { emote: 'guard', icon: '!', ms: 800 },
      { say: 'guard', to: 'hero', text: 'The ford. Shallow enough for boots.' },
      { call: 'ford-open' }
    ]
  };

  function make(CSmod, o) {
    o = o || {};
    var auto = o.auto !== false, noSkip = !!o.noSkip, skipAt = o.skipAt != null ? o.skipAt : null, hostDialogue = o.hostDialogue || null;
    var sim = { clock: 0, events: [], flags: {}, objective: 'Reach Ashford', manual: !auto, keys: {}, hud: { coins: 14, hearts: 3 } };
    var A = {};
    Object.keys(CAST0).forEach(function (id) { var c = CAST0[id]; A[id] = { id: id, name: c.name, pal: c.pal, x: c.x, y: c.y, face: c.face, moving: false, walk: 0, frame: 0, target: null }; });
    sim.actors = A;
    function ev(kind, what) { sim.events.push({ t: Math.round(sim.clock), kind: kind, what: what }); }
    var actorsSpec = {};
    Object.keys(A).forEach(function (id) {
      actorsSpec[id] = { name: A[id].name, h: 26, w: 14, frames: 4, stride: 5, runStride: 8, speed: 60,
        get: function () { return { x: A[id].x, y: A[id].y, face: A[id].face, walk: A[id].walk }; },
        set: function (p) { var a = A[id]; a.x = p.x; a.y = p.y; a.face = p.face; a.moving = p.moving; a.run = p.run; a.walk = p.walk; a.frame = p.frame; a.target = p.target; } };
    });
    var cam = { x: 0, y: 0 };
    function followCam() {   // the game's own camera rule: centre on the hero, clamped to the map
      var vw = o.viewW || 384, vh = o.viewH || 216, h = A.hero;
      return { x: Math.max(0, Math.min(COLS * T - vw, Math.round(h.x - vw / 2))), y: Math.max(0, Math.min(ROWS * T - vh, Math.round(h.y - 8 - vh / 2))) };
    }
    var cs = CSmod.create({
      view: o.view || { x: 0, y: 0, w: 384, h: 216 }, stage: o.stage, worldView: { w: o.viewW || 384, h: o.viewH || 216 },
      world: { x: 0, y: 0, w: COLS * T, h: ROWS * T }, tile: T, solid: solid,
      camera: followCam, actors: actorsSpec, dialogue: hostDialogue, cssScale: o.cssScale, auto: function () { return !sim.manual; },
      onStart: function (i) { ev('start', i.id); },
      onEnd: function (i) { ev('end', i.id + (i.skipped ? ' skipped' : '')); sim.ended = sim.ended || []; sim.ended.push(i); },
      onCall: function (name) { ev('call', name); sim.flags[name] = (sim.flags[name] || 0) + 1; if (name === 'objective-ford') sim.objective = 'Follow the captain'; if (name === 'ford-open') sim.objective = 'Cross the ford'; },
      onCue: function (name) { ev('cue', name); if (o.onCue) o.onCue(name); },
      params: o.params || {}
    });
    sim.cs = cs;
    var wrapPlay = cs.play; cs.play = function (s, opt2) { var ok = wrapPlay(s, opt2); return ok; };

    /* free play: the hero's autopilot route between the scenes (or the player's keys) */
    var ROUTE = [
      [[HERO_STOP.x, HERO_STOP.y]],
      [[19 * T + 8, 15 * T + 12], [19 * T + 8, 11 * T + 2]],
      [[33 * T + 8, 8 * T + 8], [33 * T + 8, 6 * T + 8], [33 * T + 8, 3 * T + 8], [33 * T + 8, 1 * T + 12]]
    ];
    var wp = 0, legNow = 0;
    function leg() { return !cs.seen('bridge') ? 0 : !cs.seen('ford') ? 1 : 2; }
    function walkHero(dx, dy, dt) {
      var h = A.hero, d = Math.hypot(dx, dy), sp = 60 * dt / 1000;
      if (d < 1e-6) { h.moving = false; h.frame = 0; return; }
      var mx = dx / d * Math.min(sp, d), my = dy / d * Math.min(sp, d);
      if (!solid(h.x + mx, h.y + my) || sim.manual === false) { h.x += mx; h.y += my; h.walk += Math.hypot(mx, my); h.moving = true; }
      else h.moving = false;
      h.face = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
      h.run = false; h.frame = h.moving ? Math.floor(h.walk / 5) % 4 : 0;
    }
    function triggers() {
      var h = A.hero;
      if (!cs.seen('bridge') && h.x >= HERO_STOP.x - 0.5 && Math.abs(h.y - HERO_STOP.y) < 12) { if (cs.play(SCRIPTS.bridge, { id: 'bridge', once: true })) { ev('play', 'bridge'); stopHero(); } }
      else if (cs.seen('bridge') && !cs.seen('ford') && Math.hypot(h.x - A.guard.x, h.y - A.guard.y) < 27) { if (cs.play(SCRIPTS.ford, { id: 'ford', once: true })) { ev('play', 'ford'); stopHero(); } }
    }
    function stopHero() { A.hero.moving = false; A.hero.frame = 0; }
    function npcFaces() {   // idle villagers turn to the hero when close (outside cutscenes)
      ['guard', 'elder'].forEach(function (id) {
        var a = A[id], h = A.hero, dx = h.x - a.x, dy = h.y - a.y;
        if (a.moving) return;
        if (Math.hypot(dx, dy) < 5 * T) { a.face = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up'); a.target = 'hero'; }
        else a.target = null;
      });
    }
    sim.step = function () {
      sim.clock += STEP;
      var locked = cs.locked();
      if (!locked) {
        if (sim.manual) {
          var k = sim.keys, dx = (k.right ? 1 : 0) - (k.left ? 1 : 0), dy = (k.down ? 1 : 0) - (k.up ? 1 : 0);
          walkHero(dx, dy, STEP);
        } else {
          var lg = leg(); if (lg !== legNow) { legNow = lg; wp = 0; }
          var L = ROUTE[lg];
          if (L) {
            var p = L[wp];
            if (p) { var h = A.hero, ddx = p[0] - h.x, ddy = p[1] - h.y; if (Math.hypot(ddx, ddy) < 0.6) { h.x = p[0]; h.y = p[1]; wp++; walkHero(0, 0, STEP); } else walkHero(ddx, ddy, STEP); }
            else walkHero(0, 0, STEP);
          } else walkHero(0, 0, STEP);
        }
        npcFaces();
        triggers();
      } else {
        if (!sim.manual && !noSkip && cs.state().id === 'ford') {   // the autopilot holds skip during the second scene
          var st = cs.state(), at = skipAt != null ? skipAt : 2300;
          if (st.t >= at && st.t < at + 900) { if (!sim.skipDown) { sim.skipDown = true; cs.input('skip', true); ev('skip-hold', 'ford'); } }
          else if (sim.skipDown) { sim.skipDown = false; cs.input('skip', false); }
        }
      }
      cs.update(STEP);
      if (!cs.locked()) { var fc = followCam(); cam.x = fc.x; cam.y = fc.y; }
      var line = cs.state().line; if (line && line.text !== sim.lastLine) { sim.lastLine = line.text; ev('line', line.who + ': ' + line.text.slice(0, 24)); }
      if (!line) sim.lastLine = null;
      var em = cs.state().emotes || []; em.forEach(function (e) { if (e.t < 1) ev('emote', e.id + ' ' + e.icon); });
    };
    sim.camera = function () { var c = cs.camera(); return c ? c : { x: cam.x, y: cam.y, zoom: 1, w: o.viewW || 384, h: o.viewH || 216 }; };
    sim.runTo = function (ms) { var n = Math.floor(ms / STEP); while (Math.round(sim.clock / STEP) < n) sim.step(); return sim; };
    sim.game = function () {   // what the game holds (for the skip == play-through check)
      var out = { flags: JSON.parse(JSON.stringify(sim.flags)), objective: sim.objective, actors: {} };
      Object.keys(A).forEach(function (id) { var a = A[id]; out.actors[id] = { x: +a.x.toFixed(3), y: +a.y.toFixed(3), face: a.face }; });
      return out;
    };
    sim.state = function () {
      var c = sim.camera(), s = cs.state();
      return { t: Math.round(sim.clock), objective: sim.objective, flags: sim.flags, cutscene: s, camera: c,
        actors: Object.keys(A).map(function (id) { var a = A[id], p = cs.pose(id);
          var target = a.target || (s.line && s.line.who === id ? null : null);
          return { id: id, x: +a.x.toFixed(2), y: +a.y.toFixed(2), facing: a.face, moving: !!a.moving, frame: a.frame, walk: +a.walk.toFixed(2), target: target,
            noFace: a.face === 'up' || a.face === 'down' ? 'top-down ' + a.face + ' frame' : undefined, asset: a.pal }; }),
        events: sim.events.slice(-12) };
    };
    return sim;
  }

  var API = { T: T, COLS: COLS, ROWS: ROWS, STEP: STEP, rows: ROWS_STR, props: PROPS, solid: solid, cast: CAST0, scripts: SCRIPTS, make: make, bridge: BRIDGE };
  root.GameDNA_CutsceneDemo = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
