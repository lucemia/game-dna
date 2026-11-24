/* GameDNA E-01 · Bouncing damage numbers · module v1 (plain script, no dependencies, one global)
 *
 *   const dn = GameDNA_DamageNumbers.create({
 *     getAnchor: id => ({ x, top, w, h }),      // target centre x, top of its sprite (px), sprite box size; null if gone
 *     getObstacles: () => [{ x, y, w, h, id }],  // sprites (with id), UI rects (no id), props ({ soft: true })
 *     bounds: { x: 0, y: 0, w: 256, h: 156 },   // play field in native pixels (keep numbers above the HUD)
 *     params: { bounce: 10, ... },              // see DEFAULTS
 *     onHitStop: ms => {}, onShake: (px, ms) => {}, onFlash: (alpha, ms) => {}
 *   });
 *   dn.spawn(targetId, amount, kind)   // kind: 'damage' | 'crit' | 'heal' | 'miss' | 'mp' | 'status' (amount = word)
 *   dn.update(dtMs)                    // world time; pass 0 while the game is frozen by hit-stop
 *   dn.draw(ctx, offsetX, offsetY)     // native-resolution 2D context, after sprites/effects, before banner/HUD
 */
(function (root) {
  'use strict';
  var DEFAULTS = { bounce: 10, duration: 1000, stagger: 40, hitstop: 60, scale: 1, scheme: 'classic', crit: 'burst', stack: 'on', outline: 1, gap: 4, dense: 'auto' };

  /* ---------- glyphs: 7x10 digits (2px strokes) and a 5x7 letter font; words are never drawn from the digit table ---------- */
  var DIGITS = {
    0: '.#####.|##...##|##...##|##..###|##.#.##|###..##|##...##|##...##|##...##|.#####.', 1: '...##..|..###..|.####..|...##..|...##..|...##..|...##..|...##..|...##..|.######',
    2: '.#####.|##...##|.....##|.....##|...###.|..##...|.##....|##.....|##.....|#######', 3: '.#####.|##...##|.....##|.....##|..####.|.....##|.....##|.....##|##...##|.#####.',
    4: '....##.|...###.|..####.|.##.##.|##..##.|##..##.|#######|....##.|....##.|....##.', 5: '#######|##.....|##.....|######.|.....##|.....##|.....##|.....##|##...##|.#####.',
    6: '..####.|.##....|##.....|##.....|######.|##...##|##...##|##...##|##...##|.#####.', 7: '#######|##...##|.....##|....##.|....##.|...##..|...##..|..##...|..##...|..##...',
    8: '.#####.|##...##|##...##|##...##|.#####.|##...##|##...##|##...##|##...##|.#####.', 9: '.#####.|##...##|##...##|##...##|##...##|.######|.....##|.....##|....##.|.####..',
    '+': '......|......|..##..|..##..|######|######|..##..|..##..|......|......'
  };
  var LETTERS = {
    A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.', C: '.###.|#...#|#....|#....|#....|#...#|.###.',
    D: '####.|#...#|#...#|#...#|#...#|#...#|####.', E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
    G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#', I: '###|.#.|.#.|.#.|.#.|.#.|###',
    J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..', K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
    M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#', O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
    P: '####.|#...#|#...#|####.|#....|#....|#....', Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..', U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
    V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..', W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####', ' ': '...|...|...|...|...|...|...',
    '!': '#|#|#|#|#|.|#', '-': '....|....|....|####|....|....|....', '?': '.###.|#...#|....#|...#.|..#..|.....|..#..'
  };
  var D10 = {}, L7 = {}, BOLD = {}, k;
  for (k in DIGITS) D10[k] = DIGITS[k].split('|');
  for (k in LETTERS) L7[k] = LETTERS[k].split('|');
  function letterRows(ch) { return L7[ch] || L7['?']; }
  // bold word font: every stroke widened 1px to the right, so words match the 2px digit strokes
  function boldRows(ch) {
    if (BOLD[ch]) return BOLD[ch];
    return (BOLD[ch] = letterRows(ch).map(function (r) { var o = ''; for (var i = 0; i <= r.length; i++) o += r[i] === '#' || r[i - 1] === '#' ? '#' : '.'; return o; }));
  }
  function textW(s) { var w = 0; for (var i = 0; i < s.length; i++) w += letterRows(s[i])[0].length + 1; return Math.max(0, w - 1); }

  /* ---------- colours: [edge highlight, top half, bottom half, bottom-edge shade] ---------- */
  var SCHEMES = {
    classic: { dmg: ['#ffffff', '#f4f6ff', '#b8c4f0', '#7a86c0'], crit: ['#ffffff', '#fff2a0', '#ffb43a', '#c0601a'], heal: ['#f0fff0', '#b8ffc0', '#4ad870', '#22904a'],
      miss: ['#ffffff', '#e4e4ec', '#a8a8bc', '#6e6e84'], mp: ['#ffffff', '#c8eeff', '#4aa8ff', '#2060c0'], status: ['#ffffff', '#f0d4ff', '#b878f8', '#7038b0'], ol: '#120a1e' },
    warm: { dmg: ['#ffffff', '#fff0d0', '#ffa860', '#c0582a'], crit: ['#ffffff', '#ffd0d0', '#ff4a4a', '#a01830'], heal: ['#ffffff', '#e8ffb0', '#9ce040', '#4c8a18'],
      miss: ['#ffffff', '#ece4dc', '#b0a49a', '#706460'], mp: ['#ffffff', '#c8fff4', '#38d0c8', '#1a7a88'], status: ['#ffffff', '#ffd8f0', '#f070c0', '#982870'], ol: '#1e0a0a' },
    contrast: { dmg: ['#ffffff', '#ffffff', '#ffffff', '#c8c8d0'], crit: ['#ffffff', '#ffff60', '#ffff00', '#d0b000'], heal: ['#ffffff', '#90ff90', '#30ff70', '#10b040'],
      miss: ['#ffffff', '#d8d8d8', '#c0c0c0', '#909090'], mp: ['#ffffff', '#90e8ff', '#40c8ff', '#2080d0'], status: ['#ffffff', '#ff98ff', '#ff60ff', '#b030b0'], ol: '#000000' }
  };
  var FLASH = ['#ffffff', '#ffffff', '#ffffff', '#e8e8ff'];

  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
  // glyph sprite pair: outline (mask dilated by o px + 1px drop) and fill (2-tone with 1px edge light/shade); drawn outlines first, then fills
  var GC = {};
  function glyph(font, ch, s, R, ol, o) {
    var key = font + '|' + ch + '|' + s + '|' + R.join() + '|' + ol + '|' + o;
    if (GC[key]) return GC[key];
    var rows = font === 'digit' ? D10[ch] : font === 'bold' ? boldRows(ch) : letterRows(ch), w = rows[0].length * s, h = rows.length * s;
    var at = function (x, y) { return x >= 0 && y >= 0 && x < w && y < h && rows[(y / s) | 0][(x / s) | 0] === '#'; };
    var cO = mk(w + 2 * o + 1, h + 2 * o + 1), cF = mk(w + 2 * o + 1, h + 2 * o + 1), gO = cO.getContext('2d'), gF = cF.getContext('2d'), x, y, dx, dy, hit;
    gO.fillStyle = ol;
    for (y = -o; y < h + o + 1; y++) for (x = -o; x < w + o; x++) {
      hit = false;
      for (dy = -o; dy <= o && !hit; dy++) for (dx = -o; dx <= o && !hit; dx++) if (at(x + dx, y + dy) || at(x + dx, y + dy - 1)) hit = true;
      if (hit) gO.fillRect(x + o, y + o, 1, 1);
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (at(x, y)) {
      gF.fillStyle = y < h / 2 ? (!at(x, y - 1) ? R[0] : R[1]) : (!at(x, y + 1) ? R[3] : R[2]);
      gF.fillRect(x + o, y + o, 1, 1);
    }
    return (GC[key] = { ol: cO, fill: cF, w: w, h: h });
  }
  function overlap(a, b) { var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; }
  // vertical offset of one glyph, a = ms since that glyph started; negative = up
  function bounceY(a, D, H, drift) {
    var s = a / D, arc = function (u, h) { return -Math.round(h * 4 * u * (1 - u)); };
    if (s < 0.2) return arc(s / 0.2, H);                  // rise and fall, peak at 10 % of the life
    if (s < 0.23) return H >= 2 ? 1 : 0;                  // overshoot: 1px below rest on landing (not for a pinned number)
    if (s < 0.33) return arc((s - 0.23) / 0.1, H * 0.3);  // second bounce
    if (s < 0.35) return H >= 8 ? 1 : 0;
    if (s < 0.41) return arc((s - 0.35) / 0.06, H * 0.12);
    if (s < 0.78) return 0;                               // hold
    return -Math.round((s - 0.78) / 0.22 * (drift == null ? 4 : drift));   // drift up (4px) while fading
  }
  function rdist(px, py, r) { return Math.hypot(Math.max(r.x - px, 0, px - (r.x + r.w)), Math.max(r.y - py, 0, py - (r.y + r.h))); }
  function fadeA(a, D) { var s = a / D; return s < 0.78 ? 1 : s < 0.85 ? 0.75 : s < 0.92 ? 0.5 : 0.25; }
  var KIND = { damage: 'dmg', dmg: 'dmg', crit: 'crit', critical: 'crit', heal: 'heal', miss: 'miss', mp: 'mp', status: 'status' };

  function create(opt) {
    opt = opt || {};
    var P = {}, k2; for (k2 in DEFAULTS) P[k2] = DEFAULTS[k2]; set(opt.params);
    // skin: with skins/skin-api.js loaded, every glyph, colour, outline and label is drawn by GameDNA_Skin.resolve(opt.skin).number();
    // without it (single-file v1 hosts) the built-in pixel drawing below is used. Placement and timing never depend on the skin.
    var SK = root.GameDNA_Skin && opt.skin !== false ? root.GameDNA_Skin.resolve(opt.skin) : null;
    var SKIND = { dmg: 'damage', crit: 'crit', heal: 'heal', miss: 'miss', mp: 'mp', status: 'status' }, MEAS = {};
    var t = 0, pops = [], waiting = [], seq = 0, drawn = [], cache = {}, warned = false;
    var B = function () { return opt.bounds || { x: 0, y: 0, w: 256, h: 156 }; };
    function set(o) { if (o) for (var key in o) if (key in DEFAULTS) P[key] = typeof DEFAULTS[key] === 'number' ? +o[key] : String(o[key]); }
    function call(name) { var f = opt[name]; if (typeof f === 'function') try { f.apply(null, [].slice.call(arguments, 1)); } catch (e) { if (root.console) console.error(e); } }

    var scaleOf = function (p) { return p.small ? 1 : +P.scale; };
    var critBig = function (p) { return p.kind === 'crit' && P.crit === 'burst'; };
    var stag = function (p) { return p.merged ? 0 : +P.stagger * Math.min(1, 12 / Math.max(1, +P.bounce)); };
    function bounceH(p) { var h = +P.bounce * (p.kind === 'crit' ? 1.3 : p.kind === 'miss' || p.kind === 'status' ? 0.6 : 1); return p.hcap != null ? Math.min(h, p.hcap) : h; }
    function durOf(p) { return +P.duration * (p.kind === 'crit' ? 1.15 : 1); }
    function labelGap(p) { return 3 + Math.ceil(bounceH(p) * 0.16); }
    // glyph boxes in the skin's own metrics (digit size, label width differ per style): measured once per text/kind/scale by drawing
    // off-screen through skin.number() and reading back the fill rects it returns (number glyphs first, then the label's)
    function skinLayout(p) {
      var s = scaleOf(p), lab = p.kind === 'crit' && P.crit !== 'plain' ? 'CRITICAL' : null, big = critBig(p), gap = labelGap(p);
      var o = { kind: SKIND[p.kind] || 'damage', scheme: P.scheme, scale: s, big: big, suffix: p.suffix || null, label: lab, labelGap: gap };
      var key = [p.text, o.kind, s, big, o.suffix, lab, gap, P.scheme].join('|');
      if (!MEAS[key]) {
        // canonical items (SPEC v0.2 §2.1): roles main / suffix / label. Each part is measured on its own by skipping the others.
        var GI = root.GameDNA_Skin.glyphItems ? root.GameDNA_Skin.glyphItems(p.text, o) : null;
        var roleOf = function (i) { if (GI) return (GI[i] || {}).role; var a = p.text.length, b = a + (o.suffix ? o.suffix.length : 0); return i < a ? 'main' : i < b ? 'suffix' : 'label'; };
        var cv = mk(512, 256), g = cv.getContext('2d');
        var run = function (keep) { g.clearRect(0, 0, 512, 256); return SK.number(g, p.text, 256, 160, Object.assign({ align: 'left', baseline: 'top', glyphOffset: function (i, it) { return keep(it && it.role ? it.role : roleOf(i), it && it.k != null ? it.k : 0) ? {} : { skip: true }; } }, o)) || []; };
        var u = function (list) { if (!list.length) return null; var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; list.forEach(function (r) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }); return { x: x0 - 256, y: y0 - 160, w: x1 - x0, h: y1 - y0 }; };
        var nb = u(run(function (r) { return r !== 'label'; })) || { x: 0, y: 0, w: 8, h: 10 }, lb = lab ? u(run(function (r) { return r === 'label'; })) : null;
        var nGlyph = p.text.length + (o.suffix ? o.suffix.length : 0), ldx = [];
        if (lab && lb) for (var k = 0; k < lab.length; k++) { var one = u(run(function (r, kk) { return r === 'label' && kk === k; })); ldx.push(one ? Math.max(0, one.x - lb.x) : 0); }   // letter offsets for the left-to-right label stagger
        MEAS[key] = { items: new Array(nGlyph), w: Math.ceil(nb.x + nb.w), h: Math.ceil(nb.y + nb.h),
          label: lab ? { text: lab, w: lb ? Math.ceil(lb.w) : 0, h: lb ? Math.max(0, Math.ceil(-lb.y) - gap) : 0, dx: ldx } : null };
      }
      return MEAS[key];
    }
    function layout(p) {
      if (SK) return skinLayout(p);
      var s = scaleOf(p), b = critBig(p) ? Math.min(s + 1, 2) : s, items = [], x = 0, i, ch, r;
      if (/^[0-9+]+$/.test(p.text)) {
        for (i = 0; i < p.text.length; i++) { ch = p.text[i]; r = D10[ch]; items.push({ font: 'digit', ch: ch, x: x, s: b, w: r[0].length * b, h: 10 * b }); x += (r[0].length + 1) * b; }
        x -= b;
        if (p.suffix) { x += 2 * s; for (i = 0; i < p.suffix.length; i++) { ch = p.suffix[i]; r = boldRows(ch); items.push({ font: 'bold', ch: ch, x: x, s: s, w: r[0].length * s, h: 7 * s }); x += (r[0].length + 1) * s; } x -= s; }
      } else {
        for (i = 0; i < p.text.length; i++) { ch = p.text[i]; r = boldRows(ch); items.push({ font: 'bold', ch: ch, x: x, s: s, w: r[0].length * s, h: 7 * s }); x += (r[0].length + 1) * s; }
        x -= s;
      }
      var h = 0; items.forEach(function (it) { h = Math.max(h, it.h); }); items.forEach(function (it) { it.y = h - it.h; });   // bottom-aligned (the MP suffix sits on the digits' baseline)
      var label = p.kind === 'crit' && P.crit !== 'plain' ? { text: 'CRITICAL', w: textW('CRITICAL'), h: 7 } : null;
      return { items: items, w: x, h: h, label: label };
    }
    // the CRITICAL label types in after the digits' first bounce and ends with them, so a number's life is its digits' life
    function life(p, L) { return durOf(p) + (L.items.length - 1) * stag(p); }
    // occupied box: glyphs + label + 4px side margins + headroom (bounce + 5 while bouncing, 5 once settled)
    function box(p, L, cx, by, settled) { var lh = L.label ? L.label.h + labelGap(p) : 0, hb = settled ? 5 : Math.ceil(bounceH(p)) + 5, bw = Math.max(L.w, L.label ? L.label.w : 0); return { x: Math.round(cx - bw / 2) - 4, y: by - L.h - lh - hb - 2, w: bw + 8, h: L.h + lh + hb + 4 }; }   // as wide as the CRITICAL label when it is wider
    // anchors are cached per target id: a dying or removed unit keeps its last known spot (killing-blow numbers stay above it)
    function valid(a) { return a && isFinite(a.x) && isFinite(a.top) ? { x: +a.x, top: +a.top, w: +a.w || 16, h: +a.h || 24 } : null; }
    function fetch(id) {
      var a = null; try { a = opt.getAnchor ? valid(opt.getAnchor(id)) : null; } catch (e) { a = null; }
      if (a) cache[id] = a;
      return a || cache[id] || null;
    }
    function anchor(p) { var a = fetch(p.tgt); if (a) p.last = a; return p.last; }
    function anchorXY(p) { var a = anchor(p); return [a.x, a.top - +P.gap]; }
    function fit(p, L, cx, by) { var b = B(), r = box(p, L, cx, by); cx += Math.max(0, b.x + 2 - r.x) - Math.max(0, r.x + r.w - (b.x + b.w - 2)); by += Math.max(0, b.y + 2 - r.y) - Math.max(0, by + 2 - (b.y + b.h - 2)); return [cx, by]; }
    function pos(p, L) { var a = anchorXY(p); return fit(p, L, a[0] + p.ox, a[1] + p.oy); }
    function liveBox(q) { var L = layout(q), xy = pos(q, L), settled = t - q.born > durOf(q) * 0.41 + (L.items.length - 1) * stag(q); return box(q, L, xy[0], xy[1], settled); }
    function obstacles(p, ownOK) {
      var list = []; try { list = (opt.getObstacles && opt.getObstacles()) || []; } catch (e) { list = []; }
      var hard = [], sprites = [], soft = [], units = [];
      var all = list.filter(function (o) { return o && isFinite(o.x); });
      list.forEach(function (o) {
        if (!o || !isFinite(o.x)) return;
        if (o.soft) soft.push(o);
        else if (o.id != null) {
          if (o.id === p.tgt) { if (!ownOK) sprites.push(o); }
          else { var fp = { x: o.x - 1, y: o.y - 1, w: o.w + 2, h: o.h + (o.w <= 20 && o.h <= 24 ? 2 : 9) };   /* small (tile) units keep their bar inside; bigger ones get a bar band below */ sprites.push(fp); units.push(fp); if (!ownOK) sprites.push({ x: o.x - 1, y: o.y - 40, w: o.w + 2, h: 40 }); }   // claim zones do not apply inside the target's own spot   // a unit's footprint includes an HP-bar band below it; the column above its head is theirs
        }
        else hard.push(o);
      });
      return { hard: hard, sprites: sprites, soft: soft, all: all, units: units };
    }
    // dense grids (tile-sized units standing next to each other): search a much smaller radius around the target
    function isDense(p, tb, O) {
      if (P.dense === 'on') return true; if (P.dense === 'off') return false;
      if (tb.w > 20 || tb.h > 24) return false;
      var cx = tb.x, cy = tb.top + tb.h / 2, R = 1.6 * Math.max(tb.w, tb.h);
      return O.all.some(function (o) { return o.id != null && o.id !== p.tgt && Math.abs(o.x + o.w / 2 - cx) < R && Math.abs(o.y + o.h / 2 - cy) < R; });
    }
    // best offset around the anchor: pops/UI hard (x1000), sprites and claim zones (x2000), soft props x1.
    // ownOK: the target's own sprite is not an obstacle and spots inside its own box are tried (last-resort fallback).
    function place(p, blockers, column, ownOK, wide, only) {
      var L = layout(p), a = anchorXY(p), ax = a[0], ay = a[1], tb = anchor(p), sc1 = scaleOf(p), O = obstacles(p, ownOK), hard = blockers.concat(O.hard);
      var crowd = isDense(p, tb, O), dense = !wide && crowd, MAXX = (dense ? 6 : 26) * sc1 + tb.w / 2, MAXUP = (dense ? 20 : 36) * sc1;
      var r0 = box(p, L, 0, 0), hx = Math.ceil(r0.w / 2), dy = Math.round((r0.h - 4) * 0.5), C = [], kk, m, best = null;
      var cols = column ? [0] : dense ? [0, 1, -1] : [0, 1, -1, 2, -2];
      for (kk = 0; kk <= 6; kk++) for (m = 0; m < cols.length; m++) C.push([cols[m] * hx, -kk * dy]);
      if (!column && !dense) [1, -1].forEach(function (sd) { [0.15, 0.4].forEach(function (f) { C.push([sd * (tb.w / 2 + L.w / 2 + 5), Math.round(tb.h * f)]); }); });
      if (ownOK) for (kk = 2; kk <= tb.h + +P.gap + 2; kk += 2) C.push([0, kk]);
      if (ownOK) [1, -1].forEach(function (sd) { for (kk = 4; kk <= tb.h + +P.gap; kk += 4) C.push([sd * (tb.w / 2 + L.w / 2 + 3), kk]); });   // or right beside its own body   // down into the target's own sprite/tile
      if (only) C = [only];
      C.forEach(function (c) {
        var xy = fit(p, L, ax + c[0], ay + c[1]), x = xy[0], y = xy[1], r = box(p, L, x, y);
        if (!only && (Math.abs(x - ax) > MAXX || ay - y > MAXUP || y - ay > tb.h + +P.gap + 2)) return;
        var hb = ownOK || !crowd ? 0 : Math.ceil(bounceH(p)), lbl = L.label ? L.label.h + labelGap(p) : 0, g = { x: r.x + 2, y: y - L.h - lbl - hb, w: r.w - 4, h: L.h + lbl + (ownOK ? 0 : 2) + hb }   /* at its own spot the glyph may sit flush between two units */, ho = 0, so = 0, lo = 0;   // glyphs incl. outline and drop (and the bounce in dense grids)
        hard.forEach(function (o) { ho += overlap(r, o); }); O.sprites.forEach(function (o) { so += overlap(g, o); }); O.soft.forEach(function (o) { lo += overlap(g, o); });
        // the settled number must be closer to its own unit than to any other unit (otherwise it reads as theirs)
        var gcx = x, gcy = y - L.h / 2, own = { x: tb.x - tb.w / 2, y: tb.top, w: tb.w, h: tb.h }, dOwn = rdist(gcx, gcy, own);
        O.units.forEach(function (u) { var d = rdist(gcx, gcy, u); if (d < dOwn + 2) so += 50 * (dOwn + 2 - d) + 50; });   // 2px safety margin
        if (ownOK) lo += dOwn * 3;   // at its own spot: as deep into its own box as possible
        var sc = ho * (ownOK === true ? 10 : 1000) + so * 2000 + lo + Math.abs(x - ax) * 2.5 + Math.abs(y - ay) * 0.8;   // at its own spot a number may sit under a banner rather than drift toward a neighbour
        if (!best || sc < best.sc) best = { ox: x - ax, oy: y - ay, sc: sc, ho: ho, so: so };
      });
      best = best || { ox: 0, oy: 0, sc: Infinity, ho: 1, so: 1 };
      // dense grids prefer the tight radius; if nothing is free there, look at the normal radius before any fallback
      if (dense && !ownOK && !only && !(best.ho === 0 && best.so === 0)) { var b2 = place(p, blockers, column, false, true); if (b2.ho === 0 && b2.so === 0) return b2; }
      return best;
    }
    // last resort, still on the hit frame: 1x, then the target's own spot (its own sprite may be covered, never a neighbour);
    // same-target numbers in the way move or vanish, other targets' numbers block
    function ownSpot(p, otherBoxes, strict) {
      if (+P.scale > 1) p.small = true;
      var b = place(p, otherBoxes, false, strict ? 'strict' : true), L = layout(p), a = anchorXY(p), O = obstacles(p, true);
      if (!(b.ho === 0 && b.so === 0)) { var bw = place(p, otherBoxes, false, strict ? 'strict' : true, true); if (bw.sc < b.sc) b = bw; }
      // the bounce may not rise into a neighbour above: cap it to the free space
      var LW = Math.max(L.w, L.label ? L.label.w : 0), gx = a[0] + b.ox - LW / 2 - 2, gw = LW + 4, top = a[1] + b.oy - L.h - (L.label ? L.label.h + labelGap(p) : 0) - 2, free = +P.bounce;   // top of the label if there is one
      O.sprites.forEach(function (o) { if (o.x < gx + gw && o.x + o.w > gx && o.y < top) free = Math.min(free, Math.max(0, top - (o.y + o.h))); });   // anything above it, even touching
      p.hcap = Math.max(0, Math.min(p.hcap == null ? free : p.hcap, free));
      return b;
    }
    function emit(info) { if (typeof opt.debug === 'function') try { opt.debug(info); } catch (e) {} }
    // removing a number before its time is a failure (every HP change must be readable); report it
    // instead of deleting a number that lost its spot: hide it and show it again (full life) as soon as there is room
    function requeue(q, why) {
      if (t - q.born >= 0.6 * life(q, layout(q))) { q.gone = true; emit({ event: 'retire', why: why, target: q.tgt, text: q.text, age: t - q.born }); return; }   // already read: it may end early
      q.gone = true; waiting.push({ target: q.tgt, kind: q.kind, text: q.text, suffix: q.suffix, since: t, fresh: false, again: true }); emit({ event: 'requeue', why: why, target: q.tgt, text: q.text, age: t - q.born }); }
    // a same-target number in the way: damage folds into the newcomer's total, anything else moves (or waits to come back)
    function yieldTo(q, keeper, blockers) {
      if ((q.kind === 'dmg' || q.kind === 'crit') && (keeper.kind === 'dmg' || keeper.kind === 'crit') && q.tgt === keeper.tgt) { keeper.text = String(+keeper.text + +q.text); keeper.merged = true; if (q.kind === 'crit') keeper.kind = 'crit'; q.gone = true; emit({ event: 'fold', target: q.tgt, text: q.text }); return; }
      displace(q, blockers);
    }
    function drop(q, why) { q.gone = true; emit({ event: 'drop', why: why, target: q.tgt, text: q.text, age: t - q.born, life: life(q, layout(q)) }); }
    var legal = function (b) { return b.ho === 0 && b.so === 0; };
    // move an older pop out of the way: another legal spot, else 1x, else remove it on this frame (never lingers underneath)
    function displace(q, blockers) {
      var b = place(q, blockers);
      if (legal(b)) { q.ox = b.ox; q.oy = b.oy; return; }
      if (+P.scale > 1 && !q.small) { q.small = true; b = place(q, blockers); if (legal(b)) { q.ox = b.ox; q.oy = b.oy; return; } q.small = false; }
      var hc = q.hcap, sm = q.small; b = ownSpot(q, blockers, true);   // its own spot, but clear of other numbers
      if (b.ho === 0 && b.so === 0) { q.ox = b.ox; q.oy = b.oy; return; }
      q.hcap = hc; q.small = sm; requeue(q, 'displaced');
    }
    function visible() { return pops.filter(function (q) { return !q.gone && t - q.born < life(q, layout(q)); }); }
    function boxes(list) { return list.filter(function (q) { return !q.gone; }).map(liveBox); }
    // returns the pop, or null when it must wait for room
    function tryPlace(w) {
      var p = { kind: w.kind, text: w.text, suffix: w.suffix, born: t, id: seq++, tgt: w.target, ox: 0, oy: 0, fresh: w.fresh, last: fetch(w.target) };
      var L0 = layout(p), room = anchorXY(p)[1] - B().y - L0.h - (L0.label ? L0.label.h + labelGap(p) : 0) - 11;
      if (bounceH(p) > room) p.hcap = Math.max(4, room);   // near the top: shrink the bounce instead of pushing the number onto its target
      var path = 'free';
      if (P.stack === 'on') {
        var live = visible(), best = place(p, boxes(live)), others = function (ex) { return boxes(live.filter(function (o) { return ex.indexOf(o) < 0; })); };
        var colSpot = p.kind === 'crit' ? place(p, [], true) : null;
        if (colSpot && colSpot.so === 0 && !(legal(best) && best.ox === 0)) {
          path = 'crit-column'; var own = colSpot, mine; p.ox = own.ox; p.oy = own.oy; mine = liveBox(p);
          live.filter(function (q) { return overlap(liveBox(q), mine) > 0; }).forEach(function (q) { displace(q, others([q]).concat([mine])); });
          best = null;
        }
        if (best && !legal(best)) {
          // 1) fold a combo hit into the same target's number closest to its head (same target only); the total stays at that target
          var fold = (p.kind === 'dmg' || p.kind === 'crit') ? live.filter(function (q) { return q.tgt === p.tgt && (q.kind === 'dmg' || q.kind === 'crit'); })
            .sort(function (a, b) { return Math.abs(a.oy) + Math.abs(a.ox) - Math.abs(b.oy) - Math.abs(b.ox); })[0] : null;
          if (fold) {
            path = 'fold';
            fold.text = String(+fold.text + +p.text); fold.born = t; fold.merged = true; if (p.kind === 'crit') fold.kind = 'crit';
            var rest = others([fold]);
            if (rest.some(function (o) { return overlap(liveBox(fold), o) > 0; })) {
              var b2 = place(fold, rest);
              if (!legal(b2)) b2 = ownSpot(fold, boxes(live.filter(function (o) { return o !== fold && o.tgt !== fold.tgt; })));
              fold.ox = b2.ox; fold.oy = b2.oy;
              var fb = liveBox(fold); live.filter(function (o) { return o !== fold && o.tgt === fold.tgt && !o.gone && overlap(liveBox(o), fb) > 0; }).forEach(function (o) { yieldTo(o, fold, others([o, fold]).concat([fb])); });
            }
            return fold;
          }
          // 2) one size smaller
          if (+P.scale > 1) { p.small = true; var b3 = place(p, boxes(live)); if (legal(b3)) { best = b3; path = 'small'; } else p.small = false; }
          // 3) newest wins, but a same-target number younger than half its life is never evicted: wait instead (max 900 ms)
          if (!legal(best)) {
            var b4 = place(p, boxes(live.filter(function (q) { return q.tgt !== p.tgt; })));
            if (b4.so === 0) {
              var r4 = liveBox({ kind: p.kind, text: p.text, suffix: p.suffix, born: t, tgt: p.tgt, ox: b4.ox, oy: b4.oy, small: p.small, hcap: p.hcap, last: p.last });
              if (live.some(function (q) { return q.tgt === p.tgt && overlap(liveBox(q), r4) > 0 && t - q.born < durOf(q) * 0.5; }) && t - w.since < 900) return null;
              best = b4; path = 'newest-wins'; p.ox = b4.ox; p.oy = b4.oy; var m4 = liveBox(p);
              live.filter(function (q) { return q.tgt === p.tgt && overlap(liveBox(q), m4) > 0; }).forEach(function (q) { displace(q, others([q]).concat([m4])); });
            }
          }
        }
        if (best && !legal(best)) {
          // 4) no free spot. Only a young number of the SAME target may delay it (max 900 ms); otherwise draw now at the
          //    target's own spot (its own sprite may be covered, never a neighbour); same-target numbers there vanish
          if (live.some(function (q) { return q.tgt === p.tgt && t - q.born < durOf(q) * 0.5; }) && t - w.since < 900) return null;
          path = 'own-spot'; best = ownSpot(p, []); var ownOk = best.so === 0;
          p.ox = best.ox; p.oy = best.oy; var m5 = liveBox(p);
          // newest wins at its own spot: same-target numbers there vanish, other targets' numbers move away (or vanish)
          live.filter(function (q) { return !q.gone && overlap(liveBox(q), m5) > 0; }).forEach(function (q) { if (q.tgt === p.tgt) yieldTo(q, p, others([q]).concat([m5])); else displace(q, others([q]).concat([m5])); });
          best = null;
        }
        if (best) { p.ox = best.ox; p.oy = best.oy; }
      }
      p.ok = path === 'own-spot' ? ownOk : !best || legal(best);
      if (typeof opt.debug === 'function') try { opt.debug({ target: p.tgt, text: p.text, path: path, ox: p.ox, oy: p.oy, hcap: p.hcap, small: !!p.small, anchor: p.last }); } catch (e) {}
      pops.push(p); return p;
    }
    function safeAnchor(id) { try { return opt.getAnchor ? opt.getAnchor(id) : null; } catch (e) { return null; } }
    function flushWaiting() { waiting = waiting.filter(function (w) { return !tryPlace(w); }); }

    function spawn(targetId, amount, kind, opts) {
      var kd = KIND[kind] || 'dmg', text, suffix = null, given = opts && valid(opts.anchor);
      if (given && !valid(safeAnchor(targetId))) cache[targetId] = given;
      if (!fetch(targetId)) {
        if (!warned && root.console) { warned = true; console.warn('GameDNA_DamageNumbers: no anchor for target "' + targetId + '" - keep returning a unit\'s position from getAnchor while it is dying or dead, or pass spawn(id, amount, kind, {anchor}). Number skipped.'); }
        emit({ event: 'skip', why: 'no-anchor', target: targetId }); return;
      }
      var n = Math.max(0, Math.round(Math.abs(+amount || 0)));
      if (kd === 'miss') text = 'MISS';
      else if (kd === 'status') text = String(amount == null ? '' : amount).toUpperCase().replace(/[^A-Z !?-]/g, '') || 'STATUS';
      else if (kd === 'heal') text = '+' + n;          // the sign goes first
      else { text = String(n); if (kd === 'mp') suffix = 'MP'; }
      var w = { target: targetId, kind: kd, text: text, suffix: suffix, since: t, fresh: true };
      if (waiting.length || !tryPlace(w)) waiting.push(w);   // keep order behind earlier waiting pops
      if (kd === 'dmg' || kd === 'crit') { var hs = +P.hitstop * (kd === 'crit' ? 2 : 1); if (hs > 0) call('onHitStop', hs); }
      if (kd === 'crit' && P.crit === 'burst') call('onShake', 2, 200);
      if (kd === 'crit' && P.crit !== 'plain') call('onFlash', 0.35, 100);
    }
    function update(dt) {
      dt = +dt; if (!(dt > 0)) dt = 0;
      t += dt;
      if (waiting.length) flushWaiting();
      pops.forEach(function (q) { q.fresh = false; }); waiting.forEach(function (w) { w.fresh = false; });
      // remember every live unit's spot each frame, so a unit that dies on its first hit still has an anchor
      var obs = []; try { obs = (opt.getObstacles && opt.getObstacles()) || []; } catch (e) { obs = []; }
      var seen = {};
      obs.forEach(function (o) { if (!o || o.id == null || seen[o.id] || !isFinite(o.x)) return; seen[o.id] = 1; if (!fetch(o.id)) cache[o.id] = { x: o.x + o.w / 2, top: o.y, w: o.w, h: o.h }; });
      pops = pops.filter(function (q) { return !q.gone && t - q.born < life(q, layout(q)); });
      if (P.stack === 'on' && pops.length) revalidate();
    }
    // units move (dashes, walking, knock-back): a number that now covers a neighbour or sits nearer to one moves again
    function revalidate() {
      var live = visible();
      live.forEach(function (q) {
        if (q.gone) return;
        var rest = boxes(live.filter(function (o) { return o !== q; })), now = place(q, rest, false, 'strict', true, [q.ox, q.oy]);   // same test as its own spot: its own sprite is fine, neighbours and other numbers are not
        if (now.so === 0) return;
        var b = place(q, rest);
        if (!legal(b)) b = ownSpot(q, []);
        if (b.so > 0) { if (q.ok !== false) requeue(q, 'walked-on'); return; }   // a number that never had a clean spot stays put   // nowhere clear any more (a unit walked onto it): hide it, show it again when there is room
        q.ox = b.ox; q.oy = b.oy; q.ok = true;
      });
    }
    function draw(ctx, offX, offY) {
      if (!ctx) return;
      offX = offX || 0; offY = offY || 0; drawn = [];
      var SC = SCHEMES[P.scheme] || SCHEMES.classic, o = P.scheme === 'contrast' ? 2 : Math.max(1, Math.min(2, +P.outline || 1));
      var prevAlpha = ctx.globalAlpha, prevSmooth = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      pops.forEach(function (p) {
        if (p.gone) return;
        var L = layout(p), age = t - p.born, D = durOf(p), st = stag(p), H = bounceH(p);
        if (age < 0 || age >= life(p, L)) return;
        if (SK) { drawSkin(ctx, p, L, age, D, st, H, offX, offY, o); return; }
        var xy = pos(p, L), x0 = Math.round(xy[0] - L.w / 2) + offX, y0 = xy[1] - L.h + offY, R = SC[p.kind] || SC.dmg, big = critBig(p), s1 = scaleOf(p);
        var gl = L.items.map(function (it, i) { return { it: it, a: age - i * st }; });
        if (L.label) {
          var lx = Math.round((L.w - L.label.w) / 2), x = lx, base = (L.items.length - 1) * st + D * 0.25, endT = (L.items.length - 1) * st + D;
          for (var i = 0; i < L.label.text.length; i++) { var ch = L.label.text[i], t0 = base + (x - lx) * 3; gl.push({ it: { font: 'letter', ch: ch, x: x, y: -L.label.h - labelGap(p), s: 1, lab: 1 }, a: age - t0, Dl: endT - t0 }); x += letterRows(ch)[0].length + 1; }
        }
        ['ol', 'fill'].forEach(function (pass) {
          gl.forEach(function (gg) {
            var a = gg.a, it = gg.it, DD = gg.Dl || D; if (a < 0 || a >= DD) return;
            var y = bounceY(a, DD, it.lab ? Math.min(6, H * 0.45) : H, p.hcap != null ? Math.min(4, p.hcap) : 4);
            var j = !it.lab && big && a < 320 ? [[1, 0], [-1, 0], [0, -1], [1, 1], [-1, 0], [0, 1]][Math.floor(a / 33) % 6] : [0, 0];
            var flash = p.kind === 'crit' && P.crit !== 'plain' && a < 120 && Math.floor(a / 40) % 2 === 0;
            var img = glyph(it.font, it.ch, it.s, flash ? FLASH : R, SC.ol, o);
            ctx.globalAlpha = it.lab ? fadeA(age - (L.items.length - 1) * st, D) : fadeA(a, D);   // the label fades with the last digit
            ctx.drawImage(img[pass], x0 + it.x - o + j[0] * s1, y0 + it.y + y - o + j[1] * s1);
            if (pass === 'fill') drawn.push({ pop: p.id, target: p.tgt, text: p.text, x: x0 + it.x + j[0] * s1, y: y0 + it.y + y + j[1] * s1, w: img.w, h: img.h });
          });
        });
      });
      ctx.globalAlpha = prevAlpha; ctx.imageSmoothingEnabled = prevSmooth;
    }
    // the same animation, handed to the skin per glyph: bounce/stagger (dy), crit jitter (dx), stepped fade, white flash, landing squash
    function drawSkin(ctx, p, L, age, D, st, H, offX, offY, o) {
      var xy = pos(p, L), x0 = Math.round(xy[0] - L.w / 2) + offX, y0 = xy[1] - L.h + offY, big = critBig(p), s1 = scaleOf(p), n = L.items.length;
      var base = (n - 1) * st + D * 0.25, M = SK.motion || {}, SQ = M.squash, smooth = !M.fadeSteps;
      var R = SK.number(ctx, p.text, x0, y0, {
        kind: SKIND[p.kind] || 'damage', scheme: P.scheme, scale: s1, big: big, suffix: p.suffix || null, label: L.label ? L.label.text : null,
        labelGap: labelGap(p), outline: o, align: 'left', baseline: 'top', age: age, life: life(p, L),   // SPEC v0.2+: per-number age/life (ms) for skin effects
        glyphOffset: function (i, it) {
          var lab = it && it.role ? it.role === 'label' : i >= n, t0 = lab ? base + ((L.label && L.label.dx[it && it.k != null ? it.k : i - n]) || 0) * 3 : i * st, a = age - t0;   // roles from the canonical items; the label's letters follow left to right
          var DD = lab ? (n - 1) * st + D - t0 : D;   // the label ends with the digits
          if (a < 0 || a >= DD) return { skip: true };
          var y = bounceY(a, DD, lab ? Math.min(6, H * 0.45) : H, p.hcap != null ? Math.min(4, p.hcap) : 4);
          var j = !lab && big && a < 320 ? [[1, 0], [-1, 0], [0, -1], [1, 1], [-1, 0], [0, 1]][Math.floor(a / 33) % 6] : [0, 0];
          var af = lab ? age - (n - 1) * st : a, s = af / D, al = smooth ? (s < 0.78 ? 1 : Math.max(0, 1 - (s - 0.78) / 0.22)) : fadeA(af, D);   // the label fades with the last digit
          var r = { dx: j[0] * s1, dy: y + j[1] * s1, alpha: al, flash: p.kind === 'crit' && P.crit !== 'plain' && a < 120 && Math.floor(a / 40) % 2 === 0 };
          if (SQ && !lab && H >= 2 && a >= 0.2 * D && a < 0.2 * D + (SQ.ms || 70)) { r.sx = SQ.x; r.sy = SQ.y; }   // squash on landing (smooth skins)
          return r;
        }
      }) || [];
      R.forEach(function (r) { drawn.push({ pop: p.id, target: p.tgt, text: p.text, x: r.x, y: r.y, w: r.w, h: r.h }); });
    }
    return {
      spawn: spawn, update: update, draw: draw,
      setParams: function (o) { set(o); }, params: P,
      // call at battle/wave start; numbers spawned since the last update() (e.g. a wave-clear refill in the same frame) survive
      clear: function () { pops = pops.filter(function (q) { return q.fresh; }); waiting = waiting.filter(function (w) { return w.fresh; }); },
      count: function () { return pops.length + waiting.length; },
      lastDrawn: function () { return drawn.slice(); }   // glyph rects of the last draw (for tests)
    };
  }
  root.GameDNA_DamageNumbers = { create: create, DEFAULTS: DEFAULTS, version: '1.1.0' };
})(typeof window !== 'undefined' ? window : this);
