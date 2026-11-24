/* GameDNA L-02 · Painted portraits with expressions · module v1 (plain script, no dependencies, one global: GameDNA_PaintedPortraits)
 *
 * Painted bust portraits (generated once at build time, shipped as image files) beside a dialogue box. Each character
 * has a neutral image, expression images made as edits of it (same canvas, aligned), and optionally a blink image.
 * The presenter has the same hooks as D-04 expressive-portraits, so an H-01 dialogue box uses either one:
 *
 *   const por = GameDNA_PaintedPortraits.create({ bounds: FIELD, uiRects: () => [hud],
 *     cast: { Maren: { src: 'portraits/maren-{expr}.webp', exprs: ['neutral','happy','angry','sad','surprised','determined','blink'] } } });
 *   const dlg = GameDNA_DialogueBox.create({ bounds: () => por.reserve(FIELD), onLine: (l, i, c) => por.onLine(l, i, c), ... });
 *   por.attach(dlg);
 *   por.onReady(boot);                                  // images loaded -> start the game (frozen shots stay deterministic)
 *   // every fixed step (also while the box is busy): por.update(1000 / 60);   draw pass: dlg.draw(ctx); por.draw(ctx);
 *   // lines: { speaker: 'Maren', expr: 'angry', text: '...' }   (expr: neutral happy angry sad surprised determined)
 *
 * A game with its own text box: por.attach({ rect: () => myBoxRectOrNull }); call por.onLine({ speaker, expr }) when a
 * line starts; the portraits leave when rect() returns null.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.1';
  var EXPRESSIONS = ['neutral', 'happy', 'angry', 'sad', 'surprised', 'determined'];
  var ALIASES = { hurt: 'sad', worried: 'sad', upset: 'sad', thinking: 'determined', think: 'determined', serious: 'determined', focused: 'determined',
    shocked: 'surprised', shock: 'surprised', joy: 'happy', smile: 'happy', glad: 'happy', mad: 'angry', furious: 'angry', calm: 'neutral', idle: 'neutral' };
  var DEFAULTS = { layout: 'left', place: 'stand', height: 0, enter: 'slide', enterMs: 260, fadeMs: 180, listener: 'dim', dim: 0.45,
    breathe: 1, breatheMs: 3800, blinkMs: 4200, talk: 'bob', shadow: 0.35, inset: 18, gap: 6, margin: 6, flip: 'auto' };

  /* ---------------- helpers ---------------- */
  var warned = {};
  function warn(key, msg) { if (warned[key]) return; warned[key] = 1; try { if (root.console) console.warn('GameDNA_PaintedPortraits: ' + msg); } catch (e) { } }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function okRect(r) { return !!r && isFinite(r.x) && isFinite(r.y) && r.w > 0 && r.h > 0; }
  function hashStr(s) { s = String(s); var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function ease(k) { k = clamp(k, 0, 1); return 1 - Math.pow(1 - k, 3); }
  function smooth(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }
  function mkCanvas(w, h) {
    try { if (root.document) { var c = root.document.createElement('canvas'); c.width = w; c.height = h; return c; } } catch (e) { }
    try { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); } catch (e) { }
    return null;
  }
  function normExpr(e) {
    if (e == null || e === '') return null;
    e = String(e).toLowerCase();
    if (EXPRESSIONS.indexOf(e) >= 0) return e;
    if (ALIASES[e]) return ALIASES[e];
    warn('expr:' + e, 'unknown expression "' + e + '"; shown as neutral. Use one of ' + EXPRESSIONS.join(', '));
    return 'neutral';
  }
  function imgSize(img) {
    if (!img) return null;
    var w = img.naturalWidth || img.videoWidth || img.width, h = img.naturalHeight || img.videoHeight || img.height;
    return w > 0 && h > 0 ? { w: w, h: h } : null;
  }

  /* ---------------- image loading (once, before the game boots) ---------------- */
  var CACHE = {};                      // url -> {img, state: 'loading'|'ok'|'failed', waiters: []}
  function loadUrl(url, done) {
    var c = CACHE[url];
    if (c) { if (c.state === 'loading') c.waiters.push(done); else done(c); return c; }
    c = CACHE[url] = { url: url, img: null, state: 'loading', waiters: [done] };
    var finish = function (ok) { c.state = ok ? 'ok' : 'failed'; var w = c.waiters; c.waiters = []; w.forEach(function (f) { try { f(c); } catch (e) { warn('cb', 'onReady callback threw: ' + e); } }); };
    try {
      if (typeof Image === 'undefined') { finish(false); return c; }
      var im = new Image(); c.img = im;
      im.onload = function () { finish(true); };
      im.onerror = function () { warn('load:' + url, 'could not load ' + url + ' (that expression falls back to neutral; a missing neutral shows no portrait)'); finish(false); };
      im.src = url;
    } catch (e) { finish(false); }
    return c;
  }
  // a cast entry -> {expr: source}; source = url string, image/canvas/bitmap, or an asset key (with options.assets)
  function entrySources(entry, base) {
    var out = {}, list, i;
    if (!entry || typeof entry !== 'object') return out;
    if (entry.images && typeof entry.images === 'object') for (var k in entry.images) out[k] = entry.images[k];
    if (typeof entry.src === 'string') {
      list = entry.exprs && entry.exprs.length ? entry.exprs : EXPRESSIONS.concat(['blink']);
      for (i = 0; i < list.length; i++) if (out[list[i]] == null) out[list[i]] = entry.src.replace(/\{expr\}/g, list[i]);
    }
    if (typeof entry.assets === 'string') {
      list = entry.exprs && entry.exprs.length ? entry.exprs : EXPRESSIONS.concat(['blink']);
      for (i = 0; i < list.length; i++) if (out[list[i]] == null) out[list[i]] = { assetKey: entry.assets + '-' + list[i] };
    }
    if (base) for (k in out) if (typeof out[k] === 'string' && !/^(data:|blob:|https?:|\/)/.test(out[k])) out[k] = base + out[k];
    return out;
  }
  // assets.json (gamedna-assets/1) -> cast: entries with role portrait, set and expr
  function castFromManifest(M, o) {
    o = o || {}; var cast = {}, names = o.names || {}, rev = {};
    for (var n in names) rev[String(names[n]).toLowerCase()] = n;
    var list = M && M.assets ? M.assets : M && M.length ? M : [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i]; if (!e || !e.set || !e.expr) continue;
      if (e.role && e.role !== 'portrait') continue;
      var name = rev[String(e.set).toLowerCase()] || (o.names ? null : e.name || e.set);
      if (!name) continue;
      var c = cast[name] || (cast[name] = { images: {} });
      c.images[e.expr] = (o.base || '') + (e.file || e.src);
      if (e.side && !c.side) c.side = e.side;
    }
    return cast;
  }

  /* ---------------- a character record ---------------- */
  function makeRecord(key, entry, opts) {
    var rec = { key: key, entry: entry, imgs: {}, pending: 0, failed: [], side: entry && (entry.side === 'left' || entry.side === 'right') ? entry.side : null,
      noFlip: !!(entry && entry.noFlip), facing: entry && entry.facing === 'left' ? 'left' : 'right', waiters: [] };
    var src = entrySources(entry, opts.base);
    var done = function () { if (--rec.pending === 0) { var w = rec.waiters; rec.waiters = []; w.forEach(function (f) { f(rec); }); } };
    Object.keys(src).forEach(function (ex) {
      var s = src[ex];
      if (s && s.assetKey) {
        var A = opts.assets || root.GameDNA_Assets, r = null;
        try { r = A && A.get ? A.get(s.assetKey) : null; } catch (e) { r = null; }
        if (r && r.img) rec.imgs[ex] = r.img; else rec.failed.push(ex);
        return;
      }
      if (typeof s === 'string') {
        rec.pending++;
        loadUrl(s, function (c) { if (c.state === 'ok') rec.imgs[ex] = c.img; else rec.failed.push(ex); done(); });
        return;
      }
      if (s && imgSize(s)) rec.imgs[ex] = s; else if (s) rec.failed.push(ex);
    });
    return rec;
  }
  function recImage(rec, expr) { return rec.imgs[expr] && imgSize(rec.imgs[expr]) ? rec.imgs[expr] : rec.imgs.neutral && imgSize(rec.imgs.neutral) ? rec.imgs.neutral : null; }

  /* ---------------- cached tint (dim) and blink timing ---------------- */
  var TINT = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function dimmed(img, amount) {
    if (!TINT) return null;
    var m = TINT.get(img); if (!m) { m = {}; TINT.set(img, m); }
    var k = Math.round(amount * 100); if (m[k] !== undefined) return m[k];
    var s = imgSize(img), c = s ? mkCanvas(s.w, s.h) : null;
    if (c) {
      try {
        var g = c.getContext('2d'); g.drawImage(img, 0, 0);
        g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(12,14,30,' + clamp(amount, 0, 1) + ')'; g.fillRect(0, 0, s.w, s.h);
      } catch (e) { c = null; }
    }
    m[k] = c; return c;
  }
  // a blurred dark silhouette of an image, made once (canvas blur is slow in software renderers; drawing the cached one is cheap)
  var SHADOW = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function shadowOf(img) {
    if (!SHADOW) return null;
    var m = SHADOW.get(img); if (m !== undefined) return m;
    var s = imgSize(img), out = null;
    if (s) {
      var q = 0.5, iw = Math.round(s.w * q), ih = Math.round(s.h * q), pad = Math.round(ih * 0.08), c = mkCanvas(iw + 2 * pad, ih + 2 * pad);   // half size: it is blurred anyway
      if (c) {
        try {
          var g = c.getContext('2d'), off = 4 * (iw + 2 * pad);
          g.shadowColor = 'rgba(6,8,20,1)'; g.shadowBlur = Math.max(3, ih * 0.05); g.shadowOffsetX = off;
          g.drawImage(img, pad - off, pad, iw, ih);
          out = { c: c, pad: pad, iw: iw };
        } catch (e) { out = null; }
      }
    }
    SHADOW.set(img, out); return out;
  }
  // deterministic blink: one blink about every `every` ms (jittered per cycle), 130 ms long; sometimes a double blink
  function blinkAt(seed, t, every) {
    if (!(every > 0)) return false;
    var cyc = Math.floor(t / every), h = hashStr(seed + ':' + cyc), at = (h % 1000) / 1000 * (every * 0.55) + every * 0.2, e = t - cyc * every - at;
    if (e >= 0 && e < 130) return true;
    return (h >> 10) % 4 === 0 && e >= 260 && e < 380;
  }

  /* ---------------- presenter ---------------- */
  function create(o) {
    o = o || {};
    var P = {}, clock = 0, slots = { left: null, right: null }, leaving = [], plan = null, lastSig = null, convKey = null, drawn = [], lastShown = -1, lastChange = -1e9;
    var recs = {}, castRaw = o.cast || {}, readyFns = [], comp = {}, narrating = false;
    function setParams(p) {
      p = p || {};
      for (var k in DEFAULTS) if (P[k] == null) P[k] = DEFAULTS[k];
      for (k in p) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && p[k] != null && p[k] !== '') P[k] = typeof DEFAULTS[k] === 'number' ? num(p[k], DEFAULTS[k]) : String(p[k]);
      P.height = clamp(P.height, 0, 2000); P.enterMs = clamp(P.enterMs, 0, 2000); P.fadeMs = clamp(P.fadeMs, 0, 2000); P.dim = clamp(P.dim, 0, 0.9);
      P.breathe = clamp(P.breathe, 0, 3); P.breatheMs = clamp(P.breatheMs, 800, 20000); P.blinkMs = clamp(P.blinkMs, 0, 30000); P.shadow = clamp(P.shadow, 0, 1);
      P.inset = clamp(Math.round(P.inset), 0, 400); P.gap = clamp(Math.round(P.gap), 0, 64); P.margin = clamp(Math.round(P.margin), 0, 64);
    }
    setParams(o.params);
    function call(fn, a, b, c) { if (typeof fn === 'function') { try { return fn(a, b, c); } catch (x) { warn('cb', 'a host callback threw: ' + x); } } return undefined; }
    function rawEntry(key) { var k = String(key).toLowerCase(); for (var n in castRaw) if (String(n).toLowerCase() === k) return castRaw[n]; return null; }
    function recFor(key, line) {
      if (key == null || key === '') return null;
      var k = String(key).toLowerCase();
      if (recs[k] !== undefined) return recs[k];
      var entry = rawEntry(key);
      if (!entry && o.getPortrait) entry = call(o.getPortrait, key, line);
      var r = entry ? makeRecord(String(key), entry, { base: o.base || '', assets: o.assets }) : null;
      recs[k] = r;
      if (r && r.pending) r.waiters.push(checkReady);
      return r;
    }
    // preload every cast entry now, so onReady can gate the boot
    for (var n0 in castRaw) recFor(n0, null);
    function isReady() { for (var k in recs) if (recs[k] && recs[k].pending > 0) return false; return true; }
    function checkReady() { if (!isReady()) return; var f = readyFns; readyFns = []; f.forEach(function (fn) { call(fn, api); }); }
    function lineKey(line) { if (!line) return null; return line.portrait != null ? line.portrait : line.who != null && recFor(line.who, line) ? line.who : line.speaker; }
    function castSide(key) { var r = recFor(key, null); return r && r.side; }
    function makePlan(lines) {
      var pl = { sides: {}, map: {} }, order = [];
      (lines || []).forEach(function (l) {
        if (!l || typeof l !== 'object') return;
        var key = lineKey(l); if (key == null || !recFor(key, l)) return;
        var k = String(key).toLowerCase(), sd = l.side === 'left' || l.side === 'right' ? l.side : pl.map[k] || castSide(key);
        if (!sd) { if (P.layout === 'right') sd = 'right'; else if (P.layout === 'two') { if (order.indexOf(k) < 0) order.push(k); sd = order.indexOf(k) % 2 ? 'right' : 'left'; } else sd = 'left'; }
        if (!pl.map[k]) pl.map[k] = sd;
        pl.sides[sd] = true;
      });
      return pl;
    }
    function field() {
      var b = o.bounds; if (typeof b === 'function') b = call(b); if (!b && o.view) b = typeof o.view === 'function' ? call(o.view) : o.view;
      if (b && !(b.w > 0) && b.width > 0) b = { x: 0, y: 0, w: b.width, h: b.height };
      if (!b || !(b.w > 0) || !(b.h > 0)) return null;
      return { x: num(b.x, 0), y: num(b.y, 0), w: b.w, h: b.h };
    }
    function uiRects() { var L = call(o.uiRects), out = []; if (L && L.length) for (var i = 0; i < L.length; i++) if (okRect(L[i])) out.push(L[i]); return out; }
    function startExit(sl) { if (!sl || sl.exitT != null) return; sl.exitT = 0; leaving.push(sl); }
    function exitAll(boxGone) { ['left', 'right'].forEach(function (s) { if (slots[s]) { if (boxGone) slots[s].boxGone = true; startExit(slots[s]); slots[s] = null; } }); plan = null; narrating = false; }
    function setExpr(sl, e) {
      e = normExpr(e) || 'neutral';
      if (e === sl.expr) return;
      if (P.fadeMs > 0 && sl.enterT > 0) { sl.prev = sl.expr; sl.xT = 0; } else { sl.prev = null; sl.xT = P.fadeMs; }
      sl.expr = e;
    }
    function present(key, side, expr, line) {
      var r = recFor(key, line); if (!r) return null;
      side = side === 'right' ? 'right' : 'left';
      var cur = slots[side], k = String(key).toLowerCase(), os = side === 'left' ? 'right' : 'left', other = slots[os];
      if (other && other.k === k) { startExit(other); slots[os] = null; }
      if (cur && cur.k === k) { if (expr != null) setExpr(cur, expr); return cur; }
      var wait = 0; if (cur) { startExit(cur); wait = P.enterMs * 0.6; }
      var sl = { k: k, key: key, r: r, side: side, expr: normExpr(expr) || 'neutral', prev: null, xT: 1e9, enterT: -wait, exitT: null, talkT: 0, talking: false,
        dimK: 0, popT: 1e9, active: false, rect: null, clip: null, seed: 'bl' + k, phase: hashStr('ph' + k) % 2900 };
      slots[side] = sl; return sl;
    }
    function activate(sl) { ['left', 'right'].forEach(function (s) { var x = slots[s]; if (!x) return; var was = x.active; x.active = x === sl; if (x.active && !was) x.popT = 0; }); }
    // H-01 onLine hook (also for your own box): set the speaker, side and expression when a line starts
    function onLine(line, index, ctl) {
      try {
        line = line && typeof line === 'object' ? line : { text: String(line == null ? '' : line) };
        var lines = ctl && ctl.lines ? call(ctl.lines) : null, st = o.dialog && o.dialog.state ? call(o.dialog.state) : null;
        var ck = st && st.id != null ? 'id' + st.id : lines;
        if (ck !== convKey || !plan) {
          convKey = ck; plan = makePlan(lines || [line]);
          if (!(st && st.index > 0)) ['left', 'right'].forEach(function (s) { if (slots[s] && !plan.map[slots[s].k] && lines) { startExit(slots[s]); slots[s] = null; } });
        }
        lastSig = st && st.id != null ? st.id + ':' + index : null;
        var key = lineKey(line), r = key != null ? recFor(key, line) : null;
        if (!r) { narrating = true; if (P.listener === 'hide') exitAll(); activate(null); return; }
        narrating = false;
        var k = String(key).toLowerCase(), side = line.side === 'left' || line.side === 'right' ? line.side : plan.map[k] || castSide(key) || (P.layout === 'right' ? 'right' : 'left');
        if (!plan.map[k]) { plan.map[k] = side; plan.sides[side] = true; }
        var sl = present(key, side, null, line);
        if (sl) setExpr(sl, line.expr != null ? line.expr : line.face != null ? line.face : 'neutral');
        activate(sl);
        if (P.listener === 'hide') ['left', 'right'].forEach(function (s) { if (slots[s] && slots[s] !== sl) { startExit(slots[s]); slots[s] = null; } });
        lastShown = -1;
      } catch (e) { warn('onLine', 'onLine failed: ' + e); }
    }
    function sizeFor(r, h) { var im = recImage(r, 'neutral'), s = imgSize(im); if (!s) return null; return { w: Math.round(h * s.w / s.h), h: Math.round(h) }; }
    function baseHeight(F) {
      var h = P.height > 0 ? P.height : (F ? F.h * (P.place === 'beside' ? 0.38 : 0.46) : 160);   // 0 = auto: 46 % (beside: 38 %) of the field height
      return Math.max(24, h);
    }
    // 'beside' mode narrows the box like D-04; 'stand' mode leaves the field as it is
    function reserve(f) {
      if (typeof f === 'function') f = call(f);
      if (!f) f = field();
      if (!f) return f;
      var out = { x: num(f.x, 0), y: num(f.y, 0), w: f.w, h: f.h };
      if (P.place !== 'beside' || !plan) return out;
      var widest = 0;
      for (var k in plan.map) { var r = recFor(k, null), sz = r && sizeFor(r, baseHeight(f)); if (sz && sz.w > widest) widest = sz.w; }
      if (!widest) return out;
      var col = widest + P.gap;
      if (out.w - col * (plan.sides.left && plan.sides.right ? 2 : 1) < Math.min(120, out.w * 0.4)) return out;   // no room: the bust stands on the box instead
      if (plan.sides.left) { out.x += col; out.w -= col; }
      if (plan.sides.right) out.w -= col;
      return out;
    }
    function boxInfo() {
      var D = o.dialog; if (!D) return null;
      var st = D.state ? call(D.state) : null, B = st && okRect(st.box) ? st.box : null, R = D.rect ? call(D.rect) : null, tag = null;
      if (!B && okRect(R)) B = R;
      if (!B) return null;
      if (D.lastDrawn) { var L = call(D.lastDrawn); if (L && L.length) for (var i = 0; i < L.length; i++) if (L[i] && L[i].kind === 'tag' && okRect(L[i])) tag = L[i]; }
      return { B: { x: B.x, y: B.y, w: B.w, h: B.h }, tag: tag };
    }
    function update(dt) {
      try {
        dt = num(dt, 0); if (dt < 0) dt = 0; if (dt > 250) dt = 250;
        clock += dt;
        // no draw since the last step (?t=&freeze=1 fast-forward): keep each slot's layout current while the box is still
        // there, so a bust that starts leaving now keeps its place on the box edge instead of being laid out without a box
        ['left', 'right'].forEach(function (s) { var sl = slots[s]; if (sl && !sl.drawnSince) { var r0 = place(sl); if (r0) sl.rect = r0; } if (sl) sl.drawnSince = false; });
        var D = o.dialog;
        if (D) {
          var st = D.state ? call(D.state) : undefined;
          if (D.state) {
            if (!st || st.stage === 'close') { if (slots.left || slots.right) exitAll(true); plan = null; convKey = null; }
            else {
              var sig = st.id + ':' + st.index;
              if (sig !== lastSig && st.index >= 0 && st.id != null) {
                warn('wire', 'onLine is not passed to the dialogue box; expressions need create({onLine: (l, i, c) => portraits.onLine(l, i, c)})');
                onLine({ speaker: st.speaker, who: st.who }, st.index, null); lastSig = sig;
              }
              var typing = st.stage === 'type' && st.shown < st.total;
              if (typing && st.shown !== lastShown) { lastShown = st.shown; lastChange = clock; }
              var talking = typing && clock - lastChange < 160;
              ['left', 'right'].forEach(function (s) { var sl = slots[s]; if (sl) sl.talking = !!(sl.active && talking); });
            }
          } else if (D.rect) {                    // your own box: rect() null = closed
            var R = call(D.rect);
            if (!okRect(R) && (slots.left || slots.right)) { exitAll(true); convKey = null; }
            if (D.typing) { var tk = !!call(D.typing); ['left', 'right'].forEach(function (s) { var sl = slots[s]; if (sl) sl.talking = !!(sl.active && tk); }); }
          }
        }
        var anyActive = (slots.left && slots.left.active) || (slots.right && slots.right.active);
        ['left', 'right'].forEach(function (s) {
          var sl = slots[s]; if (!sl) return;
          sl.enterT += dt; sl.xT += dt; sl.popT += dt;
          sl.talkT = sl.talking && P.talk !== 'none' ? sl.talkT + dt : Math.max(0, sl.talkT - dt);
          var want = !sl.active && (anyActive || narrating) && P.listener === 'dim' ? 1 : 0, rate = dt / 160;
          sl.dimK = want > sl.dimK ? Math.min(want, sl.dimK + rate) : Math.max(want, sl.dimK - rate);
        });
        var exitMs = Math.max(1, P.enterMs * 0.75);
        leaving = leaving.filter(function (sl) { sl.exitT += dt; sl.talking = false; return sl.exitT < exitMs; });
      } catch (e) { warn('update', 'update failed: ' + e); }
    }
    // where a slot stands: {x, y, w, h} of the whole image at rest, plus the clip line
    function place(sl) {
      var F = field(), bi = boxInfo(), ui = uiRects(), left = sl.side === 'left';
      var h = baseHeight(F), sz, x, yb, clipY = null, clipDir = 0;
      if (bi) {
        var B = bi.B, low = F ? B.y + B.h / 2 > F.y + F.h / 2 : true;
        if (P.place === 'beside') {
          var bs = sizeFor(sl.r, Math.min(h, (low ? B.y + B.h - (F ? F.y : 0) : (F ? F.y + F.h : B.y + B.h + h) - B.y) - P.margin));
          if (!bs) return null;
          var bx = left ? B.x - P.gap - bs.w : B.x + B.w + P.gap;
          if (F && low) {                                           // foot line on the field's bottom edge: the flat cut is off screen
            var fb = F.y + F.h; bs = sizeFor(sl.r, Math.min(h, F.h - P.margin) / 0.96) || bs; bx = left ? B.x - P.gap - bs.w : B.x + B.w + P.gap;
            if (bx >= F.x && bx + bs.w <= F.x + F.w) return { x: Math.round(bx), y: Math.round(fb + bs.h * 0.04 - bs.h), w: bs.w, h: bs.h, clipY: fb, clipDir: -1, tag: null, B: B };
          } else if (!F || (bx >= F.x && bx + bs.w <= F.x + F.w))   // only when reserve() made room; else stand on the box
            return { x: Math.round(bx), y: Math.round(low ? B.y + B.h - bs.h : B.y), w: bs.w, h: bs.h, clipY: null, clipDir: 0, tag: null, B: B };
        }
        if (low) {                                                   // stand on the box's top edge, the flat cut hidden behind it
          var room = B.y - (F ? F.y : 0) - P.margin;
          h = Math.min(h, room / 0.94);
          sz = sizeFor(sl.r, h); if (!sz) return null;
          var half = B.w / 2 - P.inset - P.gap; if (sz.w > half && half > 16) sz = sizeFor(sl.r, sz.h * half / sz.w);   // two busts never meet in the middle
          x = left ? B.x + P.inset : B.x + B.w - P.inset - sz.w;
          yb = B.y + Math.round(sz.h * 0.06); clipY = B.y; clipDir = -1;
        } else {                                                     // box at the top: stand on the field's bottom edge
          var bot = F ? F.y + F.h : B.y + B.h + h;
          h = Math.min(h, bot - (B.y + B.h) - P.gap);
          sz = sizeFor(sl.r, h); if (!sz) return null;
          var half = B.w / 2 - P.inset - P.gap; if (sz.w > half && half > 16) sz = sizeFor(sl.r, sz.h * half / sz.w);   // two busts never meet in the middle
          x = left ? B.x + P.inset : B.x + B.w - P.inset - sz.w;
          yb = bot + Math.round(sz.h * 0.04); clipY = bot; clipDir = -1;
        }
      } else if (F) {                                                // no box: bottom corner of the field
        sz = sizeFor(sl.r, Math.min(h, F.h - P.margin)); if (!sz) return null;
        x = left ? F.x + P.margin : F.x + F.w - P.margin - sz.w;
        yb = F.y + F.h + Math.round(sz.h * 0.04); clipY = F.y + F.h; clipDir = -1;
      } else if (sl.rect) return sl.rect;
      else return null;
      var r = { x: Math.round(x), y: Math.round(yb - sz.h), w: sz.w, h: sz.h, clipY: clipY, clipDir: clipDir, tag: bi && bi.tag, B: bi && bi.B };
      if (F) r.x = clamp(r.x, F.x, F.x + F.w - r.w);
      for (var i = 0; i < ui.length; i++) {                          // shrink (keeping the foot line) until clear of your UI rects
        var vis = { x: r.x, y: r.y, w: r.w, h: (clipY != null ? clipY : r.y + r.h) - r.y };
        if (!hit(vis, ui[i])) continue;
        var nh = (clipY != null ? clipY : r.y + r.h) - (ui[i].y + ui[i].h) - 2;
        if (nh >= sz.h * 0.55 && nh < vis.h) {
          var s2 = sizeFor(sl.r, nh / 0.94); r.w = s2.w; r.h = s2.h; r.y = Math.round(yb - (yb - r.y) * s2.h / sz.h);
          if (left) r.x = Math.round(x); else r.x = Math.round(x + sz.w - s2.w);
        } else warn('ui', 'a portrait overlaps one of your uiRects (not enough room above the box); drawn anyway');
      }
      return r;
    }
    function composite(sl, img, prev, xa, dimK) {
      var s = imgSize(img); if (!s) return null;
      var c = comp[sl.side + (sl.exitT != null ? 'x' : '')];
      if (!c || c.width !== s.w || c.height !== s.h) { c = mkCanvas(s.w, s.h); comp[sl.side + (sl.exitT != null ? 'x' : '')] = c; }
      if (!c) return null;
      var g = c.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, s.w, s.h);
      var layer = function (im, a) {
        if (!im || a <= 0) return;
        g.globalAlpha = a; g.drawImage(im, 0, 0, s.w, s.h);
        if (dimK > 0) { var d = dimmed(im, P.dim); if (d) { g.globalAlpha = a * dimK; g.drawImage(d, 0, 0, s.w, s.h); } }
      };
      if (prev && prev !== img && xa < 1) { layer(prev, Math.min(1, 2 * (1 - xa))); layer(img, xa); }
      else layer(img, 1);
      g.globalAlpha = 1;
      return c;
    }
    function drawSlot(ctx, sl, leavingNow) {
      var r = leavingNow && sl.rect ? sl.rect : place(sl);
      if (!r) return;
      sl.rect = r; sl.drawnSince = true;
      var k = leavingNow ? 1 - sl.exitT / Math.max(1, P.enterMs * 0.75) : P.enterMs > 0 ? sl.enterT / P.enterMs : 1;
      if (k <= 0) return;
      var e = ease(k), dir = sl.side === 'left' ? -1 : 1, alpha = P.enter === 'none' ? 1 : smooth(k), dx = P.enter === 'slide' ? Math.round((1 - e) * Math.min(64, r.w * 0.3) * dir) : 0;
      // pick the images: blink on the neutral face, cross-fade from the previous expression
      var ex = sl.expr, cur = recImage(sl.r, ex);
      if (!cur) return;
      if (ex === 'neutral' && !leavingNow && P.blinkMs > 0 && sl.xT >= P.fadeMs && blinkAt(sl.seed, clock + sl.phase, P.blinkMs) && sl.r.imgs.blink) cur = sl.r.imgs.blink;
      var xa = P.fadeMs > 0 ? smooth(sl.xT / P.fadeMs) : 1, prev = sl.prev != null && xa < 1 ? recImage(sl.r, sl.prev) : null;
      var dimK = leavingNow ? sl.dimK : sl.dimK;
      var src = composite(sl, cur, prev, xa, dimK) || cur;
      // leaving while the box closes or after it has gone: nothing hides the flat cut any more, so fade the bottom of the
      // bust out towards the old box edge (a soft foot instead of a straight edge for the ~195 ms of the exit)
      var soft = false, bNow = leavingNow && r.clipY != null ? boxInfo() : null;
      if (leavingNow && r.clipY != null && src !== cur && (sl.boxGone || !bNow || bNow.B.y > r.clipY + 1 || bNow.B.y + bNow.B.h < r.clipY - 1)) {
        var s0 = imgSize(src), g0 = src.getContext('2d'), yc = (r.clipY - r.y) / r.h * s0.h, band = s0.h * 0.28;
        if (yc > band && yc < s0.h * 1.2) {
          var gr = g0.createLinearGradient(0, yc - band, 0, yc);
          gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
          g0.globalCompositeOperation = 'destination-out'; g0.fillStyle = gr; g0.fillRect(0, yc - band, s0.w, s0.h - yc + band);
          g0.globalCompositeOperation = 'source-over'; soft = true;
        }
      }
      // idle breathing (bottom-anchored), a small pop when the slot starts speaking, a slow bob while the box types
      var t = clock + sl.phase, br = P.breathe * Math.sin(t / P.breatheMs * Math.PI * 2);
      var sy = 1 + 0.007 * br, sx = 1 + 0.0025 * br;
      if (!leavingNow && sl.popT < 240) { var pk = 0.018 * (1 - ease(sl.popT / 240)); sx += pk; sy += pk; }
      var bob = sl.talkT > 0 ? -Math.abs(Math.sin(sl.talkT / 210 * Math.PI)) * Math.min(1, sl.talkT / 120) * Math.max(1, r.h / 120) : 0;
      var sink = sl.dimK * Math.round(r.h * 0.025);
      var flip = sl.side === 'right' && P.flip !== 'never' && !sl.r.noFlip ? sl.r.facing === 'right' : sl.side === 'left' && P.flip !== 'never' && !sl.r.noFlip && sl.r.facing === 'left';
      var w = r.w * sx, h = r.h * sy, cx = r.x + r.w / 2 + dx, by = r.y + r.h + sink + bob;
      var hole = null;
      ctx.save();
      try {
        if (r.clipY != null) {                                     // hide the flat cut behind the box; keep the name tag in front
          ctx.beginPath();
          ctx.rect(-1e4, -1e4, 3e4, 1e4 + r.clipY);
          // the name tag stays in front: a hole in the clip, only where the tag is ABOVE the clip line (below it the
          // bust is already clipped; a hole there would be in only one rect and evenodd would paint it back in)
          if (r.tag && r.tag.y < r.clipY) { hole = { x: r.tag.x, y: r.tag.y, w: r.tag.w, h: Math.min(r.tag.y + r.tag.h, r.clipY) - r.tag.y }; ctx.rect(hole.x, hole.y, hole.w, hole.h); }
          ctx.clip('evenodd');
        }
        ctx.imageSmoothingEnabled = true; try { ctx.imageSmoothingQuality = 'high'; } catch (x) { }
        ctx.globalAlpha *= alpha;
        var sh = P.shadow > 0 && !soft && sl.r.imgs.neutral ? shadowOf(sl.r.imgs.neutral) : null;
        if (sh) {                                                  // soft shadow behind the bust (blurred once from the neutral silhouette)
          var kk = w / sh.iw, a0 = ctx.globalAlpha;
          ctx.globalAlpha = a0 * P.shadow * (1 - 0.4 * sl.dimK); try { ctx.imageSmoothingQuality = 'low'; } catch (x) { }
          drawImg(ctx, sh.c, cx - w / 2 - sh.pad * kk + (sl.side === 'left' ? 5 : -5) * Math.max(1, r.h / 160), by - h - sh.pad * kk + 2, sh.c.width * kk, sh.c.height * kk, flip);
          ctx.globalAlpha = a0; try { ctx.imageSmoothingQuality = 'high'; } catch (x) { }
        }
        drawImg(ctx, src, cx - w / 2, by - h, w, h, flip);
      } finally { ctx.restore(); }
      drawn.push({ x: Math.round(cx - w / 2), y: Math.round(by - h), w: Math.round(w), h: Math.round(Math.min(h, r.clipY != null ? r.clipY - (by - h) : h)), side: sl.side, key: sl.key,
        expr: sl.expr, showing: cur === sl.r.imgs.blink ? 'blink' : (sl.r.imgs[sl.expr] ? sl.expr : 'neutral'), fading: prev ? sl.prev : null, alpha: alpha, dim: sl.dimK > 0.5,
        active: !!sl.active, talking: !!sl.talking, leaving: !!leavingNow, settled: !leavingNow && k >= 1 && xa >= 1, flip: !!flip, rest: { x: r.x, y: r.y, w: r.w, h: r.h },
        clipY: r.clipY, hole: hole });
    }
    function drawImg(ctx, img, x, y, w, h, flip) {
      if (flip) { ctx.save(); ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); ctx.restore(); }
      else ctx.drawImage(img, x, y, w, h);
    }
    function drawAll(ctx) {
      drawn = [];
      if (!ctx) return;
      try {
        ctx.save();
        try {
          leaving.forEach(function (sl) { drawSlot(ctx, sl, true); });
          ['left', 'right'].forEach(function (s) { if (slots[s] && !slots[s].active) drawSlot(ctx, slots[s], false); });   // the speaker last (in front)
          ['left', 'right'].forEach(function (s) { if (slots[s] && slots[s].active) drawSlot(ctx, slots[s], false); });
        } finally { ctx.restore(); }
      } catch (e) { warn('pdraw', 'draw failed: ' + e); }
    }
    // for the H-01 box's getAnchor: a 2x2 rect at the top of the field above the speaker's side, so the name tag sits on
    // the portrait's side (and the box never moves away from it). null for keys without a portrait.
    function anchor(key, line) {
      var r = key != null ? recFor(key, line) : null, F = field(); if (!r || !F) return null;
      var k = String(key).toLowerCase(), side = (plan && plan.map[k]) || (slots.left && slots.left.k === k ? 'left' : slots.right && slots.right.k === k ? 'right' : null) || r.side || (P.layout === 'right' ? 'right' : 'left');
      return { x: Math.round(side === 'left' ? F.x + F.w * 0.2 : F.x + F.w * 0.8) - 1, y: F.y, w: 2, h: 2 };
    }
    var api = {
      onLine: onLine,
      anchor: anchor,
      reserve: reserve,
      attach: function (dlg) { o.dialog = dlg || null; return api; },
      update: update,
      draw: drawAll,
      show: function (key, opt) {
        opt = opt || {}; var side = opt.side || castSide(key) || (P.layout === 'right' ? 'right' : 'left');
        var sl = present(key, side, opt.expr, null); if (!sl) return false;
        if (opt.expr != null) setExpr(sl, opt.expr);
        activate(sl); if (opt.instant) { sl.enterT = P.enterMs; sl.xT = 1e9; }
        return true;
      },
      hide: function (side) { if (side === 'left' || side === 'right') { startExit(slots[side]); slots[side] = null; } else exitAll(); },
      expr: function (side, e) { var sl = slots[side] || slots.left || slots.right; if (sl && normExpr(e)) setExpr(sl, e); return !!sl; },
      talk: function (side, on) { var sl = slots[side]; if (sl) sl.talking = on !== false; return !!sl; },
      clear: function () { slots = { left: null, right: null }; leaving = []; plan = null; narrating = false; convKey = null; lastSig = null; drawn = []; },
      rects: function () { return drawn.map(function (d) { return { x: d.x, y: d.y, w: d.w, h: d.h }; }); },
      lastDrawn: function () { return drawn.slice(); },
      portrait: function (key) { return recFor(key, null); },
      state: function () {
        var f = function (sl) { return sl ? { key: sl.key, side: sl.side, expr: sl.expr, active: !!sl.active, talking: !!sl.talking, dim: sl.dimK, entering: sl.enterT < P.enterMs, fading: sl.xT < P.fadeMs, rect: sl.rect && { x: sl.rect.x, y: sl.rect.y, w: sl.rect.w, h: sl.rect.h } } : null; };
        return { clock: clock, left: f(slots.left), right: f(slots.right), leaving: leaving.length, plan: plan ? { left: !!plan.sides.left, right: !!plan.sides.right } : null, ready: isReady() };
      },
      setParams: function (p) { setParams(p); },
      params: function () { var c = {}; for (var k in DEFAULTS) c[k] = P[k]; return c; },
      panelSize: function () { var w = 0, h = baseHeight(field()); for (var k in recs) { var s = recs[k] && sizeFor(recs[k], h); if (s && s.w > w) w = s.w; } return { w: w, h: Math.round(h) }; },
      ready: isReady,
      onReady: function (fn) { if (isReady()) call(fn, api); else readyFns.push(fn); return api; },
      status: function () { var out = { ready: isReady(), cast: {} }; for (var k in recs) if (recs[k]) out.cast[recs[k].key] = { loaded: Object.keys(recs[k].imgs), failed: recs[k].failed.slice(), pending: recs[k].pending }; return out; },
      useSkin: function (S) { S = S || root.GameDNA_Skin; var n = 0; try { for (var k in recs) if (recs[k] && recs[k].imgs.neutral && S && S.bitmaps) { S.bitmaps.set('portrait', recs[k].key.toLowerCase(), recs[k].imgs.neutral, { role: 'portrait' }); n++; } } catch (e) { warn('skin', 'useSkin failed: ' + e); } return n; }
    };
    return api;
  }

  // a portrait on its own (status, shop, select screens): contained in rect, bottom-aligned, centred
  function drawPanel(ctx, rec, rect, opts) {
    try {
      opts = opts || {};
      if (!ctx || !rec || !rect) return null;
      var img = recImage(rec, normExpr(opts.expr) || 'neutral'); if (!img) return null;
      if (opts.blink && rec.imgs.blink) img = rec.imgs.blink;
      var s = imgSize(img), h = num(rect.h, 96), w = num(rect.w, h * s.w / s.h), k = Math.min(w / s.w, h / s.h), dw = s.w * k, dh = s.h * k;
      var x = num(rect.x, 0) + (w - dw) / 2, y = num(rect.y, 0) + h - dh;
      ctx.save();
      try {
        ctx.beginPath(); ctx.rect(num(rect.x, 0), num(rect.y, 0), w, h); ctx.clip();
        ctx.imageSmoothingEnabled = true; if (opts.alpha != null) ctx.globalAlpha *= clamp(num(opts.alpha, 1), 0, 1);
        var src = opts.dim ? dimmed(img, 0.45) || img : img;
        if (opts.flip) { ctx.translate(x + dw, y); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0, dw, dh); } else ctx.drawImage(src, x, y, dw, dh);
      } finally { ctx.restore(); }
      return { x: x, y: y, w: dw, h: dh };
    } catch (e) { warn('panel', 'drawPanel failed: ' + e); return null; }
  }
  // preload a cast without a presenter; fn(records) when every image has loaded or failed
  function load(cast, o) {
    o = o || {};
    var keys = Object.keys(cast || {}), recs = {}, left = keys.length;
    var done = function () { if (o.onReady) { try { o.onReady(recs); } catch (e) { warn('cb', 'onReady threw: ' + e); } } };
    if (!left) { done(); return recs; }
    keys.forEach(function (k) {
      var r = recs[k] = makeRecord(k, cast[k], { base: o.base || '', assets: o.assets });
      if (r.pending) r.waiters.push(function () { if (--left === 0) done(); }); else if (--left === 0) done();
    });
    return recs;
  }

  root.GameDNA_PaintedPortraits = { version: VERSION, DEFAULTS: DEFAULTS, EXPRESSIONS: EXPRESSIONS, ALIASES: ALIASES, create: create, load: load,
    castFromManifest: castFromManifest, drawPanel: drawPanel, blinkAt: blinkAt, normExpr: normExpr };
})(typeof window !== 'undefined' ? window : this);
