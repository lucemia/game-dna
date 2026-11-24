/* GameDNA_PaintedUI v1.0 · L-06 UI frames & icon sheet · plain script, no dependencies, no import/export, one global.
 *
 * Draws a generated, style-locked UI kit (nine-slice window frames, a selection frame, an item slot, a pointer and an
 * icon atlas) that was made ONCE at build time and loaded with GameDNA_Assets (L-00). The game never calls a generator.
 * Every draw call returns false / null when its image is missing, so the caller keeps its old drawing as the fallback.
 *
 *   var ui = GameDNA_PaintedUI.create({assets: GameDNA_Assets, scale: 1, panel: 'rgba(28,22,18,0.96)'});
 *   ui.frame(ctx, rect, {variant: 'window'|'small'|'select'|'slot', panel, alpha, corner})  -> inner rect or null
 *   ui.icon(ctx, key, x, y, size, {alpha, dim, pad})   -> bool   (x, y = top-left of a size x size box)
 *   ui.cursor(ctx, x, y, h, {alpha, bob})              -> bool   (x, y = the pointer's tip; it points right)
 *   ui.select(ctx, rect, t)                            -> bool   (selection frame with a gentle pulse; t = seconds of YOUR clock)
 *   ui.has(key), ui.ready(), ui.iconKeys(), ui.resolve(kind, {accent, color}), ui.attach(GameDNA_Skin, opts)
 *
 * Kit keys (assets.json): 'frame-window', 'frame-small', 'select', 'slot' (role frame9: slice, inset, corner, panelInset),
 * 'cursor' (sprite, anchor at the tip), 'icons' (role icon, atlas {cols, rows, cell, keys}).
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var VARIANT_KEY = { window: 'frame-window', small: 'frame-small', tooltip: 'frame-small', button: 'frame-small', plate: 'frame-small', banner: 'frame-window', select: 'select', slot: 'slot' };
  // other names a game (or the G-01 shop) may use for the same picture
  var ALIAS = { 'healing-potion': 'potion', 'health-potion': 'potion', hp: 'potion', elixir: 'potion', mana: 'mana-potion', 'mp-potion': 'mana-potion', ether: 'mana-potion',
    herb: 'antidote', cure: 'antidote', food: 'bread', ration: 'bread', meal: 'bread', map: 'scroll', book: 'scroll', letter: 'scroll',
    jewel: 'gem', crystal: 'gem', ruby: 'gem', blade: 'sword', dagger: 'sword', spear: 'sword', edge: 'sword', weapon: 'sword',
    hatchet: 'axe', staff: 'staff', wand: 'staff', rod: 'staff', buckler: 'shield', helm: 'helmet', head: 'helmet', armour: 'armor', body: 'armor', mail: 'armor',
    shoes: 'boots', accessory: 'ring', necklace: 'amulet', charm: 'amulet', gold: 'coins', coin: 'coins', money: 'coins',
    'old-key': 'key', poisoned: 'poison', burning: 'burn', fire: 'burn', frozen: 'frost', ice: 'frost', freeze: 'frost',
    stun: 'shock', paralysis: 'shock', lightning: 'shock', regenerate: 'regen', regeneration: 'regen', heal: 'regen',
    defend: 'guard', protect: 'guard', 'def-up': 'guard', barrier: 'guard' };

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function okRect(r) { return r && isFinite(r.x) && isFinite(r.y) && r.w > 0 && r.h > 0; }

  function create(opts) {
    opts = opts || {};
    var A = opts.assets || root.GameDNA_Assets || null;
    var K = { scale: num(opts.scale, 1), panel: opts.panel == null ? 'rgba(28,22,18,0.96)' : opts.panel, maxCorner: opts.maxCorner };
    var atlasCache = null, cropCache = {};

    function get(key) { try { return A && typeof A.get === 'function' ? A.get(key) : null; } catch (e) { return null; } }
    function atlas() {
      if (atlasCache && atlasCache.rec === get('icons')) return atlasCache;
      var rec = get('icons'), m = rec && rec.meta && rec.meta.atlas;
      if (!rec || !m || !m.keys) return null;
      var idx = {}; m.keys.forEach(function (k, i) { idx[k] = i; });
      atlasCache = { rec: rec, cols: m.cols || 1, rows: m.rows || 1, cell: m.cell || (rec.w / (m.cols || 1)), idx: idx, keys: m.keys.slice() };
      return atlasCache;
    }
    // kind (+ G-01 style accent / colour) -> icon key in the atlas, or null
    function resolve(kind, o) {
      var at = atlas(); if (!at || kind == null) return null;
      var k = String(kind).toLowerCase(); o = o || {};
      if (k === 'potion' && (o.accent === 'blue' || o.color === 'blue')) k = 'mana-potion';
      if (k === 'potion' && (o.accent === 'green' || o.color === 'green')) k = 'antidote';
      if (at.idx[k] != null) return k;
      var a = (opts.alias && opts.alias[k]) || ALIAS[k];
      if (a && at.idx[a] != null) return a;
      return null;
    }

    // nine-slice drawing with clamped corners (a rect smaller than two corners shrinks the corners, never overlaps them)
    function nine(ctx, im, S, sl, x, y, w, h, kx, ky, fill) {
      var L = sl[0], T = sl[1], R = sl[2], B = sl[3], mw = S.w - L - R, mh = S.h - T - B;
      // corner sizes and the far corners' positions on whole px: every rect draws its corners with the same resampling
      var dl = Math.round(L * kx), dr = Math.round(R * kx), dt = Math.round(T * ky), db = Math.round(B * ky);
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      var part = function (sx, sy, sw, sh, X, Y, W, H) { if (sw > 0 && sh > 0 && W > 0.01 && H > 0.01) ctx.drawImage(im, sx, sy, sw, sh, X, Y, W, H); };
      // pieces meet on whole px (no overlap: an edge piece under a corner's transparent pixels would show through)
      var e = 0;
      if (fill) part(L, T, mw, mh, x + dl - e, y + dt - e, w - dl - dr + 2 * e, h - dt - db + 2 * e);
      part(L, 0, mw, T, x + dl - e, y, w - dl - dr + 2 * e, dt); part(L, S.h - B, mw, B, x + dl - e, y + h - db, w - dl - dr + 2 * e, db);
      part(0, T, L, mh, x, y + dt - e, dl, h - dt - db + 2 * e); part(S.w - R, T, R, mh, x + w - dr, y + dt - e, dr, h - dt - db + 2 * e);
      part(0, 0, L, T, x, y, dl, dt); part(S.w - R, 0, R, T, x + w - dr, y, dr, dt);
      part(0, S.h - B, L, B, x, y + h - db, dl, db); part(S.w - R, S.h - B, R, B, x + w - dr, y + h - db, dr, db);
    }
    function frameScale(m, r, o) {
      var sl = m.slice || [8, 8, 8, 8], corner = num(o.corner, num(m.corner, Math.max(sl[0], sl[1]) / 2) * K.scale);
      var k = corner / Math.max(sl[0], sl[1]);
      // short or narrow boxes: a corner is at most 1/3 of the box (opts.maxCorner), so ornaments never crowd the text band
      var cap = num(o.maxCorner, num(K.maxCorner, 1 / 3));
      if (cap > 0) k = Math.min(k, Math.min(r.w, r.h) * cap / Math.max(sl[0], sl[1]));
      // clamp: both corners must fit, with at least 2 px of edge between them
      var kx = Math.min(k, Math.max(0, r.w - 2) / (sl[0] + sl[2])), ky = Math.min(k, Math.max(0, r.h - 2) / (sl[1] + sl[3]));
      var kk = Math.min(kx, ky);   // keep corners square (uniform), never squash an ornament
      return kk;
    }
    // small frames (tooltips, buttons, plates) always get an opaque panel: icons or the world must not show through text
    function solid(c) {
      var m = /^rgba\(([^)]+)\)$/.exec(String(c || '').replace(/\s+/g, ''));
      if (!m) return c; var p = m[1].split(','); if (p.length < 4 || +p[3] >= 0.97) return c;
      return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',0.97)';
    }
    // the text-safe rect: inset past the border AND the corner ornaments' real extent (meta.safe, source px)
    function safeRect(m, r, k, band) {
      var sl = m.slice || [8, 8, 8, 8], ins = band === 'border' ? (m.inset || sl) : (m.safe || m.inset || sl);
      return { x: r.x + ins[0] * k, y: r.y + ins[1] * k, w: Math.max(0, r.w - (ins[0] + ins[2]) * k), h: Math.max(0, r.h - (ins[1] + ins[3]) * k) };
    }
    // draw one frame record into r with corner scale k (+ optional panel); returns the safe inner rect
    function drawFrame(ctx, img, S, m, r, k, panel, alpha, band) {
      var sl = m.slice || [S.w / 3, S.h / 3, S.w / 3, S.h / 3], ins = m.inset || sl, pa = ctx.globalAlpha, inner = null;
      ctx.save();
      try {
        if (alpha != null) ctx.globalAlpha = pa * num(alpha, 1);
        ctx.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
        if (panel) {   // the window's background: the kit's frames have an empty centre, so the panel is a plain fill under them
          var pi = num(m.panelInset, ins[0] * 0.5) * k;
          ctx.fillStyle = panel; roundRect(ctx, r.x + pi, r.y + pi, r.w - 2 * pi, r.h - 2 * pi, Math.max(2, pi)); ctx.fill();
        }
        nine(ctx, img, S, sl, r.x, r.y, r.w, r.h, k, k, m.fill !== false);
        inner = safeRect(m, r, k, band);
      } catch (e) { inner = null; }
      ctx.restore(); ctx.globalAlpha = pa;
      return inner;
    }
    function roundRect(ctx, x, y, w, h, rad) {
      rad = Math.max(0, Math.min(rad, w / 2, h / 2));
      ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.lineTo(x + w - rad, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
      ctx.lineTo(x + w, y + h - rad); ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h); ctx.lineTo(x + rad, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rad); ctx.lineTo(x, y + rad); ctx.quadraticCurveTo(x, y, x + rad, y); ctx.closePath();
    }

    var ui = { version: VERSION };
    ui.has = function (key) { return key === 'icons' ? !!atlas() : !!get(key); };
    ui.ready = function () { return !!(get('frame-window') || get('frame-small') || atlas()); };
    ui.iconKeys = function () { var at = atlas(); return at ? at.keys.slice() : []; };
    ui.resolve = resolve;
    ui.setScale = function (s) { K.scale = num(s, K.scale); return ui; };
    ui.setPanel = function (c) { K.panel = c; return ui; };

    var SMALL = { small: 1, tooltip: 1, button: 1, plate: 1 };
    // frame(ctx, rect, {variant, panel, alpha, corner, maxCorner, band}) -> the text-safe inner rect, or null when missing.
    // The inner rect is inset past the border AND the corner ornaments (meta.safe), so text placed inside it never touches
    // the frame; {band: 'border'} gives the older, border-only inset.
    ui.frame = function (ctx, r, o) {
      o = o || {};
      if (!ctx || !okRect(r)) return null;
      var v = o.variant || 'window', key = VARIANT_KEY[v] || v, rec = get(key);
      if (!rec || !rec.img) return null;
      var m = rec.meta || {}, panel = o.panel === undefined ? (m.fill === false && key !== 'select' ? K.panel : null) : o.panel;
      if (panel && SMALL[v]) panel = solid(panel);
      return drawFrame(ctx, rec.img, { w: rec.w, h: rec.h }, m, r, frameScale(m, r, o), panel, o.alpha, o.band);
    };
    // the text-safe rect a frame would give, without drawing (layout); {band: 'border'} = border-only inset
    ui.inner = function (r, o) {
      o = o || {}; var rec = get(VARIANT_KEY[o.variant || 'window'] || o.variant); if (!rec || !okRect(r)) return null;
      var m = rec.meta || {}; return safeRect(m, r, frameScale(m, r, o), o.band);
    };
    // selection frame, pulsing gently on the caller's clock (t in seconds; same t -> same pixels)
    ui.select = function (ctx, r, t, o) {
      o = o || {}; var a = 0.82 + 0.18 * Math.sin(num(t, 0) * 4.2);
      return !!ui.frame(ctx, r, { variant: 'select', panel: null, alpha: num(o.alpha, 1) * a, corner: o.corner });
    };
    // icon(ctx, key, x, y, size, {alpha, dim, pad}) -> bool; contained and centred in the size x size box at (x, y)
    ui.icon = function (ctx, key, x, y, size, o) {
      o = o || {};
      var at = atlas(), k = resolve(key, o);
      if (!ctx || !at || k == null || !(size > 0) || !isFinite(x) || !isFinite(y)) return false;
      var i = at.idx[k], c = at.cell, sx = (i % at.cols) * c, sy = Math.floor(i / at.cols) * c, pad = num(o.pad, 0), pa = ctx.globalAlpha, ok = true;
      ctx.save();
      try {
        ctx.globalAlpha = pa * num(o.alpha, 1) * (o.dim ? 0.62 : 1);
        ctx.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
        if (o.dim && 'filter' in ctx) ctx.filter = 'grayscale(0.9) brightness(1.25)';   // dimmed but still readable on a dark cell
        ctx.drawImage(at.rec.img, sx, sy, c, c, x + pad, y + pad, size - 2 * pad, size - 2 * pad);
      } catch (e) { ok = false; }
      ctx.restore(); ctx.globalAlpha = pa;
      return ok;
    };
    // cursor(ctx, x, y, h, {alpha, bob}) -> bool; (x, y) is the tip of the right-pointing pointer
    ui.cursor = function (ctx, x, y, h, o) {
      o = o || {}; var rec = get('cursor'); if (!ctx || !rec || !rec.img || !isFinite(x) || !isFinite(y)) return false;
      var hh = num(h, num(rec.meta && rec.meta.drawH, 16) * K.scale), s = hh / rec.h, w = rec.w * s, an = (rec.meta && rec.meta.anchor) || [0.96, 0.5], pa = ctx.globalAlpha, ok = true;
      ctx.save();
      try {
        if (o.alpha != null) ctx.globalAlpha = pa * num(o.alpha, 1);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(rec.img, x - an[0] * w + num(o.bob, 0), y - an[1] * hh, w, hh);
      } catch (e) { ok = false; }
      ctx.restore(); ctx.globalAlpha = pa;
      return ok;
    };

    // ---- skin bitmap roles (skins/skin-api.js v0.5) ----
    function canvas(w, h) {
      try { if (typeof document !== 'undefined') { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; } } catch (e) { }
      try { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); } catch (e) { }
      return null;
    }
    // a frame with its panel baked under it (skin frame9 roles draw the centre slice, so the window keeps a background)
    function withPanel(key, panel) {
      var rec = get(key); if (!rec) return null;
      var m = rec.meta || {}; if (m.fill !== false || !panel) return rec;
      var id = key + '|' + panel; if (cropCache[id]) return cropCache[id];
      var c = canvas(rec.w, rec.h); if (!c) return rec;
      var g = c.getContext('2d'), sl = m.slice || [8, 8, 8, 8], pi = num(m.panelInset, (m.inset || sl)[0] * 0.5);
      g.fillStyle = panel; roundRect(g, pi, pi, rec.w - 2 * pi, rec.h - 2 * pi, Math.max(2, pi)); g.fill();
      g.drawImage(rec.img, 0, 0);
      return (cropCache[id] = { img: c, meta: m });
    }
    function iconCanvas(k) {
      if (cropCache['icon|' + k]) return cropCache['icon|' + k];
      var at = atlas(); if (!at || at.idx[k] == null) return null;
      var c = canvas(at.cell, at.cell); if (!c) return null;
      var i = at.idx[k]; c.getContext('2d').drawImage(at.rec.img, (i % at.cols) * at.cell, Math.floor(i / at.cols) * at.cell, at.cell, at.cell, 0, 0, at.cell, at.cell);
      return (cropCache['icon|' + k] = { img: c, meta: { role: 'icon', kind: k } });
    }
    // attach(GameDNA_Skin, {corner, roles, icons, skins, pixel, shopIcons}) -> number of registrations.
    // Registers the frames for the skin frame roles (window, banner -> frame-window; tooltip, plate -> frame-small) and every
    // icon (+ aliases) for the 'icon' role. Global registrations reach non-pixel skins only (SPEC 2.7). With shopIcons
    // (default true) it also gives each non-pixel skin in opts.skins an icon(ctx, rect, kind, t, o) method that draws
    // the kit icon and otherwise falls back to GameDNA_ShopInventory.drawIcon, so G-01 shop windows show the kit icons.
    ui.attach = function (SK, o) {
      o = o || {}; SK = SK || root.GameDNA_Skin;
      if (!SK || !SK.bitmaps || typeof SK.bitmaps.set !== 'function') return 0;
      var n = 0, B = SK.bitmaps, reg = o.skin ? { skin: o.skin } : undefined, panel = o.panel === undefined ? K.panel : o.panel;
      var roles = o.roles || { window: 'frame-window', banner: 'frame-window', tooltip: 'frame-small', plate: 'frame-small' };
      Object.keys(roles).forEach(function (role) {
        var rec = withPanel(roles[role], role === 'plate' ? null : panel); if (!rec) return;
        var m = rec.meta || {}, sl = m.slice || [8, 8, 8, 8];
        var corner = num(o.corner && typeof o.corner === 'object' ? o.corner[role] : o.corner, num(m.corner, 12) * K.scale * (o.cornerScale || 1));
        var k = corner / Math.max(sl[0], sl[1]);
        if (B.set('frame9', role, rec.img, { slice: sl, scale: k, inset: (m.inset || sl).map(function (v) { return v * k; }), fill: true, pixel: !!o.pixel }, reg)) n++;
      });
      // named skins (opts.skins): their framed roles are drawn by the kit directly, with corners capped at 1/3 of short boxes
      // and the text-safe inner rect returned; the skin's shape.padding is raised to that inset (a padding hint), so
      // modules that size boxes from the padding (C-01 window-cursor) keep their text and arrow off the trim.
      // Call attach before creating those modules.
      // corner per role: opts.corner (number or {role: px}); otherwise the kit's corner x ui scale, and on small native
      // canvases (skin native height < 300, e.g. 256x224) 8 / 6 / 5 px (window / tooltip / plate), which keeps text and
      // C-01's fixed-offset 'more' arrow clear of the ornaments
      function cornerFor(sk, role, m) {
        var c = o.corner && typeof o.corner === 'object' ? o.corner[role] : o.corner;
        if (c != null && isFinite(+c)) return +c;
        if (sk && sk.native && sk.native.h && sk.native.h < 300) return { window: 8, banner: 8, tooltip: 6, plate: 5 }[role] || 6;
        return num(m.corner, 12) * K.scale * (o.cornerScale || 1);
      }
      (o.skins || []).forEach(function (id) {
        var s = typeof id === 'string' && typeof SK.get === 'function' ? SK.get(id) : id;
        if (!s || typeof s.frame !== 'function' || (s.pixel && !o.pixel) || s._paintedFrame) return;
        var old = s.frame, pad = 0;
        Object.keys(roles).forEach(function (role) {
          var rec = get(roles[role]); if (!rec) return; var m = rec.meta || {}, sl = m.slice || [8, 8, 8, 8];
          var corner = cornerFor(s, role, m);
          if (role === 'window') pad = Math.ceil((m.safe || m.inset || sl)[1] * corner / Math.max(sl[0], sl[1]));
        });
        if (pad && o.padding !== false) { s.shape = s.shape || {}; s.shape.padding = Math.max(s.shape.padding || 0, pad); }
        s.frame = function (ctx, r, st) {
          var role = (st && st.role) || 'window', key = roles[role];
          // item cells: modules draw grid cells as small square 'backing' bands (G-01 bag); SPEC v0.5 has no slot role, so
          // the kit slot is drawn for square backings up to 48 px (opts.cellSlots: false turns it off)
          if (role === 'backing' && o.cellSlots !== false && okRect(r) && Math.abs(r.w - r.h) <= 2 && r.w <= 48 && get('slot')) {
            var sm = get('slot').meta || {}; if (drawFrame(ctx, get('slot').img, { w: get('slot').w, h: get('slot').h }, sm, r, frameScale(sm, r, { corner: Math.max(3, r.w * 0.3) }), null, st && st.alpha)) return { x: r.x, y: r.y, w: r.w, h: r.h };
          }
          var rec = key && withPanel(key, role === 'plate' ? null : panel);
          if (rec && rec.img && okRect(r)) {
            var base = get(key), m = (base && base.meta) || rec.meta || {}, sl = m.slice || [8, 8, 8, 8];
            var corner = cornerFor(s, role, m);
            var k = frameScale(m, r, { corner: corner }), S = { w: base ? base.w : rec.img.width, h: base ? base.h : rec.img.height };
            var mm = {}; for (var q in m) mm[q] = m[q]; mm.fill = true;
            var inner = drawFrame(ctx, rec.img, S, mm, r, k, null, st && st.alpha);
            if (inner) return inner;
          }
          return old.apply(s, arguments);
        };
        s.frame.raw = old.raw || old; s._paintedFrame = true;
      });
      if (o.icons !== false) {
        var at = atlas();
        if (at) {
          var kinds = at.keys.slice(); Object.keys(ALIAS).forEach(function (a) { if (kinds.indexOf(a) < 0 && at.idx[ALIAS[a]] != null) kinds.push(a); });
          kinds.forEach(function (kind) { var c = iconCanvas(resolve(kind)); if (c && B.set('icon', kind, c.img, { role: 'icon', pixel: !!o.pixel }, reg)) n++; });
        }
      }
      if (o.shopIcons !== false && typeof SK.get === 'function') {
        // corner per role: opts.corner (number or {role: px}); otherwise the kit's corner x ui scale, and on small native
      // canvases (skin native height < 300, e.g. 256x224) 8 / 6 / 5 px (window / tooltip / plate), which keeps text and
      // C-01's fixed-offset 'more' arrow clear of the ornaments
      function cornerFor(sk, role, m) {
        var c = o.corner && typeof o.corner === 'object' ? o.corner[role] : o.corner;
        if (c != null && isFinite(+c)) return +c;
        if (sk && sk.native && sk.native.h && sk.native.h < 300) return { window: 8, banner: 8, tooltip: 6, plate: 5 }[role] || 6;
        return num(m.corner, 12) * K.scale * (o.cornerScale || 1);
      }
      (o.skins || []).forEach(function (id) {
          var s = typeof id === 'string' ? SK.get(id) : id; if (!s || (s.pixel && !o.pixel) || s._paintedIcon) return;
          var own = typeof s.icon === 'function' ? s.icon : null;
          s.icon = function (ctx, rect, kind, t, io) {
            io = io || {};
            if (rect && ui.icon(ctx, kind, rect.x, rect.y, Math.min(rect.w, rect.h), { dim: io.dim, accent: io.accent, color: io.color })) return true;
            if (own) return own.apply(s, arguments);
            var G = root.GameDNA_ShopInventory; if (G && typeof G.drawIcon === 'function' && rect) { G.drawIcon(ctx, kind, rect.x, rect.y, { color: io.color, accent: io.accent, grey: !!io.dim }); return true; }
            return false;
          };
          s._paintedIcon = true;
        });
      }
      return n;
    };
    return ui;
  }

  root.GameDNA_PaintedUI = { version: VERSION, create: create, ALIAS: ALIAS, VARIANTS: Object.keys(VARIANT_KEY) };
})(typeof window !== 'undefined' ? window : this);
