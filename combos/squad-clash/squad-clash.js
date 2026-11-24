/* GameDNA_SquadClash v1.2.2 (A-14 squad-clash): auto-resolved squad clash with an exact forecast.
   One plain script, no dependencies, no import/export. API: module/README.md.

   Two squads (each a 2x3 grid: front row, back row, three columns) meet. A pure, seeded simulation decides the whole clash:
   turn order by speed, each unit's action from its ordered "condition -> action" tactic rules, row reach (melee only reaches
   the front row while it stands), guards stepping in for weak or back-row allies, follow-up attacks, crits from a seeded
   stream. The FORECAST is that simulation run on a snapshot; COMMIT plays the same log in a staged side-view scene and applies
   every hit to the live units, then compares the live result with the forecast (outcome().match).

   Sections: 1 helpers, 2 default content, 3 rows + rules (A-12 / A-13 compatible), 4 the simulation, 5 the instance
   (layout, playback, effects, drawing, anchors, UI rects). */
(function (root) {
  'use strict';
  var VERSION = '1.2.2';

  /* ---------- 1. helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function easeOut(k) { k = clamp(k, 0, 1); return 1 - (1 - k) * (1 - k) * (1 - k); }
  function easeIn(k) { k = clamp(k, 0, 1); return k * k * k; }
  function easeInOut(k) { k = clamp(k, 0, 1); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function mulberry32(a) { a = (a >>> 0) || 1; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hashStr(s) { var h = 2166136261 >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function arr(v) { return Array.isArray(v) ? v : v == null ? [] : [v]; }
  function has(list, x) { return list.indexOf(x) >= 0; }
  function pct(u) { return u.maxHp > 0 ? u.hp / u.maxHp : 0; }
  function warnOnce(store, key, msg) { if (store[key]) return; store[key] = 1; try { console.warn('[squad-clash] ' + msg); } catch (e) {} }

  /* ---------- 2. default content (hosts add or replace through create({skills, presets, looks})) ---------- */
  // kind: melee | ranged | magic | heal. from: the row the user must stand in (null = any). area: 'row' hits the whole row of
  // the chosen target. power: % of atk (physical) or mag (magic, heal). uses: per clash (0 = unlimited).
  var SKILLS = {
    strike:  { name: 'Strike',     kind: 'melee',  power: 100, from: 'front' },
    cleave:  { name: 'Cleave',     kind: 'melee',  power: 70,  from: 'front', area: 'row', uses: 2 },
    thrust:  { name: 'Long Thrust', kind: 'melee', power: 85,  from: null },
    bite:    { name: 'Bite',       kind: 'melee',  power: 95,  from: null },
    shoot:   { name: 'Shoot',      kind: 'ranged', power: 90 },
    pierce:  { name: 'Piercing Shot', kind: 'ranged', power: 120, uses: 1 },
    bolt:    { name: 'Spark Bolt', kind: 'magic',  power: 100, element: 'shock' },
    blaze:   { name: 'Blaze Wave', kind: 'magic',  power: 70,  area: 'row', uses: 2, element: 'fire' },
    hex:     { name: 'Hex',        kind: 'magic',  power: 90,  element: 'arcane' },
    mend:    { name: 'Mend',       kind: 'heal',   power: 120 },
    chase:   { name: 'Chaser Shot', kind: 'ranged', power: 55, follow: true },
    lunge:   { name: 'Lunge',      kind: 'melee',  power: 60, from: null, follow: true }
  };
  // Tactic presets (A-13 style rule lists). Condition keys: CONDITIONS below. `use` = a skill id.
  var PRESETS = {
    knight:  [{ name: 'Hold the line', rules: [{ if: 'enemiesAtLeast', value: 3, use: 'cleave' }, { if: 'always', use: 'strike' }] },
              { name: 'Duelist', rules: [{ if: 'targetHpBelow', value: 50, use: 'strike' }, { if: 'always', use: 'strike' }] }],
    lancer:  [{ name: 'Harry the weak', rules: [{ if: 'targetHpBelow', value: 40, use: 'thrust' }, { if: 'always', use: 'thrust' }] },
              { name: 'Reach the back', rules: [{ if: 'targetRow', value: 'back', use: 'thrust' }, { if: 'always', use: 'thrust' }] }],
    archer:  [{ name: 'Down the flyers', rules: [{ if: 'targetTag', value: 'flying', use: 'pierce' }, { if: 'targetTag', value: 'flying', use: 'shoot' }, { if: 'always', use: 'shoot' }] },
              { name: 'Snipe casters', rules: [{ if: 'targetRow', value: 'back', use: 'pierce' }, { if: 'targetRow', value: 'back', use: 'shoot' }, { if: 'always', use: 'shoot' }] }],
    mage:    [{ name: 'Burn the rows', rules: [{ if: 'enemiesAtLeast', value: 2, use: 'blaze' }, { if: 'always', use: 'bolt' }] },
              { name: 'Crack armour', rules: [{ if: 'targetTag', value: 'armored', use: 'bolt' }, { if: 'always', use: 'bolt' }] }],
    cleric:  [{ name: 'Keep them up', rules: [{ if: 'allyHpBelow', value: 60, use: 'mend' }, { if: 'always', use: 'bolt' }] },
              { name: 'Last-ditch', rules: [{ if: 'allyHpBelow', value: 30, use: 'mend' }, { if: 'always', use: 'bolt' }] }]
  };
  // Looks for the built-in painter: kind humanoid | beast | bird; weapon sword | spear | bow | staff | axe | dagger | claws.
  var LOOKS = {
    knight:   { kind: 'humanoid', body: '#5b7fc7', trim: '#e8c46a', skin: '#f0c49a', hair: '#7a4a2a', helm: '#c9d2df', cape: '#2f4f9a', weapon: 'sword', shield: '#3e64b5', legs: '#3a3f58' },
    lancer:   { kind: 'humanoid', body: '#3f9a8a', trim: '#f3e2a0', skin: '#e9b98d', hair: '#2b2236', cape: '#24685e', weapon: 'spear', legs: '#2f3b45' },
    archer:   { kind: 'humanoid', body: '#6f9a45', trim: '#d8b067', skin: '#f2c8a0', hair: '#c8743a', hood: '#4d7032', weapon: 'bow', legs: '#4a3a2c' },
    mage:     { kind: 'humanoid', body: '#7a55c4', trim: '#f0d36b', skin: '#f3cfae', hair: '#e8e2f2', hat: '#5a3a9e', weapon: 'staff', orb: '#9fd8ff', legs: '#3b2d5c', robe: true },
    cleric:   { kind: 'humanoid', body: '#efe6d2', trim: '#d9a840', skin: '#e6b48c', hair: '#5a3a26', hood: '#d9cdb2', weapon: 'staff', orb: '#ffe58a', legs: '#8c7a5c', robe: true },
    rogue:    { kind: 'humanoid', body: '#4a4a5e', trim: '#c94c4c', skin: '#e7b08a', hair: '#1f1a26', hood: '#33334a', weapon: 'dagger', legs: '#262633' },
    brigand:  { kind: 'humanoid', body: '#9a5a3a', trim: '#5e3a24', skin: '#d79c74', hair: '#3a2416', weapon: 'axe', legs: '#4a3426', bandana: '#b8392f' },
    slinger:  { kind: 'humanoid', body: '#a77f4f', trim: '#5e4630', skin: '#e2a982', hair: '#6a3c22', hood: '#7c5b38', weapon: 'bow', legs: '#4c3a2a' },
    ironclad: { kind: 'humanoid', body: '#7d8796', trim: '#b8433a', skin: '#c9a184', hair: '#2a2a2a', helm: '#9aa5b5', visor: true, weapon: 'axe', shield: '#5b6573', legs: '#3c414c', bulky: true },
    hexer:    { kind: 'humanoid', body: '#4c2f5e', trim: '#8fe07a', skin: '#c8b6c9', hair: '#1a1220', hat: '#2e1d3a', weapon: 'staff', orb: '#b46cff', legs: '#24182e', robe: true },
    mender:   { kind: 'humanoid', body: '#5e7a6a', trim: '#e0c46a', skin: '#d8a882', hair: '#ddd6c8', hood: '#4a6356', weapon: 'staff', orb: '#9cf0b4', legs: '#36463e', robe: true },
    warlord:  { kind: 'humanoid', body: '#8a2f35', trim: '#e3b64e', skin: '#cf9c7a', hair: '#1c1416', helm: '#5c5f6b', horns: true, cape: '#3a1418', weapon: 'axe', legs: '#2a2226', bulky: true },
    hound:    { kind: 'beast', body: '#7c6a5a', belly: '#b8a48e', eye: '#ffd24a', dark: '#3a2f28' },
    raptor:   { kind: 'bird', body: '#3f7fa8', wing: '#2c5878', belly: '#e9d8a6', beak: '#f2b33d', eye: '#fff2a8' }
  };
  var TEAM = { a: { main: '#58b4ff', soft: '#2a6fb0', glow: 'rgba(88,180,255,' }, b: { main: '#ff6a5a', soft: '#b0382c', glow: 'rgba(255,106,90,' } };
  var FONT = '"Trebuchet MS", "Segoe UI", system-ui, -apple-system, sans-serif';
  var FONT_D = '"Palatino Linotype", Palatino, "Book Antiqua", "Iowan Old Style", Georgia, "Times New Roman", serif';   // display face: banners, results
  var INK = '#18121f';

  /* ---------- 3. rows and rules (the built-in A-12 / A-13 compatible logic; hosts may replace them, see README) ---------- */
  function rowOf(u) { return u && (u.row === 'back' || u.row === 1 || (u.row == null && u.slot != null && +u.slot >= 3)) ? 'back' : 'front'; }
  // which enemies (or allies, for heals) a skill may target from where the user stands
  function targetsFor(user, skill, allies, enemies) {
    if (!skill) return [];
    if (skill.from && rowOf(user) !== skill.from) return [];
    if (skill.kind === 'heal') return allies.filter(function (u) { return u.hp > 0 && u.hp < u.maxHp; });
    var foes = enemies.filter(function (u) { return u.hp > 0; });
    if (skill.kind === 'melee') {
      var front = foes.filter(function (u) { return rowOf(u) === 'front'; });
      return front.length ? front : foes;   // the back row is safe from melee while anyone stands in front
    }
    return foes;                            // ranged and magic reach every row
  }
  // Rule conditions: (ctx, value) -> {ok, filter?(target) -> bool, note}. ctx = {self, allies, enemies, round}. Pure functions only.
  var CONDITIONS = {
    always: function () { return { ok: true, note: 'always' }; },
    firstRound: function (c) { return { ok: c.round === 1, note: 'round ' + c.round }; },
    selfHpBelow: function (c, v) { var p = Math.round(pct(c.self) * 100); return { ok: p < v, note: 'self ' + p + '%' }; },
    allyHpBelow: function (c, v) {
      var low = c.allies.filter(function (u) { return u.hp > 0 && pct(u) * 100 < v; });
      low.sort(function (x, y) { return pct(x) - pct(y) || cmpId(x, y); });
      return { ok: low.length > 0, filter: function (t) { return t.hp > 0 && pct(t) * 100 < v; }, note: low.length ? low[0].name + ' ' + Math.round(pct(low[0]) * 100) + '%' : 'none under ' + v + '%' };
    },
    enemiesAtLeast: function (c, v) { var n = c.enemies.filter(alive).length; return { ok: n >= v, note: n + ' foes' }; },
    enemiesAtMost: function (c, v) { var n = c.enemies.filter(alive).length; return { ok: n <= v, note: n + ' foes' }; },
    targetTag: function (c, v) { var f = function (t) { return hasTag(t, v); }; return { ok: c.enemies.some(function (t) { return alive(t) && f(t); }), filter: f, note: v + ' foe' }; },
    targetRow: function (c, v) { var f = function (t) { return rowOf(t) === v; }; return { ok: c.enemies.some(function (t) { return alive(t) && f(t); }), filter: f, note: v + '-row foe' }; },
    targetHpBelow: function (c, v) { var f = function (t) { return pct(t) * 100 < v; }; return { ok: c.enemies.some(function (t) { return alive(t) && f(t); }), filter: f, note: 'foe under ' + v + '%' }; },
    alliesFallen: function (c, v) { var n = c.allies.filter(function (u) { return u.hp <= 0; }).length; return { ok: n >= v, note: n + ' fallen' }; }
  };
  var COND_TEXT = {
    always: function () { return 'Always'; }, firstRound: function () { return 'First round'; },
    selfHpBelow: function (v) { return 'Self HP < ' + v + '%'; }, allyHpBelow: function (v) { return 'Ally HP < ' + v + '%'; },
    enemiesAtLeast: function (v) { return v + '+ foes standing'; }, enemiesAtMost: function (v) { return v + ' or fewer foes'; },
    targetTag: function (v) { return 'Foe is ' + v; }, targetRow: function (v) { return 'Foe in ' + v + ' row'; },
    targetHpBelow: function (v) { return 'Foe HP < ' + v + '%'; }, alliesFallen: function (v) { return v + '+ allies fallen'; }
  };
  // A-13 tactic-rules condition ids map onto these (same meaning)
  var ALIAS = { foeHpBelow: 'targetHpBelow', foeIs: 'targetTag', foesAtLeast: 'enemiesAtLeast', foesAtMost: 'enemiesAtMost', firstTurn: 'firstRound' };
  CONDITIONS.selfHpAbove = function (c, v) { var p = Math.round(pct(c.self) * 100); return { ok: p >= v, note: 'self ' + p + '%' }; };
  CONDITIONS.alliesAtMost = function (c, v) { var n = c.allies.filter(alive).length; return { ok: n <= v, note: n + ' allies' }; };
  CONDITIONS.selfIs = function (c, v) { return { ok: hasTag(c.self, v), note: 'self ' + v }; };
  CONDITIONS.allyIs = function (c, v) { var f = function (t) { return hasTag(t, v); }; return { ok: c.allies.some(function (t) { return alive(t) && f(t); }), filter: f, note: 'ally ' + v }; };
  COND_TEXT.selfHpAbove = function (v) { return 'Self HP ' + v + '%+'; }; COND_TEXT.alliesAtMost = function (v) { return v + ' or fewer allies'; };
  COND_TEXT.selfIs = function (v) { return 'Self is ' + v; }; COND_TEXT.allyIs = function (v) { return 'Ally is ' + v; };
  // tags: 'armored' / 'armoured' are the same; units get 'front row' / 'back row' as A-13 does
  function hasTag(u, tag) { tag = String(tag).toLowerCase().replace('armoured', 'armored'); if (tag === 'front row' || tag === 'back row') return rowOf(u) + ' row' === tag; return u.tags.some(function (x) { return String(x).toLowerCase().replace('armoured', 'armored') === tag; }); }
  function alive(u) { return u.hp > 0; }
  function rulesOf(u) { var r = u && u.rules; return Array.isArray(r) ? r : r && Array.isArray(r.rules) ? r.rules : []; }
  function cmpId(a, b) { return a.order - b.order; }
  function ruleParts(r) {   // accept A-13 style aliases: if/when/cond, use/then/do/action, value/arg/x, on/enabled
    if (!r) return null;
    var c = r.if != null ? r.if : r.when != null ? r.when : r.cond != null ? r.cond : r.condition;
    var v = r.value != null ? r.value : r.n != null ? r.n : r.tag != null ? r.tag : r.arg != null ? r.arg : r.x;
    if (c && typeof c === 'object') { v = c.value != null ? c.value : c.arg != null ? c.arg : v; c = c.kind || c.type || c.id || c.if; }
    var a = r.use != null ? r.use : r.then != null ? r.then : r.do != null ? r.do : r.action;
    if (a && typeof a === 'object') a = a.skill || a.id || a.use;
    var on = !(r.on === false || r.enabled === false || r.off === true);
    c = String(c || 'always'); if (ALIAS[c]) c = ALIAS[c];
    return { cond: c, value: v, use: a == null ? null : String(a), on: on, pick: r.pick || null };
  }
  function ruleText(r) { var p = ruleParts(r); if (!p) return ''; var f = COND_TEXT[p.cond]; return (f ? f(p.value) : p.cond + (p.value != null ? ' ' + p.value : '')); }
  // pick one target: heals -> lowest HP %, attacks -> lowest HP, then front row, then column, then roster order
  function pickTarget(list, skill, pick) {
    var l = list.slice();
    if (pick === 'first') return l.slice().sort(cmpId)[0] || null;
    l.sort(function (x, y) {
      var d = pick === 'toughest' ? y.hp - x.hp : pick === 'weakest' ? pct(x) - pct(y) : pick === 'lowest' ? x.hp - y.hp : skill.kind === 'heal' ? pct(x) - pct(y) : x.hp - y.hp;
      if (d) return d; d = (rowOf(x) === 'front' ? 0 : 1) - (rowOf(y) === 'front' ? 0 : 1); if (d) return d;
      return (x.col - y.col) || cmpId(x, y);
    });
    return l[0] || null;
  }
  function usable(S, u, id) {
    var sk = S.skills[id]; if (!sk) return null;
    if (sk.uses > 0 && (u.used[id] || 0) >= sk.uses) return null;
    if (sk.from && rowOf(u) !== sk.from) return null;
    return sk;
  }
  // the built-in evaluator: first enabled rule whose condition holds and whose action is usable on a valid target wins
  function evaluate(S, u, ctx) {
    var rules = rulesOf(u), tried = [];
    for (var i = 0; i < rules.length; i++) {
      var p = ruleParts(rules[i]); if (!p || !p.on) continue;
      var cf = S.conditions[p.cond];
      if (!cf) { tried.push({ index: i, skip: 'unknown condition' }); continue; }
      var c; try { c = cf(ctx, p.value) || { ok: false }; } catch (e) { c = { ok: false }; }
      if (!c.ok) { tried.push({ index: i, skip: 'condition false', note: c.note }); continue; }
      if (!p.use || (u.skills.length && !has(u.skills, p.use) && !has(S.extraSkills, p.use))) { tried.push({ index: i, skip: 'skill not known' }); continue; }
      var sk = usable(S, u, p.use); if (!sk) { tried.push({ index: i, skip: 'not usable here' }); continue; }
      var cand = S.targetsFor(u, sk, ctx.allies, ctx.enemies);
      if (c.filter && ((sk.kind === 'heal') === (p.cond === 'allyHpBelow'))) cand = cand.filter(c.filter);   // ally filters narrow heals, foe filters narrow attacks
      if (!cand.length) { tried.push({ index: i, skip: 'no target' }); continue; }
      return { skill: p.use, sk: sk, target: pickTarget(cand, sk, p.pick), rule: i, cond: p.cond, value: p.value, note: c.note, tried: tried };
    }
    var ow = u.rules && !Array.isArray(u.rules) && u.rules.otherwise; ow = ow && typeof ow === 'object' ? ow.do || ow.use : ow;
    if (ow != null) { var so = usable(S, u, String(ow)); if (so) { var co = S.targetsFor(u, so, ctx.allies, ctx.enemies); if (co.length) return { skill: String(ow), sk: so, target: pickTarget(co, so), rule: -1, cond: 'otherwise', note: 'no rule held', tried: tried }; } }
    for (var k = 0; k < u.skills.length; k++) {   // default: the first usable skill with a target
      var s2 = usable(S, u, u.skills[k]); if (!s2 || s2.follow) continue;
      var c2 = S.targetsFor(u, s2, ctx.allies, ctx.enemies); if (!c2.length) continue;
      return { skill: u.skills[k], sk: s2, target: pickTarget(c2, s2), rule: -1, cond: 'default', note: 'no rule held', tried: tried };
    }
    return null;
  }

  /* ---------- 4. the simulation (pure: same input + seed -> same log) ---------- */
  function normSquad(sq, side) {
    var list = squadList(sq), bySlot = !!(sq && !Array.isArray(sq) && Array.isArray(sq.slots));
    var out = [];
    list.forEach(function (u, i) {
      if (!u) return;
      var row = bySlot ? (i >= 3 ? 'back' : 'front') : rowOf(u), col = bySlot ? i % 3 : u.col != null ? clamp(u.col | 0, 0, 2) : u.slot != null ? (+u.slot) % 3 : i % 3;
      var tags = arr(u.tags).concat(arr(u.traits)).map(String);
      var maxHp = Math.max(1, +u.maxHp || +u.hpMax || +u.hp || 1);
      out.push({
        id: String(u.id != null ? u.id : side + i), name: String(u.name || u.id || side + i), cls: String(u.cls || u.class || u.look || 'knight'),
        side: side, order: i, row: row, col: col, tags: tags,
        hp: clamp(Math.round(u.hp != null ? +u.hp : maxHp), 0, maxHp), maxHp: maxHp,
        atk: +u.atk || 0, def: +u.def || 0, mag: +u.mag || 0, res: +u.res || 0, spd: +u.spd || 0,
        crit: u.crit != null ? +u.crit : null,
        skills: arr(u.skills).map(String), rules: u.rules && !Array.isArray(u.rules) && Array.isArray(u.rules.rules) ? u.rules : arr(u.rules), guard: !!(u.guard || has(tags, 'guard')),
        followUp: u.followUp ? String(u.followUp) : null, used: {}, guardRound: 0, followRound: 0, src: u
      });
    });
    return out;
  }
  // a squad: an array of units (each with row/col or slot), {units: [...]}, or an A-12 squad {slots: [6 units or null]}
  function squadList(sq) { return Array.isArray(sq) ? sq : sq && (sq.slots || sq.units || sq.members || sq.list) || []; }
  function physDamage(att, def, sk, mult) { var raw = att.atk * sk.power / 100; return Math.max(1, Math.round((raw * 1.5 - def.def * 0.75) * mult)); }
  function magDamage(att, def, sk, mult) { var raw = att.mag * sk.power / 100; return Math.max(1, Math.round((raw * 1.5 - def.res * 0.75) * mult)); }
  function decide(A, B, startA, startB, margin) {
    var la = A.filter(alive).length, lb = B.filter(alive).length;
    if (!lb && la) return 'win'; if (!la && lb) return 'lose'; if (!la && !lb) return 'draw';
    var keep = function (S, s0) { var a = 0, b = 0; S.forEach(function (u) { a += u.hp; }); s0.forEach(function (h) { b += h; }); return b > 0 ? a / b : 0; };
    var d = keep(A, startA) - keep(B, startB);
    return d > margin ? 'win' : d < -margin ? 'lose' : 'draw';
  }
  // simulate(squadA, squadB, opts) -> forecast. opts: {seed, rounds, crit, guard, followUps, margin, skills, conditions, targetsFor, evaluate}
  function simulate(sqA, sqB, opts) {
    opts = opts || {};
    var S = {
      skills: opts.skills || SKILLS, conditions: opts.conditions || CONDITIONS, extraSkills: [],
      targetsFor: typeof opts.targetsFor === 'function' ? opts.targetsFor : targetsFor
    };
    var evalFn = typeof opts.evaluate === 'function' ? opts.evaluate : null;
    var A = normSquad(sqA, 'a'), B = normSquad(sqB, 'b');
    var all = A.concat(B); all.forEach(function (u, i) { u.order = i; });
    var seed = (opts.seed >>> 0) || 1, rng = mulberry32(seed);
    var rounds = clamp((opts.rounds | 0) || 3, 1, 9), critBase = opts.crit != null ? +opts.crit : 0.08;
    var useGuard = opts.guard !== false && opts.guard !== 'off', useFollow = opts.followUps !== false && opts.followUps !== 'off';
    var margin = opts.margin != null ? +opts.margin : 0.1, backWeak = opts.backWeak != null ? +opts.backWeak : 1.25;
    var startA = A.map(function (u) { return u.hp; }), startB = B.map(function (u) { return u.hp; });
    var log = [], counts = { guards: 0, follows: 0, crits: 0, acts: 0, skips: 0 }, dealt = {}, taken = {};
    all.forEach(function (u) { dealt[u.id] = 0; taken[u.id] = 0; });
    var over = function () { return !A.some(alive) || !B.some(alive); };
    var mates = function (u) { return u.side === 'a' ? A : B; }, foes = function (u) { return u.side === 'a' ? B : A; };
    function strike(att, tgt, sk, tag, act) {
      var mult = 1, notes = [], guardBy = null, aimed = tgt;
      if (useGuard && !sk.area && (sk.kind === 'melee' || sk.kind === 'ranged') && tag !== 'follow') {
        var weak = rowOf(tgt) === 'back' || pct(tgt) < 0.5;
        if (weak) {
          var gs = mates(tgt).filter(function (g) { return g !== tgt && alive(g) && g.guard && rowOf(g) === 'front' && g.guardRound !== act.round; });
          gs.sort(function (x, y) { return Math.abs(x.col - tgt.col) - Math.abs(y.col - tgt.col) || cmpId(x, y); });
          if (gs[0]) { guardBy = gs[0]; guardBy.guardRound = act.round; tgt = guardBy; mult *= 0.6; notes.push('guard'); counts.guards++; }
        }
      }
      if (sk.kind === 'melee' || sk.kind === 'ranged') {
        if (hasTag(tgt, 'armored')) { mult *= 0.6; notes.push('armored'); }
        if (sk.kind === 'ranged' && hasTag(tgt, 'flying')) { mult *= 1.5; notes.push('flying'); }
        if (sk.kind === 'melee' && hasTag(tgt, 'flying')) { mult *= 0.8; }
      } else if (sk.kind === 'magic' && hasTag(tgt, 'armored')) { mult *= 1.3; notes.push('armored'); }
      if ((sk.kind === 'ranged' || sk.kind === 'magic') && rowOf(tgt) === 'back') { mult *= backWeak; notes.push('back row'); }
      var cr = att.crit != null ? att.crit : critBase;
      var crit = rng() < cr; if (crit) { mult *= 1.5; counts.crits++; }
      var dmg = sk.kind === 'magic' ? magDamage(att, tgt, sk, mult) : physDamage(att, tgt, sk, mult);
      var before = tgt.hp; tgt.hp = Math.max(0, tgt.hp - dmg);
      var amount = before - tgt.hp; dealt[att.id] += amount; taken[tgt.id] += amount;
      return { kind: 'damage', target: tgt.id, aimed: aimed.id, guardBy: guardBy ? guardBy.id : null, amount: amount, raw: dmg, crit: crit, notes: notes,
        type: sk.element || (sk.kind === 'magic' ? 'arcane' : 'physical'), hpBefore: before, hpAfter: tgt.hp, killed: before > 0 && tgt.hp === 0 };
    }
    function act(u, choice, round, tag) {
      var sk = choice.sk, e = { k: tag === 'follow' ? 'follow' : 'act', round: round, actor: u.id, side: u.side, skill: choice.skill, skillName: sk.name || choice.skill,
        kind: sk.kind, area: sk.area || null, rule: choice.rule, cond: choice.cond, value: choice.value, note: choice.note, hits: [] };
      if (sk.uses > 0) u.used[choice.skill] = (u.used[choice.skill] || 0) + 1;
      if (sk.kind === 'heal') {
        var t = choice.target, amt = Math.min(t.maxHp - t.hp, Math.max(1, Math.round(u.mag * sk.power / 100))), b = t.hp;
        t.hp += amt; e.hits.push({ kind: 'heal', target: t.id, aimed: t.id, guardBy: null, amount: amt, crit: false, notes: [], type: 'heal', hpBefore: b, hpAfter: t.hp, killed: false });
      } else {
        var list = [choice.target];
        if (sk.area === 'row') { var r = rowOf(choice.target); list = foes(u).filter(function (t) { return alive(t) && rowOf(t) === r; }); list.sort(function (x, y) { return x.col - y.col; }); }
        list.forEach(function (t) { if (alive(t)) e.hits.push(strike(u, t, sk, tag, e)); });
      }
      log.push(e);
      return e;
    }
    for (var r = 1; r <= rounds && !over(); r++) {
      var order = all.filter(alive).slice().sort(function (x, y) {
        return (y.spd - x.spd) || ((x.side === y.side) ? 0 : (x.side === (r % 2 ? 'a' : 'b') ? -1 : 1)) ||
          ((rowOf(x) === 'front' ? 0 : 1) - (rowOf(y) === 'front' ? 0 : 1)) || (x.col - y.col) || cmpId(x, y);
      });
      log.push({ k: 'round', round: r, order: order.map(function (u) { return u.id; }) });
      for (var i = 0; i < order.length && !over(); i++) {
        var u = order[i]; if (!alive(u)) continue;
        var ctx = { self: u, allies: mates(u), enemies: foes(u), round: r, side: u.side };
        var choice = null;
        if (evalFn) {
          try { var ex = evalFn(u, ctx); if (ex && ex.skill && S.skills[ex.skill]) { var tgt = ex.target && typeof ex.target === 'object' ? ex.target : all.filter(function (q) { return q.id === String(ex.target); })[0];
            if (tgt) choice = { skill: ex.skill, sk: S.skills[ex.skill], target: tgt, rule: ex.rule != null ? ex.rule : -1, cond: ex.cond || 'host', note: ex.why || ex.note || '' }; } } catch (e) { choice = null; }
        }
        if (!choice) choice = evaluate(S, u, ctx);
        if (!choice) { log.push({ k: 'skip', round: r, actor: u.id, side: u.side, note: 'nothing in reach' }); counts.skips++; continue; }
        var e = act(u, choice, r, null); counts.acts++;
        // follow-up: one ally of the actor joins a single-target physical attack on a foe still standing
        if (useFollow && !over() && !choice.sk.area && (choice.sk.kind === 'melee' || choice.sk.kind === 'ranged') && e.hits.length) {
          var struck = all.filter(function (q) { return q.id === e.hits[0].target; })[0];
          if (struck && alive(struck)) {
            var fs = mates(u).filter(function (f) { return f !== u && alive(f) && f.followUp && S.skills[f.followUp] && f.followRound !== r; })
              .filter(function (f) { return S.targetsFor(f, S.skills[f.followUp], mates(f), foes(f)).indexOf(struck) >= 0; });
            fs.sort(function (x, y) { return Math.abs(x.col - struck.col) - Math.abs(y.col - struck.col) || cmpId(x, y); });
            if (fs[0]) { fs[0].followRound = r; counts.follows++; var fe = act(fs[0], { skill: fs[0].followUp, sk: S.skills[fs[0].followUp], target: struck, rule: -2, cond: 'follow', note: 'joins ' + u.name }, r, 'follow'); fe.of = u.id; }
          }
        }
      }
    }
    var result = decide(A, B, startA, startB, margin);
    var endedRound = 0; log.forEach(function (e) { if (e.round) endedRound = e.round; });
    log.push({ k: 'end', result: result, round: endedRound });
    var units = {}, tot = { a: { before: 0, after: 0, max: 0, fall: 0 }, b: { before: 0, after: 0, max: 0, fall: 0 } };
    var start = {}; A.forEach(function (u, i) { start[u.id] = startA[i]; }); B.forEach(function (u, i) { start[u.id] = startB[i]; });
    all.forEach(function (u) {
      var fell = start[u.id] > 0 && u.hp === 0;
      units[u.id] = { id: u.id, side: u.side, name: u.name, cls: u.cls, hpBefore: start[u.id], hpAfter: u.hp, maxHp: u.maxHp, fell: fell, dealt: dealt[u.id], taken: taken[u.id] };
      var T = tot[u.side]; T.before += start[u.id]; T.after += u.hp; T.max += u.maxHp; if (fell) T.fall++;
    });
    return { version: VERSION, seed: seed, rounds: rounds, result: result, endedRound: endedRound, log: log, units: units, totals: tot, counts: counts,
      key: signatureOf(units, result) };
  }
  function signatureOf(units, result) { var ids = Object.keys(units).sort(); return result + '|' + ids.map(function (id) { return id + ':' + units[id].hpAfter; }).join(','); }
  // the input fingerprint: anything that can change the sim (stats, hp, row/col, skills, rules)
  function inputKey(sqA, sqB, opts) {
    var f = function (sq, side) { return normSquad(sq, side).map(function (u) { return [u.id, u.row, u.col, u.hp, u.maxHp, u.atk, u.def, u.mag, u.res, u.spd, u.crit, u.tags.join('+'), u.skills.join('+'), u.guard ? 1 : 0, u.followUp, JSON.stringify(rulesOf(u).map(ruleParts)) + JSON.stringify(u.rules && u.rules.otherwise || null)].join('/'); }).join(';'); };
    return f(sqA, 'a') + '#' + f(sqB, 'b') + '#' + [opts.seed, opts.rounds, opts.crit, opts.guard, opts.followUps, opts.margin, opts.backWeak, !!opts.evaluate, !!opts.targetsFor].join(',');
  }

  /* ---------- 5. the instance ---------- */
  var DEFAULTS = { rounds: 3, speed: 1, crit: 0.08, guard: 'on', followUps: 'on', margin: 0.1, backWeak: 1.25, numbers: 'on', order: 'on', why: 'on', forecast: 'bars', bars: 'on', shake: 'on', rings: 'on', seedLabel: 'off', unitScale: 1.18 };
  function create(opt) {
    opt = opt || {};
    var P = {}; for (var k in DEFAULTS) P[k] = DEFAULTS[k]; setParams(opt.params);
    var warned = {};
    var skills = {}; for (k in SKILLS) skills[k] = SKILLS[k]; if (opt.skills) for (k in opt.skills) skills[k] = opt.skills[k];
    var looks = {}; for (k in LOOKS) looks[k] = LOOKS[k]; if (opt.looks) for (k in opt.looks) looks[k] = opt.looks[k];
    var conds = {}; for (k in CONDITIONS) conds[k] = CONDITIONS[k]; if (opt.conditions) for (k in opt.conditions) conds[k] = opt.conditions[k];
    var SK = null; try { SK = root.GameDNA_Skin && opt.skin != null && opt.skin !== false ? root.GameDNA_Skin.resolve(opt.skin) : null; } catch (e) { SK = null; }
    var squads = { a: [], b: [] }, seed = (opt.seed >>> 0) || 1;
    var fcCache = { key: null, fc: null };
    var play = null;          // the running playback: {fc, beats, bi, bt, fired, start, live, outcome}
    var lastOutcome = null, phase = 'idle', t = 0, stop = 0, paused = false, fast = 1;
    var fx = [], nums = [], unitFx = {}, rects = [], lastV = null, stats = { clashes: 0, matches: 0, mismatches: 0, hits: 0 };

    function setParams(o) { if (o) for (var key in o) if (key in DEFAULTS && o[key] != null) P[key] = typeof DEFAULTS[key] === 'number' ? +o[key] : String(o[key]); }
    function call(name) { var f = opt[name]; if (typeof f !== 'function') return undefined; try { return f.apply(null, [].slice.call(arguments, 1)); } catch (e) { warnOnce(warned, 'cb-' + name, name + ' threw: ' + (e && e.message)); return undefined; } }
    function V() { var v = opt.view; if (typeof v === 'function') try { v = v(); } catch (e) { v = null; } if (v && v.w > 0 && v.h > 0) return lastV = { x: +v.x || 0, y: +v.y || 0, w: +v.w, h: +v.h }; return lastV || { x: 0, y: 0, w: 640, h: 360 }; }
    function simOpts(sd) { return { seed: sd != null ? sd : seed, rounds: P.rounds, crit: P.crit, guard: P.guard !== 'off', followUps: P.followUps !== 'off', margin: P.margin, backWeak: P.backWeak, skills: skills, conditions: conds, targetsFor: opt.targetsFor, evaluate: opt.evaluate }; }
    function liveList(side) { return squadList(squads[side]).filter(function (u) { return !!u; }); }
    function liveById(id) { var l = liveList('a').concat(liveList('b')); for (var i = 0; i < l.length; i++) if (l[i] && String(l[i].id) === String(id)) return l[i]; return null; }
    function sideOf(id) { return liveList('a').some(function (u) { return u && String(u.id) === String(id); }) ? 'a' : 'b'; }

    /* forecast: run the sim on the current squads; cached until anything that matters changes */
    function forecast(sd) {
      var o = simOpts(sd), key = inputKey(squads.a, squads.b, o);
      if (fcCache.key === key && fcCache.fc) return fcCache.fc;
      var fc; try { fc = simulate(squads.a, squads.b, o); } catch (e) { warnOnce(warned, 'sim', 'simulation failed: ' + e.message); return null; }
      fcCache = { key: key, fc: fc };
      call('onForecast', fc);
      return fc;
    }

    /* playback: the forecast's log as timed beats; hits fire on the impact frame */
    var BEAT = { focus: 300, approach: 230, impact: 40, recover: 280, back: 220, draw: 240, flight: 260, cast: 380, round: 760, skip: 520, followTag: 160 };
    function beatsOf(log) {
      var out = [];
      log.forEach(function (e, i) {
        if (e.k === 'round') out.push({ e: e, i: i, type: 'round', dur: BEAT.round, at: 0 });
        else if (e.k === 'skip') out.push({ e: e, i: i, type: 'skip', dur: BEAT.skip, at: 0 });
        else if (e.k === 'act' || e.k === 'follow') {
          var lead = e.k === 'follow' ? BEAT.followTag : BEAT.focus, b = { e: e, i: i, type: e.k, kind: e.kind, lead: lead };
          if (e.kind === 'melee') { b.at = lead + BEAT.approach; b.dur = b.at + BEAT.recover + BEAT.back; }
          else if (e.kind === 'ranged') { b.at = lead + BEAT.draw + BEAT.flight; b.dur = b.at + BEAT.recover; }
          else { b.at = lead + BEAT.cast; b.dur = b.at + BEAT.recover + 80; }
          if (e.hits.some(function (h) { return h.killed; })) b.dur += 180;
          out.push(b);
        } else if (e.k === 'end') out.push({ e: e, i: i, type: 'end', dur: 1e9, at: 0 });
      });
      return out;
    }
    function snapshotLive() { var o = {}; liveList('a').concat(liveList('b')).forEach(function (u) { if (u) o[String(u.id)] = Math.max(0, Math.round(+u.hp || 0)); }); return o; }
    function commit(sd) {
      if (play && phase === 'playing') return play.fc;
      var fc = forecast(sd); if (!fc) return null;
      fx = []; nums = []; unitFx = {};
      play = { fc: fc, beats: beatsOf(fc.log), bi: 0, bt: 0, fired: {}, start: snapshotLive(), outcome: null };
      lastOutcome = null; phase = 'playing'; stats.clashes++;
      call('onPhase', 'playing'); call('onEvent', { kind: 'commit', forecast: fc });
      return fc;
    }
    function fire(b) {
      var e = b.e;
      if (b.type === 'round') { call('onEvent', { kind: 'round', round: e.round, order: e.order.slice() }); return; }
      if (b.type === 'skip') { call('onEvent', { kind: 'skip', actor: e.actor, why: e.note }); return; }
      if (b.type === 'end') { finish(); return; }
      var actorLive = liveById(e.actor);
      e.hits.forEach(function (h) {
        var u = liveById(h.target); if (!u) { warnOnce(warned, 'nolive-' + h.target, 'unit ' + h.target + ' left the squad during the clash'); return; }
        var before = Math.max(0, Math.round(+u.hp || 0)), after;
        if (h.kind === 'heal') after = Math.min(+u.maxHp || before, before + h.amount); else after = Math.max(0, before - h.amount);
        u.hp = after; stats.hits++;
        var ev = { kind: h.kind, source: e.actor, target: h.target, aimed: h.aimed, guardBy: h.guardBy, side: sideOf(h.target), amount: Math.abs(after - before),
          crit: h.crit, type: h.type, skill: e.skill, skillName: e.skillName, tag: e.k === 'follow' ? 'followUp' : h.guardBy ? 'guard' : null,
          hpBefore: before, hpAfter: after, killed: before > 0 && after === 0, round: e.round, anchor: anchor(h.target) };
        var a = anchor(h.target);
        if (h.kind === 'heal') { addFx({ type: 'heal', x: a.x, y: a.footY, s: a.s, life: 700 }); }
        else {
          hurt(h.target, h.crit ? 300 : 220);
          var col = h.type === 'fire' ? '#ffb347' : h.type === 'shock' ? '#bfe8ff' : h.type === 'arcane' ? '#d39bff' : '#fff4d6';
          addFx({ type: 'spark', x: a.x - (ev.side === 'a' ? -1 : 1) * a.w * 0.2, y: a.cy, s: a.s, col: col, crit: h.crit, life: h.crit ? 520 : 380, seed: stats.hits });
          if (h.guardBy) addFx({ type: 'shield', id: h.guardBy, life: 560 });
          if (P.shake !== 'off') call('onShake', h.crit ? 6 : 3, h.crit ? 220 : 140);
        }
        if (P.numbers !== 'off') addNum(h.target, ev);
        if (ev.killed) { unitFx[h.target] = unitFx[h.target] || {}; unitFx[h.target].fall = 0; }
        call('onHit', ev);
        if (ev.killed) call('onEvent', { kind: 'fall', unit: h.target, by: e.actor, round: e.round });
      });
      if (actorLive == null) warnOnce(warned, 'noactor', 'actor ' + e.actor + ' is not in the live squads');
    }
    function finish() {
      if (!play || play.outcome) return;
      var fc = play.fc, live = snapshotLive(), diffs = [];
      Object.keys(fc.units).forEach(function (id) { var want = fc.units[id].hpAfter, got = live[id]; if (got !== want) diffs.push({ id: id, forecast: want, played: got }); });
      var A = normSquad(squads.a, 'a'), B = normSquad(squads.b, 'b');
      var sA = A.map(function (u) { return play.start[u.id] || 0; }), sB = B.map(function (u) { return play.start[u.id] || 0; });
      var result = decide(A, B, sA, sB, P.margin);
      var match = !diffs.length && result === fc.result;
      play.outcome = lastOutcome = { result: result, forecastResult: fc.result, match: match, diffs: diffs, hp: live, seed: fc.seed, rounds: fc.endedRound, key: fc.key };
      if (match) stats.matches++; else { stats.mismatches++; warnOnce(warned, 'mismatch' + stats.clashes, 'played result differs from the forecast: ' + JSON.stringify(diffs.slice(0, 4)) + ' ' + result + ' vs ' + fc.result); }
      phase = 'done'; play.endT = t;
      call('onEvent', { kind: 'end', result: result, match: match });
      call('onPhase', 'done');
      call('onEnd', result, lastOutcome);
    }
    function current() { return play && play.beats[play.bi] || null; }
    function update(dt) {
      try {
        dt = dt == null ? 1000 / 60 : +dt || 0;
        if (paused) dt = 0;
        if (stop > 0 && dt > 0) { stop = Math.max(0, stop - dt); dt = 0; }
        t += dt;
        for (var i = fx.length - 1; i >= 0; i--) { fx[i].age += dt; if (fx[i].age >= fx[i].life) fx.splice(i, 1); }
        for (i = nums.length - 1; i >= 0; i--) { nums[i].age += dt; if (nums[i].age >= nums[i].life) nums.splice(i, 1); }
        for (var id in unitFx) { var f = unitFx[id]; if (f.hurt > 0) f.hurt = Math.max(0, f.hurt - dt); if (f.fall != null) f.fall += dt; }
        if (!play || phase !== 'playing' || dt <= 0) return;
        var left = dt * P.speed * fast, guard = 0;
        while (left > 0 && guard++ < 200 && phase === 'playing') {
          var b = current(); if (!b) break;
          var key = play.bi;
          if (!play.fired[key] && play.bt + left >= b.at) { play.fired[key] = 1; fire(b); if (phase !== 'playing') break; }
          var rest = b.dur - play.bt;
          if (left < rest) { play.bt += left; left = 0; }
          else { left -= rest; play.bi++; play.bt = 0; }
        }
      } catch (e) { warnOnce(warned, 'update', 'update failed: ' + e.message); }
    }

    /* effects (all aged in update) */
    function addFx(o) { o.age = 0; fx.push(o); if (fx.length > 80) fx.shift(); }
    function hurt(id, ms) { unitFx[id] = unitFx[id] || {}; unitFx[id].hurt = ms; unitFx[id].hurtMax = ms; }
    function addNum(id, ev) {
      if (!ev.amount && ev.kind === 'heal') return;
      var used = nums.filter(function (n) { return n.id === id; }).map(function (n) { return n.stack; }), same = 0; while (used.indexOf(same) >= 0) same++;
      nums.push({ id: id, text: (ev.kind === 'heal' ? '+' : '') + ev.amount, kind: ev.kind, crit: ev.crit, type: ev.type, age: 0, life: 850, stack: same });
    }

    /* layout: home spots on the stage (logical px of view) */
    function scaleOf() { var v = V(); return v.h / 360; }
    function home(side, row, col) {
      var v = V(), cx = v.x + v.w / 2, s = scaleOf();
      var LY = opt.layout || {}, num = function (q, d) { return typeof q === 'number' && isFinite(q) ? q : d; };
      var dx = (row === 'back' ? num(LY.back, 0.3) : num(LY.front, 0.135)) * v.w + (col - 1) * num(LY.colDx, 0.05) * v.w;
      var x = side === 'a' ? cx - dx : cx + dx;
      var footY = v.y + v.h * (num(LY.y0, 0.5) + col * num(LY.colDy, 0.095));
      return { x: x, footY: footY, s: s * P.unitScale * (0.9 + col * 0.07) };
    }
    function unitInfo(id) {
      var l = liveList('a'), side = 'a', u = null, i;
      for (i = 0; i < l.length; i++) if (l[i] && String(l[i].id) === String(id)) { u = l[i]; break; }
      if (!u) { l = liveList('b'); side = 'b'; for (i = 0; i < l.length; i++) if (l[i] && String(l[i].id) === String(id)) { u = l[i]; break; } }
      if (!u) return null;
      var sq = squads[side], bySlot = !!(sq && !Array.isArray(sq) && Array.isArray(sq.slots)), si = bySlot ? sq.slots.indexOf(u) : -1;
      var col = si >= 0 ? si % 3 : u.col != null ? clamp(u.col | 0, 0, 2) : u.slot != null ? (+u.slot) % 3 : i % 3;
      return { u: u, side: side, row: si >= 0 ? (si >= 3 ? 'back' : 'front') : rowOf(u), col: col, look: lookOf(u) };
    }
    function lookOf(u) { var L = u.look && typeof u.look === 'object' ? u.look : looks[u.look] || looks[u.cls] || looks[u.class]; return L || looks.knight; }
    function sizeOf(L, s) { return L.w > 0 && L.h > 0 ? { w: L.w * s, h: L.h * s } : L.kind === 'beast' ? { w: 50 * s, h: 34 * s } : L.kind === 'bird' ? { w: 46 * s, h: 40 * s } : { w: (L.bulky ? 40 : 34) * s, h: (L.bulky ? 62 : 58) * s }; }
    function homeAnchor(id) {
      var I = unitInfo(id); if (!I) return null;
      var hp = home(I.side, I.row, I.col), sz = sizeOf(I.look, hp.s), lift = I.look.lift != null ? I.look.lift * hp.s : I.look.kind === 'bird' ? 16 * hp.s : 0;
      var dead = !(+I.u.hp > 0), lying = dead && !I.look.noBody, spriteTop = lying ? hp.footY - 24 * hp.s : hp.footY - sz.h - lift, barTop = spriteTop - 12 * hp.s;
      return { id: String(id), side: I.side, row: I.row, col: I.col, x: hp.x, footY: hp.footY, top: barTop, spriteTop: spriteTop, left: hp.x - sz.w / 2, w: sz.w, h: hp.footY - barTop,
        cy: lying ? hp.footY - 12 * hp.s : hp.footY - lift - sz.h * 0.5, s: hp.s, dead: dead };
    }
    // public anchor: where the unit is drawn NOW (follows a dash or a guard step-in); {home: true} = its formation spot
    function anchor(id, o) {
      var A = homeAnchor(id); if (!A || (o && o.home) || A.dead) return A;
      var P = poseOf(id, unitInfo(id)); if (!P.dx && !P.dy) return A;
      A.homeX = A.x; A.homeFootY = A.footY; A.x += P.dx; A.left += P.dx; A.footY += P.dy; A.top += P.dy; A.spriteTop += P.dy; A.cy += P.dy;
      return A;
    }
    function slotRect(side, row, col) { var hp = home(side, row, col), w = 44 * hp.s, h = 20 * hp.s; return { x: hp.x - w / 2, y: hp.footY - h / 2, w: w, h: h, cx: hp.x, cy: hp.footY, s: hp.s }; }

    // where a melee attacker lands: next to its target, on the candidate spot that covers other units the least
    // (a little lower, or a step short). Drawing only; from home positions, so frozen frames match play.
    function landing(me, h0, A, x, y, dir) {
      var skip = {}; skip[me] = 1; if (h0) { skip[h0.target] = 1; skip[h0.aimed] = 1; if (h0.guardBy) skip[h0.guardBy] = 1; }
      var others = []; ['a', 'b'].forEach(function (sd) { liveList(sd).forEach(function (u) { if (!u || skip[String(u.id)] || !(+u.hp > 0)) return; var O = homeAnchor(String(u.id)); if (O) others.push(O); }); });
      var s = A.s, h = A.footY - A.spriteTop, best = null;
      [[0, 0], [0, 9], [-9, 5], [0, 16], [-9, 14], [-16, 9]].forEach(function (c, i) {
        var cx = x + dir * c[0] * s, cy = y + c[1] * s, cost = i * 0.02;
        others.forEach(function (O) { var oh = O.footY - O.spriteTop, ox = Math.max(0, Math.min(cx + A.w / 2, O.x + O.w / 2) - Math.max(cx - A.w / 2, O.x - O.w / 2)), oy = Math.max(0, Math.min(cy, O.footY) - Math.max(cy - h, O.footY - oh)); cost += ox * oy / (O.w * oh + 1); });
        if (!best || cost < best.cost - 1e-9) best = { x: cx, y: cy, cost: cost };
      });
      return best;
    }

    /* pose of a unit at this moment (derived from playback state only) */
    function poseOf(id, I) {
      var o = { dx: 0, dy: 0, pose: 'idle', k: 0, glow: 0, active: false };
      var b = current();
      if (b && phase === 'playing' && (b.type === 'act' || b.type === 'follow')) {
        var e = b.e, tt = play.bt, me = String(id);
        if (e.actor === me) {
          o.active = true;
          if (e.kind === 'melee') {
            var h0 = e.hits[0], tg = homeAnchor(h0 ? (h0.guardBy ? h0.aimed : h0.target) : e.actor), A = homeAnchor(me), gd = h0 && h0.guardBy ? homeAnchor(h0.guardBy) : null;
            // a guarded blow stops short: the guard steps in between (it stands at the aimed ally's front)
            var dir = I.side === 'a' ? 1 : -1, reach = tg ? (tg.x - dir * (tg.w * 0.5 + (gd ? gd.w * 0.9 : 0) + A.w * 0.55)) - A.x : 0;
            var dyT = tg ? tg.footY - A.footY : 0;
            if (tg) { var spot = landing(me, h0, A, A.x + reach, tg.footY, dir); reach = spot.x - A.x; dyT = spot.y - A.footY; }
            if (tt < b.lead) { o.pose = 'ready'; o.k = tt / b.lead; o.dx = -dir * 4 * A.s * easeOut(o.k); }
            else if (tt < b.at) { var k = easeIn((tt - b.lead) / (b.at - b.lead)); o.pose = 'dash'; o.dx = reach * k; o.dy = dyT * k; o.k = k; }
            else if (tt < b.at + BEAT.recover) { o.pose = 'strike'; o.k = (tt - b.at) / BEAT.recover; o.dx = reach; o.dy = dyT; }
            else { var k2 = easeInOut((tt - b.at - BEAT.recover) / BEAT.back); o.pose = 'idle'; o.dx = reach * (1 - k2); o.dy = dyT * (1 - k2); o.ret = clamp((tt - b.at - BEAT.recover) / BEAT.back, 0, 1); }
          } else if (e.kind === 'ranged') {
            o.pose = tt < b.at - BEAT.flight ? 'draw' : 'loose'; o.k = clamp(tt / (b.at - BEAT.flight), 0, 1);
          } else {
            o.pose = tt < b.at + 120 ? 'cast' : 'idle'; o.k = clamp(tt / b.at, 0, 1); o.glow = tt < b.at + 200 ? Math.min(1, tt / (b.at * 0.7)) : 0;
          }
        }
        // a guard steps in front of the unit it covers before the impact, and back after
        e.hits.forEach(function (h) {
          if (h.guardBy !== me) return;
          var G = homeAnchor(me), C = homeAnchor(h.aimed); if (!G || !C) return;
          var dirg = I.side === 'a' ? 1 : -1, gx = C.x + dirg * (C.w * 0.5 + G.w * 0.35) - G.x, gy = C.footY + 2 * G.s - G.footY;
          var start = b.at - 220, k3 = tt < start ? 0 : tt < b.at ? easeOut((tt - start) / 220) : tt < b.dur - 200 ? 1 : 1 - easeInOut((tt - (b.dur - 200)) / 200);
          if (k3 > 0) { o.dx = gx * k3; o.dy = gy * k3; o.pose = 'guard'; o.k = k3; o.guarding = true; }
        });
      }
      if (b && phase === 'playing' && b.type === 'end') o.pose = 'idle';
      if (phase === 'done' && lastOutcome && +I.u.hp > 0) { var won = (lastOutcome.result === 'win') === (I.side === 'a'); if (lastOutcome.result !== 'draw' && won) { o.pose = 'cheer'; o.k = (t % 900) / 900; } }
      return o;
    }

    /* ---------- drawing ---------- */
    function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function tok(path, d) { try { var v = SK && SK.token(path); return typeof v === 'string' && v.charAt(0) === '#' ? v : d; } catch (e) { return d; } }
    function panel(g, x, y, w, h, o) {
      o = o || {}; var r = o.r != null ? o.r : 8 * scaleOf();
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 10 * scaleOf(); g.shadowOffsetY = 3 * scaleOf();
      var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, o.top || tok('ui.fill', '#2a2340')); gr.addColorStop(1, o.bottom || tok('ui.fillTo', '#16121f'));
      g.globalAlpha = o.alpha != null ? o.alpha : 0.94; rr(g, x, y, w, h, r); g.fillStyle = gr; g.fill();
      g.shadowColor = 'transparent'; g.globalAlpha = 1;
      g.lineWidth = Math.max(1, 1.2 * scaleOf()); g.strokeStyle = o.edge || tok('ui.edge', '#c9a35a'); g.globalAlpha = 0.85; g.stroke();
      var sh = Math.min(h * 0.4, 12 * scaleOf()), sg = g.createLinearGradient(0, y + 2, 0, y + 2 + sh); sg.addColorStop(0, 'rgba(255,255,255,0.16)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalAlpha = 1; rr(g, x + 2, y + 2, w - 4, sh, Math.max(1, r - 2)); g.fillStyle = sg; g.fill();
      if (w > 60 * scaleOf() && h > 30 * scaleOf()) { g.globalAlpha = 0.22; g.lineWidth = Math.max(0.6, 0.7 * scaleOf()); g.strokeStyle = o.edge || tok('ui.edge', '#c9a35a'); rr(g, x + 3 * scaleOf(), y + 3 * scaleOf(), w - 6 * scaleOf(), h - 6 * scaleOf(), Math.max(1, r - 3 * scaleOf())); g.stroke(); }
      g.restore();
    }
    function text(g, s, x, y, o) {
      o = o || {}; var sc = scaleOf(), size = (o.size || 12) * sc;
      g.save(); g.font = (o.weight || 700) + ' ' + size.toFixed(1) + 'px ' + (o.font === 'display' ? FONT_D : FONT); g.textAlign = o.align || 'left'; g.textBaseline = o.base || 'alphabetic';
      if (o.spacing && 'letterSpacing' in g) { try { g.letterSpacing = (o.spacing * sc).toFixed(1) + 'px'; } catch (e) {} }
      if (o.alpha != null) g.globalAlpha *= o.alpha;
      if (o.outline !== false) { g.lineJoin = 'round'; g.lineWidth = (o.ow || 3) * sc; g.strokeStyle = o.ocol || 'rgba(12,8,20,0.92)'; g.strokeText(s, x, y); }
      g.fillStyle = o.color || tok('text.main', '#fff6e4'); g.fillText(s, x, y);
      var w = g.measureText(s).width; g.restore(); return w;
    }
    function measure(g, s, size, weight) { g.save(); g.font = (weight || 700) + ' ' + (size * scaleOf()).toFixed(1) + 'px ' + FONT; var w = g.measureText(s).width; g.restore(); return w; }

    // the built-in painter. (x, footY) = feet, s = scale, dir = 1 facing right, P = pose
    var flashCanvas = null;
    function paintUnit(g, L, x, footY, s, dir, P, tm, flash, alpha, dead) {
      if (flash > 0 && typeof document !== 'undefined') {   // hit flash: paint into a layer, whiten only the sprite's pixels, composite
        try {
          var m = g.getTransform(), k = Math.max(0.5, Math.hypot(m.a, m.b)), W2 = Math.ceil(120 * s * k), H2 = Math.ceil(130 * s * k), base = 14 * s * k;
          if (!flashCanvas) flashCanvas = document.createElement('canvas');
          if (flashCanvas.width < W2 || flashCanvas.height < H2) { flashCanvas.width = Math.max(W2, flashCanvas.width); flashCanvas.height = Math.max(H2, flashCanvas.height); }
          var og = flashCanvas.getContext('2d');
          og.setTransform(1, 0, 0, 1, 0, 0); og.globalCompositeOperation = 'source-over'; og.globalAlpha = 1; og.clearRect(0, 0, flashCanvas.width, flashCanvas.height);
          og.setTransform(k, 0, 0, k, W2 / 2, H2 - base);
          paintUnit(og, L, 0, 0, s, dir, P, tm, 0, 1, dead);
          og.setTransform(1, 0, 0, 1, 0, 0); og.globalCompositeOperation = 'source-atop'; og.globalAlpha = flash; og.fillStyle = '#ffffff'; og.fillRect(0, 0, W2, H2);
          og.globalCompositeOperation = 'source-over'; og.globalAlpha = 1;
          g.save(); g.globalAlpha *= alpha; g.drawImage(flashCanvas, 0, 0, W2, H2, x - W2 / 2 / k, footY - (H2 - base) / k, W2 / k, H2 / k); g.restore();
          return;
        } catch (e) { /* fall through: draw without the flash */ }
      }
      g.save(); g.translate(x, footY); g.scale(dir * s, s); g.globalAlpha *= alpha;
      g.lineJoin = 'round'; g.lineCap = 'round';
      if (dead) { g.translate(0, L.kind === 'humanoid' ? -11 : -4); g.rotate(-Math.PI / 2 * (L.kind === 'humanoid' ? 0.94 : 0.15)); }
      if (L.kind === 'beast') paintBeast(g, L, P, tm); else if (L.kind === 'bird') paintBird(g, L, P, tm); else paintHumanoid(g, L, P, tm);
      g.restore();
    }
    function part(g, fill, lw) { g.fillStyle = fill; g.fill(); g.lineWidth = lw || 2.2; g.strokeStyle = INK; g.stroke(); }
    function shade(g, c1, c2, y0, y1) { var gr = g.createLinearGradient(-10, y0, 10, y1); gr.addColorStop(0, c1); gr.addColorStop(1, c2); return gr; }
    function mix(c, d, k) {
      var p = function (h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; };
      try { var a = p(c), b = p(d); return 'rgb(' + Math.round(lerp(a[0], b[0], k)) + ',' + Math.round(lerp(a[1], b[1], k)) + ',' + Math.round(lerp(a[2], b[2], k)) + ')'; } catch (e) { return c; }
    }
    function weaponAngle(P, w) {
      var base = w === 'spear' ? -0.25 : w === 'staff' ? -1.35 : w === 'bow' ? 0 : -1.05;
      if (P.pose === 'ready') return lerp(base, w === 'spear' ? -0.6 : -2.4, easeOut(P.k));
      if (P.pose === 'dash') return w === 'spear' ? -0.1 : -2.4;
      if (P.pose === 'strike') return w === 'spear' ? 0.02 : lerp(0.55, 0.35, P.k);
      if (P.pose === 'cast') return lerp(base, -1.75, easeOut(P.k * 1.5));
      if (P.pose === 'guard') return -0.6;
      if (P.pose === 'cheer') return -1.9;
      return base;
    }
    function paintHumanoid(g, L, P, tm) {
      var bob = Math.sin(tm * 3.2 + (L._ph || 0)) * 0.9, lean = P.pose === 'dash' ? 0.18 : P.pose === 'strike' ? 0.12 * (1 - P.k) : P.pose === 'hurt' ? -0.16 : P.pose === 'ready' ? -0.06 : 0;
      var big = L.bulky ? 1.12 : 1, jump = P.pose === 'cheer' ? -Math.abs(Math.sin(P.k * Math.PI)) * 7 : 0;
      g.save(); g.translate(0, jump); g.scale(big, big);
      // legs (step while dashing)
      var stride = P.pose === 'dash' ? Math.sin(P.k * Math.PI * 3) * 4 : 0;
      g.beginPath(); rr(g, -7 - stride * 0.5, -17, 6, 17, 2.5); part(g, mix(L.legs, '#000000', 0.25));
      g.beginPath(); rr(g, 1 + stride * 0.5, -17, 6, 17, 2.5); part(g, L.legs);
      g.beginPath(); rr(g, -8 - stride * 0.5, -3, 8, 4, 2); part(g, '#2a2030'); g.beginPath(); rr(g, 0 + stride * 0.5, -3, 9, 4, 2); part(g, '#2a2030');
      g.save(); g.translate(0, -17 + bob * 0.4); g.rotate(lean); g.translate(0, 17);
      // cape behind
      if (L.cape) { var w = Math.sin(tm * 2.4) * 2.5 + (P.pose === 'dash' ? -6 : 0); g.beginPath(); g.moveTo(-6, -38); g.quadraticCurveTo(-15 + w, -24, -16 + w, -9); g.lineTo(-4, -12); g.lineTo(4, -36); g.closePath(); part(g, shade(g, L.cape, mix(L.cape, '#000000', 0.4), -38, -9)); }
      // back arm
      g.beginPath(); rr(g, -11, -36, 6, 14, 3); part(g, mix(L.body, '#000000', 0.3));
      // torso / robe
      g.beginPath();
      if (L.robe) { g.moveTo(-8, -38); g.lineTo(8, -38); g.quadraticCurveTo(13, -18, 12, -6); g.lineTo(-12, -6); g.quadraticCurveTo(-13, -18, -8, -38); }
      else { g.moveTo(-9, -38); g.lineTo(9, -38); g.lineTo(10, -16); g.lineTo(-10, -16); }
      g.closePath(); part(g, shade(g, mix(L.body, '#ffffff', 0.18), mix(L.body, '#000000', 0.28), -38, -10));
      g.beginPath(); rr(g, L.robe ? -12 : -10.5, L.robe ? -22 : -20, L.robe ? 24 : 21, 4, 1.5); part(g, L.trim, 1.6);
      g.beginPath(); g.moveTo(-2, -37); g.lineTo(0, -31); g.lineTo(2, -37); g.lineWidth = 1.4; g.strokeStyle = mix(L.body, '#000000', 0.45); g.stroke();
      if (L.helm && !L.robe) { g.beginPath(); g.ellipse(-8, -37, 4.5, 3.4, 0, 0, 7); part(g, L.helm, 1.6); g.beginPath(); g.ellipse(8, -37, 4.5, 3.4, 0, 0, 7); part(g, L.helm, 1.6); }
      // head
      var hy = -48;
      g.beginPath(); g.arc(0, hy, 10, 0, 7); part(g, shade(g, mix(L.skin, '#ffffff', 0.15), mix(L.skin, '#000000', 0.2), hy - 10, hy + 10));
      if (L.helm) {
        g.beginPath(); g.arc(0, hy - 1, 11, Math.PI * 1.02, Math.PI * 2.02); g.lineTo(11, hy + 2); g.lineTo(L.visor ? 11 : 3, hy + 2); g.lineTo(L.visor ? 11 : 3, hy - 3); g.lineTo(-11, hy - 3); g.closePath();
        part(g, shade(g, mix(L.helm, '#ffffff', 0.35), mix(L.helm, '#000000', 0.35), hy - 12, hy + 2));
        if (L.visor) { g.beginPath(); g.moveTo(1, hy - 1); g.lineTo(10, hy - 1); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke(); }
        if (L.horns) { g.beginPath(); g.moveTo(-6, hy - 9); g.quadraticCurveTo(-16, hy - 14, -14, hy - 22); g.quadraticCurveTo(-10, hy - 15, -2, hy - 11); g.closePath(); part(g, '#efe2c4', 1.6);
          g.beginPath(); g.moveTo(5, hy - 10); g.quadraticCurveTo(13, hy - 16, 13, hy - 23); g.quadraticCurveTo(15, hy - 14, 9, hy - 8); g.closePath(); part(g, '#efe2c4', 1.6); }
        else if (!L.visor) { g.beginPath(); g.moveTo(-3, hy - 11); g.quadraticCurveTo(-12, hy - 19, -18 + Math.sin(tm * 3) * 1.5, hy - 12); g.quadraticCurveTo(-10, hy - 13, -4, hy - 8); g.closePath(); part(g, L.trim === '#e8c46a' ? '#d8433a' : L.trim, 1.4); }
      } else if (L.hat) {
        g.beginPath(); g.moveTo(-14, hy - 4); g.quadraticCurveTo(0, hy - 9, 14, hy - 4); g.lineTo(9, hy - 7); g.quadraticCurveTo(4, hy - 20, -6 + Math.sin(tm * 2) * 1.2, hy - 27); g.quadraticCurveTo(-4, hy - 16, -9, hy - 7); g.closePath();
        part(g, shade(g, mix(L.hat, '#ffffff', 0.2), mix(L.hat, '#000000', 0.3), hy - 27, hy - 4));
        g.beginPath(); g.moveTo(-9, hy - 7); g.lineTo(9, hy - 7); g.lineWidth = 2; g.strokeStyle = L.trim; g.stroke();
        g.beginPath(); g.moveTo(-10, hy - 5); g.quadraticCurveTo(-12, hy + 4, -9, hy + 9); g.lineTo(-6, hy - 2); g.closePath(); part(g, L.hair, 1.4);
      } else if (L.hood) {
        g.beginPath(); g.arc(0, hy, 12, Math.PI * 0.85, Math.PI * 2.1); g.quadraticCurveTo(12, hy + 6, 7, hy + 10); g.lineTo(6, hy - 2); g.quadraticCurveTo(0, hy - 7, -6, hy - 3); g.quadraticCurveTo(-11, hy + 4, -9, hy + 11); g.closePath();
        part(g, shade(g, mix(L.hood, '#ffffff', 0.18), mix(L.hood, '#000000', 0.3), hy - 12, hy + 10));
        g.beginPath(); g.moveTo(-2, hy - 5); g.quadraticCurveTo(3, hy - 7, 6, hy - 3); g.lineTo(2, hy - 3); g.closePath(); part(g, L.hair, 1.2);
      } else {
        g.beginPath(); g.moveTo(-10, hy + 2); g.quadraticCurveTo(-12, hy - 12, 0, hy - 12); g.quadraticCurveTo(10, hy - 12, 11, hy - 4); g.quadraticCurveTo(4, hy - 8, -2, hy - 5); g.quadraticCurveTo(-5, hy - 1, -6, hy + 5); g.closePath();
        part(g, shade(g, mix(L.hair, '#ffffff', 0.2), mix(L.hair, '#000000', 0.3), hy - 12, hy + 4), 1.8);
        if (L.bandana) { g.beginPath(); g.moveTo(-10, hy - 5); g.quadraticCurveTo(0, hy - 10, 11, hy - 6); g.lineTo(11, hy - 3); g.quadraticCurveTo(0, hy - 7, -10, hy - 2); g.closePath(); part(g, L.bandana, 1.4);
          g.beginPath(); g.moveTo(-10, hy - 4); g.lineTo(-16, hy - 1 + Math.sin(tm * 4)); g.lineTo(-14, hy + 2); g.closePath(); part(g, L.bandana, 1.2); }
      }
      if (!L.visor) {   // eye (closed while hurt, happy arc while cheering)
        if (P.pose === 'hurt') { g.beginPath(); g.moveTo(3, hy - 1); g.lineTo(7, hy + 1); g.moveTo(3, hy + 2); g.lineTo(7, hy); g.lineWidth = 1.4; g.strokeStyle = INK; g.stroke(); }
        else if (P.pose === 'cheer') { g.beginPath(); g.arc(5, hy + 1, 2.2, Math.PI * 1.1, Math.PI * 1.9); g.lineWidth = 1.5; g.strokeStyle = INK; g.stroke(); }
        else { g.beginPath(); g.ellipse(5, hy, 1.7, 2.6, 0, 0, 7); g.fillStyle = INK; g.fill(); g.beginPath(); g.arc(5.5, hy - 1, 0.7, 0, 7); g.fillStyle = '#fff'; g.fill(); }
        g.beginPath(); g.arc(7, hy + 4, 1.6, 0, 7); g.fillStyle = 'rgba(230,110,110,0.35)'; g.fill();
      }
      // front arm + weapon
      var ang = weaponAngle(P, L.weapon);
      g.save(); g.translate(5, -33);
      if (L.weapon === 'bow') {
        var pull = P.pose === 'draw' ? easeOut(P.k) * 7 : 0;
        g.beginPath(); rr(g, -2, -2, 12, 5, 2.5); part(g, mix(L.body, '#000000', 0.1));
        g.translate(11, 0);
        g.beginPath(); g.moveTo(-2, -15); g.quadraticCurveTo(9, 0, -2, 15); g.lineWidth = 3.2; g.strokeStyle = INK; g.stroke(); g.lineWidth = 1.8; g.strokeStyle = '#a8743c'; g.stroke();
        g.beginPath(); g.moveTo(-2, -15); g.lineTo(-2 - pull, 0); g.lineTo(-2, 15); g.lineWidth = 0.9; g.strokeStyle = '#f2ead8'; g.stroke();
        if (P.pose === 'draw') { g.beginPath(); g.moveTo(-2 - pull, 0); g.lineTo(14 - pull, 0); g.lineWidth = 1.4; g.strokeStyle = '#e8dcc0'; g.stroke(); g.beginPath(); g.moveTo(14 - pull, 0); g.lineTo(10 - pull, -2); g.lineTo(10 - pull, 2); g.closePath(); g.fillStyle = '#d9e2ea'; g.fill(); }
      } else {
        g.rotate(ang);
        if (L.weapon === 'sword') { g.beginPath(); g.moveTo(8, -1.8); g.lineTo(31, -1.2); g.lineTo(35, 0); g.lineTo(31, 1.2); g.lineTo(8, 1.8); g.closePath(); part(g, shade(g, '#ffffff', '#9fb0c4', -2, 2), 1.6); g.beginPath(); rr(g, 6, -5, 3, 10, 1); part(g, L.trim, 1.4); }
        else if (L.weapon === 'spear') { g.beginPath(); g.moveTo(-14, 0); g.lineTo(30, 0); g.lineWidth = 3.6; g.strokeStyle = INK; g.stroke(); g.lineWidth = 2; g.strokeStyle = '#9a6a3c'; g.stroke(); g.beginPath(); g.moveTo(29, -3.2); g.lineTo(41, 0); g.lineTo(29, 3.2); g.closePath(); part(g, '#dfe7ef', 1.4); g.beginPath(); g.moveTo(27, -3); g.lineTo(29, 3); g.lineWidth = 2; g.strokeStyle = L.trim; g.stroke(); }
        else if (L.weapon === 'staff') { g.beginPath(); g.moveTo(-10, 0); g.lineTo(26, 0); g.lineWidth = 3.6; g.strokeStyle = INK; g.stroke(); g.lineWidth = 2; g.strokeStyle = '#7a5434'; g.stroke();
          var orb = L.orb || '#9fd8ff', gl = 0.35 + (P.glow || 0) * 0.65; g.save(); g.globalCompositeOperation = 'lighter'; var rg = g.createRadialGradient(29, 0, 0, 29, 0, 11 + 8 * (P.glow || 0)); rg.addColorStop(0, orb); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha *= gl; g.fillStyle = rg; g.beginPath(); g.arc(29, 0, 11 + 8 * (P.glow || 0), 0, 7); g.fill(); g.restore();
          g.beginPath(); g.arc(29, 0, 4.2, 0, 7); part(g, orb, 1.4); g.beginPath(); g.arc(28, -1.4, 1.2, 0, 7); g.fillStyle = '#fff'; g.fill(); }
        else if (L.weapon === 'axe') { g.beginPath(); g.moveTo(-4, 0); g.lineTo(26, 0); g.lineWidth = 3.8; g.strokeStyle = INK; g.stroke(); g.lineWidth = 2.2; g.strokeStyle = '#7a5434'; g.stroke(); g.beginPath(); g.moveTo(20, -2); g.quadraticCurveTo(26, -12, 32, -9); g.quadraticCurveTo(29, 0, 32, 9); g.quadraticCurveTo(26, 12, 20, 2); g.closePath(); part(g, shade(g, '#eef2f6', '#8e9aa8', -10, 10), 1.6); }
        else if (L.weapon === 'dagger') { g.beginPath(); g.moveTo(7, -1.6); g.lineTo(20, 0); g.lineTo(7, 1.6); g.closePath(); part(g, '#e6edf3', 1.4); }
        g.beginPath(); rr(g, -2, -2.6, 11, 5.2, 2.6); part(g, mix(L.body, '#ffffff', 0.05), 1.8);
        g.beginPath(); g.arc(8, 0, 2.8, 0, 7); part(g, L.skin, 1.4);
      }
      g.restore();
      if (L.shield) {   // shield on the near side; raised and glowing while guarding
        var raise = P.pose === 'guard' ? P.k : 0;
        g.save(); g.translate(9 + raise * 6, -27 - raise * 4);
        g.beginPath(); g.moveTo(-6, -10); g.lineTo(6, -10); g.quadraticCurveTo(7, 4, 0, 11); g.quadraticCurveTo(-7, 4, -6, -10); g.closePath(); part(g, shade(g, mix(L.shield, '#ffffff', 0.25), mix(L.shield, '#000000', 0.3), -10, 11), 2);
        g.beginPath(); g.moveTo(-4.5, -6); g.lineTo(0, -1.5); g.lineTo(4.5, -6); g.lineWidth = 2; g.strokeStyle = L.trim; g.stroke();   // a chevron and a boss: an original device
        g.beginPath(); g.arc(0, 4, 2, 0, 7); g.fillStyle = L.trim; g.fill();
        g.restore();
      }
      g.restore(); g.restore();
    }
    function paintBeast(g, L, P, tm) {
      var run = P.pose === 'dash' ? Math.sin(P.k * Math.PI * 4) : 0, bob = Math.sin(tm * 4) * 0.6, lunge = P.pose === 'strike' ? (1 - P.k) * 5 : 0;
      g.save(); g.translate(lunge, bob);
      var legs = [[-12, 1], [-6, -1], [8, 1], [13, -1]];
      legs.forEach(function (l, i) { var sw = run * (i % 2 ? 4 : -4); g.beginPath(); g.moveTo(l[0], -12); g.lineTo(l[0] + sw, -1); g.lineWidth = 5.5; g.strokeStyle = INK; g.stroke(); g.lineWidth = 3.4; g.strokeStyle = i < 2 ? mix(L.body, '#000000', 0.25) : L.body; g.stroke(); });
      g.beginPath(); g.moveTo(-17, -18); g.quadraticCurveTo(-29, -26 + Math.sin(tm * 6) * 2, -27, -16); g.quadraticCurveTo(-22, -16, -17, -14); part(g, L.body, 1.8);
      g.beginPath(); g.ellipse(-1, -17, 18, 8.5, -0.05, 0, 7); part(g, shade(g, mix(L.body, '#ffffff', 0.15), mix(L.body, '#000000', 0.3), -25, -9));
      g.beginPath(); g.ellipse(1, -12.5, 11, 3.2, 0, 0, Math.PI); g.fillStyle = L.belly; g.fill();
      g.beginPath(); g.moveTo(6, -24); g.lineTo(7, -31); g.lineTo(11, -25); g.closePath(); part(g, mix(L.body, '#000000', 0.2), 1.6);
      g.beginPath(); g.ellipse(17, -21, 8.5, 7, 0, 0, 7); part(g, shade(g, mix(L.body, '#ffffff', 0.2), mix(L.body, '#000000', 0.25), -28, -14));
      var jaw = P.pose === 'strike' ? 3 : P.pose === 'dash' ? 1.5 : 0;
      g.beginPath(); g.moveTo(22, -24); g.lineTo(31, -21); g.lineTo(30, -18); g.lineTo(22, -17); g.closePath(); part(g, mix(L.body, '#ffffff', 0.1), 1.6);
      g.beginPath(); g.moveTo(22, -16.5); g.lineTo(29, -16 + jaw); g.lineTo(22, -14 + jaw * 0.5); g.closePath(); part(g, mix(L.body, '#000000', 0.2), 1.4);
      g.beginPath(); g.arc(31, -21, 1.5, 0, 7); g.fillStyle = INK; g.fill();
      g.beginPath(); g.moveTo(12, -27); g.lineTo(13, -35); g.lineTo(17, -28); g.closePath(); part(g, L.body, 1.6);
      g.beginPath(); g.ellipse(19, -23, 1.6, 1.2, 0, 0, 7); g.fillStyle = P.pose === 'hurt' ? '#fff' : L.eye; g.fill(); g.lineWidth = 0.8; g.strokeStyle = INK; g.stroke();
      g.restore();
    }
    function paintBird(g, L, P, tm) {
      var flap = Math.sin(tm * 9 + (P.pose === 'dash' ? 4 : 0)), hover = -16 + Math.sin(tm * 3) * 2.2, lunge = P.pose === 'strike' ? (1 - P.k) * 6 : 0;
      g.save(); g.translate(lunge, hover);
      g.beginPath(); g.moveTo(-4, -18); g.quadraticCurveTo(-24, -34 - flap * 10, -30, -22 - flap * 12); g.quadraticCurveTo(-18, -18, -6, -12); g.closePath(); part(g, mix(L.wing, '#000000', 0.25), 1.8);
      g.beginPath(); g.moveTo(-14, -14); g.lineTo(-25, -10); g.lineTo(-24, -6); g.lineTo(-12, -9); g.closePath(); part(g, L.wing, 1.6);
      g.beginPath(); g.ellipse(0, -15, 13, 9, -0.25, 0, 7); part(g, shade(g, mix(L.body, '#ffffff', 0.2), mix(L.body, '#000000', 0.3), -24, -6));
      g.beginPath(); g.ellipse(3, -11, 7, 4, -0.2, 0, Math.PI); g.fillStyle = L.belly; g.fill();
      g.beginPath(); g.arc(11, -24, 7, 0, 7); part(g, shade(g, mix(L.body, '#ffffff', 0.25), L.body, -31, -17));
      g.beginPath(); g.moveTo(16, -26); g.quadraticCurveTo(24, -24, 23, -19); g.lineTo(16, -21); g.closePath(); part(g, L.beak, 1.5);
      g.beginPath(); g.arc(13, -25.5, 1.6, 0, 7); g.fillStyle = L.eye; g.fill(); g.lineWidth = 0.8; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.moveTo(6, -30); g.lineTo(2, -36); g.lineTo(9, -31); g.closePath(); part(g, L.wing, 1.4);
      g.beginPath(); g.moveTo(-2, -6); g.lineTo(-1, 0); g.moveTo(4, -6); g.lineTo(5, 0); g.lineWidth = 2; g.strokeStyle = '#d99a2b'; g.stroke();
      g.beginPath(); g.moveTo(0, -17); g.quadraticCurveTo(-14, -30 - flap * 7, -20, -20 - flap * 9); g.quadraticCurveTo(-9, -17, 2, -11); g.closePath(); part(g, L.wing, 1.8);
      g.restore();
    }
    function paintHead(g, L, x, y, r) {   // a portrait chip: the head of the built-in painter, centred at (x, y)
      g.save(); g.translate(x, y); var k = r / 13; g.scale(k, k);
      if (L.kind === 'beast') { g.translate(-17, 21); paintBeast(g, L, { pose: 'idle', k: 0 }, 0); }
      else if (L.kind === 'bird') { g.translate(-10, 38); paintBird(g, L, { pose: 'idle', k: 0 }, 0); }
      else { g.translate(0, 48); g.beginPath(); g.rect(-30, -70, 60, 64); g.clip(); paintHumanoid(g, L, { pose: 'idle', k: 0 }, 0); }
      g.restore();
    }

    function drawBackdrop(g, v) {
      var h = call('drawBackground', g, v, t / 1000);
      if (h !== undefined || typeof opt.drawBackground === 'function') return;
      var sky = g.createLinearGradient(0, v.y, 0, v.y + v.h * 0.6); sky.addColorStop(0, '#2c3f73'); sky.addColorStop(0.6, '#e89c72'); sky.addColorStop(1, '#f6cf8f');
      g.fillStyle = sky; g.fillRect(v.x, v.y, v.w, v.h);
      g.fillStyle = '#5a4a72'; g.beginPath(); g.moveTo(v.x, v.y + v.h * 0.5);
      for (var i = 0; i <= 16; i++) g.lineTo(v.x + v.w * i / 16, v.y + v.h * (0.44 + 0.05 * Math.sin(i * 1.7)));
      g.lineTo(v.x + v.w, v.y + v.h); g.lineTo(v.x, v.y + v.h); g.fill();
      var gr = g.createLinearGradient(0, v.y + v.h * 0.5, 0, v.y + v.h); gr.addColorStop(0, '#6f8a4a'); gr.addColorStop(1, '#3c5530');
      g.fillStyle = gr; g.fillRect(v.x, v.y + v.h * 0.5, v.w, v.h * 0.5);
    }
    // contact shadow: a wide soft pool plus a tight dark core right under the feet (both squashed radial gradients)
    function drawShadow(g, x, y, s, a) {
      g.save(); g.globalAlpha *= a; g.translate(x, y); g.scale(1, 0.3);
      var rg = g.createRadialGradient(0, 0, 0, 0, 0, 24 * s); rg.addColorStop(0, 'rgba(10,6,16,0.46)'); rg.addColorStop(0.55, 'rgba(10,6,16,0.26)'); rg.addColorStop(1, 'rgba(10,6,16,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 24 * s, 0, 7); g.fill();
      var cg = g.createRadialGradient(0, 0, 0, 0, 0, 13 * s); cg.addColorStop(0, 'rgba(8,4,14,0.5)'); cg.addColorStop(1, 'rgba(8,4,14,0)');
      g.fillStyle = cg; g.beginPath(); g.arc(0, 0, 13 * s, 0, 7); g.fill();
      g.restore();
    }
    function shadowK(L) { return L && L.shadow != null ? +L.shadow || 0 : 1; }
    // a head portrait: the host's drawHead (painted art) first, else the built-in painter. The caller has clipped a circle.
    function headOf(g, u, L, x, y, r, side) {
      if (typeof opt.drawHead === 'function' && u) { try { if (opt.drawHead(g, u, x, y, r, { side: side, facing: side === 'b' ? 'left' : 'right', t: t / 1000 }) === true) return; } catch (e) { warnOnce(warned, 'drawHead', 'drawHead threw: ' + e.message); } }
      paintHead(g, L, x, y + r * 0.15, r * 0.95);
    }

    function drawScene(g) {
      try {
        var v = V(); rects = [];
        g.save(); g.beginPath(); g.rect(v.x, v.y, v.w, v.h); g.clip();
        drawBackdrop(g, v);
        var list = [];
        ['a', 'b'].forEach(function (side) { liveList(side).forEach(function (u) { if (u) list.push(String(u.id)); }); });
        var items = list.map(function (id) { var I = unitInfo(id), A = homeAnchor(id); return { id: id, I: I, A: A, P: poseOf(id, I) }; }).filter(function (o) { return o.I && o.A; });
        items.forEach(function (o) { o.y = o.A.footY + o.P.dy + (o.P.active ? 0.5 : 0); });
        items.sort(function (x, y) { return x.y - y.y; });
        // team glow rings under the active actor
        items.forEach(function (o) { var f = unitFx[o.id] || {}, dead = !(+o.I.u.hp > 0); var shK = shadowK(o.I.look), lift = o.I.look.lift != null ? o.I.look.lift : o.I.look.kind === 'bird' ? 16 : 0; if (shK > 0 && !(dead && o.I.look.noBody)) drawShadow(g, o.A.x + o.P.dx, o.A.footY + o.P.dy, o.A.s * shK * (lift ? 0.8 : 1), (dead ? 0.5 : 1) * (lift ? 0.6 : 1));
          if (!dead && P.rings !== 'off') { g.save(); g.globalAlpha = 0.5; g.strokeStyle = TEAM[o.I.side].main; g.lineWidth = 1.3 * o.A.s; g.beginPath(); g.ellipse(o.A.x + o.P.dx, o.A.footY + o.P.dy, 19 * o.A.s * (shK || 1), 5.4 * o.A.s * (shK || 1), 0, 0, 7); g.stroke(); g.globalAlpha = 0.1; g.fillStyle = TEAM[o.I.side].main; g.fill(); g.restore(); }
          if (o.P.active) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55; g.strokeStyle = TEAM[o.I.side].main; g.lineWidth = 2 * o.A.s; g.beginPath(); g.ellipse(o.A.x + o.P.dx, o.A.footY + o.P.dy, 21 * o.A.s * (shK || 1), 6 * o.A.s * (shK || 1), 0, 0, 7); g.stroke(); g.restore(); } });
        call('drawUnder', g, v);
        items.forEach(function (o) {
          var f = unitFx[o.id] || {}, dead = !(+o.I.u.hp > 0), fallK = f.fall != null ? clamp(f.fall / 650, 0, 1) : dead ? 1 : 0;
          var P = o.P; if (f.hurt > 0 && !P.active && !P.guarding) { P = { pose: 'hurt', k: 1 - f.hurt / (f.hurtMax || 1), dx: P.dx, dy: P.dy }; }
          var shakeX = f.hurt > 0 ? Math.sin(f.hurt * 0.12) * 2.2 * o.A.s * (f.hurt / (f.hurtMax || 1)) : 0;
          var push = f.hurt > 0 ? (o.I.side === 'a' ? -1 : 1) * 5 * o.A.s * Math.sin(Math.PI * (1 - f.hurt / (f.hurtMax || 1))) : 0;
          var flash = f.hurt > 0 ? clamp((f.hurt / (f.hurtMax || 1)) * 1.3 - 0.3, 0, 0.85) : 0;
          var L = o.I.look; L._ph = (hashStr(o.id) % 100) / 16;
          var x = o.A.x + P.dx + shakeX + push, y = o.A.footY + P.dy, dir = o.I.side === 'a' ? 1 : -1;
          var custom = false;
          if (typeof opt.drawUnit === 'function') try { custom = opt.drawUnit(g, o.I.u, { x: x, footY: y, s: o.A.s, dir: dir, facing: dir < 0 ? 'left' : 'right', pose: P.pose, k: P.k, flash: flash, dead: dead, fall: fallK, t: t / 1000, side: o.I.side, ret: P.ret != null && P.ret < 1 ? P.ret : null, active: !!P.active }) === true; } catch (e) { warnOnce(warned, 'drawUnit', 'drawUnit threw: ' + e.message); }
          if (!custom) {
            if (dead && fallK >= 1) paintUnit(g, L, x, y, o.A.s, dir, { pose: 'idle', k: 0 }, 0, 0, 0.5, true);
            else if (fallK > 0) { g.save(); g.globalAlpha *= 1 - fallK * 0.55; paintUnit(g, L, x, y + fallK * 4 * o.A.s, o.A.s, dir, { pose: 'hurt', k: 1 }, t / 1000, (1 - fallK) * 0.6, 1, fallK > 0.5); g.restore(); }
            else paintUnit(g, L, x, y, o.A.s, dir, P, t / 1000, flash, 1, false);
          }
          var ddx = dead ? 0 : P.dx, ddy = dead ? 0 : P.dy;
          rects.push({ x: o.A.left + ddx, y: o.A.spriteTop + ddy, w: o.A.w, h: o.A.footY - o.A.spriteTop, id: o.id, owner: o.id, kind: 'unit' });
        });
        drawFx(g);
        if (P.bars !== 'off') { var showBars = items.filter(function (o) { return +o.I.u.hp > 0 || (unitFx[o.id] && unitFx[o.id].fall != null && unitFx[o.id].fall < 200); }); layoutBars(showBars); showBars.forEach(function (o) { drawBar(g, o); }); }
        if (P.numbers !== 'off') drawNums(g);
        g.restore();
      } catch (e) { warnOnce(warned, 'drawScene', 'drawScene failed: ' + e.message); try { g.restore(); } catch (e2) {} }
    }
    // bars of neighbouring columns must not overlap: nearest units keep their spot; a farther bar moves its label to the
    // other side, then lifts in 7 px steps (derived from positions only, so frozen frames match play)
    function barInfo(o) {
      var A = o.A, s = A.s, u = o.I.u, m = +u.maxHp || 1, hp = clamp(+u.hp || 0, 0, m);
      var fc = phase !== 'playing' && phase !== 'done' && P.forecast !== 'off' ? fcCache.fc : null, pu = fc && fc.units[String(u.id)];
      if (pu && pu.hpBefore !== hp) pu = null;
      var lab = pu && (pu.fell || (pu.hpAfter !== hp && P.forecast === 'bars')) ? (pu.fell ? 14 * s : (String(pu.hpAfter).length + 1) * 5.6 * s + 4 * s) : 0;   // label width estimated
      return { pu: pu, lab: lab, w: 34 * s, h: 5 * s, x: A.x - 17 * s + o.P.dx, y: A.top + 3 * s + o.P.dy, s: s };
    }
    function layoutBars(list) {
      var placed = [], hit = function (a) { return placed.some(function (b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }); };
      list.slice().sort(function (p, q) { return (q.A.footY - p.A.footY) || cmpStr(p.id, q.id); }).forEach(function (o) {
        var B = barInfo(o), best = null;
        for (var lift = 0; lift < 3 && !best; lift++) for (var side = 0; side < 2 && !best; side++) {
          var y = B.y - lift * 7 * B.s, x0 = B.x - 1.5 * B.s - (side ? B.lab : 0), r = { x: x0, y: y - 1.5 * B.s, w: B.w + 3 * B.s + B.lab, h: B.h + 3 * B.s };
          if (!hit(r) || lift === 2 && side === 1) best = { r: r, lift: lift, left: side === 1 && B.lab > 0 };
        }
        o.bar = { dy: -best.lift * 7 * B.s, left: best.left }; placed.push(best.r);
      });
    }
    function cmpStr(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
    function drawBar(g, o) {
      var A = o.A, s = A.s, w = 34 * s, h = 5 * s, x = A.x - w / 2 + o.P.dx, y = A.top + 3 * s + o.P.dy + (o.bar ? o.bar.dy : 0), u = o.I.u, m = +u.maxHp || 1, hp = clamp(+u.hp || 0, 0, m);
      var labLeft = o.bar && o.bar.left;
      g.save();
      rr(g, x - 1.5 * s, y - 1.5 * s, w + 3 * s, h + 3 * s, 3 * s); g.fillStyle = 'rgba(14,10,22,0.85)'; g.fill();
      var shown = hp, fc = phase !== 'playing' && phase !== 'done' && P.forecast !== 'off' ? fcCache.fc : null, pu = fc && fc.units[String(u.id)];
      if (pu && (pu.hpBefore !== hp)) pu = null;
      var col = o.I.side === 'a' ? '#5fd17a' : '#ff6a5a'; if (hp / m < 0.3) col = o.I.side === 'a' ? '#ffcf4a' : '#ff9a3a';
      g.fillStyle = col; rr(g, x, y, Math.max(0, w * shown / m), h, 2 * s); g.fill();
      if (pu && pu.hpAfter < hp) {   // the forecast: the part this unit will lose, striped and pulsing
        var x0 = x + w * pu.hpAfter / m, x1 = x + w * hp / m, pulse = 0.55 + 0.45 * Math.sin(t / 160);
        g.save(); g.beginPath(); g.rect(x0, y, x1 - x0, h); g.clip(); g.fillStyle = '#2a0f18'; g.fillRect(x0, y, x1 - x0, h);
        g.globalAlpha = pulse; g.strokeStyle = '#ff4f6a'; g.lineWidth = 2 * s; for (var sx = x0 - h; sx < x1 + h; sx += 4 * s) { g.beginPath(); g.moveTo(sx, y + h); g.lineTo(sx + h, y); g.stroke(); } g.restore();
      }
      if (pu && pu.hpAfter > hp) { g.save(); g.globalAlpha = 0.5 + 0.3 * Math.sin(t / 160); g.fillStyle = '#9dffb6'; g.fillRect(x + w * hp / m, y, w * (pu.hpAfter - hp) / m, h); g.restore(); }
      g.globalAlpha = 0.35; g.fillStyle = '#ffffff'; g.fillRect(x + 1, y + 0.6 * s, Math.max(0, w * shown / m - 2), h * 0.3); g.globalAlpha = 1;
      if (pu && pu.fell) { var sx2 = labLeft ? x - 7 * s : x + w + 7 * s, sy2 = y + h / 2; skull(g, sx2, sy2, 5.2 * s); }
      else if (pu && pu.hpAfter !== hp && P.forecast === 'bars') text(g, '→' + pu.hpAfter, labLeft ? x - 3 * s : x + w + 3 * s, y + h + 1 * s, { size: 9, color: pu.hpAfter < hp ? '#ffb3bd' : '#b8ffcb', ow: 2.4, align: labLeft ? 'right' : 'left' });
      rects.push({ x: x - 1.5 * s - (pu && labLeft ? 22 * s : 0), y: y - 1.5 * s, w: w + (pu ? 22 * s : 3 * s), h: h + 3 * s, id: String(u.id), owner: String(u.id), kind: 'bar' });
      g.restore();
    }
    function skull(g, x, y, r) {
      g.save(); g.translate(x, y);
      g.beginPath(); g.arc(0, -r * 0.15, r, Math.PI * 0.9, Math.PI * 2.1); g.lineTo(r * 0.55, r * 0.75); g.lineTo(-r * 0.55, r * 0.75); g.closePath(); g.fillStyle = '#f4ecdc'; g.fill(); g.lineWidth = r * 0.3; g.strokeStyle = INK; g.stroke();
      g.fillStyle = INK; g.beginPath(); g.arc(-r * 0.38, -r * 0.1, r * 0.26, 0, 7); g.arc(r * 0.38, -r * 0.1, r * 0.26, 0, 7); g.fill();
      g.restore();
    }
    function drawFx(g) {
      var b = current();
      // projectiles and casts of the current beat
      if (b && phase === 'playing' && (b.type === 'act' || b.type === 'follow')) {
        var e = b.e, A = homeAnchor(e.actor), tt = play.bt;
        if (A && e.kind === 'ranged' && e.hits[0]) {
          var T = homeAnchor(e.hits[0].target), f0 = b.at - BEAT.flight;
          if (T && tt >= f0 && tt < b.at) {
            var k = (tt - f0) / BEAT.flight, dir = A.side === 'a' ? 1 : -1, LA = (unitInfo(e.actor) || {}).look || {}, x0 = A.x + dir * (LA.shotX || 14) * A.s, y0 = A.footY - (LA.shotY || 33) * A.s, x1 = T.x - dir * T.w * 0.2, y1 = T.cy;
            var x = lerp(x0, x1, k), y = lerp(y0, y1, k) - Math.sin(Math.PI * k) * 26 * A.s, ang = Math.atan2((y1 - y0) - Math.cos(Math.PI * k) * 26 * Math.PI * A.s, x1 - x0);
            g.save(); g.translate(x, y); g.rotate(ang); g.lineCap = 'round';
            if (LA.shot === 'stone') {   // a slung stone: a short streak and a small shaded pebble
              g.globalAlpha = 0.3; g.strokeStyle = '#fff2c8'; g.lineWidth = 2.4 * A.s; g.beginPath(); g.moveTo(-20 * A.s, 0); g.lineTo(-4 * A.s, 0); g.stroke(); g.globalAlpha = 1;
              g.beginPath(); g.ellipse(0, 0, 3.4 * A.s, 2.8 * A.s, 0, 0, 7); g.fillStyle = '#8d8a84'; g.fill(); g.lineWidth = 1 * A.s; g.strokeStyle = INK; g.stroke();
              g.beginPath(); g.ellipse(-0.8 * A.s, -0.9 * A.s, 1.5 * A.s, 1 * A.s, 0, 0, 7); g.fillStyle = '#d9d5cb'; g.fill();
            } else {
            g.globalAlpha = 0.35; g.strokeStyle = '#fff2c8'; g.lineWidth = 2 * A.s; g.beginPath(); g.moveTo(-26 * A.s, 0); g.lineTo(-6 * A.s, 0); g.stroke(); g.globalAlpha = 1;
            g.strokeStyle = INK; g.lineWidth = 3 * A.s; g.beginPath(); g.moveTo(-11 * A.s, 0); g.lineTo(7 * A.s, 0); g.stroke();
            g.strokeStyle = '#e9d6a8'; g.lineWidth = 1.6 * A.s; g.stroke();
            g.fillStyle = '#e8eef4'; g.beginPath(); g.moveTo(10 * A.s, 0); g.lineTo(5 * A.s, -2.6 * A.s); g.lineTo(5 * A.s, 2.6 * A.s); g.closePath(); g.fill();
            g.fillStyle = '#f4f0e6'; g.beginPath(); g.moveTo(-11 * A.s, 0); g.lineTo(-14 * A.s, -2.4 * A.s); g.lineTo(-9 * A.s, -2.4 * A.s); g.lineTo(-7 * A.s, 0); g.lineTo(-9 * A.s, 2.4 * A.s); g.lineTo(-14 * A.s, 2.4 * A.s); g.closePath(); g.fill();
            }
            g.restore();
          }
        }
        if (A && (e.kind === 'magic' || e.kind === 'heal') && tt < b.at) {   // a rune circle under the caster while it charges
          var k2 = clamp((tt - b.lead * 0.5) / (b.at - b.lead * 0.5), 0, 1), col = e.kind === 'heal' ? '#9dffb6' : (e.hits[0] && e.hits[0].type === 'fire') ? '#ffb347' : '#b7a0ff';
          g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.65 * k2; g.strokeStyle = col; g.lineWidth = 1.6 * A.s;
          g.beginPath(); g.ellipse(A.x, A.footY, 26 * A.s * (0.6 + 0.4 * k2), 7.5 * A.s * (0.6 + 0.4 * k2), 0, 0, 7); g.stroke();
          for (var i = 0; i < 6; i++) { var a = t / 400 + i * Math.PI / 3; g.beginPath(); g.arc(A.x + Math.cos(a) * 22 * A.s, A.footY + Math.sin(a) * 6 * A.s, 1.6 * A.s, 0, 7); g.fillStyle = col; g.fill(); }
          g.restore();
          if (e.kind === 'magic' && tt > b.at - 160) e.hits.forEach(function (h) { var T2 = homeAnchor(h.target); if (!T2) return; var k3 = (tt - (b.at - 160)) / 160; g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = k3; var gy2 = T2.cy - (T2.footY - T2.spriteTop) * 0.16, rg = g.createRadialGradient(T2.x, gy2, 0, T2.x, gy2, 30 * T2.s * k3); rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.4, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.beginPath(); g.arc(T2.x, gy2, 30 * T2.s * k3, 0, 7); g.fill(); g.restore(); });
        }
        if (A && e.kind === 'melee' && tt >= b.at - 40 && tt < b.at + 200 && e.hits[0]) {   // the swing arc
          var T3 = anchor(e.hits[0].target), k4 = clamp((tt - (b.at - 40)) / 240, 0, 1), dir2 = A.side === 'a' ? 1 : -1;
          if (T3) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 - k4; g.translate(T3.x - dir2 * T3.w * 0.35, T3.cy); g.scale(dir2, 1); g.rotate(-0.9 + k4 * 1.6);
            // a tapered crescent: the outer edge is an arc, the inner edge a curve through the same two tips
            var Rr = 27 * T3.s, a0 = -1.25, a1 = 1.05, am = (a0 + a1) / 2;
            g.beginPath(); g.arc(0, 0, Rr, a0, a1); g.quadraticCurveTo(Math.cos(am) * Rr * 1.2, Math.sin(am) * Rr * 1.2, Math.cos(a0) * Rr, Math.sin(a0) * Rr); g.closePath();
            var lg = g.createLinearGradient(0, -Rr, 0, Rr); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.45, 'rgba(255,250,232,0.95)'); lg.addColorStop(1, 'rgba(255,214,140,0.1)');
            g.shadowColor = 'rgba(255,226,160,0.9)'; g.shadowBlur = 8 * T3.s; g.fillStyle = lg; g.fill(); g.restore(); }
        }
      }
      fx.forEach(function (f) {
        var k = f.age / f.life;
        if (f.type === 'spark') {
          var R = mulberry32(f.seed * 7919 + 13), n = f.crit ? 14 : 9;
          g.save(); g.globalCompositeOperation = 'lighter';
          var rg = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, (f.crit ? 30 : 20) * f.s); rg.addColorStop(0, 'rgba(255,244,214,' + (0.5 * (1 - k)) + ')'); rg.addColorStop(0.5, 'rgba(255,214,150,' + (0.2 * (1 - k)) + ')'); rg.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = rg; g.beginPath(); g.arc(f.x, f.y, (f.crit ? 30 : 20) * f.s * (0.5 + k), 0, 7); g.fill();
          // a four-point flare that snaps open and thins out
          var fk = (1 - k) * (1 - k), fl = (f.crit ? 34 : 24) * f.s * (0.55 + 0.6 * easeOut(k)), fw = (f.crit ? 3.4 : 2.6) * f.s * fk;
          g.globalAlpha = Math.min(1, fk * 1.4); g.fillStyle = '#ffffff';
          g.beginPath(); g.moveTo(f.x - fl, f.y); g.lineTo(f.x, f.y - fw); g.lineTo(f.x + fl, f.y); g.lineTo(f.x, f.y + fw); g.closePath(); g.fill();
          g.beginPath(); g.moveTo(f.x, f.y - fl * 0.62); g.lineTo(f.x + fw, f.y); g.lineTo(f.x, f.y + fl * 0.62); g.lineTo(f.x - fw, f.y); g.closePath(); g.fill();
          g.strokeStyle = f.col; g.lineCap = 'round';
          for (var i = 0; i < n; i++) { var a = R() * Math.PI * 2, sp = (14 + R() * 22) * f.s * (f.crit ? 1.4 : 1), d0 = sp * easeOut(k), d1 = d0 + 7 * f.s * (1 - k); g.globalAlpha = 1 - k; g.lineWidth = (1 + R() * 1.6) * f.s; g.beginPath(); g.moveTo(f.x + Math.cos(a) * d0, f.y + Math.sin(a) * d0); g.lineTo(f.x + Math.cos(a) * d1, f.y + Math.sin(a) * d1); g.stroke(); }
          if (f.crit) { g.globalAlpha = (1 - k) * 0.9; g.lineWidth = 2.5 * f.s; g.strokeStyle = '#ffe28a'; g.beginPath(); g.arc(f.x, f.y, 34 * f.s * easeOut(k), 0, 7); g.stroke(); }
          g.restore();
        } else if (f.type === 'heal') {
          var R2 = mulberry32(Math.round(f.x * 13 + f.y));
          g.save(); g.globalCompositeOperation = 'lighter';
          g.globalAlpha = (1 - k) * 0.7; g.strokeStyle = '#9dffb6'; g.lineWidth = 2 * f.s; g.beginPath(); g.ellipse(f.x, f.y, 24 * f.s * (0.5 + k), 7 * f.s * (0.5 + k), 0, 0, 7); g.stroke();
          for (var j = 0; j < 10; j++) { var px = f.x + (R2() - 0.5) * 34 * f.s, py = f.y - (R2() * 20 + k * 46) * f.s; g.globalAlpha = (1 - k) * (0.5 + R2() * 0.5); g.fillStyle = j % 3 ? '#b6ffc8' : '#ffffff'; g.beginPath(); g.moveTo(px, py - 3 * f.s); g.lineTo(px + 1.2 * f.s, py); g.lineTo(px, py + 3 * f.s); g.lineTo(px - 1.2 * f.s, py); g.closePath(); g.fill(); }
          g.restore();
        } else if (f.type === 'shield') {
          var G = homeAnchor(f.id); if (!G) return; var Pg = poseOf(f.id, unitInfo(f.id)), dirS = G.side === 'a' ? 1 : -1, gx = G.x + Pg.dx + dirS * 15 * G.s, gy = G.cy + Pg.dy;
          var fade = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
          g.save(); g.translate(gx, gy); g.scale(dirS, 1);
          g.globalAlpha = fade * 0.55; g.beginPath(); g.ellipse(0, 0, 11 * G.s, 27 * G.s, 0, -Math.PI / 2, Math.PI / 2); g.fillStyle = '#4fa8ff'; g.fill();   // a solid barrier arc
          g.globalAlpha = fade; g.lineWidth = 4 * G.s; g.strokeStyle = '#d8f0ff'; g.stroke();
          g.globalCompositeOperation = 'lighter'; g.globalAlpha = (1 - k) * 0.8; g.lineWidth = 2.5 * G.s; g.strokeStyle = '#8fd0ff';   // the ring pulse
          g.beginPath(); g.arc(-4 * G.s, 0, (16 + 30 * easeOut(k)) * G.s, 0, 7); g.stroke();
          g.restore();
        }
      });
      // tags over the active actor: GUARD! / FOLLOW-UP / the skill
      if (b && phase === 'playing' && (b.type === 'act' || b.type === 'follow')) {
        var e2 = b.e;
        if (b.type === 'follow') tag(g, e2.actor, 'FOLLOW-UP', '#ffd36a', play.bt / 500, true);
        e2.hits.forEach(function (h) {
          if (!h.guardBy || play.bt <= b.at - 220) return;
          var kk = (play.bt - (b.at - 220)) / 500, Aa = homeAnchor(h.aimed), Gg = anchor(h.guardBy);
          if (Aa && Gg && kk < 1.4) {   // a dashed line from the ally it covers to the guard
            g.save(); g.globalAlpha = clamp(kk * 4, 0, 1) * clamp((1.4 - kk) * 3, 0, 1); g.setLineDash([4 * Aa.s, 3 * Aa.s]); g.lineWidth = 2 * Aa.s; g.strokeStyle = '#8fd0ff'; g.lineCap = 'round';
            g.beginPath(); g.moveTo(Aa.x, Aa.cy); g.lineTo(Gg.x, Gg.cy); g.stroke(); g.setLineDash([]); g.beginPath(); g.arc(Aa.x, Aa.cy, 3 * Aa.s, 0, 7); g.fillStyle = '#8fd0ff'; g.fill(); g.restore();
          }
          tag(g, h.guardBy, 'GUARD!', '#8fd0ff', kk, true);
        });
      }
    }
    var tagLift = {};   // reserved
    function tag(g, id, s, col, k, side) {
      var A = homeAnchor(id); if (!A || k > 1.6) return; var P2 = poseOf(id, unitInfo(id)), sc = scaleOf();
      var w = measure(g, s, 10, 800) + 12 * sc, h = 15 * sc, x = A.x + P2.dx - w / 2, y = A.top + P2.dy - h - 4 * sc - Math.min(1, k * 3) * 4 * sc;
      if (side) { y = A.footY + P2.dy + 4 * sc + (1 - Math.min(1, k * 3)) * 4 * sc; }   // under the feet: the hit number owns the space above the head
      g.save(); g.globalAlpha = clamp(k * 5, 0, 1) * clamp((1.6 - k) * 3, 0, 1);
      rr(g, x, y, w, h, h / 2); g.fillStyle = 'rgba(16,10,24,0.9)'; g.fill(); g.lineWidth = 1.4 * sc; g.strokeStyle = col; g.stroke();
      text(g, s, x + w / 2, y + h * 0.74, { size: 10, weight: 800, color: col, align: 'center', outline: false });
      g.restore(); rects.push({ x: x, y: y, w: w, h: h, kind: 'tag', owner: id });
    }
    function drawNums(g) {
      var placedN = [];
      nums.forEach(function (n) {
        var A = anchor(n.id); if (!A) return;
        var k = n.age / n.life, sc = A.s, pop = n.age < 120 ? easeOut(n.age / 120) : 1;
        var size = (n.crit ? 19 : 14) * (0.6 + 0.4 * pop) * (n.age < 200 && n.crit ? 1 + 0.35 * (1 - n.age / 200) : 1);
        var gTag = tagLift[n.id] || 0, x = A.x + (n.stack ? (n.stack % 2 ? 1 : -1) * Math.ceil(n.stack / 2) * 15 * sc : 0), y = A.top - 4 * sc - gTag - easeOut(Math.min(1, n.age / 400)) * 14 * sc - n.stack * 7 * sc;
        // numbers of neighbouring units never sit on each other: step sideways until the spot is free (positions only: frozen frames match)
        for (var tries = 0; tries < 4 && placedN.some(function (q) { return Math.abs(q.x - x) < 17 * sc && Math.abs(q.y - y) < 13 * sc; }); tries++) x += 18 * sc;
        placedN.push({ x: x, y: y });
        var col = n.kind === 'heal' ? '#8dffb0' : n.crit ? '#ffd84a' : n.type === 'fire' ? '#ffb070' : n.type === 'shock' ? '#bfe8ff' : n.type === 'arcane' ? '#e0b4ff' : '#ffffff';
        g.save(); g.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
        text(g, n.text, x, y, { size: size / sc * sc, weight: 900, color: col, align: 'center', ow: 4 });
        if (n.crit && n.age < 600) text(g, 'CRIT', x, y - size * 0.95 * scaleOf(), { size: 8.5, weight: 900, color: '#ffe9a8', align: 'center', ow: 3 });
        g.restore();
      });
    }

    /* UI: the turn-order strip, the "why" readout, the result banner (drawn after the scene; host HUD goes after) */
    var uiR = [];
    function drawUI(g) {
      uiR = [];
      try {
        var v = V(), sc = scaleOf(), b = current();
        if (play && phase !== 'idle' && P.order !== 'off') drawOrder(g, v, sc);
        if (b && phase === 'playing' && P.why !== 'off' && (b.type === 'act' || b.type === 'follow' || b.type === 'skip')) drawWhy(g, v, sc, b);
        if (b && phase === 'playing' && b.type === 'round') {
          var k = play.bt / b.dur, a = k < 0.2 ? k / 0.2 : k > 0.8 ? (1 - k) / 0.2 : 1, w = 200 * sc, h = 36 * sc, x = v.x + v.w / 2 - w / 2, y = v.y + v.h * 0.3;
          g.save(); g.globalAlpha = a; var lg = g.createLinearGradient(x, 0, x + w, 0); lg.addColorStop(0, 'rgba(16,10,24,0)'); lg.addColorStop(0.2, 'rgba(16,10,24,0.85)'); lg.addColorStop(0.8, 'rgba(16,10,24,0.85)'); lg.addColorStop(1, 'rgba(16,10,24,0)');
          g.fillStyle = lg; g.fillRect(x, y, w, h);
          g.fillStyle = '#e3bd6a'; g.globalAlpha = a * 0.8; g.fillRect(x + w * 0.18, y, w * 0.64, 1.2 * sc); g.fillRect(x + w * 0.18, y + h - 1.2 * sc, w * 0.64, 1.2 * sc); g.globalAlpha = a;
          text(g, 'ROUND ' + b.e.round + ' / ' + play.fc.rounds, v.x + v.w / 2 + (1 - easeOut(Math.min(1, k * 4))) * 30 * sc, y + h * 0.7, { size: 18, weight: 700, font: 'display', spacing: 2, align: 'center', color: '#ffe7b0' });
          g.restore(); uiR.push({ name: 'round', x: x, y: y, w: w, h: h });
        }
        if (phase === 'done' && lastOutcome) drawBanner(g, v, sc);
      } catch (e) { warnOnce(warned, 'drawUI', 'drawUI failed: ' + e.message); }
    }
    function orderNow() {
      if (!play) return null; var r = null, idx = -1, cur = current();
      for (var i = 0; i <= play.bi && i < play.beats.length; i++) if (play.beats[i].type === 'round') r = play.beats[i].e;
      if (!r) return null;
      var done = {}; for (i = 0; i <= play.bi && i < play.beats.length; i++) { var bb = play.beats[i]; if (bb.e.round === r.round && (bb.type === 'act' || bb.type === 'skip') && (i < play.bi || bb === cur)) done[bb.e.actor] = i < play.bi ? 2 : 1; }
      return { round: r.round, order: r.order, done: done, cur: cur && (cur.type === 'act' || cur.type === 'skip' || cur.type === 'follow') ? cur.e.actor : null, follow: cur && cur.type === 'follow' };
    }
    function drawOrder(g, v, sc) {
      var O = orderNow(); if (!O) return;
      var n = O.order.length, r = 13 * sc, gap = (n > 8 ? 4.5 : 6) * sc, w = n * (2 * r + gap) - gap + 80 * sc, h = 36 * sc, x0 = v.x + (v.w - w) / 2, y0 = v.y + 6 * sc;
      panel(g, x0, y0, w, h, { r: h / 2, alpha: 0.82 });
      text(g, 'ROUND ' + O.round, x0 + 14 * sc, y0 + h * 0.43, { size: 9.5, weight: 800, color: '#ffe7b0', outline: false });
      text(g, 'TURN ORDER', x0 + 14 * sc, y0 + h * 0.78, { size: 7.5, weight: 700, color: '#bfb3d8', outline: false });
      var x = x0 + 74 * sc;
      O.order.forEach(function (id) {
        var I = unitInfo(id); if (!I) return; var cx = x + r, cy = y0 + h / 2, isCur = O.cur === id, dead = !(+I.u.hp > 0), st = O.done[id];
        g.save();
        if (isCur) { g.shadowColor = TEAM[I.side].main; g.shadowBlur = 12 * sc; }
        g.beginPath(); g.arc(cx, cy, r * (isCur ? 1.12 : 1), 0, 7); g.fillStyle = I.side === 'a' ? '#1d3352' : '#4a1d22'; g.fill();
        g.shadowBlur = 0; g.save(); g.beginPath(); g.arc(cx, cy, r * (isCur ? 1.12 : 1) - 1, 0, 7); g.clip(); headOf(g, I.u, I.look, cx, cy, r * (isCur ? 1.12 : 1), I.side); g.restore();
        g.lineWidth = (isCur ? 2.6 : 1.6) * sc; g.strokeStyle = isCur ? '#ffffff' : TEAM[I.side].main; g.beginPath(); g.arc(cx, cy, r * (isCur ? 1.12 : 1), 0, 7); g.stroke();
        if (st === 2 || dead) { g.globalAlpha = 0.5; g.fillStyle = '#0c0814'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); g.globalAlpha = 1; }
        if (dead) { g.strokeStyle = '#ff5a6a'; g.lineWidth = 2 * sc; g.beginPath(); g.moveTo(cx - r * 0.6, cy - r * 0.6); g.lineTo(cx + r * 0.6, cy + r * 0.6); g.stroke(); }
        g.restore(); x += 2 * r + gap;
      });
      uiR.push({ name: 'order', x: x0, y: y0, w: w, h: h });
    }
    function whyLines(b) {
      var e = b.e, I = unitInfo(e.actor); if (!I) return null;
      var line1, line2;
      if (b.type === 'skip') { line1 = I.u.name + ' waits'; line2 = e.note || 'nothing in reach'; }
      else if (b.type === 'follow') { line1 = I.u.name + ': ' + e.skillName; line2 = 'Follow-up: joins ' + (e.note || '').replace(/^joins /, '') + "'s attack"; }
      else {
        var tgt = e.hits[0] ? unitInfo(e.hits[0].aimed) : null, rule = e.rule >= 0 ? 'Rule ' + (e.rule + 1) + ': ' + ruleText(rulesOf(I.u)[e.rule]) : e.cond === 'default' ? 'No rule held: first skill' : e.cond === 'otherwise' ? 'Otherwise' : 'Host tactic: ' + (e.note || '');
        line1 = I.u.name + ': ' + e.skillName + (tgt ? (e.area ? ' → ' + (tgt.row === 'back' ? 'back' : 'front') + ' row' : ' → ' + tgt.u.name) : '');
        var gb = e.hits[0] && e.hits[0].guardBy ? unitInfo(e.hits[0].guardBy) : null; if (gb && play.bt > b.at - 220) line1 += ' · ' + gb.u.name + ' guards';
        line2 = rule + (e.note && e.rule >= 0 && e.cond !== 'always' ? '  (' + e.note + ')' : '');
      }
      return { line1: line1, line2: line2, actor: String(e.actor), side: I.side, type: b.type, I: I };
    }
    function drawWhy(g, v, sc, b) {
      var WL = whyLines(b); if (!WL) return;
      var line1 = WL.line1, line2 = WL.line2, I = WL.I, col = TEAM[I.side].main;
      var w = Math.min(v.w - 24 * sc, Math.max(measure(g, line1, 12.5, 800), measure(g, line2, 10, 600)) + 58 * sc), h = 40 * sc, x = v.x + 12 * sc, y = v.y + v.h - h - 10 * sc;
      if (typeof opt.whyRect === 'function') { var wr = null; try { wr = opt.whyRect(w, h); } catch (e2) {} if (wr) { x = wr.x; y = wr.y; } }
      var k = clamp(play.bt / 140, 0, 1);
      g.save(); g.globalAlpha = k; g.translate(0, (1 - easeOut(k)) * 8 * sc);
      panel(g, x, y, w, h, { r: 8 * sc, edge: col });
      g.save(); g.beginPath(); g.arc(x + 20 * sc, y + h / 2, 14 * sc, 0, 7); g.fillStyle = I.side === 'a' ? '#1d3352' : '#4a1d22'; g.fill(); g.clip(); headOf(g, I.u, I.look, x + 20 * sc, y + h / 2, 14 * sc, I.side); g.restore();
      g.beginPath(); g.arc(x + 20 * sc, y + h / 2, 14 * sc, 0, 7); g.lineWidth = 1.6 * sc; g.strokeStyle = col; g.stroke();
      text(g, line1, x + 40 * sc, y + 17 * sc, { size: 12.5, weight: 800, color: '#fff6e4', outline: false });
      text(g, line2, x + 40 * sc, y + 32 * sc, { size: 10, weight: 600, color: b.type === 'follow' ? '#ffd36a' : '#c9bce6', outline: false });
      g.restore();
      uiR.push({ name: 'why', x: x, y: y, w: w, h: h });
    }
    function drawBanner(g, v, sc) {
      var o = lastOutcome, words = { win: 'VICTORY', lose: 'DEFEAT', draw: 'DRAW' }, cols = { win: '#ffd36a', lose: '#ff7a7a', draw: '#cfd8ff' };
      var age = play && play.endT != null ? t - play.endT : 1000;
      var k = easeOut(clamp(age / 420, 0, 1)), h = 54 * sc, y = v.y + v.h * 0.12, x = v.x;
      g.save();
      var lg = g.createLinearGradient(v.x, 0, v.x + v.w, 0); lg.addColorStop(0, 'rgba(14,9,22,0)'); lg.addColorStop(0.25, 'rgba(14,9,22,0.88)'); lg.addColorStop(0.75, 'rgba(14,9,22,0.88)'); lg.addColorStop(1, 'rgba(14,9,22,0)');
      g.globalAlpha = k; g.fillStyle = lg; g.fillRect(v.x, y, v.w, h);
      g.fillStyle = cols[o.result]; g.globalAlpha = k * 0.85; g.fillRect(v.x + v.w * 0.2, y, v.w * 0.6 * k, 1.5 * sc); g.fillRect(v.x + v.w * (0.8 - 0.6 * k), y + h - 1.5 * sc, v.w * 0.6 * k, 1.5 * sc);
      g.globalAlpha = k * 0.4; g.fillRect(v.x + v.w * 0.26, y + 3.2 * sc, v.w * 0.48 * k, 0.7 * sc); g.fillRect(v.x + v.w * (0.74 - 0.48 * k), y + h - 3.9 * sc, v.w * 0.48 * k, 0.7 * sc);
      g.globalAlpha = k;
      var wg = g.createLinearGradient(0, y + h * 0.16, 0, y + h * 0.6); wg.addColorStop(0, '#fffdf0'); wg.addColorStop(0.55, cols[o.result]); wg.addColorStop(1, cols[o.result]);
      var ww = text(g, words[o.result], v.x + v.w / 2, y + h * 0.57, { size: 29 * (1 + (1 - k) * 0.3), weight: 700, font: 'display', spacing: 4, color: wg, align: 'center', ow: 5 });
      [-1, 1].forEach(function (d) { var ox = v.x + v.w / 2 + d * (ww / 2 + 16 * sc), oy = y + h * 0.4; g.save(); g.translate(ox, oy); g.rotate(Math.PI / 4); g.fillStyle = cols[o.result]; g.globalAlpha = k * 0.9; g.fillRect(-2.6 * sc, -2.6 * sc, 5.2 * sc, 5.2 * sc); g.restore(); g.fillStyle = cols[o.result]; g.globalAlpha = k * 0.55; g.fillRect(d > 0 ? ox + 7 * sc : ox - 47 * sc, oy - 0.5 * sc, 40 * sc, 1 * sc); g.globalAlpha = k; });
      text(g, (o.match ? '✔ Played exactly as forecast' : '✖ Differs from the forecast') + (P.seedLabel === 'on' ? '  ·  seed ' + o.seed : ''), v.x + v.w / 2, y + h * 0.86, { size: 9.5, weight: 700, color: o.match ? '#b8ffcb' : '#ffb3bd', align: 'center', ow: 3 });
      g.restore();
      uiR.push({ name: 'banner', x: x, y: y, w: v.w, h: h });
    }
    // the forecast summary panel (the host chooses the rect); returns the rect it drew
    function drawForecast(g, rect, o) {
      o = o || {};
      try {
        var fc = forecast(); if (!fc || !rect) return null; var sc = scaleOf(), x = rect.x, y = rect.y, w = rect.w, h = rect.h;
        panel(g, x, y, w, h, { r: 9 * sc });
        var words = { win: 'VICTORY', lose: 'DEFEAT', draw: 'DRAW' }, cols = { win: '#ffd36a', lose: '#ff7a7a', draw: '#cfd8ff' };
        text(g, 'FORECAST', x + 12 * sc, y + 15 * sc, { size: 8.5, weight: 800, color: '#bfb3d8', outline: false });
        if (P.seedLabel === 'on') text(g, 'seed ' + fc.seed, x + w - 10 * sc, y + 15 * sc, { size: 7.5, weight: 600, color: 'rgba(191,179,216,0.7)', outline: false, align: 'right' });
        var cw = measure(g, words[fc.result], 16, 900) + 26 * sc, cy0 = y + 20 * sc;
        g.save(); rr(g, x + 12 * sc, cy0, cw, 23 * sc, 11.5 * sc); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill(); g.lineWidth = 1.6 * sc; g.strokeStyle = cols[fc.result]; g.stroke(); g.restore();
        text(g, words[fc.result], x + 12 * sc + cw / 2, cy0 + 17.4 * sc, { size: 16, weight: 700, font: 'display', spacing: 1, color: cols[fc.result], align: 'center', outline: false });
        var ta = fc.totals.a, tb = fc.totals.b, x2 = x + 20 * sc + cw + 4 * sc, loser = fc.result === 'win' ? tb : ta;
        var sub1 = fc.result === 'draw' ? 'Both squads' : loser.after === 0 ? 'Wiped out' : 'Routed', sub2 = fc.result === 'draw' ? 'hold the field' : 'in round ' + fc.endedRound;
        text(g, sub1, x2, cy0 + 9 * sc, { size: 9.5, weight: 700, color: '#fff6e4', outline: false });
        text(g, sub2, x2, cy0 + 21 * sc, { size: 9, weight: 600, color: '#c9bce6', outline: false });
        var pl = function (n, s1) { return n + ' ' + s1 + (n === 1 ? '' : 's'); };
        text(g, pl(fc.counts.guards, 'guard') + ' \u00b7 ' + pl(fc.counts.follows, 'follow-up') + ' \u00b7 ' + pl(fc.counts.crits, 'crit'), x + 12 * sc, cy0 + 36 * sc, { size: 8.5, weight: 600, color: '#c9bce6', outline: false });
        var bar = function (yy, label, T, col) {
          text(g, label, x + 12 * sc, yy + 7 * sc, { size: 9, weight: 700, color: '#fff6e4', outline: false });
          var bx = x + 40 * sc, bw = w - 40 * sc - (o.compact ? 12 : 72) * sc, bh = 7 * sc;
          rr(g, bx, yy, bw, bh, 3 * sc); g.fillStyle = 'rgba(0,0,0,0.45)'; g.fill();
          rr(g, bx, yy, bw * T.after / Math.max(1, T.max), bh, 3 * sc); g.fillStyle = col; g.fill();
          if (T.before > T.after) { g.save(); g.globalAlpha = 0.55 + 0.35 * Math.sin(t / 160); g.fillStyle = '#ff4f6a'; g.fillRect(bx + bw * T.after / T.max, yy, bw * (T.before - T.after) / T.max, bh); g.restore(); }
          if (!o.compact) text(g, T.before + '\u2192' + T.after + (T.fall ? '  \u2620' + T.fall : ''), bx + bw + 6 * sc, yy + 7 * sc, { size: 9, weight: 700, color: T.fall ? '#ffb3bd' : '#e8e0ff', outline: false });
        };
        if (h > 70 * sc) { bar(y + h - 29 * sc, o.labelA || 'You', ta, '#5fd17a'); bar(y + h - 15 * sc, o.labelB || 'Foe', tb, '#ff6a5a'); }
        uiR.push({ name: 'forecast', x: x, y: y, w: w, h: h });
        return rect;
      } catch (e) { warnOnce(warned, 'drawForecast', 'drawForecast failed: ' + e.message); return null; }
    }
    function draw(g) { drawScene(g); drawUI(g); }

    var api = {
      version: VERSION,
      setSquads: function (a, b) { squads.a = a || []; squads.b = b || []; if (phase !== 'playing') { phase = 'forecast'; play = null; lastOutcome = null; fx = []; nums = []; unitFx = {}; } return api; },
      setSeed: function (s) { seed = (s >>> 0) || 1; return api; },
      seed: function () { return seed; },
      setParams: function (o) { setParams(o); return api; },
      params: function () { var o = {}; for (var key in P) o[key] = P[key]; return o; },
      forecast: forecast,
      commit: commit,
      update: update, draw: draw, drawScene: drawScene, drawUI: drawUI, drawForecast: drawForecast,
      phase: function () { return phase; },
      playing: function () { return phase === 'playing'; },
      outcome: function () { return lastOutcome; },
      current: function () { var b = current(); return b ? { type: b.type, event: b.e, t: play.bt } : null; },
      // the why readout as text (for an HTML caption or a screen reader): {line1, line2, actor, side, type} or null
      why: function () { var b = current(); if (!b || phase !== 'playing' || !(b.type === 'act' || b.type === 'follow' || b.type === 'skip')) return null; var w = whyLines(b); if (w) delete w.I; return w; },
      anchor: anchor, slotRect: slotRect, home: home,
      unitRects: function () { return rects.slice(); },
      uiRects: function () { return uiR.slice(); },
      fieldRect: function () { return V(); },
      hitStop: function (ms) { stop = Math.max(stop, +ms || 0); },
      pause: function (on) { paused = !!on; },
      setFast: function (k) { fast = clamp(+k || 1, 0.25, 8); },
      skip: function () { if (!play || phase !== 'playing') return; var n = 0; while (phase === 'playing' && n++ < 100000) update(1000 / 60); },
      reset: function () { play = null; lastOutcome = null; phase = squads.a.length ? 'forecast' : 'idle'; fx = []; nums = []; unitFx = {}; },
      clearFx: function () { fx = []; nums = []; },
      stats: function () { return { clashes: stats.clashes, matches: stats.matches, mismatches: stats.mismatches, hits: stats.hits, fx: fx.length, nums: nums.length, phase: phase }; },
      paintUnit: function (g, unitOrLook, x, footY, s, dir, pose) { var L = unitOrLook && unitOrLook.kind ? unitOrLook : lookOf(unitOrLook || {}); paintUnit(g, L, x, footY, s || 1, dir || 1, pose || { pose: 'idle', k: 0 }, t / 1000, 0, 1, false); },
      paintHead: function (g, unitOrLook, x, y, r) { var L = unitOrLook && unitOrLook.kind ? unitOrLook : lookOf(unitOrLook || {}); if (unitOrLook && !unitOrLook.kind && typeof opt.drawHead === 'function') { try { if (opt.drawHead(g, unitOrLook, x, y - r * 0.16, r * 1.05, { side: sideOf(unitOrLook.id), facing: sideOf(unitOrLook.id) === 'b' ? 'left' : 'right', t: t / 1000 }) === true) return; } catch (e) {} } paintHead(g, L, x, y, r); },
      panel: panel, text: text, skills: skills, conditions: conds, time: function () { return t; }
    };
    return api;
  }

  /* ---------- adapters: plug in A-12 squad-formation row rules and A-13 tactic-rules decisions (both optional) ---------- */
  // targetsFor from GameDNA_SquadFormation: create({targetsFor: GameDNA_SquadClash.adapters.squadFormation(GameDNA_SquadFormation, params)})
  function adaptSF(SF, params) {
    var R = SF && SF.rules ? SF.rules(params || {}, { id: function (u) { return u.id; }, hp: function (u) { return u.hp; }, maxHp: function (u) { return u.maxHp; } }) : null;
    return function (user, skill, allies, enemies) {
      if (!R || !skill) return targetsFor(user, skill, allies, enemies);
      if (skill.from && rowOf(user) !== skill.from) return [];
      if (skill.kind === 'heal') return allies.filter(function (u) { return u.hp > 0 && u.hp < u.maxHp; });
      var slots = [null, null, null, null, null, null]; enemies.forEach(function (u) { slots[(rowOf(u) === 'back' ? 3 : 0) + u.col] = u; });
      var reach = skill.kind === 'melee' ? 'melee' : skill.kind === 'magic' ? 'magic' : 'ranged';
      // 4th arg (A-12 v1.2+): the attacker's slot, so backMelee 0 leaves a back-row melee unit with no target
      try { return R.targetsFor(user, { id: 'tmp', team: 'b', slots: slots }, reach, (rowOf(user) === 'back' ? 3 : 0) + user.col) || []; } catch (e) { return targetsFor(user, skill, allies, enemies); }
    };
  }
  // evaluate from GameDNA_TacticRules: each unit's `rules` is an A-13 set ({rules, otherwise}) or array; skills become actions
  function adaptTR(TR, skillsMap) {
    return function (u, ctx) {
      if (!TR || !TR.evaluate) return null;
      var SKL = skillsMap || SKILLS, units = [];
      ctx.allies.concat(ctx.enemies).forEach(function (x) { units.push({ id: x.id, name: x.name, side: x.side === u.side ? 'ally' : 'enemy', hp: x.hp, maxHp: x.maxHp, tags: x.tags.slice(), row: rowOf(x), alive: x.hp > 0 }); });
      var actions = u.skills.map(function (id) {
        var sk = SKL[id]; if (!sk || sk.follow) return null;
        var spent = sk.uses > 0 && (u.used[id] || 0) >= sk.uses, rowBad = sk.from && rowOf(u) !== sk.from;
        var tg = targetsFor(u, sk, ctx.allies, ctx.enemies).map(function (t) { return t.id; });
        return { id: id, label: sk.name || id, aim: sk.kind === 'heal' ? 'ally' : 'enemy', role: sk.kind === 'heal' ? 'heal' : sk.kind === 'magic' ? 'magic' : 'attack', usable: !spent && !rowBad, reason: spent ? 'used up' : rowBad ? 'needs the ' + sk.from + ' row' : '', targets: tg };
      }).filter(Boolean);
      var d = TR.evaluate(u.rules || [], { self: u.id, turn: ctx.round, units: units, actions: actions });
      if (!d || !d.action || !d.targets || !d.targets.length) return null;
      return { skill: d.action, target: d.targets[0], rule: d.rule, cond: d.kind === 'rule' ? 'host' : d.kind, why: d.ruleText ? d.ruleText + (d.reason ? ' (' + d.reason + ')' : '') : d.reason };
    };
  }

  root.GameDNA_SquadClash = {
    adapters: { squadFormation: adaptSF, tacticRules: adaptTR },
    version: VERSION, create: create, simulate: simulate, evaluate: function (unit, ctx, opts) { opts = opts || {}; return evaluate({ skills: opts.skills || SKILLS, conditions: opts.conditions || CONDITIONS, extraSkills: [], targetsFor: opts.targetsFor || targetsFor }, unit, ctx); },
    rowOf: rowOf, targetsFor: targetsFor, ruleText: ruleText, ruleParts: ruleParts, normSquad: normSquad, inputKey: inputKey,
    SKILLS: SKILLS, PRESETS: PRESETS, LOOKS: LOOKS, CONDITIONS: CONDITIONS, COND_TEXT: COND_TEXT, rng: mulberry32
  };
})(typeof window !== 'undefined' ? window : this);
