  /* ===================================================================================================
     card-battle.js part 1: seeded RNG, built-in content, the pure rules (state, cards, enemies, statuses).
     Everything in this part works on a plain state object S and never draws; the bot's look-ahead runs the
     same functions on a clone. No Math.random, no clock.
     =================================================================================================== */
  var VERSION = '1.1.0';

  // ---- RNG (mulberry32 on a cloneable {s}) ----
  function mkRng(seed) { return { s: (seed >>> 0) || 1 }; }
  function rnext(r) { var t = (r.s = (r.s + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function rint(r, n) { return Math.floor(rnext(r) * n); }
  function shuffle(r, a) { for (var i = a.length - 1; i > 0; i--) { var j = rint(r, i + 1), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function hash(a, b) { var h = Math.imul((a | 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((b | 0) + 0x632BE5AB, 0xC2B2AE35); h ^= h >>> 13; h = Math.imul(h, 0x27D4EB2F); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

  // ---- Built-in statuses. kind buff|debuff; stack 'intensity' (stays) | 'duration' (minus 1 at the end of its owner's turn).
  // Rules fields: dealtAdd (adds its stacks to each hit the owner deals), dealtMul / takenMul (multiply hits while > 0),
  // tick (lose that many HP at the end of the owner's turn, ward does not stop it, then minus 1), barbs (an attacker that hits
  // the owner takes that much back). Or code: onTurnEnd(unit, n, api) / onHitTaken(unit, n, source, api).
  var STATUSES = {
    might:   { name: 'Might',   kind: 'buff',   stack: 'intensity', dealtAdd: true,  color: '#ffc95a', glyph: 'might',   text: 'Each hit deals +{n} damage.' },
    barbs:   { name: 'Barbs',   kind: 'buff',   stack: 'intensity', barbs: true,     color: '#9fe06a', glyph: 'barbs',   text: 'Attackers take {n} damage back.' },
    exposed: { name: 'Exposed', kind: 'debuff', stack: 'duration',  takenMul: 1.3,   color: '#ff8a6a', glyph: 'exposed', text: 'Takes 30% more damage. {n} turn(s).' },
    sapped:  { name: 'Sapped',  kind: 'debuff', stack: 'duration',  dealtMul: 0.7,   color: '#b59cff', glyph: 'sapped',  text: 'Deals 30% less damage. {n} turn(s).' },
    burn:    { name: 'Burn',    kind: 'debuff', stack: 'intensity', tick: true,      color: '#ff9a3c', glyph: 'burn',    text: 'Loses {n} HP at the end of its turn, then 1 less.' }
  };

  // ---- Built-in cards. type attack|skill|charm; target 'enemy' (aim at one foe) | 'none' (self / all / random).
  // effects: {do: 'damage', n, hits, to: 'target'|'all'|'random'} | {do: 'ward', n} | {do: 'status', id, n, to: 'target'|'all'|'self'|'random'}
  //          | {do: 'draw', n} | {do: 'energy', n} | {do: 'heal', n} | function (api) {...} (see README).
  // text: {damage} / {damage2} = the first / second damage effect after Might, Sapped and Exposed; {ward} = the first ward.
  // fade: true = removed for the rest of the fight once played. pool: true = can be offered as a reward.
  var CARDS = {
    'thorn-jab':     { name: 'Thorn Jab',     cost: 1, type: 'attack', target: 'enemy', rarity: 'common', art: 'blade', text: 'Deal {damage} damage.', effects: [{ do: 'damage', n: 6 }] },
    'bark-ward':     { name: 'Bark Ward',     cost: 1, type: 'skill',  target: 'none',  rarity: 'common', art: 'guard', text: 'Gain {ward} Ward.', effects: [{ do: 'ward', n: 5 }] },
    'ember-toss':    { name: 'Ember Toss',    cost: 1, type: 'attack', target: 'enemy', rarity: 'common', art: 'fire',  text: 'Deal {damage} damage. Apply 2 Burn.', effects: [{ do: 'damage', n: 4, type: 'fire' }, { do: 'status', id: 'burn', n: 2 }] },
    'root-snare':    { name: 'Root Snare',    cost: 2, type: 'attack', target: 'enemy', rarity: 'common', art: 'root',  text: 'Deal {damage} damage. Apply 2 Exposed.', effects: [{ do: 'damage', n: 9 }, { do: 'status', id: 'exposed', n: 2 }] },
    'briar-flurry':  { name: 'Briar Flurry',      cost: 1, type: 'attack', target: 'enemy', rarity: 'common', art: 'blade', pool: true, text: 'Deal {damage} damage twice.', effects: [{ do: 'damage', n: 4, hits: 2 }] },
    'kindle':        { name: 'Kindle',        cost: 1, type: 'skill',  target: 'enemy', rarity: 'common', art: 'fire',  pool: true, text: 'Apply 5 Burn.', effects: [{ do: 'status', id: 'burn', n: 5 }] },
    'quickstep':     { name: 'Quickstep',     cost: 1, type: 'skill',  target: 'none',  rarity: 'common', art: 'speed', pool: true, text: 'Gain {ward} Ward. Draw 2 cards.', effects: [{ do: 'ward', n: 4 }, { do: 'draw', n: 2 }] },
    'ash-sweep':     { name: 'Ash Sweep',     cost: 1, type: 'attack', target: 'none',  rarity: 'common', art: 'storm', pool: true, text: 'Deal {damage} damage to every foe.', effects: [{ do: 'damage', n: 5, to: 'all' }] },
    'frost-pin':     { name: 'Frost Pin',     cost: 1, type: 'attack', target: 'enemy', rarity: 'common', art: 'frost', pool: true, text: 'Deal {damage} damage. Apply 2 Sapped.', effects: [{ do: 'damage', n: 5, type: 'frost' }, { do: 'status', id: 'sapped', n: 2 }] },
    'moss-shield':   { name: 'Moss Shield',   cost: 2, type: 'skill',  target: 'none',  rarity: 'rare',   art: 'guard', pool: true, text: 'Gain {ward} Ward.', effects: [{ do: 'ward', n: 13 }] },
    'fresh-wick':    { name: 'Fresh Wick',     cost: 0, type: 'skill',  target: 'none',  rarity: 'rare',   art: 'light', pool: true, fade: true, text: 'Gain 1 Lumen. Draw 1 card. Fades.', effects: [{ do: 'energy', n: 1 }, { do: 'draw', n: 1 }] },
    'brittle-hex':   { name: 'Brittle Hex',   cost: 1, type: 'skill',  target: 'none',  rarity: 'rare',   art: 'magic', pool: true, text: 'Apply 2 Exposed to every foe.', effects: [{ do: 'status', id: 'exposed', n: 2, to: 'all' }] },
    'chain-spark':   { name: 'Chain Spark',   cost: 2, type: 'attack', target: 'none',  rarity: 'rare',   art: 'storm', pool: true, text: 'Deal {damage} damage to a random foe 4 times.', effects: [{ do: 'damage', n: 3, hits: 4, to: 'random', type: 'shock' }] },
    'lantern-flare': { name: 'Lantern Flare', cost: 2, type: 'attack', target: 'enemy', rarity: 'rare',   art: 'light', pool: true, text: 'Deal {damage} damage.', effects: [{ do: 'damage', n: 15, type: 'light' }] },
    'mend-sap':      { name: 'Mend Sap',      cost: 1, type: 'skill',  target: 'none',  rarity: 'rare',   art: 'heart', pool: true, fade: true, text: 'Heal 7 HP. Fades.', effects: [{ do: 'heal', n: 7 }] },
    'heartwood':     { name: 'Heartwood',     cost: 1, type: 'charm',  target: 'none',  rarity: 'epic',   art: 'heart', pool: true, text: 'Gain 2 Might for this fight.', effects: [{ do: 'status', id: 'might', n: 2, to: 'self' }] },
    'briar-coat':    { name: 'Briar Coat',    cost: 1, type: 'charm',  target: 'none',  rarity: 'epic',   art: 'root',  pool: true, text: 'Gain 3 Barbs and {ward} Ward.', effects: [{ do: 'status', id: 'barbs', n: 3, to: 'self' }, { do: 'ward', n: 4 }] }
  };

  // ---- Built-in foes. hp: n or [min, max] (rolled from the fight seed). moves: {id: {name, effects, weight}}; enemy effects
  // default to the hero ('to: self' = the foe itself, 'allies' = every living foe). pattern: [move ids] repeated in order,
  // or function ({enemy, turn, last, rng, hero, foes}) -> move id; without one, a weighted pick that never repeats a move 3 times.
  // look: a built-in painter (toad, wisp, brute, imp, thief, golem, slime, bat) and palette {body, belly, accent, eye}.
  var ENEMIES = {
    'mire-toad':     { name: 'Mire Toad',     hp: [24, 28], look: 'toad',  moves: {
      lash:  { name: 'Tongue Lash', effects: [{ do: 'damage', n: 7 }], weight: 2 },
      swell: { name: 'Swell',       effects: [{ do: 'ward', n: 6, to: 'self' }, { do: 'status', id: 'might', n: 1, to: 'self' }], weight: 1 } } },
    'ash-wisp':      { name: 'Ash Wisp',      hp: [15, 18], look: 'wisp',  pattern: ['singe', 'flicker', 'singe', 'flicker'], moves: {
      singe:   { name: 'Singe',   effects: [{ do: 'damage', n: 3, type: 'fire' }, { do: 'status', id: 'burn', n: 2 }] },
      flicker: { name: 'Flicker', effects: [{ do: 'damage', n: 3, hits: 2, type: 'fire' }] } } },
    'moss-brute':    { name: 'Moss Brute',    hp: [50, 54], look: 'brute', size: 1.25, pattern: ['rumble', 'slam', 'brace', 'swipe', 'slam', 'brace', 'swipe'], moves: {
      rumble: { name: 'Rumble',      effects: [{ do: 'status', id: 'sapped', n: 1 }, { do: 'ward', n: 6, to: 'self' }] },
      slam:   { name: 'Boulder Slam', effects: [{ do: 'damage', n: 13 }] },
      brace:  { name: 'Moss Brace',  effects: [{ do: 'ward', n: 10, to: 'self' }, { do: 'status', id: 'might', n: 2, to: 'self' }] },
      swipe:  { name: 'Twin Swipe',  effects: [{ do: 'damage', n: 6, hits: 2 }] } } },
    'cinder-imp':    { name: 'Cinder Imp',    hp: [17, 20], look: 'imp', moves: {
      claw: { name: 'Hot Claw',  effects: [{ do: 'damage', n: 6, type: 'fire' }], weight: 2 },
      jeer: { name: 'Jeer',      effects: [{ do: 'status', id: 'exposed', n: 2 }, { do: 'damage', n: 2 }], weight: 1 } } },
    'lantern-thief': { name: 'Lantern Thief', hp: [30, 33], look: 'thief', pattern: ['stab', 'smoke', 'cut', 'stab', 'smoke', 'cut'], moves: {
      stab:  { name: 'Quick Stab',  effects: [{ do: 'damage', n: 8 }] },
      smoke: { name: 'Smoke Veil',  effects: [{ do: 'ward', n: 8, to: 'self' }, { do: 'ward', n: 4, to: 'allies' }] },
      cut:   { name: 'Low Cut',     effects: [{ do: 'damage', n: 5 }, { do: 'status', id: 'sapped', n: 2 }] } } },
    'bramble-golem': { name: 'Bramble Golem', hp: 90, look: 'golem', size: 1.1, boss: true,
      pattern: function (o) { var c = ['grow', 'crush', 'lash', 'bind', 'crush', 'lash']; return o.turn === 1 ? 'grow' : c[(o.turn - 1) % c.length]; }, moves: {
      grow:  { name: 'Overgrowth',  effects: [{ do: 'status', id: 'barbs', n: 1, to: 'self' }, { do: 'ward', n: 12, to: 'self' }, { do: 'status', id: 'might', n: 1, to: 'self' }] },
      crush: { name: 'Root Crush',  effects: [{ do: 'damage', n: 13 }] },
      lash:  { name: 'Thorn Lash',  effects: [{ do: 'damage', n: 4, hits: 3 }] },
      bind:  { name: 'Binding Vines', effects: [{ do: 'status', id: 'sapped', n: 2 }, { do: 'status', id: 'exposed', n: 2 }, { do: 'damage', n: 4 }] } } }
  };

  // ---- State ----
  function copyObj(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }
  function unitCopy(u) { var c = copyObj(u); c.st = copyObj(u.st || {}); if (u.intent) c.intent = copyObj(u.intent); if (u.hist) c.hist = u.hist.slice(); return c; }
  function cardCopy(c) { return { uid: c.uid, id: c.id }; }
  function cloneState(S) {
    var c = copyObj(S);
    c.rng = { s: S.rng.s }; c.hero = unitCopy(S.hero); c.foes = S.foes.map(unitCopy);
    c.hand = S.hand.map(cardCopy); c.draw = S.draw.map(cardCopy); c.discard = S.discard.map(cardCopy); c.faded = S.faded.map(cardCopy);
    c.inPlay = S.inPlay ? cardCopy(S.inPlay) : null; c.stats = copyObj(S.stats);
    return c;
  }
  function unitById(S, id) { if (S.hero.id === id) return S.hero; for (var i = 0; i < S.foes.length; i++) if (S.foes[i].id === id) return S.foes[i]; return null; }
  function alive(S) { return S.foes.filter(function (f) { return f.hp > 0; }); }
  function st(u, id) { return (u && u.st && u.st[id]) || 0; }
  function cardDef(S, id) { return S.lib.cards[id] || { name: id, cost: 1, type: 'skill', target: 'none', text: '?', effects: [] }; }
  function enemyDef(S, id) { return S.lib.enemies[id] || { name: id, hp: 10, moves: { idle: { name: 'Idle', effects: [] } } }; }

  // Damage of one hit from src to tgt after statuses (tgt may be null: the card's text without a target).
  function calcDamage(S, src, tgt, base) {
    var v = +base || 0, L = S.lib.statuses, k;
    if (src) for (k in src.st) if (src.st[k] > 0 && L[k]) { if (L[k].dealtAdd) v += src.st[k]; }
    if (src) for (k in src.st) if (src.st[k] > 0 && L[k] && L[k].dealtMul) v *= L[k].dealtMul;
    if (tgt) for (k in tgt.st) if (tgt.st[k] > 0 && L[k] && L[k].takenMul) v *= L[k].takenMul;
    return Math.max(0, Math.floor(v + 1e-9));
  }

  function ev(out, e) { out.push(e); return e; }
  function checkOver(S, out) {
    if (S.over) return;
    if (S.hero.hp <= 0) { S.over = 'lose'; ev(out, { kind: 'end', result: 'lose' }); }
    else if (!alive(S).length) { S.over = 'win'; ev(out, { kind: 'end', result: 'win' }); }
  }
  function applyDamage(S, src, tgt, raw, out, o) {
    if (!tgt || tgt.hp <= 0 || S.over) return null;
    o = o || {};
    var blocked = o.pierce ? 0 : Math.min(tgt.ward, raw), before = tgt.hp;
    tgt.ward -= blocked;
    var loss = Math.min(tgt.hp, raw - blocked); tgt.hp -= loss;
    var e = ev(out, { kind: 'damage', source: src ? src.id : null, target: tgt.id, side: tgt === S.hero ? 'hero' : 'foe', raw: raw, blocked: blocked, amount: loss,
      hpBefore: before, hpAfter: tgt.hp, killed: before > 0 && tgt.hp <= 0, type: o.type || 'physical', tag: o.tag || null, crit: false, card: o.card || null, move: o.move || null });
    if (src === S.hero) S.stats.dealt += loss; else if (tgt === S.hero) S.stats.taken += loss;
    if (e.killed && tgt !== S.hero) { tgt.ward = 0; tgt.intent = null; ev(out, { kind: 'death', unit: tgt.id, by: src ? src.id : null }); }
    if (!o.noBarbs && src && src !== tgt && src.hp > 0 && st(tgt, 'barbs') > 0 && raw > 0) {
      var L = S.lib.statuses;
      for (var k in tgt.st) if (tgt.st[k] > 0 && L[k] && L[k].barbs) applyDamage(S, tgt, src, tgt.st[k], out, { tag: 'barbs', type: 'thorns', noBarbs: true });
    }
    checkOver(S, out);
    return e;
  }
  function addWard(S, u, n, out, src) { if (!u || u.hp <= 0 || n <= 0) return; u.ward += n; ev(out, { kind: 'ward', target: u.id, amount: n, total: u.ward, source: src ? src.id : null }); }
  function heal(S, u, n, out, src) {
    if (!u || u.hp <= 0) return; var before = u.hp; u.hp = Math.min(u.maxHp, u.hp + Math.max(0, n));
    ev(out, { kind: 'heal', target: u.id, side: u === S.hero ? 'hero' : 'foe', amount: u.hp - before, hpBefore: before, hpAfter: u.hp, type: 'heal', source: src ? src.id : null });
  }
  function addStatus(S, u, id, n, out, src) {
    if (!u || u.hp <= 0 || !n) return; var def = S.lib.statuses[id];
    u.st[id] = Math.max(0, (u.st[id] || 0) + n);
    ev(out, { kind: 'status', target: u.id, id: id, amount: n, total: u.st[id], debuff: !!(def && def.kind === 'debuff'), source: src ? src.id : null });
  }
  function reshuffle(S, out) { if (!S.discard.length) return; S.draw = shuffle(S.rng, S.discard.splice(0)); S.stats.reshuffles++; ev(out, { kind: 'reshuffle', n: S.draw.length }); }
  function drawOne(S, out) {
    if (S.hand.length >= S.handMax) { ev(out, { kind: 'handFull' }); return false; }
    if (!S.draw.length) reshuffle(S, out);
    if (!S.draw.length) return false;
    var c = S.draw.pop(); S.hand.push(c); ev(out, { kind: 'draw', uid: c.uid, id: c.id }); return true;
  }

  // The API handed to code effects, statuses with code and enemy pattern functions.
  function api(S, src, tgt, out, card) {
    return {
      state: S, source: src, target: tgt, hero: S.hero, card: card || null, foes: function () { return alive(S); }, rng: function () { return rnext(S.rng); },
      damage: function (u, n, o) { return applyDamage(S, src, u, calcDamage(S, src, u, n), out, o); },
      rawDamage: function (u, n, o) { return applyDamage(S, src, u, n, out, o); },
      ward: function (u, n) { addWard(S, u || src, n, out, src); }, heal: function (u, n) { heal(S, u || src, n, out, src); },
      status: function (u, id, n) { addStatus(S, u, id, n, out, src); }, draw: function (n) { for (var i = 0; i < n; i++) drawOne(S, out); },
      energy: function (n) { S.energy += n; ev(out, { kind: 'energy', amount: n, total: S.energy }); }
    };
  }
  function pickRandomFoe(S) { var a = alive(S); return a.length ? a[rint(S.rng, a.length)] : null; }

  // One effect expands into steps (functions that run at their impact frame). Multi-hit damage is one step per hit.
  function effectSteps(S, eff, srcId, tgtId, ctx) {
    var steps = [], isHero = srcId === S.hero.id;
    function src() { return unitById(S, srcId); }
    function resolveTargets(to) {
      var s = src();
      if (to === 'self') return [s];
      if (to === 'hero') return [S.hero];
      if (to === 'all') return isHero ? alive(S) : [S.hero];
      if (to === 'allies') return isHero ? [S.hero] : alive(S);
      if (to === 'random') { var r = isHero ? pickRandomFoe(S) : S.hero; return r ? [r] : []; }
      if (isHero) { var t = unitById(S, tgtId); return t && t.hp > 0 ? [t] : []; }
      return [S.hero];
    }
    if (typeof eff === 'function') { steps.push({ wait: 12, run: function (out) { var t = unitById(S, tgtId); eff(api(S, src(), t, out, ctx.card)); } }); return steps; }
    if (!eff || !eff.do) return steps;
    var d = eff.do, n = +eff.n || 0, to = eff.to || (d === 'ward' || d === 'heal' ? 'self' : d === 'status' && !isHero ? 'hero' : 'target');
    if (d === 'status' && isHero && !eff.to) to = ctx.targeted ? 'target' : 'self';
    if (d === 'damage') {
      var hits = Math.max(1, eff.hits | 0 || 1);
      for (var h = 0; h < hits; h++) steps.push({ wait: to === 'all' ? 16 : 11, hit: true, run: function (out) {
        var s = src(); if (!s || s.hp <= 0) return;
        resolveTargets(to).forEach(function (t) { applyDamage(S, s, t, calcDamage(S, s, t, n), out, { type: eff.type, card: ctx.card, move: ctx.move }); });
      } });
    } else steps.push({ wait: d === 'draw' ? 4 : 10, run: function (out) {
      var s = src(); if (!s || s.hp <= 0) return;
      if (d === 'ward') resolveTargets(to).forEach(function (t) { addWard(S, t, n, out, s); });
      else if (d === 'heal') resolveTargets(to).forEach(function (t) { heal(S, t, n, out, s); });
      else if (d === 'status') resolveTargets(to).forEach(function (t) { addStatus(S, t, eff.id, n, out, s); });
      else if (d === 'draw') for (var i = 0; i < n; i++) drawOne(S, out);
      else if (d === 'energy') { S.energy += n; ev(out, { kind: 'energy', amount: n, total: S.energy }); }
      else if (d === 'lose') applyDamage(S, s, s, n, out, { pierce: true, noBarbs: true, tag: 'self' });
    } });
    return steps;
  }

  function canPlay(S, c) { if (!c || S.over || S.side !== 'player') return false; var d = cardDef(S, c.id); return !d.unplayable && (d.cost | 0) <= S.energy; }
  function needsTarget(S, id) { return cardDef(S, id).target === 'enemy'; }

  // Playing a card: returns the steps (pay + move it to play, each effect, then discard or fade). Validates first.
  function playSteps(S, uid, targetId) {
    var i = -1; for (var k = 0; k < S.hand.length; k++) if (S.hand[k].uid === uid) i = k;
    if (i < 0) return null; var c = S.hand[i], d = cardDef(S, c.id);
    if (!canPlay(S, c)) return null;
    var targeted = d.target === 'enemy';
    if (targeted) { var t = unitById(S, targetId); if (!t || t === S.hero || t.hp <= 0) return null; } else targetId = null;
    var steps = [{ wait: 14, run: function (out) {
      var e0 = S.energy; S.energy -= d.cost | 0; S.hand.splice(S.hand.indexOf(c), 1); S.inPlay = c; S.stats.played++;
      ev(out, { kind: 'play', uid: c.uid, id: c.id, cost: d.cost | 0, energyBefore: e0, energy: S.energy, target: targetId, type: d.type });
    } }];
    (d.effects || []).forEach(function (eff) { steps = steps.concat(effectSteps(S, eff, S.hero.id, targetId, { card: c.id, targeted: targeted })); });
    steps.push({ wait: 8, run: function (out) {
      if (!S.inPlay) return; var cc = S.inPlay; S.inPlay = null;
      if (d.fade || d.type === 'charm') { S.faded.push(cc); ev(out, { kind: 'fade', uid: cc.uid, id: cc.id }); }
      else { S.discard.push(cc); ev(out, { kind: 'discard', uid: cc.uid, id: cc.id, from: 'play' }); }
    } });
    return steps;
  }

  // Ends of turns: statuses with a duration lose 1, Burn ticks (ward does not stop it).
  function endOfTurnFor(S, u, out) {
    if (!u || u.hp <= 0) return; var L = S.lib.statuses;
    Object.keys(u.st).forEach(function (k) {
      var n = u.st[k], def = L[k]; if (!n || !def || u.hp <= 0) return;
      if (def.tick) { applyDamage(S, null, u, n, out, { pierce: true, noBarbs: true, type: 'burn', tag: 'tick' }); u.st[k] = Math.max(0, n - 1); }
      if (typeof def.onTurnEnd === 'function') { try { def.onTurnEnd(u, n, api(S, u, u, out)); } catch (e) { } }
      if (def.stack === 'duration') u.st[k] = Math.max(0, u.st[k] - 1);
      if (!u.st[k]) delete u.st[k];
    });
  }

  function moveOf(S, f) { var d = enemyDef(S, f.kind); return f.intent && d.moves ? d.moves[f.intent.move] : null; }
  function rollIntent(S, f) {
    var d = enemyDef(S, f.kind), ids = Object.keys(d.moves || {}), id = null;
    if (!ids.length) { f.intent = null; return; }
    var last = f.hist[f.hist.length - 1], last2 = f.hist[f.hist.length - 2];
    if (typeof d.pattern === 'function') { try { id = d.pattern({ enemy: f, turn: S.turn, last: last, hist: f.hist.slice(), rng: function () { return rnext(S.rng); }, hero: S.hero, foes: alive(S) }); } catch (e) { id = null; } }
    else if (Array.isArray(d.pattern) && d.pattern.length) id = d.pattern[f.hist.length % d.pattern.length];
    if (!id || !d.moves[id]) {
      var pool = ids.filter(function (m) { return !(ids.length > 1 && m === last && m === last2) && (d.moves[m].weight == null || d.moves[m].weight > 0); });
      if (!pool.length) pool = ids;
      var tot = 0; pool.forEach(function (m) { tot += d.moves[m].weight == null ? 1 : d.moves[m].weight; });
      var r = rnext(S.rng) * tot; id = pool[pool.length - 1];
      for (var i = 0; i < pool.length; i++) { r -= d.moves[pool[i]].weight == null ? 1 : d.moves[pool[i]].weight; if (r < 0) { id = pool[i]; break; } }
    }
    f.intent = { move: id, turn: S.turn };
  }
  function rollIntents(S, out) { alive(S).forEach(function (f) { rollIntent(S, f); ev(out, { kind: 'intent', unit: f.id, move: f.intent && f.intent.move, view: intentView(S, f) }); }); }

  // What an intent shows: icons with the live numbers (after the foe's Might / Sapped and the hero's Exposed).
  function intentView(S, f) {
    var m = moveOf(S, f); if (!m) return null;
    var d = enemyDef(S, f.kind), icons = [], dmg = 0, hits = 0, sawAtk = false;
    if (m.intent === 'hidden') return { move: f.intent.move, name: '???', icons: [{ k: 'hidden' }], damage: 0 };
    // statuses the move applies before its own hits count (the tag shows what will really land)
    var tf = { st: copyObj(f.st) }, th = { st: copyObj(S.hero.st) };
    (m.effects || []).forEach(function (e) {
      if (typeof e === 'function') { icons.push({ k: 'hidden' }); return; }
      if (e.do === 'status' && e.n) { var tu = e.to === 'self' || e.to === 'allies' ? tf : th; tu.st[e.id] = (tu.st[e.id] || 0) + e.n; }
      if (e.do === 'damage') { var per = calcDamage(S, tf, e.to === 'self' ? tf : th, e.n), h = Math.max(1, e.hits | 0 || 1); if (!sawAtk) icons.push({ k: 'attack', n: per, hits: h }); else { icons[0].hits += h; } sawAtk = true; dmg += per * h; hits += h; }
      else if (e.do === 'ward') { if (!icons.some(function (x) { return x.k === 'ward'; })) icons.push({ k: 'ward', n: e.n }); }
      else if (e.do === 'heal') icons.push({ k: 'heal', n: e.n });
      else if (e.do === 'status') { var sd = S.lib.statuses[e.id], k = sd && sd.kind === 'debuff' && e.to !== 'self' && e.to !== 'allies' ? 'debuff' : 'buff'; if (!icons.some(function (x) { return x.k === k; })) icons.push({ k: k, id: e.id }); }
    });
    if (!icons.length) icons.push({ k: 'idle' });
    return { move: f.intent.move, name: m.name || f.intent.move, icons: icons, damage: dmg, hits: hits, boss: !!d.boss };
  }

  // Ending the player's turn: discard the hand, the hero's end-of-turn, every foe acts (its ward drops first), the foes'
  // end-of-turn, new intents, then the next player turn (hero ward drops, Lumen refills, draw).
  function endTurnSteps(S) {
    var steps = [];
    steps.push({ wait: 10, run: function (out) {
      S.side = 'enemy'; ev(out, { kind: 'endTurn', turn: S.turn });
      var keep = []; S.hand.forEach(function (c) { var d = cardDef(S, c.id); if (d.keep) keep.push(c); else { S.discard.push(c); ev(out, { kind: 'discard', uid: c.uid, id: c.id, from: 'hand' }); } });
      S.hand = keep;
    } });
    steps.push({ wait: 14, run: function (out) { endOfTurnFor(S, S.hero, out); } });
    S.foes.forEach(function (f0) {
      var fid = f0.id;
      steps.push({ wait: 16, act: fid, run: function (out) {
        var f = unitById(S, fid); if (!f || f.hp <= 0 || S.over) return;
        if (f.ward) { f.ward = 0; }
        var view = intentView(S, f);
        ev(out, { kind: 'act', unit: fid, move: f.intent ? f.intent.move : null, intended: f.intent ? f.intent.move : null, shown: view ? view.damage : 0, name: view ? view.name : '' });
        f.actQueue = f.intent ? f.intent.move : null;
      } });
      // the move's effects: we expand the largest known move lazily (the move is known now: it is the intent rolled last turn)
      var mv = f0.intent && enemyDef(S, f0.kind).moves[f0.intent.move];
      ((mv && mv.effects) || []).forEach(function (eff) { effectSteps(S, eff, fid, S.hero.id, { move: f0.intent.move }).forEach(function (s) { steps.push({ wait: s.wait + 4, hit: s.hit, foe: fid, run: function (out) { var f = unitById(S, fid); if (!f || f.hp <= 0 || S.over) return; s.run(out); } }); }); });
      steps.push({ wait: 10, run: function (out) { var f = unitById(S, fid); if (!f || f.hp <= 0) return; if (f.intent) f.hist.push(f.intent.move); f.intent = null; ev(out, { kind: 'actDone', unit: fid }); } });
    });
    steps.push({ wait: 10, run: function (out) { alive(S).forEach(function (f) { endOfTurnFor(S, f, out); }); } });
    steps.push({ wait: 6, run: function (out) { if (S.over) return; S.turn++; rollIntents(S, out); } });
    return steps.concat(startTurnSteps(S));
  }
  function startTurnSteps(S) {
    var steps = [{ wait: 8, run: function (out) {
      if (S.over) return; S.side = 'player'; S.hero.ward = 0; S.energy = S.energyMax;
      ev(out, { kind: 'turn', turn: S.turn, energy: S.energy });
    } }];
    for (var i = 0; i < S.drawN; i++) steps.push({ wait: 5, run: function (out) { if (!S.over) drawOne(S, out); } });
    steps.push({ wait: 2, run: function (out) { if (!S.over) ev(out, { kind: 'ready', turn: S.turn }); } });
    return steps;
  }

  // A new fight. setup = {deck: [card ids], foes: [enemy ids or {id, hp}], hero: {hp, maxHp, name}, seed, energy, draw, handMax}
  function newState(setup, lib) {
    var S = { lib: lib, rng: mkRng(setup.seed || 1), turn: 1, side: 'player', over: null, uid: 0, energyMax: setup.energy || 3, energy: 0, drawN: setup.draw || 5, handMax: setup.handMax || 10,
      hand: [], draw: [], discard: [], faded: [], inPlay: null, stats: { played: 0, dealt: 0, taken: 0, reshuffles: 0 } };
    var h = setup.hero || {};
    S.hero = { id: h.id || 'hero', name: h.name || 'Hero', hp: h.hp != null ? h.hp : (h.maxHp || 60), maxHp: h.maxHp || h.hp || 60, ward: 0, st: {}, hero: true };
    var seen = {};
    S.foes = (setup.foes || []).map(function (x, i) {
      var id = typeof x === 'string' ? x : x.id, d = enemyDef(S, id), hp = typeof x === 'object' && x.hp ? x.hp : Array.isArray(d.hp) ? d.hp[0] + rint(S.rng, d.hp[1] - d.hp[0] + 1) : (d.hp || 20);
      seen[id] = (seen[id] || 0) + 1;
      return { id: id + '-' + seen[id], kind: id, name: d.name || id, hp: hp, maxHp: hp, ward: 0, st: {}, intent: null, hist: [], slot: i };
    });
    S.deck = (setup.deck || []).map(function (id) { return { uid: ++S.uid, id: id }; });
    S.draw = shuffle(S.rng, S.deck.map(cardCopy));
    S.deckSize = S.deck.length;
    return S;
  }
  function addCardTo(S, id, where, out) { var c = { uid: ++S.uid, id: id }; S.deckSize++; (where === 'hand' && S.hand.length < S.handMax ? S.hand : where === 'draw' ? S.draw : S.discard).push(c); ev(out, { kind: 'gain', uid: c.uid, id: id, to: where }); return c; }
  function runAll(S, steps, out) { for (var i = 0; i < steps.length; i++) { if (S.over && !steps[i].always) break; steps[i].run(out); } }
