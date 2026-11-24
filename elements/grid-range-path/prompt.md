Defaults: {{move}}=5, {{range}}=1 (1 / 1-2 / 2), {{costs}}=on, {{overlay}}=pulsing (solid / pulsing / checker), {{repeat}}=normal (slow / normal / fast).

Add a **grid movement range + path arrow** to my tile-map game using the module `grid-range-path.js` given at the end of this prompt.

**Rules**
- Paste the module **verbatim** into its own `<script>` before the game's script. Never edit it.
- Never delete or rename existing functions (the AI calls `steps()`); only add lines at the points below.
- Keep click-to-move, End Turn and restart working.

**Integration points (in my host/index.html)**

1. **Create the instance**, just before the boot section (`// ---- boot`), after all game functions:
```js
const GR = GameDNA_GridRange.create({
  cols: MW, rows: MH, tile: TS,
  params: { costs: '{{costs}}', overlay: '{{overlay}}', repeat: '{{repeat}}' },
  moveOf: u => u.mv, rangeOf: u => [u.rmin, u.rmax],   // always the host's own stats
  cost: (x, y) => TER[at(x, y)].cost, occupant: (x, y) => unitAt(x, y) || null, terrain: (x, y) => TER[at(x, y)],
  canSelect: u => u.side === 'a' && !u.acted, enabled: () => S.phase === 'player' && !S.over && !S.anim,
  setUnitPos: (u, x, y) => { u.x = x; u.y = y; }, onWait: u => afterMove(u),
  getCursor: () => S.cur, onCursor: (x, y) => { S.cur.x = x; S.cur.y = y; },
  drawPortrait: (ctx, u, x, y, t) => drawUnit(ctx, Object.assign({}, u, { acted: false }), x, y, t)
});
```

   If the game has its own after-move commands (Attack, Item…), keep them by adding `commands: u => [{id:'attack', label:'Attack', enabled: true}, {id:'wait', label:'Wait'}, {id:'back', label:'Back'}], onCommand: (id, u) => { /* run the game's existing handler */ }`.

2. **`step()`**: first line after the frame counter: `GR.update();`

3. **`draw()`**:
   - Right after the ground and `drawAnim(...)`: `GR.drawUnder(g, cam);`
   - Disable the host's own cursor block by changing its condition to `if (false)`; the module draws the cursor.
   - After the vignette and the TURN plate, before the toast and banner: `GR.drawOver(g, cam, [{ x: 4, y: 4, w: 58, h: 16 }]);` The list holds every HUD rect that the windows must avoid.
   - In the unit draw options, change bounce to `u === GR.unit && GR.mode === 'select'`.

4. **`unitPos(u)`**: add at its start `const gp = GR.drawPos(u); if (gp) return gp;` This makes the unit animate along the arrow.

5. **Input**:
   - `keydown`, right after `if (FREEZE) return;`: `if (GR.key(e.code, true, e.repeat)) { e.preventDefault(); return; }`
   - Add `addEventListener('keyup', e => GR.key(e.code, false));`
   - Add a mouse `pointermove` on the canvas that converts to a tile, the same way `pointerdown` does, and calls `GR.hover(x, y)`.
   - `confirm()`: add as its first line `if (S.phase === 'player' && !S.anim && !S.over) { GR.click(S.cur.x, S.cur.y); return; }`. `pointerdown` already sets `S.cur` and calls `confirm()`, so click-to-move keeps working: click a unit, then click a blue tile.
   - `cancel()`: add `GR.cancel();` before its body.

**Self-check without a browser**
1. `GR` is defined before boot, and every `GR.` call is in steps 1–5.
2. Every function that existed before still exists with the same name. Grep `function steps`, `function afterMove`, `function enemyAct`, `function endTurn`.
3. The module text is identical to the block below.
4. Trace a turn: confirm on Rowan → `select`; right ×2 updates `GR.path`; confirm → `walk` → `menu` → WAIT → `afterMove`; once all units have acted, `endTurn` runs and the module clears itself.

**Acceptance (screenshots if you can):**
- blue stops early in forest and never crosses the river or enemies, with a red fringe {{range}} deep;
- keyboard right, right, up, up gives a two-corner arrow with its head on the cursor, and a step back shortens it;
- mouse hover moves the arrow, and clicking a blue tile walks there;
- confirm walks tile by tile, BACK restores, WAIT acts;
- windows never cover the TURN plate or each other;
- End Turn → enemies act → the player phase returns, with no console errors.

**Module (paste verbatim):**

```js
/* GameDNA B-01 Grid movement range + path arrow  (module v1.2, no dependencies, no exports; optional skins)
   Global: window.GameDNA_GridRange.create(options) -> instance. See module/README.md.
   Owns: reach / stoppable / attack-fringe computation, path arrow that follows the cursor (keep-path / cut-back),
   cursor with key-repeat acceleration, overlays, arrow, cursor and info windows drawn at native resolution,
   tile-by-tile walk, WAIT / BACK menu, cancel. The host keeps its own units and map and answers callbacks.
   Skins (v1.2): when skins/skin-api.js is loaded, every visual goes through GameDNA_Skin.resolve(options.skin) (default 'pixel16',
   pixel-identical to the built-in look): skin.overlay, skin.path (if the skin has one, else the built-in arrow coloured from
   palette.overlay.path), skin.cursor, skin.frame, skin.text / measure, skin.bar. Without skin-api.js (or with skin: false) the
   built-in drawing below is used. */
(function (root) {
  'use strict';
  var DIRS = [[1, 0], [-1, 0], [0, -1], [0, 1]];
  var REPEAT = { slow: [16, 6, 3, 50], normal: [12, 4, 2, 40], fast: [8, 3, 1, 28] }; // delay, rate, fastRate, fastAfter (frames @60Hz)
  var RANGES = { '1': [1, 1], '1-2': [1, 2], '2': [2, 2] };
  var OVL = { move: ['48,100,240', '214,232,255'], atk: ['228,52,48', '255,214,200'] };
  var KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
    KeyZ: 'a', Enter: 'a', Space: 'a', KeyX: 'b', Escape: 'b', Backspace: 'b' };
  var GLYPH = {
    A: '01110,10001,10001,11111,10001,10001,10001', B: '11110,10001,10001,11110,10001,10001,11110', C: '01110,10001,10000,10000,10000,10001,01110',
    D: '11110,10001,10001,10001,10001,10001,11110', E: '11111,10000,10000,11110,10000,10000,11111', F: '11111,10000,10000,11110,10000,10000,10000',
    G: '01110,10001,10000,10111,10001,10001,01111', H: '10001,10001,10001,11111,10001,10001,10001', I: '01110,00100,00100,00100,00100,00100,01110',
    J: '00111,00010,00010,00010,00010,10010,01100', K: '10001,10010,10100,11000,10100,10010,10001', L: '10000,10000,10000,10000,10000,10000,11111',
    M: '10001,11011,10101,10101,10001,10001,10001', N: '10001,10001,11001,10101,10011,10001,10001', O: '01110,10001,10001,10001,10001,10001,01110',
    P: '11110,10001,10001,11110,10000,10000,10000', Q: '01110,10001,10001,10001,10101,10010,01101', R: '11110,10001,10001,11110,10100,10010,10001',
    S: '01111,10000,10000,01110,00001,00001,11110', T: '11111,00100,00100,00100,00100,00100,00100', U: '10001,10001,10001,10001,10001,10001,01110',
    V: '10001,10001,10001,10001,10001,01010,00100', W: '10001,10001,10001,10101,10101,10101,01010', X: '10001,10001,01010,00100,01010,10001,10001',
    Y: '10001,10001,01010,00100,00100,00100,00100', Z: '11111,00001,00010,00100,01000,10000,11111',
    0: '01110,10001,10011,10101,11001,10001,01110', 1: '00100,01100,00100,00100,00100,00100,01110', 2: '01110,10001,00001,00010,00100,01000,11111',
    3: '11111,00010,00100,00010,00001,10001,01110', 4: '00010,00110,01010,10010,11111,00010,00010', 5: '11111,10000,11110,00001,00001,10001,01110',
    6: '00110,01000,10000,11110,10001,10001,01110', 7: '11111,00001,00010,00100,01000,01000,01000', 8: '01110,10001,10001,01110,10001,10001,01110',
    9: '01110,10001,10001,01111,00001,00010,01100', '/': '00001,00010,00010,00100,01000,01000,10000', '-': '00000,00000,00000,01110,00000,00000,00000',
    '.': '00000,00000,00000,00000,00000,01100,01100', '?': '01110,10001,00001,00010,00100,00000,00100', ' ': '000,000,000,000,000,000,000'
  };
  function textW(s) { return s.length * 6 - 1; }
  function text(g, s, x, y, c1, c2) {
    for (var pass = 0; pass < 2; pass++) {
      var cx = x, str = String(s).toUpperCase();
      for (var i = 0; i < str.length; i++) {
        var ch = str[i], rows = (GLYPH[ch] || GLYPH['?']).split(',');
        for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < rows[ry].length; rx++) if (rows[ry][rx] === '1') {
          g.fillStyle = pass ? (ry < 4 ? (c1 || '#ffffff') : (c2 || '#c8d4ff')) : '#0a0c24';
          g.fillRect(cx + rx + (pass ? 0 : 1), y + ry + (pass ? 0 : 1), 1, 1);
        }
        cx += ch === ' ' ? 4 : 6;
      }
    }
  }
  var WTH = { a: ['#3a64d8', '#2c50b8', '#223e96', '#1a2e74', '#a8c8ff', '#0a1238'], b: ['#d85a48', '#b8402e', '#922c26', '#6a1c1e', '#ffc8b8', '#2a0608'], n: ['#4c5a8a', '#3e4a76', '#323c62', '#262e4e', '#c8d4f4', '#0a0e22'] };
  function frame(g, x, y, w, h, th) {
    var C = WTH[th] || WTH.n, i;
    g.globalAlpha = 0.95;
    for (i = 0; i < h - 2; i++) { g.fillStyle = C[Math.min(3, Math.floor(i / (h - 2) * 4))]; g.fillRect(x + 1, y + 1 + i, w - 2, 1); }
    g.globalAlpha = 1; g.fillStyle = '#06061a';
    g.fillRect(x + 2, y, w - 4, 1); g.fillRect(x + 2, y + h - 1, w - 4, 1); g.fillRect(x, y + 2, 1, h - 4); g.fillRect(x + w - 1, y + 2, 1, h - 4);
    g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + w - 2, y + 1, 1, 1); g.fillRect(x + 1, y + h - 2, 1, 1); g.fillRect(x + w - 2, y + h - 2, 1, 1);
    g.fillStyle = C[4]; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 5);
    g.fillStyle = C[5]; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
    [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]].forEach(function (p) { g.fillStyle = '#7a5410'; g.fillRect(p[0], p[1], 2, 2); g.fillStyle = '#ffe070'; g.fillRect(p[0], p[1], 1, 1); });
  }
  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function create(o) {
    var T = o.tile || 16, COLS = o.cols, ROWS = o.rows;
    var P = { move: 5, range: '1', costs: 'on', overlay: 'pulsing', repeat: 'normal' };
    var key = function (x, y) { return y * COLS + x; };
    var S = { mode: 'idle', unit: null, origin: null, reach: null, stop: null, fringe: null, path: [], age: 0, t: 0, menu: 0, buzz: 0, walk: null,
      held: {}, latch: {}, lastDir: null, cur: { x: 0, y: 0, px: 0, py: 0, trail: [], hold: null, held: 0 } };
    var arrow = { key: '', img: null, ox: 0, oy: 0, line: [] };
    var on = function (name) { var f = o[name]; if (f) return f.apply(null, [].slice.call(arguments, 1)); };
    function setParams(p) { for (var k in p) if (p[k] != null) P[k] = k === 'move' ? +p[k] : String(p[k]); if (S.mode === 'select') reselect(); }
    setParams(o.params || {});
    if (o.cursor) { S.cur.x = o.cursor.x; S.cur.y = o.cursor.y; S.cur.px = S.cur.x * T; S.cur.py = S.cur.y * T; }
    // per-unit stats: options.moveOf / rangeOf (alias move / range), else unit.move / unit.range, else the params
    var moveOf = function (u) { var f = o.moveOf || o.move; if (f) return f(u); return typeof u.move === 'number' ? u.move : P.move; };
    var rangeOf = function (u) {
      var f = o.rangeOf || o.range, r = f ? f(u) : (u.range != null ? u.range : P.range);
      if (typeof r === 'number') return [r, r]; if (Array.isArray(r)) return r; return RANGES[r] || [1, 1];
    };
    // position / identity adapters: options.posOf(unit) -> {x, y} tile, options.idOf(unit) -> stable id
    var posOf = function (u) { var f = o.posOf || o.tileOf; return f ? f(u) : { x: u.x, y: u.y }; };
    var same = function (a, b) { return a === b || (!!a && !!b && !!o.idOf && o.idOf(a) === o.idOf(b)); };
    var viewOf = function (g) { var v = o.view ? (typeof o.view === 'function' ? o.view() : o.view) : null; return { w: v ? v.w : g.canvas.width, h: v ? v.h : g.canvas.height, ox: v ? v.ox || 0 : 0, oy: v ? v.oy || 0 : 0 }; };
    var keymap = o.keys || KEYMAP, uiRects = [];
    // skin: resolved once; null = built-in drawing (no skin-api.js loaded, or options.skin === false)
    var SK = o.skin === false || !root.GameDNA_Skin ? null : root.GameDNA_Skin.resolve(o.skin);
    var SKP = SK && SK.palette, txtW = function (s) { return SK ? SK.measure(String(s)) : textW(String(s)); };
    var shown = function (u) { return !!u && (o.isVisible ? !!o.isVisible(u) : true); };   // display only (fog); movement rules still use occupant()
    var commandsOf = function (u) { var c = o.commands ? o.commands(u) : null; return (c && c.length ? c : [{ id: 'wait', label: 'WAIT' }, { id: 'back', label: 'BACK' }]).map(function (k) { return { id: k.id, label: String(k.label || k.id).toUpperCase(), enabled: typeof k.enabled === 'function' ? !!k.enabled(u) : k.enabled !== false }; }); };
    var costAt = function (x, y, u) { var c = o.cost(x, y, u); return c >= 99 ? 99 : (P.costs === 'off' ? 1 : c); };
    var isFoe = function (a, b) { return o.isEnemy ? o.isEnemy(a, b) : a.side !== b.side; };
    var team = function (u) { return o.team ? o.team(u) : (/^(a|player|ally|allies|hero|heroes|blue|p1|friend)$/i.test(String(u.side != null ? u.side : u.team)) ? 'a' : 'b'); };
    var enabled = function () { return o.enabled ? !!o.enabled() : true; };

    // ---- reach: Map<key,{cost,prev}>, stop: Set<key>, fringe: Set<key> ----
    function compute(u) {
      var mv = moveOf(u), up = posOf(u), reach = new Map(), s = key(up.x, up.y), open = [s];
      reach.set(s, { cost: 0, prev: -1 });
      while (open.length) {
        var bi = 0; for (var i = 1; i < open.length; i++) if (reach.get(open[i]).cost < reach.get(open[bi]).cost) bi = i;
        var k = open.splice(bi, 1)[0], x = k % COLS, y = (k / COLS) | 0, base = reach.get(k).cost;
        for (var d = 0; d < 4; d++) {
          var nx = x + DIRS[d][0], ny = y + DIRS[d][1]; if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          var oc = o.occupant(nx, ny); if (oc && !same(oc, u) && isFoe(u, oc)) continue;
          var c = costAt(nx, ny, u); if (c >= 99) continue;
          var nd = base + c, n = key(nx, ny), cur = reach.get(n); if (nd > mv || (cur && cur.cost <= nd)) continue;
          reach.set(n, { cost: nd, prev: k }); open.push(n);
        }
      }
      var stop = new Set(), fringe = new Set(), rr = rangeOf(u);
      reach.forEach(function (v, k) { var oc = o.occupant(k % COLS, (k / COLS) | 0); if (!oc || same(oc, u)) stop.add(k); });
      stop.forEach(function (k) {
        var x = k % COLS, y = (k / COLS) | 0;
        for (var dy = -rr[1]; dy <= rr[1]; dy++) for (var dx = -rr[1]; dx <= rr[1]; dx++) {
          var m = Math.abs(dx) + Math.abs(dy), nx = x + dx, ny = y + dy;
          if (m < rr[0] || m > rr[1] || nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          if (!reach.has(key(nx, ny))) fringe.add(key(nx, ny));
        }
      });
      return { reach: reach, stop: stop, fringe: fringe };
    }
    function pathCost(p) { var s = 0; for (var i = 1; i < p.length; i++) s += costAt(p[i].x, p[i].y, S.unit); return s; }
    function cheapest(x, y) { var out = [], k = key(x, y); if (!S.reach.has(k)) return null; while (k >= 0) { out.push({ x: k % COLS, y: (k / COLS) | 0 }); k = S.reach.get(k).prev; } return out.reverse(); }
    function updatePath(x, y) {
      if (S.mode !== 'select' || !S.reach.has(key(x, y))) return;
      for (var i = 0; i < S.path.length; i++) if (S.path[i].x === x && S.path[i].y === y) { S.path = S.path.slice(0, i + 1); return; }
      var l = S.path[S.path.length - 1];
      if (Math.abs(l.x - x) + Math.abs(l.y - y) === 1 && pathCost(S.path) + costAt(x, y, S.unit) <= moveOf(S.unit)) { S.path.push({ x: x, y: y }); return; }
      S.path = cheapest(x, y);
    }
    function select(u) {
      var R = compute(u); S.unit = u; S.mode = 'select'; S.reach = R.reach; S.stop = R.stop; S.fringe = R.fringe;
      var p = posOf(u); S.path = [{ x: p.x, y: p.y }]; S.age = 0; if (!S.origin) S.origin = { x: p.x, y: p.y };
    }
    function reselect() { var c = { x: S.cur.x, y: S.cur.y }; S.origin = null; select(S.unit); updatePath(c.x, c.y); }
    function clear() { S.mode = 'idle'; S.unit = null; S.origin = null; S.reach = S.stop = S.fringe = null; S.path = []; S.walk = null; }
    function setCursor(x, y, quiet) {
      x = Math.max(0, Math.min(COLS - 1, x)); y = Math.max(0, Math.min(ROWS - 1, y));
      if (x === S.cur.x && y === S.cur.y) return;
      S.cur.x = x; S.cur.y = y; if (!quiet) updatePath(x, y); on('onCursor', x, y);
    }
    // ---- actions ----
    function confirm() {
      if (!enabled() || S.mode === 'walk') return false;
      var x = S.cur.x, y = S.cur.y;
      if (S.mode === 'idle') {
        var u = o.occupant(x, y);
        if (u && (o.canSelect ? o.canSelect(u) : true)) { S.origin = null; select(u); return true; }
        S.buzz = 12; return false;
      }
      if (S.mode === 'select') {
        if (!S.stop.has(key(x, y))) { S.buzz = 12; return false; }
        var e = S.path[S.path.length - 1]; if (e.x !== x || e.y !== y) S.path = cheapest(x, y);
        if (S.path.length === 1) { S.mode = 'menu'; S.menu = firstCmd(); return true; }
        S.mode = 'walk'; S.walk = { i: 0, p: 0 }; return true;
      }
      if (S.mode === 'menu') { var cmd = commandsOf(S.unit)[S.menu]; if (!cmd || !cmd.enabled) { S.buzz = 12; return false; } return command(cmd.id); }
      return false;
    }
    function firstCmd() { var c = commandsOf(S.unit); for (var i = 0; i < c.length; i++) if (c[i].enabled) return i; return 0; }
    function command(id) {   // 'back' undoes the move; 'wait' calls onWait; anything else calls onCommand(id, unit, from, path)
      if (id === 'back') { back(); return true; }
      var w = S.unit, from = S.origin, path = S.path;
      if (id === 'wait' && (o.onWait || !o.onCommand)) { clear(); on('onWait', w, from, path); return true; }
      var r = o.onCommand ? o.onCommand(id, w, from, path) : on('onWait', w, from, path);
      if (r !== 'keep') clear();   // return 'keep' to leave the menu open (e.g. the host shows a target picker and may come back)
      return true;
    }
    function back() { var u = S.unit, o0 = S.origin; on('setUnitPos', u, o0.x, o0.y); select(u); setCursor(o0.x, o0.y, true); on('onBack', u); }
    function cancel() {
      if (S.mode === 'select') { var u = S.unit, o0 = S.origin; clear(); setCursor(o0.x, o0.y, true); on('onCancel', u); return true; }
      if (S.mode === 'menu') { back(); return true; }
      return false;
    }
    // ---- input ----
    function press(n) { if (!S.held[n]) { S.latch[n] = true; if (/left|right|up|down/.test(n)) S.lastDir = n; } S.held[n] = true; }
    function release(n) { S.held[n] = false; if (S.lastDir === n) S.lastDir = ['left', 'right', 'up', 'down'].filter(function (d) { return S.held[d]; })[0] || null; }
    function wants(n) {   // would this key do something right now?
      if (!enabled() || S.mode === 'walk') return false;
      if (/left|right|up|down/.test(n)) return true;
      if (n === 'a') { if (S.mode !== 'idle') return true; var u = o.occupant(S.cur.x, S.cur.y); return !!u && (o.canSelect ? o.canSelect(u) : true); }
      return n === 'b' && S.mode !== 'idle';
    }
    function keyEvent(code, down, isRepeat) {
      var n = keymap[code]; if (!n) return false;
      if (!down) { var was = !!S.held[n]; release(n); return was; }
      if (!wants(n)) return false;
      if (!isRepeat) press(n); return true;
    }
    function stepCursor() {
      var C = S.cur, R = REPEAT[P.repeat] || REPEAT.normal, V = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
      var fresh = ['left', 'right', 'up', 'down'].filter(function (d) { return S.latch[d]; })[0];
      if (fresh) { C.hold = fresh; C.held = 0; setCursor(C.x + V[fresh][0], C.y + V[fresh][1]); return; }
      var d = S.lastDir && S.held[S.lastDir] ? S.lastDir : null;
      if (!d) { C.hold = null; C.held = 0; return; }
      if (C.hold !== d) { C.hold = d; C.held = 0; }
      C.held++;
      if (C.held >= R[0] && (C.held - R[0]) % (C.held >= R[3] ? R[2] : R[1]) === 0) setCursor(C.x + V[d][0], C.y + V[d][1]);
    }
    function update() {
      S.t += 1 / 60;
      if (o.getCursor && S.mode !== 'walk') { var hc = o.getCursor(); if (hc && (hc.x !== S.cur.x || hc.y !== S.cur.y)) { var far = Math.abs(hc.x - S.cur.x) + Math.abs(hc.y - S.cur.y) > 1; setCursor(hc.x, hc.y); if (far) { S.cur.px = S.cur.x * T; S.cur.py = S.cur.y * T; } } }
      if (S.unit && S.mode === 'select') { var sp0 = posOf(S.unit); if (!same(o.occupant(sp0.x, sp0.y), S.unit)) clear(); }   // host restarted or the unit died
      if (!enabled() && S.mode !== 'walk') { if (S.mode !== 'idle') clear(); S.latch = {}; }
      else if (S.mode === 'walk') {
        S.walk.p += 1 / 6;
        if (S.walk.p >= 1) {
          S.walk.p = 0; S.walk.i++; var t = S.path[S.walk.i]; on('setUnitPos', S.unit, t.x, t.y); on('onStep', S.unit, t.x, t.y);
          if (S.walk.i >= S.path.length - 1) { S.mode = 'menu'; S.menu = firstCmd(); S.walk = null; }
        }
        S.latch = {};
      } else {
        if (S.mode === 'menu') { var cl = commandsOf(S.unit), nc = cl.length, st = S.latch.up ? nc - 1 : S.latch.down ? 1 : 0; if (st) for (var q = 0; q < nc; q++) { S.menu = (S.menu + st) % nc; if (cl[S.menu].enabled) break; } }
        else stepCursor();
        if (S.latch.a) confirm(); else if (S.latch.b) cancel();
        S.latch = {};
      }
      var C = S.cur, sp = C.held >= (REPEAT[P.repeat] || REPEAT.normal)[3] ? 8 : 4, ox = C.px, oy = C.py, tx = C.x * T, ty = C.y * T;
      C.px += Math.sign(tx - C.px) * Math.min(Math.abs(tx - C.px), sp); C.py += Math.sign(ty - C.py) * Math.min(Math.abs(ty - C.py), sp);
      if ((ox !== C.px || oy !== C.py) && C.held > 0) C.trail.unshift({ x: ox, y: oy, a: 1 });
      C.trail.forEach(function (p) { p.a -= 0.12; }); C.trail = C.trail.filter(function (p) { return p.a > 0; }).slice(0, 3);
      if (S.mode === 'select') S.age++;
      if (S.buzz > 0) S.buzz--;
    }
    function drawPos(u) {
      if (S.mode !== 'walk' || u !== S.unit) return null;
      var a = S.path[S.walk.i], b = S.path[S.walk.i + 1];
      return [Math.round((a.x + (b.x - a.x) * S.walk.p) * T), Math.round((a.y + (b.y - a.y) * S.walk.p) * T)];
    }
    // ---- drawing ----
    function overlay(g, cam, set, kind) {
      var col = OVL[kind], VV = viewOf(g), W = VV.w, H = VV.h, maxd = moveOf(S.unit);
      var has = function (x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS && set.has(key(x, y)); };
      Array.from(set.keys()).forEach(function (k) {   // Map and Set: iterate KEYS (Map.forEach passes the value first)
        var tx = k % COLS, ty = (k / COLS) | 0, X = tx * T - cam.x, Y = ty * T - cam.y;
        if (X >= W || Y >= H || X + T <= 0 || Y + T <= 0) return;
        var d = kind === 'move' ? S.reach.get(k).cost : maxd + 1, gr = Math.max(0, Math.min(1, (S.age * 0.55 - d) / 2));  // fade-in from cost
        if (gr <= 0) return;
        if (SK) {
          SK.overlay(g, { x: X, y: Y, w: T, h: T }, kind === 'atk' ? 'attack' : kind, S.t, { grow: gr, tile: { x: tx, y: ty }, pattern: P.overlay,
            seams: { right: has(tx + 1, ty), bottom: has(tx, ty + 1) }, edges: { top: !has(tx, ty - 1), bottom: !has(tx, ty + 1), left: !has(tx - 1, ty), right: !has(tx + 1, ty) } });
          return;
        }
        var a2 = 0.22;
        if (P.overlay === 'pulsing' && Math.sin((tx + ty) * 0.55 - S.t * 3.2) > 0.5) a2 = 0.30;
        if (P.overlay === 'checker') a2 = (tx + ty) % 2 ? 0.30 : 0.17;
        g.globalCompositeOperation = 'color'; g.fillStyle = 'rgba(' + col[0] + ',' + (0.72 * gr) + ')'; g.fillRect(X, Y, T, T);
        g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(' + col[0] + ',' + (a2 * gr) + ')'; g.fillRect(X, Y, T, T);
        g.fillStyle = 'rgba(' + col[1] + ',0.12)'; if (has(tx + 1, ty)) g.fillRect(X + T - 1, Y, 1, T); if (has(tx, ty + 1)) g.fillRect(X, Y + T - 1, T, 1);
        g.fillStyle = 'rgba(' + col[1] + ',' + (0.85 * gr) + ')';
        if (!has(tx, ty - 1)) g.fillRect(X, Y, T, 1); if (!has(tx, ty + 1)) g.fillRect(X, Y + T - 1, T, 1);
        if (!has(tx - 1, ty)) g.fillRect(X, Y, 1, T); if (!has(tx + 1, ty)) g.fillRect(X + T - 1, Y, 1, T);
      });
    }
    function buildArrow(path) {
      var xs = path.map(function (p) { return p.x; }), ys = path.map(function (p) { return p.y; }), h0 = T / 2;
      var minx = Math.min.apply(null, xs), miny = Math.min.apply(null, ys), w = (Math.max.apply(null, xs) - minx + 1) * T + 4, h = (Math.max.apply(null, ys) - miny + 1) * T + 4;
      var ox = minx * T - 2, oy = miny * T - 2, M = new Uint8Array(w * h), Cn = new Uint8Array(w * h), line = [];
      var cen = function (p) { return [p.x * T + h0 - 0.5 - ox, p.y * T + h0 - 0.5 - oy]; };
      var stamp = function (x, y, r, c) { for (var yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) for (var xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) { if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; var d = (xx - x) * (xx - x) + (yy - y) * (yy - y); if (d <= r * r) { M[yy * w + xx] = 1; if (c && d <= 0.3) Cn[yy * w + xx] = 1; } } };
      var seg = function (ax, ay, bx, by) { var n = Math.ceil(Math.hypot(bx - ax, by - ay) * 3); for (var i = 0; i <= n; i++) { var x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; stamp(x, y, 2.6, 1); line.push([x, y]); } };
      var dir = function (a, b) { return [Math.sign(b.x - a.x), Math.sign(b.y - a.y)]; }, n = path.length, i;
      for (i = 0; i < n; i++) {
        var c = cen(path[i]), di = i > 0 ? dir(path[i - 1], path[i]) : null, dout = i < n - 1 ? dir(path[i], path[i + 1]) : null;
        if (!di) { seg(c[0], c[1], c[0] + dout[0] * h0, c[1] + dout[1] * h0); continue; }
        var ex = c[0] - di[0] * h0, ey = c[1] - di[1] * h0;
        if (!dout) { seg(ex, ey, c[0] - di[0] * 3, c[1] - di[1] * 3); continue; }
        if (di[0] === dout[0] && di[1] === dout[1]) { seg(ex, ey, c[0] + dout[0] * h0, c[1] + dout[1] * h0); continue; }
        var kx = ex + dout[0] * h0, ky = ey + dout[1] * h0, a0 = Math.atan2(ey - ky, ex - kx), a1 = Math.atan2(c[1] + dout[1] * h0 - ky, c[0] + dout[0] * h0 - kx), da = a1 - a0;
        if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
        for (var s = 0; s <= 40; s++) { var aa = a0 + da * s / 40, px = kx + Math.cos(aa) * h0, py = ky + Math.sin(aa) * h0; stamp(px, py, 2.6, 1); line.push([px, py]); }
      }
      var s0 = cen(path[0]); stamp(s0[0], s0[1], 4.2, 0);
      var e = cen(path[n - 1]), dd = dir(path[n - 2], path[n - 1]);
      for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {   // head: 13 px base at centre-3, tip at centre+5.5
        var rx = xx - e[0], ry = yy - e[1], u = rx * dd[0] + ry * dd[1] + 3, v = Math.abs(rx * dd[1] - ry * dd[0]);
        if (u >= 0 && u <= 8.5 && v <= 6.5 * (1 - u / 8.5)) { M[yy * w + xx] = 1; Cn[yy * w + xx] = v <= 2.4 * (1 - u / 8.5) - 0.3 ? 1 : 0; }
      }
      var AC = SKP && SKP.overlay && SKP.overlay.path || { core: '#fff6d0', light: '#ffe486', mid: '#f0a830', dark: '#c06a14', outline: '#3a1206', spark: '#ffffff' };
      var cv = mkCanvas(w, h), q = cv.getContext('2d'), f = function (a, b) { return a >= 0 && b >= 0 && a < w && b < h && M[b * w + a]; };
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var k = y * w + x, col = null;
        if (M[k]) col = Cn[k] ? AC.core : (!f(x, y - 1) || !f(x - 1, y)) ? AC.light : (!f(x, y + 1) || !f(x + 1, y)) ? AC.dark : AC.mid;
        else if (f(x - 1, y) || f(x + 1, y) || f(x, y - 1) || f(x, y + 1) || f(x - 1, y - 1) || f(x + 1, y + 1) || f(x + 1, y - 1) || f(x - 1, y + 1)) col = AC.outline;
        if (col) { q.fillStyle = col; q.fillRect(x, y, 1, 1); }
      }
      arrow = { key: JSON.stringify(path), img: cv, ox: ox, oy: oy, line: line };
    }
    function drawArrow(g, cam, path) {
      if (path.length < 2) return;
      if (SK && SK.path) { SK.path(g, path.map(function (p) { return { x: p.x * T + T / 2 - cam.x, y: p.y * T + T / 2 - cam.y }; }), S.t, { alpha: 1, invalid: false }); return; }
      if (arrow.key !== JSON.stringify(path)) buildArrow(path);
      var X = arrow.ox - cam.x, Y = arrow.oy - cam.y; g.drawImage(arrow.img, X, Y);
      var p = arrow.line[Math.floor(((S.t * 1.2) % 1) * arrow.line.length)]; if (p) { g.fillStyle = SKP && SKP.overlay && SKP.overlay.path ? SKP.overlay.path.spark : '#ffffff'; g.fillRect(Math.floor(X + p[0] - 0.5), Math.floor(Y + p[1] - 0.5), 2, 2); }
    }
    function enterView(g) { var V = viewOf(g); g.save(); g.translate(V.ox, V.oy); g.beginPath(); g.rect(0, 0, V.w, V.h); g.clip(); return V; }
    function drawUnder(g, cam) {   // call after the ground, before units; draws inside options.view (default: whole canvas)
      enterView(g);
      if (S.mode === 'select') { overlay(g, cam, S.reach, 'move'); overlay(g, cam, S.fringe, 'atk'); if (S.age > 4) drawArrow(g, cam, S.path); }
      if (S.mode === 'walk') drawArrow(g, cam, S.path.slice(S.walk.i));
      g.restore();
    }
    function bracket(g, x, y, alpha, red) {
      if (SK) { SK.cursor(g, { x: x, y: y, w: T, h: T }, 'bracket', S.t, { alpha: alpha, invalid: !!red }); return; }
      var o1 = Math.floor(S.t * 3.6) % 2 ? 0 : -1, col = red ? ['#ffc0b0', '#e84838'] : ['#fff6c0', '#f0b830'];
      g.globalAlpha = alpha;
      var corner = function (cx, cy, sx, sy) {
        var pts = [], i; for (i = 0; i < 5; i++) pts.push([cx + sx * i, cy], [cx + sx * i, cy + sy]); for (i = 2; i < 5; i++) pts.push([cx, cy + sy * i], [cx + sx, cy + sy * i]);
        g.fillStyle = '#24100a'; pts.forEach(function (p) { g.fillRect(p[0] - 1, p[1] - 1, 3, 3); });
        pts.forEach(function (p) { g.fillStyle = (p[0] === cx || p[1] === cy) ? col[0] : col[1]; g.fillRect(p[0], p[1], 1, 1); });
      };
      corner(x + o1, y + o1, 1, 1); corner(x + T - 1 - o1, y + o1, -1, 1); corner(x + o1, y + T - 1 - o1, 1, -1); corner(x + T - 1 - o1, y + T - 1 - o1, -1, -1);
      g.globalAlpha = 1;
    }
    function drawOver(g, cam, avoid) {   // call after units (and after vignette); avoid = host HUD rects [{x,y,w,h}] windows must not cover
      var V = enterView(g), W = V.w, H = V.h, m = 4, cx = S.cur.px - cam.x, cy = S.cur.py - cam.y, i;
      g.globalCompositeOperation = 'source-over'; uiRects = [];
      if (enabled() && (S.mode === 'idle' || S.mode === 'select')) {
        var red = (S.mode === 'select' && !S.reach.has(key(S.cur.x, S.cur.y))) || S.buzz > 0;
        S.cur.trail.forEach(function (p) { bracket(g, p.x - cam.x, p.y - cam.y, p.a * 0.45, red); });
        bracket(g, cx + (S.buzz ? (S.buzz % 4 < 2 ? 1 : -1) : 0), cy, 1, red);
      }
      if (!enabled() && S.mode === 'idle') { g.restore(); return uiRects; }
      // windows: lowest-score corner; host rects and placed windows are forbidden
      var boxes = [], placed = (avoid || []).map(function (r) { return [r.x - V.ox - 2, r.y - V.oy - 2, r.w + 4, r.h + 4]; });   // avoid rects are in canvas px
      var x0 = Math.floor(cam.x / T), y0 = Math.floor(cam.y / T);
      for (var ty = y0; ty <= y0 + Math.ceil(H / T); ty++) for (var tx = x0; tx <= x0 + Math.ceil(W / T); tx++) {
        if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) continue; var oc = o.occupant(tx, ty); if (!shown(oc)) continue;
        var pp = drawPos(oc) || [tx * T, ty * T]; boxes.push([pp[0] - cam.x, pp[1] - cam.y - 4, T, T + 4, oc === S.unit ? 90 : 60]);
      }
      if (S.mode === 'walk') { var wp = drawPos(S.unit); boxes.push([wp[0] - cam.x, wp[1] - cam.y - 4, T, T + 4, 90]); }
      if (S.mode !== 'walk') boxes.push([cx - 2, cy - 2, T + 4, T + 4, 200]);
      var fx = S.unit && S.mode !== 'select' ? (drawPos(S.unit) || [posOf(S.unit).x * T])[0] - cam.x : cx, right = fx + T / 2 < W / 2;
      var place = function (w, h, vert, kind) {
        var best = null;
        [right, !right].forEach(function (r, si) { vert.forEach(function (v, vi) {
          var x = r ? W - w - m : m, y = v === 'top' ? m : v === 'bottom' ? H - h - m : v;
          var ov = function (b) { return Math.max(0, Math.min(x + w, b[0] + b[2]) - Math.max(x, b[0])) * Math.max(0, Math.min(y + h, b[1] + b[3]) - Math.max(y, b[1])); };
          var sc = si * 30 + vi * 10; boxes.forEach(function (b) { if (ov(b)) sc += b[4] * (1 + ov(b) / 64); }); placed.forEach(function (b) { if (ov(b)) sc += 1e6; });
          if (!best || sc < best.sc) best = { x: x, y: y, sc: sc };
        }); });
        placed.push([best.x - 2, best.y - 2, w + 4, h + 4]); uiRects.push({ x: best.x + V.ox, y: best.y + V.oy, w: w, h: h, kind: kind }); return best;
      };
      var hov = S.mode === 'idle' ? o.occupant(S.cur.x, S.cur.y) : S.unit; if (hov && !shown(hov)) hov = null;
      if (hov) { var ext = S.mode === 'select', b = place(88, ext ? 42 : 32, ['top', 'bottom', m + 46, H - 88], 'unit'); unitWin(g, b.x, b.y, hov, ext ? pathCost(S.path) + '/' + moveOf(S.unit) : null); }
      if (S.mode === 'menu') { var cm = commandsOf(S.unit), mw = menuW(cm), mh = cm.length * 12 + 10, b2 = place(mw, mh, ['top', 'bottom', m + 46, H - mh - 50], 'menu'); menuWin(g, b2.x, b2.y, cm, mw); }
      if (S.mode !== 'walk') {
        var tt = S.mode === 'menu' ? posOf(S.unit) : { x: Math.round(S.cur.px / T), y: Math.round(S.cur.py / T) };
        var b3 = place(52, 42, ['bottom', 'top', m + 46, H - 92], 'terrain'); terrainWin(g, b3.x, b3.y, o.terrain(tt.x, tt.y) || {});
      }
      if (enabled() && (S.mode === 'idle' || S.mode === 'select')) uiRects.push({ x: cx - 2 + V.ox, y: cy - 2 + V.oy, w: T + 4, h: T + 4, kind: 'cursor' });
      g.restore();
      return uiRects;
    }
    function terrainWin(g, x, y, tr) {
      var nm = String(tr.name || tr.n || '?'), def = String(tr.def || 0), avo = String(tr.avo || 0);
      if (SK) {
        var Tx = SKP.text; SK.frame(g, { x: x, y: y, w: 52, h: 42 }, { team: 'n' }); SK.frame(g, { x: x + 4, y: y + 4, w: 44, h: 11 }, { role: 'backing' });
        SK.text(g, nm, x + 26, y + 6, { align: 'center', color: Tx.title, color2: Tx.title2 });
        SK.text(g, 'DEF', x + 6, y + 18, { color: Tx.label, color2: Tx.label2 }); SK.text(g, def, x + 46, y + 18, { align: 'right' });
        SK.text(g, 'AVO', x + 6, y + 29, { color: Tx.label, color2: Tx.label2 }); SK.text(g, avo, x + 46, y + 29, { align: 'right' });
        return;
      }
      frame(g, x, y, 52, 42, 'n'); g.fillStyle = 'rgba(6,8,30,0.4)'; g.fillRect(x + 4, y + 4, 44, 11);
      text(g, nm, x + 26 - Math.floor(textW(nm) / 2), y + 6, '#fff4c8', '#e8c870');
      text(g, 'DEF', x + 6, y + 18, '#b8d0ff', '#8ca8e8'); text(g, def, x + 46 - textW(def), y + 18);
      text(g, 'AVO', x + 6, y + 29, '#b8d0ff', '#8ca8e8'); text(g, avo, x + 46 - textW(avo), y + 29);
    }
    function unitWin(g, x, y, u, extra) {
      var info = o.unitInfo ? o.unitInfo(u) : { name: u.name, hp: u.hp, max: u.max || u.maxHp || u.hp }, th = team(u);
      if (SK) {
        var Tx = SKP.text, Tm = SKP.team, sx = x, sy = y, nm2 = String(info.name).slice(0, 9), hs2 = info.hp + '/' + info.max;
        SK.frame(g, { x: sx, y: sy, w: 88, h: extra ? 42 : 32 }, { team: th });
        // portrait well: a skin that draws the 'backing' role itself gets it (team-tinted); otherwise the classic inked two-band well from tokens
        if (SK.frameRoles && SK.frameRoles.indexOf('backing') >= 0) SK.frame(g, { x: sx + 4, y: sy + 4, w: 20, h: 24 }, { role: 'backing', team: th });
        else { g.fillStyle = SKP.ink; g.fillRect(sx + 4, sy + 4, 20, 24); g.fillStyle = th === 'a' ? Tm.aLight : Tm.bLight; g.fillRect(sx + 5, sy + 5, 18, 11); g.fillStyle = th === 'a' ? Tm.aDark : Tm.bDark; g.fillRect(sx + 5, sy + 16, 18, 11); }
        if (o.drawPortrait) { g.save(); g.beginPath(); g.rect(sx + 5, sy + 5, 18, 22); g.clip(); o.drawPortrait(g, u, sx + 6, sy + 10, S.t); g.restore(); }
        SK.text(g, nm2, sx + 28, sy + 5, { color: Tx.main, color2: th === 'a' ? Tm.aText : Tm.bText });
        SK.text(g, 'HP', sx + 28, sy + 15, { color: Tx.gold, color2: Tx.gold2 }); SK.text(g, hs2, sx + 83, sy + 15, { align: 'right' });
        SK.bar(g, { x: sx + 27, y: sy + 24, w: 56, h: 5 }, Math.max(0, info.hp) / info.max, info.hp / info.max < 0.34 ? 'hpLow' : 'hp', { style: 'meter', px: Math.round(54 * Math.max(0, info.hp) / info.max) });
        if (extra) { SK.text(g, 'MOVE', sx + 6, sy + 32, { color: Tx.label, color2: Tx.label2 }); SK.text(g, extra, sx + 83, sy + 32, { align: 'right', color: Tx.title, color2: Tx.title2 }); }
        return;
      }
      frame(g, x, y, 88, extra ? 42 : 32, th);
      g.fillStyle = '#06061a'; g.fillRect(x + 4, y + 4, 20, 24);
      g.fillStyle = th === 'a' ? '#c8dcff' : '#ffd8cc'; g.fillRect(x + 5, y + 5, 18, 11); g.fillStyle = th === 'a' ? '#94b4f0' : '#f0a898'; g.fillRect(x + 5, y + 16, 18, 11);
      if (o.drawPortrait) { g.save(); g.beginPath(); g.rect(x + 5, y + 5, 18, 22); g.clip(); o.drawPortrait(g, u, x + 6, y + 10, S.t); g.restore(); }
      var nm = String(info.name).slice(0, 9), hs = info.hp + '/' + info.max;
      text(g, nm, x + 28, y + 5, '#ffffff', th === 'a' ? '#d0e0ff' : '#ffd8cc');
      text(g, 'HP', x + 28, y + 15, '#ffe890', '#e8c048'); text(g, hs, x + 83 - textW(hs), y + 15);
      var bw = 54, f = Math.round(bw * Math.max(0, info.hp) / info.max), low = info.hp / info.max < 0.34;
      g.fillStyle = '#06040e'; g.fillRect(x + 27, y + 24, bw + 2, 5); g.fillStyle = '#2a1e36'; g.fillRect(x + 28, y + 25, bw, 3);
      g.fillStyle = low ? '#f05848' : '#7ce060'; g.fillRect(x + 28, y + 25, f, 3); g.fillStyle = low ? '#ffb0a0' : '#d8ffb8'; g.fillRect(x + 28, y + 25, f, 1);
      if (extra) { text(g, 'MOVE', x + 6, y + 32, '#b8d0ff', '#8ca8e8'); text(g, extra, x + 83 - textW(extra), y + 32, '#fff4c8', '#e8c870'); }
    }
    function menuW(cm) { return Math.max(52, 24 + Math.max.apply(null, cm.map(function (c) { return txtW(c.label); }))); }
    function menuWin(g, x, y, cm, w) {
      if (SK) {
        var Tx = SKP.text; SK.frame(g, { x: x, y: y, w: w, h: cm.length * 12 + 10 }, { team: 'a' });
        cm.forEach(function (c, i) { if (i === S.menu) SK.frame(g, { x: x + 3, y: y + 5 + i * 12, w: w - 6, h: 11 }, { role: 'row' }); SK.text(g, c.label, x + 18, y + 7 + i * 12, { color: !c.enabled ? Tx.dim : i === S.menu ? Tx.select : Tx.main, color2: !c.enabled ? Tx.dim2 : null }); });
        SK.cursor(g, { x: x + 6, y: y + 8 + S.menu * 12, w: 7, h: 5 }, 'hand', S.t);
        return;
      }
      frame(g, x, y, w, cm.length * 12 + 10, 'a');
      cm.forEach(function (c, i) { if (i === S.menu) { g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x + 3, y + 5 + i * 12, w - 6, 11); } text(g, c.label, x + 18, y + 7 + i * 12, !c.enabled ? '#8088a8' : i === S.menu ? '#fff4c0' : '#ffffff', !c.enabled ? '#626a88' : null); });
      var hx = x + 6 + (Math.floor(S.t * 4) % 2), hy = y + 8 + S.menu * 12;
      ['.oo....', 'owwoooo', 'owwwwwo', 'owwwwo.', '.oooo..'].forEach(function (r, yy) { for (var xx = 0; xx < 7; xx++) if (r[xx] !== '.') { g.fillStyle = r[xx] === 'o' ? '#1a0e08' : '#fff8e8'; g.fillRect(hx + xx, hy + yy, 1, 1); } });
    }
    // pointer: hover aims (also during select), click = aim + confirm; in the menu a click picks WAIT on the unit, otherwise the highlighted item
    function hover(x, y) { if (enabled() && (S.mode === 'idle' || S.mode === 'select')) setCursor(x, y); }
    function click(x, y) {
      if (!enabled() || S.mode === 'walk') return false;
      if (S.mode === 'menu') { var up = posOf(S.unit); if (x === up.x && y === up.y) S.menu = 0; return confirm(); }
      setCursor(x, y); return confirm();
    }
    return {
      update: update, drawUnder: drawUnder, drawOver: drawOver, key: keyEvent, press: press, release: release,
      hover: hover, click: click, confirm: confirm, cancel: cancel, select: function (u) { S.origin = null; select(u); }, clear: clear,
      setCursor: function (x, y) { setCursor(x, y); S.cur.px = S.cur.x * T; S.cur.py = S.cur.y * T; }, setParams: setParams, drawPos: drawPos,
      walkTiles: function () { return S.mode === 'walk' ? S.path.slice(S.walk.i + 1) : []; },
      get mode() { return S.mode; }, get unit() { return S.unit; }, get path() { return S.path; }, get cursor() { return { x: S.cur.x, y: S.cur.y, px: S.cur.px, py: S.cur.py }; },
      get reach() { return S.reach; }, get stop() { return S.stop; }, get fringe() { return S.fringe; }, get params() { return P; },
      getUIRects: function () { return uiRects.slice(); },   // canvas-px rects of the windows/cursor drawn by the last drawOver()
      // non-interactive helpers for autopilots / AI (no state change)
      reachOf: function (u) { var R = compute(u); return { move: new Set(R.reach.keys()), stop: R.stop, fringe: R.fringe, cost: R.reach }; },
      pathTo: function (u, x, y) { var R = compute(u), out = [], k = key(x, y); if (!R.reach.has(k)) return null; while (k >= 0) { out.push({ x: k % COLS, y: (k / COLS) | 0 }); k = R.reach.get(k).prev; } return out.reverse(); },
      tileKey: key, get skin() { return SK; }, commands: function () { return S.unit ? commandsOf(S.unit) : []; }, get menuIndex() { return S.menu; },
      pathCost: function () { return S.path.length ? pathCost(S.path) : 0; }, focus: function () { var p = S.mode === 'walk' ? drawPos(S.unit) : null; return p ? { x: p[0], y: p[1] } : { x: S.cur.x * T, y: S.cur.y * T }; }
    };
  }
  root.GameDNA_GridRange = { create: create, REPEAT: REPEAT, RANGES: RANGES, version: '1.2.1' };
})(typeof window !== 'undefined' ? window : this);
```
