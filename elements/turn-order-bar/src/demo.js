'use strict';
// C-02 demo: a small original battle whose turn-order strip comes only from GameDNA_TurnOrder.
// The scene owns its turn rules (a charge-time system, or player/enemy phases) and hands the module the order each step.
(() => {
  const W = 256, H = 224, FRAME = 1000 / 60, HUD_Y = 160, TURN = 66;   // TURN = frames per action
  const PARAMS = /*PARAMS*/[];
  const VARIANTS = /*VARIANTS*/[];
  const Q = new URLSearchParams(location.search);
  const FREEZE = Q.get('freeze') === '1', T0 = Q.has('t') ? Math.max(0, Number(Q.get('t')) || 0) : 0;
  const P = {}; PARAMS.forEach(p => { P[p.key] = Q.has(p.key) ? (p.type === 'range' ? Number(Q.get(p.key)) : Q.get(p.key)) : p.default; });
  let MODE = Q.get('mode') === 'phase' ? 'phase' : 'ct';

  const canvas = document.getElementById('screen');
  let g = canvas.getContext('2d');
  const hash = (x, y, k) => { let h = Math.imul(x + 374761 * k, 668265263) ^ Math.imul(y + 9, 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

  /* ---------- pixel art (original) ---------- */
  function bake(rows, pal, extra) {
    const w = Math.max(...rows.map(r => r.length)), mk = mode => {
      const c = document.createElement('canvas'); c.width = w; c.height = rows.length; const x = c.getContext('2d');
      rows.forEach((row, y) => { for (let i = 0; i < row.length; i++) { const col = pal[row[i]]; if (!col) continue; x.fillStyle = mode === 'white' ? (row[i] === 'o' ? '#d8f4ff' : '#ffffff') : col; x.fillRect(i, y, 1, 1); } });
      if (extra) extra(x, mode);
      return c;
    };
    return { n: mk('n'), white: mk('white'), w, h: rows.length };
  }
  // heroes face left (towards the foes); weapons are part of the baked sprite so portraits show them too
  const HERO = [
    '................', '......oooo......', '.....ohhhho.....', '....ohhhhhho....', '....ohsshhho....', '....oessshho....', '....osssshho....', '.....ossso......',
    '....oobbbboo....', '...obbbllbbbo...', '..oaobbbbbbdo...', '..oaobbbbbbdo...', '..ooobbbbbddo...', '....oddddddo....', '....oppppppo....',
    '....oppoopppo...', '....oppo.oppo...', '...okkko.okkko..', '...oooo..oooo...'
  ];
  const HPAL = { o: '#141020', s: '#f0c098', e: '#141020', p: '#4a3a5a', k: '#2a1e18' };
  const ARMS = {
    sword: (x, m) => { x.fillStyle = m === 'white' ? '#fff' : '#e8eef8'; x.fillRect(1, 3, 1, 8); x.fillStyle = m === 'white' ? '#fff' : '#8a5a2a'; x.fillRect(0, 11, 3, 1); },
    staff: (x, m) => { x.fillStyle = m === 'white' ? '#fff' : '#7a4a24'; x.fillRect(1, 2, 1, 16); x.fillStyle = m === 'white' ? '#fff' : '#7fe3ff'; x.fillRect(0, 0, 3, 3); x.fillStyle = m === 'white' ? '#fff' : '#e6fbff'; x.fillRect(0, 0, 1, 1); },
    bow: (x, m) => { x.fillStyle = m === 'white' ? '#fff' : '#9a6a3a'; for (let i = 0; i < 11; i++) x.fillRect(1 - Math.round(Math.sin(i / 10 * Math.PI) * 1), 4 + i, 1, 1); x.fillStyle = m === 'white' ? '#fff' : '#e8e0c8'; x.fillRect(2, 4, 1, 11); },
    mace: (x, m) => { x.fillStyle = m === 'white' ? '#fff' : '#6a4a2a'; x.fillRect(1, 5, 1, 9); x.fillStyle = m === 'white' ? '#fff' : '#d8c070'; x.fillRect(0, 3, 3, 3); x.fillStyle = m === 'white' ? '#fff' : '#fff0b0'; x.fillRect(0, 3, 1, 1); }
  };
  const HEROES = [
    { id: 'arden', name: 'Arden', spd: 9, max: 340, pal: { h: '#a8b0c0', b: '#3a5ec8', l: '#7aa0f0', d: '#223a80', a: '#e8eef8' }, x: 196, y: 84, arm: 'sword' },
    { id: 'lyra', name: 'Lyra', spd: 7, max: 245, pal: { h: '#e0b040', b: '#b03a4a', l: '#e87a80', d: '#701e2c', a: '#f0c098' }, x: 214, y: 108, arm: 'staff' },
    { id: 'corin', name: 'Corin', spd: 12, max: 270, pal: { h: '#6a3e22', b: '#3a8a52', l: '#78c488', d: '#1e5a34', a: '#f0c098' }, x: 196, y: 132, arm: 'bow' },
    { id: 'wren', name: 'Wren', spd: 8, max: 228, pal: { h: '#f0eadc', b: '#d8d0b8', l: '#ffffff', d: '#9a9078', a: '#f0c098' }, x: 228, y: 150, arm: 'mace' }
  ];
  HEROES.forEach(h => { h.side = 'hero'; h.art = bake(HERO, Object.assign({}, HPAL, h.pal), ARMS[h.arm]); });
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
  const SLIME = [
    '.......oooo.......', '.....oowwLLoo.....', '....owwLLLLLLo....', '...owLLLLLLLLLo...', '..oLLLLLLLLLLLLo..', '..oLLeoLLLLeoLLo..',
    '.oLLLeeLLLLeeLLLo.', '.oLLLLLLLLLLLLLmo.', 'oLLLLLLmmmmLLLLmmo', 'oLLLLLLLLLLLLLmmmo', 'omLLLLLLLLLLLmmmmo', '.ommmmmmmmmmmmmmo.', '..oooooooooooooo..'
  ];
  const SPAL = { o: '#10202a', L: '#4ac8c0', w: '#e8fff8', m: '#2a8890', e: '#10202a' };
  const IMP = [
    '..o..........o..', '.oho........oho.', '.ohho.oooo.ohho.', '..ohhorrrrohho..', '...orrrrrrrro....', '...orryrrryro...', '...orrrrrrrro...', '....orrmmrro....',
    '...oorrrrrroo...', '..orroddddorro..', '.orro.dddd.orro.', '.oo..oddddo..oo.', '.....orrrro.....', '....orro.orro...', '....ooo...ooo...'
  ];
  const IPAL = { o: '#200810', h: '#f0e0c0', r: '#c8402e', y: '#ffe070', m: '#600818', d: '#7a2018' };
  const FOES = [
    { id: 'golem', name: 'Moss Golem', spd: 5, max: 520, art: bake(GOLEM, GPAL), x: 58, y: 120 },
    { id: 'slime', name: 'Pond Slime', spd: 8, max: 120, art: bake(SLIME, SPAL), x: 104, y: 96 },
    { id: 'bat', name: 'Cave Bat', spd: 13, max: 90, arts: BAT.map(r => bake(r, BPAL)), x: 70, y: 66, hover: true },
    { id: 'imp', name: 'Ember Imp', spd: 11, max: 150, art: bake(IMP, IPAL), x: 112, y: 140, late: true }
  ];
  FOES.forEach(f => { f.side = 'foe'; if (!f.art) f.art = f.arts[0]; });
  const ALL = FOES.concat(HEROES), byId = id => ALL.find(u => u.id === id);

  /* ---------- background (baked) ---------- */
  const scene = (() => {
    const c = document.createElement('canvas'); c.width = W; c.height = HUD_Y; const s = c.getContext('2d');
    const sky = ['#1a1838', '#262450', '#3a2e66', '#56387a', '#7a4a84', '#a85e7e', '#d68078', '#f0a878'];
    for (let y = 0; y < 64; y++) for (let x = 0; x < W; x++) {
      const f = y / 64 * (sky.length - 1), i = Math.floor(f), m = f - i, th = ((x & 1) * 2 + (y & 1)) / 4 + 0.125;
      s.fillStyle = sky[m > th ? Math.min(i + 1, sky.length - 1) : i]; s.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 30; i++) { const x = Math.floor(hash(i, 1, 3) * W), y = Math.floor(hash(i, 2, 3) * 26); s.fillStyle = i % 4 ? '#c8c4f0' : '#ffffff'; s.fillRect(x, y, 1, 1); }
    s.fillStyle = '#fff0c8'; for (let y = -6; y <= 6; y++) { const hw = Math.floor(Math.sqrt(36 - y * y)); s.fillRect(206 - hw, 22 + y, hw * 2, 1); }
    s.fillStyle = '#ffe0a8'; for (let y = -6; y <= 6; y++) { const hw = Math.floor(Math.sqrt(36 - y * y)); s.fillRect(209 - hw, 20 + y, Math.max(0, hw * 2 - 4), 1); }
    const ridge = (base, amp, fq, ph, col, top) => { for (let x = 0; x < W; x++) { const h = Math.round(base - Math.abs(Math.sin(x * fq + ph)) * amp - Math.max(0, Math.sin(x * fq * 2.3 + ph)) * amp * 0.4); s.fillStyle = col; s.fillRect(x, h, 1, HUD_Y - h); s.fillStyle = top; s.fillRect(x, h, 1, 1); } };
    ridge(52, 16, 0.03, 0.6, '#4a3a6a', '#6a5488');
    ridge(60, 9, 0.055, 2.1, '#38345a', '#544c78');
    // field: shared pixel scene kit (pixel-kit/pixel-scene.js), 16 x 6 tiles from y = 70, graded to the dusk sky; then the pine line over its top edge
    const PXS = window.GameDNA_PixelScene, F = PXS.scene({ seed: 23, map: [
      ',,,.........,,,,',
      ',..............,',
      'ppppp.....pppppp',
      '...ppppppppp....',
      '................',
      ',,,..........,,,'], props: [
      { k: 'boulder', x: 22, y: 34, o: { v: 0, moss: true } }, { k: 'rock', x: 150, y: 20, o: { v: 1 } }, { k: 'rock', x: 34, y: 72, o: { v: 0 } },
      { k: 'bush', x: 14, y: 84, o: { v: 0 } }, { k: 'bush', x: 140, y: 82, o: { v: 1 } }, { k: 'bush', x: 246, y: 30, o: { v: 0 } }, { k: 'bush', x: 132, y: 14, o: { v: 1 } },
      { k: 'stump', x: 84, y: 76 }, { k: 'log', x: 172, y: 30 }, { k: 'sign', x: 150, y: 44 },
      { k: 'flowers', x: 128, y: 70, o: { v: 1 } }, { k: 'flowers', x: 30, y: 16, o: { v: 2 } }, { k: 'flowers', x: 178, y: 86, o: { v: 3 } }, { k: 'flowers', x: 240, y: 62, o: { v: 0 } },
      { k: 'fence', x: 4, y: 58, o: { len: 26 } }] });
    s.drawImage(F.ground(0), 0, 70);
    F.items.slice().sort((a, b) => a.y - b.y).forEach(it => it.draw(s, 0, 0, 70));
    for (let y = 70; y < HUD_Y; y++) { const k = (y - 70) / 90; s.fillStyle = 'rgba(52,34,104,' + (0.30 - k * 0.12).toFixed(3) + ')'; s.fillRect(0, y, W, 1); }   // dusk grade, lighter towards the camera
    s.fillStyle = '#1c2a30'; s.fillRect(0, 70, W, 3); s.fillStyle = 'rgba(20,30,34,0.45)'; s.fillRect(0, 73, W, 2);   // shade under the treeline
    for (let i = 0; i < 36; i++) {
      const x = Math.floor(i * 7.4 + hash(i, 5, 7) * 5), hgt = 14 + Math.floor(hash(i, 6, 7) * 12), base = 73;
      for (let r = 0; r < hgt; r++) { const hw = Math.floor((r / hgt) * 5) + 1; s.fillStyle = r % 4 === 0 ? '#1e2e34' : '#24383e'; s.fillRect(x - hw, base - hgt + r, hw * 2 + 1, 1); if (r % 4 === 1) { s.fillStyle = '#2e4a4c'; s.fillRect(x - hw, base - hgt + r, Math.max(1, hw - 1), 1); } }
      s.fillStyle = '#141e22'; s.fillRect(x, base - 2, 1, 3);
    }
    return c;
  })();

  /* ---------- the battle's own turn rules (the "host"): the module never computes them ---------- */
  let S;
  function reset() {
    S = { frame: 0, t: 0, turn: 0, actor: null, target: null, phase: 'intro', side: 'hero', acted: {}, pops: [], script: S ? S.script : true, hasteOn: null, joined: false, log: [] };
    ALL.forEach(u => { u.hp = u.max; u.ct = Math.floor(hash(u.spd, 7, 3) * 40); u.flash = 0; u.dead = 0; u.lunge = 0; u.out = !!u.late; u.haste = false; });
    HEROES[2].hp = 96;
  }
  const alive = u => !u.out && u.hp > 0;
  const living = () => ALL.filter(alive);
  const spd = u => u.spd * (u.haste ? 2 : 1);
  // charge-time rule: every tick each living unit gains its speed; at 100 it acts. Ties: higher speed, then roster order.
  function forecast(n) {
    const ct = new Map(living().map(u => [u.id, u.ct])), out = [], waits = [];
    let ticks = 0;
    while (out.length < n && ticks < 2000) {
      const ready = living().filter(u => ct.get(u.id) >= 100).sort((a, b) => ct.get(b.id) - ct.get(a.id) || spd(b) - spd(a) || ALL.indexOf(a) - ALL.indexOf(b));
      if (ready.length) { const u = ready[0]; out.push(u.id); waits.push(ticks); ct.set(u.id, ct.get(u.id) - 100); continue; }
      living().forEach(u => ct.set(u.id, ct.get(u.id) + spd(u))); ticks++;
    }
    return { ids: out, waits };
  }
  function nextActorCT() {
    for (let guard = 0; guard < 2000; guard++) {
      const ready = living().filter(u => u.ct >= 100).sort((a, b) => b.ct - a.ct || spd(b) - spd(a) || ALL.indexOf(a) - ALL.indexOf(b));
      if (ready.length) { ready[0].ct -= 100; return ready[0]; }
      living().forEach(u => { u.ct += spd(u); });
    }
    return null;
  }
  function phaseList() { return living().filter(u => u.side === S.side && !S.acted[u.id]).sort((a, b) => spd(b) - spd(a)).map(u => u.id); }
  function nextActorPhase() {
    let l = phaseList();
    if (!l.length) { S.side = S.side === 'hero' ? 'foe' : 'hero'; S.acted = {}; l = phaseList(); }
    return byId(l[0]);
  }
  function pickTarget(a) {
    const opp = living().filter(u => u.side !== a.side);
    if (!opp.length) return null;
    if (a.id === 'wren') { const hurt = living().filter(u => u.side === 'hero' && u.hp < u.max * 0.5)[0]; if (hurt) return hurt; }
    return opp.slice().sort((x, y) => x.hp - y.hp)[S.turn % Math.min(2, opp.length)];
  }
  function beginTurn() {
    S.turn++;
    const a = MODE === 'ct' ? nextActorCT() : nextActorPhase();
    S.actor = a; S.target = a ? pickTarget(a) : null; S.t = 0; S.phase = 'act';
    if (a && a.id === 'lyra' && !S.hasteOn) { S.target = byId('corin'); S.spell = 'haste'; } else S.spell = null;
  }
  function land() {
    const a = S.actor, tg = S.target; if (!a || !tg) return;
    if (S.spell === 'haste') { tg.haste = true; S.hasteOn = tg.id; pop(tg, 'HASTE', 'status'); return; }
    if (a.id === 'wren' && tg.side === 'hero') { const v = 64; tg.hp = Math.min(tg.max, tg.hp + v); pop(tg, v, 'heal'); return; }
    let dmg = a.side === 'hero' ? 38 + (S.turn * 7) % 23 : 22 + (S.turn * 5) % 17;
    if (tg.id === 'slime' && S.turn >= 5) dmg = tg.hp;              // the slime falls on the fifth turn or later
    if (tg.id === 'bat' && S.turn >= 9) dmg = tg.hp;
    dmg = Math.min(dmg, tg.hp); tg.hp -= dmg; tg.flash = 14; pop(tg, dmg, 'damage');
    if (tg.hp <= 0) { tg.dead = 1; S.justDied = tg.id; }
  }
  function pop(u, v, kind) { S.pops.push({ u, v: String(v), kind, t: 0 }); }
  function endTurn() {
    const a = S.actor; if (a) S.acted[a.id] = 1;
    if (S.turn === 6 && !S.joined) { const imp = byId('imp'); imp.out = false; imp.ct = 60; S.joined = true; S.joinedAt = S.frame; }
    S.actor = null; S.target = null; S.phase = 'gap'; S.t = 0;
  }
  // one fixed step of the demo battle
  function battleStep() {
    S.frame++; S.t++;
    if (S.phase === 'intro' && S.t > 40) beginTurn();
    else if (S.phase === 'act') {
      const a = S.actor, k = S.t;
      a.lunge = k < 14 ? k / 14 * 12 : k < 30 ? 12 : Math.max(0, 12 * (1 - (k - 30) / 10));
      if (k === 24) land();
      if (k >= TURN - 14) { a.lunge = 0; endTurn(); }
    } else if (S.phase === 'gap' && S.t > 14) {
      if (!living().some(u => u.side === 'foe') || S.turn >= 15) { S.phase = 'won'; S.t = 0; }
      else beginTurn();
    } else if (S.phase === 'won' && S.t > 90) { reset(); }
    ALL.forEach(u => { if (u.flash > 0) u.flash--; if (u.dead && u.dead < 30) u.dead++; });
    S.pops.forEach(p => p.t++); S.pops = S.pops.filter(p => p.t < 48);   // no half-alpha tail: a faded pixel numeral reads as grey stone
  }

  /* ---------- module instance ---------- */
  let tob, hover = null;
  const HUD = { x: 0, y: HUD_Y, w: W, h: H - HUD_Y };
  function unitRect(u) {
    const a = u.art, bob = u.hover ? Math.round(Math.sin(S.frame / 14) * 2) - 4 : 0, dir = u.side === 'hero' ? -1 : 1;
    return { x: Math.round(u.x - a.w / 2 + dir * (u.lunge || 0)), y: u.y - a.h + bob, w: a.w, h: a.h, id: u.id };
  }
  function makeTOB() {
    tob = GameDNA_TurnOrder.create({
      view: { x: 0, y: 0, w: W, h: H },
      skin: flat() ? 'flat-smoke' : 'pixel16',
      params: P,
      teamOf: id => { const u = byId(id); return u ? u.side : null; },
      labelOf: id => { const u = byId(id); return u ? u.name[0] : '?'; },
      drawPortrait: GameDNA_TurnOrder.spritePortrait(id => { const u = byId(id); return u && u.art.n; }),
      getObstacles: () => living().map(unitRect).concat([HUD])
    });
  }
  // the integration: hand the module the order every step (it ignores repeats), the highlight, then its clock
  function sync() {
    if (S.phase === 'intro' && S.t < 12) { tob.setOrder([]); }
    else if (MODE === 'ct') {
      const f = forecast(10), ids = (S.actor ? [S.actor.id] : []).concat(f.ids), waits = (S.actor ? [null] : []).concat(f.waits);
      tob.setOrder(S.phase === 'won' ? [] : ids, { current: S.actor ? S.actor.id : null, waits, dead: S.justDied ? [S.justDied] : [] });
    } else {
      const ids = phaseList(); if (S.actor && ids.indexOf(S.actor.id) < 0 && !S.acted[S.actor.id]) ids.unshift(S.actor.id);
      tob.setOrder(S.phase === 'won' ? [] : ids, { current: S.actor ? S.actor.id : null, dead: S.justDied ? [S.justDied] : [] });
    }
    S.justDied = null;
    const hl = [];
    if (S.phase === 'act' && S.t < 30 && S.target) hl.push(S.target.id);
    if (hover) hl.push(hover);
    tob.highlight(hl);
  }
  function step(input) {
    input.forEach(press);
    battleStep();
    sync();
    tob.update(FRAME);
  }
  function press(k) {
    if (k === 'next' && S.phase === 'act') { S.t = Math.max(S.t, 24); }
    if (k === 'defeat') { const f = living().filter(u => u.side === 'foe' && u !== S.actor)[0]; if (f) { f.hp = 0; f.dead = 1; S.justDied = f.id; pop(f, 'KO', 'status'); } }
    if (k === 'join') { const imp = byId('imp'); if (imp.out || imp.hp <= 0) { imp.out = false; imp.hp = imp.max; imp.dead = 0; imp.ct = 60; S.joined = true; } }
    if (k === 'haste') { const h = living().filter(u => u.side === 'hero' && !u.haste)[0]; if (h) { h.haste = true; pop(h, 'HASTE', 'status'); } }
  }

  /* ---------- drawing ---------- */
  function drawUnit(u) {
    if (u.out) return;
    if (u.hp <= 0 && u.dead >= 30) return;
    const r = unitRect(u), art = u.arts ? u.arts[(S.frame >> 3) & 1] : u.art, img = u.flash > 0 && (u.flash >> 1) % 2 ? art.white : art.n;
    const pa = g.globalAlpha;
    if (u.hp <= 0) g.globalAlpha = Math.max(0, 1 - u.dead / 30);
    g.fillStyle = 'rgba(16,30,16,0.45)'; g.fillRect(r.x + 3, u.y - 1, r.w - 6, 2);
    g.drawImage(img, r.x + (u.flash > 0 && u.flash % 4 >= 2 ? 1 : 0), r.y);
    g.globalAlpha = pa;
    if (u.haste && u.hp > 0) { const k = (S.frame >> 2) % 6; g.fillStyle = '#a8f060'; for (let i = 0; i < 3; i++) g.fillRect(r.x + r.w + 1 + (i % 2), r.y + 3 + ((i * 5 + k) % 14), 1, 3); }
    const isHl = hover === u.id || (S.phase === 'act' && S.t < 30 && S.target === u);
    if (isHl && u.hp > 0) {   // field side of the highlight: a bobbing arrow above the unit
      const bx = Math.round(r.x + r.w / 2), by = r.y - 7 + ((S.frame >> 3) & 1);
      g.fillStyle = '#1a0e08'; g.fillRect(bx - 3, by - 1, 7, 1); g.fillRect(bx - 3, by, 1, 1); g.fillRect(bx + 3, by, 1, 1); g.fillRect(bx - 2, by + 1, 1, 1); g.fillRect(bx + 2, by + 1, 1, 1); g.fillRect(bx - 1, by + 2, 1, 1); g.fillRect(bx + 1, by + 2, 1, 1); g.fillRect(bx, by + 3, 1, 1);
      g.fillStyle = '#ffe070'; g.fillRect(bx - 2, by, 5, 1); g.fillRect(bx - 1, by + 1, 3, 1); g.fillRect(bx, by + 2, 1, 1); g.fillStyle = '#fff6c0'; g.fillRect(bx - 2, by, 2, 1);
    }
  }
  function drawFx() {
    if (S.phase !== 'act' || !S.target) return;
    const r = unitRect(S.target), t = S.t, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (S.spell === 'haste' || (S.actor && S.actor.id === 'wren' && S.target.side === 'hero')) {
      if (t > 10 && t < 46) for (let i = 0; i < 8; i++) { const rise = (t * 1.1 + i * 6) % 24; g.fillStyle = i % 2 ? '#ffffff' : S.spell ? '#a8f060' : '#8af07a'; g.fillRect(Math.round(cx - 8 + (i * 5) % 17), Math.round(cy + 8 - rise), 1, 2); }
      return;
    }
    if (t >= 18 && t < 32) { g.fillStyle = S.actor.side === 'foe' ? '#ff8a6a' : '#ffffff'; const k = t - 18; for (let j = -8; j <= 8; j++) if (Math.abs(j) < k) { g.fillRect(cx + j, cy + j, 1, 1); g.fillRect(cx + j + 1, cy + j, 1, 1); } }
  }
  function drawPops() {
    const SK = GameDNA_Skin.resolve(flat() ? 'flat-smoke' : 'pixel16');
    S.pops.forEach(p => {
      const r = unitRect(p.u), rise = p.t < 8 ? -Math.round(Math.sin(p.t / 8 * Math.PI) * 6) : 0, a = 1;
      try { SK.number(g, p.v, Math.round(r.x + r.w / 2), r.y - 3 + rise, { kind: p.kind, align: 'center', baseline: 'bottom', alpha: a }); } catch (e) { /* skin smoke test may lack numerals */ }
    });
  }
  function drawHud() {
    const SK = GameDNA_Skin.resolve(flat() ? 'flat-smoke' : 'pixel16');
    SK.frame(g, { x: 0, y: HUD_Y, w: W, h: H - HUD_Y }, { role: 'window', team: 'a' });
    HEROES.forEach((h, i) => {
      const x = 8 + (i % 2) * 124, y = HUD_Y + 8 + Math.floor(i / 2) * 26, act = S.actor === h;
      SK.text(g, h.name, x, y, { font: 'ui', color: h.hp <= 0 ? '#ff8a8a' : act ? '#fff4c0' : '#ffffff', color2: act ? '#e8c870' : undefined });
      SK.text(g, h.hp + '/' + h.max, x + 112, y, { font: 'ui', align: 'right', color: h.hp < h.max / 4 ? '#ffb04a' : '#ffffff' });
      SK.bar(g, { x, y: y + 10, w: 112, h: 4 }, h.hp / h.max, h.hp < h.max / 4 ? 'hpLow' : 'hp', { style: 'meter' });
    });
  }
  function render() {
    const fl = flat();
    if (fl) g.setTransform(3, 0, 0, 3, 0, 0); else g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(scene, 0, 0);
    for (let i = 0; i < 9; i++) {
      const x = (i * 41 + Math.sin(S.frame / 40 + i) * 10 + S.frame * 0.15) % W, y = 80 + (i * 29) % 70 + Math.sin(S.frame / 23 + i * 2) * 4;
      if ((S.frame + i * 13) % 90 < 60) { g.fillStyle = i % 2 ? '#fff6a0' : '#d8ff90'; g.fillRect(Math.round(x), Math.round(y), 1, 1); }
    }
    ALL.slice().sort((a, b) => a.y - b.y).forEach(drawUnit);
    drawFx();
    drawPops();
    drawHud();
    tob.draw(g);
    if (document.getElementById('showObs').checked) {
      g.lineWidth = 1 / (fl ? 3 : 1); g.setLineDash([2, 2]);
      living().map(unitRect).forEach(r => { g.strokeStyle = 'rgba(255,200,80,0.9)'; g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); });
      g.strokeStyle = 'rgba(255,80,80,0.95)'; g.strokeRect(HUD.x + 0.5, HUD.y + 0.5, HUD.w - 1, HUD.h - 1);
      g.setLineDash([]); tob.rects().forEach(r => { g.strokeStyle = 'rgba(120,255,160,0.95)'; g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); });
    }
    document.getElementById('clock').textContent = 't = ' + Math.round(S.frame * FRAME) + ' ms';
    document.getElementById('status').textContent = (MODE === 'ct' ? 'Charge time: numbers = ticks until each turn. ' : (S.side === 'hero' ? 'Player phase' : 'Enemy phase') + ': units that have not acted. ') + (S.actor ? S.actor.name + ' acts.' : '');
  }

  /* ---------- skin smoke test: a token-only, non-pixel skin (proves every visual goes through the skin) ---------- */
  function flat() { return document.getElementById('flatSkin').checked; }
  if (window.GameDNA_Skin && !GameDNA_Skin.get('flat-smoke')) GameDNA_Skin.register({
    id: 'flat-smoke', name: 'Flat smoke test', pixel: false, native: { w: 256, h: 224, scale: 'fit' },
    palette: { ink: '#29304d', paper: '#f6f4ff', ui: { fill: '#fbfaff', fillTo: '#e8e6f6', edge: '#5b4bff', highlight: '#ffffff', shadow: '#29304d55' },
      team: { a: '#6f8cff', b: '#ff8574', n: '#9aa0b8' },
      overlay: { move: { fill: '#6f8cff', edge: '#3a50c0' }, attack: { fill: '#ff8574', edge: '#c04a3a' }, threat: { fill: '#b07aff', edge: '#7040c0' }, heal: { fill: '#5ad08a', edge: '#2a9a5a' } },
      fx: { hot: '#ff7a3a', cold: '#5ab8ff', heal: '#3ac070', crit: '#ffb43a' },
      text: { main: '#29304d', main2: '#29304d', shadow: '#00000000', outline: '#ffffff', dim: '#a0a4bc', dim2: '#a0a4bc', label: '#5b4bff', label2: '#5b4bff', gold: '#c06a14', gold2: '#c06a14' } },
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
  function syncURL() { const u = new URLSearchParams(); PARAMS.forEach(p => { if (String(P[p.key]) !== String(p.default)) u.set(p.key, P[p.key]); }); if (MODE !== 'ct') u.set('mode', MODE); history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : '')); }
  const NAMES = { top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right', start: 'Start', center: 'Centre', end: 'End', auto: 'Auto', off: 'Off', on: 'On', none: 'None', token: 'Token', TURN: 'TURN', NEXT: 'NEXT' };
  function buildParams() {
    const box = document.getElementById('params'); box.innerHTML = '';
    const mode = document.createElement('div'); mode.className = 'row';
    mode.innerHTML = '<label><span>Turn system (demo host)</span></label><div class="seg" role="radiogroup"><button role="radio" data-v="ct">Charge time</button><button role="radio" data-v="phase">Phases</button></div>';
    mode.querySelectorAll('button').forEach(b => { b.setAttribute('aria-checked', b.dataset.v === MODE); b.addEventListener('click', () => { MODE = b.dataset.v; mode.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); restart(); syncURL(); }); });
    box.appendChild(mode);
    PARAMS.forEach(p => {
      const row = document.createElement('div'); row.className = 'row';
      if (p.type === 'range') {
        row.innerHTML = `<label><span>${p.label}</span><output>${P[p.key]}</output></label><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${P[p.key]}">`;
        const inp = row.querySelector('input'), out = row.querySelector('output');
        const paint = () => inp.style.setProperty('--fill', ((inp.value - p.min) / (p.max - p.min) * 100) + '%'); paint();
        inp.addEventListener('input', () => { P[p.key] = Number(inp.value); out.textContent = inp.value; paint(); tob.setParams(P); syncURL(); if (FREEZE) render(); });
      } else {
        row.innerHTML = `<label><span>${p.label}</span></label><div class="seg" role="radiogroup">${p.options.map(o => `<button role="radio" data-v="${o}" aria-checked="${String(P[p.key]) === o}">${NAMES[o] || o}</button>`).join('')}</div>`;
        row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { P[p.key] = b.dataset.v; row.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); tob.setParams(P); syncURL(); if (FREEZE) render(); }));
      }
      box.appendChild(row);
    });
    const vb = document.getElementById('variants'); vb.innerHTML = '';
    VARIANTS.forEach(v => { const b = document.createElement('button'); b.textContent = v.name; b.addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); Object.assign(P, v.params); buildParams(); tob.setParams(P); syncURL(); }); vb.appendChild(b); });
  }
  let pending = [];
  const KEYS = { n: 'next', N: 'next', z: 'next', Z: 'next', d: 'defeat', D: 'defeat', j: 'join', J: 'join', h: 'haste', H: 'haste' };
  addEventListener('keydown', e => { const k = KEYS[e.key]; if (!k || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return; e.preventDefault(); if (!e.repeat) pending.push(k); });
  document.querySelectorAll('.keys button').forEach(b => b.addEventListener('click', () => pending.push(b.dataset.k)));
  function toNative(e) { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; }
  canvas.addEventListener('pointermove', e => {   // hover: a slot highlights its unit on the field, a unit highlights its slots
    const [x, y] = toNative(e), id = tob.slotAt(x, y);
    hover = id != null ? id : (living().map(unitRect).find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) || {}).id || null;
    canvas.style.cursor = hover ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', () => { hover = null; });
  function restart() { reset(); tob.clear(); }
  document.getElementById('replay').addEventListener('click', restart);
  document.getElementById('reset').addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); buildParams(); tob.setParams(P); syncURL(); });
  document.getElementById('showObs').addEventListener('change', () => { if (FREEZE) render(); });
  document.getElementById('flatSkin').addEventListener('change', () => { applyCanvasMode(); const f = S.frame; reset(); makeTOB(); for (let i = 0; i < f; i++) step([]); if (FREEZE) render(); });
  if (Q.get('obs') === '1') document.getElementById('showObs').checked = true;
  if (Q.get('skin') === 'flat') document.getElementById('flatSkin').checked = true;
  if (Q.has('hover')) hover = Q.get('hover');

  /* ---------- boot ---------- */
  applyCanvasMode(); reset(); makeTOB(); buildParams();
  const n = Math.floor(T0 / FRAME);
  for (let i = 0; i < n; i++) step([]);
  if (FREEZE) { render(); document.documentElement.dataset.ready = '1'; }
  else {
    let last = performance.now(), acc = 0;
    const loop = now => { acc += Math.min(250, now - last); last = now; while (acc >= FRAME) { step(pending); pending = []; acc -= FRAME; } render(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  /* text state for critics and tools/sprites/statecheck.py. drawUnit() blits every sprite unmirrored: the hero art is
     baked looking LEFT (eye and weapon on the left of the sprite; unitRect() lunges heroes left with dir = -1), and the
     four foes are symmetric front views (no side). target = who the acting unit hits, else the mean x of the other side. */
  const ART_FACING = { hero: 'left', foe: null };
  window.__state = () => ({ t: Math.round(S.frame * FRAME), actors: ALL.map(u => {
    const r = unitRect(u), foes = living().filter(v => v.side !== u.side), tg = S.actor === u && S.target && S.target.side !== u.side ? S.target.id : null;
    const o = { id: u.id, x: Math.round(r.x + r.w / 2), y: u.y, facing: ART_FACING[u.side], target: tg || (foes.length ? Math.round(foes.reduce((n, v) => n + v.x, 0) / foes.length) : null) };
    if (u.lunge) o.vx = (u.side === 'hero' ? -1 : 1) * u.lunge;
    if (u.out) o.noFace = 'not on the field yet'; else if (u.hp <= 0) o.noFace = 'dead'; else if (!o.facing) o.noFace = 'frontal art';
    return o; }) });
  window.__tobDemo = { state: () => S, tob: () => tob };
})();
