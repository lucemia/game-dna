
  /* ---------- one fixed step ---------- */
  SP.step = function (dt) {
    var S = this, H = S.hero, i;
    if (S.paused) return;
    S.frame++;
    if (S.shakeA > 0) S.shakeA = Math.max(0, S.shakeA - dt * 0.012);
    S.stepFx(dt);
    if (S.modal) { S.modal.t += dt; S.botModal(dt); return; }
    if (S.hitStopMs > 0) { S.hitStopMs -= dt; return; }
    if (S.phase === 'won' || S.phase === 'lost') { S.endT += dt; S.stepEnemies(dt * (S.phase === 'lost' ? 0.35 : 1), true); S.buildHash(); S.stepGems(dt); S.camFollow(1); return; }
    if (S.phase !== 'play') return;
    var sec = dt / 1000;
    S.t += dt;
    if (S.bossSeen && S.t >= (num(S.P.duration, 200) + num(S.P.dawn, 90)) * 1000) { S.dawnWin = true; S.win(); return; }   // held until dawn: the boss crumbles
    /* hero */
    var inp = S.auto ? S.botMove(dt) : S.input, ix = num(inp.x, 0), iy = num(inp.y, 0), il = Math.sqrt(ix * ix + iy * iy);
    if (il > 1) { ix /= il; iy /= il; il = 1; }
    var spd = H.speed * (1 + H.mods.speed);
    H.vx = lerp(H.vx, ix * spd, 0.35); H.vy = lerp(H.vy, iy * spd, 0.35);
    if (Math.abs(H.vx) < 0.5) H.vx = 0; if (Math.abs(H.vy) < 0.5) H.vy = 0;
    H.x += H.vx * sec; H.y += H.vy * sec;
    H.moving = il > 0.15;
    if (H.moving) { H.dirx = ix / (il || 1); H.diry = iy / (il || 1); }
    if (H.vx > 4) H.face = 1; else if (H.vx < -4) H.face = -1;
    H.phase += Math.sqrt(H.vx * H.vx + H.vy * H.vy) * sec / 15; H.dist = (H.dist || 0) + Math.sqrt(H.vx * H.vx + H.vy * H.vy) * sec;
    if (H.iframes > 0) H.iframes -= dt; if (S.hurtT > 0) S.hurtT -= dt;
    if (H.mods.regen > 0 && H.hp < H.maxHp) { H.regenAcc += H.mods.regen * sec; if (H.regenAcc >= 1) { var hn = Math.floor(H.regenAcc); H.regenAcc -= hn; S.healHero(hn, 'regen'); } }
    S.camFollow(0.14);
    /* world */
    S.spawnTick(dt);
    S.buildHash();
    S.stepEnemies(dt, false);
    S.buildHash();
    S.stepWeapons(dt);
    S.stepProjectiles(dt);
    S.contact();
    S.stepGems(dt);
    S.stepPickups(dt);
    S.compact();
    if (S.boss >= 0) S.bossHp = Math.max(0, S.ehp[S.boss]);
  };
  SP.camFollow = function (k) { var S = this; S.cam.x = lerp(S.cam.x, S.hero.x, k); S.cam.y = lerp(S.cam.y, S.hero.y - 8, k); };

  SP.stepEnemies = function (dt, idle) {
    var S = this, H = S.hero, sec = dt / 1000, n = S.n, i, R = S.viewR(), far = R * 1.9, kd = Math.pow(0.0016, sec);
    for (i = 0; i < n; i++) {
      if (S.edead[i]) continue;
      var def = S.kindDefs[S.ek[i]], x = S.ex[i], y = S.ey[i], dx = H.x - x, dy = H.y - y, d = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / d, uy = dy / d;
      var sp = def.speed, tx = ux, ty = uy, steer = 0.12;
      if (idle) { tx = S.phase === 'won' ? -ux : Math.cos(S.eph[i]); ty = S.phase === 'won' ? -uy : Math.sin(S.eph[i] * 1.3); sp *= 0.4; }
      else if (def.move === 'drift') { var w = Math.sin(S.t / 380 + S.eph[i]) * 0.8; tx = ux - uy * w; ty = uy + ux * w; }
      else if (def.move === 'keep') {
        var rg = def.shoot ? def.shoot.range : 200;
        if (d < rg * 0.62) { tx = -ux; ty = -uy; sp *= 0.7; } else if (d < rg * 0.9) { var sd = (S.euid[i] & 1) ? 1 : -1; tx = -uy * sd; ty = ux * sd; sp *= 0.45; }
        if (def.shoot && d < rg) { S.eshot[i] -= dt; if (S.eshot[i] <= 0) { S.eshot[i] = def.shoot.cd; var sy = y - def.h * 0.55, ax = H.x - x, ay = (H.y - 14) - sy, al = Math.sqrt(ax * ax + ay * ay) || 1; S.shoot(2, x, sy, ax / al * def.shoot.speed, ay / al * def.shoot.speed, def.shoot.dmg, 0, 1, 2600, -1); } }
      } else if (def.move === 'swoop') {
        var st = S.eaux[i];
        if (st > 0) { S.eaux[i] -= dt; tx = S.eauxx[i]; ty = S.eauxy[i]; sp *= st > 700 ? 2.7 : 0.35; steer = 0.3; if (S.eaux[i] <= 0) S.eaux[i] = -900; }
        else if (st < 0) { S.eaux[i] = Math.min(0, st + dt); }
        else if (d < 130) { S.eaux[i] = 1300; S.eauxx[i] = ux; S.eauxy[i] = uy; }
      }
      if (def.boss && !idle) S.bossAct(i, def, dt, d, ux, uy);
      if (def.boss && S.slam && S.slam.t < S.slam.windup) sp = 0;
      S.evx[i] = lerp(S.evx[i], tx * sp, steer); S.evy[i] = lerp(S.evy[i], ty * sp, steer);
      if (S.evx[i] > 3) S.eface[i] = 1; else if (S.evx[i] < -3) S.eface[i] = -1;
      if (def.boss && !idle) S.eface[i] = dx >= 0 ? 1 : -1;   // the boss always faces the hero (its target)
      /* separation: soft push out of overlapping neighbours (hash built at the start of this pass) */
      var r1 = def.r, pxs = 0, pys = 0, cnt = 0;
      var air = !!(def.hover && !def.boss);   // fliers push fliers, walkers push walkers
      {
        S.query(x, y, r1 + 14, function (j, ex, ey, d2) {
          if (j === i) return false; var dj = S.kindDefs[S.ek[j]]; if (!!(dj.hover && !dj.boss) !== air) return false;
          var rr = r1 + dj.r; if (d2 >= rr * rr || d2 < 1e-6) return false;
          var dd = Math.sqrt(d2), o = (rr - dd) / rr, mr = (dj.mass || 1) / ((dj.mass || 1) + (def.mass || 1));
          pxs -= ex / dd * o * mr; pys -= ey / dd * o * mr; return ++cnt >= 14;
        });
      }
      var mf = 1;
      if (def.gait === 'hop') { var hk = S.t / 640 + (S.euid[i] % 97) / 97, hs = Math.sin(Math.PI * (hk - Math.floor(hk))); mf = 0.2 + 1.6 * hs * hs; }   // slimes move while airborne
      S.ex[i] = x + (S.evx[i] * mf + S.ekx[i]) * sec + pxs * r1 * 0.6; S.ey[i] = y + (S.evy[i] * mf + S.eky[i]) * sec + pys * r1 * 0.6;
      S.ekx[i] *= kd; S.eky[i] *= kd;
      var ph0 = Math.floor(S.eph[i]);
      S.eph[i] += Math.sqrt(S.evx[i] * S.evx[i] + S.evy[i] * S.evy[i]) * sec / (def.h * 0.55);
      if (def.gait === 'stomp' && !idle && Math.floor(S.eph[i]) !== ph0) {   // a heavy footfall: dust and a small shake
        S.shake(2.2); var fx = S.ex[i] + (Math.floor(S.eph[i]) % 2 ? 1 : -1) * def.h * 0.16;
        for (var dq = 0; dq < 6; dq++) S.particle(fx + (S.rngFx() - 0.5) * def.h * 0.3, S.ey[i] + 2, 2, (S.rngFx() - 0.5) * 70, (S.rngFx() - 0.5) * 24, 30, 520, 3.2, 7);
      }
      if (S.eflash[i] > 0) S.eflash[i] -= dt; if (S.eblade[i] > 0) S.eblade[i] -= dt;
      if (!idle && d > far && !def.boss && !def.elite) {   // left far behind: re-enter ahead of the hero (not a kill)
        var a = H.moving ? Math.atan2(H.diry, H.dirx) + (S.rng() - 0.5) * 1.4 : S.rng() * TAU, p = S.ringPos(a, 20);
        S.ex[i] = p.x; S.ey[i] = p.y; S.stats.recycled++;
      }
    }
  };
  SP.bossAct = function (i, def, dt, d, ux, uy) {
    var S = this, H = S.hero;
    if (def.slam) {
      if (S.slam) { S.slam.t += dt; if (S.slam.t >= S.slam.windup && !S.slam.done) { S.slam.done = true; S.shake(7, 20); S.ring(S.slam.x, S.slam.y, S.slam.r, '#ffb26a', 520, 'slam');
          var dx = H.x - S.slam.x, dy = H.y - S.slam.y; if (dx * dx + dy * dy < S.slam.r * S.slam.r) S.hurtHero(S.slam.dmg, 'slam');
          for (var k = 0; k < 18; k++) { var a = k / 18 * TAU; S.particle(S.slam.x + Math.cos(a) * S.slam.r * 0.8, S.slam.y + Math.sin(a) * S.slam.r * 0.5, 2, Math.cos(a) * 40, Math.sin(a) * 25, 60, 600, 3, 4); }
        }
        if (S.slam.t >= S.slam.windup + 450) S.slam = null; }
      else { S.eaux[i] -= dt; if (S.eaux[i] <= 0 && d < 280) { S.eaux[i] = def.slam.every; S.slam = { x: S.ex[i] + ux * 30, y: S.ey[i] + uy * 20, r: def.slam.r, dmg: def.slam.dmg, t: 0, windup: def.slam.windup, done: false }; S.event({ kind: 'slam', x: S.slam.x, y: S.slam.y }); } }
    }
    if (def.summon) { S.eauxx[i] -= dt; if (S.eauxx[i] <= 0) { S.eauxx[i] = def.summon.every; var b = S.rng() * TAU; for (var j = 0; j < def.summon.n; j++) { var p = S.ringPos(b + j * TAU / def.summon.n, 0); S.spawn(def.summon.id, p.x, p.y); } } }
  };

  SP.stepWeapons = function (dt) {
    var S = this, H = S.hero, ws = H.weapons, mt = 1 + H.mods.might, hs = Math.max(0.4, 1 - H.mods.haste), ar = 1 + H.mods.reach;
    for (var wi = 0; wi < ws.length; wi++) {
      var w = ws[wi], def = S.lib.weapons[w.id], L = S.wlv(w); if (!def || !L) continue;
      if (def.kind === 'orbit') {
        w.ang += L.spin * dt / 1000;
        var rr = L.r * ar, hitR = 11 * (L.size || 1) * ar;
        for (var b = 0; b < L.n; b++) {
          var a = w.ang + b * TAU / L.n, bx = H.x + Math.cos(a) * rr, by = H.y - 12 + Math.sin(a) * rr * 0.62;
          S.query(bx, by + 6, hitR + 30, function (j, ex, ey) {
            var dj = S.kindDefs[S.ek[j]], ddx = S.ex[j] - bx, ddy = (S.ey[j] - dj.h * 0.3) - by, rr2 = hitR + dj.r;
            if (ddx * ddx + ddy * ddy > rr2 * rr2 || S.eblade[j] > 0) return false;
            S.eblade[j] = L.hitCd; var kl = Math.sqrt(ddx * ddx + ddy * ddy) || 1; S.hitEnemy(j, L.dmg * mt, ddx / kl * 70, ddy / kl * 70, w.id); return false;
          });
        }
        continue;
      }
      w.t -= dt; if (w.t > 0) continue;
      var cd = L.cd * hs;
      if (def.kind === 'nearest') {
        var tg = S.nearest(L.n, 340);
        if (S.boss >= 0 && tg.length && tg.indexOf(S.boss) < 0) { var bdx = S.ex[S.boss] - H.x, bdy = S.ey[S.boss] - H.y; if (bdx * bdx + bdy * bdy < 340 * 340) tg[tg.length - 1 > 0 ? tg.length - 1 : 0] = S.boss; }
        if (!tg.length) { w.t = 0; continue; }
        w.t += cd;
        for (var k = 0; k < L.n; k++) {
          var e = tg[k % tg.length], ox = H.x, oy = H.y - 18, tx = S.ex[e] - ox, ty = S.ey[e] - S.kindDefs[S.ek[e]].h * (0.45 + (S.kindDefs[S.ek[e]].hover || 0)) - oy, tl = Math.sqrt(tx * tx + ty * ty) || 1;
          var spr = k >= tg.length ? (k - tg.length + 1) * 0.16 * (k % 2 ? 1 : -1) : 0, ca = Math.cos(spr), sa = Math.sin(spr), vx = (tx * ca - ty * sa) / tl, vy = (tx * sa + ty * ca) / tl;
          S.shoot(0, ox, oy, vx * L.speed, vy * L.speed, L.dmg * mt, L.pierce, (L.size || 1) * ar, 1500, wi);
        }
        S.event({ kind: 'fire', weapon: w.id });
      } else if (def.kind === 'pulse') {
        w.t += cd; var R = L.r * ar;
        S.ring(H.x, H.y, R, def.color, 460, 'pulse');
        S.query(H.x, H.y, R + 12, function (j, ex, ey, d2) { var dd = Math.sqrt(d2) || 1; S.hitEnemy(j, L.dmg * mt, ex / dd * L.knock, ey / dd * L.knock, w.id); return false; });
        S.event({ kind: 'fire', weapon: w.id });
      } else if (def.kind === 'lance') {
        w.t += cd; var base = Math.atan2(H.diry, H.dirx);
        for (k = 0; k < L.n; k++) {
          var off = (k - (L.n - 1) / 2) * 0.2, aa = base + off;
          S.shoot(1, H.x + Math.cos(aa) * 10, H.y - 16 + Math.sin(aa) * 6, Math.cos(aa) * L.speed, Math.sin(aa) * L.speed, L.dmg * mt, L.pierce, ar, 1100, wi);
        }
        S.event({ kind: 'fire', weapon: w.id });
      } else if (typeof def.fire === 'function') {
        w.t += cd; safe(def.fire, S.api(), w, L); S.event({ kind: 'fire', weapon: w.id });
      } else w.t += cd;
    }
  };
  /* up to n distinct nearest live enemies within maxD, nearest first (on-screen preferred by distance) */
  SP.nearest = function (n, maxD) {
    var S = this, H = S.hero, best = S._near || (S._near = []), bd = S._nearD || (S._nearD = []);
    best.length = 0; bd.length = 0;
    var rad = 90;
    while (rad <= maxD && best.length < n) {
      best.length = 0; bd.length = 0;
      S.query(H.x, H.y - 10, rad, function (j, ex, ey, d2) {
        if (best.length < n) { best.push(j); bd.push(d2); }
        else { var wk = 0; for (var q = 1; q < n; q++) if (bd[q] > bd[wk]) wk = q; if (d2 < bd[wk]) { best[wk] = j; bd[wk] = d2; } }
        return false;
      });
      if (best.length >= n) break; rad *= 1.9; if (rad > maxD && rad < maxD * 1.9) rad = maxD;
    }
    for (var a = 1; a < best.length; a++) for (var b2 = a; b2 > 0 && bd[b2] < bd[b2 - 1]; b2--) { var tb = bd[b2]; bd[b2] = bd[b2 - 1]; bd[b2 - 1] = tb; var tj = best[b2]; best[b2] = best[b2 - 1]; best[b2 - 1] = tj; }
    return best;
  };
  SP.stepProjectiles = function (dt) {
    var S = this, H = S.hero, sec = dt / 1000, i;
    for (i = 0; i < S.np; i++) {
      S.px[i] += S.pvx[i] * sec; S.py[i] += S.pvy[i] * sec; S.plife[i] -= dt; S.page[i] += dt;
      var kind = S.pkind[i];
      if (kind === 2) {   // enemy arrow
        var dx = H.x - S.px[i], dy = (H.y - 14) - S.py[i];
        if (dx * dx + dy * dy < (H.r + 5) * (H.r + 5) * 1.6) { if (S.hurtHero(S.pdmg[i], 'arrow')) S.plife[i] = 0; }
        continue;
      }
      var rad = (kind === 1 ? 9 : 6) * S.psize[i], pi = i;
      S.query(S.px[i], S.py[i] + 12, rad + 32, function (j) {
        if (S.plife[pi] <= 0) return true;
        var dj = S.kindDefs[S.ek[j]], cy = S.ey[j] - dj.h * (0.4 + (dj.hover || 0)), ddx = S.ex[j] - S.px[pi], ddy = cy - S.py[pi], rr = rad + dj.r + 2;
        if (ddx * ddx + ddy * ddy > rr * rr * 1.3) return false;
        var base = pi * 16, nh = S.pnh[pi], u = S.euid[j];
        for (var q = 0; q < Math.min(nh, 16); q++) if (S.phits[base + q] === u) return false;
        S.phits[base + (nh % 16)] = u; S.pnh[pi] = Math.min(127, nh + 1);
        var vl = Math.sqrt(S.pvx[pi] * S.pvx[pi] + S.pvy[pi] * S.pvy[pi]) || 1;
        S.hitEnemy(j, S.pdmg[pi], S.pvx[pi] / vl * (kind === 1 ? 50 : 34), S.pvy[pi] / vl * (kind === 1 ? 50 : 34), S.pw[pi] >= 0 && S.hero.weapons[S.pw[pi]] ? S.hero.weapons[S.pw[pi]].id : 'shot');
        for (var f = 0; f < 3; f++) S.particle(S.px[pi], S.py[pi] + 14, 14, (S.rngFx() - 0.5) * 90, (S.rngFx() - 0.5) * 60, 30, 220, 1.6, kind === 1 ? 5 : 1);
        if (--S.ppierce[pi] < 0) { S.plife[pi] = 0; return true; }
        return false;
      });
    }
    // compact
    var w = 0;
    for (i = 0; i < S.np; i++) if (S.plife[i] > 0) { if (w !== i) S.moveProj(i, w); w++; }
    S.np = w;
  };
  SP.moveProj = function (a, b) {
    var S = this;
    S.px[b] = S.px[a]; S.py[b] = S.py[a]; S.pvx[b] = S.pvx[a]; S.pvy[b] = S.pvy[a]; S.plife[b] = S.plife[a]; S.pdmg[b] = S.pdmg[a]; S.ppierce[b] = S.ppierce[a]; S.pkind[b] = S.pkind[a]; S.psize[b] = S.psize[a]; S.pw[b] = S.pw[a]; S.page[b] = S.page[a]; S.pnh[b] = S.pnh[a];
    for (var q = 0; q < 16; q++) S.phits[b * 16 + q] = S.phits[a * 16 + q];
  };
  SP.contact = function () {
    var S = this, H = S.hero; if (H.iframes > 0) return;
    var worst = 0, src = null;
    S.query(H.x, H.y, H.r + 34, function (j, ex, ey, d2) { var dj = S.kindDefs[S.ek[j]], rr = H.r + dj.r * 0.85; if (d2 < rr * rr && dj.dmg > worst) { worst = dj.dmg; src = S.kindIds[S.ek[j]]; } return false; });
    if (worst > 0) S.hurtHero(worst, src);
  };
  SP.stepGems = function (dt) {
    var S = this, H = S.hero, sec = dt / 1000, mr = S.magnetR(), mr2 = mr * mr, i, w = 0;
    for (i = 0; i < S.ng; i++) {
      var dx = H.x - S.gx[i], dy = (H.y - 8) - S.gy[i], d2 = dx * dx + dy * dy;
      S.gt[i] += dt;
      if (S.gs[i] === 0) {
        if (S.gt[i] < 300) { S.gx[i] += S.gvx[i] * sec; S.gy[i] += S.gvy[i] * sec; S.gvx[i] *= 0.9; S.gvy[i] *= 0.9; }
        if (d2 < mr2 && S.phase !== 'lost') { S.gs[i] = 1; S.gt[i] = 0; var dd0 = Math.sqrt(d2) || 1; S.gvx[i] = -dx / dd0 * 90; S.gvy[i] = -dy / dd0 * 90; }
      } else {
        var dd = Math.sqrt(d2) || 1, sp = Math.min(560, 140 + S.gt[i] * 0.9);
        S.gvx[i] = lerp(S.gvx[i], dx / dd * sp, 0.2); S.gvy[i] = lerp(S.gvy[i], dy / dd * sp, 0.2);
        S.gx[i] += S.gvx[i] * sec; S.gy[i] += S.gvy[i] * sec;
        if (dd < H.r + 6) { S.gainXp(S.gv[i]); continue; }
      }
      if (w !== i) { S.gx[w] = S.gx[i]; S.gy[w] = S.gy[i]; S.gv[w] = S.gv[i]; S.gs[w] = S.gs[i]; S.gt[w] = S.gt[i]; S.gvx[w] = S.gvx[i]; S.gvy[w] = S.gvy[i]; }
      w++;
    }
    S.ng = w;
  };
  SP.gainXp = function (v) {
    var S = this, H = S.hero; if (S.phase !== 'play') { S.stats.xpLost += v; return; }
    H.xp += v; S.stats.xpCollected += v;
    while (H.xp >= H.need) { H.xp -= H.need; H.level++; H.need = needXp(H.level); S.pending++; S.stats.levels++; S.event({ kind: 'level', level: H.level }); }
    if (S.pending > 0 && !S.modal) S.openModal();
  };
  SP.stepPickups = function (dt) {
    var S = this, H = S.hero;
    for (var i = S.pickups.length - 1; i >= 0; i--) {
      var p = S.pickups[i]; p.t += dt; var dx = H.x - p.x, dy = H.y - p.y;
      if (dx * dx + dy * dy < 22 * 22) { S.healHero(p.heal, 'potion'); S.pickups.splice(i, 1); S.event({ kind: 'pickup', what: p.kind }); for (var k = 0; k < 10; k++) S.particle(H.x, H.y, 20, (S.rngFx() - 0.5) * 80, (S.rngFx() - 0.5) * 50, 50, 500, 2, 6); }
    }
  };
  SP.compact = function () {
    var S = this, w = 0, i, n = S.n, A = [S.ex, S.ey, S.evx, S.evy, S.ekx, S.eky, S.ehp, S.emax, S.ek, S.eflash, S.eblade, S.eshot, S.eph, S.eface, S.eaux, S.eauxx, S.eauxy, S.euid, S.espawnT];
    for (i = 0; i < n; i++) {
      if (S.edead[i]) continue;
      if (w !== i) { for (var k = 0; k < A.length; k++) A[k][w] = A[k][i]; S.edead[w] = 0; if (S.boss === i) S.boss = w; }
      w++;
    }
    for (i = w; i < n; i++) S.edead[i] = 0;
    S.n = w;
  };
  SP.stepFx = function (dt) {
    var S = this, sec = dt / 1000, i;
    for (i = 0; i < S.fn; i++) {
      if (S.flife[i] <= 0) continue;
      S.flife[i] -= dt; S.fx[i] += S.fvx[i] * sec; S.fy[i] += S.fvy[i] * sec; S.fz[i] += S.fvz[i] * sec; S.fvz[i] -= 260 * sec;
      if (S.fz[i] < 0) { S.fz[i] = 0; S.fvz[i] *= -0.3; S.fvx[i] *= 0.7; S.fvy[i] *= 0.7; }
      S.fvx[i] *= 0.985; S.fvy[i] *= 0.985;
    }
    while (S.fn > 0 && S.flife[S.fn - 1] <= 0) S.fn--;
    for (i = 0; i < S.corpses.length; i++) { var c = S.corpses[i]; if (c.on) { c.t += dt; if (c.t > c.dur) c.on = false; } }
    for (i = 0; i < S.nums.length; i++) { var q = S.nums[i]; if (q.on) { q.t += dt; if (q.t > 700) q.on = false; } }
    for (i = 0; i < S.rings.length; i++) { var r = S.rings[i]; if (r.on) { r.t += dt; if (r.t > r.dur) r.on = false; } }
  };

  /* ---------- level-up: pick 1 of N (seeded) ---------- */
  SP.offers = function () {
    var S = this, H = S.hero, c = [], id, owned = {}, i, maxW = num(S.P.maxWeapons, 6);
    for (i = 0; i < H.weapons.length; i++) owned[H.weapons[i].id] = H.weapons[i];
    for (id in S.lib.weapons) {
      var d = S.lib.weapons[id], o = owned[id];
      if (o) { if (o.lv < d.levels.length) c.push({ type: 'weapon', id: id, level: o.lv + 1, isNew: false, w: (d.weight || 1) * 1.4 }); }
      else if (H.weapons.length < maxW) c.push({ type: 'weapon', id: id, level: 1, isNew: true, w: (d.weight || 1) * 1.25 });
    }
    for (id in S.lib.upgrades) { var u = S.lib.upgrades[id], lv = H.passives[id] || 0; if (lv < (u.max || 5)) c.push({ type: 'upgrade', id: id, level: lv + 1, isNew: lv === 0, w: u.weight || 1 }); }
    var n = clamp(num(S.P.choices, 3), 1, 4), out = [];
    while (out.length < n && c.length) {
      var tot = 0; for (i = 0; i < c.length; i++) tot += c[i].w;
      var r = S.rngUp() * tot; for (i = 0; i < c.length - 1; i++) { r -= c[i].w; if (r <= 0) break; }
      out.push(c.splice(i, 1)[0]);
    }
    if (out.length < n) out.push({ type: 'heal', id: 'ration', level: 1, isNew: false });
    out.forEach(function (o) { var d = o.type === 'weapon' ? S.lib.weapons[o.id] : o.type === 'upgrade' ? S.lib.upgrades[o.id] : null;
      o.name = d ? d.name : 'Trail Ration'; o.icon = d ? d.icon : 'ration'; o.text = d ? (o.type === 'weapon' && !o.isNew ? S.levelText(o.id, o.level) : d.text) : 'Heal 30 HP.'; o.color = d && d.color; o.max = d ? (d.levels ? d.levels.length : d.max || 5) : 1; delete o.w; });
    return out;
  };
  SP.levelText = function (id, lv) {
    var d = this.lib.weapons[id], a = d.levels[lv - 2] || {}, b = d.levels[lv - 1] || {}, t = [];
    if (b.n > (a.n || 0)) t.push('+' + (b.n - a.n) + (' ' + (d.unit || (d.kind === 'orbit' ? 'blade' : d.kind === 'lance' ? 'lance' : d.kind === 'nearest' ? 'bolt' : 'strike'))));
    if (b.dmg > a.dmg) t.push('+' + Math.round((b.dmg / a.dmg - 1) * 100) + '% damage');
    if (b.r > a.r) t.push('+' + Math.round((b.r / a.r - 1) * 100) + '% area');
    if (b.cd < a.cd) t.push(Math.round((1 - b.cd / a.cd) * 100) + '% faster');
    if (b.pierce > a.pierce) t.push('pierces +' + (b.pierce - a.pierce));
    return t.slice(0, 3).join(', ') + '.';
  };
  SP.openModal = function () {
    var S = this, ch = S.offers();
    S.modal = { choices: ch, sel: Math.min(1, ch.length - 1), t: 0, botT: 0 };
    S.stats.offers.push(ch.map(function (c) { return c.type + ':' + c.id; }));
    S.event({ kind: 'offer', choices: ch.map(function (c) { return { type: c.type, id: c.id, level: c.level }; }) });
  };
  SP.pick = function (k) {
    var S = this, M = S.modal; if (!M || M.t < 350) return false;
    var c = M.choices[k]; if (!c) return false;
    var H = S.hero;
    if (c.type === 'weapon') S.addWeapon(c.id);
    else if (c.type === 'upgrade') {
      var u = S.lib.upgrades[c.id]; H.passives[c.id] = (H.passives[c.id] || 0) + 1;
      if (typeof u.apply === 'function') safe(u.apply, H, H.passives[c.id], S.api());
      else if (u.stat === 'maxHp') { H.maxHp += u.per; S.healHero(u.per, 'upgrade'); }
      else if (u.stat && H.mods[u.stat] != null) H.mods[u.stat] += u.per;
    } else S.healHero(30, 'ration');
    S.stats.picks.push(c.type + ':' + c.id);
    S.event({ kind: 'pick', type: c.type, id: c.id, level: c.level });
    if (S.opt.onPick) safe(S.opt.onPick, { type: c.type, id: c.id, level: c.level });
    S.pending--; S.modal = null;
    if (S.pending > 0) S.openModal();
    return true;
  };
  SP.api = function () {
    var S = this;
    return S._api || (S._api = {
      get hero() { return S.hero; }, rng: function () { return S.rng(); }, time: function () { return S.t; },
      nearest: function (n, maxD) { return S.nearest(n || 1, maxD || 340).map(function (j) { return { index: j, id: 'e' + S.euid[j], x: S.ex[j], y: S.ey[j] }; }); },
      enemiesIn: function (x, y, r, fn) { S.query(x, y, r, function (j, dx, dy, d2) { return fn({ index: j, id: 'e' + S.euid[j], x: S.ex[j], y: S.ey[j], d: Math.sqrt(d2) }); }); },
      damage: function (e, n, kx, ky, src) { var j = typeof e === 'object' ? e.index : e; if (j >= 0 && j < S.n) S.hitEnemy(j, n * (1 + S.hero.mods.might), kx || 0, ky || 0, src || 'custom'); },
      shoot: function (o) { return S.shoot(o.kind === 'lance' ? 1 : 0, num(o.x, S.hero.x), num(o.y, S.hero.y - 16), num(o.vx, 0), num(o.vy, 0), num(o.dmg, 10) * (1 + S.hero.mods.might), num(o.pierce, 0), num(o.size, 1), num(o.life, 1500), -1); },
      ring: function (x, y, r, color, dur) { S.ring(x, y, r, color || '#ffffff', dur || 420, 'pulse'); },
      area: function () { return 1 + S.hero.mods.reach; }
    });
  };

  /* ---------- the bot: steering through the same input as a player ---------- */
  SP.botMove = function (dt) {
    /* 16 headings scored by a short look-ahead (where the hero and the nearby foes will be in 0.2 / 0.45 / 0.8 s), shots and
       the boss slam; gems, potions and a slow circling goal pull when it is safe; the last heading is preferred (no dithering) */
    var S = this, H = S.hero, b = S.bot || (S.bot = { a: S.rngBot() * TAU, dir: 0, near: new Int32Array(96), nd: new Float32Array(96) });
    var spd = H.speed * (1 + H.mods.speed), near = b.near, nn = 0;
    S.query(H.x, H.y, 230, function (j, ex, ey, d2) { if (nn < 96) { near[nn] = j; b.nd[nn] = d2; nn++; } else { var wk = 0; for (var q = 1; q < 96; q++) if (b.nd[q] > b.nd[wk]) wk = q; if (d2 < b.nd[wk]) { near[wk] = j; b.nd[wk] = d2; } } return false; });
    var gx = 0, gy = 0, best = 1e18, i;
    if (H.hp < H.maxHp * 0.65) for (i = 0; i < S.pickups.length; i++) { var q = S.pickups[i], qd = (q.x - H.x) * (q.x - H.x) + (q.y - H.y) * (q.y - H.y); if (qd < best && qd < 600 * 600) { best = qd; gx = q.x; gy = q.y; } }
    if (best === 1e18) for (i = 0; i < S.ng; i++) { if (S.gs[i]) continue; var gd = (S.gx[i] - H.x) * (S.gx[i] - H.x) + (S.gy[i] - H.y) * (S.gy[i] - H.y); if (gd < best && gd < 260 * 260) { best = gd; gx = S.gx[i]; gy = S.gy[i]; } }
    b.a += dt / 1000 * 0.35;
    var tx = best < 1e18 ? gx - H.x : Math.cos(b.a), ty = best < 1e18 ? gy - H.y : Math.sin(b.a) * 0.7, tl = Math.sqrt(tx * tx + ty * ty) || 1; tx /= tl; ty /= tl;
    if (S.boss >= 0) { var bx = H.x - S.ex[S.boss], by = H.y - S.ey[S.boss], bl = Math.sqrt(bx * bx + by * by) || 1; if (bl < 115) { tx = bx / bl; ty = by / bl; } else if (bl > 165) { tx = -bx / bl * 0.8 + tx * 0.2; ty = -by / bl * 0.8 + ty * 0.2; } else { tx = -by / bl; ty = bx / bl; } }
    var bestD = 0, bestS = -1e18, k, LA = [0.2, 0.45, 0.8], LW = [1.6, 1, 0.55];
    for (k = 0; k < 17; k++) {
      var ang = k * TAU / 16, dx = k === 16 ? 0 : Math.cos(ang), dy = k === 16 ? 0 : Math.sin(ang), pen = 0;
      for (var l = 0; l < 3; l++) {
        var tau = LA[l], px = H.x + dx * spd * tau, py = H.y + dy * spd * tau;
        for (var m = 0; m < nn; m++) {
          var j = near[m]; if (S.edead[j]) continue; var dj = S.kindDefs[S.ek[j]], ex = S.ex[j], ey = S.ey[j], ux = px - ex, uy = py - ey, ul = Math.sqrt(ux * ux + uy * uy) || 1;
          var mv = Math.min(ul, dj.speed * (dj.move === 'swoop' ? 1.6 : 1) * tau); ex += ux / ul * mv; ey += uy / ul * mv;
          var dd = Math.sqrt((px - ex) * (px - ex) + (py - ey) * (py - ey)) - H.r - dj.r, z = 34 - dd;
          if (z > 0) pen += LW[l] * z * z * (dj.dmg / 6) * (dj.boss ? 3 : 1);
        }
        for (var pi = 0; pi < S.np; pi++) if (S.pkind[pi] === 2) { var ax = S.px[pi] + S.pvx[pi] * tau - px, ay = S.py[pi] + S.pvy[pi] * tau - (py - 14), ad = Math.sqrt(ax * ax + ay * ay); if (ad < 26) pen += LW[l] * (26 - ad) * (26 - ad) * 1.5; }
        if (S.slam && !S.slam.done) { var sx = px - S.slam.x, sy = py - S.slam.y, sd = Math.sqrt(sx * sx + sy * sy); if (sd < S.slam.r + 16) pen += LW[l] * (S.slam.r + 16 - sd) * 60; }
      }
      var sc = -pen + (dx * tx + dy * ty) * 260 + (k === b.dir ? 120 : 0) - (k === 16 ? 200 : 0);
      if (sc > bestS) { bestS = sc; bestD = k; }
    }
    b.dir = bestD;
    if (bestD === 16) return { x: 0, y: 0 };
    return { x: Math.cos(bestD * TAU / 16), y: Math.sin(bestD * TAU / 16) };
  };
  SP.botScore = function (c) {
    var S = this, H = S.hero;
    if (c.type === 'heal') return H.hp < H.maxHp * 0.5 ? 6 : 0.5;
    if (c.type === 'weapon') return c.isNew ? (H.weapons.length < 4 ? 6 : 2) : 4.5 + c.level * 0.1;
    var pr = { might: 4.2, haste: 4.0, vigor: H.hp < H.maxHp * 0.6 ? 5 : 3.2, reach: 3.4, swift: 3.0, magnet: 2.6, renew: 2.8 };
    return pr[c.id] != null ? pr[c.id] : 3;
  };
  SP.botModal = function (dt) {
    var S = this, M = S.modal; if (!S.auto || !M) return;
    M.botT += dt; if (M.botT < 700) return;
    var best = 0, bs = -1; for (var i = 0; i < M.choices.length; i++) { var sc = S.botScore(M.choices[i]); if (sc > bs) { bs = sc; best = i; } }
    var since = M.botT - (M.botKeyT || 0);
    if (M.sel !== best) { if (since >= 130) { M.botKeyT = M.botT; S.modalKey(M.sel < best ? 'right' : 'left'); } }
    else if (since >= 260 && M.botT > 1000) S.modalKey('ok');
  };
  SP.modalKey = function (k) {
    var S = this, M = S.modal; if (!M) return false;
    var n = M.choices.length;
    if (k === 'left' || k === 'up') { M.sel = (M.sel + n - 1) % n; M.moveT = M.t; return true; }
    if (k === 'right' || k === 'down') { M.sel = (M.sel + 1) % n; M.moveT = M.t; return true; }
    if (k === 'ok') return S.pick(M.sel);
    return false;
  };
