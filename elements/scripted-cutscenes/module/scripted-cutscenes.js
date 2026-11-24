/* GameDNA H-04 - Scripted cutscenes (scripted-cutscenes) - module v1.2.0 (plain script, no dependencies, one global)
 *
 *   const cs = GameDNA_Cutscenes.create({
 *     view: { x: 0, y: 0, w: 640, h: 360 },          // screen rect in the coordinates draw() gets (bars span it)
 *     stage: { x: 0, y: 0, w: 640, h: 360 },         // where the world shows inside view (default: view)
 *     worldView: { w: 640, h: 360 },                 // world px the stage shows at zoom 1 (default: stage size)
 *     world: { x: 0, y: 0, w: MAP_W, h: MAP_H },     // map bounds: the camera never shows outside them
 *     camera: () => ({ x: camX, y: camY }),          // where the game's camera is / would be NOW (top-left, world px)
 *     actors: { hero: { get: () => ({ x, y, face }), set: pose => {...}, name: 'Hero', h: 16 } },
 *     dialogue: { open(name, text, done, id), isOpen(), close() },   // optional: the game's own dialogue box
 *     onStart, onEnd, onCall, onCue,                 // lock / unlock control, game-state changes, sound hooks
 *     cssScale: () => CSS px per draw unit,          // keeps text >= 10 CSS px on phones
 *     auto: () => autoplayOn,                        // lines advance by themselves
 *     params: { bars: 0.11, skip: 'hold', ... }
 *   });
 *   cs.play([ { move: 'guard', to: [x, y] }, { face: 'hero', to: 'guard' }, { say: 'guard', text: 'Halt!', to: 'hero' },
 *             { cam: 'gate', zoom: 1, ms: 900 }, { emote: 'hero', icon: '!' }, { call: 'openGate' }, { wait: 400 },
 *             { fade: 'out', ms: 300 }, { fade: 'in' }, { cue: 'thud' }, { all: [ ...commands run together ] } ], { id: 'gate', once: true });
 *   cs.update(stepMs)            every fixed step, every scene (also the ?t= replay)
 *   cs.camera()                  -> { x, y, zoom } while it drives the camera, else null (use your own)
 *   cs.pose(id)                  -> { x, y, face, angle, moving, walk, frame } for drawing the actor
 *   cs.input('ok') / cs.input('skip', isDown)   -> true when consumed
 *   cs.draw(ctx)                 after the world (and instead of the HUD while cs.cinematic()), screen coordinates
 *
 * Commands run in order; {all: [...]} runs several together and waits for all. Moves walk along waypoints (routed around
 * solid tiles when solid() and tile are given) at a steady speed; every moving actor faces its path, walk frames advance
 * with the distance walked (pose.frame, pose.walk). Skip (hold or press) fades to black, applies every remaining
 * command's end state (positions, facings, calls) exactly as playing through would, and fades back: control is restored
 * exactly once (onEnd). The camera glides back to the game's camera before control returns and is clamped to the world.
 * Letterbox bars slide in and out. Lines use the game's dialogue when given, else a built-in box (typewriter, speaker
 * plate, a tail toward the speaker, crisp bitmap font on pixel canvases, >= 10 CSS px). draw() never changes state.
 * Never throws from update / draw / input. Deterministic: no random numbers. ASCII only.
 */
(function (root) {
  'use strict';
  var VERSION = '1.2.0';
  var DEFAULTS = { bars: 0.09, barMs: 450, skip: 'hold', holdMs: 700, textSpeed: 42, lineHold: 900, speed: 60, stride: 6, frames: 2,
    returnMs: 650, camMs: 900, fadeMs: 400, emoteMs: 1100, render: 'auto', snap: 'auto', textSize: 15, box: 'auto', theme: 'night',
    skipKey: 'X', okKey: 'Z', pageChars: 96, hideHud: 'on', compact: 'auto', emotes: 'auto', pxFont: 1, runStride: 0 };
  var FAMILY = '"Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  var DIRS = ['right', 'down', 'left', 'up'];

  /* ---------- bitmap font for the crisp mode ('#' = ink; rows top -> bottom; shared design with C-03 / H-03) ---------- */
  var REG = {
    '!': '# # # # # . #', '"': '#.# #.#', '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.', '%': '##... ##..# ...#. ..#.. .#... #..## ...##',
    '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#', "'": '# #', '(': '..# .#. #.. #.. #.. .#. ..#', ')': '#.. .#. ..# ..# ..# .#. #..',
    '*': '..... ..#.. #.#.# .###. #.#.# ..#..', '+': '..... ..#.. ..#.. ##### ..#.. ..#..', ',': '.. .. .. .. .. ## .# #.', '-': '.... .... .... ####',
    '.': '.. .. .. .. .. ## ##', '/': '....# ...#. ...#. ..#.. .#... .#... #....',
    '0': '.###. #...# #..## #.#.# ##..# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.', '2': '.###. #...# ....# ...#. ..#.. .#... #####',
    '3': '####. ....# ....# .###. ....# ....# ####.', '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.', '5': '##### #.... ####. ....# ....# #...# .###.',
    '6': '..##. .#... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. .#... .#... .#...', '8': '.###. #...# #...# .###. #...# #...# .###.',
    '9': '.###. #...# #...# .#### ....# ...#. .##..', ':': '.. ## ## .. .. ## ##', ';': '.. ## ## .. .. ## .# #.', '<': '...# ..#. .#.. #... .#.. ..#. ...#',
    '=': '.... .... #### .... ####', '>': '#... .#.. ..#. ...# ..#. .#.. #...', '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
    'A': '.###. #...# #...# ##### #...# #...# #...#', 'B': '####. #...# #...# ####. #...# #...# ####.', 'C': '.###. #...# #.... #.... #.... #...# .###.',
    'D': '###.. #..#. #...# #...# #...# #..#. ###..', 'E': '##### #.... #.... ####. #.... #.... #####', 'F': '##### #.... #.... ####. #.... #.... #....',
    'G': '.###. #...# #.... #.### #...# #...# .####', 'H': '#...# #...# #...# ##### #...# #...# #...#', 'I': '### .#. .#. .#. .#. .#. ###',
    'J': '..### ...#. ...#. ...#. #..#. #..#. .##..', 'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#', 'L': '#... #... #... #... #... #... ####',
    'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#', 'N': '#...# ##..# #.#.# #..## #...# #...# #...#', 'O': '.###. #...# #...# #...# #...# #...# .###.',
    'P': '####. #...# #...# ####. #.... #.... #....', 'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#', 'R': '####. #...# #...# ####. #.#.. #..#. #...#',
    'S': '.#### #.... #.... .###. ....# ....# ####.', 'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..', 'U': '#...# #...# #...# #...# #...# #...# .###.',
    'V': '#...# #...# #...# #...# #...# .#.#. ..#..', 'W': '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.', 'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', 'Z': '##### ....# ...#. ..#.. .#... #.... #####', '[': '### #.. #.. #.. #.. #.. ###', ']': '### ..# ..# ..# ..# ..# ###',
    'a': '.... .... .##. ...# .### #..# .###', 'b': '#... #... ###. #..# #..# #..# ###.', 'c': '.... .... .### #... #... #... .###', 'd': '...# ...# .### #..# #..# #..# .###',
    'e': '.... .... .##. #..# #### #... .###', 'f': '..## .#.. #### .#.. .#.. .#.. .#..', 'g': '.... .... .### #..# #..# .### ...# ###.', 'h': '#... #... ###. #..# #..# #..# #..#',
    'i': '# . # # # # #', 'j': '..# ... .## ..# ..# ..# ..# ##.', 'k': '#... #... #..# #.#. ##.. #.#. #..#', 'l': '#. #. #. #. #. #. .#',
    'm': '..... ..... ##.#. #.#.# #.#.# #.#.# #.#.#', 'n': '.... .... ###. #..# #..# #..# #..#', 'o': '.... .... .##. #..# #..# #..# .##.',
    'p': '.... .... ###. #..# #..# ###. #... #...', 'q': '.... .... .### #..# #..# .### ...# ...#', 'r': '.... .... #.## ##.. #... #... #...',
    's': '.... .... .### #... .##. ...# ###.', 't': '.#. .#. ### .#. .#. .#. ..#', 'u': '.... .... #..# #..# #..# #..# .###', 'v': '..... ..... #...# #...# .#.#. .#.#. ..#..',
    'w': '..... ..... #...# #...# #.#.# #.#.# .#.#.', 'x': '..... ..... #...# .#.#. ..#.. .#.#. #...#', 'y': '.... .... #..# #..# #..# .### ...# ###.',
    'z': '.... .... #### ...# .##. #... ####', '~': '..... ..... .#... #.#.# ...#.', '|': '# # # # # # # #'
  };
  var FONT = null;
  function pfont() {
    if (FONT) return FONT;
    var g = {};
    for (var ch in REG) { var rows = REG[ch].split(' '), w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length); g[ch] = { rows: rows, w: w }; }
    return (FONT = { g: g, h: 8, cap: 7, space: 3, lineH: 10 });
  }
  function pxWidth(s, k) {
    var F = pfont(), w = 0; s = String(s);
    for (var i = 0; i < s.length; i++) { var c = s.charAt(i), G = F.g[c]; w += (c === ' ' ? F.space : G ? G.w : 3) + 1; }
    return Math.max(0, w - 1) * k;
  }
  function pxText(g, s, x, y, k, col) {
    var F = pfont(); s = String(s); g.fillStyle = col; x = Math.round(x); y = Math.round(y);
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i), G = F.g[c];
      if (c === ' ') { x += (F.space + 1) * k; continue; }
      if (!G) { g.fillRect(x, y + 2 * k, 2 * k, 3 * k); x += 4 * k; continue; }
      for (var r = 0; r < G.rows.length; r++) { var row = G.rows[r]; for (var q = 0; q < row.length; q++) if (row.charAt(q) === '#') g.fillRect(x + q * k, y + r * k, k, k); }
      x += (G.w + 1) * k;
    }
  }

  /* ---------- pixel emote glyphs (inside an 11x10 bubble); o = outline, a = accent, l = light ---------- */
  var EMO_PX = {
    '!': ['..aa..', '..aa..', '..aa..', '..aa..', '......', '..aa..'],
    '?': ['.aaaa.', 'aa..aa', '...aa.', '..aa..', '......', '..aa..'],
    '...': ['......', '......', '......', '......', '......', 'a.a.a.'],
    heart: ['.a..a.', 'aaaaaa', 'alaaaa', '.aaaa.', '..aa..', '......'],
    note: ['...aaa', '...a.a', '...a.a', '.aaa.a', 'aaaa..', '.aa...'],
    anger: ['.a..a.', 'aa..aa', '......', '......', 'aa..aa', '.a..a.'],
    idea: ['.aaaa.', 'alaaaa', 'aaaaaa', '.aaaa.', '..oo..', '..oo..'],
    sweat: ['..a...', '.aa...', 'aala..', 'aaaa..', '.aa...', '......']
  };
  var EMO_COL = { '!': '#ff6a3c', '?': '#4a9cff', '...': '#5c5470', heart: '#ff4f7a', note: '#8a62e8', anger: '#ff3a3a', idea: '#ffc23a', sweat: '#5ab8ff' };

  var THEMES = {
    night: { box: 'rgba(14,12,24,0.90)', box2: 'rgba(26,22,42,0.92)', edge: 'rgba(255,240,214,0.16)', rim: 'rgba(0,0,0,0.55)', text: '#f2ecfa',
      name: '#ffd27a', plate: 'rgba(52,40,30,0.96)', plateEdge: 'rgba(255,214,140,0.55)', dim: '#a59cbc', bar: '#000000',
      px: { box: '#140f22', edge: '#5a4e78', rim: '#05030a', text: '#f2ecfa', name: '#ffd27a', plate: '#3a2a1e', plateEdge: '#c89a5a', dim: '#8e84aa', shade: '#1f1834' } },
    parchment: { box: 'rgba(246,234,206,0.96)', box2: 'rgba(230,212,172,0.96)', edge: 'rgba(255,255,255,0.7)', rim: 'rgba(80,50,20,0.6)', text: '#3a2614',
      name: '#fff3d6', plate: 'rgba(122,62,24,0.97)', plateEdge: 'rgba(255,220,160,0.6)', dim: '#8a6e50', bar: '#000000',
      px: { box: '#f0dfb8', edge: '#fff6dc', rim: '#3a2210', text: '#3a2614', name: '#fff3d6', plate: '#7a3e18', plateEdge: '#d8a060', dim: '#94785a', shade: '#d8bf8a' } }
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return v == null || v === '' || !isFinite(+v) ? d : +v; }
  function easeIO(u) { u = clamp(u, 0, 1); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function easeOut(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u) * (1 - u); }
  function rectOf(r) {
    if (!r) return null;
    var x = +(r.x != null ? r.x : r[0]), y = +(r.y != null ? r.y : r[1]), w = +(r.w != null ? r.w : r.width != null ? r.width : r[2]), h = +(r.h != null ? r.h : r.height != null ? r.height : r[3]);
    return isFinite(x) && isFinite(y) && w > 0 && h > 0 ? { x: x, y: y, w: w, h: h } : null;
  }
  function ptOf(p) {
    if (p == null) return null;
    if (Array.isArray(p)) return isFinite(+p[0]) && isFinite(+p[1]) ? { x: +p[0], y: +p[1] } : null;
    if (typeof p === 'object' && isFinite(+p.x) && isFinite(+p.y)) return { x: +p.x, y: +p.y };
    return null;
  }
  function dirOfVec(dx, dy) { return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up'); }
  function dirOfAngle(a) { return dirOfVec(Math.cos(a), Math.sin(a)); }
  function angleOfDir(d) { return d === 'right' ? 0 : d === 'down' ? Math.PI / 2 : d === 'left' ? Math.PI : d === 'up' ? -Math.PI / 2 : null; }
  function call(fn, a, b, c, d) { if (typeof fn !== 'function') return undefined; try { return fn(a, b, c, d); } catch (e) { STATS_ERR.n++; return undefined; } }
  var STATS_ERR = { n: 0 };
  function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  /* the script's words: a page split that never depends on the viewport (so timing is the same at any size) */
  function pages(text, maxChars) {
    var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim(); if (!s) return [''];
    if (s.length <= maxChars) return [s];
    var out = [], cur = '', parts = s.match(/[^.!?]+[.!?]*\s*/g) || [s];
    parts.forEach(function (p) {
      p = p.trim(); if (!p) return;
      if (!cur) cur = p; else if ((cur + ' ' + p).length <= maxChars) cur += ' ' + p; else { out.push(cur); cur = p; }
      while (cur.length > maxChars) { var cut = cur.lastIndexOf(' ', maxChars); if (cut < maxChars * 0.5) cut = maxChars; out.push(cur.slice(0, cut).trim()); cur = cur.slice(cut).trim(); }
    });
    if (cur) out.push(cur);
    return out;
  }
  /* reveal time (ms) of each char: steady speed, short beats after punctuation */
  function revealTimes(s, cps) {
    var t = 0, out = [], per = 1000 / Math.max(5, cps);
    for (var i = 0; i < s.length; i++) { out.push(t); var c = s.charAt(i); t += per; if ((c === '.' || c === '!' || c === '?') && s.charAt(i + 1) === ' ') t += 160; else if (c === ',' || c === ';' || c === ':') t += 70; }
    out.push(t);
    return out;
  }

  function create(opt) {
    opt = opt || {};
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    function setParams(o) { o = o || {}; for (var key in o) if (key in DEFAULTS && o[key] != null && o[key] !== '') P[key] = typeof DEFAULTS[key] === 'number' ? num(o[key], DEFAULTS[key]) : String(o[key]); if (!THEMES[P.theme]) P.theme = 'night'; }
    setParams(opt.params);
    var SK = null; try { SK = root.GameDNA_Skin && opt.skin != null && opt.skin !== false ? root.GameDNA_Skin.resolve(opt.skin) : null; } catch (e) { SK = null; }

    var ACT = {};          // id -> {spec, pose, touched}
    var stats = { plays: 0, ends: 0, skips: 0, calls: 0, cues: 0, lines: 0, hostLines: 0, moves: 0, errors: 0, refused: 0, camClamped: 0 };
    var S = null;          // the running cutscene, or null
    var seen = {};
    var last = null;       // lastDrawn()
    var lastEnd = null;

    function V(r) { var v = typeof r === 'function' ? call(r) : r; return rectOf(v); }
    function view() { return V(opt.view) || { x: 0, y: 0, w: 640, h: 360 }; }
    function stage() { return V(opt.stage) || view(); }
    function worldView() { var st = stage(), wv = typeof opt.worldView === 'function' ? call(opt.worldView) : opt.worldView; return { w: num(wv && wv.w, st.w), h: num(wv && wv.h, st.h) }; }
    function world() { return V(opt.world); }
    function crisp() { return P.render === 'pixel' || (P.render === 'auto' && view().w <= 512); }
    function snapOn() { return P.snap === 'auto' ? crisp() : P.snap === 'on' || P.snap === '1'; }
    function cssScale() { var s = typeof opt.cssScale === 'function' ? call(opt.cssScale) : opt.cssScale; s = num(s, 1); return s > 0.05 ? s : 1; }
    function isAuto() { var a = typeof opt.auto === 'function' ? call(opt.auto) : opt.auto; return !!a; }

    /* ---------- actors ---------- */
    function actor(id, spec) { if (spec) { ACT[id] = { spec: spec, pose: null, touched: false }; return true; } return ACT[id] || null; }
    if (opt.actors) for (k in opt.actors) actor(k, opt.actors[k]);
    function readPose(id) {
      var A = ACT[id]; if (!A) return null;
      if (A.pose && S) return A.pose;
      var g = call(A.spec.get); if (!g || !isFinite(+g.x) || !isFinite(+g.y)) return A.pose;
      var face = g.face, ang = typeof face === 'number' ? face : angleOfDir(face); if (ang == null) ang = Math.PI / 2;
      A.pose = { id: id, x: +g.x, y: +g.y, angle: ang, face: dirOfAngle(ang), moving: false, walk: num(g.walk, 0), frame: 0, target: null };
      return A.pose;
    }
    function frames(A) { return Math.max(1, Math.round(num(A.spec.frames, P.frames))); }
    function stride(A, run) { var s0 = Math.max(0.5, num(A.spec.stride, P.stride)); return run ? Math.max(0.5, num(A.spec.runStride, P.runStride > 0 ? P.runStride : s0 * 1.6)) : s0; }
    function push(id) { var A = ACT[id]; if (!A || !A.pose) return; A.touched = true; call(A.spec.set, poseOut(A.pose)); }
    function poseOut(p) { return { id: p.id, x: p.x, y: p.y, face: p.face, angle: p.angle, moving: p.moving, run: !!p.run, walk: p.walk, frame: p.frame, target: p.target }; }
    function faceTo(p, tx, ty) { var dx = tx - p.x, dy = ty - p.y; if (Math.abs(dx) + Math.abs(dy) < 1e-6) return; p.angle = Math.atan2(dy, dx); p.face = dirOfVec(dx, dy); }
    function resolvePoint(spec, from) {   // a point in world px: [x, y], {x, y}, an actor id, or {by: [dx, dy]} relative to `from`
      if (typeof spec === 'string') { var q = readPose(spec); return q ? { x: q.x, y: q.y } : null; }
      if (spec && spec.by) { var b = ptOf(spec.by); return b && from ? { x: from.x + b.x, y: from.y + b.y } : null; }
      return ptOf(spec);
    }

    /* ---------- routing (only when solid() and tile are given and the straight line is blocked) ---------- */
    function solidAt(x, y) { return typeof opt.solid === 'function' ? !!call(opt.solid, x, y) : false; }
    function clearLine(a, b) {
      var n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
      for (var i = 1; i <= n; i++) if (solidAt(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n)) return false;
      return true;
    }
    function route(a, b) {
      var T = num(opt.tile, 0); if (!T || typeof opt.solid !== 'function' || clearLine(a, b)) return [b];
      var W = world() || { x: 0, y: 0, w: 4096, h: 4096 }, c0 = Math.floor(a.x / T), r0 = Math.floor(a.y / T), c1 = Math.floor(b.x / T), r1 = Math.floor(b.y / T);
      var key = function (c, r) { return c + ',' + r; }, prev = {}, q = [[c0, r0]], lim = 6000; prev[key(c0, r0)] = null;
      var ok = function (c, r) { return c * T >= W.x - T && r * T >= W.y - T && c * T < W.x + W.w + T && r * T < W.y + W.h + T && (!solidAt(c * T + T / 2, r * T + T / 2) || (c === c1 && r === r1)); };
      while (q.length && lim-- > 0) {
        var cur = q.shift();
        if (cur[0] === c1 && cur[1] === r1) break;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var n = [cur[0] + d[0], cur[1] + d[1]], kk = key(n[0], n[1]); if (!(kk in prev) && ok(n[0], n[1])) { prev[kk] = cur; q.push(n); } });
      }
      if (!(key(c1, r1) in prev)) return [b];
      var cells = [], c = [c1, r1]; while (c) { cells.unshift(c); c = prev[key(c[0], c[1])]; }
      var pts = cells.slice(1, -1).map(function (cc) { return { x: cc[0] * T + T / 2, y: cc[1] * T + T / 2 }; }); pts.push(b);
      var out = [], from = a, i = 0;            // keep only the corners needed for a clear line
      while (i < pts.length) { var j = pts.length - 1; while (j > i && !clearLine(from, pts[j])) j--; out.push(pts[j]); from = pts[j]; i = j + 1; }
      return out;
    }

    /* ---------- camera ---------- */
    function gameCam() { var c = call(opt.camera); var wv = worldView(); return c && isFinite(+c.x) && isFinite(+c.y) ? { cx: +c.x + wv.w / 2, cy: +c.y + wv.h / 2, zoom: 1 } : null; }
    function clampCam(c) {
      var W = world(), wv = worldView(), z = Math.max(0.25, c.zoom || 1), vw = wv.w / z, vh = wv.h / z, x = c.cx - vw / 2, y = c.cy - vh / 2, x0 = x, y0 = y;
      if (W) {
        x = vw >= W.w ? W.x + (W.w - vw) / 2 : clamp(x, W.x, W.x + W.w - vw);
        y = vh >= W.h ? W.y + (W.h - vh) / 2 : clamp(y, W.y, W.y + W.h - vh);
      }
      if (snapOn()) { var q = z * (stage().w / wv.w); x = Math.round(x * q) / q; y = Math.round(y * q) / q; }
      return { x: x, y: y, zoom: z, w: vw, h: vh, clamped: Math.abs(x - x0) > 0.01 || Math.abs(y - y0) > 0.01 };
    }
    function camTarget(spec) {
      if (spec === 'game' || spec === 'release') { var g = gameCam(); return g ? { x: g.cx, y: g.cy } : null; }
      if (typeof spec === 'string') { var p = readPose(spec); if (!p) return null; var A = ACT[spec], h = num(A && A.spec.h, 16); return { x: p.x, y: p.y - h * 0.5 }; }
      if (spec && spec.between) { var a = camTarget(spec.between[0]), b = camTarget(spec.between[1]); return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a || b; }
      return ptOf(spec);
    }

    /* actors a camera command frames: its actor target, both 'between' actors, and cmd.frame ids */
    function framedIds(cmd) {
      var ids = []; var to = cmd.cam;
      if (typeof to === 'string' && to !== 'game' && to !== 'release') ids.push(to);
      if (to && to.between) to.between.forEach(function (i) { if (typeof i === 'string') ids.push(i); });
      (Array.isArray(cmd.frame) ? cmd.frame : []).forEach(function (i) { if (typeof i === 'string' && ids.indexOf(i) < 0) ids.push(i); });
      return ids.filter(function (i) { return ACT[i]; });
    }
    /* move a camera centre the least so every framed actor's sprite box sits inside the visible stage (between the bars, 2 px in) */
    function keepIn(c, ids) {
      if (!ids || !ids.length) return c;
      var st = stage(), v = view(), wv = worldView(), z = Math.max(0.25, c.zoom || 1), k = st.h / wv.h * z, bh = Math.round(v.h * barShare());
      var topIn = Math.max(0, v.y + bh - st.y) / k + 2 / k, botIn = Math.max(0, st.y + st.h - (v.y + v.h - bh)) / k + 2 / k, vw = wv.w / z, vh = wv.h / z;
      var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      ids.forEach(function (id) { var p = readPose(id); if (!p) return; var A = ACT[id], h = num(A.spec.h, 16), w = num(A.spec.w, h * 0.7); x0 = Math.min(x0, p.x - w / 2); x1 = Math.max(x1, p.x + w / 2); y0 = Math.min(y0, p.y - h); y1 = Math.max(y1, p.y + 2); });
      if (x0 > x1) return c;
      var cx = c.cx, cy = c.cy, left = cx - vw / 2, top = cy - vh / 2;
      if (x1 - x0 <= vw - 4 / k) { if (x0 < left + 2 / k) cx += x0 - (left + 2 / k); else if (x1 > left + vw - 2 / k) cx += x1 - (left + vw - 2 / k); }
      var room = vh - topIn - botIn;
      if (y1 - y0 <= room) { if (y0 < top + topIn) cy += y0 - (top + topIn); else if (y1 > top + vh - botIn) cy += y1 - (top + vh - botIn); }
      else cy = (y0 + y1) / 2 + (topIn - botIn) / 2;
      return { cx: cx, cy: cy, zoom: c.zoom };
    }

    /* ---------- the script runner ---------- */
    function norm(list) { return Array.isArray(list) ? list.filter(function (c) { return c && typeof c === 'object'; }) : []; }
    function Track(list) { return { list: norm(list), pc: 0, op: null }; }

    function begin(T, cmd, dry) {   // start a command; returns its runtime op (dry = skip: no lines, cues or emotes)
      var op = { cmd: cmd, t: 0, done: false };
      if (cmd.all) { op.kind = 'all'; op.tracks = (Array.isArray(cmd.all) ? cmd.all : []).map(function (x) { return Track(Array.isArray(x) ? x : [x]); }); return op; }
      if (cmd.move != null) {
        op.kind = 'move'; op.id = cmd.move; var p = readPose(cmd.move); if (!p) { op.done = true; return op; }
        var pts = [];
        if (Array.isArray(cmd.path)) cmd.path.forEach(function (q) { var r = resolvePoint(q, pts.length ? pts[pts.length - 1] : p); if (r) pts.push(r); });
        else { var to = cmd.by ? resolvePoint({ by: cmd.by }, p) : resolvePoint(cmd.to, p); if (to) pts = cmd.route === false ? [to] : route(p, to); }
        op.pts = pts; op.i = 0; op.speed = Math.max(1, num(cmd.speed, num(ACT[cmd.move].spec.speed, P.speed)));
        if (!pts.length) op.done = true; else stats.moves++;
        return op;
      }
      if (cmd.emote != null) {
        op.kind = 'emote'; if (dry) { op.done = true; return op; } op.ms = Math.max(200, num(cmd.ms, P.emoteMs));
        S.emotes = S.emotes.filter(function (e) { return e.id !== cmd.emote; });
        S.emotes.push({ id: cmd.emote, icon: EMO_PX[cmd.icon] ? cmd.icon : '!', t: 0, ms: op.ms });
        if (cmd.wait === false) op.done = true; return op;
      }
      if (cmd.face != null) { op.kind = 'face'; op.id = cmd.face; return op; }
      if (cmd.say !== undefined) {
        op.kind = 'say'; op.id = cmd.say; var A = cmd.say != null ? ACT[cmd.say] : null;
        op.name = cmd.name != null ? String(cmd.name) : A && A.spec.name != null ? String(A.spec.name) : cmd.say != null ? String(cmd.say) : '';
        op.pages = pages(cmd.text, Math.max(30, P.pageChars)); op.page = 0; op.pt = 0; op.rev = revealTimes(op.pages[0], P.textSpeed); op.full = false; op.hold = 0;
        if (cmd.to != null && cmd.say != null) { var sp = readPose(cmd.say), tp = resolvePoint(cmd.to, sp); if (sp && tp) { faceTo(sp, tp.x, tp.y); sp.target = typeof cmd.to === 'string' ? cmd.to : null; push(cmd.say); } }
        if (dry) { op.done = true; return op; }
        stats.lines++;
        decideSide(op);
        if (opt.dialogue && typeof opt.dialogue.open === 'function') {
          op.host = true; op.hostDone = false; op.seenOpen = false; stats.hostLines++;
          var ok = true; try { opt.dialogue.open(op.name, op.pages.join(' '), function () { op.hostDone = true; }, cmd.say); } catch (e) { stats.errors++; ok = false; }
          if (!ok) op.done = true;
        }
        return op;
      }
      if (cmd.wait != null) { op.kind = 'wait'; op.ms = Math.max(0, num(cmd.wait, 0)); return op; }
      if (cmd.cam !== undefined) {
        op.kind = 'cam'; if (!S) { op.done = true; return op; } op.ids = framedIds(cmd); S.framed = op.ids; S.camSettled = false; op.ms = Math.max(0, num(cmd.ms, P.camMs)); op.from = { cx: S.cam.cx, cy: S.cam.cy, zoom: S.cam.zoom }; op.to = cmd.cam; op.zoom = num(cmd.zoom, cmd.cam === 'game' ? 1 : S.cam.zoom);
        S.follow = null; return op;
      }
      if (cmd.fade != null) { op.kind = 'fade'; op.ms = Math.max(0, num(cmd.ms, P.fadeMs)); op.from = S.fade; op.to = cmd.fade === 'out' ? 1 : cmd.fade === 'in' ? 0 : clamp(num(cmd.fade, 0), 0, 1); if (cmd.color) S.fadeColor = String(cmd.color); return op; }
      if (cmd.cue != null) { op.kind = 'cue'; op.done = true; if (dry) return op; stats.cues++; call(opt.onCue, String(cmd.cue), cmd); return op; }
      if (cmd.call != null) { op.kind = 'call'; op.done = true; S.calls.push(String(cmd.call)); stats.calls++; call(opt.onCall, String(cmd.call), cmd.arg, cmd); return op; }
      if (cmd.bars != null) { op.kind = 'bars'; S.barsTo = cmd.bars === false ? 0 : 1; op.done = true; return op; }
      op.kind = 'none'; op.done = true; return op;
    }

    function finishMove(op) {   // end state of a move (also what skip applies): the last waypoint, facing along the last segment
      var p = readPose(op.id); if (!p || !op.pts || !op.pts.length) return;
      var last = op.pts[op.pts.length - 1], hd = op.endHeading;
      p.x = last.x; p.y = last.y; p.moving = false; p.run = false; p.frame = 0; p.target = null;
      if (hd != null) { p.angle = hd; p.face = dirOfAngle(hd); }
      var f = op.cmd.face; if (f != null) faceSpec(p, f);
      push(op.id);
    }
    function faceSpec(p, f) {
      if (typeof f === 'number') { p.angle = f; p.face = dirOfAngle(f); p.target = null; return; }
      var a = angleOfDir(f); if (a != null) { p.angle = a; p.face = f; p.target = null; return; }
      var t = resolvePoint(f, p); if (t) { faceTo(p, t.x, t.y); if (typeof f === 'string') p.target = f; }
    }
    /* heading of the last segment of a move, computed once from its waypoints (identical for play and skip) */
    function endHeading(op, p) {
      var pts = op.pts; if (!pts || !pts.length) return null;
      var b = pts[pts.length - 1], a = pts.length > 1 ? pts[pts.length - 2] : { x: p.x, y: p.y };
      if (Math.abs(b.x - a.x) + Math.abs(b.y - a.y) < 1e-6) return null;
      return Math.atan2(b.y - a.y, b.x - a.x);
    }

    function stepOp(op, dt) {   // advance one op by dt ms; returns leftover-free completion
      if (op.done) return;
      op.t += dt;
      switch (op.kind) {
        case 'all': {
          var all = true; op.tracks.forEach(function (T) { if (!runTrack(T, dt)) all = false; }); if (all) op.done = true; return;
        }
        case 'move': {
          var p = readPose(op.id); if (!p) { op.done = true; return; }
          if (op.endHeading === undefined) { op.endHeading = endHeading(op, p); p.target = null; }
          var left = op.speed * dt / 1000;
          while (left > 0 && op.i < op.pts.length) {
            var q = op.pts[op.i], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
            if (d > 1e-6) { p.angle = Math.atan2(dy, dx); p.face = dirOfVec(dx, dy); }
            if (d <= left) { p.x = q.x; p.y = q.y; p.walk += d; op.i++; left = 0; }   // a corner ends the frame's step: one heading per frame
            else { p.x += dx / d * left; p.y += dy / d * left; p.walk += left; left = 0; }
          }
          var A = ACT[op.id];
          p.moving = op.i < op.pts.length; p.run = !!op.cmd.run; p.frame = p.moving ? Math.floor(p.walk / stride(A, p.run)) % frames(A) : 0; if (!p.moving) p.run = false;
          if (!p.moving) { op.done = true; finishMove(op); return; }
          push(op.id); return;
        }
        case 'face': { var fp = readPose(op.id); if (fp) { faceSpec(fp, op.cmd.to); fp.moving = false; push(op.id); } op.done = true; return; }
        case 'say': {
          if (op.host) {
            var open = !!(opt.dialogue && typeof opt.dialogue.isOpen === 'function' ? call(opt.dialogue.isOpen) : !op.hostDone);
            if (open) op.seenOpen = true;
            if (op.hostDone || (op.seenOpen && !open) || (!open && op.t > 250)) op.done = true;
            return;
          }
          op.pt += dt; var s = op.pages[op.page], T2 = op.rev[s.length];
          if (!op.full && op.pt >= T2) op.full = true;
          if (op.full) {
            op.hold += dt;
            if (isAuto() && op.hold >= P.lineHold + Math.min(1600, s.length * 18)) nextPage(op);
          }
          return;
        }
        case 'wait': if (op.t >= op.ms) op.done = true; return;
        case 'cam': {
          var tgt = camTarget(op.to) || { x: op.from.cx, y: op.from.cy }, u = op.ms > 0 ? easeIO(op.t / op.ms) : 1;
          var kt = keepIn({ cx: tgt.x, cy: tgt.y, zoom: op.zoom }, op.ids); tgt = { x: kt.cx, y: kt.cy };
          S.cam = { cx: op.from.cx + (tgt.x - op.from.cx) * u, cy: op.from.cy + (tgt.y - op.from.cy) * u, zoom: op.from.zoom + (op.zoom - op.from.zoom) * u };
          if (op.t >= op.ms) { op.done = true; S.camSettled = true; S.follow = op.cmd.follow && typeof op.to === 'string' && op.to !== 'game' ? op.to : null; }
          return;
        }
        case 'fade': { var v = op.ms > 0 ? clamp(op.t / op.ms, 0, 1) : 1; S.fade = op.from + (op.to - op.from) * v; if (v >= 1) op.done = true; return; }
        case 'emote': if (op.t >= op.ms) op.done = true; return;
      }
      op.done = true;
    }
    function nextPage(op) {
      if (op.page < op.pages.length - 1) { op.page++; op.pt = 0; op.full = false; op.hold = 0; op.rev = revealTimes(op.pages[op.page], P.textSpeed); }
      else op.done = true;
    }
    function runTrack(T, dt) {   // returns true when the track has finished
      var guard = 0;
      while (guard++ < 256) {
        if (!T.op) { if (T.pc >= T.list.length) return true; T.op = begin(T, T.list[T.pc++]); }
        stepOp(T.op, T.op.done ? 0 : dt); dt = 0;
        if (!T.op.done) return false;
        T.op = null;
      }
      return false;
    }
    /* skip: every remaining command's end state, in order (calls fire once, cues and lines do not) */
    function finishTrack(T) {
      if (T.op) { finishOp(T.op); T.op = null; }
      while (T.pc < T.list.length) { var cmd = T.list[T.pc++], op = begin(T, cmd, true); if (op.kind === 'all') op.tracks.forEach(finishTrack); else finishOp(op); }
    }
    function finishOp(op) {
      switch (op.kind) {
        case 'all': op.tracks.forEach(finishTrack); break;
        case 'move': { var p = readPose(op.id); if (p && op.pts && op.pts.length) { if (op.endHeading === undefined) op.endHeading = endHeading(op, p); finishMove(op); } break; }
        case 'face': { var fp = readPose(op.id); if (fp) { faceSpec(fp, op.cmd.to); fp.moving = false; push(op.id); } break; }
        case 'say': if (op.host && !op.hostDone) { if (opt.dialogue && typeof opt.dialogue.close === 'function') call(opt.dialogue.close); op.hostDone = true; } break;
        case 'cam': { var tgt = camTarget(op.to); if (tgt) S.cam = keepIn({ cx: tgt.x, cy: tgt.y, zoom: op.zoom }, op.ids || framedIds(op.cmd)); S.follow = null; S.framed = op.ids || framedIds(op.cmd); S.camSettled = true; break; }
        case 'fade': S.fade = op.to; break;
      }
      op.done = true;
    }

    function play(script, o) {
      o = o || {};
      if (S && S.lockedNow) { stats.refused++; return false; }
      var carryBars = S ? S.bars : 0;
      var id = o.id != null ? String(o.id) : null;
      if (id && o.once && seen[id]) { stats.refused++; return false; }
      if (id) seen[id] = true;
      var g = gameCam() || { cx: 0, cy: 0, zoom: 1 };
      S = { id: id, t: 0, main: null, phase: 'run', cam: { cx: g.cx, cy: g.cy, zoom: 1 }, follow: null, fade: 0, fadeColor: '#000000', bars: carryBars, barsTo: 1,
        emotes: [], calls: [], skipHold: 0, skipArmed: 0, skipped: false, outT: 0, black: 0, boxA: 0, lastSide: null, lockedNow: true, endInfo: null, startCam: { cx: g.cx, cy: g.cy } };
      S.main = Track(script);
      for (var key in ACT) { ACT[key].pose = null; ACT[key].touched = false; }
      stats.plays++;
      call(opt.onStart, { id: id });
      return true;
    }

    function curSay() {   // the open built-in line (deepest), for draw and input
      function find(T) { if (!T || !T.op) return null; if (T.op.kind === 'say' && !T.op.host) return T.op; if (T.op.kind === 'all') for (var i = 0; i < T.op.tracks.length; i++) { var r = find(T.op.tracks[i]); if (r) return r; } return null; }
      return S ? find(S.main) : null;
    }
    function hostSayOpen() {
      function find(T) { if (!T || !T.op) return false; if (T.op.kind === 'say' && T.op.host && !T.op.done) return true; if (T.op.kind === 'all') return T.op.tracks.some(find); return false; }
      return S ? find(S.main) : false;
    }

    function endNow() {   // control comes back exactly once
      if (!S || !S.lockedNow) return;
      S.lockedNow = false;
      for (var key in ACT) { var A = ACT[key]; if (A.touched && A.pose) { A.pose.moving = false; A.pose.frame = 0; A.pose.target = null; call(A.spec.set, poseOut(A.pose)); } }
      var fin = {}; for (key in ACT) if (ACT[key].touched && ACT[key].pose) fin[key] = { x: ACT[key].pose.x, y: ACT[key].pose.y, face: ACT[key].pose.face };
      lastEnd = { id: S.id, skipped: S.skipped, ms: Math.round(S.t), calls: S.calls.slice(), actors: fin };
      stats.ends++;
      call(opt.onEnd, lastEnd);
    }

    function update(dt) {
      try {
        dt = clamp(num(dt, 0), 0, 100);
        if (!S) return;
        S.t += dt;
        // bars
        var bs = dt / Math.max(1, P.barMs); S.bars = S.bars < S.barsTo ? Math.min(S.barsTo, S.bars + bs) : Math.max(S.barsTo, S.bars - bs);
        // emotes age
        S.emotes.forEach(function (e) { e.t += dt; }); S.emotes = S.emotes.filter(function (e) { return e.t < e.ms; });
        if (S.phase === 'run') {
          if (S.skipHold > 0 && !S.skipDown) S.skipHold = Math.max(0, S.skipHold - dt * 2);
          if (S.skipDown && P.skip === 'hold') { S.skipHold += dt; if (S.skipHold >= P.holdMs) startSkip(); }
          if (S.skipArmed > 0) S.skipArmed = Math.max(0, S.skipArmed - dt);
        }
        if (S.phase === 'run') {
          var done = runTrack(S.main, dt);
          if (S.follow) { var ft = camTarget(S.follow); if (ft) { S.cam.cx += (ft.x - S.cam.cx) * Math.min(1, dt / 120); S.cam.cy += (ft.y - S.cam.cy) * Math.min(1, dt / 120); } }
          var say = curSay(); if (say) S.lastBoxOp = say; S.boxA = say ? Math.min(1, S.boxA + dt / 140) : Math.max(0, S.boxA - dt / 160);
          if (done) { S.phase = 'out'; S.outT = 0; S.outFrom = { cx: S.cam.cx, cy: S.cam.cy, zoom: S.cam.zoom }; S.outFade = S.fade; }
        } else if (S.phase === 'skip-in') {      // fading to black
          S.black = Math.min(1, S.black + dt / 160); S.boxA = Math.max(0, S.boxA - dt / 100);
          if (S.black >= 1) {
            finishTrack(S.main); S.emotes = []; S.boxA = 0;
            var g = gameCam(); if (g) S.cam = { cx: g.cx, cy: g.cy, zoom: 1 }; S.fade = 0; S.follow = null;
            for (var key in ACT) if (ACT[key].pose) { ACT[key].pose.moving = false; ACT[key].pose.frame = 0; }
            S.phase = 'skip-out'; S.barsTo = 0;
          }
        } else if (S.phase === 'skip-out') {
          var g2 = gameCam(); if (g2) S.cam = { cx: g2.cx, cy: g2.cy, zoom: 1 };
          S.black = Math.max(0, S.black - dt / 260);
          if (S.black <= 0) { endNow(); S.phase = 'tail'; }
        } else if (S.phase === 'out') {        // the camera glides back to the game's camera, a fade lifts, then control returns
          S.outT += dt; S.boxA = Math.max(0, S.boxA - dt / 160);
          var g3 = gameCam(), dur = Math.max(1, P.returnMs), u = easeIO(S.outT / dur);
          if (g3) {
            var far = Math.hypot(g3.cx - S.outFrom.cx, g3.cy - S.outFrom.cy) > 0.5 || Math.abs(S.outFrom.zoom - 1) > 0.001;
            if (!far) u = 1;
            S.cam = { cx: S.outFrom.cx + (g3.cx - S.outFrom.cx) * u, cy: S.outFrom.cy + (g3.cy - S.outFrom.cy) * u, zoom: S.outFrom.zoom + (1 - S.outFrom.zoom) * u };
          } else u = 1;
          S.fade = S.outFade * (1 - u);
          if (u >= 1) { S.fade = 0; endNow(); S.barsTo = 0; S.phase = 'tail'; }
        } else if (S.phase === 'tail') {        // bars slide away while the game already runs
          if (S.bars <= 0 && S.black <= 0 && S.boxA <= 0) { S = null; return; }
        }
      } catch (e) { stats.errors++; }
    }
    function startSkip() {
      if (!S || S.phase !== 'run') return false;
      S.phase = 'skip-in'; S.skipped = true; S.skipHold = P.holdMs; stats.skips++;
      return true;
    }

    function input(action, down) {
      try {
        if (!S || !S.lockedNow) return false;
        if (action === 'skip') {
          if (P.skip === 'off') return true;
          if (P.skip === 'hold') { S.skipDown = down !== false; return true; }
          if (down === false) return true;
          if (S.skipArmed > 0) startSkip(); else S.skipArmed = 2200;
          return true;
        }
        if (action === 'ok') {
          if (hostSayOpen()) return false;   // the game's own dialogue box takes its own keys
          var op = curSay();
          if (op && S.phase === 'run') { if (!op.full) { op.full = true; op.pt = op.rev[op.pages[op.page].length]; } else nextPage(op); }
          return true;   // while locked, every confirm belongs to the cutscene (the game's own dialogue handles its own keys)
        }
        return true;
      } catch (e) { stats.errors++; return true; }
    }

    function camera() {
      if (!S || !S.lockedNow && S.phase === 'tail') return null;
      var c = clampCam(S.cam); return { x: c.x, y: c.y, zoom: c.zoom, w: c.w, h: c.h };
    }
    function pose(id) { var A = ACT[id]; if (!S || !S.lockedNow || !A || !A.pose || !A.touched) return null; return poseOut(A.pose); }

    /* ---------- drawing (screen space) ---------- */
    function toScreen(wx, wy, cam) {
      var st = stage(), wv = worldView(), kx = st.w / wv.w * cam.zoom, ky = st.h / wv.h * cam.zoom;
      return { x: st.x + (wx - cam.x) * kx, y: st.y + (wy - cam.y) * ky, k: kx };
    }
    function textPx() {   // smooth: font px in draw units, never under 10 CSS px
      var v = view(), base = P.textSize * Math.max(0.6, v.h / 360);
      return Math.max(base, 10.6 / cssScale());
    }
    /* crisp text stays on the game's own pixel scale (pxFont, default 1): a pixel game keeps it readable by its canvas scale */
    function pxScale() { return Math.max(1, Math.min(4, Math.round(num(P.pxFont, 1)))); }
    /* compact (phones: view under 300 CSS px tall): thinner bars, 2-line box, smaller plate, so the scene keeps >= 65 % */
    function compact() { return P.compact === 'on' || (P.compact === 'auto' && view().h * cssScale() < 300); }
    function barShare() { var b = clamp(P.bars, 0, 0.3); return compact() ? Math.min(b, Math.max(0.055, (crisp() ? 10 * pxScale() : 10.6 * 1.3 / cssScale()) / view().h)) : b; }   // thin, but the skip hint still fits
    function wrapSmooth(g, s, w) {
      var out = [], line = '';
      String(s).split(' ').forEach(function (word) {
        var tr = line ? line + ' ' + word : word;
        if (g.measureText(tr).width > w && line) { out.push(line); line = word; } else line = tr;
        while (g.measureText(line).width > w && line.length > 1) { var n = line.length - 1; while (n > 1 && g.measureText(line.slice(0, n)).width > w) n--; out.push(line.slice(0, n)); line = line.slice(n); }
      });
      if (line) out.push(line);
      return out;
    }
    function wrapPx(s, w, k2) {
      var out = [], line = '';
      String(s).split(' ').forEach(function (word) {
        var tr = line ? line + ' ' + word : word;
        if (pxWidth(tr, k2) > w && line) { out.push(line); line = word; } else line = tr;
        while (pxWidth(line, k2) > w && line.length > 1) { var n = line.length - 1; while (n > 1 && pxWidth(line.slice(0, n), k2) > w) n--; out.push(line.slice(0, n)); line = line.slice(n); }
      });
      if (line) out.push(line);
      return out;
    }

    /* which wrapped lines the box shows: at most maxV, following the typing cursor; a new line slides in over 140 ms
       (a function of the line's own clock, so ?t= stills match play) */
    function scrollWin(op, lines, n, maxV) {
      var vis = Math.min(lines.length, maxV), starts = [], c = 0, cl = 0;
      lines.forEach(function (ln, j) { starts.push(c); if (n >= c) cl = j; c += ln.length + 1; });
      var first = clamp(cl - vis + 1, 0, lines.length - vis), off = first;
      if (first > 0 && !op.full) { var tL = op.rev[Math.min(starts[cl], op.rev.length - 1)], u = clamp((op.pt - tL) / 140, 0, 1); off = first - 1 + easeOut(u); }
      return { vis: vis, off: off, starts: starts };
    }
    function draw(g) {
      var rec = { bars: 0, barH: 0, box: null, texts: [], plate: null, emotes: [], skip: null, fade: 0, black: 0, camera: null, crisp: crisp(), view: null, cssScale: cssScale() };
      try {
        if (!S) { last = rec; return rec; }
        var v = view(), cam = clampCam(S.cam), TH = THEMES[P.theme] || THEMES.night, cr = crisp();
        rec.view = { x: v.x, y: v.y, w: v.w, h: v.h }; rec.camera = { x: cam.x, y: cam.y, zoom: cam.zoom, w: cam.w, h: cam.h };
        g.save();
        // script fade (under the bars and the box)
        if (S.fade > 0.001) { g.globalAlpha = clamp(S.fade, 0, 1); g.fillStyle = S.fadeColor; g.fillRect(v.x, v.y, v.w, v.h); g.globalAlpha = 1; rec.fade = S.fade; }
        // emotes
        S.emotes.forEach(function (e) { var r = drawEmote(g, e, cam, cr); if (r) rec.emotes.push(r); });
        // letterbox bars
        var bh = Math.round(v.h * barShare()), eb = easeIO(S.bars), h1 = cr ? Math.round(bh * eb) : bh * eb;
        if (h1 > 0.01) {
          g.fillStyle = SK && SK.colors && SK.colors.bg ? '#000' : TH.bar;
          g.fillRect(v.x, v.y, v.w, h1); g.fillRect(v.x, v.y + v.h - h1, v.w, h1);
          rec.bars = eb; rec.barH = h1;
        }
        // the built-in line box
        var op = curSay();
        if ((op || S.boxA > 0) && S.boxA > 0.001) { var lb = op || S.lastBoxOp; if (lb) drawBox(g, lb, cam, v, cr, TH, rec); }
        // skip hint in the top bar
        if (S.lockedNow && P.skip !== 'off' && h1 > 0) drawSkip(g, v, h1, cr, TH, rec);
        // skip black
        if (S.black > 0.001) { g.globalAlpha = clamp(S.black, 0, 1); g.fillStyle = '#000'; g.fillRect(v.x, v.y, v.w, v.h); g.globalAlpha = 1; rec.black = S.black; }
        g.restore();
      } catch (e) { stats.errors++; try { g.restore(); } catch (e2) { } }
      last = rec; return rec;
    }

    function actorBox(id, cam) {
      var p = ACT[id] && ACT[id].pose; if (!p) { readPose(id); p = ACT[id] && ACT[id].pose; } if (!p) return null;
      var h = num(ACT[id].spec.h, 16), w = num(ACT[id].spec.w, h * 0.7), a = toScreen(p.x - w / 2, p.y - h, cam), b = toScreen(p.x + w / 2, p.y, cam);
      return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, cx: (a.x + b.x) / 2 };
    }

    function drawEmote(g, e, cam, cr) {
      var b = actorBox(e.id, cam); if (!b) return null;
      var tIn = Math.min(1, e.t / 140), tOut = clamp((e.ms - e.t) / 200, 0, 1), a = Math.min(tIn * 1.4, 1) * tOut;
      if (a <= 0.01) return null;
      var col = EMO_COL[e.icon] || '#ff6a3c';
      if (cr || P.emotes === 'pixel') {   // pixel bubble on the world's own pixel grid (screen px per world px x zoom)
        var st = stage(), wv = worldView(), k2 = Math.max(1, Math.round(st.w / wv.w * cam.zoom)), rise = e.t < 140 ? Math.round(3 * (1 - tIn)) : 0;
        var W = 12 * k2, H = 10 * k2, x = st.x + Math.round((b.cx - W / 2 - st.x) / k2) * k2, y = st.y + Math.round((b.y - H - 3 * k2 - st.y) / k2) * k2 + rise * k2;
        g.globalAlpha = a;
        var O = '#1a1024';
        g.fillStyle = O; g.fillRect(x + k2, y, W - 2 * k2, H); g.fillRect(x, y + k2, W, H - 2 * k2);
        g.fillStyle = '#fbf6ff'; g.fillRect(x + 2 * k2, y + k2, W - 4 * k2, H - 2 * k2); g.fillRect(x + k2, y + 2 * k2, W - 2 * k2, H - 4 * k2);
        g.fillStyle = '#d4c8e4'; g.fillRect(x + 2 * k2, y + H - 2 * k2, W - 4 * k2, k2);
        g.fillStyle = O; g.fillRect(x + W / 2 - k2, y + H, 3 * k2, k2); g.fillRect(x + W / 2 - k2, y + H + k2, k2 * 2, k2);
        g.fillStyle = '#fbf6ff'; g.fillRect(x + W / 2 - k2 + k2, y + H - k2, k2, k2 * 2);
        var rows = EMO_PX[e.icon] || EMO_PX['!'];
        for (var r = 0; r < rows.length; r++) for (var q = 0; q < rows[r].length; q++) { var ch = rows[r].charAt(q); if (ch === '.') continue; g.fillStyle = ch === 'l' ? '#ffffff' : ch === 'o' ? '#5c5470' : col; g.fillRect(x + 3 * k2 + q * k2, y + 2 * k2 + r * k2, k2, k2); }
        g.globalAlpha = 1;
        return { id: e.id, icon: e.icon, x: x, y: y, w: W, h: H + 2 * k2 };
      }
      var s = clamp(b.h * 0.62, 14, 64), pop = e.t < 260 ? 1 + 0.18 * Math.sin(clamp(e.t / 260, 0, 1) * Math.PI) * (1 - e.t / 260) : 1, bw = s * 1.15 * pop, bhh = s * 0.98 * pop;
      var cx = b.cx, cy = b.y - bhh / 2 - s * 0.32 - (1 - tIn) * s * 0.25;
      g.save(); g.globalAlpha = a;
      g.shadowColor = 'rgba(10,6,20,0.45)'; g.shadowBlur = s * 0.25; g.shadowOffsetY = s * 0.06;
      g.fillStyle = '#fdfaff'; rr(g, cx - bw / 2, cy - bhh / 2, bw, bhh, bhh * 0.42); g.fill();
      g.beginPath(); g.moveTo(cx - s * 0.16, cy + bhh / 2 - 1); g.lineTo(cx + s * 0.02, cy + bhh / 2 + s * 0.22); g.lineTo(cx + s * 0.14, cy + bhh / 2 - 1); g.closePath(); g.fill();
      g.shadowColor = 'transparent';
      g.lineWidth = Math.max(1, s * 0.07); g.strokeStyle = 'rgba(40,28,64,0.85)'; rr(g, cx - bw / 2, cy - bhh / 2, bw, bhh, bhh * 0.42); g.stroke();
      var gr = g.createLinearGradient(0, cy - bhh / 2, 0, cy + bhh / 2); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(120,100,160,0.18)'); g.fillStyle = gr; rr(g, cx - bw / 2, cy - bhh / 2, bw, bhh, bhh * 0.42); g.fill();
      emoteGlyph(g, e.icon, cx, cy, s * 0.62, col);
      g.restore();
      return { id: e.id, icon: e.icon, x: cx - bw / 2, y: cy - bhh / 2, w: bw, h: bhh + s * 0.22 };
    }
    function emoteGlyph(g, icon, cx, cy, s, col) {
      g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
      if (icon === '!') { g.lineWidth = s * 0.24; g.beginPath(); g.moveTo(cx, cy - s * 0.42); g.lineTo(cx, cy + s * 0.12); g.stroke(); g.beginPath(); g.arc(cx, cy + s * 0.4, s * 0.13, 0, 7); g.fill(); return; }
      if (icon === '?') { g.lineWidth = s * 0.19; g.beginPath(); g.arc(cx, cy - s * 0.2, s * 0.24, Math.PI * 1.05, Math.PI * 2.35); g.lineTo(cx, cy + s * 0.14); g.stroke(); g.beginPath(); g.arc(cx, cy + s * 0.42, s * 0.12, 0, 7); g.fill(); return; }
      if (icon === '...') { for (var i = -1; i <= 1; i++) { g.beginPath(); g.arc(cx + i * s * 0.34, cy + s * 0.12, s * 0.11, 0, 7); g.fill(); } return; }
      if (icon === 'heart') { var r = s * 0.24; g.beginPath(); g.moveTo(cx, cy + s * 0.42); g.bezierCurveTo(cx - s * 0.6, cy, cx - s * 0.32, cy - s * 0.52, cx, cy - s * 0.18); g.bezierCurveTo(cx + s * 0.32, cy - s * 0.52, cx + s * 0.6, cy, cx, cy + s * 0.42); g.fill(); g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(cx - r * 0.9, cy - r * 0.55, r * 0.28, 0, 7); g.fill(); return; }
      if (icon === 'note') { g.beginPath(); g.ellipse(cx - s * 0.16, cy + s * 0.3, s * 0.17, s * 0.13, -0.4, 0, 7); g.fill(); g.lineWidth = s * 0.1; g.beginPath(); g.moveTo(cx - s * 0.02, cy + s * 0.3); g.lineTo(cx - s * 0.02, cy - s * 0.42); g.quadraticCurveTo(cx + s * 0.3, cy - s * 0.3, cx + s * 0.32, cy - s * 0.06); g.stroke(); return; }
      if (icon === 'anger') { g.lineWidth = s * 0.14; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { g.beginPath(); g.moveTo(cx + q[0] * s * 0.12, cy + q[1] * s * 0.42); g.quadraticCurveTo(cx + q[0] * s * 0.14, cy + q[1] * s * 0.14, cx + q[0] * s * 0.42, cy + q[1] * s * 0.12); g.stroke(); }); return; }
      if (icon === 'idea') { g.beginPath(); g.arc(cx, cy - s * 0.1, s * 0.3, 0, 7); g.fill(); g.fillStyle = '#7a6a8a'; g.fillRect(cx - s * 0.14, cy + s * 0.2, s * 0.28, s * 0.22); g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.arc(cx - s * 0.1, cy - s * 0.2, s * 0.08, 0, 7); g.fill(); return; }
      if (icon === 'sweat') { g.beginPath(); g.moveTo(cx, cy - s * 0.45); g.quadraticCurveTo(cx + s * 0.34, cy + s * 0.05, cx, cy + s * 0.38); g.quadraticCurveTo(cx - s * 0.34, cy + s * 0.05, cx, cy - s * 0.45); g.fill(); g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(cx - s * 0.08, cy + s * 0.08, s * 0.07, 0, 7); g.fill(); return; }
    }

    /* bottom unless that box would cover a cast member (then top; if both would, the side that hides less); decided in update
       when the line starts from the box's own size (a box that is still on screen keeps its side, so it never jumps) */
    function boxHeight(op) {
      var v = view(), s = op.pages[0] || '';
      var cpt = compact();
      if (crisp()) { var k2 = pxScale(), W = Math.min(v.w - (cpt ? 6 : 12) * k2, Math.max(160 * k2, Math.round(v.w * 0.86))); return Math.min(cpt ? 2 : 3, wrapPx(s, W - (cpt ? 8 : 10) * k2, k2).length) * (cpt ? 9 : 10) * k2 + 8 * k2 + (op.name ? 6 * k2 : 0) + (cpt ? 3 : 6) * k2; }
      var fs = textPx(), m2 = Math.round(v.w * 0.04), Ws = Math.min(v.w - 2 * m2, Math.max(fs * 24, Math.min(v.w * 0.78, fs * 46))), per = Math.max(8, (Ws - 1.9 * fs) / (fs * 0.5));
      return Math.min(2, Math.ceil(s.length / per + 0.15)) * fs * (cpt ? 1.3 : 1.38) + fs * (cpt ? 1.12 : 1.52) + (op.name ? fs * (cpt ? 1.35 : 1.55) : 0) + v.h * (cpt ? 0.015 : 0.025);
    }
    function decideSide(op) {
      if (P.box === 'top' || P.box === 'bottom') { op.side = P.box; return; }
      if (S.lastSide && S.boxA > 0.05) { op.side = S.lastSide; return; }
      var v = view(), cam = clampCam(S.cam), H = boxHeight(op), top0 = v.y + v.h * barShare(), cover = { bottom: 0, top: 0 };
      var zones = { bottom: [v.y + v.h - H, v.y + v.h], top: [top0, top0 + H + v.h * 0.02] };
      for (var id in ACT) {
        var b = actorBox(id, cam); if (!b || b.x + b.w < v.x || b.x > v.x + v.w || b.y + b.h < v.y || b.y > v.y + v.h) continue;
        for (var z in zones) { var o = Math.min(b.y + b.h, zones[z][1]) - Math.max(b.y, zones[z][0]); if (o > 0) cover[z] += o * (id === op.id ? 2 : 1); }
      }
      op.side = cover.bottom <= 0 ? 'bottom' : cover.top < cover.bottom ? 'top' : 'bottom'; S.lastSide = op.side;
    }
    function boxSide(op) { return op.side || 'bottom'; }

    function drawBox(g, op, cam, v, cr, TH, rec) {
      var s = op.pages[op.page], n = op.full ? s.length : 0;
      if (!op.full) { n = 0; while (n < s.length && op.rev[n + 1] <= op.pt) n++; }
      var shown = s.slice(0, n), a = easeOut(S.boxA);
      var spk = op.id != null ? actorBox(op.id, cam) : null;
      if (cr) {
        var k2 = pxScale(), X = TH.px, cpt = compact(), m = (cpt ? 3 : 6) * k2, pad = (cpt ? 4 : 5) * k2, lh = (cpt ? 9 : 10) * k2;
        var W = Math.min(v.w - 2 * m, Math.max(160 * k2, Math.round(v.w * 0.86))), tw = W - 2 * pad;
        var lines = wrapPx(s, tw, k2), nameW = op.name ? pxWidth(op.name.toUpperCase(), k2) + 8 * k2 : 0, plateH = op.name ? (cpt ? 9 : 11) * k2 : 0;
        var win = scrollWin(op, lines, n, cpt ? 2 : 3), H = win.vis * lh + 2 * pad - 2 * k2 + (op.name ? 2 * k2 : 0);
        var side = boxSide(op), x = Math.round(v.x + (v.w - W) / 2);
        var y = side === 'bottom' ? Math.round(v.y + v.h - H - m) : Math.round(v.y + Math.round(v.h * barShare()) + Math.ceil(plateH / 2) + 3 * k2);
        y += Math.round((1 - a) * 4 * k2) * (side === 'bottom' ? 1 : -1);
        y = clamp(y, v.y + k2, v.y + v.h - H - k2);
        g.globalAlpha = a;
        // frame: rim, edge, body, bottom shade
        g.fillStyle = X.rim; g.fillRect(x + k2, y - k2, W - 2 * k2, H + 2 * k2); g.fillRect(x, y, W, H);
        g.fillStyle = X.edge; g.fillRect(x + k2, y, W - 2 * k2, H); g.fillRect(x + 2 * k2, y - k2 + k2, W - 4 * k2, k2);
        g.fillStyle = X.box; g.fillRect(x + 2 * k2, y + k2, W - 4 * k2, H - 2 * k2);
        g.fillStyle = X.shade; g.fillRect(x + 2 * k2, y + H - 3 * k2, W - 4 * k2, k2);
        // tail toward the speaker
        if (spk && spk.cx > x + 8 * k2 && spk.cx < x + W - 8 * k2) {
          var tx = Math.round(spk.cx);
          if (side === 'bottom' && spk.y + spk.h < y) { for (var i2 = 0; i2 < 3; i2++) { g.fillStyle = X.rim; g.fillRect(tx - (3 - i2) * k2 - k2, y - k2 - i2 * k2 - k2, (3 - i2) * 2 * k2 + 2 * k2, k2); g.fillStyle = X.edge; g.fillRect(tx - (3 - i2) * k2, y - k2 - i2 * k2 - k2 + 0, (3 - i2) * 2 * k2, k2); } }
          else if (side === 'top' && spk.y > y + H) { for (var i3 = 0; i3 < 3; i3++) { g.fillStyle = X.rim; g.fillRect(tx - (3 - i3) * k2 - k2, y + H + i3 * k2, (3 - i3) * 2 * k2 + 2 * k2, k2); g.fillStyle = X.edge; g.fillRect(tx - (3 - i3) * k2, y + H + i3 * k2, (3 - i3) * 2 * k2, k2); } }
        }
        rec.box = { x: x, y: y, w: W, h: H, side: side };
        if (op.name) {
          var px0 = x + 6 * k2, py0 = y - Math.ceil(plateH / 2) - k2;   // the plate straddles the frame
          g.fillStyle = X.rim; g.fillRect(px0 - k2, py0 - k2, nameW + 2 * k2, plateH + k2);
          g.fillStyle = X.plateEdge; g.fillRect(px0, py0, nameW, plateH);
          g.fillStyle = X.plate; g.fillRect(px0 + k2, py0 + k2, nameW - 2 * k2, plateH - k2);
          pxText(g, op.name.toUpperCase(), px0 + 4 * k2, py0 + 2 * k2, k2, X.name);
          rec.plate = { x: px0, y: py0, w: nameW, h: plateH }; rec.texts.push({ s: op.name, x: px0 + 4 * k2, y: py0 + 2 * k2, w: pxWidth(op.name.toUpperCase(), k2), h: 7 * k2, em: 8 * k2, ui: 'name' });
        }
        var clipT = y + (op.name ? Math.ceil(plateH / 2) : k2), clipB = y + H - 2 * k2;
        g.save(); g.beginPath(); g.rect(x + 2 * k2, clipT, W - 4 * k2, clipB - clipT); g.clip();
        lines.forEach(function (ln, j) {
          var c = win.starts[j], part = ln.slice(0, Math.max(0, Math.min(ln.length, n - c)));
          var tx2 = x + pad, ty = Math.round(y + pad - k2 + (j - win.off) * lh + (op.name ? 2 * k2 : 0));
          if (j < Math.floor(win.off) || j > Math.floor(win.off) + win.vis) return;
          if (part) pxText(g, part, tx2, ty, k2, X.text);
          if (ty >= clipT - 0.5 && ty + 8 * k2 <= clipB + 0.5) rec.texts.push({ s: ln, x: tx2, y: ty, w: pxWidth(ln, k2), h: 8 * k2, em: 8 * k2 });
        });
        g.restore();
        rec.lines = { total: lines.length, shown: win.vis, first: win.off };
        if (op.full && !isAuto() && Math.floor(op.hold / 400) % 2 === 0) { g.fillStyle = X.name; var ax = x + W - pad - 4 * k2, ay = y + H - pad - k2; g.fillRect(ax, ay - 3 * k2, 5 * k2, k2); g.fillRect(ax + k2, ay - 2 * k2, 3 * k2, k2); g.fillRect(ax + 2 * k2, ay - k2, k2, k2); }
        g.globalAlpha = 1;
        return;
      }
      var fs = textPx(), lhS = fs * 1.38, m2 = Math.round(v.w * 0.04), padS = fs * 0.85;
      g.font = '500 ' + fs.toFixed(2) + 'px ' + FAMILY;
      var Ws = Math.min(v.w - 2 * m2, Math.max(fs * 24, Math.min(v.w * 0.78, fs * 46))), tws = Ws - 2 * padS;
      var cptS = compact(); if (cptS) { padS = fs * 0.7; lhS = fs * 1.3; }
      var linesS = wrapSmooth(g, s, tws), winS = scrollWin(op, linesS, n, 2), Hs = winS.vis * lhS + padS * 1.6, plS = op.name ? fs * (cptS ? 1.35 : 1.55) : 0;
      var widest = 0; linesS.forEach(function (ln) { widest = Math.max(widest, g.measureText(ln).width); });
      Ws = Math.min(Ws, Math.max(fs * 18, widest + 2 * padS + fs * 1.2));   // the box fits its text (a short line gets a short box)
      var sideS = boxSide(op), xs = v.x + (v.w - Ws) / 2;
      var ys = sideS === 'bottom' ? v.y + v.h - Hs - v.h * (cptS ? 0.015 : 0.025) : v.y + v.h * barShare() + plS + v.h * 0.02;
      ys += (1 - a) * fs * 0.6 * (sideS === 'bottom' ? 1 : -1);
      ys = clamp(ys, v.y, v.y + v.h - Hs - 1);   // the slide-in never leaves the view
      g.save(); g.globalAlpha = a;
      g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = fs * 1.1; g.shadowOffsetY = fs * 0.2;
      var gr = g.createLinearGradient(0, ys, 0, ys + Hs); gr.addColorStop(0, TH.box2); gr.addColorStop(1, TH.box);
      g.fillStyle = gr; rr(g, xs, ys, Ws, Hs, fs * 0.55); g.fill();
      g.shadowColor = 'transparent';
      if (spk && spk.cx > xs + fs * 1.4 && spk.cx < xs + Ws - fs * 1.4) {   // tail toward the speaker
        var tx3 = spk.cx, tw3 = fs * 0.55;
        if (sideS === 'bottom' && spk.y + spk.h < ys) { g.beginPath(); g.moveTo(tx3 - tw3, ys + 0.5); g.lineTo(tx3 + tw3 * 0.2, ys - fs * 0.7); g.lineTo(tx3 + tw3, ys + 0.5); g.closePath(); g.fillStyle = TH.box2; g.fill(); }
        else if (sideS === 'top' && spk.y > ys + Hs) { g.beginPath(); g.moveTo(tx3 - tw3, ys + Hs - 0.5); g.lineTo(tx3 + tw3 * 0.2, ys + Hs + fs * 0.7); g.lineTo(tx3 + tw3, ys + Hs - 0.5); g.closePath(); g.fillStyle = TH.box; g.fill(); }
      }
      g.lineWidth = Math.max(1, fs * 0.08); g.strokeStyle = TH.edge; rr(g, xs + 0.5, ys + 0.5, Ws - 1, Hs - 1, fs * 0.55); g.stroke();
      g.strokeStyle = TH.rim; rr(g, xs - 0.5, ys - 0.5, Ws + 1, Hs + 1, fs * 0.6); g.stroke();
      rec.box = { x: xs, y: ys, w: Ws, h: Hs, side: sideS };
      if (op.name) {
        var nfs = Math.max(fs * 0.86, 10.6 / cssScale()); g.font = '700 ' + nfs.toFixed(2) + 'px ' + FAMILY;
        var nw = g.measureText(op.name).width + fs * 1.3, nx = xs + fs * 0.9, ny = ys - plS * 0.72;
        g.fillStyle = TH.plate; rr(g, nx, ny, nw, plS, plS * 0.3); g.fill(); g.strokeStyle = TH.plateEdge; g.lineWidth = Math.max(1, fs * 0.07); rr(g, nx + 0.5, ny + 0.5, nw - 1, plS - 1, plS * 0.3); g.stroke();
        g.fillStyle = TH.name; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(op.name, nx + fs * 0.65, ny + plS / 2 + fs * 0.03);
        rec.plate = { x: nx, y: ny, w: nw, h: plS }; rec.texts.push({ s: op.name, x: nx + fs * 0.65, y: ny + plS / 2 - nfs / 2, w: nw - fs * 1.3, h: nfs, em: nfs, ui: 'name' });
      }
      g.font = '500 ' + fs.toFixed(2) + 'px ' + FAMILY; g.textBaseline = 'top'; g.textAlign = 'left'; g.fillStyle = TH.text;
      var clipTS = ys + padS * 0.4, clipBS = ys + Hs - padS * 0.4;
      g.save(); g.beginPath(); g.rect(xs, clipTS, Ws, clipBS - clipTS); g.clip();
      linesS.forEach(function (ln, j) {
        if (j < Math.floor(winS.off) || j > Math.floor(winS.off) + winS.vis) return;
        var part = ln.slice(0, Math.max(0, Math.min(ln.length, n - winS.starts[j])));
        var tx4 = xs + padS, ty4 = ys + padS * 0.85 + (j - winS.off) * lhS;
        if (part) g.fillText(part, tx4, ty4);
        if (ty4 >= clipTS - 0.5 && ty4 + fs <= clipBS + 0.5) rec.texts.push({ s: ln, x: tx4, y: ty4, w: g.measureText(ln).width, h: fs, em: fs });
      });
      g.restore();
      rec.lines = { total: linesS.length, shown: winS.vis, first: winS.off };
      if (op.full && !isAuto()) { var bob = Math.sin(op.hold / 160) * fs * 0.12, ax2 = xs + Ws - padS * 0.9, ay2 = ys + Hs - padS * 0.7 + bob; g.fillStyle = TH.name; g.beginPath(); g.moveTo(ax2 - fs * 0.32, ay2 - fs * 0.3); g.lineTo(ax2 + fs * 0.32, ay2 - fs * 0.3); g.lineTo(ax2, ay2 + fs * 0.1); g.closePath(); g.fill(); }
      g.restore();
    }

    function drawSkip(g, v, h1, cr, TH, rec) {
      var label = P.skip === 'hold' ? 'Hold ' + P.skipKey + ' to skip' : S.skipArmed > 0 ? 'Press ' + P.skipKey + ' again to skip' : P.skipKey + ' Skip';
      var prog = P.skip === 'hold' ? clamp(S.skipHold / P.holdMs, 0, 1) : S.skipArmed > 0 ? 1 : 0;
      var a = clamp(h1 / Math.max(1, Math.round(v.h * barShare())), 0, 1) * (S.phase === 'run' || S.phase === 'skip-in' ? 1 : 0);
      if (a <= 0.02) return;
      if (cr) {   // keycap + label, a bar under the label fills while the key is held
        var k2 = pxScale(), tw = pxWidth(label, k2), cap = 10 * k2, gap = 4 * k2, x = Math.round(v.x + v.w - tw - cap - gap - 6 * k2), y = Math.round(v.y + (h1 - cap) / 2);
        var on = Math.max(prog, S.skipDown ? 1 : 0);
        if (h1 < cap + 2 * k2) {   // thin (compact) bar: the label alone, its letters turn gold as the hold fills
          if (h1 < 8 * k2) return;
          var lx = Math.round(v.x + v.w - tw - 4 * k2), ly = Math.round(v.y + (h1 - 7 * k2) / 2), cut = Math.round(label.length * prog);
          g.globalAlpha = a * (0.75 + 0.25 * on);
          pxText(g, label, lx, ly, k2, TH.px.dim); if (cut > 0) pxText(g, label.slice(0, cut), lx, ly, k2, '#ffd27a');
          g.globalAlpha = 1;
          rec.skip = { x: lx, y: ly, w: tw, h: 7 * k2, prog: prog }; rec.texts.push({ s: label, x: lx, y: ly, w: tw, h: 7 * k2, em: 8 * k2, ui: 'skip' });
          return;
        }
        g.globalAlpha = a * (0.7 + 0.3 * on);
        g.fillStyle = '#1a1024'; g.fillRect(x + k2, y, cap - 2 * k2, cap); g.fillRect(x, y + k2, cap, cap - 2 * k2);   // a rounded keycap: rim, face, darker lip
        g.fillStyle = '#d8d0ea'; g.fillRect(x + k2, y + k2, cap - 2 * k2, cap - 3 * k2); g.fillStyle = '#9a90b4'; g.fillRect(x + k2, y + cap - 2 * k2, cap - 2 * k2, k2);
        pxText(g, P.skipKey.charAt(0), x + Math.round((cap - pxWidth(P.skipKey.charAt(0), k2)) / 2 / k2) * k2, y + k2, k2, '#1a1024');
        pxText(g, label, x + cap + gap, y + k2, k2, TH.px.dim);
        g.fillStyle = '#2a2438'; g.fillRect(x + cap + gap, y + cap, tw, k2);
        if (prog > 0) { g.fillStyle = '#ffd27a'; g.fillRect(x + cap + gap, y + cap, Math.round(tw * prog / k2) * k2, k2); }
        g.globalAlpha = 1;
        rec.skip = { x: x, y: y, w: tw + cap + gap, h: cap + k2, prog: prog }; rec.texts.push({ s: label, x: x + cap + gap, y: y + k2, w: tw, h: 8 * k2, em: 8 * k2, ui: 'skip' });
        return;
      }
      var fs = Math.max(textPx() * 0.72, 10.4 / cssScale()); if (h1 < fs * 1.25) return;
      g.save(); g.globalAlpha = a * (0.6 + 0.4 * Math.max(prog, S.skipDown ? 1 : 0));
      g.font = '600 ' + fs.toFixed(2) + 'px ' + FAMILY; g.textBaseline = 'middle'; g.textAlign = 'right';
      var tw2 = g.measureText(label).width, R = fs * 0.62, xr = v.x + v.w - fs * 1.1, cy2 = v.y + h1 / 2;
      g.fillStyle = '#d8d0ea'; g.fillText(label, xr, cy2);
      var cx2 = xr - tw2 - R - fs * 0.5;
      g.lineWidth = Math.max(1.2, fs * 0.16); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(cx2, cy2, R, 0, 7); g.stroke();
      if (prog > 0) { g.strokeStyle = '#ffd27a'; g.beginPath(); g.arc(cx2, cy2, R, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); g.stroke(); }
      g.font = '700 ' + (fs * 0.72).toFixed(2) + 'px ' + FAMILY; g.textAlign = 'center'; g.fillStyle = '#ffffff'; g.fillText(P.skipKey, cx2, cy2 + fs * 0.03);
      g.restore();
      rec.skip = { x: cx2 - R, y: cy2 - fs / 2, w: xr - (cx2 - R), h: fs, prog: prog }; rec.texts.push({ s: label, x: xr - tw2, y: cy2 - fs / 2, w: tw2, h: fs, em: fs, ui: 'skip' });
    }

    function state() {
      var A = {}; for (var key in ACT) if (ACT[key].pose) A[key] = poseOut(ACT[key].pose);
      if (!S) return { active: false, locked: false, phase: 'idle', actors: A, seen: Object.keys(seen), lastEnd: lastEnd };
      var op = curSay(), cam = clampCam(S.cam);
      return { active: true, locked: S.lockedNow, phase: S.phase, id: S.id, t: Math.round(S.t), pc: S.main.pc, op: S.main.op ? S.main.op.kind : null,
        bars: +S.bars.toFixed(3), fade: +S.fade.toFixed(3), black: +S.black.toFixed(3), skipHold: Math.round(S.skipHold), skipped: S.skipped,
        camera: { x: +cam.x.toFixed(2), y: +cam.y.toFixed(2), zoom: +cam.zoom.toFixed(3), w: cam.w, h: cam.h }, line: op ? { who: op.id, name: op.name, text: op.pages[op.page], page: op.page, pages: op.pages.length, full: op.full } : null,
        framed: S.phase === 'run' ? (S.framed || []).slice() : [], /* the glide too: both ends keep them in */ hostLine: hostSayOpen(), emotes: S.emotes.map(function (e) { return { id: e.id, icon: e.icon, t: Math.round(e.t) }; }), calls: S.calls.slice(), actors: A, lastEnd: lastEnd };
    }

    return {
      version: VERSION,
      play: play, update: update, draw: draw, input: input, skip: function () { return startSkip(); },
      camera: camera, pose: pose, actor: actor,
      active: function () { return !!S; }, locked: function () { return !!(S && S.lockedNow); },
      bars: function () { return S ? easeIO(S.bars) : 0; },
      cinematic: function () { return !!S && (S.lockedNow || S.bars > 0) && P.hideHud !== 'off'; },
      waiting: function () { var op = curSay(); return !!(op && op.full && S && S.phase === 'run'); },
      hostLine: hostSayOpen,
      seen: function (id) { return id == null ? Object.keys(seen) : !!seen[id]; },
      load: function (ids) { (ids || []).forEach(function (i) { seen[String(i)] = true; }); },
      reset: function () { S = null; seen = {}; lastEnd = null; for (var key in ACT) { ACT[key].pose = null; ACT[key].touched = false; } },
      state: state, lastDrawn: function () { return last; }, lastEnd: function () { return lastEnd; },
      stats: function () { var o = {}; for (var key in stats) o[key] = stats[key]; o.errors += STATS_ERR.n; return o; },
      setParams: setParams, params: function () { var o = {}; for (var key in P) o[key] = P[key]; return o; },
      rects: function () { var r = []; if (last && last.box) r.push(last.box); if (last && last.plate) r.push(last.plate); return r; }
    };
  }

  root.GameDNA_Cutscenes = { version: VERSION, create: create, DEFAULTS: DEFAULTS, EMOTES: Object.keys(EMO_PX) };
})(typeof window !== 'undefined' ? window : this);
