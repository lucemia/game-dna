/* F-04 beat-judge demo: a rhythm duel. The hero strikes on the player's presses; GameDNA_BeatJudge rates each press
 * against the beat (F-03 chip-music battle loop, or the module's own click track) and the demo decides what a rating
 * does: Perfect = double damage, Good = normal, Miss = the brute counters on the next beat. A scripted demo player
 * (late by ~70 ms) plays until the visitor presses; it calibrates once, and its later presses rate Perfect.
 * One clock: the scene animates from the beat clock (the music clock), so ?t=<ms>&freeze=1 stills are live play.
 * Scenery: pixel-kit (GameDNA_PixelScene, fighters with painted right-facing poses); in-canvas text: C-03 pixel font. */
(() => {
  'use strict';
  const BJ = window.GameDNA_BeatJudge, CM = window.GameDNA_ChipMusic, PXS = window.GameDNA_PixelScene;
  const PF = window.GameDNA_PixelFont.create({ params: { font: 'regular', shadow: 'outline' } });
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const num = (v, d) => v == null || v === '' || !isFinite(+v) ? d : +v;
  const FREEZE_T = qs.has('t') ? Math.max(0, num(qs.get('t'), 0)) : null, FROZEN = FREEZE_T != null && qs.get('freeze') === '1';
  const MUT = qs.get('mutant') || '';
  const STEP = 1000 / 60, WW = 256, H = 200, FEET = 156, LANE_Y = 166;
  const HERO_X = 110, FOE_X = 150;

  /* ---------------- music + beat judge ---------------- */
  const music = CM.create({ params: { volume: num(qs.get('volume'), 0.5) } });
  let source = qs.get('source') === 'click' ? 'click' : 'music';
  const P0 = { perfect: num(qs.get('perfect'), 45), good: num(qs.get('good'), 100), volume: num(qs.get('volume'), 0.5), bpm: num(qs.get('bpm'), 120), offset: 0, expect: qs.get('expect') === 'on' };
  const LOG = []; let logDirty = true, chartDirty = true;
  let beat = null;
  function makeBeat() {
    const keep = beat ? beat.params() : null;
    if (beat) beat.destroy();
    beat = BJ.create({ music: source === 'music' ? music : null, params: Object.assign({}, P0, keep ? { offset: keep.offset, perfect: keep.perfect, good: keep.good, volume: keep.volume, expect: keep.expect, mute: keep.mute } : {}),
      onBeat, onRate, onCalibrated, hints: { tap: 'Z, SPACE OR TAP', cancel: 'X OR ESC: CANCEL' } });
  }

  /* ---------------- the duel (all times on the beat clock) ---------------- */
  const FOE_MAX = 300, HERO_MAX = 120;
  const G = { k: 0, mode: 'demo', heroHp: HERO_MAX, foeHp: FOE_MAX, heroBar: HERO_MAX, foeBar: FOE_MAX, hero: null, foe: null, hurtH: -1e9, hurtF: -1e9, dodge: -1e9, hdx: 0, fdx: 0, ko: null, rise: -1e9,
    banners: [], number: null, auto: [], calTap: [], calOk: null, counter: null, presses: [], round: 1, lastBeat: -1e9, lastDown: false };
  const rnd = k => { let t = Math.imul(k + 0x9e37, 0x85ebca6b) ^ 0x2c1b3c6d; t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35); return (((t ^ (t >>> 16)) >>> 0) / 4294967296) * 2 - 1; };
  // the scripted player: ms from the beat (it taps ~70 ms late); null = no press
  function script(k) {
    if (k < 5) return null;
    if (k <= 20) { if (k === 12) return 160; if (k === 13 || k === 14 || k === 17 || k === 20) return null; return 70 + Math.round(rnd(k) * 26); }
    if (k <= 33) return null;                                   // calibration (its taps are scheduled in onBeat)
    if (k === 47) return 280; if (k === 48 || k === 49) return null;   // an off-beat miss; the brute counters on beat 49
    if (k === 58) return -115; if (k === 59) return null;              // an early miss; the counter lands on beat 59
    if (k === 63) return null;
    return 70 + Math.round(rnd(k) * 20);
  }
  const CYCLE = 76, CAL_AT = 20;
  function banner(text, t0, ms, col) { G.banners = G.banners.filter(b => b.t1 <= t0 - 1); G.banners.push({ text, t0, t1: t0 + ms, col }); }
  function nextBeatAfter(t) { const L = beat.beats(t + 1, t + 4000); return L.length ? L[0] : null; }
  function onBeat(b) {
    G.k++; G.lastBeat = b.t; G.lastDown = b.down;
    const k = G.k;
    if (k > CYCLE && !beat.busy() && !G.ko) resetCycle(b.t);
    if (G.k === 1) banner('READY', b.t, 700, '#ffe890');
    if (G.k === 3) banner('GO!', b.t, 600, '#ffffff');
    if (G.ko && b.t > G.ko.t + 900 && G.rise < G.ko.t) {   // the brute gets up on the first beat after the jingle (or 4 beats on the click track)
      if (source === 'click' ? k >= G.ko.k + 4 : true) { G.rise = b.t; G.foeHp = FOE_MAX; G.round++; banner('ROUND ' + G.round, b.t, 1100, '#ffe890'); G.ko = null; }
    }
    const nb = nextBeatAfter(b.t);
    if (G.mode !== 'demo' || !nb) return;
    if (k === CAL_AT && !beat.busy()) { beat.calibrate(); logPush({ kind: 'cal', text: 'Calibration opened (demo player)' }); return; }
    if (beat.busy()) {
      const st = beat.state().calibrating;
      if (st && st.phase === 'result') { if (!G.calOk) G.calOk = { at: nb.t + 150 }; }
      else if (k >= CAL_AT + 4) G.calTap.push({ at: nb.t + 70 + Math.round(rnd(k + 500) * 14) });
      return;
    }
    const d = script(k + 1);
    if (d != null && !G.ko) G.auto.push({ at: nb.t + d });
  }
  function resetCycle(t) {
    G.k = 1; G.heroHp = HERO_MAX; G.foeHp = FOE_MAX; G.round = 1; G.ko = null; G.counter = null; G.auto = []; G.presses = [];
    beat.reset(); beat.setParams({ offset: 0 }); chartDirty = true;
    banner('READY', t, 700, '#ffe890');
    logPush({ kind: 'cal', text: 'Demo restarts: offset back to 0 ms' });
  }
  function onRate(r) {
    if (!r || !r.rating) return;
    const t = r.t, hit = t + 110;   // the swing lands mid-arc
    if (!r.skipped) G.hero = { t, rating: r.rating, dx0: heroPose(t).dx };   // a new strike starts where the last one is
    G.presses.push({ d: r.delta, rating: r.rating, judged: r.judged }); if (G.presses.length > 40) G.presses.shift(); chartDirty = true;
    logPush({ kind: r.rating, text: (r.rating === 'perfect' ? 'Perfect strike, double damage' : r.rating === 'good' ? 'Good strike' : r.skipped ? 'Beat passed without a press' : 'Miss: the brute counters') + (r.delta != null && r.rating !== 'perfect' ? ` (${r.delta > 0 ? '+' : ''}${Math.round(r.delta)} ms)` : r.delta != null ? ` (${r.delta > 0 ? '+' : ''}${Math.round(r.delta)} ms)` : ''), t });
    if (G.ko) return;
    if (r.rating === 'miss') {
      if (!r.skipped) { G.dodge = t + 60; G.number = { text: 'MISS', t: t + 130, who: 'foe', col: '#b8b0d8' }; }
      const nb = nextBeatAfter(t + 300);
      if (nb && !G.counter) G.counter = { at: nb.t, done: false };
      return;
    }
    const dmg = r.rating === 'perfect' ? 24 : 12;
    G.pendingHit = { at: hit, dmg, rating: r.rating };
  }
  function onCalibrated(o) {
    logPush({ kind: 'cal', text: o.kept ? `Calibrated: offset ${o.offset > 0 ? '+' : ''}${o.offset} ms (${o.taps} taps)` : 'Calibration cancelled' });
    if (o.kept) banner('OFFSET ' + (o.offset > 0 ? '+' : '') + o.offset + ' MS', beat.clock(), 1500, '#9fe8ff');
    G.calTap = []; G.calOk = null;
  }
  function logPush(e) { LOG.push(Object.assign({ t: beat ? beat.clock() : 0 }, e)); if (LOG.length > 40) LOG.shift(); logDirty = true; }

  /* ---------------- step: the music clock, the beat clock, the script ---------------- */
  let simT = 0;
  function step() {
    simT += STEP;
    music.update(STEP);
    if (source === 'music') music.play('battle', simT < STEP * 1.5 ? { at: 'now' } : undefined);
    beat.update(STEP);
    const cl = beat.clock();
    if (G.mode === 'demo') {
      while (G.auto.length && !beat.busy() && cl >= G.auto[0].at) { const a = G.auto.shift().at; beat.press({ clock: a }); }
      while (G.calTap.length && beat.busy() && cl >= G.calTap[0].at) { const a = G.calTap.shift().at; beat.key('confirm', { clock: a }); }
      if (G.calOk && beat.busy() && cl >= G.calOk.at) { G.calOk = null; beat.key('confirm', { clock: cl }); }
    }
    if (G.pendingHit && cl >= G.pendingHit.at) {
      const h = G.pendingHit; G.pendingHit = null;
      if (!G.ko) {
        G.hurtF0 = foePose(h.at).dx; G.foeHp = Math.max(0, G.foeHp - h.dmg); G.hurtF = h.at; G.number = { text: String(h.dmg), t: h.at, who: 'foe', col: h.rating === 'perfect' ? '#ffd84a' : '#ffffff' };
        if (G.foeHp <= 0) { G.ko = { t: h.at, k: G.k }; banner('K.O.!', h.at + 80, 1400, '#ff9a5a'); if (source === 'music') music.jingle('victory'); G.auto = []; G.counter = null; }
      }
    }
    if (G.counter && !G.counter.done && cl >= G.counter.at) {
      G.counter.done = true; G.hurtH0 = heroPose(G.counter.at).dx; G.hurtH = G.counter.at;
      G.heroHp = Math.max(0, G.heroHp - 8); G.number = { text: '8', t: G.counter.at, who: 'hero', col: '#ff7a7a' };
      if (G.heroHp <= 0) { G.heroHp = HERO_MAX; banner('SECOND WIND', G.counter.at + 100, 1000, '#9fe8ff'); }
    }
    if (G.counter && !G.counter.started && cl >= G.counter.at - 300) { G.counter.started = true; G.foe = { at: G.counter.at }; }   // wind-up starts 300 ms before the beat
    if (G.counter && G.counter.done && cl > G.counter.at + 450) G.counter = null;
    // the fighters' offsets follow their pose targets by at most 3 px a step (no pops when one move interrupts another)
    { const lim = MUT === 'jump' ? 99 : 3, ht = heroPose(cl).dx, ft = foePose(cl).dx; G.hdx += Math.max(-lim, Math.min(lim, ht - G.hdx)); G.fdx += Math.max(-lim, Math.min(lim, ft - G.fdx)); }
    // HP bars glide
    G.heroBar += (G.heroHp - G.heroBar) * 0.12; G.foeBar += (G.foeHp - G.foeBar) * 0.12;
    if (Math.abs(G.heroBar - G.heroHp) < 0.3) G.heroBar = G.heroHp; if (Math.abs(G.foeBar - G.foeHp) < 0.3) G.foeBar = G.foeHp;
  }

  /* ---------------- art ---------------- */
  const FIG = {
    hero: { head: 'helm', gear: 'sword', shield: ['#c8ccd8', '#ffffff', '#8a90a4', '#2e5cc0'], pal: { h: '#9aa6b8', H: '#e0e8f4', x: '#5c6880', b: '#2e5cc0', B: '#6a94ea', d: '#1c3a80', g: '#16306a', p: '#7a8498', P: '#565e72', k: '#3a4052', K: '#8a94a8' } },
    foe: { head: 'hair', gear: 'spear', beard: true, pal: { h: '#4a3a3a', H: '#7a6060', x: '#2a1e1e', b: '#6a2a2a', B: '#a0483a', d: '#3a1414', g: '#c8a050', s: '#c89068', S: '#9a6448' } }
  };
  // The demo cast: pixel-kit fighters (native left; the hero uses its painted right-facing poses: sword + shield, mirror
  // never). Every frame is copied into a padded 64x56 canvas (no pixel on a frame edge). Kit poses whose held item breaks
  // are not used: the hero's wind-up is the 'ready' pose drawn back a step, both fighters' 'hurt' is their idle pose
  // leaning away (weapon still in hand), the brute's thrust gets back the spear head the 48 px kit frame cut off, and the
  // K.O. pose drops the spear on the floor in front of him.
  const NATIVE = 'left', PADX = 12, PADY = 8, FW = 48 + 2 * PADX, FH = 48 + PADY + 4;
  const CAST = {}, GATE = [];
  function mkFrame(src) { const c = document.createElement('canvas'); c.width = FW; c.height = FH; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; if (src) x.drawImage(src, PADX, PADY); c.footX = src.footX + PADX; c.footY = src.footY + PADY; return c; }
  // a kit frame is cut when art touches its left, right or top edge (its bottom row is the foot line); a cast frame has
  // a margin on all four sides
  function edgeTouch(im, foot) { const d = im.getContext('2d').getImageData(0, 0, im.width, im.height).data, W = im.width, H2 = im.height; for (let y = 0; y < H2; y++) for (let x = 0; x < W; x++) if ((x === 0 || y === 0 || x === W - 1 || (!foot && y === H2 - 1)) && d[(y * W + x) * 4 + 3]) return true; return false; }
  function lean(src, back) {   // upper body leans away by 1 px above the belt and 2 px above the shoulders
    const c = mkFrame(src), x = c.getContext('2d'); x.clearRect(0, 0, FW, FH);
    const fy = src.footY;
    x.drawImage(src, 0, fy - 13, 48, 13, PADX, PADY + fy - 13, 48, 13);
    x.drawImage(src, 0, fy - 22, 48, 9, PADX + back, PADY + fy - 22, 48, 9);
    x.drawImage(src, 0, 0, 48, fy - 22, PADX + 2 * back, PADY, 48, fy - 22);
    return c;
  }
  function spearTip(c, side) {   // the kit's thrust frame ends at its 48 px edge: continue the pole and paint the head
    const g2 = c.getContext('2d'), d = g2.getImageData(0, 0, FW, FH).data, col = side === 'left' ? PADX : PADX + 47, dir = side === 'left' ? -1 : 1, rows = [];
    for (let y = 0; y < FH; y++) if (d[(y * FW + col) * 4 + 3]) rows.push(y);
    if (!rows.length) return false;
    const r = Math.round(rows.reduce((a, b) => a + b, 0) / rows.length);
    const P2 = (x, y, cc) => { g2.fillStyle = cc; g2.fillRect(x, y, 1, 1); };
    let x0 = col + dir;
    for (let i = 0; i < 2; i++) { P2(x0, r - 1, '#1a1024'); P2(x0, r, '#7a5030'); P2(x0, r + 1, '#1a1024'); x0 += dir; }
    P2(x0, r - 2, '#e04848'); P2(x0, r + 2, '#e04848'); P2(x0, r - 1, '#1a1024'); P2(x0, r, '#5a3818'); P2(x0, r + 1, '#1a1024'); x0 += dir;   // binding
    const HEAD = [[-2, '#1a1024', 1], [-1, '#c8d4e0', 4], [0, '#ffffff', 6], [1, '#8a94a8', 4], [2, '#1a1024', 1]];   // rows: offset, colour, length
    HEAD.forEach(([dy, cc, len]) => { for (let k = 0; k < len; k++) P2(x0 + dir * k, r + dy, cc); });
    P2(x0 + dir * 6, r, '#1a1024'); P2(x0 + dir * 4, r - 1, '#1a1024'); P2(x0 + dir * 4, r + 1, '#1a1024');
    return true;
  }
  function bladeTip(c, side) {   // the kit's swing frame cuts the blade at its 48 px edge: continue it 2 px and point it
    const g2 = c.getContext('2d'), col = side === 'left' ? PADX : PADX + 47, dir = side === 'left' ? -1 : 1;
    const strip = g2.getImageData(col, 0, 1, FH), d = strip.data, rows = [];
    for (let y = 0; y < FH; y++) if (d[y * 4 + 3]) rows.push(y);
    if (!rows.length) return false;
    for (let k = 1; k <= 2; k++) g2.putImageData(strip, col + dir * k, 0);
    const top = rows[0], bot = rows[rows.length - 1], x3 = col + dir * 3, x4 = col + dir * 4;
    g2.clearRect(x3, 0, 1, FH); g2.clearRect(x4, 0, 1, FH);
    g2.fillStyle = '#1a1024'; g2.fillRect(x3, top, 1, 1); g2.fillRect(x3, bot, 1, 1); g2.fillRect(x4, top + 1, 1, Math.max(1, bot - top - 1));
    g2.fillStyle = '#ffffff'; if (bot - top >= 2) g2.fillRect(x3, top + 1, 1, bot - top - 1);
    return true;
  }
  function dropSpear(c, side) {   // K.O.: the spear lies on the floor in front of the brute
    const g2 = c.getContext('2d'), fy = c.footY, dir = side === 'left' ? -1 : 1, x0 = c.footX + dir * 4;
    for (let k = 0; k < 22; k++) { g2.fillStyle = '#1a1024'; g2.fillRect(x0 + dir * k, fy - 2, 1, 1); g2.fillStyle = '#7a5030'; g2.fillRect(x0 + dir * k, fy - 1, 1, 1); }
    const xh = x0 + dir * 22;
    [[-1, '#1a1024', 1], [0, '#c8d4e0', 4], [-1, '#c8d4e0', 0]].forEach(() => { });
    g2.fillStyle = '#1a1024'; g2.fillRect(Math.min(xh, xh + dir * 5), fy - 3, 6, 1);
    g2.fillStyle = '#c8d4e0'; g2.fillRect(Math.min(xh, xh + dir * 4), fy - 2, 5, 1); g2.fillStyle = '#ffffff'; g2.fillRect(Math.min(xh, xh + dir * 3), fy - 1, 4, 1);
    g2.fillStyle = '#e04848'; g2.fillRect(xh - dir, fy - 2, 1, 1);
  }
  function castFrame(who, name, side) {
    const key = who + '|' + name + '|' + side; if (CAST[key]) return CAST[key];
    const kit = n => PXS.fighterPose(FIG[who], n, side), back = side === 'right' ? -1 : 1;
    let c, srcName = name, repaired = false;
    if (name === 'hurt' || name === 'dodge') { srcName = 'idle'; c = lean(kit('idle'), back); }
    else if (name === 'windup' && who === 'hero') { srcName = 'ready'; c = mkFrame(kit('ready')); }
    else { c = mkFrame(kit(name)); }
    const src = kit(srcName), touched = edgeTouch(src, true);
    if (who === 'foe' && name === 'swing' && MUT !== 'nospear') repaired = spearTip(c, side);
    if (who === 'hero' && name === 'swing' && MUT !== 'nospear') repaired = bladeTip(c, side);
    if (who === 'foe' && name === 'down') { dropSpear(c, side); repaired = touched; }
    if (MUT === 'kitpose' && who === 'hero') { const k2 = mkFrame(PXS.fighterPose(FIG[who], name === 'dodge' ? 'hurt' : name, side)); k2.footX = c.footX; k2.footY = c.footY; c = k2; }
    c.meta = { who, pose: name, side, from: srcName, sourceTouchesEdge: touched, repaired };
    GATE.push(c);
    return (CAST[key] = c);
  }
  function pose(who, name) { const want = who === 'hero' ? 'right' : 'left'; const side = MUT === 'face' && who === 'foe' ? 'right' : want; return castFrame(who, name, side === NATIVE ? 'left' : 'right'); }
  const CAST_POSES = { hero: ['ready', 'windup', 'swing', 'follow', 'hurt'], foe: ['ready', 'windup', 'swing', 'hurt', 'dodge', 'down'] };
  // gate (demo-check): no frame has a pixel on its edge, a source frame cut by its edge was repaired, every frame holds its weapon
  window.__castGate = () => {
    CAST_POSES.hero.forEach(p => pose('hero', p)); CAST_POSES.foe.forEach(p => pose('foe', p));
    return GATE.map(c => { const d = c.getContext('2d').getImageData(0, 0, FW, FH).data; let blade = 0, head = 0;
      for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const h = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; if (h === 0xdfe6f2) blade++; if (h === 0xc8d4e0) head++; }
      return Object.assign({}, c.meta, { edge: edgeTouch(c), blade, spearHead: head }); });
  };
  window.__cast = { draw: (gg, id, x, footY, want, p) => { gg.imageSmoothingEnabled = false; const im = castFrame(id === 'knight' || id === 'hero' ? 'hero' : 'foe', p || 'ready', want === 'right' ? 'right' : 'left'); gg.drawImage(im, Math.round(x - im.footX), Math.round(footY - im.footY)); } };
  const layer = document.createElement('canvas'); layer.width = FW; layer.height = FH; const lg = layer.getContext('2d');
  const BOX = new Map();
  function bbox(im) {   // the opaque pixels of a pose (weapon included), relative to its foot point
    let b = BOX.get(im); if (b) return b;
    const d = im.getContext('2d').getImageData(0, 0, im.width, im.height).data; let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
    for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) if (d[(y * im.width + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    b = { x: x0 - im.footX, y: y0 - im.footY, w: x1 - x0 + 1, h: y1 - y0 + 1 }; BOX.set(im, b); return b;
  }
  function drawFig(g, im, x, footY, flash) {
    const X = Math.round(x - im.footX), Y = Math.round(footY - im.footY);
    if (!flash) { g.drawImage(im, X, Y); return; }
    lg.globalCompositeOperation = 'source-over'; lg.clearRect(0, 0, FW, FH); lg.drawImage(im, 0, 0);
    lg.globalCompositeOperation = 'source-atop'; lg.fillStyle = '#ffffff'; lg.fillRect(0, 0, FW, FH); lg.globalCompositeOperation = 'source-over';   // opaque, never a translucent ghost
    g.drawImage(layer, X, Y);
  }

  // background, baked once per world (256x200): dusk sky, ridges, a stone parapet, flagstones
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const BG = (() => {
    const c = document.createElement('canvas'); c.width = WW; c.height = H; const g = c.getContext('2d'), id = g.createImageData(WW, H), d = id.data;
    const SKY = ['#160f30', '#1f1540', '#2c1a4e', '#3e2058', '#56265e', '#722e62', '#923a60', '#b44c58', '#d4644c', '#ec8a4a', '#f8b25c'].map(hex);
    const put = (x, y, c3) => { const q = (y * WW + x) * 4; d[q] = c3[0]; d[q + 1] = c3[1]; d[q + 2] = c3[2]; d[q + 3] = 255; };
    for (let y = 0; y < H; y++) for (let x = 0; x < WW; x++) {
      const f = Math.min(1, y / 116) * (SKY.length - 1), b = Math.min(SKY.length - 2, Math.floor(f)), fr = f - b, th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      put(x, y, SKY[fr > th ? b + 1 : b]);
    }
    // sun low on the right, with banded haze
    const sun = hex('#ffd890'), sun2 = hex('#ffb870');
    for (let y = 78; y < 118; y++) for (let x = 150; x < 214; x++) { const dx = x - 182, dy = y - 104, r = Math.sqrt(dx * dx + dy * dy); if (r < 17) put(x, y, (y > 106 && (y % 3 === 0)) ? sun2 : sun); }
    // stars
    for (let i = 0; i < 40; i++) { const x = Math.floor(PXS.hash(i, 1, 7) * WW), y = Math.floor(PXS.hash(i, 2, 7) * 52); put(x, y, i % 5 ? hex('#8a7ab8') : hex('#e8e0ff')); }
    // far and near ridges
    const R1 = hex('#4a2850'), R1b = hex('#5e3060'), R2 = hex('#2e1838'), R2b = hex('#3c2046');
    for (let x = 0; x < WW; x++) {
      const r1 = 92 - (PXS.noise(x, 0, 38, 3) * 22 + PXS.noise(x, 0, 11, 4) * 6), r2 = 104 - (PXS.noise(x, 0, 26, 9) * 14 + PXS.noise(x, 0, 7, 10) * 3);
      const s1 = PXS.noise(x + 2, 0, 38, 3) - PXS.noise(x, 0, 38, 3);
      for (let y = Math.floor(r1); y < 122; y++) put(x, y, y < r1 + 4 && s1 < 0 ? R1b : R1);
      for (let y = Math.floor(r2); y < 122; y++) put(x, y, y < r2 + 2 ? R2b : R2);
    }
    g.putImageData(id, 0, 0);
    // parapet: a low stone wall with merlons, light from the sun side
    const ST = PXS.PAL.stone;
    for (let x = 0; x < WW; x += 16) {
      const merlon = (x / 16) % 2 === 0;
      if (merlon) { g.fillStyle = ST[1]; g.fillRect(x + 1, 108, 14, 6); g.fillStyle = ST[3]; g.fillRect(x + 1, 108, 14, 1); g.fillStyle = ST[0]; g.fillRect(x + 1, 113, 14, 1); g.fillRect(x + 14, 108, 1, 6); }
    }
    for (let y = 114; y < 128; y += 4) for (let x = ((y / 4) % 2) * 8 - 8; x < WW; x += 16) {
      g.fillStyle = ST[1]; g.fillRect(x + 1, y, 15, 4); g.fillStyle = ST[2]; g.fillRect(x + 1, y, 15, 1); g.fillStyle = ST[0]; g.fillRect(x, y, 1, 4); g.fillRect(x, y + 3, 16, 1);
      if (PXS.hash(x, y, 3) > 0.7) { g.fillStyle = '#3a6a3a'; g.fillRect(x + 3 + Math.floor(PXS.hash(x, y, 4) * 9), y + 3, 2, 1); }
    }
    g.fillStyle = '#1a1424'; g.fillRect(0, 127, WW, 1);
    // flagstones: rows that get taller toward the viewer, warm light near the wall
    let y = 128, row = 0;
    while (y < H) {
      const h = 5 + row * 2, off = (row % 2) * 13;
      for (let x = -off; x < WW; x += 26 + row * 2) {
        const w = 26 + row * 2, n = PXS.hash(x, row, 5);
        g.fillStyle = n > 0.66 ? ST[2] : n > 0.33 ? '#6e667c' : ST[1]; g.fillRect(x + 1, y, w - 1, h);
        g.fillStyle = ST[3]; g.fillRect(x + 1, y, w - 1, 1);
        g.fillStyle = '#2e2838'; g.fillRect(x, y, 1, h); g.fillRect(x, y + h - 1, w, 1);
        if (n > 0.8) { g.fillStyle = ST[0]; g.fillRect(x + 6, y + 2, 4, 1); g.fillRect(x + 9, y + 3, 3, 1); }
      }
      y += h; row++;
    }
    // warm sunset wash on the floor, darker toward the front
    const gr = g.createLinearGradient(0, 128, 0, H); gr.addColorStop(0, 'rgba(255,150,80,0.20)'); gr.addColorStop(0.5, 'rgba(60,20,60,0.10)'); gr.addColorStop(1, 'rgba(10,6,20,0.45)');
    g.fillStyle = gr; g.fillRect(0, 128, WW, H - 128);
    return c;
  })();
  // braziers stand on the floor and flare on every beat
  const BRAZ = [44, 212];
  function drawBrazier(g, x, cl) {
    const y = 150, since = cl - G.lastBeat, flare = since >= 0 && since < 220 ? 1 - since / 220 : 0;
    PXS.glow(g, x, y - 24, 22 + Math.round(flare * 8), '#ffb050', 0.35 + flare * 0.35);
    g.fillStyle = '#1a1220'; g.fillRect(x - 1, y - 18, 3, 18); g.fillRect(x - 4, y - 1, 9, 2);
    g.fillStyle = '#4a3a4e'; g.fillRect(x, y - 18, 1, 17);
    g.fillStyle = '#1a1220'; g.fillRect(x - 6, y - 22, 13, 4); g.fillRect(x - 5, y - 18, 11, 1);
    g.fillStyle = '#6a5a6e'; g.fillRect(x - 5, y - 22, 11, 1); g.fillStyle = '#3a2e40'; g.fillRect(x - 5, y - 21, 11, 2);
    const fh = 7 + Math.round(flare * 5), tw = Math.floor(cl / 90) % 3;
    const cols = ['#ff5a2a', '#ff9a3a', '#ffd86a', '#fff6c8'];
    for (let i = 0; i < 4; i++) {
      const hh = Math.max(1, fh - i * 2), ww = 9 - i * 2, xx = x - (ww >> 1) + (i === 1 ? (tw - 1) : 0);
      g.fillStyle = cols[i]; g.fillRect(xx, y - 22 - hh, ww, hh);
      g.fillRect(xx + 1 + ((tw + i) % 2), y - 23 - hh, Math.max(1, ww - 3), 1);
    }
    if (flare > 0.3) { g.fillStyle = '#ffe890'; g.fillRect(x - 3 + tw, y - 30 - fh, 1, 1); g.fillRect(x + 2 - tw, y - 33 - fh, 1, 1); }
  }

  /* ---------------- render ---------------- */
  let VW = 256, VX0 = 0, TEXTS = [], CHARS = [];
  const off = document.createElement('canvas'); off.height = H; const g = off.getContext('2d');
  const view = $('game'), vg = view.getContext('2d');
  function pickView() {
    const cssW = $('stage').clientWidth || 800, dpr = window.devicePixelRatio || 1, avail = cssW * dpr;
    return Math.floor(avail / 256) / dpr >= 1.6 ? 256 : 192;   // phones get a closer 192 px window, never < 1.6 CSS px a pixel
  }
  const TX = (group, str, x, y, o) => { const r = PF.draw(g, str, x, y, o); if (r && r.w) TEXTS.push({ group, kind: 'text', text: str, x: r.x, y: r.y, w: r.w, h: r.h }); return r; };
  const PL = (group, x, y, w, h) => TEXTS.push({ group, kind: 'plate', x, y, w, h });
  const ease = MUT === 'jump' ? (a, b, u) => (u > 0 ? b : a) : (a, b, u) => a + (b - a) * (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  // hero strike: draw back (ready) -> swing -> follow-through -> recover, all glided; a miss falls short of the brute
  function heroPose(cl) {
    let p = 'ready', dx = 0, fl = 0;
    const a = G.hero;
    if (a && cl >= a.t && cl - a.t < 450) {
      const d = cl - a.t, L = a.rating === 'miss' ? 3 : 9;
      const w0 = a.dx0 || 0, w1 = Math.max(-2, w0 - 3);   // draw back a little from wherever the last strike left him
      if (d < 60) { p = 'windup'; dx = ease(w0, w1, d / 60); }
      else if (d < 160) { p = 'swing'; dx = ease(w1, L, (d - 60) / 100); }
      else if (d < 300) { p = 'follow'; dx = L; }
      else { p = 'ready'; dx = ease(L, 0, (d - 300) / 150); }
    }
    if (cl >= G.hurtH && cl - G.hurtH < 420) { const d = cl - G.hurtH; p = d < 260 ? 'hurt' : 'ready'; dx = d < 70 ? ease(G.hurtH0 || 0, -5, d / 70) : d < 220 ? -5 : ease(-5, 0, (d - 220) / 200); fl = d < 60 ? 1 : 0; }
    return { p, dx: Math.round(dx), fl };
  }
  // brute: counter = wind-up (300 ms before the beat) -> thrust landing on the beat -> follow-through -> recoil;
  // hurt = lean away and knock-back; a missed swing = a dodge (lean away, a step back)
  function foePose(cl) {
    let p = 'ready', dx = 0, fl = 0;
    const f = G.foe;
    if (f && cl >= f.at - 300 && cl < f.at + 380) {
      const d = cl - (f.at - 300);
      if (d < 220) { p = 'windup'; dx = ease(0, 2, d / 220); }
      else if (d < 300) { p = 'swing'; dx = ease(2, -6, (d - 220) / 80); }
      else if (d < 340) { p = 'swing'; dx = -6; }
      else if (d < 480) { p = 'swing'; dx = -6; }
      else { p = 'ready'; dx = ease(-6, 0, (d - 480) / 200); }
    }
    if (cl >= G.dodge && cl - G.dodge < 420) { const d = cl - G.dodge; p = d < 280 ? 'dodge' : 'ready'; dx = d < 90 ? ease(0, 5, d / 90) : d < 260 ? 5 : ease(5, 0, (d - 260) / 160); }
    if (cl >= G.hurtF && cl - G.hurtF < 380) { const d = cl - G.hurtF; p = d < 240 ? 'hurt' : 'ready'; dx = d < 100 ? ease(G.hurtF0 || 0, 4, d / 100) : d < 200 ? 4 : ease(4, 0, (d - 200) / 180); fl = d < 60 ? 1 : 0; }
    if (G.ko && cl >= G.ko.t) { p = 'down'; dx = 3; fl = cl - G.ko.t < 60 ? 1 : 0; }
    if (cl >= G.rise && cl - G.rise < 60) fl = 1;
    return { p, dx: Math.round(dx), fl };
  }
  function renderScene() {
    TEXTS = []; CHARS = [];
    const cl = beat.clock(), want = pickView();
    if (want !== VW || off.width !== want) { VW = want; off.width = VW; }
    VX0 = Math.round((WW - VW) / 2);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.imageSmoothingEnabled = false;
    g.drawImage(BG, VX0, 0, VW, H, 0, 0, VW, H);
    g.translate(-VX0, 0);
    BRAZ.forEach(x => drawBrazier(g, x, cl));
    // the beat pulse on the floor between the fighters
    const since = cl - G.lastBeat; if (since >= 0 && since < 200) PXS.glow(g, 130, FEET, 30, G.lastDown ? '#ffd84a' : '#9fd8ff', 0.18 * (1 - since / 200));
    // fighters: bob down 1 px on each beat
    const bob = since >= 0 && since < 110 ? 1 : 0;
    const hp = heroPose(cl), fp = foePose(cl);
    const hx = HERO_X + G.hdx, fx = FOE_X + G.fdx;
    const shadow = (x, w) => { g.fillStyle = 'rgba(12,6,20,0.45)'; g.fillRect(Math.round(x - w / 2), FEET - 1, w, 2); g.fillRect(Math.round(x - w / 2) + 2, FEET + 1, w - 4, 1); };
    shadow(hx, 18); shadow(fx, fp.p === 'down' ? 24 : 18);
    const fIm = pose('foe', fp.p), hIm = pose('hero', hp.p), fy = FEET + (fp.p === 'ready' ? bob : 0), hy = FEET + (hp.p === 'ready' ? bob : 0);
    drawFig(g, fIm, fx, fy, fp.fl);
    drawFig(g, hIm, hx, hy, hp.fl);
    const box = (id, im, x, y) => { const b = bbox(im); return { id, x: Math.round(x) + b.x - VX0, y: Math.round(y) + b.y, w: b.w, h: b.h }; };
    CHARS.push(box('hero', hIm, hx, hy), box('foe', fIm, fx, fy));
    // strike effects: a crescent slash across the brute's chest (gold and wide for Perfect, white for Good); a miss is a
    // thin grey arc in the air short of him; the counter's thrust flashes on the hero's chest
    const a = G.hero;
    const arc = (cx, cy, r0, r1, a0, a1, prog, cols) => { for (let r = r0; r <= r1; r++) { const col = cols[Math.min(cols.length - 1, r - r0)]; g.fillStyle = col; for (let an = a0; an <= a0 + (a1 - a0) * prog; an += 0.05) g.fillRect(Math.round(cx + Math.cos(an) * r), Math.round(cy + Math.sin(an) * r), 1, 1); } };
    if (a && cl >= a.t + 90 && cl < a.t + 300) {
      const d = cl - a.t - 90, prog = Math.min(1, d / 50), fade = d < 80 ? 1 : 1 - (d - 80) / 130;
      g.globalAlpha = Math.max(0, fade);
      if (a.rating === 'perfect') { arc(FOE_X - 3, FEET - 19, 11, 14, 2.2, 4.1, prog, ['#ffd84a', '#ffffff', '#fff0a0', '#ffb84a']); if (d < 90) { g.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) { const an = 2.6 + i * 0.35, r = 15 + d * 0.08; g.fillRect(Math.round(FOE_X - 3 + Math.cos(an) * r), Math.round(FEET - 19 + Math.sin(an) * r), 2, 1); } } }
      else if (a.rating === 'good') arc(FOE_X - 3, FEET - 19, 11, 12, 2.3, 3.9, prog, ['#ffffff', '#9fe8ff']);
      else arc(HERO_X + 6, FEET - 19, 9, 9, -0.9, 0.9, prog, ['#8a84a8']);
      g.globalAlpha = 1;
    }
    if (G.foe && cl >= G.foe.at && cl < G.foe.at + 180) {
      const u = (cl - G.foe.at) / 180; g.globalAlpha = 1 - u;
      for (let i = 0; i < 6; i++) { const an = i * 1.05 + 0.4, r = 3 + u * 7; g.fillStyle = i % 2 ? '#ff7a6a' : '#ffffff'; g.fillRect(Math.round(HERO_X - 2 + Math.cos(an) * r), Math.round(FEET - 20 + Math.sin(an) * r), 1, 1); }
      g.globalAlpha = 1;
    }
    if (G.ko && cl >= G.ko.t + 200) {   // K.O.: three small stars circle over the brute's head
      for (let i = 0; i < 3; i++) { const an = cl / 260 + i * 2.09, sx = Math.round(FOE_X + 3 + Math.cos(an) * 7), sy = Math.round(FEET - 33 + Math.sin(an) * 2); g.fillStyle = '#ffe890'; g.fillRect(sx, sy - 1, 1, 3); g.fillRect(sx - 1, sy, 3, 1); }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    // damage number: above the owner's head, one at a time, rises 5 px and fades
    const N = G.number;
    if (N && cl >= N.t && cl - N.t < 380 && !beat.busy()) {
      const u = (cl - N.t) / 380, ox = (N.who === 'foe' ? FOE_X : HERO_X) - VX0;
      g.globalAlpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      TX('number', N.text, ox, FEET - 44 - Math.round(u * 5), { align: 'center', baseline: 'bottom', scale: 1, color: N.col, shadow: 'outline' });
      g.globalAlpha = 1;
    }
    // HUD plates: hero left, brute right; the music badge between them
    const pw = VW >= 256 ? 92 : 76;
    hud(4, 'HERO', G.heroBar / HERO_MAX, G.heroHp, '#5ad86a', pw, 'hud-hero', false);
    hud(VW - 4 - pw, 'BRUTE', G.foeBar / FOE_MAX, G.foeHp, '#e84a3a', pw, 'hud-foe', true);
    if (source === 'music') { const r = music.draw(g, Math.round(VW / 2 - 11), 7); if (r) PL('badge', r.x, r.y, r.w, r.h); }
    else { // click track: a metronome lamp in the badge slot
      const bx = Math.round(VW / 2 - 11), lit = since >= 0 && since < 120;
      g.fillStyle = 'rgba(12,8,24,0.78)'; g.fillRect(bx + 1, 7, 21, 11); g.fillRect(bx, 8, 23, 9);
      g.fillStyle = lit ? (G.lastDown ? '#ffd84a' : '#9fe8ff') : '#4a4478'; g.fillRect(bx + 4, 10, 5, 5); g.fillStyle = '#c8c4ec'; g.fillRect(bx + 12, 10, 1, 5); g.fillRect(bx + 14, 11, 1, 4); g.fillRect(bx + 16, 12, 1, 3); g.fillRect(bx + 18, 13, 1, 2);
      PL('badge', bx, 7, 23, 11);
    }
    // banners in the sky band (one at a time; fade in, hold, fade out)
    for (const b of G.banners) {
      if (cl < b.t0 || cl >= b.t1) continue;
      const a2 = Math.min(1, (cl - b.t0) / 120, (b.t1 - cl) / 250);
      g.globalAlpha = Math.max(0, a2);
      const sz = PF.size(b.text, { scale: 2 }), bw = sz.w + 16, bx = Math.round(VW / 2 - bw / 2), by = MUT === 'cover' ? FEET - 30 : 44;
      g.fillStyle = 'rgba(10,6,24,0.72)'; g.fillRect(bx, by, bw, 22); g.fillStyle = b.col; g.fillRect(bx, by, bw, 1); g.fillRect(bx, by + 21, bw, 1);
      PL('banner', bx, by, bw, 22);
      TX('banner', b.text, VW / 2, by + 11, { align: 'center', baseline: 'middle', scale: 2, color: b.col, shadow: 'outline' });
      g.globalAlpha = 1;
    }
    // the element: the beat track under the fighters' feet, and the calibration window over the sky
    const laneR = { x: 8, y: LANE_Y, w: VW - 16, h: 22 };
    const calR = { x: Math.round((VW - Math.min(VW - 8, 188)) / 2), y: MUT === 'cover' ? 70 : 26, w: Math.min(VW - 8, 188), h: 92 };
    const drawn = beat.draw(g, laneR, { calRect: calR, bounds: { x: 0, y: 0, w: VW, h: H } });
    (drawn || []).forEach(r => TEXTS.push({ group: r.kind === 'calib' ? 'calib' : 'lane', kind: r.kind === 'label' ? 'text' : 'plate', x: r.x, y: r.y, w: r.w, h: r.h }));
    // integer scale to the display canvas (device pixels)
    const dpr = window.devicePixelRatio || 1, avail = Math.max(VW, Math.floor(($('stage').clientWidth || VW) * dpr)), k = Math.max(1, Math.floor(avail / VW));
    if (view.width !== VW * k || view.height !== H * k) { view.width = VW * k; view.height = H * k; view.style.width = (VW * k / dpr) + 'px'; view.style.height = (H * k / dpr) + 'px'; }
    vg.imageSmoothingEnabled = false; vg.drawImage(off, 0, 0, VW, H, 0, 0, VW * k, H * k);
  }
  function hud(x, name, frac, hp, col, w, group, right) {
    const y = 4, h = 19;
    g.fillStyle = 'rgba(10,6,24,0.82)'; g.fillRect(x + 1, y, w - 2, h); g.fillRect(x, y + 1, w, h - 2);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 1, y, w - 2, 1);
    g.fillStyle = '#3a3466'; g.fillRect(x + 1, y + h - 1, w - 2, 1);
    PL(group, x, y, w, h);
    TX(group, name, x + 5, y + 3, { scale: 1, color: '#ffffff', shadow: 'drop' });
    TX(group, String(Math.round(hp)), x + w - 5, y + 3, { align: 'right', scale: 1, color: '#d8d2f8', shadow: 'drop' });
    const bx = x + 5, bw = w - 10, by = y + 13;
    g.fillStyle = '#05030c'; g.fillRect(bx - 1, by - 1, bw + 2, 5); g.fillStyle = '#2a2440'; g.fillRect(bx, by, bw, 3);
    const fw = Math.round(bw * Math.max(0, Math.min(1, frac)));
    g.fillStyle = col; g.fillRect(right ? bx + bw - fw : bx, by, fw, 3); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(right ? bx + bw - fw : bx, by, fw, 1);
  }

  /* ---------------- side panels ---------------- */
  const chart = $('chart'), cg = chart.getContext('2d');
  function drawChart() {
    if (!chartDirty) return; chartDirty = false;
    const dpr = window.devicePixelRatio || 1, w = Math.max(10, Math.round(chart.clientWidth * dpr)), h = Math.max(10, Math.round(chart.clientHeight * dpr));
    if (chart.width !== w || chart.height !== h) { chart.width = w; chart.height = h; }
    const p = beat.params(), R = 160, pad = 34 * dpr, mid = h / 2, sy = (h / 2 - 14 * dpr) / R, X = i => pad + (w - pad - 10 * dpr) * (i + 0.5) / 40;
    cg.clearRect(0, 0, w, h);
    cg.fillStyle = 'rgba(94,230,255,0.10)'; cg.fillRect(pad, mid - p.good * sy, w - pad - 6 * dpr, 2 * p.good * sy);
    cg.fillStyle = 'rgba(255,216,74,0.14)'; cg.fillRect(pad, mid - p.perfect * sy, w - pad - 6 * dpr, 2 * p.perfect * sy);
    cg.fillStyle = '#ffffff55'; cg.fillRect(pad, mid, w - pad - 6 * dpr, Math.max(1, dpr));
    cg.font = `${11 * dpr}px ui-monospace, Menlo, monospace`; cg.textAlign = 'right'; cg.textBaseline = 'middle'; cg.fillStyle = '#a39cc0';
    [[150, '+150'], [p.good, '+' + p.good], [0, '0'], [-p.good, '-' + p.good], [-150, '-150']].forEach(([v, s]) => cg.fillText(s, pad - 6 * dpr, mid - v * sy));
    cg.textAlign = 'left'; cg.fillStyle = '#a39cc0'; cg.fillText('late', pad + 4 * dpr, 9 * dpr); cg.fillText('early', pad + 4 * dpr, h - 9 * dpr);
    const C = { perfect: '#ffd84a', good: '#5ee6ff', miss: '#ff5a6a' };
    G.presses.forEach((q, i) => {
      if (q.d == null) return;
      const y = mid - Math.max(-R, Math.min(R, q.d)) * sy, x = X(i + (40 - G.presses.length));
      cg.fillStyle = C[q.rating]; cg.beginPath(); cg.arc(x, y, 4 * dpr, 0, Math.PI * 2); cg.fill();
      cg.strokeStyle = '#08070f'; cg.lineWidth = 1.5 * dpr; cg.stroke();
    });
    if (p.offset) { const y = mid - Math.max(-R, Math.min(R, p.offset)) * sy; cg.setLineDash([5 * dpr, 4 * dpr]); cg.strokeStyle = '#ffd84a99'; cg.lineWidth = dpr; cg.beginPath(); cg.moveTo(pad, y); cg.lineTo(w - 6 * dpr, y); cg.stroke(); cg.setLineDash([]); }
  }
  function updatePanels() {
    const st = beat.state(); if (!st) return;
    $('sPerfect').textContent = st.counts.perfect; $('sGood').textContent = st.counts.good; $('sMiss').textContent = st.counts.miss; $('sCombo').textContent = st.combo;
    const ds = G.presses.filter(q => q.d != null && q.rating !== 'miss').map(q => q.d), mean = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
    $('sMean').textContent = mean == null ? '-' : (mean > 0 ? '+' : '') + Math.round(mean);
    $('offVal').textContent = (st.offset > 0 ? '+' : '') + Math.round(st.offset) + ' ms'; $('latVal').textContent = Math.round(st.latency) + ' ms';
    const unlocked = source === 'music' ? music.isUnlocked() : beat.isUnlocked() && beat.stats().context === 'running';
    const muted = source === 'music' ? music.params().mute : st.muted;
    const pill = $('soundState');
    pill.className = !unlocked ? '' : muted ? 'muted' : 'on';
    const txt = !unlocked ? 'Sound off: click anywhere to turn it on' : muted ? 'Muted: click to unmute' : source === 'music' ? 'Sound on: chip music' : 'Sound on: click track';
    if ($('soundText').textContent !== txt) $('soundText').textContent = txt;
    const mb = $('muteBtn'), ml = muted ? 'Unmute' : 'Mute'; if (mb.textContent !== ml) { mb.textContent = ml; mb.setAttribute('aria-pressed', muted ? 'true' : 'false'); }
    const cb = $('calBtn'), busy = beat.busy(); cb.textContent = busy ? 'Calibrating...' : 'Calibrate'; cb.disabled = busy;
    $('modeText').textContent = G.mode === 'demo' ? 'Demo play (late by ~70 ms until calibrated)' : 'You play';
    [...$('mode').children].forEach(b => { const on = b.dataset.m === G.mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    [...$('source').children].forEach(b => { const on = b.dataset.s === source; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    $('c-bpm').disabled = source === 'music';
    if (logDirty) {
      logDirty = false;
      $('log').innerHTML = LOG.slice(-7).reverse().map(e => `<li><span class="t">${(e.t / 1000).toFixed(1)}s</span><span class="p">${e.text}</span><span class="pill ${e.kind}">${e.kind === 'cal' ? 'calib' : e.kind}</span></li>`).join('');
      const lastE = LOG[LOG.length - 1]; if (lastE && G.mode === 'you') $('live').textContent = lastE.text;
    }
    drawChart();
  }

  /* ---------------- input ---------------- */
  const isField = el => el && (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.getAttribute && el.getAttribute('role') === 'button');
  function youPlay() { if (G.mode !== 'you') { G.mode = 'you'; G.auto = []; G.calTap = []; G.calOk = null; logPush({ kind: 'cal', text: 'You play: the demo player stops' }); } }
  addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = e.key;
    if (beat.busy()) {   // the calibration window owns the keys while open, wherever the focus is
      const m = { z: 'confirm', Z: 'confirm', ' ': 'confirm', Enter: 'confirm', j: 'confirm', x: 'back', X: 'back', Escape: 'back', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[k];
      if (m) { e.preventDefault(); youPlay(); beat.key(m, e); }
      return;
    }
    if (isField(document.activeElement) && document.activeElement !== view) return;
    if (k === 'z' || k === 'Z' || k === ' ' || k === 'Enter' || k === 'j' || k === 'J') { e.preventDefault(); youPlay(); beat.press(e); }
  });
  view.addEventListener('pointerdown', e => {
    e.preventDefault();
    const r = view.getBoundingClientRect(), x = (e.clientX - r.left) * VW / r.width, y = (e.clientY - r.top) * H / r.height;
    if (source === 'music' && music.hit(x, y)) return;
    youPlay();
    if (beat.busy()) beat.pointer(x, y, e); else beat.press(e);
  });
  $('mode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; G.mode = b.dataset.m; G.auto = []; G.calTap = []; G.calOk = null; });
  $('source').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.s === source) return;
    source = b.dataset.s; makeBeat();
    if (source === 'click') { music.stop({ fade: 200 }); $('srcNote').textContent = 'The module’s own beat clock and click track (a woodblock tick, higher on the downbeat). The tempo slider changes it on the next beat.'; }
    else { music.play('battle', { at: 'now' }); $('srcNote').textContent = 'The beats come from the music’s own schedule: tempo, track switches and the victory jingle (no beats while it plays; the loop comes back on a beat).'; }
    G.ko = null; G.auto = []; logPush({ kind: 'cal', text: source === 'music' ? 'Beats from the chip-music battle loop' : 'Beats from the click track' });
  });
  const toggleSound = () => { if (MUT === 'pill') { if (source === 'music') music.mute(); else beat.mute(); return; } if (source === 'music') music.toggle(); else beat.toggle(); };
  $('soundState').addEventListener('click', toggleSound);
  $('soundState').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSound(); } });
  $('muteBtn').addEventListener('click', toggleSound);
  $('calBtn').addEventListener('click', () => { if (!beat.busy()) { G.mode = G.mode === 'demo' ? 'you' : G.mode; G.auto = []; beat.calibrate(); logPush({ kind: 'cal', text: 'Calibration opened' }); view.focus(); } });
  $('offReset').addEventListener('click', () => { beat.setParams({ offset: 0 }); chartDirty = true; logPush({ kind: 'cal', text: 'Offset reset to 0 ms' }); });
  $('expectBtn').addEventListener('click', () => { const on = !beat.params().expect; beat.setParams({ expect: on }); $('expectBtn').textContent = on ? 'Unpressed beats: miss' : 'Unpressed beats: ignored'; $('expectBtn').setAttribute('aria-pressed', on ? 'true' : 'false'); });
  [['perfect', v => v + ' ms'], ['good', v => v + ' ms'], ['volume', v => (+v).toFixed(2)], ['bpm', v => String(v)]].forEach(([key, f]) => {
    const el = $('c-' + key); el.value = key === 'volume' ? P0.volume : P0[key];
    $('o-' + key).textContent = f(el.value);
    el.addEventListener('input', () => {
      const v = +el.value; $('o-' + key).textContent = f(v);
      if (key === 'volume') { beat.volume(v); music.volume(v); }
      else { beat.setParams({ [key]: v }); P0[key] = v; chartDirty = true; }
    });
  });

  /* ---------------- test hooks ---------------- */
  window.__state = () => {
    const cl = beat.clock(), hp = heroPose(cl), fp = foePose(cl), st = beat.state();
    return { t: Math.round(simT), clock: Math.round(cl), k: G.k, source, mode: G.mode, view: VW,
      actors: [
        { id: 'hero', x: HERO_X + G.hdx, y: FEET, facing: 'right', target: 'foe', pose: hp.p, flash: !!hp.fl },
        { id: 'foe', x: FOE_X + G.fdx, y: FEET, facing: MUT === 'face' ? 'right' : 'left', target: 'hero', pose: fp.p, flash: !!fp.fl }
      ],
      hp: { hero: G.heroHp, foe: G.foeHp }, ko: !!G.ko,
      beat: { bpm: st.bpm, bar: st.bar, beat: st.beat, offset: st.offset, combo: st.combo, counts: st.counts, last: st.last && { rating: st.last.rating, delta: st.last.delta }, calibrating: st.calibrating, gap: st.gap, locked: st.locked },
      music: source === 'music' ? (s => ({ phase: s.phase, track: s.track }))(music.state()) : null,
      events: LOG.slice(-4).map(e => e.kind + ':' + e.text) };
  };
  // frame by frame from the current moment: every text and plate against the fighters, each other and the view edge
  window.__scan = (ms, every) => {
    const out = [], ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    let frames = 0, prevX = null, maxStep = 0; every = every || 1;
    for (let n = 0; n * STEP < ms; n++) {
      step();
      const xs = window.__state().actors.map(a => a.x);   // fighters glide: never more than 3 px between two frames
      if (prevX) xs.forEach((x, i) => { const d = Math.abs(x - prevX[i]); maxStep = Math.max(maxStep, d); if (d > 3) out.push({ t: Math.round(simT), item: 'fighter ' + i, hits: 'moved ' + d + ' px in one frame' }); });
      prevX = xs;
      if (n % every) continue;
      renderScene(); frames++;
      const t = Math.round(simT);
      TEXTS.forEach((r, i) => {
        CHARS.forEach(c => { if (ov(r, c)) out.push({ t, item: r.group + ':' + (r.text || r.kind), hits: c.id }); });
        TEXTS.forEach((q, j) => { if (j > i && q.group !== r.group && ov(r, q)) out.push({ t, item: r.group + ':' + (r.text || r.kind), hits: q.group + ':' + (q.text || q.kind) }); });
        if (r.x < 0 || r.y < 0 || r.x + r.w > VW || r.y + r.h > H) out.push({ t, item: r.group + ':' + (r.text || r.kind), hits: 'view edge' });
      });
    }
    return { frames, view: VW, maxStep, problems: out.slice(0, 30), count: out.length };
  };
  window.__frame = () => ({ texts: TEXTS.slice(), chars: CHARS.slice(), view: VW });
  window.__demo = { G, beat: () => beat, music, step, render: () => { renderScene(); updatePanels(); } };

  /* ---------------- boot ---------------- */
  makeBeat();
  if (FREEZE_T != null) {
    for (let n = Math.floor(FREEZE_T / STEP); n > 0; n--) step();
    renderScene(); updatePanels();
    if (FROZEN) { window.__frozen = true; return; }
  } else { renderScene(); updatePanels(); }
  let acc = 0, prev = null;
  function frame(now) {
    if (prev === null) prev = now;
    acc += Math.min(250, now - prev); prev = now;
    while (acc >= STEP) { step(); acc -= STEP; }
    renderScene(); updatePanels();
    requestAnimationFrame(frame);
  }
  addEventListener('resize', () => { chartDirty = true; });
  requestAnimationFrame(frame);
})();
