
  /* =================================================================================================
     The instance: battle flow (a queue of timed steps), input, bot, layout and drawing. */
  var SWAP_MS = 170, POP_MS = 250, ACC = 70, VMAX = 15;      // fall: cells / s^2, cells / s (at most 0.25 cell per frame)
  var DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }

  /* layouts: the module draws on a base stage (wide 960 x 540, tall 540 x 960) fitted into options.view */
  function makeLayout(mode) {
    var L = { mode: mode };
    if (mode === 'tall') {
      L.W = 540; L.H = 960; L.font = 16;
      L.top = { x: 12, y: 8, w: 516, h: 38 };
      L.stage = { x: 12, y: 52, w: 516, h: 246 };
      L.cards = []; for (var i = 0; i < 4; i++) L.cards.push({ x: 12 + i * 131, y: 306, w: 123, h: 100 });
      L.party = { x: 12, y: 414, w: 516, h: 34 };
      L.info = null;
      L.cell = 61; L.board = { x: 18, y: 456, w: 504, h: 504 };
    } else {
      L.W = 960; L.H = 540; L.font = 13;
      L.top = { x: 12, y: 8, w: 456, h: 34 };
      L.stage = { x: 12, y: 48, w: 456, h: 282 };
      L.cards = []; for (var j = 0; j < 4; j++) L.cards.push({ x: 12 + j * 116, y: 338, w: 108, h: 104 });
      L.party = { x: 12, y: 450, w: 456, h: 38 };
      L.info = { x: 12, y: 496, w: 456, h: 34 };
      L.cell = 56; L.board = { x: 484, y: 38, w: 464, h: 464 };
    }
    L.inner = { x: L.board.x + 8, y: L.board.y + 8, w: L.cell * 8, h: L.cell * 8 };
    L.ground = L.stage.y + L.stage.h * (mode === 'tall' ? 0.84 : 0.85);
    L.heroH = L.stage.h * (mode === 'tall' ? 0.31 : 0.3);
    return L;
  }

  function create(opt) {
    opt = opt || {};
    var P = merge(DEFAULTS, opt.params);
    var lib = { gems: opt.gems || merge(GEMS, {}), heroes: opt.heroes || merge(HEROES, {}), skills: opt.skills || merge(SKILLS, {}), enemies: opt.enemies || merge(ENEMIES, {}) };
    var view = opt.view || { x: 0, y: 0, w: 960, h: 540 };
    var S = null, L = null, cache = new GemCache(), ended = false, autoOn = false;
    var self = {};

    function ev(e) { e.turn = S ? S.turn : 0; e.t = S ? Math.round(S.ms) : 0; if (S && S.log) S.log.push(e); if (S && e.kind !== 'idle' && e.kind !== 'fall') { S.recent.push(e.kind + (e.sp ? ':' + e.sp : e.skill ? ':' + e.skill : e.special ? ':' + e.special : '') + '@' + e.t); if (S.recent.length > 10) S.recent.shift(); } try { if (opt.onEvent) opt.onEvent(e); } catch (x) { if (root.console) console.error(x); } }
    function layoutMode() { var m = P.layout; if (m === 'wide' || m === 'tall') return m; return view.w / view.h >= 1.15 ? 'wide' : 'tall'; }
    function fit() { L = makeLayout(layoutMode()); var s = Math.min(view.w / L.W, view.h / L.H); L.s = s; L.ox = view.x + (view.w - L.W * s) / 2; L.oy = view.y + (view.h - L.H * s) / 2; }
    fit();
    function toHost(r) { return { x: L.ox + r.x * L.s, y: L.oy + r.y * L.s, w: r.w * L.s, h: r.h * L.s }; }
    function toStage(x, y) { return { x: (x - L.ox) / L.s, y: (y - L.oy) / L.s }; }
    function cellXY(idx) { var C = P.cols; return { x: L.inner.x + (idx % C + 0.5) * L.cell, y: L.inner.y + (Math.floor(idx / C) + 0.5) * L.cell }; }

    /* ---------- battle state ---------- */
    function start(o) {
      o = o || {};
      ended = false;
      var seed = (num(o.seed, opt.seed || 1) >>> 0) || 1;
      S = { seed: seed, rb: rng(seed * 7 + 11), rf: rng(seed * 13 + 5), rbot: rng(seed * 3 + 1), ms: 0, turn: 0, chain: 0, maxChain: 0, tally: {}, counts: {},
        q: [], cur: null, phase: 'intro', waves: (o.waves || [['slime', 'slime']]).map(function (w) { return w.slice(); }), wave: -1, name: o.name || '', stage: o.stage || '',
        heroes: [], foes: [], foeN: 0, party: { hp: 0, max: 0, ward: 0, shown: 0 }, target: null, sel: -1, cursor: { i: 27 }, cv: { x: 3, y: 3 }, drag: null,
        fx: { parts: [], beams: [], rings: [], shots: [], nums: [], orbs: [], banners: [], combo: null, shake: 0 }, idle: 0, hint: null, botQ: [], botT: 0,
        fromSkill: false, prefer: [], swap: null, recent: [], log: o.log ? [] : null, stats: { matches: 0, specials: 0, fired: 0, reshuffles: 0, skills: 0, maxChain: 0, kills: 0 } };
      var party = (o.party || P.party).filter(function (id) { return lib.heroes[id]; });
      party.forEach(function (id, i) { var d = lib.heroes[id]; S.heroes.push({ id: id, def: d, i: i, charge: 0, shown: 0, anim: null, flash: 0, ready: false }); S.party.max += d.hp; });
      S.party.hp = S.party.shown = S.party.max;
      S.b = R.make(P.cols, P.rows);
      R.fill(S.b, S.rb, lib.gems);
      S.b.cells.forEach(function (g, i) { setHome(g, i); g.y -= P.rows + 1 + (P.cols - i % P.cols) * 0.12; g.vy = 0; });
      S.cursor.i = Math.floor(P.rows / 2) * P.cols + Math.floor(P.cols / 2) - 1; var cc = cellRC(S.cursor.i); S.cv.x = cc.c; S.cv.y = cc.r;
      ev({ kind: 'battleStart', seed: seed, waves: S.waves.length, board: R.key(S.b), name: S.name });
      S.q.push({ kind: 'drop', dur: 1e9, tick: tickFall, end: null });
      S.q.push(step('wave', 0, function () { nextWave(); }));
      return self;
    }
    function cellRC(i) { return { r: Math.floor(i / P.cols), c: i % P.cols }; }
    function setHome(g, i) { var rc = cellRC(i); g.x = rc.c; g.y = rc.r; g.vy = 0; g.pop = -1; g.land = 0; g.glow = 0; }
    function step(kind, dur, start, end, tick) { return { kind: kind, dur: dur, start: start, end: end, tick: tick }; }
    function now(list) { S.q = list.concat(S.q); }
    function living() { return S.foes.filter(function (f) { return f.hp > 0; }); }

    function spawnFoe(key, slot, n) {
      var d = lib.enemies[key]; if (!d) return null;
      var f = { id: 'f' + (++S.foeN), key: key, def: d, hp: d.hp, max: d.hp, cd: num(d.first, d.every || 2), slot: slot, n: n, enter: 0, dead: 0, anim: null, flash: 0, attacks: 0, shownHp: d.hp };
      S.foes.push(f); ev({ kind: 'spawn', foe: f.id, enemy: key, hp: f.hp, wave: S.wave + 1 });
      return f;
    }
    function nextWave() {
      S.wave++;
      S.foes = S.foes.filter(function (f) { return f.hp > 0; });
      var list = S.waves[S.wave] || [];
      list.forEach(function (k, i) { spawnFoe(k, i, list.length); });
      S.target = (living()[0] || {}).id || null;
      banner('WAVE ' + (S.wave + 1) + ' / ' + S.waves.length, list.map(function (k) { return (lib.enemies[k] || {}).name || k; }).join(', '), '#ffe7a8');
      ev({ kind: 'waveStart', wave: S.wave + 1, foes: list.slice() });
      now([step('enter', 750, null, function () { S.foes.forEach(function (f) { f.enter = 1; }); }, function (c, k) { S.foes.forEach(function (f) { if (f.enter < 1) f.enter = Math.max(f.enter, k); }); }),
        step('ready', 0, function () { toIdle(); })]);
    }
    function toIdle() {
      S.phase = 'idle'; S.idle = 0; S.hint = null; S.botT = 0; S.botQ = []; S.fromSkill = false;
      if (!R.moves(S.b).length) { now([reshuffleStep(), step('ready', 0, function () { toIdle(); })]); S.phase = 'busy'; return; }
      ev({ kind: 'idle', board: R.key(S.b), rng: S.rb.state(), hp: S.party.hp, cells: S.log ? S.b.cells.map(function (g) { return g ? [g.t, g.sp] : null; }) : undefined, nextId: S.b.nextId });
    }

    /* ---------- the turn: swap -> resolve (cascades) -> heroes -> foes ---------- */
    function trySwap(i, j) {
      if (S.phase !== 'idle' || !R.adjacent(S.b, i, j) || !S.b.cells[i] || !S.b.cells[j]) return false;
      var ok = R.valid(S.b, i, j);
      S.phase = 'busy'; S.sel = -1; S.drag = null; S.hint = null;
      ev({ kind: 'swap', a: i, b: j, valid: ok });
      var A = S.b.cells[i], B = S.b.cells[j];
      var anim = function (from, to) { return function (c, k) { var u = ease(k), pa = cellRC(from), pb = cellRC(to); A.x = lerp(pa.c, pb.c, u); A.y = lerp(pa.r, pb.r, u); B.x = lerp(pb.c, pa.c, u); B.y = lerp(pb.r, pa.r, u); }; };
      S.swap = { a: A.id, b: B.id };
      if (!ok) {
        now([step('swap', SWAP_MS, null, null, anim(i, j)), step('swapBack', SWAP_MS, null, function () { setHome(A, i); setHome(B, j); S.swap = null; S.phase = 'idle'; }, anim(j, i))]);
        return true;
      }
      now([step('swap', SWAP_MS, null, function () {
        S.b.cells[i] = B; S.b.cells[j] = A; setHome(A, j); setHome(B, i); S.swap = null;
        S.turnStart = { board: null }; S.chain = 0; S.tally = {}; S.counts = {}; S.prefer = [j, i];
        var spA = A.sp, spB = B.sp;
        if (spA === 'prism' || spB === 'prism') now([prismStep(j, i)]);
        else if (spA && spB) { var cl = {}; cl[i] = 1; cl[j] = 1; now([clearStep(cl, [], 'combo')]); }
        else now([resolveStep()]);
      }, anim(i, j))]);
      return true;
    }
    function weightOf(chain) { return 1 + num(P.combo, 0.25) * (chain - 1); }
    function tallyGem(g, chain) { var t = R.colour(g); if (!t) return; S.tally[t] = (S.tally[t] || 0) + weightOf(chain); S.counts[t] = (S.counts[t] || 0) + 1; }
    function resolveStep() {
      return step('resolve', 0, function () {
        var groups = R.groups(S.b, S.prefer, P.specials !== 'off'); S.prefer = [];
        if (!groups.length) { now([settledStep()]); return; }
        var clear = {}, makes = [];
        groups.forEach(function (gp) { gp.cells.forEach(function (i) { clear[i] = 1; }); if (gp.make) makes.push({ idx: gp.make.idx, sp: gp.make.sp, t: gp.t }); });
        S.stats.matches += groups.length;
        ev({ kind: 'match', chain: S.chain + 1, groups: groups.map(function (gp) { return { t: gp.t, n: gp.cells.length, make: gp.make ? gp.make.sp : null }; }) });
        now([clearStep(clear, makes, 'match')]);
      });
    }
    function prismStep(i, j) {
      return step('prism', 0, function () {
        var res = R.prismSwap(S.b, i, j);
        ev({ kind: 'prism', at: S.b.cells[i] && S.b.cells[i].sp === 'prism' ? i : j, with: (S.b.cells[S.b.cells[i].sp === 'prism' ? j : i] || {}).t });
        res.turn.forEach(function (q) { var g = S.b.cells[q.idx]; if (g) { g.sp = q.sp; g.glow = 1; } });
        var pi = S.b.cells[i].sp === 'prism' ? i : j, pc = cellXY(pi);
        S.fx.rings.push({ x: pc.x, y: pc.y, t: 0, dur: 700, r0: L.cell * 0.4, r1: L.cell * 4, c: '#ffffff', w: 6 });
        var spent = {}; spent[pi] = 1; if (S.b.cells[i].sp === 'prism' && S.b.cells[j].sp === 'prism') { spent[i] = 1; spent[j] = 1; }
        now([step('prismCharge', res.turn.length ? 380 : 120), clearStep(res.clear, [], 'prism', spent)]);
      });
    }
    /* clears a set (specials inside it fire), leaves the new specials, then gravity and the next resolve */
    function clearStep(clear, makes, why, spent) {
      return step('clear', 0, function () {
        S.chain++; S.maxChain = Math.max(S.maxChain, S.chain); S.stats.maxChain = Math.max(S.stats.maxChain, S.chain);
        var keep = {}; makes.forEach(function (m) { keep[m.idx] = 1; });
        var order = Object.keys(lib.gems);
        var fired = R.expand(S.b, clear, keep, order, spent);
        makes.forEach(function (m) { delete clear[m.idx]; });
        fired.forEach(function (f) {
          S.stats.fired++; ev({ kind: 'fire', sp: f.sp, at: f.idx, t: f.t, cells: f.cells.length });
          var p = cellXY(f.idx);
          if (f.sp === 'h') S.fx.beams.push({ x: L.inner.x, y: p.y, w: L.inner.w, h: L.cell * 0.5, horiz: true, t: 0, dur: 420, c: (lib.gems[f.t] || {}).colors });
          else if (f.sp === 'v') S.fx.beams.push({ x: p.x, y: L.inner.y, w: L.cell * 0.5, h: L.inner.h, horiz: false, t: 0, dur: 420, c: (lib.gems[f.t] || {}).colors });
          else if (f.sp === 'bomb') S.fx.rings.push({ x: p.x, y: p.y, t: 0, dur: 520, r0: L.cell * 0.3, r1: L.cell * 1.9, c: '#ffd88a', w: 8 });
          else S.fx.rings.push({ x: p.x, y: p.y, t: 0, dur: 600, r0: L.cell * 0.3, r1: L.cell * 3, c: '#ffffff', w: 5 });
        });
        var list = Object.keys(clear).map(Number).filter(function (i) { return S.b.cells[i]; }).sort(function (a, b) { return a - b; });
        list.forEach(function (i) { var g = S.b.cells[i]; tallyGem(g, S.chain); g.pop = 0; });
        makes.forEach(function (m) { var g = S.b.cells[m.idx]; if (!g) return; S.stats.specials++; ev({ kind: 'special', sp: m.sp, at: m.idx, t: m.t }); });
        if (S.chain >= 2) { S.fx.combo = { n: S.chain, t: 0 }; ev({ kind: 'cascade', chain: S.chain }); }
        ev({ kind: 'clear', chain: S.chain, n: list.length, why: why, cells: list.slice() });
        orbsFrom(list);
        now([step('pop', POP_MS, function () {
          makes.forEach(function (m) { var g = S.b.cells[m.idx]; if (!g) return; if (m.sp === 'prism') { g.t = 'prism'; } g.sp = m.sp; g.glow = 1; var p = cellXY(m.idx); S.fx.rings.push({ x: p.x, y: p.y, t: 0, dur: 380, r0: L.cell * 0.2, r1: L.cell * 0.9, c: '#fff6c8', w: 4 }); });
          list.forEach(function (i) { var g = S.b.cells[i]; burst(cellXY(i), (lib.gems[g.t] || PRISM).colors, 5); });
        }, function () {
          list.forEach(function (i) { S.b.cells[i] = null; });
          chargeFrom(S.counts); S.counts = {};
        }, function (c, k) { list.forEach(function (i) { var g = S.b.cells[i]; if (g) g.pop = k; }); }),
        fallStep(), resolveStep()]);
      });
    }
    function chargeFrom(counts) {
      S.heroes.forEach(function (h) {
        var n = counts[h.def.gem] || 0, sk = lib.skills[h.def.skill]; if (!n || !sk) return;
        var was = h.charge >= sk.cost; h.charge = Math.min(sk.cost, h.charge + n);
        if (!was && h.charge >= sk.cost) { ev({ kind: 'skillReady', hero: h.id, skill: h.def.skill }); }
      });
    }
    function fallStep() {
      return step('fall', 1e9, function () {
        var gr = R.gravity(S.b, S.rb, lib.gems);
        gr.spawns.forEach(function (s) { var g = s.gem, rc = cellRC(s.to); g.x = rc.c; g.y = rc.r - s.above - 0.15 * (P.rows - s.above); g.vy = 0; g.pop = -1; g.land = 0; g.glow = 0; });
        ev({ kind: 'fall', falls: gr.falls.length, spawns: gr.spawns.length, types: gr.spawns.map(function (s) { return s.gem.t; }) });
      }, null, tickFall);
    }
    function tickFall(c, k, dt) {
      var moving = false, s = dt / 1000;
      S.b.cells.forEach(function (g, i) {
        if (!g) return; var ty = Math.floor(i / P.cols), tx = i % P.cols; g.x = tx;
        if (g.y < ty - 1e-6) { g.vy = Math.min(VMAX, g.vy + ACC * s); g.y = Math.min(ty, g.y + g.vy * s); if (g.y >= ty - 1e-6) { g.y = ty; g.land = Math.min(1, g.vy / 8); g.vy = 0; } else moving = true; }
        else { g.y = ty; g.vy = 0; }
      });
      if (!moving) c.dur = c.t;
    }
    function settledStep() {
      return step('settled', 0, function () {
        ev({ kind: 'settle', chains: S.chain, board: R.key(S.b), tally: copy(S.tally) });
        var acts = [], t = S.tally; S.chain = 0;
        S.heroes.forEach(function (h) { var w = t[h.def.gem] || 0; if (w > 0 && h.def.atk) acts.push(heroAttackStep(h, w)); });
        Object.keys(t).forEach(function (gid) {
          var d = lib.gems[gid]; if (!d || !t[gid]) return;
          if (d.role === 'heal') acts.push(healStep(Math.round(S.party.max * num(d.power, 0.022) * t[gid]), gid));
          else if (d.role === 'strike') acts.push(strikeStep(gid, t[gid]));
          else if (d.role === 'ward') acts.push(step('ward', 300, function () { S.party.ward += Math.round(num(d.power, 4) * t[gid]); ev({ kind: 'ward', ward: S.party.ward, gem: gid }); }));
          if (d.onClear) acts.push(step('gem:' + gid, 300, function () { try { d.onClear(api, { gem: gid, count: Math.round(t[gid] * 100) / 100, weight: t[gid] }); } catch (x) { if (root.console) console.error(x); } }));
        });
        S.tally = {};
        acts.push(step('afterHeroes', 0, function () {
          if (!living().length) { now([waveClearStep()]); return; }
          if (S.fromSkill) { now([step('ready', 0, function () { toIdle(); })]); return; }
          now([foePhaseStep()]);
        }));
        now(acts);
      });
    }
    function targetFoe() { var f = S.foes.filter(function (x) { return x.id === S.target && x.hp > 0; })[0]; if (!f) { f = living()[0] || null; S.target = f ? f.id : null; } return f; }
    function hit(f, amount, src, kind) {
      if (!f || f.hp <= 0) return 0;
      amount = Math.max(1, Math.round(amount)); var before = f.hp; f.hp = Math.max(0, f.hp - amount); f.flash = 1;
      var a = self.anchor(f.id), killed = f.hp <= 0;
      if (killed) { f.dead = 0.0001; S.stats.kills++; }
      var h = { kind: 'damage', source: src, target: f.id, enemy: f.key, defender: f.key, attacker: src, amount: before - f.hp, raw: amount, hpBefore: before, hpAfter: f.hp, killed: killed, crit: kind === 'weak', weak: kind === 'weak', skill: kind === 'skill', x: a ? a.x : 0, y: a ? a.top : 0 };
      if (P.numbers !== 'off') number(f.id, String(h.amount), kind === 'weak' ? '#ffd23a' : '#ffffff', kind === 'weak' ? 1.2 : 1, h.amount);
      try { if (opt.onHit) opt.onHit(h); } catch (x) { if (root.console) console.error(x); }
      if (killed) { ev({ kind: 'death', foe: f.id, enemy: f.key }); if (S.target === f.id) { var nx = living()[0]; S.target = nx ? nx.id : null; } }
      return h.amount;
    }
    function heroAttackStep(h, w) {
      var dur = h.def.attack === 'leap' ? 640 : 560, impact = h.def.attack === 'leap' ? 0.5 : 0.55, done = false, tgt = null, amount = 0;
      return step('heroAttack', dur, function (c) {
        tgt = targetFoe(); if (!tgt) { c.dur = 0; return; }
        var weak = tgt.def.weak === h.def.gem;
        amount = h.def.atk * w / 3 * (weak ? num(P.weakMult, 1.5) : 1);
        h.anim = { kind: h.def.attack || 'leap', t: 0, dur: dur, target: tgt.id, impact: impact };
        ev({ kind: 'heroAttack', hero: h.id, foe: tgt.id, weight: Math.round(w * 100) / 100, weak: weak });
      }, function () { h.anim = null; }, function (c, k) {
        if (!tgt) return; if (h.anim) h.anim.t = c.t;
        if (!done && k >= impact) { done = true; var weak = tgt.def.weak === h.def.gem; hit(tgt, amount, h.id, weak ? 'weak' : 'hit'); impactFx(tgt, h.def.attack, (lib.gems[h.def.gem] || {}).colors); }
      });
    }
    function healStep(n, gid) {
      var done = false;
      return step('heal', 520, null, null, function (c, k) {
        if (done || k < 0.35) return; done = true;
        var before = S.party.hp; S.party.hp = Math.min(S.party.max, S.party.hp + n); var got = S.party.hp - before;
        ev({ kind: 'heal', amount: got, hp: S.party.hp, gem: gid });
        try { if (opt.onHit) opt.onHit({ kind: 'heal', source: gid, target: 'party', amount: got, hpBefore: before, hpAfter: S.party.hp, killed: false, x: self.anchor('party').x, y: self.anchor('party').top }); } catch (x) { }
        if (P.numbers !== 'off' && got > 0) number('party', '+' + got, '#8cff9a', 1, got, '+');
        S.heroes.forEach(function (hh) { var a = heroPos(hh); for (var q = 0; q < 4; q++) S.fx.parts.push({ x: a.x + (S.rf() - 0.5) * 30, y: a.footY - S.rf() * a.h * 0.8, vx: (S.rf() - 0.5) * 20, vy: -40 - S.rf() * 50, life: 900, t: 0, c: '#9cffb0', s: 3, kind: 'plus' }); });
      });
    }
    function strikeStep(gid, w) {
      var done = false, d = lib.gems[gid];
      return step('strike', 420, null, null, function (c, k) { if (done || k < 0.5) return; done = true; var f = targetFoe(); if (f) { hit(f, num(d.power, 3) * w, gid, 'strike'); impactFx(f, 'bolt', d.colors); } });
    }
    function foePhaseStep() {
      return step('foes', 0, function () {
        S.turn++;
        var acts = [];
        living().forEach(function (f) { f.cd--; if (f.cd <= 0) acts.push(foeAttackStep(f)); });
        ev({ kind: 'foeTurn', turn: S.turn, cds: living().map(function (f) { return f.cd; }) });
        acts.push(step('turnEnd', 0, function () { if (S.party.hp <= 0) { now([endStep('lose')]); return; } now([step('ready', 0, function () { toIdle(); })]); }));
        now(acts);
      });
    }
    function frontHero(f) { var alive = S.heroes, k = f.def.attack || 'leap'; if (k === 'leap' || k === 'swoop' || k === 'slam') return alive[0]; return alive[(f.n * 3 + f.slot + S.turn) % alive.length]; }   // melee foes strike the front hero; bolts strike anyone
    function foeAttackStep(f) {
      var kind = f.def.attack || 'leap', dur = kind === 'slam' ? 1300 : kind === 'swoop' ? 820 : kind === 'leap' ? 760 : 720, impact = kind === 'slam' ? 0.6 : kind === 'bolt' ? 0.6 : 0.55, windup = kind === 'slam' ? 0.5 : 0.38, done = false, victim = null, mult = 1, sp = null;
      return step('foeAttack', dur, function (c) {
        if (f.hp <= 0 || S.party.hp <= 0) { c.dur = 0; return; }
        f.attacks++; sp = f.def.special && f.attacks % (f.def.special.every || 2) === 0 ? f.def.special : null; mult = sp ? num(sp.mult, 1.5) : 1;
        victim = frontHero(f);
        if (sp) banner(f.def.name + ': ' + sp.name + '!', '', '#ff9a8a');
        f.anim = { kind: kind, t: 0, dur: dur, target: victim.id, impact: impact, windup: windup };
        ev({ kind: 'foeAttack', foe: f.id, enemy: f.key, hero: victim.id, special: sp ? sp.name : null });
      }, function () { f.anim = null; f.cd = f.def.every || 2; }, function (c, k) {
        if (f.anim) f.anim.t = c.t;
        if (done || k < impact || !victim) return; done = true;
        var dmg = Math.round(f.def.atk * mult), ward = Math.min(S.party.ward, dmg), before = S.party.hp; S.party.ward -= ward;
        S.party.hp = Math.max(0, S.party.hp - (dmg - ward)); victim.flash = 1; victim.hurt = 1;
        var got = before - S.party.hp;
        ev({ kind: 'partyHit', foe: f.id, hero: victim.id, raw: dmg, ward: ward, amount: got, hp: S.party.hp });
        var a = self.anchor(victim.id);
        try { if (opt.onHit) opt.onHit({ kind: 'damage', source: f.id, attacker: f.key, target: victim.id, defender: 'party', amount: got, raw: dmg, ward: ward, hpBefore: before, hpAfter: S.party.hp, killed: S.party.hp <= 0, crit: !!sp, x: a.x, y: a.top }); } catch (x) { }
        if (P.numbers !== 'off') number(victim.id, ward && !got ? 'Blocked' : String(got), ward && !got ? '#a8d8ff' : '#ff6a5a', sp ? 1.2 : 1, ward && !got ? null : got);
        S.fx.shake = Math.max(S.fx.shake, kind === 'slam' ? 16 : 7); S.stop = Math.max(S.stop || 0, kind === 'slam' ? 70 : 40);
        var vp0 = heroPos(victim), melee = kind === 'leap' || kind === 'swoop' || kind === 'slam', fb = melee ? strikeBox(f) : null;
        S.fx.rings.push({ x: vp0.x, y: vp0.footY, t: 0, dur: kind === 'slam' ? 600 : 400, r0: 10, r1: kind === 'slam' ? 110 : 55, c: 'rgba(214,186,140,0.5)', w: kind === 'slam' ? 4 : 3, stage: true, flat: true, back: true });
        for (var pz = 0; pz < (kind === 'slam' ? 7 : 4); pz++) S.fx.parts.push({ x: vp0.x + (pz - 3) * L.heroH * 0.13 + (S.rf() - 0.5) * 8, y: vp0.footY - 2, vx: (pz - 3) * 18, vy: -8 - S.rf() * 10, life: 700, t: 0, c: '#cdb48c', s: L.heroH * (kind === 'slam' ? 0.16 : 0.1), kind: 'puff', g: 0, stage: true, back: true });
        if (fb) S.fx.shots.push({ kind: 'contact', x: fb.x + fb.w * 0.3, y: fb.y + fb.h * 0.5, t: 0, dur: 170, c: '#ffd890' });
        if (kind === 'slam') { var fp1 = foePos(f); for (var dz = 0; dz < 6; dz++) S.fx.parts.push({ x: fp1.x - fp1.h * 0.3 + (dz - 2.5) * fp1.h * 0.12, y: fp1.footY - 2, vx: (dz - 2.5) * 22, vy: -10 - S.rf() * 12, life: 800, t: 0, c: '#c8ac80', s: fp1.h * 0.12, kind: 'puff', g: 0, stage: true, back: true }); }
        impactFx({ hero: victim }, f.def.attack, null, f.def.boltColor);
      });
    }
    function waveClearStep() {
      return step('waveClear', 900, function () { ev({ kind: 'waveClear', wave: S.wave + 1 }); }, function () {
        if (S.wave + 1 < S.waves.length) now([step('wave', 0, function () { nextWave(); })]);
        else now([endStep('win')]);
      });
    }
    function endStep(result) {
      return step('end', 0, function () {
        if (ended) return; ended = true; S.phase = 'end';
        if (result === 'win') banner('VICTORY', S.name, '#ffd25a'); else banner('DEFEAT', 'The party falls', '#ff7a6a');
        var info = { turns: S.turn, hp: S.party.hp, max: S.party.max, kills: S.stats.kills, maxChain: S.stats.maxChain, specials: S.stats.specials, skills: S.stats.skills };
        ev({ kind: 'end', result: result, info: info });
        try { if (opt.onEnd) opt.onEnd(result, info); } catch (x) { if (root.console) console.error(x); }
      });
    }
    function reshuffleStep() {
      var from = {};
      return step('reshuffle', 950, function () {
        S.stats.reshuffles++; banner('NO MOVES', 'The board reshuffles', '#bfe4ff');
        S.b.cells.forEach(function (g) { if (g) from[g.id] = { x: g.x, y: g.y }; });
        var r = R.reshuffle(S.b, S.rb, lib.gems);
        S.b.cells.forEach(function (g, i) { if (g.recolor) { g.recolor = 0; g.glow = 1; } if (!from[g.id]) { setHome(g, i); g.y -= P.rows + 1; from[g.id] = { x: g.x, y: g.y }; } });
        ev({ kind: 'reshuffle', tries: r, board: R.key(S.b) });
      }, function () { S.b.cells.forEach(function (g, i) { setHome(g, i); }); }, function (c, k) {
        var u = ease(clamp((k - 0.2) / 0.7, 0, 1));
        S.b.cells.forEach(function (g, i) { var f = from[g.id], rc = cellRC(i), cx = (P.cols - 1) / 2, cy = (P.rows - 1) / 2; var mx = lerp(f.x, cx, 0.5), my = lerp(f.y, cy, 0.5);
          // a curve through a point pulled to the middle: gems swirl in and out, never jump
          g.x = (1 - u) * (1 - u) * f.x + 2 * u * (1 - u) * mx + u * u * rc.c; g.y = (1 - u) * (1 - u) * f.y + 2 * u * (1 - u) * my + u * u * rc.r; });
      });
    }
    /* ---------- skills ---------- */
    var api = {
      damage: function (target, amount, src) { var fs = target === 'all' ? living() : [target && target.id ? target : targetFoe()]; fs.forEach(function (f) { hit(f, amount, src || 'skill', 'skill'); }); },
      heal: function (n) { var b = S.party.hp; S.party.hp = Math.min(S.party.max, S.party.hp + Math.round(n)); ev({ kind: 'heal', amount: S.party.hp - b, hp: S.party.hp }); if (P.numbers !== 'off' && S.party.hp > b) number('party', '+' + (S.party.hp - b), '#8cff9a', 1, S.party.hp - b, '+'); },
      ward: function (n) { S.party.ward += Math.round(n); ev({ kind: 'ward', ward: S.party.ward }); },
      delay: function (n) { living().forEach(function (f) { f.cd += n; }); ev({ kind: 'delay', turns: n }); },
      convert: function (to, count, from) { return convert(to, count, from); },
      make: function (sp, count) { return makeSpecials(sp, count); },
      foes: function () { return living(); }, target: function () { return targetFoe(); }, party: function () { return S.party; }, heroes: function () { return S.heroes; },
      board: function () { return S.b; }, rng: function () { return S.rb(); }, banner: function (a, b, c) { banner(a, b, c); }
    };
    function randomCells(count, ok) {
      var cand = []; S.b.cells.forEach(function (g, i) { if (g && !g.sp && ok(g)) cand.push(i); });
      var out = []; while (out.length < count && cand.length) { var k = Math.floor(S.rb() * cand.length); out.push(cand.splice(k, 1)[0]); }
      return out.sort(function (a, b) { return a - b; });
    }
    function convert(to, count, from) {
      if (!lib.gems[to]) return [];
      var cells = randomCells(count, function (g) { return g.t !== to && (!from || g.t === from); });
      cells.forEach(function (i) { var g = S.b.cells[i]; g.from = g.t; g.t = to; g.glow = 1; burst(cellXY(i), lib.gems[to].colors, 4); });
      ev({ kind: 'convert', to: to, cells: cells.slice() });
      return cells;
    }
    function makeSpecials(sp, count) {
      var cells = randomCells(count, function () { return true; });
      cells.forEach(function (i) { var g = S.b.cells[i]; if (sp === 'prism') g.t = 'prism'; g.sp = sp; g.glow = 1; });
      ev({ kind: 'make', sp: sp, cells: cells.slice() });
      return cells;
    }
    function castSkill(hi) {
      var h = S.heroes[hi]; if (!h || S.phase !== 'idle') return false;
      var sk = lib.skills[h.def.skill]; if (!sk || h.charge < sk.cost) return false;
      S.phase = 'busy'; S.sel = -1; h.charge = 0; S.stats.skills++; S.fromSkill = true; S.chain = 0; S.tally = {}; S.counts = {};
      ev({ kind: 'skill', hero: h.id, skill: h.def.skill, name: sk.name });
      banner(sk.name.toUpperCase(), h.def.name, '#fff0b8');
      var done = false;
      now([step('skill', 900, function () { h.anim = { kind: 'cast', t: 0, dur: 900, impact: 0.5, fx: sk.fx || 'burst' }; skillFx(h, sk, 0); }, function () { h.anim = null; }, function (c, k) {
        if (h.anim) h.anim.t = c.t;
        if (done || k < 0.5) return; done = true; skillFx(h, sk, 1);
        if (sk.run) { try { sk.run(api, h); } catch (x) { if (root.console) console.error(x); } }
        (sk.effects || []).forEach(function (e) {
          if (e.damage) { var amt = h.def.atk * e.damage; if (e.target === 'all') living().forEach(function (f) { hit(f, amt, h.id, 'skill'); }); else hit(targetFoe(), amt, h.id, 'skill'); }
          if (e.heal) api.heal(S.party.max * e.heal);
          if (e.ward) api.ward(e.ward);
          if (e.delay) api.delay(e.delay);
          if (e.convert) convert(e.convert.to, e.convert.count || 3, e.convert.from);
          if (e.make) makeSpecials(e.make.sp, e.make.count || 1);
        });
      }), step('skillSettle', 260), resolveStep()]);
      return true;
    }

    /* ---------- effects (all advanced in update, so ?t= stills are exact) ---------- */
    function burst(p, cols, n) { cols = cols || ['#444', '#aaa', '#fff', '#fff']; for (var i = 0; i < n; i++) { var a = S.rf() * TAU, sp = 60 + S.rf() * 140; S.fx.parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 380 + S.rf() * 260, t: 0, c: i % 2 ? cols[2] : cols[3], s: 2 + S.rf() * 2.5, kind: i % 3 ? 'dot' : 'star', g: 260 }); } }
    function orbsFrom(list) {
      list.forEach(function (i) { var g = S.b.cells[i]; if (!g) return; var hi = -1; S.heroes.forEach(function (h, k) { if (h.def.gem === g.t) hi = k; });
        if (hi >= 0 || (lib.gems[g.t] && lib.gems[g.t].role === 'heal')) S.fx.orbs.push({ from: i, hero: hi, t: -((i * 37) % 90), dur: 520, c: lib.gems[g.t].colors }); });
    }
    /* numbers: hits on one owner within 0.8 s roll into one total (it re-pops in place, never a second number on top);
       otherwise a new number takes the next free slot above its owner's other numbers */
    function number(owner, text, color, scale, val, pre) {
      var hit = null; S.fx.nums.forEach(function (n) { if (n.owner === owner && n.val != null && val != null && n.pre === (pre || '') && n.t < 800) hit = n; });
      if (hit) { hit.val += val; hit.text = hit.pre + hit.val; hit.p = 0; hit.dur = Math.max(hit.dur, hit.t + 900); if ((scale || 1) > hit.s) { hit.s = scale; hit.c = color; } return; }
      // the owner's older numbers glide up one row (eased, ~3 frames) and the new one fades in at the base
      S.fx.nums.forEach(function (n) { if (n.owner === owner) n.pushT = (n.pushT || 0) + L.font + 16; });
      S.fx.nums.push({ owner: owner, text: text, c: color, s: scale || 1, t: 0, p: 0, dur: 1100, slot: 0, push: 0, pushT: 0, val: val == null ? null : val, pre: pre || '' });
    }
    function numPos(n) {
      var a = self.anchor(n.owner); if (!a) return null; var F = L.font, k = n.t / n.dur, pop = 1 + 0.35 * (1 - easeOut(n.p / 160)), rise = easeOut(k) * 26;
      var top = (a.top - L.oy) / L.s, x = (a.x - L.ox) / L.s, y = Math.max(L.stage.y + 16, top - 8 - rise - (n.push || 0));
      if (n.owner === 'party') { x = L.party.x + L.party.w * 0.5; y = L.party.y - 10 - rise; }
      x = clamp(x, L.stage.x + 24, L.stage.x + L.stage.w - 24);
      var sz = (F + 6) * pop * n.s, w = n.text.length * sz * 0.62 + 8;
      return { x: x, y: y, k: k, sc: pop * n.s, alpha: Math.min(clamp(n.t / 120, 0, 1), k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1), box: { x: x - w / 2, y: y - sz * 0.6, w: w, h: sz * 1.2 } };
    }
    function banner(a, b, c) { S.fx.banners.push({ a: a, b: b || '', c: c || '#fff', t: 0, dur: 1300 }); }
    function impactFx(target, kind, cols, boltC) {
      var p;
      if (target.hero) { p = heroPos(target.hero); p = { x: p.x, y: p.footY - p.h * 0.5 }; } else { var a = foePos(target); p = { x: a.x, y: a.footY - a.h * 0.55 }; }
      var c = cols ? cols[2] : boltC || '#ffffff';
      if (!target.hero) S.fx.rings.push({ x: p.x, y: p.y, t: 0, dur: 300, r0: 6, r1: 34, c: c, w: 5, stage: true });   // a hero hit shows on the hero's rim, not as a disc over it
      for (var i = 0; i < (target.hero ? 0 : 7); i++) { var ang = S.rf() * TAU, sp = 80 + S.rf() * 160; S.fx.parts.push({ x: p.x, y: p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 30, life: 300 + S.rf() * 200, t: 0, c: i % 2 ? c : '#ffffff', s: 2 + S.rf() * 2, kind: 'dot', g: 200, stage: true }); }
      if (kind === 'leap' && !target.hero) S.fx.shots.push({ kind: 'slash', x: p.x, y: p.y, t: 0, dur: 260, c: c });
    }
    function skillFx(h, sk, phase) {
      var a = heroPos(h);
      if (phase === 0) { S.fx.rings.push({ x: a.x, y: a.footY - 4, t: 0, dur: 800, r0: 10, r1: 70, c: (lib.gems[h.def.gem] || {}).colors ? lib.gems[h.def.gem].colors[2] : '#fff', w: 4, stage: true, flat: true }); return; }
      var fx = sk.fx || 'burst';
      if (fx === 'arrows') living().forEach(function (f, k) { for (var q = 0; q < 5; q++) S.fx.shots.push({ kind: 'rain', foe: f.id, dx: (q - 2) * 9 + k, t: -q * 40, dur: 300, c: '#e8ffd0' }); });
      else if (fx === 'bloom') S.heroes.forEach(function (hh) { var p = heroPos(hh); for (var q = 0; q < 6; q++) S.fx.parts.push({ x: p.x + (S.rf() - 0.5) * 40, y: p.footY - S.rf() * p.h, vx: (S.rf() - 0.5) * 30, vy: -50 - S.rf() * 40, life: 1000, t: 0, c: '#b8ffd0', s: 3.5, kind: 'plus', stage: true }); });
      else if (fx === 'light') { S.fx.rings.push({ x: a.x, y: a.footY - a.h * 0.5, t: 0, dur: 700, r0: 20, r1: 220, c: '#fff2b0', w: 8, stage: true }); }
      else { var f0 = targetFoe(); if (f0) S.fx.shots.push({ kind: 'bigslash', foe: f0.id, t: 0, dur: 420, c: '#ffd8a0' }); }
    }
    function tickFx(dt) {
      var F = S.fx, s = dt / 1000;
      F.parts = F.parts.filter(function (p) { p.t += dt; p.x += p.vx * s; p.y += p.vy * s; p.vy += (p.g || 0) * s; return p.t < p.life; });
      F.beams = F.beams.filter(function (b) { b.t += dt; return b.t < b.dur; });
      F.rings = F.rings.filter(function (r) { r.t += dt; return r.t < r.dur; });
      F.shots = F.shots.filter(function (r) { r.t += dt; return r.t < r.dur; });
      F.orbs = F.orbs.filter(function (o) { o.t += dt; return o.t < o.dur; });
      F.nums = F.nums.filter(function (n) { n.t += dt; n.p += dt; n.push += ((n.pushT || 0) - n.push) * Math.min(1, dt / 30); return n.t < n.dur; });
      if (F.banners.length) { var b0 = F.banners[0]; b0.t += dt; if (F.banners.length > 1 && b0.t >= 700 && b0.dur > b0.t + 220) b0.dur = b0.t + 220; if (b0.t >= b0.dur) F.banners.shift(); }
      if (F.banners.length > 4) F.banners.splice(1, F.banners.length - 4);
      if (F.combo) { F.combo.t += dt; if (S.chain === 0 && F.combo.end == null) F.combo.end = Math.max(F.combo.t, 700); if (F.combo.end != null && F.combo.t > F.combo.end + 400) F.combo = null; }
      if (F.shake > 0) F.shake = Math.max(0, F.shake - dt * 0.03);
      S.heroes.forEach(function (h) { h.flash = Math.max(0, h.flash - dt / 220); h.hurt = Math.max(0, (h.hurt || 0) - dt / 360); var sk = lib.skills[h.def.skill]; h.shown += (h.charge - h.shown) * Math.min(1, dt / 160); h.ready = !!sk && h.charge >= sk.cost; });
      S.foes.forEach(function (f) { f.flash = Math.max(0, f.flash - dt / 220); f.shownHp += (f.hp - f.shownHp) * Math.min(1, dt / 260); if (f.dead > 0 && f.dead < 1) f.dead = Math.min(1, f.dead + dt / 700); });
      S.party.shown += (S.party.hp - S.party.shown) * Math.min(1, dt / 260);
      S.b.cells.forEach(function (g) { if (!g) return; if (g.land > 0) g.land = Math.max(0, g.land - dt / 140); if (g.glow > 0) g.glow = Math.max(0, g.glow - dt / 600); });
      // the cursor glides to its cell (never jumps): at most 0.34 cell per frame
      var cc = cellRC(S.cursor.i), dx = cc.c - S.cv.x, dy = cc.r - S.cv.y, d = Math.sqrt(dx * dx + dy * dy), mv = 0.34 * dt / STEP;
      if (d <= mv) { S.cv.x = cc.c; S.cv.y = cc.r; } else { S.cv.x += dx / d * mv; S.cv.y += dy / d * mv; }
    }

    /* ---------- update ---------- */
    function update(dtIn) {
      if (!S) return;
      var dt = num(dtIn, STEP); if (dt <= 0) return;
      dt = dt * clamp(num(P.speed, 1), 0.25, 4);
      S.ms += dt;
      // run the queue: zero-length steps finish in the same frame; a hit-stop holds it (and every animation) for a few frames
      if (S.stop > 0) { S.stop = Math.max(0, S.stop - dt); return; }
      var budget = dt, guard = 0;
      while (guard++ < 200) {
        if (!S.cur) { if (!S.q.length) break; S.cur = S.q.shift(); S.cur.t = 0; if (S.cur.start) S.cur.start(S.cur); if (!S.cur) continue; }
        var c = S.cur;
        if (c.dur > 0 && budget > 0) { c.t += budget; budget = 0; if (c.tick) c.tick(c, clamp(c.t / c.dur, 0, 1), dt); }
        if (c.t >= c.dur) { if (c.end) c.end(c); if (S.cur === c) S.cur = null; continue; }
        break;
      }
      if (S.phase === 'idle' && !S.cur && !S.q.length) {
        S.idle += dt;
        if (P.hints !== 'off' && !autoOn && S.idle > 6000 && !S.hint) { var mv = R.moves(S.b); S.hint = mv[0] || null; }
        if (autoOn) bot(dt);
      }
      tickFx(dt);
    }

    /* ---------- bot: scores every move on a copy (no refills), uses ready skills, plays through key() ---------- */
    function simMove(b0, i, j) {
      var b = R.clone(b0), a = b.cells[i], c = b.cells[j], tally = {}, specials = 0, chain = 0, guard = 0;
      b.cells[i] = c; b.cells[j] = a;
      var first = null;
      if (a.sp === 'prism' || c.sp === 'prism') { first = R.prismSwap(b, j, i).clear; }
      else if (a.sp && c.sp) { first = {}; first[i] = 1; first[j] = 1; }
      var prefer = [j, i];
      while (guard++ < 12) {
        var clear = {}, keep = {}, makes = [];
        if (first) { clear = first; first = null; }
        else { var gs = R.groups(b, prefer, P.specials !== 'off'); prefer = []; if (!gs.length) break; gs.forEach(function (gp) { gp.cells.forEach(function (q) { clear[q] = 1; }); if (gp.make) { makes.push(gp.make); keep[gp.make.idx] = 1; specials += gp.make.sp === 'prism' ? 3 : gp.make.sp === 'bomb' ? 2 : 1; } }); }
        chain++;
        R.expand(b, clear, keep);
        makes.forEach(function (m) { delete clear[m.idx]; var g = b.cells[m.idx]; if (g) { g.sp = m.sp; if (m.sp === 'prism') g.t = 'prism'; } });
        Object.keys(clear).forEach(function (q) { var g = b.cells[q]; if (!g) return; var t = R.colour(g); if (t) tally[t] = (tally[t] || 0) + weightOf(chain); b.cells[q] = null; });
        for (var col = 0; col < b.cols; col++) { var w = b.rows - 1; for (var r = b.rows - 1; r >= 0; r--) { var gg = b.cells[r * b.cols + col]; if (gg) { b.cells[r * b.cols + col] = null; b.cells[w * b.cols + col] = gg; w--; } } }
      }
      return { tally: tally, specials: specials, chain: chain };
    }
    function botChoose() {
      var moves = R.moves(S.b), best = null, bs = -1e9, tf = targetFoe(), low = S.party.hp / S.party.max;
      moves.forEach(function (m, k) {
        var r = simMove(S.b, m.a, m.b), sc = r.specials * 2.5 + r.chain * 0.6;
        Object.keys(r.tally).forEach(function (t) {
          var w = r.tally[t], d = lib.gems[t] || {}, v = 0.3;
          if (d.role === 'heal') v = low < 0.45 ? 2.2 : low < 0.75 ? 0.9 : 0.25;
          else if (d.role === 'strike' || d.role === 'ward' || d.onClear) v = 1;
          S.heroes.forEach(function (h) { if (h.def.gem === t) { var sk = lib.skills[h.def.skill]; v = 1 + (tf && tf.def.weak === t ? 0.5 : 0) + (sk && h.charge < sk.cost ? 0.25 : 0); } });
          sc += w * v;
        });
        sc += (S.rbot() - 0.5) * 0.05;   // tie-break, seeded
        if (sc > bs) { bs = sc; best = m; }
      });
      return best;
    }
    function bot(dt) {
      S.botT += dt;
      if (S.botQ.length) { var nx = S.botQ[0]; if (S.botT >= nx.at) { S.botQ.shift(); if (nx.key) self.key(nx.key, true); if (nx.cur != null) S.cursor.i = nx.cur; } return; }
      if (S.botT < 450) return;
      // target: the foe that attacks soonest, then the weakest
      var lv = living().slice().sort(function (a, b) { return a.cd - b.cd || a.hp - b.hp || a.slot - b.slot; });
      if (lv[0] && S.target !== lv[0].id) { self.key('target', true); S.botT = 300; return; }
      for (var i = 0; i < S.heroes.length; i++) { var h = S.heroes[i], sk = lib.skills[h.def.skill]; if (sk && h.charge >= sk.cost) { var heal = (sk.effects || []).some(function (e) { return e.heal; }); if (!heal || S.party.hp < S.party.max * 0.8) { self.key(String(i + 1), true); return; } } }
      var m = botChoose(); if (!m) return;
      var ra = cellRC(m.a), rb = cellRC(m.b), dir = rb.r > ra.r ? 'down' : rb.r < ra.r ? 'up' : rb.c > ra.c ? 'right' : 'left';
      S.botT = 0; S.botQ = [{ at: 0, cur: m.a }, { at: 260, key: 'ok' }, { at: 420, key: dir }];
    }

    /* ---------- input ---------- */
    function key(k, fromBot) {
      if (!S) return false;
      if (!fromBot) { S.idle = 0; S.hint = null; }
      if (/^[1-9]$/.test(k)) return castSkill(+k - 1);
      if (k === 'target') { var lv = living(); if (!lv.length) return false; var i = 0; lv.forEach(function (f, q) { if (f.id === S.target) i = q + 1; }); S.target = lv[i % lv.length].id; ev({ kind: 'target', foe: S.target }); return true; }
      var d = DIRS[k];
      if (d) {
        if (S.sel >= 0 && S.phase === 'idle') { var rc = cellRC(S.sel), r = rc.r + d[0], c = rc.c + d[1]; if (r >= 0 && r < P.rows && c >= 0 && c < P.cols) { var j = r * P.cols + c; S.cursor.i = j; return trySwap(S.sel, j); } S.sel = -1; return false; }
        var cc = cellRC(S.cursor.i); S.cursor.i = clamp(cc.r + d[0], 0, P.rows - 1) * P.cols + clamp(cc.c + d[1], 0, P.cols - 1); return true;
      }
      if (k === 'ok') {
        if (S.phase !== 'idle') return false;
        if (S.sel < 0) { S.sel = S.cursor.i; ev({ kind: 'select', at: S.sel }); return true; }
        if (S.sel === S.cursor.i) { S.sel = -1; return true; }
        if (R.adjacent(S.b, S.sel, S.cursor.i)) return trySwap(S.sel, S.cursor.i);
        S.sel = S.cursor.i; return true;
      }
      if (k === 'back') { S.sel = -1; S.drag = null; return true; }
      return false;
    }
    function cellAt(x, y) { var p = toStage(x, y), I = L.inner; if (p.x < I.x || p.y < I.y || p.x >= I.x + I.w || p.y >= I.y + I.h) return -1; return Math.floor((p.y - I.y) / L.cell) * P.cols + Math.floor((p.x - I.x) / L.cell); }
    function pointer(type, x, y) {
      if (!S) return false; S.idle = 0; S.hint = null;
      var p = toStage(x, y);
      if (type === 'down') {
        var i = cellAt(x, y);
        if (i >= 0) {
          S.cursor.i = i;
          if (S.phase !== 'idle') return true;
          if (S.sel >= 0 && S.sel !== i && R.adjacent(S.b, S.sel, i)) return trySwap(S.sel, i);
          S.sel = i; S.drag = { i: i, x: p.x, y: p.y }; ev({ kind: 'select', at: i }); return true;
        }
        for (var h = 0; h < S.heroes.length; h++) if (inRect(p, L.cards[h])) return castSkill(h);
        var hitF = S.foes.filter(function (f) { if (f.hp <= 0) return false; var a = foePos(f), w = a.h * 0.7; return p.x > a.x - w / 2 && p.x < a.x + w / 2 && p.y > a.footY - a.h - 10 && p.y < a.footY + 30; })[0];
        if (hitF) { S.target = hitF.id; ev({ kind: 'target', foe: hitF.id }); return true; }
        S.sel = -1; return false;
      }
      if (type === 'move' && S.drag && S.phase === 'idle') {
        var dx = p.x - S.drag.x, dy = p.y - S.drag.y, th = L.cell * 0.42;
        if (Math.abs(dx) > th || Math.abs(dy) > th) {
          var rc = cellRC(S.drag.i), r = rc.r, c = rc.c; if (Math.abs(dx) > Math.abs(dy)) c += dx > 0 ? 1 : -1; else r += dy > 0 ? 1 : -1;
          var from = S.drag.i; S.drag = null;
          if (r >= 0 && r < P.rows && c >= 0 && c < P.cols) return trySwap(from, r * P.cols + c);
        }
        return true;
      }
      if (type === 'up' || type === 'cancel') { S.drag = null; return true; }
      return false;
    }

    /* ---------- positions ---------- */
    function heroPos(h) {
      var st = L.stage, gy = L.ground, H = L.heroH, i = h.i, back = i % 2 === 1;
      var x = st.x + st.w * [0.37, 0.27, 0.205, 0.1][i % 4], fy = gy - (back ? st.h * 0.085 : 0);
      var hh = H * (back ? 0.92 : 1) * num(h.def.h, 1), lift = 0, dx = 0;
      var a = h.anim;
      if (a) {
        var k = clamp(a.t / a.dur, 0, 1);
        if (a.kind === 'leap') { var tx = x + 120; S.foes.forEach(function (f) { if (f.hp > 0 || f.id === a.target) { var fp0 = foeHomePos(f), q = fp0.x - fp0.h * 0.45 - H * 0.25; if (f.id === a.target || q < tx) tx = f.id === a.target ? Math.min(q, tx === x + 120 ? q : tx) : q; } });   // stops in front of the nearest foe
          var out = k < a.impact ? ease(k / a.impact) : 1 - ease((k - a.impact) / (1 - a.impact)); dx = (tx - x) * out; lift = Math.sin(Math.PI * clamp(k < a.impact ? k / a.impact : (k - a.impact) / (1 - a.impact), 0, 1)) * H * 0.28; }
        else if (a.kind === 'cast') { lift = Math.sin(Math.PI * k) * H * 0.08; }
        else { dx = k < a.impact ? -6 * Math.sin(Math.PI * k / a.impact) : 0; }
      }
      if (h.hurt) dx -= h.hurt * 8;
      return { x: x + dx, footY: fy, h: hh, lift: lift, back: back };
    }
    /* where a melee foe stands at impact: its front edge (fists, jaws, talons; the left 12% of its box) over the hero's body */
    function heroHomeX(h) { return L.stage.x + L.stage.w * [0.37, 0.27, 0.205, 0.1][h.i % 4]; }
    function foeBoxW(f, hh) { return boxOf({ id: f.id, kind: 'foe', look: f.def.look, x: 0, footY: 0, h: hh, lift: 0, squash: 0, facing: 'left' }).w; }
    function contactX(f, victim, x, hh) {
      if (!victim) return x; var hx = heroHomeX(victim), hw = boxOf({ id: victim.id, kind: 'hero', look: victim.def.look, x: hx, footY: 0, h: L.heroH, lift: 0, squash: 0, facing: 'right' }).w, fw = foeBoxW(f, hh);
      return hx + hw * 0.15 + fw * 0.5 - fw * CONTACT_IN;
    }
    var CONTACT_IN = 0.12;
    function strikeBox(f) {   // the foe's striking part (front 30% of its box, lower half) where it is drawn now; stage px
      var p = foePos(f), fw = foeBoxW(f, p.h); return { x: p.x - fw / 2, y: p.footY - p.lift - p.h * 0.55, w: fw * 0.3, h: p.h * 0.5 };
    }
    function foeHomePos(f) { var st = L.stage, n = Math.max(1, f.n), slots = n === 1 ? [0.76] : n === 2 ? [0.66, 0.87] : [0.56, 0.735, 0.91]; return { x: st.x + st.w * slots[Math.min(f.slot, slots.length - 1)], h: L.heroH * num(f.def.h, DEF_H[f.def.look] || 1) }; }
    function foePos(f) {
      var st = L.stage, n = Math.max(1, f.n), slots = n === 1 ? [0.76] : n === 2 ? [0.66, 0.87] : [0.56, 0.735, 0.91];
      var x = st.x + st.w * slots[Math.min(f.slot, slots.length - 1)], fy = L.ground - (n === 3 && f.slot === 1 ? st.h * 0.07 : 0);
      var hh = L.heroH * num(f.def.h, DEF_H[f.def.look] || 1), lift = (f.def.hover != null ? f.def.hover : DEF_HOVER[f.def.look] || 0) * hh, dx = 0, sq = 0;
      var a = f.anim;
      if (a) {
        /* anticipation -> strike -> impact -> recovery. W = end of the wind-up, a.impact = the damage frame */
        var k = clamp(a.t / a.dur, 0, 1), victim = S.heroes.filter(function (h) { return h.id === a.target; })[0], vx = victim ? heroPos(victim).x + L.heroH * 0.45 : st.x + st.w * 0.3, contact = contactX(f, victim, x, hh);
        var W = a.windup, I = a.impact, w = ease(k / W), s2 = k < W ? 0 : easeIn(clamp((k - W) / (I - W), 0, 1)), r = k < I ? 0 : ease((k - I) / (1 - I)), back = hh * 0.14;
        if (a.kind === 'leap' || a.kind === 'swoop') {
          var reach = contact - x;
          if (k < W) { dx = back * w; sq = -0.09 * w; }
          else if (k < I) { dx = lerp(back, reach, s2); lift += Math.sin(Math.PI * s2 * 0.9) * hh * (a.kind === 'leap' ? 0.3 : 0.12) - (a.kind === 'swoop' ? s2 * hh * 0.2 : 0); sq = 0.1 * (1 - s2) - 0.02; }
          else { dx = lerp(reach, 0, r); lift += Math.sin(Math.PI * r) * hh * 0.12 - (a.kind === 'swoop' ? (1 - r) * hh * 0.2 : 0); sq = -0.1 * (1 - clamp(r * 4, 0, 1)); }
        } else if (a.kind === 'slam') {
          // raised high and leaning back, then a fast drop forward onto the fists; the slammed pose holds a moment
          var lunge = contact - x, rh = ease(clamp(((k - I) / (1 - I) - 0.3) / 0.7, 0, 1));
          if (k < W) { dx = back * w; lift += hh * 0.34 * w; sq = 0.1 * w; }
          else if (k < I) { dx = lerp(back, lunge, s2); lift += hh * 0.34 * (1 - s2); sq = 0.1 - 0.02 * s2; }
          else { dx = lerp(lunge, 0, rh); sq = -0.14 * (1 - clamp(rh * 2, 0, 1)); }
        } else {
          if (k < W) { dx = back * 0.5 * w; sq = -0.05 * w; }
          else if (k < I) { dx = lerp(back * 0.5, -hh * 0.12, s2); sq = 0.05; }
          else { dx = lerp(-hh * 0.12, 0, r); }
        }
      }
      if (f.flash > 0.5 && !a) dx += 4 * (f.flash - 0.5);
      return { x: x + dx, footY: fy, h: hh, lift: lift, sq: sq };
    }
    var DEF_H = { slime: 0.62, wolf: 0.74, imp: 0.72, wisp: 0.62, harpy: 1.05, skeleton: 1.02, cultist: 1.02, golem: 1.5 };
    var DEF_HOVER = { wisp: 0.55, harpy: 0.35 };
    function actorInfo(kind, o, pos) {
      var target = (o.anim && o.anim.target) || (kind === 'hero' ? S.target : (frontHero(o) || {}).id);
      return { id: o.id, kind: kind, key: kind === 'hero' ? o.id : o.key, look: o.def.look, tint: o.def.tint, x: pos.x, footY: pos.footY, h: pos.h, lift: pos.lift || 0, squash: pos.sq || 0,
        facing: kind === 'hero' ? 'right' : 'left', target: target, flash: Math.min(1, o.flash || 0) * 0.4,   // a hit tints the character half white: it stays solid and keeps its detail
        alpha: kind === 'hero' ? 1 : (o.dead > 0 ? Math.max(0, 1 - o.dead) : 1) * clamp((o.enter - 0.1) / 0.6, 0, 1),
        anim: o.anim ? o.anim.kind : null, dead: kind !== 'hero' && o.hp <= 0 };
    }
    function boxOf(info) {
      var b = null; if (opt.actorBox) { try { b = opt.actorBox(info); } catch (x) { b = null; } }
      if (!b) { var w = info.h * 0.62; b = { x: info.x - w / 2, y: info.footY - info.lift - info.h, w: w, h: info.h }; }
      return b;
    }

    /* ---------- drawing ---------- */
    function devScale(g) { var T = g.getTransform(); return Math.sqrt(Math.abs(T.a * T.d - T.b * T.c)) || 1; }
    function drawBoard(g) {
      var B = L.board, I = L.inner, C = L.cell, t = S.ms / 1000, ds = devScale(g);
      // tray: carved wood and brass, cells in two tones with a soft inner shadow (cached per layout and device scale)
      var pad = 24, tw = Math.ceil((B.w + pad * 2) * ds), th = Math.ceil((B.h + pad * 2) * ds), tk = L.mode + '|' + tw;
      if (!trayCache || trayCache.k !== tk) {
        var cv = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(tw, th) : (function () { var k = document.createElement('canvas'); k.width = tw; k.height = th; return k; })();
        var q = cv.getContext('2d'); q.setTransform(ds, 0, 0, ds, (pad - B.x) * ds, (pad - B.y) * ds); paintTray(q, B, I, C); trayCache = { k: tk, c: cv };
      }
      g.drawImage(trayCache.c, B.x - pad, B.y - pad, tw / ds, th / ds);
      drawBoardTop(g, B, I, C, t, ds);
    }
    var trayCache = null;
    function paintTray(g, B, I, C) {
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 18; g.shadowOffsetY = 6;
      rr(g, B.x, B.y, B.w, B.h, 16); var wood = g.createLinearGradient(B.x, B.y, B.x + B.w, B.y + B.h); wood.addColorStop(0, '#6a4426'); wood.addColorStop(0.5, '#4a2c16'); wood.addColorStop(1, '#2e1a0c'); g.fillStyle = wood; g.fill();
      g.restore();
      rr(g, B.x + 1.5, B.y + 1.5, B.w - 3, B.h - 3, 15); g.lineWidth = 3; var brass = g.createLinearGradient(B.x, B.y, B.x, B.y + B.h); brass.addColorStop(0, '#ffe2a0'); brass.addColorStop(0.5, '#c8902e'); brass.addColorStop(1, '#7a4a12'); g.strokeStyle = brass; g.stroke();
      for (var q = 0; q < 4; q++) { var cx = q % 2 ? B.x + B.w - 9 : B.x + 9, cy = q > 1 ? B.y + B.h - 9 : B.y + 9; g.beginPath(); g.arc(cx, cy, 4.5, 0, TAU); g.fillStyle = '#e8b85a'; g.fill(); g.strokeStyle = '#4a2a0a'; g.lineWidth = 1.2; g.stroke(); g.beginPath(); g.arc(cx - 1.2, cy - 1.2, 1.5, 0, TAU); g.fillStyle = '#fff3d0'; g.fill(); }
      rr(g, I.x - 2, I.y - 2, I.w + 4, I.h + 4, 8); g.fillStyle = '#140e12'; g.fill();
      for (var r = 0; r < P.rows; r++) for (var c = 0; c < P.cols; c++) {
        var x = I.x + c * C, y = I.y + r * C, odd = (r + c) % 2;
        var cg = g.createLinearGradient(x, y, x, y + C); cg.addColorStop(0, odd ? '#2c2440' : '#251e36'); cg.addColorStop(1, odd ? '#221c32' : '#1c1629'); g.fillStyle = cg; g.fillRect(x, y, C, C);
      }
      var sh = g.createLinearGradient(0, I.y, 0, I.y + 14); sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.fillRect(I.x, I.y, I.w, 14);
      rr(g, I.x - 2, I.y - 2, I.w + 4, I.h + 4, 8); g.lineWidth = 2; g.strokeStyle = 'rgba(255,220,160,0.25)'; g.stroke();
    }
    function drawBoardTop(g, B, I, C, t, ds) {
      // hint wobble and the selection
      var hint = S.hint, wob = {};
      if (hint) { var hk = Math.sin(t * 9) * 0.06; wob[hint.a] = hk; wob[hint.b] = -hk; }
      // gems (clipped to the board: new gems fall in from above)
      g.save(); g.beginPath(); g.rect(I.x, I.y, I.w, I.h); g.clip();
      var top = [];
      S.b.cells.forEach(function (gem, i) { if (!gem) return; if (S.swap && (gem.id === S.swap.a || gem.id === S.swap.b)) { top.push(gem); return; } drawGemAt(g, gem, ds, t, wob[i] || 0, i === S.sel); });
      top.forEach(function (gem) { drawGemAt(g, gem, ds, t, 0, true); });
      // beams and rings on the board
      S.fx.beams.forEach(function (b) {
        var k = b.t / b.dur, a = 1 - k, c = b.c || ['#fff', '#fff', '#fff', '#fff'];
        var thick = (b.horiz ? b.h : b.w) * (0.5 + 1.2 * easeOut(k));
        g.save(); g.globalCompositeOperation = 'lighter';
        var gr = b.horiz ? g.createLinearGradient(0, b.y - thick, 0, b.y + thick) : g.createLinearGradient(b.x - thick, 0, b.x + thick, 0);
        gr.addColorStop(0, rgba(c[1], 0)); gr.addColorStop(0.5, rgba(c[2], 0.85 * a)); gr.addColorStop(1, rgba(c[1], 0));
        g.fillStyle = gr; if (b.horiz) g.fillRect(b.x, b.y - thick, b.w, thick * 2); else g.fillRect(b.x - thick, b.y, thick * 2, b.h);
        g.fillStyle = 'rgba(255,255,255,' + 0.9 * a + ')'; if (b.horiz) g.fillRect(b.x, b.y - 2, b.w, 4); else g.fillRect(b.x - 2, b.y, 4, b.h);
        g.restore();
      });
      drawRings(g, false);
      drawParts(g, false);
      g.restore();
      // the keyboard cursor (glides) and the selected cell
      var cx2 = I.x + S.cv.x * C, cy2 = I.y + S.cv.y * C;
      if (S.phase !== 'end') cornerFrame(g, cx2 + 2, cy2 + 2, C - 4, '#ffffff', 0.75 + 0.25 * Math.sin(t * 5), 2.5);
      if (S.sel >= 0) { var sc = cellRC(S.sel); cornerFrame(g, I.x + sc.c * C + 1, I.y + sc.r * C + 1, C - 2, '#ffd24a', 1, 3.5); }
    }
    function cornerFrame(g, x, y, s, c, a, w) {
      var k = s * 0.28; g.save(); g.globalAlpha *= a; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = w + 2.5; g.lineCap = 'round';
      for (var pass = 0; pass < 2; pass++) {
        g.beginPath(); g.moveTo(x, y + k); g.lineTo(x, y); g.lineTo(x + k, y); g.moveTo(x + s - k, y); g.lineTo(x + s, y); g.lineTo(x + s, y + k);
        g.moveTo(x + s, y + s - k); g.lineTo(x + s, y + s); g.lineTo(x + s - k, y + s); g.moveTo(x + k, y + s); g.lineTo(x, y + s); g.lineTo(x, y + s - k); g.stroke();
        g.strokeStyle = c; g.lineWidth = w;
      }
      g.restore();
    }
    function drawGemAt(g, gem, ds, t, wob, lifted) {
      var C = L.cell, I = L.inner, x = I.x + (gem.x + 0.5) * C, y = I.y + (gem.y + 0.5) * C, r = C * 0.4;
      if (y < I.y - C) return;
      var def = gem.sp === 'prism' ? PRISM : lib.gems[gem.t] || PRISM, sc = 1, a = 1;
      if (gem.pop >= 0) { var k = gem.pop; sc = k < 0.3 ? 1 + 0.25 * (k / 0.3) : 1.25 * (1 - easeIn((k - 0.3) / 0.7)); a = k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5; }
      if (lifted) sc *= 1.06;
      var sx = sc * (1 + 0.1 * gem.land), sy = sc * (1 - 0.14 * gem.land);
      if (sc <= 0.01 || a <= 0) return;
      g.save(); g.globalAlpha *= a; g.translate(x, y + (1 - sy) * r * 0.9); if (wob) g.rotate(wob); g.scale(sx, sy);
      if (gem.sp) haloSpecial(g, def, gem.sp, 0, 0, r, t);
      if (gem.sp === 'prism') paintPrism(g, 0, 0, r, t);
      else {
        var px = Math.max(8, Math.round(C * ds)), key = gem.t + '|' + px, img = cache.get(key, px, function (q) { q.setTransform(px / C, 0, 0, px / C, px / 2, px / 2); paintGem(q, def, 0, 0, r); });
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low'; g.drawImage(img, -C / 2, -C / 2, C, C);   // cached at device px: 1:1
        if (gem.sp) paintSpecial(g, def, gem.sp, 0, 0, r, t);
      }
      if (gem.pop >= 0 && gem.pop < 0.45) { g.globalCompositeOperation = 'lighter'; g.globalAlpha *= 0.7 * (1 - gem.pop / 0.45); g.fillStyle = '#ffffff'; pathPts(g, shapePts(def.shape), 0, 0, r); g.fill(); }
      if (gem.glow > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = a * gem.glow * 0.6; g.fillStyle = '#ffffff'; pathPts(g, shapePts(def.shape), 0, 0, r); g.fill(); }
      g.restore();
      // a twinkle now and then on idle gems (from the id and the clock: same frame, same twinkle)
      var tw = (t * 0.6 + gem.id * 0.137) % 4.3; if (tw < 0.35 && gem.pop < 0 && !gem.sp) sparkle(g, x - r * 0.35, y - r * 0.38, r * 0.3 * Math.sin(Math.PI * tw / 0.35), '#ffffff', 0.9);
    }
    function drawRings(g, stage, back) {
      S.fx.rings.forEach(function (r) { if (!!r.stage !== stage || !!r.back !== !!back) return; var k = r.t / r.dur, rad = lerp(r.r0, r.r1, easeOut(k)); g.save(); g.globalAlpha = (1 - k) * 0.9; g.strokeStyle = r.c; g.lineWidth = r.w * (1 - k * 0.6); g.beginPath(); if (r.flat) g.ellipse(r.x, r.y, rad, rad * 0.3, 0, 0, TAU); else g.arc(r.x, r.y, rad, 0, TAU); g.stroke(); g.restore(); });
    }
    function drawParts(g, stage, back) {
      S.fx.parts.forEach(function (p) {
        if (!!p.stage !== stage || !!p.back !== !!back) return; var k = p.t / p.life, a = 1 - k;
        if (p.kind === 'star') sparkle(g, p.x, p.y, p.s * 1.8 * a + 1, p.c, a);
        else if (p.kind === 'puff') { var pr = p.s * (0.6 + 0.9 * easeOut(k)), pg = g.createRadialGradient(p.x, p.y - pr * 0.3, 0, p.x, p.y - pr * 0.3, pr); pg.addColorStop(0, rgba(p.c, 0.38 * a)); pg.addColorStop(1, rgba(p.c, 0)); g.save(); g.fillStyle = pg; g.beginPath(); g.ellipse(p.x, p.y - pr * 0.3, pr, pr * 0.62, 0, 0, TAU); g.fill(); g.restore(); }
        else if (p.kind === 'plus') { g.save(); g.globalAlpha = a; g.fillStyle = p.c; g.fillRect(p.x - p.s, p.y - p.s * 0.3, p.s * 2, p.s * 0.6); g.fillRect(p.x - p.s * 0.3, p.y - p.s, p.s * 0.6, p.s * 2); g.restore(); }
        else { g.save(); g.globalAlpha = a; g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.s * (0.5 + 0.5 * a), 0, TAU); g.fill(); g.restore(); }
      });
    }
    function drawActor(g, info) {
      var done = false; if (opt.drawActor) { try { done = opt.drawActor(g, info) === true; } catch (x) { done = false; } }
      if (!done) paintFallbackActor(g, info);
    }
    function actorsSorted() {
      var list = [];
      S.heroes.forEach(function (h) { var p = heroPos(h); list.push({ y: p.footY + (h.anim ? 30 : 0), info: actorInfo('hero', h, p) }); });
      S.foes.forEach(function (f) { if (f.enter <= 0 || (f.dead >= 1)) return; var p = foePos(f); list.push({ y: p.footY + (f.anim ? 40 : 0), info: actorInfo('foe', f, p) }); });
      return list.sort(function (a, b) { return a.y - b.y; });
    }
    function drawStage(g) {
      var st = L.stage, t = S.ms / 1000;
      g.save(); rr(g, st.x, st.y, st.w, st.h, 12); g.clip();
      var drew = false; if (opt.drawBackdrop) { try { drew = opt.drawBackdrop(g, { x: st.x, y: st.y, w: st.w, h: st.h, groundY: L.ground }, { stage: S.stage, name: S.name, t: t }) === true; } catch (x) { drew = false; } }
      if (!drew) { var sk = g.createLinearGradient(0, st.y, 0, st.y + st.h); sk.addColorStop(0, '#3a3a6a'); sk.addColorStop(0.6, '#c87a6a'); sk.addColorStop(0.62, '#4a5a3a'); sk.addColorStop(1, '#2a3420'); g.fillStyle = sk; g.fillRect(st.x, st.y, st.w, st.h); }
      var vg = g.createLinearGradient(0, st.y, 0, st.y + st.h); vg.addColorStop(0, 'rgba(10,6,20,0.35)'); vg.addColorStop(0.25, 'rgba(10,6,20,0)'); vg.addColorStop(0.8, 'rgba(10,6,20,0)'); vg.addColorStop(1, 'rgba(10,6,20,0.45)'); g.fillStyle = vg; g.fillRect(st.x, st.y, st.w, st.h);
      if (S.fx.shake > 0) g.translate(Math.round(Math.sin(S.ms * 0.09) * S.fx.shake * 0.5), Math.round(Math.cos(S.ms * 0.13) * S.fx.shake * 0.3));
      // summoning circles under entering foes, the target ring
      S.foes.forEach(function (f) { if (f.enter > 0 && f.enter < 1) { var p = foePos(f), k = f.enter; g.save(); g.globalAlpha = Math.sin(Math.PI * k); g.strokeStyle = '#c8a0ff'; g.lineWidth = 3; g.beginPath(); g.ellipse(p.x, p.footY, p.h * 0.5 * (0.5 + k), p.h * 0.12 * (0.5 + k), 0, 0, TAU); g.stroke(); g.globalCompositeOperation = 'lighter'; var gr = g.createRadialGradient(p.x, p.footY, 0, p.x, p.footY, p.h * 0.6); gr.addColorStop(0, 'rgba(200,160,255,0.6)'); gr.addColorStop(1, 'rgba(200,160,255,0)'); g.fillStyle = gr; g.fillRect(p.x - p.h, p.footY - p.h, p.h * 2, p.h * 1.3); g.restore(); } });
      var tf = targetFoe();
      if (tf && tf.enter >= 1 && S.phase !== 'end') { var tp = foePos(tf), pul = 0.6 + 0.4 * Math.sin(t * 4); g.save(); g.globalAlpha = 0.8; g.strokeStyle = 'rgba(255,90,70,' + pul + ')'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(tp.x, tp.footY + 1, tp.h * 0.42, tp.h * 0.09 + 3, 0, 0, TAU); g.stroke(); g.restore(); }
      S.foes.forEach(function (f) { var a = f.anim; if (!a || a.t / a.dur >= a.impact) return; var k = a.t / a.dur, v = S.heroes.filter(function (h) { return h.id === a.target; })[0], fp = foePos(f), tel = clamp(k / a.windup, 0, 1);
        g.save(); g.globalCompositeOperation = 'lighter'; var gr = g.createRadialGradient(fp.x, fp.footY - fp.lift - fp.h * 0.5, 0, fp.x, fp.footY - fp.lift - fp.h * 0.5, fp.h * 0.7); gr.addColorStop(0, 'rgba(255,80,50,' + 0.8 * tel + ')'); gr.addColorStop(0.55, 'rgba(255,60,40,' + 0.35 * tel + ')'); gr.addColorStop(1, 'rgba(255,60,40,0)'); g.fillStyle = gr; g.fillRect(fp.x - fp.h, fp.footY - fp.lift - fp.h * 1.3, fp.h * 2, fp.h * 1.6); g.restore();
        if (v && (a.kind === 'slam' || f.def.special)) { var vp = heroPos(v); g.save(); g.globalAlpha = 0.35 + 0.5 * tel; g.strokeStyle = '#ff5a3a'; g.lineWidth = 3; g.setLineDash([8, 6]); g.lineDashOffset = -S.ms * 0.05; g.beginPath(); g.ellipse(vp.x, vp.footY, L.heroH * (0.25 + 0.3 * tel), L.heroH * (0.07 + 0.08 * tel), 0, 0, TAU); g.stroke(); g.restore(); } });
      drawRings(g, true, true); drawParts(g, true, true);   // dust behind the characters' feet
      actorsSorted().forEach(function (a) { drawActor(g, a.info); });
      // projectiles of attacks in progress
      S.heroes.forEach(function (h) { if (h.anim) attackShot(g, 'hero', h); });
      S.foes.forEach(function (f) { if (f.anim) attackShot(g, 'foe', f); });
      S.fx.shots.forEach(function (s) {
        var k = s.t / s.dur; if (k < 0) return;
        if (s.kind === 'slash' || s.kind === 'bigslash') { var p = s.foe ? (function () { var f = S.foes.filter(function (q) { return q.id === s.foe; })[0]; if (!f) return null; var fp = foePos(f); return { x: fp.x, y: fp.footY - fp.h * 0.55 }; })() : { x: s.x, y: s.y }; if (!p) return; var R0 = s.kind === 'bigslash' ? 60 : 34;
          g.save(); g.globalAlpha = 1 - k; g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.lineWidth = (s.kind === 'bigslash' ? 9 : 5) * (1 - k * 0.5); g.beginPath(); g.arc(p.x - R0 * 0.3, p.y + R0 * 0.3, R0, -1.9 + k * 0.4, -0.2 + k * 0.8); g.stroke(); g.strokeStyle = s.c; g.lineWidth *= 0.45; g.stroke(); g.restore(); }
        else if (s.kind === 'contact') { var ck = 1 - k, cr = 10 + 26 * easeOut(k); g.save(); g.globalCompositeOperation = 'lighter'; var cg = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, cr); cg.addColorStop(0, 'rgba(255,240,200,' + 0.9 * ck + ')'); cg.addColorStop(0.4, 'rgba(255,170,80,' + 0.5 * ck + ')'); cg.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = cg; g.beginPath(); g.arc(s.x, s.y, cr, 0, TAU); g.fill(); g.restore(); }
        else if (s.kind === 'rain') { var f2 = S.foes.filter(function (q) { return q.id === s.foe; })[0]; if (!f2) return; var fp2 = foePos(f2), yy = lerp(st.y - 20, fp2.footY - fp2.h * 0.4, easeIn(k)), xx = fp2.x + s.dx + (1 - k) * 30;
          g.save(); g.strokeStyle = s.c; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(xx + 10, yy - 26); g.lineTo(xx, yy); g.stroke(); g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(xx, yy + 3); g.lineTo(xx - 3, yy - 4); g.lineTo(xx + 3, yy - 3); g.fill(); g.restore(); }
      });
      drawRings(g, true); drawParts(g, true);
      g.restore();
      // frame
      rr(g, st.x + 1, st.y + 1, st.w - 2, st.h - 2, 12); g.lineWidth = 2.5; g.strokeStyle = 'rgba(232,190,110,0.85)'; g.stroke();
    }
    function attackShot(g, side, o) {
      var a = o.anim, k = clamp(a.t / a.dur, 0, 1);
      if (a.kind === 'leap' || a.kind === 'slam' || a.kind === 'swoop' || a.kind === 'cast') return;
      var from, to, c;
      if (side === 'hero') { var hp = heroPos(o), f = S.foes.filter(function (q) { return q.id === a.target; })[0]; if (!f) return; var fp = foePos(f); from = { x: hp.x + hp.h * 0.2, y: hp.footY - hp.h * 0.62 }; to = { x: fp.x, y: fp.footY - fp.lift - fp.h * 0.55 }; c = (lib.gems[o.def.gem] || {}).colors || ['#fff', '#fff', '#fff', '#fff']; }
      else { var fp2 = foePos(o), v = S.heroes.filter(function (h) { return h.id === a.target; })[0]; if (!v) return; var vp = heroPos(v); from = { x: fp2.x - fp2.h * 0.25, y: fp2.footY - fp2.lift - fp2.h * 0.6 }; to = { x: vp.x, y: vp.footY - vp.h * 0.5 }; var bc = o.def.boltColor || '#ff8a4a'; c = ['#000', bc, bc, '#ffffff']; }
      var k0 = a.windup || 0.2, u = clamp((k - k0) / (a.impact - k0), 0, 1); if (k < k0 || k > a.impact + 0.02) return;
      var x = lerp(from.x, to.x, u), y = lerp(from.y, to.y, u) - Math.sin(Math.PI * u) * (a.kind === 'arrow' ? 26 : 12);
      g.save();
      if (a.kind === 'arrow') { var ang = Math.atan2((to.y - from.y) - Math.cos(Math.PI * u) * 26 * Math.PI, to.x - from.x); g.translate(x, y); g.rotate(ang); g.strokeStyle = '#6a4a2a'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-22, 0); g.lineTo(6, 0); g.stroke(); g.fillStyle = '#e8e8f0'; g.beginPath(); g.moveTo(11, 0); g.lineTo(3, -4); g.lineTo(3, 4); g.fill(); g.fillStyle = c[1]; g.beginPath(); g.moveTo(-22, 0); g.lineTo(-27, -4); g.lineTo(-17, 0); g.lineTo(-27, 4); g.fill(); }
      else {
        for (var q = 4; q >= 0; q--) { var uu = Math.max(0, u - q * 0.05), xx = lerp(from.x, to.x, uu), yy = lerp(from.y, to.y, uu) - Math.sin(Math.PI * uu) * 12; g.globalAlpha = 0.25 + 0.15 * (4 - q); g.fillStyle = c[2]; g.beginPath(); g.arc(xx, yy, 7 - q, 0, TAU); g.fill(); }
        g.globalAlpha = 1; var gr = g.createRadialGradient(x, y, 0, x, y, 12); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, c[2]); gr.addColorStop(1, rgba(c[1].charAt(0) === '#' ? c[1] : '#ffffff', 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 12, 0, TAU); g.fill();
      }
      g.restore();
    }
    function drawScene(g) {
      if (!S) return;
      g.save(); g.translate(L.ox, L.oy); g.scale(L.s, L.s);
      drawStage(g); drawBoard(g);
      g.restore();
    }
    /* ---------- UI ---------- */
    var uiList = [];
    function plate(g, x, y, w, h, o) {
      o = o || {}; g.save(); rr(g, x, y, w, h, o.r || 10);
      var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, o.top || 'rgba(46,34,40,0.96)'); gr.addColorStop(1, o.bottom || 'rgba(20,14,20,0.97)'); g.fillStyle = gr; g.fill();
      g.lineWidth = o.lw || 1.6; g.strokeStyle = o.stroke || 'rgba(222,182,112,0.9)'; g.stroke(); g.restore();
      if (o.name) uiList.push({ name: o.name, x: x, y: y, w: w, h: h });
    }
    function bar(g, x, y, w, h, k, k2, cols) {
      rr(g, x, y, w, h, h / 2); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fill();
      if (k2 > k) { rr(g, x + 1, y + 1, Math.max(0, (w - 2) * clamp(k2, 0, 1)), h - 2, (h - 2) / 2); g.fillStyle = cols[2] || '#fff2c0'; g.fill(); }
      if (k > 0) { rr(g, x + 1, y + 1, Math.max(h - 2, (w - 2) * clamp(k, 0, 1)), h - 2, (h - 2) / 2); var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[1]); g.fillStyle = gr; g.fill();
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + h / 2, y + 2, Math.max(0, (w - 2) * clamp(k, 0, 1) - h), Math.max(1, h * 0.18)); }
      rr(g, x, y, w, h, h / 2); g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,230,180,0.55)'; g.stroke();
    }
    function gemIcon(g, gid, x, y, r) { var d = gid === 'prism' ? PRISM : lib.gems[gid]; if (!d) return; paintGem(g, d, x, y, r); }
    function drawUIInner(g) {
      var F = L.font, t = S.ms / 1000, T = L.top;
      // top bar
      plate(g, T.x, T.y, T.w, T.h, { name: 'top', r: 9 });
      txt(g, (S.stage ? S.stage + ' - ' : '') + 'Wave ' + Math.max(1, S.wave + 1) + '/' + S.waves.length, T.x + 12, T.y + T.h / 2, { size: F + 1, color: '#ffe8b8', max: T.w * 0.62, tag: 'top' });
      for (var w = 0; w < S.waves.length; w++) { var px = T.x + T.w - 98 - (S.waves.length - 1 - w) * 14, done = w < S.wave || (w === S.wave && !living().length && S.wave >= 0); g.beginPath(); g.arc(px, T.y + T.h / 2, 4.5, 0, TAU); g.fillStyle = done ? '#ffd25a' : w === S.wave ? '#fff4d8' : 'rgba(255,255,255,0.22)'; g.fill(); }
      txt(g, 'Turn ' + S.turn, T.x + T.w - 12, T.y + T.h / 2, { size: F, align: 'right', color: '#f4e4c8', tag: 'top' });
      // foe plates: countdown badge, HP bar, the target's name above it
      S.foes.forEach(function (f) {
        if (f.enter <= 0 || f.dead >= 1) return; var p = foePos(f), a = clamp(f.enter * 2 - 0.4, 0, 1) * (f.dead > 0 ? 1 - f.dead : 1); if (a <= 0) return;
        var nF = Math.max(1, f.n), bw = Math.round((nF === 1 ? 104 : nF === 2 ? 70 : 44) * (L.mode === 'tall' ? (nF === 3 ? 1 : 1.12) : 1)), bh = L.mode === 'tall' ? 18 : 13, rad = L.mode === 'tall' ? 15 : 12, home = foeHome(f), x = home.x - (bw + rad) / 2 + rad, y = Math.min(L.stage.y + L.stage.h - bh - 8, L.ground + 12);
        g.save(); g.globalAlpha = a;
        bar(g, x, y, bw, bh, f.hp / f.max, f.shownHp / f.max, ['#ff7a5a', '#b8241a', '#fff0c8']);
        txt(g, f.hp + '', x + bw / 2, y + bh / 2 + 0.5, { size: F - 2, align: 'center', color: '#ffffff', ow: 3, tag: 'plate' });
        var bx = x - rad + 3, by = y + bh / 2, urgent = f.cd <= 1 && f.hp > 0;
        g.beginPath(); g.arc(bx, by, rad, 0, TAU); var bg = g.createRadialGradient(bx - 3, by - 3, 1, bx, by, rad); bg.addColorStop(0, urgent ? '#ff8a6a' : '#5a4a6a'); bg.addColorStop(1, urgent ? '#8a1a10' : '#241a2e'); g.fillStyle = bg; g.fill();
        g.lineWidth = 2; g.strokeStyle = urgent ? 'rgba(255,220,140,' + (0.6 + 0.4 * Math.sin(t * 8)) + ')' : '#c8a870'; g.stroke();
        txt(g, String(Math.max(0, f.cd)), bx, by + 0.5, { size: F, align: 'center', color: '#ffffff', ow: 3, tag: 'plate' });
        if (f.def.weak && nF < 3) gemIcon(g, f.def.weak, x + bw - 2, by, 8.5);
        if (f.id === S.target) txt(g, f.def.name, home.x + 10, y - 9, { size: F - 1, align: 'center', color: '#ffd8a8', ow: 3.5, tag: 'plate', max: bw + 40 });
        g.restore();
        uiList.push({ name: 'plate:' + f.id, x: bx - rad, y: f.id === S.target ? y - 9 - F / 2 - 2 : by - rad, w: bw + rad + 12, h: f.id === S.target ? bh + F + 8 : rad * 2 });
      });
      // target marker: a gold chevron over the target's head (bobs)
      var tf = targetFoe();
      if (tf && tf.enter >= 1 && S.phase !== 'end') { var tp = foePos(tf), ty = tp.footY - tp.lift - tp.h - 10 + Math.sin(t * 4) * 3; ty = Math.max(L.stage.y + 12, ty); g.save(); g.beginPath(); g.moveTo(tp.x, ty + 9); g.lineTo(tp.x - 8, ty - 2); g.lineTo(tp.x - 3, ty - 2); g.lineTo(tp.x, ty + 2); g.lineTo(tp.x + 3, ty - 2); g.lineTo(tp.x + 8, ty - 2); g.closePath(); g.fillStyle = '#ffd24a'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#5a2a08'; g.stroke(); g.restore(); }
      // hero cards
      S.heroes.forEach(function (h, i) { var r = L.cards[i]; if (r) heroCard(g, h, r, i, t); });
      // party bar
      var Pb = L.party; plate(g, Pb.x, Pb.y, Pb.w, Pb.h, { name: 'party', r: 9 });
      txt(g, 'PARTY', Pb.x + 12, Pb.y + Pb.h / 2, { size: F - 1, color: '#e8d4b0', tag: 'party' });
      var bx2 = Pb.x + 72, bw2 = Pb.w - 84 - (S.party.ward > 0 ? 70 : 0);
      bar(g, bx2, Pb.y + 8, bw2, Pb.h - 16, S.party.hp / S.party.max, S.party.shown / S.party.max, S.party.hp / S.party.max < 0.3 ? ['#ff8a6a', '#c8301a', '#fff0c8'] : ['#8af07a', '#2a9a3a', '#fff0c8']);
      txt(g, S.party.hp + ' / ' + S.party.max, bx2 + bw2 / 2, Pb.y + Pb.h / 2 + 0.5, { size: F - 1, align: 'center', color: '#ffffff', ow: 3.5, tag: 'party' });
      if (S.party.ward > 0) { var wx = Pb.x + Pb.w - 74; rr(g, wx, Pb.y + 6, 64, Pb.h - 12, (Pb.h - 12) / 2); g.fillStyle = 'rgba(80,140,220,0.4)'; g.fill(); g.strokeStyle = '#a8d8ff'; g.lineWidth = 1.2; g.stroke(); iconAt(g, 'guard', wx + 12, Pb.y + Pb.h / 2, (Pb.h - 14) / 2); txt(g, String(S.party.ward), wx + 40, Pb.y + Pb.h / 2, { size: F - 1, align: 'center', color: '#e8f4ff', ow: 3, tag: 'party' }); }
      // info strip (wide): the target and what the board does
      if (L.info) {
        var In = L.info; plate(g, In.x, In.y, In.w, In.h, { name: 'info', r: 9 });
        if (tf) { txt(g, tf.def.name, In.x + 12, In.y + In.h / 2, { size: F, color: '#ffd8a8', tag: 'info' });           var line = 'attacks in ' + Math.max(0, tf.cd) + (tf.def.weak ? '    weak to' : ''); var tx = In.x + 180; txt(g, line, tx, In.y + In.h / 2, { size: F - 1, color: '#e8dcc8', tag: 'info' });
          if (tf.def.weak) { g.save(); g.font = '800 ' + (F - 1) + 'px ' + FONT; var lw = g.measureText(line).width; g.restore(); gemIcon(g, tf.def.weak, tx + lw + 14, In.y + In.h / 2, 9); txt(g, 'x' + num(P.weakMult, 1.5) + ' damage', tx + lw + 28, In.y + In.h / 2, { size: F - 1, color: '#e8dcc8', tag: 'info' }); } }
      }
      // orbs from cleared gems to the hero cards (or the party bar for hearts)
      S.fx.orbs.forEach(function (o) {
        if (o.t < 0) return; var k = easeIn(o.t / o.dur), p0 = cellXY(o.from), tr = o.hero >= 0 ? L.cards[o.hero] : L.party; if (!tr) return;
        var p1 = { x: tr.x + tr.w * 0.5, y: tr.y + tr.h * 0.5 }, mx = (p0.x + p1.x) / 2, my = Math.min(p0.y, p1.y) - 40, x = (1 - k) * (1 - k) * p0.x + 2 * k * (1 - k) * mx + k * k * p1.x, y = (1 - k) * (1 - k) * p0.y + 2 * k * (1 - k) * my + k * k * p1.y;
        g.save(); g.globalCompositeOperation = 'lighter'; var gr = g.createRadialGradient(x, y, 0, x, y, 9); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, o.c[2]); gr.addColorStop(1, rgba(o.c[1], 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill(); g.restore();
      });
      // combo badge (top right of the stage)
      if (S.fx.combo) { var cb = S.fx.combo, k2 = cb.t, pop = k2 < 160 ? backOut(k2 / 160) : 1, fade = cb.end != null ? clamp(1 - (k2 - cb.end) / 400, 0, 1) : 1, cx = L.stage.x + L.stage.w - 70, cy = L.stage.y + 30;
        if (fade > 0) { g.save(); g.globalAlpha = fade; g.translate(cx, cy); g.scale(pop, pop); txt(g, 'COMBO x' + cb.n, 0, 0, { size: F + 7, align: 'center', color: cb.n >= 4 ? '#ff9ad8' : cb.n >= 3 ? '#ffd25a' : '#fff4d0', ow: 5, tag: 'combo' }); g.restore();
          uiList.push({ name: 'combo', x: cx - 64, y: cy - 16, w: 128, h: 32 }); } }
      // numbers: attached to their owner, rise, slot stays
      S.fx.nums.forEach(function (n) {
        var q = numPos(n); if (!q) return;
        g.save(); g.globalAlpha = q.alpha; g.translate(q.x, q.y); g.scale(q.sc, q.sc); txt(g, n.text, 0, 0, { size: F + 6, align: 'center', color: n.c, ow: 4.5, tag: 'number' }); g.restore();
      });
      // banners (top of the stage, one at a time, fade in and out)
      if (S.fx.banners.length) { var b = S.fx.banners[0], kin = clamp(b.t / 180, 0, 1), kout = clamp((b.dur - b.t) / 220, 0, 1), al = Math.min(kin, kout), st = L.stage, bw = Math.min(st.w - 40, 330), bh = b.b ? 52 : 36, bx3 = st.x + (st.w - bw) / 2, by3 = st.y + 46;
        g.save(); g.globalAlpha = al; g.translate(0, (1 - easeOut(kin)) * -8);
        rr(g, bx3, by3, bw, bh, 10); var bgr = g.createLinearGradient(bx3, 0, bx3 + bw, 0); bgr.addColorStop(0, 'rgba(20,12,24,0)'); bgr.addColorStop(0.15, 'rgba(20,12,24,0.85)'); bgr.addColorStop(0.85, 'rgba(20,12,24,0.85)'); bgr.addColorStop(1, 'rgba(20,12,24,0)'); g.fillStyle = bgr; g.fill();
        txt(g, b.a, st.x + st.w / 2, by3 + (b.b ? 18 : bh / 2), { size: F + 6, align: 'center', color: b.c, ow: 4, tag: 'banner', max: bw - 20 });
        if (b.b) txt(g, b.b, st.x + st.w / 2, by3 + 39, { size: F - 1, align: 'center', color: '#f0e4d0', ow: 3, tag: 'banner', max: bw - 24 });
        g.restore(); uiList.push({ name: 'banner', x: bx3, y: by3, w: bw, h: bh }); }
    }
    function foeHome(f) { var st = L.stage, n = Math.max(1, f.n), slots = n === 1 ? [0.76] : n === 2 ? [0.66, 0.87] : [0.56, 0.735, 0.91]; return { x: st.x + st.w * slots[Math.min(f.slot, slots.length - 1)] }; }
    function iconAt(g, key, x, y, r) { var done = false; if (opt.drawIcon) { try { done = opt.drawIcon(g, key, x, y, r * 2) === true; } catch (e) { done = false; } } if (!done) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = '#6a8ac8'; g.fill(); } }
    function heroCard(g, h, r, i, t) {
      var sk = lib.skills[h.def.skill], F = L.font, ready = h.ready, gd = lib.gems[h.def.gem] || {}, col = gd.colors || ['#333', '#888', '#ccc', '#fff'];
      plate(g, r.x, r.y, r.w, r.h, { name: 'card:' + h.id, r: 10, stroke: ready ? 'rgba(255,220,120,1)' : 'rgba(222,182,112,0.75)', lw: ready ? 2.5 : 1.6, top: mix(col[0], '#2a2028', 0.55), bottom: 'rgba(18,12,18,0.97)' });
      if (ready) { g.save(); g.globalAlpha = 0.35 + 0.3 * Math.sin(t * 5); g.shadowColor = '#ffd25a'; g.shadowBlur = 14; rr(g, r.x, r.y, r.w, r.h, 10); g.strokeStyle = '#ffe08a'; g.lineWidth = 3; g.stroke(); g.restore(); }
      // portrait: the hero's own art, upper body, clipped
      var pr = L.mode === 'tall' ? { x: r.x + 5, y: r.y + 5, w: r.w - 10, h: 46 } : { x: r.x + 5, y: r.y + 5, w: 46, h: 54 };
      g.save(); rr(g, pr.x, pr.y, pr.w, pr.h, 7); g.clip(); var pg = g.createLinearGradient(0, pr.y, 0, pr.y + pr.h); pg.addColorStop(0, mix(col[1], '#000000', 0.45)); pg.addColorStop(1, mix(col[0], '#000000', 0.5)); g.fillStyle = pg; g.fillRect(pr.x, pr.y, pr.w, pr.h);
      var ph = L.mode === 'tall' ? pr.h * 2.5 : pr.h * 2.15; drawActor(g, { id: h.id, kind: 'hero', key: h.id, look: h.def.look, x: L.mode === 'tall' ? pr.x + pr.w * 0.32 : pr.x + pr.w * 0.5, footY: pr.y + ph * 0.93, h: ph, lift: 0, facing: 'right', flash: 0, alpha: 1, portrait: true, target: null });
      g.restore(); rr(g, pr.x, pr.y, pr.w, pr.h, 7); g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,230,180,0.5)'; g.stroke();
      // the gem it feeds
      gemIcon(g, h.def.gem, pr.x + pr.w - 9, pr.y + 10, 8);
      var tx = L.mode === 'tall' ? r.x + 8 : pr.x + pr.w + 6, tw = r.x + r.w - 6 - tx;
      if (L.mode === 'tall') {
        txt(g, h.def.name, pr.x + 4, pr.y + pr.h - 10, { size: F - 1, color: '#fff4e0', ow: 3.5, max: pr.w - 30, tag: 'card' });
        var by = r.y + 56, bw = r.w - 16;
        bar(g, r.x + 8, by, bw, 19, sk ? h.shown / sk.cost : 0, 0, [col[2], col[1]]);
        txt(g, sk ? (ready ? 'READY ' + (i + 1) : Math.round(Math.min(h.charge, sk.cost)) + '/' + sk.cost) : '-', r.x + 8 + bw / 2, by + 10, { size: F - 3, align: 'center', color: '#ffffff', ow: 3, tag: 'card' });
        txt(g, sk ? sk.name : '', r.x + r.w / 2, r.y + 86, { size: F - 2, align: 'center', color: ready ? '#ffe08a' : '#d8c8b0', max: r.w - 10, tag: 'card' });
      } else {
        txt(g, h.def.name, tx, r.y + 16, { size: F, color: '#fff4e0', max: tw, tag: 'card' });
        txt(g, 'ATK ' + h.def.atk, tx, r.y + 34, { size: F - 2, color: '#d8c8b0', max: tw, tag: 'card' });
        txt(g, 'HP ' + h.def.hp, tx, r.y + 50, { size: F - 2, color: '#d8c8b0', max: tw, tag: 'card' });
        var by2 = r.y + 66, bw2 = r.w - 12;
        bar(g, r.x + 6, by2, bw2, 14, sk ? h.shown / sk.cost : 0, 0, [col[2], col[1]]);
        txt(g, sk ? (ready ? 'READY [' + (i + 1) + ']' : Math.round(Math.min(h.charge, sk.cost)) + ' / ' + sk.cost) : '-', r.x + 6 + bw2 / 2, by2 + 7.5, { size: F - 3, align: 'center', color: '#ffffff', ow: 3, tag: 'card' });
        txt(g, sk ? sk.name : '', r.x + r.w / 2, r.y + 92, { size: F - 2, align: 'center', color: ready ? '#ffe08a' : '#d8c8b0', max: r.w - 10, tag: 'card' });
      }
    }
    function drawUI(g) {
      if (!S) return; uiList = [];
      g.save(); g.translate(L.ox, L.oy); g.scale(L.s, L.s); MIN_FONT = L.mode === 'tall' ? 16 : 0; try { drawUIInner(g); } finally { MIN_FONT = 0; } g.restore();
    }

    /* ---------- public ---------- */
    self.start = start;
    self.update = update;
    self.drawScene = drawScene;
    self.drawUI = drawUI;
    self.key = function (k, b) { return key(k, b); };
    self.pointer = pointer;
    self.setAuto = function (on) { autoOn = !!on; if (S) { S.botQ = []; S.botT = 0; } };
    self.auto = function () { return autoOn; };
    self.setView = function (v) { view = v || view; fit(); };
    self.params = function () { return P; };
    self.setParam = function (k, v) { P[k] = v; if (k === 'layout') fit(); };
    self.lib = lib;
    self.api = api;
    self.rng = function () { return S ? S.rf() : 0; };
    self.phase = function () { return S ? S.phase : 'none'; };
    self.busy = function () { return !S || S.phase !== 'idle' || !!S.cur || S.q.length > 0; };
    self.board = function () { return S ? S.b : null; };
    self.moves = function () { return S ? R.moves(S.b) : []; };
    self.swap = function (i, j) { return trySwap(i, j); };
    self.cast = function (i) { return castSkill(i); };
    self.target = function (id) { if (id != null && S) { var f = S.foes.filter(function (q) { return q.id === id && q.hp > 0; })[0]; if (f) S.target = id; } return S ? S.target : null; };
    self.heroes = function () { return S ? S.heroes : []; };
    self.foes = function () { return S ? S.foes : []; };
    self.party = function () { return S ? S.party : null; };
    self.events = function () { return S && S.log ? S.log : []; };
    self.layout = function () { return L; };
    self.cellRect = function (i) { var p = cellXY(i); return toHost({ x: p.x - L.cell / 2, y: p.y - L.cell / 2, w: L.cell, h: L.cell }); };
    self.boardRect = function () { return toHost(L.board); };
    self.fieldRect = function () { return toHost(L.stage); };
    self.uiRects = function () { return uiList.map(function (u) { var r = toHost(u); r.name = u.name; return r; }); };
    self.anchor = function (id) {
      if (!S) return null;
      var a = null;
      if (id === 'party') { var Pb = L.party; return toAnchor({ x: Pb.x, y: Pb.y, w: Pb.w, h: Pb.h }, false); }
      S.heroes.forEach(function (h) { if (h.id === id) { var p = heroPos(h); a = toAnchor(boxOf(actorInfo('hero', h, p)), false, p); } });
      S.foes.forEach(function (f) { if (f.id === id) { var p = foePos(f); a = toAnchor(boxOf(actorInfo('foe', f, p)), f.hp <= 0, p); } });
      return a;
    };
    function toAnchor(b, dead, p) { var r = toHost(b); return { x: r.x + r.w / 2, top: r.y, left: r.x, w: r.w, h: r.h, cy: r.y + r.h * 0.55, footY: p ? L.oy + p.footY * L.s : r.y + r.h, dead: !!dead }; }
    self.unitRects = function () {
      if (!S) return [];
      var out = [];
      S.heroes.forEach(function (h) { var b = toHost(boxOf(actorInfo('hero', h, heroPos(h)))); b.id = h.id; b.kind = 'hero'; out.push(b); });
      S.foes.forEach(function (f) { if (f.hp <= 0 || f.enter <= 0) return; var b = toHost(boxOf(actorInfo('foe', f, foePos(f)))); b.id = f.id; b.kind = 'foe'; out.push(b); });
      return out;
    };
    /* text state: who stands where, faces which way, targets whom (feet in host px) */
    self.actors = function () {
      if (!S) return [];
      var out = [];
      S.heroes.forEach(function (h) { var p = heroPos(h), i = actorInfo('hero', h, p), tf = targetFoe(); var hb = toHost(boxOf(i)); out.push({ id: h.id, kind: 'hero', asset: h.def.look, box: { x: Math.round(hb.x), y: Math.round(hb.y), w: Math.round(hb.w), h: Math.round(hb.h) }, x: Math.round(L.ox + p.x * L.s), y: Math.round(L.oy + p.footY * L.s), facing: i.facing, target: h.anim && h.anim.target ? h.anim.target : tf ? tf.id : null, anim: i.anim }); });
      S.foes.forEach(function (f) { if (f.enter <= 0 || f.dead >= 1) return; var p = foePos(f), i = actorInfo('foe', f, p); out.push({ id: f.id, kind: 'foe', asset: f.def.look, x: Math.round(L.ox + p.x * L.s), y: Math.round(L.oy + p.footY * L.s), facing: i.facing, target: i.target, hp: f.hp, cd: f.cd, anim: i.anim, dead: f.hp <= 0,
          strike: (function () { if (!f.anim || f.anim.kind === 'bolt') return null; var b = toHost(strikeBox(f)); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) }; })(),
          pose: { dx: +((p.x - foeHomePos(f).x) / p.h).toFixed(3), lift: +((p.lift - (f.def.hover != null ? f.def.hover : DEF_HOVER[f.def.look] || 0) * p.h) / p.h).toFixed(3), sq: +(p.sq || 0).toFixed(3), k: f.anim ? +(f.anim.t / f.anim.dur).toFixed(3) : null } }); });
      return out;
    };
    self.state = function () {
      if (!S) return { phase: 'none' };
      return { phase: S.phase, step: S.cur ? S.cur.kind : null, turn: S.turn, wave: S.wave + 1, waves: S.waves.length, hp: S.party.hp, max: S.party.max, ward: S.party.ward, chain: S.chain,
        target: S.target, sel: S.sel, cursor: S.cursor.i, foes: S.foes.filter(function (f) { return f.hp > 0; }).map(function (f) { return f.key + ':' + f.hp + '@' + f.cd; }).join(' '),
        charges: S.heroes.map(function (h) { return h.charge; }).join(','), ms: Math.round(S.ms), recent: S.recent.slice(), board: R.key(S.b), stats: copy(S.stats), layout: L.mode, ended: ended };
    };
    /* demos and tests: lay out the board from rows of letters (first letter of a gem id; a suffix - | + * marks a Row,
       Column, Blast special; P = Prism), e.g. ['eetsg...', ...] with one token per cell separated by spaces. Only while idle. */
    self.setBoard = function (rows) {
      if (!S || S.phase !== 'idle' || S.cur || S.q.length) return false;
      var ids = Object.keys(lib.gems), byLetter = {}; ids.forEach(function (id) { if (!byLetter[id.charAt(0)]) byLetter[id.charAt(0)] = id; });
      rows.forEach(function (row, r) { String(row).trim().split(/\s+/).forEach(function (tok, c) {
        if (r >= P.rows || c >= P.cols) return; var g, sp = tok.length > 1 ? { '-': 'h', '|': 'v', '*': 'bomb' }[tok.charAt(1)] || null : null;
        if (tok.charAt(0) === 'P') g = R.gem(S.b, 'prism', 'prism'); else g = R.gem(S.b, byLetter[tok.charAt(0)] || ids[0], sp);
        setHome(g, r * P.cols + c); g.y -= P.rows + 1 + (P.cols - c) * 0.12; S.b.cells[r * P.cols + c] = g; }); });
      ev({ kind: 'setBoard', board: R.key(S.b) });
      S.phase = 'busy'; S.sel = -1; S.q.push({ kind: 'drop', dur: 1e9, tick: tickFall }); S.q.push(step('ready', 0, function () { toIdle(); }));
      return true;
    };
    self.numberRects = function () { if (!S) return []; return S.fx.nums.map(function (n) { var q = numPos(n); if (!q) return null; var b = toHost(q.box); b.owner = n.owner; b.text = n.text; b.alpha = q.alpha; return b; }).filter(Boolean); };
    self.gemPositions = function () { return S ? S.b.cells.map(function (g) { return g ? { id: g.id, x: g.x, y: g.y, t: g.t, sp: g.sp, pop: g.pop } : null; }) : []; };
    self.drawGem = function (g, gid, x, y, r, sp) { var d = gid === 'prism' ? PRISM : lib.gems[gid]; if (!d) return; if (sp === 'prism' || gid === 'prism') paintPrism(g, x, y, r, 0); else { paintGem(g, d, x, y, r); if (sp) paintSpecial(g, d, sp, x, y, r, 0); } };
    return self;
  }
