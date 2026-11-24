/* GameDNA G-10 · Stamina & outpost rest (stamina-rest) · module v1.1.0 (plain script, no dependencies, one global)
 *
 *   const st = GameDNA_StaminaRest.create({
 *     clock: 'turn',                                  // 'turn' (phases / rounds) or 'realtime' (fixed-step action game)
 *     bounds: { x: 0, y: 0, w: 256, h: 192 },         // the screen in native (logical) px, or a function returning it
 *     units: () => [{ id, side, x, y, w, h, alive }], // drawn sprite box of every unit that has stamina (world px)
 *     sites: () => [{ id, x, y, r, kind, owner }],    // camps / outposts / shrines: circle (r) or rect (w, h), world px
 *     camera: () => ({ x, y }),                       // optional: world -> screen offset (default 0, 0)
 *     uiRects: () => [{ x, y, w, h }],                // HUD and windows, screen px: pips never cover them
 *     params: { max: 6, engage: 2, rule: 'noAttack', ... }
 *   });
 *   st.engage(id)        -> true (spent) | false (too tired: do not attack; end that action as a wait)
 *   st.march(id, n)      turn clock: once per committed move;  realtime: walking is measured from units() by itself
 *   st.turnStart(side)   turn clock: where that side's phase begins (rest at owned sites, regen, captures)
 *   st.update(stepMs)    every fixed step, every scene;  st.drawSites(ctx) under units;  st.draw(ctx) over units
 *
 * Squads spend stamina per march and per engagement; at 0 they are exhausted (cannot attack, or are slowed) until they
 * recover to `recoverAt`. Resting inside a site their side owns restores stamina per turn (turn clock) or per second
 * (realtime). Sites can be claimed by standing in them. Pips above each unit (crisp pixel strip on native pixel canvases,
 * glassy capsules on HD), refill pops, a rest animation (warm glow, rising embers, "+N"), an exhausted sweat drop and a
 * refused-attack shake. Every animation is a function of the clock given to update(): ?t=&freeze=1 is deterministic.
 * Never throws from any call; never reads input; never pauses the game.
 */
(function (root) {
  'use strict';
  var TURN = { max: 6, engage: 2, counter: 1, march: 1, regen: 1, rest: 3, regenDelay: 0, restStill: 0, recoverAt: 2, rule: 'noAttack', slow: 0.5,
    capture: 'on', captureMs: 900, restAt: 'owned', show: 'always', render: 'auto', size: 0, sites: 'on', tags: 'on', fillMs: 140 };
  var RT = { max: 6, engage: 0.75, counter: 0, march: 0.03, regen: 2.5, rest: 3, regenDelay: 300, restStill: 250, recoverAt: 2, rule: 'slow', slow: 0.75,
    capture: 'on', captureMs: 900, restAt: 'owned', show: 'used', render: 'auto', size: 0, sites: 'on', tags: 'on', fillMs: 0 };
  // pace: one clock-agnostic knob; each preset sets the per-clock costs, explicit params still win
  var PACE = {
    turn: { standard: {}, camp: { regen: 0.5, rest: 4 }, harsh: { engage: 2, march: 1.5, regen: 1, rest: 3, rule: 'both' }, forgiving: { engage: 1, march: 0.5, regen: 2, rest: 3 } },
    rt: { standard: {}, harsh: { engage: 1, regen: 1.2, rule: 'noAttack' }, forgiving: { engage: 0.5, regen: 3.5 }, camp: { engage: 1, regen: 0.6, slow: 0.85 } }
  };
  var RULES = { noAttack: 1, slow: 1, both: 1 };
  var SHOW = { always: 1, used: 1, low: 1, off: 1 };
  var TEAM = { a: { main: '#5aa8ff', light: '#bfe0ff', dark: '#1f4f9a' }, b: { main: '#ff5a4a', light: '#ffc0b0', dark: '#8a2018' }, n: { main: '#c9c2b0', light: '#f2ecdc', dark: '#5a5448' } };
  var GOLD = { full: '#ffd23f', hi: '#fff3a6', lo: '#ff9a3c', loHi: '#ffd0a0', empty: '#3a3026', ink: '#0d0a08', red: '#ff4a3a', redDark: '#7a1a14', drop: '#7fd0ff' };
  var FAMILY = '"Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  // 3x5 bitmap font: key char + 5 octal rows (3 bits)
  var F3S = "075557126227261247361216455711574616634757771222875757975716A25755B65656C34443D65556E74647F74644G34553H55755I72227J11152K55655L44447M57755N65555O25552P65644Q25563R65655S34216T72222U55557V55552W55775X55255Y55222Z71247!22202.00002-00700+02720/11244:02020";
  var F3 = {}; (function () { for (var i = 0; i + 5 < F3S.length + 1; i += 6) { var g = []; for (var r = 0; r < 5; r++) g.push(parseInt(F3S.charAt(i + 1 + r), 8) || 0); F3[F3S.charAt(i)] = g; } })();

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function easeOut(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u) * (1 - u); }
  function hash(a, b) { var h = Math.imul((a | 0) * 374761393 + (b | 0) * 668265263, 3266489917); h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function strHash(s) { s = String(s); var h = 7; for (var i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; }
  function hit(a, b, pad) { pad = pad || 0; return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad; }
  function rgba(h, a) { var s = String(h).replace('#', ''); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]; var n = parseInt(s.slice(0, 6), 16); if (!isFinite(n)) n = 0xffffff; return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function rect(r) {
    if (!r) return null;
    var x = +(r.x != null ? r.x : r[0]), y = +(r.y != null ? r.y : r[1]), w = +(r.w != null ? r.w : r.width != null ? r.width : r[2]), h = +(r.h != null ? r.h : r.height != null ? r.height : r[3]);
    return isFinite(x) && isFinite(y) && w > 0 && h > 0 ? { x: x, y: y, w: w, h: h } : null;
  }

  function create(opt) {
    opt = opt || {};
    var clock = /^(rt|real|realtime|real-time|time|action)$/i.test(String(opt.clock || '')) ? 'rt' : 'turn';
    var D = clock === 'rt' ? RT : TURN, P = {}, k0;
    for (k0 in D) P[k0] = D[k0];
    var SK = null; try { SK = root.GameDNA_Skin && opt.skin != null && opt.skin !== false ? root.GameDNA_Skin.resolve(opt.skin) : null; } catch (e) { SK = null; }
    var t = 0, U = {}, S = {}, order = [], drawn = [], warned = {}, lastView = null, layoutPass = 0;
    var stats = { marchPx: 0, updates: 0, draws: 0, engages: 0, blocked: 0, spent: 0, marches: 0, rests: 0, restGain: 0, regenGain: 0, exhausted: 0, recovered: 0, captures: 0, turnStarts: 0, errors: 0, maxExhaustedMs: 0 };
    var paceSet = null;
    setParams(opt.params);

    function setParams(o) {
      if (o && o.pace != null && o.pace !== paceSet) {   // a new pace resets the per-clock costs, then explicit keys below override
        var pr = PACE[clock][o.pace] || PACE[clock].standard; paceSet = String(o.pace);
        ['engage', 'march', 'regen', 'rest', 'rule', 'slow'].forEach(function (k) { P[k] = D[k]; }); for (var pk in pr) P[pk] = pr[pk];
      }
      if (o) for (var key in o) if (key in D && o[key] != null && o[key] !== '') P[key] = typeof D[key] === 'number' ? num(o[key], D[key]) : String(o[key]);
      if (!RULES[P.rule]) P.rule = 'noAttack'; if (!SHOW[P.show]) P.show = D.show;
      P.max = clamp(Math.round(P.max), 1, 12); P.recoverAt = clamp(P.recoverAt, 0, P.max); P.slow = clamp(P.slow, 0.1, 1);
      P.engage = Math.max(0, P.engage); P.counter = Math.max(0, P.counter); P.march = Math.max(0, P.march);
      if (clock === 'rt' && P.march > 0.5) { warn('march', 'realtime march is per tile walked; ' + P.march + ' looks like a per-move turn value, using 0.5'); P.march = 0.5; }
    }
    function warn(k, msg) { if (warned[k]) return; warned[k] = 1; if (root.console) console.warn('[GameDNA_StaminaRest] ' + msg); }
    function emit(info) { if (typeof opt.debug === 'function') try { opt.debug(info); } catch (e) {} }
    function call(name, a, b, c) { var f = opt[name]; if (typeof f !== 'function') return; try { f(a, b, c); } catch (e) { stats.errors++; warn('cb' + name, name + '() threw: ' + (e && e.message)); } }
    function B() {
      var b = opt.bounds || opt.view; if (typeof b === 'function') try { b = b(); } catch (e) { b = null; warn('bounds', 'bounds() threw'); }
      if (b && num(b.w, 0) > 0 && num(b.h, 0) > 0) return (lastView = { x: num(b.x, 0), y: num(b.y, 0), w: +b.w, h: +b.h });
      return lastView || { x: 0, y: 0, w: 640, h: 360 };
    }
    function CAM() {
      var c = opt.camera; if (typeof c === 'function') try { c = c(); } catch (e) { c = null; warn('camera', 'camera() threw'); }
      return c ? { x: num(c.x, 0), y: num(c.y, 0) } : { x: 0, y: 0 };
    }
    function crisp() {
      if (P.render === 'crisp') return true; if (P.render === 'smooth') return false;
      if (SK) return !!SK.pixel; return B().w <= 400;
    }
    function K() { var w = B().w; return P.size > 0 ? P.size : crisp() ? Math.max(1, Math.round(w / 256)) : w / 256; }   // 1 at 256 px, 2.5 at 640
    function teamOf(side) {
      if (typeof opt.team === 'function') try { var r = opt.team(side); if (r === 'a' || r === 'b' || r === 'n') return r; } catch (e) {}
      if (side == null || side === '' || side === 'neutral' || side === 'none') return 'n';
      return /^(a|blue|player|players|hero|ally|allies|party|good|p1|0|human)$/i.test(String(side)) ? 'a' : 'b';
    }
    function colors(team) {
      var c = TEAM[team] || TEAM.n;
      if (SK) try { var v = SK.token('team.' + team); if (typeof v === 'string' && v.charAt(0) === '#') return { main: v, light: c.light, dark: c.dark }; } catch (e) {}
      return c;
    }

    /* ---------- reading the game ---------- */
    function readUnits() {
      var f = opt.units, list = f, out = [];
      if (typeof f === 'function') try { list = f(); } catch (e) { list = null; stats.errors++; warn('units', 'units() threw: ' + (e && e.message)); }
      if (!list || !list.length) return out;
      for (var i = 0; i < list.length; i++) {
        var u = list[i]; if (!u || u.id == null) continue;
        var r = rect(u); if (!r) continue;
        if (u.alive === false || (u.hp != null && +u.hp <= 0)) continue;
        r.id = String(u.id); r.side = u.side != null ? String(u.side) : 'a';
        r.fx = u.foot ? num(u.foot.x, r.x + r.w / 2) : r.x + r.w / 2; r.fy = u.foot ? num(u.foot.y, r.y + r.h * 0.8) : r.y + r.h * 0.8;
        r.show = u.show !== false;
        out.push(r);
      }
      return out;
    }
    function readSites() {
      var f = opt.sites, list = f, out = [];
      if (typeof f === 'function') try { list = f(); } catch (e) { list = null; stats.errors++; warn('sites', 'sites() threw: ' + (e && e.message)); }
      if (!list || !list.length) return out;
      for (var i = 0; i < list.length; i++) {
        var s = list[i]; if (!s) continue;
        var id = String(s.id != null ? s.id : 'site' + i), x = num(s.x, NaN), y = num(s.y, NaN); if (!isFinite(x) || !isFinite(y)) continue;
        var o = { id: id, kind: /^(camp|fire|shrine|outpost)$/.test(s.kind) ? s.kind : 'camp', x: x, y: y };
        if (num(s.w, 0) > 0 && num(s.h, 0) > 0) { o.w = +s.w; o.h = +s.h; o.cx = x + o.w / 2; o.cy = y + o.h / 2; }
        else { o.r = Math.max(4, num(s.r, 24)); o.cx = x; o.cy = y; }
        var host = s.owner == null || s.owner === '' ? null : String(s.owner), st = S[id];
        if (!st) { st = S[id] = { owner: host, hostOwner: host, capT: 0, capSide: null, flareT: -1e9, restT: -1e9, claimT: -1e9, seen: t }; }
        else if (host !== st.hostOwner) { st.hostOwner = host; st.owner = host; }   // the game changed the owner itself
        o.st = st; out.push(o);
      }
      return out;
    }
    function inside(site, x, y) {
      if (site.r) { var dx = x - site.cx, dy = y - site.cy; return dx * dx + dy * dy <= site.r * site.r; }
      return x >= site.x && x < site.x + site.w && y >= site.y && y < site.y + site.h;
    }
    function siteAt(u, sites) { for (var i = 0; i < sites.length; i++) if (inside(sites[i], u.fx, u.fy)) return sites[i]; return null; }
    function canRestAt(site, side) { if (!site) return false; return P.restAt === 'any' || site.st.owner === side; }
    function rec(id, side) {
      id = String(id); var r = U[id];
      if (!r) {
        r = U[id] = { id: id, side: side || 'a', v: P.max, shown: P.max, ex: false, exT: -1e9, recT: -1e9, lastSpend: -1e9, lastChange: -1e9, pops: [], drains: [],
          blockT: -1e9, rest: null, restingRT: false, stillMs: 0, px: null, py: null, place: 'above', seed: strHash(id), tag: null, live: true, siteId: null, exMs: 0 };
        order.push(id);
      }
      if (side) r.side = side;
      return r;
    }

    /* ---------- stamina changes ---------- */
    function spend(r, n, why) {
      if (!(n > 0)) return;
      var before = r.v; r.v = Math.max(0, r.v - n); if (r.v < 1e-4) r.v = 0;
      stats.spent += before - r.v; r.lastChange = t;
      for (var k = Math.ceil(before) - 1; k >= Math.ceil(r.v - 1e-9) && k >= 0; k--) if (k < before && k >= r.v - 1e-9 && r.drains.length < 12) r.drains.push({ k: k, t: t });
      if (r.shown > r.v) r.shown = r.v;
      if (r.v <= 0 && !r.ex) { r.ex = true; r.exT = t; stats.exhausted++; r.tag = { text: 'TIRED', t: t, bad: true }; emit({ event: 'exhausted', id: r.id, why: why }); call('onExhausted', r.id, r.side); }
      emit({ event: 'spend', id: r.id, n: n, why: why, v: r.v });
    }
    function gain(r, n, why) {
      if (!(n > 0)) return 0;
      var before = r.v; r.v = Math.min(P.max, r.v + n); var g = r.v - before;
      if (g > 0) r.lastChange = t;
      if (r.ex && r.v >= P.recoverAt - 1e-9 && r.v > 0) { r.ex = false; r.recT = t; stats.recovered++; emit({ event: 'recovered', id: r.id }); call('onRecovered', r.id, r.side); }
      return g;
    }
    function claim(site, side, why) {
      var st = site.st; if (st.owner === side) return;
      st.owner = side; st.claimT = t; st.flareT = t; st.capT = 0; stats.captures++;
      emit({ event: 'capture', site: site.id, side: side, why: why }); call('onCapture', site.id, side, site.kind);
    }

    /* ---------- the clock ---------- */
    function update(dt) {
      try { step(num(dt, 0)); } catch (e) { stats.errors++; warn('update', 'update() failed: ' + (e && e.message)); }
    }
    function step(dt) {
      dt = clamp(dt, 0, 250); t += dt; stats.updates++;
      var units = readUnits(), sites = readSites(), i, u, r, site, id;
      for (id in U) U[id].live = false;
      for (i = 0; i < units.length; i++) {
        u = units[i]; r = rec(u.id, u.side); r.live = true; site = siteAt(u, sites); r.siteId = site ? site.id : null;
        if (clock === 'rt') {
          var moved = 0, tile = Math.max(1, num(opt.tile, 16 * K()));
          if (r.px != null) { var dx = u.fx - r.px, dy = u.fy - r.py; moved = Math.sqrt(dx * dx + dy * dy); if (moved > tile * 3) moved = 0; }   // a teleport or respawn is not a march
          r.px = u.fx; r.py = u.fy;
          if (moved > 0.05 * K()) r.stillMs = 0; else r.stillMs += dt;
          if (moved > 0 && P.march > 0) { stats.marchPx += moved; spend(r, P.march * moved / tile, 'march'); }
          var wasResting = r.restingRT;
          r.restingRT = !!(canRestAt(site, r.side) && r.stillMs >= P.restStill);
          if (wasResting && !r.restingRT) endRest(r);
          if (r.restingRT) {
            if (!r.rest || !r.rest.rt || r.rest.end < t) { r.rest = { t0: t, end: t + 600, gain: 0, site: site ? site.id : null, rt: true, tagged: false }; stats.rests++; emit({ event: 'rest', id: r.id, site: r.rest.site }); call('onRest', r.id, 0, r.rest.site); }
            var g = gain(r, P.rest * dt / 1000, 'rest'); stats.restGain += g; r.rest.gain += g; r.rest.end = t + 400; if (g > 0 && site) site.st.restT = t;
            if (r.v >= P.max - 1e-6) endRest(r);   // full: REST +N once per session
          }
          else if (t - r.lastSpend >= P.regenDelay) stats.regenGain += gain(r, P.regen * dt / 1000, 'regen');
        }
        if (r.ex) { r.exMs += dt; if (r.exMs > stats.maxExhaustedMs) stats.maxExhaustedMs = r.exMs; } else r.exMs = 0;
        // the shown value follows the real one: refills tick up pip by pip (turn clock), drains are instant
        if (r.shown > r.v) r.shown = r.v;
        else if (r.shown < r.v) {
          var startAt = r.rest && !r.rest.rt ? r.rest.t0 : -1e9;
          if (t >= startAt) {
            var rate = P.fillMs > 0 ? dt / P.fillMs : r.v - r.shown, nv = Math.min(r.v, r.shown + rate);
            for (var k = Math.floor(r.shown + 1e-9); k < Math.floor(nv + 1e-9); k++) if (r.pops.length < 12) r.pops.push({ k: k, t: t });
            r.shown = nv;
          }
        }
        r.pops = r.pops.filter(function (p) { return t - p.t < 420; });
        r.drains = r.drains.filter(function (p) { return t - p.t < 420; });
      }
      // captures (realtime: hold the site alone for captureMs)
      if (clock === 'rt' && P.capture === 'on') for (i = 0; i < sites.length; i++) {
        site = sites[i]; var sides = {}, n = 0, only = null;
        for (var j = 0; j < units.length; j++) if (inside(site, units[j].fx, units[j].fy)) { if (!sides[units[j].side]) { sides[units[j].side] = 1; n++; only = units[j].side; } }
        if (n === 1 && only !== site.st.owner) { if (site.st.capSide !== only) { site.st.capSide = only; site.st.capT = 0; } site.st.capT += dt; if (site.st.capT >= P.captureMs) claim(site, only, 'hold'); }
        else { site.st.capT = Math.max(0, site.st.capT - dt * 2); if (!site.st.capT) site.st.capSide = null; }
      }
      layout(units);
    }

    function endRest(r) {   // realtime: a rest session ends (left the site, moved, or full): REST +N and onRest(id, total, site)
      if (!r.rest || !r.rest.rt || r.rest.tagged) return;
      r.rest.tagged = true;
      if (r.rest.gain < 0.5) return;
      r.tag = { text: 'REST +' + Math.round(r.rest.gain), t: t, good: true };
      emit({ event: 'restEnd', id: r.id, gain: r.rest.gain, site: r.rest.site }); call('onRest', r.id, r.rest.gain, r.rest.site);
    }
    function turnStart(side) {
      try {
        side = side == null ? null : String(side); stats.turnStarts++;
        var units = readUnits(), sites = readSites(), stagger = 0, i, u, r, site;
        if (P.capture === 'on') for (i = 0; i < sites.length; i++) {
          site = sites[i]; var mine = 0, other = 0;
          for (var j = 0; j < units.length; j++) if (inside(site, units[j].fx, units[j].fy)) { if (units[j].side === side) mine++; else other++; }
          if (mine && !other && site.st.owner !== side) claim(site, side, 'turn');
        }
        for (i = 0; i < units.length; i++) {
          u = units[i]; if (side != null && u.side !== side) continue;
          r = rec(u.id, u.side); site = siteAt(u, sites);
          var resting = canRestAt(site, u.side), wasEx = r.ex;
          var g = gain(r, P.regen + (resting ? P.rest : 0), resting ? 'rest' : 'regen');
          if (resting && g > 0) { stats.rests++; stats.restGain += g; site.st.restT = t + stagger; site.st.flareT = Math.max(site.st.flareT, t + stagger - 200); }
          else stats.regenGain += g;
          if (g > 0) {
            r.rest = { t0: t + stagger, end: t + stagger + Math.max(900, P.fillMs * Math.ceil(g) + 700), gain: g, site: resting ? site.id : null, rt: false, recovered: wasEx && !r.ex };
            if (resting || (wasEx && !r.ex)) r.tag = { text: (wasEx && !r.ex ? 'READY ' : resting ? 'REST ' : '') + '+' + fmt(g), t: t + stagger, good: true };
            stagger += resting ? 160 : 60;
            if (resting && g > 0) { emit({ event: 'rest', id: r.id, gain: g, site: site.id }); call('onRest', r.id, g, site.id); }
          }
        }
        emit({ event: 'turnStart', side: side });
      } catch (e) { stats.errors++; warn('turn', 'turnStart() failed: ' + (e && e.message)); }
    }
    function fmt(g) { return Math.abs(g - Math.round(g)) < 0.05 ? String(Math.round(g)) : g.toFixed(1); }

    /* ---------- pip layout (in update, so frozen frames equal played ones) ---------- */
    function plateSize(n) {
      var k = K();
      if (crisp()) { var seg = (n <= 4 ? 2 : 1) * k, gap = k; return { w: n * seg + (n - 1) * gap + 2 * k, h: 4 * k, seg: seg, gap: gap, pad: k, segH: 2 * k }; }
      var pw = 2.5 * k, pg = 0.7 * k, pad = 1.5 * k, ph = 2.0 * k;
      return { w: n * pw + (n - 1) * pg + pad * 2, h: ph + pad * 2, seg: pw, gap: pg, pad: pad, segH: ph };
    }
    function layout(units) {
      layoutPass++;
      var bv = B(), cam = CAM(), ui = uiList(), placed = [], n = Math.ceil(P.max), ps = plateSize(n), gap = crisp() ? K() : 1.2 * K();
      var scr = units.map(function (u) { return { id: u.id, x: u.x - cam.x, y: u.y - cam.y, w: u.w, h: u.h }; });
      var others = obstacleList().map(function (o) { return { id: null, x: o.x - cam.x, y: o.y - cam.y, w: o.w, h: o.h }; });
      for (var i = 0; i < scr.length; i++) {
        var s = scr[i], r = U[s.id]; if (!r) continue;
        if (offView(s, bv)) { r.place = 'off'; continue; }   // a unit outside the screen gets no strip (no floating strips at the edge)
        var cx = Math.round(s.x + s.w / 2 - ps.w / 2);
        var vy = clamp(Math.round(s.y + (crisp() ? 0 : gap)), bv.y, bv.y + bv.h - ps.w);
        cx = clamp(cx, bv.x + 1, bv.x + bv.w - ps.w - 1);
        var cand = {
          above: { x: cx, y: Math.round(s.y - gap - ps.h), w: ps.w, h: ps.h },
          below: { x: cx, y: Math.round(s.y + s.h + gap), w: ps.w, h: ps.h },
          inside: { x: cx, y: Math.round(s.y + (crisp() ? 0 : gap)), w: ps.w, h: ps.h },
          right: { x: Math.round(s.x + s.w + gap), y: vy, w: ps.h, h: ps.w },          // compact upright badge beside the unit
          left: { x: Math.round(s.x - gap - ps.h), y: vy, w: ps.h, h: ps.w }
        };
        var uiOk = function (c) {
          if (c.y < bv.y || c.y + c.h > bv.y + bv.h || c.x < bv.x || c.x + c.w > bv.x + bv.w) return false;
          for (var j = 0; j < ui.length; j++) if (hit(c, ui[j])) return false;
          return true;
        };
        var ok = function (c) {
          if (!uiOk(c)) return false;
          var j, o;
          for (j = 0; j < scr.length; j++) if (scr[j].id !== s.id && hit(c, scr[j])) return false;
          for (j = 0; j < others.length; j++) { o = others[j]; if (hit(c, o) && !hit(o, s)) return false; }
          for (j = 0; j < placed.length; j++) if (hit(c, placed[j])) return false;
          return true;
        };
        // 1) a slot clear of UI, other units and other strips (keep the current one while it stays clear);
        // 2) a slot clear of UI only; 3) hidden while UI covers every slot (a window or banner over the unit)
        // above, below, then a compact upright badge right or left of the unit (never on faces while any of these is free)
        var order = ['above', 'below', 'right', 'left'], pick = null, q;
        if (cand[r.place] && r.place !== 'inside' && ok(cand[r.place])) pick = r.place;
        for (q = 0; !pick && q < order.length; q++) if (ok(cand[order[q]])) pick = order[q];
        if (!pick) {   // crowded: the UI-clear slot that covers the least of other units and strips (strips count double)
          var best = Infinity;
          for (q = 0; q < order.length; q++) {
            var c = cand[order[q]]; if (!uiOk(c)) continue;
            var cost = 0, j2;
            for (j2 = 0; j2 < scr.length; j2++) if (scr[j2].id !== s.id) cost += area(c, scr[j2]);
            for (j2 = 0; j2 < others.length; j2++) cost += area(c, others[j2]);
            for (j2 = 0; j2 < placed.length; j2++) cost += 2 * area(c, placed[j2]);
            if (cost < best) { best = cost; pick = order[q]; }
          }
        }
        if (!pick) pick = uiOk(cand.inside) ? 'inside' : 'hidden';
        r.place = pick; if (pick !== 'hidden') placed.push(cand[pick]);
      }
    }
    function area(a, b) { var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; }
    function offView(s, bv) { return s.x + s.w <= bv.x || s.x >= bv.x + bv.w || s.y + s.h <= bv.y || s.y >= bv.y + bv.h; }
    function obstacleList() {
      var f = opt.obstacles, list = f, out = [];
      if (typeof f === 'function') try { list = f(); } catch (e) { list = null; warn('obs', 'obstacles() threw: ' + (e && e.message)); }
      if (list && list.length) for (var i = 0; i < list.length && out.length < 200; i++) { var r = rect(list[i]); if (r) out.push(r); }
      return out;
    }
    function uiList() {
      var f = opt.uiRects || opt.getObstacles, list = f, out = [];
      if (typeof f === 'function') try { list = f(); } catch (e) { list = null; warn('ui', 'uiRects() threw: ' + (e && e.message)); }
      if (list && list.length) for (var i = 0; i < list.length; i++) { var r = rect(list[i]); if (r && list[i].id == null) out.push(r); }
      return out;
    }

    /* ---------- public actions ---------- */
    function exhaustedBlocks(r) { return r.ex && (P.rule === 'noAttack' || P.rule === 'both'); }
    function engage(id, kind) {
      try {
        if (id == null) return true;
        var r = rec(id);
        if (exhaustedBlocks(r)) {
          stats.blocked++; if (t - r.blockT > 450) { r.blockT = t; r.tag = { text: 'TOO TIRED', t: t, bad: true }; }
          emit({ event: 'blocked', id: r.id }); call('onRefused', r.id, r.side); return false;
        }
        stats.engages++; r.lastSpend = t;
        spend(r, kind === 'counter' ? P.counter : kind != null && isFinite(+kind) ? +kind : P.engage, kind === 'counter' ? 'counter' : 'engage');
        return true;
      } catch (e) { stats.errors++; return true; }
    }
    function march(id, n) {
      try { if (id == null) return; var r = rec(id); stats.marches++; spend(r, P.march * (n == null ? 1 : Math.max(0, num(n, 1))), 'march'); } catch (e) { stats.errors++; }
    }
    function canAttack(id) { var r = id == null ? null : U[String(id)]; return !(r && exhaustedBlocks(r)); }
    function slowed(id) { var r = id == null ? null : U[String(id)]; return !!(r && r.ex && (P.rule === 'slow' || P.rule === 'both')); }
    function speedScale(id) { return slowed(id) ? P.slow : 1; }
    function moveRange(id, base) { base = num(base, 0); return slowed(id) ? Math.max(1, Math.floor(base * P.slow)) : base; }
    function stamina(id) {
      var r = id == null ? null : U[String(id)];
      if (!r) return { value: P.max, max: P.max, exhausted: false, resting: false, shown: P.max };
      return { value: Math.round(r.v * 100) / 100, max: P.max, exhausted: r.ex, resting: !!(r.restingRT || (r.rest && r.rest.site && t < r.rest.end)), shown: r.shown, site: r.siteId };
    }
    function nearestSite(id) {
      var r = id == null ? null : U[String(id)]; if (!r) return null;
      var units = readUnits(), sites = readSites(), me = null, best = null, bd = Infinity;
      for (var i = 0; i < units.length; i++) if (units[i].id === r.id) me = units[i];
      if (!me) return null;
      for (i = 0; i < sites.length; i++) {
        var s = sites[i]; if (!canRestAt(s, r.side) && !(P.capture === 'on' && s.st.owner == null)) continue;
        var d = Math.hypot(s.cx - me.fx, s.cy - me.fy); if (d < bd) { bd = d; best = s; }
      }
      return best ? { id: best.id, x: best.cx, y: best.cy, owner: best.st.owner, kind: best.kind, dist: bd } : null;
    }
    function owner(siteId) { var s = S[String(siteId)]; return s ? s.owner : null; }
    function claimSite(siteId, side) { var list = readSites(); for (var i = 0; i < list.length; i++) if (list[i].id === String(siteId)) claim(list[i], side == null ? null : String(side), 'game'); }
    function setStamina(id, v) { var r = rec(id); var d = num(v, r.v) - r.v; if (d > 0) gain(r, d, 'set'); else if (d < 0) spend(r, -d, 'set'); r.shown = r.v; }
    function reset() { U = {}; S = {}; order = []; drawn = []; emit({ event: 'reset' }); }
    function serialize() {
      var o = { v: 1, units: {}, sites: {} }, id;
      for (id in U) o.units[id] = { v: Math.round(U[id].v * 1000) / 1000, ex: U[id].ex };
      for (id in S) o.sites[id] = S[id].owner;
      return o;
    }
    function restore(o) {
      try {
        if (typeof o === 'string') o = JSON.parse(o); if (!o) return false;
        U = {}; order = [];
        for (var id in o.units || {}) { var r = rec(id); r.v = clamp(num(o.units[id].v, P.max), 0, P.max); r.shown = r.v; r.ex = !!o.units[id].ex; }
        for (id in o.sites || {}) { if (!S[id]) S[id] = { owner: null, hostOwner: undefined, capT: 0, capSide: null, flareT: -1e9, restT: -1e9, claimT: -1e9, seen: t }; S[id].owner = o.sites[id]; }
        return true;
      } catch (e) { warn('restore', 'restore() failed'); return false; }
    }

    /* ---------- drawing helpers ---------- */
    function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
    function textW(str, k) { return crisp() ? (str.length * 4 - 1) * k : measure(str, 4.2 * k); }
    var MC = {}, meas = null;
    function measure(str, size) {
      var key = str + '|' + size; if (MC[key] != null) return MC[key];
      if (!meas) { var c = document.createElement('canvas'); c.width = c.height = 4; meas = c.getContext('2d'); }
      meas.font = '800 ' + size + 'px ' + FAMILY; var w = meas.measureText(str).width; if (Object.keys(MC).length > 300) MC = {}; return (MC[key] = w);
    }
    function bitText(ctx, str, x, y, k, col, shadow) {
      var draw = function (ox, oy, c) {
        ctx.fillStyle = c; var cx = ox;
        for (var i = 0; i < str.length; i++) {
          var g = F3[str.charAt(i).toUpperCase()];
          if (g) for (var r = 0; r < 5; r++) for (var b = 0; b < 3; b++) if (g[r] & (4 >> b)) ctx.fillRect(Math.round(cx + b * k), Math.round(oy + r * k), k, k);
          cx += 4 * k;
        }
      };
      if (shadow) { draw(x - k, y, shadow); draw(x + k, y, shadow); draw(x, y - k, shadow); draw(x, y + k, shadow); }
      draw(x, y, col);
    }

    /* ---------- sites ---------- */
    function siteList() {
      var sites = readSites();
      return sites.map(function (s) { return { id: s.id, kind: s.kind, x: s.cx, y: s.cy, footY: s.cy + (s.r ? s.r * 0.15 : 0), owner: s.st.owner }; });
    }
    function drawSites(ctx, inWorld) {
      if (P.sites === 'off') return;
      try { var sites = readSites(); for (var i = 0; i < sites.length; i++) paintSite(ctx, sites[i], inWorld); } catch (e) { stats.errors++; warn('sites-draw', 'drawSites() failed: ' + (e && e.message)); }
    }
    function drawSite(ctx, id, inWorld) {
      if (P.sites === 'off') return;
      try { var sites = readSites(); for (var i = 0; i < sites.length; i++) if (sites[i].id === String(id)) paintSite(ctx, sites[i], inWorld); } catch (e) { stats.errors++; }
    }
    function paintSite(ctx, s, inWorld) {
      var cam = inWorld ? { x: 0, y: 0 } : CAM(), cx = s.cx - cam.x, cy = s.cy - cam.y, k = K(), st = s.st;
      var team = st.owner == null ? 'n' : teamOf(st.owner), col = colors(team), lit = st.owner != null;
      var ts = t / 1000, flare = clamp(1 - (t - st.flareT) / 900, 0, 1), restGlow = clamp(1 - (t - st.restT) / 1400, 0, 1);
      ctx.save();
      try {
        // zone outline
        if (crisp()) {
          var zc = lit ? col.main : '#c9c2b0';
          if (s.r) { var steps = Math.max(12, Math.round(s.r * 0.8)); for (var q = 0; q < steps; q++) { if ((q + Math.floor(ts * 4)) % 3 === 0) continue; var a = q / steps * Math.PI * 2; ctx.globalAlpha = 0.55; px(ctx, cx + Math.cos(a) * s.r - 0.5, cy + Math.sin(a) * s.r * 0.75 - 0.5, k, k, zc); } }
          else {
            var x0 = s.x - cam.x, y0 = s.y - cam.y, L = 3 * k; ctx.globalAlpha = 0.85;
            [[x0, y0, 1, 1], [x0 + s.w, y0, -1, 1], [x0, y0 + s.h, 1, -1], [x0 + s.w, y0 + s.h, -1, -1]].forEach(function (c) {
              px(ctx, c[2] > 0 ? c[0] : c[0] - L, c[3] > 0 ? c[1] : c[1] - k, L, k, zc); px(ctx, c[2] > 0 ? c[0] : c[0] - k, c[3] > 0 ? c[1] : c[1] - L, k, L, zc);
            });
            ctx.globalAlpha = 0.12 + 0.1 * restGlow; px(ctx, x0, y0, s.w, s.h, lit ? col.main : '#c9c2b0');
          }
          ctx.globalAlpha = 1;
        } else {
          ctx.save();
          if (lit || flare > 0) {
            var gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, (s.r || Math.max(s.w, s.h) * 0.7) * (1 + 0.25 * flare));
            gr.addColorStop(0, 'rgba(255,180,90,' + (0.28 + 0.25 * flare + 0.1 * restGlow) + ')'); gr.addColorStop(0.6, 'rgba(255,140,60,' + (0.08 + 0.1 * flare) + ')'); gr.addColorStop(1, 'rgba(255,120,40,0)');
            ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gr; ctx.beginPath();
            if (s.r) ctx.ellipse(cx, cy, s.r * 1.1, s.r * 0.8, 0, 0, Math.PI * 2); else ctx.rect(s.x - cam.x - 6 * k, s.y - cam.y - 6 * k, s.w + 12 * k, s.h + 12 * k);
            ctx.fill(); ctx.globalCompositeOperation = 'source-over';
          }
          ctx.setLineDash([3 * k, 2.5 * k]); ctx.lineDashOffset = -ts * 6 * k; ctx.lineWidth = Math.max(1, 0.6 * k);
          ctx.strokeStyle = rgba(lit ? col.light : '#e8e2d0', lit ? 0.55 : 0.35); ctx.beginPath();
          if (s.r) ctx.ellipse(cx, cy, s.r, s.r * 0.72, 0, 0, Math.PI * 2); else ctx.rect(s.x - cam.x + 0.5, s.y - cam.y + 0.5, s.w - 1, s.h - 1);
          ctx.stroke(); ctx.setLineDash([]);
          if (st.capT > 0 && st.capSide != null) {   // capture progress ring
            var pc = colors(teamOf(st.capSide)), pr = (s.r ? s.r * 0.72 : Math.min(s.w, s.h) * 0.5) + 2 * k;
            ctx.strokeStyle = rgba(pc.light, 0.9); ctx.lineWidth = 1.4 * k; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, pr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(st.capT / P.captureMs, 0, 1)); ctx.stroke();
          }
          ctx.restore();
        }
        // marker (HD markers are drawn a little larger than the pixel ones)
        var mk = crisp() ? k : k * 1.45;
        if (s.kind === 'shrine') shrine(ctx, cx, cy, mk, lit, col, flare, ts);
        else if (s.kind === 'outpost') banner(ctx, s.w ? s.x - cam.x + Math.max(3 * k, s.w * 0.18) : cx, s.h ? s.y - cam.y + s.h * 0.42 : cy, crisp() ? k : k * 1.3, lit, col, flare, ts, true);   // rect outposts: banner near the back-left corner, clear of the unit in the middle
        else { fire(ctx, cx, cy, mk, lit, flare, restGlow, ts, s.id); if (s.kind === 'camp') banner(ctx, cx + 7 * mk, cy + 1 * mk, mk, lit, col, flare, ts, false); }
      } finally { ctx.restore(); }
    }
    // capture moment, drawn over the units by draw(): a team-colour pillar and ring on the site, the label just above the marker (1.6 s)
    var CLAIM_MS = 1600;
    function drawClaims(ctx, inWorld) {
      if (P.sites === 'off') return;
      var sites = readSites(), cam = inWorld ? { x: 0, y: 0 } : CAM(), camS = CAM(), k = K(), bv = B();
      for (var i = 0; i < sites.length; i++) {
        var s = sites[i], st = s.st, since = t - st.claimT; if (!(since >= 0 && since < CLAIM_MS)) continue;
        var cx = s.cx - cam.x, cy = s.cy - cam.y, col = colors(st.owner == null ? 'n' : teamOf(st.owner)), mk = crisp() ? k : k * 1.45, u = since / CLAIM_MS;
        var fade = clamp(Math.min(since / 120, (CLAIM_MS - since) / 350), 0, 1), rr = (6 + 26 * easeOut(Math.min(1, since / 1100))) * k;
        ctx.save();
        if (crisp()) {
          var ph = Math.round(18 * k * (1 - u * 0.5)); ctx.globalAlpha = fade * 0.75; px(ctx, cx - k, cy - ph, 2 * k, ph, col.light); px(ctx, cx, cy - ph, k, ph, '#ffffff');
          ctx.globalAlpha = fade; for (var q = 0; q < 16; q++) { var a = q / 16 * Math.PI * 2; px(ctx, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7, k, k, col.light); }
        } else {
          ctx.globalCompositeOperation = 'lighter';
          var H = 26 * mk * (1 - 0.3 * u), g = ctx.createLinearGradient(0, cy - H, 0, cy);
          g.addColorStop(0, rgba(col.main, 0)); g.addColorStop(0.6, rgba(col.light, 0.45 * fade)); g.addColorStop(1, rgba('#ffffff', 0.7 * fade));
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy - H / 2, 3.2 * mk * (1 - 0.4 * u), H / 2, 0, 0, Math.PI * 2); ctx.fill();
          var gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr); gl.addColorStop(0, rgba(col.light, 0.35 * fade)); gl.addColorStop(1, rgba(col.main, 0));
          ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * 0.7, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1 - u; ctx.strokeStyle = col.light; ctx.lineWidth = 1.5 * k * (1 - u) + 0.5; ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
        if (P.tags === 'on') {
          var text = s.kind === 'outpost' ? 'OUTPOST TAKEN' : s.kind === 'shrine' ? 'SHRINE LIT' : 'CAMP CLAIMED';
          var top = s.r ? cy - Math.max(14 * mk, s.r * 0.72) : s.y - cam.y + s.h + 8 * k + 4 * k;   // just above a circle site's marker; under a rect site (units' tags go above)
          var ly = top - 2 * k - 4 * k * easeOut(Math.min(1, since / 300)), tw = textW(text, k), th = crisp() ? 5 * k : 4.2 * k, ui = uiList();
          var trc = { x: clamp(Math.round(cx - tw / 2), bv.x + 2, bv.x + bv.w - tw - 2) - (inWorld ? camS.x : 0), y: Math.round(ly - th) - (inWorld ? camS.y : 0), w: tw, h: th }, blocked = false;
          for (var j = 0; j < ui.length; j++) if (hit(trc, ui[j])) blocked = true;
          var lr = blocked ? null : label(ctx, text, cx, ly, fade, col.main === TEAM.n.main ? '#f2ecdc' : col.main, null);
          if (lr) drawn.push({ x: lr.x - (inWorld ? camS.x : 0), y: lr.y - (inWorld ? camS.y : 0), w: lr.w, h: lr.h, owner: null, kind: 'claim' });
        }
      }
    }
    function fire(ctx, x, y, k, lit, flare, glow, ts, id) {
      var seed = strHash(id);
      if (crisp()) {
        // stones and logs
        px(ctx, x - 4 * k, y + 1 * k, 8 * k, 2 * k, '#3a2a1c'); px(ctx, x - 3 * k, y + 1 * k, 2 * k, k, '#8a5a32'); px(ctx, x + 1 * k, y + 1 * k, 2 * k, k, '#7a4a28');
        [[-5, 2], [-3, 3], [0, 3], [3, 3], [5, 2]].forEach(function (p) { px(ctx, x + p[0] * k - k / 2, y + p[1] * k - k, k, k, '#8a8478'); });
        if (!lit) { px(ctx, x - k, y, 2 * k, k, '#5a4a40'); var sm = Math.floor(ts * 3) % 3; ctx.globalAlpha = 0.6; px(ctx, x + (sm - 1) * k, y - (3 + sm) * k, k, k, '#9a948a'); ctx.globalAlpha = 1; return; }
        var f = Math.floor(ts * 8 + (seed & 3)) % 3, h = 5 + (f === 1 ? 1 : 0) + Math.round(flare * 3);
        px(ctx, x - 2 * k, y - (h - 2) * k, 4 * k, (h - 1) * k, '#ff6a1e'); px(ctx, x - k, y - h * k, 2 * k, 2 * k, '#ff6a1e');
        px(ctx, x - k, y - (h - 3) * k, 2 * k, (h - 3) * k, '#ffc23a'); px(ctx, x - (f === 2 ? 0 : k), y - (h - 1) * k, k, k, '#ffc23a');
        px(ctx, x - (f === 0 ? k : 0), y - 2 * k, k, k, '#fff6c0');
        for (var e = 0; e < 2 + Math.round(flare * 2); e++) { var ph = (ts * 0.9 + hash(seed, e)) % 1; ctx.globalAlpha = 1 - ph; px(ctx, x + Math.round(Math.sin(ph * 6 + e) * 2) * k, y - (h + 1 + Math.round(ph * 8)) * k, k, k, e % 2 ? '#ffd23f' : '#ff8a3a'); }
        ctx.globalAlpha = 1; return;
      }
      ctx.save();
      // stones
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + 1.6 * k, 6.5 * k, 2.2 * k, 0, 0, Math.PI * 2); ctx.fill();
      for (var i = 0; i < 7; i++) {
        var a = Math.PI * (0.05 + i / 6 * 0.9), sx = x + Math.cos(a) * 5.4 * k, sy = y + Math.sin(a) * 1.6 * k + 0.6 * k;
        ctx.fillStyle = i % 2 ? '#7c7468' : '#958c7e'; ctx.beginPath(); ctx.ellipse(sx, sy, 1.3 * k, 0.95 * k, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(sx - 0.3 * k, sy - 0.35 * k, 0.6 * k, 0.35 * k, 0, 0, Math.PI * 2); ctx.fill();
      }
      // logs
      ctx.lineCap = 'round';
      [[-1, '#6a4126'], [1, '#7d4d2c']].forEach(function (L) {
        ctx.strokeStyle = '#2a170c'; ctx.lineWidth = 1.9 * k; ctx.beginPath(); ctx.moveTo(x - 3.6 * k * L[0], y + 0.9 * k); ctx.lineTo(x + 3.2 * k * L[0], y - 0.9 * k); ctx.stroke();
        ctx.strokeStyle = L[1]; ctx.lineWidth = 1.3 * k; ctx.beginPath(); ctx.moveTo(x - 3.6 * k * L[0], y + 0.9 * k); ctx.lineTo(x + 3.2 * k * L[0], y - 0.9 * k); ctx.stroke();
      });
      if (!lit) {
        ctx.fillStyle = '#4a4240'; ctx.beginPath(); ctx.ellipse(x, y - 0.2 * k, 2.4 * k, 0.9 * k, 0, 0, Math.PI * 2); ctx.fill();
        for (var w = 0; w < 3; w++) { var p = (ts * 0.35 + w / 3) % 1; ctx.fillStyle = 'rgba(190,185,175,' + (0.35 * (1 - p)) + ')'; ctx.beginPath(); ctx.arc(x + Math.sin(p * 5 + w) * 1.5 * k, y - (2 + p * 9) * k, (0.8 + p * 1.6) * k, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore(); return;
      }
      // light pool
      var R = (9 + 3 * flare + 2 * glow + Math.sin(ts * 9 + seed) * 0.5) * k, g = ctx.createRadialGradient(x, y - 2 * k, 0, x, y - 2 * k, R);
      g.addColorStop(0, 'rgba(255,200,110,0.55)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 2 * k, R, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
      // flames: three layers, flickering
      var H = (5.2 + 1.6 * flare + Math.sin(ts * 11 + seed) * 0.5 + Math.sin(ts * 17.3) * 0.3) * k;
      [[1, '#ff5a1a', 3], [0.7, '#ffae2e', 2.2], [0.42, '#fff2b0', 1.3]].forEach(function (L, j) {
        var hh = H * L[0], ww = L[2] * k, sw = Math.sin(ts * 7 + j * 1.7 + seed) * 0.7 * k;
        ctx.fillStyle = L[1]; ctx.beginPath(); ctx.moveTo(x - ww, y - 0.2 * k);
        ctx.bezierCurveTo(x - ww * 1.1, y - hh * 0.5, x - ww * 0.2 + sw, y - hh * 0.75, x + sw, y - hh);
        ctx.bezierCurveTo(x + ww * 0.3 + sw, y - hh * 0.7, x + ww * 1.1, y - hh * 0.5, x + ww, y - 0.2 * k); ctx.closePath(); ctx.fill();
      });
      // embers
      for (var e2 = 0; e2 < 4 + Math.round(flare * 4 + glow * 3); e2++) {
        var ph2 = (ts * (0.55 + hash(seed, e2 + 9) * 0.4) + hash(seed, e2)) % 1;
        ctx.globalAlpha = (1 - ph2) * 0.9; ctx.fillStyle = e2 % 2 ? '#ffd860' : '#ff8a3a';
        ctx.beginPath(); ctx.arc(x + Math.sin(ph2 * 7 + e2 * 2) * 2.2 * k, y - (3 + ph2 * 14) * k, 0.45 * k, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.restore();
    }
    function banner(ctx, x, y, k, lit, col, flare, ts, big) {
      var H = (big ? 13 : 10) * k, fw = (big ? 6 : 4.5) * k, fh = (big ? 4 : 3) * k, c = lit ? col.main : '#8a8478', cl = lit ? col.light : '#c9c2b0';
      if (crisp()) {
        var kk = Math.max(1, Math.round(k)); H = Math.round(H); fw = Math.round(fw); fh = Math.round(fh);
        px(ctx, x, y - H, kk, H + kk, '#4a3020'); px(ctx, x, y - H - kk, kk, kk, '#e0c060');
        var wv = Math.floor(ts * 4) % 2;
        px(ctx, x + kk, y - H, fw, fh, c); px(ctx, x + kk, y - H, fw, kk, cl); if (!wv) px(ctx, x + kk + fw, y - H + kk, kk, Math.max(kk, fh - kk), c);
        return;
      }
      ctx.save();
      ctx.strokeStyle = '#3a2618'; ctx.lineWidth = 0.9 * k; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - H); ctx.stroke();
      ctx.fillStyle = '#e8c868'; ctx.beginPath(); ctx.arc(x, y - H, 0.7 * k, 0, Math.PI * 2); ctx.fill();
      var top = y - H + 0.6 * k;
      ctx.beginPath(); ctx.moveTo(x, top);
      for (var i = 0; i <= 6; i++) { var u = i / 6; ctx.lineTo(x + fw * u, top + Math.sin(ts * 5 - u * 4) * 0.6 * k * u); }
      for (i = 6; i >= 0; i--) { var u2 = i / 6; ctx.lineTo(x + fw * u2 - (i === 6 ? 1.2 * k : 0), top + fh * (i === 6 ? 0.5 : 1) + Math.sin(ts * 5 - u2 * 4) * 0.6 * k * u2); }
      ctx.closePath();
      var g = ctx.createLinearGradient(x, top, x, top + fh); g.addColorStop(0, cl); g.addColorStop(0.35, c); g.addColorStop(1, lit ? col.dark : '#5a5448');
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.4 * k; ctx.stroke();
      if (flare > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = flare * 0.6; ctx.fillStyle = cl; ctx.fill(); }
      ctx.restore();
    }
    function shrine(ctx, x, y, k, lit, col, flare, ts) {
      if (crisp()) {
        px(ctx, x - 3 * k, y + k, 6 * k, k, '#2a2620'); px(ctx, x - 2 * k, y - 8 * k, 4 * k, 9 * k, '#6e6a72'); px(ctx, x - 2 * k, y - 8 * k, 4 * k, k, '#a6a2aa'); px(ctx, x - 2 * k, y - 8 * k, k, 9 * k, '#8a868e');
        var rc = lit ? (Math.floor(ts * 3) % 2 ? col.light : col.main) : '#4a4650';
        px(ctx, x - 0 * k, y - 6 * k, k, 4 * k, rc); px(ctx, x - k, y - 5 * k, 3 * k, k, rc);
        return;
      }
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + 0.8 * k, 5 * k, 1.6 * k, 0, 0, Math.PI * 2); ctx.fill();
      var g = ctx.createLinearGradient(x - 3 * k, 0, x + 3 * k, 0); g.addColorStop(0, '#9a96a0'); g.addColorStop(1, '#5e5a66');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 3 * k, y); ctx.lineTo(x - 2.4 * k, y - 10 * k); ctx.quadraticCurveTo(x, y - 12 * k, x + 2.4 * k, y - 10 * k); ctx.lineTo(x + 3 * k, y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(20,16,28,0.6)'; ctx.lineWidth = 0.5 * k; ctx.stroke();
      if (lit) {
        var pulse = 0.6 + 0.4 * Math.sin(ts * 3) + flare * 0.5;
        ctx.shadowColor = col.light; ctx.shadowBlur = 4 * k * pulse; ctx.strokeStyle = col.light; ctx.lineWidth = 0.8 * k; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y - 8 * k); ctx.lineTo(x, y - 3 * k); ctx.moveTo(x - 1.4 * k, y - 6.6 * k); ctx.lineTo(x + 1.4 * k, y - 5 * k); ctx.stroke();
      } else { ctx.strokeStyle = 'rgba(40,36,48,0.7)'; ctx.lineWidth = 0.7 * k; ctx.beginPath(); ctx.moveTo(x, y - 8 * k); ctx.lineTo(x, y - 3 * k); ctx.stroke(); }
      ctx.restore();
    }
    function label(ctx, str, x, y, alpha, col, bad) {
      if (alpha <= 0) return null;
      var k = K(), bv = B(), cam = { x: 0, y: 0 }, w = textW(str, k), h = crisp() ? 5 * k : 4.2 * k;
      var lx = clamp(Math.round(x - w / 2), bv.x + 2, bv.x + bv.w - w - 2), ly = clamp(Math.round(y - h), bv.y + 1, bv.y + bv.h - h - 1);
      ctx.save(); ctx.globalAlpha = clamp(alpha, 0, 1);
      if (crisp()) bitText(ctx, str, lx, ly, k, col, GOLD.ink);
      else {
        ctx.font = '800 ' + (4.2 * k) + 'px ' + FAMILY; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        ctx.lineJoin = 'round'; ctx.lineWidth = 1.1 * k; ctx.strokeStyle = 'rgba(12,8,6,0.85)'; ctx.strokeText(str, lx, ly);
        ctx.fillStyle = col; ctx.fillText(str, lx, ly);
      }
      ctx.restore();
      return { x: lx, y: ly, w: w, h: h };
    }

    /* ---------- pips, rest and exhaustion ---------- */
    function draw(ctx, inWorld) {
      drawn = [];
      if (!ctx) return;
      stats.draws++;
      try {
        if (P.show === 'off') return;
        var units = readUnits(), cam = inWorld ? { x: 0, y: 0 } : CAM(), n = Math.ceil(P.max), ps = plateSize(n), k = K(), gapY = crisp() ? K() : 1.2 * K();
        var ui = uiList(), camS = CAM(), onUI = function (rc) { var q = inWorld ? { x: rc.x - camS.x, y: rc.y - camS.y, w: rc.w, h: rc.h } : rc; for (var j = 0; j < ui.length; j++) if (hit(q, ui[j])) return true; return false; };
        ctx.save();
        for (var i = 0; i < units.length; i++) {
          var u = units[i], r = U[u.id]; if (!r || !u.show) continue;
          var sx = u.x - cam.x, sy = u.y - cam.y;
          if (offView({ x: u.x - camS.x, y: u.y - camS.y, w: u.w, h: u.h }, B()) || r.place === 'off') continue;
          // rest glow under the feet (turn: while the refill plays; realtime: while resting)
          var restA = 0;
          if (r.rest && t >= r.rest.t0 && t < r.rest.end && (r.rest.site || r.rest.rt)) restA = clamp(Math.min((t - r.rest.t0) / 200, (r.rest.end - t) / 300), 0, 1);
          if (restA > 0) restFx(ctx, u, sx, sy, r, restA, k);
          var alpha = r.place === 'hidden' ? 0 : plateAlpha(r);
          var vert = r.place === 'right' || r.place === 'left';
          if (alpha <= 0.01) { if (r.ex && r.place !== 'hidden') sweat(ctx, sx, sy, u, k, r, false); continue; }
          var shake = t - r.blockT < 360 ? Math.round(Math.sin((t - r.blockT) / 22) * 1.5 * k * (1 - (t - r.blockT) / 360)) : 0;
          var x, y, pw = vert ? ps.h : ps.w, ph = vert ? ps.w : ps.h;
          if (vert) {
            x = r.place === 'right' ? Math.round(sx + u.w + gapY) : Math.round(sx - gapY - ps.h);
            y = clamp(Math.round(sy + (crisp() ? 0 : gapY)), B().y, B().y + B().h - ps.w) + shake;
          } else {
            x = clamp(Math.round(sx + u.w / 2 - ps.w / 2), 1, B().x + B().w - ps.w - 1) + shake;
            y = r.place === 'below' ? Math.round(sy + u.h + gapY) : r.place === 'inside' ? Math.round(sy + (crisp() ? 0 : gapY)) : Math.round(sy - gapY - ps.h);
          }
          if (!crisp() && !inWorld) { x = Math.round(x * 2) / 2; }
          if (onUI({ x: x, y: y, w: pw, h: ph })) continue;   // a window or banner opened after this step's update(): skip this frame
          if (vert) { ctx.save(); ctx.translate(x, y + ps.w); ctx.rotate(-Math.PI / 2); plate(ctx, 0, 0, ps, r, alpha, k); ctx.restore(); }   // fills bottom to top
          else plate(ctx, x, y, ps, r, alpha, k);
          drawn.push({ x: x - (inWorld ? camS.x : 0), y: y - (inWorld ? camS.y : 0), w: pw, h: ph, owner: u.id, kind: 'pips' });
          if (r.ex) sweat(ctx, sx, sy, u, k, r, r.place === 'right');
          // tag (+N, TIRED, TOO TIRED)
          if (r.tag && P.tags === 'on' && t >= r.tag.t) {
            var age = t - r.tag.t, life = 1100;
            if (age < life) {
              var ta = clamp(Math.min(age / 120, (life - age) / 260), 0, 1), rise = easeOut(Math.min(1, age / 400)) * 4 * k;
              var ty = r.place === 'below' ? y + ps.h + 6 * k + (crisp() ? 0 : 1) - rise * 0.2 : vert ? sy - 1.5 * k - rise : y - 1.5 * k - rise;
              var tw0 = textW(r.tag.text, k), th0 = crisp() ? 5 * k : 4.2 * k, bvv = B();
              var tr = { x: clamp(Math.round(sx + u.w / 2 - tw0 / 2), bvv.x + 2, bvv.x + bvv.w - tw0 - 2), y: Math.round(ty - th0), w: tw0, h: th0 };
              var lr = onUI(tr) ? null : label(ctx, r.tag.text, sx + u.w / 2, ty, ta, r.tag.bad ? '#ff8a7a' : '#ffe9a0', r.tag.bad);
              if (lr) drawn.push({ x: lr.x - (inWorld ? camS.x : 0), y: lr.y - (inWorld ? camS.y : 0), w: lr.w, h: lr.h, owner: u.id, kind: 'tag' });
            }
          }
        }
        ctx.restore();
        drawClaims(ctx, inWorld);
      } catch (e) { stats.errors++; warn('draw', 'draw() failed: ' + (e && e.message)); try { ctx.restore(); } catch (e2) {} }
    }
    function plateAlpha(r) {
      if (P.show === 'always') return 1;
      var recent = Math.max(r.lastChange, r.blockT, r.ex ? t : -1e9, r.rest && r.rest.end > t ? t : -1e9);
      if (P.show === 'low' && r.v > P.max / 3 && !r.ex) return clamp(1 - (t - recent - 1500) / 400, 0, 1) * (r.shown < P.max ? 1 : 0);
      if (r.shown < P.max - 1e-6 || r.ex) return 1;
      return clamp(1 - (t - recent - 1400) / 400, 0, 1);
    }
    function plate(ctx, x, y, ps, r, alpha, k) {
      var n = Math.ceil(P.max), low = r.shown <= P.max / 3 + 1e-6, blink = r.ex && Math.floor(t / 260) % 2 === 0, now = t;
      ctx.save(); ctx.globalAlpha = alpha;
      if (crisp()) {
        px(ctx, x, y, ps.w, ps.h, r.ex ? (blink ? GOLD.red : GOLD.redDark) : GOLD.ink);
        for (var i = 0; i < n; i++) {
          var sx = x + ps.pad + i * (ps.seg + ps.gap), sy = y + ps.pad, fill = clamp(r.shown - i, 0, 1);
          px(ctx, sx, sy, ps.seg, ps.segH, r.ex ? '#3a1410' : GOLD.empty);
          if (fill > 0) {
            var fw = fill >= 1 ? ps.seg : Math.max(k, Math.floor(ps.seg * fill / k) * k);
            if (fill < 1 && ps.seg <= k) { if (fill < 0.5) continue; }
            px(ctx, sx, sy, fw, ps.segH, low ? GOLD.lo : GOLD.full);
            if (ps.segH > k) px(ctx, sx, sy, fw, k, low ? GOLD.loHi : GOLD.hi);
          }
          var pop = popAge(r.pops, i);
          if (pop >= 0 && pop < 220) px(ctx, sx, sy - (pop < 110 ? k : 0), ps.seg, ps.segH, '#ffffff');
          var dr = popAge(r.drains, i);
          if (dr >= 0 && dr < 200 && Math.floor(dr / 50) % 2 === 0) px(ctx, sx, sy, ps.seg, ps.segH, GOLD.red);
        }
        ctx.restore(); return;
      }
      // smooth: glass capsule plate
      var rad = ps.h / 2;
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 1.6 * k; ctx.shadowOffsetY = 0.4 * k;
      ctx.fillStyle = 'rgba(14,11,20,0.78)'; ctx.beginPath(); rr(ctx, x, y, ps.w, ps.h, rad); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = Math.max(1, 0.35 * k); ctx.strokeStyle = r.ex ? rgba(GOLD.red, blink ? 0.95 : 0.55) : 'rgba(255,255,255,0.16)'; ctx.stroke();
      for (var j = 0; j < n; j++) {
        var px0 = x + ps.pad + j * (ps.seg + ps.gap), py0 = y + ps.pad, f = clamp(r.shown - j, 0, 1), pr = Math.min(ps.seg, ps.segH) * 0.42;
        var popA = popAge(r.pops, j), sc = popA >= 0 && popA < 260 ? 1 + 0.45 * Math.sin(Math.PI * popA / 260) : 1;
        ctx.save(); ctx.translate(px0 + ps.seg / 2, py0 + ps.segH / 2); ctx.scale(sc, sc); ctx.translate(-ps.seg / 2, -ps.segH / 2);
        ctx.fillStyle = r.ex ? 'rgba(255,74,58,0.16)' : 'rgba(255,255,255,0.09)'; ctx.beginPath(); rr(ctx, 0, 0, ps.seg, ps.segH, pr); ctx.fill();
        if (f > 0) {
          ctx.save(); ctx.beginPath(); rr(ctx, 0, 0, ps.seg, ps.segH, pr); ctx.clip();
          var g = ctx.createLinearGradient(0, 0, 0, ps.segH);
          g.addColorStop(0, low ? '#ffd6a0' : '#fff4b8'); g.addColorStop(0.45, low ? GOLD.lo : GOLD.full); g.addColorStop(1, low ? '#d0581c' : '#e09a14');
          ctx.fillStyle = g; ctx.fillRect(0, 0, ps.seg * f, ps.segH);
          ctx.restore();
          if (r.restingRT || (r.rest && r.rest.site && now < r.rest.end && now >= r.rest.t0)) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * (0.25 + 0.2 * Math.sin(now / 160 + j)); ctx.fillStyle = '#ffcf60'; ctx.beginPath(); rr(ctx, -0.4 * k, -0.4 * k, ps.seg + 0.8 * k, ps.segH + 0.8 * k, pr); ctx.fill(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'source-over'; }
        }
        if (popA >= 0 && popA < 260) { ctx.globalAlpha = alpha * (1 - popA / 260); ctx.fillStyle = '#ffffff'; ctx.beginPath(); rr(ctx, 0, 0, ps.seg, ps.segH, pr); ctx.fill(); ctx.globalAlpha = alpha; }
        var dA = popAge(r.drains, j);
        if (dA >= 0 && dA < 320) { var u2 = dA / 320; ctx.globalAlpha = alpha * (1 - u2); ctx.fillStyle = GOLD.red; ctx.beginPath(); rr(ctx, 0, -u2 * 2 * k, ps.seg, ps.segH, pr); ctx.fill(); ctx.globalAlpha = alpha; }
        ctx.restore();
      }
      ctx.restore();
    }
    function popAge(list, i) { for (var q = list.length - 1; q >= 0; q--) if (list[q].k === i) return t - list[q].t; return -1; }
    function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function sweat(ctx, sx, sy, u, k, r, leftSide) {   // beside the head, on the side away from an upright badge
      var bob = Math.sin((t - r.exT) / 180) * (crisp() ? 0.6 : 0.8) * k, dx = leftSide ? sx + (crisp() ? 0 : 1.5 * k) : sx + u.w - (crisp() ? 3 * k : 4 * k), dy = sy + (crisp() ? 1 * k : 0.12 * u.h) + bob;
      var fade = clamp((t - r.exT) / 200, 0, 1);
      ctx.save(); ctx.globalAlpha = fade;
      if (crisp()) { px(ctx, dx + k, dy, k, k, GOLD.drop); px(ctx, dx, dy + k, 3 * k, 2 * k, GOLD.drop); px(ctx, dx, dy + k, k, k, '#ffffff'); px(ctx, dx + k, dy + 3 * k, k, k, '#3a7aa8'); }
      else {
        var s = 1.5 * k; ctx.fillStyle = GOLD.drop; ctx.strokeStyle = 'rgba(10,30,50,0.7)'; ctx.lineWidth = 0.4 * k;
        ctx.beginPath(); ctx.moveTo(dx, dy - s * 1.4); ctx.quadraticCurveTo(dx + s, dy, dx + s * 0.8, dy + s * 0.5); ctx.arc(dx, dy + s * 0.5, s * 0.8, 0, Math.PI); ctx.quadraticCurveTo(dx - s, dy, dx, dy - s * 1.4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(dx - s * 0.3, dy + s * 0.3, s * 0.22, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    function restFx(ctx, u, sx, sy, r, a, k) {
      var fx = u.fx - (u.x - sx), fy = u.fy - (u.y - sy), seed = r.seed, ts = t / 1000;
      ctx.save();
      if (crisp()) {
        ctx.globalAlpha = a * 0.5; var ww = Math.round(u.w * 0.7);
        px(ctx, fx - ww / 2, sy + u.h - 2 * k, ww, k, '#ffcf60');
        for (var e = 0; e < 4; e++) {
          var ph = (ts * 0.8 + hash(seed, e)) % 1; ctx.globalAlpha = a * (1 - ph);
          px(ctx, sx + 2 * k + Math.floor(hash(seed, e + 5) * (u.w - 4 * k)), sy + u.h - 3 * k - Math.round(ph * u.h * 0.9), k, k, e % 2 ? '#ffe070' : '#ffffff');
        }
      } else {
        ctx.globalCompositeOperation = 'lighter';
        var R = Math.max(u.w, u.h * 0.5) * 0.9, g = ctx.createRadialGradient(fx, fy, 0, fx, fy, R);
        g.addColorStop(0, 'rgba(255,200,110,' + (0.35 * a) + ')'); g.addColorStop(1, 'rgba(255,150,60,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(fx, fy, R, R * 0.45, 0, 0, Math.PI * 2); ctx.fill();
        // a slow ring sweeping up the body
        var ring = (ts * 0.9) % 1; ctx.strokeStyle = 'rgba(255,224,150,' + (0.5 * a * (1 - ring)) + ')'; ctx.lineWidth = 0.6 * k;
        ctx.beginPath(); ctx.ellipse(fx, fy - ring * u.h * 0.8, u.w * 0.55, u.w * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
        for (var e2 = 0; e2 < 6; e2++) {
          var ph2 = (ts * (0.5 + hash(seed, e2 + 3) * 0.4) + hash(seed, e2)) % 1;
          ctx.globalAlpha = a * (1 - ph2) * 0.95; ctx.fillStyle = e2 % 3 ? '#ffd860' : '#fff6d0';
          var ex = fx + (hash(seed, e2 + 11) - 0.5) * u.w * 1.1 + Math.sin(ph2 * 6 + e2) * 1.2 * k, ey = fy - ph2 * u.h * 1.15;
          ctx.beginPath(); ctx.moveTo(ex, ey - 0.9 * k); ctx.lineTo(ex + 0.35 * k, ey); ctx.lineTo(ex, ey + 0.9 * k); ctx.lineTo(ex - 0.35 * k, ey); ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    }

    return {
      update: update, draw: draw, drawSites: drawSites, drawSite: drawSite, siteList: siteList,
      engage: engage, march: march, turnStart: turnStart, canAttack: canAttack, speedScale: speedScale, moveRange: moveRange,
      stamina: stamina, nearestSite: nearestSite, owner: owner, claim: claimSite, set: setStamina,
      reset: reset, serialize: serialize, restore: restore,
      lastDrawn: function () { return drawn.slice(); },
      stats: function () { var o = {}; for (var key in stats) o[key] = stats[key]; o.clock = clock === 'rt' ? 'realtime' : 'turn'; o.units = order.length; o.exhaustedNow = order.filter(function (id) { return U[id].ex && U[id].live; }).length; return o; },
      setParams: function (p) { try { setParams(p); } catch (e) {} }, params: function () { var o = {}; for (var key in P) o[key] = P[key]; o.pace = paceSet || 'standard'; return o; },
      clock: function () { return clock === 'rt' ? 'realtime' : 'turn'; }, time: function () { return t; }
    };
  }

  root.GameDNA_StaminaRest = { create: create, version: '1.1.0', defaults: { turn: TURN, realtime: RT } };
})(typeof window !== 'undefined' ? window : this);
