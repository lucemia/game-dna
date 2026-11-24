// B-05 demo: the module on a coastal cliff trail. The "levels" here are a short stand-in screen (Z clear, X secret exit,
// C give up); the starter (../starter/) has real platformer levels. ?t=<ms>&freeze=1 plays the autopilot and draws one frame.
(function () {
  'use strict';
  const PARAMS = /*PARAMS*/[], VARIANTS = /*VARIANTS*/[];
  const Q = new URLSearchParams(location.search), W = 256, H = 224, FRAME = 1000 / 60;
  const HAS_T = Q.has('t'), FREEZE = Q.get('freeze') === '1', T0 = Math.max(0, +Q.get('t') || 0);
  const P = {}; PARAMS.forEach(p => { P[p.key] = Q.has(p.key) ? (p.type === 'range' ? Number(Q.get(p.key)) : Q.get(p.key)) : p.default; });
  const canvas = document.getElementById('screen'); let g = canvas.getContext('2d');

  /* ---------- the coastal trail (map px; the world is 420x296, bigger than the 256x224 screen, so it scrolls) ---------- */
  const NODES = [
    { id: 'trail', x: 28, y: 236, kind: 'start', name: 'Trailhead' },
    { id: 'gull', x: 72, y: 212, kind: 'level', name: 'Gull Steps' },
    { id: 'tide', x: 122, y: 232, kind: 'secret', name: 'Tide Caves' },
    { id: 'seal', x: 178, y: 266, kind: 'bonus', name: 'Seal Cove' },
    { id: 'lamp', x: 160, y: 194, kind: 'hut', name: 'Lamp Hut' },
    { id: 'windy', x: 206, y: 172, kind: 'level', name: 'Windy Ledge' },
    { id: 'tent', x: 238, y: 214, kind: 'shop', name: 'Pedlar Tent' },
    { id: 'garden', x: 262, y: 134, kind: 'secret', name: 'Cliff Garden' },
    { id: 'arch', x: 318, y: 82, kind: 'bonus', name: 'Sky Arch' },
    { id: 'ridge', x: 330, y: 168, kind: 'level', name: 'Ridge Run' },
    { id: 'keep', x: 392, y: 108, kind: 'castle', name: 'Storm Keep' }
  ];
  const EDGES = [
    { a: 'trail', b: 'gull', via: [[48, 232]] }, { a: 'gull', b: 'tide', via: [[96, 224]] },
    { a: 'tide', b: 'lamp', via: [[142, 212]] }, { a: 'tide', b: 'seal', exit: 'secret', via: [[136, 254], [158, 266]] },
    { a: 'lamp', b: 'windy', via: [[184, 188]] }, { a: 'windy', b: 'tent', via: [[226, 194]] },
    { a: 'windy', b: 'garden', via: [[236, 158]] }, { a: 'garden', b: 'ridge', via: [[300, 150]] },
    { a: 'garden', b: 'arch', exit: 'secret', via: [[280, 106], [300, 92]] }, { a: 'arch', b: 'keep', via: [[352, 90]] },
    { a: 'ridge', b: 'keep', via: [[366, 148]] }
  ];
  const COINS = { gull: 8, tide: 10, seal: 6, windy: 12, garden: 12, arch: 5, ridge: 14, keep: 0 };

  /* ---------- demo state ---------- */
  let S, map, auto = HAS_T || Q.get('auto') === '1', pending = [], sfx = null;
  function fresh() { return { frame: 0, scene: 'map', level: null, got: {}, gems: {}, shop: 0, saved: null, cardT: 0 }; }
  function skinId() { return flat() ? 'flat-smoke' : 'pixel16'; }
  function makeMap(state) {
    map = GameDNA_LevelMap.create({
      nodes: NODES, edges: EDGES, state, view: { x: 0, y: 0, w: W, h: H }, params: P, skin: skinId(),
      enterLevel: id => { S.scene = 'level'; S.level = { id, t0: S.frame }; },
      onSave: st => { S.saved = st; },
      onShop: () => { S.shop = 100; },
      onSound: name => play(name),
      auto: () => auto,
      avoid: () => S.shop ? [{ x: 40, y: 70, w: 176, h: 52 }] : [],
      nodeInfo: id => {
        if (COINS[id] == null) return null;
        const items = [{ icon: 'coin', have: S.got[id] || 0, total: COINS[id] }];
        if (NODES.find(n => n.id === id).kind === 'secret') items.push({ icon: 'gem', have: S.gems[id] ? 1 : 0, total: 1 });
        if (id === 'keep') return { items: [], lines: ['THE LAST STAND'] };
        return { items };
      }
    });
  }
  function restart() { S = fresh(); makeMap(null); }

  /* ---------- the stand-in level ---------- */
  function finish(kind) {
    const L = S.level; if (!L) return;
    const node = NODES.find(n => n.id === L.id), secretOK = node.kind === 'secret';
    if (kind === 'fail') { S.scene = 'map'; S.level = null; map.fail(L.id); return; }
    const exit = kind === 'secret' && secretOK ? 'secret' : 'normal';
    const coins = Math.min(COINS[L.id] || 0, Math.max(S.got[L.id] || 0, Math.round((COINS[L.id] || 0) * (0.55 + 0.45 * ((S.frame * 7919) % 97) / 97))));
    S.got[L.id] = coins; if (exit === 'secret') S.gems[L.id] = 1;
    S.scene = 'map'; S.level = null;
    map.complete(L.id, exit === 'secret' && auto ? 'both' : exit);
  }
  function autoLevel() {   // the autopilot "plays" a level for 1.5 s; a secret level is cleared through both exits
    const L = S.level; if (!L || S.frame - L.t0 < 90) return;
    const node = NODES.find(n => n.id === L.id);
    finish(node.kind === 'secret' && !(map.isCleared(L.id)) ? 'secret' : 'clear');
  }

  /* ---------- step ---------- */
  function step() {
    S.frame++;
    const acts = pending; pending = [];
    for (const a of acts) {
      if (a === 'auto') { auto = !auto; continue; }
      if (S.scene === 'level') finish(a === 'clear' ? 'clear' : a);
    }
    if (S.shop > 0) S.shop--;
    if (S.scene === 'level') { if (auto) autoLevel(); S.cardT++; return; }
    map.update();
    { const p = map.player(), c = map.camera(), wx = p.x + c.x; TR.vx = TR.wx == null ? 0 : wx - TR.wx; TR.wx = wx; if (p.dir === 'side' && TR.vx) TR.side = TR.vx < 0 ? 'left' : 'right'; }   // __state() only
  }
  const TR = { wx: null, vx: 0, side: 'right' };   // the map hero's world x speed and the side of its last sideways step

  /* ---------- drawing ---------- */
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  function drawLevelCard() {
    const L = S.level, node = NODES.find(n => n.id === L.id), t = S.frame - L.t0, SK = GameDNA_Skin.resolve(skinId());
    // sky bands, sea, a far headland, the cliff path in front
    const sky = ['#2a4a8a', '#3a62a4', '#4e7cbc', '#6a98d0', '#8cb4e0', '#b0cce8'];
    sky.forEach((c, i) => R(0, i * 16, W, 16, c));
    for (let x = 0; x < W; x += 2) R(x, 96 + ((x >> 1) % 2), 1, 1, '#b0cce8');
    R(0, 96, W, 64, '#2a5ea6'); for (let y = 100; y < 160; y += 6) for (let x = (y * 7) % 13; x < W; x += 13) R((x + (t >> 2)) % W, y, 4, 1, '#3c84c4');
    R(170, 74, 86, 24, '#4a6a8a'); R(184, 68, 72, 6, '#4a6a8a'); R(200, 64, 56, 4, '#5a7a9a');
    R(0, 150, W, 74, '#94785c'); R(0, 146, W, 6, '#5aa844'); R(0, 146, W, 1, '#7cc458'); for (let x = 0; x < W; x += 9) R(x, 152 + (x % 4), 4, 30, '#7a6248');
    R(0, 182, W, 42, '#6a5440');
    for (let i = 0; i < 4; i++) { const gx = (i * 67 + t * (1 + i % 2)) % (W + 20) - 10, gy = 40 + i * 13 + Math.round(Math.sin((t + i * 30) / 12) * 2); R(gx, gy, 2, 1, '#f0f4ff'); R(gx + 2, gy + 1, 1, 1, '#f0f4ff'); R(gx + 3, gy, 2, 1, '#f0f4ff'); }
    // hero running in place
    const f = (t >> 3) % 2, hx = 58, hy = 129;
    R(hx + 2, hy + 17, 10, 2, 'rgba(0,0,0,0.3)');
    R(hx + 3, hy + 11 + f, 2, 5, '#5a4030'); R(hx + 8, hy + 12 - f, 2, 5, '#5a4030');
    R(hx + 2, hy + 6, 9, 6, '#3a64c8'); R(hx + 2, hy + 5, 9, 2, '#e04a3a'); R(hx - 1 - f, hy + 5, 3, 2, '#e04a3a');
    R(hx + 2, hy - 1, 9, 7, '#3a8a5a'); R(hx + 6, hy + 1, 5, 4, '#f4c49a'); R(hx + 9, hy + 2, 1, 2, '#1c1424');
    // title plate and the choices
    const title = node.name.toUpperCase(), tw = (SK.measure ? SK.measure(title, { font: 'ui' }) : title.length * 6) + 20;
    SK.frame(g, { x: (W - tw) >> 1, y: 20, w: tw, h: 20 }, { role: 'window', team: node.kind === 'castle' ? 'b' : 'a' });
    SK.text(g, title, W >> 1, 27, { font: 'ui', align: 'center', color: SK.palette.text.title, color2: SK.palette.text.title2 });
    const lines = auto ? ['AUTOPLAY...'] : ['Z  CLEAR'].concat(node.kind === 'secret' ? ['X  SECRET EXIT'] : []).concat(['C  GIVE UP']);
    const bw = 120, bh = lines.length * 11 + 10, bx = (W - bw) >> 1, by = 176;
    SK.frame(g, { x: bx, y: by, w: bw, h: bh }, { role: 'window', team: 'n' });
    lines.forEach((s, i) => SK.text(g, s, bx + 12, by + 6 + i * 11, { font: 'ui', color: SK.palette.text.main, color2: SK.palette.text.main2 }));
  }
  function drawShop() {
    if (!S.shop) return;
    const SK = GameDNA_Skin.resolve(skinId()), r = { x: 40, y: 70, w: 176, h: 52 };
    SK.frame(g, r, { role: 'window', team: 'a' });
    SK.text(g, 'PEDLAR TENT', r.x + 10, r.y + 8, { font: 'ui', color: SK.palette.text.title, color2: SK.palette.text.title2 });
    SK.text(g, 'ROPE        20 COINS', r.x + 10, r.y + 22, { font: 'ui', color: SK.palette.text.main, color2: SK.palette.text.main2 });
    SK.text(g, 'LANTERN     35 COINS', r.x + 10, r.y + 33, { font: 'ui', color: SK.palette.text.dim || '#8088a8', color2: SK.palette.text.dim || '#8088a8' });
  }
  function render() {
    if (flat()) g.setTransform(3, 0, 0, 3, 0, 0); else g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    if (S.scene === 'level') drawLevelCard();
    else { map.draw(g); drawShop(); }
    document.getElementById('clock').textContent = 't = ' + Math.round(S.frame * FRAME) + ' ms';
    const st = map.getState(), rv = map.revealing();
    document.getElementById('status').textContent = S.scene === 'level' ? 'In a level: ' + S.level.id + (auto ? ' (autoplay)' : '') :
      (rv ? 'Revealing ' + rv.edge + ' (' + rv.dot + '/' + rv.of + ')' : 'At ' + map.nodeInfo(map.at).name) + ' | cleared ' + Object.keys(st.cleared).length + '/9' + (auto ? ' | autoplay' : '');
  }

  /* ---------- sound (WebAudio blips, off by default) ---------- */
  function play(name) {
    if (!document.getElementById('sound').checked || HAS_T) return;
    try {
      sfx = sfx || new (window.AudioContext || window.webkitAudioContext)();
      const f = { dot: 880, step: 220, arrive: 520, open: 1040, enter: 330, save: 660, shop: 600, deny: 140 }[name] || 400;
      const o = sfx.createOscillator(), v = sfx.createGain(); o.type = name === 'deny' ? 'square' : 'triangle'; o.frequency.value = f;
      v.gain.value = name === 'step' ? 0.02 : 0.05; v.gain.exponentialRampToValueAtTime(0.0001, sfx.currentTime + (name === 'open' || name === 'save' ? 0.25 : 0.07));
      o.connect(v); v.connect(sfx.destination); o.start(); o.stop(sfx.currentTime + 0.3);
    } catch (e) { /* no audio */ }
  }

  /* ---------- skin smoke test ---------- */
  function flat() { return document.getElementById('flatSkin').checked; }
  if (window.GameDNA_Skin && !GameDNA_Skin.get('flat-smoke')) GameDNA_Skin.register({
    id: 'flat-smoke', name: 'Flat smoke test', pixel: false, native: { w: 256, h: 224, scale: 'fit' },
    palette: { ink: '#29304d', paper: '#f6f4ff', ui: { fill: '#fbfaff', fillTo: '#e8e6f6', edge: '#5b4bff', highlight: '#ffffff', shadow: '#29304d55' },
      team: { a: '#6f8cff', b: '#ff8574', n: '#9aa0b8' },
      overlay: { move: { fill: '#6f8cff', edge: '#3a50c0' }, attack: { fill: '#ff8574', edge: '#c04a3a' }, threat: { fill: '#b07aff', edge: '#7040c0' }, heal: { fill: '#5ad08a', edge: '#2a9a5a' } },
      fx: { hot: '#e0503a', cold: '#5ab8ff', heal: '#2aa060', crit: '#ffb43a' },
      text: { main: '#29304d', main2: '#29304d', shadow: '#00000000', outline: '#ffffff', dim: '#8a8fa8', dim2: '#8a8fa8', label: '#5b4bff', label2: '#5b4bff', title: '#3a2a8a', title2: '#3a2a8a', accent: '#c06a14' } },
    fonts: { ui: { type: 'canvas', family: 'system-ui, -apple-system, Segoe UI, sans-serif', size: 8, weight: 600 }, num: { type: 'canvas', family: 'system-ui, sans-serif', size: 10, weight: 800 } },
    shape: { radius: 3, edgeWidth: 1, padding: 4 }, shadow: { text: null, window: { dx: 0, dy: 1, blur: 3 }, sprite: { kind: 'blob', alpha: 0.3 } }
  });
  function applyCanvasMode() { const fl = flat(); canvas.width = fl ? W * 3 : W; canvas.height = fl ? H * 3 : H; g = canvas.getContext('2d'); fit(); }

  /* ---------- controls ---------- */
  function fit() {
    const avail = Math.min(780, (canvas.parentElement.parentElement.clientWidth || W) - 12), k = Math.max(1, Math.floor(avail / W));
    canvas.style.width = W * k + 'px'; canvas.style.height = H * k + 'px';
  }
  addEventListener('resize', fit);
  function syncURL() { if (HAS_T) return; const u = new URLSearchParams(); PARAMS.forEach(p => { if (String(P[p.key]) !== String(p.default)) u.set(p.key, P[p.key]); }); history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : '')); }
  const NAMES = { coast: 'Coast', dusk: 'Dusk', none: 'None', faint: 'Faint', hidden: 'Hidden', auto: 'Auto', top: 'Top', bottom: 'Bottom', off: 'Off', on: 'On', smooth: 'Smooth', instant: 'Instant' };
  function applyParams() { map.setParams(P); syncURL(); if (FREEZE) render(); }
  function buildParams() {
    const box = document.getElementById('params'); box.innerHTML = '';
    PARAMS.forEach(p => {
      const row = document.createElement('div'); row.className = 'row';
      if (p.type === 'range') {
        row.innerHTML = `<label><span>${p.label}</span><output>${P[p.key]}</output></label><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${P[p.key]}" aria-label="${p.label}">`;
        const inp = row.querySelector('input'), out = row.querySelector('output');
        const paint = () => inp.style.setProperty('--fill', ((inp.value - p.min) / (p.max - p.min) * 100) + '%'); paint();
        inp.addEventListener('input', () => { P[p.key] = Number(inp.value); out.textContent = inp.value; paint(); applyParams(); });
      } else {
        row.innerHTML = `<label><span>${p.label}</span></label><div class="seg" role="radiogroup">${p.options.map(o => `<button role="radio" data-v="${o}" aria-checked="${String(P[p.key]) === o}">${NAMES[o] || o}</button>`).join('')}</div>`;
        row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { P[p.key] = b.dataset.v; row.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); applyParams(); }));
      }
      box.appendChild(row);
    });
    const vb = document.getElementById('variants'); vb.innerHTML = '';
    VARIANTS.forEach(v => { const b = document.createElement('button'); b.textContent = v.name; b.addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); Object.assign(P, v.params); buildParams(); applyParams(); }); vb.appendChild(b); });
  }
  const KEYS = { KeyZ: 'clear', Enter: 'clear', Space: 'clear', KeyX: 'secret', KeyC: 'fail', KeyP: 'auto' };
  addEventListener('keydown', e => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.code === 'KeyP') { e.preventDefault(); if (!e.repeat) pending.push('auto'); return; }
    if (S.scene === 'level') { const k = KEYS[e.code]; if (k) { e.preventDefault(); if (!e.repeat) pending.push(k); } return; }
    if (map.key(e.code, true, e.repeat)) { e.preventDefault(); if (auto && !e.repeat) auto = false; }
  });
  addEventListener('keyup', e => map.key(e.code, false));
  document.querySelectorAll('.keys button').forEach(b => b.addEventListener('click', () => { if (b.dataset.k === 'clear' && S.scene === 'map') map.confirm(); else pending.push(b.dataset.k); }));
  function toNative(e) { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; }
  canvas.addEventListener('pointermove', e => { if (S.scene !== 'map') return; const [x, y] = toNative(e), id = map.hover(x, y); canvas.style.cursor = id ? 'pointer' : 'default'; });
  canvas.addEventListener('pointerdown', e => { if (S.scene !== 'map') { pending.push('clear'); return; } const [x, y] = toNative(e); auto = false; map.click(x, y); });
  document.getElementById('replay').addEventListener('click', () => { restart(); if (FREEZE) render(); });
  document.getElementById('reset').addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); buildParams(); applyParams(); });
  document.getElementById('flatSkin').addEventListener('change', () => { applyCanvasMode(); const f = S.frame; const st = map.getState(); restart(); for (let i = 0; i < f; i++) step(); render(); });
  if (Q.get('skin') === 'flat') document.getElementById('flatSkin').checked = true;

  /* ---------- boot ---------- */
  applyCanvasMode(); restart(); buildParams();
  if (HAS_T) { const n = Math.floor(T0 / FRAME); for (let i = 0; i < n; i++) step(); }
  render();
  /* text state for critics and tools/sprites/statecheck.py: one character. On the map it is the module's walker: player().dir is 'up' / 'down' /
     'side'; the module mirrors the side frame when it walks left (hero.flip) but player() does not report that, so the side here is DERIVED from the
     hero's own world x steps (same rule as the module: left when the step goes left). In a level card the demo draws the runner looking right. */
  window.__state = () => { const t = Math.round(S.frame * 1000 / 60);
    if (S.scene === 'level') return { t, scene: 'level', actors: [{ id: 'hero', x: 58 + 6, y: 129 + 17, facing: 'right', target: null, vx: 0, note: 'runs in place, drawn looking right' }] };
    const p = map.player(), side = p.dir === 'side';
    return { t, scene: 'map', actors: [{ id: 'hero', x: p.x, y: p.y, facing: side ? TR.side : null, target: null, vx: p.walking && side ? Math.round(TR.vx * 100) / 100 : 0, noFace: side ? undefined : p.dir + ' frame', derived: true }] }; };
  window.__demo = () => ({ frame: S.frame, scene: S.scene, at: map.at, mode: map.mode, state: map.getState(), revealing: map.revealing(), ui: map.getUIRects(), player: map.player() });
  if (!FREEZE) {
    let last = null, acc = 0;
    const loop = ts => { if (last === null) last = ts; acc += Math.min(250, ts - last); last = ts; while (acc >= FRAME) { step(); acc -= FRAME; } render(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
})();
