/* GameDNA C-12 World-space HUD (world-hud.js) v1.2.1 - plain script, no dependencies, no import/export, one global: GameDNA_WorldHud
 *
 * HUD pieces that live in the game world and follow the camera: a ring under each unit's feet with an HP arc (a pale "loss"
 * segment drains after a hit), floating name plates above heads that never overlap each other, the game's own HUD rects or
 * the view edge (they step up / sideways with a leader line when crowded), objective markers above the current goal with
 * the distance in metres, and arrows on the screen edge that point at off-screen targets (bearing exact at every angle; they
 * slide inward past HUD boxes along the same bearing). It reads the game; it never changes it and never reads input.
 * Crisp whole pixels with a built-in bitmap font on native pixel canvases, smooth vector drawing on HD canvases.
 *
 *   var hud = GameDNA_WorldHud.create({ view: {x, y, w, h}, camera: () => ({x, y, w, h}),
 *     units: () => [{id, x, y, r, h, hp, maxHp, team, name, level}], targets: () => [{id, kind: 'goal', x, y, label}],
 *     safeRects: () => [hudRect], params: {plates: 'auto'} });
 *   hud.update(stepMs)       // every fixed step (HP drain, fades, pulses)
 *   hud.drawGround(ctx)      // after the ground, before the sprites, outside any camera transform: rings + goal pings
 *   hud.draw(ctx)            // after the world (and the HUD): plates, markers, edge arrows
 *
 * Source is ASCII only (pages may load it without a charset).
 */
(function (root) {
  'use strict';
  var VERSION = '1.2.1';

  /* ---------- 5-row bitmap font (caps rows 0-4, descenders row 5), '#' = ink ---------- */
  var FONT_SRC = {
    '!': '# # # . #', "'": '# #', '(': '.# #. #. #. .#', ')': '#. .# .# .# #.', '+': '... .#. ### .#.', ',': '.. .. .. .. .# #.',
    '-': '... ... ###', '.': '. . . . #', '/': '..# ..# .#. #.. #..', ':': '. # . # .', '?': '##. ..# .#. ... .#.', '%': '#.# ..# .#. #.. #.#',
    '0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '##. ..# .#. #.. ###', '3': '##. ..# .#. ..# ##.',
    '4': '#.# #.# ### ..# ..#', '5': '### #.. ##. ..# ##.', '6': '.## #.. ### #.# ###', '7': '### ..# .#. .#. .#.',
    '8': '### #.# ### #.# ###', '9': '### #.# ### ..# ##.',
    'A': '.##. #..# #### #..# #..#', 'B': '###. #..# ###. #..# ###.', 'C': '.### #... #... #... .###', 'D': '###. #..# #..# #..# ###.',
    'E': '### #.. ##. #.. ###', 'F': '### #.. ##. #.. #..', 'G': '.### #... #.## #..# .###', 'H': '#..# #..# #### #..# #..#',
    'I': '### .#. .#. .#. ###', 'J': '..## ...# ...# #..# .##.', 'K': '#..# #.#. ##.. #.#. #..#', 'L': '#.. #.. #.. #.. ###',
    'M': '#...# ##.## #.#.# #...# #...#', 'N': '#..# ##.# #.## #..# #..#', 'O': '.##. #..# #..# #..# .##.', 'P': '###. #..# ###. #... #...',
    'Q': '.##. #..# #..# #.#. .#.#', 'R': '###. #..# ###. #.#. #..#', 'S': '.### #... .##. ...# ###.', 'T': '### .#. .#. .#. .#.',
    'U': '#..# #..# #..# #..# .##.', 'V': '#.# #.# #.# .#. .#.', 'W': '#...# #...# #.#.# #.#.# .#.#.', 'X': '#.# #.# .#. #.# #.#',
    'Y': '#.# #.# .#. .#. .#.', 'Z': '#### ..#. .#.. #... ####',
    'a': '... ##. .## #.# .##', 'b': '#.. ##. #.# #.# ##.', 'c': '... .## #.. #.. .##', 'd': '..# .## #.# #.# .##',
    'e': '... .#. ### #.. .##', 'f': '..# .#. ### .#. .#.', 'g': '... .## #.# .## ..# ##.', 'h': '#.. ##. #.# #.# #.#',
    'i': '# . # # #', 'j': '.# .. .# .# .# #.', 'k': '#.. #.# ##. #.# #.#', 'l': '#. #. #. #. .#',
    'm': '..... ##.#. #.#.# #.#.# #.#.#', 'n': '... ##. #.# #.# #.#', 'o': '... .#. #.# #.# .#.', 'p': '... ##. #.# #.# ##. #..',
    'q': '... .## #.# #.# .## ..#', 'r': '... #.# ##. #.. #..', 's': '... .## #.. ..# ##.', 't': '.#. ### .#. .#. ..#',
    'u': '... #.# #.# #.# .##', 'v': '... #.# #.# #.# .#.', 'w': '..... #...# #.#.# #.#.# .#.#.', 'x': '... #.# .#. .#. #.#',
    'y': '... #.# #.# .## ..# ##.', 'z': '... ### ..# #.. ###'
  };
  var FONT = {};
  (function () { for (var ch in FONT_SRC) { var rows = FONT_SRC[ch].split(' '), w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length); FONT[ch] = { rows: rows, w: w }; } })();
  function textW(s) { var w = 0; s = String(s); for (var i = 0; i < s.length; i++) { var c = s.charAt(i); if (c === ' ') { w += 3; continue; } var gl = FONT[c] || FONT[c.toUpperCase()] || FONT['?']; w += gl.w + 1; } return Math.max(0, w - 1); }

  /* ---------- 5x5 icons for badges ('#' ink) ---------- */
  var ICON = {
    goal: ['..#..', '.###.', '#####', '.###.', '..#..'],
    enemy: ['.###.', '#.#.#', '#####', '.###.', '.#.#.'],
    npc: ['..#..', '..#..', '..#..', '.....', '..#..'],
    item: ['.###.', '##.##', '#####', '.###.', '..#..'],
    ally: ['.#.#.', '#####', '#####', '.###.', '..#..'],
    poi: ['###..', '####.', '###..', '#....', '#....']
  };

  var PAL = {   // built-in pixel16 palette (used when no skin script is loaded)
    ink: '#140c1c', panel: 'rgba(22,15,32,0.86)', panelHi: '#46365c', text: '#f4ecff', dim: '#b9a8d0',
    hero: '#5fd3ff', ally: '#7ce870', enemy: '#ff5b4f', npc: '#c8b4ff', boss: '#ff8a3a', neutral: '#d8d0e8',
    loss: '#fff1c0', missing: 'rgba(16,10,24,0.72)', low: '#ff3048', shadow: 'rgba(12,6,20,0.30)',
    goal: '#ffcc33', item: '#6fe8ff', poi: '#e9e0f4', nameEnemy: '#ffd8d0', nameAlly: '#e2fbe0', nameHero: '#dff4ff', nameNpc: '#fff3c8'
  };
  var DEFAULTS = { rings: 'on', squash: 0.5, ringSize: 1, arc: 'hp', plates: 'auto', plateHp: 'on', level: 'on', leader: 'on', maxPlates: 16,
    arrows: 'on', markers: 'on', distance: 'on', unit: 16, unitLabel: 'm', margin: 4, scale: 0, render: 'auto', lowHp: 0.3, holdMs: 450,
    drainPerSec: 0.55, fadeMs: 160, ping: 'on', avoid: 'auto' };
  var RANGES = { squash: [0.2, 1], ringSize: [0.5, 2.5], maxPlates: [0, 64], unit: [1, 1000], margin: [0, 40], scale: [0, 8], lowHp: [0, 1],
    holdMs: [0, 3000], drainPerSec: [0.05, 10], fadeMs: [0, 2000] };
  var TEAM_ORDER = { hero: 1, player: 1, ally: 2, enemy: 3, npc: 4 };
  var DIRTRY = [[0, 0], [0, -1], [1, 0], [-1, 0], [1, -1], [-1, -1], [0, -2], [1, -2], [-1, -2], [0, 'below'], [2, 0], [-2, 0], [2, -1], [-2, -1], [0, -3]];

  function num(v, d) { if (v == null || v === '') return d; v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hit(a, b, gap) { gap = gap || 0; return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap; }
  function inside(r, v) { return r.x >= v.x - 0.01 && r.y >= v.y - 0.01 && r.x + r.w <= v.x + v.w + 0.01 && r.y + r.h <= v.y + v.h + 0.01; }
  function angDiff(a, b) { var d = ((a - b) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI; return Math.abs(d); }
  function fmtDist(m, lab) { if (m >= 1000) return (Math.round(m / 100) / 10) + 'k' + lab; return Math.round(m) + lab; }

  function create(options) {
    var o = options || {}, P = {}, SK = null, C = {}, warned = {};
    var ST = { updates: 0, draws: 0, groundDraws: 0, ringsInDraw: 0, errors: 0, crowded: 0, noRoom: 0, offscreen: 0, plates: 0, arrows: 0, markers: 0 };
    var recs = {}, lastGround = null, clock = 0, drawSeq = 0, groundTok = -1, lastRec = null, lastView = null, focusId = null, textCache = {}, textCacheN = 0;
    try { if (o.skin != null && o.skin !== false && root.GameDNA_Skin) SK = root.GameDNA_Skin.resolve(o.skin); } catch (e) { SK = null; }

    function warn(k, msg) { if (warned[k]) return; warned[k] = 1; if (root.console) console.warn('[GameDNA_WorldHud] ' + msg); }
    function call(fn, args, d) { if (typeof fn !== 'function') return d; try { var v = fn.apply(null, args || []); return v === undefined ? d : v; } catch (e) { ST.errors++; warn('cb', 'a game callback threw: ' + e.message); return d; } }
    function val(v, d) { return typeof v === 'function' ? call(v, [], d) : v == null ? d : v; }

    function setParams(p) {
      p = p || {};
      for (var k in DEFAULTS) {
        var v = p[k] != null && p[k] !== '' ? p[k] : P[k] != null ? P[k] : DEFAULTS[k];
        if (typeof DEFAULTS[k] === 'number') { v = num(v, DEFAULTS[k]); if (RANGES[k]) v = clamp(v, RANGES[k][0], RANGES[k][1]); } else v = String(v);
        P[k] = v;
      }
      C = {}; for (var c in PAL) C[c] = PAL[c];
      if (SK) { var tk = function (path, d) { try { var v = SK.token(path); return typeof v === 'string' && v !== path ? v : d; } catch (e) { return d; } };
        C.ink = tk('ink', C.ink); C.panel = tk('ui.fill', C.panel); C.panelHi = tk('ui.highlight', C.panelHi); C.text = tk('text.main', C.text);
        C.hero = tk('team.a', C.hero); C.enemy = tk('team.b', C.enemy); C.npc = tk('team.n', C.npc); C.goal = tk('text.accent', C.goal); }
      textCache = {}; textCacheN = 0;
    }
    setParams(o.params);

    /* ---------- reading the game ---------- */
    function viewOf(ctx) {
      var v = val(o.view, null);
      if (v && v.w > 0 && v.h > 0) return { x: +v.x || 0, y: +v.y || 0, w: +v.w, h: +v.h };
      if (!ctx) return lastView;
      var s = 1; try { var m = ctx.getTransform(); s = Math.hypot(m.a, m.b) || 1; } catch (e) { }
      return { x: 0, y: 0, w: ctx.canvas.width / s, h: ctx.canvas.height / s };
    }
    function camOf(view) {
      var c = val(o.camera, null);
      if (c && isFinite(c.x) && isFinite(c.y)) return { x: +c.x, y: +c.y, w: c.w > 0 ? +c.w : view.w, h: c.h > 0 ? +c.h : view.h };
      return { x: 0, y: 0, w: view.w, h: view.h };
    }
    function mapper(view) {
      var cam = camOf(view), sx = view.w / cam.w, sy = view.h / cam.h;
      if (typeof o.toScreen === 'function') {
        var z = num(val(o.zoom, 1), 1);
        return { cam: cam, sx: z, sy: z, f: function (x, y) { var q = call(o.toScreen, [x, y], null); return q && isFinite(q.x) && isFinite(q.y) ? { x: +q.x, y: +q.y } : null; } };
      }
      return { cam: cam, sx: sx, sy: sy, f: function (x, y) { return { x: view.x + (x - cam.x) * sx, y: view.y + (y - cam.y) * sy }; } };
    }
    function unitsNow() {
      var a = call(o.units, [], null) || [], out = [], seen = {};
      for (var i = 0; i < a.length; i++) {
        var q = a[i]; if (!q || !isFinite(q.x) || !isFinite(q.y) || q.alive === false || q.hidden) continue;
        var id = q.id != null ? String(q.id) : 'u' + i; if (seen[id]) { warn('dup', 'two units share the id ' + id); continue; } seen[id] = 1;
        var team = String(q.team || 'neutral'); if (team === 'player') team = 'hero';
        var r = q.r > 0 ? +q.r : 8, h = q.h > 0 ? +q.h : r * 2.4;
        var hasHp = isFinite(q.hp) && q.maxHp > 0;
        out.push({ id: id, x: +q.x, y: +q.y, r: r, h: h, team: team, name: q.name != null ? String(q.name) : '', level: q.level, boss: !!q.boss,
          hp: hasHp ? clamp(+q.hp / +q.maxHp, 0, 1) : null, plate: q.plate, ring: q.ring !== false, track: !!q.track, color: q.color, focus: !!q.focus || id === focusId, ord: i });
      }
      return out;
    }
    function targetsNow() {
      var a = call(o.targets, [], null) || [], out = [];
      for (var i = 0; i < a.length; i++) {
        var q = a[i]; if (!q || !isFinite(q.x) || !isFinite(q.y)) continue;
        var kind = String(q.kind || 'goal');
        out.push({ id: q.id != null ? String(q.id) : 't' + i, kind: kind, x: +q.x, y: +q.y, h: q.h > 0 ? +q.h : 0, label: q.label != null ? String(q.label) : '',
          track: q.track != null ? !!q.track : kind === 'goal', marker: q.marker != null ? !!q.marker : kind === 'goal', color: q.color });
      }
      return out;
    }
    function playerPos(units) {
      var p = call(o.player, [], null);
      if (p && isFinite(p.x) && isFinite(p.y)) return { x: +p.x, y: +p.y };
      for (var i = 0; i < units.length; i++) if (units[i].team === 'hero') return { x: units[i].x, y: units[i].y };
      return null;
    }
    function safeList() {
      var s = call(o.safeRects, [], null) || val(o.uiRects, null) || [];
      return s.filter(function (q) { return q && isFinite(q.x) && isFinite(q.y) && q.w > 0 && q.h > 0; }).map(function (q) { return { x: +q.x, y: +q.y, w: +q.w, h: +q.h }; });
    }
    // which units get a plate. 'auto' (default): the party always; enemies only when focused, a boss, or hit in the last
    // RECENT_MS; named npcs; on a phone-size UI (u >= 2) only the party and the focused unit (the HP rings carry the rest)
    function plateWanted(u, uScale) {
      if (u.plate === false || P.plates === 'off') return false;
      if (u.plate === true) return true;
      if (P.plates === 'auto') {
        if (u.team === 'hero' || u.team === 'ally' || u.focus) return true;
        if (uScale >= 2) return false;
        if (u.team === 'enemy') { var Rr = recs[u.id]; return u.boss || !!(Rr && clock - Rr.lastHit < RECENT_MS); }
        return !!u.name;
      }
      if (u.focus || u.boss) return true;
      if (!u.name && u.hp == null) return false;
      if (P.plates === 'all') return !!u.name || u.team === 'enemy';
      if (P.plates === 'enemies') return u.team === 'enemy';
      if (P.plates === 'damaged') return u.hp != null && u.hp < 0.999;
      if (P.plates === 'named') return !!u.name;
      return false;
    }
    function teamCol(u) { if (u.color) return u.color; if (u.boss) return C.boss; return C[u.team] || C.neutral; }

    /* ---------- update: HP drain model, fades, clock ---------- */
    function update(dt) {
      try {
        dt = num(dt, 1000 / 60); if (dt < 0) dt = 0; if (dt > 250) dt = 250;
        clock += dt; ST.updates++;
        var us = unitsNow(), alive = {};
        for (var i = 0; i < us.length; i++) {
          var u = us[i], R = recs[u.id]; alive[u.id] = 1;
          if (!R) R = recs[u.id] = { f: u.hp != null ? u.hp : 1, lag: u.hp != null ? u.hp : 1, hold: 0, a: 0, lastHit: -1e9, born: clock };
          if (u.hp != null) {
            if (u.hp < R.f - 1e-6) { R.lag = Math.max(R.lag, R.f); R.hold = P.holdMs; R.lastHit = clock; }
            else if (u.hp > R.f + 1e-6) { R.lag = Math.min(R.lag, u.hp); }
            R.f = u.hp;
            if (R.hold > 0) R.hold -= dt; else R.lag = Math.max(R.f, R.lag - P.drainPerSec * dt / 1000);
            if (R.lag < R.f) R.lag = R.f;
          }
          var want = plateWanted(u, 1) ? 1 : 0;
          R.a = P.fadeMs > 0 ? clamp(R.a + (want ? 1 : -1) * dt / P.fadeMs, 0, 1) : want;
        }
        for (var id in recs) if (!alive[id]) delete recs[id];
        // the layout state (slots with hysteresis, eased offsets), solved here so a frozen still equals play
        var F = viewOf(null) ? frame(null) : null;
        if (F) { var taken = [], tg = targetsNow(); platesUpdate(F, taken, dt); arrowsLayout(F, tg, taken); markersLayout(F, tg, taken); }   // plates first: arrows and markers go around them
      } catch (e) { ST.errors++; warn('update', 'update() failed: ' + e.message); }
    }

    /* ---------- frame: everything the draw passes need ---------- */
    function crispOf(view) { return P.render === 'crisp' || (P.render !== 'smooth' && (view.w <= 512 || !!(SK && SK.pixel))); }
    var mctx = null;   // a measuring context for update() (text widths only)
    function measureCtx() { if (!mctx) { try { mctx = root.document.createElement('canvas').getContext('2d'); } catch (e) { mctx = null; } } return mctx; }
    function frame(ctx) {
      var view = viewOf(ctx); if (!view) return null; if (ctx) lastView = view; else ctx = measureCtx(); if (!ctx) return null;
      var crisp = crispOf(view), u = P.scale > 0 ? P.scale : crisp ? Math.max(1, Math.floor(Math.min(view.w / 300, view.h / 170))) : Math.max(1, view.h / 340);
      if (crisp) u = Math.max(1, Math.round(u));
      var M = mapper(view), us = unitsNow();
      for (var i = 0; i < us.length; i++) { var q = us[i], s = M.f(q.x, q.y); q.s = s; if (s) { q.rx = Math.max(4 * u, q.r * M.sx * 1.2 * P.ringSize); q.ry = Math.max(2 * u, q.rx * P.squash); q.headY = s.y - q.h * M.sy; } }
      return { ctx: ctx, view: view, crisp: crisp, u: u, M: M, units: us, safe: safeList(), player: playerPos(us) };
    }

    /* ---------- pixel helpers (crisp) ---------- */
    // pixel batch: keeps the drawing order (later pixels cover earlier ones), switches fillStyle only when the colour changes
    function batch() { var A = []; return { px: function (col, x, y, w, h) { A.push(col, x, y, w || 1, h || 1); }, flush: function (g) { var cur = null; for (var i = 0; i < A.length; i += 5) { if (A[i] !== cur) { cur = A[i]; g.fillStyle = cur; } g.fillRect(A[i + 1], A[i + 2], A[i + 3], A[i + 4]); } A = []; } }; }
    // crisp ellipse ring: pixels whose centre lies within th/2 of the ellipse (signed distance from the implicit function)
    function ringPixels(cx, cy, rx, ry, th, colorAt, outer) {
      outer = outer || 0;
      var x0 = Math.floor(cx - rx - th - outer), x1 = Math.ceil(cx + rx + th + outer), y0 = Math.floor(cy - ry - th - outer), y1 = Math.ceil(cy + ry + th + outer), out = [];
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
        var dx = x + 0.5 - cx, dy = y + 0.5 - cy, e = Math.sqrt(dx * dx / (rx * rx) + dy * dy / (ry * ry)); if (e < 1e-6) continue;
        var gx = dx / (rx * rx * e), gy = dy / (ry * ry * e), d = (e - 1) / Math.sqrt(gx * gx + gy * gy);
        if (d >= -th && d < outer) { var col = colorAt(Math.atan2(dy / ry, dx / rx), d); if (col) out.push(col, x, y); }
      }
      return out;
    }
    function discPixels(cx, cy, rad, colorAt) {
      var out = [], x0 = Math.floor(cx - rad - 1), x1 = Math.ceil(cx + rad + 1), y0 = Math.floor(cy - rad - 1), y1 = Math.ceil(cy + rad + 1);
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) { var d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); var col = colorAt(d); if (col) out.push(col, x, y); }
      return out;
    }
    function polyIn(pts, x, y) { var c = false; for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) { var a = pts[i], b = pts[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
    // crisp polygon with a 1 px ink outline (4-neighbour), any angle
    function polyPixels(pts, fill, ink) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, i;
      for (i = 0; i < pts.length; i++) { x0 = Math.min(x0, pts[i][0]); y0 = Math.min(y0, pts[i][1]); x1 = Math.max(x1, pts[i][0]); y1 = Math.max(y1, pts[i][1]); }
      x0 = Math.floor(x0) - 1; y0 = Math.floor(y0) - 1; x1 = Math.ceil(x1) + 1; y1 = Math.ceil(y1) + 1;
      var W = x1 - x0 + 1, H = y1 - y0 + 1, m = new Uint8Array(W * H), out = [], x, y;
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (polyIn(pts, x0 + x + 0.5, y0 + y + 0.5)) m[y * W + x] = 1;
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        if (m[y * W + x]) out.push(fill, x0 + x, y0 + y);
        else if (ink && ((x > 0 && m[y * W + x - 1]) || (x < W - 1 && m[y * W + x + 1]) || (y > 0 && m[(y - 1) * W + x]) || (y < H - 1 && m[(y + 1) * W + x]))) out.push(ink, x0 + x, y0 + y);
      }
      return out;
    }
    function pushPix(B, list, u) { for (var i = 0; i < list.length; i += 3) B.px(list[i], list[i + 1], list[i + 2], 1, 1); }
    // cached crisp text (outlined), drawn at integer scale u
    function textImg(s, col, bare) {
      var key = col + '|' + (bare ? 1 : 0) + '|' + s, c = textCache[key]; if (c) return c;
      if (textCacheN > 400) { textCache = {}; textCacheN = 0; }
      var w = textW(s) + 2, h = 8, cv = (root.document && root.document.createElement('canvas')); if (!cv) return null;
      cv.width = Math.max(1, w); cv.height = h; var g = cv.getContext('2d'), x = 1, i, r, k, mask = new Uint8Array(cv.width * h);
      for (i = 0; i < s.length; i++) {
        var ch = s.charAt(i); if (ch === ' ') { x += 3; continue; }
        var gl = FONT[ch] || FONT[ch.toUpperCase()] || FONT['?'];
        for (r = 0; r < gl.rows.length; r++) for (k = 0; k < gl.rows[r].length; k++) if (gl.rows[r].charAt(k) === '#') mask[(r + 1) * cv.width + x + k] = 1;
        x += gl.w + 1;
      }
      g.fillStyle = C.ink;
      if (!bare) for (r = 0; r < h; r++) for (k = 0; k < cv.width; k++) if (!mask[r * cv.width + k]) {
        var n = (k > 0 && mask[r * cv.width + k - 1]) || (k < cv.width - 1 && mask[r * cv.width + k + 1]) || (r > 0 && mask[(r - 1) * cv.width + k]) || (r < h - 1 && mask[(r + 1) * cv.width + k]) ||
          (k < cv.width - 1 && r < h - 1 && mask[(r + 1) * cv.width + k + 1]);
        if (n) g.fillRect(k, r, 1, 1);
      }
      g.fillStyle = col; for (r = 0; r < h; r++) for (k = 0; k < cv.width; k++) if (mask[r * cv.width + k]) g.fillRect(k, r, 1, 1);
      textCacheN++; return (textCache[key] = cv);
    }
    function drawText(F, s, x, y, col, align, bare) {   // x, y = top-left of the cap height (align 'center' / 'right' shift x)
      var g = F.ctx, u = F.u, w = measure(F, s);
      if (align === 'center') x -= w / 2; else if (align === 'right') x -= w;
      if (F.crisp) { var im = textImg(s, col, bare); if (!im) return; var sm = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false; g.drawImage(im, Math.round(x) - u, Math.round(y) - u, im.width * u, im.height * u); g.imageSmoothingEnabled = sm; return; }
      g.font = '700 ' + (9.5 * u).toFixed(1) + 'px system-ui, -apple-system, "Segoe UI", sans-serif'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
      g.lineJoin = 'round'; g.lineWidth = 2.6 * u; g.strokeStyle = C.ink; g.strokeText(s, x, y + 7 * u); g.fillStyle = col; g.fillText(s, x, y + 7 * u);
    }
    function measure(F, s) {
      if (F.crisp) return textW(s) * F.u;
      var g = F.ctx; g.font = '700 ' + (9.5 * F.u).toFixed(1) + 'px system-ui, -apple-system, "Segoe UI", sans-serif'; return g.measureText(s).width;
    }

    /* ---------- rings (ground pass) ---------- */
    function arcColor(u, R, a, pulse) {
      var front = Math.PI / 2, d = angDiff(a, front) / Math.PI;   // 0 at the front (bottom), 1 at the back
      var f = u.hp == null ? 1 : u.hp, lag = R ? R.lag : f;
      var hpCol = u.hp != null && f <= P.lowHp && pulse ? C.low : teamCol(u);
      if (P.arc === 'off' || u.hp == null) return teamCol(u);
      if (d <= f) return hpCol; if (d <= lag) return C.loss; return null;
    }
    function drawRings(F) {
      if (P.rings === 'off') return [];
      var g = F.ctx, u = F.u, out = [], pulse = Math.floor(clock / 220) % 2 === 0, i;
      var list = F.units.filter(function (q) { return q.ring && q.s; }).sort(function (a, b) { return a.s.y - b.s.y; });
      if (F.crisp) {
        var B = batch();
        for (i = 0; i < list.length; i++) {
          var q = list[i], R = recs[q.id], cx = Math.round(q.s.x), cy = Math.round(q.s.y), rx = Math.round(q.rx), ry = Math.max(2, Math.round(q.ry)), th = (q.focus || q.boss ? 2 : 1.5) * u;
          if (cx + rx < F.view.x || cx - rx > F.view.x + F.view.w || cy + ry < F.view.y || cy - ry > F.view.y + F.view.h) continue;
          // soft dark disc under the feet, then the missing track, then the arc
          for (var yy = -ry; yy <= ry; yy++) { var half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (yy + 0.5) * (yy + 0.5) / (ry * ry)))) - th; if (half > 0) B.px(C.shadow, cx - half, cy + yy, half * 2, 1); }
          pushPix(B, ringPixels(cx, cy, rx, ry, th + u, function (a, d) { return d < -th || d >= 0 ? C.ink : null; }, u), u);
          pushPix(B, ringPixels(cx, cy, rx, ry, th, function (a) { return arcColor(q, R, a, pulse) || C.missing; }), u);
          if (q.focus) {   // selection reticle: four L brackets at the ring's corners, breathing by 1u
            var br = Math.floor(clock / 400) % 2 ? u : 0, bx0 = cx - rx - 2 * u - br, bx1 = cx + rx + 2 * u + br - 1, by0 = cy - ry - 2 * u - br, by1 = cy + ry + 2 * u + br - 1, L = 3 * u, tc = teamCol(q);
            [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx0, by1, 1, -1], [bx1, by1, -1, -1]].forEach(function (c) {
              var X = c[0], Y = c[1], sx = c[2], sy = c[3];
              B.px(C.ink, sx > 0 ? X - u : X - L + 1, sy > 0 ? Y - u : Y, L + u, u); B.px(C.ink, sx > 0 ? X - u : X + 1, sy > 0 ? Y - u : Y - L + 1, u, L + u);
              B.px(C.ink, sx > 0 ? X : X - L + 1, sy > 0 ? Y + u : Y - u, L, u); B.px(C.ink, sx > 0 ? X + u : X - u, sy > 0 ? Y : Y - L + 1, u, L);
              B.px(tc, sx > 0 ? X : X - L + 1, Y, L, u); B.px(tc, X, sy > 0 ? Y : Y - L + 1, u, L);
            });
          }
          out.push({ id: q.id, cx: cx, cy: cy, rx: rx, ry: ry, hp: q.hp, lag: R ? R.lag : q.hp });
        }
        B.flush(g);
      } else {
        for (i = 0; i < list.length; i++) {
          var s = list[i], Rs = recs[s.id], x = s.s.x, y = s.s.y, rxs = s.rx, rys = s.ry, ths = (s.focus || s.boss ? 3 : 2.2) * u;
          if (x + rxs < F.view.x || x - rxs > F.view.x + F.view.w || y + rys < F.view.y || y - rys > F.view.y + F.view.h) continue;
          g.save();
          var gr = g.createRadialGradient(x, y, 0, x, y, rxs); gr.addColorStop(0, 'rgba(10,6,18,0.34)'); gr.addColorStop(1, 'rgba(10,6,18,0.10)');
          g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rxs, rys, 0, 0, Math.PI * 2); g.fill();
          g.lineWidth = ths + 2 * u; g.strokeStyle = 'rgba(12,6,20,0.65)'; g.beginPath(); g.ellipse(x, y, rxs, rys, 0, 0, Math.PI * 2); g.stroke();
          g.lineWidth = ths; g.strokeStyle = C.missing; g.beginPath(); g.ellipse(x, y, rxs, rys, 0, 0, Math.PI * 2); g.stroke();
          var f = s.hp == null || P.arc === 'off' ? 1 : s.hp, lag = Rs ? Math.max(f, Rs.lag) : f, fr = Math.PI / 2;
          g.lineCap = 'round';
          if (lag > f + 0.002) { g.strokeStyle = C.loss; g.beginPath(); g.ellipse(x, y, rxs, rys, 0, fr - lag * Math.PI, fr + lag * Math.PI); g.stroke(); }
          if (f > 0.002) { g.strokeStyle = s.hp != null && f <= P.lowHp && pulse ? C.low : teamCol(s); g.beginPath(); g.ellipse(x, y, rxs, rys, 0, fr - f * Math.PI, fr + f * Math.PI); g.stroke(); }
          if (s.focus) {   // selection reticle: four L brackets around the ring, breathing by 1u
            var b2 = Math.floor(clock / 400) % 2 ? u : 0, X0 = x - rxs - 4 * u - b2, X1 = x + rxs + 4 * u + b2, Y0 = y - rys - 3 * u - b2, Y1 = y + rys + 3 * u + b2, L2 = 5 * u;
            g.lineCap = 'square'; g.lineJoin = 'miter';
            [[X0, Y0, 1, 1], [X1, Y0, -1, 1], [X0, Y1, 1, -1], [X1, Y1, -1, -1]].forEach(function (c) {
              g.beginPath(); g.moveTo(c[0] + c[2] * L2, c[1]); g.lineTo(c[0], c[1]); g.lineTo(c[0], c[1] + c[3] * L2);
              g.lineWidth = 4 * u; g.strokeStyle = C.ink; g.stroke(); g.lineWidth = 2 * u; g.strokeStyle = teamCol(s); g.stroke(); });
            g.lineCap = 'butt';
          }
          g.restore();
          out.push({ id: s.id, cx: x, cy: y, rx: rxs, ry: rys, hp: s.hp, lag: Rs ? Rs.lag : s.hp });
        }
      }
      return out;
    }
    function drawPings(F, targets) {
      if (P.ping === 'off') return;
      var g = F.ctx, u = F.u;
      for (var i = 0; i < targets.length; i++) {
        var t = targets[i]; if (t.kind !== 'goal') continue;
        var s = F.M.f(t.x, t.y); if (!s || s.x < F.view.x || s.y < F.view.y || s.x > F.view.x + F.view.w || s.y > F.view.y + F.view.h) continue;
        var ph = (clock % 1600) / 1600, rx = (6 + 14 * ph) * u, ry = rx * P.squash, col = t.color || C.goal;
        g.save(); g.globalAlpha = 0.85 * (1 - ph);
        if (F.crisp) { var B = batch(); pushPix(B, ringPixels(Math.round(s.x), Math.round(s.y), Math.round(rx), Math.max(2, Math.round(ry)), u, function () { return col; }), u); B.flush(g); }
        else { g.lineWidth = 2 * u; g.strokeStyle = col; g.beginPath(); g.ellipse(s.x, s.y, rx, ry, 0, 0, Math.PI * 2); g.stroke(); }
        g.restore();
      }
    }

    /* ---------- edge arrows ---------- */
    function arrowsLayout(F, targets, taken) {
      var out = [], hidden = [], v = F.view, u = F.u, cx = v.x + v.w / 2, cy = v.y + v.h / 2, list = [];
      if (P.arrows === 'off') return { arrows: out, hidden: hidden };
      targets.forEach(function (t) { if (t.track) list.push({ id: t.id, kind: t.kind, x: t.x, y: t.y, label: t.label, color: t.color, pri: t.kind === 'goal' ? 0 : 2 }); });
      F.units.forEach(function (q) { if (q.track) list.push({ id: q.id, kind: q.team === 'enemy' ? 'enemy' : q.team === 'npc' ? 'npc' : 'ally', x: q.x, y: q.y - q.h / 2, label: q.name, color: q.color, pri: q.boss ? 1 : 3 }); });
      list.sort(function (a, b) { return a.pri - b.pri || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
      var rad = (F.crisp ? 6 : 8) * u, len = (F.crisp ? 8 : 10) * u, R = rad + len, RB = R + (F.crisp ? 1 : 2.5) * u, base = P.margin * u + RB;
      for (var i = 0; i < list.length; i++) {
        var t = list[i], s = F.M.f(t.x, t.y); if (!s) continue;
        if (s.x >= v.x && s.x <= v.x + v.w && s.y >= v.y && s.y <= v.y + v.h) continue;     // on screen: no arrow
        var dx = s.x - cx, dy = s.y - cy, placed = null, k, maxIn = Math.min(v.w / 2 - RB - u, v.h / 2 - RB - u, base + Math.min(v.w, v.h) / 3);
        for (k = base; k <= maxIn && !placed; k += 3 * u) {
          var hw = v.w / 2 - k, hh = v.h / 2 - k; if (hw <= 0 || hh <= 0) break;
          var sc = Math.min(Math.abs(dx) > 1e-9 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? hh / Math.abs(dy) : Infinity);
          var px = cx + dx * sc, py = cy + dy * sc;
          if (F.crisp) { px = Math.round(px); py = Math.round(py); }
          var box = { x: px - RB, y: py - RB, w: 2 * RB, h: 2 * RB }, ok = inside(box, v), j;
          for (j = 0; ok && j < F.safe.length; j++) if (hit(box, F.safe[j], u)) ok = false;
          for (j = 0; ok && j < taken.length; j++) if (hit(box, taken[j], 2 * u)) ok = false;
          if (ok) placed = { x: px, y: py, box: box, inset: k };
        }
        if (!placed) {   // no room along the bearing within a third of the view: slide along the edge band instead (the angle is recomputed)
          var e0 = edgePoint(v, base, dx, dy), per = 2 * (v.w + v.h - 4 * base), st = 3 * u, pos0 = perimPos(v, base, e0.x, e0.y);
          for (var sd = st; sd < per / 2 && !placed; sd += st) for (var sg = -1; sg <= 1 && !placed; sg += 2) {
            var pp = perimAt(v, base, pos0 + sg * sd), bx2 = { x: pp.x - RB, y: pp.y - RB, w: 2 * RB, h: 2 * RB }, ok3 = inside(bx2, v), j3;
            if (F.crisp) { pp.x = Math.round(pp.x); pp.y = Math.round(pp.y); bx2.x = pp.x - RB; bx2.y = pp.y - RB; }
            for (j3 = 0; ok3 && j3 < F.safe.length; j3++) if (hit(bx2, F.safe[j3], u)) ok3 = false;
            for (j3 = 0; ok3 && j3 < taken.length; j3++) if (hit(bx2, taken[j3], 2 * u)) ok3 = false;
            if (ok3) placed = { x: pp.x, y: pp.y, box: bx2, inset: base, slid: true };
          }
        }
        if (!placed) { hidden.push({ id: t.id, what: 'arrow', why: 'noRoom' }); ST.noRoom++; continue; }
        var ang = Math.atan2(s.y - placed.y, s.x - placed.x);
        var a = { id: t.id, kind: t.kind, x: placed.x, y: placed.y, r: rad, len: len, angle: ang, inset: placed.inset, box: placed.box, target: { x: s.x, y: s.y },
          tip: { x: placed.x + Math.cos(ang) * R, y: placed.y + Math.sin(ang) * R }, color: t.color, dist: null, label: null };
        if (P.distance !== 'off' && F.player) {
          var m = Math.hypot(t.x - F.player.x, t.y - F.player.y) / P.unit, str = fmtDist(m, P.unitLabel), tw = measure(F, str), th = (F.crisp ? 5 : 8) * u;
          // the label goes on the inward side of the badge (toward the view centre), else beside it; skipped when nothing fits
          var ix = cx - placed.x, iy = cy - placed.y, il = Math.hypot(ix, iy) || 1; ix /= il; iy /= il;
          var cands = [[ix, iy], [0, 1], [0, -1], [1, 0], [-1, 0]];
          for (var c = 0; c < cands.length && !a.label; c++) {
            var lx = placed.x + cands[c][0] * (rad + 2 * u + tw / 2) - tw / 2, ly = placed.y + cands[c][1] * (rad + 2 * u + th / 2) - th / 2;
            if (cands[c][0] === 0) lx = placed.x - tw / 2; if (cands[c][1] === 0) ly = placed.y - th / 2;
            if (F.crisp) { lx = Math.round(lx); ly = Math.round(ly); }
            var lb = { x: lx - u, y: ly - u, w: tw + 2 * u, h: th + 2 * u }, ok2 = inside(lb, v), q2;
            for (q2 = 0; ok2 && q2 < F.safe.length; q2++) if (hit(lb, F.safe[q2], u)) ok2 = false;
            for (q2 = 0; ok2 && q2 < taken.length; q2++) if (hit(lb, taken[q2], u)) ok2 = false;
            if (ok2) { a.label = { x: lx, y: ly, w: tw, h: th, text: str, box: lb }; }
          }
          a.dist = Math.round(m * 10) / 10;
        }
        taken.push(a.box); if (a.label) taken.push(a.label.box);
        out.push(a);
      }
      return { arrows: out, hidden: hidden };
    }
    // the rectangle inset by k as a perimeter: point where the bearing (dx, dy) from the centre meets it, position <-> point
    function edgePoint(v, k, dx, dy) { var cx = v.x + v.w / 2, cy = v.y + v.h / 2, hw = Math.max(0.5, v.w / 2 - k), hh = Math.max(0.5, v.h / 2 - k), sc = Math.min(Math.abs(dx) > 1e-9 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? hh / Math.abs(dy) : Infinity); return { x: cx + dx * sc, y: cy + dy * sc }; }
    function perimPos(v, k, x, y) { var x0 = v.x + k, y0 = v.y + k, w = Math.max(1, v.w - 2 * k), h = Math.max(1, v.h - 2 * k);
      if (Math.abs(y - y0) < 0.01) return x - x0; if (Math.abs(x - (x0 + w)) < 0.01) return w + (y - y0); if (Math.abs(y - (y0 + h)) < 0.01) return w + h + (x0 + w - x); return 2 * w + h + (y0 + h - y); }
    function perimAt(v, k, p) { var x0 = v.x + k, y0 = v.y + k, w = Math.max(1, v.w - 2 * k), h = Math.max(1, v.h - 2 * k), L = 2 * (w + h); p = ((p % L) + L) % L;
      if (p < w) return { x: x0 + p, y: y0 }; p -= w; if (p < h) return { x: x0 + w, y: y0 + p }; p -= h; if (p < w) return { x: x0 + w - p, y: y0 + h }; p -= w; return { x: x0, y: y0 + h - p }; }
    function iconCol(kind, col) { return col || (kind === 'goal' ? C.goal : kind === 'enemy' ? C.enemy : kind === 'item' ? C.item : kind === 'npc' ? C.npc : kind === 'ally' ? C.ally : C.poi); }
    function drawArrow(F, a) {
      var g = F.ctx, u = F.u, col = iconCol(a.kind, a.color), ca = Math.cos(a.angle), sa = Math.sin(a.angle), R = a.r + a.len, pulse = 0.5 + 0.5 * Math.sin(clock / 260);
      if (F.crisp) {
        var B = batch(), tipL = R - u * (pulse > 0.5 ? 0 : 1), w = 5 * u, b0 = a.r + u * (pulse > 0.5 ? 1 : 0);
        var pts = [[a.x + ca * tipL, a.y + sa * tipL], [a.x + ca * b0 - sa * w, a.y + sa * b0 + ca * w], [a.x + ca * (b0 + 1.5 * u), a.y + sa * (b0 + 1.5 * u)], [a.x + ca * b0 + sa * w, a.y + sa * b0 - ca * w]];
        pushPix(B, polyPixels(pts, col, C.ink), u);
        pushPix(B, discPixels(a.x, a.y, a.r, function (d) { return d <= a.r - 2 * u ? '#21162e' : d <= a.r - u ? col : d <= a.r ? C.ink : null; }), u);
        var ic = ICON[a.kind] || ICON.poi, ox = Math.round(a.x - 2.5 * u), oy = Math.round(a.y - 2.5 * u);
        for (var r = 0; r < 5; r++) for (var k = 0; k < 5; k++) if (ic[r].charAt(k) === '#') B.px(col, ox + k * u, oy + r * u, u, u);
        B.flush(g);
      } else {
        g.save();
        g.translate(a.x, a.y); g.rotate(a.angle);
        var tl = R - 1.5 * u * (1 - pulse), b1 = a.r + 1.5 * u * pulse;
        g.beginPath(); g.moveTo(tl, 0); g.lineTo(b1, -6 * u); g.lineTo(b1 + 2.5 * u, 0); g.lineTo(b1, 6 * u); g.closePath();
        g.lineJoin = 'round'; g.lineWidth = 3 * u; g.strokeStyle = C.ink; g.stroke(); g.fillStyle = col; g.fill();
        g.restore(); g.save();
        g.beginPath(); g.arc(a.x, a.y, a.r, 0, Math.PI * 2); g.fillStyle = 'rgba(22,15,32,0.9)'; g.fill(); g.lineWidth = 2 * u; g.strokeStyle = col; g.stroke();
        g.lineWidth = 1; g.strokeStyle = C.ink; g.beginPath(); g.arc(a.x, a.y, a.r + 1.2 * u, 0, Math.PI * 2); g.stroke();
        vecIcon(g, a.kind, a.x, a.y, 3.2 * u, col);
        g.restore();
      }
      if (a.label) drawText(F, a.label.text, a.label.x, a.label.y, C.text);
    }
    function vecIcon(g, kind, x, y, s, col) {
      g.fillStyle = col; g.beginPath();
      if (kind === 'goal') { g.moveTo(x, y - s * 1.2); g.lineTo(x + s, y); g.lineTo(x, y + s * 1.2); g.lineTo(x - s, y); g.closePath(); g.fill(); return; }
      if (kind === 'item') { g.moveTo(x - s, y - s * 0.4); g.lineTo(x - s * 0.5, y - s); g.lineTo(x + s * 0.5, y - s); g.lineTo(x + s, y - s * 0.4); g.lineTo(x, y + s * 1.1); g.closePath(); g.fill(); return; }
      if (kind === 'ally') { g.moveTo(x, y + s); g.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.6, y - s * 1.4, x, y - s * 0.4); g.bezierCurveTo(x + s * 0.6, y - s * 1.4, x + s * 1.6, y - s * 0.2, x, y + s); g.fill(); return; }
      if (kind === 'npc') { g.fillRect(x - s * 0.28, y - s * 1.2, s * 0.56, s * 1.5); g.fillRect(x - s * 0.28, y + s * 0.6, s * 0.56, s * 0.56); return; }
      if (kind === 'enemy') { g.arc(x, y - s * 0.2, s, 0, Math.PI * 2); g.fill(); g.fillRect(x - s * 0.6, y + s * 0.4, s * 1.2, s * 0.7); g.fillStyle = '#21162e'; g.beginPath(); g.arc(x - s * 0.4, y - s * 0.2, s * 0.28, 0, Math.PI * 2); g.arc(x + s * 0.4, y - s * 0.2, s * 0.28, 0, Math.PI * 2); g.fill(); return; }
      g.fillRect(x - s * 0.8, y - s, s * 0.3, s * 2); g.moveTo(x - s * 0.5, y - s); g.lineTo(x + s, y - s * 0.5); g.lineTo(x - s * 0.5, y); g.closePath(); g.fill();
    }

    /* ---------- objective markers (on-screen goals) ---------- */
    function markersLayout(F, targets, taken) {
      var out = [], hidden = [], u = F.u, v = F.view;
      if (P.markers === 'off') return { markers: out, hidden: hidden };
      targets.forEach(function (t) {
        if (!t.marker) return;
        var s = F.M.f(t.x, t.y); if (!s || s.x < v.x || s.x > v.x + v.w || s.y < v.y || s.y > v.y + v.h) return;
        var bob = Math.round(Math.sin(clock / 300) * 1.5 * u), ds = 5 * u, top = s.y - t.h * F.M.sy - 4 * u - ds * 2 + bob;
        var str = null, tw = 0, th = (F.crisp ? 5 : 8) * u, m = null;
        if (P.distance !== 'off' && F.player) { m = Math.hypot(t.x - F.player.x, t.y - F.player.y) / P.unit; if (m >= 2) { str = fmtDist(m, P.unitLabel); tw = measure(F, str); } }
        var cands = [top, s.y + 6 * u], placed = null;
        for (var c = 0; c < cands.length && !placed; c++) {
          var y0 = F.crisp ? Math.round(cands[c]) : cands[c], x0 = F.crisp ? Math.round(s.x) : s.x;
          var box = { x: x0 - ds - u, y: y0 - u, w: 2 * ds + 2 * u + (str ? tw + 3 * u : 0), h: Math.max(2 * ds, th) + 2 * u }, ok = inside(box, v), j;
          for (j = 0; ok && j < F.safe.length; j++) if (hit(box, F.safe[j], u)) ok = false;
          for (j = 0; ok && j < taken.length; j++) if (hit(box, taken[j], u)) ok = false;
          if (ok) placed = { x: x0, y: y0, box: box };
        }
        if (!placed) { hidden.push({ id: t.id, what: 'marker', why: 'noRoom' }); return; }
        taken.push(placed.box);
        out.push({ id: t.id, kind: t.kind, x: placed.x, y: placed.y, ds: ds, box: placed.box, target: { x: s.x, y: s.y }, dist: m != null ? Math.round(m * 10) / 10 : null, text: str, tw: tw, color: t.color });
      });
      return { markers: out, hidden: hidden };
    }
    function drawMarker(F, mk) {
      var g = F.ctx, u = F.u, col = mk.color || iconCol(mk.kind), x = mk.x, y = mk.y, ds = mk.ds;
      if (F.crisp) {
        var B = batch();
        pushPix(B, polyPixels([[x, y], [x + ds, y + ds], [x, y + 2 * ds], [x - ds, y + ds]], col, C.ink), u);
        B.px('#fffbe6', x - u, y + 2 * u, u, 2 * u); B.px(C.ink, x - Math.round(ds / 2), y + ds, 1, 1);
        B.flush(g);
      } else {
        g.save(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + ds, y + ds); g.lineTo(x, y + 2 * ds); g.lineTo(x - ds, y + ds); g.closePath();
        g.lineJoin = 'round'; g.lineWidth = 2.5 * u; g.strokeStyle = C.ink; g.stroke(); g.fillStyle = col; g.fill();
        g.fillStyle = 'rgba(255,251,230,0.85)'; g.beginPath(); g.moveTo(x, y + 1.5 * u); g.lineTo(x + ds * 0.45, y + ds); g.lineTo(x, y + ds); g.closePath(); g.fill(); g.restore();
      }
      if (mk.text) drawText(F, mk.text, x + ds + 3 * u, y + ds - (F.crisp ? 2.5 : 4) * u, C.text);
    }

    /* ---------- name plates ---------- */
    function plateSize(F, q) {
      var u = F.u, name = q.name || (q.team === 'enemy' ? 'Foe' : ''), lv = P.level !== 'off' && q.level != null ? String(q.level) : '';
      var nw = name ? measure(F, name) : 0, lw = lv ? (F.crisp ? measure(F, lv) + 5 * u : Math.max(9 * u, measure(F, lv) * 0.95 + 5 * u) + 2 * u) : 0, bar = P.plateHp !== 'off' && q.hp != null;
      var w, h;
      if (F.crisp) { w = Math.max(nw + lw + 6 * u, bar ? 22 * u : 0); h = (name ? 9 : 3) * u + (bar ? 3 * u : 0); }
      else { w = Math.max(nw + lw + 12 * u, bar ? 40 * u : 0); h = (name ? 15 : 5) * u + (bar ? 5 * u : 0); }
      if (F.crisp) { w = Math.round(w); h = Math.round(h); }
      return { w: w, h: h, name: name, lv: lv, nw: nw, lw: lw, bar: bar };
    }
    // plate layout. update() solves it with hysteresis (a plate keeps its previous slot unless another beats it by HYST cost or the
    // old one turns illegal) and eases each plate's offset from its anchor over ~150 ms; draw() re-reads that state, checks the hard
    // rules again at the draw-time positions and only then falls back to the eased target or a fresh solve. Everything draw() uses is
    // derived from update(), so ?t=&freeze=1 stills equal play.
    var XFADE = 150, HYST = 2.5, DWELL = 450, EASE = 150, FADE_IN = 200, FADE_OUT = 200, MIN_SHOW = 1500, MIN_HIDE = 1500, RECENT_MS = 3000, STEAL = 3, RETURN_MS = 1500, RETURN_COST = 4, NUDGE = [[0, -2], [0, 2], [-2, 0], [2, 0], [0, -4], [0, 4], [-4, 0], [4, 0], [-3, -3], [3, -3]];   // cost margin to leave a legal slot, min ms in a slot before a voluntary move, ease ms
    function plateCtx(F) {
      var u = F.u, allHard = P.avoid === 'all' || (P.avoid === 'auto' && u >= 2);
      var list = F.units.filter(function (q) { var R = recs[q.id]; q.want = plateWanted(q, u); return q.s && (q.want || (R && R.vis && R.vis !== 'hidden')); });
      // party first (they are never hidden for anyone else's plate), then the focus, a boss, enemies, npcs
      var rank = function (q) { return q.team === 'hero' || q.team === 'ally' ? 0 : q.focus ? 1 : q.boss ? 2 : q.team === 'enemy' ? 3 : 4; };
      list.sort(function (a, b) { return rank(a) - rank(b) || (TEAM_ORDER[a.team] || 5) - (TEAM_ORDER[b.team] || 5) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
      // sprite boxes; a plate never covers a hard one: heroes and the focused unit always ('auto' / 'heroes'), every unit when u >= 2
      // ('auto', big UI on a small screen) or always ('all'); lower-priority plates are hidden instead (they are placed last)
      var bodies = F.units.filter(function (q) { return q.s; }).map(function (q) { return { id: q.id, x: q.s.x - q.rx * 0.8, y: q.headY, w: q.rx * 1.6, h: q.s.y - q.headY,
        hard: P.avoid !== 'soft' && (allHard || q.team === 'hero' || q.focus), hero: P.avoid !== 'soft' && (q.team === 'hero' || !!q.focus) }; });
      var feet = F.units.filter(function (q) { return q.s && q.ring; }).map(function (q) { return { x: q.s.x - q.rx, y: q.s.y - q.ry, w: 2 * q.rx, h: 2 * q.ry }; });
      return { list: list, bodies: bodies, feet: feet, gap: (F.crisp ? 3 : 5) * u, notch: (F.crisp ? 2 : 4) * u };
    }
    function fitBox(F, x, y, sz) { var v = F.view, u = F.u; x = clamp(x, v.x + u, v.x + v.w - u - sz.w); y = clamp(y, v.y + u, v.y + v.h - u - sz.h); if (F.crisp) { x = Math.round(x); y = Math.round(y); } return { x: x, y: y, w: sz.w, h: sz.h }; }
    // null = breaks a hard rule; else the soft cost of the box (without the slot's own cost)
    // null = breaks a hard rule; else the soft cost of the box (without the slot's own cost). glide (keep / transit rules): 1 = a
    // plate may sit on or pass over a non-hero sprite (hero / focus sprites, the HUD, the view edge and other plates stop it);
    // 2 = a party plate: only the HUD, the view edge and other plates stop it (it moves to a fully legal slot as soon as it can)
    function boxCost(F, PC, q, box, taken, glide) {
      var v = F.view, u = F.u, j, cost = 0;
      if (!(inside(box, v) && box.w <= v.w - 2 * u)) return null;
      var hb = { x: box.x, y: box.y, w: box.w, h: box.h + PC.notch };   // the pointer notch under the plate counts too
      for (j = 0; j < F.safe.length; j++) if (hit(hb, F.safe[j], u)) return null;
      for (j = 0; j < taken.length; j++) if (hit(hb, taken[j], u + (PC.pad || PC.basePad || 0))) return null;   // update() keeps 1u more than draw() needs
      for (j = 0; j < PC.bodies.length; j++) if (PC.bodies[j].id !== q.id && PC.bodies[j].hard && (!glide || (glide !== 2 && PC.bodies[j].hero)) && hit(box, PC.bodies[j], 0)) return null;
      for (j = 0; j < PC.bodies.length; j++) if (PC.bodies[j].id !== q.id && hit(box, PC.bodies[j], u)) cost += 4;
      // clearance: a slot hugging a hero / focus sprite is the first to break when that unit moves
      for (j = 0; j < PC.bodies.length; j++) if (PC.bodies[j].id !== q.id && PC.bodies[j].hero && hit(box, PC.bodies[j], 6 * u)) cost += 2;
      for (j = 0; j < PC.feet.length; j++) if (hit(box, PC.feet[j], 0)) cost += 2;
      if (PC.others) for (j = 0; j < PC.others.length; j++) if (hit(box, PC.others[j], u)) { if (PC.othersHard) return null; cost += STEAL; }   // a lower-priority plate sits there now
      if (hit(box, { x: q.s.x - q.rx * 0.8, y: q.headY, w: q.rx * 1.6, h: q.s.y - q.headY }, 0)) cost += isParty(q) ? 12 : 6;   // a party plate sits above its own head whenever it can
      return cost + Math.abs(box.x - (q.s.x - box.w / 2)) / (box.w + 1) * 0.5;
    }
    function slotBox(F, PC, q, sz, k) {
      var d = DIRTRY[k], u = F.u, x = q.s.x - sz.w / 2 + d[0] * (sz.w / 2 + 2 * u), y;
      if (d[1] === 'below') y = q.s.y + q.ry + 2 * u; else y = q.headY - PC.gap - sz.h + d[1] * (sz.h + 2 * u);
      return fitBox(F, x, y, sz);
    }
    // every legal slot, cheapest first
    function cands(F, PC, q, sz, taken, glide) {
      var out = [];
      for (var k = 0; k < DIRTRY.length; k++) { var box = slotBox(F, PC, q, sz, k), c = boxCost(F, PC, q, box, taken, glide); if (c != null) out.push({ x: box.x, y: box.y, slot: k, cost: c + k * 0.6 }); }
      return out.sort(function (a, b) { return a.cost - b.cost || a.slot - b.slot; });
    }
    // best legal slot for a fresh plate (draw fallback): keeps 'prev' unless another beats it by more than HYST
    function solve(F, PC, q, sz, taken, prev) {
      var L = cands(F, PC, q, sz, taken); if (!L.length) return null;
      for (var i = 0; i < L.length; i++) if (L[i].slot === prev && L[i].cost <= L[0].cost + HYST) return L[i];
      return L[0];
    }
    // can the plate glide in a straight line from offset (fx, fy) to box b? (samples along the way, glide rules)
    function pathClear(F, PC, q, sz, taken, fx, fy, b) {
      var gl = isParty(q) ? 2 : 1, oh = PC.othersHard; PC.othersHard = true;   // a glide never crosses a plate that is showing
      try { return pathClear0(F, PC, q, sz, taken, fx, fy, b, gl); } finally { PC.othersHard = oh; }
    }
    function pathClear0(F, PC, q, sz, taken, fx, fy, b, gl) {
      var tx = b.x - q.s.x, ty = b.y - q.headY;
      if (Math.hypot(tx - fx, ty - fy) <= 4 * F.u) return true;
      for (var e = 0.2; e < 0.95; e += 0.2) if (boxCost(F, PC, q, fitBox(F, q.s.x + fx + (tx - fx) * e, q.headY + fy + (ty - fy) * e, sz), taken, gl) == null) return false;
      return true;
    }
    // plate visibility is a small state machine kept in update(): hidden -> 'in' (fade in FADE_IN) -> 'shown' -> 'out' (fade out
    // FADE_OUT) -> hidden. A plate that appears stays at least MIN_SHOW ms and leaves only by fading out; a hidden plate stays hidden
    // at least MIN_HIDE ms. Only a unit leaving the screen (or dying) or a hard rule with no way out removes a plate at once ('cut').
    function isParty(q) { return q.team === 'hero' || q.team === 'ally'; }
    function curBox(F, q, R) { return fitBox(F, q.s.x + R.ox, q.headY + R.oy, { w: R.w, h: R.h }); }
    function offView(F, q) { var v = F.view; return q.s.x < v.x || q.s.x > v.x + v.w || q.headY > v.y + v.h || q.s.y < v.y; }
    function platesUpdate(F, taken, dt) {
      var PC = plateCtx(F), i, q, R, cur = {}, shown = 0;
      PC.basePad = F.u;   // slack for games that move units after update() and before draw()
      for (i = 0; i < PC.list.length; i++) { q = PC.list[i]; R = recs[q.id]; if (R && !R.vis) { R.vis = 'hidden'; R.vt = MIN_HIDE; }
        if (R && R.xfT != null) R.xfT += dt;
        if (R && R.ghostOnly) { R.ghostOnly.t += dt; if (R.ghostOnly.t >= XFADE) R.ghostOnly = null; }
        if (R && R.ghost) { R.ghost.t += dt; R.xf += dt; if (R.ghost.t >= XFADE || R.vis === 'hidden') { R.ghost = null; R.xf = null; } } }
      // 1. plates fading out keep their box (nothing moves into it while they fade)
      for (i = 0; i < PC.list.length; i++) {
        q = PC.list[i]; R = recs[q.id]; if (!R || R.vis !== 'out') continue;
        R.vt += dt;
        if (R.vt >= FADE_OUT || offView(F, q)) { R.vis = 'hidden'; R.vt = 0; continue; }
        var ob = curBox(F, q, R), hitHud = false; for (var j = 0; j < F.safe.length; j++) if (hit(ob, F.safe[j], 0)) hitHud = true;
        if (hitHud) { R.vis = 'hidden'; R.vt = 0; ST.cuts = (ST.cuts || 0) + 1; continue; }
        taken.push(ob);
      }
      for (i = 0; i < PC.list.length; i++) { q = PC.list[i]; R = recs[q.id]; if (R && (R.vis === 'in' || R.vis === 'shown') && R.w) cur[q.id] = curBox(F, q, R); }
      // 2. the rest, party first
      for (i = 0; i < PC.list.length; i++) {
        q = PC.list[i]; R = recs[q.id]; if (!R || R.vis === 'out') continue;
        R.vt += dt; R.since = (R.since || 0) + dt; if (R.left) R.left.t += dt;
        PC.others = []; for (var k2 = i + 1; k2 < PC.list.length; k2++) if (cur[PC.list[k2].id]) PC.others.push(cur[PC.list[k2].id]);
        var off = offView(F, q), sz = plateSize(F, q), b = null, c, L;
        if (R.vis === 'hidden') {
          if (!q.want || off || (R.vt < MIN_HIDE && !isParty(q)) || shown >= P.maxPlates) continue;   // the party comes back at once
          PC.othersHard = true; if (!isParty(q)) PC.pad = 3 * F.u;   // an optional plate only appears where it has room to stay
          L = cands(F, PC, q, sz, taken); PC.pad = 0; if (!L.length && isParty(q)) L = cands(F, PC, q, sz, taken, 2); PC.othersHard = false;
          if (!L.length && isParty(q)) L = cands(F, PC, q, sz, taken, 2);   // the party may push a lower-priority plate away (it then glides)
          if (!L.length) continue;
          b = L[0]; R.vis = 'in'; R.vt = 0; R.age = 0; R.forced = 0; R.ox = b.x - q.s.x; R.oy = b.y - q.headY; R.ease = null; R.since = 0; R.slot = b.slot; R.left = null;
        } else {
          if (R.vis === 'in' && R.vt >= FADE_IN) R.vis = 'shown';
          if (off) { R.vis = 'hidden'; R.vt = 0; continue; }                                      // its unit left the screen
          R.age = (R.age || 0) + dt;                                                               // ms since it appeared
          if (!q.want && R.vis === 'shown' && R.age >= MIN_SHOW) { R.vis = 'out'; R.vt = 0; taken.push(curBox(F, q, R)); continue; }   // leaves only by fading out
          var gl = isParty(q) ? 2 : 1, cb = curBox(F, q, { ox: R.ease ? R.ease.tx : R.ox, oy: R.ease ? R.ease.ty : R.oy, w: sz.w, h: sz.h }), curOk, curNear; PC.pad = 3 * F.u; curOk = boxCost(F, PC, q, cb, taken, gl) != null; PC.pad = 0;   // react before another plate actually touches it
          curNear = !curOk && boxCost(F, PC, q, cb, taken, gl) != null;                            // close, but still clear
          PC.othersHard = true; L = cands(F, PC, q, sz, taken); PC.othersHard = false;   // never move onto a plate that is showing now
          if (R.left && R.left.t < RETURN_MS) for (c = 0; c < L.length; c++) if (L[c].slot === R.left.slot) L[c].cost += RETURN_COST;
          L.sort(function (a2, b2) { return a2.cost - b2.cost || a2.slot - b2.slot; });
          var prev = null; for (c = 0; c < L.length; c++) if (L[c].slot === R.slot) { prev = L[c]; break; }
          var stay = { x: cb.x, y: cb.y, slot: R.slot };
          if (curOk) {
            var same = prev && L.length && Math.abs(prev.x - L[0].x) < 0.5 && Math.abs(prev.y - L[0].y) < 0.5;
            if (!L.length || (prev && (prev.cost <= L[0].cost + HYST || R.since < DWELL || same)) || (prev && R.since < DWELL)) b = prev || stay;
            else { for (c = 0; c < L.length && !b; c++) if (L[c].cost <= L[0].cost + HYST && pathClear(F, PC, q, sz, taken, R.ox, R.oy, L[c])) b = L[c];
              // a much better place (e.g. off its own body, back above its head) that no glide reaches: crossfade there
              if (!b && prev && prev.cost > L[0].cost + 4) { b = L[0]; xfade(R); R.ease = null; R.ox = b.x - q.s.x; R.oy = b.y - q.headY; }
              for (c = 0; c < L.length && !b; c++) if (L[c].cost <= L[0].cost + 6 && pathClear(F, PC, q, sz, taken, R.ox, R.oy, L[c])) b = L[c];
              if (!b) b = prev || stay; }
            if (b === stay && !prev && isParty(q) && R.since >= DWELL) {   // a party plate on a fallback place: move to a clearly better one (e.g. back above its head)
              PC.othersHard = true; var LP = backCost(R, cands(F, PC, q, sz, taken, 2)), curC = boxCost(F, PC, q, cb, taken, 2); PC.othersHard = false;
              if (curC != null && LP.length && LP[0].cost + HYST < curC + (R.slot || 0) * 0.6 && pathClear(F, PC, q, sz, taken, R.ox, R.oy, LP[0])) b = LP[0];
            }
          } else {   // its place broke a hard rule: glide to the nearest reachable legal slot (party plates may use the glide rules)
            for (c = 0; c < L.length && !b; c++) if (pathClear(F, PC, q, sz, taken, R.ox, R.oy, L[c])) b = L[c];
            // the only reachable place is clearly worse than the best one (e.g. off its own head): crossfade to the best instead
            if (L.length && (!b || b.cost > L[0].cost + HYST)) { b = L[0]; xfade(R); R.ease = null; R.ox = b.x - q.s.x; R.oy = b.y - q.headY; }
            if (!b) { PC.othersHard = true; var L2 = backCost(R, cands(F, PC, q, sz, taken, gl)); PC.othersHard = false; for (c = 0; c < L2.length && !b; c++) if (pathClear(F, PC, q, sz, taken, R.ox, R.oy, L2[c])) b = L2[c]; }
            if (!b && curNear) b = stay;   // no way out yet, but nothing touches it: wait where it is (a path usually opens)
            if (!b) {   // nowhere to go: fade out where it is if only a sprite is in the way; cut only when it would sit on a plate or the HUD
              var soft = boxCost(F, PC, q, cb, taken, 2) != null;
              // another plate slid onto it (both ride on moving units): jump straight to the nearest legal place rather than vanish
              PC.othersHard = true; var L3 = backCost(R, cands(F, PC, q, sz, taken, 2)); PC.othersHard = false;
              if (L3.length && !isParty(q) && R.xfT != null && R.xfT < 600) { fadeAway(R); continue; }   // an optional plate pushed twice in a row: it fades away
              if (L3.length) { b = L3[0]; xfade(R); R.ease = null; R.ox = b.x - q.s.x; R.oy = b.y - q.headY; ST.snaps = (ST.snaps || 0) + 1; }
              else if (soft) { R.vis = 'out'; R.vt = 0; taken.push(cb); continue; }
              else { R.vis = 'hidden'; R.vt = 0; R.forced = 1; ST.cuts = (ST.cuts || 0) + 1; continue; } }
          }
        }
        var tox = b.x - q.s.x, toy = b.y - q.headY;
        if (b.slot !== R.slot) { if (R.slot != null) R.left = { slot: R.slot, t: 0 }; R.since = 0; }
        if (Math.hypot(tox - (R.ease ? R.ease.tx : R.ox), toy - (R.ease ? R.ease.ty : R.oy)) > 4 * F.u) R.ease = { fx: R.ox, fy: R.oy, tx: tox, ty: toy, t: 0 };   // a new place: ease there
        if (R.ease) { R.ease.tx = tox; R.ease.ty = toy; R.ease.t += dt; var e = clamp(R.ease.t / EASE, 0, 1); e = e * e * (3 - 2 * e);
          R.ox = R.ease.fx + (tox - R.ease.fx) * e; R.oy = R.ease.fy + (toy - R.ease.fy) * e; if (R.ease.t >= EASE) R.ease = null; }
        else { R.ox = tox; R.oy = toy; }   // small moves (clamping at the view edge) follow at once
        var eb = fitBox(F, q.s.x + R.ox, q.headY + R.oy, sz);
        if (R.ease && boxCost(F, PC, q, eb, taken, isParty(q) ? 2 : 1) == null && !isParty(q) && R.xfT != null && R.xfT < 600) { fadeAway(R); continue; }   // pushed again right after a crossfade: it fades away
        if (R.ease && boxCost(F, PC, q, eb, taken, isParty(q) ? 2 : 1) == null) { xfade(R); R.ease = null; R.ox = tox; R.oy = toy; eb = fitBox(F, q.s.x + tox, q.headY + toy, sz); ST.glideCuts = (ST.glideCuts || 0) + 1; }   // finish the glide as a crossfade
        R.slot = b.slot; R.tox = tox; R.toy = toy; R.w = sz.w; R.h = sz.h;
        taken.push(eb); shown++;
      }
      PC.others = null;
    }
    // a relocation that cannot glide is a crossfade: the old place fades out (a 'ghost', drawn under the plates, not reserved)
    // while the plate fades in at the new place, both over XFADE ms. Never a one-frame jump.
    // forced moves pay the same cost for heading back to the slot just left (no down-and-back within the dwell)
    function backCost(R, L) { if (R.left && R.left.t < RETURN_MS) { for (var c = 0; c < L.length; c++) if (L[c].slot === R.left.slot) L[c].cost += RETURN_COST * 2; L.sort(function (a, b) { return a.cost - b.cost || a.slot - b.slot; }); } return L; }
    // leave without a new place: only the old half of a crossfade (an unreserved ghost fading out under the plates)
    function fadeAway(R) { R.ghostOnly = { ox: R.ox, oy: R.oy, w: R.w, h: R.h, slot: R.slot, t: 0 }; R.ghost = null; R.ease = null; R.vis = 'hidden'; R.vt = 0; R.forced = 1; ST.cuts = (ST.cuts || 0) + 1; }
    function xfade(R) { R.ghost = { ox: R.ox, oy: R.oy, w: R.w, h: R.h, slot: R.slot, t: 0 }; R.xf = 0; R.xfT = 0; }
    function visAlpha(R) { if (!R || !R.vis) return 1; if (R.vis === 'in') return clamp(R.vt / FADE_IN, 0, 1); if (R.vis === 'out') return clamp(1 - R.vt / FADE_OUT, 0, 1); return R.vis === 'shown' ? 1 : 0; }
    function platesLayout(F, taken) {
      var out = [], hidden = [], ghosts = [], u = F.u, v = F.view, PC = plateCtx(F), i, q, R, best, box, pl, below;
      F.units.forEach(function (q2) { var R2 = recs[q2.id]; if (R2 && R2.ghostOnly && q2.s && R2.w) { var gb = fitBox(F, q2.s.x + R2.ghostOnly.ox, q2.headY + R2.ghostOnly.oy, { w: R2.w, h: R2.h });
        ghosts.push({ id: q2.id, x: gb.x, y: gb.y, w: R2.w, h: R2.h, slot: R2.ghostOnly.slot, ax: q2.s.x, ay: q2.headY, sz: plateSize(F, q2), q: q2, alpha: clamp(1 - R2.ghostOnly.t / XFADE, 0, 1), leader: false }); } });
      var push = function (q, R, best, sz, via) {
        below = DIRTRY[best.slot] && DIRTRY[best.slot][1] === 'below';
        var va = visAlpha(R), xa = R && R.ghost ? clamp(R.xf / XFADE, 0, 1) : 1;
        pl = { id: q.id, x: best.x, y: best.y, w: sz.w, h: sz.h, slot: best.slot, via: via, ax: q.s.x, ay: below ? q.s.y + q.ry : q.headY, sz: sz, q: q, alpha: va * xa, vis: R && R.vis };
        if (R && R.ghost) { var gb = fitBox(F, q.s.x + R.ghost.ox, q.headY + R.ghost.oy, sz); pl.ghost = { x: gb.x, y: gb.y, w: sz.w, h: sz.h, slot: R.ghost.slot, alpha: va * clamp(1 - R.ghost.t / XFADE, 0, 1) }; }
        pl.leader = P.leader !== 'off' && (best.slot !== 0 || Math.abs(pl.x + pl.w / 2 - pl.ax) > pl.w / 2 - 2 * u || (below ? pl.y < pl.ay : pl.y + pl.h > pl.ay));
        taken.push(pl); out.push(pl);
      };
      // fading-out plates first: they keep their box (HUD rects still win)
      for (i = 0; i < PC.list.length; i++) {
        q = PC.list[i]; R = recs[q.id]; if (!R || R.vis !== 'out' || offView(F, q)) continue;
        var sz0 = plateSize(F, q); box = curBox(F, q, R); box.w = sz0.w; box.h = sz0.h;
        var bad = false; for (var j = 0; j < F.safe.length; j++) if (hit(box, F.safe[j], 0)) bad = true;
        for (j = 0; j < taken.length; j++) if (hit(box, taken[j], 0)) bad = true;
        if (!bad) push(q, R, { x: box.x, y: box.y, slot: R.slot }, sz0, 'fading');
      }
      for (i = 0; i < PC.list.length; i++) {
        q = PC.list[i]; R = recs[q.id]; if (R && R.vis === 'out') continue;
        if (offView(F, q)) { hidden.push({ id: q.id, what: 'plate', why: 'offscreen' }); ST.offscreen++; continue; }
        var sz = plateSize(F, q); best = null;
        if (R && R.vis === 'hidden') { if (q.want || R.vt < 250) hidden.push({ id: q.id, what: 'plate', why: R.forced && R.vt < 250 ? 'forced' : R.vt < MIN_HIDE ? 'resting' : 'crowded' }); continue; }
        if (R && R.vis && R.ox != null) {
          box = fitBox(F, q.s.x + R.ox, q.headY + R.oy, sz);                         // the position from update()
          var glv = 2;   // at draw only plates, the HUD and the view edge can drop a plate update() placed (sprites may have moved after it)
          if (boxCost(F, PC, q, box, taken, glv) != null) best = { x: box.x, y: box.y, slot: R.slot, via: 'eased' };
          // the game moved things after update(): a nudge of a few px keeps the plate in place instead of a jump
          for (var nd = 0; !best && nd < NUDGE.length; nd++) { var nb = fitBox(F, box.x + NUDGE[nd][0] * u, box.y + NUDGE[nd][1] * u, sz); if (boxCost(F, PC, q, nb, taken, glv) != null) best = { x: nb.x, y: nb.y, slot: R.slot, via: 'nudged' }; }
          if (!best) { hidden.push({ id: q.id, what: 'plate', why: 'crowded' }); ST.crowded++; continue; }
          push(q, R, best, sz, best.via); continue;
        }
        if (!q.want) continue;
        best = solve(F, PC, q, sz, taken, null);                                       // update() has not run yet (first frame)
        if (!best) { hidden.push({ id: q.id, what: 'plate', why: 'crowded' }); ST.crowded++; continue; }
        push(q, R, best, sz, 'fresh');
      }
      return { plates: out, hidden: hidden, ghosts: ghosts };
    }
    function drawPlate(F, pl) {
      var g = F.ctx, u = F.u, q = pl.q, sz = pl.sz, R = recs[q.id], col = teamCol(q), x = pl.x, y = pl.y, w = pl.w, h = pl.h;
      var nameCol = q.boss ? '#ffe2c8' : C['name' + q.team.charAt(0).toUpperCase() + q.team.slice(1)] || C.text;
      g.save(); g.globalAlpha = clamp(pl.alpha, 0, 1);
      if (pl.leader) {   // a thin line from the plate to the head (or the feet for a plate below)
        var lx0 = clamp(pl.ax, x + 2 * u, x + w - 2 * u), ly0 = pl.ay < y ? y : y + h;
        if (F.crisp) { var B0 = batch(), n = Math.max(Math.abs(pl.ax - lx0), Math.abs(pl.ay - ly0)); for (var s = 0; s <= n; s += 1) { var t = n ? s / n : 0; B0.px(s % 2 ? C.ink : col, Math.round(lx0 + (pl.ax - lx0) * t), Math.round(ly0 + (pl.ay - ly0) * t), 1, 1); } B0.flush(g); }
        else { g.strokeStyle = C.ink; g.lineWidth = 3 * u; g.beginPath(); g.moveTo(lx0, ly0); g.lineTo(pl.ax, pl.ay); g.stroke(); g.strokeStyle = col; g.lineWidth = 1.2 * u; g.stroke(); }
      }
      if (F.crisp) {
        var B = batch();
        B.px(C.ink, x + 1, y, w - 2, 1); B.px(C.ink, x + 1, y + h - 1, w - 2, 1); B.px(C.ink, x, y + 1, 1, h - 2); B.px(C.ink, x + w - 1, y + 1, 1, h - 2);
        B.px('#21162e', x + 1, y + 1, w - 2, h - 2); B.px(C.panelHi, x + 1, y + 1, w - 2, 1); B.px(col, x + 1, y + 1, 1, h - 2);
        if (!pl.leader && pl.slot === 0) { var nx = Math.round(clamp(pl.ax, x + 3, x + w - 4)); B.px(C.ink, nx - 1, y + h, 3, 1); B.px('#21162e', nx, y + h - 1, 1, 1); B.px(C.ink, nx, y + h + 1, 1, 1); }
        var tx = x + 3 * u;
        if (sz.lv) { var bw0 = sz.lw - 3 * u; B.px(col, tx - u, y + 2 * u, bw0, 5 * u); B.px(col, tx, y + u, bw0 - 2 * u, 7 * u); B.flush(g); drawText(F, sz.lv, tx, y + 2 * u, '#1a1024', null, true); tx += sz.lw; }
        B.flush(g);
        if (sz.name) drawText(F, sz.name, tx, y + 2 * u, nameCol);
        if (sz.bar) {
          var B2 = batch(), by = y + h - 3 * u - 0, bx = x + 2 * u, bw = w - 4 * u, f = q.hp, lag = R ? Math.max(f, R.lag) : f;
          B2.px(C.ink, bx, by, bw, 2 * u); var fw = Math.round(bw * f), lw2 = Math.round(bw * lag);
          if (lw2 > fw) B2.px(C.loss, bx + fw, by, lw2 - fw, 2 * u);
          if (fw > 0) { var hc = f <= P.lowHp && Math.floor(clock / 220) % 2 === 0 ? C.low : q.team === 'enemy' ? C.enemy : C.ally; B2.px(hc, bx, by, fw, 2 * u); B2.px('rgba(255,255,255,0.35)', bx, by, fw, u); }
          B2.flush(g);
        }
      } else {
        var r = 4 * u, i0 = 0.9 * u, X0 = x + i0, Y0 = y + i0, X1 = x + w - i0, Y1 = y + h - i0;   // the stroke stays inside the box
        g.beginPath(); g.moveTo(X0 + r, Y0); g.arcTo(X1, Y0, X1, Y1, r); g.arcTo(X1, Y1, X0, Y1, r); g.arcTo(X0, Y1, X0, Y0, r); g.arcTo(X0, Y0, X1, Y0, r); g.closePath();
        g.fillStyle = 'rgba(22,15,32,0.84)'; g.fill(); g.lineWidth = 1.5 * u; g.strokeStyle = 'rgba(8,4,14,0.9)'; g.stroke();
        g.save(); g.clip(); g.fillStyle = col; g.fillRect(x, y, 2.5 * u, h); g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x, y, w, h * 0.45); g.restore();
        if (!pl.leader && pl.slot === 0) { var nx2 = clamp(pl.ax, x + 6 * u, x + w - 6 * u); g.beginPath(); g.moveTo(nx2 - 4 * u, y + h); g.lineTo(nx2, y + h + 4 * u); g.lineTo(nx2 + 4 * u, y + h); g.closePath(); g.fillStyle = 'rgba(22,15,32,0.84)'; g.fill(); }
        var tx2 = x + 6 * u;
        if (sz.lv) {   // level badge: a team-coloured rounded tag with the number in bold ink
          g.font = '800 ' + (8.5 * u).toFixed(1) + 'px system-ui, sans-serif'; var lvw = Math.max(9 * u, g.measureText(sz.lv).width + 5 * u), lx = tx2 - 2 * u, ly = y + 2.5 * u, lhh = 10 * u, lr = 3 * u;
          g.beginPath(); g.moveTo(lx + lr, ly); g.arcTo(lx + lvw, ly, lx + lvw, ly + lhh, lr); g.arcTo(lx + lvw, ly + lhh, lx, ly + lhh, lr); g.arcTo(lx, ly + lhh, lx, ly, lr); g.arcTo(lx, ly, lx + lvw, ly, lr); g.closePath();
          g.fillStyle = col; g.fill(); g.lineWidth = 1.2 * u; g.strokeStyle = 'rgba(8,4,14,0.9)'; g.stroke();
          g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#1a1024'; g.fillText(sz.lv, lx + lvw / 2, ly + 8 * u); g.textAlign = 'left'; tx2 = lx + lvw + 4 * u; }
        if (sz.name) drawText(F, sz.name, tx2, y + 3.5 * u, nameCol);
        if (sz.bar) {
          var by2 = y + h - 6 * u, bx2 = x + 5 * u, bw2 = w - 10 * u, f2 = q.hp, lag2 = Rs2(R, f2);
          g.fillStyle = 'rgba(8,4,14,0.9)'; g.fillRect(bx2 - u, by2 - u, bw2 + 2 * u, 3.5 * u + 2 * u);
          if (lag2 > f2) { g.fillStyle = C.loss; g.fillRect(bx2 + bw2 * f2, by2, bw2 * (lag2 - f2), 3.5 * u); }
          if (f2 > 0) { var gg = g.createLinearGradient(0, by2, 0, by2 + 3.5 * u), hc2 = f2 <= P.lowHp && Math.floor(clock / 220) % 2 === 0 ? C.low : q.team === 'enemy' ? C.enemy : C.ally; gg.addColorStop(0, '#ffffff'); gg.addColorStop(0.35, hc2); gg.addColorStop(1, hc2); g.fillStyle = gg; g.fillRect(bx2, by2, bw2 * f2, 3.5 * u); }
        }
      }
      g.restore();
    }
    function Rs2(R, f) { return R ? Math.max(f, R.lag) : f; }

    /* ---------- the passes ---------- */
    function drawGround(ctx) {
      if (!ctx) return null;
      try {
        var F = frame(ctx); if (!F) return null;
        ctx.save(); var rings = drawRings(F); drawPings(F, targetsNow()); ctx.restore();
        groundTok = drawSeq; ST.groundDraws++; lastGround = rings;
        return rings;
      } catch (e) { ST.errors++; warn('ground', 'drawGround() failed: ' + e.message); try { ctx.restore(); } catch (e2) { } return null; }
    }
    function draw(ctx) {
      if (!ctx) return null;
      var grounded = groundTok === drawSeq; drawSeq++;
      try {
        var F = frame(ctx); if (!F) return null;
        ST.draws++;
        ctx.save();
        var rings = null;
        if (!grounded) { rings = drawRings(F); drawPings(F, targetsNow()); ST.ringsInDraw++; }
        var targets = targetsNow(), taken = [];
        var Pl = platesLayout(F, taken), A = arrowsLayout(F, targets, taken), Mk = markersLayout(F, targets, taken);
        Pl.ghosts.forEach(function (gp) { if (gp.alpha > 0.01) drawPlate(F, gp); });
        Pl.plates.forEach(function (pl) { if (pl.ghost && pl.ghost.alpha > 0.01) drawPlate(F, { id: pl.id, x: pl.ghost.x, y: pl.ghost.y, w: pl.w, h: pl.h, slot: pl.ghost.slot, ax: pl.ax, ay: pl.ay, sz: pl.sz, q: pl.q, alpha: pl.ghost.alpha, leader: false }); });   // crossfade ghosts under the plates
        Pl.plates.slice().sort(function (a, b) { return a.ay - b.ay; }).forEach(function (pl) { drawPlate(F, pl); });
        Mk.markers.forEach(function (m) { drawMarker(F, m); });
        A.arrows.forEach(function (a) { drawArrow(F, a); });
        ctx.restore();
        ST.plates += Pl.plates.length; ST.arrows += A.arrows.length; ST.markers += Mk.markers.length;
        var strip = function (b) { return { x: b.x, y: b.y, w: b.w, h: b.h }; };
        lastRec = { t: Math.round(clock), crisp: F.crisp, u: F.u, view: F.view, camera: F.M.cam, safe: F.safe, groundPass: grounded,
          rings: (grounded ? lastGround : rings) || [],
          plates: Pl.plates.map(function (p) { return { id: p.id, x: p.x, y: p.y, w: p.w, h: p.h, slot: p.slot, via: p.via, unit: { x: p.q.s.x, y: p.q.headY }, leader: !!p.leader, anchor: { x: p.ax, y: p.ay }, alpha: Math.round(p.alpha * 100) / 100, vis: p.vis, ghost: p.ghost ? { x: p.ghost.x, y: p.ghost.y, alpha: Math.round(p.ghost.alpha * 100) / 100 } : null, name: p.sz.name }; }),
          arrows: A.arrows.map(function (a) { return { id: a.id, kind: a.kind, x: a.x, y: a.y, r: a.r + a.len, rad: a.r, angle: a.angle, tip: a.tip, target: a.target, box: strip(a.box), inset: a.inset, dist: a.dist, label: a.label ? strip(a.label.box) : null }; }),
          fading: Pl.ghosts.map(function (g) { return { id: g.id, x: g.x, y: g.y, w: g.w, h: g.h, alpha: Math.round(g.alpha * 100) / 100 }; }),
          markers: Mk.markers.map(function (m) { return { id: m.id, kind: m.kind, x: m.x, y: m.y, box: strip(m.box), target: m.target, dist: m.dist }; }),
          hidden: A.hidden.concat(Mk.hidden, Pl.hidden) };
        return lastRec;
      } catch (e) { ST.errors++; warn('draw', 'draw() failed: ' + e.message); try { ctx.restore(); } catch (e2) { } return null; }
    }

    function rects() { if (!lastRec) return []; var out = []; lastRec.plates.forEach(function (p) { out.push({ x: p.x, y: p.y, w: p.w, h: p.h, kind: 'plate', id: p.id }); });
      lastRec.arrows.forEach(function (a) { out.push({ x: a.box.x, y: a.box.y, w: a.box.w, h: a.box.h, kind: 'arrow', id: a.id }); if (a.label) out.push({ x: a.label.x, y: a.label.y, w: a.label.w, h: a.label.h, kind: 'label', id: a.id }); });
      lastRec.markers.forEach(function (m) { out.push({ x: m.box.x, y: m.box.y, w: m.box.w, h: m.box.h, kind: 'marker', id: m.id }); }); return out; }
    function state() {
      var r = {}; for (var id in recs) r[id] = { hp: Math.round(recs[id].f * 1000) / 1000, lag: Math.round(recs[id].lag * 1000) / 1000, alpha: Math.round(recs[id].a * 100) / 100 };
      return { version: VERSION, t: Math.round(clock), params: params(), units: r, focus: focusId, drawn: lastRec };
    }
    function params() { var c = {}; for (var k in P) c[k] = P[k]; return c; }

    return {
      version: VERSION, update: update, draw: draw, drawGround: function (ctx) { return drawGround(ctx); },
      setFocus: function (id) { focusId = id == null ? null : String(id); }, focus: function () { return focusId; },
      reset: function () { recs = {}; clock = 0; lastRec = null; lastGround = null; },
      rects: rects, lastDrawn: function () { return lastRec; }, state: state, stats: function () { var c = {}; for (var k in ST) c[k] = ST[k]; return c; },
      setParams: function (p) { setParams(p); }, params: params,
      toScreen: function (x, y) { var v = lastView || viewOf(null); if (!v) return null; return mapper(v).f(x, y); }
    };
  }

  root.GameDNA_WorldHud = { version: VERSION, create: create, textWidth: textW };
})(typeof window !== 'undefined' ? window : this);
