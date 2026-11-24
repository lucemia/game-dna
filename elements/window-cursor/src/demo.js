'use strict';
// C-01 demo: a small original battle scene whose every window, cursor and target pointer comes from GameDNA_WindowCursor.
// The scene keeps its own menu state (like a host game) and reports to the module what is open and selected.
(() => {
  const W = 256, H = 224, FRAME = 1000 / 60, HUD_Y = 152;
  const PARAMS = /*PARAMS*/[];
  const VARIANTS = /*VARIANTS*/[];
  const Q = new URLSearchParams(location.search);
  const FREEZE = Q.get('freeze') === '1', T0 = Q.has('t') ? Math.max(0, Number(Q.get('t')) || 0) : 0;
  const P = {}; PARAMS.forEach(p => { P[p.key] = Q.has(p.key) ? (p.type === 'range' ? Number(Q.get(p.key)) : Q.get(p.key)) : p.default; });

  const canvas = document.getElementById('screen');
  let g = canvas.getContext('2d');

  /* ---------- deterministic noise ---------- */
  const hash = (x, y, k) => { let h = Math.imul(x + 374761 * k, 668265263) ^ Math.imul(y + 9, 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

  /* ---------- pixel art (original) ---------- */
  function bake(rows, pal) {
    const w = Math.max(...rows.map(r => r.length)), mk = mode => {
      const c = document.createElement('canvas'); c.width = w; c.height = rows.length; const x = c.getContext('2d');
      rows.forEach((row, y) => { for (let i = 0; i < row.length; i++) { const col = pal[row[i]]; if (!col) continue; x.fillStyle = mode === 'white' ? (row[i] === 'o' ? '#d8f4ff' : '#ffffff') : col; x.fillRect(i, y, 1, 1); } });
      return c;
    };
    return { n: mk('n'), white: mk('white'), w, h: rows.length };
  }
  const HERO = [
    '......oooo......', '.....ohhhho.....', '....ohhhhhho....', '....ohsshhho....', '....oessshho....', '....osssshho....', '.....ossso......',
    '....oobbbboo....', '...obbbllbbbo...', '..oaobbbbbbdo...', '..oaobbbbbbdo...', '..ooobbbbbddo...', '....oddddddo....', '....oppppppo....',
    '....oppoopppo...', '....oppo.oppo...', '...okkko.okkko..', '...oooo..oooo...'
  ];
  const HPAL = { o: '#141020', s: '#f0c098', e: '#141020', p: '#4a3a5a', k: '#2a1e18' };
  const heroes = [
    { id: 'arden', name: 'Arden', pal: { h: '#a8b0c0', b: '#3a5ec8', l: '#7aa0f0', d: '#223a80', a: '#e8eef8' }, hp: 312, max: 340, mp: 9, x: 198, y: 96, weapon: 'sword' },
    { id: 'lyra', name: 'Lyra', pal: { h: '#e0b040', b: '#b03a4a', l: '#e87a80', d: '#701e2c', a: '#f0c098' }, hp: 188, max: 245, mp: 22, x: 214, y: 120, weapon: 'staff' },
    { id: 'corin', name: 'Corin', pal: { h: '#6a3e22', b: '#3a8a52', l: '#78c488', d: '#1e5a34', a: '#f0c098' }, hp: 41, max: 270, mp: 14, x: 200, y: 144, weapon: 'bow' }
  ];
  heroes.forEach(h => { h.side = 'hero'; h.art = bake(HERO, Object.assign({}, HPAL, h.pal)); });
  const GOLEM = [
    '........oooooooo........', '......oommMMMMmmoo......', '.....omMMMMmmmmmmmo.....', '....omMMmmmmmmmmmmmo....', '....osssssssssssssso....',
    '...ossSSSssssssssssdo...', '...osSSseeossseesdddo...', '...osSsssssssssssdddo...', '..oossssssddddssssddoo..', '.omMmossssssssssssdomMo.',
    'omMMmoosssssssssddoommMo', 'osSssoossSSssssdddoosSdo', 'osSssoosSSsssssdddoosSdo', 'ossddo.osssssssddo.oddo.', '.oddo..osssssssddo..oo..',
    '..oo...ommmmmmmmmo......', '.......osssooossso......', '......ossSso.ossSso.....', '......osssdo.osssdo.....', '......osddo..osddo......',
    '.....oossdo..ossdoo.....', '.....osssso..ossssso....', '.....oooooo..ooooooo....'
  ];
  const GPAL = { o: '#1a2016', m: '#4e8236', M: '#8cc45a', s: '#7a7266', S: '#aaa294', d: '#4a443c', e: '#ffe070' };
  const BAT = [[
    'oo..................oo', 'omo................omo', 'oMmo.....o..o.....omMo', 'oMmmo...omoomo...ommMo', '.oMmmooommmmmmooommMo.',
    '..oMmmmmmemmemmmmmMo..', '...oommmmmmmmmmmmoo...', '.....ooommmmmmooo.....', '........oowwoo........', '.........o..o.........'
  ], [
    '.........o..o.........', '........omoomo........', '.......ommmmmmo.......', '.....oommemmemmoo.....', '...oomMmmmmmmmmmMmoo..',
    '.ooMMmmooommmmooommMMoo', 'oMmmmo..oommmmoo..ommmMo', 'omo......oowwoo......omo', 'oo........o..o........oo'
  ]];
  const BPAL = { o: '#180c20', m: '#6a4a96', M: '#a888d8', e: '#ff6a5a', w: '#f4f0f8' };
  const foes = [
    { id: 'golemA', name: 'Moss Golem', art: bake(GOLEM, GPAL), x: 52, y: 128 },
    { id: 'golemB', name: 'Moss Golem', art: bake(GOLEM, Object.assign({}, GPAL, { m: '#5a7a2e', M: '#a0c050' })), x: 104, y: 104 },
    { id: 'bat', name: 'Cave Bat', arts: BAT.map(r => bake(r, BPAL)), x: 66, y: 66, hover: true }
  ];
  foes.forEach(f => { f.side = 'foe'; if (!f.art) f.art = f.arts[0]; });
  const units = () => foes.concat(heroes);

  /* ---------- background (baked) ---------- */
  const scene = (() => {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const s = c.getContext('2d');
    const sky = ['#18203e', '#1e2c52', '#263c68', '#30507e', '#3e6890', '#5a849e', '#86a6a8', '#b0c4a8'];
    for (let y = 0; y < 64; y++) for (let x = 0; x < W; x++) {
      const f = y / 64 * (sky.length - 1), i = Math.floor(f), m = f - i, th = ((x & 1) * 2 + (y & 1)) / 4 + 0.125;
      s.fillStyle = sky[m > th ? Math.min(i + 1, sky.length - 1) : i]; s.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 26; i++) { const x = Math.floor(hash(i, 1, 3) * W), y = Math.floor(hash(i, 2, 3) * 30); s.fillStyle = i % 4 ? '#c8d4f0' : '#ffffff'; s.fillRect(x, y, 1, 1); }
    const ridge = (base, amp, fq, ph, col, top) => { for (let x = 0; x < W; x++) { const h = Math.round(base - Math.abs(Math.sin(x * fq + ph)) * amp - Math.max(0, Math.sin(x * fq * 2.3 + ph)) * amp * 0.4); s.fillStyle = col; s.fillRect(x, h, 1, HUD_Y - h); s.fillStyle = top; s.fillRect(x, h, 1, 1); } };
    ridge(50, 16, 0.03, 0.6, '#3a4a78', '#56689a');
    ridge(58, 9, 0.055, 2.1, '#2e4060', '#46607e');
    for (let i = 0; i < 34; i++) {   // pine line
      const x = Math.floor(i * 7.7 + hash(i, 5, 7) * 5), hgt = 14 + Math.floor(hash(i, 6, 7) * 12), base = 70;
      for (let r = 0; r < hgt; r++) { const hw = Math.floor((r / hgt) * 5) + 1; s.fillStyle = r % 4 === 0 ? '#1e3a34' : '#244a3e'; s.fillRect(x - hw, base - hgt + r, hw * 2 + 1, 1); }
      s.fillStyle = '#16282a'; s.fillRect(x, base - 2, 1, 3);
    }
    const greens = ['#3a7a3a', '#448a40', '#4e9a46', '#5aa84e'];
    const fore = ['#2c6236', '#336c3a', '#3a783e', '#428442'];   // the meadow runs on under the HUD band (darker, nearer), so no black shows while a window opens
    for (let y = 68; y < H; y++) for (let x = 0; x < W; x++) {
      const n = Math.sin(x * 0.05 + y * 0.18) + Math.sin(x * 0.017 - y * 0.06) * 0.9 + (hash(x >> 1, y >> 1, 9) - 0.5) * 0.5, k = Math.min(1, (y - 68) / 84);
      const edge = y - HUD_Y + Math.round(Math.sin(x * 0.11) * 2 + Math.sin(x * 0.31) * 1.2);
      s.fillStyle = (edge >= 0 ? fore : greens)[Math.max(0, Math.min(3, Math.floor(1.6 + n * 0.9 + k)))]; if (edge === 0 || edge === -1) s.fillStyle = edge ? '#2e6a32' : '#245030'; s.fillRect(x, y, 1, 1);
    }
    for (let x = 0; x < W; x++) {   // the road
      const mid = Math.round(112 + Math.sin(x * 0.025) * 5);
      s.fillStyle = '#b89a62'; s.fillRect(x, mid - 9, 1, 19); s.fillStyle = '#d4b47a'; s.fillRect(x, mid - 9, 1, 1); s.fillStyle = '#8e7448'; s.fillRect(x, mid + 9, 1, 1);
      if (hash(x, 3, 11) < 0.2) { s.fillStyle = '#9a7e50'; s.fillRect(x, mid - 6 + Math.floor(hash(x, 4, 11) * 12), 2, 1); }
    }
    for (let i = 0; i < 46; i++) {   // flowers and tufts
      const x = Math.floor(hash(i, 1, 13) * W), y = 72 + Math.floor(hash(i, 2, 13) * 78), t = hash(i, 3, 13);
      if (Math.abs(y - (112 + Math.sin(x * 0.025) * 5)) < 12) continue;
      if (t < 0.5) { s.fillStyle = '#2e6a32'; s.fillRect(x, y, 1, 2); s.fillRect(x + 2, y, 1, 2); s.fillStyle = '#7cc45e'; s.fillRect(x + 1, y - 1, 1, 3); }
      else { s.fillStyle = ['#ffe070', '#f0f0ff', '#ff8aa0', '#b8a0ff'][i % 4]; s.fillRect(x, y, 1, 1); s.fillStyle = '#2e6a32'; s.fillRect(x, y + 1, 1, 1); }
    }
    const PXS = window.GameDNA_PixelScene;
    if (PXS) {   // standing scenery from the shared pixel scene kit: trees along the back of the meadow, boulders, bushes, a foreground row under the HUD
      [['tree', 12, 92, 0], ['smalltree', 34, 84, 1], ['tree', 246, 90, 2], ['smalltree', 150, 82, 2], ['pine', 172, 86, 0], ['boulder', 132, 92, 0], ['rock', 24, 142, 1], ['bush', 150, 142, 0], ['rock', 240, 148, 0], ['bush', 232, 84, 1], ['stump', 84, 146, 0],
        ['bush', 14, 176, 0], ['boulder', 44, 190, 1], ['bush', 96, 204, 1], ['rock', 126, 180, 0], ['smalltree', 168, 214, 0], ['bush', 204, 186, 0], ['boulder', 236, 206, 0], ['flowers', 70, 172, 1], ['flowers', 150, 196, 2], ['flowers', 216, 168, 3], ['log', 76, 214, 0]].forEach(([k, x, y, v]) => {
        const p = PXS.prop(k, { v });
        if (p.sh) { s.fillStyle = 'rgba(16,30,24,0.35)'; s.fillRect(x - p.sh[0], y - 1, p.sh[0] * 2, 2); s.fillRect(x - p.sh[0] + 2, y + 1, p.sh[0] * 2 - 4, 1); s.fillRect(x - p.sh[0] + 2, y - 2, p.sh[0] * 2 - 4, 1); }
        PXS.drawProp(s, k, x, y, { v });
      });
    } else [[22, 84], [150, 136], [236, 80], [128, 78]].forEach(([x, y]) => { s.fillStyle = '#4a4a56'; s.fillRect(x, y, 7, 4); s.fillStyle = '#7a7a8a'; s.fillRect(x + 1, y, 5, 2); s.fillStyle = '#9a9aac'; s.fillRect(x + 1, y, 2, 1); });
    return c;
  })();

  /* ---------- the battle's own menu state (the "host") ---------- */
  const CMD = [{ label: 'Fight' }, { label: 'Magic' }, { label: 'Item' }, { label: 'Defend' }, { label: 'Run', disabled: true }];
  const SPELLS = [{ label: 'Cinder', note: '4', aim: 'foe' }, { label: 'Frost', note: '6', aim: 'foe' }, { label: 'Mend', note: '5', aim: 'hero' }, { label: 'Quake', note: '12', aim: 'foe' }];
  const ITEMS = [{ label: 'Tonic', note: 'x3', aim: 'hero' }, { label: 'Smoke Bomb', note: 'x0', aim: 'foe' }, { label: 'Mana Draught', note: 'x1', aim: 'hero' }];
  let S;
  function reset() {
    S = { mode: 'intro', t: 0, frame: 0, hero: 0, cmd: 0, sub: null, subSel: 0, tgt: 0, aim: 'foe', back: 'cmd', act: null, fx: null, script: S ? S.script : true };
    heroes.forEach(h => { h.flash = 0; }); foes.forEach(f => { f.flash = 0; });
  }
  const hero = () => heroes[S.hero];
  const subList = () => (S.sub === 'magic' ? SPELLS.map(s => Object.assign({}, s, { disabled: +s.note > hero().mp })) : ITEMS.map(i => Object.assign({}, i, { disabled: i.note === 'x0' })));
  const pool = () => S.aim === 'foe' ? foes : heroes;
  function press(k) {
    const m = S.mode, wrap = (i, n, d) => (i + d + n) % n;
    if (m === 'intro') { if (k === 'ok' && S.t > 12) go('cmd'); return; }
    if (m === 'cmd') {
      if (k === 'up' || k === 'down') S.cmd = wrap(S.cmd, CMD.length, k === 'up' ? -1 : 1);
      if (k === 'ok') {
        const c = CMD[S.cmd];
        if (c.disabled) return;
        if (c.label === 'Fight') { S.aim = 'foe'; S.tgt = 0; S.back = 'cmd'; S.pick = 'Fight'; go('target'); }
        if (c.label === 'Magic' || c.label === 'Item') { S.sub = c.label === 'Magic' ? 'magic' : 'item'; S.subSel = 0; go('sub'); }
        if (c.label === 'Defend') startAct('Defend', null);
      }
      return;
    }
    if (m === 'sub') {
      const L = subList();
      if (k === 'up' || k === 'down') S.subSel = wrap(S.subSel, L.length, k === 'up' ? -1 : 1);
      if (k === 'back') go('cmd');
      if (k === 'ok' && !L[S.subSel].disabled) { S.aim = L[S.subSel].aim; S.tgt = S.aim === 'hero' ? S.hero : 0; S.back = 'sub'; S.pick = L[S.subSel].label; go('target'); }
      return;
    }
    if (m === 'target') {
      if (k === 'up' || k === 'left' || k === 'down' || k === 'right') S.tgt = wrap(S.tgt, pool().length, k === 'up' || k === 'left' ? -1 : 1);
      if (k === 'back') go(S.back);
      if (k === 'ok') startAct(S.pick, pool()[S.tgt]);
    }
    if (m === 'act' && k === 'ok' && S.t > 70) endAct();
  }
  function go(mode) { S.mode = mode; S.t = 0; }
  function startAct(name, target) { S.act = { name, target }; go('act'); }
  function endAct() { S.hero = (S.hero + 1) % heroes.length; S.cmd = 0; S.act = null; go('cmd'); }

  /* ---------- the scripted tour (pressing any key hands control to you) ---------- */
  const SCRIPT = [[100, 'ok'], [130, 'down'], [155, 'down'], [180, 'down'], [205, 'down'], [235, 'up'], [255, 'up'], [275, 'up'], [300, 'ok'],
    [330, 'down'], [355, 'down'], [380, 'down'], [405, 'ok'], [430, 'up'], [452, 'up'], [478, 'ok'],
    [512, 'down'], [546, 'down'], [580, 'up'], [612, 'ok'],
    [800, 'ok'], [828, 'down'], [856, 'down'], [888, 'ok']];
  const LOOP = 1060;

  /* ---------- module instance ---------- */
  let wc;
  const HUD = { x: 0, y: HUD_Y, w: W, h: H - HUD_Y };
  function unitRect(u) { const a = u.art, bob = u.hover ? Math.round(Math.sin(S.frame / 14) * 2) : 0, step = u.side === 'hero' && u === hero() && ['cmd', 'sub', 'target'].includes(S.mode) ? -8 : 0; return { x: Math.round(u.x - a.w / 2) + step, y: u.y - a.h + bob, w: a.w, h: a.h, id: u.id }; }
  function makeWC() {
    wc = GameDNA_WindowCursor.create({
      view: { x: 0, y: 0, w: W, h: H },
      skin: flat() ? 'flat-smoke' : 'pixel16',
      params: flat() && P.pointer === 'glove' && !Q.has('pointer') ? Object.assign({}, P, { pointer: undefined }) : P,   // smooth skin: its own hand unless chosen
      getObstacles: () => units().map(unitRect).concat([HUD])
    });
  }
  // sync: tell the module what the battle shows this frame (called in the fixed step, so ?t= is deterministic)
  function sync() {
    const L = subList();
    wc.menu('party', { x: 72, y: HUD_Y, w: W - 72, h: H - HUD_Y, items: heroes.map(h => ({ label: h.name, note: h.hp + '/' + h.max })), selected: null });
    const showCmd = ['cmd', 'sub', 'target'].includes(S.mode);
    if (showCmd) wc.menu('cmd', { x: 0, y: HUD_Y, w: 72, h: H - HUD_Y, items: CMD, selected: S.cmd, active: S.mode === 'cmd' }); else wc.close('cmd');
    if (S.mode === 'sub' || (S.mode === 'target' && S.back === 'sub')) wc.menu('sub', { x: 60, y: HUD_Y - 8, items: L, selected: S.subSel, title: S.sub === 'magic' ? 'Magic' : 'Items', active: S.mode === 'sub', tint: 'n' });
    else wc.close('sub');
    wc.setCursor(S.mode === 'target' ? { id: pool()[S.tgt].id } : null);
    if (S.mode === 'intro') wc.message('A pair of moss golems and a cave bat block the forest road!', { more: true }); else wc.close('message');
    if (S.mode === 'act' && S.t < 56) wc.message(S.act.name, { id: 'caption', x: 'center', y: 6, fit: true }); else wc.close('caption');
    const tg = S.act && S.act.target;
    if (S.mode === 'act' && S.t >= 62 && tg && tg.id === 'bat') wc.message('Skreee!', { id: 'taunt', near: unitRect(tg), side: 'above', fit: true }); else wc.close('taunt');
    if (S.mode === 'act' && S.t >= 62 && !(tg && tg.id === 'bat')) wc.message(tg ? tg.side === 'foe' ? 'The ' + tg.name.toLowerCase() + ' is coated in frost: its moss cracks and splits!' : tg.name + ' feels much better.' : hero().name + ' braces for the next blow.', { id: 'result', more: true }); else wc.close('result');
  }
  function step(input) {
    S.frame++; S.t++;
    if (S.script) { const f = S.frame % LOOP; if (f === 0) { reset(); } SCRIPT.forEach(([at, k]) => { if (at === f) press(k); }); }
    input.forEach(press);
    if (S.mode === 'intro' && S.t > 110 && !S.script) go('cmd');
    if (S.mode === 'act') {
      const tg = S.act.target;
      if (S.t === 20 && tg) tg.flash = 16;
      if (S.t > 170) endAct();
    }
    units().forEach(u => { if (u.flash > 0) u.flash--; });
    sync();
    wc.update(FRAME);
  }

  /* ---------- drawing ---------- */
  function drawUnit(u) {
    const r = unitRect(u), art = u.arts ? u.arts[(S.frame >> 3) & 1] : u.art, img = u.flash > 0 && (u.flash >> 1) % 2 ? art.white : art.n;
    g.fillStyle = 'rgba(16,30,16,0.45)'; g.fillRect(r.x + 3, u.y - 1 + (u.hover ? 10 : 0), r.w - 6, 2);
    g.drawImage(img, r.x + (u.flash > 0 && u.flash % 4 >= 2 ? 1 : 0), r.y);
    if (u.weapon === 'sword') { g.fillStyle = '#e8eef8'; g.fillRect(r.x + 1, r.y + 3, 1, 8); g.fillStyle = '#8a5a2a'; g.fillRect(r.x, r.y + 11, 3, 1); }
    if (u.weapon === 'staff') { g.fillStyle = '#7a4a24'; g.fillRect(r.x + 1, r.y + 2, 1, 16); g.fillStyle = '#7fe3ff'; g.fillRect(r.x, r.y, 3, 3); g.fillStyle = '#e6fbff'; g.fillRect(r.x, r.y, 1, 1); }
    if (u.weapon === 'bow') { g.fillStyle = '#9a6a3a'; for (let i = 0; i < 11; i++) g.fillRect(r.x + 1 - Math.round(Math.sin(i / 10 * Math.PI) * 2), r.y + 4 + i, 1, 1); g.fillStyle = '#e8e0c8'; g.fillRect(r.x + 2, r.y + 4, 1, 11); }
  }
  function drawFx() {
    if (S.mode !== 'act' || !S.act.target) return;
    const r = unitRect(S.act.target), t = S.t, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (S.act.name === 'Frost' || S.act.name === 'Cinder' || S.act.name === 'Quake') {
      const ice = S.act.name === 'Frost';
      for (let i = 0; i < 12; i++) {
        const k = t - 8 - i * 2; if (k < 0 || k > 30) continue;
        const x = Math.round(cx - 12 + hash(i, 1, 21) * 24), y = Math.round(cy - 26 + k * 1.4 + hash(i, 2, 21) * 6);
        g.fillStyle = ice ? (i % 3 ? '#8ae0ff' : '#ffffff') : (i % 3 ? '#ff8a3a' : '#fff0a0'); g.fillRect(x, y, 2, 2); g.fillStyle = ice ? '#d8f6ff' : '#ffd060'; g.fillRect(x, y - 2, 1, 2);
      }
      if (t > 22 && t < 40) for (let i = 0; i < 10; i++) { const a = i * 0.63 + t * 0.2, rr = (t - 22) * 1.1; g.fillStyle = ice ? '#c8f0ff' : '#ffb060'; g.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr * 0.7), 1, 1); }
    } else if (S.act.name === 'Fight') {
      if (t >= 14 && t < 28) { g.fillStyle = '#ffffff'; const k = t - 14; for (let j = -8; j <= 8; j++) if (Math.abs(j) < k) { g.fillRect(cx + j, cy + j, 1, 1); g.fillRect(cx + j + 1, cy + j, 1, 1); } }
    } else if (t > 8 && t < 50) {
      for (let i = 0; i < 8; i++) { const rise = (t * 1.1 + i * 6) % 24; g.fillStyle = i % 2 ? '#ffffff' : '#8af07a'; g.fillRect(Math.round(cx - 8 + (i * 5) % 17), Math.round(cy + 8 - rise), 1, 2); }
    }
  }
  function render() {
    const fl = flat();
    if (fl) g.setTransform(3, 0, 0, 3, 0, 0); else g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(scene, 0, 0);
    for (let i = 0; i < 4; i++) {   // drifting clouds
      const x = ((i * 83 + S.frame * (0.08 + i * 0.03)) % (W + 60)) - 40, y = 10 + i * 9;
      g.fillStyle = 'rgba(200,214,240,0.35)'; g.fillRect(Math.round(x), y, 30 - i * 4, 2); g.fillRect(Math.round(x) + 6, y - 1, 14, 1);
    }
    for (let i = 0; i < 9; i++) {   // fireflies
      const x = (i * 41 + Math.sin(S.frame / 40 + i) * 10 + S.frame * 0.15) % W, y = 76 + (i * 29) % 70 + Math.sin(S.frame / 23 + i * 2) * 4;
      if ((S.frame + i * 13) % 90 < 60) { g.fillStyle = i % 2 ? '#fff6a0' : '#d8ff90'; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
    }
    units().slice().sort((a, b) => a.y - b.y).forEach(drawUnit);
    drawFx();
    wc.draw(g);
    if (document.getElementById('showObs').checked) {
      g.lineWidth = 1;
      units().map(unitRect).concat([HUD]).forEach(r => { g.strokeStyle = 'rgba(255,80,80,0.9)'; g.setLineDash([2, 2]); g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); });
      wc.rects().forEach(r => { g.strokeStyle = 'rgba(120,255,160,0.9)'; g.setLineDash([]); g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); });
      g.setLineDash([]);
    }
    document.getElementById('clock').textContent = 't = ' + Math.round(S.frame * FRAME) + ' ms';
    document.getElementById('status').textContent = (S.script ? 'Script running: press an arrow key or Z to take over. ' : 'Your turn. ') + 'Mode: ' + S.mode;
  }

  /* ---------- skin smoke test: a token-only, non-pixel skin (proves every visual goes through the skin) ---------- */
  function flat() { return document.getElementById('flatSkin').checked; }
  if (window.GameDNA_Skin && !GameDNA_Skin.get('flat-smoke')) GameDNA_Skin.register({
    id: 'flat-smoke', name: 'Flat smoke test', pixel: false, native: { w: 256, h: 224, scale: 'fit' },
    palette: { ink: '#29304d', paper: '#f6f4ff', ui: { fill: '#fbfaff', fillTo: '#e8e6f6', edge: '#5b4bff', highlight: '#ffffff', shadow: '#29304d55' },
      team: { a: '#6f8cff', b: '#ff8574', n: '#9aa0b8' },
      overlay: { move: { fill: '#6f8cff', edge: '#3a50c0' }, attack: { fill: '#ff8574', edge: '#c04a3a' }, threat: { fill: '#b07aff', edge: '#7040c0' }, heal: { fill: '#5ad08a', edge: '#2a9a5a' } },
      fx: { hot: '#ff7a3a', cold: '#5ab8ff', heal: '#3ac070', crit: '#ffb43a' },
      text: { main: '#29304d', main2: '#29304d', shadow: '#00000000', outline: '#ffffff', dim: '#a0a4bc', dim2: '#a0a4bc', label: '#5b4bff', label2: '#5b4bff', gold: '#c06a14', gold2: '#c06a14', pointer: '#5b4bff', pointerEdge: '#ffffff' } },
    fonts: { ui: { type: 'canvas', family: 'system-ui, -apple-system, Segoe UI, sans-serif', size: 8, weight: 600 }, num: { type: 'canvas', family: 'system-ui, sans-serif', size: 10, weight: 800 } },
    shape: { radius: 3, edgeWidth: 1, padding: 4 }, shadow: { text: null, window: { dx: 0, dy: 1, blur: 3 }, sprite: { kind: 'blob', alpha: 0.3 } }
  });
  function applyCanvasMode() {
    const fl = flat(); canvas.width = fl ? W * 3 : W; canvas.height = fl ? H * 3 : H; g = canvas.getContext('2d'); fit();
  }

  /* ---------- controls ---------- */
  function fit() {
    const avail = Math.min(780, (canvas.parentElement.parentElement.clientWidth || W) - 12), k = Math.max(1, Math.floor(avail / W));
    canvas.style.width = W * k + 'px'; canvas.style.height = H * k + 'px';
  }
  addEventListener('resize', fit);
  function syncURL() { const u = new URLSearchParams(); PARAMS.forEach(p => { if (String(P[p.key]) !== String(p.default)) u.set(p.key, P[p.key]); }); history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : '')); }
  function buildParams() {
    const box = document.getElementById('params'); box.innerHTML = '';
    PARAMS.forEach(p => {
      const row = document.createElement('div'); row.className = 'row';
      if (p.type === 'range') {
        row.innerHTML = `<label><span>${p.label}</span><output>${P[p.key]}</output></label><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${P[p.key]}">`;
        const inp = row.querySelector('input'), out = row.querySelector('output');
        const paint = () => inp.style.setProperty('--fill', ((inp.value - p.min) / (p.max - p.min) * 100) + '%'); paint();
        inp.addEventListener('input', () => { P[p.key] = Number(inp.value); out.textContent = inp.value; paint(); wc.setParams(P); syncURL(); });
      } else {
        const names = { a: 'Blue', n: 'Slate', b: 'Red', glove: 'Glove', skin: 'Skin hand' };
        row.innerHTML = `<label><span>${p.label}</span></label><div class="seg" role="radiogroup">${p.options.map(o => `<button role="radio" data-v="${o}" aria-checked="${String(P[p.key]) === o}">${names[o] || o}</button>`).join('')}</div>`;
        row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { P[p.key] = b.dataset.v; row.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); wc.setParams(P); syncURL(); }));
      }
      box.appendChild(row);
    });
    const vb = document.getElementById('variants'); vb.innerHTML = '';
    VARIANTS.forEach(v => { const b = document.createElement('button'); b.textContent = v.name; b.addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); Object.assign(P, v.params); buildParams(); wc.setParams(P); syncURL(); }); vb.appendChild(b); });
  }
  let pending = [];
  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', x: 'back', X: 'back', Escape: 'back' };
  function human(k) { if (S.script) { S.script = false; if (S.mode === 'act') endAct(); } pending.push(k); }
  addEventListener('keydown', e => { const k = KEYS[e.key]; if (!k || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && e.key !== 'Escape') return; e.preventDefault(); if (!e.repeat) human(k); });
  document.querySelectorAll('.keys button').forEach(b => b.addEventListener('click', () => human(b.dataset.k)));
  canvas.addEventListener('pointerdown', e => {   // taps on menu rows use the module's itemAt()
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    const id = S.mode === 'sub' ? 'sub' : S.mode === 'cmd' ? 'cmd' : null, i = id ? wc.itemAt(id, x, y) : -1;
    if (i < 0) return; if (S.script) { S.script = false; }
    if (id === 'cmd') S.cmd = i; else S.subSel = i; pending.push('ok');
  });
  document.getElementById('replay').addEventListener('click', () => { S = null; reset(); makeWC(); });
  document.getElementById('reset').addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); buildParams(); wc.setParams(P); syncURL(); });
  document.getElementById('showObs').addEventListener('change', () => { if (FREEZE) render(); });
  document.getElementById('flatSkin').addEventListener('change', () => { applyCanvasMode(); const f = S.frame, sc = S.script; S = null; reset(); makeWC(); for (let i = 0; i < f; i++) step([]); S.script = sc; if (FREEZE) render(); });
  if (Q.get('obs') === '1') document.getElementById('showObs').checked = true;
  if (Q.get('skin') === 'flat') document.getElementById('flatSkin').checked = true;

  /* ---------- boot ---------- */
  applyCanvasMode(); buildParams(); reset(); makeWC();
  const n = Math.floor(T0 / FRAME);
  for (let i = 0; i < n; i++) step([]);
  if (FREEZE) { render(); document.documentElement.dataset.ready = '1'; }
  else {
    let last = performance.now(), acc = 0;
    const loop = now => { acc += Math.min(250, now - last); last = now; while (acc >= FRAME) { step(pending); pending = []; acc -= FRAME; } render(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  window.__wcDemo = { state: () => S, wc: () => wc };
  /* text state for critics and tools/sprites/statecheck.py. The three heroes share one side-view drawing that looks LEFT (the
     face and the weapon are on its left); drawUnit() never mirrors it, so facing is that constant. Golems and the bat are frontal. */
  window.__state = () => {
    const fx = Math.round(foes.reduce((s, f) => s + f.x, 0) / foes.length), hx = Math.round(heroes.reduce((s, h) => s + h.x, 0) / heroes.length);
    return { t: Math.round(S.frame * FRAME), actors: units().map(u => { const r = unitRect(u);
      return u.side === 'hero' ? { id: u.id, x: Math.round(r.x + r.w / 2), y: u.y, facing: 'left', target: fx } : { id: u.id, x: Math.round(r.x + r.w / 2), y: u.y, facing: null, target: hx, noFace: 'frontal art' }; }) };
  };
})();
