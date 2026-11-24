/* GameDNA H-05 - World-space bark bubbles (bark-bubbles) - module v1.3.1 (plain script, no dependencies, one global)
 *
 *   const barks = GameDNA_BarkBubbles.create({
 *     bounds: { x: 0, y: 0, w: 640, h: 360 },        // visible play field in screen px (logical canvas px)
 *     getAnchor: id => ({ x, top, w, h }),           // speaker: centre x and top of the head in SCREEN px (null = gone)
 *     getObstacles: () => [{ x, y, w, h, id }],      // unit sprites (with id) and UI rects (no id) to keep clear
 *     speakers: () => [{ id, voice }],               // optional: who may chat when idle (on-screen NPCs)
 *     lines: { guard: { spotted: ['Halt!'] } },      // optional: your own lines, merged over the built-in ones
 *     params: { size: 0, cps: 45, idle: 6000, ... },
 *     font: '"Nunito", sans-serif'                  // optional: CSS font family for smooth bubbles (default: a rounded UI stack)
 *   });
 *   barks.bark(id, 'spotted', { voice: 'guard' })    // an event: picks a line, respects cooldowns
 *   barks.say(id, 'The bridge is out.', { tone })    // an exact line
 *   barks.update(dtMs)                               // world time (never pauses the game; 0 while your world is frozen)
 *   barks.draw(ctx, offsetX, offsetY)                // after sprites, before HUD and windows
 *
 * Short lines in speech bubbles above characters, in the world: each bubble pops out of its speaker with a little
 * spring, types its text in, follows the speaker as it walks, keeps clear of other bubbles, units and UI rects, stays
 * on screen (clamped, with its tail turned into a pointer toward a speaker near or past the edge), and expires by
 * itself after a reading time. Tones: talk, shout (spiky, bold), alarm (yellow with a "!" badge: spotted), hurt (red
 * burst, shaky), whisper (dashed, faint), think (cloud with trailing puffs). Smooth cel-shaded vector bubbles (ink edge,
 * rim light, drop shadow, a curved tail) on HD canvases; crisp pixel bubbles with a built-in 6x8 bitmap font on native pixel canvases (256x224 and the like).
 * Everything is a function of the time passed to update(): ?t=&freeze=1 screenshots are deterministic.
 */
(function (root) {
  'use strict';
  var VERSION = '1.3.1';
  var DEFAULTS = { size: 0, width: 20, cps: 45, read: 55, hold: 1500, max: 0, cooldown: 4000, idle: 7000, palette: 'light', render: 'auto', pop: 0.5, edge: 'pointer', stagger: 600 };
  var FAMILY = '"Nunito", "Baloo 2", "Quicksand", "Arial Rounded MT Bold", "Varela Round", ui-rounded, "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  var TONES = { talk: 1, shout: 1, alarm: 1, hurt: 1, whisper: 1, think: 1 };
  var EVENT_TONE = { idle: 'talk', greet: 'talk', heal: 'talk', thanks: 'talk', spotted: 'alarm', alert: 'alarm', lost: 'think', wonder: 'think',
    hurt: 'hurt', lowhp: 'hurt', kill: 'shout', taunt: 'shout', win: 'shout', flee: 'hurt', secret: 'whisper' };
  var TONE_PRIO = { alarm: 3, hurt: 3, shout: 2, talk: 1, think: 1, whisper: 1 };

  /* ---------- built-in lines (neutral fantasy; merged under options.lines) ---------- */
  var LINES = {
    villager: { idle: ['Lovely weather today.', 'Mind the geese.', "Bread's fresh at noon.", 'The well tastes of iron again.', 'Have you seen my cat?'],
      greet: ['Hello there!', 'Safe travels, friend.'], hurt: ['Ow!', 'Hey, watch it!'], spotted: ['Oh! A visitor.'], thanks: ['Thank you kindly!'], lost: ['Where did they go?'] },
    guard: { idle: ['All quiet.', 'Keep to the road.', 'Long watch tonight.', 'Gate closes at dusk.'], greet: ['Move along, friend.'],
      spotted: ['Halt!', 'Who goes there?'], hurt: ['Agh!', 'Steady...'], lost: ['Must have been the wind.'], kill: ['Stand down!'] },
    merchant: { idle: ['Fresh stock today!', 'Potions! Bread! Fair prices!', 'Psst. Need supplies?'], greet: ['Come, have a look!'],
      hurt: ['My wares!'], thanks: ['Pleasure doing business!'], spotted: ['A customer!'] },
    hero: { idle: ['Which way now?', 'Quiet out here.', 'Keep moving.'], hurt: ['Oof!', 'That stung.', 'Ngh!'], lowhp: ['I need a potion...', "Can't take much more."],
      kill: ['Got it!', 'One down.'], spotted: ['Here they come!'], heal: ['Much better.'], win: ['Done!'] },
    monster: { idle: ['*snuffle*', 'Hrrm...'], spotted: ['Grrr!', 'Intruder!', 'There!'], hurt: ['Gah!', 'Ngk!'], lost: ["Where'd it go?"],
      kill: ['Ha!'], taunt: ['Come closer!'], flee: ['Run!'] },
    critter: { idle: ['...blub', '*wobble*', 'Blip.'], spotted: ['Blorp!', 'Blip?!'], hurt: ['Splut!', 'Eep!'], lost: ['Blub?'], flee: ['Squee!'] }
  };

  /* ---------- built-in 6x8 bitmap font for crisp mode ('#' = ink, rows top -> bottom; caps rows 0-6, descenders row 7) ---------- */
  var GL = {
    '!': '# # # # # . #', '"': '#.# #.#', '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.', '$': '..#.. .#### #.#.. .###. ..#.# ####. ..#..',
    '%': '##... ##..# ...#. ..#.. .#... #..## ...##', '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#', "'": '# #', '(': '..# .#. #.. #.. #.. .#. ..#',
    ')': '#.. .#. ..# ..# ..# .#. #..', '*': '..... ..#.. #.#.# .###. #.#.# ..#..', '+': '..... ..#.. ..#.. ##### ..#.. ..#..', ',': '.. .. .. .. .. ## .# #.',
    '-': '.... .... .... ####', '.': '.. .. .. .. .. ## ##', '/': '....# ...#. ...#. ..#.. .#... .#... #....',
    '0': '.###. #...# #..## #.#.# ##..# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.', '2': '.###. #...# ....# ...#. ..#.. .#... #####',
    '3': '####. ....# ....# .###. ....# ....# ####.', '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.', '5': '##### #.... ####. ....# ....# #...# .###.',
    '6': '..##. .#... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. .#... .#... .#...', '8': '.###. #...# #...# .###. #...# #...# .###.',
    '9': '.###. #...# #...# .#### ....# ...#. .##..', ':': '.. ## ## .. .. ## ##', ';': '.. ## ## .. .. ## .# #.', '<': '...# ..#. .#.. #... .#.. ..#. ...#',
    '=': '.... .... #### .... ####', '>': '#... .#.. ..#. ...# ..#. .#.. #...', '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
    '@': '.###. #...# #.### #.#.# #.### #.... .####',
    'A': '.###. #...# #...# ##### #...# #...# #...#', 'B': '####. #...# #...# ####. #...# #...# ####.', 'C': '.###. #...# #.... #.... #.... #...# .###.',
    'D': '###.. #..#. #...# #...# #...# #..#. ###..', 'E': '##### #.... #.... ####. #.... #.... #####', 'F': '##### #.... #.... ####. #.... #.... #....',
    'G': '.###. #...# #.... #.### #...# #...# .####', 'H': '#...# #...# #...# ##### #...# #...# #...#', 'I': '### .#. .#. .#. .#. .#. ###',
    'J': '..### ...#. ...#. ...#. #..#. #..#. .##..', 'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#', 'L': '#... #... #... #... #... #... ####',
    'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#', 'N': '#...# ##..# #.#.# #..## #...# #...# #...#', 'O': '.###. #...# #...# #...# #...# #...# .###.',
    'P': '####. #...# #...# ####. #.... #.... #....', 'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#', 'R': '####. #...# #...# ####. #.#.. #..#. #...#',
    'S': '.#### #.... #.... .###. ....# ....# ####.', 'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..', 'U': '#...# #...# #...# #...# #...# #...# .###.',
    'V': '#...# #...# #...# #...# #...# .#.#. ..#..', 'W': '#...# #...# #...# #.#.# #.#.# ##.## #...#', 'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', 'Z': '##### ....# ...#. ..#.. .#... #.... #####',
    '[': '### #.. #.. #.. #.. #.. ###', ']': '### ..# ..# ..# ..# ..# ###', '_': '..... ..... ..... ..... ..... ..... ..... #####',
    'a': '.... .... .##. ...# .### #..# .###', 'b': '#... #... ###. #..# #..# #..# ###.', 'c': '.... .... .### #... #... #... .###',
    'd': '...# ...# .### #..# #..# #..# .###', 'e': '.... .... .##. #..# #### #... .###', 'f': '..## .#.. #### .#.. .#.. .#.. .#..',
    'g': '.... .... .### #..# #..# .### ...# ###.', 'h': '#... #... ###. #..# #..# #..# #..#', 'i': '# . # # # # #', 'j': '..# ... .## ..# ..# ..# ..# ##.',
    'k': '#... #... #..# #.#. ##.. #.#. #..#', 'l': '#. #. #. #. #. #. .#', 'm': '..... ..... ##.#. #.#.# #.#.# #.#.# #.#.#',
    'n': '.... .... ###. #..# #..# #..# #..#', 'o': '.... .... .##. #..# #..# #..# .##.', 'p': '.... .... ###. #..# #..# ###. #... #...',
    'q': '.... .... .### #..# #..# .### ...# ...#', 'r': '.... .... #.## ##.. #... #... #...', 's': '.... .... .### #... .##. ...# ###.',
    't': '.#. .#. ### .#. .#. .#. ..#', 'u': '.... .... #..# #..# #..# #..# .###', 'v': '..... ..... #...# #...# .#.#. .#.#. ..#..',
    'w': '..... ..... #...# #...# #.#.# #.#.# .#.#.', 'x': '..... ..... #...# .#.#. ..#.. .#.#. #...#', 'y': '.... .... #..# #..# #..# .### ...# ###.',
    'z': '.... .... #### ...# .##. #... ####', '~': '..... ..... .#... #.#.# ...#.', '\u2026': '..... ..... ..... ..... ..... ..... #.#.#',
    '\u2019': '# #', '\u2014': '..... ..... ..... #####', '\ufffd': '##### #...# #...# #...# #...# #...# #####'
  };
  var GLYPH = {};
  (function () { for (var ch in GL) { var rows = GL[ch].split(' '), w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length); GLYPH[ch] = { rows: rows, w: w }; } })();
  function glyph(ch) { return GLYPH[ch] || GLYPH[ch === '\u2018' ? "'" : ch === '\u201c' || ch === '\u201d' ? '"' : '\ufffd']; }
  function bmpAdv(ch) { return ch === ' ' ? 3 : glyph(ch).w + 1; }
  function bmpWidth(s) { var w = 0; for (var i = 0; i < s.length; i++) w += bmpAdv(s.charAt(i)); return Math.max(0, w - 1); }

  /* ---------- helpers ---------- */
  function mk(w, h) { try { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; } catch (e) { return null; } }
  function hashS(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function hash2(a, b) { var h = Math.imul((a | 0) * 374761393 + (b | 0) * 668265263, 3266489917); h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u) * (1 - u); }
  function overlap(a, b) { var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; }
  function devScale(ctx) { try { var m = ctx.getTransform(); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; } catch (e) { return 1; } }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  // pop-in scale: 0.55 -> 1 + 0.16*pop at 120 ms (ease-out), then a damped spring to 1 by 300 ms
  function popScale(a, pop) {
    if (a <= 0) return 0.55;
    var peak = 1 + 0.16 * pop;
    if (a < 120) return 0.55 + (peak - 0.55) * easeOut(a / 120);
    var u = (a - 120) / 180; if (u >= 1) return 1;
    return 1 + (peak - 1) * Math.exp(-u * 3) * Math.cos(u * Math.PI * 1.5);
  }

  /* ---------- palettes: fill top, fill bottom, edge, text, accent ---------- */
  var PAL = {
    light: { talk: ['#fffdf6', '#e6dcc8', '#2a2233', '#2a2233', '#ffcf4a'], shout: ['#fffaf0', '#ffdfae', '#2d1408', '#2d1408', '#ff8a2a'], alarm: ['#ffec94', '#ffc12e', '#3a2604', '#2e1d02', '#e8402e'],
      hurt: ['#ffece8', '#ffb9ad', '#7a1420', '#4d0c12', '#e8402e'], whisper: ['rgba(255,253,246,0.80)', 'rgba(230,220,200,0.80)', 'rgba(42,34,51,0.62)', '#544c60', '#b9b2c8'],
      think: ['#f6f8ff', '#cfd9f4', '#2a2f52', '#2a2f52', '#8fa2e8'] },
    dark: { talk: ['rgba(46,41,64,0.96)', 'rgba(26,22,38,0.96)', '#e2dcf0', '#f6f1e7', '#ffcf4a'], shout: ['rgba(62,38,28,0.96)', 'rgba(36,20,14,0.96)', '#ffcf8a', '#fff1dc', '#ff8a2a'],
      alarm: ['rgba(70,54,10,0.96)', 'rgba(40,30,4,0.96)', '#ffd84a', '#fff3c0', '#ff5a3c'], hurt: ['rgba(74,22,28,0.96)', 'rgba(40,10,14,0.96)', '#ff8a7a', '#ffe6e2', '#ff5a3c'],
      whisper: ['rgba(34,30,48,0.72)', 'rgba(22,19,32,0.72)', 'rgba(216,210,232,0.6)', '#c4bcd6', '#8a84a0'], think: ['rgba(36,42,72,0.96)', 'rgba(18,20,38,0.96)', '#aebcf0', '#e8edff', '#8fa2e8'] },
    parchment: { talk: ['#efdcb2', '#d2b278', '#4a2a12', '#3a2210', '#c8862c'], shout: ['#f4e2bc', '#d8b06c', '#4a230c', '#3a1c08', '#c8662c'], alarm: ['#f3d98e', '#d8a640', '#4a2a0c', '#3a2006', '#a8321c'],
      hurt: ['#efd2b4', '#d49c74', '#5a1e10', '#4a160a', '#a8321c'], whisper: ['rgba(239,220,178,0.82)', 'rgba(217,187,132,0.82)', 'rgba(74,42,18,0.62)', '#6a4a2c', '#b8945c'],
      think: ['#ece0c4', '#cfbc90', '#4a3a20', '#3a2c18', '#a89468'] }
  };

  function create(opt) {
    opt = opt || {};
    var P = {}, k0; for (k0 in DEFAULTS) P[k0] = DEFAULTS[k0]; setP(opt.params);
    var SK = null; try { SK = root.GameDNA_Skin && opt.skin != null && opt.skin !== false ? root.GameDNA_Skin.resolve(opt.skin) : null; } catch (e) { SK = null; }
    var t = 0, seq = 0, bubbles = [], drawn = [], warned = {}, lastView = null, mode = null, idleNext = null, said = {}, picks = {}, obsCache = [];
    var meas = mk(4, 4), mctx = meas ? meas.getContext('2d') : null, TXT = {};
    var LN = mergeLines(LINES, opt.lines);

    function setP(o) { if (o) for (var key in o) if (key in DEFAULTS && o[key] != null && o[key] !== '') P[key] = typeof DEFAULTS[key] === 'number' ? (num(+o[key]) ? +o[key] : DEFAULTS[key]) : String(o[key]); }
    function warn(k, msg) { if (warned[k]) return; warned[k] = 1; try { if (root.console) console.warn('GameDNA_BarkBubbles: ' + msg); } catch (e) {} }
    function call(name, a) { var f = opt[name]; if (typeof f !== 'function') return undefined; try { return f(a); } catch (e) { warn('cb-' + name, name + '() threw: ' + (e && e.message)); return undefined; } }
    function mergeLines(base, extra) {
      var out = {}, v, e;
      for (v in base) { out[v] = {}; for (e in base[v]) out[v][e] = base[v][e].slice(); }
      if (extra && typeof extra === 'object') for (v in extra) { if (!extra[v] || typeof extra[v] !== 'object') continue; out[v] = out[v] || {}; for (e in extra[v]) { var L = extra[v][e]; if (typeof L === 'string') L = [L]; if (L && L.length) out[v][e] = L.filter(function (s) { return typeof s === 'string' && s; }); } }
      return out;
    }
    function B() {
      var b = opt.bounds; if (typeof b === 'function') { try { b = b(); } catch (e) { b = null; } }
      if (b && num(+b.w) && +b.w > 0 && num(+b.h) && +b.h > 0) return { x: +b.x || 0, y: +b.y || 0, w: +b.w, h: +b.h };
      return lastView || { x: 0, y: 0, w: 256, h: 224 };
    }
    function crisp() {
      if (mode) return mode === 'crisp';
      if (P.render === 'crisp') return true; if (P.render === 'smooth') return false;
      if (SK) return !!SK.pixel;
      return B().w <= 400;
    }
    // metrics in native px; crisp: integer scale of the 6x8 bitmap font, smooth: font px of the sans
    function M() {
      var b = B(), c = crisp();
      if (c) { var sc = +P.size > 0 ? Math.max(1, Math.round(+P.size / 8)) : Math.max(1, Math.round(b.w / 400)); return { crisp: true, sc: sc, fs: 8 * sc, lh: 10 * sc, padX: 4 * sc, padY: 3 * sc, tail: 4 * sc, gap: 1 * sc, r: 2 * sc, margin: 2 * sc }; }
      var fs = +P.size > 0 ? +P.size : clamp(Math.round(b.w / 46), 9, 28);
      return { crisp: false, sc: 1, fs: fs, lh: Math.round(fs * 1.3), padX: Math.round(fs * 0.8), padY: Math.round(fs * 0.5), tail: Math.round(fs * 0.85), gap: Math.max(2, Math.round(fs * 0.22)), r: Math.round(fs * 0.95), margin: Math.max(3, Math.round(fs * 0.35)) };
    }
    function toneFs(tone, fs) { return tone === 'shout' ? Math.round(fs * 1.12) : tone === 'whisper' ? Math.round(fs * 0.94) : fs; }
    function fontOf(tone, fs) {
      var fam = typeof opt.font === 'string' && opt.font ? opt.font : FAMILY; try { var f = SK && !SK.pixel && SK.fonts && SK.fonts.ui; if (f && f.type === 'canvas' && f.family) fam = f.family; } catch (e) {}
      if (P.palette === 'parchment' && !(SK && SK.fonts)) fam = 'Georgia, "Palatino Linotype", "Book Antiqua", Palatino, serif';
      return (tone === 'whisper' ? 'italic 600 ' : tone === 'shout' ? '900 ' : tone === 'alarm' ? '800 ' : '700 ') + toneFs(tone, fs) + 'px ' + fam;
    }
    function textOf(b) { return b.tone === 'shout' ? b.text.toUpperCase() : b.text; }
    function measureStr(s, m, tone) {
      if (m.crisp) return bmpWidth(s) * m.sc;
      var key = tone + '|' + m.fs + '|' + s; if (TXT[key] != null) return TXT[key];
      var w = s.length * m.fs * 0.55; if (mctx) { mctx.font = fontOf(tone, m.fs); w = mctx.measureText(s).width; }
      if (Object.keys(TXT).length > 800) TXT = {}; return (TXT[key] = w);
    }
    function wrap(s, maxW, m, tone) {
      var words = s.split(/\s+/).filter(Boolean), out = [], line = '';
      words.forEach(function (w) {
        while (measureStr(w, m, tone) > maxW && w.length > 1) {   // a word longer than the line: cut it
          var n = w.length - 1; while (n > 1 && measureStr(w.slice(0, n), m, tone) > maxW) n--;
          if (line) { out.push(line); line = ''; } out.push(w.slice(0, n)); w = w.slice(n);
        }
        var tryL = line ? line + ' ' + w : w;
        if (line && measureStr(tryL, m, tone) > maxW) { out.push(line); line = w; } else line = tryL;
      });
      if (line) out.push(line);
      if (out.length > 4) {   // too long: keep 4 lines and end the last with an ellipsis (dropping words until it fits)
        out = out.slice(0, 4); var last = out[3];
        while (last.indexOf(' ') > 0 && measureStr(last + '\u2026', m, tone) > maxW) last = last.slice(0, last.lastIndexOf(' '));
        out[3] = last.replace(/[\s,.;:!?-]+$/, '') + '\u2026';
      }
      return out.length ? out : [''];
    }
    // body size of one bubble (native px)
    function shape(b) {
      var m = M(), s = textOf(b), maxW = Math.max(m.fs * 4, (+P.width || 20) * (m.crisp ? 5 * m.sc : m.fs * 0.52));
      if (b.tone === 'shout') maxW *= 0.9;
      var lines = wrap(s, maxW, m, b.tone), tw = 0; lines.forEach(function (l) { tw = Math.max(tw, measureStr(l, m, b.tone)); });
      var w = Math.ceil(tw + 2 * m.padX), h = Math.ceil(lines.length * m.lh - (m.crisp ? 2 * m.sc : (m.lh - m.fs) * 0.6) + 2 * m.padY);
      if (b.tone === 'alarm') w += m.crisp ? 8 * m.sc : Math.round(m.fs * 1.05);                 // room for the "!" badge
      if (b.tone === 'shout') { var sd = spikeD(m); w += 2 * sd; h += 2 * sd; }        // the spikes sit outside the text box on every side
      if (b.tone === 'think') { if (m.crisp) { w += 2 * m.sc; h += 6 * m.sc; } else { w += Math.round(m.fs * 0.4); h += Math.round(m.fs * 0.3); } }
      if (m.crisp) { w = Math.round(w); h = Math.round(h); }
      b.lines = lines; b.w = w; b.h = h; b.m = m; b.chars = lines.join('').length;
    }
    function spikeD(m) { return m.crisp ? 4 * m.sc : Math.round(m.fs * 0.62); }
    function lifeOf(b) { var type = P.cps > 0 ? b.chars / P.cps * 1000 : 0; return 260 + type + Math.max(+P.hold, b.chars * +P.read); }
    function maxN() { return +P.max > 0 ? +P.max : B().w <= 400 ? 3 : 4; }

    /* ---------- anchors ---------- */
    var cache = {};
    function anchor(id) {
      var a = call('getAnchor', id);
      if (a && num(+a.x) && num(+(a.top != null ? a.top : a.y))) { a = { x: +a.x, top: +(a.top != null ? a.top : a.y), w: num(+a.w) ? +a.w : 0, h: num(+a.h) ? +a.h : 0 }; cache[id] = a; return { a: a, fresh: true }; }
      if (cache[id]) return { a: cache[id], fresh: false };
      return null;
    }

    /* ---------- spawning ---------- */
    function say(id, text, o) {
      try {
        o = o || {}; if (id == null || text == null || String(text).trim() === '') return null;
        var tone = TONES[o.tone] ? o.tone : 'talk', prio = o.priority != null ? +o.priority : (o.event === 'idle' ? 0 : TONE_PRIO[tone]);
        if (!anchor(id)) { warn('noanchor-' + id, 'no anchor for speaker "' + id + '" (getAnchor returned nothing); the line is skipped'); return null; }
        var live = bubbles.filter(function (q) { return !q.gone && !q.ending; });
        var mine = live.filter(function (q) { return String(q.spk) === String(id); })[0];
        if (mine) {   // the speaker talks again: the same bubble takes the new line and re-pops in place
          if (mine.prio > prio && t - mine.born < lifeOf(mine) * 0.6) return null;
          mine.text = String(text); mine.tone = tone; mine.prio = prio; mine.event = o.event || null; mine.born = t; mine.rebump = t; mine.extra = +o.ms || 0; shape(mine);
          emit(mine); return mine.id;
        }
        if (live.length >= maxN()) {
          var weakest = live.slice().sort(function (a, b) { return a.prio - b.prio || a.born - b.born; })[0];
          if (!weakest || weakest.prio >= prio && prio < 2) return null;   // full: idle chatter and talk wait for room
          if (weakest.prio > prio) return null;
          endB(weakest);
        }
        var b = { repop: -1e9, id: ++seq, spk: id, text: String(text), tone: tone, prio: prio, event: o.event || null, born: t, rebump: -1e9, extra: +o.ms || 0, ox: 0, oy: 0, tx: 0, ty: 0, placed: false, vis: 1, cand: -1, ending: false, endT: 0, gone: false };
        shape(b); bubbles.push(b); place(); emit(b); return b.id;
      } catch (e) { warn('say', 'say() failed: ' + (e && e.message)); return null; }
    }
    function emit(b) { if (typeof opt.onBark === 'function') try { opt.onBark({ id: b.id, speaker: b.spk, text: b.text, tone: b.tone, event: b.event }); } catch (e) {} }
    function pickLine(voice, event, id) {
      var V = LN[voice] || LN[event === 'hurt' || event === 'kill' || event === 'lowhp' ? 'hero' : 'villager'] || {}, L = V[event];
      if (!L || !L.length) return null;
      var key = voice + '|' + event + '|' + id, n = picks[key] || 0; picks[key] = n + 1;
      return L[(n + (hashS(id) % L.length)) % L.length];
    }
    function bark(id, event, o) {
      try {
        o = o || {}; event = String(event || 'idle');
        var key = id + '|' + event, last = said[key], lastAny = said['*|' + event];
        if (o.cooldown == null && event !== 'idle' && +P.stagger > 0 && lastAny != null && t - lastAny < +P.stagger && String(said['*who|' + event]) !== String(id)) return null;   // a crowd noticing at once: one voice
        var cd = o.cooldown != null ? +o.cooldown : event === 'idle' ? Math.max(+P.cooldown, +P.idle * 1.5) : +P.cooldown;
        if (last != null && t - last < cd) return null;
        var text = o.text || pickLine(o.voice || 'villager', event, id);
        if (!text) return null;
        var r = say(id, text, { tone: o.tone || EVENT_TONE[event] || 'talk', event: event, priority: o.priority, ms: o.ms });
        if (r != null) { said[key] = t; said['*|' + event] = t; said['*who|' + event] = id; }
        return r;
      } catch (e) { warn('bark', 'bark() failed: ' + (e && e.message)); return null; }
    }
    function endB(b) { if (!b.ending) { b.ending = true; b.endT = t; } }

    /* ---------- placement (in update: the stored offsets are relative to the speaker's head) ---------- */
    function obstacles() {
      var o = call('getObstacles'); if (!o || !o.length) return [];
      var out = [];
      for (var i = 0; i < o.length; i++) { var r = o[i]; if (r && num(+r.x) && num(+r.y) && +r.w > 0 && +r.h > 0) out.push({ x: +r.x, y: +r.y, w: +r.w, h: +r.h, id: r.id, soft: !!r.soft, hard: !!r.hard }); }
      return out;
    }
    // candidate body positions around head point H (x = centre, y = top of head); side: where the tail leaves the body
    function candidates(b, A) {
      var m = b.m, w = b.w, h = b.h, up = A.top - m.gap - m.tail - h, hw = Math.max(A.w, m.fs) / 2, down = A.top + (A.h > 0 ? A.h : m.fs * 2) + m.gap + m.tail;
      return [
        { x: A.x - w / 2, y: up, side: 'b', pref: 0 },
        { x: A.x - w * 0.82, y: up, side: 'b', pref: 5 },
        { x: A.x - w * 0.18, y: up, side: 'b', pref: 5 },
        { x: A.x - w / 2, y: up - h * 0.55, side: 'b', pref: 9 },
        { x: A.x - hw - m.tail - w, y: A.top - h * 0.35, side: 'r', pref: 14 },
        { x: A.x + hw + m.tail, y: A.top - h * 0.35, side: 'l', pref: 14 },
        { x: A.x - w * 0.95, y: up - h * 0.6, side: 'b', pref: 16 },
        { x: A.x - w * 0.05, y: up - h * 0.6, side: 'b', pref: 16 },
        { x: A.x - w / 2, y: down, side: 't', pref: 26 },
        { x: A.x - w * 0.82, y: down, side: 't', pref: 30 },
        { x: A.x - w * 0.18, y: down, side: 't', pref: 30 },
        { x: A.x - hw - m.tail - w, y: up - h * 0.2, side: 'r', pref: 19 },   // up and out to a side: the way out of a melee cluster
        { x: A.x + hw + m.tail, y: up - h * 0.2, side: 'l', pref: 19 },
        { x: A.x - hw - m.tail * 1.9 - w, y: A.top - h * 0.3, side: 'r', pref: 21 },   // a little further out beside the head: clear of a neighbour's bubble
        { x: A.x + hw + m.tail * 1.9, y: A.top - h * 0.3, side: 'l', pref: 21 }
      ];
    }
    function offEdge(A, bb) { return A.x < bb.x || A.x > bb.x + bb.w || A.top > bb.y + bb.h || A.top + (A.h || 0) < bb.y; }
    // margin from the field edge: a bubble whose speaker is off screen keeps a full pointer's length inside
    function edgeMg(A, bb, m) { return offEdge(A, bb) ? m.margin + Math.round(m.tail * (m.crisp ? 2.2 : 2.5)) : m.margin; }
    // the body rect grown to hold its tail (or its off-screen pointer and chevron): what must stay off UI rects
    function reach(r, A, m, bb) {
      var below = A.h > 0 && r.y > A.top + A.h * 0.6, tx = A.x, ty = below ? A.top + A.h + m.gap : A.top - m.gap;
      var nx = clamp(tx, r.x, r.x + r.w), ny = clamp(ty, r.y, r.y + r.h), dx = tx - nx, dy = ty - ny, d = Math.hypot(dx, dy);
      if (d < 0.5) return r;
      var L = offEdge(A, bb) ? m.tail * (m.crisp ? 2 : 1.7) + (m.crisp ? 0 : m.fs) : Math.min(d, m.tail * 1.6), ex = nx + dx / d * L, ey = ny + dy / d * L;
      var x0 = Math.min(r.x, ex), y0 = Math.min(r.y, ey);
      return { x: x0, y: y0, w: Math.max(r.x + r.w, ex) - x0, h: Math.max(r.y + r.h, ey) - y0 };
    }
    function clampBody(x, y, w, h, bb, mg) {
      return { x: clamp(x, bb.x + mg, Math.max(bb.x + mg, bb.x + bb.w - mg - w)), y: clamp(y, bb.y + mg, Math.max(bb.y + mg, bb.y + bb.h - mg - h)) };
    }
    function place() {
      var bb = B(), obs = obstacles(); obsCache = obs;
      var acc = [], list = bubbles.filter(function (q) { return !q.gone; }).sort(function (a, b) { return b.prio - a.prio || a.id - b.id; });
      list.forEach(function (b) {
        var an = anchor(b.spk); if (!an) { endB(b); return; }
        if (!an.fresh && !b.ending) endB(b);   // the speaker is gone: finish quickly at its last spot
        var A = an.a, m = b.m, mg = edgeMg(A, bb, m), area = b.w * b.h, far = 0.6 * bb.w;
        var off = Math.max(bb.x - A.x, A.x - (bb.x + bb.w), bb.y - A.top, A.top - (bb.y + bb.h), 0);
        b.far = off > far;
        var best = null, cs = candidates(b, A);
        for (var i = 0; i < cs.length; i++) {
          var c = cs[i], p = clampBody(c.x, c.y, b.w, b.h, bb, mg), r = { x: p.x, y: p.y, w: b.w, h: b.h }, cost = c.pref;
          cost += Math.hypot(p.x - c.x, p.y - c.y) * 0.08;
          for (var j = 0; j < acc.length; j++) cost += 1200 * overlap(r, pad(acc[j], m.gap * 2)) / area;
          var ui = 0, rT = null;
          for (j = 0; j < obs.length; j++) {
            var o = obs[j], ov = overlap(r, o);
            if (o.id == null && !o.soft) {   // UI: the body never sits on it, and neither does the tail or the pointer
              if (ov) { cost += 900 * ov / area; ui += ov; }
              else { if (!rT) rT = reach(r, A, m, bb); if (overlap(rT, o)) cost += 160; }
              continue;
            }
            if (!ov) continue;
            if (o.id == null) cost += 30 * ov / area;
            else if (String(o.id) === String(b.spk)) cost += 300 * ov / area;
            else cost += (o.hard ? 900 : 420) * Math.max(ov / area, ov / (o.w * o.h));   // a small unit under a big bubble counts by how much of the unit is hidden
          }
          if (b.placed && i === b.cand) cost -= 35;      // stay put unless another spot is clearly better (no flip-flopping)
          if (!best || cost < best.cost) best = { cost: cost, x: p.x, y: p.y, side: c.side, i: i, ui: ui };
        }
        b.cand = best.i; b.side = best.side;
        b.tx = best.x - A.x; b.ty = best.y - A.top;
        if (!b.placed) { b.ox = b.tx; b.oy = b.ty; b.placed = true; }
        else if (Math.hypot(b.tx - b.ox, b.ty - b.oy) > Math.max(b.h, m.fs * 1.5)) { b.ox = b.tx; b.oy = b.ty; b.repop = t; }   // far move: re-pop there instead of sweeping across the screen
        b.covered = best.ui > area * 0.04;                // a window sits over every free spot: hide until it closes
        var r2 = { x: A.x + b.tx, y: A.top + b.ty, w: b.w, h: b.h };
        b.clash = acc.some(function (q) { return overlap(r2, q) > area * 0.2; });
        acc.push(r2);
      });
    }
    function pad(r, p) { return { x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p }; }

    /* ---------- clock ---------- */
    function update(dt) {
      try {
        dt = +dt; if (!num(dt) || dt < 0) dt = 0; if (dt > 250) dt = 250;
        t += dt;
        if (dt > 0 && +P.idle > 0 && typeof opt.speakers === 'function') idleTick();
        bubbles.forEach(function (b) {
          if (b.gone) return;
          var life = lifeOf(b) + b.extra;
          if (!b.ending && t - b.born >= life) endB(b);
          if (!b.ending && b.clash && b.prio <= 1 && t - b.born > 600) endB(b);   // low-priority chatter that has no room left goes early
          if (b.ending && t - b.endT >= 240) b.gone = true;
          var k = 1 - Math.exp(-dt / 100); b.ox += (b.tx - b.ox) * k; b.oy += (b.ty - b.oy) * k;
          var tv = b.covered || b.far ? 0 : 1, kv = 1 - Math.exp(-dt / 60); b.vis = tv === 0 ? 0 : b.vis + (tv - b.vis) * kv; if (Math.abs(tv - b.vis) < 0.01) b.vis = tv;   // hide at once, show with a quick fade
        });
        bubbles = bubbles.filter(function (b) { return !b.gone; });
        if (dt > 0 || bubbles.length) place();
      } catch (e) { warn('update', 'update() failed: ' + (e && e.message)); }
    }
    function idleTick() {
      if (idleNext == null) idleNext = t + +P.idle * 0.45;
      if (t < idleNext) return;
      idleNext = t + +P.idle * (0.8 + 0.4 * hash2(seq + 7, Math.floor(t / 97)));
      var S = call('speakers'); if (!S || !S.length) return;
      var bb = B(), busy = {};
      bubbles.forEach(function (b) { if (!b.gone) busy[String(b.spk)] = 1; });
      var ok = [];
      for (var i = 0; i < S.length; i++) {
        var s = S[i], id = s && typeof s === 'object' ? s.id : s, voice = s && typeof s === 'object' && s.voice ? s.voice : 'villager';
        if (id == null || busy[String(id)]) continue;
        var an = anchor(id); if (!an || !an.fresh) continue;
        if (an.a.x < bb.x || an.a.x > bb.x + bb.w || an.a.top < bb.y || an.a.top > bb.y + bb.h) continue;
        ok.push({ id: id, voice: voice });
      }
      if (!ok.length) return;
      var pick = ok[Math.floor(hash2(Math.floor(t / 113), ok.length) * ok.length) % ok.length];
      bark(pick.id, 'idle', { voice: pick.voice });
    }

    /* ---------- drawing ---------- */
    function colours(tone) {
      var pal = PAL[P.palette] || PAL.light, C = (pal[tone] || pal.talk).slice();
      if (P.palette === 'skin' && SK) {
        var tk = function (p, d) { try { var v = SK.token(p); return typeof v === 'string' && v.charAt(0) === '#' ? v : d; } catch (e) { return d; } };
        var L = PAL.light[tone] || PAL.light.talk;
        C = [tk('paper', L[0]), L[1], tk('ink', L[2]), tk('ink', L[3]), tk(tone === 'hurt' ? 'fx.hot' : 'fx.crit', L[4] || '#e8402e')];
        if (tone === 'alarm') C[1] = tk('fx.crit', L[1]); if (tone === 'hurt') C[1] = L[1];
      }
      return C;
    }
    // tail tip: the speaker's head (screen px); the tail leaves the body on the side facing it
    function tailGeom(body, A, m, bb) {
      var below = A.h > 0 && body.y > A.top + A.h * 0.6, tip = { x: A.x, y: below ? A.top + A.h + m.gap : A.top - m.gap }, cx = body.x + body.w / 2, cy = body.y + body.h / 2, side;
      var inX = tip.x > body.x + m.r && tip.x < body.x + body.w - m.r;
      if (tip.y >= body.y + body.h) side = inX || Math.abs(tip.x - cx) / body.w < (tip.y - cy) / body.h ? 'b' : tip.x < cx ? 'l' : 'r';
      else if (tip.y <= body.y) side = inX || Math.abs(tip.x - cx) / body.w < (cy - tip.y) / body.h ? 't' : tip.x < cx ? 'l' : 'r';
      else if (tip.x <= body.x) side = 'l'; else if (tip.x >= body.x + body.w) side = 'r'; else return null;   // speaker behind the bubble: no tail
      var tw = Math.max(m.crisp ? 3 * m.sc : 4, Math.round(m.fs * 0.4)), base, dir, pointer = offEdge(A, bb), rr = Math.min(m.r, body.h / 2, body.w / 2);
      // smooth bubbles: the tail root sits a little to one side of the speaker so the tail sweeps toward the head (a comic-book tail, not a spike)
      var lean = m.crisp || pointer ? 0 : tw * clamp(0.9 + (cx - tip.x) / (body.w * 0.2), -1.1, 1.1);
      if (side === 'b' || side === 't') { var bx = clamp(tip.x + lean, body.x + rr + tw, body.x + body.w - rr - tw); if (body.w < 2 * (rr + tw)) bx = cx; base = { x: bx, y: side === 'b' ? body.y + body.h : body.y }; dir = side === 'b' ? 1 : -1; }
      else { var by = clamp(tip.y - Math.abs(lean) * 0.6, body.y + rr + tw, body.y + body.h - rr - tw); if (body.h < 2 * (rr + tw)) by = cy; base = { x: side === 'r' ? body.x + body.w : body.x, y: by }; dir = side === 'r' ? 1 : -1; }
      var dx = tip.x - base.x, dy = tip.y - base.y, d = Math.hypot(dx, dy) || 1, maxL = m.tail * 1.6;
      if (pointer) { tw = Math.round(tw * 1.3); maxL = m.tail * (m.crisp ? 2 : 1.7); }   // off screen: a full arrow toward the speaker
      var L = pointer ? maxL : Math.min(d, maxL), end = { x: base.x + dx / d * L, y: base.y + dy / d * L };
      // the tail never folds back into the body
      if (side === 'b') end.y = Math.max(end.y, base.y + m.tail * 0.5); if (side === 't') end.y = Math.min(end.y, base.y - m.tail * 0.5);
      if (side === 'r') end.x = Math.max(end.x, base.x + m.tail * 0.5); if (side === 'l') end.x = Math.min(end.x, base.x - m.tail * 0.5);
      var ux = end.x - base.x, uy = end.y - base.y, ul = Math.hypot(ux, uy) || 1;
      return { side: side, base: base, end: end, tw: tw, pointer: pointer, dir: dir, tip: tip, ux: ux / ul, uy: uy / ul };
    }
    // a curved horn from the body edge (corners a -> b, in outline order) to the tail tip
    function horn(g, T, ax, ay, bx, by) {
      var e = T.end, v = T.side === 'b' || T.side === 't', k1 = v ? 0.1 : 0.74, k2 = v ? 0.74 : 0.1;
      g.lineTo(ax, ay); g.quadraticCurveTo(ax + (e.x - ax) * k1, ay + (e.y - ay) * k2, e.x, e.y); g.quadraticCurveTo(bx + (e.x - bx) * k1, by + (e.y - by) * k2, bx, by);
    }
    function bubblePath(g, x, y, w, h, r, T, tone, m) {
      g.beginPath();
      if (tone === 'think') { cloud(g, x, y, w, h, m); return; }
      if (tone === 'shout') { spikes(g, x, y, w, h, m, T, 0.74, 0, 7); return; }
      r = Math.min(r, h / 2, w / 2);
      var tw = T ? T.tw : 0;
      g.moveTo(x + r, y);
      if (T && T.side === 't') horn(g, T, T.base.x - tw, y, T.base.x + tw, y);
      g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
      if (T && T.side === 'r') horn(g, T, x + w, T.base.y - tw, x + w, T.base.y + tw);
      g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
      if (T && T.side === 'b') horn(g, T, T.base.x + tw, y + h, T.base.x - tw, y + h);
      g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
      if (T && T.side === 'l') horn(g, T, x, T.base.y + tw, x, T.base.y - tw);
      g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r);
      g.closePath();
    }
    function cloud(g, x, y, w, h, m) {
      var n = Math.max(3, Math.round(w / (m.fs * 1.5))), rr = h * 0.3, cy = y + h / 2, i;
      for (i = 0; i < n; i++) {
        var u = (i + 0.5) / n, px = x + rr + (w - 2 * rr) * u, k1 = 1.02 + 0.14 * hash2(i, 3), k2 = 1.02 + 0.14 * hash2(i, 5), px2 = px + (i % 2 ? 1 : -1) * rr * 0.18;
        g.moveTo(px + rr * k1, y + rr); g.arc(px, y + rr, rr * k1, 0, Math.PI * 2); g.moveTo(px2 + rr * k2, y + h - rr); g.arc(px2, y + h - rr, rr * k2, 0, Math.PI * 2);
      }
      g.moveTo(x + rr * 2.6, cy); g.arc(x + rr * 1.3, cy, rr * 1.3, 0, Math.PI * 2); g.moveTo(x + w, cy); g.arc(x + w - rr * 1.3, cy, rr * 1.3, 0, Math.PI * 2);
      g.rect(x + rr, y + rr, w - 2 * rr, h - 2 * rr);
    }
    // a starburst around the text box; reach: how far the points go (1 = the full margin), phase: shifts the points half a step (the back burst)
    function spikes(g, x, y, w, h, m, T, reach, phase, seed) {
      var d = spikeD(m), cx0 = x + d, cy0 = y + d, cw = w - 2 * d, ch = h - 2 * d, per = 2 * (cw + ch), step = m.fs * 0.66, n = Math.max(10, Math.round(per / step / 2) * 2), i;
      function at(sv) {   // a point on the core rect perimeter (clockwise from the top-left) and its outward normal
        sv = ((sv % per) + per) % per;
        if (sv < cw) return [cx0 + sv, cy0, 0, -1]; sv -= cw;
        if (sv < ch) return [cx0 + cw, cy0 + sv, 1, 0]; sv -= ch;
        if (sv < cw) return [cx0 + cw - sv, cy0 + ch, 0, 1]; sv -= cw;
        return [cx0, cy0 + ch - sv, -1, 0];
      }
      for (i = 0; i < n; i++) {
        var q = at((i + 0.5 + phase) * per / n), out = i % 2 === 0;
        var k = out ? d * reach * (0.8 + 0.2 * hash2(i, seed)) : -d * 0.1, px = q[0] + q[2] * k, py = q[1] + q[3] * k;
        if (out) { var cr = Math.abs(q[0] - (cx0 + cw / 2)) / (cw / 2), cv = Math.abs(q[1] - (cy0 + ch / 2)) / (ch / 2); if (cr > 0.86 && cv > 0.6) { px += (q[0] > cx0 + cw / 2 ? 1 : -1) * d * 0.45 * reach * Math.abs(q[3]); py += (q[1] > cy0 + ch / 2 ? 1 : -1) * d * 0.45 * reach * Math.abs(q[2]); } }
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      if (T) {
        var tw = T.tw, bx = clamp(T.base.x, cx0 + tw, cx0 + cw - tw), by = clamp(T.base.y, cy0 + tw, cy0 + ch - tw);
        if (T.side === 'b') by = cy0 + ch - tw; if (T.side === 't') by = cy0 + tw; if (T.side === 'r') bx = cx0 + cw - tw; if (T.side === 'l') bx = cx0 + tw;
        // same (clockwise) winding as the starburst, so the nonzero fill unions them instead of punching a hole
        if (T.side === 'b') { g.moveTo(bx + tw, by); g.lineTo(T.end.x, T.end.y); g.lineTo(bx - tw, by); }
        else if (T.side === 't') { g.moveTo(bx - tw, by); g.lineTo(T.end.x, T.end.y); g.lineTo(bx + tw, by); }
        else if (T.side === 'r') { g.moveTo(bx, by - tw); g.lineTo(T.end.x, T.end.y); g.lineTo(bx, by + tw); }
        else { g.moveTo(bx, by + tw); g.lineTo(T.end.x, T.end.y); g.lineTo(bx, by - tw); }
        g.closePath();
      }
    }
    function puffs(body, T, m) {   // a thought's trail: three shrinking puffs from the cloud to the thinker
      var out = [], d = [0.2, 0.55, 0.86], rs = [0.3, 0.2, 0.12], k = T.pointer ? 0.55 : 1, i;
      for (i = 0; i < 3; i++) out.push({ x: T.base.x + (T.tip.x - T.base.x) * d[i] * k, y: T.base.y + (T.tip.y - T.base.y) * d[i] * k, r: m.fs * rs[i] });
      return out;
    }
    /* The whole bubble is painted on one offscreen layer at device resolution (ink edge, cel-shaded fill, rim light), then stamped with
       a drop shadow: overlapping sub-paths (cloud lobes, starburst + tail) never show inner seams, even with translucent palettes. */
    var LAYER = null;
    function paintLayer(b, body, T, lw, g, C) {
      try {
        var m = b.m, tone = b.tone, k = Math.min(8, Math.max(1, devScale(g))), pad = lw * 2 + 3, i;
        var x0 = Math.min(body.x, T ? T.end.x : body.x) - pad, y0 = Math.min(body.y, T ? T.end.y : body.y) - pad;
        var x1 = Math.max(body.x + body.w, T ? T.end.x : 0) + pad, y1 = Math.max(body.y + body.h, T ? T.end.y : 0) + pad;
        var W = Math.ceil((x1 - x0) * k), H = Math.ceil((y1 - y0) * k);
        if (!LAYER) LAYER = mk(W, H); if (!LAYER) return null;
        if (LAYER.width < W || LAYER.height < H) { LAYER.width = Math.max(LAYER.width, W); LAYER.height = Math.max(LAYER.height, H); }
        var lg = LAYER.getContext('2d'); lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, LAYER.width, LAYER.height);
        lg.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
        lg.lineJoin = 'round'; lg.lineCap = 'butt'; lg.strokeStyle = C[2];
        var path = function (dx, dy) { bubblePath(lg, body.x + dx, body.y + dy, body.w, body.h, m.r, T && (dx || dy) ? shiftT(T, dx, dy) : T, tone, m); };
        if (tone === 'shout') {   // a second, coloured burst behind: its points show between the front ones
          lg.beginPath(); spikes(lg, body.x, body.y, body.w, body.h, m, null, 1, 1, 31);
          lg.lineWidth = lw * 2; lg.stroke(); lg.fillStyle = C[4] || C[1]; lg.fill();
        }
        var PF = tone === 'think' && T ? puffs(body, T, m) : null;
        var shapeP = function (dx, dy) { path(dx, dy); if (PF) for (i = 0; i < PF.length; i++) { lg.moveTo(PF[i].x + dx + PF[i].r, PF[i].y + dy); lg.arc(PF[i].x + dx, PF[i].y + dy, PF[i].r, 0, Math.PI * 2); } };
        shapeP(0, 0);
        lg.lineWidth = lw * 2; if (tone === 'whisper') lg.setLineDash([lw * 2.6, lw * 2.2]);
        lg.stroke(); lg.setLineDash([]);
        lg.globalCompositeOperation = 'destination-out'; lg.fillStyle = '#000'; lg.fill(); lg.globalCompositeOperation = 'source-over';
        if (tone === 'whisper') { lg.fillStyle = C[0]; lg.fill(); return { c: LAYER, sw: W, sh: H, x: x0, y: y0, w: W / k, h: H / k }; }
        lg.fillStyle = C[1]; lg.fill();
        lg.save(); lg.clip();
        // the lit face: the same shape moved up, so the shade colour stays as a crescent along the bottom
        shapeP(0, -Math.max(1.5, m.fs * 0.17)); lg.clip(); lg.fillStyle = C[0]; lg.fill();
        if (P.palette === 'parchment') {   // paper: a burnt rim, grain flecks and fibres instead of the gloss
          var rim = lg.createRadialGradient(body.x + body.w / 2, body.y + body.h / 2, Math.min(body.w, body.h) * 0.3, body.x + body.w / 2, body.y + body.h / 2, Math.max(body.w, body.h) * 0.62);
          rim.addColorStop(0, 'rgba(120,70,20,0)'); rim.addColorStop(1, 'rgba(120,70,20,0.26)'); lg.fillStyle = rim; lg.fillRect(body.x - 8, body.y - 8, body.w + 16, body.h + 16);
          for (i = 0; i < Math.round(body.w * body.h / 90); i++) { var gx = body.x + hash2(b.id * 31 + i, 1) * body.w, gy = body.y + hash2(b.id * 31 + i, 2) * body.h, gk = hash2(i, b.id);
            lg.fillStyle = gk < 0.5 ? 'rgba(110,64,20,0.16)' : 'rgba(255,248,225,0.30)'; lg.fillRect(gx, gy, gk < 0.85 ? 1.2 : m.fs * 0.5, gk < 0.85 ? 1.2 : 0.8); }
        } else if (tone !== 'alarm' || P.palette !== 'light') {   // rim light: a thin band along the top-left edge (the face is painted again, moved down-right, over a white wash)
          var span = Math.min(body.w, m.fs * 8), rl = lg.createLinearGradient(body.x, body.y, body.x + span * 0.6, body.y + Math.max(body.h, m.fs * 1.6) * 1.2), ra = P.palette === 'dark' ? 0.22 : 0.9;
          rl.addColorStop(0, 'rgba(255,255,255,' + ra + ')'); rl.addColorStop(0.5, 'rgba(255,255,255,' + ra * 0.55 + ')'); rl.addColorStop(1, 'rgba(255,255,255,0)');
          lg.fillStyle = rl; lg.fillRect(x0, y0, x1 - x0, y1 - y0);
          shapeP(lw * 0.95, lw * 0.95); lg.fillStyle = C[0]; lg.fill();
        } else {
          var al = lg.createLinearGradient(0, body.y, 0, body.y + body.h * 0.6); al.addColorStop(0, 'rgba(255,255,255,0.55)'); al.addColorStop(1, 'rgba(255,255,255,0)'); lg.fillStyle = al; lg.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
        lg.restore();
        return { c: LAYER, sw: W, sh: H, x: x0, y: y0, w: W / k, h: H / k };   // one shared layer: stamped at once, before the next bubble reuses it
      } catch (e) { return null; }
    }
    function shiftT(T, dx, dy) { return { side: T.side, base: { x: T.base.x + dx, y: T.base.y + dy }, end: { x: T.end.x + dx, y: T.end.y + dy }, tw: T.tw }; }
    function drawSmooth(g, b, body, T, a, ds, C) {
      var m = b.m, age = t - b.born, re = b.rebump === b.born, pop = +P.pop, s = re ? 1 + 0.1 * pop * Math.sin(clamp(age / 260, 0, 1) * Math.PI) : popScale(age, pop), al = (re ? 1 : Math.min(1, age / 70)) * b.vis, ox = 0, oy = 0;
      // squash and stretch plus a small rock while the pop settles (all from the bubble's age)
      var wob = age < 520 ? Math.exp(-age / 120) : 0, st = 0.16 * pop * wob * Math.sin(age / 42), rot = (re ? 0.5 : 1) * 0.09 * pop * wob * Math.sin(age / 58 + 0.6) * (b.id % 2 ? 1 : -1);
      if (t - b.repop < 160) { var ru = (t - b.repop) / 160; s *= 0.86 + 0.14 * easeOut(ru); al *= 0.35 + 0.65 * ru; }
      if (b.ending) { var u = clamp((t - b.endT) / 240, 0, 1); al *= 1 - u * u; s *= 1 - 0.3 * u * u; oy -= m.fs * 0.2 * easeOut(u); }
      if ((b.tone === 'hurt' || b.tone === 'shout') && age < 420) { var amp = m.fs * (b.tone === 'hurt' ? 0.16 : 0.1) * (1 - age / 420), ph = Math.floor(age / 34); ox += (hash2(b.id, ph) - 0.5) * 2 * amp; oy += (hash2(b.id + 99, ph) - 0.5) * 2 * amp; }
      if (al <= 0.01) return;
      var px = T ? T.end.x : body.x + body.w / 2, py = T ? T.end.y : body.y + body.h;
      g.save();
      g.globalAlpha *= al;
      g.translate(px + ox, py + oy); g.rotate(rot); g.scale(s * (1 - st * 0.6), s * (1 + st)); g.translate(-px, -py);
      var lw = Math.max(1.5, m.fs * 0.135), tone = b.tone, dark = P.palette === 'dark';
      var L = paintLayer(b, body, T, lw, g, C);
      if (L) {
        g.save();
        g.shadowColor = dark ? 'rgba(0,0,0,0.6)' : tone === 'whisper' ? 'rgba(14,8,26,0.22)' : 'rgba(14,8,26,0.42)'; g.shadowBlur = m.fs * 0.3 * ds; g.shadowOffsetY = m.fs * 0.26 * ds;
        g.drawImage(L.c, 0, 0, L.sw, L.sh, L.x, L.y, L.w, L.h);
        g.restore();
      } else { bubblePath(g, body.x, body.y, body.w, body.h, m.r, T, tone, m); g.fillStyle = C[0]; g.fill(); g.lineWidth = lw; g.strokeStyle = C[2]; g.lineJoin = 'round'; g.stroke(); }
      // off-screen pointer: a chevron ahead of the tail tip, pulsing toward the speaker
      if (T && T.pointer) {
        var pu = 0.5 + 0.5 * Math.sin(t / 150), cd = m.fs * (0.42 + 0.2 * pu), cs = m.fs * 0.3, qx = T.end.x + T.ux * cd, qy = T.end.y + T.uy * cd, nx = -T.uy, ny = T.ux;
        g.beginPath(); g.moveTo(qx - T.ux * cs + nx * cs, qy - T.uy * cs + ny * cs); g.lineTo(qx, qy); g.lineTo(qx - T.ux * cs - nx * cs, qy - T.uy * cs - ny * cs);
        g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = lw * 2.6; g.strokeStyle = C[2]; g.stroke(); g.lineWidth = lw * 1.1; g.strokeStyle = dark ? solid(C[3]) : solid(C[0]); g.stroke();
      }
      // hurt: three impact ticks burst from the top corner away from the tail
      if (tone === 'hurt') {
        // the corner away from the tail, unless another unit stands there (the ticks must not read as that unit being hit)
        var busy = function (lf) { var zx = lf ? body.x - m.fs * 1.2 : body.x + body.w - m.fs * 0.3, z = { x: zx, y: body.y - m.fs * 1.2, w: m.fs * 1.5, h: m.fs * 1.8 }; return obsCache.some(function (o) { return o.id != null && String(o.id) !== String(b.spk) && overlap(z, o) > 0; }); };
        var left = !!(T && T.side === 'r'); if (busy(left)) left = !left;
        var hx = left ? body.x + m.fs * 0.25 : body.x + body.w - m.fs * 0.25, hy = body.y + m.fs * 0.25, gu = easeOut(age / 170), sg = left ? -1 : 1, q;
        g.lineJoin = 'round';
        for (q = busy(left) ? 3 : 0; q < 3; q++) {
          var an = -Math.PI / 2 + sg * (0.12 + q * 0.6), r0 = m.fs * 0.72, r1 = m.fs * (0.72 + (q === 1 ? 0.6 : 0.4) * gu), c0 = Math.cos(an), s0 = Math.sin(an), hw = m.fs * 0.1;
          g.beginPath(); g.moveTo(hx + c0 * r0 - s0 * hw, hy + s0 * r0 + c0 * hw); g.lineTo(hx + c0 * r1, hy + s0 * r1); g.lineTo(hx + c0 * r0 + s0 * hw, hy + s0 * r0 - c0 * hw); g.closePath();
          g.lineWidth = lw * 1.5; g.strokeStyle = C[2]; g.stroke(); g.fillStyle = C[4]; g.fill();
        }
      }
      // the "!" badge on alarm bubbles: pops in after the body with a wiggle and one ring
      var tx0 = body.x + m.padX;
      if (tone === 'alarm') {
        var br = m.fs * 0.6, bcx = body.x + m.padX * 0.5 + br * 0.72, bcy = b.lines.length > 1 ? body.y + m.padY + m.fs * 0.56 : body.y + body.h / 2, ba = age - 60, bs = popScale(ba, 1.4);
        g.save(); g.translate(bcx, bcy);
        if (ba > 0 && ba < 460) { var rg = ba / 460; g.beginPath(); g.arc(0, 0, br * (1 + 1.1 * easeOut(rg)), 0, Math.PI * 2); g.lineWidth = lw * (1.2 - rg); g.strokeStyle = C[4]; g.globalAlpha *= 1 - rg; g.stroke(); g.globalAlpha /= 1 - rg; }
        g.rotate(ba > 0 && ba < 600 ? 0.4 * Math.exp(-ba / 150) * Math.sin(ba / 40) : 0); g.scale(bs, bs);
        g.beginPath(); g.arc(0, 0, br, 0, Math.PI * 2); g.fillStyle = C[4]; g.fill();
        g.save(); g.clip(); g.beginPath(); g.arc(0, br * 0.5, br * 1.05, 0, Math.PI * 2); g.fillStyle = 'rgba(90,0,10,0.28)'; g.globalCompositeOperation = 'source-atop'; g.fillRect(-br, br * 0.45, br * 2, br); g.restore();
        g.beginPath(); g.arc(0, 0, br, 0, Math.PI * 2); g.lineWidth = lw * 0.85; g.strokeStyle = C[2]; g.stroke();
        g.beginPath(); g.arc(-br * 0.2, -br * 0.2, br * 0.62, Math.PI * 1.02, Math.PI * 1.5); g.lineWidth = lw * 0.6; g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,0.6)'; g.stroke();
        g.fillStyle = '#fff'; var ew = br * 0.34;
        g.beginPath(); g.moveTo(-ew * 0.62, -br * 0.6); g.lineTo(ew * 0.62, -br * 0.6); g.lineTo(ew * 0.36, br * 0.12); g.lineTo(-ew * 0.36, br * 0.12); g.closePath(); g.lineJoin = 'round'; g.lineWidth = ew * 0.3; g.strokeStyle = '#fff'; g.stroke(); g.fill();
        g.beginPath(); g.arc(0, br * 0.47, ew * 0.58, 0, Math.PI * 2); g.fill();
        g.restore(); tx0 += Math.round(m.fs * 1.05);
      }
      if (tone === 'think') tx0 += Math.round(m.fs * 0.2);
      // text: typed in, each new letter rises into place
      var cps = +P.cps, shownF = cps > 0 ? Math.max(0, age - 80) / 1000 * cps : 1e9, full = Math.floor(shownF), frac = shownF - full;
      g.font = fontOf(tone, m.fs); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = C[3];
      var fsT = toneFs(tone, m.fs), ty0 = body.y + m.padY + m.fs * 0.86 + (tone === 'shout' ? spikeD(m) + (fsT - m.fs) * 0.4 : tone === 'think' ? m.fs * 0.15 : 0), left2 = full, i;
      for (i = 0; i < b.lines.length && left2 >= 0; i++) {
        var Ln = b.lines[i], lx = tone === 'shout' ? body.x + (body.w - measureStr(Ln, m, tone)) / 2 : tx0, yy = ty0 + i * m.lh;
        if (left2 >= Ln.length) { g.fillText(Ln, lx, yy); left2 -= Ln.length; continue; }
        if (left2 > 0) g.fillText(Ln.slice(0, left2), lx, yy);
        var ch = Ln.charAt(left2), ga = g.globalAlpha;
        if (ch && ch !== ' ') { g.globalAlpha = ga * Math.min(1, frac * 1.6); g.fillText(ch, lx + measureStr(Ln.slice(0, left2), m, tone), yy + m.fs * 0.3 * (1 - easeOut(frac))); g.globalAlpha = ga; }
        break;
      }
      g.restore();
    }

    /* crisp: one cell = sc px. The bubble (body + tail) is built as a small mask, then every cell is classified: 1 px ink outline around
       the silhouette (clean stair-step corners), a lit top row, a shaded bottom row, a 1 px drop shadow under the whole shape. */
    var RC = {}, rcN = 0;
    function textRaster(str, col, sc) {
      var key = str + '|' + col + '|' + sc; if (RC[key]) return RC[key]; if (rcN > 400) { RC = {}; rcN = 0; } rcN++;
      var w = Math.max(1, bmpWidth(str) * sc), c = mk(w, 8 * sc); if (!c) return null;
      var g = c.getContext('2d'), x = 0; g.fillStyle = col;
      var adv = [];
      for (var i = 0; i < str.length; i++) {
        var ch = str.charAt(i); adv.push(x);
        if (ch !== ' ') { var G = glyph(ch); for (var r = 0; r < G.rows.length; r++) for (var q = 0; q < G.rows[r].length; q++) if (G.rows[r].charAt(q) === '#') g.fillRect((x + q) * sc, r * sc, sc, sc); }
        x += bmpAdv(ch);
      }
      adv.push(x);
      return (RC[key] = { c: c, adv: adv });
    }
    function rgbOf(c) {
      c = solid(c); var n = /^#([0-9a-f]{6})$/i.exec(c); if (n) { var v = parseInt(n[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
      n = /^#([0-9a-f]{3})$/i.exec(c); if (n) { var s = n[1]; return [parseInt(s.charAt(0) + s.charAt(0), 16), parseInt(s.charAt(1) + s.charAt(1), 16), parseInt(s.charAt(2) + s.charAt(2), 16)]; }
      return [255, 255, 255];
    }
    var MG = 11, SP = {}, spN = 0;
    var TRI = [3, 2, 1, 0, 1, 2], BUMP = [2, 2, 1, 0, 1, 2];
    // tail: { side, at (cell along the edge), len, lean } in body cells, or null
    function crispSprite(tone, wc, hc, tl, C, small) {
      var key = [tone, wc, hc, tl ? tl.side + tl.at + '_' + tl.len + '_' + tl.lean : '-', C.join(','), P.palette, small ? 1 : 0].join('|');
      if (SP[key]) return SP[key]; if (spN > 80) { SP = {}; spN = 0; } spN++;
      var W = wc + 2 * MG, H = hc + 2 * MG, M = new Uint8Array(W * H), x, y, i;
      var set = function (xx, yy, v) { xx += MG; yy += MG; if (xx > 0 && yy > 0 && xx < W - 1 && yy < H - 2) M[yy * W + xx] = v || 1; };
      var shout = tone === 'shout' && !small, think = tone === 'think' && !small, ix = shout ? 4 : think ? 1 : 0, iy = shout ? 4 : think ? 3 : 0;
      var fw = wc - 2, fh = hc - 2;   // the fill box (the outline is the ring of cells around the mask)
      for (y = 0; y < fh; y++) for (x = 0; x < fw; x++) {
        var ex = Math.min(x, fw - 1 - x), ey = Math.min(y, fh - 1 - y), on, v = 1;
        if (shout) {
          var dx = ix - 1 - ex, dy = iy - 1 - ey, mx = Math.abs(x - (fw >> 1)), my = Math.abs(y - (fh >> 1));   // d > 0: outside the core box, in the spike margin
          if (dx <= 0 && dy <= 0) on = true;
          else if (dx > 0 && dy > 0) { on = dx + dy <= 3; v = 2; }
          else if (dy > 0) { on = dy <= TRI[mx % 6]; v = Math.floor((mx + 3) / 6) % 2 ? 2 : 1; }
          else { on = dx <= TRI[my % 6]; v = Math.floor((my + 3) / 6) % 2 ? 2 : 1; }
        } else if (think) {
          var ty = iy - 1 - ey, mxx = Math.abs(x - (fw >> 1));
          on = ty <= 0 ? ex > 0 || (ey > iy && ey !== iy + 3) || fh < 12 + 2 * iy : (ty <= BUMP[mxx % 6] && ex >= (ty > 1 ? 2 : 1));
        } else on = fh >= 12 && fw >= 12 ? ex + ey >= 2 && !(ex === 0 && ey === 1) && !(ex === 1 && ey === 0) || ex + ey >= 3 : ex + ey >= 1;
        if (on) set(x + 1, y + 1, v);
      }
      if (tl) {
        var vert = tl.side === 'b' || tl.side === 't', start = vert ? (tl.side === 'b' ? hc - 1 - iy : iy) : (tl.side === 'r' ? wc - 1 - ix : ix), dir = tl.side === 'b' || tl.side === 'r' ? 1 : -1, n = tl.len + (vert ? iy : ix);
        if (tone === 'think') {
          for (i = 0; i < 2; i++) { var pd = Math.round((vert ? iy : ix) + 1 + tl.len * (i === 0 ? 0.3 : 0.85)), pc = tl.at + Math.round(tl.lean * pd), px0 = vert ? pc : start + dir * pd, py0 = vert ? start + dir * pd : pc;
            set(px0, py0); if (i === 0) { set(px0 + 1, py0); set(px0, py0 + dir); set(px0 + 1, py0 + dir); } }
        } else for (i = 0; i < n; i++) {
          var hf = i < n * 0.5 && n - i > 2 ? 1 : 0, c0 = tl.at + Math.round(tl.lean * Math.max(0, i - (vert ? iy : ix))), q;
          for (q = -hf; q <= hf; q++) { if (vert) set(c0 + q, start + dir * i); else set(start + dir * i, c0 + q); }
        }
      }
      var cv = mk(W, H); if (!cv) return null;
      var g = cv.getContext('2d'), im = g.createImageData(W, H), D = im.data, lightPal = P.palette !== 'dark', wh = tone === 'whisper';
      var cF = rgbOf(C[0]), cS = rgbOf(C[1]), cE = rgbOf(C[2]), cA = rgbOf(C[4] || C[1]), cH = lightPal && !wh ? [255, 255, 255] : cF;
      var put = function (p, c, a) { D[p * 4] = c[0]; D[p * 4 + 1] = c[1]; D[p * 4 + 2] = c[2]; D[p * 4 + 3] = a == null ? 255 : a; };
      for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
        var p = y * W + x, mv = M[p];
        if (mv) { put(p, !M[p + W] ? (mv === 2 ? cA : cS) : !M[p - W] && mv !== 2 ? cH : mv === 2 ? cA : cF); continue; }
        if (M[p - 1] || M[p + 1] || M[p - W] || M[p + W]) { if (!wh || ((x + y) & 3) < 2) put(p, cE); else put(p, cS); continue; }
        var up = p - W; if (!M[up] && y > 1 && (M[up - 1] || M[up + 1] || M[up - W])) put(p, [8, 6, 20], 105);   // drop shadow: one cell under the outline
      }
      g.putImageData(im, 0, 0);
      return (SP[key] = cv);
    }
    var BADGE = ['.#####.', '###o###', '###o###', '###o###', '#######', '###o###', '.#####.'];
    function drawCrisp(g, b, body, T, ds, C) {
      // crisp never blends (a half-alpha bubble reads as a grey ghost on pixel art): a small seed, the full bubble one cell high, rest; end: one cell low, gone
      var m = b.m, sc = m.sc, age = t - b.born, re = b.rebump === b.born, stage = re ? 2 : age < 50 ? 0 : age < 110 ? 1 : 2;
      if (b.vis < 0.5) return;
      if (b.ending) { var u = (t - b.endT) / 240; if (u >= 0.75) return; if (u >= 0.4) stage = 3; }
      var x = Math.round(body.x / sc) * sc, y = Math.round(body.y / sc) * sc, wc = Math.round(body.w / sc), hc = Math.round(body.h / sc), tone = b.tone;
      C = C.map(solid);   // pixel art is opaque
      var sh = tone === 'shout' ? 4 : 0, think = tone === 'think', ix = sh || (think ? 1 : 0), iy = sh || (think ? 3 : 0);
      g.save(); g.imageSmoothingEnabled = false;
      var tl = null;
      if (T) {
        var vert = T.side === 'b' || T.side === 't', len = Math.max(2, Math.min(MG - 2 - (vert ? iy : ix), Math.round(Math.hypot(T.end.x - T.base.x, T.end.y - T.base.y) / sc)));
        var lean = vert ? (T.end.x - T.base.x) / Math.max(1, Math.abs(T.end.y - T.base.y)) : (T.end.y - T.base.y) / Math.max(1, Math.abs(T.end.x - T.base.x));
        tl = { side: T.side, at: vert ? clamp(Math.round((T.base.x - x) / sc), 3 + ix, wc - 4 - ix) : clamp(Math.round((T.base.y - y) / sc), 3 + iy, hc - 4 - iy), len: len, lean: Math.round(clamp(lean, -1, 1) * 4) / 4 };
      }
      if (stage === 0) {
        var w2 = clamp(Math.round(wc * 0.4), 6, 16), h2 = clamp(Math.round(hc * 0.55), 5, 8), fx = tl && (tl.side === 'b' || tl.side === 't') ? tl.at / wc : tl && tl.side === 'l' ? 0 : tl && tl.side === 'r' ? 1 : 0.5, fy = tl && tl.side === 't' ? 0 : tl && (tl.side === 'l' || tl.side === 'r') ? tl.at / hc : 1;
        var s0 = crispSprite(tone === 'shout' || think ? 'talk' : tone, w2, h2, null, C, true);
        if (s0) g.drawImage(s0, x + (Math.round((wc - w2) * fx) - MG) * sc, y + (Math.round((hc - h2) * fy) - MG) * sc, s0.width * sc, s0.height * sc);
        g.restore(); return;
      }
      if (stage === 1) y += (T && T.side === 't' ? 1 : -1) * sc;
      if (stage === 3) y += (T && T.side === 't' ? -1 : 1) * sc;
      if ((tone === 'hurt' || tone === 'shout') && age < 300) x += (Math.floor(age / 50) % 2 ? 1 : -1) * sc;
      var S = crispSprite(tone, wc, hc, tl, C, false);
      if (S) g.drawImage(S, x - MG * sc, y - MG * sc, S.width * sc, S.height * sc);
      var px = function (xx, yy, ww, hh, col) { g.fillStyle = col; g.fillRect(xx, yy, ww, hh); };
      var cx = x + ix * sc, cy = y + iy * sc, ch = (hc - 2 * iy) * sc, cw = (wc - 2 * ix) * sc, tx0 = cx + m.padX, ty0 = cy + m.padY, i, q;
      if (tone === 'alarm') {   // round "!" badge
        var by = b.lines.length > 1 ? cy + m.padY : cy + Math.round((ch / sc - 7) / 2) * sc, bx = cx + 3 * sc;
        for (i = 0; i < 7; i++) for (q = 0; q < 7; q++) { var k = BADGE[i].charAt(q); if (k !== '.') px(bx + q * sc, by + i * sc, sc, sc, k === 'o' ? '#ffffff' : i === 6 || (i === 5 && (q === 0 || q === 6)) ? C[2] === '#ffd84a' ? '#b0281c' : '#a8261c' : C[4]); }
        tx0 = cx + 12 * sc;
      }
      var shown = P.cps > 0 ? Math.floor(Math.max(0, age - 80) / 1000 * P.cps) : 1e9, left = shown;
      for (i = 0; i < b.lines.length && left > 0; i++) {
        var Ls = b.lines[i], R = textRaster(Ls, C[3], sc); if (!R) break;
        var n = Math.min(Ls.length, left), wpx = Math.min(R.c.width, Math.max(0, (R.adv[n] - 1) * sc)); left -= Ls.length;
        var lx = tone === 'shout' ? cx + Math.round((cw - R.c.width) / 2 / sc) * sc : tx0;
        if (wpx > 0) g.drawImage(R.c, 0, 0, wpx, R.c.height, lx, ty0 + i * m.lh, wpx, R.c.height);
      }
      g.restore();
    }
    function solid(c) {
      var mt = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(String(c || ''));
      return mt ? '#' + [mt[1], mt[2], mt[3]].map(function (v) { return ('0' + (+v).toString(16)).slice(-2); }).join('') : c;
    }
    function crispMode(ctx, ds) {
      if (P.render === 'crisp') return true; if (P.render === 'smooth') return false;
      if (SK) return !!SK.pixel;
      return ds < 1.5 && ctx.canvas && ctx.canvas.width <= 512;
    }
    function draw(ctx, offX, offY) {
      if (!ctx) return;
      drawn = [];
      try {
        offX = +offX || 0; offY = +offY || 0;
        var ds = devScale(ctx), c = crispMode(ctx, ds), want = c ? 'crisp' : 'smooth';
        if (!opt.bounds && ctx.canvas) lastView = { x: 0, y: 0, w: Math.round(ctx.canvas.width / ds), h: Math.round(ctx.canvas.height / ds) };
        if (mode !== want) { mode = want; bubbles.forEach(shape); place(); bubbles.forEach(function (b) { b.ox = b.tx; b.oy = b.ty; }); }
        var bb = B();
        var list = bubbles.filter(function (b) { return !b.gone; }).sort(function (a, b) { return a.prio - b.prio || a.id - b.id; });   // important ones on top
        list.forEach(function (b) {
          try {
            var an = anchor(b.spk); if (!an) return;
            var A = an.a, m = b.m, p = clampBody(A.x + b.ox, A.top + b.oy, b.w, b.h, bb, edgeMg(A, bb, m));
            if (m.crisp) { p.x = Math.round(p.x); p.y = Math.round(p.y); }
            var body = { x: p.x, y: p.y, w: b.w, h: b.h }, sd = b.tone === 'shout' ? spikeD(m) : 0, T = tailGeom(sd ? { x: body.x + sd, y: body.y + sd, w: body.w - 2 * sd, h: body.h - 2 * sd } : body, A, m, bb), C = colours(b.tone);
            if (b.far && P.edge !== 'pointer') T = null;
            if (T) for (var qi = 0; qi < obsCache.length; qi++) { var qo = obsCache[qi]; if (qo.id == null && !qo.soft && T.end.x > qo.x && T.end.x < qo.x + qo.w && T.end.y > qo.y && T.end.y < qo.y + qo.h) { T = null; break; } }   // never draw a tail tip or pointer under a HUD panel
            if (b.vis > 0.02) {
              ctx.save(); ctx.translate(offX, offY);
              if (m.crisp) drawCrisp(ctx, b, body, T, ds, C); else drawSmooth(ctx, b, body, T, 1, ds, C);
              ctx.restore();
            }
            var r = { x: body.x, y: body.y, w: body.w, h: body.h };
            if (T) { var minx = Math.min(r.x, T.end.x), miny = Math.min(r.y, T.end.y), maxx = Math.max(r.x + r.w, T.end.x), maxy = Math.max(r.y + r.h, T.end.y); r = { x: minx, y: miny, w: maxx - minx, h: maxy - miny }; }
            drawn.push({ id: b.id, speaker: b.spk, text: b.text, tone: b.tone, x: r.x, y: r.y, w: r.w, h: r.h, body: body, tip: T ? { x: T.end.x, y: T.end.y } : null, anchor: { x: A.x, top: A.top }, far: !!b.far, repopAge: t - b.repop,
              pointer: !!(T && T.pointer), clamped: Math.abs(p.x - (A.x + b.ox)) > 0.5 || Math.abs(p.y - (A.top + b.oy)) > 0.5, alpha: b.vis * (b.ending ? 1 - clamp((t - b.endT) / 240, 0, 1) : 1), age: t - b.born, fresh: an.fresh });
          } catch (e) { warn('drawb', 'drawing a bubble failed: ' + (e && e.message)); }
        });
      } catch (e) { warn('draw', 'draw() failed: ' + (e && e.message)); }
    }

    return {
      version: VERSION,
      say: say, bark: bark, update: update, draw: draw,
      silence: function (id) { bubbles.forEach(function (b) { if (id == null || String(b.spk) === String(id)) endB(b); }); },
      clear: function () { bubbles = []; drawn = []; cache = {}; said = {}; idleNext = null; },
      setParams: function (o) { setP(o); bubbles.forEach(shape); place(); },
      params: function () { var o = {}; for (var k in P) o[k] = P[k]; return o; },
      count: function () { return bubbles.filter(function (b) { return !b.gone; }).length; },
      active: function () { return bubbles.filter(function (b) { return !b.gone; }).map(function (b) { return { id: b.id, speaker: b.spk, text: b.text, tone: b.tone, event: b.event, age: t - b.born, ending: b.ending }; }); },
      rects: function () { return drawn.map(function (d) { return { x: d.x, y: d.y, w: d.w, h: d.h }; }); },
      lastDrawn: function () { return drawn.slice(); },
      obstacles: function () { return obsCache.slice(); },
      lines: function () { return LN; },
      time: function () { return t; }
    };
  }

  root.GameDNA_BarkBubbles = { create: create, version: VERSION, defaults: DEFAULTS, lines: LINES, tones: Object.keys(TONES) };
})(typeof window !== 'undefined' ? window : this);
