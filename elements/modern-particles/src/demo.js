'use strict';
// E-11 demo: a forge hall at night (shared demo kit cast and backdrop) driven by GameDNA_Particles on a fixed 60 Hz step. Everything that moves is a pure function of
// the step count, so ?t=<ms>&freeze=1 gives the same picture every time.
(() => {
  const qs = new URLSearchParams(location.search);
  const W = 640, H = 360, STEP = 1000 / 60;
  const FREEZE = qs.has('t') && qs.get('freeze') === '1', T0 = qs.has('t') ? Math.max(0, +qs.get('t') || 0) : 0;
  const cv = document.getElementById('game'), ctx = cv.getContext('2d');
  const nv = document.getElementById('native'), nctx = nv.getContext('2d');

  // ---------------------------------------------------------------- scene geometry (logical px)
  // The cast and the scene come from the shared demo kit (demo-kit/): painted forge hall, rigged mage and sword hero, painted props.
  const KIT = GameDNA_DemoKit, SCENE = 'forge-hall';
  const FLOOR = 300, HERO_H = 96, HERO_X = 318, SMITH_X = 452, SMITH_H = 92;
  const ANVIL = { x: 512, foot: 299, h: 48, x0: 493, x1: 530, y: 268 }, BASIN = { x0: 541, x1: 606, y: 217 };
  const BRAZIER = { x: 176, foot: 297, h: 58, y: 250 }, PORTAL = { x: 392, y: 150 }, FOUNT = { x: 572, y: 215 }, HEARTH = { x: 62, y: 190 }, GEM_X = 244;
  const SURF = [{ x0: ANVIL.x0, x1: ANVIL.x1, y: ANVIL.y }, { x0: BASIN.x0, x1: BASIN.x1, y: BASIN.y }, { x0: 529, x1: 620, y: 224 },
    { x0: BRAZIER.x - 14, x1: BRAZIER.x + 14, y: BRAZIER.y + 4 }, { x0: -1e4, x1: 1e4, y: FLOOR }];
  function ground(x, y) {   // top of the first surface at or below y
    let best = null;
    for (const s of SURF) if (x >= s.x0 && x <= s.x1 && s.y >= y - 1 && (best === null || s.y < best)) best = s.y;
    return best;
  }
  const hash = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 3266489917); h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

  // ---------------------------------------------------------------- cast + sprites
  function mk(w, h, f) { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d')); return c; }
  const HERO_F = 1, SMITH_F = 1;   // the one facing every draw / update call of the mage and the smith reads; __state reports it
  const hero = KIT.actor('mage', { h: HERO_H }), smith = KIT.actor('sword', { h: SMITH_H });
  // the mage's silhouette for the 'outline' emitter shape (aura): the idle pose drawn once, feet at the bottom centre
  const OUT = { w: 84, h: 112 };
  let HERO = null;
  function heroOutline() { return HERO || (HERO = mk(OUT.w * 2, OUT.h * 2, g => { g.scale(2, 2); hero.draw(g, OUT.w / 2, OUT.h - 4, { h: HERO_H, facing: HERO_F, shadow: false }); })); }
  const GEM = mk(64, 80, g => {   // a cut crystal: inked outline, lit facets (drawn 4x, shown at 16 x 20)
    g.lineJoin = 'round';
    const P = [[32, 4], [56, 30], [32, 76], [8, 30]], M = [32, 32];
    const F = (a, b, c, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.closePath(); g.fill(); };
    F(P[0], P[1], M, '#ffd766'); F(P[0], P[3], M, '#fff3bf'); F(P[3], P[2], M, '#f0a030'); F(P[1], P[2], M, '#b96218');
    g.strokeStyle = 'rgba(255,250,220,0.75)'; g.lineWidth = 2; g.beginPath(); g.moveTo(P[3][0], P[3][1]); g.lineTo(M[0], M[1]); g.lineTo(P[1][0], P[1][1]); g.moveTo(P[0][0], P[0][1]); g.lineTo(M[0], M[1]); g.lineTo(P[2][0], P[2][1]); g.stroke();
    g.strokeStyle = '#3a1c10'; g.lineWidth = 5; g.beginPath(); g.moveTo(P[0][0], P[0][1]); for (const q of P.slice(1)) g.lineTo(q[0], q[1]); g.closePath(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.moveTo(22, 20); g.lineTo(30, 12); g.lineTo(28, 26); g.closePath(); g.fill();
  });

  // ---------------------------------------------------------------- particle instances
  const PARAMS = { budget: 2000, density: 1, scale: 0, render: 'auto', glow: 'auto', gravity: 1, wind: 0, bounce: 1 };
  for (const k in PARAMS) if (qs.has(k)) PARAMS[k] = typeof PARAMS[k] === 'number' ? +qs.get(k) : qs.get(k);
  const HUD = { x: 10, y: 10, w: 168, h: 42 };
  const fx = GameDNA_Particles.create({ seed: 7, view: { x: 0, y: 0, w: W, h: H }, params: PARAMS, ground, uiRects: () => [HUD] });
  const fxN = GameDNA_Particles.create({ seed: 7, view: { x: 0, y: 0, w: W / 2, h: H / 2 }, params: Object.assign({}, PARAMS, { budget: Math.round(PARAMS.budget / 2) }),
    ground: (x, y) => { const g = ground(x * 2, y * 2); return g == null ? null : g / 2; }, uiRects: () => [{ x: 5, y: 5, w: 84, h: 16 }] });
  // a custom preset, through define(): the brazier flame
  const FLAME = [
    { name: 'tongues', count: 20, rate: 70, shape: 'glow', blend: 'add', life: [320, 640], speed: [18, 46], angle: -90, spread: 50, drag: 1.2, gravity: -70, wind: 0.6,
      size: [3, 5.5], sizeCurve: [0.7, 1, 0.15], alphaCurve: [0, 1, 0.7, 0], color: ['#fffbe6', '#ffd56a', '#ff8a2a', '#e0401c', '#6a1a14'] },
    { name: 'core', count: 4, rate: 18, shape: 'glow', blend: 'add', life: [200, 300], speed: [4, 12], angle: -90, spread: 30, gravity: -20, size: [6, 8], sizeCurve: [1, 0.7], alphaCurve: [0.6, 0.4, 0], color: 'fire' }];
  fx.define('flame', FLAME); fxN.define('flame', FLAME);
  const PRESETS = [['burst', '#ff9a3a'], ['sparks', '#ffd04a'], ['fountain', '#8fd8ff'], ['smoke', '#a8a0b0'], ['swirl', '#b98cff'], ['dust', '#d8bc90'], ['pickup', '#ffe070'], ['embers', '#ff6a2a'], ['aura', '#7ff0b0']];
  const CONTINUOUS = { fountain: 1, smoke: 1, swirl: 1, embers: 1, aura: 1 };

  // every call goes to both instances (the native one at half the coordinates)
  function half(o) {
    if (!o) return o;
    const c = Object.assign({}, o);
    if (c.floor != null) c.floor /= 2;
    if (c.shape) { c.shape = Object.assign({}, c.shape); for (const k of ['x', 'y', 'w', 'h', 'r', 'x2', 'y2', 'dx', 'dy']) if (c.shape[k] != null) c.shape[k] /= 2; }
    if (c.follow) { const f = c.follow; c.follow = () => { const p = f(); return p && { x: p.x / 2, y: p.y / 2 }; }; }
    return c;
  }
  const emit = (name, x, y, o) => { fx.emit(name, x, y, o); fxN.emit(name, x / 2, y / 2, half(o)); };
  const start = (name, x, y, o) => { const a = fx.start(name, x, y, o), b = fxN.start(name, x / 2, y / 2, half(o)); return { stop() { a.stop(); b.stop(); } }; };

  // ---------------------------------------------------------------- simulation (fixed step)
  const S = { f: 0, showcase: qs.get('showcase') !== '0', stress: qs.get('stress') === '1', ambient: [], stressEm: [], gemHidden: 0, heroY: 0, selected: Math.max(0, PRESETS.findIndex(p => p[0] === qs.get('preset'))) };
  const heroHop = f => { const p = f % 168; if (p >= 36) return 0; const u = p / 36; return -34 * 4 * u * (1 - u); };   // a hop every 2.8 s
  const heroMid = () => ({ x: HERO_X, y: FLOOR + 4 + S.heroY - OUT.h / 2 });
  const auraShape = () => ({ type: 'outline', image: heroOutline(), w: OUT.w, h: OUT.h });
  function startAmbient() {
    S.ambient.forEach(h => h.stop());
    S.ambient = [
      start('flame', BRAZIER.x - 8, BRAZIER.y - 2, { shape: { type: 'line', dx: 16 } }),
      start('embers', BRAZIER.x, BRAZIER.y - 10), start('smoke', BRAZIER.x, BRAZIER.y - 28, { amount: 0.8 }),
      start('fountain', FOUNT.x, FOUNT.y, { shape: { type: 'circle', r: 3 } }),
      start('swirl', PORTAL.x, PORTAL.y),
      start('aura', 0, 0, { follow: heroMid, shape: auraShape(), amount: 1.6 })
    ];
  }
  function setStress(on) {
    S.stress = on; S.stressEm.forEach(h => h.stop()); S.stressEm = [];
    if (on) S.stressEm = [start('fountain', 140, 296, { amount: 6, speed: 1.15 }), start('swirl', 540, 200, { amount: 7, radius: 2.2 }), start('embers', 320, 300, { amount: 16, shape: { type: 'rect', w: 600, h: 8 } })];
    document.getElementById('stress').setAttribute('aria-pressed', on);
  }
  const BURSTS = [[170, 112, 'fire'], [330, 92, 'arcane'], [462, 108, 'ice'], [250, 150, 'gold']];
  function step() {
    const f = S.f++;
    if (f === 0) { if (S.showcase) startAmbient(); if (S.stress) setStress(true); }
    S.heroY = heroHop(f);
    const hp = f % 168;
    if (hp < 36) hero.pose('jump', hp / 36); else if (hp === 36) hero.pose(null);
    if (S.showcase) {
      if (hp === 62) hero.play('cast', { dur: 760 });                                                // the mage feeds the swirl in the archway
      if (f % 54 === 13) smith.play('slash', { dur: 560 });                                          // the blade lands on the anvil at f % 54 === 20
    }
    hero.update(STEP, { facing: HERO_F }); smith.update(STEP, { facing: SMITH_F });
    if (S.showcase) {
      if (f % 168 === 36) emit('dust', HERO_X, FLOOR, { floor: FLOOR });                        // hero lands
      if (f % 54 === 20) { emit('sparks', ANVIL.x - 6, ANVIL.y - 2, { amount: 0.8 }); }                       // hammer on the anvil
      if (f % 150 === 60) { const b = BURSTS[((f - 60) / 150) % BURSTS.length]; emit('burst', b[0], b[1], { color: b[2] }); }
      if (f % 210 === 140) { emit('pickup', GEM_X, gemY(f), { shape: { type: 'circle', r: 8 } }); S.gemHidden = 70; }
    }
    if (S.stress && f % 6 === 0) emit('burst', 60 + hash(f, 1) * 520, 60 + hash(f, 2) * 140, { color: ['fire', 'arcane', 'ice', 'gold', 'poison'][(f / 6) % 5 | 0] });
    if (S.gemHidden > 0) S.gemHidden--;
    fx.update(STEP); fxN.update(STEP);
  }
  const gemY = f => 214 + Math.sin(f * 0.06) * 5;

  // ---------------------------------------------------------------- drawing
  let bg = null, bgKey = '';
  function paintBackground(g) {   // logical coordinates; g already has the backing transform
    KIT.backdrop(g, SCENE, { x: 0, y: 0, w: W, h: H, groundY: FLOOR });
    // demo host only: the hall at night, so additive particles read as light (the fires put their own light pools back on top)
    g.fillStyle = 'rgba(12,8,34,0.56)'; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H * 0.55, H * 0.4, W / 2, H * 0.55, W * 0.68); vg.addColorStop(0, 'rgba(4,2,14,0)'); vg.addColorStop(1, 'rgba(4,2,14,0.5)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  function backgroundFor(g, scale) {
    const key = g.canvas.width + 'x' + g.canvas.height;
    if (bg && bg[key]) return bg[key];
    bg = bg || {};
    const c = document.createElement('canvas'); c.width = g.canvas.width; c.height = g.canvas.height;
    const b = c.getContext('2d'); b.setTransform(scale, 0, 0, scale, 0, 0); paintBackground(b);
    return (bg[key] = c);
  }
  function lights(g, f) {   // soft additive light pools (flicker from the step count)
    g.save(); g.globalCompositeOperation = 'lighter';
    const L = (x, y, r, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    const fl = 0.85 + 0.1 * Math.sin(f * 0.31) + 0.05 * Math.sin(f * 0.83);
    L(HEARTH.x, HEARTH.y, 170, 'rgba(255,130,50,A)', 0.34 * fl);
    L(BRAZIER.x, BRAZIER.y - 10, 120, 'rgba(255,140,60,A)', 0.24 * fl);
    L(PORTAL.x, PORTAL.y, 110, 'rgba(160,110,255,A)', 0.2 + 0.05 * Math.sin(f * 0.05));
    L(FOUNT.x, FOUNT.y + 6, 80, 'rgba(110,200,255,A)', 0.16);
    g.restore();
  }
  function props(g, f) {
    const t = f * STEP;
    KIT.flame(g, HEARTH.x, HEARTH.y, 40, t);
    KIT.sprite(g, 'brazier', BRAZIER.x, BRAZIER.foot, { h: BRAZIER.h }); KIT.flame(g, BRAZIER.x, BRAZIER.y - 6, 30, t + 400);
    // gem
    if (S.gemHidden === 0) { const gy = gemY(f), gg = g.createRadialGradient(GEM_X, gy, 0, GEM_X, gy, 22); gg.addColorStop(0, 'rgba(255,200,90,0.34)'); gg.addColorStop(1, 'rgba(255,170,60,0)'); g.fillStyle = gg; g.fillRect(GEM_X - 22, gy - 22, 44, 44); }
    if (S.gemHidden === 0) g.drawImage(GEM, GEM_X - 8, gemY(f) - 10, 16, 20);
    KIT.sprite(g, 'anvil', ANVIL.x, ANVIL.foot, { h: ANVIL.h });
    smith.draw(g, SMITH_X, FLOOR, { h: SMITH_H, facing: SMITH_F });
    KIT.shadow(g, HERO_X, FLOOR + 1, 22 + S.heroY * 0.2, 5, 0.62 + S.heroY * 0.006);
    hero.draw(g, HERO_X, FLOOR + S.heroY, { h: HERO_H, facing: HERO_F, shadow: false });
  }
  function hud(g, live, budget, sc) {
    g.save(); g.fillStyle = 'rgba(10,10,24,0.82)'; g.beginPath(); g.roundRect(HUD.x * sc, HUD.y * sc, HUD.w * sc, HUD.h * sc, 7 * sc); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = sc; g.stroke();
    g.fillStyle = '#9696b8'; g.font = `600 ${9 * sc}px ui-sans-serif, system-ui, sans-serif`; g.textBaseline = 'top'; g.fillText('PARTICLES', (HUD.x + 10) * sc, (HUD.y + 8) * sc);
    g.fillStyle = '#fff'; g.font = `700 ${15 * sc}px ui-monospace, Menlo, monospace`; g.fillText(live + ' / ' + budget, (HUD.x + 10) * sc, (HUD.y + 20) * sc);
    g.restore();
  }
  function fit() {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, w = Math.max(W, Math.round((r.width || W) * dpr)), h = Math.round(w * H / W);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }
  function render() {
    fit();
    const s = cv.width / W, f = S.f;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(backgroundFor(ctx, s), 0, 0);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    lights(ctx, f);
    fx.draw(ctx, 0, 0, 'back');
    props(ctx, f);
    fx.draw(ctx, 0, 0, 'front');
    const st = fx.stats(); if (qs.get('hud') !== '0') hud(ctx, st.live, st.budget, 1);   // ?hud=0: no particle count (site captures)
    // native 320 x 180
    nctx.setTransform(1, 0, 0, 1, 0, 0); nctx.imageSmoothingEnabled = false; nctx.drawImage(backgroundFor(nctx, 0.5), 0, 0);
    nctx.setTransform(0.5, 0, 0, 0.5, 0, 0); lights(nctx, f); props(nctx, f);
    nctx.setTransform(1, 0, 0, 1, 0, 0);
    fxN.draw(nctx, 0, 0);
    const sn = fxN.stats();   // native HUD: just the count, 8 px, on whole pixels
    nctx.fillStyle = 'rgba(10,10,24,0.82)'; nctx.fillRect(5, 5, 84, 16);
    nctx.fillStyle = '#fff'; nctx.font = 'bold 8px ui-monospace, Menlo, monospace'; nctx.textBaseline = 'top'; nctx.fillText(sn.live + ' / ' + sn.budget, 9, 9);
  }

  // ---------------------------------------------------------------- controls
  const $ = id => document.getElementById(id);
  const box = $('presets');
  PRESETS.forEach(([name, col], i) => { const b = document.createElement('button'); b.style.setProperty('--c', col); b.innerHTML = '<i></i>' + name; b.onclick = () => { select(i); fireAt(defaultSpot(name)); }; box.appendChild(b); });
  function select(i) { S.selected = i; [...box.children].forEach((b, k) => b.setAttribute('aria-pressed', k === i)); }
  function defaultSpot(name) { return name === 'dust' ? [HERO_X, FLOOR] : name === 'sparks' ? [ANVIL.x - 6, ANVIL.y - 2] : name === 'aura' ? [HERO_X, heroMid().y] : name === 'fountain' ? [140, FLOOR - 2] : [320, 150]; }
  function fireAt([x, y]) {
    const name = PRESETS[S.selected][0];
    if (CONTINUOUS[name]) start(name, x, y, name === 'aura' ? { duration: 2500, follow: heroMid, shape: auraShape() } : { duration: 2500 });
    else emit(name, x, y, name === 'dust' ? { floor: ground(x, y - 2) } : {});
  }
  cv.addEventListener('pointerdown', e => { const r = cv.getBoundingClientRect(); fireAt([(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]); });
  addEventListener('keydown', e => { const k = +e.key; if (k >= 1 && k <= PRESETS.length) { select(k - 1); fireAt(defaultSpot(PRESETS[k - 1][0])); } });
  const fmt = { budget: v => v, density: v => (+v).toFixed(2), scale: v => +v ? (+v).toFixed(2) : 'auto', gravity: v => (+v).toFixed(2), wind: v => v, bounce: v => (+v).toFixed(2) };
  for (const k in fmt) {
    const el = $(k), out = $(k + 'O'); el.value = PARAMS[k];
    const paint = () => { out.textContent = fmt[k](el.value); el.style.setProperty('--fill', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); };
    el.oninput = () => { PARAMS[k] = +el.value; fx.setParams({ [k]: PARAMS[k] }); fxN.setParams({ [k]: k === 'budget' ? Math.round(PARAMS[k] / 2) : PARAMS[k] }); paint(); };
    paint();
  }
  document.querySelectorAll('.seg').forEach(seg => {
    const key = seg.dataset.key;
    const paint = () => seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', b.dataset.v === PARAMS[key]));
    seg.querySelectorAll('button').forEach(b => b.onclick = () => { PARAMS[key] = b.dataset.v; fx.setParams({ [key]: b.dataset.v }); if (key !== 'render') fxN.setParams({ [key]: b.dataset.v }); paint(); });
    paint();
  });
  $('showcase').setAttribute('aria-pressed', S.showcase);
  $('showcase').onclick = () => { S.showcase = !S.showcase; $('showcase').setAttribute('aria-pressed', S.showcase); if (S.showcase) startAmbient(); else { S.ambient.forEach(h => h.stop()); S.ambient = []; } };
  $('stress').onclick = () => setStress(!S.stress);
  $('clearBtn').onclick = () => { fx.clear(); fxN.clear(); S.ambient = []; S.stressEm = []; if (S.showcase) startAmbient(); if (S.stress) setStress(true); };
  select(S.selected);
  let upAvg = 0, drAvg = 0;
  function readouts(live) {
    const st = fx.stats();
    $('sLive').textContent = st.live; $('sBudget').textContent = st.budget; $('sEm').textContent = st.emitters;
    if (live) { upAvg = upAvg * 0.9 + st.updateMs * 0.1; drAvg = drAvg * 0.9 + st.drawMs * 0.1; $('sUp').textContent = upAvg.toFixed(2) + ' ms'; $('sDraw').textContent = drAvg.toFixed(2) + ' ms'; }
  }
  /* text state for critics and tools/sprites/statecheck.py (640x360 stage px): the mage feeds the swirl in the archway to its right, the smith
     hammers the anvil to its right; targets are those x positions (props, not actors) */
  window.__state = () => ({ t: Math.round(S.f * STEP), actors: [
    { id: 'mage', x: HERO_X, y: FLOOR + S.heroY, facing: HERO_F > 0 ? 'right' : 'left', target: PORTAL.x, asset: 'mage' },
    { id: 'smith', x: SMITH_X, y: FLOOR, facing: SMITH_F > 0 ? 'right' : 'left', target: ANVIL.x, asset: 'sword' }] });
  window.__demo = { fx, fxN, S, hero, smith, stats: () => fx.stats(), sig: () => fx.signature() + '/' + fxN.signature() };

  // ---------------------------------------------------------------- loop
  KIT.ready(() => {
  if (qs.has('t')) { for (let n = Math.floor(T0 / STEP); n > 0; n--) step(); }
  render(); readouts(false);
  if (FREEZE) { window.__frozen = true; document.documentElement.dataset.frozen = '1'; return; }
  let acc = 0, prev = null, k = 0;
  function frame(now) {
    if (prev === null) prev = now;
    acc += Math.min(250, now - prev); prev = now;
    while (acc >= STEP) { step(); acc -= STEP; }
    render();
    if (++k % 10 === 0) readouts(true);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  });
})();
