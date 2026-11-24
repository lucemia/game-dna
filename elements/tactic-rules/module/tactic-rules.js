/* GameDNA A-13 - Conditional tactic rules (tactic-rules) - module v1.0.0 (plain script, no dependencies, one global)
 *
 *   // 1. pure, deterministic, explainable (no instance needed; A-14 and forecasts call this directly)
 *   const d = GameDNA_TacticRules.evaluate(ruleSet, snapshot);   // -> { action, targets: [ids], rule, why, reason, trace, ... }
 *
 *   // 2. an instance that reads your units through adapters, keeps each unit's rules, shows a "why" plate and an editor
 *   const tactics = GameDNA_TacticRules.create({
 *     actions: [{ id: 'strike', label: 'Strike', aim: 'enemy', role: 'attack' }, ...],   // your game's skills
 *     actionsOf: u => [...ids], allies: u => [...], enemies: u => [...],                 // living units, your objects
 *     canUse: (u, id) => true | false | 'reason', targets: (u, id) => [...units],         // optional
 *     fields: { id: 'id', name: 'name', hp: 'hp', maxHp: 'maxHp', res: 'mp', maxRes: 'maxMp', tags: u => [...], cls: u => 'healer' },
 *     turn: () => round, bounds: { x: 0, y: 0, w: 256, h: 224 }, getAnchor: u => ({ x, y, w, h }), uiRects: () => [...]
 *   });
 *   const d = tactics.decide(unit);   // where your AI / autoplay used to choose; then run d.action on d.targets with your own code
 *   tactics.openEditor(partyUnits);   // modal rule editor; while tactics.busy(): send keys to tactics.key(k), skip your world step
 *   tactics.update(stepMs); tactics.draw(ctx);
 *
 * A unit's rules are an ordered list "condition -> action (target pick)", checked top-down: the first rule that is on, whose
 * condition holds and whose action is usable with a valid target wins; otherwise the set's `otherwise` action; otherwise the
 * first usable action. evaluate() is a pure function of (rules, snapshot): same input, same decision, and it says which rule
 * fired and why every rule above it did not. Never throws from decide / update / draw / key / pointer.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0';
  var DEFAULTS = { why: 'on', whyMs: 1800, render: 'auto', theme: 'dusk', size: 0, maxRules: 8, autoClose: 0, minCssPx: 12 };

  /* ---------- conditions: data + pure tests over a snapshot ---------- */
  // n: {min, max, step, def, unit}; tag: true = picks one of the tags; side: whose units the condition names (they become the
  // preferred targets when the action aims at that side). test(S, rule) -> {ok, subjects?: [ids], side?, note}
  function alive(S, side) { var o = []; for (var i = 0; i < S.units.length; i++) { var u = S.units[i]; if (u.alive && u.side === side) o.push(u); } return o; }
  function pctOf(u) { return u.maxHp > 0 ? Math.round(100 * u.hp / u.maxHp) : 0; }
  function nameOf(u) { return u ? String(u.name != null ? u.name : u.id) : '?'; }
  function selfOf(S) { for (var i = 0; i < S.units.length; i++) if (S.units[i].id === S.self) return S.units[i]; return null; }
  function hasTag(u, tag) { if (!u || !u.tags) return false; var t = String(tag).toLowerCase(); for (var i = 0; i < u.tags.length; i++) if (String(u.tags[i]).toLowerCase() === t) return true; return false; }
  function lowest(list) { var b = null; for (var i = 0; i < list.length; i++) if (!b || pctOf(list[i]) < pctOf(b)) b = list[i]; return b; }
  function ids(list) { return list.map(function (u) { return u.id; }); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  var CONDITIONS = {
    always: { label: 'Always', test: function () { return { ok: true, note: 'always' }; } },
    selfHpBelow: { label: 'Self HP < {n}%', n: { min: 10, max: 90, step: 10, def: 30, unit: '%' }, test: function (S, r) {
      var me = selfOf(S), p = pctOf(me); return { ok: !!me && p < r.n, note: nameOf(me) + ' ' + p + '%' + (p < r.n ? ' < ' : ', not < ') + r.n + '%' }; } },
    selfHpAbove: { label: 'Self HP {n}%+', n: { min: 10, max: 100, step: 10, def: 70, unit: '%' }, test: function (S, r) {
      var me = selfOf(S), p = pctOf(me); return { ok: !!me && p >= r.n, note: nameOf(me) + ' ' + p + '%' + (p >= r.n ? ' >= ' : ', not >= ') + r.n + '%' }; } },
    allyHpBelow: { label: 'Ally HP < {n}%', side: 'ally', n: { min: 10, max: 90, step: 10, def: 40, unit: '%' }, test: function (S, r) {
      var L = alive(S, 'ally').filter(function (u) { return pctOf(u) < r.n; }), w = lowest(L.length ? L : alive(S, 'ally'));
      return { ok: L.length > 0, subjects: ids(L), side: 'ally', note: L.length ? nameOf(w) + ' ' + pctOf(w) + '% < ' + r.n + '%' : 'no ally under ' + r.n + '% (lowest ' + (w ? nameOf(w) + ' ' + pctOf(w) + '%' : 'none') + ')' }; } },
    foeHpBelow: { label: 'Foe HP < {n}%', side: 'enemy', n: { min: 10, max: 90, step: 10, def: 30, unit: '%' }, test: function (S, r) {
      var L = alive(S, 'enemy').filter(function (u) { return pctOf(u) < r.n; }), w = lowest(L);
      return { ok: L.length > 0, subjects: ids(L), side: 'enemy', note: L.length ? nameOf(w) + ' ' + pctOf(w) + '% < ' + r.n + '%' : 'no foe under ' + r.n + '%' }; } },
    foesAtLeast: { label: '{n}+ foes', n: { min: 2, max: 6, step: 1, def: 3, unit: '' }, test: function (S, r) {
      var k = alive(S, 'enemy').length; return { ok: k >= r.n, note: plural(k, 'foe', 'foes') + (k >= r.n ? ' >= ' : ', not >= ') + r.n }; } },
    foesAtMost: { label: 'Foes <= {n}', n: { min: 1, max: 5, step: 1, def: 1, unit: '' }, test: function (S, r) {
      var k = alive(S, 'enemy').length; return { ok: k > 0 && k <= r.n, note: plural(k, 'foe', 'foes') + (k <= r.n ? ' <= ' : ', not <= ') + r.n }; } },
    alliesAtMost: { label: 'Allies <= {n}', n: { min: 1, max: 5, step: 1, def: 1, unit: '' }, test: function (S, r) {
      var k = alive(S, 'ally').length; return { ok: k <= r.n, note: plural(k, 'ally', 'allies') + ' standing' + (k <= r.n ? ' <= ' : ', not <= ') + r.n }; } },
    foeIs: { label: 'Foe is {tag}', side: 'enemy', tag: true, test: function (S, r) {
      var L = alive(S, 'enemy').filter(function (u) { return hasTag(u, r.tag); });
      return { ok: L.length > 0, subjects: ids(L), side: 'enemy', note: L.length ? nameOf(L[0]) + ' is ' + r.tag : 'no ' + r.tag + ' foe' }; } },
    allyIs: { label: 'Ally is {tag}', side: 'ally', tag: true, test: function (S, r) {
      var L = alive(S, 'ally').filter(function (u) { return hasTag(u, r.tag); });
      return { ok: L.length > 0, subjects: ids(L), side: 'ally', note: L.length ? nameOf(L[0]) + ' is ' + r.tag : 'no ' + r.tag + ' ally' }; } },
    selfIs: { label: 'Self is {tag}', tag: true, test: function (S, r) {
      var me = selfOf(S), ok = hasTag(me, r.tag); return { ok: ok, note: nameOf(me) + (ok ? ' is ' : ' is not ') + r.tag }; } },
    selfResBelow: { label: 'Self {res} < {n}%', n: { min: 10, max: 90, step: 10, def: 30, unit: '%' }, test: function (S, r) {
      var me = selfOf(S), res = S.resLabel || 'MP';
      if (!me || !(me.maxRes > 0)) return { ok: false, note: nameOf(me) + ' has no ' + res };
      var p = Math.round(100 * me.res / me.maxRes); return { ok: p < r.n, note: nameOf(me) + ' ' + res + ' ' + p + '%' + (p < r.n ? ' < ' : ', not < ') + r.n + '%' }; } },
    firstTurn: { label: 'First turn', test: function (S) {
      var t = S.turn == null ? 1 : +S.turn; return { ok: t <= 1, note: 'turn ' + t + (t <= 1 ? '' : ', not the first') }; } }
  };
  var COND_ORDER = ['always', 'allyHpBelow', 'selfHpBelow', 'selfHpAbove', 'foeHpBelow', 'foeIs', 'foesAtLeast', 'foesAtMost', 'alliesAtMost', 'selfResBelow', 'firstTurn', 'selfIs', 'allyIs'];
  var PICKS = {
    auto: { label: 'Auto' }, weakest: { label: 'Weakest' }, lowest: { label: 'Lowest HP' },
    toughest: { label: 'Toughest' }, nearest: { label: 'Nearest' }, first: { label: 'First' }
  };
  var PICK_ORDER = ['auto', 'weakest', 'lowest', 'toughest', 'nearest', 'first'];
  var AIMS = { enemy: 'enemy', ally: 'ally', self: 'self', allEnemies: 'enemy', allAllies: 'ally', none: null };

  /* ---------- built-in presets, written with action ROLES; resolved against a unit's own actions ---------- */
  // roles: attack, magic, aoe, heal, healAll, guard, restore, buff, debuff, item
  var PRESETS = {
    guardian: { label: 'Guardian', rules: [
      { if: 'selfHpBelow', n: 30, role: 'guard' }, { if: 'allyHpBelow', n: 30, role: 'heal' }, { if: 'foeHpBelow', n: 30, role: 'attack', pick: 'lowest' },
      { if: 'foeIs', tag: '@armoured', role: 'magic' }], otherwise: { role: 'attack', pick: 'auto' } },
    healer: { label: 'Healer', rules: [
      { if: 'allyHpBelow', n: 40, role: 'heal', pick: 'weakest' }, { if: 'alliesAtMost', n: 1, role: 'heal', pick: 'weakest' }, { if: 'selfResBelow', n: 20, role: 'restore' },
      { if: 'foesAtLeast', n: 3, role: 'aoe' }], otherwise: { role: 'magic', pick: 'lowest' } },
    caster: { label: 'Caster', rules: [
      { if: 'foesAtLeast', n: 3, role: 'aoe' }, { if: 'foeIs', tag: '@flying', role: 'magic' }, { if: 'foeHpBelow', n: 30, role: 'magic', pick: 'lowest' },
      { if: 'selfResBelow', n: 20, role: 'restore' }, { if: 'allyHpBelow', n: 25, role: 'heal' }], otherwise: { role: 'magic', pick: 'auto' } },
    striker: { label: 'Striker', rules: [
      { if: 'firstTurn', role: 'buff' }, { if: 'foeHpBelow', n: 35, role: 'attack', pick: 'lowest' }, { if: 'foeIs', tag: '@flying', role: 'attack' },
      { if: 'selfHpBelow', n: 25, role: 'heal', pick: 'weakest' }], otherwise: { role: 'attack', pick: 'weakest' } },
    brute: { label: 'Brute', rules: [
      { if: 'foesAtLeast', n: 3, role: 'aoe' }, { if: 'foeHpBelow', n: 40, role: 'attack', pick: 'lowest' }, { if: 'selfHpBelow', n: 20, role: 'guard' }],
      otherwise: { role: 'attack', pick: 'toughest' } }
  };
  var PRESET_ORDER = ['guardian', 'healer', 'caster', 'striker', 'brute'];

  /* ---------- small helpers ---------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function copy(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function lc(s) { return String(s == null ? '' : s); }
  function warnOnce(store, key, msg, e) { if (store[key]) return; store[key] = 1; try { console.warn('[tactic-rules] ' + msg, e && e.message ? e.message : e || ''); } catch (x) { } }

  /* ---------- rules: normalise (never throw on sloppy data) ---------- */
  function normRule(r, conds) {
    r = r || {};
    var C = conds[r.if] ? r.if : r.if == null ? 'always' : r.if;
    var out = { on: r.on !== false, if: C, do: r.do == null ? null : String(r.do), pick: PICKS[r.pick] ? r.pick : 'auto' };
    var def = conds[C];
    if (def && def.n) out.n = clamp(num(r.n, def.n.def), def.n.min, def.n.max);
    else if (r.n != null) out.n = num(r.n, 0);
    if (def && def.tag) out.tag = r.tag == null ? '' : String(r.tag);
    else if (r.tag != null) out.tag = String(r.tag);
    if (r.role) out.role = String(r.role);
    if (r.note) out.note = String(r.note);
    return out;
  }
  function normSet(set, conds) {
    if (Array.isArray(set)) set = { rules: set };
    set = set || {};
    var rules = Array.isArray(set.rules) ? set.rules : [];
    var ow = set.otherwise == null ? null : typeof set.otherwise === 'string' ? { do: set.otherwise, pick: 'auto' } : set.otherwise;
    return { rules: rules.map(function (r) { return normRule(r, conds); }), otherwise: ow ? { do: ow.do == null ? null : String(ow.do), pick: PICKS[ow.pick] ? ow.pick : 'auto' } : null };
  }
  function condsWith(extra) {
    if (!extra || !extra.length) return CONDITIONS;
    var c = {}; for (var k in CONDITIONS) c[k] = CONDITIONS[k];
    for (var i = 0; i < extra.length; i++) { var e = extra[i]; if (e && e.id && typeof e.test === 'function') c[e.id] = e; }
    return c;
  }

  /* ---------- describing a rule (for plates, the editor and why-strings) ---------- */
  function condText(r, conds, resLabel) {
    var d = conds[r.if]; if (!d) return String(r.if);
    return String(d.label || r.if).replace('{n}', r.n != null ? r.n : '').replace('{tag}', r.tag || '?').replace('{res}', resLabel || 'MP');
  }
  function actionLabel(S, id) {
    if (id == null) return 'Wait';
    var a = findAction(S, id); return a ? String(a.label || a.id) : String(id);
  }
  function findAction(S, id) { var A = S.actions || []; for (var i = 0; i < A.length; i++) if (A[i] && A[i].id === id) return A[i]; return null; }
  function unitById(S, id) { for (var i = 0; i < S.units.length; i++) if (S.units[i].id === id) return S.units[i]; return null; }

  /* ---------- target resolution ---------- */
  function pickOrder(S, pool, pick, aimSide) {
    var self = selfOf(S), keyed = pool.map(function (id, i) { return { id: id, i: i, u: unitById(S, id) }; }).filter(function (e) { return e.u; });
    var how = pick === 'auto' ? (aimSide === 'ally' ? 'weakest' : 'lowest') : pick;
    var f = how === 'weakest' ? function (e) { return pctOf(e.u) * 10000 + e.u.hp; }
      : how === 'lowest' ? function (e) { return e.u.hp * 1000 + pctOf(e.u); }
      : how === 'toughest' ? function (e) { return -(e.u.hp * 1000 + pctOf(e.u)); }
      : how === 'nearest' ? function (e) { return e.u.dist == null ? 1e12 + e.i : e.u.dist; }
      : function (e) { return e.i; };
    keyed.sort(function (a, b) { var d = f(a) - f(b); return d || a.i - b.i; });
    if (self && how !== 'first') { /* stable, nothing else: self is never preferred unless it is the best by the measure */ }
    return keyed.map(function (e) { return e.id; });
  }
  function resolveTargets(S, act, c, pick) {
    var aim = act.aim || 'enemy', side = AIMS.hasOwnProperty(aim) ? AIMS[aim] : 'enemy';
    var valid = Array.isArray(act.targets) ? act.targets.filter(function (id) { var u = unitById(S, id); return u && u.alive; }) : null;
    if (aim === 'none') return { ids: [], note: '' };
    if (aim === 'self') return { ids: [S.self], note: '' };
    if (valid == null) valid = ids(alive(S, side));
    if (!valid.length) return { ids: null, note: 'no ' + (side === 'ally' ? 'ally' : 'foe') + ' in reach' };
    if (aim === 'allEnemies' || aim === 'allAllies') return { ids: valid, note: '' };
    var pool = valid;
    if (c && c.subjects && c.side === side) {
      pool = valid.filter(function (id) { return c.subjects.indexOf(id) >= 0; });
      if (!pool.length) return { ids: null, note: 'the ' + (side === 'ally' ? 'ally' : 'foe') + ' it names is out of reach' };
    }
    var order = pickOrder(S, pool, pick || 'auto', side);
    return { ids: order.length ? [order[0]] : null, note: order.length ? '' : 'no target' };
  }

  /* ---------- the evaluator (pure) ---------- */
  function tryAction(S, actId, c, pick) {
    var act = findAction(S, actId);
    if (!act) return { ok: false, note: actId == null ? 'no action set' : 'cannot ' + actId };
    if (act.usable === false) return { ok: false, note: act.reason ? String(act.reason) : (act.label || act.id) + ' not usable' };
    var tg = resolveTargets(S, act, c, pick);
    if (!tg.ids) return { ok: false, note: tg.note };
    return { ok: true, act: act, ids: tg.ids };
  }
  function targetText(S, tids, act) {
    if (!tids || !tids.length) return '';
    if (act && (act.aim === 'allEnemies' || act.aim === 'allAllies')) return act.aim === 'allEnemies' ? 'all foes' : 'all allies';
    if (tids.length === 1 && tids[0] === S.self) return 'self';
    return tids.map(function (id) { return nameOf(unitById(S, id)); }).join(', ');
  }
  function evaluate(set, S, opt) {
    opt = opt || {};
    var conds = condsWith(opt.conditions);
    var S0 = S || {}, kk; S = {}; for (kk in S0) S[kk] = S0[kk];
    S.units = Array.isArray(S0.units) ? S0.units : []; S.actions = Array.isArray(S0.actions) ? S0.actions.map(function (a) { if (!a || a.id == null) return a; var c = {}, q; for (q in a) c[q] = a[q]; c.id = String(a.id); return c; }) : [];
    var R = normSet(set, conds), trace = [], i, r, c, t;
    var me = selfOf(S), resLabel = S.resLabel || 'MP';
    function done(kind, idx, rule, act, tids, reason, condTxt) {
      var label = act ? String(act.label || act.id) : 'Wait', tt = targetText(S, tids, act);
      var head = kind === 'rule' ? 'Rule ' + (idx + 1) : kind === 'otherwise' ? 'Otherwise' : kind === 'fallback' ? 'Fallback' : 'No action';
      var d = {
        unit: S.self, action: act ? act.id : null, label: label, targets: tids || [], targetText: tt,
        kind: kind, rule: kind === 'rule' ? idx : -1, ruleText: condTxt || '', reason: reason || '',
        why: head + (condTxt ? ': ' + condTxt : '') + ' -> ' + label + (tt ? ' ' + tt : '') + (reason && kind === 'rule' ? ' (' + reason + ')' : reason && kind !== 'rule' ? ' (' + reason + ')' : ''),
        short: (kind === 'rule' ? 'R' + (idx + 1) : kind === 'otherwise' ? 'Else' : kind === 'fallback' ? 'Fallback' : 'Wait') + ': ' + label + (tt ? ' > ' + tt : ''),
        trace: trace, turn: S.turn == null ? null : S.turn, unitName: nameOf(me)
      };
      return d;
    }
    for (i = 0; i < R.rules.length; i++) {
      r = R.rules[i];
      var txt = condText(r, conds, resLabel);
      if (!r.on) { trace.push({ i: i, state: 'off', note: 'switched off', text: txt }); continue; }
      var def = conds[r.if];
      if (!def) { trace.push({ i: i, state: 'skip', note: 'unknown condition ' + r.if, text: txt }); continue; }
      try { c = def.test(S, r); } catch (e) { c = { ok: false, note: 'condition error' }; }
      if (c === true || c === false) c = { ok: c, note: c ? 'holds' : 'does not hold' };
      c = c || { ok: false, note: '' };
      if (!c.ok) { trace.push({ i: i, state: 'no', note: c.note || 'does not hold', text: txt }); continue; }
      t = tryAction(S, r.do, c, r.pick);
      if (!t.ok) { trace.push({ i: i, state: 'unusable', note: t.note, text: txt, cond: c.note }); continue; }
      trace.push({ i: i, state: 'fired', note: c.note, text: txt });
      return done('rule', i, r, t.act, t.ids, c.note, txt);
    }
    var owNote = '';
    if (R.otherwise && R.otherwise.do != null) {
      t = tryAction(S, R.otherwise.do, null, R.otherwise.pick); owNote = t.ok ? '' : t.note;
      if (t.ok) { trace.push({ i: -1, state: 'fired', note: 'no rule matched', text: 'Otherwise' }); return done('otherwise', -1, null, t.act, t.ids, R.rules.length ? 'no rule matched' : '', ''); }
      trace.push({ i: -1, state: 'unusable', note: t.note, text: 'Otherwise' });
    }
    var dflt = opt.otherwise != null ? String(opt.otherwise) : null;
    if (dflt != null && (!R.otherwise || R.otherwise.do !== dflt)) {
      t = tryAction(S, dflt, null, 'auto');
      if (t.ok) { trace.push({ i: -1, state: 'fired', note: 'default', text: 'Otherwise' }); return done('otherwise', -1, null, t.act, t.ids, 'no rule matched', ''); }
    }
    // fallback: the first usable action, offensive and moving ones first (attack, magic, aoe, move, or no role), then the rest
    for (var pass = 0; pass < 2; pass++) for (i = 0; i < S.actions.length; i++) {
      var a = S.actions[i]; if (!a || a.fallback === false) continue;
      var lead = !a.role || a.role === 'attack' || a.role === 'magic' || a.role === 'aoe' || a.role === 'move';
      if ((pass === 0) !== lead) continue;
      t = tryAction(S, a.id, null, 'auto');
      if (t.ok) { trace.push({ i: -1, state: 'fired', note: 'first usable action', text: 'Fallback' }); return done('fallback', -1, null, t.act, t.ids, owNote || 'nothing else usable', ''); }
    }
    return done('none', -1, null, null, [], 'nothing usable', '');
  }

  /* ---------- presets ---------- */
  function resolvePreset(p, actions, tags) {
    // actions: [{id, role}] the unit can use. Role-based rules take the unit's first action with that role; rules whose role
    // the unit lacks are dropped. Tags written '@armoured' resolve to the game's tag with that name, or its first tag.
    if (!p) return { rules: [], otherwise: null };
    actions = actions || [];
    function byRole(role) { for (var i = 0; i < actions.length; i++) if (actions[i] && actions[i].role === role) return actions[i].id; return null; }
    function tagOf(t) {
      if (t == null || String(t).charAt(0) !== '@') return t;
      var want = String(t).slice(1).toLowerCase(), list = tags || [];
      for (var i = 0; i < list.length; i++) if (String(list[i]).toLowerCase() === want) return list[i];
      return null;
    }
    var rules = [];
    (p.rules || []).forEach(function (r) {
      var id = r.do != null ? r.do : byRole(r.role); if (id == null) return;
      var o = { on: r.on !== false, if: r.if || 'always', do: id, pick: r.pick || 'auto' };
      if (r.n != null) o.n = r.n;
      if (r.tag != null) { var tg = tagOf(r.tag); if (tg == null) return; o.tag = tg; }
      rules.push(o);
    });
    var ow = p.otherwise || {}, oid = ow.do != null ? ow.do : byRole(ow.role || 'attack');
    if (oid == null) oid = byRole('magic');
    if (oid == null && actions.length) oid = actions[0].id;
    return { rules: rules, otherwise: oid == null ? null : { do: oid, pick: ow.pick || 'auto' } };
  }

  /* ---------- reading a host value: 'prop', 'a.b', a function, or a constant ---------- */
  function getter(spec, fallbackKey) {
    if (typeof spec === 'function') return spec;
    var path = spec == null ? fallbackKey : spec;
    if (path == null) return function () { return undefined; };
    var parts = String(path).split('.');
    return function (u) { var v = u; for (var i = 0; i < parts.length && v != null; i++) v = v[parts[i]]; return v; };
  }

  /* ======================================================================================================================
   *  bitmap fonts for crisp (native pixel) drawing: key char + one base-32 digit per row (shared with the C-14 module)
   * ==================================================================================================================== */
  var F5S = "0ehjlphe14c4444e2eh1248v3v2421he426aiv225vgu11he668guhhe7v1248888ehhehhe9ehhf12cAehhvhhhBuhhuhhuCehgggheDuhhhhhuEvgguggvFvggugggGehgnhhfHhhhvhhhIe44444eJ72222icKhikokihLggggggvMhrllhhhNhhpljhhOehhhhhePuhhugggQehhhlidRuhhukihSfgge11uTv444444UhhhhhheVhhhhha4WhhhlllaXhha4ahhYhha4444Zv1248gv!4444404?eh12404.0000004,0000048:0040040'4480000-000e000+044v440/11248gg(2488842)8422248%op248j3&cik8lid#aavavaa\u00d70ha4ah0\"aa00000*04lel40=00v0v00<248g842>8421248\u2192042v240\u00b70004000\u21914el4444\u21934444le4\u2190048v840";
  var F3S = "075557126227261247361216455711574616634757771222875757975716A25755B65656C34443D65556E74647F74644G34553H55755I72227J11152K55655L44447M57755N65555O25552P65644Q25563R65655S34216T72222U55557V55552W55775X55255Y55222Z71247!22202.00002-00700+02720/11244:02020'22000\u00d705250?61202(24442)21112,00024%51245#57575&25253=07070\"55000*05250<12421>42124\u219221712\u00b700200\u219127222\u219322272\u219024742";
  function decodeFont(s, rows, cols) {
    var out = {}, i, r;
    for (i = 0; i + rows < s.length + 1; i += rows + 1) {
      var g = [], lo = cols, hi = -1;
      for (r = 0; r < rows; r++) { var v = parseInt(s.charAt(i + 1 + r), 32) || 0; g.push(v); for (var c = 0; c < cols; c++) if (v & (1 << (cols - 1 - c))) { if (c < lo) lo = c; if (c > hi) hi = c; } }
      out[s.charAt(i)] = { rows: g, lo: hi < 0 ? 0 : lo, w: hi < 0 ? 2 : hi - lo + 1 };
    }
    return out;
  }
  var FONTS = null;
  function fonts() { if (!FONTS) FONTS = { big: { g: decodeFont(F5S, 7, 5), h: 7, cols: 5, space: 3 }, small: { g: decodeFont(F3S, 5, 3), h: 5, cols: 3, space: 2 } }; return FONTS; }
  var FAMILY = '"Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  var THEMES = {
    dusk:  { top: 'rgba(36,32,54,0.95)', bot: 'rgba(20,17,31,0.96)', edge: 'rgba(255,255,255,0.12)', rim: 'rgba(0,0,0,0.6)', text: '#f3efff', dim: '#a7a0c2', faint: '#6f6890',
             accent: '#ffc857', fired: '#5fe0b0', off: '#5e5878', bad: '#ff7a68', lead: '#8fb8ff', row: 'rgba(255,255,255,0.07)', sel: 'rgba(255,200,87,0.16)', shadow: 'rgba(4,2,12,0.6)',
             px: { fill: '#1d1930', fill2: '#141124', edge: '#e9e2ff', ink: '#07060c', band: '#2c2646', sel: '#4a3a1a', hi: '#3a3358' } },
    slate: { top: 'rgba(28,38,48,0.95)', bot: 'rgba(16,22,30,0.96)', edge: 'rgba(255,255,255,0.12)', rim: 'rgba(0,0,0,0.6)', text: '#eef6ff', dim: '#97abc0', faint: '#5d7084',
             accent: '#7ccbff', fired: '#8ff0a4', off: '#566676', bad: '#ff8a7a', lead: '#c3a8ff', row: 'rgba(255,255,255,0.06)', sel: 'rgba(124,203,255,0.16)', shadow: 'rgba(0,6,14,0.6)',
             px: { fill: '#18222e', fill2: '#111821', edge: '#dcecff', ink: '#05080c', band: '#24323f', sel: '#1d3e58', hi: '#2c3c4c' } }
  };

  /* ======================================================================================================================
   *  instance
   * ==================================================================================================================== */
  function create(o) {
    o = o || {};
    var P = {}, k; for (k in DEFAULTS) P[k] = DEFAULTS[k]; if (o.params) for (k in o.params) if (o.params[k] != null) P[k] = o.params[k];
    var WARN = {};
    var conds = condsWith(o.conditions);
    var F = o.fields || {};
    var gId = getter(F.id, 'id'), gName = getter(F.name, 'name'), gHp = getter(F.hp, 'hp'), gMax = getter(F.maxHp, 'maxHp'),
        gRes = getter(F.res, 'mp'), gMaxRes = getter(F.maxRes, 'maxMp'), gTags = getter(F.tags, 'tags'), gRow = F.row != null ? getter(F.row) : null,
        gCls = getter(F.cls != null ? F.cls : o.classOf, 'cls'), gKey = F.key != null ? getter(F.key) : null, gExtra = F.extra != null ? getter(F.extra) : null,
        gSide = getter(F.side, 'side');
    function call(fn, args, d, tag) {
      if (typeof fn !== 'function') return d;
      try { var v = fn.apply(null, args); return v === undefined ? d : v; } catch (e) { warnOnce(WARN, tag, tag + ' threw', e); return d; }
    }
    function uid(u) { if (u == null) return null; if (typeof u !== 'object') return u; var v = call(gId, [u], null, 'fields.id'); return v == null ? null : v; }
    function keyOf(u) { if (u == null) return null; if (typeof u !== 'object') return String(u); var v = gKey ? call(gKey, [u], null, 'fields.key') : uid(u); return v == null ? null : String(v); }
    function clsOf(u) { var c = call(gCls, [u], null, 'fields.cls'); return c == null ? null : String(c); }
    var ACTIONS = o.actions;
    function allActions(u) { var a = typeof ACTIONS === 'function' ? call(ACTIONS, [u], [], 'actions') : ACTIONS; return Array.isArray(a) ? a.filter(function (x) { return x && x.id != null; }) : []; }
    function actionsFor(u) {
      var all = allActions(u), ids0 = typeof o.actionsOf === 'function' ? call(o.actionsOf, [u], null, 'actionsOf') : null;
      if (!Array.isArray(ids0)) return all;
      var out = []; ids0.forEach(function (id) { for (var i = 0; i < all.length; i++) if (String(all[i].id) === String(id)) { out.push(all[i]); return; } }); return out;
    }
    var TAGS = Array.isArray(o.tags) ? o.tags.slice() : [];
    function listOf(fn, u, tag) { var l = call(fn, [u], [], tag); return Array.isArray(l) ? l.filter(function (x) { return x != null; }) : []; }
    function alliesOf(u) {
      if (typeof o.allies === 'function') return listOf(o.allies, u, 'allies');
      if (typeof o.units === 'function') { var s = call(gSide, [u]); return listOf(o.units, u, 'units').filter(function (v) { return call(gSide, [v]) === s; }); }
      return [u];
    }
    function enemiesOf(u) {
      if (typeof o.enemies === 'function') return listOf(o.enemies, u, 'enemies');
      if (typeof o.units === 'function') { var s = call(gSide, [u]); return listOf(o.units, u, 'units').filter(function (v) { return call(gSide, [v]) !== s; }); }
      return [];
    }
    function unitRec(v, side, self) {
      var hp = num(call(gHp, [v], 0, 'fields.hp'), 0), mx = num(call(gMax, [v], hp, 'fields.maxHp'), hp);
      var tg = call(gTags, [v], [], 'fields.tags'); tg = Array.isArray(tg) ? tg.map(String) : typeof tg === 'string' && tg ? [tg] : [];
      var row = gRow ? call(gRow, [v], null, 'fields.row') : null;
      if (row != null) { row = String(row).toLowerCase(); if (row === 'front' || row === 'back') tg.push(row + ' row'); }
      var rec = { id: uid(v), name: String(call(gName, [v], uid(v), 'fields.name')), side: side, hp: hp, maxHp: mx, res: num(call(gRes, [v], 0, 'fields.res'), 0),
        maxRes: num(call(gMaxRes, [v], 0, 'fields.maxRes'), 0), tags: tg, row: row, alive: hp > 0, dist: null };
      if (typeof o.distance === 'function' && self && v !== self) { var d = call(o.distance, [self, v], null, 'distance'); rec.dist = d == null || !isFinite(+d) ? null : +d; }
      else if (v === self) rec.dist = 0;
      if (gExtra) { var ex = call(gExtra, [v], null, 'fields.extra'); if (ex && typeof ex === 'object') rec.extra = ex; }
      return rec;
    }
    function turnNow(u) { var t = typeof o.turn === 'function' ? call(o.turn, [u], null, 'turn') : o.turn; return t == null ? null : num(t, null); }
    // the plain snapshot evaluate() reads; byId maps ids back to the game's own objects
    function snapshot(u) {
      var units = [], byId = {}, seen = {};
      function add(v, side) { if (v == null) return; var r = unitRec(v, side, u); if (r.id == null || seen[r.id]) return; seen[r.id] = 1; byId[r.id] = v; units.push(r); }
      add(u, 'ally');
      alliesOf(u).forEach(function (v) { if (v !== u) add(v, 'ally'); });
      enemiesOf(u).forEach(function (v) { add(v, 'enemy'); });
      var acts = actionsFor(u).map(function (a) {
        var can = typeof o.canUse === 'function' ? call(o.canUse, [u, a.id], true, 'canUse') : true;
        var rec = { id: String(a.id), label: a.label != null ? String(a.label) : String(a.id), aim: a.aim || 'enemy', role: a.role || null, usable: can === true || (can !== false && typeof can !== 'string' && !!can), reason: typeof can === 'string' ? can : '' };
        if (a.fallback === false) rec.fallback = false;
        if (typeof o.targets === 'function' && rec.aim !== 'self' && rec.aim !== 'none') {
          var tl = call(o.targets, [u, a.id], null, 'targets');
          if (Array.isArray(tl)) rec.targets = tl.map(function (v) { if (v != null && typeof v === 'object') { add(v, AIMS[rec.aim] === 'ally' ? 'ally' : 'enemy'); return uid(v); } return v; }).filter(function (x) { return x != null; });
        }
        return rec;
      });
      return { snap: { self: uid(u), turn: turnNow(u), resLabel: o.resLabel || 'MP', units: units, actions: acts }, byId: byId };
    }

    /* ----- the rule book: one set per unit key; first use falls back to the class preset, then to `otherwise` ----- */
    var book = {}, userPresets = o.presets && typeof o.presets === 'object' ? o.presets : {};
    function presetNames() { var n = []; for (var k2 in userPresets) n.push(k2); PRESET_ORDER.forEach(function (p) { if (n.indexOf(p) < 0) n.push(p); }); return n; }
    function presetLabel(name) { var p = userPresets[name] || PRESETS[name]; return p && p.label ? p.label : String(name); }
    function presetSet(name, u) {
      var p = userPresets[name] || PRESETS[name]; if (!p) return null;
      return normSet(resolvePreset(p, actionsFor(u).map(function (a) { return { id: a.id, role: a.role }; }), TAGS), conds);
    }
    function classPreset(u) {
      var c = clsOf(u); if (c == null) return null;
      var map = o.classPresets || {}; var name = map[c] || c;
      return userPresets[name] || PRESETS[name] ? name : null;
    }
    if (o.rules && typeof o.rules === 'object') for (k in o.rules) book[k] = normSet(o.rules[k], conds);
    function setFor(u) {
      var key = keyOf(u); if (key == null) return normSet({ rules: [] }, conds);
      if (!book[key]) {
        var pn = classPreset(u), s = pn ? presetSet(pn, u) : null;
        book[key] = s || normSet({ rules: [], otherwise: defaultOtherwise(u) }, conds);
        if (pn) book[key].preset = pn;
      }
      return book[key];
    }
    function defaultOtherwise(u) {
      var d = typeof o.otherwise === 'function' ? call(o.otherwise, [u], null, 'otherwise') : o.otherwise;
      if (d != null) return { do: String(d), pick: 'auto' };
      var a = actionsFor(u); for (var i = 0; i < a.length; i++) if (a[i].role === 'attack') return { do: String(a[i].id), pick: 'auto' };
      return a.length ? { do: String(a[0].id), pick: 'auto' } : null;
    }
    function changed(u, why) {
      var key = keyOf(u); stats.edits++;
      emit({ event: 'change', key: key, why: why });
      if (typeof o.onChange === 'function') call(o.onChange, [key, copy(book[key]), u], null, 'onChange');
    }

    /* ----- stats, debug ----- */
    var stats = { decisions: 0, byRule: 0, byOtherwise: 0, byFallback: 0, none: 0, edits: 0, opens: 0, whys: 0 };
    function emit(e) { if (typeof o.debug === 'function') { try { o.debug(e); } catch (x) { } } }

    /* ----- clock, why plates ----- */
    var T = 0, whys = [], drawnRects = [], lastByUnit = {};
    function B() {
      var b = typeof o.bounds === 'function' ? call(o.bounds, [], null, 'bounds') : o.bounds || o.view;
      if (!b || !(b.w > 0) || !(b.h > 0)) { if (lastCanvas) return { x: 0, y: 0, w: lastCanvas.w, h: lastCanvas.h }; return { x: 0, y: 0, w: 256, h: 224 }; }
      return { x: num(b.x, 0), y: num(b.y, 0), w: +b.w, h: +b.h };
    }
    var lastCanvas = null;
    function crisp() { return P.render === 'crisp' || (P.render !== 'smooth' && B().w <= 512); }
    function TH() {
      if (P.theme === 'skin' && SK) {
        var tk = function (p, d) { try { var v = SK.token(p); return typeof v === 'string' && v.charAt(0) === '#' ? v : d; } catch (e) { return d; } };
        var base = THEMES.dusk, f = tk('ui.fill', base.px.fill), f2 = tk('ui.fillTo', f), ed = tk('ui.edge', base.px.edge);
        return { top: rgba(f, 0.95), bot: rgba(f2, 0.96), edge: rgba(tk('ui.highlight', '#ffffff'), 0.2), rim: rgba(tk('ink', '#000000'), 0.7), text: tk('text.main', base.text), dim: tk('text.dim', base.dim),
          faint: base.faint, accent: tk('text.accent', base.accent), fired: tk('fx.heal', base.fired), off: base.off, bad: tk('fx.hot', base.bad), lead: tk('fx.cold', base.lead), row: base.row, sel: rgba(tk('text.accent', base.accent), 0.18), shadow: base.shadow,
          px: { fill: f, fill2: f2, edge: ed, ink: tk('ink', '#07060c'), band: tk('ui.well', base.px.band), sel: tk('ui.select', base.px.sel), hi: tk('ui.highlight', base.px.hi) } };
      }
      return THEMES[P.theme] || THEMES.dusk;
    }
    var SK = null;
    try { SK = o.skin === false || !root.GameDNA_Skin ? null : root.GameDNA_Skin.resolve(o.skin); } catch (e) { SK = null; }

    function anchorOf(u) {
      var a = typeof o.getAnchor === 'function' ? call(o.getAnchor, [u, uid(u)], null, 'getAnchor') : null;
      if (!a) return null;
      var x = num(a.x, NaN), y = num(a.y != null ? a.y : a.top, NaN); if (!isFinite(x) || !isFinite(y)) return null;
      var w = num(a.w, 0), h = num(a.h, 0);
      if (a.top != null && a.y == null) return { x: x - w / 2, y: y, w: w, h: h, cx: x };   // {x: centre, top}
      return { x: x, y: y, w: w, h: h, cx: x + w / 2 };
    }
    function rectsFrom(fn, tag) { var r = typeof fn === 'function' ? call(fn, [], [], tag) : fn; return Array.isArray(r) ? r.filter(function (q) { return q && q.w > 0 && q.h > 0; }) : []; }

    function decide(u, opt) {
      opt = opt || {};
      try {
        var sb = snapshot(u), set = setFor(u);
        var d = evaluate(set, sb.snap, { conditions: o.conditions, otherwise: null });
        d.targetUnits = d.targets.map(function (id) { return sb.byId[id]; }).filter(function (x) { return x != null; });
        d.target = d.targetUnits[0] || null;
        d.key = keyOf(u);
        stats.decisions++; if (d.kind === 'rule') stats.byRule++; else if (d.kind === 'otherwise') stats.byOtherwise++; else if (d.kind === 'fallback') stats.byFallback++; else stats.none++;
        lastByUnit[String(d.unit)] = d;
        emit({ event: 'decide', unit: d.unit, key: d.key, action: d.action, targets: d.targets.slice(), kind: d.kind, rule: d.rule, why: d.why, snapshot: sb.snap, set: copy(set) });
        if (opt.show !== false && P.why !== 'off') showWhy(u, d);
        return d;
      } catch (e) {
        warnOnce(WARN, 'decide', 'decide failed', e);
        return { unit: uid(u), action: null, label: 'Wait', targets: [], targetUnits: [], target: null, kind: 'none', rule: -1, why: 'error', short: 'Wait', trace: [], reason: 'error' };
      }
    }
    function showWhy(u, d) {
      var id = String(uid(u));
      whys = whys.filter(function (w) { return w.id !== id; });
      whys.forEach(function (w) { w.life = Math.min(w.life, T - w.born + 200); });   // the previous actor's plate fades out
      var w = { id: id, unit: u, d: d, born: T, life: Math.max(400, num(P.whyMs, 1800)), anchor: null, x: null, y: null, L: null };
      w.anchor = anchorOf(u);
      whys.push(w); stats.whys++;
      while (whys.length > 3) whys.shift();
      placeAll();
    }

    /* ----- placement of the why plates: beside the actor, never over UI, other units or other plates ----- */
    function overlap(a, b, pad) { pad = pad || 0; var x = Math.max(0, Math.min(a.x + a.w, b.x + b.w + pad) - Math.max(a.x, b.x - pad)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h + pad) - Math.max(a.y, b.y - pad)); return x * y; }
    function placeAll() {
      var b = B(), m = Math.max(2, Math.round(b.w * 0.012)), ui = rectsFrom(o.uiRects, 'uiRects'), obs = rectsFrom(o.getObstacles, 'getObstacles'), placed = [];
      for (var i = 0; i < whys.length; i++) {
        var w = whys[i], L = plateLayout(w.d), A = w.anchor;
        var a2 = anchorOf(w.unit); if (a2) A = w.anchor = a2;
        if (!A) { w.x = null; continue; }
        if (w.x != null && !w.hidden && w.lastA && Math.abs(w.lastA.cx - A.cx) < 3 && Math.abs(w.lastA.y - A.y) < 3 && w.L && w.L.w === L.w) {
          // keep the spot unless something now covers it
          var cur = { x: w.x, y: w.y, w: L.w, h: L.h }, bad = false;
          for (var q = 0; q < ui.length && !bad; q++) if (overlap(cur, ui[q], 0) > 0) bad = true;
          for (q = 0; q < placed.length && !bad; q++) if (overlap(cur, placed[q], 1) > 0) bad = true;
          for (q = 0; q < obs.length && !bad; q++) if (!(obs[q].id != null && String(obs[q].id) === w.id) && overlap(cur, obs[q], 0) > 24) bad = true;
          if (!bad) { placed.push(cur); continue; }
        }
        var gap = crisp() ? 3 : Math.round(b.w * 0.008) + 3, cx = A.cx, top = A.y, bot = A.y + A.h, left = A.x, right = A.x + A.w, cy = A.y + A.h / 2;
        var cands = [
          { x: cx - L.w / 2, y: top - gap - L.h, tail: 'down' }, { x: right - L.w + gap, y: top - gap - L.h, tail: 'down' }, { x: left - gap, y: top - gap - L.h, tail: 'down' },
          { x: cx - L.w / 2, y: bot + gap, tail: 'up' }, { x: right - L.w + gap, y: bot + gap, tail: 'up' }, { x: left - gap, y: bot + gap, tail: 'up' },
          { x: left - gap - L.w, y: cy - L.h / 2, tail: 'right' }, { x: right + gap, y: cy - L.h / 2, tail: 'left' },
          { x: left - gap - L.w, y: top - L.h, tail: 'right' }, { x: right + gap, y: top - L.h, tail: 'left' },
          { x: left - gap - L.w, y: bot, tail: 'right' }, { x: right + gap, y: bot, tail: 'left' }
        ];
        // beside the actor first; when every spot there covers something, a docked spot anywhere on screen (scanned top-down),
        // joined to the actor by a dotted leader line. A spot that still covers UI hides the plate.
        var step = crisp() ? 4 : Math.max(4, Math.round(b.h / 60)), near = cands.length;
        for (var sy = b.y + m; sy <= b.y + b.h - m - L.h; sy += step) {
          cands.push({ x: cx - L.w / 2, y: sy, tail: 'lead' }); cands.push({ x: left - L.w - gap, y: sy, tail: 'lead' }); cands.push({ x: right + gap, y: sy, tail: 'lead' });
        }
        var best = null;
        for (var c = 0; c < cands.length; c++) {
          var r = cands[c], x = Math.round(clamp(r.x, b.x + m, b.x + b.w - m - L.w)), y = Math.round(clamp(r.y, b.y + m, b.y + b.h - m - L.h)), R = { x: x, y: y, w: L.w, h: L.h };
          var s = c < near ? (Math.abs(x - r.x) + Math.abs(y - r.y)) * 2 + c * 2 : 60 + Math.abs(y + L.h / 2 - cy) * 1.5 + Math.abs(x + L.w / 2 - cx) * 0.5, uiHit = 0;
          for (q = 0; q < ui.length; q++) { var o1 = overlap(R, ui[q], 1); uiHit += o1; s += o1 * 40; }
          for (q = 0; q < obs.length; q++) { var ob = obs[q]; if (ob.id != null && String(ob.id) === w.id) continue; var o2 = overlap(R, ob, 1); if (ob.id == null) uiHit += o2; s += o2 * (ob.id == null ? 40 : 14); }
          for (q = 0; q < placed.length; q++) s += overlap(R, placed[q], 2) * 30;
          s += overlap(R, { x: A.x, y: A.y, w: A.w, h: A.h }, 1) * 20;
          if (!best || s < best.s) best = { s: s, x: x, y: y, tail: r.tail, ui: uiHit };
          if (c < near && s < 12) break;
        }
        w.x = best.x; w.y = best.y; w.tail = best.tail; w.L = L; w.lastA = { cx: A.cx, y: A.y }; w.hidden = best.ui > 0;
        {   // a tail only when the plate really sits next to its actor; otherwise a dotted leader line
          var ddx = Math.max(0, Math.max(left - (w.x + L.w), w.x - right)), ddy = Math.max(0, Math.max(top - (w.y + L.h), w.y - bot));
          var hOver = w.x < right - 2 && w.x + L.w > left + 2, vOver = w.y < bot - 2 && w.y + L.h > top + 2;
          if (hOver && ddy <= gap + 2) w.tail = w.y + L.h <= top + 1 ? 'down' : 'up';
          else if (vOver && ddx <= gap + 2) w.tail = w.x + L.w <= left + 1 ? 'right' : 'left';
          else w.tail = 'lead';
        }
        placed.push({ x: w.x, y: w.y, w: L.w, h: L.h });
      }
    }

    /* ----- text + measure (crisp bitmap or smooth canvas) ----- */
    var meas = null, MC = {};
    function mk(w, h) { var c = (root.document && root.document.createElement) ? root.document.createElement('canvas') : null; if (c) { c.width = w; c.height = h; } return c; }
    function mctx() { if (!meas) { var c = mk(4, 4); meas = c ? c.getContext('2d') : null; } return meas; }
    function SC() { return +P.size > 0 ? clamp(Math.round(+P.size / 7), 1, 4) : clamp(Math.floor(B().w / 300) + 1, 1, 4); }
    var curS = 0, cssK = 0, cssN = 0;   // curS: the size the editor or a plate is laid out at; cssK: CSS px per logical px
    function SZ() { return curS > 0 ? curS : +P.size > 0 ? clamp(+P.size, 8, 28) : clamp(Math.round(B().w / 54), 9, 20); }
    function plateS() { var b0 = +P.size > 0 ? clamp(+P.size, 8, 28) : clamp(Math.round(B().w / 54), 9, 20); if (+P.minCssPx > 0 && cssK > 0) b0 = Math.max(b0, Math.ceil(+P.minCssPx * 0.92 / cssK)); return Math.min(b0, 40); }
    function readCss(g) {
      if (typeof o.cssScale === 'number' && o.cssScale > 0) { cssK = o.cssScale; return; }
      if (typeof o.cssScale === 'function') { var v = call(o.cssScale, [], 0, 'cssScale'); if (v > 0) { cssK = +v; return; } }
      if (cssK > 0 && (cssN++ % 30)) return;
      try { var cv = g.canvas, r = cv && cv.getBoundingClientRect ? cv.getBoundingClientRect() : null, lw = cv ? cv.width / scaleOf(g) : 0; if (r && r.width > 0 && lw > 0) cssK = r.width / lw; } catch (e) { }
    }
    function css(px, weight) { return weight + ' ' + px + 'px ' + FAMILY; }
    function bw(str, font, sc) {
      var Fn = fonts()[font], w = 0, s = String(str).toUpperCase();
      for (var i = 0; i < s.length; i++) { var ch = s.charAt(i), gl = Fn.g[ch]; w += (ch === ' ' ? Fn.space : gl ? gl.w : Fn.space) + 1; }
      return Math.max(0, w - 1) * sc;
    }
    function tw(str, px, weight) {
      var key = str + '|' + px + '|' + weight; if (MC[key] != null) return MC[key];
      var g = mctx(); if (!g) return str.length * px * 0.55; g.font = css(px, weight);
      var w = g.measureText(str).width; if (Object.keys(MC).length > 1200) MC = {}; return (MC[key] = w);
    }
    // text styles: 'big' (rows, titles), 'small' (labels, help); crisp: 5x7 / 3x5 bitmap at scale sc; smooth: px sizes
    function TS(style) {
      if (crisp()) { var sc = SC(); return style === 'small' ? { crisp: true, font: 'small', sc: sc, h: 5 * sc } : { crisp: true, font: 'big', sc: sc, h: 7 * sc }; }
      var S = SZ(); return style === 'small' ? { crisp: false, px: Math.max(8, Math.round(S * 0.78)), weight: 600, h: Math.round(S * 0.78) } : style === 'bold' ? { crisp: false, px: S, weight: 700, h: S } : { crisp: false, px: S, weight: 500, h: S };
    }
    function disp(str, st) { str = String(str == null ? '' : str); return st && st.crisp ? str : str.replace(/<=/g, '\u2264').replace(/>=/g, '\u2265'); }
    function mw(str, st) { str = disp(str, st); return st.crisp ? bw(str, st.font, st.sc) : tw(str, st.px, st.weight); }
    function fitT(str, maxW, st) {
      str = disp(str, st); if (st.crisp) str = str.toUpperCase();
      if (mw(str, st) <= maxW) return str;
      var ell = st.crisp ? '..' : '\u2026', s = str;
      while (s.length > 1 && mw(s + ell, st) > maxW) s = s.slice(0, -1);
      return s.replace(/\s+$/, '') + ell;
    }
    function dtext(g, str, x, y, st, col) {
      str = disp(str, st);
      if (st.crisp) {
        var Fn = fonts()[st.font], s = str.toUpperCase(), sc = st.sc; g.fillStyle = col; x = Math.round(x); y = Math.round(y);
        for (var i = 0; i < s.length; i++) {
          var ch = s.charAt(i), gl = Fn.g[ch];
          if (ch === ' ' || !gl) { x += (Fn.space + 1) * sc; continue; }
          for (var r = 0; r < Fn.h; r++) { var bits = gl.rows[r]; for (var c = gl.lo; c < gl.lo + gl.w; c++) if (bits & (1 << (Fn.cols - 1 - c))) g.fillRect(x + (c - gl.lo) * sc, y + r * sc, sc, sc); }
          x += (gl.w + 1) * sc;
        }
        return;
      }
      g.font = css(st.px, st.weight); g.textBaseline = 'top'; g.textAlign = 'left'; g.fillStyle = col; g.fillText(str, x, y - st.px * 0.06);
    }
    function rgba(hex, a) {
      hex = String(hex || '#000000');
      if (hex.charAt(0) !== '#') return hex;
      var h = hex.length === 4 ? '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3] : hex, n = parseInt(h.slice(1, 7), 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    function scaleOf(g) { try { var m = g.getTransform(); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; } catch (e) { return 1; } }
    function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
    function ease(u) { u = clamp(u, 0, 1); return 1 - Math.pow(1 - u, 3); }
    function backOut(u) { u = clamp(u, 0, 1); var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }

    /* ----- why plate: [chip] condition line / action line ----- */
    function chipText(d) { return d.kind === 'rule' ? 'R' + (d.rule + 1) : d.kind === 'otherwise' ? 'ELSE' : d.kind === 'fallback' ? 'AUTO' : '--'; }
    function chipCol(d, th) { return d.kind === 'rule' ? th.accent : d.kind === 'otherwise' ? th.dim : d.kind === 'fallback' ? th.lead : th.bad; }
    function plateLayout(d) {
      curS = crisp() ? 0 : plateS();
      try { return plateLayout0(d); } finally { curS = 0; }
    }
    function plateLayout0(d) {
      var b = B(), cr = crisp(), big = TS('bold'), small = TS('small'), th = TH();
      var who = d.unitName || '';
      var line1 = d.kind === 'rule' ? (who ? who + '  \u00b7  ' : '') + d.ruleText + (d.reason ? '  \u00b7  ' + d.reason : '') : (who ? who + '  \u00b7  ' : '') + (d.kind === 'otherwise' ? 'no rule matched' : d.reason || 'nothing usable');
      if (d.kind === 'fallback') line1 = (who ? who + '  \u00b7  ' : '') + 'Otherwise: ' + (d.reason || 'not usable');
      var line2 = d.label + (d.targetText ? '  \u2192  ' + d.targetText : '');
      var maxW = Math.round(b.w * (cr ? 0.62 : 0.4));
      if (cr) {
        var sc = SC(), pad = 3 * sc, chip = bw(chipText(d), 'small', sc) + 4 * sc, inner = maxW - pad * 2 - chip - 3 * sc;
        var c1 = (who ? who + ' \u00b7 ' : '') + (d.kind === 'rule' ? d.ruleText : d.kind === 'otherwise' ? 'no rule matched' : d.kind === 'fallback' ? (d.reason || 'nothing else usable') : 'nothing usable');
        var l1 = fitT(c1, inner, small), l2 = fitT(line2, inner, big);
        var cw = Math.max(bw(l1, 'small', sc), bw(l2, 'big', sc));
        return { crisp: true, sc: sc, pad: pad, chip: chip, l1: l1, l2: l2, w: pad * 2 + chip + 3 * sc + cw, h: pad * 2 + 5 * sc + 2 * sc + 7 * sc, th: th };
      }
      var S = SZ(), padS = Math.round(S * 0.6), chipW = Math.round(tw(chipText(d), Math.round(S * 0.72), 800) + S * 0.9), gapS = Math.round(S * 0.55), innerS = maxW - padS * 2 - chipW - gapS;
      var m1 = fitT(line1, innerS, small), m2 = fitT(line2, innerS, big);
      var cwS = Math.max(mw(m1, small), mw(m2, big));
      return { crisp: false, S: S, pad: padS, chip: chipW, gap: gapS, l1: m1, l2: m2, w: Math.round(padS * 2 + chipW + gapS + cwS), h: Math.round(padS * 2 + small.h + S * 0.35 + big.h), th: th };
    }
    function drawPlate(g, w) {
      if (w.x == null || !w.L || w.hidden) return;
      curS = w.L.crisp ? 0 : w.L.S;
      try { drawPlate0(g, w); } finally { curS = 0; }
    }
    function drawPlate0(g, w) {
      var L = w.L, th = L.th, age = T - w.born, life = w.life, a, inA = clamp(age / 160, 0, 1), outA = clamp((life - age) / 260, 0, 1);
      a = Math.min(inA, outA); if (a <= 0.01) return;
      var x = w.x, y = w.y, d = w.d;
      var A = w.anchor;
      if (L.crisp) {
        var sc = L.sc; if (a < 0.5) return;   // stepped fade on pixel canvases
        var dy = inA < 1 ? Math.round((1 - inA) * 3) * sc : 0; y += dy;
        g.fillStyle = th.px.ink; g.fillRect(x, y + sc, L.w, L.h - 2 * sc); g.fillRect(x + sc, y, L.w - 2 * sc, L.h);
        g.fillStyle = th.px.fill; g.fillRect(x + sc, y + sc, L.w - 2 * sc, L.h - 2 * sc);
        g.fillStyle = th.px.hi; g.fillRect(x + 2 * sc, y + sc, L.w - 4 * sc, sc);
        // tail toward the actor (or a dotted leader line from a docked spot)
        if (w.tail === 'lead') drawLead(g, w, x, y, L, th, true); else drawTailCrisp(g, w, x, y, L, th, sc);
        var chipC = chipCol(d, th), ch = L.h - 2 * L.pad + 2 * sc;
        g.fillStyle = chipC; g.fillRect(x + L.pad - sc, y + L.pad - sc, L.chip, ch);
        dtext(g, chipText(d), x + L.pad + sc, y + Math.round((L.h - 5 * sc) / 2), { crisp: true, font: 'small', sc: sc }, th.px.ink);
        var tx = x + L.pad + L.chip + 2 * sc;
        dtext(g, L.l1, tx, y + L.pad, { crisp: true, font: 'small', sc: sc }, th.dim);
        dtext(g, L.l2, tx, y + L.pad + 7 * sc, { crisp: true, font: 'big', sc: sc }, th.text);
        drawnRects.push({ kind: 'why', id: w.id, x: x, y: y, w: L.w, h: L.h, rule: d.rule, action: d.action });
        return;
      }
      var S = L.S, k = scaleOf(g), pop = 0.92 + 0.08 * backOut(inA), cx0 = x + L.w / 2, cy0 = y + L.h / 2;
      g.save(); g.globalAlpha *= a;
      g.translate(cx0, cy0 + (1 - ease(inA)) * S * 0.4); g.scale(pop, pop); g.translate(-cx0, -cy0);
      var r = Math.round(S * 0.5);
      g.shadowColor = th.shadow; g.shadowBlur = S * 0.9 * k; g.shadowOffsetY = S * 0.18 * k;
      rr(g, x, y, L.w, L.h, r); var gr = g.createLinearGradient(0, y, 0, y + L.h); gr.addColorStop(0, th.top); gr.addColorStop(1, th.bot); g.fillStyle = gr; g.fill();
      g.shadowColor = 'rgba(0,0,0,0)'; g.shadowBlur = 0; g.shadowOffsetY = 0;
      if (w.tail === 'lead') drawLead(g, w, x, y, L, th, false); else drawTailSmooth(g, w, x, y, L, th, gr);
      g.lineWidth = 1 / k; rr(g, x + 0.5 / k, y + 0.5 / k, L.w - 1 / k, L.h - 1 / k, r); g.strokeStyle = rgba(chipCol(d, th), 0.55); g.stroke();
      var chipC2 = chipCol(d, th), chH = L.h - L.pad * 1.2;
      rr(g, x + L.pad * 0.6, y + (L.h - chH) / 2, L.chip, chH, Math.round(S * 0.32)); g.fillStyle = rgba(chipC2, 0.95); g.fill();
      g.font = css(Math.round(S * 0.72), 800); g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = '#16121f';
      g.fillText(chipText(d), x + L.pad * 0.6 + L.chip / 2, y + L.h / 2 + S * 0.03); g.textAlign = 'left';
      var tx2 = x + L.pad * 0.6 + L.chip + L.gap, sm = TS('small'), bg = TS('bold');
      dtext(g, L.l1, tx2, y + L.pad, sm, th.dim);
      dtext(g, L.l2, tx2, y + L.pad + sm.h + S * 0.35, bg, th.text);
      g.restore();
      drawnRects.push({ kind: 'why', id: w.id, x: x, y: y, w: L.w, h: L.h, rule: d.rule, action: d.action });
    }
    function tailPts(w, x, y, L, s) {
      var A = w.anchor; if (!A) return null;
      if (w.tail === 'down') { var tx = clamp(A.cx, x + s * 2, x + L.w - s * 2); return [[tx - s, y + L.h], [tx + s, y + L.h], [tx, y + L.h + s]]; }
      if (w.tail === 'up') { var ux = clamp(A.cx, x + s * 2, x + L.w - s * 2); return [[ux - s, y], [ux + s, y], [ux, y - s]]; }
      var ty = clamp(A.y + A.h / 2, y + s * 2, y + L.h - s * 2);
      if (w.tail === 'right') return [[x + L.w, ty - s], [x + L.w, ty + s], [x + L.w + s, ty]];
      return [[x, ty - s], [x, ty + s], [x - s, ty]];
    }
    // corner ticks around the chosen target(s) while the newest plate shows, in the plate's chip colour
    function drawTargets(g, w) {
      if (!w || w.x == null || w.hidden || !w.L || !w.d || !w.d.targetUnits) return;
      var age = T - w.born, a = Math.min(clamp(age / 160, 0, 1), clamp((w.life - age) / 260, 0, 1)); if (a <= 0.05) return;
      var th = w.L.th, col = chipCol(w.d, th), cr = w.L.crisp, list = w.d.targetUnits;
      if (list.length === 1 && list[0] === w.unit) return;
      for (var i = 0; i < list.length && i < 6; i++) {
        var A = anchorOf(list[i]); if (!A) continue;
        var pad = cr ? 2 : Math.round(w.L.S * 0.25), x0 = Math.round(A.x - pad), y0 = Math.round(A.y - pad), x1 = Math.round(A.x + A.w + pad), y1 = Math.round(A.y + A.h + pad);
        var k = cr ? 3 : Math.max(4, Math.round(w.L.S * 0.5)), lw = cr ? 1 : Math.max(1.5, w.L.S * 0.14);
        var bob = cr ? (Math.floor(T / 200) % 2) : Math.sin(T / 140) * w.L.S * 0.08;
        x0 -= bob; y0 -= bob; x1 += bob; y1 += bob;
        if (cr) { if (a < 0.5) return; }
        g.save(); g.globalAlpha *= cr ? 1 : a; g.fillStyle = col;
        var seg = function (x, y, ww, hh) { if (cr) { g.fillStyle = th.px.ink; g.fillRect(x + 1, y + 1, ww, hh); g.fillStyle = col; } g.fillRect(x, y, ww, hh); };
        seg(x0, y0, k, lw); seg(x0, y0, lw, k); seg(x1 - k, y0, k, lw); seg(x1 - lw, y0, lw, k);
        seg(x0, y1 - lw, k, lw); seg(x0, y1 - k, lw, k); seg(x1 - k, y1 - lw, k, lw); seg(x1 - lw, y1 - k, lw, k);
        g.restore();
      }
    }
    function drawLead(g, w, x, y, L, th, cr) {
      var A = w.anchor; if (!A) return;
      var ax = A.cx, ay = A.y + (A.y > y + L.h ? 0 : A.y + A.h < y ? A.h : A.h / 2), px = clamp(ax, x + 3, x + L.w - 3), py = ay < y ? y : ay > y + L.h ? y + L.h : y + L.h / 2;
      if (py === y + L.h / 2) px = ax < x ? x : x + L.w;
      var dx = ax - px, dy = ay - py, n = Math.max(Math.abs(dx), Math.abs(dy)); if (n < 2) return;
      if (cr) {
        var sc = L.sc; g.fillStyle = th.accent;
        for (var i = 2; i < n - 1; i += 3) g.fillRect(Math.round(px + dx * i / n) - (sc >> 1), Math.round(py + dy * i / n) - (sc >> 1), sc, sc);
        g.fillStyle = th.px.ink; g.fillRect(Math.round(ax) - sc, Math.round(ay) - sc, 3 * sc, 3 * sc); g.fillStyle = th.accent; g.fillRect(Math.round(ax), Math.round(ay), sc, sc);
        return;
      }
      g.save(); g.strokeStyle = rgba(th.accent, 0.8); g.lineWidth = Math.max(1, L.S * 0.12); g.setLineDash([L.S * 0.25, L.S * 0.3]); g.lineCap = 'round';
      g.beginPath(); g.moveTo(px, py); g.lineTo(ax, ay); g.stroke(); g.setLineDash([]);
      g.fillStyle = th.accent; g.beginPath(); g.arc(ax, ay, L.S * 0.22, 0, Math.PI * 2); g.fill(); g.restore();
    }
    function drawTailCrisp(g, w, x, y, L, th, sc) {
      var A = w.anchor; if (!A) return;
      var s = 2 * sc;
      if (w.tail === 'down' || w.tail === 'up') {
        var tx = Math.round(clamp(A.cx, x + 4 * sc, x + L.w - 5 * sc));
        for (var i = 0; i < 3; i++) {
          var yy = w.tail === 'down' ? y + L.h - sc + i * sc : y - i * sc;
          g.fillStyle = th.px.ink; g.fillRect(tx - (2 - i) * sc - sc, yy, (2 * (2 - i) + 3) * sc, sc);
          if (i < 2) { g.fillStyle = th.px.fill; g.fillRect(tx - (2 - i) * sc, yy, (2 * (2 - i) + 1) * sc, sc); }
        }
      } else {
        var ty = Math.round(clamp(A.y + A.h / 2, y + 4 * sc, y + L.h - 5 * sc));
        for (var j = 0; j < 3; j++) {
          var xx = w.tail === 'right' ? x + L.w - sc + j * sc : x - j * sc;
          g.fillStyle = th.px.ink; g.fillRect(xx, ty - (2 - j) * sc - sc, sc, (2 * (2 - j) + 3) * sc);
          if (j < 2) { g.fillStyle = th.px.fill; g.fillRect(xx, ty - (2 - j) * sc, sc, (2 * (2 - j) + 1) * sc); }
        }
      }
      void s;
    }
    function drawTailSmooth(g, w, x, y, L, th, fill) {
      var p = tailPts(w, x, y, L, Math.round(L.S * 0.45)); if (!p) return;
      g.beginPath(); g.moveTo(p[0][0], p[0][1]); g.lineTo(p[2][0], p[2][1]); g.lineTo(p[1][0], p[1][1]); g.closePath(); g.fillStyle = th.bot; g.fill();
    }

    /* ======================================================================================================================
     *  the rule editor (modal)
     * ==================================================================================================================== */
    var ed = null;   // {units, ui, row, mode, field, bar, t, presetIdx, onClose, drag, sinceUpd}
    var FIELDS = ['move', 'on', 'if', 'n', 'do', 'pick', 'del'];
    function edUnit() { return ed && ed.units[ed.ui]; }
    function edSet() { var u = edUnit(); return u == null ? null : setFor(u); }
    function rowCount() { var s = edSet(); return s ? s.rules.length + 2 : 2; }   // rules, otherwise, button bar
    function rowKind(i) { var s = edSet(), n = s ? s.rules.length : 0; return i < n ? 'rule' : i === n ? 'otherwise' : 'bar'; }
    function fieldsFor(i) {
      if (rowKind(i) === 'otherwise') return ['do', 'pick'];
      var s = edSet(), r = s && s.rules[i], d = r && conds[r.if];
      return FIELDS.filter(function (f) { return f !== 'n' || (d && (d.n || d.tag)); });
    }
    function openEditor(units, opt) {
      opt = opt || {};
      var list = (Array.isArray(units) ? units : units != null ? [units] : []).filter(function (u) { return u != null && keyOf(u) != null; });
      if (!list.length) { emit({ event: 'open-empty' }); return false; }
      var fi = 0; if (opt.focus != null) for (var i = 0; i < list.length; i++) if (list[i] === opt.focus || uid(list[i]) === opt.focus) fi = i;
      ed = { units: list, ui: fi, row: 0, mode: 'nav', field: 2, bar: 2, t: 0, presetIdx: -1, onClose: typeof opt.onClose === 'function' ? opt.onClose : null, drag: null, press: null, hits: [], scroll: 0, seenRow: -1, undo: null, sinceUpd: 0, closing: -1, auto: !!(opt.auto || (+P.autoClose > 0)) };
      list.forEach(function (u) { setFor(u); });
      stats.opens++; emit({ event: 'open', units: list.map(uid) }); refreshNow();
      return true;
    }
    function closeEditor(reason) {
      if (!ed) return;
      var cb = ed.onClose, units = ed.units; ed = null; edL = null;
      emit({ event: 'close', why: reason || 'done' });
      if (cb) call(cb, [{ why: reason || 'done', rules: exportBook(), units: units }], null, 'onClose');
    }
    var nowDec = null;
    function refreshNow() {
      nowDec = null; var u = edUnit(); if (u == null) return;
      try { var sb = snapshot(u); nowDec = evaluate(setFor(u), sb.snap, { conditions: o.conditions }); } catch (e) { nowDec = null; }
    }
    function cycle(list, cur, dir) { var i = list.indexOf(cur); if (i < 0) i = 0; return list[(i + dir + list.length) % list.length]; }
    function condIds() { var a = COND_ORDER.slice(); for (var c in conds) if (a.indexOf(c) < 0) a.push(c); return a; }
    function tagList() { var t = TAGS.slice(); if (gRow && t.indexOf('front row') < 0) { t.push('front row'); t.push('back row'); } return t; }
    function changeField(i, f, dir) {
      var u = edUnit(), s = setFor(u); if (!s) return;
      if (rowKind(i) === 'otherwise') {
        s.otherwise = s.otherwise || { do: null, pick: 'auto' };
        if (f === 'do') { var acts = actionsFor(u).map(function (a) { return String(a.id); }); if (!acts.length) return; s.otherwise.do = cycle(acts, s.otherwise.do, dir); }
        if (f === 'pick') s.otherwise.pick = cycle(PICK_ORDER, s.otherwise.pick, dir);
        s.preset = null; changed(u, f); refreshNow(); return;
      }
      var r = s.rules[i]; if (!r) return;
      if (f === 'move') {
        var j = i + (dir > 0 ? -1 : 1); if (j < 0 || j >= s.rules.length) return;
        s.rules.splice(i, 1); s.rules.splice(j, 0, r); ed.row = j; s.preset = null; changed(u, 'move'); refreshNow(); return;
      }
      if (f === 'on') r.on = !r.on;
      if (f === 'if') {
        var nc = cycle(condIds(), r.if, dir), def = conds[nc]; r.if = nc;
        delete r.n; delete r.tag;
        if (def && def.n) r.n = def.n.def;
        if (def && def.tag) r.tag = tagList()[0] || '';
      }
      if (f === 'n') {
        var d2 = conds[r.if];
        if (d2 && d2.n) r.n = clamp(num(r.n, d2.n.def) + dir * d2.n.step, d2.n.min, d2.n.max);
        else if (d2 && d2.tag) { var tl = tagList(); if (tl.length) r.tag = cycle(tl, r.tag, dir); }
      }
      if (f === 'do') { var acts2 = actionsFor(u).map(function (a) { return String(a.id); }); if (acts2.length) r.do = cycle(acts2, r.do, dir); }
      if (f === 'pick') r.pick = cycle(PICK_ORDER, r.pick, dir);
      s.preset = null; changed(u, f); refreshNow();
    }
    function addRule() {
      var u = edUnit(), s = setFor(u); if (!s) return;
      if (s.rules.length >= Math.max(1, num(P.maxRules, 8))) { flash('full'); return; }
      var acts = actionsFor(u); var id = s.otherwise && s.otherwise.do != null ? s.otherwise.do : acts.length ? String(acts[0].id) : null;
      s.rules.push({ on: true, if: 'allyHpBelow', n: 40, do: id, pick: 'auto' });
      s.preset = null; ed.row = s.rules.length - 1; ed.mode = 'edit'; ed.field = FIELDS.indexOf('if'); changed(u, 'add'); refreshNow();
    }
    function deleteRule(i) {
      var u = edUnit(), s = setFor(u); if (!s || !s.rules[i]) return;
      s.rules.splice(i, 1); s.preset = null; ed.mode = 'nav'; ed.row = Math.min(i, s.rules.length); changed(u, 'delete'); refreshNow();
    }
    function applyPresetStep() {
      var u = edUnit(), names = presetNames(), key0 = keyOf(u); if (!names.length || key0 == null) return;
      if (ed.undo && T - ed.undo.t < 5000 && ed.undo.key === key0) { book[key0] = ed.undo.set; ed.undo = null; changed(u, 'undo'); refreshNow(); flash('undo'); return; }
      var cand = presetCandidate(), prev = copy(setFor(u));
      if (applyPreset(u, cand)) { ed.undo = { key: key0, set: normSet(prev, conds), t: T }; ed.undo.set.preset = prev.preset || null; flash('preset'); }
      ed.presetIdx = (names.indexOf(cand) + 1) % names.length;
    }
    function applyPreset(u, name) {
      var s = presetSet(name, u); if (!s) return false;
      var key = keyOf(u); if (key == null) return false;
      s.preset = name; book[key] = s; changed(u, 'preset'); if (ed) refreshNow(); return true;
    }
    var flashMsg = null;
    function flash(m) { flashMsg = { m: m, t: T }; }
    var KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'ok', ' ': 'ok', z: 'ok', Z: 'ok', x: 'back', X: 'back', Escape: 'back', Backspace: 'back',
      Tab: 'next', q: 'prev', Q: 'prev', e: 'next', E: 'next', PageUp: 'prev', PageDown: 'next', w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right',
      up: 'up', down: 'down', left: 'left', right: 'right', ok: 'ok', confirm: 'ok', back: 'back', cancel: 'back', prev: 'prev', next: 'next' };
    function key(k) {
      if (!ed) return false;
      try {
        if (k && typeof k === 'object') k = k.key != null ? k.key : k.k;
        var a = KEYMAP[k]; if (!a) return true;   // modal: swallow everything while open
        if (ed.closing >= 0) return true;
        var n = rowCount(), kind = rowKind(ed.row);
        if (a === 'prev' || a === 'next') { switchUnit(a === 'next' ? 1 : -1); return true; }
        if (ed.mode === 'edit' && kind !== 'bar') {
          var F2 = fieldsFor(ed.row), fname = FIELDS[ed.field]; if (F2.indexOf(fname) < 0) { fname = F2[0]; ed.field = FIELDS.indexOf(fname); }
          if (a === 'left' || a === 'right') { var fi = F2.indexOf(fname) + (a === 'right' ? 1 : -1); fi = clamp(fi, 0, F2.length - 1); ed.field = FIELDS.indexOf(F2[fi]); return true; }
          if (a === 'up' || a === 'down') { if (fname === 'del') return true; changeField(ed.row, fname, a === 'up' ? 1 : -1); return true; }
          if (a === 'ok') { if (fname === 'del') { deleteRule(ed.row); return true; } if (fname === 'on') { changeField(ed.row, 'on', 1); return true; } ed.mode = 'nav'; ed.row = Math.min(ed.row + 1, n - 1); if (rowKind(ed.row) === 'bar') ed.bar = 2; return true; }
          if (a === 'back') { ed.mode = 'nav'; return true; }
          return true;
        }
        if (a === 'up') { ed.row = (ed.row + n - 1) % n; return true; }
        if (a === 'down') { ed.row = (ed.row + 1) % n; if (rowKind(ed.row) === 'bar') ed.bar = 2; return true; }
        if (a === 'left' || a === 'right') { if (kind === 'bar') ed.bar = clamp(ed.bar + (a === 'right' ? 1 : -1), 0, 2); else switchUnit(a === 'right' ? 1 : -1); return true; }
        if (a === 'ok') {
          if (kind === 'bar') { if (ed.bar === 0) addRule(); else if (ed.bar === 1) applyPresetStep(); else startClose('done'); return true; }
          ed.mode = 'edit'; ed.field = kind === 'otherwise' ? FIELDS.indexOf('do') : FIELDS.indexOf('if'); return true;
        }
        if (a === 'back') { startClose('back'); return true; }
      } catch (e) { warnOnce(WARN, 'key', 'key failed', e); }
      return true;
    }
    function switchUnit(dir) { if (!ed || ed.units.length < 2) return; ed.ui = (ed.ui + dir + ed.units.length) % ed.units.length; ed.mode = 'nav'; ed.row = Math.min(ed.row, rowCount() - 1); ed.presetIdx = -1; ed.undo = null; refreshNow(); }
    function startClose(why) { if (!ed) return; ed.closing = 0; ed.closeWhy = why; if (!(ed.sinceUpd < 3)) closeEditor(why); }

    /* ----- editor layout: one pass computes sizes, then drawEditor records the hit rects it really drew ----- */
    var edL = null;
    function listN() { var s = edSet(); return (s ? s.rules.length : 0) + 1; }   // rules + otherwise
    function edDims(S, cr, sc) {
      var k = cssK > 0 ? cssK : 1, minRow = !cr && +P.minCssPx > 0 && cssK > 0 ? Math.ceil(32 / k) : 0;
      var d = { S: S, m: cr ? 4 * sc : Math.round(S * 0.9), pad: cr ? 4 * sc : Math.round(S * 0.85), rowH: cr ? 11 * sc : Math.max(Math.round(S * 1.85), minRow),
        headH: cr ? 13 * sc : Math.round(S * 2.1), subH: cr ? 9 * sc : Math.round(S * 1.45), colH: cr ? 8 * sc : Math.round(S * 1.3),
        gap: cr ? 4 * sc : Math.round(S * 0.4), barH: cr ? 13 * sc : Math.max(Math.round(S * 2.1), minRow), nowH: cr ? 16 * sc : Math.round(S * 2.5), helpH: cr ? 8 * sc : Math.round(S * 1.3) };
      if (!cr && compactUI()) {   // phones: no sub line, column heads or help; finger-sized rows; one Now line
        d.m = Math.round(S * 0.3); d.pad = Math.round(S * 0.5); d.subH = 0; d.colH = 0; d.helpH = 0; d.nowH = Math.round(S * 1.4); d.headH = Math.max(Math.round(S * 2), minRow); d.compact = true;
      }
      d.fixed = d.pad + d.headH + d.subH + d.colH + d.gap + d.barH + d.nowH + d.helpH + d.pad;
      return d;
    }
    function minCssS() { return +P.minCssPx > 0 && cssK > 0 ? Math.ceil(+P.minCssPx / cssK) : 0; }
    function compactUI() { var base = +P.size > 0 ? clamp(+P.size, 8, 28) : clamp(Math.round(B().w / 54), 9, 20); return minCssS() > base * 1.25; }
    function edBaseS() {
      var base = +P.size > 0 ? clamp(+P.size, 8, 28) : clamp(Math.round(B().w / 54), 9, 20);
      if (+P.minCssPx > 0 && cssK > 0) base = Math.max(base, Math.ceil(+P.minCssPx / cssK));
      return base;
    }
    function edLayout() {
      var b = B(), cr = crisp(), sc = cr ? SC() : 1, S = cr ? 0 : edBaseS(), n = listN() - 1, maxR = Math.max(1, num(P.maxRules, 8)), d, rows = 0, scroll = false, slots = 0;
      for (var it = 0; it < 16; it++) {
        d = edDims(S, cr, sc);
        var avail = b.h - 2 * d.m - d.fixed, full = maxR + 1, need = n + 1 + (n < maxR ? 1 : 0);
        if (avail >= full * d.rowH) { rows = full; slots = full - (n + 1); break; }
        if (avail >= need * d.rowH) { rows = need; slots = need - (n + 1); break; }
        if (avail >= 2 * d.rowH || cr || S <= 7 || (S <= minCssS() && avail >= d.rowH)) { rows = Math.max(1, Math.floor(avail / d.rowH)); scroll = rows < n + 1; slots = Math.max(0, rows - (n + 1)); break; }
        S = Math.max(7, Math.floor(S * 0.9));
      }
      curS = cr ? 0 : S;
      var big = TS('big'), small = TS('small'), m = d.m, pad = d.pad, rowH = d.rowH;
      var w = cr ? b.w - 2 * m : Math.min(b.w - 2 * m, Math.max(Math.round(S * 34), Math.round(b.w * 0.74)));
      var h = Math.min(b.h - 2 * m, d.fixed + rows * rowH);
      var x = Math.round(b.x + (b.w - w) / 2), y = Math.round(b.y + Math.max(m, (b.h - h) / 2)), ix = x + pad, iw = w - 2 * pad;
      var cols = cr ? { move: 7 * sc, on: 9 * sc } : { move: Math.round(S * 1.25), on: Math.round(S * 1.5) };
      var arrowW = cr ? 8 * sc : Math.round(S * 1.4), rest = iw - cols.move - cols.on;
      cols.if = Math.round((rest - arrowW) * (cr ? 0.40 : 0.43)); cols.do = Math.round((rest - arrowW) * 0.28); cols.pick = rest - arrowW - cols.if - cols.do;
      var X = { move: ix, on: ix + cols.move }; X.if = X.on + cols.on; X.arrow = X.if + cols.if; X.do = X.arrow + arrowW; X.pick = X.do + cols.do;
      var tabsY = y + pad, subY = tabsY + d.headH, colY = subY + d.subH, rowsY = colY + d.colH, barY = rowsY + rows * rowH + d.gap;
      // keep the selected row in view; a finger scroll stays until the selection moves
      var N = n + 1, vis = Math.min(rows, N);
      if (ed.scroll == null) ed.scroll = 0;
      if (ed.row !== ed.seenRow && ed.row < N) { if (ed.row < ed.scroll) ed.scroll = ed.row; if (ed.row >= ed.scroll + rows) ed.scroll = ed.row - rows + 1; ed.seenRow = ed.row; }
      ed.scroll = clamp(ed.scroll, 0, Math.max(0, N - rows));
      return { compact: !!d.compact, crisp: cr, sc: sc, S: S, x: x, y: y, w: w, h: h, pad: pad, ix: ix, iw: iw, rowH: rowH, headH: d.headH, tabsY: tabsY, subY: subY, colY: colY, rowsY: rowsY,
        cols: cols, X: X, arrowW: arrowW, rows: rows, vis: vis, scroll: scroll, slots: slots, barY: barY, barH: d.barH, nowY: barY + d.barH + (cr ? 3 * sc : Math.round(S * 0.4)), nowH: d.nowH, helpH: d.helpH, big: big, small: small, maxRows: maxR };
    }
    function rowVisible(L, i) { return i >= ed.scroll && i < ed.scroll + L.rows; }
    function rowY(L, i) { return L.rowsY + (i - ed.scroll) * L.rowH; }
    function fieldRect(L, i, f) {
      var y = rowY(L, i), kind = rowKind(i), X = L.X, c = L.cols, dw = L.crisp ? 9 * L.sc : Math.round(L.S * 1.4);
      if (kind === 'otherwise') { if (f === 'do') return { x: X.do, y: y, w: c.do, h: L.rowH }; if (f === 'pick') return { x: X.pick, y: y, w: c.pick, h: L.rowH }; return null; }
      if (f === 'move') return { x: X.move, y: y, w: c.move, h: L.rowH };
      if (f === 'on') return { x: X.on, y: y, w: c.on, h: L.rowH };
      if (f === 'if') return { x: X.if, y: y, w: c.if, h: L.rowH };
      if (f === 'do') return { x: X.do, y: y, w: c.do, h: L.rowH };
      if (f === 'pick') return { x: X.pick, y: y, w: c.pick - dw, h: L.rowH };
      if (f === 'del') return { x: X.pick + c.pick - dw, y: y, w: dw, h: L.rowH };
      return null;
    }
    function barRects(L) {
      var gap = L.crisp ? 4 * L.sc : Math.round(L.S * 0.6), w0 = Math.round((L.iw - 2 * gap) * 0.26), w1 = Math.round((L.iw - 2 * gap) * 0.48), w2 = L.iw - 2 * gap - w0 - w1;
      return [{ x: L.ix, y: L.barY, w: w0, h: L.barH }, { x: L.ix + w0 + gap, y: L.barY, w: w1, h: L.barH }, { x: L.ix + w0 + w1 + 2 * gap, y: L.barY, w: w2, h: L.barH }];
    }
    function tabRects(L) {
      var out = [], st = L.big, title = 'TACTICS', x = L.ix + mw(title, st) + (L.crisp ? 8 * L.sc : L.S * 1.2);
      var pad = L.crisp ? 4 * L.sc : Math.round(L.S * 0.6), gap = L.crisp ? 2 * L.sc : Math.round(L.S * 0.3), hintW = ed.units.length > 1 ? mw('Q / E', L.small) + gap * 2 : 0;
      for (var i = 0; i < ed.units.length; i++) {
        var nm = fitT(String(call(gName, [ed.units[i]], uid(ed.units[i]), 'fields.name')), L.crisp ? 44 * L.sc : L.S * 7, st);
        var w = mw(nm, st) + pad * 2; if (x + w > L.ix + L.iw - hintW) break;
        out.push({ i: i, x: x, y: L.tabsY, w: w, h: L.headH - (L.crisp ? 3 * L.sc : Math.round(L.S * 0.45)), name: nm }); x += w + gap;
      }
      return out;
    }
    function hitR(r, x, y) { return r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }
    function hitAt(x, y) {   // the hit rects the last draw really drew; later entries (value chips) win
      var H = ed && ed.hits || [];
      for (var i = H.length - 1; i >= 0; i--) if (hitR(H[i], x, y)) return H[i];
      return null;
    }
    function doHit(h) {
      if (!h) return;
      if (h.kind === 'tab') { if (ed.ui !== h.i) { ed.ui = h.i; ed.mode = 'nav'; ed.row = Math.min(ed.row, rowCount() - 1); ed.presetIdx = -1; ed.undo = null; refreshNow(); } return; }
      if (h.kind === 'bar') { ed.row = rowCount() - 1; ed.bar = h.i; ed.mode = 'nav'; key('ok'); return; }
      if (h.kind === 'scroll') { ed.scroll += h.dir; ed.seenRow = ed.row; return; }
      if (h.kind === 'row') { ed.row = h.row; ed.seenRow = h.row; ed.mode = 'nav'; return; }
      if (h.kind === 'cell') {
        ed.row = h.row; ed.seenRow = h.row;
        if (h.f === 'del') { deleteRule(h.row); return; }
        ed.mode = 'edit'; ed.field = FIELDS.indexOf(h.f);
        changeField(h.row, h.f, 1);
      }
    }
    function pointer(type, x, y) {
      if (!ed) return false;
      try {
        if (ed.closing >= 0) return true;
        var L = edL; if (!L) { L = edL = edLayout(); curS = 0; } x = +x; y = +y;
        if (type === 'move') {
          if (ed.drag) {
            var s = edSet(), n = s.rules.length, j = clamp(ed.scroll + Math.floor((y - L.rowsY) / L.rowH), 0, n - 1);
            if (j !== ed.drag.i) { var r = s.rules.splice(ed.drag.i, 1)[0]; s.rules.splice(j, 0, r); ed.drag.i = j; ed.row = j; ed.seenRow = j; ed.drag.moved = true; s.preset = null; refreshNow(); }
          } else if (ed.press && L.scroll && Math.abs(y - ed.press.y) > L.rowH * 0.35) {
            ed.press.moved = true; ed.scroll = clamp(ed.press.scroll0 - Math.round((y - ed.press.y) / L.rowH), 0, Math.max(0, listN() - L.rows)); ed.seenRow = ed.row;
          }
          return true;
        }
        if (type === 'up' || type === 'cancel') {
          if (ed.drag && ed.drag.moved) changed(edUnit(), 'move');
          ed.drag = null;
          var p = ed.press; ed.press = null;
          if (p && !p.moved && type === 'up') doHit(p.hit);
          return true;
        }
        if (type !== 'down' && type !== 'tap') return true;
        var h = hitAt(x, y); if (!h) return true;
        if (h.kind === 'cell' && h.f === 'move' && type === 'down') { ed.row = h.row; ed.seenRow = h.row; ed.drag = { i: h.row, y: y, moved: false }; return true; }
        // in a scrolling list a cell acts on release, so a finger can scroll; elsewhere at once
        if (type === 'down' && L.scroll && (h.kind === 'cell' || h.kind === 'row')) { ed.press = { hit: h, y: y, scroll0: ed.scroll, moved: false }; return true; }
        doHit(h);
      } catch (e) { warnOnce(WARN, 'pointer', 'pointer failed', e); }
      return true;
    }

    /* ----- editor drawing ----- */
    function condShort(r) { return condText(r, conds, o.resLabel || 'MP'); }
    function splitCond(r) {   // [words before, value, words after]: the value chip is the number (with its unit) or the tag
      var d = conds[r.if], full = condShort(r); if (!d || (!d.n && !d.tag)) return [full, '', ''];
      var lab = String(d.label || r.if).replace('{res}', o.resLabel || 'MP'), ph = d.n ? '{n}' : '{tag}', at = lab.indexOf(ph);
      if (at < 0) return [full, '', ''];
      var after = lab.slice(at + ph.length), v = d.n ? String(r.n) : String(r.tag || '?');
      if (d.n && d.n.unit && after.indexOf(d.n.unit) === 0) { v += d.n.unit; after = after.slice(d.n.unit.length); }
      return [lab.slice(0, at).replace(/\s+$/, ''), v, after.replace(/\{tag\}/g, r.tag || '').replace(/\{n\}/g, r.n)];
    }
    function actLabelFor(u, id) { if (id == null) return '-'; var a = actionsFor(u); for (var i = 0; i < a.length; i++) if (String(a[i].id) === String(id)) return String(a[i].label != null ? a[i].label : a[i].id); return String(id) + '?'; }
    function presetCandidate() {
      var names = presetNames(); if (!names.length) return null;
      if (ed.presetIdx < 0) { var cp = classPreset(edUnit()), at = cp ? names.indexOf(cp) : -1; ed.presetIdx = at >= 0 ? at : 0; }
      return names[ed.presetIdx % names.length];
    }
    function drawEditor(g) {
      if (!ed) return;
      var L = edL = edLayout(), th = TH(), cr = L.crisp, sc = L.sc, S = L.S, u = edUnit(), s = setFor(u), big = L.big, small = L.small, H = ed.hits = [];
      var openA = ed.sinceUpd >= 3 ? 1 : ease(ed.t / 170), closeA = ed.closing >= 0 ? 1 - ease(ed.closing / 140) : 1, a = Math.min(openA, closeA);
      if (a <= 0.02) return;
      var x = L.x, y = L.y, w = L.w, h = L.h;
      g.save();
      if (cr) {
        if (a < 0.5) { g.restore(); return; }
        g.fillStyle = 'rgba(4,3,10,0.55)'; var bb = B(); g.fillRect(bb.x, bb.y, bb.w, bb.h);
        g.fillStyle = th.px.ink; g.fillRect(x - sc, y, w + 2 * sc, h); g.fillRect(x, y - sc, w, h + 2 * sc);
        g.fillStyle = th.px.edge; g.fillRect(x, y, w, h);
        g.fillStyle = th.px.fill; g.fillRect(x + sc, y + sc, w - 2 * sc, h - 2 * sc);
        g.fillStyle = th.px.fill2; g.fillRect(x + sc, y + Math.round(h / 2), w - 2 * sc, Math.round(h / 2) - sc);
      } else {
        var bb2 = B(); g.fillStyle = 'rgba(6,4,14,' + (0.5 * a).toFixed(3) + ')'; g.fillRect(bb2.x, bb2.y, bb2.w, bb2.h);
        g.globalAlpha *= a;
        var cx0 = x + w / 2, cy0 = y + h / 2, sp = 0.96 + 0.04 * backOut(openA); g.translate(cx0, cy0); g.scale(sp, sp); g.translate(-cx0, -cy0);
        var k = scaleOf(g); g.shadowColor = th.shadow; g.shadowBlur = S * 2 * k; g.shadowOffsetY = S * 0.4 * k;
        rr(g, x, y, w, h, Math.round(S * 0.8)); var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, th.top); gr.addColorStop(1, th.bot); g.fillStyle = gr; g.fill();
        g.shadowColor = 'rgba(0,0,0,0)'; g.shadowBlur = 0; g.shadowOffsetY = 0;
        g.lineWidth = 1 / k; rr(g, x + 0.5, y + 0.5, w - 1, h - 1, Math.round(S * 0.8)); g.strokeStyle = th.edge; g.stroke();
      }
      // header: title + unit tabs
      dtext(g, 'TACTICS', L.ix, L.tabsY + (cr ? 2 * sc : S * 0.25), cr ? big : TS('bold'), th.accent);
      var tabs = tabRects(L);
      tabs.forEach(function (tb) {
        var sel = tb.i === ed.ui;
        if (cr) { g.fillStyle = sel ? th.accent : th.px.band; g.fillRect(tb.x, tb.y, tb.w, tb.h); }
        else { rr(g, tb.x, tb.y, tb.w, tb.h, Math.round(tb.h / 2)); g.fillStyle = sel ? rgba(th.accent, 0.95) : th.row; g.fill(); }
        dtext(g, tb.name, tb.x + (tb.w - mw(tb.name, big)) / 2, tb.y + (tb.h - big.h) / 2 + (cr ? 0 : S * 0.05), big, sel ? (cr ? th.px.ink : '#1a1424') : th.dim);
        H.push({ kind: 'tab', i: tb.i, x: tb.x, y: tb.y, w: tb.w, h: tb.h });
      });
      if (ed.units.length > 1) {
        var hint = cr ? '\u00b7 Q/E' : 'Q / E';
        dtext(g, hint, L.ix + L.iw - mw(hint, small), L.tabsY + (cr ? 3 * sc : S * 0.45), small, th.faint);
      }
      // sub line: class / current preset
      var cls = clsOf(u), pre = s && s.preset ? presetLabel(s.preset) : 'custom';
      if (!L.compact) dtext(g, fitT((cls ? 'Class ' + cls + '  \u00b7  ' : '') + 'Preset ' + pre + '  \u00b7  ' + (s ? s.rules.length : 0) + '/' + L.maxRows + ' rules', L.iw, small), L.ix, L.subY, small, th.dim);
      var X = L.X, c = L.cols;
      if (!L.compact) { dtext(g, 'Condition', X.if + (cr ? sc : S * 0.15), L.colY, small, th.faint); dtext(g, 'Do', X.do, L.colY, small, th.faint); dtext(g, 'Target', X.pick, L.colY, small, th.faint); }
      // rows
      var n = s ? s.rules.length : 0, fired = nowDec ? nowDec.rule : -2, firedOther = nowDec && nowDec.kind === 'otherwise', tr = nowDec ? nowDec.trace : [];
      for (var i = 0; i <= n; i++) {
        if (!rowVisible(L, i)) continue;
        var ry = rowY(L, i), isO = i === n, r = isO ? null : s.rules[i], sel = ed.row === i, isFired = isO ? firedOther : fired === i;
        var tri = null; for (var q = 0; q < tr.length; q++) if (tr[q].i === (isO ? -1 : i)) tri = tr[q];
        H.push({ kind: 'row', row: i, x: L.ix - (cr ? 2 * sc : S * 0.3), y: ry, w: L.iw + (cr ? 4 * sc : S * 0.6), h: L.rowH });
        if (cr) {
          if (sel) { g.fillStyle = th.px.sel; g.fillRect(L.ix - 2 * sc, ry, L.iw + 4 * sc, L.rowH - sc); }
          else if (i % 2 === 0) { g.fillStyle = th.px.band; g.fillRect(L.ix - 2 * sc, ry, L.iw + 4 * sc, L.rowH - sc); }
          if (isFired) { g.fillStyle = th.fired; g.fillRect(L.ix - 3 * sc, ry, 2 * sc, L.rowH - sc); }
        } else {
          rr(g, L.ix - S * 0.3, ry + 1, L.iw + S * 0.6, L.rowH - 2, Math.round(S * 0.35)); g.fillStyle = sel ? th.sel : i % 2 === 0 ? th.row : 'rgba(0,0,0,0)'; g.fill();
          if (sel && ed.mode === 'edit') { g.lineWidth = 1 / scaleOf(g); g.strokeStyle = rgba(th.accent, 0.5); g.stroke(); }
          if (isFired) { rr(g, L.ix - S * 0.3, ry + 1, Math.round(S * 0.22), L.rowH - 2, 2); g.fillStyle = th.fired; g.fill(); }
        }
        var ty = ry + Math.round((L.rowH - big.h) / 2) - (cr ? 0 : 1);
        var off = r && !r.on, col = off ? th.off : isFired ? th.text : tri && tri.state === 'unusable' ? th.dim : th.text;
        if (isO) {
          dtext(g, 'Otherwise', X.if + (cr ? sc : S * 0.15), ty, big, th.dim);
          var od = s && s.otherwise ? s.otherwise : { do: null, pick: 'auto' };
          drawCell(g, L, i, 'do', fitT(actLabelFor(u, od.do), c.do - (cr ? 3 * sc : S * 0.4), big), ty, isFired ? th.fired : th.text, th);
          drawCell(g, L, i, 'pick', fitT(PICKS[od.pick] ? PICKS[od.pick].label : od.pick, c.pick - (cr ? 3 * sc : S * 0.4), big), ty, th.dim, th);
          dtext(g, '\u2192', X.arrow + (L.arrowW - mw('\u2192', big)) / 2, ty, big, th.faint);
          continue;
        }
        var idx = String(i + 1);
        dtext(g, idx, X.move + (c.move - mw(idx, small)) / 2, ry + Math.round((L.rowH - small.h) / 2), small, isFired ? th.fired : th.faint);
        H.push(Object.assign({ kind: 'cell', row: i, f: 'move' }, fieldRect(L, i, 'move')));
        if (sel && ed.mode === 'edit' && FIELDS[ed.field] === 'move') drawFocus(g, L, fieldRect(L, i, 'move'), th);
        var bx = X.on + (cr ? sc : S * 0.15), bs = cr ? 6 * sc : Math.round(S * 0.85), by = ry + Math.round((L.rowH - bs) / 2);
        if (cr) { g.fillStyle = th.px.ink; g.fillRect(bx, by, bs, bs); g.fillStyle = r.on ? th.fired : th.px.band; g.fillRect(bx + sc, by + sc, bs - 2 * sc, bs - 2 * sc); }
        else { rr(g, bx, by, bs, bs, Math.round(bs * 0.28)); g.fillStyle = r.on ? th.fired : 'rgba(255,255,255,0.08)'; g.fill(); if (r.on) { g.strokeStyle = '#122018'; g.lineWidth = Math.max(1.4, S * 0.13); g.beginPath(); g.moveTo(bx + bs * 0.24, by + bs * 0.52); g.lineTo(bx + bs * 0.43, by + bs * 0.72); g.lineTo(bx + bs * 0.78, by + bs * 0.3); g.stroke(); } }
        H.push(Object.assign({ kind: 'cell', row: i, f: 'on' }, fieldRect(L, i, 'on')));
        if (sel && ed.mode === 'edit' && FIELDS[ed.field] === 'on') drawFocus(g, L, fieldRect(L, i, 'on'), th);
        // condition: words, value chip, words; the chip's drawn rect is the value's hit area
        var parts = splitCond(r), cw = c.if - (cr ? 3 * sc : S * 0.4), gapW = cr ? 4 * sc : S * 0.5;
        var vtxt = parts[1], vw = vtxt ? mw(vtxt, big) : 0, postW = parts[2] ? mw(parts[2], big) : 0;
        var words = fitT(parts[0], Math.max(0, cw - (vtxt ? vw + gapW * 2 + postW : 0)), big), ifRect = fieldRect(L, i, 'if'), cx1 = X.if + (cr ? sc : S * 0.15);
        H.push(Object.assign({ kind: 'cell', row: i, f: 'if' }, ifRect));
        if (words) { dtext(g, words, cx1, ty, big, col); cx1 += mw(words, big) + gapW; }
        if (vtxt) {
          var vx = cx1, chip = cr ? { x: vx - sc, y: ry + sc, w: vw + 2 * sc, h: L.rowH - 3 * sc } : { x: vx - S * 0.25, y: ry + L.rowH * 0.16, w: vw + S * 0.5, h: L.rowH * 0.68 };
          if (cr) { g.fillStyle = off ? th.px.band : th.px.hi; g.fillRect(chip.x, chip.y, chip.w, chip.h); }
          else { rr(g, chip.x, chip.y, chip.w, chip.h, Math.round(S * 0.3)); g.fillStyle = off ? 'rgba(255,255,255,0.04)' : rgba(th.accent, 0.16); g.fill(); }
          dtext(g, vtxt, vx, ty, big, off ? th.off : th.accent);
          var padH = cr ? 2 * sc : Math.round(S * 0.3);
          H.push({ kind: 'cell', row: i, f: 'n', x: chip.x - padH, y: ry, w: chip.w + 2 * padH, h: L.rowH });
          if (sel && ed.mode === 'edit' && FIELDS[ed.field] === 'n') drawFocus(g, L, { x: chip.x - (cr ? sc : S * 0.1), y: ry, w: chip.w + (cr ? 2 * sc : S * 0.2), h: L.rowH }, th, true);
          cx1 = vx + vw + (cr ? 2 * sc : S * 0.3);
          if (parts[2]) dtext(g, fitT(parts[2], Math.max(0, X.if + cw - cx1), big), cx1, ty, big, col);
        }
        if (sel && ed.mode === 'edit' && FIELDS[ed.field] === 'if') drawFocus(g, L, ifRect, th);
        dtext(g, '\u2192', X.arrow + (L.arrowW - mw('\u2192', big)) / 2, ty, big, isFired ? th.fired : th.faint);
        drawCell(g, L, i, 'do', fitT(actLabelFor(u, r.do), c.do - (cr ? 3 * sc : S * 0.4), big), ty, off ? th.off : tri && tri.state === 'unusable' ? th.bad : isFired ? th.fired : th.text, th);
        var dw = cr ? 9 * sc : Math.round(S * 1.4);
        drawCell(g, L, i, 'pick', fitT(PICKS[r.pick] ? PICKS[r.pick].label : r.pick, c.pick - dw - (cr ? 2 * sc : S * 0.3), big), ty, off ? th.off : th.dim, th);
        var dr = fieldRect(L, i, 'del'), xs = cr ? 3 * sc : Math.round(S * 0.32), dcx = dr.x + dr.w / 2, dcy = ry + L.rowH / 2;
        if (cr) { g.fillStyle = sel ? th.bad : th.px.hi; for (var z = -1; z <= 1; z++) { g.fillRect(Math.round(dcx + z * sc - sc / 2), Math.round(dcy + z * sc - sc / 2), sc, sc); g.fillRect(Math.round(dcx - z * sc - sc / 2), Math.round(dcy + z * sc - sc / 2), sc, sc); } }
        else { g.strokeStyle = sel ? th.bad : th.faint; g.lineWidth = Math.max(1.2, S * 0.11); g.beginPath(); g.moveTo(dcx - xs, dcy - xs); g.lineTo(dcx + xs, dcy + xs); g.moveTo(dcx + xs, dcy - xs); g.lineTo(dcx - xs, dcy + xs); g.stroke(); }
        H.push(Object.assign({ kind: 'cell', row: i, f: 'del' }, dr));
        if (sel && ed.mode === 'edit' && FIELDS[ed.field] === 'del') drawFocus(g, L, dr, th);
      }
      for (var es = 0; es < L.slots; es++) {   // free slots, so the list reads as a capacity
        var ey = L.rowsY + (n + 1 + es - ed.scroll) * L.rowH + Math.round(L.rowH / 2);
        if (cr) { g.fillStyle = th.px.band; for (var ex = L.ix + 2 * sc; ex < L.ix + L.iw - 2 * sc; ex += 4 * sc) g.fillRect(ex, ey, sc, sc); }
        else { g.fillStyle = 'rgba(255,255,255,0.06)'; for (var ex2 = L.ix; ex2 < L.ix + L.iw; ex2 += S * 0.6) g.fillRect(ex2, ey, S * 0.12, S * 0.12); }
      }
      if (L.scroll) {   // more above / below: chevrons you can tap, and a thin scroll bar
        var N2 = n + 1, trackH = L.rows * L.rowH, thumbH = Math.max(L.rowH * 0.6, trackH * L.rows / N2), thumbY = L.rowsY + (trackH - thumbH) * (ed.scroll / Math.max(1, N2 - L.rows)), sbx = L.x + L.w - Math.max(3, Math.round(L.pad * 0.45));
        g.fillStyle = rgba(th.accent, 0.55); if (cr) g.fillRect(sbx, Math.round(thumbY), sc, Math.round(thumbH)); else { rr(g, sbx - 1.5, thumbY, 3, thumbH, 1.5); g.fill(); }
        var chev = function (dir, cy) {
          var cxs = L.ix + L.iw / 2, s2 = cr ? 3 * sc : Math.round(S * 0.45);
          g.fillStyle = th.accent; g.beginPath(); g.moveTo(cxs - s2, cy + (dir < 0 ? s2 / 2 : -s2 / 2)); g.lineTo(cxs + s2, cy + (dir < 0 ? s2 / 2 : -s2 / 2)); g.lineTo(cxs, cy + (dir < 0 ? -s2 / 2 : s2 / 2)); g.closePath(); g.fill();
          H.push({ kind: 'scroll', dir: dir, x: cxs - L.iw * 0.2, y: cy - L.rowH * 0.45, w: L.iw * 0.4, h: L.rowH * 0.9 });
        };
        if (ed.scroll > 0) chev(-1, L.colY + L.headH * 0.2);
        if (ed.scroll + L.rows < N2) chev(1, L.barY - L.rowH * 0.05);
      }
      if (!n && L.rows > 1) dtext(g, 'No rules yet: add one, or apply a preset', X.if, rowY(L, 1) + (L.rowH - small.h) / 2, small, th.faint);
      // button bar: [+ Add rule] [Apply <preset> | Undo preset] [Done]
      var br = barRects(L), cand = presetCandidate(), undoOn = ed.undo && T - ed.undo.t < 5000;
      var labels = ['+ Add rule', undoOn ? '\u21b6 Undo preset' : 'Apply ' + (cand ? presetLabel(cand) : '-') + ' \u25b8', 'Done'], onBar = rowKind(ed.row) === 'bar';
      if (cr) labels[1] = undoOn ? 'Undo preset' : 'Apply ' + (cand ? presetLabel(cand) : '-');
      for (var bi = 0; bi < 3; bi++) {
        var R = br[bi], hot = onBar && ed.bar === bi, full = bi === 0 && s && s.rules.length >= L.maxRows;
        if (cr) { g.fillStyle = hot ? th.accent : th.px.band; g.fillRect(R.x, R.y, R.w, R.h); g.fillStyle = th.px.ink; g.fillRect(R.x, R.y + R.h - sc, R.w, sc); }
        else { rr(g, R.x, R.y, R.w, R.h, Math.round(R.h * 0.3)); g.fillStyle = hot ? rgba(th.accent, 0.95) : 'rgba(255,255,255,0.07)'; g.fill(); if (!hot) { g.lineWidth = 1 / scaleOf(g); g.strokeStyle = bi === 1 && undoOn ? rgba(th.accent, 0.8) : th.edge; g.stroke(); } }
        var lb = fitT(labels[bi], R.w - (cr ? 4 * sc : S * 0.8), big);
        dtext(g, lb, R.x + (R.w - mw(lb, big)) / 2, R.y + (R.h - big.h) / 2 - (cr ? sc : 0), big, hot ? (cr ? th.px.ink : '#1a1424') : full ? th.off : th.text);
        H.push({ kind: 'bar', i: bi, x: R.x, y: R.y, w: R.w, h: R.h });
      }
      var nowY = L.nowY;
      if (nowDec) {
        var head = 'Now:', hw = mw(head, small) + (cr ? 3 * sc : S * 0.4);
        dtext(g, head, L.ix, nowY, small, th.fired);
        var lineA = nowDec.label + (nowDec.targetText ? ' \u2192 ' + nowDec.targetText : '') + '  (' + (nowDec.kind === 'rule' ? 'rule ' + (nowDec.rule + 1) : nowDec.kind === 'otherwise' ? 'otherwise' : nowDec.kind) + ')';
        dtext(g, fitT(lineA, L.iw - hw, small), L.ix + hw, nowY, small, th.text);
        var miss = null; for (var q2 = 0; q2 < tr.length; q2++) if ((tr[q2].state === 'unusable' || tr[q2].state === 'no') && tr[q2].i === ed.row) miss = tr[q2];
        var lineB = miss ? 'Rule ' + (miss.i + 1) + ' skipped: ' + miss.note : nowDec.reason ? 'Because ' + nowDec.reason : '';
        if (lineB && !L.compact) dtext(g, fitT(lineB, L.iw - hw, small), L.ix + hw, nowY + small.h + (cr ? 2 * sc : S * 0.3), small, miss ? th.bad : th.dim);
      }
      var help = ed.mode === 'edit' ? (cr ? '\u2190\u2192 FIELD  \u00b7  \u2191\u2193 CHANGE  \u00b7  Z OK  \u00b7  X BACK' : '\u2190 \u2192 field   \u2191 \u2193 change   Z ok   X back')
        : (cr ? '\u2191\u2193 ROW  \u00b7  Z EDIT  \u00b7  \u2190\u2192 UNIT  \u00b7  X CLOSE' : '\u2191 \u2193 row   Z edit   \u2190 \u2192 unit   X close   \u00b7   tap a cell to change it');
      if (flashMsg && T - flashMsg.t < 1200) help = flashMsg.m === 'full' ? 'Rule list is full' : flashMsg.m === 'undo' ? 'Preset undone' : flashMsg.m === 'preset' ? 'Preset applied: \u21b6 undo for 5 s' : help;
      if (!L.compact) dtext(g, fitT(help, L.iw, small), L.ix, L.y + L.h - L.pad - small.h, small, th.faint);
      g.restore();
      drawnRects.push({ kind: 'editor', x: L.x, y: L.y, w: L.w, h: L.h });
    }
    function drawCell(g, L, i, f, txt, ty, col, th) {
      var r = fieldRect(L, i, f); if (!r) return;
      var sel = ed.row === i && ed.mode === 'edit' && FIELDS[ed.field] === f;
      dtext(g, txt, r.x + (L.crisp ? L.sc : L.S * 0.15), ty, L.big, col);
      ed.hits.push(Object.assign({ kind: 'cell', row: i, f: f }, r));
      if (sel) drawFocus(g, L, r, th);
    }
    function drawFocus(g, L, r, th) {
      if (!r) return;
      if (L.crisp) {
        var sc = L.sc, blink = Math.floor(T / 260) % 2 === 0;
        g.fillStyle = blink ? th.accent : th.text;
        g.fillRect(r.x, r.y, r.w, sc); g.fillRect(r.x, r.y + r.h - 2 * sc, r.w, sc); g.fillRect(r.x, r.y, sc, r.h - sc); g.fillRect(r.x + r.w - sc, r.y, sc, r.h - sc);
        return;
      }
      var k = scaleOf(g); g.lineWidth = Math.max(1.5 / k, L.S * 0.12); rr(g, r.x + 1, r.y + 2, r.w - 2, r.h - 4, Math.round(L.S * 0.3));
      g.strokeStyle = rgba(th.accent, 0.75 + 0.25 * Math.sin(T / 160)); g.stroke();
    }

    /* ----- clock ----- */
    function update(dt) {
      try {
        dt = num(dt, 0); if (dt < 0) dt = 0; if (dt > 250) dt = 250;
        T += dt;
        whys = whys.filter(function (w) { return T - w.born < w.life; });
        placeAll();
        if (ed) {
          ed.sinceUpd = 0; ed.t += dt;
          if (ed.closing >= 0) { ed.closing += dt; if (ed.closing >= 140) closeEditor(ed.closeWhy); }
          else if (ed.auto && ed.t >= Math.max(300, +P.autoClose || 600)) startClose('auto');
        }
      } catch (e) { warnOnce(WARN, 'update', 'update failed', e); }
    }
    function draw(g) {
      drawnRects = [];
      if (!g) return;
      try {
        if (g.canvas) lastCanvas = { w: g.canvas.width, h: g.canvas.height };
        var k0 = cssK; readCss(g); if (k0 !== cssK && whys.length) { whys.forEach(function (w0) { w0.L = null; w0.x = null; }); placeAll(); }
        if (ed) ed.sinceUpd++;
        g.save();
        if (!ed && whys.length) {   // a UI rect that appeared after this step's update (a banner) moves or hides the plate now
          var uiNow = rectsFrom(o.uiRects, 'uiRects'), stale = false;
          for (var wi = 0; wi < whys.length && !stale; wi++) { var ww = whys[wi]; if (ww.x == null || ww.hidden || !ww.L) continue; for (var ui2 = 0; ui2 < uiNow.length; ui2++) if (overlap({ x: ww.x, y: ww.y, w: ww.L.w, h: ww.L.h }, uiNow[ui2], 0) > 0) { stale = true; break; } }
          if (stale) placeAll();
          drawTargets(g, whys[whys.length - 1]);
        }
        for (var i = 0; i < whys.length; i++) if (!ed) drawPlate(g, whys[i]);
        if (ed) { try { drawEditor(g); } finally { curS = 0; } }
        g.restore();
      } catch (e) { try { g.restore(); } catch (x) { } warnOnce(WARN, 'draw', 'draw failed', e); }
    }

    /* ----- book import / export ----- */
    function exportBook() { var out = {}; for (var k3 in book) out[k3] = copy(book[k3]); return out; }
    function importBook(obj) { if (!obj || typeof obj !== 'object') return false; for (var k4 in obj) book[k4] = normSet(obj[k4], conds), book[k4].preset = obj[k4] && obj[k4].preset || null; if (ed) refreshNow(); return true; }

    var api = {
      version: VERSION,
      decide: decide,
      explain: function (d) { return d && d.why ? d.why : ''; },
      snapshot: function (u) { try { return snapshot(u).snap; } catch (e) { warnOnce(WARN, 'snapshot', 'snapshot failed', e); return null; } },
      rulesFor: function (u) { return copy(setFor(u)); },
      setRules: function (u, set) { var key = keyOf(u); if (key == null) return false; book[key] = normSet(set, conds); book[key].preset = set && set.preset || null; if (ed) refreshNow(); return true; },
      applyPreset: applyPreset,
      presets: function () { return presetNames().map(function (n) { return { id: n, label: presetLabel(n) }; }); },
      presetFor: function (name, u) { return copy(presetSet(name, u)); },
      exportBook: exportBook, importBook: importBook,
      resetRules: function (u) { if (u == null) book = {}; else delete book[keyOf(u)]; if (ed) refreshNow(); },
      openEditor: openEditor, closeEditor: function (why) { closeEditor(why || 'host'); },
      busy: function () { return !!ed; }, isOpen: function () { return !!ed; },
      key: key, pointer: pointer,
      showWhy: function (u, d) { if (u != null && d) showWhy(u, d); },
      lastFor: function (u) { var id = typeof u === 'object' ? uid(u) : u; return lastByUnit[String(id)] || null; },
      clearWhy: function () { whys = []; },
      update: update, draw: draw,
      rects: function () { var out = []; whys.forEach(function (w) { if (w.x != null && w.L) out.push({ x: w.x, y: w.y, w: w.L.w, h: w.L.h, id: w.id }); }); if (ed) { var L = edL; if (!L) { L = edLayout(); curS = 0; } out.push({ x: L.x, y: L.y, w: L.w, h: L.h }); } return out; },
      lastDrawn: function () { return drawnRects.slice(); },
      setParams: function (p) { if (p) for (var k5 in p) if (p[k5] != null) P[k5] = p[k5]; MC = {}; edL = null; whys.forEach(function (w) { w.L = null; w.x = null; }); placeAll(); },
      params: function () { var c2 = {}; for (var k6 in P) c2[k6] = P[k6]; return c2; },
      stats: function () { var c3 = {}; for (var k7 in stats) c3[k7] = stats[k7]; c3.open = !!ed; c3.whysOnScreen = whys.length; return c3; },
      state: function () { return { t: T, open: !!ed, unit: ed ? uid(edUnit()) : null, row: ed ? ed.row : null, mode: ed ? ed.mode : null, field: ed ? FIELDS[ed.field] : null, whys: whys.map(function (w) { return { id: w.id, rule: w.d.rule, action: w.d.action, x: w.x, y: w.y }; }) }; },
      editorHits: function () { return ed && ed.hits ? ed.hits.map(function (h) { return { kind: h.kind, row: h.row, f: h.f, i: h.i, dir: h.dir, x: h.x, y: h.y, w: h.w, h: h.h }; }) : []; },
      editorLayout: function () { return ed && edL ? { x: edL.x, y: edL.y, w: edL.w, h: edL.h, S: edL.S, rowH: edL.rowH, rows: edL.rows, scroll: edL.scroll, barY: edL.barY, barH: edL.barH, nowY: edL.nowY, cssK: cssK } : null; },
      conditions: function () { return condIds().map(function (id) { var d = conds[id]; return { id: id, label: d.label, n: d.n || null, tag: !!d.tag, side: d.side || null }; }); }
    };
    return api;
  }

  root.GameDNA_TacticRules = {
    version: VERSION,
    create: create,
    evaluate: function (set, snap, opt) { return evaluate(set, snap, opt); },
    describe: function (rule, opt) { opt = opt || {}; var conds = condsWith(opt.conditions); return condText(normRule(rule, conds), conds, opt.resLabel); },
    normalize: function (set, opt) { return normSet(set, condsWith(opt && opt.conditions)); },
    preset: function (name, actions, tags) { return normSet(resolvePreset(PRESETS[name], actions, tags), CONDITIONS); },
    conditions: CONDITIONS, picks: PICKS, presets: PRESETS, defaults: DEFAULTS
  };
})(typeof window !== 'undefined' ? window : this);
