/* GameDNA B-04 Isometric height & jump  (module v1, no dependencies, no exports)
   Global: window.GameDNA_IsoHeight.create(options) -> instance. See module/README.md.
   Owns: the 2:1 isometric projection (per-tile height, 90-degree camera turns, a camera that follows the cursor), picking
   (screen px -> tile, height and sprites included), the procedural 16-bit block art (lit top, two shaded side faces with
   one band per height level, cliffs, stairs, animated water), reach under the jump rule (climb <= jump, drop <= jump + fall),
   attack reach with a high-ground range bonus and a melee height limit, the damage modifier (height and facing: front / side /
   back), the facing picker at the end of an action, painter's draw order with the host's units interleaved, the x-ray outline
   of a unit hidden behind a taller block, the cursor that sits on the tile top, the walk animator (hops between heights) and a
   wait-time (WT) turn scheduler with its order bar.
   The host keeps its own map, units and rules; the module asks through callbacks. Draws its UI (info plate, WT bar) through
   GameDNA_Skin when skin-api.js is loaded, else a built-in copy of the pixel16 look. Never throws from update / draw / key /
   pick: host callbacks are wrapped. */
(function (root) {
  'use strict';
  var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];      // facing 0 = +x, 1 = +y, 2 = -x, 3 = -y (grid space)
  var RANGES = { '1': [1, 1], '1-2': [1, 2], '2': [2, 2], '2-3': [2, 3], '1-3': [1, 3], '2-4': [2, 4], '3-5': [3, 5] };
  var DEF = { tileW: 32, step: 4, jump: 3, fall: 2, move: 4, range: '1', hgRange: 2, hgDamage: 10, meleeH: 4, side: 1.25, back: 1.5,
    overlay: 'pulse', xray: 'active', rotate: 'on', facing: 'choose', turns: 'wt', wtBase: 20, keys: 'on', follow: 'on' };
  var NUM = { tileW: 1, step: 1, jump: 1, fall: 1, move: 1, hgRange: 1, hgDamage: 1, meleeH: 1, side: 1, back: 1, wtBase: 1 };

  /* ---------- tiny helpers ---------- */
  function h2(x, y, s) { var n = (x * 374761393 + y * 668265263 + (s | 0) * 1442695041) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967296; }
  function hex(c) {
    c = String(c || '#000'); var m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) { var h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
    m = c.match(/^rgba?\(([^)]+)\)$/); if (m) return m[1].split(',').slice(0, 3).map(function (v) { return +v; });
    return [0, 0, 0];
  }
  function mixA(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function css(a, al) { return al == null ? 'rgb(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ')' : 'rgba(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ',' + al + ')'; }
  function ramp(list) { return list.map(hex); }
  function mk(w, h) { var c = root.document ? root.document.createElement('canvas') : null; if (c) { c.width = Math.max(1, w); c.height = Math.max(1, h); } return c; }
  function hitR(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

  /* ---------- block art: 5-tone ramps per terrain kind (light from the upper left) ---------- */
  var PAL = {
    grass: ramp(['#1c3020', '#2e5228', '#4a7a30', '#74a03c', '#b0cc62']),
    moss: ramp(['#1e2c22', '#34482c', '#52683a', '#7a8c4a', '#a8b46a']),
    dirt: ramp(['#2a1812', '#4c2c1c', '#764628', '#a06a3c', '#c8955e']),
    road: ramp(['#2e241e', '#52402e', '#7a6244', '#a48a62', '#cab288']),
    sand: ramp(['#5a4630', '#8c7048', '#bc9c64', '#dcc084', '#f4e2aa']),
    snow: ramp(['#46506e', '#7486a8', '#a8b8d4', '#d4e0f0', '#ffffff']),
    stone: ramp(['#34303e', '#565262', '#7e7884', '#a69e9e', '#ccc2b6']),
    rock: ramp(['#221c26', '#3c3240', '#5a4c56', '#7e6c6c', '#a8948a']),
    wood: ramp(['#24140e', '#42281a', '#68442a', '#8e663e', '#b88c5a']),
    water: ramp(['#10284a', '#1c4472', '#2c6a9a', '#4c98c0', '#a6dcec']),
    earth: ramp(['#160e14', '#2a1a1e', '#44282a', '#603c32', '#805442']),
    brick: ramp(['#28222e', '#443e4a', '#625a66', '#827880', '#a49a98'])
  };
  var SHADE = hex('#1a1030'), WARM = hex('#fff0d0'), INK = hex('#0c0814'), MORTAR = hex('#221c28');
  var FACE = { grass: 'earth', moss: 'earth', dirt: 'earth', road: 'earth', sand: 'earth', snow: 'rock', stone: 'brick', stairs: 'brick', rock: 'rock', wood: 'wood', water: 'water' };
  var NAMES = { grass: 'GRASS', moss: 'MOSS', dirt: 'DIRT', road: 'ROAD', sand: 'SAND', snow: 'SNOW', stone: 'STONE', stairs: 'STAIRS', rock: 'ROCK', wood: 'PLANKS', water: 'WATER' };

  /* ---------- built-in UI look (pixel16 copy) used when skin-api.js is not loaded ---------- */
  var FB = { move: { fill: '#3064f0', edge: '#d6e8ff' }, attack: { fill: '#e43430', edge: '#ffd6c8' }, heal: { fill: '#30c060', edge: '#d0ffd8' },
    a: '#3a64d8', b: '#d85a48', n: '#4c5a8a', text: '#ffffff', text2: '#c8d4ff', shadow: '#0a0c24', accent: '#ffe070', dim: '#8088a8' };
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
    9: '01110,10001,10001,01111,00001,00010,01100', '-': '00000,00000,00000,01110,00000,00000,00000', '+': '00000,00100,00100,11111,00100,00100,00000',
    '/': '00001,00010,00010,00100,01000,01000,10000', '.': '00000,00000,00000,00000,00000,01100,01100', '?': '01110,10001,00001,00010,00100,00000,00100'
  };
  function fbW(s) { var w = 0; s = String(s); for (var i = 0; i < s.length; i++) w += s[i] === ' ' ? 4 : 6; return Math.max(0, w - 1); }
  function fbText(g, s, x, y, c1, c2) {
    var str = String(s).toUpperCase();
    for (var pass = 0; pass < 2; pass++) {
      var cx = x;
      for (var i = 0; i < str.length; i++) {
        var ch = str[i];
        if (ch !== ' ') {
          var rows = (GLYPH[ch] || GLYPH['?']).split(',');
          for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < rows[ry].length; rx++) if (rows[ry][rx] === '1') {
            g.fillStyle = pass ? (ry < 4 ? c1 : (c2 || c1)) : FB.shadow; g.fillRect(cx + rx + (pass ? 0 : 1), y + ry + (pass ? 0 : 1), 1, 1);
          }
        }
        cx += ch === ' ' ? 4 : 6;
      }
    }
  }
  function fbFrame(g, r, team) {
    var C = hex(FB[team] || FB.n), d = mixA(C, [6, 8, 30], 0.7), m = mixA(C, [6, 8, 30], 0.45);
    g.fillStyle = '#06061a'; g.fillRect(r.x + 1, r.y, r.w - 2, r.h); g.fillRect(r.x, r.y + 1, r.w, r.h - 2);
    for (var y = 1; y < r.h - 1; y++) { g.fillStyle = css(mixA(m, d, y / r.h)); g.fillRect(r.x + 1, r.y + y, r.w - 2, 1); }
    g.fillStyle = css(mixA(C, [255, 255, 255], 0.55)); g.fillRect(r.x + 2, r.y + 1, r.w - 4, 1); g.fillRect(r.x + 1, r.y + 2, 1, r.h - 4);
    g.fillStyle = css(mixA(C, [0, 0, 0], 0.5)); g.fillRect(r.x + 2, r.y + r.h - 2, r.w - 4, 1); g.fillRect(r.x + r.w - 2, r.y + 2, 1, r.h - 4);
  }

  /* ---------- the instance ---------- */
  function create(o) {
    o = o || {};
    var SKIN = root.GameDNA_Skin, SK = null;
    try { SK = SKIN && SKIN.resolve ? SKIN.resolve(o.skin) : null; } catch (e) { SK = null; }
    var COLS = Math.max(1, Math.floor(+o.cols || 1)), ROWS = Math.max(1, Math.floor(+o.rows || 1));
    var P = {}, k0; for (k0 in DEF) P[k0] = DEF[k0];
    var warned = {};
    function warn(key, msg) {
      if (warned[key]) return; warned[key] = 1;
      try { if (root.console) root.console.warn('[GameDNA_IsoHeight] ' + msg); } catch (e) { /* ignore */ }
      if (typeof o.debug === 'function') try { o.debug({ event: 'warn', key: key, msg: msg }); } catch (e) { /* ignore */ }
    }
    function call(name, args, fb) {
      var f = o[name]; if (typeof f !== 'function') return fb;
      try { var r = f.apply(null, args || []); return r === undefined ? fb : r; } catch (e) { warn('cb-' + name, name + '() threw: ' + (e && e.message)); return fb; }
    }
    var S = { t: 0, frames: 0, updates: 0, draws: 0, rot: 0, cam: { x: 0, y: 0 }, camT: null, camSnap: true, cache: {}, cacheRot: -1,
      sel: null, move: null, attack: null, target: null, path: [], age: 0, cur: { x: 0, y: 0 }, facing: null, walks: [], active: null,
      wt: {}, wtList: [], ui: [], occl: {}, stat: { units: 0, xray: 0, occluded: 0 }, bob: 0, held: {}, rep: {} };
    function setParams(p) {
      if (!p || typeof p !== 'object') return;
      for (var k in p) if (p[k] != null && k in DEF) P[k] = NUM[k] ? +p[k] : String(p[k]);
      P.tileW = Math.max(16, Math.round(P.tileW / 4) * 4); P.step = Math.max(1, Math.round(P.step));
      S.cache = {}; S.cacheRot = -1; bounds = null; baseCache = null; S.camSnap = true;
      if (S.sel) showRange(S.sel);
    }
    setParams(o.params);
    var TW = function () { return P.tileW; }, TH = function () { return P.tileW / 2; };
    var key = function (x, y) { return y * COLS + x; };
    var inMap = function (x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; };

    /* ----- host adapters ----- */
    function hAt(x, y) {
      if (!inMap(x, y)) return null;
      var h = call('height', [x, y], 0);
      return (h == null || !isFinite(+h) || +h < -50) ? null : +h;
    }
    var terCache = {};
    function terrain(x, y) {
      var t = call('terrain', [x, y], null), kind;
      if (typeof t === 'string') t = { kind: t };
      t = t || {};
      kind = String(t.kind || t.type || 'grass').toLowerCase(); if (!PAL[kind] && kind !== 'stairs') kind = 'grass';
      return { kind: kind, name: String(t.name || NAMES[kind] || kind).toUpperCase(), water: !!(t.water || kind === 'water'), stairs: t.stairs != null ? t.stairs : (kind === 'stairs' ? 0 : null), cost: t.cost };
    }
    function posOf(u) { var p = o.posOf ? call('posOf', [u], null) : (u ? { x: u.x, y: u.y } : null); return p && isFinite(p.x) && isFinite(p.y) ? { x: Math.round(p.x), y: Math.round(p.y) } : null; }
    function idOf(u) { return o.idOf ? call('idOf', [u], u) : (u && u.id != null ? u.id : u); }
    function same(a, b) { return a === b || (a != null && b != null && idOf(a) === idOf(b)); }
    function units() { var l = call('units', [], null); return Array.isArray(l) ? l.filter(Boolean) : []; }
    function alive(u) { return o.alive ? !!call('alive', [u], true) : !(u && u.hp != null && u.hp <= 0); }
    function occupant(x, y) {
      if (o.occupant) return call('occupant', [x, y], null) || null;
      var L = units(); for (var i = 0; i < L.length; i++) { if (!alive(L[i])) continue; var p = posOf(L[i]); if (p && p.x === x && p.y === y) return L[i]; }
      return null;
    }
    function isFoe(a, b) { return o.isEnemy ? !!call('isEnemy', [a, b], false) : (a && b && (a.side != null ? a.side : a.team) !== (b.side != null ? b.side : b.team)); }
    function team(u) { var t = o.team ? call('team', [u], 'b') : (/^(a|player|ally|allies|hero|heroes|blue|p1|friend)$/i.test(String(u && (u.side != null ? u.side : u.team))) ? 'a' : 'b'); return t === 'a' ? 'a' : t === 'n' ? 'n' : 'b'; }
    function jumpOf(u) { var j = o.jumpOf ? call('jumpOf', [u], null) : (u && typeof u.jump === 'number' ? u.jump : null); return j == null || !isFinite(j) ? P.jump : +j; }
    function moveOf(u) { var m = o.moveOf ? call('moveOf', [u], null) : (u && typeof u.move === 'number' ? u.move : null); return m == null || !isFinite(m) ? P.move : +m; }
    function rangeOf(u) {
      var r = o.rangeOf ? call('rangeOf', [u], null) : (u ? u.range : null);
      if (r == null) r = P.range; if (typeof r === 'number') return [r, r]; if (Array.isArray(r)) return [+r[0] || 1, +(r[1] != null ? r[1] : r[0]) || 1];
      return RANGES[String(r)] || [1, 1];
    }
    function costAt(x, y, u) {
      var c = o.cost ? call('cost', [x, y, u], 1) : terrain(x, y).cost;
      c = c == null || !isFinite(+c) ? (c === Infinity ? 99 : 1) : +c; return c >= 99 ? 99 : Math.max(0, c);
    }
    function facingOf(u) { var f = o.facingOf ? call('facingOf', [u], null) : (u ? u.facing : null); f = +f; return isFinite(f) ? ((Math.round(f) % 4) + 4) % 4 : 1; }
    function setFacing(u, f) { f = ((Math.round(+f || 0) % 4) + 4) % 4; if (o.setFacing) call('setFacing', [u, f]); else if (u && typeof u === 'object') u.facing = f; return f; }

    /* ----- rotation: grid (x, y) <-> view (u, v); drawn back to front by u + v ----- */
    function dims() { return S.rot % 2 ? [ROWS, COLS] : [COLS, ROWS]; }
    function toView(x, y) { var r = S.rot; return r === 0 ? [x, y] : r === 1 ? [ROWS - 1 - y, x] : r === 2 ? [COLS - 1 - x, ROWS - 1 - y] : [y, COLS - 1 - x]; }
    function toGrid(u, v) { var r = S.rot; return r === 0 ? [u, v] : r === 1 ? [v, ROWS - 1 - u] : r === 2 ? [COLS - 1 - u, ROWS - 1 - v] : [COLS - 1 - v, u]; }
    function vecToView(dx, dy) { for (var i = 0; i < S.rot; i++) { var t = dx; dx = -dy; dy = t; } return [dx, dy]; }
    function vecToGrid(du, dv) { for (var i = 0; i < S.rot; i++) { var t = du; du = dv; dv = -t; } return [du, dv]; }
    function viewRect(g) {
      var v = o.view ? (typeof o.view === 'function' ? call('view', [], null) : o.view) : null;
      var cw = g && g.canvas ? g.canvas.width : 256, ch = g && g.canvas ? g.canvas.height : 224;
      return { x: v ? +v.x || +v.ox || 0 : 0, y: v ? +v.y || +v.oy || 0 : 0, w: v && v.w ? +v.w : cw, h: v && v.h ? +v.h : ch };
    }
    var lastView = { x: 0, y: 0, w: 256, h: 224 };
    // screen px of the TOP vertex of the diamond at fractional view (u, v) and height z (levels)
    function rawTop(u, v, z) { return { x: (u - v) * TW() / 2, y: (u + v) * TH() / 2 - z * P.step }; }
    function project(x, y, z) {   // grid tile -> canvas px of its top-face CENTRE (where feet stand)
      var vv = toViewF(x, y); if (z == null) z = hAt(Math.round(x), Math.round(y)) || 0;
      var p = rawTop(vv[0], vv[1], z); return { x: Math.round(p.x - S.cam.x + lastView.x), y: Math.round(p.y + TH() / 2 - S.cam.y + lastView.y) };
    }
    function toViewF(x, y) {   // fractional grid -> fractional view (for walking units)
      var r = S.rot; return r === 0 ? [x, y] : r === 1 ? [ROWS - 1 - y, x] : r === 2 ? [COLS - 1 - x, ROWS - 1 - y] : [y, COLS - 1 - x];
    }

    /* ----- map bounds and camera ----- */
    var bounds = null;
    function mapBounds() {
      if (bounds && bounds.rot === S.rot) return bounds;
      var d = dims(), minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, base = baseLevel();
      for (var u = 0; u < d[0]; u++) for (var v = 0; v < d[1]; v++) {
        var g = toGrid(u, v), h = hAt(g[0], g[1]); if (h == null) continue;
        var p = rawTop(u, v, h);
        minX = Math.min(minX, p.x - TW() / 2); maxX = Math.max(maxX, p.x + TW() / 2); minY = Math.min(minY, p.y - 26); maxY = Math.max(maxY, p.y + TH() + (h - base) * P.step);
      }
      if (minX > maxX) { minX = maxX = minY = maxY = 0; }
      return (bounds = { rot: S.rot, x: minX, y: minY, w: maxX - minX, h: maxY - minY });
    }
    var baseCache = null;
    function baseLevel() {
      if (baseCache != null) return baseCache;
      var m = 1e9; for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) { var h = hAt(x, y); if (h != null) m = Math.min(m, h); }
      return (baseCache = (m === 1e9 ? 0 : m) - Math.max(2, Math.ceil(10 / P.step)));
    }
    function camTarget() {
      var B = mapBounds(), V = lastView, cx, cy, f = S.focusT || S.cur;
      if (B.w <= V.w) cx = B.x + B.w / 2 - V.w / 2;
      else { var vv = toViewF(f.x, f.y), p = rawTop(vv[0], vv[1], hAt(Math.round(f.x), Math.round(f.y)) || 0); cx = p.x - V.w / 2; cx = Math.max(B.x - 8, Math.min(B.x + B.w + 8 - V.w, cx)); }
      if (B.h <= V.h) cy = B.y + B.h / 2 - V.h / 2;
      else { var vv2 = toViewF(f.x, f.y), p2 = rawTop(vv2[0], vv2[1], hAt(Math.round(f.x), Math.round(f.y)) || 0); cy = p2.y + 4 - V.h / 2; cy = Math.max(B.y - Math.round(V.h * 0.22), Math.min(B.y + B.h + 8 - V.h, cy)); }   // extra room at the top: HUD bars sit there
      return { x: Math.round(cx), y: Math.round(cy) };
    }
    function stepCamera(snap) {
      if (P.follow === 'off' && !snap && !S.camSnap) return;
      var T = camTarget();
      if (snap || S.camSnap) { S.cam.x = T.x; S.cam.y = T.y; S.camSnap = false; return; }
      var dx = T.x - S.cam.x, dy = T.y - S.cam.y;
      S.cam.x += Math.sign(dx) * Math.ceil(Math.abs(dx) * 0.2); S.cam.y += Math.sign(dy) * Math.ceil(Math.abs(dy) * 0.2);
    }

    /* ----- block art: one cached canvas per tile (top + the two visible side faces) ----- */
    function halfW(r) { var th = TH(), hh = th / 2; return r < hh ? 2 * r + 1 : 2 * (th - 1 - r) + 1; }   // row r of the diamond spans [-hw, hw)
    function botRow(dx0) { var th = TH(), tw = TW(), dx = Math.max(-tw / 2 + 1, Math.min(tw / 2 - 2, dx0)), rb = -1; for (var r = 0; r < th; r++) if (dx >= -halfW(r) && dx < halfW(r)) rb = r; return rb; }
    function pick5(R, t) { return R[Math.max(0, Math.min(4, Math.round(t)))]; }
    function topPixel(kind, gx, gy, a, b, dx, r, h, T0, stairsDir) {
      var U = gx + a, V = gy + b, X = Math.round(U * 16), Y = Math.round(V * 16), n = h2(X, Y, 11), n2 = h2(X >> 2, Y >> 2, 5), R = PAL[kind] || PAL.stone, col, tone = 2;
      if (kind === 'stone' || kind === 'stairs') {
        R = PAL.stone;
        if (kind === 'stairs') {   // three steps across the stair direction: bright nose, dark riser shadow
          var s = stairsDir === 1 || stairsDir === 3 ? b : a; if (stairsDir === 2 || stairsDir === 3) s = 1 - s;
          var f = (s * 3) % 1; tone = 2 + (h2(Math.floor(s * 3), gx * 7 + gy, 9) > 0.6 ? 1 : 0);
          if (f < 0.12) return R[4]; if (f > 0.84) return R[1];
          if (Math.abs((U * 2) % 1) < 0.04) return MORTAR;
        } else {
          var row = Math.floor(V * 2), off = (row & 1) * 0.5, su = U * 2 + off, sv = V * 2, fu = su - Math.floor(su), fv = sv - Math.floor(sv);
          if (fu < 0.07 || fv < 0.07) return h2(X, Y, 21) > 0.85 ? PAL.moss[2] : MORTAR;
          tone = 2 + (h2(Math.floor(su), Math.floor(sv), 3) > 0.8 ? 1 : 0);
          if (fu < 0.15 || fv < 0.15) tone += 1; else if (fu > 0.9 || fv > 0.9) tone -= 1;
        }
        if (n > 0.88) tone += 1; else if (n < 0.1) tone -= 1;
        col = pick5(R, tone);
      } else if (kind === 'grass' || kind === 'moss') {
        tone = 2 + (n2 > 0.62 ? 1 : n2 < 0.22 ? -1 : 0); if (n > 0.9) tone += 1; else if (n < 0.12) tone -= 1;
        if (kind === 'grass' && h2(X, Y, 77) > 0.982) return hex(h2(X, Y, 78) > 0.5 ? '#f0e090' : '#e8a0c8');
        col = pick5(R, tone);
      } else if (kind === 'dirt' || kind === 'road') {
        tone = 2 + (n2 > 0.66 ? 1 : n2 < 0.2 ? -1 : 0); if (n > 0.88) tone += 1; else if (n < 0.14) tone -= 1;
        if (h2(X, Y, 44) > 0.965) return PAL.stone[3];
        if (kind === 'road') { var e = Math.abs(((stairsDir === 1 ? a : b) % 1) - 0.5); if (e > 0.42) tone -= 1; }
        col = pick5(R, tone);
      } else if (kind === 'sand') {
        tone = 2 + (Math.sin((U * 1.3 + V) * 9 + n2 * 3) > 0.7 ? 1 : 0) - (n < 0.08 ? 1 : 0); col = pick5(R, tone);
      } else if (kind === 'snow') {
        tone = 3 + (n2 > 0.7 ? 1 : 0) - (n < 0.1 ? 1 : 0); col = pick5(R, tone);
      } else if (kind === 'wood') {
        var pv = V * 4, pf = pv - Math.floor(pv), plank = Math.floor(pv);
        if (pf < 0.12) return R[0];
        tone = 2 + (h2(plank, Math.floor(U * 1.3 + plank * 0.37), 8) > 0.6 ? 1 : 0); if (pf < 0.25) tone += 1;
        if (h2(Math.round(U * 40), plank, 2) > 0.82) tone -= 1;
        col = pick5(R, tone);
      } else if (kind === 'water') {
        col = pick5(R, 2 + (n2 > 0.6 ? 1 : 0));
      } else {   // rock
        tone = 2 + (n > 0.75 ? 1 : n < 0.3 ? -1 : 0) + (h2(X >> 1, Y >> 1, 9) > 0.8 ? 1 : 0); col = pick5(PAL.rock, tone);
        if (n2 > 0.7) col = mixA(col, PAL.moss[2], 0.45);
      }
      // a taller neighbour behind casts a shadow (light from the upper left: the -u neighbour's shadow is longer)
      if (T0.sl && a * 16 < Math.min(9, T0.sl * 2.4 * 4 / P.step)) col = mixA(col, SHADE, 0.36);
      else if (T0.sr && b * 16 < Math.min(6, T0.sr * 1.4 * 4 / P.step)) col = mixA(col, SHADE, 0.3);
      var th = TH(), lit = r <= 0 || (dx < 0 && halfW(r) + dx <= 1 && r < th / 2), litR = r < th / 2 && dx >= halfW(r) - 1, dark = r >= th - 2;
      if (lit) col = mixA(col, WARM, 0.32); else if (litR) col = mixA(col, WARM, 0.12); else if (dark) col = mixA(col, INK, 0.22);
      return col;
    }
    function facePixel(kind, left, z, s, k, depth, topKind) {
      var mat = FACE[kind] || 'brick', R = PAL[mat] || PAL.brick, col, tone = 2, st = P.step;
      if (mat === 'water') { col = mixA(PAL.water[1], PAL.water[0], Math.min(1, k / 18)); if ((k + (s >> 2)) % 7 === 0) col = PAL.water[2]; }
      else if (z < baseLevel() + 1 || (mat === 'earth' && k > 3)) {   // earth strata, darker with depth
        R = mat === 'earth' ? PAL.earth : PAL.rock;
        var band = Math.floor((z * st + 400) / 5), bn = h2(band, 3, 5); tone = 2 + (bn > 0.6 ? 1 : 0);
        if (h2(Math.round(s / 3), Math.round(z * st / 2), 17) > 0.9) tone += 1;
        if (((Math.round(z * st) % st) + st) % st === 0) tone -= 1;   // one line per height level
        col = pick5(R, tone);
      } else if (mat === 'rock') {
        var sl = Math.floor((z * st + s * 0.3) / 5), q = h2(sl, Math.floor(s / 7), 4); tone = 2 + (q > 0.65 ? 1 : q < 0.2 ? -1 : 0);
        if ((((z * st + s * 0.3) % 5) + 5) % 5 < 1) tone -= 1; if (h2(Math.round(s), Math.round(z * st), 8) > 0.94) tone += 1;
        col = pick5(R, tone);
        if (kind === 'snow' && k < 3) col = PAL.snow[3];
      } else if (mat === 'wood') {
        tone = 2 + ((Math.floor(s / 4) & 1) ? 0 : -1); if (((s % 4) + 4) % 4 < 1) tone = 0; col = pick5(R, tone);
      } else if (mat === 'earth') {   // the top 4 px of an earth face: the top material hangs over (grass lip)
        var TR = PAL[topKind] || PAL.grass; col = k < 2 ? TR[2] : k < 3 ? (h2(s, 1, 3) > 0.4 ? TR[1] : PAL.earth[2]) : PAL.earth[3];
      } else {   // brick courses: one course per height level
        var zz = z * st + 400, ch = Math.max(3, st), row = Math.floor(zz / ch), fz = (zz % ch) / ch, bs = s + (row & 1) * 5, bx = Math.floor(bs / 10), fx = ((bs % 10) + 10) % 10;
        if (fz > 0.8 || fx < 1) return left ? hex('#2e2636') : hex('#201a28');
        tone = 2 + (h2(bx, row, 6) > 0.7 ? 1 : h2(bx, row, 6) < 0.25 ? -1 : 0); if (fz < 0.25) tone += 1; if (fx < 2.2) tone += 1;
        col = pick5(R, tone);
      }
      if (!left) col = mixA(col, SHADE, 0.38);
      if (k === 0) col = mixA(col, WARM, left ? 0.3 : 0.12);
      if (k >= depth - 1) col = mixA(col, INK, 0.4);
      var below = baseLevel() * st - z * st; if (z * st < (baseLevel() + 2) * st) col = mixA(col, INK, Math.min(0.7, (2 * st - (z * st - baseLevel() * st)) / (4 * st) + 0.1));
      void below;
      return col;
    }
    function tileArt(gx, gy) {
      if (S.cacheRot !== S.rot) { S.cache = {}; S.cacheRot = S.rot; }
      var ck = gx + ',' + gy; if (S.cache[ck]) return S.cache[ck];
      var h = hAt(gx, gy); if (h == null) return null;
      var tr = terrain(gx, gy), kind = tr.kind, vv = toView(gx, gy), u = vv[0], v = vv[1], tw = TW(), th = TH(), st = P.step, base = baseLevel();
      var nb = function (du, dv) { var gg = toGrid(u + du, v + dv); return hAt(gg[0], gg[1]); };
      var hl = nb(0, 1), hr = nb(1, 0), hb = nb(-1, 0), hc = nb(0, -1);
      var dL = Math.max(0, (h - (hl == null ? base : hl)) * st), dR = Math.max(0, (h - (hr == null ? base : hr)) * st), dep = Math.max(dL, dR);
      var T0 = { sl: hb != null && hb > h ? hb - h : 0, sr: hc != null && hc > h ? hc - h : 0 };
      var sd = tr.stairs == null ? null : (function () { var d = DIRS[((tr.stairs % 4) + 4) % 4]; var w = vecToView(d[0], d[1]); return w[0] === 1 ? 0 : w[1] === 1 ? 1 : w[0] === -1 ? 2 : 3; })();
      var W = tw, Hh = th + dep + 1, c = mk(W, Hh); if (!c) return null;
      var g = c.getContext('2d'), img = g.createImageData(W, Hh), D = img.data;
      var put = function (x, y, col, al) { if (x < 0 || y < 0 || x >= W || y >= Hh) return; var i = (y * W + x) * 4; D[i] = col[0]; D[i + 1] = col[1]; D[i + 2] = col[2]; D[i + 3] = al == null ? 255 : al; };
      for (var r = 0; r < th; r++) { var hw = halfW(r); for (var dx = -hw; dx < hw; dx++) {
        var a = (r + 0.5) / th + (dx + 0.5) / tw, b = (r + 0.5) / th - (dx + 0.5) / tw;
        put(dx + tw / 2, r, topPixel(kind, u, v, a, b, dx, r, h, T0, sd), kind === 'water' ? 0 : 255);
      } }
      for (var ddx = -tw / 2; ddx < tw / 2; ddx++) {
        var rb = botRow(ddx); if (rb < 0) continue;
        var left = ddx < 0, depth = left ? dL : dR; if (!depth) continue;
        for (var k = 0; k < depth; k++) {
          var z = h - k / st, s = left ? (u * tw / 2 + ddx + tw / 2) : (v * tw / 2 + tw / 2 - ddx);
          put(ddx + tw / 2, rb + 1 + k, facePixel(kind, left, z, Math.round(s), k, depth, kind), kind === 'water' ? 235 : 255);
        }
      }
      if (dL && dR) for (var k2 = 0; k2 < Math.min(dL, dR); k2++) { var i0 = ((th + k2) * W + tw / 2) * 4; if (i0 < D.length) { var cc = mixA([D[i0], D[i0 + 1], D[i0 + 2]], [255, 255, 255], 0.1); D[i0] = cc[0]; D[i0 + 1] = cc[1]; D[i0 + 2] = cc[2]; } }
      g.putImageData(img, 0, 0);
      return (S.cache[ck] = { c: c, h: h, kind: kind, water: tr.water, ox: tw / 2, dep: dep });
    }
    function drawWaterTop(g, sx, sy, gx, gy) {   // animated surface, drawn every frame
      var th = TH(), tw = TW(), t = S.t;
      for (var r = 0; r < th; r++) {
        var hw = halfW(r); g.fillStyle = css(mixA(PAL.water[2], PAL.water[1], r / th)); g.fillRect(sx - hw, sy + r, hw * 2, 1);
      }
      for (var i = 0; i < 3; i++) {
        var ph = (t * 0.9 + h2(gx, gy, i) * 7 + i * 0.37) % 1, rr = 2 + Math.floor(h2(gx, gy, i + 9) * (th - 4)), hw2 = halfW(rr) - 3;
        if (hw2 < 2) continue; var x = sx - hw2 + Math.floor(ph * hw2 * 2), w = 2 + (i & 1);
        g.fillStyle = css(PAL.water[i === 0 ? 4 : 3]); g.fillRect(Math.min(x, sx + hw2 - w), sy + rr, w, 1);
      }
      g.fillStyle = css(mixA(PAL.water[4], WARM, 0.3), 0.55); for (var r2 = 0; r2 < th / 2; r2++) { var h3 = halfW(r2); g.fillRect(sx - h3, sy + r2, 1, 1); }
      void tw;
    }

    /* ----- reach under the jump rule ----- */
    function canStep(u, ax, ay, bx, by) {
      var ha = hAt(ax, ay), hb = hAt(bx, by); if (ha == null || hb == null) return false;
      var up = hb - ha, j = jumpOf(u); return up <= j && -up <= j + P.fall;
    }
    function compute(u, from) {
      var p = from || posOf(u), reach = new Map(), stop = new Set(), atk = new Set(), mv = moveOf(u);
      if (!p || !inMap(p.x, p.y)) return { reach: reach, stop: stop, attack: atk };
      var open = [[0, p.x, p.y]]; reach.set(key(p.x, p.y), { cost: 0, prev: -1 });
      while (open.length) {
        var bi = 0; for (var i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
        var c = open.splice(bi, 1)[0];
        if (c[0] > reach.get(key(c[1], c[2])).cost) continue;
        for (var d = 0; d < 4; d++) {
          var nx = c[1] + DIRS[d][0], ny = c[2] + DIRS[d][1]; if (!inMap(nx, ny) || hAt(nx, ny) == null) continue;
          if (!canStep(u, c[1], c[2], nx, ny)) continue;
          var oc = occupant(nx, ny); if (oc && !same(oc, u) && isFoe(u, oc)) continue;
          var cc = costAt(nx, ny, u); if (cc >= 99) continue;
          var nc = c[0] + cc; if (nc > mv) continue;
          var kk = key(nx, ny), seen = reach.get(kk); if (seen && seen.cost <= nc) continue;
          reach.set(kk, { cost: nc, prev: key(c[1], c[2]) }); open.push([nc, nx, ny]);
        }
      }
      reach.forEach(function (v, k) { var oc = occupant(k % COLS, (k / COLS) | 0); if (!oc || same(oc, u)) stop.add(k); });
      stop.forEach(function (k) { attackFrom(u, k % COLS, (k / COLS) | 0).forEach(function (t) { if (!reach.has(t) || !stop.has(t)) atk.add(t); }); });
      return { reach: reach, stop: stop, attack: atk };
    }
    function rangeBonus(u, ax, ay, tx, ty) {
      var r = rangeOf(u); if (r[1] < 2) return 0;
      var ha = hAt(ax, ay), ht = hAt(tx, ty); if (ha == null || ht == null) return 0;
      return Math.max(0, Math.floor((ha - ht) / Math.max(1, P.hgRange)));
    }
    function canHit(u, ax, ay, tx, ty) {
      var r = rangeOf(u), d = Math.abs(ax - tx) + Math.abs(ay - ty), ha = hAt(ax, ay), ht = hAt(tx, ty);
      if (ha == null || ht == null || d < r[0]) return false;
      if (r[1] < 2) return d <= r[1] && Math.abs(ha - ht) <= P.meleeH;
      return d <= r[1] + rangeBonus(u, ax, ay, tx, ty);
    }
    function attackFrom(u, x, y) {
      var r = rangeOf(u), out = [], R = r[1] + (r[1] >= 2 ? Math.ceil(30 / Math.max(1, P.hgRange)) : 0);
      for (var ty = Math.max(0, y - R); ty <= Math.min(ROWS - 1, y + R); ty++) for (var tx = Math.max(0, x - R); tx <= Math.min(COLS - 1, x + R); tx++)
        if ((tx !== x || ty !== y) && canHit(u, x, y, tx, ty)) out.push(key(tx, ty));
      return out;
    }
    function dirFrom(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; if (!dx && !dy) return -1; return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3); }
    function damageMod(att, def, ax, ay) {
      var pa = ax != null ? { x: ax, y: ay } : posOf(att), pd = posOf(def);
      if (!pa || !pd) return { mult: 1, dh: 0, height: 1, facing: 1, side: 'front' };
      var dh = (hAt(pa.x, pa.y) || 0) - (hAt(pd.x, pd.y) || 0), lv = Math.max(-3, Math.min(3, Math.round(dh / Math.max(1, P.hgRange))));
      var hm = 1 + lv * P.hgDamage / 100, from = dirFrom(pd.x, pd.y, pa.x, pa.y), f = facingOf(def), side = 'front', fm = 1;
      if (from === (f + 2) % 4) { side = 'back'; fm = P.back; } else if (from >= 0 && from !== f) { side = 'side'; fm = P.side; }
      return { mult: Math.round(hm * fm * 100) / 100, dh: dh, levels: lv, height: hm, facing: fm, side: side };
    }

    /* ----- range overlays ----- */
    function showRange(u, from) {
      var R = compute(u, from); S.sel = u; S.move = R.stop; S.attack = R.attack; S.reach = R.reach; S.age = 0; S.path = []; return R;
    }
    function show(o2) {
      o2 = o2 || {};
      var toSet = function (l) { if (!l) return null; var s = new Set(); (l.forEach ? l : []).forEach(function (t) { if (typeof t === 'number') s.add(t); else if (t && isFinite(t.x)) s.add(key(t.x, t.y)); }); return s; };
      if ('move' in o2) S.move = toSet(o2.move); if ('attack' in o2) S.attack = toSet(o2.attack);
      if ('target' in o2) S.target = o2.target ? key(o2.target.x, o2.target.y) : null;
      if ('path' in o2) S.path = (o2.path || []).map(function (p) { return { x: p.x, y: p.y }; });
      if (o2.reset !== false) S.age = 0;
    }
    function clear() { S.sel = null; S.move = S.attack = S.reach = null; S.target = null; S.path = []; }
    function cheapest(x, y) { if (!S.reach || !S.reach.has(key(x, y))) return null; var out = [], k = key(x, y); while (k >= 0) { out.push({ x: k % COLS, y: (k / COLS) | 0 }); k = S.reach.get(k).prev; } return out.reverse(); }

    /* ----- walk animator: tile by tile, a hop arc over height changes ----- */
    function walk(u, path, done, opts) {
      opts = opts || {}; path = (path || []).filter(function (p) { return p && isFinite(p.x); });
      S.walks = S.walks.filter(function (w) { return !same(w.u, u); });
      if (path.length < 2) { if (path.length === 1) call('setUnitPos', [u, path[0].x, path[0].y]); if (done) try { done(); } catch (e) { warn('walkdone', 'walk done() threw: ' + e.message); } return; }
      S.walks.push({ u: u, path: path, i: 0, f: 0, per: Math.max(2, +opts.frames || 8), done: done });
    }
    function walkPos(u) {
      for (var i = 0; i < S.walks.length; i++) { var w = S.walks[i]; if (!same(w.u, u)) continue;
        var a = w.path[w.i], b = w.path[Math.min(w.i + 1, w.path.length - 1)], f = w.f, ha = hAt(a.x, a.y) || 0, hb = hAt(b.x, b.y) || 0, dh = hb - ha;
        var lin = f < 0.5 ? ha + (dh > 0 ? dh * Math.min(1, f * 2.4) : 0) : hb - (dh < 0 ? dh * Math.max(0, 1 - (f - 0.5) * 2.4) : 0);
        var arc = Math.sin(f * Math.PI) * (Math.abs(dh) > 0 ? 0.6 + Math.abs(dh) * 0.25 : 0.25) * (4 / P.step);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: Math.max(ha, hb) > lin ? lin + arc : lin + arc, from: a, to: b };
      }
      return null;
    }
    function stepWalks() {
      for (var i = S.walks.length - 1; i >= 0; i--) {
        var w = S.walks[i]; w.f += 1 / w.per;
        if (w.i === 0 && w.f <= 1 / w.per + 1e-6) { var d0 = dirFrom(w.path[0].x, w.path[0].y, w.path[1].x, w.path[1].y); if (d0 >= 0) setFacing(w.u, d0); }
        if (w.f >= 1) {
          w.f = 0; w.i++;
          call('setUnitPos', [w.u, w.path[w.i].x, w.path[w.i].y]); call('onStep', [w.u, w.path[w.i].x, w.path[w.i].y]);
          if (w.i >= w.path.length - 1) { S.walks.splice(i, 1); if (w.done) try { w.done(); } catch (e) { warn('walkdone', 'walk done() threw: ' + e.message); } continue; }
          var d = dirFrom(w.path[w.i].x, w.path[w.i].y, w.path[w.i + 1].x, w.path[w.i + 1].y); if (d >= 0) setFacing(w.u, d);
        }
      }
    }

    /* ----- where a unit is drawn: fractional tile + height ----- */
    function unitPlace(u) {
      var w = walkPos(u); if (w) return w;
      var dp = o.drawPos ? call('drawPos', [u], null) : null, p = posOf(u);
      if (dp && isFinite(dp.x) && isFinite(dp.y)) {
        if (dp.z != null && isFinite(dp.z)) return { x: dp.x, y: dp.y, z: +dp.z };
        var ax = Math.floor(dp.x + 1e-6), ay = Math.floor(dp.y + 1e-6), bx = Math.ceil(dp.x - 1e-6), by = Math.ceil(dp.y - 1e-6);
        var ha = hAt(ax, ay), hb = hAt(bx, by); ha = ha == null ? (hb || 0) : ha; hb = hb == null ? ha : hb;
        var f = Math.max(Math.abs(dp.x - ax), Math.abs(dp.y - ay)), dh = hb - ha;
        var z = (ax === bx && ay === by) ? ha : f < 0.5 ? ha + (dh > 0 ? dh * Math.min(1, f * 2.4) : 0) : hb - (dh < 0 ? dh * Math.max(0, 1 - (f - 0.5) * 2.4) : 0);
        if (dh) z += Math.sin(f * Math.PI) * (0.6 + Math.abs(dh) * 0.25) * (4 / P.step);
        return { x: dp.x, y: dp.y, z: z, from: { x: ax, y: ay }, to: { x: bx, y: by } };
      }
      return p ? { x: p.x, y: p.y, z: hAt(p.x, p.y) || 0 } : null;
    }
    function boxOf(u) { var b = o.unitBox ? call('unitBox', [u], null) : null; return { w: b && b.w ? +b.w : 16, h: b && b.h ? +b.h : 24 }; }
    function feetOf(u) { var pl = unitPlace(u); if (!pl) return null; var vv = toViewF(pl.x, pl.y), p = rawTop(vv[0], vv[1], pl.z); return { x: Math.round(p.x - S.cam.x + lastView.x), y: Math.round(p.y + TH() / 2 - S.cam.y + lastView.y), pl: pl, v: vv }; }
    function anchorOf(u) {
      var f = feetOf(u); if (!f) return null; var b = boxOf(u), sink = waterAt(f.pl) ? 3 : 0;
      return { x: f.x, footY: f.y + sink, top: f.y + sink - b.h, left: f.x - Math.floor(b.w / 2), w: b.w, h: b.h - sink };
    }
    function waterAt(pl) { var x = Math.round(pl.x), y = Math.round(pl.y); return inMap(x, y) && Math.abs(pl.x - x) < 0.2 && Math.abs(pl.y - y) < 0.2 && terrain(x, y).water; }
    function screenFacing(u) { var d = DIRS[facingOf(u)], w = vecToView(d[0], d[1]); return { dir: w[0] === 1 ? 0 : w[1] === 1 ? 1 : w[0] === -1 ? 2 : 3, flip: w[1] > 0 || w[0] < 0, back: w[1] < 0 || w[0] < 0 }; }
    function drawOneUnit(g, u, fx, fy, pl, extra) {
      var sf = screenFacing(u), info = { facing: sf.dir, flip: sf.flip, back: sf.back, rot: S.rot, z: pl.z, t: S.t, walking: !!walkPos(u), water: waterAt(pl), xray: !!extra };
      if (info.water && !extra) {
        g.save(); g.beginPath(); g.rect(fx - 40, fy - 80, 80, 81); g.clip();
        call('drawUnit', [g, u, fx, fy + 3, info]); g.restore();
        var ph = (S.t * 2) % 1; g.fillStyle = css(PAL.water[4], 0.75 - ph * 0.5); g.fillRect(fx - 6 - Math.round(ph * 2), fy, 12 + Math.round(ph * 4), 1); g.fillRect(fx - 4, fy + 1, 8, 1);
      } else call('drawUnit', [g, u, fx, fy, info]);
    }

    /* ----- the world draw: painter's order, units interleaved, overlays on tile tops ----- */
    function diamond(g, sx, sy, inset, col, alpha) {
      g.globalAlpha = alpha; g.fillStyle = col;
      for (var r = inset; r < TH() - inset; r++) { var hw = halfW(r) - inset * 2; if (hw > 0) g.fillRect(sx - hw, sy + r, hw * 2, 1); }
      g.globalAlpha = 1;
    }
    function diamondEdge(g, sx, sy, inset, colHi, colLo, alpha) {
      g.globalAlpha = alpha;
      for (var r = inset; r < TH() - inset; r++) { var hw = halfW(r) - inset * 2; if (hw <= 0) continue; g.fillStyle = r < TH() / 2 ? colHi : colLo; g.fillRect(sx - hw, sy + r, 2, 1); g.fillRect(sx + hw - 2, sy + r, 2, 1); }
      g.fillStyle = colHi; g.fillRect(sx - 1, sy + inset, 2, 1); g.fillStyle = colLo; g.fillRect(sx - 1, sy + TH() - 1 - inset, 2, 1);
      g.globalAlpha = 1;
    }
    function ovCol(kind) {
      var C = SK && SK.palette && SK.palette.overlay && SK.palette.overlay[kind];
      return C ? { fill: C.fill || FB[kind].fill, edge: C.edge || FB[kind].edge } : FB[kind] || FB.move;
    }
    function drawOverlayAt(g, gx, gy, sx, sy) {
      var k = key(gx, gy), grow, a, pulse = P.overlay === 'pulse' ? (Math.sin(S.t * 3.2 - (gx + gy) * 0.5) + 1) / 2 : 0.5;
      var cost = S.reach && S.reach.has(k) ? S.reach.get(k).cost : 0;
      grow = Math.max(0, Math.min(1, (S.age * 0.5 - cost) / 2));
      if (S.move && S.move.has(k)) { var C = ovCol('move'); a = (0.34 + pulse * 0.14) * grow; diamond(g, sx, sy, 1, C.fill, a); diamondEdge(g, sx, sy, 1, C.edge, css(mixA(hex(C.fill), INK, 0.4)), Math.min(1, a + 0.4)); }
      else if (S.attack && S.attack.has(k)) { var C2 = ovCol('attack'); grow = Math.max(0, Math.min(1, (S.age * 0.5 - 6) / 2)); a = (0.32 + pulse * 0.14) * grow; diamond(g, sx, sy, 1, C2.fill, a); diamondEdge(g, sx, sy, 1, C2.edge, css(mixA(hex(C2.fill), INK, 0.4)), Math.min(1, a + 0.4)); }
      if (S.target === k) { var C3 = ovCol('attack'), q = (Math.sin(S.t * 8) + 1) / 2; diamond(g, sx, sy, 1, C3.fill, 0.45 + q * 0.2); diamondEdge(g, sx, sy, 0, '#fff4d0', C3.edge, 0.9); }
      for (var i = 1; i < S.path.length; i++) if (S.path[i].x === gx && S.path[i].y === gy) {
        var last = i === S.path.length - 1; g.fillStyle = '#3a1206'; g.fillRect(sx - (last ? 4 : 3), sy + TH() / 2 - (last ? 2 : 1) - 1, last ? 8 : 6, last ? 5 : 4);
        g.fillStyle = last ? '#ffe486' : '#f0a830'; g.fillRect(sx - (last ? 3 : 2), sy + TH() / 2 - (last ? 2 : 1), last ? 6 : 4, last ? 3 : 2); g.fillStyle = '#fff6d0'; g.fillRect(sx - 1, sy + TH() / 2 - (last ? 2 : 1), 2, 1);
      }
    }
    function draw(g) {
      if (!g) return; S.draws++;
      try {
        var V = viewRect(g); if (V.x !== lastView.x || V.y !== lastView.y || V.w !== lastView.w || V.h !== lastView.h) { lastView = V; S.camSnap = true; }
        if (S.camSnap) stepCamera(true);
        g.save(); g.beginPath(); g.rect(V.x, V.y, V.w, V.h); g.clip();
        var d = dims(), tw = TW(), th = TH(), ox = V.x - S.cam.x, oy = V.y - S.cam.y, smooth = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
        // units grouped by the depth (u + v) of the deepest tile they touch
        var L = units(), byDepth = {}, drawn = [], i;
        for (i = 0; i < L.length; i++) {
          var u = L[i]; if (o.isVisible && !call('isVisible', [u], true)) continue;
          var pl = unitPlace(u); if (!pl) continue;
          var va = toViewF(pl.from ? pl.from.x : pl.x, pl.from ? pl.from.y : pl.y), vb = toViewF(pl.to ? pl.to.x : pl.x, pl.to ? pl.to.y : pl.y);
          var dep = Math.round(Math.max(va[0] + va[1], vb[0] + vb[1])), vf = toViewF(pl.x, pl.y);
          (byDepth[dep] = byDepth[dep] || []).push({ u: u, pl: pl, vf: vf, dep: dep });
        }
        var B = mapBounds(), cols = [];
        for (var D = 0; D <= d[0] + d[1] - 2; D++) {
          for (var uu = Math.max(0, D - d[1] + 1); uu <= Math.min(d[0] - 1, D); uu++) {
            var vv = D - uu, gg = toGrid(uu, vv), A = tileArt(gg[0], gg[1]); if (!A) continue;
            var p = rawTop(uu, vv, A.h), sx = Math.round(p.x + ox), sy = Math.round(p.y + oy);
            if (sx + tw / 2 < V.x || sx - tw / 2 > V.x + V.w || sy > V.y + V.h || sy + A.c.height < V.y) { cols.push({ D: D, sx: sx, sy: sy, A: A, gx: gg[0], gy: gg[1], off: true }); continue; }
            g.drawImage(A.c, sx - A.ox, sy); if (A.water) drawWaterTop(g, sx, sy, gg[0], gg[1]);
            drawOverlayAt(g, gg[0], gg[1], sx, sy);
            if (o.drawTile) call('drawTile', [g, gg[0], gg[1], sx, sy, { w: tw, h: th, z: A.h }]);   // host marks on the tile top, in draw order
            cols.push({ D: D, sx: sx, sy: sy, A: A, gx: gg[0], gy: gg[1] });
          }
          var list = byDepth[D]; if (!list) continue;
          list.sort(function (a, b) { return a.vf[0] - b.vf[0]; });
          for (i = 0; i < list.length; i++) {
            var it = list[i], tp = rawTop(it.vf[0], it.vf[1], it.pl.z), fx = Math.round(tp.x + ox), fy = Math.round(tp.y + th / 2 + oy);
            drawOneUnit(g, it.u, fx, fy, it.pl); drawn.push({ u: it.u, fx: fx, fy: fy, D: D, pl: it.pl });
          }
        }
        S.stat.units = drawn.length; S.lastCols = cols; S.lastDrawn = drawn;
        drawXray(g, drawn, cols);
        drawCursor(g, ox, oy);
        drawFacing(g, ox, oy);
        g.imageSmoothingEnabled = smooth; g.restore();
        void B;
      } catch (e) { warn('draw', 'draw() failed: ' + (e && e.message)); try { g.restore(); } catch (e2) { /* ignore */ } }
    }
    // x-ray: a unit hidden by a block drawn after it gets its silhouette outlined on top (team colour), plus a faint fill
    var XC = null;
    function drawXray(g, drawn, cols) {
      S.occl = {}; S.stat.xray = 0; S.stat.occluded = 0; if (P.xray === 'off' || !drawn.length) return;
      var curOc = occupant(S.cur.x, S.cur.y), want = function (u) {
        if (P.xray === 'all') return true; if (P.xray === 'team' && team(u) === 'a') return true;
        return same(u, S.active) || same(u, S.sel) || same(u, curOc) || (S.facing && same(u, S.facing.u)) || S.walks.some(function (w) { return same(w.u, u); });
      };
      if (!XC) { XC = { s: mk(64, 72), o: mk(64, 72), r: mk(64, 72) }; if (XC.r) XC.r.getContext('2d', { willReadFrequently: true }); } if (!XC.s) return;
      for (var i = 0; i < drawn.length; i++) {
        var it = drawn[i]; if (!want(it.u) || !alive(it.u)) continue;
        var b = boxOf(it.u), box = { x: it.fx - 32, y: it.fy - 64, w: 64, h: 72 }, occ = [];
        for (var c = 0; c < cols.length; c++) { var C = cols[c]; if (C.D <= it.D || C.off) continue; if (hitR(box, { x: C.sx - C.A.ox, y: C.sy, w: C.A.c.width, h: C.A.c.height })) occ.push(C); }
        if (!occ.length) continue;
        S.stat.xray++;
        var sg = XC.s.getContext('2d'), og = XC.o.getContext('2d'), rg = XC.r.getContext('2d');
        sg.clearRect(0, 0, 64, 72); og.clearRect(0, 0, 64, 72); rg.clearRect(0, 0, 64, 72);
        sg.imageSmoothingEnabled = og.imageSmoothingEnabled = rg.imageSmoothingEnabled = false;
        call('drawUnit', [sg, it.u, 32, 64, { facing: screenFacing(it.u).dir, flip: screenFacing(it.u).flip, back: screenFacing(it.u).back, rot: S.rot, z: it.pl.z, t: S.t, xray: true }]);
        for (c = 0; c < occ.length; c++) og.drawImage(occ[c].A.c, occ[c].sx - occ[c].A.ox - box.x, occ[c].sy - box.y);
        // covered part of the sprite
        rg.drawImage(XC.s, 0, 0); rg.globalCompositeOperation = 'destination-in'; rg.drawImage(XC.o, 0, 0); rg.globalCompositeOperation = 'source-over';
        var data = rg.getImageData(0, 0, 64, 72).data, n = 0; for (var q = 3; q < data.length; q += 16) if (data[q] > 40) n++;
        if (n < 3) continue;
        S.stat.occluded++; S.occl[String(idOf(it.u))] = n;
        var col = team(it.u) === 'a' ? (SK && SK.palette && SK.palette.team ? SK.palette.team.a : FB.a) : (SK && SK.palette && SK.palette.team ? SK.palette.team.b : FB.b);
        var lc = css(mixA(hex(col), [255, 255, 255], 0.55)), pulse = 0.75 + 0.25 * Math.sin(S.t * 6);
        // faint fill of the covered part
        rg.globalCompositeOperation = 'source-in'; rg.fillStyle = col; rg.fillRect(0, 0, 64, 72); rg.globalCompositeOperation = 'source-over';
        g.globalAlpha = 0.38; g.drawImage(XC.r, box.x, box.y); g.globalAlpha = 1;
        // 1 px outline ring around the silhouette, kept only where blocks cover it
        rg.clearRect(0, 0, 64, 72);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dd) { rg.drawImage(XC.s, dd[0], dd[1]); });
        rg.globalCompositeOperation = 'destination-out'; rg.drawImage(XC.s, 0, 0);
        rg.globalCompositeOperation = 'destination-in'; rg.drawImage(XC.o, 0, 0);
        rg.globalCompositeOperation = 'source-in'; rg.fillStyle = lc; rg.fillRect(0, 0, 64, 72); rg.globalCompositeOperation = 'source-over';
        g.globalAlpha = pulse; g.drawImage(XC.r, box.x, box.y); g.globalAlpha = 1;
        void b;
      }
    }
    function drawCursor(g, ox, oy) {
      if (!S.cursorOn || !inMap(S.cur.x, S.cur.y)) return;
      var h = hAt(S.cur.x, S.cur.y); if (h == null) return;
      var vv = toView(S.cur.x, S.cur.y), p = rawTop(vv[0], vv[1], h), sx = Math.round(p.x + ox), sy = Math.round(p.y + oy), th = TH(), tw = TW();
      var bad = S.buzz > 0, C = bad ? ['#ffc0b0', '#e84838'] : ['#fff8d0', '#f8c840'], c = (Math.floor(S.t * 3.6) % 2) ? C[0] : C[1], o2 = Math.floor(S.t * 3.6) % 2;
      var seg = function (x0, y0, dx, dy, n) { for (var k = 0; k < n; k++) { g.fillStyle = '#1a0e08'; g.fillRect(x0 + dx * k * 2 - 1, y0 + dy * k, 4, 2); } for (k = 0; k < n; k++) { g.fillStyle = c; g.fillRect(x0 + dx * k * 2, y0 + dy * k, 2, 1); } };
      var e = o2; seg(sx - 2, sy - e, -1, 1, 3); seg(sx, sy - e, 1, 1, 3); seg(sx - 2, sy + th - 1 + e, -1, -1, 3); seg(sx, sy + th - 1 + e, 1, -1, 3);
      seg(sx - tw / 2 - e, sy + th / 2 - 1, 1, -1, 2); seg(sx - tw / 2 - e, sy + th / 2, 1, 1, 2); seg(sx + tw / 2 - 2 + e, sy + th / 2 - 1, -1, -1, 2); seg(sx + tw / 2 - 2 + e, sy + th / 2, -1, 1, 2);
      // the pointer floats above the tile (or above the unit standing there)
      var oc = occupant(S.cur.x, S.cur.y), lift = oc ? boxOf(oc).h + 6 : 10, bob = Math.round(Math.abs(Math.sin(S.t * Math.PI * 1.6)) * 3);
      var rows = ['ooooooo', 'oWLLYAo', 'oLYYYAo', 'ooLYAoo', '.oLYAo.', '..oAo..', '...o...'], pal = { o: '#1a0e08', W: '#ffffff', L: '#fff4b0', Y: bad ? '#f07050' : '#f8c840', A: bad ? '#a03020' : '#c07818' };
      var px0 = sx - 3, py0 = sy + th / 2 - lift - 7 - bob;
      for (var ry = 0; ry < rows.length; ry++) for (var rx = 0; rx < 7; rx++) { var ch = rows[ry][rx]; if (ch !== '.') { g.fillStyle = pal[ch]; g.fillRect(px0 + rx, py0 + ry, 1, 1); } }
      S.cursorRect = { x: sx - tw / 2 - 2, y: Math.min(py0, sy) - 1, w: tw + 4, h: sy + th + 2 - Math.min(py0, sy) };
    }
    function arrowPx(g, cx, cy, dx, dy, col, size) {   // a small filled arrow pointing along screen vector (dx, dy)
      var L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L; var nx = -dy, ny = dx, s = size;
      for (var y = -s - 1; y <= s + 1; y++) for (var x = -s - 1; x <= s + 1; x++) {
        var a = x * dx + y * dy, b = x * nx + y * ny, inside = a <= s * 0.9 && a >= -s * 0.5 && Math.abs(b) <= (s * 0.9 - a) * 0.75, rim = a <= s * 0.9 + 1.1 && a >= -s * 0.5 - 1.1 && Math.abs(b) <= (s * 0.9 + 1.1 - a) * 0.75 + 0.9;
        if (rim) { g.fillStyle = inside ? (b < 0 ? col[0] : col[1]) : '#120a10'; g.fillRect(cx + x, cy + y, 1, 1); }
      }
    }
    function drawFacing(g, ox, oy) {
      var F = S.facing; if (!F) return; var p = posOf(F.u); if (!p) return;
      var h = hAt(p.x, p.y) || 0, th = TH();
      for (var d = 0; d < 4; d++) {
        var vv = toViewF(p.x + DIRS[d][0] * 0.62, p.y + DIRS[d][1] * 0.62), c0 = toViewF(p.x, p.y), q = rawTop(vv[0], vv[1], h), q0 = rawTop(c0[0], c0[1], h);
        var sx = Math.round(q.x + ox), sy = Math.round(q.y + oy + th / 2), on = d === F.d, bob = on ? Math.round(Math.sin(S.t * 8)) : 0;
        var dx = q.x - q0.x, dy = q.y - q0.y;
        arrowPx(g, sx + Math.round(dx / 16 * bob), sy + Math.round(dy / 16 * bob), dx, dy, on ? ['#fff8d0', '#f8c840'] : ['#d8dcf0', '#9aa0c0'], on ? 6 : 4);
      }
    }

    /* ----- UI: tile info plate and WT order bar (through the skin when loaded) ----- */
    function uiText(g, s, x, y, c1, c2) { if (SK) { try { SK.text(g, String(s), x, y, { font: 'ui', color: c1, color2: c2 || c1 }); return; } catch (e) { /* fall back */ } } fbText(g, s, x, y, c1, c2); }
    function uiW(s) { if (SK) { try { return SK.measure(String(s), { font: 'ui' }); } catch (e) { /* fall back */ } } return fbW(s); }
    function uiFrame(g, r, team2) { if (SK) { try { SK.frame(g, r, { role: 'window', team: team2 || 'n' }); return; } catch (e) { /* fall back */ } } fbFrame(g, r, team2 || 'n'); }
    function tcol(path, fb) { try { var v = SK && SK.token ? SK.token(path) : null; return v && v !== path ? v : fb; } catch (e) { return fb; } }
    function drawUI(g, avoid) {
      S.ui = []; if (!g) return S.ui;
      try {
        var V = viewRect(g); avoid = (avoid || []).filter(function (r) { return r && r.w > 0; });
        if (S.cursorOn && inMap(S.cur.x, S.cur.y) && hAt(S.cur.x, S.cur.y) != null) {
          var tr = terrain(S.cur.x, S.cur.y), h = hAt(S.cur.x, S.cur.y), l1 = tr.name, l2 = 'H ' + h, w = Math.max(uiW(l1), uiW(l2) + 14) + 14, hh = 30;
          var cands = [[V.x + V.w - w - 4, V.y + V.h - hh - 4], [V.x + 4, V.y + V.h - hh - 4], [V.x + V.w - w - 4, V.y + 4], [V.x + 4, V.y + 4]], best = null;
          cands.forEach(function (c, i) {
            var r = { x: c[0], y: c[1], w: w, h: hh }, sc = i;
            avoid.forEach(function (a) { if (hitR(r, a)) sc += 1e5; }); if (S.cursorRect && hitR(r, S.cursorRect)) sc += 500;
            (S.lastDrawn || []).forEach(function (it) { var b = boxOf(it.u); if (hitR(r, { x: it.fx - b.w / 2, y: it.fy - b.h, w: b.w, h: b.h })) sc += 60; });
            if (!best || sc < best.sc) best = { r: r, sc: sc };
          });
          var R = best.r; uiFrame(g, R, 'n'); uiText(g, l1, R.x + 7, R.y + 5, tcol('text.main', FB.text), tcol('text.label', FB.text2));
          // height pips: a little stacked-block icon then the level
          var bx = R.x + 7, by = R.y + 17; g.fillStyle = '#0a0812'; g.fillRect(bx - 1, by - 1, 10, 9); g.fillStyle = '#c8b090'; g.fillRect(bx, by, 8, 3); g.fillStyle = '#7a6a58'; g.fillRect(bx, by + 3, 8, 4); g.fillStyle = '#fff0d0'; g.fillRect(bx, by, 8, 1);
          uiText(g, l2, R.x + 21, R.y + 17, tcol('text.accent', FB.accent), tcol('text.accent', FB.accent));
          S.ui.push({ x: R.x, y: R.y, w: R.w, h: R.h, kind: 'info' });
        }
        if (S.cursorRect) S.ui.push({ x: S.cursorRect.x, y: S.cursorRect.y, w: S.cursorRect.w, h: S.cursorRect.h, kind: 'cursor' });
      } catch (e) { warn('drawUI', 'drawUI() failed: ' + (e && e.message)); }
      return S.ui;
    }
    function drawOrder(g, x, y, n, opts) {
      opts = opts || {}; n = Math.max(1, n || 6);
      try {
        var list = wtOrder(n), cw = 18, w = 22 + list.length * cw + 4, h = 24, R = { x: x, y: y, w: w, h: h };
        if (opts.align === 'right') R.x = x - w;
        uiFrame(g, R, 'n'); uiText(g, 'WT', R.x + 5, R.y + 9, tcol('text.accent', FB.accent));
        list.forEach(function (e, i) {
          var cx = R.x + 20 + i * cw, cy = R.y + 4, tm = team(e.unit), fc = i === 0 ? ['#fff0b8', '#e0b060', '#6a4420'] : tm === 'a' ? ['#a8c8ff', '#4a6ac8', '#1a2a5a'] : ['#ffb8a8', '#c84a4a', '#5a1a1a'];
          g.fillStyle = fc[2]; g.fillRect(cx, cy, 16, 16); g.fillStyle = fc[0]; g.fillRect(cx, cy, 16, 1); g.fillRect(cx, cy, 1, 16); g.fillStyle = fc[1]; g.fillRect(cx + 15, cy + 1, 1, 15); g.fillRect(cx + 1, cy + 15, 15, 1);
          g.save(); g.beginPath(); g.rect(cx + 1, cy + 1, 14, 14); g.clip();
          if (o.drawPortrait) call('drawPortrait', [g, e.unit, cx + 1, cy + 1, 14]); else { var nm = String(e.unit && e.unit.name || '?')[0]; fbText(g, nm, cx + 5, cy + 4, '#ffffff', '#c8d4ff'); }
          g.restore();
          if (i === 0) { g.fillStyle = '#fff8d0'; g.fillRect(cx - 1, cy - 1, 18, 1); g.fillRect(cx - 1, cy - 1, 1, 18); g.fillStyle = '#c08a30'; g.fillRect(cx + 16, cy - 1, 1, 18); g.fillRect(cx - 1, cy + 16, 18, 1); }
          else { var s = String(e.wt); g.fillStyle = 'rgba(8,6,16,0.85)'; g.fillRect(cx + 16 - s.length * 4 - 1, cy + 10, s.length * 4 + 1, 6); smallNum(g, s, cx + 16 - s.length * 4, cy + 11, tm === 'a' ? '#c8dcff' : '#ffc8b8'); }
        });
        S.ui.push({ x: R.x, y: R.y, w: R.w, h: R.h, kind: 'order' }); return R;
      } catch (e) { warn('drawOrder', 'drawOrder() failed: ' + (e && e.message)); return null; }
    }
    var SMALL = { 0: '777', 1: '262', 2: '717', 3: '737', 4: '571', 5: '747', 6: '457', 7: '711', 8: '757', 9: '751' };   // not used directly
    var D35 = { 0: '111,101,101,101,111', 1: '010,110,010,010,111', 2: '111,001,111,100,111', 3: '111,001,011,001,111', 4: '101,101,111,001,001', 5: '111,100,111,001,111', 6: '111,100,111,101,111', 7: '111,001,010,010,010', 8: '111,101,111,101,111', 9: '111,101,111,001,111' };
    function smallNum(g, s, x, y, col) { g.fillStyle = col; for (var i = 0; i < s.length; i++) { var rows = (D35[s[i]] || D35[0]).split(','); for (var ry = 0; ry < 5; ry++) for (var rx = 0; rx < 3; rx++) if (rows[ry][rx] === '1') g.fillRect(x + i * 4 + rx, y + ry, 1, 1); } }
    void SMALL;

    /* ----- WT scheduler: the unit with the lowest wait acts next; acting costs wait ----- */
    function waitOf(u) { var w = o.waitOf ? call('waitOf', [u], null) : (u && typeof u.wait === 'number' ? u.wait : null); return w == null || !isFinite(w) ? P.wtBase : Math.max(1, Math.round(+w)); }
    function wtReset(list) {
      S.wt = {}; S.wtList = (list || units()).slice();
      S.wtList.forEach(function (u, i) { S.wt[String(idOf(u))] = Math.round(waitOf(u) * 0.5) + i % 3; });
    }
    function wtLive() { if (!S.wtList.length) S.wtList = units(); return S.wtList.filter(function (u) { return alive(u); }); }
    function wtGet(u) { var v = S.wt[String(idOf(u))]; if (v == null) { v = waitOf(u); S.wt[String(idOf(u))] = v; } return v; }
    function wtNext() {
      var L = wtLive(); if (!L.length) return null;
      var best = L[0], i; for (i = 1; i < L.length; i++) if (wtGet(L[i]) < wtGet(best)) best = L[i];
      var m = wtGet(best); L.forEach(function (u) { S.wt[String(idOf(u))] = wtGet(u) - m; });
      S.active = best; return best;
    }
    function wtEnd(u, how) { how = how || {}; var k = how.moved && how.acted ? 1 : (how.moved || how.acted) ? 0.75 : 0.5; S.wt[String(idOf(u))] = Math.max(1, Math.round(waitOf(u) * k)); }
    function wtOrder(n) {
      var L = wtLive(), W = L.map(function (u) { return wtGet(u); }), out = [], guard = 0;
      if (!L.length) return out;
      while (out.length < n && guard++ < 200) {
        var bi = 0; for (var i = 1; i < L.length; i++) if (W[i] < W[bi]) bi = i;
        var m = W[bi]; out.push({ unit: L[bi], wt: m + (out.length ? out[out.length - 1].acc || 0 : 0) });
        out[out.length - 1].acc = out[out.length - 1].wt;
        for (i = 0; i < L.length; i++) W[i] -= m;
        W[bi] = waitOf(L[bi]);
      }
      return out.map(function (e) { return { unit: e.unit, wt: e.wt }; });
    }

    /* ----- facing picker ----- */
    function chooseFacing(u, done) {
      var p = posOf(u); if (!p) { if (done) done(facingOf(u)); return; }
      S.facing = { u: u, d: facingOf(u), done: done };
    }
    function confirmFacing() {
      var F = S.facing; if (!F) return false; S.facing = null; setFacing(F.u, F.d);
      if (F.done) try { F.done(F.d); } catch (e) { warn('facingdone', 'chooseFacing done() threw: ' + e.message); }
      return true;
    }
    function facingToward(ax, ay, tx, ty) { var d = dirFrom(ax, ay, tx, ty); return d < 0 ? 1 : d; }
    function bestFacing(u) {
      var p = posOf(u); if (!p) return facingOf(u); var L = units(), best = null;
      L.forEach(function (o2) { if (!alive(o2) || !isFoe(u, o2)) return; var q = posOf(o2); if (!q) return; var d = Math.abs(q.x - p.x) + Math.abs(q.y - p.y); if (!best || d < best.d) best = { d: d, q: q }; });
      return best ? facingToward(p.x, p.y, best.q.x, best.q.y) : facingOf(u);
    }

    /* ----- input: screen-relative arrows (rotation aware), rotate keys, facing picker ----- */
    var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
      KeyZ: 'a', Enter: 'a', Space: 'a', KeyX: 'b', Escape: 'b', KeyQ: 'rotl', KeyE: 'rotr', BracketLeft: 'rotl', BracketRight: 'rotr' };
    var SCREEN = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };   // view directions: up = up-right, right = down-right ...
    function gridDir(name) { var s = SCREEN[name]; if (!s) return null; var g2 = vecToGrid(s[0], s[1]); return { x: g2[0], y: g2[1] }; }
    function moveCursor(dx, dy) {
      var nx = Math.max(0, Math.min(COLS - 1, S.cur.x + dx)), ny = Math.max(0, Math.min(ROWS - 1, S.cur.y + dy));
      if (nx === S.cur.x && ny === S.cur.y) return; setCursor(nx, ny); call('onCursor', [nx, ny]);
    }
    function press(name) {
      if (S.facing) {
        if (SCREEN[name]) { var gd = gridDir(name); for (var d = 0; d < 4; d++) if (DIRS[d][0] === gd.x && DIRS[d][1] === gd.y) S.facing.d = d; return true; }
        if (name === 'a') return confirmFacing();
        if (name === 'b') { var F = S.facing; if (F.cancel) { S.facing = null; F.cancel(); return true; } return true; }
        return false;
      }
      if ((name === 'rotl' || name === 'rotr') && P.rotate === 'on') { rotate(name === 'rotr' ? 1 : -1); return true; }
      if (SCREEN[name] && P.keys === 'on' && o.cursorKeys) { var g3 = gridDir(name); S.held[name] = 0; moveCursor(g3.x, g3.y); return true; }
      return false;
    }
    function keyInput(code, down, isRepeat) {
      var n = KEYS[code]; if (!n) return false;
      if (!down) { delete S.held[n]; return !!(S.facing || (SCREEN[n] && o.cursorKeys && P.keys === 'on')); }
      if (isRepeat) {   // held arrows keep moving the cursor; everything else ignores OS repeat
        if (!S.facing && SCREEN[n] && o.cursorKeys && P.keys === 'on') { var gr = gridDir(n); moveCursor(gr.x, gr.y); return true; }
        return !!(S.facing || ((n === 'rotl' || n === 'rotr') && P.rotate === 'on'));
      }
      if (n === 'a' || n === 'b') return S.facing ? press(n) : false;
      return press(n);
    }
    function release(name) { delete S.held[name]; }
    function rotate(dir) {
      var keepCur = { x: S.cur.x, y: S.cur.y };
      S.rot = (((S.rot + (dir < 0 ? -1 : 1)) % 4) + 4) % 4; bounds = null; S.cache = {}; S.cacheRot = S.rot; S.cur = keepCur; S.rotFx = 10; S.camSnap = true;
      call('onRotate', [S.rot]); return S.rot;
    }

    /* ----- picking: screen px -> tile (front-most hit: unit sprites first, then tile tops and their side faces) ----- */
    function pick(px, py, opts) {
      try {
        opts = opts || {};
        if (opts.units !== false && S.lastDrawn) for (var i = S.lastDrawn.length - 1; i >= 0; i--) {
          var it = S.lastDrawn[i], b = boxOf(it.u); if (!alive(it.u)) continue;
          if (px >= it.fx - b.w / 2 && px < it.fx + b.w / 2 && py >= it.fy - b.h && py < it.fy + 2) { var p = posOf(it.u); if (p) return { x: p.x, y: p.y, unit: it.u }; }
        }
        var d = dims(), V = lastView, ox = V.x - S.cam.x, oy = V.y - S.cam.y, tw = TW(), th = TH();
        for (var D = d[0] + d[1] - 2; D >= 0; D--) for (var u = Math.min(d[0] - 1, D); u >= Math.max(0, D - d[1] + 1); u--) {
          var v = D - u, gg = toGrid(u, v), h = hAt(gg[0], gg[1]); if (h == null) continue;
          var q = rawTop(u, v, h), sx = q.x + ox, sy = q.y + oy, dx = px - sx, dy = py - sy;
          if (dy >= 0 && dy < th && Math.abs(dx) / (tw / 2) + Math.abs(dy - th / 2) / (th / 2) <= 1) return { x: gg[0], y: gg[1] };
          var A = tileArt(gg[0], gg[1]); if (!A || !A.dep) continue;
          // side faces: below the lower edges of the diamond, down to the face depth
          if (Math.abs(dx) < tw / 2) { var rb = th / 2 + (th / 2) * (1 - Math.abs(dx) / (tw / 2)); if (dy >= rb && dy < rb + A.dep) return { x: gg[0], y: gg[1] }; }
        }
      } catch (e) { warn('pick', 'pick() failed: ' + (e && e.message)); }
      return null;
    }

    function setCursor(x, y) { if (!isFinite(x) || !isFinite(y)) return; S.cur = { x: Math.max(0, Math.min(COLS - 1, Math.round(x))), y: Math.max(0, Math.min(ROWS - 1, Math.round(y))) }; S.cursorOn = true; if (S.sel && S.reach && S.move && S.move.has(key(S.cur.x, S.cur.y))) S.path = cheapest(S.cur.x, S.cur.y) || S.path; }
    function update() {
      try {
        S.updates++; S.frames++; S.t = S.frames / 60; S.age++; if (S.buzz > 0) S.buzz--; if (S.rotFx > 0) S.rotFx--;
        if (o.getCursor) { var c = call('getCursor', [], null); if (c && isFinite(c.x) && isFinite(c.y)) { if (c.x !== S.cur.x || c.y !== S.cur.y) setCursor(c.x, c.y); S.cursorOn = !(c.hidden || c.visible === false) && inMap(c.x, c.y); } else if (c === null) S.cursorOn = false; }
        if (S.sel && !alive(S.sel)) clear();
        stepWalks();
        var w0 = S.walks[0]; S.focusT = w0 ? walkPos(w0.u) : (o.focus ? call('focus', [], null) : null);
        if (S.focusT && !isFinite(S.focusT.x)) S.focusT = null;
        stepCamera(false);
      } catch (e) { warn('update', 'update() failed: ' + (e && e.message)); }
    }
    function invalidate() { S.cache = {}; S.cacheRot = -1; bounds = null; baseCache = null; terCache = {}; }

    var api = {
      update: update, draw: draw, drawUI: drawUI, drawOrder: drawOrder,
      getUIRects: function () { return S.ui.slice(); },
      project: project, pick: pick, anchorOf: anchorOf,
      feetOf: function (u) { var f = feetOf(u); return f ? { x: f.x, y: f.y } : null; },
      heightAt: hAt, posOf: posOf, canStep: canStep, canHit: canHit, rangeBonus: rangeBonus, damageMod: damageMod,
      reachOf: function (u, from) { var R = compute(u, from); return { move: new Set(R.reach.keys()), stop: R.stop, attack: R.attack, cost: R.reach }; },
      pathTo: function (u, x, y, from) { var R = compute(u, from), out = [], k = key(x, y); if (!R.reach.has(k)) return null; while (k >= 0) { out.push({ x: k % COLS, y: (k / COLS) | 0 }); k = R.reach.get(k).prev; } return out.reverse(); },
      attackFrom: function (u, x, y) { return new Set(attackFrom(u, x, y)); },
      showRange: showRange, show: show, clear: clear, select: showRange,
      walk: walk, isWalking: function (u) { return u ? S.walks.some(function (w) { return same(w.u, u); }) : S.walks.length > 0; },
      facingToward: facingToward, bestFacing: bestFacing, chooseFacing: chooseFacing, setFacing: setFacing, facingOf: facingOf,
      cancelFacing: function () { S.facing = null; },
      get choosingFacing() { return !!S.facing; },
      key: keyInput, press: press, release: release, gridDir: gridDir, rotate: rotate,
      get rot() { return S.rot; }, get cam() { return { x: S.cam.x, y: S.cam.y }; }, get cursor() { return { x: S.cur.x, y: S.cur.y }; },
      setCursor: function (x, y) { setCursor(x, y); }, buzz: function () { S.buzz = 12; },
      setActive: function (u) { S.active = u || null; }, get active() { return S.active; },
      wt: { reset: wtReset, next: wtNext, end: wtEnd, order: wtOrder, get: wtGet },
      tileKey: key, setParams: setParams, get params() { var c = {}; for (var k in P) c[k] = P[k]; return c; },
      invalidate: invalidate, snapCamera: function () { S.camSnap = true; stepCamera(true); },
      isOccluded: function (u) { return S.occl[String(idOf(u))] || 0; },
      stats: function () { return { draws: S.draws, updates: S.updates, units: S.stat.units, xray: S.stat.xray, occluded: S.stat.occluded, rot: S.rot, cam: { x: S.cam.x, y: S.cam.y }, cursorOn: !!S.cursorOn, cursor: { x: S.cur.x, y: S.cur.y }, facing: !!S.facing, walks: S.walks.length }; },
      lastDrawn: function () { return (S.lastDrawn || []).map(function (it) { var b = boxOf(it.u); return { unit: it.u, id: idOf(it.u), x: it.fx - Math.floor(b.w / 2), y: it.fy - b.h, w: b.w, h: b.h, footX: it.fx, footY: it.fy }; }); }
    };
    return api;
  }

  root.GameDNA_IsoHeight = { create: create, version: '1.0.0', DIRS: DIRS };
})(typeof window !== 'undefined' ? window : this);
