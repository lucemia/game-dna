'use strict';
// A-03 demo: a small original skirmish map whose attack previews all come from GameDNA_CombatForecast.
// The scene plays the host: it owns the units, the rules (its own weapon triangle) and the target picker, computes the
// numbers and hands them to the module. The module never computes anything.
(() => {
  const W = 256, H = 224, FRAME = 1000 / 60, TS = 16, COLS = 16, ROWS = 12, HUD_Y = 192;
  const PARAMS = /*PARAMS*/[];
  const VARIANTS = /*VARIANTS*/[];
  const Q = new URLSearchParams(location.search);
  const FREEZE = Q.get('freeze') === '1', T0 = Q.has('t') ? Math.max(0, Number(Q.get('t')) || 0) : 0;
  const P = {}; PARAMS.forEach(p => { P[p.key] = Q.has(p.key) ? (p.type === 'range' ? Number(Q.get(p.key)) : Q.get(p.key)) : p.default; });

  const canvas = document.getElementById('screen');
  let g = canvas.getContext('2d');
  const hash = (x, y, k) => { let h = Math.imul(x + 374761 * k, 668265263) ^ Math.imul(y + 9, 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const cvs = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  /* ---------- map (original) ---------- */
  const MAP = [
    'ffff....hh...fff',
    'ff.......hh...ff',
    'f....rrrr.......',
    '....rr..rr...ff.',
    '...rr....r..ffff',
    '..rr.....rr..fff',
    'wwr.......r.....',
    'wwwr......rr..hh',
    '.wwrr......r..hh',
    '..wwr.......r...',
    'f..wr...ff..r...',
    'ff.wwr.ffff..r..'
  ];
  const TER = { '.': { name: 'Plain', def: 0, avo: 0 }, f: { name: 'Wood', def: 1, avo: 20 }, h: { name: 'Hill', def: 2, avo: 10 }, w: { name: 'Water', def: 0, avo: 0 }, r: { name: 'Road', def: 0, avo: 0 } };
  const at = (x, y) => (MAP[y] || '')[x] || '.';
  const ground = (() => {
    const c = cvs(COLS * TS, ROWS * TS), s = c.getContext('2d'), px = (x, y, col) => { s.fillStyle = col; s.fillRect(x, y, 1, 1); };
    const greens = ['#3c7a36', '#468a3c', '#509844', '#5ca84c'];
    for (let y = 0; y < ROWS * TS; y++) for (let x = 0; x < COLS * TS; x++) {
      const n = Math.sin(x * 0.07 + y * 0.13) + Math.sin(x * 0.021 - y * 0.05) * 0.8 + (hash(x, y, 3) - 0.5) * 0.7;
      px(x, y, greens[Math.max(0, Math.min(3, Math.floor(1.7 + n * 0.8)))]);
    }
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const k = at(tx, ty), X = tx * TS, Y = ty * TS;
      if (k === 'w') {
        for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const v = Math.sin((X + x) * 0.3 + (Y + y) * 0.55); px(X + x, Y + y, v > 0.82 ? '#9ad0e8' : v > 0.2 ? '#3a78c0' : '#2e64a8'); }
        [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => { if (at(tx + dx, ty + dy) === 'w' || tx + dx < 0 || ty + dy < 0 || tx + dx >= COLS || ty + dy >= ROWS) return; s.fillStyle = '#d8c690'; if (dx) s.fillRect(dx > 0 ? X + TS - 2 : X, Y, 2, TS); else s.fillRect(X, dy > 0 ? Y + TS - 2 : Y, TS, 2); s.fillStyle = '#a89660'; if (dx) s.fillRect(dx > 0 ? X + TS - 3 : X + 2, Y, 1, TS); else s.fillRect(X, dy > 0 ? Y + TS - 3 : Y + 2, TS, 1); });
      }
      if (k === 'r') {
        for (let y = 1; y < TS - 1; y++) for (let x = 1; x < TS - 1; x++) px(X + x, Y + y, hash(X + x, Y + y, 7) < 0.12 ? '#9a7e50' : hash(X + x, Y + y, 8) < 0.5 ? '#c4a46c' : '#b8985e');
        s.fillStyle = '#d8bc84'; s.fillRect(X + 1, Y + 1, TS - 2, 1);
      }
      if (k === 'h') {
        for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const d = Math.hypot(x - 8, (y - 10) * 1.4); if (d < 8) px(X + x, Y + y, d < 3 ? '#a8a070' : x - y > 0 ? '#6e6a44' : '#8c865a'); }
        s.fillStyle = '#c8c090'; s.fillRect(X + 6, Y + 4, 4, 1);
      }
      if (k === 'f') {
        [[4, 9], [11, 7], [8, 13]].forEach(([cx, cy], i) => {
          s.fillStyle = '#3a2a1c'; s.fillRect(X + cx, Y + cy + 2, 1, 3);
          for (let y = -5; y <= 2; y++) for (let x = -4; x <= 4; x++) if (x * x / 16 + (y + 1) * (y + 1) / 14 < 1) px(X + cx + x, Y + cy + y, (x + y < -3) ? '#5ab04a' : (x - y > 3) ? '#1e5a2a' : '#2e7a34');
          px(X + cx - 2, Y + cy - 4, '#8ad070');
        });
      }
      if (k === '.' && hash(tx, ty, 11) < 0.35) { const fx = X + 3 + Math.floor(hash(tx, ty, 12) * 9), fy = Y + 3 + Math.floor(hash(tx, ty, 13) * 9); s.fillStyle = '#2e6a2a'; s.fillRect(fx, fy + 1, 1, 2); s.fillStyle = ['#ffe070', '#f0f0ff', '#ff9ab0'][(tx + ty) % 3]; s.fillRect(fx, fy, 1, 1); }
    }
    return c;
  })();

  // pixel skin: ground and scenery from the shared pixel scene kit (pixel-kit/pixel-scene.js); the logic grid above is unchanged
  // (Wood -> lush ground + trees, Hill -> mound, Road -> dirt path, Water -> river with banks). The flat skin keeps `ground`.
  const PXS = window.GameDNA_PixelScene, KITCH = { '.': '.', f: ',', h: 'h', w: 'w', r: 'p' };
  const SCENE = (() => {
    const props = [];
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) if (at(tx, ty) === 'f') {
      if (hash(tx, ty, 3) < 0.5) { props.push({ k: 'smalltree', x: tx * TS + 5, y: ty * TS + 13, o: { v: Math.floor(hash(tx, ty, 5) * 3) } }); props.push({ k: 'bush', x: tx * TS + 12, y: ty * TS + 16, o: { v: Math.floor(hash(tx, ty, 6) * 2) } }); }
      else props.push({ k: 'smalltree', x: tx * TS + 8 + Math.round((hash(tx, ty, 7) - 0.5) * 3), y: ty * TS + 16, o: { v: Math.floor(hash(tx, ty, 9) * 3) } });
    }
    // dressing on plain cells (no rule reads it)
    props.push({ k: 'rock', x: 8 * TS + 8, y: 4 * TS + 12, o: { v: 0 } }, { k: 'rock', x: 14 * TS + 6, y: 10 * TS + 11, o: { v: 1 } }, { k: 'flowers', x: 6 * TS + 8, y: 9 * TS + 12, o: { v: 2 } }, { k: 'flowers', x: 12 * TS + 8, y: 1 * TS + 12, o: { v: 1 } }, { k: 'flowers', x: 14 * TS + 8, y: 6 * TS + 10, o: { v: 3 } }, { k: 'sign', x: 5 * TS + 8, y: 7 * TS + 13 }, { k: 'stump', x: 1 * TS + 8, y: 3 * TS + 12 });
    const sc = PXS.scene({ seed: 44, map: MAP.map(r => [...r].map(c => KITCH[c] || '.').join('')), props });
    sc.scenery = sc.items.filter(it => !it.flat).sort((a, b) => a.y - b.y);
    return sc;
  })();
  function drawGround(tMs) { SCENE.drawGround(g, tMs, 0, 0); SCENE.scenery.forEach(it => it.draw(g, tMs, 0, 0)); }

  /* ---------- units (original art) ---------- */
  const BODY = [
    '......oooo......', '.....ohhhho.....', '....ohhhhhho....', '....ohsshhho....', '....oessshho....', '....osssshho....', '.....ossso......',
    '....oobbbboo....', '...obbbllbbbo...', '..oaobbbbbbdo...', '..oaobbbbbbdo...', '..ooobbbbbddo...', '....oddddddo....', '....oppppppo....',
    '....oppoopppo...', '....oppo.oppo...', '...okkko.okkko..', '...oooo..oooo...'
  ];
  const BASE = { o: '#141020', s: '#f0c098', e: '#141020', p: '#4a3a5a', k: '#2a1e18' };
  const WEAPONS = {
    sword: { name: 'Steel Sword', kind: 'blade', mt: 6, hit: 85, crt: 5, rng: [1, 1], art: [[12, 3, 1, 8, '#e8eef8'], [13, 4, 1, 6, '#9aa4b8'], [11, 11, 4, 1, '#c89a3a'], [12, 12, 2, 2, '#6a4422']] },
    lance: { name: 'Ash Lance', kind: 'pole', mt: 7, hit: 75, crt: 0, rng: [1, 1], art: [[13, 0, 1, 16, '#8a5a30'], [12, 0, 3, 3, '#dfe6f0'], [13, 3, 1, 1, '#6a7488']] },
    axe: { name: 'Hand Axe', kind: 'axe', mt: 8, hit: 65, crt: 0, rng: [1, 1], art: [[13, 3, 1, 11, '#6a4422'], [10, 2, 3, 5, '#b8c0cc'], [10, 2, 1, 5, '#e8eef8']] },
    bow: { name: 'Yew Bow', kind: 'bow', mt: 6, hit: 85, crt: 0, rng: [2, 2], art: [[13, 2, 1, 1, '#8a5a30'], [14, 3, 1, 9, '#8a5a30'], [13, 12, 1, 1, '#8a5a30'], [12, 3, 1, 9, '#f0f0f0']] },
    staff: { name: 'Ember Tome', kind: 'tome', mt: 5, hit: 80, crt: 5, rng: [1, 2], art: [[11, 9, 4, 4, '#a8402e'], [11, 9, 4, 1, '#e8a060'], [12, 10, 2, 2, '#ffe070']] }
  };
  // the demo's own triangle: blade > axe > pole > blade (the module only shows the arrows it is given)
  const TRI = { blade: { axe: 1, pole: -1 }, axe: { pole: 1, blade: -1 }, pole: { blade: 1, axe: -1 } };
  const ROSTER = [
    { id: 'kestrel', name: 'Kestrel', team: 'a', x: 6, y: 6, hp: 24, str: 7, skl: 9, spd: 11, def: 5, weapons: ['sword', 'lance'], pal: { h: '#d8a040', b: '#3a5ec8', l: '#7aa0f0', d: '#223a80', a: '#e8eef8' } },
    { id: 'orrin', name: 'Orrin', team: 'a', x: 4, y: 8, hp: 30, str: 9, skl: 6, spd: 6, def: 8, weapons: ['lance'], pal: { h: '#8a8f98', b: '#2a7a8a', l: '#6ac0c8', d: '#1a4a54', a: '#c8d0dc' } },
    { id: 'wren', name: 'Wren', team: 'a', x: 9, y: 9, hp: 20, str: 6, skl: 10, spd: 9, def: 3, weapons: ['bow'], pal: { h: '#6a3e22', b: '#3a8a52', l: '#78c488', d: '#1e5a34', a: '#f0c098' } },
    { id: 'marauder', name: 'Marauder', team: 'b', x: 7, y: 6, hp: 26, str: 9, skl: 4, spd: 5, def: 4, weapons: ['axe'], pal: { h: '#5a2a2a', b: '#9a3a2a', l: '#d06a4a', d: '#5a1a14', a: '#c8a080' } },
    { id: 'pikeman', name: 'Pikeman', team: 'b', x: 6, y: 5, hp: 22, str: 8, skl: 6, spd: 6, def: 6, weapons: ['lance'], pal: { h: '#3a3a3a', b: '#8a3048', l: '#c86078', d: '#4a1428', a: '#a8a8b0' } },
    { id: 'hexer', name: 'Hexer', team: 'b', x: 9, y: 7, hp: 17, str: 7, skl: 7, spd: 7, def: 2, weapons: ['staff'], pal: { h: '#4a2a6a', b: '#6a3a9a', l: '#a878d8', d: '#3a1a5a', a: '#e0c8f0' } },
    { id: 'raider', name: 'Raider', team: 'b', x: 3, y: 8, hp: 21, str: 8, skl: 5, spd: 7, def: 3, weapons: ['axe'], pal: { h: '#5a3a1a', b: '#a05a2a', l: '#e0904a', d: '#5a2a10', a: '#c8a080' } },
    { id: 'scout', name: 'Scout', team: 'b', x: 11, y: 9, hp: 8, str: 6, skl: 6, spd: 9, def: 2, weapons: ['sword'], pal: { h: '#6a5a3a', b: '#8a6a2a', l: '#c8a050', d: '#4a3a14', a: '#e8dcc0' } }
  ];
  const sprite = (u, white) => {
    const c = cvs(16, 18), s = c.getContext('2d'), pal = Object.assign({}, BASE, u.pal);
    BODY.forEach((row, y) => { for (let x = 0; x < 16; x++) { const col = pal[row[x]]; if (!col) continue; s.fillStyle = white ? (row[x] === 'o' ? '#ffffff' : '#ffffff') : col; s.fillRect(x, y, 1, 1); } });
    return c;
  };
  const withWeapon = (u, wk, white) => {
    const c = cvs(16, 18), s = c.getContext('2d'); s.drawImage(u.base, 0, 0);
    // weapon rects are authored for a right-facing body (hand at column 12); BODY looks left (hand at column 3), so mirror them into that hand
    WEAPONS[wk].art.forEach(([x, y, w, h, col]) => { s.fillStyle = white ? '#ffffff' : col; s.fillRect(16 - x - w, y + 1, w, h); });
    if (white) { s.globalCompositeOperation = 'source-in'; s.fillStyle = '#ffffff'; s.fillRect(0, 0, 16, 18); }
    return c;
  };
  ROSTER.forEach(u => { u.base = sprite(u); u.art = {}; u.weapons.forEach(w => { u.art[w] = [withWeapon(u, w), withWeapon(u, w, true)]; }); });

  /* ---------- the host's state and rules ---------- */
  let S;
  function reset() {
    S = { f: 0, t: 0, units: ROSTER.map(r => Object.assign({}, r, { max: r.hp, wi: 0, flash: 0, lunge: null, fade: 0 })), pick: null, fight: null, script: S ? S.script : true, step: 0, msg: '' };
  }
  const byId = id => S.units.find(u => u.id === id);
  const alive = () => S.units.filter(u => u.hp > 0);
  const wpn = u => WEAPONS[u.weapons[u.wi]];
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const inRange = (u, t) => { const r = wpn(u).rng, d = dist(u, t); return d >= r[0] && d <= r[1]; };
  const tri = (u, t) => (TRI[wpn(u).kind] || {})[wpn(t).kind] || 0;
  // the host's forecast: every number the window shows comes from here
  function strike(u, t) {
    const w = wpn(u), tr = TER[at(t.x, t.y)], k = tri(u, t);
    return { dmg: Math.max(0, u.str + w.mt + k - t.def - tr.def), hit: Math.max(0, Math.min(100, w.hit + u.skl * 2 + k * 15 - t.spd * 2 - tr.avo)),
      crit: Math.max(0, Math.min(100, w.crt + Math.floor(u.skl / 2) - Math.floor(t.skl / 4))), hits: u.spd - t.spd >= 4 ? 2 : 1, adv: k };
  }
  function forecast(u, t) { const a = strike(u, t); a.counter = inRange(t, u) ? strike(t, u) : null; return a; }
  const rectOf = u => { const p = drawPos(u); return { x: p[0], y: p[1] - 2, w: 16, h: 18 }; };
  const desc = u => ({ id: u.id, name: u.name, team: u.team, hp: u.hp, max: u.max, rect: rectOf(u), weapon: wpn(u).name });
  const targetsOf = u => alive().filter(t => t.team !== u.team && inRange(u, t)).sort((a, b) => a.x - b.x || a.y - b.y);
  // who a unit is dealing with right now: the picker's pair, the pair exchanging blows, else nobody
  function foeOf(u) {
    if (S.fight) { const q = S.fight.seq[S.fight.i]; if (q && q[0] === u) return q[1]; if (q && q[1] === u) return q[0]; }
    if (S.pick) { const t = S.pick.list[S.pick.i]; if (S.pick.u === u) return t; if (t === u) return S.pick.u; }
    return null;
  }
  // facing: BODY looks LEFT (face on the left of the head, hair behind it). A unit looks at the unit it is dealing with,
  // else at the nearest living enemy that is not straight above / below it; the mirror is computed from that, never typed per team.
  const ART_FACING = 'left';
  function lookAt(u) {
    const f = foeOf(u); if (f && f.x !== u.x) return f;
    return alive().filter(t => t.team !== u.team && t.x !== u.x).sort((p, q) => dist(u, p) - dist(u, q) || p.x - q.x || (p.id < q.id ? -1 : 1))[0] || null;
  }
  function faceOf(u) { const t = lookAt(u); return t ? (t.x > u.x ? 'right' : 'left') : (u.team === 'a' ? 'right' : 'left'); }
  function drawPos(u) {
    let x = u.x * TS, y = u.y * TS;
    if (u.lunge) { const k = Math.round(Math.sin(Math.min(1, u.lunge.t / 14) * Math.PI) * 4); x += Math.sign(u.lunge.to.x - u.x) * k; y += Math.sign(u.lunge.to.y - u.y) * k; }
    return [x, y];
  }

  /* ---------- the module ---------- */
  let fc;
  function makeFC() {
    fc = GameDNA_CombatForecast.create({
      view: { x: 0, y: 0, w: W, h: HUD_Y }, skin: flat() ? 'flat-smoke' : 'pixel16', params: P,
      getObstacles: () => alive().map(u => Object.assign(rectOf(u), { id: u.id })).concat([{ x: 0, y: HUD_Y, w: W, h: H - HUD_Y }]),
      getCursor: () => S.pick ? cursorRect() : null,
      forecast: (a, d) => forecast(a.unit, d.unit)
    });
  }
  const cursorRect = () => { const t = S.pick.list[S.pick.i]; const [x, y] = drawPos(t); return { x: x - 2, y: y - 2, w: 20, h: 20 }; };

  /* ---------- the target picker (host-owned) and a scripted tour ---------- */
  function openPicker(id) { const u = byId(id); if (!u || u.hp <= 0) return; const list = targetsOf(u); if (!list.length) return; S.pick = { u, list, i: 0 }; S.msg = u.name + ' - choose a target'; }
  function closePicker() { S.pick = null; }
  function confirm() {
    if (!S.pick) return; const u = S.pick.u, t = S.pick.list[S.pick.i], f = forecast(u, t); closePicker();
    const seq = [[u, t, f]]; if (f.counter) seq.push([t, u, f.counter]); for (let i = 1; i < f.hits; i++) seq.push([u, t, f]); if (f.counter) for (let i = 1; i < f.counter.hits; i++) seq.push([t, u, f.counter]);
    S.fight = { seq, i: 0, t: 0 }; S.msg = u.name + ' attacks!';
  }
  const SCRIPT = [
    [700, () => openPicker('kestrel')], [2300, () => key('right')], [3900, () => key('down')], [5500, () => key('ok')],
    [7600, () => openPicker('wren')], [9200, () => key('right')], [10800, () => key('ok')],
    [12800, () => { const r = byId('raider'); if (r.hp > 0) { S.pick = { u: r, list: [byId('orrin')], i: 0 }; S.msg = 'Enemy phase - Raider aims'; } }], [14600, () => key('ok')],
    [16800, () => { reset(); S.script = true; }]
  ];
  function key(k) {
    if (S.fight) return;
    if (!S.pick) { if (k === 'back' || k === 'ok') { const hs = alive().filter(u => u.team === 'a' && targetsOf(u).length); if (hs.length) openPicker(hs[(S.step++) % hs.length].id); } return; }
    const p = S.pick;
    if (k === 'left') p.i = (p.i + p.list.length - 1) % p.list.length;
    if (k === 'right') p.i = (p.i + 1) % p.list.length;
    if ((k === 'up' || k === 'down') && p.u.weapons.length > 1) { p.u.wi = (p.u.wi + (k === 'up' ? p.u.weapons.length - 1 : 1)) % p.u.weapons.length; p.list = targetsOf(p.u); p.i = Math.min(p.i, p.list.length - 1); if (!p.list.length) closePicker(); }
    if (k === 'ok') confirm();
    if (k === 'back') { const hs = alive().filter(u => u.team === 'a' && targetsOf(u).length), j = hs.indexOf(p.u); closePicker(); if (hs.length) openPicker(hs[(j + 1) % hs.length].id); }
  }
  function step(input) {
    S.f++; S.t = S.f * FRAME;
    if (S.script) SCRIPT.forEach(([ms, fn]) => { if (S.t >= ms && S.t - FRAME < ms) fn(); });
    input.forEach(k => key(k));
    if (S.fight) {
      const F = S.fight, [a, d, s] = F.seq[F.i] || [];
      F.t++;
      if (!a || a.hp <= 0 || d.hp <= 0) { F.i++; F.t = 0; if (F.i >= F.seq.length) { S.fight = null; S.msg = ''; } }
      else {
        if (F.t === 1) a.lunge = { to: d, t: 0 };
        if (F.t === 8) { d.hp = Math.max(0, d.hp - s.dmg); d.flash = 12; }
        if (F.t >= 26) { a.lunge = null; F.i++; F.t = 0; if (F.i >= F.seq.length) { S.fight = null; S.msg = ''; } }
      }
    }
    S.units.forEach(u => { if (u.lunge) u.lunge.t++; if (u.flash) u.flash--; if (u.hp <= 0 && u.fade < 20) u.fade++; });
    // module wiring: show every step while the picker is open (live: target and weapon changes), hide otherwise
    if (S.pick) { const u = S.pick.u, t = S.pick.list[S.pick.i]; fc.show(Object.assign(desc(u), { unit: u }), Object.assign(desc(t), { unit: t })); }
    else fc.hide();
    fc.update(FRAME);
  }

  /* ---------- render ---------- */
  function flat() { return document.getElementById('flatSkin').checked; }
  if (window.GameDNA_Skin && !GameDNA_Skin.get('flat-smoke')) GameDNA_Skin.register({
    id: 'flat-smoke', name: 'Flat smoke test', pixel: false, native: { w: 256, h: 224, scale: 'fit' },
    palette: { ink: '#29304d', paper: '#f6f4ff', ui: { fill: '#fbfaff', fillTo: '#e8e6f6', edge: '#5b4bff', highlight: '#ffffff', shadow: '#29304d55', plate: '#eceaff' },
      team: { a: '#6f8cff', b: '#ff8574', n: '#9aa0b8' },
      overlay: { move: { fill: '#6f8cff', edge: '#3a50c0' }, attack: { fill: '#ff8574', edge: '#c04a3a' }, threat: { fill: '#b07aff', edge: '#7040c0' }, heal: { fill: '#5ad08a', edge: '#2a9a5a' } },
      fx: { hot: '#ff5a3a', cold: '#5ab8ff', heal: '#2aa860', crit: '#ffb43a', white: '#ffffff' },
      text: { main: '#29304d', main2: '#29304d', shadow: '#00000000', outline: '#ffffff', dim: '#a0a4bc', dim2: '#a0a4bc', label: '#5b4bff', label2: '#5b4bff', title: '#29304d', title2: '#29304d', gold: '#c06a14', gold2: '#c06a14', accent: '#5b4bff', select: '#ff5a3a' } },
    fonts: { ui: { type: 'canvas', family: 'system-ui, -apple-system, Segoe UI, sans-serif', size: 8, weight: 600 }, num: { type: 'canvas', family: 'system-ui, sans-serif', size: 10, weight: 800 } },
    shape: { radius: 3, edgeWidth: 1, padding: 4 }, shadow: { text: null, window: { dx: 0, dy: 1, blur: 3 }, sprite: { kind: 'blob', alpha: 0.3 } }
  });
  const SK = () => GameDNA_Skin.resolve(flat() ? 'flat-smoke' : 'pixel16');
  function render() {
    const k = flat() ? 3 : 1; g.setTransform(k, 0, 0, k, 0, 0); g.imageSmoothingEnabled = false;
    if (flat()) g.drawImage(ground, 0, 0); else drawGround(S.t);
    // attackable tiles of the picker (host art)
    if (S.pick) S.pick.list.forEach((t, i) => { const X = t.x * TS, Y = t.y * TS; g.fillStyle = i === S.pick.i ? 'rgba(240,60,50,0.45)' : 'rgba(240,60,50,0.22)'; g.fillRect(X, Y, TS, TS); });
    S.units.slice().sort((a, b) => a.y - b.y).forEach(u => {
      if (u.hp <= 0 && u.fade >= 20) return;
      const [x, y] = drawPos(u), img = u.art[u.weapons[u.wi]][u.flash && (u.flash >> 1) % 2 ? 1 : 0];
      g.fillStyle = 'rgba(10,20,10,0.35)'; g.fillRect(x + 3, y + 13, 10, 3);
      g.globalAlpha = u.hp > 0 ? 1 : 1 - u.fade / 20;
      if (faceOf(u) !== ART_FACING) { g.save(); g.translate(x + 16, y - 2); g.scale(-1, 1); g.drawImage(img, 0, 0); g.restore(); } else g.drawImage(img, x, y - 2);
      g.globalAlpha = 1;
      if (u.hp > 0) { g.fillStyle = '#0a0612'; g.fillRect(x + 1, y + 15, 14, 3); g.fillStyle = u.team === 'a' ? '#7cc8ff' : '#ff8a6a'; g.fillRect(x + 2, y + 16, Math.round(12 * u.hp / u.max), 1); }
    });
    if (S.pick) { const r = cursorRect(); SK().cursor(g, { x: r.x + 2, y: r.y + 2, w: 16, h: 16 }, 'bracket', S.t / 1000, {}); }
    // HUD (host art, through the same skin)
    const sk = SK(); sk.frame(g, { x: 0, y: HUD_Y, w: W, h: H - HUD_Y }, { role: 'window', team: 'n' });
    sk.text(g, (S.msg || 'Player phase').toUpperCase(), 10, HUD_Y + 8, { font: 'ui', color: sk.palette.text.title, color2: sk.palette.text.title2 });
    sk.text(g, S.script ? 'SCRIPTED TOUR - PRESS ANY KEY' : 'ARROWS TARGET / WEAPON  Z ATTACK', 10, HUD_Y + 19, { font: 'ui', color: sk.palette.text.label, color2: sk.palette.text.label2 });
    fc.draw(g);
    if (document.getElementById('showObs').checked) {
      g.lineWidth = 1; g.setLineDash([2, 2]);
      alive().forEach(u => { const r = rectOf(u); g.strokeStyle = '#ff5ad0'; g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); });
      if (S.pick) { const r = cursorRect(); g.strokeStyle = '#ffe070'; g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); }
      const fr = fc.rect(); if (fr) { g.strokeStyle = '#5affc8'; g.strokeRect(fr.x + 0.5, fr.y + 0.5, fr.w - 1, fr.h - 1); }
      g.setLineDash([]);
    }
    document.getElementById('clock').textContent = 't = ' + Math.round(S.t) + ' ms';
    document.getElementById('status').textContent = S.script ? 'Scripted tour: press a key or a button to take over.' : 'Your turn: choose a target and a weapon, then attack.';
  }
  function applyCanvasMode() { const fl = flat(); canvas.width = fl ? W * 3 : W; canvas.height = fl ? H * 3 : H; g = canvas.getContext('2d'); fit(); }

  /* ---------- controls ---------- */
  function fit() {
    const avail = Math.min(780, (canvas.parentElement.parentElement.clientWidth || W) - 12), k = Math.max(1, Math.floor(avail / W));
    canvas.style.width = (avail < W ? avail : W * k) + 'px'; canvas.style.height = (avail < W ? Math.round(avail * H / W) : H * k) + 'px';
  }
  addEventListener('resize', fit);
  function syncURL() { const u = new URLSearchParams(); PARAMS.forEach(p => { if (String(P[p.key]) !== String(p.default)) u.set(p.key, P[p.key]); }); history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : '')); }
  function buildParams() {
    const box = document.getElementById('params'); box.innerHTML = '';
    const names = { corner: 'Corner', near: 'Near', auto: 'Auto', all: 'All', compact: 'Compact', on: 'On', off: 'Off', attacker: 'Attacker', team: 'Player' };
    PARAMS.forEach(p => {
      const row = document.createElement('div'); row.className = 'row';
      if (p.type === 'range') {
        row.innerHTML = `<label><span>${p.label}</span><output>${P[p.key]}</output></label><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${P[p.key]}" aria-label="${p.label}">`;
        const inp = row.querySelector('input'), out = row.querySelector('output');
        const paint = () => inp.style.setProperty('--fill', ((inp.value - p.min) / (p.max - p.min) * 100) + '%'); paint();
        inp.addEventListener('input', () => { P[p.key] = Number(inp.value); out.textContent = inp.value; paint(); fc.setParams(P); syncURL(); if (FREEZE) render(); });
      } else {
        row.innerHTML = `<label><span>${p.label}</span></label><div class="seg" role="radiogroup">${p.options.map(o => `<button role="radio" data-v="${o}" aria-checked="${String(P[p.key]) === o}">${names[o] || o}</button>`).join('')}</div>`;
        row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { P[p.key] = b.dataset.v; row.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); fc.setParams(P); syncURL(); if (FREEZE) render(); }));
      }
      box.appendChild(row);
    });
    const vb = document.getElementById('variants'); vb.innerHTML = '';
    VARIANTS.forEach(v => { const b = document.createElement('button'); b.textContent = v.name; b.addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); Object.assign(P, v.params); buildParams(); fc.setParams(P); syncURL(); }); vb.appendChild(b); });
  }
  let pending = [];
  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', x: 'back', X: 'back', Escape: 'back' };
  function human(k) { if (S.script) { S.script = false; if (!S.pick && !S.fight) { pending.push('back'); return; } } pending.push(k); }
  addEventListener('keydown', e => { const k = KEYS[e.key]; if (!k || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && e.key !== 'Escape') return; e.preventDefault(); if (!e.repeat) human(k); });
  document.querySelectorAll('.keys button').forEach(b => b.addEventListener('click', () => human(b.dataset.k)));
  canvas.addEventListener('pointerdown', e => {   // tap a red tile to aim, tap it again to attack
    const r = canvas.getBoundingClientRect(), tx = Math.floor((e.clientX - r.left) * W / r.width / TS), ty = Math.floor((e.clientY - r.top) * H / r.height / TS);
    if (S.script) S.script = false;
    if (!S.pick) { pending.push('back'); return; }
    const i = S.pick.list.findIndex(t => t.x === tx && t.y === ty); if (i < 0) return;
    if (i === S.pick.i) pending.push('ok'); else S.pick.i = i;
  });
  document.getElementById('replay').addEventListener('click', () => { S = null; reset(); makeFC(); });
  document.getElementById('reset').addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); buildParams(); fc.setParams(P); syncURL(); });
  document.getElementById('showObs').addEventListener('change', () => { if (FREEZE) render(); });
  document.getElementById('flatSkin').addEventListener('change', () => { applyCanvasMode(); const f = S.f, sc = S.script; S = null; reset(); makeFC(); for (let i = 0; i < f; i++) step([]); S.script = sc; if (FREEZE) render(); });
  if (Q.get('obs') === '1') document.getElementById('showObs').checked = true;
  if (Q.get('skin') === 'flat') document.getElementById('flatSkin').checked = true;

  /* ---------- boot ---------- */
  applyCanvasMode(); buildParams(); reset(); makeFC();
  const n = Math.floor(T0 / FRAME);
  for (let i = 0; i < n; i++) step([]);
  if (FREEZE) { render(); document.documentElement.dataset.ready = '1'; }
  else {
    let last = performance.now(), acc = 0;
    const loop = now => { acc += Math.min(250, now - last); last = now; while (acc >= FRAME) { step(pending); pending = []; acc -= FRAME; } render(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  /* text state for critics and tools/sprites/statecheck.py. The BODY art looks LEFT (eye on the left of the head).
     facing comes from faceOf(), the same call render() uses to decide the mirror; target = lookAt(): the unit it is
     dealing with (picker pair, exchange of blows), else the nearest living enemy not in its own column. */
  window.__state = () => ({ t: Math.round(S.t), actors: S.units.map(u => {
    const p = drawPos(u), foe = lookAt(u), o = { id: u.id, x: p[0] + 8, y: p[1] + 16, facing: faceOf(u), target: foe ? foe.id : null };
    if (u.hp <= 0) o.noFace = 'dead'; return o; }) });
  window.__fcDemo = { state: () => S, fc: () => fc };
})();
