/* GameDNA B-05 Level-select path reveal  (module v1.0.1, plain script, no dependencies, no exports, one global)
 *
 *   const map = GameDNA_LevelMap.create({
 *     nodes: [{id: 'start', x: 24, y: 120, kind: 'start', name: 'Trailhead'}, {id: 'l1', x: 70, y: 110, name: 'Gull Steps'}, ...],
 *     edges: [{a: 'start', b: 'l1'}, {a: 'l1', b: 'l2', via: [[90, 96]]}, {a: 'l2', b: 'cove', exit: 'secret'}, ...],
 *     cleared: saved.cleared,                       // ['l1'] or {l1: 'normal', l2: 'both'}; omitted = new game
 *     enterLevel: id => startLevel(id),             // REQUIRED: the player confirmed a level node; switch to that level
 *     onSave: state => store(state), onSound: name => sfx(name)
 *   });
 *   // every 60 Hz step while the map is on screen:  map.update({left, right, up, down, confirm});   map.draw(ctx);
 *   // when the level ends:  map.complete(id, 'normal' | 'secret' | 'both')  or  map.fail(id);   then show the map again
 *
 * Owns: the graph (which paths are open), walking node to node along paths, the reveal animation (dots one by one,
 * camera follows), secret exits, node colours, faint locked paths, the info panel, save/shop prompts, the camera
 * (the map scrolls when it is bigger than the view), the iris into and out of levels, a built-in terrain and hero
 * sprite, and an autopilot. The host owns its levels, its save storage and its sounds. See module/README.md.
 * Draws through GameDNA_Skin when skins/skin-api.js is loaded (windows, text); otherwise a built-in copy of pixel16.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.1';
  var DEFAULTS = { walk: 1.25, reveal: 4, spacing: 6, terrain: 'coast', locked: 'faint', panel: 'auto', iris: 'on', camera: 'smooth', seed: 7 };
  var KINDS = { level: 'level', stage: 'level', lvl: 'level', normal: 'level', secret: 'secret', sec: 'secret', castle: 'castle', boss: 'castle',
    fort: 'castle', fortress: 'castle', tower: 'castle', keep: 'castle', hut: 'hut', save: 'hut', house: 'hut', inn: 'hut', shop: 'shop', store: 'shop',
    bonus: 'bonus', star: 'bonus', start: 'start', home: 'start', gate: 'start', entrance: 'start' };
  var ENTER = { level: 1, secret: 1, castle: 1, bonus: 1 };
  var KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
    KeyZ: 'confirm', Enter: 'confirm', Space: 'confirm', KeyX: 'back', Escape: 'back' };
  var DIRV = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  var IRIS_F = 24, HOLD_PAUSE = 8;

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
    '.': '00000,00000,00000,00000,00000,01100,01100', '?': '01110,10001,00001,00010,00100,00000,00100'
  };
  var WTH = { a: ['#3a64d8', '#2c50b8', '#223e96', '#1a2e74', '#a8c8ff', '#0a1238'], b: ['#d85a48', '#b8402e', '#922c26', '#6a1c1e', '#ffc8b8', '#2a0608'],
    n: ['#4c5a8a', '#3e4a76', '#323c62', '#262e4e', '#c8d4f4', '#0a0e22'] };
  var FBT = { main: '#ffffff', main2: '#c8d4ff', title: '#fff4c8', title2: '#e8c870', label: '#b8d0ff', label2: '#8ca8e8', dim: '#8088a8', dim2: '#626a88',
    accent: '#ffe070', good: '#a8f070', good2: '#58c040', bad: '#ff9080', bad2: '#e84838', shadow: '#0a0c24' };
  function fbW(s) { s = String(s).toUpperCase(); var w = 0; for (var i = 0; i < s.length; i++) w += s[i] === ' ' ? 4 : 6; return Math.max(0, w - 1); }
  function fbText(g, s, x, y, c1, c2) {
    for (var pass = 0; pass < 2; pass++) {
      var cx = x, str = String(s).toUpperCase();
      for (var i = 0; i < str.length; i++) {
        var ch = str[i]; if (ch === ' ') { cx += 4; continue; }
        var rows = (GLYPH[ch] || GLYPH['?']).split(',');
        for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < 5; rx++) if (rows[ry][rx] === '1') {
          g.fillStyle = pass ? (ry < 4 ? c1 : c2) : FBT.shadow; g.fillRect(cx + rx + (pass ? 0 : 1), y + ry + (pass ? 0 : 1), 1, 1);
        }
        cx += 6;
      }
    }
  }
  function fbFrame(g, x, y, w, h, th) {
    var C = WTH[th] || WTH.n, i;
    g.globalAlpha = 0.95;
    for (i = 0; i < h - 2; i++) { g.fillStyle = C[Math.min(3, Math.floor(i / (h - 2) * 4))]; g.fillRect(x + 1, y + 1 + i, w - 2, 1); }
    g.globalAlpha = 1; g.fillStyle = '#06061a';
    g.fillRect(x + 2, y, w - 4, 1); g.fillRect(x + 2, y + h - 1, w - 4, 1); g.fillRect(x, y + 2, 1, h - 4); g.fillRect(x + w - 1, y + 2, 1, h - 4);
    g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + w - 2, y + 1, 1, 1); g.fillRect(x + 1, y + h - 2, 1, 1); g.fillRect(x + w - 2, y + h - 2, 1, 1);
    g.fillStyle = C[4]; g.fillRect(x + 2, y + 1, w - 4, 1); g.fillRect(x + 1, y + 2, 1, h - 5);
    g.fillStyle = C[5]; g.fillRect(x + 2, y + h - 2, w - 4, 1); g.fillRect(x + w - 2, y + 2, 1, h - 4);
    [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]].forEach(function (p) { g.fillStyle = '#7a5410'; g.fillRect(p[0], p[1], 2, 2); g.fillStyle = '#ffe070'; g.fillRect(p[0], p[1], 1, 1); });
  }

  /* ---------- look adapter: skin, or the built-in copy of pixel16 ---------- */
  function adapter(SK) {
    var P = SK ? SK.palette || {} : null, T = P ? P.text || {} : {}, F = SK && SK.fonts ? SK.fonts.ui || {} : null;
    function pick() { for (var i = 0; i < arguments.length; i++) if (arguments[i]) return arguments[i]; return '#ffffff'; }
    var C = {
      main: pick(T.main, FBT.main), main2: pick(T.main2, T.main, FBT.main2), title: pick(T.title, T.accent, FBT.title), title2: pick(T.title2, T.title, FBT.title2),
      label: pick(T.label, T.dim, FBT.label), label2: pick(T.label2, T.label, FBT.label2), dim: pick(T.dim, FBT.dim), dim2: pick(T.dim2, T.dim, FBT.dim2),
      accent: pick(T.accent, FBT.accent), good: pick(P && P.fx && P.fx.heal, FBT.good), bad: pick(P && P.fx && P.fx.hot, FBT.bad),
      well: pick(P && P.ui && P.ui.well, 'rgba(6,8,30,0.4)'), ink: pick(P && P.ink, '#06061a')
    };
    var fontH = SK ? (F && (F.height || F.size)) || 7 : 7;
    return {
      C: C, fontH: fontH,
      measure: function (s) { if (!SK) return fbW(s); try { return SK.measure(String(s), { font: 'ui' }); } catch (e) { return fbW(s); } },
      text: function (g, s, x, y, c1, c2) {
        if (!SK) return fbText(g, s, x, y, c1, c2 || c1);
        try { SK.text(g, String(s), x, y, { font: 'ui', color: c1, color2: c2 || c1 }); } catch (e) { fbText(g, s, x, y, c1, c2 || c1); }
      },
      plain: function (g, s, x, y, col) {   // no drop shadow (key caps)
        if (SK) { try { SK.text(g, String(s), x, y, { font: 'ui', color: col, color2: col, shadow: false, outline: false }); return; } catch (e) { /* fall through */ } }
        var cx = x, str = String(s).toUpperCase(); g.fillStyle = col;
        for (var i = 0; i < str.length; i++) { var rows = (GLYPH[str[i]] || GLYPH['?']).split(','); for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < 5; rx++) if (rows[ry][rx] === '1') g.fillRect(cx + rx, y + ry, 1, 1); cx += 6; }
      },
      frame: function (g, r, team) {
        if (SK) { try { SK.frame(g, r, { role: 'window', team: team || 'n' }); return; } catch (e) { /* fall through */ } }
        fbFrame(g, r.x, r.y, r.w, r.h, team || 'n');
      },
      plate: function (g, r, alert) {
        if (SK) { try { SK.frame(g, r, { role: 'plate', alert: !!alert }); return; } catch (e) { /* fall through */ } }
        g.fillStyle = '#0a0c24'; g.fillRect(r.x, r.y, r.w, r.h);
        g.fillStyle = alert ? '#3a2a6a' : '#1c2458'; g.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        g.fillStyle = alert ? '#8a72d8' : '#5a6ac0'; g.fillRect(r.x + 1, r.y + 1, r.w - 2, 1);
      }
    };
  }

  /* ---------- small helpers ---------- */
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  function hsh(x, y, k) { var v = Math.imul((x | 0) * 374761393 + (y | 0) * 668265263 + (k | 0) * 2246822519, 1274126177); return ((v ^ (v >>> 13)) >>> 0) / 4294967296; }
  function vnoise(x, y, k) {
    var ix = Math.floor(x), iy = Math.floor(y), u = x - ix, w = y - iy, s = function (t) { return t * t * (3 - 2 * t); };
    var a = hsh(ix, iy, k), b = hsh(ix + 1, iy, k), c = hsh(ix, iy + 1, k), d = hsh(ix + 1, iy + 1, k);
    return a + (b - a) * s(u) + (c - a) * s(w) + (a - b - c + d) * s(u) * s(w);
  }
  function hexRgb(c) { var n = parseInt(String(c).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function pt(p) { if (!p) return null; if (Array.isArray(p)) return [num(p[0], 0), num(p[1], 0)]; return [num(p.x, 0), num(p.y, 0)]; }
  function polyLen(P) { var s = 0; for (var i = 1; i < P.length; i++) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return s; }
  function polyAt(P, s) {   // -> [x, y, dx, dy] at arc length s
    for (var k = 0; k < P.length - 1; k++) {
      var x0 = P[k][0], y0 = P[k][1], x1 = P[k + 1][0], y1 = P[k + 1][1], L = Math.hypot(x1 - x0, y1 - y0);
      if (s <= L && L > 0) return [x0 + (x1 - x0) * s / L, y0 + (y1 - y0) * s / L, x1 - x0, y1 - y0];
      s -= L;
    }
    var n = P[P.length - 1], p = P[P.length - 2] || n; return [n[0], n[1], n[0] - p[0], n[1] - p[1]];
  }
  // sprite: paint(R) with R(x, y, w, h, colour) on a padded canvas, then a 1 px outline around every painted pixel
  function sprite(w, h, paint, outline) {
    var c = mk(w + 2, h + 2), g = c.getContext('2d');
    paint(function (x, y, ww, hh, col) { g.fillStyle = col; g.fillRect(x + 1, y + 1, ww, hh); }, g);
    if (outline) {
      var d = g.getImageData(0, 0, w + 2, h + 2), a = d.data, m = new Uint8Array((w + 2) * (h + 2)), i, x, y;
      for (i = 0; i < m.length; i++) m[i] = a[i * 4 + 3] > 0 ? 1 : 0;
      var o = hexRgb(outline);
      for (y = 0; y < h + 2; y++) for (x = 0; x < w + 2; x++) {
        i = y * (w + 2) + x; if (m[i]) continue;
        if ((x > 0 && m[i - 1]) || (x < w + 1 && m[i + 1]) || (y > 0 && m[i - w - 2]) || (y < h + 1 && m[i + w + 2])) { a[i * 4] = o[0]; a[i * 4 + 1] = o[1]; a[i * 4 + 2] = o[2]; a[i * 4 + 3] = 255; }
      }
      g.putImageData(d, 0, 0);
    }
    return c;
  }
  function flipped(src) { var c = mk(src.width, src.height), g = c.getContext('2d'); g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0); return c; }

  /* ---------- built-in art: hero, node buildings, item icons ---------- */
  var INK = '#1c1424';
  var HERO_C = { hood: '#3a8a5a', hoodL: '#6cc07a', hoodD: '#235c3c', skin: '#f4c49a', skinD: '#c88a62', eye: '#1c1424', scarf: '#e04a3a', scarfD: '#9a2a2a',
    tun: '#3a64c8', tunL: '#6a94e8', tunD: '#26408a', pants: '#5a4030', boot: '#3a2418', pack: '#a8743c', packD: '#6e4a24' };
  function heroPaint(dir, f) {   // 12x17 at feet (6, 16); f = 0 stand, 1 / 2 walk
    var C = HERO_C;
    return function (R) {
      var la = f === 1 ? -1 : 0, lb = f === 2 ? -1 : 0;
      // legs and boots
      R(3, 12 + la, 2, 3, C.pants); R(7, 12 + lb, 2, 3, C.pants); R(3, 15 + la, 2, 1, C.boot); R(7, 15 + lb, 2, 1, C.boot);
      if (dir === 'side') { R(3, 12 + la, 2, 3, C.pants); R(2, 15 + la, 3, 1, C.boot); R(7, 12 + lb, 2, 3, C.pants); R(7, 15 + lb, 3, 1, C.boot); }
      // body
      R(2, 7, 8, 6, C.tun); R(2, 7, 8, 1, C.tunL); R(8, 8, 2, 5, C.tunD); R(2, 11, 8, 1, C.pack);
      if (dir === 'up') { R(3, 7, 6, 5, C.pack); R(3, 7, 6, 1, '#c8945a'); R(7, 8, 2, 4, C.packD); }
      // arms swing
      var aa = f === 1 ? 1 : f === 2 ? -1 : 0;
      if (dir !== 'side') { R(1, 8 + aa, 1, 4, C.tun); R(1, 11 + aa, 1, 1, C.skin); R(10, 8 - aa, 1, 4, C.tunD); R(10, 11 - aa, 1, 1, C.skinD); }
      else { R(5 + aa, 8, 2, 4, C.tunD); R(5 + aa, 11, 2, 1, C.skin); }
      // scarf
      R(2, 6, 8, 2, C.scarf); R(2, 7, 8, 1, C.scarfD);
      if (dir === 'side') { R(0, 6 + (f ? 1 : 0), 2, 2, C.scarf); }
      if (dir === 'down') R(7, 8, 2, 3, C.scarf);
      // head + hood
      R(2, 0, 8, 7, C.hood); R(3, 0, 5, 1, C.hoodL); R(2, 1, 1, 4, C.hoodL); R(9, 1, 1, 5, C.hoodD);
      if (dir === 'down') { R(3, 2, 6, 4, C.skin); R(3, 5, 6, 1, C.skinD); R(4, 3, 1, 2, C.eye); R(7, 3, 1, 2, C.eye); R(3, 2, 6, 1, C.hoodD); }
      else if (dir === 'side') { R(5, 2, 5, 4, C.skin); R(5, 5, 5, 1, C.skinD); R(8, 3, 1, 2, C.eye); R(5, 2, 5, 1, C.hoodD); R(2, 2, 3, 4, C.hoodD); }
      else { R(3, 1, 6, 5, C.hoodD); R(4, 2, 4, 3, C.hood); }
    };
  }
  var NODE_C = {
    level: ['#fff4a0', '#f8d040', '#c89018', '#7a5410'], secret: ['#ffc8b0', '#f0584a', '#b8302a', '#6a1418'],
    clear: ['#c8f4ff', '#58b8f0', '#2a78c0', '#163c6e'], bonus: ['#ffe8ff', '#f088d8', '#b04898', '#5a1c50'], locked: ['#c8c8c8', '#9a9aa0', '#6a6a74', '#3a3a44'],
    start: ['#f0e8d8', '#c8b898', '#8a7858', '#4a3c2c']
  };
  function discSprite(C) {   // 15x10 flat disc with a 2 px rim below
    return sprite(15, 10, function (R) {
      var rx = 7, ry = 3.6;
      for (var dy = -4; dy <= 4; dy++) {
        var hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - Math.pow(dy / (ry + 0.6), 2))));
        if (hw <= 0) continue;
        R(7 - hw, 4 + dy + 2, hw * 2 + 1, 1, C[3]);   // rim (shifted down 2)
      }
      for (dy = -4; dy <= 4; dy++) {
        hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - Math.pow(dy / (ry + 0.6), 2))));
        if (hw <= 0) continue;
        R(7 - hw, 4 + dy, hw * 2 + 1, 1, dy < -1 ? C[0] : dy < 2 ? C[1] : C[2]);
      }
      R(4, 2, 3, 1, '#ffffff');
    }, INK);
  }
  function castleSprite(cleared) {   // 30x36: two towers, a wall, a central keep with a roof, a gate; gate bottom-centre at (15, 35)
    return sprite(30, 36, function (R) {
      var S = '#a8a0b4', SL = '#d8d0e0', SD = '#6e6880', SDD = '#463e56', RF = cleared ? '#4a84d8' : '#c8443a', RFL = cleared ? '#8ab8f0' : '#f07a5a', RFD = cleared ? '#2a4c8a' : '#7a2420';
      var stones = function (x0, y0, w, h) { for (var y = y0 + 2; y < y0 + h; y += 3) for (var x = x0 + ((y / 3) % 2 ? 1 : 3); x < x0 + w - 1; x += 4) R(x, y, 2, 1, SD); };
      // wall and its battlements
      R(5, 15, 20, 21, S); R(5, 15, 20, 1, SL); stones(5, 15, 20, 21); for (var i = 0; i < 5; i++) R(5 + i * 4, 12, 2, 3, S);
      // central keep with a pointed roof
      R(10, 8, 10, 14, S); R(10, 8, 2, 14, SL); R(18, 8, 2, 14, SD); stones(10, 8, 10, 14);
      for (i = 0; i < 6; i++) { R(10 + i, 7 - i, 10 - 2 * i, 1, i < 2 ? RFD : RF); R(10 + i, 7 - i, 1, 1, RFL); }
      R(14, 0, 2, 2, RF); R(13, 11, 4, 4, SDD); R(14, 12, 2, 2, '#ffd860');
      // towers
      [0, 21].forEach(function (tx, k) {
        R(tx, 6, 9, 30, S); R(tx, 6, 2, 30, SL); R(tx + 7, 6, 2, 30, SD); stones(tx, 6, 9, 30);
        for (var m = 0; m < 3; m++) R(tx + m * 3, 3, 2, 3, k ? SD : S);
        R(tx + 3, 12, 3, 4, SDD); R(tx + 4, 13, 1, 2, '#ffd860'); R(tx + 3, 22, 3, 4, SDD);
        R(tx, 33, 9, 3, SD);
      });
      // gate (arch, portcullis)
      R(11, 25, 8, 11, SDD); R(12, 24, 6, 1, SDD); R(12, 25, 6, 11, '#2a1e18'); for (var x = 13; x < 18; x += 2) R(x, 25, 1, 11, '#5a4a40'); R(12, 29, 6, 1, '#5a4a40');
      R(10, 23, 10, 1, SL);
    }, INK);
  }
  function hutSprite() {   // 16x14
    return sprite(16, 14, function (R) {
      R(2, 6, 12, 8, '#e8d8b0'); R(2, 6, 12, 1, '#fff0d0'); R(11, 7, 3, 7, '#b8a07a');
      for (var i = 0; i < 6; i++) R(1 + i, 6 - i, 14 - 2 * i, 1, i % 2 ? '#c0503a' : '#d8684a');
      R(0, 6, 16, 1, '#8a3424');
      R(11, 0, 3, 4, '#7a6e6a'); R(11, 0, 3, 1, '#a89c98');
      R(6, 9, 4, 5, '#6a4024'); R(6, 9, 4, 1, '#8a5830'); R(9, 11, 1, 1, '#ffd060');
      R(3, 8, 2, 2, '#ffe890'); R(12, 8, 1, 2, '#ffe890');
    }, INK);
  }
  function shopSprite() {   // 16x14 tent stall
    return sprite(16, 14, function (R) {
      R(2, 6, 12, 8, '#9a6a3a'); R(2, 6, 12, 1, '#c08a50'); R(3, 9, 10, 3, '#6a4424');
      for (var i = 0; i < 8; i++) R(i * 2, 2, 2, 4, i % 2 ? '#f4f0e8' : '#3a9a8a');
      R(0, 1, 16, 1, '#2a6a5e'); R(0, 6, 16, 1, '#2a6a5e');
      R(4, 10, 2, 2, '#f0c040'); R(7, 10, 2, 2, '#e85a4a'); R(10, 10, 2, 2, '#68c0f0');
      R(1, 7, 1, 7, '#5a3a20'); R(14, 7, 1, 7, '#5a3a20');
    }, INK);
  }
  function signSprite() {   // 12x14 signpost
    return sprite(12, 14, function (R) {
      R(5, 3, 2, 11, '#8a5a30'); R(5, 3, 1, 11, '#b07840');
      R(0, 2, 10, 4, '#d8b070'); R(0, 2, 10, 1, '#f0d090'); R(10, 3, 1, 2, '#d8b070'); R(1, 4, 8, 1, '#8a6a3a');
      R(2, 7, 9, 3, '#c8a060'); R(2, 7, 9, 1, '#e8c080'); R(1, 8, 1, 1, '#c8a060');
    }, INK);
  }
  function starIcon() {
    return sprite(9, 9, function (R) {
      var rows = ['....#....', '...###...', '#########', '.#######.', '..#####..', '..##.##..', '.##...##.'];
      rows.forEach(function (r, y) { for (var x = 0; x < 9; x++) if (r[x] === '#') R(x, y + 1, 1, 1, y < 3 ? '#fff8c0' : '#ffd040'); });
    }, INK);
  }
  var ICONS = {   // 7x7 item icons for the panel
    coin: ['..###..', '.#yyy#.', '#yyYyy#', '#yyYyy#', '#yyYyy#', '.#yyy#.', '..###..'],
    gem: ['.#####.', '#ccCcc#', '#cCCCc#', '.#cCc#.', '..#c#..', '...#...', '.......'],
    key: ['.###...', '#y.y#..', '#y.y#..', '.###...', '..#y#..', '..#yy#.', '..#y#..'],
    star: ['...#...', '..#y#..', '##yyy##', '.#yyy#.', '.#y#y#.', '#.#.#.#', '.......'],
    heart: ['.##.##.', '#rr#rr#', '#rrrrr#', '.#rrr#.', '..#r#..', '...#...', '.......'],
    flag: ['#yyy...', '#yyyy..', '#yyy...', '#......', '#......', '#......', '#......'],
    save: ['#######', '#w###w#', '#wwwww#', '#######', '#bbbbb#', '#bbbbb#', '#######']
  };
  var ICON_C = { '#': '#1c1424', y: '#ffd040', Y: '#fff4a0', c: '#58c8f0', C: '#d0f4ff', r: '#f04a4a', w: '#e8e8f0', b: '#5a6ac0' };

  /* ---------- terrain themes ---------- */
  var THEMES = {
    coast: { deep: '#1c4282', deep2: '#1a3c78', mid: '#2a5ea6', shallow: '#3c84c4', foam: '#d8f0ff', sand: '#e8d498', sand2: '#d0b878',
      grass: '#5aa844', grass2: '#4e9a3c', grassL: '#7cc458', grassD: '#3c8034', speck: '#2e6a2c', flowers: ['#fff4f0', '#ffe060', '#f8a0c0'],
      cliff: ['#d8c8a8', '#b8a080', '#94785c', '#6a5440', '#4a3a2c'], tree: ['#2e7a3c', '#4aa050', '#1c5228', '#6a4424'], pine: ['#1e6a48', '#3a8c5c', '#124030'],
      rock: ['#b0a8a0', '#d8d0c8', '#7a7068'], sparkle: '#d8f0ff', none: '#203a28' },
    dusk: { deep: '#2a2458', deep2: '#262050', mid: '#3c3478', shallow: '#5a4a94', foam: '#ffd8c0', sand: '#e8c098', sand2: '#c89c78',
      grass: '#5a8a4c', grass2: '#4e7c44', grassL: '#7aa45c', grassD: '#3c6a3c', speck: '#2e5034', flowers: ['#fff0e0', '#ffc860', '#ff90a0'],
      cliff: ['#d0a890', '#b08878', '#8a6a64', '#644a4c', '#463440'], tree: ['#2e6a44', '#4a8a50', '#1c4430', '#5a3a30'], pine: ['#24584a', '#3a7a5c', '#163a34'],
      rock: ['#a898a0', '#d0c0c0', '#706070'], sparkle: '#ffe0c8', none: '#2a2438' }
  };

  /* ================================================================== the map ================================================================== */
  function create(options) {
    var o = options || {};
    var SKIN = root.GameDNA_Skin, SK = null;
    try { SK = SKIN && SKIN.resolve ? SKIN.resolve(o.skin) : null; } catch (e) { SK = null; }
    var L = adapter(SK);
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    var warned = {};
    function warn(key, msg) { if (warned[key]) return; warned[key] = 1; if (root.console) console.warn('GameDNA_LevelMap: ' + msg); }
    function call(name) {   // host callbacks never throw into the module
      var f = o[name]; if (typeof f !== 'function') return undefined;
      try { return f.apply(null, [].slice.call(arguments, 1)); } catch (e) { warn('cb-' + name, name + ' threw: ' + (e && e.message)); return undefined; }
    }
    function setParams(p) {
      for (var key in p || {}) if (Object.prototype.hasOwnProperty.call(DEFAULTS, key) && p[key] != null) P[key] = typeof DEFAULTS[key] === 'number' ? num(p[key], DEFAULTS[key]) : String(p[key]);
      P.walk = Math.max(0.25, Math.min(4, P.walk)); P.reveal = Math.max(1, Math.min(30, Math.round(P.reveal))); P.spacing = Math.max(3, Math.min(14, Math.round(P.spacing)));
      if (!THEMES[P.terrain] && P.terrain !== 'none') P.terrain = 'coast';
    }
    setParams(o.params);

    /* ----- graph ----- */
    var N = {}, order = [], E = [], EI = {};
    (function readGraph() {
      var raw = o.nodes || (o.graph && o.graph.nodes) || [];
      var list = Array.isArray(raw) ? raw : Object.keys(raw).map(function (id) { var n = raw[id] || {}; return Object.assign({ id: id }, n); });
      list.forEach(function (n, i) {
        if (!n) return;
        var id = n.id != null ? String(n.id) : 'n' + i, p = pt(n.pos || n.at || (n.x != null ? n : null)) || [0, 0];
        var kind = KINDS[String(n.kind || n.type || 'level').toLowerCase()] || 'level';
        if (N[id]) { warn('dup-' + id, 'duplicate node id ' + id); return; }
        N[id] = { id: id, x: Math.round(p[0]), y: Math.round(p[1]), kind: kind, name: String(n.name || n.label || n.title || id), raw: n };
        order.push(id);
      });
      var rawE = o.edges || o.paths || (o.graph && (o.graph.edges || o.graph.paths)) || [];
      rawE.forEach(function (e, i) {
        if (!e) return;
        var a = String(e.a != null ? e.a : e.from), b = String(e.b != null ? e.b : e.to);
        if (!N[a] || !N[b]) { warn('edge-' + i, 'edge ' + (e.id || i) + ' names a missing node (' + a + ' -> ' + b + ')'); return; }
        var via = (e.via || e.points || e.path || []).map(pt).filter(Boolean);
        var poly = [[N[a].x, N[a].y]].concat(via, [[N[b].x, N[b].y]]);
        var secret = e.secret === true || String(e.exit || '').toLowerCase() === 'secret';
        var ed = { id: e.id != null ? String(e.id) : a + '>' + b, a: a, b: b, poly: poly, len: polyLen(poly), secret: secret, startOpen: e.open === true, dots: [] };
        if (EI[ed.id]) ed.id += '#' + i;
        EI[ed.id] = ed; E.push(ed);
      });
      E.forEach(function (ed) {   // stepping stones every `spacing` px, clear of both node discs
        var s = 9, out = [];
        while (s < ed.len - 8) { var q = polyAt(ed.poly, s); out.push([Math.round(q[0]), Math.round(q[1])]); s += P.spacing; }
        ed.dots = out;
      });
    })();
    if (!order.length) { warn('empty', 'no nodes given'); N.start = { id: 'start', x: 16, y: 16, kind: 'start', name: 'START', raw: {} }; order.push('start'); }
    var startId = o.start != null && N[String(o.start)] ? String(o.start) : (order.filter(function (id) { return N[id].kind === 'start'; })[0] || order[0]);

    /* ----- world size and view ----- */
    var world = (function () {
      var mx = 0, my = 0;
      order.forEach(function (id) { mx = Math.max(mx, N[id].x); my = Math.max(my, N[id].y); });
      E.forEach(function (e) { e.poly.forEach(function (p) { mx = Math.max(mx, p[0]); my = Math.max(my, p[1]); }); });
      var w = o.world ? num(o.world.w, 0) : 0, h = o.world ? num(o.world.h, 0) : 0;
      return { w: Math.max(w, mx + 28), h: Math.max(h, my + 28 + (o.params && o.params.panel === 'off' ? 0 : 30)) };   // room under the last row for the panel
    })();
    var lastCanvas = null;
    function viewOf() {
      var v = null;
      if (o.view) { try { v = typeof o.view === 'function' ? o.view() : o.view; } catch (e) { v = null; } }
      var cw = lastCanvas ? lastCanvas.width : 256, ch = lastCanvas ? lastCanvas.height : 224;
      if (!v) return { x: 0, y: 0, w: cw, h: ch };
      return { x: num(v.x != null ? v.x : v.ox, 0), y: num(v.y != null ? v.y : v.oy, 0), w: num(v.w, cw), h: num(v.h, ch) };
    }

    /* ----- progress state ----- */
    var cleared = {}, open = {}, at = startId, saves = 0;
    function exitsOf(v) {   // 'normal' | 'secret' | 'both' | true | array -> {normal, secret}
      if (Array.isArray(v)) return { normal: v.indexOf('normal') >= 0 || v.indexOf('secret') < 0, secret: v.indexOf('secret') >= 0 };
      var s = String(v === true || v == null ? 'normal' : v).toLowerCase();
      return { normal: s !== 'secret', secret: s === 'secret' || s === 'both' };
    }
    function mergeClear(id, ex) { var c = cleared[id] || { normal: false, secret: false }; cleared[id] = { normal: c.normal || ex.normal, secret: c.secret || ex.secret }; }
    function passive(id) { return !ENTER[N[id].kind]; }
    // the edges a node's clear (or, for start / hut / shop, reaching it) opens
    function exitEdges(id, ex) { return E.filter(function (e) { return e.a === id && (e.secret ? ex.secret : ex.normal); }); }
    function openCascade(id, out) {   // reaching a passive node opens its normal exits too
      if (!passive(id)) return;
      exitEdges(id, { normal: true, secret: false }).forEach(function (e) { if (!open[e.id] && out.indexOf(e) < 0) { out.push(e); } });
    }
    function rebuildOpen() {
      open = {};
      E.forEach(function (e) { if (e.startOpen) open[e.id] = true; });
      var changed = true, guard = 0;
      while (changed && guard++ < 999) {
        changed = false;
        E.forEach(function (e) {
          if (open[e.id]) return;
          var a = e.a, ok = false;
          if (passive(a)) ok = a === startId || reached(a);
          else if (cleared[a]) ok = e.secret ? cleared[a].secret : cleared[a].normal;
          if (ok) { open[e.id] = true; changed = true; }
        });
      }
    }
    function reached(id) { if (id === startId) return true; for (var i = 0; i < E.length; i++) if (open[E[i].id] && (E[i].a === id || E[i].b === id)) return true; return false; }
    function loadState(s) {
      cleared = {};
      var c = s && s.cleared != null ? s.cleared : s;
      if (Array.isArray(c)) c.forEach(function (id) { if (N[String(id)]) mergeClear(String(id), { normal: true, secret: false }); });
      else if (c && typeof c === 'object') Object.keys(c).forEach(function (id) {
        var v = c[id]; if (!N[id] || !v) return;
        if (typeof v === 'object' && !Array.isArray(v)) mergeClear(id, { normal: !!v.normal, secret: !!v.secret }); else mergeClear(id, exitsOf(v));
      });
      if (s && Array.isArray(s.secrets)) s.secrets.forEach(function (id) { if (N[String(id)]) mergeClear(String(id), { normal: false, secret: true }); });
      rebuildOpen();
      if (s && Array.isArray(s.open)) s.open.forEach(function (id) { if (EI[id]) open[id] = true; });
      var a = s && s.at != null ? String(s.at) : null;
      at = a && N[a] && reached(a) ? a : startId;
      saves = s && s.saves ? num(s.saves, 0) : 0;
    }
    function getState() {
      var c = {}; Object.keys(cleared).forEach(function (id) { var v = cleared[id]; if (v.normal || v.secret) c[id] = v.normal && v.secret ? 'both' : v.secret ? 'secret' : 'normal'; });
      return { at: at, cleared: c, open: Object.keys(open).filter(function (id) { return open[id]; }), saves: saves };
    }
    loadState(o.state || (o.cleared != null ? { cleared: typeof o.cleared === 'function' ? null : o.cleared } : null));
    if (typeof o.cleared === 'function') { order.forEach(function (id) { var v = null; try { v = o.cleared(id); } catch (e) { v = null; } if (v) mergeClear(id, exitsOf(v)); }); rebuildOpen(); }
    if (o.at != null && N[String(o.at)] && reached(String(o.at))) at = String(o.at);

    function isCleared(id) { var c = cleared[id]; return !!(c && (c.normal || c.secret)); }
    function done(id) {   // node colour: finished = every exit it has was taken
      var c = cleared[id]; if (!c) return false;
      return hasSecretExit(id) ? c.normal && c.secret : c.normal || c.secret;
    }
    function hasSecretExit(id) { return N[id].kind === 'secret' || E.some(function (e) { return e.a === id && e.secret; }); }
    function visibleOpen(id) { return reached(id) || (reveal && reveal.edge.b === id && reveal.done); }
    function faintEdge(e) { return !open[e.id] && !e.secret && P.locked === 'faint' && visibleOpen(e.a) && !(reveal && reveal.edge === e); }
    function nodeVis(id) {   // 2 = shown, 1 = faint (locked), 0 = hidden
      if (reached(id)) return 2;
      if (pops[id] != null) return 2;
      for (var i = 0; i < E.length; i++) { var e = E[i]; if (e.b === id && (faintEdge(e) || (reveal && reveal.edge === e && !e.secret && P.locked === 'faint'))) return 1; }
      return 0;
    }

    /* ----- runtime state ----- */
    var mode = 'idle', t = 0, walker = null, route = [], reveal = null, revealQ = [], pops = {}, toasts = [], parts = [];
    var held = {}, latch = {}, prevIn = {}, holdT = 0, bump = 0, iris = null, awayDraws = 0, hoverId = null, hoverT = 0;
    var autoOn = false, autoWait = 0, autoTries = {}, allClearSent = false, savedHere = false, savedIds = {}, visits = {};
    var hero = { x: N[at].x, y: N[at].y, dir: 'down', flip: false, f: 0, walkT: 0 };
    var cam = { x: 0, y: 0, ready: false }, uiRects = [], enabledFn = function () { return o.enabled ? !!call('enabled') : true; };
    var art = null, terrain = null;
    if (o.auto != null && typeof o.auto !== 'function') autoOn = !!o.auto;
    function autoActive() { if (typeof o.auto === 'function') { var v = call('auto'); return !!v; } return autoOn; }

    function sound(name, info) { call('onSound', name, info || {}); }
    function emit(type, data) { var ev = Object.assign({ type: type }, data || {}); call('onEvent', ev); log.push([t, type, data && (data.id || data.edge) || '']); if (log.length > 400) log.shift(); }
    var log = [];
    function toast(text, kind) { toasts = toasts.filter(function (q) { return q.text !== text; }); toasts.push({ text: String(text).toUpperCase(), kind: kind || 'n', birth: t }); if (toasts.length > 2) toasts.shift(); }
    function puff(x, y, n, col) { for (var i = 0; i < n; i++) parts.push({ x: x, y: y, vx: (hsh(t, i, 3) - 0.5) * 0.8, vy: -0.3 - hsh(i, t, 5) * 0.5, life: 18 + ((hsh(t, i, 9) * 10) | 0), age: 0, col: col || '#f4ecd8' }); if (parts.length > 120) parts.splice(0, parts.length - 120); }

    /* ----- moving along paths ----- */
    function edgesAt(id) { return E.filter(function (e) { return open[e.id] && (e.a === id || e.b === id); }); }
    function oriented(e, from) { return e.a === from ? e.poly : e.poly.slice().reverse(); }
    function headingOf(poly) { var q = polyAt(poly, Math.min(12, polyLen(poly) * 0.5)); var dx = q[0] - poly[0][0], dy = q[1] - poly[0][1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
    function pickEdge(id, dx, dy, list) {
      var best = null, bd = 0.42;
      (list || edgesAt(id)).forEach(function (e) {
        var h = headingOf(oriented(e, id)), d = h[0] * dx + h[1] * dy;
        if (d > bd) { bd = d; best = e; }
      });
      return best;
    }
    function startWalk(e, from) {
      var poly = oriented(e, from);
      walker = { e: e, poly: poly, s: 0, len: polyLen(poly), to: e.a === from ? e.b : e.a, from: from };
      mode = 'walk'; savedHere = false; hoverId = null;
      emit('leave', { id: from, to: walker.to, edge: e.id });
    }
    function routeTo(target) {   // BFS over open edges -> [edge, ...] from `at`
      if (target === at) return [];
      var prev = {}, q = [at], seen = {}; seen[at] = 1;
      while (q.length) {
        var id = q.shift();
        var list = edgesAt(id);
        for (var i = 0; i < list.length; i++) {
          var e = list[i], nx = e.a === id ? e.b : e.a; if (seen[nx]) continue;
          seen[nx] = 1; prev[nx] = { id: id, e: e }; if (nx === target) { var out = [], c = nx; while (c !== at) { out.unshift(prev[c].e); c = prev[c].id; } return out; }
          // do not route THROUGH a level that is not cleared (its far side is not open anyway)
          q.push(nx);
        }
      }
      return null;
    }
    function arrive() {
      var w = walker; walker = null; at = w.to; hero.x = N[at].x; hero.y = N[at].y; hero.f = 0;
      visits[at] = (visits[at] || 0) + 1;
      sound('arrive', { id: at }); emit('arrive', { id: at, from: w.from, edge: w.e.id });
      if (route.length) { var e = route.shift(); mode = 'pause'; pauseT = 6; nextEdge = e; return; }
      mode = 'idle'; holdT = HOLD_PAUSE; hero.dir = 'down';
    }
    var pauseT = 0, nextEdge = null;

    /* ----- confirming on a node ----- */
    function act() {
      var n = N[at];
      if (ENTER[n.kind]) {
        mode = P.iris === 'on' ? 'iris-out' : 'away';
        sound('enter', { id: at }); emit('enter', { id: at });
        if (mode === 'iris-out') iris = { k: 0, dir: -1 };
        else { awayDraws = 0; call('enterLevel', at, nodeInfo(at)); }
        return true;
      }
      if (n.kind === 'hut') {
        if (savedHere) { toast(label('saved', 'SAVED')); sound('deny', { id: at }); return true; }
        savedHere = true; savedIds[at] = true; saves++;
        var st = getState(); st.saves = saves;
        call('onSave', st, at); sound('save', { id: at }); emit('save', { id: at }); toast(label('saved', 'SAVED'), 'a');
        return true;
      }
      if (n.kind === 'shop') {
        if (typeof o.onShop === 'function') { call('onShop', at, getState()); sound('shop', { id: at }); emit('shop', { id: at }); }
        else { toast(label('closed', 'CLOSED')); sound('deny', { id: at }); }
        return true;
      }
      sound('deny', { id: at }); bump = 8; return false;
    }
    function label(key, d) { var L2 = o.labels || {}; return L2[key] != null ? String(L2[key]) : d; }

    /* ----- level results ----- */
    function complete(id, exit) {
      id = id == null ? at : String(id);
      if (!N[id]) { warn('complete-' + id, 'complete(' + id + '): unknown node'); show(); return []; }
      var ex = exitsOf(exit), was = cleared[id] ? { normal: cleared[id].normal, secret: cleared[id].secret } : { normal: false, secret: false };
      mergeClear(id, ex);
      var queued = exitEdges(id, ex).filter(function (e) { return !open[e.id] && revealQ.indexOf(e) < 0 && !(reveal && reveal.edge === e); });
      revealQ = revealQ.concat(queued);
      var firstClear = !was.normal && !was.secret;
      emit('clear', { id: id, exit: ex.secret && !ex.normal ? 'secret' : ex.secret ? 'both' : 'normal', first: firstClear, opened: queued.map(function (e) { return e.id; }) });
      if (queued.some(function (e) { return e.secret; })) toast(label('secretPath', 'SECRET PATH'), 'b');
      else if (queued.length) toast(label('pathOpen', 'PATH OPEN'), 'a');
      else toast(label('clear', 'CLEAR'), 'a');
      clearFx[id] = t;
      show();
      return queued.map(function (e) { return e.id; });
    }
    var clearFx = {};
    function show() {
      if (mode === 'away' || mode === 'iris-out') { mode = P.iris === 'on' ? 'iris-in' : 'idle'; iris = P.iris === 'on' ? { k: 0, dir: 1 } : null; }
      awayDraws = 0; cam.ready = false; hero.x = N[at].x; hero.y = N[at].y; walker = null; route = [];
      prevIn.confirm = true; latch = {};   // a confirm still held from the level must be released before it enters again
    }
    function fail(id) { emit('fail', { id: id == null ? at : String(id) }); show(); }

    /* ----- reveal ----- */
    function stepReveal() {
      if (!reveal) {
        if (!revealQ.length) return false;
        var e = revealQ.shift(); if (open[e.id]) return stepReveal();
        reveal = { edge: e, n: 0, k: 0, done: false, hold: 0 };
        emit('reveal', { edge: e.id, id: e.a, to: e.b, secret: e.secret });
      }
      var R = reveal;
      if (R.done) {
        if (--R.hold > 0) return true;
        open[R.edge.id] = true; reveal = null;
        var more = []; openCascade(R.edge.b, more);
        more.forEach(function (x) { if (revealQ.indexOf(x) < 0) revealQ.push(x); });
        return true;
      }
      if (++R.k >= P.reveal) {
        R.k = 0; R.n++;
        var d = R.edge.dots[R.n - 1];
        if (d) { puff(d[0], d[1], 2); sound('dot', { edge: R.edge.id, i: R.n - 1, of: R.edge.dots.length }); }
        if (R.n >= R.edge.dots.length) {
          R.done = true; R.hold = 18;
          pops[R.edge.b] = t;
          sound('open', { edge: R.edge.id, to: R.edge.b }); emit('revealDone', { edge: R.edge.id, to: R.edge.b });
          puff(N[R.edge.b].x, N[R.edge.b].y, 6, '#fff8d0');
        }
      }
      return true;
    }

    /* ----- autopilot ----- */
    function autoTarget() {
      var seen = {}, q = [at], best = null, bestSecret = null, castle = null; seen[at] = 1;
      while (q.length) {
        var id = q.shift(), n = N[id];
        if (ENTER[n.kind] && !isCleared(id)) { if (n.kind === 'castle') { if (!castle) castle = id; } else if (!best) best = id; }
        if (n.kind === 'secret' && isCleared(id) && !cleared[id].secret && !(autoTries[id] >= 1) && !bestSecret) bestSecret = id;
        edgesAt(id).forEach(function (e) { var nx = e.a === id ? e.b : e.a; if (!seen[nx]) { seen[nx] = 1; q.push(nx); } });
      }
      return best || castle || (o.autoSecrets ? bestSecret : null);
    }
    function autoStep() {
      if (mode !== 'idle' || revealQ.length || reveal) { autoWait = 0; return; }
      if (++autoWait < 32) return;
      autoWait = 0;
      var n = N[at];
      if (n.kind === 'hut' && !savedIds[at]) { act(); return; }
      var target = autoTarget();
      if (!target) { if (!allClearSent) { allClearSent = true; emit('allClear', {}); } return; }
      if (target === at) { if (cleared[at]) autoTries[at] = (autoTries[at] || 0) + 1; act(); return; }
      var r = routeTo(target); if (!r || !r.length) return;
      var cur = at;   // stop at the first hut on the way that was never used (the autopilot saves like a person would)
      for (var i = 0; i < r.length; i++) { cur = r[i].a === cur ? r[i].b : r[i].a; if (N[cur].kind === 'hut' && !savedIds[cur]) { r = r.slice(0, i + 1); break; } }
      route = r.slice(1); startWalk(r[0], at);
    }

    /* ----- input ----- */
    function press(name) { if (!held[name]) latch[name] = true; held[name] = true; }
    function release(name) { held[name] = false; }
    function active() { return mode !== 'away' && enabledFn(); }
    function keyEvent(code, down, isRepeat) {
      var name = (o.keys || KEYMAP)[code]; if (!name) return false;
      if (!down) { var was = !!held[name]; release(name); return was && active(); }
      if (!active()) return false;
      if (!isRepeat) press(name); else held[name] = true;
      return true;
    }
    function readInput(inp) {
      if (inp && typeof inp === 'object') {
        ['left', 'right', 'up', 'down'].forEach(function (d) { var v = !!inp[d]; if (v && !prevIn[d]) latch[d] = true; prevIn[d] = v; });
        var cf = !!(inp.confirm || inp.a || inp.ok || inp.enter), bk = !!(inp.back || inp.b || inp.cancel);
        if (cf && !prevIn.confirm) latch.confirm = true; if (bk && !prevIn.back) latch.back = true;
        prevIn.confirm = cf; prevIn.back = bk;
      }
      var h = function (d) { return !!held[d] || !!prevIn[d]; };
      return { held: { left: h('left'), right: h('right'), up: h('up'), down: h('down') }, fresh: latch };
    }
    function dirOf(set) { var dx = (set.right ? 1 : 0) - (set.left ? 1 : 0), dy = (set.down ? 1 : 0) - (set.up ? 1 : 0); return dx || dy ? [dx, dy] : null; }
    function tryDir(d, fresh) {
      var L2 = Math.hypot(d[0], d[1]), dx = d[0] / L2, dy = d[1] / L2, e = pickEdge(at, dx, dy);
      if (e) { startWalk(e, at); sound('step', { id: at }); return true; }
      if (fresh) { bump = 8; sound('deny', { id: at }); emit('deny', { id: at, dir: d }); }
      return false;
    }

    /* ----- per-step update ----- */
    function update(inp) {
      try { step(inp); } catch (e) { warn('update', 'update failed: ' + (e && e.message)); }
      // the camera moves here, one ease step per update, never in draw(): a ?t=&freeze=1 fast-forward (many updates, one draw)
      // then shows exactly the camera of live play at the same step
      try { /*cam-update*/ if (mode !== 'away') stepCam(viewOf()); } catch (e) { warn('update', 'camera failed: ' + (e && e.message)); }
    }
    function step(inp) {
      t++;
      var I = readInput(inp), fresh = I.fresh;
      latch = {};
      // animation clocks
      parts.forEach(function (p) { p.age++; p.x += p.vx; p.y += p.vy; p.vy *= 0.94; p.vx *= 0.94; });
      parts = parts.filter(function (p) { return p.age < p.life; });
      toasts = toasts.filter(function (q) { return t - q.birth < 120; });
      if (bump > 0) bump--;
      if (hoverT > 0 && --hoverT === 0) hoverId = null;
      if (mode === 'away') return;
      if (mode === 'iris-out') { iris.k += 1 / IRIS_F; if (iris.k >= 1) { iris = null; mode = 'away'; awayDraws = 0; call('enterLevel', at, nodeInfo(at)); } return; }
      if (mode === 'iris-in') { iris.k += 1 / IRIS_F; if (iris.k >= 1) { iris = null; mode = 'idle'; holdT = HOLD_PAUSE; } }
      if (mode === 'walk') {
        var w = walker; w.s = Math.min(w.len, w.s + P.walk); hero.walkT++;
        var q = polyAt(w.poly, w.s); hero.x = q[0]; hero.y = q[1];
        if (Math.abs(q[2]) > Math.abs(q[3]) * 0.9) { hero.dir = 'side'; hero.flip = q[2] < 0; } else hero.dir = q[3] < 0 ? 'up' : 'down';
        hero.f = 1 + (Math.floor(hero.walkT / 8) % 2);
        if (hero.walkT % 16 === 0) { sound('step', {}); puff(hero.x - (hero.flip ? -3 : 3), hero.y, 1, '#e8dcc0'); }
        if (w.s >= w.len) arrive();
        return;
      }
      if (mode === 'pause') { if (--pauseT <= 0) { var e2 = nextEdge; nextEdge = null; startWalk(e2, at); } return; }
      if (mode === 'iris-in') return;
      // idle: reveals first (input waits), then input or autopilot
      if (stepReveal()) { mode = 'idle'; return; }
      if (!enabledFn()) return;
      if (autoActive()) { autoStep(); return; }
      autoWait = 0;
      if (holdT > 0) holdT--;
      var fd = dirOf({ left: fresh.left, right: fresh.right, up: fresh.up, down: fresh.down });
      if (fd) { tryDir(fd, true); return; }
      if (fresh.confirm) { act(); return; }
      if (o.holdToWalk !== false && holdT <= 0) { var hd = dirOf(I.held); if (hd && !(ENTER[N[at].kind] && !isCleared(at))) tryDir(hd, false); }
    }

    /* ----- pointer ----- */
    function toWorld(x, y) { var V = viewOf(); return [x - V.x + cam.x, y - V.y + cam.y]; }
    function nodeAt(x, y) {
      var w = toWorld(x, y), best = null, bd = 11;
      order.forEach(function (id) { if (nodeVis(id) < 2) return; var n = N[id], d = Math.hypot(n.x - w[0], n.y - 3 - w[1]); if (d < bd) { bd = d; best = id; } });
      return best;
    }
    function click(x, y) {
      if (!active() || mode !== 'idle' || reveal || revealQ.length) return false;
      var id = nodeAt(x, y); if (!id) return false;
      if (id === at) return act();
      var r = routeTo(id); if (!r || !r.length) { bump = 8; sound('deny', { id: id }); return false; }
      route = r.slice(1); startWalk(r[0], at); return true;
    }
    function hover(x, y) { var id = nodeAt(x, y); hoverId = id; hoverT = id ? 120 : 0; return id; }

    /* ----- info ----- */
    function nodeInfo(id) {
      var n = N[id]; if (!n) return null;
      var c = cleared[id] || { normal: false, secret: false }, extra = null;
      if (typeof o.nodeInfo === 'function') extra = call('nodeInfo', id, { cleared: isCleared(id), normal: c.normal, secret: c.secret, kind: n.kind });
      var info = { id: id, kind: n.kind, name: n.name, cleared: isCleared(id), normal: c.normal, secret: c.secret,
        hasSecret: n.kind === 'secret' || E.some(function (e) { return e.a === id && e.secret; }), items: [], lines: [] };
      if (extra && typeof extra === 'object') {
        if (extra.name != null) info.name = String(extra.name);
        if (Array.isArray(extra.items)) info.items = extra.items.filter(Boolean);
        if (Array.isArray(extra.lines)) info.lines = extra.lines.map(String); else if (extra.line != null) info.lines = [String(extra.line)];
        if (extra.status != null) info.status = String(extra.status);
      }
      return info;
    }

    /* ----- art (built lazily, needs a document) ----- */
    function buildArt() {
      if (art) return art;
      art = { hero: {}, disc: {}, castle: [castleSprite(false), castleSprite(true)], hut: hutSprite(), shop: shopSprite(), sign: signSprite(), star: starIcon() };
      ['down', 'up', 'side'].forEach(function (d) { art.hero[d] = [0, 1, 2].map(function (f) { var s = sprite(12, 17, heroPaint(d, f), INK); return [s, flipped(s)]; }); });
      for (var key in NODE_C) art.disc[key] = discSprite(NODE_C[key]);
      return art;
    }
    function buildTerrain() {
      if (terrain) return terrain;
      var TH = THEMES[P.terrain], Wd = Math.ceil(world.w), Hd = Math.ceil(world.h), seed = P.seed | 0;
      terrain = { canvas: null, shore: [], sparkle: [] };
      if (!TH) return terrain;
      var S = [];
      order.forEach(function (id) { S.push([N[id].x, N[id].y, 34]); });
      E.forEach(function (e) { for (var s = 0; s <= e.len; s += 6) { var q = polyAt(e.poly, s); S.push([q[0], q[1], 24]); } });
      var G = 4, CW = Math.ceil(Wd / G) + 2, CH = Math.ceil(Hd / G) + 2, F = new Float32Array(CW * CH), x, y, i;
      for (y = 0; y < CH; y++) for (x = 0; x < CW; x++) {
        var v = -1, px = x * G, py = y * G;
        for (i = 0; i < S.length; i++) { var d = 1 - Math.hypot(px - S[i][0], py - S[i][1]) / S[i][2]; if (d > v) v = d; }
        F[y * CW + x] = v;
      }
      var land = new Uint8Array(Wd * Hd);
      for (y = 0; y < Hd; y++) for (x = 0; x < Wd; x++) {
        var fx = x / G, fy = y / G, ix = fx | 0, iy = fy | 0, u = fx - ix, w = fy - iy;
        var a = F[iy * CW + ix], b = F[iy * CW + ix + 1], c = F[(iy + 1) * CW + ix], dd = F[(iy + 1) * CW + ix + 1];
        var val = a + (b - a) * u + (c - a) * w + (a - b - c + dd) * u * w;
        val += (vnoise(x / 18, y / 18, seed) - 0.5) * 0.55 + (vnoise(x / 6, y / 6, seed + 1) - 0.5) * 0.14;
        land[y * Wd + x] = val > 0.02 ? 1 : 0;
      }
      var isL = function (x2, y2) { return x2 >= 0 && y2 >= 0 && x2 < Wd && y2 < Hd && land[y2 * Wd + x2] === 1; };
      // cliffs: the first 5 water pixels under a land edge are a rock face (south-facing shores)
      var cliff = new Uint8Array(Wd * Hd);
      for (x = 0; x < Wd; x++) for (y = 1; y < Hd; y++) if (!land[y * Wd + x] && land[(y - 1) * Wd + x]) {
        for (var k2 = 0; k2 < 6 && y + k2 < Hd && !land[(y + k2) * Wd + x]; k2++) cliff[(y + k2) * Wd + x] = k2 + 1;
      }
      // distance from land for water shading (BFS, capped)
      var D = new Uint8Array(Wd * Hd).fill(255), Q = [];
      for (i = 0; i < Wd * Hd; i++) if (land[i] || cliff[i]) { D[i] = 0; Q.push(i); }
      for (var h = 0; h < Q.length; h++) {
        var id0 = Q[h], qx = id0 % Wd, qy = (id0 / Wd) | 0, d0 = D[id0]; if (d0 >= 14) continue;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (s2) { var X = qx + s2[0], Y = qy + s2[1]; if (X < 0 || Y < 0 || X >= Wd || Y >= Hd) return; var j = Y * Wd + X; if (D[j] > d0 + 1) { D[j] = d0 + 1; Q.push(j); } });
      }
      var cv = mk(Wd, Hd), g = cv.getContext('2d'), img = g.createImageData(Wd, Hd), A = img.data;
      var put = function (i2, col) { var r = hexRgb(col); A[i2 * 4] = r[0]; A[i2 * 4 + 1] = r[1]; A[i2 * 4 + 2] = r[2]; A[i2 * 4 + 3] = 255; };
      for (y = 0; y < Hd; y++) for (x = 0; x < Wd; x++) {
        i = y * Wd + x;
        if (land[i]) {
          var nearW = !isL(x, y - 1) || !isL(x - 1, y) || !isL(x + 1, y) || !isL(x, y - 2) || !isL(x - 2, y) || !isL(x + 2, y);
          var southEdge = !isL(x, y + 1) || !isL(x, y + 2);
          if (nearW && !southEdge) { put(i, (x + y) % 3 ? TH.sand : TH.sand2); continue; }
          if (southEdge) { put(i, !isL(x, y + 1) ? TH.grassD : TH.grass2); continue; }
          var nz = vnoise(x / 9, y / 9, seed + 5), hz = hsh(x, y, seed + 7), col = TH.grass;
          if (nz > 0.62) col = ((x + y) & 1) || nz > 0.7 ? TH.grassL : TH.grass;
          else if (nz < 0.34) col = ((x + y) & 1) || nz < 0.26 ? TH.grass2 : TH.grass;
          if (hz < 0.03) col = TH.speck; else if (hz < 0.036) col = TH.flowers[(hsh(y, x, 2) * 3) | 0];
          put(i, col);
        } else if (cliff[i]) {
          var cc = cliff[i], stripe = (vnoise(x / 2.5, 0, seed + 9) * 4) | 0, cr = TH.cliff;
          put(i, cc === 1 ? cr[0] : cc === 6 ? cr[4] : cr[Math.min(4, 1 + ((cc + stripe) >> 1))]);
        } else {
          var dw = D[i], wc = dw <= 1 ? TH.foam : dw <= 4 ? TH.shallow : dw <= 9 ? (((x + y) & 1) && dw > 7 ? TH.mid : dw > 7 ? TH.deep : TH.mid) : (((x >> 1) + y) % 7 === 0 ? TH.deep2 : TH.deep);
          if (dw <= 1 && cliff[i - Wd]) wc = TH.foam;
          put(i, wc);
          if (dw === 2) terrain.shore.push([x, y]);
          if (dw > 10 && hsh(x, y, seed + 11) < 0.004) terrain.sparkle.push([x, y, hsh(y, x, 4) * 120]);
        }
      }
      g.putImageData(img, 0, 0);
      // decorations: trees, pines, rocks, bushes on land, clear of paths and nodes
      var deco = [];
      for (y = 6; y < Hd - 4; y += 9) for (x = 4; x < Wd - 4; x += 9) {
        var jx = x + ((hsh(x, y, seed + 13) * 7) | 0), jy = y + ((hsh(y, x, seed + 17) * 7) | 0), r0 = hsh(jx, jy, seed + 19);
        if (r0 > 0.62) continue;
        var ok = isL(jx, jy) && isL(jx - 6, jy) && isL(jx + 6, jy) && isL(jx, jy - 9) && isL(jx, jy + 4) && isL(jx - 5, jy - 6) && isL(jx + 5, jy - 6);
        if (!ok) continue;
        var far = true;
        for (i = 0; i < S.length && far; i++) { var lim = S[i][2] === 34 ? 18 : 11; if (Math.hypot(jx - S[i][0], jy - S[i][1]) < lim || (S[i][2] === 34 && Math.hypot(jx - S[i][0], jy - 8 - S[i][1]) < 16)) far = false; }
        if (!far) continue;
        deco.push([jx, jy, r0 < 0.22 ? 'tree' : r0 < 0.4 ? 'pine' : r0 < 0.5 ? 'rock' : 'bush']);
      }
      deco.sort(function (p, q2) { return p[1] - q2[1]; });
      deco.forEach(function (dd2) { drawDeco(g, dd2[0], dd2[1], dd2[2], TH); });
      terrain.canvas = cv;
      return terrain;
    }
    function drawDeco(g, x, y, kind, TH) {
      var R = function (a, b, w, h, c) { g.fillStyle = c; g.fillRect(a, b, w, h); };
      if (kind === 'tree') {
        R(x - 4, y, 9, 2, 'rgba(0,0,0,0.25)'); R(x - 1, y - 4, 3, 5, TH.tree[3]); R(x - 1, y - 4, 1, 5, '#8a6034');
        R(x - 5, y - 12, 11, 8, INK); R(x - 4, y - 13, 9, 10, INK); R(x - 4, y - 12, 9, 8, TH.tree[0]); R(x - 3, y - 12, 6, 4, TH.tree[1]); R(x - 2, y - 11, 2, 1, '#9ad070'); R(x + 2, y - 7, 3, 2, TH.tree[2]);
      } else if (kind === 'pine') {
        R(x - 4, y, 9, 2, 'rgba(0,0,0,0.25)'); R(x, y - 3, 1, 4, TH.tree[3]);
        for (var i = 0; i < 4; i++) { var hw = 1 + i; R(x - hw - 1, y - 13 + i * 3, hw * 2 + 3, 3, INK); }
        for (i = 0; i < 4; i++) { hw = 1 + i; R(x - hw, y - 12 + i * 3, hw * 2 + 1, 2, TH.pine[0]); R(x - hw, y - 12 + i * 3, hw, 1, TH.pine[1]); R(x + 1, y - 11 + i * 3, hw, 1, TH.pine[2]); }
        R(x, y - 14, 1, 2, INK);
      } else if (kind === 'rock') {
        R(x - 4, y - 4, 8, 5, INK); R(x - 3, y - 5, 6, 1, INK); R(x - 3, y - 4, 6, 4, TH.rock[0]); R(x - 2, y - 4, 3, 1, TH.rock[1]); R(x + 1, y - 2, 2, 2, TH.rock[2]);
      } else {
        R(x - 4, y - 4, 9, 5, INK); R(x - 3, y - 5, 7, 1, INK); R(x - 3, y - 4, 7, 4, TH.tree[0]); R(x - 2, y - 4, 3, 1, TH.tree[1]); R(x + 1, y - 2, 2, 1, TH.tree[2]);
      }
    }

    /* ----- camera ----- */
    function camTarget(V) {
      var fx = hero.x, fy = hero.y - 8;
      if (reveal) { var d = reveal.edge.dots[Math.max(0, Math.min(reveal.edge.dots.length - 1, reveal.n))] || [N[reveal.edge.b].x, N[reveal.edge.b].y]; fx = d[0]; fy = d[1]; }
      else if (revealQ.length) { var e = revealQ[0]; fx = N[e.a].x; fy = N[e.a].y; }
      var x = fx - V.w / 2, y = fy - V.h * (P.panel === 'top' ? 0.55 : P.panel === 'off' ? 0.5 : 0.44);
      var mx = world.w - V.w, my = world.h - V.h;
      x = mx <= 0 ? mx / 2 : Math.max(0, Math.min(mx, x)); y = my <= 0 ? my / 2 : Math.max(0, Math.min(my, y));
      return [x, y];
    }
    function stepCam(V) {   // one 60 Hz step, called from update() only
      var tg = camTarget(V);
      if (!cam.ready || P.camera === 'instant') { cam.x = tg[0]; cam.y = tg[1]; cam.ready = true; return; }
      cam.x += (tg[0] - cam.x) * 0.14; cam.y += (tg[1] - cam.y) * 0.14;
      if (Math.abs(tg[0] - cam.x) < 0.5) cam.x = tg[0]; if (Math.abs(tg[1] - cam.y) < 0.5) cam.y = tg[1];
    }

    /* ----- drawing ----- */
    function draw(ctx) {
      try { drawWorld(ctx); drawUI(ctx); } catch (e) { warn('draw', 'draw failed: ' + (e && e.message)); }
    }
    function enter(g, V) { g.save(); g.beginPath(); g.rect(V.x, V.y, V.w, V.h); g.clip(); g.imageSmoothingEnabled = false; }
    function drawWorld(g) {
      if (!g || !g.canvas) return;
      lastCanvas = g.canvas;
      if (mode === 'away') { if (++awayDraws === 30) { warn('away', 'draw() called for 30 frames while a level is open: call complete(id) or fail(id) when the level ends; showing the map'); show(); } }
      var V = viewOf(); /*cam-draw*/ if (!cam.ready) { var q0 = camTarget(V); cam.x = q0[0]; cam.y = q0[1]; cam.ready = true; }   // drawn before any update: start on the target
      buildArt();
      var cx = Math.round(cam.x), cy = Math.round(cam.y), ox = V.x - cx, oy = V.y - cy;
      enter(g, V);
      // ground
      var TR = buildTerrain();
      if (typeof o.drawGround === 'function') { try { o.drawGround(g, { x: cx, y: cy }, V); } catch (e) { warn('cb-drawGround', 'drawGround threw: ' + e.message); } }
      else if (TR.canvas) {
        var TH = THEMES[P.terrain];
        g.fillStyle = TH.deep; g.fillRect(V.x, V.y, V.w, V.h);
        g.drawImage(TR.canvas, ox, oy);
        // shore foam pulse and deep-water glints
        var ph = Math.floor(t / 20);
        g.fillStyle = TH.foam;
        for (var i = 0; i < TR.shore.length; i++) { var s = TR.shore[i]; if (((s[0] >> 2) + (s[1] >> 2) + ph) % 4 === 0) g.fillRect(s[0] + ox, s[1] + oy, 1, 1); }
        g.fillStyle = TH.sparkle;
        TR.sparkle.forEach(function (p) { var k2 = (t + p[2]) % 120; if (k2 < 10) { g.fillRect(p[0] + ox, p[1] + oy, k2 < 5 ? 1 : 3, 1); if (k2 >= 3 && k2 < 7) g.fillRect(p[0] + 1 + ox, p[1] - 1 + oy, 1, 3); } });
      } else { g.fillStyle = THEMES.coast.none; g.fillRect(V.x, V.y, V.w, V.h); }
      // paths
      E.forEach(function (e) {
        if (open[e.id]) { e.dots.forEach(function (d) { stone(g, d[0] + ox, d[1] + oy, false); }); return; }
        if (reveal && reveal.edge === e) {
          for (var j = 0; j < reveal.n && j < e.dots.length; j++) stone(g, e.dots[j][0] + ox, e.dots[j][1] + oy, j === reveal.n - 1 && reveal.k < 3 && !reveal.done);
          var nd = e.dots[reveal.n]; if (nd && !reveal.done) spark(g, nd[0] + ox, nd[1] + oy, t);
          return;
        }
        if (faintEdge(e)) { g.globalAlpha = 0.42; e.dots.forEach(function (d) { g.fillStyle = '#26301e'; g.fillRect(d[0] + ox - 1, d[1] + oy - 1, 4, 3); g.fillStyle = '#c8c0a0'; g.fillRect(d[0] + ox, d[1] + oy - 1, 2, 2); }); g.globalAlpha = 1; }
      });
      // nodes, back to front
      order.slice().sort(function (p, q) { return N[p].y - N[q].y; }).forEach(function (id) { drawNode(g, id, ox, oy); });
      // hero
      var bob = mode === 'walk' && hero.f === 1 ? -1 : 0, bx = bump > 0 ? (bump % 4 < 2 ? 1 : -1) : 0, hx = Math.round(hero.x) + ox + bx, hy = Math.round(hero.y) + oy;
      if (typeof o.drawPlayer === 'function') { try { o.drawPlayer(g, hx, hy + bob, hero.dir === 'side' ? (hero.flip ? 'left' : 'right') : hero.dir, hero.f, t); } catch (e) { warn('cb-drawPlayer', 'drawPlayer threw: ' + e.message); } }
      else {
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(hx - 4, hy, 9, 2); g.fillRect(hx - 3, hy + 2, 7, 1);
        var cheer = mode === 'idle' && clearFx[at] != null && t - clearFx[at] < 90 && Math.floor((t - clearFx[at]) / 10) % 2 === 0 ? -2 : 0;
        var spr = art.hero[hero.dir][hero.f][hero.dir === 'side' && hero.flip ? 1 : 0];
        g.drawImage(spr, hx - 7, hy - 17 + bob + cheer);
      }
      // particles
      parts.forEach(function (p) { g.globalAlpha = Math.max(0, 1 - p.age / p.life); g.fillStyle = p.col; g.fillRect(Math.round(p.x) + ox, Math.round(p.y) + oy, 1, 1); });
      g.globalAlpha = 1;
      if (typeof o.drawOver === 'function') { try { o.drawOver(g, { x: cx, y: cy }, V); } catch (e) { warn('cb-drawOver', 'drawOver threw: ' + e.message); } }
      g.restore();
    }
    function stone(g, x, y, fresh) {
      if (fresh) { g.fillStyle = '#3a2a18'; g.fillRect(x - 2, y - 2, 5, 4); g.fillStyle = '#fffbe8'; g.fillRect(x - 1, y - 1, 3, 2); return; }
      g.fillStyle = 'rgba(30,20,10,0.55)'; g.fillRect(x - 1, y, 4, 2);
      g.fillStyle = '#5a4428'; g.fillRect(x - 1, y - 1, 4, 3);
      g.fillStyle = '#f0e2b8'; g.fillRect(x, y - 1, 2, 2); g.fillStyle = '#fffaf0'; g.fillRect(x, y - 1, 1, 1);
    }
    function spark(g, x, y, tt) {
      var s = (tt >> 2) % 2 ? 2 : 1;
      g.fillStyle = '#ffffff'; g.fillRect(x - s, y, s * 2 + 1, 1); g.fillRect(x, y - s, 1, s * 2 + 1);
      g.fillStyle = '#ffe070'; g.fillRect(x, y, 1, 1);
    }
    function drawNode(g, id, ox, oy) {
      var n = N[id], vis = nodeVis(id); if (!vis) return;
      var x = n.x + ox, y = n.y + oy, faint = vis === 1, popAge = pops[id] != null ? t - pops[id] : 999, dy = 0;
      if (popAge < 14) dy = [-5, -4, -3, -2, -1, 0, 1, 0, -1, 0, 0, 0, 0, 0][popAge];
      if (faint) g.globalAlpha = 0.5;
      var kind = n.kind;
      if (kind === 'castle') {
        g.drawImage(art.disc[faint ? 'locked' : isCleared(id) ? 'clear' : 'start'], x - 8, y - 4 + dy);
        g.drawImage(art.castle[isCleared(id) ? 1 : 0], x - 16, y - 42 + dy);   // stands behind the disc, so a hero at the gate hides only the gate
        if (!faint) { var wv = (t >> 4) % 2; g.fillStyle = INK; g.fillRect(x - 1, y - 50 + dy, 1, 9); g.fillStyle = isCleared(id) ? '#f8f8ff' : '#e04a3a'; g.fillRect(x, y - 50 + dy, 6 - wv, 3); g.fillRect(x, y - 49 + dy, 7 - wv, 1); g.fillStyle = INK; g.fillRect(x, y - 47 + dy, 6 - wv, 1); }
      } else if (kind === 'hut') {
        g.drawImage(art.disc[faint ? 'locked' : 'start'], x - 8, y - 4 + dy);
        g.drawImage(art.hut, x - 9, y - 14 + dy);
        if (!faint) for (var i = 0; i < 3; i++) { var a = (t * 0.5 + i * 14) % 42; g.fillStyle = 'rgba(240,240,250,' + (0.7 - a / 60).toFixed(2) + ')'; g.fillRect(x + 4 + Math.round(Math.sin((a + i * 7) * 0.15) * 2), y - 15 - Math.round(a * 0.35) + dy, a > 20 ? 2 : 1, a > 20 ? 2 : 1); }
      } else if (kind === 'shop') {
        g.drawImage(art.disc[faint ? 'locked' : 'start'], x - 8, y - 4 + dy);
        g.drawImage(art.shop, x - 9, y - 14 + dy);
      } else if (kind === 'start') {
        g.drawImage(art.disc.start, x - 8, y - 4 + dy);
        g.drawImage(art.sign, x - 17, y - 13 + dy);
      } else {
        var key = faint ? 'locked' : done(id) ? 'clear' : hasSecretExit(id) ? 'secret' : kind === 'bonus' ? 'bonus' : 'level';
        if (!faint && !done(id) && !isCleared(id)) {   // uncleared: a soft pulsing ring
          var pr = (t >> 3) % 4; if (pr < 2) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x - 8, y - 1 + dy, 1, 3); g.fillRect(x + 8, y - 1 + dy, 1, 3); g.fillRect(x - 5, y - 5 + dy, 11, 1); g.fillRect(x - 5, y + 5 + dy, 11, 1); }
        }
        g.drawImage(art.disc[key], x - 8, y - 5 + dy);
        if (kind === 'bonus') g.drawImage(art.star, x - 5, y - 9 + dy);
        if (isCleared(id) && !faint) {   // flag on cleared levels
          var w2 = (t >> 4) % 2; g.fillStyle = INK; g.fillRect(x + 6, y - 13 + dy, 1, 11); g.fillStyle = '#fff8e8'; g.fillRect(x + 6, y - 14 + dy, 1, 1);
          g.fillStyle = cleared[id].secret ? '#f088d8' : '#f04a3a'; g.fillRect(x + 7, y - 13 + dy, 5 - w2, 2); g.fillRect(x + 7, y - 11 + dy, 4 - w2, 2);
          g.fillStyle = INK; g.fillRect(x + 7, y - 9 + dy, 4 - w2, 1);
        }
      }
      g.globalAlpha = 1;
      if (faint) {   // padlock over a locked node
        var lx = x - 3, ly = y - (kind === 'castle' ? 52 : kind === 'hut' || kind === 'shop' ? 22 : 13);
        g.fillStyle = INK; g.fillRect(lx, ly + 2, 7, 6); g.fillRect(lx + 1, ly, 5, 3);
        g.fillStyle = '#c8c8d8'; g.fillRect(lx + 2, ly + 1, 3, 1); g.fillRect(lx + 1, ly + 1, 1, 2); g.fillRect(lx + 5, ly + 1, 1, 2);
        g.fillStyle = '#f0c040'; g.fillRect(lx + 1, ly + 3, 5, 4); g.fillStyle = '#fff4a0'; g.fillRect(lx + 1, ly + 3, 5, 1); g.fillStyle = INK; g.fillRect(lx + 3, ly + 4, 1, 2);
      }
      if (popAge < 24) { for (var s = 0; s < 6; s++) { var an = s / 6 * 6.283 + popAge * 0.1, rr = 4 + popAge * 0.7; g.fillStyle = popAge % 4 < 2 ? '#ffffff' : '#ffe070'; g.fillRect(Math.round(x + Math.cos(an) * rr), Math.round(y - 3 + Math.sin(an) * rr * 0.7), 1, 1); } }
    }

    function drawUI(g) {
      if (!g || !g.canvas) return;
      var V = viewOf(); uiRects = [];
      if (mode === 'away') return;
      enter(g, V);
      var avoid = [];
      if (typeof o.avoid === 'function') { var av = call('avoid'); if (Array.isArray(av)) avoid = av.filter(function (r) { return r && r.w > 0 && r.h > 0; }); }
      else if (Array.isArray(o.avoid)) avoid = o.avoid;
      var hs = { x: Math.round(hero.x - cam.x) + V.x, y: Math.round(hero.y - cam.y) + V.y };
      // scroll hints
      var canL = cam.x > 0.5, canR = cam.x < world.w - V.w - 0.5, canU = cam.y > 0.5, canD = cam.y < world.h - V.h - 0.5;
      if (canL) arrowHint(g, V.x + 3, V.y + (V.h >> 1), 'left'); if (canR) arrowHint(g, V.x + V.w - 8, V.y + (V.h >> 1), 'right');
      if (canU) arrowHint(g, V.x + (V.w >> 1), V.y + 3, 'up'); if (canD && P.panel === 'off') arrowHint(g, V.x + (V.w >> 1), V.y + V.h - 8, 'down');
      // info panel
      if (P.panel !== 'off') {
        var id = hoverId && nodeVis(hoverId) === 2 ? hoverId : walker ? walker.to : at, info = nodeInfo(id);
        var pw = Math.min(V.w - 8, 232), ph = 30, px = V.x + ((V.w - pw) >> 1);
        var bottom = { x: px, y: V.y + V.h - ph - 4, w: pw, h: ph }, top = { x: px, y: V.y + 4, w: pw, h: ph };
        var hit = function (r) { var hr = { x: hs.x - 8, y: hs.y - 20, w: 16, h: 24 }; if (overlap(r, hr)) return 2; for (var i = 0; i < avoid.length; i++) if (overlap(r, avoid[i])) return 3; return 0; };
        var r = P.panel === 'top' ? top : P.panel === 'bottom' ? bottom : (hit(bottom) && hit(bottom) >= hit(top) && hit(top) < 3 ? top : bottom);
        if (P.panel === 'auto' && hit(r) === 3 && !hit(top)) r = top;
        panel(g, r, info, id === at && mode === 'idle' && !reveal && !revealQ.length);
        uiRects.push({ x: r.x, y: r.y, w: r.w, h: r.h, kind: 'panel' });
      }
      // toasts
      var ty = V.y + 9;
      if (uiRects.length && uiRects[0].y < V.y + V.h / 2) ty = uiRects[0].y + uiRects[0].h + 4;
      toasts.forEach(function (q, i) {
        var age = t - q.birth, tw = L.measure(q.text) + 14, th = L.fontH + 8, slide = age < 8 ? (8 - age) * 2 : age > 108 ? (age - 108) * 2 : 0;
        var by = ty + i * (th + 2), r2 = { x: V.x + ((V.w - tw) >> 1), y: by - Math.min(slide, by - V.y - 1), w: tw, h: th };   // slides, never above the view
        if (age < 8) g.globalAlpha = (age + 1) / 8; else if (age > 112) g.globalAlpha = Math.max(0, 1 - (age - 112) / 8);
        L.plate(g, r2, q.kind === 'b');
        L.text(g, q.text, r2.x + 7, r2.y + 4, L.C.title, L.C.title2);   // a secret uses the alert plate
        g.globalAlpha = 1;
        uiRects.push({ x: r2.x, y: r2.y, w: r2.w, h: r2.h, kind: 'toast' });
      });
      // iris
      if (iris) drawIris(g, V, hs);
      g.restore();
    }
    function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
    function arrowHint(g, x, y, dir) {   // 5x9 (left/right) or 9x5 (up/down) arrow with a 1 px ink outline; bobs 1 px toward its edge
      var side = dir === 'left' || dir === 'right', rows = side ? ['....#', '...##', '..###', '.####', '#####', '.####', '..###', '...##', '....#'] : ['....#....', '...###...', '..#####..', '.#######.', '#########'];
      var w = rows[0].length, h = rows.length, b = (t >> 5) % 2;
      if (side) { y -= h >> 1; x += dir === 'left' ? -b : b; } else { x -= w >> 1; y += dir === 'up' ? -b : b; }
      var at = function (xx, yy) { var X = dir === 'right' ? w - 1 - xx : xx, Y = dir === 'down' ? h - 1 - yy : yy; return { X: x + X, Y: y + Y }; };
      for (var pass = 0; pass < 2; pass++) rows.forEach(function (r, yy) { for (var xx = 0; xx < w; xx++) if (r[xx] === '#') {
        var q = at(xx, yy); if (!pass) { g.fillStyle = INK; g.fillRect(q.X - 1, q.Y - 1, 3, 3); } else { g.fillStyle = yy < h / 2 && side || !side && yy < 2 ? '#fff8d8' : '#f0c040'; g.fillRect(q.X, q.Y, 1, 1); }
      } });
    }
    function icon(g, name, x, y) {
      if (name === 'disc' || name === 'castle' || name === 'hut' || name === 'shop' || name === 'start') return;
      var rows = ICONS[name] || ICONS.star;
      rows.forEach(function (r, yy) { for (var xx = 0; xx < 7; xx++) { var c = ICON_C[r[xx]]; if (c) { g.fillStyle = c; g.fillRect(x + xx, y + yy, 1, 1); } } });
    }
    function panel(g, r, info, here) {
      if (!info) { L.frame(g, r, 'n'); return; }
      L.frame(g, r, info.kind === 'castle' ? 'b' : 'a');
      var x = r.x + 6, y = r.y + 5, n = N[info.id], nx = x + 11;
      // kind badge
      var bk = info.kind === 'hut' ? 'save' : info.kind === 'shop' ? 'coin' : info.kind === 'castle' ? 'flag' : info.kind === 'bonus' ? 'star' : null;
      if (bk) icon(g, bk, x, y);
      else { g.drawImage(art.disc[done(info.id) ? 'clear' : info.hasSecret ? 'secret' : info.kind === 'start' ? 'start' : 'level'], x - 3, y - 2); nx = x + 15; }
      var nm = String(info.name).toUpperCase(), maxW = r.w - 70;
      while (L.measure(nm) > maxW && nm.length > 3) nm = nm.slice(0, -1);
      L.text(g, nm, nx, y, L.C.title, L.C.title2);
      // status at the right
      var st = info.status != null ? info.status.toUpperCase() : info.kind === 'hut' ? label('saveWord', 'SAVE') : info.kind === 'shop' ? label('shopWord', 'SHOP') : info.kind === 'start' ? label('startWord', 'START')
        : info.cleared ? label('clearWord', 'CLEAR') : label('newWord', 'NEW');
      var sc = info.cleared || info.kind === 'hut' ? L.C.good : info.kind === 'castle' ? L.C.bad : L.C.accent;
      var sx = r.x + r.w - 6 - L.measure(st);
      if (info.hasSecret && ENTER[info.kind]) {   // two exit pips: normal, secret
        sx -= 16;
        pip(g, sx + L.measure(st) + 5, y + 1, info.normal, '#f04a3a'); pip(g, sx + L.measure(st) + 11, y + 1, info.secret, '#f088d8');
      }
      L.text(g, st, sx, y, sc, sc);
      // second row: items or lines, and the key hint
      var y2 = y + 12, cx = x;
      if (info.items.length) info.items.slice(0, 4).forEach(function (it) {
        if (typeof it === 'string') it = { label: it };
        if (it.icon) { icon(g, it.icon, cx, y2); cx += 9; }
        var s = it.label != null ? String(it.label) : (it.have != null ? it.have : '') + (it.total != null ? '/' + it.total : '');
        L.text(g, s, cx, y2, it.done || (it.total != null && it.have >= it.total) ? L.C.good : L.C.main, it.done || (it.total != null && it.have >= it.total) ? L.C.good : L.C.main2); cx += L.measure(s) + 8;
      });
      else if (info.lines.length) L.text(g, info.lines[0].toUpperCase(), cx, y2, L.C.main, L.C.main2);
      else L.text(g, n.kind === 'start' ? label('startLine', 'THE TRAIL BEGINS') : ENTER[n.kind] ? (info.cleared ? label('againLine', 'PLAY AGAIN') : label('newLine', 'NOT CLEARED')) : '', cx, y2, L.C.main, L.C.main2);
      if (here) {
        var hint = n.kind === 'hut' ? label('save', 'SAVE') : n.kind === 'shop' ? label('shop', 'SHOP') : ENTER[n.kind] ? label('enter', 'ENTER') : '';
        if (hint) { var key = label('key', 'Z'), hw = L.measure(hint), kw = L.measure(key) + 4, hx = r.x + r.w - 6 - hw;
          { g.fillStyle = L.C.ink; g.fillRect(hx - kw - 4, y2 - 2, kw + 1, L.fontH + 3); g.fillStyle = '#fff4c0'; g.fillRect(hx - kw - 3, y2 - 1, kw - 1, L.fontH + 1); L.plain(g, key, hx - kw - 1, y2, '#1c1424'); }
          L.text(g, hint, hx, y2, L.C.main, L.C.main2); }
      }
    }
    function pip(g, x, y, onv, col) { g.fillStyle = INK; g.fillRect(x - 1, y, 6, 6); g.fillRect(x, y - 1, 4, 8); g.fillStyle = onv ? col : '#3a3a50'; g.fillRect(x, y, 4, 6); g.fillRect(x - 0, y, 4, 6); if (onv) { g.fillStyle = '#ffffff'; g.fillRect(x, y, 1, 1); } }
    function drawIris(g, V, hs) {
      var k = Math.max(0, Math.min(1, iris.k)), R = Math.hypot(V.w, V.h) * 0.75, r = iris.dir < 0 ? R * Math.pow(1 - k, 1.6) : R * Math.pow(k, 1.6);
      var cx = hs.x, cy = hs.y - 8;
      g.fillStyle = '#06040e';
      for (var y = V.y; y < V.y + V.h; y++) {
        var dy = y - cy, w = r * r - dy * dy;
        if (w <= 0) { g.fillRect(V.x, y, V.w, 1); continue; }
        var hw = Math.floor(Math.sqrt(w)); g.fillRect(V.x, y, Math.max(0, cx - hw - V.x), 1); g.fillRect(cx + hw, y, Math.max(0, V.x + V.w - cx - hw), 1);
      }
      if (r > 2 && r < R * 0.95) { g.fillStyle = '#f0c860'; for (var a = 0; a < 6.283; a += 1.5 / r) { var X = Math.round(cx + Math.cos(a) * r), Y = Math.round(cy + Math.sin(a) * r); if (Y >= V.y && Y < V.y + V.h) g.fillRect(X, Y, 1, 1); } }
    }

    /* ----- public instance ----- */
    var api = {
      update: update, draw: draw, drawWorld: function (g) { try { drawWorld(g); } catch (e) { warn('draw', 'drawWorld failed: ' + e.message); } },
      drawUI: function (g) { try { drawUI(g); } catch (e) { warn('draw', 'drawUI failed: ' + e.message); } },
      key: keyEvent, press: press, release: release, click: click, hover: hover,
      complete: complete, fail: fail, show: show, confirm: function () { return mode === 'idle' && !reveal && !revealQ.length ? act() : false; },
      setAuto: function (on) { autoOn = !!on; autoWait = 0; }, setParams: function (p) { var tr = P.terrain, sp = P.spacing, sd = P.seed; setParams(p); if (P.terrain !== tr || P.seed !== sd) terrain = null; if (P.spacing !== sp) E.forEach(function (ed) { var s = 9, out = []; while (s < ed.len - 8) { var q = polyAt(ed.poly, s); out.push([Math.round(q[0]), Math.round(q[1])]); s += P.spacing; } ed.dots = out; }); },
      getState: getState,
      setState: function (s) { loadState(s || {}); hero.x = N[at].x; hero.y = N[at].y; mode = 'idle'; walker = null; route = []; reveal = null; revealQ = []; iris = null; cam.ready = false; allClearSent = false; },
      reset: function () { api.setState({}); toasts = []; parts = []; pops = {}; clearFx = {}; autoTries = {}; saves = 0; },
      isCleared: isCleared, isOpen: function (eid) { return !!open[eid]; }, nodeInfo: nodeInfo,
      nodes: function () { return order.map(function (id) { var n = N[id]; return { id: id, x: n.x, y: n.y, kind: n.kind, name: n.name, cleared: isCleared(id), visible: nodeVis(id) }; }); },
      edges: function () { return E.map(function (e) { return { id: e.id, a: e.a, b: e.b, secret: e.secret, open: !!open[e.id], dots: e.dots.length }; }); },
      get at() { return at; }, get mode() { return mode; }, get params() { return P; }, get world() { return { w: world.w, h: world.h }; },
      busy: function () { return mode !== 'idle' || !!reveal || revealQ.length > 0; },
      autoplaying: function () { return autoActive(); },
      waitingForPlayer: function () { return mode === 'idle' && !reveal && !revealQ.length && enabledFn() && !autoActive(); },
      revealing: function () { return reveal ? { edge: reveal.edge.id, dot: reveal.n, of: reveal.edge.dots.length } : null; },
      camera: function () { return { x: Math.round(cam.x), y: Math.round(cam.y) }; },
      player: function () { var V = viewOf(); var x = Math.round(hero.x - Math.round(cam.x)) + V.x, y = Math.round(hero.y - Math.round(cam.y)) + V.y; return { x: x, y: y, top: y - 17, w: 12, h: 17, left: x - 6, dir: hero.dir, walking: mode === 'walk' }; },
      toScreen: function (wx, wy) { var V = viewOf(); return { x: Math.round(wx - Math.round(cam.x)) + V.x, y: Math.round(wy - Math.round(cam.y)) + V.y }; },
      getUIRects: function () { return uiRects.slice(); },
      log: function () { return log.slice(); },
      version: VERSION
    };
    return api;
  }

  root.GameDNA_LevelMap = { create: create, version: VERSION, DEFAULTS: DEFAULTS, KINDS: KINDS };
})(typeof window !== 'undefined' ? window : this);
