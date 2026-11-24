
  /* ------------------------------------------------------------------ the simulation ------------------------------------------------------------------ */
  var HASH_BITS = 12, HASH_N = 1 << HASH_BITS, CELL = 40;
  function cellHash(cx, cy) { return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & (HASH_N - 1); }

  function Sim(lib, params, opt) {
    var S = this;
    S.lib = lib; S.P = params; S.opt = opt;
    var cap = Math.max(200, Math.min(1600, Math.ceil(num(params.enemyCap, 400) * 1.5) + 80));
    S.cap = cap;
    S.ex = new Float32Array(cap); S.ey = new Float32Array(cap); S.evx = new Float32Array(cap); S.evy = new Float32Array(cap);
    S.ekx = new Float32Array(cap); S.eky = new Float32Array(cap); S.ehp = new Float32Array(cap); S.emax = new Float32Array(cap);
    S.ek = new Int16Array(cap); S.eflash = new Float32Array(cap); S.eblade = new Float32Array(cap); S.eshot = new Float32Array(cap);
    S.eph = new Float32Array(cap); S.eface = new Int8Array(cap); S.eaux = new Float32Array(cap); S.eauxx = new Float32Array(cap); S.eauxy = new Float32Array(cap);
    S.edead = new Uint8Array(cap); S.euid = new Int32Array(cap); S.espawnT = new Float32Array(cap);
    S.hStart = new Int32Array(HASH_N + 1); S.hItems = new Int32Array(cap); S.hOf = new Int32Array(cap); S.visit = new Int32Array(64);
    var PC = 600; S.pcap = PC;
    S.px = new Float32Array(PC); S.py = new Float32Array(PC); S.pvx = new Float32Array(PC); S.pvy = new Float32Array(PC); S.plife = new Float32Array(PC);
    S.pdmg = new Float32Array(PC); S.ppierce = new Int16Array(PC); S.pkind = new Int8Array(PC); S.psize = new Float32Array(PC); S.pw = new Int16Array(PC); S.page = new Float32Array(PC);
    S.phits = new Int32Array(PC * 16); S.pnh = new Int8Array(PC);
    var GC = 520; S.gcap = GC;
    S.gx = new Float32Array(GC); S.gy = new Float32Array(GC); S.gv = new Float32Array(GC); S.gs = new Uint8Array(GC); S.gt = new Float32Array(GC); S.gvx = new Float32Array(GC); S.gvy = new Float32Array(GC);
    var FC = 1400; S.fcap = FC;
    S.fx = new Float32Array(FC); S.fy = new Float32Array(FC); S.fz = new Float32Array(FC); S.fvx = new Float32Array(FC); S.fvy = new Float32Array(FC); S.fvz = new Float32Array(FC);
    S.flife = new Float32Array(FC); S.fmax = new Float32Array(FC); S.fsize = new Float32Array(FC); S.fcol = new Int8Array(FC); S.fn = 0;
    S.corpses = []; for (var i = 0; i < 160; i++) S.corpses.push({ on: false });
    S.nums = []; for (i = 0; i < 70; i++) S.nums.push({ on: false });
    S.rings = []; for (i = 0; i < 24; i++) S.rings.push({ on: false });
  }
  var SP = Sim.prototype;

  SP.reset = function (o) {
    var S = this, P = S.P; o = o || {};
    S.seed = num(o.seed, 1) >>> 0;
    S.rng = mulberry(S.seed ^ 0x9e3779b9); S.rngUp = mulberry(S.seed ^ 0x51ed270b); S.rngFx = mulberry(S.seed ^ 0x2545f491); S.rngBot = mulberry(S.seed ^ 0x7f4a7c15);
    S.n = 0; S.np = 0; S.ng = 0; S.fn = 0; S.uid = 0;
    S.corpses.forEach(function (c) { c.on = false; }); S.nums.forEach(function (c) { c.on = false; }); S.rings.forEach(function (c) { c.on = false; });
    S.pickups = [];
    S.t = 0; S.frame = 0; S.spawnAcc = 0; S.evIdx = 0; S.phase = 'play'; S.endT = 0; S.ended = false; S.result = null;
    S.dawnWin = false; S.boss = -1; S.bossUid = -1; S.bossDef = null; S.bossHp = 0; S.bossMax = 0; S.slam = null; S.bossSeen = false;
    S.modal = null; S.pending = 0; S.hitStopMs = 0; S.shakeA = 0; S.hurtT = 0;
    var H = S.hero = { x: 0, y: 0, vx: 0, vy: 0, face: 1, dirx: 1, diry: 0, r: 10, hp: num(o.hp, num(P.heroHp, 100)), maxHp: num(o.maxHp, num(P.heroHp, 100)), iframes: 0,
      speed: num(P.heroSpeed, 100), mods: { speed: 0, maxHp: 0, magnet: 0, haste: 0, might: 0, reach: 0, regen: 0 }, level: 1, xp: 0, need: needXp(1), kills: 0,
      weapons: [], passives: {}, phase: 0, moving: false, dmgTaken: 0, regenAcc: 0 };
    S.stats = { spawned: 0, kills: 0, xpDropped: 0, xpCollected: 0, xpLost: 0, merged: 0, levels: 0, picks: [], hits: 0, damage: 0, taken: 0, spawnOnScreen: 0, recycled: 0, maxEnemies: 0, offers: [], projectiles: 0, maxGems: 0 };
    S.cam = { x: 0, y: 0 };
    var start = o.weapons || [P.startWeapon || 'bolt'];
    for (var i = 0; i < start.length; i++) if (S.lib.weapons[start[i]]) S.addWeapon(start[i]);
    S.waves = S.lib.waves; S.scaleT = num(P.duration, 200) / (S.waves.length || 200);
    S.kindIds = Object.keys(S.lib.enemies); S.kindIdx = {}; for (i = 0; i < S.kindIds.length; i++) S.kindIdx[S.kindIds[i]] = i;
    S.kindDefs = S.kindIds.map(function (k) { return S.lib.enemies[k]; });
    S.input = { x: 0, y: 0 };
    S.buildHash();
  };
  SP.addWeapon = function (id) {
    var H = this.hero, w;
    for (var i = 0; i < H.weapons.length; i++) if (H.weapons[i].id === id) { w = H.weapons[i]; w.lv = Math.min(w.lv + 1, this.lib.weapons[id].levels.length); return w; }
    w = { id: id, lv: 1, t: 300 + H.weapons.length * 170, ang: 0 }; H.weapons.push(w); return w;
  };
  SP.wlv = function (w) { var d = this.lib.weapons[w.id]; return d.levels[clamp(w.lv, 1, d.levels.length) - 1]; };
  SP.magnetR = function () { return num(this.P.magnet, 70) * (1 + this.hero.mods.magnet); };
  /* the simulation never reads the canvas size: spawn ring, scatter box and recycling use one fixed reference view that covers both a
     640x360 landscape and a 360x780 portrait screen, so the same seed plays the same game in any layout */
  var REF_W = 640, REF_H = 780, REF_R = Math.sqrt(360 * 360 + 780 * 780) / 2;
  SP.viewR = function () { return REF_R; };

  /* ---------- spatial hash (counting sort into flat arrays; no per-frame garbage) ---------- */
  SP.buildHash = function () {
    var S = this, n = S.n, st = S.hStart, it = S.hItems, of = S.hOf, i, h;
    st.fill(0);
    for (i = 0; i < n; i++) { h = cellHash(Math.floor(S.ex[i] / CELL), Math.floor(S.ey[i] / CELL)); of[i] = h; st[h + 1]++; }
    for (i = 0; i < HASH_N; i++) st[i + 1] += st[i];
    var fill = S._fill || (S._fill = new Int32Array(HASH_N));
    for (i = 0; i < HASH_N; i++) fill[i] = st[i];
    for (i = 0; i < n; i++) { h = of[i]; it[fill[h]++] = i; }
  };
  /* calls fn(i, dx, dy, d2) for every live enemy whose centre lies within r of (x, y); fn returning true stops */
  SP.query = function (x, y, r, fn) {
    var S = this, x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    var r2 = r * r, nv = 0, vis = S.visit, cx, cy, h, k, j, i, dx, dy, d2, seen;
    for (cy = y0; cy <= y1; cy++) for (cx = x0; cx <= x1; cx++) {
      h = cellHash(cx, cy); seen = false;
      for (k = 0; k < nv; k++) if (vis[k] === h) { seen = true; break; }
      if (seen) continue; if (nv < 64) vis[nv++] = h;
      for (j = S.hStart[h]; j < S.hStart[h + 1]; j++) {
        i = S.hItems[j]; if (S.edead[i]) continue;
        dx = S.ex[i] - x; dy = S.ey[i] - y; d2 = dx * dx + dy * dy;
        if (d2 <= r2 && fn(i, dx, dy, d2)) return;
      }
    }
  };

  /* ---------- spawning ---------- */
  SP.ringPos = function (ang, extra) {
    var S = this, R = S.viewR() + 50 + (extra || 0);
    return { x: S.cam.x + Math.cos(ang) * R, y: S.cam.y + Math.sin(ang) * R };
  };
  SP.spawn = function (kid, x, y, manual) {
    var S = this, k = S.kindIdx[kid]; if (k == null) return -1;
    var def = S.kindDefs[k];
    if (S.n >= S.cap) return -1;
    var i = S.n++, mins = S.t / 60000, hpMul = (1 + mins * 0.55 * num(S.P.hpScale, 1)) * (def.boss ? 1 : 1);
    S.ex[i] = x; S.ey[i] = y; S.evx[i] = 0; S.evy[i] = 0; S.ekx[i] = 0; S.eky[i] = 0;
    S.ehp[i] = S.emax[i] = Math.round(def.hp * (def.boss ? num(S.P.hpScale, 1) : hpMul));
    S.ek[i] = k; S.eflash[i] = 0; S.eblade[i] = 0; S.eshot[i] = def.shoot ? def.shoot.cd * (0.5 + S.rng() * 0.5) : 0;
    S.eph[i] = S.rng() * TAU; S.eface[i] = x < S.hero.x ? 1 : -1; S.eaux[i] = 0; S.eauxx[i] = 0; S.eauxy[i] = 0; S.edead[i] = 0; S.euid[i] = ++S.uid; S.espawnT[i] = S.t;
    S.stats.spawned++;
    // a spawn must never appear on screen
    var v = S.view, sx = x - S.cam.x, sy = y - S.cam.y;
    if (!manual && Math.abs(sx) < v.w / 2 + def.h * 0.6 && sy > -v.h / 2 && sy - def.h * (1 + (def.hover || 0)) < v.h / 2) S.stats.spawnOnScreen++;
    if (def.boss) { S.boss = i; S.bossUid = S.euid[i]; S.bossDef = def; S.bossMax = S.ehp[i]; S.bossSeen = true; S.eaux[i] = def.slam ? def.slam.every * 0.6 : 0; S.eauxx[i] = def.summon ? def.summon.every * 0.5 : 0; S.event({ kind: 'boss', id: kid, uid: S.euid[i] }); }
    if (S.n > S.stats.maxEnemies) S.stats.maxEnemies = S.n;
    return i;
  };
  SP.pickKind = function (mix) {
    var S = this, tot = 0, k;
    for (k in mix) if (S.kindIdx[k] != null) tot += mix[k];
    var r = S.rng() * tot;
    for (k in mix) if (S.kindIdx[k] != null) { r -= mix[k]; if (r <= 0) return k; }
    return null;
  };
  SP.spawnTick = function (dt) {
    var S = this, W = S.waves, ts = S.t / 1000 / S.scaleT, seg = null, i;
    for (i = 0; i < W.segments.length; i++) if (ts >= W.segments[i].from && ts < W.segments[i].to) { seg = W.segments[i]; break; }
    var cap = num(S.P.enemyCap, 400);
    if (seg) {
      S.spawnAcc += seg.rate * num(S.P.spawnRate, 1) * dt / 1000 * (S.n < cap * 0.25 ? 1.35 : 1);
      while (S.spawnAcc >= 1) {
        S.spawnAcc -= 1; if (S.n >= cap) { S.spawnAcc = 0; break; }
        var kid = S.pickKind(seg.mix); if (!kid) break;
        var a = S.rng() * TAU;
        if (S.hero.moving && S.rng() < 0.35) a = Math.atan2(S.hero.diry, S.hero.dirx) + (S.rng() - 0.5) * 1.6;
        var p = S.ringPos(a, S.rng() * 40); S.spawn(kid, p.x, p.y);
      }
    }
    while (S.evIdx < W.events.length && ts >= W.events[S.evIdx].at) {
      var e = W.events[S.evIdx++], n = Math.max(1, num(e.n, 1)), base = S.rng() * TAU, j, q;
      if (e.kind === 'ring') { for (j = 0; j < n; j++) { q = S.ringPos(base + j * TAU / n, 10); if (S.n < cap + 60) S.spawn(e.enemy, q.x, q.y); } }
      else if (e.kind === 'burst') { for (j = 0; j < n; j++) { q = S.ringPos(base + (S.rng() - 0.5) * 0.7, 20 + S.rng() * 70); if (S.n < cap + 60) S.spawn(e.enemy, q.x, q.y); } }
      else if (e.kind === 'boss') { if (S.boss < 0) { for (j = 0; j < S.n; j++) { if (S.edead[j] || S.kindDefs[S.ek[j]].elite) continue; var ox2 = S.ex[j] - S.cam.x, oy2 = S.ey[j] - S.cam.y; if (Math.abs(ox2) > REF_W / 2 + 30 || Math.abs(oy2) > REF_H / 2 + 50) S.kill(j, 'scatter', true); } q = S.ringPos(S.hero.moving ? Math.atan2(S.hero.diry, S.hero.dirx) : base, 50); S.spawn(e.enemy, q.x, q.y); } }
      else { for (j = 0; j < n; j++) { q = S.ringPos(base + j * 1.3, 10); S.spawn(e.enemy, q.x, q.y); } }
      S.event({ kind: 'wave', wave: e.kind, enemy: e.enemy, n: n, at: S.t });
    }
  };

  /* ---------- damage ---------- */
  SP.hitEnemy = function (i, dmg, kx, ky, src) {
    var S = this; if (S.edead[i] || S.phase !== 'play') return;
    var def = S.kindDefs[S.ek[i]], m = def.mass || 1;
    dmg = Math.max(1, Math.round(dmg));
    var before = S.ehp[i]; S.ehp[i] -= dmg; S.eflash[i] = 110;
    S.ekx[i] += kx / m; S.eky[i] += ky / m;
    S.stats.hits++; S.stats.damage += Math.min(before, dmg);
    var killed = S.ehp[i] <= 0;
    if (S.opt.onHit) safe(S.opt.onHit, { kind: 'damage', target: 'e' + S.euid[i], enemy: S.kindIds[S.ek[i]], source: src, amount: dmg, hpBefore: before, hpAfter: Math.max(0, S.ehp[i]), killed: killed, x: S.ex[i], y: S.ey[i] - def.h * (0.55 + (def.hover || 0)), boss: !!def.boss, elite: !!def.elite });
    if (S.P.numbers !== 'off') S.number(S.ex[i], S.ey[i] - def.h * (0.9 + (def.hover || 0)), dmg, def.boss || dmg >= 30);
    if (killed) S.kill(i, src);
  };
  SP.kill = function (i, src, quiet) {
    var S = this; if (S.edead[i]) return;
    var def = S.kindDefs[S.ek[i]];
    S.edead[i] = 1;
    S.corpse(i, def);
    if (quiet) return;
    S.hero.kills++; S.stats.kills++;
    var nb = def.boss ? 26 : def.elite ? 14 : 6, j;
    for (j = 0; j < nb; j++) { var a = S.rngFx() * TAU, sp = 30 + S.rngFx() * (def.boss ? 160 : 70); S.particle(S.ex[i], S.ey[i], def.h * 0.4, Math.cos(a) * sp, Math.sin(a) * sp * 0.6, 40 + S.rngFx() * 60, 380 + S.rngFx() * 300, 1.5 + S.rngFx() * 2.5, def.boss ? 3 : def.elite ? 2 : 0); }
    if (def.xp > 0) S.dropGem(S.ex[i], S.ey[i], def.xp);
    if (def.drop === 'potion') S.pickups.push({ kind: 'potion', x: S.ex[i], y: S.ey[i], t: 0, heal: 30 });
    if (def.elite) { S.dropGem(S.ex[i] + 8, S.ey[i] + 4, 4); S.dropGem(S.ex[i] - 8, S.ey[i] - 3, 4); }
    if (S.opt.onKill) safe(S.opt.onKill, { id: 'e' + S.euid[i], enemy: S.kindIds[S.ek[i]], x: S.ex[i], y: S.ey[i], source: src, boss: !!def.boss, elite: !!def.elite });
    S.event({ kind: 'death', id: 'e' + S.euid[i], enemy: S.kindIds[S.ek[i]], boss: !!def.boss });
    if (def.boss && i === S.boss) { S.boss = -1; S.bossHp = 0; S.win(); }
  };
  SP.hurtHero = function (dmg, src) {
    var S = this, H = S.hero; if (H.iframes > 0 || S.phase !== 'play' || dmg <= 0) return false;
    var before = H.hp; H.hp = Math.max(0, H.hp - dmg); H.iframes = 600; S.hurtT = 260; H.dmgTaken += before - H.hp; S.stats.taken += before - H.hp;
    S.shake(3, 10);
    if (S.opt.onHit) safe(S.opt.onHit, { kind: 'damage', target: 'hero', source: src, amount: before - H.hp, hpBefore: before, hpAfter: H.hp, killed: H.hp <= 0, x: H.x, y: H.y - 26 });
    if (H.hp <= 0) S.lose();
    return true;
  };
  SP.healHero = function (n, src) {
    var H = this.hero, before = H.hp; H.hp = Math.min(H.maxHp, H.hp + n);
    if (H.hp > before && this.opt.onHit) safe(this.opt.onHit, { kind: 'heal', target: 'hero', source: src, amount: H.hp - before, hpBefore: before, hpAfter: H.hp, killed: false, x: H.x, y: H.y - 26 });
  };
  SP.win = function () { var S = this; if (S.phase !== 'play') return; S.phase = 'won'; S.endT = 0; S.np = 0; if (S.boss >= 0) { S.kill(S.boss, 'dawn', true); S.boss = -1; S.bossHp = 0; } for (var i = 0; i < S.n; i++) if (!S.edead[i]) S.kill(i, 'end', true); S.event({ kind: 'won', by: S.dawnWin ? 'dawn' : 'boss' }); };
  SP.lose = function () { var S = this; if (S.phase !== 'play') return; S.phase = 'lost'; S.endT = 0; S.np = 0; S.event({ kind: 'lost' }); };
  SP.event = function (ev) { if (this.opt.onEvent) safe(this.opt.onEvent, ev); };
  SP.shake = function (a, f) { if (this.P.shake === 'off' || this.P.reduced === 'on') return; this.shakeA = Math.max(this.shakeA, a); };

  /* ---------- pools: gems, projectiles, particles, corpses, numbers, rings ---------- */
  SP.dropGem = function (x, y, v) {
    var S = this; S.stats.xpDropped += v;
    if (S.ng >= S.gcap) {   // full: fold the value into an existing gem (xp is never lost)
      var j = (S.frame * 7 + S.stats.merged * 13) % S.ng; S.gv[j] += v; S.stats.merged++; return;
    }
    var i = S.ng++, a = S.rngFx() * TAU;
    S.gx[i] = x; S.gy[i] = y; S.gv[i] = v; S.gs[i] = 0; S.gt[i] = 0; S.gvx[i] = Math.cos(a) * 40; S.gvy[i] = Math.sin(a) * 26;
    if (S.ng > S.stats.maxGems) S.stats.maxGems = S.ng;
  };
  SP.shoot = function (kind, x, y, vx, vy, dmg, pierce, size, life, w) {
    var S = this; if (S.np >= S.pcap) return -1;
    var i = S.np++;
    S.px[i] = x; S.py[i] = y; S.pvx[i] = vx; S.pvy[i] = vy; S.pdmg[i] = dmg; S.ppierce[i] = pierce; S.pkind[i] = kind; S.psize[i] = size || 1; S.plife[i] = life || 1600; S.pw[i] = w == null ? -1 : w; S.page[i] = 0; S.pnh[i] = 0;
    S.stats.projectiles++;
    return i;
  };
  SP.particle = function (x, y, z, vx, vy, vz, life, size, col) {
    var S = this, i = S.fn < S.fcap ? S.fn++ : (S.frame * 31 + (S.fn & 255)) % S.fcap;
    S.fx[i] = x; S.fy[i] = y; S.fz[i] = z; S.fvx[i] = vx; S.fvy[i] = vy; S.fvz[i] = vz; S.flife[i] = life; S.fmax[i] = life; S.fsize[i] = size; S.fcol[i] = col;
  };
  SP.corpse = function (i, def) {
    var S = this, c = null, k, old = null;
    for (k = 0; k < S.corpses.length; k++) { if (!S.corpses[k].on) { c = S.corpses[k]; break; } if (!old || S.corpses[k].t > old.t) old = S.corpses[k]; }
    c = c || old;
    c.on = true; c.look = def.look; c.kind = S.kindIds[S.ek[i]]; c.x = S.ex[i]; c.y = S.ey[i]; c.face = S.eface[i]; c.t = 0; c.h = def.h; c.hover = def.hover || 0; c.boss = !!def.boss; c.dur = def.boss ? 1600 : 520;
  };
  SP.number = function (x, y, v, big) {   // nearby fresh numbers fold into one rolling total; none on the hero; fewer small ones in a crowd
    var S = this, H = S.hero, c = null, k, old = null, live = 0;
    if (!big && Math.abs(x - H.x) < 34 && y > H.y - 70 && y < H.y + 16) return;
    for (k = 0; k < S.nums.length; k++) { var q = S.nums[k]; if (!q.on) { if (!c) c = q; continue; } live++;
      if (q.t < 360 && Math.abs(q.x - x) < 26 && Math.abs(q.y - y) < 18) { q.v += v; q.t = Math.min(q.t, 60); q.big = q.big || big || q.v >= 30; return; }
      if (!old || q.t > old.t) old = q; }
    if (live >= 16 && !big && v < 14) return;
    if (live >= 24) c = old; if (!c) return;
    c.on = true; c.x = x + (S.rngFx() - 0.5) * 8; c.y = y; c.v = v; c.t = 0; c.big = !!big;
  };
  SP.ring = function (x, y, r, color, dur, kind) {
    var S = this, c = null, k; for (k = 0; k < S.rings.length; k++) if (!S.rings[k].on) { c = S.rings[k]; break; }
    if (!c) c = S.rings[S.frame % S.rings.length];
    c.on = true; c.x = x; c.y = y; c.r = r; c.color = color; c.t = 0; c.dur = dur || 420; c.kind = kind || 'pulse';
  };
