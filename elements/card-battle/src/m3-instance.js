  /* ===================================================================================================
     card-battle.js part 3: the bot, the instance (step queue, input, autoplay, layout, playback effects,
     drawScene / drawUI), the public API.
     =================================================================================================== */

  // ---- Bot: a bounded search over this turn's plays, scored by the state at the end of the turn. ----
  function botScore(S) {
    if (S.over === 'win') return 1e6 + S.hero.hp * 10;
    if (S.over === 'lose') return -1e6;
    var foes = alive(S), inc = 0, sc = 0;
    foes.forEach(function (f) { var v = intentView(S, f); if (v) inc += v.damage; });
    var loss = Math.max(0, inc - S.hero.ward) + st(S.hero, 'burn'), wHp = 1.3 + (1 - S.hero.hp / S.hero.maxHp) * 2.4;
    foes.forEach(function (f) { var b = st(f, 'burn'); sc -= f.hp; sc += Math.min(f.hp, b * (b + 1) / 2) * 0.75 + st(f, 'exposed') * 2.5 + st(f, 'sapped') * 1.5 - st(f, 'might') * 2; });
    sc += (S.foes.length - foes.length) * 14;
    sc += (S.hero.hp - Math.min(loss, S.hero.hp)) * wHp; if (loss >= S.hero.hp) sc -= 5000;
    sc += st(S.hero, 'might') * 5 + st(S.hero, 'barbs') * 3 - st(S.hero, 'exposed') * 2 - st(S.hero, 'sapped') * 2;
    sc += S.hand.length * 0.6 + Math.min(S.hero.ward, inc) * 0.02;
    return sc;
  }
  function botMoves(S) {
    var seen = {}, list = [];
    S.hand.forEach(function (c) {
      if (!canPlay(S, c) || seen[c.id]) return; seen[c.id] = 1;
      if (needsTarget(S, c.id)) { var fs = {}; alive(S).forEach(function (f) { var k = f.kind + ':' + f.hp + ':' + f.ward + ':' + JSON.stringify(f.st) + ':' + (f.intent && f.intent.move); if (fs[k]) return; fs[k] = 1; list.push({ uid: c.uid, target: f.id }); }); }
      else list.push({ uid: c.uid, target: null });
    });
    return list;
  }
  function botPlan(S0, limit) {
    var best = { sc: botScore(S0), first: null }, nodes = 0;
    (function dfs(S, depth, first) {
      var ms = botMoves(S);
      for (var i = 0; i < ms.length && nodes < limit; i++) {
        nodes++; var C = cloneState(S), out = [], steps = playSteps(C, ms[i].uid, ms[i].target); if (!steps) continue;
        runAll(C, steps, out); var f = first || ms[i], sc = botScore(C);
        if (sc > best.sc + 0.01) best = { sc: sc, first: f };
        if (!C.over && depth < 6) dfs(C, depth + 1, f);
      }
    })(S0, 0, null);
    return best.first;
  }

  var DEFAULTS = { light: 'on', energy: 3, draw: 5, handMax: 10, speed: 1, numbers: 'on', intents: 'on', fan: 6, arrow: 'on', shake: 'on', reduced: 'off', hitstop: 'on', botNodes: 1400 };
  var W = 640, H = 360;
  var LOOK_BOX = { toad: [104, 84], wisp: [64, 104], brute: [150, 124], imp: [70, 86], thief: [84, 124], golem: [190, 150], slime: [92, 60], bat: [110, 90] };
  var PLAY_SPOT = { x: 62, y: 112 }, PLAY_SCALE = 0.86, TAG_MIN_Y = 34, BANNER_Y = 190, DRAW_PILE = { x: 556, y: 300, w: 32, h: 46 }, DISC_PILE = { x: 598, y: 300, w: 32, h: 46 }, END_BTN = { x: 552, y: 252, w: 82, h: 36 };
  var HERO_PANEL = { x: 8, y: 262, w: 166, h: 90 }, ENERGY = { x: 86, y: 314, w: 80, h: 18 }, HAND_CX = 366, CARD_W = 76, FOOT_Y = 214;

  function merge(base, extra) { var r = {}, k; for (k in base) r[k] = base[k]; for (k in (extra || {})) if (extra[k]) r[k] = extra[k]; return r; }

  function create(opt) {
    opt = opt || {};
    var P = merge(DEFAULTS, opt.params || {});
    var lib = { cards: merge(CARDS, opt.cards), enemies: merge(ENEMIES, opt.enemies), statuses: merge(STATUSES, opt.statuses) };
    var view = opt.view || { x: 0, y: 0, w: W, h: H };
    var SK = null; try { SK = root.GameDNA_Skin && opt.skin != null && opt.skin !== false ? root.GameDNA_Skin.resolve(opt.skin) : null; } catch (e) { SK = null; }
    if (SK && SK.fonts && SK.fonts.ui && !SK.pixel) fontFamily = SK.fonts.ui;
    var S = null, queue = [], wait = 0, frame = 0, T = 0, stop = 0, endT = -1, ended = false, log = [];
    var vis = { u: {}, c: {}, fly: [], fx: [], nums: [], banner: null, shake: 0, shakePx: 0, hurt: 0, readout: null, playing: null };
    var ui = { cursor: 0, kbd: false, sel: null, aim: null, drag: null, hover: null, hoverFoe: null, ptr: { x: 0, y: 0 }, pending: null, deny: 0, denyUid: null };
    var auto = { on: !!opt.autoplay, t: 0, step: 0, move: null };
    var L = { foes: {}, cards: [], intents: {}, plates: {}, hero: null, ui: [] };
    function call(fn) { if (typeof fn !== 'function') return; try { return fn.apply(null, Array.prototype.slice.call(arguments, 1)); } catch (e) { if (root.console) console.error('card-battle callback: ' + e.message); } }
    function fr(n) { return Math.max(1, Math.round(n / Math.max(0.25, +P.speed || 1))); }
    function reduced() { return P.reduced === 'on'; }

    // ---------- fight setup ----------
    function start(setup) {
      setup = setup || {};
      S = newState({ deck: setup.deck || defaultDeck(), foes: setup.foes || ['mire-toad', 'ash-wisp'], hero: setup.hero || { hp: 64, maxHp: 64, name: 'Lanternbearer' }, seed: setup.seed || opt.seed || 1,
        energy: setup.energy || +P.energy || 3, draw: setup.draw || +P.draw || 5, handMax: +P.handMax || 10 }, lib);
      queue = []; wait = 0; endT = -1; ended = false; log = [];
      vis = { u: {}, c: {}, fly: [], fx: [], nums: [], banner: null, shake: 0, shakePx: 0, hurt: 0, readout: null, playing: null };
      ui.sel = null; ui.aim = null; ui.drag = null; ui.cursor = 0; ui.pending = null; auto.t = 0; auto.step = 0; auto.move = null;
      S.foes.concat([S.hero]).forEach(function (u) { vis.u[u.id] = { flash: 0, act: 0, actMax: 1, dead: 0, ghost: u.hp, intentPop: 0, hitDir: 0 }; });
      var out = []; rollIntents(S, out); handle(out);
      queue = startTurnSteps(S); wait = 12;
      layout();
      return inst;
    }
    function defaultDeck() { return ['thorn-jab', 'thorn-jab', 'thorn-jab', 'thorn-jab', 'bark-ward', 'bark-ward', 'bark-ward', 'bark-ward', 'ember-toss', 'root-snare']; }

    // ---------- events from the rules -> playback, callbacks ----------
    function anchorOf(id) { return inst.anchor(id); }
    function spawnNum(id, s, col, size, small) {
      if (P.numbers === 'off') return; var a = anchorOf(id); if (!a) return;
      var live = vis.nums.filter(function (n) { return n.id === id && n.age < 44; }), hero = id === S.hero.id;
      var big = live.filter(function (n) { return !n.small; }).length, words = live.filter(function (n) { return n.small; }).length;
      var SIDE = [0, 1, -1, 2, -2, 3, -3], k = SIDE[big % SIDE.length], x, y, dir;
      if (small) { x = hero ? a.x + 34 : a.x + a.w * 0.36 + 6; y = (hero ? a.top + 8 : a.top + a.h * 0.32) + words * 12; dir = 0; }
      else { x = a.x + k * 20; y = hero ? a.top - 8 : a.top + Math.min(30, a.h * 0.22) - Math.abs(k) * 4; dir = k === 0 ? 0 : k > 0 ? 1 : -1; }
      vis.nums.push({ id: id, text: s, col: col, size: size || 18, x: x, y: y, dir: dir, age: 0, life: small ? 56 : 60, small: !!small });
    }
    function fx(kind, x, y, o) { var f = { kind: kind, x: x, y: y, age: 0, life: (o && o.life) || 22, seed: frame + vis.fx.length * 7 }; for (var k in (o || {})) f[k] = o[k]; vis.fx.push(f); }
    function handle(out) {
      out.forEach(function (e) {
        log.push(e); if (log.length > 400) log.shift();
        var u = e.target && S ? unitById(S, e.target) : null, a = e.target ? anchorOf(e.target) : null, v = e.target && vis.u[e.target];
        if (e.kind === 'damage') {
          e.anchor = a;
          if (v) { v.flash = 10; v.hitDir = e.side === 'hero' ? 0 : 1; }
          if (e.side === 'hero') {
            if (e.amount > 0 || e.blocked > 0) { vis.hurt = e.tag === 'tick' ? 10 : 18; if (P.shake !== 'off' && !reduced()) { vis.shake = Math.max(vis.shake, 12); vis.shakePx = Math.min(7, 2 + e.raw * 0.3); } }
            if (e.tag !== 'tick') fx('claw', a ? a.x : 60, a ? a.cy : 300, { life: 20, col: e.amount > 0 ? '#ff4a4a' : '#8fd0ff' });
          } else if (a) {
            fx(e.type === 'fire' || e.type === 'burn' ? 'embers' : e.type === 'frost' ? 'shards' : e.type === 'shock' ? 'zap' : e.type === 'thorns' ? 'thorns' : 'slash', a.x, a.cy, { life: 18, big: e.raw >= 12 });
            if (P.shake !== 'off' && !reduced() && e.raw >= 10) { vis.shake = Math.max(vis.shake, 8); vis.shakePx = 3; }
            if (P.hitstop === 'on' && e.raw >= 13 && !reduced()) stop = Math.max(stop, 4);
          }
          if (e.blocked > 0 && a) { fx('wardHit', a.x, a.cy, { life: 16 }); spawnNum(e.target, 'blocked ' + e.blocked, '#8fd0ff', 11, true); }
          if (e.amount > 0) spawnNum(e.target, '' + e.amount, e.side === 'hero' ? '#ff6a5a' : e.type === 'burn' ? '#ffb24a' : '#ffffff', e.amount >= 12 ? 24 : 19);
          call(opt.onHit, e);
        } else if (e.kind === 'heal') { e.anchor = a; if (a) fx('heal', a.x, a.cy, { life: 26 }); if (e.amount > 0) spawnNum(e.target, '+' + e.amount, '#7cf09a', 18); call(opt.onHit, e); }
        else if (e.kind === 'ward') { if (a) fx('ward', a.x, a.cy, { life: 20 }); spawnNum(e.target, '+' + e.amount + ' ward', '#8fd0ff', 11, true); }
        else if (e.kind === 'status') { var d = lib.statuses[e.id]; if (a) fx('puff', a.x, a.cy, { life: 22, col: (d && d.color) || '#ccc' }); spawnNum(e.target, (e.amount > 0 ? '' : '') + ((d && d.name) || e.id) + ' ' + (e.amount > 0 ? '+' : '') + e.amount, (d && d.color) || '#ddd', 11, true); }
        else if (e.kind === 'death') { if (vis.u[e.unit]) vis.u[e.unit].dead = 1; var da = anchorOf(e.unit); if (da) fx('death', da.x, da.cy, { life: 40, w: da.w, h: da.h }); }
        else if (e.kind === 'draw') { vis.c[e.uid] = { x: DRAW_PILE.x + 16, y: DRAW_PILE.y + 20, r: -0.6, s: 0.4, a: 1, born: frame }; }
        else if (e.kind === 'gain') { vis.c[e.uid] = { x: PLAY_SPOT.x, y: PLAY_SPOT.y, r: 0, s: 0.2, a: 1, born: frame }; }
        else if (e.kind === 'play') {
          var cv = vis.c[e.uid] || { x: HAND_CX, y: 320, r: 0, s: 1 };
          vis.playing = { uid: e.uid, id: e.id, x: cv.x, y: cv.y, r: cv.r, s: cv.s, t: 0, target: e.target };
          if (ui.sel === e.uid) { ui.sel = null; ui.aim = null; }
          delete vis.c[e.uid];
          vis.readout = { text: cardDef(S, e.id).name, t: 70, col: '#ffe9b0' };
        } else if (e.kind === 'discard' || e.kind === 'fade') {
          var from = e.from === 'hand' ? vis.c[e.uid] : vis.playing && vis.playing.uid === e.uid ? vis.playing : vis.c[e.uid];
          if (from) vis.fly.push({ uid: e.uid, id: e.id, x0: from.x, y0: from.y, r0: from.r || 0, s0: from.s || 1, t: 0, n: e.kind === 'fade' ? 30 : 18, fade: e.kind === 'fade' });
          delete vis.c[e.uid]; if (vis.playing && vis.playing.uid === e.uid) vis.playing = null;
        } else if (e.kind === 'reshuffle') { for (var i = 0; i < Math.min(8, e.n); i++) vis.fly.push({ back: true, x0: DISC_PILE.x + 16, y0: DISC_PILE.y + 23, t: -i * 2, n: 20 }); vis.readout = { text: 'Discard shuffled into the draw pile', t: 60, col: '#cfe3ff' }; }
        else if (e.kind === 'turn') { vis.banner = { text: 'YOUR TURN', sub: 'Turn ' + e.turn, t: 0, n: 62, col: '#ffd27a' }; call(opt.onTurn, e.turn, 'player'); ui.cursor = 0; }
        else if (e.kind === 'endTurn') { vis.banner = { text: 'FOES ACT', sub: '', t: 0, n: 46, col: '#ff8a7a' }; call(opt.onTurn, e.turn, 'enemy'); ui.sel = null; ui.aim = null; }
        else if (e.kind === 'act') { if (vis.u[e.unit]) { vis.u[e.unit].act = fr(26); vis.u[e.unit].actMax = fr(26); } var f = unitById(S, e.unit); vis.readout = { text: (f ? f.name : '') + ': ' + e.name, t: 70, col: '#ffb0a0' }; }
        else if (e.kind === 'intent') { if (vis.u[e.unit]) vis.u[e.unit].intentPop = 0; }
        else if (e.kind === 'end') { endT = 70; vis.banner = { text: e.result === 'win' ? 'VICTORY' : 'DEFEAT', sub: e.result === 'win' ? 'The road is clear' : 'The lantern gutters out', t: 0, n: 9999, col: e.result === 'win' ? '#ffd76a' : '#ff7a7a', end: true }; ui.sel = null; ui.aim = null; ui.drag = null; }
        call(opt.onEvent, e);
      });
    }

    // ---------- the step queue ----------
    function busy() { return !!S && (queue.length > 0 || wait > 0 && queue.length > 0); }
    function idle() { return !!S && !S.over && S.side === 'player' && !queue.length; }
    function runQueue() {
      if (!S) return;
      wait -= 1;
      var guard = 0;
      while (wait <= 0 && queue.length && guard++ < 50) {
        var s = queue.shift(), out = [];
        if (S.over && !s.always) { queue = []; break; }
        try { s.run(out); } catch (e) { if (root.console) console.error('card-battle step: ' + e.message); }
        handle(out);
        wait += fr(s.wait || 1);
      }
      if (!queue.length && wait < 0) wait = 0;
    }
    function play(uid, target) {
      if (!idle()) return false;
      var steps = playSteps(S, uid, target); if (!steps) return false;
      queue = queue.concat(steps); wait = Math.max(wait, 0); ui.sel = null; ui.aim = null; ui.drag = null; auto.t = 0;
      return true;
    }
    function endTurn() { if (!idle()) return false; queue = queue.concat(endTurnSteps(S)); ui.sel = null; ui.aim = null; ui.drag = null; ui.cursor = 0; auto.t = 0; return true; }

    // ---------- input ----------
    function handCard(uid) { for (var i = 0; i < S.hand.length; i++) if (S.hand[i].uid === uid) return S.hand[i]; return null; }
    function aliveFoes() { return S ? alive(S) : []; }
    function defaultTarget() { var a = aliveFoes(); if (!a.length) return null; if (ui.aim && unitById(S, ui.aim) && unitById(S, ui.aim).hp > 0) return ui.aim; return a[0].id; }
    function deny(uid, msg) { ui.deny = 20; ui.denyUid = uid; vis.readout = { text: msg, t: 60, col: '#ff9a8a' }; }
    function select(uid) {
      var c = handCard(uid); if (!c) return false;
      if (!canPlay(S, c)) { deny(uid, S.side !== 'player' ? 'Wait for your turn' : cardDef(S, c.id).unplayable ? 'This card cannot be played' : 'Not enough Lumen'); return false; }
      ui.sel = uid; ui.aim = needsTarget(S, c.id) ? defaultTarget() : null; return true;
    }
    function key(k) {
      if (!S || S.over) return false;
      if (k === 'end') { if (idle()) endTurn(); else ui.pending = 'end'; return true; }
      if (['left', 'right', 'up', 'down', 'ok', 'back'].indexOf(k) < 0) return false;
      ui.kbd = true; ui.hover = null; ui.hoverFoe = null; var n = S.hand.length;
      if (ui.sel != null && handCard(ui.sel)) {
        var c = handCard(ui.sel), tgt = needsTarget(S, c.id);
        if (k === 'back' || k === 'down') { ui.sel = null; ui.aim = null; return true; }
        if (tgt && (k === 'left' || k === 'right')) { var a = aliveFoes(), i = Math.max(0, a.map(function (f) { return f.id; }).indexOf(ui.aim)); i = (i + (k === 'left' ? -1 : 1) + a.length) % a.length; ui.aim = a.length ? a[i].id : null; return true; }
        if (!tgt && (k === 'left' || k === 'right')) { ui.sel = null; ui.cursor = clamp(ui.cursor + (k === 'left' ? -1 : 1), 0, n); return true; }
        if (k === 'ok' || k === 'up') { if (!idle()) { ui.pending = 'ok'; return true; } play(ui.sel, tgt ? ui.aim : null); return true; }
        return true;
      }
      if (k === 'left') ui.cursor = Math.max(0, Math.min(ui.cursor, n) - 1);
      else if (k === 'right') ui.cursor = Math.min(n, ui.cursor + 1);
      else if (k === 'ok' || k === 'up') {
        if (ui.cursor >= n) { if (k === 'ok') { if (idle()) endTurn(); else ui.pending = 'end'; } return true; }
        var cc = S.hand[clamp(ui.cursor, 0, n - 1)]; if (cc) select(cc.uid);
      } else if (k === 'back') { ui.sel = null; }
      return true;
    }
    function toLocal(x, y) { return { x: (x - view.x) * W / view.w, y: (y - view.y) * H / view.h }; }
    function inRect(p, r) { return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
    function cardAt(p) { for (var i = L.cards.length - 1; i >= 0; i--) { var r = L.cards[i]; if (r.uid === ui.sel && inRect(p, r)) return r; } for (i = L.cards.length - 1; i >= 0; i--) if (inRect(p, L.cards[i])) return L.cards[i]; return null; }
    function foeAt(p) { var best = null; aliveFoes().forEach(function (f) { var b = L.foes[f.id]; if (b && inRect(p, { x: b.x - 8, y: b.y - 8, w: b.w + 16, h: b.h + 40 })) best = f.id; }); return best; }
    function pointer(type, x, y) {
      if (!S) return false; var p = toLocal(x, y); if (type !== 'move' || Math.abs(p.x - ui.ptr.x) + Math.abs(p.y - ui.ptr.y) > 2) ui.kbd = false; ui.ptr = p;
      if (S.over) return false;
      if (type === 'move') {
        if (ui.drag) { ui.drag.x = p.x; ui.drag.y = p.y; if (Math.abs(p.x - ui.drag.sx) + Math.abs(p.y - ui.drag.sy) > 8) ui.drag.moved = true;
          var c = handCard(ui.drag.uid); if (c && needsTarget(S, c.id) && ui.drag.moved) ui.aim = p.y < 250 ? foeAt(p) : null; return true; }
        var h = cardAt(p); ui.hover = h ? h.uid : null; ui.hoverFoe = foeAt(p); return false;
      }
      if (type === 'down') {
        if (inRect(p, END_BTN)) { if (idle()) endTurn(); else ui.pending = 'end'; return true; }
        var sel = ui.sel != null ? handCard(ui.sel) : null;
        if (sel && needsTarget(S, sel.id)) { var f = foeAt(p); if (f) { if (idle()) play(sel.uid, f); else { ui.aim = f; ui.pending = 'ok'; } return true; } }
        var r = cardAt(p);
        if (r) { var was = ui.sel === r.uid; if (!was && !select(r.uid)) return true; ui.drag = { uid: r.uid, sx: p.x, sy: p.y, x: p.x, y: p.y, moved: false, was: was }; return true; }
        if (ui.sel != null) { ui.sel = null; ui.aim = null; return true; }
        return false;
      }
      if (type === 'up' || type === 'cancel') {
        var d = ui.drag; ui.drag = null; if (!d || type === 'cancel') return !!d;
        var cd = handCard(d.uid); if (!cd) return true;
        var tg = needsTarget(S, cd.id);
        if (d.moved) {
          if (tg) { var f2 = foeAt(p); if (f2 && p.y < 250) { if (!play(d.uid, f2)) { ui.sel = null; ui.aim = null; } } else { ui.sel = null; ui.aim = null; } }
          else if (p.y < 236) { if (!play(d.uid, null)) ui.sel = null; } else ui.sel = null;
        } else if (d.was && !tg) play(d.uid, null);
        return true;
      }
      return false;
    }

    // ---------- autoplay (the bot plays through the same select / aim / play path a player uses) ----------
    function runAuto() {
      if (!auto.on || !S || S.over) return;
      if (ui.pending && idle()) { var pk = ui.pending; ui.pending = null; key(pk); }
      if (!idle() || ui.drag) { auto.t = 0; return; }
      auto.t++;
      var at = function (n) { return auto.t === fr(n); };
      if (at(14)) {
        var m = null;
        if (typeof opt.autoplay === 'function') { m = call(opt.autoplay, inst); if (m === undefined) m = botPlan(S, +P.botNodes || 1400); }
        else m = botPlan(S, +P.botNodes || 1400);
        auto.move = m || 'end';
        if (auto.move === 'end') { ui.cursor = S.hand.length; ui.sel = null; }
        else { var i = -1; S.hand.forEach(function (c, j) { if (c.uid === auto.move.uid) i = j; }); if (i < 0) auto.move = 'end'; else { ui.cursor = i; ui.sel = auto.move.uid; ui.aim = null; } }
      }
      if (at(26) && auto.move && auto.move !== 'end' && auto.move.target) ui.aim = auto.move.target;
      if (at(auto.move && auto.move !== 'end' && auto.move.target ? 46 : 34)) {
        var mv = auto.move; auto.move = null; auto.t = 0;
        if (mv === 'end' || !mv) endTurn(); else if (!play(mv.uid, mv.target)) endTurn();
      }
    }

    // ---------- layout (computed in update, so frozen frames match play) ----------
    function foeBox(f, i, n) {
      var d = enemyDef(S, f.kind), sz = d.box || LOOK_BOX[d.look] || [90, 100], s = 0.92 * (d.size || 1);
      var xs = n === 1 ? [376] : n === 2 ? [300, 452] : n === 3 ? [250, 376, 502] : null;
      var x = xs ? xs[i] : 222 + i * (320 / Math.max(1, n - 1));
      if (!xs && n > 5) s *= 0.8;
      return { cx: x, footY: FOOT_Y, w: sz[0] * s, h: sz[1] * s, s: s };
    }
    function handTargets() {
      var n = S.hand.length, out = [], focus = -1;
      if (ui.sel != null) S.hand.forEach(function (c, i) { if (c.uid === ui.sel) focus = i; });
      else if (ui.hover != null && !ui.kbd) S.hand.forEach(function (c, i) { if (c.uid === ui.hover) focus = i; });
      else if (ui.kbd && ui.cursor < n) focus = ui.cursor;
      var spread = Math.min(62, 320 / Math.max(1, n)), step = Math.min(+P.fan || 6, 40 / Math.max(1, n));
      S.hand.forEach(function (c, i) {
        var off = i - (n - 1) / 2, x = HAND_CX + off * spread, y = 322 + off * off * 1.4, r = off * step * Math.PI / 180, s = 1;
        if (focus >= 0 && i !== focus) x += (i < focus ? -1 : 1) * Math.min(18, 110 / n);
        if (i === focus) { y = ui.sel === c.uid ? 280 : 286; r = 0; s = ui.sel === c.uid ? 1.24 : 1.2; }
        if (ui.drag && ui.drag.uid === c.uid && ui.drag.moved && !(needsTarget(S, c.id))) { x = ui.drag.x; y = ui.drag.y; s = 1.15; r = 0; }
        if (ui.deny > 0 && ui.denyUid === c.uid) x += Math.sin(ui.deny * 1.7) * 4;
        out.push({ uid: c.uid, id: c.id, x: x, y: y, r: r, s: s, focus: i === focus, z: i === focus ? 99 : i });
      });
      return out;
    }
    function layout() {
      if (!S) return;
      var n = S.foes.length; L.foes = {};
      S.foes.forEach(function (f, i) {
        var b = foeBox(f, i, n), v = vis.u[f.id] || {}, lunge = 0, k = v.act > 0 ? 1 - v.act / v.actMax : 0;
        if (v.act > 0) lunge = Math.sin(clamp(k, 0, 1) * Math.PI);
        var sc = b.s * (1 + lunge * 0.14), dy = lunge * 16, rec = v.flash > 0 && v.hitDir ? v.flash * 0.5 : 0;
        L.foes[f.id] = { cx: b.cx, footY: b.footY + dy, x: b.cx - b.w * (sc / b.s) / 2, y: b.footY + dy - b.h * (sc / b.s) - rec, w: b.w * sc / b.s, h: b.h * sc / b.s, s: sc, lunge: lunge, home: b };
      });
      var hv = handTargets(); L.cards = [];
      hv.forEach(function (t) {
        var c = vis.c[t.uid]; if (!c) c = vis.c[t.uid] = { x: DRAW_PILE.x + 16, y: DRAW_PILE.y + 20, r: -0.5, s: 0.4, a: 1, born: frame };
        var k = ui.drag && ui.drag.uid === t.uid && ui.drag.moved ? 0.6 : 0.24;
        c.x = lerp(c.x, t.x, k); c.y = lerp(c.y, t.y, k); c.r = lerp(c.r, t.r, k); c.s = lerp(c.s, t.s, k);
        var w = CARD_W * c.s, h = w * 1.5;
        L.cards.push({ uid: t.uid, id: t.id, x: c.x - w / 2, y: c.y - h / 2, w: w, h: h, cx: c.x, cy: c.y, r: c.r, s: c.s, focus: t.focus, z: t.z });
      });
      L.cards.sort(function (a, b) { return a.z - b.z; });
    }

    // ---------- update ----------
    function update(dt) {
      if (!S) return;
      if (!(dt > 0)) return;
      frame++; T += dt / 1000;
      if (stop > 0) { stop--; return; }
      if (ui.deny > 0) ui.deny--;
      runQueue();
      if (ui.pending && idle() && !auto.on) { var pk = ui.pending; ui.pending = null; key(pk); }
      runAuto();
      Object.keys(vis.u).forEach(function (id) {
        var v = vis.u[id], u = unitById(S, id); if (v.flash > 0) v.flash--; if (v.act > 0) v.act--; if (v.dead > 0 && v.dead < 60) v.dead++; if (v.intentPop < 20) v.intentPop++;
        if (u) v.ghost = v.ghost > u.hp ? Math.max(u.hp, v.ghost - Math.max(0.35, (v.ghost - u.hp) * 0.06)) : u.hp;
      });
      if (vis.playing) { var pl = vis.playing; pl.t++; pl.x = lerp(pl.x, PLAY_SPOT.x, 0.2); pl.y = lerp(pl.y, PLAY_SPOT.y, 0.2); pl.r = lerp(pl.r, 0, 0.2); pl.s = lerp(pl.s, PLAY_SCALE, 0.2); }
      vis.fly = vis.fly.filter(function (f) { f.t++; return f.t < f.n; });
      vis.fx = vis.fx.filter(function (f) { f.age++; return f.age < f.life; });
      vis.nums = vis.nums.filter(function (n) { n.age++; return n.age < n.life; });
      if (vis.banner && !vis.banner.end) { vis.banner.t++; if (vis.banner.t >= vis.banner.n) vis.banner = null; } else if (vis.banner) vis.banner.t++;
      if (vis.readout) { vis.readout.t--; if (vis.readout.t <= 0) vis.readout = null; }
      if (vis.shake > 0) vis.shake--; if (vis.hurt > 0) vis.hurt--;
      layout();
      if (endT > 0) { endT--; if (endT === 0 && !ended) { ended = true; call(opt.onEnd, S.over, { turns: S.turn, hero: { hp: S.hero.hp, maxHp: S.hero.maxHp }, stats: copyObj(S.stats), deck: S.deck.map(function (c) { return c.id; }) }); } }
    }

    // ---------- drawing ----------
    function begin(g) { g.save(); g.translate(view.x, view.y); g.scale(view.w / W, view.h / H); }
    function shakeOff() { if (vis.shake <= 0 || reduced()) return [0, 0]; var k = vis.shake / 12; return [Math.round(Math.sin(frame * 2.3) * vis.shakePx * k), Math.round(Math.cos(frame * 3.1) * vis.shakePx * k * 0.6)]; }
    function defaultBackground(g) {
      var sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#1b1530'); sky.addColorStop(0.55, '#2f2440'); sky.addColorStop(1, '#120d1c'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
      var fl = g.createLinearGradient(0, 190, 0, H); fl.addColorStop(0, '#3a2e3e'); fl.addColorStop(1, '#16101c'); g.fillStyle = fl; g.fillRect(0, 196, W, H - 196);
      glow(g, 376, 150, 220, 'rgba(255,190,110,0.18)', 1);
    }
    function drawFoe(g, f) {
      var b = L.foes[f.id], v = vis.u[f.id] || {}, d = enemyDef(S, f.kind); if (!b) return;
      var deadK = f.hp <= 0 ? clamp(v.dead / 40, 0, 1) : 0; if (deadK >= 1) return;
      g.save();
      g.save(); g.globalAlpha = 0.45 * (1 - deadK); g.beginPath(); g.ellipse(b.cx, b.footY + 2, b.w * 0.42, 7 * b.s, 0, 0, TAU); g.fillStyle = '#05030a'; g.fill(); g.restore();
      var o = { t: T, act: v.act > 0, seed: f.slot + 1, look: 0, flash: v.flash };
      var paint = function (c) {
        var breathe = Math.sin(T * 2.1 + f.slot * 1.7) * 0.012; c.scale(b.s * (1 - breathe), b.s * (1 + breathe));
        var drew = false;
        if (typeof opt.drawEnemy === 'function') { try { drew = !!opt.drawEnemy(c, f, o, d); } catch (e) { drew = false; } }
        if (!drew && typeof d.draw === 'function') { try { d.draw(c, f, o); drew = true; } catch (e) { drew = false; } }
        if (!drew) { var pal = merge(PAL[d.look] || PAL.slime, d.palette); (LOOKS[d.look] || LOOKS.slime)(c, pal, T, o); }
      };
      var lit = litFoe(g, f.id, b, paint, d);
      g.translate(b.cx, b.footY);
      if (deadK > 0) { g.globalAlpha = 1 - deadK; g.translate(0, deadK * 6); g.scale(1 + deadK * 0.1, 1 - deadK * 0.35); }
      if (lit) g.drawImage(lit.c, -lit.ox, -lit.oy, lit.w, lit.h); else paint(g);
      g.restore();
      if (v.flash > 0 && f.hp > 0 || (deadK > 0 && deadK < 0.5)) {
        g.save(); g.globalCompositeOperation = 'lighter'; glow(g, b.cx, b.y + b.h * 0.55, b.w * 0.7, 'rgba(255,255,255,' + (0.06 * v.flash) + ')', 1); g.restore();
      }
    }
    // Lighting pass: the foe is painted into its own canvas at device resolution, then gets a warm back rim (the lantern glow
    // behind it), a warm key from the left, a cool fill from the right and darker feet; drawn as one image. Deterministic.
    var litCache = {};
    function litFoe(g, id, b, paint, d) {
      if (typeof document === 'undefined' || P.light === 'off') return null;
      try {
        var tr = g.getTransform ? g.getTransform() : null, sc = tr ? Math.max(1, Math.min(3, Math.abs(tr.a))) : 1, pad = 46;
        var w = b.w / b.s * b.s + pad * 2, h = b.h + pad * 1.6, cw = Math.ceil(w * sc), ch = Math.ceil(h * sc), ox = w / 2, oy = h - pad * 0.6;
        var e = litCache[id] || (litCache[id] = { a: document.createElement('canvas'), m: document.createElement('canvas') });
        [e.a, e.m].forEach(function (c) { if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; } });
        var a = e.a.getContext('2d'), m = e.m.getContext('2d');
        a.setTransform(1, 0, 0, 1, 0, 0); a.clearRect(0, 0, cw, ch); a.setTransform(sc, 0, 0, sc, ox * sc, oy * sc); paint(a);
        a.setTransform(sc, 0, 0, sc, 0, 0); a.globalCompositeOperation = 'source-atop';
        var top = oy - b.h, kx = a.createLinearGradient(ox - b.w * 0.55, 0, ox + b.w * 0.55, 0);
        kx.addColorStop(0, 'rgba(255,196,120,0.26)'); kx.addColorStop(0.45, 'rgba(255,196,120,0)'); kx.addColorStop(0.6, 'rgba(90,120,220,0)'); kx.addColorStop(1, 'rgba(90,120,220,0.22)');
        a.fillStyle = kx; a.fillRect(0, 0, w, h);
        var ky = a.createLinearGradient(0, top, 0, oy); ky.addColorStop(0, 'rgba(255,240,210,0.10)'); ky.addColorStop(0.55, 'rgba(0,0,0,0)'); ky.addColorStop(1, 'rgba(10,6,20,0.38)');
        a.fillStyle = ky; a.fillRect(0, 0, w, h); a.globalCompositeOperation = 'source-over';
        // rim: the silhouette tinted warm, offset up-left, kept only outside the sprite
        m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, cw, ch); m.globalCompositeOperation = 'source-over'; m.drawImage(e.a, -2.2 * sc, -2.6 * sc);
        m.globalCompositeOperation = 'source-in'; m.fillStyle = d && d.rim || 'rgba(255,214,150,0.95)'; m.fillRect(0, 0, cw, ch);
        m.globalCompositeOperation = 'destination-out'; m.drawImage(e.a, 0, 0); m.globalCompositeOperation = 'source-over';
        a.setTransform(1, 0, 0, 1, 0, 0); a.globalCompositeOperation = 'destination-over'; a.globalAlpha = 0.85; a.drawImage(e.m, 0, 0); a.globalAlpha = 1; a.globalCompositeOperation = 'source-over';
        return { c: e.a, ox: ox, oy: oy, w: w, h: h };
      } catch (x) { return null; }
    }
    function drawPlate(g, f) {
      var b = L.foes[f.id]; if (!b || f.hp <= 0) { L.plates[f.id] = null; return; }
      var w = Math.max(70, Math.min(110, b.w * 0.8)), x = b.home.cx - w / 2, y = FOOT_Y + 10, v = vis.u[f.id] || {};
      text(g, f.name, b.home.cx, y + 1, { size: 9.5, weight: 800, align: 'center', color: '#f2e6d6', ow: 3 });
      drawBar(g, x, y + 5, w, 8, f.hp / f.maxHp, (v.ghost || f.hp) / f.maxHp, '#e0484c', f.ward > 0);
      text(g, f.hp + '/' + f.maxHp, b.home.cx, y + 12, { size: 8, weight: 900, align: 'center', color: '#fff', ow: 2.4 });
      if (f.ward > 0) drawWardBadge(g, x - 9, y + 9, f.ward, 9);
      var ks = Object.keys(f.st).filter(function (k) { return f.st[k] > 0; });
      ks.forEach(function (k, i) { drawStatusChip(g, k, f.st[k], x + 7 + i * 17, y + 24, lib.statuses[k], 7); });
      L.plates[f.id] = { x: x - 19, y: y - 8, w: w + 20, h: ks.length ? 41 : 24 };
    }
    function drawIntent(g, f) {
      if (P.intents === 'off' || f.hp <= 0 || !f.intent || S.over) { L.intents[f.id] = null; return; }   // the fight is decided: no more intents under the end banner
      var b = L.foes[f.id], v = vis.u[f.id] || {}, view0 = intentView(S, f); if (!b || !view0) return;
      var k = easeBack(clamp(v.intentPop / 14, 0, 1));
      var ty = Math.max(b.y - 4, TAG_MIN_Y + 30);   // the tag (30 px with its tail) never rises into the top bar / readout band
      g.save(); g.translate(b.home.cx, ty); g.scale(k, k); g.translate(-b.home.cx, -ty);
      var focus = ui.hoverFoe === f.id || ui.aim === f.id;
      L.intents[f.id] = drawIntentTag(g, view0, b.home.cx, ty, T, { focus: focus });
      g.restore();
    }
    function drawHero(g) {
      var h = S.hero, v = vis.u[h.id] || {}, p = HERO_PANEL, hurt = vis.hurt > 0, sx = hurt ? Math.sin(vis.hurt * 2.2) * 2 : 0;
      g.save(); g.translate(sx, 0);
      rr(g, p.x, p.y, p.w, p.h, 10); var bg = g.createLinearGradient(0, p.y, 0, p.y + p.h); bg.addColorStop(0, 'rgba(40,30,54,0.94)'); bg.addColorStop(1, 'rgba(16,11,24,0.96)'); g.fillStyle = bg; g.fill();
      g.lineWidth = 1.6; g.strokeStyle = hurt ? '#ff6a5a' : 'rgba(217,180,106,0.85)'; g.stroke();
      drawHeroPortrait(g, p.x + 36, p.y + 44, 28, T, hurt && vis.hurt > 8);
      if (h.ward > 0) drawWardBadge(g, p.x + 58, p.y + 70, h.ward, 11);
      text(g, h.name, p.x + 72, p.y + 17, { size: 10, weight: 900, color: '#ffe7b8', ow: 3 });
      drawBar(g, p.x + 72, p.y + 23, 86, 9, h.hp / h.maxHp, (v.ghost || h.hp) / h.maxHp, '#e0484c', h.ward > 0);
      text(g, h.hp + ' / ' + h.maxHp, p.x + 115, p.y + 31, { size: 8.5, weight: 900, align: 'center', color: '#fff', ow: 2.4 });
      drawEnergy(g);
      var ks = Object.keys(h.st).filter(function (k) { return h.st[k] > 0; });
      ks.forEach(function (k, i) { drawStatusChip(g, k, h.st[k], p.x + 80 + i * 17, p.y + 76, lib.statuses[k], 7); });
      if (!ks.length) text(g, h.ward ? 'Ward ' + h.ward : 'No ward', p.x + 74, p.y + 80, { size: 8, weight: 700, color: h.ward ? '#9fd4ff' : 'rgba(240,230,210,0.45)', ow: 0 });
      g.restore();
    }
    // Lumen: one flame pip per point, inside the hero panel (spent pips go dark).
    function drawEnergy(g) {
      var e = ENERGY, n = S.energy, m = Math.max(S.energyMax, n), show = Math.min(m, 6), pulse = idle() && n > 0 ? 0.5 + 0.5 * Math.sin(T * 4) : 0;
      text(g, 'LUMEN', e.x - 6, e.y - 7, { size: 7, weight: 900, color: '#ffd9a0', ow: 0, ls: 1 });
      text(g, n + '/' + S.energyMax, e.x + e.w - 4, e.y - 7, { size: 9, weight: 900, align: 'right', color: n > 0 ? '#fff2c8' : '#a8a0bc', ow: 0 });
      for (var i = 0; i < show; i++) {
        var x = e.x + 2 + i * 15, y = e.y + 6, on = i < n, r = 6.5;
        if (on) { g.save(); g.globalCompositeOperation = 'lighter'; glow(g, x, y, 13 + pulse * 3, 'rgba(255,180,80,0.5)', 1); g.restore(); }
        g.beginPath(); g.moveTo(x, y - r * 1.25); g.quadraticCurveTo(x + r, y - r * 0.1, x + r * 0.7, y + r * 0.55); g.quadraticCurveTo(x, y + r * 1.1, x - r * 0.7, y + r * 0.55); g.quadraticCurveTo(x - r, y - r * 0.1, x, y - r * 1.25); g.closePath();
        var gr = g.createRadialGradient(x - 2, y - 2, 1, x, y, r * 1.3); if (on) { gr.addColorStop(0, '#fff3c0'); gr.addColorStop(0.5, '#ffad3a'); gr.addColorStop(1, '#9a4012'); } else { gr.addColorStop(0, '#5a5470'); gr.addColorStop(1, '#262232'); }
        g.fillStyle = gr; g.fill(); g.lineWidth = 1.3; g.strokeStyle = '#1e0e06'; g.stroke();
      }
      if (m > show) text(g, '+' + (m - show), e.x + 2 + show * 15, e.y + 10, { size: 9, weight: 900, color: '#ffd9a0', ow: 2 });
    }
    function drawFx(g) {
      vis.fx.forEach(function (f) {
        var k = f.age / f.life, a = 1 - k;
        g.save();
        if (f.kind === 'slash') { g.globalCompositeOperation = 'lighter'; for (var i = 0; i < 2; i++) { var an = -0.9 + i * 1.7 + hash(f.seed, i) * 0.4; g.save(); g.translate(f.x, f.y); g.rotate(an); g.beginPath(); var len = (f.big ? 70 : 52) * easeOut(k * 2.2); g.moveTo(-len / 2, 0); g.quadraticCurveTo(0, -10, len / 2, 0); g.lineWidth = (f.big ? 6 : 4) * a; g.strokeStyle = 'rgba(255,240,220,' + a + ')'; g.stroke(); g.restore(); }
          for (var j = 0; j < 9; j++) { var aa = hash(f.seed, j + 3) * TAU, sp = 18 + hash(j, f.seed) * 26; glow(g, f.x + Math.cos(aa) * sp * easeOut(k), f.y + Math.sin(aa) * sp * easeOut(k), 4 * a + 1, 'rgba(255,220,170,0.9)', a); } }
        else if (f.kind === 'embers' || f.kind === 'thorns' || f.kind === 'zap' || f.kind === 'shards') {
          var col = f.kind === 'embers' ? '255,150,60' : f.kind === 'thorns' ? '160,230,110' : f.kind === 'zap' ? '220,220,255' : '190,240,255';
          g.globalCompositeOperation = 'lighter'; glow(g, f.x, f.y, 40 * a + 6, 'rgba(' + col + ',0.5)', a);
          for (var q = 0; q < 12; q++) { var ang = hash(f.seed, q) * TAU, d0 = (14 + hash(q, f.seed + 1) * 30) * easeOut(k); glow(g, f.x + Math.cos(ang) * d0, f.y + Math.sin(ang) * d0 - k * 14, 4 * a + 1.5, 'rgba(' + col + ',1)', a); }
          if (f.kind === 'zap') { g.beginPath(); g.moveTo(f.x - 4, f.y - 50); for (var z = 1; z < 6; z++) g.lineTo(f.x + (hash(f.seed, z) - 0.5) * 20, f.y - 50 + z * 12); g.lineWidth = 2.5 * a; g.strokeStyle = 'rgba(240,240,255,' + a + ')'; g.stroke(); } }
        else if (f.kind === 'claw') { g.globalCompositeOperation = 'lighter'; for (var c = 0; c < 3; c++) { g.beginPath(); var ox = f.x - 30 + c * 22, oy = f.y - 40; g.moveTo(ox, oy); g.quadraticCurveTo(ox + 20, oy + 40, ox + 34, oy + 80 * easeOut(k * 2)); g.lineWidth = 4.5 * a; g.strokeStyle = rgba(f.col, a); g.stroke(); } }
        else if (f.kind === 'ward' || f.kind === 'wardHit') { g.globalCompositeOperation = 'lighter'; hexPath(g, f.x, f.y, 18 + 30 * easeOut(k)); g.lineWidth = 3 * a; g.strokeStyle = 'rgba(140,210,255,' + a + ')'; g.stroke(); if (f.kind === 'ward') { hexPath(g, f.x, f.y, 10 + 20 * easeOut(k)); g.lineWidth = 1.5 * a; g.stroke(); } }
        else if (f.kind === 'puff') { g.globalCompositeOperation = 'lighter'; for (var m = 0; m < 7; m++) { var px = f.x + (hash(f.seed, m) - 0.5) * 50, py = f.y + 10 - k * 40 - hash(m, f.seed) * 16; glow(g, px, py, 7 * a + 2, rgba(f.col, 0.9), a); } }
        else if (f.kind === 'heal') { g.globalCompositeOperation = 'lighter'; for (var hh = 0; hh < 8; hh++) { glow(g, f.x + (hash(f.seed, hh) - 0.5) * 50, f.y + 20 - k * 50 - hash(hh, 2) * 20, 5 * a + 1, 'rgba(130,255,160,0.9)', a); } }
        else if (f.kind === 'death') { g.globalCompositeOperation = 'lighter'; for (var dd = 0; dd < 16; dd++) { var dx = (hash(f.seed, dd) - 0.5) * f.w, dy = -hash(dd, f.seed) * f.h * 0.8 - k * 50; glow(g, f.x + dx, f.y + dy * 0.6 + 20, 5 * a + 1, 'rgba(255,220,180,0.8)', a); } }
        g.restore();
      });
    }
    function drawNums(g) {
      vis.nums.forEach(function (n) {
        var k = n.age / n.life, pop = n.age < 9 ? easeBack(n.age / 9) * (n.small ? 1 : 1.08) : 1, a = k > 0.72 ? 1 - (k - 0.72) / 0.28 : 1, e = easeOut(Math.min(1, n.age / 34));
        var x = n.x + (n.dir || 0) * e * 10, y = n.y - (n.small ? e * 6 : Math.sin(e * Math.PI * 0.5) * 14);
        g.save(); g.globalAlpha = a; g.translate(x, y); g.scale(pop, pop);
        if (!n.small) { g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 6; g.shadowOffsetY = 2; }
        text(g, n.text, 0, 0, { size: n.size, weight: 900, align: n.small ? 'left' : 'center', color: n.col, ow: n.small ? 3 : 4.5 });
        g.restore();
      });
    }
    function drawScene(g) {
      if (!S) return; begin(g);
      try {
        var sh = shakeOff(); g.save(); g.translate(sh[0], sh[1]);
        if (typeof opt.drawBackground === 'function') { try { opt.drawBackground(g, { x: 0, y: 0, w: W, h: H }, T); } catch (e) { defaultBackground(g); } } else defaultBackground(g);
        var order = S.foes.slice().sort(function (a, b) { return (L.foes[a.id] ? L.foes[a.id].s : 0) - (L.foes[b.id] ? L.foes[b.id].s : 0); });
        order.forEach(function (f) { drawFoe(g, f); });
        S.foes.forEach(function (f) { drawPlate(g, f); });
        S.foes.forEach(function (f) { drawIntent(g, f); });
        drawFx(g);
        if (P.numbers !== 'off') drawNums(g);
        g.restore();
        if (vis.hurt > 0 && !reduced()) { var vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62); vg.addColorStop(0, 'rgba(255,0,0,0)'); vg.addColorStop(1, 'rgba(200,20,30,' + (vis.hurt / 18) * 0.45 + ')'); g.fillStyle = vg; g.fillRect(0, 0, W, H); }
      } catch (e) { if (root.console) console.error('card-battle drawScene: ' + e.message); }
      g.restore();
    }
    function cardView(c, tgtId) {
      var d = S ? cardDef(S, c.id) : (lib.cards[c.id] || { name: c.id, cost: 0, type: 'skill', text: '' }), tgt = S && tgtId ? unitById(S, tgtId) : null;
      return { id: c.id, name: d.name || c.id, cost: d.cost | 0, type: d.type, rarity: d.rarity, art: d.art, text: cardText(S, d, tgt) };
    }
    function drawOneCard(g, cv, x, y, s, r, o) {
      g.save(); g.translate(x, y); g.rotate(r || 0); g.scale(s, s);
      drawCardFrame(g, cv, -CARD_W / 2, -CARD_W * 0.75, CARD_W, merge({ t: T * 1000 / 1000, drawArt: opt.drawArt }, o));
      g.restore();
    }
    function drawAim(g, sx, sy, tx, ty, ok) {
      var cx = (sx + tx) / 2 + (tx - sx) * 0.1, cy = Math.min(sy, ty) - 70, col = ok ? '#ffd27a' : '#c0b8d0';
      var pt = function (k) { var a = 1 - k; return [a * a * sx + 2 * a * k * cx + k * k * tx, a * a * sy + 2 * a * k * cy + k * k * ty]; };
      g.save(); g.lineCap = 'round';
      for (var pass = 0; pass < 2; pass++) {
        g.beginPath(); for (var i = 0; i <= 28; i++) { var p = pt(i / 28 * 0.94); g[i ? 'lineTo' : 'moveTo'](p[0], p[1]); }
        if (pass === 0) { g.globalCompositeOperation = 'lighter'; g.lineWidth = 9; g.strokeStyle = rgba(col, 0.18); g.stroke(); g.globalCompositeOperation = 'source-over'; }
        else { var gr = g.createLinearGradient(sx, sy, tx, ty); gr.addColorStop(0, rgba(col, 0.15)); gr.addColorStop(1, rgba(col, 0.95)); g.lineWidth = 2.6; g.strokeStyle = gr; g.stroke(); }
      }
      g.globalCompositeOperation = 'lighter';
      for (var j = 0; j < 7; j++) { var k = ((T * 0.9 + j / 7) % 1) * 0.94, q = pt(k); glow(g, q[0], q[1], 3 + k * 4, rgba(col, 0.9), 0.4 + k * 0.6); }
      g.globalCompositeOperation = 'source-over';
      var e = pt(0.94), e0 = pt(0.9), an = Math.atan2(e[1] - e0[1], e[0] - e0[0]);
      g.translate(e[0], e[1]); g.rotate(an); g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -6); g.lineTo(-2, 0); g.lineTo(-5, 6); g.closePath(); g.fillStyle = col; g.fill(); g.lineWidth = 1.2; g.strokeStyle = 'rgba(20,10,4,0.9)'; g.stroke();
      g.restore();
    }
    function drawReticle(g, f) {
      var b = L.foes[f]; if (!b) return; var cx = b.cx, cy = b.y + b.h * 0.55, rr0 = Math.max(b.w, b.h) * 0.5 + 6 + Math.sin(T * 6) * 2;
      g.save(); g.translate(cx, cy); g.rotate(T * 0.8);
      g.beginPath(); g.arc(0, 0, rr0, 0, TAU); g.lineWidth = 1.4; g.strokeStyle = 'rgba(255,210,122,0.5)'; g.setLineDash([6, 6]); g.stroke(); g.setLineDash([]);
      for (var i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(rr0 - 4, 0); g.lineTo(rr0 + 7, -4); g.lineTo(rr0 + 7, 4); g.closePath(); g.fillStyle = '#ffd27a'; g.fill(); }
      g.restore();
    }
    function drawPile(g, r, n, label, back) {
      for (var i = Math.min(3, n) - 1; i >= 0; i--) { if (back) drawCardBack(g, r.x + i * 1.5, r.y - i * 2, r.w, T); else { g.save(); rr(g, r.x + i * 1.5, r.y - i * 2, r.w, r.h, 4); g.fillStyle = '#3a2c2a'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = '#8a7058'; g.stroke(); g.restore(); } }
      if (!n) { rr(g, r.x, r.y, r.w, r.h, 4); g.lineWidth = 1.2; g.setLineDash([3, 3]); g.strokeStyle = 'rgba(200,180,150,0.5)'; g.stroke(); g.setLineDash([]); }
      g.beginPath(); g.arc(r.x + r.w - 2, r.y + r.h - 4, 9, 0, TAU); g.fillStyle = '#1a1222'; g.fill(); g.lineWidth = 1.4; g.strokeStyle = back ? '#d9b46a' : '#a88870'; g.stroke();
      text(g, n, r.x + r.w - 2, r.y + r.h - 0.5, { size: 10, weight: 900, align: 'center', color: '#fff', ow: 0 });
      text(g, label, r.x + r.w / 2, r.y + r.h + 10, { size: 7.5, weight: 800, align: 'center', color: '#d8ccb8', ow: 2.4 });
    }
    function drawEndBtn(g) {
      var b = END_BTN, on = idle(), focus = ui.kbd && ui.cursor >= S.hand.length && on, nothing = on && !S.hand.some(function (c) { return canPlay(S, c); });
      g.save(); if (focus || nothing) { g.globalCompositeOperation = 'lighter'; glow(g, b.x + b.w / 2, b.y + b.h / 2, 60, 'rgba(255,200,110,' + (0.25 + 0.15 * Math.sin(T * 5)) + ')', 1); g.globalCompositeOperation = 'source-over'; }
      rr(g, b.x, b.y, b.w, b.h, 9); var gr = g.createLinearGradient(0, b.y, 0, b.y + b.h);
      if (on) { gr.addColorStop(0, '#6a4a22'); gr.addColorStop(1, '#3a2410'); } else { gr.addColorStop(0, '#3a3444'); gr.addColorStop(1, '#221e2a'); }
      g.fillStyle = gr; g.fill(); g.lineWidth = focus ? 2.4 : 1.6; g.strokeStyle = on ? '#e7c27a' : '#6a6478'; g.stroke();
      var hx = b.x + 15, hy = b.y + b.h / 2; g.beginPath(); g.moveTo(hx - 6, hy - 9); g.lineTo(hx + 6, hy - 9); g.lineTo(hx, hy); g.lineTo(hx + 6, hy + 9); g.lineTo(hx - 6, hy + 9); g.lineTo(hx, hy); g.closePath(); g.fillStyle = on ? '#ffd27a' : '#8a8498'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = '#2a1408'; g.stroke();
      text(g, S.side === 'player' && !S.over ? 'END TURN' : S.over ? '\u2014' : 'FOES ACT', b.x + 50, b.y + 16, { size: 10, weight: 900, align: 'center', color: on ? '#fff3d6' : '#aaa4b8', ow: 2.4, ls: 0.5 });
      text(g, on ? 'E' : '', b.x + 50, b.y + 28, { size: 7.5, weight: 800, align: 'center', color: 'rgba(255,230,180,0.6)', ow: 0 });
      g.restore();
    }
    function drawHand(g) {
      var aimCard = null;
      L.cards.forEach(function (r) {
        var c = handCard(r.uid); if (!c) return;
        var cv = cardView(c, r.uid === ui.sel ? ui.aim : null), ok = canPlay(S, c), isSel = r.uid === ui.sel;
        drawOneCard(g, cv, r.cx, r.cy, r.s, r.r, { playable: ok || !idle() && S.side === 'player' ? ok : ok, dim: !ok && S.side === 'player' ? 0.7 : 0, glow: ok && idle() && (r.focus || isSel), selected: isSel });
        if (isSel && needsTarget(S, c.id)) aimCard = r;
      });
      if (aimCard && P.arrow !== 'off') {
        var sx = aimCard.cx, sy = aimCard.y + 4, tx, ty, ok = false;
        if (ui.aim && L.foes[ui.aim]) { var b = L.foes[ui.aim]; tx = b.cx; ty = b.y + b.h * 0.55; ok = true; drawReticle(g, ui.aim); }
        else if (ui.drag && ui.drag.moved) { tx = ui.drag.x; ty = ui.drag.y; }
        if (tx != null) drawAim(g, sx, sy, tx, ty, ok);
      }
    }
    function drawFlying(g) {
      vis.fly.forEach(function (f) {
        if (f.t < 0) return; var k = easeOut(f.t / f.n);
        if (f.back) { var x = lerp(f.x0, DRAW_PILE.x + 16, k), y = lerp(f.y0, DRAW_PILE.y + 23, k) - Math.sin(k * Math.PI) * 40; g.save(); g.translate(x, y); g.rotate(k * 3); drawCardBack(g, -14, -21, 28, T); g.restore(); return; }
        var cv = cardView({ id: f.id }), tx = f.fade ? f.x0 : DISC_PILE.x + 16, ty = f.fade ? f.y0 - 60 : DISC_PILE.y + 23;
        g.save(); g.globalAlpha = f.fade ? 1 - k : 1; drawOneCard(g, cv, lerp(f.x0, tx, k), lerp(f.y0, ty, k), lerp(f.s0, f.fade ? f.s0 * 1.1 : 0.35, k), lerp(f.r0, f.fade ? 0 : 0.5, k), { playable: true }); g.restore();
      });
      if (vis.playing) { var p = vis.playing; drawOneCard(g, cardView({ id: p.id }), p.x, p.y, p.s, p.r, { playable: true, glow: true, glowColor: '#fff0c0' }); }
    }
    function drawBanner(g) {
      var b = vis.banner; if (!b) return;
      var inK = easeOut(b.t / 12), outK = b.end ? 0 : clamp((b.t - (b.n - 12)) / 12, 0, 1), a = inK * (1 - outK), y = b.end ? 120 : BANNER_Y;
      g.save(); g.globalAlpha = a;
      var bh = b.end ? 64 : 32, gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(10,6,18,0)'); gr.addColorStop(0.25, 'rgba(10,6,18,0.82)'); gr.addColorStop(0.75, 'rgba(10,6,18,0.82)'); gr.addColorStop(1, 'rgba(10,6,18,0)');
      g.fillStyle = gr; g.fillRect(0, y - bh / 2, W, bh);
      g.fillStyle = rgba(b.col, 0.7); g.fillRect(W * 0.2, y - bh / 2, W * 0.6 * inK, 1.5); g.fillRect(W * 0.8 - W * 0.6 * inK, y + bh / 2 - 1.5, W * 0.6 * inK, 1.5);
      text(g, b.text, W / 2 + (1 - inK) * -40, y + (b.end ? 6 : 3), { size: b.end ? 32 : 18, weight: 900, align: 'center', color: b.col, ow: 5, ls: b.end ? 4 : 3 });
      if (b.sub) text(g, b.sub, W / 2, y + (b.end ? 26 : 13), { size: 10, weight: 800, align: 'center', color: '#efe4d0', ow: 3 });
      g.restore();
      L.ui.push({ name: 'banner', x: W * 0.2, y: y - bh / 2, w: W * 0.6, h: bh });
    }
    function drawReadout(g) {
      var msg = null, col = '#f0e6d4';
      var hf = ui.aim || ui.hoverFoe;
      if (hf && S.side === 'player') { var f = unitById(S, hf), v = f && f.hp > 0 && intentView(S, f); if (v) { msg = f.name + ' intends ' + v.name + (v.damage ? ': ' + v.damage + ' damage' + (v.hits > 1 ? ' (' + v.hits + ' hits)' : '') : '') + '.'; col = '#ffd0c4'; } }
      if (!msg && vis.readout) { msg = vis.readout.text; col = vis.readout.col; }
      if (!msg) { L.readout = null; return; }
      var w = Math.min(300, measure(g, msg, 10.5, 800) + 24), x = 394 - w / 2, y = 6;
      rr(g, x, y, w, 20, 10); g.fillStyle = 'rgba(14,10,22,0.82)'; g.fill(); g.lineWidth = 1; g.strokeStyle = 'rgba(217,180,106,0.45)'; g.stroke();
      text(g, msg, x + w / 2, y + 14, { size: 10.5, weight: 800, align: 'center', color: col, ow: 0 });
      L.ui.push({ name: 'readout', x: x, y: y, w: w, h: 20 });
    }
    function drawTurnPill(g) {
      var x = W - 92, y = 6, w = 84, h = 20; rr(g, x, y, w, h, 10); g.fillStyle = 'rgba(14,10,22,0.85)'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = S.side === 'player' ? 'rgba(255,210,122,0.8)' : 'rgba(255,130,110,0.8)'; g.stroke();
      text(g, 'TURN ' + S.turn, x + w / 2, y + 14, { size: 10, weight: 900, align: 'center', color: S.side === 'player' ? '#ffe2a0' : '#ffb0a0', ow: 0, ls: 1 });
      L.ui.push({ name: 'turn', x: x, y: y, w: w, h: h });
    }
    function drawUI(g) {
      if (!S) return; begin(g); L.ui = [];
      try {
        drawHero(g);
        drawPile(g, DRAW_PILE, S.draw.length, 'DRAW', true); drawPile(g, DISC_PILE, S.discard.length, 'DISCARD', false);
        if (S.faded.length) { var fx0 = DISC_PILE.x + 2, fy0 = DISC_PILE.y + 8; g.save(); g.globalCompositeOperation = 'lighter'; glow(g, fx0, fy0, 14, 'rgba(190,150,255,0.45)', 1); g.restore();
          g.beginPath(); g.arc(fx0, fy0, 8, 0, TAU); g.fillStyle = '#3a2a5a'; g.fill(); g.lineWidth = 1.3; g.strokeStyle = '#c9b8e8'; g.stroke();
          text(g, S.faded.length, fx0, fy0 + 3.5, { size: 9, weight: 900, align: 'center', color: '#efe4ff', ow: 0 }); text(g, 'faded', fx0, fy0 + 17, { size: 6.5, weight: 800, align: 'center', color: '#c9b8e8', ow: 2 }); }
        drawEndBtn(g); drawTurnPill(g); drawReadout(g);
        drawFlying(g); drawHand(g);
        var fp = ui.aim || (ui.drag ? null : ui.hoverFoe); if (fp && S.side === 'player') { var ff = unitById(S, fp); if (ff && ff.hp > 0 && L.plates[fp]) { var pr = L.plates[fp]; g.save(); rr(g, pr.x - 3, pr.y - 4, pr.w + 6, pr.h + 6, 8); g.fillStyle = 'rgba(14,10,22,0.82)'; g.fill(); g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,210,122,0.7)'; g.stroke(); drawPlate(g, ff); g.restore(); } }
        drawBanner(g);
        L.ui.push({ name: 'hero', x: HERO_PANEL.x, y: HERO_PANEL.y, w: HERO_PANEL.w, h: HERO_PANEL.h }, 
          { name: 'endTurn', x: END_BTN.x, y: END_BTN.y, w: END_BTN.w, h: END_BTN.h }, { name: 'drawPile', x: DRAW_PILE.x, y: DRAW_PILE.y - 6, w: DRAW_PILE.w + 6, h: DRAW_PILE.h + 18 }, { name: 'discardPile', x: DISC_PILE.x, y: DISC_PILE.y - 14, w: DISC_PILE.w + 8, h: DISC_PILE.h + 26 });
        L.cards.forEach(function (r) { L.ui.push({ name: 'card', uid: r.uid, x: r.x, y: r.y, w: r.w, h: r.h }); });
      } catch (e) { if (root.console) console.error('card-battle drawUI: ' + e.message); }
      g.restore();
    }

    // ---------- coordinates out (host logical px) ----------
    function out(r) { if (!r) return null; var kx = view.w / W, ky = view.h / H, o = {}; for (var k in r) o[k] = r[k]; o.x = view.x + r.x * kx; o.y = view.y + r.y * ky; if (r.w != null) o.w = r.w * kx; if (r.h != null) o.h = r.h * ky; return o; }

    var inst = {
      version: VERSION,
      start: start, update: update, drawScene: drawScene, drawUI: drawUI,
      draw: function (g) { drawScene(g); drawUI(g); },
      key: key, pointer: pointer, play: function (uid, target) { return play(uid, target); }, endTurn: endTurn,
      canPlay: function (uid) { return !!S && canPlay(S, handCard(uid)); },
      needsTarget: function (id) { return !!S && needsTarget(S, id); },
      phase: function () { if (!S) return 'idle'; if (S.over) return ended ? (S.over === 'win' ? 'won' : 'lost') : 'ending'; if (S.side === 'enemy') return 'enemy'; return queue.length ? 'busy' : 'player'; },
      busy: function () { return !!S && !!queue.length; },
      over: function () { return S ? S.over : null; },
      hero: function () { return S ? S.hero : null; }, foes: function () { return S ? S.foes : []; }, hand: function () { return S ? S.hand.slice() : []; },
      piles: function () { return S ? { draw: S.draw.length, hand: S.hand.length, discard: S.discard.length, faded: S.faded.length, inPlay: S.inPlay ? 1 : 0, deck: S.deckSize, energy: S.energy, energyMax: S.energyMax } : null; },
      deckSize: function () { return S ? S.deckSize : 0; },
      intentOf: function (id) { var f = S && unitById(S, id); return f && f.hp > 0 ? intentView(S, f) : null; },
      recommend: function () { return idle() ? (botPlan(S, +P.botNodes || 1400) || 'end') : null; },
      setAuto: function (on) { auto.on = !!on; auto.t = 0; auto.move = null; if (!on && ui.sel != null && !ui.kbd) { ui.sel = null; ui.aim = null; } },
      auto: function () { return auto.on; },
      hitStop: function (ms) { stop = Math.max(stop, Math.ceil((ms || 0) * 60 / 1000)); },
      addCard: function (id, where) { if (!S) return null; var o2 = []; var c = addCardTo(S, id, where || 'discard', o2); handle(o2); return c.uid; },
      anchor: function (id) {
        if (!S) return null;
        if (S.hero && id === S.hero.id) { var p = HERO_PANEL; return out({ x: p.x + 36, top: p.y + 16, left: p.x + 8, w: 56, h: 56, y: p.y + 16, cy: p.y + 44, footY: p.y + 72, dead: S.hero.hp <= 0, side: 'hero' }); }
        var b = L.foes[id], f = unitById(S, id); if (!b || !f) return null;
        var r = out({ x: b.cx, top: b.y, left: b.x, y: b.y, w: b.w, h: b.h, cy: b.y + b.h * 0.55, footY: b.footY, dead: f.hp <= 0, side: 'foe', s: b.s });
        r.top = r.y; return r;
      },
      unitRects: function () {
        if (!S) return []; var r = [];
        S.foes.forEach(function (f) { if (f.hp <= 0) return; var b = L.foes[f.id]; if (b) r.push(out({ id: f.id, kind: 'sprite', x: b.x, y: b.y, w: b.w, h: b.h })); if (L.plates[f.id]) r.push(out({ id: f.id, kind: 'bar', x: L.plates[f.id].x, y: L.plates[f.id].y, w: L.plates[f.id].w, h: L.plates[f.id].h })); });
        r.push(out({ id: S.hero.id, kind: 'sprite', x: HERO_PANEL.x + 8, y: HERO_PANEL.y + 16, w: 56, h: 56 }));
        return r;
      },
      uiRects: function () {
        var r = (L.ui || []).map(out);
        if (S) S.foes.forEach(function (f) { if (L.intents[f.id] && f.hp > 0) r.push(out({ name: 'intent', owner: f.id, x: L.intents[f.id].x, y: L.intents[f.id].y, w: L.intents[f.id].w, h: L.intents[f.id].h })); });
        return r;
      },
      cardRects: function () { return L.cards.map(out); },
      fieldRect: function () { return out({ x: 0, y: 0, w: W, h: 250 }); },
      cardView: function (id) { return cardView({ id: id }); },
      drawCard: function (g, id, x, y, w, o) { var d = typeof id === 'string' ? cardView({ id: id }) : id; return drawCardFrame(g, d, x, y, w, merge({ t: T, drawArt: opt.drawArt }, o || {})); },
      drawCardBack: function (g, x, y, w) { drawCardBack(g, x, y, w, T); },
      text: function (g, s, x, y, o) { return text(g, s, x, y, o); },
      lib: lib, params: function () { return copyObj(P); }, setParams: function (p) { for (var k in p) P[k] = p[k]; },
      log: function () { return log.slice(); }, time: function () { return T; }, frame: function () { return frame; },
      state: function () {
        if (!S) return { phase: 'idle' };
        return { phase: inst.phase(), turn: S.turn, side: S.side, over: S.over, energy: S.energy, hero: S.hero.hp + '/' + S.hero.maxHp, ward: S.hero.ward,
          foes: S.foes.map(function (f) { return f.id + ':' + f.hp + (f.intent ? '>' + f.intent.move : ''); }).join(' '),
          hand: S.hand.map(function (c) { return c.id; }).join(','), draw: S.draw.length, discard: S.discard.length, faded: S.faded.length, played: S.stats.played, reshuffles: S.stats.reshuffles };
      },
      _state: function () { return S; }
    };
    return inst;
  }

  // Card text with live numbers: [g9] above the printed value (Might, Exposed), [r4] below it (Sapped), [y6] unchanged.
  function cardText(S, d, tgt) {
    var dmg = (d.effects || []).filter(function (e) { return e && e.do === 'damage'; }), wd = (d.effects || []).filter(function (e) { return e && e.do === 'ward'; });
    return String(d.text || '').replace(/\{damage(\d?)\}/g, function (m, k) {
      var e = dmg[k ? (+k - 1) : 0]; if (!e) return '?'; var v = S ? calcDamage(S, S.hero, tgt || null, e.n) : e.n;
      return '[' + (v > e.n ? 'g' : v < e.n ? 'r' : 'y') + v + ']';
    }).replace(/\{ward\}/g, function () { return wd[0] ? '[y' + wd[0].n + ']' : '?'; }).replace(/(\S)\[/g, '$1 [');
  }
