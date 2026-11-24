/* GameDNA G-07 \u00b7 Upgrade draft (pick 1 of 3) \u00b7 module v1 (plain script, no dependencies, one global: GameDNA_UpgradeDraft)
 *
 *   const draft = GameDNA_UpgradeDraft.create({
 *     view: { w: 640, h: 360 },                        // or bounds: { x, y, w, h }; the cards are laid out inside it
 *     upgrades: UPGRADES,                              // the designer's table (see README): id, name, rarity, tags, text, value, max, delta / apply
 *     params: { seed: 1, choices: 3, rerolls: 1, skip: 'on' },       // see DEFAULTS
 *     applyDelta: (stat, amount, upgrade) => { hero[stat] += amount; },   // optional: the ONLY way declarative deltas reach the game
 *     getStat: stat => hero[stat],                     // optional: card preview "ATK 6 -> 8" and read-back check
 *     target: () => hero,                              // optional: the object passed to an upgrade's own apply(target, info)
 *     onPick: (upgrade, info) => {},                   // synchronous, inside update(), at the moment the player confirms
 *     autoplay: () => AUTOPLAY,                        // the draft picks a deterministic default by itself; presses are ignored
 *     uiRects: () => [hudRect]                         // optional: rects the cards and the strip never cover
 *   });
 *   draft.open({ title: 'LEVEL UP', onDone: r => {} })   // pauses the world: deal 3 cards; queued if one is already open
 *   draft.busy()                // true from open() until the picked card has landed and the overlay faded: pause the world
 *   draft.key(code, down) / draft.press('left' | 'right' | 'confirm' | 'reroll' | 'skip') / draft.pointer(x, y, down)
 *   draft.update(dtMs)          // the only clock (fixed step), so ?t=&freeze=1 is deterministic
 *   draft.draw(ctx)             // native-resolution 2D context, last in the draw pass
 *   draft.serialize() / draft.restore(obj)   // owned stacks and the draw counter as plain JSON
 *
 * The module never changes the game itself: picks reach it through applyDelta (declarative deltas), the upgrade's own
 * apply(target) (designer code) and onPick. Draws are seeded per (seed, draft number, reroll), with rarity weights,
 * no duplicates in a hand and nothing past its max stacks.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var DEFAULTS = { seed: 1, choices: 3, rerolls: 1, skip: 'on', wCommon: 60, wRare: 30, wEpic: 10, maxStacks: 5, look: 'auto', dim: 0.55,
    dealMs: 380, stagger: 90, flipMs: 260, autoMs: 1100, autoPick: 'rarest', strip: 'draft', tilt: 5, synergy: 'on', reduced: 'off',
    armMs: 180, openMs: 240, title: 'LEVEL UP', subtitle: '', skipLabel: 'Skip', pixelBelow: 300 };
  var KEYS = { ArrowLeft: 'left', KeyA: 'left', a: 'left', A: 'left', ArrowRight: 'right', KeyD: 'right', d: 'right', D: 'right',
    KeyZ: 'confirm', z: 'confirm', Z: 'confirm', Space: 'confirm', ' ': 'confirm', Enter: 'confirm', NumpadEnter: 'confirm',
    KeyR: 'reroll', r: 'reroll', R: 'reroll', KeyX: 'skip', x: 'skip', X: 'skip', Escape: 'skip', Backspace: 'skip' };
  var RAR = ['common', 'rare', 'epic'];
  var RARITY = {
    common: { rank: 0, label: 'COMMON', edge: '#c3cad8', top: '#384055', bot: '#1c2131', glow: '214,224,245', chip: '#9aa4b8', medal: '#4a5470',
      px: { edge: '#b8c0d0', band: '#8890a8', body: '#2a3046', body2: '#20253a', ink: '#141626' } },
    rare: { rank: 1, label: 'RARE', edge: '#6cc0ff', top: '#1f4277', bot: '#121f3e', glow: '92,176,255', chip: '#4ea6f5', medal: '#20508e',
      px: { edge: '#78c8ff', band: '#3c8ce0', body: '#1e3462', body2: '#16264c', ink: '#0a1430' } },
    epic: { rank: 2, label: 'EPIC', edge: '#d79bff', top: '#4f2475', bot: '#22103a', glow: '200,128,255', chip: '#b56cf0', medal: '#5e2a8e',
      px: { edge: '#e0a8ff', band: '#a058e0', body: '#3e2060', body2: '#2e1648', ink: '#1a0a2c' } }
  };
  var TAGS = {
    blade: ['#dfe6f0', 'Blade'], fire: ['#ff8f3f', 'Fire'], frost: ['#8fe6ff', 'Frost'], storm: ['#ffe45c', 'Storm'], guard: ['#8fb6ff', 'Guard'],
    heart: ['#ff5f78', 'Vigor'], speed: ['#7ef0b4', 'Speed'], gold: ['#ffd04a', 'Gold'], magic: ['#c890ff', 'Arcane'], luck: ['#74e07e', 'Luck'],
    poison: ['#b2e858', 'Venom'], light: ['#fff0a0', 'Light'], crit: ['#ff6a5a', 'Critical'], arrow: ['#e8c890', 'Ranged'], regen: ['#82e08e', 'Growth']
  };
  var INK = '#0b0d18', GOLD = '#ffd66b', FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

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
  var XICON = { feather: ['#ff9a4a', 'Feather'], eye: ['#9fe0ff', 'Eye'], ring: ['#ffd86a', 'Ring'], moon: ['#dcd4ff', 'Moon'], gem: ['#9ff0e0', 'Gem'] };   // icon-only names for an entry's icon field
  function tagInfo(t) { var T = TAGS[t] || XICON[t]; if (T) return { color: T[0], label: T[1], icon: t }; var h = hashStr(t) % 360; return { color: 'hsl(' + h + ',70%,68%)', label: String(t).charAt(0).toUpperCase() + String(t).slice(1), icon: 'gem' }; }

  /* ---------- tag icons: vector paths in a -1..1 box (HD), thresholded to crisp pixels at low resolution ---------- */
  function poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); }
  function F(ctx, P) { if (P.ink) { ctx.lineWidth = 0.17; ctx.lineJoin = 'round'; ctx.stroke(); } else ctx.fill(); }
  function S(ctx, P, lw) { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = lw + (P.ink ? 0.17 : 0); ctx.stroke(); }
  var ICON = {
    blade: function (c, P) { c.save(); c.rotate(Math.PI / 4); poly(c, [0, -1.02, 0.15, -0.82, 0.15, 0.3, -0.15, 0.3, -0.15, -0.82]); F(c, P);
      c.beginPath(); c.rect(-0.46, 0.28, 0.92, 0.16); F(c, P); c.beginPath(); c.rect(-0.08, 0.44, 0.16, 0.36); F(c, P); c.beginPath(); c.arc(0, 0.88, 0.13, 0, 7); F(c, P); c.restore(); },
    fire: function (c, P) { c.beginPath(); c.moveTo(0.04, -1); c.bezierCurveTo(0.22, -0.6, 0.74, -0.36, 0.7, 0.22); c.bezierCurveTo(0.67, 0.72, 0.32, 0.96, 0, 0.96);
      c.bezierCurveTo(-0.4, 0.96, -0.72, 0.7, -0.7, 0.26); c.bezierCurveTo(-0.68, -0.1, -0.44, -0.26, -0.32, -0.56); c.bezierCurveTo(-0.16, -0.3, -0.1, -0.22, -0.04, -0.16);
      c.bezierCurveTo(0.06, -0.46, 0.06, -0.72, 0.04, -1); c.closePath(); F(c, P);
      if (!P.ink && P.hi) { c.save(); c.fillStyle = 'rgba(255,240,180,0.85)'; c.beginPath(); c.moveTo(0, 0.86); c.bezierCurveTo(-0.3, 0.86, -0.36, 0.5, -0.12, 0.2); c.bezierCurveTo(-0.02, 0.42, 0.1, 0.38, 0.14, 0.18); c.bezierCurveTo(0.36, 0.48, 0.3, 0.86, 0, 0.86); c.fill(); c.restore(); } },
    frost: function (c, P) { c.beginPath(); for (var k = 0; k < 3; k++) { var a = k * Math.PI / 3 + Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a); c.moveTo(-ca * 0.92, -sa * 0.92); c.lineTo(ca * 0.92, sa * 0.92);
      for (var sgn = -1; sgn <= 1; sgn += 2) { var bx = ca * 0.56 * sgn, by = sa * 0.56 * sgn, b1 = a + (sgn > 0 ? Math.PI : 0) + 0.7, b2 = a + (sgn > 0 ? Math.PI : 0) - 0.7;
        c.moveTo(bx + Math.cos(b1) * 0.3, by + Math.sin(b1) * 0.3); c.lineTo(bx, by); c.lineTo(bx + Math.cos(b2) * 0.3, by + Math.sin(b2) * 0.3); } } S(c, P, 0.17); },
    storm: function (c, P) { poly(c, [0.24, -1, -0.56, 0.12, -0.04, 0.12, -0.26, 1, 0.6, -0.2, 0.06, -0.2, 0.34, -1]); F(c, P); },
    guard: function (c, P) { c.beginPath(); c.moveTo(0, -0.96); c.lineTo(0.78, -0.66); c.lineTo(0.72, 0.06); c.quadraticCurveTo(0.62, 0.64, 0, 0.98); c.quadraticCurveTo(-0.62, 0.64, -0.72, 0.06); c.lineTo(-0.78, -0.66); c.closePath(); F(c, P);
      if (!P.ink && P.hi) { c.save(); c.fillStyle = 'rgba(255,255,255,0.28)'; c.beginPath(); c.moveTo(0, -0.8); c.lineTo(0, 0.8); c.quadraticCurveTo(-0.5, 0.52, -0.58, 0.04); c.lineTo(-0.62, -0.56); c.closePath(); c.fill(); c.restore(); } },
    heart: function (c, P) { c.beginPath(); c.moveTo(0, 0.92); c.bezierCurveTo(-0.16, 0.76, -0.98, 0.26, -0.98, -0.24); c.bezierCurveTo(-0.98, -0.72, -0.46, -0.98, 0, -0.5); c.bezierCurveTo(0.46, -0.98, 0.98, -0.72, 0.98, -0.24); c.bezierCurveTo(0.98, 0.26, 0.16, 0.76, 0, 0.92); c.closePath(); F(c, P); },
    speed: function (c, P) { [-0.42, 0.22].forEach(function (x) { poly(c, [x, -0.82, x + 0.6, 0, x, 0.82, x - 0.32, 0.82, x + 0.26, 0, x - 0.32, -0.82]); F(c, P); }); },
    gold: function (c, P) { c.beginPath(); c.arc(0, 0, 0.88, 0, 7); F(c, P); if (!P.ink) { c.save(); c.strokeStyle = 'rgba(90,50,0,0.45)'; c.lineWidth = 0.12; c.beginPath(); c.arc(0, 0, 0.6, 0, 7); c.stroke(); c.fillStyle = 'rgba(90,50,0,0.45)'; poly(c, [0, -0.36, 0.22, 0, 0, 0.36, -0.22, 0]); c.fill(); c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc(-0.42, -0.42, 0.13, 0, 7); c.fill(); c.restore(); } },
    magic: function (c, P) { c.beginPath(); for (var k = 0; k < 8; k++) { var r = k % 2 ? 0.27 : 0.98, a = k * Math.PI / 4 - Math.PI / 2; if (k) c.lineTo(Math.cos(a) * r, Math.sin(a) * r); else c.moveTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); F(c, P);
      c.beginPath(); c.arc(0.66, 0.62, 0.15, 0, 7); F(c, P); },
    luck: function (c, P) { c.save(); c.rotate(Math.PI / 4); [[0, -0.44], [0.44, 0], [0, 0.44], [-0.44, 0]].forEach(function (p) { c.beginPath(); c.arc(p[0] * 0.92, p[1] * 0.92, 0.38, 0, 7); F(c, P); }); c.restore();
      c.beginPath(); c.moveTo(0.1, 0.2); c.quadraticCurveTo(0.3, 0.6, 0.62, 0.94); S(c, P, 0.14); },
    poison: function (c, P) { c.beginPath(); c.moveTo(-0.08, -0.98); c.bezierCurveTo(0.26, -0.48, 0.62, -0.1, 0.62, 0.32); c.bezierCurveTo(0.62, 0.74, 0.28, 0.96, -0.08, 0.96); c.bezierCurveTo(-0.44, 0.96, -0.78, 0.74, -0.78, 0.32); c.bezierCurveTo(-0.78, -0.1, -0.42, -0.48, -0.08, -0.98); c.closePath(); F(c, P);
      c.beginPath(); c.arc(0.66, -0.62, 0.2, 0, 7); F(c, P); },
    light: function (c, P) { c.beginPath(); c.arc(0, 0, 0.46, 0, 7); F(c, P); for (var k = 0; k < 8; k++) { var a = k * Math.PI / 4; poly(c, [Math.cos(a - 0.17) * 0.62, Math.sin(a - 0.17) * 0.62, Math.cos(a) * 0.99, Math.sin(a) * 0.99, Math.cos(a + 0.17) * 0.62, Math.sin(a + 0.17) * 0.62]); F(c, P); } },
    crit: function (c, P) { c.beginPath(); c.arc(0, 0, 0.6, 0, 7); S(c, P, 0.17); c.beginPath(); [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) { c.moveTo(d[0] * 0.98, d[1] * 0.98); c.lineTo(d[0] * 0.3, d[1] * 0.3); }); S(c, P, 0.15); c.beginPath(); c.arc(0, 0, 0.14, 0, 7); F(c, P); },
    arrow: function (c, P) { c.save(); c.rotate(-Math.PI / 4); c.beginPath(); c.moveTo(-0.9, 0); c.lineTo(0.5, 0); S(c, P, 0.13); poly(c, [1, 0, 0.42, -0.3, 0.52, 0, 0.42, 0.3]); F(c, P);
      poly(c, [-0.98, -0.3, -0.62, -0.3, -0.48, 0, -0.84, 0]); F(c, P); poly(c, [-0.98, 0.3, -0.62, 0.3, -0.48, 0, -0.84, 0]); F(c, P); c.restore(); },
    regen: function (c, P) { c.beginPath(); c.moveTo(-0.78, 0.78); c.bezierCurveTo(-0.84, -0.22, -0.1, -0.88, 0.88, -0.88); c.bezierCurveTo(0.88, 0.12, 0.2, 0.84, -0.78, 0.78); c.closePath(); F(c, P);
      if (!P.ink) { c.save(); c.strokeStyle = 'rgba(10,40,20,0.5)'; c.lineWidth = 0.09; c.beginPath(); c.moveTo(-0.62, 0.62); c.quadraticCurveTo(0.1, 0.1, 0.62, -0.62); c.stroke(); c.restore(); } },
    feather: function (c, P) { c.save(); c.rotate(Math.PI / 5); c.beginPath(); c.moveTo(0, -1); c.bezierCurveTo(0.55, -0.6, 0.5, 0.2, 0.08, 0.62); c.lineTo(-0.08, 0.62); c.bezierCurveTo(-0.5, 0.2, -0.55, -0.6, 0, -1); c.closePath(); F(c, P);
      c.beginPath(); c.moveTo(0, -0.7); c.lineTo(0, 1); S(c, P, 0.1); if (!P.ink) { c.strokeStyle = 'rgba(60,20,0,0.45)'; c.lineWidth = 0.07; c.beginPath(); for (var k = 0; k < 4; k++) { var y = -0.5 + k * 0.28; c.moveTo(0, y); c.lineTo(0.32 - k * 0.04, y - 0.16); c.moveTo(0, y); c.lineTo(-0.32 + k * 0.04, y - 0.16); } c.stroke(); } c.restore(); },
    eye: function (c, P) { c.beginPath(); c.moveTo(-1, 0); c.quadraticCurveTo(0, -0.95, 1, 0); c.quadraticCurveTo(0, 0.95, -1, 0); c.closePath(); F(c, P);
      if (!P.ink) { c.save(); c.fillStyle = 'rgba(10,12,30,0.85)'; c.beginPath(); c.arc(0, 0, 0.34, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(-0.1, -0.12, 0.1, 0, 7); c.fill(); c.restore(); } },
    ring: function (c, P) { c.beginPath(); c.arc(0, 0.22, 0.62, 0, 7); S(c, P, 0.22); poly(c, [0, -1, 0.34, -0.62, 0, -0.3, -0.34, -0.62]); F(c, P); },
    moon: function (c, P) { c.beginPath(); c.arc(0, 0, 0.9, Math.PI * 0.32, Math.PI * 1.68, false); c.arc(0.42, -0.08, 0.66, Math.PI * 1.55, Math.PI * 0.45, true); c.closePath(); F(c, P); },
    gem: function (c, P) { poly(c, [0, -0.96, 0.8, -0.2, 0, 0.96, -0.8, -0.2]); F(c, P); }
  };
  function drawIcon(ctx, name, x, y, size, color, hi) {      // HD: ink outline pass, then colour
    var fn = ICON[name] || ICON.gem, s = size / 2;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = INK; ctx.fillStyle = INK; fn(ctx, { ink: true });
    ctx.strokeStyle = color; ctx.fillStyle = color; fn(ctx, { ink: false, hi: hi });
    ctx.restore();
  }
  var PXI = {};
  function pixelIcon(name, size, color) {                     // crisp: threshold alpha, 1 px ink outline, lower-right shade
    var key = name + '|' + size + '|' + color; if (PXI[key] !== undefined) return PXI[key];
    var pad = 1, c = mkCanvas(size + pad * 2, size + pad * 2); if (!c) return (PXI[key] = null);
    var x = c.getContext('2d'), fn = ICON[name] || ICON.gem;
    x.save(); x.translate(pad + size / 2, pad + size / 2); x.scale(size / 2.05, size / 2.05); x.fillStyle = '#fff'; x.strokeStyle = '#fff'; fn(x, { ink: false, hi: false }); x.restore();
    var W = c.width, H = c.height, id = x.getImageData(0, 0, W, H), d = id.data, on = new Uint8Array(W * H), i, p;
    for (i = 0; i < W * H; i++) on[i] = d[i * 4 + 3] >= 100 ? 1 : 0;
    var base = hexRgb(color).split(',').map(Number), dark = base.map(function (v) { return Math.round(v * 0.62); }), ink = hexRgb(INK).split(',').map(Number);
    for (var yy = 0; yy < H; yy++) for (var xx = 0; xx < W; xx++) {
      i = yy * W + xx; p = i * 4; var col = null;
      if (on[i]) col = (xx + 1 < W && yy + 1 < H && (!on[i + 1] || !on[i + W])) ? dark : base;
      else if ((xx > 0 && on[i - 1]) || (xx + 1 < W && on[i + 1]) || (yy > 0 && on[i - W]) || (yy + 1 < H && on[i + W])) col = ink;
      if (col) { d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255; } else d[p + 3] = 0;
    }
    x.putImageData(id, 0, 0);
    return (PXI[key] = c);
  }

  /* ---------- pixel font ---------- */
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

  /* ---------- the pure draw (also used by the judge probe and tests) ---------- */
  function normalize(list, P, warn) {
    var out = [], seen = {};
    (Array.isArray(list) ? list : []).forEach(function (u, i) {
      if (!u || typeof u !== 'object') return;
      var id = u.id != null ? String(u.id) : 'u' + i;
      if (seen[id]) { warn('dup:' + id, 'upgrade id "' + id + '" appears twice in the table; the second one is ignored'); return; }
      seen[id] = 1;
      var r = RAR.indexOf(u.rarity) >= 0 ? u.rarity : 'common';
      if (u.rarity != null && r !== u.rarity) warn('rar:' + id, 'upgrade "' + id + '" has rarity "' + u.rarity + '"; use common, rare or epic (treated as common)');
      var tags = Array.isArray(u.tags) ? u.tags.map(String).slice(0, 4) : u.tags ? [String(u.tags)] : [];
      var max = u.max == null ? P.maxStacks : Math.round(num(u.max, P.maxStacks)); if (max < 1) max = 1;
      out.push({ id: id, name: String(u.name != null ? u.name : id), rarity: r, tags: tags, icon: u.icon ? String(u.icon) : (tags[0] || 'gem'),
        text: String(u.text != null ? u.text : ''), value: u.value, max: max, weight: Math.max(0, num(u.weight, 1)), delta: u.delta && typeof u.delta === 'object' ? u.delta : null,
        apply: typeof u.apply === 'function' ? u.apply : null, requires: Array.isArray(u.requires) ? u.requires.map(String) : u.requires ? [String(u.requires)] : [], src: u });
    });
    return out;
  }
  function perStack(v, k) { return Array.isArray(v) ? v[Math.min(k, v.length - 1)] : v; }
  function deal(table, owned, seed, drawNo, reroll, n, weights, fallback) {
    var rnd = mulberry(hashStr('gdna-g07|' + seed + '|' + drawNo + '|' + reroll));
    var pool = table.filter(function (u) { return (owned[u.id] || 0) < u.max && u.requires.every(function (q) { return (owned[q] || 0) > 0; }); });
    var hand = [];
    for (var k = 0; k < n; k++) {
      var avail = pool.filter(function (u) { return hand.indexOf(u) < 0 && u.weight > 0; });
      if (!avail.length) break;
      var present = RAR.filter(function (r) { return avail.some(function (u) { return u.rarity === r; }); });
      var tot = 0; present.forEach(function (r) { tot += Math.max(0, weights[r] || 0); });
      var rr = rnd(), pick = present[present.length - 1];
      if (tot <= 0) pick = present[Math.floor(rr * present.length)];
      else { var acc = 0; for (var j = 0; j < present.length; j++) { acc += Math.max(0, weights[present[j]] || 0) / tot; if (rr < acc) { pick = present[j]; break; } } }
      var cand = avail.filter(function (u) { return u.rarity === pick; }), wt = 0; cand.forEach(function (u) { wt += u.weight; });
      var r2 = rnd() * wt, chosen = cand[cand.length - 1];
      for (var m = 0; m < cand.length; m++) { r2 -= cand[m].weight; if (r2 < 0) { chosen = cand[m]; break; } }
      hand.push(chosen);
    }
    if (!hand.length && fallback) hand.push(fallback);
    return hand;
  }

  function create(o) {
    o = o || {};
    var API = root.GameDNA_Skin || null, SK = null;
    if (o.skin !== false) { try { SK = API && API.resolve ? API.resolve(o.skin) : null; } catch (e) { SK = null; } }
    var P = {}, warned = {}, lastCanvas = null, clock = 0;
    var owned = {}, order = [], draws = 0, opens = 0, queue = [], W = null, last = null, drawnRects = [], held = {}, inbox = [];
    var TABLE = [], FALLBACK = null, stripPos = null, stripKey = '', stripPop = {};
    setParams(o.params || {});
    setTable(o.upgrades || o.table);

    function dbg(e) { if (typeof o.debug === 'function') { try { o.debug(e); } catch (x) { } } }
    function warnOnce(key, msg) { if (warned[key]) return; warned[key] = 1; try { if (root.console) console.warn('GameDNA_UpgradeDraft: ' + msg); } catch (e) { } }
    function call(fn, a, b, c) { if (typeof fn === 'function') { try { return fn(a, b, c); } catch (x) { warnOnce('cb' + String(x).slice(0, 40), 'a host callback threw: ' + x); } } return undefined; }
    function setParams(p) {
      p = p || {};
      for (var k in p) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && p[k] != null && p[k] !== '') P[k] = p[k];
      for (k in DEFAULTS) if (P[k] == null) P[k] = DEFAULTS[k];
      for (k in DEFAULTS) if (typeof DEFAULTS[k] === 'number') P[k] = num(P[k], DEFAULTS[k]);
      P.choices = clamp(Math.round(P.choices), 1, 5); P.rerolls = clamp(Math.round(P.rerolls), 0, 99); P.maxStacks = clamp(Math.round(P.maxStacks), 1, 99);
      P.dim = clamp(P.dim, 0, 0.9); P.dealMs = clamp(P.dealMs, 0, 3000); P.stagger = clamp(P.stagger, 0, 1000); P.flipMs = clamp(P.flipMs, 0, 3000);
      P.autoMs = clamp(P.autoMs, 0, 20000); P.tilt = clamp(P.tilt, 0, 20); P.armMs = clamp(P.armMs, 0, 2000); P.openMs = clamp(P.openMs, 0, 2000);
      ['wCommon', 'wRare', 'wEpic'].forEach(function (q) { P[q] = Math.max(0, P[q]); });
      if (P.skip !== 'off') P.skip = 'on';
      if (['rarest', 'first', 'synergy', 'skip'].indexOf(P.autoPick) < 0) P.autoPick = 'rarest';
      if (['draft', 'always', 'off'].indexOf(P.strip) < 0) P.strip = 'draft';
      if (['auto', 'hd', 'pixel'].indexOf(P.look) < 0) P.look = 'auto';
      P.synergy = P.synergy === 'off' ? 'off' : 'on'; P.reduced = P.reduced === 'on' ? 'on' : 'off';
      stripKey = '';
    }
    function setTable(list) {
      TABLE = normalize(list, P, warnOnce);
      if (!TABLE.length) warnOnce('empty', 'the upgrade table is empty: give create() an upgrades array');
      FALLBACK = o.fallback ? normalize([o.fallback], P, warnOnce)[0] || null : null;
      if (FALLBACK) FALLBACK.max = 1e9;
    }
    function byId(id) { id = String(id); for (var i = 0; i < TABLE.length; i++) if (TABLE[i].id === id) return TABLE[i]; return FALLBACK && FALLBACK.id === id ? FALLBACK : null; }
    function weights() { return { common: P.wCommon, rare: P.wRare, epic: P.wEpic }; }
    function timeK() { return P.reduced === 'on' ? 0.4 : 1; }

    /* ---------- game-facing values ---------- */
    function stat(key) { if (typeof o.getStat !== 'function') return null; var v = +call(o.getStat, key); return isFinite(v) ? v : null; }
    function label(key) { var L = o.statLabels && o.statLabels[key]; return String(L != null ? L : key).toUpperCase().slice(0, 6); }
    function valueOf(u, k) { var v = perStack(u.value, k); if (v == null && u.delta) { for (var q in u.delta) { v = perStack(u.delta[q], k); break; } } return v; }
    function textOf(u, k) {
      var v = valueOf(u, k), tot = 0; for (var j = 0; j <= k; j++) { var vj = num(valueOf(u, j), NaN); if (isFinite(vj)) tot += vj; }
      return u.text.replace(/\{value\}/g, v == null ? '' : '\u0001' + fmt(v) + '\u0002').replace(/\{total\}/g, '\u0001' + fmt(tot) + '\u0002').replace(/\{stacks\}/g, String(k + 1)).replace(/\{max\}/g, String(u.max));
    }
    function synergyOf(u) {
      if (P.synergy === 'off' || !u.tags.length) return { count: 0, tags: [] };
      var n = 0, tags = [];
      order.forEach(function (id) { if (id === u.id) return; var v = byId(id); if (!v) return; var share = v.tags.filter(function (t) { return u.tags.indexOf(t) >= 0; }); if (share.length) { n++; share.forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); }); } });
      return { count: n, tags: tags };
    }
    function cardOf(u, i) {
      var k = owned[u.id] || 0, prev = [];
      if (u.delta && typeof o.getStat === 'function') for (var key in u.delta) { if (prev.length >= 2) break; var a = num(perStack(u.delta[key], k), NaN), b = stat(key); if (isFinite(a) && b != null) prev.push({ key: key, label: label(key), from: b, to: b + a }); }
      return { u: u, id: u.id, i: i, stacks: k, desc: textOf(u, k), syn: synergyOf(u), prev: prev, lift: 0, focus: 0 };
    }
    function recommend(cards) {
      if (!cards.length) return -1;
      var best = 0;
      var score = function (c) { var r = RARITY[c.u.rarity].rank; return P.autoPick === 'synergy' ? c.syn.count * 10 + r : r * 10 + c.syn.count; };
      if (P.autoPick === 'first') return 0;
      for (var i = 1; i < cards.length; i++) if (score(cards[i]) > score(cards[best])) best = i;
      return best;
    }

    /* ---------- the draft ---------- */
    function open(opts) {
      opts = opts || {};
      if (W) { queue.push(opts); dbg({ event: 'queued', pending: queue.length }); return true; }
      return start(opts);
    }
    function start(opts) {
      var n = clamp(Math.round(num(opts.choices, P.choices)), 1, 5), hand;
      var drawNo = draws++;
      if (Array.isArray(opts.hand)) hand = opts.hand.map(byId).filter(function (u, i, a) { return u && a.indexOf(u) === i && (owned[u.id] || 0) < u.max; }).slice(0, 5);
      else hand = deal(TABLE, owned, P.seed, drawNo, 0, n, weights(), FALLBACK);
      if (!hand.length) { warnOnce('nopool', 'nothing left to offer (every upgrade is at its max stacks): add a fallback upgrade or more entries'); dbg({ event: 'empty', draw: drawNo }); call(opts.onDone, { picked: null, empty: true, skipped: true, draw: drawNo }); return false; }
      var auto = opts.auto != null ? !!opts.auto : typeof o.autoplay === 'function' ? !!call(o.autoplay) : !!o.autoplay;
      opens++;
      W = { id: opens, opts: opts, drawNo: drawNo, reroll: 0, rerollsLeft: Math.max(0, Math.round(num(opts.rerolls, P.rerolls))), skip: (opts.skip != null ? opts.skip !== 'off' && opts.skip !== false : P.skip === 'on'),
        title: String(opts.title != null ? opts.title : P.title), subtitle: opts.subtitle != null ? String(opts.subtitle) : P.subtitle, auto: auto,
        t: 0, stage: 'deal', handT: P.openMs * 0.55 * timeK(), cards: hand.map(cardOf), cursor: 0, readyT: -1, pickT: -1, picked: null, out: null, slot: -1,
        endT: -1, drawn: false, hands: [hand.map(function (u) { return u.id; })], flash: 0 };
      W.cursor = Math.floor((W.cards.length - 1) / 2);
      W.autoPickI = recommend(W.cards);
      dbg({ event: 'open', id: W.id, draw: drawNo, hand: W.hands[0].slice(), auto: auto, owned: Object.assign({}, owned), seed: P.seed, fixed: Array.isArray(opts.hand) });
      call(o.onSfx, 'open');
      return true;
    }
    function dealEnd(cnt) { var k = timeK(); return W.handT + ((cnt - 1) * P.stagger + P.dealMs * 0.8 + P.flipMs) * k + 40; }
    function act(a) {
      if (!W) return;
      var n = W.cards.length;
      if (W.stage === 'deal') {
        if (a === 'left' || a === 'right') { W.cursor = (W.cursor + (a === 'left' ? n - 1 : 1)) % n; return; }
        if (a === 'confirm') { W.handT = W.t - ((n - 1) * P.stagger + P.dealMs * 0.8 + P.flipMs) * timeK() - 40; W.stage = 'choose'; W.readyT = W.t; dbg({ event: 'fast', id: W.id }); }
        return;
      }
      if (W.stage !== 'choose') return;
      if (a === 'left' || a === 'right') { W.cursor = (W.cursor + (a === 'left' ? n - 1 : 1)) % n; call(o.onSfx, 'move'); return; }
      if (a === 'confirm') { if (W.t - W.readyT < P.armMs) return; pick(W.cursor, false); return; }
      if (a === 'reroll') { if (W.rerollsLeft > 0) reroll(); return; }
      if (a === 'skip') { if (W.skip) skip(false); }
    }
    function pick(i, auto) {
      var c = W.cards[i]; if (!c) return;
      var u = c.u, k = owned[u.id] || 0;
      W.stage = 'pick'; W.pickT = W.t; W.cursor = i; W.picked = c;
      owned[u.id] = k + 1; if (order.indexOf(u.id) < 0) order.push(u.id);
      W.slot = order.indexOf(u.id);
      var info = { id: u.id, stacks: k + 1, value: valueOf(u, k), text: plain(c.desc), rarity: u.rarity, tags: u.tags.slice(), hand: W.cards.map(function (x) { return x.id; }),
        draw: W.drawNo, reroll: W.reroll, auto: !!auto, synergy: c.syn.count, deltas: {} };
      if (u.delta) for (var key in u.delta) {
        var amt = num(perStack(u.delta[key], k), NaN); if (!isFinite(amt)) continue;
        info.deltas[key] = amt;
        if (typeof o.applyDelta === 'function') {
          var before = stat(key); call(o.applyDelta, key, amt, u.src);
          var after = stat(key);
          dbg({ event: 'delta', id: u.id, key: key, amount: amt, before: before, after: after });
          if (before != null && after != null && Math.abs(after - (before + amt)) > 1e-6) { warnOnce('rb:' + key, 'after applyDelta("' + key + '", ' + amt + ') getStat returned ' + after + ' (expected ' + (before + amt) + '): applyDelta writes where the game does not read, or getStat reads a copy'); dbg({ event: 'mismatch', id: u.id, key: key, want: before + amt, got: after }); }
        } else warnOnce('nodelta', 'upgrade "' + u.id + '" has a delta but create() got no applyDelta: the delta is passed to onPick (info.deltas) only');
      }
      if (u.apply) { var tg = typeof o.target === 'function' ? call(o.target) : o.target; try { u.apply(tg, info); } catch (x) { warnOnce('apply:' + u.id, 'upgrade "' + u.id + '" apply() threw: ' + x); } }
      var d = W; d.info = info;
      dbg({ event: 'pick', id: d.id, upgrade: u.id, stacks: k + 1, max: u.max, rarity: u.rarity, deltas: info.deltas, auto: !!auto, hand: info.hand });
      call(o.onPick, u.src, info);
      call(d.opts.onPick, u.src, info);
      call(o.onSfx, 'pick');
    }
    function reroll() {
      W.rerollsLeft--; W.reroll++; W.stage = 'reroll'; W.rrT = W.t;
      W.nextHand = deal(TABLE, owned, P.seed, W.drawNo, W.reroll, W.cards.length || P.choices, weights(), FALLBACK);
      W.hands.push(W.nextHand.map(function (u) { return u.id; }));
      dbg({ event: 'reroll', id: W.id, draw: W.drawNo, reroll: W.reroll, hand: W.hands[W.hands.length - 1].slice(), left: W.rerollsLeft });
      call(o.onSfx, 'reroll');
    }
    function skip(auto) { W.stage = 'skip'; W.skipT = W.t; dbg({ event: 'skip', id: W.id, auto: !!auto }); call(o.onSfx, 'skip'); }
    function finish(how) {
      var d = W, res = { picked: d.picked ? d.picked.u.src : null, id: d.picked ? d.picked.id : null, stacks: d.picked ? owned[d.picked.id] : 0, skipped: !d.picked, ended: how === 'end',
        info: d.info || null, rerolls: d.reroll, hands: d.hands, draw: d.drawNo, auto: d.auto };
      W = null; last = res;
      dbg({ event: 'done', id: d.id, picked: res.id, skipped: res.skipped, drawn: d.drawn });
      call(d.opts.onDone, res); call(o.onDone, res);
      if (!W && queue.length) start(queue.shift());
    }
    var PICK_PULSE = 170, PICK_SHRINK = 200, FLY = 420, LAND = 220, CLOSE = 230, DROP = 300;
    function update(dt) {
      try {
        dt = num(dt, 0); if (dt < 0) dt = 0; if (dt > 100) dt = 100;
        clock += dt;
        for (var sp in stripPop) { stripPop[sp] -= dt; if (stripPop[sp] <= 0) delete stripPop[sp]; }
        if (!W) { inbox = []; return; }
        var d = W; d.t += dt;
        var acts = inbox; inbox = [];
        if (!d.auto) for (var i = 0; i < acts.length; i++) act(acts[i]);
        if (W !== d) return;
        var k = timeK();
        if (d.stage === 'deal' && d.t >= dealEnd(d.cards.length)) { d.stage = 'choose'; d.readyT = d.t; call(o.onSfx, 'ready'); }
        if (d.stage === 'choose' && d.auto) {
          var since = d.t - d.readyT;
          if (P.autoPick === 'skip' && d.skip) { if (since >= P.autoMs) skip(true); }
          else {
            if (since >= P.autoMs * 0.45 && d.cursor !== d.autoPickI) d.cursor = d.autoPickI;
            if (since >= P.autoMs) pick(d.autoPickI, true);
          }
        }
        if (d.stage === 'reroll' && d.t - d.rrT >= (DROP + 60) * k) {
          d.cards = d.nextHand.map(cardOf); d.nextHand = null; d.handT = d.t; d.stage = 'deal';
          d.cursor = Math.min(d.cursor, d.cards.length - 1); d.autoPickI = recommend(d.cards);
        }
        if (d.stage === 'pick' && d.t - d.pickT >= (PICK_PULSE + PICK_SHRINK + FLY + LAND) * k) { d.stage = 'close'; d.endT = d.t; stripPop[d.picked.id] = 260; call(o.onSfx, 'land'); }
        if (d.stage === 'skip' && d.t - d.skipT >= DROP * k) { d.stage = 'close'; d.endT = d.t; }
        if (d.stage === 'close' && d.t - d.endT >= CLOSE * k) finish('close');
        var kk = 1 - Math.exp(-dt / 70);
        if (W) W.cards.forEach(function (c, j) { var tgt = (W.stage === 'choose' || W.stage === 'deal') && j === W.cursor ? 1 : 0; c.lift += (tgt - c.lift) * kk; c.focus += (tgt - c.focus) * kk; });
      } catch (e) { warnOnce('upd', 'update error: ' + e); }
    }
    function press(a) { if (!W) return false; if (W.auto) return true; inbox.push(a == null || a === true ? 'confirm' : String(a)); return true; }
    function key(code, down) {
      var a = KEYS[code]; if (!a || !W) { if (a) held[code] = !!down; return false; }
      if (a === 'skip' && !W.skip) return false;
      if (down) { if (!held[code]) press(a); held[code] = true; } else held[code] = false;
      return true;
    }
    function pointer(x, y, down) {
      if (!W || W.auto) return false;
      var g = W.geom; if (!g) return !!W;
      var pt = { x: x, y: y, w: 1, h: 1 };
      if (W.stage === 'choose' || W.stage === 'deal') {
        for (var i = 0; i < W.cards.length; i++) { var r = g.cards[i]; if (r && hit(pt, r)) { if (down && W.cursor === i) inbox.push('confirm'); else if (W.cursor !== i) W.cursor = i; return true; } }
        if (down && g.btnReroll && hit(pt, g.btnReroll)) { inbox.push('reroll'); return true; }
        if (down && g.btnSkip && hit(pt, g.btnSkip)) { inbox.push('skip'); return true; }
      }
      return true;
    }

    function hitTest(x, y) {   // read-only: what pointer(x, y) would hit ('card' | 'reroll' | 'skip' | null), e.g. for canvas.style.cursor
      if (!W || W.auto || !W.geom || !(W.stage === 'choose' || W.stage === 'deal')) return null;
      var g = W.geom, pt = { x: x, y: y, w: 1, h: 1 };
      for (var i = 0; i < W.cards.length; i++) if (g.cards[i] && hit(pt, g.cards[i])) return 'card';
      if (g.btnReroll && hit(pt, g.btnReroll)) return 'reroll';
      if (g.btnSkip && hit(pt, g.btnSkip)) return 'skip';
      return null;
    }

    /* ---------- layout ---------- */
    function field() {
      var b = typeof o.bounds === 'function' ? call(o.bounds) : o.bounds;
      if (okRect(b)) return { x: +b.x, y: +b.y, w: +b.w, h: +b.h };
      var v = typeof o.view === 'function' ? call(o.view) : o.view;
      if (v && v.w > 0 && v.h > 0) return { x: 0, y: 0, w: +v.w, h: +v.h };
      if (lastCanvas) return { x: 0, y: 0, w: lastCanvas.w, h: lastCanvas.h };
      return null;
    }
    function uiList() {
      var out = [], a = call(o.getObstacles), u = call(o.uiRects);
      [a, u].forEach(function (L, j) { if (L && L.length) for (var i = 0; i < L.length; i++) { var r = L[i]; if (okRect(r) && (j === 1 || r.id == null)) out.push({ x: +r.x, y: +r.y, w: +r.w, h: +r.h }); } });
      return out;
    }
    function isPixel(f) { if (P.look === 'pixel') return true; if (P.look === 'hd') return false; return f.h < P.pixelBelow; }
    function geom(f, n, hand) {
      var px = isPixel(f), U = px ? 1 : Math.min(f.w / 640, f.h / 360), ui = uiList();
      var gap = px ? 6 : 22 * U, titleH = px ? 28 : 72 * U, hintH = px ? 12 : 28 * U, stripH = P.strip === 'off' ? 0 : px ? 18 : 36 * U, gy = px ? 4 : 8 * U;
      var cw = px ? Math.min(76, Math.floor((f.w - 10 - (n - 1) * gap) / n)) : Math.min(148 * U, (f.w * 0.94 - (n - 1) * gap) / n);
      var ch = px ? Math.max(Math.round(cw * 1.36), 100) : cw * 1.36;
      if (px && hand) hand.forEach(function (c) { ch = Math.max(ch, pxLay(c, Math.round(cw)).need); });   // pixel cards grow to fit their text
      var spanW = n * cw + (n - 1) * gap, sx0 = f.x + (f.w - spanW) / 2, sx1 = sx0 + spanW;
      var top = f.y, bot = f.y + f.h, mid = f.y + f.h / 2;
      ui.forEach(function (r) { if (r.x < sx1 && r.x + r.w > sx0) { if (r.y + r.h / 2 < mid) top = Math.max(top, r.y + r.h + (px ? 1 : 2)); else bot = Math.min(bot, r.y - (px ? 1 : 2)); } });
      var mo = (n - 1) / 2, ra = mo * P.tilt * Math.PI / 180 * (P.reduced === 'on' ? 0 : 1), gyB = px ? 5 : gy + Math.max(4 * U, mo * 4 * U + (cw / 2) * Math.sin(ra) - (ch / 2) * (1 - Math.cos(ra)) + 1 * U);   // room for the caret and the lower corners of the fanned outer cards (checks/layout.py: neither touches a hint item)
      var avail = bot - top, need = titleH + ch + hintH + stripH + gy * 2 + gyB, s = 1;
      if (need > avail) {
        if (px) { ch = Math.max(Math.round(cw * 1.36), 70, ch - (need - avail)); need = titleH + ch + hintH + stripH + gy * 2 + gyB; }
        else { s = Math.max(0.62, avail / need); }
        if (need * s > avail + 0.5) { warnOnce('fit', 'the cards do not fit between the UI rects; they may overlap the HUD'); top = f.y; bot = f.y + f.h; avail = f.h; s = px ? 1 : Math.min(1, avail / need); }
      }
      if (s !== 1) { U *= s; gap *= s; titleH *= s; hintH *= s; stripH *= s; gy *= s; gyB *= s; cw *= s; ch *= s; spanW = n * cw + (n - 1) * gap; sx0 = f.x + (f.w - spanW) / 2; need *= s; }
      var y0 = top + Math.max(0, (avail - need) / 2);
      if (px) y0 = Math.round(y0);
      var cardTop = y0 + titleH + gy, cards = [];
      for (var i = 0; i < n; i++) { var x = sx0 + i * (cw + gap); if (px) x = Math.round(x); cards.push({ x: x, y: px ? Math.round(cardTop) : cardTop, w: px ? Math.round(cw) : cw, h: px ? Math.round(ch) : ch }); }
      return { f: f, px: px, U: U, n: n, cw: px ? Math.round(cw) : cw, ch: px ? Math.round(ch) : ch, gap: gap, titleY: y0, cardTop: cardTop, cards: cards,
        hintY: cardTop + ch + gyB, stripY: cardTop + ch + gyB + gy + hintH, stripH: stripH, cx: f.x + f.w / 2 };
    }

    /* ---------- drawing ---------- */
    function tok(path, d) { if (SK) { try { var v = SK.token(path); if (typeof v === 'string' && v !== path) return v; } catch (e) { } } return d; }
    function hdFont(wt, size) { var fam = FONT; try { if (SK && SK.pixel === false && SK.fonts && SK.fonts.ui && SK.fonts.ui.family) fam = SK.fonts.ui.family + ', ' + FONT; } catch (e) { } return wt + ' ' + size.toFixed(2) + 'px ' + fam; }
    function scaleOf(ctx) { try { var m = ctx.getTransform(); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; } catch (e) { return 1; } }
    function rr(ctx, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function setLS(ctx, v) { try { if ('letterSpacing' in ctx) ctx.letterSpacing = v; } catch (e) { } }
    var WR = {};
    function hdWrap(ctx, s, maxW, font, maxLines) {
      var key = font + '|' + maxW.toFixed(1) + '|' + s; if (WR[key]) return WR[key];
      ctx.font = font; var words = s.split(/\s+/), lines = [], cur = '';
      for (var i = 0; i < words.length; i++) { var t = cur ? cur + ' ' + words[i] : words[i]; if (ctx.measureText(plain(t)).width > maxW && cur) { lines.push(cur); cur = words[i]; } else cur = t; }
      if (cur) lines.push(cur);
      if (lines.length > maxLines) { lines = lines.slice(0, maxLines); var l = lines[maxLines - 1]; while (l.length > 1 && ctx.measureText(plain(l) + '\u2026').width > maxW) l = l.slice(0, -1); lines[maxLines - 1] = l + '\u2026'; }
      return (WR[key] = lines);
    }
    function richSegs(line, st) {                            // split a line into [{t, hi}] by the {value} markers; st = highlight state carried across lines
      var out = [], cur = '', hi = st.hi;
      for (var i = 0; i < line.length; i++) { var ch = line[i]; if (ch === '\u0001' || ch === '\u0002') { if (cur) out.push({ t: cur, hi: hi }); cur = ''; hi = ch === '\u0001'; } else cur += ch; }
      if (cur) out.push({ t: cur, hi: hi }); st.hi = hi; return out;
    }
    function hdRich(ctx, line, cx, y, col, accent, st) {     // centred line; only the substituted {value} / {total} spans in the accent colour
      var segs = richSegs(line, st), tot = 0; segs.forEach(function (g) { g.w = ctx.measureText(g.t).width; tot += g.w; });
      var x = cx - tot / 2; ctx.textAlign = 'left';
      segs.forEach(function (g) { ctx.fillStyle = g.hi ? accent : col; ctx.fillText(g.t, x, y); x += g.w; });
      return tot;
    }

    // HD card face, drawn centred at the origin
    function hdBack(ctx, w, h, U) {
      U = w / 148;                                                      // card content scales with the card
      rr(ctx, -w / 2, -h / 2, w, h, 12 * U);
      var g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, '#2a2f58'); g.addColorStop(1, '#141633'); ctx.fillStyle = g; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(255,214,120,0.10)'; ctx.lineWidth = 1.2 * U;
      for (var k = -8; k <= 8; k++) { ctx.beginPath(); ctx.moveTo(k * 18 * U - h, -h / 2); ctx.lineTo(k * 18 * U + h, h / 2 + h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(k * 18 * U + h, -h / 2); ctx.lineTo(k * 18 * U - h, h / 2 + h); ctx.stroke(); }
      var rg = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.6); rg.addColorStop(0, 'rgba(255,210,120,0.22)'); rg.addColorStop(1, 'rgba(255,210,120,0)'); ctx.fillStyle = rg; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
      rr(ctx, -w / 2 + 5 * U, -h / 2 + 5 * U, w - 10 * U, h - 10 * U, 9 * U); ctx.strokeStyle = 'rgba(255,214,120,0.55)'; ctx.lineWidth = 1.5 * U; ctx.stroke();
      ctx.save(); ctx.rotate(Math.PI / 4); ctx.strokeStyle = 'rgba(255,214,120,0.7)'; ctx.lineWidth = 2 * U; ctx.strokeRect(-17 * U, -17 * U, 34 * U, 34 * U); ctx.restore();
      drawIcon(ctx, 'magic', 0, 0, 26 * U, '#ffd66b', false);
    }
    function hdFace(ctx, c, w, h, U, t, sel) {
      U = w / 148;
      var R = RARITY[c.u.rarity], ti = tagInfo(c.u.icon);
      rr(ctx, -w / 2, -h / 2, w, h, 12 * U);
      var g = ctx.createLinearGradient(0, -h / 2, 0, h / 2); g.addColorStop(0, R.top); g.addColorStop(1, R.bot); ctx.fillStyle = g; ctx.fill();
      ctx.save(); ctx.clip();
      var rg = ctx.createRadialGradient(0, -h * 0.25, 0, 0, -h * 0.25, w * 0.8); rg.addColorStop(0, rgba(R.glow, 0.32)); rg.addColorStop(1, rgba(R.glow, 0)); ctx.fillStyle = rg; ctx.fillRect(-w / 2, -h / 2, w, h);
      if (c.u.rarity === 'epic') { ctx.globalCompositeOperation = 'lighter'; var sx = ((t * 0.00012) % 1.6 - 0.3) * w * 2 - w; var sg = ctx.createLinearGradient(sx - 30 * U, -h / 2, sx + 30 * U, h / 2); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,230,255,0.13)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = sg; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.globalCompositeOperation = 'source-over'; }
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(-w / 2, -h / 2, w, 1.5 * U);
      ctx.restore();
      rr(ctx, -w / 2 + 0.75 * U, -h / 2 + 0.75 * U, w - 1.5 * U, h - 1.5 * U, 11.5 * U); ctx.strokeStyle = sel ? '#ffffff' : R.edge; ctx.lineWidth = (sel ? 2.2 : 1.5) * U; ctx.stroke();
      rr(ctx, -w / 2 + 4.5 * U, -h / 2 + 4.5 * U, w - 9 * U, h - 9 * U, 8.5 * U); ctx.strokeStyle = rgba(R.glow, 0.22); ctx.lineWidth = 1 * U; ctx.stroke();
      // rarity chip
      ctx.font = hdFont('800', 8.5 * U); setLS(ctx, (1.2 * U).toFixed(2) + 'px'); var lw = ctx.measureText(R.label).width;
      rr(ctx, -w / 2 + 9 * U, -h / 2 + 9 * U, lw + 12 * U, 15 * U, 7.5 * U); ctx.fillStyle = R.chip; ctx.fill();
      ctx.fillStyle = '#0d1020'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(R.label, -w / 2 + 15 * U, -h / 2 + 16.8 * U); setLS(ctx, '0px');
      // stack pips (top right)
      var pm = Math.min(c.u.max, 6), pr = 3 * U;
      if (c.u.max < 1e8) for (var p = 0; p < pm; p++) { var px0 = w / 2 - 13 * U - (pm - 1 - p) * 9 * U, py0 = -h / 2 + 16.5 * U; ctx.save(); ctx.translate(px0, py0); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = p < c.stacks ? GOLD : p === c.stacks ? (0.6 + 0.4 * Math.sin(t / 160)) > 0.8 ? '#fff6d0' : '#ffe9a0' : 'rgba(255,255,255,0.16)';
        ctx.fillRect(-pr, -pr, pr * 2, pr * 2); if (p === c.stacks) { ctx.strokeStyle = 'rgba(255,240,190,0.9)'; ctx.lineWidth = 1 * U; ctx.strokeRect(-pr - 1.5 * U, -pr - 1.5 * U, pr * 2 + 3 * U, pr * 2 + 3 * U); } ctx.restore(); }
      // medallion + icon
      var B = c.boxes = { card: { x: -w / 2, y: -h / 2, w: w, h: h }, text: [], prev: null, ribbon: null, U: U, inset: 6 * U };
      var my = -h / 2 + 50 * U, mr = 26 * U;
      var mg = ctx.createRadialGradient(-8 * U, my - 10 * U, 2 * U, 0, my, mr); mg.addColorStop(0, shade(ti.color, 0.15)); mg.addColorStop(0.55, R.medal); mg.addColorStop(1, '#0c0f1e');
      ctx.beginPath(); ctx.arc(0, my, mr, 0, 7); ctx.fillStyle = mg; ctx.fill();
      ctx.strokeStyle = c.syn.count ? GOLD : R.edge; ctx.lineWidth = 2 * U; ctx.stroke();
      if (c.syn.count) { ctx.save(); ctx.strokeStyle = 'rgba(255,214,107,0.55)'; ctx.lineWidth = 1.2 * U; ctx.setLineDash([3 * U, 4 * U]); ctx.lineDashOffset = -t / 40; ctx.beginPath(); ctx.arc(0, my, mr + 5 * U, 0, 7); ctx.stroke(); ctx.restore(); }
      ctx.save(); ctx.shadowColor = ti.color; ctx.shadowBlur = 12 * U * scaleOf(ctx); drawIcon(ctx, ti.icon, 0, my, 32 * U, ti.color, true); ctx.restore();
      ctx.beginPath(); ctx.ellipse(-8 * U, my - 13 * U, 11 * U, 5.5 * U, -0.5, 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fill();
      // name
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
      var nf = hdFont('750', 15 * U), nl = hdWrap(ctx, c.u.name, w - 16 * U, nf, 2), ny = -h / 2 + 102 * U;
      ctx.font = nf; if (nl.length > 1) { ctx.font = hdFont('750', 13 * U); if (!c.syn.count) ny -= 5 * U; }
      nl.forEach(function (l, i) { var nw = ctx.measureText(l).width; B.text.push({ x: -nw / 2, y: ny + i * 15 * U - 11 * U, w: nw, h: 14 * U, kind: 'name' }); });
      nl.forEach(function (l, i) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillText(l, 0, ny + i * 15 * U + 1.2 * U); ctx.fillStyle = '#ffffff'; ctx.fillText(l, 0, ny + i * 15 * U); });
      var ty = ny + (nl.length - 1) * 15 * U + 16 * U;
      // tags
      ctx.font = hdFont('600', 9 * U); var parts = c.u.tags.slice(0, 3).map(function (tg) { var q = tagInfo(tg); return { q: q, tg: tg, w: ctx.measureText(q.label.toUpperCase()).width + 13 * U }; });
      var tw = 0; parts.forEach(function (q) { tw += q.w; }); tw += (parts.length - 1) * 7 * U; var iconsOnly = tw > w - 16 * U; if (iconsOnly) tw = parts.length * 15 * U - 5 * U; var tx = -tw / 2;
      setLS(ctx, (0.6 * U).toFixed(2) + 'px');
      if (parts.length) B.text.push({ x: -tw / 2, y: ty - 8 * U, w: tw, h: 10 * U, kind: 'tags' });
      parts.forEach(function (q) { var on = c.syn.tags.indexOf(q.tg) >= 0; drawIcon(ctx, q.q.icon, tx + 4.5 * U, ty - 3.2 * U, 9 * U, q.q.color, false);
        if (iconsOnly) { if (on) { ctx.fillStyle = GOLD; ctx.fillRect(tx, ty + 2 * U, 9 * U, 1.4 * U); } tx += 15 * U; return; }
        ctx.fillStyle = on ? GOLD : 'rgba(220,226,240,0.72)'; ctx.textAlign = 'left'; ctx.fillText(q.q.label.toUpperCase(), tx + 11 * U, ty); tx += q.w + 7 * U; });
      setLS(ctx, '0px');
      // description: fit between the tags and the preview well (font steps down to 9 px-units, then the last line is ellipsized)
      var dTop = ty + 6 * U, dBot = c.prev.length ? h / 2 - 38 * U : h / 2 - 10 * U, fs = 11.5, dl = null, lh = 0;
      for (; fs >= 9; fs -= 0.5) { lh = fs * 1.24 * U; dl = hdWrap(ctx, c.desc, w - 18 * U, hdFont('500', fs * U), 99); if (dl.length * lh <= dBot - dTop) break; }
      if (fs < 9) { fs = 9; lh = fs * 1.24 * U; dl = hdWrap(ctx, c.desc, w - 18 * U, hdFont('500', fs * U), Math.max(1, Math.floor((dBot - dTop) / lh))); }
      ctx.font = hdFont('500', fs * U); var rst = { hi: false };
      dl.forEach(function (l, i) { var by = dTop + i * lh + fs * 0.98 * U, lw2 = hdRich(ctx, l, 0, by, 'rgba(232,236,248,0.92)', '#ffe08a', rst); B.text.push({ x: -lw2 / 2, y: by - fs * 0.8 * U, w: lw2, h: fs * 1.02 * U, kind: 'desc' }); });
      // stat preview well
      if (c.prev.length) {
        var wy = h / 2 - 25 * U; B.prev = { x: -w / 2 + 9 * U, y: wy - 11 * U, w: w - 18 * U, h: 19 * U }; rr(ctx, -w / 2 + 9 * U, wy - 11 * U, w - 18 * U, 19 * U, 6 * U); ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fill();
        var line = c.prev.map(function (q) { return q.label + ' ' + fmt(q.from) + ' \u2192 ' + fmt(q.to); }).join('   ');
        var pfs = 10.5 * U; ctx.font = hdFont('700', pfs); var pmw = ctx.measureText(line).width; if (pmw > w - 26 * U) { pfs *= (w - 26 * U) / pmw; ctx.font = hdFont('700', pfs); } ctx.textAlign = 'center'; ctx.fillStyle = '#9ff0b8'; ctx.fillText(line, 0, wy + 3 * U); var plw = ctx.measureText(line).width; B.text.push({ x: -plw / 2, y: wy + 3 * U - pfs * 0.78, w: plw, h: pfs * 0.98, kind: 'prev' });
      }
      // synergy ribbon
      if (c.syn.count) {
        var sl = 'SYNERGY ' + (c.syn.count > 1 ? '\u00d7' + c.syn.count : ''); ctx.font = hdFont('800', 8.5 * U); setLS(ctx, (1 * U).toFixed(2) + 'px'); var sw = ctx.measureText(sl.trim()).width + 14 * U;
        var syy = my + mr - 6 * U; B.ribbon = { x: -sw / 2, y: syy, w: sw, h: 14 * U }; rr(ctx, -sw / 2, syy, sw, 14 * U, 7 * U); var sgr = ctx.createLinearGradient(0, syy, 0, syy + 15 * U); sgr.addColorStop(0, '#ffe7a0'); sgr.addColorStop(1, '#e9a93a'); ctx.fillStyle = sgr; ctx.fill();
        ctx.strokeStyle = 'rgba(60,30,0,0.6)'; ctx.lineWidth = 1 * U; ctx.stroke(); ctx.fillStyle = '#3a2000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(sl.trim(), 0, syy + 7.3 * U); setLS(ctx, '0px'); ctx.textBaseline = 'alphabetic';
      }
    }

    // pixel card faces (cached; blitted with flip quantised to whole pixels)
    var PXC = {};
    function pxFrame(x, w, h, fill, fill2, edge, ink) {
      x.fillStyle = ink; x.fillRect(1, 0, w - 2, h); x.fillRect(0, 1, w, h - 2);
      x.fillStyle = edge; x.fillRect(2, 1, w - 4, h - 2); x.fillRect(1, 2, w - 2, h - 4);
      x.fillStyle = fill; x.fillRect(2, 2, w - 4, h - 4);
      x.fillStyle = fill2; for (var yy = Math.floor(h / 2); yy < h - 2; yy++) for (var xx = 2 + (yy & 1); xx < w - 2; xx += 2) x.fillRect(xx, yy, 1, 1);
      x.fillStyle = fill2; x.fillRect(2, Math.floor(h * 0.75), w - 4, h - 2 - Math.floor(h * 0.75));
    }
    function pxBack(w, h) {
      var k = 'back|' + w + 'x' + h; if (PXC[k]) return PXC[k];
      var c = mkCanvas(w, h); if (!c) return null; var x = c.getContext('2d');
      pxFrame(x, w, h, '#28305c', '#1c2246', '#c8a050', INK);
      x.fillStyle = '#3a4478'; for (var yy = 4; yy < h - 4; yy += 4) for (var xx = 4 + ((yy >> 2) & 1) * 2; xx < w - 4; xx += 4) x.fillRect(xx, yy, 1, 1);
      x.fillStyle = '#c8a050'; x.fillRect(4, 4, w - 8, 1); x.fillRect(4, h - 5, w - 8, 1); x.fillRect(4, 4, 1, h - 8); x.fillRect(w - 5, 4, 1, h - 8);
      var cx = Math.floor(w / 2), cy = Math.floor(h / 2);
      for (var r = 0; r <= 9; r++) { x.fillStyle = r === 9 ? '#c8a050' : '#1a1e40'; x.fillRect(cx - 9 + r, cy - r, (9 - r) * 2 + 1, 1); x.fillRect(cx - 9 + r, cy + r, (9 - r) * 2 + 1, 1); }
      x.fillStyle = '#c8a050'; for (r = 0; r <= 9; r++) { x.fillRect(cx - 9 + r, cy - r, 1, 1); x.fillRect(cx + 9 - r, cy - r, 1, 1); x.fillRect(cx - 9 + r, cy + r, 1, 1); x.fillRect(cx + 9 - r, cy + r, 1, 1); }
      var ic = pixelIcon('magic', 9, '#ffd66b'); if (ic) x.drawImage(ic, cx - Math.floor(ic.width / 2), cy - Math.floor(ic.height / 2));
      return (PXC[k] = c);
    }
    function pxLay(c, w) {                                   // pixel card rows; need = the height the full text wants
      var nl = pxWrap(c.u.name, w - 8, 2), tagY = 33 + nl.length * 9, descY = tagY + (c.u.tags.length ? 11 : 0) + 4;
      var dl = pxWrap(c.desc, w - 8, 0);
      return { nl: nl, tagY: tagY, descY: descY, dl: dl, need: descY + dl.length * 9 + (c.prev.length ? 14 : 4) };
    }
    var PXB = {};
    function pxFace(c, w, h, sel) {
      var k = 'f|' + c.id + '|' + c.stacks + '|' + c.syn.count + '|' + c.syn.tags.join(',') + '|' + (sel ? 1 : 0) + '|' + w + 'x' + h + '|' + c.desc + '|' + c.prev.map(function (q) { return q.to; }).join(',');
      if (PXC[k]) { c.boxes = PXB[k]; return PXC[k]; }
      var cv = mkCanvas(w, h); if (!cv) return null; var x = cv.getContext('2d'), R = RARITY[c.u.rarity].px, ti = tagInfo(c.u.icon);
      var B = { card: { x: 0, y: 0, w: w, h: h }, text: [], prev: null, ribbon: null, U: 1, inset: 4 };
      pxFrame(x, w, h, R.body, R.body2, sel ? '#ffffff' : R.edge, R.ink);
      x.fillStyle = R.band; x.fillRect(2, 2, w - 4, 9); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(2, 2, w - 4, 1);
      pxText(x, RARITY[c.u.rarity].label, 5, 3, R.ink, 'left', 1, null);
      var pm = Math.min(c.u.max, 5);
      if (pxW(RARITY[c.u.rarity].label) + 8 + pm * 5 > w) pm = 0;
      if (c.u.max < 1e8) for (var p = 0; p < pm; p++) { var X = w - 6 - (pm - 1 - p) * 5; x.fillStyle = R.ink; x.fillRect(X - 1, 4, 5, 5); x.fillStyle = p < c.stacks ? GOLD : p === c.stacks ? '#fff6d0' : 'rgba(255,255,255,0.25)'; x.fillRect(X, 5, 3, 3); }
      // medallion (gold ring = synergy)
      var mcx = Math.floor(w / 2), mcy = 22, mr = 9;
      for (var yy = -mr; yy <= mr; yy++) { var hw = Math.floor(Math.sqrt(mr * mr - yy * yy) + 0.35); x.fillStyle = c.syn.count ? GOLD : RARITY[c.u.rarity].px.edge; x.fillRect(mcx - hw, mcy + yy, hw * 2 + 1, 1); }
      for (yy = -mr + 1; yy <= mr - 1; yy++) { hw = Math.floor(Math.sqrt((mr - 1) * (mr - 1) - yy * yy) + 0.35); x.fillStyle = yy < -2 ? shade(RARITY[c.u.rarity].medal, 0.18) : RARITY[c.u.rarity].medal; x.fillRect(mcx - hw, mcy + yy, hw * 2 + 1, 1); }
      var ic = pixelIcon(ti.icon, 11, ti.color); if (ic) x.drawImage(ic, mcx - Math.floor(ic.width / 2), mcy - Math.floor(ic.height / 2));
      var L = pxLay(c, w), y = 33;
      L.nl.forEach(function (l) { var gp = pxW(l) > w - 8 ? 0 : 1, lw = pxW(l, gp); pxText(x, l, mcx, y, '#ffffff', 'center', 1, R.ink, gp); B.text.push({ x: Math.round(mcx - lw / 2), y: y, w: lw + 1, h: 9, kind: 'name' }); y += 9; });
      // tag row: small icons, the shared ones underlined in gold, then SYN in gold
      if (c.u.tags.length) {
        var tags = c.u.tags.slice(0, 3), synW = c.syn.count ? pxW('SYN') + 3 : 0, tw = tags.length * 10 - 1 + synW, tx = Math.round(mcx - tw / 2);
        tags.forEach(function (tg) { var q = tagInfo(tg), im = pixelIcon(q.icon, 7, q.color); if (im) x.drawImage(im, tx, L.tagY); if (c.syn.tags.indexOf(tg) >= 0) { x.fillStyle = GOLD; x.fillRect(tx + 1, L.tagY + 10, 7, 1); } tx += 10; });
        if (synW) pxText(x, 'SYN', tx + 2, L.tagY + 1, GOLD, 'left', 1, R.ink);
        B.text.push({ x: Math.round(mcx - tw / 2), y: L.tagY, w: tw, h: 10, kind: 'tags' });
      }
      y = L.descY - 2; x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(6, y - 1, w - 12, 1);
      var bot = h - (c.prev.length ? 14 : 4), maxL = Math.max(1, Math.floor((bot - L.descY + 1) / 9)), rst = { hi: false };
      pxWrap(c.desc, w - 8, maxL).forEach(function (l) {
        var gp = pxW(l) > w - 8 ? 0 : 1, segs = richSegs(l, rst), tw2 = pxW(l, gp), cx = Math.round(mcx - tw2 / 2);
        segs.forEach(function (g) { pxText(x, g.t, cx, y + 2, g.hi ? '#ffe08a' : '#d8deee', 'left', 1, null, gp); cx += pxW(g.t, gp) + gp; });
        B.text.push({ x: Math.round(mcx - tw2 / 2), y: y + 2, w: tw2, h: 8, kind: 'desc' });
        y += 9;
      });
      if (c.prev.length) {
        var q = c.prev[0], dv = q.to - q.from, amt = (dv >= 0 ? '+' : '-') + fmt(Math.abs(dv)), full = q.label + ' ' + fmt(q.from) + '\u2192' + fmt(q.to), sh = q.label + ' ' + amt, s3 = q.label.slice(0, 3) + ' ' + amt, pick = null;
        // every shorter form in normal spacing before any condensed (0 px gap) form: condensed glyphs touch (MANA, MAXHP smudge)
        var cands = [[full, 1], [sh, 1], [s3, 1], [sh, 0], [s3, 0], [amt, 1], [amt, 0]];
        for (var ci = 0; ci < cands.length && !pick; ci++) { if (pxW(cands[ci][0], cands[ci][1]) <= w - 8) pick = { s: cands[ci][0], g: cands[ci][1] }; }
        if (!pick) pick = { s: amt, g: 0 };
        B.prev = { x: 3, y: h - 12, w: w - 6, h: 9 }; x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(3, h - 12, w - 6, 9);
        var pw = pxW(pick.s, pick.g); pxText(x, pick.s, mcx, h - 11, '#9ff0b8', 'center', 1, null, pick.g); B.text.push({ x: Math.round(mcx - pw / 2), y: h - 11, w: pw, h: 7, kind: 'prev' });
      }
      PXB[k] = B; c.boxes = B;
      return (PXC[k] = cv);
    }

    // where every card is at time t
    function cardPose(d, g, c, j) {
      var k = timeK(), n = d.cards.length, mid = (n - 1) / 2, r = g.cards[j], t = d.t;
      var tx = r.x + r.w / 2, ty = r.y + r.h / 2, rot = g.px ? 0 : (j - mid) * P.tilt * Math.PI / 180 * (P.reduced === 'on' ? 0 : 1), fy = g.px ? 0 : Math.abs(j - mid) * 4 * g.U;
      var ds = d.handT + j * P.stagger * k, pd = (t - ds) / Math.max(1, P.dealMs * k);
      var fx = g.cx + (j - mid) * 10 * g.U, fyy = g.f.y + g.f.h + r.h * 0.7;
      var e = P.reduced === 'on' ? eOut(pd) : eBack(pd, 1.25), er = eOut(pd);
      var pose = { x: lerp(fx, tx, e), y: lerp(fyy, ty + fy, er), rot: lerp(g.px ? 0 : -0.35 + j * 0.12, rot, er), s: g.px ? 1 : lerp(0.9, 1, e), alpha: pd <= 0 ? 0 : 1, flip: 0, w: r.w, h: r.h };
      var fs = ds + P.dealMs * 0.8 * k, pf = c01((t - fs) / Math.max(1, P.flipMs * k));
      pose.flip = pf;                                                   // 0 back, 0.5 edge-on, 1 face
      if (d.stage === 'choose' || d.stage === 'deal') {
        var L = c.lift; pose.y -= L * (g.px ? 4 : 14 * g.U + fy); pose.s = 1 + L * (g.px ? 0 : 0.055); pose.rot = lerp(pose.rot, 0, L);
      }
      if (d.stage === 'reroll') { var pr = (t - d.rrT - j * 40 * k) / (DROP * k); pose.flip = 1 - c01(pr * 2); pose.y += eIn(pr) * (g.f.h * 0.75); pose.rot += eIn(pr) * (j - mid) * 0.25; }
      if (d.stage === 'skip' || ((d.stage === 'close') && !d.picked)) { var ps = (d.stage === 'skip' ? t - d.skipT : DROP * k) / (DROP * k); pose.y += eIn(ps) * g.f.h * 0.7; pose.alpha = 1 - c01(ps); }
      if ((d.stage === 'pick' || d.stage === 'close') && d.picked) {
        var pt = t - d.pickT;
        if (c !== d.picked) { var po = pt / (DROP * k); pose.y += eIn(po) * (g.px ? 40 : 70 * g.U); pose.rot += (g.px ? 0 : (j < d.picked.i ? -1 : 1) * eIn(po) * 0.35); pose.alpha = 1 - c01(po * 1.2); pose.s = 1 - 0.1 * eIn(po); }
        else { var pp = pt / (PICK_PULSE * k); pose.rot = 0; pose.y = ty - (g.px ? 4 : 14 * g.U); pose.s = 1 + (g.px ? 0 : 0.055) + (g.px ? 0 : 0.04 * Math.sin(Math.PI * c01(pp))); pose.flash = 1 - c01(pp); }
      }
      return pose;
    }
    function stripLayout(g, n, x0, y0, w, h) {
      var sz = g.px ? 14 : Math.round(26 * g.U), gap = g.px ? 2 : 6 * g.U, tot = n * sz + Math.max(0, n - 1) * gap, maxW = w;
      if (tot > maxW && n > 1) { gap = Math.max(-sz * 0.4, (maxW - n * sz) / (n - 1)); tot = n * sz + (n - 1) * gap; }
      var sx = x0 + (w - tot) / 2, out = [];
      for (var i = 0; i < n; i++) out.push({ x: g.px ? Math.round(sx + i * (sz + gap)) : sx + i * (sz + gap), y: g.px ? Math.round(y0 + (h - sz) / 2) : y0 + (h - sz) / 2, w: sz, h: sz });
      return out;
    }
    function drawSlot(ctx, g, id, r, glow, hidden, pop) {
      var u = byId(id); if (!u) return; var ti = tagInfo(u.icon), R = RARITY[u.rarity], st = owned[id] || 0;
      if (g.px) {
        var x = Math.round(r.x), y = Math.round(r.y), s = r.w;
        ctx.fillStyle = INK; ctx.fillRect(x, y, s, s); ctx.fillStyle = glow ? GOLD : R.px.edge; ctx.fillRect(x + 1, y + 1, s - 2, s - 2); ctx.fillStyle = R.px.body; ctx.fillRect(x + 2, y + 2, s - 4, s - 4); if (R.rank > 0) { ctx.fillStyle = R.px.edge; ctx.fillRect(x + 2, y + 2, 2, 2); }
        if (!hidden) { var ic = pixelIcon(ti.icon, 9, ti.color); if (ic) ctx.drawImage(ic, x + Math.floor((s - ic.width) / 2), y + Math.floor((s - ic.height) / 2)); }
        if (st > 1 && !hidden) { var lbl = String(st); ctx.fillStyle = INK; ctx.fillRect(x + s - pxW(lbl) - 2, y + s - 7, pxW(lbl) + 3, 8); pxText(ctx, lbl, x + s - 1, y + s - 6, '#ffffff', 'right', 1, null); }
        return;
      }
      var U = g.U, sc = pop ? 1 + 0.35 * Math.sin(Math.PI * c01(1 - pop / 260)) : 1;
      ctx.save(); ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.scale(sc, sc);
      if (glow) { ctx.shadowColor = 'rgba(255,214,107,0.9)'; ctx.shadowBlur = 10 * U * scaleOf(ctx); }
      rr(ctx, -r.w / 2, -r.h / 2, r.w, r.h, 6 * U); var gg = ctx.createLinearGradient(0, -r.h / 2, 0, r.h / 2); gg.addColorStop(0, R.top); gg.addColorStop(1, R.bot); ctx.fillStyle = gg; ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = glow ? GOLD : R.edge; ctx.lineWidth = (glow ? 2 : 1.3) * U; ctx.stroke();
      if (!hidden) drawIcon(ctx, ti.icon, 0, 0, r.w * 0.62, ti.color, false);
      if (R.rank > 0) { ctx.save(); ctx.translate(-r.w / 2 + 4 * U, -r.h / 2 + 4 * U); ctx.rotate(Math.PI / 4); ctx.fillStyle = R.edge; ctx.fillRect(-2.2 * U, -2.2 * U, 4.4 * U, 4.4 * U); ctx.strokeStyle = INK; ctx.lineWidth = 0.8 * U; ctx.strokeRect(-2.2 * U, -2.2 * U, 4.4 * U, 4.4 * U); ctx.restore(); }
      if (st > 1 && !hidden) { ctx.font = hdFont('800', 9 * U); var bw = ctx.measureText('\u00d7' + st).width + 6 * U; rr(ctx, r.w / 2 - bw + 3 * U, r.h / 2 - 8 * U, bw, 12 * U, 6 * U); ctx.fillStyle = '#0b0d18'; ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('\u00d7' + st, r.w / 2 - bw / 2 + 3 * U, r.h / 2 - 1.7 * U); ctx.textBaseline = 'alphabetic'; }
      ctx.restore();
    }
    function strip(ctx, g, y, h, hideId, glowTags) {
      if (P.strip === 'off') return null;
      var ids = order.slice(), n = ids.length, f = g.f, areaW = Math.min(f.w - (g.px ? 8 : 40 * g.U), g.px ? 240 : 520 * g.U);
      var lay = stripLayout(g, Math.max(1, n), f.x + (f.w - areaW) / 2, y, areaW, h);
      if (!n) {
        if (g.px) pxText(ctx, 'no upgrades yet', g.cx, y + h / 2 - 3, 'rgba(255,255,255,0.45)', 'center', 1, null);
        else { ctx.font = hdFont('600', 10.5 * g.U); ctx.fillStyle = 'rgba(230,234,248,0.45)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('No upgrades yet', g.cx, y + h / 2); ctx.textBaseline = 'alphabetic'; }
        return { lay: lay, rect: { x: g.cx - 50, y: y, w: 100, h: h } };
      }
      if (!g.px) { var bx = lay[0].x - 10 * g.U, bw = lay[n - 1].x + lay[n - 1].w - lay[0].x + 20 * g.U; rr(ctx, bx, y + 1 * g.U, bw, h - 2 * g.U, h / 2); ctx.fillStyle = 'rgba(8,10,22,0.55)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1 * g.U; ctx.stroke(); }
      ids.forEach(function (id, i) { var u = byId(id); var glow = !!(u && glowTags && glowTags.length && u.tags.some(function (t) { return glowTags.indexOf(t) >= 0; })); drawSlot(ctx, g, id, lay[i], glow, id === hideId, stripPop[id]); });
      var r0 = lay[0], r1 = lay[n - 1];
      return { lay: lay, rect: { x: r0.x, y: r0.y, w: r1.x + r1.w - r0.x, h: r0.h } };
    }
    function hint(ctx, g, d) {
      var parts = [['\u25c0\u25b6', 'Choose'], ['Z', 'Take']];
      if (d.rerollsLeft > 0) parts.push(['R', 'Reroll ' + d.rerollsLeft]);
      if (d.skip) parts.push(['X', P.skipLabel]);
      var y = g.hintY, out = {};
      if (g.px) {
        var s = '<> choose   Z take' + (d.rerollsLeft > 0 ? '   R reroll ' + d.rerollsLeft : '') + (d.skip ? '   X ' + P.skipLabel.toLowerCase() : '');
        var a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * 0.85; ctx.fillStyle = INK; ctx.fillRect(g.f.x, Math.round(y), g.f.w, 11); ctx.globalAlpha = a0;
        pxText(ctx, s, g.cx, y + 2, '#c8d0e8', 'center', 1, INK);
        var tw = pxW(s), x0 = g.cx - tw / 2; out.items = [{ x: Math.round(x0), y: Math.round(y) + 2, w: tw + 1, h: 9 }];
        if (d.rerollsLeft > 0) { var i0 = s.indexOf('R reroll'); out.btnReroll = { x: x0 + pxW(s.slice(0, i0)), y: y, w: pxW('R reroll ' + d.rerollsLeft), h: 10 }; }
        if (d.skip) { var i1 = s.lastIndexOf('X '); out.btnSkip = { x: x0 + pxW(s.slice(0, i1)), y: y, w: pxW(s.slice(i1)), h: 10 }; }
        return out;
      }
      var U = g.U; ctx.font = hdFont('600', 11 * U);
      var items = parts.map(function (p) { ctx.font = hdFont('800', 10 * U); var kw = Math.max(18 * U, ctx.measureText(p[0]).width + 10 * U); ctx.font = hdFont('600', 11 * U); return { k: p[0], l: p[1], kw: kw, w: kw + 6 * U + ctx.measureText(p[1]).width }; });
      var tot = 0; items.forEach(function (it) { tot += it.w; }); tot += (items.length - 1) * 18 * U;
      var x = g.cx - tot / 2, cy = y + 11 * U;
      // dark pill under the whole row so the scene (campfire glow, sprites) never shows through the labels
      var pl = { x: x - 10 * U, y: y, w: tot + 20 * U, h: 22 * U }; rr(ctx, pl.x, pl.y, pl.w, pl.h, 11 * U); ctx.fillStyle = 'rgba(8,10,22,0.82)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1 * U; ctx.stroke();
      out.items = [pl];
      items.forEach(function (it, i) {
        rr(ctx, x, cy - 9 * U, it.kw, 18 * U, 5 * U); ctx.fillStyle = 'rgba(240,244,255,0.92)'; ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 2 * U, cy + 7.2 * U, it.kw - 4 * U, 1.8 * U);
        ctx.font = hdFont('800', 10 * U); ctx.fillStyle = '#141826'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it.k, x + it.kw / 2, cy + 0.5 * U);
        ctx.font = hdFont('600', 11 * U); ctx.fillStyle = 'rgba(230,234,248,0.85)'; ctx.textAlign = 'left'; ctx.fillText(it.l, x + it.kw + 6 * U, cy + 0.5 * U);
        var box = { x: x, y: cy - 10 * U, w: it.w, h: 20 * U }; (out.items = out.items || []).push(box);
        if (it.k === 'R') out.btnReroll = box; if (it.k === 'X') out.btnSkip = box;
        x += it.w + 18 * U;
      });
      ctx.textBaseline = 'alphabetic';
      return out;
    }
    function particlesHD(ctx, x, y, age, life, n, rgb, spread, U, seed) {   // stateless: a pure function of age, so frozen frames repeat
      if (age < 0 || age > life) return;
      var p = age / life; ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < n; i++) { var a = h01(seed + i, 1) * Math.PI * 2, sp = (0.4 + h01(seed + i, 2) * 0.6) * spread, d = eOut(p) * sp, s = (1.2 + h01(seed + i, 3) * 2.2) * U * (1 - p);
        ctx.fillStyle = rgba(rgb, (1 - p) * 0.95); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d - p * p * 10 * U, s, 0, 7); ctx.fill(); }
      ctx.restore();
    }
    function particlesPX(ctx, x, y, age, life, n, col, spread, seed) {
      if (age < 0 || age > life) return;
      var p = age / life; ctx.fillStyle = col;
      for (var i = 0; i < n; i++) { if (h01(seed + i, 4) < p) continue; var a = h01(seed + i, 1) * Math.PI * 2, d = eOut(p) * (0.4 + h01(seed + i, 2) * 0.6) * spread; ctx.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), 1, 1); }
    }

    function paint(ctx, d, g) {
      var t = d.t, k = timeK(), U = g.U, f = g.f, rects = [];
      var fadeIn = c01(t / Math.max(1, P.openMs * k)), fadeOut = d.stage === 'close' ? 1 - c01((t - d.endT) / (CLOSE * k)) : 1, A = Math.min(fadeIn, 1) * fadeOut;
      // backdrop
      ctx.save();
      ctx.globalAlpha = A; ctx.fillStyle = tok('ink', INK).charAt(0) === '#' ? 'rgba(' + hexRgb(tok('ink', INK)) + ',' + P.dim + ')' : 'rgba(6,8,20,' + P.dim + ')'; ctx.fillRect(f.x, f.y, f.w, f.h);
      if (!g.px) {
        var vg = ctx.createRadialGradient(g.cx, g.cardTop + g.ch * 0.45, 10 * U, g.cx, g.cardTop + g.ch * 0.45, f.w * 0.62);
        vg.addColorStop(0, 'rgba(120,110,190,0.20)'); vg.addColorStop(1, 'rgba(0,0,0,0.30)'); ctx.fillStyle = vg; ctx.fillRect(f.x, f.y, f.w, f.h);
        ctx.save(); ctx.translate(g.cx, g.titleY + 22 * U); ctx.rotate(t / 9000); ctx.globalCompositeOperation = 'lighter';
        for (var ray = 0; ray < 10; ray++) { ctx.rotate(Math.PI / 5); var rg = ctx.createLinearGradient(0, 0, 0, -f.w * 0.5); rg.addColorStop(0, 'rgba(255,220,140,0.10)'); rg.addColorStop(1, 'rgba(255,220,140,0)'); ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-26 * U, -f.w * 0.5); ctx.lineTo(26 * U, -f.w * 0.5); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      // title
      var tp = eBack(t / Math.max(1, (P.openMs + 120) * k), 1.6), title = d.title, sub = (d.subtitle || 'Choose 1 of {n}').replace(/\{n\}/g, String(d.cards.length));
      if (g.px) {
        var ty = Math.round(g.titleY + (1 - c01(tp)) * -10), bandA = c01(tp);
        ctx.globalAlpha = A * bandA * 0.6; ctx.fillStyle = INK; ctx.fillRect(f.x, Math.round(g.titleY) - 3, f.w, 30);
        ctx.globalAlpha = A * bandA * 0.5; ctx.fillStyle = GOLD; ctx.fillRect(f.x, Math.round(g.titleY) - 4, f.w, 1); ctx.fillRect(f.x, Math.round(g.titleY) + 27, f.w, 1); ctx.globalAlpha = A;
        pxText(ctx, title.toUpperCase(), g.cx, ty, GOLD, 'center', 2, INK);
        pxText(ctx, sub, g.cx, ty + 17, '#c8d0e8', 'center', 1, INK);
        rects.push({ kind: 'title', x: g.cx - pxW(title.toUpperCase()) - 1, y: ty, w: pxW(title.toUpperCase()) * 2 + 2, h: 16 });
        rects.push({ kind: 'subtitle', x: g.cx - pxW(sub) / 2 - 1, y: ty + 17, w: pxW(sub) + 2, h: 9 });
      } else {
        ctx.save(); ctx.translate(g.cx, g.titleY + 26 * U); var ts = 1.25 - 0.25 * tp; ctx.scale(ts, ts);
        ctx.font = hdFont('900', 30 * U); setLS(ctx, (3 * U).toFixed(2) + 'px'); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(30,14,0,0.85)'; ctx.lineWidth = 5 * U; ctx.strokeText(title, 0, 0);
        var tg = ctx.createLinearGradient(0, -24 * U, 0, 2 * U); tg.addColorStop(0, '#fff6d6'); tg.addColorStop(0.55, '#ffd66b'); tg.addColorStop(1, '#e8962c'); ctx.fillStyle = tg;
        ctx.shadowColor = 'rgba(255,190,80,0.55)'; ctx.shadowBlur = 16 * U * scaleOf(ctx); ctx.fillText(title, 0, 0); ctx.shadowBlur = 0; setLS(ctx, '0px');
        ctx.font = hdFont('600', 12.5 * U); setLS(ctx, (1.5 * U).toFixed(2) + 'px'); ctx.fillStyle = 'rgba(225,230,250,0.85)'; ctx.fillText(sub.toUpperCase(), 0, 22 * U); setLS(ctx, '0px');
        ctx.restore();
        ctx.save(); ctx.font = hdFont('900', 30 * U); setLS(ctx, (3 * U).toFixed(2) + 'px'); var tW = ctx.measureText(title).width; ctx.font = hdFont('600', 12.5 * U); setLS(ctx, (1.5 * U).toFixed(2) + 'px'); var sW = ctx.measureText(sub.toUpperCase()).width; setLS(ctx, '0px'); ctx.restore();
        rects.push({ kind: 'title', x: g.cx - tW / 2, y: g.titleY + 4 * U, w: tW, h: 26 * U });
        rects.push({ kind: 'subtitle', x: g.cx - sW / 2, y: g.titleY + 26 * U + 12.5 * U, w: sW, h: 12 * U });
      }
      // cards: unselected first, the focused / picked one last
      var orderIdx = d.cards.map(function (c, j) { return j; }).sort(function (a, b) { return (d.cards[a].lift - d.cards[b].lift) || (d.picked === d.cards[a] ? 1 : d.picked === d.cards[b] ? -1 : 0); });
      if (d.picked) { orderIdx = orderIdx.filter(function (j) { return d.cards[j] !== d.picked; }); orderIdx.push(d.picked.i); }
      var glowTags = null;
      orderIdx.forEach(function (j) {
        var c = d.cards[j], pose = cardPose(d, g, c, j), sel = (d.stage === 'choose' || d.stage === 'deal') && j === d.cursor && pose.flip >= 1;
        if (pose.alpha <= 0.001) return;
        var pickT = d.picked === c ? t - d.pickT : -1, shrink = pickT >= 0 ? c01((pickT - PICK_PULSE * k) / (PICK_SHRINK * k)) : 0;
        if (shrink >= 1) return;                                          // now it is the flying orb
        var face = pose.flip >= 0.5, sx = Math.abs(Math.cos(Math.PI * pose.flip)), w = pose.w, h = pose.h;
        var R = RARITY[c.u.rarity];
        ctx.save(); ctx.globalAlpha = A * pose.alpha;
        if (g.px) {
          var sh = 1 - eIn(shrink), dw = Math.max(1, Math.round(w * sx * sh)), dh = Math.max(1, Math.round(h * sh));
          var X = Math.round(pose.x - dw / 2), Y = Math.round(pose.y - dh / 2);
          var im = face ? pxFace(c, w, h, sel) : pxBack(w, h);
          if (face && (R.rank > 0 || sel) && sx > 0.6) {               // rarity glow: a 1 px ring that pulses, and a dither halo for epic
            var on = (Math.floor(t / 180) + j) % 2 === 0, col = sel ? '#ffffff' : R.px.edge;
            ctx.fillStyle = col; if (R.rank > 0 || sel) { ctx.globalAlpha = A * pose.alpha * (on ? 0.9 : 0.55); ctx.fillRect(X - 1, Y + 1, 1, dh - 2); ctx.fillRect(X + dw, Y + 1, 1, dh - 2); ctx.fillRect(X + 1, Y - 1, dw - 2, 1); ctx.fillRect(X + 1, Y + dh, dw - 2, 1); }
            if (R.rank === 2) { ctx.globalAlpha = A * pose.alpha * 0.5; for (var q = 0; q < dw + 4; q += 2) { ctx.fillRect(X - 2 + q + ((Math.floor(t / 120)) & 1), Y - 3, 1, 1); ctx.fillRect(X - 2 + q + ((Math.floor(t / 120) + 1) & 1), Y + dh + 2, 1, 1); } for (q = 0; q < dh + 4; q += 2) { ctx.fillRect(X - 3, Y - 2 + q + ((Math.floor(t / 120)) & 1), 1, 1); ctx.fillRect(X + dw + 2, Y - 2 + q + ((Math.floor(t / 120) + 1) & 1), 1, 1); } }
            ctx.globalAlpha = A * pose.alpha;
          }
          if (im) { var ps = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false; ctx.drawImage(im, X, Y, dw, dh); ctx.imageSmoothingEnabled = ps; }
          if (pose.flash > 0) { ctx.globalAlpha = A * pose.flash * 0.7; ctx.fillStyle = '#ffffff'; ctx.fillRect(X + 1, Y + 1, dw - 2, dh - 2); }
          if (sel) { var rc = g.cards[j], ay = rc.y + rc.h + 1, axc = Math.round(rc.x + rc.w / 2); ctx.globalAlpha = A * ((Math.floor(t / 250)) & 1 ? 0.7 : 1); ctx.fillStyle = '#ffffff'; for (var a2 = 0; a2 < 3; a2++) ctx.fillRect(axc - a2, ay + a2, a2 * 2 + 1, 1); ctx.globalAlpha = A * pose.alpha; rects.push({ kind: 'caret', x: axc - 2, y: ay, w: 5, h: 3 }); }
          rects.push({ kind: 'card', id: c.id, stage: d.stage, x: X, y: Y, w: dw, h: dh, boxes: face ? c.boxes : null });
        } else {
          var shs = 1 - eIn(shrink) * 0.82;
          ctx.translate(pose.x, pose.y); ctx.rotate(pose.rot); ctx.scale(pose.s * shs, pose.s * shs);
          // soft drop shadow + rarity glow
          ctx.save(); ctx.scale(Math.max(0.02, sx), 1);
          var glowA = face ? (R.rank === 0 ? (sel ? 0.55 : 0) : (0.45 + 0.25 * Math.sin(t / 260 + j)) * (R.rank === 2 ? 1.25 : 0.95)) : 0;
          rr(ctx, -w / 2, -h / 2, w, h, 12 * U);
          ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 18 * U * scaleOf(ctx); ctx.shadowOffsetY = 10 * U * scaleOf(ctx) * (1 + c.lift * 0.6); ctx.fillStyle = '#000'; ctx.fill();
          ctx.shadowOffsetY = 0;
          if (glowA > 0) { ctx.shadowColor = sel && R.rank === 0 ? 'rgba(255,255,255,' + glowA + ')' : rgba(R.glow, glowA); ctx.shadowBlur = (R.rank === 2 ? 30 : 22) * U * scaleOf(ctx) * (sel ? 1.25 : 1); ctx.fill(); ctx.fill(); }
          ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
          if (face && R.rank === 2 && sx > 0.3) {                         // epic: slow light rays behind the card
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.rotate(t / 2400);
            for (var rk = 0; rk < 8; rk++) { ctx.rotate(Math.PI / 4); var lg = ctx.createLinearGradient(0, 0, 0, -h * 0.85); lg.addColorStop(0, rgba(R.glow, 0.22)); lg.addColorStop(1, rgba(R.glow, 0)); ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-12 * U, -h * 0.85); ctx.lineTo(12 * U, -h * 0.85); ctx.closePath(); ctx.fill(); }
            ctx.restore();
          }
          if (face) hdFace(ctx, c, w, h, U, t, sel); else hdBack(ctx, w, h, U);
          if (!face || pose.flip < 1) { rr(ctx, -w / 2, -h / 2, w, h, 12 * U); ctx.fillStyle = 'rgba(255,255,255,' + (0.35 * (1 - Math.abs(pose.flip - 0.5) * 2)).toFixed(3) + ')'; ctx.fill(); }
          if (!sel && (d.stage === 'choose') && d.cards.length > 1) { rr(ctx, -w / 2, -h / 2, w, h, 12 * U); ctx.fillStyle = 'rgba(6,8,20,' + (0.28 * (1 - c.focus)).toFixed(3) + ')'; ctx.fill(); }
          if (pose.flash > 0) { rr(ctx, -w / 2, -h / 2, w, h, 12 * U); ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * pose.flash).toFixed(3) + ')'; ctx.fill(); }
          ctx.restore();
          ctx.restore(); ctx.save(); ctx.globalAlpha = A * pose.alpha;
          // flip burst for rare and epic
          var fs = d.handT + j * P.stagger * k + P.dealMs * 0.8 * k + P.flipMs * k * 0.5;
          if (R.rank > 0 && P.reduced !== 'on' && d.stage !== 'reroll') particlesHD(ctx, pose.x, pose.y, t - fs, 520, R.rank === 2 ? 26 : 14, R.glow, (R.rank === 2 ? 120 : 80) * U, U, j * 31 + d.drawNo * 7 + d.reroll * 3);
          if (sel) { var rc2 = g.cards[j], bx = rc2.x + rc2.w / 2, by = rc2.y + rc2.h + 2 * U; ctx.globalAlpha = A * pose.alpha * (0.75 + 0.25 * Math.sin(t / 160)); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 7 * U, by + 7 * U); ctx.lineTo(bx + 7 * U, by + 7 * U); ctx.closePath(); ctx.fill(); ctx.globalAlpha = A * pose.alpha; rects.push({ kind: 'caret', x: bx - 7 * U, y: by, w: 14 * U, h: 7 * U }); }
          var hw2 = w * sx * pose.s * shs / 2, hh2 = h * pose.s * shs / 2, cr = Math.abs(Math.cos(pose.rot)), sr = Math.abs(Math.sin(pose.rot)), ax = hw2 * cr + hh2 * sr, ay = hw2 * sr + hh2 * cr;
          rects.push({ kind: 'card', id: c.id, stage: d.stage, x: pose.x - ax, y: pose.y - ay, w: ax * 2, h: ay * 2, boxes: face ? c.boxes : null });
        }
        ctx.restore();
        if (sel && face) glowTags = c.u.tags;
      });
      ctx.save(); ctx.globalAlpha = A;
      // hints (only while choosing)
      var hintA = d.stage === 'choose' ? 1 : d.stage === 'deal' ? c01((t - dealEnd(d.cards.length) + 200) / 200) : 0;
      if (hintA > 0) { ctx.globalAlpha = A * hintA; var b = hint(ctx, g, d); g.btnReroll = b.btnReroll; g.btnSkip = b.btnSkip; (b.items || []).forEach(function (r) { rects.push({ kind: 'hint', x: r.x, y: r.y, w: r.w, h: r.h }); }); ctx.globalAlpha = A; } else { g.btnReroll = g.btnSkip = null; }
      // owned strip; the picked card flies into its slot
      var flying = d.picked && (d.stage === 'pick') ? d.picked : null, ft = flying ? t - d.pickT - (PICK_PULSE + PICK_SHRINK) * k : -1;
      var st = strip(ctx, g, g.stripY, g.stripH, flying && ft < FLY * k ? flying.id : null, glowTags);
      if (st) rects.push({ kind: 'strip', x: st.rect.x, y: st.rect.y, w: st.rect.w, h: st.rect.h });
      if (flying && st && ft >= 0) {
        var slot = st.lay[order.indexOf(flying.id)] || st.lay[st.lay.length - 1], pf = c01(ft / (FLY * k)), e = eInOut(pf);
        var r0 = g.cards[flying.i], sx0 = r0.x + r0.w / 2, sy0 = r0.y + r0.h / 2 - (g.px ? 4 : 14 * U), ex = slot.x + slot.w / 2, ey = slot.y + slot.h / 2;
        var mx = lerp(sx0, ex, 0.5), my = Math.min(sy0, ey) - (g.px ? 30 : 70 * U);
        var fx = (1 - e) * (1 - e) * sx0 + 2 * (1 - e) * e * mx + e * e * ex, fy = (1 - e) * (1 - e) * sy0 + 2 * (1 - e) * e * my + e * e * ey;
        var ti = tagInfo(flying.u.icon), R2 = RARITY[flying.u.rarity];
        if (pf < 1) {
          if (g.px) {
            for (var tr = 1; tr <= 4; tr++) { var e2 = eInOut(c01(pf - tr * 0.05)); var tx2 = (1 - e2) * (1 - e2) * sx0 + 2 * (1 - e2) * e2 * mx + e2 * e2 * ex, ty2 = (1 - e2) * (1 - e2) * sy0 + 2 * (1 - e2) * e2 * my + e2 * e2 * ey; ctx.fillStyle = tr % 2 ? GOLD : R2.px.edge; ctx.fillRect(Math.round(tx2), Math.round(ty2), 2, 2); }
            var ic = pixelIcon(ti.icon, 13, ti.color); if (ic) ctx.drawImage(ic, Math.round(fx - ic.width / 2), Math.round(fy - ic.height / 2));
          } else {
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            for (var tr2 = 1; tr2 <= 10; tr2++) { var e3 = eInOut(c01(pf - tr2 * 0.025)); var tx3 = (1 - e3) * (1 - e3) * sx0 + 2 * (1 - e3) * e3 * mx + e3 * e3 * ex, ty3 = (1 - e3) * (1 - e3) * sy0 + 2 * (1 - e3) * e3 * my + e3 * e3 * ey;
              ctx.fillStyle = rgba(R2.glow, 0.5 * (1 - tr2 / 11)); ctx.beginPath(); ctx.arc(tx3, ty3, (9 - tr2 * 0.6) * U, 0, 7); ctx.fill(); }
            ctx.restore();
            var osz = lerp(58, 26, e) * U;
            ctx.save(); ctx.shadowColor = rgba(R2.glow, 0.9); ctx.shadowBlur = 18 * U * scaleOf(ctx);
            ctx.beginPath(); ctx.arc(fx, fy, osz / 2, 0, 7); var og = ctx.createRadialGradient(fx - osz * 0.15, fy - osz * 0.2, 1, fx, fy, osz / 2); og.addColorStop(0, shade(ti.color, 0.2)); og.addColorStop(0.6, R2.medal); og.addColorStop(1, '#0c0f1e'); ctx.fillStyle = og; ctx.fill();
            ctx.shadowBlur = 0; ctx.strokeStyle = R2.edge; ctx.lineWidth = 1.6 * U; ctx.stroke(); drawIcon(ctx, ti.icon, fx, fy, osz * 0.62, ti.color, true); ctx.restore();
          }
        } else {
          var age = ft - FLY * k;
          if (g.px) particlesPX(ctx, ex, ey, age, 300, 14, GOLD, 14, 77); else particlesHD(ctx, ex, ey, age, 420, 18, '255,214,107', 34 * U, U, 77);
          if (!g.px) { var ra = c01(age / 300); ctx.strokeStyle = 'rgba(255,214,107,' + (1 - ra).toFixed(3) + ')'; ctx.lineWidth = 2 * U; ctx.beginPath(); ctx.arc(ex, ey, (14 + 24 * eOut(ra)) * U, 0, 7); ctx.stroke(); }
        }
      }
      ctx.restore();
      ctx.restore();
      return rects;
    }
    function hudStrip(ctx, f) {                                          // strip: 'always' while no draft is open
      if (!order.length) return [];
      var px = isPixel(f), g = { f: f, px: px, U: px ? 1 : Math.min(f.w / 640, f.h / 360), cx: f.x + f.w / 2 };
      var sz = px ? 14 : Math.round(26 * g.U), gap = px ? 2 : 6 * g.U, n = order.length, w = n * sz + (n - 1) * gap + (px ? 0 : 12 * g.U), h = sz + (px ? 0 : 8 * g.U), m = px ? 3 : 8 * g.U;
      var key = n + '|' + f.w + 'x' + f.h;
      if (stripKey !== key) {
        stripKey = key; stripPos = null; var ui = uiList();
        var cands = [{ x: f.x + m, y: f.y + f.h - m - h }, { x: f.x + f.w - m - w, y: f.y + f.h - m - h }, { x: f.x + m, y: f.y + m }, { x: f.x + f.w - m - w, y: f.y + m }];
        for (var i = 0; i < cands.length; i++) { var r = { x: cands[i].x, y: cands[i].y, w: w, h: h }; if (!ui.some(function (u) { return hit(u, r); })) { stripPos = r; break; } }
        if (!stripPos) warnOnce('strip', 'no free corner for the owned-upgrades strip (every corner touches a UI rect); it is not drawn');
      }
      if (!stripPos) return [];
      var lay = stripLayout(g, n, stripPos.x + (px ? 0 : 6 * g.U), stripPos.y, n * sz + (n - 1) * gap, h);
      if (!px) { rr(ctx, stripPos.x, stripPos.y, stripPos.w, stripPos.h, 8 * g.U); ctx.fillStyle = 'rgba(8,10,22,0.6)'; ctx.fill(); }
      order.forEach(function (id, i) { drawSlot(ctx, g, id, lay[i], false, false, stripPop[id]); });
      return [{ kind: 'hudstrip', x: stripPos.x, y: stripPos.y, w: stripPos.w, h: stripPos.h }];
    }
    function draw(ctx, ox, oy) {
      drawnRects = [];
      if (!ctx) return;
      try {
        if (ctx.canvas) lastCanvas = { w: ctx.canvas.width, h: ctx.canvas.height };
        var f = field(); if (!f) return;
        ox = num(ox, 0); oy = num(oy, 0);
        ctx.save(); if (ox || oy) ctx.translate(ox, oy);
        if (W) {
          var g = geom(f, Math.max(1, W.cards.length), W.cards);
          W.geom = g; W.drawn = true;
          drawnRects = paint(ctx, W, g);
        } else if (P.strip === 'always') drawnRects = hudStrip(ctx, f);
        ctx.restore();
      } catch (e) { try { ctx.restore(); } catch (x) { } warnOnce('draw', 'draw error: ' + (e && e.stack || e)); }
    }

    function serialize() { return { v: 1, owned: Object.assign({}, owned), order: order.slice(), draws: draws }; }
    function restore(s) {
      try { if (typeof s === 'string') s = JSON.parse(s); } catch (e) { warnOnce('restore', 'restore(): not JSON'); return false; }
      if (!s || typeof s !== 'object' || !s.owned) return false;
      owned = {}; order = [];
      (Array.isArray(s.order) ? s.order : Object.keys(s.owned)).forEach(function (id) { var u = byId(id), n = Math.round(num(s.owned[id], 0)); if (!u || n <= 0) return; owned[u.id] = Math.min(n, u.max); if (order.indexOf(u.id) < 0) order.push(u.id); });
      draws = Math.max(0, Math.round(num(s.draws, 0))); stripKey = '';
      return true;
    }

    return {
      version: VERSION,
      open: open, busy: function () { return !!W || queue.length > 0; }, update: update, draw: draw, press: press, key: key, pointer: pointer, hitTest: hitTest,
      tap: function () { return press('confirm'); },
      stacks: function (id) { return owned[String(id)] || 0; }, has: function (id) { return (owned[String(id)] || 0) > 0; },
      owned: function () { return order.map(function (id) { var u = byId(id); return { id: id, name: u ? u.name : id, stacks: owned[id], max: u ? u.max : null, rarity: u ? u.rarity : null, tags: u ? u.tags.slice() : [], upgrade: u ? u.src : null }; }); },
      tagCount: function (tag) { var n = 0; order.forEach(function (id) { var u = byId(id); if (u && u.tags.indexOf(String(tag)) >= 0) n += owned[id]; }); return n; },
      peek: function (n) { return deal(TABLE, owned, P.seed, draws, 0, n || P.choices, weights(), FALLBACK).map(function (u) { return u.id; }); },
      hand: function () { return W ? W.cards.map(function (c) { return c.id; }) : null; },
      table: function () { return TABLE.map(function (u) { return { id: u.id, name: u.name, rarity: u.rarity, tags: u.tags.slice(), max: u.max, requires: u.requires.slice() }; }); },
      setTable: function (list) { setTable(list); PXC = {}; },
      drawStrip: function (ctx, x, y, opts) { try { var f = { x: x, y: y, w: 1e4, h: 1 }, px = opts && opts.pixel != null ? !!opts.pixel : P.look === 'pixel'; var g = { f: f, px: px, U: (opts && opts.scale) || 1, cx: x }; var sz = px ? 14 : Math.round(26 * g.U), gap = px ? 2 : 6 * g.U; order.forEach(function (id, i) { drawSlot(ctx, g, id, { x: x + i * (sz + gap), y: y, w: sz, h: sz }, false, false, stripPop[id]); }); return order.length * (sz + gap) - gap; } catch (e) { return 0; } },
      state: function () { if (!W) return null; return { id: W.id, stage: W.stage, t: Math.round(W.t), cursor: W.cursor, hand: W.cards.map(function (c) { return c.id; }), rarities: W.cards.map(function (c) { return c.u.rarity; }), synergy: W.cards.map(function (c) { return c.syn.count; }), rerollsLeft: W.rerollsLeft, reroll: W.reroll, skip: W.skip, auto: W.auto, picked: W.picked ? W.picked.id : null, draw: W.drawNo, autoPick: W.autoPickI }; },
      rect: function () { if (!W || !W.geom) return null; var g = W.geom; return { x: g.f.x, y: g.f.y, w: g.f.w, h: g.f.h }; },
      lastResult: function () { return last; }, lastDrawn: function () { return drawnRects.slice(); },
      layout: function () { return { stage: W ? W.stage : null, px: !!(W && W.geom && W.geom.px), rects: drawnRects.map(function (r) { return Object.assign({}, r); }) }; },
      end: function () { if (!W) return false; queue = []; W.picked = W.picked || null; finish('end'); return true; },
      clear: function () { W = null; queue = []; inbox = []; held = {}; drawnRects = []; },
      reset: function () { W = null; queue = []; inbox = []; owned = {}; order = []; draws = 0; drawnRects = []; stripKey = ''; stripPop = {}; },
      auto: function (on) { if (!W) return false; W.auto = on !== false; return true; },
      serialize: serialize, restore: restore,
      setParams: function (p) { setParams(p); PXC = {}; WR = {}; }, params: function () { var c = {}; for (var k in DEFAULTS) c[k] = P[k]; return c; },
      recommend: function () { return W ? W.autoPickI : -1; }
    };
  }

  root.GameDNA_UpgradeDraft = {
    version: VERSION, create: create, defaults: DEFAULTS, tags: Object.keys(TAGS), rarities: RAR.slice(),
    // pure: the hand a draft would deal: deal(table, owned {id: stacks}, {seed, draw (0-based draft number), reroll, n, wCommon, wRare, wEpic, maxStacks, fallback})
    deal: function (table, owned, opt) {
      opt = opt || {};
      var P0 = { maxStacks: num(opt.maxStacks, DEFAULTS.maxStacks) }, T = normalize(table, P0, function () { }), fb = opt.fallback ? normalize([opt.fallback], P0, function () { })[0] : null; if (fb) fb.max = 1e9;
      var w = { common: num(opt.wCommon, DEFAULTS.wCommon), rare: num(opt.wRare, DEFAULTS.wRare), epic: num(opt.wEpic, DEFAULTS.wEpic) };
      return deal(T, owned || {}, opt.seed == null ? DEFAULTS.seed : opt.seed, opt.draw || 0, opt.reroll || 0, opt.n || opt.choices || DEFAULTS.choices, w, fb).map(function (u) { return u.id; });
    },
    icon: function (ctx, tag, x, y, size, pixel) { try { var ti = tagInfo(tag); if (pixel) { var c = pixelIcon(ti.icon, Math.round(size), ti.color); if (c) ctx.drawImage(c, Math.round(x - c.width / 2), Math.round(y - c.height / 2)); } else drawIcon(ctx, ti.icon, x, y, size, ti.color, true); } catch (e) { } }
  };
})(typeof window !== 'undefined' ? window : this);
