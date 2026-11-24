/* A-05 sword-combat demo: an arena lab driven only by GameDNA_SwordCombat (module), SCART (art) and the pixel16 skin. */
(function () {
  'use strict';
  const PARAMS = /*PARAMS*/[], VARIANTS = /*VARIANTS*/[];
  const Q = new URLSearchParams(location.search);
  const P = {}; PARAMS.forEach(p => { P[p.key] = Q.has(p.key) ? (p.type === 'range' ? Number(Q.get(p.key)) : Q.get(p.key)) : p.default; });
  const HAS_T = Q.has('t'), FREEZE = Q.get('freeze') === '1';
  let auto = Q.get('auto') === '1' || (HAS_T && Q.get('auto') !== '0');
  let waves = Q.get('waves') !== 'off';
  const SEED = Number(Q.get('seed')) || 5;

  const W = 256, H = 240, HUD = 16, WALL = 16, OY = HUD + WALL, T = 16, COLS = 16, ROWS = 13;   // HUD strip, then 16 px of extra wall face above the 13 map rows
  const cv = document.getElementById('screen'), g = cv.getContext('2d');
  const tl = document.getElementById('timeline'), tg = tl.getContext('2d');
  const SK = GameDNA_Skin.resolve('pixel16');
  const MAP = [
    'WWWWWWW..WWWWWWW',
    'WC............CW',
    'W..............W',
    'W...P......P...W',
    'W..............W',
    '...............W',
    'W..............W',
    'W..............W',
    'W...P......P...W',
    'W..............W',
    'W..............W',
    'WCC..........CCW',
    'WWWWWWWWWWWWWWWW'
  ];
  const SOLID = ch => ch === 'W' || ch === 'P' || ch === 'C';   // C: a corner with a statue, a brazier or stores
  const tileAt = (c, r) => (r < 0 || r >= ROWS || c < 0 || c >= COLS) ? 'W' : MAP[r][c];
  function solid(x, y, w, h) {
    for (const [px, py] of [[x, y], [x + w - 0.01, y], [x, y + h - 0.01], [x + w - 0.01, y + h - 0.01]]) if (SOLID(tileAt(Math.floor(px / T), Math.floor(py / T)))) return true;
    return false;
  }
  const BOUNDS = { x: T, y: T, w: (COLS - 2) * T, h: (ROWS - 2) * T };   // the floor inside the walls: enemies, shots and drops stay on it

  let hero, sc, frame, downT, waveN, kills, logLines, nextSpawn;
  const stats = { hits: 0, combos: 0, kills: 0, hurt: 0 };
  const CYCLE = ['slime', 'hound', 'boar', 'archer', 'hound', 'archer', 'boar', 'slime', 'warden'];
  const GATES = [{ x: 7 * T + 3, y: 1 * T + 2 }, { x: 8 * T - 2, y: 1 * T + 2 }, { x: 1 * T + 2, y: 5 * T + 3 }];

  function log(cls, text) {
    logLines.unshift([cls, (frame / 60).toFixed(1).padStart(5) + 's  ' + text]); logLines.length = Math.min(logLines.length, 9);
    document.getElementById('log').innerHTML = logLines.map(l => `<div class="${l[0]}">${l[1]}</div>`).join('');
  }
  function modParams() { const o = {}; PARAMS.forEach(p => { o[p.key] = p.key === 'dirs' ? Number(P.dirs) : P[p.key]; }); return o; }
  function newArena() {
    hero = { x: 7 * T + 3, y: 10 * T + 4, w: 10, h: 8, face: 'up', walk: 0, moving: false };
    frame = 0; downT = 0; waveN = 0; kills = 0; logLines = []; nextSpawn = 30;
    Object.keys(stats).forEach(k => stats[k] = 0);
    sc = GameDNA_SwordCombat.create({
      player: hero, solid, bounds: BOUNDS, seed: SEED, skin: SK, playerId: 'hero', playerSprite: { w: 12, h: 16 },
      params: modParams(),
      onHit(ev) {
        if (ev.target === 'hero') { stats.hurt += ev.amount; log('hurt', `HERO -${ev.amount} (${ev.kind} from ${ev.source})`); }
        else { stats.hits++; log('hit', `${ev.target} -${ev.amount}  swing ${ev.combo}${ev.finisher ? ' FINISHER' : ''}`); }
      },
      onDefeat(e) { stats.kills++; kills++; log('kill', `${e.id} defeated`); },
      onEvent(ev) {
        if (ev.type === 'swing' && ev.step > 1) stats.combos++;
        if (ev.type === 'telegraph') log('', `${ev.id} telegraphs a charge`);
        if (ev.type === 'parry') log('hit', 'projectile cut down');
        if (ev.type === 'pickup') log('kill', `picked up ${ev.kind}`);
      },
      onPlayerDown() { downT = 1; log('hurt', 'HERO knocked out'); }
    });
    const first = (Q.get('spawn') || '').split(',').filter(Boolean);
    first.forEach((look, i) => spawnLook(look, i));
  }
  function spawnLook(look, i) {
    if (look === 'warden' && sc.enemies().some(e => e.look === 'warden')) return;
    const gte = look === 'warden' ? { x: 7 * T - 4, y: 3 * T + 4 } : GATES[(i == null ? waveN : i) % GATES.length];
    waveN++;
    sc.spawn({ id: look + '-' + waveN, look, x: gte.x, y: gte.y });
  }

  // ---------------------------------------------------------------- input (edge-latched: a 0 ms tap still swings)
  const held = new Set(); let latched = false;
  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (KEYS[e.code]) { held.add(KEYS[e.code]); e.preventDefault(); if (auto) setAuto(false); return; }
    if (e.code === 'KeyZ' || e.code === 'Space' || e.code === 'KeyJ') { if (!e.repeat) latched = true; e.preventDefault(); if (auto) setAuto(false); return; }
    if (e.code === 'KeyH') { P.overlay = P.overlay === 'on' ? 'off' : 'on'; buildParams(); applyParams(); }
    if (e.code === 'KeyP') setAuto(!auto);
    if (e.code === 'KeyC') sc.clear();
    const n = '12345'.indexOf(e.key); if (n >= 0) spawnLook(['slime', 'hound', 'boar', 'archer', 'warden'][n]);
  });
  addEventListener('keyup', e => { if (KEYS[e.code]) held.delete(KEYS[e.code]); });
  addEventListener('blur', () => held.clear());

  // ---------------------------------------------------------------- step
  const TRACK = new Map();   // __state() only: last x and x speed per actor (never read by the game)
  function track() { [hero].concat(sc.all()).forEach(o => { const k = o === hero ? 'hero' : o.id, p = TRACK.get(k); TRACK.set(k, { x: o.x, vx: p ? o.x - p.x : 0 }); }); }
  function step() { stepGame(); track(); }
  function stepGame() {
    frame++;
    if (downT) { if (++downT > 100) { downT = 0; sc.revive(); hero.x = 7 * T + 3; hero.y = 10 * T + 4; } }
    if (waves && !downT && --nextSpawn <= 0) { nextSpawn = 110; if (sc.count() < 3) spawnLook(CYCLE[waveN % CYCLE.length]); }
    let inp;
    if (auto) inp = sc.autopilot({ next: { x: 8 * T, y: 9 * T }, speed: 1.25, engage: 400 });
    else inp = { x: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0), y: (held.has('down') ? 1 : 0) - (held.has('up') ? 1 : 0), attack: latched };
    latched = false;
    if (sc.update(inp) === false) return;          // the module's built-in hit-stop: the whole world holds
    hero.moving = false;
    if (sc.canMove() && (inp.x || inp.y)) {
      const sp = inp.x && inp.y ? 0.9 : 1.25;
      if (inp.x && !solid(hero.x + inp.x * sp, hero.y, hero.w, hero.h)) hero.x += inp.x * sp;
      if (inp.y && !solid(hero.x, hero.y + inp.y * sp, hero.w, hero.h)) hero.y += inp.y * sp;
      hero.face = inp.x && (!inp.y || hero.face === 'left' || hero.face === 'right') ? (inp.x > 0 ? 'right' : 'left') : (inp.y > 0 ? 'down' : 'up');
      hero.moving = true; hero.walk++;
    }
    if (sc.swinging()) hero.face = sc.pose().face;
  }

  // ---------------------------------------------------------------- the room (demo only): baked stone hall, kit props, torch light
  // Drawn with SCART floor tiles and GameDNA_PixelScene props. Nothing here feeds the module; the collision map above is the only rule.
  const ROOM = (function () {
    const PX = GameDNA_PixelScene, BH = WALL + ROWS * T, bg = document.createElement('canvas'); bg.width = W; bg.height = BH;
    const b = bg.getContext('2d'), R = (x, y, w, h, c) => { b.fillStyle = c; b.fillRect(x, y, w, h); }, N = SCART.noise;
    const ST = ['#221e2e', '#3a3448', '#544e66', '#6e6882', '#8a849c', '#a8a2b8'];
    const fy = r => WALL + r * T;                                   // bg y of a map row
    // floor (every walkable cell, the gate cells too)
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (MAP[r][c] !== 'W') b.drawImage(SCART.tile('floor', c, r, 0), c * T, fy(r));
    // worn inlay: a darker band of slabs around the centre, with a light inner line
    R(40, fy(2) + 8, 176, 1, 'rgba(30,22,48,0.5)'); R(40, fy(10) + 7, 176, 1, 'rgba(30,22,48,0.5)'); R(40, fy(2) + 8, 1, 128, 'rgba(30,22,48,0.5)'); R(215, fy(2) + 8, 1, 128, 'rgba(30,22,48,0.5)');
    R(41, fy(2) + 9, 174, 1, 'rgba(210,200,230,0.22)'); R(41, fy(2) + 9, 1, 126, 'rgba(210,200,230,0.22)');
    // cracks, moss, grit, a drain
    for (let i = 0; i < 26; i++) {
      const x = 20 + Math.floor(N(i, 3, 61) * 214), y = fy(1) + 4 + Math.floor(N(i, 5, 67) * 166), k = N(i, 7, 71);
      if (k < 0.35) { R(x, y, 3, 1, '#5a5468'); R(x + 3, y + 1, 2, 1, '#5a5468'); R(x + 4, y + 2, 1, 2, '#5a5468'); R(x + 1, y + 1, 1, 1, '#a6a0b2'); }
      else if (k < 0.6) { R(x, y, 2, 1, '#5e8a50'); R(x + 1, y + 1, 3, 1, '#4a7440'); R(x + 3, y, 1, 1, '#7aa860'); }
      else if (k < 0.85) { R(x, y, 1, 1, '#b0aabc'); R(x + 2, y + 1, 1, 1, '#6a6478'); R(x - 1, y + 2, 1, 1, '#6a6478'); }
      else { R(x, y, 2, 2, '#a09aac'); R(x, y + 2, 2, 1, 'rgba(20,12,32,0.35)'); R(x, y, 1, 1, '#c4bed0'); }
    }
    (function drain(x, y) { R(x, y, 10, 8, '#2a2636'); R(x + 1, y + 1, 8, 6, '#0c0a14'); for (let i = 2; i < 9; i += 2) R(x + i, y + 1, 1, 6, '#6e6882'); R(x, y, 10, 1, '#544e66'); })(196, fy(9) + 4);
    // the long rug between the pillars
    PX.rug(b, 92, fy(4) + 6, 72, 68, 'red');
    R(92, fy(4) + 6 + 68, 72, 1, 'rgba(20,12,32,0.35)');
    (function medallion(cx, cy) {                                   // a woven sun in the middle of the rug
      for (let d = 0; d <= 17; d++) { const w = 17 - d; R(cx - w, cy - d, w * 2 + 1, 1, '#7a1c24'); R(cx - w, cy + d, w * 2 + 1, 1, '#7a1c24'); }
      for (let d = 0; d <= 17; d++) { const w = 17 - d; R(cx - w, cy - d, 1, 1, '#d8a030'); R(cx + w, cy - d, 1, 1, '#d8a030'); R(cx - w, cy + d, 1, 1, '#d8a030'); R(cx + w, cy + d, 1, 1, '#d8a030'); }
      for (let d = 0; d <= 11; d++) { const w = 11 - d; R(cx - w, cy - d, w * 2 + 1, 1, '#4a1420'); R(cx - w, cy + d, w * 2 + 1, 1, '#4a1420'); }
      R(cx - 3, cy - 3, 7, 7, '#d8a030'); R(cx - 2, cy - 2, 5, 5, '#ffe070'); R(cx - 1, cy - 1, 3, 3, '#fff4c0');
      [[0, -8], [0, 8], [-8, 0], [8, 0]].forEach(q => { R(cx + q[0] - 1, cy + q[1], 3, 1, '#d8a030'); R(cx + q[0], cy + q[1] - 1, 1, 3, '#d8a030'); });
      [[-5, -5], [5, -5], [-5, 5], [5, 5]].forEach(q => R(cx + q[0], cy + q[1], 1, 1, '#ffe070'));
    })(128, fy(4) + 6 + 34);
    // walls. Top wall: a 32 px brick face (cap, courses, base) with a soft shadow on the floor below it.
    function face(x0, x1) {
      for (let y = 0; y < 32; y++) for (let x = x0; x < x1; x++) {
        let col;
        if (y < 4) col = y === 3 ? '#0c0a14' : '#16101e';
        else if (y >= 29) col = y === 29 ? ST[4] : y === 31 ? ST[0] : ST[2];
        else { const row = Math.floor((y - 4) / 5), off = row % 2 ? 7 : 0, lx = (x + off) % 14, ly = (y - 4) % 5, tn = N(Math.floor((x + off) / 14), row, 83);
          col = ly === 4 || lx === 0 ? ST[0] : ly === 0 ? ST[4] : tn > 0.74 ? ST[3] : tn < 0.22 ? ST[1] : ST[2]; if (y < 7) col = ly === 4 || lx === 0 ? ST[0] : ST[1]; }
        R(x, y, 1, 1, col);
      }
      for (let i = 0; i < 4; i++) { const mx = x0 + 6 + Math.floor(N(i, x0, 89) * (x1 - x0 - 14)); R(mx, 24, 3, 2, '#4a7440'); R(mx + 1, 26, 1, 3, '#5e8a50'); R(mx + 3, 25, 2, 1, '#5e8a50'); }
      [[0.5, 3], [0.3, 3], [0.14, 3]].forEach((s, i) => R(x0, 32 + i * 3, x1 - x0, 3, 'rgba(18,10,34,' + s[0] + ')'));
    }
    face(0, 7 * T); face(9 * T, W);
    // the north gate: a recessed arch with a raised portcullis; its lower half is floor the enemies walk in on
    (function gate(x0) {
      R(x0, 0, 32, 4, '#16101e'); R(x0, 3, 32, 1, '#0c0a14');
      R(x0, 4, 32, 14, '#0c0a14');                                                    // the dark passage
      for (let y = 9; y < 18; y += 3) R(x0 + 3, y, 26, 1, '#221e2e');                  // steps fading into it
      R(x0, 18, 32, 14, 'rgba(12,8,24,0.55)'); R(x0, 18, 32, 5, 'rgba(12,8,24,0.4)');   // shade on the threshold
      for (let x = x0 + 3; x < x0 + 30; x += 5) { R(x, 4, 2, 7, '#6e6882'); R(x, 4, 1, 7, '#8a849c'); R(x, 11, 2, 2, '#544e66'); R(x, 13, 1, 1, '#3a3448'); }   // portcullis teeth
      R(x0 + 2, 6, 28, 1, '#3a3448');
      [[x0 - 3, 1], [x0 + 30, -1]].forEach(p => { R(p[0], 2, 5, 30, ST[3]); R(p[0] + (p[1] > 0 ? 0 : 4), 2, 1, 30, ST[5]); R(p[0] + (p[1] > 0 ? 4 : 0), 2, 1, 30, ST[1]); R(p[0], 2, 5, 1, ST[5]); R(p[0] - 1, 28, 7, 4, ST[2]); R(p[0] - 1, 28, 7, 1, ST[4]); R(p[0] - 1, 31, 7, 1, ST[0]); for (let y = 8; y < 28; y += 7) R(p[0], y, 5, 1, ST[1]); });
      R(x0 + 2, 2, 28, 2, ST[3]); R(x0 + 2, 2, 28, 1, ST[5]); R(x0 + 14, 1, 4, 4, ST[4]); R(x0 + 14, 1, 4, 1, ST[5]); R(x0 + 15, 2, 2, 2, '#c8963a');   // lintel and keystone
    })(7 * T);
    // side and south walls seen from above: a lit inner rim, a dark top
    function top(x, y, w, h, rim) {
      R(x, y, w, h, '#1e1a2a');
      for (let j = 0; j < h; j += 2) for (let i = 0; i < w; i += 2) { const n = N(x + i, y + j, 97); if (n > 0.8) R(x + i, y + j, 2, 2, '#262232'); else if (n < 0.12) R(x + i, y + j, 2, 1, '#16121e'); }
      if (rim === 'r') { R(x + w - 5, y, 5, h, ST[2]); R(x + w - 5, y, 1, h, ST[4]); R(x + w - 1, y, 1, h, ST[0]); for (let j = y + 3; j < y + h; j += 9) R(x + w - 4, j, 3, 1, ST[0]); }
      if (rim === 'l') { R(x, y, 5, h, ST[2]); R(x + 4, y, 1, h, ST[4]); R(x, y, 1, h, ST[0]); for (let j = y + 6; j < y + h; j += 9) R(x + 1, j, 3, 1, ST[0]); }
      if (rim === 't') { R(x, y, w, 5, ST[2]); R(x, y + 4, w, 1, ST[4]); R(x, y, w, 1, ST[0]); for (let i = x + 5; i < x + w; i += 11) R(i, y + 1, 1, 3, ST[0]); }
    }
    top(0, fy(1), T, 4 * T, 'r'); top(0, fy(6), T, 6 * T, 'r'); top(15 * T, fy(1), T, 11 * T, 'l'); top(0, fy(12), W, T, 't');
    R(0, fy(12) + 9, W, 7, '#120e1a');
    [fy(1), fy(6)].forEach(y0 => { const h = y0 === fy(1) ? 4 * T : 6 * T; [[0.4, 2], [0.2, 2]].forEach((s, i) => R(T + i * 2, y0, 2, h, 'rgba(18,10,34,' + s[0] + ')')); });
    // the west gate: floor running into the dark, jambs above and below
    (function wgate(y0) { [[0.75, 5], [0.5, 4], [0.28, 4], [0.12, 3]].reduce((x, s) => { R(x, y0, s[1], T, 'rgba(8,4,18,' + s[0] + ')'); return x + s[1]; }, 0);
      R(0, y0 - 3, T, 3, ST[3]); R(0, y0 - 3, T, 1, ST[5]); R(0, y0 + T, T, 3, ST[3]); R(0, y0 + T + 2, T, 1, ST[0]); R(0, y0 - 1, T, 1, ST[0]);
      for (let y = y0 + 2; y < y0 + T; y += 5) { R(1, y, 6, 1, 'rgba(110,104,130,0.5)'); } })(fy(5));
    // pillar: the kit column cut down to 32 px so it does not hide the fight
    const PIL = (function () { const src = PX.prop('pillar').frames[0], c = document.createElement('canvas'); c.width = src.width; c.height = 32; const x = c.getContext('2d');
      x.drawImage(src, 0, 0, src.width, 9, 0, 0, src.width, 9); x.drawImage(src, 0, 9, src.width, 14, 0, 9, src.width, 14); x.drawImage(src, 0, src.height - 9, src.width, 9, 0, 23, src.width, 9); return c; })();
    // brazier: iron bowl on three legs, 2 flame frames
    const BRZ = [0, 1].map(f => SCART.paint(12, 18, function (P) {
      P(4, 1 + f, 4, 5 - f, '#ff8a3a'); P(5, f, 2, 4, '#ffd23a'); P(3, 3, 1, 3, '#e0522a'); P(8, 2 + f, 1, 4 - f, '#e0522a'); P(5, 3, 2, 3, '#fff4c0'); P(f ? 7 : 4, 0, 1, 1, '#ffd23a');
      P(1, 6, 10, 1, '#8a849c'); P(1, 7, 10, 3, '#544e66'); P(2, 10, 8, 1, '#3a3448'); P(1, 7, 1, 3, '#6e6882'); P(3, 7, 6, 1, '#c8642a');
      P(5, 11, 2, 5, '#3a3448'); P(2, 11, 1, 6, '#3a3448'); P(9, 11, 1, 6, '#3a3448'); P(1, 17, 3, 1, '#544e66'); P(8, 17, 3, 1, '#544e66'); P(4, 16, 4, 1, '#544e66');
    }, true));
    const stand = [], torches = [[40, 22], [92, 22], [164, 22], [216, 22]], fires = [];
    function put(img, cx, footY, depth) { stand.push({ img: img, x: Math.round(cx - img.width / 2), fy: footY, y: depth == null ? footY : depth }); }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (MAP[r][c] === 'P') { put(PIL, c * T + 8, r * T + 16); R(c * T + 1, fy(r) + 13, 16, 4, 'rgba(18,10,34,0.4)'); R(c * T + 3, fy(r) + 17, 14, 2, 'rgba(18,10,34,0.22)'); }
    const pr = k => PX.prop(k).frames[0];
    put(pr('statue'), 1 * T + 8, 1 * T + 15); put(pr('statue'), 14 * T + 8, 1 * T + 15);
    [[1, 1], [14, 1]].forEach(p => { R(p[0] * T + 1, fy(p[1]) + 13, 14, 3, 'rgba(18,10,34,0.4)'); });
    fires.push([1 * T + 8, 11 * T + 2], [14 * T + 8, 11 * T + 2]);
    put(pr('crate'), 2 * T + 7, 11 * T + 15); put(pr('pot'), 2 * T + 12, 11 * T + 8, 11 * T + 7); put(pr('sack'), 2 * T + 15, 11 * T + 16);
    put(pr('barrel'), 13 * T + 9, 11 * T + 15); put(pr('pot'), 13 * T + 2, 11 * T + 16); put(pr('crate'), 13 * T + 5, 11 * T + 7, 11 * T + 6);
    [[2, 11], [13, 11], [1, 11], [14, 11]].forEach(p => R(p[0] * T, fy(p[1]) + 13, T, 3, 'rgba(18,10,34,0.3)'));
    // darkness with holes at the lights, in bands (two flicker frames)
    const LIGHTS = torches.map(t => [t[0], t[1] + 14, 62, 1]).concat(fires.map(f => [f[0], WALL + f[1] + 2, 70, 1]), [[128, WALL + 96, 104, 0.72]]);
    const DARK = [0, 1].map(fl => { const c = document.createElement('canvas'); c.width = W; c.height = BH; const x = c.getContext('2d'), id = x.createImageData(W, BH), d = id.data;
      for (let y = 0; y < BH; y++) for (let xx = 0; xx < W; xx++) { let L = 0;
        for (const l of LIGHTS) { const dx = xx - l[0], dy = (y - l[1]) * 1.25, v = l[3] * (1 - Math.sqrt(dx * dx + dy * dy) / (l[2] + (l[3] === 1 ? fl * 3 : 0))); if (v > L) L = v; }
        const a = Math.round((1 - Math.min(1, L * 1.5)) * 16) / 16 * 0.52, q = (y * W + xx) * 4; d[q] = 16; d[q + 1] = 8; d[q + 2] = 38; d[q + 3] = Math.round(a * 255); }
      x.putImageData(id, 0, 0); return c; });
    const TOR = PX.prop('torch');
    return {
      ground(gg, t, oy) {
        gg.drawImage(bg, 0, oy - WALL);
        const fl = Math.floor(t / 130);
        torches.forEach((p, i) => { gg.drawImage(TOR.frames[(fl + i) % TOR.frames.length], p[0] - TOR.ax, oy - WALL + p[1] - TOR.ay + 8); });
        [[64, 31], [192, 31]].forEach((p, i) => { const bn = PX.prop('banner', i ? { color: 'blue' } : {}); gg.drawImage(bn.frames[0], p[0] - bn.ax, oy - WALL + p[1] - bn.ay); });
      },
      props(t, oy) {
        const fl = Math.floor(t / 130) & 1, out = stand.map(s => ({ y: s.y, draw: gg => gg.drawImage(s.img, s.x, oy + s.fy - s.img.height + 1) }));
        fires.forEach((f, i) => out.push({ y: f[1] + 12, draw: gg => { const im = BRZ[(fl + i) & 1]; gg.fillStyle = 'rgba(18,10,34,0.4)'; gg.fillRect(f[0] - 6, oy + f[1] + 12, 12, 2); gg.drawImage(im, f[0] - 7, oy + f[1] - 6); } }));
        return out;
      },
      light(gg, fr, oy) {
        const fl = (fr >> 3) & 1;
        gg.drawImage(DARK[fl], 0, oy - WALL);
        gg.save(); gg.beginPath(); gg.rect(T - 5, oy - WALL + 4, W - 2 * T + 10, WALL + 12 * T - 4 + 5); gg.clip();   // light stays inside the hall
        torches.forEach((p, i) => PX.glow(gg, p[0], oy - WALL + p[1] + 2, 26, '#ffb050', 0.75 + 0.12 * ((fl + i) & 1)));
        fires.forEach((f, i) => PX.glow(gg, f[0], oy + f[1] - 2, 30, '#ffa040', 0.8 + 0.12 * ((fl + i) & 1)));
        gg.restore();
      }
    };
  })();

  // ---------------------------------------------------------------- render
  function drawHero(ox, oy) {
    const pose = sc.pose(), atk = pose.state === 'active' || pose.state === 'antic';
    const img = SCART.hero(hero.face, hero.moving ? (hero.walk >> 3) & 1 : 0, atk && pose.state === 'active');
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(Math.round(hero.x + ox), Math.round(hero.y + hero.h - 1 + oy), 10, 2);
    g.globalAlpha = sc.down() ? 0.5 : sc.playerAlpha();
    g.drawImage(img, Math.round(hero.x - 2 + ox), Math.round(hero.y - 9 + oy) + (pose.state === 'hurt' ? -1 : 0));
    g.globalAlpha = 1;
  }
  function render() {
    g.imageSmoothingEnabled = false;
    const ox = 0, oy = OY, tms = frame * 1000 / 60;
    ROOM.ground(g, tms, oy);
    sc.draw(g, ox, oy, { layer: 'below' });
    const list = sc.sprites(ox, oy); list.push({ y: hero.y + hero.h, draw: () => drawHero(ox, oy) });
    ROOM.props(tms, oy).forEach(p => list.push(p));
    list.sort((a, b) => a.y - b.y).forEach(s => s.draw(g));
    ROOM.light(g, frame, oy);
    sc.draw(g, ox, oy, { layer: 'above' });
    // HUD
    g.fillStyle = '#0c0a14'; g.fillRect(0, 0, W, HUD);
    SK.frame(g, { x: 0, y: 0, w: W, h: HUD }, { role: 'plate' });
    g.fillStyle = '#0c0a14'; g.fillRect(0, HUD - 1, W, 1);
    sc.drawHearts(g, 5, 4);
    const sw = sc.swing();
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(50, 3, 1, 9); g.fillRect(W - 78, 3, 1, 9);   // dividers between the HUD cells
    SK.text(g, 'DEFEATED', W - 72, 5, { font: 'ui', color: '#a8a0c8' });
    SK.text(g, String(kills), W - 6, 5, { font: 'ui', align: 'right', color: '#ffe070' });
    if (auto) SK.text(g, 'AUTO', 56, 5, { font: 'ui', color: '#8a80b0' });
    if (sw) {
      const lab = sw.finisher ? 'FINISHER' : 'SWING ' + sw.step, lw = sw.finisher ? 54 : 46;
      g.fillStyle = sw.finisher ? '#5a3a10' : '#143a56'; g.fillRect(128 - (lw >> 1), 2, lw, 11); g.fillStyle = sw.finisher ? '#ffd23a' : '#7ad8ff'; g.fillRect(128 - (lw >> 1), 2, lw, 1); g.fillRect(128 - (lw >> 1), 12, lw, 1);
      SK.text(g, lab, 128, 5, { font: 'ui', align: 'center', color: sw.finisher ? '#ffe9a0' : '#d8f4ff' });
    }
    if (sc.down()) {
      const r = { x: 64, y: 112, w: 128, h: 30 }; SK.frame(g, r, { role: 'banner', team: 'b' });
      SK.text(g, 'KNOCKED OUT', 128, 124, { font: 'ui', align: 'center', color: '#ffffff' });
    }
    renderTimeline();
    {
      document.getElementById('clock').textContent = 't = ' + Math.round(frame * 1000 / 60) + ' ms';
      document.getElementById('sHits').textContent = stats.hits; document.getElementById('sCombo').textContent = stats.combos;
      document.getElementById('sKills').textContent = stats.kills; document.getElementById('sHurt').textContent = stats.hurt;
      document.getElementById('status').innerHTML = `<b>${sc.count()}</b> enemies &middot; ${auto ? 'autopilot' : 'you'} &middot; ${P.dirs}-way, combo ${P.combo}`;
    }
  }
  function renderTimeline() {
    tg.imageSmoothingEnabled = false;
    tg.fillStyle = '#0e1224'; tg.fillRect(0, 0, tl.width, tl.height);
    const fd = sc.frameData(), sw = sc.swing(), x0 = 34, buf = P.buffer, maxT = Math.max(...fd.map(d => d.antic + d.active + d.recover)), unit = Math.max(2, Math.min(7, Math.floor((tl.width - x0 - 30) / maxT)));
    fd.forEach((d, i) => {
      const y = 4 + i * 18, total = d.antic + d.active + d.recover;
      SK.text(tg, d.finisher ? 'FIN' : 'HIT ' + d.step, 2, y + 3, { font: 'ui', color: sw && sw.step === d.step ? '#ffd23a' : '#929bbc' });
      let x = x0;
      const seg = (n, c) => { tg.fillStyle = c; tg.fillRect(x, y, n * unit - 1, 12); for (let k = 1; k < n; k++) { tg.fillStyle = 'rgba(0,0,0,0.25)'; tg.fillRect(x + k * unit - 1, y, 1, 12); } x += n * unit; };
      seg(d.antic, '#ffd23a'); seg(d.active, '#ff5a4a'); seg(d.recover, '#5a7ad8');
      if (d.step < fd.length) {   // buffer window and the link (cancel) point
        tg.fillStyle = 'rgba(122,216,255,0.35)'; const bs = Math.max(0, total - buf); tg.fillRect(x0 + bs * unit, y + 9, (total - bs) * unit - 1, 3);
        const lx = x0 + (d.antic + d.active + d.link) * unit - 1; tg.fillStyle = '#ffffff'; tg.fillRect(lx, y - 2, 1, 16);
      }
      SK.text(tg, total + 'F', x + 4, y + 3, { font: 'ui', color: '#5a6288' });
      if (sw && sw.step === d.step) { const px = x0 + sw.f * unit; tg.fillStyle = '#ffffff'; tg.fillRect(px, y - 2, 2, 16); tg.fillRect(px - 1, y - 3, 4, 1); }
    });
    document.getElementById('tlinfo').textContent = sw ? `swing ${sw.step} · frame ${sw.f + 1}/${sw.total} · ${sw.phase}${sw.buffered ? ' · next buffered' : ''}` : 'idle';
  }

  // ---------------------------------------------------------------- controls
  function setAuto(on) { auto = on; document.getElementById('autoBtn').style.borderColor = on ? '#ffd23a' : ''; }
  function applyParams() { sc.setParams(modParams()); syncURL(); }
  function syncURL() { if (HAS_T) return; const u = new URLSearchParams(); PARAMS.forEach(p => { if (String(P[p.key]) !== String(p.default)) u.set(p.key, P[p.key]); }); history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : '')); }
  function buildParams() {
    const box = document.getElementById('params'); box.innerHTML = '';
    PARAMS.forEach(p => {
      const row = document.createElement('div'); row.className = 'row';
      if (p.type === 'select') {
        row.innerHTML = `<label><span>${p.label}</span></label>`;
        const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'radiogroup');
        p.options.forEach(op => { const b = document.createElement('button'); b.textContent = op; b.setAttribute('aria-checked', String(String(P[p.key]) === op)); b.addEventListener('click', () => { P[p.key] = op; buildParams(); applyParams(); }); seg.appendChild(b); });
        row.appendChild(seg);
      } else {
        row.innerHTML = `<label><span>${p.label}</span><output>${P[p.key]}</output></label><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${P[p.key]}">`;
        const inp = row.querySelector('input'), out = row.querySelector('output');
        const fill = () => inp.style.setProperty('--fill', ((inp.value - p.min) / (p.max - p.min) * 100) + '%'); fill();
        inp.addEventListener('input', () => { P[p.key] = Number(inp.value); out.textContent = inp.value; fill(); applyParams(); });
      }
      box.appendChild(row);
    });
  }
  function buildUI() {
    buildParams();
    const vb = document.getElementById('variants');
    VARIANTS.forEach(v => { const b = document.createElement('button'); b.textContent = v.name; b.addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); Object.assign(P, v.params); buildParams(); applyParams(); }); vb.appendChild(b); });
    document.querySelectorAll('#spawner button').forEach(b => b.addEventListener('click', () => { if (b.dataset.spawn) spawnLook(b.dataset.spawn); else sc.clear(); }));
    document.querySelectorAll('#waves button').forEach(b => b.addEventListener('click', () => { waves = b.dataset.w === 'on'; document.querySelectorAll('#waves button').forEach(x => x.setAttribute('aria-checked', String(x === b))); }));
    document.getElementById('autoBtn').addEventListener('click', () => setAuto(!auto));
    document.getElementById('reset').addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); buildParams(); newArena(); applyParams(); });
    setAuto(auto);
  }
  function fit() {
    const avail = Math.min(cv.parentElement.parentElement.clientWidth - 12, 780), a = avail / W, s = a >= 2 ? Math.floor(a) : Math.max(1, a);   // integer from x2 up, fractional on phones
    cv.style.width = Math.floor(W * s) + 'px'; cv.style.height = Math.floor(H * s) + 'px';
    const tw = document.querySelector('.tl').clientWidth - 26;   // the timeline fills its panel
    tl.style.width = tw + 'px'; tl.style.height = Math.round(tw * tl.height / tl.width) + 'px';
  }

  // ---------------------------------------------------------------- boot
  newArena(); buildUI(); fit(); addEventListener('resize', fit);
  window.__swordDemo = () => ({ frame, kills, stats: Object.assign({}, stats), sc: sc.state(), mod: sc.stats() });
  /* text state for critics and tools/sprites/statecheck.py. The hero is a 4-way sprite: SCART.hero(hero.face) (left = mirror of the right frame);
     enemies are drawn by the module, mirrored when e.face < 0 (their art looks right). Feet in canvas px (OY added). */
  window.__state = () => {
    const live = sc.all().filter(e => !e.dying && e.hp > 0), hx = hero.x + hero.w / 2, hy = hero.y + hero.h, V = k => { const p = TRACK.get(k); return p ? Math.round(p.vx * 100) / 100 : 0; };
    const near = live.slice().sort((a, b) => Math.hypot(a.x + a.w / 2 - hx, a.y + a.h - hy) - Math.hypot(b.x + b.w / 2 - hx, b.y + b.h - hy))[0];
    const side = hero.face === 'left' || hero.face === 'right', st = sc.pose().state, swing = st === 'antic' || st === 'active';
    const actors = [{ id: 'hero', x: Math.round(hx), y: Math.round(hy + OY), facing: side ? hero.face : null, target: swing && near ? near.id : null, vx: V('hero'),
      noFace: sc.down() ? 'knocked out' : side ? undefined : hero.face + ' frame', state: st }];
    /* an enemy looks at the hero while it aims, telegraphs, chases or (warden) walks in; in any other state it faces its move direction */
    sc.all().forEach(e => actors.push({ id: e.id, x: Math.round(e.x + e.w / 2), y: Math.round(e.y + e.h + OY), facing: e.face < 0 ? 'left' : 'right',
      target: /^(aim|tele|chase)$/.test(e.state) || (e.look === 'warden' && e.state === 'walk') ? 'hero' : null, vx: Math.abs(e.kbx) > 0.01 || e.state === 'stun' ? 0 : V(e.id),   /* knockback is not a walk */
      noFace: e.dying || e.hp <= 0 ? 'defeated' : undefined, state: e.state }));
    return { t: Math.round(frame * 1000 / 60), actors };
  };
  if (HAS_T) {
    const n = Math.floor(Number(Q.get('t')) / (1000 / 60));
    for (let i = 0; i < n; i++) step();
    render();
    if (FREEZE) { window.__frozen = true; document.documentElement.dataset.frozen = '1'; return; }
  }
  let acc = 0, prev = null;
  function loop(now) {
    if (prev === null) prev = now;
    acc += Math.min(250, now - prev); prev = now;
    while (acc >= 1000 / 60) { step(); acc -= 1000 / 60; }
    render(); requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
