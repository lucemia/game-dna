/* GameDNA G-01 · Shop & inventory grid · module v1 (plain script, no dependencies, one global: GameDNA_ShopInventory)
 *
 *   const shop = GameDNA_ShopInventory.create({
 *     view: { w: 256, h: 224 },                       // or bounds: { x, y, w, h } (the window stays inside it)
 *     items: { herb: { name: 'Herb', kind: 'consumable', price: 8, stats: { hp: 10 }, icon: 'herb' }, ... },
 *     startItems: { herb: 2 },                        // the bag at the start (module-owned; serialize()/restore() for saves)
 *     getGold: () => gold, setGold: n => { gold = n },  // the ONLY way the module changes your gold
 *     getParty: () => [{ id: 'hero', name: 'Hero' }],  // optional (default: one member)
 *     getEquipped: (memberId, slot) => itemIdOrNull,   // optional: what that member wears in that slot now
 *     onEquip: (memberId, itemId, slot, oldId) => {},  // optional: apply the stats (return false to refuse)
 *     onUse: (itemId, memberId, item) => true,         // optional: apply the effect; false or a short reason = not used
 *     autoplay: () => AUTOPLAY, uiRects: () => [hud]   // optional
 *   });
 *   shop.open({ name: 'Village Shop', stock: ['herb', 'bronze-sword'], onClose: r => {} })   // or open({ tabs: ['bag'] })
 *   shop.busy()               // true from open() until the window has closed: route keys here, pause the world
 *   shop.key(code, down)      // arrows, Z/Space/Enter, X/Esc, Q/E/Tab; or press('up'|'down'|'left'|'right'|'ok'|'back'|'tab'), tap(x, y)
 *   shop.update(dtMs)         // the only clock (fixed step): purchases and callbacks happen here, so ?t=&freeze=1 is deterministic
 *   shop.draw(ctx)            // native-resolution 2D context, last in the draw pass
 *   onClose result = { bought, sold, used, equipped, spent, earned, gold, auto, id }  (synchronous, inside update())
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var DEFAULTS = { capacity: 20, cols: 5, stack: 9, sellRatio: 0.5, qty: 'on', compare: 'on', tooltip: 'on', equipAfterBuy: 'on',
    autoBuy: 'best', tint: 'a', dim: 0.35, width: 0, height: 0, margin: 4, openMs: 120, autoplayMs: 260, currency: 'G' };
  var CELL = 18, ROW = 18, LH = 10, REPEAT_MS = 280, REPEAT_EVERY = 80;
  var KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Up: 'up', Down: 'down', Left: 'left', Right: 'right',
    KeyZ: 'ok', z: 'ok', Z: 'ok', Space: 'ok', ' ': 'ok', Enter: 'ok', NumpadEnter: 'ok',
    KeyX: 'back', x: 'back', X: 'back', Escape: 'back', Esc: 'back', Backspace: 'back',
    Tab: 'tab', KeyE: 'tab', e: 'tab', E: 'tab', PageDown: 'tab', KeyQ: 'tabPrev', q: 'tabPrev', Q: 'tabPrev', PageUp: 'tabPrev' };
  var SLOT_OF = { weapon: 'weapon', armor: 'armor', body: 'armor', shield: 'shield', head: 'head', helmet: 'head', accessory: 'accessory', ring: 'accessory' };
  var ICON_OF = { weapon: 'sword', armor: 'armor', body: 'armor', shield: 'shield', head: 'helmet', helmet: 'helmet', accessory: 'ring', ring: 'ring',
    consumable: 'potion', key: 'key', material: 'gem' };
  var STAT_ORDER = ['atk', 'def', 'mag', 'res', 'spd', 'agi', 'luck', 'hp', 'mp'];
  var TAB_LABEL = { buy: 'BUY', sell: 'SELL', bag: 'BAG' };

  /* ---------- 6x8 proportional font (the C-03 'regular' glyphs; '#' = ink) ---------- */
  var REGULAR = {
    '!': '# # # # # . #', '"': '#.# #.#', '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.', '%': '##... ##..# ...#. ..#.. .#... #..## ...##',
    '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#', "'": '# #', '(': '..# .#. #.. #.. #.. .#. ..#', ')': '#.. .#. ..# ..# ..# .#. #..',
    '+': '..... ..#.. ..#.. ##### ..#.. ..#..', ',': '.. .. .. .. .. ## .# #.', '-': '.... .... .... ####', '.': '.. .. .. .. .. ## ##',
    '/': '....# ...#. ...#. ..#.. .#... .#... #....', '0': '.###. #...# #..## #.#.# ##..# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
    '2': '.###. #...# ....# ...#. ..#.. .#... #####', '3': '####. ....# ....# .###. ....# ....# ####.', '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
    '5': '##### #.... ####. ....# ....# #...# .###.', '6': '..##. .#... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. .#... .#... .#...',
    '8': '.###. #...# #...# .###. #...# #...# .###.', '9': '.###. #...# #...# .#### ....# ...#. .##..', ':': '.. ## ## .. .. ## ##',
    '<': '...# ..#. .#.. #... .#.. ..#. ...#', '=': '.... .... #### .... ####', '>': '#... .#.. ..#. ...# ..#. .#.. #...', '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
    'A': '.###. #...# #...# ##### #...# #...# #...#', 'B': '####. #...# #...# ####. #...# #...# ####.', 'C': '.###. #...# #.... #.... #.... #...# .###.',
    'D': '###.. #..#. #...# #...# #...# #..#. ###..', 'E': '##### #.... #.... ####. #.... #.... #####', 'F': '##### #.... #.... ####. #.... #.... #....',
    'G': '.###. #...# #.... #.### #...# #...# .####', 'H': '#...# #...# #...# ##### #...# #...# #...#', 'I': '### .#. .#. .#. .#. .#. ###',
    'J': '..### ...#. ...#. ...#. #..#. #..#. .##..', 'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#', 'L': '#... #... #... #... #... #... ####',
    'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#', 'N': '#...# ##..# #.#.# #..## #...# #...# #...#', 'O': '.###. #...# #...# #...# #...# #...# .###.',
    'P': '####. #...# #...# ####. #.... #.... #....', 'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#', 'R': '####. #...# #...# ####. #.#.. #..#. #...#',
    'S': '.#### #.... #.... .###. ....# ....# ####.', 'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..', 'U': '#...# #...# #...# #...# #...# #...# .###.',
    'V': '#...# #...# #...# #...# #...# .#.#. ..#..', 'W': '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.', 'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', 'Z': '##### ....# ...#. ..#.. .#... #.... #####', '[': '### #.. #.. #.. #.. #.. ###', ']': '### ..# ..# ..# ..# ..# ###',
    'a': '.... .... .##. ...# .### #..# .###', 'b': '#... #... ###. #..# #..# #..# ###.', 'c': '.... .... .### #... #... #... .###',
    'd': '...# ...# .### #..# #..# #..# .###', 'e': '.... .... .##. #..# #### #... .###', 'f': '..## .#.. #### .#.. .#.. .#.. .#..',
    'g': '.... .... .### #..# #..# .### ...# ###.', 'h': '#... #... ###. #..# #..# #..# #..#', 'i': '# . # # # # #', 'j': '..# ... .## ..# ..# ..# ..# ##.',
    'k': '#... #... #..# #.#. ##.. #.#. #..#', 'l': '#. #. #. #. #. #. .#', 'm': '..... ..... ##.#. #.#.# #.#.# #.#.# #.#.#', 'n': '.... .... ###. #..# #..# #..# #..#',
    'o': '.... .... .##. #..# #..# #..# .##.', 'p': '.... .... ###. #..# #..# ###. #... #...', 'q': '.... .... .### #..# #..# .### ...# ...#',
    'r': '.... .... #.## ##.. #... #... #...', 's': '.... .... .### #... .##. ...# ###.', 't': '.#. .#. ### .#. .#. .#. ..#', 'u': '.... .... #..# #..# #..# #..# .###',
    'v': '..... ..... #...# #...# .#.#. .#.#. ..#..', 'w': '..... ..... #...# #...# #.#.# #.#.# .#.#.', 'x': '..... ..... #...# .#.#. ..#.. .#.#. #...#',
    'y': '.... .... #..# #..# #..# .### ...# ###.', 'z': '.... .... #### ...# .##. #... ####', '·': '. . . #', '�': '##### #...# #...# #...# #...# #...# #####'
  };
  var GL = {};
  function glyph(ch) {
    if (GL[ch]) return GL[ch];
    var src = REGULAR[ch]; if (src == null) src = REGULAR['�'];
    var rows = src.split(' '), w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);
    return (GL[ch] = { rows: rows, w: w });
  }
  function advOf(ch) { return ch === ' ' ? 4 : glyph(ch).w + 1; }

  /* ---------- built-in pixel16 look (used when skin-api.js is not loaded) ---------- */
  var WIN = {
    a: ['#3a64d8', '#2c50b8', '#223e96', '#1a2e74', '#a8c8ff', '#0a1238'],
    b: ['#d85a48', '#b8402e', '#922c26', '#6a1c1e', '#ffc8b8', '#2a0608'],
    n: ['#4c5a8a', '#3e4a76', '#323c62', '#262e4e', '#c8d4f4', '#0a0e22']
  };
  var FB = { ink: '#06061a', 'text.main': '#ffffff', 'text.shadow': '#0a0c24', 'text.gold': '#ffe890', 'text.accent': '#ffe070', 'text.dim': '#8088a8',
    'text.label': '#b8d0ff', 'text.select': '#fff4c0', 'text.pointer': '#fff8e8', 'text.pointerEdge': '#1a0e08', 'fx.heal': '#4ad870', 'fx.hot': '#ff7a3a',
    'fx.crit': '#ffb43a', 'ui.plate': '#1c2458', 'ui.plateLight': '#5a6ac0', 'ui.plateEdge': '#0a0c24', 'ui.rivet': '#ffe070', 'ui.rivetShade': '#7a5410',
    'ui.select': 'rgba(255,255,255,0.2)', 'ui.well': 'rgba(6,8,30,0.4)', 'cursor.light': '#fff6c0', 'cursor.base': '#f0b830', 'cursor.edge': '#24100a' };
  var UP_COL = '#5aec6a', DOWN_COL = '#ff5a4a';

  /* ---------- original 16x16 item icons, drawn procedurally (shaded ramps dark -> light, automatic 1 px ink outline) ---------- */
  var RAMP = {
    iron: ['#3a4250', '#6a7488', '#a8b4c8', '#eef4ff'], bronze: ['#6a3a1a', '#a8642a', '#d89a4a', '#ffe0a0'], silver: ['#4a5068', '#8a94b0', '#c8d0e8', '#ffffff'],
    gold: ['#7a4a10', '#c88a20', '#f0c040', '#fff4b0'], mythril: ['#1a4a6a', '#2a8ab0', '#6ad0f0', '#e0fcff'], wood: ['#4a2a14', '#7a4a24', '#a8703a', '#d8a868'],
    leather: ['#4a2a18', '#7a4a2a', '#a8703e', '#d0a070'], red: ['#6a1018', '#b82a2a', '#f05a4a', '#ffc0a8'], blue: ['#14205a', '#2a50b8', '#5a90f0', '#c0e0ff'],
    green: ['#14401a', '#2a8a3a', '#5ac85a', '#c8f8a0'], purple: ['#3a1450', '#7a3aa8', '#b070e0', '#ecc8ff'], cloth: ['#6a6478', '#a8a4b8', '#dcd8e8', '#ffffff'],
    dark: ['#14141e', '#2a2a3a', '#4a4a5e', '#8a8aa0'], bread: ['#6a3a14', '#b0702a', '#e0a850', '#ffe0a0'], glass: ['#5a6a8a', '#9aaac8', '#d0dcf0', '#ffffff']
  };
  function ramp(n, d) { return RAMP[n] || RAMP[d] || RAMP.iron; }
  var ICONS = {
    sword: function (P, M, A) {
      for (var i = 0; i < 8; i++) { P.px(13 - i, 2 + i, M[2]); if (i) { P.px(14 - i, 2 + i, M[1]); P.px(13 - i, 1 + i, M[3]); } }
      P.px(14, 1, M[3]); P.line(3, 8, 7, 12, A[2]); P.px(3, 8, A[3]); P.px(7, 12, A[1]);
      P.px(4, 11, RAMP.wood[1]); P.px(3, 12, RAMP.wood[2]); P.px(2, 13, RAMP.wood[1]); P.px(1, 14, A[2]); P.px(2, 14, A[1]); P.px(1, 13, A[3]);
    },
    dagger: function (P, M, A) {
      for (var i = 0; i < 5; i++) { P.px(12 - i, 3 + i, M[2]); if (i) { P.px(13 - i, 3 + i, M[1]); P.px(12 - i, 2 + i, M[3]); } }
      P.px(13, 2, M[3]); P.line(5, 6, 9, 10, A[2]); P.px(5, 6, A[3]);
      P.px(6, 9, RAMP.leather[1]); P.px(5, 10, RAMP.leather[2]); P.px(4, 11, RAMP.leather[1]); P.px(3, 12, A[2]); P.px(3, 11, A[3]);
    },
    axe: function (P, M, A) {
      P.line(3, 14, 11, 6, RAMP.wood[1]); P.line(2, 14, 10, 6, RAMP.wood[2]); P.px(3, 14, RAMP.wood[0]);
      for (var y = -4; y <= 4; y++) for (var x = 0; x <= 5; x++) {
        var d = Math.sqrt(x * x * 1.1 + y * y); if (d > 4.6) continue;
        P.px(10 + x, 5 + y, d > 3.6 ? M[3] : (x + y < 1 ? M[2] : M[1]));
      }
      P.px(10, 5, M[0]); P.px(9, 6, M[0]); P.px(8, 4, M[1]); P.px(7, 5, M[1]);
    },
    spear: function (P, M, A) {
      P.line(2, 14, 10, 6, RAMP.wood[1]); P.line(2, 13, 9, 6, RAMP.wood[2]);
      P.px(10, 5, A[2]); P.px(11, 6, A[1]); P.px(9, 6, A[3]);
      P.px(11, 4, M[2]); P.px(12, 3, M[2]); P.px(13, 2, M[3]); P.px(14, 1, M[3]); P.px(12, 4, M[1]); P.px(13, 3, M[1]); P.px(11, 3, M[3]); P.px(12, 2, M[3]); P.px(13, 4, M[0]); P.px(10, 3, M[2]);
    },
    bow: function (P, M, A) {
      for (var a = -62; a <= 62; a += 4) {
        var r = a * Math.PI / 180, x = Math.round(1 + 11 * Math.cos(r)), y = Math.round(8 + 7.4 * Math.sin(r));
        P.px(x, y, M[2]); P.px(x - 1, y, M[1]);
      }
      P.line(6, 2, 6, 14, RAMP.cloth[2]); P.rect(10, 7, 2, 3, A[2]); P.px(10, 7, A[3]);
    },
    staff: function (P, M, A) {
      P.line(3, 14, 10, 7, RAMP.wood[1]); P.line(3, 13, 9, 7, RAMP.wood[2]);
      P.disc(11.5, 4.5, 2.6, A); P.px(10, 3, '#ffffff'); P.px(9, 7, RAMP.gold[2]); P.px(11, 8, RAMP.gold[1]); P.px(8, 5, RAMP.gold[2]);
    },
    shield: function (P, M, A) {
      for (var y = 2; y <= 14; y++) {
        var hw = y <= 8 ? 6 : Math.max(0, Math.round(6 - (y - 8) * 0.95));
        for (var x = 8 - hw; x <= 7 + hw; x++) {
          var rim = x === 8 - hw || x === 7 + hw || y === 2;
          P.px(x, y, rim ? (x < 8 ? M[3] : M[1]) : (x < 6 ? A[2] : x < 10 ? A[1] : A[0]));
        }
      }
      for (y = 4; y <= 11; y++) P.px(7, y, RAMP.gold[2]), P.px(8, y, RAMP.gold[1]);
      P.rect(5, 6, 6, 1, RAMP.gold[2]); P.px(4, 3, A[3]); P.px(5, 3, A[3]);
    },
    helmet: function (P, M, A) {
      for (var y = 3; y <= 12; y++) {
        var hw = y < 7 ? Math.round(Math.sqrt(Math.max(0, 25 - (7 - y) * (7 - y) * 1.6))) + 1 : 6;
        for (var x = 8 - hw; x <= 7 + hw; x++) P.px(x, y, x < 6 ? M[2] : x < 10 ? M[1] : M[0]);
      }
      P.rect(4, 8, 8, 1, M[0]); P.rect(4, 9, 3, 1, '#14141e'); P.rect(9, 9, 3, 1, '#14141e'); P.rect(7, 8, 2, 5, M[2]);
      P.px(5, 4, M[3]); P.px(6, 4, M[3]); P.px(5, 5, M[3]); P.rect(7, 1, 2, 2, A[2]);
    },
    armor: function (P, M, A) {
      for (var y = 3; y <= 13; y++) {
        var x0 = y < 6 ? 2 : 4, x1 = y < 6 ? 13 : 11;
        for (var x = x0; x <= x1; x++) P.px(x, y, x < 6 ? M[2] : x < 10 ? M[1] : M[0]);
      }
      P.rect(6, 3, 4, 2, null); P.rect(6, 5, 4, 1, M[0]); P.rect(4, 10, 8, 1, A[2]); P.px(8, 10, A[3]);
      P.px(3, 4, M[3]); P.px(4, 4, M[3]); P.px(5, 7, M[3]); P.px(5, 8, M[3]);
    },
    boots: function (P, M, A) {
      P.rect(4, 2, 5, 9, M[1]); P.rect(4, 2, 2, 9, M[2]); P.rect(4, 10, 9, 3, M[1]); P.rect(4, 10, 3, 2, M[2]); P.rect(11, 11, 2, 2, M[0]);
      P.rect(4, 13, 9, 1, RAMP.dark[1]); P.rect(4, 2, 5, 1, A[2]); P.px(4, 3, M[3]);
    },
    ring: function (P, M, A) {
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        var d = Math.sqrt((x - 7.5) * (x - 7.5) + (y - 9.5) * (y - 9.5) * 1.3);
        if (d >= 3 && d <= 5) P.px(x, y, x + y < 15 ? M[3] : x + y < 19 ? M[2] : M[1]);
      }
      P.disc(7.5, 4.2, 2.2, A); P.px(6, 3, '#ffffff');
    },
    amulet: function (P, M, A) {
      for (var i = 0; i < 6; i++) { if (i % 2 === 0) { P.px(3 + i, 1 + i, M[2]); P.px(12 - i, 1 + i, M[2]); } else { P.px(3 + i, 1 + i, M[1]); P.px(12 - i, 1 + i, M[1]); } }
      P.disc(7.5, 10.5, 3.6, M); P.disc(7.5, 10.5, 2.2, A); P.px(6, 9, '#ffffff');
    },
    potion: function (P, M, A) {
      var L = A, G = RAMP.glass;
      P.rect(7, 1, 2, 2, RAMP.leather[2]); P.rect(6, 3, 4, 3, G[1]); P.px(6, 3, G[2]);
      for (var y = 5; y <= 14; y++) for (var x = 2; x <= 13; x++) {
        var d = Math.sqrt((x - 7.5) * (x - 7.5) + (y - 10) * (y - 10)); if (d > 4.9) continue;
        P.px(x, y, y < 8 ? (x < 7 ? G[2] : G[1]) : (x + y < 15 ? L[3] : x + y < 19 ? L[2] : x + y < 22 ? L[1] : L[0]));
      }
      P.px(5, 8, '#ffffff'); P.px(5, 9, '#ffffff'); P.px(4, 10, L[3]);
    },
    herb: function (P, M, A) {
      P.line(8, 14, 8, 6, M[0]); P.line(7, 13, 9, 13, M[0]);
      var leaf = function (cx, cy, rx, ry) { for (var y = -ry; y <= ry; y++) for (var x = -rx; x <= rx; x++) if ((x * x) / (rx * rx + 0.4) + (y * y) / (ry * ry + 0.4) <= 1) P.px(cx + x, cy + y, x + y < -1 ? M[3] : x + y < 1 ? M[2] : M[1]); };
      leaf(5, 8, 2, 3); leaf(11, 6, 2, 3); leaf(8, 3, 1, 2); P.line(5, 8, 8, 10, M[0]); P.line(11, 6, 8, 9, M[0]); P.px(4, 6, M[3]);
      P.px(8, 1, A[2]); P.px(7, 2, A[3]);
    },
    bread: function (P, M, A) {
      for (var y = 5; y <= 13; y++) for (var x = 1; x <= 14; x++) {
        var d = ((x - 7.5) * (x - 7.5)) / 44 + ((y - 9.5) * (y - 9.5)) / 16; if (d > 1) continue;
        P.px(x, y, y > 11 ? M[0] : x + y < 12 ? M[3] : x + y < 18 ? M[2] : M[1]);
      }
      P.line(4, 9, 5, 7, M[1]); P.line(7, 9, 8, 7, M[1]); P.line(10, 9, 11, 7, M[1]);
    },
    key: function (P, M, A) {
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) { var d = Math.sqrt((x - 4.5) * (x - 4.5) + (y - 4.5) * (y - 4.5)); if (d >= 1.5 && d <= 3.6) P.px(x, y, x + y < 8 ? M[3] : x + y < 10 ? M[2] : M[1]); }
      P.line(7, 7, 13, 13, M[2]); P.line(8, 7, 14, 13, M[1]); P.px(11, 13, M[1]); P.px(10, 14, M[1]); P.px(13, 10, M[1]); P.px(14, 10, M[1]);
    },
    gem: function (P, M, A) {
      for (var y = 3; y <= 13; y++) {
        var hw = y <= 5 ? 3 + (y - 3) * 2 : Math.max(0, 7 - Math.round((y - 5) * 0.9));
        for (var x = 8 - hw; x <= 7 + hw; x++) P.px(x, y, y <= 5 ? (x < 8 ? A[3] : A[2]) : (x < 6 ? A[2] : x < 8 ? A[1] : x < 10 ? A[2] : A[0]));
      }
      P.px(5, 4, '#ffffff'); P.px(6, 7, '#ffffff');
    },
    scroll: function (P, M, A) {
      P.rect(3, 4, 10, 8, M[2]); P.rect(3, 4, 10, 1, M[3]); P.rect(3, 11, 10, 1, M[1]);
      P.rect(1, 3, 3, 10, M[1]); P.rect(1, 3, 1, 10, M[2]); P.rect(12, 3, 3, 10, M[1]); P.rect(14, 3, 1, 10, M[0]);
      P.rect(5, 6, 6, 1, M[0]); P.rect(5, 8, 4, 1, M[0]); P.rect(7, 9, 3, 3, A[2]); P.px(7, 9, A[3]);
    },
    bomb: function (P, M, A) {
      P.disc(7, 9.5, 5, RAMP.dark); P.px(5, 7, '#ffffff'); P.px(4, 8, RAMP.dark[3]);
      P.rect(9, 3, 3, 2, RAMP.iron[1]); P.px(12, 2, RAMP.wood[2]); P.px(13, 1, A[3]); P.px(14, 1, A[2]); P.px(13, 0, A[2]);
    }
  };
  var ICON_DEF = { sword: ['iron', 'gold'], dagger: ['iron', 'gold'], axe: ['iron', 'gold'], spear: ['iron', 'gold'], bow: ['wood', 'leather'], staff: ['wood', 'blue'],
    shield: ['iron', 'blue'], helmet: ['iron', 'red'], armor: ['iron', 'gold'], boots: ['leather', 'gold'], ring: ['gold', 'red'], amulet: ['gold', 'blue'],
    potion: ['glass', 'red'], herb: ['green', 'red'], bread: ['bread', 'bread'], key: ['gold', 'gold'], gem: ['cloth', 'blue'], scroll: ['cloth', 'red'], bomb: ['dark', 'gold'] };
  var ICACHE = {};
  function iconPixels(kind, color, accent) {
    var key = kind + '|' + (color || '') + '|' + (accent || '');
    if (ICACHE[key]) return ICACHE[key];
    var fn = ICONS[kind] || ICONS.gem, def = ICON_DEF[ICONS[kind] ? kind : 'gem'];
    var buf = new Array(256), M = ramp(color, def[0]), A = ramp(accent, def[1]);
    var P = {
      px: function (x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < 16 && y < 16) buf[y * 16 + x] = c || null; },
      rect: function (x, y, w, h, c) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) P.px(x + i, y + j, c); },
      line: function (x0, y0, x1, y1, c) { var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy, n = 0;
        while (n++ < 64) { P.px(x0, y0, c); if (x0 === x1 && y0 === y1) break; var e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } },
      disc: function (cx, cy, r, R) { for (var y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (var x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        var dx = x - cx, dy = y - cy; if (dx * dx + dy * dy > r * r) continue; var s = (dx + dy) / r; P.px(x, y, s < -0.6 ? R[3] : s < 0 ? R[2] : s < 0.7 ? R[1] : R[0]); } }
    };
    try { fn(P, M, A); } catch (e) { }
    var out = buf.slice();
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {               // 1 px outline around every opaque pixel
      if (buf[y * 16 + x]) continue;
      if ((x > 0 && buf[y * 16 + x - 1]) || (x < 15 && buf[y * 16 + x + 1]) || (y > 0 && buf[(y - 1) * 16 + x]) || (y < 15 && buf[(y + 1) * 16 + x])) out[y * 16 + x] = 'INK';
    }
    return (ICACHE[key] = out);
  }
  var IMG = {};
  function drawIcon(ctx, kind, x, y, opts) {
    opts = opts || {}; kind = ICONS[kind] ? kind : (ICON_OF[kind] || 'gem');
    var ink = opts.ink || FB.ink, key = kind + '|' + (opts.color || '') + '|' + (opts.accent || '') + '|' + ink + '|' + (opts.grey ? 1 : 0), img = IMG[key];
    var px = iconPixels(kind, opts.color, opts.accent);
    if (img === undefined) {
      img = null;
      try {
        var c = root.document.createElement('canvas'); c.width = 16; c.height = 16; var g = c.getContext('2d');
        for (var i = 0; i < 256; i++) if (px[i]) { g.fillStyle = px[i] === 'INK' ? ink : opts.grey ? grey(px[i]) : px[i]; g.fillRect(i % 16, Math.floor(i / 16), 1, 1); }
        img = c;
      } catch (e) { img = null; }
      IMG[key] = img;
    }
    x = Math.round(x); y = Math.round(y);
    var sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    if (img) ctx.drawImage(img, x, y);
    else for (var j = 0; j < 256; j++) if (px[j]) { ctx.fillStyle = px[j] === 'INK' ? ink : px[j]; ctx.fillRect(x + j % 16, y + Math.floor(j / 16), 1, 1); }
    ctx.imageSmoothingEnabled = sm;
  }
  function grey(hex) { var n = parseInt(String(hex).slice(1), 16); if (!isFinite(n)) return hex; var v = Math.round(64 + (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.55 + (n & 255) * 0.15) * 0.55); return 'rgb(' + v + ',' + v + ',' + (v + 10) + ')'; }

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function okRect(r) { return r && isFinite(r.x) && isFinite(r.y) && r.w > 0 && r.h > 0; }
  function mkCanvas(w, h) { try { var c = root.document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; } catch (e) { return null; } }

  function create(o) {
    o = o || {};
    var API = root.GameDNA_Skin || null, SK = null;
    if (o.skin !== false) { try { SK = API && API.resolve ? API.resolve(o.skin) : null; } catch (e) { SK = null; } }
    var P = {}, warned = {}, lastCanvas = null, clock = 0, opens = 0;
    var ITEMS = {}, bag = [], stockLeft = {}, S = null, last = null, drawnRects = [], held = {}, queue = [];
    setParams(o.params || {});
    setItems(o.items);
    reset(o.startItems);

    function dbg(e) { if (typeof o.debug === 'function') { try { o.debug(e); } catch (x) { } } }
    function warnOnce(key, msg) { if (warned[key]) return; warned[key] = 1; try { if (root.console) console.warn('GameDNA_ShopInventory: ' + msg); } catch (e) { } }
    function call(fn, a, b, c, d) { if (typeof fn === 'function') { try { return fn(a, b, c, d); } catch (x) { warnOnce('cb', 'a host callback threw: ' + x); } } return undefined; }
    function setParams(p) {
      p = p || {};
      for (var k in p) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k) && p[k] != null && p[k] !== '') P[k] = p[k];
      for (k in DEFAULTS) if (P[k] == null) P[k] = DEFAULTS[k];
      for (k in DEFAULTS) if (typeof DEFAULTS[k] === 'number') P[k] = num(P[k], DEFAULTS[k]);
      P.capacity = clamp(Math.round(P.capacity), 1, 200); P.cols = clamp(Math.round(P.cols), 2, 12); P.stack = clamp(Math.round(P.stack), 1, 999);
      P.sellRatio = clamp(P.sellRatio, 0, 1); P.dim = clamp(P.dim, 0, 0.9); P.margin = clamp(Math.round(P.margin), 0, 64);
      P.openMs = clamp(P.openMs, 0, 1000); P.autoplayMs = clamp(P.autoplayMs, 0, 5000); P.width = clamp(Math.round(P.width), 0, 2000); P.height = clamp(Math.round(P.height), 0, 2000);
      if (S) S.relayout = true;
    }

    /* ---------- item table ---------- */
    function setItems(t) {
      ITEMS = {};
      if (Array.isArray(t)) t.forEach(function (it) { if (it && it.id != null) ITEMS[String(it.id)] = it; });
      else if (t && typeof t === 'object') for (var k in t) if (t[k] && typeof t[k] === 'object') { ITEMS[k] = t[k]; if (t[k].id == null) t[k].id = k; }
      if (!Object.keys(ITEMS).length) warnOnce('items', 'no items: pass items: { id: {name, kind, price, stats, stack, icon} }');
    }
    function item(id) { return id == null ? null : ITEMS[String(id)] || null; }
    function nameOf(id) { var it = item(id); return it ? String(it.name || it.id) : String(id); }
    function slotOf(it) { if (!it) return null; if (it.slot) return String(it.slot); return SLOT_OF[String(it.kind || '').toLowerCase()] || null; }
    function maxStack(id) { var it = item(id); if (!it) return 1; if (it.stack != null) return clamp(Math.round(num(it.stack, 1)), 1, 999); return slotOf(it) || String(it.kind || '').toLowerCase() === 'key' ? 1 : P.stack; }
    function price(id) { var it = item(id); return it ? Math.max(0, Math.round(num(it.price, 0))) : 0; }
    function sellPrice(id) { var it = item(id); if (!it || it.sell === false || String(it.kind) === 'key') return 0; if (it.sell != null && it.sell !== true) return Math.max(0, Math.round(num(it.sell, 0))); return Math.floor(price(id) * P.sellRatio); }
    function usable(it) { if (!it) return false; if (it.use === false) return false; return !!it.use || String(it.kind || '').toLowerCase() === 'consumable'; }
    function iconOf(it) { return it ? (it.icon || ICON_OF[String(it.kind || '').toLowerCase()] || 'gem') : 'gem'; }

    /* ---------- the bag (module-owned): a compact list of stacks, at most `capacity` stacks ---------- */
    function count(id) { var n = 0; id = String(id); for (var i = 0; i < bag.length; i++) if (bag[i].id === id) n += bag[i].n; return n; }
    function room(id) {                                              // how many of id still fit
      if (!item(id)) return 0;
      var m = maxStack(id), n = 0; id = String(id);
      for (var i = 0; i < bag.length; i++) if (bag[i].id === id) n += m - bag[i].n;
      return n + (P.capacity - bag.length) * m;
    }
    function changed(id, delta, reason) { if (delta) { dbg({ event: 'items', id: id, delta: delta, count: count(id), reason: reason }); call(o.onItems, { id: id, delta: delta, count: count(id), reason: reason }); } }
    function add(id, n, reason) {
      n = Math.max(0, Math.floor(num(n, 1))); if (!item(id)) { warnOnce('unk' + id, 'unknown item id "' + id + '" (not in items)'); return 0; }
      id = String(id); var m = maxStack(id), done = 0;
      for (var i = 0; i < bag.length && done < n; i++) if (bag[i].id === id && bag[i].n < m) { var k = Math.min(m - bag[i].n, n - done); bag[i].n += k; done += k; }
      while (done < n && bag.length < P.capacity) { var k2 = Math.min(m, n - done); bag.push({ id: id, n: k2 }); done += k2; }
      changed(id, done, reason || 'add');
      return done;
    }
    function remove(id, n, reason) {
      n = Math.max(0, Math.floor(num(n, 1))); id = String(id); var done = 0;
      for (var i = bag.length - 1; i >= 0 && done < n; i--) if (bag[i].id === id) { var k = Math.min(bag[i].n, n - done); bag[i].n -= k; done += k; if (!bag[i].n) bag.splice(i, 1); }
      changed(id, -done, reason || 'remove');
      return done;
    }
    function removeAt(idx, n, reason) {
      var s = bag[idx]; if (!s) return 0; var k = Math.min(s.n, Math.max(0, Math.floor(num(n, 1)))); s.n -= k; var id = s.id; if (!s.n) bag.splice(idx, 1);
      changed(id, -k, reason || 'remove'); return k;
    }
    function setCount(id, n) { n = Math.max(0, Math.floor(num(n, 0))); var c = count(id); if (n > c) add(id, n - c, 'set'); else if (n < c) remove(id, c - n, 'set'); return count(id); }
    function reset(start) {
      bag = [];
      if (Array.isArray(start)) start.forEach(function (e) { if (Array.isArray(e)) add(e[0], e[1], 'start'); else if (e && e.id != null) add(e.id, e.n == null ? 1 : e.n, 'start'); else if (e != null) add(e, 1, 'start'); });
      else if (start && typeof start === 'object') for (var k in start) add(k, start[k], 'start');
    }
    function serialize() {
      var sl = {}; for (var k in stockLeft) { sl[k] = {}; for (var j in stockLeft[k]) sl[k][j] = stockLeft[k][j]; }
      return { v: 1, bag: bag.map(function (s) { return [s.id, s.n]; }), stock: sl };
    }
    function restore(d) {
      if (!d || typeof d !== 'object') { warnOnce('restore', 'restore() got no data'); return false; }
      var list = Array.isArray(d) ? d : d.bag;
      bag = [];
      if (Array.isArray(list)) list.forEach(function (e) {
        var id = Array.isArray(e) ? e[0] : e && e.id, n = Array.isArray(e) ? e[1] : e && e.n;
        if (!item(id)) { warnOnce('rs' + id, 'restore(): unknown item "' + id + '" dropped'); return; }
        n = clamp(Math.floor(num(n, 0)), 0, maxStack(id)); if (n > 0 && bag.length < P.capacity) bag.push({ id: String(id), n: n });
      });
      stockLeft = {};
      if (d.stock && typeof d.stock === 'object') for (var k in d.stock) { stockLeft[k] = {}; for (var j in d.stock[k]) stockLeft[k][j] = Math.max(0, Math.floor(num(d.stock[k][j], 0))); }
      return true;
    }

    /* ---------- host data ---------- */
    function gold() { var g = num(call(o.getGold), NaN); if (!isFinite(g)) { warnOnce('gold', 'getGold() did not return a number; treated as 0'); return 0; } return Math.floor(g); }
    function setGold(n) { n = Math.max(0, Math.floor(num(n, 0))); call(o.setGold, n); return n; }
    function party() {
      var p = typeof o.getParty === 'function' ? call(o.getParty) : o.party, out = [];
      if (Array.isArray(p)) p.forEach(function (m, i) { if (m == null) return; if (typeof m !== 'object') m = { id: m, name: String(m) }; if (m.alive === false) return; out.push({ id: m.id != null ? m.id : i, name: String(m.name != null ? m.name : m.id != null ? m.id : 'Hero ' + (i + 1)), raw: m }); });
      if (!out.length) out.push({ id: 'hero', name: 'Hero', raw: null });
      return out;
    }
    function equipped(m, slot) {
      var v = typeof o.getEquipped === 'function' ? call(o.getEquipped, m.id, slot) : (m.raw && m.raw.equip ? m.raw.equip[slot] : null);
      return v == null || v === '' ? null : String(v);
    }
    function canEquip(m, it) {
      if (!it || !slotOf(it)) return false;
      if (typeof o.canEquip === 'function') { var r = call(o.canEquip, m.id, it); if (r != null) return !!r; }
      if (Array.isArray(it.who) && it.who.length) return it.who.some(function (w) { return String(w).toLowerCase() === String(m.id).toLowerCase() || String(w).toLowerCase() === m.name.toLowerCase(); });
      return true;
    }
    function statsOf(it) { var s = it && it.stats && typeof it.stats === 'object' ? it.stats : {}; return s; }
    function statKeys(a, b) {
      var ks = [], seen = {}; [statsOf(a), statsOf(b)].forEach(function (s) { for (var k in s) if (!seen[k] && isFinite(+s[k])) { seen[k] = 1; ks.push(k); } });
      ks.sort(function (x, y) { var i = STAT_ORDER.indexOf(x), j = STAT_ORDER.indexOf(y); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || (x < y ? -1 : 1); });
      return ks;
    }
    function deltas(m, it) {                                        // [{k, d}] of `it` against what m wears in that slot
      var cur = item(equipped(m, slotOf(it))), out = [];
      statKeys(it, cur).forEach(function (k) { out.push({ k: k, d: num(statsOf(it)[k], 0) - num(statsOf(cur)[k], 0) }); });
      return out;
    }
    function gain(m, it) { var s = 0; deltas(m, it).forEach(function (x) { s += x.d; }); return s; }
    function label(k) { k = String(k); return k.length <= 3 ? k.toUpperCase() : k.slice(0, 3).toUpperCase(); }

    /* ---------- skin-routed drawing primitives ---------- */
    function tok(path) { if (SK) { try { var v = SK.token(path); if (typeof v === 'string' && v !== path) return v; } catch (e) { } } return FB[path] || null; }
    function pixelSkin() { return !SK || SK.pixel !== false; }
    var MW = {};
    function cw(ch) {
      if (!pixelSkin()) { if (MW[ch] == null) { try { MW[ch] = Math.max(1, +SK.measure(ch, { font: 'ui' }) || 0); } catch (e) { MW[ch] = advOf(ch); } } return MW[ch]; }
      return advOf(ch);
    }
    function textW(s) { s = String(s == null ? '' : s); var w = 0; for (var i = 0; i < s.length; i++) w += cw(s[i]); return Math.max(0, w - 1); }
    function fit(s, w) { s = String(s == null ? '' : s); if (textW(s) <= w) return s; while (s.length > 1 && textW(s + '.') > w) s = s.slice(0, -1); return s + '.'; }
    var GC = {};
    function glyphImg(ch, col) {
      var key = ch + '|' + col; if (GC[key] !== undefined) return GC[key];
      var G = glyph(ch), c = mkCanvas(G.w, 8), g = c && c.getContext('2d');
      if (!g) return (GC[key] = null);
      g.fillStyle = col; for (var r = 0; r < G.rows.length; r++) for (var x = 0; x < G.rows[r].length; x++) if (G.rows[r][x] === '#') g.fillRect(x, r, 1, 1);
      return (GC[key] = c);
    }
    function blit(ctx, ch, x, y, col) {
      var img = glyphImg(ch, col); if (img) { ctx.drawImage(img, x, y); return; }
      var G = glyph(ch); ctx.fillStyle = col; for (var r = 0; r < G.rows.length; r++) for (var c = 0; c < G.rows[r].length; c++) if (G.rows[r][c] === '#') ctx.fillRect(x + c, y + r, 1, 1);
    }
    function text(ctx, s, x, y, col, align) {
      s = String(s == null ? '' : s); col = col || tok('text.main') || '#ffffff';
      var w = textW(s); x = Math.round(align === 'right' ? x - w : align === 'center' ? x - w / 2 : x); y = Math.round(y);
      if (!pixelSkin()) { try { SK.text(ctx, s, x, y, { font: 'ui', color: col }); } catch (e) { } return w; }
      var sh = tok('text.shadow') || '#0a0c24';
      for (var pass = 0; pass < 2; pass++) { var cx = x; for (var i = 0; i < s.length; i++) { if (s[i] !== ' ') blit(ctx, s[i], cx + (pass ? 0 : 1), y + (pass ? 0 : 1), pass ? col : sh); cx += advOf(s[i]); } }
      return w;
    }
    function frame16(ctx, r, team) {
      var x = r.x, y = r.y, w = r.w, h = r.h, C = WIN[team] || WIN.a, i, pa = ctx.globalAlpha;
      if (w < 6 || h < 6) { ctx.fillStyle = FB.ink; ctx.fillRect(x, y, w, h); return; }
      ctx.globalAlpha = pa * 0.96;
      for (i = 0; i < h - 2; i++) { ctx.fillStyle = C[Math.min(3, Math.floor(i / (h - 2) * 4))]; ctx.fillRect(x + 1, y + 1 + i, w - 2, 1); }
      ctx.globalAlpha = pa; ctx.fillStyle = FB.ink;
      ctx.fillRect(x + 2, y, w - 4, 1); ctx.fillRect(x + 2, y + h - 1, w - 4, 1); ctx.fillRect(x, y + 2, 1, h - 4); ctx.fillRect(x + w - 1, y + 2, 1, h - 4);
      ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + w - 2, y + 1, 1, 1); ctx.fillRect(x + 1, y + h - 2, 1, 1); ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
      ctx.fillStyle = C[4]; ctx.fillRect(x + 2, y + 1, w - 4, 1); ctx.fillRect(x + 1, y + 2, 1, h - 5);
      ctx.fillStyle = C[5]; ctx.fillRect(x + 2, y + h - 2, w - 4, 1); ctx.fillRect(x + w - 2, y + 2, 1, h - 4);
      if (h >= 12 && w >= 12) [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]].forEach(function (p) { ctx.fillStyle = FB['ui.rivetShade']; ctx.fillRect(p[0], p[1], 2, 2); ctx.fillStyle = FB['ui.rivet']; ctx.fillRect(p[0], p[1], 1, 1); });
    }
    function frame(ctx, r, role, team, extra) {
      if (SK) { try { var st = { role: role, team: team }; if (extra) for (var k in extra) st[k] = extra[k]; SK.frame(ctx, r, st); return; } catch (e) { } }
      if (role === 'row') { ctx.fillStyle = FB['ui.select']; ctx.fillRect(r.x, r.y, r.w, r.h); return; }
      if (role === 'backing') { ctx.fillStyle = FB['ui.well']; ctx.fillRect(r.x, r.y, r.w, r.h); return; }
      if (role === 'plate' || role === 'tooltip') { ctx.fillStyle = FB['ui.plateEdge']; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = FB['ui.plate']; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); ctx.fillStyle = FB['ui.plateLight']; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 1); return; }
      frame16(ctx, r, team);
    }
    function hand(ctx, x, y) {
      if (SK) { try { SK.cursor(ctx, { x: x, y: y, w: 7, h: 5 }, 'hand', clock / 1000, {}); return; } catch (e) { } }
      var hx = x + (Math.floor(clock / 250) % 2);
      ['.oo....', 'owwoooo', 'owwwwwo', 'owwwwo.', '.oooo..'].forEach(function (row, yy) { for (var xx = 0; xx < 7; xx++) if (row[xx] !== '.') { ctx.fillStyle = row[xx] === 'o' ? FB['text.pointerEdge'] : FB['text.pointer']; ctx.fillRect(hx + xx, y + yy, 1, 1); } });
    }
    function bracket(ctx, r) {
      if (SK) { try { SK.cursor(ctx, r, 'bracket', clock / 1000, {}); return; } catch (e) { } }
      var o1 = Math.floor(clock / 280) % 2 ? 0 : -1, x = r.x + o1, y = r.y + o1, w = r.w - 2 * o1, h = r.h - 2 * o1;
      ctx.fillStyle = FB['cursor.edge']; [[x - 1, y - 1, 6, 3], [x - 1, y - 1, 3, 6], [x + w - 5, y - 1, 6, 3], [x + w - 2, y - 1, 3, 6], [x - 1, y + h - 2, 6, 3], [x - 1, y + h - 5, 3, 6], [x + w - 5, y + h - 2, 6, 3], [x + w - 2, y + h - 5, 3, 6]].forEach(function (q) { ctx.fillRect(q[0], q[1], q[2], q[3]); });
      ctx.fillStyle = FB['cursor.light']; [[x, y, 4, 1], [x, y, 1, 4], [x + w - 4, y, 4, 1], [x + w - 1, y, 1, 4], [x, y + h - 1, 4, 1], [x, y + h - 4, 1, 4], [x + w - 4, y + h - 1, 4, 1], [x + w - 1, y + h - 4, 1, 4]].forEach(function (q) { ctx.fillRect(q[0], q[1], q[2], q[3]); });
    }
    function tri(ctx, x, y, up, col) {   // 5x3 arrow with a 1 px dark edge
      ctx.fillStyle = tok('text.shadow') || '#0a0c24';
      if (up) { ctx.fillRect(x + 1, y + 3, 5, 1); } else { ctx.fillRect(x + 3, y + 3, 1, 1); }
      ctx.fillStyle = col;
      if (up) { ctx.fillRect(x + 2, y, 1, 1); ctx.fillRect(x + 1, y + 1, 3, 1); ctx.fillRect(x, y + 2, 5, 1); }
      else { ctx.fillRect(x, y, 5, 1); ctx.fillRect(x + 1, y + 1, 3, 1); ctx.fillRect(x + 2, y + 2, 1, 1); }
    }
    function icon(ctx, it, x, y, dim) {
      var kind = iconOf(it), rect = { x: x, y: y, w: 16, h: 16 };
      if (SK && typeof SK.icon === 'function') { try { SK.icon(ctx, rect, kind, clock / 1000, { color: it && it.color, accent: it && it.accent, dim: !!dim }); return; } catch (e) { } }
      drawIcon(ctx, kind, x, y, { color: it && it.color, accent: it && it.accent, ink: tok('ink') || FB.ink, grey: !!dim });
    }
    function coin(ctx, x, y) {
      var G = RAMP.gold; ctx.fillStyle = tok('ink') || FB.ink; ctx.fillRect(x + 1, y, 5, 7); ctx.fillRect(x, y + 1, 7, 5);
      ctx.fillStyle = G[1]; ctx.fillRect(x + 1, y + 1, 5, 5); ctx.fillStyle = G[2]; ctx.fillRect(x + 1, y + 1, 4, 4); ctx.fillStyle = G[3]; ctx.fillRect(x + 2, y + 2, 1, 2); ctx.fillStyle = G[0]; ctx.fillRect(x + 4, y + 2, 1, 3);
    }

    /* ---------- field, placement, layout ---------- */
    function field() {
      var b = o.bounds;
      if (typeof b === 'function') b = call(b);
      if (!b && o.view) b = typeof o.view === 'function' ? call(o.view) : o.view;
      if (b && !(b.w > 0) && b.width > 0) b = { x: 0, y: 0, w: b.width, h: b.height };
      if (!b && lastCanvas) b = { x: 0, y: 0, w: lastCanvas.width, h: lastCanvas.height };
      if (!b || !(b.w > 0) || !(b.h > 0)) return null;
      return { x: num(b.x, 0), y: num(b.y, 0), w: b.w, h: b.h };
    }
    function uiRects() {
      var out = [];
      [call(o.getObstacles), call(o.uiRects)].forEach(function (L, j) { if (L && L.length) for (var i = 0; i < L.length; i++) { var r = L[i]; if (okRect(r) && (j === 1 || r.id == null)) out.push({ x: +r.x, y: +r.y, w: +r.w, h: +r.h }); } });
      return out;
    }
    function place() {
      var f = field(); if (!f) return null;
      var m = P.margin, U = uiRects();
      var W = Math.round(P.width > 0 ? Math.min(P.width, f.w) : Math.min(f.w - 2 * m, 248));
      var H0 = Math.round(P.height > 0 ? Math.min(P.height, f.h) : Math.min(f.h - 2 * m, 200));
      W = Math.max(Math.min(f.w, 160), W);
      var x = Math.round(f.x + (f.w - W) / 2);
      var clear = function (y, h) { var r = { x: x, y: y, w: W, h: h }; for (var i = 0; i < U.length; i++) if (hit(r, U[i])) return false; return true; };
      for (var h = H0; h >= 120; h -= 4) {                       // tallest window that fits beside your UI, nearest the field's centre
        var best = null, bd = 1e9, cy = f.y + f.h / 2;
        for (var y = f.y + Math.min(m, Math.max(0, f.h - h)); y + h <= f.y + f.h - Math.min(m, Math.max(0, f.h - h)) || y === f.y; y += 1) {
          if (clear(y, h)) { var d = Math.abs(y + h / 2 - cy); if (d < bd) { bd = d; best = y; } }
          if (y + h > f.y + f.h) break;
        }
        if (best != null) return { x: x, y: best, w: W, h: h, f: f };
      }
      var hh = Math.min(H0, f.h); dbg({ event: 'noroom' });
      warnOnce('noroom', 'no spot clear of your UI rects for a ' + W + 'x120 window; drawn over them. Check bounds / uiRects.');
      return { x: x, y: Math.round(f.y + (f.h - hh) / 2), w: W, h: hh, f: f };
    }
    function layout() {
      var B = place(); if (!B) { S.L = null; return; }
      var L = { B: B }, x = B.x, y = B.y, W = B.w, H = B.h;
      L.head = { x: x + 8, y: y + 6, w: W - 16, h: 10 };
      L.tabsY = y + 18;
      var gridW = P.cols * CELL, leftW = Math.max(gridW + 4, Math.min(118, Math.round(W * 0.46)));
      L.body = { x: x + 6, y: y + 32, w: W - 12, h: H - 32 - 17 };
      L.left = { x: x + 6, y: L.body.y, w: leftW, h: L.body.h };
      L.right = { x: x + 6 + leftW + 4, y: L.body.y, w: W - 12 - leftW - 4, h: L.body.h };
      L.foot = { x: x + 8, y: y + H - 14, w: W - 16, h: 10 };
      L.rowsVis = Math.max(1, Math.floor((L.left.h - 4) / ROW));
      L.gridRowsVis = Math.max(1, Math.floor((L.left.h - 4) / CELL));
      L.gridX = L.left.x + Math.floor((leftW - gridW) / 2);
      S.L = L; S.relayout = false;
    }

    /* ---------- the open window ---------- */
    function stockList() {
      var out = []; if (!S) return out;
      var st = S.stock || [], key = S.id;
      st.forEach(function (e, i) {
        var id = e && typeof e === 'object' ? e.id : e; if (!item(id)) { warnOnce('stock' + id, 'stock has unknown item "' + id + '"'); return; }
        id = String(id); var qty = e && typeof e === 'object' && e.qty != null ? Math.max(0, Math.floor(num(e.qty, 0))) : null;
        var left = qty == null ? null : (stockLeft[key] && stockLeft[key][id] != null ? stockLeft[key][id] : qty);
        out.push({ id: id, price: e && typeof e === 'object' && e.price != null ? Math.max(0, Math.round(num(e.price, 0))) : price(id), left: left });
      });
      return out;
    }
    function open(opts) {
      opts = opts || {};
      if (S) { dbg({ event: 'ignored' }); return false; }
      var tabs = Array.isArray(opts.tabs) ? opts.tabs.filter(function (t) { return TAB_LABEL[t]; }) : null;
      if (!tabs || !tabs.length) tabs = opts.stock && opts.stock.length ? ['buy', 'sell', 'bag'] : ['bag'];
      var auto = opts.auto != null ? !!opts.auto : typeof o.autoplay === 'function' ? !!call(o.autoplay) : !!o.autoplay;
      S = { id: String(opts.id || opts.name || 'shop'), n: ++opens, name: String(opts.name || (tabs.length === 1 && tabs[0] === 'bag' ? 'Bag' : 'Shop')), stock: opts.stock || [], tabs: tabs,
        tab: tabs.indexOf(opts.tab) >= 0 ? opts.tab : tabs[0], focus: 'body', cur: { buy: 0, sell: 0, bag: 0 }, scroll: { buy: 0, sell: 0, bag: 0 }, popup: null,
        msg: null, flash: null, stage: 'open', t: 0, auto: auto, autoT: 0, plan: null, opt: opts, hover: null,
        res: { bought: [], sold: [], used: [], equipped: [], spent: 0, earned: 0 }, relayout: true, L: null };
      queue = []; held = {};
      dbg({ event: 'open', id: S.id, n: S.n, tabs: tabs.slice(), auto: auto, gold: gold() });
      call(o.onSfx, 'open');
      layout();
      return true;
    }
    function close() { if (!S || S.stage === 'close') return false; S.stage = 'close'; S.t = 0; S.popup = null; dbg({ event: 'close', id: S.id, n: S.n }); call(o.onSfx, 'close'); return true; }
    function finish() {
      var s = S, r = s.res;
      var res = { id: s.id, n: s.n, bought: r.bought, sold: r.sold, used: r.used, equipped: r.equipped, spent: r.spent, earned: r.earned, gold: gold(), auto: s.auto };
      last = res; S = null; queue = []; held = {};
      dbg({ event: 'end', id: s.id, n: s.n, bought: r.bought.length, sold: r.sold.length, used: r.used.length, equipped: r.equipped.length });
      call(s.opt.onClose, res); call(o.onClose, res);
    }
    function say(text, kind) { if (S) S.msg = { text: String(text), kind: kind || 'info', t: 0 }; if (kind === 'err') call(o.onSfx, 'error'); }
    function err(why, text) { say(text, 'err'); if (S) S.flash = { why: why, t: 0 }; dbg({ event: 'error', why: why, id: S && S.id }); }

    function entries() {               // what the cursor moves over in the current tab
      if (!S) return [];
      if (S.tab === 'buy') return stockList();
      var out = []; for (var i = 0; i < P.capacity; i++) out.push(bag[i] ? { id: bag[i].id, n: bag[i].n, idx: i } : null); return out;
    }
    function selected() { var E = entries(), e = E[S.cur[S.tab]]; return e || null; }
    function isGrid() { return S.tab !== 'buy'; }
    function moveCursor(dx, dy) {
      var E = entries(), c = S.cur[S.tab], n = E.length;
      if (!n) { if (dy < 0) S.focus = 'tabs'; return; }
      if (isGrid()) {
        var cols = P.cols, col = c % cols, row = Math.floor(c / cols);
        if (dy < 0 && row === 0) { S.focus = 'tabs'; return; }
        if (dx) { col = (col + dx + cols) % cols; } if (dy) row = row + dy;
        var rows = Math.ceil(n / cols); row = (row + rows) % rows; c = Math.min(n - 1, row * cols + col);
      } else {
        if (dx) { switchTab(dx); return; }
        if (dy < 0 && c === 0) { S.focus = 'tabs'; return; }
        c = (c + dy + n) % n;
      }
      S.cur[S.tab] = c; call(o.onSfx, 'move');
    }
    function switchTab(d) {
      var i = S.tabs.indexOf(S.tab); if (S.tabs.length < 2) return;
      S.tab = S.tabs[(i + d + S.tabs.length) % S.tabs.length]; S.msg = null; call(o.onSfx, 'move');
      if (S.cur[S.tab] >= Math.max(1, entries().length)) S.cur[S.tab] = 0;
    }
    function maxBuy(e) {
      var g = gold(), r = room(e.id), byGold = e.price > 0 ? Math.floor(g / e.price) : 99, byStock = e.left == null ? 99 : e.left;
      return { n: Math.max(0, Math.min(99, r, byGold, byStock)), gold: byGold, room: r, stock: byStock };
    }
    function ok() {
      if (S.focus === 'tabs') { S.focus = 'body'; return; }
      var e = selected(); if (!e) return;
      var it = item(e.id);
      if (S.tab === 'buy') {
        var m = maxBuy(e);
        if (m.stock <= 0) return err('soldout', 'Sold out.');
        if (m.gold <= 0) return err('gold', 'Not enough gold.');
        if (m.room <= 0) return err('full', 'Your bag is full.');
        if (P.qty === 'off' || m.n === 1 || maxStack(e.id) === 1 && slotOf(it)) return buy(e, 1);
        S.popup = { type: 'qty', mode: 'buy', id: e.id, n: 1, max: m.n, unit: e.price, entry: e }; return;
      }
      if (S.tab === 'sell') {
        var sp = sellPrice(e.id); if (sp <= 0) return err('nosell', "Can't sell that.");
        if (P.qty === 'off' || e.n === 1) return sell(e, 1);
        S.popup = { type: 'qty', mode: 'sell', id: e.id, n: 1, max: e.n, unit: sp, entry: e }; return;
      }
      var opts = [];                                                          // bag: use / equip
      if (usable(it) && typeof o.onUse === 'function') opts.push({ key: 'use', label: 'Use' });
      if (slotOf(it)) opts.push({ key: 'equip', label: 'Equip' });
      opts.push({ key: 'cancel', label: 'Cancel' });
      if (opts.length === 1) return err('noaction', it && slotOf(it) ? 'Nothing to do.' : (it && it.desc ? fitMsg(it.desc) : 'Nothing to do with it here.'));
      S.popup = { type: 'act', id: e.id, entry: e, options: opts, cur: 0 };
    }
    function fitMsg(s) { return String(s); }
    function whoPopup(action, id, fromBuy) {
      var it = item(id), mem = party(), opts = [];
      mem.forEach(function (m) { var can = action === 'use' ? true : canEquip(m, it); opts.push({ key: 'm', m: m, label: m.name, can: can, gain: action === 'equip' && can ? gain(m, it) : 0 }); });
      if (action === 'equip' && !opts.some(function (q) { return q.can; })) { err('noone', 'Nobody can equip that.'); return false; }
      opts.push({ key: 'cancel', label: fromBuy ? 'Later' : 'Cancel', can: true });
      var cur = 0, bestG = -1e9; opts.forEach(function (q, i) { if (q.key === 'm' && q.can && q.gain > bestG) { bestG = q.gain; cur = i; } });
      S.popup = { type: 'who', action: action, id: String(id), options: opts, cur: cur, fromBuy: !!fromBuy };
      return true;
    }
    function buy(e, n) {
      var it = item(e.id), g = gold(), cost = e.price * n;
      if (cost > g) return err('gold', 'Not enough gold.');
      if (room(e.id) < n) return err('full', 'Your bag is full.');
      if (e.left != null && e.left < n) return err('soldout', 'Sold out.');
      var got = add(e.id, n, 'buy'); if (got < n) { remove(e.id, got, 'undo'); return err('full', 'Your bag is full.'); }
      setGold(g - cost);
      if (e.left != null) { stockLeft[S.id] = stockLeft[S.id] || {}; stockLeft[S.id][e.id] = e.left - n; }
      S.res.bought.push({ id: e.id, n: n, cost: cost }); S.res.spent += cost;
      say('Bought ' + (n > 1 ? n + ' ' : '') + nameOf(e.id) + '.', 'ok'); call(o.onSfx, 'buy');
      dbg({ event: 'buy', id: e.id, n: n, cost: cost, gold: gold() }); call(o.onBuy, { id: e.id, n: n, cost: cost, item: it });
      S.popup = null;
      if (P.equipAfterBuy !== 'off' && slotOf(it) && typeof o.onEquip === 'function' && party().some(function (m) { return canEquip(m, it); })) whoPopup('equip', e.id, true);
    }
    function sell(e, n) {
      var unit = sellPrice(e.id), got = remove(e.id, n, 'sell'); if (!got) return;
      var earn = unit * got; setGold(gold() + earn);
      S.res.sold.push({ id: e.id, n: got, earned: earn }); S.res.earned += earn;
      say('Sold ' + (got > 1 ? got + ' ' : '') + nameOf(e.id) + ' for ' + earn + P.currency + '.', 'ok'); call(o.onSfx, 'sell');
      dbg({ event: 'sell', id: e.id, n: got, earned: earn, gold: gold() }); call(o.onSell, { id: e.id, n: got, earned: earn, item: item(e.id) });
      S.popup = null; var n2 = entries().filter(Boolean).length; if (S.cur.sell >= n2) S.cur.sell = Math.max(0, n2 - 1);
    }
    function equip(m, id) {
      var it = item(id), slot = slotOf(it), old = equipped(m, slot);
      if (!it || !slot) return false;
      if (old === String(id)) { say(m.name + ' already has it.', 'info'); S.popup = null; return false; }
      if (!count(id)) { err('none', 'Not in your bag.'); return false; }
      remove(id, 1, 'equip');
      if (old && item(old) && !room(old)) { add(id, 1, 'undo'); err('full', 'Your bag is full.'); return false; }
      var r = call(o.onEquip, m.id, String(id), slot, old);
      if (r === false) { add(id, 1, 'undo'); err('refused', "Can't equip that."); S.popup = null; return false; }
      if (old && item(old)) add(old, 1, 'unequip');
      S.res.equipped.push({ member: m.id, id: String(id), slot: slot, old: old });
      say(m.name + ' equipped ' + nameOf(id) + '.', 'ok'); call(o.onSfx, 'equip');
      dbg({ event: 'equip', member: m.id, id: String(id), slot: slot, old: old });
      S.popup = null; return true;
    }
    function use(m, id) {
      var it = item(id); if (!count(id)) { err('none', 'Not in your bag.'); return; }
      var r = call(o.onUse, String(id), m.id, it);
      if (r === false || typeof r === 'string') { err('noeffect', typeof r === 'string' && r ? r : 'It has no effect.'); S.popup = null; return; }
      remove(id, 1, 'use');
      S.res.used.push({ member: m.id, id: String(id) });
      say('Used ' + nameOf(id) + (party().length > 1 ? ' on ' + m.name : '') + '.', 'ok'); call(o.onSfx, 'use');
      dbg({ event: 'use', member: m.id, id: String(id) });
      S.popup = null;
    }
    function popupInput(a) {
      var p = S.popup;
      if (a === 'back') { S.popup = null; call(o.onSfx, 'back'); return; }
      if (p.type === 'qty') {
        if (a === 'up' || a === 'right') p.n = p.n >= p.max ? 1 : p.n + 1;
        if (a === 'down' || a === 'left') p.n = p.n <= 1 ? p.max : p.n - 1;
        if (a === 'ok') { if (p.mode === 'buy') buy(p.entry, p.n); else sell(p.entry, p.n); }
        return;
      }
      if (a === 'up' || a === 'left') { var g1 = 0; do { p.cur = (p.cur + p.options.length - 1) % p.options.length; } while (p.options[p.cur].can === false && ++g1 < p.options.length); call(o.onSfx, 'move'); }
      if (a === 'down' || a === 'right') { var g2 = 0; do { p.cur = (p.cur + 1) % p.options.length; } while (p.options[p.cur].can === false && ++g2 < p.options.length); call(o.onSfx, 'move'); }
      if (a !== 'ok') return;
      var q = p.options[p.cur];
      if (p.type === 'act') {
        if (q.key === 'cancel') { S.popup = null; return; }
        var mem = party();
        if (q.key === 'use') { if (mem.length > 1) whoPopup('use', p.id); else use(mem[0], p.id); return; }
        if (q.key === 'equip') { var can = mem.filter(function (m) { return canEquip(m, item(p.id)); }); if (mem.length > 1 || !can.length) whoPopup('equip', p.id); else equip(can[0], p.id); return; }
        return;
      }
      if (p.type === 'who') {
        if (q.key === 'cancel') { S.popup = null; return; }
        if (!q.can) { err('cant', q.label + " can't equip that."); return; }
        if (p.action === 'equip') equip(q.m, p.id); else use(q.m, p.id);
      }
    }
    function act(a) {
      if (!S || S.stage !== 'run') return;
      if (S.popup) { popupInput(a); return; }
      if (a === 'tab') { switchTab(1); return; }
      if (a === 'tabPrev') { switchTab(-1); return; }
      if (S.focus === 'tabs') {
        if (a === 'left') switchTab(-1); else if (a === 'right') switchTab(1);
        else if (a === 'down' || a === 'ok') S.focus = 'body'; else if (a === 'back') close();
        return;
      }
      if (a === 'back') { close(); return; }
      if (a === 'ok') { ok(); return; }
      if (a === 'up') moveCursor(0, -1); else if (a === 'down') moveCursor(0, 1); else if (a === 'left') moveCursor(-1, 0); else if (a === 'right') moveCursor(1, 0);
    }

    /* ---------- autopilot (autoplay): pick, walk the cursor, buy, equip, leave; deterministic ---------- */
    function planAuto() {
      var steps = [], want = String(P.autoBuy), list = S.tabs.indexOf('buy') >= 0 ? stockList() : [];
      var pick = -1, best = -1e9, mem = party();
      if (want !== 'none' && list.length) {
        list.forEach(function (e, i) {
          var m = maxBuy(e); if (m.n <= 0) return; var it = item(e.id), score;
          if (want !== 'best' && want !== 'cheapest') { if (e.id === want) { pick = i; best = 1e9; } return; }
          if (want === 'cheapest') score = -e.price;
          else { var g = -1e9; if (slotOf(it)) mem.forEach(function (mm) { if (canEquip(mm, it)) g = Math.max(g, gain(mm, it)); }); score = g > 0 ? 1e6 + g * 1000 - e.price : usable(it) ? -e.price : -1e9; }
          if (score > best && score > -1e9) { best = score; pick = i; }
        });
      }
      if (pick >= 0) {
        if (S.tab !== 'buy') steps.push('tab');
        var c = S.cur.buy; while (c < pick) { steps.push('down'); c++; } while (c > pick) { steps.push('up'); c--; }
        steps.push('ok', 'okQty', 'equip');
      }
      steps.push('leave');
      return steps;
    }
    function autoStep() {
      if (!S.plan) S.plan = planAuto();
      var s = S.plan.shift(); if (s == null) { close(); return; }
      if (s === 'leave') { S.popup = null; close(); return; }
      if (s === 'okQty') { if (S.popup && S.popup.type === 'qty') act('ok'); else autoStep(); return; }
      if (s === 'equip') { if (S.popup && S.popup.type === 'who') { var p = S.popup, b = 0, bg = -1e9; p.options.forEach(function (q, i) { if (q.key === 'm' && q.can && q.gain > bg) { bg = q.gain; b = i; } }); if (bg > 0) { p.cur = b; act('ok'); } else S.popup = null; } else autoStep(); return; }
      act(s);
    }

    /* ---------- clock ---------- */
    function update(dt) {
      try {
        dt = num(dt, 0); if (dt < 0) dt = 0; if (dt > 250) dt = 250;
        clock += dt;
        var s = S; if (!s) { queue = []; return; }
        if (s.relayout) layout();
        s.t += dt; if (s.msg) s.msg.t += dt; if (s.flash) { s.flash.t += dt; if (s.flash.t > 600) s.flash = null; }
        if (s.stage === 'open') { if (s.t >= P.openMs) { s.stage = 'run'; s.t = 0; } queue = []; return; }
        if (s.stage === 'close') { queue = []; if (s.t >= P.openMs) finish(); return; }
        if (s.auto) { queue = []; s.autoT += dt; if (s.autoT >= P.autoplayMs) { s.autoT = 0; autoStep(); } return; }
        for (var k in held) if (held[k] && /^(up|down|left|right)$/.test(k)) { held[k] += dt; if (held[k] > REPEAT_MS + REPEAT_EVERY) { held[k] = REPEAT_MS; queue.push(k); } }
        var q = queue; queue = [];
        for (var i = 0; i < q.length && i < 6 && S === s && s.stage === 'run'; i++) {
          if (q[i].tap) tapAt(q[i].x, q[i].y); else act(q[i]);
        }
      } catch (e) { warnOnce('update', 'update failed: ' + e); }
    }

    /* ---------- input (latched; acted on in update) ---------- */
    function press(name) { if (!S) return false; if (S.auto || S.stage !== 'run' && S.stage !== 'open') return true; if (S.stage === 'run' && queue.length < 8) queue.push(String(name)); return true; }
    function key(code, down) {
      var a = KEYMAP[String(code == null ? '' : code)]; if (!a) return false;
      if (!S) { held[a] = 0; return false; }
      if (down) { if (held[a]) return true; held[a] = 1; press(a); } else held[a] = 0;
      return true;
    }
    function tap(x, y) { if (!S) return false; if (S.auto || S.stage !== 'run') return true; if (queue.length < 8) queue.push({ tap: 1, x: num(x, -1), y: num(y, -1) }); return true; }
    function point(x, y) { if (S) S.hover = { x: num(x, -1), y: num(y, -1) }; return !!S; }
    function inR(x, y, r) { return r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }
    function tapAt(x, y) {
      var L = S.L; if (!L) return;
      var hitList = S.hits || [];
      for (var i = hitList.length - 1; i >= 0; i--) { var h = hitList[i]; if (inR(x, y, h)) { h.fn(); return; } }
      if (S.popup) { S.popup = null; return; }
      if (!inR(x, y, L.B)) close();
    }

    /* ---------- drawing ---------- */
    function draw(ctx, ox, oy) {
      drawnRects = [];
      if (!ctx) return;
      try { if (ctx.canvas) lastCanvas = ctx.canvas; } catch (e) { }
      var s = S; if (!s) return;
      try {
        if (!s.L || s.relayout) layout(); if (!s.L) return;
        ox = num(ox, 0); oy = num(oy, 0);
        ctx.save();
        try { if (ox || oy) ctx.translate(ox, oy); paint(ctx, s); } finally { ctx.restore(); }
      } catch (e) { warnOnce('draw', 'draw failed: ' + e); }
    }
    function paint(ctx, s) {
      if (pixelSkin()) ctx.imageSmoothingEnabled = false;
      var L = s.L, B = L.B, open = 1, team = WIN[String(s.opt.tint || P.tint)] ? String(s.opt.tint || P.tint) : 'a';
      if (s.stage === 'open') open = P.openMs > 0 ? clamp(s.t / P.openMs, 0, 1) : 1;
      if (s.stage === 'close') open = P.openMs > 0 ? 1 - clamp(s.t / P.openMs, 0, 1) : 0;
      if (pixelSkin()) open = Math.round(open * 4) / 4;
      if (P.dim > 0 && open > 0) { ctx.globalAlpha = P.dim * open; ctx.fillStyle = tok('ink') || FB.ink; ctx.fillRect(B.f.x, B.f.y, B.f.w, B.f.h); ctx.globalAlpha = 1; }
      if (open <= 0) return;
      var bh = Math.max(6, Math.round(B.h * open)), by = B.y + Math.round((B.h - bh) / 2);
      frame(ctx, { x: B.x, y: by, w: B.w, h: bh }, 'window', team);
      drawnRects.push({ kind: 'window', x: B.x, y: B.y, w: B.w, h: B.h });
      if (open < 1) return;
      s.hits = [];
      var main = tok('text.main') || '#fff', dim = tok('text.dim') || '#8088a8', goldC = tok('text.gold') || '#ffe890', lab = tok('text.label') || '#b8d0ff';
      var errC = tok('fx.hot') || '#ff7a3a', okC = tok('fx.heal') || '#4ad870';
      // header: name, gold
      text(ctx, fit(s.name, B.w - 90), L.head.x, L.head.y, goldC);
      var gs = gold() + ' ' + P.currency, gflash = s.flash && s.flash.why === 'gold' && Math.floor(s.flash.t / 100) % 2 === 0;
      var gw = text(ctx, gs, L.head.x + L.head.w, L.head.y, gflash ? errC : main, 'right'); coin(ctx, L.head.x + L.head.w - gw - 10, L.head.y);
      drawnRects.push({ kind: 'gold', x: L.head.x + L.head.w - gw - 10, y: L.head.y, w: gw + 10, h: 8 });
      // tabs
      var tx = L.head.x;
      s.tabs.forEach(function (t) {
        var w = textW(TAB_LABEL[t]) + 12, r = { x: tx - 2, y: L.tabsY, w: w, h: 11 }, on = t === s.tab;
        frame(ctx, r, on ? 'plate' : 'backing', team);
        text(ctx, TAB_LABEL[t], tx + 4, L.tabsY + 2, on ? (s.focus === 'tabs' ? tok('text.select') || '#fff4c0' : goldC) : dim);
        if (on && s.focus === 'tabs') hand(ctx, tx - 10, L.tabsY + 3);
        s.hits.push({ x: r.x, y: r.y, w: r.w, h: r.h, fn: function () { s.tab = t; s.focus = 'body'; s.msg = null; s.popup = null; call(o.onSfx, 'move'); } });
        tx += w + 2;
      });
      var cap = bag.length + '/' + P.capacity;
      if (cap) { var full = s.flash && s.flash.why === 'full' && Math.floor(s.flash.t / 100) % 2 === 0; text(ctx, cap, L.head.x + L.head.w, L.tabsY + 2, full ? errC : bag.length >= P.capacity ? tok('fx.crit') || '#ffb43a' : dim, 'right'); }
      ctx.fillStyle = tok('ui.shadow') || '#0a1238'; ctx.fillRect(B.x + 5, L.body.y - 3, B.w - 10, 1);
      // left: list or grid
      var E = entries(), cur = s.cur[s.tab], sel = E[cur] || null;
      if (s.tab === 'buy') drawList(ctx, s, L, E, cur, main, dim, goldC, errC, team);
      else drawGrid(ctx, s, L, E, cur, main, dim, goldC);
      // right: details
      drawDetails(ctx, s, L, sel, main, dim, goldC, lab);
      // footer
      var msg = s.msg && s.msg.t < 2600 ? s.msg : null;
      var hint = s.popup ? (s.popup.type === 'qty' ? 'Up/Down: amount  Z: ok  X: back' : 'Z: choose  X: back') : s.tab === 'buy' ? 'Z: buy  X: leave  Q/E: tab' : s.tab === 'sell' ? 'Z: sell  X: leave  Q/E: tab' : 'Z: use/equip  X: close';
      if (s.tabs.length === 1 && !s.popup) hint = 'Z: use/equip  X: close';
      text(ctx, fit(msg ? msg.text : hint, L.foot.w), L.foot.x, L.foot.y, msg ? (msg.kind === 'err' ? errC : msg.kind === 'ok' ? okC : main) : dim);
      if (msg) drawnRects.push({ kind: 'msg', x: L.foot.x, y: L.foot.y, w: L.foot.w, h: 10, text: msg.text, err: msg.kind === 'err' });
      // tooltip (grid) and popups
      if (!s.popup && isGrid() && P.tooltip !== 'off' && s.focus === 'body') drawTooltip(ctx, s, L, E, cur, main, goldC);
      if (s.popup) drawPopup(ctx, s, L, team, main, dim, goldC, errC);
    }
    function drawList(ctx, s, L, E, cur, main, dim, goldC, errC, team) {
      var n = E.length, vis = L.rowsVis, sc = s.scroll.buy;
      if (cur < sc) sc = cur; if (cur >= sc + vis) sc = cur - vis + 1; sc = clamp(sc, 0, Math.max(0, n - vis)); s.scroll.buy = sc;
      frame(ctx, L.left, 'backing', null);
      if (!n) { text(ctx, 'Nothing for sale.', L.left.x + 6, L.left.y + 6, dim); return; }
      var g = gold();
      for (var r = 0; r < vis && sc + r < n; r++) {
        var i = sc + r, e = E[i], it = item(e.id), y = L.left.y + 2 + r * ROW, x = L.left.x + 9;
        var can = e.price <= g && room(e.id) > 0 && (e.left == null || e.left > 0);
        if (i === cur && s.focus === 'body') frame(ctx, { x: L.left.x + 1, y: y, w: L.left.w - 2, h: ROW }, 'row', null);
        icon(ctx, it, x, y + 1, !can);
        var pw = textW(e.price + ''), nameW = L.left.w - 9 - 18 - pw - 6;
        text(ctx, fit(nameOf(e.id), nameW), x + 18, y + 5, can ? main : dim);
        var ps = e.left != null && e.left <= 0 ? '--' : e.price + '', pcol = e.price > g ? (team === 'b' ? '#ffd0f0' : errC) : goldC;
        var pw2 = text(ctx, ps, L.left.x + L.left.w - 3, y + 5, pcol, 'right');
        if (e.price > g) { ctx.fillStyle = pcol; ctx.fillRect(L.left.x + L.left.w - 3 - pw2 - 1, y + 8, pw2 + 2, 1); }
        if (i === cur && s.focus === 'body' && !s.popup) hand(ctx, L.left.x + 1, y + 6);
        drawnRects.push({ kind: 'row', id: e.id, x: L.left.x, y: y, w: L.left.w, h: ROW });
        (function (ii) { s.hits.push({ x: L.left.x, y: y, w: L.left.w, h: ROW, fn: function () { if (s.cur.buy === ii && s.focus === 'body') ok(); else { s.cur.buy = ii; s.focus = 'body'; } } }); })(i);
      }
      if (sc > 0) tri(ctx, L.left.x + L.left.w - 9, L.left.y - 1, true, main);
      if (sc + vis < n) tri(ctx, L.left.x + L.left.w - 9, L.left.y + L.left.h - 3, false, main);
    }
    function drawGrid(ctx, s, L, E, cur, main, dim, goldC) {
      var cols = P.cols, rows = Math.ceil(P.capacity / cols), vis = L.gridRowsVis, row = Math.floor(cur / cols), sc = s.scroll[s.tab];
      if (row < sc) sc = row; if (row >= sc + vis) sc = row - vis + 1; sc = clamp(sc, 0, Math.max(0, rows - vis)); s.scroll[s.tab] = sc;
      var full = s.flash && s.flash.why === 'full' && Math.floor(s.flash.t / 100) % 2 === 0;
      for (var r = 0; r < vis && sc + r < rows; r++) for (var c = 0; c < cols; c++) {
        var i = (sc + r) * cols + c; if (i >= P.capacity) break;
        var x = L.gridX + c * CELL, y = L.left.y + 2 + r * CELL, e = E[i], cell = { x: x, y: y, w: CELL - 1, h: CELL - 1 };
        frame(ctx, cell, 'backing', null);
        if (full) { ctx.fillStyle = tok('fx.hot') || '#ff7a3a'; ctx.globalAlpha = 0.35; ctx.fillRect(x, y, CELL - 1, CELL - 1); ctx.globalAlpha = 1; }
        if (e) {
          var it = item(e.id), dimIt = s.tab === 'sell' && sellPrice(e.id) <= 0;
          icon(ctx, it, x, y, dimIt);
          if (e.n > 1 || maxStack(e.id) > 1) countPlate(ctx, x, y, e.n, e.n >= maxStack(e.id), goldC, main);
        }
        drawnRects.push({ kind: 'cell', id: e ? e.id : null, x: x, y: y, w: CELL - 1, h: CELL - 1 });
        (function (ii) { s.hits.push({ x: x, y: y, w: CELL - 1, h: CELL - 1, fn: function () { if (s.cur[s.tab] === ii && s.focus === 'body') ok(); else { s.cur[s.tab] = ii; s.focus = 'body'; } } }); })(i);
      }
      if (s.focus === 'body' && row >= sc && row < sc + vis) bracket(ctx, { x: L.gridX + (cur % cols) * CELL, y: L.left.y + 2 + (row - sc) * CELL, w: CELL - 1, h: CELL - 1 });
      if (sc > 0) tri(ctx, L.gridX + cols * CELL + 1, L.left.y, true, main);
      if (sc + vis < rows) tri(ctx, L.gridX + cols * CELL + 1, L.left.y + L.left.h - 4, false, main);
    }
    function countPlate(ctx, x, y, n, full, goldC, main) {        // stack count on an ink plate, bottom-right of the cell, over the icon
      var ns = String(n), nw = textW(ns), px = x + CELL - 3 - nw - 1, py = y + CELL - 10, pa = ctx.globalAlpha;
      ctx.globalAlpha = pa * (pixelSkin() ? 1 : 0.88); ctx.fillStyle = tok('ink') || FB.ink; ctx.fillRect(px - (pixelSkin() ? 0 : 1), py, nw + (pixelSkin() ? 2 : 4), 9); ctx.globalAlpha = pa;
      text(ctx, ns, x + CELL - 2 - (pixelSkin() ? 0 : 1), py + (pixelSkin() ? 0 : 1), full ? (pixelSkin() ? goldC : RAMP.gold[3]) : (pixelSkin() ? main : tok('paper') || '#ffffff'), 'right');
    }
    function solid(ctx, r, team) {                                // opaque backing under popups and tooltips on pixel skins (no ghost text)
      if (!pixelSkin()) return; var C = WIN[team] || WIN.a; ctx.fillStyle = C[3]; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }
    function drawTooltip(ctx, s, L, E, cur, main, goldC) {
      var e = E[cur]; if (!e) return;
      var cols = P.cols, row = Math.floor(cur / cols) - s.scroll[s.tab], cx = L.gridX + (cur % cols) * CELL, cy = L.left.y + 2 + row * CELL;
      var t1 = nameOf(e.id) + (e.n > 1 ? ' x' + e.n : ''), w = Math.min(L.B.w - 12, textW(t1) + 10), h = 13;
      var x = clamp(cx + CELL / 2 - w / 2, L.B.x + 4, L.B.x + L.B.w - 4 - w);
      var rowsShown = Math.min(L.gridRowsVis, Math.ceil(P.capacity / cols) - s.scroll[s.tab]), gridBottom = L.left.y + 2 + rowsShown * CELL, y;
      if (gridBottom + 1 + h <= L.left.y + L.left.h) y = gridBottom + 1;              // free space under the grid: covers no cell
      else if (row > 0) y = cy - h - 1;                                                 // above the cell
      else y = cy + CELL + 1;
      x = Math.round(x); y = Math.round(y);
      solid(ctx, { x: x, y: y, w: w, h: h }, 'n'); frame(ctx, { x: x, y: y, w: w, h: h }, 'tooltip', null);
      text(ctx, fit(t1, w - 8), x + 5, y + 3, main);
      drawnRects.push({ kind: 'tooltip', id: e.id, x: x, y: y, w: w, h: h });
    }
    function drawStatLine(ctx, x, y, w, pairs, main) {          // "ATK+2 DEF-1" with coloured signs
      var cx = x;
      for (var i = 0; i < pairs.length; i++) {
        var p = pairs[i], s1 = label(p.k), s2 = (p.d > 0 ? '+' : '') + p.d, ww = textW(s1 + s2) + 6;
        if (cx + ww - 4 > x + w) break;
        text(ctx, s1, cx, y, tok('text.label') || '#b8d0ff'); cx += textW(s1) + 1;
        text(ctx, s2, cx, y, p.col || main); cx += textW(s2) + 6;
      }
    }
    function drawDetails(ctx, s, L, sel, main, dim, goldC, lab) {
      var R = L.right, x = R.x + 2, y = R.y + 1, w = R.w - 2, bottom = R.y + R.h;
      if (!sel) { text(ctx, s.tab === 'buy' ? '' : 'Empty slot.', x, y + 2, dim); return; }
      var it = item(sel.id); if (!it) return;
      text(ctx, fit(nameOf(sel.id), w), x, y, goldC); y += LH + 1;
      var kind = String(it.kind || 'item'), kindL = kind.charAt(0).toUpperCase() + kind.slice(1), info;
      if (s.tab === 'buy') info = sel.left != null ? Math.max(0, sel.left) + ' left  own ' + count(sel.id) : kindL + '  own ' + count(sel.id);
      else if (s.tab === 'sell') info = sellPrice(sel.id) > 0 ? 'Sells for ' + sellPrice(sel.id) + P.currency : "Can't sell";
      else info = kindL + '  x' + sel.n + '/' + maxStack(sel.id);
      text(ctx, fit(info, w), x, y, lab); y += LH + 1;
      var st = statsOf(it), pairs = [];
      statKeys(it, null).forEach(function (k) { pairs.push({ k: k, d: num(st[k], 0), col: main }); });
      if (pairs.length) { drawStatLine(ctx, x, y, w, pairs, main); y += LH + 1; }
      if (slotOf(it) && P.compare !== 'off' && y + LH <= bottom) {
        ctx.fillStyle = tok('ui.shadow') || '#0a1238'; ctx.fillRect(x, y, w - 2, 1); y += 3;
        var mem = party();
        for (var i = 0; i < mem.length && y + LH <= bottom; i++) {
          var m = mem[i], can = canEquip(m, it), cur = equipped(m, slotOf(it)), nmW = Math.min(36, Math.floor(w * 0.36));
          text(ctx, fit(m.name, nmW), x, y, can ? main : dim);
          var cx = x + nmW + 3;
          if (!can) { text(ctx, '--', cx, y, dim); }
          else if (cur === String(sel.id)) { text(ctx, 'Equipped', cx, y, goldC); }
          else {
            var D = deltas(m, it), any = false;
            for (var j = 0; j < D.length; j++) {
              var d = D[j], s1 = label(d.k), s2 = d.d === 0 ? '=' : (d.d > 0 ? '+' : '') + d.d, ww = textW(s1) + textW(s2) + 10;
              if (cx + ww > x + w + 2) break;
              text(ctx, s1, cx, y, lab); cx += textW(s1) + 1;
              var col = d.d > 0 ? UP_COL : d.d < 0 ? DOWN_COL : dim;
              text(ctx, s2, cx, y, col); cx += textW(s2) + 1;
              if (d.d) { tri(ctx, cx, y + 2, d.d > 0, col); drawnRects.push({ kind: d.d > 0 ? 'up' : 'down', member: m.id, stat: d.k, x: cx, y: y + 2, w: 5, h: 4 }); cx += 6; }
              cx += 3; any = true;
            }
            if (!any) text(ctx, '=', cx, y, dim);
          }
          y += LH;
        }
        y += 1;
      }
      if (it.desc && y + LH <= bottom) {
        var words = String(it.desc).split(/\s+/), line = '';
        for (var k = 0; k <= words.length && y + LH <= bottom; k++) {
          var tryL = k < words.length ? (line ? line + ' ' + words[k] : words[k]) : null;
          if (tryL != null && textW(tryL) <= w) { line = tryL; continue; }
          if (line) { text(ctx, line, x, y, dim); y += LH; }
          line = k < words.length ? words[k] : '';
        }
      }
    }
    function drawPopup(ctx, s, L, team, main, dim, goldC, errC) {
      var p = s.popup, B = L.B, it = item(p.id), w, h, x, y, lines = [];
      if (p.type === 'qty') {
        w = Math.min(120, L.right.w + 4); h = 46; x = Math.round(L.right.x + Math.max(0, (L.right.w - w) / 2)); y = Math.round(L.body.y + Math.max(0, (L.body.h - h) / 2));
        if (x + w > B.x + B.w - 4) x = B.x + B.w - 4 - w;
        solid(ctx, { x: x, y: y, w: w, h: h }, team); frame(ctx, { x: x, y: y, w: w, h: h }, 'window', team, { focus: true });
        text(ctx, fit((p.mode === 'buy' ? 'Buy ' : 'Sell ') + nameOf(p.id), w - 12), x + 6, y + 5, goldC);
        var q = 'x ' + p.n, qx = Math.round(x + w / 2 - textW(q) / 2), nx = qx + textW('x ') + 1, nc = Math.round(nx + textW(String(p.n)) / 2);
        text(ctx, q, qx, y + 18, main); tri(ctx, nc - 2, y + 12, true, main); tri(ctx, nc - 2, y + 28, false, main);
        text(ctx, p.max + ' max', x + w - 6, y + 18, dim, 'right');
        var tot = 'Total ' + p.unit * p.n + ' ' + P.currency; text(ctx, tot, x + 6, y + 33, p.mode === 'buy' && p.unit * p.n > gold() ? errC : main);
        s.hits.push({ x: x, y: y, w: w, h: Math.round(h / 2), fn: function () { popupInput('up'); } });
        s.hits.push({ x: x, y: y + Math.round(h / 2), w: w, h: h - Math.round(h / 2), fn: function () { popupInput('ok'); } });
        drawnRects.push({ kind: 'popup', x: x, y: y, w: w, h: h });
        return;
      }
      var title = p.type === 'act' ? nameOf(p.id) : p.action === 'equip' ? (p.fromBuy ? 'Equip now?' : 'Equip on') : 'Use on';
      w = Math.max(84, textW(title) + 16); p.options.forEach(function (q) { w = Math.max(w, textW(q.label) + 26 + (q.gain ? 22 : 0)); }); w = Math.min(w, B.w - 16);
      h = 16 + p.options.length * 11 + 2; x = Math.round(L.right.x + Math.max(0, (L.right.w - w) / 2)); y = Math.round(L.body.y + Math.max(0, (L.body.h - h) / 2));
      if (x + w > B.x + B.w - 4) x = B.x + B.w - 4 - w; if (x < B.x + 4) x = B.x + 4;
      solid(ctx, { x: x, y: y, w: w, h: h }, team); frame(ctx, { x: x, y: y, w: w, h: h }, 'window', team, { focus: true });
      text(ctx, fit(title, w - 10), x + 6, y + 5, goldC);
      p.options.forEach(function (q, i) {
        var ry = y + 16 + i * 11;
        if (i === p.cur) { frame(ctx, { x: x + 3, y: ry - 1, w: w - 6, h: 10 }, 'row', null); hand(ctx, x + 4, ry + 1); }
        text(ctx, fit(q.label, w - 40), x + 14, ry, q.can === false ? dim : main);
        if (q.key === 'm' && p.action === 'equip' && q.can) { var gs = q.gain === 0 ? '=' : (q.gain > 0 ? '+' : '') + q.gain, col = q.gain > 0 ? UP_COL : q.gain < 0 ? DOWN_COL : dim; text(ctx, gs, x + w - 12, ry, col, 'right'); if (q.gain) tri(ctx, x + w - 10, ry + 2, q.gain > 0, col); }
        (function (ii) { s.hits.push({ x: x, y: ry - 1, w: w, h: 11, fn: function () { if (p.cur === ii) popupInput('ok'); else p.cur = ii; } }); })(i);
      });
      drawnRects.push({ kind: 'popup', x: x, y: y, w: w, h: h });
    }

    /* ---------- public ---------- */
    return {
      open: open,
      openBag: function (opts) { opts = opts || {}; opts.tabs = ['bag']; return open(opts); },
      busy: function () { return !!S; },
      close: close,
      clear: function () { S = null; queue = []; held = {}; drawnRects = []; },
      key: key, press: press, tap: tap, point: point,
      update: update, draw: draw,
      // bag (module-owned): use these instead of a second counter of your own
      count: count, add: function (id, n) { return add(id, n == null ? 1 : n, 'add'); }, remove: function (id, n) { return remove(id, n == null ? 1 : n, 'remove'); },
      setCount: setCount, room: room, canAdd: function (id, n) { return room(id) >= Math.max(1, Math.floor(num(n, 1))); },
      slots: function () { return bag.map(function (s) { return { id: s.id, n: s.n }; }); }, free: function () { return P.capacity - bag.length; },
      reset: function (start) { reset(start); stockLeft = {}; },
      serialize: serialize, restore: restore,
      item: item, items: function () { return ITEMS; }, setItems: setItems, maxStack: maxStack, sellPrice: sellPrice,
      state: function () {
        var s = S; if (!s) return null; var sel = selected();
        return { id: s.id, n: s.n, stage: s.stage, tab: s.tab, tabs: s.tabs.slice(), focus: s.focus, cursor: s.cur[s.tab], selected: sel ? sel.id : null,
          popup: s.popup ? { type: s.popup.type, id: s.popup.id, n: s.popup.n, max: s.popup.max, cur: s.popup.cur, action: s.popup.action } : null,
          msg: s.msg ? s.msg.text : null, msgKind: s.msg ? s.msg.kind : null, auto: s.auto, gold: gold(), bag: bag.length, capacity: P.capacity,
          bought: s.res.bought.length, sold: s.res.sold.length, used: s.res.used.length, equipped: s.res.equipped.length,
          window: s.L ? { x: s.L.B.x, y: s.L.B.y, w: s.L.B.w, h: s.L.B.h } : null };
      },
      rect: function () { return S && S.L ? { x: S.L.B.x, y: S.L.B.y, w: S.L.B.w, h: S.L.B.h } : null; },
      lastResult: function () { return last; },
      lastDrawn: function () { return drawnRects.slice(); },
      setParams: function (p) { setParams(p); MW = {}; },
      params: function () { var c = {}; for (var k in DEFAULTS) c[k] = P[k]; return c; },
      measure: function (s) { return textW(s); }
    };
  }

  root.GameDNA_ShopInventory = { version: VERSION, DEFAULTS: DEFAULTS, ICONS: Object.keys(ICONS), RAMPS: Object.keys(RAMP), create: create, drawIcon: drawIcon };
})(typeof window !== 'undefined' ? window : this);
