
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
