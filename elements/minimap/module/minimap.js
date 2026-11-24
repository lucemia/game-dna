/* GameDNA C-06 Minimap (minimap.js) v1.1.1 - plain script, no dependencies, no import/export, one global: GameDNA_Minimap
 *
 * A corner minimap of the game's level: the tile grid (or collision rects) baked once into a cached image per zoom,
 * explored / unexplored cells (its own fog, or the explored data of a fog-of-war module), a player arrow that points
 * where the player faces, markers for goals, enemies, items, people and doors, edge arrows for tracked targets that are
 * off the minimap, zoom levels and a full-map view. It places itself in a corner of the game view and never covers
 * the HUD rects the game gives it. Works for top-down maps and side-on levels. It reads the game; it never changes it.
 *
 *   var mm = GameDNA_Minimap.create({ cols, rows, tile, cellAt: (c, r) => kind, view: {x, y, w, h},
 *     safeRects: () => [hudRect], player: () => ({x, y, facing}), markers: () => [{id, kind, x, y}],
 *     camera: () => ({x, y, w, h}), params: {corner: 'tr', mode: 'topdown'} });
 *   mm.update(stepMs)        // every fixed step: reveals cells around the player (and on screen)
 *   mm.draw(ctx)             // after the HUD: the corner minimap, or the full map while it is open
 *   mm.toggleFull(); mm.cycleZoom(); mm.reset(); mm.refresh();
 *
 * Source is ASCII only (pages may load it without a charset).
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.1';

  /* 3x5 bitmap font: char + 5 rows, each a base-32 digit of 3 bits */
  var F3S = "075557126227261247361216455711574616634757771222875757975716A25755B65656C34443D65556E74647F74644G34553H55755I72227J11152K55655L44447M57755N65555O25552P65644Q25563R65655S34216T72222U55557V55552W55575X55255Y55222Z71247!22202.00002-00700+02720/11244:02020'22000?61202(24442)21112,00024%51245";
  var FONT3 = (function () { var o = {}, i, r; for (i = 0; i + 5 < F3S.length + 1; i += 6) { var g = []; for (r = 0; r < 5; r++) g.push(parseInt(F3S.charAt(i + 1 + r), 32) || 0); o[F3S.charAt(i)] = g; } return o; })();

  /* cell kinds: index = byte in the grid */
  var KINDS = ['empty', 'floor', 'grass', 'path', 'sand', 'bridge', 'door', 'tree', 'wall', 'building', 'water', 'hazard', 'landmark'];
  var KI = {}; KINDS.forEach(function (k, i) { KI[k] = i; });
  var BLOCK = { tree: 1, wall: 1, building: 1 };
  var ALIAS = { solid: 'wall', rock: 'wall', cliff: 'wall', stone: 'wall', forest: 'tree', bush: 'tree', house: 'building', roof: 'building',
    road: 'path', dirt: 'path', cobble: 'path', ground: 'floor', room: 'floor', air: 'empty', sky: 'empty', none: 'empty', void: 'empty',
    lava: 'hazard', spikes: 'hazard', pit: 'hazard', river: 'water', sea: 'water', lake: 'water', gate: 'door', exit: 'door', stairs: 'door' };

  /* themes: atlas = warm parchment for maps seen from above, sonar = dark rooms with bright walls for side-on levels */
  var THEMES = {
    atlas: { unknown: '#3a2f48', unknown2: '#4a3d5a', poi: '#fff1c8', back: '#231c2b', empty: '#cdb98c', floor: '#d6c495', grass: '#b3bd80', path: '#eedcaa', sand: '#e6d39a',
      bridge: '#c79a5e', door: '#f0c45a', tree: '#64824a', wall: '#6e5844', building: '#b0604a', water: '#5f93bd', hazard: '#d0603e', landmark: '#ff00ff',
      edge: '#3a2c24', waterEdge: '#3f6f98', ink: '#160e1c', rimLight: '#f6e7c2', rimDark: '#7c5a3c', view: '#fff6d8', text: '#f6ecd0', dim: '#bfae8a',
      player: '#ffffff', playerRim: '#ffd25a', goal: '#ffcc33', enemy: '#ea4a52', item: '#4fd8f0', npc: '#86e27c', door2: '#ffffff', panel: '#2a2132', panel2: '#1c1622' },
    sonar: { unknown: '#0d1528', unknown2: '#15223c', poi: '#e8f4ff', back: '#060912', empty: '#28507a', floor: '#2c5a86', grass: '#2f6080', path: '#3a6a94', sand: '#3e6888',
      bridge: '#6a7fa0', door: '#ffd36a', tree: '#1d3a48', wall: '#152640', building: '#22385e', water: '#1f6aa0', hazard: '#d0503c', landmark: '#ff00ff',
      edge: '#a6dcff', waterEdge: '#5fb0e0', ink: '#03050c', rimLight: '#8cc8f2', rimDark: '#1c3352', view: '#d8f0ff', text: '#e4f4ff', dim: '#8eb2cc',
      player: '#ffffff', playerRim: '#ffd25a', goal: '#ffcc33', enemy: '#ff5a5a', item: '#5ff0d8', npc: '#9ef08a', door2: '#ffffff', panel: '#101a2e', panel2: '#0a1020' }
  };

  var DEFAULTS = { mode: 'topdown', corner: 'tr', size: 0.28, aspect: 0, zooms: 'auto', zoom: 0, fog: 'explore', reveal: 5, revealView: 'on', markSize: 1,
    enemies: 'on', arrows: 'on', viewFrame: 'on', shape: 'square', opacity: 1, theme: 'auto', render: 'auto', margin: 4, legend: 'on', fadeUnder: 0.4 };
  var RANGES = { size: [0.1, 0.5], aspect: [0, 2], zoom: [0, 9], reveal: [0, 40], opacity: [0.3, 1], margin: [0, 32], fadeUnder: [0, 1], markSize: [1, 2] };
  var MARK_ORDER = ['poi', 'door', 'item', 'npc', 'enemy', 'goal'];
  var MARK_LABEL = { goal: 'GOAL', enemy: 'FOE', item: 'ITEM', npc: 'NPC', door: 'EXIT' };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  var RGBC = {};
  function rgb(c) {
    var v = RGBC[c]; if (v) return v;
    var s = String(c || '#000').trim(), m;
    if (s.charAt(0) === '#') { if (s.length === 4) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]; var n = parseInt(s.slice(1, 7), 16); v = [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    else if ((m = s.match(/rgba?\(([^)]+)\)/))) { var p = m[1].split(','); v = [+p[0] || 0, +p[1] || 0, +p[2] || 0]; }
    else v = [128, 128, 128];
    return (RGBC[c] = v);
  }
  function rgba(c, a) { var A = rgb(c); return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + clamp(a, 0, 1).toFixed(3) + ')'; }
  function mix(a, b, k) { var A = rgb(a), B = rgb(b); return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * k) + ',' + Math.round(A[1] + (B[1] - A[1]) * k) + ',' + Math.round(A[2] + (B[2] - A[2]) * k) + ')'; }
  function mk(w, h) { var c = (root.document && root.document.createElement('canvas')) || null; if (c) { c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); } return c; }
  function hit(a, b, gap) { gap = gap || 0; return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y; }
  function inside(a, v) { return a.x >= v.x - 0.01 && a.y >= v.y - 0.01 && a.x + a.w <= v.x + v.w + 0.01 && a.y + a.h <= v.y + v.h + 0.01; }
  function text3(g, str, x, y, u, col) {
    g.fillStyle = col; str = String(str).toUpperCase();
    for (var i = 0; i < str.length; i++) { var gl = FONT3[str.charAt(i)]; if (gl) for (var r = 0; r < 5; r++) for (var c = 0; c < 3; c++) if (gl[r] & (4 >> c)) g.fillRect(x + c * u, y + r * u, u, u); x += 4 * u; }
  }
  function text3W(str, u) { return Math.max(0, String(str).length * 4 * u - u); }
  function hsh(x, y) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }

  /* facing -> angle (radians, 0 = right, PI/2 = down, screen y grows down) */
  var WORDS = { right: 0, r: 0, east: 0, e: 0, down: Math.PI / 2, d: Math.PI / 2, south: Math.PI / 2, s: Math.PI / 2, left: Math.PI, l: Math.PI, west: Math.PI, w: Math.PI,
    up: -Math.PI / 2, u: -Math.PI / 2, north: -Math.PI / 2, n: -Math.PI / 2 };
  function facingAngle(p, prev) {
    if (!p) return prev;
    if (p.angle != null && isFinite(+p.angle)) return +p.angle;
    var f = p.facing != null ? p.facing : p.face != null ? p.face : p.dir;
    if (f == null) return prev;
    if (typeof f === 'string') {
      var s = f.toLowerCase().replace(/[\s_]/g, '-'), parts = s.split('-'), x = 0, y = 0, k;
      if (WORDS[s] != null) return WORDS[s];
      for (k = 0; k < parts.length; k++) { var a = WORDS[parts[k]]; if (a != null) { x += Math.cos(a); y += Math.sin(a); } }
      return x || y ? Math.atan2(y, x) : prev;
    }
    if (typeof f === 'number') { if (f === 0) return prev; return f > 0 ? 0 : Math.PI; }   // +1 / -1 (sign) = right / left
    if (typeof f === 'object' && (+f.x || +f.y)) return Math.atan2(+f.y || 0, +f.x || 0);
    return prev;
  }

  /* arrow polygon (unit length), centroid at the origin, tip along +x */
  var ARROW = (function () {
    var pts = [[0.7, 0], [-0.45, -0.45], [-0.2, 0], [-0.45, 0.45]], A = 0, cx = 0, cy = 0, i;
    for (i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length], cr = p[0] * q[1] - q[0] * p[1]; A += cr; cx += (p[0] + q[0]) * cr; cy += (p[1] + q[1]) * cr; }
    A /= 2; cx /= 6 * A; cy /= 6 * A;
    return pts.map(function (p) { return [p[0] - cx, p[1] - cy]; });
  })();
  // rim arrow pixel sprites, pointing right and down-right (h = highlight pixel); rotated by 90 degrees for the other directions
  var EDGE_S = ['X......', 'XXX....', 'XhXXX..', 'XXXXXXX', 'XXXXX..', 'XXX....', 'X......'];
  var EDGE_D = ['......X', '.....XX', '....XXX', '...XXXX', '..XhXXX', '.XXXXXX', 'XXXXXXX'];
  function inPoly(x, y, P) { var c = false; for (var i = 0, j = P.length - 1; i < P.length; j = i++) { if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; } return c; }

  function create(options) {
    var o = options || {}, P = {}, TH = THEMES.atlas, SK = null, warned = {};
    var ST = { updates: 0, draws: 0, fullDraws: 0, errors: 0, noRoom: 0, moved: 0, rebuilds: 0, revealed: 0, zoomChanges: 0, fullToggles: 0 };
    var tint = {}, cols = 1, rows = 1, tile = 16, grid = new Uint8Array(1), explored = new Uint8Array(1), exploredN = 0, fogC = null, fogG = null, fogDirty = true;
    var caches = {}, arrowCache = {}, clock = 0, zoomI = 0, full = false, lastPlayerCell = null, lastCamKey = '', scanRow = 0;
    var drawnRec = null, lastPlayer = null, lastAngle = 0, fade = 0, fadeInit = false, lastView = null;
    try { if (o.skin != null && o.skin !== false && root.GameDNA_Skin) SK = root.GameDNA_Skin.resolve(o.skin); } catch (e) { SK = null; }

    function warn(k, msg) { if (warned[k]) return; warned[k] = 1; if (root.console) console.warn('[GameDNA_Minimap] ' + msg); }
    function emit(ev) { if (typeof o.debug === 'function') try { o.debug(ev); } catch (e) { } }
    function call(fn, args, d) { if (typeof fn !== 'function') return d; try { var v = fn.apply(null, args || []); return v === undefined ? d : v; } catch (e) { ST.errors++; warn('cb' + (fn.name || ''), 'a game callback threw: ' + e.message); return d; } }
    function val(v, d) { return typeof v === 'function' ? call(v, [], d) : v == null ? d : v; }

    function setParams(p) {
      p = p || {};
      for (var k in DEFAULTS) {
        var v = p[k] != null && p[k] !== '' ? p[k] : P[k] != null ? P[k] : DEFAULTS[k];
        if (typeof DEFAULTS[k] === 'number') { v = num(v, DEFAULTS[k]); if (RANGES[k]) v = clamp(v, RANGES[k][0], RANGES[k][1]); }
        else v = String(v);
        P[k] = v;
      }
      var th = P.theme === 'auto' ? (P.mode === 'side' ? 'sonar' : 'atlas') : P.theme;
      TH = {}; var base = THEMES[th] || THEMES.atlas, key;
      for (key in base) TH[key] = base[key];
      if (SK) { var tk = function (path, d) { try { var v = SK.token(path); return typeof v === 'string' && v !== path ? v : d; } catch (e) { return d; } };
        TH.ink = tk('ink', TH.ink); TH.rimLight = tk('ui.highlight', TH.rimLight); TH.rimDark = tk('ui.shadow', TH.rimDark); TH.panel = tk('ui.fill', TH.panel);
        TH.text = tk('text.main', TH.text); TH.enemy = tk('team.b', TH.enemy); TH.npc = tk('team.n', TH.npc); TH.goal = tk('text.accent', TH.goal); }
      zoomI = clamp(Math.round(P.zoom), 0, zoomList().length - 1);
      caches = {};
    }
    var autoZ = [2, 3];
    function zoomList() { if (P.zooms === 'auto') return autoZ; var z = String(P.zooms).split(/[ ,]+/).map(Number).filter(function (n) { return n > 0 && isFinite(n); }); return z.length ? z : [2, 3, 4]; }
    // auto zoom levels (map px per cell, in units u): the closest level still shows >= 1.5x the camera view
    function autoZoom(view) {
      if (P.zooms !== 'auto' || !view) return;
      var u = unitOf(view), W = Math.round(Math.max(40 * u, view.w * P.size)), cam = call(o.camera, [], null), cw = cam && cam.w > 0 ? cam.w : view.w;
      var m = Math.max(1, Math.floor(W * tile / (1.5 * cw * u))), z = m >= 3 ? [Math.ceil(m * 0.6), m] : [1, Math.max(2, m)];
      if (z[0] === z[1]) z = [z[0]];
      if (z.join() !== autoZ.join()) { autoZ = z; zoomI = clamp(zoomI, 0, z.length - 1); caches = {}; }
    }

    /* ---------- the grid ---------- */
    function kindIndex(v) {
      if (v && typeof v === 'object') v = v.kind;
      if (v == null || v === false || v === 0 || v === '') return P.mode === 'side' ? KI.empty : KI.floor;
      if (v === true || v === 1) return KI.wall;
      if (typeof v === 'number') return clamp(v | 0, 0, KINDS.length - 1);
      var s = String(v).toLowerCase(); s = ALIAS[s] || s;
      return KI[s] != null ? KI[s] : KI.floor;
    }
    function readGrid() {
      cols = Math.max(1, num(val(o.cols, 0), 0) | 0); rows = Math.max(1, num(val(o.rows, 0), 0) | 0); tile = Math.max(0.0001, num(val(o.tile, 16), 16));
      var world = val(o.world, null);
      if ((!o.cols || !o.rows) && world && world.w && world.h) { cols = Math.max(1, Math.ceil(world.w / tile)); rows = Math.max(1, Math.ceil(world.h / tile)); }
      var N = cols * rows, c, r;
      if (grid.length !== N) { grid = new Uint8Array(N); var ex = new Uint8Array(N); explored = ex; exploredN = 0; }
      tint = {};
      if (typeof o.cellAt === 'function') { for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) { var cv = call(o.cellAt, [c, r], null); grid[r * cols + c] = kindIndex(cv); if (cv && typeof cv === 'object' && cv.color) tint[r * cols + c] = rgb(cv.color); } }
      else grid.fill(P.mode === 'side' ? KI.empty : KI.floor);
      var rects = val(o.rects, null);
      if (rects && rects.length) rects.forEach(function (q) {
        if (!q) return; var k = kindIndex(q.kind != null ? q.kind : true);
        var c0 = Math.floor(q.x / tile), r0 = Math.floor(q.y / tile), c1 = Math.ceil((q.x + q.w) / tile) - 1, r1 = Math.ceil((q.y + q.h) / tile) - 1;
        for (r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) for (c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) grid[r * cols + c] = k;
      });
      caches = {}; fogDirty = true; ST.rebuilds++;
      if (!fogC || fogC.width !== cols || fogC.height !== rows) { fogC = mk(cols, rows); fogG = fogC && fogC.getContext('2d'); fogDirty = true; }
    }

    /* ---------- fog (explored cells) ---------- */
    function fogShared() { return o.fog && typeof o.fog.isExplored === 'function'; }
    function fogOff() { return P.fog === 'off'; }
    function isExp(c, r) { if (fogOff()) return true; if (c < 0 || r < 0 || c >= cols || r >= rows) return false; return !!explored[r * cols + c]; }
    function mark(c, r) {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return; var i = r * cols + c;
      if (explored[i]) return; explored[i] = 1; exploredN++; ST.revealed++;
      fogDirty = true;
    }
    function rebuildFog() {
      if (!fogG) return; fogDirty = false;
      fogG.clearRect(0, 0, cols, rows);
      var id = fogG.createImageData(cols, rows), d = id.data, a = rgb(TH.unknown), b = rgb(TH.unknown2);
      var ex = function (c, r) { return c >= 0 && r >= 0 && c < cols && r < rows && explored[r * cols + c]; };
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var i = r * cols + c; if (explored[i]) continue; var q = i * 4, k = ((c + r) & 1) ? b : a, al = 255;
        // the frontier (unexplored next to explored) is see-through, so the reveal edge is soft instead of a hard box
        var n4 = ex(c - 1, r) + ex(c + 1, r) + ex(c, r - 1) + ex(c, r + 1), n8 = n4 + ex(c - 1, r - 1) + ex(c + 1, r - 1) + ex(c - 1, r + 1) + ex(c + 1, r + 1);
        if (n4) al = 150; else if (n8) al = 205;
        d[q] = k[0]; d[q + 1] = k[1]; d[q + 2] = k[2]; d[q + 3] = al;
      }
      fogG.putImageData(id, 0, 0);
    }
    function reveal(pc, pr, rad) {
      var rx = P.mode === 'side' ? rad * 1.5 : rad, ry = rad, c, r;
      for (r = Math.floor(pr - ry); r <= Math.ceil(pr + ry); r++) for (c = Math.floor(pc - rx); c <= Math.ceil(pc + rx); c++) {
        var dx = (c + 0.5 - pc) / (rx + 0.5), dy = (r + 0.5 - pr) / (ry + 0.5);
        if (dx * dx + dy * dy <= 1) mark(c, r);
      }
    }
    function pullShared(c0, r0, c1, r1) {
      for (var r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) for (var c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
        if (!explored[r * cols + c] && call(o.fog.isExplored, [c, r], false)) mark(c, r);
      }
    }

    /* ---------- update: world time, reveal ---------- */
    function update(dt) {
      try {
        ST.updates++; dt = num(dt, 1000 / 60); if (dt < 0) dt = 0; if (dt > 250) dt = 250; clock += dt;
        var p = call(o.player, [], null);
        var vw = val(o.view, null) || lastView;
        autoZoom(vw);
        if (vw && vw.w > 0 && !full) { var tg = underTarget(vw, cornerRect(vw), p && isFinite(p.x) ? p : null); if (!fadeInit) { fade = tg; fadeInit = true; } else fade = clamp(fade + (tg ? 1 : -1) * dt / 180, 0, 1); }
        if (fogOff()) return;
        if (fogShared()) {
          if (p && isFinite(p.x) && isFinite(p.y)) { var R = Math.ceil(P.reveal) + 3, pc0 = Math.floor(p.x / tile), pr0 = Math.floor(p.y / tile); pullShared(pc0 - R, pr0 - R, pc0 + R, pr0 + R); }
          var per = Math.max(1, Math.ceil(rows / 30));
          for (var k = 0; k < per; k++) { pullShared(0, scanRow, cols - 1, scanRow); scanRow = (scanRow + 1) % rows; }
          return;
        }
        if (p && isFinite(p.x) && isFinite(p.y)) {
          var pc = p.x / tile, pr = p.y / tile, key = Math.floor(pc * 2) + ',' + Math.floor(pr * 2);
          if (key !== lastPlayerCell) { lastPlayerCell = key; reveal(pc, pr, P.reveal); }
        }
        if (P.revealView === 'on' && o.camera) {
          var cm = call(o.camera, [], null);
          if (cm && isFinite(cm.x) && cm.w > 0) {
            var c0 = Math.floor(cm.x / tile), r0 = Math.floor(cm.y / tile), c1 = Math.ceil((cm.x + cm.w) / tile) - 1, r1 = Math.ceil((cm.y + cm.h) / tile) - 1, ck = c0 + ',' + r0 + ',' + c1 + ',' + r1;
            if (ck !== lastCamKey) {
              lastCamKey = ck; var ecx = (cm.x + cm.w / 2) / tile, ecy = (cm.y + cm.h / 2) / tile, erx = cm.w / tile / 2 * 1.12, ery = cm.h / tile / 2 * 1.12;
              for (var rr = r0; rr <= r1; rr++) for (var cc = c0; cc <= c1; cc++) { var qx = (cc + 0.5 - ecx) / erx, qy = (rr + 0.5 - ecy) / ery; if (qx * qx + qy * qy <= 1) mark(cc, rr); }
            }
          }
        }
      } catch (e) { ST.errors++; warn('update', 'update() failed: ' + e.message); }
    }

    /* ---------- render mode, units, placement ---------- */
    function viewOf(ctx) {
      var v = val(o.view, null);
      if (v && v.w > 0 && v.h > 0) return { x: +v.x || 0, y: +v.y || 0, w: +v.w, h: +v.h };
      var s = 1; try { var m = ctx.getTransform(); s = Math.hypot(m.a, m.b) || 1; } catch (e) { }
      return { x: 0, y: 0, w: ctx.canvas.width / s, h: ctx.canvas.height / s };
    }
    function crispOf(ctx, view) { return P.render === 'crisp' || (P.render !== 'smooth' && (ctx.imageSmoothingEnabled === false || view.w <= 512 || (SK && SK.pixel))); }
    function unitOf(view) { return Math.max(1, Math.floor(Math.min(view.w / 300, view.h / 170))); }
    function safeList() {
      var s = call(o.safeRects, [], null) || val(o.uiRects, null) || [];
      return s.filter(function (q) { return q && isFinite(q.x) && isFinite(q.y) && q.w > 0 && q.h > 0; });
    }
    function sizeOf(view, u) {
      var W = Math.round(Math.max(40 * u, view.w * P.size)), asp = P.aspect;
      if (!(asp > 0)) {
        if (P.mode === 'side') { var ppt0 = zoomList()[0] * u; asp = clamp((rows * ppt0 + 8 * u) / W, 0.3, 0.6); }
        else asp = P.shape === 'round' ? 1 : 0.75;
      }
      if (P.shape === 'round') asp = 1;
      var H = Math.round(W * asp), mp = zoomList()[zoomI] * u;
      // never bigger than the level at this zoom: no empty margin around a small map
      if (P.shape !== 'round') { W = Math.min(W, Math.max(24 * u, cols * mp)); H = Math.min(H, Math.max(24 * u, rows * mp)); }
      return { w: W, h: H };
    }
    var CORNERS = { tr: [1, 0], tl: [0, 0], br: [1, 1], bl: [0, 1] }, TAB = 0;
    function place(view, size, safe, gap, fr, eb) {
      eb = eb || 0;
      var order = [P.corner].concat(['tr', 'tl', 'br', 'bl'].filter(function (k) { return k !== P.corner; })), m = P.margin;
      for (var shrink = 0; shrink < 4; shrink++) {
        var W = Math.round(size.w * Math.pow(0.82, shrink)), H = Math.round(size.h * Math.pow(0.82, shrink));
        for (var i = 0; i < order.length; i++) {
          var cr = CORNERS[order[i]] || CORNERS.tr, base = { x: cr[0] ? view.x + view.w - m - fr - W : view.x + m + fr, y: cr[1] ? view.y + view.h - m - fr - eb - H : view.y + m + fr, w: W, h: H };
          for (var axis = 0; axis < 2; axis++) {
            var r = { x: base.x, y: base.y, w: W, h: H };
            for (var it = 0; it < 12; it++) {
              var blocker = null;
              var ro = { x: r.x - fr, y: r.y - fr, w: W + 2 * fr, h: H + 2 * fr + eb };
              for (var k = 0; k < safe.length; k++) if (hit(ro, safe[k], gap)) { blocker = safe[k]; break; }
              if (!blocker) { if (inside(ro, view)) { if (shrink || i || axis || it) ST.moved++; return { x: Math.round(r.x), y: Math.round(r.y), w: W, h: H, corner: order[i] }; } break; }
              if (axis === 0) r.y = cr[1] ? blocker.y - gap - fr - eb - H : blocker.y + blocker.h + gap + fr;
              else r.x = cr[0] ? blocker.x - gap - fr - W : blocker.x + blocker.w + gap + fr;
              if (!inside({ x: r.x - fr, y: r.y - fr, w: W + 2 * fr, h: H + 2 * fr + eb }, view)) break;
            }
          }
        }
      }
      return null;
    }
    function freeRect(view, safe, gap) {   // the largest part of the view left after cutting away each HUD rect (full map)
      var f = { x: view.x, y: view.y, w: view.w, h: view.h };
      safe.forEach(function (s) {
        if (!hit(f, s, gap)) return;
        var cands = [{ x: f.x, y: f.y, w: f.w, h: s.y - gap - f.y }, { x: f.x, y: s.y + s.h + gap, w: f.w, h: f.y + f.h - (s.y + s.h + gap) },
          { x: f.x, y: f.y, w: s.x - gap - f.x, h: f.h }, { x: s.x + s.w + gap, y: f.y, w: f.x + f.w - (s.x + s.w + gap), h: f.h }];
        var best = null; cands.forEach(function (c) { if (c.w > 0 && c.h > 0 && (!best || c.w * c.h > best.w * best.h)) best = c; });
        f = best || { x: f.x, y: f.y, w: 0, h: 0 };
      });
      return f;
    }

    /* ---------- fade while the player (or another thing the game names) is under the minimap ---------- */
    function playerBox(view, p) {
      var cam = call(o.camera, [], null); if (!p || !cam || !(cam.w > 0) || !isFinite(cam.x)) return null;
      var s = view.w / cam.w, x = view.x + (p.x - cam.x) * s, y = view.y + (p.y - cam.y) * (view.h / (cam.h || cam.w * view.h / view.w));
      return { x: x - 7 * s, y: y - 10 * s, w: 14 * s, h: 18 * s };
    }
    function underTarget(view, rect, p) {
      if (!rect || P.fadeUnder >= 1) return 0;
      var obs = typeof o.obstacles === 'function' ? call(o.obstacles, [], null) : null;
      if (!obs) { var pb = playerBox(view, p); obs = pb ? [pb] : []; }
      for (var i = 0; i < obs.length; i++) if (obs[i] && isFinite(obs[i].x) && hit(rect, obs[i], 0)) return 1;
      return 0;
    }
    function cornerRect(view) { var u = unitOf(view); return place(view, sizeOf(view, u), safeList(), 2 * u, 2 * u, TAB * u); }

    /* ---------- the cached map image (one per pixels-per-tile) ---------- */
    function terrain(ppt) {
      var key = String(ppt); if (caches[key]) return caches[key];
      var S = Math.max(1, Math.round(ppt)), W = cols * S, H = rows * S, c = mk(W, H); if (!c) return null;
      var g = c.getContext('2d'), id = g.createImageData(W, H), d = id.data, col = KINDS.map(function (k) { return rgb(TH[k] || TH.floor); });
      var edge = rgb(TH.edge), wedge = rgb(TH.waterEdge), x, y, cc, r;
      var put = function (px, py, v, a) { var q = (py * W + px) * 4; d[q] = v[0]; d[q + 1] = v[1]; d[q + 2] = v[2]; d[q + 3] = a == null ? 255 : a; };
      var kAt = function (cx, cy) { return cx < 0 || cy < 0 || cx >= cols || cy >= rows ? -1 : grid[cy * cols + cx]; };
      var blk = function (k) { return k >= 0 && BLOCK[KINDS[k]] === 1 && KINDS[k] !== 'tree'; };
      var open = function (k) { return k >= 0 && (!BLOCK[KINDS[k]] || KINDS[k] === 'tree') && KINDS[k] !== 'water'; };
      for (r = 0; r < rows; r++) for (cc = 0; cc < cols; cc++) {
        var k = grid[r * cols + cc], kind = KINDS[k], base = tint[r * cols + cc] || col[k];
        if (kind === 'tree' && S >= 3) {   // a round clump on grass: dark rim bottom-right, light top-left
          var gb = col[KI.grass], dk = [base[0] * 0.62, base[1] * 0.62, base[2] * 0.62], lt = [Math.min(255, base[0] + 34), Math.min(255, base[1] + 34), Math.min(255, base[2] + 22)], rr2 = S / 2;
          for (y = 0; y < S; y++) for (x = 0; x < S; x++) {
            var fx = x + 0.5 - rr2, fy = y + 0.5 - rr2, dd = Math.hypot(fx, fy), v2 = gb;
            if (dd <= rr2 + 0.15) v2 = dd > rr2 - 1.05 && (fx + fy) > 0 ? dk : (fx + fy) < -rr2 * 0.9 ? lt : base;
            put(cc * S + x, r * S + y, v2);
          }
          continue;
        }
        for (y = 0; y < S; y++) for (x = 0; x < S; x++) {
          var v = base;
          if (S >= 3 && (kind === 'floor' || kind === 'grass' || kind === 'empty' || kind === 'path') && hsh(cc * S + x, r * S + y) < 0.05) v = [Math.max(0, base[0] - 14), Math.max(0, base[1] - 14), Math.max(0, base[2] - 12)];
          put(cc * S + x, r * S + y, v);
        }
        // edges: a line on the blocking side where it meets open ground; water gets a shore line
        if (S >= 2 && (blk(k) || kind === 'water')) {
          var e = blk(k) ? edge : wedge, test = blk(k) ? open : function (q) { return q >= 0 && KINDS[q] !== 'water' && !blk(q); };
          if (test(kAt(cc, r - 1))) for (x = 0; x < S; x++) put(cc * S + x, r * S, e);
          if (test(kAt(cc, r + 1))) for (x = 0; x < S; x++) put(cc * S + x, r * S + S - 1, e);
          if (test(kAt(cc - 1, r))) for (y = 0; y < S; y++) put(cc * S, r * S + y, e);
          if (test(kAt(cc + 1, r))) for (y = 0; y < S; y++) put(cc * S + S - 1, r * S + y, e);
        }
      }
      g.putImageData(id, 0, 0); ST.rebuilds++;
      return (caches[key] = c);
    }

    /* ---------- the window: which part of the map the minimap shows ---------- */
    function windowOf(rect, ppt, crisp, p) {
      var mw = cols * ppt, mh = rows * ppt, ox, oy, pxm = p ? p.x / tile * ppt : mw / 2, pym = p ? p.y / tile * ppt : mh / 2;
      ox = mw <= rect.w ? (mw - rect.w) / 2 : clamp(pxm - rect.w / 2, 0, mw - rect.w);
      oy = mh <= rect.h ? (mh - rect.h) / 2 : clamp(pym - rect.h / 2, 0, mh - rect.h);
      if (crisp) { ox = Math.round(ox); oy = Math.round(oy); }
      return { ox: ox, oy: oy, ppt: ppt };
    }
    function toMap(rect, win, wx, wy) { return { x: rect.x + wx / tile * win.ppt - win.ox, y: rect.y + wy / tile * win.ppt - win.oy }; }

    /* ---------- drawing helpers ---------- */
    function clipShape(g, r, crisp, u) {
      g.beginPath();
      if (P.shape === 'round') { g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); }
      else if (crisp) { g.rect(r.x + u, r.y, r.w - 2 * u, r.h); g.rect(r.x, r.y + u, u, r.h - 2 * u); g.rect(r.x + r.w - u, r.y + u, u, r.h - 2 * u); }
      else { var rad = 3 * u, x = r.x, y = r.y, w = r.w, h = r.h; g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad); g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath(); }
    }
    function frame(g, r, crisp, u) {
      if (P.shape === 'round') {
        g.save(); g.lineWidth = 2 * u; g.strokeStyle = TH.ink; g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + u, r.h / 2 + u, 0, 0, Math.PI * 2); g.stroke();
        g.lineWidth = u; g.strokeStyle = TH.rimLight; g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + 2.5 * u, r.h / 2 + 2.5 * u, 0, 0, Math.PI * 2); g.stroke(); g.restore(); return;
      }
      if (crisp) {
        var x = r.x, y = r.y, w = r.w, h = r.h;
        g.fillStyle = TH.ink;          // outer outline, corners cut
        g.fillRect(x, y - u, w, u); g.fillRect(x, y + h, w, u); g.fillRect(x - u, y, u, h); g.fillRect(x + w, y, u, h);
        g.fillRect(x, y, u, u); g.fillRect(x + w - u, y, u, u); g.fillRect(x, y + h - u, u, u); g.fillRect(x + w - u, y + h - u, u, u);
        g.fillStyle = TH.rimLight;     // bevel: light rim top / left, dark rim bottom / right, one pixel outside the ink
        g.fillRect(x + u, y - 2 * u, w - 2 * u, u); g.fillRect(x - 2 * u, y + u, u, h - 2 * u);
        g.fillStyle = TH.rimDark;
        g.fillRect(x + u, y + h + u, w - 2 * u, u); g.fillRect(x + w + u, y + u, u, h - 2 * u);
        g.fillStyle = TH.ink;
        g.fillRect(x, y - 2 * u, u, u); g.fillRect(x - u, y - u, u, u); g.fillRect(x + w - u, y - 2 * u, u, u); g.fillRect(x + w, y - u, u, u);
        g.fillRect(x - 2 * u, y, u, u); g.fillRect(x - 2 * u, y + h - u, u, u); g.fillRect(x - u, y + h, u, u); g.fillRect(x, y + h + u, u, u);
        g.fillRect(x + w + u, y, u, u); g.fillRect(x + w + u, y + h - u, u, u); g.fillRect(x + w, y + h, u, u); g.fillRect(x + w - u, y + h + u, u, u);
        return;
      }
      g.save();
      clipShapeOut(g, r, u, 1.5 * u); g.lineWidth = 2 * u; g.strokeStyle = TH.ink; g.stroke();
      clipShapeOut(g, r, u, 3 * u); g.lineWidth = u; g.strokeStyle = rgba(TH.rimLight, 0.85); g.stroke();
      g.restore();
    }
    function clipShapeOut(g, r, u, grow) { var rad = 3 * u + grow, x = r.x - grow, y = r.y - grow, w = r.w + 2 * grow, h = r.h + 2 * grow; g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad); g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath(); }

    function arrowImg(deg, L) {
      var key = deg + ':' + L; if (arrowCache[key]) return arrowCache[key];
      var S = Math.ceil(L * 1.6) + 4; S += S & 1; var c = mk(S + 1, S + 1); if (!c) return null;
      var g = c.getContext('2d'), a = deg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), half = S / 2 + 0.5;
      var poly = ARROW.map(function (p) { return [half + (p[0] * ca - p[1] * sa) * L, half + (p[0] * sa + p[1] * ca) * L]; });
      var on = new Uint8Array((S + 1) * (S + 1)), x, y;
      for (y = 0; y <= S; y++) for (x = 0; x <= S; x++) if (inPoly(x + 0.5, y + 0.5, poly)) on[y * (S + 1) + x] = 1;
      var rim = rgb(TH.playerRim), body = rgb(TH.player), ink = rgb(TH.ink), id = g.createImageData(S + 1, S + 1), d = id.data;
      for (y = 0; y <= S; y++) for (x = 0; x <= S; x++) {
        var i = y * (S + 1) + x, q = i * 4, v = null;
        if (on[i]) { var lx = (x + 0.5 - half) * ca + (y + 0.5 - half) * sa; v = lx > L * 0.12 ? body : rim; }
        else if ((x > 0 && on[i - 1]) || (x < S && on[i + 1]) || (y > 0 && on[i - S - 1]) || (y < S && on[i + S + 1])) v = ink;
        if (v) { d[q] = v[0]; d[q + 1] = v[1]; d[q + 2] = v[2]; d[q + 3] = 255; }
      }
      g.putImageData(id, 0, 0);
      return (arrowCache[key] = { img: c, off: half });
    }
    function drawArrow(g, x, y, ang, u, crisp, scale) {
      var L = Math.round(8 * u * (scale || 1) * P.markSize);
      if (crisp) {
        var deg = Math.round(ang * 180 / Math.PI); deg = ((deg % 360) + 360) % 360;
        var A = arrowImg(deg, L); if (A) g.drawImage(A.img, Math.floor(x) + 0.5 - A.off, Math.floor(y) + 0.5 - A.off);
        return;
      }
      g.save(); g.translate(x, y); g.rotate(ang);
      g.beginPath(); ARROW.forEach(function (p, i) { if (i) g.lineTo(p[0] * L, p[1] * L); else g.moveTo(p[0] * L, p[1] * L); }); g.closePath();
      g.lineJoin = 'round'; g.lineWidth = 2.2 * u; g.strokeStyle = TH.ink; g.stroke();
      var gr = g.createLinearGradient(-L * 0.4, 0, L * 0.6, 0); gr.addColorStop(0, TH.playerRim); gr.addColorStop(0.45, TH.player); gr.addColorStop(1, TH.player);
      g.fillStyle = gr; g.fill(); g.restore();
    }
    function markColor(kind, m) { return (m && m.color) || TH[kind === 'door' ? 'door2' : kind] || TH.item; }
    function drawMarker(g, kind, x, y, u, crisp, col, big) {
      var t = clock;
      if (crisp) {
        x = Math.floor(x); y = Math.floor(y);
        var ring = function (rad, c) { g.fillStyle = c; for (var dy = -rad; dy <= rad; dy++) { var hw = rad - Math.abs(dy); g.fillRect(x - hw * u, y + dy * u, (2 * hw + 1) * u, u); } };
        var ms = Math.round((P.markSize - 1) * 2) / 2, mi = Math.floor(ms + (big ? 1 : 0));
        if (kind === 'goal') { var pul = Math.floor(t / 450) % 2; ring(3 + pul + mi, TH.ink); ring(2 + pul + mi, col); g.fillStyle = '#ffffff'; g.fillRect(x - u, y - u, u, u); return; }
        if (kind === 'item') { ring(2 + mi, TH.ink); ring(1 + mi, col); return; }
        if (kind === 'poi') { g.fillStyle = TH.ink; g.fillRect(x - 2 * u, y - 2 * u, 5 * u, 5 * u); g.fillStyle = col; g.fillRect(x - u, y - u, 3 * u, 3 * u); g.fillStyle = TH.ink; g.fillRect(x, y, u, u); return; }
        var s = 1 + mi;   // enemy / npc / door: a square dot with an outline
        g.fillStyle = TH.ink; g.fillRect(x - (s + 1) * u, y - (s + 1) * u, (2 * s + 3) * u, (2 * s + 3) * u);
        g.fillStyle = col; g.fillRect(x - s * u, y - s * u, (2 * s + 1) * u, (2 * s + 1) * u);
        if (kind === 'enemy') { g.fillStyle = mix(col, '#ffffff', 0.55); g.fillRect(x - s * u, y - s * u, u, u); }
        return;
      }
      g.save(); g.translate(x, y); g.lineWidth = 1.4 * u; g.strokeStyle = TH.ink; g.fillStyle = col;
      var R = (big ? 1.5 : 1) * u * P.markSize;
      if (kind === 'goal') {
        var k = 1 + 0.18 * Math.sin(t / 1000 * Math.PI * 2 / 0.9);
        var ga = g.globalAlpha; g.globalAlpha = ga * 0.35; g.beginPath(); g.arc(0, 0, 5.5 * R * k, 0, Math.PI * 2); g.fillStyle = rgba(col, 0.5); g.fill(); g.globalAlpha = ga; g.fillStyle = col;
        g.beginPath(); g.moveTo(0, -3.6 * R); g.lineTo(3.6 * R, 0); g.lineTo(0, 3.6 * R); g.lineTo(-3.6 * R, 0); g.closePath(); g.stroke(); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(-0.9 * R, -0.9 * R, 0.8 * R, 0, Math.PI * 2); g.fill();
      } else if (kind === 'item') { g.beginPath(); g.moveTo(0, -2.4 * R); g.lineTo(2.4 * R, 0); g.lineTo(0, 2.4 * R); g.lineTo(-2.4 * R, 0); g.closePath(); g.stroke(); g.fill(); }
      else if (kind === 'door') { g.beginPath(); g.rect(-2 * R, -2 * R, 4 * R, 4 * R); g.stroke(); g.fill(); }
      else if (kind === 'poi') { g.beginPath(); g.arc(0, 0, 1.3 * R, 0, Math.PI * 2); g.stroke(); g.fill(); }
      else { g.beginPath(); g.arc(0, 0, 2.2 * R, 0, Math.PI * 2); g.stroke(); g.fill(); g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(-0.7 * R, -0.7 * R, 0.7 * R, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
    function drawEdgeArrow(g, rect, mx, my, col, u, crisp) {
      var L0 = Math.round(8 * u * P.markSize), cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, dx = mx - cx, dy = my - cy, ins = Math.ceil(0.7 * L0) + 3 * u;   // the whole arrow, tip included, stays inside the frame
      if (!dx && !dy) return null;
      var sx = (rect.w / 2 - ins) / Math.abs(dx || 1e-9), sy = (rect.h / 2 - ins) / Math.abs(dy || 1e-9), s = Math.min(sx, sy);
      if (P.shape === 'round') s = (Math.min(rect.w, rect.h) / 2 - ins) / Math.hypot(dx, dy);
      var ex = cx + dx * s, ey = cy + dy * s, a = Math.atan2(dy, dx), L = L0;
      if (crisp) {
        // pixel sprites in 8 directions (hand-shaped, exact 90-degree rotations): a small triangle rasterised at an odd angle
        // reads as a sail, these always read as a pointer
        ex = Math.floor(ex); ey = Math.floor(ey);
        var di = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8, sc = Math.max(1, Math.round(P.markSize)), key = 'e' + di + ':' + col + ':' + sc, A = arrowCache[key];
        if (!A) {
          var base = di % 2 ? EDGE_D : EDGE_S, n = 7, cells = [], x, y, k, rot = di >> 1;
          for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (base[y].charAt(x) !== '.') {
            var X = x, Y = y; for (k = 0; k < rot; k++) { var t2 = X; X = n - 1 - Y; Y = t2; }
            cells.push([X, Y, base[y].charAt(x)]);
          }
          var N = n + 2, on = new Uint8Array(N * N), c = mk(N * sc, N * sc), gg = c.getContext('2d');
          cells.forEach(function (q) { on[(q[1] + 1) * N + q[0] + 1] = q[2] === 'h' ? 2 : 1; });
          for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
            var i = y * N + x, v = on[i] === 2 ? mix(col, '#ffffff', 0.6) : on[i] ? col : ((x > 0 && on[i - 1]) || (x < N - 1 && on[i + 1]) || (y > 0 && on[i - N]) || (y < N - 1 && on[i + N])) ? TH.ink : null;
            if (v) { gg.fillStyle = v; gg.fillRect(x * sc, y * sc, sc, sc); }
          }
          A = arrowCache[key] = { img: c, off: (N * sc - 1) / 2 };
        }
        g.save(); g.imageSmoothingEnabled = false;
        if (u === 1) g.drawImage(A.img, Math.round(ex - A.off), Math.round(ey - A.off));
        else g.drawImage(A.img, Math.round(ex - A.off * u), Math.round(ey - A.off * u), A.img.width * u, A.img.height * u);
        g.restore();
      } else {
        var bob = Math.sin(clock / 1000 * Math.PI * 2 / 0.8) * 0.8 * u;
        g.save(); g.translate(ex + Math.cos(a) * bob, ey + Math.sin(a) * bob); g.rotate(a);
        g.beginPath(); g.moveTo(0.55 * L, 0); g.lineTo(-0.45 * L, -0.55 * L); g.lineTo(-0.2 * L, 0); g.lineTo(-0.45 * L, 0.55 * L); g.closePath();
        g.lineJoin = 'round'; g.lineWidth = 1.8 * u; g.strokeStyle = TH.ink; g.stroke(); g.fillStyle = col; g.fill(); g.restore();
      }
      return { x: ex, y: ey, angle: a };
    }

    /* ---------- one map pass (corner minimap or full map) ---------- */
    function mapPass(g, rect, ppt, crisp, u, p, isFull, fp, mapA) {
      if (mapA == null) mapA = 1;
      var win = windowOf(rect, ppt, crisp, fp || p);
      var T = terrain(crisp ? ppt : Math.max(1, Math.round(ppt)));
      g.save(); clipShape(g, rect, crisp, u); g.clip();
      var A0 = g.globalAlpha; g.globalAlpha = A0 * P.opacity; g.fillStyle = TH.back; g.fillRect(rect.x, rect.y, rect.w, rect.h);
      g.globalAlpha = A0 * P.opacity * mapA;   // faded: the map image dims on its dark backing; frame, arrows and markers stay readable
      var prevSm = g.imageSmoothingEnabled;
      if (T) {
        g.imageSmoothingEnabled = false;
        var k = ppt / Math.max(1, Math.round(ppt));
        var sx = Math.max(0, Math.floor(win.ox / k)), sy = Math.max(0, Math.floor(win.oy / k));
        var sw = Math.min(T.width - sx, Math.ceil(rect.w / k) + 2), sh = Math.min(T.height - sy, Math.ceil(rect.h / k) + 2);
        if (sw > 0 && sh > 0) g.drawImage(T, sx, sy, sw, sh, rect.x - win.ox + sx * k, rect.y - win.oy + sy * k, sw * k, sh * k);
      }
      if (!fogOff()) {
        if (fogDirty) rebuildFog();
        if (fogC) { g.imageSmoothingEnabled = !crisp; g.drawImage(fogC, rect.x - win.ox, rect.y - win.oy, cols * ppt, rows * ppt); }
      }
      g.imageSmoothingEnabled = prevSm;
      g.globalAlpha = A0;
      // the camera view: what is on screen now
      var cam = P.viewFrame === 'on' ? call(o.camera, [], null) : null, camRec = null;
      if (cam && isFinite(cam.x) && cam.w > 0) {
        var a0 = toMap(rect, win, cam.x, cam.y), a1 = toMap(rect, win, cam.x + cam.w, cam.y + cam.h);
        camRec = { x: a0.x, y: a0.y, w: a1.x - a0.x, h: a1.y - a0.y };
        // corner brackets, not a full box: the view reads without striping the map
        var X0 = a0.x, Y0 = a0.y, X1 = a1.x - u, Y1 = a1.y - u, bl = Math.max(3 * u, Math.min(a1.x - a0.x, a1.y - a0.y) * 0.22);
        if (crisp) { X0 = Math.round(X0); Y0 = Math.round(Y0); X1 = Math.round(X1); Y1 = Math.round(Y1); bl = Math.round(bl); }
        g.fillStyle = rgba(TH.view, 0.8);
        [[X0, Y0, 1, 1], [X1, Y0, -1, 1], [X0, Y1, 1, -1], [X1, Y1, -1, -1]].forEach(function (k) {
          g.fillRect(k[2] > 0 ? k[0] : k[0] - bl + u, k[1], bl, u); g.fillRect(k[0], k[3] > 0 ? k[1] : k[1] - bl + u, u, bl); });
      }
      // markers
      var list = call(o.markers, [], []) || [], recs = [], edges = [], pc = p ? [p.x / tile, p.y / tile] : null;
      var sorted = list.filter(function (m) { return m && isFinite(m.x) && isFinite(m.y); }).slice().sort(function (a, b) { return MARK_ORDER.indexOf(a.kind) - MARK_ORDER.indexOf(b.kind); });
      sorted.forEach(function (m) {
        var kind = m.kind || 'item', c = Math.floor(m.x / tile), r = Math.floor(m.y / tile), why = null;
        var always = m.always != null ? !!m.always : kind === 'goal';
        if (!always && !isExp(c, r)) why = 'fog';
        if (kind === 'enemy') {
          if (P.enemies === 'off') why = 'enemies off';
          else if (P.enemies === 'near') {
            var near = pc && Math.hypot(c + 0.5 - pc[0], r + 0.5 - pc[1]) <= P.reveal + 0.5;
            if (fogShared() && typeof o.fog.isVisible === 'function') near = !!call(o.fog.isVisible, [c, r], false);
            if (!near) why = 'not near';
          }
        }
        var at = toMap(rect, win, m.x, m.y), inWin = at.x >= rect.x && at.y >= rect.y && at.x < rect.x + rect.w && at.y < rect.y + rect.h;
        if (inWin && P.shape === 'round') { var ddx = (at.x - rect.x - rect.w / 2) / (rect.w / 2), ddy = (at.y - rect.y - rect.h / 2) / (rect.h / 2); inWin = ddx * ddx + ddy * ddy < 1; }
        var rec = { id: m.id != null ? m.id : null, kind: kind, world: { x: m.x, y: m.y }, map: null, edge: null, hidden: why };
        if (!why && inWin) { drawMarker(g, kind, at.x, at.y, u, crisp, markColor(kind, m), isFull); rec.map = { x: crisp ? Math.floor(at.x) + 0.5 : at.x, y: crisp ? Math.floor(at.y) + 0.5 : at.y }; }
        else if (!why && !isFull && P.arrows === 'on' && (m.track || (m.track == null && kind === 'goal'))) edges.push([rec, at, markColor(kind, m)]);
        recs.push(rec);
      });
      // the player arrow
      var prec = null;
      if (p && isFinite(p.x) && isFinite(p.y)) {
        var pa = toMap(rect, win, p.x, p.y);
        drawArrow(g, pa.x, pa.y, lastAngle, u, crisp, isFull ? 1.25 : 1);
        prec = { world: { x: p.x, y: p.y }, map: { x: crisp ? Math.floor(pa.x) + 0.5 : pa.x, y: crisp ? Math.floor(pa.y) + 0.5 : pa.y }, angle: lastAngle, facing: p.facing != null ? p.facing : null,
          offMap: p.x < 0 || p.y < 0 || p.x > cols * tile || p.y > rows * tile };
      }
      g.restore();
      // edge arrows sit on the rim, over the clip
      edges.forEach(function (e) { var at = drawEdgeArrow(g, rect, e[1].x, e[1].y, e[2], u, crisp); e[0].edge = at; });
      return { win: win, markers: recs, player: prec, camera: camRec };
    }

    function legend(g, box, kinds, crisp, u) {
      var x = box.x, y = box.y, col = TH.text;
      kinds.forEach(function (k) {
        var label = MARK_LABEL[k] || k.toUpperCase();
        drawMarker(g, k, x + 3 * u, y + 2.5 * u, u, crisp, markColor(k), false);
        if (crisp) text3(g, label, x + 8 * u, y, u, col);
        else { g.font = Math.round(7 * u) + 'px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(label, x + 8 * u, y + 2.5 * u); }
        x += 8 * u + (crisp ? text3W(label, u) : g.measureText(label).width) + 7 * u;
      });
    }

    /* ---------- draw ---------- */
    function draw(ctx) {
      if (!ctx) return null;
      try {
        ST.draws++;
        var view = viewOf(ctx), crisp = crispOf(ctx, view), u = unitOf(view), safe = safeList(), gap = 2 * u;
        var p = call(o.player, [], null); if (p && !(isFinite(p.x) && isFinite(p.y))) p = null;
        var fp = call(o.focus, [], null); if (!(fp && isFinite(fp.x) && isFinite(fp.y))) fp = null;
        lastAngle = facingAngle(p, lastAngle); lastPlayer = p; autoZoom(view);
        if (full) return drawFull(ctx, view, crisp, u, safe, gap, p, fp);
        var size = sizeOf(view, u), rect = place(view, size, safe, gap, 2 * u, zoomList().length > 1 ? TAB * u : 0);
        if (!rect) { ST.noRoom++; drawnRec = { full: false, rect: null, why: 'no room' }; return drawnRec; }
        // keep the frame (2 px outside the map) clear of the HUD too: place() used a gap that covers it
        lastView = view;
        if (!fadeInit) { fade = underTarget(view, rect, p); fadeInit = true; }
        var ga0 = ctx.globalAlpha, alpha = 1 - (1 - P.fadeUnder) * fade, uiA = 1 - 0.2 * fade; ctx.globalAlpha = ga0 * uiA;
        var ppt = zoomList()[zoomI] * u, res = mapPass(ctx, rect, ppt, crisp, u, p, false, fp, alpha / uiA);
        frame(ctx, rect, crisp, u);
        var zl = zoomList(), eb = 0;
        if (zl.length > 1) {
          // zoom pips live in the frame's bottom border (no footprint beyond the frame, nothing over the map)
          var tx = rect.x + 3 * u, ty = rect.y + rect.h;
          for (var i = 0; i < zl.length; i++) { ctx.fillStyle = i === zoomI ? TH.text : rgba(TH.dim, 0.8); ctx.fillRect(tx + i * 4 * u, ty, 3 * u, u); }
        }
        ctx.globalAlpha = ga0;
        drawnRec = { full: false, alpha: Math.round(alpha * 100) / 100, rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, outer: { x: rect.x - 2 * u, y: rect.y - 2 * u, w: rect.w + 4 * u, h: rect.h + 4 * u + eb }, corner: rect.corner,
          zoom: zoomI, ppt: ppt, crisp: crisp, u: u, window: res.win, player: res.player, markers: res.markers, camera: res.camera, explored: exploredRatio(), safe: safe.slice(), clock: Math.round(clock) };
        return drawnRec;
      } catch (e) { ST.errors++; warn('draw', 'draw() failed: ' + e.message); return null; }
    }
    function drawFull(ctx, view, crisp, u, safe, gap, p, fp) {
      ST.fullDraws++;
      var free = freeRect(view, safe, gap);
      if (!(free.w > 40 && free.h > 40)) { ST.noRoom++; drawnRec = { full: true, rect: null, why: 'no room' }; return drawnRec; }
      ctx.save(); ctx.fillStyle = rgba(TH.ink, 0.62); ctx.fillRect(free.x, free.y, free.w, free.h); ctx.restore();
      var pad = 6 * u, head = crisp ? 11 * u : 16 * u, foot = P.legend === 'on' ? (crisp ? 12 * u : 16 * u) : pad;
      var aw = free.w - 2 * pad - 8 * u, ah = free.h - head - foot - 8 * u, fit = Math.min(aw / cols, ah / rows);
      var ppt = crisp ? Math.max(1, Math.floor(fit)) : Math.max(0.25, fit);
      var mw = Math.min(aw, cols * ppt), mh = Math.min(ah, rows * ppt);
      if (crisp) { mw = Math.floor(mw); mh = Math.floor(mh); }
      var pw = mw + 2 * pad, ph = mh + head + foot, px = free.x + (free.w - pw) / 2, py = free.y + (free.h - ph) / 2;
      if (crisp) { px = Math.round(px); py = Math.round(py); }
      // panel
      if (crisp) { ctx.fillStyle = TH.ink; ctx.fillRect(px - u, py - u, pw + 2 * u, ph + 2 * u); ctx.fillStyle = TH.panel; ctx.fillRect(px, py, pw, ph); ctx.fillStyle = TH.rimLight; ctx.fillRect(px, py, pw, u); ctx.fillStyle = TH.panel2; ctx.fillRect(px, py + ph - u, pw, u); }
      else { ctx.save(); clipShapeOut(ctx, { x: px, y: py, w: pw, h: ph }, u, 0); var gr = ctx.createLinearGradient(0, py, 0, py + ph); gr.addColorStop(0, TH.panel); gr.addColorStop(1, TH.panel2); ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = 2 * u; ctx.strokeStyle = TH.ink; ctx.stroke(); clipShapeOut(ctx, { x: px, y: py, w: pw, h: ph }, u, -1.5 * u); ctx.lineWidth = u; ctx.strokeStyle = rgba(TH.rimLight, 0.5); ctx.stroke(); ctx.restore(); }
      var title = 'MAP', pct = Math.round(exploredRatio() * 100) + '% EXPLORED';
      if (crisp) { text3(ctx, title, px + pad, py + 3 * u, u, TH.text); if (!fogOff()) text3(ctx, pct, px + pw - pad - text3W(pct, u), py + 3 * u, u, TH.dim); }
      else { ctx.font = 'bold ' + Math.round(9 * u) + 'px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = TH.text; ctx.textAlign = 'left'; ctx.fillText('Map', px + pad, py + head / 2 + 2 * u);
        if (!fogOff()) { ctx.font = Math.round(7 * u) + 'px system-ui, sans-serif'; ctx.fillStyle = TH.dim; ctx.textAlign = 'right'; ctx.fillText(Math.round(exploredRatio() * 100) + '% explored', px + pw - pad, py + head / 2 + 2 * u); ctx.textAlign = 'left'; } }
      var rect = { x: px + pad, y: py + head, w: mw, h: mh };
      if (crisp) { rect.x = Math.round(rect.x); rect.y = Math.round(rect.y); }
      var shape = P.shape; P.shape = 'square';
      var res = mapPass(ctx, rect, ppt, crisp, u, p, true, fp);
      P.shape = shape;
      if (crisp) { ctx.fillStyle = TH.ink; ctx.fillRect(rect.x - u, rect.y - u, rect.w + 2 * u, u); ctx.fillRect(rect.x - u, rect.y + rect.h, rect.w + 2 * u, u); ctx.fillRect(rect.x - u, rect.y, u, rect.h); ctx.fillRect(rect.x + rect.w, rect.y, u, rect.h); }
      else { ctx.lineWidth = u; ctx.strokeStyle = TH.ink; ctx.strokeRect(rect.x - u / 2, rect.y - u / 2, rect.w + u, rect.h + u); }
      if (P.legend === 'on') {
        var present = {}; res.markers.forEach(function (m) { if (!m.hidden) present[m.kind] = 1; });
        var kinds = ['goal', 'enemy', 'item', 'npc', 'door'].filter(function (k) { return present[k]; });
        legend(ctx, { x: rect.x, y: rect.y + rect.h + (crisp ? 3 * u : 4 * u) }, kinds, crisp, u);
      }
      drawnRec = { full: true, rect: rect, outer: { x: px - u, y: py - u, w: pw + 2 * u, h: ph + 2 * u }, dim: free, zoom: zoomI, ppt: ppt, crisp: crisp, u: u, window: res.win,
        player: res.player, markers: res.markers, camera: res.camera, explored: exploredRatio(), safe: safe.slice(), clock: Math.round(clock) };
      return drawnRec;
    }

    function exploredRatio() { if (fogOff()) return 1; var n = 0, N = 0; for (var i = 0; i < grid.length; i++) { N++; if (explored[i]) n++; } return N ? n / N : 0; }

    setParams(o.params);
    readGrid();

    var api = {
      version: VERSION,
      update: update,
      draw: draw,
      setParams: function (p) { var oldMode = P.mode; setParams(p); if (p && p.mode && p.mode !== oldMode) readGrid(); fogDirty = true; arrowCache = {}; return api; },
      params: function () { var c = {}; for (var k in P) c[k] = P[k]; return c; },
      refresh: function () { readGrid(); return api; },
      invalidate: function (c, r) { if (c >= 0 && r >= 0 && c < cols && r < rows) { grid[r * cols + c] = kindIndex(call(o.cellAt, [c, r], null)); caches = {}; } return api; },
      reset: function () { explored = new Uint8Array(cols * rows); exploredN = 0; fogDirty = true; lastPlayerCell = null; lastCamKey = ''; full = false; return api; },
      revealAll: function () { explored.fill(1); exploredN = explored.length; fogDirty = true; return api; },
      explore: function (c, r, rad) { reveal(c + 0.5, r + 0.5, rad == null ? 0 : rad); return api; },
      isExplored: function (c, r) { return isExp(c, r); },
      exploredRatio: exploredRatio,
      setFull: function (on) { on = !!on; if (on !== full) { full = on; ST.fullToggles++; emit({ event: 'full', open: on }); } return api; },
      toggleFull: function () { return api.setFull(!full); },
      isFull: function () { return full; },
      setZoom: function (i) { var n = zoomList().length, z = clamp(Math.round(num(i, zoomI)), 0, n - 1); if (z !== zoomI) { zoomI = z; ST.zoomChanges++; emit({ event: 'zoom', level: z }); } return api; },
      zoomIn: function () { return api.setZoom(zoomI + 1); },
      zoomOut: function () { return api.setZoom(zoomI - 1); },
      cycleZoom: function () { return api.setZoom((zoomI + 1) % zoomList().length); },
      zoom: function () { return zoomI; },
      hit: function (x, y) { var d = drawnRec; if (!d || !d.rect) return null; var r = d.full ? d.dim : d.outer; return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h ? (d.full ? 'full' : 'minimap') : null; },
      rect: function () { return drawnRec && drawnRec.outer || null; },
      lastDrawn: function () { return drawnRec; },
      state: function () {
        var d = drawnRec || {};
        return { full: full, zoom: zoomI, zooms: zoomList(), rect: d.rect || null, outer: d.outer || null, ppt: d.ppt || null, alpha: d.alpha != null ? d.alpha : 1, player: d.player || null,
          markers: d.markers || [], explored: Math.round(exploredRatio() * 1000) / 1000, clock: Math.round(clock), mode: P.mode };
      },
      worldToMap: function (wx, wy) { var d = drawnRec; if (!d || !d.rect) return null; return toMap(d.rect, d.window, wx, wy); },
      stats: function () { var s = {}; for (var k in ST) s[k] = ST[k]; s.cols = cols; s.rows = rows; s.explored = exploredRatio(); s.caches = Object.keys(caches).length; return s; },
      grid: function () { return { cols: cols, rows: rows, tile: tile, kinds: KINDS.slice(), cells: grid }; }
    };
    return api;
  }

  root.GameDNA_Minimap = { version: VERSION, create: create, kinds: KINDS.slice(), facingAngle: function (p) { return facingAngle(p, 0); } };
})(typeof window !== 'undefined' ? window : this);
