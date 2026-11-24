/* GameDNA B-02 Enemy threat range  (module v1, no dependencies, no exports)
   Global: window.GameDNA_ThreatRange.create(options) -> instance. See module/README.md.
   Owns: each enemy's move + attack reach (terrain-cost aware, through the host's callbacks), the union "danger zone",
   single-enemy and pinned views, automatic recompute when units move, the red tinted overlay with a crisp marching
   outline, the outline-only mode while the player's own range is on screen, the toggle key and the on-screen button.
   The host keeps its units and map; the module only asks. Draws through GameDNA_Skin when skin-api.js is loaded
   (overlay, frame, text, palette tokens), else through a built-in copy of the pixel16 look. Never throws from
   update / draw / key / click: host callbacks are wrapped. */
(function (root) {
  'use strict';
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  var RANGES = { '1': [1, 1], '1-2': [1, 2], '2': [2, 2], '1-3': [1, 3], '2-3': [2, 3] };
  var DEF = { move: 5, range: '1', tint: 'red', fill: 0.8, pattern: 'solid', outline: 'march', march: 8, dash: 4, fade: 120,
    both: 'outline', walls: 'hide', costs: 'on', key: 'KeyT', label: 'THREAT', start: 'off', layer: 'under', button: 'auto' };
  var NUM = { fill: 1, march: 1, dash: 1, fade: 1, move: 1 };

  /* ---------- built-in pixel16 look (used when skin-api.js is not loaded) ---------- */
  var FB = {
    overlay: { red: { fill: '#e43430', edge: '#ffd6c8' }, threat: { fill: '#a830c8', edge: '#f0d0ff' } },
    ink: '#06061a', accent: '#ffe070', text: '#ffffff', text2: '#c8d4ff', shadow: '#0a0c24', dim: '#8088a8',
    plate: ['#0a0c24', '#1c2458', '#5a6ac0', '#3a2a6a', '#8a72d8']
  };
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
    9: '01110,10001,10001,01111,00001,00010,01100', '-': '00000,00000,00000,01110,00000,00000,00000', '?': '01110,10001,00001,00010,00100,00000,00100'
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
            g.fillStyle = pass ? (ry < 4 ? c1 : c2) : FB.shadow;
            g.fillRect(cx + rx + (pass ? 0 : 1), y + ry + (pass ? 0 : 1), 1, 1);
          }
        }
        cx += ch === ' ' ? 4 : 6;
      }
    }
  }
  function hexRgb(c) {
    c = String(c || '#000000');
    var m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) { var h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
    m = c.match(/^rgba?\(([^)]+)\)$/); if (m) return m[1].split(',').slice(0, 3).map(function (v) { return +v; });
    return [0, 0, 0];
  }
  function mix(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * t); }).join(',') + ')'; }
  function rgba(c, a) { var v = hexRgb(c); return 'rgba(' + v[0] + ',' + v[1] + ',' + v[2] + ',' + a + ')'; }
  function fbOverlay(g, r, C, t, o) {   // copy of pixel16 overlay(): 'color' tint 0.72, 0.22 fill, pulsing / checker, 0.12 seams
    var gr = o.grow == null ? 1 : o.grow; if (!(gr > 0)) return;
    var tx = o.tile ? o.tile.x : 0, ty = o.tile ? o.tile.y : 0, a2 = 0.22, M = o.seams || {}, op = g.globalCompositeOperation;
    if (o.pattern === 'pulsing' && Math.sin((tx + ty) * 0.55 - t * 3.2) > 0.5) a2 = 0.30;
    if (o.pattern === 'checker') a2 = (tx + ty) % 2 ? 0.30 : 0.17;
    g.globalCompositeOperation = 'color'; g.fillStyle = rgba(C.fill, 0.72 * gr); g.fillRect(r.x, r.y, r.w, r.h);
    g.globalCompositeOperation = 'source-over'; g.fillStyle = rgba(C.fill, a2 * gr); g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = rgba(C.edge, 0.12); if (M.right) g.fillRect(r.x + r.w - 1, r.y, 1, r.h); if (M.bottom) g.fillRect(r.x, r.y + r.h - 1, r.w, 1);
    g.globalCompositeOperation = op;
  }

  /* ---------- rect helpers ---------- */
  function hit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function cut(r, obs) {   // r minus every obstacle -> list of visible pieces
    var out = [r];
    for (var i = 0; i < obs.length && out.length; i++) {
      var b = obs[i], next = [];
      for (var j = 0; j < out.length; j++) {
        var p = out[j];
        if (!hit(p, b)) { next.push(p); continue; }
        var top = Math.max(p.y, b.y), bot = Math.min(p.y + p.h, b.y + b.h);
        if (b.y > p.y) next.push({ x: p.x, y: p.y, w: p.w, h: b.y - p.y });
        if (b.y + b.h < p.y + p.h) next.push({ x: p.x, y: b.y + b.h, w: p.w, h: p.y + p.h - b.y - b.h });
        if (b.x > p.x) next.push({ x: p.x, y: top, w: b.x - p.x, h: bot - top });
        if (b.x + b.w < p.x + p.w) next.push({ x: b.x + b.w, y: top, w: p.x + p.w - b.x - b.w, h: bot - top });
      }
      out = next;
    }
    return out;
  }
  function normRect(r) {
    if (!r || typeof r !== 'object') return null;
    var x = +r.x, y = +r.y, w = +(r.w != null ? r.w : r.width), h = +(r.h != null ? r.h : r.height);
    if (!(isFinite(x) && isFinite(y) && w > 0 && h > 0)) return null;
    var X = Math.floor(x), Y = Math.floor(y);
    return { x: X, y: Y, w: Math.ceil(x + w) - X, h: Math.ceil(y + h) - Y, id: r.id, img: r.img || null };
  }

  function create(o) {
    o = o || {};
    var SKIN = root.GameDNA_Skin, SK = null;
    try { SK = SKIN && SKIN.resolve ? SKIN.resolve(o.skin) : null; } catch (e) { SK = null; }
    var COLS = Math.max(0, Math.floor(+o.cols || 0)), ROWS = Math.max(0, Math.floor(+o.rows || 0)), T = Math.max(1, Math.floor(+o.tile || 16)), N = COLS * ROWS;
    var P = {}, k0;
    for (k0 in DEF) P[k0] = DEF[k0];
    var warned = {};
    function dbg(e) { if (typeof o.debug === 'function') try { o.debug(e); } catch (er) { /* ignore */ } }
    function warn(key, msg) {
      if (warned[key]) return; warned[key] = 1;
      try { if (root.console) root.console.warn('[GameDNA_ThreatRange] ' + msg); } catch (e) { /* ignore */ }
      dbg({ event: 'warn', key: key, msg: msg });
    }
    function call(name, args, fb) {
      var f = o[name]; if (typeof f !== 'function') return fb;
      try { var r = f.apply(null, args || []); return r === undefined ? fb : r; } catch (e) { warn('cb-' + name, name + '() threw: ' + (e && e.message)); return fb; }
    }
    function setParams(p) {
      if (!p || typeof p !== 'object') return;
      for (var k in p) if (p[k] != null && k in DEF) P[k] = NUM[k] ? +p[k] : String(p[k]);
      if (!(P.fill >= 0)) P.fill = DEF.fill; P.fill = Math.min(1, P.fill);
      S.dirty = true;
    }
    if (!COLS || !ROWS) warn('size', 'create() needs cols and rows (tiles); nothing will be drawn');

    var S = { all: false, allSrc: null, focus: null, pinned: [], t: 0, frames: 0, updates: 0, draws: 0, sig: '', dirty: true,
      disp: new Uint8Array(N), alpha: new Float32Array(N), snap: true, zones: [], btn: null, btnPos: null, btnUIFrame: -9, last: null, ids: null, idn: 0 };
    setParams(o.params);
    if (P.start === 'on') S.all = true;
    try { S.ids = typeof WeakMap === 'function' ? new WeakMap() : null; } catch (e) { S.ids = null; }

    var key = function (x, y) { return y * COLS + x; };
    var inMap = function (x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; };
    function idOf(u) {
      if (u == null) return null;
      if (typeof u !== 'object') return String(u);
      var v = call('idOf', [u], null); if (v != null) return String(v);
      if (u.id != null) return String(u.id);
      if (S.ids) { var n = S.ids.get(u); if (n == null) { n = '#' + (++S.idn); S.ids.set(u, n); } return n; }
      return String(u.name);
    }
    function same(a, b) { return a === b || (!!a && !!b && idOf(a) === idOf(b)); }
    function posOf(u) {
      var p = call('posOf', [u], null) || call('tileOf', [u], null);
      if (!p && u) p = u.x != null ? { x: u.x, y: u.y } : u.col != null ? { x: u.col, y: u.row } : u.tx != null ? { x: u.tx, y: u.ty } : u.tile || u.pos || null;
      if (Array.isArray(p)) p = { x: p[0], y: p[1] };
      if (!p) return null;
      var x = Math.round(+p.x), y = Math.round(+p.y);
      return inMap(x, y) ? { x: x, y: y } : null;
    }
    function isAlive(u) {
      if (!u) return false;
      var v = call('alive', [u], null); if (v != null) return !!v;
      return !(typeof u.hp === 'number' && u.hp <= 0) && !u.dead && u.alive !== false && !u.removed;
    }
    function moveOf(u) {
      var m = call('moveOf', [u], null);
      if (m == null && u) m = typeof u.move === 'number' ? u.move : typeof u.mv === 'number' ? u.mv : typeof u.mov === 'number' ? u.mov : u.stats && typeof u.stats.move === 'number' ? u.stats.move : null;
      m = +(m == null ? P.move : m);
      return isFinite(m) && m >= 0 ? m : 0;
    }
    function rangeOf(u) {
      var r = call('rangeOf', [u], null);
      if (r == null && u) r = u.range != null ? u.range : u.rng != null ? u.rng : null;
      if (r == null) r = P.range;
      if (typeof r === 'number') r = [r, r];
      else if (Array.isArray(r)) r = [+r[0], +(r.length > 1 ? r[1] : r[0])];
      else if (r && typeof r === 'object') r = [+r.min, +r.max];
      else r = RANGES[String(r)] || [1, 1];
      var a = Math.max(0, Math.floor(r[0] || 0)), b = Math.max(a, Math.floor(r[1] || 0));
      return [a, Math.min(b, 30)];
    }
    function costAt(x, y, u) {
      var c = typeof o.cost === 'function' ? call('cost', [x, y, u], 1) : 1;
      c = +c; if (c !== c) c = 1;
      if (c >= 99) return Infinity;
      if (c <= 0) c = 1;
      return P.costs === 'off' ? 1 : c;
    }
    function occ(x, y) { return typeof o.occupant === 'function' ? call('occupant', [x, y], null) : null; }
    function isFoe(a, b) {
      if (typeof o.isEnemy === 'function') return !!call('isEnemy', [a, b], false);
      var sa = a.side != null ? a.side : a.team != null ? a.team : a.faction, sb = b.side != null ? b.side : b.team != null ? b.team : b.faction;
      return sa != null && sb != null && String(sa) !== String(sb);
    }

    // ---- reach of one unit: Dijkstra over cost(x, y, unit); foes block, friends can be passed; then the attack fringe ----
    function zoneOf(u) {
      var move = new Set(), threat = new Set(), p = posOf(u);
      if (!p || !N) return { move: move, threat: threat, stop: new Set() };
      var mv = moveOf(u), best = new Map(), s = key(p.x, p.y), open = [s];
      best.set(s, 0);
      while (open.length) {
        var bi = 0; for (var i = 1; i < open.length; i++) if (best.get(open[i]) < best.get(open[bi])) bi = i;
        var k = open.splice(bi, 1)[0], x = k % COLS, y = (k / COLS) | 0, base = best.get(k);
        for (var d = 0; d < 4; d++) {
          var nx = x + DIRS[d][0], ny = y + DIRS[d][1]; if (!inMap(nx, ny)) continue;
          var oc = occ(nx, ny); if (oc && !same(oc, u) && isFoe(u, oc)) continue;
          var c = costAt(nx, ny, u); if (c === Infinity) continue;
          var nd = base + c, n = key(nx, ny), cur = best.get(n);
          if (nd > mv || (cur != null && cur <= nd)) continue;
          best.set(n, nd); open.push(n);
        }
      }
      var stop = new Set(), rr = rangeOf(u);
      best.forEach(function (v, k) { move.add(k); threat.add(k); var oc = occ(k % COLS, (k / COLS) | 0); if (!oc || same(oc, u)) stop.add(k); });
      stop.forEach(function (k) {
        var x = k % COLS, y = (k / COLS) | 0;
        for (var dy = -rr[1]; dy <= rr[1]; dy++) for (var dx = -rr[1]; dx <= rr[1]; dx++) {
          var m = Math.abs(dx) + Math.abs(dy), nx = x + dx, ny = y + dy;
          if (m < rr[0] || m > rr[1] || !inMap(nx, ny)) continue;
          var n = key(nx, ny); if (threat.has(n)) continue;
          if (P.walls === 'hide' && costAt(nx, ny, u) === Infinity) continue;
          threat.add(n);
        }
      });
      return { move: move, threat: threat, stop: stop };
    }

    // ---- which units are shown ----
    function allUnits() {
      var src = S.allSrc, list = typeof src === 'function' ? (function () { try { return src(); } catch (e) { warn('cb-units', 'the units function given to showAll() threw: ' + (e && e.message)); return null; } })() : src;
      if (!list) list = call('enemies', [], null);
      if (!list) warn('nounits', 'showAll() / toggle() without units and no enemies() option: nothing to show');
      return Array.isArray(list) ? list : list && typeof list.length === 'number' ? Array.prototype.slice.call(list) : [];
    }
    function wanted() {
      var out = [], seen = {};
      var add = function (u) { if (!u || !isAlive(u)) return; var id = idOf(u); if (seen[id]) return; seen[id] = 1; out.push(u); };
      if (S.focus) add(S.focus); else if (S.all) allUnits().forEach(add);
      S.pinned.forEach(add);
      return out;
    }
    function occHash() {
      var h = 0;
      for (var k = 0; k < N; k++) { var u = occ(k % COLS, (k / COLS) | 0); if (u) { var id = idOf(u), s = 0; for (var i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) | 0; h = (h * 33 + k * 7 + s) | 0; } }
      return h;
    }
    function signature(list) {
      var parts = [S.focus ? 'f' : S.all ? 'a' : '-', P.walls, P.costs, P.range, P.move];
      list.forEach(function (u) { var p = posOf(u), r = rangeOf(u); parts.push(idOf(u) + '@' + (p ? p.x + ',' + p.y : '?') + ':' + moveOf(u) + ':' + r[0] + '-' + r[1]); });
      if (list.length) parts.push(occHash());
      return parts.join('|');
    }
    function refresh(force) {
      if (!N) return false;
      var list = wanted(), sig = signature(list);
      if (!force && !S.dirty && sig === S.sig) return false;
      S.sig = sig; S.dirty = false; S.disp = new Uint8Array(N); S.move = new Uint8Array(N); S.zones = [];
      list.forEach(function (u) { var z = zoneOf(u); S.zones.push({ unit: u, id: idOf(u), threat: z.threat, move: z.move }); z.threat.forEach(function (k) { S.disp[k] = 1; }); z.move.forEach(function (k) { S.move[k] = 1; }); });
      var n = 0; for (var k = 0; k < N; k++) n += S.disp[k];
      dbg({ event: 'recompute', units: list.map(idOf), tiles: n });
      if (S.snap) { S.snap = false; snapAlpha(); }
      return true;
    }
    function snapAlpha() { for (var k = 0; k < N; k++) S.alpha[k] = S.disp[k]; }

    // ---- view, camera, obstacles ----
    function viewOf(g) {
      var v = o.view ? (typeof o.view === 'function' ? call('view', [], null) : o.view) : null, cw = g && g.canvas ? g.canvas.width : 256, ch = g && g.canvas ? g.canvas.height : 224;
      if (!v || typeof v !== 'object') return { x: 0, y: 0, w: cw, h: ch };
      var x = +(v.ox != null ? v.ox : v.x) || 0, y = +(v.oy != null ? v.oy : v.y) || 0;
      return { x: x, y: y, w: +v.w > 0 ? +v.w : cw - x, h: +v.h > 0 ? +v.h : ch - y };
    }
    function camOf(cam) { return cam && typeof cam === 'object' ? { x: +cam.x || 0, y: +cam.y || 0 } : { x: 0, y: 0 }; }
    function rawObstacles() { var r = call('getObstacles', [], null); return r && typeof r.length === 'number' ? Array.prototype.slice.call(r) : []; }
    function rectList(name) {
      var r = call(name, [], null), out = [];
      if (r && typeof r.length === 'number') for (var i = 0; i < r.length; i++) { var n = normRect(r[i]); if (n) out.push(n); }
      return out;
    }
    function toSet(v) {
      if (!v) return null;
      var s = new Set();
      var add = function (e) { if (typeof e === 'number') s.add(e); else if (Array.isArray(e)) { if (inMap(e[0], e[1])) s.add(key(e[0], e[1])); } else if (e && typeof e === 'object' && inMap(+e.x, +e.y)) s.add(key(+e.x, +e.y)); };
      if (typeof v.forEach === 'function' && !Array.isArray(v)) { if (v instanceof Map) v.forEach(function (val, k) { add(k); }); else v.forEach(add); }
      else if (Array.isArray(v)) v.forEach(add);
      return s.size ? s : null;
    }

    // ---- skin access ----
    function kindName() { return P.tint === 'threat' ? 'threat' : 'attack'; }
    function ovlColors() {
      var pal = SK && SK.palette && SK.palette.overlay, k = kindName(), c = pal && pal[k];
      return c && c.fill ? c : FB.overlay[P.tint === 'threat' ? 'threat' : 'red'];
    }
    function lineColors() {
      var C = ovlColors(), pal = SK && SK.palette ? SK.palette : null;
      var hi = (pal && pal.text && pal.text.accent) || FB.accent, ink = (pal && pal.ink) || FB.ink;
      return { hi: hi, lo: mix(C.fill, ink, 0.55), mid: mix(C.fill, hi, 0.35) };
    }
    function overlayCell(g, r, t, opt) {
      // hue-preserving tint: desaturate the ground first (no green left to mix into brown), then the skin's overlay, then a red wash
      var op = g.globalCompositeOperation, pa = g.globalAlpha, gr = opt.grow || 0, C = ovlColors();
      // 'color' at full alpha replaces the ground's hue; a weaker fill = the zone colour mixed toward white (rose), never a thin tint
      g.globalCompositeOperation = 'color'; g.globalAlpha = pa; g.fillStyle = mix(C.fill, '#ffffff', Math.max(0, 1 - gr) * 0.6); g.fillRect(r.x, r.y, r.w, r.h);
      g.globalCompositeOperation = op; g.globalAlpha = pa;
      drawOverlay(g, r, t, opt);
      g.fillStyle = rgba(mix(C.fill, '#ffffff', 0.3), 0.10 + 0.08 * gr); g.fillRect(r.x, r.y, r.w, r.h);
    }
    function drawOverlay(g, r, t, opt) {
      if (SK && typeof SK.overlay === 'function') { try { SK.overlay(g, r, kindName(), t, opt); return; } catch (e) { warn('skin-overlay', 'skin overlay() threw; using the built-in look'); } }
      fbOverlay(g, r, ovlColors(), t, opt);
    }
    function measure(s) { if (SK && SK.measure) { try { return SK.measure(s, { font: 'ui' }); } catch (e) { /* fall through */ } } return fbW(s); }
    function fontH() { var f = SK && SK.fonts && SK.fonts.ui; return f ? (f.height || f.size || 7) : 7; }

    // ---- the on-screen button ----
    function btnSize() { return { w: 5 + 5 + 3 + measure(P.label) + 5, h: Math.max(13, fontH() + 6) }; }
    function placeButton(V, obs) {
      if (P.button === 'off' || o.button === false) return null;
      var sz = btnSize();
      if (o.button && typeof o.button === 'object') { var r = normRect({ x: o.button.x, y: o.button.y, w: o.button.w || sz.w, h: o.button.h || sz.h }); return r; }
      // candidates: the four corners first, then every 8 px along the top and bottom edges, then the left and right edges
      var x0 = V.x + 2, x1 = V.x + V.w - sz.w - 2, y0 = V.y + 2, y1 = V.y + V.h - sz.h - 2, C = [[x1, y0], [x0, y0], [x1, y1], [x0, y1]], i;
      for (i = x1 - 8; i > x0; i -= 8) { C.push([i, y0]); C.push([i, y1]); }
      for (i = y0 + 8; i < y1; i += 8) { C.push([x1, i]); C.push([x0, i]); }
      var score = function (c) { var r = { x: c[0], y: c[1], w: sz.w, h: sz.h }, s = 0; obs.forEach(function (b) { if (hit(r, b)) s += Math.max(1, Math.min(r.x + r.w, b.x + b.w) - Math.max(r.x, b.x)) * Math.max(1, Math.min(r.y + r.h, b.y + b.h) - Math.max(r.y, b.y)); }); return s; };
      var cur = S.btnPos && S.btnPos[0] >= x0 && S.btnPos[0] <= x1 && S.btnPos[1] >= y0 && S.btnPos[1] <= y1 ? S.btnPos : null;
      var pick = cur, best = cur ? score(cur) : Infinity;   // stay where it is while that spot is free
      if (best > 0) for (i = 0; i < C.length; i++) { var sc = score(C[i]); if (sc < best) { best = sc; pick = C[i]; if (!sc) break; } }
      S.btnPos = pick;
      return { x: pick[0], y: pick[1], w: sz.w, h: sz.h };
    }
    function drawButton(g, r) {
      if (!r) return;
      var on = S.all || !!S.focus || S.pinned.length > 0, full = S.all, C = ovlColors(), inner;
      if (SK && SK.frame) { try { inner = SK.frame(g, r, { role: 'plate', team: on ? 'b' : 'n', alert: on }); } catch (e) { inner = null; } }
      if (!inner) {
        g.fillStyle = FB.plate[0]; g.fillRect(r.x, r.y, r.w, r.h);
        g.fillStyle = on ? FB.plate[3] : FB.plate[1]; g.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        g.fillStyle = on ? FB.plate[4] : FB.plate[2]; g.fillRect(r.x + 1, r.y + 1, r.w - 2, 1);
      }
      var ly = r.y + Math.floor((r.h - 5) / 2), lx = r.x + 5, ink = (SK && SK.palette && SK.palette.ink) || FB.ink;
      g.fillStyle = ink; g.fillRect(lx - 1, ly - 1, 7, 7);
      g.fillStyle = full ? C.fill : on ? mix(C.fill, '#000000', 0.25) : mix(C.fill, '#202030', 0.75); g.fillRect(lx, ly, 5, 5);
      if (on) { g.fillStyle = full ? C.edge : mix(C.edge, C.fill, 0.5); g.fillRect(lx, ly, 2, 1); g.fillRect(lx, ly + 1, 1, 1); }
      if (on && !full) { g.fillStyle = ink; g.fillRect(lx + 3, ly + 2, 2, 3); }   // half lamp: single or pinned enemies only
      var tx = lx + 8, ty = r.y + Math.floor((r.h - fontH()) / 2), T2 = SK && SK.palette && SK.palette.text;
      if (SK && SK.text) { try { SK.text(g, P.label, tx, ty, { font: 'ui', color: on ? T2.main : (T2.dim || T2.main), color2: on ? (T2.main2 || T2.main) : (T2.dim2 || T2.dim || T2.main) }); return; } catch (e) { /* fall through */ } }
      fbText(g, P.label, tx, ty, on ? FB.text : FB.dim, on ? FB.text2 : '#626a88');
    }

    // ---- drawing ----
    function drawZone(g, camIn) {
      var V = viewOf(g), cam = camOf(camIn), t = S.t, ui = rectList('uiRects'), spr = rectList('getObstacles');
      var under = P.layer === 'under', redraw = under ? [] : rawObstacles().filter(function (b) { return b && b.img; }), clipBy = under ? ui : ui.concat(spr.filter(function (b) { return !b.img; }).map(function (b) { return b.w > 4 && b.h > 4 ? { x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 } : b; })), info = { tiles: 0, filled: 0, outlineOnly: false, clipped: 0, edges: 0, view: V, button: null };
      var player = toSet(call('playerRange', [], null)), both = !!player, fillK = both ? (P.both === 'dim' ? 0.35 : 0) : 1;
      info.outlineOnly = both && fillK === 0;
      var A = S.alpha, has = function (x, y) { return inMap(x, y) && A[key(x, y)] > 0; };
      var cx0 = Math.max(0, Math.floor(cam.x / T)), cy0 = Math.max(0, Math.floor(cam.y / T)), cx1 = Math.min(COLS - 1, Math.floor((cam.x + V.w) / T)), cy1 = Math.min(ROWS - 1, Math.floor((cam.y + V.h) / T));
      g.save();
      g.beginPath(); g.rect(V.x, V.y, V.w, V.h); g.clip();
      // fill
      var grow0 = P.fill * fillK, opt = { grow: 0, pattern: P.pattern, tile: { x: 0, y: 0 }, seams: {} };
      for (var ty = cy0; ty <= cy1; ty++) for (var tx = cx0; tx <= cx1; tx++) {
        var k = key(tx, ty), a = A[k]; if (!(a > 0)) continue;
        info.tiles++;
        if (!(grow0 > 0)) continue;
        if (player && player.has(k)) continue;   // never tint the player's own range
        var X = V.x + tx * T - Math.round(cam.x), Y = V.y + ty * T - Math.round(cam.y), cell = { x: X, y: Y, w: T, h: T };
        var pcs = clipBy.length ? cut(cell, clipBy) : [cell]; if (pcs.length !== 1 || pcs[0] !== cell) info.clipped++;
        opt.grow = grow0 * (S.focus && S.move && !S.move[k] ? 0.5 : 1); opt.tile.x = tx; opt.tile.y = ty;
        // fading tiles: a 4x4 ordered dither of full-strength pixels (pixel-art fade; a translucent tint would mix into brown)
        var lv = a >= 1 ? 16 : Math.round(a * 16);
        if (lv <= 0) continue;
        if (lv < 16) {
          g.save(); g.beginPath();
          var wx0 = tx * T, wy0 = ty * T;
          for (var yy = 0; yy < T; yy++) for (var xx = 0; xx < T; xx++) if (BAYER[((wy0 + yy) & 3) * 4 + ((wx0 + xx) & 3)] < lv) g.rect(X + xx, Y + yy, 1, 1);
          g.clip();
        }
        for (var i = 0; i < pcs.length; i++) {
          var pc = pcs[i];
          opt.seams = { right: pc.x + pc.w === X + T && has(tx + 1, ty), bottom: pc.y + pc.h === Y + T && has(tx, ty + 1) };
          overlayCell(g, pc, t, opt); info.filled++;
        }
        if (lv < 16) g.restore();
      }
      // outline: outer 1 px marching dashes (light / dark), inner 1 px solid
      if (P.outline !== 'off') {
        var L = lineColors(), per = Math.max(2, Math.round(P.dash)) * 2, ph = P.outline === 'march' ? Math.floor(t * P.march) : 0, pa = g.globalAlpha;
        var run = function (x, y, w, h, color, alpha) {
          var r = { x: x, y: y, w: w, h: h }, pcs = clipBy.length ? cut(r, clipBy) : [r];
          g.globalAlpha = pa * alpha; g.fillStyle = color;
          for (var i = 0; i < pcs.length; i++) g.fillRect(pcs[i].x, pcs[i].y, pcs[i].w, pcs[i].h);
        };
        var dashes = function (X, Y, len, horiz, sgn, world0, alpha) {   // world0 = world px of the first pixel; sgn = march direction
          var s0 = 0, c0 = null;
          for (var i = 0; i <= len; i++) {
            var c = i < len ? ((((sgn * (world0 + i) - ph) % per) + per) % per < per / 2 ? L.hi : L.lo) : null;
            if (c !== c0) { if (c0 !== null) run(horiz ? X + s0 : X, horiz ? Y : Y + s0, horiz ? i - s0 : 1, horiz ? 1 : i - s0, c0, alpha); s0 = i; c0 = c; }
          }
        };
        for (ty = cy0; ty <= cy1; ty++) for (tx = cx0; tx <= cx1; tx++) {
          k = key(tx, ty); a = A[k]; if (!(a > 0)) continue;
          var Nn = !has(tx, ty - 1), Ss = !has(tx, ty + 1), Ww = !has(tx - 1, ty), Ee = !has(tx + 1, ty);
          if (!(Nn || Ss || Ww || Ee)) continue;
          X = V.x + tx * T - Math.round(cam.x); Y = V.y + ty * T - Math.round(cam.y);
          var wx = tx * T, wy = ty * T, al = Math.min(1, a);
          info.edges += (Nn ? 1 : 0) + (Ss ? 1 : 0) + (Ww ? 1 : 0) + (Ee ? 1 : 0);
          if (Nn) dashes(X, Y, T, true, 1, wx, al);
          if (Ee) dashes(X + T - 1, Y, T, false, 1, wy, al);
          if (Ss) dashes(X, Y + T - 1, T, true, -1, wx, al);
          if (Ww) dashes(X, Y, T, false, -1, wy, al);
          var l = Ww ? 1 : 0, rr = Ee ? 1 : 0, tp = Nn ? 1 : 0, bt = Ss ? 1 : 0;
          if (Nn) run(X + l, Y + 1, T - l - rr, 1, L.mid, al * 0.9);
          if (Ss) run(X + l, Y + T - 2, T - l - rr, 1, L.mid, al * 0.9);
          if (Ww) run(X + 1, Y + tp, 1, T - tp - bt, L.mid, al * 0.9);
          if (Ee) run(X + T - 2, Y + tp, 1, T - tp - bt, L.mid, al * 0.9);
        }
        g.globalAlpha = pa;
      }
      // layer 'over': obstacles that carry their sprite image ({img, x, y, flip}) are drawn again on top, so only the sprite's own pixels stay untinted
      for (var ri = 0; ri < redraw.length; ri++) {
        var o2 = redraw[ri];
        try { if (o2.flip) { g.save(); g.translate(Math.round(o2.x) + (o2.img.width || 0), Math.round(o2.y)); g.scale(-1, 1); g.drawImage(o2.img, 0, 0); g.restore(); } else g.drawImage(o2.img, Math.round(o2.x), Math.round(o2.y)); } catch (e) { warn('img', 'an obstacle img could not be drawn'); }
      }
      g.restore();
      return { info: info, obs: ui.concat(spr), V: V };
    }

    var api = {
      // ---- what is shown ----
      showAll: function (units) { if (units != null) S.allSrc = units; S.all = true; S.focus = null; S.dirty = true; dbg({ event: 'toggle', all: true }); return api; },
      hideAll: function () { S.all = false; S.dirty = true; dbg({ event: 'toggle', all: false }); return api; },
      toggle: function (units) { if (S.all) api.hideAll(); else api.showAll(units); return S.all; },
      showUnit: function (u) { var f = u && isAlive(u) ? u : null; if (!same(f, S.focus)) { S.focus = f; S.dirty = true; } return api; },
      toggleUnit: function (u) {
        if (!u) return false; var id = idOf(u), i = -1;
        S.pinned.forEach(function (p, j) { if (idOf(p) === id) i = j; });
        if (i >= 0) S.pinned.splice(i, 1); else S.pinned.push(u);
        S.dirty = true; dbg({ event: 'pin', id: id, on: i < 0 }); return i < 0;
      },
      clearPins: function () { S.pinned = []; S.dirty = true; return api; },
      clear: function () { S.all = P.start === 'on'; S.focus = null; S.pinned = []; S.dirty = true; S.snap = true; S.disp = new Uint8Array(N); return api; },
      invalidate: function () { S.dirty = true; return api; },
      // ---- clock and drawing ----
      update: function (dt) {
        try {
          dt = dt == null ? 1000 / 60 : +dt;
          if (!(dt >= 0)) dt = 0;
          if (dt > 0 && dt < 0.5) dt *= 1000;   // seconds given -> ms
          dt = Math.min(dt, 250);
          S.t += dt / 1000; S.updates++;
          if (dt > 0 || S.dirty) {
            S.frames++;
            if (S.dirty || N <= 1024 || S.frames % 4 === 0) refresh(false);
          }
          var st = P.fade > 0 ? dt / P.fade : 1;
          for (var k = 0; k < N; k++) { var tg = S.disp[k], a = S.alpha[k]; if (a !== tg) S.alpha[k] = tg > a ? Math.min(tg, a + st) : Math.max(tg, a - st); }
        } catch (e) { warn('update', 'update() failed: ' + (e && e.message)); }
      },
      draw: function (g, cam) {
        if (!g || typeof g.fillRect !== 'function') { warn('ctx', 'draw() needs a 2D context'); return null; }
        try {
          S.draws++;
          if (!S.updates) { refresh(false); snapAlpha(); if (S.draws > 2) warn('noupdate', 'draw() is called but update() never is: no fade or marching'); }
          var r = drawZone(g, cam), info = r.info;
          // the button: with layer 'under' units and windows come after the zone, so only drawButton() (after them) draws it;
          // with layer 'over' draw() draws it too unless drawButton() was used last frame
          if (P.layer !== 'under' && S.draws - S.btnUIFrame > 1) { info.button = S.btn = placeButton(r.V, r.obs); drawButton(g, S.btn); }
          else info.button = S.btn;
          if (P.layer === 'under' && S.btnUIFrame < 0 && S.draws > 120 && P.button !== 'off' && o.button !== false) warn('nobutton', 'layer \'under\': call drawButton(ctx) after units and HUD, or the THREAT button is never drawn');
          S.last = info; return info;
        } catch (e) { warn('draw', 'draw() failed: ' + (e && e.message)); return null; }
      },
      // the button only, for hosts that draw the zone under their units: call it after units / HUD
      // avoid = optional extra rects [{x, y, w, h}] (canvas px) to keep clear this frame, e.g. windows the game just drew
      drawButton: function (g, avoid) {
        if (!g || typeof g.fillRect !== 'function') return null;
        try {
          S.btnUIFrame = S.draws + 1;   // tells draw() not to draw the button itself
          var V = viewOf(g), obs = rectList('uiRects').concat(rectList('getObstacles'));
          if (avoid && typeof avoid.length === 'number') for (var i = 0; i < avoid.length; i++) { var n = normRect(avoid[i]); if (n) obs.push(n); }
          S.btn = placeButton(V, obs); drawButton(g, S.btn); return S.btn;
        } catch (e) { warn('drawButton', 'drawButton() failed: ' + (e && e.message)); return null; }
      },
      // ---- input: returns true only when the module used it ----
      key: function (code, down, isRepeat) {
        try {
          if (code && typeof code === 'object') { isRepeat = code.repeat; down = down == null ? code.type !== 'keyup' : down; code = code.code || code.key; }
          var want = String(P.key), c = String(code || '');
          var match = c === want || (want.indexOf('Key') === 0 && c.length === 1 && c.toUpperCase() === want.slice(3));
          if (!match || call('enabled', [], true) === false) return false;
          if (down && !isRepeat) api.toggle();
          return true;
        } catch (e) { return false; }
      },
      click: function (x, y) {
        try {
          var b = S.btn; if (!b || call('enabled', [], true) === false) return false;
          if (x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h) { api.toggle(); return true; }
          return false;
        } catch (e) { return false; }
      },
      // ---- read-only queries ----
      zoneOf: function (u) { var z = zoneOf(u); return { move: z.move, threat: z.threat }; },
      tiles: function () { var out = []; for (var k = 0; k < N; k++) if (S.disp[k]) out.push({ x: k % COLS, y: (k / COLS) | 0 }); return out; },
      has: function (x, y) { return inMap(x, y) && !!S.disp[key(x, y)]; },
      threatAt: function (x, y) { if (!inMap(x, y)) return []; var k = key(x, y); return S.zones.filter(function (z) { return z.threat.has(k); }).map(function (z) { return z.id; }); },
      buttonRect: function () { return S.btn ? { x: S.btn.x, y: S.btn.y, w: S.btn.w, h: S.btn.h } : null; },
      lastDrawn: function () { return S.last; },
      state: function () { var n = 0; for (var k = 0; k < N; k++) n += S.disp[k]; return { all: S.all, focus: S.focus ? idOf(S.focus) : null, pinned: S.pinned.map(idOf), tiles: n, units: S.zones.map(function (z) { return z.id; }) }; },
      // probe / test aid: recompute from scratch and compare with what is shown (true = shown set is current)
      verify: function () {
        var keep = { disp: S.disp, move: S.move, sig: S.sig, zones: S.zones, dirty: S.dirty }, ok = true;
        refresh(true); for (var k = 0; k < N; k++) if (!!keep.disp[k] !== !!S.disp[k]) { ok = false; break; }
        S.disp = keep.disp; S.move = keep.move; S.sig = keep.sig; S.zones = keep.zones; S.dirty = keep.dirty; return ok;
      },
      setParams: setParams,
      tileKey: key,
      get params() { var c = {}; for (var k in P) c[k] = P[k]; return c; },
      get on() { return S.all || !!S.focus || S.pinned.length > 0; },
      get all() { return S.all; },
      skin: SK ? SK.id : 'built-in'
    };
    return api;   // nothing is computed until the first update() / draw(): callbacks may use state the game creates later
  }

  root.GameDNA_ThreatRange = { create: create, version: '1.0.0', defaults: DEF };
})(typeof window !== 'undefined' ? window : this);
