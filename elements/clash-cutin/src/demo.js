'use strict';
// A-04 demo: a small original skirmish map. The page plays the HOST: it owns the units, its own rules (damage, hit, crit,
// counters, follow-ups), the dice and the HP. When an attack is confirmed it resolves the whole exchange first, hands the
// outcome to GameDNA_ClashCutin and applies the same numbers to its units when the cut-in reports done. The module never
// computes or rolls anything.
(() => {
  const W = 256, H = 224, FRAME = 1000 / 60, TS = 16, COLS = 16, ROWS = 12, HUD_Y = 192;
  const PARAMS = /*PARAMS*/[];
  const VARIANTS = /*VARIANTS*/[];
  const Q = new URLSearchParams(location.search);
  const FREEZE = Q.get('freeze') === '1', T0 = Q.has('t') ? Math.max(0, Number(Q.get('t')) || 0) : 0;
  const SOAK = Math.max(0, Number(Q.get('soak')) || 0), MUTANT = Q.get('mutant') || '';
  const P = {}; PARAMS.forEach(p => { P[p.key] = Q.has(p.key) ? (p.type === 'range' ? Number(Q.get(p.key)) : Q.get(p.key)) : p.default; });

  const canvas = document.getElementById('screen');
  const g = canvas.getContext('2d');
  const PXS = window.GameDNA_PixelScene;

  /* ---------- map (original). Map chars are pixel-kit scene chars; the host maps them to its own terrain ---------- */
  const MAP = [
    'PPtT,,,,...tTPPP',
    'P,,,,,.....r.,TP',
    ',,,u.......pp,,T',
    ',,..........p,,,',
    '..........pp.,,,',
    '.r......ppp..sss',
    '..cccc..p...ssww',
    '..,,,,.pp..sswww',
    '.,,,,..p..sswwww',
    '..,,..pp.sssswww',
    'u....pp..ssswwww',
    '..F.pp..sswwwwww'
  ];
  const at = (x, y) => (MAP[y] || '')[x] || '.';
  // host terrain: name + the cut-in backdrop it asks for
  const TERRAIN = { '.': ['Plain', 'plains'], ',': ['Wood', 'forest'], c: ['Ruin', 'ruins'], s: ['Sand', 'desert'], p: ['Road', 'plains'], w: ['Shallows', 'marsh'], u: ['Bush', 'forest'], r: ['Rock', 'plains'], F: ['Flowers', 'plains'] };
  const SCENE = (() => {
    const props = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (at(x, y) === ',' && (x * 7 + y * 3) % 5 === 0) props.push({ k: 'bush', x: x * TS + 8, y: y * TS + 14, o: { v: (x + y) % 2 } });
    props.push({ k: 'flowers', x: 9 * TS + 8, y: 3 * TS + 12, o: { v: 1 } }, { k: 'sign', x: 7 * TS + 8, y: 9 * TS + 13 }, { k: 'stump', x: 1 * TS + 8, y: 8 * TS + 12 }, { k: 'rock', x: 14 * TS + 6, y: 3 * TS + 12, o: { v: 0 } });
    const sc = PXS.scene({ seed: 71, map: MAP, props });
    sc.scenery = sc.items.filter(it => !it.flat).sort((a, b) => a.y - b.y);
    return sc;
  })();

  /* ---------- cast: map chibis + the 24x32 pixel-kit battle figures for the cut-in ---------- */
  const FIG = {
    knight: { head: 'helm', gear: 'sword', shield: ['#c8ccd8', '#ffffff', '#8a90a4', '#2e5cc0'], pal: { h: '#9aa6b8', H: '#e0e8f4', x: '#5c6880', b: '#2e5cc0', B: '#6a94ea', d: '#1c3a80', g: '#16306a', p: '#7a8498', P: '#565e72', k: '#3a4052', K: '#8a94a8' } },
    archer: { head: 'hood', gear: 'bow', pal: { h: '#3a7a3a', H: '#6ab85a', x: '#245226', b: '#4a8a3a', B: '#86c46a', d: '#2a5424', g: '#8a5a2a' } },
    mage: { head: 'hat', gear: 'staff', robe: true, pal: { h: '#e8d8a8', H: '#fff4d0', x: '#b8a070', t: '#6a3aa8', T: '#a878e8', u: '#42206e', b: '#5a2a8a', B: '#9a62d0', d: '#381858', g: '#e8c060' } },
    brigand: { head: 'band', gear: 'axe', pal: { h: '#3a2a22', H: '#5a4434', x: '#221610', t: '#c03a2a', T: '#f07050', u: '#8a2018', b: '#7a4a2a', B: '#a87048', d: '#4a2a14', g: '#2a1a10' } },
    brute: { head: 'hair', gear: 'spear', beard: true, pal: { h: '#4a3a3a', H: '#7a6060', x: '#2a1e1e', b: '#6a2a2a', B: '#a0483a', d: '#3a1414', g: '#c8a050', s: '#c89068', S: '#9a6448' } },
    hexer: { head: 'hat', gear: 'hexrod', robe: true, pal: { h: '#8a8478', H: '#b0a898', x: '#5a564c', t: '#2a3a2a', T: '#4a6a4a', u: '#142016', b: '#2a4a3a', B: '#4a7a5a', d: '#142a1e', g: '#5ae08a', s: '#c8b89a', S: '#9a8a6c' } }
  };
  const ROSTER = [
    { id: 'knight', name: 'Aldric', team: 'a', x: 5, y: 6, hp: 28, atk: 14, def: 6, hit: 85, crit: 10, spd: 9, kind: 'melee', rng: [1, 1], weapon: 'Steel Sword', chibi: 'hero' },
    { id: 'archer', name: 'Wren', team: 'a', x: 3, y: 7, hp: 22, atk: 12, def: 3, hit: 90, crit: 10, spd: 10, kind: 'ranged', rng: [2, 2], weapon: 'Yew Bow', chibi: 'green' },
    { id: 'mage', name: 'Ilse', team: 'a', x: 9, y: 9, hp: 20, atk: 13, def: 2, hit: 80, crit: 5, spd: 7, kind: 'magic', rng: [1, 2], weapon: 'Ember Tome', chibi: 'elder', tint: '#ff8a3a' },
    { id: 'brigand', name: 'Brigand', team: 'b', x: 6, y: 6, hp: 26, atk: 13, def: 5, hit: 70, crit: 0, spd: 6, kind: 'melee', rng: [1, 1], weapon: 'Hand Axe', chibi: 'guard' },
    { id: 'brute', name: 'Brute', team: 'b', x: 5, y: 7, hp: 32, atk: 15, def: 7, hit: 65, crit: 0, spd: 4, kind: 'melee', rng: [1, 1], weapon: 'Boar Spear', chibi: 'merchant' },
    { id: 'hexer', name: 'Hexer', team: 'b', x: 11, y: 9, hp: 21, atk: 12, def: 2, hit: 75, crit: 5, spd: 8, kind: 'magic', rng: [1, 2], weapon: 'Hex Rod', chibi: 'girl', tint: '#5ae08a' }
  ];
  // ONE art source per unit, used on the map AND in the cut-in: pixel-kit fighterPose() frames, painted for each side (light kept
  // top-left, weapon in the same hand), so nothing is ever mirrored. The map draws the idle frame at 1x; the cut-in gets every pose.
  // map token: the SAME idle frame at half size (12x16 figure, one tile tall). Each 2x2 block takes its most common colour that is
  // not the outline, then the token gets a fresh 1 px outline, so palette, headgear and weapon carry over and nothing is redrawn.
  function mapToken(src) {
    const W2 = src.width >> 1, H2 = src.height >> 1, d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    const c = document.createElement('canvas'); c.width = W2; c.height = H2; const g2 = c.getContext('2d'), id = g2.createImageData(W2, H2), o = id.data, OL = [26, 16, 36];
    const on = new Uint8Array(W2 * H2);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const tally = {}; let n = 0, best = null, bestN = 0, outl = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const q = ((y * 2 + j) * src.width + x * 2 + i) * 4; if (d[q + 3] < 128) continue; n++;
        if (d[q] === OL[0] && d[q + 1] === OL[1] && d[q + 2] === OL[2]) { outl++; continue; }
        const k = d[q] + ',' + d[q + 1] + ',' + d[q + 2]; tally[k] = (tally[k] || 0) + 1; if (tally[k] > bestN) { bestN = tally[k]; best = k; } }
      if (n < 2 || !best) continue;
      const [r, gg, b] = best.split(',').map(Number), q = (y * W2 + x) * 4; o[q] = r; o[q + 1] = gg; o[q + 2] = b; o[q + 3] = 255; on[y * W2 + x] = 1;
    }
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { if (on[y * W2 + x]) continue;
      if ((x > 0 && on[y * W2 + x - 1]) || (x < W2 - 1 && on[y * W2 + x + 1]) || (y > 0 && on[(y - 1) * W2 + x]) || (y < H2 - 1 && on[(y + 1) * W2 + x])) { const q = (y * W2 + x) * 4; o[q] = OL[0]; o[q + 1] = OL[1]; o[q + 2] = OL[2]; o[q + 3] = 255; } }
    g2.putImageData(id, 0, 0); c.footX = src.footX / 2; c.footY = src.footY / 2; return c;
  }
  const POSES = ['idle', 'ready', 'windup', 'swing', 'follow', 'hurt', 'down', 'cast', 'aim', 'release'];
  const ART = {};
  Object.keys(FIG).forEach(id => {
    const both = pose => ({ left: PXS.fighterPose(FIG[id], pose, 'left'), right: PXS.fighterPose(FIG[id], pose, 'right') }), frames = {};
    POSES.forEach(p => { frames[p] = both(p); });
    ART[id] = { art: frames.idle, facing: 'left', mirror: 'never', frames, token: { left: mapToken(frames.idle.left), right: mapToken(frames.idle.right) } };
  });
  window.__clashCast = ART;

  /* ---------- the host's state and rules ---------- */
  let S;
  function reset() {
    S = { f: 0, t: 0, units: ROSTER.map(r => Object.assign({}, r, { max: r.hp, flash: 0, fade: 0 })), cursor: { x: 5, y: 6 }, sel: null, aim: null, fight: null,
      script: SOAK ? false : (S ? S.script : true), si: 0, wait: 54, msg: 'Player phase', log: S ? S.log : [], rng: 20261118, fights: 0 };
  }
  const byId = id => S.units.find(u => u.id === id);
  const alive = () => S.units.filter(u => u.hp > 0);
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const inRange = (u, t) => { const d = dist(u, t); return d >= u.rng[0] && d <= u.rng[1]; };
  const dmgOf = (u, t, crit) => Math.max(0, u.atk - t.def) * (crit ? 3 : 1);
  const hitOf = (u, t) => Math.max(0, Math.min(100, u.hit - (at(t.x, t.y) === ',' ? 15 : 0)));
  function dice() { S.rng = (Math.imul(S.rng, 1664525) + 1013904223) >>> 0; return S.rng / 4294967296; }
  // resolve one exchange with the host's rules; forced = scripted results ['hit' | 'miss' | 'crit', ...] in strike order
  function resolve(a, d, forced) {
    const hp = { att: a.hp, def: d.hp }, out = [], who = { att: a, def: d };
    const order = [['att', 'def']]; if (inRange(d, a)) order.push(['def', 'att']);
    if (a.spd - d.spd >= 3) order.push(['att', 'def']); else if (d.spd - a.spd >= 3 && inRange(d, a)) order.push(['def', 'att']);
    order.forEach(([by, tg], i) => {
      if (hp[by] <= 0 || hp[tg] <= 0) return;
      const u = who[by], t = who[tg], f = forced && forced[out.length];
      const res = f || (dice() * 100 < hitOf(u, t) ? (dice() * 100 < u.crit ? 'crit' : 'hit') : 'miss');
      const dmg = res === 'miss' ? 0 : dmgOf(u, t, res === 'crit');
      hp[tg] = Math.max(0, hp[tg] - dmg);
      out.push({ by, result: res, dmg });
    });
    return { strikes: out, after: hp };
  }
  const stats = (u, t, can) => can ? { hit: hitOf(u, t), dmg: dmgOf(u, t), crit: u.crit } : { hit: '--', dmg: '--', crit: '--' };
  const unitFor = (u, other, can) => Object.assign({ id: u.id, name: u.name, team: u.team, hp: u.hp, max: u.max, x: u.x, kind: u.kind, weapon: u.weapon, tint: u.tint, stats: stats(u, other, can) }, ART[u.id]);

  /* ---------- the module ---------- */
  let clash;
  function makeClash() { clash = GameDNA_ClashCutin.create({ view: { x: 0, y: 0, w: W, h: H }, skin: 'pixel16', params: P }); }
  function attack(a, d, forced) {
    const r = resolve(a, d, forced), rec = { n: S.fights++, att: a.id, def: d.id, before: { att: a.hp, def: d.hp }, host: JSON.parse(JSON.stringify(r)), staged: null, applied: null, moduleFinal: null, lastShown: null };
    S.log.push(rec); if (S.log.length > 400) S.log.shift();
    // the outcome handed to the module is the host's own; mutant 'reroll' stages a second, different roll (must be caught by checks)
    let staged = r.strikes;
    if (MUTANT === 'reroll') staged = r.strikes.map(s => Object.assign({}, s, { dmg: s.result === 'miss' ? 0 : s.dmg + 1 }));
    S.fight = { a, d, r };
    S.msg = a.name + ' attacks ' + d.name;
    clash.play({
      attacker: unitFor(a, d, true), defender: unitFor(d, a, inRange(d, a)), strikes: staged, after: MUTANT === 'reroll' ? null : r.after,
      terrain: TERRAIN[at(d.x, d.y)][1],
      onDone: res => {   // apply the host's numbers (the same ones the module staged)
        a.hp = r.after.att; d.hp = r.after.def; if (a.hp <= 0) a.flash = 0; if (d.hp <= 0) d.flash = 0;
        rec.moduleFinal = { att: res.att, def: res.def }; rec.applied = { att: a.hp, def: d.hp }; rec.skipped = res.skipped;
        S.fight = null; S.sel = null; S.aim = null; S.msg = d.hp <= 0 ? d.name + ' is defeated' : a.hp <= 0 ? a.name + ' is defeated' : 'Player phase';
      }
    });
    rec.staged = clash.state().staged;
  }

  /* ---------- scripted tour (one clock: host steps) ---------- */
  const SCRIPT = [
    { w: 900, f: () => select('knight') }, { w: 700, f: () => aimAt('brigand') }, { w: 700, f: () => attack(byId('knight'), byId('brigand'), ['hit', 'miss', 'hit']) },
    { w: 900, f: () => select('archer') }, { w: 700, f: () => aimAt('brute') }, { w: 700, f: () => attack(byId('archer'), byId('brute'), ['crit', 'hit']) },
    { w: 900, f: () => { S.msg = 'Enemy phase'; select('brute'); } }, { w: 700, f: () => aimAt('knight') }, { w: 700, f: () => attack(byId('brute'), byId('knight'), ['hit', 'crit']) },
    { w: 900, f: () => { S.msg = 'Enemy phase'; select('hexer'); } }, { w: 700, f: () => aimAt('mage') }, { w: 700, f: () => attack(byId('hexer'), byId('mage'), ['miss', 'hit']) },
    { w: 2200, f: () => { const keep = S.log, f = S.f; reset(); S.log = keep; S.f = f; S.t = f * FRAME; S.script = true; S.si = 0; } }
  ];
  function select(id) { const u = byId(id); if (!u || u.hp <= 0) return; S.sel = u; S.cursor = { x: u.x, y: u.y }; S.aim = null; if (u.team === 'a') S.msg = u.name + ' - choose a target'; }
  function aimAt(id) { const t = byId(id); if (!t || t.hp <= 0) return; S.aim = t; S.cursor = { x: t.x, y: t.y }; }
  const targetsOf = u => alive().filter(t => t.team !== u.team && inRange(u, t));

  /* ---------- input (map and cut-in) ---------- */
  function key(k) {
    if (clash.busy()) { clash.key(k === 'ok' ? 'z' : k === 'back' ? 'x' : k); return; }   // while the scene runs, keys go to it only
    if (S.fight) return;
    const c = S.cursor;
    if (k === 'up') c.y = Math.max(0, c.y - 1); if (k === 'down') c.y = Math.min(ROWS - 1, c.y + 1);
    if (k === 'left') c.x = Math.max(0, c.x - 1); if (k === 'right') c.x = Math.min(COLS - 1, c.x + 1);
    const there = alive().find(u => u.x === c.x && u.y === c.y);
    if (S.sel) S.aim = there && targetsOf(S.sel).includes(there) ? there : null;
    if (k === 'ok') {
      if (!S.sel) { if (there && there.team === 'a' && targetsOf(there).length) select(there.id); else S.msg = 'Pick a blue unit next to an enemy'; }
      else if (S.aim) attack(S.sel, S.aim);
      else if (there === S.sel) { S.sel = null; S.msg = 'Player phase'; }
    }
    if (k === 'back') { S.sel = null; S.aim = null; S.msg = 'Player phase'; }
    if (!alive().some(u => u.team === 'b') || !alive().some(u => u.team === 'a')) { const keep = S.log; reset(); S.log = keep; S.script = false; }
  }
  function step(input) {
    S.f++; S.t = S.f * FRAME;
    if (S.script && !clash.busy() && !S.fight) { if (--S.wait <= 0 && S.si < SCRIPT.length) { const e = SCRIPT[S.si++]; e.f(); S.wait = Math.round(((SCRIPT[S.si] || {}).w || 900) / FRAME); } }
    if (SOAK) soakStep();
    input.forEach(key);
    S.units.forEach(u => { if (u.flash) u.flash--; if (u.hp <= 0 && u.fade < 20) u.fade++; });
    if (clash.busy()) { const st = clash.state(); const rec = S.log[S.log.length - 1]; if (rec && st.phase !== 'done') rec.lastShown = { att: st.hp.att, def: st.hp.def, phase: st.phase, t: st.t }; }
    clash.update(FRAME);
  }
  // soak: random fights with the host's dice, random skips and speed toggles (checks/result-match.py)
  function soakStep() {
    if (S.fights >= SOAK) { window.__soakDone = true; return; }
    if (clash.busy()) { const r = dice(); if (r < 0.004) clash.key('z'); else if (r < 0.008) clash.key('x'); return; }
    if (S.fight) return;
    const as = alive().filter(u => u.team === 'a'), bs = alive().filter(u => u.team === 'b');
    if (!as.length || !bs.length) { const keep = S.log, n = S.fights, rg = S.rng; reset(); S.log = keep; S.fights = n; S.rng = rg; return; }
    // move a random unit next to (or in range of) a random foe, then attack (the soak only exercises the exchange)
    const side = dice() < 0.5 ? [as, bs] : [bs, as], a = side[0][Math.floor(dice() * side[0].length)], d = side[1][Math.floor(dice() * side[1].length)];
    const r = a.rng[Math.floor(dice() * 2) % a.rng.length], spots = [[r, 0], [-r, 0], [0, r], [0, -r]].map(([dx, dy]) => [d.x + dx, d.y + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < COLS && y < ROWS && !alive().some(u => u.x === x && u.y === y));
    if (!spots.length) return;
    const sp = spots[Math.floor(dice() * spots.length)]; a.x = sp[0]; a.y = sp[1];
    attack(a, d);
  }

  /* ---------- render ---------- */
  const SK = () => GameDNA_Skin.resolve('pixel16');
  // map facing: a unit looks at the unit it is dealing with, else at the nearest living enemy outside its own column
  function lookAt(u) {
    if (S.sel && S.aim) { if (S.sel === u) return S.aim; if (S.aim === u) return S.sel; }
    return alive().filter(t => t.team !== u.team && t.x !== u.x).sort((p, q) => dist(u, p) - dist(u, q) || p.x - q.x)[0] || null;
  }
  const faceOf = u => { const t = lookAt(u); return t ? (t.x > u.x ? 'right' : 'left') : (u.team === 'a' ? 'right' : 'left'); };
  function render() {
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
    SCENE.drawGround(g, S.t, 0, 0);
    const busy = clash.busy();
    if (S.sel && !busy) targetsOf(S.sel).forEach(t => { const r = SK(); r.overlay(g, { x: t.x * TS, y: t.y * TS, w: TS, h: TS }, 'attack', S.t / 1000, { tile: TS }); });
    const items = SCENE.scenery.map(it => ({ y: it.y, draw: () => it.draw(g, S.t, 0, 0) }));
    S.units.forEach(u => {
      if (u.hp <= 0 && u.fade >= 20) return;
      items.push({ y: u.y * TS + 15, draw: () => {
        const x = u.x * TS + 8, y = u.y * TS + 15, sel = S.sel === u && (S.f >> 4) % 2;
        g.fillStyle = u.team === 'a' ? 'rgba(90,150,255,0.55)' : 'rgba(255,90,70,0.55)'; g.fillRect(x - 6, y - 1, 12, 2); g.fillRect(x - 5, y + 1, 10, 1);
        g.globalAlpha = u.hp > 0 ? 1 : 1 - u.fade / 20;
        const im = ART[u.id].token[faceOf(u)];   // the cut-in's idle frame at map size (same palette and gear), feet on its tile
        g.drawImage(im, Math.round(x - im.footX), Math.round(y + 1 - im.footY - (sel ? 1 : 0)));
        g.globalAlpha = 1;
        if (u.hp > 0) { g.fillStyle = '#0a0612'; g.fillRect(x - 7, y + 1, 14, 3); g.fillStyle = u.team === 'a' ? '#7cc8ff' : '#ff8a6a'; g.fillRect(x - 6, y + 2, Math.round(12 * u.hp / u.max), 1); }
      } });
    });
    items.sort((a, b) => a.y - b.y).forEach(it => it.draw());
    if (!busy && (S.sel || !S.script)) SK().cursor(g, { x: S.cursor.x * TS, y: S.cursor.y * TS, w: TS, h: TS }, 'bracket', S.t / 1000, {});
    const sk = SK(); sk.frame(g, { x: 0, y: HUD_Y, w: W, h: H - HUD_Y }, { role: 'window', team: 'n' });
    sk.text(g, S.msg.toUpperCase(), 10, HUD_Y + 8, { font: 'ui', color: sk.palette.text.title, color2: sk.palette.text.title2 });
    sk.text(g, S.script ? 'SCRIPTED TOUR - PRESS ANY KEY' : 'ARROWS MOVE  Z SELECT / ATTACK  X BACK', 10, HUD_Y + 19, { font: 'ui', color: sk.palette.text.label, color2: sk.palette.text.label2 });
    clash.draw(g);
    const clk = document.getElementById('clock'); if (clk) clk.textContent = 't = ' + Math.round(S.t) + ' ms';
    const st = document.getElementById('status'); if (st) st.textContent = busy ? 'Cut-in: Z skips, X toggles x2.' : S.script ? 'Scripted tour: press a key or a button to take over.' : 'Your turn: pick a blue unit, then a red target in range.';
  }

  /* ---------- controls ---------- */
  function fit() {   // whole-number scale on wide screens; on phones the screen fills the width (edge to edge) so 7 px text is >= 10 CSS px
    if (innerWidth < 560) { canvas.style.width = innerWidth + 'px'; canvas.style.height = Math.round(innerWidth * H / W) + 'px'; return; }
    const avail = Math.min(780, (canvas.parentElement.parentElement.clientWidth || W) - 12), k = Math.max(1, Math.floor(avail / W));
    canvas.style.width = (avail < W ? avail : W * k) + 'px'; canvas.style.height = (avail < W ? Math.round(avail * H / W) : H * k) + 'px';
  }
  addEventListener('resize', fit);
  function syncURL() { const u = new URLSearchParams(); PARAMS.forEach(p => { if (String(P[p.key]) !== String(p.default)) u.set(p.key, P[p.key]); }); history.replaceState(null, '', location.pathname + (u.toString() ? '?' + u : '')); }
  function buildParams() {
    const box = document.getElementById('params'); if (!box) return; box.innerHTML = '';
    const names = { map: 'Map', team: 'Player right', attacker: 'Attacker right', band: 'Band', cut: 'Cut', on: 'On', off: 'Off', auto: 'Auto', 1: 'x1', 2: 'x2' };
    PARAMS.forEach(p => {
      const row = document.createElement('div'); row.className = 'row';
      if (p.type === 'range') {
        row.innerHTML = `<label><span>${p.label}</span><output>${P[p.key]}</output></label><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${P[p.key]}" aria-label="${p.label}">`;
        const inp = row.querySelector('input'), out = row.querySelector('output');
        const paint = () => inp.style.setProperty('--fill', ((inp.value - p.min) / (p.max - p.min) * 100) + '%'); paint();
        inp.addEventListener('input', () => { P[p.key] = Number(inp.value); out.textContent = inp.value; paint(); clash.setParams(P); syncURL(); if (FREEZE) render(); });
      } else {
        row.innerHTML = `<label><span>${p.label}</span></label><div class="seg" role="radiogroup">${p.options.map(o => `<button role="radio" data-v="${o}" aria-checked="${String(P[p.key]) === o}">${names[o] || o}</button>`).join('')}</div>`;
        row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { P[p.key] = b.dataset.v; row.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b)); clash.setParams(P); syncURL(); if (FREEZE) render(); }));
      }
      box.appendChild(row);
    });
    const vb = document.getElementById('variants'); vb.innerHTML = '';
    VARIANTS.forEach(v => { const b = document.createElement('button'); b.textContent = v.name; b.addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); Object.assign(P, v.params); buildParams(); clash.setParams(P); syncURL(); }); vb.appendChild(b); });
  }
  let pending = [];
  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', x: 'back', X: 'back', Escape: 'back' };
  function human(k) { if (S.script) { S.script = false; if (!clash.busy()) { S.sel = null; S.aim = null; S.msg = 'Player phase'; return; } } pending.push(k); }
  addEventListener('keydown', e => { const k = KEYS[e.key]; if (!k || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return; e.preventDefault(); if (!e.repeat) human(k); });
  document.querySelectorAll('.keys button').forEach(b => b.addEventListener('click', () => human(b.dataset.k)));
  canvas.addEventListener('pointerdown', e => {
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    if (clash.busy()) { clash.tap(x, y); return; }
    if (S.script) { S.script = false; S.sel = null; S.aim = null; }
    if (y >= HUD_Y) return;
    S.cursor = { x: Math.floor(x / TS), y: Math.floor(y / TS) }; pending.push('ok');
  });
  document.getElementById('replay').addEventListener('click', () => { S = null; reset(); makeClash(); });
  document.getElementById('reset').addEventListener('click', () => { PARAMS.forEach(p => P[p.key] = p.default); buildParams(); clash.setParams(P); syncURL(); });

  /* ---------- boot ---------- */
  fit(); reset(); makeClash(); buildParams();
  if (SOAK) {
    let guard = 0; while (!window.__soakDone && guard++ < 4000000) step([]);
    render(); window.__soakSteps = guard; document.documentElement.dataset.ready = '1';
  } else {
    const n = Math.floor(T0 / FRAME);
    for (let i = 0; i < n; i++) step([]);
    if (FREEZE) { render(); document.documentElement.dataset.ready = '1'; window.__frozen = true; }
    else {
      let last = performance.now(), acc = 0;
      const loop = now => { acc += Math.min(250, now - last); last = now; while (acc >= FRAME) { step(pending); pending = []; acc -= FRAME; } render(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  }
  /* text state for critics and tools/sprites/statecheck.py. While the cut-in runs, the actors are the two fighters it draws
     (facing read from the module's own draw decision); otherwise the map units (facing = faceOf(), the call render() uses). */
  window.__state = () => {
    if (clash.busy()) {
      const st = clash.state();
      return { t: Math.round(S.t), cutin: { phase: st.phase, t: st.t, caption: st.caption, strike: st.strike, hp: st.hp, final: st.final, speed: st.speed, theme: st.theme },
        actors: st.actors.map(a => ({ id: a.id, x: a.x, y: a.footY, facing: a.facing, target: a.target, flipX: a.flipX, variant: a.variant, native: a.native, mirror: a.mirror, pose: a.pose, hp: a.hp, noFace: a.alive ? undefined : 'fallen' })) };
    }
    return { t: Math.round(S.t), actors: S.units.map(u => { const foe = lookAt(u), o = { id: u.id, x: u.x * TS + 8, y: u.y * TS + 15, facing: faceOf(u), target: foe ? foe.id : null }; if (u.hp <= 0) o.noFace = 'dead'; return o; }) };
  };
  window.__clashDemo = { state: () => S, clash: () => clash, log: () => S.log, advance: n => { for (let i = 0; i < n; i++) step([]); render(); } };
})();
