/* F-05 adaptive-music demo: a short top-down adventure that only REPORTS its state to the module each step
 * (active, combat, boss, hp), a timeline drawn from the module's own plan (what the game says, what the music commits
 * to and when it lands, the four layers with their notes and gains), layer cards, manual driving and the rules.
 * One clock: the scene and the music advance by the same fixed step (the music follows the audio clock once sound
 * runs), so ?t=<ms>&freeze=1 stills are the live play at that time. Scenery: pixel-kit (GameDNA_PixelScene). */
(() => {
  'use strict';
  const CM = window.GameDNA_ChipMusic, AM = window.GameDNA_AdaptiveMusic, PXS = window.GameDNA_PixelScene;
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const num = (v, d) => v == null || v === '' || !isFinite(+v) ? d : +v;
  const FREEZE_T = qs.has('t') ? Math.max(0, num(qs.get('t'), 0)) : null, FROZEN = FREEZE_T != null && qs.get('freeze') === '1';
  const STEP = 1000 / 60, TS = 16, CYC = 44000, MAPW = 40 * TS, MAPH = 9 * TS, W = 256, H = 144;
  const LCOL = { lead: '#5ee6ff', danger: '#ff6b8a', base: '#ffc44d', perc: '#d9d4f0' };
  const MCOL = { explore: '#5fd39a', combat: '#ff9450', boss: '#b98cff' }, LOWC = '#ff5d73', STC = '#ffd166', GAMEC = '#ff8fc8';
  const LNAME = { lead: 'Lead', danger: 'Danger', base: 'Base', perc: 'Drums' }, LCH = { lead: 'Pulse 1', danger: 'Pulse 2', base: 'Triangle', perc: 'Noise' };
  const ORDER = ['lead', 'danger', 'base', 'perc'], CHOF = AM.channelOf;
  const lerp = (a, b, u) => a + (b - a) * Math.max(0, Math.min(1, u));
  const sm = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

  /* ---------------- music: chip music + adaptive layers ---------------- */
  const LOG = []; let logDirty = true;
  const pushLog = (t, text, kind) => { LOG.push({ t, text, kind }); if (LOG.length > 40) LOG.shift(); logDirty = true; };
  const music = CM.create({ params: { volume: num(qs.get('volume'), 0.7) }, onEvent: ev => {
    if (ev.type === 'jingle' && !ev.track.startsWith('am-')) pushLog(ev.t, 'The game plays its own ' + titleOf(ev.track) + ' jingle: all four channels open', 'game');
  } });
  const P0 = { quantize: qs.get('quantize') === 'beat' ? 'beat' : 'bar', stingers: qs.get('stingers') !== 'off', enterMs: num(qs.get('enterMs'), 500), exitMs: num(qs.get('exitMs'), 3000), fade: num(qs.get('fade'), 2), release: num(qs.get('release'), 4) };
  const adaptive = AM.create({ music, params: P0, onEvent: ev => {
    if (ev.type === 'ignored') pushLog(ev.t, cap(nameOf(ev.what)) + ' for ' + (ev.heldMs / 1000).toFixed(1) + ' s: too short, ignored', 'ignored');
    else if (ev.type === 'conflict') pushLog(ev.t, 'The game asked for ' + titleOf(ev.track) + ' during gameplay', 'conflict');
    else if (ev.type === 'commit' && ev.reason !== 'start') pushLog(ev.t, describeCommit(ev), 'commit');
  } });
  const SONGS = {}; music.songs().forEach(s => { SONGS[s.name] = music.song(s.name); });
  function titleOf(track) { const c = SONGS[track] || music.song(track); return c ? c.title : track; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function nameOf(w) { return w === 'low' ? 'low HP' : w === 'not-low' ? 'HP recovered' : w === 'boss' ? 'boss fight' : w; }
  function moodName(m, low) { return (m === 'boss' ? 'boss fight' : m) + (low ? ' + low HP' : ''); }
  function describeCommit(ev) {
    const [mood, low] = ev.to.split('+');
    const lands = adaptive.plan().find(t => t.id === ev.id);
    const held = lands && lands.heldMs != null ? ' (held ' + (lands.heldMs / 1000).toFixed(1) + ' s)' : '';
    if (ev.reason === 'after-jingle') return cap(moodName(mood, !!low)) + held + ': ' + titleOf(ev.track) + ' starts when the jingle ends';
    return cap(moodName(mood, !!low)) + ' confirmed' + held + ': lands on the next ' + adaptive.params().quantize + ' line';
  }
  // pitch range per chip channel over every track the demo plays, so the lanes never rescale
  const RANGE = {};
  ['p1', 'p2', 'tri'].forEach(ch => { let lo = 127, hi = 0; Object.keys(SONGS).filter(k => k.startsWith('am-') || k === 'victory').forEach(k => SONGS[k].ev[ch].forEach(e => { if (e.k === 'note') { lo = Math.min(lo, e.midi); hi = Math.max(hi, e.midi, e.fx.slide || 0); } })); RANGE[ch] = { lo: lo - 1, hi: hi + 1 }; });
  const DRUM_ROW = { c: 0, o: 1, h: 2, s: 3, k: 4 }, DRUM_LEN = { k: 130, s: 160, h: 60, o: 220, c: 620 };

  /* ---------------- the story: a pure function of the scene time ---------------- */
  const PATH_Y = 4 * TS + 13, BUSH = { x: 11 * TS + 8, y: 3 * TS + 13 }, SPRING_X = 262, WARDEN_X = 548;
  const LEGS = [[600, 6600, 24, 150], [15000, 18400, 150, SPRING_X], [19500, 25500, SPRING_X, 470], [27400, 28200, 470, 512], [38800, 43600, 512, 690]];
  const HITS = [[8200, -1, 's1'], [9400, -1, 's1'], [10400, -1, 's2'], [11000, -1, 's2'], [18600, 5, 'heal'], [29400, -2, 'warden'], [31000, -2, 'warden'], [35000, 5, 'level']];
  const ATK = { s1: [7600, 8800, 9600], s2: [11800, 12800, 13600], warden: [28700, 29900, 30300, 31700, 32500, 33300, 34100, 34800] };
  const DIE = { s1: 9600, s2: 13600, warden: 35000 }, SLAMS = [29400, 31000], RISE = [26000, 27800], VICTORY = 35000;
  const PEEKS = [[3200, 3500], [3700, 3950]];
  const RAIL = [
    { label: 'Explore', mus: 'base + lead', from: 0 },
    { label: 'Flicker', mus: 'ignored, too short', from: 3200, ig: true },
    { label: 'Slimes', mus: 'drums on the bar', from: 7000 },
    { label: 'Low HP', mus: 'danger layer', from: 11000 },
    { label: 'All clear', mus: 'drums out after 3 s', from: 14000 },
    { label: 'Healed', mus: 'danger out', from: 18600 },
    { label: 'Warden', mus: 'boss track', from: 26000 },
    { label: 'Low HP', mus: 'danger layer', from: 31000 },
    { label: 'Victory', mus: 'the game’s jingle', from: 35000 },
    { label: 'Trail', mus: 'explore again', from: 38640 }
  ];
  function heartsAt(tc) { let h = 5; for (const [t, d] of HITS) if (tc >= t) h = d === 5 ? 5 : Math.max(0, h + d); return h; }
  function reportAt(tc) {
    const r = { active: true, hp: heartsAt(tc) / 5 };
    if (PEEKS.some(([a, b]) => tc >= a && tc < b) || (tc >= 7000 && tc < 14000)) r.combat = true;
    if (tc >= 26000 && tc < 35000) r.boss = true;
    return r;
  }
  function bump(tc, at, amp, half) { const u = (tc - (at - half)) / (2 * half); return u > 0 && u < 1 ? amp * Math.sin(Math.PI * u) : 0; }
  function heroAt(tc) {
    let x = 24, dist = 0, moving = false;
    for (const [t0, t1, x0, x1] of LEGS) {
      if (tc >= t1) { x = x1; dist += Math.abs(x1 - x0); continue; }
      if (tc >= t0) { x = lerp(x0, x1, (tc - t0) / (t1 - t0)); dist += Math.abs(x - x0); moving = true; }
      break;
    }
    let dir = 'right', target = null, hop = 0, hurt = null, lunge = 0, strike = null, raise = false;
    if (tc >= 7000 && tc < 14000) target = tc < DIE.s1 + 200 ? 's1' : 's2';
    if (tc >= 28200 && tc < VICTORY) target = 'warden';
    // a strike: wind-up (sword raised behind), swing (blade level, the foe is hit at its middle), follow-through
    for (const k of ['s1', 's2', 'warden']) for (const a of ATK[k]) { const u = (tc - (a - 150)) / 300; if (u >= 0 && u < 1) { lunge = bump(tc, a, k === 'warden' ? 10 : 7, 150); strike = { phase: u < 0.35 ? 'wind' : u < 0.6 ? 'swing' : 'follow', u, who: k }; } }
    // hurt: two frames of white flash, then opaque red blinks; the hero never turns see-through
    for (const [t, d] of HITS) if (d < 0) { const k = tc - t; if (k >= 0 && k < 600) { hurt = k < 70 ? 'flash' : Math.floor(k / 60) % 2 === 0 ? 'tint' : null; lunge -= Math.round(4 * Math.max(0, 1 - k / 200)); strike = null; } }
    if (tc >= 18400 && tc < 19500) dir = 'down';                          // at the spring, facing the water
    if (tc >= VICTORY + 200 && tc < 38800) { dir = 'down'; raise = tc < 37800; for (const h0 of [VICTORY + 400, VICTORY + 1000]) { const u = (tc - h0) / 420; if (u > 0 && u < 1) hop = Math.round(6 * Math.sin(Math.PI * u)); } }
    if (tc < 600) dir = 'right';
    return { x: Math.round(x + lunge), y: PATH_Y, dir, moving, frame: moving ? Math.floor(dist / 4) % 4 : 1, hop, target, hurt, strike, raise, vx: moving ? 1 : 0 };
  }
  function slimeAt(id, tc) {
    const born = id === 's1' ? 6600 : 6700, die = DIE[id];
    if (tc < born || tc >= die + 320) return null;
    const pts = id === 's1' ? [[204, 46], [190, 62], [176, PATH_Y]] : [[226, 46], [210, 62], [198, PATH_Y]];
    let x, y, hop = 0, frame = Math.floor(tc / 260) % 2, flash = 0, pips = 3, dying = 0;
    const hopT = 200, k = Math.min(2, Math.floor((tc - born) / hopT));
    if (tc < born + 2 * hopT) { const i = Math.min(1, k), u = Math.min(1, (tc - born - i * hopT) / hopT); x = lerp(pts[i][0], pts[i + 1][0], u); y = lerp(pts[i][1], pts[i + 1][1], u); hop = Math.round(7 * Math.sin(Math.PI * u)); frame = u > 0.8 ? 1 : 0; }
    else { x = pts[2][0]; y = PATH_Y; }
    if (id === 's2' && tc >= 9900) { const u = (tc - 9900) / 350; x = lerp(198, 176, u); if (u < 1) hop = Math.round(5 * Math.sin(Math.PI * Math.min(1, u * 2) )); }
    for (const [t, d, who] of HITS) if (who === id) x -= bump(tc, t, 6, 130);
    for (const a of ATK[id]) { if (tc >= a) pips--; const d = tc - a; if (d >= 0 && d < 260) { x += Math.round(5 * (1 - d / 260)); if (d < 120) flash = 1; } }
    if (tc >= die) dying = (tc - die) / 320;
    return { id, x: Math.round(x), y: Math.round(y), hop, frame, flash, pips: Math.max(0, pips), dying };
  }
  function peekAt(tc) {
    for (const [a, b] of PEEKS) if (tc >= a - 120 && tc < b + 120) { const up = Math.min(1, (tc - (a - 120)) / 120, (b + 120 - tc) / 120); const ct = PEEK_BUSH.crown; return { x: PEEK_BUSH.x, y: ct + 1, top: ct + 1 - Math.round(7 * up), rise: Math.round(7 * up), frame: Math.floor(tc / 200) % 2 }; }
    return null;
  }
  function wardenAt(tc) {
    if (tc < RISE[0] || tc >= DIE.warden + 900) return null;
    const rise = tc < RISE[1] ? sm((tc - RISE[0]) / (RISE[1] - RISE[0])) : 1;
    let hop = 0, flash = 0, pips = 8, frame = Math.floor(tc / 500) % 2;
    for (const s of SLAMS) { const u = (tc - (s - 400)) / 400; if (u > 0 && u < 1) hop = Math.round(10 * Math.sin(Math.PI * u)); }
    for (const a of ATK.warden) { if (tc >= a) pips--; const d = tc - a; if (d >= 0 && d < 80) flash = 1; }
    const dying = tc >= DIE.warden ? (tc - DIE.warden) / 900 : 0;
    return { x: WARDEN_X, y: PATH_Y, rise, hop, flash, pips: Math.max(0, pips), frame, dying };
  }
  function railAt(tc) { let r = RAIL[0]; for (const s of RAIL) if (tc >= s.from) r = s; return r; }

  /* ---------------- manual driving ---------------- */
  let mode = qs.get('mode') === 'drive' ? 'drive' : 'scene';
  const man = { combat: false, boss: false, hp: 5, flick: [] };
  function manualReport(simMs) {
    let combat = man.combat;
    for (const [a, b] of man.flick) if (simMs >= a && simMs < b) combat = !man.combat;
    return { active: true, combat, boss: man.boss, hp: man.hp / 5 };
  }

  /* ---------------- clock + drive ---------------- */
  let simT = 0, sceneT = 0, lastRep = reportAt(0), lastTc = -1;
  const HIST = [];   // [{t (music clock), mood, low}] what the game reported, for the timeline
  adaptive.update(lastRep);
  function step() {
    music.update(STEP);
    simT += STEP;
    let rep;
    if (mode === 'scene') {
      const prev = lastTc; sceneT += STEP; const tc = sceneT % CYC; lastTc = tc;
      if (prev >= 0 && prev < VICTORY && tc >= VICTORY) music.jingle('victory');   // the game's own jingle, at the step the boss falls
      rep = reportAt(tc);
    } else rep = manualReport(simT);
    lastRep = rep;
    adaptive.update(rep);
    const st = adaptive.state();
    HIST.push({ t: st.t, mood: rep.boss ? 'boss' : rep.combat ? 'combat' : 'explore', low: st.raw.low });
    while (HIST.length > 1200) HIST.shift();
    landed(st);
  }
  let lastLanded = 0;
  function landed(st) {   // log the moment a committed change reaches its bar line
    for (const tr of adaptive.plan()) {
      if (tr.id <= lastLanded || tr.at > st.t + 0.5) continue;
      lastLanded = tr.id;
      if (tr.reason === 'start') continue;
      const L = st.loop, where = L ? 'bar ' + L.bar + (adaptive.params().quantize === 'beat' ? ' beat ' + L.beat : '') : 'the jingle end';
      const bits = [];
      ORDER.forEach(k => { const a = tr.fromGains[k], b = tr.toGains[k]; if (b > a + 0.2) bits.push(LNAME[k].toLowerCase() + ' in'); else if (b < a - 0.2) bits.push(LNAME[k].toLowerCase() + (b > 0 ? ' down' : ' out')); });
      if (tr.track) bits.push(titleOf(tr.track));
      if (tr.stinger) bits.push(titleOf(tr.stinger) + ' stinger');
      pushLog(tr.at, cap(where) + ': ' + (bits.join(', ') || 'mix changes'), tr.stinger ? 'stinger' : 'lands');
    }
  }

  /* ---------------- art ---------------- */
  const OLN = '#1a1024';
  function mkc(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function outline(c, col) {
    const g = c.getContext('2d'), w = c.width, h = c.height, d = g.getImageData(0, 0, w, h).data, add = [];
    const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!op(x, y) && (op(x + 1, y) || op(x - 1, y) || op(x, y + 1) || op(x, y - 1))) add.push([x, y]);
    g.fillStyle = col; add.forEach(([x, y]) => g.fillRect(x, y, 1, 1));
    return c;
  }
  const SPAL = { l: '#c8ecff', g: '#5aa8f0', G: '#2e6cc4' };   // blue slimes: they read against the grass
  const SLIME = [PXS.strArt(['....oooo....', '..oolllloo..', '.olllgggllo.', '.ollgggggGo.', 'olgwkggwkgGo', 'olgkkggkkgGo', 'oggggggggGGo', 'oGgggggggGGo', '.oGGGGGGGGo.', '..oooooooo..'], SPAL),
    PXS.strArt(['............', '....oooo....', '..oolllloo..', '.ollgggggGo.', 'olgwkggwkgGo', 'olgkkggkkgGo', 'oggggggggGGo', 'oGgggggggGGo', 'ooGGGGGGGGoo', '.oooooooooo.'], SPAL)];
  // the hero: pixel-kit actor palette, side view with a 4-frame walk (contact, pass, contact, pass) and arm swing;
  // up / down frames come from the kit. Native facing right; left is the mirror (no gear, light from the top).
  const HPAL = { h: '#b8642c', H: '#7a3c1c', s: '#f8c8a0', S: '#d09068', e: '#2a1428', c: '#3c72e4', C: '#98c4ff', 1: '#2442a4', b: '#5c3420', y: '#ffe070', 2: '#5c3420', 3: '#3a2014' };
  const HEAD = ['....oooooo....', '...ohhhhhho...', '..ohhhhHhhho..', '..oHhhhhhhho..', '..oHHhhsssso..', '..oHHhssesso..', '..oHHhsssSo...', '...oHHssSSo...'];
  const BODY = { mid: ['...oo1cc1oo...', '..o11cCc11o...', '..o1cCcc11o...', '..o1bsbbb1o...', '...oc1c11o....'],
    fwd: ['...oo1cc1oo...', '..o11ccCc1o...', '..o1cccCCso...', '..o1bbbbb1o...', '...oc1c11o....'],
    back: ['...oo1cc1oo...', '..o1Ccc111o...', '.osCccc111o...', '..o1bbbbb1o...', '...oc1c11o....'] };
  const LEG = { pass: ['...o2o22o.....', '...o3o33o.....', '...oooooo.....'], a: ['..o2oo22o.....', '..o3o.o33o....', '..ooo.oooo....'], b: ['..o22o.o2o....', '..o33o.o3o....', '..oooo.ooo....'] };
  const flipC = c => { const o = mkc(c.width, c.height), x = o.getContext('2d'); x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(c, 0, 0); return o; };
  const WALK = [['fwd', 'a'], ['mid', 'pass'], ['back', 'b'], ['mid', 'pass']].map(([bd, lg]) => { const c = PXS.strArt(HEAD.concat(BODY[bd], LEG[lg]), HPAL); return { right: c, left: flipC(c) }; });
  const HERO_FACING = 'right';
  // the warden: a frontal stone guardian (symmetric, looks at the viewer), shaded lobes lit from the top left, moss on
  // its shoulders and crown, two glowing eyes and a rune on the chest
  const WARDEN = [0, 1].map(fr => {
    const w = 32, h = 32, c = mkc(w, h), g = c.getContext('2d');
    const ramp = ['#2e2638', '#463a4a', '#5e4e58', '#7a6a6c', '#98887e', '#bcae98'], moss = ['#1c4a2e', '#2a6632', '#3c8438', '#58a444', '#84c656'];
    const dy = fr;   // breathing: arms and shoulders sink 1 px on frame 1
    const lobes = [[10, 27.5, 4.4], [22, 27.5, 4.4], [16, 19, 9.2, 1.05], [5.5, 20 + dy, 3.9, 0.62], [26.5, 20 + dy, 3.9, 0.62], [7, 12.5 + dy, 5.4], [25, 12.5 + dy, 5.4], [16, 8, 6.3, 1.1]];
    const hsh = (x, y) => PXS.hash(x, y, 77);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let best = -1, bs = -1e9;
      lobes.forEach((L, i) => { const d = Math.hypot(x + 0.5 - L[0], (y + 0.5 - L[1]) * (L[3] || 1)); if (d <= L[2]) { const sc = (L[2] - d) + L[1] * 0.45 + (i === 7 ? 6 : 0); if (sc > bs) { bs = sc; best = i; } } });
      if (best < 0) continue;
      const B = lobes[best], nx = (x + 0.5 - B[0]) / B[2], ny = (y + 0.5 - B[1]) * (B[3] || 1) / B[2];
      const lit = -(nx * 0.62 + ny * 0.78) + (hsh(x >> 1, y >> 1) - 0.5) * 0.45, n = ramp.length;
      let k = lit > 0.62 ? n - 1 : lit > 0.22 ? n - 2 : lit > -0.3 ? n - 3 : lit > -0.75 ? n - 4 : n - 5;
      let col = ramp[Math.max(0, Math.min(n - 1, k))];
      if ((best === 5 || best === 6 || best === 7) && ny < -0.35 && hsh(x, y + 3) > 0.18) col = moss[Math.max(0, Math.min(4, k - 1))];   // moss on top surfaces
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
    // cracks, eyes, rune, fists
    g.fillStyle = '#2e2638'; [[12, 15], [13, 16], [13, 17], [20, 21], [19, 22], [16, 12], [16, 13]].forEach(([x, y]) => g.fillRect(x, y, 1, 1));
    g.fillStyle = '#1a1024'; g.fillRect(12, 7, 3, 3); g.fillRect(18, 7, 3, 3);
    g.fillStyle = '#ffe070'; g.fillRect(13, 8, 2, 1); g.fillRect(18, 8, 2, 1); g.fillStyle = '#fff4b0'; g.fillRect(13, 8, 1, 1); g.fillRect(19, 8, 1, 1);
    g.fillStyle = '#1a1024'; g.fillRect(14, 11, 5, 1);
    g.fillStyle = '#d8502a'; g.fillRect(16, 18, 1, 5); g.fillRect(14, 20, 5, 1); g.fillStyle = '#ff8a3a'; g.fillRect(16, 19, 1, 3); g.fillRect(15, 20, 3, 1); g.fillStyle = '#ffe070'; g.fillRect(16, 20, 1, 1);
    return outline(c, OLN);
  });
  const FLASH = mkc(40, 40), fg = FLASH.getContext('2d');
  function flashDraw(gg, img, x, y, col, amt) { fg.clearRect(0, 0, 40, 40); fg.globalCompositeOperation = 'source-over'; fg.drawImage(img, 0, 0); fg.globalCompositeOperation = 'source-atop'; fg.fillStyle = col || '#ffffff'; fg.fillRect(0, 0, 40, 40); fg.globalCompositeOperation = 'source-over'; gg.drawImage(img, x, y); const pa = gg.globalAlpha; gg.globalAlpha = pa * (amt || 0.6); gg.drawImage(FLASH, 0, 0, img.width, img.height, x, y, img.width, img.height); gg.globalAlpha = pa; }   // a 60 % white hit flash: the sprite stays readable
  const HEART = PXS.strArt(['.oo.oo.', 'orrorro', 'oruRrRo', 'orrrrRo', '.orrRo.', '..oRo..', '...o...'], { R: '#a8283a', r: '#e04848', u: '#ffb0b0' });
  const HEART0 = PXS.strArt(['.oo.oo.', 'oxxoxxo', 'oxXxxxo', 'oxxxxxo', '.oxxxo.', '..oxo..', '...o...'], { x: '#3a3448', X: '#58506a' });
  // the hero's short sword: a held prop drawn from the hand anchor of each body frame (blade lit from the top left, never
  // a mirror of the body). Facing right the sword is in the near (right) hand, in front of the body; facing left the
  // right hand is the far one, so the sword is drawn behind the body except while it swings out in front.
  const HAND = { fwd: [10, 10], mid: [5, 11], back: [2, 10], down: [2, 10], up: [12, 10], raise: [2, 9] };
  const ANG = { rest: 0.45, wind: -2.25, swing: 0.0, follow: 0.55, down: 2.6, up: 0.55, raise: -1.5 }, BLADE = 6;
  const SWC = {};
  function swordArt(ang) {   // 33x33, the hand at (16,16) (left empty: the hand is the body's own pixel)
    const key = ang.toFixed(3); if (SWC[key]) return SWC[key];
    const c = mkc(33, 33), x = c.getContext('2d'), dx = Math.cos(ang), dy = Math.sin(ang), seen = {};
    const px = (i, j, col) => { const k = i + ',' + j; if (seen[k] && col !== '#ffffff') return; seen[k] = 1; x.fillStyle = col; x.fillRect(i, j, 1, 1); };
    const gx = Math.round(16 + dx), gy = Math.round(16 + dy);
    px(gx, gy, '#d8a030'); px(Math.round(gx - dy), Math.round(gy + dx), '#ffe070'); px(Math.round(gx + dy), Math.round(gy - dx), '#a8703a');   // cross-guard
    for (let i = 2; i <= BLADE + 1; i++) px(Math.round(16 + dx * i), Math.round(16 + dy * i), i === BLADE + 1 ? '#ffffff' : i % 2 ? '#dfe6f2' : '#c4ccdc');
    outline(c, OLN); x.clearRect(16, 16, 1, 1);
    return (SWC[key] = c);
  }
  function swordPose(h) {   // {hand: [x, y] in the 14x16 sprite (right facing), ang, front}
    if (h.dir === 'down') return h.raise ? { hand: HAND.raise, ang: ANG.raise, front: true } : { hand: HAND.down, ang: ANG.down, front: true };
    if (h.dir === 'up') return { hand: HAND.up, ang: ANG.up, front: true };
    if (h.strike) { const ph = h.strike.phase; return { hand: ph === 'wind' ? HAND.back : HAND.fwd, ang: ANG[ph], front: ph !== 'wind' }; }
    const body = ['fwd', 'mid', 'back', 'mid'][h.frame % 4];
    return { hand: HAND[body], ang: ANG.rest, front: true };
  }
  const STRIKE = { wind: ['back', 'pass'], swing: ['fwd', 'a'], follow: ['fwd', 'b'] };
  const STRIKE_IMG = {}; Object.keys(STRIKE).forEach(k => { const [bd, lg] = STRIKE[k], c = PXS.strArt(HEAD.concat(BODY[bd], LEG[lg]), HPAL); STRIKE_IMG[k] = { right: c, left: flipC(c) }; });
  // hurt variants of a sprite: every pixel except the dark outline pushed toward a colour, fully opaque (cached)
  const VAR = new Map();
  function variant(img, col, amt) {
    let m = VAR.get(img); if (!m) VAR.set(img, m = {});
    const key = col + amt; if (m[key]) return m[key];
    const c = mkc(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), a = d.data, n = parseInt(col.slice(1), 16), R = n >> 16, G = (n >> 8) & 255, B = n & 255;
    for (let i = 0; i < a.length; i += 4) { if (!a[i + 3]) continue; if (a[i] + a[i + 1] + a[i + 2] < 120) continue;   // keep the outline
      a[i] = Math.round(a[i] + (R - a[i]) * amt); a[i + 1] = Math.round(a[i + 1] + (G - a[i + 1]) * amt); a[i + 2] = Math.round(a[i + 2] + (B - a[i + 2]) * amt); a[i + 3] = 255; }
    x.putImageData(d, 0, 0); return (m[key] = c);
  }
  let HERO_ALPHA = 1;
  function drawHero(gg, h, shadow) {
    const x = Math.round(h.x), y = Math.round(h.y), side = h.dir === 'left' || h.dir === 'right', flip = side && PXS.flipX({ facing: HERO_FACING }, h.dir);
    if (shadow !== false) { gg.fillStyle = 'rgba(16,10,30,0.35)'; gg.fillRect(x - 5, y - 1, 10, 1); gg.fillRect(x - 4, y, 8, 1); }
    const img = side ? (h.strike ? STRIKE_IMG[h.strike.phase] : WALK[h.frame % 4])[flip ? 'left' : 'right'] : PXS.actorSprite('hero', h.dir, 0);
    const X = x - 7, Y = y - 16 - (h.hop || 0), sp = swordPose(h);
    const hx = flip ? 13 - sp.hand[0] : sp.hand[0], hy = sp.hand[1], ang = flip ? Math.PI - sp.ang : sp.ang;
    const sword = () => gg.drawImage(swordArt(ang), X + hx - 16, Y + hy - 16);
    HERO_ALPHA = gg.globalAlpha;
    if (!(sp.front && !flip) && !(flip && h.strike && h.strike.phase !== 'wind')) sword();   // far hand: behind the body
    gg.drawImage(h.hurt === 'flash' ? variant(img, '#ffffff', 0.7) : h.hurt === 'tint' ? variant(img, '#ff3050', 0.45) : img, X, Y);
    if ((sp.front && !flip) || (flip && h.strike && h.strike.phase !== 'wind')) sword();
    return { X, Y, hx: X + hx, hy: Y + hy, ang };
  }
  function drawSlime(gg, s) {
    const img = SLIME[(s.frame || 0) % 2], x = Math.round(s.x - 6), y = Math.round(s.y - 10 - s.hop);
    if (s.dying) { const a = 1 - s.dying; gg.globalAlpha = Math.max(0, a); }
    gg.fillStyle = 'rgba(16,10,30,0.35)'; gg.fillRect(Math.round(s.x - 5), Math.round(s.y), 10, 1);
    if (s.flash || (s.dying && s.dying < 0.3)) flashDraw(gg, img, x, y); else gg.drawImage(img, x, y);
    gg.globalAlpha = 1;
    if (!s.dying && s.pips >= 0) for (let i = 0; i < 3; i++) { gg.fillStyle = '#1a1024'; gg.fillRect(x + 1 + i * 4, y - 5, 3, 3); gg.fillStyle = i < s.pips ? '#ff5a6a' : '#3a2a40'; gg.fillRect(x + 2 + i * 4, y - 4, 1, 1); }
  }
  function drawWarden(gg, w) {
    const img = WARDEN[(w.frame || 0) % 2], full = img.height, vis = Math.max(1, Math.round(full * w.rise)), x = w.x - 16, y = w.y - full + 1 - w.hop;
    if (w.hop || w.rise >= 1) { const sw = Math.max(6, 22 - w.hop); gg.fillStyle = 'rgba(16,10,30,0.38)'; gg.fillRect(Math.round(w.x - sw / 2), w.y - 1, Math.round(sw), 2); gg.fillRect(Math.round(w.x - sw / 2 + 2), w.y + 1, Math.round(sw - 4), 1); }
    if (w.dying) gg.globalAlpha = Math.max(0, 1 - w.dying);
    // rising: the top part shows above the ground line, the rest is still underground
    if (w.rise < 1) gg.drawImage(img, 0, 0, img.width, vis, x, w.y + 1 - vis, img.width, vis);
    else if (w.flash || (w.dying && w.dying < 0.25)) flashDraw(gg, img, x, y, '#ffffff', 0.35); else gg.drawImage(img, x, y);
    gg.globalAlpha = 1;
    if (w.rise >= 1 && !w.dying && w.pips >= 0) { const px = w.x - 16, py = y - 6; gg.fillStyle = '#1a1024'; gg.fillRect(px, py, 33, 4); for (let i = 0; i < 8; i++) { gg.fillStyle = i < w.pips ? '#b98cff' : '#3a2a40'; gg.fillRect(px + 1 + i * 4, py + 1, 3, 2); } }
  }
  function sparks(gg, cx, cy, t, n, r0, col, seed) {
    for (let k = 0; k < n; k++) { const a = k * 2 * Math.PI / n + seed, r = r0 + t * 0.03; gg.fillStyle = col; gg.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.75), 1, 1); if (t < 120) gg.fillRect(Math.round(cx + Math.cos(a) * (r - 2)), Math.round(cy + Math.sin(a) * (r - 2) * 0.75), 1, 1); }
  }
  function ring(gg, cx, cy, r, col, a) {   // a flat pixel ring on the ground (ellipse 2:1)
    gg.globalAlpha = a; gg.fillStyle = col;
    for (let k = 0; k < 64; k++) { const t = k / 64 * Math.PI * 2; gg.fillRect(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r * 0.42), 1, 1); }
    gg.globalAlpha = 1;
  }
  // the swing trail: the path the blade tip travelled from the wind-up to now, around the hand (pivot), fading behind
  function slash(gg, h, hand) {
    if (!h.strike || h.strike.phase === 'wind' || !hand) return;
    const flip = h.dir === 'left', a1 = hand.ang, a0 = flip ? Math.PI - ANG.wind : ANG.wind, n = 9, r = BLADE + 1, fade = h.strike.phase === 'follow' ? 1 - (h.strike.u - 0.6) / 0.4 : 1;
    // the tip swept over the top: from a0 to a1 the short way through "up"
    const span = flip ? (a1 - a0 + 4 * Math.PI) % (2 * Math.PI) - 2 * Math.PI : (a1 - a0 + 4 * Math.PI) % (2 * Math.PI);
    for (let k = 1; k <= n; k++) {
      const a = a1 - span * (k / n) * 0.85, tail = k / n;
      gg.globalAlpha = Math.max(0, fade * (1 - tail * 0.85)); gg.fillStyle = tail < 0.3 ? '#ffffff' : tail < 0.65 ? '#fff4b0' : '#c8d4ff';
      gg.fillRect(Math.round(hand.hx + Math.cos(a) * r), Math.round(hand.hy + Math.sin(a) * r), 1, 1);
      if (tail < 0.5) gg.fillRect(Math.round(hand.hx + Math.cos(a) * (r + 1)), Math.round(hand.hy + Math.sin(a) * (r + 1)), 1, 1);
    }
    gg.globalAlpha = 1;
  }

  /* ---------------- scene ---------------- */
  const MAP = (() => {
    const rows = [];
    for (let y = 0; y < 9; y++) {
      let r = '';
      for (let x = 0; x < 40; x++) {
        const hv = PXS.hash(x, y, 5);
        let c = '.';
        if (y === 0 || y === 8) c = ['T', 'P', 'T', 'T', '.', 'T'][Math.floor(hv * 6)];
        else if (y === 4) c = 'p';
        else if (hv < 0.10) c = ',';
        else if (hv < 0.13 && y !== 3 && y !== 5) c = 'F';
        r += c;
      }
      rows.push(r.split(''));
    }
    const set = (x, y, c) => { rows[y][x] = c; };
    set(11, 3, 'u'); set(3, 2, 'u'); set(7, 6, 'r'); set(20, 2, 'u'); set(24, 6, 'u'); set(26, 2, 'F'); set(5, 6, 'F');
    set(2, 2, 'S'); set(1, 6, 'u');
    for (const [x, y] of [[15, 6], [16, 6], [17, 6], [15, 7], [16, 7], [17, 7], [14, 7], [18, 7]]) set(x, y, 'w');
    for (let x = 31; x <= 38; x++) for (let y = 3; y <= 5; y++) set(x, y, 'c');
    set(30, 2, 'R'); set(38, 2, 'R'); set(30, 6, 'R'); set(38, 6, 'R');
    return rows.map(r => r.join(''));
  })();
  const SC = PXS.scene({ map: MAP, seed: 29 });
  // the bush the slime peeks over: its drawn base and the top row of its leaves (the slime's eyes rise just above it)
  const PEEK_BUSH = (() => { const it = SC.items.find(q => q.k === 'bush' && Math.abs(q.x - BUSH.x) < 12 && Math.abs(q.y - (3 * TS + 14)) < 6); return it ? { x: it.x, crown: it.y - 11 } : { x: BUSH.x, crown: BUSH.y - 11 }; })();
  const off = mkc(MAPW, MAPH), g = off.getContext('2d'); g.imageSmoothingEnabled = false;
  const view = $('game'), vg = view.getContext('2d');
  let VW = { x: 0, y: 0, w: W, h: H }, DRAWN = [];
  function camFor(tc, h, vw) {
    const follow = h.x - Math.round(vw * 0.43), boss = Math.round((h.x + WARDEN_X) / 2 - vw / 2);
    let u = 0; if (tc >= 25500 && tc < 38800) u = sm((tc - 25500) / 1500); if (tc >= 38800) u = 1 - sm((tc - 38800) / 1500);
    return Math.round(lerp(follow, boss, u));
  }
  function viewWindow(tc, h) {
    // full view: k = floor(css / 256) css px per native px, as many native columns as fill the stage; phones (< 512 css
    // px): 2 css px per native px, a 90 px tall window that follows the hero
    const cssW = Math.max(160, $('stage').clientWidth), small = cssW < 2 * W, kc = small ? 2 : Math.floor(cssW / W);
    const w = Math.min(MAPW, Math.floor(cssW / kc)), hh = small ? 90 : H;
    const x = Math.max(0, Math.min(MAPW - w, camFor(tc, h, w))), y = small ? Math.max(0, Math.min(MAPH - hh, Math.round(h.y - 10 - hh / 2))) : 0;
    return { x, y, w, h: hh };
  }
  function sceneActors(tc) {
    if (mode === 'drive') {
      const h = { x: 150, y: PATH_Y, dir: 'right', moving: false, frame: 1, hop: 0, target: null, hurt: null, strike: null, raise: false, vx: 0 };
      const rep = manualReport(simT), A = { hero: h };
      if (rep.combat && !rep.boss) { A.s1 = { id: 's1', x: 176, y: PATH_Y, hop: Math.round(3 * Math.abs(Math.sin(simT / 260))), frame: Math.floor(simT / 260) % 2, flash: 0, pips: 3, dying: 0 }; A.s2 = { id: 's2', x: 198, y: PATH_Y, hop: Math.round(3 * Math.abs(Math.sin(simT / 260 + 1))), frame: Math.floor(simT / 300) % 2, flash: 0, pips: 3, dying: 0 }; h.target = 's1'; }
      if (rep.boss) { A.warden = { x: 200, y: PATH_Y, rise: 1, hop: 0, flash: 0, pips: 8, frame: Math.floor(simT / 500) % 2, dying: 0 }; h.target = 'warden'; }
      return A;
    }
    const A = { hero: heroAt(tc) };
    const s1 = slimeAt('s1', tc), s2 = slimeAt('s2', tc), w = wardenAt(tc), pk = peekAt(tc);
    if (s1) A.s1 = s1; if (s2) A.s2 = s2; if (w) A.warden = w; if (pk) A.peek = pk;
    return A;
  }
  function renderScene() {
    const tc = sceneT % CYC, A = sceneActors(tc), h = A.hero;
    VW = mode === 'drive' ? (() => { const v = viewWindow(0, h); v.x = Math.max(0, Math.min(MAPW - v.w, h.x - Math.round(v.w * 0.43))); return v; })() : viewWindow(tc, h);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    const ex = [], ms = simT;
    // the peeking slime stands behind the bush (drawn before it): only its top and eyes rise over the leaves
    if (A.peek) { const p = A.peek; ex.push({ y: p.y - 14, draw: gg => { const img = SLIME[p.frame]; gg.drawImage(img, 0, 0, 12, 7, p.x - 6, p.top, 12, 7); } }); }   // rows 0-6 only, drawn before the bush
    if (A.s1) ex.push({ y: A.s1.y, draw: gg => drawSlime(gg, A.s1) });
    if (A.s2) ex.push({ y: A.s2.y, draw: gg => drawSlime(gg, A.s2) });
    if (A.warden) ex.push({ y: A.warden.y + 0.5, draw: gg => drawWarden(gg, A.warden) });
    if (mode === 'scene' && tc >= DIE.warden + 600) ex.push({ y: PATH_Y - 2, draw: gg => { PXS.drawProp(gg, 'rock', WARDEN_X - 8, PATH_Y, { v: 1 }, 0); PXS.drawProp(gg, 'rock', WARDEN_X + 7, PATH_Y + 1, { v: 2 }, 0); } });
    let HAND_AT = null; ex.push({ y: h.y + 0.25, draw: gg => { HAND_AT = drawHero(gg, h); } });
    SC.draw(g, ms, ex, 0, 0);
    // effects (all drawn after the actors, small and short)
    slash(g, h, HAND_AT);
    if (mode === 'scene') {
      for (const id of ['s1', 's2']) { const d = tc - DIE[id], s = id === 's1' ? 176 : 176; if (d >= 0 && d < 700) { sparks(g, s, PATH_Y - 5, d, 12, 4, '#c8ffb0', 0.3); sparks(g, s, PATH_Y - 5, d * 0.6, 8, 2, '#ffffff', 1.1); } }
      for (const [t, dd, who] of HITS) { const d = tc - t; if (dd < 0 && d >= 0 && d < 260) sparks(g, h.x + 4, PATH_Y - 8, d, 8, 3, d < 100 ? '#ffffff' : '#ffb0b0', t * 0.001); }
      // the spring heals (18.6 s): mint sparkles rise around the hero over a ground ring
      { const d = tc - 18600; if (d >= 0 && d < 1500) { const a = d < 1100 ? 1 : 1 - (d - 1100) / 400; ring(g, h.x, PATH_Y, 6 + d * 0.012, '#9fffd0', 0.8 * a); for (let k = 0; k < 8; k++) { const q = (d - k * 140) % 900; if (q > 0 && d - k * 140 > 0) { g.globalAlpha = a * (1 - q / 900); g.fillStyle = k % 2 ? '#ffffff' : '#9fffd0'; g.fillRect(Math.round(h.x - 8 + ((k * 5) % 17)), Math.round(PATH_Y - 3 - q * 0.022), 1, 2); g.globalAlpha = 1; } } } }
      // victory (35.0 s): gold rays burst from the hero, he raises the sword with a twinkle at its tip, confetti falls
      { const d = tc - VICTORY; if (d >= 0 && d < 3000) {
        const cx = h.x, cy = PATH_Y - 9, burst = Math.min(1, d / 500), a = d < 2200 ? 1 : 1 - (d - 2200) / 800;
        for (let k = 0; k < 12; k++) { const ang = k / 12 * Math.PI * 2 + 0.13, r0 = 7 + burst * 6, r1 = r0 + 4 + (k % 2) * 3; g.globalAlpha = a * (d < 1600 ? 0.9 : 0.5); g.fillStyle = k % 2 ? '#fff4b0' : '#ffd166';
          for (let r = r0; r <= r1; r++) g.fillRect(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r * 0.8), 1, 1); }
        g.globalAlpha = a; ring(g, cx, PATH_Y, 5 + burst * 9, '#ffd166', a);
        for (let k = 0; k < 14; k++) { const q = d - k * 90; if (q <= 0) continue; const px = cx - 22 + ((k * 13) % 45), py = PATH_Y - 34 + q * 0.018 + Math.sin(q / 160 + k) * 1.5; if (py > PATH_Y + 2) continue; g.globalAlpha = a; g.fillStyle = ['#ffd166', '#ff8fc8', '#7ee0c3', '#c8ecff'][k % 4]; g.fillRect(Math.round(px), Math.round(py), (k + Math.floor(q / 200)) % 2 ? 2 : 1, 1); }
        if (h.raise && HAND_AT) { const tx = Math.round(HAND_AT.hx + Math.cos(HAND_AT.ang) * (BLADE + 1)), ty = Math.round(HAND_AT.hy + Math.sin(HAND_AT.ang) * (BLADE + 1)), tw = Math.floor(d / 150) % 2 ? 2 : 3;
          g.globalAlpha = a; g.fillStyle = '#ffffff'; g.fillRect(tx - tw, ty - 1, 1, 1); g.fillRect(tx + tw, ty - 1, 1, 1); g.fillRect(tx, ty - 1 - tw, 1, 1); g.fillRect(tx, ty - 1 + tw - 1, 1, 1); g.fillStyle = '#fff4b0'; g.fillRect(tx - 1, ty - 1, 3, 1); g.fillRect(tx, ty - 2, 1, 3); }
        g.globalAlpha = 1; } }
      // the warden: dust while it rises, a roar ring on its first bar, slam rings
      if (tc >= RISE[0] && tc < RISE[1]) for (let k = 0; k < 7; k++) { const ph = (tc / 90 + k * 13) % 7, dx = ((k * 37) % 30) - 15; g.fillStyle = k % 2 ? '#b49c80' : '#917a6c'; g.fillRect(WARDEN_X + dx, PATH_Y - Math.round(ph), 1, 1); }
      { const d = tc - 28000; if (d >= 0 && d < 700) { ring(g, WARDEN_X, PATH_Y - 1, 10 + d * 0.05, '#ffe070', 1 - d / 700); ring(g, WARDEN_X, PATH_Y - 1, 6 + d * 0.035, '#ffffff', 0.8 * (1 - d / 700)); } }
      for (const s of SLAMS) { const d = tc - s; if (d >= 0 && d < 500) ring(g, WARDEN_X, PATH_Y, 8 + d * 0.06, '#d8c49c', 1 - d / 500); }
      { const d = tc - DIE.warden; if (d >= 0 && d < 900) { sparks(g, WARDEN_X, PATH_Y - 14, d, 16, 6, '#e2d2ff', 0.2); sparks(g, WARDEN_X, PATH_Y - 14, d * 0.6, 10, 3, '#ffffff', 0.9); } }
    }
    // HUD: hearts in the top-left corner of the view (actors never stand that high)
    const hearts = mode === 'drive' ? man.hp : heartsAt(tc), low = hearts / 5 < 0.3;
    const healing = mode === 'scene' && tc >= 18600 && tc < 19400 ? Math.min(5, 1 + Math.floor((tc - 18600) / 200)) : null;
    const shown = healing != null ? Math.max(1, healing) : hearts;
    const hx = VW.x + 4, hy = VW.y + 4;
    g.fillStyle = 'rgba(12,8,24,0.55)'; g.fillRect(hx - 2, hy - 2, 5 * 8 + 3, 11);
    for (let i = 0; i < 5; i++) { const on = i < shown, pulse = low && on && i === shown - 1 && Math.floor(simT / 300) % 2 === 0; g.drawImage(on ? HEART : HEART0, hx + i * 8, hy - (pulse ? 1 : 0)); }
    DRAWN = [{ id: 'hud', x: hx - 2, y: hy - 2, w: 43, h: 11 }];
    // integer scale of the view window to the display canvas
    const dpr = window.devicePixelRatio || 1, cssW = Math.max(160, $('stage').clientWidth), kc = cssW < 2 * W ? 2 : Math.floor(cssW / W), k = Math.max(1, Math.round(kc * dpr));
    if (view.width !== VW.w * k || view.height !== VW.h * k) { view.width = VW.w * k; view.height = VW.h * k; view.style.width = (VW.w * kc) + 'px'; view.style.height = (VW.h * kc) + 'px'; }
    vg.imageSmoothingEnabled = false; vg.drawImage(off, VW.x, VW.y, VW.w, VW.h, 0, 0, VW.w * k, VW.h * k);
    return A;
  }
  function actorBoxes(A) {   // drawn boxes in map px (for the layout scan)
    const out = [], h = A.hero;
    out.push({ id: 'hero', x: h.x - 12, y: h.y - 17 - (h.hop || 0), w: 25, h: 18 + (h.hop || 0) });   // body and sword reach
    for (const id of ['s1', 's2']) if (A[id] && !A[id].dying) { const s = A[id]; out.push({ id, x: s.x - 6, y: s.y - 15 - s.hop, w: 13, h: 16 + s.hop }); }
    if (A.warden) { const w = A.warden; out.push({ id: 'warden', x: w.x - 17, y: w.y - 38 - w.hop, w: 34, h: 40 + w.hop }); }
    if (A.peek) out.push({ id: 'peek', x: A.peek.x - 6, y: A.peek.top, w: 12, h: 7 });
    return out;
  }

  /* ---------------- timeline: the plan on the music clock ---------------- */
  const tl = $('tl'), tg = tl.getContext('2d');
  function rr(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function notesOf(seg, c, t0, t1) {
    const out = [], rm = seg.rowMs, endC = Math.min(seg.cEnd, seg.cMusicEnd != null ? seg.cMusicEnd : Infinity);
    const xFrom = seg.r0 + (Math.max(t0, seg.c0) - seg.c0) / rm - 64, xTo = seg.r0 + (Math.min(t1, endC) - seg.c0) / rm;
    if (xTo < seg.r0) return out;
    const passes = [[0, 0, c.total]];
    if (c.loop) for (let base = c.total; base < xTo + c.loopRows; base += c.loopRows) passes.push([base - c.loopRow, c.loopRow, c.total]);
    for (const ch of ['p1', 'p2', 'tri', 'noise']) for (const [shift, rFrom, rTo] of passes) for (const e of c.ev[ch]) {
      if (e.k === 'rest' || e.row < rFrom || e.row >= rTo) continue;
      const xs = e.row + shift, xe = (e.end != null ? e.end : e.row + 1) + shift;
      if (xe <= seg.r0 || xs > xTo || xe < xFrom) continue;
      const s = seg.c0 + (Math.max(xs, seg.r0) - seg.r0) * rm, en = Math.min(endC, seg.c0 + (xe - seg.r0) * rm);
      if (en <= s) continue;
      out.push({ ch, k: e.k, midi: e.midi, drum: e.drum, s, e: en });
    }
    return out;
  }
  function drawTimeline(st) {
    const dpr = window.devicePixelRatio || 1, cw = tl.clientWidth, chh = tl.clientHeight;
    if (tl.width !== Math.round(cw * dpr) || tl.height !== Math.round(chh * dpr)) { tl.width = Math.round(cw * dpr); tl.height = Math.round(chh * dpr); }
    const c = tg; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cw, chh);
    const narrow = cw < 520, gut = narrow ? 52 : 70, span = narrow ? 7000 : 12000, tw = cw - gut, pxms = tw / span, now = st.t, head = gut + Math.round(tw * 0.34);
    const t0 = now - (head - gut) / pxms, t1 = now + (cw - head) / pxms, X = t => head + (t - now) * pxms;
    const RIB = 18, GY = RIB + 6, GH = 20, MY = GY + GH + 6, MH = 20, LY = MY + MH + 8, LH = (chh - LY - 4) / 4;
    const lanes = {}; ORDER.forEach((k, i) => { lanes[k] = [LY + i * LH, LH]; });
    c.fillStyle = '#0b0a14'; c.fillRect(0, 0, cw, chh);
    ORDER.forEach((k, i) => { const [y, h] = lanes[k]; c.fillStyle = i % 2 ? '#0d0c18' : '#100e1d'; c.fillRect(gut, y, tw, h); });
    c.fillStyle = '#100e1d'; c.fillRect(gut, GY, tw, GH); c.fillRect(gut, MY, tw, MH);
    const plan = music.plan().filter(s => s.c0 < t1 && Math.min(s.cEnd, s.cMusicEnd != null ? s.cMusicEnd : Infinity) > t0 && SONGS[s.track]);
    const trans = adaptive.plan();
    c.save(); c.beginPath(); c.rect(gut, 0, tw, chh); c.clip();
    // bar and beat lines from the loops that sound (the music's own grid), bar numbers on top
    c.font = '600 10px ui-monospace, Menlo, monospace'; c.textBaseline = 'top';
    let lastNumX = -1e9;
    for (const seg of plan) {
      if (seg.kind !== 'loop') continue;
      const S = SONGS[seg.track], endC = seg.cEnd, a = Math.max(seg.c0, t0), b = Math.min(endC, t1), barRows = S.rpb * S.bpb;
      for (let x = Math.ceil(seg.r0 + (a - seg.c0) / seg.rowMs - 1e-6); seg.c0 + (x - seg.r0) * seg.rowMs < b - 0.5; x++) {
        if (x % S.rpb) continue;
        const cx = Math.round(X(seg.c0 + (x - seg.r0) * seg.rowMs)) + 0.5, wrapped = S.loop && x >= S.total ? S.loopRow + ((x - S.total) % S.loopRows) : x, bar = wrapped % barRows === 0;
        c.fillStyle = bar ? '#ffffff2c' : '#ffffff0c'; c.fillRect(cx - 0.5, GY, 1, chh - GY - 4);
        if (bar && cx - lastNumX > 24) { c.fillStyle = '#8e88aa'; c.textAlign = 'center'; c.fillText(String(Math.floor(wrapped / barRows) + 1), cx, 3); c.textAlign = 'left'; lastNumX = cx; }   // centred on its line
      }
    }
    // track ribbon (loops) and jingles: thin bars under the bar numbers, titles only when they fit whole
    for (const seg of plan) {
      const S = SONGS[seg.track], endC = Math.min(seg.cEnd, seg.cMusicEnd != null ? seg.cMusicEnd : Infinity), xa = Math.max(gut, X(seg.c0)), xb = Math.min(cw, X(endC));
      if (xb <= xa) continue;
      const own = seg.track.startsWith('am-'), jing = seg.kind === 'jingle', col = jing ? (own ? STC : GAMEC) : seg.track === 'am-boss' ? MCOL.boss : '#7ee0c3';
      c.fillStyle = col; c.globalAlpha = 0.9; c.fillRect(xa, RIB - 4 + (jing ? 0 : 2), xb - xa, jing ? 3 : 2); c.globalAlpha = 1;
    }
    // GAME lane: what the game reported, step by step; ignored flickers struck through
    let run = null;
    const flush = (endT) => { if (!run) return; const xa = Math.max(gut, X(run.t)), xb = Math.min(cw, X(endT)); if (xb > xa) { c.fillStyle = MCOL[run.mood]; c.globalAlpha = 0.85; c.fillRect(xa, GY + 2, xb - xa, GH - 9); c.globalAlpha = 1; if (run.low) { c.fillStyle = LOWC; c.fillRect(xa, GY + GH - 5, xb - xa, 3); } } };
    for (const hpt of HIST) { if (hpt.t < t0 - 50) continue; if (!run || run.mood !== hpt.mood || run.low !== hpt.low) { flush(hpt.t); run = { t: hpt.t, mood: hpt.mood, low: hpt.low }; } }
    flush(now);
    for (const ev of adaptive.recent(40)) if (ev.type === 'ignored') { const xa = X(ev.t - ev.heldMs), xb = X(ev.t); if (xb < gut || xa > cw) continue; c.strokeStyle = '#ffe08a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(xa - 1, GY + GH - 4); c.lineTo(xb + 1, GY + 1); c.stroke(); }
    // MUSIC lane: the committed state from each change's bar line; hold (dotted) and the wait for the bar (solid)
    for (let i = 0; i < trans.length; i++) {
      const tr = trans[i], nx = i + 1 < trans.length ? trans[i + 1].at : Infinity, xa = Math.max(gut, X(tr.at)), xb = Math.min(cw, X(Math.min(nx, t1 + 1000)));
      const pending = tr.at > now;
      if (xb > xa) { c.fillStyle = MCOL[tr.to.mood]; c.globalAlpha = pending ? 0.35 : 0.85; c.fillRect(xa, MY + 2, xb - xa, MH - 9); c.globalAlpha = 1; if (tr.to.low) { c.fillStyle = LOWC; c.globalAlpha = pending ? 0.4 : 1; c.fillRect(xa, MY + MH - 5, xb - xa, 3); c.globalAlpha = 1; } }
    }
    for (const tr of trans) {
      if (tr.reason === 'start') continue;
      const xa = X(tr.at);
      if (tr.heldMs != null) { const h0 = X(tr.committedAt - tr.heldMs), h1 = X(tr.committedAt); c.strokeStyle = '#cfc8ec'; c.setLineDash([2, 3]); c.lineWidth = 1; c.beginPath(); c.moveTo(h0, MY + MH / 2 - 3); c.lineTo(h1, MY + MH / 2 - 3); c.stroke(); c.setLineDash([]);
        c.strokeStyle = '#ffffffb0'; c.beginPath(); c.moveTo(h1, MY + MH / 2 - 3); c.lineTo(xa - 3, MY + MH / 2 - 3); c.stroke(); c.fillStyle = '#ffffff'; c.fillRect(Math.round(h1) - 1, MY + MH / 2 - 5, 3, 5); }
      c.fillStyle = '#ffffff'; c.fillRect(Math.round(xa) - 1, MY - 2, 2, MH + 4);
      c.beginPath(); c.moveTo(xa, MY - 3); c.lineTo(xa + 4, MY + 1); c.lineTo(xa, MY + 5); c.lineTo(xa - 4, MY + 1); c.closePath(); c.fill();
      if (tr.stinger) { c.fillStyle = STC; c.beginPath(); c.moveTo(xa + 1, MY - 2); c.lineTo(xa + 9, MY + 1); c.lineTo(xa + 1, MY + 4); c.closePath(); c.fill(); }
      // the bar line through the layer lanes
      c.fillStyle = tr.at > now ? '#ffffff55' : '#ffffff30'; c.fillRect(Math.round(xa) - 0.5, LY, 1, chh - LY - 4);
    }
    // layer lanes: notes (alpha follows the layer gain) and the gain curve
    const curve = adaptive.curve(t0, t1, Math.max(10, 1 / pxms * 2));
    const gAt = t => { const i = Math.max(0, Math.min(curve.length - 1, Math.round((t - t0) / ((t1 - t0) / Math.max(1, curve.length - 1))))); return curve[i] ? curve[i].gains : { base: 1, perc: 1, lead: 1, danger: 1 }; };
    const pitchY = (k, m) => { const ch = CHOF[k], R = RANGE[ch], [y, h] = lanes[k]; return y + h - 4 - (m - R.lo + 0.5) / (R.hi - R.lo + 1) * (h - 8); };
    for (const seg of plan) {
      const S = SONGS[seg.track], isJ = seg.kind === 'jingle';
      for (const n of notesOf(seg, S, t0, t1)) {
        const k = AM.layerOf[n.ch], x0 = X(n.s), x1 = X(n.e), active = n.s <= now && now < n.e, gain = gAt((n.s + n.e) / 2)[k];
        let y, h;
        if (n.k === 'drum') { const [ly, lh] = lanes.perc; h = Math.max(3, Math.floor((lh - 10) / 5) - 2); y = ly + 4 + DRUM_ROW[n.drum] * Math.floor((lh - 8) / 5); }
        else { y = pitchY(k, n.midi) - 2; h = 4; }
        const xe = n.k === 'drum' ? Math.max(x0 + 3, X(Math.min(n.e, n.s + DRUM_LEN[n.drum]))) : Math.max(x0 + 2, x1 - 1);
        c.globalAlpha = (n.s > now ? 0.55 : 1) * (0.1 + 0.9 * gain);
        c.fillStyle = isJ ? (S.name && seg.track.startsWith('am-') ? STC : GAMEC) : LCOL[k];
        rr(c, x0, y, Math.max(2, xe - x0), h, 1.5); c.fill();
        if (active && gain > 0.05) { c.globalAlpha = gain; c.fillStyle = '#ffffff'; rr(c, x0, y, Math.max(2, xe - x0), h, 1.5); c.fill(); }
        c.globalAlpha = 1;
      }
    }
    ORDER.forEach(k => {
      const [y, h] = lanes[k]; c.beginPath();
      const pts = curve.filter(p => p.t >= 0); if (!pts.length) return;
      pts.forEach((p, i) => { const xx = X(p.t), yy = y + h - 2 - p.gains[k] * (h - 6); if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy); });
      c.strokeStyle = LCOL[k]; c.globalAlpha = 0.9; c.lineWidth = 1.5; c.stroke();
      c.lineTo(X(pts[pts.length - 1].t), y + h - 2); c.lineTo(X(pts[0].t), y + h - 2); c.closePath(); c.globalAlpha = 0.08; c.fillStyle = LCOL[k]; c.fill(); c.globalAlpha = 1;
    });
    // playhead
    c.fillStyle = '#ffffff'; c.fillRect(head - 1, GY - 2, 2, chh - GY);
    c.beginPath(); c.moveTo(head - 5, GY - 7); c.lineTo(head + 5, GY - 7); c.lineTo(head, GY - 1); c.closePath(); c.fill();
    c.restore();
    // gutter labels
    c.fillStyle = '#0b0a14'; c.fillRect(0, 0, gut, chh);
    c.font = '700 10px ui-monospace, Menlo, monospace'; c.textBaseline = 'middle';
    const lab = (txt, y, col, sub) => { c.fillStyle = col; c.fillText(txt, 8, y); if (sub && !narrow) { c.fillStyle = '#6c6688'; c.font = '500 9.5px ui-monospace, Menlo, monospace'; c.fillText(sub, 8, y + 12); c.font = '700 10px ui-monospace, Menlo, monospace'; } };
    lab('GAME', GY + GH / 2 - 2, '#cfc8ec'); lab('MUSIC', MY + MH / 2 - 2, '#cfc8ec');
    ORDER.forEach(k => { const [y, h] = lanes[k], gv = st.layers[k]; lab(LNAME[k].toUpperCase(), y + 12, LCOL[k], LCH[k]); c.fillStyle = '#24203a'; c.fillRect(8, y + h - 9, gut - 18, 4); c.fillStyle = LCOL[k]; c.fillRect(8, y + h - 9, Math.round((gut - 18) * gv), 4); });
  }

  /* ---------------- UI ---------------- */
  const layersEl = $('layers'), LAYER_EL = {};
  ORDER.forEach(k => {
    const d = document.createElement('div'); d.className = 'layer'; d.style.setProperty('--c', LCOL[k]);
    d.innerHTML = '<div class="hd">' + LNAME[k] + ' <small>' + LCH[k] + '</small></div><div class="g"><b>0%</b><span></span></div><div class="bar"><i></i><u></u></div><div class="st"></div>';
    layersEl.appendChild(d); LAYER_EL[k] = { root: d, pct: d.querySelector('.g b'), note: d.querySelector('.g span'), bar: d.querySelector('.bar i'), tgt: d.querySelector('.bar u'), st: d.querySelector('.st') };
  });
  const railEl = $('rail'), RAIL_EL = [];
  RAIL.forEach((r, i) => { const d = document.createElement('div'); d.className = 'st' + (r.ig ? ' ig' : ''); d.innerHTML = '<span>' + (i + 1) + '. ' + r.label + '</span><small>' + r.mus + '</small>'; railEl.appendChild(d); RAIL_EL.push(d); });
  function fmtS(ms) { return (Math.max(0, ms) / 1000).toFixed(1) + ' s'; }
  function updateUI(st) {
    const m = st.heard ? st.heard.mood : st.mood || 'explore', low = st.heard ? st.heard.low : st.low;
    const me = $('mood'); me.textContent = (m === 'boss' ? 'BOSS' : m.toUpperCase()); me.className = 'mood ' + m;
    $('lowchip').className = 'lowchip' + (low ? '' : ' hide');
    const ms = music.state(), L = st.loop;
    if (st.jingle) { $('trackTitle').textContent = titleOf(st.jingle.track); $('trackSub').textContent = st.jingle.own ? 'stinger · one bar over the loop' : 'the game’s own jingle · every channel open'; }
    else if (L) { $('trackTitle').textContent = L.title; $('trackSub').textContent = (L.track === 'am-boss' ? 'boss track' : 'main track') + ' · ' + moodName(m, low) + ' mix'; }
    const J = ms && ms.jingle, src = L || (J ? { bar: J.bar, beat: J.beat } : null);
    $('posBar').textContent = src ? src.bar : '-'; $('posBeat').textContent = src ? src.beat : '-'; $('posBpm').textContent = ms && ms.loop ? Math.round(ms.loop.bpm) : 120;
    // what happens next
    let nx = '';
    const qn = adaptive.params().quantize === 'beat' ? 'beat' : 'bar';
    if (st.pending) {
      const p = st.pending, [pm, pl] = p.to.split('+'), bar = L ? Math.floor((L.row + Math.round(p.inMs / (L.barMs / 16))) / 16) + 1 : null;
      nx = '<b>' + cap(moodName(pm, !!pl)) + '</b> lands on the next ' + qn + ' line in <b>' + fmtS(p.inMs) + '</b>' + (p.stinger ? ' with the <span class="k"></span><b>' + titleOf(p.stinger) + '</b> stinger' : '') + (p.track ? ', then <b>' + titleOf(p.track) + '</b>' : '');
    } else if (st.candidate.holdLeftMs > 0) {
      const cm = st.candidate.mood, cl = st.candidate.low, up = cm !== st.mood ? (cm === 'explore' ? 'calm' : 'up') : (cl ? 'up' : 'calm');
      nx = up === 'up' ? 'The game says <b>' + moodName(cm, cl) + '</b>: it counts if it holds <b>' + fmtS(st.candidate.holdLeftMs) + '</b> more' : 'Quiet: calming down if it stays that way <b>' + fmtS(st.candidate.holdLeftMs) + '</b> more';
    } else if (st.jingle && !st.jingle.own) nx = 'The game’s <b>' + titleOf(st.jingle.track) + '</b> jingle: the layers wait, every channel is open';
    else if (st.fading && st.jingle && st.jingle.own) nx = 'The <span class="k"></span><b>' + titleOf(st.jingle.track) + '</b> stinger plays over the new <b>' + moodName(m, low) + '</b> mix: ' + fmtS(st.fading.endsAt - st.t) + ' left';
    else if (st.fading) nx = 'Fading to the <b>' + moodName(m, low) + '</b> mix: ' + fmtS(st.fading.endsAt - st.t) + ' left';
    else nx = 'Steady: the <b>' + moodName(m, low) + '</b> mix';
    $('next').innerHTML = nx;
    // layer cards
    const tr = adaptive.plan(), cur = [...tr].reverse().find(t => t.at <= st.t + 0.5), chs = ms ? ms.channels : [];
    ORDER.forEach(k => {
      const E = LAYER_EL[k], v = st.layers[k], tgt = cur ? (st.jingle && !st.jingle.own ? 1 : cur.toGains[k]) : v, chv = chs.find(c => c.ch === CHOF[k]);
      E.pct.textContent = Math.round(v * 100) + '%'; E.bar.style.width = Math.round(v * 100) + '%'; E.tgt.style.left = 'calc(' + Math.round(tgt * 100) + '% - 1px)';
      E.note.textContent = v < 0.03 ? 'silent' : chv && chv.note ? chv.note : 'rest';
      E.root.classList.toggle('off', v < 0.03);
      E.st.textContent = st.jingle && !st.jingle.own ? 'open for the jingle' : Math.abs(v - tgt) > 0.02 ? (tgt > v ? 'fading in' : 'fading out') : v < 0.03 ? 'off' : v < 0.97 ? 'pulled back' : 'on';
    });
    // the report the game sent this step
    const r = lastRep, hpT = Math.round(r.hp * 5);
    $('report').innerHTML = '<span class="lbl">update(</span><code>active: ' + !!r.active + '</code><code class="' + (r.combat ? 'on' : '') + '">combat: ' + !!r.combat + '</code><code class="boss ' + (r.boss ? 'on' : '') + '">boss: ' + !!r.boss + '</code><span class="nw"><code class="' + (st.raw.low ? 'lo' : '') + '">hp: ' + r.hp.toFixed(2) + '</code><span class="lbl"> )</span></span>';
    if (mode === 'scene') { const hv = Math.round(r.hp * 5); if (+$('hp').value !== hv) $('hp').value = hv; $('hpOut').textContent = hv + ' / 5'; }   // follows the scene while watching
    const rc = mode === 'scene' ? railAt(sceneT % CYC) : null;
    RAIL_EL.forEach((el, i) => el.classList.toggle('on', RAIL[i] === rc));
    $('clockOut').textContent = (st.t / 1000).toFixed(1) + ' s';
    if (logDirty) {
      logDirty = false; const ul = $('log'); ul.innerHTML = '';
      LOG.slice(-9).reverse().forEach(e => { const li = document.createElement('li'); li.innerHTML = '<span class="t">' + (e.t / 1000).toFixed(1) + 's</span><span class="p"></span><span class="pill ' + e.kind + '">' + e.kind + '</span>'; li.querySelector('.p').textContent = e.text; ul.appendChild(li); });
    }
    // sound button
    const sb = $('sound'), on = music.isUnlocked(), mu = music.params().mute;
    sb.className = on ? (mu ? 'muted' : 'on') : ''; sb.setAttribute('aria-pressed', on && !mu ? 'true' : 'false');
    $('soundText').textContent = !on ? 'Sound off: click anywhere to turn it on' : mu ? 'Muted: click to unmute' : 'Sound on: click to mute';
  }

  /* ---------------- controls ---------------- */
  $('sound').addEventListener('click', () => { music.toggle(); updateUI(adaptive.state()); });   // the click that starts audio never mutes
  const segs = (id, cb) => { const el = $(id); el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); cb(b.dataset.v || b.dataset.m); })); };
  function setMode(m) { if (m === mode) return; mode = m; $('mode').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.m === m ? 'true' : 'false')); if (m === 'scene') { sceneT = 0; lastTc = -1; } }
  segs('mode', m => setMode(m));
  segs('quant', v => adaptive.setParams({ quantize: v }));
  segs('sting', v => adaptive.setParams({ stingers: v === 'on' }));
  const tog = (id, key) => $(id).addEventListener('click', () => { setMode('drive'); man[key] = !man[key]; $(id).setAttribute('aria-pressed', man[key] ? 'true' : 'false'); });
  tog('tCombat', 'combat'); tog('tBoss', 'boss');
  $('flicker').addEventListener('click', () => { setMode('drive'); man.flick = [0, 1, 2, 3].map(i => [simT + i * 260, simT + i * 260 + 130]); });
  const slider = (id, fmt, cb) => { const el = $(id), out = $(id + 'Out'); const f = () => { out.textContent = fmt(+el.value); cb(+el.value); }; el.addEventListener('input', f); };
  slider('hp', v => v + ' / 5', v => { if (mode !== 'drive') setMode('drive'); man.hp = v; });
  slider('enter', v => (v / 1000).toFixed(1) + ' s', v => adaptive.setParams({ enterMs: v }));
  slider('exit', v => (v / 1000).toFixed(1) + ' s', v => adaptive.setParams({ exitMs: v }));
  slider('fade', v => v + (v === 1 ? ' beat' : ' beats'), v => adaptive.setParams({ fade: v }));
  slider('rel', v => v + (v === 1 ? ' beat' : ' beats'), v => adaptive.setParams({ release: v }));
  slider('vol', v => v.toFixed(2), v => music.volume(v));
  // reflect query overrides in the controls
  $('quant').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === P0.quantize ? 'true' : 'false'));
  $('sting').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', (b.dataset.v === 'on') === P0.stingers ? 'true' : 'false'));
  if (mode === 'drive') $('mode').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.m === 'drive' ? 'true' : 'false'));

  /* ---------------- text state + cast (checks) ---------------- */
  let LAST_A = null;
  window.__state = () => {
    const st = adaptive.state(), tc = sceneT % CYC, A = LAST_A || sceneActors(tc), actors = [];
    const h = A.hero, tgtX = id => id && A[id] ? A[id].x : null;
    const ha = { id: 'hero', x: h.x, y: h.y, facing: h.dir === 'left' || h.dir === 'right' ? h.dir : null, target: h.target && A[h.target] ? h.target : null, vx: h.vx };
    if (!ha.facing) ha.noFace = 'top-down ' + h.dir + ' frame (facing the viewer or the spring)';
    actors.push(ha);
    for (const id of ['s1', 's2']) if (A[id]) actors.push({ id, x: A[id].x, y: A[id].y, facing: null, target: 'hero', noFace: 'frontal slime art (looks at the viewer)' });
    if (A.warden) actors.push({ id: 'warden', x: A.warden.x, y: A.warden.y, facing: null, target: 'hero', noFace: 'frontal, left-right symmetric stone guardian' });
    if (A.peek) actors.push({ id: 'peek', x: A.peek.x, y: A.peek.y, facing: null, target: null, noFace: 'a slime peeking over a bush (frontal)' });
    return { t: Math.round(simT), scene: mode === 'scene' ? railAt(tc).label : 'drive', tc: Math.round(tc), report: Object.assign({}, lastRep), actors,
      music: { mood: st.mood, low: st.low, heard: st.heard, layers: st.layers, pending: st.pending, candidate: st.candidate, jingle: st.jingle, loop: st.loop && { track: st.loop.track, bar: st.loop.bar, beat: st.loop.beat, row: st.loop.row }, transitions: adaptive.plan().filter(t => t.reason !== 'start').map(t => ({ id: t.id, at: Math.round(t.at), to: t.to.mood + (t.to.low ? '+low' : ''), stinger: t.stinger, track: t.track })) },
      view: Object.assign({}, VW), drawn: DRAWN.slice(), boxes: actorBoxes(A) };
  };
  window.__cast = {
    hero: (gg, x, footY, dir, frame, strike, hurt, raise) => drawHero(gg, { x, y: footY, dir: dir || 'right', frame: frame == null ? 1 : frame, hop: 0, strike: strike ? { phase: strike, u: strike === 'wind' ? 0.2 : strike === 'swing' ? 0.5 : 0.8 } : null, hurt: hurt || null, raise: !!raise }, true),
    slime: (gg, x, footY, frame) => drawSlime(gg, { x, y: footY, hop: 0, frame: frame || 0, flash: 0, pips: -1, dying: 0 }),   // the sheet: no HP pips
    warden: (gg, x, footY, frame) => drawWarden(gg, { x, y: footY, rise: 1, hop: 0, flash: 0, pips: -1, frame: frame || 0, dying: 0 })   // the sheet: no HP bar
  };
  window.__demo = { heroAlpha: () => HERO_ALPHA, drawHero: (gg, h) => drawHero(gg, h, false), step, render: () => { LAST_A = renderScene(); }, sceneActors, actorBoxes, heroAt, reportAt, CYC, view: () => Object.assign({}, VW), drawn: () => DRAWN.slice(),
    viewAt: tc => viewWindow(tc, heroAt(tc)), hudAt: v => ({ x: v.x + 2, y: v.y + 2, w: 43, h: 11 }) };

  /* ---------------- loop ---------------- */
  function frameAll() { LAST_A = renderScene(); const st = adaptive.state(); drawTimeline(st); updateUI(st); }
  if (FREEZE_T != null) { while (simT < FREEZE_T - 1e-6) step(); }
  if (FROZEN) { frameAll(); window.__frozen = true; window.addEventListener('resize', frameAll); return; }
  let acc = 0, last = performance.now();
  function loop(now) {
    acc += Math.min(250, now - last); last = now;
    while (acc >= STEP) { step(); acc -= STEP; }
    frameAll();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
