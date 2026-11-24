/* GameDNA G-08 · Branching run map · module v1 (plain script, no dependencies, one global: GameDNA_RunMap)
 *
 *   const run = GameDNA_RunMap.create({
 *     view: { w: 640, h: 360 },                       // native play field (or bounds: { x, y, w, h })
 *     params: { seed: 1, floors: 6, width: 5, paths: 4 },
 *     onEnter: node => { ... },                       // node = { id, type, floor, floors, tier, seed, ... }; synchronous, inside update()
 *                                                     //   battle / elite / boss: start YOUR fight or room, call run.finish({ won }) when it ends
 *                                                     //   rest / shop / event: return nothing (the module shows its panel with your choices)
 *                                                     //   or return 'host' (you run it yourself and call run.finish())
 *     nodes: { rest: { choices: [...] }, shop: { choices: [...] }, event: { pool: [...] } },   // choices: { label, text, cost, apply(node) }
 *     getGold: () => coins, spendGold: n => { coins -= n; }, hpFrac: () => hp / maxHp,
 *     onRunEnd: r => {},                              // after the boss is finished ({ won: true }) or a lost fight ({ won: false })
 *     autoplay: () => AUTOPLAY, uiRects: () => [hudRect]
 *   });
 *   run.start()                 // new run: generate the map from the seed and open it (the world waits while run.busy())
 *   run.finish({ won: true })   // the fight / room of the current node is over: the map reopens one floor higher
 *   run.busy()                  // true while the map, the travel or a node panel is on screen: pause the world, send input here
 *   run.key(code, down) / run.press('left' | 'right' | 'up' | 'down' | 'confirm' | 'back') / run.pointer(x, y, down)
 *   run.update(dtMs)            // the only clock (fixed step, also while busy), so ?t=&freeze=1 is deterministic
 *   run.draw(ctx)               // last in the draw pass: the map while busy, a small floor badge while a node is away
 *
 * Generation is a pure function of (seed, floors, width, paths, weights): GameDNA_RunMap.generate(seed, params).
 * Paths never cross; every node lies on a route from the bottom row to the boss.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0';
  var DEFAULTS = { seed: 1, floors: 6, width: 5, paths: 4, wBattle: 46, wElite: 14, wEvent: 22, wShop: 8, wRest: 10, eliteFrom: 3,
    restBefore: 'on', look: 'auto', dim: 0.62, openMs: 320, travelMs: 620, closeMs: 260, resultMs: 900, autoMs: 900,
    autoRoute: 'balanced', reopen: 'auto', badge: 'on', title: 'Choose your path', pixelBelow: 300, legend: 'on' };
  var KEYS = { ArrowLeft: 'left', KeyA: 'left', a: 'left', A: 'left', ArrowRight: 'right', KeyD: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', KeyW: 'up', w: 'up', W: 'up', ArrowDown: 'down', KeyS: 'down', s: 'down', S: 'down',
    KeyZ: 'confirm', z: 'confirm', Z: 'confirm', Space: 'confirm', ' ': 'confirm', Enter: 'confirm', NumpadEnter: 'confirm',
    KeyX: 'back', x: 'back', X: 'back', Escape: 'back', Backspace: 'back' };
  var TYPES = ['battle', 'elite', 'event', 'shop', 'rest', 'boss'];
  var ROLL = ['battle', 'elite', 'event', 'shop', 'rest'];
  var FIGHT = { battle: 1, elite: 1, boss: 1 };
  var LOOK = {
    battle: { label: 'Battle', desc: 'A fight on the road', short: 'A fight', col: '#efe2c4' },
    elite: { label: 'Elite', desc: 'A tougher foe, a better prize', short: 'Tough foe, big prize', col: '#ff8a66' },
    event: { label: 'Event', desc: 'Something unexpected', short: 'Something odd', col: '#c6a8ff' },
    shop: { label: 'Shop', desc: 'Spend coins on supplies', short: 'Buy supplies', col: '#ffd45e' },
    rest: { label: 'Rest', desc: 'Rest by the fire and recover', short: 'Rest and recover', col: '#86e6b8' },
    boss: { label: 'Boss', desc: 'The guardian at the summit', short: 'The final guardian', col: '#ff5c74' }
  };
  var GOLD = '#ffd36b', PAPER = '#efe2c4';
  var FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  /* pixel font and helpers: shared with G-07 upgrade-draft */
  var REGULAR = {
    '!': '# # # # # . #', '"': '#.# #.#', '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.', '%': '##... ##..# ...#. ..#.. .#... #..## ...##',
    "'": '# #', '(': '..# .#. #.. #.. #.. .#. ..#', ')': '#.. .#. ..# ..# ..# .#. #..', '*': '..... ..#.. #.#.# .###. #.#.# ..#..',
    '+': '..... ..#.. ..#.. ##### ..#.. ..#..', ',': '.. .. .. .. .. ## .# #.', '-': '.... .... .... ####', '.': '.. .. .. .. .. ## ##',
    '/': '....# ...#. ...#. ..#.. .#... .#... #....',
    '0': '.###. #...# #..## #.#.# ##..# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
    '2': '.###. #...# ....# ...#. ..#.. .#... #####', '3': '####. ....# ....# .###. ....# ....# ####.',
    '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.', '5': '##### #.... ####. ....# ....# #...# .###.',
    '6': '..##. .#... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. .#... .#... .#...',
    '8': '.###. #...# #...# .###. #...# #...# .###.', '9': '.###. #...# #...# .#### ....# ...#. .##..',
    ':': '.. ## ## .. .. ## ##', ';': '.. ## ## .. .. ## .# #.', '<': '...# ..#. .#.. #... .#.. ..#. ...#',
    '=': '.... .... #### .... ####', '>': '#... .#.. ..#. ...# ..#. .#.. #...', '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
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
    '[': '### #.. #.. #.. #.. #.. ###', ']': '### ..# ..# ..# ..# ..# ###', '_': '..... ..... ..... ..... ..... ..... ..... #####',
    'a': '.... .... .##. ...# .### #..# .###', 'b': '#... #... ###. #..# #..# #..# ###.',
    'c': '.... .... .### #... #... #... .###', 'd': '...# ...# .### #..# #..# #..# .###',
    'e': '.... .... .##. #..# #### #... .###', 'f': '..## .#.. #### .#.. .#.. .#.. .#..',
    'g': '.... .... .### #..# #..# .### ...# ###.', 'h': '#... #... ###. #..# #..# #..# #..#',
    'i': '# . # # # # #', 'j': '..# ... .## ..# ..# ..# ..# ##.', 'k': '#... #... #..# #.#. ##.. #.#. #..#',
    'l': '#. #. #. #. #. #. .#', 'm': '..... ..... ##.#. #.#.# #.#.# #.#.# #.#.#',
    'n': '.... .... ###. #..# #..# #..# #..#', 'o': '.... .... .##. #..# #..# #..# .##.',
    'p': '.... .... ###. #..# #..# ###. #... #...', 'q': '.... .... .### #..# #..# .### ...# ...#',
    'r': '.... .... #.## ##.. #... #... #...', 's': '.... .... .### #... .##. ...# ###.',
    't': '.#. .#. ### .#. .#. .#. ..#', 'u': '.... .... #..# #..# #..# #..# .###',
    'v': '..... ..... #...# #...# .#.#. .#.#. ..#..', 'w': '..... ..... #...# #...# #.#.# #.#.# .#.#.',
    'x': '..... ..... #...# .#.#. ..#.. .#.#. #...#', 'y': '.... .... #..# #..# #..# .### ...# ###.',
    'z': '.... .... #### ...# .##. #... ####', '\u25b6': '#.. ##. ### ##. #..', '\u2191': '..#.. .###. #.#.# ..#.. ..#.. ..#.. ..#..',
    '\ufffd': '##### #...# #...# #...# #...# #...# #####'
  };

  REGULAR['\u2192'] = '..... ..#.. ...#. ##### ...#. ..#.. .....';
  REGULAR['\u00b7'] = '.. .. .. ## ## .. ..';
  REGULAR['\u00d7'] = '..... ..... #...# .#.#. ..#.. .#.#. #...#';
  var GL = {};
  function glyph(ch) {
    if (GL[ch]) return GL[ch];
    var src = REGULAR[ch]; if (src == null) src = REGULAR[ch.toUpperCase && ch.toUpperCase()] || REGULAR['\ufffd'];
    var rows = src.split(' '), w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);
    return (GL[ch] = { rows: rows, w: w });
  }

  /* ---------- helpers ---------- */
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function c01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function eOut(p) { p = c01(p); return 1 - (1 - p) * (1 - p) * (1 - p); }
  function eIn(p) { p = c01(p); return p * p * p; }
  function eInOut(p) { p = c01(p); return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function eBack(p, s) { p = c01(p); s = s == null ? 1.5 : s; var q = p - 1; return 1 + (s + 1) * q * q * q + s * q * q; }
  function hit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function okRect(r) { return r && isFinite(r.x) && isFinite(r.y) && r.w > 0 && r.h > 0; }
  function mkCanvas(w, h) { try { var c = root.document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; } catch (e) { return null; } }
  function hashStr(s) { var h = 2166136261 >>> 0; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function mulberry(a) { return function () { a = (a + 0x6d2b79f5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function h01(i, k) { return mulberry(hashStr('p' + i + ':' + k))(); }
  function plain(s) { return String(s).replace(/[\u0001\u0002]/g, ''); }
  function fmt(v) { if (typeof v !== 'number') return String(v); if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v)); return String(Math.round(v * 100) / 100); }
  function rgba(rgb, a) { return 'rgba(' + rgb + ',' + c01(a).toFixed(3) + ')'; }
  function hexRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h, 16); return isFinite(n) ? ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) : '255,255,255'; }
  function shade(hex, k) { var p = hexRgb(hex).split(',').map(Number); return 'rgb(' + p.map(function (v) { return Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k); }).join(',') + ')'; }

  var GI = {};
  function glyphImg(ch, col) {
    var k = ch + col; if (GI[k] !== undefined) return GI[k];
    var g = glyph(ch), c = mkCanvas(g.w, g.rows.length); if (!c) return (GI[k] = null);
    var x = c.getContext('2d'); x.fillStyle = col;
    for (var r = 0; r < g.rows.length; r++) for (var i = 0; i < g.rows[r].length; i++) if (g.rows[r][i] === '#') x.fillRect(i, r, 1, 1);
    return (GI[k] = c);
  }
  function pxW(s, gap) { s = plain(s); gap = gap == null ? 1 : gap; var w = 0; for (var i = 0; i < s.length; i++) w += s[i] === ' ' ? 3 + gap : glyph(s[i]).w + gap; return Math.max(0, w - gap); }
  function pxText(ctx, s, x, y, col, align, scale, shadow, gap) {
    s = plain(s); scale = scale || 1; gap = gap == null ? 1 : gap; var w = pxW(s, gap) * scale;
    var x0 = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x), y0 = Math.round(y);
    if (shadow) pxText(ctx, s, x0 + scale, y0 + scale, shadow, 'left', scale, null, gap);
    var cx = x0;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i]; if (ch === ' ') { cx += (3 + gap) * scale; continue; }
      var im = glyphImg(ch, col), g = glyph(ch), dy = (ch === 'g' || ch === 'p' || ch === 'q' || ch === 'y' || ch === 'j' || ch === ',') ? 0 : 0;
      if (im) ctx.drawImage(im, cx, y0 + dy * scale, im.width * scale, im.height * scale);
      cx += (g.w + gap) * scale;
    }
    return w;
  }
  function pxWrap(s, maxW, maxLines) {
    var words = String(s).split(/\s+/), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) { var t = cur ? cur + ' ' + words[i] : words[i]; if (pxW(t) > maxW && cur) { lines.push(cur); cur = words[i]; } else cur = t; }
    if (cur) lines.push(cur);
    if (maxLines && lines.length > maxLines) { lines = lines.slice(0, maxLines); var l = lines[maxLines - 1]; while (l.length > 1 && pxW(l + '..') > maxW) l = l.slice(0, -1); lines[maxLines - 1] = l + '..'; }
    return lines;
  }

  function eBack2(p) { p = c01(p); var s = 1.7, q = p - 1; return 1 + (s + 1) * q * q * q + s * q * q; }
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function textW(s, size) {          // width estimate without a context (layout must not depend on draw)
    var w = 0; s = String(s);
    for (var i = 0; i < s.length; i++) { var ch = s[i]; w += ch === ' ' ? 0.3 : /[il.,'!|:;]/.test(ch) ? 0.3 : /[A-Z0-9mwMW]/.test(ch) ? 0.66 : 0.54; }
    return w * size;
  }
  function wrapW(s, maxW, size, maxLines) {
    var words = String(s || '').split(/\s+/).filter(Boolean), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) { var t = cur ? cur + ' ' + words[i] : words[i]; if (textW(t, size) > maxW && cur) { lines.push(cur); cur = words[i]; } else cur = t; }
    if (cur) lines.push(cur);
    if (maxLines && lines.length > maxLines) { lines = lines.slice(0, maxLines); var l = lines[maxLines - 1]; while (l.length > 1 && textW(l + '...', size) > maxW) l = l.slice(0, -1); lines[maxLines - 1] = l + '...'; }
    return lines;
  }

  /* ---------- icons, drawn in code in a [-1, 1] box ---------- */
  function poly(c, pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); }
  function F(c, P) { if (P.ink) { c.lineWidth = 0.2; c.lineJoin = 'round'; c.stroke(); } c.fill(); }
  function S(c, P, lw) { c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = lw + (P.ink ? 0.2 : 0); c.stroke(); }
  function detail(c, P, fn) {        // interior marks: ink in HD, holes in the 1-bit pixel icon
    if (P.ink || P.nodetail) return; c.save();
    if (P.cut) c.globalCompositeOperation = 'destination-out'; else { c.fillStyle = P.detail || '#0b0d18'; c.strokeStyle = P.detail || '#0b0d18'; }
    fn(); c.restore();
  }
  var ICON = {
    battle: function (c, P) {
      [0.72, -0.72].forEach(function (a) {
        c.save(); c.rotate(a);
        poly(c, [0, -1.02, 0.15, -0.84, 0.15, 0.3, -0.15, 0.3, -0.15, -0.84]); F(c, P);
        if (!P.ink && !P.cut) { c.save(); c.fillStyle = P.hilt || '#c79a4a'; }
        poly(c, [-0.46, 0.28, 0.46, 0.28, 0.4, 0.48, -0.4, 0.48]); F(c, P);
        poly(c, [-0.09, 0.48, 0.09, 0.48, 0.09, 0.8, -0.09, 0.8]); F(c, P);
        c.beginPath(); c.arc(0, 0.88, 0.14, 0, 7); F(c, P);
        if (!P.ink && !P.cut) c.restore();
        if (!P.cut) detail(c, P, function () { c.fillRect(-0.03, -0.78, 0.06, 1.0); });
        c.restore();
      });
    },
    elite: function (c, P) {
      c.beginPath(); c.moveTo(-0.6, 0.02); c.quadraticCurveTo(-0.98, -0.08, -1, -0.62); c.quadraticCurveTo(-0.78, -0.3, -0.52, -0.3); c.closePath(); F(c, P);
      c.beginPath(); c.moveTo(0.6, 0.02); c.quadraticCurveTo(0.98, -0.08, 1, -0.62); c.quadraticCurveTo(0.78, -0.3, 0.52, -0.3); c.closePath(); F(c, P);
      c.beginPath(); c.moveTo(-0.66, 0.92); c.lineTo(-0.66, -0.05); c.bezierCurveTo(-0.66, -0.9, 0.66, -0.9, 0.66, -0.05); c.lineTo(0.66, 0.92);
      c.lineTo(0.36, 0.92); c.lineTo(0.3, 0.62); c.lineTo(-0.3, 0.62); c.lineTo(-0.36, 0.92); c.closePath(); F(c, P);
      poly(c, [-0.08, -0.98, 0.08, -0.98, 0.1, -0.6, -0.1, -0.6]); F(c, P);
      detail(c, P, function () { c.fillRect(-0.48, -0.06, 0.96, 0.17); c.fillRect(-0.08, 0.11, 0.16, 0.4); });
    },
    event: function (c, P) {
      poly(c, [0, -1, 0.92, 0, 0, 1, -0.92, 0]); F(c, P);
      detail(c, P, function () {
        c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 0.2;
        c.beginPath(); c.arc(0, -0.2, 0.26, Math.PI * 1.05, Math.PI * 2.25, false); c.lineTo(0, 0.2); c.stroke();
        c.beginPath(); c.arc(0, 0.46, 0.11, 0, 7); c.fill();
      });
    },
    shop: function (c, P) {
      c.beginPath(); c.moveTo(-0.24, -0.5); c.bezierCurveTo(-0.95, -0.2, -0.98, 0.94, 0, 0.94); c.bezierCurveTo(0.98, 0.94, 0.95, -0.2, 0.24, -0.5); c.closePath(); F(c, P);
      poly(c, [-0.3, -0.62, 0.3, -0.62, 0.36, -0.46, -0.36, -0.46]); F(c, P);
      poly(c, [-0.24, -0.66, -0.5, -0.98, -0.1, -0.84, 0, -0.98, 0.1, -0.84, 0.5, -0.98, 0.24, -0.66]); F(c, P);
      detail(c, P, function () { c.lineWidth = 0.13; c.beginPath(); c.arc(0, 0.3, 0.3, 0, 7); c.stroke(); poly(c, [0, 0.12, 0.1, 0.3, 0, 0.48, -0.1, 0.3]); c.fill(); });
    },
    rest: function (c, P) {
      c.save(); c.rotate(0.32); poly(c, [-0.88, 0.58, 0.88, 0.58, 0.88, 0.82, -0.88, 0.82]); F(c, P); c.restore();
      c.save(); c.rotate(-0.32); poly(c, [-0.88, 0.58, 0.88, 0.58, 0.88, 0.82, -0.88, 0.82]); F(c, P); c.restore();
      c.beginPath(); c.moveTo(0.02, -1); c.bezierCurveTo(0.2, -0.56, 0.62, -0.36, 0.58, 0.08); c.bezierCurveTo(0.55, 0.42, 0.3, 0.6, 0, 0.6);
      c.bezierCurveTo(-0.3, 0.6, -0.56, 0.42, -0.56, 0.1); c.bezierCurveTo(-0.56, -0.2, -0.34, -0.3, -0.3, -0.56); c.bezierCurveTo(-0.1, -0.36, 0.04, -0.6, 0.02, -1); c.closePath(); F(c, P);
      detail(c, P, function () { c.beginPath(); c.moveTo(0.02, -0.2); c.bezierCurveTo(0.26, 0.04, 0.28, 0.44, 0, 0.46); c.bezierCurveTo(-0.26, 0.44, -0.24, 0.1, 0.02, -0.2); c.fill(); });
    },
    boss: function (c, P) {
      poly(c, [-0.86, 0.72, -0.86, -0.36, -0.46, 0.02, -0.24, -0.66, 0, -0.98, 0.24, -0.66, 0.46, 0.02, 0.86, -0.36, 0.86, 0.72]); F(c, P);
      detail(c, P, function () { poly(c, [0, -0.2, 0.2, 0.18, 0, 0.56, -0.2, 0.18]); c.fill(); c.fillRect(-0.86, 0.5, 1.72, 0.08); c.beginPath(); c.arc(-0.52, 0.28, 0.09, 0, 7); c.arc(0.52, 0.28, 0.09, 0, 7); c.fill(); });
    },
    coins: function (c, P) {
      [[0.62, -0.22], [0.42, -0.5], [0.22, -0.78]].forEach(function (q) { c.beginPath(); c.ellipse(-0.3, q[0] + 0.22, 0.62, 0.26, 0, 0, 7); F(c, P); });
      c.beginPath(); c.arc(0.42, 0.4, 0.52, 0, 7); F(c, P);
      detail(c, P, function () { c.lineWidth = 0.14; c.beginPath(); c.arc(0.42, 0.4, 0.3, 0, 7); c.stroke(); });
    },
    coin: function (c, P) { c.beginPath(); c.arc(0, 0, 0.9, 0, 7); F(c, P); detail(c, P, function () { c.lineWidth = 0.16; c.beginPath(); c.arc(0, 0, 0.55, 0, 7); c.stroke(); }); },
    check: function (c, P) { c.beginPath(); c.moveTo(-0.62, 0.02); c.lineTo(-0.16, 0.5); c.lineTo(0.66, -0.5); S(c, P, 0.3); }
  };
  function drawIcon(ctx, name, x, y, size, color, detailCol) {
    var fn = ICON[name] || ICON.battle, s = size / 2;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = '#0b0d18'; ctx.fillStyle = '#0b0d18'; fn(ctx, { ink: true });
    ctx.strokeStyle = color; ctx.fillStyle = color; fn(ctx, { ink: false, detail: detailCol || '#141a28' });
    ctx.restore();
  }
  var PXI = {};
  var PXNAME = { shop: 'coins' };              // pixel-only shapes that read better than the HD icon at 11 px
  function pixelSpecial(name, size, color) {   // event and shop are hand-placed pixels: a '?' glyph, a stack of two coins
    var c = mkCanvas(size, size); if (!c) return null;
    var x = c.getContext('2d'), base = color, dark = shade(color, -0.45), ink = '#0b0d18';
    if (name === 'event') {
      var g = glyph('?'), ox = Math.floor((size - g.w) / 2), oy = Math.floor((size - g.rows.length) / 2);
      x.fillStyle = ink; for (var r = 0; r < g.rows.length; r++) for (var i = 0; i < g.w; i++) if (g.rows[r][i] === '#') [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]].forEach(function (d) { x.fillRect(ox + i + d[0], oy + r + d[1], 1, 1); });
      for (r = 0; r < g.rows.length; r++) for (i = 0; i < g.w; i++) if (g.rows[r][i] === '#') { x.fillStyle = (r > 4 || i === g.w - 1) ? dark : base; x.fillRect(ox + i, oy + r, 1, 1); }
      return c;
    }
    function coin(cx, cy, rad, body, rim) {
      for (var yy = -rad - 1; yy <= rad + 1; yy++) for (var xx = -rad - 1; xx <= rad + 1; xx++) {
        var d = Math.sqrt(xx * xx + yy * yy);
        if (d <= rad - 1.6 && d > rad - 2.6) x.fillStyle = rim; else if (d <= rad + 0.3) x.fillStyle = (xx + yy < -rad * 0.6 && d > rad - 1.6) ? '#fff2c0' : body; else if (d <= rad + 1.2) x.fillStyle = ink; else continue;
        x.fillRect(cx + xx, cy + yy, 1, 1);
      }
    }
    var h = Math.floor(size / 2);
    coin(h + 2, h - 2, Math.max(2, h - 2), dark, shade(color, -0.65));
    coin(h - 1, h + 1, Math.max(2, h - 1), base, dark);
    return c;
  }
  function pixelIcon(name, size, color) {      // crisp: threshold alpha, holes for interior marks, lower-right shade
    var key = name + '|' + size + '|' + color; if (PXI[key] !== undefined) return PXI[key];
    if (name === 'event' || name === 'shop') return (PXI[key] = pixelSpecial(name, size, color));
    var c = mkCanvas(size, size); if (!c) return (PXI[key] = null);
    var x = c.getContext('2d'), fn = ICON[PXNAME[name] || name] || ICON.battle;
    x.save(); x.translate(size / 2, size / 2); x.scale(size / 2.1, size / 2.1); x.fillStyle = '#fff'; x.strokeStyle = '#fff'; fn(x, { ink: false, cut: true, nodetail: name === 'event' }); x.restore();
    var W = c.width, H = c.height, id = x.getImageData(0, 0, W, H), d = id.data, on = new Uint8Array(W * H), i, p;
    for (i = 0; i < W * H; i++) on[i] = d[i * 4 + 3] >= 110 ? 1 : 0;
    var base = hexRgb(color).split(',').map(Number), dark = base.map(function (v) { return Math.round(v * 0.62); });
    for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
      i = yy * W + xx; p = i * 4;
      if (on[i]) { var col = (xx + 1 < W && yy + 1 < H && (!on[i + 1] || !on[i + W])) ? dark : base; d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255; }
      else d[p + 3] = 0;
    }
    x.putImageData(id, 0, 0);
    if (name === 'event') { var gq = glyphImg('?', '#141a28'); if (gq) x.drawImage(gq, Math.round((size - gq.width) / 2), Math.round((size - gq.height) / 2)); }   // a real '?' glyph
    return (PXI[key] = c);
  }
  var PXD = {};
  function pxDisc(r, fill, ring) {             // a pixel medallion: ink outline, coloured ring, flat fill
    var key = r + fill + ring; if (PXD[key] !== undefined) return PXD[key];
    var n = 2 * r + 3, c = mkCanvas(n, n); if (!c) return (PXD[key] = null);
    var x = c.getContext('2d'), m = r + 1;
    for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) {
      var d = Math.sqrt((i - m) * (i - m) + (j - m) * (j - m));
      if (d <= r - 0.7) x.fillStyle = fill; else if (d <= r + 0.35) x.fillStyle = ring; else if (d <= r + 1.25) x.fillStyle = '#0b0d18'; else continue;
      x.fillRect(i, j, 1, 1);
    }
    return (PXD[key] = c);
  }
  var PAWN = ['..###..', '.#ooo#.', '.#oho#.', '.#ooo#.', '..#o#..', '.#ooo#.', '#ohooo#', '#ooooo#', '.#####.'];
  var PAWN_IMG = null;
  function pawnImg() {
    if (PAWN_IMG !== null) return PAWN_IMG;
    var c = mkCanvas(7, PAWN.length); if (!c) return (PAWN_IMG = null);
    var x = c.getContext('2d'), pal = { '#': '#0b0d18', o: GOLD, h: '#fff6d8' };
    PAWN.forEach(function (row, j) { for (var i = 0; i < row.length; i++) if (pal[row[i]]) { x.fillStyle = pal[row[i]]; x.fillRect(i, j, 1, 1); } });
    return (PAWN_IMG = c);
  }
  function pxLine(c, x0, y0, x1, y1, on, off, shift) {      // 1 px line with an on/off dash pattern (off 0 = solid)
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)), per = on + off;
    for (var i = 0; i <= n; i++) {
      if (off > 0 && ((i + (shift || 0)) % per + per) % per >= on) continue;
      c.fillRect(Math.round(x0 + (x1 - x0) * i / Math.max(1, n)), Math.round(y0 + (y1 - y0) * i / Math.max(1, n)), 1, 1);
    }
  }

  /* ---------- the map: a pure function of the seed and the shape params ---------- */
  function genParams(p) {
    p = p || {};
    return { floors: clamp(Math.round(num(p.floors, DEFAULTS.floors)), 3, 14), width: clamp(Math.round(num(p.width, DEFAULTS.width)), 3, 7),
      paths: clamp(Math.round(num(p.paths, DEFAULTS.paths)), 2, 6), eliteFrom: clamp(Math.round(num(p.eliteFrom, DEFAULTS.eliteFrom)), 1, 99),
      restBefore: !(p.restBefore === 'off' || p.restBefore === false),
      w: { battle: Math.max(0, num(p.wBattle, DEFAULTS.wBattle)), elite: Math.max(0, num(p.wElite, DEFAULTS.wElite)), event: Math.max(0, num(p.wEvent, DEFAULTS.wEvent)),
        shop: Math.max(0, num(p.wShop, DEFAULTS.wShop)), rest: Math.max(0, num(p.wRest, DEFAULTS.wRest)) } };
  }
  function generate(seed, params) {
    var G = genParams(params), R = G.floors, C = G.width;
    seed = Math.round(num(seed, 1));
    var rnd = mulberry(hashStr('run-map|' + seed + '|' + R + '|' + C + '|' + G.paths));
    var edges = {}, nodes = {}, starts = [];
    function add(r, c) { var k = r + '-' + c; if (!nodes[k]) nodes[k] = { id: k, row: r, col: c, next: [], prev: [] }; return nodes[k]; }
    for (var k = 0; k < G.paths; k++) {
      var c = Math.floor(rnd() * C), guard = 0;
      if (k === 1) while (c === starts[0] && guard++ < 40) c = Math.floor(rnd() * C);
      starts.push(c); add(0, c);
      for (var r = 0; r < R - 1; r++) {
        var opts = [c - 1, c, c + 1].filter(function (q) { return q >= 0 && q < C; });
        for (var i = opts.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = opts[i]; opts[i] = opts[j]; opts[j] = t; }
        var nc = c;
        for (i = 0; i < opts.length; i++) {
          var q = opts[i];
          if (q === c + 1 && edges[r + ':' + (c + 1) + '>' + c]) continue;     // would cross an existing diagonal
          if (q === c - 1 && edges[r + ':' + (c - 1) + '>' + c]) continue;
          nc = q; break;
        }
        var a = add(r, c), b = add(r + 1, nc), ek = r + ':' + c + '>' + nc;
        if (!edges[ek]) { edges[ek] = 1; a.next.push(b.id); b.prev.push(a.id); }
        c = nc;
      }
    }
    var list = Object.keys(nodes).map(function (id) { return nodes[id]; }).sort(function (a, b) { return a.row - b.row || a.col - b.col; });
    var boss = { id: 'boss', row: R, col: (C - 1) / 2, next: [], prev: [] };
    list.forEach(function (n) { if (n.row === R - 1) { n.next.push('boss'); boss.prev.push(n.id); } });
    nodes.boss = boss; list.push(boss);
    var colOf = function (id) { return nodes[id].col; };
    list.forEach(function (n) { n.next.sort(function (a, b) { return colOf(a) - colOf(b); }); n.prev.sort(function (a, b) { return colOf(a) - colOf(b); }); });
    var jr = mulberry(hashStr('run-map-jitter|' + seed));
    list.forEach(function (n) { n.x = n.id === 'boss' ? (C - 1) / 2 : n.col + (jr() - 0.5) * 0.36; n.y = n.id === 'boss' ? R + 0.8 : n.row + (jr() - 0.5) * 0.24; });
    for (var pass = 0; pass < 6; pass++) {             // no edge may pass close to a node it does not end at: straighten the nodes involved
      var moved = 0;
      list.forEach(function (a) {
        a.next.forEach(function (bid) {
          var b = nodes[bid], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
          list.forEach(function (n) {
            if (n === a || n === b) return;
            var t = Math.max(0, Math.min(1, ((n.x - a.x) * dx + (n.y - a.y) * dy) / L2)), px = a.x + dx * t - n.x, py = a.y + dy * t - n.y;
            if (px * px + py * py >= GRAZE * GRAZE) return;
            [a, b, n].forEach(function (q) { if (q.id !== 'boss' && (q.x !== q.col || q.y !== q.row)) { q.x = q.x * 0.4 + q.col * 0.6; q.y = q.y * 0.4 + q.row * 0.6; moved++; } });
          });
        });
      });
      if (!moved) break;
    }
    // node types
    var tr = mulberry(hashStr('run-map-types|' + seed + '|' + R + '|' + C)), W = G.w;
    function roll(not) {
      var tot = 0; ROLL.forEach(function (t) { if (t !== not) tot += W[t]; });
      if (tot <= 0) return 'battle';
      var x = tr() * tot; for (var i = 0; i < ROLL.length; i++) { if (ROLL[i] === not) continue; x -= W[ROLL[i]]; if (x < 0) return ROLL[i]; }
      return 'battle';
    }
    function allowed(n, t) {
      if (t === 'elite' && n.row + 1 < G.eliteFrom) return false;
      if (t === 'rest' && G.restBefore && n.row === R - 2) return false;
      if (t === 'elite' || t === 'shop' || t === 'rest') {
        for (var i = 0; i < n.prev.length; i++) if (nodes[n.prev[i]].type === t) return false;
        for (i = 0; i < n.next.length; i++) if (nodes[n.next[i]].type === t) return false;
      }
      return true;
    }
    function fixed(n) { return n.id === 'boss' || n.row === 0 || (n.row === R - 1 && G.restBefore); }
    list.forEach(function (n) {
      if (n.id === 'boss') { n.type = 'boss'; return; }
      if (n.row === 0) { n.type = 'battle'; return; }
      if (n.row === R - 1 && G.restBefore) { n.type = 'rest'; return; }
      n.type = 'battle';
      for (var tries = 0; tries < 14; tries++) { var t = roll(); if (allowed(n, t)) { n.type = t; return; } }
    });
    list.forEach(function (n) {                        // a fork whose branches are all the same type is no choice: vary the last one
      var kids = n.next.map(function (id) { return nodes[id]; }).filter(function (m) { return !fixed(m); });
      if (kids.length < 2 || kids.some(function (m) { return m.type !== kids[0].type; })) return;
      var m = kids[kids.length - 1], was = m.type;
      for (var tries = 0; tries < 14; tries++) { var t = roll(was); m.type = t; if (t !== was && allowed(m, t)) return; }
      m.type = was;
    });
    if (R >= 5 && W.shop > 0 && !list.some(function (n) { return n.type === 'shop'; })) {     // at least one shop on a longer run
      var cand = list.filter(function (n) { return !fixed(n) && (n.type === 'battle' || n.type === 'event') && n.row >= 1 && n.row <= R - 3 && allowed(n, 'shop'); });
      if (cand.length) cand[Math.floor(tr() * cand.length)].type = 'shop';
    }
    return { v: 1, seed: seed, floors: R, width: C, paths: G.paths, eliteFrom: G.eliteFrom, restBefore: G.restBefore,
      starts: list.filter(function (n) { return n.row === 0; }).map(function (n) { return n.id; }), boss: 'boss',
      nodes: list.map(function (n) { return { id: n.id, row: n.row, col: n.col, x: n.x, y: n.y, type: n.type, next: n.next.slice(), prev: n.prev.slice() }; }) };
  }
  function crossings(map) {                    // pairs of edges between the same two rows whose ends swap order (must be 0)
    if (!map || !map.nodes) return 0;
    var by = {}; map.nodes.forEach(function (n) { by[n.id] = n; });
    var E = []; map.nodes.forEach(function (n) { n.next.forEach(function (m) { E.push([n, by[m]]); }); });
    var k = 0;
    for (var i = 0; i < E.length; i++) for (var j = i + 1; j < E.length; j++) {
      var a = E[i], b = E[j]; if (!a[1] || !b[1] || a[0].row !== b[0].row || a[0] === b[0] || a[1] === b[1]) continue;
      if ((a[0].x - b[0].x) * (a[1].x - b[1].x) < 0) k++;
    }
    return k;
  }
  var GRAZE = 0.5;
  function grazes(map, clear) {                // edges that pass within `clear` (column / row units) of a node they do not end at (must be 0)
    clear = clear == null ? GRAZE - 0.01 : clear;
    var by = {}, k = 0; map.nodes.forEach(function (n) { by[n.id] = n; });
    map.nodes.forEach(function (a) {
      a.next.forEach(function (bid) {
        var b = by[bid], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
        map.nodes.forEach(function (n) {
          if (n === a || n === b) return;
          var t = Math.max(0, Math.min(1, ((n.x - a.x) * dx + (n.y - a.y) * dy) / L2)), px = a.x + dx * t - n.x, py = a.y + dy * t - n.y;
          if (px * px + py * py < clear * clear) k++;
        });
      });
    });
    return k;
  }
  function audit(map) {                        // {crossings, grazes, orphans (no route up), deadEnds, edges, nodes, types}
    var by = {}, types = {}; map.nodes.forEach(function (n) { by[n.id] = n; types[n.type] = (types[n.type] || 0) + 1; });
    var up = {}, down = {};
    (function mark(ids) { var q = ids.slice(); while (q.length) { var id = q.shift(); if (down[id]) continue; down[id] = 1; q = q.concat(by[id].next); } })(map.starts);
    (function mark(ids) { var q = ids.slice(); while (q.length) { var id = q.shift(); if (up[id]) continue; up[id] = 1; q = q.concat(by[id].prev); } })(['boss']);
    var e = 0; map.nodes.forEach(function (n) { e += n.next.length; });
    return { crossings: crossings(map), grazes: grazes(map), orphans: map.nodes.filter(function (n) { return !down[n.id]; }).length,
      deadEnds: map.nodes.filter(function (n) { return !up[n.id]; }).length, edges: e, nodes: map.nodes.length, types: types };
  }

  /* ---------- instance ---------- */
  function create(o) {
    o = o || {};
    var API = root.GameDNA_Skin || null, SK = null;
    if (o.skin !== false) { try { SK = API && API.resolve ? API.resolve(o.skin) : null; } catch (e) { SK = null; } }
    var P = {}, warned = {}, lastCanvas = null, clock = 0;
    var M = null, IDX = {}, at = null, route = [], cleared = {}, usedEvents = [], phase = 'idle', pt = 0, fade = 0, sel = 0, selT = 0,
      travel = null, panel = null, runs = 0, entered = 0, result = null, scroll = 0, stamp = null, autoT = 0, inbox = [], held = {},
      drawnRects = [], lastCss = 0, startX = 0, awayNode = null, entering = false, pendingFinish = null, drawnSinceOpen = false, lastL = null;

    function dbg(e) { if (typeof o.debug === 'function') { try { o.debug(e); } catch (x) { } } }
    function warnOnce(key, msg) { if (warned[key]) return; warned[key] = 1; try { if (root.console) console.warn('GameDNA_RunMap: ' + msg); } catch (e) { } }
    function call(fn, a, b, c) { if (typeof fn === 'function') { try { return fn(a, b, c); } catch (x) { warnOnce('cb' + String(x).slice(0, 40), 'a host callback threw: ' + x); } } return undefined; }
    function sfx(n) { call(o.onSfx, n); }
    function setParams(p) {
      var src = Object.assign({}, DEFAULTS, o.params || {}, P, p || {});
      ['seed', 'floors', 'width', 'paths', 'wBattle', 'wElite', 'wEvent', 'wShop', 'wRest', 'eliteFrom', 'dim', 'openMs', 'travelMs', 'closeMs', 'resultMs', 'autoMs', 'pixelBelow']
        .forEach(function (k) { src[k] = num(src[k], DEFAULTS[k]); });
      src.dim = clamp(src.dim, 0, 0.95);
      P = src; o.params = Object.assign({}, o.params || {}, p || {});
    }
    setParams({});
    function cfg(type) { var n = o.nodes && o.nodes[type]; return n && typeof n === 'object' ? n : {}; }
    function labelOf(type) { return String(cfg(type).label || (o.labels && o.labels[type]) || LOOK[type].label); }
    function descOf(type, short) { var c = cfg(type), d = (short ? c.short || c.desc : c.desc); if (!d && type === 'shop' && typeof o.getGold !== 'function') d = short ? 'Free supplies' : 'Take one free supply'; return String(d || LOOK[type][short ? 'short' : 'desc']); }
    function autoOn() { try { return typeof o.autoplay === 'function' ? !!o.autoplay() : !!o.autoplay; } catch (e) { return false; } }
    function field() {
      var b = typeof o.bounds === 'function' ? call(o.bounds) : o.bounds;
      if (okRect(b)) return { x: b.x, y: b.y, w: b.w, h: b.h };
      var v = typeof o.view === 'function' ? call(o.view) : o.view;
      if (v && v.w > 0 && v.h > 0) return { x: 0, y: 0, w: v.w, h: v.h };
      if (lastCanvas) return { x: 0, y: 0, w: lastCanvas.w, h: lastCanvas.h };
      return null;
    }
    function uiList() {
      var out = [];
      try { [].concat(call(o.uiRects) || [], call(o.getObstacles) || []).forEach(function (q) { if (q && q.id == null && okRect(q)) out.push(q); }); } catch (e) { }
      return out;
    }
    function isPixel(f) { return P.look === 'pixel' || (P.look !== 'hd' && f.h < P.pixelBelow); }
    function tok(path, d) { if (SK) { try { var v = SK.token(path); if (typeof v === 'string' && v !== path) return v; } catch (e) { } } return d; }
    function hdFont(wt, size) { var fam = FONT; try { if (SK && SK.pixel === false && SK.fonts && SK.fonts.ui && SK.fonts.ui.family) fam = SK.fonts.ui.family + ', ' + FONT; } catch (e) { } return wt + ' ' + size.toFixed(2) + 'px ' + fam; }

    /* ----- layout: a function of the field, the ui rects and the map (no context needed) ----- */
    function layout(f) {
      var px = isPixel(f), u = px ? 1 : f.h / 360, m = px ? 4 : Math.round(12 * u);
      var sw = px ? Math.min(f.w - 2 * m, 236) : Math.min(f.w - 2 * m, Math.round(f.h * 1.2));
      var sx = Math.round(f.x + (f.w - sw) / 2), top = f.y + m, bot = f.y + f.h - m, gap = px ? 2 : 6 * u;
      uiList().forEach(function (q) {
        if (q.x >= sx + sw || q.x + q.w <= sx || q.y >= f.y + f.h || q.y + q.h <= f.y) return;
        if (q.y + q.h / 2 < f.y + f.h / 2) top = Math.max(top, q.y + q.h + gap); else bot = Math.min(bot, q.y - gap);
      });
      if (bot - top < f.h * 0.55) { top = f.y + m; bot = f.y + f.h - m; warnOnce('ui', 'uiRects leave too little room; the map covers them'); }
      var sheet = { x: sx, y: Math.round(top), w: sw, h: Math.round(bot - top) };
      var head = px ? 14 : 34 * u, foot = px ? 12 : 28 * u, padX = px ? 12 : 22 * u, padY = px ? 3 : 8 * u;
      var area = { x: sheet.x + padX, y: sheet.y + head + padY, w: sheet.w - 2 * padX, h: sheet.h - head - foot - 2 * padY };
      var R = M ? M.floors : 6, C = M ? M.width : 5, span = R + 2.55, rowH = area.h / span, minRow = px ? 19 : 26 * u;
      var scrollMax = 0; if (rowH < minRow) { rowH = minRow; scrollMax = span * rowH - area.h; }
      var colW = area.w / C, r = px ? 7 : Math.max(7 * u, Math.min(14 * u, rowH * 0.34, colW * 0.34));
      var tb = px || !(lastCss > 0) ? 1 : clamp(9 / (10.5 * u * lastCss), 1, 1.35);
      return { f: f, px: px, u: u, tb: tb, sheet: sheet, head: head, foot: foot, area: area, rowH: rowH, colW: colW, r: r, scrollMax: scrollMax, C: C, R: R };
    }
    function xy(n, L, sc) {
      var s = sc == null ? scroll : sc, x = L.area.x + (n.x + 0.5) / L.C * L.area.w, y = L.area.y + L.area.h - (n.y + 1.1) * L.rowH + s * L.rowH;
      return L.px ? { x: Math.round(x), y: Math.round(y) } : { x: x, y: y };
    }
    function startXY(L, sc) { return xy({ x: startX, y: -0.95 }, L, sc); }              // the token before the first pick
    function stubBase(id, L) { var n = IDX[id]; return { x: xy(n, L).x, y: xy({ x: n.x, y: -0.95 }, L).y }; }   // each bottom node's own start mark
    function scrollTarget(L) {
      if (!L || L.scrollMax <= 0) return 0;
      var vis = L.area.h / L.rowH, row = travel ? IDX[travel.to].row : at ? IDX[at].row : -0.5;
      return clamp(row + 1.1 - vis * 0.28, 0, L.scrollMax / L.rowH);
    }
    function panelGeom(L) {
      if (!panel) return null;
      var px = L.px, u = L.u, S = L.sheet;
      var tb = L.tb || 1, w = px ? Math.min(S.w - 16, 204) : Math.min(S.w * 0.86, 300 * u * tb), padd = px ? 6 : 14 * u;
      var body = panel.res && panel.picked >= 0 ? panel.res : panel.res && panel.multi ? panel.res : panel.text;
      var lines = px ? pxWrap(body, w - 2 * padd, 3) : wrapW(body, w - 2 * padd, 12.5 * u * tb, 3);
      var headH = px ? 16 : 40 * u * tb, lineH = px ? 9 : 17 * u * tb, rowH = px ? 11 : 27 * u * tb, rowGap = px ? 1 : 5 * u;
      var hintH = px && panel.rows.some(function (q) { return q.text || q.cost > 0 || q.why; }) ? 22 : 0;
      var h = padd + headH + Math.max(1, lines.length) * lineH + (px ? 4 : 10 * u) + panel.rows.length * (rowH + rowGap) - rowGap + hintH + padd;
      var x = Math.round(S.x + (S.w - w) / 2), y = Math.round(S.y + (S.h - h) / 2 + (px ? 4 : 8 * u));
      var rows = panel.rows.map(function (rw, i) { var ry = y + padd + headH + Math.max(1, lines.length) * lineH + (px ? 4 : 10 * u) + i * (rowH + rowGap); return { x: x + padd, y: Math.round(ry), w: w - 2 * padd, h: rowH }; });
      return { x: x, y: y, w: w, h: Math.round(h), pad: padd, headH: headH, lineH: lineH, lines: lines, rows: rows, hintY: hintH ? Math.round(y + h - padd - hintH + 4) : null, tb: tb };
    }

    /* ----- run flow ----- */
    function index() { IDX = {}; if (M) M.nodes.forEach(function (n) { IDX[n.id] = n; }); }
    function choiceIds() { if (!M) return []; if (at == null) return M.starts.slice(); var n = IDX[at]; return n ? n.next.slice() : []; }
    function info(n) {
      return { id: n.id, type: n.type, label: labelOf(n.type), floor: n.row + 1, floors: M.floors + 1, tier: M.floors ? n.row / M.floors : 0,
        elite: n.type === 'elite', boss: n.type === 'boss', seed: hashStr(P.seed + '|' + n.id) % 100000, route: route.slice(), run: runs };
    }
    function hpFrac() { var v = num(call(o.hpFrac), 1); return clamp(v, 0, 1); }
    function gold() { if (typeof o.getGold !== 'function') return null; var v = num(call(o.getGold), NaN); return isFinite(v) ? v : null; }
    function scoreType(t) {
      var hp = hpFrac(), g = gold(), mode = P.autoRoute;
      if (t === 'boss') return 99;
      if (mode === 'safe') return { rest: hp < 0.8 ? 6 : 1.5, event: 3, shop: g != null && g >= 5 ? 2.6 : 1, battle: 2, elite: 0.2 }[t] || 1;
      if (mode === 'bold') return { elite: hp > 0.4 ? 5 : 0.5, battle: 3, event: 2, shop: 1.5, rest: hp < 0.35 ? 6 : 1 }[t] || 1;
      return { rest: hp < 0.5 ? 6 : 1, battle: 3, event: 2.5, shop: g != null && g >= 6 ? 2.8 : 0.8, elite: hp > 0.75 ? 2.7 : 0.3 }[t] || 1;
    }
    function recommendIndex() {
      var ch = choiceIds(); if (P.autoRoute === 'first' || ch.length < 2) return 0;
      var best = 0, bs = -1;
      ch.forEach(function (id, i) { var n = IDX[id], s = scoreType(n.type); n.next.forEach(function (m) { if (IDX[m].type === 'rest' && hpFrac() < 0.6) s += 0.2; }); if (s > bs + 1e-9) { bs = s; best = i; } });
      return best;
    }
    function aheadIndex() {                    // the default cursor: the choice straight ahead of the token
      var ch = choiceIds(); if (!ch.length) return 0;
      var x0 = at == null ? (M.width - 1) / 2 : IDX[at].x, best = 0, bd = 1e9;
      ch.forEach(function (id, i) { var d = Math.abs(IDX[id].x - x0); if (d < bd - 1e-9) { bd = d; best = i; } });
      return best;
    }
    function setSel(i) { var n = choiceIds().length; if (!n) return; i = ((i % n) + n) % n; if (i !== sel) { sel = i; selT = 0; sfx('move'); } }
    function openMap() { phase = 'map'; fade = 0; sel = aheadIndex(); if (at == null && M) { var c0 = choiceIds()[sel]; if (c0) startX = IDX[c0].x; } selT = 0; autoT = 0; inbox = []; drawnSinceOpen = false; sfx('open'); dbg({ event: 'open', at: at, choices: choiceIds(), floor: at ? IDX[at].row + 2 : 1, auto: autoOn() }); }
    function go(id) {
      var n = IDX[id]; if (!n) return;
      travel = { from: at, to: id }; phase = 'travel'; pt = 0; autoT = 0;
      sfx('go'); dbg({ event: 'choose', id: id, type: n.type, floor: n.row + 1, from: at, auto: autoOn(), choices: choiceIds() });
    }
    function arrive() {
      var n = IDX[travel.to]; travel = null; at = n.id; route.push(n.id); entered++;
      var nf = info(n); entering = true; pendingFinish = null;
      var ret = call(o.onEnter, nf, api);
      entering = false;
      dbg({ event: 'enter', id: n.id, type: n.type, floor: n.row + 1, host: !!(FIGHT[n.type] || ret === 'host' || ret === true) });
      sfx('arrive');
      if (FIGHT[n.type] || ret === 'host' || ret === true) {
        if (FIGHT[n.type] && typeof o.onEnter !== 'function') warnOnce('noEnter', 'no onEnter: fight nodes wait for finish() that nothing will call');
        awayNode = n.id; phase = 'closing'; pt = 0; return;
      }
      if (pendingFinish) { pendingFinish = null; warnOnce('finishPanel', 'finish() during onEnter of a ' + n.type + ' node that the module runs; ignored'); }
      openPanel(n, ret && typeof ret === 'object' ? ret : null);
    }
    function listOf(v, nf) { if (typeof v === 'function') v = call(v, nf); return Array.isArray(v) ? v.filter(function (x) { return x && typeof x === 'object'; }) : []; }
    function openPanel(n, content) {
      var c = cfg(n.type), nf = info(n), title, text, ch;
      if (!content && n.type === 'event') {
        var pool = listOf(c.pool || o.events, nf);
        if (pool.length) {
          var k = hashStr(P.seed + '|ev|' + n.id) % pool.length;
          for (var t = 0; t < pool.length && usedEvents.indexOf(k) >= 0; t++) k = (k + 1) % pool.length;
          if (usedEvents.length >= pool.length) usedEvents = [];
          usedEvents.push(k); content = pool[k];
        }
      }
      content = content || {};
      title = String(content.title || labelOf(n.type)); text = String(content.text || c.text || descOf(n.type));
      ch = listOf(content.choices || c.choices, nf);
      var rows = ch.map(function (q) {
        var cost = Math.max(0, Math.round(num(q.cost, 0)));
        if (cost > 0 && gold() == null) { warnOnce('gold', 'a choice has a cost but no getGold was given; it is free'); cost = 0; }
        return { label: String(q.label || 'Take'), text: String(q.text || ''), cost: cost, enabled: true, why: '', src: q, leave: false, sold: false };
      });
      refreshRows(rows, nf);
      var leave = content.leave != null ? content.leave : c.leave != null ? c.leave : (n.type === 'shop' || !rows.length);
      if (!rows.length) warnOnce('choices-' + n.type, n.type + ' node has no choices: pass nodes.' + n.type + (n.type === 'event' ? '.pool' : '.choices') + ' or handle it in onEnter');
      if (leave !== false) rows.push({ label: typeof leave === 'string' ? leave : rows.length ? 'Leave' : 'Continue', text: '', cost: 0, enabled: true, why: '', src: null, leave: true });
      var first = 0; while (first < rows.length - 1 && !rows[first].enabled) first++;
      var multi = content.multi != null ? !!content.multi : c.multi != null ? !!c.multi : (n.type === 'shop' && gold() != null && leave !== false);
      panel = { node: n.id, type: n.type, title: title, text: text, rows: rows, cursor: first, t: 0, picked: -1, pickT: 0, res: '', multi: multi };
      phase = 'panel'; autoT = 0;
      dbg({ event: 'panel', id: n.id, type: n.type, title: title, rows: rows.map(function (q) { return q.label; }) });
    }
    function refreshRows(rows, nf) {              // costs against the coins now, `when`, items already bought in this shop
      var g = gold();
      rows.forEach(function (q) {
        if (q.leave) return;
        q.enabled = true; q.why = '';
        if (q.sold) { q.enabled = false; q.why = 'sold'; return; }
        if (q.cost > 0 && g != null && g < q.cost) { q.enabled = false; q.why = 'need ' + q.cost; }
        if (q.src && typeof q.src.when === 'function' && !call(q.src.when, nf)) { q.enabled = false; q.why = q.why || String(q.src.whyNot || 'not now'); }
      });
    }
    function rowPriority(q) { var v = q.src ? q.src.priority : 0; if (typeof v === 'function') v = call(v, info(IDX[panel.node])); v = num(v, 0); return v; }
    function autoRow() {                           // autoplay: the enabled row with the highest priority (rows below 0 are skipped), else Leave
      var best = -1, bp = -1e9;
      panel.rows.forEach(function (q, i) { if (!q.enabled || q.leave) return; var pr = rowPriority(q); if (pr >= 0 && pr > bp) { bp = pr; best = i; } });
      if (best < 0) panel.rows.forEach(function (q, i) { if (best < 0 && q.enabled && q.leave) best = i; });
      if (best < 0) panel.rows.forEach(function (q, i) { if (best < 0 && q.enabled) best = i; });
      return Math.max(0, best);
    }
    function pickRow(i, auto) {
      var q = panel.rows[i]; if (!q) return;
      if (!q.enabled) { sfx('deny'); dbg({ event: 'deny', id: panel.node, label: q.label }); return; }
      panel.picked = i; panel.pickT = 0; panel.cursor = i;
      var n = IDX[panel.node], nf = info(n);
      if (!q.leave) {
        if (q.cost > 0 && typeof o.spendGold === 'function') call(o.spendGold, q.cost, nf);
        var r = q.src && typeof q.src.apply === 'function' ? call(q.src.apply, nf, q.src) : undefined;
        call(o.onChoice, q.src, nf);
        panel.res = typeof r === 'string' && r ? r : String((q.src && q.src.result) || (q.label + '.'));
      } else panel.res = '';
      sfx(q.leave ? 'leave' : 'pick');
      dbg({ event: 'choice', id: panel.node, type: panel.type, label: q.label, leave: q.leave, cost: q.cost, auto: !!auto });
    }
    function closePanel() {
      var id = panel.node; cleared[id] = 1; stamp = { id: id, t: 0 }; panel = null;
      dbg({ event: 'cleared', id: id, type: IDX[id].type, floor: IDX[id].row + 1 });
      phase = 'map'; fade = 1; sel = aheadIndex(); selT = 0; autoT = 0; inbox = [];
      dbg({ event: 'open', at: at, choices: choiceIds(), floor: IDX[at].row + 2, auto: autoOn(), fromPanel: true });
    }
    function finish(res) {
      if (entering || phase === 'closing') { pendingFinish = res || {}; return true; }
      if (phase !== 'away' || !awayNode) { warnOnce('finish', 'finish() called while no node is away (phase ' + phase + '); ignored'); dbg({ event: 'finishIgnored', phase: phase }); return false; }
      var n = IDX[awayNode], won = !(res && (res.won === false || res.lost === true));
      awayNode = null;
      dbg({ event: 'finish', id: n.id, type: n.type, floor: n.row + 1, won: won });
      if (!won) { phase = 'done'; result = { won: false, node: n.id, type: n.type, floor: n.row + 1, route: route.slice() }; call(o.onRunEnd, result); dbg({ event: 'end', won: false }); return true; }
      cleared[n.id] = 1;
      if (n.type === 'boss') { phase = 'done'; result = { won: true, node: n.id, type: n.type, floor: n.row + 1, route: route.slice() }; call(o.onRunEnd, result); dbg({ event: 'end', won: true }); return true; }
      stamp = { id: n.id, t: 0 };
      if (P.reopen === 'manual') { phase = 'wait'; return true; }
      openMap(); return true;
    }
    function start(opts) {
      opts = opts || {};
      if (opts.seed != null) setParams({ seed: num(opts.seed, P.seed) });
      if (opts.params) setParams(opts.params);
      M = generate(P.seed, P); index();
      at = null; route = []; cleared = {}; usedEvents = []; result = null; awayNode = null; pendingFinish = null; panel = null; travel = null; stamp = null; scroll = 0; runs++;
      var a = audit(M);
      if (a.crossings || a.orphans || a.deadEnds) warnOnce('audit', 'generated map failed its audit ' + JSON.stringify(a));
      dbg({ event: 'start', seed: P.seed, floors: M.floors, width: M.width, paths: M.paths, nodes: M.nodes.length, map: M });
      if (opts.open === false) { phase = 'wait'; return M; }
      openMap(); return M;
    }
    function act(a) {
      var ch = choiceIds();
      if (a.a === 'ptr') {
        if (!lastL) return;
        var hitId = nearestChoice(a.x, a.y);
        if (hitId != null) { setSel(hitId); if (a.down) go(ch[hitId]); }
        return;
      }
      if (a.a === 'left' || a.a === 'down') setSel(sel - 1);
      else if (a.a === 'right' || a.a === 'up') setSel(sel + 1);
      else if (a.a === 'confirm' && ch.length) go(ch[clamp(sel, 0, ch.length - 1)]);
    }
    function actPanel(a) {
      var rows = panel.rows, i;
      if (a.a === 'ptr') {
        var g = lastL && panelGeom(lastL); if (!g) return;
        g.rows.forEach(function (r, k) { if (a.x >= r.x && a.x < r.x + r.w && a.y >= r.y && a.y < r.y + r.h) { if (panel.cursor !== k) { panel.cursor = k; sfx('move'); } if (a.down) pickRow(k); } });
        return;
      }
      if (a.a === 'up' || a.a === 'left') { for (i = 1; i <= rows.length; i++) { var k = (panel.cursor - i + rows.length) % rows.length; if (rows[k].enabled) { panel.cursor = k; sfx('move'); break; } } }
      else if (a.a === 'down' || a.a === 'right') { for (i = 1; i <= rows.length; i++) { var k2 = (panel.cursor + i) % rows.length; if (rows[k2].enabled) { panel.cursor = k2; sfx('move'); break; } } }
      else if (a.a === 'confirm') pickRow(panel.cursor);
      else if (a.a === 'back') { var lv = -1; rows.forEach(function (q, j) { if (q.leave) lv = j; }); if (lv >= 0) { if (panel.cursor === lv) pickRow(lv); else { panel.cursor = lv; sfx('move'); } } }
    }
    function step(dt) {
      clock += dt;
      var inp = inbox; inbox = [];
      if (stamp) { stamp.t += dt; if (stamp.t > 1100) stamp = null; }
      var f = field(), L = f && M ? layout(f) : null; if (L) lastL = L;
      if (phase === 'map') {
        fade = Math.min(1, fade + dt / Math.max(1, P.openMs)); selT += dt;
        if (!choiceIds().length) { warnOnce('nochoice', 'no node to choose'); phase = 'done'; return; }
        if (autoOn()) { autoT += dt; var want = recommendIndex(); if (autoT >= P.autoMs * 0.5 && sel !== want) setSel(want); if (autoT >= P.autoMs) go(choiceIds()[sel]); }
        else if (fade >= 0.55) for (var i = 0; i < inp.length && phase === 'map'; i++) act(inp[i]);
      } else if (phase === 'travel') {
        pt += dt; fade = Math.min(1, fade + dt / Math.max(1, P.openMs));
        if (pt >= P.travelMs) arrive();
      } else if (phase === 'panel') {
        panel.t += dt;
        if (panel.picked >= 0) {
          panel.pickT += dt;
          if (panel.pickT >= (panel.rows[panel.picked].leave ? 260 : P.resultMs)) {
            var pq = panel.rows[panel.picked];
            if (panel.multi && !pq.leave) {                // a shop stays open: the item is sold, the other rows re-check the coins left
              pq.sold = true; refreshRows(panel.rows, info(IDX[panel.node])); panel.picked = -1; panel.pickT = 0; autoT = 0;
              var nx = -1; panel.rows.forEach(function (q, i) { if (nx < 0 && q.enabled && !q.leave) nx = i; }); if (nx < 0) panel.rows.forEach(function (q, i) { if (nx < 0 && q.leave) nx = i; });
              panel.cursor = Math.max(0, nx); dbg({ event: 'panelAgain', id: panel.node });
            } else closePanel();
          }
        } else if (autoOn()) { autoT += dt; if (autoT >= P.autoMs * 0.5) panel.cursor = autoRow(); if (autoT >= P.autoMs) pickRow(panel.cursor, true); }
        else if (panel.t >= 240) for (var j = 0; j < inp.length && panel && panel.picked < 0; j++) actPanel(inp[j]);
      } else if (phase === 'closing') {
        fade = Math.max(0, fade - dt / Math.max(1, P.closeMs));
        if (fade <= 0) { phase = 'away'; dbg({ event: 'away', id: awayNode }); if (pendingFinish) { var pf = pendingFinish; pendingFinish = null; finish(pf); } }
      }
      if (M && at == null && phase === 'map') { var cs = choiceIds()[sel]; if (cs) { startX += (IDX[cs].x - startX) * (1 - Math.exp(-dt / 70)); if (Math.abs(IDX[cs].x - startX) < 0.002) startX = IDX[cs].x; } }
      if (L) { var tg = scrollTarget(L); scroll += (tg - scroll) * (1 - Math.exp(-dt / 160)); if (Math.abs(tg - scroll) < 0.002) scroll = tg; if (phase === 'map' && fade < 0.05) scroll = tg; }
    }
    function update(dt) {
      dt = num(dt, 1000 / 60); if (!(dt > 0)) return; if (dt > 100) dt = 100;
      try { step(dt); } catch (e) { warnOnce('update', 'update error: ' + (e && e.stack || e)); }
    }
    function busy() { return phase === 'map' || phase === 'travel' || phase === 'panel' || phase === 'closing'; }
    function key(code, down) {
      var a = KEYS[code];
      if (!busy()) { if (!down) delete held[code]; return false; }
      if (!a) return false;
      if (down) { if (held[code]) return true; held[code] = 1; if (!autoOn()) inbox.push({ a: a }); } else delete held[code];
      return true;
    }
    function press(a) { if (!busy() || autoOn()) return false; if (['left', 'right', 'up', 'down', 'confirm', 'back'].indexOf(a) < 0) a = 'confirm'; inbox.push({ a: a }); return true; }
    function nearestChoice(x, y) {               // the closest connected node within its ring + 6u, or 22 css px on small screens (touch)
      var best = null, bd = 1e9, minR = lastCss > 0 ? 22 / lastCss : 0;
      choiceIds().forEach(function (id, i) {
        var p = xy(IDX[id], lastL), rad = Math.max(lastL.r * (IDX[id].type === 'boss' ? 1.6 : 1) + (lastL.px ? 4 : 6 * lastL.u), minR), d = (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y);
        if (d <= rad * rad && d < bd) { bd = d; best = i; }
      });
      return best;
    }
    function hitTest(x, y) {
      if (!busy() || !lastL) return null;
      if (phase === 'panel') { var g = panelGeom(lastL), hit0 = null; if (g) g.rows.forEach(function (r) { if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) hit0 = 'row'; }); return hit0; }
      if (phase !== 'map') return null;
      return nearestChoice(x, y) != null ? 'node' : null;
    }
    function pointer(x, y, down) {
      if (!busy() || autoOn()) return false;
      x = num(x, NaN); y = num(y, NaN); if (!isFinite(x) || !isFinite(y)) return false;
      var h = hitTest(x, y); inbox.push({ a: 'ptr', x: x, y: y, down: !!down });
      return !!h;
    }

    /* ----- drawing ----- */
    function reachSet() {
      var out = {}, q = choiceIds().slice(); if (travel) q = [travel.to];
      while (q.length) { var id = q.shift(); if (out[id]) continue; out[id] = 1; q = q.concat(IDX[id].next); }
      return out;
    }
    function nodeState(n, reach, ch) {
      if (n.id === at && !travel) return 'current';
      if (route.indexOf(n.id) >= 0) return 'route';
      if (phase === 'map' && ch.indexOf(n.id) >= 0) return 'choice';
      if (travel && travel.to === n.id) return 'target';
      return reach[n.id] ? 'reach' : 'gone';
    }
    function paintMap(c, f, L) {
      var a = phase === 'closing' ? eInOut(fade) : eOut(fade), px = L.px, u = L.u, Sh = L.sheet;
      c.save();
      c.fillStyle = rgba(hexRgb(tok('palette.ink', '#0b0d18')), P.dim * a); c.fillRect(f.x, f.y, f.w, f.h);
      var dy = px ? Math.round((1 - a) * 10) : (1 - a) * 18 * u;
      c.globalAlpha = px ? Math.round(a * 4) / 4 : a; c.translate(0, dy);
      if (c.globalAlpha > 0) {
        if (px) paintSheetPx(c, L); else paintSheetHd(c, L);
        var ch = choiceIds(), reach = reachSet();
        c.save();
        if (L.scrollMax > 0) { var ct = Sh.y + L.head + 1, cb = Sh.y + Sh.h - L.foot - 1; c.beginPath(); c.rect(Sh.x + 2, ct, Sh.w - 4, cb - ct); c.clip(); }
        paintEdges(c, L, ch, reach);
        paintNodes(c, L, ch, reach);
        paintToken(c, L);
        c.restore();
        if (L.scrollMax > 0 && !px) paintScrollFade(c, L);
        var tipOk = phase === 'map' ? paintTip(c, L, ch) : true;
        if (phase === 'map' || phase === 'travel') paintFooter(c, L, ch, !tipOk && fade >= 0.5);
        if (panel) paintPanel(c, L);
      }
      c.restore();
      drawnRects.push({ kind: 'sheet', x: Sh.x, y: Sh.y, w: Sh.w, h: Sh.h, dy: dy });
    }
    function paintSheetHd(c, L) {
      var S = L.sheet, u = L.u, rad = 12 * u;
      c.save(); c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 26 * u; c.shadowOffsetY = 8 * u;
      rr(c, S.x, S.y, S.w, S.h, rad); var g = c.createLinearGradient(0, S.y, 0, S.y + S.h); g.addColorStop(0, '#26304a'); g.addColorStop(0.55, '#1a2133'); g.addColorStop(1, '#10141f'); c.fillStyle = g; c.fill(); c.restore();
      c.save(); rr(c, S.x, S.y, S.w, S.h, rad); c.clip();
      var rs = mulberry(hashStr('contour|' + P.seed));          // faint survey contours, fixed per seed
      c.strokeStyle = 'rgba(239,226,196,0.055)'; c.lineWidth = 1 * u;
      for (var k = 0; k < 9; k++) {
        var y0 = S.y + S.h * (k + 0.5) / 9, ph = rs() * 6.28, am = (4 + rs() * 7) * u, fr = (1.2 + rs() * 1.6) / S.w * 6.28;
        c.beginPath(); for (var x = S.x; x <= S.x + S.w; x += 6 * u) { var yy = y0 + Math.sin(x * fr + ph) * am + Math.sin(x * fr * 2.3 + ph * 1.7) * am * 0.35; if (x === S.x) c.moveTo(x, yy); else c.lineTo(x, yy); } c.stroke();
      }
      var bp = xy(IDX.boss, L), gl = c.createRadialGradient(bp.x, bp.y, 0, bp.x, bp.y, S.w * 0.55); gl.addColorStop(0, 'rgba(255,92,116,0.16)'); gl.addColorStop(1, 'rgba(255,92,116,0)'); c.fillStyle = gl; c.fillRect(S.x, S.y, S.w, S.h);
      var vg = c.createRadialGradient(S.x + S.w / 2, S.y + S.h * 0.55, S.w * 0.2, S.x + S.w / 2, S.y + S.h * 0.55, Math.max(S.w, S.h) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)'); c.fillStyle = vg; c.fillRect(S.x, S.y, S.w, S.h);
      c.restore();
      rr(c, S.x + 0.75 * u, S.y + 0.75 * u, S.w - 1.5 * u, S.h - 1.5 * u, rad); c.strokeStyle = 'rgba(255,214,140,0.5)'; c.lineWidth = 1.5 * u; c.stroke();
      rr(c, S.x + 5 * u, S.y + 5 * u, S.w - 10 * u, S.h - 10 * u, rad * 0.7); c.strokeStyle = 'rgba(255,214,140,0.13)'; c.lineWidth = 1 * u; c.stroke();
      c.fillStyle = 'rgba(255,214,140,0.7)';
      [[S.x + 5 * u, S.y + 5 * u], [S.x + S.w - 5 * u, S.y + 5 * u], [S.x + 5 * u, S.y + S.h - 5 * u], [S.x + S.w - 5 * u, S.y + S.h - 5 * u]].forEach(function (p) { poly(c, [p[0], p[1] - 3 * u, p[0] + 3 * u, p[1], p[0], p[1] + 3 * u, p[0] - 3 * u, p[1]]); c.fill(); });
      var hy = S.y + L.head / 2 + 1 * u;
      c.textBaseline = 'middle'; c.textAlign = 'left'; c.font = hdFont('700', 15 * u); c.fillStyle = PAPER;
      c.fillText(String(P.title), S.x + 18 * u, hy);
      var fl = floorNow(), ftxt = 'FLOOR ' + fl + ' / ' + (M.floors + 1);
      c.textAlign = 'right'; c.font = hdFont('600', 10.5 * u); c.fillStyle = 'rgba(255,211,107,0.85)'; c.fillText(ftxt, S.x + S.w - 18 * u, hy);
      var dg = c.createLinearGradient(S.x, 0, S.x + S.w, 0); dg.addColorStop(0, 'rgba(255,214,140,0)'); dg.addColorStop(0.5, 'rgba(255,214,140,0.35)'); dg.addColorStop(1, 'rgba(255,214,140,0)');
      c.fillStyle = dg; c.fillRect(S.x + 12 * u, S.y + L.head, S.w - 24 * u, 1 * u);
    }
    function paintSheetPx(c, L) {
      var S = L.sheet;
      c.fillStyle = '#0b0d18'; c.fillRect(S.x - 1, S.y - 1, S.w + 2, S.h + 2);
      c.fillStyle = '#c9a860'; c.fillRect(S.x, S.y, S.w, S.h);
      c.fillStyle = '#1b2234'; c.fillRect(S.x + 1, S.y + 1, S.w - 2, S.h - 2);
      c.fillStyle = '#151b2a'; for (var y = S.y + L.head + 4; y < S.y + S.h - 2; y += 4) c.fillRect(S.x + 2, y, S.w - 4, 1);     // scanline texture
      c.fillStyle = '#2c3550'; c.fillRect(S.x + 2, S.y + L.head, S.w - 4, 1);
      pxText(c, String(P.title).toUpperCase(), S.x + 5, S.y + 4, PAPER, 'left', 1, '#0b0d18');
      pxText(c, 'F' + floorNow() + '/' + (M.floors + 1), S.x + S.w - 5, S.y + 4, GOLD, 'right', 1, '#0b0d18');
    }
    function floorNow() { if (travel) return IDX[travel.to].row + 1; if (phase === 'map') return at == null ? 1 : Math.min(M.floors + 1, IDX[at].row + 2); return at == null ? 1 : IDX[at].row + 1; }
    function edgeEnds(A, B, ra, rb) {
      var dx = B.x - A.x, dy = B.y - A.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      return { x0: A.x + dx / d * ra, y0: A.y + dy / d * ra, x1: B.x - dx / d * rb, y1: B.y - dy / d * rb, len: Math.max(0, d - ra - rb) };
    }
    function paintEdges(c, L, ch, reach) {
      var px = L.px, u = L.u, r = L.r, faint = [], live = [], gold = [], tp = travel ? eInOut(pt / Math.max(1, P.travelMs)) : 0;
      var rOf = function (n) { return n && n.type === 'boss' ? (px ? 10 : r * 1.6) : r; };
      M.nodes.forEach(function (n) {
        n.next.forEach(function (mid) {
          var m = IDX[mid], A = xy(n, L), B = xy(m, L), e = edgeEnds(A, B, rOf(n) + (px ? 2 : 3 * u), rOf(m) + (px ? 2 : 3 * u));
          var ri = route.indexOf(n.id);
          if (ri >= 0 && route[ri + 1] === m.id) gold.push(e);
          else if (travel && travel.from === n.id && travel.to === m.id) { faint.push([e, 0.5]); gold.push({ x0: e.x0, y0: e.y0, x1: e.x0 + (e.x1 - e.x0) * tp, y1: e.y0 + (e.y1 - e.y0) * tp, len: e.len * tp }); }
          else if (phase === 'map' && n.id === at && ch.indexOf(m.id) >= 0) live.push([e, ch.indexOf(m.id) === sel]);
          else faint.push([e, reach[n.id] && reach[m.id] ? 0.34 : 0.1]);
        });
      });
      var sGap = px ? 2 : 4 * u;                          // start stubs: a short vertical leg under every bottom node
      M.starts.forEach(function (id) {
        var e = edgeEnds(stubBase(id, L), xy(IDX[id], L), sGap, r + (px ? 2 : 3 * u));
        if (route[0] === id) gold.push(e);
        else if (travel && travel.from == null && travel.to === id) { faint.push([e, 0.5]); gold.push({ x0: e.x0, y0: e.y0, x1: e.x0 + (e.x1 - e.x0) * tp, y1: e.y0 + (e.y1 - e.y0) * tp }); }
        else if (phase === 'map' && at == null) live.push([e, ch[sel] === id]);
        else faint.push([e, at == null && !travel ? 0.34 : 0.1]);
      });
      var march = Math.floor(clock / 90);
      if (px) {
        faint.forEach(function (q) { c.fillStyle = q[1] > 0.3 ? '#6d6650' : '#3a3c48'; pxLine(c, q[0].x0, q[0].y0, q[0].x1, q[0].y1, 1, 2, 0); });
        live.forEach(function (q) { c.fillStyle = q[1] ? '#fff2c0' : '#c9a860'; pxLine(c, q[0].x0, q[0].y0, q[0].x1, q[0].y1, 2, 2, -march); });
        gold.forEach(function (e) { c.fillStyle = '#0b0d18'; pxLine(c, e.x0 + 1, e.y0 + 1, e.x1 + 1, e.y1 + 1, 1, 0, 0); c.fillStyle = GOLD; pxLine(c, e.x0, e.y0, e.x1, e.y1, 1, 0, 0); });
        return;
      }
      c.lineCap = 'round';
      faint.forEach(function (q) { var e = q[0]; c.strokeStyle = 'rgba(239,226,196,' + q[1] + ')'; c.lineWidth = 2.4 * u; c.setLineDash([0.01, 7 * u]); c.beginPath(); c.moveTo(e.x0, e.y0); c.lineTo(e.x1, e.y1); c.stroke(); });
      live.forEach(function (q) {
        var e = q[0]; c.setLineDash([7 * u, 6 * u]); c.lineDashOffset = -(clock * 0.028) * u;
        if (q[1]) { c.save(); c.shadowColor = 'rgba(255,211,107,0.8)'; c.shadowBlur = 8 * u; c.strokeStyle = 'rgba(255,233,170,0.95)'; c.lineWidth = 3 * u; c.beginPath(); c.moveTo(e.x0, e.y0); c.lineTo(e.x1, e.y1); c.stroke(); c.restore(); }
        else { c.strokeStyle = 'rgba(255,211,107,0.55)'; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(e.x0, e.y0); c.lineTo(e.x1, e.y1); c.stroke(); }
      });
      c.setLineDash([]); c.lineDashOffset = 0;
      gold.forEach(function (e) {
        c.strokeStyle = 'rgba(8,10,18,0.7)'; c.lineWidth = 6 * u; c.beginPath(); c.moveTo(e.x0, e.y0); c.lineTo(e.x1, e.y1); c.stroke();
        c.save(); c.shadowColor = 'rgba(255,190,80,0.75)'; c.shadowBlur = 9 * u; c.strokeStyle = GOLD; c.lineWidth = 3.2 * u; c.beginPath(); c.moveTo(e.x0, e.y0); c.lineTo(e.x1, e.y1); c.stroke(); c.restore();
        c.strokeStyle = 'rgba(255,248,220,0.7)'; c.lineWidth = 1 * u; c.beginPath(); c.moveTo(e.x0, e.y0); c.lineTo(e.x1, e.y1); c.stroke();
      });
    }
    function paintNodes(c, L, ch, reach) {
      var px = L.px, u = L.u;
      var bases = M.starts.map(function (id) { return stubBase(id, L); }), on = at == null && !travel;
      if (bases.length > 1) {                            // the trailhead: a faint baseline the token slides along before the first pick
        var bx0 = Math.min.apply(null, bases.map(function (b) { return b.x; })), bx1 = Math.max.apply(null, bases.map(function (b) { return b.x; }));
        if (px) { c.fillStyle = on ? '#4a4636' : '#2a2e3c'; c.fillRect(Math.round(bx0), bases[0].y + 1, Math.round(bx1 - bx0) + 1, 1); }
        else { c.strokeStyle = on ? 'rgba(255,214,140,0.28)' : 'rgba(255,214,140,0.1)'; c.lineWidth = 1.5 * u; c.beginPath(); c.moveTo(bx0, bases[0].y + 2 * u); c.lineTo(bx1, bases[0].y + 2 * u); c.stroke(); }
      }
      M.starts.forEach(function (id, i) {
        var b = bases[i], used = route[0] === id || (travel && travel.from == null && travel.to === id);
        if (px) { c.fillStyle = used ? GOLD : on ? '#c9a860' : '#4a4636'; c.fillRect(b.x - 2, b.y, 5, 1); c.fillRect(b.x - 1, b.y + 1, 3, 1); }
        else { c.fillStyle = used ? 'rgba(255,211,107,0.85)' : on ? 'rgba(255,214,140,0.55)' : 'rgba(255,214,140,0.2)'; c.beginPath(); c.ellipse(b.x, b.y + 2 * u, 6 * u, 2.2 * u, 0, 0, 7); c.fill(); }
      });
      M.nodes.forEach(function (n) {
        var st = nodeState(n, reach, ch), p = xy(n, L), col = LOOK[n.type].col, isSel = st === 'choice' && ch[sel] === n.id;
        var r = L.r * (n.type === 'boss' ? 1.6 : 1), alpha = st === 'gone' ? 0.3 : st === 'reach' ? 0.8 : st === 'route' ? 0.9 : 1;
        if (px) { paintNodePx(c, n, p, st, isSel, alpha); return; }
        var lift = isSel ? eBack2(Math.min(1, selT / 170)) : 0, s = 1 + 0.2 * lift + (st === 'choice' && !isSel ? 0.04 * Math.sin(clock / 260 + n.col) : 0);
        if (st === 'target') s = 1.15;
        var R = r * s, cy = p.y - lift * 3 * u;
        c.save(); c.globalAlpha *= alpha;
        c.fillStyle = 'rgba(0,0,0,0.38)'; c.beginPath(); c.ellipse(p.x, p.y + r * 0.92, R * 0.9, R * 0.3, 0, 0, 7); c.fill();
        if (st === 'choice' || st === 'target' || st === 'current' || n.type === 'boss') {
          var gl = c.createRadialGradient(p.x, cy, R * 0.6, p.x, cy, R * (isSel ? 2.6 : 2)); var rgb = hexRgb(col);
          gl.addColorStop(0, rgba(rgb, isSel ? 0.45 : st === 'choice' ? 0.25 : 0.18)); gl.addColorStop(1, rgba(rgb, 0)); c.fillStyle = gl; c.beginPath(); c.arc(p.x, cy, R * 2.6, 0, 7); c.fill();
        }
        if (n.type === 'boss') {
          c.save(); c.translate(p.x, cy); c.rotate(clock * 0.00025); c.fillStyle = st === 'gone' ? '#5a3040' : 'rgba(255,92,116,0.8)';
          for (var k = 0; k < 12; k++) { c.rotate(Math.PI / 6); poly(c, [-R * 0.16, -R * 1.12, 0, -R * 1.4, R * 0.16, -R * 1.12]); c.fill(); }
          c.restore();
        }
        if (st === 'choice') { c.strokeStyle = rgba(hexRgb(col), isSel ? 0.95 : 0.55); c.lineWidth = (isSel ? 2 : 1.4) * u; c.beginPath(); c.arc(p.x, cy, R + (4 + 1.6 * Math.sin(clock / 220)) * u, 0, 7); c.stroke(); }
        var g = c.createRadialGradient(p.x - R * 0.3, cy - R * 0.4, R * 0.1, p.x, cy, R);
        g.addColorStop(0, st === 'gone' ? '#262b38' : '#33405e'); g.addColorStop(1, st === 'gone' ? '#11141c' : '#121827');
        c.fillStyle = g; c.beginPath(); c.arc(p.x, cy, R, 0, 7); c.fill();
        c.strokeStyle = '#0b0d18'; c.lineWidth = 3.4 * u; c.stroke();
        c.strokeStyle = st === 'gone' ? '#4a5064' : st === 'route' ? rgba(hexRgb(GOLD), 0.85) : col; c.lineWidth = (isSel ? 2.4 : 1.8) * u; c.beginPath(); c.arc(p.x, cy, R - 0.4 * u, 0, 7); c.stroke();
        drawIcon(c, n.type, p.x, cy, R * 1.12, st === 'gone' ? '#6c7186' : st === 'route' ? shade(col, -0.25) : col);
        if (cleared[n.id]) {
          var bx = p.x + R * 0.72, by = cy + R * 0.7, br = Math.max(4.5 * u, R * 0.4);
          c.fillStyle = '#0b0d18'; c.beginPath(); c.arc(bx, by, br + 1.2 * u, 0, 7); c.fill();
          c.fillStyle = '#3cc483'; c.beginPath(); c.arc(bx, by, br, 0, 7); c.fill();
          c.strokeStyle = '#f4fff8'; drawIcon(c, 'check', bx, by, br * 1.25, '#f4fff8');
        }
        if (stamp && stamp.id === n.id) {
          var q = stamp.t / 1100;
          c.strokeStyle = rgba('255,211,107', (1 - q) * 0.9); c.lineWidth = (3 - 2 * q) * u; c.beginPath(); c.arc(p.x, cy, R * (1 + q * 1.4), 0, 7); c.stroke();
        }
        c.restore();
      });
    }
    function paintNodePx(c, n, p, st, isSel, alpha) {
      var r = n.type === 'boss' ? 10 : 7, col = LOOK[n.type].col, blink = Math.floor(clock / 280) % 2 === 0;
      c.save(); c.globalAlpha *= alpha;
      var ring = st === 'gone' ? '#4a5064' : st === 'route' ? '#c9a860' : col, d = pxDisc(r, st === 'gone' ? '#141824' : '#232c44', ring);
      if (n.type === 'boss' && st !== 'gone') { c.fillStyle = '#ff5c74'; var k = Math.floor(clock / 200) % 2; [[0, -r - 3 - k], [0, r + 2 + k], [-r - 3 - k, 0], [r + 2 + k, 0]].forEach(function (q) { c.fillRect(p.x + q[0], p.y + q[1], 1, 1); }); }
      if (d) c.drawImage(d, p.x - r - 1, p.y - r - 1);
      var ic = pixelIcon(n.type, n.type === 'boss' ? 15 : 11, st === 'gone' ? '#6c7186' : col);
      if (ic) c.drawImage(ic, Math.round(p.x - ic.width / 2), Math.round(p.y - ic.height / 2));
      if (cleared[n.id]) { c.fillStyle = '#0b0d18'; c.fillRect(p.x + r - 3, p.y + r - 3, 5, 5); c.fillStyle = '#3cc483'; c.fillRect(p.x + r - 2, p.y + r - 2, 3, 3); }
      if (st === 'choice' && (blink || isSel)) {
        c.fillStyle = isSel ? '#fff2c0' : col; var e = r + 3 + (isSel && blink ? 1 : 0);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { var x = p.x + s[0] * e, y = p.y + s[1] * e; c.fillRect(s[0] < 0 ? x : x - 2, y, 3, 1); c.fillRect(x, s[1] < 0 ? y : y - 2, 1, 3); });
      }
      if (stamp && stamp.id === n.id && Math.floor(stamp.t / 120) % 2 === 0) { c.fillStyle = GOLD; c.fillRect(p.x - r - 2, p.y - r - 2, 2 * r + 5, 1); c.fillRect(p.x - r - 2, p.y + r + 2, 2 * r + 5, 1); }
      c.restore();
    }
    function paintToken(c, L) {
      var px = L.px, u = L.u, p, hop = 0;
      if (travel) {
        var A = travel.from == null ? startXY(L) : xy(IDX[travel.from], L), B = xy(IDX[travel.to], L), q = eInOut(pt / Math.max(1, P.travelMs));
        p = { x: A.x + (B.x - A.x) * q, y: A.y + (B.y - A.y) * q }; hop = Math.sin(Math.PI * q);
      } else p = at == null ? startXY(L) : xy(IDX[at], L);
      var r = at && !travel && IDX[at].type === 'boss' ? L.r * 1.6 : L.r;
      if (px) {
        var im = pawnImg(), bob = Math.floor(clock / 300) % 2;
        if (im) c.drawImage(im, Math.round(p.x - 3), Math.round(p.y - (at == null && !travel ? 9 : 6) - (at == null && !travel ? 0 : bob) - Math.round(hop * 5)));
        return;
      }
      var lift = (at == null && !travel ? 1 * u : -r * 0.35) + 2 * u * Math.sin(clock / 240) + hop * 14 * u, x = p.x, y = p.y - lift, s = at == null && !travel ? Math.max(0.6 * u, Math.min(1.05 * u, (0.95 * L.rowH - L.r - 3 * u) / 19)) : 1.05 * u;
      c.save();
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(p.x, p.y + (at == null && !travel ? 2 * u : r * 0.42), 7 * u * (1 - hop * 0.3), 2.4 * u, 0, 0, 7); c.fill();
      c.translate(x, y); c.scale(s, s);
      c.beginPath(); c.moveTo(-7, 0); c.quadraticCurveTo(-7, -4, -3.2, -6); c.quadraticCurveTo(-5.5, -9, -5.5, -12.5); c.arc(0, -13, 5.5, Math.PI, 0); c.quadraticCurveTo(5.5, -9, 3.2, -6); c.quadraticCurveTo(7, -4, 7, 0); c.closePath();
      c.lineWidth = 3; c.strokeStyle = '#0b0d18'; c.lineJoin = 'round'; c.stroke();
      var g = c.createLinearGradient(-7, -18, 7, 0); g.addColorStop(0, '#fff3c4'); g.addColorStop(0.45, GOLD); g.addColorStop(1, '#b07a1e'); c.fillStyle = g; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.arc(-2, -15, 1.6, 0, 7); c.fill();
      c.fillStyle = '#b07a1e'; c.fillRect(-6, -2, 12, 2);
      c.restore();
    }
    function paintScrollFade(c, L) {
      var A = L.area, u = L.u, h = 16 * u;
      if (scroll > 0.05) { var g = c.createLinearGradient(0, A.y + A.h - h, 0, A.y + A.h + L.r); g.addColorStop(0, 'rgba(16,20,31,0)'); g.addColorStop(1, 'rgba(16,20,31,0.95)'); c.fillStyle = g; c.fillRect(L.sheet.x + 2 * u, A.y + A.h - h, L.sheet.w - 4 * u, h + L.r); }
      if (scroll < L.scrollMax / L.rowH - 0.05) { var g2 = c.createLinearGradient(0, A.y - L.r, 0, A.y + h); g2.addColorStop(0, 'rgba(32,40,60,0.95)'); g2.addColorStop(1, 'rgba(32,40,60,0)'); c.fillStyle = g2; c.fillRect(L.sheet.x + 2 * u, A.y - L.r, L.sheet.w - 4 * u, h + L.r); }
    }
    function paintFooter(c, L, ch, selLine) {
      var S = L.sheet, px = L.px, u = L.u, fy = S.y + S.h - L.foot / 2, tb = L.tb || 1;
      if (!px && selLine && ch[sel]) {                  // no room for a tooltip by the node: the selected node's line replaces the legend
        var st = IDX[ch[sel]].type, sl = labelOf(st).toUpperCase(), sd = descOf(st), fs = 11 * u * tb;
        c.font = hdFont('800', fs); var slw = c.measureText(sl).width; c.font = hdFont('500', fs); var sdw = c.measureText(sd).width;
        var tw2 = 14 * u * tb + 6 * u + slw + 8 * u + sdw, x2 = S.x + (S.w - tw2) / 2;
        c.textBaseline = 'middle'; c.textAlign = 'left';
        drawIcon(c, st, x2 + 7 * u * tb, fy, 14 * u * tb, LOOK[st].col);
        c.font = hdFont('800', fs); c.fillStyle = LOOK[st].col; c.fillText(sl, x2 + 14 * u * tb + 6 * u, fy + 0.5 * u);
        c.font = hdFont('500', fs); c.fillStyle = PAPER; c.fillText(sd, x2 + 14 * u * tb + 14 * u + slw, fy + 0.5 * u);
        return;
      }
      if (px) {
        var id = phase === 'map' ? ch[sel] : travel ? travel.to : null; if (!id) return;
        var t = IDX[id].type, ic = pixelIcon(t, 9, LOOK[t].col), lab = labelOf(t).toUpperCase() + ' ' + descOf(t, true);
        c.fillStyle = '#2c3550'; c.fillRect(S.x + 2, S.y + S.h - L.foot - 1, S.w - 4, 1);
        var tw = pxW(lab) + 12, x0 = Math.round(S.x + (S.w - tw) / 2);
        if (ic) c.drawImage(ic, x0, Math.round(fy - 5));
        pxText(c, lab, x0 + 12, Math.round(fy - 3), PAPER, 'left', 1, '#0b0d18');
        return;
      }
      if (P.legend === 'off') return;
      var items = TYPES.map(function (t) { return { t: t, l: labelOf(t) }; }), size = 10.5 * u * tb, isz = 12 * u * tb, gap = 12 * u, w = 0;
      c.font = hdFont('600', size);
      items.forEach(function (it) { it.w = isz + 4 * u + c.measureText(it.l).width; w += it.w + gap; }); w -= gap;
      var showLabels = w <= S.w - 24 * u; if (!showLabels) w = items.length * (isz + gap) - gap;
      var x = S.x + (S.w - w) / 2;
      c.textBaseline = 'middle'; c.textAlign = 'left';
      items.forEach(function (it) {
        drawIcon(c, it.t, x + isz / 2, fy, isz, LOOK[it.t].col);
        if (showLabels) { c.fillStyle = 'rgba(239,226,196,0.72)'; c.fillText(it.l, x + isz + 4 * u, fy + 0.5 * u); x += it.w + gap; } else x += isz + gap;
      });
    }
    function paintTip(c, L, ch) {
      if (L.px || !ch.length || fade < 0.5) return true;
      var n = IDX[ch[sel]]; if (!n) return true;
      var tb = L.tb || 1, u = L.u, p = xy(n, L), r = L.r * (n.type === 'boss' ? 1.6 : 1), lab = labelOf(n.type).toUpperCase(), desc = descOf(n.type), size = 11 * u * tb;
      c.font = hdFont('800', size); var lw = c.measureText(lab).width; c.font = hdFont('500', size); var dw = c.measureText(desc).width;
      var kw = 15 * u * tb, w = 10 * u + lw + 8 * u + dw + 8 * u + kw + 8 * u, h = 23 * u * tb, S = L.sheet;
      var others = M.nodes.filter(function (q) { return q !== n; }).map(function (q) { var qp = xy(q, L), qr = L.r * (q.type === 'boss' ? 1.6 : 1) + 2 * u; return { x: qp.x - qr, y: qp.y - qr, w: qr * 2, h: qr * 2 }; });
      var tp = at ? xy(IDX[at], L) : startXY(L); others.push({ x: tp.x - L.r * 1.1, y: tp.y - L.r * 1.9, w: L.r * 2.2, h: L.r * 2.9 });
      function place(w) {
        var best = null;
        [['up', p.y - r * 1.25 - 13 * u - h], ['down', p.y + r * 1.25 + 12 * u]].forEach(function (cd) {   // above or below, sliding sideways
          [0, -0.3, 0.3, -0.45, 0.45].forEach(function (k) {
            var bx = clamp(p.x - w / 2 + k * w, S.x + 8 * u, S.x + S.w - 8 * u - w), by = cd[1];
            if (by < S.y + L.head + 2 * u || by + h > S.y + S.h - L.foot) return;
            var box = { x: bx, y: by, w: w, h: h }, cost = others.filter(function (q) { return hit(box, q); }).length * 10 + Math.abs(k) + (cd[0] === 'down' ? 0.5 : 0);
            if (!best || cost < best.cost) best = { x: bx, y: by, up: cd[0] === 'up', cost: cost };
          });
        });
        [[p.x + r * 1.3 + 9 * u, 'right'], [p.x - r * 1.3 - 9 * u - w, 'left']].forEach(function (sd) {   // beside the node
          var bx = sd[0], by = clamp(p.y - h / 2, S.y + L.head + 2 * u, S.y + S.h - L.foot - h);
          if (bx < S.x + 6 * u || bx + w > S.x + S.w - 6 * u) return;
          var box = { x: bx, y: by, w: w, h: h }, cost = others.filter(function (q) { return hit(box, q); }).length * 10 + 0.8;
          if (!best || cost < best.cost) best = { x: bx, y: by, side: sd[1], cost: cost };
        });
        return best || { x: clamp(p.x - w / 2, S.x + 8 * u, S.x + S.w - 8 * u - w), y: p.y + r * 1.25 + 12 * u, up: false, cost: 99 };
      }
      var best = place(w), compact = false;
      if (best.cost >= 10) { var wc = 10 * u + lw + 8 * u + kw + 8 * u, b2 = place(wc); if (b2.cost < best.cost) { best = b2; w = wc; compact = true; } }
      if (best.cost >= 10) return false;            // it would cover a node or the pawn: the footer carries the line instead
      var above = best.up, y = best.y, x = best.x, a = Math.min(1, selT / 140);
      c.save(); c.globalAlpha *= a; y += (1 - a) * 4 * u;
      c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 10 * u; rr(c, x, y, w, h, h / 2); c.fillStyle = 'rgba(10,12,22,0.94)'; c.fill(); c.shadowBlur = 0;
      c.strokeStyle = rgba(hexRgb(LOOK[n.type].col), 0.7); c.lineWidth = 1.2 * u; c.stroke();
      var tx = clamp(p.x, x + h / 2, x + w - h / 2); c.fillStyle = 'rgba(10,12,22,0.94)';
      if (best.side === 'right') poly(c, [x + 0.5, y + h / 2 - 5 * u, x + 0.5, y + h / 2 + 5 * u, x - 5 * u, y + h / 2]);
      else if (best.side === 'left') poly(c, [x + w - 0.5, y + h / 2 - 5 * u, x + w - 0.5, y + h / 2 + 5 * u, x + w + 5 * u, y + h / 2]);
      else if (above) poly(c, [tx - 5 * u, y + h - 0.5, tx + 5 * u, y + h - 0.5, tx, y + h + 5 * u]); else poly(c, [tx - 5 * u, y + 0.5, tx + 5 * u, y + 0.5, tx, y - 5 * u]);
      c.fill();
      c.textBaseline = 'middle'; c.textAlign = 'left';
      c.font = hdFont('800', size); c.fillStyle = LOOK[n.type].col; c.fillText(lab, x + 10 * u, y + h / 2 + 0.5 * u);
      if (!compact) { c.font = hdFont('500', size); c.fillStyle = PAPER; c.fillText(desc, x + 18 * u + lw, y + h / 2 + 0.5 * u); }
      var kx = x + w - 8 * u - kw; rr(c, kx, y + 4 * u, kw, h - 8 * u, 3 * u); c.fillStyle = 'rgba(255,211,107,0.18)'; c.fill(); c.strokeStyle = 'rgba(255,211,107,0.7)'; c.lineWidth = 1 * u; c.stroke();
      c.font = hdFont('800', 9.5 * u * tb); c.textAlign = 'center'; c.fillStyle = GOLD; c.fillText('Z', kx + kw / 2, y + h / 2 + 0.5 * u);
      c.restore();
      drawnRects.push({ kind: 'tip', x: x, y: y, w: w, h: h });
      return true;
    }
    function paintPanel(c, L) {
      var g = panelGeom(L); if (!g) return;
      var px = L.px, u = L.u, a = eOut(panel.t / 260), off = px ? Math.round((1 - a) * 12) : (1 - a) * 22 * u, col = LOOK[panel.type].col;
      c.save();
      c.fillStyle = 'rgba(5,6,12,' + (0.45 * a).toFixed(3) + ')'; c.fillRect(L.sheet.x, L.sheet.y, L.sheet.w, L.sheet.h);
      c.globalAlpha *= px ? Math.round(a * 4) / 4 : a; c.translate(0, off);
      if (px) {
        c.fillStyle = '#0b0d18'; c.fillRect(g.x - 1, g.y - 1, g.w + 2, g.h + 2); c.fillStyle = col; c.fillRect(g.x, g.y, g.w, g.h); c.fillStyle = '#20283e'; c.fillRect(g.x + 1, g.y + 1, g.w - 2, g.h - 2);
        var ic = pixelIcon(panel.type, 11, col); if (ic) c.drawImage(ic, g.x + g.pad, g.y + g.pad - 1);
        pxText(c, panel.title.toUpperCase(), g.x + g.pad + 15, g.y + g.pad + 1, col, 'left', 1, '#0b0d18');
        c.fillStyle = '#39425e'; c.fillRect(g.x + 3, g.y + g.pad + g.headH - 5, g.w - 6, 1);
        g.lines.forEach(function (ln, i) { pxText(c, ln, g.x + g.pad, g.y + g.pad + g.headH + i * g.lineH - 2, panel.picked >= 0 && panel.res ? '#9ff0c6' : PAPER, 'left', 1, '#0b0d18'); });
        panel.rows.forEach(function (q, i) {
          var rr0 = g.rows[i], on = i === panel.cursor, picked = i === panel.picked, fl = picked && Math.floor(panel.pickT / 90) % 2 === 0;
          if (on) { c.fillStyle = fl ? '#5a4a20' : '#33304a'; c.fillRect(rr0.x, rr0.y, rr0.w, rr0.h); c.fillStyle = GOLD; c.fillRect(rr0.x, rr0.y, 1, rr0.h); }
          var tc = !q.enabled ? '#6c7186' : on ? '#fff2c0' : PAPER;
          if (on) pxText(c, '▶', rr0.x + 3, rr0.y + 2, GOLD);
          pxText(c, q.label, rr0.x + 9, rr0.y + 2, tc, 'left', 1, '#0b0d18');
          if (q.cost > 0 || (!q.enabled && q.why)) pxText(c, q.enabled ? q.cost + 'G' : q.why.toUpperCase(), rr0.x + rr0.w - 2, rr0.y + 2, q.enabled ? GOLD : '#ff8a7a', 'right', 1, '#0b0d18');
        });
        if (g.hintY != null) {                          // what the selected row does (pixel rows only fit the label)
          var hq = panel.rows[panel.cursor];
          c.fillStyle = '#39425e'; c.fillRect(g.x + 3, g.hintY - 3, g.w - 6, 1);
          if (hq) {
            var ht = hq.leave ? 'Move on.' : (hq.text || hq.label) + (hq.cost > 0 ? ' - ' + hq.cost + ' coins' : '') + (!hq.enabled && hq.why ? ' (' + hq.why + ')' : '');
            pxWrap(ht, g.w - 2 * g.pad, 2).forEach(function (ln, i) { pxText(c, ln, g.x + g.pad, g.hintY + i * 9, '#c9d2e8', 'left', 1, '#0b0d18'); });
          }
        }
      } else {
        c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 24 * u; c.shadowOffsetY = 6 * u;
        rr(c, g.x, g.y, g.w, g.h, 10 * u); var bg = c.createLinearGradient(0, g.y, 0, g.y + g.h); bg.addColorStop(0, '#2a3450'); bg.addColorStop(1, '#151a28'); c.fillStyle = bg; c.fill();
        c.shadowBlur = 0; c.shadowOffsetY = 0; c.strokeStyle = rgba(hexRgb(col), 0.75); c.lineWidth = 1.5 * u; c.stroke();
        c.save(); rr(c, g.x, g.y, g.w, g.h, 10 * u); c.clip(); var hg = c.createLinearGradient(0, g.y, 0, g.y + g.headH + g.pad); hg.addColorStop(0, rgba(hexRgb(col), 0.22)); hg.addColorStop(1, rgba(hexRgb(col), 0)); c.fillStyle = hg; c.fillRect(g.x, g.y, g.w, g.headH + g.pad); c.restore();
        var tb = g.tb, mr = 14 * u * tb, mx = g.x + g.pad + mr, my = g.y + g.pad + g.headH / 2 - 2 * u;
        c.fillStyle = '#121827'; c.beginPath(); c.arc(mx, my, mr, 0, 7); c.fill(); c.strokeStyle = col; c.lineWidth = 1.8 * u; c.stroke();
        drawIcon(c, panel.type, mx, my, mr * 1.15, col);
        c.textBaseline = 'middle'; c.textAlign = 'left';
        c.font = hdFont('800', 15 * u * tb); c.fillStyle = PAPER; c.fillText(panel.title, mx + mr + 10 * u, my - 6 * u * tb);
        c.font = hdFont('700', 9.5 * u * tb); c.fillStyle = col; c.fillText((panel.title.toLowerCase() === labelOf(panel.type).toLowerCase() ? '' : labelOf(panel.type).toUpperCase() + '  ·  ') + 'FLOOR ' + (IDX[panel.node].row + 1), mx + mr + 10 * u, my + 9 * u * tb);
        var res = (panel.picked >= 0 || panel.multi) && panel.res;
        c.font = hdFont(res ? '700' : '500', 12.5 * u * tb); c.fillStyle = res ? '#9ff0c6' : 'rgba(239,226,196,0.9)';
        g.lines.forEach(function (ln, i) { c.fillText(ln, g.x + g.pad, g.y + g.pad + g.headH + i * g.lineH + g.lineH / 2); });
        panel.rows.forEach(function (q, i) {
          var r0 = g.rows[i], on = i === panel.cursor, picked = i === panel.picked, pulse = picked ? 0.5 + 0.5 * Math.cos(panel.pickT / 70) : 0;
          rr(c, r0.x, r0.y, r0.w, r0.h, 6 * u);
          c.fillStyle = on ? 'rgba(255,211,107,' + (0.16 + 0.2 * pulse).toFixed(3) + ')' : 'rgba(255,255,255,0.045)'; c.fill();
          if (on) { c.strokeStyle = 'rgba(255,211,107,0.75)'; c.lineWidth = 1.2 * u; c.stroke(); c.fillStyle = GOLD; rr(c, r0.x, r0.y + 4 * u, 3 * u, r0.h - 8 * u, 1.5 * u); c.fill(); }
          c.save(); c.globalAlpha *= q.enabled ? 1 : 0.45;
          c.font = hdFont('700', 12 * u * tb); c.fillStyle = on ? '#fff4d0' : PAPER; c.textAlign = 'left';
          var lx = r0.x + 12 * u; c.fillText(q.label, lx, r0.y + r0.h / 2 + 0.5 * u);
          var lw2 = c.measureText(q.label).width, right = r0.x + r0.w - 10 * u;
          if (!q.enabled && (!(q.cost > 0) || q.sold) && q.why) { c.font = hdFont('700', 10.5 * u * tb); c.textAlign = 'right'; c.fillStyle = '#ff8a7a'; c.fillText(q.why, right, r0.y + r0.h / 2 + 0.5 * u); right -= c.measureText(q.why).width + 10 * u; }
          if (q.cost > 0 && !q.sold) {
            c.font = hdFont('800', 11.5 * u * tb); c.textAlign = 'right'; c.fillStyle = q.enabled ? GOLD : '#ff8a7a';
            var ct = q.enabled ? String(q.cost) : q.why; c.fillText(ct, right, r0.y + r0.h / 2 + 0.5 * u);
            var cw = c.measureText(ct).width; drawIcon(c, 'coin', right - cw - 8 * u, r0.y + r0.h / 2, 10 * u, q.enabled ? GOLD : '#a06a60', '#8a5a10'); right -= cw + 18 * u;
          }
          if (q.text) {
            c.font = hdFont('500', 10.5 * u * tb); c.textAlign = 'left'; c.fillStyle = 'rgba(239,226,196,0.62)';
            var tx = lx + lw2 + 9 * u, room = right - tx - 4 * u, t = q.text;
            while (t.length > 2 && c.measureText(t).width > room) t = t.slice(0, -2);
            if (t !== q.text) t = t.replace(/\s+\S*$/, '') + '…';
            if (room > 20 * u) c.fillText(t, tx, r0.y + r0.h / 2 + 0.5 * u);
          }
          c.restore();
        });
      }
      c.restore();
      drawnRects.push({ kind: 'panel', x: g.x, y: g.y + off, w: g.w, h: g.h });
    }
    function badgeRect(f, L) {
      var px = L.px, u = L.u, n = IDX[awayNode], lab = px ? (n.row + 1) + '/' + (M.floors + 1) : 'FLOOR ' + (n.row + 1) + ' / ' + (M.floors + 1) + '  ·  ' + labelOf(n.type).toUpperCase();
      var w = px ? 14 + pxW(lab) + 4 : 30 * u + textW(lab, 10.5 * u) + 10 * u, h = px ? 11 : 22 * u, m = px ? 3 : 8 * u, ui = uiList();
      var cands = [[f.x + f.w - m - w, f.y + m], [f.x + m, f.y + m], [f.x + f.w - m - w, f.y + f.h - m - h], [f.x + m, f.y + f.h - m - h]];
      for (var i = 0; i < cands.length; i++) {
        var r = { x: Math.round(cands[i][0]), y: Math.round(cands[i][1]), w: Math.round(w), h: Math.round(h) };
        if (!ui.some(function (q) { return hit(r, q); })) return { r: r, lab: lab, n: n };
      }
      return null;                              // every corner is HUD: no badge
    }
    function paintBadge(c, f, L) {
      if (!awayNode) return;
      var b = badgeRect(f, L); if (!b) return;
      var r = b.r, px = L.px, u = L.u, col = LOOK[b.n.type].col;
      if (px) {
        c.fillStyle = '#0b0d18'; c.fillRect(r.x, r.y, r.w, r.h); c.fillStyle = '#20283e'; c.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        var ic = pixelIcon(b.n.type, 9, col); if (ic) c.drawImage(ic, r.x + 2, r.y + 1);
        pxText(c, b.lab, r.x + 13, r.y + 2, PAPER);
      } else {
        c.save(); c.globalAlpha *= 0.94; rr(c, r.x, r.y, r.w, r.h, r.h / 2); c.fillStyle = 'rgba(12,15,26,0.88)'; c.fill(); c.strokeStyle = rgba(hexRgb(col), 0.6); c.lineWidth = 1 * u; c.stroke();
        c.fillStyle = '#121827'; c.beginPath(); c.arc(r.x + r.h / 2, r.y + r.h / 2, r.h / 2 - 2 * u, 0, 7); c.fill();
        drawIcon(c, b.n.type, r.x + r.h / 2, r.y + r.h / 2, r.h * 0.55, col);
        c.font = hdFont('700', 10.5 * u); c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = PAPER; c.fillText(b.lab, r.x + r.h + 4 * u, r.y + r.h / 2 + 0.5 * u);
        c.restore();
      }
      drawnRects.push({ kind: 'badge', x: r.x, y: r.y, w: r.w, h: r.h });
    }
    function draw(ctx, ox, oy) {
      drawnRects = [];
      if (!ctx) return;
      try {
        if (ctx.canvas) lastCanvas = { w: ctx.canvas.width, h: ctx.canvas.height };
        var f = field(); if (!f || !M) return;
        try { var bcr = ctx.canvas && ctx.canvas.getBoundingClientRect && ctx.canvas.getBoundingClientRect(), tf = ctx.getTransform ? ctx.getTransform() : null, sx = tf && tf.a > 0 ? tf.a : 1;
          if (bcr && bcr.width > 0) lastCss = bcr.width / (ctx.canvas.width / sx); } catch (e) { }
        var L = layout(f); lastL = L;
        ctx.save(); if (num(ox, 0) || num(oy, 0)) ctx.translate(num(ox, 0), num(oy, 0));
        ctx.imageSmoothingEnabled = !L.px;
        if (busy()) { paintMap(ctx, f, L); drawnSinceOpen = true; }
        else if (phase === 'away' && P.badge === 'on') paintBadge(ctx, f, L);
        ctx.restore();
      } catch (e) { try { ctx.restore(); } catch (x) { } warnOnce('draw', 'draw error: ' + (e && e.stack || e)); }
    }

    function serialize() { return { v: 1, seed: P.seed, floors: M ? M.floors : P.floors, at: at, route: route.slice(), cleared: Object.keys(cleared), usedEvents: usedEvents.slice(), away: awayNode, result: result }; }
    function restore(s) {
      try { if (typeof s === 'string') s = JSON.parse(s); } catch (e) { warnOnce('restore', 'restore(): not JSON'); return false; }
      if (!s || typeof s !== 'object' || s.v !== 1) return false;
      setParams({ seed: num(s.seed, P.seed) }); M = generate(P.seed, P); index();
      route = (s.route || []).filter(function (id) { return IDX[id]; }); at = s.at && IDX[s.at] ? s.at : route[route.length - 1] || null;
      cleared = {}; (s.cleared || []).forEach(function (id) { if (IDX[id]) cleared[id] = 1; }); usedEvents = (s.usedEvents || []).slice();
      panel = null; travel = null; pendingFinish = null; result = s.result || null;
      if (result) phase = 'done'; else if (s.away && IDX[s.away]) { awayNode = s.away; phase = 'away'; } else openMap();
      return true;
    }
    function reset() { phase = 'idle'; M = null; IDX = {}; at = null; route = []; cleared = {}; panel = null; travel = null; awayNode = null; pendingFinish = null; result = null; inbox = []; fade = 0; }
    function state() {
      var ch = choiceIds();
      return { phase: phase, busy: busy(), seed: P.seed, at: at, floor: M ? floorNow() : 0, floors: M ? M.floors + 1 : 0, route: route.slice(), choices: ch, selected: ch[sel] || null,
        selectedType: ch[sel] ? IDX[ch[sel]].type : null, travel: travel ? { from: travel.from, to: travel.to } : null, away: awayNode, cleared: Object.keys(cleared),
        panel: panel ? { node: panel.node, type: panel.type, title: panel.title, rows: panel.rows.map(function (q) { return q.label; }), cursor: panel.cursor, picked: panel.picked } : null,
        result: result, runs: runs, entered: entered, auto: autoOn(), drawn: drawnSinceOpen };
    }
    function layoutInfo() {
      if (!lastL || !M) return null;
      var L = lastL;
      return { px: L.px, sheet: L.sheet, area: L.area, r: L.r, rowH: L.rowH, scroll: scroll, nodes: M.nodes.map(function (n) { var p = xy(n, L); return { id: n.id, type: n.type, x: p.x, y: p.y, r: L.r * (n.type === 'boss' ? 1.6 : 1) }; }), panel: panelGeom(L) };
    }

    var api = {
      version: VERSION,
      start: start, open: function () { if (M && (phase === 'wait' || phase === 'idle')) { openMap(); return true; } return false; },
      finish: finish, busy: busy, away: function () { return phase === 'away' ? awayNode : null; }, phase: function () { return phase; },
      update: update, draw: draw, key: key, press: press, pointer: pointer, hitTest: hitTest,
      map: function () { return M; }, node: function (id) { return IDX[id] ? info(IDX[id]) : null; }, current: function () { return at ? info(IDX[at]) : null; },
      choices: function () { return choiceIds().map(function (id) { return info(IDX[id]); }); }, route: function () { return route.slice(); },
      recommend: function () { return choiceIds()[recommendIndex()] || null; }, state: state, layout: layoutInfo,
      lastDrawn: function () { return drawnRects.slice(); }, rect: function () { var s = drawnRects.filter(function (q) { return q.kind === 'sheet'; })[0]; return busy() && s ? { x: s.x, y: s.y, w: s.w, h: s.h } : null; },
      result: function () { return result; }, serialize: serialize, restore: restore, reset: reset,
      end: function () { panel = null; travel = null; phase = 'done'; }, setParams: function (p) { setParams(p); }, params: function () { return Object.assign({}, P); },
      auto: function (on) { o.autoplay = !!on; }
    };
    return api;
  }

  root.GameDNA_RunMap = { version: VERSION, create: create, generate: generate, crossings: crossings, grazes: grazes, audit: audit, defaults: Object.assign({}, DEFAULTS), types: TYPES.slice(),
    labels: (function () { var o = {}; TYPES.forEach(function (t) { o[t] = LOOK[t].label; }); return o; })() };
})(typeof window !== 'undefined' ? window : this);
