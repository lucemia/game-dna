/* GameDNA A-03 · Combat forecast window · module v1 (plain script, no dependencies, one global)
 *
 *   const fc = GameDNA_CombatForecast.create({
 *     view: { x: 0, y: 0, w: 256, h: 192 },        // screen area the window stays inside (native px, above the HUD)
 *     skin: 'pixel16',                              // optional; works without skin-api.js (built-in pixel16 look)
 *     getObstacles: () => [{ x, y, w, h, id }],     // sprites (with id) and HUD rects (no id) to keep clear
 *     getCursor: () => ({ x, y, w, h }),            // optional: the map cursor, never covered
 *     forecast: (att, def) => ({ dmg, hit, crit, hits, adv, counter: { dmg, hit, crit, hits } | null }),   // optional; YOUR rules
 *     params: { open: 6, place: 'corner', ... }     // see DEFAULTS
 *   });
 *   fc.show(att, def, data?)    // att/def = {id, name, team: 'a'|'b'|'n', hp, max, rect: {x, y, w, h}, weapon?}; data or forecast()
 *   fc.hide();   fc.update(dtMs);   fc.draw(ctx);   fc.rect()   // the window rect, for your other UI to avoid
 *
 * The module never computes rules: every number comes from the host (data, or the host's forecast callback). It reads no input.
 */
(function (root) {
  'use strict';
  var DEFAULTS = { open: 6, slide: 80, place: 'corner', rows: 'auto', bars: 'on', blink: 320, sides: 'attacker', margin: 3 };
  var FRAME = 1000 / 60;

  /* ---------- built-in pixel16 look (used when skin-api.js is not loaded) ---------- */
  var GLYPH = {
    A: '01110,10001,10001,11111,10001,10001,10001', B: '11110,10001,10001,11110,10001,10001,11110', C: '01110,10001,10000,10000,10000,10001,01110',
    D: '11110,10001,10001,10001,10001,10001,11110', E: '11111,10000,10000,11110,10000,10000,11111', F: '11111,10000,10000,11110,10000,10000,10000',
    G: '01110,10001,10000,10111,10001,10001,01111', H: '10001,10001,10001,11111,10001,10001,10001', I: '01110,00100,00100,00100,00100,00100,01110',
    J: '00111,00010,00010,00010,00010,10010,01100', K: '10001,10010,10100,11000,10100,10010,10001', L: '10000,10000,10000,10000,10000,10000,11111',
    M: '10001,11011,10101,10101,10001,10001,10001', N: '10001,10001,11001,10101,10011,10001,10001', O: '01110,10001,10001,10001,10001,10001,01110',
    P: '11110,10001,10001,11110,10000,10000,10000', Q: '01110,10001,10001,10001,10101,10010,01101', R: '11110,10001,10001,11110,10100,10010,10001',
    S: '01111,10000,10000,01110,00001,00001,11110', T: '11111,00100,00100,00100,00100,00100,00100', U: '10001,10001,10001,10001,10001,10001,01110',
    V: '10001,10001,10001,10001,10001,01010,00100', W: '10001,10001,10001,10101,10101,10101,01010', X: '10001,10001,01010,00100,01010,10001,10001',
    Y: '10001,10001,01010,00100,00100,00100,00100', Z: '11111,00001,00010,00100,01000,10000,11111',
    0: '01110,10001,10011,10101,11001,10001,01110', 1: '00100,01100,00100,00100,00100,00100,01110', 2: '01110,10001,00001,00010,00100,01000,11111',
    3: '11111,00010,00100,00010,00001,10001,01110', 4: '00010,00110,01010,10010,11111,00010,00010', 5: '11111,10000,11110,00001,00001,10001,01110',
    6: '00110,01000,10000,11110,10001,10001,01110', 7: '11111,00001,00010,00100,01000,01000,01000', 8: '01110,10001,10001,01110,10001,10001,01110',
    9: '01110,10001,10001,01111,00001,00010,01100', '/': '00001,00010,00010,00100,01000,01000,10000', '-': '00000,00000,00000,01110,00000,00000,00000',
    '.': '00000,00000,00000,00000,00000,01100,01100', '?': '01110,10001,00001,00010,00100,00000,00100', ' ': '000,000,000,000,000,000,000'
  };
  var FB = {
    windows: {
      a: ['#3a64d8', '#2c50b8', '#223e96', '#1a2e74', '#a8c8ff', '#0a1238'],
      b: ['#d85a48', '#b8402e', '#922c26', '#6a1c1e', '#ffc8b8', '#2a0608'],
      n: ['#4c5a8a', '#3e4a76', '#323c62', '#262e4e', '#c8d4f4', '#0a0e22']
    },
    edge: '#06061a', rivet: '#ffe070', rivetShade: '#7a5410', plate: '#1c2458', plateLight: '#5a6ac0', plateEdge: '#0a0c24',
    meter: { out: '#06040e', track: '#2a1e36', hp: '#7ce060', hpTop: '#d8ffb8', hpLow: '#f05848', hpLowTop: '#ffb0a0' },
    text: { main: '#ffffff', main2: '#c8d4ff', shadow: '#0a0c24', dim: '#8088a8', dim2: '#626a88', label: '#b8d0ff', label2: '#8ca8e8',
      title: '#fff4c8', title2: '#e8c870', gold: '#ffe890', gold2: '#e8c048', select: '#fff4c0', accent: '#ffe070' },
    fx: { hot: '#ff7a3a', heal: '#4ad870', white: '#ffffff' }, ink: '#06061a'
  };
  function fbMeasure(s) { s = String(s).toUpperCase(); var w = 0; for (var i = 0; i < s.length; i++) w += s[i] === ' ' ? 4 : 6; return Math.max(0, w - 1); }
  function fbText(g, s, x, y, c1, c2, sh) {
    for (var pass = sh ? 0 : 1; pass < 2; pass++) {
      var cx = x, str = String(s).toUpperCase();
      for (var i = 0; i < str.length; i++) {
        var ch = str[i], rows = (GLYPH[ch] || GLYPH['?']).split(',');
        for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < rows[ry].length; rx++) if (rows[ry][rx] === '1') {
          g.fillStyle = pass ? (ry < 4 ? c1 : c2) : sh;
          g.fillRect(cx + rx + (pass ? 0 : 1), y + ry + (pass ? 0 : 1), 1, 1);
        }
        cx += ch === ' ' ? 4 : 6;
      }
    }
  }
  function fbFrame(g, r, team, alpha) {
    var x = r.x, y = r.y, w = r.w, h = r.h, C = FB.windows[team] || FB.windows.n, i, pa = g.globalAlpha, a = alpha == null ? 1 : alpha;
    g.globalAlpha = pa * 0.95 * a;
    for (i = 0; i < h - 2; i++) { g.fillStyle = C[Math.min(3, Math.floor(i / (h - 2) * 4))]; g.fillRect(x + 1, y + 1 + i, w - 2, 1); }
    g.globalAlpha = pa * a; g.fillStyle = FB.edge;
    g.fillRect(x + 2, y, w - 4, 1); g.fillRect(x + 2, y + h - 1, w - 4, 1); g.fillRect(x, y + 2, 1, h - 4); g.fillRect(x + w - 1, y + 2, 1, h - 4);
    g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + w - 2, y + 1, 1, 1); g.fillRect(x + 1, y + h - 2, 1, 1); g.fillRect(x + w - 2, y + h - 2, 1, 1);
    g.fillStyle = C[4]; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 5);
    g.fillStyle = C[5]; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
    [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]].forEach(function (p) { g.fillStyle = FB.rivetShade; g.fillRect(p[0], p[1], 2, 2); g.fillStyle = FB.rivet; g.fillRect(p[0], p[1], 1, 1); });
    g.globalAlpha = pa;
  }
  function fbPlate(g, r) {
    g.fillStyle = FB.plateEdge; g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = FB.plate; g.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    g.fillStyle = FB.plateLight; g.fillRect(r.x + 1, r.y + 1, r.w - 2, 1);
  }
  function fbMeter(g, r, frac, low) {
    var M = FB.meter, iw = r.w - 2, f = Math.round(iw * Math.max(0, Math.min(1, frac)));
    g.fillStyle = M.out; g.fillRect(r.x, r.y, r.w, r.h); g.fillStyle = M.track; g.fillRect(r.x + 1, r.y + 1, iw, r.h - 2);
    g.fillStyle = low ? M.hpLow : M.hp; g.fillRect(r.x + 1, r.y + 1, f, r.h - 2); g.fillStyle = low ? M.hpLowTop : M.hpTop; g.fillRect(r.x + 1, r.y + 1, f, 1);
  }

  // small shapes (original): 3x5 "then" arrow, 5x5 advantage arrows
  var THEN = ['100', '110', '111', '110', '100'];
  var UP = ['..#..', '.###.', '#####', '.###.', '.###.'];
  var DOWN = ['.###.', '.###.', '#####', '.###.', '..#..'];
  function shape(g, rows, x, y, col, sh) {
    for (var pass = sh ? 0 : 1; pass < 2; pass++) {
      g.fillStyle = pass ? col : sh;
      for (var ry = 0; ry < rows.length; ry++) for (var rx = 0; rx < rows[ry].length; rx++) if (rows[ry][rx] !== '.' && rows[ry][rx] !== '0') g.fillRect(x + rx + (pass ? 0 : 1), y + ry + (pass ? 0 : 1), 1, 1);
    }
  }

  /* ---------- skin adapter: everything visible goes through here ---------- */
  function adapter(SK) {
    var T = SK ? (SK.palette.text || {}) : FB.text, X = SK ? (SK.palette.fx || {}) : FB.fx, F = SK && SK.fonts ? SK.fonts.ui || {} : {};
    var pick = function () { for (var i = 0; i < arguments.length; i++) if (arguments[i]) return arguments[i]; return '#ffffff'; };
    var col = {
      name: [pick(T.title, T.main), pick(T.title2, T.title, T.main)], label: [pick(T.label, T.accent, T.main), pick(T.label2, T.label, T.main)],
      value: [pick(T.main), pick(T.main2, T.main)], dim: [pick(T.dim, T.label, T.main), pick(T.dim2, T.dim, T.main)],
      after: [pick(T.gold, T.accent, T.main), pick(T.gold2, T.gold, T.accent, T.main)], flash: [pick(T.select, T.accent, T.main), pick(T.accent, T.select, T.main)],
      ko: [pick(X.hot, T.accent), pick(X.hot, T.accent)], shadow: pick(T.shadow, SK ? SK.palette.ink : FB.ink),
      up: pick(X.heal, '#4ad870'), down: pick(X.hot, '#ff7a3a'), badge: pick(T.accent, T.gold, '#ffe070'), badgeInk: pick(SK ? SK.palette.ink : FB.ink, '#06061a'),
      lose: pick(X.white, T.main), lose2: pick(X.hot, T.accent), then: pick(T.label, T.main)
    };
    var A = {
      col: col, pixel: !SK || SK.pixel !== false,
      fontH: SK ? (F.height || F.size || 7) : 7,
      measure: function (s) { s = String(s); if (!SK) return fbMeasure(s); try { return Math.ceil(SK.measure(s, { font: 'ui' }) || 0); } catch (e) { return fbMeasure(s); } },
      text: function (g, s, x, y, c, alpha, shadow) {
        var pa = g.globalAlpha; if (alpha != null) g.globalAlpha = pa * alpha; s = String(s);
        if (!SK) fbText(g, s, x, y, c[0], c[1], shadow === false ? null : col.shadow);
        else SK.text(g, s, x, y, { font: 'ui', color: c[0], color2: c[1], shadow: shadow === false ? false : undefined });
        g.globalAlpha = pa;
      },
      frame: function (g, r, team, alpha) { if (!SK) fbFrame(g, r, team, alpha); else SK.frame(g, r, { role: 'window', team: team, alpha: alpha }); },
      plate: function (g, r) { if (!SK) fbPlate(g, r); else SK.frame(g, r, { role: 'plate' }); },
      meter: function (g, r, frac, low) { if (!SK) fbMeter(g, r, frac, low); else SK.bar(g, r, frac, low ? 'hpLow' : 'hp', { style: 'meter' }); },
      // bar fill geometry, identical for the skin and the built-in meter: inner area x+1..x+w-1
      fillPx: function (r, frac) { return Math.round((r.w - 2) * Math.max(0, Math.min(1, frac))); }
    };
    return A;
  }

  /* ---------- helpers ---------- */
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function hit(a, b) { return a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function area(a, b) { return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); }
  function pad(r, m) { return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m }; }
  // any of {x, y, w, h} | {x (centre), top, w, h} | {left, top, w, h} -> {x, y, w, h}, or null
  function toRect(o) {
    if (!o || typeof o !== 'object') return null;
    var w = num(o.w != null ? o.w : o.width), h = num(o.h != null ? o.h : o.height);
    if (w == null || h == null) return null;
    if (num(o.top) != null && num(o.y) == null) {
      var l = num(o.left) != null ? o.left : num(o.x) != null ? o.x - w / 2 : null;
      return l == null ? null : { x: Math.round(l), y: Math.round(o.top), w: Math.round(w), h: Math.round(h) };
    }
    if (num(o.x) == null || num(o.y) == null) return null;
    return { x: Math.round(o.x), y: Math.round(o.y), w: Math.round(w), h: Math.round(h) };
  }
  function teamOf(t, role) {
    var s = t == null ? '' : String(t).toLowerCase();
    if (s === 'a' || s === 'player' || s === 'blue' || s === 'ally' || s === 'hero' || s === 'heroes' || s === 'party') return 'a';
    if (s === 'b' || s === 'enemy' || s === 'red' || s === 'foe' || s === 'foes' || s === 'monster') return 'b';
    if (s === 'n' || s === 'neutral' || s === 'other' || s === 'green') return 'n';
    return role === 'att' ? 'a' : 'b';
  }
  function maxOf(d) {
    if (num(d) != null) return d;
    if (Array.isArray(d) && d.length) return num(d[d.length - 1]);
    if (typeof d === 'string') { var m = d.match(/(\d+)\s*$/); return m ? +m[1] : null; }
    return null;
  }
  function dmgStr(d) {
    if (num(d) != null) return String(Math.max(0, Math.round(d)));
    if (Array.isArray(d) && d.length) { var a = num(d[0]), b = num(d[d.length - 1]); if (a == null || b == null) return '--'; a = Math.round(a); b = Math.round(b); return a === b ? String(a) : a + '-' + b; }
    if (typeof d === 'string' && d) return d;
    return '--';
  }
  function pctStr(v) { if (num(v) != null) return String(Math.max(0, Math.min(100, Math.round(v)))); if (typeof v === 'string' && v) return v; return '--'; }
  function has(v) { return num(v) != null || (typeof v === 'string' && v !== ''); }

  /* ---------- instance ---------- */
  function create(o) {
    o = o || {};
    var SK = root.GameDNA_Skin ? root.GameDNA_Skin.resolve(o.skin) : null;
    var A = adapter(SK);
    var P = {}, k; for (k in DEFAULTS) P[k] = DEFAULTS[k];
    var warned = {};
    function warn(key, msg) { if (warned[key]) return; warned[key] = 1; try { if (root.console) console.warn('[combat-forecast] ' + msg); } catch (e) {} emit({ event: 'warn', key: key, msg: msg }); }
    function emit(e) { if (typeof o.debug === 'function') try { o.debug(e); } catch (er) {} }
    function setParams(p) {
      if (!p) return;
      for (var key in p) if (key in DEFAULTS && p[key] != null && p[key] !== '') P[key] = typeof DEFAULTS[key] === 'number' ? (+p[key] || 0) : String(p[key]);
      if (S.cur) S.cur.lay = layout(S.cur);
    }
    var view = toRect(o.view), anchors = {}, obstacles = [], obsStep = -1;
    var S = {
      cur: null,          // {att, def, data, strings, lay}: what is shown
      st: 'closed',       // closed | opening | open | closing
      p: 0,               // open progress 0..1
      t: 0, step: 0, lastShow: -10, streak: 0, perFrame: false, bornStep: -1,
      draws: 0, burst: 0, lastWall: 0, drawsNoUpdate: 0, canvasV: null,
      pos: null, from: null, slideT: 1, flash: {}, lastStr: {}, pair: null, drawn: null
    };
    setParams(o.params);

    function safe(fn, args, key) {
      if (typeof fn !== 'function') return undefined;
      try { return fn.apply(null, args || []); } catch (e) { warn(key, key + '() threw: ' + (e && e.message)); return undefined; }
    }
    function getObs() {
      if (obsStep === S.step) return obstacles;
      obsStep = S.step;
      var r = safe(o.getObstacles, [], 'getObstacles');
      obstacles = [];
      if (Array.isArray(r)) r.forEach(function (q) { var R = toRect(q); if (R) { R.id = q.id; R.soft = q.soft; obstacles.push(R); } });
      else if (r != null) warn('obsType', 'getObstacles() must return an array');
      return obstacles;
    }
    // unit description -> {id, name, team, hp, max, rect, weapon, raw}
    function unit(u, role) {
      if (u == null || typeof u !== 'object') u = { id: u };
      var id = u.id != null ? u.id : u.name != null ? u.name : role;
      var rect = toRect(u.rect) || toRect(u.anchor) || toRect(u.box);
      if (!rect && typeof o.getAnchor === 'function') rect = toRect(safe(o.getAnchor, [id, u], 'getAnchor'));
      if (!rect) obstacles.forEach(function (q) { if (!rect && q.id != null && String(q.id) === String(id)) rect = { x: q.x, y: q.y, w: q.w, h: q.h }; });
      if (rect) anchors[id] = rect; else if (anchors[id]) rect = anchors[id];
      else warn('rect:' + id, 'no screen rect for unit ' + id + ' (pass rect, or getAnchor / getObstacles with its id): the window may cover it');
      var hp = num(u.hp), mx = num(u.max != null ? u.max : u.maxHp != null ? u.maxHp : u.hpMax != null ? u.hpMax : u.mhp);
      if (mx == null || mx <= 0) mx = hp != null ? Math.max(1, hp) : null;
      return { id: id, name: String(u.name != null ? u.name : id).toUpperCase(), team: teamOf(u.team != null ? u.team : u.side, role),
        hp: hp, max: mx, rect: rect, weapon: u.weapon != null && u.weapon !== '' ? String(u.weapon).toUpperCase() : null, raw: u };
    }
    function sideData(d) {
      d = d && typeof d === 'object' ? d : {};
      var hits = num(d.hits != null ? d.hits : d.count); hits = hits == null ? 1 : Math.max(1, Math.round(hits));
      return { dmg: d.dmg != null ? d.dmg : d.damage, hit: d.hit, crit: d.crit != null ? d.crit : d.crt, hits: hits, adv: num(d.adv) || 0 };
    }
    // strike order for the display only: attacker, counter, then the extra (x2) strikes; a side at 0 stops striking.
    // Every listed strike is assumed to land, with the top of a damage range (worst case). data.after overrides it.
    function predict(att, def, a, c) {
      var ha = att.hp, hd = def.hp, da = maxOf(a.dmg), dc = c ? maxOf(c.dmg) : null;
      if (ha == null || hd == null) return { att: ha, def: hd, cStruck: !!c };
      var seq = [['a'], c ? ['c'] : []], i, cs = false;
      for (i = 1; i < a.hits; i++) seq.push(['a']);
      if (c) for (i = 1; i < c.hits; i++) seq.push(['c']);
      seq.forEach(function (s) {
        if (!s.length || ha <= 0 || hd <= 0) return;
        if (s[0] === 'a' && da != null) hd = Math.max(0, hd - da);
        if (s[0] === 'c') { cs = true; if (dc != null) ha = Math.max(0, ha - dc); }
      });
      return { att: ha, def: hd, cStruck: cs };
    }
    function build(att, def, data) {
      data = data && typeof data === 'object' ? data : {};
      var a = sideData(data), c = data.counter && typeof data.counter === 'object' ? sideData(data.counter) : null;
      if (c && !c.adv && a.adv) c.adv = -a.adv;
      var aft = predict(att, def, a, c), ov = data.after && typeof data.after === 'object' ? data.after : null;
      if (ov && num(ov.att) != null) aft.att = ov.att; if (ov && num(ov.def) != null) aft.def = ov.def;
      var side = function (u, s, after, role) {
        return { u: u, role: role, hpNow: u.hp == null ? '--' : String(Math.round(u.hp)), hpAfter: after == null ? null : Math.round(after),
          dmg: s ? dmgStr(s.dmg) : '--', hit: s ? pctStr(s.hit) : '--', crit: s ? pctStr(s.crit) : '--', hits: s ? s.hits : 1, adv: s ? s.adv : 0,
          none: !s, hasHit: !!s && has(s.hit), hasCrit: !!s && has(s.crit), dim: role === 'def' && !!s && !aft.cStruck };
      };
      var SA = side(att, a, aft.att, 'att'), SD = side(def, c, aft.def, 'def');
      var left = SA, right = SD;
      if (P.sides === 'team' && def.team === 'a' && att.team !== 'a') { left = SD; right = SA; }
      return { att: att, def: def, L: left, R: right, note: data.note ? String(data.note).toUpperCase() : null };
    }
    function rowsFor(cur) {
      var r = ['hp', 'dmg'];
      if (P.rows === 'compact') return r;
      var all = P.rows === 'all';
      if (all || cur.L.hasHit || cur.R.hasHit) r.push('hit');
      if (all || cur.L.hasCrit || cur.R.hasCrit) r.push('crit');
      return r;
    }
    var LABEL = { hp: 'HP', dmg: 'DMG', hit: 'HIT', crit: 'CRT', wpn: '' };
    function hpW(s) { var w = A.measure(s.hpNow); if (s.hpAfter != null && String(s.hpAfter) !== s.hpNow) w += 3 + 3 + 3 + A.measure(String(s.hpAfter)); return w; }
    function badgeW(n) { return n >= 2 ? A.measure('X' + n) + 4 + 2 : 0; }
    function layout(cur) {
      var rows = rowsFor(cur), wpn = !!(cur.L.u.weapon || cur.R.u.weapon), fh = Math.max(7, Math.round(A.fontH));
      var rowH = fh + 3, lw = 0, cw = 0;
      rows.forEach(function (r) { lw = Math.max(lw, A.measure(LABEL[r])); });
      lw += 10; if (lw % 2) lw++;
      [cur.L, cur.R].forEach(function (s) {
        var arrow = s.adv ? 7 : 0;
        cw = Math.max(cw, A.measure(s.u.name) + (wpn ? 0 : arrow), hpW(s), A.measure(s.dmg) + badgeW(s.hits), A.measure(s.hit), A.measure(s.crit));
        if (wpn) cw = Math.max(cw, A.measure(s.u.weapon || '') + arrow);
      });
      cw = Math.max(cw, 30);
      var padX = 6, w = 2 * (padX + cw + 3) + lw, barH = P.bars === 'off' ? 0 : 4;
      if (w % 2) w++;
      var h = 5 + rowH + 2 + rows.length * rowH + barH + (wpn ? rowH : 0) + 3;
      return { w: w, h: h, rows: rows, rowH: rowH, lw: lw, cw: cw, padX: padX, wpn: wpn, barH: barH, fh: fh };
    }

    function viewRect(ctx) {
      if (view) return view;
      if (ctx && ctx.canvas && ctx.canvas.width) S.canvasV = { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height };
      return S.canvasV;
    }
    // placement, in tiers: never on the two units, the cursor or rects without id (hard); then never on other units (rects with
    // an id) when any spot allows it; `soft: true` rects (decor) only cost a little. The window stays put while it touches nothing.
    function place(V) {
      var cur = S.cur; if (!cur || !V) return S.pos;
      var L = cur.lay, w = L.w, h = L.h, m = Math.max(0, P.margin), e = V.w < w + 8 || V.h < h + 8 ? 0 : 4;
      var hard = [], soft = [], ids = {};
      [cur.att, cur.def].forEach(function (u) { if (u.rect) hard.push(pad(u.rect, m)); ids[String(u.id)] = 1; });
      var cr = toRect(safe(o.getCursor, [], 'getCursor')); if (cr) hard.push(pad(cr, 1));
      (cur.avoid || []).forEach(function (r) { var R = toRect(r); if (R) hard.push(pad(R, 1)); });
      getObs().forEach(function (q) {
        if (q.id != null && ids[String(q.id)]) { hard.push(pad(q, m)); return; }
        if (q.id == null && !q.soft) hard.push(pad(q, 1)); else soft.push(q);
      });
      var pair = null;
      [cur.att.rect, cur.def.rect].forEach(function (r) { if (!r) return; pair = pair ? { x: Math.min(pair.x, r.x), y: Math.min(pair.y, r.y), w: Math.max(pair.x + pair.w, r.x + r.w) - Math.min(pair.x, r.x), h: Math.max(pair.y + pair.h, r.y + r.h) - Math.min(pair.y, r.y) } : { x: r.x, y: r.y, w: r.w, h: r.h }; });
      var px = pair ? pair.x + pair.w / 2 : V.x + V.w / 2, py = pair ? pair.y + pair.h / 2 : V.y + V.h / 2;
      var clampR = function (x, y) { return { x: Math.round(Math.max(V.x, Math.min(V.x + V.w - w, x))), y: Math.round(Math.max(V.y, Math.min(V.y + V.h - h, y))), w: w, h: h }; };
      var cands = [];
      var corners = [[V.x + e, V.y + e], [V.x + V.w - w - e, V.y + e], [V.x + e, V.y + V.h - h - e], [V.x + V.w - w - e, V.y + V.h - h - e],
        [V.x + (V.w - w) / 2, V.y + e], [V.x + (V.w - w) / 2, V.y + V.h - h - e], [V.x + e, V.y + (V.h - h) / 2], [V.x + V.w - w - e, V.y + (V.h - h) / 2]];
      var near = pair ? [[px - w / 2, pair.y - h - m - 2], [px - w / 2, pair.y + pair.h + m + 2], [pair.x - w - m - 2, py - h / 2], [pair.x + pair.w + m + 2, py - h / 2]] : [];
      corners.forEach(function (c, i) { cands.push({ r: clampR(c[0], c[1]), pref: P.place === 'near' ? 30 + i : i * 2 }); });
      near.forEach(function (c, i) { cands.push({ r: clampR(c[0], c[1]), pref: P.place === 'near' ? i * 2 : 60 + i }); });
      if (S.pos) cands.push({ r: clampR(S.pos.x, S.pos.y), pref: -1e3, keep: true });
      var score = function (c) {
        var r = c.r, s = 0, hv = 0, uv = 0;
        hard.forEach(function (q) { hv += area(r, q); });
        soft.forEach(function (q) { var a = area(r, q); if (q.soft) s += a; else uv += a; });
        if (hv) s += 1e6 + hv * 10;
        if (uv) s += 1e4 + uv * 10;
        var dx = r.x + w / 2 - px, dy = r.y + h / 2 - py, d = Math.sqrt(dx * dx + dy * dy);
        s += P.place === 'near' ? d * 0.6 : -d * 0.15;
        if (c.keep) { if (hv || uv) return Infinity; s -= 400; }   // hysteresis: keep the current spot while it touches nothing
        return s + c.pref;
      };
      var best = null, bs = Infinity;
      cands.forEach(function (c) { var s = score(c); if (s < bs) { bs = s; best = c; } });
      if (bs >= 1e4) {   // every preset spot touches a unit or the cursor: scan the view on a 4 px grid
        for (var y = V.y; y <= V.y + V.h - h; y += 4) for (var x = V.x; x <= V.x + V.w - w; x += 4) {
          var c = { r: { x: x, y: y, w: w, h: h }, pref: 200 }, s = score(c);
          if (s < bs) { bs = s; best = c; }
        }
        if (bs >= 1e6) warn('cramped', 'no spot in view avoids both units and the cursor; the window overlaps as little as possible');
      }
      return best ? { x: best.r.x, y: best.r.y } : S.pos;
    }
    function relayout(ctx) {
      var V = viewRect(ctx); if (!S.cur || !V) return;
      var np = place(V); if (!np) return;
      if (!S.pos || S.st === 'opening' && S.p === 0) { S.pos = np; S.from = null; S.slideT = 1; return; }
      if (np.x !== S.pos.x || np.y !== S.pos.y) {
        S.from = drawnPos(); S.pos = np; S.slideT = P.slide > 0 && S.st === 'open' ? 0 : 1;
        emit({ event: 'place', x: np.x, y: np.y });
      }
    }
    function drawnPos() {
      if (!S.pos) return null;
      if (!S.from || S.slideT >= 1) return { x: S.pos.x, y: S.pos.y };
      var k = 1 - Math.pow(1 - S.slideT, 3);
      return { x: Math.round(S.from.x + (S.pos.x - S.from.x) * k), y: Math.round(S.from.y + (S.pos.y - S.from.y) * k) };
    }
    function strings(cur) {
      var out = {};
      [['L', cur.L], ['R', cur.R]].forEach(function (q) {
        var s = q[1], p = q[0] + ':' + s.u.id + ':';
        out[p + 'hp'] = s.hpNow + '>' + s.hpAfter; out[p + 'dmg'] = s.dmg + 'x' + s.hits; out[p + 'hit'] = s.hit; out[p + 'crit'] = s.crit; out[p + 'wpn'] = s.u.weapon + s.adv;
      });
      return out;
    }

    /* ---------- public API ---------- */
    function show(att, def, data, opt) {
      try {
        getObs();
        var A1 = unit(att, 'att'), D1 = unit(def, 'def');
        if (data == null && typeof o.forecast === 'function') data = safe(o.forecast, [att, def], 'forecast');
        if (data == null) warn('nodata', 'show() got no numbers and no forecast callback: the window shows HP only');
        var cur = build(A1, D1, data); cur.avoid = opt && opt.avoid ? [].concat(opt.avoid) : null;
        cur.lay = layout(cur);
        var key = String(A1.id) + '>' + String(D1.id), str = strings(cur);
        if (S.st === 'open' || S.st === 'opening') for (var s in str) if (S.lastStr[s] != null && S.lastStr[s] !== str[s]) S.flash[s] = 14;
        else if (S.lastStr[s] == null && S.pair != null && S.pair !== key) S.flash[s] = 8;
        S.lastStr = str;
        var wasClosed = S.st === 'closed' || S.st === 'closing';
        S.cur = cur;
        if (S.pair !== key) { S.pair = key; emit({ event: 'pair', att: A1.id, def: D1.id }); }
        // called in 4+ consecutive steps = the host shows it every frame: it then closes by itself 3 steps after the calls stop
        if (S.step !== S.lastShow) { S.streak = S.step - S.lastShow === 1 ? S.streak + 1 : 0; if (S.streak >= 3) S.perFrame = true; S.lastShow = S.step; }
        if (wasClosed) {
          if (S.st === 'closed') { S.pos = null; S.p = P.open > 0 ? 0 : 1; S.perFrame = false; S.streak = 0; S.bornStep = S.step; }
          S.st = P.open > 0 && S.p < 1 ? 'opening' : 'open'; emit({ event: 'open', att: A1.id, def: D1.id });
          if (S.st === 'open') emit({ event: 'opened' });
        }
        relayout(null);
      } catch (e) { warn('show', 'show() failed: ' + (e && e.message)); }
    }
    function hide() {
      if (S.st === 'closed' || S.st === 'closing') return;
      S.st = P.open > 0 ? 'closing' : 'closed'; if (S.st === 'closed') { S.p = 0; S.cur = null; S.pair = null; }
      emit({ event: 'close' });
    }
    function update(dt) {
      try {
        dt = num(dt); if (dt == null || dt < 0) dt = FRAME;
        var now = root.performance && performance.now ? performance.now() : 0;
        S.burst = now - S.lastWall < 2 ? S.burst + 1 : 0; S.lastWall = now; S.drawsNoUpdate = 0;
        S.step++; S.t += dt;
        var fr = dt / FRAME, rate = P.open > 0 ? fr / P.open : 1;
        if (S.st === 'open' && S.perFrame && S.step - S.lastShow > 3) { hide(); emit({ event: 'close', auto: true }); }
        if (S.st === 'opening') { S.p = Math.min(1, S.p + rate); if (S.p >= 1) { S.st = 'open'; emit({ event: 'opened' }); } }
        else if (S.st === 'closing') { S.p = Math.max(0, S.p - rate); if (S.p <= 0) { S.st = 'closed'; S.cur = null; S.pair = null; S.lastStr = {}; S.flash = {}; emit({ event: 'closed' }); } }
        if (S.slideT < 1) S.slideT = P.slide > 0 ? Math.min(1, S.slideT + dt / P.slide) : 1;
        for (var f in S.flash) if ((S.flash[f] -= fr) <= 0) delete S.flash[f];
        if (S.cur && (S.st === 'open' || S.st === 'opening')) {
          getObs();
          if (typeof o.getAnchor === 'function') [S.cur.att, S.cur.def].forEach(function (u) { var r = toRect(safe(o.getAnchor, [u.id, u.raw], 'getAnchor')); if (r) { u.rect = r; anchors[u.id] = r; } });
          relayout(null);
        }
      } catch (e) { warn('update', 'update() failed: ' + (e && e.message)); }
    }
    function draw(ctx, ox, oy) {
      S.drawn = null;
      if (!ctx || !S.cur || S.st === 'closed') return;
      try {
        ox = num(ox) || 0; oy = num(oy) || 0;
        viewRect(ctx);
        // first draw after a fast-forward (?t=&freeze=1 runs many updates in a burst, then draws once): a window opened after
        // the last update (from render code) is drawn settled, not at frame 0 of its opening
        if (S.draws === 0 && S.burst >= 20 && S.bornStep === S.step) { S.p = 1; S.st = 'open'; S.slideT = 1; }
        if (++S.drawsNoUpdate > 30 && S.step === 0) { warn('noupdate', 'update() is never called; advancing one frame per draw'); update(FRAME); S.drawsNoUpdate = 31; }
        S.draws++;
        if (!S.pos) { getObs(); relayout(ctx); }
        if (!S.pos) return;
        paint(ctx, ox, oy);
      } catch (e) { warn('draw', 'draw() failed: ' + (e && e.message)); }
    }
    function paint(g, ox, oy) {
      var cur = S.cur, L = cur.lay, pos = drawnPos(), x = pos.x + ox, y = pos.y + oy, w = L.w, h = L.h, C = A.col;
      var ease = S.p >= 1 ? 1 : 1 - Math.pow(1 - S.p, 2), hh = Math.max(4, Math.round(h * ease)), yy = y + Math.round((h - hh) / 2);
      var split = x + w / 2, half = Math.round(L.lw / 2);
      var pa = g.globalAlpha, sm = g.imageSmoothingEnabled; if (A.pixel) g.imageSmoothingEnabled = false;
      A.frame(g, { x: x, y: yy, w: split - x + half, h: hh }, cur.L.u.team);
      A.frame(g, { x: split - half, y: yy, w: x + w - split + half, h: hh }, cur.R.u.team);
      A.plate(g, { x: split - half, y: yy + 2, w: L.lw, h: hh - 4 });
      S.drawn = { x: x, y: yy, w: w, h: hh, p: S.p, sliding: S.slideT < 1, att: cur.att.id, def: cur.def.id, target: { x: x, y: y, w: w, h: h },
        attRect: cur.att.rect, defRect: cur.def.rect, cursor: toRect(safe(o.getCursor, [], 'getCursor')) };
      if (S.p < 1) { g.imageSmoothingEnabled = sm; g.globalAlpha = pa; return; }
      var t = S.t, bob = P.blink > 0 ? Math.floor(t / 300) % 2 : 0, rowH = L.rowH, ty = (rowH - L.fh) >> 1;
      var lx = x + L.padX, rx = x + w - L.padX, lc = lx + L.cw / 2, rc = rx - L.cw / 2;
      var fl = function (key, base) { var f = S.flash[key]; return f > 0 && Math.floor(f / 3) % 2 === 0 ? C.flash : base; };
      // header: names (and the matchup arrows when there is no weapon row)
      var y0 = y + 5;
      [[cur.L, 'L'], [cur.R, 'R']].forEach(function (q) {
        var s = q[1] === 'L', u = q[0].u, nw = A.measure(u.name), ax = s ? lx + nw + 2 : rx - nw - 7;
        A.text(g, u.name, s ? lx : rx - nw, y0 + ty, C.name);
        if (!L.wpn && q[0].adv) shape(g, q[0].adv > 0 ? UP : DOWN, ax, y0 + ty + 1 + (q[0].adv > 0 ? -bob : bob), q[0].adv > 0 ? C.up : C.down, C.shadow);
      });
      // rows
      var ry = y0 + rowH + 2, rowsDrawn = [];
      L.rows.forEach(function (row) {
        A.text(g, LABEL[row], split - Math.round(A.measure(LABEL[row]) / 2), ry + ty, C.label);
        [[cur.L, lc, 'L'], [cur.R, rc, 'R']].forEach(function (q) {
          var s = q[0], cx = q[1], key = q[2] + ':' + s.u.id + ':' + row;
          if (row === 'hp') {
            var now = s.hpNow, af = s.hpAfter, changes = af != null && String(af) !== now, tw = hpW(s), sx = Math.round(cx - tw / 2);
            A.text(g, now, sx, ry + ty, fl(key, C.value));
            if (changes) {
              var nx = sx + A.measure(now) + 3; shape(g, THEN, nx, ry + ty + 1, C.then, C.shadow);
              A.text(g, String(af), nx + 6, ry + ty, fl(key, af <= 0 ? C.ko : C.after));
            }
            if (L.barH && s.u.max) {
              var br = { x: Math.round(cx - L.cw / 2), y: ry + rowH, w: L.cw, h: 3 }, fNow = (s.u.hp || 0) / s.u.max, fAf = af == null ? fNow : af / s.u.max;
              A.meter(g, br, fAf, fAf <= 0.25);
              var p0 = A.fillPx(br, fAf), p1 = A.fillPx(br, fNow);
              if (p1 > p0) { g.fillStyle = P.blink > 0 && Math.floor(t / P.blink) % 2 ? C.lose2 : C.lose; g.fillRect(br.x + 1 + p0, br.y + 1, p1 - p0, br.h - 2); }
            }
          } else {
            var str = s[row], none = str === '--';
            if (row === 'dmg' && s.hits >= 2 && !none) {
              var bt = 'X' + s.hits, dw = A.measure(str), bw = A.measure(bt) + 4, tot = dw + 2 + bw, bx = Math.round(cx - tot / 2);
              A.text(g, str, bx, ry + ty, s.dim ? C.dim : fl(key, C.value));
              g.fillStyle = C.shadow; g.fillRect(bx + dw + 3, ry + ty - 1, bw, L.fh + 2);
              g.fillStyle = C.badge; g.fillRect(bx + dw + 2, ry + ty - 2, bw, L.fh + 2);
              A.text(g, bt, bx + dw + 4, ry + ty - 1, [C.badgeInk, C.badgeInk], 1, false);
            } else A.text(g, str, Math.round(cx - A.measure(str) / 2), ry + ty, none || s.dim ? C.dim : fl(key, C.value));
          }
        });
        rowsDrawn.push(row);
        ry += rowH + (row === 'hp' ? L.barH : 0);
      });
      if (L.wpn) [[cur.L, 'L'], [cur.R, 'R']].forEach(function (q) {
        var s = q[0], left = q[1] === 'L', wn = s.u.weapon || '', ww = A.measure(wn), key = q[1] + ':' + s.u.id + ':wpn';
        if (wn) A.text(g, wn, left ? lx : rx - ww, ry + ty, fl(key, C.label));
        if (s.adv) shape(g, s.adv > 0 ? UP : DOWN, left ? lx + ww + 2 : rx - ww - 7, ry + ty + 1 + (s.adv > 0 ? -bob : bob), s.adv > 0 ? C.up : C.down, C.shadow);
      });
      S.drawn.rows = rowsDrawn;
      g.imageSmoothingEnabled = sm; g.globalAlpha = pa;
    }
    function rect() {
      if (!S.cur || S.st === 'closed') return null;
      var p = S.pos || (S.drawn && S.drawn.target); if (!p) return null;
      return { x: p.x, y: p.y, w: S.cur.lay.w, h: S.cur.lay.h };
    }
    return {
      show: show, hide: hide, update: update, draw: draw, rect: rect,
      rects: function () { var r = rect(); return r ? [r] : []; },
      isOpen: function () { return S.st === 'open' || S.st === 'opening'; },
      isSettled: function () { return S.st === 'open' && S.slideT >= 1; },
      clear: function () { S.st = 'closed'; S.p = 0; S.cur = null; S.pair = null; S.pos = null; S.flash = {}; S.lastStr = {}; S.slideT = 1; S.perFrame = false; anchors = {}; },
      setParams: setParams, setView: function (r) { view = toRect(r); if (S.cur) relayout(null); },
      params: function () { var c = {}; for (var q in P) c[q] = P[q]; return c; },
      shown: function () { return S.cur ? { att: S.cur.att.id, def: S.cur.def.id, left: S.cur.L.u.id, right: S.cur.R.u.id } : null; },
      lastDrawn: function () { return S.drawn; }
    };
  }

  root.GameDNA_CombatForecast = { create: create, version: '1.0.0', defaults: DEFAULTS };
})(typeof window !== 'undefined' ? window : this);
