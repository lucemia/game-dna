  /* =====================================================================================================
     Content tables (the built-ins; games add their own through addEnemy / addItem / addMap or the create options)
     ===================================================================================================== */
  var ENEMIES = {
    slime: { name: 'Gloom Slime', look: 'slime', hp: 9, atk: 3, def: 0, xp: 3, speed: 1, sight: 5, evade: 0.04, acc: 0.78, weight: 4, minFloor: 1, maxFloor: 2 },
    bat: { name: 'Cave Bat', look: 'bat', hp: 6, atk: 2, def: 0, xp: 3, speed: 1.5, sight: 6, evade: 0.22, acc: 0.8, erratic: 0.3, weight: 3, minFloor: 1, maxFloor: 3 },
    knight: { name: 'Grave Knight', look: 'knight', hp: 15, atk: 5, def: 1, xp: 7, speed: 1, sight: 6, evade: 0.08, acc: 0.8, weight: 3, minFloor: 2, maxFloor: 3 },
    king: { name: 'The Mire King', look: 'king', boss: true, hp: 40, atk: 6, def: 1, xp: 30, speed: 1, sight: 7, evade: 0.04, acc: 0.82, weight: 0 }
  };
  var ITEMS = {
    potion: { name: 'Red Tonic', look: 'flask', color: '#d83a3a', effect: { heal: 14 }, carry: true, weight: 4 },
    gold: { name: 'Gold', look: 'coins', effect: { gold: 10 }, weight: 4 },
    charm: { name: 'Ward Charm', look: 'amulet', color: '#4a9cff', effect: { def: 1 }, weight: 1, minFloor: 2 },
    fang: { name: 'Fang Charm', look: 'amulet', color: '#ff6a4a', effect: { atk: 1 }, weight: 1, minFloor: 1 }
  };
  var XP_STEPS = [0, 10, 26, 48, 78, 120];
  var DIE_MS = 1200;   // a felled monster crumbles this long (as long as a damage number lives, so the number stays over its own body)
  var COLORS = { dmg: '#ffffff', crit: '#ffd24a', miss: '#9ab4d8', hurt: '#ff6a5a', heal: '#7af08a', ink: '#f4ead8', dim: '#a898b0', panel: '#16101e', edge: '#5c4a78', gold: '#e8b848' };

  function create(options) {
    options = options || {};
    var A = buildArt();
    var P = Object.assign({ floors: 3, size: 15, rooms: 4, loops: 0.12, doors: 0.5, density: 1, loot: 1, torches: 1, fov: 76, eyeBack: 0.32, fog: 0.24, lantern: 4.5, minimap: 'on', numbers: 'on', stepMs: 170, turnMs: 150, startPotions: 2 }, options.params || {});
    var lib = { enemies: Object.assign({}, ENEMIES, copy(options.enemies) || {}), items: Object.assign({}, ITEMS, copy(options.items) || {}), maps: Object.assign({}, options.maps || {}) };
    var view = Object.assign({ x: 0, y: 0, w: 320, h: 200 }, options.view || {});
    var S = null, seed = (options.seed >>> 0) || 1, auto = false, held = {}, keyQ = [];
    var cols = null, rgbaBuf = null, img = null, off = null, offG = null, lastBoxes = {}, swordCache = {};
    var hudRect = null, miniRect = null, logRect = null, bannerRect = null, mapRect = null, potRect = null;

    function cb(name, a, b) { return safe(options[name], [a, b], name); }
    function ev(o) { cb('onEvent', o); }
    function field() { var hh = hudH(); return { x: view.x, y: view.y, w: view.w, h: Math.max(60, view.h - hh) }; }
    function hudH() { return view.w < 300 ? 30 : 26; }

    /* ---------------- run / floor setup ---------------- */
    function start(o) {
      o = o || {}; if (o.seed != null) seed = o.seed >>> 0;
      S = { seed: seed, floorN: 0, floors: Math.max(1, Math.round(num(P.floors, 3))), rng: rng(seed * 2654435761 + 1), crng: rng(seed * 40503 + 99), time: 0, turn: 0, phase: 'play', ended: false,
        hero: { x: 0, y: 0, dir: 0, hp: 34, maxHp: 34, atk: 5, def: 0, lvl: 1, xp: 0, potions: Math.max(0, num(P.startPotions, 1)), gold: 0, kills: 0 },
        act: null, queue: [], think: 0, labels: [], log: [], banner: null, hurtT: 0, indicators: [], fade: 0, mapOpen: false, nextId: 1, swing: null, sway: 0, flick: 1, events: 0 };
      nextFloor();
    }
    function chooseMap(floor) {
      var keys = Object.keys(lib.maps).filter(function (k) { var d = lib.maps[k]; return d && num(d.floor, -1) === floor; });
      if (keys.length) return parseMap(lib.maps[keys[0]], floor, S.floors);
      return generateFloor(S.seed, floor, S.floors, P, lib);
    }
    function pickKind(table, floor, r, bossOk) {
      var list = Object.keys(table).filter(function (k) { var d = table[k]; return d && (!d.boss || bossOk) && num(d.weight, 1) > 0 && floor >= num(d.minFloor, 1) && floor <= num(d.maxFloor, 99); });
      return weighted(r, list, function (k) { return num(table[k].weight, 1); });
    }
    function nextFloor() {
      S.floorN++; var m = chooseMap(S.floorN), r = rng(S.seed * 7 + S.floorN * 101);
      m.doorOpen = new Float32Array(m.w * m.h); m.doorGoal = new Float32Array(m.w * m.h);
      S.map = m; S.LM = buildLightMap(m); S.explored = new Uint8Array(m.w * m.h); S.seen = new Uint8Array(m.w * m.h);
      var H = S.hero; H.x = m.start.x; H.y = m.start.y; H.dir = m.start.dir; S.cam = { x: H.x + 0.5, y: H.y + 0.5, a: dirAngle(H.dir) };
      S.enemies = []; S.items = [];
      m.spawns.forEach(function (sp) {
        var kind = sp.kind || (sp.boss ? (Object.keys(lib.enemies).filter(function (k) { return lib.enemies[k] && lib.enemies[k].boss; })[0] || 'king') : pickKind(lib.enemies, S.floorN, r, false));
        var d = lib.enemies[kind]; if (!d) return;
        S.enemies.push({ id: 'e' + (S.nextId++), kind: kind, def: d, x: sp.x, y: sp.y, fx: sp.x, fy: sp.y, mt: 1, hp: num(d.hp, 8), maxHp: num(d.hp, 8), awake: false, energy: 0, pose: 'idle', poseT: 0, flash: 0, hurtT: 0, dodgeT: 0, lunge: 0, dying: 0, gone: false, boss: !!d.boss, phase0: r() * 1000 });
      });
      m.items.forEach(function (it) {
        var kind = it.kind || pickKind(lib.items, S.floorN, r, false), d = lib.items[kind]; if (!d) return;
        S.items.push({ id: 'i' + (S.nextId++), kind: kind, def: d, x: it.x, y: it.y, taken: false });
      });
      S.labels = []; S.act = null; S.queue = []; S.fade = 1; S.indicators = []; S.mapOpen = false;
      S.banner = { t: 0, title: 'FLOOR ' + S.floorN + (m.last ? ' - THE LAST' : ''), sub: m.name };
      look();
      ev({ kind: 'floorStart', floor: S.floorN, floors: S.floors, name: m.name, theme: m.theme, last: m.last, enemies: S.enemies.map(function (e) { return e.kind; }), items: S.items.map(function (i) { return i.kind; }), start: { x: m.start.x, y: m.start.y }, stairs: m.stairs ? { x: m.stairs.x, y: m.stairs.y } : null, map: m.generated ? null : true });
      say(m.name, COLORS.gold);
    }
    function dirAngle(d) { return Math.atan2(DY[d], DX[d]); }

    /* ---------------- grid rules ---------------- */
    function doorOpen(x, y) { return S.map.doorOpen[y * S.map.w + x] >= 0.999; }
    function passable(x, y) { var t = cellAt(S.map, x, y); return t === FLOOR || (t === DOOR && doorOpen(x, y)); }
    function enemyAt(x, y) { for (var i = 0; i < S.enemies.length; i++) { var e = S.enemies[i]; if (!e.gone && !e.dying && e.x === x && e.y === y) return e; } return null; }
    function los(ax, ay, bx, by) {   // grid line of sight between cell centres (walls and closed doors block)
      var x0 = ax + 0.5, y0 = ay + 0.5, dx = bx - ax, dy = by - ay, n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 3);
      for (var i = 1; i < n; i++) { var x = Math.floor(x0 + dx * i / n), y = Math.floor(y0 + dy * i / n); if ((x !== ax || y !== ay) && (x !== bx || y !== by) && !passable(x, y)) return false; }
      return true;
    }
    function front() { var H = S.hero; return { x: H.x + DX[H.dir], y: H.y + DY[H.dir] }; }

    /* ---------------- messages, labels, banner ---------------- */
    function say(text, color) { S.log.push({ text: text, color: color || COLORS.ink, t: 0, y: null }); if (S.log.length > 4) S.log.shift(); }
    function bare(n) { n = String(n || 'Monster'); return /^the /i.test(n) ? n.slice(4) : n; }
    function the(n) { n = String(n || 'monster'); return /^the /i.test(n) ? 'the ' + n.slice(4) : 'the ' + n; }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function label(owner, text, color, kind) {
      if (P.numbers === 'off' && kind !== 'word') return;
      S.labels.push({ id: S.nextId++, owner: owner, text: String(text), color: color, kind: kind, t: 0, life: kind === 'crit' ? 1050 : 900, x: null, y: null, tx: null, ty: null, shown: false, hidden: false, w: measure(String(text)) + 6, h: 12, slot: null });
    }

    /* ---------------- input ---------------- */
    var ACTIONS = { up: 1, down: 1, left: 1, right: 1, strafeleft: 1, straferight: 1, attack: 1, wait: 1, potion: 1, map: 1, ok: 1 };
    function key(k) { if (!S || !ACTIONS[k]) return false; if (k === 'map') { S.mapOpen = !S.mapOpen; return true; } if (k === 'ok') k = 'attack'; if (S.queue.length < 2) S.queue.push(k); return true; }
    function pointer(type, x, y) {
      if (!S || type !== 'down') return false;
      var F = field();
      if (miniRect && x >= miniRect.x && y >= miniRect.y && x < miniRect.x + miniRect.w && y < miniRect.y + miniRect.h) return key('map');
      if (potRect && x >= potRect.x && y >= potRect.y && x < potRect.x + potRect.w && y < potRect.y + potRect.h) return key('potion');
      if (S.mapOpen) { S.mapOpen = false; return true; }
      if (y < F.y || y >= F.y + F.h || x < F.x || x >= F.x + F.w) return false;
      var u = (x - F.x) / F.w, v = (y - F.y) / F.h, f0 = front();
      if (u < 0.22) return key('left'); if (u > 0.78) return key('right');
      if (enemyAt(f0.x, f0.y)) return key('attack');
      return key(v > 0.8 ? 'down' : 'up');
    }

    /* ---------------- actions (the hero's turn) ---------------- */
    function begin(k) {
      var H = S.hero, d = H.dir, mv = null;
      if (k === 'left' || k === 'right') { var nd = (d + (k === 'right' ? 1 : 3)) % 4; S.act = { kind: 'turn', t: 0, dur: num(P.turnMs, 150), a0: dirAngle(d), a1: dirAngle(d) + (k === 'right' ? Math.PI / 2 : -Math.PI / 2) }; H.dir = nd; return; }
      if (k === 'up') mv = d; else if (k === 'down') mv = (d + 2) % 4; else if (k === 'strafeleft') mv = (d + 3) % 4; else if (k === 'straferight') mv = (d + 1) % 4;
      if (mv != null) {
        var tx = H.x + DX[mv], ty = H.y + DY[mv], t = cellAt(S.map, tx, ty), e = enemyAt(tx, ty);
        if (e && mv === d) { attack(); return; }
        if (e) { S.act = { kind: 'bump', t: 0, dur: 140, dx: DX[mv], dy: DY[mv] }; say('Blocked.', COLORS.dim); return; }
        if (t === DOOR && !doorOpen(tx, ty)) { S.map.doorGoal[ty * S.map.w + tx] = 1; S.act = { kind: 'door', t: 0, dur: 330, x: tx, y: ty, turn: true }; ev({ kind: 'door', x: tx, y: ty }); say('The door grinds open.', COLORS.dim); return; }
        if (t === STAIRS) {
          if (S.map.last) { S.act = { kind: 'bump', t: 0, dur: 140, dx: DX[mv], dy: DY[mv] }; return; }
          S.act = { kind: 'descend', t: 0, dur: 620 }; ev({ kind: 'descend', floor: S.floorN }); say('You go down the stairs.', COLORS.gold); return;
        }
        if (!passable(tx, ty)) { S.act = { kind: 'bump', t: 0, dur: 140, dx: DX[mv], dy: DY[mv] }; return; }
        var from = { x: H.x, y: H.y }; H.x = tx; H.y = ty;
        S.act = { kind: 'move', t: 0, dur: num(P.stepMs, 170), x0: from.x + 0.5, y0: from.y + 0.5, turn: true };
        ev({ kind: 'move', id: 'hero', from: from, x: tx, y: ty });
        return;
      }
      if (k === 'attack') { attack(); return; }
      if (k === 'potion') {
        if (H.potions <= 0) { say('No tonics left.', COLORS.dim); return; }
        if (H.hp >= H.maxHp) { say('You are unhurt.', COLORS.dim); return; }
        H.potions--; S.act = { kind: 'potion', t: 0, dur: 420, at: 220, done: false, turn: true }; ev({ kind: 'potion', left: H.potions }); return;
      }
      if (k === 'wait') { S.act = { kind: 'wait', t: 0, dur: 120, turn: true }; return; }
    }
    function attack() { var f0 = front(); S.act = { kind: 'attack', t: 0, dur: 330, at: 150, done: false, turn: true, tx: f0.x, ty: f0.y }; ev({ kind: 'attack', id: 'hero', x: f0.x, y: f0.y }); }
    function heroStrike(a) {
      var e = enemyAt(a.tx, a.ty), H = S.hero; if (!e) return;
      var d = e.def, r = S.crng, hitP = 0.9 - num(d.evade, 0.05);
      if (!e.awake) { e.awake = true; ev({ kind: 'wake', id: e.id }); }
      if (r() >= hitP) { e.dodgeT = 1; label(e.id, 'MISS', COLORS.miss, 'miss'); hitEvent('hero', e, 0, 0, false, true); say('You miss: ' + bare(d.name) + '.', COLORS.dim); return; }
      var crit = r() < 0.12, raw = H.atk + r.int(0, 2), amt = Math.max(1, raw - num(d.def, 0)); if (crit) amt = Math.ceil(amt * 1.5);
      var before = e.hp; e.hp = Math.max(0, e.hp - amt); amt = before - e.hp;
      e.flash = 3; e.hurtT = 260; var killed = e.hp <= 0;
      label(e.id, crit ? amt + '!' : amt, crit ? COLORS.crit : COLORS.dmg, crit ? 'crit' : 'damage');
      hitEvent('hero', e, raw, amt, crit, false, before, killed);
      if (killed) kill(e); else say(crit ? 'A critical hit!' : 'You hit: ' + bare(d.name) + '.', crit ? COLORS.crit : COLORS.ink);
    }
    function hitEvent(src, e, raw, amt, crit, miss, before, killed) {
      var h = { kind: 'damage', source: src === 'hero' ? 'hero' : e.id, target: src === 'hero' ? e.id : 'hero', attacker: src === 'hero' ? 'hero' : e.kind, defender: src === 'hero' ? e.kind : 'hero', raw: raw, amount: amt, hpBefore: before == null ? (src === 'hero' ? e.hp : S.hero.hp) : before, hpAfter: src === 'hero' ? e.hp : S.hero.hp, killed: !!killed, crit: !!crit, miss: !!miss, x: src === 'hero' ? e.x + 0.5 : S.hero.x + 0.5, y: src === 'hero' ? e.y + 0.5 : S.hero.y + 0.5 };
      cb('onHit', h);
    }
    function kill(e) {
      e.dying = 1; e.dieT = 0; S.hero.kills++; say(bare(e.def.name) + ' is destroyed.', COLORS.gold);
      ev({ kind: 'death', id: e.id, enemy: e.kind, boss: e.boss, x: e.x, y: e.y });
      gainXp(num(e.def.xp, 2));
      if (e.boss) { S.winAt = S.time + 1400; }
    }
    function gainXp(n) {
      var H = S.hero; H.xp += n;
      while (H.lvl < XP_STEPS.length && H.xp >= XP_STEPS[H.lvl]) {
        H.lvl++; var g = 6; H.maxHp += g; H.hp = Math.min(H.maxHp, H.hp + g); H.atk += 1;
        say('Level ' + H.lvl + '! Max HP +' + g + ', attack +1.', COLORS.heal); ev({ kind: 'levelUp', level: H.lvl, hpGain: g });
        label('hero', 'LEVEL UP', COLORS.heal, 'word');
      }
    }
    function heal(n, why) { var H = S.hero, b = H.hp; H.hp = Math.min(H.maxHp, H.hp + n); var got = H.hp - b; if (got > 0) { ev({ kind: 'heal', amount: got, why: why }); label('hero', '+' + got, COLORS.heal, 'heal'); } return got; }
    function pickup() {
      var H = S.hero;
      S.items.forEach(function (it) {
        if (it.taken || it.x !== H.x || it.y !== H.y) return;
        var d = it.def, fx = d.effect || {}; it.taken = true;
        if (d.carry && fx.heal) { H.potions = Math.min(9, H.potions + 1); say('You take a ' + d.name + '.', COLORS.heal); }
        else {
          if (fx.heal) heal(num(fx.heal, 0), it.kind);
          if (fx.gold) { H.gold += num(fx.gold, 0); say('You find ' + num(fx.gold, 0) + ' gold.', COLORS.gold); }
          if (fx.atk) { H.atk += num(fx.atk, 0); say(d.name + ': attack +' + num(fx.atk, 0) + '.', COLORS.gold); }
          if (fx.def) { H.def += num(fx.def, 0); say(d.name + ': defence +' + num(fx.def, 0) + '.', COLORS.gold); }
          if (fx.maxHp) { H.maxHp += num(fx.maxHp, 0); H.hp += num(fx.maxHp, 0); say(d.name + ': max HP +' + num(fx.maxHp, 0) + '.', COLORS.heal); }
          if (!fx.gold && !fx.atk && !fx.def && !fx.maxHp && !fx.heal) say('You take the ' + d.name + '.', COLORS.ink);
        }
        ev({ kind: 'pickup', item: it.kind, id: it.id, x: it.x, y: it.y });
      });
    }

    /* ---------------- the monsters' turn ---------------- */
    function enemyTurn() {
      var H = S.hero, m = S.map, w = m.w, i;
      // distance field from the hero over passable cells
      var D = new Int32Array(m.w * m.h).fill(-1), q = [H.x, H.y], h = 0; D[H.y * w + H.x] = 0;
      while (h < q.length) { var x = q[h++], y = q[h++]; for (var k = 0; k < 4; k++) { var nx = x + DX[k], ny = y + DY[k]; if (D[ny * w + nx] >= 0 || !passable(nx, ny)) continue; D[ny * w + nx] = D[y * w + x] + 1; if (D[ny * w + nx] < 14) q.push(nx, ny); } }
      var movers = [], attackers = [];
      S.enemies.forEach(function (e) {
        if (e.gone || e.dying) return;
        var dist = Math.abs(e.x - H.x) + Math.abs(e.y - H.y);
        if (!e.awake && dist <= num(e.def.sight, 5) && los(e.x, e.y, H.x, H.y)) { e.awake = true; ev({ kind: 'wake', id: e.id }); }
        if (!e.awake) return;
        e.energy += num(e.def.speed, 1);
        var acted = 0;
        while (e.energy >= 1 && acted < 2) {
          e.energy -= 1; acted++;
          if (Math.abs(e.x - H.x) + Math.abs(e.y - H.y) === 1) { attackers.push(e); e.energy = Math.min(e.energy, 0); break; }
          var best = null, bd = 1e9, opts = [];
          for (var k2 = 0; k2 < 4; k2++) {
            var ex = e.x + DX[k2], ey = e.y + DY[k2]; if (!passable(ex, ey) || enemyAt(ex, ey) || corpseAt(ex, ey) || (ex === H.x && ey === H.y)) continue;
            opts.push(k2); var dd = D[ey * w + ex]; if (dd >= 0 && dd < bd) { bd = dd; best = k2; }
          }
          if (opts.length && num(e.def.erratic, 0) > 0 && S.rng() < num(e.def.erratic, 0)) best = opts[Math.floor(S.rng() * opts.length)];
          if (best == null) break;
          var from = { x: e.x, y: e.y }; e.fx = e.mt < 1 ? e.fx : e.x; e.fy = e.mt < 1 ? e.fy : e.y; e.x += DX[best]; e.y += DY[best]; e.mt = 0;
          movers.push(e); ev({ kind: 'move', id: e.id, from: from, x: e.x, y: e.y });
        }
      });
      if (movers.length) S.queue2 = [{ kind: 'emove', t: 0, dur: num(P.stepMs, 170) }]; else S.queue2 = [];
      attackers.forEach(function (e) { S.queue2.push({ kind: 'eattack', t: 0, dur: 470, at: 240, done: false, id: e.id }); });
      if (!S.queue2.length) endTurn();
    }
    function enemyStrike(a) {
      var e = byId(a.id), H = S.hero; if (!e || e.gone || e.dying || H.hp <= 0) return;
      if (Math.abs(e.x - H.x) + Math.abs(e.y - H.y) !== 1) return;
      var d = e.def, r = S.crng, rel = ((dirOf(e.x - H.x, e.y - H.y) - H.dir) + 4) % 4;
      ev({ kind: 'attack', id: e.id, target: 'hero' });
      if (rel !== 0) S.indicators.push({ side: rel === 1 ? 'right' : rel === 3 ? 'left' : 'back', t: 0 });
      if (r() >= num(d.acc, 0.8)) { var vb = boxOf(e); label(vb && vb.visible ? e.id : 'hero', 'MISS', COLORS.miss, 'miss'); S.sway = 1; hitEvent(e.id, e, 0, 0, false, true, H.hp, false); say(bare(d.name) + ' misses.', COLORS.dim); return; }
      var raw = num(d.atk, 3) + r.int(0, 1), amt = Math.max(1, raw - H.def), before = H.hp; H.hp = Math.max(0, H.hp - amt); amt = before - H.hp;
      S.hurtT = 320; label('hero', '-' + amt, COLORS.hurt, 'hurt');
      hitEvent(e.id, e, raw, amt, false, false, before, H.hp <= 0);
      say(bare(d.name) + ' hits you: ' + amt + '.', COLORS.hurt);
      if (H.hp <= 0) { S.loseAt = S.time + 1300; say('You fall...', COLORS.hurt); }
    }
    function corpseAt(x, y) { for (var i = 0; i < S.enemies.length; i++) { var e = S.enemies[i]; if (e.dying && !e.gone && e.x === x && e.y === y) return e; } return null; }
    function dirOf(dx, dy) { for (var k = 0; k < 4; k++) if (DX[k] === Math.sign(dx) && DY[k] === Math.sign(dy)) return k; return 0; }
    function byId(id) { for (var i = 0; i < S.enemies.length; i++) if (S.enemies[i].id === id) return S.enemies[i]; return null; }
    function endTurn() { S.turn++; ev({ kind: 'turn', turn: S.turn }); }

    /* ---------------- the bot (?auto=1): chooses keys through the same rules ---------------- */
    function botKey() {
      var H = S.hero, m = S.map, w = m.w, f0 = front(), fe = enemyAt(f0.x, f0.y);
      if (H.hp <= H.maxHp * 0.4 && H.potions > 0) return 'potion';
      if (fe) return 'attack';
      for (var k = 0; k < 4; k++) { var e = enemyAt(H.x + DX[k], H.y + DY[k]); if (e) return turnTo(k); }
      // BFS from the hero (closed doors count as passable: bumping opens them)
      var D = new Int32Array(m.w * m.h).fill(-1), Pv = new Int32Array(m.w * m.h).fill(-1), q = [H.x, H.y], h = 0; D[H.y * w + H.x] = 0;
      while (h < q.length) { var x = q[h++], y = q[h++]; for (var j = 0; j < 4; j++) { var nx = x + DX[j], ny = y + DY[j], t = cellAt(m, nx, ny); if (D[ny * w + nx] >= 0 || !(t === FLOOR || t === DOOR)) continue; if (enemyAt(nx, ny)) continue; D[ny * w + nx] = D[y * w + x] + 1; Pv[ny * w + nx] = y * w + x; q.push(nx, ny); } }
      function stepTo(tx, ty) { var i = ty * w + tx; if (D[i] < 0) return null; while (Pv[i] >= 0 && Pv[i] !== H.y * w + H.x) i = Pv[i]; var sx = i % w, sy = Math.floor(i / w); return dirOf(sx - H.x, sy - H.y); }
      var best = null, bs = 1e9;
      function consider(x, y, score) { if (score < bs && D[y * w + x] > 0) { bs = score; best = [x, y]; } }
      // awake monsters nearby: go to them (cells next to them)
      S.enemies.forEach(function (e) { if (e.gone || e.dying || !e.awake) return; for (var j = 0; j < 4; j++) { var ax = e.x + DX[j], ay = e.y + DY[j]; if (D[ay * w + ax] > 0 && D[ay * w + ax] <= 5) consider(ax, ay, D[ay * w + ax] - 4); } });
      // the boss on the last floor
      if (m.last) S.enemies.forEach(function (e) { if (e.boss && !e.gone && !e.dying) for (var j = 0; j < 4; j++) { var ax = e.x + DX[j], ay = e.y + DY[j]; if (D[ay * w + ax] > 0) consider(ax, ay, D[ay * w + ax] + 6); } });
      // items seen
      S.items.forEach(function (it) { if (!it.taken && S.explored[it.y * w + it.x] && D[it.y * w + it.x] > 0) consider(it.x, it.y, D[it.y * w + it.x] - 2); });
      // the stairs once found
      if (m.stairs && m.stairs.fx != null && S.explored[m.stairs.y * w + m.stairs.x]) {
        if (H.x === m.stairs.fx && H.y === m.stairs.fy) { var sd = dirOf(m.stairs.x - H.x, m.stairs.y - H.y); return sd === H.dir ? 'up' : turnTo(sd); }
        consider(m.stairs.fx, m.stairs.fy, D[m.stairs.fy * w + m.stairs.fx] + (exploredShare() > 0.55 ? 0 : 12));
      }
      // the nearest frontier: a reachable cell next to an unexplored cell
      if (!best || bs > 6) for (var yy = 0; yy < m.h; yy++) for (var xx = 0; xx < m.w; xx++) {
        var ii = yy * w + xx; if (D[ii] <= 0) continue; var fr = false;
        for (var j2 = 0; j2 < 4; j2++) { var nx2 = xx + DX[j2], ny2 = yy + DY[j2]; if (nx2 >= 0 && ny2 >= 0 && nx2 < m.w && ny2 < m.h && !S.explored[ny2 * w + nx2]) fr = true; }
        if (fr) consider(xx, yy, D[ii] + 3);
      }
      // nothing left to explore that is not behind a monster: go and fight the nearest one
      if (!best) S.enemies.forEach(function (e) { if (e.gone || e.dying) return; for (var j = 0; j < 4; j++) { var ax = e.x + DX[j], ay = e.y + DY[j]; if (D[ay * w + ax] > 0) consider(ax, ay, D[ay * w + ax] + 20); } });
      if (!best && m.stairs && m.stairs.fx != null) { if (H.x === m.stairs.fx && H.y === m.stairs.fy) { var sd2 = dirOf(m.stairs.x - H.x, m.stairs.y - H.y); return sd2 === H.dir ? 'up' : turnTo(sd2); } best = [m.stairs.fx, m.stairs.fy]; }
      if (!best) return 'wait';
      var dir = stepTo(best[0], best[1]); if (dir == null) return 'wait';
      return dir === H.dir ? 'up' : turnTo(dir);
    }
    function turnTo(k) { var H = S.hero; if (k === H.dir) return 'up'; return ((k - H.dir + 4) % 4) === 3 ? 'left' : 'right'; }
    function exploredShare() { var n = 0, o = 0, m = S.map; for (var i = 0; i < m.cells.length; i++) if (m.cells[i] === FLOOR) { o++; if (S.explored[i]) n++; } return o ? n / o : 1; }

    /* ---------------- update ---------------- */
    function update(ms) {
      if (!S) return;
      ms = +ms || 0; if (ms <= 0) { layoutLabels(0); return; }
      S.time += ms; var H = S.hero, m = S.map, w = m.w;
      S.flick = 0.94 + Math.sin(S.time / 97) * 0.035 + Math.sin(S.time / 41 + 1.3) * 0.025;
      if (S.fade > 0 && !(S.act && S.act.kind === 'descend')) S.fade = Math.max(0, S.fade - ms / 380);
      if (S.banner) { S.banner.t += ms; if (S.banner.t > 2700) S.banner = null; }
      S.log.forEach(function (l) { l.t += ms; }); S.log = S.log.filter(function (l) { return l.t < 3600; });
      if (S.hurtT > 0) S.hurtT = Math.max(0, S.hurtT - ms);
      if (S.sway > 0) S.sway = Math.max(0, S.sway - ms / 300);
      S.indicators.forEach(function (i) { i.t += ms; }); S.indicators = S.indicators.filter(function (i) { return i.t < 620; });
      for (var i = 0; i < m.cells.length; i++) if (m.cells[i] === DOOR && m.doorOpen[i] < m.doorGoal[i]) m.doorOpen[i] = Math.min(m.doorGoal[i], m.doorOpen[i] + ms / 300);
      S.enemies.forEach(function (e) {
        if (e.flash > 0) e.flash--; else if (e.hurtT > 0) e.hurtT = Math.max(0, e.hurtT - ms);
        if (e.dodgeT > 0) e.dodgeT = Math.max(0, e.dodgeT - ms / 280);
        if (e.dying && !e.flash) { e.dieT += ms; if (e.dieT > DIE_MS) e.gone = true; }
        e.poseT += ms;
      });
      // endings
      if (!S.ended && S.winAt && S.time >= S.winAt) { finish('win'); }
      if (!S.ended && S.loseAt && S.time >= S.loseAt) { finish('lose'); }
      // the action timeline
      if (S.act) {
        var a = S.act; a.t += ms; var u = Math.min(1, a.t / a.dur);
        if (a.kind === 'attack' && !a.done && a.t >= a.at) { a.done = true; heroStrike(a); }
        if (a.kind === 'potion' && !a.done && a.t >= a.at) { a.done = true; heal(num((lib.items.potion && lib.items.potion.effect && lib.items.potion.effect.heal), 14), 'potion'); say('You drink a tonic.', COLORS.heal); }
        if (a.kind === 'eattack') { var ea = byId(a.id); if (ea && !ea.gone) { ea.pose = a.t < 210 ? 'wind' : a.t < 360 ? 'strike' : 'idle'; ea.lunge = a.t < 210 ? 0 : a.t < 360 ? Math.sin((a.t - 210) / 150 * Math.PI) : 0; } if (!a.done && a.t >= a.at) { a.done = true; enemyStrike(a); } }
        if (a.kind === 'emove') S.enemies.forEach(function (e) { if (e.mt < 1) e.mt = Math.min(1, e.mt + ms / a.dur); });
        if (u >= 1) {
          S.act = null;
          if (a.kind === 'eattack') { var eb = byId(a.id); if (eb) { eb.pose = 'idle'; eb.lunge = 0; } }
          if (a.kind === 'emove') S.enemies.forEach(function (e) { e.mt = 1; });
          if (a.kind === 'move') pickup();
          if (a.kind === 'descend') { nextFloor(); S.think = 30; }
          else if (a.turn && !S.ended && H.hp > 0) { if (!S.winAt) enemyTurn(); }
          else if (a.kind === 'eattack' || a.kind === 'emove') { if (!S.queue2.length) endTurn(); }
          if (!S.act && S.queue2 && S.queue2.length) S.act = S.queue2.shift();
        }
      }
      // camera follows the hero
      var cam = S.cam, A2 = S.act;
      if (A2 && A2.kind === 'move') { var k = ease(A2.t / A2.dur); cam.x = lerp(A2.x0, H.x + 0.5, k); cam.y = lerp(A2.y0, H.y + 0.5, k); }
      else if (A2 && A2.kind === 'bump') { var kb = Math.sin(Math.min(1, A2.t / A2.dur) * Math.PI) * 0.07; cam.x = H.x + 0.5 + A2.dx * kb; cam.y = H.y + 0.5 + A2.dy * kb; }
      else { cam.x = H.x + 0.5; cam.y = H.y + 0.5; }
      if (A2 && A2.kind === 'turn') cam.a = lerp(A2.a0, A2.a1, ease(A2.t / A2.dur)); else cam.a = dirAngle(H.dir);
      if (A2 && A2.kind === 'descend') { S.fade = Math.min(1, A2.t / 420); var kd = ease(Math.min(1, A2.t / 420)) * 0.3; cam.x = H.x + 0.5 + DX[H.dir] * kd; cam.y = H.y + 0.5 + DY[H.dir] * kd; }
      cam.bob = A2 && A2.kind === 'move' ? Math.round(Math.sin(A2.t / A2.dur * Math.PI) * 1.5) : 0;
      // next action: queued key, held key, or the bot
      if (!S.act && !S.ended && S.phase === 'play' && H.hp > 0 && !S.winAt) {
        var nk = null;
        if (S.queue.length) nk = S.queue.shift();
        else if (held.up) nk = 'up'; else if (held.down) nk = 'down'; else if (held.left) nk = 'left'; else if (held.right) nk = 'right';
        else if (auto) { if (S.think > 0) S.think -= ms / STEP; else { nk = botKey(); S.think = 5; } }
        if (nk) { S.mapOpen = nk === 'map' ? S.mapOpen : S.mapOpen; begin(nk); }
      }
      look();
      layoutLabels(ms);
    }
    function finish(result) {
      S.ended = true; S.phase = result === 'win' ? 'won' : 'lost';
      var info = { result: result, floor: S.floorN, floors: S.floors, level: S.hero.lvl, kills: S.hero.kills, gold: S.hero.gold, turns: S.turn, hp: S.hero.hp };
      ev({ kind: 'end', result: result, info: info }); cb('onEnd', result, info);
    }

    /* ---------------- what the camera sees (derived from the state; used by anchors, labels, the minimap) ---------------- */
    var lookKey = '';
    function look() {
      var F = field(), cam = camNow(), key2 = F.w + ':' + cam.x.toFixed(3) + ':' + cam.y.toFixed(3) + ':' + cam.a.toFixed(3) + ':' + S.floorN + ':' + S.turn;
      cols = castColumns(S.map, cam, F.w, cols);
      if (key2 === lookKey) return; lookKey = key2;
      // explored cells: a fan of rays up to 9 cells
      var m = S.map, B = camBasis(cam, 64);
      for (var r = 0; r <= 48; r++) {
        var cx = r / 24 - 1, dx = B.dx + B.rx * B.half * cx * 1.1, dy = B.dy + B.ry * B.half * cx * 1.1, L = Math.sqrt(dx * dx + dy * dy);
        for (var s = 0; s < 9; s += 0.2) { var x = Math.floor(cam.x + dx / L * s), y = Math.floor(cam.y + dy / L * s); if (x < 0 || y < 0 || x >= m.w || y >= m.h) break; S.explored[y * m.w + x] = 1; if (!passable(x, y)) break; }
      }
      for (var k = 0; k < 4; k++) S.explored[(S.hero.y + DY[k]) * m.w + S.hero.x + DX[k]] = 1;
      S.explored[S.hero.y * m.w + S.hero.x] = 1;
    }
    function camNow() { var c = S.cam, back = clamp(num(P.eyeBack, 0.32), 0, 0.4); return { x: c.x - Math.cos(c.a) * back, y: c.y - Math.sin(c.a) * back, a: c.a, fov: num(P.fov, 76), bob: c.bob || 0, time: S.time }; }
    function enemyPos(e) {
      var k = ease(e.mt), x = lerp(e.fx, e.x, k) + 0.5, y = lerp(e.fy, e.y, k) + 0.5, H = S.hero;
      if (e.lunge) { var ddx = H.x + 0.5 - x, ddy = H.y + 0.5 - y, L = Math.sqrt(ddx * ddx + ddy * ddy) || 1; x += ddx / L * 0.28 * e.lunge; y += ddy / L * 0.28 * e.lunge; }
      if (e.dodgeT > 0) { var B = camBasis(camNow(), 10), sd = Math.sin(e.dodgeT * Math.PI) * 0.22; x += B.rx * sd; y += B.ry * sd; }
      return { x: x, y: y };
    }
    function lookOf(e) { return LOOKS[e.def.look] || LOOKS.slime; }
    function enemyPose(e) {
      var L = lookOf(e);
      if (e.dying || e.hurtT > 0 || e.flash > 0) return 'hurt';
      if (e.pose === 'wind' || e.pose === 'strike') return e.pose;
      if (L.poses.indexOf('idle2') >= 0) { var n = Math.floor((e.poseT + e.phase0) / 110) % 4; return ['idle0', 'idle1', 'idle2', 'idle1'][n]; }
      return Math.floor((e.poseT + e.phase0) / 480) % 2 ? 'idle1' : 'idle0';
    }
    function enemySprite(e) {
      var L = lookOf(e), d = e.def, pose = enemyPose(e), spr;
      if (typeof d.draw === 'function') { spr = customSprite(e.kind, d, pose); }
      else spr = spriteFor(LOOKS[d.look] ? d.look : 'slime', pose, d.palette || null);
      var lift = num(d.lift, L.lift); if (L.lift > 0 && !e.dying) lift += Math.sin((S.time + e.phase0) / 260) * 0.03;
      if (e.dying && L.lift > 0) lift = Math.max(0, lift - Math.min(1, e.dieT / 640) * lift);
      return { spr: spr, size: num(d.size, L.size), lift: lift };
    }
    var customCache = {};
    function customSprite(kind, d, pose) {   // def.draw(P, pose): paints into a 64x64 Pix (same API as the built-ins use)
      var key3 = kind + ':' + pose; if (customCache[key3]) return customCache[key3];
      var P2 = Pix(64, 64); safe(d.draw, [P2, pose, { hash: hash, ramp: ramp, lit: lit }], 'enemy draw ' + kind); P2.outline(OUT); P2.foot = footRow(P2);
      return (customCache[key3] = P2);
    }
    function boxOf(e) {   // projected billboard box in logical px (field-relative + field origin), or null
      var F = field(), cam = camNow(), p = enemyPos(e), sp = enemySprite(e), pr = project(cam, F.w, F.h, p.x, p.y, sp.lift); if (!pr) return null;
      var artH = sp.spr.foot + 1, h = pr.f * sp.size / pr.depth, scale = h / artH, wpx = sp.spr.w * scale, foot = pr.y, top = foot - h;
      var x0 = pr.x - wpx / 2, vis = false, c0 = Math.max(0, Math.floor(x0)), c1 = Math.min(F.w - 1, Math.ceil(x0 + wpx) - 1);
      // opaque columns of the art bound the box tighter than the canvas
      var minU = sp.spr.w, maxU = -1, minV = artH; for (var v = 0; v < artH; v++) for (var u = 0; u < sp.spr.w; u++) if (sp.spr.d[(v * sp.spr.w + u) * 4 + 3]) { if (u < minU) minU = u; if (u > maxU) maxU = u; if (v < minV) minV = v; }
      var bx = x0 + minU * scale, bw = (maxU - minU + 1) * scale, by = top + minV * scale, bh = foot - by;
      for (var c = Math.max(c0, Math.floor(bx)); c <= Math.min(c1, Math.ceil(bx + bw) - 1); c++) if (cols && cols.zbuf[c] > pr.depth) { vis = true; break; }
      return { x: F.x + bx, y: F.y + by, w: bw, h: bh, cx: F.x + pr.x, foot: F.y + foot, depth: pr.depth, visible: vis && pr.depth < 11 && bx + bw > 0 && bx < F.w };
    }
    function clipF(r) { var F = field(), x0 = Math.max(F.x, r.x), y0 = Math.max(F.y, r.y), x1 = Math.min(F.x + F.w, r.x + r.w), y1 = Math.min(F.y + F.h, r.y + r.h); return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null; }
    // the weapon view scales with the 3D view and keeps to the lower right: its box is 58 % of the view's height, at most 60 % of its width,
    // so the resting blade never reaches the face of a monster in the next cell (checks/screen.py)
    function swordBox() { var F = field(), Sz = Math.round(Math.min(F.h * 0.58, F.w * 0.4)), W2 = Math.round(Sz * 1.5); return { x: F.x + F.w - W2 + Math.round(W2 * 0.08), y: F.y + F.h - Sz + Math.round(Sz * 0.08), w: W2, h: Sz }; }
    function swordRasterFor(h, pose) { var key = 'R:' + h + ':' + pose; return swordCache[key] || (swordCache[key] = swordRaster(h, pose)); }
    function swordPlace() {   // where the sword is drawn this frame: the raster, its top-left, the pose (derived from update state)
      var b = swordBox(), pose = swordPose(), a = S.act, bobY = a && a.kind === 'move' ? Math.round(Math.sin(a.t / a.dur * Math.PI) * 3) : Math.round(Math.sin(S.time / 700) * 1), sx = Math.round(Math.sin(S.sway * Math.PI) * 6);
      var R = swordRasterFor(b.h, pose), bb = R.bbox || (R.bbox = opaqueBox(R));
      return { R: R, x: b.x + sx, y: b.y + bobY, pose: pose, box: b, opaque: { x: b.x + sx + bb.x, y: b.y + bobY + bb.y, w: bb.w, h: bb.h } };
    }
    function opaqueBox(R) { var x0 = R.w, y0 = R.h, x1 = -1, y1 = -1; for (var y = 0; y < R.h; y++) for (var x = 0; x < R.w; x++) if (R.d[(y * R.w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; }
    function weaponOverlap(r) {   // opaque sword pixels inside rect r (logical px), clipped to the view
      if (!S || !r) return 0; var sp = swordPlace(), R = sp.R, F = field(), n = 0;
      for (var y = Math.max(Math.floor(r.y), F.y); y < Math.min(Math.ceil(r.y + r.h), F.y + F.h); y++) for (var x = Math.max(Math.floor(r.x), F.x); x < Math.min(Math.ceil(r.x + r.w), F.x + F.w); x++) {
        var u = x - sp.x, v = y - sp.y; if (u < 0 || v < 0 || u >= R.w || v >= R.h) continue; if (R.d[(v * R.w + u) * 4 + 3]) n++;
      }
      return n;
    }
    function faceBox(e) {   // the upper part of a monster's opaque billboard box (its head / eyes), clipped to the view
      var b = boxOf(e); if (!b || !b.visible) return null; var c = clipF({ x: b.x + b.w * 0.2, y: b.y, w: b.w * 0.6, h: b.h * 0.42 }); return c;
    }
    function heroRect() { var sp = swordPlace(); return clipF(sp.opaque); }
    // the hero's sword and every visible monster (a felled one too, while it crumbles; no monster steps into its cell meanwhile): its billboard box narrowed to the columns where it is in front of the wall;
    // opt.pad grows each rect by that many px (for overlays that place text around characters)
    function unitRects(opt) {
      if (!S) return [];
      var pad = Math.max(0, num(opt && opt.pad, 0)), out = [], hr = heroRect(), F = field();
      function grow(r) { return clipF({ x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }); }
      if (hr) { var g2 = grow(hr); if (g2) out.push(Object.assign({ id: 'hero', kind: 'hero' }, g2)); }
      // nearest first: a column belongs to the front-most monster whose box covers it (a farther one keeps only the columns it
      // shows past the nearer ones), so the rects never overlap one another
      var list = []; S.enemies.forEach(function (e) { if (e.gone) return; var bx = boxOf(e); if (bx && bx.visible) list.push({ e: e, b: bx }); });
      list.sort(function (p, q) { return p.b.depth - q.b.depth; });
      var owned = new Uint8Array(F.w);
      list.forEach(function (o) {
        var e = o.e, b = o.b, c0 = Math.max(0, Math.floor(b.x - F.x)), c1 = Math.min(F.w - 1, Math.ceil(b.x + b.w - F.x) - 1), v0 = -1, v1 = -1, c;
        for (c = c0; c <= c1; c++) if (cols && cols.zbuf[c] > b.depth && !owned[c]) { if (v0 < 0) v0 = c; v1 = c; }
        for (c = c0; c <= c1; c++) owned[c] = 1;
        if (v0 < 0) return;
        var r = clipF({ x: F.x + v0, y: b.y, w: v1 - v0 + 1, h: b.h }); if (!r) return; var g3 = grow(r); if (g3) out.push(Object.assign({ id: e.id, kind: e.kind }, g3));
      });
      return out;
    }
    function anchor(id) {
      if (!S) return null; var F = field();
      // the hero is the camera: its anchor is a small spot just above the HUD beside the HP numbers (numbers for the hero go there)
      if (id === 'hero') { var hx = view.x + 23 + (view.w < 300 ? 52 : 70), hy = F.y + F.h - 14; return { x: hx + 8, top: hy, left: hx, w: 16, h: 14, cy: hy + 7, footY: F.y + F.h, dead: S.hero.hp <= 0, hidden: false }; }
      var e = byId(id); if (!e) return null; var b = boxOf(e); if (!b) return { x: F.x + F.w / 2, top: F.y, left: F.x, w: 0, h: 0, cy: F.y, footY: F.y, dead: e.hp <= 0, hidden: true };
      var c = clipF(b) || b, top = c.y;
      // another living monster standing over this one on screen (nearer or behind): things placed "above" this one go above it too
      S.enemies.forEach(function (o) { if (o === e || o.gone || o.dying) return; var ob = boxOf(o); if (!ob || !ob.visible) return; if (ob.x < c.x + c.w && c.x < ob.x + ob.w && ob.y < top + 4) top = Math.min(top, Math.max(F.y, ob.y)); });
      return { x: c.x + c.w / 2, top: top, left: c.x, w: c.w, h: c.y + c.h - top, cy: c.y + c.h / 2, footY: b.foot, dead: e.hp <= 0, hidden: !b.visible || e.gone, depth: b.depth };
    }
    function uiRects() {
      var out = []; if (!S) return out;
      if (hudRect) out.push(Object.assign({ name: 'hud' }, hudRect));
      if (miniRect) out.push(Object.assign({ name: 'minimap' }, miniRect));
      if (logRect) out.push(Object.assign({ name: 'log' }, logRect));
      if (bannerRect) out.push(Object.assign({ name: 'banner' }, bannerRect));
      if (mapRect) out.push(Object.assign({ name: 'map' }, mapRect));
      return out;
    }

    /* ---------------- combat labels: placed beside their owner, never over a character, the HUD or the edge; they glide ---------------- */
    function layoutRects() {   // computed in update so the stills match play
      var F = field(), sm = view.w < 300, mini = P.minimap === 'off' ? null : miniLayout(F), L = logLayout(F), Bn = bannerLayout(F);
      miniRect = mini; logRect = L; bannerRect = Bn; hudRect = { x: view.x, y: F.y + F.h, w: view.w, h: view.y + view.h - F.y - F.h };
      mapRect = S.mapOpen ? mapLayout(F) : null; if (mapRect) { miniRect = null; logRect = null; }
    }
    function layoutLabels(ms) {
      layoutRects();
      var F = field(), units = unitRects(), ui = uiRects().filter(function (r) { return r.name !== 'hud'; }), taken = [];
      S.labels.forEach(function (lb) { lb.t += ms; });
      S.labels = S.labels.filter(function (lb) { return lb.t < lb.life && !lb.dead; });
      S.labels.forEach(function (lb) {
        var own = lb.owner === 'hero' ? (heroRect() || { x: F.x, y: F.y + F.h - 30, w: 30, h: 30 }) : null, e = null;
        if (lb.owner !== 'hero') { e = byId(lb.owner); if (e && (e.gone || e.pose === 'wind' || e.pose === 'strike') && lb.shown) lb.life = Math.min(lb.life, lb.t + 120); var b = e && !e.gone && boxOf(e); own = b ? (clipF(b) || null) : null; if (!own && lb.ox != null) own = { x: lb.ox, y: lb.oy, w: lb.ow, h: lb.oh }; }
        if (!own) { lb.hidden = true; return; }
        lb.ox = own.x; lb.oy = own.y; lb.ow = own.w; lb.oh = own.h;
        var w = lb.w, h = lb.h, rise = Math.min(1, lb.t / 500) * 6, cands = [];
        if (lb.owner === 'hero') {   // just above the HUD: left of the sword first
          var hx0 = view.x + 23 + (view.w < 300 ? 52 : 70); cands.push([hx0, F.y + F.h - h - 3 - rise], [hx0 - w - 6, F.y + F.h - h - 3 - rise], [view.x + 4, F.y + F.h - h - 3 - rise], [hx0 + w + 6, F.y + F.h - h - 3 - rise]);
        } else {
          cands.push([own.x + own.w / 2 - w / 2, own.y - h - 4 - rise], [own.x + own.w + 5, own.y + own.h * 0.22 - rise], [own.x - w - 5, own.y + own.h * 0.22 - rise], [own.x + own.w + 5, own.y + 2 - rise], [own.x - w - 5, own.y + 2 - rise]);
        }
        var pick = null;
        for (var i = 0; i < cands.length && !pick; i++) {
          var r = { x: Math.round(cands[i][0]), y: Math.round(cands[i][1]), w: w, h: h };
          if (!inside(r, { x: F.x + 1, y: F.y + 1, w: F.w - 2, h: F.h - 2 })) continue;
          if (units.some(function (u) { return overlap(r, u, 1); })) continue;
          if (ui.some(function (u) { return overlap(r, u, 1); })) continue;
          if (taken.some(function (t) { return overlap(r, t, 1); })) continue;
          pick = { r: r, slot: i };
        }
        if (!pick) { if (lb.shown) lb.dead = true; lb.hidden = true; return; }    // shown once: never re-shown
        // the label keeps an offset from its owner's top centre and glides that offset to the new slot (never a jump);
        // if the glide would cross a character or a window, the label ends instead of snapping
        var ax = own.x + own.w / 2, ay = own.y, tdx = pick.r.x - ax, tdy = pick.r.y - ay;
        if (lb.dx == null) { lb.dx = tdx; lb.dy = tdy; }
        else if (ms > 0) { var ex = tdx - lb.dx, ey = tdy - lb.dy, dd = Math.sqrt(ex * ex + ey * ey), mx = 6; if (dd > mx) { lb.dx += ex / dd * mx; lb.dy += ey / dd * mx; } else { lb.dx = tdx; lb.dy = tdy; } }
        var cur = { x: Math.round(ax + lb.dx), y: Math.round(ay + lb.dy), w: w, h: h };
        if (!inside(cur, { x: F.x + 1, y: F.y + 1, w: F.w - 2, h: F.h - 2 }) || units.some(function (u) { return overlap(cur, u, 0); }) || ui.some(function (u) { return overlap(cur, u, 0); }) || taken.some(function (t) { return overlap(cur, t, 0); })) {
          if (lb.shown) { lb.dead = true; lb.hidden = true; return; }
          lb.dx = tdx; lb.dy = tdy; cur = pick.r;
        }
        lb.hidden = false; lb.shown = true; taken.push(cur); lb.rect = cur;
      });
    }
    function labels() { return S ? S.labels.filter(function (l) { return !l.hidden && l.rect && !l.dead; }).map(function (l) { return { id: l.id, ax: l.rect.x - l.dx, ay: l.rect.y - l.dy, owner: l.owner, text: l.text, kind: l.kind, x: l.rect.x, y: l.rect.y, w: l.rect.w, h: l.rect.h, t: l.t }; }) : []; }

    /* ---------------- layout of the UI pieces ---------------- */
    function miniLayout(F) { var m = S.map, c = view.w < 300 ? 2 : 3, w = m.w * c + 6, h = m.h * c + 6; return { x: F.x + F.w - w - 4, y: F.y + 4, w: w, h: h, c: c }; }
    function logLayout(F) { var n = S.log.length; if (!n) return null; var w = Math.min(F.w - (miniRect ? miniRect.w + 14 : 8), 200); var rows = Math.min(2, n); return { x: F.x + 4, y: F.y + 4, w: w, h: rows * 10 + 4 }; }
    function bannerLayout(F) { if (!S.banner) return null; var t = S.banner.t, a = t < 300 ? ease(t / 300) : t > 2400 ? 1 - ease((t - 2400) / 300) : 1, w = Math.min(F.w - 24, Math.max(measure(S.banner.title), measure(S.banner.sub)) * 1 + 28); return { x: Math.round(F.x + (F.w - w) / 2), y: Math.round(F.y + F.h * 0.3 - 4 + (1 - a) * -6), w: w, h: 26, a: a }; }
    function mapLayout(F) { var m = S.map, c = Math.max(3, Math.floor(Math.min((F.w - 30) / m.w, (F.h - 44) / m.h))), w = Math.max(m.w * c + 12, 150), h = m.h * c + 34; return { x: Math.round(F.x + (F.w - w) / 2), y: Math.round(F.y + (F.h - h) / 2), w: w, h: h, c: c }; }

    /* ---------------- drawing ---------------- */
    function ensureBuf(W, H) {
      if (rgbaBuf && rgbaBuf.W === W && rgbaBuf.H === H) return;
      off = mkCanvas(W, H); offG = off && off.getContext('2d');
      img = offG ? offG.createImageData(W, H) : { data: new Uint8ClampedArray(W * H * 4) }; rgbaBuf = { W: W, H: H, d: img.data };
    }
    var lastRender = null;
    function sceneSprites() {
      var list = [];
      S.items.forEach(function (it) { if (it.taken) return; var d = it.def; list.push({ id: it.id, x: it.x + 0.5, y: it.y + 0.5, spr: itemSprite(d.look || 'flask', d.color || '#d83a3a'), size: num(d.size, 0.26), lift: 0, bright: 1.1 }); });
      S.enemies.forEach(function (e) {
        if (e.gone) return; var p = enemyPos(e), sp = enemySprite(e);
        list.push({ id: e.id, x: p.x, y: p.y, spr: sp.spr, size: sp.size, lift: sp.lift, flash: e.flash > 0, dissolve: e.dying && !e.flash ? clamp(0.15 + e.dieT / DIE_MS * 0.9, 0, 1) : 0 });
      });
      return list;
    }
    function drawScene(g, opt) {
      if (!S || !g) return; var weapon = !(opt && opt.weapon === false);
      try {
        var F = field(); ensureBuf(F.w, F.h);
        var d = rgbaBuf.d; for (var i = 3; i < d.length; i += 4) d[i] = 0;
        lastRender = renderView(d, F.w, F.h, S.map, camNow(), { art: A, LM: S.LM, fog: P.fog, lantern: P.lantern, flicker: S.flick }, sceneSprites(), null);
        lastBoxes = lastRender.boxes;
        if (offG) { offG.putImageData(img, 0, 0); g.save(); g.imageSmoothingEnabled = false; g.drawImage(off, F.x, F.y); g.restore(); }
        if (weapon) { drawSword(g, F); drawPotion(g, F); } drawIndicators(g, F);
        if (S.hurtT > 0) vignette(g, F, '#c01808', 0.62 * S.hurtT / 320);
        if (S.fade > 0) { g.fillStyle = 'rgba(6,4,8,' + S.fade.toFixed(3) + ')'; g.fillRect(F.x, F.y, F.w, F.h); }
      } catch (e) { warn('drawScene', e); }
    }
    function vignette(g, F, col, a) {
      var c = rgb(col), gr = g.createRadialGradient(F.x + F.w / 2, F.y + F.h / 2, Math.min(F.w, F.h) * 0.32, F.x + F.w / 2, F.y + F.h / 2, Math.max(F.w, F.h) * 0.62);
      gr.addColorStop(0, 'rgba(' + c + ',0)'); gr.addColorStop(1, 'rgba(' + c + ',' + a.toFixed(3) + ')'); g.fillStyle = gr; g.fillRect(F.x, F.y, F.w, F.h);
    }
    function swordPose() {
      var a = S.act;
      if (a && a.kind === 'attack') return a.t < 90 ? 'wind' : a.t < 210 ? 'strike' : 'recover';
      if (S.hurtT > 160) return 'hurt';
      return 'idle';
    }
    function rasterCanvas(key, R) { var c = swordCache[key]; if (c) return c; var cv = mkCanvas(R.w, R.h); if (!cv) return null; var gg = cv.getContext('2d'), id = gg.createImageData(R.w, R.h); id.data.set(R.d); gg.putImageData(id, 0, 0); return (swordCache[key] = cv); }
    function drawSword(g, F) {
      var sp = swordPlace(), c = rasterCanvas('C:' + sp.box.h + ':' + sp.pose, sp.R), a = S.act; if (!c) return;
      g.save(); g.beginPath(); g.rect(F.x, F.y, F.w, F.h); g.clip(); g.imageSmoothingEnabled = false;
      // the swept arc: drawn while the blade crosses (90-210 ms) and fading over the next 3 frames, behind the strike's path
      if (a && a.kind === 'attack' && a.t >= 90 && a.t < 260) {
        var sm = rasterCanvas('S:' + sp.box.h, swordCache['SR:' + sp.box.h] || (swordCache['SR:' + sp.box.h] = smearRaster(sp.box.h)));
        g.globalAlpha = a.t < 210 ? 0.85 : 0.85 * (1 - (a.t - 210) / 50); if (sm) g.drawImage(sm, sp.x, sp.y); g.globalAlpha = 1;
      }
      g.drawImage(c, sp.x, sp.y); g.restore();
    }
    function drawPotion(g, F) {
      var a = S.act; if (!a || a.kind !== 'potion') return;
      var u = a.t / a.dur, lift = Math.sin(Math.min(1, u) * Math.PI), spr = itemSprite('flask', '#d83a3a'), k = Math.max(2, Math.round(F.h / 70)), key5 = 'potionHand:' + k, c = swordCache[key5];
      if (!c) { var cv = mkCanvas(spr.w, spr.h); if (!cv) return; var gg = cv.getContext('2d'), id = gg.createImageData(spr.w, spr.h); id.data.set(spr.d); gg.putImageData(id, 0, 0); c = swordCache[key5] = cv; }
      g.save(); g.beginPath(); g.rect(F.x, F.y, F.w, F.h); g.clip(); g.imageSmoothingEnabled = false;
      g.drawImage(c, Math.round(F.x + F.w * 0.18), Math.round(F.y + F.h - spr.h * k * lift * 0.9), spr.w * k, spr.h * k); g.restore();
    }
    function drawIndicators(g, F) {
      S.indicators.forEach(function (i) {
        var a = i.t < 120 ? 1 : 1 - (i.t - 120) / 500; if (a <= 0) return;
        g.fillStyle = 'rgba(230,40,30,' + (0.85 * a).toFixed(3) + ')';
        var cy = F.y + F.h / 2, s = Math.max(6, Math.round(F.h * 0.07));
        if (i.side === 'left' || i.side === 'back') for (var k = 0; k < s; k++) g.fillRect(F.x + 3 + k, Math.round(cy - s + k), 2, (s - k) * 2);
        if (i.side === 'right' || i.side === 'back') for (var k2 = 0; k2 < s; k2++) g.fillRect(F.x + F.w - 5 - k2, Math.round(cy - s + k2), 2, (s - k2) * 2);
      });
    }
    function panel(g, r, alpha) {
      var x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
      g.fillStyle = '#0a070e'; g.fillRect(x + 1, y, w - 2, h); g.fillRect(x, y + 1, w, h - 2);
      g.fillStyle = 'rgba(22,16,30,' + (alpha == null ? 0.92 : alpha) + ')'; g.fillRect(x + 1, y + 1, w - 2, h - 2);
      g.fillStyle = '#5c4a78'; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 4);
      g.fillStyle = '#2a2038'; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
      g.fillStyle = '#d8a848'; g.fillRect(x + 1, y + 1, 2, 2); g.fillRect(x + w - 3, y + 1, 2, 2); g.fillRect(x + 1, y + h - 3, 2, 2); g.fillRect(x + w - 3, y + h - 3, 2, 2);
    }
    function bar(g, x, y, w, h, v, col, back) {
      g.fillStyle = '#0a070e'; g.fillRect(x - 1, y - 1, w + 2, h + 2); g.fillStyle = back || '#3a1a22'; g.fillRect(x, y, w, h);
      var fw = Math.round(w * clamp(v, 0, 1)); g.fillStyle = col; g.fillRect(x, y, fw, h); g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x, y, fw, 1);
    }
    function drawUI(g) {
      if (!S || !g) return;
      try {
        layoutRects();
        var F = field(), H = S.hero, hr = hudRect, sm = view.w < 300;
        // HUD strip
        g.fillStyle = '#0d0912'; g.fillRect(hr.x, hr.y, hr.w, hr.h);
        g.fillStyle = '#3a2c4c'; g.fillRect(hr.x, hr.y, hr.w, 1); g.fillStyle = '#d8a848'; g.fillRect(hr.x, hr.y + 1, hr.w, 1); g.fillStyle = '#1a1224'; g.fillRect(hr.x, hr.y + 2, hr.w, 1);
        var y1 = sm ? hr.y + 5 : hr.y + Math.round((hr.h - 7) / 2), x = hr.x + 6;
        text(g, 'HP', x, y1, { color: '#ffb0a0' }); var bw = sm ? 52 : 70;
        bar(g, x + 13, y1 + 1, bw, 6, H.hp / H.maxHp, H.hp <= H.maxHp * 0.3 ? '#ff5040' : '#e83a3a');
        text(g, H.hp + '/' + H.maxHp, x + 17 + bw, y1, { color: COLORS.ink });
        var x2 = x + 17 + bw + measure('99/99') + 10;
        potRect = { x: x2 - 2, y: hr.y + 3, w: 28, h: 13 };
        drawIcon(g, 'flask', x2, y1 - 1); text(g, 'x' + H.potions, x2 + 10, y1, { color: H.potions ? COLORS.ink : COLORS.dim });
        var x3 = x2 + 32; drawIcon(g, 'coins', x3, y1 - 1); text(g, String(H.gold), x3 + 10, y1, { color: COLORS.gold });
        var lv = 'LV ' + H.lvl, y2 = sm ? hr.y + 17 : y1;
        var xl = sm ? hr.x + 6 : x3 + 16 + measure(String(H.gold)) + 8;
        text(g, lv, xl, y2, { color: '#b8d8ff' });
        var nx = XP_STEPS[H.lvl] || XP_STEPS[XP_STEPS.length - 1], px = XP_STEPS[H.lvl - 1] || 0;
        bar(g, xl + measure(lv) + 4, y2 + 2, sm ? 30 : 36, 4, H.lvl >= XP_STEPS.length ? 1 : (H.xp - px) / Math.max(1, nx - px), '#6aa8ff', '#1a2440');
        // floor and compass on the right
        var fl = 'F' + S.floorN + '/' + S.floors, comp = DIRNAME[H.dir], cxr = hr.x + hr.w - 6;
        var cw = 13; g.fillStyle = '#0a070e'; g.fillRect(cxr - cw, (sm ? y2 : y1) - 2, cw, 11); g.fillStyle = '#2a2038'; g.fillRect(cxr - cw + 1, (sm ? y2 : y1) - 1, cw - 2, 9);
        text(g, comp, cxr - cw / 2, sm ? y2 : y1, { color: '#ffd070', align: 'center' });
        text(g, fl, cxr - cw - 5, sm ? y2 : y1, { color: COLORS.dim, align: 'right' });
        if (!sm) text(g, S.map.name, cxr - cw - 10 - measure(fl), y1, { color: '#cdbfdc', align: 'right' });
        // minimap
        if (miniRect && !mapRect) drawMini(g, miniRect, false);
        // message log (newest at the bottom; lines slide up when a new one comes)
        if (logRect && !mapRect) {
          var rows = S.log.slice(-2);
          rows.forEach(function (l, i) {
            var a = l.t > 3300 ? 1 - (l.t - 3300) / 300 : 1, y3 = logRect.y + 2 + i * 10 + (l.t < 120 && i === rows.length - 1 ? Math.round((1 - l.t / 120) * 4) : 0);
            g.globalAlpha = clamp(a, 0, 1); text(g, clip(l.text, logRect.w - 4), logRect.x + 2, y3, { color: l.color, outline: '#0a070e' }); g.globalAlpha = 1;
          });
        }
        // banner
        if (bannerRect) { var Bn = bannerRect; g.globalAlpha = Bn.a; panel(g, Bn, 0.9); text(g, S.banner.title, Bn.x + Bn.w / 2, Bn.y + 4, { color: '#ffd070', align: 'center' }); text(g, S.banner.sub, Bn.x + Bn.w / 2, Bn.y + 14, { color: '#d8c8e8', align: 'center' }); g.globalAlpha = 1; }
        // combat labels
        S.labels.forEach(function (lb) {
          if (lb.hidden || !lb.rect) return;
          var a = lb.t > lb.life - 160 ? (lb.life - lb.t) / 160 : 1; g.globalAlpha = clamp(a, 0, 1);
          var R2 = lb.rect; g.fillStyle = 'rgba(10,7,14,0.62)'; g.fillRect(R2.x + 1, R2.y, R2.w - 2, R2.h); g.fillRect(R2.x, R2.y + 1, R2.w, R2.h - 2);
          text(g, lb.text, R2.x + 3, R2.y + 2, { color: lb.color, outline: '#0a070e' }); g.globalAlpha = 1;
        });
        if (mapRect) drawMini(g, mapRect, true);
      } catch (e) { warn('drawUI', e); }
    }
    function clip(s, w) { s = String(s); if (measure(s) <= w) return s; while (s.length > 1 && measure(s + '..') > w) s = s.slice(0, -1); return s + '..'; }
    var ICONS = {};
    function drawIcon(g, look, x, y) {
      var c = ICONS[look]; if (!c) { var spr = itemSprite(look, look === 'flask' ? '#d83a3a' : '#e8b848'), cv = mkCanvas(16, 16); if (!cv) return; var gg = cv.getContext('2d'), t = mkCanvas(32, 32), tg = t.getContext('2d'), id = tg.createImageData(32, 32); id.data.set(spr.d); tg.putImageData(id, 0, 0); gg.imageSmoothingEnabled = false; gg.drawImage(t, 4, 2, 24, 30, 0, 0, 8, 10); c = ICONS[look] = cv; }
      g.drawImage(c, x, y);
    }
    function drawMini(g, r, big) {
      var m = S.map, c = r.c, ox = r.x + (big ? Math.round((r.w - m.w * c) / 2) : 3), oy = r.y + (big ? 16 : 3);
      panel(g, r, big ? 0.96 : 0.86);
      if (big) text(g, 'MAP - ' + m.name, r.x + r.w / 2, r.y + 5, { color: '#ffd070', align: 'center' });
      for (var y = 0; y < m.h; y++) for (var x = 0; x < m.w; x++) {
        var i = y * m.w + x; if (!S.explored[i]) continue; var t = m.cells[i], col = null;
        if (t === FLOOR) col = '#3a3046'; else if (t === DOOR) col = doorOpen(x, y) ? '#6a4a2c' : '#a86a34'; else if (t === STAIRS) col = '#5ad0d8'; else if (t === TORCH) col = '#e89a3a'; else col = '#8a7a9a';
        if (t === WALL || t === BANNER) { var nearF = false; for (var k = 0; k < 4; k++) { var tt = cellAt(m, x + DX[k], y + DY[k]); if (tt === FLOOR || tt === DOOR) nearF = true; } if (!nearF) continue; }
        g.fillStyle = col; g.fillRect(ox + x * c, oy + y * c, c, c);
      }
      S.items.forEach(function (it) { if (!it.taken && S.explored[it.y * m.w + it.x]) { g.fillStyle = '#ffd34a'; g.fillRect(ox + it.x * c + (c > 2 ? 1 : 0), oy + it.y * c + (c > 2 ? 1 : 0), Math.max(1, c - 2), Math.max(1, c - 2)); } });
      S.enemies.forEach(function (e) { if (e.gone || e.dying) return; var b = boxOf(e); if (!(b && b.visible) && !(big && e.awake && S.explored[e.y * m.w + e.x])) return; g.fillStyle = e.boss ? '#ff40c0' : '#ff4a3a'; g.fillRect(ox + e.x * c, oy + e.y * c, c, c); });
      // the hero: an arrow pointing where the camera looks
      var H = S.hero, hx = ox + H.x * c + c / 2, hy = oy + H.y * c + c / 2, s = Math.max(2, c);
      g.fillStyle = '#fff4c0'; g.beginPath(); var ang = S.cam.a;
      g.moveTo(hx + Math.cos(ang) * s, hy + Math.sin(ang) * s); g.lineTo(hx + Math.cos(ang + 2.4) * s * 0.8, hy + Math.sin(ang + 2.4) * s * 0.8); g.lineTo(hx + Math.cos(ang - 2.4) * s * 0.8, hy + Math.sin(ang - 2.4) * s * 0.8); g.closePath(); g.fill();
      if (big) {   // legend
        var ly = r.y + r.h - 12, items = [['#fff4c0', 'you'], ['#ff4a3a', 'foe'], ['#ffd34a', 'item'], ['#a86a34', 'door'], ['#5ad0d8', 'stairs']], tw = 0;
        items.forEach(function (it) { tw += 8 + measure(it[1]) + 8; }); var lx = Math.round(r.x + (r.w - tw + 8) / 2);
        items.forEach(function (it) { g.fillStyle = it[0]; g.fillRect(lx, ly + 2, 5, 5); text(g, it[1], lx + 8, ly, { color: '#cdbfdc' }); lx += 8 + measure(it[1]) + 8; });
      }
    }

    /* ---------------- public instance ---------------- */
    var inst = {
      version: VERSION, lib: lib, params: P,
      start: start, update: function (ms) { try { update(ms); } catch (e) { warn('update', e); } }, drawScene: drawScene, drawUI: drawUI,
      key: key, pointer: pointer, setHeld: function (h) { held = h || {}; }, setAuto: function (on) { auto = !!on; }, auto: function () { return auto; },
      setView: function (v) { view = Object.assign({}, view, v || {}); lookKey = ''; if (S) { cols = null; look(); layoutLabels(0); } },
      setParams: function (o) { Object.assign(P, o || {}); },
      fieldRect: function () { return field(); }, uiRects: uiRects, unitRects: unitRects, anchor: anchor, labels: labels,
      addEnemy: function (id, d) { lib.enemies[id] = d; return id; }, addItem: function (id, d) { lib.items[id] = d; return id; }, addMap: function (id, d) { lib.maps[id] = d; return id; },
      hero: function () { return S && S.hero; }, enemies: function () { return S ? S.enemies : []; }, enemy: byId, items: function () { return S ? S.items : []; }, map: function () { return S && S.map; },
      explored: function () { return S && S.explored; }, phase: function () { return S ? S.phase : 'idle'; }, turn: function () { return S ? S.turn : 0; }, busy: function () { return !!(S && S.act); },
      camera: function () { return S ? camNow() : null; }, rng: function () { return S ? S.rng() : 0; }, floor: function () { return S ? S.floorN : 0; },
      weaponOverlap: weaponOverlap, weaponRect: function () { return S ? swordPlace().opaque : null; }, faceBox: function (id) { var e = byId(id); return e && !e.gone && !e.dying ? faceBox(e) : null; },
      renderStats: function () { return lastRender ? { cols: lastRender.cols.W, noHit: lastRender.cols.noHit, sprites: Object.keys(lastRender.boxes).length } : null; },
      botKey: function () { return S ? botKey() : null; },
      state: function () {
        if (!S) return null; var H = S.hero;
        return { phase: S.phase, floor: S.floorN, floors: S.floors, theme: S.map.theme, hp: H.hp, maxHp: H.maxHp, potions: H.potions, gold: H.gold, level: H.lvl, xp: H.xp, atk: H.atk, def: H.def, kills: H.kills,
          turn: S.turn, hero: { x: H.x, y: H.y, dir: H.dir }, act: S.act ? S.act.kind : null, map: S.mapOpen, enemies: S.enemies.filter(function (e) { return !e.gone; }).length,
          explored: Array.prototype.reduce.call(S.explored, function (a, b) { return a + b; }, 0), labels: S.labels.filter(function (l) { return !l.hidden; }).length, time: Math.round(S.time),
          banner: !!S.banner, hurt: S.hurtT > 0, sword: swordPose(), flash: S.enemies.some(function (e) { return !e.gone && e.flash > 0; }) };
      },
      actors: function () {
        if (!S) return []; var out = [{ id: 'hero', x: Math.round(view.x + view.w / 2), y: Math.round(field().y + field().h), facing: DIRNAME[S.hero.dir], noFace: 'first-person camera (the view is the hero)' }];
        S.enemies.forEach(function (e) { if (e.gone) return; var b = boxOf(e); if (!b || !b.visible) return; out.push({ id: e.id, x: Math.round(b.cx), y: Math.round(b.foot), facing: 'front', target: 'hero', asset: e.def.look, kind: e.kind, pose: enemyPose(e), flash: e.flash > 0, noFace: 'frontal billboard: always drawn facing the camera (the hero)' }); });
        return out;
      },
      hash: function () { if (!S) return ''; var H = S.hero, s = [S.floorN, S.turn, H.x, H.y, H.dir, H.hp, H.maxHp, H.potions, H.gold, H.lvl, H.xp, H.kills, S.phase].join(','); S.enemies.forEach(function (e) { s += '|' + e.id + ':' + e.kind + ':' + e.x + ':' + e.y + ':' + e.hp + ':' + (e.gone ? 1 : 0); }); return s; }
    };
    return inst;
  }

  /* drawSprite: one billboard alone at an integer scale (title screens, sheets, previews); id = enemy id, item id or a def */
  function drawSprite(g, id, x, footY, scale, pose) {
    var d = typeof id === 'object' ? id : (ENEMIES[id] || ITEMS[id]); if (!d || !g) return false;
    var spr = d.effect ? itemSprite(d.look || 'flask', d.color || '#d83a3a') : spriteFor(LOOKS[d.look] ? d.look : 'slime', pose || 'idle0', d.palette || null);
    var cv = mkCanvas(spr.w, spr.h); if (!cv) return false; var gg = cv.getContext('2d'), im = gg.createImageData(spr.w, spr.h); im.data.set(spr.d); gg.putImageData(im, 0, 0);
    var k = Math.max(1, Math.round(scale || 1)); g.save(); g.imageSmoothingEnabled = false; g.drawImage(cv, Math.round(x - spr.w * k / 2), Math.round(footY - (spr.foot + 1) * k), spr.w * k, spr.h * k); g.restore();
    return true;
  }

