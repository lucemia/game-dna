/* A-18 on-map-skirmish (GameDNA_OnMapSkirmish) v1.0.3 (cold r1: stand-off for every pair, drawn boxes never overlap; r2: no outline-only KO rows, narrower plates; r1: shaped spark core, smaller slam spark, team-tone KO shards, no lingering outline row, slimmer plates)
 * The attack exchange plays on the map itself: the small map units fight in place. The attacker lunges 2-3 px toward the
 * target (never into its tile), the hit spark lands on the target's side facing the attacker, only the target flashes a
 * solid white silhouette for 2-3 frames, then shows an opaque hurt pose and is knocked back 2 px; a damage number appears
 * above its head where it covers no other unit; a miss shows a white swish arc and MISS while the target sidesteps; the
 * counter and the follow-up play in the order the game decided; both HP plates sit at the bottom (or top) of the screen and
 * drain slowly; a boss braces in place instead of lunging and is not knocked back.
 * The game resolves the exchange with its own rules; the module only stages it. Everything on screen is a pure function of
 * the scene clock, which only update(dt) advances, so ?t=&freeze=1 replays match live play.
 * One classic script, ASCII only, no dependencies. Alternative to A-04 clash-cutin (side-view cut-in): same family.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.3';
  var DEFAULTS = { speed: 1, lunge: 3, knock: 2, flash: 3, drain: 520, hold: 420, gap: 4, standoff: 4, plates: 'auto', text: 'auto', keys: 'on' };

  /* ---------- timeline (ms at speed 1) ---------- */
  var OPEN = 260, WIND = 90, DASH = 80, IMPACT = WIND + DASH, HURT = 380, BACK0 = 110, BACK1 = 250, NUM_RISE = 170, NUM_FADE0 = 600,
    NUM_FADE1 = 720, STRIDE = 820, KO = 440, CLOSE = 220, SPARK = 190, SWISH = 230, DRAIN_DELAY = 110;
  var FRAME = 1000 / 60;

  /* ---------- 5x8 font (caps, digits; 7-row source glyphs stretched by one repeated stroke row) ---------- */
  var SRC = {
    '0': '.###. #...# #...# #...# #...# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
    '2': '.###. #...# ....# ...#. ..#.. .#... #####', '3': '####. ....# ....# .###. ....# ....# ####.',
    '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.', '5': '##### #.... ####. ....# ....# #...# .###.',
    '6': '..##. .#... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. .#... .#... .#...',
    '8': '.###. #...# #...# .###. #...# #...# .###.', '9': '.###. #...# #...# .#### ....# ...#. .##..',
    'A': '.###. #...# #...# ##### #...# #...# #...#', 'B': '####. #...# #...# ####. #...# #...# ####.',
    'C': '.###. #...# #.... #.... #.... #...# .###.', 'D': '###.. #..#. #...# #...# #...# #..#. ###..',
    'E': '##### #.... #.... ####. #.... #.... #####', 'F': '##### #.... #.... ####. #.... #.... #....',
    'G': '.###. #...# #.... #.### #...# #...# .####', 'H': '#...# #...# #...# ##### #...# #...# #...#',
    'I': '### .#. .#. .#. .#. .#. ###', 'J': '..### ...#. ...#. ...#. #..#. #..#. .##..',
    'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#', 'L': '#... #... #... #... #... #... ####',
    'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#', 'N': '#...# ##..# #.#.# #..## #...# #...# #...#',
    'O': '.###. #...# #...# #...# #...# #...# .###.', 'P': '####. #...# #...# ####. #.... #.... #....',
    'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#', 'R': '####. #...# #...# ####. #.#.. #..#. #...#',
    'S': '.#### #.... #.... .###. ....# ....# ####.', 'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
    'U': '#...# #...# #...# #...# #...# #...# .###.', 'V': '#...# #...# #...# #...# #...# .#.#. ..#..',
    'W': '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.', 'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', 'Z': '##### ....# ...#. ..#.. .#... #.... #####',
    '!': '# # # # # . #', '-': '.... .... .... ####', '.': '.. .. .. .. .. ## ##', "'": '# #', ':': '.. ## ## .. .. ## ##',
    '/': '....# ...#. ...#. ..#.. .#... .#... #....', '+': '..... ..#.. ..#.. ##### ..#.. ..#..', '?': '.###. #...# ....# ...#. ..#.. ..... ..#..'
  };
  var GLYPH = {};
  (function () {
    Object.keys(SRC).forEach(function (ch) {
      var r = SRC[ch].split(' '); while (r.length < 7) r.push(r[0].replace(/#/g, '.'));
      var dup = -1, i;
      for (i = 1; i <= 5; i++) if (r[i] === r[i + 1]) { dup = i; break; }
      if (dup < 0) dup = 3;
      r.splice(dup, 0, r[dup]);
      GLYPH[ch] = r;
    });
  })();
  var CAP = 8;
  function glyphW(ch, bold) { var g = GLYPH[ch]; return ch === ' ' ? 3 : g ? g[0].length + (bold ? 1 : 0) : 5; }
  function measure(str, sc, bold) {
    str = String(str).toUpperCase(); var w = 0;
    for (var i = 0; i < str.length; i++) w += glyphW(str[i], bold) + (i < str.length - 1 ? 1 : 0);
    return { w: (w + 2) * sc, h: (CAP + 2) * sc };   // + 1 px outline each side (at scale)
  }
  function textMask(str, bold) {
    str = String(str).toUpperCase(); var m = measure(str, 1, bold), w = m.w, h = m.h, a = new Uint8Array(w * h), cx = 1;
    for (var i = 0; i < str.length; i++) {
      var ch = str[i], g = GLYPH[ch] || (ch === ' ' ? null : GLYPH['?']);
      if (g) for (var y = 0; y < CAP; y++) for (var x = 0; x < g[y].length; x++) if (g[y][x] === '#') { a[(y + 1) * w + cx + x] = 1; if (bold) a[(y + 1) * w + cx + x + 1] = 1; }
      cx += glyphW(ch, bold) + 1;
    }
    return { w: w, h: h, a: a };
  }
  var INK = {
    dmg: ['#ffffff', '#d6e2ff', '#1a1430'], crit: ['#fff6a8', '#ffb238', '#3a1206'], miss: ['#e4eeff', '#9fb4e0', '#141c38'],
    name: ['#ffffff', '#e4e8f8', '#141024'], hp: ['#fff3c0', '#ffd25a', '#1c1208'], label: ['#f4f0e0', '#c8c0a8', '#141018'], x2: ['#fff6a8', '#ffcf4a', '#2a1406']
  };
  var textCache = {}, textCount = 0;
  function mkCanvas(w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c;
  }
  function textCanvas(str, sc, kind, bold) {
    var key = str + '|' + sc + '|' + kind + '|' + (bold ? 1 : 0); if (textCache[key]) return textCache[key];
    var M = textMask(str, bold), ink = INK[kind] || INK.dmg, c = mkCanvas(M.w * sc, M.h * sc); if (!c) return null;
    var g = c.getContext('2d'), x, y, on = function (x, y) { return x >= 0 && y >= 0 && x < M.w && y < M.h && M.a[y * M.w + x] === 1; };
    var split = 1 + Math.ceil(CAP * 0.5);
    for (y = 0; y < M.h; y++) for (x = 0; x < M.w; x++) {
      if (on(x, y)) { g.fillStyle = y < split ? ink[0] : ink[1]; g.fillRect(x * sc, y * sc, sc, sc); continue; }
      if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1) || on(x - 1, y - 1) || on(x + 1, y - 1) || on(x - 1, y + 1) || on(x + 1, y + 1)) { g.fillStyle = ink[2]; g.fillRect(x * sc, y * sc, sc, sc); }
    }
    if (++textCount > 160) { textCache = {}; textCount = 0; }
    return (textCache[key] = c);
  }

  /* ---------- helpers ---------- */
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function seg(t, a, b) { return b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a), 0, 1); }
  function eout(k) { return 1 - (1 - k) * (1 - k); }
  function eio(k) { return k * k * (3 - 2 * k); }
  function hit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function area(a, b) { var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; }
  function inflate(r, p) { return { x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p }; }
  function cx(r) { return r.x + r.w / 2; }
  function cy(r) { return r.y + r.h / 2; }
  function teamOf(t, role) {
    var s = t == null ? '' : String(t).toLowerCase();
    if (/^(a|player|blue|ally|hero|heroes|party|friend)$/.test(s)) return 'a';
    if (/^(b|enemy|red|foe|foes|monster|monsters)$/.test(s)) return 'b';
    if (/^(n|neutral|other|green)$/.test(s)) return 'n';
    return role === 'att' ? 'a' : 'b';
  }
  function rectOf(u) {
    var b = u.box || u.rect || u;
    var r = { x: num(b.x, NaN), y: num(b.y, NaN), w: num(b.w, 16), h: num(b.h, 16) };
    return isFinite(r.x) && isFinite(r.y) ? r : null;
  }
  function safe(fn, dflt) { try { var v = fn(); return v == null ? dflt : v; } catch (e) { return dflt; } }

  /* who strikes in what order: the attacker, the counter if the defender can, and a follow-up for the side whose speed is
     at least `gap` higher (the game may build its own list instead; the module stages any list it is given) */
  function order(o) {
    o = o || {}; var gap = num(o.gap, DEFAULTS.gap), a = num(o.attSpd, 0), d = num(o.defSpd, 0), counter = o.counter !== false, out = ['att'];
    if (counter) out.push('def');
    if (a - d >= gap) out.push('att');
    else if (counter && d - a >= gap) out.push('def');
    return out;
  }

  /* ---------- flash / hurt layers: offscreen copy, source-atop fill, so the result is opaque ---------- */
  var lowCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function lowestRow(img) {   // the lowest opaque row of an image (its outline), cached; the bottom row when unreadable
    var v = lowCache && lowCache.get(img); if (v != null) return v; v = img.height - 1;
    try { var c = mkCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0); var d = g.getImageData(0, 0, img.width, img.height).data;
      outer: for (var y = img.height - 1; y >= 0; y--) for (var x = 0; x < img.width; x++) if (d[(y * img.width + x) * 4 + 3] > 0) { v = y; break outer; } } catch (e) { }
    if (lowCache) lowCache.set(img, v); return v;
  }
  var layerCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function tinted(img, flip, color, k) {
    if (!img || !img.width) return null;
    var key = (flip ? 'f' : 'n') + color + k, m = layerCache && layerCache.get(img);
    if (m && m[key]) return m[key];
    var c = mkCanvas(img.width, img.height); if (!c) return null;
    var g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    if (flip) { g.translate(img.width, 0); g.scale(-1, 1); }
    g.drawImage(img, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = k; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    if (layerCache) { if (!m) { m = {}; layerCache.set(img, m); } m[key] = c; }
    return c;
  }

  function create(opts) {
    opts = opts || {};
    var P = {};
    function setParams(p) {
      p = p || {};
      Object.keys(DEFAULTS).forEach(function (k) { P[k] = p[k] != null && p[k] !== '' ? p[k] : (P[k] != null ? P[k] : DEFAULTS[k]); });
      P.speed = num(P.speed, 1) >= 2 ? 2 : 1;
      P.lunge = clamp(Math.round(num(P.lunge, 3)), 2, 3);
      P.knock = clamp(Math.round(num(P.knock, 2)), 0, 3);
      P.flash = clamp(Math.round(num(P.flash, 3)), 2, 3);
      P.drain = clamp(num(P.drain, 520), 0, 1500);
      P.hold = clamp(num(P.hold, 420), 0, 2000);
      P.gap = clamp(Math.round(num(P.gap, 4)), 1, 20);
      P.standoff = clamp(Math.round(num(P.standoff, 4)), 0, 6);
    }
    setParams(opts.params);
    var S = { busy: false, t: 0, plan: null, speed: P.speed, stats: { plays: 0, refused: 0, done: 0, skips: 0, mismatches: 0, errors: 0, actorDraws: 0 }, gone: {}, lastActor: {} };

    function view() { var v = safe(function () { return typeof opts.view === 'function' ? opts.view() : opts.view; }, null) || {}; return { x: num(v.x, 0), y: num(v.y, 0), w: num(v.w, 256), h: num(v.h, 224) }; }
    function cam() { if (!opts.camera) return { x: 0, y: 0 }; var c = safe(opts.camera, null) || {}; return { x: num(c.x, 0), y: num(c.y, 0) }; }
    function cssPerPx(ctx) {
      if (opts.cssPerPx != null) return num(typeof opts.cssPerPx === 'function' ? safe(opts.cssPerPx, 2) : opts.cssPerPx, 2);
      var c = ctx && ctx.canvas; if (c && c.clientWidth > 0 && c.width > 0) return c.clientWidth / c.width;
      return 2;
    }
    function textScale(k) { if (P.text === '1' || P.text === 1) return 1; if (P.text === '2' || P.text === 2) return 2; return CAP * k >= 10 ? 1 : 2; }

    /* ---------- planning: everything is laid out once, at play(), because the world is paused while busy ---------- */
    function build(spec, ctx) {
      var A = spec.attacker, D = spec.defender, c0 = cam();
      var fa = { role: 'att', id: A.id, name: String(A.name || 'Unit'), team: teamOf(A.team, 'att'), max: Math.max(1, num(A.max, num(A.hp, 1))), hp0: num(A.hp, 1), boss: !!A.boss, box: rectOf(A) };
      var fd = { role: 'def', id: D.id, name: String(D.name || 'Unit'), team: teamOf(D.team, 'def'), max: Math.max(1, num(D.max, num(D.hp, 1))), hp0: num(D.hp, 1), boss: !!D.boss, box: rectOf(D) };
      if (!fa.box || !fd.box) return null;
      var F = { att: fa, def: fd };
      // direction attacker -> defender (screen), unit vector
      var dx = cx(fd.box) - cx(fa.box), dy = cy(fd.box) - cy(fa.box), L = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / L, uy = dy / L;
      fa.dir = { x: ux, y: uy }; fd.dir = { x: -ux, y: -uy };
      fa.facing = dx > 0.5 ? 'right' : dx < -0.5 ? 'left' : null; fd.facing = dx > 0.5 ? 'left' : dx < -0.5 ? 'right' : null;
      fa.dir4 = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up');
      fd.dir4 = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'left' : 'right') : (dy >= 0 ? 'up' : 'down');
      // stand-off (every exchange): the two drawn boxes never overlap. Along the attack axis the module steps the fighters
      // apart (eased in at the open, out at the close; the game's own positions are never touched) so that at rest they are
      // at least lunge + 1 px apart (>= 2 px), so a lunge stops short of the target's box. A boss stays put and its opponent
      // takes the whole step, at least `standoff` px when they touch.
      [fa, fd].forEach(function (f) { f.stand = { x: 0, y: 0 }; f.standPx = 0; });
      (function () {
        var A = fa.box, B = fd.box, ddx = cx(B) - cx(A), ddy = cy(B) - cy(A), horiz = Math.abs(ddx) >= Math.abs(ddy);
        var gapAxis = horiz ? Math.abs(ddx) - (A.w + B.w) / 2 : Math.abs(ddy) - (A.h + B.h) / 2;
        var perp = horiz ? Math.abs(ddy) < (A.h + B.h) / 2 : Math.abs(ddx) < (A.w + B.w) / 2;
        if (!perp) return;
        var need = Math.max(2, P.lunge + 1), oneBoss = (fa.boss || fd.boss) && !(fa.boss && fd.boss);
        if (oneBoss && gapAxis < 2) need = Math.max(need, P.standoff + gapAxis);
        var push = Math.max(0, Math.ceil(need - gapAxis)); if (!push) return;
        var sg = (horiz ? ddx : ddy) >= 0 ? 1 : -1, pa, pd;
        if (oneBoss) { pa = fa.boss ? 0 : push; pd = fd.boss ? 0 : push; }
        else { pa = Math.floor(push / 2); pd = push - pa; }
        pa = Math.min(pa, 12); pd = Math.min(pd, 12);
        if (horiz) { fa.stand.x = -sg * pa; fd.stand.x = sg * pd; } else { fa.stand.y = -sg * pa; fd.stand.y = sg * pd; }
        fa.standPx = pa; fd.standPx = pd;
      })();
      // strikes: hp per strike, follow-ups, KO
      var hp = { att: fa.hp0, def: fd.hp0 }, staged = [], cnt = { att: 0, def: 0 }, ko = null, list = spec.strikes || [];
      for (var i = 0; i < list.length; i++) {
        var s = list[i] || {}, by = s.by === 'def' ? 'def' : 'att', tg = by === 'att' ? 'def' : 'att';
        if (ko) { S.stats.dropped = (S.stats.dropped || 0) + 1; break; }
        var res = s.result === 'miss' ? 'miss' : s.result === 'crit' ? 'crit' : 'hit', dmg = res === 'miss' ? 0 : Math.max(0, Math.round(num(s.dmg, 0)));
        var before = hp[tg]; hp[tg] = Math.max(0, before - dmg); cnt[by]++;
        var st = { i: staged.length, by: by, target: tg, result: res, dmg: dmg, before: before, after: hp[tg], follow: s.follow != null ? !!s.follow : cnt[by] > 1, ko: hp[tg] <= 0 && before > 0 };
        if (st.ko) ko = tg;
        staged.push(st);
      }
      var after = spec.after || {}, fin = { att: num(after.att, hp.att), def: num(after.def, hp.def) };
      if (fin.att !== hp.att || fin.def !== hp.def) S.stats.mismatches++;
      fa.hp1 = fin.att; fd.hp1 = fin.def;
      fa.x2 = cnt.att > 1; fd.x2 = cnt.def > 1;
      // timeline
      var t = OPEN;
      staged.forEach(function (st) { st.t0 = t; st.tImp = t + IMPACT; t += STRIDE; });
      var tEnd = staged.length ? staged[staged.length - 1].t0 + STRIDE - 100 : OPEN;
      if (ko) tEnd = Math.max(tEnd, staged[staged.length - 1].tImp + HURT + KO);
      tEnd += P.hold;
      var plan = { F: F, staged: staged, ko: ko, tEnd: tEnd, tClose: tEnd + CLOSE, final: fin, onDone: spec.onDone, onImpact: spec.onImpact };
      // drain schedule per fighter (sequential: a later drain starts where the previous ended)
      ['att', 'def'].forEach(function (k) {
        var ready = 0, f = F[k]; f.drains = [];
        staged.forEach(function (st) { if (st.target !== k || st.result === 'miss') return; var s0 = Math.max(st.tImp + DRAIN_DELAY, ready); f.drains.push({ t0: s0, t1: s0 + P.drain, a: st.before, b: st.after }); ready = s0 + P.drain; });
        if (f.drains.length) { var last = f.drains[f.drains.length - 1]; if (last.b !== f.hp1) f.drains.push({ t0: last.t1, t1: last.t1 + P.drain, a: last.b, b: f.hp1 }); }
        else if (f.hp1 !== f.hp0) f.drains.push({ t0: OPEN, t1: OPEN + P.drain, a: f.hp0, b: f.hp1 });
      });
      // the exchange ends only after every bar has finished draining
      var dEnd = 0; ['att', 'def'].forEach(function (k) { F[k].drains.forEach(function (d) { dEnd = Math.max(dEnd, d.t1); }); });
      if (dEnd + 120 + P.hold > plan.tEnd) { plan.tEnd = dEnd + 120 + P.hold; plan.tClose = plan.tEnd + CLOSE; }
      // layout: plates, then labels (screen px at play time; converted with the camera at draw)
      var k = cssPerPx(ctx), sc = textScale(k); plan.sc = sc; plan.cam = c0;
      var others = (safe(function () { return opts.getObstacles ? opts.getObstacles() : []; }, []) || []).map(function (r) { var q = rectOf(r); if (!q) return null; q.id = r.id; return q; })
        .filter(function (q) { return q && !(q.id != null && (String(q.id) === String(fa.id) || String(q.id) === String(fd.id))); });
      var ui = (safe(function () { return opts.uiRects ? opts.uiRects() : []; }, []) || []).map(rectOf).filter(Boolean);
      function scr(r) { return opts.camera ? { x: r.x - c0.x, y: r.y - c0.y, w: r.w, h: r.h } : { x: r.x, y: r.y, w: r.w, h: r.h }; }
      var reach = P.lunge + P.knock + 1;
      fa.sbox = scr(fa.box); fd.sbox = scr(fd.box);
      // the area each fighter covers during the exchange: its box at every offset it will take (sampled every 8 ms)
      var saved = S.plan; S.plan = plan;
      [fa, fd].forEach(function (f) {
        var x0 = 0, y0 = 0, x1 = 0, y1 = 0;
        for (var tt = 0; tt <= plan.tClose; tt += 8) { var o = poseAt(f, tt); if (o.ko >= 1) continue; x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x); y1 = Math.max(y1, o.y); }
        f.zone = { x: f.sbox.x + x0, y: f.sbox.y + y0, w: f.sbox.w + x1 - x0, h: f.sbox.h + y1 - y0 };
      });
      S.plan = saved;
      var oth = others.map(scr);
      plan.others = oth; plan.ui = ui;
      plan.plates = placePlates(F, oth, ui, sc);
      var blocks = [fa.zone, fd.zone].concat(oth).concat(ui).concat(plan.plates.rects);
      staged.forEach(function (st) {
        var tgt = F[st.target], txt = st.result === 'miss' ? 'MISS' : String(st.dmg), kind = st.result === 'miss' ? 'miss' : st.result === 'crit' ? 'crit' : 'dmg';
        var m = measure(txt, sc, kind !== 'miss');
        st.label = placeLabel(tgt, F[st.by], m.w, m.h, blocks, oth);
        st.label.text = txt; st.label.kind = kind; st.label.owner = tgt.id;
      });
      return plan;
    }

    function placePlates(F, oth, ui, sc) {
      var v = view(), m = 2, tw = Math.max(measure(F.att.name, sc).w, measure(F.def.name, sc).w);
      var h = (CAP + 2) * sc * 2 + 6, w = Math.min(Math.max(64 * sc, tw + 16 + 11 * sc), Math.floor((v.w - 2 * m - 14) / 2));
      if (w < tw + 14) w = Math.min(Math.floor((v.w - 2 * m - 2) / 2), tw + 14);
      var left = cx(F.att.sbox) <= cx(F.def.sbox) ? 'att' : 'def', right = left === 'att' ? 'def' : 'att';
      if (cx(F.att.sbox) === cx(F.def.sbox)) { left = 'att'; right = 'def'; }
      var yB = v.y + v.h - h - m, yT = v.y + m, xL = v.x + m, xR = v.x + v.w - m - w;
      var fighters = [inflate(F.att.zone, 5), inflate(F.def.zone, 5)];   // keep a margin so numbers fit beside or below the pair
      function cost(rs) {
        var c = 0; rs.forEach(function (r) {
          fighters.forEach(function (f) { if (hit(r, f)) c += 1000 + area(r, f); });
          oth.forEach(function (o) { if (hit(r, o)) c += 50 + area(r, o); });
          ui.forEach(function (o) { if (hit(r, o)) c += 200 + area(r, o); });
        }); return c;
      }
      var cands = [];
      var pref = P.plates === 'top' ? ['top', 'bottom'] : ['bottom', 'top'];
      pref.forEach(function (where) { var y = where === 'top' ? yT : yB; cands.push({ where: where, L: { x: xL, y: y, w: w, h: h }, R: { x: xR, y: y, w: w, h: h } }); });
      // split: each plate in its own corner (left fighter's plate on the left side)
      [[yB, yT], [yT, yB]].forEach(function (ys) { cands.push({ where: 'split', L: { x: xL, y: ys[0], w: w, h: h }, R: { x: xR, y: ys[1], w: w, h: h } }); });
      var best = null;
      cands.forEach(function (c, i) { c.cost = cost([c.L, c.R]) + i * 0.01; if (!best || c.cost < best.cost) best = c; });
      var out = { where: best.where, sc: sc, rects: [best.L, best.R] };
      out[left] = best.L; out[right] = best.R; out.leftRole = left;
      var md = best.where !== 'split' && xR - (xL + w) >= 10 && xR - (xL + w) <= 24 ? { x: Math.round(v.x + v.w / 2) - 5, y: best.L.y + Math.round(h / 2) - 5, w: 10, h: 10 } : null;
      if (md && (fighters.some(function (f) { return hit(md, f); }) || oth.some(function (o) { return hit(md, o); }))) md = null;
      out.medal = md; if (md) out.rects.push(md);
      out.cost = best.cost;
      return out;
    }

    function placeLabel(tgt, att, w, h, blocks, oth) {
      // grid search around the target: a spot is valid when it is inside the view, covers no other unit, fighter, plate or
      // HUD rect, does not sit on the target's own body and is nearer the target than any other unit; the valid spot
      // closest to "centred above the head" wins (spots beside or below cost more)
      var v = view(), b = tgt.zone, top = b.y, ccx = tgt.sbox.x + tgt.stand.x + tgt.sbox.w / 2, ccy = tgt.sbox.y + tgt.stand.y + tgt.sbox.h / 2, rise = 4;
      var body = { x: tgt.zone.x, y: tgt.zone.y + 2, w: tgt.zone.w, h: tgt.zone.h - 2 };   // wherever the target is pushed, the label is not on it
      var px0 = Math.round(ccx - w / 2), py0 = Math.round(top - h - 1 - rise), centres = [{ x: att.sbox.x + att.stand.x, y: att.sbox.y + att.stand.y, w: att.sbox.w, h: att.sbox.h }].concat(oth);
      var best = null, fallback = null;
      for (var dy = -24; dy <= 40; dy += 1) for (var dx = -36; dx <= 36; dx += 1) {
        var r = { x: px0 + dx, y: py0 + dy, w: w, h: h + rise };
        if (r.x < v.x || r.y < v.y || r.x + r.w > v.x + v.w || r.y + r.h > v.y + v.h) continue;
        var pen = Math.abs(dx) * 1 + (dy < 0 ? -dy * 1.5 : dy * 2.5);
        var cost = 0, i;
        for (i = 0; i < blocks.length; i++) if (blocks[i] !== tgt.zone && hit(r, blocks[i])) cost += 1000 + area(r, blocks[i]);
        if (hit(r, body)) cost += 500 + area(r, body);
        var lx = r.x + r.w / 2, ly = r.y + h / 2, dT = Math.hypot(lx - ccx, ly - ccy);   // centre of the label once risen
        for (i = 0; i < centres.length; i++) if (Math.hypot(lx - cx(centres[i]), ly - cy(centres[i])) < dT + 4) cost += 300;
        if (dT > 34) cost += (dT - 34) * 20;
        if (!cost) { if (!best || pen < best.pen) best = { x: r.x, y: r.y, pen: pen }; }
        else if (!fallback || cost + pen < fallback.k) fallback = { x: r.x, y: r.y, k: cost + pen };
        if (best && best.pen === 0) break;
      }
      var pick = best || fallback || { x: Math.round(clamp(px0, v.x, v.x + v.w - w)), y: Math.round(clamp(py0, v.y, v.y + v.h - h - rise)) };
      return { x: pick.x, y: pick.y + rise, w: w, h: h, rise: rise, clean: !!best };
    }

    /* ---------- the scene as a function of the clock ---------- */
    function poseAt(f, t) {
      var p = S.plan, o = { x: f.stand.x, y: f.stand.y, pose: 'idle', flash: false, hurt: false, ko: 0 };
      if (!p) return o;
      var tin = eio(seg(t, 0, OPEN * 0.7)), tout = 1 - eio(seg(t, p.tEnd, p.tClose));
      o.x = Math.round(f.stand.x * Math.min(tin, tout)); o.y = Math.round(f.stand.y * Math.min(tin, tout));
      for (var i = 0; i < p.staged.length; i++) {
        var st = p.staged[i], ls = t - st.t0; if (ls < 0 || ls > STRIDE) continue;
        var striker = p.F[st.by], tgt = p.F[st.target], d = striker.dir;
        if (striker === f) {
          if (f.boss) {   // brace: rise 2 px on the wind-up, slam back down on impact
            var up = ls < WIND ? eout(seg(ls, 0, WIND)) : ls < IMPACT ? 1 - seg(ls, WIND, IMPACT) : 0;
            o.y += -Math.round(2 * up); o.pose = ls < IMPACT ? 'brace' : ls < IMPACT + BACK1 ? 'attack' : 'idle';
          } else {
            var k = ls < WIND ? -0.34 * eout(seg(ls, 0, WIND)) : ls < IMPACT ? -0.34 + 1.34 * eout(seg(ls, WIND, IMPACT)) : ls < IMPACT + BACK0 ? 1 : 1 - eio(seg(ls, IMPACT + BACK0, IMPACT + BACK1));
            o.x += Math.round(d.x * P.lunge * k); o.y += Math.round(d.y * P.lunge * k);
            o.pose = ls >= WIND && ls < IMPACT + BACK1 ? 'attack' : 'idle';
          }
        } else if (tgt === f && ls >= IMPACT) {
          var li = ls - IMPACT;
          if (st.result === 'miss') {   // sidestep across the swing (perpendicular), no flash, no hurt pose
            var px = -d.y, py = d.x; if (py > 0.01 || (Math.abs(py) <= 0.01 && px < 0)) { px = -px; py = -py; }   // step up / right across the swing
            var s = li < 70 ? eout(seg(li, 0, 70)) : 1 - eio(seg(li, 200, 360));
            o.x += Math.round(px * 2 * s); o.y += Math.round(py * 2 * s) - (s > 0.5 ? 1 : 0);
            if (li < 360) o.pose = 'dodge';
          } else {
            var flashMs = P.flash * FRAME;
            if (li < flashMs) o.flash = true;
            if (li < HURT || (st.ko)) { o.hurt = true; o.pose = 'hurt'; }
            if (!f.boss) { var kb = li < 60 ? eout(seg(li, 0, 60)) : 1 - eio(seg(li, 200, 360)); if (st.ko) kb = li < 60 ? eout(seg(li, 0, 60)) : 1; o.x += Math.round(d.x * P.knock * kb); o.y += Math.round(d.y * P.knock * kb); }
            else if (li < HURT) o.pose = 'brace';
          }
        }
      }
      // KO: after the killing blow the sprite dissolves from the top down
      if (p.ko && p.F[p.ko] === f) {
        var kst = p.staged.filter(function (s) { return s.ko; })[0];
        if (kst && t >= kst.tImp) { o.hurt = true; o.pose = 'hurt'; var kk = seg(t, kst.tImp + HURT, kst.tImp + HURT + KO); o.ko = kk; if (t < kst.tImp + P.flash * FRAME) o.flash = true; else o.flash = false;
          var dko = p.F[kst.by].dir; if (!f.boss) { o.x = f.stand.x + Math.round(dko.x * P.knock); o.y = f.stand.y + Math.round(dko.y * P.knock); } }
      }
      return o;
    }
    function hpAt(f, t) {
      var v = f.hp0;
      for (var i = 0; i < f.drains.length; i++) { var d = f.drains[i]; if (t < d.t0) break; v = d.a + (d.b - d.a) * eout(seg(t, d.t0, d.t1)); }
      return v;
    }
    function strikeAt(t) { var p = S.plan; if (!p) return -1; for (var i = p.staged.length - 1; i >= 0; i--) if (t >= p.staged[i].t0) return i; return -1; }

    function finish(skipped) {
      var p = S.plan; S.busy = false; S.plan = null; S.stats.done++;
      if (p.ko) S.gone[String(p.F[p.ko].id)] = true;
      S.last = { att: p.F.att.id, def: p.F.def.id, final: p.final, skipped: !!skipped };
      if (typeof p.onDone === 'function') { try { p.onDone({ att: p.final.att, def: p.final.def, skipped: !!skipped, ko: p.ko ? p.F[p.ko].id : null }); } catch (e) { S.stats.errors++; } }
    }

    var api = {
      version: VERSION,
      play: function (spec) {
        if (S.busy || !spec || !spec.attacker || !spec.defender) { S.stats.refused++; return false; }
        var plan = null; try { plan = build(spec, opts.ctx || S.lastCtx || null); } catch (e) { S.stats.errors++; plan = null; }
        if (!plan) { S.stats.refused++; return false; }
        S.plan = plan; S.busy = true; S.t = 0; S.fired = 0; S.skipped = false; S.speed = P.speed; S.stats.plays++;
        delete S.gone[String(plan.F.att.id)]; delete S.gone[String(plan.F.def.id)];
        S.lastActor = {};
        return true;
      },
      update: function (dt) {
        if (!S.busy || !S.plan) return;
        dt = num(dt, FRAME); if (!(dt > 0)) return;
        S.t += dt * S.speed;
        var p = S.plan;
        while (S.fired < p.staged.length && S.t >= p.staged[S.fired].tImp) {
          var st = p.staged[S.fired++];
          var cb = p.onImpact || opts.onImpact;
          if (typeof cb === 'function') { try { cb({ i: st.i, by: p.F[st.by].id, target: p.F[st.target].id, result: st.result, dmg: st.dmg, after: st.after, ko: st.ko }); } catch (e) { S.stats.errors++; } }
        }
        if (S.t >= p.tClose) finish(!!S.skipped);
      },
      busy: function () { return S.busy; },
      speed: function () { return S.speed; },
      key: function (k) {
        if (!S.busy || P.keys === 'off') return false; k = String(k || '').toLowerCase();
        if (k === 'z' || k === 'enter' || k === ' ' || k === 'ok' || k === 'confirm' || k === 'a') { api.skip(); return true; }
        if (k === 'x' || k === 'back' || k === 'b' || k === 'speed') { S.speed = S.speed === 2 ? 1 : 2; return true; }
        return false;
      },
      tap: function () { if (!S.busy) return false; api.skip(); return true; },
      skip: function () { if (!S.busy || !S.plan) return; S.stats.skips++; S.skipped = true; var p = S.plan; S.fired = p.staged.length; S.t = Math.max(S.t, p.tEnd); },
      clear: function () { S.busy = false; S.plan = null; S.gone = {}; S.t = 0; },
      gone: function (id) { return !!S.gone[String(id)]; },
      fighting: function (id) { var p = S.plan; return !!(S.busy && p && (String(p.F.att.id) === String(id) || String(p.F.def.id) === String(id))); },
      facing: function (id) { var p = S.plan; if (!S.busy || !p) return null; var f = String(p.F.att.id) === String(id) ? p.F.att : String(p.F.def.id) === String(id) ? p.F.def : null; return f ? f.facing : null; },
      dir: function (id) { var p = S.plan; if (!S.busy || !p) return null; var f = String(p.F.att.id) === String(id) ? p.F.att : String(p.F.def.id) === String(id) ? p.F.def : null; return f ? f.dir4 : null; },
      offset: function (id) { var p = S.plan; if (!S.busy || !p) return { x: 0, y: 0, pose: 'idle', flash: false, hurt: false, ko: 0 }; var f = String(p.F.att.id) === String(id) ? p.F.att : String(p.F.def.id) === String(id) ? p.F.def : null; return f ? poseAt(f, S.t) : { x: 0, y: 0, pose: 'idle', flash: false, hurt: false, ko: 0 }; },
      setParams: function (p) { setParams(Object.assign({}, P, p || {})); S.speed = S.busy ? S.speed : P.speed; },
      params: function () { return Object.assign({}, P); },
      /* draw a unit: during an exchange the module adds the lunge / knock-back, picks the pose and side, flashes and
         dissolves it; otherwise it draws the art as given. art = image | {idle, attack, hurt, left, right, ...} | fn(pose, side) */
      drawActor: function (ctx, id, art, x, y, o) {
        o = o || {};
        try {
          var f = null, p = S.plan;
          if (S.busy && p) f = String(p.F.att.id) === String(id) ? p.F.att : String(p.F.def.id) === String(id) ? p.F.def : null;
          if (!f && S.gone[String(id)] && o.respectGone !== false) return true;
          var ps = f ? poseAt(f, S.t) : { x: 0, y: 0, pose: 'idle', flash: false, hurt: false, ko: 0 };
          var want = f && f.facing ? f.facing : (o.facing || o.native || null);
          var img = pick(art, ps.pose, want, f ? f.dir4 : null), flip = false;
          if (img && img.__side) want = null;   // a painted side variant: draw as is
          if (img && img.__flip != null) flip = img.__flip;
          else if (o.native && want) flip = want !== o.native;
          else if (o.flip != null) flip = !!o.flip;
          if (img && img.img) img = img.img;
          if (!img || !img.width) return false;
          if (f) { S.stats.actorDraws++; S.lastActor[String(id)] = (S.lastActor[String(id)] || 0) + 1; f.drawnFlip = flip; f.drawnFacing = want; }
          var dx = Math.round(x + ps.x), dy = Math.round(y + ps.y), src = img, k = ps.ko;
          if (ps.flash) src = tinted(img, flip, '#ffffff', 1) || img;
          else if (ps.hurt && !(art && art.hurt) && typeof art !== 'function') src = tinted(img, flip, '#ff5a4a', 0.38) || img;
          else if (flip) src = tinted(img, true, '#000000', 0) || img;
          ctx.save(); ctx.imageSmoothingEnabled = false;
          if (k > 0) {   // dissolve from the top down, opaque rows only
            var keep = Math.round(src.height * (1 - k)), vis = keep - (src.height - 1 - lowestRow(img));   // opaque rows left, outline included
            var drawK = vis >= 3;   // at least two body rows above the outline, else nothing
            if (f) f.koRows = drawK ? vis : 0;
            if (drawK) ctx.drawImage(src, 0, src.height - keep, src.width, keep, dx, dy + src.height - keep, src.width, keep);
          } else ctx.drawImage(src, dx, dy);
          ctx.restore();
          return true;
        } catch (e) { S.stats.errors++; return false; }
      },
      draw: function (ctx) {
        if (ctx) S.lastCtx = ctx;
        if (!S.busy || !S.plan || !ctx) return;
        try { drawScene(ctx); } catch (e) { S.stats.errors++; }
      },
      state: function () {
        var p = S.plan, t = S.t;
        if (!S.busy || !p) return { busy: false, phase: 'idle', t: Math.round(t), last: S.last || null, speed: S.speed };
        var i = strikeAt(t), st = i >= 0 ? p.staged[i] : null, out = {
          busy: true, t: Math.round(t), phase: t < OPEN ? 'open' : t >= p.tEnd ? 'close' : 'strike', strike: i, speed: S.speed,
          result: st ? st.result : null, by: st ? st.by : null, follow: st ? st.follow : false,
          final: p.final, staged: p.staged.map(function (s) { return { by: s.by, result: s.result, dmg: s.dmg, follow: s.follow, ko: s.ko, shown: t >= s.tImp }; }),
          plates: platesAt(t), labels: labelsAt(t), sparks: [], swish: null, flash: false, actors: []
        };
        ['att', 'def'].forEach(function (k) {
          var f = p.F[k], ps = poseAt(f, t), b = f.sbox, c = cam(), ox = opts.camera ? p.cam.x - c.x : 0, oy = opts.camera ? p.cam.y - c.y : 0;
          if (ps.flash) out.flash = true;
          out.actors.push({ id: f.id, role: k, x: Math.round(b.x + ox + ps.x + b.w / 2), y: Math.round(b.y + oy + ps.y + b.h), box: { x: b.x + ox + ps.x, y: b.y + oy + ps.y, w: b.w, h: b.h },
            off: { x: ps.x, y: ps.y }, stand: { x: f.stand.x, y: f.stand.y }, facing: f.facing, dir: f.dir4, pose: ps.pose, flash: ps.flash, hurt: ps.hurt, ko: ps.ko, boss: f.boss,
            target: p.F[k === 'att' ? 'def' : 'att'].id, hp: Math.round(hpAt(f, t) * 100) / 100, koRows: ps.ko > 0 ? (f.koRows || 0) : null, shownHp: Math.ceil(hpAt(f, t) - 1e-6), drawnFlip: f.drawnFlip, drawnFacing: f.drawnFacing });
        });
        p.staged.forEach(function (s) {
          var li = t - s.tImp; if (li < 0) return;
          var sp = sparkPoint(s);
          if (s.result !== 'miss' && li < SPARK * (s.result === 'crit' ? 1.3 : 1)) out.sparks.push({ x: sp.x, y: sp.y, i: s.i, crit: s.result === 'crit' });
          if (s.result === 'miss' && li < SWISH) out.swish = { x: sp.x, y: sp.y, i: s.i };
        });
        return out;
      },
      stats: function () { return Object.assign({}, S.stats); },
      rect: function () { return view(); }
    };

    function pick(art, pose, want, dir4) {
      if (!art) return null;
      if (typeof art === 'function') { var r = safe(function () { return art(pose, want, dir4); }, null); return r; }
      if (art.width && art.height) return art;
      var side = want && art[want] ? art[want] : null;
      if (side) { var q = side[pose] || side.idle || (side.width ? side : null); if (q) { var w = { img: q, __side: true, __flip: false }; return w; } }
      return art[pose] || art.idle || null;
    }
    function sparkPoint(st) {
      var p = S.plan, tg = p.F[st.target], by = p.F[st.by], b = tg.sbox, d = by.dir, c = cam();
      var ox = (opts.camera ? p.cam.x - c.x : 0) + tg.stand.x, oy = (opts.camera ? p.cam.y - c.y : 0) + tg.stand.y;
      var x = b.x + ox + b.w / 2 - d.x * (b.w / 2 - 3), y = b.y + oy + b.h * 0.5 - d.y * (b.h / 2 - 4);
      return { x: Math.round(x), y: Math.round(y) };
    }
    function platesAt(t) {
      var p = S.plan, pl = p.plates, k = Math.min(eout(seg(t, 0, OPEN * 0.7)), 1 - eio(seg(t, p.tEnd, p.tClose))), v = view();
      var out = [];
      ['att', 'def'].forEach(function (role) {
        var r = pl[role], top = r.y < v.y + v.h / 2, off = Math.round((1 - k) * (r.h + 4)) * (top ? -1 : 1), f = p.F[role];
        out.push({ role: role, id: f.id, x: r.x, y: r.y + off, w: r.w, h: r.h, where: pl.where, hp: Math.ceil(hpAt(f, t) - 1e-6), frac: hpAt(f, t) / f.max, boss: f.boss, owner: null });
      });
      return out;
    }
    function labelsAt(t) {
      var p = S.plan, out = [];
      p.staged.forEach(function (s) {
        var li = t - s.tImp; if (li < 0 || li >= NUM_FADE1) return;
        var L = s.label, rise = Math.round(L.rise * eout(seg(li, 0, NUM_RISE))), a = 1 - seg(li, NUM_FADE0, NUM_FADE1), c = cam();
        var ox = opts.camera ? p.cam.x - c.x : 0, oy = opts.camera ? p.cam.y - c.y : 0;
        out.push({ text: L.text, kind: L.kind, x: L.x + ox, y: L.y - rise + oy, w: L.w, h: L.h, alpha: a, owner: L.owner, i: s.i, clean: L.clean });
      });
      return out;
    }

    /* ---------- drawing ---------- */
    function drawScene(g) {
      var p = S.plan, t = S.t, st;
      g.save(); g.imageSmoothingEnabled = false;
      // sparks and swishes
      for (var i = 0; i < p.staged.length; i++) {
        st = p.staged[i]; var li = t - st.tImp; if (li < 0) continue;
        var sp = sparkPoint(st), d = p.F[st.by].dir;
        if (st.result === 'miss') { if (li < SWISH) drawSwish(g, sp.x, sp.y, d, li / SWISH); }
        else if (li < SPARK * (st.result === 'crit' ? 1.3 : 1)) drawSpark(g, sp.x, sp.y, d, li / (SPARK * (st.result === 'crit' ? 1.3 : 1)), st.result === 'crit', st.i, p.F[st.by].boss ? 0.55 : 1);
      }
      // KO shards
      if (p.ko) {
        var kst = p.staged.filter(function (s) { return s.ko; })[0];
        if (kst) drawShards(g, kst, t - (kst.tImp + HURT));
      }
      // labels
      labelsAt(t).forEach(function (L) {
        var c = textCanvas(L.text, p.sc, L.kind, L.kind !== 'miss'); if (!c) return;
        g.globalAlpha = L.alpha; g.drawImage(c, Math.round(L.x), Math.round(L.y)); g.globalAlpha = 1;
      });
      // plates
      var pls = platesAt(t), v = view();
      g.save(); g.beginPath(); g.rect(v.x, v.y, v.w, v.h); g.clip();   // plates glide in from the view's edge, never over the HUD
      pls.forEach(function (r) { drawPlate(g, r, p.F[r.role], p.sc); });
      if (p.plates.medal) drawMedal(g, p.plates.medal, pls[0].y - p.plates.att.y);
      g.restore();
      g.restore();
    }

    var SPARK_COL = ['#ffffff', '#fff3a0', '#ffc04a', '#ff7a2a', '#b83a1a'];
    function drawSpark(g, x, y, d, k, crit, seed, size) {
      size = size || 1;
      // a pixel star on the target's near edge: white core, yellow-orange rays pointing back toward the attacker, embers
      var n = crit ? 10 : 7, R = (crit ? 9 : 6) * size * eout(Math.min(1, k * 2.2)), fade = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1, i, a;
      var core = size < 1 ? (k < 0.4 ? 1 : 0) : k < 0.45 ? (crit ? 3 : 2) : k < 0.75 ? 1 : 0;
      g.globalAlpha = 1;
      for (i = 0; i < n; i++) {
        a = (i / n) * Math.PI * 2 + seed * 0.7;
        var bias = 1 + 0.6 * Math.max(0, -(Math.cos(a) * d.x + Math.sin(a) * d.y));   // longer rays back toward the attacker
        var len = Math.round(R * bias * (i % 2 ? 0.7 : 1));
        for (var r = core; r <= len; r++) {
          var c = r < len * 0.35 ? SPARK_COL[1] : r < len * 0.7 ? SPARK_COL[2] : SPARK_COL[3];
          if (fade < 1 && r < len * fade * 0.5) continue;
          g.fillStyle = c; g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1);
        }
      }
      if (core) {   // a four-point star: long thin arms, a 1 px white heart, no solid block
        var arm = core + 2;
        g.fillStyle = SPARK_COL[1]; g.fillRect(x - arm, y, 2 * arm + 1, 1); g.fillRect(x, y - arm, 1, 2 * arm + 1);
        g.fillStyle = SPARK_COL[0]; g.fillRect(x - core, y, 2 * core + 1, 1); g.fillRect(x, y - core, 1, 2 * core + 1);
        g.fillStyle = SPARK_COL[1]; g.fillRect(x - 1, y - 1, 1, 1); g.fillRect(x + 1, y - 1, 1, 1); g.fillRect(x - 1, y + 1, 1, 1); g.fillRect(x + 1, y + 1, 1, 1);
      }
      // embers fly back toward the attacker and fall
      for (i = 0; i < (crit ? 6 : 4); i++) {
        var h = ((seed + 1) * 9301 + i * 49297) % 233280 / 233280, ang = Math.atan2(-d.y, -d.x) + (h - 0.5) * 2.2, sp = 10 + h * 8;
        var ex = x + Math.cos(ang) * sp * k, ey = y + Math.sin(ang) * sp * k + 14 * k * k;
        g.fillStyle = i % 2 ? SPARK_COL[2] : SPARK_COL[3]; if (k < 0.92) g.fillRect(Math.round(ex), Math.round(ey), 1, 1);
      }
    }
    function drawSwish(g, x, y, d, k) {
      // a white crescent that sweeps through the air at the target's near side: thick bright head, thin fading tail
      var base = Math.atan2(d.y, d.x), r = 10, ox = x - d.x * 7, oy = y - d.y * 7 - 1, span = 1.25;
      var head = -span + 2 * span * eout(Math.min(1, k * 1.6)), tail = head - 1.3, steps = 30, fade = k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35;
      for (var i = 0; i <= steps; i++) {
        var w = i / steps, a = tail + (head - tail) * w; if (a < -span) continue;
        var th = w > 0.75 ? 2 : 1, px = ox + Math.cos(base + a) * r, py = oy + Math.sin(base + a) * r;
        g.globalAlpha = Math.max(0, fade * (0.3 + 0.7 * w)); g.fillStyle = w > 0.55 ? '#ffffff' : '#c8dcff';
        g.fillRect(Math.round(px), Math.round(py), th, th);
        if (w > 0.4) { g.fillStyle = '#ffffff'; g.fillRect(Math.round(ox + Math.cos(base + a) * (r - 2)), Math.round(oy + Math.sin(base + a) * (r - 2)), 1, 1); }
      }
      g.globalAlpha = 1;
    }
    function drawShards(g, kst, lt) {
      if (lt < 0 || lt > KO + 160) return;
      var p = S.plan, f = p.F[kst.target], b = f.sbox, c = cam(), ox = (opts.camera ? p.cam.x - c.x : 0), oy = (opts.camera ? p.cam.y - c.y : 0);
      var col = f.team === 'a' ? ['#3c72e4', '#2442a4', '#121a52'] : f.team === 'n' ? ['#4ea43c', '#2c6a2c', '#163a1c'] : ['#d4442e', '#901e26', '#5a1418'];
      var k = lt / KO, base = b.y + oy + b.h * (1 - Math.min(1, k)) + 1;
      for (var i = 0; i < 9; i++) {
        var h = (i * 7919 % 97) / 97, vx = (h - 0.5) * 28, vy = -10 - (i % 3) * 6, tt = Math.min(1, k * 1.3);
        var x = b.x + ox + b.w * ((i + 0.5) / 9) + vx * tt, y = Math.min(b.y + oy + b.h - 1, base + vy * tt + 26 * tt * tt);
        if (k > 1) continue;
        g.fillStyle = col[i % 3]; g.fillRect(Math.round(x), Math.round(y), i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
      }
    }
    var PLATE = {
      a: { band: ['#3c72e4', '#3466d4', '#2c58c0', '#244aa8'], hi: '#98c4ff', lo: '#18307a', edge: '#0c1030' },
      b: { band: ['#d4503a', '#c4442e', '#ac3828', '#902c22'], hi: '#ffa88a', lo: '#5a1418', edge: '#200810' },
      n: { band: ['#4ea43c', '#449434', '#3a842c', '#2e6e24'], hi: '#b8f08a', lo: '#1c4a18', edge: '#0a1808' },
      boss: { band: ['#3a3040', '#322a38', '#2a2230', '#221c28'], hi: '#d84a3a', lo: '#120c16', edge: '#060408' }
    };
    function drawPlate(g, r, f, sc) {
      var C = f.boss ? PLATE.boss : PLATE[f.team] || PLATE.b, x = r.x, y = r.y, w = r.w, h = r.h, i;
      // frame: dark rounded edge, banded team gradient, light top-left edge, dark bottom-right edge
      g.fillStyle = C.edge; g.fillRect(x + 2, y, w - 4, h); g.fillRect(x, y + 2, w, h - 4); g.fillRect(x + 1, y + 1, w - 2, h - 2);
      for (i = 0; i < h - 4; i++) { g.fillStyle = C.band[Math.min(3, Math.floor(i / (h - 4) * 4))]; g.fillRect(x + 2, y + 2 + i, w - 4, 1); }
      g.fillStyle = C.hi; g.fillRect(x + 3, y + 1, w - 6, 1); g.fillRect(x + 1, y + 3, 1, h - 6);
      g.fillStyle = C.lo; g.fillRect(x + 3, y + h - 2, w - 6, 1); g.fillRect(x + w - 2, y + 3, 1, h - 6);
      if (f.boss) { g.fillStyle = '#8a1c22'; g.fillRect(x + 2, y + 2, w - 4, 1); g.fillRect(x + 2, y + h - 3, w - 4, 1); g.fillRect(x + 2, y + 2, 1, h - 4); g.fillRect(x + w - 3, y + 2, 1, h - 4); }
      // corner stud
      g.fillStyle = f.boss ? '#ff6a4a' : '#ffd858'; g.fillRect(x + 3, y + 3, 2, 2); g.fillStyle = f.boss ? '#7a1010' : '#b87a1c'; g.fillRect(x + 4, y + 4, 1, 1);
      var tx = x + 7 + (f.boss ? 11 * sc : 0), ty = y + 3, nameC = textCanvas(f.name, sc, 'name');
      if (f.boss) drawHelm(g, x + 7, y + 3 + Math.round(sc - 1), sc);
      if (nameC) g.drawImage(nameC, tx, ty);
      if (f.x2) { var xc = textCanvas('x2', sc, 'x2'); if (xc && tx + (nameC ? nameC.width : 0) + 3 + xc.width < x + w - 3) g.drawImage(xc, x + w - 4 - xc.width, ty); }
      // HP row: "HP" label, the number (ticks down with the bar), segmented bar
      var row = ty + (CAP + 2) * sc + 1, numC = textCanvas(String(Math.max(0, r.hp)), sc, 'hp', true);
      var lx = x + 5;
      var nw = measure('88', sc, true).w; if (numC) g.drawImage(numC, lx + nw - numC.width, row);
      var bx = lx + nw + 4, bw = x + w - 6 - bx, bh = 4 * sc + 1, by = row + Math.round(((CAP + 2) * sc - bh) / 2);
      if (bw > 8) {
        g.fillStyle = C.edge; g.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        g.fillStyle = '#20182a'; g.fillRect(bx, by, bw, bh);
        var fill = Math.round(bw * clamp(r.frac, 0, 1)), low = r.frac <= 0.25;
        var c1 = f.boss ? '#ff5a3a' : low ? '#ff7a5a' : '#ffd858', c2 = f.boss ? '#a8201a' : low ? '#b83a2a' : '#c88a1c', c0 = f.boss ? '#ffb0a0' : low ? '#ffc0a8' : '#fff4b0';
        g.fillStyle = c2; g.fillRect(bx, by, fill, bh);
        g.fillStyle = c1; g.fillRect(bx, by, fill, bh - Math.max(1, sc));
        g.fillStyle = c0; g.fillRect(bx, by, fill, 1);
        g.fillStyle = 'rgba(16,10,24,0.55)'; for (i = bx + 3; i < bx + bw; i += 4) g.fillRect(i, by, 1, bh);   // segment notches
      }
    }
    function drawHelm(g, x, y, sc) {   // boss emblem: a horned helm, 9 x 8 px per scale
      var R = ['h.......h', 'h.......h', '.h.ooo.h.', '..ooooo..', '.ooooooo.', '.oEoooEo.', '.ooo.ooo.', '..o...o..'];
      for (var yy = 0; yy < R.length; yy++) for (var xx = 0; xx < 9; xx++) { var ch = R[yy][xx]; if (ch === '.') continue; g.fillStyle = ch === 'h' ? '#e8dcc0' : ch === 'E' ? '#ff4a2a' : '#c8c4d0'; g.fillRect(x + xx * sc, y + yy * sc, sc, sc); }
    }
    function drawMedal(g, m, off) {
      var x = m.x, y = m.y + off;
      g.fillStyle = '#2a1808'; g.fillRect(x + 2, y, 6, 10); g.fillRect(x, y + 2, 10, 6); g.fillRect(x + 1, y + 1, 8, 8);
      g.fillStyle = '#c8901c'; g.fillRect(x + 2, y + 1, 6, 8); g.fillRect(x + 1, y + 2, 8, 6);
      g.fillStyle = '#ffd858'; g.fillRect(x + 2, y + 2, 5, 5); g.fillStyle = '#fff4b0'; g.fillRect(x + 3, y + 2, 2, 1); g.fillRect(x + 2, y + 3, 1, 2);
    }

    return api;
  }

  root.GameDNA_OnMapSkirmish = { create: create, order: order, version: VERSION, defaults: DEFAULTS, measure: measure, glyphs: GLYPH,
    timing: { OPEN: OPEN, WIND: WIND, IMPACT: IMPACT, HURT: HURT, STRIDE: STRIDE, KO: KO, CLOSE: CLOSE, NUM_FADE1: NUM_FADE1, FRAME: FRAME } };
})(typeof window !== 'undefined' ? window : this);
