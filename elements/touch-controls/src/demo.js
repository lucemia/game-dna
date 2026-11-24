// I-03 demo: a tiny practice yard played through GameDNA_TouchControls in 'poll' mode.
// ?t=<ms>&freeze=1 fast-forwards the scripted session (the script presses through tc.press/release, so the controls show it).
(() => {
  'use strict';
  const PARAMS = /*PARAMS*/[];
  const VARIANTS = /*VARIANTS*/[];
  const Q = new URLSearchParams(location.search);
  const FREEZE = Q.get('freeze') === '1', T0 = Q.has('t') ? Math.max(0, Number(Q.get('t')) || 0) : 0;
  const P = {}; PARAMS.forEach(p => { P[p.key] = Q.has(p.key) ? (p.type === 'range' ? Number(Q.get(p.key)) : Q.get(p.key)) : p.default; });
  const W = 126, H = 105, STEP = 1000 / 60, GROUND = 84, HUD = { x: 0, y: 0, w: W, h: 12 }, DX = 98;   // small view at 4x so the knight reads on a phone;   // DX: training dummy x
  const canvas = document.getElementById('screen'), phone = document.getElementById('phone');
  let g = canvas.getContext('2d');
  const NAMES = ['up', 'down', 'left', 'right', 'a', 'b', 'start'];

  /* ---------- art (original, drawn from strings) ---------- */
  const PAL = { k: '#1a1020', s: '#f0c8a0', h: '#6a3a20', a: '#4c6ad8', A: '#2c3e9a', m: '#c8d0e0', M: '#8890a8', b: '#5a3a1a', w: '#ffffff', r: '#d85a48', y: '#e8c048', Y: '#a87a20', g: '#7a5a30', G: '#c8a060', t: '#d8b070', T: '#a07840', e: '#2a1a10' };
  Object.assign(PAL, { W: '#f4f8ff', B: '#3a2410', S: '#c89070', d: '#1c2a6a', R: '#8a2a2a' });
  const KNIGHT = [
    '.......rr.......', '.....kkrrk......', '....kmmmmmk.....', '...kmWmmmmMk....', '...kmmmmmMMk....', '...kmMkkkkkk....', '...kMkssksk.....', '....kksssSk.....', '...kkAaaaakk....',
    '..kAaaaWaaaAk...', '..kAkaayyaAksk..', '..kskAaaaaAkSk..', '..kkkAAaaAAkk...', '....kdAaaAdk....', '....kbbkkbbk....', '....kbbk.kbbk...', '...kbBk..kbBk...', '...kkkk..kkkk...'];
  const KNIGHT2 = KNIGHT.slice(0, 14).concat(['....kbbkkbbk....', '...kbbk..kbk....', '...kBk...kbBk...', '...kkk...kkkk...']);
  const DUMMY = [
    '.....kkkkkk.....', '....kttttttk....', '...kttTttTttk...', '...ktekttketk...', '...kttttttTtk...', '....kTtkktTk....', '.....kkGGkk.....', 'kkkkkkGGGGkkkkkk', 'kGGGGGGGGGGGGgGk', 'kkkkkGGrrGGkkkkk',
    '....kGrWWrGk....', '....kGrWWrgk....', '....kGGrrGgk....', '....kGGGGggk....', '.....kGggk......', '.....kGggk......', '.....kGggk......', '.....kGggk......', '....kkGggkk.....', '...kggggggggk...'];
  const COIN = ['.kkkk.', 'kyyyYk', 'kywyYk', 'kyyyYk', 'kyyyYk', '.kkkk.'];
  const sprites = {};
  function sprite(rows, flip, flash) {
    const key = rows.join('') + flip + flash; if (sprites[key]) return sprites[key];
    const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length; const x = c.getContext('2d');
    rows.forEach((r, yy) => [...r].forEach((ch, xx) => { if (ch === '.') return; x.fillStyle = flash && ch !== 'k' ? '#ffffff' : PAL[ch]; x.fillRect(flip ? r.length - 1 - xx : xx, yy, 1, 1); }));
    return (sprites[key] = c);
  }
  const FONT = { // 3x5 HUD digits and letters
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001011001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
    A: '010101111101101', C: '111100100100111', O: '111101101101111', B: '110101110101110', D: '110101101101110', E: '111100110100111', H: '101101111101101', I: '111010010010111', J: '001001001101010', M: '101111111101101', N: '110101101101101',
    P: '110101110100100', R: '110101110101101', S: '111100111001111', T: '111010010010010', U: '101101101101111', ' ': '000000000000000', ':': '000010000010000' };
  function txt(s, x, y, c) { for (const ch of s) { const f = FONT[ch] || FONT[' ']; for (let i = 0; i < 15; i++) if (f[i] === '1') { g.fillStyle = '#0a0c24'; g.fillRect(x + i % 3, y + (i / 3 | 0) + 1, 1, 1); } for (let i = 0; i < 15; i++) if (f[i] === '1') { g.fillStyle = c; g.fillRect(x + i % 3, y + (i / 3 | 0), 1, 1); } x += 4; } return x; }

  /* ---------- game state ---------- */
  let S;
  function reset() { S = { f: 0, x: 30, y: GROUND - 16, vx: 0, vy: 0, ground: true, face: 1, swing: 0, jumps: 0, hits: 0, coins: 0, paused: false, dummyHit: 0, coin: { x: 70, y: 46, t: 0 }, script: true, dust: [] }; }
  reset();
  /* text state for critics and tools/sprites/statecheck.py (canvas px, feet): one character. The knight sprite is painted looking right and
     mirrored when S.face < 0; the training dummy is a prop (target = its x while the knight swings next to it). */
  window.__state = () => ({ t: Math.round(S.f * STEP), actors: [{ id: 'knight', x: Math.round(S.x) + 6, y: Math.round(S.y) + 16, facing: S.face < 0 ? 'left' : 'right',
    target: S.swing && Math.abs(S.x - DX) < 30 ? DX + 6 : null, vx: Math.round(S.vx * 100) / 100, flipX: S.face < 0, swing: S.swing }] });
  window.__yard = () => ({ x: S.x, face: S.face, hits: S.hits, jumps: S.jumps, swing: S.swing, paused: S.paused });

  /* ---------- the module ---------- */
  let tc = null;
  function makeTC() {
    if (tc) tc.destroy();
    tc = GameDNA_TouchControls.create({
      canvas, container: document.getElementById('safe'), mode: 'poll', skin: flat() ? 'flat-smoke' : 'pixel16',
      map: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', a: ['KeyZ', 'Space'], b: 'KeyX', c: 'KeyC', start: 'Enter' },
      params: Object.assign({}, P), avoid: () => [HUD].concat(S.paused ? [{ x: 23, y: 38, w: 80, h: 26 }] : [])
    });
    if (document.getElementById('force').checked && P.show !== 'never') tc.show(true);
    window.__tc = tc;
  }

  /* ---------- scripted session (until a person takes over) ---------- */
  // walk right and hop, stop left of the dummy facing it, swing (hit lands ~1950 ms), up-left diagonal, pause, walk left and hop
  const SCRIPT = [[700, 'right', 1], [1050, 'a', 1], [1250, 'a', 0], [1400, 'right', 0], [1800, 'b', 1], [2000, 'b', 0], [2600, 'up', 1], [2600, 'left', 1], [3300, 'up', 0], [3300, 'left', 0],
    [4000, 'start', 1], [4200, 'start', 0], [5200, 'start', 1], [5350, 'start', 0], [5600, 'left', 1], [5900, 'a', 1], [6050, 'a', 0], [6300, 'left', 0], [7300, 'b', 1], [7400, 'b', 0]];
  const LOOP = 8500;
  function runScript(ms) {
    const t = ms % LOOP, t0 = t - STEP;
    if (t < STEP) NAMES.forEach(n => tc.release(n));
    SCRIPT.forEach(([at, n, on]) => { if (at > t0 && at <= t) on ? tc.press(n) : tc.release(n); });
  }
  function human() { if (!S.script) return; S.script = false; NAMES.forEach(n => tc.release(n)); document.getElementById('status').textContent = 'You have the controls. Replay script to watch it again.'; }
  addEventListener('keydown', e => { if (e.isTrusted && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) human(); }, true);
  addEventListener('pointerdown', e => { if (e.isTrusted && tc && tc.layout()) { const L = tc.layout().rects, x = e.clientX, y = e.clientY;
    const near = Math.hypot(x - L.pad.cx, y - L.pad.cy) < L.pad.rr + 14 || L.buttons.some(b => Math.hypot(x - b.cx, y - b.cy) < b.r + 12) || (L.start && x > L.start.x - 8 && x < L.start.x + L.start.w + 8 && y > L.start.y - 8 && y < L.start.y + L.start.h + 8);
    if (near) human(); } }, true);

  /* ---------- step ---------- */
  function step() {
    tc.step();
    if (S.script) runScript(S.f * STEP);
    S.f++;
    if (tc.pressed('start')) S.paused = !S.paused;
    if (S.paused) return;
    const ax = tc.axis().x;
    S.vx = ax * 1.25; if (ax) S.face = ax > 0 ? 1 : -1;
    if (tc.pressed('a') && S.ground) { S.vy = -3.7; S.ground = false; S.jumps++; for (let i = 0; i < 4; i++) S.dust.push({ x: S.x + 6, y: GROUND, vx: (i - 1.5) * 0.4, t: 14 }); }
    if (!tc.held('a') && S.vy < -1.4) S.vy = -1.4;                       // short hop on a quick tap
    if (tc.pressed('b') && !S.swing) { S.swing = 16; }
    S.vy += 0.2; S.x = Math.max(4, Math.min(W - 16, S.x + S.vx)); S.y += S.vy;
    if (S.y >= GROUND - 16) { if (!S.ground && S.vy > 1) for (let i = 0; i < 3; i++) S.dust.push({ x: S.x + 6, y: GROUND, vx: (i - 1) * 0.5, t: 10 }); S.y = GROUND - 16; S.vy = 0; S.ground = true; }
    if (S.swing) { S.swing--; if (S.swing === 10) { const reach = S.face > 0 ? S.x + 12 : S.x - 12; if (Math.abs(reach + 6 - DX - 6) < 14 && S.y > GROUND - 40) { S.hits++; S.dummyHit = 12; } } }
    if (S.dummyHit) S.dummyHit--;
    S.coin.t++;
    if (Math.abs(S.x + 6 - S.coin.x - 3) < 8 && Math.abs(S.y + 8 - S.coin.y - 3) < 10) { S.coins++; S.coin.x = 14 + (S.coins * 53) % 84; S.coin.y = 40 + (S.coins * 17) % 22; }
    S.dust = S.dust.filter(d => { d.x += d.vx; d.t--; return d.t > 0; });
  }

  /* ---------- render ---------- */
  // static backdrop, baked once: banded sky, three hill ranges, kit trees and bushes behind a kit fence, layered earth
  let BG = null;
  function buildBG() {
    const PXS = window.GameDNA_PixelScene, mkc = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const sky = mkc(), s = sky.getContext('2d'), land = mkc(), l = land.getContext('2d');
    const bands = ['#34449a', '#4054a8', '#4e68b8', '#6080c8', '#7898d8', '#90b0e4', '#a8c4ee'], bh = Math.ceil((GROUND - 12) / bands.length);
    bands.forEach((c, i) => { s.fillStyle = c; s.fillRect(0, 12 + i * bh, W, bh + 1); if (i) for (let x = 0; x < W; x += 2) s.fillRect(x + (i % 2), 12 + i * bh - 1, 1, 1); });
    const range = (base, a1, f1, p1, a2, f2, p2, body, rim, shade) => { for (let x = 0; x < W; x++) { const h = base + Math.round(a1 * Math.sin(x / f1 + p1) + a2 * Math.sin(x / f2 + p2)), hn = base + Math.round(a1 * Math.sin((x + 1) / f1 + p1) + a2 * Math.sin((x + 1) / f2 + p2));
      l.fillStyle = body; l.fillRect(x, GROUND - h, 1, h); l.fillStyle = rim; l.fillRect(x, GROUND - h, 1, 1); if (hn < h) { l.fillStyle = shade; l.fillRect(x, GROUND - h + 1, 1, Math.min(h - 1, 2 + (x % 3))); } else if (x % 4 === 0) { l.fillStyle = rim; l.fillRect(x, GROUND - h + 2, 1, 1); } } };
    range(40, 12, 27, 0.5, 4, 7, 0, '#7a88c8', '#a0acdc', '#6a78b8');
    range(20, 9, 21, 0, 6, 9, 1, '#5a6aa8', '#7484bc', '#4c5c98');
    range(10, 5, 13, 2, 2, 5, 0, '#3e5c6e', '#52767c', '#34505f');
    if (PXS) {
      [['pine', 4, 1], ['tree', 17, 0], ['smalltree', 40, 1], ['tree', 60, 2], ['pine', 80, 0], ['smalltree', 106, 2], ['tree', 122, 1]].forEach(([k, x, v]) => PXS.drawProp(l, k, x, GROUND + 1, { v }));
      [['bush', 30, 0], ['bush', 90, 1], ['bush', 114, 0]].forEach(([k, x, v]) => PXS.drawProp(l, k, x, GROUND + 1, { v }));
      PXS.drawProp(l, 'fence', -2, GROUND + 1, { len: W + 6 });
      PXS.sideGround(l, 0, GROUND, W, H - GROUND, { seed: 4 });
      [[24, 0], [66, 1], [108, 2]].forEach(([x, v]) => { const f = PXS.prop('flowers', { v }).frames[0]; l.drawImage(f, x, GROUND - 6); });
    } else { l.fillStyle = '#4a8a3a'; l.fillRect(0, GROUND, W, 4); l.fillStyle = '#6a4a2a'; l.fillRect(0, GROUND + 4, W, H - GROUND - 4); }
    BG = { sky, land };
  }
  function render() {
    if (!BG) buildBG();
    g.drawImage(BG.sky, 0, 0);
    [[14, 24, 20], [70, 18, 26], [112, 32, 16], [-30, 42, 22]].forEach(([x0, y, w], i) => { const x = Math.round(((x0 + S.f * (0.04 + i * 0.015)) % (W + 60)) - 30);
      g.fillStyle = '#f4f6ff'; g.fillRect(x, y, w, 4); g.fillRect(x + 3, y - 2, w - 8, 2); g.fillRect(x + 6, y - 4, Math.max(4, w - 16), 2); g.fillStyle = '#ffffff'; g.fillRect(x + 7, y - 4, Math.max(2, w - 20), 1); g.fillRect(x + 4, y - 2, 3, 1);
      g.fillStyle = '#c8d4f4'; g.fillRect(x + 1, y + 3, w - 2, 1); g.fillRect(x + 3, y + 4, w - 6, 1); g.fillStyle = '#a8b8e8'; g.fillRect(x + 5, y + 4, w - 12, 1); });
    g.drawImage(BG.land, 0, 0);
    g.drawImage(sprite(DUMMY, false, S.dummyHit > 6), DX - 2, GROUND - 20);
    if (S.dummyHit > 4) { g.fillStyle = '#ffffff'; [[-3, 3], [15, 5], [-2, 10], [14, 11]].forEach(([x, y]) => g.fillRect(DX + x, GROUND - 16 + y, 2, 1)); }
    if (S.coin) g.drawImage(sprite(COIN), S.coin.x, S.coin.y + Math.round(Math.sin(S.coin.t / 10) * 2));
    S.dust.forEach(d => { g.fillStyle = '#e8dcc0'; g.fillRect(Math.round(d.x), d.y - 1 - (d.t > 7 ? 1 : 0), 2, 1); });
    const kx = Math.round(S.x), ky = Math.round(S.y), walk = S.ground && Math.abs(S.vx) > 0.1 && (S.f >> 3) & 1;
    g.fillStyle = '#0006'; g.fillRect(kx + 2, GROUND - 1, 8, 1);
    g.drawImage(sprite(walk ? KNIGHT2 : KNIGHT, S.face < 0), kx - 2, ky - 2);
    if (S.swing) {   // sword arc
      const ph = S.swing > 11 ? 0 : S.swing > 6 ? 1 : 2, f = S.face, bx = f > 0 ? kx + 11 : kx - 1;   // the raised blade sits on the sword hand: mirrored about the sprite centre (kx + 6), shaded edge outside
      if (ph === 0) { g.fillStyle = '#e8eef8'; g.fillRect(bx, ky - 5, 2, 9); g.fillStyle = '#8a98b8'; g.fillRect(f > 0 ? bx + 1 : bx, ky - 5, 1, 9); }
      else {   // crescent slash: 3 px band, white core, pale and blue rims; the second phase is the fading tail
        const cx = kx + 6, cy = ky + 8, a0 = ph === 1 ? -1.25 : 0.15, a1 = ph === 1 ? 1.0 : 1.25;
        for (let yy = -13; yy <= 13; yy++) for (let xx = -13; xx <= 13; xx++) {
          const d = Math.hypot(xx, yy), an = Math.atan2(yy, xx * f); if (d < 9 || d > 12.4 || an < a0 || an > a1) continue;
          g.fillStyle = d > 11.4 ? '#6aa8f0' : d > 10.2 ? '#d8ecff' : '#ffffff'; if (ph === 2 && d < 10.2) g.fillStyle = '#b8d8ff'; g.fillRect(cx + xx, cy + yy, 1, 1);
        }
      }
    }
    // HUD
    g.fillStyle = '#0a0c24'; g.fillRect(0, 0, W, 12); g.fillStyle = '#3a4a8a'; g.fillRect(0, 11, W, 1);
    let x = txt('JUMPS ' + S.jumps, 4, 4, '#ffffff'); x = txt('HITS ' + S.hits, x + 8, 4, '#ffe070'); txt('COINS ' + S.coins, x + 8, 4, '#c8d4ff');
    if (S.paused) {
      g.fillStyle = '#0a0c24e0'; g.fillRect(23, 38, 80, 26); g.fillStyle = '#c8d4f4'; g.fillRect(23, 38, 80, 1); g.fillRect(23, 63, 80, 1);
      txt('PAUSED', 51, 44, '#ffe070'); txt('PRESS START', 41, 54, '#c8d4ff');
    }
  }

  /* ---------- skin smoke test ---------- */
  function flat() { return document.getElementById('flatSkin').checked; }
  if (window.GameDNA_Skin && !GameDNA_Skin.get('flat-smoke')) GameDNA_Skin.register({
    id: 'flat-smoke', name: 'Flat smoke test', pixel: false, native: { w: 256, h: 224, scale: 'fit' },
    palette: { ink: '#29304d', paper: '#f6f4ff', ui: { fill: '#fbfaff', fillTo: '#e8e6f6', edge: '#5b4bff', highlight: '#ffffff', shadow: '#29304d' },
      team: { a: '#6f8cff', b: '#ff8574', n: '#9aa0b8' },
      overlay: { move: { fill: '#6f8cff', edge: '#3a50c0' }, attack: { fill: '#ff8574', edge: '#c04a3a' }, threat: { fill: '#b07aff', edge: '#7040c0' }, heal: { fill: '#5ad08a', edge: '#2a9a5a' } },
      fx: { hot: '#ff7a3a', cold: '#5ab8ff', heal: '#3ac070', crit: '#ffb43a' },
      text: { main: '#ffffff', main2: '#ffffff', shadow: '#00000000', outline: '#29304d', dim: '#7a80a0', accent: '#5b4bff' } },
    fonts: { ui: { type: 'canvas', family: 'system-ui, -apple-system, Segoe UI, sans-serif', size: 8, weight: 700 }, num: { type: 'canvas', family: 'system-ui, sans-serif', size: 10, weight: 800 } },
    shape: { radius: 3, edgeWidth: 1, padding: 4 }, shadow: { text: null, window: { dx: 0, dy: 1, blur: 3 }, sprite: { kind: 'blob', alpha: 0.3 } }
  });

  /* ---------- page ---------- */
  function fit() {
    const land = phone.classList.contains('land'), pw = phone.clientWidth, ph = phone.clientHeight;
    const k = land ? Math.max(1, Math.min(Math.floor((ph - 20) / H), Math.floor((pw - 40) / W))) : Math.max(1, Math.floor(pw / W));
    canvas.style.width = W * k + 'px'; canvas.style.height = H * k + 'px';
  }
  function setOrient(o) { phone.classList.toggle('land', o === 'land'); document.querySelectorAll('#orient button').forEach(b => b.setAttribute('aria-checked', b.dataset.o === o)); fit(); tighten(); }
  // portrait mock: as tall as game + caption + the deck, so there is no dead gap between them
  function tighten() {
    if (!tc) return;
    phone.style.height = '';
    if (phone.classList.contains('land')) return;
    phone.style.height = '760px';
    const L = tc.layout(); if (!L || !L.rects.band) { phone.style.height = Math.ceil(canvas.getBoundingClientRect().bottom - phone.getBoundingClientRect().top + 64) + 'px'; tc.layout(); return; }
    const pr = phone.getBoundingClientRect(), cr = canvas.getBoundingClientRect(), R = L.rects;
    const low = Math.max(R.pad.y + R.pad.h, ...R.buttons.map(b => b.cy + b.r + 2 * L.px), R.start ? R.start.y + R.start.h + L.px : 0), bandH = low - R.band.y + 5 * L.px;
    phone.style.height = Math.ceil(cr.bottom - pr.top + 30 + bandH) + 'px'; tc.layout();
  }
  document.querySelectorAll('#orient button').forEach(b => b.addEventListener('click', () => { setOrient(b.dataset.o); syncURL(); }));
  addEventListener('resize', () => { fit(); tighten(); });
  function syncURL() { const u = new URLSearchParams(); PARAMS.forEach(p => { if (String(P[p.key]) !== String(p.default)) u.set(p.key, P[p.key]); }); if (phone.classList.contains('land')) u.set('orient', 'land'); if (flat()) u.set('skin', 'flat'); history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : '')); }
  function buildParams() {
    const box = document.getElementById('params'); box.innerHTML = '';
    PARAMS.forEach(p => {
      const row = document.createElement('div'); row.className = 'row';
      if (p.type === 'range') {
        row.innerHTML = `<label><span>${p.label}</span><output>${P[p.key]}</output></label><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${P[p.key]}">`;
        const inp = row.querySelector('input'), out = row.querySelector('output');
        const paint = () => inp.style.setProperty('--fill', ((inp.value - p.min) / (p.max - p.min) * 100) + '%'); paint();
        inp.addEventListener('input', () => { P[p.key] = Number(inp.value); out.textContent = inp.value; paint(); tc.setParams(P); tighten(); syncURL(); });
      } else {
        row.innerHTML = `<label><span>${p.label}</span></label><div class="seg" role="radiogroup">${p.options.map(o => `<button role="radio" data-v="${o}" aria-checked="${String(P[p.key]) === o}">${o}</button>`).join('')}</div>`;
        row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { P[p.key] = b.dataset.v; row.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); tc.setParams(P); if (p.key === 'show') makeTC(); tighten(); syncURL(); }));
      }
      box.appendChild(row);
    });
    const vb = document.getElementById('variants'); vb.innerHTML = '';
    VARIANTS.forEach(v => { const b = document.createElement('button'); b.textContent = v.name; b.addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); Object.assign(P, v.params); buildParams(); tc.setParams(P); tighten(); syncURL(); }); vb.appendChild(b); });
  }
  // input monitor
  const mon = document.getElementById('mon');
  mon.innerHTML = '<tr><td>role</td><td>held</td><td>presses</td><td>from</td></tr>' + NAMES.map(n => `<tr><td>${n}</td><td><span class="lamp" id="l-${n}"></span></td><td id="c-${n}">0</td><td class="src" id="s-${n}"></td></tr>`).join('');
  const SRC = s => s === 'script' ? 'script' : s[0] === 'k' ? 'key ' + s.slice(2) : s[0] === 'p' ? 'touch' : s;
  function monitor() {
    try { const st = tc.state(); NAMES.forEach(n => { const r = st.names[n]; if (!r) return; document.getElementById('l-' + n).classList.toggle('on', r.held || r.down); document.getElementById('c-' + n).textContent = r.count; document.getElementById('s-' + n).textContent = [...new Set(r.sources.map(SRC))].join(', '); }); } catch (e) {}
    document.getElementById('clock').textContent = 't = ' + Math.round(S.f * STEP) + ' ms';
  }
  // 0 ms tap tests: keydown and keyup in the same task, 120 ms apart
  function tapTest(kind) {
    human(); const before = S.jumps, start = tc.count('a'); let i = 0; S.x = 30;
    const one = () => {
      if (kind === 'key') { dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', bubbles: true })); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', bubbles: true })); }
      else tc.tap('a');
      if (++i < 10) setTimeout(one, 700); else setTimeout(() => { document.getElementById('tapRes').textContent = (tc.count('a') - start) + ' / 10 presses, ' + (S.jumps - before) + ' jumps'; }, 400);
    };
    document.getElementById('tapRes').textContent = '…'; one();
  }
  document.getElementById('tap0').addEventListener('click', () => tapTest('key'));
  document.getElementById('tapT').addEventListener('click', () => tapTest('touch'));
  document.getElementById('force').addEventListener('change', e => { tc.show(e.target.checked ? true : null); });
  document.getElementById('flatSkin').addEventListener('change', () => { makeTC(); syncURL(); });
  document.getElementById('replay').addEventListener('click', () => { reset(); NAMES.forEach(n => tc.release(n)); document.getElementById('status').textContent = 'Script playing: touch the controls or press a key to take over.'; });
  document.getElementById('reset').addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); buildParams(); tc.setParams(P); syncURL(); });

  /* ---------- boot ---------- */
  if (Q.get('skin') === 'flat') document.getElementById('flatSkin').checked = true;
  if (Q.get('force') === '0') document.getElementById('force').checked = false;
  const autoLand = !Q.has('orient') && innerWidth > innerHeight && innerHeight < 560;   // a phone held sideways
  buildParams(); makeTC();
  setOrient(Q.get('orient') === 'land' || autoLand ? 'land' : 'portrait');
  g.imageSmoothingEnabled = false;
  if (T0) { for (let i = Math.floor(T0 / STEP); i > 0; i--) step(); }
  render(); monitor();
  if (FREEZE) { window.__frozen = true; setInterval(monitor, 200); return; }
  let acc = 0, last = null;
  function loop(ts) { if (last === null) last = ts; acc += Math.min(250, ts - last); last = ts; while (acc >= STEP) { step(); acc -= STEP; } render(); monitor(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
})();
