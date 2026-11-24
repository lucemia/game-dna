/* GameDNA H-03 - Quest log & objectives (quest-log) - module v1.1.4 (plain script, no dependencies, one global)
 *
 *   const quests = GameDNA_QuestLog.create({
 *     view: { x: 0, y: 0, w: 640, h: 360 },       // screen rect of the play view in the coordinates draw() gets
 *     safeRects: () => [hudRect, ...],             // HUD boxes the tracker, banners and markers never cover
 *     quests: [{ id, title, giver, desc, reward, kind: 'main' | 'side', next,
 *                steps: [{ text: 'Gather moonherbs', on: 'collect:moonherb', count: 3, at: { x, y } }] }],
 *     camera: () => ({ x, y, w, h }),              // optional: world rect shown in view (world markers)
 *     locate: (target, step, quest) => ({ x, y }), // optional: world point of a step's target (or give step.at)
 *     player: () => ({ x, y }),                    // optional: world point, auto-completes 'reach' steps with step.at
 *     toasts: GameDNA_Toasts instance,             // optional: start / complete notices go there instead of the own banner
 *     params: { corner: 'tr', max: 2, ... }        // see DEFAULTS
 *   });
 *   quests.start('remedy');                // accept a quest
 *   quests.event('kill', 'slime');         // the game reports what happened: kill | collect | talk | reach | use | any word
 *   quests.update(stepMs);                 // every fixed step, every scene (also the ?t= replay)
 *   quests.draw(ctx);                      // last: after the world and the HUD, in screen coordinates
 *   quests.input('log' | 'up' | 'down' | 'left' | 'right' | 'ok' | 'back') -> true when consumed (log panel)
 *
 * Quest data with ordered steps and counters, a tracker in a HUD corner (one card per tracked quest: title, current
 * objective with a counter and a bar, the step just finished checking off and collapsing), a full log panel (active and
 * completed quests, description, steps, reward, track / untrack), "new quest" and "quest complete" banners (or C-14 toasts)
 * and optional world markers with edge arrows. Rules: counters never exceed their targets, only the current step of an
 * active quest counts, events after completion are ignored. Smooth glass cards on HD canvases; crisp pixel cards with
 * built-in bitmap fonts on native pixel canvases (view <= 512 px wide). draw() never changes state: every motion is a
 * function of the clock given to update(), so ?t=&freeze=1 stills are deterministic. Never throws from event / update / draw.
 * ASCII only.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.4';
  var DEFAULTS = { corner: 'tr', max: 2, width: 0, size: 0, margin: 0, render: 'auto', theme: 'dusk', markers: 'on', banner: 'on',
    log: 'on', future: 'hidden', keyHint: 'J', bars: 'on', hold: 1100, dodge: 'on', logHint: 'Up/Down select   Z track   X close' };
  var CORNERS = { tr: 1, tl: 1, br: 1, bl: 1 };
  var FAMILY = '"Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  var DWELL = 450, COOL = 1800, HOME = 2500, APPEAR = 340, CHECK = 260, COLLAPSE = 260, DONE_HOLD = 1700, LEAVE = 320, PUNCH = 300;

  /* ---------- bitmap fonts for the crisp mode ('#' = ink; rows top -> bottom; original designs shared with C-03) ---------- */
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
  var SMALL = {
    '!': '# # # . #', '#': '.#.#. ##### .#.#. ##### .#.#.', '%': '#.# ..# .#. #.. #.#', "'": '# #', '(': '.# #. #. #. .#', ')': '#. .# .# .# #.',
    '+': '... .#. ### .#.', ',': '.. .. .. .. .# #.', '-': '... ... ###', '.': '. . . . #', '/': '..# ..# .#. #.. #..', ':': '. # . # .',
    '0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '##. ..# .#. #.. ###', '3': '##. ..# .#. ..# ##.', '4': '#.# #.# ### ..# ..#',
    '5': '### #.. ##. ..# ##.', '6': '.## #.. ### #.# ###', '7': '### ..# .#. .#. .#.', '8': '### #.# ### #.# ###', '9': '### #.# ### ..# ##.',
    '?': '##. ..# .#. ... .#.', '<': '..# .#. #.. .#. ..#', '>': '#.. .#. ..# .#. #..', '=': '... ### ... ###',
    'A': '.##. #..# #### #..# #..#', 'B': '###. #..# ###. #..# ###.', 'C': '.### #... #... #... .###', 'D': '###. #..# #..# #..# ###.',
    'E': '### #.. ##. #.. ###', 'F': '### #.. ##. #.. #..', 'G': '.### #... #.## #..# .###', 'H': '#..# #..# #### #..# #..#', 'I': '### .#. .#. .#. ###',
    'J': '..## ...# ...# #..# .##.', 'K': '#..# #.#. ##.. #.#. #..#', 'L': '#.. #.. #.. #.. ###', 'M': '#...# ##.## #.#.# #...# #...#', 'N': '#..# ##.# #.## #..# #..#',
    'O': '.##. #..# #..# #..# .##.', 'P': '###. #..# ###. #... #...', 'Q': '.##. #..# #..# #.#. .#.#', 'R': '###. #..# ###. #.#. #..#', 'S': '.### #... .##. ...# ###.',
    'T': '### .#. .#. .#. .#.', 'U': '#..# #..# #..# #..# .##.', 'V': '#.# #.# #.# .#. .#.', 'W': '#...# #...# #.#.# #.#.# .#.#.', 'X': '#.# #.# .#. #.# #.#',
    'Y': '#.# #.# .#. .#. .#.', 'Z': '#### ..#. .#.. #... ####',
    'a': '... ##. .## #.# .##', 'b': '#.. ##. #.# #.# ##.', 'c': '... .## #.. #.. .##', 'd': '..# .## #.# #.# .##', 'e': '... .#. ### #.. .##', 'f': '..# .#. ### .#. .#.',
    'g': '... .## #.# .## ..# ##.', 'h': '#.. ##. #.# #.# #.#', 'i': '# . # # #', 'j': '.# .. .# .# .# #.', 'k': '#.. #.# ##. #.# #.#', 'l': '#. #. #. #. .#',
    'm': '..... ##.#. #.#.# #.#.# #.#.#', 'n': '... ##. #.# #.# #.#', 'o': '... .#. #.# #.# .#.', 'p': '... ##. #.# #.# ##. #..', 'q': '... .## #.# #.# .## ..#',
    'r': '... #.# ##. #.. #..', 's': '... .## #.. ..# ##.', 't': '.#. ### .#. .#. ..#', 'u': '... #.# #.# #.# .##', 'v': '... #.# #.# #.# .#.',
    'w': '..... #...# #.#.# #.#.# .#.#.', 'x': '... #.# .#. .#. #.#', 'y': '... #.# #.# .## ..# ##.', 'z': '... ### ..# #.. ###'
  };
  var FSPEC = { reg: { t: REG, h: 8, cap: 7, space: 3, lineH: 10 }, small: { t: SMALL, h: 6, cap: 5, space: 2, lineH: 7 } };
  var FONTS = {};
  function pfont(name) {
    if (FONTS[name]) return FONTS[name];
    var S = FSPEC[name], g = {};
    for (var ch in S.t) { var rows = S.t[ch].split(' '), w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length); g[ch] = { rows: rows, w: w }; }
    return (FONTS[name] = { g: g, h: S.h, cap: S.cap, space: S.space, lineH: S.lineH });
  }

  /* ---------- pixel sprites for the crisp mode: o = outline, a = accent, l = light, d = dark, w = white, k = check ink ---------- */
  var PX = {
    gem: ['...o...', '..oao..', '.olaao.', 'olaaado', '.oaado.', '..odo..', '...o...'],
    box: ['ooooooo', 'o.....o', 'o.....o', 'o.....o', 'o.....o', 'o.....o', 'ooooooo'],
    tick: ['ooooooo', 'oaaaaao', 'oaaaawo', 'owaawao', 'oawwaao', 'oaawaao', 'ooooooo'],
    pin: ['.ooo.', 'oaaao', 'oalao', 'oaaao', '.oao.', '..o..'],
    coin: ['.ooo.', 'olaao', 'olaao', 'oaado', '.ooo.'],
    mark: ['...o...', '..olo..', '.olaao.', 'olaaado', 'oaawado', '.oaado.', '..odo..', '...o...', '.......', '..ooo..', '.oaado.', '..ooo..'],
    arrow: ['oo.....', 'oaoo...', 'oalaoo.', 'oalaaao', 'oaaddo.', 'oddoo..', 'ooo....', '.......'],
    arrowD: ['ooooo..', 'oaaaao.', 'olaado.', 'olaado.', 'oaddao.', '.ooooao', '.....oo']
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u) * (1 - u); }
  function easeIn(u) { u = clamp(u, 0, 1); return u * u; }
  function bump(a, len) { if (a < 0 || a > len) return 0; var u = a / len; return u < 0.2 ? ease(u / 0.2) : Math.exp(-(u - 0.2) * 5) * Math.cos((u - 0.2) * 5); }
  function hit(a, b, pad) { pad = pad || 0; return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad; }
  function mk(w, h) { try { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; } catch (e) { return null; } }
  function hexRGB(h) { var s = String(h || '#ffffff').replace('#', ''); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]; var n = parseInt(s.slice(0, 6), 16); if (!isFinite(n)) n = 0xffffff; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgba(h, a) { var c = hexRGB(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(a, b, k) { var x = hexRGB(a), y = hexRGB(b); return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * k) + ',' + Math.round(x[1] + (y[1] - x[1]) * k) + ',' + Math.round(x[2] + (y[2] - x[2]) * k) + ')'; }
  function rectOf(r) {
    if (!r) return null;
    var x = +(r.x != null ? r.x : r[0]), y = +(r.y != null ? r.y : r[1]), w = +(r.w != null ? r.w : r.width != null ? r.width : r[2]), h = +(r.h != null ? r.h : r.height != null ? r.height : r[3]);
    return isFinite(x) && isFinite(y) && w > 0 && h > 0 ? { x: x, y: y, w: w, h: h } : null;
  }
  function rotRows(rows) { var h = rows.length, w = rows[0].length, out = []; for (var x = 0; x < w; x++) { var s = ''; for (var y = h - 1; y >= 0; y--) s += rows[y].charAt(x); out.push(s); } return out; }   // 90 deg clockwise

  var THEMES = {
    dusk: { top: 'rgba(30,25,44,0.86)', bot: 'rgba(15,12,24,0.86)', edge: 'rgba(255,255,255,0.12)', rim: 'rgba(0,0,0,0.5)', shadow: 'rgba(4,2,12,0.5)',
      title: '#fff2d6', text: '#ece7f6', dim: '#8e88a6', count: '#ffffff', ok: '#6fe39a', track: 'rgba(255,255,255,0.12)', box: '#cfc8e2', dimBg: 'rgba(8,6,14,0.62)',
      main: '#ffc94a', side: '#6fd2ff', px: ['#0b0814', '#2a2140', '#1c1630', '#4c3f68', '#f4eefc', '#8a82a2', '#ffe08a'] },
    parchment: { top: 'rgba(246,234,206,0.95)', bot: 'rgba(228,208,166,0.95)', edge: 'rgba(255,255,255,0.7)', rim: 'rgba(92,58,24,0.55)', shadow: 'rgba(40,22,6,0.35)',
      title: '#4a230c', text: '#3a2614', dim: '#94785a', count: '#2a1a0c', ok: '#2f8a4a', track: 'rgba(90,60,20,0.16)', box: '#7a5a38', dimBg: 'rgba(24,14,6,0.55)',
      main: '#b86a12', side: '#1f7d92', px: ['#3a2210', '#f0dfb8', '#d8bf8a', '#fff6dc', '#3a2614', '#9a7c5c', '#8a3e0e'] }
  };

  function create(opt) {
    opt = opt || {};
    var P = {}, k0; for (k0 in DEFAULTS) P[k0] = DEFAULTS[k0];
    var SK = null; try { SK = root.GameDNA_Skin && opt.skin != null && opt.skin !== false ? root.GameDNA_Skin.resolve(opt.skin) : null; } catch (e) { SK = null; }
    var lastAnchor = null, fadeV = 0, hops = 0, expanded = false, cornerNow = null, cornerT = -1e9, softT = 0, homeT = 0, clock = 0, Q = {}, order = [], banners = [], log = { open: false, t: -1e9, sel: 0, tab: 'active' }, warned = {}, drawn = null, upd = 0;
    var stats = { events: 0, applied: 0, ignored: 0, ignoredDone: 0, ignoredOrder: 0, ignoredInactive: 0, ignoredBad: 0, ignoredNoMatch: 0, steps: 0, completed: 0, started: 0,
      noRoom: 0, compact: 0, errors: 0, clamped: 0 };
    var meas = mk(4, 4), mctx = meas ? meas.getContext('2d') : null, TC = {}, TCn = 0, SC = {};

    function setParams(o) {
      if (!o) return;
      for (var key in o) if (key in DEFAULTS && o[key] != null && o[key] !== '') P[key] = typeof DEFAULTS[key] === 'number' ? (+o[key] || 0) : String(o[key]);
      if (!CORNERS[P.corner]) P.corner = 'tr'; if (o.corner) cornerNow = P.corner; P.max = clamp(Math.round(P.max) || 2, 1, 4); if (!THEMES[P.theme] && P.theme !== 'skin') P.theme = 'dusk';
    }
    setParams(opt.params); cornerNow = P.corner;
    function warn(k, msg) { if (warned[k]) return; warned[k] = 1; try { if (root.console) console.warn('[GameDNA_QuestLog] ' + msg); } catch (e) { } }
    function call(name, a, b, c) { var f = opt[name]; if (typeof f !== 'function') return undefined; try { return f(a, b, c); } catch (e) { stats.errors++; warn(name, name + '() threw: ' + (e && e.message)); return undefined; } }
    function V() {
      var v = opt.view || opt.bounds; if (typeof v === 'function') try { v = v(); } catch (e) { v = null; warn('view', 'view() threw'); }
      var r = rectOf(v); return r || { x: 0, y: 0, w: 640, h: 360 };
    }
    function safe() {
      var f = opt.safeRects || opt.uiRects, list = f;
      if (typeof f === 'function') try { list = f(); } catch (e) { list = null; warn('safe', 'safeRects() threw: ' + (e && e.message)); }
      var out = []; if (list && list.length) for (var i = 0; i < list.length; i++) { var r = rectOf(list[i]); if (r) out.push(r); }
      return out;
    }
    // keep-out zones the tracker moves away from (never covers if another corner is free): the player and the game's
    // obstacles, plus every objective marker and target on screen
    function softRects(L) {
      var out = obstacles(), M = markerList(L, null, null), u = L.F.u, sz = L.F.cr ? 6 : u;
      for (var i = 0; i < M.length; i++) { var m = M[i]; if (m.edge) continue; out.push(m.box); out.push({ x: m.tx - sz, y: m.ty - sz * 1.4, w: sz * 2, h: sz * 2.4 }); }
      return out;
    }
    function obstacles() {
      var out = [];
      if (typeof opt.obstacles === 'function') { var L0 = call('obstacles'); if (L0 && L0.length) for (var i = 0; i < L0.length; i++) { var r = rectOf(L0[i]); if (r) out.push(r); } }
      if (typeof opt.player !== 'function' || typeof opt.camera !== 'function') return out;
      var p = call('player'), cam = rectOf(call('camera')), v = V(); if (!p || !cam || !isFinite(+p.x) || !isFinite(+p.y)) return out;
      var sx = v.w / cam.w, sy = v.h / cam.h, X = v.x + (p.x - cam.x) * sx, Y = v.y + (p.y - cam.y) * sy;
      out.push({ x: X - 10 * sx, y: Y - 18 * sy, w: 20 * sx, h: 26 * sy });
      return out;
    }
    function crisp() { if (P.render === 'crisp') return true; if (P.render === 'smooth') return false; if (SK && SK.pixel) return true; return V().w <= 512; }
    function TH() {
      var base = THEMES[P.theme] || THEMES.dusk;
      if (P.theme === 'skin' && SK) {
        var tk = function (p, d) { try { var v = SK.token(p); return typeof v === 'string' && v.charAt(0) === '#' ? v : d; } catch (e) { return d; } }, o = {}, k;
        for (k in THEMES.dusk) o[k] = THEMES.dusk[k];
        var f = tk('ui.fill', '#1c1630'); o.top = rgba(f, 0.9); o.bot = rgba(tk('ui.fillTo', f), 0.9); o.text = tk('text.main', o.text); o.dim = tk('text.dim', o.dim);
        o.title = tk('text.title', o.title); o.main = tk('text.accent', o.main); o.px = [tk('ink', '#0b0814'), f, tk('ui.fillTo', f), tk('ui.edge', '#4c3f68'), o.text, o.dim, o.main];
        return o;
      }
      return base;
    }

    /* ---------------- quest data ---------------- */
    function normStep(s, i) {
      s = s || {}; var type = s.type, target = s.target;
      if (s.on != null) { var str = String(s.on), c = str.indexOf(':'); type = c < 0 ? str : str.slice(0, c); target = c < 0 ? null : str.slice(c + 1); }
      var need = Math.max(1, Math.floor(+s.count || +s.need || 1));
      return { i: i, id: s.id != null ? String(s.id) : String(i), text: String(s.text || s.title || (type + (target ? ' ' + target : ''))), type: String(type || 'custom').toLowerCase(),
        target: target == null || target === '' ? null : Array.isArray(target) ? target.map(String) : String(target), need: need, at: s.at || null, radius: +s.radius || 0, hint: s.hint ? String(s.hint) : '' };
    }
    function add(def) {
      if (!def || def.id == null) { warn('def', 'a quest without id was skipped'); return null; }
      var id = String(def.id); if (Q[id]) return Q[id];
      var steps = (def.steps || []).map(normStep); if (!steps.length) steps = [normStep({ text: def.title || id, on: 'custom:' + id }, 0)];
      var q = { id: id, title: String(def.title || id), giver: def.giver ? String(def.giver) : '', desc: def.desc ? String(def.desc) : '', reward: def.reward ? String(def.reward) : '',
        kind: def.kind === 'side' ? 'side' : 'main', next: def.next != null ? String(def.next) : null, steps: steps, status: 'inactive', step: 0, counts: steps.map(function () { return 0; }),
        startT: -1e9, doneT: -1e9, stepT: steps.map(function () { return -1e9; }), punch: -1e9, punchStep: -1, tracked: false, trackT: -1e9, order: order.length };
      Q[id] = q; order.push(id);
      if (def.auto || def.active) start(id, true);
      return q;
    }
    function trackedList() { var out = []; for (var i = 0; i < order.length; i++) { var q = Q[order[i]]; if (q.tracked) out.push(q); } return out.sort(function (a, b) { return a.trackT - b.trackT || a.order - b.order; }); }
    function liveTracked() { return trackedList().filter(function (q) { return q.status === 'active' || (q.status === 'done' && clock - q.doneT < DONE_HOLD + LEAVE + COLLAPSE); }); }
    function track(id, on) {
      var q = Q[String(id)]; if (!q || q.status !== 'active') return false;
      if (on === false) { q.tracked = false; return true; }
      if (q.tracked) return true;
      var live = liveTracked().filter(function (x) { return x.status === 'active'; });
      while (live.length >= P.max) { var drop = live.filter(function (x) { return x.kind === 'side'; })[0] || live[0]; drop.tracked = false; live.splice(live.indexOf(drop), 1); }
      q.tracked = true; q.trackT = clock; return true;
    }
    function start(id, silent) {
      var q = Q[String(id)]; if (!q) { warn('start-' + id, 'start(): unknown quest ' + id); return false; }
      if (q.status !== 'inactive') return false;
      q.status = 'active'; q.step = 0; q.startT = clock; stats.started++;
      var live = liveTracked().filter(function (x) { return x.status === 'active'; });
      if (live.length < P.max || q.kind === 'main') track(q.id, true);
      if (!silent) notice('new', q);
      call('onStart', info(q));
      return true;
    }
    function info(q) {
      return { id: q.id, title: q.title, kind: q.kind, status: q.status, step: q.step, tracked: q.tracked,
        steps: q.steps.map(function (s, i) { return { id: s.id, text: s.text, type: s.type, target: s.target, count: q.counts[i], need: s.need, done: i < q.step || q.status === 'done' }; }) };
    }
    function matches(s, type, target) {
      if (s.type !== type) return false;
      if (s.target == null || s.target === '*') return true;
      if (Array.isArray(s.target)) return s.target.indexOf(target) >= 0;
      return s.target === target;
    }
    function event(type, target, n) {
      var changes = [];
      try {
        stats.events++;
        if (type && typeof type === 'object') { n = type.n != null ? type.n : type.count; target = type.target; type = type.type; }
        type = type == null ? '' : String(type);
        if ((target == null || typeof target === 'number') && type.indexOf(':') > 0) { if (typeof target === 'number') n = target; target = type.slice(type.indexOf(':') + 1); type = type.slice(0, type.indexOf(':')); }
        type = type.toLowerCase(); target = target == null ? null : String(target);
        n = n == null ? 1 : +n;
        if (!type || !isFinite(n) || n <= 0) { stats.ignored++; stats.ignoredBad++; return changes; }
        n = Math.max(1, Math.floor(n));
        // snapshot: only quests active when the event arrives, each on the step it is on now (a quest or step that this
        // event starts or reaches never counts the same event)
        var snap = [], i, why = 'noMatch';
        for (i = 0; i < order.length; i++) { var q0 = Q[order[i]]; if (q0.status === 'active') snap.push([q0, q0.step]); else if (q0.steps.some(function (s) { return matches(s, type, target); })) { if (q0.status === 'done' && why === 'noMatch') why = 'done'; else if (why === 'noMatch') why = 'inactive'; } }
        for (i = 0; i < snap.length; i++) {
          var q = snap[i][0], si = snap[i][1];
          if (q.status !== 'active' || q.step !== si) continue;
          var s = q.steps[si];
          if (!matches(s, type, target)) { if (q.steps.some(function (x) { return matches(x, type, target); })) why = 'order'; continue; }
          var before = q.counts[si], after = Math.min(s.need, before + n);
          if (before + n > s.need) stats.clamped++;
          q.counts[si] = after; q.punch = clock; q.punchStep = si;
          var ch = { quest: q.id, step: si, count: after, need: s.need, stepDone: false, questDone: false };
          changes.push(ch);
          call('onProgress', info(q), si);
          if (after >= s.need) finishStep(q, ch);
        }
        if (changes.length) stats.applied++;
        else { stats.ignored++; stats['ignored' + why.charAt(0).toUpperCase() + why.slice(1)]++; }
      } catch (e) { stats.errors++; warn('event', 'event() failed: ' + (e && e.message)); }
      return changes;
    }
    function finishStep(q, ch) {
      q.stepT[q.step] = clock; stats.steps++; if (ch) ch.stepDone = true;
      var doneIdx = q.step;
      q.step++;
      if (q.step >= q.steps.length) { q.step = q.steps.length - 1; complete(q, ch); return; }
      call('onStep', info(q), doneIdx);
    }
    function complete(q, ch) {
      q.status = 'done'; q.doneT = clock; stats.completed++; if (ch) ch.questDone = true;
      notice('done', q);
      call('onComplete', info(q));
      if (q.next && Q[q.next]) start(q.next);
    }
    function setCount(id, n) {
      var q = Q[String(id)]; if (!q || q.status !== 'active') return null;
      n = Math.floor(+n); if (!isFinite(n)) return null;
      var s = q.steps[q.step], cur = q.counts[q.step];
      if (n <= cur) return null;
      return event(s.type, Array.isArray(s.target) ? s.target[0] : s.target, n - cur);
    }

    /* ---------------- notices (own banners or C-14 toasts) ---------------- */
    function notice(kind, q) {
      var T = opt.toasts;
      if (T && typeof T.push === 'function') {
        try {
          if (kind === 'new') T.push('quest', q.title, { label: q.kind === 'side' ? 'New side quest' : 'New quest', text: q.steps[0].text, icon: 'flag', key: 'ql-new-' + q.id });
          else T.push('achievement', q.title, { label: 'Quest complete', text: q.reward || '', icon: 'trophy', key: 'ql-done-' + q.id, priority: 'high' });
          return;
        } catch (e) { stats.errors++; warn('toasts', 'toasts.push threw; drawing own banners'); }
      }
      if (P.banner === 'off') return;
      banners.push({ kind: kind, id: q.id, title: q.title, kindQ: q.kind, sub: kind === 'done' ? q.reward : q.steps[0].text, t0: null });
    }
    function bannerLen(b) { return b.kind === 'done' ? 3000 : 2200; }
    /* Banner life (each banner is shown at most once):
       waiting (the game is quiet(), the log is open, or no spot is free) -> shown at ONE spot chosen when it opens: the full
       banner if its spot is free of the HUD, the tracker, the player, obstacles() and objective markers right now, else at once a
       small corner toast -> runs its full time. While a character stands under it, it dims to 40 % (it never moves or restarts).
       Stopped early only when the game turns quiet() (a dialogue starts) or a HUD box / the tracker reaches it: it fades out in
       200 ms (clipped off the HUD) and is dropped, not re-queued (the log has it). A banner that waited while a newer one was
       queued, or waited 9 s, is dropped too. */
    function stepBanners(Lu, dt) {
      var b = banners[0]; if (!b) return;
      var quiet = !!(typeof opt.quiet === 'function' && call('quiet')) || log.open;
      if (b.t0 == null) {
        b.wait = (b.wait || 0) + dt;
        if (b.wait > 9000 || (banners.length > 1 && b.wait > 3000)) { banners.shift(); stats.bannersDropped = (stats.bannersDropped || 0) + 1; return; }
        if (quiet) return;
        var mode = 'full', sl = bannerSlot(Lu, b, 'full');
        if (!sl) { mode = 'toast'; sl = bannerSlot(Lu, b, 'toast'); }
        if (sl) { b.pos = { x: sl.x, y: sl.y, vw: Lu.v.w }; b.mode = mode; b.t0 = clock; b.endT = null; b.dim = 0; }
        return;
      }
      if (b.endT != null) { if (clock - b.endT >= 200) banners.shift(); return; }
      if (clock - b.t0 >= bannerLen(b)) { banners.shift(); return; }
      var G = bannerGeom(Lu, b, b.mode), rect = { x: b.pos.x, y: b.pos.y, w: G.w, h: G.h };
      var blocked = Lu.v.w !== b.pos.vw || Lu.S.some(function (r) { return hit(rect, r, 2); }) || (Lu.pl && hit(rect, Lu.pl, 2));
      if (quiet || blocked) { b.endT = clock; return; }
      var ob = obstacles(), under = false; for (var oi = 0; oi < ob.length && !under; oi++) if (hit(rect, ob[oi], 0)) under = true;
      b.dim = clamp(b.dim + (under ? 1 : -1) * dt / 120, 0, 1);   // someone under it: dim to 40 %, never restart
    }

    /* ---------------- reach steps (optional player()) ---------------- */
    function checkReach() {
      if (typeof opt.player !== 'function') return;
      var p = call('player'); if (!p || !isFinite(+p.x) || !isFinite(+p.y)) return;
      for (var i = 0; i < order.length; i++) {
        var q = Q[order[i]]; if (q.status !== 'active') continue;
        var s = q.steps[q.step]; if (s.type !== 'reach' || !s.at) continue;
        var pts = Array.isArray(s.at) ? s.at : [s.at], r = s.radius || 24;
        for (var j = 0; j < pts.length; j++) if (pts[j] && Math.hypot(+pts[j].x - p.x, +pts[j].y - p.y) <= r) { event('reach', Array.isArray(s.target) ? s.target[0] : s.target); break; }
      }
    }

    function update(dt) {
      try {
        dt = +dt; if (!isFinite(dt) || dt < 0) dt = 0; dt = Math.min(dt, 250);
        clock += dt; upd++;
        checkReach();
        var Lu = layout(), under = false;
        stepBanners(Lu, dt);
        var Bu = bannerLayout(Lu);
        if (Lu.pl && !log.open) {
          var soft = softRects(Lu), over = function (pl, pad) { for (var i = 0; i < soft.length; i++) if (hit(pl, soft[i], pad || 1)) return true; return false; };
          var clear = Math.round(Lu.v.w * 0.06);   // a new corner must be clearly free: no keep-out zone within 6 % of the view
          under = over(Lu.pl);
          // hysteresis: move only when the conflict has lasted DWELL ms, never twice within COOL ms, and only to a clearly free corner
          if (under && P.dodge !== 'off') {
            softT += dt;
            if (softT >= DWELL && clock - cornerT >= COOL) for (var ci = 0, CS = ['tr', 'tl', 'br', 'bl']; ci < CS.length; ci++) {
              var c2 = CS[ci]; if (c2 === Lu.pl.corner) continue;
              var p2 = place(Lu.cards, Lu.v, Lu.S, Lu.F, Lu.W, [c2]);
              if (p2 && !over(p2, clear) && !(Bu && hit(p2, Bu, 2))) { cornerNow = c2; cornerT = clock; softT = 0; homeT = 0; under = false; hops++; break; }
            }
          } else softT = 0;
          // go home once the preferred corner has been clearly free for a while
          if (!under && cornerNow !== P.corner) { var ph = place(Lu.cards, Lu.v, Lu.S, Lu.F, Lu.W, [P.corner]); if (ph && !over(ph, clear)) { homeT += dt; if (homeT > HOME && clock - cornerT >= COOL) { cornerNow = P.corner; cornerT = clock; homeT = 0; hops++; } } else homeT = 0; }
        }
        fadeV += ((under ? 1 : 0) - fadeV) * Math.min(1, dt / 120);
        // any jump of the tracker's anchor (a HUD box appeared, a corner change) fades in at the new spot: never a snap
        var Lf = layout();
        if (Lf.pl) {
          var an = { x: Lf.pl.x, y: Lf.pl.top ? Lf.pl.y : Lf.pl.y + Lf.pl.h };
          if (lastAnchor && (Math.abs(an.x - lastAnchor.x) > 6 || Math.abs(an.y - lastAnchor.y) > 6) && clock - cornerT > 240) cornerT = clock;
          lastAnchor = an;
        } else lastAnchor = null;
      } catch (e) { stats.errors++; warn('update', 'update() failed: ' + (e && e.message)); }
    }

    /* ---------------- text measuring and drawing ---------------- */
    function U() { var v = V(); if (crisp()) return Math.max(1, Math.round(P.size ? P.size / 8 : 1)); return P.size || clamp(Math.round(v.w / 50), 11, 16); }
    function fontStr(px, weight) { return (weight || 600) + ' ' + px + 'px ' + FAMILY; }
    function pw(fn, s) { var F = pfont(fn), w = 0; for (var i = 0; i < s.length; i++) { var c = s.charAt(i); if (c === ' ') { w += F.space + 1; continue; } var g = F.g[c] || F.g['?']; w += g.w + 1; } return Math.max(0, w - 1); }
    // font descriptor: crisp {px: name, k} or smooth {size, weight}
    function measure(f, s) {
      s = String(s);
      if (f.px) return pw(f.px, s) * f.k;
      var key = f.size + '|' + f.weight + '|' + s; if (SC[key] != null) return SC[key];
      var w = s.length * f.size * 0.56; if (mctx) { mctx.font = fontStr(f.size, f.weight); w = mctx.measureText(s).width + (f.track ? f.track * s.length : 0); }
      return (SC[key] = w);
    }
    function lineH(f) { return f.px ? pfont(f.px).lineH * f.k : Math.round(f.size * 1.32); }
    function capH(f) { return f.px ? pfont(f.px).cap * f.k : Math.round(f.size * 0.74); }
    function wrap(f, s, maxW, maxLines) {
      var words = String(s).split(/\s+/), lines = [], cur = '';
      for (var i = 0; i < words.length; i++) {
        var t = cur ? cur + ' ' + words[i] : words[i];
        if (cur && measure(f, t) > maxW) { lines.push(cur); cur = words[i]; } else cur = t;
      }
      if (cur) lines.push(cur);
      if (maxLines && lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = ellip(f, lines[maxLines - 1] + ' ...', maxW); }
      for (var j = 0; j < lines.length; j++) if (measure(f, lines[j]) > maxW) lines[j] = ellip(f, lines[j], maxW);
      return lines.length ? lines : [''];
    }
    function ellip(f, s, maxW) {
      if (measure(f, s) <= maxW) return s;
      var dots = f.px ? '..' : '...';
      while (s.length > 1 && measure(f, s + dots) > maxW) s = s.slice(0, -1);
      return s.replace(/\s+$/, '') + dots;
    }
    function ptext(ctx, fname, k, s, x, y, col) {
      var key = fname + k + col + '|' + s, c = TC[key];
      if (!c) {
        var F = pfont(fname), w = Math.max(1, pw(fname, s)); c = mk(w, F.h); if (!c) return;
        var g = c.getContext('2d'); g.fillStyle = col; var xx = 0;
        for (var i = 0; i < s.length; i++) { var ch = s.charAt(i); if (ch === ' ') { xx += F.space + 1; continue; } var gl = F.g[ch] || F.g['?']; for (var r = 0; r < gl.rows.length; r++) for (var q = 0; q < gl.rows[r].length; q++) if (gl.rows[r].charAt(q) === '#') g.fillRect(xx + q, r, 1, 1); xx += gl.w + 1; }
        if (TCn > 600) { TC = {}; TCn = 0; } TC[key] = c; TCn++;
      }
      var sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      ctx.drawImage(c, Math.round(x), Math.round(y), c.width * k, c.height * k);
      ctx.imageSmoothingEnabled = sm;
    }
    // text at (x, y) = top-left of the cap box; returns box {x, y, w, h}
    function text(ctx, f, s, x, y, col, opts) {
      s = String(s); opts = opts || {};
      var w = measure(f, s), ax = opts.align === 'right' ? x - w : opts.align === 'center' ? x - w / 2 : x;
      if (ctx) {
        if (f.px) {
          if (opts.shadow) ptext(ctx, f.px, f.k, s, ax + f.k, y + f.k, opts.shadow);
          ptext(ctx, f.px, f.k, s, ax, y, col);
        } else {
          ctx.font = fontStr(f.size, f.weight); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          var base = y + capH(f);
          if (f.track) { try { ctx.letterSpacing = f.track + 'px'; } catch (e) { } }
          if (opts.shadow) { ctx.fillStyle = opts.shadow; ctx.fillText(s, ax, base + Math.max(1, f.size / 12)); }
          ctx.fillStyle = col; ctx.fillText(s, ax, base);
          if (f.track) { try { ctx.letterSpacing = '0px'; } catch (e) { } }
        }
      }
      return { x: ax, y: y, w: w, h: f.px ? pfont(f.px).h * f.k : capH(f) + Math.round(f.size * 0.26), s: s };
    }
    function sprite(ctx, rows, x, y, k, pal) {
      for (var r = 0; r < rows.length; r++) for (var c = 0; c < rows[r].length; c++) { var ch = rows[r].charAt(c), col = pal[ch]; if (!col) continue; ctx.fillStyle = col; ctx.fillRect(Math.round(x) + c * k, Math.round(y) + r * k, k, k); }
    }
    function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }

    /* ---------------- tracker layout (pure: state + clock + callbacks) ---------------- */
    function fonts() {
      var u = U();
      if (crisp()) return { cr: true, u: u, title: { px: 'reg', k: u }, step: { px: 'reg', k: u }, count: { px: 'small', k: u }, label: { px: 'small', k: u }, pad: 4 * u, gap: 2 * u, box: 7 * u, bar: 2 * u };
      var S = u;
      return { cr: false, u: S, title: { size: Math.round(S * 1.0), weight: 750 }, step: { size: Math.round(S * 0.95), weight: 520 }, count: { size: Math.round(S * 0.92), weight: 700 },
        label: { size: Math.max(9, Math.round(S * 0.72)), weight: 800, track: Math.round(S * 0.08 * 10) / 10 }, pad: Math.round(S * 0.7), gap: Math.round(S * 0.42), box: Math.round(S * 0.95), bar: Math.max(2, Math.round(S * 0.2)) };
    }
    function cardFor(q, F, W, compact) {
      var rows = [], inner = W - F.pad * 2, t = clock, age = t - q.startT, slim = compact === 'slim';
      var hint = !compact && P.keyHint && q === liveTracked()[0] ? P.keyHint : '';
      var hintW = hint ? measure(F.label, hint) + (F.cr ? 6 * F.u : F.pad * 1.2) : 0;
      var sc0 = q.steps[q.step], scnt = slim && q.status === 'active' && sc0.need > 1 ? Math.min(q.counts[q.step], sc0.need) + '/' + sc0.need : '';
      var scW = scnt ? measure(F.count, scnt) + F.gap : 0;
      var tl = wrap(F.title, q.title, inner - F.box - F.gap - hintW - scW, 2);
      rows.push({ kind: 'title', h: tl.length * lineH(F.title), lines: tl, text: tl[0], hint: hint, tag: q.status === 'done', cnt: scnt });
      var countW = 0, s, i;
      function stepRow(idx, state, fade) {
        s = q.steps[idx];
        // a finished step shows only its tick and strike; on narrow cards the counter moves under the text, beside the bar
        var cnt = state === 'done' ? '' : s.need > 1 ? Math.min(q.counts[idx], s.need) + '/' + s.need : '';
        var below = !!cnt && W < (F.cr ? 112 : F.u * 15.5), cw = cnt && !below ? measure(F.count, cnt) + F.gap : 0;
        var lines = wrap(F.step, s.text, inner - F.box - F.gap - cw, compact ? 1 : 2);
        var h = lines.length * lineH(F.step) + (below ? lineH(F.count) : P.bars === 'on' && s.need > 1 && state === 'cur' ? F.bar + F.gap : 0);
        return { kind: 'step', idx: idx, state: state, lines: lines, cnt: cnt, cw: cw, h: h, fade: fade, below: below };
      }
      if (slim) { /* title (and the current counter) only */ }
      else if (q.status === 'done') {
        rows.push(Object.assign(stepRow(q.steps.length - 1, 'done', 1), { check: clamp((t - q.doneT) / CHECK, 0, 1) }));
      } else {
      if (!slim && q.status !== 'done') {
        var prev = q.step - 1, since = prev >= 0 ? t - q.stepT[prev] : 1e9;
        if (!compact && prev >= 0 && since < P.hold + COLLAPSE) {
          var col = since < P.hold ? 1 : 1 - easeIn((since - P.hold) / COLLAPSE);
          var r0 = stepRow(prev, 'done', 1); r0.check = clamp(since / CHECK, 0, 1); r0.collapse = col; rows.push(r0);
        }
        var r1 = stepRow(q.step, 'cur', prev >= 0 && since < P.hold + COLLAPSE ? ease((since - 200) / 380) : 1);
        rows.push(r1);
      }}
      var h = 0; for (i = 0; i < rows.length; i++) h += rows[i].h * (rows[i].collapse != null ? rows[i].collapse : 1) + (i ? F.gap : 0);
      var appear = ease((t - Math.max(q.startT, q.trackT)) / APPEAR), leave = 1, gone = 0;
      if (q.status === 'done') { var la = t - q.doneT - DONE_HOLD; leave = 1 - ease(la / LEAVE); gone = la > LEAVE ? ease((la - LEAVE) / COLLAPSE) : 0; }
      var cardH = Math.round(h + F.pad * 2);
      return { q: q, rows: rows, w: W, h: cardH, hEff: (cardH + F.gap * 1.5) * (1 - gone), alpha: Math.min(appear, leave), slide: (1 - appear) * 0.35 + (1 - leave) * 0.25, age: age };
    }
    // one line for phones: quest gem, the current objective (or "Quest complete"), its counter, "+N" for other tracked quests
    function pillCard(list, F, W) {
      var q = list[0], inner = W - F.pad * 2, more = list.length - 1, s = q.steps[q.step], done = q.status === 'done';
      var cnt = !done && s.need > 1 ? Math.min(q.counts[q.step], s.need) + '/' + s.need : '', moreS = more > 0 ? '+' + more : '';
      var cw = (cnt ? measure(F.count, cnt) + F.gap : 0) + (moreS ? measure(F.label, moreS) + (F.cr ? 6 * F.u : F.pad * 1.2) : 0);
      var str = done ? 'Quest complete' : s.text, avail = inner - F.box - F.gap - cw, tf = F.title;
      // shrink the type (down to 82 %) before cutting the objective
      if (!F.cr) for (var k = 0; k < 4 && measure(tf, str) > avail; k++) tf = { size: Math.round(F.title.size * (0.94 - k * 0.04)), weight: 700 };
      else if (measure(tf, str) > avail) tf = F.step;
      var line = ellip(tf, str, avail);
      var c = cardFor(q, F, W, 'slim');
      c.rows = [{ kind: 'title', h: lineH(F.title), lines: [line], text: line, hint: moreS, tag: done, cnt: cnt, font: tf }];
      c.h = Math.round(lineH(F.title) + F.pad * 2); c.hEff = (c.h + F.gap * 1.5) * (c.hEff > 0 ? 1 : 0); c.pill = true;
      return c;
    }
    function trackerWidth(F, v) {
      if (P.width > 0) return Math.round(clamp(v.w * P.width, 60, v.w - 8));
      if (F.cr) return Math.round(clamp(v.w * 0.27, 84, 116) * F.u);
      return Math.round(clamp(v.w * 0.22, F.u * 12.5, v.w * 0.5));
    }
    function place(cards, v, S, F, W, prefIn) {
      var m = P.margin || (F.cr ? 4 : Math.max(6, Math.round(v.w * 0.018))), gap = F.cr ? 2 : Math.round(F.u * 0.4);
      var H = 0; for (var i = 0; i < cards.length; i++) H += cards[i].hEff;
      H = Math.max(0, Math.round(H - F.gap * 1.5 + 0.5));
      var pref = prefIn || [cornerNow].concat(['tr', 'tl', 'br', 'bl'].filter(function (c) { return c !== cornerNow; }));
      for (var p = 0; p < pref.length; p++) {
        var c = pref[p], right = c.charAt(1) === 'r', top = c.charAt(0) === 't';
        var x = right ? v.x + v.w - m - W : v.x + m, y = top ? v.y + m : v.y + v.h - m - H, tries = 0, moved = true;
        while (moved && tries++ < 12) {
          moved = false;
          for (var j = 0; j < S.length; j++) {
            var box = { x: x, y: y, w: W, h: Math.max(1, H) };
            if (hit(box, S[j], gap - 0.01)) { y = top ? S[j].y + S[j].h + gap : S[j].y - gap - H; moved = true; }
          }
          if (y < v.y || y + H > v.y + v.h) break;
        }
        if (!moved && y >= v.y - 0.5 && y + H <= v.y + v.h + 0.5) return { x: Math.round(x), y: Math.round(y), w: W, h: H, corner: c, top: top };
      }
      return null;
    }
    function layout() {
      var v = V(), S = safe(), F = fonts(), W = trackerWidth(F, v), list = liveTracked(), compact = false, cards, pl = null;
      var narrow = F.cr ? v.w < 300 : v.w < 520;   // phones and small pixel screens: one compact line (tap to expand)
      if (narrow && !expanded && list.length) { W = Math.round(Math.min(v.w * 0.5, W * 1.3)); cards = [pillCard(list, F, W)]; }
      else cards = list.map(function (q, i) { return cardFor(q, F, W, narrow && i > 0 ? 'slim' : false); });
      if (cards.length) pl = place(cards, v, S, F, W);
      if (cards.length && !pl) { compact = true; cards = [cardFor(list[0], F, W, true)]; pl = place(cards, v, S, F, W); }
      return { v: v, S: S, F: F, W: W, cards: cards, pl: pl, compact: compact };
    }

    /* ---------------- drawing: tracker ---------------- */
    function accentOf(q, th) { return q.kind === 'side' ? th.side : th.main; }
    function drawCardSmooth(ctx, c, x, y, F, th, texts) {
      var q = c.q, acc = accentOf(q, th), u = F.u, rad = Math.round(u * 0.55), w = c.w, h = c.h;
      ctx.save(); ctx.globalAlpha *= c.alpha; var gaText = ctx.globalAlpha; ctx.globalAlpha = gaText * (c.bg == null ? 1 : c.bg);
      ctx.shadowColor = th.shadow; ctx.shadowBlur = u * 1.1; ctx.shadowOffsetY = u * 0.25;
      var gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, th.top); gr.addColorStop(1, th.bot);
      rr(ctx, x, y, w, h, rad); ctx.fillStyle = gr; ctx.fill(); ctx.shadowColor = 'rgba(0,0,0,0)';
      // accent wash and left strip
      var wash = ctx.createLinearGradient(x, 0, x + w * 0.6, 0); wash.addColorStop(0, rgba(acc, 0.16)); wash.addColorStop(1, rgba(acc, 0));
      rr(ctx, x, y, w, h, rad); ctx.fillStyle = wash; ctx.fill();
      ctx.save(); rr(ctx, x, y, w, h, rad); ctx.clip(); ctx.fillStyle = acc; ctx.fillRect(x, y, Math.max(2, Math.round(u * 0.22)), h); ctx.restore();
      rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, rad); ctx.strokeStyle = th.edge; ctx.lineWidth = 1; ctx.stroke();
      ctx.globalAlpha = gaText;   // text and icons stay at full strength over a faded panel
      // completion sheen
      var dAge = q.status === 'done' ? clock - q.doneT : -1;
      if (dAge >= 0 && dAge < 900) {
        ctx.save(); rr(ctx, x, y, w, h, rad); ctx.clip(); var sx = x - w * 0.4 + (w * 1.8) * (dAge / 900);
        var sh = ctx.createLinearGradient(sx - u * 3, 0, sx + u * 3, 0); sh.addColorStop(0, rgba(acc, 0)); sh.addColorStop(0.5, rgba(acc, 0.35)); sh.addColorStop(1, rgba(acc, 0));
        ctx.fillStyle = sh; ctx.fillRect(x, y, w, h); ctx.restore();
      }
      var cx = x + F.pad, cy = y + F.pad, boxS = F.box;
      for (var i = 0; i < c.rows.length; i++) {
        var r = c.rows[i], col = r.collapse != null ? r.collapse : 1;
        if (col <= 0.02) { cy += 0; continue; }
        ctx.save(); ctx.beginPath(); ctx.rect(x, cy - 1, w, r.h * col + 2); ctx.clip();
        if (r.kind === 'title') {
          // quest gem
          var gy = cy + lineH(F.title) / 2 - 1, gs = boxS * 0.48;
          ctx.beginPath(); ctx.moveTo(cx + boxS / 2, gy - gs); ctx.lineTo(cx + boxS / 2 + gs * 0.8, gy); ctx.lineTo(cx + boxS / 2, gy + gs); ctx.lineTo(cx + boxS / 2 - gs * 0.8, gy); ctx.closePath();
          ctx.fillStyle = acc; ctx.fill(); ctx.strokeStyle = rgba('#000000', 0.45); ctx.lineWidth = 1; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx + boxS / 2, gy - gs); ctx.lineTo(cx + boxS / 2 - gs * 0.8, gy); ctx.lineTo(cx + boxS / 2, gy); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
          for (var TL = 0; TL < r.lines.length; TL++) {
            var ty = cy + TL * lineH(F.title) + (lineH(F.title) - capH(F.title)) / 2 - 1;
            var rf2 = r.font || F.title; if (r.font) ty = cy + (lineH(F.title) - capH(rf2)) / 2 - 1;
            texts.push(Object.assign(text(ctx, rf2, r.lines[TL], cx + boxS + F.gap, ty, r.tag ? acc : th.title, { shadow: P.theme === 'parchment' ? null : 'rgba(0,0,0,0.55)' }), { box: 'card', a: gaText }));
          }
          if (r.cnt) texts.push(Object.assign(text(ctx, F.count, r.cnt, x + w - F.pad - (r.hint ? measure(F.label, r.hint) + F.pad * 1.2 : 0), cy + (lineH(F.title) - capH(F.count)) / 2 - 1, th.count, { align: 'right', shadow: 'rgba(0,0,0,0.5)' }), { box: 'card', a: gaText }));
          if (r.hint) {
            var hw = measure(F.label, r.hint), kx = x + w - F.pad - hw, kh = capH(F.label) + Math.round(u * 0.5), ky = cy + (lineH(F.title) - kh) / 2 - 1;
            rr(ctx, kx - u * 0.35, ky, hw + u * 0.7, kh, u * 0.25); ctx.fillStyle = rgba(th.text, 0.12); ctx.fill(); ctx.strokeStyle = rgba(th.text, 0.35); ctx.lineWidth = 1; ctx.stroke();
            texts.push(Object.assign(text(ctx, F.label, r.hint, kx, ky + (kh - capH(F.label)) / 2, th.dim), { box: 'card' }));
          }
        } else {
          var fade = r.fade == null ? 1 : r.fade, done = r.state === 'done';
          ctx.globalAlpha *= clamp(fade, 0, 1);
          var off = 0, by = cy + (lineH(F.step) - boxS) / 2;   // the next objective fades in place (no sideways slide past the card edge)
          // checkbox
          rr(ctx, cx + off + 0.5, by + 0.5, boxS - 1, boxS - 1, u * 0.18); ctx.strokeStyle = done ? th.ok : th.box; ctx.lineWidth = Math.max(1, u * 0.1); ctx.stroke();
          if (done) {
            var ck = r.check == null ? 1 : r.check;
            rr(ctx, cx + off + 0.5, by + 0.5, boxS - 1, boxS - 1, u * 0.18); ctx.fillStyle = rgba(th.ok, 0.9 * ck); ctx.fill();
            ctx.beginPath(); var p0 = [cx + off + boxS * 0.22, by + boxS * 0.52], p1 = [cx + off + boxS * 0.42, by + boxS * 0.72], p2 = [cx + off + boxS * 0.8, by + boxS * 0.28];
            ctx.moveTo(p0[0], p0[1]);
            if (ck < 0.4) ctx.lineTo(p0[0] + (p1[0] - p0[0]) * ck / 0.4, p0[1] + (p1[1] - p0[1]) * ck / 0.4);
            else { ctx.lineTo(p1[0], p1[1]); var k2 = (ck - 0.4) / 0.6; ctx.lineTo(p1[0] + (p2[0] - p1[0]) * k2, p1[1] + (p2[1] - p1[1]) * k2); }
            ctx.strokeStyle = '#10241a'; ctx.lineWidth = Math.max(1.5, u * 0.16); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
          }
          var tx0 = cx + off + boxS + F.gap, tcol = done ? th.dim : th.text, ly = cy;
          for (var L = 0; L < r.lines.length; L++) {
            if (ly - cy + lineH(F.step) > r.h * col + 1) break;   // clipped by the collapse: not drawn, not recorded
            var tb = text(ctx, F.step, r.lines[L], tx0, ly + (lineH(F.step) - capH(F.step)) / 2 - 1, tcol, { shadow: done || P.theme === 'parchment' ? null : 'rgba(0,0,0,0.5)' });
            texts.push(Object.assign(tb, { box: 'card' }));
            if (done) { var sk = clamp(((r.check == null ? 1 : r.check) - 0.3) / 0.7, 0, 1); ctx.fillStyle = rgba(th.dim, 0.9); ctx.fillRect(tb.x - 1, Math.round(ly + lineH(F.step) / 2), (tb.w + 2) * sk, Math.max(1, Math.round(u * 0.09))); }
            ly += lineH(F.step);
          }
          if (col < 0.98 && lineH(F.step) > r.h * col + 1) { /* row almost gone: no counter */ }
          else if (r.cnt === 'COMPLETE') texts.push(Object.assign(text(ctx, F.label, r.cnt, x + w - F.pad, cy + (lineH(F.step) - capH(F.label)) / 2 - 1, th.ok, { align: 'right' }), { box: 'card' }));
          else if (r.cnt) {
            var pk = !done && q.punchStep === r.idx ? bump(clock - q.punch, PUNCH) : 0, full = q.counts[r.idx] >= q.steps[r.idx].need;
            var ccol = done || full ? th.ok : pk > 0.05 ? mix(th.count, acc, clamp(pk, 0, 1)) : th.count;
            var cxr = x + w - F.pad, cyc = r.below ? cy + r.lines.length * lineH(F.step) + (lineH(F.count) - capH(F.count)) / 2 - 1 : cy + (lineH(F.step) - capH(F.count)) / 2 - 1;
            if (pk > 0.01) { ctx.save(); var sc = 1 + 0.32 * pk, cwid = measure(F.count, r.cnt); ctx.translate(cxr - cwid / 2, cyc + capH(F.count) / 2); ctx.scale(sc, sc); text(ctx, F.count, r.cnt, cwid / 2, -capH(F.count) / 2, ccol, { align: 'right', shadow: 'rgba(0,0,0,0.5)' }); ctx.restore(); texts.push({ x: cxr - measure(F.count, r.cnt), y: cyc, w: measure(F.count, r.cnt), h: capH(F.count) + 3, s: r.cnt, box: 'card' }); }
            else texts.push(Object.assign(text(ctx, F.count, r.cnt, cxr, cyc, ccol, { align: 'right', shadow: P.theme === 'parchment' ? null : 'rgba(0,0,0,0.5)' }), { box: 'card' }));
            if (r.state === 'cur' && P.bars === 'on') {
              var bw = x + w - F.pad - tx0 - (r.below ? measure(F.count, r.cnt) + F.gap : 0), byb = r.below ? cyc + capH(F.count) / 2 - F.bar / 2 + 1 : cy + r.lines.length * lineH(F.step) + F.gap * 0.5, need = q.steps[r.idx].need;
              var fillTo = q.counts[r.idx] / need, prevF = Math.max(0, q.counts[r.idx] - 1) / need, grow = pk > 0 ? prevF + (fillTo - prevF) * ease((clock - q.punch) / 260) : fillTo;
              rr(ctx, tx0, byb, bw, F.bar, F.bar / 2); ctx.fillStyle = th.track; ctx.fill();
              if (grow > 0) { var bg = ctx.createLinearGradient(tx0, 0, tx0 + bw, 0); bg.addColorStop(0, mix(acc, '#ffffff', 0.15)); bg.addColorStop(1, acc); rr(ctx, tx0, byb, Math.max(F.bar, bw * grow), F.bar, F.bar / 2); ctx.fillStyle = bg; ctx.fill(); }
            }
          }
        }
        ctx.restore();
        cy += r.h * col + F.gap;
      }
      ctx.restore();
    }
    function drawCardCrisp(ctx, c, x, y, F, th, texts) {
      var q = c.q, k = F.u, P8 = th.px, acc = accentOf(q, th), w = c.w, h = c.h;
      var a = Math.round(c.alpha * 4) / 4; if (a <= 0) return;
      ctx.save(); ctx.globalAlpha *= a; var gaT = ctx.globalAlpha; ctx.globalAlpha = gaT * (c.bg != null && c.bg < 0.9 ? 0.75 : 1);
      ctx.fillStyle = P8[0]; ctx.fillRect(x - k, y, w + 2 * k, h); ctx.fillRect(x, y - k, w, h + 2 * k);
      ctx.fillStyle = P8[2]; ctx.fillRect(x, y, w, h); ctx.fillStyle = P8[1]; ctx.fillRect(x, y, w, Math.round(h / 2));
      ctx.fillStyle = P8[3]; ctx.fillRect(x, y, w, k); ctx.globalAlpha = gaT; ctx.fillStyle = acc; ctx.fillRect(x, y, 2 * k, h);
      var dAge = q.status === 'done' ? clock - q.doneT : -1;
      if (dAge >= 0 && dAge < 720 && Math.floor(dAge / 120) % 2 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 2 * k, h); ctx.fillStyle = rgba(acc, 0.18); ctx.fillRect(x + 2 * k, y + k, w - 2 * k, h - k); }
      var pal = { o: P8[0], a: acc, l: mix(acc, '#ffffff', 0.5), d: mix(acc, '#000000', 0.35), w: '#ffffff' };
      var cx = x + F.pad, cy = y + F.pad;
      for (var i = 0; i < c.rows.length; i++) {
        var r = c.rows[i], col = r.collapse != null ? r.collapse : 1;
        if (col <= 0.02) continue;
        var rh = Math.round(r.h * col);
        ctx.save(); ctx.beginPath(); ctx.rect(x, cy - k, w, rh + 2 * k); ctx.clip();
        if (r.kind === 'title') {
          sprite(ctx, PX.gem, cx, cy, k, pal);
          for (var TL = 0; TL < r.lines.length; TL++) texts.push(Object.assign(text(ctx, F.title, r.lines[TL], cx + 9 * k, cy + TL * lineH(F.title), th.px[6], { shadow: P8[0] }), { box: 'card', a: a }));
          if (r.cnt) texts.push(Object.assign(text(ctx, F.count, r.cnt, x + w - F.pad - (r.hint ? measure(F.label, r.hint) + 6 * k : 0), cy + k, P8[4], { align: 'right', shadow: P8[0] }), { box: 'card', a: a }));
          var rx = x + w - F.pad;
          if (r.hint) { var hw = measure(F.label, r.hint); ctx.fillStyle = P8[3]; ctx.fillRect(rx - hw - 2 * k, cy, hw + 3 * k, 7 * k); ctx.fillStyle = P8[0]; ctx.fillRect(rx - hw - 2 * k, cy + 7 * k, hw + 3 * k, k); texts.push(Object.assign(text(ctx, F.label, r.hint, rx - hw, cy + k, P8[4]), { box: 'card' })); rx -= hw + 5 * k; }
        } else {
          var fade = r.fade == null ? 1 : r.fade; if (fade < 0.5) { ctx.restore(); cy += rh + F.gap; continue; }
          var done = r.state === 'done', by = cy + Math.round((lineH(F.step) - 7 * k) / 2) - k;
          var ck = r.check == null ? 1 : r.check;
          sprite(ctx, done && ck >= 0.5 ? PX.tick : PX.box, cx, by, k, { o: done ? '#2a7a48' : P8[5], a: '#6ad88a', w: '#ffffff' });
          var tx0 = cx + 9 * k, ly = cy;
          for (var L = 0; L < r.lines.length; L++) {
            if (ly - cy + lineH(F.step) > rh + k) break;
            var tb = text(ctx, F.step, r.lines[L], tx0, ly, done ? P8[5] : P8[4], { shadow: done ? null : P8[0] });
            texts.push(Object.assign(tb, { box: 'card' }));
            if (done && ck >= 1) { ctx.fillStyle = P8[5]; ctx.fillRect(tb.x - k, ly + 4 * k, tb.w + 2 * k, k); }
            ly += lineH(F.step);
          }
          if (col < 0.98 && lineH(F.step) > rh + k) { /* row almost gone */ }
          else if (r.cnt === 'DONE') texts.push(Object.assign(text(ctx, F.label, r.cnt, x + w - F.pad, cy + k, '#6ad88a', { align: 'right', shadow: P8[0] }), { box: 'card' }));
          else if (r.cnt) {
            var pk = !done && q.punchStep === r.idx ? bump(clock - q.punch, PUNCH) : 0, full = q.counts[r.idx] >= q.steps[r.idx].need;
            var ccol = done || full ? '#6ad88a' : pk > 0.2 ? '#ffffff' : th.px[6];
            var ccy = r.below ? cy + r.lines.length * lineH(F.step) + k : cy + k;
            texts.push(Object.assign(text(ctx, F.count, r.cnt, x + w - F.pad, ccy - (pk > 0.3 ? k : 0), ccol, { align: 'right', shadow: P8[0] }), { box: 'card' }));
            if (r.state === 'cur' && P.bars === 'on') {
              var bw = x + w - F.pad - tx0 - (r.below ? measure(F.count, r.cnt) + 3 * k : 0), byb = r.below ? ccy + 2 * k : cy + r.lines.length * lineH(F.step), need = q.steps[r.idx].need, fw = Math.round(bw * q.counts[r.idx] / need);
              ctx.fillStyle = P8[0]; ctx.fillRect(tx0, byb, bw, F.bar); if (fw > 0) { ctx.fillStyle = acc; ctx.fillRect(tx0, byb, fw, F.bar); ctx.fillStyle = pal.l; ctx.fillRect(tx0, byb, fw, k); }
            }
          }
        }
        ctx.restore();
        cy += rh + F.gap;
      }
      ctx.restore();
    }

    /* ---------------- banners ---------------- */
    function bannerGeom(L, b, mode) {
      var v = L.v, F = L.F, done = b.kind === 'done', toast = mode === 'toast';
      var label = done ? 'QUEST COMPLETE' : b.kindQ === 'side' ? 'NEW SIDE QUEST' : 'NEW QUEST';
      var tf = F.cr ? { px: 'reg', k: F.u } : { size: Math.round(F.u * (toast ? 1.0 : done ? 1.6 : 1.3)), weight: 800 };
      var lf = F.cr ? { px: 'small', k: F.u } : { size: Math.max(9, Math.round(F.u * (toast ? 0.68 : 0.78))), weight: 800, track: Math.round(F.u * (toast ? 0.08 : 0.14)) };
      var sf = F.cr ? { px: 'small', k: F.u } : { size: Math.round(F.u * 0.9), weight: 520 };
      var maxW = toast ? Math.min(v.w * 0.6, F.cr ? 150 : F.u * 18) : Math.min(v.w - 16, F.cr ? v.w - 12 : F.u * 34);
      var side = toast ? (F.cr ? 10 : F.u * 1.6) : (F.cr ? 16 : F.u * 4);
      var title = ellip(tf, b.title, maxW - side), sub = !toast && b.sub ? ellip(sf, (done && !F.cr ? 'Reward: ' : '') + b.sub, maxW - side) : '';
      var w = Math.round(Math.min(maxW, Math.max(measure(tf, title), measure(lf, label), sub ? measure(sf, sub) : 0) + (toast ? (F.cr ? 14 : F.u * 2.4) : (F.cr ? 24 : F.u * 7))));
      var gap = F.cr ? 3 * F.u : Math.round(F.u * (toast ? 0.3 : 0.45)), padY = F.cr ? 4 * F.u : Math.round(F.u * (toast ? 0.5 : 0.75));
      var h = Math.round(padY * 2 + capH(lf) + gap + lineH(tf) + (sub ? gap + capH(sf) + 2 : 0));
      return { label: label, title: title, sub: sub, tf: tf, lf: lf, sf: sf, gap: gap, padY: padY, w: w, h: h, toast: toast, done: done };
    }
    // one slot, chosen when the banner opens: clear of the HUD, the tracker, the player, obstacles() and objective markers
    function bannerSlot(L, b, mode) {
      var v = L.v, F = L.F, G = bannerGeom(L, b, mode), w = G.w, h = G.h, tr = L.pl, m = F.cr ? 4 : Math.round(F.u * 0.8);
      var keep = L.S.slice(); if (tr) keep.push(tr);
      var soft = obstacles(), M = markerList(L, null, null); for (var i = 0; i < M.length; i++) if (!M[i].hidden) soft.push(M[i].box);
      var free = function (x, y) { if (x < v.x + 2 || x + w > v.x + v.w - 2 || y < v.y + 2 || y + h > v.y + v.h - 2) return false; var r = { x: x, y: y, w: w, h: h }; for (var k = 0; k < keep.length; k++) if (hit(r, keep[k], 2)) return false; for (k = 0; k < soft.length; k++) if (hit(r, soft[k], 3)) return false; return true; };
      var C = [];
      if (mode === 'full') {
        var x0 = Math.round(v.x + (v.w - w) / 2), xs = [x0];
        if (tr) xs.push(tr.x + tr.w / 2 > v.x + v.w / 2 ? Math.round(tr.x - m - w) : Math.round(tr.x + tr.w + m));
        [0.16, 0.05, 0.3, 0.58, 0.44, 0.72].forEach(function (f) { xs.forEach(function (xx) { C.push([xx, v.y + Math.round(v.h * f)]); }); });
        C.push([x0, Math.round(v.y + v.h * 0.82 - h / 2)]);
      } else {
        var ys = [v.y + m, v.y + v.h - m - h, Math.round(v.y + v.h * 0.3), Math.round(v.y + v.h * 0.55)];
        ys.forEach(function (yy) { C.push([Math.round(v.x + (v.w - w) / 2), yy]); C.push([v.x + m, yy]); C.push([v.x + v.w - m - w, yy]); });
      }
      for (var c = 0; c < C.length; c++) if (free(C[c][0], C[c][1])) return { x: C[c][0], y: C[c][1] };
      return null;
    }
    function bannerLayout(L) {
      var b = banners[0]; if (!b || b.t0 == null || !b.pos) return null;
      var G = bannerGeom(L, b, b.mode), age = clock - b.t0, len = bannerLen(b);
      var inT = ease(age / 280), outT = age > len - 320 ? 1 - ease((age - (len - 320)) / 320) : 1, stop = (b.endT != null ? 1 - ease((clock - b.endT) / 200) : 1) * (1 - 0.6 * (b.dim || 0));
      var o = { b: b, x: b.pos.x, y: b.pos.y, open: inT, alpha: Math.min(inT, outT) * stop, age: age, fading: b.endT != null };
      for (var k in G) o[k] = G[k];
      return o;
    }
    function drawBanner(ctx, B, L, th, texts) {
      var F = L.F, acc = B.b.kindQ === 'side' ? th.side : th.main, cxm = B.x + B.w / 2;
      ctx.save();
      if (F.cr) {
        var a = Math.round(B.alpha * 4) / 4; if (a <= 0) { ctx.restore(); return; } ctx.globalAlpha *= a;
        var k = F.u, ww = Math.round(B.w * Math.max(0.2, B.open)), x0 = Math.round(cxm - ww / 2), P8 = th.px;
        ctx.fillStyle = P8[0]; ctx.fillRect(x0 - 2 * k, B.y, ww + 4 * k, B.h); ctx.fillStyle = P8[2]; ctx.fillRect(x0, B.y + k, ww, B.h - 2 * k);
        ctx.fillStyle = acc; ctx.fillRect(x0, B.y + k, ww, k); ctx.fillRect(x0, B.y + B.h - 2 * k, ww, k);
        ctx.fillStyle = P8[0]; ctx.fillRect(x0 - 4 * k, B.y + 3 * k, 2 * k, B.h - 6 * k); ctx.fillRect(x0 + ww + 2 * k, B.y + 3 * k, 2 * k, B.h - 6 * k);
        if (B.open >= 0.95) {
          var y = B.y + B.padY, pal = { o: P8[0], a: acc, l: mix(acc, '#ffffff', 0.5), d: mix(acc, '#000000', 0.35), w: '#ffffff' };
          var lw = measure(B.lf, B.label); sprite(ctx, PX.gem, Math.round(cxm - lw / 2) - 10 * k, y - k, k, pal); sprite(ctx, PX.gem, Math.round(cxm + lw / 2) + 3 * k, y - k, k, pal);
          texts.push(Object.assign(text(ctx, B.lf, B.label, cxm, y, acc, { align: 'center', shadow: P8[0] }), { box: 'banner' })); y += capH(B.lf) + B.gap;
          texts.push(Object.assign(text(ctx, B.tf, B.title, cxm, y, P8[4], { align: 'center', shadow: P8[0] }), { box: 'banner' })); y += lineH(B.tf) + B.gap - 2 * k;
          if (B.sub) texts.push(Object.assign(text(ctx, B.sf, B.sub, cxm, y, P8[5], { align: 'center' }), { box: 'banner' }));
        }
      } else if (B.toast) {   // small toast card in a free corner (no banner slot was free)
        ctx.globalAlpha *= B.alpha;
        var u0 = F.u, gr0 = ctx.createLinearGradient(0, B.y, 0, B.y + B.h); gr0.addColorStop(0, th.top); gr0.addColorStop(1, th.bot);
        ctx.shadowColor = th.shadow; ctx.shadowBlur = u0; ctx.shadowOffsetY = u0 * 0.2; rr(ctx, B.x, B.y, B.w, B.h, u0 * 0.5); ctx.fillStyle = gr0; ctx.fill(); ctx.shadowColor = 'rgba(0,0,0,0)';
        ctx.save(); rr(ctx, B.x, B.y, B.w, B.h, u0 * 0.5); ctx.clip(); ctx.fillStyle = acc; ctx.fillRect(B.x, B.y, Math.max(2, Math.round(u0 * 0.22)), B.h); ctx.restore();
        rr(ctx, B.x + 0.5, B.y + 0.5, B.w - 1, B.h - 1, u0 * 0.5); ctx.strokeStyle = th.edge; ctx.lineWidth = 1; ctx.stroke();
        var ty0 = B.y + B.padY, tx = B.x + u0 * 1.2;
        texts.push(Object.assign(text(ctx, B.lf, B.label, tx, ty0, acc), { box: 'banner' }));
        texts.push(Object.assign(text(ctx, B.tf, B.title, tx, ty0 + capH(B.lf) + B.gap + (lineH(B.tf) - capH(B.tf)) / 2 - 1, th.title, { shadow: P.theme === 'parchment' ? null : 'rgba(0,0,0,0.55)' }), { box: 'banner' }));
      } else {
        ctx.globalAlpha *= B.alpha;
        var u = F.u, half = B.w / 2 * Math.max(0.15, B.open);
        var g = ctx.createLinearGradient(cxm - half - u * 3, 0, cxm + half + u * 3, 0);
        var dark = P.theme === 'parchment' ? '#2a1a0c' : '#0c0a16';
        g.addColorStop(0, rgba(dark, 0)); g.addColorStop(0.16, rgba(dark, 0.82)); g.addColorStop(0.84, rgba(dark, 0.82)); g.addColorStop(1, rgba(dark, 0));
        ctx.fillStyle = g; ctx.fillRect(cxm - half - u * 3, B.y, half * 2 + u * 6, B.h);
        var lg = ctx.createLinearGradient(cxm - half, 0, cxm + half, 0); lg.addColorStop(0, rgba(acc, 0)); lg.addColorStop(0.5, rgba(acc, 0.95)); lg.addColorStop(1, rgba(acc, 0));
        ctx.fillStyle = lg; ctx.fillRect(cxm - half, B.y, half * 2, Math.max(1, u * 0.12)); ctx.fillRect(cxm - half, B.y + B.h - Math.max(1, u * 0.12), half * 2, Math.max(1, u * 0.12));
        var y2 = B.y + B.padY, ta = ease((B.age - 140) / 260);
        ctx.globalAlpha *= ta;
        var lw2 = measure(B.lf, B.label), lx = cxm - lw2 / 2;
        // flourishes: thin lines with a diamond at the outer end
        var fl = u * 2.6, fy = y2 + capH(B.lf) / 2;
        ctx.fillStyle = acc; ctx.fillRect(lx - u * 0.6 - fl, fy - 0.5, fl, 1); ctx.fillRect(lx + lw2 + u * 0.6, fy - 0.5, fl, 1);
        [lx - u * 0.6 - fl, lx + lw2 + u * 0.6 + fl].forEach(function (dx) { ctx.beginPath(); ctx.moveTo(dx, fy - u * 0.28); ctx.lineTo(dx + u * 0.28, fy); ctx.lineTo(dx, fy + u * 0.28); ctx.lineTo(dx - u * 0.28, fy); ctx.closePath(); ctx.fill(); });
        texts.push(Object.assign(text(ctx, B.lf, B.label, lx, y2, acc), { box: 'banner' })); y2 += capH(B.lf) + B.gap;
        var tb = text(ctx, B.tf, B.title, cxm, y2 + (lineH(B.tf) - capH(B.tf)) / 2 - 1, th.title === '#4a230c' ? '#fff4dc' : th.title, { align: 'center', shadow: 'rgba(0,0,0,0.6)' });
        texts.push(Object.assign(tb, { box: 'banner' }));
        if (B.done && B.age > 200 && B.age < 1400) {   // shine: the title drawn again with a moving light gradient (letters only)
          var sxx = tb.x - u * 2 + (tb.w + u * 4) * ((B.age - 200) / 1200), sg = ctx.createLinearGradient(sxx - u * 2, 0, sxx + u * 2, 0);
          sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.6)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.font = fontStr(B.tf.size, B.tf.weight); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = sg; ctx.fillText(B.title, tb.x, tb.y + capH(B.tf));
        }
        y2 += lineH(B.tf) + B.gap - Math.round(u * 0.3);
        if (B.sub) texts.push(Object.assign(text(ctx, B.sf, B.sub, cxm, y2, P.theme === 'parchment' ? '#e8d6b0' : '#c9c2dc', { align: 'center' }), { box: 'banner' }));
      }
      ctx.restore();
    }

    /* ---------------- world markers ---------------- */
    function markerList(L, tr, bannerRect) {
      if (P.markers !== 'on' || typeof opt.camera !== 'function' || log.open) return [];
      var cam = rectOf(call('camera')); if (!cam) return [];
      var v = L.v, sx = v.w / cam.w, sy = v.h / cam.h, cands = [], F = L.F, u = F.u;
      var block = L.S.slice(); if (tr) block.push(tr); if (bannerRect) block.push(bannerRect);
      var size = F.cr ? 7 * u : Math.round(u * 1.1), es = F.cr ? 4 * u : Math.round(u * 1.5), inset = F.cr ? 2 : Math.round(u * 0.6);
      var list = liveTracked().filter(function (q) { return q.status === 'active'; });
      var cx = v.x + v.w / 2, cy = v.y + v.h / 2;
      for (var i = 0; i < list.length; i++) {
        var q = list[i], s = q.steps[q.step], pts = s.at ? s.at : call('locate', s.target, info(q).steps[q.step], info(q));
        if (!pts) continue; if (!Array.isArray(pts)) pts = [pts];
        for (var j = 0; j < pts.length && j < 6; j++) {
          var p = pts[j]; if (!p || !isFinite(+p.x) || !isFinite(+p.y)) continue;
          var X = v.x + (p.x - cam.x) * sx, Y = v.y + (p.y - cam.y) * sy - (p.dy != null ? +p.dy * sy : 0);
          // on screen when the point is inside the view (a marker raised above a target near the top edge is pushed down
          // to stay whole instead of turning into an edge indicator)
          var on = X >= v.x + inset + size && X <= v.x + v.w - inset - size && Y >= v.y - size * 1.2 && Y <= v.y + v.h - inset;
          var m = { quest: q.id, kind: q.kind, type: s.type, world: { x: +p.x, y: +p.y }, x: X, y: on ? Math.max(Y, v.y + inset + size * 2.2) : Y, edge: !on, tx: X, ty: Y + size * 1.4 };
          if (!on) {   // one indicator on the view edge, along the ray from the view centre
            var dx = X - cx, dy = Y - cy, kx = (v.w / 2 - inset - es) / Math.max(1e-6, Math.abs(dx)), ky = (v.h / 2 - inset - es) / Math.max(1e-6, Math.abs(dy)), kk = Math.min(kx, ky);
            m.x = cx + dx * kk; m.y = cy + dy * kk; m.ang = Math.atan2(dy, dx);
          }
          m.box = m.edge ? { x: m.x - es, y: m.y - es, w: es * 2, h: es * 2 } : { x: m.x - size, y: m.y - size * 2.2, w: size * 2, h: size * 2.4 };
          cands.push(m);
          if (m.edge) break;   // one edge indicator per quest step
        }
      }
      // never two indicators on top of each other: on-screen diamonds first, then edge indicators slide along their edge
      cands.sort(function (a2, b2) { return (a2.edge ? 1 : 0) - (b2.edge ? 1 : 0); });
      var taken = [], out = [];
      for (var k = 0; k < cands.length; k++) {
        var mk2 = cands[k], clash = function (bx) { for (var t = 0; t < taken.length; t++) if (hit(bx, taken[t], 1)) return true; return false; };
        if (block.some(function (b) { return hit(mk2.box, b, 1); })) mk2.hidden = 'safe';
        else if (clash(mk2.box)) {
          if (!mk2.edge) mk2.hidden = 'overlap';
          else {
            var horiz = Math.abs(mk2.y - (v.y + inset + es)) < 1.5 || Math.abs(mk2.y - (v.y + v.h - inset - es)) < 1.5, x0 = mk2.x, y0 = mk2.y, ok = false;
            var steps = [1, -1, 2, -2, 3, -3];
            for (var st = 0; st < steps.length && !ok; st++) {
              var nx = horiz ? clamp(x0 + steps[st] * es * 2.3, v.x + inset + es, v.x + v.w - inset - es) : x0, ny = horiz ? y0 : clamp(y0 + steps[st] * es * 2.3, v.y + inset + es, v.y + v.h - inset - es);
              var nb = { x: nx - es, y: ny - es, w: es * 2, h: es * 2 };
              if (!clash(nb) && !block.some(function (b) { return hit(nb, b, 1); })) { mk2.x = nx; mk2.y = ny; mk2.box = nb; ok = true; }
            }
            if (!ok) mk2.hidden = 'overlap';
          }
        }
        if (!mk2.hidden) taken.push(mk2.box);
        out.push(mk2);
      }
      return out;
    }
    function drawMarkers(ctx, M, L, th) {
      var F = L.F, u = F.u, bob = Math.sin(clock / 260) ;
      for (var i = 0; i < M.length; i++) {
        var m = M[i]; if (m.hidden) continue;
        var acc = m.kind === 'side' ? th.side : th.main;
        if (F.cr) {
          var pal = { o: th.px[0], a: acc, l: mix(acc, '#ffffff', 0.55), d: mix(acc, '#000000', 0.35), w: '#ffffff' };
          if (!m.edge) sprite(ctx, PX.mark, Math.round(m.x) - 3 * u, Math.round(m.y) - 14 * u + (bob > 0 ? -u : 0), u, pal);
          else {
            var oct = (Math.round(m.ang / (Math.PI / 4)) + 8) % 8, base = oct % 2 ? PX.arrowD : PX.arrow, rows = base, n = Math.floor(oct / 2);
            for (var r = 0; r < n; r++) rows = rotRows(rows);
            var pw2 = rows[0].length, ph = rows.length;
            sprite(ctx, rows, Math.round(m.x - pw2 * u / 2), Math.round(m.y - ph * u / 2), u, pal);
          }
          continue;
        }
        ctx.save();
        if (!m.edge) {
          var x = m.x, y = m.y - u * 1.4 + bob * u * 0.25, s = u * 0.62;
          var gl = ctx.createRadialGradient(x, y, 0, x, y, s * 2.4); gl.addColorStop(0, rgba(acc, 0.45)); gl.addColorStop(1, rgba(acc, 0)); ctx.fillStyle = gl; ctx.fillRect(x - s * 2.4, y - s * 2.4, s * 4.8, s * 4.8);
          ctx.beginPath(); ctx.moveTo(x, y - s * 1.25); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s * 1.25); ctx.lineTo(x - s, y); ctx.closePath();
          ctx.fillStyle = acc; ctx.fill(); ctx.strokeStyle = 'rgba(20,12,4,0.85)'; ctx.lineWidth = Math.max(1, u * 0.12); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, y - s * 1.25); ctx.lineTo(x - s, y); ctx.lineTo(x, y); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
          ctx.beginPath(); ctx.moveTo(x - s * 0.5, y + s * 1.7); ctx.lineTo(x + s * 0.5, y + s * 1.7); ctx.lineTo(x, y + s * 2.25); ctx.closePath(); ctx.fillStyle = acc; ctx.fill(); ctx.stroke();
        } else {   // one edge indicator: a disc with the quest diamond inside and a pointer on its rim toward the target
          var es2 = Math.round(u * 1.5), rd = es2 * 0.72, ds = es2 * 0.36, pul = 1 + 0.06 * bob;
          ctx.translate(m.x, m.y);
          ctx.beginPath(); ctx.arc(0, 0, rd * pul, 0, Math.PI * 2); ctx.fillStyle = 'rgba(12,9,20,0.82)'; ctx.fill(); ctx.strokeStyle = acc; ctx.lineWidth = Math.max(1.2, u * 0.12); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, -ds * 1.2); ctx.lineTo(ds, 0); ctx.lineTo(0, ds * 1.2); ctx.lineTo(-ds, 0); ctx.closePath(); ctx.fillStyle = acc; ctx.fill();
          ctx.beginPath(); ctx.moveTo(0, -ds * 1.2); ctx.lineTo(-ds, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
          ctx.rotate(m.ang);
          ctx.beginPath(); ctx.moveTo(es2 * 0.98, 0); ctx.lineTo(rd * 0.92, -es2 * 0.3); ctx.lineTo(rd * 0.92, es2 * 0.3); ctx.closePath(); ctx.fillStyle = acc; ctx.fill(); ctx.strokeStyle = 'rgba(20,12,4,0.85)'; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.restore();
      }
    }

    /* ---------------- log panel ---------------- */
    function logLists() {
      var act = [], done = [];
      for (var i = 0; i < order.length; i++) { var q = Q[order[i]]; if (q.status === 'active') act.push(q); else if (q.status === 'done') done.push(q); }
      act.sort(function (a, b) { return (a.kind === 'main' ? 0 : 1) - (b.kind === 'main' ? 0 : 1) || a.startT - b.startT; });
      done.sort(function (a, b) { return b.doneT - a.doneT; });
      return { active: act, done: done };
    }
    function logFonts(F) {
      var cr = F.cr, u = F.u;
      return { tf: cr ? { px: 'reg', k: u } : { size: Math.round(u * 1.15), weight: 800 }, lf: cr ? { px: 'small', k: u } : { size: Math.max(9, Math.round(u * 0.74)), weight: 800, track: Math.round(u * 0.1) },
        bf: cr ? { px: 'reg', k: u } : { size: Math.round(u * 0.92), weight: 500 }, rf: cr ? { px: 'reg', k: u } : { size: Math.round(u * 0.95), weight: 650 }, gap: cr ? 3 * u : Math.round(u * 0.5) };
    }
    // the selected quest's page; ctx null = measure only. Lines are drawn only when wholly inside [clipTop, clipBot].
    function detail(ctx, q, x, y0, w, F, th, LF, clipTop, clipBot, texts) {
      var cr = F.cr, u = F.u, lh = lineH(LF.bf), y = y0, gap = LF.gap, acc = accentOf(q, th), P8 = th.px;
      var put = function (f, str, xx, yy, col, o) { var hh = f.px ? pfont(f.px).h * f.k : capH(f) + Math.round(f.size * 0.26); if (!ctx || yy < clipTop - 0.5 || yy + hh > clipBot + 0.5) return null; var tb = text(ctx, f, str, xx, yy, col, o); texts.push(Object.assign(tb, { box: 'log' })); return tb; };
      var tl = wrap(LF.rf, q.title, w, 3); for (var i = 0; i < tl.length; i++) { put(LF.rf, tl[i], x, y, acc, { shadow: cr ? P8[0] : null }); y += lineH(LF.rf); }
      var meta = wrap(LF.lf, (q.kind === 'side' ? 'SIDE QUEST' : 'MAIN QUEST') + (q.giver ? '  -  ' + q.giver.toUpperCase() : ''), w, 2);
      for (i = 0; i < meta.length; i++) { put(LF.lf, meta[i], x, y, th.dim); y += capH(LF.lf) + (cr ? 2 * u : Math.round(u * 0.35)); }
      y += gap;
      if (q.desc) { var dl = wrap(LF.bf, q.desc, w, 0); for (i = 0; i < dl.length; i++) { put(LF.bf, dl[i], x, y, th.text); y += lh; } y += gap; }
      var boxS = cr ? 7 * u : Math.round(u * 0.95);
      for (var si = 0; si < q.steps.length; si++) {
        var st = q.steps[si], isDone = si < q.step || q.status === 'done', isCur = si === q.step && q.status === 'active';
        if (!isDone && !isCur && P.future !== 'shown') { put(LF.bf, '. . .', x + boxS + gap, y, th.dim); y += lh; break; }
        var cnt = st.need > 1 ? Math.min(q.counts[si], st.need) + '/' + st.need : '', cfw = cnt ? measure(F.count, cnt) + gap : 0;
        var sl = wrap(LF.bf, st.text, w - boxS - gap - cfw, 3), by2 = y + Math.round((lh - boxS) / 2) - (cr ? u : 0);
        if (ctx && by2 >= clipTop && by2 + boxS <= clipBot) {
          if (cr) sprite(ctx, isDone ? PX.tick : PX.box, x, by2, u, { o: isDone ? '#2a7a48' : P8[5], a: '#6ad88a', w: '#ffffff' });
          else { rr(ctx, x + 0.5, by2 + 0.5, boxS - 1, boxS - 1, u * 0.15); ctx.strokeStyle = isDone ? th.ok : th.box; ctx.lineWidth = Math.max(1, u * 0.1); ctx.stroke(); if (isDone) { ctx.fillStyle = rgba(th.ok, 0.9); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + boxS * 0.22, by2 + boxS * 0.52); ctx.lineTo(x + boxS * 0.42, by2 + boxS * 0.72); ctx.lineTo(x + boxS * 0.8, by2 + boxS * 0.28); ctx.strokeStyle = '#10241a'; ctx.lineWidth = Math.max(1.5, u * 0.14); ctx.stroke(); } }
        }
        for (var li = 0; li < sl.length; li++) { put(LF.bf, sl[li], x + boxS + gap, y, isDone ? th.dim : th.text); if (li === 0 && cnt) put(F.count, cnt, x + w, y + (cr ? u : 0), isDone ? th.ok : th.title, { align: 'right' }); y += lh; }
        y += cr ? u : Math.round(u * 0.2);
      }
      if (q.reward) {
        y += gap; put(LF.lf, 'REWARD', x, y, th.main); y += capH(LF.lf) + (cr ? 2 * u : Math.round(u * 0.3));
        var rl = wrap(LF.bf, q.reward, w, 0); for (i = 0; i < rl.length; i++) { put(LF.bf, rl[i], x, y, th.text); y += lh; }
      }
      return y - y0;
    }
    function listRows(list, LF, colW, gap, cr, u) {
      var out = [], pinW = cr ? 8 * u : u * 1.1, padX = cr ? 4 * u : u * 0.6;
      for (var i = 0; i < list.length; i++) { var ln = wrap(LF.rf, list[i].title, colW - gap - padX - pinW - (cr ? 2 * u : u * 0.4), 2); out.push({ lines: ln, h: ln.length * lineH(LF.rf) + (cr ? 4 * u : Math.round(u * 0.7)) }); }
      return out;
    }
    function logLayout(L) {
      var v = L.v, F = L.F, cr = F.cr, u = F.u, S = L.S, LF = logFonts(F);
      var m = cr ? 6 * u : Math.round(u * 1.2), top = v.y + m, bot = v.y + v.h - m;
      for (var i = 0; i < S.length; i++) { var s = S[i]; if (s.x >= v.x + v.w || s.x + s.w <= v.x) continue; var mid = s.y + s.h / 2; if (mid < v.y + v.h / 2) top = Math.max(top, s.y + s.h + (cr ? 3 : u * 0.5)); else bot = Math.min(bot, s.y - (cr ? 3 : u * 0.5)); }
      var narrow = v.w - 2 * m < (cr ? 220 * u : u * 34);
      var w = narrow ? v.w - 2 * m : Math.min(v.w - 2 * m, cr ? 340 * u : u * 42), maxH = bot - top;
      if (w < (cr ? 120 : u * 14) || maxH < (cr ? 70 : u * 9)) return null;
      var lists = logLists(), list = log.tab === 'done' ? lists.done : lists.active; if (log.sel >= list.length) log.sel = Math.max(0, list.length - 1);
      var h = maxH;
      if (!narrow) {   // fit the panel to the selected page (no half-empty panel)
        var pad = cr ? 3 * u : u * 0.9, colW = Math.round((w - 2 * (cr ? 4 * u : u * 1.1)) * 0.4), detW = w - 2 * (cr ? 4 * u : u * 1.1) - colW - LF.gap * 2, need = 0, th = TH();
        if (list[log.sel]) need = detail(null, list[log.sel], 0, 0, detW, F, th, LF, 0, 1e9, []);
        var lr = listRows(list, LF, colW, LF.gap, cr, u), lh2 = 0; for (var k = 0; k < lr.length; k++) lh2 += lr[k].h;
        var head = Math.max(lineH(LF.tf), capH(LF.lf) + (cr ? 6 : u)) + LF.gap + (cr ? 2 * u : 0), foot = capH(LF.lf) + LF.gap;
        h = clamp(Math.ceil(2 * pad + head + Math.max(need, lh2, cr ? 40 : u * 5) + foot + LF.gap), cr ? 90 : u * 12, Math.min(maxH, cr ? 200 * u : u * 28));
      }
      var x = Math.round(v.x + (v.w - w) / 2), y = Math.round(top + (bot - top - h) / 2);
      return { x: x, y: y, w: Math.round(w), h: Math.round(h), lists: lists, list: list, narrow: narrow };
    }
    function drawLog(ctx, LG, L, th, texts) {
      var F = L.F, cr = F.cr, u = F.u, x = LG.x, y = LG.y, w = LG.w, h = LG.h, P8 = th.px, LF = logFonts(F);
      var age = clock - log.t, a = cr ? 1 : ease(age / 180);
      ctx.save();
      // dim the view, not the safe rects
      ctx.beginPath(); ctx.rect(L.v.x, L.v.y, L.v.w, L.v.h); for (var i = 0; i < L.S.length; i++) ctx.rect(L.S[i].x, L.S[i].y, L.S[i].w, L.S[i].h);
      ctx.fillStyle = th.dimBg; ctx.globalAlpha = a; ctx.fill('evenodd');
      var inner = null;
      if (typeof opt.frame === 'function') { try { inner = rectOf(opt.frame(ctx, { x: x, y: y, w: w, h: h }, 'log')); } catch (e) { inner = null; } }
      if (!inner) {
        if (cr) {
          ctx.fillStyle = P8[0]; ctx.fillRect(x - u, y, w + 2 * u, h); ctx.fillRect(x, y - u, w, h + 2 * u);
          ctx.fillStyle = P8[2]; ctx.fillRect(x, y, w, h); ctx.fillStyle = P8[1]; ctx.fillRect(x, y, w, 14 * u);
          ctx.fillStyle = P8[3]; ctx.fillRect(x, y, w, u); ctx.fillRect(x, y + 14 * u, w, u);
          inner = { x: x + 4 * u, y: y + 3 * u, w: w - 8 * u, h: h - 6 * u };
        } else {
          ctx.shadowColor = th.shadow; ctx.shadowBlur = u * 2; ctx.shadowOffsetY = u * 0.4;
          var gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, th.top); gr.addColorStop(1, th.bot);
          rr(ctx, x, y, w, h, u * 0.7); ctx.fillStyle = gr; ctx.globalAlpha = a; ctx.fill(); ctx.shadowColor = 'rgba(0,0,0,0)';
          rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, u * 0.7); ctx.strokeStyle = th.edge; ctx.lineWidth = 1; ctx.stroke();
          inner = { x: x + u * 1.1, y: y + u * 0.9, w: w - u * 2.2, h: h - u * 1.8 };
        }
      }
      ctx.globalAlpha = a;
      var tf = LF.tf, lf = LF.lf, bf = LF.bf, rf = LF.rf, gap = LF.gap;
      var ix = inner.x, iy = inner.y, iw = inner.w, ih = inner.h;
      // header: title + tabs
      texts.push(Object.assign(text(ctx, tf, 'Quest Log', ix, iy + (cr ? 0 : 1), th.title, { shadow: cr ? P8[0] : 'rgba(0,0,0,0.5)' }), { box: 'log' }));
      var tabs = [['active', 'Active ' + LG.lists.active.length], ['done', 'Done ' + LG.lists.done.length]], txr = ix + iw;
      LG.tabs = [];
      for (var t = tabs.length - 1; t >= 0; t--) {
        var on = log.tab === tabs[t][0], tw = measure(lf, tabs[t][1].toUpperCase()), pad = cr ? 3 * u : u * 0.5, bx = txr - tw - pad * 2, by = iy, bh = capH(lf) + pad * 2;
        if (cr) { ctx.fillStyle = on ? th.main : P8[3]; ctx.fillRect(bx, by, tw + pad * 2, bh); }
        else { rr(ctx, bx, by, tw + pad * 2, bh, u * 0.3); ctx.fillStyle = on ? rgba(th.main, 0.9) : rgba(th.text, 0.1); ctx.fill(); }
        texts.push(Object.assign(text(ctx, lf, tabs[t][1].toUpperCase(), bx + pad, by + pad, on ? '#1a1206' : th.dim), { box: 'log' }));
        LG.tabs.unshift({ tab: tabs[t][0], x: bx, y: by, w: tw + pad * 2, h: bh }); txr = bx - gap;
      }
      var hy = iy + Math.max(lineH(tf), capH(lf) + (cr ? 6 : u)) + gap;
      if (!cr) { ctx.fillStyle = rgba(th.text, 0.12); ctx.fillRect(ix, hy - gap / 2, iw, 1); }
      var foot = ellip(lf, String(P.logHint || '').toUpperCase(), iw), fh = capH(lf) + gap;
      var bodyY = hy + (cr ? 2 * u : 0), bodyH = iy + ih - fh - bodyY;
      texts.push(Object.assign(text(ctx, lf, foot, ix + iw, iy + ih - capH(lf), th.dim, { align: 'right' }), { box: 'log' }));
      var list = LG.list; LG.rows = []; LG.maxScroll = 0; LG.lh = lineH(bf);
      if (!list.length) {
        var msg = log.tab === 'done' ? 'Nothing finished yet.' : 'No active quests.', mw = measure(bf, msg);
        texts.push(Object.assign(text(ctx, bf, msg, ix + iw / 2, bodyY + bodyH / 2 - capH(bf) / 2, th.dim, { align: 'center' }), { box: 'log' }));
        ctx.restore(); return;
      }
      var detX = ix, detW = iw, detY = bodyY;
      if (!LG.narrow) {
        var colW = Math.round(iw * 0.4), rows = listRows(list, LF, colW, gap, cr, u), first = 0, used = 0;
        // keep the selection visible
        var tot = 0; for (var r0 = 0; r0 <= log.sel; r0++) tot += rows[r0].h; while (tot > bodyH && first < log.sel) { tot -= rows[first].h; first++; }
        var ry = bodyY;
        for (var r = first; r < list.length; r++) {
          var q = list[r], rh2 = rows[r].h; if (ry + rh2 > bodyY + bodyH + 0.5) break;
          var sel = r === log.sel, acc = accentOf(q, th);
          if (sel) { if (cr) { ctx.fillStyle = P8[3]; ctx.fillRect(ix, ry, colW - gap, rh2 - u); ctx.fillStyle = acc; ctx.fillRect(ix, ry, u, rh2 - u); } else { rr(ctx, ix, ry, colW - gap, rh2 - u * 0.3, u * 0.3); ctx.fillStyle = rgba(acc, 0.2); ctx.fill(); ctx.fillStyle = acc; ctx.fillRect(ix, ry + u * 0.3, Math.max(2, u * 0.16), rh2 - u * 0.9); } }
          var px0 = ix + (cr ? 4 * u : u * 0.6), pinOn = q.tracked && q.status === 'active', ty0 = ry + (rh2 - rows[r].lines.length * lineH(rf)) / 2 + (lineH(rf) - capH(rf)) / 2 - (cr ? u : 1);
          for (var tl2 = 0; tl2 < rows[r].lines.length; tl2++) texts.push(Object.assign(text(ctx, rf, rows[r].lines[tl2], px0, ty0 + tl2 * lineH(rf), q.status === 'done' ? th.dim : sel ? th.title : th.text), { box: 'log' }));
          if (pinOn) {
            if (cr) sprite(ctx, PX.pin, ix + colW - gap - 7 * u, ry + Math.round((rh2 - 6 * u) / 2) - u, u, { o: P8[0], a: acc, l: '#ffffff' });
            else { var pxp = ix + colW - gap - u * 0.75, pyp = ry + rh2 / 2; ctx.beginPath(); ctx.moveTo(pxp, pyp - u * 0.45); ctx.lineTo(pxp + u * 0.38, pyp); ctx.lineTo(pxp, pyp + u * 0.45); ctx.lineTo(pxp - u * 0.38, pyp); ctx.closePath(); ctx.fillStyle = acc; ctx.fill(); }
          }
          LG.rows.push({ i: r, x: ix, y: ry, w: colW - gap, h: rh2 }); ry += rh2;
        }
        if (cr) { ctx.fillStyle = P8[3]; ctx.fillRect(ix + colW, bodyY, u, bodyH); } else { ctx.fillStyle = rgba(th.text, 0.1); ctx.fillRect(ix + colW, bodyY, 1, bodyH); }
        detX = ix + colW + gap * 2; detW = iw - colW - gap * 2;
      } else {
        // phones: a full-height sheet, one quest per page with a pager
        var pg = '<  ' + (log.sel + 1) + ' / ' + list.length + '  >', pgw = measure(lf, pg), pgh = capH(lf) + (cr ? 4 * u : u * 0.7);
        if (!cr) { rr(ctx, ix, bodyY, pgw + u * 1.2, pgh, u * 0.3); ctx.fillStyle = rgba(th.text, 0.1); ctx.fill(); }
        texts.push(Object.assign(text(ctx, lf, pg, ix + (cr ? 0 : u * 0.6), bodyY + (pgh - capH(lf)) / 2, th.text), { box: 'log' }));
        LG.rows.push({ i: log.sel, x: ix, y: bodyY, w: pgw + u * 1.2, h: pgh, pager: true }); detY = bodyY + pgh + gap;
      }
      // detail with scroll and a visible cue when it does not fit
      var q2 = list[log.sel], viewH = bodyY + bodyH - detY, full = detail(null, q2, detX, 0, detW - (cr ? 3 * u : u * 0.6), F, th, LF, 0, 1e9, []);
      LG.maxScroll = Math.max(0, Math.ceil(full - viewH)); var sc = clamp(log.scroll, 0, LG.maxScroll);
      ctx.save(); ctx.beginPath(); ctx.rect(detX - 1, detY - 2, detW + 2, viewH + 2); ctx.clip();
      detail(ctx, q2, detX, detY - sc, detW - (cr ? 3 * u : u * 0.6), F, th, LF, detY, detY + viewH, texts);
      ctx.restore();
      if (LG.maxScroll > 0) {
        var trackX = detX + detW - (cr ? u : Math.max(2, u * 0.18)), thumbH = Math.max(cr ? 6 : u, viewH * viewH / full), thumbY = detY + (viewH - thumbH) * (sc / LG.maxScroll);
        ctx.fillStyle = cr ? P8[3] : rgba(th.text, 0.12); ctx.fillRect(trackX, detY, cr ? u : Math.max(2, u * 0.18), viewH);
        ctx.fillStyle = cr ? th.main : rgba(th.main, 0.85); ctx.fillRect(trackX, thumbY, cr ? u : Math.max(2, u * 0.18), thumbH);
        if (sc < LG.maxScroll) {   // more below: a fade and a chevron
          if (!cr) { var fg = ctx.createLinearGradient(0, detY + viewH - u * 1.6, 0, detY + viewH); fg.addColorStop(0, rgba(P.theme === 'parchment' ? '#e4d0a6' : '#0f0c18', 0)); fg.addColorStop(1, rgba(P.theme === 'parchment' ? '#e4d0a6' : '#0f0c18', 0.95)); ctx.fillStyle = fg; ctx.fillRect(detX, detY + viewH - u * 1.6, detW - u * 0.6, u * 1.6); }
          var chx = detX + detW / 2, chy = detY + viewH - (cr ? 3 * u : u * 0.45);
          ctx.fillStyle = th.main; ctx.beginPath(); ctx.moveTo(chx - (cr ? 3 : u * 0.5), chy - (cr ? 3 : u * 0.45)); ctx.lineTo(chx + (cr ? 3 : u * 0.5), chy - (cr ? 3 : u * 0.45)); ctx.lineTo(chx, chy); ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    }

    /* ---------------- draw ---------------- */
    function draw(ctx) {
      var rec = { tracker: null, cards: [], texts: [], banner: null, markers: [], log: null, safe: [], compact: false, crisp: false, t: clock };
      if (!ctx) return rec;
      try {
        var L = layout(), th = TH(), texts = [];
        rec.safe = L.S; rec.crisp = L.F.cr; rec.compact = L.compact; rec.view = L.v;
        if (L.cards.length && !L.pl) stats.noRoom++;
        if (L.compact) stats.compact++;
        ctx.save();
        var trRect = null;
        if (log.open && P.log !== 'off') {
          var LG = logLayout(L);
          if (LG) { drawLog(ctx, LG, L, th, texts); rec.log = { x: LG.x, y: LG.y, w: LG.w, h: LG.h, tab: log.tab, sel: log.sel, rows: LG.rows, tabs: LG.tabs, narrow: LG.narrow, scroll: log.scroll, maxScroll: LG.maxScroll, lh: LG.lh }; }
        } else if (L.pl) {
          var pl = L.pl, y = pl.top ? pl.y : pl.y, cards = L.cards;
          trRect = { x: pl.x, y: pl.y, w: pl.w, h: pl.h };
          var cy = pl.y;
          if (!pl.top) { var tot = 0; for (var i0 = 0; i0 < cards.length; i0++) tot += cards[i0].hEff; cy = pl.y + pl.h - Math.round(tot - L.F.gap * 1.5); }
          for (var i = 0; i < cards.length; i++) {
            var c = cards[i], dir = pl.corner.charAt(1) === 'r' ? 1 : -1, x = Math.round(pl.x + dir * c.slide * c.w);
            var cyR = Math.round(cy);
            if (c.alpha > 0.01 && c.hEff > 1) {
              ctx.save(); ctx.beginPath(); ctx.rect(pl.x - c.w, cyR - 8, c.w * 3, Math.ceil(c.hEff) + 8); ctx.clip();
              c.bg = 1 - 0.3 * fadeV; c.alpha *= ease((clock - cornerT) / 220);
              if (L.F.cr) drawCardCrisp(ctx, c, x, cyR, L.F, th, texts); else drawCardSmooth(ctx, c, x, cyR, L.F, th, texts);
              ctx.restore();
              rec.cards.push({ quest: c.q.id, status: c.q.status, step: c.q.step, x: x, y: cyR, w: c.w, h: Math.min(c.h, Math.ceil(c.hEff)), alpha: c.alpha, bg: c.bg, rows: c.rows.map(function (r) { return r.kind === 'title' ? 'title' : r.state + ':' + r.idx; }) });
            }
            cy += c.hEff;
          }
          rec.tracker = trRect; rec.corner = pl.corner; rec.fade = fadeV;
        }
        var B = !log.open ? bannerLayout(L) : null;
        if (B && B.alpha > 0.001) {
          // a HUD box that opened since the last update (a window on this very frame): treat the banner as already fading out
          if (!B.fading && (L.S.some(function (r) { return hit(B, r, 0); }) || (trRect && hit(B, trRect, 0)))) B.fading = true;
          ctx.save();
          if (B.fading && L.S.length) { ctx.beginPath(); ctx.rect(L.v.x - 4, L.v.y - 4, L.v.w + 8, L.v.h + 8); for (var si = 0; si < L.S.length; si++) ctx.rect(L.S[si].x, L.S[si].y, L.S[si].w, L.S[si].h); if (trRect) ctx.rect(trRect.x, trRect.y, trRect.w, trRect.h); ctx.clip('evenodd'); }
          var nt = texts.length; drawBanner(ctx, B, L, th, texts); if (B.fading) texts.length = nt;   // a fading, clipped banner's text is not a layout claim
          ctx.restore();
          rec.banner = { x: B.x, y: B.y, w: B.w, h: B.h, kind: B.b.kind, quest: B.b.id, alpha: B.alpha, mode: B.b.mode, fading: B.fading };
        }
        var M = markerList(L, trRect, rec.banner && !rec.banner.fading ? rec.banner : null);
        drawMarkers(ctx, M, L, th); rec.markers = M.map(function (m) { return { quest: m.quest, type: m.type, x: Math.round(m.x), y: Math.round(m.y), edge: m.edge, hidden: m.hidden || null, box: m.box, world: m.world }; });
        ctx.restore();
        rec.texts = texts.map(function (t) { return { x: Math.round(t.x * 10) / 10, y: Math.round(t.y * 10) / 10, w: Math.round(t.w * 10) / 10, h: Math.round(t.h * 10) / 10, s: t.s, box: t.box }; });
      } catch (e) { stats.errors++; warn('draw', 'draw() failed: ' + (e && e.message)); try { ctx.restore(); } catch (e2) { } }
      drawn = rec;
      return rec;
    }

    /* ---------------- input ---------------- */
    function openLog() { if (P.log === 'off') return false; if (!log.open) { log.open = true; log.t = clock; log.scroll = 0; var l = logLists(); log.tab = l.active.length || !l.done.length ? 'active' : 'done'; var tr = liveTracked()[0]; var li = tr ? l.active.indexOf(tr) : -1; log.sel = li >= 0 ? li : 0; } return true; }
    function closeLog() { var was = log.open; log.open = false; return was; }
    function input(a) {
      try {
        a = String(a || '').toLowerCase();
        if (!log.open) { if (a === 'log' || a === 'journal') return openLog(); if (a === 'expand') { expanded = !expanded; return true; } return false; }
        var l = logLists(), list = log.tab === 'done' ? l.done : l.active;
        var dl = drawn && drawn.log, stepPx = dl ? dl.lh * 2 : 0;
        if (a === 'up') { if (log.scroll > 0) log.scroll = Math.max(0, log.scroll - stepPx); else { log.sel = list.length ? (log.sel + list.length - 1) % list.length : 0; log.scroll = 0; } }
        else if (a === 'down') { if (dl && log.scroll < dl.maxScroll) log.scroll = Math.min(dl.maxScroll, log.scroll + stepPx); else { log.sel = list.length ? (log.sel + 1) % list.length : 0; log.scroll = 0; } }
        else if (a === 'left' || a === 'right' || a === 'tab') { log.tab = log.tab === 'done' ? 'active' : 'done'; log.sel = 0; log.scroll = 0; }
        else if (a === 'ok' || a === 'confirm' || a === 'track') { var q = list[log.sel]; if (q && q.status === 'active') track(q.id, !q.tracked); }
        else if (a === 'back' || a === 'cancel' || a === 'log' || a === 'journal' || a === 'close') closeLog();
        return true;
      } catch (e) { stats.errors++; return true; }
    }
    function hitTest(x, y) {
      var d = drawn; if (!d) return null; var p = { x: +x, y: +y, w: 0.01, h: 0.01 };
      if (log.open && d.log) {
        var i; for (i = 0; d.log.tabs && i < d.log.tabs.length; i++) if (hit(p, d.log.tabs[i])) return { what: 'tab', tab: d.log.tabs[i].tab };
        for (i = 0; d.log.rows && i < d.log.rows.length; i++) if (hit(p, d.log.rows[i])) return { what: 'row', i: d.log.rows[i].i };
        return hit(p, d.log) ? { what: 'panel' } : { what: 'outside' };
      }
      if (d.tracker && hit(p, d.tracker)) return { what: 'tracker' };
      return null;
    }
    function tap(x, y) {
      var h = hitTest(x, y); if (!h) return false;
      if (h.what === 'tracker') { var Lt = layout(); if (Lt.cards[0] && Lt.cards[0].pill) { expanded = true; return true; } if (expanded) { expanded = false; return true; } return openLog(); }
      if (h.what === 'tab') { if (log.tab !== h.tab) { log.tab = h.tab; log.sel = 0; log.scroll = 0; } return true; }
      if (h.what === 'row') { if (drawn.log.narrow) { log.sel = (log.sel + 1) % Math.max(1, logLists()[log.tab === 'done' ? 'done' : 'active'].length); log.scroll = 0; } else if (log.sel === h.i) input('ok'); else { log.sel = h.i; log.scroll = 0; } return true; }
      if (h.what === 'outside') { closeLog(); return true; }
      return true;
    }

    function stateOut() {
      return { t: Math.round(clock), version: VERSION, logOpen: log.open, logTab: log.tab, logSel: log.sel,
        quests: order.map(function (id) { var q = Q[id], o = info(q); o.startT = q.startT > -1e8 ? Math.round(q.startT) : null; o.doneT = q.doneT > -1e8 ? Math.round(q.doneT) : null; return o; }),
        tracked: liveTracked().map(function (q) { return q.id; }), banner: banners[0] && banners[0].t0 != null ? { kind: banners[0].kind, quest: banners[0].id } : null, banners: banners.length,
        tracker: drawn ? drawn.tracker : null };
    }
    function reset() {
      for (var i = 0; i < order.length; i++) { var q = Q[order[i]]; q.status = 'inactive'; q.step = 0; q.counts = q.steps.map(function () { return 0; }); q.stepT = q.steps.map(function () { return -1e9; }); q.startT = q.doneT = q.punch = q.trackT = -1e9; q.punchStep = -1; q.tracked = false; }
      banners = []; log.open = false; log.sel = 0; log.tab = 'active'; drawn = null;
      for (var j = 0; j < order.length; j++) { var d = defs[j]; if (d && (d.auto || d.active)) start(d.id, true); }
    }
    function save() { var o = {}; for (var i = 0; i < order.length; i++) { var q = Q[order[i]]; o[q.id] = { s: q.status, step: q.step, c: q.counts.slice(), tr: q.tracked }; } return o; }
    function load(o) {
      if (!o) return false;
      for (var id in o) { var q = Q[id], r = o[id]; if (!q || !r) continue; q.status = r.s === 'active' || r.s === 'done' ? r.s : 'inactive'; q.step = clamp(+r.step || 0, 0, q.steps.length - 1);
        q.counts = q.steps.map(function (s, i) { return clamp(Math.floor(+((r.c || [])[i]) || 0), 0, s.need); }); q.tracked = !!r.tr && q.status === 'active'; q.startT = q.trackT = clock - 1e4; q.doneT = q.status === 'done' ? clock - 1e5 : -1e9; }
      return true;
    }

    var defs = (opt.quests || []).slice();
    for (var di = 0; di < defs.length; di++) add(defs[di]);

    return {
      version: VERSION,
      add: add, start: start, accept: start, event: event, emit: event, setCount: setCount, track: track, untrack: function (id) { return track(id, false); },
      fail: function (id) { var q = Q[String(id)]; if (!q || q.status !== 'active') return false; q.status = 'failed'; q.tracked = false; return true; },
      update: update, draw: draw, input: input, hit: hitTest, tap: tap,
      openLog: openLog, closeLog: closeLog, toggleLog: function () { return log.open ? (closeLog(), false) : openLog(); }, isLogOpen: function () { return log.open; }, busy: function () { return log.open; },
      quest: function (id) { var q = Q[String(id)]; return q ? info(q) : null; }, active: function () { return order.filter(function (id) { return Q[id].status === 'active'; }); },
      isDone: function (id) { var q = Q[String(id)]; return !!q && q.status === 'done'; }, current: function (id) { var q = Q[String(id)]; return q && q.status === 'active' ? info(q).steps[q.step] : null; },
      rect: function () { return drawn && !log.open ? drawn.tracker : null; },
      rects: function () { var o = []; if (!drawn) return o; if (drawn.tracker) o.push(drawn.tracker); if (drawn.banner) o.push(drawn.banner); if (drawn.log) o.push(drawn.log); return o; },
      lastDrawn: function () { return drawn; }, state: stateOut, stats: function () { var o = {}; for (var k in stats) o[k] = stats[k]; o.updates = upd; o.hops = hops; o.expanded = expanded; return o; },
      reset: reset, save: save, load: load, setParams: setParams, params: function () { var o = {}; for (var k in P) o[k] = P[k]; return o; }, clock: function () { return clock; }
    };
  }

  root.GameDNA_QuestLog = { create: create, version: VERSION, DEFAULTS: DEFAULTS };
})(typeof window !== 'undefined' ? window : this);
