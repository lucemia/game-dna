/* GameDNA talking portraits (D-05) - plain script, no import/export, one global: GameDNA_TalkingPortraits
 *
 * Portrait animation tied to dialogue: a typewriter that owns the line (or follows the game's own), a mouth that flaps
 * only while a letter is being spoken (closed on spaces, punctuation, pauses and when the line ends), seeded random
 * blinks, 1 px idle breathing, and an emotion tag per line (or inside it) that changes the face through a short
 * blink-through transition with a 1 px posture beat, never a one-frame pop.
 *
 * Faces: code-drawn pixel portraits from expressive-portraits.js (GameDNA_Portraits, D-04; load it first) built from a
 * small spec, or the game's own portrait through a draw callback that gets {emotion, mouth, eyes}.
 *
 * Deterministic: everything comes from update(dtMs) and the cast keys; no wall time, no Math.random.
 * ASCII only.
 */
(function (root) {
  'use strict';
  var VERSION = '1.2.0';
  var EMOTIONS = ['neutral', 'happy', 'angry', 'sad', 'surprised', 'determined', 'hurt'];
  var ALIAS = { calm: 'neutral', none: 'neutral', normal: 'neutral', joy: 'happy', glad: 'happy', smile: 'happy', laugh: 'happy', mad: 'angry', cross: 'angry',
    furious: 'angry', upset: 'sad', cry: 'sad', worried: 'sad', shock: 'surprised', shocked: 'surprised', wow: 'surprised', gasp: 'surprised',
    resolve: 'determined', serious: 'determined', firm: 'determined', pain: 'hurt', ouch: 'hurt', wince: 'hurt' };
  var DEFAULTS = { cps: 40, pauseMs: 300, commaMs: 140, mouthMs: 80, blinkMin: 2200, blinkMax: 5600, doubleBlink: 0.2, breathMs: 3600,
    transMs: 200, size: 48, frame: 'window', side: 'left', enterMs: 140, nameTag: 'on', margin: 4 };
  var NUMS = { cps: [5, 200], pauseMs: [0, 2000], commaMs: [0, 1000], mouthMs: [40, 300], blinkMin: [600, 20000], blinkMax: [600, 30000],
    doubleBlink: [0, 1], breathMs: [0, 20000], transMs: [100, 600], size: [16, 128], enterMs: [0, 1000], margin: [0, 32] };
  var MOUTH_SEQ = [2, 1, 2, 1];             // while a word is spoken: open, half, open, half ... (each mouthMs; short words open at once)
  var BLINK = [40, 90, 125];                // ms: half until 40, closed until 90, half until 125
  var POSTURE = { sad: 1, hurt: 1 };        // px the bust sits lower while the face holds this emotion
  var BEAT = { surprised: -1, happy: -1, angry: 1, hurt: 1, sad: 1, determined: -1 };   // px in the middle of a change INTO it

  /* ---------------- helpers ---------------- */
  var warned = {};
  function warn(k, m) { if (warned[k]) return; warned[k] = 1; try { if (root.console) root.console.warn('GameDNA_TalkingPortraits: ' + m); } catch (e) { } }
  function num(v, d) { if (v == null || v === '') return d; v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hashStr(s) { s = String(s); var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rand01(seed) { var t = (seed + 0x6D2B79F5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function mkCanvas(w, h) { try { var c = root.document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; } catch (e) { return null; } }
  function skinOf(x) { if (x === false || !root.GameDNA_Skin) return null; try { return root.GameDNA_Skin.resolve(x); } catch (e) { return null; } }
  function emotionOf(e) { if (e == null) return null; e = String(e).toLowerCase().trim(); if (EMOTIONS.indexOf(e) >= 0) return e; return ALIAS[e] || null; }
  function isLetter(c) { return !!c && /[A-Za-z0-9\u00c0-\u024f']/.test(c); }
  // the class of a character for the mouth: 'voice' (a letter is being said), 'space', 'pause' (punctuation)
  function charClass(c) { return isLetter(c) ? 'voice' : /\s/.test(c || ' ') ? 'space' : 'pause'; }

  // "[happy] Hello [sad]there" -> {text: "Hello there", tags: [{at: 0, e: 'happy'}, {at: 6, e: 'sad'}]}
  function parse(raw) {
    var s = String(raw == null ? '' : raw), out = '', tags = [], re = /\[([A-Za-z]+)\]\s?/g, last = 0, m;
    while ((m = re.exec(s))) {
      var e = emotionOf(m[1]); if (!e) continue;
      out += s.slice(last, m.index); last = m.index + m[0].length;
      if (out.length && m[0].charAt(m[0].length - 1) === ' ' && out.charAt(out.length - 1) !== ' ') out += ' ';
      tags.push({ at: out.length, e: e });
    }
    out += s.slice(last);
    return { text: out.replace(/\s+$/, ''), tags: tags };
  }
  // pause after the character at i (ms multiplier of pauseMs / commaMs), 0 = none
  function pauseAfter(chars, i, P) {
    var c = chars[i], nx = chars[i + 1];
    if (i >= chars.length - 1) return 0;
    var endOfClause = nx == null || /[\s"')\]]/.test(nx);
    if (c === '\u2026') return P.pauseMs * 1.3;
    if ((c === '.' || c === '!' || c === '?') && endOfClause) return c === '.' && chars[i - 1] === '.' ? P.pauseMs * 0.5 : P.pauseMs;
    if ((c === ',' || c === ';' || c === ':') && endOfClause) return P.commaMs;
    if (c === '-' && chars[i - 1] === ' ' && nx === ' ') return P.commaMs;
    return 0;
  }

  /* ---------------- the 16-bit frame and backdrop (used without a skin) ---------------- */
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.\'', GLYPH_ROWS = 'ehhvhhhuhhuhhuehgggheuhhhhhuvgguggvvggugggehgnhhfhhhvhhhe44444e72222ichikokihggggggvhrllhhhhhpljhhehhhhheuhhugggehhhliduhhukihfgge11uv444444hhhhhhehhhhha4hhhlllahha4ahhhha4444v1248gvehjlphe4c4444eeh1248vv2421he26aiv22vgu11he68guhhev124888ehhehheehhf12c000e00000000cc4480000';   // 5x7 caps for the name plate without a skin (pixel16 ui glyphs)
  function capsW(str) { return str.length * 6 - 1; }
  function capsText(g, str, x, y, col, sh) {
    for (var pass = 0; pass < 2; pass++) {
      g.fillStyle = pass ? col : sh;
      for (var i = 0; i < str.length; i++) {
        var k = GLYPHS.indexOf(str.charAt(i)); if (k < 0) continue;
        for (var ry = 0; ry < 7; ry++) { var bits = parseInt(GLYPH_ROWS.charAt(k * 7 + ry), 32); for (var rx = 0; rx < 5; rx++) if (bits & (16 >> rx)) g.fillRect(x + i * 6 + rx + (pass ? 0 : 1), y + ry + (pass ? 0 : 1), 1, 1); }
      }
    }
  }
  function frame16(g, r) {
    g.fillStyle = '#06061a'; g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = '#d8deff'; g.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    g.fillStyle = '#5a64a8'; g.fillRect(r.x + 2, r.y + 2, r.w - 3, r.h - 3);
    g.fillStyle = '#0e1238'; g.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
  }
  var BG = { dusk: '#3c3a6a', moss: '#3e5a46', ember: '#6a3a32', sea: '#2c5068', plum: '#563a62', sand: '#7a6646', slate: '#45506a', rose: '#6a4256' };
  function hexRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h.slice(0, 6), 16); if (!isFinite(n)) n = 0x45506a; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mixHex(a, b, k) { a = hexRgb(a); b = hexRgb(b); var c = [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * k); }); return 'rgb(' + c.join(',') + ')'; }
  var BGC = {};
  function backdrop(bg, w, h) {
    var base = BG[bg] || (/^#/.test(String(bg)) ? bg : BG.slate), key = base + w + 'x' + h;
    if (BGC[key] !== undefined) return BGC[key];
    var c = mkCanvas(w, h); BGC[key] = c; if (!c) return c;
    var g = c.getContext('2d'), bands = [mixHex(base, '#ffffff', 0.12), mixHex(base, base, 0), mixHex(base, '#000010', 0.22), mixHex(base, '#000010', 0.4)];
    for (var y = 0; y < h; y++) {
      var f = y / h * 4, b = Math.floor(f), fr = f - b;
      for (var x = 0; x < w; x++) { var k = b < 3 && fr > 0.75 && (x + y) % 2 === 0 ? b + 1 : b; g.fillStyle = bands[Math.min(3, k)]; g.fillRect(x, y, 1, 1); }
    }
    g.fillStyle = mixHex(base, '#ffffff', 0.2);
    var cx = w * 0.38, cy = h * 0.38, rad = w * 0.36;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rad; if (d < 0.8 || (d < 1 && (x + y) % 2 === 0)) g.fillRect(x, y, 1, 1); }
    return c;
  }

  /* ---------------- D-04 face pixels, with D-05's own surprised mouth frames ---------------- */
  // D-04 draws its surprised "o" at every mouth level, so a surprised face could not talk. D-05 keeps D-04 unchanged and
  // makes three frames itself: shut = the closed (neutral) mouth, half = D-04's "o", open = a larger "O" in the o's colours.
  function samePx(a, b, i) { return a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3]; }
  function diffBox(A, B, S, rowMin) {
    var b = null;
    for (var y = rowMin || 0; y < S; y++) for (var x = 0; x < S; x++) {
      var i = (y * S + x) * 4; if (samePx(A.data, B.data, i)) continue;
      if (!b) b = { x0: x, y0: y, x1: x, y1: y }; else { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
    }
    return b;
  }
  function lumA(d, i) { return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; }
  function mouthGeo(p, outline) {
    if (p.__tpGeo && p.__tpGeo.ol === outline) return p.__tpGeo;
    var GP = root.GameDNA_Portraits, S = p.size, n0 = GP.pixels(p, 'neutral', 'open', 0, outline), n2 = GP.pixels(p, 'neutral', 'open', 2, outline);
    var nb = diffBox(n0, n2, S, Math.floor(S * 0.45)) || { x0: Math.floor(S / 2) - 2, y0: Math.floor(S * 0.7), x1: Math.floor(S / 2) + 2, y1: Math.floor(S * 0.7) + 2 };
    var s0 = GP.pixels(p, 'surprised', 'open', 0, outline), ob = diffBox(n0, s0, S, nb.y0 - 3) || nb;
    var cols = [], o = s0.data;
    for (var y = ob.y0; y <= ob.y1; y++) for (var x = ob.x0; x <= ob.x1; x++) { var i = (y * S + x) * 4; if (!samePx(n0.data, s0.data, i) && o[i + 3]) cols.push([lumA(o, i), o[i], o[i + 1], o[i + 2]]); }
    cols.sort(function (a, b) { return a[0] - b[0]; });
    var pick = function (k) { var c = cols[Math.min(cols.length - 1, Math.max(0, Math.round(k * (cols.length - 1))))] || [0, 40, 10, 20]; return [c[1], c[2], c[3]]; };
    var tongue = null, d2 = n2.data;     // the reddest pixel of D-04's own open neutral mouth
    for (y = nb.y0; y <= nb.y1; y++) for (x = nb.x0; x <= nb.x1; x++) { i = (y * S + x) * 4; var r = d2[i] - (d2[i + 1] + d2[i + 2]) / 2; if (!samePx(n0.data, n2.data, i) && (!tongue || r > tongue[0])) tongue = [r, d2[i], d2[i + 1], d2[i + 2]]; }
    p.__tpGeo = { ol: outline, nb: nb, ob: ob, line: pick(0), inner: pick(0.4), tongue: tongue ? [tongue[1], tongue[2], tongue[3]] : pick(1) };
    return p.__tpGeo;
  }
  function facePixels(p, expr, eyes, mouth, outline) {
    var GP = root.GameDNA_Portraits; if (!GP || !p) return null;
    if (!p.__portrait) p = GP.make(p);
    if (!p.base) return null;
    expr = emotionOf(expr) || 'neutral'; eyes = eyes === 'half' || eyes === 'closed' ? eyes : 'open'; mouth = clamp(Math.round(num(mouth, 0)), 0, 2); outline = outline || '#06061a';
    var key = expr + '|' + eyes + '|' + mouth + '|' + outline; p.__tpPx = p.__tpPx || {};
    if (p.__tpPx[key]) return p.__tpPx[key];
    if (Object.keys(p.__tpPx).length > 200) p.__tpPx = {};
    var out = GP.pixels(p, expr, eyes, expr === 'surprised' ? 0 : mouth, outline);
    if (expr === 'surprised' && mouth !== 1) {
      var g = mouthGeo(p, outline), S = p.size, d = out.data, n0 = GP.pixels(p, 'neutral', eyes, 0, outline).data;
      var x0 = Math.min(g.nb.x0, g.ob.x0) - 1, x1 = Math.max(g.nb.x1, g.ob.x1) + 1, y0 = Math.min(g.nb.y0, g.ob.y0), y1 = Math.max(g.nb.y1, g.ob.y1) + 1, x, y, i;
      for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) { if (x < 0 || y < 0 || x >= S || y >= S) continue; i = (y * S + x) * 4; d[i] = n0[i]; d[i + 1] = n0[i + 1]; d[i + 2] = n0[i + 2]; d[i + 3] = n0[i + 3]; }
      if (mouth === 2) {     // a larger "O": the o's box grown by 1 px left, right and up, rounded corners, a dark inside, the tongue at the bottom
        var bx0 = g.ob.x0 - 1, bx1 = g.ob.x1 + 1, by0 = g.ob.y0 - 1, by1 = g.ob.y1;
        var put = function (x, y, c) { if (x < 0 || y < 0 || x >= S || y >= S) return; var j = (y * S + x) * 4; d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = 255; };
        for (y = by0; y <= by1; y++) for (x = bx0; x <= bx1; x++) {
          var cx = (x === bx0 || x === bx1), cy = (y === by0 || y === by1);
          if (cx && cy) continue;                                                     // rounded corner
          var edge = cx || cy || ((x === bx0 + 1 || x === bx1 - 1) && (y === by0 + 1 || y === by1 - 1));
          put(x, y, edge ? g.line : y === by1 - 1 ? g.tongue : g.inner);
        }
      }
    }
    p.__tpPx[key] = out; return out;
  }

  /* ---------------- instance ---------------- */
  function create(o) {
    o = o || {};
    var P = {}, SKN = skinOf(o.skin === undefined ? undefined : o.skin), clock = 0, lineNo = 0, L = null, faces = {}, castRaw = o.cast || {};
    var panel = null, leaving = null, drawn = [], lastLayout = null, blipN = 0;
    function setParams(p) {
      p = p || {};
      for (var k in DEFAULTS) if (P[k] == null) P[k] = DEFAULTS[k];
      for (k in p) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULTS, k)) continue;
        if (typeof DEFAULTS[k] === 'number') { var r = NUMS[k]; P[k] = clamp(num(p[k], P[k]), r[0], r[1]); }
        else if (p[k] != null && p[k] !== '') P[k] = String(p[k]);
      }
      if (P.blinkMax < P.blinkMin) P.blinkMax = P.blinkMin;
      P.size = Math.round(P.size);
    }
    setParams(o.params);
    var OLC = null;
    function outlineCol() {        // the sprite outline colour of the skin (as D-04 uses it), else D-04's ink
      if (OLC) return OLC; OLC = '#06061a';
      if (SKN) { try { var c = SKN.outline && SKN.outline.sprite && SKN.outline.sprite.color, v = c ? SKN.token(c) : null; if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) OLC = v; else if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) OLC = c; else { var ink = SKN.token('ink'); if (typeof ink === 'string' && /^#[0-9a-f]{6}$/i.test(ink)) OLC = ink; } } catch (e) { } }
      return OLC;
    }
    function call(fn) { if (typeof fn === 'function') { try { return fn.apply(null, Array.prototype.slice.call(arguments, 1)); } catch (x) { warn('cb', 'a host callback threw: ' + x); } } return undefined; }   // every argument passed on

    /* ----- faces ----- */
    function castEntry(key) {
      if (key == null || key === '') return null;
      var k = String(key).toLowerCase();
      for (var n in castRaw) if (String(n).toLowerCase() === k) return { name: n, v: castRaw[n] };
      var g = call(o.getPortrait, key); return g ? { name: String(key), v: g } : null;
    }
    function face(key) {
      if (key == null || key === '') return null;
      var k = String(key).toLowerCase();
      if (faces[k] !== undefined) return faces[k];
      var ce = castEntry(key), f = null;
      if (ce && ce.v) {
        var v = ce.v, src = null, w = 0, h = 0;
        if (typeof v.draw === 'function' && !v.__portrait) { src = { host: v }; w = Math.round(num(v.w, num(v.size, P.size))); h = Math.round(num(v.h, num(v.size, P.size))); }
        else if (root.GameDNA_Portraits) {
          try { var pr = v.__portrait ? v : root.GameDNA_Portraits.make(v.name == null && v.seed == null ? Object.assign({ name: ce.name }, v) : v, { size: P.size }); if (pr && pr.size) { src = { d04: pr }; w = h = pr.size; } } catch (e) { src = null; }
        } else warn('d04', 'cast "' + ce.name + '" is a portrait spec but expressive-portraits.js (GameDNA_Portraits) is not loaded: no face is drawn');
        if (src && w > 0 && h > 0) {
          var seed = hashStr('face:' + k);
          f = { k: k, name: v.label || ce.name, side: v.side === 'right' || v.side === 'left' ? v.side : null, bg: v.bg || (src.d04 && src.d04.spec && src.d04.spec.bg) || 'slate',
            src: src, w: w, h: h, seed: seed, t: 0, emo: emotionOf(v.emotion) || 'neutral', from: null, transT: -1, blinkT: -1, blinks: 0, nextBlink: 0,
            phase: seed % 1700, mouth: 0, eyes: 'open', shown: 'neutral', bob: 0, breath: 0, talkT: 0, react: null, log: [], off: null };
          f.nextBlink = 600 + (seed % 1400);
          f.shown = f.emo;
        }
      }
      faces[k] = f; return f;
    }
    function blinkGap(f) { var r = rand01(f.seed + f.blinks * 7919); return P.blinkMin + r * (P.blinkMax - P.blinkMin); }
    function logEv(f, kind) { f.log.push({ t: Math.round(f.t), kind: kind }); if (f.log.length > 64) f.log.shift(); }
    function setEmo(f, e) {
      e = emotionOf(e); if (!f || !e || e === f.emo && f.transT < 0) return;
      if (e === f.emo) return;
      f.from = f.shown; f.emo = e; f.transT = 0; f.blinkT = -1; logEv(f, 'trans');
    }
    function tickFace(f, dt) {
      f.t += dt;
      if (f.react && f.t >= f.react.until) { var back = f.react.back; f.react = null; setEmo(f, back); }
      if (f.transT >= 0) { f.transT += dt; if (f.transT >= P.transMs) { f.transT = -1; f.from = null; f.nextBlink = f.t + blinkGap(f); } }
      else {
        if (f.blinkT < 0 && P.blinkMax > 0 && f.t >= f.nextBlink) { f.blinkT = 0; f.blinks++; logEv(f, 'blink'); }
        if (f.blinkT >= 0) {
          f.blinkT += dt;
          if (f.blinkT >= BLINK[2]) { f.blinkT = -1; var dbl = rand01(f.seed ^ (f.blinks * 104729)) < P.doubleBlink && !f.lastDouble; f.lastDouble = dbl; f.nextBlink = f.t + (dbl ? 150 : blinkGap(f)); }
        }
      }
      // what is drawn this frame
      var k = f.transT >= 0 ? f.transT / P.transMs : -1;
      if (k >= 0) {
        f.shown = k < 0.3 ? f.from : f.emo;
        f.eyes = k < 0.3 || k >= 0.7 ? 'half' : 'closed';
        f.bob = k < 0.3 ? (POSTURE[f.from] || 0) : k < 0.7 ? (BEAT[f.emo] != null ? BEAT[f.emo] : POSTURE[f.emo] || 0) : (POSTURE[f.emo] || 0);
      } else {
        f.shown = f.emo; f.bob = POSTURE[f.emo] || 0;
        f.eyes = f.blinkT < 0 ? 'open' : f.blinkT < BLINK[0] ? 'half' : f.blinkT < BLINK[1] ? 'closed' : 'half';
      }
      f.breath = P.breathMs > 0 && ((f.t + f.phase) % P.breathMs) < P.breathMs * 0.5 ? 1 : 0;
      // the drawn offset follows posture + breath one pixel per frame at most (no jumps)
      var want = f.bob - f.breath; if (f.dy == null) f.dy = want; else if (want > f.dy) f.dy++; else if (want < f.dy) f.dy--;
    }

    /* ----- the line (typewriter) ----- */
    function keyFor(who) { return who != null && face(who) ? String(who).toLowerCase() : null; }
    function say(line, opt) {
      try {
        opt = opt || {};
        var text = line, who = opt.who, emo = opt.emotion;
        if (line && typeof line === 'object') { text = line.text != null ? line.text : line.say != null ? line.say : line.line; who = who != null ? who : line.who != null ? line.who : line.speaker != null ? line.speaker : line.name; emo = emo != null ? emo : line.emotion != null ? line.emotion : line.expr != null ? line.expr : line.mood; }
        text = String(text == null ? '' : text);
        if (who == null && opt.names !== false) {
          var m = /^\s*([A-Za-z][A-Za-z0-9' .-]{0,18}):\s+/.exec(text);
          if (m && castEntry(m[1].trim())) { who = m[1].trim(); text = text.slice(m[0].length); }
        }
        var pr = parse(text), key = keyFor(who), f = key ? face(key) : null;
        var lead = pr.tags.length && pr.tags[0].at === 0 ? pr.tags.shift().e : null;
        var e0 = emotionOf(emo) || lead || (opt.keepEmotion && f ? f.emo : 'neutral');
        var side = opt.side === 'left' || opt.side === 'right' ? opt.side : f && f.side ? f.side : P.side === 'right' ? 'right' : 'left';
        lineNo++;
        L = { id: lineNo, who: who != null ? String(who) : null, key: key, text: pr.text, chars: Array.from ? Array.from(pr.text) : pr.text.split(''), tags: pr.tags,
          shown: 0, acc: 0, wait: 0, delay: 0, done: false, open: true, ext: !!opt.external, still: 0, side: side, name: f ? f.name : null };
        if (f) { if (f.react) f.react = null; setEmo(f, e0); }
        // the speaker panel: enter (after the old one leaves when it is a different face)
        if (f && (!panel || panel.k !== key || panel.side !== side)) {
          var wait = 0;
          if (panel) { leaving = { k: panel.k, side: panel.side, t: 0 }; wait = panel.side === side ? Math.round(P.enterMs * 0.6) : 0; }
          panel = { k: key, side: side, t: -wait };
          L.delay = wait + P.enterMs;
        } else if (!f && panel) { leaving = { k: panel.k, side: panel.side, t: 0 }; panel = null; }
        if (!L.chars.length) L.done = true;
        return L.id;
      } catch (e) { warn('say', 'say failed: ' + e); return 0; }
    }
    function applyTags(upto) {
      if (!L || !L.key) return;
      while (L.tags.length && L.tags[0].at < upto) setEmo(face(L.key), L.tags.shift().e);
    }
    function reveal() {
      L.shown++; applyTags(L.shown);
      var c = L.chars[L.shown - 1];
      if (isLetter(c) && ++blipN % 2 === 0) call(o.onBlip, c, L.shown - 1, L.id);
      var p = pauseAfter(L.chars, L.shown - 1, P); if (p > 0) L.wait = p;
      if (L.shown >= L.chars.length) { L.done = true; L.wait = 0; call(o.onDone, L.id); }
    }
    function voiced() {
      if (!L || !L.open || L.done || L.delay > 0 || L.wait > 0 || L.shown <= 0 || !L.key) return false;
      if (L.ext && L.still >= 3) return false;
      return charClass(L.chars[L.shown - 1]) === 'voice';
    }
    function step(dt) {
      clock += dt;
      if (panel) panel.t += dt;
      if (leaving) { leaving.t += dt; if (leaving.t >= P.enterMs * 0.6) leaving = null; }
      if (L && L.open && !L.done && !L.ext) {
        if (L.delay > 0) L.delay -= dt;
        else if (L.wait > 0) { L.wait -= dt; if (L.wait < 0) { L.acc = -L.wait * P.cps / 1000; L.wait = 0; } }
        else L.acc += dt * P.cps / 1000;
        while (L.delay <= 0 && L.wait <= 0 && L.acc >= 1 && !L.done) { L.acc -= 1; reveal(); }
      } else if (L && L.ext) { if (L.delay > 0) L.delay -= dt; L.still++; }
      for (var k in faces) if (faces[k]) {
        var f = faces[k]; tickFace(f, dt);
        var speaking = L && L.key === k && voiced();
        if (speaking) { f.mouth = MOUTH_SEQ[Math.floor(f.talkT / P.mouthMs) % MOUTH_SEQ.length]; f.talkT += dt; }
        else { f.mouth = 0; f.talkT = 0; }
      }
    }
    function update(dtMs) {
      try {
        var dt = num(dtMs, 1000 / 60); if (!(dt >= 0)) dt = 0; dt = Math.min(dt, 250);
        if (L && L.key) face(L.key);
        drawn = [];
        step(dt);
      } catch (e) { warn('update', 'update failed: ' + e); }
    }
    // the game's own typewriter: call every step with the full text and how many characters it shows
    function follow(text, shownChars, opt) {
      try {
        opt = opt || {};
        var full = String(text == null ? '' : text);
        if (!L || !L.ext || L.raw !== full || (opt.who != null && String(opt.who) !== L.who)) { say(full, { who: opt.who, emotion: opt.emotion, side: opt.side, external: true, names: opt.names }); L.raw = full; }
        var n = clamp(Math.floor(num(shownChars, 0)), 0, L.chars.length);
        if (n !== L.shown) { L.still = 0; while (L.shown < n) reveal(); if (n < L.shown) L.shown = n; L.wait = 0; }
        if (opt.paused) L.still = 99;
        if (L.shown >= L.chars.length) L.done = true;
      } catch (e) { warn('follow', 'follow failed: ' + e); }
    }
    function press() {
      if (!L || !L.open || L.done) return false;
      while (L.shown < L.chars.length) { L.shown++; applyTags(L.shown); }
      L.done = true; L.wait = 0; L.delay = 0; call(o.onDone, L.id);
      return true;
    }
    function close() { if (L) L.open = false; if (panel) { leaving = { k: panel.k, side: panel.side, t: 0 }; panel = null; } }

    /* ----- layout and drawing ----- */
    function panelW(f) { return f ? (P.frame === 'none' ? f.w : f.w + 8) : 0; }
    function panelH(f) { return f ? (P.frame === 'none' ? f.h : f.h + 8) : 0; }
    function nameW(s) { s = String(s || '').toUpperCase(); if (o.font && o.font.measure) { var w = call(o.font.measure, s); if (w > 0) return w; } if (SKN) { try { return SKN.measure(s, { font: 'ui' }); } catch (e) { } } return capsW(s); }
    function okBox(b) { return b && isFinite(b.x) && isFinite(b.y) && b.w > 8 && b.h > 8; }
    function layout(box, opt) {
      if (!okBox(box)) return null;
      opt = opt || {};
      var key = opt.key !== undefined ? opt.key : panel ? panel.k : null, f = key ? face(key) : null, side = opt.side || (panel ? panel.side : P.side);
      var m = P.margin, out = { box: { x: box.x, y: box.y, w: box.w, h: box.h }, portrait: null, side: side, name: null };
      var tx = box.x + m + 4, tw = box.w - 2 * m - 8;
      if (f) {
        var pw = panelW(f), ph = panelH(f);
        var px = side === 'right' ? box.x + box.w - m - pw : box.x + m;
        var py = box.h >= ph + 2 * m ? box.y + Math.floor((box.h - ph) / 2) : box.y + box.h - m - ph;
        out.portrait = { x: px, y: py, w: pw, h: ph };
        if (side === 'right') { tx = box.x + m + 4; tw = px - 6 - tx; } else { tx = px + pw + 6; tw = box.x + box.w - m - 4 - tx; }
      }
      var nm = L && L.open && L.name && P.nameTag !== 'off' ? L.name : null, ty = box.y + m + 3;
      if (nm) { var nw = nameW(nm) + 12, ny = box.y - 6 >= 0 ? box.y - 6 : box.y + m; out.name = { x: side === 'right' && f ? Math.max(box.x + m, tx + tw - nw) : tx - 2, y: ny, w: nw, h: 13, text: String(nm).toUpperCase() }; ty = Math.max(ty, ny + 15); }
      out.text = { x: tx, y: ty, w: Math.max(8, tw), h: Math.max(8, box.y + box.h - m - ty) };
      return out;
    }
    function renderFace(f) {
      if (!f.off || f.off.width !== f.w || f.off.height !== f.h) f.off = mkCanvas(f.w, f.h);
      var c = f.off; if (!c) return null;
      var g = c.getContext('2d'); g.clearRect(0, 0, f.w, f.h); g.imageSmoothingEnabled = false;
      var info = { emotion: f.shown, mouth: f.mouth, eyes: f.eyes, talking: f.mouth > 0, t: f.t, w: f.w, h: f.h };
      if (f.src.d04) {
        var px = facePixels(f.src.d04, f.shown, f.eyes, f.mouth, outlineCol());
        if (px) { var im = g.createImageData(px.w, px.h); im.data.set(px.data); g.putImageData(im, 0, 0); }
      }
      else call(f.src.host.draw, g, 0, 0, info);
      return c;
    }
    // bust with the posture offset dy (+ down, - up) and breath (1 = up): rows that leave the bottom are refilled from the last row
    function blitBust(ctx, c, f, x, y, clipH) {
      var dy = f.dy || 0, W = f.w, H = f.h;
      if (dy < 0) {
        var k = -dy; ctx.drawImage(c, 0, k, W, H - k, x, y, W, H - k);
        for (var i = 0; i < k; i++) ctx.drawImage(c, 0, H - 1, W, 1, x, y + H - k + i, W, 1);
      } else if (dy > 0) ctx.drawImage(c, 0, 0, W, H - dy, x, y + dy, W, H - dy);
      else ctx.drawImage(c, x, y);
      void clipH;
    }
    function drawPanelAt(ctx, f, x, y, alpha, frameKind) {
      var fr = frameKind || P.frame, pad = fr === 'none' ? 0 : 4, r = { x: Math.round(x), y: Math.round(y), w: f.w + 2 * pad, h: f.h + 2 * pad };
      var c = renderFace(f); if (!c) return null;
      ctx.save();
      try {
        ctx.imageSmoothingEnabled = false; if (alpha < 1) ctx.globalAlpha *= alpha;
        if (fr !== 'none') {
          var got = null;
          if (SKN) { try { got = SKN.frame(ctx, r, { role: fr === 'plate' ? 'plate' : 'window', team: 'n', alpha: 1 }); } catch (e) { got = null; } }
          if (!got) frame16(ctx, r);
          var bd = backdrop(f.bg, f.w, f.h); if (bd) ctx.drawImage(bd, r.x + pad, r.y + pad);
        }
        ctx.beginPath(); ctx.rect(r.x + pad, r.y + pad, f.w, f.h); ctx.clip();
        blitBust(ctx, c, f, r.x + pad, r.y + pad);
      } finally { ctx.restore(); }
      return r;
    }
    function stepAlpha(k) { k = clamp(k, 0, 1); return Math.ceil(k * 4 - 1e-6) / 4; }
    function drawName(ctx, nr) {
      if (!nr) return;
      var got = null;
      if (SKN) { try { got = SKN.frame(ctx, nr, { role: 'plate', team: 'n' }); } catch (e) { got = null; } }
      if (!got) { ctx.fillStyle = '#06061a'; ctx.fillRect(nr.x, nr.y, nr.w, nr.h); ctx.fillStyle = '#2c3470'; ctx.fillRect(nr.x + 1, nr.y + 1, nr.w - 2, nr.h - 2); ctx.fillStyle = '#5a64a8'; ctx.fillRect(nr.x + 1, nr.y + 1, nr.w - 2, 1); }
      var tx = nr.x + 6, ty = nr.y + 3;
      if (o.font && o.font.draw) { call(o.font.draw, ctx, nr.text, tx, ty); return; }
      if (SKN) { try { SKN.text(ctx, nr.text, tx, ty, { font: 'ui', color: '#ffe08a' }); return; } catch (e) { } }
      capsText(ctx, nr.text, tx, ty, '#ffe08a', '#06061a');
    }
    // the speaker's panel inside (or rising above) the game's dialogue box; returns the layout (text rect for the game's text)
    function drawSpeaker(ctx, box) {
      try {
        if (!ctx) return null;
        var lay = layout(box); if (!lay) return null; lastLayout = lay; drawn = [];
        if (leaving) {
          var lf = face(leaving.k), lk = 1 - leaving.t / Math.max(1, P.enterMs * 0.6);
          if (lf && lk > 0) { var ll = layout(box, { key: leaving.k, side: leaving.side }); if (ll && ll.portrait && !(panel && panel.side === leaving.side && panel.t >= 0)) drawPanelAt(ctx, lf, ll.portrait.x, ll.portrait.y + Math.round((1 - lk) * 3), stepAlpha(lk)); }
        }
        if (panel && lay.portrait && panel.t >= 0) {
          var f = face(panel.k), k = P.enterMs > 0 ? panel.t / P.enterMs : 1, rise = Math.round((1 - clamp(k, 0, 1)) * 3);
          if (f) { var r = drawPanelAt(ctx, f, lay.portrait.x, lay.portrait.y + rise, stepAlpha(k)); if (r) drawn.push({ x: r.x, y: r.y, w: r.w, h: r.h, owner: panel.k, kind: 'portrait' }); }
        }
        if (lay.name && L && L.open && (!panel || panel.t >= 0)) { drawName(ctx, lay.name); drawn.push({ x: lay.name.x, y: lay.name.y, w: lay.name.w, h: lay.name.h, owner: L.key, kind: 'name' }); }
        return lay;
      } catch (e) { warn('draw', 'drawSpeaker failed: ' + e); return null; }
    }
    // any face anywhere (party HUD, status screen); it keeps blinking and breathing on the same clock
    function drawFace(ctx, key, x, y, opt) {
      try { opt = opt || {}; var f = face(key); if (!ctx || !f || !isFinite(x) || !isFinite(y)) return null; var r = drawPanelAt(ctx, f, x, y, opt.alpha == null ? 1 : clamp(num(opt.alpha, 1), 0, 1), opt.frame); if (r) { drawn = drawn.filter(function (d) { return !(d.kind === 'face' && d.owner === f.k); }); drawn.push({ x: r.x, y: r.y, w: r.w, h: r.h, owner: f.k, kind: 'face' }); } return r; }
      catch (e) { warn('face', 'drawFace failed: ' + e); return null; }
    }
    // visible rows, wrapped on the FULL line so words never jump to the next row while they type
    function rows(measure, width) {
      if (!L) return [];
      var ms = typeof measure === 'function' ? function (s) { var v = call(measure, s); return isFinite(v) ? v : s.length * 6; } : function (s) { return s.length * 6; };
      var words = L.text.split(' '), out = [], cur = '', start = 0, pos = 0, lines = [];
      for (var i = 0; i < words.length; i++) {
        var tryS = cur ? cur + ' ' + words[i] : words[i];
        if (cur && ms(tryS) > width) { lines.push({ s: cur, at: start }); start = pos; cur = words[i]; } else cur = tryS;
        pos += words[i].length + 1;
      }
      if (cur || !lines.length) lines.push({ s: cur, at: start });
      for (i = 0; i < lines.length; i++) { var n = L.shown - lines[i].at; if (n <= 0) break; out.push(lines[i].s.slice(0, n)); }
      return out;
    }
    function faceState(f) { return f ? { key: f.k, emotion: f.emo, shown: f.shown, eyes: f.eyes, mouth: f.mouth, bob: f.bob, breath: f.breath, dy: f.dy || 0, trans: f.transT >= 0 ? Math.round(f.transT) : -1, blinks: f.blinks, from: f.from } : null; }
    function state() {
      var fs = {}; for (var k in faces) if (faces[k]) fs[k] = faceState(faces[k]);
      var last = L && L.shown > 0 ? L.chars[L.shown - 1] : null;
      return { t: Math.round(clock), line: L ? { id: L.id, who: L.who, key: L.key, text: L.text, shown: L.shown, n: L.chars.length, done: L.done, open: L.open, waiting: L.wait > 0 || L.delay > 0, voiced: voiced(), last: last, lastClass: last == null ? null : charClass(last) } : null,
        panel: panel ? { key: panel.k, side: panel.side, entering: panel.t < P.enterMs } : null, leaving: leaving ? leaving.k : null, faces: fs };
    }
    return {
      say: say, follow: follow, press: press, skip: press, close: close, update: update, drawSpeaker: drawSpeaker, drawFace: drawFace, layout: function (b, op) { return layout(b, op); }, rows: rows,
      text: function () { return L ? L.chars.slice(0, L.shown).join('') : ''; },
      fullText: function () { return L ? L.text : ''; },
      shown: function () { return L ? L.shown : 0; },
      done: function () { return !L || L.done; },
      typing: function () { return !!(L && L.open && !L.done); },
      speaker: function () { return L && L.open ? L.who : null; },
      react: function (key, e, ms) { var f = face(key); if (!f || !emotionOf(e)) return false; var back = f.react ? f.react.back : f.emo; setEmo(f, e); f.react = { until: f.t + Math.max(P.transMs * 2, num(ms, 900)), back: back }; return true; },
      setEmotion: function (key, e) { var f = face(key); if (!f) return false; f.react = null; setEmo(f, e); return true; },
      emotion: function (key) { var f = face(key); return f ? f.emo : null; },
      face: function (key) { return faceState(face(key)); },
      has: function (key) { return !!face(key); },
      clear: function () { L = null; panel = null; leaving = null; drawn = []; for (var k in faces) if (faces[k]) { var f = faces[k]; f.emo = f.shown = 'neutral'; f.from = null; f.transT = -1; f.react = null; f.mouth = 0; f.talkT = 0; } },
      rects: function () { return drawn.map(function (d) { return { x: d.x, y: d.y, w: d.w, h: d.h }; }); },
      lastDrawn: function () { return drawn.slice(); },
      lastLayout: function () { return lastLayout; },
      blinkLog: function (key) { var f = face(key); return f ? f.log.slice() : []; },
      state: state,
      setParams: function (p) { setParams(p); },
      params: function () { var c = {}; for (var k in P) c[k] = P[k]; return c; }
    };
  }

  root.GameDNA_TalkingPortraits = { version: VERSION, EMOTIONS: EMOTIONS.slice(), DEFAULTS: DEFAULTS, create: create, parse: parse, charClass: charClass, emotionOf: emotionOf, facePixels: facePixels };
})(typeof window !== 'undefined' ? window : this);
