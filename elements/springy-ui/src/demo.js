"use strict";
// C-10 demo: a small market scene whose windows are drawn plainly at their final rects (the "host" code below), animated by
// GameDNA_SpringyUI. Two identical games can run side by side: one with the module disabled (instant), one with it on.
(() => {
  const VW = 640, VH = 360, STEP = 1000 / 60;
  const KIT = GameDNA_DemoKit;   // shared painted demo cast + backdrop (demo-kit/): demo page only, not part of the module
  const qs = new URLSearchParams(location.search);
  const FREEZE_AT = qs.has('t') ? Math.max(0, Number(qs.get('t')) || 0) : null;
  const FROZEN = FREEZE_AT !== null && qs.get('freeze') === '1';
  const FONT = 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, system-ui, sans-serif';
  const DEF = GameDNA_SpringyUI.defaults;
  const P = Object.assign({}, DEF, { reduced: 'off' });
  for (const k of ['open', 'close', 'bounce', 'stagger', 'glide', 'lift', 'dim', 'count']) if (qs.has(k) && isFinite(+qs.get(k))) P[k] = +qs.get(k);
  if (qs.has('style')) P.style = qs.get('style');
  if (qs.get('reduced') === '1' || qs.get('reduced') === 'on') P.reduced = 'on';
  const OPT = { on: qs.get('off') !== '1', compare: qs.get('compare') === '1', slow: qs.get('slow') === '1' };

  // ------------------------------------------------------------------ content (original, neutral fantasy)
  const ITEMS = {
    tonic: { name: 'Moon Tonic', price: 30, icon: 'bottle', col: '#7fb8ff', desc: 'A cool blue draught. Restores 20 HP.' },
    salve: { name: 'Ember Salve', price: 45, icon: 'jar', col: '#ff9a52', desc: 'Warms the blood. Cures frostbite.' },
    quill: { name: 'Quill of Wind', price: 80, icon: 'feather', col: '#7fe3c6', desc: 'Writes a gust onto any page.' },
    charm: { name: 'Starlit Charm', price: 160, icon: 'star', col: '#ffd76a', desc: 'Glows when danger is near.' },
    map: { name: 'Map of the Vale', price: 25, icon: 'scroll', col: '#e8cf9a', desc: 'Every path to the old mill.' },
  };
  const STOCK = ['tonic', 'salve', 'quill', 'charm', 'map'];
  const MENU = ['Shop', 'Talk', 'Bag', 'Rest'];
  const TALK = ['Lanterns are lit, traveller. Late for the night market?', 'The quill sells fast; the wind has been restless all week.', 'Mind the river road after dark. Safe travels!'];
  // demo script: [second, key]; loops every 14 s (state resets at the loop start)
  const SCRIPT = [[0.5, 'ok'], [1.25, 'ok'], [2.0, 'down'], [2.35, 'down'], [2.95, 'ok'], [3.6, 'ok'], [4.5, 'down'], [4.8, 'up'], [5.5, 'back'],
    [6.1, 'down'], [6.55, 'ok'], [7.6, 'ok'], [8.6, 'ok'], [9.6, 'ok'], [10.2, 'down'], [10.75, 'ok'], [10.8, 'ok'], [12.0, 'back'], [12.55, 'back']];
  const LOOP = 14 * 60, SCRIPT_STEPS = new Map(SCRIPT.map(([s, k]) => [Math.round(s * 60), k]));

  // ------------------------------------------------------------------ one game (logic identical for every copy)
  function makeGame(canvas, enabled) {
    const ctx = canvas.getContext('2d');
    const ui = GameDNA_SpringyUI.create({ view: { x: 0, y: 0, w: VW, h: VH }, params: P, enabled, skin: false });
    const G = { step: 0, gold: 240, hp: 46, maxHp: 60, bag: { tonic: 2 }, stack: [], toast: null, toastN: 0, cheer: 0 };
    const cast = { mage: KIT.actor('mage', { h: CAST.mage.h }), keeper: KIT.actor('keeper', { h: CAST.keeper.h }) };
    const top = () => G.stack[G.stack.length - 1] || null;
    function open(w) { w.cursor = w.cursor || 0; G.stack.push(w); ui.open(w.id, { origin: w.origin }); return w; }
    function close() { const w = G.stack.pop(); if (w) ui.close(w.id); return w; }
    function toast(text, tone) { G.toast = { text, tone, n: ++G.toastN, t: G.step }; }
    function bagRows() { return Object.keys(ITEMS).filter(id => G.bag[id] > 0); }
    function reset() { G.gold = 240; G.hp = 46; G.bag = { tonic: 2 }; G.stack = []; G.toast = null; G.cheer = 0; cast.mage.reset().loop('idle'); cast.keeper.reset().loop('idle'); }
    // the cast reacts to what the menus did (advanced in the fixed step, so frozen frames equal live play)
    function react(res) {
      if (/^bought/.test(res)) { G.cheer = G.step + 66; cast.mage.loop('cheer'); cast.keeper.play('cast', { dur: 560 }); }
      else if (res === 'rested' || res === 'used Moon Tonic') { G.cheer = G.step + 54; cast.mage.loop('cheer'); }
      else if (res === 'talk opens' || res === 'next line') cast.keeper.play('cast', { dur: 520 });
    }
    // input: returns what happened (for the log)
    function press(k) {
      const w = top();
      if (!w) { if (k === 'ok') { open({ id: 'menu', rows: MENU }); return 'menu opens'; } return null; }
      const n = w.id === 'shop' ? STOCK.length : w.id === 'bag' ? Math.max(1, bagRows().length) : w.id === 'talk' ? 1 : w.rows.length;
      if (w.id === 'talk') {
        if (k === 'ok' || k === 'back') { w.line++; if (w.line >= TALK.length) { close(); return 'talk ends'; } return 'next line'; }
        return null;
      }
      if (k === 'up') { w.cursor = (w.cursor + n - 1) % n; return 'cursor ' + w.cursor; }
      if (k === 'down') { w.cursor = (w.cursor + 1) % n; return 'cursor ' + w.cursor; }
      if (k === 'back') { close(); return w.id + ' closes'; }
      if (k !== 'ok') return null;
      ui.pulse(w.id, w.cursor);
      if (w.id === 'menu') {
        const pick = MENU[w.cursor], r = rowRect(w, w.cursor);
        if (pick === 'Shop') { open({ id: 'shop', origin: { x: r.x + r.w, y: r.y + r.h / 2 } }); return 'shop opens'; }
        if (pick === 'Talk') { open({ id: 'talk', line: 0 }); return 'talk opens'; }
        if (pick === 'Bag') { open({ id: 'bag', origin: { x: r.x + r.w, y: r.y + r.h / 2 } }); return 'bag opens'; }
        if (pick === 'Rest') { if (G.gold >= 10) { G.gold -= 10; G.hp = G.maxHp; toast('Rested by the fire  +HP  -10 gold', 'good'); return 'rested'; } toast('Not enough gold', 'bad'); return 'no gold'; }
      }
      if (w.id === 'shop') {
        const id = STOCK[w.cursor], r = rowRect(w, w.cursor);
        open({ id: 'confirm', item: id, rows: ['Buy', 'Cancel'], origin: { x: r.x + r.w - 60, y: r.y + r.h / 2 } });
        return 'confirm opens';
      }
      if (w.id === 'confirm') {
        const it = ITEMS[w.item]; close();
        if (w.cursor === 1) return 'cancelled';
        if (G.gold < it.price) { toast('Not enough gold for the ' + it.name, 'bad'); return 'no gold'; }
        G.gold -= it.price; G.bag[w.item] = (G.bag[w.item] || 0) + 1; toast('Bought ' + it.name + '   -' + it.price + ' gold', 'good');
        return 'bought ' + it.name;
      }
      if (w.id === 'bag') {
        const id = bagRows()[w.cursor];
        if (id === 'tonic') { G.bag.tonic--; G.hp = Math.min(G.maxHp, G.hp + 20); toast('Moon Tonic  +20 HP', 'good'); w.cursor = Math.min(w.cursor, Math.max(0, bagRows().length - 1)); return 'used Moon Tonic'; }
        if (id) { toast(ITEMS[id].name + ' cannot be used here', 'bad'); return 'cannot use'; }
      }
      return null;
    }
    function step(keys) {
      ui.update(STEP);
      G.step++;
      if (G.toast && G.step - G.toast.t > 150) G.toast = null;
      const out = [];
      for (const k of keys) {
        const w = top(), st = w ? ui.state(w.id) : null;   // read for the demo's log only: input never waits on it
        const res = press(k);
        if (res) react(res);
        if (res) out.push({ k, res, during: st && (st.phase === 'opening' || st.phase === 'closing') ? st.phase + ' ' + Math.round(st.ms) + ' ms' : null, step: G.step });
      }
      if (G.cheer && G.step >= G.cheer) { G.cheer = 0; cast.mage.loop('idle'); }
      cast.mage.update(STEP, { facing: CAST.mage.f }); cast.keeper.update(STEP, { facing: CAST.keeper.f });
      return out;
    }

    // ---------------------------------------------------------------- the host's own drawing (final rects, no motion)
    const RECTS = { menu: { x: 24, y: 76, w: 168, h: 176 }, shop: { x: 210, y: 46, w: 330, h: 252 }, bag: { x: 210, y: 70, w: 300, h: 196 },
      confirm: { x: 352, y: 214, w: 176, h: 104 }, talk: { x: 36, y: 266, w: 568, h: 82 } };
    function rowRect(w, k) {
      const R = RECTS[w.id];
      if (w.id === 'menu') return { x: R.x + 10, y: R.y + 40 + k * 32, w: R.w - 20, h: 28 };
      if (w.id === 'shop') return { x: R.x + 10, y: R.y + 48 + k * 34, w: R.w - 20, h: 30 };
      if (w.id === 'bag') return { x: R.x + 10, y: R.y + 48 + k * 34, w: R.w - 20, h: 30 };
      if (w.id === 'confirm') return { x: R.x + 12, y: R.y + 44 + k * 26, w: R.w - 24, h: 24 };
      return R;
    }
    function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
    function text(s, x, y, size, col, align = 'left', weight = 600) { ctx.font = weight + ' ' + size + 'px ' + FONT; ctx.fillStyle = col; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y); }
    function panel(R, title) {
      const g = ctx.createLinearGradient(0, R.y, 0, R.y + R.h);
      g.addColorStop(0, 'rgba(38,33,62,0.97)'); g.addColorStop(1, 'rgba(20,17,34,0.97)');
      rr(R.x, R.y, R.w, R.h, 12); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,214,150,0.55)'; rr(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 12); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; rr(R.x + 3.5, R.y + 3.5, R.w - 7, R.h - 7, 9); ctx.stroke();
      if (title) {
        text(title, R.x + 16, R.y + 22, 15, '#fff3dc', 'left', 700);
        ctx.fillStyle = 'rgba(255,214,150,0.25)'; ctx.fillRect(R.x + 14, R.y + 36, R.w - 28, 1);
      }
    }
    function band(r) {
      const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
      g.addColorStop(0, 'rgba(255,190,100,0.42)'); g.addColorStop(1, 'rgba(255,190,100,0.08)');
      rr(r.x, r.y, r.w, r.h, 7); ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = '#ffd38a'; rr(r.x, r.y + 5, 3, r.h - 10, 2); ctx.fill();
    }
    function icon(kind, x, y, col) {
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      if (kind === 'bottle') { ctx.roundRect(-5, -2, 10, 10, 4); ctx.rect(-2, -8, 4, 7); }
      else if (kind === 'jar') { ctx.roundRect(-6, -4, 12, 11, 3); ctx.rect(-7, -7, 14, 3); }
      else if (kind === 'feather') { ctx.ellipse(0, 0, 3.5, 9, 0.6, 0, Math.PI * 2); }
      else if (kind === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3.6 : 8.5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }
      else { ctx.roundRect(-8, -6, 16, 12, 2); }
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(-2, -1, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    function drawMenu(w, active) {
      const R = RECTS.menu; panel(R, 'Camp');
      const hl = ui.glide('menu', rowRect(w, w.cursor)); band(hl);
      MENU.forEach((m, k) => ui.row(ctx, 'menu', k, () => {
        const r = rowRect(w, k), sel = k === w.cursor;
        text(m, r.x + 16, r.y + r.h / 2, 15, sel ? '#ffffff' : active ? '#d9d2ec' : '#9d95b8', 'left', sel ? 700 : 600);
        text(['Wares', 'Pell', 'Items', '10 g'][k], r.x + r.w - 10, r.y + r.h / 2, 11.5, '#a99fc6', 'right', 500);
      }, rowRect(w, k)));
    }
    function drawShop(w) {
      const R = RECTS.shop; panel(R, "Pell's Lantern Stall");
      const g = ui.count('gold', G.gold), dir = ui.counting('gold');
      drawCoin(R.x + R.w - 92, R.y + 22); text(String(g), R.x + R.w - 18, R.y + 22, 15, dir < 0 ? '#ff9f8a' : dir > 0 ? '#9cf0b8' : '#ffd76a', 'right', 700);
      const hl = ui.glide('shop', rowRect(w, w.cursor)); band(hl);
      STOCK.forEach((id, k) => ui.row(ctx, 'shop', k, () => {
        const it = ITEMS[id], r = rowRect(w, k), poor = G.gold < it.price;
        icon(it.icon, r.x + 20, r.y + r.h / 2, it.col);
        text(it.name, r.x + 38, r.y + r.h / 2, 14.5, k === w.cursor ? '#fff' : '#e3dcf3', 'left', k === w.cursor ? 700 : 600);
        text(it.price + ' g', r.x + r.w - 10, r.y + r.h / 2, 13.5, poor ? '#8a819f' : '#ffd76a', 'right', 700);
      }, rowRect(w, k)));
      ctx.fillStyle = 'rgba(255,214,150,0.18)'; ctx.fillRect(R.x + 14, R.y + R.h - 36, R.w - 28, 1);
      text(ITEMS[STOCK[w.cursor]].desc, R.x + 16, R.y + R.h - 18, 12.5, '#bdb4d6', 'left', 500);
    }
    function drawBag(w) {
      const R = RECTS.bag, rows = bagRows(); panel(R, 'Bag');
      text('HP ' + ui.count('hp', G.hp) + ' / ' + G.maxHp, R.x + R.w - 18, R.y + 22, 13.5, '#9cf0b8', 'right', 700);
      if (!rows.length) { text('Empty.', R.x + 18, R.y + 64, 14, '#9d95b8'); return; }
      const hl = ui.glide('bag', rowRect(w, Math.min(w.cursor, rows.length - 1))); band(hl);
      rows.forEach((id, k) => ui.row(ctx, 'bag', k, () => {
        const it = ITEMS[id], r = rowRect(w, k);
        icon(it.icon, r.x + 20, r.y + r.h / 2, it.col);
        text(it.name, r.x + 38, r.y + r.h / 2, 14.5, k === w.cursor ? '#fff' : '#e3dcf3', 'left', k === w.cursor ? 700 : 600);
        text('x' + ui.count('bag-' + id, G.bag[id]), r.x + r.w - 10, r.y + r.h / 2, 13.5, '#d9d2ec', 'right', 700);
      }, rowRect(w, k)));
    }
    function drawConfirm(w) {
      const R = RECTS.confirm, it = ITEMS[w.item]; panel(R);
      text('Buy ' + it.name + '?', R.x + 14, R.y + 22, 13.5, '#fff3dc', 'left', 700);
      const hl = ui.glide('confirm', rowRect(w, w.cursor)); band(hl);
      w.rows.forEach((m, k) => ui.row(ctx, 'confirm', k, () => {
        const r = rowRect(w, k);
        text(m, r.x + 14, r.y + r.h / 2, 14, k === w.cursor ? '#fff' : '#d9d2ec', 'left', 700);
        if (k === 0) text(it.price + ' g', r.x + r.w - 8, r.y + r.h / 2, 12.5, G.gold < it.price ? '#ff9f8a' : '#ffd76a', 'right', 700);
      }, rowRect(w, k)));
    }
    function drawTalk(w) {
      const R = RECTS.talk; panel(R);
      rr(R.x + 14, R.y - 13, 74, 24, 7); ctx.fillStyle = '#ffcf7a'; ctx.fill();
      text('Pell', R.x + 51, R.y - 1, 13, '#2a1a08', 'center', 800);
      text(TALK[Math.min(w.line, TALK.length - 1)], R.x + 20, R.y + 38, 15, '#f3eefc', 'left', 500);
      const b = (G.step >> 4) % 2; text('▼', R.x + R.w - 22, R.y + R.h - 16 + b, 11, '#ffcf7a', 'center', 700);
    }
    function drawCoin(x, y) { ctx.fillStyle = '#ffcf5a'; ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#b07a1a'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#fff3c0'; ctx.fillRect(x - 1, y - 3.5, 2, 7); }
    function drawHud() {
      rr(12, 12, 188, 54, 10); ctx.fillStyle = 'rgba(16,13,28,0.72)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,214,150,0.25)'; ctx.lineWidth = 1; rr(12.5, 12.5, 187, 53, 10); ctx.stroke();
      const hp = ui.count('hud-hp', G.hp), up = ui.counting('hud-hp');
      text('HP', 24, 28, 12, '#bdb4d6', 'left', 700); text(hp + ' / ' + G.maxHp, 188, 28, 13, up > 0 ? '#9cf0b8' : '#fff', 'right', 700);
      rr(24, 37, 164, 6, 3); ctx.fillStyle = '#2c2540'; ctx.fill(); rr(24, 37, 164 * hp / G.maxHp, 6, 3); ctx.fillStyle = '#ff6f7d'; ctx.fill();
      drawCoin(30, 54); const g = ui.count('hud-gold', G.gold), d = ui.counting('hud-gold');
      text(String(g), 42, 54, 13, d < 0 ? '#ff9f8a' : d > 0 ? '#9cf0b8' : '#ffd76a', 'left', 700);
      if (!top()) { const a = 0.55 + 0.45 * Math.sin(G.step / 18); ctx.globalAlpha = a; text('Z  open the camp menu', VW - 18, VH - 18, 12.5, '#fff3dc', 'right', 600); ctx.globalAlpha = 1; }
    }
    function drawToast() {
      const T = G.toast; if (!T) return;
      ctx.font = '700 13.5px ' + FONT; const w = ctx.measureText(T.text).width + 40, R = { x: (VW - w) / 2, y: 14, w, h: 30 };
      ui.window(ctx, 'toast-' + T.n, R, () => {
        rr(R.x, R.y, R.w, R.h, 15); ctx.fillStyle = T.tone === 'bad' ? 'rgba(70,22,32,0.95)' : 'rgba(22,48,40,0.95)'; ctx.fill();
        ctx.strokeStyle = T.tone === 'bad' ? '#ff8a96' : '#7ee8b0'; ctx.lineWidth = 1; rr(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, 15); ctx.stroke();
        text(T.text, VW / 2, R.y + 15, 13.5, '#fff', 'center', 700);
      }, { style: P.style === 'auto' ? 'slide' : undefined, edge: 'top', radius: 15 });
    }
    function render() {
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1)), cw = Math.round(canvas.clientWidth * dpr) || VW, bw = Math.max(VW, cw);
      if (canvas.width !== bw) { canvas.width = bw; canvas.height = Math.round(bw * VH / VW); }
      ctx.setTransform(canvas.width / VW, 0, 0, canvas.height / VH, 0, 0);
      drawScene(ctx, G.step, canvas.width / VW, cast);
      drawHud();
      G.stack.forEach((w, i) => {
        const active = i === G.stack.length - 1, modal = w.id === 'shop' || w.id === 'bag' || w.id === 'confirm';
        const R = RECTS[w.id], wr = w.id === 'talk' ? { x: R.x, y: R.y - 14, w: R.w, h: R.h + 14 } : R;   // the name plate sits above the box
        ui.window(ctx, w.id, wr, () => {
          if (w.id === 'menu') drawMenu(w, active); else if (w.id === 'shop') drawShop(w); else if (w.id === 'bag') drawBag(w);
          else if (w.id === 'confirm') drawConfirm(w); else if (w.id === 'talk') drawTalk(w);
        }, { selected: w.id === 'talk' ? -1 : w.cursor, dim: modal ? (w.id === 'confirm' ? P.dim * 0.5 : true) : false, origin: w.origin, radius: 12 });
      });
      drawToast();
      ui.draw(ctx);
    }
    return { G, ui, step, render, reset, top, canvas };
  }

  // ------------------------------------------------------------------ the scene (demo kit: painted night market, stall keeper, mage)
  // Layout: the windows keep their rects; the two characters stand in front of the stall counter, right of the shop window
  // (x > 540) and above the dialogue box (feet at y 262), so no window hides them.
  const SCENE = 'market-night', BS = VW / 1440;   // the backdrop covers the stage exactly (1440x810 -> 640x360)
  const CAST = { mage: { x: 552, y: 264, h: 98, f: 1 }, keeper: { x: 619, y: 262, h: 96, f: -1 } };   // f: the one facing every update / draw call reads (__state reports it)
  const PROPS = [['lamp', 356, 258, 128], ['crates', 408, 263, 62]];
  const LAMP_GLOW = [PROPS[0][1] + 0.16 * PROPS[0][3], PROPS[0][2] - 0.75 * PROPS[0][3]];   // the lamp's lantern glass
  // painted paper lanterns in the backdrop (image px), for a live flicker
  const LANTERNS = [[203, 182, 1], [297, 216, 1], [420, 258, 1], [549, 272, 1], [751, 258, 1], [852, 236, 1], [957, 200, 1], [379, 349, 0.6], [449, 371, 0.6], [516, 369, 0.6], [580, 349, 0.6], [88, 324, 1], [1326, 420, 0.8]];
  const sceneCache = new Map();
  function sceneBase(k) {
    const key = Math.round(k * 100);
    if (sceneCache.has(key)) return sceneCache.get(key);
    const c = document.createElement('canvas'); c.width = Math.round(VW * k); c.height = Math.round(VH * k);
    const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0);
    KIT.backdrop(g, SCENE, { x: 0, y: 0, w: VW, h: VH });
    for (const [id, x, y, h] of PROPS) KIT.sprite(g, id, x, y, { h });
    // soft vignette so the windows and the HUD read on the bright ground
    const v = g.createRadialGradient(VW * 0.56, VH * 0.5, VH * 0.42, VW * 0.56, VH * 0.5, VW * 0.78); v.addColorStop(0, 'rgba(10,6,24,0)'); v.addColorStop(1, 'rgba(10,6,24,0.62)');
    g.fillStyle = v; g.fillRect(0, 0, VW, VH);
    sceneCache.set(key, c); return c;
  }
  function drawScene(ctx, step, k, cast) {
    const t = step * STEP;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(sceneBase(k), 0, 0); ctx.restore();
    LANTERNS.forEach(([x, y, r], i) => KIT.flame(ctx, x * BS, y * BS, 15 * r, t + i * 977));
    KIT.flame(ctx, LAMP_GLOW[0], LAMP_GLOW[1], 30, t + 300);
    cast.mage.draw(ctx, CAST.mage.x, CAST.mage.y, { h: CAST.mage.h, facing: CAST.mage.f });
    cast.keeper.draw(ctx, CAST.keeper.x, CAST.keeper.y, { h: CAST.keeper.h, facing: CAST.keeper.f });
    for (let i = 0; i < 14; i++) {   // drifting motes, a pure function of the step
      const s = step / 60, x = (i * 71 + s * (6 + i % 4 * 3)) % (VW + 40) - 20, y = 170 + ((i * 37) % 110) + Math.sin(s * 1.3 + i) * 8, a = 0.35 + 0.35 * Math.sin(s * 2 + i * 2);
      ctx.fillStyle = 'rgba(255,226,160,' + Math.max(0, a) + ')'; ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ------------------------------------------------------------------ shell: two games, one input stream
  const games = [makeGame(document.getElementById('cOn'), OPT.on), makeGame(document.getElementById('cOff'), false)];
  let attract = qs.get('script') !== '0', userKeys = [], scriptStep = 0;
  const logEl = document.getElementById('log'), statusEl = document.getElementById('status'), logLines = [];
  function log(e) {
    const during = e.during ? '<span class="a">' + e.during + '</span>' : 'settled';
    logLines.unshift('<b>' + ({ ok: 'Z', back: 'X', up: '↑', down: '↓' }[e.k]) + '</b> ' + during + ' &rarr; <span class="ok">' + e.res + '</span>, same step');
    if (logLines.length > 6) logLines.length = 6;
    logEl.innerHTML = logLines.map(l => '<div>' + l + '</div>').join('');
  }
  function tick() {
    let keys = [];
    if (attract) {
      const s = scriptStep % LOOP;
      if (s === 0) for (const g of games) { g.reset(); g.ui.clear(); }
      const k = SCRIPT_STEPS.get(s); if (k) keys.push(k);
      scriptStep++;
    }
    if (userKeys.length) { keys = keys.concat(userKeys); userKeys = []; }
    const res = games.map(g => g.step(keys));
    if (!FROZEN) for (const e of res[0]) log(e);
  }
  function userPress(k) {
    if (attract) { attract = false; statusEl.innerHTML = '<b>your turn</b> &middot; arrows, Z, X'; }
    userKeys.push(k);
  }
  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', x: 'back', X: 'back', Escape: 'back', Backspace: 'back' };
  addEventListener('keydown', e => { const k = KEYS[e.key]; if (!k || (e.target.type === 'range' && /Arrow/.test(e.key))) return; e.preventDefault(); if (!e.repeat) userPress(k); });
  for (const b of document.querySelectorAll('.key')) b.addEventListener('pointerdown', e => { e.preventDefault(); userPress(b.dataset.k); });
  document.getElementById('replay').onclick = () => { attract = true; scriptStep = 0; statusEl.textContent = 'demo script'; };

  // controls
  const $ = id => document.getElementById(id);
  function applyParams() { for (const g of games) g.ui.setParams(P); }
  for (const inp of document.querySelectorAll('input[data-k]')) {
    const k = inp.dataset.k, out = inp.parentElement.querySelector('output');
    const show = () => { out.textContent = k === 'bounce' || k === 'dim' ? (+inp.value).toFixed(2) : inp.value; inp.style.setProperty('--fill', ((inp.value - inp.min) / (inp.max - inp.min) * 100) + '%'); };
    inp.value = P[k]; show();
    inp.addEventListener('input', () => { P[k] = +inp.value; show(); applyParams(); drawCurve(); });
  }
  const segBtns = [...$('style').querySelectorAll('button')];
  const segShow = () => segBtns.forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === P.style)));
  segBtns.forEach(b => b.onclick = () => { P.style = b.dataset.v; segShow(); applyParams(); }); segShow();
  $('on').checked = OPT.on; $('compare').checked = OPT.compare; $('slow').checked = OPT.slow; $('reduced').checked = P.reduced === 'on';
  const onTag = $('fOn').querySelector('.tag');
  const tagShow = () => { onTag.innerHTML = $('on').checked ? 'MODULE ON &middot; SPRINGY' : 'MODULE OFF &middot; INSTANT'; };
  $('on').onchange = () => { games[0].ui.setEnabled($('on').checked); tagShow(); }; tagShow();
  $('reduced').onchange = () => { P.reduced = $('reduced').checked ? 'on' : 'off'; applyParams(); };
  $('slow').onchange = () => { OPT.slow = $('slow').checked; };
  function layout() { const two = $('compare').checked; $('frames').classList.toggle('two', two); $('fOff').hidden = !two; }
  $('compare').onchange = layout; layout();

  // curve plot
  const cv = $('curve'), cg = cv.getContext('2d');
  function drawCurve() {
    // labels sit under the baseline; the plot keeps headroom for the overshoot (up to bounce 0.4 = 1.4)
    const W = cv.width, H = cv.height, padL = 16, padR = 16, top = 12, base = H - 40, tot = Math.max(1, P.open + 40 + P.close);
    cg.clearRect(0, 0, W, H);
    const vmax = P.reduced === 'on' ? 1.05 : 1.05 + Math.max(0, P.bounce) * 0.9;
    const xo = t => padL + (W - padL - padR) * t / tot, y = v => base - (base - top) * v / vmax;
    cg.strokeStyle = '#2b2640'; cg.lineWidth = 2; cg.beginPath(); cg.moveTo(padL, y(1)); cg.lineTo(W - padR, y(1)); cg.moveTo(padL, base); cg.lineTo(W - padR, base); cg.stroke();
    cg.lineWidth = 4; cg.strokeStyle = '#ffc56b'; cg.beginPath();
    for (let i = 0; i <= 80; i++) { const e = i / 80, v = P.reduced === 'on' ? e : GameDNA_SpringyUI.springCurve(e, P.bounce); cg.lineTo(xo(e * P.open), y(v)); }
    cg.lineTo(xo(P.open + 40), y(1)); cg.stroke();
    cg.strokeStyle = '#8fd7ff'; cg.beginPath();
    for (let i = 0; i <= 40; i++) { const c = i / 40; cg.lineTo(xo(P.open + 40 + c * P.close), y(1 - (P.reduced === 'on' ? c : GameDNA_SpringyUI.closeCurve(c)))); }
    cg.stroke();
    cg.font = '600 20px ui-sans-serif, system-ui'; cg.fillStyle = '#9a93b4'; cg.fillText('open ' + P.open + ' ms', padL, H - 12); cg.fillText('close ' + P.close + ' ms', xo(P.open + 40), H - 12);
    const g = games[0], w = g.top(); if (!w) return;
    const s = g.ui.state(w.id);
    let px, pv;
    if (s.phase === 'opening') { const e = Math.min(1, s.ms / Math.max(1, P.open)); px = xo(e * P.open); pv = P.reduced === 'on' ? e : GameDNA_SpringyUI.springCurve(e, P.bounce); }
    else if (s.phase === 'open') { px = xo(P.open + 20); pv = 1; }
    if (px != null) { cg.fillStyle = '#fff'; cg.beginPath(); cg.arc(px, y(pv), 7, 0, Math.PI * 2); cg.fill(); }
  }
  drawCurve();

  // run (once the kit art has decoded)
  KIT.ready(() => {
    if (FROZEN) {
      const n = Math.floor(FREEZE_AT / STEP);
      for (let i = 0; i < n; i++) tick();
      for (const g of games) if (!g.canvas.closest('[hidden]')) g.render();
      drawCurve();
      window.__frozen = true;
    } else {
      let last = performance.now(), acc = 0;
      const loop = now => {
        acc += Math.min(250, now - last) * (OPT.slow ? 0.25 : 1); last = now;
        while (acc >= STEP) { tick(); acc -= STEP; }
        for (const g of games) if (!g.canvas.closest('[hidden]')) g.render();
        drawCurve();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  });
  /* text state for critics and tools/sprites/statecheck.py (640x360 stage px): the mage (customer) and the stall keeper face each other. Every game
     canvas on the page (the compare copies) draws this same cast at the same stage coordinates, so it is listed once. */
  window.__state = () => ({ t: Math.round(games[0].G.step * STEP), actors: [['mage', 'keeper'], ['keeper', 'mage']].map(([id, foe]) =>
    ({ id, x: CAST[id].x, y: CAST[id].y, facing: CAST[id].f > 0 ? 'right' : 'left', target: foe, asset: id })) });
  window.__springyDemo = () => ({ step: games[0].G.step, stack: games[0].G.stack.map(w => w.id), gold: games[0].G.gold, hp: games[0].G.hp, ui: games[0].ui.debug() });
})();
