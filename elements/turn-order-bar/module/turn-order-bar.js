/* GameDNA C-02 · Turn-order bar · module v1 (plain script, no dependencies, one global)
 *
 *   const tob = GameDNA_TurnOrder.create({
 *     view: { x: 0, y: 0, w: 256, h: 224 },          // screen area the bar stays inside (native px)
 *     layout: 'top',                                 // 'top' | 'bottom' (horizontal) | 'left' | 'right' (vertical)
 *     drawPortrait: (ctx, id, rect) => { ... },      // optional: draw unit `id` inside rect (clipped); else a coloured token
 *     teamOf: id => 'a' | 'b' | 'n',                 // player / enemy / neutral (also 'hero', 'foe', 'blue', 'red', '#rrggbb')
 *     getObstacles: () => [{ x, y, w, h, id? }],     // HUD rects (no id) the bar must not cover; sprites (with id)
 *     params: { slots: 8, size: 16, ... }            // see DEFAULTS
 *   });
 *   tob.setOrder(['knight', 'slime-1', 'mage'], { current: 'knight', waits: { mage: 3 } });  // whenever the order changes (or every frame)
 *   tob.highlight('slime-1');   tob.update(dtMs);   tob.draw(ctx);
 *   The host owns the turn rules; the module only shows the order it is given. It reads no input.
 */
(function (root) {
  'use strict';
  var DEFAULTS = { layout: 'top', align: 'start', slots: 8, size: 16, gap: 2, slide: 240, pop: 220, bounce: 2, waits: 'auto', label: 'TURN', fade: 'on', margin: 2, portrait: 'auto' };
  var FRAME = 1000 / 60, BREAK = '|';

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
    9: '01110,10001,10001,01111,00001,00010,01100', '?': '01110,10001,00001,00010,00100,00000,00100'
  };
  // 3x5 digits for wait numbers and the "+N" overflow tab (always drawn from this table, coloured by skin tokens)
  var TINY = { 0: '111,101,101,101,111', 1: '010,110,010,010,111', 2: '111,001,111,100,111', 3: '111,001,011,001,111', 4: '101,101,111,001,001',
    5: '111,100,111,001,111', 6: '111,100,111,101,111', 7: '111,001,010,010,010', 8: '111,101,111,101,111', 9: '111,101,111,001,111',
    '+': '000,010,111,010,000', '-': '000,000,111,000,000' };
  var FB = {
    ink: '#06061a', plate: '#1c2458', plateLight: '#5a6ac0', plateEdge: '#0a0c24', well: 'rgba(6,8,30,0.4)',
    windows: { a: ['#3a64d8', '#2c50b8', '#223e96', '#1a2e74', '#a8c8ff', '#0a1238'], b: ['#d85a48', '#b8402e', '#922c26', '#6a1c1e', '#ffc8b8', '#2a0608'],
      n: ['#4c5a8a', '#3e4a76', '#323c62', '#262e4e', '#c8d4f4', '#0a0e22'] },
    gold: { light: '#fff6c0', base: '#f0b830', edge: '#24100a' },
    text: { main: '#ffffff', main2: '#c8d4ff', shadow: '#0a0c24', label: '#b8d0ff', label2: '#8ca8e8', dim: '#8088a8' },
    fx: { white: '#ffffff', hot: '#ff7a3a' }
  };
  var TEAM_WORDS = { a: 'a', b: 'b', n: 'n', ally: 'a', allies: 'a', hero: 'a', heroes: 'a', player: 'a', party: 'a', blue: 'a', friend: 'a', good: 'a', p1: 'a', left: 'a',
    enemy: 'b', enemies: 'b', foe: 'b', foes: 'b', monster: 'b', red: 'b', cpu: 'b', ai: 'b', bad: 'b', p2: 'b', right: 'b', boss: 'b',
    neutral: 'n', other: 'n', npc: 'n', guest: 'n', green: 'n' };

  function rgb(c) {
    c = String(c || '#000');
    if (c[0] === '#') { var h = c.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    var m = c.match(/[\d.]+/g); return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
  }
  function hex(a) { return '#' + a.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return hex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  function fbW(s) { s = String(s).toUpperCase(); var w = 0; for (var i = 0; i < s.length; i++) w += s[i] === ' ' ? 4 : 6; return Math.max(0, w - 1); }
  function fbText(g, s, x, y, c1, c2, sh) {
    for (var pass = sh ? 0 : 1; pass < 2; pass++) {
      var cx = x, str = String(s).toUpperCase();
      for (var i = 0; i < str.length; i++) {
        var ch = str[i]; if (ch === ' ') { cx += 4; continue; }
        var rows = (GLYPH[ch] || GLYPH['?']).split(',');
        for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < 5; rx++) if (rows[ry][rx] === '1') {
          g.fillStyle = pass ? (ry < 4 ? c1 : c2) : sh; g.fillRect(cx + rx + (pass ? 0 : 1), y + ry + (pass ? 0 : 1), 1, 1);
        }
        cx += 6;
      }
    }
  }
  function tinyW(s) { return Math.max(0, String(s).length * 4 - 1); }
  function tinyText(g, s, x, y, col) {
    s = String(s); g.fillStyle = col;
    for (var i = 0; i < s.length; i++) {
      var t = TINY[s[i]]; if (!t) continue; var rows = t.split(',');
      for (var ry = 0; ry < 5; ry++) for (var rx = 0; rx < 3; rx++) if (rows[ry][rx] === '1') g.fillRect(x + i * 4 + rx, y + ry, 1, 1);
    }
  }
  function easeOut(k) { k = Math.max(0, Math.min(1, k)); return 1 - Math.pow(1 - k, 3); }
  function hit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function area(a, b) { var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function normRect(r) {
    if (!r) return null;
    if (Array.isArray(r)) r = { x: r[0], y: r[1], w: r[2], h: r[3] };
    var x = num(r.x, NaN), y = num(r.y, NaN), w = num(r.w != null ? r.w : r.width, NaN), h = num(r.h != null ? r.h : r.height, NaN);
    if (!isFinite(x) || !isFinite(y) || !(w > 0) || !(h > 0)) return null;
    return { x: x, y: y, w: w, h: h, id: r.id, soft: !!r.soft };
  }
  function idOf(o) { if (o === BREAK) return BREAK; if (o && typeof o === 'object') return o.id != null ? o.id : o.name != null ? o.name : null; return o; }

  /* ---------- look adapter: skin tokens, or the built-in copy of pixel16 ---------- */
  function adapter(SK, SKIN) {
    var P = SK ? SK.palette || {} : null, T = P ? P.text || {} : FB.text, F = SK && SK.fonts ? SK.fonts.ui || {} : null;
    var M = SKIN && SKIN.color && SKIN.color.mix ? function (a, b, t) { try { return SKIN.color.mix(a, b, t); } catch (e) { return mix(a, b, t); } } : mix;
    function pick() { for (var i = 0; i < arguments.length; i++) if (arguments[i]) return arguments[i]; return '#ffffff'; }
    var ink = pick(P && P.ink, FB.ink), cache = {};
    function team(t) {
      if (cache[t]) return cache[t];
      var r;
      if (t && t[0] === '#') r = { light: M(t, '#ffffff', 0.55), mid: t, dark: M(t, '#000000', 0.4), well: M(t, '#000000', 0.68) };
      else {
        var Wn = P ? P.windows && P.windows[t] : FB.windows[t] || FB.windows.n;
        if (Wn) r = { light: Wn[4], mid: Wn[1], dark: Wn[3], well: M(Wn[3], ink, 0.5) };
        else { var base = pick(P && P.team && P.team[t], P && P.team && P.team.n, FB.windows.n[1]); r = { light: M(base, '#ffffff', 0.55), mid: base, dark: M(base, '#000000', 0.4), well: M(base, '#000000', 0.68) }; }
      }
      return (cache[t] = r);
    }
    var C = P ? P.cursor || {} : FB.gold, goldBase = pick(C.base, P && P.text && P.text.gold2, P && P.fx && P.fx.crit, FB.gold.base);
    var gold = { light: pick(C.light, P && P.text && P.text.gold, FB.gold.light), mid: goldBase, dark: M(goldBase, '#000000', 0.42), edge: pick(C.edge, ink) };
    var fontH = SK ? (F && (F.height || F.size)) || 7 : 7;
    return {
      ink: ink, team: team, gold: gold, fontH: fontH,
      white: pick(P && P.fx && P.fx.white, P && P.paper, '#ffffff'), dead: pick(P && P.fx && P.fx.hot, FB.fx.hot),
      tabFill: pick(P && P.ui && P.ui.plateEdge, ink), tabText: pick(P && P.paper, '#ffffff'), tabNow: gold.light,
      divider: pick(T.label, T.dim, T.main), dividerDim: pick(T.label2, T.dim, T.main),
      measure: function (s) { if (!SK) return fbW(s); try { return SK.measure(String(s), { font: 'ui' }); } catch (e) { return fbW(s); } },
      text: function (g, s, x, y, c1, c2) {
        if (!SK) return fbText(g, s, x, y, c1, c2, FB.text.shadow);
        try { SK.text(g, String(s), x, y, { font: 'ui', color: c1, color2: c2 }); } catch (e) { fbText(g, s, x, y, c1, c2, FB.text.shadow); }
      },
      label: function (g, s, x, y) { this.text(g, s, x, y, pick(T.label, T.main), pick(T.label2, T.main2, T.main)); },
      plate: function (g, r, alert) {
        if (SK) { try { SK.frame(g, r, { role: 'plate', alert: !!alert }); return; } catch (e) { /* fall through */ } }
        g.fillStyle = FB.plateEdge; g.fillRect(r.x, r.y, r.w, r.h);
        g.fillStyle = FB.plate; g.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        g.fillStyle = FB.plateLight; g.fillRect(r.x + 1, r.y + 1, r.w - 2, 1);
      },
      initials: function (g, s, cx, cy, col) {
        var w = this.measure(s); this.text(g, s, Math.round(cx - w / 2), Math.round(cy - fontH / 2), col, col);
      }
    };
  }

  /* ---------- the bar ---------- */
  function create(options) {
    var opt = options || {};
    var SKIN = root.GameDNA_Skin, SK = null;
    try { SK = SKIN && SKIN.resolve ? SKIN.resolve(opt.skin) : null; } catch (e) { SK = null; }
    var L = adapter(SK, SKIN);
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    setParamsRaw(opt.params || {});
    if (opt.layout) P.layout = String(opt.layout);
    if (opt.align) P.align = String(opt.align);

    var view = normRect(opt.view), clock = 0, serial = 0, warned = {}, items = [], seqKey = null, lastIds = [], overflow = 0;
    var current = null, hl = {}, waitsOn = false, dead = {}, shown = false, everShown = false;
    var plate = { x: 0, y: 0, len: 0, lenFrom: 0, lenTo: 0, lenT: 1, px: null, py: null, fromX: 0, fromY: 0, toX: 0, toY: 0, pT: 1, vis: 0, alpha: 1 };
    var obstacles = [], obsRead = false, placeTick = 0, updates = 0, drawsSinceUpdate = 0, drawn = [], G = null, visibleIds = [];

    function warn(key, msg) { if (warned[key]) return; warned[key] = 1; if (root.console) console.warn('GameDNA_TurnOrder: ' + msg); emit({ event: 'warn', key: key, msg: msg }); }
    function emit(e) { if (typeof opt.debug === 'function') try { opt.debug(e); } catch (er) { /* ignore */ } }
    function setParamsRaw(o) {
      for (var key in o) if (Object.prototype.hasOwnProperty.call(DEFAULTS, key) && o[key] != null) {
        var d = DEFAULTS[key]; P[key] = typeof d === 'number' ? num(o[key], d) : String(o[key]);
      }
      P.slots = Math.max(1, Math.min(16, Math.round(P.slots))); P.size = Math.max(10, Math.min(32, Math.round(P.size)));
      P.gap = Math.max(0, Math.min(8, Math.round(P.gap))); P.bounce = Math.max(0, Math.min(6, Math.round(P.bounce)));
      P.margin = Math.max(0, Math.min(16, Math.round(P.margin))); P.slide = Math.max(0, P.slide); P.pop = Math.max(0, P.pop);
      if (!/^(top|bottom|left|right)$/.test(P.layout)) P.layout = 'top';
      if (!/^(start|center|end)$/.test(P.align)) P.align = 'start';
    }
    function horiz() { return P.layout === 'top' || P.layout === 'bottom'; }
    function teamOf(id) {
      var t = null;
      if (typeof opt.teamOf === 'function') { try { t = opt.teamOf(id); } catch (e) { warn('teamOf', 'teamOf(' + id + ') threw: ' + e.message); } }
      if (t === 0 || t === false) return 'a'; if (t === 1 || t === true) return 'b';
      if (t == null) return 'n'; t = String(t);
      if (t[0] === '#') return t;
      return TEAM_WORDS[t.toLowerCase()] || 'n';
    }
    function labelOf(id) {
      var s = null;
      if (typeof opt.labelOf === 'function') { try { s = opt.labelOf(id); } catch (e) { s = null; } }
      if (s == null) s = String(id).replace(/[^A-Za-z0-9]/g, '').slice(0, 1) || '?';
      return String(s).toUpperCase().slice(0, 2);
    }

    /* geometry: plate thickness, where slots start, how many fit */
    function geom() {
      var s = P.size, B = s + 4, H = horiz(), lab = P.label && P.label !== 'none' ? String(P.label) : '', pad = 2;
      var showW = P.waits !== 'off' && waitsOn, labW = lab ? L.measure(lab) : 0, out = s < 14 || P.portrait === 'token', wt = !showW ? 0 : !out ? 3 : H ? 8 : 13, g = {};
      g.s = s; g.B = B; g.H = H; g.lab = lab; g.pad = pad; g.waits = showW; g.tabOut = out;   // small slots / tokens: the tab sits fully outside so it never hides the initial
      if (H) {
        g.th = pad + P.bounce + 1 + B + 1 + wt + pad;
        g.axis0 = pad + (lab ? labW + 4 : 0) + 1;
        g.base = pad + P.bounce + 1 + B;                         // slot bottoms line up here (from the plate top)
        g.labX = pad + 1; g.labY = Math.round((g.th - L.fontH) / 2);
      } else {
        g.th = Math.max(pad + 1 + B + 1 + wt + pad, lab ? labW + 2 * pad + 2 : 0);
        g.axis0 = pad + (lab ? L.fontH + 3 : 0) + P.bounce + 1;
        g.mid = Math.round((g.th - wt) / 2);                     // slot centres line up here (from the plate left)
        g.labX = Math.round((g.th - labW) / 2); g.labY = pad + 1;
      }
      g.tail = 1 + pad;
      return g;
    }
    function widthOf(it) { return it.div ? 5 : it.cur ? G.B : G.s; }
    function layoutOffsets(list) {
      var off = [], p = 0;
      for (var i = 0; i < list.length; i++) { off.push(p); p += (list[i].div ? 5 : list[i].cur ? G.B : G.s) + P.gap; }
      return { off: off, end: list.length ? p - P.gap : 0 };
    }
    function viewLen() { var V = view || { w: 256, h: 224 }; return (horiz() ? V.w : V.h) - 2 * P.margin; }

    /* ---------- order ---------- */
    function setOrder(ids, o) {
      try { return setOrderRaw(ids, o); } catch (e) { warn('setOrder', 'setOrder failed: ' + e.message); }
    }
    function setOrderRaw(ids, o) {
      o = o || {};
      if (ids != null && !Array.isArray(ids)) { if (typeof ids.length === 'number') ids = Array.prototype.slice.call(ids); else ids = [ids]; }
      // waits: {id: n} (shown on that unit's first slot) or an array parallel to ids (null = none)
      var WA = Array.isArray(o.waits) ? o.waits : null, WM = !WA && o.waits && typeof o.waits === 'object' ? o.waits : null;
      var list = [], i, seen = {};
      for (i = 0; i < (ids ? ids.length : 0); i++) {
        var id = idOf(ids[i]); if (id == null || id === '') continue;
        var w = null;
        if (id !== BREAK) { if (WA) w = WA[i]; else if (WM && !seen[String(id)]) w = WM[String(id)]; seen[String(id)] = 1; }
        list.push({ id: id, w: w == null || !isFinite(Number(w)) ? null : Number(w) });
      }
      var cur = o.current !== undefined ? idOf(o.current) : current;
      if (cur != null && cur !== BREAK && !list.some(function (e) { return e.id === cur; })) list.unshift({ id: cur, w: WM && WM[String(cur)] != null ? Number(WM[String(cur)]) : null });
      while (list.length && list[0].id === BREAK) list.shift();
      for (i = list.length - 1; i > 0; i--) if (list[i].id === BREAK && list[i - 1].id === BREAK) list.splice(i, 1);
      if (list.length && list[list.length - 1].id === BREAK) list.pop();
      if (o.dead) [].concat(o.dead).forEach(function (d) { d = idOf(d); if (d != null) dead[String(d)] = clock; });
      for (var dk in dead) if (clock - dead[dk] > 1500) delete dead[dk];   // a death mark is only used by the next removal
      current = cur == null || cur === BREAK ? null : cur;
      lastIds = list;
      waitsOn = list.some(function (e) { return e.w != null; });
      var key = list.map(function (e) { return e.id === BREAK ? BREAK : 'u' + String(e.id); }).join(',') + '#' + (current == null ? '' : String(current)) + '#' + P.layout + P.size + P.gap + P.slots + P.label + P.waits + (waitsOn ? 'w' : '');
      if (key !== seqKey) { seqKey = key; rebuild(list); }
      for (i = 0; i < items.length; i++) if (items[i].state !== 'out' && items[i].src != null && list[items[i].src]) items[i].wait = list[items[i].src].w;
    }
    function relayout() { seqKey = null; setOrderRaw(lastIds, { waits: lastIds.map(function (e) { return e.w; }) }); }
    function rebuild(list) {
      G = geom();
      // how many fit (the current slot is bigger); the rest becomes "+N"
      if (!obsRead) readObstacles();
      var room = Math.min(viewLen(), freeRun(G.th)) - G.axis0 - G.tail, units = 0, used = 0, vis = [], curDone = false;
      for (var i = 0; i < list.length; i++) {
        var isDiv = list[i].id === BREAK, isCur = !isDiv && !curDone && current != null && list[i].id === current;
        var w = isDiv ? 5 : isCur ? G.B : G.s, need = used + (vis.length ? P.gap : 0) + w + (i < list.length - 1 ? P.gap + 13 : 0);
        if (units >= P.slots || need > room) break;
        if (isCur) curDone = true;
        vis.push({ id: list[i].id, div: isDiv, cur: isCur, src: i }); used += (vis.length > 1 ? P.gap : 0) + w; if (!isDiv) units++;
      }
      while (vis.length && vis[vis.length - 1].div) vis.pop();
      var shownUnits = vis.filter(function (v) { return !v.div; }).length, total = list.filter(function (x) { return x.id !== BREAK; }).length;
      overflow = Math.max(0, total - shownUnits);
      visibleIds = vis.filter(function (v) { return !v.div; }).map(function (v) { return v.id; });
      // match the new sequence to the live items (longest common subsequence keeps everyone who only slides)
      var old = items.filter(function (it) { return it.state !== 'out'; }).sort(function (a, b) { return a.idx - b.idx; });
      var n = old.length, m = vis.length, dp = [], a, b;
      var same = function (it, v) { return it.div ? v.div : !v.div && it.id === v.id; };
      for (a = 0; a <= n; a++) { dp.push(new Array(m + 1).fill(0)); }
      for (a = n - 1; a >= 0; a--) for (b = m - 1; b >= 0; b--) dp[a][b] = same(old[a], vis[b]) ? dp[a + 1][b + 1] + 1 : Math.max(dp[a + 1][b], dp[a][b + 1]);
      var match = new Array(m).fill(null), used2 = new Array(n).fill(false);
      a = 0; b = 0;
      while (a < n && b < m) { if (same(old[a], vis[b])) { match[b] = old[a]; used2[a] = true; a++; b++; } else if (dp[a + 1][b] >= dp[a][b + 1]) a++; else b++; }
      // the same unit at a different place: it hops over the others instead of leaving and coming back
      for (b = 0; b < m; b++) if (!match[b] && !vis[b].div) for (a = 0; a < n; a++) if (!used2[a] && !old[a].div && old[a].id === vis[b].id) { match[b] = old[a]; used2[a] = true; match[b].hop = true; emit({ event: 'move', id: vis[b].id }); break; }
      var firstShow = !old.length, lastMatched = -1;
      for (b = 0; b < m; b++) if (match[b]) lastMatched = b;
      var lo = layoutOffsets(vis), born = 0;
      var usedDead = [];
      for (a = 0; a < n; a++) if (!used2[a]) {
        var it = old[a], kind = it.div ? 'drop' : dead[String(it.id)] != null ? 'dead' : it.cur || it.idx === 0 ? 'advance' : 'drop';
        it.state = 'out'; it.kind = kind; it.a = 0; it.delay = 0; if (kind === 'dead') usedDead.push(String(it.id));
        emit({ event: 'remove', id: it.id, kind: kind });
      }
      usedDead.forEach(function (d) { delete dead[d]; });
      for (b = 0; b < m; b++) {
        var v = vis[b], x = match[b];
        if (!x) {
          x = { key: ++serial, id: v.id, div: v.div, state: 'in', a: 0, pos: lo.off[b], from: lo.off[b], to: lo.off[b], t: 1, dur: 0, sz: v.cur ? G.B : G.s, szFrom: 0, szTo: 0, szT: 1 };
          x.kind = firstShow ? 'pop' : b > lastMatched ? 'tail' : 'pop';
          x.delay = firstShow ? born * 45 : x.kind === 'tail' ? (b - lastMatched - 1) * 40 : 0;
          if (x.kind === 'tail') { x.pos = x.from = x.to = lo.off[b] + G.s; }
          if (!v.div) born++;
          items.push(x);
          emit({ event: 'insert', id: v.id, kind: x.kind });
        }
        x.idx = b; x.src = v.src; x.cur = v.cur; x.team = v.div ? 'n' : teamOf(v.id);
        retarget(x, lo.off[b]);
        var szTo = v.div ? 5 : v.cur ? G.B : G.s;
        if (x.szTo !== szTo) { x.szFrom = x.sz; x.szTo = szTo; x.szT = 0; }
      }
      var len = G.axis0 + lo.end + (overflow ? P.gap + tinyW('+' + overflow) + 5 : 0) + G.tail;
      if (!m) len = plate.lenTo;   // emptied: keep the size and fade the whole strip out with its last slots
      if (plate.vis <= 0 && m) { plate.len = plate.lenFrom = plate.lenTo = len; plate.lenT = 1; }   // reopening: no stale size
      if (plate.lenTo !== len) { plate.lenFrom = plate.len || len; plate.lenTo = len; plate.lenT = plate.len ? 0 : 1; if (!plate.len) plate.len = len; }
      if (m) { shown = true; everShown = true; } else shown = false;
      placeTick = 0;
      emit({ event: 'order', ids: visibleIds.slice(), current: current, overflow: overflow });
    }
    function retarget(it, to) {
      if (it.to === to && it.t >= 1) return;
      if (it.to === to) return;
      it.from = it.pos; it.to = to; it.t = 0; it.dur = P.slide;
    }

    /* ---------- placement: along the chosen edge, off the HUD rects, sticky ---------- */
    function readObstacles() {
      var out = [];
      if (typeof opt.getObstacles === 'function') {
        var r = null;
        try { r = opt.getObstacles(); } catch (e) { warn('getObstacles', 'getObstacles() threw: ' + e.message); }
        if (r && typeof r.length === 'number') for (var i = 0; i < r.length; i++) { var n = normRect(r[i]); if (n) out.push(n); }
        else if (r != null) warn('getObstaclesType', 'getObstacles() should return an array of {x, y, w, h, id?}');
      }
      obstacles = out; obsRead = true;
    }
    function plateRectAt(x, y) { return horiz() ? { x: x, y: y, w: plate.lenTo, h: G.th } : { x: x, y: y, w: G.th, h: plate.lenTo }; }
    function score(r, prefAxis, edgeCross) {
      var s = 0, i, o;
      for (i = 0; i < obstacles.length; i++) {
        o = obstacles[i]; var ov = area(r, o);
        if (!ov) continue;
        s += o.id == null && !o.soft ? 4000 + ov * 50 : ov;
      }
      var H = horiz();
      s += Math.abs((H ? r.x : r.y) - prefAxis) * 0.6 + Math.abs((H ? r.y : r.x) - edgeCross) * 4;
            return s;
    }
    // where the strip can sit across the edge: on the edge, or just past a HUD rect that sits on it
    function crossesFor(th) {
      var V = view || { x: 0, y: 0, w: 256, h: 224 }, m = P.margin, H = horiz();
      var edge = P.layout === 'top' ? V.y + m : P.layout === 'bottom' ? V.y + V.h - m - th : P.layout === 'left' ? V.x + m : V.x + V.w - m - th, list = [edge];
      for (var i = 0; i < obstacles.length; i++) {
        var o = obstacles[i]; if (o.id != null || o.soft) continue;
        var c = P.layout === 'top' ? o.y + o.h + m : P.layout === 'bottom' ? o.y - m - th : P.layout === 'left' ? o.x + o.w + m : o.x - m - th;
        var lo = H ? V.y : V.x, hi = (H ? V.y + V.h : V.x + V.w) - th;
        if (c >= lo && c <= hi && Math.abs(c - edge) <= (H ? V.h : V.w) / 2) list.push(c);
      }
      return { edge: edge, list: list };
    }
    // the longest run along the edge that no HUD rect blocks (so a side column stops above a bottom panel)
    function freeRun(th) {
      var V = view || { x: 0, y: 0, w: 256, h: 224 }, m = P.margin, H = horiz(), a0 = (H ? V.x : V.y) + m, a1 = (H ? V.x + V.w : V.y + V.h) - m, best = 0;
      crossesFor(th).list.forEach(function (c) {
        var band = H ? { x: V.x, y: c, w: V.w, h: th } : { x: c, y: V.y, w: th, h: V.h }, cuts = [];
        obstacles.forEach(function (o) { if (o.id == null && !o.soft && hit(band, o)) cuts.push(H ? [o.x - m, o.x + o.w + m] : [o.y - m, o.y + o.h + m]); });
        cuts.sort(function (p, q) { return p[0] - q[0]; });
        var at = a0;
        cuts.forEach(function (k) { if (k[0] > at) best = Math.max(best, Math.min(k[0], a1) - at); at = Math.max(at, k[1]); });
        if (a1 > at) best = Math.max(best, a1 - at);
      });
      return best;
    }
    function place(force, snap) {
      if (!G || !plate.lenTo) return;
      var V = view || { x: 0, y: 0, w: 256, h: 224 }, m = P.margin, H = horiz(), len = plate.lenTo, th = G.th;
      var aMin = (H ? V.x : V.y) + m, aMax = (H ? V.x + V.w : V.y + V.h) - m - len;
      if (aMax < aMin) aMax = aMin;
      var pref = P.align === 'center' ? Math.round((aMin + aMax) / 2) : P.align === 'end' ? aMax : aMin;
      var X = crossesFor(th), edge = X.edge, crosses = X.list;
      var curX = plate.px, curY = plate.py, best = null, bs = Infinity;
      var axes = [pref, aMin, aMax];
      for (var p = aMin; p <= aMax; p += 4) axes.push(p);
      for (var oi = 0; oi < obstacles.length; oi++) { var ob = obstacles[oi]; if (ob.id != null || ob.soft) continue; axes.push(H ? ob.x + ob.w + m : ob.y + ob.h + m, H ? ob.x - m - len : ob.y - m - len); }
      axes = axes.filter(function (v) { return v >= aMin && v <= aMax; });
      for (var ci = 0; ci < crosses.length; ci++) for (var ai = 0; ai < axes.length; ai++) {
        var ax = Math.round(axes[ai]), cr = Math.round(crosses[ci]), r = H ? plateRectAt(ax, cr) : plateRectAt(cr, ax);
        var sc = score(r, pref, edge);
        if (sc < bs) { bs = sc; best = r; }
      }
      if (curX != null && !force) {
        var keep = plateRectAt(curX, curY);
        // stay unless the current spot now covers a HUD rect or slides off the view
        if (score(keep, pref, edge) <= bs + 300 && keep.x >= V.x && keep.y >= V.y && keep.x + keep.w <= V.x + V.w + 0.5 && keep.y + keep.h <= V.y + V.h + 0.5) return;
      }
      if (!best) return;
      if (plate.px == null || !everShownPlaced) { plate.px = plate.fromX = plate.toX = best.x; plate.py = plate.fromY = plate.toY = best.y; plate.pT = 1; everShownPlaced = true; emit({ event: 'place', x: best.x, y: best.y }); return; }
      if (best.x !== plate.toX || best.y !== plate.toY) {
        plate.fromX = plate.x; plate.fromY = plate.y; plate.toX = best.x; plate.toY = best.y; plate.pT = snap ? 1 : 0; plate.px = best.x; plate.py = best.y;
        emit({ event: 'place', x: best.x, y: best.y });
      }
    }
    var everShownPlaced = false;

    /* ---------- clock ---------- */
    function update(dt) {
      try { updateRaw(dt); } catch (e) { warn('update', 'update failed: ' + e.message); }
    }
    function updateRaw(dt) {
      dt = num(dt, FRAME); if (dt < 0) dt = 0; if (dt > 250) dt = 250;
      updates++; drawsSinceUpdate = 0; clock += dt;
      if (!G) G = geom();
      readObstacles();
      // a HUD rect (no id) now under the strip: step off it at once, without sliding through it
      if (plate.px != null && G && plate.lenTo) { var hr = plateRectAt(plate.toX, plate.toY), hardHit = false; for (var hi = 0; hi < obstacles.length; hi++) if (obstacles[hi].id == null && !obstacles[hi].soft && hit(hr, obstacles[hi])) { hardHit = true; break; } if (hardHit) { place(false, true); placeTick = 30; } }
      if (placeTick-- <= 0) { place(false); placeTick = 30; }
      // plate slide and length
      if (plate.pT < 1) { plate.pT = P.slide ? Math.min(1, plate.pT + dt / P.slide) : 1; }
      var e = easeOut(plate.pT); plate.x = Math.round(plate.fromX + (plate.toX - plate.fromX) * e); plate.y = Math.round(plate.fromY + (plate.toY - plate.fromY) * e);
      if (plate.px == null) { plate.x = plate.y = 0; }
      if (plate.lenT < 1) plate.lenT = P.slide ? Math.min(1, plate.lenT + dt / P.slide) : 1;
      var lenNow = plate.lenFrom + (plate.lenTo - plate.lenFrom) * easeOut(plate.lenT);
      for (var i = items.length - 1; i >= 0; i--) {
        var it = items[i];
        if (it.t < 1) { it.t = it.dur ? Math.min(1, it.t + dt / it.dur) : 1; }
        var k = easeOut(it.t); it.pos = it.from + (it.to - it.from) * k; if (it.t >= 1) it.hop = false;
        if (it.szT < 1) { it.szT = P.slide ? Math.min(1, it.szT + dt / Math.max(1, P.slide * 0.6)) : 1; it.sz = it.szFrom + (it.szTo - it.szFrom) * easeOut(it.szT); }
        if (it.delay > 0) { it.delay -= dt; if (it.delay > 0) continue; it.delay = 0; }
        if (it.state === 'in') { it.a += dt; if (it.a >= P.pop) it.state = 'live'; }
        else if (it.state === 'out') { it.a += dt; if (it.a >= outDur(it)) { items.splice(i, 1); continue; } }
      }
      plate.len = lenNow;
      // open / close (stepped), and fade when a sprite is under the bar
      var target = shown ? 1 : 0;
      if (target > plate.vis) plate.vis = Math.min(1, plate.vis + dt / 120); else if (target < plate.vis) plate.vis = Math.max(0, plate.vis - dt / 160);
      var under = false;
      if (P.fade !== 'off' && plate.vis > 0) { var pr = plateRect(); for (var j = 0; j < obstacles.length; j++) if (obstacles[j].id != null && area(pr, obstacles[j]) >= 8) { under = true; break; } }
      plate.hold = under ? 500 : Math.max(0, (plate.hold || 0) - dt);   // stay faded 0.5 s after the sprite leaves (no flicker)
      var at = plate.hold > 0 ? 0.5 : 1;
      plate.alpha = at < plate.alpha ? Math.max(at, plate.alpha - dt / 200) : Math.min(at, plate.alpha + dt / 200);
    }
    function outDur(it) { return it.kind === 'dead' ? P.pop * 1.8 + 1 : P.pop + 1; }
    function plateRect() { var len = Math.round(plate.len || plate.lenTo || 0); return horiz() ? { x: plate.x, y: plate.y, w: len, h: G ? G.th : 0 } : { x: plate.x, y: plate.y, w: G ? G.th : 0, h: len }; }

    /* ---------- drawing ---------- */
    function step4(a) { return a >= 0.99 ? 1 : a >= 0.7 ? 0.75 : a >= 0.4 ? 0.5 : a > 0.05 ? 0.25 : 0; }
    function slotRect(it) {
      var sz = Math.round(it.sz), pos = Math.round(it.pos), r;
      if (G.H) r = { x: plate.x + G.axis0 + pos, y: plate.y + G.base - sz, w: it.div ? 5 : sz, h: it.div ? G.B : sz };
      else r = { x: plate.x + G.mid - Math.round(sz / 2), y: plate.y + G.axis0 + pos, w: it.div ? G.B : sz, h: it.div ? 5 : sz };
      if (it.div) { if (G.H) { r.y = plate.y + G.base - G.B; r.w = 5; } else { r.x = plate.x + G.mid - Math.round(G.B / 2); r.h = 5; } }
      if (it.hop && it.t < 1) { var h = -Math.round(Math.sin(Math.PI * easeOut(it.t)) * 3); if (G.H) r.y += h; else r.x -= h; }
      return r;
    }
    function bounceOf(it) {
      if (!it.cur || !P.bounce || it.state !== 'live') return 0;
      var f = Math.floor(clock / FRAME) % 40, b = f < 4 ? 1 : f < 10 ? 2 : f < 14 ? 1 : 0;
      return -Math.round(b * P.bounce / 2);
    }
    function frameRect(g, r, light, mid) {
      g.fillStyle = mid; g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle = light; g.fillRect(r.x, r.y, r.w - 1, 1); g.fillRect(r.x, r.y, 1, r.h - 1);
    }
    function portrait(g, it, r) {
      var drew = false;
      if (P.portrait !== 'token' && typeof opt.drawPortrait === 'function' && !it.noPortrait) {
        g.save();
        try {
          g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
          var res = opt.drawPortrait(g, it.id, { x: r.x, y: r.y, w: r.w, h: r.h }, { team: it.team, current: it.cur });
          drew = res !== false;
        } catch (e) { it.noPortrait = true; warn('drawPortrait', 'drawPortrait(' + it.id + ') threw, using a token: ' + e.message); }
        g.restore();
      }
      if (!drew) {   // coloured token: a disc in the team colour with the unit's initial
        var T = L.team(it.team), cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = Math.max(3, Math.floor(Math.min(r.w, r.h) / 2) - 1);
        for (var yy = -rad; yy < rad; yy++) {
          var hw = Math.floor(Math.sqrt(rad * rad - (yy + 0.5) * (yy + 0.5)));
          g.fillStyle = yy < -rad / 3 ? T.light : yy < rad / 3 ? T.mid : T.dark; g.fillRect(Math.round(cx - hw), Math.round(cy + yy), hw * 2, 1);
        }
        if (r.w >= 9) L.initials(g, labelOf(it.id), cx, cy + 0.5, L.white);
      }
    }
    function drawSlot(g, it, r, alpha, out) {
      var pa = g.globalAlpha, T = L.team(it.team), cur = it.cur && it.state !== 'out', isHl = hl[String(it.id)] && it.state !== 'out';
      g.globalAlpha = pa * alpha;
      if (it.div) {   // round break: a dotted rule with a diamond
        var vert = G.H, cx = r.x + Math.floor(r.w / 2), cy = r.y + Math.floor(r.h / 2);
        g.fillStyle = L.dividerDim;
        for (var q = 2; q < (vert ? r.h : r.w) - 2; q += 2) { if (vert) g.fillRect(cx, r.y + q, 1, 1); else g.fillRect(r.x + q, cy, 1, 1); }
        g.fillStyle = L.divider; g.fillRect(cx - 1, cy, 3, 1); g.fillRect(cx, cy - 1, 1, 3);
        g.globalAlpha = pa; return;
      }
      if (r.w < 2 || r.h < 2) { g.globalAlpha = pa; return; }
      var ring = cur ? { light: L.gold.light, mid: L.gold.dark } : null;
      if (ring) { frameRect(g, { x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }, L.gold.edge, L.gold.edge); }
      var blink = Math.floor(clock / 133) % 2;
      var light = cur ? L.gold.light : T.light, mid = cur ? L.gold.mid : T.mid;
      if (isHl) { light = L.white; mid = blink ? L.white : T.light; }
      frameRect(g, r, light, mid);
      var inner = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };
      g.fillStyle = T.well; g.fillRect(inner.x, inner.y, inner.w, inner.h);
      if (inner.w >= 4 && inner.h >= 4) portrait(g, it, inner);
      // enter flash / death flash, drawn over the portrait
      if (it.state === 'in' && it.a < P.pop * 0.45) { g.globalAlpha = pa * alpha * 0.75; g.fillStyle = L.white; g.fillRect(inner.x, inner.y, inner.w, inner.h); g.globalAlpha = pa * alpha; }
      if (out && it.kind === 'dead') {
        var ph = it.a / outDur(it);
        if (ph < 0.45 && Math.floor(it.a / 66) % 2 === 0) { g.fillStyle = L.white; g.fillRect(inner.x, inner.y, inner.w, inner.h); }
        else { g.globalAlpha = pa * alpha * 0.55; g.fillStyle = L.dead; g.fillRect(inner.x, inner.y, inner.w, inner.h); g.globalAlpha = pa * alpha; }
        g.fillStyle = L.ink; for (var d = 1; d < inner.w - 1 && d < inner.h - 1; d++) { g.fillRect(inner.x + d, inner.y + d, 1, 1); g.fillRect(inner.x + inner.w - 1 - d, inner.y + d, 1, 1); }
      }
      if (cur) { g.fillStyle = L.gold.light; g.fillRect(r.x + 1, r.y + 1, 2, 1); g.fillRect(r.x + 1, r.y + 1, 1, 2); }
      g.globalAlpha = pa;
    }
    // wait number tab: hangs off the slot's lower right corner (3 px outside), drawn outside the slot clip
    function drawTab(g, it, r, alpha) {
      var wv = it.wait;
      if (!G.waits || wv == null || it.div || r.w < G.s - 1) return;
      var pa = g.globalAlpha, s = String(Math.round(num(wv, 0))).slice(0, 3), tw = tinyW(s) + 2, tx = r.x + r.w - tw + 1, ty = r.y + r.h - 4;
      if (!G.H) { tx = r.x + r.w - tw + 3; ty = r.y + r.h - 7; }
      if (G.tabOut) { if (G.H) { tx = r.x + Math.floor((r.w - tw) / 2); ty = r.y + r.h + 1; } else { tx = r.x + r.w + 1; ty = r.y + Math.floor((r.h - 7) / 2); } }
      g.globalAlpha = pa * alpha;
      g.fillStyle = L.tabFill; g.fillRect(tx, ty, tw, 7);
      tinyText(g, s, tx + 1, ty + 1, it.cur ? L.tabNow : L.tabText);
      g.globalAlpha = pa;
    }
    function draw(ctx, ox, oy) {
      drawn = [];
      if (!ctx || typeof ctx.fillRect !== 'function') return;
      try { drawRaw(ctx, num(ox, 0), num(oy, 0)); } catch (e) { warn('draw', 'draw failed: ' + e.message); try { ctx.restore(); } catch (er) { /* ignore */ } }
    }
    function drawRaw(g, ox, oy) {
      if (!view) { view = { x: 0, y: 0, w: g.canvas ? g.canvas.width : 256, h: g.canvas ? g.canvas.height : 224 }; if (g.canvas && g.canvas.width > 640) warn('view', 'no view given and the canvas is ' + g.canvas.width + ' px wide: pass view = native screen size'); if (G) relayout(); }
      if (++drawsSinceUpdate >= 8) { warn('noUpdate', 'draw() called without update(): call update(1000 / 60) once per game step; animating on draw calls instead'); updateRaw(FRAME); drawsSinceUpdate = 8; }
      if (!G || plate.vis <= 0 || plate.px == null) return;
      var va = step4(plate.vis) * (P.fade !== 'off' ? step4(plate.alpha) || 0.5 : 1);
      if (va <= 0) return;
      g.save(); g.translate(ox, oy); g.imageSmoothingEnabled = false;
      var pa = g.globalAlpha, pr = plateRect();
      if (pr.w < 4 || pr.h < 4) { g.restore(); return; }
      g.globalAlpha = pa * va;
      L.plate(g, pr, false);
      drawn.push({ kind: 'plate', x: pr.x, y: pr.y, w: pr.w, h: pr.h, alpha: va });
      if (G.lab) {
        if (G.H) L.label(g, G.lab, pr.x + G.labX, pr.y + G.labY);
        else L.label(g, G.lab, pr.x + G.labX, pr.y + G.labY);
      }
      // slots, clipped to the slot lane (front exits slide out under the label)
      var lane = G.H ? { x: pr.x + G.axis0 - 1, y: pr.y + 1, w: pr.w - G.axis0, h: pr.h - 2 } : { x: pr.x + 1, y: pr.y + G.axis0 - 1 - P.bounce, w: pr.w - 2, h: pr.h - G.axis0 + P.bounce };
      g.save(); g.beginPath(); g.rect(lane.x, lane.y, lane.w, lane.h); g.clip();
      var order = items.slice().sort(function (a, b) { return (a.state === 'out') - (b.state === 'out') || (a.cur ? 1 : 0) - (b.cur ? 1 : 0) || (a.hop ? 1 : 0) - (b.hop ? 1 : 0); });
      for (var i = 0; i < order.length; i++) {
        var it = order[i]; if (it.delay > 0) continue;
        var r = slotRect(it), alpha = 1, out = it.state === 'out';
        var b = bounceOf(it); if (G.H) r.y += b; else r.y += b;
        if (it.state === 'in') {
          var k = P.pop ? Math.min(1, it.a / P.pop) : 1;
          if (it.kind === 'tail') alpha = step4(k);
          else { var e = easeOut(k), w = Math.max(1, Math.round(r.w * e)), h = Math.max(1, Math.round(r.h * e)); r = { x: r.x + Math.floor((r.w - w) / 2), y: r.y + Math.floor((r.h - h) / 2), w: w, h: h }; }
        } else if (out) {
          var q = Math.min(1, it.a / outDur(it));
          if (it.kind === 'advance') { var dx = Math.round(easeOut(q) * (G.s + P.gap)); if (G.H) r.x -= dx; else r.y -= dx; alpha = step4(1 - q); }
          else if (it.kind === 'dead') { if (q > 0.45) { var qq = (q - 0.45) / 0.55, hh = Math.max(0, Math.round(r.h * (1 - qq))); r = { x: r.x, y: r.y + (r.h - hh), w: r.w, h: hh }; } alpha = q > 0.85 ? 0.5 : 1; }
          else { var s2 = 1 - easeOut(q), w2 = Math.round(r.w * s2), h2 = Math.round(r.h * s2); r = { x: r.x + Math.floor((r.w - w2) / 2), y: r.y + Math.floor((r.h - h2) / 2), w: w2, h: h2 }; }
          if (r.w < 1 || r.h < 1 || alpha <= 0) continue;
        }
        g.save(); g.beginPath(); g.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2); g.clip();
        drawSlot(g, it, r, alpha, out);
        g.restore();
        if (!out && it.state === 'live') drawTab(g, it, r, alpha);
        if (!it.div) drawn.push({ kind: 'slot', id: it.id, x: r.x, y: r.y, w: r.w, h: r.h, current: !!it.cur && !out, highlighted: !!hl[String(it.id)] && !out, state: it.state, team: it.team, exit: out ? it.kind : null });
      }
      g.restore();
      // "+N" more units than slots
      if (overflow > 0 && G) {
        var txt = '+' + overflow, tw = tinyW(txt), ex = 0, ey = 0;
        if (G.H) { ex = pr.x + pr.w - G.tail - tw - 3; ey = pr.y + G.base - 7; } else { ex = pr.x + Math.round((G.th - tw) / 2); ey = pr.y + pr.h - G.tail - 8; }
        g.fillStyle = L.tabFill; g.fillRect(ex - 1, ey - 1, tw + 3, 8);
        tinyText(g, txt, ex + 1, ey + 1, L.divider);
      }
      g.globalAlpha = pa; g.restore();
    }

    /* ---------- public ---------- */
    var api = {
      setOrder: setOrder,
      highlight: function (ids) {
        hl = {};
        if (ids == null) return;
        [].concat(ids).forEach(function (id) { id = idOf(id); if (id != null) hl[String(id)] = 1; });
      },
      update: update,
      draw: draw,
      clear: function () { items = []; seqKey = null; lastIds = []; current = null; waitsOn = false; dead = {}; hl = {}; shown = false; plate.vis = 0; plate.len = plate.lenTo = 0; overflow = 0; visibleIds = []; },
      hide: function () { setOrder([], { current: null }); },
      rect: function () { if (!G || plate.vis <= 0 || plate.px == null) return null; var r = plateRect(); return { x: r.x, y: r.y, w: r.w, h: r.h }; },
      rects: function () { var r = api.rect(); return r ? [r] : []; },
      slotAt: function (x, y) {
        for (var i = drawn.length - 1; i >= 0; i--) { var d = drawn[i]; if (d.kind === 'slot' && d.state !== 'out' && x >= d.x - 1 && x < d.x + d.w + 1 && y >= d.y - 1 && y < d.y + d.h + 1) return d.id; }
        return null;
      },
      order: function () { return visibleIds.slice(); },
      setParams: function (o) { setParamsRaw(o || {}); if (o && o.layout) P.layout = String(o.layout); plate.px = null; everShownPlaced = false; relayout(); readObstacles(); place(true); },
      setView: function (r) { view = normRect(r) || view; relayout(); place(true); },
      params: function () { var o = {}; for (var q in P) o[q] = P[q]; return o; },
      lastDrawn: function () { return drawn.slice(); },
      busy: function () { for (var i = 0; i < items.length; i++) if (items[i].state !== 'live' || items[i].t < 1) return true; return plate.pT < 1; }
    };
    return api;
  }

  /* ---------- helper: a drawPortrait callback that crops the host's own sprite ---------- */
  // GameDNA_TurnOrder.spritePortrait(getImage, {mode: 'auto'|'crop'|'fit', focusY: 0})
  //   getImage(id) -> image/canvas, or {img, flip, sx, sy, sw, sh} (a sprite-sheet cell). Returns drawPortrait(ctx, id, rect).
  //   auto: whole sprite when it fits; the head (top-centre crop) of a sprite up to 1.5x the slot; else the whole sprite at 1/2 (or 1/3).
  var BOX = typeof WeakMap === 'function' ? new WeakMap() : null;
  function bbox(img, sx, sy, sw, sh) {
    var key = sx + ',' + sy + ',' + sw + ',' + sh, m = BOX && BOX.get(img);
    if (m && m[key]) return m[key];
    var b = { x: sx, y: sy, w: sw, h: sh };
    try {
      var c = document.createElement('canvas'); c.width = sw; c.height = sh;
      var cg = c.getContext('2d'); cg.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      var d = cg.getImageData(0, 0, sw, sh).data, x0 = sw, y0 = sh, x1 = -1, y1 = -1;
      for (var y = 0; y < sh; y++) for (var x = 0; x < sw; x++) if (d[(y * sw + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 >= 0) b = { x: sx + x0, y: sy + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    } catch (e) { /* tainted or not ready: use the whole cell */ }
    if (BOX) { if (!m) { m = {}; BOX.set(img, m); } m[key] = b; }
    return b;
  }
  function spritePortrait(getImage, o) {
    o = o || {};
    return function (g, id, r) {
      var src = typeof getImage === 'function' ? getImage(id) : null;
      if (!src) return false;
      var img = src.img || src.image || src.canvas || src, flip = !!(src.flip || o.flip);
      if (!img || (img.width | 0) === 0) return false;
      var sx = src.sx | 0, sy = src.sy | 0, sw = src.sw || img.width, sh = src.sh || img.height, b = bbox(img, sx, sy, sw, sh), mode = src.mode || o.mode || 'auto';
      var dw, dh, cx = b.x, cy = b.y, cw = b.w, ch = b.h, div = 1;
      var crop = b.h <= r.h ? b.w <= r.w * 2 : b.w <= r.w * 1.75 && b.h <= r.h * 1.75;   // wide-short: centre crop; up to 1.75x: head crop
      if (mode === 'fit' || (mode === 'auto' && (b.w > r.w || b.h > r.h) && !crop)) {
        div = Math.max(2, Math.ceil(Math.max(b.w / r.w, b.h / r.h)));
      } else if (b.w > r.w || b.h > r.h) {   // crop: top-centre (the head)
        cw = Math.min(b.w, r.w); ch = Math.min(b.h, r.h);
        cx = Math.round(b.x + (b.w - cw) / 2); cy = Math.round(b.y + (b.h - ch) * (o.focusY || 0));
      }
      dw = Math.max(1, Math.floor(cw / div)); dh = Math.max(1, Math.floor(ch / div));
      var dx = r.x + Math.floor((r.w - dw) / 2), dy = div > 1 || ch < r.h ? r.y + r.h - dh - (r.h - dh > 2 ? 1 : 0) : r.y;
      var prev = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
      if (flip) { g.save(); g.translate(dx * 2 + dw, 0); g.scale(-1, 1); }
      g.drawImage(img, cx, cy, cw, ch, dx, dy, dw, dh);
      if (flip) g.restore();
      g.imageSmoothingEnabled = prev;
      return true;
    };
  }

  root.GameDNA_TurnOrder = { create: create, spritePortrait: spritePortrait, BREAK: BREAK, defaults: DEFAULTS, version: '1.0.0' };
})(typeof window !== 'undefined' ? window : this);
