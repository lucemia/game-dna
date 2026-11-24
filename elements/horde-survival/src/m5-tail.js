
  /* ------------------------------------------------------------------ instance ------------------------------------------------------------------ */
  function merge(base, add) { var r = {}, k; for (k in base) r[k] = base[k]; if (add) for (k in add) r[k] = add[k]; return r; }
  function create(options) {
    var opt = options || {}, view = opt.view || { x: 0, y: 0, w: 640, h: 360 };
    var params = merge(DEFAULTS, opt.params);
    var lib = { weapons: merge(WEAPONS, opt.weapons), upgrades: merge(UPGRADES, opt.upgrades), enemies: merge(ENEMIES, opt.enemies), waves: opt.waves || WAVES, icons: opt.icons || {} };
    if (opt.builtins === false) { lib.weapons = merge({}, opt.weapons); lib.upgrades = merge({}, opt.upgrades); lib.enemies = merge({}, opt.enemies); }
    var userEvent = opt.onEvent, ended = false, endCalled = false;
    var hooks = { onHit: opt.onHit, onKill: opt.onKill, onPick: opt.onPick, onEvent: function (ev) {
      if (ev.kind === 'wave' && ev.wave !== 'elite') S.alert = { t: 0, text: ev.wave === 'boss' ? (lib.enemies[ev.enemy] ? lib.enemies[ev.enemy].name : 'The boss') + ' rises!' : ev.wave === 'ring' ? 'They close in from every side!' : 'A pack charges in!', color: ev.wave === 'boss' ? '#ff9a7a' : '#ffcf9a' };
      if (ev.kind === 'wave' && ev.wave === 'elite') S.alert = { t: 0, text: 'An elite approaches', color: '#ffd36a' };
      if (userEvent) safe(userEvent, ev);
    }, paintActor: opt.paintActor, heroFrames: opt.heroFrames, heroH: num(opt.heroH, 44), drawGround: opt.drawGround, traceDraw: opt.traceDraw, groundPalette: opt.groundPalette };
    var S = new Sim(lib, params, hooks); S.view = { x: num(view.x, 0), y: num(view.y, 0), w: num(view.w, 640), h: num(view.h, 360) };
    var Pn = new Painter(S, hooks);
    try { var SK = root.GameDNA_Skin && opt.skin != null && opt.skin !== false ? root.GameDNA_Skin.resolve(opt.skin) : null; if (SK && SK.fonts && SK.fonts.ui && !SK.pixel) Pn.font = SK.fonts.ui; } catch (e) { }
    S.reset({ seed: num(opt.seed, 1) }); S.phase = 'idle';
    S.auto = !!opt.autoplay;
    var stick = Pn.stick = { on: false, x0: 0, y0: 0, dx: 0, dy: 0 }, keyIn = { x: 0, y: 0 }, timing = { last: 0, avg: 0, n: 0 };
    function mixInput() { var x = keyIn.x + (stick.on ? stick.dx : 0), y = keyIn.y + (stick.on ? stick.dy : 0); S.input.x = clamp(x, -1, 1); S.input.y = clamp(y, -1, 1); }
    function uidOf(id) { var m = /^e(\d+)$/.exec(String(id)); return m ? +m[1] : -1; }
    function idx(id) { var u = uidOf(id); if (u < 0) return -1; for (var i = 0; i < S.n; i++) if (S.euid[i] === u && !S.edead[i]) return i; return -1; }
    function screen(x, y) { if (Pn.ox != null && Pn.frame === S.frame) return { x: x + Pn.ox, y: y + Pn.oy }; return { x: x + S.view.x + S.view.w / 2 - S.cam.x, y: y + S.view.y + S.view.h / 2 - S.cam.y }; }   // where it was drawn (shake included) when this frame is drawn
    var inst = {
      version: VERSION, lib: lib, view: S.view,
      start: function (o) {
        o = o || {}; S.reset({ seed: num(o.seed, num(opt.seed, 1)), weapons: o.weapons, hp: o.hp, maxHp: o.maxHp }); ended = false; endCalled = false; S.alert = null;
        if (o.x != null) { S.hero.x = +o.x; S.hero.y = num(o.y, 0); S.cam.x = S.hero.x; S.cam.y = S.hero.y; }
        S.event({ kind: 'start', seed: S.seed });
        return inst;
      },
      update: function (dt) {
        dt = num(dt, 1000 / 60); if (dt <= 0) return;
        dt = Math.min(dt, 50);
        var p0 = root.performance ? root.performance.now() : 0;
        if (S.alert) S.alert.t += dt;
        S.step(dt);
        if (root.performance) { var ms = root.performance.now() - p0; timing.last = ms; timing.avg = timing.avg * 0.95 + ms * 0.05; timing.n++; }
        if ((S.phase === 'won' || S.phase === 'lost') && !endCalled && S.endT >= 1500) {
          endCalled = true; ended = true;
          var info = { by: S.phase === 'won' ? (S.dawnWin ? 'dawn' : 'boss') : null, time: S.t, kills: S.hero.kills, level: S.hero.level, hp: S.hero.hp, maxHp: S.hero.maxHp, weapons: S.hero.weapons.map(function (w) { return { id: w.id, lv: w.lv }; }), passives: copy(S.hero.passives), stats: inst.stats() };
          safe(opt.onEnd, S.phase === 'won' ? 'win' : 'lose', info);
        }
      },
      draw: function (ctx) { inst.drawWorld(ctx); inst.drawUI(ctx); },
      drawWorld: function (ctx) { if (!ctx) return; try { Pn.drawWorld(ctx); } catch (e) { if (root.console) console.warn('[horde-survival] drawWorld', e && e.message); try { ctx.restore(); } catch (x) { } } },
      drawUI: function (ctx) { if (!ctx) return; try { ctx.save(); Pn.drawUI(ctx); ctx.restore(); } catch (e) { if (root.console) console.warn('[horde-survival] drawUI', e && e.message); try { ctx.restore(); } catch (x) { } } },
      setInput: function (x, y) { if (typeof x === 'object' && x) { y = x.y; x = x.x; } keyIn.x = num(x, 0); keyIn.y = num(y, 0); mixInput(); },
      key: function (k) { if (S.modal) return S.modalKey(k); return false; },
      pointer: function (type, x, y) {
        x = +x; y = +y;
        if (S.modal) {
          if (type !== 'down') return true;
          var cr = Pn.cardRects();
          for (var i = 0; i < cr.length; i++) { var r = cr[i]; if (x >= r.x && x <= r.x + r.w && y >= r.y - 8 && y <= r.y + r.h) { S.modal.sel = i; S.pick(i); return true; } }
          return true;
        }
        if (type === 'down') { stick.on = true; stick.x0 = x; stick.y0 = y; stick.dx = 0; stick.dy = 0; }
        else if (type === 'move' && stick.on) { var dx = x - stick.x0, dy = y - stick.y0, d = Math.sqrt(dx * dx + dy * dy); if (d > 30) { stick.x0 = x - dx / d * 30; stick.y0 = y - dy / d * 30; d = 30; dx = x - stick.x0; dy = y - stick.y0; } stick.dx = d > 4 ? dx / 30 : 0; stick.dy = d > 4 ? dy / 30 : 0; }
        else if (type === 'up' || type === 'cancel') { stick.on = false; stick.dx = stick.dy = 0; }
        mixInput(); return true;
      },
      setAuto: function (on) { S.auto = !!on; }, auto: function () { return !!S.auto; },
      pause: function (on) { S.paused = !!on; }, hitStop: function (ms) { S.hitStopMs = Math.max(S.hitStopMs, num(ms, 0)); },
      phase: function () { return S.modal ? 'levelup' : S.phase; }, over: function () { return ended; }, time: function () { return S.t; },
      hero: function () { var H = S.hero; return { id: 'hero', x: H.x, y: H.y, hp: H.hp, maxHp: H.maxHp, level: H.level, xp: H.xp, need: H.need, kills: H.kills, face: H.face, vx: H.vx, vy: H.vy, weapons: H.weapons.map(function (w) { return { id: w.id, lv: w.lv }; }), passives: copy(H.passives), mods: copy(H.mods), magnet: S.magnetR() }; },
      enemyCount: function () { return S.n; },
      enemies: function (fn, all) {   // fn({id, kind, x, y, hp, maxHp, face, vx, vy, boss, elite, sx, sy}) for every live enemy (on screen only unless all)
        var out = fn ? null : [], v = S.view;
        for (var i = 0; i < S.n; i++) { if (S.edead[i]) continue; var d = S.kindDefs[S.ek[i]], p = screen(S.ex[i], S.ey[i]);
          if (!all && (p.x < v.x - 40 || p.x > v.x + v.w + 40 || p.y < v.y - 20 || p.y > v.y + v.h + d.h)) continue;
          var e = { id: 'e' + S.euid[i], kind: S.kindIds[S.ek[i]], x: S.ex[i], y: S.ey[i], sx: p.x, sy: p.y, hp: S.ehp[i], maxHp: S.emax[i], face: S.eface[i], vx: S.evx[i], vy: S.evy[i], boss: !!d.boss, elite: !!d.elite, h: d.h, hover: d.hover || 0 };
          if (fn) fn(e); else out.push(e); }
        return out;
      },
      gems: function () { return { count: S.ng, value: (function () { var s = 0; for (var i = 0; i < S.ng; i++) s += S.gv[i]; return s; })() }; },
      offer: function () { return S.modal ? S.modal.choices.map(function (c) { return copy(c); }) : null; },
      pick: function (i) { return S.pick(i); },
      selected: function () { return S.modal ? S.modal.sel : -1; },
      anchor: function (id) {
        var H = S.hero, p, h, hover = 0, dead = false;
        if (id === 'hero') { p = screen(H.x, H.y); h = hooks.heroH; dead = S.phase === 'lost'; }
        else { var i = idx(id); if (i < 0) { var c = Pn.lastAnchor && Pn.lastAnchor[id]; return c ? merge(c, { dead: true }) : null; } var d = S.kindDefs[S.ek[i]]; p = screen(S.ex[i], S.ey[i]); h = d.h; hover = (d.hover || 0) * d.h; }
        var w = h * 0.7, a = { x: p.x, footY: p.y - hover, top: p.y - hover - h, left: p.x - w / 2, w: w, h: h, cy: p.y - hover - h * 0.5, dead: dead };
        if (id !== 'hero') { Pn.lastAnchor = Pn.lastAnchor || {}; Pn.lastAnchor[id] = a; }
        return a;
      },
      unitRects: function () {
        var out = [], H = S.hero, p = screen(H.x, H.y); out.push({ id: 'hero', x: p.x - hooks.heroH * 0.35, y: p.y - hooks.heroH, w: hooks.heroH * 0.7, h: hooks.heroH + 6 });
        inst.enemies(function (e) { var w = e.h * 0.7, lift = e.hover * e.h; out.push({ id: e.id, x: e.sx - w / 2, y: e.sy - lift - e.h, w: w, h: e.h }); });
        return out;
      },
      uiRects: function () { return (Pn.rects || []).map(function (r) { return copy(r); }); },
      cardRects: function () { return Pn.cardRects(); },
      setView: function (v) { if (!v) return; S.view.x = num(v.x, 0); S.view.y = num(v.y, 0); S.view.w = num(v.w, S.view.w); S.view.h = num(v.h, S.view.h); },
      worldToScreen: screen, camera: function () { return { x: S.cam.x, y: S.cam.y }; },
      addWeapon: function (id, def) { if (def) lib.weapons[id] = def; return !!lib.weapons[id]; },
      addEnemy: function (id, def) { if (def) { lib.enemies[id] = def; if (S.kindIdx[id] == null) { S.kindIdx[id] = S.kindIds.length; S.kindIds.push(id); S.kindDefs.push(def); } else S.kindDefs[S.kindIdx[id]] = def; } return !!lib.enemies[id]; },
      addUpgrade: function (id, def) { if (def) lib.upgrades[id] = def; return !!lib.upgrades[id]; },
      giveWeapon: function (id) { return lib.weapons[id] ? !!S.addWeapon(id) : false; },
      /* jump the wave clock to ms (scripted waves before it are skipped, the boss too unless boss: true) */
      skipTo: function (ms, o) { S.t = Math.max(0, num(ms, 0)); var ts = S.t / 1000 / S.scaleT; while (S.evIdx < S.waves.events.length && S.waves.events[S.evIdx].at < ts && !(o && o.boss && S.waves.events[S.evIdx].kind === 'boss')) S.evIdx++; },
      grantXp: function (n) { S.stats.xpDropped += num(n, 0); S.gainXp(num(n, 0)); },
      setLevel: function (lv) { var H = S.hero; H.level = Math.max(1, lv | 0); H.need = needXp(H.level); H.xp = 0; },
      spawn: function (kind, x, y) { var i = S.spawn(kind, num(x, S.hero.x + S.viewR() + 40), num(y, S.hero.y), true); return i >= 0 ? 'e' + S.euid[i] : null; },
      setParams: function (p) { for (var k in p) params[k] = p[k]; S.scaleT = num(params.duration, 200) / (S.waves.length || 200); },
      params: function () { return copy(params); },
      stats: function () { var st = copy(S.stats); st.enemies = S.n; st.projectiles = S.np; st.gems = S.ng; st.particles = S.fn; st.drawn = Pn.drawn || 0; st.stepMs = timing.last; st.stepAvgMs = timing.avg; st.cache = Pn.ncache; st.frame = S.frame; st.time = S.t; st.phase = inst.phase(); return st; },
      state: function () { var H = S.hero; return { phase: inst.phase(), t: Math.round(S.t), level: H.level, xp: H.xp, need: H.need, hp: H.hp, maxHp: H.maxHp, kills: H.kills, enemies: S.n, gems: S.ng, boss: S.boss >= 0 ? Math.round(S.bossHp) : null, weapons: H.weapons.map(function (w) { return w.id + ':' + w.lv; }).join(','), passives: Object.keys(H.passives).map(function (k) { return k + ':' + H.passives[k]; }).join(','), auto: !!S.auto }; },
      query: function (x, y, r, fn) { S.query(x, y, r, function (j, dx, dy, d2) { return fn('e' + S.euid[j], S.ex[j], S.ey[j], d2); }); },
      _sim: S, _painter: Pn
    };
    return inst;
  }

  root.GameDNA_HordeSurvival = { version: VERSION, create: create, WEAPONS: WEAPONS, UPGRADES: UPGRADES, ENEMIES: ENEMIES, WAVES: WAVES, DEFAULTS: DEFAULTS, needXp: needXp, _Sim: Sim, _cellHash: cellHash, CELL: CELL };
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
