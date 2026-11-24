/* GameDNA A-02 Four-move menu battle with type matchups, module v1. Plain script, no dependencies, no exports.
   One global: GameDNA_FourMove.  create(options) -> battle instance.  API: module/README.md.
   Owns: turn resolution (speed order, priority, accuracy, critical hits, type chart, burn / sleep / numb, guard,
   switching, fainting, replacements, win / lose), the message queue (typewriter, key or auto advance), the command,
   move, team and item menus with the target picker, and the classic battle screen: foe top-right on a platform with
   its name / level / HP box, own creature bottom-left seen from behind, message box, 2x2 move menu with type and uses,
   smooth HP drain, send-out / withdraw / faint animations.
   The host supplies creatures, moves, the type chart, an AI chooser and (optionally) sprites, a backdrop and items.
   Draws through GameDNA_Skin.resolve(options.skin) when skin-api.js is loaded first, else its own pixel16 copy.
   Include verbatim; do not edit. */
(function (root) {
  'use strict';
  var VERSION = '1.0.0', TICK = 1000 / 60;

  /* ---------------- small helpers ---------------- */
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function low(s) { return s == null ? '' : String(s).toLowerCase(); }
  function arr(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }
  function hash(s) { var x = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  function h2r(hx) { hx = String(hx || '#888888'); if (hx[0] !== '#') return [136, 136, 136]; if (hx.length === 4) hx = '#' + hx[1] + hx[1] + hx[2] + hx[2] + hx[3] + hx[3]; var n = parseInt(hx.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function r2h(c) { var f = function (v) { v = clamp(Math.round(v), 0, 255); return (v < 16 ? '0' : '') + v.toString(16); }; return '#' + f(c[0]) + f(c[1]) + f(c[2]); }
  function mix(a, b, k) { var A = h2r(a), B = h2r(b); return r2h([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]); }
  function mk(w, h) { var c = root.document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  function warn(m) { try { if (root.console) root.console.warn('GameDNA_FourMove: ' + m); } catch (e) { /* ignore */ } }

  /* ---------------- built-in pixel16 look (used when skin-api.js is not loaded) ---------------- */
  var FONT = {
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
  // glyphs the pixel16 ui font lacks; drawn by the module in the skin's colours, at the skin's advance
  var EXTRA = {
    '!': '00100,00100,00100,00100,00100,00000,00100', "'": '00100,00100,01000,00000,00000,00000,00000', ',': '00000,00000,00000,00000,00110,00100,01000',
    ':': '00000,01100,01100,00000,01100,01100,00000', '%': '11001,11010,00010,00100,01000,01011,10011', '+': '00000,00100,00100,11111,00100,00100,00000',
    '(': '00010,00100,01000,01000,01000,00100,00010', ')': '01000,00100,00010,00010,00010,00100,01000', '>': '01000,00100,00010,00001,00010,00100,01000',
    '*': '00000,10101,01110,11111,01110,10101,00000', '#': '01010,11111,01010,01010,11111,01010,00000', '&': '01100,10010,10100,01000,10101,10010,01101'
  };
  for (var ek in EXTRA) FONT[ek] = EXTRA[ek];
  // 3x5 fallback for labels that do not fit their cell even when condensed
  var SMALL = { A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755', I: '72227', J: '11152', K: '55655', L: '44447',
    M: '57755', N: '65555', O: '25552', P: '65644', Q: '25563', R: '65655', S: '34216', T: '72222', U: '55557', V: '55552', W: '55775', X: '55255', Y: '55222', Z: '71247',
    0: '75557', 1: '26227', 2: '61247', 3: '61216', 4: '55711', 5: '74616', 6: '34757', 7: '71222', 8: '75757', 9: '75716',
    '-': '00700', '.': '00002', "'": '22000', '!': '22202', '/': '11244', ' ': '00000' };
  var FB = {
    text: { main: '#ffffff', main2: '#c8d4ff', shadow: '#0a0c24', dim: '#8088a8', dim2: '#626a88', accent: '#ffe070', select: '#fff4c0', title: '#fff4c8', title2: '#e8c870', label: '#b8d0ff', label2: '#8ca8e8', pointer: '#fff8e8', pointerEdge: '#1a0e08' },
    ui: { select: 'rgba(255,255,255,0.2)', well: 'rgba(6,8,30,0.4)', edge: '#06061a', rivet: '#ffe070', rivetShade: '#7a5410' },
    windows: {
      a: ['#3a64d8', '#2c50b8', '#223e96', '#1a2e74', '#a8c8ff', '#0a1238'], b: ['#d85a48', '#b8402e', '#922c26', '#6a1c1e', '#ffc8b8', '#2a0608'],
      n: ['#4c5a8a', '#3e4a76', '#323c62', '#262e4e', '#c8d4f4', '#0a0e22']
    },
    team: { a: '#3a64d8', b: '#d85a48', n: '#4c5a8a' },
    fx: { hot: '#ff7a3a', cold: '#6ad8f0', heal: '#4ad870', crit: '#ffb43a', status: '#b878f8', white: '#ffffff' },
    meter: { out: '#06040e', track: '#2a1e36', hp: '#7ce060', hpTop: '#d8ffb8', hpLow: '#f05848', hpLowTop: '#ffb0a0' },
    ink: '#06061a', paper: '#f4f6ff'
  };
  function fbGlyph(g, rows, x, y, c1, c2) {
    for (var ry = 0; ry < rows.length; ry++) for (var rx = 0; rx < rows[ry].length; rx++) if (rows[ry][rx] === '1' || rows[ry][rx] === '#') {
      g.fillStyle = c2 && ry >= 4 ? c2 : c1; g.fillRect(x + rx, y + ry, 1, 1);
    }
  }
  function fbFrame(g, r, team) {
    var C = FB.windows[team] || FB.windows.n, x = r.x, y = r.y, w = r.w, h = r.h, i, pa = g.globalAlpha;
    g.globalAlpha = pa * 0.95; for (i = 0; i < h - 2; i++) { g.fillStyle = C[Math.min(3, Math.floor(i / (h - 2) * 4))]; g.fillRect(x + 1, y + 1 + i, w - 2, 1); }
    g.globalAlpha = pa; g.fillStyle = FB.ui.edge;
    g.fillRect(x + 2, y, w - 4, 1); g.fillRect(x + 2, y + h - 1, w - 4, 1); g.fillRect(x, y + 2, 1, h - 4); g.fillRect(x + w - 1, y + 2, 1, h - 4);
    g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + w - 2, y + 1, 1, 1); g.fillRect(x + 1, y + h - 2, 1, 1); g.fillRect(x + w - 2, y + h - 2, 1, 1);
    g.fillStyle = C[4]; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 5);
    g.fillStyle = C[5]; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
    [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]].forEach(function (p) { g.fillStyle = FB.ui.rivetShade; g.fillRect(p[0], p[1], 2, 2); g.fillStyle = FB.ui.rivet; g.fillRect(p[0], p[1], 1, 1); });
    return { x: x + 4, y: y + 4, w: w - 8, h: h - 8 };
  }
  function fbMeter(g, r, fr, kind, px) {
    var M = FB.meter, low = kind === 'hpLow', iw = r.w - 2, f = px != null ? px : Math.round(iw * clamp(fr, 0, 1));
    g.fillStyle = M.out; g.fillRect(r.x, r.y, r.w, r.h); g.fillStyle = M.track; g.fillRect(r.x + 1, r.y + 1, iw, r.h - 2);
    g.fillStyle = low ? M.hpLow : M.hp; g.fillRect(r.x + 1, r.y + 1, f, r.h - 2); g.fillStyle = low ? M.hpLowTop : M.hpTop; g.fillRect(r.x + 1, r.y + 1, f, 1);
  }
  function fbHand(g, x, y, t) {
    var hx = x + (Math.floor(t * 4) % 2);
    ['.oo....', 'owwoooo', 'owwwwwo', 'owwwwo.', '.oooo..'].forEach(function (row, yy) { for (var xx = 0; xx < 7; xx++) if (row[xx] !== '.') { g.fillStyle = row[xx] === 'o' ? FB.text.pointerEdge : FB.text.pointer; g.fillRect(hx + xx, y + yy, 1, 1); } });
  }

  /* ---------------- skin adapter: every colour, glyph, window and bar goes through here ---------------- */
  function adapter(SK) {
    var P = SK && SK.palette ? SK.palette : null, F = SK && SK.fonts ? SK.fonts.ui || null : null;
    var bitmap = !SK || (F && F.type === 'bitmap'), upper = !SK || (F ? F.uppercase !== false && F.type === 'bitmap' : true);
    var adv = !SK ? 6 : F && F.advance ? F.advance : 0, spaceAdv = !SK ? 4 : F && F.space ? F.space : 4;
    var fontH = !SK ? 7 : F ? (F.height || F.size || 7) : 7;
    function look(obj, path) { var o = obj, p = path.split('.'); for (var i = 0; i < p.length && o != null; i++) o = o[p[i]]; return o; }
    function tok(path, d) { var v = P ? look(P, path) : null; if (v == null || typeof v === 'object') v = look(FB, path); return v == null || typeof v === 'object' ? d : v; }
    function has(ch) { if (!SK) return !!FONT[ch]; return !!(F && F.glyphs && F.glyphs[ch]); }
    function chAdv(ch) { if (ch === ' ') return spaceAdv; if (adv) return adv; try { return SK.measure(ch, { font: 'ui' }) + 1; } catch (e) { return 6; } }
    function measure(s) {
      s = String(s); if (upper) s = s.toUpperCase();
      if (bitmap) { var w = 0; for (var i = 0; i < s.length; i++) w += chAdv(s[i]); return Math.max(0, w - 1); }
      try { return SK.measure(s, { font: 'ui' }); } catch (e) { return s.length * 6; }
    }
    function text(g, s, x, y, c1, c2, align, alpha, noShadow) {
      s = String(s); if (upper) s = s.toUpperCase();
      var w = measure(s); x = Math.round(align === 'center' ? x - Math.floor(w / 2) : align === 'right' ? x - w : x); y = Math.round(y);
      var pa = g.globalAlpha; if (alpha != null) g.globalAlpha = pa * alpha;
      try {
        if (!bitmap) { SK.text(g, s, x, y, noShadow ? { font: 'ui', color: c1, color2: c2 || c1, shadow: false } : { font: 'ui', color: c1, color2: c2 || c1 }); }
        else {
          var cx = x, sh = tok('text.shadow', '#0a0c24');
          for (var i = 0; i < s.length; i++) {
            var ch = s[i];
            if (ch !== ' ') {
              if (SK && has(ch)) SK.text(g, ch, cx, y, noShadow ? { font: 'ui', color: c1, color2: c2 || c1, shadow: false } : { font: 'ui', color: c1, color2: c2 || c1 });
              else { var rows = (FONT[ch] || FONT['?']).split(','); if (sh && !noShadow && (!SK || (SK.shadow && SK.shadow.text))) fbGlyph(g, rows, cx + 1, y + 1, sh); fbGlyph(g, rows, cx, y, c1, c2 || c1); }
            }
            cx += chAdv(ch);
          }
        }
      } catch (e) { /* never throw from draw */ }
      g.globalAlpha = pa; return w;
    }
    function frame(g, r, team, alpha) {
      var pa = g.globalAlpha; if (alpha != null) g.globalAlpha = pa * alpha; var inner;
      try { inner = SK ? SK.frame(g, r, { role: 'window', team: team || 'n' }) : fbFrame(g, r, team); } catch (e) { inner = fbFrame(g, r, team); }
      g.globalAlpha = pa; return inner || { x: r.x + 4, y: r.y + 4, w: r.w - 8, h: r.h - 8 };
    }
    function meter(g, r, fr, kind, px) {
      if (SK) { try { SK.bar(g, r, fr, kind, { style: 'meter', px: px }); return; } catch (e) { /* fall through */ } }
      fbMeter(g, r, fr, kind, px);
    }
    function hand(g, x, y, t) { if (SK) { try { SK.cursor(g, { x: x, y: y, w: 7, h: 5 }, 'hand', t, {}); return; } catch (e) { /* fall through */ } } fbHand(g, x, y, t); }
    // fit(g, s, x, y, maxW, c1, c2): draws s left-aligned within maxW px. Normal font; else condensed spacing (bitmap); else the 3x5
    // small font; else truncated with an ellipsis. Returns {w, mode: 'normal' | 'condensed' | 'small' | 'cut'}; w never exceeds maxW.
    function fit(g, s, x, y, maxW, c1, c2) {
      s = String(s); if (upper) s = s.toUpperCase();
      var w = measure(s); if (w <= maxW) { text(g, s, x, y, c1, c2); return { w: w, mode: 'normal' }; }
      if (bitmap) {
        var cw = 0, i; for (i = 0; i < s.length; i++) cw += chAdv(s[i]) - 1; cw = Math.max(0, cw - 1);
        if (cw <= maxW) { var cx = x; for (i = 0; i < s.length; i++) { if (s[i] !== ' ') text(g, s[i], cx, y, c1, c2); cx += chAdv(s[i]) - 1; } return { w: cw, mode: 'condensed' }; }
      }
      var sw = function (str) { var v = 0; for (var q = 0; q < str.length; q++) v += str[q] === ' ' ? 3 : 4; return Math.max(0, v - 1); };
      var small = function (str, yy) {
        var sh = tok('text.shadow', '#0a0c24'), sx = x;
        for (var q = 0; q < str.length; q++) {
          var code = SMALL[str[q]] || SMALL['-'];
          for (var pass = 0; pass < 2; pass++) for (var r = 0; r < 5; r++) { var bits = code.charCodeAt(r) - 48; for (var c = 0; c < 3; c++) if (bits & (4 >> c)) { g.fillStyle = pass ? c1 : sh; g.fillRect(sx + c + (pass ? 0 : 1), yy + r + (pass ? 0 : 1), 1, 1); } }
          sx += str[q] === ' ' ? 3 : 4;
        }
      };
      if (!bitmap) {   // smooth skins: truncate with an ellipsis
        var cut = s; while (cut.length > 1 && measure(cut + '...') > maxW) cut = cut.slice(0, -1);
        cut = cut.replace(/ +$/, ''); text(g, cut + '...', x, y, c1, c2); return { w: Math.min(maxW, measure(cut + '...')), mode: 'cut' };
      }
      if (sw(s) <= maxW) { small(s, y + 1); return { w: sw(s), mode: 'small' }; }
      var t2 = s; while (t2.length > 1 && sw(t2) + 6 > maxW) t2 = t2.slice(0, -1);
      t2 = t2.replace(/ +$/, ''); small(t2, y + 1); var ex = x + sw(t2) + 2; g.fillStyle = c1; g.fillRect(ex, y + 5, 1, 1); g.fillRect(ex + 2, y + 5, 1, 1);
      return { w: sw(t2) + 5, mode: 'cut' };
    }
    return { tok: tok, text: text, fit: fit, measure: measure, frame: frame, meter: meter, hand: hand, fontH: fontH, lineH: Math.max(10, fontH + 5), pixel: !SK || SK.pixel !== false, skin: SK };
  }

  /* ---------------- defaults ---------------- */
  var PARAMS = {
    format: 'single',        // 'single' (1v1) | 'double' (2v2)
    textSpeed: 'normal',     // 'slow' | 'normal' | 'fast' | 'instant'
    advance: 'auto',         // 'auto' (messages also move on by themselves) | 'key' (wait for OK, classic)
    hold: 900,               // ms a fully shown message stays before auto advance
    drain: 'normal',         // HP bar speed: 'slow' | 'normal' | 'fast'
    critRate: 0.0625, critMult: 1.5, stab: 1.5, randomMin: 0.85, spread: 0.75, burnAtk: 0.5, numbChance: 0.25,
    hints: 'on',             // move menu shows STRONG / WEAK / NO EFFECT against the foe
    aiRandom: 0.2,           // default foe AI: chance of a random usable move
    canRun: false,
    spriteScale: 'auto',     // 'auto' | 1 | 2 | 3 (integer upscale of host sprites)
    foeLabel: 'FOE',         // prefix for foe names in messages ('' = none)
    auto: false              // autoplay the own side (also toggled with setAuto)
  };
  var CPS = { slow: 22, normal: 45, fast: 90, instant: 1e9 }, DRAIN = { slow: 1.9, normal: 1.15, fast: 0.6 };
  var STATUS = { burn: { tag: 'BRN', col: 'fx.hot' }, sleep: { tag: 'SLP', col: 'fx.cold' }, numb: { tag: 'NUM', col: 'fx.crit' } };
  var TYPE_COLS = ['#f0783a', '#3e8ee8', '#5cbf4a', '#9ad0e8', '#b49a62', '#f2cc3a', '#b878f8', '#e8607a', '#8a96a8'];
  var TEXT = {
    intro: function (who) { return who ? who + ' WANTS TO BATTLE!' : 'A WILD CHALLENGER APPEARS!'; },
    foeSend: function (who, n) { return who ? who + ' SENDS OUT ' + n + '!' : n + ' APPEARS!'; },
    go: function (n) { return 'GO ON, ' + n + '!'; },
    back: function (n) { return n + ', BACK TO ME!'; },
    foeBack: function (who, n) { return (who || 'THE FOE') + ' CALLS BACK ' + n + '.'; },
    prompt: function (n) { return 'WHAT SHOULD ' + n + ' DO?'; },
    uses: function (u, m) { return u + ' USES ' + m + '!'; },
    miss: function (u) { return u + ' MISSED!'; },
    noTarget: function () { return 'THERE WAS NOTHING TO HIT...'; },
    strong: function () { return 'A CRUSHING MATCHUP!'; },
    weak: function () { return 'IT BARELY LANDED...'; },
    none: function (t) { return 'IT DIDN\'T TOUCH ' + t + '...'; },
    crit: function () { return 'A PERFECT HIT!'; },
    faint: function (n) { return n + ' IS OUT OF THE FIGHT!'; },
    failed: function () { return 'NOTHING HAPPENED...'; },
    burnOn: function (n) { return n + ' IS SCORCHED!'; }, burnHurt: function (n) { return n + ' SMARTS FROM ITS BURN!'; },
    sleepOn: function (n) { return n + ' NODDED OFF!'; }, sleeping: function (n) { return n + ' IS SOUND ASLEEP.'; }, wake: function (n) { return n + ' SNAPPED AWAKE!'; },
    numbOn: function (n) { return n + ' IS NUMB! IT MAY FREEZE UP.'; }, numbStop: function (n) { return n + ' IS TOO NUMB TO MOVE!'; },
    heal: function (n) { return n + ' FEELS BETTER!'; }, guard: function (n) { return n + ' BRACES ITSELF!'; },
    drain: function (n) { return n + ' DRANK SOME STRENGTH!'; },
    item: function (i, n) { return 'YOU USE ' + i + ' ON ' + n + '.'; },
    run: function () { return 'YOU SLIPPED AWAY SAFELY!'; }, noRun: function () { return 'THERE IS NO RUNNING FROM THIS ONE!'; },
    win: function (who) { return who ? 'YOU BEAT ' + who + '!' : 'YOU WON THE BATTLE!'; },
    lose: function () { return 'YOU HAVE NO ONE LEFT TO FIGHT...'; },
    choose: function () { return 'WHO GOES OUT NEXT?'; },
    already: function (n) { return n + ' IS ALREADY OUT THERE!'; }, cant: function (n) { return n + ' CAN\'T FIGHT ANY MORE!'; },
    empty: function () { return 'THAT MOVE HAS NO USES LEFT!'; }, noItems: function () { return 'THE BAG IS EMPTY.'; }
  };

  /* ---------------- create ---------------- */
  function create(o) {
    o = o || {};
    var SKAPI = root.GameDNA_Skin, SK = null;
    try { SK = SKAPI && SKAPI.resolve ? SKAPI.resolve(o.skin) : null; } catch (e) { SK = null; }
    var L = adapter(SK);
    var P = {}, k; for (k in PARAMS) P[k] = PARAMS[k]; if (o.params) for (k in o.params) if (k in PARAMS && o.params[k] != null) P[k] = o.params[k];
    ['hold', 'critRate', 'critMult', 'stab', 'randomMin', 'spread', 'burnAtk', 'numbChance', 'aiRandom'].forEach(function (kk) { P[kk] = num(P[kk], PARAMS[kk]); });
    var TX = {}; for (k in TEXT) TX[k] = TEXT[k]; if (o.text) for (k in o.text) if (typeof o.text[k] === 'function') TX[k] = o.text[k]; else if (typeof o.text[k] === 'string') TX[k] = (function (s) { return function () { return s; }; })(o.text[k]);
    var R = rng(o.seed == null ? 1 : o.seed), view = o.view ? { x: o.view.x | 0, y: o.view.y | 0, w: o.view.w | 0, h: o.view.h | 0 } : null;
    var foeName = o.foeName ? String(o.foeName).toUpperCase() : '';

    function call(name, args, dflt) {
      var f = o[name]; if (typeof f !== 'function') return dflt;
      try { var r = f.apply(null, args); return r === undefined ? dflt : r; } catch (e) { warn(name + ' threw: ' + (e && e.message)); return dflt; }
    }

    /* ---- types and chart ---- */
    var TYPES = {}, CHART = {};
    (function () {
      var t = o.types || {}, list = Array.isArray(t) ? t.map(function (id) { return { id: id }; }) : Object.keys(t).map(function (id) { var v = t[id]; return typeof v === 'object' && v ? Object.assign({ id: id }, v) : { id: id, label: v }; });
      list.forEach(function (d, i) {
        var id = low(d.id); TYPES[id] = { id: id, label: String(d.label || d.id).toUpperCase(), color: d.color || TYPE_COLS[hash(id) % TYPE_COLS.length], immune: arr(d.immune).map(low) };
        arr(d.strong).forEach(function (x) { (CHART[id] = CHART[id] || {})[low(x)] = 2; });
        arr(d.weak).forEach(function (x) { (CHART[id] = CHART[id] || {})[low(x)] = 0.5; });
        arr(d.none).forEach(function (x) { (CHART[id] = CHART[id] || {})[low(x)] = 0; });
      });
      var c = o.chart || {}; Object.keys(c).forEach(function (a) { var row = c[a] || {}; Object.keys(row).forEach(function (d) { (CHART[low(a)] = CHART[low(a)] || {})[low(d)] = num(row[d], 1); }); });
    })();
    function typeOf(id) { id = low(id); if (!id) return null; return TYPES[id] || (TYPES[id] = { id: id, label: id.toUpperCase(), color: TYPE_COLS[hash(id) % TYPE_COLS.length], immune: [] }); }
    function mult(atkType, defTypes) { atkType = low(atkType); if (!atkType) return 1; var m = 1, row = CHART[atkType] || {}; defTypes.forEach(function (d) { if (row[d] != null) m *= row[d]; }); return m; }

    /* ---- moves and creatures ---- */
    var MOVES = o.moves || {};
    function resolveMove(m) {
      var base = typeof m === 'string' ? MOVES[m] : m && m.id != null && MOVES[m.id] ? Object.assign({}, MOVES[m.id], m) : m;
      if (!base || typeof base !== 'object') { warn('unknown move ' + m); return null; }
      var max = Math.max(1, num(base.uses != null ? base.uses : base.maxUses, 10) | 0), power = num(base.power, 0);
      var kind = base.kind === 'status' || base.kind === 'hit' ? base.kind : power > 0 ? 'hit' : 'status';
      var eff = base.effect || null;
      return {
        id: base.id != null ? String(base.id) : typeof m === 'string' ? m : String(base.name || 'move'), name: String(base.name || base.id || 'MOVE').toUpperCase(),
        type: low(base.type) || null, power: power, acc: base.accuracy != null ? num(base.accuracy, 100) : base.acc != null ? num(base.acc, 100) : 100,
        kind: kind, target: base.target || (kind === 'status' && !(eff && eff.status) ? 'self' : 'foe'), effect: eff, priority: num(base.priority, 0) | 0,
        max: max, uses: clamp(num(base.usesLeft, max) | 0, 0, max), highCrit: !!base.highCrit, src: base
      };
    }
    var STRUGGLE = { id: '__flail', name: 'FLAIL', type: null, power: 30, acc: 100, kind: 'hit', target: 'foe', effect: null, priority: 0, max: 1, uses: 1 };
    function mkCreature(src, side, i) {
      src = src || {};
      var max = Math.max(1, num(src.maxHp != null ? src.maxHp : src.hp, 40) | 0);
      var c = {
        id: src.id != null ? String(src.id) : side + '-' + i, side: side, index: i, src: src, name: String(src.name || 'CREATURE').toUpperCase(),
        level: Math.max(1, num(src.level, 10) | 0), types: arr(src.types != null ? src.types : src.type).map(low).filter(Boolean),
        maxHp: max, hp: clamp(num(src.maxHp != null && src.hp != null ? src.hp : max, max) | 0, 0, max),
        atk: Math.max(1, num(src.atk != null ? src.atk : src.attack, 20)), def: Math.max(1, num(src.def != null ? src.def : src.defense, 20)), spd: Math.max(1, num(src.spd != null ? src.spd : src.speed, 20)),
        status: STATUS[low(src.status)] ? low(src.status) : null, sleep: 0, guard: false, moves: [], slot: -1,
        vis: 'hidden', vt: 0, blink: 0, shake: 0, lunge: 0, box: 0, boxDir: 0, anchorRect: null
      };
      if (c.status === 'sleep') c.sleep = 2;
      c.shownHp = c.hp;
      arr(src.moves).slice(0, 4).forEach(function (m) { var mv = resolveMove(m); if (mv) c.moves.push(mv); });
      if (!c.moves.length) c.moves.push(resolveMove({ id: 'tackle', name: 'TACKLE', power: 35, type: null, uses: 30 }));
      return c;
    }
    var SIDES = {};
    function mkSide(side, list) {
      list = arr(list).filter(Boolean); if (!list.length) { warn('no creatures for side ' + side); list = [{ name: side === 'own' ? 'HERO' : 'FOE' }]; }
      var S = { side: side, team: list.map(function (c, i) { return mkCreature(c, side, i); }), slots: [] };
      var n = P.format === 'double' ? 2 : 1;
      for (var i = 0; i < n; i++) S.slots.push(null);
      return S;
    }
    SIDES.own = mkSide('own', o.teams ? o.teams.own : o.own);
    SIDES.foe = mkSide('foe', o.teams ? o.teams.foe : o.foe);
    function other(side) { return side === 'own' ? 'foe' : 'own'; }
    function all() { return SIDES.own.team.concat(SIDES.foe.team); }
    function byId(id) { var a = all(); for (var i = 0; i < a.length; i++) if (a[i].id === String(id)) return a[i]; return null; }
    function active(side) { return SIDES[side].slots.filter(function (c) { return c && c.hp > 0; }); }
    function onField(c) { return c && c.slot >= 0 && SIDES[c.side].slots[c.slot] === c; }
    function bench(side) { return SIDES[side].team.filter(function (c) { return c.hp > 0 && !onField(c); }); }
    function alive(side) { return SIDES[side].team.some(function (c) { return c.hp > 0; }); }
    function nm(c) { return c.side === 'foe' && P.foeLabel ? String(P.foeLabel).toUpperCase() + ' ' + c.name : c.name; }
    function pub(c) {
      if (!c) return null;
      return { id: c.id, side: c.side, name: c.name, level: c.level, types: c.types.slice(), hp: c.hp, maxHp: c.maxHp, atk: c.atk, def: c.def, spd: c.spd, status: c.status, slot: onField(c) ? c.slot : -1, fainted: c.hp <= 0, src: c.src,
        moves: c.moves.map(function (m, i) { return { index: i, id: m.id, name: m.name, type: m.type, power: m.power, accuracy: m.acc, kind: m.kind, target: m.target, uses: m.uses, max: m.max }; }) };
    }

    /* ---- state ---- */
    var phase = 'intro', turn = 0, result = null, tick = 0, acc = 0, paused = false, stopFrames = 0, auto = !!P.auto;
    var beats = [], cur = null, msg = null, note = null, cmd = null, fx = [], shake = 0, log = [], events = 0;
    var lastRects = { ui: [], cells: [] };

    /* ---- events: the hit site and friends ---- */
    function emit(ev) { events++; call('onEvent', [ev]); }
    function applyHit(ev) {
      var t = ev.targetC, u = ev.sourceC || null;
      var out = { kind: ev.kind, source: u ? u.id : null, target: t.id, side: t.side, amount: Math.max(0, Math.round(ev.amount || 0)), move: ev.move ? ev.move.id : null, moveName: ev.move ? ev.move.name : null,
        type: ev.move ? ev.move.type : null, eff: ev.eff == null ? 1 : ev.eff, crit: !!ev.crit, status: ev.status || null, cause: ev.cause || 'move', cancel: false };
      call('beforeHit', [out]);
      if (out.cancel) return out;
      out.amount = Math.max(0, Math.round(num(out.amount, 0)));
      out.hpBefore = t.hp;
      if (out.kind === 'damage') { t.hp = Math.max(0, t.hp - out.amount); if (out.amount > 0) { t.blink = 18; t.shake = 8; } }
      else if (out.kind === 'heal') { out.amount = Math.min(out.amount, t.maxHp - t.hp); t.hp += out.amount; }
      else if (out.kind === 'status') t.status = out.status;
      else if (out.kind === 'cure') t.status = null;
      out.hpAfter = t.hp; out.killed = out.hpBefore > 0 && t.hp <= 0; out.anchor = anchorOf(t);
      call('onHit', [out]); emit(Object.assign({}, out, { type: 'hit', moveType: out.type }));
      return out;
    }

    /* ---- beats ---- */
    function M(text, opt) { return Object.assign({ k: 'msg', text: String(text) }, opt || {}); }
    function D(fn) { return { k: 'do', fn: fn }; }
    function W(n) { return { k: 'wait', n: n }; }
    function A(n, onTick) { return { k: 'anim', n: n, onTick: onTick }; }
    function drainBeat() { return { k: 'drain' }; }
    function front(list) { beats.unshift.apply(beats, list.filter(Boolean)); }
    function wrap(text, width) {
      var words = String(text).split(' '), lines = [], line = '';
      words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (line && L.measure(t) > width) { lines.push(line); line = w; } else line = t; });
      if (line) lines.push(line); return lines.length ? lines : [''];
    }
    function setMsg(text, wait) {
      var lay = layout(), lines = wrap(text, lay.msgInner.w - 6), pages = [];
      for (var i = 0; i < lines.length; i += 2) pages.push(lines.slice(i, i + 2));
      msg = { pages: pages, page: 0, shown: 0, total: pages[0].join('').length, t: 0, wait: wait !== false, done: false, hold: 0 };
      log.push(text); if (log.length > 60) log.shift();
      call('onMessage', [text]); emit({ type: 'message', text: text });
    }
    function cps() { return CPS[P.textSpeed] || num(P.textSpeed, 45); }
    function runBeat(b) {
      b.t++;
      switch (b.k) {
        case 'do': b.fn(); return true;
        case 'wait': return b.t >= b.n;
        case 'anim': if (b.onTick) b.onTick(b.t); return b.t >= b.n;
        case 'drain': return all().every(function (c) { return Math.abs(c.shownHp - c.hp) < 0.01; }) || b.t > 400;
        case 'msg':
          if (b.t === 1) setMsg(b.text, b.wait);
          var m = msg; if (!m) return true;
          m.shown = Math.min(m.total, m.shown + cps() / 60);
          if (m.shown < m.total) return false;
          if (!m.wait) return true;
          m.hold++;
          var holdTicks = Math.round((b.hold != null ? b.hold : P.hold) / TICK);
          if (m.done || ((P.advance !== 'key' || auto) && m.hold >= holdTicks)) {
            m.done = false; m.hold = 0;
            if (m.page < m.pages.length - 1) { m.page++; m.shown = 0; m.total = m.pages[m.page].join('').length; return false; }
            return true;
          }
          return false;
      }
      return true;
    }
    function stepBeats() {
      for (var guard = 0; guard < 64; guard++) {
        if (!cur) { if (!beats.length) return; cur = beats.shift(); cur.t = 0; }
        if (!runBeat(cur)) return;
        cur = null;
      }
    }

    /* ---- creature animation states ---- */
    function setVis(c, v) { c.vis = v; c.vt = 0; }
    function place(c, side, slot) { var S = SIDES[side]; if (S.slots[slot] && S.slots[slot] !== c) S.slots[slot].slot = -1; S.slots[slot] = c; c.slot = slot; c.guard = false; }
    function sendoutBeats(c, slot) {
      var who = c.side === 'foe' ? TX.foeSend(foeName, c.name) : TX.go(c.name);
      return [M(who, { wait: false }), D(function () { place(c, c.side, slot); setVis(c, 'in'); c.box = 0; c.boxDir = 1; }), W(40),
        D(function () { emit({ type: 'sendOut', id: c.id, side: c.side, slot: slot }); }), W(8)];
    }
    function withdrawBeats(c) {
      var who = c.side === 'foe' ? TX.foeBack(foeName, c.name) : TX.back(c.name);
      return [M(who, { wait: false }), D(function () { setVis(c, 'out'); c.boxDir = -1; }), W(30),
        D(function () { var S = SIDES[c.side]; if (S.slots[c.slot] === c) S.slots[c.slot] = null; c.slot = -1; c.guard = false; emit({ type: 'withdraw', id: c.id, side: c.side }); })];
    }
    function faintBeats(c) {
      return [D(function () { setVis(c, 'faint'); c.boxDir = -1; emit({ type: 'faint', id: c.id, side: c.side }); call('onFaint', [pub(c)]); }), W(34), M(TX.faint(nm(c)))];
    }
    function checkFaint(c) { return D(function () { if (c.hp <= 0 && c.vis !== 'faint' && c.vis !== 'gone') front(faintBeats(c)); }); }

    /* ---- effects (scene layer) ---- */
    function addFx(kind, at, col, n, extra) { fx.push(Object.assign({ kind: kind, x: at.x, y: at.y, col: col, t: 0, n: n || 24, seed: (R() * 1e6) | 0 }, extra || {})); }
    function centerOf(c) { var a = anchorOf(c); return a ? { x: a.x, y: a.cy } : { x: 0, y: 0 }; }

    /* ---- turn resolution ---- */
    function nameList(side) { return SIDES[side].slots.filter(Boolean); }
    function resolveTargets(u, mv, want) {
      if (mv.target === 'self') return [u];
      if (mv.target === 'ally') { var al = active(u.side).filter(function (c) { return c !== u; }); return al.length ? [al[0]] : [u]; }
      var foes = active(other(u.side));
      if (mv.target === 'allFoes') return foes;
      if (!foes.length) return [];
      var t = want != null ? byId(want) : null;
      if (t && onField(t) && t.hp > 0 && t.side !== u.side) return [t];
      return [foes[(R() * foes.length) | 0]];
    }
    function statusImmune(t, st) { return t.types.some(function (ty) { var T = typeOf(ty); return T && T.immune.indexOf(st) >= 0; }); }
    function inflict(t, st, quiet) {
      var seq = [];
      if (!STATUS[st] || t.status || t.hp <= 0 || statusImmune(t, st)) return quiet ? [] : [M(TX.failed())];
      seq.push(D(function () { applyHit({ kind: 'status', targetC: t, status: st, cause: 'status' }); if (st === 'sleep') t.sleep = 1 + ((R() * 3) | 0); addFx('status', centerOf(t), L.tok(STATUS[st].col, '#ffffff'), 30); }), W(20));
      seq.push(M(st === 'burn' ? TX.burnOn(nm(t)) : st === 'sleep' ? TX.sleepOn(nm(t)) : TX.numbOn(nm(t))));
      return seq;
    }
    function damageOf(u, t, mv, eff, crit, roll, spread) {
      var a = u.atk * (u.status === 'burn' ? P.burnAtk : 1), d = t.def, stab = mv.type && u.types.indexOf(mv.type) >= 0 ? P.stab : 1;
      var base = Math.floor(Math.floor(Math.floor(2 * u.level / 5 + 2) * mv.power * a / Math.max(1, d)) / 50) + 2;
      var dmg = Math.floor(base * stab * eff * (crit ? P.critMult : 1) * roll * (spread ? P.spread : 1) * (t.guard ? 0.5 : 1));
      var custom = call('damage', [{ user: pub(u), target: pub(t), move: { id: mv.id, name: mv.name, type: mv.type, power: mv.power }, eff: eff, crit: crit, stab: stab, roll: roll, spread: spread, guard: t.guard, standard: Math.max(1, dmg) }], null);
      return Math.max(1, Math.round(custom != null ? num(custom, dmg) : dmg));
    }
    function hitBeats(u, t, mv, spread) {
      if (t.hp <= 0 || !onField(t)) return [];
      if (mv.acc != null && mv.acc < 100 && R() * 100 >= mv.acc) {
        return [attackAnim(u, t, mv, null, true), M(TX.miss(nm(u))), D(function () { emit({ type: 'miss', source: u.id, target: t.id, move: mv.id }); })];
      }
      if (mv.kind !== 'hit') {
        var s = [];
        if (mv.effect && mv.effect.status) s.push(attackAnim(u, t, mv, null, false, true));
        if (mv.effect && mv.effect.status) s = s.concat(inflict(t, low(mv.effect.status)));
        return s;
      }
      var eff = mult(mv.type, t.types);
      if (eff === 0) return [M(TX.none(nm(t))), D(function () { emit({ type: 'immune', source: u.id, target: t.id, move: mv.id }); })];
      var crit = R() < P.critRate * (mv.highCrit ? 3 : 1), roll = P.randomMin + R() * (1 - P.randomMin);
      var dmg = damageOf(u, t, mv, eff, crit, roll, spread), dealt = 0;
      var seq = [attackAnim(u, t, mv, function () { dealt = applyHit({ kind: 'damage', sourceC: u, targetC: t, amount: dmg, move: mv, eff: eff, crit: crit }).amount || 0; }), drainBeat()];
      if (crit) seq.push(M(TX.crit()));
      if (eff > 1) seq.push(M(TX.strong()));
      if (eff < 1) seq.push(M(TX.weak()));
      var e = mv.effect || {};
      if (e.drain) seq.push(D(function () { if (u.hp > 0 && dealt > 0) front([D(function () { applyHit({ kind: 'heal', sourceC: u, targetC: u, amount: Math.max(1, Math.floor(dealt * num(e.drain, 0.5))), move: mv, cause: 'drain' }); addFx('heal', centerOf(u), L.tok('fx.heal', '#4ad870'), 30); }), drainBeat(), M(TX.drain(nm(u)))]); }));
      if (e.status) seq.push(D(function () { if (t.hp > 0 && R() * 100 < num(e.chance, 100)) front(inflict(t, low(e.status), true)); }));
      seq.push(checkFaint(t));
      return seq;
    }
    function attackAnim(u, t, mv, impact, miss, statusOnly) {
      var col = mv.type ? typeOf(mv.type).color : L.tok('fx.white', '#ffffff'), started = false;
      return A(statusOnly ? 26 : 30, function (f) {
        if (f === 1) { u.lunge = 1; started = true; }
        if (f === 10) addFx(statusOnly ? 'status' : 'bolt', centerOf(u), col, 12, { to: centerOf(t) });
        if (f === 20 && started) {
          if (!miss && !statusOnly) { addFx('burst', centerOf(t), col, 22); shake = Math.max(shake, 6); }
          if (miss) addFx('whiff', centerOf(t), L.tok('text.dim', '#8088a8'), 16);
          if (impact) impact();
        }
      });
    }
    function doMove(u, a) {
      var mv = u.moves[a.move];
      if (!mv || mv.uses <= 0) mv = u.moves.some(function (m) { return m.uses > 0; }) ? u.moves.filter(function (m) { return m.uses > 0; })[0] : STRUGGLE;
      if (u.status === 'sleep') {
        if (u.sleep > 0) { u.sleep--; front([D(function () { addFx('zzz', centerOf(u), L.tok('fx.cold', '#6ad8f0'), 40); }), M(TX.sleeping(nm(u)))]); return; }
        front([D(function () { applyHit({ kind: 'cure', targetC: u, cause: 'wake' }); }), M(TX.wake(nm(u))), D(function () { doMove(u, a); })]); return;
      }
      if (u.status === 'numb' && R() < P.numbChance) { front([D(function () { addFx('status', centerOf(u), L.tok('fx.crit', '#ffb43a'), 26); }), W(16), M(TX.numbStop(nm(u)))]); return; }
      if (mv !== STRUGGLE) mv.uses = Math.max(0, mv.uses - 1);
      var seq = [M(TX.uses(nm(u), mv.name)), D(function () { emit({ type: 'moveUsed', source: u.id, move: mv.id, uses: mv.uses }); })];
      var e = mv.effect || {};
      if (mv.kind === 'status' && (mv.target === 'self' || mv.target === 'ally')) {
        var tg = resolveTargets(u, mv)[0] || u;
        if (e.heal) {
          if (tg.hp >= tg.maxHp) seq.push(M(TX.failed()));
          else seq.push(D(function () { u.lunge = 1; addFx('heal', centerOf(tg), L.tok('fx.heal', '#4ad870'), 34); }), W(14), D(function () { applyHit({ kind: 'heal', sourceC: u, targetC: tg, amount: Math.max(1, Math.floor(tg.maxHp * num(e.heal, 0.5))), move: mv, cause: 'move' }); }), drainBeat(), M(TX.heal(nm(tg))));
        } else if (e.guard) {
          seq.push(D(function () { tg.guard = true; addFx('guard', centerOf(tg), L.tok('fx.cold', '#6ad8f0'), 30); emit({ type: 'guard', id: tg.id }); }), W(18), M(TX.guard(nm(tg))));
        } else if (e.cure) {
          if (!tg.status) seq.push(M(TX.failed())); else seq.push(D(function () { applyHit({ kind: 'cure', sourceC: u, targetC: tg, move: mv }); addFx('heal', centerOf(tg), L.tok('fx.heal', '#4ad870'), 30); }), W(16), M(TX.heal(nm(tg))));
        } else seq.push(M(TX.failed()));
        front(seq); return;
      }
      var targets = resolveTargets(u, mv, a.target), spread = targets.length > 1;
      if (!targets.length) seq.push(M(TX.noTarget()));
      targets.forEach(function (t) { seq.push(D(function () { if (u.hp > 0) front(hitBeats(u, t, mv, spread)); })); });
      front(seq);
    }
    function runAction(a) {
      var u = a.user;
      if (a.kind === 'run') { front([M(TX.run()), D(function () { finish('run'); })]); return; }
      if (u.hp <= 0 || !onField(u)) return;
      if (a.kind === 'switch') {
        var to = a.to; if (!to || to.hp <= 0 || onField(to)) return;
        var slot = u.slot; front(withdrawBeats(u).concat(sendoutBeats(to, slot))); return;
      }
      if (a.kind === 'item') {
        var tg = a.target ? byId(a.target) : u; if (!tg) tg = u;
        var r = call('useItem', [{ item: a.item, target: pub(tg), user: pub(u), turn: turn }], null) || {};
        var seq = [M(r.text ? String(r.text) : TX.item(String(a.label || a.item).toUpperCase(), tg.name))];
        if (r.heal) seq.push(D(function () { addFx('heal', centerOf(tg), L.tok('fx.heal', '#4ad870'), 34); }), W(12), D(function () { applyHit({ kind: 'heal', targetC: tg, amount: num(r.heal, 0), cause: 'item' }); }), drainBeat(), M(TX.heal(nm(tg))));
        if (r.cure && tg.status) seq.push(D(function () { applyHit({ kind: 'cure', targetC: tg, cause: 'item' }); }));
        if (r.restore) seq.push(D(function () { tg.moves.forEach(function (m) { m.uses = Math.min(m.max, m.uses + Math.max(1, num(r.restore, 5) | 0)); }); }));
        front(seq); return;
      }
      doMove(u, a);
    }
    function speedOf(c) { return c.spd * (c.status === 'numb' ? 0.5 : 1); }
    function chooseFor(c) {
      var view = aiView(c), pick = null;
      if (c.side === 'foe') pick = call('chooseFoe', [view], null);
      else pick = call('chooseOwn', [view], null);
      return normPick(c, pick) || normPick(c, defaultAI(c, c.side === 'foe' ? P.aiRandom : 0));
    }
    function normPick(c, p) {
      if (p == null) return null;
      if (typeof p === 'number') p = { move: p };
      if (p.switchTo != null || p.switch != null) { var to = byId(p.switchTo != null ? p.switchTo : p.switch); if (to && to.side === c.side && to.hp > 0 && !onField(to)) return { kind: 'switch', user: c, to: to }; return null; }
      if (p.item != null) return { kind: 'item', user: c, item: p.item, label: p.label, target: p.target != null ? String(p.target) : c.id };
      var mi = p.move; if (typeof mi === 'string') mi = c.moves.map(function (m) { return m.id; }).indexOf(mi);
      mi = num(mi, -1) | 0; if (mi < 0 || mi >= c.moves.length) return null;
      if (c.moves[mi].uses <= 0 && c.moves.some(function (m) { return m.uses > 0; })) return null;
      var tgt = p.target != null ? (typeof p.target === 'object' ? p.target.id : p.target) : null;
      return { kind: 'move', user: c, move: mi, target: tgt != null ? String(tgt) : null };
    }
    function aiView(c) {
      return { self: pub(c), foes: active(other(c.side)).map(pub), allies: active(c.side).filter(function (x) { return x !== c; }).map(pub), bench: bench(c.side).map(pub), turn: turn,
        effectiveness: function (moveIndex, foeId) { var m = c.moves[moveIndex], f = byId(foeId); return m && f ? (m.kind === 'hit' ? mult(m.type, f.types) : 1) : 1; },
        random: R };
    }
    function scoreMove(c, m, f) {
      if (m.uses <= 0) return -1;
      var e = m.effect || {};
      if (m.kind === 'hit') { var eff = mult(m.type, f.types); return m.power * eff * (m.type && c.types.indexOf(m.type) >= 0 ? P.stab : 1) * (m.acc / 100) * (m.target === 'allFoes' ? 1.2 : 1) + (e.status && !f.status ? 6 : 0); }
      if (e.status) return f.status || statusImmune(f, low(e.status)) ? 0 : 38 * (m.acc / 100);
      if (e.heal) return c.hp < c.maxHp * 0.45 ? 70 : 0;
      if (e.guard) return 6;
      return 4;
    }
    function defaultAI(c, randomness) {
      var foes = active(other(c.side)); if (!foes.length) return { move: 0 };
      var usable = c.moves.map(function (m, i) { return i; }).filter(function (i) { return c.moves[i].uses > 0; });
      if (!usable.length) return { move: 0 };
      if (randomness && R() < randomness) { var ri = usable[(R() * usable.length) | 0]; return { move: ri, target: foes[(R() * foes.length) | 0].id }; }
      var best = -2, bi = usable[0], bt = foes[0];
      usable.forEach(function (i) { foes.forEach(function (f) { var s = scoreMove(c, c.moves[i], f); if (s > best) { best = s; bi = i; bt = f; } }); });
      if (c.side === 'own' && best < 30 && turn - (c.lastSwitch || -9) > 2) {
        var alt = null, altBest = best;
        bench('own').forEach(function (b) { foes.forEach(function (f) { b.moves.forEach(function (m) { var s = scoreMove(b, m, f) * (b.hp / b.maxHp); if (s > altBest * 1.6 + 10) { altBest = s; alt = b; } }); }); });
        if (alt) { c.lastSwitch = turn; alt.lastSwitch = turn; return { switchTo: alt.id }; }
      }
      return { move: bi, target: bt.id };
    }
    function buildTurn(ownActs) {
      var acts = ownActs.slice();
      active('foe').forEach(function (c) { acts.push(chooseFor(c)); });
      acts.forEach(function (a) {
        a.tb = R();
        a.prio = a.kind === 'run' ? 9 : a.kind === 'switch' ? 8 : a.kind === 'item' ? 7 : (a.user.moves[a.move] ? a.user.moves[a.move].priority : 0);
        a.spd = speedOf(a.user);
      });
      acts.sort(function (x, y) { return y.prio - x.prio || y.spd - x.spd || x.tb - y.tb; });
      phase = 'resolve'; call('onPhase', ['resolve']); emit({ type: 'phase', phase: 'resolve' });
      emit({ type: 'order', ids: acts.map(function (a) { return a.user.id; }) });
      var seq = acts.map(function (a) { return D(function () { if (!result && alive('own') && alive('foe')) runAction(a); }); });
      seq.push(D(endOfTurn));
      front(seq);
    }
    function endOfTurn() {
      if (result) return;
      var seq = [];
      ['own', 'foe'].forEach(function (s) { SIDES[s].slots.forEach(function (c) { if (c) c.guard = false; }); });
      ['own', 'foe'].forEach(function (s) {
        SIDES[s].slots.forEach(function (c) {
          if (!c || c.status !== 'burn') return;
          seq.push(D(function () {
            if (c.hp <= 0 || !onField(c)) return;
            front([D(function () { addFx('status', centerOf(c), L.tok('fx.hot', '#ff7a3a'), 24); applyHit({ kind: 'damage', targetC: c, amount: Math.max(1, Math.floor(c.maxHp / 16)), cause: 'burn' }); }), drainBeat(), M(TX.burnHurt(nm(c))), checkFaint(c)]);
          }));
        });
      });
      seq.push(D(replacements));
      front(seq);
    }
    function checkEnd() {
      if (result) return true;
      var ow = alive('own'), fo = alive('foe');
      if (ow && fo) return false;
      var res = fo ? 'lose' : 'win';
      front([M(res === 'win' ? TX.win(foeName) : TX.lose(), { hold: 1400 }), D(function () { finish(res); })]);
      return true;
    }
    function finish(res) {
      if (result) return;
      result = res; phase = 'over'; cmd = null; note = null;
      call('onPhase', ['over']); emit({ type: 'end', result: res }); call('onEnd', [res, snapshot()]);
    }
    var replaceQ = [];
    function replacements() {
      if (checkEnd()) return;
      var seq = [];
      SIDES.foe.slots.forEach(function (c, s) {
        if (c && c.hp > 0) return;
        var pool = bench('foe'); if (!pool.length) { if (c) SIDES.foe.slots[s] = null; return; }
        var pick = call('chooseFoeReplacement', [{ bench: pool.map(pub), foes: active('own').map(pub), slot: s }], null);
        var next = pick != null ? byId(typeof pick === 'object' ? pick.id : pick) : null;
        if (!next || next.side !== 'foe' || next.hp <= 0 || onField(next) || seq.some(function (b) { return b.c === next; })) next = pool.filter(function (p) { return !seq.some(function (b) { return b.c === p; }); })[0];
        if (!next) return;
        var sb = sendoutBeats(next, s); sb[0].c = next; seq = seq.concat(sb);
      });
      replaceQ = [];
      SIDES.own.slots.forEach(function (c, s) { if (!c || c.hp > 0) return; if (bench('own').length > replaceQ.length) replaceQ.push(s); else SIDES.own.slots[s] = null; });
      seq.push(D(function () { if (replaceQ.length) openReplace(); else startCommand(); }));
      front(seq);
    }
    function openReplace() {
      phase = 'replace'; call('onPhase', ['replace']); emit({ type: 'phase', phase: 'replace' });
      cmd = { slot: replaceQ[0], menu: 'team', forced: true, idx: { root: 0, fight: 0, team: 0, item: 0, target: 0 }, picks: [], t: 0, auto: null };
      cmd.idx.team = SIDES.own.team.indexOf(bench('own')[0]);
      setMsg(TX.choose(), false); msg.shown = 1e9;
    }

    /* ---- command phase (the player's menus) ---- */
    function ownSlotsToCommand() { var out = []; SIDES.own.slots.forEach(function (c, s) { if (c && c.hp > 0) out.push(s); }); return out; }
    function startCommand() {
      if (checkEnd()) return;
      turn++; phase = 'command'; note = null;
      var order = ownSlotsToCommand();
      if (!order.length) { if (!checkEnd()) buildTurn([]); return; }
      cmd = { order: order, oi: 0, slot: order[0], menu: 'root', idx: { root: 0, fight: 0, team: 0, item: 0, target: 0 }, picks: [], t: 0, auto: null };
      call('onTurn', [turn]); emit({ type: 'turn', turn: turn }); call('onPhase', ['command']); emit({ type: 'phase', phase: 'command' });
      promptMsg();
    }
    function promptMsg() { var c = SIDES.own.slots[cmd.slot]; setMsg(TX.prompt(c ? c.name : ''), false); msg.shown = 1e9; }
    function items() { var list = call('items', [], []) || []; return arr(list).map(function (it) { return { id: it.id, label: String(it.label || it.id).toUpperCase(), note: it.note != null ? String(it.note) : '', ok: it.ok !== false, aim: it.aim || 'active' }; }); }
    function rootOpts() { var it = items(); return [{ id: 'fight', label: 'FIGHT', ok: true }, { id: 'item', label: 'ITEM', ok: it.length > 0 }, { id: 'team', label: 'TEAM', ok: true }, { id: 'run', label: 'RUN', ok: !!P.canRun }]; }
    function setNote(t) { note = { text: t, t: 0 }; }
    function liveFoeSlots() { var out = []; SIDES.foe.slots.forEach(function (c, s) { if (c && c.hp > 0) out.push(s); }); return out; }
    function pick(act) {
      if (phase === 'replace') {
        var to = act.to, s = replaceQ.shift();
        front(sendoutBeats(to, s).concat([D(function () { if (replaceQ.length) openReplace(); else startCommand(); })]));
        phase = 'resolve'; cmd = null; return;
      }
      cmd.picks.push(act); emit({ type: 'choice', slot: cmd.slot, kind: act.kind, move: act.move, target: act.target, to: act.to ? act.to.id : null });
      if (act.kind === 'run') { cmd = null; buildTurn([act]); return; }
      cmd.oi++;
      if (cmd.oi >= cmd.order.length) { var p = cmd.picks; cmd = null; buildTurn(p); return; }
      cmd.slot = cmd.order[cmd.oi]; cmd.menu = 'root'; cmd.idx.root = 0; cmd.idx.fight = 0; cmd.auto = null; promptMsg();
    }
    function grid(i, k) { var r = i >> 1, c = i & 1; if (k === 'up') r = 0; if (k === 'down') r = 1; if (k === 'left') c = 0; if (k === 'right') c = 1; return r * 2 + c; }
    function confirm() {
      var c = SIDES.own.slots[cmd.slot], m = cmd.menu, i;
      if (m === 'root') {
        var opt = rootOpts()[cmd.idx.root];
        if (opt.id === 'fight') { cmd.menu = 'fight'; cmd.idx.fight = clamp(cmd.idx.fight, 0, c.moves.length - 1); }
        else if (opt.id === 'item') { if (!opt.ok) setNote(TX.noItems()); else { cmd.menu = 'item'; cmd.idx.item = 0; } }
        else if (opt.id === 'team') { cmd.menu = 'team'; cmd.idx.team = SIDES.own.team.indexOf(c); }
        else if (opt.id === 'run') { if (!opt.ok) setNote(TX.noRun()); else pick({ kind: 'run', user: c }); }
        return;
      }
      if (m === 'fight') {
        i = cmd.idx.fight; var mv = c.moves[i];
        if (!mv) return;
        if (mv.uses <= 0 && c.moves.some(function (x) { return x.uses > 0; })) { setNote(TX.empty()); return; }
        var fs = liveFoeSlots();
        if (mv.target === 'foe' && fs.length > 1) { cmd.menu = 'target'; cmd.idx.target = Math.max(0, fs.indexOf(cmd.lastTarget != null ? cmd.lastTarget : fs[0])); return; }
        pick({ kind: 'move', user: c, move: i, target: mv.target === 'foe' && fs.length ? SIDES.foe.slots[fs[0]].id : null }); return;
      }
      if (m === 'target') { var ls = liveFoeSlots(), ts = ls[clamp(cmd.idx.target, 0, ls.length - 1)]; cmd.lastTarget = ts; pick({ kind: 'move', user: c, move: cmd.idx.fight, target: SIDES.foe.slots[ts].id }); return; }
      if (m === 'team') {
        var who = SIDES.own.team[cmd.idx.team]; if (!who) return;
        if (who.hp <= 0) { setNote(TX.cant(who.name)); return; }
        if (onField(who) || (cmd.picks || []).some(function (p) { return p.to === who; })) { setNote(TX.already(who.name)); return; }
        if (phase === 'replace') { pick({ kind: 'switch', to: who }); return; }
        pick({ kind: 'switch', user: c, to: who }); return;
      }
      if (m === 'item') {
        var it = items()[cmd.idx.item]; if (!it) return;
        if (!it.ok) { setNote(TX.noItems()); return; }
        pick({ kind: 'item', user: c, item: it.id, label: it.label, target: c.id }); return;
      }
    }
    function back() {
      if (!cmd) return;
      var m = cmd.menu;
      if (m === 'fight' || m === 'item') { cmd.menu = 'root'; return; }
      if (m === 'team') { if (!cmd.forced) cmd.menu = 'root'; return; }
      if (m === 'target') { cmd.menu = 'fight'; return; }
      if (m === 'root' && cmd.oi > 0) { cmd.oi--; cmd.picks.pop(); cmd.slot = cmd.order[cmd.oi]; cmd.menu = 'root'; promptMsg(); }
    }
    function menuKey(k) {
      if (note && k !== 'ok' && k !== 'back') note = null;
      if (note && (k === 'ok' || k === 'back')) { note = null; return; }
      var m = cmd.menu, c = SIDES.own.slots[cmd.slot];
      if (k === 'ok') return confirm();
      if (k === 'back') return back();
      if (m === 'root') cmd.idx.root = grid(cmd.idx.root, k);
      else if (m === 'fight') { var ni = grid(cmd.idx.fight, k); if (c && ni < c.moves.length) cmd.idx.fight = ni; }
      else if (m === 'target') { var n = liveFoeSlots().length; if (k === 'left' || k === 'up') cmd.idx.target = (cmd.idx.target + n - 1) % n; else cmd.idx.target = (cmd.idx.target + 1) % n; }
      else if (m === 'team') { var tn = SIDES.own.team.length; if (k === 'up' || k === 'left') cmd.idx.team = (cmd.idx.team + tn - 1) % tn; else cmd.idx.team = (cmd.idx.team + 1) % tn; }
      else if (m === 'item') { var inn = Math.max(1, items().length); if (k === 'up' || k === 'left') cmd.idx.item = (cmd.idx.item + inn - 1) % inn; else cmd.idx.item = (cmd.idx.item + 1) % inn; }
    }

    /* ---- autoplay: plans a choice, then presses the same keys a player would ---- */
    function planKeys() {
      var c = SIDES.own.slots[cmd.slot], keys = [];
      if (phase === 'replace') {
        var pickC = null, p = normPick(c || bench('own')[0], call('chooseOwnReplacement', [{ bench: bench('own').map(pub), foes: active('foe').map(pub) }], null));
        if (p && p.to) pickC = p.to;
        if (!pickC) { var best = -1; bench('own').forEach(function (b) { var s = 0; active('foe').forEach(function (f) { b.moves.forEach(function (m) { s = Math.max(s, scoreMove(b, m, f)); }); }); s *= 0.5 + b.hp / b.maxHp; if (s > best) { best = s; pickC = b; } }); }
        var ti = SIDES.own.team.indexOf(pickC), d = ti - cmd.idx.team, tn = SIDES.own.team.length;
        if (d < 0) d += tn; for (var q = 0; q < d; q++) keys.push('down'); keys.push('ok'); return keys;
      }
      var act = chooseFor(c);
      var goRoot = function (target) { var r = cmd.idx.root; if ((r >> 1) !== (target >> 1)) keys.push((target >> 1) ? 'down' : 'up'); if ((r & 1) !== (target & 1)) keys.push((target & 1) ? 'right' : 'left'); keys.push('ok'); };
      if (cmd.menu === 'target') keys.push('back');
      if (cmd.menu !== 'root') keys.push('back');
      if (act.kind === 'switch') {
        goRoot(2); var ti2 = SIDES.own.team.indexOf(act.to), from = SIDES.own.team.indexOf(c), d2 = ti2 - from; if (d2 < 0) d2 += SIDES.own.team.length;
        for (var z = 0; z < d2; z++) keys.push('down'); keys.push('ok'); return keys;
      }
      if (act.kind === 'item') { goRoot(1); var ii = Math.max(0, items().map(function (it) { return String(it.id); }).indexOf(String(act.item))); for (var y = 0; y < ii; y++) keys.push('down'); keys.push('ok'); return keys; }
      goRoot(0);
      var mi = act.move, fi = cmd.menu === 'fight' ? cmd.idx.fight : cmd.idx.fight;
      if ((fi >> 1) !== (mi >> 1)) keys.push((mi >> 1) ? 'down' : 'up'); if ((fi & 1) !== (mi & 1)) keys.push((mi & 1) ? 'right' : 'left');
      keys.push('ok');
      var mv = c.moves[mi], fs = liveFoeSlots();
      if (mv && mv.target === 'foe' && fs.length > 1) {
        var want = act.target ? byId(act.target) : null, wi = want && onField(want) ? fs.indexOf(want.slot) : 0;
        var startI = Math.max(0, fs.indexOf(cmd.lastTarget != null ? cmd.lastTarget : fs[0]));
        if (wi >= 0 && wi !== startI) keys.push('right'); keys.push('ok');
      }
      return keys;
    }
    function autoStep() {
      if (!auto || !cmd || (phase !== 'command' && phase !== 'replace')) return;
      if (!cmd.auto) cmd.auto = { keys: null, t: 0, tries: 0 };
      var a = cmd.auto; a.t++;
      if (!a.keys) { if (a.t < 24) return; a.keys = planKeys(); a.t = 0; a.tries++; return; }
      if (a.t < (a.keys.length === 1 ? 16 : 9)) return;
      a.t = 0; var key = a.keys.shift(), before = cmd, oi = cmd.oi, ph = phase;
      menuKey(key);
      if (note) note = null;
      if (!a.keys.length && cmd && cmd === before && cmd.oi === oi && phase === ph) {
        cmd.autoFail = (cmd.autoFail || 0) + 1; cmd.auto = null; cmd.menu = cmd.forced ? 'team' : 'root';
        if (cmd.autoFail >= 2) forcePick();
      }
    }
    function forcePick() {
      if (phase === 'replace') { var b0 = bench('own')[0]; if (b0) pick({ kind: 'switch', to: b0 }); return; }
      var c = SIDES.own.slots[cmd.slot], i = Math.max(0, c.moves.map(function (m) { return m.uses > 0; }).indexOf(true)), fs = liveFoeSlots();
      pick({ kind: 'move', user: c, move: i, target: fs.length ? SIDES.foe.slots[fs[0]].id : null });
    }

    /* ---- clock ---- */
    function stepAnim() {
      all().forEach(function (c) {
        c.vt++;
        if (c.vis === 'in' && c.vt >= 40) setVis(c, 'idle');
        if (c.vis === 'out' && c.vt >= 28) setVis(c, 'hidden');
        if (c.vis === 'faint' && c.vt >= 34) setVis(c, 'gone');
        if (c.blink > 0) c.blink--; if (c.shake > 0) c.shake--;
        if (c.lunge > 0) { c.lunge++; if (c.lunge > 18) c.lunge = 0; }
        if (c.boxDir) { c.box = clamp(c.box + c.boxDir * 0.1, 0, 1); if (c.box === 0 || c.box === 1) c.boxDir = 0; }
        if (c.shownHp !== c.hp) {
          var rate = Math.max(0.2, c.maxHp / (60 * (DRAIN[P.drain] || num(P.drain, 1.15))));
          if (Math.abs(c.hp - c.shownHp) <= rate) c.shownHp = c.hp; else c.shownHp += c.hp > c.shownHp ? rate : -rate;
        }
      });
      fx = fx.filter(function (f) { f.t++; return f.t < f.n; });
      if (shake > 0) shake--;
      if (note) { note.t++; if (note.t > 80) note = null; }
    }
    function step() {
      tick++;
      if (paused) return;
      if (stopFrames > 0) { stopFrames--; return; }
      stepAnim();
      if (phase === 'command' || phase === 'replace') { if (cmd) cmd.t++; autoStep(); }
      stepBeats();
      computeAnchors();
    }

    /* ---- layout ---- */
    var VIEWC = null;
    function layout() {
      var v = view || VIEWC || { x: 0, y: 0, w: 240, h: 160 };
      if (layout.k === v.x + ',' + v.y + ',' + v.w + ',' + v.h + P.format) return layout.v;
      var dbl = P.format === 'double', W = v.w, H = v.h, tbH = H >= 200 ? 56 : 48, tbY = v.y + H - tbH, fieldH = H - tbH;
      var boxW = clamp(Math.round(W * (dbl ? 0.42 : 0.45)), 96, 132), boxH = dbl ? 23 : 36;
      var Lw = {
        view: v, dbl: dbl, tbY: tbY, tbH: tbH, fieldH: fieldH,
        msg: { x: v.x, y: tbY, w: W, h: tbH },
        foePlat: { x: v.x + Math.round(W * 0.72), y: v.y + Math.round(fieldH * (dbl ? 0.45 : 0.5)), rx: Math.round(W * (dbl ? 0.22 : 0.18)), ry: Math.max(6, Math.round(W * 0.045)) },
        ownPlat: { x: v.x + Math.round(W * 0.27), y: tbY - Math.round(fieldH * 0.02), rx: Math.round(W * (dbl ? 0.27 : 0.23)), ry: Math.max(7, Math.round(W * 0.055)) },
        foeBox: [], ownBox: [], boxW: boxW, boxH: boxH
      };
      for (var i = 0; i < (dbl ? 2 : 1); i++) {
        Lw.foeBox.push({ x: v.x + 4, y: v.y + 4 + i * (boxH + 2), w: boxW, h: boxH });
        Lw.ownBox.push({ x: v.x + W - boxW - 4, y: tbY - (dbl ? 3 : 4) - boxH - (dbl ? (1 - i) * (boxH + 2) : 0), w: boxW, h: boxH });
      }
      Lw.msgInner = { x: Lw.msg.x + 4, y: Lw.msg.y + 4, w: Lw.msg.w - 8, h: Lw.msg.h - 8 };
      layout.k = v.x + ',' + v.y + ',' + v.w + ',' + v.h + P.format; layout.v = Lw; return Lw;
    }

    /* ---- sprites ---- */
    var SPR = {};
    function placeholder(c, back) {
      var key = 'ph|' + c.id + '|' + back; if (SPR[key]) return SPR[key];
      var s = back ? 40 : 32, cv = mk(s, s), g = cv.getContext('2d'), col = c.types.length ? typeOf(c.types[0]).color : '#9aa0b8';
      var r = s / 2 - 2, cx = s / 2, cy = s / 2 + 2;
      for (var y = 0; y < s; y++) for (var x = 0; x < s; x++) {
        var dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / (r * 0.86), d = dx * dx + dy * dy; if (d > 1) continue;
        var lit = -dx * 0.5 - dy * 0.6 + Math.sqrt(Math.max(0, 1 - d)) * 0.6;
        g.fillStyle = d > 0.82 ? mix(col, '#140c1c', 0.7) : lit > 0.75 ? mix(col, '#ffffff', 0.45) : lit > 0.35 ? col : mix(col, '#1a1030', 0.4); g.fillRect(x, y, 1, 1);
      }
      if (!back) { g.fillStyle = '#140c1c'; g.fillRect(cx - 6, cy - 3, 2, 4); g.fillRect(cx + 4, cy - 3, 2, 4); g.fillStyle = '#ffffff'; g.fillRect(cx - 6, cy - 3, 1, 1); g.fillRect(cx + 4, cy - 3, 1, 1); }
      return (SPR[key] = cv);
    }
    function spriteOf(c, back) {
      var key = c.id + '|' + (back ? 'back' : 'front');
      if (SPR[key] !== undefined) return SPR[key];
      var img = call('sprite', [c.src, back ? 'back' : 'front', pub(c)], null);
      if (!img || !(img.width > 0)) img = null;
      SPR[key] = img; return img;
    }
    function silhouette(img) {
      if (img.__fmWhite) return img.__fmWhite;
      var c = mk(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
      try { img.__fmWhite = c; } catch (e) { /* frozen image */ } return c;
    }
    function scaleFor(img, back, lay) {
      if (P.spriteScale !== 'auto') return Math.max(1, num(P.spriteScale, 1) | 0);
      var want = lay.fieldH * (back ? 0.42 : 0.34) * (lay.dbl ? 0.85 : 1), maxW = lay.view.w * (back ? 0.4 : 0.32) * (lay.dbl ? 0.8 : 1);
      return Math.max(1, Math.min(Math.round(want / Math.max(8, img.height)), Math.floor(maxW / Math.max(8, img.width))));
    }
    function slotPos(c, lay) {
      var dbl = lay.dbl, foe = c.side === 'foe', pl = foe ? lay.foePlat : lay.ownPlat, off = 0;
      if (dbl) off = (c.slot === 0 ? -1 : 1) * Math.round(pl.rx * 0.48);
      return { x: pl.x + off, feet: foe ? pl.y + Math.round(pl.ry * 0.3) + (dbl && c.slot === 1 ? 3 : 0) : lay.tbY + Math.round(lay.tbH * 0.12) + (dbl && c.slot === 0 ? -4 : 0) };
    }
    function spriteBox(c, lay) {
      var back = c.side === 'own', img = spriteOf(c, back), useCb = !img && typeof o.drawCreature === 'function';
      if (!img && !useCb) img = placeholder(c, back);
      var s = img ? scaleFor(img, back, lay) : 1, w = img ? img.width * s : Math.round(lay.fieldH * (back ? 0.42 : 0.34)), h = img ? img.height * s : w, p = slotPos(c, lay);
      return { img: img, s: s, w: w, h: h, x: Math.round(p.x - w / 2), y: Math.round(p.feet - h), feet: p.feet, cx: p.x };
    }
    function computeAnchors() {
      var lay = layout();
      all().forEach(function (c) {
        if (!onField(c) && c.vis !== 'faint' && c.vis !== 'out') { c.anchorRect = null; return; }
        var b = spriteBox(c, lay), visTop = Math.max(b.y, lay.view.y), visBot = Math.min(b.y + b.h, c.side === 'own' ? lay.tbY : b.y + b.h);
        c.anchorRect = { id: c.id, side: c.side, slot: c.slot, x: b.cx, left: b.x, top: b.y, w: b.w, h: b.h, footY: b.feet, cy: Math.round((visTop + visBot) / 2), dead: c.hp <= 0 };
      });
    }
    function anchorOf(c) { if (!c.anchorRect) computeAnchors(); return c.anchorRect; }

    /* ---- drawing: scene ---- */
    function defaultBackdrop(g, lay, t) {
      var v = lay.view, fy = lay.tbY, sky = ['#7ec4ec', '#9ed4f0', '#bfe4f4', '#dff2f6'], gr = ['#8ccf6a', '#76bd58', '#62a84a', '#4f923e'];
      var hz = v.y + Math.round(lay.fieldH * 0.36);
      for (var y = v.y; y < hz; y++) { g.fillStyle = sky[Math.min(3, Math.floor((y - v.y) / (hz - v.y) * 4))]; g.fillRect(v.x, y, v.w, 1); }
      for (var y2 = hz; y2 < fy; y2++) { g.fillStyle = gr[Math.min(3, Math.floor((y2 - hz) / (fy - hz) * 4))]; g.fillRect(v.x, y2, v.w, 1); }
      g.fillStyle = '#a8d880'; g.fillRect(v.x, hz, v.w, 1);
    }
    function platform(g, pl, side) {
      var cols = (o.platform && o.platform[side]) || o.platform || null;
      if (typeof cols === 'function') { try { cols(g, pl, side); } catch (e) { /* host art */ } return; }
      var C = Array.isArray(cols) ? cols : side === 'foe' ? ['#d8e8a0', '#b4d07a', '#8aae58', '#5e8840'] : ['#d8e8a0', '#b4d07a', '#8aae58', '#5e8840'];
      for (var y = -pl.ry; y <= pl.ry; y++) {
        var q = 1 - (y * y) / ((pl.ry + 0.4) * (pl.ry + 0.4)); if (q < 0) continue; var w = Math.floor(Math.sqrt(q) * (pl.rx + 0.4));
        var band = y < -pl.ry * 0.45 ? 0 : y < 0 ? 1 : y < pl.ry * 0.6 ? 2 : 3;
        g.fillStyle = C[band]; g.fillRect(pl.x - w, pl.y + y, w * 2 + 1, 1);
        g.fillStyle = C[3]; g.fillRect(pl.x - w, pl.y + y, 1, 1); g.fillRect(pl.x + w, pl.y + y, 1, 1);
      }
    }
    function drawCreatureAt(g, c, lay, t) {
      if (c.vis === 'hidden' || c.vis === 'gone') return;
      var b = spriteBox(c, lay), vt = c.vt, scale = 1, white = 0, dy = 0, alpha = 1, clipY = null;
      if (c.vis === 'in') { if (vt < 18) return; var k = vt - 18; scale = k < 4 ? 0.25 : k < 8 ? 0.5 : k < 12 ? 0.75 : 1; white = k < 12 ? 1 : k < 20 ? (20 - k) / 8 : 0; }
      if (c.vis === 'out') { white = Math.min(1, vt / 8); scale = vt < 12 ? 1 : vt < 16 ? 0.75 : vt < 20 ? 0.5 : vt < 24 ? 0.25 : 0; if (!scale) return; }
      if (c.vis === 'faint') { if (vt < 10) { if ((vt >> 1) % 2) return; } else { dy = Math.round((vt - 10) / 24 * b.h); clipY = b.feet; } }
      if (c.blink > 0 && Math.floor(c.blink / 3) % 2 === 0) return;
      var dir = c.side === 'own' ? 1 : -1, lng = c.lunge ? Math.round(Math.sin(Math.min(1, c.lunge / 18) * Math.PI) * 6) : 0;
      var sx = c.shake > 0 ? (c.shake % 4 < 2 ? 2 : -2) : 0, bob = c.vis === 'idle' && c.hp > 0 && c.hp <= c.maxHp * 0.25 ? 0 : (c.vis === 'idle' ? (Math.floor((t * 60 + c.index * 17) / 32) % 2) : 0);
      if (c.status === 'sleep' && c.vis === 'idle') bob = 0;
      var w = Math.round(b.w * scale), h = Math.round(b.h * scale), x = Math.round(b.cx - w / 2) + dir * lng + sx, y = b.feet - h + dy - dir * Math.round(lng / 2) - bob;
      g.save();
      if (clipY != null) { g.beginPath(); g.rect(lay.view.x, lay.view.y, lay.view.w, clipY - lay.view.y); g.clip(); }
      g.globalAlpha *= alpha; g.imageSmoothingEnabled = false;
      if (b.img) {
        g.drawImage(b.img, 0, 0, b.img.width, b.img.height, x, y, w, h);
        if (white > 0) { g.globalAlpha *= white; g.drawImage(silhouette(b.img), 0, 0, b.img.width, b.img.height, x, y, w, h); }
      } else {
        try { o.drawCreature(g, c.src, { x: x, y: y, w: w, h: h }, { view: c.side === 'own' ? 'back' : 'front', white: white, scale: scale, t: t, id: c.id }); } catch (e) { /* host art */ }
      }
      g.restore();
    }
    function orb(g, x, y, open) {
      var A1 = L.tok('team.b', '#d85a48'), A2 = L.tok('paper', '#f4f6ff'), ink = L.tok('ink', '#06061a');
      for (var yy = -3; yy <= 3; yy++) for (var xx = -3; xx <= 3; xx++) {
        var d = xx * xx + yy * yy; if (d > 11) continue;
        g.fillStyle = d > 7 ? ink : yy < 0 ? A1 : yy === 0 ? ink : A2; if (open && yy < 0) g.fillStyle = d > 7 ? ink : '#ffffff';
        g.fillRect(x + xx, y + yy - (open && yy < 0 ? 2 : 0), 1, 1);
      }
    }
    function drawOrbs(g, lay) {
      all().forEach(function (c) {
        if (c.vis !== 'in' || c.vt >= 22) return;
        var p = slotPos(c, lay), b = spriteBox(c, lay), k = c.vt, cy = b.feet - Math.round(b.h * 0.45);
        if (k < 14) {
          var f = k / 14, sx = c.side === 'own' ? lay.view.x - 6 : lay.view.x + lay.view.w + 6, sy = c.side === 'own' ? lay.tbY - 10 : lay.view.y + 30;
          orb(g, Math.round(sx + (p.x - sx) * f), Math.round(sy + (cy - sy) * f - Math.sin(f * Math.PI) * 24), false);
        } else {
          var r = (k - 14) * 3, wc = L.tok('fx.white', '#ffffff');
          orb(g, p.x, cy, true);
          for (var i = 0; i < 12; i++) { var an = i / 12 * Math.PI * 2; g.fillStyle = i % 2 ? wc : L.tok('fx.crit', '#ffb43a'); g.fillRect(Math.round(p.x + Math.cos(an) * r), Math.round(cy + Math.sin(an) * r * 0.7), 2, 2); }
        }
      });
      all().forEach(function (c) {
        if (c.vis !== 'out' || c.vt < 12) return;
        var p = slotPos(c, lay), b = spriteBox(c, lay), k = c.vt - 12, tx = c.side === 'own' ? lay.view.x - 6 : lay.view.x + lay.view.w + 6, cy = b.feet - Math.round(b.h * 0.45);
        var f = Math.min(1, k / 16); g.fillStyle = L.tok('fx.white', '#ffffff');
        for (var i = 0; i < 8; i++) { var q = f - i * 0.05; if (q < 0) continue; g.fillRect(Math.round(p.x + (tx - p.x) * q), Math.round(cy + (lay.view.y + 30 - cy) * q * (c.side === 'own' ? 0.2 : 1)), 2, 2); }
      });
    }
    function drawFx(g) {
      fx.forEach(function (f) {
        var k = f.t / f.n, rr = rng(f.seed), i, x, y;
        if (f.kind === 'burst') {
          var r = Math.round(4 + k * 18); g.fillStyle = f.col;
          for (i = 0; i < 14; i++) { var an = i / 14 * Math.PI * 2 + rr(); x = f.x + Math.cos(an) * r; y = f.y + Math.sin(an) * r * 0.8; if (k < 0.85) g.fillRect(Math.round(x), Math.round(y), i % 3 ? 2 : 3, i % 3 ? 2 : 3); }
          if (k < 0.3) { g.fillStyle = L.tok('fx.white', '#ffffff'); var s = Math.round(10 * (1 - k / 0.3)); g.fillRect(f.x - s, f.y, s * 2, 1); g.fillRect(f.x, f.y - s, 1, s * 2); g.fillRect(f.x - 2, f.y - 2, 5, 5); }
        } else if (f.kind === 'bolt' && f.to) {
          var q = Math.min(1, k * 1.15); x = f.x + (f.to.x - f.x) * q; y = f.y + (f.to.y - f.y) * q - Math.sin(q * Math.PI) * 10;
          g.fillStyle = f.col; g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5); g.fillStyle = L.tok('fx.white', '#ffffff'); g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
          for (i = 1; i < 4; i++) { var q2 = Math.max(0, q - i * 0.07); g.fillStyle = f.col; g.fillRect(Math.round(f.x + (f.to.x - f.x) * q2), Math.round(f.y + (f.to.y - f.y) * q2 - Math.sin(q2 * Math.PI) * 10), 2, 2); }
        } else if (f.kind === 'status' || f.kind === 'heal' || f.kind === 'guard') {
          for (i = 0; i < 9; i++) {
            var ph = (k * 1.4 + i / 9) % 1; x = f.x - 12 + ((i * 7) % 25); y = f.y + 10 - ph * 26;
            g.fillStyle = i % 2 ? f.col : L.tok('fx.white', '#ffffff');
            if (f.kind === 'heal') { g.fillRect(Math.round(x) - 1, Math.round(y), 3, 1); g.fillRect(Math.round(x), Math.round(y) - 1, 1, 3); }
            else if (f.kind === 'guard') { g.fillRect(Math.round(f.x + Math.cos(i / 9 * 6.28 + k * 4) * 14), Math.round(f.y + Math.sin(i / 9 * 6.28 + k * 4) * 10), 2, 2); }
            else g.fillRect(Math.round(x), Math.round(y), 2, 2);
          }
        } else if (f.kind === 'zzz') {
          for (i = 0; i < 3; i++) { var ph2 = (k + i / 3) % 1; x = Math.round(f.x + 8 + ph2 * 10); y = Math.round(f.y - 6 - ph2 * 16); L.text(g, 'Z', x, y, f.col, f.col, 'left', 1 - ph2); }
        } else if (f.kind === 'whiff') {
          g.fillStyle = f.col; for (i = 0; i < 5; i++) g.fillRect(Math.round(f.x - 14 + k * 28 + i * 2), Math.round(f.y - 4 + i * 2), 3, 1);
        }
      });
    }
    function drawScene(g) {
      try {
        if (!view && !VIEWC && g && g.canvas) VIEWC = { x: 0, y: 0, w: g.canvas.width, h: g.canvas.height };
        var lay = layout(), t = tick / 60, v = lay.view;
        g.save(); g.imageSmoothingEnabled = false;
        g.beginPath(); g.rect(v.x, v.y, v.w, lay.tbY - v.y); g.clip();
        if (typeof o.drawBackground === 'function') { try { o.drawBackground(g, { x: v.x, y: v.y, w: v.w, h: lay.tbY - v.y }, t, { foePlatform: lay.foePlat, ownPlatform: lay.ownPlat }); } catch (e) { defaultBackdrop(g, lay, t); } }
        else defaultBackdrop(g, lay, t);
        if (shake > 0) g.translate(shake % 4 < 2 ? 1 : -1, 0);
        platform(g, lay.foePlat, 'foe'); platform(g, lay.ownPlat, 'own');
        SIDES.foe.team.slice().sort(function (a, b) { return (a.slot === 1 ? 0 : 1) - (b.slot === 1 ? 0 : 1); }).forEach(function (c) { drawCreatureAt(g, c, lay, t); });
        SIDES.own.team.slice().sort(function (a, b) { return (a.slot === 1 ? 0 : 1) - (b.slot === 1 ? 0 : 1); }).forEach(function (c) { drawCreatureAt(g, c, lay, t); });
        drawOrbs(g, lay); drawFx(g);
        g.restore();
      } catch (e) { warn('drawScene: ' + (e && e.message)); try { g.restore(); } catch (e2) { /* ignore */ } }
    }

    /* ---------------- drawing: UI ---------------- */
    function hpKind(fr) { return fr > 0.5 ? 'hp' : fr > 0.2 ? 'mid' : 'hpLow'; }
    function hpBar(g, x, y, w, c) {
      var fr = c.shownHp / c.maxHp, iw = w - 2, px = Math.round(iw * clamp(fr, 0, 1)), kind = hpKind(fr);
      L.meter(g, { x: x, y: y, w: w, h: 5 }, fr, kind === 'mid' ? 'hp' : kind, px);
      if (kind === 'mid' && px > 0) { g.fillStyle = L.tok('fx.crit', '#ffb43a'); g.fillRect(x + 1, y + 1, px, 3); g.fillStyle = mix(L.tok('fx.crit', '#ffb43a'), '#ffffff', 0.55); g.fillRect(x + 1, y + 1, px, 1); }
      var tgt = Math.round(iw * clamp(c.hp / c.maxHp, 0, 1));
      if (tgt < px) { g.fillStyle = L.tok('fx.hot', '#ff7a3a'); g.fillRect(x + 1 + tgt, y + 1, px - tgt, 3); g.fillStyle = L.tok('fx.white', '#ffffff'); g.fillRect(x + px, y + 1, 1, 3); }
    }
    function badge(g, x, y, st) {
      // pill 11 px tall (y - 2 .. y + 8): dark edge, saturated fill with a light top row, dark text without a shadow
      var S = STATUS[st]; if (!S) return 0; var col = L.tok(S.col, '#ffffff'), ink = L.tok('ink', '#06061a'), w = L.measure(S.tag) + 7;
      g.fillStyle = ink; g.fillRect(x + 1, y - 2, w - 2, 11); g.fillRect(x, y - 1, w, 9);
      g.fillStyle = col; g.fillRect(x + 1, y - 1, w - 2, 9); g.fillStyle = mix(col, '#ffffff', 0.55); g.fillRect(x + 2, y - 1, w - 4, 1);
      L.text(g, S.tag, x + 4, y, ink, ink, 'left', 1, true); return w;
    }
    function typeTag(g, x, y, ty, align) {
      var T = typeOf(ty); if (!T) return 0; var lab = T.label.slice(0, 3), w = L.measure(lab) + 5; if (align === 'right') x -= w;
      g.fillStyle = mix(T.color, '#000000', 0.55); g.fillRect(x, y - 1, w, 9); g.fillStyle = T.color; g.fillRect(x + 1, y, w - 2, 7);
      L.text(g, lab, x + 3, y, '#ffffff', mix(T.color, '#ffffff', 0.7)); return w;
    }
    function infoBox(g, c, r, own, lay) {
      if (c.box <= 0) return;
      var slide = Math.round((1 - c.box) * (r.w + 8)) * (own ? 1 : -1), R2 = { x: r.x + slide, y: r.y, w: r.w, h: r.h };
      var inn = L.frame(g, R2, own ? 'a' : 'b');
      var T = L.tok('text.main', '#ffffff'), T2 = L.tok('text.main2', '#c8d4ff'), lv = 'LV' + c.level;
      var ny = inn.y + (lay.dbl ? 0 : 1), stIn = lay.dbl && c.status;   // compact box: the status pill takes the level's place
      L.fit(g, c.name, inn.x + 1, ny, inn.w - 5 - (stIn ? L.measure(STATUS[c.status].tag) + 7 : L.measure(lv)), T, T2);
      if (!stIn) L.text(g, lv, inn.x + inn.w - 1, ny, L.tok('text.title', '#fff4c8'), L.tok('text.title2', '#e8c870'), 'right');
      var by = inn.y + (lay.dbl ? 9 : 11), lx = inn.x + 1;
      if (stIn) badge(g, inn.x + inn.w - L.measure(STATUS[c.status].tag) - 7, ny, c.status);
      { L.text(g, 'HP', lx, by - 1, L.tok('text.accent', '#ffe070'), L.tok('text.title2', '#e8c870')); lx += L.measure('HP') + 3; }
      hpBar(g, lx, by, inn.x + inn.w - lx - 1, c);
      if (!lay.dbl) {
        var ry = inn.y + 20;
        if (c.status) badge(g, inn.x + 1, ry - 1, c.status);
        if (own) L.text(g, Math.ceil(c.shownHp) + '/' + c.maxHp, inn.x + inn.w - 1, ry, T, T2, 'right');
        else { var tx = inn.x + inn.w; for (var i = c.types.length - 1; i >= 0; i--) tx -= typeTag(g, tx, ry, c.types[i], 'right') + 2; }
      }
      lastRects.ui.push({ name: (own ? 'ownBox' : 'foeBox') + c.slot, x: R2.x, y: R2.y, w: R2.w, h: R2.h });
    }
    function messageText(g, inn, t) {
      if (!msg) return;
      var m = msg, lines = m.pages[m.page], left = Math.floor(m.shown), T = L.tok('text.main', '#ffffff'), T2 = L.tok('text.main2', '#c8d4ff');
      for (var i = 0; i < lines.length; i++) {
        var s = lines[i].slice(0, Math.max(0, left)); left -= lines[i].length;
        L.text(g, s, inn.x + 4, inn.y + 3 + i * L.lineH, T, T2);
      }
      if (m.wait && m.shown >= m.total && cur && cur.k === 'msg' && Math.floor(t * 3) % 2 === 0) {
        var ax = inn.x + inn.w - 9, ay = inn.y + inn.h - 7; g.fillStyle = L.tok('text.accent', '#ffe070');
        g.fillRect(ax, ay, 5, 1); g.fillRect(ax + 1, ay + 1, 3, 1); g.fillRect(ax + 2, ay + 2, 1, 1);
      }
    }
    function cell(r, act) { lastRects.cells.push({ x: r.x, y: r.y, w: r.w, h: r.h, act: act }); }
    function drawRoot(g, lay, t) {
      var m = lay.msg, rw = Math.max(96, Math.round(m.w * 0.42)), left = { x: m.x, y: m.y, w: m.w - rw + 2, h: m.h }, right = { x: m.x + m.w - rw, y: m.y, w: rw, h: m.h };
      var inl = L.frame(g, left, 'n');
      if (note) { var nl = wrap(note.text, inl.w - 6); nl.slice(0, 2).forEach(function (s, i) { L.text(g, s, inl.x + 4, inl.y + 3 + i * L.lineH, L.tok('text.accent', '#ffe070'), L.tok('text.title2', '#e8c870')); }); }
      else if (msg) { var pl = wrap(msg.pages[0].join(' '), inl.w - 6); pl.slice(0, 2).forEach(function (s, i) { L.text(g, s, inl.x + 4, inl.y + 3 + i * L.lineH, L.tok('text.main', '#ffffff'), L.tok('text.main2', '#c8d4ff')); }); }
      var inr = L.frame(g, right, 'a'), opts = rootOpts(), cw = Math.floor((inr.w - 2) / 2), rh = Math.floor(inr.h / 2);
      opts.forEach(function (op, i) {
        var cx = inr.x + 10 + (i & 1) * cw, cy = inr.y + Math.floor((rh - L.fontH) / 2) + (i >> 1) * rh;
        L.text(g, op.label, cx, cy, op.ok ? L.tok('text.main', '#ffffff') : L.tok('text.dim', '#8088a8'), op.ok ? L.tok('text.main2', '#c8d4ff') : L.tok('text.dim2', '#626a88'));
        if (i === cmd.idx.root) L.hand(g, cx - 9, cy + 1, t);
        cell({ x: inr.x + (i & 1) * cw, y: inr.y + (i >> 1) * rh, w: cw, h: rh }, { menu: 'root', i: i });
      });
      lastRects.ui.push({ name: 'menu', x: right.x, y: right.y, w: right.w, h: right.h });
    }
    function hintFor(c, mv) {
      if (P.hints === 'off' || mv.kind !== 'hit') return null;
      var fs = liveFoeSlots(); if (!fs.length) return null;
      var tgt = cmd.menu === 'target' ? SIDES.foe.slots[fs[clamp(cmd.idx.target, 0, fs.length - 1)]] : SIDES.foe.slots[fs[0]];
      if (lay2().dbl && cmd.menu !== 'target' && fs.length > 1) return null;
      var e = mult(mv.type, tgt.types); return e === 0 ? ['NO EFFECT', 'text.dim'] : e > 1 ? ['STRONG', 'fx.heal'] : e < 1 ? ['WEAK', 'fx.hot'] : null;
    }
    function lay2() { return layout(); }
    var labels = [];
    function drawFight(g, lay, t) {
      labels = [];
      var c = SIDES.own.slots[cmd.slot], m = lay.msg, rw = Math.max(70, Math.round(m.w * 0.3)), left = { x: m.x, y: m.y, w: m.w - rw + 2, h: m.h }, right = { x: m.x + m.w - rw, y: m.y, w: rw, h: m.h };
      var inl = L.frame(g, left, 'n'), cw = Math.floor((inl.w - 2) / 2), rh = Math.floor(inl.h / 2);
      for (var i = 0; i < 4; i++) {
        var mv = c.moves[i], cx = inl.x + 10 + (i & 1) * cw, cy = inl.y + Math.floor((rh - L.fontH) / 2) + (i >> 1) * rh;
        if (!mv) { L.text(g, '-', cx, cy, L.tok('text.dim', '#8088a8'), L.tok('text.dim2', '#626a88')); continue; }
        var T = mv.type ? typeOf(mv.type) : null, pc = T ? T.color : L.tok('text.dim', '#8088a8');   // untyped moves get a neutral pip
        g.fillStyle = mix(pc, '#000000', 0.5); g.fillRect(cx - 1, cy - 1, 5, 9); g.fillStyle = pc; g.fillRect(cx, cy, 3, 7); g.fillStyle = mix(pc, '#ffffff', 0.6); g.fillRect(cx, cy, 3, 1);
        var ok = mv.uses > 0, maxW = inl.x + ((i & 1) + 1) * cw - (cx + 6) - 2;
        var fr = L.fit(g, mv.name, cx + 6, cy, maxW, ok ? L.tok('text.main', '#ffffff') : L.tok('text.dim', '#8088a8'), ok ? L.tok('text.main2', '#c8d4ff') : L.tok('text.dim2', '#626a88'));
        labels.push({ creature: c.id, move: mv.id, text: mv.name, x: cx + 6, w: fr.w, maxW: maxW, mode: fr.mode });
        if (i === cmd.idx.fight) L.hand(g, cx - 10, cy + 1, t);
        cell({ x: inl.x + (i & 1) * cw, y: inl.y + (i >> 1) * rh, w: cw, h: rh }, { menu: 'fight', i: i });
      }
      var inr = L.frame(g, right, 'a'), sel = c.moves[cmd.idx.fight] || c.moves[0], lh = Math.floor(inr.h / 3);
      var uc = sel.uses === 0 ? L.tok('fx.hot', '#ff7a3a') : sel.uses <= sel.max / 4 ? L.tok('fx.crit', '#ffb43a') : L.tok('text.main', '#ffffff');
      if (cmd.menu === 'target') L.text(g, 'WHICH FOE?', inr.x + 2, inr.y + 1, L.tok('text.accent', '#ffe070'), L.tok('text.title2', '#e8c870'));
      else {
        L.text(g, 'USES', inr.x + 2, inr.y + 1, L.tok('text.label', '#b8d0ff'), L.tok('text.label2', '#8ca8e8'));
        L.text(g, sel.uses + '/' + sel.max, inr.x + inr.w - 2, inr.y + 1, uc, uc, 'right');
      }
      if (sel.type) { var Ty = typeOf(sel.type), tw = L.measure(Ty.label) + 6; g.fillStyle = mix(Ty.color, '#000000', 0.55); g.fillRect(inr.x + 1, inr.y + lh, tw, 9); g.fillStyle = Ty.color; g.fillRect(inr.x + 2, inr.y + lh + 1, tw - 2, 7); L.text(g, Ty.label, inr.x + 4, inr.y + lh + 1, '#ffffff', mix(Ty.color, '#ffffff', 0.7)); }
      else L.text(g, 'PLAIN', inr.x + 2, inr.y + lh + 1, L.tok('text.dim', '#8088a8'), L.tok('text.dim2', '#626a88'));
      var hn = hintFor(c, sel); if (hn) L.text(g, hn[0], inr.x + 2, inr.y + 2 * lh + 1, L.tok(hn[1], '#ffffff'), L.tok(hn[1], '#ffffff'));
      else if (sel.kind === 'status') L.text(g, 'SUPPORT', inr.x + 2, inr.y + 2 * lh + 1, L.tok('text.label', '#b8d0ff'), L.tok('text.label2', '#8ca8e8'));
      if (note) { var nr = { x: m.x + 8, y: m.y - 18, w: m.w - 16, h: 16 }, ni = L.frame(g, nr, 'n'); L.text(g, note.text, nr.x + nr.w / 2, ni.y + Math.floor((ni.h - L.fontH) / 2), L.tok('text.accent', '#ffe070'), L.tok('text.title2', '#e8c870'), 'center'); }
      lastRects.ui.push({ name: 'menu', x: m.x, y: m.y, w: m.w, h: m.h });
    }
    function drawTarget(g, lay, t) {
      drawFight(g, lay, t);
      var fs = liveFoeSlots(), ts = fs[clamp(cmd.idx.target, 0, fs.length - 1)], tc = SIDES.foe.slots[ts];
      if (!tc) return; var a = anchorOf(tc); if (!a) return;
      var bob = Math.floor(t * 4) % 2, v = lay.view, ink = L.tok('ink', '#06061a'), acc = L.tok('text.accent', '#ffe070'), i;
      if (a.top - 9 >= v.y + 1) {   // room above the sprite: a down-pointing pointer over its head
        var x = a.x - 3, y = a.top - 9 + bob;
        g.fillStyle = ink; g.fillRect(x - 1, y - 1, 9, 6); g.fillStyle = acc;
        for (i = 0; i < 4; i++) g.fillRect(x + i, y + i, 7 - i * 2, 1);
      } else {                       // no room (sprite touches the top edge): a right-pointing pointer beside it
        var py = clamp(a.cy, v.y + 4, lay.tbY - 5) - 3, others = fs.filter(function (s2) { return s2 !== ts; }).map(function (s2) { return anchorOf(SIDES.foe.slots[s2]); }).filter(Boolean);
        var clear = function (px0) { return px0 >= v.x + 1 && px0 + 6 <= v.x + v.w - 1 && !others.some(function (o2) { return px0 - 2 < o2.left + o2.w && o2.left < px0 + 8 && py < o2.top + o2.h && o2.top < py + 9; }); };
        var lx0 = a.left - 9, rx0 = a.left + a.w + 3, side = clear(lx0) || !clear(rx0);
        var px = side ? lx0 + 2 - bob : rx0 + bob;
        g.fillStyle = ink; g.fillRect(px - 1, py - 1, 6, 9); g.fillStyle = acc;
        for (i = 0; i < 4; i++) g.fillRect(side ? px + i : px + 3 - i, py + i, 1, 7 - i * 2);
      }
      var bi = lay.foeBox[tc.slot];   // and mark the target's info box
      if (bi && tc.box >= 1) { g.fillStyle = acc; g.fillRect(bi.x + 2, bi.y + bi.h, bi.w - 4, 1); if (Math.floor(t * 4) % 2 === 0) { g.fillRect(bi.x - 1, bi.y + 2, 1, bi.h - 4); g.fillRect(bi.x + bi.w, bi.y + 2, 1, bi.h - 4); } }
      fs.forEach(function (s) { var cc = SIDES.foe.slots[s], aa = anchorOf(cc); if (aa) cell({ x: aa.left, y: aa.top, w: aa.w, h: aa.h }, { menu: 'target', i: fs.indexOf(s) }); });
    }
    function drawList(g, lay, t, rows, sel, title, side) {
      var v = lay.view, r = { x: v.x + 6, y: v.y + 6, w: v.w - 12, h: lay.tbY - v.y - 8 };
      g.fillStyle = L.tok('ink', '#06061a'); g.fillRect(v.x, v.y, v.w, lay.tbY - v.y);   // the list owns the whole field: nothing shows behind it
      var inn = L.frame(g, r, 'n');
      L.text(g, title, inn.x + 2, inn.y + 1, L.tok('text.title', '#fff4c8'), L.tok('text.title2', '#e8c870'));
      var rh = Math.max(14, Math.min(20, Math.floor((inn.h - 12) / Math.max(1, rows.length)))), y0 = inn.y + 12;
      rows.forEach(function (row, i) {
        var y = y0 + i * rh;
        if (i === sel) { g.fillStyle = L.tok('ui.select', 'rgba(255,255,255,0.2)'); g.fillRect(inn.x, y - 2, inn.w, rh - 1); L.hand(g, inn.x + 1, y + 1, t); }
        row(inn.x + 11, y, inn.w - 12, rh);
        cell({ x: inn.x, y: y - 2, w: inn.w, h: rh }, { menu: side, i: i });
      });
      lastRects.ui.push({ name: 'list', x: r.x, y: r.y, w: r.w, h: r.h });
    }
    function drawTeam(g, lay, t) {
      var team = SIDES.own.team;
      drawList(g, lay, t, team.map(function (c) {
        return function (x, y, w, rh) {
          var out = c.hp <= 0, T = out ? L.tok('text.dim', '#8088a8') : L.tok('text.main', '#ffffff'), T2 = out ? L.tok('text.dim2', '#626a88') : L.tok('text.main2', '#c8d4ff');
          var tx = x; c.types.forEach(function (ty) { var T0 = typeOf(ty); g.fillStyle = T0.color; g.fillRect(tx, y, 3, 7); tx += 4; });
          var out2 = onField(c);
          L.fit(g, c.name, x + 10, y, L.measure('MMMMMMMMMM'), out2 ? L.tok('text.accent', '#ffe070') : T, out2 ? L.tok('text.title2', '#e8c870') : T2);
          var nx = x + 10 + L.measure('MMMMMMMMMM') + 4;
          L.text(g, 'LV' + c.level, nx, y, L.tok('text.title', '#fff4c8'), L.tok('text.title2', '#e8c870'));
          var hx = nx + L.measure('LV00') + 6;
          if (out2) { var ow = L.measure('OUT') + 7, ink = L.tok('ink', '#06061a'), tc = L.tok('team.a', '#3a64d8'); g.fillStyle = ink; g.fillRect(hx + 1, y - 2, ow - 2, 11); g.fillRect(hx, y - 1, ow, 9); g.fillStyle = tc; g.fillRect(hx + 1, y - 1, ow - 2, 9); L.text(g, 'OUT', hx + 4, y, '#ffffff', '#ffffff', 'left', 1, true); hx += ow + 3; }
          if (c.status) hx += badge(g, hx, y, c.status) + 3;
          var hw = x + w - 2 - L.measure('000/000') - 6 - hx;   // the bar gives way to pills; dropped when there is no room
          if (hw >= 12 && (rh >= 16 || w > 200)) { hpBar(g, hx, y + 1, hw, c); L.text(g, Math.ceil(c.shownHp) + '/' + c.maxHp, x + w - 2, y, T, T2, 'right'); }
          else L.text(g, Math.ceil(c.shownHp) + '/' + c.maxHp, x + w - 2, y, T, T2, 'right');
        };
      }), cmd.idx.team, cmd.forced ? TX.choose() : 'TEAM: PICK WHO GOES OUT', 'team');
      if (note) { var m = lay.msg; L.frame(g, m, 'n'); L.text(g, note.text, m.x + 8, m.y + 8, L.tok('text.accent', '#ffe070'), L.tok('text.title2', '#e8c870')); }
    }
    function drawItems(g, lay, t) {
      var list = items();
      drawList(g, lay, t, (list.length ? list : [{ label: 'NOTHING', note: '', ok: false }]).map(function (it) {
        return function (x, y, w) {
          var T = it.ok ? L.tok('text.main', '#ffffff') : L.tok('text.dim', '#8088a8'), T2 = it.ok ? L.tok('text.main2', '#c8d4ff') : L.tok('text.dim2', '#626a88');
          L.fit(g, it.label, x + 2, y, w - 4 - (it.note ? L.measure(it.note) + 6 : 0), T, T2); if (it.note) L.text(g, it.note, x + w - 2, y, L.tok('text.accent', '#ffe070'), L.tok('text.title2', '#e8c870'), 'right');
        };
      }), cmd.idx.item, 'ITEMS', 'item');
    }
    function drawUI(g) {
      try {
        if (!view && !VIEWC && g && g.canvas) VIEWC = { x: 0, y: 0, w: g.canvas.width, h: g.canvas.height };
        var lay = layout(), t = tick / 60;
        lastRects = { ui: [], cells: [] };
        g.save(); g.imageSmoothingEnabled = false;
        SIDES.foe.slots.forEach(function (c, s) { if (c) infoBox(g, c, lay.foeBox[s], false, lay); });
        SIDES.own.slots.forEach(function (c, s) { if (c) infoBox(g, c, lay.ownBox[s], true, lay); });
        if ((phase === 'command' || phase === 'replace') && cmd) {
          if (cmd.menu === 'root') drawRoot(g, lay, t);
          else if (cmd.menu === 'fight') drawFight(g, lay, t);
          else if (cmd.menu === 'target') drawTarget(g, lay, t);
          else if (cmd.menu === 'team') { L.frame(g, lay.msg, 'n'); if (cmd.forced) messageText(g, lay.msgInner, t); else L.text(g, 'SWITCH TO WHICH CREATURE?', lay.msgInner.x + 4, lay.msgInner.y + 3, L.tok('text.main', '#ffffff'), L.tok('text.main2', '#c8d4ff')); drawTeam(g, lay, t); }
          else if (cmd.menu === 'item') { L.frame(g, lay.msg, 'n'); L.text(g, 'USE WHICH ITEM?', lay.msgInner.x + 4, lay.msgInner.y + 3, L.tok('text.main', '#ffffff'), L.tok('text.main2', '#c8d4ff')); drawItems(g, lay, t); }
        } else {
          L.frame(g, lay.msg, 'n'); messageText(g, lay.msgInner, t);
          lastRects.ui.push({ name: 'message', x: lay.msg.x, y: lay.msg.y, w: lay.msg.w, h: lay.msg.h });
          cell(lay.msg, { menu: 'message' });
        }
        if (!lastRects.ui.some(function (r) { return r.name === 'message' || r.name === 'menu'; })) lastRects.ui.push({ name: 'message', x: lay.msg.x, y: lay.msg.y, w: lay.msg.w, h: lay.msg.h });
        g.restore();
      } catch (e) { warn('drawUI: ' + (e && e.message)); try { g.restore(); } catch (e2) { /* ignore */ } }
    }

    /* ---------------- input ---------------- */
    var KEYS = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right', w: 'up', s: 'down', a: 'left', d: 'right', up: 'up', down: 'down', left: 'left', right: 'right',
      z: 'ok', enter: 'ok', ' ': 'ok', space: 'ok', ok: 'ok', confirm: 'ok', a_button: 'ok', x: 'back', escape: 'back', esc: 'back', backspace: 'back', back: 'back', cancel: 'back',
      keyz: 'ok', keyx: 'back', keyw: 'up', keys: 'down', keya: 'left', keyd: 'right' };
    function key(k) {
      if (k && typeof k === 'object') k = k.key || k.code;
      k = KEYS[low(k)]; if (!k || result) return false;
      if (paused || stopFrames > 0) return !!k;
      if ((phase === 'command' || phase === 'replace') && cmd) { if (cmd.auto) cmd.auto = null; menuKey(k); return true; }
      if (cur && cur.k === 'msg' && msg) { if (msg.shown < msg.total) msg.shown = msg.total; else if (msg.wait) msg.done = true; return true; }
      return k === 'ok' || k === 'back';
    }
    function tap(x, y) {
      var hit = null; lastRects.cells.forEach(function (c) { if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) hit = c.act; });
      if (!hit) { if ((phase === 'command' || phase === 'replace') && cmd && cmd.menu !== 'root' && y < layout().tbY && cmd.menu !== 'target') { back(); return true; } return false; }
      if (hit.menu === 'message') return key('ok');
      if (!cmd || cmd.menu !== hit.menu) return false;
      if (cmd.auto) cmd.auto = null; note = null;
      var cur0 = cmd.menu === 'root' ? cmd.idx.root : cmd.menu === 'fight' ? cmd.idx.fight : cmd.menu === 'team' ? cmd.idx.team : cmd.menu === 'item' ? cmd.idx.item : cmd.idx.target;
      if (cmd.menu === 'root') cmd.idx.root = hit.i; else if (cmd.menu === 'fight') { if (!SIDES.own.slots[cmd.slot].moves[hit.i]) return true; cmd.idx.fight = hit.i; } else if (cmd.menu === 'team') cmd.idx.team = hit.i; else if (cmd.menu === 'item') cmd.idx.item = hit.i; else cmd.idx.target = hit.i;
      if (cur0 === hit.i || cmd.menu === 'root' || cmd.menu === 'target') confirm();
      return true;
    }

    /* ---------------- snapshot / start ---------------- */
    function snapshot() {
      var out = {}; ['own', 'foe'].forEach(function (s) { out[s] = SIDES[s].team.map(function (c) { return { id: c.id, hp: c.hp, maxHp: c.maxHp, status: c.status, uses: c.moves.map(function (m) { return m.uses; }), src: c.src }; }); }); return out;
    }
    (function start() {
      var seq = [M(o.intro ? String(o.intro) : (foeName ? TX.intro(foeName) : TX.intro(null)))];
      SIDES.foe.slots.forEach(function (x, s) { var c = SIDES.foe.team.filter(function (cc) { return cc.hp > 0; })[s]; if (c) seq = seq.concat(sendoutBeats(c, s)); });
      SIDES.own.slots.forEach(function (x, s) { var c = SIDES.own.team.filter(function (cc) { return cc.hp > 0; })[s]; if (c) seq = seq.concat(sendoutBeats(c, s)); });
      seq.push(D(startCommand));
      front(seq);
    })();

    var api = {
      // advance: no argument = exactly one 60 Hz tick; dtMs = as many ticks as fit (at most 15 per call)
      update: function (dtMs) {
        try {
          if (dtMs == null) { step(); return; }
          acc = Math.min(acc + num(dtMs, 0), TICK * 15); while (acc >= TICK) { acc -= TICK; step(); }
        } catch (e) { warn('update: ' + (e && e.stack || e)); }
      },
      draw: function (g) { drawScene(g); drawUI(g); },
      drawScene: drawScene, drawUI: drawUI,
      key: key, tap: tap,
      setAuto: function (on) { auto = !!on; if (cmd) cmd.auto = null; }, auto: function () { return auto; },
      pause: function (on) { paused = !!on; }, hitStop: function (ms) { stopFrames = Math.max(stopFrames, Math.ceil(num(ms, 0) / TICK)); },
      setParams: function (p) { for (var kk in p) if (kk in PARAMS && kk !== 'format' && p[kk] != null) P[kk] = typeof PARAMS[kk] === 'number' ? num(p[kk], P[kk]) : p[kk]; if (p && 'auto' in p) auto = !!p.auto; },
      params: function () { var c = {}; for (var kk in P) c[kk] = P[kk]; return c; },
      setView: function (r) { view = r ? { x: r.x | 0, y: r.y | 0, w: r.w | 0, h: r.h | 0 } : null; layout.k = null; computeAnchors(); },
      phase: function () { return phase; }, turn: function () { return turn; }, isOver: function () { return result; }, result: function () { return result; },
      waiting: function () { return (phase === 'command' || phase === 'replace') && !!cmd; },
      menu: function () { return cmd ? { menu: cmd.menu, slot: cmd.slot, index: cmd.menu === 'root' ? cmd.idx.root : cmd.menu === 'fight' ? cmd.idx.fight : cmd.menu === 'team' ? cmd.idx.team : cmd.menu === 'item' ? cmd.idx.item : cmd.idx.target, forced: !!cmd.forced } : null; },
      message: function () { return msg ? msg.pages[msg.page].join(' ') : ''; }, log: function () { return log.slice(); },
      creature: function (id) { return pub(byId(id)); }, team: function (side) { return (SIDES[side] || SIDES.own).team.map(pub); },
      active: function (side) { return active(side || 'own').map(pub); },
      anchor: function (id) { var c = byId(id); if (!c) return null; var a = anchorOf(c); return a ? Object.assign({}, a) : null; },
      uiRects: function () { var lay = layout(), out = lastRects.ui.slice(); if (!out.length) out.push({ name: 'message', x: lay.msg.x, y: lay.msg.y, w: lay.msg.w, h: lay.msg.h }); return out; },
      fieldRect: function () { var lay = layout(); return { x: lay.view.x, y: lay.view.y, w: lay.view.w, h: lay.tbY - lay.view.y }; },
      effectiveness: function (moveType, defTypes) { return mult(moveType, arr(defTypes).map(low)); },
      snapshot: snapshot, applyHit: function (targetId, kind, amount, extra) { var t = byId(targetId); if (!t) return null; return applyHit(Object.assign({ targetC: t, kind: kind || 'damage', amount: amount, cause: 'host' }, extra || {})); },
      stats: function () { return { tick: tick, turn: turn, phase: phase, events: events, beats: beats.length + (cur ? 1 : 0), result: result }; },
      skin: function () { return SK ? SK.id : 'pixel16-builtin'; },
      // move labels of the last drawn move menu: [{creature, move, text, x, w, maxW, mode}] (w <= maxW always; mode shows how it was fitted)
      labelReport: function () { return labels.slice(); }
    };
    return api;
  }

  /* ---------------- default AI exposed for hosts that want to wrap it ---------------- */
  root.GameDNA_FourMove = { create: create, version: VERSION, params: PARAMS, text: TEXT };
})(typeof window !== 'undefined' ? window : this);
