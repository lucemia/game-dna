/* GameDNA C-11 · Modern damage numbers (damage-pop) · module v1.1 (plain script, no dependencies, one global)
 *
 *   const dp = GameDNA_DamagePop.create({
 *     bounds: { x: 0, y: 0, w: 640, h: 360 },     // play field in native (logical) px; numbers stay inside it
 *     getAnchor: id => ({ x, top, w, h }),        // target centre x, top of its sprite, sprite size (keep answering for dead units)
 *     getObstacles: () => [{ x, y, w, h, id }],   // sprites (with id), UI rects (no id), props ({ soft: true })
 *     params: { size: 0, merge: 600, ... },       // see DEFAULTS
 *     onHitStop: ms => {}, onShake: (px, ms) => {}, onFlash: (alpha, ms) => {}
 *   });
 *   dp.spawn(targetId, amount, kind, { type, crit })   // kind: damage | crit | heal | miss | block | dodge | immune | shield | mp | status
 *   dp.update(dtMs)                                    // world time; 0 while hit-stop freezes the world
 *   dp.draw(ctx, offsetX, offsetY)                     // after sprites and effects, before banner/HUD
 *
 * 2020s damage numbers: crits pop with a scale overshoot, a burst and a short shake; numbers arc out on a little
 * parabola and land; rapid hits on one target merge into one rolling total that punches on every add; colour and a
 * small procedural icon per damage type; bold sans with outline and soft drop shadow (smooth on HD canvases, a crisp
 * 1-bit raster on native pixel canvases); small words for misses and blocks; big numbers always drawn above small ones;
 * placement that never covers another unit, UI rects or another number (the E-01 placement rules, scaled to the size).
 * A number already on screen never jumps: it glides to a new slot, or re-pops there when the way would cross another number.
 * Everything is a function of the game time passed to update(): ?t=&freeze=1 screenshots are deterministic.
 */
(function (root) {
  'use strict';
  var DEFAULTS = { size: 0, duration: 1100, arc: 1, punch: 0.6, merge: 600, palette: 'vivid', icons: 'on', hitstop: 50, render: 'auto', stack: 'on', crit: 'burst', gap: 0, dense: 'auto' };
  var FAMILY = '"Inter", "Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  var TYPES = { physical: 1, fire: 1, ice: 1, shock: 1, poison: 1, arcane: 1, heal: 1, shield: 1, mana: 1 };
  var WORDS = { miss: 'MISS', block: 'BLOCK', dodge: 'DODGE', immune: 'IMMUNE', resist: 'RESIST', parry: 'PARRY', evade: 'EVADE' };

  /* ---------- palettes: top / bottom of the fill, outline, icon accent ---------- */
  var PAL = {
    vivid: {
      physical: ['#ffffff', '#dfe5f3', '#17131f'], fire: ['#ffe9a6', '#ff6a2b', '#3a0c04'], ice: ['#f2fdff', '#5fcdff', '#08213a'],
      shock: ['#fffbd2', '#ffd52a', '#2c2105'], poison: ['#eaffbc', '#6fcf3f', '#0f2609'], arcane: ['#f6e6ff', '#ad68ff', '#1f0b3a'],
      heal: ['#e4ffea', '#2fd96c', '#06281a'], shield: ['#f5f8ff', '#a3b6dc', '#141c33'], mana: ['#e2f1ff', '#4799ff', '#08173a'],
      crit: ['#fff7cc', '#ffab1c', '#3a1203'], word: ['#ffffff', '#c6cbdc', '#17131f'], block: ['#eef4ff', '#8badea', '#101a33'], status: ['#f4e4ff', '#bd86ff', '#1f0b3a']
    },
    soft: {
      physical: ['#fffdf8', '#e9e2d6', '#2a2430'], fire: ['#ffe2c4', '#f08a5d', '#3d1a12'], ice: ['#eefaff', '#8fd3ee', '#13304a'],
      shock: ['#fff9dc', '#f2d36b', '#3a2f12'], poison: ['#f0ffd8', '#9cd27a', '#1d3317'], arcane: ['#f5eaff', '#c39af0', '#2c1a45'],
      heal: ['#eafff0', '#7fdc9e', '#12382a'], shield: ['#f7f9ff', '#bac6e0', '#232a40'], mana: ['#eaf4ff', '#82b6f2', '#142648'],
      crit: ['#fff6dc', '#f7b955', '#43220c'], word: ['#ffffff', '#d7d3dc', '#2a2430'], block: ['#f2f6ff', '#a9bfe6', '#1d2740'], status: ['#f7eeff', '#cba7f2', '#2c1a45']
    },
    mono: {}
  };
  (function () { var k; for (k in PAL.vivid) PAL.mono[k] = k === 'crit' ? ['#ffffff', '#ffe3a0', '#120e18'] : k === 'heal' ? ['#ffffff', '#c9f5d6', '#120e18'] : ['#ffffff', '#d4d8e4', '#120e18']; })();
  var ICONCOL = { physical: ['#ffffff', '#aeb8cc'], fire: ['#ffe28a', '#ff4d1a'], ice: ['#ffffff', '#58c8ff'], shock: ['#fff6b0', '#ffc81a'], poison: ['#d8ff9a', '#4fb52a'],
    arcane: ['#ffffff', '#a45cff'], heal: ['#ffd0dc', '#ff4f7a'], shield: ['#ffffff', '#93a8d4'], mana: ['#d8eeff', '#3a8cff'] };

  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function hash(a, b) { var h = Math.imul((a | 0) * 374761393 + (b | 0) * 668265263, 3266489917); h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var easeOut = function (u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u) * (1 - u); };
  var easeIn = function (u) { u = clamp(u, 0, 1); return u * u; };
  function overlap(a, b) { var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; }
  function rdist(px, py, r) { return Math.hypot(Math.max(r.x - px, 0, px - (r.x + r.w)), Math.max(r.y - py, 0, py - (r.y + r.h))); }
  function devScale(ctx) { try { var m = ctx.getTransform(); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; } catch (e) { return 1; } }
  // pop-in scale: from 0.35 to `peak` at tPeak (ease-out), then a damped spring back to 1 by tEnd
  function popScale(a, peak, tPeak, tEnd) {
    if (a <= 0) return 0.35;
    if (a < tPeak) return 0.35 + (peak - 0.35) * easeOut(a / tPeak);
    var u = (a - tPeak) / (tEnd - tPeak); if (u >= 1) return 1;
    return 1 + (peak - 1) * Math.exp(-u * 3.2) * Math.cos(u * Math.PI * 1.5);
  }
  // merge punch envelope (0..1..0, a small overshoot back): every add to a rolling total
  function bump(a) { if (a < 0 || a > 260) return 0; if (a < 45) return easeOut(a / 45); var u = (a - 45) / 215; return Math.exp(-u * 4) * Math.cos(u * Math.PI * 1.4); }

  /* ---------- procedural type icons (drawn into a unit box centred on 0,0, radius r) ---------- */
  function iconPath(g, type, r) {
    g.beginPath();
    if (type === 'fire') {
      g.moveTo(0, -r); g.bezierCurveTo(r * 0.55, -r * 0.35, r * 0.95, r * 0.05, r * 0.72, r * 0.55); g.quadraticCurveTo(r * 0.45, r, 0, r);
      g.quadraticCurveTo(-r * 0.45, r, -r * 0.72, r * 0.55); g.bezierCurveTo(-r * 0.95, r * 0.05, -r * 0.35, -r * 0.2, -r * 0.1, -r * 0.55); g.quadraticCurveTo(-r * 0.05, -r * 0.8, 0, -r);
    } else if (type === 'ice') {
      g.moveTo(0, -r); g.lineTo(r * 0.62, -r * 0.35); g.lineTo(r * 0.62, r * 0.35); g.lineTo(0, r); g.lineTo(-r * 0.62, r * 0.35); g.lineTo(-r * 0.62, -r * 0.35);
    } else if (type === 'shock') {
      g.moveTo(r * 0.25, -r); g.lineTo(-r * 0.6, r * 0.12); g.lineTo(-r * 0.02, r * 0.12); g.lineTo(-r * 0.3, r); g.lineTo(r * 0.62, -r * 0.18); g.lineTo(r * 0.05, -r * 0.18); g.lineTo(r * 0.4, -r);
    } else if (type === 'poison' || type === 'mana') {
      g.moveTo(0, -r); g.bezierCurveTo(r * 0.35, -r * 0.45, r * 0.8, r * 0.05, r * 0.8, r * 0.35); g.arc(0, r * 0.32, r * 0.8, 0, Math.PI); g.bezierCurveTo(-r * 0.8, r * 0.05, -r * 0.35, -r * 0.45, 0, -r);
    } else if (type === 'arcane') {   // a crescent moon (a star would read as a heal '+')
      g.arc(0, 0, r, -0.2 * Math.PI, 0.7 * Math.PI, true); g.quadraticCurveTo(r * 0.25, r * 0.15, Math.cos(-0.2 * Math.PI) * r, Math.sin(-0.2 * Math.PI) * r);
    } else if (type === 'heal') {
      g.moveTo(0, r * 0.9); g.bezierCurveTo(-r * 1.15, r * 0.05, -r * 0.75, -r * 1.05, 0, -r * 0.45); g.bezierCurveTo(r * 0.75, -r * 1.05, r * 1.15, r * 0.05, 0, r * 0.9);
    } else if (type === 'shield') {
      g.moveTo(-r * 0.8, -r * 0.8); g.quadraticCurveTo(0, -r * 1.05, r * 0.8, -r * 0.8); g.lineTo(r * 0.8, -r * 0.1); g.quadraticCurveTo(r * 0.7, r * 0.65, 0, r); g.quadraticCurveTo(-r * 0.7, r * 0.65, -r * 0.8, -r * 0.1);
    } else {   // physical: a short blade with a cross-guard, diagonal
      var k = r * 0.24;
      g.moveTo(r * 0.95, -r * 0.95); g.lineTo(r * 0.55, -r * 0.2); g.lineTo(-r * 0.05, r * 0.4 - k); g.lineTo(r * 0.12, r * 0.55); g.lineTo(-r * 0.2, r * 0.72); g.lineTo(-r * 0.35, r * 0.58);
      g.lineTo(-r * 0.8, r * 1.0); g.lineTo(-r * 1.0, r * 0.8); g.lineTo(-r * 0.58, r * 0.35); g.lineTo(-r * 0.72, r * 0.2); g.lineTo(-r * 0.55, -r * 0.12); g.lineTo(-r * 0.4, r * 0.05 + k); g.lineTo(r * 0.2, -r * 0.55);
    }
    g.closePath();
  }

  function create(opt) {
    opt = opt || {};
    var P = {}, k0; for (k0 in DEFAULTS) P[k0] = DEFAULTS[k0]; set(opt.params);
    // skin (skins/skin-api.js): only where it makes sense for a modern number. A pixel skin turns on the crisp raster, a smooth
    // skin with a canvas number font lends its family, and palette 'skin' takes the colours from its fx/text tokens.
    var SK = null; try { SK = root.GameDNA_Skin && opt.skin !== false && opt.skin != null ? root.GameDNA_Skin.resolve(opt.skin) : null; } catch (e) { SK = null; }
    var lastCrisp = false, t = 0, pops = [], waiting = [], seq = 0, drawn = [], cache = {}, warned = false, lastView = null, alt = {}, RC = {}, rcN = 0, MC = {};
    var meas = mk(4, 4).getContext('2d');
    if (SK && root.GameDNA_Skin.ready) try { root.GameDNA_Skin.ready(SK).then(function () { RC = {}; rcN = 0; MC = {}; }); } catch (e) {}
    function set(o) { if (o) for (var key in o) if (key in DEFAULTS && o[key] != null) P[key] = typeof DEFAULTS[key] === 'number' ? +o[key] : String(o[key]); }
    function call(name) { var f = opt[name]; if (typeof f === 'function') try { f.apply(null, [].slice.call(arguments, 1)); } catch (e) { if (root.console) console.error(e); } }
    function emit(info) { if (typeof opt.debug === 'function') try { opt.debug(info); } catch (e) {} }
    function B() {
      var b = opt.bounds; if (typeof b === 'function') try { b = b(); } catch (e) { b = null; }
      if (b && isFinite(b.w) && b.w > 0) return { x: +b.x || 0, y: +b.y || 0, w: +b.w, h: +b.h };
      return lastView || { x: 0, y: 0, w: 256, h: 156 };
    }
    // base cap height of a normal number in native px; u = the E-01 pixel constants' unit (1 at 256 px wide)
    function SIZE() { return +P.size > 0 ? +P.size : clamp(Math.round(B().w / 34), 9, 32); }
    function U() { return SIZE() / 9; }
    function family() { try { var f = SK && !SK.pixel && SK.fonts && SK.fonts.num; if (f && f.type === 'canvas' && f.family) return f.family; } catch (e) {} return FAMILY; }
    function colours(type) {
      if (P.palette === 'skin' && SK) {
        var tk = function (p, d) { try { var v = SK.token(p); return typeof v === 'string' && v.charAt(0) === '#' ? v : d; } catch (e) { return d; } };
        var ol = tk('text.outline', '#17131f'), V = PAL.vivid[type] || PAL.vivid.physical;
        var m = { fire: 'fx.hot', ice: 'fx.cold', heal: 'fx.heal', crit: 'fx.crit', arcane: 'fx.status', status: 'fx.status', physical: 'text.main', word: 'text.dim' }[type];
        return [V[0], m ? tk(m, V[1]) : V[1], ol];
      }
      var pal = PAL[P.palette] || PAL.vivid; return pal[type] || pal.physical;
    }

    /* ---------- the pop's look: what it shows and how big ---------- */
    function styleOf(p) {
      if (p.word) return { col: p.word === 'BLOCK' || p.word === 'PARRY' ? 'block' : p.kind === 'status' ? 'status' : 'word', icon: null, k: 0.64 * (p.small ? 0.8 : 1) };
      var col = p.crit ? (p.type === 'physical' ? 'crit' : p.type) : p.type;
      return { col: col, icon: P.icons === 'off' || p.type === 'physical' ? null : p.type, k: (p.crit ? 1.45 : 1) * (p.small ? 0.78 : 1) };
    }
    function textOf(p, v) {
      if (p.word) return p.word;
      var s = String(Math.max(0, Math.round(v)));
      if (p.type === 'heal' || p.gain) s = '+' + s;   // the sign goes first
      if (P.icons === 'off' && p.type === 'mana') s += ' MP';
      return s;
    }
    function shownValue(p) { if (p.word) return 0; var a = t - p.rollT, R = 150; return a >= R ? p.value : p.from + (p.value - p.from) * easeOut(a / R); }
    function textW(str, fs) { var key = str + '|' + fs; if (MC[key] != null) return MC[key]; meas.font = '800 ' + fs + 'px ' + family(); var w = meas.measureText(str).width; if (Object.keys(MC).length > 600) MC = {}; return (MC[key] = w); }
    // glyph box (native px) of a text at cap height cap, icon included, outline included
    function metrics(str, cap, icon) {
      var fs = cap / 0.72, ol = Math.max(1, Math.round(cap * 0.12)), iw = icon ? Math.round(cap * 1.05) : 0, gap = icon ? Math.max(1, Math.round(cap * 0.18)) : 0;
      return { fs: fs, cap: cap, ol: ol, iw: iw, gap: gap, tw: textW(str, fs), w: Math.ceil(iw + gap + textW(str, fs) + 2 * ol), h: Math.ceil(cap + 2 * ol) };
    }
    function capOf(p) { return Math.max(6, Math.round(SIZE() * styleOf(p).k)); }
    // layout for placement: the widest text this pop shows (a rolling total is laid out at its final value)
    function layout(p) { var st = styleOf(p); return metrics(textOf(p, p.word ? 0 : p.value), capOf(p), st.icon); }

    /* ---------- timing ---------- */
    var D = function () { return Math.max(300, +P.duration); };
    function life(p) { return (p.lastAdd - p.born) + D() * (p.crit ? 1.15 : 1); }
    var ARC_MS = 300;
    function young(p) { return t - p.born < ARC_MS + 120 || t - p.punchT < 260; }
    function arcH(p) { return SIZE() * 0.9 * Math.max(0, +P.arc) * (p.crit ? 0.4 : p.word ? 0.6 : 1); }
    function spread(p) { return p.crit ? 0 : SIZE() * 0.55 * Math.max(0, +P.arc); }
    function peak(p) { var pu = Math.max(0, +P.punch); return 1 + pu * (p.crit ? 1 : p.word ? 0.25 : 0.4); }
    var gapPx = function () { return +P.gap > 0 ? +P.gap : Math.round(4 * U()); };

    /* ---------- occupied box (E-01 rules, in units of the number size) ---------- */
    // young: the arc above the slot, the launch point below / beside it (toward the target), the pop-in and punch overshoot
    function box(p, L, cx, by, settled, dir) {
      var u = Math.sqrt(U()), w = L.w, h = L.h;   // margins grow slower than the number (4 px at 256 wide, ~6 px at 640)
      if (settled) { var hb = Math.ceil(SIZE() * 0.65) + 2; /* covers the fade float */ return { x: Math.round(cx - w / 2 - 4 * u), y: by - h - hb - 2 * u, w: w + 8 * u, h: h + hb + 4 * u }; }
      var pk = peak(p), ox = Math.max(4 * u, (pk - 1) * w / 2 + (p.crit ? 0.14 * SIZE() : 0) + 2 * u), oy = (pk - 1) * h / 2 + (p.crit ? 0.14 * SIZE() : 0), up = Math.ceil(Math.max(arcH(p), oy)) + 3 * u;
      var r = { x: Math.round(cx - w / 2 - ox), y: by - h - up - 2 * u, w: w + 2 * ox, h: h + up + 4 * u + Math.max(0, oy) };
      var sp = spread(p); if (sp > 0 && dir) { if (dir > 0) { r.x -= sp; r.w += sp; } else r.w += sp; }
      r.h += Math.round(SIZE() * 0.25);   // the launch starts a little lower
      return r;
    }
    function dirOf(p, ox) { return p.crit || Math.abs(ox) > 0.5 ? 0 : p.dir0; }   // centre column: arc in from alternating sides; side spots hop straight up

    /* ---------- anchors (cached per id: killing blows show above the unit) ---------- */
    function valid(a) { return a && isFinite(a.x) && isFinite(a.top) ? { x: +a.x, top: +a.top, w: +a.w || 16, h: +a.h || 24 } : null; }
    function fetch(id) { var a = null; try { a = opt.getAnchor ? valid(opt.getAnchor(id)) : null; } catch (e) { a = null; } if (a) cache[id] = a; return a || cache[id] || null; }
    function anchor(p) { var a = fetch(p.tgt); if (a) p.last = a; return p.last; }
    function anchorXY(p) { var a = anchor(p); return [a.x, a.top - gapPx()]; }
    function fit(p, L, cx, by, dir) { var b = B(), r = box(p, L, cx, by, false, dir); cx += Math.max(0, b.x + 2 - r.x) - Math.max(0, r.x + r.w - (b.x + b.w - 2)); by += Math.max(0, b.y + 2 - r.y) - Math.max(0, r.y + r.h - (b.y + b.h - 2)); return [cx, by]; }
    function pos(p, L) { var a = anchorXY(p); return fit(p, L, a[0] + p.ox, a[1] + p.oy, p.dir); }
    function liveBox(q) { var L = layout(q), xy = pos(q, L); return box(q, L, xy[0], xy[1], !young(q), q.dir); }
    function obstacles(p, ownOK) {
      var list = []; try { list = (opt.getObstacles && opt.getObstacles()) || []; } catch (e) { list = []; }
      if (!Array.isArray(list)) list = [];
      var u = U(), hard = [], sprites = [], soft = [], units = [], all = [];
      list.forEach(function (o) {
        if (!o || !isFinite(o.x) || !isFinite(o.y) || !isFinite(o.w) || !isFinite(o.h)) return;
        all.push(o);
        if (o.soft) soft.push(o);
        else if (o.id != null) {
          if (String(o.id) === String(p.tgt)) { if (!ownOK || o.h <= Math.max(10, 0.6 * SIZE())) sprites.push(o); }   // its own HP bar stays clear even at its own spot
          else {
            var small = o.w <= 20 * u && o.h <= 24 * u, fp = { x: o.x - 1, y: o.y - 1, w: o.w + 2, h: o.h + (small ? 2 : 9) * Math.max(1, u * 0.6) };   // footprint + HP-bar band below
            sprites.push(fp); units.push(fp);
            if (!ownOK) { var ch = Math.max(40, 3 * SIZE()); sprites.push({ x: o.x - 1, y: o.y - ch, w: o.w + 2, h: ch }); }   // the column above another unit's head is theirs
          }
        } else hard.push(o);
      });
      return { hard: hard, sprites: sprites, soft: soft, all: all, units: units };
    }
    function isDense(p, tb, O) {
      if (P.dense === 'on') return true; if (P.dense === 'off') return false;
      var u = U(); if (tb.w > 20 * u || tb.h > 24 * u) return false;
      var cx = tb.x, cy = tb.top + tb.h / 2, R = 1.6 * Math.max(tb.w, tb.h);
      return O.all.some(function (o) { return o.id != null && String(o.id) !== String(p.tgt) && Math.abs(o.x + o.w / 2 - cx) < R && Math.abs(o.y + o.h / 2 - cy) < R; });
    }
    // best offset around the anchor: numbers and UI rects hard (x1000), sprites and claim zones (x2000), soft props x1
    function place(p, blockers, column, ownOK, wide, only) {
      var u = U(), L = layout(p), a = anchorXY(p), ax = a[0], ay = a[1], tb = anchor(p), O = obstacles(p, ownOK), hard = blockers.concat(O.hard), kk, m, best = null;
      var crowd = isDense(p, tb, O), dense = !wide && crowd, ks = p.crit ? 1.3 : 1, MAXX = (dense ? 6 : 26) * u * ks + tb.w / 2, MAXUP = (dense ? 20 : 36) * u * ks, gp = gapPx();
      var r0 = box(p, L, 0, 0, true), hx = Math.ceil(r0.w / 2), dy = Math.max(2, Math.round((r0.h - 4 * u) * 0.5)), C = [];
      var cols = column ? [0] : dense ? [0, 1, -1] : [0, 1, -1, 2, -2];
      for (kk = 0; kk <= 6; kk++) for (m = 0; m < cols.length; m++) C.push([cols[m] * hx, -kk * dy]);
      if (!column && !dense) [1, -1].forEach(function (sd) { [0.15, 0.4].forEach(function (f) { C.push([sd * (tb.w / 2 + L.w / 2 + 5 * u), Math.round(tb.h * f)]); }); });
      if (ownOK) for (kk = 2; kk <= tb.h + gp + 2; kk += Math.max(2, Math.round(2 * u))) C.push([0, kk]);
      if (ownOK) [1, -1].forEach(function (sd) { for (kk = 4; kk <= tb.h + gp; kk += Math.max(4, Math.round(4 * u))) C.push([sd * (tb.w / 2 + L.w / 2 + 3 * u), kk]); });
      if (only) C = [only];
      // the centre column may launch from either side: try both, keep the better
      var C2 = []; C.forEach(function (c) { if (!p.crit && Math.abs(c[0]) <= 0.5) { C2.push([c[0], c[1], p.dir0]); C2.push([c[0], c[1], -p.dir0]); } else C2.push(c); }); C = C2;
      C.forEach(function (c) {
        var d = c[2] != null ? c[2] : dirOf(p, c[0]), xy = fit(p, L, ax + c[0], ay + c[1], d), x = xy[0], y = xy[1], r = box(p, L, x, y, false, d);
        if (!only && (Math.abs(x - ax) > MAXX || ay - y > MAXUP || y - ay > tb.h + gp + 2)) return;
        var hb = ownOK || !crowd ? 0 : Math.ceil(arcH(p)), gw = L.w * (1 + (peak(p) - 1) * 0.5), g = { x: x - gw / 2 - 1, y: y - L.h - hb, w: gw + 2, h: L.h + (ownOK ? 0 : 2) + hb }, ho = 0, so = 0, lo = 0;
        hard.forEach(function (o) { ho += overlap(r, o); }); O.sprites.forEach(function (o) { so += overlap(g, o); }); O.soft.forEach(function (o) { lo += overlap(g, o); });
        // a settled number must be closer to its own unit than to any other unit (2 px margin), or it reads as theirs
        var gcx = x, gcy = y - L.h / 2, own = { x: tb.x - tb.w / 2, y: tb.top, w: tb.w, h: tb.h }, dOwn = rdist(gcx, gcy, own);
        O.units.forEach(function (un) { var dd = rdist(gcx, gcy, un); if (dd < dOwn + 2) so += 50 * (dOwn + 2 - dd) + 50; });
        if (ownOK) lo += dOwn * 3;
        var sc = ho * (ownOK === true ? 10 : 1000) + so * 2000 + lo + Math.abs(x - ax) * 2.5 + Math.abs(y - ay) * 0.8 + Math.max(0, ay - y - 1.2 * SIZE()) * 4 + Math.max(0, ay - y - 2.2 * SIZE()) * 40;   // climbing far above the head reads as someone else's (beside the unit is better)
        if (!best || sc < best.sc) best = { ox: x - ax, oy: y - ay, sc: sc, ho: ho, so: so, dir: d };
      });
      best = best || { ox: 0, oy: 0, sc: Infinity, ho: 1, so: 1, dir: p.dir0 };
      if (dense && !ownOK && !only && !(best.ho === 0 && best.so === 0)) { var b2 = place(p, blockers, column, false, true); if (b2.ho === 0 && b2.so === 0) return b2; }
      else if (dense && !ownOK && !only && !column && -best.oy > 2.2 * SIZE()) { var b3 = place(p, blockers, column, false, true); if (b3.ho === 0 && b3.so === 0 && b3.sc < best.sc) return b3; }   // a high climb: beside the unit may be closer
      if (!ownOK && !only && !column && legal(best) && -best.oy > 2.5 * SIZE()) {   // still that high (over a message box): on its own unit's sprite, if clean there
        var sm = p.small, b5 = place(p, blockers, false, 'strict', true); if (b5.ho === 0 && b5.so === 0 && -b5.oy <= 2.5 * SIZE()) return b5; p.small = sm;
      }
      return best;
    }
    var legal = function (b) { return b.ho === 0 && b.so === 0; };
    // a number already on screen never jumps: it glides from where it was drawn to its new slot (GLIDE ms, eased)
    // (when the way there would cross another number, it re-pops at the new slot instead: a quick fade and scale-in)
    function glideMs(q) { return clamp(120 + 0.6 * Math.hypot(q.gx, q.gy), 120, 220); }
    function glideOff(q) {
      if (q.gT == null) return [0, 0]; var u = (t - q.gT) / glideMs(q); if (u >= 1) { q.gT = null; return [0, 0]; }
      var e = 1 - u * u * (3 - 2 * u); return [q.gx * e, q.gy * e];
    }
    var touch = function (a, b) { return a.x < b.x + b.w + 1 && b.x < a.x + a.w + 1 && a.y < b.y + b.h + 1 && b.y < a.y + a.h + 1; };
    function setSpot(q, b) {
      var moved = q.seen && !q.gone && (q.ox !== b.ox || q.oy !== b.oy), g0, o0, L;
      if (moved) { L = layout(q); g0 = glideOff(q); o0 = pos(q, L); }
      q.ox = b.ox; q.oy = b.oy; q.dir = b.dir != null ? b.dir : dirOf(q, b.ox);
      if (!moved) return;
      var o1 = pos(q, L), gx = g0[0] + o0[0] - o1[0], gy = g0[1] + o0[1] - o1[1], r = geom(q, true).rect, others = pops.filter(function (o) { return o !== q && !o.gone && !o.hide; }).map(function (o) { return geom(o).rect; }), ui = obstacles(q, true).hard, clear = true;
      for (var k = 0; k <= 4 && clear; k++) {   // the way there: no other number, and no window or HUD rect after the start
        var f = 1 - k / 4, rk = { x: r.x + gx * f, y: r.y + gy * f, w: r.w, h: r.h }, i;
        for (i = 0; i < others.length; i++) if (touch(rk, others[i])) { clear = false; break; }
        if (k > 0) for (i = 0; i < ui.length && clear; i++) if (overlap(rk, ui[i]) > 0) clear = false;
      }
      if (clear && Math.hypot(gx, gy) > 0.5) { q.gx = gx; q.gy = gy; q.gT = t; } else { q.gT = null; q.pT = t; }
    }
    // last resort, still on the hit frame: smaller, then the target's own spot (its own sprite may be covered, never a neighbour)
    function ownSpot(p, others, strict) {
      p.small = true;
      var b = place(p, others, false, strict ? 'strict' : true);
      if (!legal(b)) { var bw = place(p, others, false, strict ? 'strict' : true, true); if (bw.sc < b.sc) b = bw; }
      return b;
    }
    function prio(p) { return p.word ? -1 : (p.crit ? 1e6 : 0) + p.value; }
    function requeue(q, why) {
      if (!q.hide && t - q.born >= 0.6 * life(q)) { q.gone = true; emit({ event: 'retire', why: why, target: q.tgt, text: textOf(q, q.value), age: t - q.born }); return; }
      q.gone = true; waiting.push({ target: q.tgt, kind: q.kind, type: q.type, crit: q.crit, word: q.word, value: q.value, gain: q.gain, since: t, hid: q.hid != null ? q.hid : t, seen: !!(q.seen || q.wasSeen), fresh: false, again: true });
      emit({ event: 'requeue', why: why, target: q.tgt, text: textOf(q, q.value), age: t - q.born });
    }
    // move an older pop out of the way: another legal spot, else smaller at its own spot, else hide it and show it again later
    function displace(q, blockers) {
      var b = place(q, blockers); if (legal(b)) { setSpot(q, b); return; }
      var sm = q.small; b = ownSpot(q, blockers, true);
      if (legal(b)) { setSpot(q, b); return; }
      q.small = sm; requeue(q, 'displaced');
    }
    // where a number's glyphs are: its slot, joined with where it was last drawn (in flight, popping, floating)
    function glyphRect(q) {
      var L = layout(q), xy = pos(q, L), m = 2, r = { x: xy[0] - L.w / 2 - m, y: xy[1] - L.h - m, w: L.w + 2 * m, h: L.h + 2 * m };
      for (var i = 0; i < drawn.length; i++) if (drawn[i].pop === q.id) { var d = drawn[i], x0 = Math.min(r.x, d.x - 1), y0 = Math.min(r.y, d.y - 1); r = { x: x0, y: y0, w: Math.max(r.x + r.w, d.x + d.w + 1) - x0, h: Math.max(r.y + r.h, d.y + d.h + 1) - y0 }; break; }
      return r;
    }
    function visible() { return pops.filter(function (q) { return !q.gone && t - q.born < life(q); }); }
    function boxes(list) { return list.filter(function (q) { return !q.gone; }).map(liveBox); }
    function fold(into, n, crit) {   // add to a rolling total: roll from what is shown now, punch, restart the hold
      into.from = shownValue(into); into.value += n; into.rollT = t; into.punchT = t; into.lastAdd = t; into.adds++; if (crit) into.crit = true;
      emit({ event: 'fold', target: into.tgt, text: String(n), total: into.value, adds: into.adds });
      var live = visible(), rest = boxes(live.filter(function (o) { return o !== into; }));
      if (rest.some(function (o) { return overlap(liveBox(into), o) > 0; }) || stillBad(into, rest)) {
        var b = place(into, rest); if (!legal(b)) b = ownSpot(into, boxes(live.filter(function (o) { return o !== into && String(o.tgt) !== String(into.tgt); })));
        setSpot(into, b);
        var fb = liveBox(into);
        live.filter(function (o) { return o !== into && !o.gone && overlap(liveBox(o), fb) > 0 && prio(o) <= prio(into); }).forEach(function (o) { displace(o, boxes(visible().filter(function (z) { return z !== o; }))); });
      }
      return into;
    }
    function stillBad(q, rest) { var b = place(q, rest, false, 'strict', true, [q.ox, q.oy]); return b.so > 0; }
    // returns the pop, or null when it must wait for room
    function tryPlace(w) {
      var p = { kind: w.kind, type: w.type, crit: !!w.crit, word: w.word, value: w.value, gain: !!w.gain, from: w.value, rollT: -1e9, born: t, lastAdd: t, punchT: -1e9, adds: 1, id: seq++, tgt: w.target, ox: 0, oy: 0, fresh: w.fresh, last: fetch(w.target), wasSeen: !!w.seen };
      alt[p.tgt] = (alt[p.tgt] || 0) + 1; p.dir0 = alt[p.tgt] % 2 ? 1 : -1; p.dir = p.dir0;
      var path = 'free', ownOk = true;
      if (P.stack !== 'off') {
        var live = visible(), others = function (ex) { return boxes(live.filter(function (o) { return ex.indexOf(o) < 0; })); };
        var best = place(p, boxes(live)); p.first = best && { ho: Math.round(best.ho), so: Math.round(best.so), ox: best.ox, oy: best.oy };
        var colSpot = p.crit && P.crit !== 'plain' ? place(p, [], true) : null;
        if (colSpot && colSpot.so === 0 && !(legal(best) && best.ox === 0)) {
          // a critical takes the clear column above its target; smaller numbers there move
          path = 'crit-column'; setSpot(p, colSpot); var mine = liveBox(p);
          live.filter(function (q) { return overlap(liveBox(q), mine) > 0 && prio(q) <= prio(p); }).forEach(function (q) { displace(q, others([q]).concat([mine])); });
          best = null;
        }
        if (best && !legal(best)) {
          // 1) fold into the same target's number of the same type (any age) when nothing is free
          var fq = p.word ? null : live.filter(function (q) { return String(q.tgt) === String(p.tgt) && !q.word && q.type === p.type && !!q.crit === !!p.crit && !!q.gain === !!p.gain; })
            .sort(function (a, b) { return Math.abs(a.oy) + Math.abs(a.ox) - Math.abs(b.oy) - Math.abs(b.ox); })[0];
          if (fq) { emit({ target: p.tgt, text: textOf(p, p.value), path: 'fold' }); return fold(fq, p.value, p.crit); }
          // 2) smaller
          p.small = true; var b3 = place(p, boxes(live)); if (legal(b3)) { best = b3; path = 'small'; } else p.small = false;
          // 3) newest wins against same-target numbers of lower or equal priority; a young one is never evicted (wait, max 900 ms)
          if (!legal(best)) {
            var bigger = live.filter(function (q) { return String(q.tgt) !== String(p.tgt) || prio(q) > prio(p); });
            var b4 = place(p, boxes(bigger));
            if (b4.so === 0 && b4.ho === 0) {
              var probe = { kind: p.kind, type: p.type, crit: p.crit, word: p.word, value: p.value, born: t, lastAdd: t, punchT: -1e9, tgt: p.tgt, ox: b4.ox, oy: b4.oy, dir: b4.dir, dir0: p.dir0, small: p.small, last: p.last };
              var r4 = liveBox(probe);
              if (live.some(function (q) { return String(q.tgt) === String(p.tgt) && overlap(liveBox(q), r4) > 0 && t - q.lastAdd < D() * 0.5; }) && t - w.since < 900) return null;
              best = b4; path = 'newest-wins'; setSpot(p, b4); var m4 = liveBox(p);
              live.filter(function (q) { return String(q.tgt) === String(p.tgt) && overlap(liveBox(q), m4) > 0; }).forEach(function (q) { displace(q, others([q]).concat([m4])); });
            }
          }
        }
        if (best && !legal(best)) {
          // 4) no free spot: only a young number of the SAME target may delay it; otherwise its own spot, now
          if (live.some(function (q) { return String(q.tgt) === String(p.tgt) && t - q.lastAdd < D() * 0.5; }) && t - w.since < 900) return null;
          path = 'own-spot'; best = ownSpot(p, []); ownOk = best.so === 0; setSpot(p, best); var m5 = liveBox(p);
          // never under a bigger number of its own target: wait (max 900 ms); otherwise it is drawn beneath the bigger one
          if (live.some(function (q) { return !q.gone && String(q.tgt) === String(p.tgt) && prio(q) > prio(p) && overlap(liveBox(q), m5) > 0; }) && t - w.since < 900) return null;
          // a banner or window covers its own spot (a wave refill under the WAVE banner): wait for the window to go (max 900 ms of world time)
          var L5 = layout(p), s5 = pos(p, L5), g5 = { x: s5[0] - L5.w / 2, y: s5[1] - L5.h, w: L5.w, h: L5.h }, c5 = 0; obstacles(p, true).hard.forEach(function (o) { c5 += overlap(g5, o); });
          if (c5 >= 0.5 * g5.w * g5.h && t - w.since < 900) return null;
          live.filter(function (q) { return !q.gone && overlap(liveBox(q), m5) > 0 && prio(q) <= prio(p); }).forEach(function (q) { displace(q, others([q]).concat([m5])); });
          best = null;
        }
        if (best) setSpot(p, best);
      }
      // a number coming back after it was hidden waits until it would not touch another number where they are drawn now
      if (w.again && P.stack !== 'off') {
        var gr = liveBox(p), clash = -p.oy > 2.5 * SIZE() || visible().some(function (o) { var r = geom(o).rect; return gr.x < r.x + r.w + 1 && r.x < gr.x + gr.w + 1 && gr.y < r.y + r.h + 1 && r.y < gr.y + gr.h + 1; });
        if (clash && !w.seen && t - (w.hid != null ? w.hid : w.since) > 900 && ownFallback(p, boxes(visible()))) clash = false;   // never shown: its own spot rather than nothing
        if (clash) { if (t - (w.hid != null ? w.hid : w.since) > 900) { emit({ event: 'retire', why: 'no-room', target: p.tgt, text: textOf(p, p.value) }); return true; } return null; }
        p.hide = 1; p.hid = w.hid != null ? w.hid : w.since;   // shown only once it has kept its spot for 3 updates: no one-frame flashes
      } else if (path === 'own-spot' && P.stack !== 'off') {
        // last-resort spot whose flight would cross a number on screen: held hidden for 3 updates first, so it never flashes for one frame
        var fr = liveBox(p); if (visible().some(function (o) { return !o.hide && touch(fr, geom(o).rect); })) { p.hide = 1; p.hid = t; }
      }
      p.ok = path === 'own-spot' ? ownOk : true;
      if (path !== 'own-spot') p.uiCov0 = 0;   // placed clear of every window: a window that opens over it later moves it
      emit({ target: p.tgt, text: textOf(p, p.value), path: path, first: p.first, ox: p.ox, oy: p.oy, small: !!p.small, anchor: p.last });
      pops.push(p); return p;
    }
    function flushWaiting() { waiting = waiting.filter(function (w) { return !tryPlace(w); }); }

    function spawn(targetId, amount, kind, opts) {
      try {
        opts = opts || {};
        var given = valid(opts.anchor);
        if (given) { var cur = null; try { cur = opt.getAnchor ? valid(opt.getAnchor(targetId)) : null; } catch (e) {} if (!cur) cache[targetId] = given; }
        if (!fetch(targetId)) {
          if (!warned && root.console) { warned = true; console.warn('GameDNA_DamagePop: no anchor for target "' + targetId + '" - keep returning a unit\'s position from getAnchor while it is dying or dead, or pass spawn(id, amount, kind, {anchor}). Number skipped.'); }
          emit({ event: 'skip', why: 'no-anchor', target: targetId }); return null;
        }
        kind = String(kind || 'damage').toLowerCase();
        var type = opts.type ? String(opts.type).toLowerCase() : TYPES[kind] ? kind : kind === 'heal' ? 'heal' : kind === 'mp' || kind === 'mana' ? 'mana' : kind === 'shield' || kind === 'absorb' ? 'shield' : 'physical';
        if (!TYPES[type]) type = 'physical';
        var crit = kind === 'crit' || kind === 'critical' || !!opts.crit, word = null, n = Math.max(0, Math.round(Math.abs(+amount || 0)));
        if (WORDS[kind]) word = WORDS[kind];
        else if (kind === 'status') word = String(amount == null ? '' : amount).toUpperCase().replace(/[^A-Z !?-]/g, '').trim() || 'STATUS';
        var kd = word ? (kind === 'status' ? 'status' : 'word') : 'num';
        if (kd === 'num' && type === 'heal') crit = !!opts.crit;
        var gain = kd === 'num' && (kind === 'heal' || type === 'heal'), w = { target: targetId, kind: kd, type: type, crit: crit, word: word, value: n, gain: gain, since: t, fresh: true };
        // rapid hits on the same target merge into one rolling total (same type; crits only with crits)
        var into = null;
        if (kd === 'num' && +P.merge > 0) into = visible().filter(function (q) { return String(q.tgt) === String(targetId) && !q.word && q.type === type && !!q.crit === crit && !!q.gain === gain && t - q.lastAdd <= +P.merge; }).sort(function (a, b) { return b.lastAdd - a.lastAdd; })[0] || null;
        var res = null;
        if (into) res = fold(into, n, false);
        else if (waiting.length || !(res = tryPlace(w))) waiting.push(w);
        if (kd === 'num' && !gain && type !== 'shield' && type !== 'mana') { var hs = +P.hitstop * (crit ? 2 : 1); if (hs > 0) call('onHitStop', hs); }
        if (crit && P.crit === 'burst') call('onShake', Math.max(1, Math.round(2 * U())), 180);
        if (crit && P.crit !== 'plain') call('onFlash', 0.25, 80);
        return res ? res.id : null;
      } catch (e) { if (root.console) console.error(e); return null; }
    }
    function update(dt) {
      try {
        dt = +dt; if (!(dt > 0)) dt = 0;
        t += dt;
        pops.forEach(function (q) { if (!q.hide && !q.gone) q.seen = true; });   // drawn since the last update: moves glide from now on (update clock, so ?t=&freeze=1 matches)
        if (waiting.length) flushWaiting();
        pops.forEach(function (q) { q.fresh = false; }); waiting.forEach(function (w) { w.fresh = false; });
        var obs = []; try { obs = (opt.getObstacles && opt.getObstacles()) || []; } catch (e) { obs = []; }
        var seen = {};
        if (Array.isArray(obs)) obs.forEach(function (o) { if (!o || o.id == null || seen[o.id] || !isFinite(o.x)) return; seen[o.id] = 1; if (!fetch(o.id)) cache[o.id] = { x: o.x + o.w / 2, top: o.y, w: o.w, h: o.h }; });
        pops = pops.filter(function (q) { return !q.gone && t - q.born < life(q); });
        if (P.stack !== 'off' && pops.length) { revalidate(); resolve(); }
        pops.forEach(function (q) { if (q.hide && !q.gone && ++q.hide > 3) { q.hide = 0; q.born = t; q.lastAdd = t; } });
        if (P.stack !== 'off') land(pops.filter(function (q) { return !q.gone && !q.hide; }));
      } catch (e) { if (root.console) console.error(e); }
    }
    // a window, banner or HUD rect that appeared over a placed number (or the camera carried the number under it): move, else hide
    function slotCov(q) { var Lq = layout(q), sq = pos(q, Lq), gr = { x: sq[0] - Lq.w / 2, y: sq[1] - Lq.h, w: Lq.w, h: Lq.h }, cov = 0; obstacles(q, true).hard.forEach(function (o) { cov += overlap(gr, o); }); return cov / Math.max(1, gr.w * gr.h); }
    // never shown yet and its spot is gone: its target's own spot (on its sprite), when no window and no number is there
    function ownFallback(q, rest) {
      var keep = [q.ox, q.oy, q.dir, q.small], b = ownSpot(q, rest, true); setSpot(q, b);
      var r = liveBox(q);
      if (slotCov(q) < 0.25 && !visible().some(function (o) { return o !== q && !o.hide && touch(r, geom(o).rect); })) { q.uiCov0 = slotCov(q); return true; }
      q.ox = keep[0]; q.oy = keep[1]; q.dir = keep[2]; q.small = keep[3]; return false;
    }
    function uncover(q, rest) {
      var cov = slotCov(q);
      if (q.uiCov0 == null) { q.uiCov0 = cov; return false; }
      if (cov <= q.uiCov0 + 0.2) return false;
      var bu = place(q, rest); if (legal(bu) && -bu.oy <= 2.5 * SIZE()) { setSpot(q, bu); q.uiCov0 = 0; emit({ event: 'move', why: 'covered', target: q.tgt }); return true; }
      if (!q.seen && !q.wasSeen && ownFallback(q, rest)) { emit({ event: 'move', why: 'covered-own', target: q.tgt }); return true; }
      if (t - q.born >= 0.4 * life(q)) { q.gone = true; emit({ event: 'retire', why: 'covered', target: q.tgt, text: textOf(q, q.value), age: t - q.born }); return true; }   // read already: no second launch
      requeue(q, 'covered'); return true;
    }
    // units move: a number that now covers a neighbour or sits nearer to one moves again
    function revalidate() {
      var live = visible();
      live.forEach(function (q) {
        if (q.gone) return;
        var rest = boxes(live.filter(function (o) { return o !== q; }));
        if (uncover(q, rest)) return;
        var now = place(q, rest, false, 'strict', true, [q.ox, q.oy]);
        if (now.so === 0) {
          // units carried two numbers into each other: the smaller one moves (if it can go somewhere clean)
          var gq = glyphRect(q), big = live.filter(function (o) { return o !== q && !o.gone && prio(o) >= prio(q) && overlap(gq, glyphRect(o)) > 0; });
          if (big.length) {
            var b0 = place(q, rest); if (legal(b0)) { setSpot(q, b0); return; }
            big.forEach(function (o) { var bo = place(o, boxes(live.filter(function (z) { return z !== o; }))); if (legal(bo)) setSpot(o, bo); });   // else the bigger one moves
          }
          return;
        }
        var b = place(q, rest); if (!legal(b)) b = ownSpot(q, []);
        if (b.so > 0) { if (q.ok !== false) requeue(q, 'walked-on'); return; }
        setSpot(q, b); q.ok = true;
      });
    }

    /* ---------- rasters ---------- */
    function crispMode(ctx, ds) {
      if (P.render === 'crisp') return true; if (P.render === 'smooth') return false;
      if (SK) return !!SK.pixel;
      return ds < 1.5 && ctx.canvas && ctx.canvas.width <= 512;
    }
    function cacheGet(key, make) { if (RC[key]) return RC[key]; if (rcN > 500) { RC = {}; rcN = 0; } rcN++; return (RC[key] = make()); }
    function fillGrad(g, y0, y1, C, hard) {
      var gr = g.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, C[0]); gr.addColorStop(hard ? 0.5 : 0.36, C[0]); gr.addColorStop(hard ? 0.5 : 0.64, C[1]); gr.addColorStop(1, C[1]); return gr;
    }
    function drawIcon(g, type, cx, cy, r, ol, olw, withOutline) {
      var IC = ICONCOL[type] || ICONCOL.physical;
      iconPath(g, type, r);
      if (withOutline) { g.lineJoin = 'round'; g.lineWidth = olw * 2; g.strokeStyle = ol; g.stroke(); g.fillStyle = ol; g.fill(); return; }
      var gr = g.createLinearGradient(0, -r, 0, r); gr.addColorStop(0, IC[0]); gr.addColorStop(1, IC[1]); g.fillStyle = gr; g.fill();
    }
    // smooth sprite: outline + soft drop shadow, gradient fill, a sheen; rendered at the device scale R
    function smoothSprite(str, styleCol, icon, cap, R) {
      return cacheGet('s|' + str + '|' + styleCol + '|' + icon + '|' + cap + '|' + R + '|' + P.palette + '|' + family(), function () {
        var M = metrics(str, cap, icon), C = colours(styleCol), pad = Math.ceil(M.ol + cap * 0.35 + 2), W = M.w + 2 * pad, H = M.h + 2 * pad + Math.ceil(cap * 0.15);
        var c = mk(W * R, H * R), g = c.getContext('2d'); g.setTransform(R, 0, 0, R, 0, 0);
        var x0 = pad + M.ol, base = pad + M.ol + cap, tx = x0 + M.iw + M.gap, icx = x0 + M.iw / 2, icy = base - cap / 2, ir = M.iw * 0.5;
        g.font = '800 ' + M.fs + 'px ' + family(); g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.lineJoin = 'round'; g.miterLimit = 2;
        // pass 1: outline with the soft drop shadow under it
        g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = cap * 0.32 * R; g.shadowOffsetY = cap * 0.12 * R;
        g.lineWidth = M.ol * 2; g.strokeStyle = C[2]; g.strokeText(str, tx, base); g.fillStyle = C[2]; g.fillText(str, tx, base);
        if (icon) { g.save(); g.translate(icx, icy); drawIcon(g, icon, 0, 0, ir, C[2], M.ol, true); g.restore(); }
        g.shadowColor = 'rgba(0,0,0,0)'; g.shadowBlur = 0; g.shadowOffsetY = 0;
        // pass 2: fill and icon
        g.fillStyle = fillGrad(g, base - cap, base, C, false); g.fillText(str, tx, base);
        if (icon) { g.save(); g.translate(icx, icy); drawIcon(g, icon, 0, 0, ir, C[2], M.ol, false); g.restore(); }
        // pass 3: sheen on the upper third
        g.save(); g.globalCompositeOperation = 'source-atop'; var sh = g.createLinearGradient(0, base - cap, 0, base - cap * 0.45);
        sh.addColorStop(0, 'rgba(255,255,255,0.55)'); sh.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sh; g.fillRect(tx - 2, base - cap - 2, M.tw + 4, cap * 0.6); g.restore();
        return { c: c, R: R, W: W, H: H, bx: pad + M.w / 2, by: pad + M.h, gw: M.w, gh: M.h };
      });
    }
    // crisp sprite for native pixel canvases: the same text at a whole-pixel cap height, thresholded to 1 bit, two-tone fill
    // with a lit top edge and a shaded bottom edge, 1 px outline (2 px from cap 14) and a 1 px drop below
    function crispSprite(str, styleCol, icon, cap) {
      return cacheGet('c|' + str + '|' + styleCol + '|' + icon + '|' + cap + '|' + P.palette + '|' + family(), function () {
        var M = metrics(str, cap, icon), C = colours(styleCol), o = cap >= 14 ? 2 : 1, pad = o + 2, W = Math.ceil(M.w + 2 * pad), H = Math.ceil(M.h + 2 * pad + Math.ceil(cap * 0.3));
        var c = mk(W, H), g = c.getContext('2d');
        var x0 = pad + M.ol, base = pad + M.ol + cap, tx = x0 + M.iw + M.gap, icx = x0 + M.iw / 2, icy = base - cap / 2, ir = M.iw * 0.5;
        g.font = '800 ' + M.fs + 'px ' + family(); g.textBaseline = 'alphabetic'; g.textAlign = 'left';
        g.fillStyle = fillGrad(g, base - cap, base, C, true); g.fillText(str, Math.round(tx), base);
        if (icon) { g.save(); g.translate(Math.round(icx) + 0.5, Math.round(icy)); drawIcon(g, icon, 0, 0, ir + 0.4, C[2], 1, false); g.restore(); }
        var id = g.getImageData(0, 0, W, H), d = id.data, mask = new Uint8Array(W * H), x, y, i, dx, dy;
        for (i = 0; i < W * H; i++) mask[i] = d[i * 4 + 3] >= 120 ? 1 : 0;
        var at = function (xx, yy) { return xx >= 0 && yy >= 0 && xx < W && yy < H && mask[yy * W + xx] === 1; };
        var out = g.createImageData(W, H), od = out.data, olc = hexRGB(C[2]), mid = base - cap / 2;
        for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
          i = y * W + x; var j = i * 4;
          if (mask[i]) {
            var r = d[j], gg = d[j + 1], b = d[j + 2], inText = x >= tx - 1;
            if (inText) { var cc = hexRGB(y < mid ? C[0] : C[1]); r = cc[0]; gg = cc[1]; b = cc[2]; }
            if (!at(x, y - 1) && y < mid) { r = (r + 255) >> 1; gg = (gg + 255) >> 1; b = (b + 255) >> 1; }
            else if (!at(x, y + 1) && y >= mid) { r = r * 0.72 | 0; gg = gg * 0.72 | 0; b = b * 0.72 | 0; }
            od[j] = r; od[j + 1] = gg; od[j + 2] = b; od[j + 3] = 255; continue;
          }
          var hit = false;
          for (dy = -o; dy <= o && !hit; dy++) for (dx = -o; dx <= o && !hit; dx++) if (at(x + dx, y + dy) || at(x + dx, y + dy - 1)) hit = true;
          if (hit) { od[j] = olc[0]; od[j + 1] = olc[1]; od[j + 2] = olc[2]; od[j + 3] = 255; }
        }
        g.clearRect(0, 0, W, H); g.putImageData(out, 0, 0);
        return { c: c, R: 1, W: W, H: H, bx: Math.round(pad + M.w / 2), by: pad + M.h, gw: M.w, gh: M.h };
      });
    }
    function hexRGB(h) { var n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

    /* ---------- drawing ---------- */
    // the last word on overlaps, run with the freshest anchors (every update and every draw): biggest first; a smaller number that
    // touches an accepted one folds into it (same target and type), else moves to a clean spot, else hides until there is room
    function resolve() {
      if (P.stack === 'off') return;
      var list = pops.filter(function (q) { return !q.gone && t - q.born >= 0 && t - q.born < life(q); }).sort(function (a, b) { return prio(b) - prio(a) || a.id - b.id; });
      var acc = [], m = 1;
      var touches = function (r) { for (var i = 0; i < acc.length; i++) { var o = acc[i].r; if (r.x < o.x + o.w + m && o.x < r.x + r.w + m && r.y < o.y + o.h + m && o.y < r.y + r.h + m) return acc[i]; } return null; };
      list.forEach(function (q) {
        var r = geom(q, true).rect, hit = touches(r);
        if (!hit) { acc.push({ q: q, r: r }); return; }
        if (q.hide) { requeue(q, 'overlap'); return; }   // a returning number not shown yet: back to the queue, unseen
        var big = hit.q;
        if (!q.word && !big.word && String(q.tgt) === String(big.tgt) && !!q.gain === !!big.gain) {   // same target: one total (it keeps the bigger one's type)
          big.from = shownValue(big); big.value += q.value; big.rollT = t; big.punchT = t; big.lastAdd = t; big.adds += q.adds || 1; q.gone = true;
          emit({ event: 'fold', target: big.tgt, text: String(q.value), total: big.value, adds: big.adds, why: 'overlap' }); hit.r = geom(big, true).rect; return;
        }
        var blockers = acc.map(function (o) { var u = U(); return { x: o.r.x - 2 * u, y: o.r.y - 2 * u, w: o.r.w + 4 * u, h: o.r.h + 4 * u }; });
        var b = place(q, blockers), ox = q.ox, oy = q.oy, od = q.dir, sg = [q.gx, q.gy, q.gT, q.pT];
        if (legal(b)) { setSpot(q, b); var r2 = geom(q, true).rect; if (!touches(r2)) { acc.push({ q: q, r: r2 }); emit({ event: 'move', why: 'overlap', target: q.tgt }); return; } q.ox = ox; q.oy = oy; q.dir = od; q.gx = sg[0]; q.gy = sg[1]; q.gT = sg[2]; q.pT = sg[3]; }
        requeue(q, 'overlap');
      });
    }
    // a glider that would cross a number where it is now lands at once (re-pop); run in update and draw
    function land(list) {
      var still = list.filter(function (q) { return q.gT == null; }).map(function (q) { return geom(q).rect; });
      list.forEach(function (q) { if (q.gT == null) return; var r = geom(q).rect; if (still.some(function (o) { return touch(r, o); })) { q.gT = null; q.pT = t; r = geom(q).rect; } still.push(r); });
    }
    function draw(ctx, offX, offY) {
      if (!ctx) return;
      drawn = [];
      try {
        offX = +offX || 0; offY = +offY || 0;
        if (P.stack !== 'off') { var fresh = visible().filter(function (q) { return !q.seen && !q.hide; }); fresh.forEach(function (q) { if (!q.gone) uncover(q, boxes(visible().filter(function (o) { return o !== q; }))); }); }   // a window opened on the hit frame
        resolve();
        var ds = devScale(ctx), crisp = crispMode(ctx, ds); lastCrisp = crisp;
        if (!opt.bounds && ctx.canvas) lastView = { x: 0, y: 0, w: Math.round(ctx.canvas.width / ds), h: Math.round(ctx.canvas.height / ds) };
        var list = pops.filter(function (q) { return !q.gone && !q.hide && t - q.born >= 0 && t - q.born < life(q); });
        land(list);
        list.sort(function (a, b) { return prio(a) - prio(b) || a.id - b.id; });   // small first: big numbers are never covered by small ones
        ctx.save();
        list.forEach(function (p) { try { drawPop(ctx, p, ds, crisp, offX, offY); } catch (e) { if (root.console) console.error(e); } });
        ctx.restore();
      } catch (e) { if (root.console) console.error(e); }
    }
    // free room above a number (to the nearest other unit, UI rect or the field top): the arc and the fade float never rise into it
    function room(p, L, xy) {
      if (p.roomT === t && p.roomX === xy[0] && p.roomY === xy[1]) return p.room;
      var O = obstacles(p, true), top = xy[1] - L.h, x0 = xy[0] - L.w / 2 - 1, x1 = xy[0] + L.w / 2 + 1, free = top - B().y;
      var others = pops.filter(function (q) { return q !== p && !q.gone; }).map(function (q) { var L2 = layout(q), xy2 = pos(q, L2); return { x: xy2[0] - L2.w / 2 - 2, y: xy2[1] - L2.h - 2, w: L2.w + 4, h: L2.h + 4 }; });   // and other numbers' slots
      var bars = O.all.filter(function (o) { return o.id != null && !o.soft && String(o.id) === String(p.tgt) && o.h <= Math.max(10, 0.6 * SIZE()); });   // its own HP bar: never floated through
      O.units.concat(O.hard, others, bars).forEach(function (r) { if (r.x < x1 && r.x + r.w > x0 && r.y + r.h <= top + 1) free = Math.min(free, top - (r.y + r.h)); });
      p.roomT = t; p.roomX = xy[0]; p.roomY = xy[1]; return (p.room = Math.max(0, free - 1));
    }
    // where and how a number is drawn at time t (native px, offset 0): glyph centre x, glyph bottom y, scale, alpha, its drawn rect
    function geom(p, noGlide) {
      var L = layout(p), xy = pos(p, L), gl = noGlide ? [0, 0] : glideOff(p), cx = xy[0] + gl[0], by = xy[1] + gl[1], a = t - p.born, lf = life(p), size = SIZE(), rm = room(p, L, xy);
      // arc out: launch beside / below the slot (toward the target), parabola up, land on the slot, a small settle
      var dir = p.crit ? 0 : p.dir, u = clamp(a / ARC_MS, 0, 1), sp = spread(p), H = Math.min(arcH(p), rm), dx = 0, dy = 0;
      if (u < 1) { dx = -dir * sp * (1 - u); dy = Math.round(size * 0.25) * (1 - u) - H * 4 * u * (1 - u) * 1.0; }
      else if (a < ARC_MS + 110) dy = -H * 0.12 * Math.sin(Math.PI * (a - ARC_MS) / 110);
      var s = popScale(a, peak(p), p.crit ? 90 : 70, p.crit ? 340 : 220), pa = t - p.punchT, bp = bump(pa);
      if (bp) { s *= 1 + Math.max(0, +P.punch) * 0.45 * bp; dy -= Math.min(size * 0.12, rm) * Math.max(0, bp); }
      if (p.crit && P.crit === 'burst' && a < 260) { var amp = size * 0.13 * (1 - a / 260), f = Math.floor(a / 32); dx += (hash(p.id, f) * 2 - 1) * amp; dy += (hash(p.id + 77, f) * 2 - 1) * amp; }
      // hold, then float up, shrink a little and fade
      var fs0 = lf - D() * 0.3, al = 1;
      if (a > fs0) { var fu = (a - fs0) / (lf - fs0), fl = Math.min(size * 0.65, rm); dy -= fl * (0.77 * easeIn(fu) + 0.23 * fu); al = 1 - easeIn(fu); s *= 1 - 0.12 * fu; }
      if (a < 50) al *= a / 50 * 0.6 + 0.4;
      if (p.pT != null && t - p.pT < 120) { var pu = (t - p.pT) / 120; al *= 0.35 + 0.65 * pu; s *= 0.86 + 0.14 * easeOut(pu); }   // re-pop at a new slot
      var gcx = cx + dx, gby = by + dy, rw = L.w * s, rh = L.h * s;
      if (lastCrisp) { var cs = Math.max(5, Math.round(capOf(p) * s)), M = metrics(textOf(p, p.word ? 0 : p.value), cs, styleOf(p).icon); rw = M.w; rh = M.h; }   // the crisp raster's own size
      return { L: L, a: a, s: s, al: al, gcx: gcx, gby: gby, rect: { x: gcx - rw / 2, y: gby - L.h / 2 - rh / 2, w: rw, h: rh } };
    }
    function drawPop(ctx, p, ds, crisp, offX, offY) {
      if (p.hide) return;
      var G = geom(p), L = G.L, a = G.a, s = G.s, al = G.al, gcx = G.gcx + offX, gby = G.gby + offY, st = styleOf(p), cap = capOf(p), size = SIZE(), rect;
      var str = textOf(p, shownValue(p));
      if (crisp) {
        al = al >= 0.95 ? 1 : al > 0.66 ? 0.75 : al > 0.33 ? 0.5 : al > 0.05 ? 0.25 : 0;
        if (al <= 0) return;
        var cs = Math.max(5, Math.round(cap * s)), S = crispSprite(str, st.col, st.icon, cs);
        var x = Math.round(gcx - S.bx), yb = Math.round(gby + (cs - cap) / 2 - S.by);   // scale about the glyph centre
        if (p.crit && P.crit === 'burst' && a < 240) burst(ctx, gcx, gby - L.h / 2, size, a, colours(st.col), true, L.w * s + 4, L.h * s + 4);
        ctx.globalAlpha = al; ctx.imageSmoothingEnabled = false; ctx.drawImage(S.c, x, yb);
        rect = { x: x + S.bx - S.gw / 2, y: yb + S.by - S.gh, w: S.gw, h: S.gh };
      } else {
        if (al <= 0.01) return;
        var R = Math.min(8, Math.max(1, Math.round(ds * (p.crit ? 1.6 : 1.25) * 2) / 2)), T = smoothSprite(str, st.col, st.icon, cap, R);
        if (p.crit && P.crit === 'burst' && a < 260) burst(ctx, gcx, gby - L.h / 2, size * styleOf(p).k / 1.45, a, colours(st.col), false, L.w * s + 4, L.h * s + 4);
        var ccy = gby - T.gh / 2;
        ctx.globalAlpha = al; ctx.imageSmoothingEnabled = true; try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
        ctx.setTransform.apply(ctx, (function () { var m = ctx.getTransform(); return [m.a, m.b, m.c, m.d, m.e, m.f]; })());
        ctx.save(); ctx.translate(gcx, ccy); ctx.scale(s, s);
        ctx.drawImage(T.c, -T.bx, -(T.by - T.gh / 2), T.W, T.H);
        ctx.restore();
        rect = { x: gcx - T.gw * s / 2, y: ccy - T.gh * s / 2, w: T.gw * s, h: T.gh * s };
      }
      ctx.globalAlpha = 1;
      drawn.push({ pop: p.id, target: p.tgt, text: str, x: rect.x, y: rect.y, w: rect.w, h: rect.h, crit: !!p.crit, type: p.type, adds: p.adds, age: Math.round(a), sincePunch: Math.round(t - p.punchT) });
    }
    // critical burst behind the number: a soft glow and 8 rays that flick out and fade (crisp: 1 px rays, stepped)
    function burst(ctx, x, y, size, a, C, crisp, gw, gh) {
      var u = clamp(a / 240, 0, 1), al = (1 - u) * (crisp ? 1 : 0.85), r0 = size * (0.6 + 0.7 * easeOut(u)), r1 = size * (1.3 + 1.2 * easeOut(u)), i;
      ctx.save();
      if (gw > 0) { ctx.beginPath(); ctx.rect(x - 4 * r1, y - 4 * r1, 8 * r1, 8 * r1); ctx.rect(x - gw / 2, y - gh / 2, gw, gh); ctx.clip('evenodd'); }   // never across the digits
      if (crisp) {
        ctx.globalAlpha = al > 0.5 ? 1 : al > 0.2 ? 0.5 : 0; if (!ctx.globalAlpha) { ctx.restore(); return; }
        ctx.fillStyle = C[0];
        for (i = 0; i < 8; i++) { var an = i * Math.PI / 4 + Math.PI / 8, n = Math.round(r1 - r0); for (var k = 0; k < n; k += 1) ctx.fillRect(Math.round(x + Math.cos(an) * (r0 + k)), Math.round(y + Math.sin(an) * (r0 + k) * 0.8), 1, 1); }
      } else {
        var gr = ctx.createRadialGradient(x, y, 0, x, y, r1); gr.addColorStop(0, 'rgba(255,240,200,' + (0.55 * al) + ')'); gr.addColorStop(0.45, hexA(C[1], 0.35 * al)); gr.addColorStop(1, hexA(C[1], 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, r1 * 1.25, r1 * 0.85, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = hexA(C[0], 0.9 * al);
        for (i = 0; i < 8; i++) {
          var b = i * Math.PI / 4 + Math.PI / 8 + 0.15, w = size * (i % 2 ? 0.07 : 0.11), rr = i % 2 ? r1 * 0.8 : r1 * 1.15;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(b) * r0, y + Math.sin(b) * r0 * 0.8);
          ctx.lineTo(x + Math.cos(b + Math.PI / 2) * w + Math.cos(b) * r0 * 1.1, y + (Math.sin(b + Math.PI / 2) * w + Math.sin(b) * r0 * 1.1) * 0.8);
          ctx.lineTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr * 0.8);
          ctx.lineTo(x - Math.cos(b + Math.PI / 2) * w + Math.cos(b) * r0 * 1.1, y + (-Math.sin(b + Math.PI / 2) * w + Math.sin(b) * r0 * 1.1) * 0.8);
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    }
    function hexA(h, a) { var c = hexRGB(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + clamp(a, 0, 1).toFixed(3) + ')'; }

    return {
      spawn: spawn, update: update, draw: draw,
      setParams: function (o) { set(o); RC = {}; rcN = 0; }, params: P,
      // call at battle/wave start; numbers spawned since the last update() survive
      clear: function () { pops = pops.filter(function (q) { return q.fresh; }); waiting = waiting.filter(function (w) { return w.fresh; }); },
      count: function () { return pops.filter(function (q) { return !q.gone; }).length + waiting.length; },
      rects: function () { return boxes(visible()); },        // live occupied rects, for other overlays to avoid
      lastDrawn: function () { return drawn.slice(); },      // one rect per drawn number (for tests): {pop, target, text, x, y, w, h, crit, type, adds}
      time: function () { return t; }
    };
  }
  root.GameDNA_DamagePop = { create: create, DEFAULTS: DEFAULTS, TYPES: Object.keys(TYPES), version: '1.1.0' };
})(typeof window !== 'undefined' ? window : this);
