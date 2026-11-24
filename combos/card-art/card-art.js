/* card-art.js — Game DNA L-07 "Card illustrations" (v1). One plain script, no dependencies, no import/export.
 * Global: GameDNA_CardArt. Painted 2:3 card illustrations (bitmap files generated once at build time; the game never calls
 * an image generator) plus a code-drawn card frame (title, cost, type line, rules text drawn as live text, never in the image).
 *
 *   var art = GameDNA_CardArt.create({ src: 'cards/{key}.webp', keys: GameDNA_CardArt.PACK_KEYS });
 *   art.onReady(boot);                                    // images loaded (or failed) -> start the game
 *   art.drawDraft(ctx, draft);                            // G-07 upgrade draft: instead of draft.draw(ctx); paints each card's art inside it
 *   art.drawCard(ctx, {title, cost, type, text, rarity, art}, {x, y, w}); // the frame renderer (card games, A-10 hands, shops)
 *
 * Safe area (every illustration): the subject sits in the upper part (centre at ~28 % of the height, inside x 15-85 %, y 4-55 %);
 * the lower ~45 % is calm, darker background because text panels lie over it. Light from the top-left.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0';
  var PACK_KEYS = ['blade', 'fire', 'frost', 'storm', 'guard', 'heart', 'speed', 'gold', 'magic', 'luck', 'poison', 'light', 'crit', 'arrow', 'regen'];
  // words a designer's tag or upgrade id may use for a pack key (first match wins)
  var ALIASES = { sword: 'blade', blades: 'blade', melee: 'blade', attack: 'blade', strike: 'blade', atk: 'blade', damage: 'blade', slash: 'blade',
    flame: 'fire', burn: 'fire', ember: 'fire', ice: 'frost', cold: 'frost', freeze: 'frost', lightning: 'storm', thunder: 'storm', shock: 'storm', spark: 'storm',
    shield: 'guard', defense: 'guard', defence: 'guard', armor: 'guard', armour: 'guard', def: 'guard', block: 'guard', thorns: 'guard',
    hp: 'heart', health: 'heart', vigor: 'heart', vitality: 'heart', life: 'heart', maxhp: 'heart', haste: 'speed', move: 'speed', dash: 'speed', boots: 'speed', spd: 'speed',
    coin: 'gold', coins: 'gold', money: 'gold', greed: 'gold', magnet: 'gold', loot: 'gold', arcane: 'magic', spell: 'magic', mana: 'magic', mp: 'magic',
    fortune: 'luck', chance: 'luck', dodge: 'luck', venom: 'poison', toxic: 'poison', holy: 'light', radiance: 'light', revive: 'light', critical: 'crit', precision: 'crit',
    ranged: 'arrow', bow: 'arrow', reach: 'arrow', range: 'arrow', heal: 'regen', mend: 'regen', growth: 'regen', regenerate: 'regen', lifesteal: 'regen', leech: 'regen' };
  var DEFAULTS = { focusY: 0.28, shade: 0.9, textMin: 5.2, sheen: 'on' };
  // sheen: one diagonal sweep every 4 s, crossing the art while (t mod 4000) is in 2000..3800 (t = 3000: mid-card). In a G-07
  // draft t is the draft's own clock (state().t, ms since open), so every draft shows the sweep 2.0-3.8 s after it opens (choose stage)
  function sweepPos(t) { var ph = (((num(t, 0) % 4000) + 4000) % 4000) / 4000; return ph < 0.5 || ph > 0.95 ? null : -0.25 + (ph - 0.5) / 0.45 * 1.5; }
  // G-07 v1.0.0 card colours (copied so the art blends into its frame)
  var G7 = { LABELS: { COMMON: 'common', RARE: 'rare', EPIC: 'epic' },
    common: { bot: '28,33,49', edge: '#c3cad8', glow: '214,224,245' }, rare: { bot: '18,31,62', edge: '#6cc0ff', glow: '92,176,255' }, epic: { bot: '34,16,58', edge: '#d79bff', glow: '200,128,255' } };
  var FRAME = {
    common: { metal: ['#e9dcc0', '#b89a6a', '#6e5636'], edge: '#3a2a18', gem: ['#fff2cf', '#e2a84a', '#7a4a14'], glow: '255,214,140' },
    rare: { metal: ['#dff0ff', '#7fb2dc', '#2f5378'], edge: '#142638', gem: ['#e8f6ff', '#58a8e8', '#163c6e'], glow: '110,190,255' },
    epic: { metal: ['#f6e6ff', '#c08ae6', '#5a2d82'], edge: '#26103a', gem: ['#fff0ff', '#c070f0', '#4a1670'], glow: '210,140,255' },
    legendary: { metal: ['#fff6d8', '#f0c050', '#8a5a10'], edge: '#3a2404', gem: ['#fff8e0', '#ffb030', '#8a3a00'], glow: '255,200,90' }
  };
  var FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', SERIF = 'Georgia, "Times New Roman", serif';

  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function c01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function rr(ctx, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function warnFn(prefix) { var seen = {}; return function (k, m) { if (seen[k]) return; seen[k] = 1; try { if (root.console) console.warn('GameDNA_CardArt: ' + m); } catch (e) { } }; }
  var warnG = warnFn();
  function rarityOf(r) { r = String(r || 'common').toLowerCase(); return FRAME[r] ? r : 'common'; }

  /* ---------- image records ---------- */
  function loadImage(src, done) {
    if (src && typeof src === 'object') { var ok = (src.naturalWidth || src.width) > 0; done(ok ? src : null); return src; }
    var im; try { im = new Image(); } catch (e) { done(null); return null; }
    var fin = false, end = function (ok) { if (fin) return; fin = true; done(ok ? im : null); };
    im.onload = function () { end(true); }; im.onerror = function () { end(false); };
    im.decoding = 'async'; im.src = src;
    if (im.complete && im.naturalWidth) end(true);
    return im;
  }

  // draw a 2:3 illustration into any rect: cover-fit, keeping the safe area (focusY = subject centre as a fraction of the height)
  function blit(ctx, img, x, y, w, h, focusY) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height; if (!(iw > 0 && ih > 0 && w > 0 && h > 0)) return;
    var s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
    var fy = c01(num(focusY, DEFAULTS.focusY)), dx = x + (w - dw) / 2;
    var dy = Math.min(y, Math.max(y + h - dh, y + h * fy - dh * fy));   // the subject keeps its relative height; a tall crop loses mostly the calm bottom
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  /* ---------- text helpers for the frame ---------- */
  function wrap(ctx, text, maxW) {
    var out = [], paras = String(text == null ? '' : text).split('\n');
    paras.forEach(function (p) {
      var words = p.split(/\s+/).filter(Boolean), line = '';
      words.forEach(function (wd) { var t = line ? line + ' ' + wd : wd; if (ctx.measureText(plain(t)).width > maxW && line) { out.push(line); line = wd; } else line = t; });
      out.push(line);
    });
    return out;
  }
  function plain(s) { return String(s).replace(/\*/g, ''); }
  function richLine(ctx, line, cx, y, col, accent, st) {   // *word* = accent colour (values); centred
    var segs = [], buf = '', hi = st.hi;
    for (var i = 0; i < line.length; i++) { var ch = line[i]; if (ch === '*') { if (buf) segs.push({ t: buf, hi: hi }); buf = ''; hi = !hi; } else buf += ch; }
    if (buf) segs.push({ t: buf, hi: hi }); st.hi = hi;
    var tot = 0; segs.forEach(function (g) { g.w = ctx.measureText(g.t).width; tot += g.w; });
    var x = cx - tot / 2; ctx.textAlign = 'left';
    segs.forEach(function (g) { ctx.fillStyle = g.hi ? accent : col; ctx.fillText(g.t, x, y); x += g.w; });
    return tot;
  }

  /* ---------- the code-drawn card frame ---------- */
  // layout in card units u = w / 100 (card h = 150 u, 2:3)
  function cardLayout(rect) {
    var w = num(rect.w, 0), h = rect.h > 0 ? +rect.h : w * 1.5; if (rect.h > 0 && !(rect.w > 0)) w = h / 1.5;
    if (Math.abs(h / w - 1.5) > 0.01) { var s = Math.min(w, h / 1.5); var ox = (w - s) / 2, oy = (h - s * 1.5) / 2; return cardLayout({ x: rect.x + ox, y: rect.y + oy, w: s }); }
    var u = w / 100, x = num(rect.x, 0), y = num(rect.y, 0);
    var artB = y + 92 * u;
    return { u: u, card: { x: x, y: y, w: w, h: h }, art: { x: x + 5 * u, y: y + 5 * u, w: 90 * u, h: artB - y - 5 * u },
      cost: { x: x + 1.5 * u, y: y + 1.5 * u, w: 19 * u, h: 19 * u }, title: { x: x + 7 * u, y: y + 85.5 * u, w: 86 * u, h: 13 * u },
      type: { x: x + 10 * u, y: y + 99.5 * u, w: 80 * u, h: 6 * u }, text: { x: x + 9 * u, y: y + 106 * u, w: 82 * u, h: 38.5 * u } };
  }

  function drawFrame(ctx, img, card, L, o, P, SKF) {
    var u = L.u, x = L.card.x, y = L.card.y, w = L.card.w, h = L.card.h, R = FRAME[rarityOf(card.rarity)], t = num(o.t, 0);
    var uiF = SKF || FONT;
    ctx.save();
    // drop shadow + selection glow
    rr(ctx, x, y, w, h, 7 * u);
    ctx.shadowColor = o.selected ? 'rgba(' + R.glow + ',0.85)' : 'rgba(0,0,0,0.5)'; ctx.shadowBlur = (o.selected ? 16 : 9) * u * scaleOf(ctx); ctx.shadowOffsetY = (o.selected ? 0 : 3) * u * scaleOf(ctx);
    ctx.fillStyle = R.edge; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.shadowColor = 'transparent';
    // metal rim
    var mg = ctx.createLinearGradient(x, y, x + w * 0.6, y + h); mg.addColorStop(0, R.metal[0]); mg.addColorStop(0.35, R.metal[1]); mg.addColorStop(1, R.metal[2]);
    rr(ctx, x + 0.6 * u, y + 0.6 * u, w - 1.2 * u, h - 1.2 * u, 6.4 * u); ctx.fillStyle = mg; ctx.fill();
    // inner body (walnut)
    rr(ctx, x + 3 * u, y + 3 * u, w - 6 * u, h - 6 * u, 4.5 * u); var bg = ctx.createLinearGradient(0, y, 0, y + h); bg.addColorStop(0, '#2b2219'); bg.addColorStop(1, '#16110c'); ctx.fillStyle = bg; ctx.fill();
    // art window
    var A = L.art;
    ctx.save(); rr(ctx, A.x, A.y, A.w, A.h, 3 * u); ctx.clip();
    if (img) blit(ctx, img, A.x, A.y, A.w, A.h, card.focusY != null ? card.focusY : P.focusY);
    else { var ph = ctx.createLinearGradient(0, A.y, 0, A.y + A.h); ph.addColorStop(0, '#3a4a48'); ph.addColorStop(1, '#1a2224'); ctx.fillStyle = ph; ctx.fillRect(A.x, A.y, A.w, A.h); }
    var vg = ctx.createLinearGradient(0, A.y + A.h * 0.62, 0, A.y + A.h); vg.addColorStop(0, 'rgba(14,10,6,0)'); vg.addColorStop(1, 'rgba(14,10,6,0.55)'); ctx.fillStyle = vg; ctx.fillRect(A.x, A.y, A.w, A.h);
    var sp = sweepPos(t);
    if (P.sheen === 'on' && rarityOf(card.rarity) !== 'common' && sp !== null) {     // diagonal sheen on rare and better (game time only)
      ctx.globalCompositeOperation = 'lighter'; var sx = A.x + sp * A.w;
      var sg = ctx.createLinearGradient(sx - 14 * u, A.y, sx + 14 * u, A.y + A.h); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(' + R.glow + ',0.16)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = sg; ctx.fillRect(A.x, A.y, A.w, A.h);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    rr(ctx, A.x, A.y, A.w, A.h, 3 * u); ctx.strokeStyle = 'rgba(20,12,4,0.85)'; ctx.lineWidth = 1 * u; ctx.stroke();
    rr(ctx, A.x - 0.9 * u, A.y - 0.9 * u, A.w + 1.8 * u, A.h + 1.8 * u, 3.8 * u); ctx.strokeStyle = R.metal[1]; ctx.lineWidth = 0.7 * u; ctx.stroke();
    // text panel (parchment-dark)
    var T = { x: x + 5 * u, y: y + 95 * u, w: 90 * u, h: h - 100 * u };
    rr(ctx, T.x, T.y, T.w, T.h, 3 * u); var tg = ctx.createLinearGradient(0, T.y, 0, T.y + T.h); tg.addColorStop(0, '#3a2e22'); tg.addColorStop(1, '#251d15'); ctx.fillStyle = tg; ctx.fill();
    ctx.strokeStyle = 'rgba(' + R.glow + ',0.28)'; ctx.lineWidth = 0.6 * u; ctx.stroke();
    // title plate (overlaps the art's lower edge)
    var Ti = L.title; rr(ctx, Ti.x, Ti.y, Ti.w, Ti.h, 2.5 * u);
    var pg = ctx.createLinearGradient(0, Ti.y, 0, Ti.y + Ti.h); pg.addColorStop(0, R.metal[0]); pg.addColorStop(0.5, R.metal[1]); pg.addColorStop(1, R.metal[2]); ctx.fillStyle = pg; ctx.fill();
    ctx.strokeStyle = R.edge; ctx.lineWidth = 0.8 * u; ctx.stroke();
    rr(ctx, Ti.x + 1.4 * u, Ti.y + 1.4 * u, Ti.w - 2.8 * u, Ti.h - 2.8 * u, 1.6 * u); ctx.fillStyle = '#2a1f14'; ctx.fill();
    var title = String(card.title == null ? '' : card.title), fs = 7.4 * u;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.font = '700 ' + fs.toFixed(2) + 'px ' + SERIF; var tw = ctx.measureText(title).width, maxTw = Ti.w - 8 * u;
    if (tw > maxTw) { fs = Math.max(4.4 * u, fs * maxTw / tw); ctx.font = '700 ' + fs.toFixed(2) + 'px ' + SERIF; }
    while (ctx.measureText(title).width > maxTw && title.length > 2) title = title.slice(0, -2) + '…';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(title, Ti.x + Ti.w / 2, Ti.y + Ti.h / 2 + 0.7 * u);
    ctx.fillStyle = '#f6ecd6'; ctx.fillText(title, Ti.x + Ti.w / 2, Ti.y + Ti.h / 2);
    var boxes = { title: { x: Ti.x + Ti.w / 2 - Math.min(maxTw, ctx.measureText(title).width) / 2, y: Ti.y + Ti.h / 2 - fs * 0.55, w: Math.min(maxTw, ctx.measureText(title).width), h: fs * 1.1 } };
    // type line
    if (card.type) {
      ctx.font = '700 ' + (4.4 * u).toFixed(2) + 'px ' + uiF; setLS(ctx, (0.5 * u).toFixed(2) + 'px');
      var ty = String(card.type).toUpperCase(); ctx.fillStyle = 'rgba(' + R.glow + ',0.9)'; ctx.fillText(ty, x + w / 2, L.type.y + L.type.h / 2); setLS(ctx, '0px');
      var tyw = ctx.measureText(ty).width; boxes.type = { x: x + w / 2 - tyw / 2, y: L.type.y, w: tyw, h: L.type.h };
    }
    // rules text: fits the panel, steps the font down, then ellipsizes
    var TX = L.text, size = 7.2, lines = null, lh = 0;
    for (; size >= P.textMin; size -= 0.3) { ctx.font = '500 ' + (size * u).toFixed(2) + 'px ' + uiF; lh = size * 1.22 * u; lines = wrap(ctx, card.text, TX.w); if (lines.length * lh <= TX.h) break; }
    if (size < P.textMin) { size = P.textMin; ctx.font = '500 ' + (size * u).toFixed(2) + 'px ' + uiF; lh = size * 1.22 * u; lines = wrap(ctx, card.text, TX.w); var maxL = Math.max(1, Math.floor(TX.h / lh)); if (lines.length > maxL) { lines = lines.slice(0, maxL); lines[maxL - 1] = lines[maxL - 1].replace(/\s*\S*$/, '') + '…'; } }
    var y0 = TX.y + (TX.h - lines.length * lh) / 2 + lh / 2, st = { hi: false }; boxes.text = [];
    lines.forEach(function (l, i) { var lw = richLine(ctx, l, x + w / 2, y0 + i * lh, '#efe4cf', '#ffd27a', st); boxes.text.push({ x: x + w / 2 - lw / 2, y: y0 + i * lh - size * u * 0.55, w: lw, h: size * u * 1.1 }); });
    // cost gem
    if (card.cost != null && card.cost !== '') {
      var C = L.cost, cx = C.x + C.w / 2, cy = C.y + C.h / 2, r = C.w / 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = R.edge; ctx.fill();
      var gg = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 0.92); gg.addColorStop(0, R.gem[0]); gg.addColorStop(0.45, R.gem[1]); gg.addColorStop(1, R.gem[2]);
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2); ctx.fillStyle = gg; ctx.fill(); ctx.strokeStyle = R.metal[0]; ctx.lineWidth = 0.8 * u; ctx.stroke();
      var cs = String(card.cost); ctx.font = '800 ' + ((cs.length > 1 ? 9 : 11) * u).toFixed(2) + 'px ' + uiF; ctx.textAlign = 'center';
      ctx.lineWidth = 1.6 * u; ctx.strokeStyle = 'rgba(20,10,0,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(cs, cx, cy + 0.6 * u); ctx.fillStyle = '#fffaf0'; ctx.fillText(cs, cx, cy + 0.6 * u);
      boxes.cost = { x: C.x, y: C.y, w: C.w, h: C.h };
    }
    // rarity jewel at the bottom edge
    ctx.beginPath(); ctx.moveTo(x + w / 2, y + h - 4.2 * u); ctx.lineTo(x + w / 2 + 3 * u, y + h - 1.6 * u); ctx.lineTo(x + w / 2, y + h + 1 * u); ctx.lineTo(x + w / 2 - 3 * u, y + h - 1.6 * u); ctx.closePath();
    ctx.fillStyle = R.gem[1]; ctx.fill(); ctx.strokeStyle = R.edge; ctx.lineWidth = 0.6 * u; ctx.stroke();
    if (o.dim) { rr(ctx, x, y, w, h, 7 * u); ctx.fillStyle = 'rgba(8,8,14,' + c01(num(o.dim === true ? 0.45 : o.dim, 0.45)) + ')'; ctx.fill(); }
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.restore();
    return boxes;
  }

  function drawBackFace(ctx, L) {
    var u = L.u, x = L.card.x, y = L.card.y, w = L.card.w, h = L.card.h, R = FRAME.common;
    ctx.save(); rr(ctx, x, y, w, h, 7 * u); ctx.fillStyle = R.edge; ctx.fill();
    var mg = ctx.createLinearGradient(x, y, x + w, y + h); mg.addColorStop(0, R.metal[0]); mg.addColorStop(0.4, R.metal[1]); mg.addColorStop(1, R.metal[2]);
    rr(ctx, x + 0.6 * u, y + 0.6 * u, w - 1.2 * u, h - 1.2 * u, 6.4 * u); ctx.fillStyle = mg; ctx.fill();
    rr(ctx, x + 3 * u, y + 3 * u, w - 6 * u, h - 6 * u, 4.5 * u); var bg = ctx.createRadialGradient(x + w / 2, y + h / 2, 2 * u, x + w / 2, y + h / 2, h * 0.6); bg.addColorStop(0, '#3c5a50'); bg.addColorStop(1, '#14201c'); ctx.fillStyle = bg; ctx.fill();
    ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(240,210,150,0.13)'; ctx.lineWidth = 0.8 * u;
    for (var k = -12; k <= 12; k++) { ctx.beginPath(); ctx.moveTo(x + k * 10 * u, y); ctx.lineTo(x + k * 10 * u + h, y + h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + k * 10 * u + h, y); ctx.lineTo(x + k * 10 * u, y + h); ctx.stroke(); }
    ctx.restore();
    var cx = x + w / 2, cy = y + h / 2; ctx.translate(cx, cy); ctx.rotate(Math.PI / 4); rr(ctx, -16 * u, -16 * u, 32 * u, 32 * u, 3 * u); ctx.strokeStyle = R.metal[1]; ctx.lineWidth = 1.6 * u; ctx.stroke();
    rr(ctx, -9 * u, -9 * u, 18 * u, 18 * u, 2 * u); ctx.fillStyle = R.gem[1]; ctx.fill(); ctx.strokeStyle = R.edge; ctx.lineWidth = 0.8 * u; ctx.stroke();
    ctx.restore();
  }
  function setLS(ctx, v) { try { if ('letterSpacing' in ctx) ctx.letterSpacing = v; } catch (e) { } }
  function scaleOf(ctx) { try { var m = ctx.getTransform(); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; } catch (e) { return 1; } }

  /* ---------- G-07 bridge: paint the art inside each HD card of an upgrade draft ---------- */
  // G-07 v1.0.0 draws an HD card face as: background, rarity chip (measureText of COMMON / RARE / EPIC), stack pips, medallion + icon
  // (starting with a createRadialGradient), name (fillText with the 0.45 black shadow first), tags, text, stat well, synergy ribbon.
  // drawDraft runs the draft's draw twice per frame: a dry pass into a no-op context that only records which card each face is,
  // then the real pass through a proxy that paints the illustration at the rarity chip (under chip, pips, name and text) and
  // skips the medallion fill/stroke calls up to the name. Back faces, the strip, the hints and the pixel look are untouched.
  var NOOP = function () { }, GRAD = { addColorStop: NOOP };
  function makeDry(real, onLabel, onName) {
    var store = { font: '10px sans-serif', letterSpacing: '0px', fillStyle: '#000', globalAlpha: 1 }, mc = null;
    try { mc = root.document.createElement('canvas').getContext('2d'); } catch (e) { mc = null; }
    var measure = function (s) { if (!mc) return { width: String(s).length * 6 }; mc.font = store.font; setLS(mc, store.letterSpacing); var m = mc.measureText(s); if (G7.LABELS[s] && /\b800\b/.test(store.font)) onLabel(s, store.font); return m; };
    var fillText = function (s) { if (store.fillStyle === 'rgba(0,0,0,0.45)') onName(String(s)); };
    var dims = { width: real.canvas ? real.canvas.width : 640, height: real.canvas ? real.canvas.height : 360 };
    var getT = function () { try { return real.getTransform(); } catch (e) { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; } };
    return new Proxy({}, {
      get: function (_, k) {
        if (k === 'canvas') return dims; if (k === 'measureText') return measure; if (k === 'fillText') return fillText; if (k === 'getTransform') return getT;
        if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' || k === 'createConicGradient') return function () { return GRAD; };
        if (k in store) return store[k];
        return NOOP;
      },
      set: function (_, k, v) { store[k] = v; return true; },
      has: function () { return true; }
    });
  }
  function makeLive(real, hooks) {
    var bound = {}, lastFill = null;
    return new Proxy(real, {
      get: function (t, k) {
        if (hooks[k]) return hooks[k];
        var v = t[k];
        if (typeof v === 'function') return bound[k] || (bound[k] = v.bind(t));
        return v;
      },
      set: function (t, k, v) { t[k] = v; return true; },
      has: function (t, k) { return k in t; }
    });
  }

  function create(o) {
    o = o || {};
    var P = {}, k; for (k in DEFAULTS) P[k] = DEFAULTS[k]; if (o.params) for (k in o.params) if (o.params[k] != null) P[k] = o.params[k];
    var warn = warnFn(), recs = {}, pending = 0, readyFns = [], drawnList = [], cardRecs = {}, cardN = 0, skinFont = null;
    function rec(r) { var id = r.id != null ? 'id:' + r.id : 'n:' + (cardN++ % 64); cardRecs[id] = r; }   // newest rect per card id (beginFrame() clears)
    var stats = { draftFrames: 0, faces: 0, withArt: 0, noArt: 0, notLoaded: 0, swallowed: 0, mismatch: 0, cards: 0, fallbacks: 0 };
    var SK = null; try { SK = o.skin === false || !root.GameDNA_Skin ? null : (o.skin ? root.GameDNA_Skin.resolve(o.skin) : null); if (SK && SK.pixel === false && SK.fonts && SK.fonts.ui && SK.fonts.ui.family) skinFont = SK.fonts.ui.family + ', ' + FONT; } catch (e) { SK = null; }
    var base = o.base || '';
    function addArt(key, src) {
      key = String(key); if (recs[key] || src == null) return;
      var r = recs[key] = { key: key, src: src, img: null, state: 'loading' }; pending++;
      if (typeof src === 'string' && base && !/^([a-z]+:|\/|data:)/i.test(src)) src = base + src;
      loadImage(src, function (im) { r.img = im; r.state = im ? 'ok' : 'failed'; if (!im) warn('load' + key, 'could not load the illustration "' + key + '" (' + (typeof src === 'string' ? src : 'image') + ')'); pending--; if (pending === 0) flush(); });
    }
    function flush() { var f = readyFns; readyFns = []; f.forEach(function (fn) { try { fn(api); } catch (e) { warn('ready', 'onReady callback threw: ' + e); } }); }
    // sources: art map, src pattern + keys, manifest
    if (o.art) for (k in o.art) addArt(k, o.art[k]);
    if (o.src) (o.keys || PACK_KEYS).forEach(function (key) { addArt(key, String(o.src).split('{key}').join(key)); });
    if (o.manifest) { var mf = GameDNA_CardArt.fromManifest(o.manifest); for (k in mf) addArt(k, mf[k]); }
    var map = o.map || {}, table = {};
    (o.upgrades || o.cards || []).forEach(function (u) { if (u && u.id != null) table[String(u.id)] = u; });
    function has(key) { return !!(key && recs[key]); }
    function canon(w) { w = String(w || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); if (recs[w]) return w; if (ALIASES[w] && recs[ALIASES[w]]) return ALIASES[w]; return null; }
    // which illustration a card or upgrade gets: map[id] -> its own `art` -> its id -> its tags / icon -> words of its id and name
    function keyFor(u) {
      if (u == null) return null; if (typeof u === 'string') u = table[u] || { id: u };
      var id = u.id != null ? String(u.id) : null, own = id && table[id] ? table[id] : null, c;
      if (id && map[id] != null) return has(String(map[id])) ? String(map[id]) : null;
      var art = u.art != null ? u.art : own && own.art; if (art === false || art === null && own && own.art === null) return null;
      if (art != null && has(String(art))) return String(art);
      if (typeof o.artFor === 'function') { try { var r = o.artFor(own || u); if (r === null || r === false) return null; if (r != null && has(String(r))) return String(r); } catch (e) { warn('artFor', 'artFor threw: ' + e); } }
      if (id && (c = canon(id))) return c;
      var tags = (u.tags || (own && own.tags) || []).concat([u.icon || (own && own.icon)]);
      for (var i = 0; i < tags.length; i++) if (tags[i] && (c = canon(tags[i]))) return c;
      var words = ((id || '') + ' ' + (u.name || (own && own.name) || '')).split(/[^A-Za-z0-9]+/);
      for (i = 0; i < words.length; i++) if (words[i] && (c = canon(words[i]))) return c;
      return null;
    }
    function imgOf(key) { var r = key && recs[key]; return r && r.state === 'ok' ? r.img : null; }

    function drawArt(ctx, key, rect, opts) {
      opts = opts || {}; try {
        var im = imgOf(key); if (!im || !ctx || !rect) return false;
        ctx.save(); if (opts.alpha != null) ctx.globalAlpha *= c01(opts.alpha);
        if (opts.radius) { rr(ctx, rect.x, rect.y, rect.w, rect.h, opts.radius); ctx.clip(); }
        blit(ctx, im, rect.x, rect.y, rect.w, rect.h, opts.focusY != null ? opts.focusY : P.focusY); ctx.restore(); return true;
      } catch (e) { warn('drawArt', 'drawArt error: ' + e); return false; }
    }
    function drawCard(ctx, card, rect, opts) {
      opts = opts || {}; if (!ctx || !card || !rect) return null;
      try {
        var L = cardLayout(rect); stats.cards++;
        if (opts.faceDown) { drawBackFace(ctx, L); rec({ kind: 'card', id: card.id != null ? card.id : null, key: null, faceDown: true, x: L.card.x, y: L.card.y, w: L.card.w, h: L.card.h }); return L; }
        var key = card.art !== undefined && card.art !== null && has(String(card.art)) ? String(card.art) : keyFor(card);
        var boxes = drawFrame(ctx, imgOf(key), card, L, opts, P, skinFont);
        L.boxes = boxes; L.key = key;
        rec({ kind: 'card', id: card.id != null ? card.id : null, key: key, art: !!imgOf(key), x: L.card.x, y: L.card.y, w: L.card.w, h: L.card.h });
        return L;
      } catch (e) { warn('drawCard', 'drawCard error: ' + (e && e.stack || e)); return null; }
    }

    // the art inside one G-07 HD face, in card-local units (U = the card's unit, w = 148 U, h = 1.36 w)
    function paintFace(ctx, im, rarity, U, t) {
      var w = 148 * U, h = w * 1.36, G = G7[rarity] || G7.common, ix = -w / 2 + 5 * U, iy = -h / 2 + 5 * U, iw = w - 10 * U, ih = h - 10 * U;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.setLineDash && ctx.setLineDash([]);
      rr(ctx, ix, iy, iw, ih, 8.5 * U); ctx.clip();
      blit(ctx, im, ix, iy, iw, ih, P.focusY);
      // legibility: the lower part darkens into the rarity colour (the name starts ~91 U from the top)
      var sh = c01(num(P.shade, 0.9)), g = ctx.createLinearGradient(0, -h / 2 + 46 * U, 0, -h / 2 + 104 * U);
      g.addColorStop(0, 'rgba(' + G.bot + ',0)'); g.addColorStop(0.55, 'rgba(' + G.bot + ',' + (sh * 0.72).toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + G.bot + ',' + sh.toFixed(3) + ')');
      ctx.fillStyle = g; ctx.fillRect(ix, -h / 2 + 46 * U, iw, 58 * U);
      ctx.fillStyle = 'rgba(' + G.bot + ',' + sh.toFixed(3) + ')'; ctx.fillRect(ix, -h / 2 + 104 * U, iw, h);
      var tg = ctx.createLinearGradient(0, iy, 0, iy + 30 * U); tg.addColorStop(0, 'rgba(8,10,20,0.45)'); tg.addColorStop(1, 'rgba(8,10,20,0)'); ctx.fillStyle = tg; ctx.fillRect(ix, iy, iw, 30 * U);
      var sp = sweepPos(t);
      if (rarity !== 'common' && P.sheen === 'on' && sp !== null) { ctx.globalCompositeOperation = 'lighter'; var sx = ix + sp * iw; var sg = ctx.createLinearGradient(sx - 42 * U, -h / 2, sx + 42 * U, -h / 2 + 70 * U); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(' + G.glow + ',' + (rarity === 'epic' ? 0.42 : 0.28) + ')'); sg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = sg; ctx.fillRect(ix, iy, iw, ih); ctx.globalCompositeOperation = 'source-over'; }
      ctx.restore();
      rr(ctx, ix, iy, iw, ih, 8.5 * U); ctx.strokeStyle = 'rgba(' + G.glow + ',0.45)'; ctx.lineWidth = 1 * U; ctx.stroke();
    }

    function drawDraft(ctx, draft, ox, oy) {
      if (!draft || typeof draft.draw !== 'function') return;
      var busy = false; try { busy = !!(draft.busy && draft.busy()); } catch (e) { }
      var st = null; try { st = draft.state ? draft.state() : null; } catch (e) { }
      drawnList = drawnList.filter(function (r) { return r.kind !== 'draft-card'; });
      if (!ctx || !busy || !st || typeof Proxy !== 'function' || !Object.keys(recs).length) { draft.draw(ctx, ox, oy); return; }
      var names = {}, ids = st.hand || [];
      try { (draft.table ? draft.table() : []).forEach(function (u) { names[u.id] = u; }); } catch (e) { }
      // 1. dry pass: which card each face is, in draw order
      var faces = [], cur = null;
      try {
        var dry = makeDry(ctx, function (label) { cur = { rarity: G7.LABELS[label], name: null }; faces.push(cur); }, function (s) { if (cur && cur.name == null) cur.name = s; });
        draft.draw(dry, ox, oy);
      } catch (e) { warn('dry', 'dry pass failed (' + e + '); the draft is drawn without art'); stats.fallbacks++; draft.draw(ctx, ox, oy); return; }
      var shown = [];
      faces.forEach(function (f) {
        var nm = String(f.name || '').replace(/…$/, ''), best = null;
        ids.forEach(function (id) { var u = names[id]; if (!u || best) return; if (String(u.rarity) === f.rarity && String(u.name).indexOf(nm) === 0) best = u; });
        if (!best) ids.forEach(function (id) { var u = names[id]; if (!best && u && String(u.name).indexOf(nm) === 0) best = u; });
        f.id = best ? best.id : null; f.key = best ? keyFor(best) : null;
      });
      // 2. live pass
      stats.draftFrames++;
      var n = -1, armed = false, swallow = false, face = null, base = null, t = num(st.t, 0);
      try { base = ctx.getTransform(); } catch (e) { }
      var hooks = {
        measureText: function (s) {
          var m = ctx.measureText(s);
          if (G7.LABELS[s] && /\b800\b/.test(String(ctx.font))) {
            n++; face = faces[n] || null; armed = false; swallow = false;
            if (face) {
              stats.faces++;
              var im = imgOf(face.key);
              if (!face.key) stats.noArt++; else if (!im) stats.notLoaded++;
              if (im) {
                var U = (parseFloat((/([\d.]+)px/.exec(String(ctx.font)) || [])[1]) || 8.5) / 8.5;
                try { paintFace(ctx, im, face.rarity, U, t); stats.withArt++; armed = true; face.drawn = true; } catch (e) { warn('face', 'art draw error: ' + e); }
                try { var M = ctx.getTransform(), iv = base ? base.inverse().multiply(M) : M, w = 148 * U, h = w * 1.36, cx = iv.e, cy = iv.f, sx = Math.hypot(iv.a, iv.b), sy = Math.hypot(iv.c, iv.d);
                  shown.push({ kind: 'draft-card', id: face.id, key: face.key, x: cx - w * sx / 2, y: cy - h * sy / 2, w: w * sx, h: h * sy, rot: Math.atan2(iv.b, iv.a) }); } catch (e) { }
              }
            }
          }
          return m;
        },
        createRadialGradient: function () { if (armed) { armed = false; swallow = true; } return ctx.createRadialGradient.apply(ctx, arguments); },
        fill: function () { if (swallow) { stats.swallowed++; return; } return ctx.fill.apply(ctx, arguments); },
        stroke: function () { if (swallow) { stats.swallowed++; return; } return ctx.stroke.apply(ctx, arguments); },
        fillRect: function () { if (swallow) { stats.swallowed++; return; } return ctx.fillRect.apply(ctx, arguments); },
        strokeRect: function () { if (swallow) { stats.swallowed++; return; } return ctx.strokeRect.apply(ctx, arguments); },
        fillText: function (s) {
          if (swallow) { swallow = false; if (face && face.name != null && String(s) !== face.name) stats.mismatch++; }
          return ctx.fillText.apply(ctx, arguments);
        }
      };
      try { draft.draw(makeLive(ctx, hooks), ox, oy); }
      catch (e) { warn('live', 'live pass failed: ' + e); stats.fallbacks++; }
      drawnList = drawnList.filter(function (r) { return r.kind !== 'draft-card'; }).concat(shown);
    }

    var api = {
      version: VERSION,
      onReady: function (fn) { if (typeof fn !== 'function') return api; if (pending === 0) { try { fn(api); } catch (e) { warn('ready', 'onReady callback threw: ' + e); } } else readyFns.push(fn); return api; },
      ready: function () { return pending === 0; },
      status: function () { var s = { ready: pending === 0, art: {} }; for (var q in recs) s.art[q] = recs[q].state; return s; },
      keys: function () { return Object.keys(recs); }, has: has, keyFor: keyFor, image: imgOf,
      add: function (key, src) { addArt(key, src); return api; },
      setMap: function (m) { map = m || {}; }, setTable: function (list) { table = {}; (list || []).forEach(function (u) { if (u && u.id != null) table[String(u.id)] = u; }); },
      drawArt: drawArt, drawCard: drawCard, drawBack: function (ctx, rect) { try { var L = cardLayout(rect); drawBackFace(ctx, L); return L; } catch (e) { return null; } },
      layout: cardLayout, drawDraft: drawDraft,
      beginFrame: function () { drawnList = []; cardRecs = {}; },
      lastDrawn: function () { var out = drawnList.slice(); for (var q in cardRecs) out.push(cardRecs[q]); return out; }, stats: function () { var c = {}; for (var q in stats) c[q] = stats[q]; return c; },
      setParams: function (p) { for (var q in p || {}) if (p[q] != null) P[q] = p[q]; }, params: function () { var c = {}; for (var q in P) c[q] = P[q]; return c; },
      useSkin: function (S) { S = S || root.GameDNA_Skin; var n = 0; try { for (var q in recs) if (recs[q].img && S && S.bitmaps) { S.bitmaps.set('card', q, recs[q].img, { role: 'card' }); n++; } } catch (e) { warn('skin', 'useSkin failed: ' + e); } return n; }
    };
    if (pending === 0) setTimeout(flush, 0);
    return api;
  }

  var GameDNA_CardArt = {
    version: VERSION, create: create, PACK_KEYS: PACK_KEYS.slice(), ALIASES: ALIASES, DEFAULTS: DEFAULTS, layout: cardLayout,
    // {key: file} from a pack manifest (assets.json, format gamedna-assets/1: entries with role "card")
    fromManifest: function (m, opts) {
      opts = opts || {}; var out = {}, b = opts.base || '';
      try { (m && m.assets || []).forEach(function (a) { if (a && (a.role === 'card' || a.role === 'card-art') && a.key && a.file) out[a.key] = b + a.file; }); } catch (e) { }
      return out;
    },
    drawFrame: function (ctx, img, card, rect, opts) { try { var L = cardLayout(rect); L.boxes = drawFrame(ctx, img, card, L, opts || {}, DEFAULTS, null); return L; } catch (e) { return null; } }
  };
  root.GameDNA_CardArt = GameDNA_CardArt;
})(typeof window !== 'undefined' ? window : this);
