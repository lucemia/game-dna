/* GameDNA_DungeonFloors v1.1.2 - B-12 Procedural dungeon floors (Game DNA library, system element).
 * One plain script, no dependencies, no import / export. One global: GameDNA_DungeonFloors. Source is ASCII only.
 *
 * Seeded dungeon floors: rooms placed at random, joined by a minimum spanning tree of corridors plus a few loops, with
 * doors, autotiled walls and floors (faces, edges, inner and outer corners), torches, decor per room type, chests, loose
 * items, monsters placed by a per-room budget, and stairs down in the room farthest from the start. Turn-based: the hero
 * steps in 8 directions (no corner cutting), bumps a monster to attack, bumps a chest to open it, bumps a door to open it;
 * then every awake monster acts. Field of view by shadowcasting, explored tiles remembered (dim), unknown tiles black,
 * a lantern and torch light, an optional minimap. The last floor holds a boss; killing it wins, the hero at 0 HP loses.
 * Seeded and frame-stepped: the same seed and the same inputs give the same game at any view size.
 *
 *   var df = GameDNA_DungeonFloors.create({view, seed, params, rooms, monsters, items, onHit, onEvent, onEnd});
 *   df.start({seed})          a new run from floor 1
 *   df.update(stepMs)         every fixed step (0 while frozen)
 *   df.drawScene(ctx)         floor, walls, decor, items, monsters, hero, effects, light and fog (host effects after it)
 *   df.drawUI(ctx)            HUD (HP, level, potions, gold, floor), minimap, message log, banners
 *   df.key(k) / df.pointer(type, x, y) / df.setHeld({up, down, left, right})   input in the host's logical px
 *   API in module/README.md.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.3';
  var T = 16;                                  // tile size in logical px
  var STEP = 1000 / 60;
  var ROCK = 0, FLOOR = 1, WALL = 2, DOOR = 3, STAIRS = 4;
  var DIRS8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  var DIRS4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  /* ---------- small helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function copy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function hash(x, y, s) { var n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul((s | 0) + 1, 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }
  function rng(seed) {   // mulberry32
    var a = seed >>> 0 || 1;
    var f = function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.int = function (lo, hi) { return lo + Math.floor(f() * (hi - lo + 1)); };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length)]; };
    f.state = function () { return a; }; f.set = function (s) { a = s >>> 0; };
    return f;
  }
  function weighted(r, list, wf) { var tot = 0, i; for (i = 0; i < list.length; i++) tot += Math.max(0, wf(list[i])); if (tot <= 0) return null; var x = r() * tot; for (i = 0; i < list.length; i++) { x -= Math.max(0, wf(list[i])); if (x < 0) return list[i]; } return list[list.length - 1]; }
  var RGBC = {};
  function rgb(h) {
    var v = RGBC[h]; if (v) return v;
    if (h.charAt(0) === '#') { var s = h.slice(1); if (s.length === 3) s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2); var n = parseInt(s, 16); v = [n >> 16, (n >> 8) & 255, n & 255]; }
    else { var m = h.match(/[\d.]+/g) || [0, 0, 0]; v = [+m[0], +m[1], +m[2]]; }
    return (RGBC[h] = v);
  }
  function hex(c) { return '#' + c.map(function (n) { n = clamp(Math.round(n), 0, 255); return (n < 16 ? '0' : '') + n.toString(16); }).join(''); }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return hex([lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]); }
  function shade(a, k) { var x = rgb(a); return hex([x[0] * k, x[1] * k, x[2] * k]); }
  function rgba(h, a) { var x = rgb(h); return 'rgba(' + x[0] + ',' + x[1] + ',' + x[2] + ',' + a + ')'; }
  var warned = {};
  function warn(label, e) { var k = label + ':' + (e && e.message); if (warned[k]) return; warned[k] = 1; if (typeof console !== 'undefined') console.warn('GameDNA_DungeonFloors ' + label + ': ' + (e && e.message)); }
  function safe(fn, args, label) { if (typeof fn !== 'function') return undefined; try { return fn.apply(null, args); } catch (e) { warn(label || 'callback', e); return undefined; } }
  function mkCanvas(w, h) {
    if (typeof document !== 'undefined' && document.createElement) { var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
    return null;
  }

  /* ---------- pixel font: 'regular' 6x8 proportional glyphs (original designs, shared with the C-03 pixel-font element) ---------- */
  var GLYPHS = {
    '!': '# # # # # . #', '"': '#.# #.#', '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.',
    '%': '##... ##..# ...#. ..#.. .#... #..## ...##', "'": '# #', '(': '..# .#. #.. #.. #.. .#. ..#',
    ')': '#.. .#. ..# ..# ..# .#. #..', '*': '..... ..#.. #.#.# .###. #.#.# ..#..', '+': '..... ..#.. ..#.. ##### ..#.. ..#..',
    ',': '.. .. .. .. .. ## .# #.', '-': '.... .... .... ####', '.': '.. .. .. .. .. ## ##',
    '/': '....# ...#. ...#. ..#.. .#... .#... #....',
    '0': '.###. #...# #..## #.#.# ##..# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
    '2': '.###. #...# ....# ...#. ..#.. .#... #####', '3': '####. ....# ....# .###. ....# ....# ####.',
    '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.', '5': '##### #.... ####. ....# ....# #...# .###.',
    '6': '..##. .#... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. .#... .#... .#...',
    '8': '.###. #...# #...# .###. #...# #...# .###.', '9': '.###. #...# #...# .#### ....# ...#. .##..',
    ':': '.. ## ## .. .. ## ##', ';': '.. ## ## .. .. ## .# #.', '<': '...# ..#. .#.. #... .#.. ..#. ...#',
    '=': '.... .... #### .... ####', '>': '#... .#.. ..#. ...# ..#. .#.. #...',
    '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
    'A': '.###. #...# #...# ##### #...# #...# #...#', 'B': '####. #...# #...# ####. #...# #...# ####.',
    'C': '.###. #...# #.... #.... #.... #...# .###.', 'D': '###.. #..#. #...# #...# #...# #..#. ###..',
    'E': '##### #.... #.... ####. #.... #.... #####', 'F': '##### #.... #.... ####. #.... #.... #....',
    'G': '.###. #...# #.... #.### #...# #...# .####', 'H': '#...# #...# #...# ##### #...# #...# #...#',
    'I': '### .#. .#. .#. .#. .#. ###', 'J': '..### ...#. ...#. ...#. #..#. #..#. .##..',
    'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#', 'L': '#... #... #... #... #... #... ####',
    'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#', 'N': '#...# ##..# #.#.# #..## #...# #...# #...#',
    'O': '.###. #...# #...# #...# #...# #...# .###.', 'P': '####. #...# #...# ####. #.... #.... #....',
    'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#', 'R': '####. #...# #...# ####. #.#.. #..#. #...#',
    'S': '.#### #.... #.... .###. ....# ....# ####.', 'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
    'U': '#...# #...# #...# #...# #...# #...# .###.', 'V': '#...# #...# #...# #...# #...# .#.#. ..#..',
    'W': '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.', 'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', 'Z': '##### ....# ...#. ..#.. .#... #.... #####',
    '[': '### #.. #.. #.. #.. #.. ###', ']': '### ..# ..# ..# ..# ..# ###', '_': '..... ..... ..... ..... ..... ..... ..... #####',
    'a': '.... .... .##. ...# .### #..# .###', 'b': '#... #... ###. #..# #..# #..# ###.',
    'c': '.... .... .### #... #... #... .###', 'd': '...# ...# .### #..# #..# #..# .###',
    'e': '.... .... .##. #..# #### #... .###', 'f': '..## .#.. #### .#.. .#.. .#.. .#..',
    'g': '.... .... .### #..# #..# .### ...# ###.', 'h': '#... #... ###. #..# #..# #..# #..#',
    'i': '# . # # # # #', 'j': '..# ... .## ..# ..# ..# ..# ##.', 'k': '#... #... #..# #.#. ##.. #.#. #..#',
    'l': '#. #. #. #. #. #. .#', 'm': '..... ..... ##.#. #.#.# #.#.# #.#.# #.#.#',
    'n': '.... .... ###. #..# #..# #..# #..#', 'o': '.... .... .##. #..# #..# #..# .##.',
    'p': '.... .... ###. #..# #..# ###. #... #...', 'q': '.... .... .### #..# #..# .### ...# ...#',
    'r': '.... .... #.## ##.. #... #... #...', 's': '.... .... .### #... .##. ...# ###.',
    't': '.#. .#. ### .#. .#. .#. ..#', 'u': '.... .... #..# #..# #..# #..# .###',
    'v': '..... ..... #...# #...# .#.#. .#.#. ..#..', 'w': '..... ..... #...# #...# #.#.# #.#.# .#.#.',
    'x': '..... ..... #...# .#.#. ..#.. .#.#. #...#', 'y': '.... .... #..# #..# #..# .### ...# ###.',
    'z': '.... .... #### ...# .##. #... ####', '~': '..... ..... .#... #.#.# ...#.',
    '^': '..#.. .#.#. #...#', '|': '# # # # # # # #'
  };
  var FONT = null;
  function fontAtlas() {
    if (FONT) return FONT;
    var list = Object.keys(GLYPHS), cw = 7, ch = 9, cols = 16, rows = Math.ceil(list.length / cols);
    var F = { map: {}, w: {}, c: mkCanvas(cols * cw, rows * ch), cw: cw, ch: ch, tint: {} };
    if (!F.c) { FONT = F; return F; }
    var g = F.c.getContext('2d'); g.fillStyle = '#ffffff';
    list.forEach(function (k, i) {
      var rr = GLYPHS[k].split(' '), gx = (i % cols) * cw, gy = Math.floor(i / cols) * ch, w = 0;
      rr.forEach(function (row, y) { w = Math.max(w, row.length); for (var x = 0; x < row.length; x++) if (row.charAt(x) === '#') g.fillRect(gx + x, gy + y, 1, 1); });
      F.map[k] = [gx, gy]; F.w[k] = w;
    });
    FONT = F; return F;
  }
  function tinted(col) {
    var F = fontAtlas(); if (!F.c) return null;
    if (F.tint[col]) return F.tint[col];
    var c = mkCanvas(F.c.width, F.c.height), g = c.getContext('2d');
    g.drawImage(F.c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
    return (F.tint[col] = c);
  }
  // width of a string in logical px at scale 1 (1 px letter gap, 3 px space)
  function measure(s) {
    var F = fontAtlas(), w = 0; s = String(s);
    for (var i = 0; i < s.length; i++) { var k = s.charAt(i); if (k === ' ') { w += 3; continue; } w += (F.w[k] || F.w['?'] || 4) + 1; }
    return Math.max(0, w - 1);
  }
  // o = {color, shadow (colour or false), align 'left' | 'center' | 'right', outline (colour), thin (4-way outline + drop pixel)}; y = top of the cap height
  function text(g, s, x, y, o) {
    o = o || {}; s = String(s); var F = fontAtlas(); if (!F.c) return 0;
    var w = measure(s), x0 = Math.round(o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x), y0 = Math.round(y);
    function run(img, dx, dy) { var cx = x0 + dx; for (var i = 0; i < s.length; i++) { var k = s.charAt(i); if (k === ' ') { cx += 3; continue; } var p = F.map[k] || F.map['?']; var gw = F.w[k] || F.w['?']; g.drawImage(img, p[0], p[1], gw, F.ch, cx, y0 + dy, gw, F.ch); cx += gw + 1; } }
    if (o.outline) { var oc = tinted(o.outline); (o.thin ? [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]] : [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]).forEach(function (d) { run(oc, d[0], d[1]); }); }
    else if (o.shadow !== false) run(tinted(o.shadow || '#0d0a14'), 1, 1);
    run(tinted(o.color || '#f4ead8'), 0, 0);
    return w;
  }

  /* =====================================================================================================
     Content tables (all plain data; a host adds or overrides entries through create({rooms, monsters, items}))
     ===================================================================================================== */
  // Room types. weight / minFloor / maxFloor / maxPerFloor pick them; floor = a floor style ('flag' | 'tile' | 'brick' |
  // 'moss') or {base, light, dark, gap}; decor = [[kind, density]] (kind = a built-in decor id or a function
  // (ctx, x, y, tMs, v) drawing one 16 px cell at x, y); budget scales the monster budget; chest = chance of a chest;
  // light = a colour that tints the room's torch light; feature = 'fountain' (bump: heal to full once).
  var ROOMS = {
    hall: { name: 'Hall', weight: 4, floor: 'flag', decor: [['rubble', 0.035], ['bones', 0.02], ['moss', 0.05], ['cobweb', 1]], budget: 1, chest: 0.12 },
    crypt: { name: 'Crypt', weight: 2.2, floor: 'tile', decor: [['urn', 0.06], ['bones', 0.05], ['candles', 0.03], ['cobweb', 1]], budget: 1.15, chest: 0.25, light: '#9ab8ff' },
    store: { name: 'Storeroom', weight: 2, floor: 'brick', decor: [['crate', 0.09], ['barrel', 0.07], ['rubble', 0.02]], budget: 0.8, chest: 0.45 },
    flooded: { name: 'Flooded cell', weight: 1.4, minFloor: 2, floor: 'moss', decor: [['puddle', 0.16], ['moss', 0.12], ['rubble', 0.02]], budget: 1, chest: 0.1, light: '#7ad8c8' },
    shrine: { name: 'Shrine', weight: 1, minFloor: 2, maxPerFloor: 1, floor: 'tile', decor: [['candles', 0.06]], budget: 0, chest: 0, feature: 'fountain', light: '#a8e8ff' },
    lair: { name: 'Lair', weight: 1, minFloor: 3, floor: 'flag', decor: [['bones', 0.1], ['rubble', 0.05], ['cobweb', 1]], budget: 1.7, chest: 0.6, light: '#ff9a6a' }
  };
  // Monsters. look = a built-in look ('slime' hops, 'ember' hops (a slime crowned with flame), 'bat' flies, 'spore' hops, 'wisp' glides, 'crown' glides) or
  // draw(ctx, x, footY, o) with o = {t, facing, frame, flash, scale}; palette = {main, light, dark, eye} overrides the look's
  // colours; speed 1 = one action per turn, 2 = two, 0.5 = every other turn; erratic = chance of a random step; cost =
  // budget points; minFloor / maxFloor = where it can be placed; boss: true = only the last floor's throne room.
  var MONSTERS = {
    slime: { name: 'Bog Slime', look: 'slime', hp: 9, atk: 3, def: 0, xp: 3, speed: 1, sight: 6, cost: 2, minFloor: 1, maxFloor: 3 },
    bat: { name: 'Cave Bat', look: 'bat', hp: 6, atk: 2, def: 0, xp: 2, speed: 2, erratic: 0.4, sight: 7, cost: 2, minFloor: 1, maxFloor: 4 },
    spore: { name: 'Sporeling', look: 'spore', hp: 14, atk: 4, def: 1, xp: 5, speed: 0.5, sight: 5, cost: 3, minFloor: 2 },
    wisp: { name: 'Lantern Wisp', look: 'wisp', hp: 12, atk: 5, def: 1, xp: 6, speed: 1, sight: 8, cost: 4, minFloor: 3 },
    ember: { name: 'Ember Slime', look: 'ember', hp: 18, atk: 6, def: 1, xp: 8, speed: 1, sight: 6, cost: 5, minFloor: 4 },
    crown: { name: 'The Hollow Crown', look: 'crown', hp: 64, atk: 8, def: 2, xp: 0, speed: 1, sight: 10, cost: 99, boss: true, size: 1.4 }
  };
  // Items. look = 'potion' | 'coins' | 'scroll' | 'shard' | 'heart' (or draw(ctx, x, y, tMs)); color tints potion / shard;
  // effect = {heal, gold, reveal, atk, def, maxHp}; carry: true = goes to the bag (potions: key 'potion' drinks one);
  // weight = chance in chests and on the floor; minFloor / maxFloor; loose: false = only in chests.
  var ITEMS = {
    potion: { name: 'Red Tonic', look: 'potion', color: '#e8364a', effect: { heal: 16 }, carry: true, weight: 5 },
    coins: { name: 'Gold', look: 'coins', effect: { gold: 12 }, weight: 6 },
    scroll: { name: 'Scroll of Sight', look: 'scroll', effect: { reveal: true }, weight: 1.2, minFloor: 2, loose: false },
    shard: { name: 'Ember Shard', look: 'shard', color: '#ff8a3a', effect: { atk: 1 }, weight: 1.4, loose: false },
    heart: { name: 'Heart Crystal', look: 'heart', color: '#ff5a7a', effect: { maxHp: 6, heal: 6 }, weight: 1.2, loose: false }
  };
  var DEFAULTS = {
    floors: 5, width: 46, height: 34, rooms: 10, loops: 0.25, doors: 0.6, density: 1, chests: 1, light: 6.5, fog: 'on',
    minimap: 'on', numbers: 'on', moveMs: 120, heroHp: 30, heroAtk: 5, heroDef: 1, potions: 1
  };
  var DECOR_BLOCK = { crate: 1, barrel: 1, urn: 1 };

  /* =====================================================================================================
     Floor generator: generate({seed, floor, floors, params, rooms, monsters, items}) -> floor (plain data)
     ===================================================================================================== */
  function eligible(def, floor, isLast) { return (def.minFloor || 1) <= floor && (def.maxFloor == null || def.maxFloor >= floor) && !(def.boss && !isLast); }
  function generate(o) {
    o = o || {};
    var P = o.params || DEFAULTS, floorNo = o.floor || 1, floors = o.floors || P.floors || 5, isLast = floorNo >= floors;
    var LIB = { rooms: o.rooms || ROOMS, monsters: o.monsters || MONSTERS, items: o.items || ITEMS };
    var seed = ((o.seed >>> 0) * 2654435761 + floorNo * 97531) >>> 0, R = rng(seed);
    var W = clamp(Math.round(num(P.width, 46)), 24, 96), H = clamp(Math.round(num(P.height, 34)), 18, 72);
    var tiles = new Uint8Array(W * H), rid = new Int16Array(W * H).fill(-1), corr = new Uint8Array(W * H);
    var at = function (x, y) { return x < 0 || y < 0 || x >= W || y >= H ? ROCK : tiles[y * W + x]; };
    var set = function (x, y, v) { if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = v; };
    // 1. rooms: random rectangles (interior w 4-10, h 3-7) with at least 3 cells of rock between interiors
    var rooms = [], want = clamp(Math.round(num(P.rooms, 10)), 3, 30), tries = 0;
    while (rooms.length < want && tries++ < 900) {
      var w = R.int(4, 10), h = R.int(3, 7);
      if (isLast && rooms.length === 0) { w = 9; h = 6; }
      var x = R.int(2, W - w - 2), y = R.int(3, H - h - 2), ok = true;
      for (var i = 0; i < rooms.length && ok; i++) { var q = rooms[i]; if (x < q.x + q.w + 3 && x + w + 3 > q.x && y < q.y + q.h + 3 && y + h + 3 > q.y) ok = false; }
      if (!ok) continue;
      rooms.push({ id: rooms.length, x: x, y: y, w: w, h: h, cx: x + (w - 1) / 2, cy: y + (h - 1) / 2, doors: [] });
    }
    rooms.forEach(function (r) { for (var yy = r.y; yy < r.y + r.h; yy++) for (var xx = r.x; xx < r.x + r.w; xx++) { set(xx, yy, FLOOR); rid[yy * W + xx] = r.id; } });
    // 2. graph: minimum spanning tree over room centres (Prim), plus loops among each room's 3 nearest neighbours
    var n = rooms.length, d2 = function (a, b) { var dx = a.cx - b.cx, dy = (a.cy - b.cy) * 1.3; return dx * dx + dy * dy; };
    var inT = [true], mst = [], loops = [], has = {};
    for (var k = 1; k < n; k++) inT.push(false);
    for (k = 1; k < n; k++) {
      var best = null;
      for (var a = 0; a < n; a++) if (inT[a]) for (var b = 0; b < n; b++) if (!inT[b]) { var dd = d2(rooms[a], rooms[b]); if (!best || dd < best[2]) best = [a, b, dd]; }
      inT[best[1]] = true; mst.push([best[0], best[1]]); has[Math.min(best[0], best[1]) + ',' + Math.max(best[0], best[1])] = 1;
    }
    var loopP = clamp(num(P.loops, 0.25), 0, 1);
    for (a = 0; a < n; a++) {
      var near = []; for (b = 0; b < n; b++) if (b !== a) near.push([b, d2(rooms[a], rooms[b])]);
      near.sort(function (p, q2) { return p[1] - q2[1]; });
      near.slice(0, 3).forEach(function (e) { var key = Math.min(a, e[0]) + ',' + Math.max(a, e[0]); if (has[key]) return; if (R() < loopP * 0.5) { has[key] = 1; loops.push([a, e[0]]); } });
    }
    // 3. corridors: A* between door cells on facing walls, 4-way, avoiding every room's wall ring, straight runs preferred
    var ring = new Uint8Array(W * H);
    rooms.forEach(function (r) { for (var yy = r.y - 1; yy <= r.y + r.h; yy++) for (var xx = r.x - 1; xx <= r.x + r.w; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) ring[yy * W + xx] = 1; });
    var doors = [];
    function doorOn(r, side, toward) {
      // reuse a door already on this side within 3 cells of the wanted spot; else a new one >= 2 cells from other doors
      var horiz = side === 'n' || side === 's', lo = horiz ? r.x : r.y, hi = horiz ? r.x + r.w - 1 : r.y + r.h - 1;
      var want2 = clamp(Math.round(toward), lo, hi), c, bestD = null;
      r.doors.forEach(function (dd2) { if (dd2.side === side && Math.abs(dd2.p - want2) <= 3 && (!bestD || Math.abs(dd2.p - want2) < Math.abs(bestD.p - want2))) bestD = dd2; });
      if (bestD) return bestD;
      var cands = [];
      for (c = lo; c <= hi; c++) if (!r.doors.some(function (dd2) { return dd2.side === side && Math.abs(dd2.p - c) < 2; })) cands.push(c);
      if (!cands.length) return null;
      cands.sort(function (p, q2) { return Math.abs(p - want2) - Math.abs(q2 - want2) || p - q2; });
      var p = cands[Math.min(cands.length - 1, R.int(0, 1))];
      var dx = side === 'e' ? 1 : side === 'w' ? -1 : 0, dy = side === 's' ? 1 : side === 'n' ? -1 : 0;
      var cx = horiz ? p : side === 'e' ? r.x + r.w : r.x - 1, cy = horiz ? (side === 's' ? r.y + r.h : r.y - 1) : p;
      var dobj = { room: r.id, side: side, p: p, x: cx, y: cy, ox: cx + dx, oy: cy + dy };
      if (dobj.ox < 1 || dobj.oy < 1 || dobj.ox >= W - 1 || dobj.oy >= H - 1) return null;
      r.doors.push(dobj); return dobj;
    }
    function sides(a2, b2) {
      var dx = b2.cx - a2.cx, dy = (b2.cy - a2.cy) * 1.3, out = [];
      if (Math.abs(dx) >= Math.abs(dy)) out.push(dx > 0 ? ['e', 'w'] : ['w', 'e'], dy > 0 ? ['s', 'n'] : ['n', 's']);
      else out.push(dy > 0 ? ['s', 'n'] : ['n', 's'], dx > 0 ? ['e', 'w'] : ['w', 'e']);
      return out;
    }
    function astar(sx, sy, tx, ty) {
      var N = W * H, gS = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), dirA = new Int8Array(N).fill(-1), open = [], closed = new Uint8Array(N);
      var s0 = sy * W + sx, t0 = ty * W + tx; gS[s0] = 0; open.push([Math.abs(sx - tx) + Math.abs(sy - ty), s0]);
      while (open.length) {
        var bi = 0; for (var j = 1; j < open.length; j++) if (open[j][0] < open[bi][0] || (open[j][0] === open[bi][0] && open[j][1] < open[bi][1])) bi = j;
        var cur = open[bi][1]; open[bi] = open[open.length - 1]; open.pop();
        if (closed[cur]) continue; closed[cur] = 1;
        if (cur === t0) break;
        var cx = cur % W, cy = (cur / W) | 0;
        for (var dI = 0; dI < 4; dI++) {
          var nx = cx + DIRS4[dI][0], ny = cy + DIRS4[dI][1];
          if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
          var ni = ny * W + nx; if (closed[ni]) continue;
          if (ring[ni] && ni !== t0) continue;
          var cost = (corr[ni] ? 0.45 : 1) + (dirA[cur] >= 0 && dirA[cur] !== dI ? 0.8 : 0) + hash(nx, ny, seed) * 0.15;
          var ng = gS[cur] + cost;
          if (ng < gS[ni]) { gS[ni] = ng; from[ni] = cur; dirA[ni] = dI; open.push([ng + Math.abs(nx - tx) + Math.abs(ny - ty), ni]); }
        }
      }
      if (from[t0] < 0 && s0 !== t0) return null;
      var path = [], c2 = t0; while (c2 !== -1) { path.push(c2); if (c2 === s0) break; c2 = from[c2]; }
      return path.reverse();
    }
    var failed = 0;
    function connect(ai, bi2) {
      var A = rooms[ai], B = rooms[bi2], opts = sides(A, B);
      for (var t2 = 0; t2 < opts.length; t2++) {
        var sa = opts[t2][0], sb = opts[t2][1];
        var horizA = sa === 'n' || sa === 's', horizB = sb === 'n' || sb === 's';
        var da = doorOn(A, sa, horizA ? B.cx : B.cy), db = doorOn(B, sb, horizB ? A.cx : A.cy);
        if (!da || !db) continue;
        ring[da.oy * W + da.ox] = 0; ring[db.oy * W + db.ox] = 0;
        var path = astar(da.ox, da.oy, db.ox, db.oy);
        if (!path) continue;
        path.forEach(function (ci) { tiles[ci] = FLOOR; corr[ci] = 1; });
        [da, db].forEach(function (dd) { if (tiles[dd.y * W + dd.x] !== DOOR) { set(dd.x, dd.y, DOOR); dd.carved = true; } });
        return true;
      }
      failed++; return false;
    }
    mst.forEach(function (e) { connect(e[0], e[1]); });
    loops.forEach(function (e) { connect(e[0], e[1]); });
    // drop doors that a later corridor did not use (a door must lead somewhere): no floor outside
    // 4. walls: every rock cell next to (8-way) a non-rock cell
    var walls = [];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      if (tiles[y * W + x] !== ROCK) continue;
      for (var d8 = 0; d8 < 8; d8++) { var t3 = at(x + DIRS8[d8][0], y + DIRS8[d8][1]); if (t3 !== ROCK && t3 !== WALL) { tiles[y * W + x] = WALL; walls.push([x, y]); break; } }
    }
    // 5. door kinds: a real door (blocks sight until opened) or an open arch; the cell outside a door is never a door
    var doorList = [];
    for (i = 0; i < W * H; i++) if (tiles[i] === DOOR) {
      var dx0 = i % W, dy0 = (i / W) | 0, vert = at(dx0, dy0 - 1) === WALL && at(dx0, dy0 + 1) === WALL;
      var isDoor = R() < clamp(num(P.doors, 0.6), 0, 1);
      if (!isDoor) tiles[i] = FLOOR;
      doorList.push({ x: dx0, y: dy0, axis: vert ? 'v' : 'h', door: isDoor, open: !isDoor });
    }
    // 6. start and stairs: the start room is random; stairs go in the room farthest (walking distance) from it
    var start = rooms[isLast ? 1 % n : R.int(0, n - 1)];
    var dist = bfs(tiles, W, H, Math.round(start.cx), Math.round(start.cy), true);
    var far = null; rooms.forEach(function (r) { if (r === start) return; var dd = dist[Math.round(r.cy) * W + Math.round(r.cx)]; if (dd >= 0 && (!far || dd > far.d)) far = { r: r, d: dd }; });
    var goal = isLast ? rooms[0] : (far ? far.r : rooms[(start.id + 1) % n]);
    // room types
    var typeIds = Object.keys(LIB.rooms), counts = {};
    rooms.forEach(function (r) {
      if (r === start) { r.type = 'hall'; r.start = true; return; }
      if (isLast && r === goal) { r.type = 'throne'; return; }
      var tid = weighted(R, typeIds, function (id) { var d = LIB.rooms[id]; if (!eligible(d, floorNo, isLast)) return 0; if (d.maxPerFloor != null && (counts[id] || 0) >= d.maxPerFloor) return 0; return num(d.weight, 1); }) || 'hall';
      counts[tid] = (counts[tid] || 0) + 1; r.type = tid;
    });
    // occupied cells: door fronts (inside and outside of every door / arch), the start spot and the stairs stay free
    var busy = new Uint8Array(W * H), keepFree = new Uint8Array(W * H);
    doorList.forEach(function (dd) { DIRS4.forEach(function (v) { var xx = dd.x + v[0], yy = dd.y + v[1]; if (xx >= 0 && yy >= 0 && xx < W && yy < H) keepFree[yy * W + xx] = 1; }); keepFree[dd.y * W + dd.x] = 1; });
    var sx = Math.round(start.cx), sy = Math.round(start.cy);
    keepFree[sy * W + sx] = 1; busy[sy * W + sx] = 1;
    var stairs = null;
    if (!isLast) {
      var sc = [];
      for (y = goal.y + 1; y < goal.y + goal.h - 1; y++) for (x = goal.x + 1; x < goal.x + goal.w - 1; x++) if (!keepFree[y * W + x]) sc.push([x, y]);
      if (!sc.length) for (y = goal.y; y < goal.y + goal.h; y++) for (x = goal.x; x < goal.x + goal.w; x++) if (!keepFree[y * W + x]) sc.push([x, y]);
      var sp = sc.length ? sc[R.int(0, sc.length - 1)] : [Math.round(goal.cx), Math.round(goal.cy)];
      stairs = { x: sp[0], y: sp[1] }; set(sp[0], sp[1], STAIRS); busy[sp[1] * W + sp[0]] = 1; keepFree[sp[1] * W + sp[0]] = 1;
      DIRS8.forEach(function (v) { keepFree[(sp[1] + v[1]) * W + sp[0] + v[0]] = 1; });
    }
    function freeCells(r, edgeOnly) {
      var out = [];
      for (var yy = r.y; yy < r.y + r.h; yy++) for (var xx = r.x; xx < r.x + r.w; xx++) {
        var ii = yy * W + xx; if (busy[ii] || keepFree[ii] || tiles[ii] !== FLOOR) continue;
        if (edgeOnly && !(xx === r.x || yy === r.y || xx === r.x + r.w - 1 || yy === r.y + r.h - 1)) continue;
        out.push([xx, yy]);
      }
      return out;
    }
    function take(list) { if (!list.length) return null; var j = R.int(0, list.length - 1), c = list[j]; list.splice(j, 1); busy[c[1] * W + c[0]] = 1; return c; }
    // 7. features, chests, loose items, decor, torches, monsters
    var features = [], chests = [], items = [], decor = [], torches = [], monsters = [];
    var itemIds = Object.keys(LIB.items);
    function loot(inChest) { return weighted(R, itemIds, function (id) { var d = LIB.items[id]; if (!eligible(d, floorNo, false)) return 0; if (!inChest && d.loose === false) return 0; return num(d.weight, 1); }); }
    rooms.forEach(function (r) {
      var def = LIB.rooms[r.type] || {};
      if (r.type === 'throne') { [0, -1, 1].some(function (dx) { var tx = Math.round(r.cx) + dx, ty = r.y; if (keepFree[ty * W + tx] || busy[ty * W + tx]) return false; busy[ty * W + tx] = 1; features.push({ x: tx, y: ty, kind: 'throne', used: false, room: r.id }); return true; }); }
      if (def.feature === 'fountain') { var fc = [Math.round(r.cx), Math.round(r.cy)]; if (!keepFree[fc[1] * W + fc[0]] && !busy[fc[1] * W + fc[0]]) { busy[fc[1] * W + fc[0]] = 1; features.push({ x: fc[0], y: fc[1], kind: 'fountain', used: false, room: r.id }); } }
      if (r.start || r.type === 'throne') return;
      var chance = num(def.chest, 0.15) * num(P.chests, 1);
      while (chance > 0) {
        if (R() < Math.min(1, chance)) { var top = freeCells(r, true).filter(function (c) { return c[1] === r.y; }); var cc = take(top.length ? top : freeCells(r, true)); if (cc) chests.push({ x: cc[0], y: cc[1], item: loot(true), open: false, room: r.id }); }
        chance -= 1;
      }
      if (R() < 0.3) { var lc = take(freeCells(r)); if (lc) items.push({ x: lc[0], y: lc[1], item: loot(false), room: r.id }); }
    });
    // every floor holds at least one chest
    if (!chests.length) { var rr2 = rooms.filter(function (r) { return !r.start && r.type !== 'throne'; })[0]; var cc2 = rr2 && take(freeCells(rr2, true)); if (cc2) chests.push({ x: cc2[0], y: cc2[1], item: loot(true), open: false, room: rr2.id }); }
    rooms.forEach(function (r) {
      var def = LIB.rooms[r.type] || LIB.rooms.hall || {};
      (def.decor || []).forEach(function (dc) {
        var kind = dc[0], dens = num(dc[1], 0.05);
        if (kind === 'cobweb') { [[r.x, r.y], [r.x + r.w - 1, r.y]].forEach(function (c) { if (!busy[c[1] * W + c[0]] && R() < 0.5) decor.push({ x: c[0], y: c[1], kind: 'cobweb', v: R(), flat: true, room: r.id, corner: c[0] === r.x ? 'l' : 'r' }); }); return; }
        var block = typeof kind === 'string' ? !!DECOR_BLOCK[kind] : !!dc[2];
        var cells = freeCells(r, block), cnt = Math.round(r.w * r.h * dens + R() * 0.6);
        for (var j = 0; j < cnt && cells.length; j++) { var c = take(cells); if (!c) break; decor.push({ x: c[0], y: c[1], kind: kind, v: R(), block: block, room: r.id }); if (!block) busy[c[1] * W + c[0]] = 0; }
      });
      // torches on the room's north wall face (a wall cell with the room floor right below it), about every 4 cells
      for (var xx = r.x + 1; xx < r.x + r.w - 1; xx += 1) if ((xx - r.x) % 4 === 1 && at(xx, r.y - 1) === WALL && at(xx, r.y) === FLOOR) torches.push({ x: xx, y: r.y - 1, room: r.id, light: def.light || null });
    });
    // blocking decor must never cut the floor apart or wall off a chest, item or the stairs: drop offenders
    for (var pass = 0; pass < 40; pass++) {
      var blockAt = new Uint8Array(W * H); decor.forEach(function (dc) { if (dc.block) blockAt[dc.y * W + dc.x] = 1; }); chests.forEach(function (c) { blockAt[c.y * W + c.x] = 1; }); features.forEach(function (f) { blockAt[f.y * W + f.x] = 1; });
      var dm = bfs(tiles, W, H, sx, sy, true, blockAt), bad = -1;
      for (i = 0; i < W * H && bad < 0; i++) if ((tiles[i] === FLOOR || tiles[i] === DOOR || tiles[i] === STAIRS) && !blockAt[i] && dm[i] < 0) bad = i;
      var unreach = function (c) { return !DIRS8.some(function (v) { var ii = (c.y + v[1]) * W + c.x + v[0]; return dm[ii] >= 0; }); };
      var badThing = chests.concat(features).filter(unreach)[0];
      // and inside every room the free cells stay connected (4-way), so no room is split by its own crates
      if (bad < 0 && !badThing) rooms.some(function (r) {
        var seen = {}, first = null, cnt = 0, tot = 0, yy, xx;
        for (yy = r.y; yy < r.y + r.h; yy++) for (xx = r.x; xx < r.x + r.w; xx++) if (!blockAt[yy * W + xx]) { tot++; if (!first) first = [xx, yy]; }
        if (!first) return false;
        var st = [first]; seen[first[0] + ',' + first[1]] = 1;
        while (st.length) { var c = st.pop(); cnt++; DIRS4.forEach(function (v) { var nx = c[0] + v[0], ny = c[1] + v[1]; if (nx < r.x || ny < r.y || nx >= r.x + r.w || ny >= r.y + r.h || seen[nx + ',' + ny] || blockAt[ny * W + nx]) return; seen[nx + ',' + ny] = 1; st.push([nx, ny]); }); }
        if (cnt === tot) return false;
        for (yy = r.y; yy < r.y + r.h && !badThing; yy++) for (xx = r.x; xx < r.x + r.w; xx++) if (!blockAt[yy * W + xx] && !seen[xx + ',' + yy]) { badThing = { x: xx, y: yy }; break; }
        return true;
      });
      if (bad < 0 && !badThing) break;
      var bx = bad >= 0 ? bad % W : badThing.x, by = bad >= 0 ? (bad / W) | 0 : badThing.y, bestJ = -1, bestD2 = 1e9;
      decor.forEach(function (dc, j) { if (!dc.block) return; var q3 = (dc.x - bx) * (dc.x - bx) + (dc.y - by) * (dc.y - by); if (q3 < bestD2) { bestD2 = q3; bestJ = j; } });
      if (bestJ < 0) break; busy[decor[bestJ].y * W + decor[bestJ].x] = 0; decor.splice(bestJ, 1);
    }
    // monsters: a budget per room (area x density x room budget x depth), spent on eligible kinds; never in the start room
    var monIds = Object.keys(LIB.monsters), density = num(P.density, 1);
    rooms.forEach(function (r) {
      var def = LIB.rooms[r.type] || {};
      if (r.start) return;
      if (r.type === 'throne') {
        var bossId = monIds.filter(function (id) { return LIB.monsters[id].boss; })[0];
        var bc = [Math.round(r.cx), r.y + 1]; if (bossId) { busy[bc[1] * W + bc[0]] = 1; monsters.push({ kind: bossId, x: bc[0], y: bc[1], room: r.id, boss: true }); }
        r.budget = 6 * density;
      } else r.budget = r.w * r.h * 0.085 * density * num(def.budget, 1) * (1 + 0.18 * (floorNo - 1));
      var left = r.budget, cells = freeCells(r);
      for (var guard = 0; guard < 20 && left > 0.5 && cells.length; guard++) {
        var id = weighted(R, monIds, function (mid) { var md = LIB.monsters[mid]; if (md.boss || !eligible(md, floorNo, isLast)) return 0; if (num(md.cost, 2) > left + 0.75) return 0; return 1 + (floorNo - (md.minFloor || 1)) * 0.0; });
        if (!id) break;
        var c = take(cells); if (!c) break;
        left -= num(LIB.monsters[id].cost, 2);
        monsters.push({ kind: id, x: c[0], y: c[1], room: r.id });
      }
    });
    return { seed: o.seed >>> 0, floor: floorNo, floors: floors, last: isLast, w: W, h: H, tiles: tiles, room: rid, corridor: corr,
      rooms: rooms.map(function (r) { return { id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, cx: r.cx, cy: r.cy, type: r.type, start: !!r.start, budget: r.budget || 0 }; }),
      doors: doorList, start: { x: sx, y: sy, room: start.id }, stairs: stairs, goal: goal.id, chests: chests, items: items, decor: decor, torches: torches,
      features: features, monsters: monsters, edges: { mst: mst, loops: loops }, failed: failed };
  }
  // breadth-first walking distance from (x, y): 8-way without corner cutting when diag, doors passable; block = extra blockers
  function bfs(tiles, W, H, x, y, diag, block) {
    var d = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H), qh = 0, qt = 0, s = y * W + x;
    d[s] = 0; q[qt++] = s;
    var pass = function (i) { var t = tiles[i]; return (t === FLOOR || t === DOOR || t === STAIRS) && !(block && block[i]); };
    while (qh < qt) {
      var c = q[qh++], cx = c % W, cy = (c / W) | 0;
      for (var k = 0; k < (diag ? 8 : 4); k++) {
        var v = diag ? DIRS8[k] : DIRS4[k], nx = cx + v[0], ny = cy + v[1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var ni = ny * W + nx; if (d[ni] >= 0 || !pass(ni)) continue;
        if (v[0] && v[1]) { var a = cy * W + nx, b = ny * W + cx; if (!pass(a) || !pass(b) || tiles[c] === DOOR || tiles[ni] === DOOR) continue; }
        d[ni] = d[c] + 1; q[qt++] = ni;
      }
    }
    return d;
  }
  // field of view: recursive shadowcasting over 8 octants; opaque(x, y) -> bool; marks vis[y * W + x] = 1
  function fov(W, H, ox, oy, radius, opaque, vis) {
    vis[oy * W + ox] = 1;
    var M = [[1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1], [-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1]];
    function cast(row, s0, e0, xx, xy, yx, yy) {
      if (s0 < e0) return;
      var nextStart = s0;
      for (var j = row; j <= radius; j++) {
        var dx = -j - 1, dy = -j, blocked = false;
        while (dx <= 0) {
          dx++;
          var X = ox + dx * xx + dy * xy, Y = oy + dx * yx + dy * yy, lS = (dx - 0.5) / (dy + 0.5), rS = (dx + 0.5) / (dy - 0.5);
          if (s0 < rS) continue; else if (e0 > lS) break;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          if (dx * dx + dy * dy <= radius * radius + radius) vis[Y * W + X] = 1;
          if (blocked) { if (opaque(X, Y)) { nextStart = rS; continue; } else { blocked = false; s0 = nextStart; } }
          else if (opaque(X, Y) && j < radius) { blocked = true; cast(j + 1, s0, lS, xx, xy, yx, yy); nextStart = rS; }
        }
        if (blocked) break;
      }
    }
    for (var o = 0; o < 8; o++) cast(1, 1, 0, M[o][0], M[o][1], M[o][2], M[o][3]);
  }

  /* =====================================================================================================
     Art: everything drawn in code at 1 art px = 1 logical px, light from the top left, cached canvases
     ===================================================================================================== */
  var OL = '#120c1a';                       // outline
  var VOID = '#08060d';
  var SPR = {};                             // sprite cache
  // a tiny pixel buffer: set / get / outline / canvas
  function Pix(w, h) {
    var px = new Array(w * h);
    var P = {
      w: w, h: h,
      set: function (x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h || !c) return; px[y * w + x] = c; },
      clear: function (x, y) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = null; },
      get: function (x, y) { return x < 0 || y < 0 || x >= w || y >= h ? null : px[y * w + x] || null; },
      rect: function (x, y, ww, hh, c) { for (var j = 0; j < hh; j++) for (var i = 0; i < ww; i++) P.set(x + i, y + j, c); },
      outline: function (col, diag) {
        var add = [];
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
          if (px[y * w + x]) continue;
          var n = P.get(x + 1, y) || P.get(x - 1, y) || P.get(x, y + 1) || P.get(x, y - 1) || (diag && (P.get(x + 1, y + 1) || P.get(x - 1, y - 1) || P.get(x + 1, y - 1) || P.get(x - 1, y + 1)));
          if (n && n !== col) add.push(y * w + x);
        }
        add.forEach(function (i) { px[i] = col; });
      },
      rows: function (rows, key, ox, oy) { rows.forEach(function (r, y) { for (var x = 0; x < r.length; x++) { var ch = r.charAt(x); if (ch === '.' || ch === ' ') continue; P.set((ox || 0) + x, (oy || 0) + y, key[ch]); } }); },
      canvas: function () {
        var c = mkCanvas(w, h); if (!c) return null; var g = c.getContext('2d');
        for (var i = 0; i < w * h; i++) if (px[i]) { g.fillStyle = px[i]; g.fillRect(i % w, (i / w) | 0, 1, 1); }
        return c;
      }
    };
    return P;
  }
  // shaded ellipse: ramp = [dark, mid, light, hi]; light from the upper left; o = {top: only y <= cy, spec: highlight spot}
  function blob(P, cx, cy, rx, ry, ramp, o) {
    o = o || {};
    for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      var nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d = nx * nx + ny * ny;
      if (d > 1) continue; if (o.top && y + 0.5 > cy) continue; if (o.bottom && y + 0.5 < cy) continue;
      var nz = Math.sqrt(Math.max(0, 1 - d)), lum = -0.55 * nx - 0.65 * ny + 0.55 * nz;
      var k = lum > 0.78 ? 3 : lum > 0.38 ? 2 : lum > -0.05 ? 1 : 0;
      if (k === 3 && !o.spec) k = 2;
      if (d > 0.82 && k > 1 && ny > -0.2) k = 1;
      P.set(x, y, ramp[k]);
    }
  }
  function cached(key, fn) { if (SPR[key] !== undefined) return SPR[key]; var v = null; try { v = fn(); } catch (e) { warn('art ' + key, e); } SPR[key] = v; return v; }

  /* ---------- hero: hooded wanderer, 4 facings, 4-frame walk (side 'left' is a painted variant: light stays top-left) ---------- */
  var HERO_KEY = { H: '#5cb0a4', h: '#2f7a76', d: '#1c4a52', D: '#12303a', s: '#f2c8a0', S: '#c88e6a', e: '#1a1024', r: '#d0463c', R: '#8a2430',
    b: '#6a4428', y: '#f0c860', l: '#3c3450', L: '#2a2438', k: '#6a4226', K: '#40261a', w: '#fff4e0', m: '#a8b4c8', M: '#6a7488' };
  var HERO = {
    down: ['....DDDDDD....', '...DHHhhhhdD..', '..DHHhhhhhhdD.', '..DHhhhhhhhdD.', '..DhdssssssdD.', '..DhsesssesdD.', '..DhsssssSSdD.', '...DrrRrrrRD..',
      '..DhrrrrRRRdD.', '.DHhhhhhhhhddD', '.DShhbbybbhdSD', '.DDhhhhhhhhdDD', '..DhhhhhhhddD.'],
    up: ['....DDDDDD....', '...DHHhhhhdD..', '..DHHhhhhhhdD.', '..DHhhhhhhhdD.', '..DHhhhhhhhdD.', '..DhhhhhhhhdD.', '..DhhhhhhhddD.', '...DrrrrrRRD..',
      '..DHhhhhhhhdD.', '.DHhhmhhhhhddD', '.DShhMhhhhhdSD', '.DDhhhhhhhhdDD', '..DhhhhhhhddD.'],
    side: ['....DDDDDD....', '...DHHhhhhhD..', '..DHHhhhhhhhD.', '..DHhhhhhssSD.', '..DHhhhhsssesD', '..DhhhhhssssSD', '..DhhhhhsssSD.', '...DhhrrrrRD..',
      '...DHhhhhhdD..', '..DHhhhhhhhdD.', '..DHhhhbyhhdD.', '..DhhhhhhhsSD.', '...DhhhhhddD..']
  };
  var HERO_LEGS = {
    front: [['...DllD.DlLD..', '...DkkD.DkKD..', '...DDDD.DDDD..'], ['...DllD.DlLD..', '...DkkD.DDDD..', '...DDDD.......'],
      ['...DllD.DlLD..', '...DkkD.DkKD..', '...DDDD.DDDD..'], ['...DllD.DlLD..', '...DDDD.DkKD..', '........DDDD..']],
    side: [['...DllllD.....', '...DkkkKD.....', '...DDDDDD.....'], ['..DllD.DLLD...', '.DkkD...DKKD..', '.DDD.....DDD..'],
      ['...DllllD.....', '...DkkkKD.....', '...DDDDDD.....'], ['...DLlD.DlD...', '..DKKD.DkkD...', '..DDD..DDD....']]
  };
  function heroSprite(dir, frame, flash) {
    return cached('hero:' + dir + frame + (flash ? 'f' : ''), function () {
      var P = Pix(16, 18), side = dir === 'left' || dir === 'right', rows = HERO[side ? 'side' : dir], legs = HERO_LEGS[side ? 'side' : 'front'][frame % 4];
      var bob = frame % 2 ? 1 : 0, key = HERO_KEY;
      var all = rows.concat(legs);
      if (dir === 'left') {
        var SW = { H: 'd', d: 'H' }; all = all.map(function (r) { var o = ''; for (var i = r.length - 1; i >= 0; i--) { var c = r.charAt(i); o += SW[c] || c; } return o; });
      }
      all.forEach(function (r, y) { for (var x = 0; x < r.length; x++) { var c = r.charAt(x); if (c === '.') continue; var yy = y + (y < 13 ? bob : 0) + 1; P.set(x + 1, yy, c === 'D' ? (flash ? '#ffffff' : OL) : key[c]); } });
      return P.canvas();
    });
  }

  /* ---------- monsters (procedural pixel painting, light from the top left, eyes on the facing side) ---------- */
  var LOOKS = {
    slime: { w: 18, h: 16, ramp: ['#1f5a2e', '#3a9a44', '#6cd060', '#d8ffc0'], eye: '#10240f' },
    ember: { w: 18, h: 22, ramp: ['#6a1a0e', '#c8401e', '#f07a34', '#ffd0a0'], eye: '#2a0804', light: '#ff8a3a' },
    bat: { w: 22, h: 14, ramp: ['#2a1838', '#4a2c60', '#6e4a8a', '#b090d0'], eye: '#ff5a4a', fly: 7 },
    spore: { w: 16, h: 17, ramp: ['#5a1a1a', '#a8322a', '#e0603a', '#ffb090'], stem: ['#9a8a72', '#d8c8a8', '#f4ead4'], eye: '#2a1414' },
    wisp: { w: 14, h: 18, ramp: ['#1a3a8a', '#2e7ae0', '#7ac8ff', '#f0fbff'], eye: '#0c1a40', fly: 5, light: '#7ac8ff' },
    crown: { w: 28, h: 30, ramp: ['#1c1030', '#3a2258', '#5a3a80', '#8a6ab0'], eye: '#ffe066', fly: 6, light: '#c08aff' }
  };
  function lookOf(def) { return LOOKS[def && def.look] || LOOKS.slime; }
  function rampOf(def) {
    var L = lookOf(def), p = def && def.palette;
    if (!p) return L.ramp;
    return [p.dark || L.ramp[0], p.main || L.ramp[1], p.light || L.ramp[2], p.hi || mix(p.light || L.ramp[2], '#ffffff', 0.6)];
  }
  // one monster frame: facing 'left' | 'right', frame 0..3, flash = white silhouette
  function monsterSprite(def, facing, frame, flash) {
    var look = (def && def.look) || 'slime';
    return cached('m:' + (def && def.__id) + ':' + facing + frame + (flash ? 'f' : ''), function () {
      var L = lookOf(def), R = rampOf(def), eye = (def && def.palette && def.palette.eye) || L.eye, P = Pix(L.w, L.h), s = facing === 'left' ? -1 : 1;
      var cx = L.w / 2;
      if (look === 'slime' || look === 'ember') {
        var sq = frame === 4 ? [5.4, 6.6, 0] : [[6.6, 5.2, 0], [7.2, 4.6, 0], [6.0, 5.8, 0], [6.3, 5.4, 0]][frame % 4];
        var cy = L.h - 1 - sq[1];
        blob(P, cx, cy, sq[0], sq[1], R, { spec: true });
        // inner shading bubbles and a glossy rim
        P.set(cx - 3, cy - sq[1] + 2, R[3]); P.set(cx - 2, cy - sq[1] + 1, R[3]); P.set(cx - 4, cy - sq[1] + 3, R[2]);
        P.set(cx + 2, cy + 2, R[0]); P.set(cx + 3, cy + 1, R[0]);
        var ex = Math.round(cx + s * 1.5), ey = Math.round(cy - 1);
        [[ex - 2, ey], [ex + 2, ey]].forEach(function (e) { P.set(e[0], e[1], eye); P.set(e[0], e[1] + 1, eye); P.set(e[0] + (s > 0 ? 0 : 0), e[1] - 0, eye); P.set(e[0], e[1], '#ffffff'); });
        P.set(ex - 2, ey + 1, eye); P.set(ex + 2, ey + 1, eye);
        P.set(ex, ey + 3, R[0]); P.set(ex + s, ey + 3, R[0]);
        if (frame === 4) { P.set(ex - 1, ey + 3, '#1a0a0a'); P.set(ex, ey + 3, '#1a0a0a'); P.set(ex + 1, ey + 3, '#1a0a0a'); P.set(ex, ey + 4, '#1a0a0a'); }
        if (look === 'ember') {
          // a crown of flame on the head: three tongues that flicker per frame, white-hot at the root
          var top = Math.round(cy - sq[1]), FL = ['#ff4a12', '#ff9a2a', '#ffe070', '#fffbe0'], hs = [[-3, 4], [0, 6], [3, 4]], fl = frame % 4;
          hs.forEach(function (q, i) { var hgt = q[1] + ((fl + i) % 3 === 0 ? 1 : 0) - ((fl + i) % 3 === 2 ? 1 : 0); for (var j = 0; j < hgt; j++) { var wdt = j < hgt - 2 ? 1 : 0, c2 = j < 1 ? FL[3] : j < 2 ? FL[2] : j < hgt - 1 ? FL[1] : FL[0]; for (var k = -wdt; k <= wdt; k++) P.set(Math.round(cx + q[0] + k + (j > hgt - 3 ? (i - 1) * 0.5 : 0)), top - j + 1, c2); } });
          [[ex - 2, ey], [ex + 2, ey]].forEach(function (e) { P.set(e[0], e[1], '#fff2a0'); P.set(e[0], e[1] + 1, '#ffb030'); });
        }
        P.outline(OL);
      } else if (look === 'bat') {
        var wy = frame === 4 ? -4 : [-3, 0, 3, 0][frame % 4], by = 6;
        // wings: membrane from the body to the tips, scalloped trailing edge
        for (var side = -1; side <= 1; side += 2) {
          for (var i = 0; i < 8; i++) {
            var x = Math.round(cx + side * (3 + i)), top = Math.round(by - 1 + (wy * i) / 7 - (i < 3 ? 1 : 0)), len = Math.max(1, 4 - Math.floor(i / 2) - ((i % 3) === 2 ? 1 : 0));
            for (var j = 0; j < len; j++) P.set(x, top + j, j === 0 ? R[2] : j === 1 ? R[1] : R[0]);
          }
          P.set(Math.round(cx + side * 10), Math.round(by - 1 + wy) , R[2]);
        }
        blob(P, cx, by + 1, 3.4, 3.2, R, { spec: true });
        P.set(cx - 2, by - 3, R[1]); P.set(cx - 2, by - 2, R[1]); P.set(cx + 1, by - 3, R[1]); P.set(cx + 1, by - 2, R[1]);   // ears
        var bx = Math.round(cx - 0.5 + s * 1);
        P.set(bx - 1, by + 1, eye); P.set(bx + 1, by + 1, eye);
        P.set(bx + (s > 0 ? 1 : -1), by + 3, '#f4ead4');                                                                 // fang
        if (frame === 4) { P.set(bx, by + 3, '#2a0a10'); P.set(bx - s, by + 3, '#f4ead4'); }
        P.outline(OL);
      } else if (look === 'spore') {
        var hop = frame === 4 ? -2 : [0, -1, 1, 0][frame % 4], base = L.h - 1;
        var st = L.stem;
        P.rect(cx - 3, base - 6 + hop, 6, 5 - hop, st[1]); P.rect(cx - 3, base - 6 + hop, 1, 5 - hop, st[2]); P.rect(cx + 2, base - 6 + hop, 1, 5 - hop, st[0]);
        P.set(cx - 3, base, st[0]); P.set(cx - 2, base, st[0]); P.set(cx + 1, base, st[0]); P.set(cx + 2, base, st[0]);    // feet
        var fx = Math.round(cx - 0.5 + s * 1);
        P.set(fx - 1, base - 4 + hop, eye); P.set(fx + 1, base - 4 + hop, eye); P.set(fx, base - 2 + hop, st[0]);
        blob(P, cx, base - 6 + hop, 7, 5.5, R, { top: true, spec: true });
        P.rect(cx - 6, base - 6 + hop, 12, 1, R[0]);
        [[-3, -9], [2, -10], [4, -7], [-5, -7], [0, -8]].forEach(function (q) { P.set(cx + q[0], base + q[1] + hop, '#f8ecd8'); });
        P.outline(OL);
      } else if (look === 'wisp') {
        var fl = frame === 4 ? 2 : [0, 1, 0, -1][frame % 4];
        for (var y = 0; y < L.h - 4; y++) {
          var u = y / (L.h - 5), wdt = u < 0.45 ? 1 + u * 9 : 5 - (u - 0.45) * 2, off = Math.round(Math.sin(u * 6 + frame) * (1 - u) * 1.5) + (y < 5 ? fl : 0);
          for (var x2 = -Math.floor(wdt); x2 <= Math.floor(wdt); x2++) {
            var e = Math.abs(x2) / Math.max(1, wdt), k = e > 0.8 ? 0 : e > 0.5 ? 1 : u > 0.35 && e < 0.3 ? 3 : 2;
            if (x2 < -wdt * 0.3 && k === 1 && u > 0.4) k = 2;
            P.set(Math.round(cx + x2 + off), y + 1, R[k]);
          }
        }
        var wx = Math.round(cx - 0.5 + s * 1.2), wy2 = L.h - 9;
        P.set(wx - 1, wy2, eye); P.set(wx + 1, wy2, eye); P.set(wx - 1, wy2 + 1, eye); P.set(wx + 1, wy2 + 1, eye);
        P.outline(shade(R[0], 0.6));
      } else if (look === 'crown') {
        var sw = [0, 1, 0, -1][frame % 4], top = 8;
        // cloak: a hooded teardrop with a tattered hem that sways
        for (var y3 = top; y3 < L.h - 1; y3++) {
          var u3 = (y3 - top) / (L.h - 1 - top), half = u3 < 0.3 ? 4 + u3 * 18 : 9.4 + u3 * 2.5;
          for (var x3 = -Math.floor(half); x3 <= Math.floor(half); x3++) {
            var hem = y3 > L.h - 5 && ((x3 + sw + 20) % 4 === 0 || (x3 + sw + 21) % 4 === 0) && y3 > L.h - 3;
            if (hem) continue;
            var e3 = x3 / half, k3 = e3 < -0.55 ? 2 : e3 > 0.45 ? 0 : 1;
            if (u3 < 0.15 && e3 < 0) k3 = 2;
            if (Math.abs(x3 + 3) < 1 && u3 > 0.35) k3 = 0;
            if (Math.abs(x3 - 3) < 1 && u3 > 0.4) k3 = 0;
            P.set(Math.round(cx + x3 - 0.5), y3, R[k3]);
          }
        }
        // hollow face and eyes
        for (var y4 = top + 2; y4 < top + 8; y4++) for (var x4 = -4; x4 <= 3; x4++) if ((x4 + 0.5) * (x4 + 0.5) / 18 + (y4 - top - 4.5) * (y4 - top - 4.5) / 10 < 1) P.set(Math.round(cx + x4), y4, '#07040c');
        var ex2 = Math.round(cx + s * 1.2);
        P.set(ex2 - 2, top + 4, eye); P.set(ex2 - 1, top + 4, eye); P.set(ex2 + 1, top + 4, eye); P.set(ex2 + 2, top + 4, eye);
        P.set(ex2 - 2, top + 5, '#c89a20'); P.set(ex2 + 2, top + 5, '#c89a20');
        // crown
        var cr = ['#7a4a10', '#d8a030', '#ffe070', '#fff8c0'];
        for (var x5 = -5; x5 <= 5; x5++) { P.set(Math.round(cx + x5), top - 1, x5 < -2 ? cr[2] : x5 > 2 ? cr[0] : cr[1]); P.set(Math.round(cx + x5), top, cr[0]); }
        [-5, -2, 1, 4].forEach(function (q, i) { P.set(Math.round(cx + q), top - 2, cr[i < 2 ? 2 : 1]); P.set(Math.round(cx + q), top - 3, cr[i < 2 ? 3 : 2]); P.set(Math.round(cx + q + 1), top - 2, cr[1]); });
        P.set(Math.round(cx - 0.5), top - 1, '#ff3a6a'); P.set(Math.round(cx + 0.5), top - 1, '#c01a40');
        // claws
        var hx = Math.round(cx + s * (frame === 4 ? 11 : 9)), hy = top + (frame === 4 ? 8 : 13) + sw;
        P.set(hx, hy, '#d8d0e8'); P.set(hx + s, hy + 1, '#d8d0e8'); P.set(hx, hy + 1, '#a8a0c0'); P.set(hx - s, hy + 1, '#d8d0e8');
        P.outline(OL);
      } else { blob(P, cx, L.h / 2, L.w / 2 - 1, L.h / 2 - 1, R); P.outline(OL); }
      if (flash) { var F = Pix(L.w, L.h); for (var yy = 0; yy < L.h; yy++) for (var xx = 0; xx < L.w; xx++) if (P.get(xx, yy)) F.set(xx, yy, '#ffffff'); return F.canvas(); }
      return P.canvas();
    });
  }

  /* ---------- items, chests, features ---------- */
  var ITEM_ART = {
    potion: ['...kk...', '...KK...', '..gwgg..', '.gwllg..', 'gwlllLg.', 'glllLLg.', 'gLLLLLg.', '.gggggg.'],
    coins: ['..oooo....', '.oyyYYo...', '.oYYYYoooo', '..oooooyyo', 'ooooo.oYYo', 'oyyYYooooo', 'oYYYYYYYo.', '.ooooooo..'],
    scroll: ['.oooooooo.', 'opppppppPo', '.oppqqppo.', '.opppqppo.', '.oppqqqpo.', '.oppppppo.', 'opppppppPo', '.oooooooo.'],
    shard: ['....o...', '...olo..', '..ollLo.', '.ollwLLo', '.olwlLLo', '..olLLo.', '...oLo..', '....o...'],
    heart: ['.oo..oo.', 'olwLolLo', 'owlllLLo', 'olllLLLo', '.olllLo.', '..olLo..', '...oo...']
  };
  function itemSprite(def) {
    var look = def && def.look;
    return cached('item:' + (def && def.__id) + ':' + look, function () {
      var rows = ITEM_ART[look] || ITEM_ART.coins, P = Pix(12, 10), col = (def && def.color) || '#e8364a';
      var key = { o: OL, k: '#c8a070', K: '#8a6040', g: '#a8c4d8', w: '#ffffff', l: col, L: shade(col, 0.62), y: '#ffe070', Y: '#d8a030', p: '#f0e2c0', P: '#c8b088', q: '#8a6a4a' };
      if (look === 'shard' || look === 'heart') key.w = mix(col, '#ffffff', 0.75);
      P.rows(rows, key, Math.floor((12 - rows[0].length) / 2), 10 - rows.length);
      if (look === 'potion') P.outline(OL);
      return P.canvas();
    });
  }
  var CHEST = {
    closed: ['..oooooooooo..', '.oNNNNNNNNNNo.', 'oNnnnnnnnnnnBo', 'onnnnnnnnnnnBo', 'oyyyyyyyyyyyYo', 'oBbbbbyYbbbbBo', 'obbbbbYYbbbbBo', 'obbbbbbbbbbbBo', 'oyyyyyyyyyyyYo', 'oBbbbbbbbbbbBo', '.oooooooooooo.'],
    open: ['..oooooooooo..', '.oDDDDDDDDDDo.', 'oDNNNNNNNNNNDo', 'oNwwuwuuwuwwNo', 'oyyyyyyyyyyyYo', 'oBbbbbbbbbbbBo', 'obbbbbbbbbbbBo', 'obbbbbbbbbbbBo', 'oyyyyyyyyyyyYo', 'oBbbbbbbbbbbBo', '.oooooooooooo.']
  };
  function chestSprite(open) {
    return cached('chest:' + open, function () {
      var P = Pix(14, 11); P.rows(CHEST[open ? 'open' : 'closed'], { o: OL, N: '#c88a4c', n: '#a06a38', b: '#7a4a28', B: '#4e2e1a', y: '#e8c060', Y: '#a87a28', D: '#2a1810', w: '#fff4b0', u: '#ffd060' }); return P.canvas();
    });
  }

  /* ---------- floor and wall tiles (baked once per floor into one ground canvas) ---------- */
  var FLOOR_STYLES = {
    flag: { base: '#3d3548', light: '#4b4258', dark: '#2f2839', gap: '#211b29' },
    tile: { base: '#373c50', light: '#454b62', dark: '#2b2f40', gap: '#1d2030' },
    brick: { base: '#46383a', light: '#564547', dark: '#372b2d', gap: '#241b1e' },
    moss: { base: '#34403a', light: '#41503f', dark: '#28322d', gap: '#1a221e' },
    path: { base: '#322b3a', light: '#3d3546', dark: '#272130', gap: '#1b1622' },
    throne: { base: '#3a2c48', light: '#4a3a5c', dark: '#2c2038', gap: '#1c1426' }
  };
  var WC = { top: '#2a2236', topHi: '#3c3250', rim: '#5a4c70', rimHi: '#7a6a90', mortar: '#211a2a', brick: ['#4a3f58', '#54485f', '#5e526a', '#463b52'], brickHi: '#71658a', brickLo: '#352c40', base: '#1a1422' };
  function floorStyle(map, x, y, lib) {
    var r = map.room[y * map.w + x];
    if (r < 0) return FLOOR_STYLES.path;
    var room = map.rooms[r], def = lib.rooms[room.type] || {};
    if (room.type === 'throne') return FLOOR_STYLES.throne;
    var f = def.floor; if (f && typeof f === 'object') return f;
    return FLOOR_STYLES[f] || FLOOR_STYLES.flag;
  }
  function paintFloor(g, map, x, y, lib) {
    var st = floorStyle(map, x, y, lib), X = x * T, Y = y * T, sd = map.seed + map.floor * 13;
    var corridor = map.room[y * map.w + x] < 0, roomDef = corridor ? null : lib.rooms[map.rooms[map.room[y * map.w + x]].type];
    var styleKey = corridor ? 'path' : roomDef && typeof roomDef.floor === 'string' ? roomDef.floor : 'flag';
    g.fillStyle = st.gap; g.fillRect(X, Y, T, T);
    if (styleKey === 'tile' || map.rooms[map.room[y * map.w + x]] && map.rooms[map.room[y * map.w + x]].type === 'throne') {
      for (var j = 0; j < 2; j++) for (var i = 0; i < 2; i++) {
        var v = hash(x * 2 + i, y * 2 + j, sd), c = v < 0.25 ? st.dark : v > 0.85 ? st.light : st.base;
        g.fillStyle = c; g.fillRect(X + i * 8 + 1, Y + j * 8 + 1, 7, 7);
        g.fillStyle = st.light; g.fillRect(X + i * 8 + 1, Y + j * 8 + 1, 7, 1); g.fillRect(X + i * 8 + 1, Y + j * 8 + 1, 1, 7);
        g.fillStyle = st.dark; g.fillRect(X + i * 8 + 2, Y + j * 8 + 7, 6, 1);
      }
    } else if (styleKey === 'brick') {
      for (var row = 0; row < 4; row++) {
        var off = (row + y) % 2 ? 4 : 0;
        for (var b = -1; b < 2; b++) {
          var bx = X + b * 8 + off, v2 = hash(x * 3 + b, y * 4 + row, sd);
          var c2 = v2 < 0.3 ? st.dark : v2 > 0.8 ? st.light : st.base;
          var x0 = Math.max(X, bx + 1), x1 = Math.min(X + T, bx + 8); if (x1 <= x0) continue;
          g.fillStyle = c2; g.fillRect(x0, Y + row * 4 + 1, x1 - x0, 3);
          g.fillStyle = st.light; g.fillRect(x0, Y + row * 4 + 1, x1 - x0, 1);
        }
      }
    } else {
      // flagstones: four irregular stones per cell (split lines jittered per cell)
      var sx = 5 + Math.floor(hash(x, y, sd + 1) * 6), sy = 5 + Math.floor(hash(x, y, sd + 2) * 6);
      var rects = [[0, 0, sx, sy], [sx, 0, T - sx, sy], [0, sy, sx, T - sy], [sx, sy, T - sx, T - sy]];
      if (hash(x, y, sd + 3) < 0.3) rects = [[0, 0, T, sy], [0, sy, sx, T - sy], [sx, sy, T - sx, T - sy]];
      rects.forEach(function (r, k) {
        var v3 = hash(x * 4 + k, y * 4 + k, sd + 4), c3 = v3 < 0.22 ? st.dark : v3 > 0.82 ? st.light : st.base;
        if (r[2] < 2 || r[3] < 2) return;
        g.fillStyle = c3; g.fillRect(X + r[0] + 1, Y + r[1] + 1, r[2] - 1, r[3] - 1);
        g.fillStyle = mix(c3, '#ffffff', 0.08); g.fillRect(X + r[0] + 1, Y + r[1] + 1, r[2] - 1, 1); g.fillRect(X + r[0] + 1, Y + r[1] + 1, 1, r[3] - 1);
        g.fillStyle = mix(c3, '#000000', 0.18); g.fillRect(X + r[0] + 2, Y + r[1] + r[3] - 1, r[2] - 2, 1);
      });
      // speckle and a crack now and then
      for (var q = 0; q < 3; q++) { var hx = Math.floor(hash(x, y, sd + 10 + q) * 14) + 1, hy = Math.floor(hash(x, y, sd + 20 + q) * 14) + 1; g.fillStyle = q ? st.dark : st.light; g.fillRect(X + hx, Y + hy, 1, 1); }
      if (hash(x, y, sd + 30) < 0.12) { g.fillStyle = st.gap; var cx = X + 3 + Math.floor(hash(x, y, sd + 31) * 9), cy = Y + 3 + Math.floor(hash(x, y, sd + 32) * 9); g.fillRect(cx, cy, 1, 1); g.fillRect(cx + 1, cy + 1, 1, 1); g.fillRect(cx + 1, cy + 2, 1, 1); g.fillRect(cx + 2, cy + 3, 1, 1); }
      if (styleKey === 'moss') { for (var q2 = 0; q2 < 4; q2++) if (hash(x, y, sd + 40 + q2) < 0.55) { g.fillStyle = q2 % 2 ? '#4a6a3a' : '#5a7e44'; g.fillRect(X + Math.floor(hash(x, y, sd + 50 + q2) * 13) + 1, Y + Math.floor(hash(x, y, sd + 60 + q2) * 13) + 1, 2, 1); } }
    }
    // edge shading (floor autotile): shadows cast by walls to the north, west and east, and inner corners
    var wN = isWallish(map, x, y - 1), wW = isWallish(map, x - 1, y), wE = isWallish(map, x + 1, y), wNW = isWallish(map, x - 1, y - 1), wNE = isWallish(map, x + 1, y - 1);
    g.fillStyle = 'rgba(8,4,16,0.55)';
    if (wN) { g.fillRect(X, Y, T, 3); g.fillStyle = 'rgba(8,4,16,0.28)'; g.fillRect(X, Y + 3, T, 2); g.fillStyle = 'rgba(8,4,16,0.55)'; }
    if (wW) g.fillRect(X, Y + (wN ? 3 : 0), 2, T - (wN ? 3 : 0));
    if (wE) { g.fillStyle = 'rgba(8,4,16,0.35)'; g.fillRect(X + T - 1, Y + (wN ? 3 : 0), 1, T - (wN ? 3 : 0)); }
    g.fillStyle = 'rgba(8,4,16,0.5)';
    if (!wN && !wW && wNW) g.fillRect(X, Y, 2, 2);
    if (!wN && !wE && wNE) g.fillRect(X + T - 2, Y, 2, 2);
  }
  function tileAt(map, x, y) { return x < 0 || y < 0 || x >= map.w || y >= map.h ? ROCK : map.tiles[y * map.w + x]; }
  function isWallish(map, x, y) { var t = tileAt(map, x, y); return t === WALL || t === ROCK; }
  function isOpenT(map, x, y) { var t = tileAt(map, x, y); return t === FLOOR || t === DOOR || t === STAIRS; }
  // wall piece for autotiling: face (floor or door below) or top, plus which sides meet open floor
  function wallPiece(map, x, y) {
    var below = tileAt(map, x, y + 1);
    return { face: below === FLOOR || below === STAIRS || below === DOOR, n: isOpenT(map, x, y - 1), e: isOpenT(map, x + 1, y), w: isOpenT(map, x - 1, y), s: isOpenT(map, x, y + 1),
      ne: isOpenT(map, x + 1, y - 1), nw: isOpenT(map, x - 1, y - 1), se: isOpenT(map, x + 1, y + 1), sw: isOpenT(map, x - 1, y + 1),
      faceW: tileAt(map, x - 1, y) === WALL && isOpenT(map, x - 1, y + 1), faceE: tileAt(map, x + 1, y) === WALL && isOpenT(map, x + 1, y + 1) };
  }
  function paintWall(g, map, x, y) {
    var X = x * T, Y = y * T, p = wallPiece(map, x, y), sd = map.seed + 77;
    // top surface (the wall's cap seen from above); a face tile keeps its top 4 px as the cap
    var capH = p.face ? 4 : T;
    g.fillStyle = WC.top; g.fillRect(X, Y, T, capH);
    // the cap is laid in large dark slabs: joints every 8 px (offset per row), a faint lit edge under each joint
    for (var yy = 0; yy < capH; yy++) {
      var wy = Y + yy;
      if (wy % 8 === 0) { g.fillStyle = '#1f1828'; g.fillRect(X, wy, T, 1); continue; }
      if (wy % 8 === 1) { g.fillStyle = '#30283f'; g.fillRect(X, wy, T, 1); }
      var off = Math.floor(wy / 8) % 2 ? 4 : 0;
      for (var xx = 0; xx < T; xx++) if ((X + xx + off) % 12 === 0) { g.fillStyle = '#1f1828'; g.fillRect(X + xx, wy, 1, 1); }
    }
    for (var q = 0; q < 4; q++) { var hx = Math.floor(hash(x, y, sd + q) * 15), hy = Math.floor(hash(x, y, sd + 9 + q) * Math.max(1, capH - 1)); g.fillStyle = q % 2 ? WC.topHi : '#1f1828'; g.fillRect(X + hx, Y + hy, 1, 1); }
    // rims where the cap meets open floor (outer edges), with corner pixels trimmed (outer corners) and notches (inner corners)
    g.fillStyle = WC.rim;
    if (p.n) { g.fillRect(X, Y, T, 2); g.fillStyle = WC.rimHi; g.fillRect(X, Y, T, 1); g.fillStyle = WC.rim; }
    if (p.w) { g.fillRect(X, Y, 2, capH); g.fillStyle = WC.rimHi; g.fillRect(X, Y, 1, capH); g.fillStyle = WC.rim; }
    if (p.e) { g.fillStyle = '#3e3352'; g.fillRect(X + T - 2, Y, 2, capH); g.fillStyle = WC.rim; }
    if (!p.face && p.s) { g.fillStyle = '#3e3352'; g.fillRect(X, Y + T - 2, T, 2); }
    if (!p.n && !p.w && p.nw) { g.fillStyle = WC.rimHi; g.fillRect(X, Y, 2, 1); g.fillRect(X, Y, 1, 2); }
    if (!p.n && !p.e && p.ne) { g.fillStyle = WC.rim; g.fillRect(X + T - 2, Y, 2, 1); g.fillRect(X + T - 1, Y, 1, 2); }
    if (!p.face && !p.s && !p.w && p.sw) { g.fillStyle = '#3e3352'; g.fillRect(X, Y + T - 1, 2, 1); }
    if (!p.face && !p.s && !p.e && p.se) { g.fillStyle = '#3e3352'; g.fillRect(X + T - 2, Y + T - 1, 2, 1); }
    g.fillStyle = OL;
    if (p.n && p.w) g.fillRect(X, Y, 1, 1);
    if (p.n && p.e) g.fillRect(X + T - 1, Y, 1, 1);
    if (!p.face) return;
    // the face: brick courses with offset joints, light on the upper edge of each brick, a dark base where it meets the floor
    var FY = Y + capH;
    g.fillStyle = WC.rimHi; g.fillRect(X, FY - 1, T, 1);
    g.fillStyle = WC.mortar; g.fillRect(X, FY, T, T - capH);
    for (var row = 0; row < 3; row++) {
      var off = (row + x) % 2 ? 4 : 0, by = FY + row * 4;
      for (var b = -1; b < 2; b++) {
        var bx = X + b * 8 + off, x0 = Math.max(X, bx + 1), x1 = Math.min(X + T, bx + 8); if (x1 <= x0) continue;
        var v = hash(x * 3 + b, y * 3 + row, sd + 5), c = WC.brick[Math.floor(v * 4)];
        g.fillStyle = c; g.fillRect(x0, by + 1, x1 - x0, 3);
        g.fillStyle = mix(c, WC.brickHi, 0.55); g.fillRect(x0, by + 1, x1 - x0, 1);
        g.fillStyle = WC.brickLo; g.fillRect(x0, by + 3, x1 - x0, 1);
        if (v > 0.9) { g.fillStyle = WC.mortar; g.fillRect(x0 + 2, by + 2, 1, 1); g.fillRect(x0 + 3, by + 3, 1, 1); }
      }
    }
    // face ends: a lit left edge and a shaded right edge where the face turns a corner
    if (!p.faceW) { g.fillStyle = 'rgba(160,140,190,0.35)'; g.fillRect(X, FY, 1, T - capH); }
    if (!p.faceE) { g.fillStyle = 'rgba(6,2,12,0.45)'; g.fillRect(X + T - 2, FY, 2, T - capH); }
    g.fillStyle = WC.base; g.fillRect(X, Y + T - 1, T, 1);
    // moss or a drip stain at the foot now and then
    var hv = hash(x, y, sd + 40);
    if (hv < 0.18) { g.fillStyle = '#3c5a34'; g.fillRect(X + 2 + Math.floor(hv * 40) % 10, Y + T - 3, 3, 2); g.fillStyle = '#56783e'; g.fillRect(X + 3 + Math.floor(hv * 40) % 10, Y + T - 3, 1, 1); }
    else if (hv > 0.9) { g.fillStyle = 'rgba(20,14,30,0.5)'; g.fillRect(X + 5 + Math.floor(hv * 70) % 7, FY + 2, 1, 8); }
  }
  function paintStairs(g, x, y) {
    var X = x * T, Y = y * T;
    g.fillStyle = '#0a0612'; g.fillRect(X + 1, Y + 1, 14, 14);
    var steps = ['#6a5e7e', '#544a66', '#3e364e', '#2a2438', '#1a1626'];
    for (var i = 0; i < 5; i++) { g.fillStyle = steps[i]; g.fillRect(X + 2 + i, Y + 2 + i * 2.6 | 0, 12 - i, 2); g.fillStyle = mix(steps[i], '#ffffff', 0.18); g.fillRect(X + 2 + i, (Y + 2 + i * 2.6) | 0, 12 - i, 1); }
    g.fillStyle = '#7a6c92'; g.fillRect(X, Y, T, 1); g.fillRect(X, Y, 1, T);
    g.fillStyle = '#241c30'; g.fillRect(X + T - 1, Y, 1, T); g.fillRect(X, Y + T - 1, T, 1);
  }
  // decor kinds (each fits inside its 16 px cell); v = 0..1 variation; t = ms (animated kinds)
  var DECOR = {
    rubble: function (g, X, Y, v) { var pts = [[3, 10, 3], [8, 12, 2], [11, 8, 2], [6, 6, 1], [12, 13, 1]]; pts.forEach(function (p, i) { if (i > 2 + v * 3) return; g.fillStyle = '#1e1828'; g.fillRect(X + p[0], Y + p[1] + 1, p[2] + 1, 1); g.fillStyle = '#5e5470'; g.fillRect(X + p[0], Y + p[1], p[2], p[2] > 1 ? 2 : 1); g.fillStyle = '#7e7290'; g.fillRect(X + p[0], Y + p[1], 1, 1); }); },
    bones: function (g, X, Y, v) {
      var B = '#e6dcc4', b = '#b0a488', o = '#3a3040', fx = v < 0.5 ? 0 : 1;
      g.fillStyle = o; g.fillRect(X + 3, Y + 10, 9, 3); g.fillStyle = B; g.fillRect(X + 4, Y + 11, 7, 1); g.fillRect(X + 3, Y + 10, 2, 1); g.fillRect(X + 3, Y + 12, 2, 1); g.fillRect(X + 10, Y + 10, 2, 1); g.fillRect(X + 10, Y + 12, 2, 1);
      if (v > 0.35) { var sx = X + 7 + fx * 2, sy = Y + 3; g.fillStyle = o; g.fillRect(sx - 1, sy - 1, 7, 7); g.fillStyle = B; g.fillRect(sx, sy, 5, 4); g.fillRect(sx + 1, sy + 4, 3, 1); g.fillStyle = b; g.fillRect(sx + 3, sy + 1, 2, 3); g.fillStyle = '#1a1220'; g.fillRect(sx + 1, sy + 2, 1, 1); g.fillRect(sx + 3, sy + 2, 1, 1); }
    },
    moss: function (g, X, Y, v) { var cols = ['#2e4a2a', '#3e6234', '#548042', '#6e9a4e']; for (var i = 0; i < 9; i++) { var px = 2 + Math.floor(hash(i, v * 1000, 5) * 11), py = 4 + Math.floor(hash(i, v * 1000, 6) * 10); g.fillStyle = cols[i % 4]; g.fillRect(X + px, Y + py, 2 + (i % 2), 1); } },
    puddle: function (g, X, Y, v, t) { g.fillStyle = '#1c2a3e'; g.fillRect(X + 3, Y + 6, 10, 5); g.fillRect(X + 2, Y + 7, 12, 3); g.fillStyle = '#2c4a66'; g.fillRect(X + 4, Y + 7, 8, 3); g.fillStyle = '#5a8ab0'; var sh = Math.floor((t || 0) / 400 + v * 7) % 4; g.fillRect(X + 4 + sh, Y + 7, 3, 1); g.fillStyle = '#a8d0f0'; g.fillRect(X + 5 + sh, Y + 7, 1, 1); },
    cobweb: function (g, X, Y, v, t, dc) {
      var L = dc && dc.corner === 'r'; g.fillStyle = 'rgba(220,214,236,0.55)';
      for (var i = 0; i < 9; i++) { g.fillRect(L ? X + 15 - i : X + i, Y + i * 0, 1, 1); g.fillRect(L ? X + 15 : X, Y + i, 1, 1); g.fillRect(L ? X + 15 - Math.floor(i * 0.7) : X + Math.floor(i * 0.7), Y + Math.floor(i * 0.7), 1, 1); }
      g.fillStyle = 'rgba(220,214,236,0.35)'; for (var j = 0; j < 6; j++) { g.fillRect(L ? X + 15 - j : X + j, Y + 4, 1, 1); g.fillRect(L ? X + 11 : X + 4, Y + j, 1, 1); }
    },
    urn: function (g, X, Y, v) {
      var P = cached('urn' + (v > 0.5 ? 1 : 0), function () { var Q = Pix(10, 13); var R = v > 0.5 ? ['#5a2a1a', '#8a4a2a', '#b8703e', '#e8a868'] : ['#2a3a4a', '#3e5a6e', '#5e8098', '#a8c8d8']; blob(Q, 5, 7.5, 4.2, 4.5, R, { spec: true }); Q.rect(3, 1, 4, 3, R[1]); Q.rect(3, 1, 1, 3, R[2]); Q.rect(2, 1, 6, 1, R[2]); Q.rect(2, 7, 6, 1, R[0]); Q.outline(OL); return Q.canvas(); });
      g.fillStyle = 'rgba(8,4,16,0.45)'; g.fillRect(X + 4, Y + 14, 9, 1); if (P) g.drawImage(P, X + 3, Y + 2);
    },
    crate: function (g, X, Y, v) {
      var P = cached('crate', function () { var Q = Pix(14, 14); Q.rect(1, 1, 12, 4, '#b07a44'); Q.rect(1, 1, 12, 1, '#d0a060'); Q.rect(1, 5, 12, 8, '#8a5a30'); Q.rect(1, 5, 12, 1, '#a06a38'); Q.rect(1, 12, 12, 1, '#5a3a20');
        Q.rect(2, 6, 1, 6, '#5a3a20'); Q.rect(11, 6, 1, 6, '#5a3a20'); for (var i = 0; i < 8; i++) Q.set(3 + i, 11 - i * 0.7, '#6a4426'); Q.rect(3, 2, 8, 1, '#8a5a30'); Q.outline(OL); return Q.canvas(); });
      g.fillStyle = 'rgba(8,4,16,0.45)'; g.fillRect(X + 2, Y + 14, 13, 2); if (P) g.drawImage(P, X + 1, Y + 1);
    },
    barrel: function (g, X, Y, v) {
      var P = cached('barrel', function () { var Q = Pix(12, 14); blob(Q, 6, 8, 5, 5.5, ['#5a3418', '#8a5428', '#b07438', '#d89a58']); Q.rect(1, 4, 10, 1, '#4a4a58'); Q.rect(1, 11, 10, 1, '#4a4a58'); Q.rect(2, 4, 3, 1, '#8a8aa0');
        for (var x = 2; x < 10; x++) { Q.set(x, 2, '#c08a4a'); Q.set(x, 3, '#7a4a24'); } Q.set(3, 2, '#e0b070'); Q.outline(OL); return Q.canvas(); });
      g.fillStyle = 'rgba(8,4,16,0.45)'; g.fillRect(X + 3, Y + 14, 11, 2); if (P) g.drawImage(P, X + 2, Y + 1);
    },
    candles: function (g, X, Y, v, t) {
      var c = [[4, 9, 5], [8, 7, 7], [11, 10, 4]];
      c.forEach(function (q, i) {
        var bx = X + q[0], by = Y + q[1]; g.fillStyle = '#3a2e30'; g.fillRect(bx - 1, by + q[2], 4, 1);
        g.fillStyle = '#e8dcc0'; g.fillRect(bx, by, 2, q[2]); g.fillStyle = '#b8a888'; g.fillRect(bx + 1, by + 1, 1, q[2] - 1);
        var fl = Math.floor(((t || 0) / 110 + i * 3 + v * 10)) % 3;
        g.fillStyle = '#ff9a3a'; g.fillRect(bx, by - 2, 2, 2); g.fillStyle = '#ffe080'; g.fillRect(bx + (fl === 1 ? 1 : 0), by - 3 - (fl === 2 ? 1 : 0), 1, 2);
      });
    },
    shrooms: function (g, X, Y, v, t) {
      var gl = 0.55 + 0.25 * Math.sin((t || 0) / 500 + v * 6);
      [[4, 10, 3], [9, 7, 4], [11, 12, 2]].forEach(function (q) {
        g.fillStyle = '#c8d8b0'; g.fillRect(X + q[0], Y + q[1], 1, q[2] + 1);
        g.fillStyle = 'rgba(120,255,200,' + (gl * 0.35) + ')'; g.fillRect(X + q[0] - 2, Y + q[1] - 3, 5, 4);
        g.fillStyle = '#4ae0b0'; g.fillRect(X + q[0] - 1, Y + q[1] - 1, 3, 1); g.fillStyle = '#9affe0'; g.fillRect(X + q[0], Y + q[1] - 2, 1, 1);
      });
    }
  };
  var ANIM_DECOR = { candles: 1, puddle: 1, shrooms: 1 };
  function drawDecor(g, dc, X, Y, t) {
    var f = typeof dc.kind === 'function' ? dc.kind : DECOR[dc.kind];
    if (typeof f === 'function') { try { f(g, X, Y, dc.v, t, dc); } catch (e) { warn('decor', e); } }
  }
  function bakeGround(map, lib) {
    var c = mkCanvas(map.w * T, map.h * T); if (!c) return null;
    var g = c.getContext('2d'); g.fillStyle = VOID; g.fillRect(0, 0, c.width, c.height);
    for (var y = 0; y < map.h; y++) for (var x = 0; x < map.w; x++) {
      var t = map.tiles[y * map.w + x];
      if (t === FLOOR || t === DOOR) paintFloor(g, map, x, y, lib);
      else if (t === STAIRS) { paintFloor(g, map, x, y, lib); paintStairs(g, x, y); }
      else if (t === WALL) paintWall(g, map, x, y);
    }
    map.decor.forEach(function (dc) { if (typeof dc.kind === 'string' && ANIM_DECOR[dc.kind]) return; drawDecor(g, dc, dc.x * T, dc.y * T, 0); });
    // a rug in front of the throne
    map.rooms.forEach(function (r) {
      if (r.type !== 'throne') return;
      var x0 = Math.round(r.cx) * T - 8, y0 = (r.y + 2) * T, h = (r.h - 2) * T - 4;
      g.fillStyle = '#3a0e1c'; g.fillRect(x0 + 2, y0, 28, h); g.fillStyle = '#7a1e30'; g.fillRect(x0 + 4, y0, 24, h); g.fillStyle = '#d8a030'; g.fillRect(x0 + 5, y0, 1, h); g.fillRect(x0 + 26, y0, 1, h);
      for (var yy = y0 + 6; yy < y0 + h - 4; yy += 10) { g.fillStyle = '#a83448'; g.fillRect(x0 + 13, yy, 6, 2); g.fillRect(x0 + 15, yy - 2, 2, 6); }
    });
    return c;
  }
  // doors: a face door (in a wall whose neighbours show faces) or a top-view door slab; open doors swing to the jamb
  function drawDoor(g, map, d, X, Y, t) {
    if (!d.door) return;
    var faceRow = d.axis === 'h' && wallPiece(map, d.x - 1, d.y).face;
    if (faceRow) {
      g.fillStyle = WC.top; g.fillRect(X, Y, T, 4); g.fillStyle = WC.rimHi; g.fillRect(X, Y + 3, T, 1);
      g.fillStyle = '#2a1e1a'; g.fillRect(X + 1, Y + 4, 14, 12);
      if (d.open) {
        g.fillStyle = '#0c0812'; g.fillRect(X + 3, Y + 5, 10, 11);
        g.fillStyle = '#7a4a28'; g.fillRect(X + 2, Y + 5, 2, 11); g.fillStyle = '#a06a38'; g.fillRect(X + 2, Y + 5, 1, 11);
      } else {
        g.fillStyle = '#8a5a30'; g.fillRect(X + 3, Y + 5, 10, 11);
        g.fillStyle = '#a87240'; for (var i = 0; i < 3; i++) g.fillRect(X + 3 + i * 4, Y + 5, 1, 11);
        g.fillStyle = '#5a3a20'; for (var j = 0; j < 3; j++) g.fillRect(X + 6 + j * 4, Y + 5, 1, 11);
        g.fillStyle = '#4a4a5a'; g.fillRect(X + 3, Y + 7, 10, 1); g.fillRect(X + 3, Y + 13, 10, 1); g.fillStyle = '#8a8aa0'; g.fillRect(X + 3, Y + 7, 3, 1);
        g.fillStyle = '#e8c060'; g.fillRect(X + 10, Y + 10, 2, 2);
      }
      g.fillStyle = '#5a4c70'; g.fillRect(X + 1, Y + 4, 2, 12); g.fillRect(X + 13, Y + 4, 2, 12); g.fillStyle = '#7a6a90'; g.fillRect(X + 1, Y + 4, 1, 12);
      return;
    }
    // top view: the door is a plank slab across the opening (h: horizontal slab, v: vertical slab)
    var horiz = d.axis === 'h';
    g.fillStyle = 'rgba(8,4,16,0.5)';
    if (d.open) {
      // open: the leaf is swung flat into the wall; only a worn wooden sill and the iron hinge pins show
      if (horiz) { g.fillStyle = '#3a2416'; g.fillRect(X, Y + 7, T, 3); g.fillStyle = '#6a4426'; g.fillRect(X, Y + 7, T, 1); g.fillStyle = '#8a8aa0'; g.fillRect(X, Y + 6, 2, 1); g.fillRect(X, Y + 10, 2, 1); }
      else { g.fillStyle = '#3a2416'; g.fillRect(X + 7, Y, 3, T); g.fillStyle = '#6a4426'; g.fillRect(X + 7, Y, 1, T); g.fillStyle = '#8a8aa0'; g.fillRect(X + 6, Y, 1, 2); g.fillRect(X + 10, Y, 1, 2); }
      return;
    }
    if (horiz) { g.fillRect(X, Y + 9, T, 3); g.fillStyle = '#5a3a20'; g.fillRect(X, Y + 5, T, 5); g.fillStyle = '#9a6634'; g.fillRect(X, Y + 5, T, 3); g.fillStyle = '#c08a4a'; g.fillRect(X, Y + 5, T, 1); g.fillStyle = '#4a4a5a'; g.fillRect(X + 3, Y + 5, 1, 5); g.fillRect(X + 12, Y + 5, 1, 5); g.fillStyle = OL; g.fillRect(X, Y + 4, T, 1); g.fillRect(X, Y + 10, T, 1); }
    else { g.fillRect(X + 9, Y + 1, 3, T); g.fillStyle = '#5a3a20'; g.fillRect(X + 5, Y, 5, T); g.fillStyle = '#9a6634'; g.fillRect(X + 5, Y, 3, T); g.fillStyle = '#c08a4a'; g.fillRect(X + 5, Y, 1, T); g.fillStyle = '#4a4a5a'; g.fillRect(X + 5, Y + 3, 5, 1); g.fillRect(X + 5, Y + 12, 5, 1); g.fillStyle = OL; g.fillRect(X + 4, Y, 1, T); g.fillRect(X + 10, Y, 1, T); }
  }
  function drawTorch(g, X, Y, t, seed) {
    // iron sconce on the wall face and a 3-frame flame
    var fl = Math.floor(t / 90 + seed * 7) % 3;
    g.fillStyle = OL; g.fillRect(X + 6, Y + 8, 4, 5); g.fillStyle = '#5a5a6a'; g.fillRect(X + 7, Y + 9, 2, 3); g.fillStyle = '#8a8aa0'; g.fillRect(X + 7, Y + 9, 1, 1);
    g.fillStyle = '#3a2416'; g.fillRect(X + 7, Y + 6, 2, 3);
    var F = [['.oo.', 'oyyo', 'oyYo', '.oo.'], ['..o.', '.oyo', 'oyYo', '.oo.'], ['.o..', 'oyo.', 'oYyo', '.oo.']][fl];
    var K = { o: '#ff7a2a', y: '#ffd060', Y: '#fff8d0' };
    F.forEach(function (r, j) { for (var i = 0; i < 4; i++) { var c = r.charAt(i); if (c !== '.') { g.fillStyle = K[c]; g.fillRect(X + 6 + i, Y + 2 + j, 1, 1); } } });
  }
  // the empty throne of the last floor: a high carved back, gold trim, a red cushion (blocks the cell)
  function drawThrone(g, X, Y) {
    var P = cached('throne', function () {
      var Q = Pix(16, 26), st = ['#2a2038', '#4a3a62', '#6a5a88', '#9a8ab8'], au = ['#7a4a10', '#d8a030', '#ffe070'];
      Q.rect(3, 2, 10, 15, st[1]); Q.rect(3, 2, 2, 15, st[2]); Q.rect(11, 2, 2, 15, st[0]);
      Q.rect(5, 0, 6, 3, st[2]); Q.set(7, 0, au[2]); Q.set(8, 0, au[1]); Q.rect(6, 4, 4, 10, '#3a1a34'); Q.rect(6, 4, 1, 10, '#5a2a4a');
      Q.rect(1, 14, 14, 4, st[1]); Q.rect(1, 14, 14, 1, st[3]); Q.rect(2, 18, 12, 6, st[1]); Q.rect(2, 18, 2, 6, st[2]); Q.rect(12, 18, 2, 6, st[0]);
      Q.rect(4, 15, 8, 3, '#a82a3a'); Q.rect(4, 15, 8, 1, '#e05060'); Q.rect(1, 14, 14, 1, au[1]); Q.set(1, 14, au[2]); Q.set(3, 3, au[1]); Q.set(12, 3, au[0]);
      Q.rect(2, 24, 12, 1, st[0]); Q.outline(OL); return Q.canvas();
    });
    g.fillStyle = 'rgba(8,4,16,0.5)'; g.fillRect(X + 1, Y + 14, 15, 2);
    if (P) g.drawImage(P, X, Y - 10);
  }
  function drawFountain(g, X, Y, t, used) {
    var P = cached('fountain', function () { var Q = Pix(16, 16); blob(Q, 8, 9, 7, 5.5, ['#3a3448', '#5a5270', '#7e7698', '#b8b0d0']); for (var y = 6; y < 13; y++) for (var x = 3; x < 14; x++) if ((x - 8) * (x - 8) / 22 + (y - 9) * (y - 9) / 10 < 1) Q.clear(x, y); Q.outline(OL); for (var y2 = 6; y2 < 13; y2++) for (var x2 = 3; x2 < 14; x2++) { var e2 = (x2 - 8) * (x2 - 8) / 22 + (y2 - 9) * (y2 - 9) / 10; if (e2 < 1 && e2 > 0.62 && y2 < 9) Q.set(x2, y2, '#2a2438'); } return Q.canvas(); });
    g.fillStyle = 'rgba(8,4,16,0.5)'; g.fillRect(X + 2, Y + 14, 13, 2);
    g.fillStyle = used ? '#1c3a58' : '#2a6aa8'; g.fillRect(X + 4, Y + 7, 9, 5); g.fillRect(X + 3, Y + 8, 11, 3);
    if (used) { var s0 = Math.floor(t / 600) % 4; g.fillStyle = '#3a6a90'; g.fillRect(X + 5 + s0, Y + 9, 2, 1); }
    if (!used) { var s = Math.floor(t / 200) % 3; g.fillStyle = '#7ac8ff'; g.fillRect(X + 5 + s * 2, Y + 8, 2, 1); g.fillStyle = '#d8f4ff'; g.fillRect(X + 9 - s, Y + 10, 1, 1); g.fillStyle = '#a8e8ff'; g.fillRect(X + 8, Y + 4 + (Math.floor(t / 120) % 3), 1, 1); }
    if (P) g.drawImage(P, X, Y);
    g.fillStyle = '#6a6286'; g.fillRect(X + 7, Y + 3, 2, 5); g.fillStyle = '#9a92b8'; g.fillRect(X + 7, Y + 3, 1, 5);
  }

  // the hero's sword: held ready at the side, raised on the wind-up, thrust toward the target on the strike (8 directions)
  function swordPose(h) {
    var side = h.face === 'left' ? -1 : 1, L2 = h.lunge;
    if (L2 && L2.attack) {
      var u = L2.t / L2.dur, l = Math.sqrt(L2.dx * L2.dx + L2.dy * L2.dy) || 1, dx = L2.dx / l, dy = L2.dy / l, sx = L2.dx ? (L2.dx > 0 ? 1 : -1) : side;
      if (u < 0.35) return { hx: sx * 4, hy: -12, dx: -sx * 0.45, dy: -1, len: 7, behind: false, swing: 1 };
      return { hx: Math.round(dx * 5) + (L2.dx ? 0 : 5), hy: -7 + Math.round(dy * 3), dx: dx, dy: dy, len: 9, behind: false, swing: 2 };
    }
    if (h.dir === 'up') return { hx: -3, hy: -9, dx: 0.7, dy: -0.7, len: 6, behind: true };
    if (h.dir === 'down') return { hx: 6, hy: -5, dx: 0, dy: -1, len: 7, behind: false };
    return { hx: side * 5, hy: -6, dx: side * 0.7, dy: -0.7, len: 7, behind: false };
  }
  function drawSword(g, x, y, s2) {
    var x0 = x + s2.hx, y0 = y + s2.hy, pts = [];
    var ax = Math.abs(s2.dx), ay = Math.abs(s2.dy), sx = ax < 0.3 ? 0 : s2.dx > 0 ? 1 : -1, sy = ay < 0.3 ? 0 : s2.dy > 0 ? 1 : -1;
    for (var i = 1; i <= s2.len; i++) pts.push([x0 + sx * i, y0 + sy * i]);
    g.fillStyle = OL; pts.forEach(function (p) { g.fillRect(p[0] - 1, p[1] - 1, 3, 3); }); g.fillRect(x0 - 2, y0 - 2, 5, 5);
    pts.forEach(function (p, i) { g.fillStyle = i === pts.length - 1 ? '#ffffff' : i % 2 ? '#c8d4e8' : '#eef4ff'; g.fillRect(p[0], p[1], 1, 1); });
    if (s2.swing === 2) { g.fillStyle = 'rgba(255,255,255,0.35)'; pts.forEach(function (p) { g.fillRect(p[0] - sy, p[1] + sx, 1, 1); }); }
    // cross-guard across the blade, a leather grip under it
    var gx = sy, gy = -sx; if (!gx && !gy) gx = 1;
    g.fillStyle = '#e8b840'; g.fillRect(x0 + gx, y0 + gy, 1, 1); g.fillRect(x0 - gx, y0 - gy, 1, 1); g.fillRect(x0, y0, 1, 1);
    g.fillStyle = '#6a4226'; g.fillRect(x0 - sx, y0 - sy, 1, 1);
  }

  /* =====================================================================================================
     The instance: create(options)
     ===================================================================================================== */
  var FLOOR_NAMES = ['The Upper Cellars', 'The Mossy Halls', 'The Drowned Crypts', 'The Ember Deep', 'The Hollow Throne', 'The Deep Roots', 'The Lightless Vault'];
  var KEYDIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], upleft: [-1, -1], upright: [1, -1], downleft: [-1, 1], downright: [1, 1] };
  function lib(base, extra) { var o = {}, k; for (k in base) o[k] = base[k]; for (k in (extra || {})) if (extra[k]) o[k] = extra[k]; for (k in o) o[k].__id = k; return o; }
  function create(opt) {
    opt = opt || {};
    var L = { rooms: lib(ROOMS, opt.rooms), monsters: lib(MONSTERS, opt.monsters), items: lib(ITEMS, opt.items) };
    var P = {}, k; for (k in DEFAULTS) P[k] = DEFAULTS[k]; for (k in (opt.params || {})) if (opt.params[k] != null && opt.params[k] !== '') P[k] = opt.params[k];
    var view = { x: 0, y: 0, w: 384, h: 216 }; setView(opt.view);
    var S = null, autoOn = !!opt.auto, held = { up: 0, down: 0, left: 0, right: 0 }, inputQ = [], hudRects = [], mapOpen = false;
    function setView(v) { if (!v) return; view.x = num(v.x, 0); view.y = num(v.y, 0); view.w = Math.max(64, num(v.w, 384)); view.h = Math.max(64, num(v.h, 216)); }
    function ev(o) { safe(opt.onEvent, [o], 'onEvent'); }
    function msg(text2, color) { if (!S) return; S.msgs.push({ text: text2, color: color || '#f4ead8', t: S.clock }); if (S.msgs.length > 12) S.msgs.shift(); }

    /* ---------- run and floor setup ---------- */
    function start(o) {
      o = o || {};
      var seed = (o.seed != null ? +o.seed : opt.seed != null ? +opt.seed : 1) >>> 0;
      S = { seed: seed, floor: 0, clock: 0, turn: 0, floorTurns: 0, kills: 0, phase: 'play', queue: [], fx: [], msgs: [], cam: { x: 0, y: 0, init: false },
        rng: rng(seed * 7 + 3), fxr: rng(seed * 13 + 5), banner: null, fade: null, ended: false, nextId: 1, think: 0, path: null, chestsOpened: 0, steps: 0, result: null,
        hero: { id: 'hero', x: 0, y: 0, px: 0, py: 0, hp: num(P.heroHp, 30), maxHp: num(P.heroHp, 30), atk: num(P.heroAtk, 5), def: num(P.heroDef, 1), lvl: 1, xp: 0,
          gold: 0, potions: num(P.potions, 1), dir: 'down', face: 'right', walk: 0, anim: null, flash: 0, lunge: null, dead: 0, target: null, vx: 0 } };
      enterFloor(Math.max(1, Math.min(num(o.floor, 1), num(P.floors, 5))));
      return inst;
    }
    function enterFloor(n) {
      S.floor = n; S.floorTurns = 0;
      var map = generate({ seed: S.seed, floor: n, floors: num(P.floors, 5), params: P, rooms: L.rooms, monsters: L.monsters, items: L.items });
      S.map = map; S.ground = null; S.minimap = null; S.mmDirty = true;
      S.chests = map.chests.map(function (c) { return { x: c.x, y: c.y, item: c.item, open: false }; });
      S.items = map.items.map(function (c) { return { x: c.x, y: c.y, item: c.item, taken: false }; });
      S.doors = map.doors.map(function (d) { return { x: d.x, y: d.y, axis: d.axis, door: d.door, open: d.open }; });
      S.features = map.features.map(function (f) { return { x: f.x, y: f.y, kind: f.kind, used: false }; });
      S.block = new Uint8Array(map.w * map.h); map.decor.forEach(function (dc) { if (dc.block) S.block[dc.y * map.w + dc.x] = 1; });
      S.mons = map.monsters.map(function (m) {
        var def = L.monsters[m.kind] || L.monsters.slime;
        return { id: 'm' + (S.nextId++), kind: m.kind, def: def, x: m.x, y: m.y, px: m.x * T + 8, py: m.y * T + 15, hp: num(def.hp, 8), maxHp: num(def.hp, 8), awake: false, energy: 0,
          face: S.rng() < 0.5 ? 'left' : 'right', anim: null, flash: 0, lunge: null, dying: 0, gone: false, boss: !!def.boss, room: m.room, phase: S.rng() * 4, target: null, vx: 0, seen: false };
      });
      S.explored = new Uint8Array(map.w * map.h); S.vis = new Uint8Array(map.w * map.h);
      S.torchLight = torchMap(map);
      var h = S.hero; h.x = map.start.x; h.y = map.start.y; h.px = h.x * T + 8; h.py = h.y * T + 15; h.anim = null; h.lunge = null; h.dir = 'down';
      S.queue = []; S.fx = []; S.path = null; S.cam.init = false;
      computeFov();
      S.banner = { title: 'FLOOR ' + n, sub: n >= num(P.floors, 5) ? 'The Hollow Throne' : (FLOOR_NAMES[n - 1] || 'The Deep'), t: 0 };
      msg(n === 1 ? 'You enter the dungeon. Find the stairs down.' : 'You descend to floor ' + n + '.', '#ffe6a0');
      ev({ kind: 'floorStart', floor: n, floors: num(P.floors, 5), seed: S.seed, rooms: map.rooms.map(function (r) { return r.type; }), monsters: S.mons.map(function (m) { return m.kind; }),
        items: S.chests.map(function (c) { return c.item; }).concat(S.items.map(function (c) { return c.item; })), start: { x: map.start.x, y: map.start.y }, stairs: map.stairs });
    }
    function torchMap(map) {
      var tl = new Float32Array(map.w * map.h);
      map.torches.forEach(function (tc) {
        var vis = new Uint8Array(map.w * map.h), oy = tc.y + 1;
        fov(map.w, map.h, tc.x, oy, 6, function (x, y) { var t = map.tiles[y * map.w + x]; return t === WALL || t === ROCK; }, vis);
        for (var y = Math.max(0, oy - 6); y <= Math.min(map.h - 1, oy + 6); y++) for (var x = Math.max(0, tc.x - 6); x <= Math.min(map.w - 1, tc.x + 6); x++) {
          if (!vis[y * map.w + x]) continue; var d = Math.sqrt((x - tc.x) * (x - tc.x) + (y - tc.y - 0.5) * (y - tc.y - 0.5)), v = clamp(1 - d / 5.5, 0, 1);
          tl[y * map.w + x] = Math.max(tl[y * map.w + x], v);
        }
      });
      return tl;
    }

    /* ---------- map queries ---------- */
    function M() { return S.map; }
    function tile(x, y) { var m = M(); return x < 0 || y < 0 || x >= m.w || y >= m.h ? ROCK : m.tiles[y * m.w + x]; }
    function doorAt(x, y) { for (var i = 0; i < S.doors.length; i++) if (S.doors[i].x === x && S.doors[i].y === y) return S.doors[i]; return null; }
    function chestAt(x, y) { for (var i = 0; i < S.chests.length; i++) if (S.chests[i].x === x && S.chests[i].y === y) return S.chests[i]; return null; }
    function featureAt(x, y) { for (var i = 0; i < S.features.length; i++) if (S.features[i].x === x && S.features[i].y === y) return S.features[i]; return null; }
    function monAt(x, y) { for (var i = 0; i < S.mons.length; i++) { var m = S.mons[i]; if (!m.dying && !m.gone && m.x === x && m.y === y) return m; } return null; }
    function closedDoor(x, y) { var d = tile(x, y) === DOOR ? doorAt(x, y) : null; return !!(d && d.door && !d.open); }
    function terrainPass(x, y) { var t = tile(x, y); return (t === FLOOR || t === STAIRS || t === DOOR) && !S.block[y * M().w + x]; }
    function opaque(x, y) { var t = tile(x, y); return t === WALL || t === ROCK || closedDoor(x, y); }
    // a diagonal step may not cut a wall corner, and never enters or leaves a doorway diagonally
    function cornerOk(x, y, dx, dy) {
      if (!dx || !dy) return true;
      if (tile(x, y) === DOOR || tile(x + dx, y + dy) === DOOR) return false;
      return terrainPass(x + dx, y) && terrainPass(x, y + dy) && !closedDoor(x + dx, y) && !closedDoor(x, y + dy);
    }
    function freeFor(x, y, who) {
      if (!terrainPass(x, y) || closedDoor(x, y) || chestAt(x, y) || featureAt(x, y)) return false;
      var m = monAt(x, y); if (m && m !== who) return false;
      if (who !== S.hero && S.hero.x === x && S.hero.y === y) return false;
      return true;
    }
    function adjacent(a, b) { var dx = b.x - a.x, dy = b.y - a.y; return Math.max(Math.abs(dx), Math.abs(dy)) === 1 && cornerOk(a.x, a.y, dx, dy); }

    /* ---------- sight ---------- */
    function computeFov() {
      var m = M(), h = S.hero, inF = new Uint8Array(m.w * m.h), R = num(P.light, 6.5);
      fov(m.w, m.h, h.x, h.y, 13, opaque, inF);
      S.vis.fill(0);
      var dyn = dynLights(true);
      for (var i = 0; i < inF.length; i++) {
        if (!inF[i]) continue;
        var x = i % m.w, y = (i / m.w) | 0, d = Math.sqrt((x - h.x) * (x - h.x) + (y - h.y) * (y - h.y));
        var lit = d <= R + 0.5 || S.torchLight[i] > 0.12 || dyn.some(function (l) { var dd = Math.sqrt((x - l.tx) * (x - l.tx) + (y - l.ty) * (y - l.ty)); return dd < l.r * 0.8; });
        if (P.fog === 'off') lit = true;
        if (lit) { S.vis[i] = 1; if (!S.explored[i]) { S.explored[i] = 1; S.mmDirty = true; } }
      }
      if (P.fog === 'off') for (i = 0; i < inF.length; i++) if (m.tiles[i] !== ROCK && !S.explored[i]) { S.explored[i] = 1; S.mmDirty = true; }
    }
    function visible(x, y) { var m = M(); return x >= 0 && y >= 0 && x < m.w && y < m.h && (S.vis[y * m.w + x] === 1 || P.fog === 'off'); }
    function dynLights(tiles) {
      var out = [];
      S.features.forEach(function (f) { if (f.kind === 'fountain' && !f.used) out.push({ tx: f.x, ty: f.y, r: 3.2, col: '#7ad8ff', k: 0.7 }); });
      if (M().stairs) out.push({ tx: M().stairs.x, ty: M().stairs.y, r: 2.4, col: '#8ab8ff', k: 0.5 });
      S.mons.forEach(function (mo) { var lk = lookOf(mo.def); if (!mo.gone && lk.light && (!tiles || true)) out.push({ tx: mo.x, ty: mo.y, r: mo.boss ? 3.5 : 2.6, col: lk.light, k: 0.6, mon: mo }); });
      return out;
    }

    /* ---------- the turn engine: beats run one after another; input is read only when no beat is running ---------- */
    function beat(b) { b.t = 0; b.fired = false; S.queue.push(b); return b; }
    function animTo(e, pts, dur) { e.anim = { pts: pts, t: 0, dur: Math.max(1, dur) }; }
    function idle() { return S && S.phase === 'play' && !S.queue.length && !S.fade; }
    function act(dx, dy) {
      var h = S.hero, nx = h.x + dx, ny = h.y + dy;
      if (dx) h.face = dx > 0 ? 'right' : 'left';
      h.dir = dx ? (dx > 0 ? 'right' : 'left') : dy < 0 ? 'up' : 'down';
      if (!cornerOk(h.x, h.y, dx, dy)) return false;
      var mo = monAt(nx, ny);
      if (mo) { heroAttack(mo); return true; }
      var ch = chestAt(nx, ny);
      if (ch) { if (ch.open) return false; openChest(ch); return true; }
      if (closedDoor(nx, ny)) { openDoor(doorAt(nx, ny)); return true; }
      var f = featureAt(nx, ny);
      if (f) { useFeature(f); return true; }
      if (!freeFor(nx, ny, h)) return false;
      // move: the hero's tile changes now, the sprite walks there during the beat; monsters move in the same beat
      var from = [h.x, h.y]; h.x = nx; h.y = ny; S.steps++;
      animTo(h, [from, [nx, ny]], num(P.moveMs, 120));
      ev({ kind: 'move', id: 'hero', x: nx, y: ny, from: { x: from[0], y: from[1] } });
      computeFov();
      beat({ dur: num(P.moveMs, 120), impactAt: num(P.moveMs, 120), impact: function () { arrive(); } });
      endHeroTurn(true);
      return true;
    }
    function arrive() {
      var h = S.hero;
      S.items.forEach(function (it) { if (!it.taken && it.x === h.x && it.y === h.y) { it.taken = true; gain(it.item, it.x, it.y, 'floor'); } });
      if (tile(h.x, h.y) === STAIRS && !S.fade) descend();
    }
    function heroAttack(mo) {
      var h = S.hero; h.target = mo.id;
      h.lunge = { dx: mo.x - h.x, dy: mo.y - h.y, t: 0, dur: 230, attack: true };
      if (!mo.awake) wake(mo, true);
      beat({ dur: 230, impactAt: 85, impact: function () { strike(h, mo); }, after: function () { endHeroTurn(false); } });
    }
    function openChest(ch) {
      var h = S.hero; h.lunge = { dx: ch.x - h.x, dy: ch.y - h.y, t: 0, dur: 160 };
      beat({ dur: 260, impactAt: 90, impact: function () {
        ch.open = true; S.chestsOpened++; ev({ kind: 'chest', x: ch.x, y: ch.y, item: ch.item });
        burst(ch.x * T + 8, ch.y * T + 6, '#ffe070', 10); gain(ch.item, ch.x, ch.y, 'chest');
      }, after: function () { endHeroTurn(false); } });
    }
    function openDoor(d) {
      var h = S.hero; h.lunge = { dx: d.x - h.x, dy: d.y - h.y, t: 0, dur: 140 };
      beat({ dur: 170, impactAt: 70, impact: function () { d.open = true; computeFov(); S.mmDirty = true; ev({ kind: 'door', x: d.x, y: d.y }); dust(d.x * T + 8, d.y * T + 12); }, after: function () { endHeroTurn(false); } });
    }
    function useFeature(f) {
      var h = S.hero; h.lunge = { dx: f.x - h.x, dy: f.y - h.y, t: 0, dur: 160 };
      beat({ dur: 240, impactAt: 90, impact: function () {
        if (f.kind === 'fountain' && !f.used) { f.used = true; var before = h.hp; h.hp = h.maxHp; healFx(h, h.hp - before); msg('The fountain restores you.', '#9ae8ff'); ev({ kind: 'fountain', x: f.x, y: f.y, heal: h.hp - before }); }
        else if (f.kind === 'throne') msg('The throne is cold and empty.', '#c8b8e0');
        else msg('The basin is still.', '#b8b0c8');
      }, after: function () { endHeroTurn(false); } });
    }
    function wait() { beat({ dur: 90, impactAt: 0, impact: function () { }, after: function () { endHeroTurn(false); } }); return true; }
    function drinkPotion() {
      var h = S.hero; if (h.potions <= 0) { msg('No tonic left.', '#ff9a8a'); return false; }
      h.potions--; var before = h.hp; h.hp = Math.min(h.maxHp, h.hp + num(L.items.potion && L.items.potion.effect && L.items.potion.effect.heal, 16));
      healFx(h, h.hp - before); msg('You drink a tonic (+' + (h.hp - before) + ').', '#9ae07a'); ev({ kind: 'potion', heal: h.hp - before, left: h.potions });
      beat({ dur: 260, impactAt: 0, impact: function () { }, after: function () { endHeroTurn(false); } });
      return true;
    }
    function healFx(h, n) { ev({ kind: 'heal', id: 'hero', amount: n }); if (n > 0) popNum(h, '+' + n, 'heal', n); for (var i = 0; i < 8; i++) S.fx.push({ kind: 'plus', x: h.px - 6 + S.fxr() * 12, y: h.py - 4 - S.fxr() * 14, t: -i * 40, dur: 700 }); }
    function gain(id, x, y, from) {
      var def = L.items[id]; if (!def) return;
      var e = def.effect || {}, h = S.hero, parts = [];
      if (def.carry) { if (id === 'potion' || e.heal) { h.potions++; parts.push('+1 tonic'); } }
      else {
        if (e.gold) { h.gold += e.gold; parts.push('+' + e.gold + ' gold'); }
        if (e.maxHp) { h.maxHp += e.maxHp; parts.push('+' + e.maxHp + ' max HP'); }
        if (e.heal) { var b2 = h.hp; h.hp = Math.min(h.maxHp, h.hp + e.heal); if (h.hp > b2) healFx(h, h.hp - b2); }
        if (e.atk) { h.atk += e.atk; parts.push('+' + e.atk + ' attack'); }
        if (e.def) { h.def += e.def; parts.push('+' + e.def + ' armour'); }
        if (e.reveal) { var m = M(); for (var i = 0; i < m.tiles.length; i++) if (m.tiles[i] !== ROCK) S.explored[i] = 1; S.mmDirty = true; parts.push('the floor is revealed'); }
      }
      S.fx.push({ kind: 'pop', item: id, x: x * T + 8, y: y * T + 8, t: 0, dur: 900 });
      msg((from === 'chest' ? 'Chest: ' : '') + def.name + (parts.length ? ' (' + parts.join(', ') + ')' : ''), e.gold ? '#ffe070' : '#c8f0ff');
      ev({ kind: 'pickup', item: id, from: from, x: x, y: y, effect: copy(e), carry: !!def.carry });
    }
    function descend() {
      ev({ kind: 'descend', floor: S.floor, to: S.floor + 1 });
      S.fade = { t: 0, dur: 900, mid: false };
    }

    /* ---------- combat: rolls happen on the impact frame, then onHit, then deaths ---------- */
    function strike(a, d) {
      if (!d || d.gone || (d.dying && d !== S.hero) || (d === S.hero && d.dead)) return;
      var isHero = a === S.hero, atk = isHero ? a.atk : num(a.def.atk, 3), def = d === S.hero ? d.def : num(d.def.def, 0);
      var roll = S.rng(), miss = roll < (isHero ? 0.07 : 0.1), crit = !miss && S.rng() < (isHero ? 0.1 : 0.06);
      var dmg = miss ? 0 : Math.max(1, atk + S.rng.int(-1, 2) - def); if (crit) dmg = Math.ceil(dmg * 1.6);
      var before = d.hp; d.hp = Math.max(0, d.hp - dmg);
      var killed = before > 0 && d.hp <= 0;
      if (!miss) { d.flash = 120; slash(a, d, crit); sparks(d.px, d.py - 8, crit ? '#ffe070' : '#ffffff', crit ? 10 : 6); }
      popNum(d, miss ? 'miss' : crit ? (before - d.hp) + '!' : String(before - d.hp), miss ? 'miss' : crit ? 'crit' : d === S.hero ? 'hurt' : 'dmg', before - d.hp, a);
      var hit = { kind: 'damage', source: a.id, target: d.id, attacker: isHero ? 'hero' : a.kind, defender: d === S.hero ? 'hero' : d.kind, raw: miss ? 0 : atk, amount: before - d.hp,
        hpBefore: before, hpAfter: d.hp, killed: killed, crit: crit, miss: miss, x: d.px, y: d.py - 10 };
      if (d === S.hero) S.lastHitBy = a.id;
      safe(opt.onHit, [hit], 'onHit');
      if (isHero) msg(miss ? 'You miss ' + the(d.def.name) + '.' : (crit ? 'Critical! ' : '') + 'You hit ' + the(d.def.name) + ' for ' + hit.amount + '.', crit ? '#ffe070' : '#f4ead8');
      else msg(miss ? cap(the(a.def.name)) + ' misses.' : cap(the(a.def.name)) + ' hits you for ' + hit.amount + '.', miss ? '#b8b0c8' : '#ff9a8a');
      if (killed) { if (d === S.hero) heroDies(a); else monDies(d); }
    }
    function monDies(mo) {
      mo.dying = 1; S.kills++; puff(mo.px, mo.py - 7, mo.def);
      var h = S.hero, xp = num(mo.def.xp, 2); h.xp += xp;
      msg(cap(the(mo.def.name)) + ' falls.' + (xp ? ' +' + xp + ' XP' : ''), '#ffd6a0');
      ev({ kind: 'death', id: mo.id, monster: mo.kind, xp: xp, x: mo.x, y: mo.y, boss: mo.boss });
      while (h.xp >= xpNeed(h.lvl)) { h.xp -= xpNeed(h.lvl); h.lvl++; h.maxHp += 5; var hb = h.hp; h.hp = Math.min(h.maxHp, h.hp + 5); h.atk += 1; if (h.lvl % 3 === 0) h.def += 1; levelFx(); msg('Level ' + h.lvl + '! Max HP +5, attack +1.', '#ffe070'); ev({ kind: 'levelUp', level: h.lvl, hpGain: h.hp - hb }); }
      if (!mo.boss && S.rng() < 0.18) { var it = { x: mo.x, y: mo.y, item: 'coins', taken: false }; if (!chestAt(mo.x, mo.y)) S.items.push(it); }
      if (mo.boss) { S.queue.length = 0; beat({ dur: 1400, impactAt: 1300, impact: function () { finish('win'); } }); }
    }
    function the(n) { return /^the /i.test(n) ? 'the ' + n.slice(4) : 'the ' + n; }
    function cap(n) { return n.charAt(0).toUpperCase() + n.slice(1); }
    function xpNeed(l) { return 6 + l * 7; }
    function heroDies(by) {
      var h = S.hero; h.dead = 1; S.queue.length = 0;
      msg('You fall in the dark...', '#ff6a5a');
      beat({ dur: 1300, impactAt: 1200, impact: function () { finish('lose', by); } });
    }
    function finish(result, by) {
      if (S.ended) return; S.ended = true; S.phase = result === 'win' ? 'won' : 'lost'; S.result = result;
      var info = { floor: S.floor, floors: num(P.floors, 5), turns: S.turn, kills: S.kills, gold: S.hero.gold, level: S.hero.lvl, by: by ? by.kind || by.id : null };
      ev({ kind: 'end', result: result, floor: S.floor, turns: S.turn });
      safe(opt.onEnd, [result, info], 'onEnd');
    }
    function wake(mo, quiet) { if (mo.awake) return; mo.awake = true; ev({ kind: 'wake', id: mo.id, monster: mo.kind }); if (!quiet) popLabel(mo, 'mark', '!', 650); if (mo.boss) msg('The Hollow Crown rises from its throne!', '#d8a8ff'); }

    /* ---------- monsters' turn ---------- */
    function endHeroTurn(parallel) {
      if (S.hero.dead || S.ended) return;
      S.turn++; S.floorTurns++;
      ev({ kind: 'turn', turn: S.turn });
      var h = S.hero, m = M();
      S.mons.forEach(function (mo) {
        if (mo.gone || mo.dying || mo.awake) return;
        if (!visible(mo.x, mo.y)) return;
        var d = Math.max(Math.abs(mo.x - h.x), Math.abs(mo.y - h.y));
        if (d <= num(mo.def.sight, 6) && (d <= 2 || S.rng() < 0.55)) wake(mo);
      });
      // walking distance to the hero for every cell (monsters pass open doors only)
      var dm = new Int32Array(m.w * m.h).fill(-1), q = [h.y * m.w + h.x]; dm[q[0]] = 0;
      for (var qi = 0; qi < q.length; qi++) {
        var c = q[qi], cx = c % m.w, cy = (c / m.w) | 0; if (dm[c] > 40) continue;
        for (var k2 = 0; k2 < 8; k2++) { var nx = cx + DIRS8[k2][0], ny = cy + DIRS8[k2][1], ni = ny * m.w + nx; if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || dm[ni] >= 0) continue; if (!terrainPass(nx, ny) || closedDoor(nx, ny) || chestAt(nx, ny) || featureAt(nx, ny)) continue; if (!cornerOk(cx, cy, DIRS8[k2][0], DIRS8[k2][1])) continue; dm[ni] = dm[c] + 1; q.push(ni); }
      }
      var attacks = [];
      S.mons.forEach(function (mo) {
        if (mo.gone || mo.dying || !mo.awake) return;
        mo.energy += num(mo.def.speed, 1);
        var pts = [[mo.x, mo.y]];
        while (mo.energy >= 1) {
          mo.energy -= 1;
          if (adjacent(mo, h)) { attacks.push(mo); continue; }
          var step = null, opts = [];
          for (var k3 = 0; k3 < 8; k3++) { var sx = mo.x + DIRS8[k3][0], sy = mo.y + DIRS8[k3][1]; if (!freeFor(sx, sy, mo) || !cornerOk(mo.x, mo.y, DIRS8[k3][0], DIRS8[k3][1])) continue; opts.push([sx, sy, dm[sy * m.w + sx], k3]); }
          if (!opts.length) continue;
          var here = dm[mo.y * m.w + mo.x];
          if (num(mo.def.erratic, 0) > 0 && S.rng() < num(mo.def.erratic, 0)) step = opts[Math.floor(S.rng() * opts.length)];
          else if (here >= 0) {
            var best = null; opts.forEach(function (o2) { if (o2[2] < 0) return; var sc = o2[2] * 10 + (o2[3] % 2 ? 1 : 0); if (o2[2] < here && (!best || sc < best[4])) best = [o2[0], o2[1], o2[2], o2[3], sc]; });
            step = best;
          } else if (S.rng() < 0.4) step = opts[Math.floor(S.rng() * opts.length)];
          if (step) { mo.x = step[0]; mo.y = step[1]; pts.push([mo.x, mo.y]); ev({ kind: 'move', id: mo.id, x: mo.x, y: mo.y }); }
        }
        if (pts.length > 1) animTo(mo, pts, num(P.moveMs, 120) * (pts.length > 2 ? 0.75 : 1) * (pts.length - 1));
      });
      attacks.forEach(function (mo) {
        beat({ dur: 230, impactAt: 100, start: function () { mo.lunge = { dx: h.x - mo.x, dy: h.y - mo.y, t: 0, dur: 210, attack: true }; mo.target = 'hero'; }, impact: function () { if (!mo.dying && !mo.gone && adjacent(mo, h)) strike(mo, h); } });
      });
      if (!parallel && !attacks.length) { /* nothing else */ }
      computeFov();
    }

    /* ---------- update ---------- */
    function update(dt) {
      if (!S) return;
      dt = num(dt, 0); if (dt < 0) dt = 0;
      if (dt > 0) S.clock += dt;
      var h = S.hero;
      // beats
      var left = dt, guard = 0;
      while (S.queue.length && guard++ < 8) {
        var b = S.queue[0];
        if (b.t === 0 && !b.started) { b.started = true; if (b.start) b.start(); }
        b.t += left; left = 0;
        if (!b.fired && b.t >= (b.impactAt || 0)) { b.fired = true; if (b.impact) b.impact(); }
        if (S.queue[0] !== b) { left = 0; continue; }      // the impact replaced the queue (a death)
        if (b.t >= b.dur) { left = b.t - b.dur; S.queue.shift(); if (b.after) b.after(); if (left <= 0) break; } else break;
      }
      // fade between floors
      if (S.fade && dt > 0) {
        S.fade.t += dt;
        if (!S.fade.mid && S.fade.t >= S.fade.dur / 2) { S.fade.mid = true; enterFloor(S.floor + 1); }
        if (S.fade.t >= S.fade.dur) S.fade = null;
      }
      // sprites: walk tweens, lunges, flashes
      [h].concat(S.mons).forEach(function (e) {
        var ox = e.px, oy = e.py;
        if (e.anim) {
          e.anim.t += dt; var u = clamp(e.anim.t / e.anim.dur, 0, 1), n = e.anim.pts.length - 1, f = u * n, i = Math.min(n - 1, Math.floor(f)), w = f - i, a = e.anim.pts[i], b2 = e.anim.pts[i + 1];
          e.px = lerp(a[0], b2[0], w) * T + 8; e.py = lerp(a[1], b2[1], w) * T + 15;
          if (u >= 1) e.anim = null;
        } else { e.px = e.x * T + 8; e.py = e.y * T + 15; }
        e.vx = dt > 0 ? (e.px - ox) / dt * 1000 : e.vx;
        if (e === h && dt > 0) { var md = Math.abs(e.px - ox) + Math.abs(e.py - oy); e.walk = md > 0 ? e.walk + md : 0; }
        if (e.lunge) { e.lunge.t += dt; if (e.lunge.t >= e.lunge.dur) { e.lunge = null; if (e !== h) e.target = null; } }
        if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
        if (e.dying) { e.dying += dt; if (e.dying > 520) e.gone = true; }
      });
      if (!h.lunge) h.target = null;
      // facing: awake monsters look at the hero (drawn x), others at their walking direction
      S.mons.forEach(function (mo) {
        if (mo.gone) return;
        var dxp = h.px - mo.px;
        if (mo.awake && !mo.dying && Math.abs(dxp) > 2) { mo.face = dxp > 0 ? 'right' : 'left'; mo.target = 'hero'; }
        else { mo.target = null; if (Math.abs(mo.vx) > 1) mo.face = mo.vx > 0 ? 'right' : 'left'; }
      });
      if (h.target) { var tm = byId(h.target); if (tm && Math.abs(tm.px - h.px) > 2) { h.face = tm.px > h.px ? 'right' : 'left'; if (h.dir === 'left' || h.dir === 'right') h.dir = h.face; } }
      // effects
      for (var i2 = S.fx.length - 1; i2 >= 0; i2--) { var f2 = S.fx[i2]; f2.t += dt; if (f2.t >= f2.dur) S.fx.splice(i2, 1); }
      placeNums(dt);
      if (S.banner) { S.banner.t += dt; if (S.banner.t > 2600) S.banner = null; }
      // held keys repeat after 170 ms
      ['up', 'down', 'left', 'right'].forEach(function (d) { if (held[d]) held[d] += dt; });
      // input (only between beats)
      if (idle() && !S.ended && dt > 0) {
        if (autoOn) { S.think += dt; if (S.think >= 40) { S.think = 0; botStep(); } }
        else if (inputQ.length) doKey(inputQ.shift());
        else if (S.path && S.path.length) followPath();
        else { var hx = (held.right > 170 ? 1 : 0) - (held.left > 170 ? 1 : 0), hy = (held.down > 170 ? 1 : 0) - (held.up > 170 ? 1 : 0); if (hx || hy) act(hx, hy); }
      }
      // camera: follows the hero's drawn position, clamped to the map
      var m = M(), tx = h.px - view.w / 2, ty = h.py - 8 - view.h / 2;
      var mw = m.w * T, mh = m.h * T;
      tx = mw <= view.w ? (mw - view.w) / 2 : clamp(tx, -8, mw - view.w + 8); ty = mh <= view.h ? (mh - view.h) / 2 : clamp(ty, -24, mh - view.h + 24);
      if (!S.cam.init || S.fade) { S.cam.x = tx; S.cam.y = ty; S.cam.init = true; }
      else if (dt > 0) { var kk = 1 - Math.pow(0.0005, dt / 1000); S.cam.x += (tx - S.cam.x) * kk; S.cam.y += (ty - S.cam.y) * kk; }
    }
    function byId(id) { if (id === 'hero') return S.hero; for (var i = 0; i < S.mons.length; i++) if (S.mons[i].id === id) return S.mons[i]; return null; }
    function doKey(kk) {
      if (!S || S.ended) return;
      if (kk === 'map') { mapOpen = !mapOpen; return; }
      if (mapOpen && (kk === 'back' || kk === 'ok')) { mapOpen = false; return; }
      if (!idle()) return;
      S.path = null;
      if (KEYDIR[kk]) { act(KEYDIR[kk][0], KEYDIR[kk][1]); return; }
      if (kk === 'wait' || kk === 'ok') { wait(); return; }
      if (kk === 'potion') { drinkPotion(); return; }
    }
    function key(kk) {
      if (!S) return false;
      if (kk && typeof kk === 'object' && kk.tap) return pointer('down', kk.x, kk.y);
      if (kk === 'map') { mapOpen = !mapOpen; return true; }
      if (KEYDIR[kk] || kk === 'wait' || kk === 'ok' || kk === 'potion' || kk === 'back') { S.path = null; if (inputQ.length < 2) inputQ.push(kk); return true; }
      return false;
    }
    function setHeld(o) { ['up', 'down', 'left', 'right'].forEach(function (d) { var on = !!(o && o[d]); held[d] = on ? (held[d] || 1) : 0; }); }

    /* ---------- pointer: tap a tile to walk there (explored cells), tap a neighbour monster to attack, tap the bag to drink ---------- */
    function pointer(type, x, y) {
      if (!S || type !== 'down') return false;
      var lx = x - view.x, ly = y - view.y;
      for (var i = 0; i < hudRects.length; i++) { var r = hudRects[i]; if (lx >= r.x && ly >= r.y && lx < r.x + r.w && ly < r.y + r.h) { if (r.name === 'bag') { inputQ.push('potion'); return true; } if (r.name === 'floor' || r.name === 'minimap') { mapOpen = !mapOpen; return true; } return true; } }
      if (mapOpen) { mapOpen = false; return true; }
      var wx = Math.floor((lx + Math.round(S.cam.x)) / T), wy = Math.floor((ly + Math.round(S.cam.y)) / T), h = S.hero;
      if (wx === h.x && wy === h.y) { inputQ.push('wait'); return true; }
      if (Math.max(Math.abs(wx - h.x), Math.abs(wy - h.y)) === 1) { S.path = [[wx, wy]]; return true; }
      var p = heroPath(function (cx, cy) { return cx === wx && cy === wy; }, true);
      if (p) S.path = p.steps; else S.path = null;
      return true;
    }
    function followPath() {
      var h = S.hero, nx2 = S.path[0], seen = S.mons.some(function (mo) { return !mo.gone && !mo.dying && visible(mo.x, mo.y) && mo.awake && Math.max(Math.abs(mo.x - h.x), Math.abs(mo.y - h.y)) <= 6; });
      if (seen && S.path.length > 1) { S.path = null; return; }
      S.path.shift();
      if (!act(nx2[0] - h.x, nx2[1] - h.y)) S.path = null;
    }
    // BFS over explored cells for the hero (closed doors pass: bumping opens them); goal(x, y) -> true; steps exclude the start
    function heroPath(goal, allowGoalBlocked, anyCell) {
      var m = M(), h = S.hero, N = m.w * m.h, prev = new Int32Array(N).fill(-2), q = [h.y * m.w + h.x], found = -1;
      prev[q[0]] = -1;
      for (var qi = 0; qi < q.length; qi++) {
        var c = q[qi], cx = c % m.w, cy = (c / m.w) | 0;
        if (qi > 0 && goal(cx, cy)) { found = c; break; }
        if (qi > 0 && (chestAt(cx, cy) || featureAt(cx, cy))) continue;
        for (var k2 = 0; k2 < 8; k2++) {
          var dx = DIRS8[k2][0], dy = DIRS8[k2][1], nx = cx + dx, ny = cy + dy, ni = ny * m.w + nx;
          if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || prev[ni] !== -2) continue;
          if ((!S.explored[ni] && !anyCell) || !terrainPass(nx, ny)) continue;
          var t2 = tile(nx, ny);
          if (dx && dy && (t2 === DOOR || tile(cx, cy) === DOOR || !terrainPass(cx + dx, cy) || !terrainPass(cx, cy + dy) || closedDoor(cx + dx, cy) || closedDoor(cx, cy + dy))) continue;
          if ((chestAt(nx, ny) || featureAt(nx, ny)) && !(allowGoalBlocked && goal(nx, ny))) { if (!goal(nx, ny)) continue; }
          prev[ni] = c; q.push(ni);
        }
      }
      if (found < 0) return null;
      var steps = [], c2 = found; while (prev[c2] !== -1) { steps.push([c2 % m.w, (c2 / m.w) | 0]); c2 = prev[c2]; }
      return { steps: steps.reverse(), goal: [found % m.w, (found / m.w) | 0] };
    }

    /* ---------- the bot: plays through the same act() a player uses ---------- */
    function botStep() {
      var h = S.hero, m = M();
      var foes = S.mons.filter(function (mo) { return !mo.gone && !mo.dying && visible(mo.x, mo.y); });
      var adj = foes.filter(function (mo) { return adjacent(h, mo); }).sort(function (a, b) { return a.hp - b.hp || (a.id < b.id ? -1 : 1); });
      var near = foes.filter(function (mo) { return mo.awake && Math.max(Math.abs(mo.x - h.x), Math.abs(mo.y - h.y)) <= 5; });
      var boss = foes.filter(function (mo) { return mo.boss; })[0];
      if (h.potions > 0 && (h.hp <= h.maxHp * 0.34 || (boss && h.hp <= h.maxHp * 0.55 && Math.max(Math.abs(boss.x - h.x), Math.abs(boss.y - h.y)) <= 3))) { drinkPotion(); return; }
      if (adj.length) { act(adj[0].x - h.x, adj[0].y - h.y); return; }
      if (near.length) {
        // let a lone chaser come to us (we strike first), otherwise close in
        var p0 = heroPath(function (cx, cy) { return near.some(function (mo) { return Math.max(Math.abs(mo.x - cx), Math.abs(mo.y - cy)) <= 1; }); });
        var dmin = Math.min.apply(null, near.map(function (mo) { return Math.max(Math.abs(mo.x - h.x), Math.abs(mo.y - h.y)); }));
        if (dmin === 2 && near.every(function (mo) { return num(mo.def.speed, 1) >= 1; })) { wait(); return; }
        if (p0 && p0.steps.length) { if (act(p0.steps[0][0] - h.x, p0.steps[0][1] - h.y)) return; }
      }
      var hurt = h.hp < h.maxHp * 0.7;
      var p = heroPath(function (cx, cy) {
        var c = chestAt(cx, cy); if (c && !c.open) return true;
        var f = featureAt(cx, cy); if (f && !f.used && hurt) return true;
        return S.items.some(function (it) { return !it.taken && it.x === cx && it.y === cy; });
      }, true);
      if (!p) p = heroPath(function (cx, cy) {
        for (var k2 = 0; k2 < 8; k2++) { var nx = cx + DIRS8[k2][0], ny = cy + DIRS8[k2][1]; if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue; var ni = ny * m.w + nx; if (!S.explored[ni] && m.tiles[ni] !== ROCK && m.tiles[ni] !== WALL) return true; }
        return false;
      });
      if (p && S.floorTurns > 900) p = null;
      if (!p && m.stairs) p = heroPath(function (cx, cy) { return cx === m.stairs.x && cy === m.stairs.y; }) || heroPath(function (cx, cy) { return cx === m.stairs.x && cy === m.stairs.y; }, false, true);
      if (!p) { var bs = S.mons.filter(function (mo) { return mo.boss && !mo.gone && !mo.dying; })[0]; if (bs) p = heroPath(function (cx, cy) { return Math.max(Math.abs(bs.x - cx), Math.abs(bs.y - cy)) <= 1; }); }
      if (p && p.steps.length) { if (act(p.steps[0][0] - h.x, p.steps[0][1] - h.y)) return; }
      wait();
    }

    /* ---------- effects ---------- */
    // world texts: combat numbers (one per hit, the same value the log prints), the LEVEL UP label and the '!' wake marks.
    // Each is placed ONCE, the first frame it shows (from update, so ?t= stills equal play), then follows a fixed path (rises
    // 6 px and fades; never moves sideways, never re-placed). Spots, in order: above the owner's head (2 slots; LEVEL UP first
    // takes its own lane above those), beside the head (the side away from the attacker first), beside the body, below the
    // feet, lower beside and below. A spot is taken only when, over its whole path, it (a) overlaps no other world text,
    // (b) is closer to its owner than to any other unit at the start and the end of its rise (other units counted at rest
    // plus the strike they can make, as drawn now, and walkers up to their next cell) and (c) overlaps no other unit; (c) is
    // relaxed first; when nothing owned fits, the owner's own older numbers (shown >= 150 ms) that block an owned spot end
    // and the new one takes it; else it waits 100 ms (3 times), then takes the best-owned spot clear of text. (a) is never
    // relaxed. Afterwards a text fades out (numbers 120 ms, labels 50 ms) when its owner steps off its cell or another unit comes closer to it
    // than its owner. Hidden while the owner's cell is unseen. params.numbers 'off' turns numbers off (an addon draws them).
    function popNum(e, txt, style, amt, from) {
      var last = null;
      S.fx.forEach(function (f) { if (f.kind !== 'num' || f.id !== e.id || f.lab !== 'num') return; if (!last || f.t < last.t) last = f; });
      var delay = last && last.t < 120 ? 120 - last.t : 0;
      S.numSeq = (S.numSeq || 0) + 1; S.fx.push({ kind: 'num', lab: 'num', n: S.numSeq, id: e.id, tx: e.x, ty: e.y, text: txt, style: style, amt: amt | 0, from: from ? from.px : null, fromY: from ? from.py : null, t: -delay, dur: style === 'crit' ? 1100 : 900, x0: null, y0: null, tries: 0 });
    }
    function popLabel(e, lab, txt, dur) { S.numSeq = (S.numSeq || 0) + 1; S.fx.push({ kind: 'num', lab: lab, n: S.numSeq, id: e.id, tx: e.x, ty: e.y, text: txt, style: lab, amt: 0, from: null, t: 0, dur: dur, x0: null, y0: null, tries: 0 }); }
    var NUMSTYLE = { dmg: ['#ffffff', '#3a0a14'], hurt: ['#ff7a5a', '#2a0608'], crit: ['#ffe040', '#5a1a04'], miss: ['#c8c0dc', '#1a1428'], heal: ['#7aff8a', '#0a2a10'], level: ['#ffe070', '#2a1804'] };
    var NUM_RISE = 6;
    // a unit's box at rest: body (and its HP bar when hurt), from its drawn tile position without lunge or hover bob
    function restBox(e) {
      if (e === S.hero) return { id: 'hero', x: Math.round(e.px) - 7, y: Math.round(e.py) - 18, w: 14, h: 18 };
      var lk = lookOf(e.def), sc = num(e.def.size, 1), hh = Math.round(lk.h * sc), w = Math.round(lk.w * sc * (lk.fly ? 0.75 : 0.85)), lift = lk.fly || 0, bar = e.hp < e.maxHp && !e.boss ? 4 : 0;
      return { id: e.id, x: Math.round(e.px - w / 2), y: Math.round(e.py) - hh - lift - bar, w: w, h: hh + lift + bar };
    }
    // the other units around an owner, each as its rest box grown by the lunge it can make toward the owner (an adjacent
    // attacker's strike reaches 6-7 px into the owner's side), so a text that is owned at rest stays owned during the swings
    function drawnBox(u) { var a = anchorWorld(u); return { id: u.id, x: Math.round(a.x - a.w / 2), y: Math.round(a.top), w: a.w, h: Math.round(a.footY - a.top) }; }   // HP bar to feet
    function drawnBoxes(e) {
      return liveUnits().filter(function (u) { return u !== e; }).map(function (u) {
        var b = drawnBox(u), dpx = Math.round(u.x * T + 8 - u.px), dpy = Math.round(u.y * T + 15 - u.py);
        return { id: b.id, x: b.x + Math.min(0, dpx), y: b.y + Math.min(0, dpy), w: b.w + Math.abs(dpx), h: b.h + Math.abs(dpy) };
      });
    }
    function otherBoxes(e) {
      var all = liveUnits();
      return all.filter(function (u) { return u !== e; }).map(function (u) {
        var b = restBox(u), dpx = u.x * T + 8 - u.px, dpy = u.y * T + 15 - u.py, x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
        if (dpx || dpy) { x0 += Math.min(0, Math.round(dpx)); x1 += Math.max(0, Math.round(dpx)); y0 += Math.min(0, Math.round(dpy)); y1 += Math.max(0, Math.round(dpy)); }   // walking: up to its next cell
        // its strikes: the hero toward every adjacent monster, a monster toward the hero when adjacent
        all.forEach(function (v) {
          if (v === u || (u !== S.hero && v !== S.hero)) return;
          var dx = v.x - u.x, dy = v.y - u.y; if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return;
          var k = u === S.hero ? 6 : dx ? 7 : dy > 0 ? 0 : 2, l = Math.sqrt(dx * dx + dy * dy), sx = Math.round(dx / l * k), sy = Math.round(dy / l * k);
          x0 = Math.min(x0, b.x + sx); x1 = Math.max(x1, b.x + b.w + sx); y0 = Math.min(y0, b.y + sy); y1 = Math.max(y1, b.y + b.h + sy);
        });
        return { id: b.id, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      });
    }
    // how much closer a text's centre is to its owner than to the nearest other unit (walking units count at their next
    // cell already, so a text goes as soon as a unit starts walking up to it)
    function ownMargin(r, B, units) { var mx = r.x + r.w / 2, my = r.y + r.h / 2, dO = boxDist(mx, my, B), m = 99; units.forEach(function (u) { m = Math.min(m, boxDist(mx, my, u) - dO); }); return m; }
    function liveUnits() { return [S.hero].concat(S.mons.filter(function (mo) { return !mo.gone && visible(mo.x, mo.y); })); }   // dying ones too: they are still drawn
    function boxDist(px, py, b) { var dx = Math.max(b.x - px, 0, px - (b.x + b.w)), dy = Math.max(b.y - py, 0, py - (b.y + b.h)); return Math.sqrt(dx * dx + dy * dy); }
    function hitR(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
    function pathRect(f) { return { x: f.x0 - 1, y: f.y0 - (f.lab === 'mark' ? 3 : NUM_RISE) - 1, w: f.w + 2, h: f.h + (f.lab === 'mark' ? 3 : NUM_RISE) + 2 }; }
    function textSize(f) {
      if (f.lab === 'mark') { f.sc = 1; f.w = 5; f.h = 10; return; }
      var sc = f.style === 'crit' && f.id !== 'hero' ? 2 : 1; f.sc = sc; f.w = measure(f.text) * sc + 2; f.h = 9 * sc;
    }
    function spotsFor(f, B) {
      var cx = B.x + B.w / 2, w = f.w, h = f.h, R = f.lab === 'mark' ? 3 : NUM_RISE, out = [];
      var above0 = { x: Math.round(cx - w / 2), y: B.y - 1 - h }, above1 = { x: above0.x, y: above0.y - h - 2 };
      var right = { x: B.x + B.w + 2, y: B.y + R + 1 }, left = { x: B.x - w - 2, y: B.y + R + 1 }, below = { x: above0.x, y: B.y + B.h + R + 2 + (S.hero !== byId(f.id) && barBelow(byId(f.id)) ? 5 : 0) };
      if (f.lab === 'level') out.push({ x: above0.x, y: above0.y - 2 * (9 + 2) });   // its own lane above the two number slots
      out.push(above0); out.push(above1);
      if (f.lab === 'mark') { out.push(right); out.push(left); return out; }
      var fromRight = f.from != null && f.from > cx, low = h + 2, right2 = { x: right.x, y: right.y + low }, left2 = { x: left.x, y: left.y + low }, below2 = { x: below.x, y: below.y + low };
      var rightH = { x: right.x, y: B.y - 3 }, leftH = { x: left.x, y: B.y - 3 };   // beside the head
      out.push(fromRight ? leftH : rightH); out.push(fromRight ? rightH : leftH); out.push(fromRight ? left : right); out.push(fromRight ? right : left); out.push(below); out.push(fromRight ? left2 : right2); out.push(fromRight ? right2 : left2); out.push(below2);
      return out;
    }
    function placeText(f) {
      var e = byId(f.id); if (!e) { f.x0 = f.tx * T; f.y0 = f.ty * T - 12; textSize(f); return; }
      textSize(f);
      var B = restBox(e), dr = drawnBoxes(e), units = otherBoxes(e).map(function (u, i) { var d = dr[i], x0 = Math.min(u.x, d.x), y0 = Math.min(u.y, d.y); return { id: u.id, x: x0, y: y0, w: Math.max(u.x + u.w, d.x + d.w) - x0, h: Math.max(u.y + u.h, d.y + d.h) - y0 }; }), bl = e === S.hero ? null : bladeRect();   // rest + strike reach, and as drawn now
      var texts = S.fx.filter(function (g2) { return g2 !== f && g2.kind === 'num' && g2.x0 != null && g2.t < g2.dur && (g2.lab !== 'num' || P.numbers !== 'off'); }).map(pathRect);
      var cands = spotsFor(f, B), pick = null, best = null, tier = 0;
      for (var k = 2; k < 8; k++) cands.push({ x: cands[0].x, y: B.y - 1 - f.h - k * (f.h + 2), late: 1 });   // last resort: higher up
      var rated = cands.map(function (c) {
        f.x0 = c.x; f.y0 = c.y; var r = pathRect(f);
        var R0 = f.lab === 'mark' ? 3 : NUM_RISE, m0 = Math.min(ownMargin({ x: c.x, y: c.y, w: f.w, h: f.h }, B, units), ownMargin({ x: c.x, y: c.y - R0, w: f.w, h: f.h }, B, units));   // owned at the start and the end of its rise
        return { c: c, clear: !texts.some(function (q) { return hitR(r, q); }), margin: m0, free: !units.some(function (u) { return hitR(r, u); }) && !(bl && hitR(r, bl)) };
      });
      // (a) clear of text always; then owned (margin > 1) and off other units, then owned, else wait 100 ms (3 times)
      rated.forEach(function (q) { if (!q.clear || q.c.late) return; if (!pick && q.margin >= 1 && q.free) { pick = q; tier = 0; } });
      if (!pick) rated.forEach(function (q) { if (!pick && q.clear && !q.c.late && q.margin >= 1) { pick = q; tier = 1; } });
      // LEVEL UP with no owned spot near the hero (crowded fight): it goes to the banner lane instead (which avoids units and texts)
      if (!pick && f.lab === 'level' && !S.banner) { S.banner = { title: 'LEVEL UP', sub: 'Level ' + S.hero.lvl + ': max HP +5, attack +1', t: 0 }; f.t = f.dur; f.x0 = -9999; f.y0 = -9999; return; }
      if (!pick && f.lab === 'num' && !f.evicted) {
        // the owner's own older numbers (shown >= 150 ms) block every owned spot: end them (50 ms fade) and retry once they are gone
        var mine = S.fx.filter(function (g2) { return g2 !== f && g2.kind === 'num' && g2.lab === 'num' && g2.id === f.id && g2.x0 != null && g2.t >= 150 && g2.t < g2.dur; });
        var spot = null; rated.forEach(function (q) { if (spot || q.c.late || q.margin < 1) return; f.x0 = q.c.x; f.y0 = q.c.y; var r = pathRect(f); var blockers = S.fx.filter(function (g2) { return g2 !== f && g2.kind === 'num' && g2.x0 != null && g2.t < g2.dur && (g2.lab !== 'num' || P.numbers !== 'off') && hitR(r, pathRect(g2)); }); if (blockers.length && blockers.every(function (g2) { return mine.indexOf(g2) >= 0; })) { spot = q; blockers.forEach(function (g2) { if (!g2.kill || g2.kill > 50) { g2.kill = 50; g2.killFrom = 50; } }); } });
        if (spot) { f.evicted = true; f.t = -60; f.x0 = null; return; }
      }
      if (!pick && f.tries < 3) { f.tries++; f.t = -100; f.x0 = null; return; }
      if (!pick) rated.forEach(function (q) { if (q.clear && (!best || q.margin > best.margin + 0.5)) best = q; }), pick = best, tier = 2;
      pick = pick || rated[0]; f.x0 = pick.c.x; f.y0 = pick.c.y; f.ob = B; f.margin0 = pick.margin; f.cx0 = Math.round(B.x + B.w / 2); f.tier = tier;
    }
    function curRect(f) { var u = f.t / f.dur, rise = f.lab === 'mark' ? Math.round(Math.min(1, u * 4) * 3) : Math.round(Math.min(1, u / 0.35) * NUM_RISE); return { x: f.x0, y: f.y0 - rise, w: f.w, h: f.h }; }
    function placeNums(dt) {
      S.fx.forEach(function (f) {
        if (f.kind !== 'num' || f.t < 0) return;
        if (f.x0 == null) { placeText(f); return; }
        if (f.kill) { f.kill -= dt || 0; if (f.kill <= 0) { f.t = f.dur; return; } }
        // the owner stepped off its cell: fade out now instead of hanging over the old spot
        var e = byId(f.id); if (e && !e.gone && (e.x !== f.tx || e.y !== f.ty) && !f.kill) { f.kill = f.lab === 'num' ? 120 : 50; f.killFrom = f.kill; }
        // another unit walked up (or onto a fallen owner's cell) so the text now reads as theirs: gone in 3 frames
        // (measured on the drawn boxes, lunges and hover included, walkers up to their next cell)
        if (!f.kill && e) { var B2 = e.gone ? f.ob : drawnBox(e), dr = drawnBoxes(e); if (B2 && ownMargin(curRect(f), B2, dr) < Math.min(1, f.margin0) - 0.5) { f.kill = 50; f.killFrom = 50; } }
      });
    }
    // a hurt monster's HP bar sits over its head, or under its feet when the head band would cover another unit (a slime
    // standing just below the hero); decided on rest boxes so it does not flip during strikes
    function barBelow(mo) {
      if (mo === S.hero || mo.boss || mo.hp >= mo.maxHp) return false;
      var b = restBox(mo), top = { x: Math.round(mo.px) - 7, y: b.y, w: 14, h: 4 }, low = { x: top.x, y: Math.round(mo.py) + 1, w: 14, h: 4 }, others = liveUnits().filter(function (u) { return u !== mo; }).map(restBox);
      return others.some(function (u) { return hitR(top, u); }) && !others.some(function (u) { return hitR(low, u); });
    }
    function hpBarRect(mo) { var a = anchorWorld(mo); return barBelow(mo) ? { x: Math.round(mo.px) - 7, y: Math.round(a.footY) + 1, w: 14, h: 4 } : { x: Math.round(mo.px) - 7, y: Math.round(a.top), w: 14, h: 4 }; }
    function bladeRect() {
      var h = S.hero; if (!h.lunge || !h.lunge.attack || h.dead) return null;
      var s2 = swordPose(h), lo = lungeOff(h), x0 = Math.round(h.px) + lo[0] + s2.hx, y0 = Math.round(h.py) + lo[1] + s2.hy, sx = Math.abs(s2.dx) < 0.3 ? 0 : s2.dx > 0 ? 1 : -1, sy = Math.abs(s2.dy) < 0.3 ? 0 : s2.dy > 0 ? 1 : -1;
      var x1 = x0 + sx * s2.len, y1 = y0 + sy * s2.len; return { x: Math.min(x0, x1) - 2, y: Math.min(y0, y1) - 2, w: Math.abs(x1 - x0) + 5, h: Math.abs(y1 - y0) + 5 };
    }
    // the world texts as drawn this frame (numbers, labels, marks): fixed spot, a rise, a fade; faded more when a unit has
    // since moved under them
    function textLayout() {
      var out = [], others = liveUnits().map(function (e) { var a = anchorWorld(e); return { id: e.id, x: Math.round(a.x - a.w / 2), y: Math.round(a.top), w: a.w, h: Math.round(a.h) }; });
      S.fx.filter(function (f) { return f.kind === 'num' && f.t >= 0 && f.t < f.dur && f.x0 != null; }).sort(function (p, q) { return q.t - p.t; }).forEach(function (f) {
        var e = byId(f.id), tx = e && !e.gone ? e.x : f.tx, ty = e && !e.gone ? e.y : f.ty;
        if (!visible(tx, ty)) return;
        var u = f.t / f.dur, c = curRect(f), r = { x: c.x, y: c.y, w: f.w, h: f.h, sc: f.sc, f: f, lab: f.lab };
        r.a = (u < 0.7 ? 1 : Math.max(0, 1 - (u - 0.7) / 0.3)) * (f.kill ? Math.max(0, f.kill / (f.killFrom || 120)) : 1);
        r.covers = others.some(function (o) { return o.id !== f.id && hitR(r, o); });
        if (r.covers) r.a *= 0.4;
        r.shown = f.lab !== 'num' || P.numbers !== 'off';
        out.push(r);
      });
      return out;
    }
    // every text drawn over the field this frame, in view px: world texts (kind num / level / mark, shown and not faded out)
    // and, with withBanner, the floor banner's two lines
    function worldTexts(withBanner) {
      if (!S) return [];
      var ox = view.x - camX(), oy = view.y - camY(), out = textLayout().filter(function (r) { return r.shown && r.a > 0.05; }).map(function (r) { return { kind: r.lab, key: r.f.n, id: r.f.id, text: r.f.text, x: r.x + ox, y: r.y + oy, w: r.w, h: r.h, a: Math.round(r.a * 100) / 100, leaving: r.f.kill ? true : undefined }; });
      if (withBanner && S.banner) { var Ly = layout(), bn = Ly.banner; if (bn) { var u = S.banner.t, ba = u < 300 ? u / 300 : u > 2100 ? Math.max(0, 1 - (u - 2100) / 500) : 1; if (ba > 0.05) { var tw1 = measure(S.banner.title), tw2 = Math.min(measure(S.banner.sub), bn.w - 12); out.push({ kind: 'banner', text: S.banner.title, x: view.x + Math.round(bn.x + bn.w / 2 - tw1 / 2), y: view.y + bn.y + 4, w: tw1, h: 9, a: ba }); out.push({ kind: 'banner', text: S.banner.sub, x: view.x + Math.round(bn.x + bn.w / 2 - tw2 / 2), y: view.y + bn.y + 19, w: tw2, h: 9, a: ba }); } } }
      return out;
    }
    function numLayout() { return textLayout().filter(function (r) { return r.lab === 'num'; }); }
    function drawNums(g) {
      textLayout().forEach(function (r) {
        if (!r.shown || r.a <= 0) return;
        g.save(); g.globalAlpha = r.a;
        if (r.lab === 'mark') { g.fillStyle = OL; g.fillRect(r.x, r.y, 5, 10); g.fillStyle = '#ffe060'; g.fillRect(r.x + 1, r.y + 1, 3, 5); g.fillRect(r.x + 1, r.y + 7, 3, 2); g.restore(); return; }
        var c = NUMSTYLE[r.f.style] || NUMSTYLE.dmg;
        g.translate(r.x + 1, r.y + 1); g.scale(r.sc, r.sc);
        text(g, r.f.text, 0, 0, { color: c[0], outline: c[1], thin: true }); g.restore();
      });
    }
    function slash(a, d, crit) { S.fx.push({ kind: 'slash', x: d.px, y: d.py - 8, ang: Math.atan2(d.py - a.py, d.px - a.px), crit: crit, hero: a === S.hero, t: 0, dur: 220 }); }
    function sparks(x, y, col, n) { for (var i = 0; i < n; i++) { var an = S.fxr() * Math.PI * 2, sp = 30 + S.fxr() * 70; S.fx.push({ kind: 'spark', x: x, y: y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 30, col: col, t: 0, dur: 260 + S.fxr() * 200 }); } }
    function burst(x, y, col, n) { for (var i = 0; i < n; i++) { var an = -Math.PI / 2 + (S.fxr() - 0.5) * 2.2, sp = 40 + S.fxr() * 60; S.fx.push({ kind: 'spark', x: x, y: y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, col: col, t: 0, dur: 500 + S.fxr() * 300, grav: 1 }); } }
    function puff(x, y, def) { var R = rampOf(def); for (var i = 0; i < 12; i++) { var an = S.fxr() * Math.PI * 2, sp = 14 + S.fxr() * 30; S.fx.push({ kind: 'smoke', x: x, y: y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp * 0.6 - 10, col: i % 3 ? '#8a8098' : R[2], t: 0, dur: 420 + S.fxr() * 260 }); } }
    function dust(x, y) { for (var i = 0; i < 6; i++) S.fx.push({ kind: 'smoke', x: x - 6 + S.fxr() * 12, y: y, vx: (S.fxr() - 0.5) * 20, vy: -8 - S.fxr() * 10, col: '#6a6080', t: 0, dur: 400 }); }
    function levelFx() { S.fx.push({ kind: 'level', t: 0, dur: 1200 }); popLabel(S.hero, 'level', 'LEVEL UP', 1200); burst(S.hero.px, S.hero.py - 10, '#ffe070', 14); }

    /* ---------- drawing ---------- */
    function camX() { return Math.round(S.cam.x); }
    function camY() { return Math.round(S.cam.y); }
    function drawScene(g) {
      if (!S || !g) return;
      try { drawSceneInner(g); } catch (e) { warn('drawScene', e); }
    }
    function drawSceneInner(g) {
      var m = M(), cx = camX(), cy = camY(), t = S.clock;
      if (!S.ground) S.ground = bakeGround(m, L);
      g.save(); g.translate(view.x, view.y); g.beginPath(); g.rect(0, 0, view.w, view.h); g.clip();
      g.imageSmoothingEnabled = false;
      g.fillStyle = VOID; g.fillRect(0, 0, view.w, view.h);
      if (S.ground) {
        var sx = Math.max(0, cx), sy = Math.max(0, cy), sw = Math.min(m.w * T - sx, view.w - (sx - cx)), sh = Math.min(m.h * T - sy, view.h - (sy - cy));
        if (sw > 0 && sh > 0) g.drawImage(S.ground, sx, sy, sw, sh, sx - cx, sy - cy, sw, sh);
      }
      g.translate(-cx, -cy);
      var x0 = Math.floor(cx / T) - 1, y0 = Math.floor(cy / T) - 1, x1 = Math.ceil((cx + view.w) / T) + 1, y1 = Math.ceil((cy + view.h) / T) + 2;
      var inWin = function (x, y) { return x >= x0 && y >= y0 && x <= x1 && y <= y1; };
      m.decor.forEach(function (dc) { if (typeof dc.kind === 'string' && ANIM_DECOR[dc.kind] && inWin(dc.x, dc.y)) drawDecor(g, dc, dc.x * T, dc.y * T, t); });
      // the stairs breathe a cold light
      if (m.stairs && inWin(m.stairs.x, m.stairs.y)) { var sa = 0.18 + 0.1 * Math.sin(t / 400); g.fillStyle = 'rgba(120,180,255,' + sa + ')'; g.fillRect(m.stairs.x * T + 4, m.stairs.y * T + 6, 8, 8); }
      var list = [];
      S.doors.forEach(function (d) { if (d.door && inWin(d.x, d.y)) list.push({ y: d.y * T + 1, d: function () { drawDoor(g, m, d, d.x * T, d.y * T, t); } }); });
      m.torches.forEach(function (tc, i) { if (inWin(tc.x, tc.y)) list.push({ y: tc.y * T + 2, d: function () { drawTorch(g, tc.x * T, tc.y * T, t, i * 0.37); } }); });
      S.chests.forEach(function (c) { if (inWin(c.x, c.y)) list.push({ y: c.y * T + 14, d: function () { g.fillStyle = 'rgba(8,4,16,0.5)'; g.fillRect(c.x * T + 2, c.y * T + 14, 13, 2); var sp = chestSprite(c.open); if (sp) g.drawImage(sp, c.x * T + 1, c.y * T + 3); if (!c.open && S.explored[c.y * m.w + c.x]) { var tw = Math.floor(t / 140 + c.x * 3) % 14; if (tw < 3) { g.fillStyle = '#fff8d0'; g.fillRect(c.x * T + 4 + tw * 3, c.y * T + 5, 1, 1); } } } }); });
      S.items.forEach(function (it) { if (!it.taken && inWin(it.x, it.y)) list.push({ y: it.y * T + 13, d: function () { var def = L.items[it.item], bob = Math.round(Math.sin(t / 320 + it.x) * 1); g.fillStyle = 'rgba(8,4,16,0.45)'; g.fillRect(it.x * T + 4, it.y * T + 13, 8, 1); if (def && typeof def.draw === 'function') safe(def.draw, [g, it.x * T + 8, it.y * T + 8 + bob, t], 'item.draw'); else { var sp = itemSprite(def); if (sp) g.drawImage(sp, it.x * T + 2, it.y * T + 3 + bob); } } }); });
      S.features.forEach(function (f) { if (inWin(f.x, f.y)) list.push({ y: f.y * T + 14, d: function () { if (f.kind === 'throne') drawThrone(g, f.x * T, f.y * T); else drawFountain(g, f.x * T, f.y * T, t, f.used); } }); });
      S.mons.forEach(function (mo) { if (!mo.gone && visible(mo.x, mo.y) && inWin(mo.x, mo.y)) list.push({ y: mo.py, d: function () { drawMonster(g, mo, t); } }); });
      var h = S.hero; list.push({ y: h.py + 0.5, d: function () { drawHero(g, h, t); } });
      list.sort(function (a, b) { return a.y - b.y; }).forEach(function (e) { e.d(); });
      drawFx(g, t, false);
      g.translate(cx, cy);
      drawLight(g, t, x0, y0, x1, y1);
      g.translate(-cx, -cy);
      drawFx(g, t, true);
      // HP bars over hurt, visible monsters and wake marks
      S.mons.forEach(function (mo) {
        if (mo.gone || mo.dying || !visible(mo.x, mo.y) || mo.boss) return;
        var a = anchorWorld(mo);
        if (mo.hp < mo.maxHp) { var bw = 12, bx = Math.round(mo.px - bw / 2), by = hpBarRect(mo).y + 1; g.fillStyle = OL; g.fillRect(bx - 1, by - 1, bw + 2, 4); g.fillStyle = '#3a1418'; g.fillRect(bx, by, bw, 2); g.fillStyle = '#ff4a4a'; g.fillRect(bx, by, Math.max(1, Math.round(bw * mo.hp / mo.maxHp)), 2); g.fillStyle = '#ffa0a0'; g.fillRect(bx, by, Math.max(1, Math.round(bw * mo.hp / mo.maxHp)), 1); }
      });
      drawNums(g);
      g.restore();
    }
    function shadow(g, x, y, w) { g.fillStyle = 'rgba(6,2,14,0.45)'; g.fillRect(Math.round(x - w / 2) + 1, Math.round(y) - 1, w - 2, 1); g.fillRect(Math.round(x - w / 2), Math.round(y), w, 1); g.fillRect(Math.round(x - w / 2) + 1, Math.round(y) + 1, w - 2, 1); }
    function lungeOff(e) { if (!e.lunge) return [0, 0]; var u = e.lunge.t / e.lunge.dur, k = Math.sin(Math.PI * clamp(u, 0, 1)) * (e.lunge.attack ? (e === S.hero ? (u < 0.35 ? -1 : 6) : (e.lunge.dx ? 7 : e.lunge.dy > 0 ? 0 : 2)) : 5), l = Math.sqrt(e.lunge.dx * e.lunge.dx + e.lunge.dy * e.lunge.dy) || 1; return [Math.round(e.lunge.dx / l * k), Math.round(e.lunge.dy / l * k)]; }
    function heroFrame(h) { return h.anim ? Math.floor(h.walk / 6) % 4 : 0; }
    function drawHero(g, h, t) {
      var lo = lungeOff(h), x = Math.round(h.px) + lo[0], y = Math.round(h.py) + lo[1];
      if (h.dead) { var u = clamp(h.dead / 1, 0, 1); g.globalAlpha = Math.max(0, 1 - (S.queue[0] ? S.queue[0].t / 1300 : 1)); }
      shadow(g, x, y, 10);
      var sw = swordPose(h), sp = heroSprite(h.dir, heroFrame(h), h.flash > 60);   // hit: the same sprite with a white rim (outline) for ~4 frames; body colours stay
      if (sw.behind) drawSword(g, x, y, sw);
      if (sp) g.drawImage(sp, x - 8, y - 17);
      if (!sw.behind) drawSword(g, x, y, sw);
      g.globalAlpha = 1;
    }
    function monFrame(mo, t) { var lk = mo.def.look; if (lk === 'bat') return Math.floor(t / 90 + mo.phase) % 4; if (lk === 'wisp' || lk === 'crown') return Math.floor(t / 160 + mo.phase) % 4; if (mo.anim) return 2 + Math.floor((mo.anim.t / mo.anim.dur) * 2) % 2; return Math.floor(t / 380 + mo.phase) % 2; }
    function monLift(mo, t) {
      var lk = lookOf(mo.def), fly = lk.fly || 0, lift = fly ? fly + Math.round(Math.sin(t / 260 + mo.phase) * 1.5) : 0;
      if (!fly && mo.anim) { var u = (mo.anim.t / mo.anim.dur) * (mo.anim.pts.length - 1) % 1; lift = Math.round(Math.sin(Math.PI * u) * 5); }
      return lift;
    }
    function drawMonster(g, mo, t) {
      var lk = lookOf(mo.def), lo = lungeOff(mo), sc = num(mo.def.size, 1), x = Math.round(mo.px) + lo[0], y = Math.round(mo.py) + lo[1], lift = monLift(mo, t);
      if (mo.dying) g.globalAlpha = clamp(1 - mo.dying / 520, 0, 1);
      shadow(g, x, y, Math.round(lk.w * 0.55 * sc));
      var f = mo.lunge && mo.lunge.attack ? 4 : monFrame(mo, t);
      if (typeof mo.def.draw === 'function') safe(mo.def.draw, [g, x, y - lift, { t: t, facing: mo.face, frame: f, flash: mo.flash > 60, scale: sc }], 'monster.draw');
      else {
        var sp = monsterSprite(mo.def, mo.face, f, false), spf = mo.flash > 60 ? monsterSprite(mo.def, mo.face, f, true) : null;
        if (sp) { var w = Math.round(lk.w * sc), hh = Math.round(lk.h * sc); g.drawImage(sp, x - Math.round(w / 2), y - hh - lift, w, hh); if (spf) { var ga = g.globalAlpha; g.globalAlpha = ga * 0.5; g.drawImage(spf, x - Math.round(w / 2), y - hh - lift, w, hh); g.globalAlpha = ga; } }
      }
      g.globalAlpha = 1;
    }
    function drawFx(g, t, above) {
      S.fx.forEach(function (f) {
        var u = f.t / f.dur; if (f.t < 0) return;
        var s = f.t / 1000;
        if (!above && f.kind === 'spark') { var px = Math.round(f.x + f.vx * s), py = Math.round(f.y + f.vy * s + (f.grav ? 120 * s * s : 40 * s * s)); g.fillStyle = f.col; g.globalAlpha = 1 - u * 0.6; g.fillRect(px, py, u < 0.5 ? 2 : 1, u < 0.5 ? 2 : 1); g.globalAlpha = 1; }
        else if (!above && f.kind === 'smoke') { var px2 = Math.round(f.x + f.vx * s), py2 = Math.round(f.y + f.vy * s); g.fillStyle = f.col; g.globalAlpha = 0.8 * (1 - u); var r = 1 + Math.round(u * 3); g.fillRect(px2 - r, py2 - r, r * 2, r * 2); g.globalAlpha = 1; }
        else if (above && f.kind === 'slash') {
          // a crescent of light pixels around the target, sweeping across in 3 frames
          var fr = Math.min(2, Math.floor(u * 3)), R2 = f.crit ? 10 : 8, base = f.ang - Math.PI / 2;
          g.fillStyle = fr === 2 ? 'rgba(255,240,200,0.5)' : f.crit ? '#ffe070' : '#ffffff';
          for (var i = 0; i < 9; i++) { var a = base + (i / 8) * Math.PI * (0.4 + fr * 0.3), rr = R2 - Math.abs(i - 4) * 0.6; var qx = Math.round(f.x - Math.cos(f.ang) * 2 + Math.cos(a) * rr), qy = Math.round(f.y - Math.sin(f.ang) * 2 + Math.sin(a) * rr * 0.8); g.fillRect(qx, qy, i > 2 && i < 7 ? 2 : 1, i > 2 && i < 7 ? 2 : 1); }
        }
        else if (above && f.kind === 'plus') { var py3 = Math.round(f.y - u * 12); g.globalAlpha = 1 - u; g.fillStyle = '#7aff8a'; g.fillRect(Math.round(f.x) - 1, py3, 3, 1); g.fillRect(Math.round(f.x), py3 - 1, 1, 3); g.globalAlpha = 1; }
        else if (above && f.kind === 'pop') { var def = L.items[f.item], sp = def && itemSprite(def); g.globalAlpha = clamp(2 - u * 2, 0, 1); if (sp) g.drawImage(sp, Math.round(f.x) - 6, Math.round(f.y - 6 - Math.min(1, u * 2.5) * 14)); g.globalAlpha = 1; }
        else if (above && f.kind === 'level') { var h = S.hero, a2 = 1 - u; g.globalAlpha = a2; for (var k2 = 0; k2 < 6; k2++) { var an = k2 / 6 * Math.PI * 2 + u * 2, rr2 = 6 + u * 16; g.fillStyle = '#ffe070'; g.fillRect(Math.round(h.px + Math.cos(an) * rr2), Math.round(h.py - 9 + Math.sin(an) * rr2 * 0.7), 2, 2); } g.globalAlpha = 1; }
      });
    }
    // light and fog: a 4 px grid over the view; unknown = black, explored = dim blue memory, visible = lantern + torches + glows
    var LG = null, LGD = null;
    var BAYER = [0, 2, 3, 1];
    function drawLight(g, t, x0, y0, x1, y1) {
      var m = M(), cx = camX(), cy = camY(), gx0 = Math.floor(cx / 4), gy0 = Math.floor(cy / 4), gw = Math.ceil(view.w / 4) + 2, gh = Math.ceil(view.h / 4) + 2;
      if (!LG || LG.width !== gw || LG.height !== gh) { LG = mkCanvas(gw, gh); if (!LG) return; LGD = LG.getContext('2d').createImageData(gw, gh); }
      var d = LGD.data, h = S.hero, hx = h.px, hy = h.py - 8, R = num(P.light, 6.5) * T * 1.2, flick = 1 + 0.035 * Math.sin(t / 70) + 0.02 * Math.sin(t / 23);
      var lights = [];
      m.torches.forEach(function (tc, i) { if (!S.vis[(tc.y + 1) * m.w + tc.x] && P.fog !== 'off') return; lights.push({ x: tc.x * T + 8, y: tc.y * T + 14, r: 5.2 * T * (1 + 0.05 * Math.sin(t / 60 + i * 2.1)), k: 0.95 }); });
      dynLights(false).forEach(function (l) { var mo = l.mon; if (mo && (mo.gone || !visible(mo.x, mo.y))) return; lights.push({ x: mo ? mo.px : l.tx * T + 8, y: mo ? mo.py - 8 : l.ty * T + 8, r: l.r * T, k: l.k }); });
      var fogOff = P.fog === 'off';
      for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) {
        var wx = (gx0 + i) * 4 + 2, wy = (gy0 + j) * 4 + 2, tx = Math.floor(wx / T), ty = Math.floor(wy / T), o = (j * gw + i) * 4;
        var inside = tx >= 0 && ty >= 0 && tx < m.w && ty < m.h, ti = ty * m.w + tx;
        if (!inside || (!S.explored[ti] && !fogOff)) { d[o] = 8; d[o + 1] = 6; d[o + 2] = 13; d[o + 3] = 255; continue; }
        var vis = S.vis[ti] || fogOff;
        if (!vis) { d[o] = 10; d[o + 1] = 9; d[o + 2] = 26; d[o + 3] = 214 + (BAYER[(i & 1) + (j & 1) * 2] * 4); continue; }
        var dd = Math.sqrt((wx - hx) * (wx - hx) + (wy - hy) * (wy - hy)), Lt = clamp(1.08 - dd / (R * flick), 0, 1);
        for (var q = 0; q < lights.length; q++) { var lq = lights[q], ex = wx - lq.x, ey = wy - lq.y; if (Math.abs(ex) > lq.r || Math.abs(ey) > lq.r) continue; var v = (1 - Math.sqrt(ex * ex + ey * ey) / lq.r) * lq.k; if (v > 0 && (S.torchLight[ti] > 0 || lq.k < 0.9)) Lt = Math.max(Lt, v * 1.1); }
        if (fogOff) Lt = Math.max(Lt, 0.55);
        var a = Math.pow(1 - clamp(Lt, 0, 1), 1.5) * 0.78, lv = Math.floor(a * 6 + BAYER[(i & 1) + (j & 1) * 2] / 4) / 6;
        d[o] = 10; d[o + 1] = 6; d[o + 2] = 20; d[o + 3] = Math.round(clamp(lv, 0, 0.9) * 255);
      }
      LG.getContext('2d').putImageData(LGD, 0, 0);
      g.save(); g.imageSmoothingEnabled = false;
      g.drawImage(LG, gx0 * 4 - cx, gy0 * 4 - cy, gw * 4, gh * 4);
      // warm glow over torch-lit and lantern-lit floor
      g.globalCompositeOperation = 'lighter';
      lights.concat([{ x: hx, y: hy, r: R * 0.7, k: 0.5, warm: 1 }]).forEach(function (l) {
        var lx = l.x - cx, ly = l.y - cy; if (lx < -l.r || ly < -l.r || lx > view.w + l.r || ly > view.h + l.r) return;
        var gr = g.createRadialGradient(lx, ly, 0, lx, ly, l.r * 0.75); gr.addColorStop(0, 'rgba(255,150,60,' + (0.11 * l.k) + ')'); gr.addColorStop(1, 'rgba(255,120,40,0)');
        g.fillStyle = gr; g.fillRect(lx - l.r, ly - l.r, l.r * 2, l.r * 2);
      });
      g.restore();
    }
    function anchorWorld(e) {
      if (e === S.hero) { var lo = lungeOff(e); return { x: e.px + lo[0], top: e.py + lo[1] - 18, w: 14, h: 18, footY: e.py + lo[1] }; }
      var lk = lookOf(e.def), sc = num(e.def.size, 1), lo2 = lungeOff(e), lift = monLift(e, S.clock), hh = Math.round(lk.h * sc), w = Math.round(lk.w * sc * (lk.fly ? 0.75 : 0.85));
      return { x: e.px + lo2[0], top: e.py + lo2[1] - hh - lift - (e.hp < e.maxHp && !e.boss ? 4 : 0), w: w, h: hh + lift, footY: e.py + lo2[1] };
    }
    function anchor(id) {
      if (!S) return null; var e = byId(id); if (!e) return null;
      var a = anchorWorld(e), ox = view.x - camX(), oy = view.y - camY();
      return { x: a.x + ox, top: a.top + oy, left: a.x + ox - a.w / 2, w: a.w, h: a.h, cy: a.top + oy + a.h / 2, footY: a.footY + oy, dead: e === S.hero ? !!e.dead : !!(e.dying || e.gone), hidden: e !== S.hero && !visible(e.x, e.y), tile: { x: e.x, y: e.y } };
    }
    function unitRects() {
      if (!S) return [];
      return [S.hero].concat(S.mons.filter(function (mo) { return !mo.gone && !mo.dying && visible(mo.x, mo.y); })).map(function (e) { var a = anchor(e.id); return { id: e.id, kind: e === S.hero ? 'hero' : e.kind, x: a.left, y: a.top, w: a.w, h: a.h }; });
    }

    /* ---------- HUD ---------- */
    function frame(g, x, y, w, h, o) {
      o = o || {};
      g.fillStyle = OL; g.fillRect(x + 1, y, w - 2, h); g.fillRect(x, y + 1, w, h - 2);
      g.fillStyle = o.bg || 'rgba(28,20,40,0.92)'; g.fillRect(x + 1, y + 1, w - 2, h - 2);
      g.fillStyle = o.rim || '#5c4a78'; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 4);
      g.fillStyle = '#2a2038'; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
      g.fillStyle = o.stud || '#d8a848'; [[x + 1, y + 1], [x + w - 3, y + 1], [x + 1, y + h - 3], [x + w - 3, y + h - 3]].forEach(function (p) { g.fillRect(p[0], p[1], 2, 2); });
      g.fillStyle = '#fff0c0'; g.fillRect(x + 1, y + 1, 1, 1);
      hudRects.push({ name: o.name || 'panel', x: x, y: y, w: w, h: h });
    }
    function bar(g, x, y, w, h, v, cols) {
      g.fillStyle = OL; g.fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle = cols[2]; g.fillRect(x, y, w, h);
      var fw = Math.round(w * clamp(v, 0, 1)); g.fillStyle = cols[0]; g.fillRect(x, y, fw, h); g.fillStyle = cols[1]; g.fillRect(x, y, fw, 1);
      if (h > 3) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + h - 1, fw, 1); }
    }
    function icon(g, kind, x, y) {
      if (kind === 'heart') { var rows = ['.oo.oo.', 'orrorRo', 'orrrrRo', '.orrRo.', '..oRo..', '...o...']; rows.forEach(function (r, j) { for (var i = 0; i < 7; i++) { var c = r.charAt(i); if (c === '.') continue; g.fillStyle = c === 'o' ? OL : c === 'r' ? '#ff5a5a' : '#b82a3a'; g.fillRect(x + i, y + j, 1, 1); } }); g.fillStyle = '#ffd0d0'; g.fillRect(x + 1, y + 1, 1, 1); return; }
      var def = kind === 'potion' ? L.items.potion || ITEMS.potion : ITEMS.coins, sp = itemSprite(def);
      if (sp) g.drawImage(sp, x - 2, y - 2);
    }
    function layout() {
      var w = view.w, h = view.h, compact = w < 300, L2 = {};
      L2.compact = compact;
      L2.stats = { x: 4, y: 4, w: compact ? 96 : 120, h: 29 };
      if (compact) { L2.floor = { x: w - 4 - 72, y: 4, w: 72, h: 14 }; L2.bag = { x: w - 4 - 72, y: 20, w: 72, h: 13 }; }
      else { L2.bag = { x: L2.stats.x + L2.stats.w + 3, y: 4, w: 74, h: 15 }; L2.floor = { x: w - 4 - 72, y: 4, w: 72, h: 15 }; }
      var mmOn = P.minimap !== 'off' && (!compact || h >= 200);
      if (mmOn) {
        var m = M(), maxW = compact ? 72 : Math.min(110, Math.round(w * 0.24)), maxH = compact ? 40 : Math.min(80, Math.round(h * 0.3)), s2 = Math.max(1, Math.min(2, Math.floor(Math.min(maxW / m.w, maxH / m.h) * 2) / 2));
        if (s2 < 1) s2 = 1;
        var mw = Math.min(maxW, Math.ceil(m.w * s2) + 4), mh = Math.min(maxH, Math.ceil(m.h * s2) + 4);
        L2.minimap = { x: w - 4 - mw, y: (compact ? L2.bag.y + L2.bag.h : L2.floor.y + L2.floor.h) + 3, w: mw, h: mh, s: s2 };
        if (L2.minimap.y + L2.minimap.h > h * 0.6) L2.minimap = null;
        else if (S && unitRects().some(function (u) { var mm = L2.minimap, ux = u.x - view.x, uy = u.y - view.y; return ux < mm.x + mm.w && ux + u.w > mm.x && uy < mm.y + mm.h && uy + u.h > mm.y; })) L2.minimap = null;   // never over a character
      }
      var lines = 3, lw = Math.min(w - 8, compact ? w - 8 : 270);
      L2.log = { x: 4, y: h - 4 - lines * 10, w: lw, h: lines * 10, lines: lines };
      var bossOn = S && S.mons.some(function (mo) { return mo.boss && mo.awake && !mo.gone && !mo.dying; });
      if (bossOn) { var bw = Math.min(compact ? w - 8 : 180, w - 8); L2.boss = { x: Math.round((w - bw) / 2), y: L2.log.y - 18, w: bw, h: 15 }; if (!compact) { L2.boss.y = h - 4 - 15; L2.log.w = Math.min(L2.log.w, L2.boss.x - 8); L2.log.lines = 3; } }
      if (S && S.banner) { var bw2 = Math.min(w - 16, 200); var topB = Math.max(L2.stats.y + L2.stats.h, L2.bag.y + L2.bag.h, compact && L2.minimap ? L2.minimap.y + L2.minimap.h : 0); L2.banner = { x: Math.round((w - bw2) / 2), y: Math.round(Math.max(topB + 6, h * 0.2)), w: bw2, h: 30 }; if (!compact && L2.minimap && L2.banner.x + bw2 > L2.minimap.x - 4) { bw2 = Math.max(120, L2.minimap.x - 8 - L2.banner.x); L2.banner.w = bw2; }
        // never over a character: if the hero or a visible monster is under the banner, put it just above the log
        // ... nor over a world text (number, LEVEL UP, wake mark)
        var wt = worldTexts(false).map(function (r) { return { x: r.x - view.x, y: r.y - view.y, w: r.w, h: r.h }; });
        var hit = function (b) { return unitRects().some(function (u) { var ux = u.x - view.x, uy = u.y - view.y; return ux < b.x + b.w && ux + u.w > b.x && uy < b.y + b.h && uy + u.h > b.y; }) || wt.some(function (u) { return u.x < b.x + b.w && u.x + u.w > b.x && u.y < b.y + b.h && u.y + u.h > b.y; }); };
        if (hit(L2.banner)) { var alt = { x: L2.banner.x, y: (L2.boss && compact ? L2.boss.y : L2.log.y) - 34, w: L2.banner.w, h: 30 }; if (!hit(alt)) L2.banner = alt; else L2.banner = null; } }
      return L2;
    }
    function wrap(s, maxW) {
      var words = String(s).split(' '), out = [], line = '';
      words.forEach(function (wd) { var c = line ? line + ' ' + wd : wd; if (measure(c) <= maxW || !line) line = c; else { out.push(line); line = wd; } });
      if (line) out.push(line);
      return out.map(function (l2) { return measure(l2) <= maxW ? l2 : clip(l2, maxW); });
    }
    // the message log as drawn: the newest messages, each wrapped to the log width, the last N lines
    function logLines(Ly) {
      Ly = Ly || layout(); var lg = Ly.log, out = [];
      S.msgs.slice(-lg.lines).forEach(function (mm, i, arr) { wrap(mm.text, lg.w - 2).forEach(function (l2) { out.push({ text: l2, color: mm.color, t: mm.t, newest: i === arr.length - 1 }); }); });
      return out.slice(-lg.lines);
    }
    function clip(s, maxW) { s = String(s); if (measure(s) <= maxW) return s; while (s.length > 1 && measure(s + '..') > maxW) s = s.slice(0, -1); return s + '..'; }
    function drawUI(g) {
      if (!S || !g) return;
      hudRects = [];
      try { drawUIInner(g); } catch (e) { warn('drawUI', e); }
    }
    function drawUIInner(g) {
      var h = S.hero, Ly = layout(), t = S.clock;
      g.save(); g.translate(view.x, view.y); g.imageSmoothingEnabled = false;
      // stats: hearts + HP bar + numbers, level + XP bar
      var st = Ly.stats; frame(g, st.x, st.y, st.w, st.h, { name: 'stats' });
      icon(g, 'heart', st.x + 5, st.y + 5);
      var hpTxt = h.hp + '/' + h.maxHp, bw = st.w - 15 - 5 - Math.max(measure(hpTxt), measure(h.maxHp + '/' + h.maxHp)) - 4;
      var low = h.hp <= h.maxHp * 0.3 && Math.floor(t / 300) % 2 === 0;
      bar(g, st.x + 15, st.y + 6, bw, 5, h.hp / h.maxHp, low ? ['#ff8a6a', '#ffd0b0', '#3a1418'] : ['#e8323a', '#ff8a7a', '#3a1418']);
      text(g, hpTxt, st.x + st.w - 5, st.y + 5, { align: 'right', color: low ? '#ffb0a0' : '#ffe8e0' });
      text(g, 'LV' + h.lvl, st.x + 5, st.y + 17, { color: '#ffe070' });
      bar(g, st.x + 25, st.y + 20, st.w - 31, 2, h.xp / xpNeed(h.lvl), ['#e8c050', '#fff0a0', '#2a2030']);
      // bag: tonics and gold
      var bg = Ly.bag; frame(g, bg.x, bg.y, bg.w, bg.h, { name: 'bag' });
      icon(g, 'potion', bg.x + 3, bg.y + 2 + (Ly.compact ? 0 : 1)); text(g, 'x' + h.potions, bg.x + 13, bg.y + 3 + (Ly.compact ? 0 : 1), { color: h.potions ? '#ffd8d8' : '#8a8098' });
      icon(g, 'coins', bg.x + 27, bg.y + 3 + (Ly.compact ? 0 : 1)); text(g, String(Math.min(99999, h.gold)), bg.x + bg.w - 4, bg.y + 3 + (Ly.compact ? 0 : 1), { align: 'right', color: '#ffe070' });
      // floor plate
      var fp = Ly.floor; frame(g, fp.x, fp.y, fp.w, fp.h, { name: 'floor', stud: '#7ac8ff' });
      text(g, (Ly.compact ? 'FL ' : 'FLOOR ') + S.floor + '/' + num(P.floors, 5), fp.x + fp.w / 2, fp.y + (Ly.compact ? 3 : 4), { align: 'center', color: '#c8e8ff' });
      if (Ly.minimap) drawMinimap(g, Ly.minimap, t);
      // boss bar
      if (Ly.boss) {
        var bs = S.mons.filter(function (mo) { return mo.boss; })[0], bb = Ly.boss;
        frame(g, bb.x, bb.y, bb.w, bb.h, { name: 'boss', stud: '#c08aff' });
        var nm = clip(bs.def.name, bb.w * 0.45); text(g, nm, bb.x + 5, bb.y + 4, { color: '#e0c8ff' });
        var bx = bb.x + 10 + measure(nm); bar(g, bx, bb.y + 6, bb.x + bb.w - 6 - bx, 3, bs.hp / bs.maxHp, ['#a050ff', '#e0b0ff', '#20102a']);
      }
      // message log: newest at the bottom, older lines fade
      var lg = Ly.log, shown = logLines(Ly);
      shown.forEach(function (mm, i) {
        var age = t - mm.t, a = clamp(1 - (age - 5000) / 1500, 0, 1) * (mm.newest ? 1 : 0.85);
        if (a <= 0) return; g.globalAlpha = a;
        text(g, mm.text, lg.x + 1, lg.y + (lg.lines - shown.length + i) * 10 + 1, { color: mm.color, outline: OL });
        g.globalAlpha = 1;
      });
      if (shown.length && shown.some(function (mm) { return t - mm.t < 6500; })) hudRects.push({ name: 'log', x: lg.x, y: lg.y, w: lg.w, h: lg.h });
      // floor banner
      if (Ly.banner && S.banner) {
        var bn = Ly.banner, u = S.banner.t, a2 = u < 300 ? u / 300 : u > 2100 ? Math.max(0, 1 - (u - 2100) / 500) : 1;
        g.globalAlpha = a2; frame(g, bn.x, bn.y, bn.w, bn.h, { name: 'banner', bg: '#150f1f' });
        g.fillStyle = '#d8a848'; g.fillRect(bn.x + 8, bn.y + 15, bn.w - 16, 1);
        text(g, S.banner.title, bn.x + bn.w / 2, bn.y + 4, { align: 'center', color: '#ffe070' });
        text(g, clip(S.banner.sub, bn.w - 12), bn.x + bn.w / 2, bn.y + 19, { align: 'center', color: '#e8dcf4' });
        g.globalAlpha = 1;
      }
      // full map
      if (mapOpen) {
        var mw = view.w - 24, mh = view.h - 40, m = M(), s3 = Math.max(1, Math.floor(Math.min(mw / m.w, mh / m.h))), rw = m.w * s3 + 8, rh = m.h * s3 + 20;
        var rx = Math.round((view.w - rw) / 2), ry = Math.round((view.h - rh) / 2);
        frame(g, rx, ry, rw, rh, { name: 'map' });
        text(g, 'FLOOR ' + S.floor + ' MAP', rx + rw / 2, ry + 4, { align: 'center', color: '#ffe070' });
        drawOverviewInner(g, { x: rx + 4, y: ry + 15, w: m.w * s3, h: m.h * s3 }, { s: s3 });
      }
      // fade between floors
      if (S.fade) { var fu = S.fade.t / S.fade.dur, fa = fu < 0.5 ? fu * 2 : (1 - fu) * 2; g.fillStyle = 'rgba(4,2,8,' + clamp(fa, 0, 1) + ')'; g.fillRect(0, 0, view.w, view.h); }
      g.restore();
    }
    var MMC = { 1: '#8a7aa6', 2: '#3e3456', 3: '#d0a860', 4: '#7ad8ff' };
    function drawMinimap(g, r, t) {
      frame(g, r.x, r.y, r.w, r.h, { name: 'minimap', bg: 'rgba(10,8,18,0.86)' });
      var m = M(), s = r.s, iw = r.w - 4, ih = r.h - 4, h = S.hero;
      var ox = clamp(Math.round(h.x * s - iw / 2), 0, Math.max(0, Math.ceil(m.w * s) - iw)), oy = clamp(Math.round(h.y * s - ih / 2), 0, Math.max(0, Math.ceil(m.h * s) - ih));
      if (!S.minimap || S.mmDirty || S.mmS !== s) {
        var c = S.minimap && S.mmS === s ? S.minimap : mkCanvas(Math.ceil(m.w * s), Math.ceil(m.h * s)); S.mmS = s; S.minimap = c;
        if (c) { var gg = c.getContext('2d'); gg.clearRect(0, 0, c.width, c.height); for (var i = 0; i < m.tiles.length; i++) { if (!S.explored[i]) continue; var tt = m.tiles[i]; if (!MMC[tt]) continue; gg.fillStyle = MMC[tt]; gg.fillRect(Math.floor((i % m.w) * s), Math.floor(((i / m.w) | 0) * s), Math.ceil(s), Math.ceil(s)); } }
        S.mmDirty = false;
      }
      g.save(); g.beginPath(); g.rect(r.x + 2, r.y + 2, iw, ih); g.clip();
      if (S.minimap) g.drawImage(S.minimap, r.x + 2 - ox, r.y + 2 - oy);
      S.chests.forEach(function (c2) { if (!c2.open && S.explored[c2.y * m.w + c2.x]) { g.fillStyle = '#ffd040'; g.fillRect(r.x + 2 - ox + Math.floor(c2.x * s), r.y + 2 - oy + Math.floor(c2.y * s), Math.max(1, Math.ceil(s)), Math.max(1, Math.ceil(s))); } });
      S.mons.forEach(function (mo) { if (!mo.gone && !mo.dying && visible(mo.x, mo.y)) { g.fillStyle = '#ff4a4a'; g.fillRect(r.x + 2 - ox + Math.floor(mo.x * s), r.y + 2 - oy + Math.floor(mo.y * s), Math.max(1, Math.ceil(s)), Math.max(1, Math.ceil(s))); } });
      if (Math.floor(t / 250) % 2 === 0 || true) { g.fillStyle = '#ffffff'; g.fillRect(r.x + 2 - ox + Math.floor(h.x * s) - (s < 2 ? 1 : 0), r.y + 2 - oy + Math.floor(h.y * s) - (s < 2 ? 1 : 0), Math.max(2, Math.ceil(s)), Math.max(2, Math.ceil(s))); }
      g.restore();
    }
    // the whole floor in a rect: o = {all: show unexplored too, graph: draw the room graph (spanning tree + loops), s: px per tile}
    function drawOverviewInner(g, r, o) {
      o = o || {}; var m = M(), s = o.s || Math.max(1, Math.min(r.w / m.w, r.h / m.h));
      g.save(); g.translate(r.x, r.y);
      for (var i = 0; i < m.tiles.length; i++) {
        var tt = m.tiles[i]; if (!MMC[tt] || (!o.all && !S.explored[i])) continue;
        var col = MMC[tt]; if (tt === 1 && m.room[i] >= 0) { var rt = m.rooms[m.room[i]].type; col = rt === 'throne' ? '#a070c0' : rt === 'shrine' ? '#7ab8d8' : rt === 'lair' ? '#b07a6a' : rt === 'crypt' ? '#8a8ab8' : rt === 'store' ? '#a08a70' : rt === 'flooded' ? '#6a9a8a' : '#8a7aa6'; }
        if (tt === 3) col = '#d0a860';
        g.fillStyle = col; g.fillRect(Math.floor((i % m.w) * s), Math.floor(((i / m.w) | 0) * s), Math.ceil(s), Math.ceil(s));
      }
      if (o.graph) {
        var ln = function (a, b, col) { var A = m.rooms[a], B = m.rooms[b]; g.strokeStyle = col; g.lineWidth = Math.max(1, s / 3); g.beginPath(); g.moveTo((A.cx + 0.5) * s, (A.cy + 0.5) * s); g.lineTo((B.cx + 0.5) * s, (B.cy + 0.5) * s); g.stroke(); };
        m.edges.mst.forEach(function (e) { ln(e[0], e[1], 'rgba(255,224,112,0.9)'); });
        m.edges.loops.forEach(function (e) { ln(e[0], e[1], 'rgba(120,220,255,0.9)'); });
        m.rooms.forEach(function (rm) { g.fillStyle = rm.start ? '#7aff8a' : '#ffe070'; g.fillRect(Math.round((rm.cx + 0.5) * s) - 1, Math.round((rm.cy + 0.5) * s) - 1, 3, 3); });
      }
      S.chests.forEach(function (c2) { if ((o.all || S.explored[c2.y * m.w + c2.x]) && !c2.open) { g.fillStyle = '#ffd040'; g.fillRect(Math.floor(c2.x * s), Math.floor(c2.y * s), Math.ceil(s), Math.ceil(s)); } });
      if (o.all) S.mons.forEach(function (mo) { if (!mo.gone && !mo.dying) { g.fillStyle = mo.boss ? '#d080ff' : '#ff5a5a'; g.fillRect(Math.floor(mo.x * s), Math.floor(mo.y * s), Math.ceil(s), Math.ceil(s)); } });
      g.fillStyle = '#ffffff'; g.fillRect(Math.floor(S.hero.x * s) - 1, Math.floor(S.hero.y * s) - 1, Math.ceil(s) + 2, Math.ceil(s) + 2);
      g.restore();
    }

    /* ---------- read-outs ---------- */
    function state() {
      if (!S) return null;
      var h = S.hero, m = M(), ex = 0, op = 0; for (var i = 0; i < m.tiles.length; i++) if (m.tiles[i] === FLOOR || m.tiles[i] === DOOR || m.tiles[i] === STAIRS) { op++; if (S.explored[i]) ex++; }
      return { seed: S.seed, floor: S.floor, floors: num(P.floors, 5), turn: S.turn, phase: S.phase, result: S.result, hp: h.hp, maxHp: h.maxHp, atk: h.atk, def: h.def, level: h.lvl, xp: h.xp,
        gold: h.gold, potions: h.potions, hero: { x: h.x, y: h.y }, kills: S.kills, chests: S.chestsOpened, monsters: S.mons.filter(function (mo) { return !mo.gone && !mo.dying; }).length,
        seen: S.mons.filter(function (mo) { return !mo.gone && !mo.dying && visible(mo.x, mo.y); }).length, explored: op ? Math.round(ex / op * 100) : 0, busy: !idle(), map: mapOpen, auto: autoOn };
    }
    function actors() {
      if (!S) return [];
      var ox = view.x - camX(), oy = view.y - camY(), h = S.hero, out = [];
      var side = h.dir === 'left' || h.dir === 'right';
      out.push({ id: 'hero', x: Math.round(h.px + lungeOff(h)[0]) + ox, y: Math.round(h.py) + oy, facing: side ? h.dir : h.face, target: side && h.target && byId(h.target) && visible(byId(h.target).x, byId(h.target).y) ? h.target : null,
        vx: side ? Math.round(h.vx) : 0, tile: [h.x, h.y], noFace: side ? undefined : 'top-down ' + h.dir + ' frame', hp: h.hp });
      S.mons.forEach(function (mo) {
        if (mo.gone || !visible(mo.x, mo.y)) return;
        out.push({ id: mo.id, kind: mo.kind, x: Math.round(mo.px + lungeOff(mo)[0]) + ox, y: Math.round(mo.py) + oy, facing: mo.face, target: mo.target, vx: Math.round(mo.vx), tile: [mo.x, mo.y], hp: mo.hp, awake: mo.awake, noFace: mo.dying ? 'dying' : undefined });
      });
      // a target that is not drawn facing-relevant (hero in an up / down frame) is reported as its x for the check
      out.forEach(function (a) { if (a.target === 'hero' && out[0].noFace) a.target = out[0].x; });
      return out;
    }
    var inst = {
      version: VERSION, lib: L, params: function () { return P; },
      start: start, update: update, drawScene: drawScene, drawUI: drawUI, key: key, pointer: pointer, setHeld: setHeld, setView: function (v) { setView(v); },
      setAuto: function (on) { autoOn = !!on; if (S) S.path = null; }, auto: function () { return autoOn; },
      setParams: function (o) { for (var kk in (o || {})) if (o[kk] != null && o[kk] !== '') P[kk] = o[kk]; if (S) { S.ground = null; computeFov(); } },
      addRoom: function (id, def) { if (def) { def.__id = id; L.rooms[id] = def; } return id; },
      addMonster: function (id, def) { if (def) { def.__id = id; L.monsters[id] = def; } return id; },
      addItem: function (id, def) { if (def) { def.__id = id; L.items[id] = def; } return id; },
      state: state, actors: actors, anchor: anchor, unitRects: unitRects,
      uiRects: function () { return hudRects.slice(); }, fieldRect: function () { return { x: view.x, y: view.y, w: view.w, h: view.h }; },
      map: function () { return S ? S.map : null; }, hero: function () { return S ? S.hero : null; }, monsters: function () { return S ? S.mons : []; },
      monster: function (id) { return S ? byId(id) : null; }, chests: function () { return S ? S.chests : []; }, items: function () { return S ? S.items : []; }, doors: function () { return S ? S.doors : []; },
      features: function () { return S ? S.features : []; }, explored: function () { return S ? S.explored : null; }, visibleAt: function (x, y) { return S ? visible(x, y) : false; },
      phase: function () { return S ? S.phase : 'none'; }, idle: function () { return !!S && idle(); }, rng: function () { return S ? S.fxr() : Math.random(); },
      clock: function () { return S ? S.clock : 0; }, camera: function () { return S ? { x: camX(), y: camY() } : { x: 0, y: 0 }; },
      toScreen: function (tx, ty) { return { x: tx * T + 8 - camX() + view.x, y: ty * T + 15 - camY() + view.y }; },
      mapOpen: function (on) { if (on != null) mapOpen = !!on; return mapOpen; },
      drawOverview: function (g, r, o) { if (S && g) { try { drawOverviewInner(g, r, o); } catch (e) { warn('drawOverview', e); } } },
      wait: function () { return key('wait'); }, act: function (dx, dy) { return idle() ? act(dx | 0, dy | 0) : false; },
      layout: function () { return S ? layout() : null; },
      say: function (txt, color) { msg(String(txt), color); }, logLines: function () { return S ? logLines() : []; }, numbers: function () { if (!S) return []; return numLayout().map(function (r) { return { key: r.f.n, id: r.f.id, text: r.f.text, style: r.f.style, amt: r.f.amt, tile: [r.f.tx, r.f.ty], x: r.x, y: r.y, w: r.w, h: r.h, a: r.a, covers: r.covers, cx0: r.f.cx0, tier: r.f.tier, kill: r.f.kill || 0, shown: P.numbers !== 'off' }; }); }, texts: function () { return worldTexts(true); }, numberObstacles: function () { if (!S) return []; var units = liveUnits(), o = []; units.forEach(function (e) { var a = anchorWorld(e), dy = e !== S.hero && e.dying ? true : undefined; o.push({ id: e.id, kind: 'head', x: Math.round(a.x - a.w / 2), y: Math.round(a.top), w: a.w, h: 7, dying: dy }); o.push({ id: e.id, kind: 'body', x: Math.round(a.x - a.w / 2), y: Math.round(a.top), w: a.w, h: Math.round(a.footY - a.top), dying: dy }); if (e !== S.hero && e.hp < e.maxHp && !e.boss && !e.dying) o.push(Object.assign(hpBarRect(e), { id: e.id, kind: 'bar' })); }); var bl = bladeRect(); if (bl) o.push(Object.assign(bl, { id: 'hero', kind: 'blade' })); return o; }
    };
    return inst;
  }

  /* ---------- the global ---------- */
  var API = {
    version: VERSION, create: create, generate: function (o) { o = o || {}; var p = {}, k; for (k in DEFAULTS) p[k] = DEFAULTS[k]; for (k in (o.params || {})) p[k] = o.params[k]; return generate({ seed: o.seed, floor: o.floor, floors: o.floors, params: p, rooms: lib(ROOMS, o.rooms), monsters: lib(MONSTERS, o.monsters), items: lib(ITEMS, o.items) }); },
    ROOMS: ROOMS, MONSTERS: MONSTERS, ITEMS: ITEMS, DEFAULTS: DEFAULTS, TILE: T, TILES: { ROCK: ROCK, FLOOR: FLOOR, WALL: WALL, DOOR: DOOR, STAIRS: STAIRS },
    text: text, measure: measure, wallPiece: wallPiece, bfs: bfs, fov: fov,
    drawMonster: function (g, def, x, footY, o) { o = o || {}; var sp = monsterSprite(def, o.facing || 'right', o.frame || 0, false), L2 = lookOf(def); if (sp) g.drawImage(sp, Math.round(x - L2.w / 2), Math.round(footY - L2.h)); },
    drawHero: function (g, x, footY, o) { o = o || {}; var dir = o.dir || 'down', h = { dir: dir, face: dir === 'left' ? 'left' : 'right', lunge: o.strike ? { dx: dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dy: dir === 'up' ? -1 : dir === 'down' ? 1 : 0, t: o.strike === 'wind' ? 10 : 150, dur: 230, attack: true } : null }, sw = swordPose(h), sp = heroSprite(dir, o.frame || 0, false); x = Math.round(x); footY = Math.round(footY); if (o.sword !== false && sw.behind) drawSword(g, x, footY, sw); if (sp) g.drawImage(sp, x - 8, footY - 17); if (o.sword !== false && !sw.behind) drawSword(g, x, footY, sw); },
    drawItem: function (g, def, x, y) { var sp = itemSprite(def); if (sp) g.drawImage(sp, Math.round(x) - 6, Math.round(y) - 5); }
  };
  root.GameDNA_DungeonFloors = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
