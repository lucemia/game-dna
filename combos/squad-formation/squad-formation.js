/* GameDNA A-12 \u00b7 Squad formation grid \u00b7 module v1 (plain script, no dependencies, one global: GameDNA_SquadFormation)
 *
 *   const sf = GameDNA_SquadFormation.create({
 *     view: { x: 0, y: 0, w: 256, h: 224 },             // native px the editor window lays out in (the whole screen)
 *     skin: 'pixel16',                                  // optional; drawn through GameDNA_Skin when skin-api.js is loaded
 *     params: { backGuard: 'on', backWeak: 1.25, backMelee: 0.5, face: 'up' },   // see DEFAULTS
 *     unit: { id: u => u.id, name: u => u.name, hp: u => u.hp, maxHp: u => u.maxHp, reach: u => u.reach, art: u => u.img },
 *     autoplay: () => AUTOPLAY,                          // the editor arranges and deploys by itself, deterministically
 *     onDone: squads => {}                               // called synchronously from key()/pointer()/update() when DEPLOY is confirmed
 *   });
 *   const party = sf.squad({ id: 'party', team: 'a', name: 'Vanguard', units: heroes });   // 2x3 grid; keeps slots by unit id
 *   sf.open(['party'])          // modal formation editor (keyboard, mouse, touch); sf.busy() is true until DEPLOY
 *   sf.key('up'|'down'|'left'|'right'|'ok'|'back'|'start')   // from the host's fixed step while busy
 *   sf.attach(canvas, { w: 256, h: 224 })   // optional: drag and drop with mouse / touch while the editor is open
 *   sf.update(dtMs); sf.draw(ctx)           // fixed step clock; native-resolution 2D context, last in the draw pass
 *   sf.rowOf(unit) -> 'front' | 'back'      sf.targetsFor(attacker, squad, reach) -> units the attacker may hit
 *   sf.hit(attacker, target, reach) -> { ok, mul, why }   sf.pickTarget(attacker, squad, reach) -> one unit
 *
 * Data model (shared with A-14 squad-clash): squad = { id, team, name, slots: [unit | null x 6] }, slot = row * 3 + col,
 * row 0 = front (faces the enemy), row 1 = back, col 0..2 = lane. Units are the host's own objects (never copied).
 */
(function (root) {
  'use strict';
  var VERSION = '1.2.1';
  var COLS = 3, ROWS = 2, SLOTS = 6, ROW_NAMES = ['front', 'back'];
  var DEFAULTS = { backGuard: 'on', backWeak: 1.25, backMelee: 0.5, frontMelee: 1, face: 'up', autoArrange: 'on', autoStepMs: 220, autoMs: 1800,
    dim: 0.55, tags: 'on', title: 'FORMATION', deploy: 'DEPLOY', cell: 0, scale: 0, openMs: 160, maxSquads: 4 };
  var REACHES = { melee: 1, ranged: 1, magic: 1 };

  /* ---------- 6x8 proportional font (the C-03 'regular' glyphs: '#' = ink, rows top -> bottom) ---------- */
  var REGULAR = {
    '!': '# # # # # . #', '%': '##... ##..# ...#. ..#.. .#... #..## ...##', "'": '# #',
    '(': '..# .#. #.. #.. #.. .#. ..#', ')': '#.. .#. ..# ..# ..# .#. #..', '*': '..... ..#.. #.#.# .###. #.#.# ..#..',
    '+': '..... ..#.. ..#.. ##### ..#.. ..#..', ',': '.. .. .. .. .. ## .# #.', '-': '.... .... .... ####', '.': '.. .. .. .. .. ## ##',
    '/': '....# ...#. ...#. ..#.. .#... .#... #....',
    '0': '.###. #...# #..## #.#.# ##..# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
    '2': '.###. #...# ....# ...#. ..#.. .#... #####', '3': '####. ....# ....# .###. ....# ....# ####.',
    '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.', '5': '##### #.... ####. ....# ....# #...# .###.',
    '6': '..##. .#... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. .#... .#... .#...',
    '8': '.###. #...# #...# .###. #...# #...# .###.', '9': '.###. #...# #...# .#### ....# ...#. .##..',
    ':': '.. ## ## .. .. ## ##', '<': '...# ..#. .#.. #... .#.. ..#. ...#', '=': '.... .... #### .... ####',
    '>': '#... .#.. ..#. ...# ..#. .#.. #...', '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
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
    'z': '.... .... #### ...# .##. #... ####', '\u25b2': '..... ..... ..#.. .###. #####', '\u25b6': '#.. ##. ### ##. #..', '\u25bc': '..... ..... ##### .###. ..#..',
    '\u00b7': '. . . # . . .', '\u00d7': '..... ..... #...# .#.#. ..#.. .#.#. #...#',
    '\ufffd': '##### #...# #...# #...# #...# #...# #####'
  };
  var GL = {};
  function glyph(ch) {
    if (GL[ch]) return GL[ch];
    var src = REGULAR[ch]; if (src == null) src = REGULAR['\ufffd'];
    var rows = src.split(' '), w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);
    return (GL[ch] = { rows: rows, w: w });
  }
  function advOf(ch) { return ch === ' ' ? 4 : glyph(ch).w + 1; }

  /* ---------- 7x7 icons ('#' = colour, rows top -> bottom) ---------- */
  var ICONS = {
    melee: ['.....##', '....###', '#..###.', '.####..', '..##...', '.#.#...', '#......'],
    ranged: ['##.....', '#.#....', '.#.#..#', '..#.##.', '...##..', '..#.#..', '.#.....'],
    magic: ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'],
    shield: ['#######', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
    warn: ['...#...', '..###..', '..#.#..', '.##.##.', '.#####.', '###.###', '#######']
  };

  /* ---------- built-in pixel16 look (used when skin-api.js is not loaded) ---------- */
  var WIN = {
    a: ['#3a64d8', '#2c50b8', '#223e96', '#1a2e74', '#a8c8ff', '#0a1238'],
    b: ['#d85a48', '#b8402e', '#922c26', '#6a1c1e', '#ffc8b8', '#2a0608'],
    n: ['#4c5a8a', '#3e4a76', '#323c62', '#262e4e', '#c8d4f4', '#0a0e22']
  };
  var FB = { ink: '#06061a', 'text.main': '#ffffff', 'text.shadow': '#0a0c24', 'text.accent': '#ffe070', 'text.dim': '#8088a8',
    'text.title': '#fff4c8', 'text.label': '#b8d0ff', 'team.a': '#4a8cff', 'team.b': '#ff5a48', 'team.n': '#c8c8d8',
    'ui.rivet': '#ffe070', 'ui.rivetShade': '#7a5410', 'ui.select': 'rgba(255,255,255,0.2)', 'ui.well': 'rgba(6,8,30,0.4)',
    'fx.heal': '#4ad870', 'fx.hot': '#ff9a3a', 'fx.crit': '#ffd23a', 'fx.cold': '#7ad8ff' };
  var CELL = { front: ['#4a3426', '#5e4430', '#2a1c14', '#7a5a3e'], back: ['#26304a', '#303c5c', '#141a2c', '#46567e'] };
  var ROW_COL = { front: '#ffb86a', back: '#8ac8ff' };
  var REACH_COL = { melee: '#ffd0a0', ranged: '#b8f0a0', magic: '#d8b0ff' };

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function inR(x, y, r) { return r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }
  function mkCanvas(w, h) { try { var c = root.document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; } catch (e) { return null; } }
  function easeOut(t) { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t) * (1 - t); }
  function easeOutBack(t) { t = clamp(t, 0, 1); var c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

  /* ---------- default unit readers (override any with options.unit) ---------- */
  var READ = {
    id: function (u) { return u.id != null ? u.id : u.name; },
    name: function (u) { return u.name != null ? String(u.name) : String(u.id != null ? u.id : '?'); },
    hp: function (u) { return u.hp; },
    maxHp: function (u) { return u.maxHp != null ? u.maxHp : u.hpMax != null ? u.hpMax : u.mhp != null ? u.mhp : u.hp; },
    alive: null,
    reach: function (u) { return u.reach; },
    prefer: function (u) { return u.prefer; },
    art: function (u) { return u.art || u.img || u.sprite || null; },
    kind: function (u) { return u.kind || u.cls || null; },
    team: function () { return null; },
    flip: function () { return false; }
  };
  function makeReader(over) {
    over = over || {};
    var F = {};
    for (var k in READ) F[k] = typeof over[k] === 'function' ? over[k] : READ[k];
    return F;
  }
  function safe(fn, u, d) { try { var v = fn(u); return v === undefined ? d : v; } catch (e) { return d; } }
  function aliveOf(F, u) {
    if (!u) return false;
    if (F.alive) return !!safe(F.alive, u, true);
    var h = safe(F.hp, u, null); return h == null || !isFinite(+h) ? true : +h > 0;
  }
  function reachOf(F, u, given) {
    var r = given || safe(F.reach, u, null);
    r = r == null ? 'melee' : String(r).toLowerCase();
    if (r === 'bow' || r === 'arrow' || r === 'range' || r === 'missile' || r === 'shot') r = 'ranged';
    if (r === 'spell' || r === 'mage' || r === 'magical') r = 'magic';
    return REACHES[r] ? r : 'melee';
  }

  /* ---------- pure rules (also exported as GameDNA_SquadFormation.rules(params, unitReaders)) ---------- */
  function normParams(p) {
    var P = {}, k;
    p = p || {};
    for (k in DEFAULTS) P[k] = p[k] != null && p[k] !== '' ? p[k] : DEFAULTS[k];
    for (k in DEFAULTS) if (typeof DEFAULTS[k] === 'number') P[k] = num(P[k], DEFAULTS[k]);
    P.backGuard = P.backGuard === false || P.backGuard === 'off' ? 'off' : 'on';
    P.backWeak = clamp(P.backWeak, 0.5, 3); P.backMelee = clamp(P.backMelee, 0, 2); P.frontMelee = clamp(P.frontMelee, 0.25, 3);
    if (!/^(up|down|left|right)$/.test(P.face)) P.face = 'up';         // 'auto' (or anything else) = 'up': the game picks left / right for side views
    P.autoArrange = P.autoArrange === false || P.autoArrange === 'off' ? 'off' : 'on';
    P.tags = P.tags === false || P.tags === 'off' ? 'off' : 'on';
    P.autoStepMs = clamp(P.autoStepMs, 30, 2000); P.autoMs = clamp(P.autoMs, 0, 20000); P.dim = clamp(P.dim, 0, 0.9);
    P.openMs = clamp(P.openMs, 0, 1000); P.cell = clamp(Math.round(P.cell), 0, 96); P.scale = clamp(Math.round(P.scale), 0, 8);
    P.maxSquads = clamp(Math.round(P.maxSquads), 1, 6);
    P.title = String(P.title); P.deploy = String(P.deploy);
    return P;
  }
  function slotIndex(squad, unit, F) {
    if (!squad || !squad.slots || !unit) return -1;
    var i, s = squad.slots;
    for (i = 0; i < SLOTS; i++) if (s[i] === unit) return i;
    var id = safe(F.id, unit, null); if (id == null) return -1;
    for (i = 0; i < SLOTS; i++) if (s[i] && safe(F.id, s[i], undefined) === id) return i;
    return -1;
  }
  function makeRules(params, readers) {
    var P = params && params.__norm ? params : normParams(params);
    var F = readers && readers.__reader ? readers : makeReader(readers);
    function frontAlive(squad) { var n = 0; for (var i = 0; i < COLS; i++) if (aliveOf(F, squad.slots[i])) n++; return n; }
    function members(squad, living) {
      var out = [];
      if (!squad || !squad.slots) return out;
      for (var i = 0; i < SLOTS; i++) {
        var u = squad.slots[i]; if (!u) continue;
        if (living && !aliveOf(F, u)) continue;
        out.push({ unit: u, slot: i, row: ROW_NAMES[i < COLS ? 0 : 1], col: i % COLS, alive: aliveOf(F, u) });
      }
      return out;
    }
    // aSlot (optional): the attacker's own slot; a back-row melee attacker with backMelee 0 gets [] (it cannot strike at all)
    function targetsFor(attacker, squad, reach, aSlot) {
      if (!squad || !squad.slots) return [];
      if (!canStrike(attacker, aSlot, reach).ok) return [];
      var r = reachOf(F, attacker, reach), guard = P.backGuard === 'on' && r === 'melee' && frontAlive(squad) > 0, out = [];
      for (var i = 0; i < SLOTS; i++) { var u = squad.slots[i]; if (u && aliveOf(F, u) && (!guard || i < COLS)) out.push(u); }
      return out;
    }
    function canStrike(attacker, aSlot, reach) {
      var r = reachOf(F, attacker, reach);
      if (aSlot != null && aSlot >= COLS && r === 'melee' && P.backMelee <= 0) return { ok: false, why: 'cannot strike in melee from the back row', reach: r };
      return { ok: true, why: '', reach: r };
    }
    // ok / mul / why for one blow; aSlot and tSlot are slot indices (-1 = not in a squad: no row effect)
    function modifier(attacker, aSlot, target, tSlot, targetSquad, reach) {
      var r = reachOf(F, attacker, reach), res = { ok: true, mul: 1, why: [], reach: r, row: tSlot < 0 ? null : ROW_NAMES[tSlot < COLS ? 0 : 1], cause: null };
      if (aSlot >= COLS && r === 'melee' && P.backMelee <= 0) { res.ok = false; res.mul = 0; res.cause = 'attacker'; res.why.push('cannot strike in melee from the back row'); return res; }
      if (tSlot >= COLS) {
        if (r === 'melee' && P.backGuard === 'on' && targetSquad && frontAlive(targetSquad) > 0) { res.ok = false; res.mul = 0; res.cause = 'guard'; res.why.push('back row is shielded from melee'); return res; }
        if (r !== 'melee' && P.backWeak !== 1) { res.mul *= P.backWeak; res.why.push('back row takes x' + P.backWeak + ' from ' + (r === 'magic' ? 'magic' : 'ranged')); }
        if (r === 'melee' && targetSquad && frontAlive(targetSquad) === 0) res.why.push('front row has fallen: back row exposed');
      } else if (tSlot >= 0 && r === 'melee' && P.frontMelee !== 1) { res.mul *= P.frontMelee; res.why.push('front row takes x' + P.frontMelee + ' from melee'); }
      if (aSlot >= COLS && r === 'melee') {
        if (P.backMelee <= 0) { res.ok = false; res.mul = 0; res.cause = 'attacker'; res.why = ['cannot strike in melee from the back row']; return res; }
        if (P.backMelee !== 1) { res.mul *= P.backMelee; res.why.push('melee from the back row x' + P.backMelee); }
      }
      res.mul = Math.round(res.mul * 1000) / 1000;
      return res;
    }
    function pickTarget(attacker, aSlot, squad, reach) {
      var list = targetsFor(attacker, squad, reach, aSlot); if (!list.length) return null;
      var lane = aSlot >= 0 ? aSlot % COLS : 1, best = null, bs = Infinity;
      for (var i = 0; i < list.length; i++) {
        var s = slotIndex(squad, list[i], F), d = Math.abs((s % COLS) - lane), hp = num(safe(F.hp, list[i], 0), 0);
        var score = d * 100000 + (s < COLS ? 0 : 50000) * (reachOf(F, attacker, reach) === 'melee' ? 1 : 0) + hp * 10 + s;
        if (score < bs) { bs = score; best = list[i]; }
      }
      return best;
    }
    // suggested slots: melee units front (sturdiest in the middle lane), ranged / magic back; existing order breaks ties
    function arrangeList(units) {
      var front = [], back = [], out = [null, null, null, null, null, null], i;
      units = (units || []).filter(Boolean);
      for (i = 0; i < units.length; i++) {
        var u = units[i], pref = safe(F.prefer, u, null);
        var want = pref === 'front' || pref === 'back' ? pref : reachOf(F, u) === 'melee' ? 'front' : 'back';
        (want === 'front' ? front : back).push(u);
      }
      var sturdy = function (a, b) { return num(safe(F.maxHp, b, 0), 0) - num(safe(F.maxHp, a, 0), 0); };
      front.sort(sturdy); back.sort(sturdy);
      while (front.length > COLS) back.unshift(front.pop());
      while (back.length > COLS) front.push(back.shift());
      if (!front.length && back.length > 1) front.push(back.shift());           // never leave the front row empty when it can be filled
      var order = [1, 0, 2];
      for (i = 0; i < front.length; i++) out[order[i]] = front[i];
      for (i = 0; i < back.length; i++) out[COLS + order[i]] = back[i];
      return out;
    }
    return { params: P, read: F, members: members, targetsFor: targetsFor, canStrike: canStrike, modifier: modifier, pickTarget: pickTarget, frontAlive: frontAlive,
      arrangeList: arrangeList, slotIndex: function (squad, unit) { return slotIndex(squad, unit, F); } };
  }

  /* ---------- the instance ---------- */
  function create(o) {
    o = o || {};
    var API = root.GameDNA_Skin || null, SK = null;
    if (o.skin !== false) { try { SK = API && API.resolve ? API.resolve(o.skin) : null; } catch (e) { SK = null; } }
    var P = normParams(o.params); P.__norm = true;
    var F = makeReader(o.unit || o.fields); F.__reader = true;
    var R = makeRules(P, F);
    var SQ = [], warned = {}, clock = 0, lastCanvas = null, drawnRects = [], detach = null;
    var E = null;                      // the open editor
    var ST = { opens: 0, deploys: 0, autos: 0, moves: 0, swaps: 0, refused: 0, picks: 0, drops: 0, cancels: 0, drags: 0, keys: 0, taps: 0,
      targetCalls: 0, hitCalls: 0, blocked: 0, rowCalls: 0, updates: 0, draws: 0, errors: 0, warnings: 0 };

    function dbg(e) { if (typeof o.debug === 'function') { try { o.debug(e); } catch (x) { } } }
    function warnOnce(key, msg) { if (warned[key]) return; warned[key] = 1; ST.warnings++; try { if (root.console) console.warn('GameDNA_SquadFormation: ' + msg); } catch (e) { } }
    function call(fn, a, b, c) { if (typeof fn === 'function') { try { return fn(a, b, c); } catch (x) { ST.errors++; warnOnce('cb', 'a host callback threw: ' + x); } } return undefined; }
    function setParams(p) {
      var keep = {}, k; for (k in DEFAULTS) keep[k] = P[k];
      if (p) for (k in p) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) keep[k] = p[k];
      var N = normParams(keep); for (k in N) P[k] = N[k]; P.__norm = true;
      if (E) E.layout = null;
    }

    /* ----- squads ----- */
    function findSquad(id) { for (var i = 0; i < SQ.length; i++) if (SQ[i].id === id) return SQ[i]; return null; }
    function asSquad(x) {
      if (!x) return null;
      if (x.slots && x.slots.length === SLOTS) return x;
      if (typeof x === 'string' || typeof x === 'number') return findSquad(x);
      return squadOf(x);
    }
    function squadOf(unit) {
      if (!unit) return null;
      var i, j;
      for (i = 0; i < SQ.length; i++) for (j = 0; j < SLOTS; j++) if (SQ[i].slots[j] === unit) return SQ[i];
      var id = safe(F.id, unit, null); if (id == null) return null;
      for (i = 0; i < SQ.length; i++) for (j = 0; j < SLOTS; j++) if (SQ[i].slots[j] && safe(F.id, SQ[i].slots[j], undefined) === id) return SQ[i];
      return null;
    }
    // squad({id, team, name, units, slots?}): create or refresh. Units already seated in a squad with this id (matched by
    // reference or unit id) keep their slot; others take `slots[i]` if given and free, else the suggested slot, else any free slot.
    function squad(spec) {
      spec = spec || {};
      var id = spec.id != null ? spec.id : 'squad' + (SQ.length + 1);
      var old = findSquad(id), units = (spec.units || []).filter(Boolean).slice(0, SLOTS), slots = [null, null, null, null, null, null];
      var placed = [], i, s;
      if (spec.slots && spec.slots.length === SLOTS && !spec.units) { for (i = 0; i < SLOTS; i++) slots[i] = spec.slots[i] || null; units = slots.filter(Boolean); placed = units.slice(); }
      for (i = 0; i < units.length; i++) {
        if (placed.indexOf(units[i]) >= 0) continue;
        s = old ? slotIndex(old, units[i], F) : -1;
        if (s >= 0 && !slots[s]) { slots[s] = units[i]; placed.push(units[i]); }
      }
      for (i = 0; i < units.length; i++) {
        if (placed.indexOf(units[i]) >= 0) continue;
        var want = spec.slots ? spec.slots[units.indexOf(units[i])] : null;
        if (want != null && want >= 0 && want < SLOTS && !slots[want]) { slots[want] = units[i]; placed.push(units[i]); }
      }
      var rest = units.filter(function (u) { return placed.indexOf(u) < 0; });
      if (rest.length) {
        var sug = R.arrangeList(rest);
        for (i = 0; i < SLOTS; i++) if (sug[i] && !slots[i]) { slots[i] = sug[i]; placed.push(sug[i]); }
        for (i = 0; i < rest.length; i++) if (placed.indexOf(rest[i]) < 0) for (s = 0; s < SLOTS; s++) if (!slots[s]) { slots[s] = rest[i]; placed.push(rest[i]); break; }
      }
      var sq = old || { id: id };
      sq.team = spec.team || (old && old.team) || 'a'; sq.name = spec.name != null ? String(spec.name) : (old && old.name) || String(id);
      sq.slots = slots;
      if (spec.data !== undefined) sq.data = spec.data;
      if (!old) SQ.push(sq);
      dbg({ event: 'squad', id: id, count: placed.length });
      return sq;
    }
    function removeSquad(id) { for (var i = 0; i < SQ.length; i++) if (SQ[i].id === id) { SQ.splice(i, 1); return true; } return false; }
    function slotOf(unit) { var sq = squadOf(unit); return sq ? slotIndex(sq, unit, F) : -1; }
    function rowOf(unit) { ST.rowCalls++; var s = slotOf(unit); return s < 0 ? null : ROW_NAMES[s < COLS ? 0 : 1]; }
    function colOf(unit) { var s = slotOf(unit); return s < 0 ? null : s % COLS; }
    function targetsFor(attacker, sq, reach) {
      ST.targetCalls++;
      var target = asSquad(sq); if (!target) { warnOnce('tsq', 'targetsFor(): unknown squad ' + sq); return []; }
      return R.targetsFor(attacker, target, reach, slotOf(attacker));
    }
    function canStrike(attacker, reach) { var c = R.canStrike(attacker, slotOf(attacker), reach); c.row = rowOf(attacker); return c; }
    function pickTarget(attacker, sq, reach) {
      ST.targetCalls++;
      var target = asSquad(sq); if (!target) return null;
      return R.pickTarget(attacker, slotOf(attacker), target, reach);
    }
    function hit(attacker, target, reach) {
      ST.hitCalls++;
      var tsq = squadOf(target), res = R.modifier(attacker, slotOf(attacker), target, tsq ? slotIndex(tsq, target, F) : -1, tsq, reach);
      if (!res.ok) ST.blocked++;
      dbg({ event: 'hit', reach: res.reach, ok: res.ok, mul: res.mul, row: res.row, aRow: rowOf(attacker) });
      return res;
    }
    function usable(unit, need) {
      var want = need && typeof need === 'object' ? need.row : need, row = rowOf(unit);
      if (!want || want === 'any' || !row) return { ok: true, row: row, why: '' };
      return row === want ? { ok: true, row: row, why: '' } : { ok: false, row: row, why: 'only from the ' + want + ' row' };
    }
    function move(unit, sqx, slot) {      // programmatic move / swap (never empties a squad)
      var to = asSquad(sqx), from = squadOf(unit); if (!to || !from || slot < 0 || slot >= SLOTS) return false;
      return doMove(from, slotIndex(from, unit, F), to, slot, 'api');
    }
    function doMove(fromSq, fs, toSq, ts, how) {
      if (!fromSq || !toSq || fs < 0) return false;
      if (fromSq === toSq && fs === ts) return true;
      var a = fromSq.slots[fs], b = toSq.slots[ts];
      if (!a) return false;
      if (fromSq !== toSq && !b && fromSq.slots.filter(Boolean).length <= 1) { ST.refused++; dbg({ event: 'refuse', why: 'empty-squad' }); return false; }
      toSq.slots[ts] = a; fromSq.slots[fs] = b || null;
      if (b) ST.swaps++; else ST.moves++;
      dbg({ event: b ? 'swap' : 'move', how: how, from: [fromSq.id, fs], to: [toSq.id, ts], unit: safe(F.id, a, null), other: b ? safe(F.id, b, null) : null });
      if (E) { animLand(toSq, ts, fromSq, fs, !!b); }
      return true;
    }
    function arrange(sqx) {
      var sq = asSquad(sqx); if (!sq) return null;
      var sug = R.arrangeList(sq.slots.filter(Boolean)); sq.slots = sug; return sq;
    }
    function spot(unit, area) {    // where a unit stands in a squad area {x, y, w, h, face}: the cell centre
      var s = slotOf(unit); if (s < 0 || !area) return null;
      var face = area.face || P.face, row = s < COLS ? 0 : 1, col = s % COLS, gx, gy, cw, ch;
      if (face === 'left' || face === 'right') { gx = face === 'left' ? row : 1 - row; gy = col; cw = area.w / 2; ch = area.h / 3; }
      else { gx = col; gy = face === 'up' ? row : 1 - row; cw = area.w / 3; ch = area.h / 2; }
      return { x: Math.round(area.x + (gx + 0.5) * cw), y: Math.round(area.y + (gy + 0.5) * ch), row: ROW_NAMES[row], col: col, slot: s };
    }

    /* ----- skin / text / primitives ----- */
    function tok(path) {
      if (SK) { try { var v = SK.lookup ? SK.lookup(path) : API.token(SK, path); if (v != null && typeof v !== 'object') return v; } catch (e) { } }
      return FB[path] || null;
    }
    function pixelSkin() { return !SK || SK.pixel !== false; }
    var GC = {};
    function glyphImg(ch, col) {
      var key = ch + '|' + col; if (GC[key] !== undefined) return GC[key];
      var G = glyph(ch), c = mkCanvas(G.w, 8), g = c && c.getContext('2d');
      if (!g) return (GC[key] = null);
      g.fillStyle = col;
      for (var r = 0; r < G.rows.length; r++) for (var x = 0; x < G.rows[r].length; x++) if (G.rows[r][x] === '#') g.fillRect(x, r, 1, 1);
      return (GC[key] = c);
    }
    function blit(ctx, ch, x, y, col, k) {
      var img = glyphImg(ch, col);
      if (img) { ctx.drawImage(img, x, y, img.width * k, img.height * k); return; }
      var G = glyph(ch); ctx.fillStyle = col;
      for (var r = 0; r < G.rows.length; r++) for (var c = 0; c < G.rows[r].length; c++) if (G.rows[r][c] === '#') ctx.fillRect(x + c * k, y + r * k, k, k);
    }
    var MW = {};
    function textW(s, k) {
      s = String(s == null ? '' : s); k = k || 1;
      if (!pixelSkin()) { var key = k + '|' + s; if (MW[key] == null) { try { MW[key] = Math.ceil(+SK.measure(s, { font: 'ui', scale: k }) || 0); } catch (e) { MW[key] = 0; } } return MW[key]; }
      var w = 0; for (var i = 0; i < s.length; i++) w += advOf(s[i]); return Math.max(0, w - 1) * k;
    }
    function text(ctx, s, x, y, col, align, k) {
      s = String(s == null ? '' : s); col = col || tok('text.main') || '#ffffff'; k = k || 1;
      var w = textW(s, k), x0 = align === 'right' ? x - w : align === 'center' ? Math.round(x - w / 2) : x;
      if (!pixelSkin()) { try { SK.text(ctx, s, x0, y, { font: 'ui', color: col, scale: k }); } catch (e) { } return w; }
      var sh = tok('text.shadow') || '#0a0c24', cx, i, pa = ctx.globalAlpha;
      for (var pass = 0; pass < 2; pass++) { cx = x0; for (i = 0; i < s.length; i++) { if (s[i] !== ' ') blit(ctx, s[i], cx + (pass ? 0 : k), y + (pass ? 0 : k), pass ? col : sh, k); cx += advOf(s[i]) * k; } }
      ctx.globalAlpha = pa;
      return w;
    }
    function fit(s, maxW, k) { s = String(s); if (textW(s, k) <= maxW) return s; while (s.length > 1 && textW(s + '.', k) > maxW) s = s.slice(0, -1); return s + '.'; }
    function frame16(ctx, r, team) {
      var x = r.x, y = r.y, w = r.w, h = r.h, C = WIN[team] || WIN.a, i, pa = ctx.globalAlpha;
      if (w < 6 || h < 6) { ctx.fillStyle = FB.ink; ctx.fillRect(x, y, w, h); return; }
      ctx.globalAlpha = pa * 0.95;
      for (i = 0; i < h - 2; i++) { ctx.fillStyle = C[Math.min(3, Math.floor(i / (h - 2) * 4))]; ctx.fillRect(x + 1, y + 1 + i, w - 2, 1); }
      ctx.globalAlpha = pa; ctx.fillStyle = FB.ink;
      ctx.fillRect(x + 2, y, w - 4, 1); ctx.fillRect(x + 2, y + h - 1, w - 4, 1); ctx.fillRect(x, y + 2, 1, h - 4); ctx.fillRect(x + w - 1, y + 2, 1, h - 4);
      ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + w - 2, y + 1, 1, 1); ctx.fillRect(x + 1, y + h - 2, 1, 1); ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
      ctx.fillStyle = C[4]; ctx.fillRect(x + 2, y + 1, w - 4, 1); ctx.fillRect(x + 1, y + 2, 1, h - 5);
      ctx.fillStyle = C[5]; ctx.fillRect(x + 2, y + h - 2, w - 4, 1); ctx.fillRect(x + w - 2, y + 2, 1, h - 4);
      if (h >= 12 && w >= 12) [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]].forEach(function (p) { ctx.fillStyle = FB['ui.rivetShade']; ctx.fillRect(p[0], p[1], 2, 2); ctx.fillStyle = FB['ui.rivet']; ctx.fillRect(p[0], p[1], 1, 1); });
    }
    function frame(ctx, r, role, team, st) {
      if (SK) { try { SK.frame(ctx, r, { role: role, team: team, focus: st && st.focus, alert: st && st.alert, disabled: st && st.disabled }); return; } catch (e) { } }
      if (role === 'row') { ctx.fillStyle = FB['ui.select']; ctx.fillRect(r.x, r.y, r.w, r.h); return; }
      if (role === 'backing') { ctx.fillStyle = FB['ui.well']; ctx.fillRect(r.x, r.y, r.w, r.h); return; }
      frame16(ctx, r, team);
    }
    function bar(ctx, x, y, w, h, frac, col) {
      ctx.fillStyle = tok('ink') || FB.ink; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = '#2a2236'; ctx.fillRect(x, y, w, h);
      var f = Math.round(w * clamp(frac, 0, 1)); if (f > 0) { ctx.fillStyle = col; ctx.fillRect(x, y, f, h); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y, f, 1); }
    }
    function icon(ctx, name, x, y, col, k, ink) {
      var I = ICONS[name]; if (!I) return; k = k || 1;
      var pass, r, c;
      for (pass = 0; pass < 2; pass++) {
        if (pass === 0 && ink === false) continue;
        ctx.fillStyle = pass ? col : (ink || tok('ink') || FB.ink);
        for (r = 0; r < I.length; r++) for (c = 0; c < I[r].length; c++) if (I[r][c] === '#') {
          if (pass) ctx.fillRect(x + c * k, y + r * k, k, k);
          else { ctx.fillRect(x + (c - 1) * k, y + r * k, k, k); ctx.fillRect(x + (c + 1) * k, y + r * k, k, k); ctx.fillRect(x + c * k, y + (r - 1) * k, k, k); ctx.fillRect(x + c * k, y + (r + 1) * k, k, k); }
        }
      }
    }
    function teamCol(team) { return tok('team.' + (team || 'a')) || FB['team.' + (team || 'a')] || FB['team.a']; }
    // a unit's picture in a box: the host's art (integer-scaled on pixel canvases), else the skin's token, else a built-in figure
    function drawUnitArt(ctx, u, team, bx, by, bw, bh, alive, flip) {
      var img = safe(F.art, u, null);
      if (img && typeof img === 'object' && img.normal && img.normal.width) img = img.normal;      // {normal, white, grey} bake sets
      var iw = img && (img.width || img.naturalWidth), ih = img && (img.height || img.naturalHeight);
      var pa = ctx.globalAlpha;
      if (!alive) ctx.globalAlpha = pa * 0.45;
      if (iw > 0 && ih > 0) {
        var s = Math.min(bw / iw, bh / ih); if (pixelSkin() || !ctx.imageSmoothingEnabled) s = s >= 1 ? Math.floor(s) : s;
        var dw = Math.max(1, Math.round(iw * s)), dh = Math.max(1, Math.round(ih * s)), dx = Math.round(bx + (bw - dw) / 2), dy = Math.round(by + bh - dh);
        try {
          if (flip) { ctx.save(); ctx.translate(dx + dw, dy); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, dw, dh); ctx.restore(); }
          else ctx.drawImage(img, dx, dy, dw, dh);
        } catch (e) { warnOnce('art', 'unit art could not be drawn'); }
      } else if (SK && typeof SK.unitToken === 'function') {
        try { SK.unitToken(ctx, { x: bx, y: by, w: bw, h: bh }, { team: team || 'a', kind: kindFor(u), dead: !alive, facing: flip ? -1 : 1 }, clock / 1000); } catch (e) { }
      } else {
        var cx = Math.round(bx + bw / 2), base = Math.round(by + bh), hgt = Math.max(8, Math.round(bh * 0.8)), wd = Math.max(5, Math.round(hgt * 0.45));
        ctx.fillStyle = FB.ink; ctx.fillRect(cx - (wd >> 1) - 1, base - hgt - 1, wd + 2, hgt + 1);
        ctx.fillStyle = teamCol(team); ctx.fillRect(cx - (wd >> 1), base - Math.round(hgt * 0.62), wd, Math.round(hgt * 0.62));
        ctx.fillStyle = '#e8b890'; ctx.fillRect(cx - (wd >> 1) + 1, base - hgt, wd - 2, Math.round(hgt * 0.36));
        ctx.fillStyle = REACH_COL[reachOf(F, u)]; ctx.fillRect(cx + (wd >> 1) + 1, base - hgt, 1, hgt - 2);
      }
      ctx.globalAlpha = pa;
    }
    function flipOf(u) { return !!safe(F.flip, u, false); }
    function kindFor(u) { var k = safe(F.kind, u, null); if (k) return k; var r = reachOf(F, u); return r === 'ranged' ? 'archer' : r === 'magic' ? 'mage' : 'knight'; }

    /* ----- in-world helpers ----- */
    // drawTag: a small row badge (front = warm shield, back = cool reach icon) with its top-left at x, y
    function drawTag(ctx, unit, x, y, opts) {
      if (P.tags === 'off' || !ctx) return null;
      try {
        var row = rowOf(unit); if (!row) return null; var k = (opts && opts.scale) || 1;
        var name = row === 'front' ? 'shield' : reachOf(F, unit);
        icon(ctx, name, Math.round(x), Math.round(y), ROW_COL[row], k);
        return { x: x - k, y: y - k, w: 9 * k, h: 9 * k };
      } catch (e) { ST.errors++; return null; }
    }
    // drawPips: a 2x3 mini map of a squad (alive / fallen / empty), top-left at x, y; size 11 x 7 per scale
    function drawPips(ctx, sqx, x, y, opts) {
      var sq = asSquad(sqx); if (!sq || !ctx) return null;
      try {
        var k = (opts && opts.scale) || 1, face = (opts && opts.face) || P.face, side = face === 'left' || face === 'right';
        var gw = side ? 2 : 3, gh = side ? 3 : 2, w = (gw * 3 + 1) * k, h = (gh * 3 + 1) * k;
        x = Math.round(x); y = Math.round(y);
        ctx.fillStyle = tok('ink') || FB.ink; ctx.fillRect(x, y, w, h);
        for (var s = 0; s < SLOTS; s++) {
          var row = s < COLS ? 0 : 1, col = s % COLS, gx, gy;
          if (side) { gx = face === 'left' ? row : 1 - row; gy = col; } else { gx = col; gy = face === 'up' ? row : 1 - row; }
          var u = sq.slots[s], px = x + (1 + gx * 3) * k, py = y + (1 + gy * 3) * k;
          ctx.fillStyle = !u ? '#2a2a3a' : aliveOf(F, u) ? (row === 0 ? '#ffd8a8' : teamCol(sq.team)) : '#5a3030';
          ctx.fillRect(px, py, 2 * k, 2 * k);
        }
        return { x: x, y: y, w: w, h: h };
      } catch (e) { ST.errors++; return null; }
    }
    // drawGuards: over the units an attack cannot reach (shield) and the back-row units it hits harder (xN), given their screen boxes
    function drawGuards(ctx, attacker, sqx, reach, boxOf) {
      var sq = asSquad(sqx); if (!sq || !ctx) return 0;
      var n = 0;
      try {
        for (var s = 0; s < SLOTS; s++) {
          var u = sq.slots[s]; if (!u || !aliveOf(F, u)) continue;
          var res = R.modifier(attacker, slotOf(attacker), u, s, sq, reach), b = call(boxOf, u); if (!b) continue;
          if (b.length === 4) b = { x: b[0], y: b[1], w: b[2], h: b[3] };
          var bob = (Math.floor(clock / 250) % 2);
          if (!res.ok && res.cause === 'attacker') break;      // the attacker itself cannot strike: nothing to mark on the targets
          if (!res.ok) { icon(ctx, 'shield', Math.round(b.x + b.w / 2 - 3), Math.round(b.y - 10 - bob), ROW_COL.back); n++; }
          else if (res.mul > 1) { text(ctx, '\u00d7' + res.mul, Math.round(b.x + b.w / 2), Math.round(b.y - 10 - bob), tok('fx.hot') || FB['fx.hot'], 'center'); n++; }
        }
      } catch (e) { ST.errors++; }
      return n;
    }

    /* ----- editor ----- */
    function viewRect(ctx) {
      var v = o.view; if (typeof v === 'function') v = call(v);
      if (v && !(v.w > 0) && v.width > 0) v = { x: 0, y: 0, w: v.width, h: v.height };
      if (!v || !(v.w > 0) || !(v.h > 0)) { var c = (ctx && ctx.canvas) || lastCanvas; v = c ? { x: 0, y: 0, w: c.width, h: c.height } : { x: 0, y: 0, w: 256, h: 224 }; }
      return { x: num(v.x, 0), y: num(v.y, 0), w: v.w, h: v.h };
    }
    function open(list, opts) {
      opts = opts || {};
      var sqs = [];
      if (list == null) list = SQ.filter(function (q) { return q.team === 'a'; });
      if (!Array.isArray(list)) list = [list];
      for (var i = 0; i < list.length && sqs.length < P.maxSquads; i++) { var q = asSquad(list[i]); if (q && sqs.indexOf(q) < 0) sqs.push(q); }
      if (!sqs.length) { warnOnce('open', 'open(): no squads to edit (call squad() first)'); return false; }
      var auto = !!(opts.auto != null ? opts.auto : call(o.autoplay));
      E = { squads: sqs, t: 0, title: opts.title || P.title, onDone: opts.onDone, layout: null, cur: { sq: 0, slot: -1, deploy: true }, held: null, drag: null,
        glide: null, lands: [], buzz: 0, auto: auto, script: null, nextAuto: 0, closing: 0, focusMs: 0, hover: null, before: snapshot(sqs), enemy: null };
      if (opts.enemy != null) { var en = asSquad(opts.enemy); if (en && sqs.indexOf(en) < 0) E.enemy = en; }
      var c0 = firstUnitSlot(sqs[0]); if (!auto && c0 >= 0 && opts.cursor === 'unit') E.cur = { sq: 0, slot: c0, deploy: false };
      if (auto) { E.script = autoScript(); ST.autos++; }
      ST.opens++;
      dbg({ event: 'open', squads: sqs.map(function (q) { return q.id; }), auto: auto });
      return true;
    }
    function snapshot(sqs) { return sqs.map(function (q) { return q.slots.slice(); }); }
    function firstUnitSlot(sq) { for (var i = 0; i < SLOTS; i++) if (sq.slots[i]) return i; return -1; }
    function busy() { return !!E; }
    function finish(how) {
      if (!E) return;
      if (E.held) dropBack();
      var done = E, sqs = done.squads;
      E = null; ST.deploys++;
      var changed = 0; for (var i = 0; i < sqs.length; i++) for (var s = 0; s < SLOTS; s++) if (sqs[i].slots[s] !== done.before[i][s]) changed++;
      dbg({ event: 'deploy', how: how, auto: done.auto, changed: changed, ms: done.t, squads: sqs.map(function (q) { return { id: q.id, slots: q.slots.map(function (u) { return u ? safe(F.id, u, null) : null; }) }; }) });
      call(done.onDone, sqs); call(o.onDone, sqs);
    }
    function cancelHeld() { if (E && E.held) { ST.cancels++; dropBack(); } }
    function dropBack() { E.held = null; E.drag = null; }

    // layout: window, one panel per squad, cells, info box, DEPLOY button; all native px
    function layout(ctx) {
      if (E.layout && E.layout.vw === viewRect(ctx).w) return E.layout;
      var v = viewRect(ctx), n0 = E.squads.length, side = P.face === 'left' || P.face === 'right';
      var ne = E.enemy && side ? 1 : 0, n = n0 + ne;
      var k = P.scale || Math.max(1, Math.floor(Math.min(v.w / 256, v.h / 224)));
      var gw = side ? 2 : 3, gh = side ? 3 : 2, gap = 2 * k, pgap = 6 * k, pad = 6 * k, nameH = 10 * k, labH = 10 * k, infoH = 36 * k, hintH = 10 * k, titleH = 12 * k;
      var availW = v.w - 2 * (pad + 4 * k) - (n - 1) * pgap, availH = v.h - (pad * 2 + titleH + nameH + labH + infoH + hintH + 4 * k * 4);
      var c = P.cell ? P.cell * k : Math.floor(Math.min((availW - n * (gw - 1) * gap - n * 4 * k) / (n * gw), (availH - (gh - 1) * gap) / gh, 28 * k));
      c = Math.max(12, c);
      var panelW = gw * c + (gw - 1) * gap + 4 * k * 2, panelH = nameH + gh * c + (gh - 1) * gap + 4 * k + labH;
      var innerW = Math.max(n * panelW + (n - 1) * pgap, Math.min(v.w - 2 * pad, 236 * k));
      var winW = Math.min(v.w - 4, innerW + 2 * pad), winH = Math.min(v.h - 4, pad + titleH + panelH + 4 * k + infoH + 4 * k + hintH + pad);
      var wx = Math.round(v.x + (v.w - winW) / 2), wy = Math.round(v.y + (v.h - winH) / 2);
      var L = { vw: v.w, k: k, c: c, gap: gap, side: side, gw: gw, gh: gh, win: { x: wx, y: wy, w: winW, h: winH }, panels: [], cells: [], ecells: [], epanel: null, view: v };
      var vsGap = ne ? pgap * 2 : 0, px0 = Math.round(wx + (winW - (n * panelW + (n - 1) * pgap + vsGap)) / 2), py = wy + pad + titleH;
      var cellsIn = function (pr, mirror, list, i) {
        var gx0 = pr.x + 4 * k, gy0 = pr.y + nameH;
        for (var s = 0; s < SLOTS; s++) {
          var row = s < COLS ? 0 : 1, col = s % COLS, gx, gy, f = mirror ? (P.face === 'left' ? 'right' : 'left') : P.face;
          if (side) { gx = f === 'left' ? row : 1 - row; gy = col; } else { gx = col; gy = f === 'up' ? row : 1 - row; }
          list.push({ sq: i, slot: s, row: ROW_NAMES[row], x: gx0 + gx * (c + gap), y: gy0 + gy * (c + gap), w: c, h: c });
        }
      };
      var enemyFirst = ne && P.face === 'left', x = px0;
      if (enemyFirst) { L.epanel = { x: x, y: py, w: panelW, h: panelH }; cellsIn(L.epanel, true, L.ecells, -1); x += panelW + pgap + vsGap; }
      for (var i = 0; i < n0; i++) {
        var pr = { x: x, y: py, w: panelW, h: panelH }; L.panels.push(pr); x += panelW + pgap;
        cellsIn(pr, false, L.cells, i);
      }
      if (ne && !enemyFirst) { x += vsGap; L.epanel = { x: x, y: py, w: panelW, h: panelH }; cellsIn(L.epanel, true, L.ecells, -1); }
      var iy = py + panelH + 4 * k, bw = textW(P.deploy, k) + 18 * k;
      L.info = { x: wx + pad, y: iy, w: winW - 2 * pad - bw - 4 * k, h: infoH };
      L.deploy = { x: wx + winW - pad - bw, y: iy + infoH - 16 * k, w: bw, h: 16 * k };
      L.hint = { x: wx + pad, y: iy + infoH + 4 * k, w: winW - 2 * pad, h: hintH };
      E.layout = L;
      return L;
    }
    function cellAt(L, x, y) { for (var i = 0; i < L.cells.length; i++) if (inR(x, y, L.cells[i])) return L.cells[i]; return null; }
    function cellOf(L, sq, slot) { return L.cells[sq * SLOTS + slot]; }
    function curRect(L) { return E.cur.deploy ? L.deploy : E.cur.enemy ? L.ecells[E.cur.slot] : cellOf(L, E.cur.sq, E.cur.slot); }
    function ecellAt(L, x, y) { for (var i = 0; i < L.ecells.length; i++) if (inR(x, y, L.ecells[i])) return L.ecells[i]; return null; }
    function navigate(dir) {
      var L = E.layout || layout(null), from = curRect(L); if (!from) return;
      var fx = from.x + from.w / 2, fy = from.y + from.h / 2, best = null, bs = Infinity;
      var cands = L.cells.concat(L.ecells.map(function (c) { return { enemy: true, sq: -1, slot: c.slot, x: c.x, y: c.y, w: c.w, h: c.h }; }), [{ deploy: true, x: L.deploy.x, y: L.deploy.y, w: L.deploy.w, h: L.deploy.h }]);
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i]; if (c === from || (c.deploy && E.cur.deploy) || (c.enemy && E.cur.enemy && c.slot === E.cur.slot) || (c.enemy && E.held)) continue;   // a held unit never moves onto enemy cells
        var dx = c.x + c.w / 2 - fx, dy = c.y + c.h / 2 - fy, along, across;
        if (dir === 'left') { along = -dx; across = Math.abs(dy); } else if (dir === 'right') { along = dx; across = Math.abs(dy); }
        else if (dir === 'up') { along = -dy; across = Math.abs(dx); } else { along = dy; across = Math.abs(dx); }
        if (along <= 1) continue;
        var score = along + across * 2.2; if (score < bs) { bs = score; best = c; }
      }
      if (!best) return;
      E.glide = { from: { x: from.x, y: from.y, w: from.w, h: from.h }, t: 0 };
      E.cur = best.deploy ? { sq: E.cur.sq, slot: E.cur.slot, deploy: true } : best.enemy ? { sq: E.cur.sq, slot: best.slot, deploy: false, enemy: true } : { sq: best.sq, slot: best.slot, deploy: false };
    }
    function confirm(how) {
      if (E.cur.deploy) { finish(how || 'key'); return; }
      if (E.cur.enemy) { if (E.held) { E.buzz = 220; E.buzzMsg = 'Enemy squad: look only'; ST.refused++; } return; }      // enemy cells are read-only (inspect only)
      var sq = E.squads[E.cur.sq], u = sq.slots[E.cur.slot];
      if (!E.held) {
        if (!u) { E.buzz = 180; E.buzzMsg = 'Empty slot: nothing to pick up'; return; }
        E.held = { sq: E.cur.sq, slot: E.cur.slot, unit: u, t: 0 }; ST.picks++; dbg({ event: 'pick', unit: safe(F.id, u, null) });
        return;
      }
      var h = E.held;
      if (h.sq === E.cur.sq && h.slot === E.cur.slot) { E.held = null; ST.cancels++; return; }
      if (doMove(E.squads[h.sq], h.slot, sq, E.cur.slot, how || 'key')) { ST.drops++; E.held = null; } else { E.buzz = 220; E.buzzMsg = 'A squad cannot be left empty'; }
    }
    function animLand(toSq, ts, fromSq, fs, swapped) {
      if (!E) return;
      var a = E.squads.indexOf(toSq), b = E.squads.indexOf(fromSq);
      if (a >= 0) E.lands.push({ sq: a, slot: ts, t: 0, fromSq: b, fromSlot: fs, kind: 'land' });
      if (swapped && b >= 0) E.lands.push({ sq: b, slot: fs, t: 0, fromSq: a, fromSlot: ts, kind: 'slide' });
    }
    var KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right',
      z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', Space: 'ok', KeyZ: 'ok', x: 'back', X: 'back', Escape: 'back', Backspace: 'back', KeyX: 'back',
      ok: 'ok', confirm: 'ok', back: 'back', cancel: 'back', up: 'up', down: 'down', left: 'left', right: 'right', start: 'start', tab: 'start' };
    // key(name): returns true when the editor used it (the host should then ignore it for the game)
    function key(name) {
      if (!E) return false;
      var k = KEYMAP[name] || KEYMAP[String(name).toLowerCase()]; if (!k) return false;
      ST.keys++;
      try {
        if (E.auto && E.script) { E.auto = false; E.script = null; }            // a real press takes over from the autopilot
        E.manual = true;
        if (k === 'up' || k === 'down' || k === 'left' || k === 'right') navigate(k);
        else if (k === 'ok') confirm('key');
        else if (k === 'back') { if (E.held) cancelHeld(); else if (!E.cur.deploy) { var L = E.layout || layout(null); E.glide = { from: curRect(L), t: 0 }; E.cur = { sq: E.cur.sq, slot: E.cur.slot, deploy: true }; } }
        if (E && E.cur.enemy && E.cur.deploy) E.cur.enemy = false;
        else if (k === 'start') finish('start');
      } catch (e) { ST.errors++; warnOnce('key', 'key() failed: ' + e); }
      return true;
    }
    // pointer(type, x, y): 'down' | 'move' | 'up' in native px; returns true when the editor used it
    function pointer(type, x, y) {
      if (!E || !E.layout) return !!E;
      try {
        var L = E.layout, c = cellAt(L, x, y);
        if (type === 'move') { E.hover = c ? { sq: c.sq, slot: c.slot } : inR(x, y, L.deploy) ? 'deploy' : null; if (E.drag) { E.drag.x = x; E.drag.y = y; if (Math.abs(x - E.drag.x0) + Math.abs(y - E.drag.y0) > 3) E.drag.moved = true; } return true; }
        if (type === 'down') {
          ST.taps++;
          if (E.auto && E.script) { E.auto = false; E.script = null; }
          E.manual = true;
          if (inR(x, y, L.deploy)) { E.cur = { sq: E.cur.sq, slot: E.cur.slot, deploy: true }; E.pressDeploy = true; return true; }
          var ec = ecellAt(L, x, y);
          if (!c && ec) { E.cur = { sq: E.cur.sq, slot: ec.slot, deploy: false, enemy: true }; if (E.held) { E.buzz = 220; E.buzzMsg = 'Enemy squad: look only'; cancelHeld(); } return true; }
          if (!c) return inR(x, y, L.win);
          E.cur = { sq: c.sq, slot: c.slot, deploy: false };
          var u = E.squads[c.sq].slots[c.slot];
          if (E.held) { confirm('tap'); return true; }
          if (u) { E.held = { sq: c.sq, slot: c.slot, unit: u, t: 0 }; E.drag = { x: x, y: y, x0: x, y0: y, ox: x - c.x, oy: y - c.y, moved: false }; ST.picks++; }
          return true;
        }
        if (type === 'up') {
          if (E.pressDeploy) { E.pressDeploy = false; if (inR(x, y, L.deploy)) finish('tap'); return true; }
          if (!E.drag) return !!c;
          var d = E.drag; E.drag = null;
          if (!d.moved) return true;                       // a tap: the unit stays held; the next tap places it
          ST.drags++;
          if (c && E.held) { E.cur = { sq: c.sq, slot: c.slot, deploy: false }; confirm('drag'); }
          else cancelHeld();
          return true;
        }
      } catch (e) { ST.errors++; warnOnce('ptr', 'pointer() failed: ' + e); }
      return false;
    }
    function attach(canvas, size) {
      if (detach) detach();
      if (!canvas || !canvas.addEventListener) return function () { };
      var conv = function (e) {
        var r = canvas.getBoundingClientRect(), w = (size && size.w) || viewRect(null).w + viewRect(null).x, h = (size && size.h) || viewRect(null).h + viewRect(null).y;
        return [(e.clientX - r.left) * w / Math.max(1, r.width), (e.clientY - r.top) * h / Math.max(1, r.height)];
      };
      var on = function (type) { return function (e) { if (!E) return; var p = conv(e); if (pointer(type, p[0], p[1]) && e.cancelable && type !== 'move') e.preventDefault(); }; };
      var hd = on('down'), hm = on('move'), hu = on('up');
      canvas.addEventListener('pointerdown', hd); root.addEventListener('pointermove', hm); root.addEventListener('pointerup', hu);
      detach = function () { canvas.removeEventListener('pointerdown', hd); root.removeEventListener('pointermove', hm); root.removeEventListener('pointerup', hu); detach = null; };
      return detach;
    }

    // autopilot: walk the cursor to each suggested change, pick, walk, place, then DEPLOY; all on the update clock
    function autoScript() {
      var steps = [], cur = { sq: 0, slot: -1, deploy: true };
      if (P.autoArrange === 'on') {
        // move only units standing in the wrong row (melee in the back, ranged / magic in the front), to the nearest lane
        for (var i = 0; i < E.squads.length; i++) {
          var sq = E.squads[i], want = R.arrangeList(sq.slots.filter(Boolean)), have = sq.slots.slice(), wantRow = function (u) { return want.indexOf(u) < COLS ? 0 : 1; };
          for (var s = 0; s < SLOTS; s++) {
            var u = have[s]; if (!u || wantRow(u) === (s < COLS ? 0 : 1)) continue;
            var base = wantRow(u) * COLS, best = -1, bs = Infinity;
            for (var c = 0; c < COLS; c++) {
              var o2 = have[base + c], free = !o2 || wantRow(o2) !== wantRow(u), d = Math.abs(c - s % COLS) + (o2 ? 0.5 : 0);
              if (free && d < bs) { bs = d; best = base + c; }
            }
            if (best < 0) continue;
            steps.push({ go: { sq: i, slot: s } }, { ok: 1 }, { go: { sq: i, slot: best } }, { ok: 1 });
            var tmp = have[best]; have[best] = have[s]; have[s] = tmp;
            if (steps.length >= 24) break;
          }
        }
      }
      steps.push({ go: 'deploy' }, { ok: 1 });
      return { steps: steps, i: 0, cur: cur };
    }
    function autoTick() {
      var S = E.script; if (!S || E.t < E.nextAuto) return;
      var st = S.steps[S.i];
      if (!st) return;
      var L = E.layout || layout(null);
      if (st.go) {
        var target = st.go === 'deploy' ? { deploy: true } : st.go;
        var fr = curRect(L);
        E.glide = { from: { x: fr.x, y: fr.y, w: fr.w, h: fr.h }, t: 0 };
        E.cur = target.deploy ? { sq: E.cur.sq, slot: E.cur.slot, deploy: true } : { sq: target.sq, slot: target.slot, deploy: false };
        E.nextAuto = E.t + P.autoStepMs;
      } else if (st.ok) {
        if (E.cur.deploy && E.t < P.autoMs) { E.nextAuto = P.autoMs; return; }      // the editor stays up at least autoMs
        S.i++; E.nextAuto = E.t + P.autoStepMs;
        confirm('auto'); return;
      }
      S.i++;
    }
    function update(dt) {
      ST.updates++;
      dt = clamp(num(dt, 16.67), 0, 250); clock += dt;
      if (!E) return;
      try {
        E.t += dt; E.focusMs += dt;
        if (E.glide) { E.glide.t += dt; if (E.glide.t > 140) E.glide = null; }
        if (E.held) E.held.t += dt;
        if (E.buzz > 0) E.buzz = Math.max(0, E.buzz - dt);
        for (var i = E.lands.length - 1; i >= 0; i--) { E.lands[i].t += dt; if (E.lands[i].t > 220) E.lands.splice(i, 1); }
        if (!E.auto && !E.manual && o.autoplay && call(o.autoplay) && !E.script) { E.auto = true; E.script = autoScript(); ST.autos++; }
        if (E.auto) autoTick();
      } catch (e) { ST.errors++; warnOnce('upd', 'update() failed: ' + e); }
    }

    function draw(ctx) {
      if (!ctx) return;
      lastCanvas = ctx.canvas || lastCanvas;
      ST.draws++;
      drawnRects = [];
      if (!E) return;
      ctx.save();
      try { drawEditor(ctx); }
      catch (e) { ST.errors++; warnOnce('draw', 'draw() failed: ' + e); }
      ctx.restore();
    }
    function drawEditor(ctx) {
      var L = layout(ctx), k = L.k, v = L.view, op = P.openMs > 0 ? easeOut(E.t / P.openMs) : 1;
      if (P.dim > 0) { ctx.fillStyle = 'rgba(4,4,14,' + (P.dim * op).toFixed(3) + ')'; ctx.fillRect(v.x, v.y, v.w, v.h); }
      var lift = Math.round((1 - op) * 10 * k), W0 = L.win;
      ctx.translate(0, lift); ctx.globalAlpha *= clamp(op * 1.4, 0, 1);
      frame(ctx, W0, 'window', 'a');
      drawnRects.push({ kind: 'window', x: W0.x, y: W0.y, w: W0.w, h: W0.h });
      // title row: name, enemy direction, unit count
      var ty = W0.y + 6 * k;
      text(ctx, E.title, W0.x + 8 * k, ty, tok('text.title') || FB['text.title'], 'left', k);
      var arrow = P.face === 'up' ? '\u25b2 ENEMY' : P.face === 'down' ? 'ENEMY BELOW' : P.face === 'left' ? '< ENEMY' : 'ENEMY >';
      text(ctx, arrow, W0.x + W0.w - 8 * k, ty, ROW_COL.front, 'right', k);
      // panels
      for (var i = 0; i < E.squads.length; i++) drawPanel(ctx, L, i);
      if (E.enemy && L.epanel) {
        drawPanel(ctx, L, -1);
        var vx = P.face === 'left' ? L.epanel.x + L.epanel.w : L.panels[L.panels.length - 1].x + L.panels[L.panels.length - 1].w;
        var gapW = (P.face === 'left' ? L.panels[0].x : L.epanel.x) - vx;
        text(ctx, 'VS', Math.round(vx + gapW / 2), Math.round(L.epanel.y + L.epanel.h / 2 - 4 * k), tok('text.accent') || FB['text.accent'], 'center', k);
      }
      // landing / slide animations are drawn inside drawPanel; the held unit on top
      drawCursor(ctx, L);
      drawHeld(ctx, L);
      drawInfo(ctx, L);
      drawDeploy(ctx, L);
      var hint = E.held ? 'Z: place / swap   X: put back' : E.cur.enemy ? 'enemy squad: look only' : E.cur.deploy ? 'Z: deploy   arrows: choose a unit' : 'arrows: move   Z: pick up   drag with mouse';
      if (E.buzz > 0) hint = E.buzzMsg || 'Not possible';
      text(ctx, fit(hint, L.hint.w, k), L.hint.x, L.hint.y, E.buzz > 0 ? (tok('fx.hot') || FB['fx.hot']) : (tok('text.dim') || FB['text.dim']), 'left', k);
    }
    function landOffset(i, s, L) {
      for (var j = 0; j < E.lands.length; j++) {
        var a = E.lands[j]; if (a.sq !== i || a.slot !== s) continue;
        var f = a.t / 220;
        if (a.kind === 'slide' && a.fromSq >= 0) {
          var from = cellOf(L, a.fromSq, a.fromSlot), to = cellOf(L, i, s), e = easeOut(f);
          return { dx: Math.round((from.x - to.x) * (1 - e)), dy: Math.round((from.y - to.y) * (1 - e)), squash: 0 };
        }
        return { dx: 0, dy: -Math.round(Math.max(0, Math.sin(Math.min(1, f * 1.6) * Math.PI)) * 3 * L.k), squash: f < 0.35 ? 1 : 0, dust: f };
      }
      return null;
    }
    function drawPanel(ctx, L, i) {
      var ro = i < 0, sq = ro ? E.enemy : E.squads[i], pr = ro ? L.epanel : L.panels[i], k = L.k, R0 = R;
      var cellOf = function (L2, i2, s2) { return ro ? L2.ecells[s2] : L2.cells[i2 * SLOTS + s2]; };
      var pa0 = ctx.globalAlpha; if (ro) ctx.globalAlpha = pa0 * 0.92;
      frame(ctx, pr, 'backing', sq.team);
      var alive = sq.slots.filter(function (u) { return u && aliveOf(F, u); }).length;
      text(ctx, fit(sq.name, pr.w - 22 * k, k), pr.x + 4 * k, pr.y + 1 * k, teamCol(sq.team), 'left', k);
      text(ctx, alive + '/' + sq.slots.filter(Boolean).length, pr.x + pr.w - 3 * k, pr.y + 1 * k, tok('text.dim') || FB['text.dim'], 'right', k);
      var guarded = R0.frontAlive(sq) > 0;
      for (var s = 0; s < SLOTS; s++) {
        var c = cellOf(L, i, s), row = c.row, C = CELL[row];
        // cell well: two-tone with a lit top edge, front rows warm, back rows cool
        ctx.fillStyle = C[2]; ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.fillStyle = C[0]; ctx.fillRect(c.x + k, c.y + k, c.w - 2 * k, c.h - 2 * k);
        ctx.fillStyle = C[1]; ctx.fillRect(c.x + k, c.y + k, c.w - 2 * k, Math.round((c.h - 2 * k) * 0.45));
        ctx.fillStyle = C[3]; ctx.fillRect(c.x + k, c.y + k, c.w - 2 * k, k);
        var hl = !ro && E.drag && E.drag.moved && cellAt(L, E.drag.x, E.drag.y) === c;
        var hov = !ro && E.hover && E.hover.sq === i && E.hover.slot === s;
        if (hl || hov) frame(ctx, { x: c.x + k, y: c.y + k, w: c.w - 2 * k, h: c.h - 2 * k }, 'row', sq.team);
        var u = sq.slots[s];
        if (u && !(E.held && E.held.unit === u)) {
          var lo = (!ro && landOffset(i, s, L)) || { dx: 0, dy: 0 };
          drawCellUnit(ctx, L, sq, u, c, lo.dx, lo.dy, ro);
          if (lo.dust != null && lo.dust < 0.6) {
            ctx.fillStyle = 'rgba(255,240,200,' + (0.7 * (1 - lo.dust / 0.6)).toFixed(2) + ')';
            var spread = Math.round((2 + lo.dust * 10) * k);
            ctx.fillRect(c.x + c.w / 2 - spread - k, c.y + c.h - 4 * k, 2 * k, k); ctx.fillRect(c.x + c.w / 2 + spread - k, c.y + c.h - 4 * k, 2 * k, k);
          }
        } else if (!u) {
          // empty: a faint slot mark
          ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(c.x + (c.w >> 1) - k, c.y + (c.h >> 1) - 3 * k, 2 * k, 6 * k); ctx.fillRect(c.x + (c.w >> 1) - 3 * k, c.y + (c.h >> 1) - k, 6 * k, 2 * k);
        }
        // the back row's shield (guarded from melee while a front-row unit stands)
        if (row === 'back' && P.backGuard === 'on' && guarded) icon(ctx, 'shield', c.x + c.w - 8 * k, c.y + 2 * k, 'rgba(138,200,255,0.55)', k, false);
      }
      // row labels along the panel edge
      var f0 = cellOf(L, i, 0), b0 = cellOf(L, i, COLS);
      var gb = 0; for (var s2 = 0; s2 < SLOTS; s2++) { var c2 = cellOf(L, i, s2); gb = Math.max(gb, c2.y + c2.h); }
      var ly = gb + 3 * k;
      ctx.fillStyle = ROW_COL.front; if (L.side) ctx.fillRect(f0.x, gb + k, L.c, k); else ctx.fillRect(pr.x + k, f0.y, k, L.c);
      ctx.fillStyle = ROW_COL.back; if (L.side) ctx.fillRect(b0.x, gb + k, L.c, k); else ctx.fillRect(pr.x + k, b0.y, k, L.c);
      // FRONT / BACK labels in the row colours
      if (L.side) { text(ctx, 'front', f0.x + L.c / 2, ly, ROW_COL.front, 'center', k); text(ctx, 'back', b0.x + L.c / 2, ly, ROW_COL.back, 'center', k); }
      else {
        var fl = P.face === 'up' ? '\u25b2 front' : 'front \u25bc';
        text(ctx, fl, pr.x + 4 * k, ly, ROW_COL.front, 'left', k); text(ctx, 'back', pr.x + pr.w - 4 * k, ly, ROW_COL.back, 'right', k);
      }
      ctx.globalAlpha = pa0;
    }
    function drawCellUnit(ctx, L, sq, u, c, dx, dy, mirror) {
      var k = L.k, alive = aliveOf(F, u), pad = 2 * k;
      // contact shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(c.x + dx + Math.round(c.w * 0.25), c.y + c.h - 5 * k, Math.round(c.w * 0.5), 2 * k);
      drawUnitArt(ctx, u, sq.team, c.x + pad + dx, c.y + pad + dy, c.w - 2 * pad, c.h - 2 * pad - 3 * k, alive, mirror ? !flipOf(u) : flipOf(u));
      // hp strip
      var hp = num(safe(F.hp, u, 0), 0), mx = Math.max(1, num(safe(F.maxHp, u, 1), 1));
      bar(ctx, c.x + 3 * k + dx, c.y + c.h - 3 * k, c.w - 6 * k, k, hp / mx, hp / mx < 0.3 ? '#ffb04a' : '#5ad86a');
      // reach icon, and the warning for melee from the back row
      var r = reachOf(F, u), slot = c.slot;
      icon(ctx, r, c.x + 2 * k + dx, c.y + 2 * k, REACH_COL[r], Math.max(1, k - 1));
      var warnBack = slot >= COLS && r === 'melee' && P.backMelee < 1, warnFront = slot < COLS && r !== 'melee' && P.backGuard === 'on';
      if (alive && (warnBack || warnFront) && !mirror) {
        var bl = (Math.floor(clock / 400) % 2) ? 1 : 0.6, pa = ctx.globalAlpha; ctx.globalAlpha = pa * bl;
        icon(ctx, 'warn', c.x + c.w - 9 * k, c.y + c.h - 12 * k, warnBack && P.backMelee <= 0 ? '#ff5a48' : '#ffc040', k);
        ctx.globalAlpha = pa;
      }
      if (!alive) text(ctx, 'KO', c.x + c.w / 2, c.y + (c.h >> 1) - 4 * k, '#ff7a6a', 'center', k);
    }
    function drawCursor(ctx, L) {
      var r = curRect(L); if (!r) return;
      var k = L.k, x = r.x, y = r.y, w = r.w, h = r.h;
      if (E.glide) { var e = easeOut(E.glide.t / 140), f = E.glide.from; x = f.x + (x - f.x) * e; y = f.y + (y - f.y) * e; w = f.w + (w - f.w) * e; h = f.h + (h - f.h) * e; }
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      var pulse = Math.floor(E.focusMs / 260) % 2, o = pulse * k, col = E.buzz > 0 ? '#ff5a48' : E.held ? '#ffe070' : '#ffffff';
      if (SK && !E.buzz && typeof SK.cursor === 'function' && SK.pixel === false) { try { SK.cursor(ctx, { x: x, y: y, w: w, h: h }, 'bracket', clock / 1000, {}); return; } catch (er) { } }
      var arm = Math.max(3 * k, Math.round(Math.min(w, h) / 4));
      var corner = function (cx, cy, sx, sy) {
        ctx.fillStyle = FB.ink; ctx.fillRect(Math.min(cx, cx + sx * arm) + k, cy + k, arm + k, k); ctx.fillRect(cx + k, Math.min(cy, cy + sy * arm) + k, k, arm + k);
        ctx.fillStyle = col; ctx.fillRect(Math.min(cx, cx + sx * arm), cy, arm + k, k); ctx.fillRect(cx, Math.min(cy, cy + sy * arm), k, arm + k);
      };
      corner(x - o - k, y - o - k, 1, 1); corner(x + w + o, y - o - k, -1, 1); corner(x - o - k, y + h + o, 1, -1); corner(x + w + o, y + h + o, -1, -1);
    }
    function drawHeld(ctx, L) {
      if (!E.held) return;
      var k = L.k, sq = E.squads[E.held.sq], c;
      var tgt = E.drag && E.drag.moved ? { x: E.drag.x - E.drag.ox, y: E.drag.y - E.drag.oy, w: L.c, h: L.c } : curRect(L);
      if (!tgt) return;
      c = { x: Math.round(tgt.x), y: Math.round(tgt.y), w: L.c, h: L.c, slot: E.held.slot };
      var bob = Math.round((Math.sin(E.held.t / 150) * 0.5 + 0.5) * 2 * k), up = Math.round(easeOutBack(E.held.t / 160) * 6 * k) + bob;
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(c.x + Math.round(c.w * 0.2), c.y + c.h - 4 * k, Math.round(c.w * 0.6), 3 * k);
      var origin = cellOf(L, E.held.sq, E.held.slot);
      // ghost in the origin cell
      var pa = ctx.globalAlpha; ctx.globalAlpha = pa * 0.3; drawUnitArt(ctx, E.held.unit, sq.team, origin.x + 2 * k, origin.y + 2 * k, origin.w - 4 * k, origin.h - 7 * k, true, flipOf(E.held.unit)); ctx.globalAlpha = pa;
      drawUnitArt(ctx, E.held.unit, sq.team, c.x + 2 * k, c.y + 2 * k - up, c.w - 4 * k, c.h - 7 * k, aliveOf(F, E.held.unit), flipOf(E.held.unit));
    }
    function rowLines(u, row, theirs) {
      var r = reachOf(F, u), out = [], dim = tok('text.dim') || FB['text.dim'];
      if (theirs) {
        if (row === 'front') { out.push(['Their front: your melee hits it', ROW_COL.front]); out.push(['guards their back row', dim]); }
        else { out.push([P.backGuard === 'on' ? 'Their back: melee-proof' : 'Their back row', ROW_COL.back]); out.push(['until their front falls', dim]); if (P.backWeak !== 1) out[1] = ['your arrows, spells \u00d7' + P.backWeak, dim]; }
        return out;
      }
      if (row === 'front') {
        out.push(['Front: takes melee hits', ROW_COL.front]);
        out.push([r !== 'melee' && P.backGuard === 'on' ? 'melee can reach this ' + (r === 'magic' ? 'caster' : 'archer') : P.backGuard === 'on' ? 'guards the back row' : 'faces the enemy', r !== 'melee' && P.backGuard === 'on' ? '#ffc040' : dim]);
      } else {
        out.push([P.backGuard === 'on' ? 'Back: safe from melee' : 'Back row', ROW_COL.back]);
        if (P.backWeak !== 1) out.push(['arrows, spells \u00d7' + P.backWeak, dim]);
        if (r === 'melee' && P.backMelee < 1) out[out.length - 1] = [P.backMelee <= 0 ? 'cannot melee from here' : 'own melee \u00d7' + P.backMelee, '#ffc040'];
      }
      return out;
    }
    function drawInfo(ctx, L) {
      var k = L.k, b = L.info, u = null, sq = null, row = null;
      frame(ctx, b, 'backing', 'a');
      if (E.held) {
        u = E.held.unit; sq = E.squads[E.held.sq];
        var over = E.drag && E.drag.moved ? cellAt(L, E.drag.x, E.drag.y) : null;
        row = over ? over.row : !E.cur.deploy && !E.cur.enemy ? cellOf(L, E.cur.sq, E.cur.slot).row : E.held.slot < COLS ? 'front' : 'back';
      }
      else if (E.cur.enemy && E.enemy) { sq = E.enemy; u = sq.slots[E.cur.slot]; row = E.cur.slot < COLS ? 'front' : 'back'; }
      else if (!E.cur.deploy) { sq = E.squads[E.cur.sq]; u = sq.slots[E.cur.slot]; row = E.cur.slot < COLS ? 'front' : 'back'; }
      var theirs = !E.held && !!E.cur.enemy;
      var x = b.x + 4 * k, y = b.y + 3 * k;
      if (!u) {
        var all = 0, front = 0; E.squads.forEach(function (q) { for (var s = 0; s < SLOTS; s++) if (q.slots[s]) { all++; if (s < COLS) front++; } });
        text(ctx, E.cur.deploy ? 'Ready to march' : E.cur.enemy ? 'Empty enemy slot' : 'Empty slot', x, y, tok('text.title') || FB['text.title'], 'left', k);
        text(ctx, fit(all + ' units, ' + front + ' in front', b.w - 8 * k, k), x, y + 10 * k, tok('text.dim') || FB['text.dim'], 'left', k);
        text(ctx, fit(P.backGuard === 'on' ? 'Front row guards the back row' : 'Rows change damage taken', b.w - 8 * k, k), x, y + 20 * k, ROW_COL.back, 'left', k);
        return;
      }
      var box = 22 * k;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x, y, box, box + 4 * k);
      drawUnitArt(ctx, u, sq.team, x + k, y + k, box - 2 * k, box, aliveOf(F, u), theirs ? !flipOf(u) : flipOf(u));
      var tx = x + box + 5 * k, tw = b.x + b.w - tx - 3 * k, r = reachOf(F, u);
      var nm = fit(safe(F.name, u, '?'), tw - textW(r.toUpperCase(), k) - 14 * k, k);
      text(ctx, nm, tx, y, tok('text.main') || FB['text.main'], 'left', k);
      icon(ctx, r, b.x + b.w - 4 * k - textW(r.toUpperCase(), k) - 10 * k, y, REACH_COL[r], k);
      text(ctx, r.toUpperCase(), b.x + b.w - 4 * k, y, REACH_COL[r], 'right', k);
      var lines = rowLines(u, row, theirs);
      for (var i = 0; i < lines.length && i < 2; i++) text(ctx, fit(lines[i][0], tw, k), tx, y + (10 + i * 10) * k, lines[i][1], 'left', k);
    }
    function drawDeploy(ctx, L) {
      var k = L.k, d = L.deploy, focus = E.cur.deploy;
      var pulse = focus ? Math.round((Math.sin(E.focusMs / 180) * 0.5 + 0.5) * k) : 0;
      frame(ctx, { x: d.x, y: d.y - pulse, w: d.w, h: d.h }, 'plate', focus ? 'a' : 'n', { focus: focus });
      text(ctx, P.deploy, d.x + d.w / 2, d.y - pulse + Math.round((d.h - 7 * k) / 2), focus ? (tok('text.accent') || FB['text.accent']) : (tok('text.main') || FB['text.main']), 'center', k);
      drawnRects.push({ kind: 'deploy', x: d.x, y: d.y, w: d.w, h: d.h });
    }

    function state() {
      if (!E) return { open: false };
      return { open: true, t: Math.round(E.t), auto: !!E.auto, cursor: E.cur.deploy ? 'deploy' : E.cur.enemy ? ['enemy', E.cur.slot] : [E.cur.sq, E.cur.slot], held: E.held ? safe(F.id, E.held.unit, null) : null,
        squads: E.squads.map(function (q) { return q.id; }) };
    }
    function stats() { var o2 = {}; for (var kk in ST) o2[kk] = ST[kk]; o2.squads = SQ.length; o2.open = !!E; return o2; }

    return {
      version: VERSION,
      // data
      squad: squad, squads: function () { return SQ.slice(); }, getSquad: findSquad, removeSquad: removeSquad, squadOf: squadOf,
      slotOf: slotOf, rowOf: rowOf, colOf: colOf, members: function (sqx, living) { return R.members(asSquad(sqx), living); },
      targetsFor: targetsFor, pickTarget: pickTarget, hit: hit, canStrike: canStrike, usable: usable, frontAlive: function (sqx) { var q = asSquad(sqx); return q ? R.frontAlive(q) : 0; },
      move: move, arrange: arrange, spot: spot,
      // editor
      open: open, busy: busy, key: key, pointer: pointer, attach: attach, close: function () { finish('api'); }, cancel: function () { if (E) { for (var i = 0; i < E.squads.length; i++) E.squads[i].slots = E.before[i].slice(); E = null; } },
      update: update, draw: draw,
      // in-world drawing
      drawTag: drawTag, drawPips: drawPips, drawGuards: drawGuards,
      // tuning and tests
      setParams: setParams, params: function () { var p = {}; for (var kk in DEFAULTS) p[kk] = P[kk]; return p; },
      state: state, stats: stats, lastDrawn: function () { return drawnRects.slice(); }, rules: R,
      rects: function () { var L = E && E.layout; if (!L) return null; var cp = function (r) { return { sq: r.sq, slot: r.slot, row: r.row, x: r.x, y: r.y, w: r.w, h: r.h }; };
        return { window: L.win, deploy: L.deploy, cells: L.cells.map(cp), enemy: L.ecells.map(cp) }; }
    };
  }

  root.GameDNA_SquadFormation = {
    version: VERSION, create: create, DEFAULTS: DEFAULTS, COLS: COLS, ROWS: ROWS, SLOTS: SLOTS,
    slot: function (row, col) { return (row === 'back' || row === 1 ? COLS : 0) + clamp(col | 0, 0, COLS - 1); },
    rowOfSlot: function (s) { return s >= 0 && s < SLOTS ? ROW_NAMES[s < COLS ? 0 : 1] : null; },
    colOfSlot: function (s) { return s >= 0 && s < SLOTS ? s % COLS : null; },
    rules: function (params, unitReaders) { return makeRules(params, unitReaders); }
  };
})(typeof window !== 'undefined' ? window : this);
