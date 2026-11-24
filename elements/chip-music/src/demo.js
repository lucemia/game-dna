/* F-03 chip-music demo: a scene that picks the music from its game state, a piano roll drawn from the module's own
 * schedule (plan + song data), channel strips, a jukebox and a mixer. One clock: the scene and the music both advance
 * by the same fixed step (and the music follows the audio clock once sound runs), so ?t=<ms>&freeze=1 stills are the
 * live play at that time. Scenery: pixel-kit (GameDNA_PixelScene); in-canvas text: C-03 pixel font. */
(() => {
  'use strict';
  const M = window.GameDNA_ChipMusic, PXS = window.GameDNA_PixelScene, PF = window.GameDNA_PixelFont.create({ params: { font: 'regular', shadow: 'drop' } });
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const num = (v, d) => v == null || v === '' || !isFinite(+v) ? d : +v;
  const FREEZE_T = qs.has('t') ? Math.max(0, num(qs.get('t'), 0)) : null, FROZEN = FREEZE_T != null && qs.get('freeze') === '1';
  const STEP = 1000 / 60, W = 256, H = 144, TS = 16, CYC = 28000;
  const COL = { p1: '#5ee6ff', p2: '#ff7ad9', tri: '#ffc44d', noise: '#d9d4f0' }, JCOL = '#ffd166';
  const CHN = { p1: 'Pulse 1', p2: 'Pulse 2', tri: 'Triangle', noise: 'Noise' };

  /* ---------------- music ---------------- */
  const P0 = { volume: num(qs.get('volume'), 0.7), tempo: num(qs.get('tempo'), 1), transpose: num(qs.get('transpose'), 0), jingleMode: qs.get('jingleMode') || 'pause', resume: qs.get('resume') || 'beat' };
  const LOG = [];
  const music = M.create({ params: P0, onEvent: ev => { LOG.push(ev); if (LOG.length > 40) LOG.shift(); logDirty = true; } });
  let logDirty = true;
  const SONGS = {}; music.songs().forEach(s => { SONGS[s.name] = Object.assign({}, s, { c: music.song(s.name) }); });
  // a fixed pitch range per channel over every built-in song, so the roll never rescales when the track changes
  const RANGE = {};
  ['p1', 'p2', 'tri'].forEach(ch => { let lo = 127, hi = 0; Object.values(SONGS).forEach(s => s.c.ev[ch].forEach(e => { if (e.k === 'note') { const top = Math.max(e.midi, e.midi + Math.max(0, ...(e.fx.arp || [0])), e.fx.slide || 0); lo = Math.min(lo, e.midi); hi = Math.max(hi, top); } })); RANGE[ch] = { lo: lo - 1, hi: hi + 1 }; });
  const DRUM_ROW = { c: 0, o: 1, h: 2, s: 3, k: 4 }, DRUM_LEN = { k: 130, s: 160, h: 60, o: 220, c: 620 }, DRUM_SHADE = { k: '#b9b0e6', s: '#e6e0ff', h: '#9fe8ff', o: '#c8f2ff', c: '#ffe6a8' };

  /* ---------------- scene: a pure function of the cycle time ---------------- */
  const MAP = ['TPTT.TPTT.TTPT.T', '..,..u....,..F..', '.F....,......,..', '..,.............', 'pppppppppppppppp', '.,.....,.....,..', '.ww..F......u...', 'www..r....,...t.', 'TTPTTTPTTPTTTPTT'];
  const SC = PXS.scene({ map: MAP, seed: 23 });
  const SLIME = [PXS.strArt(['....oooo....', '..oolllloo..', '.olllgggllo.', '.ollgggggGo.', 'olgwkggwkgGo', 'olgkkggkkgGo', 'oggggggggGGo', 'oGgggggggGGo', '.oGGGGGGGGo.', '..oooooooo..']),
    PXS.strArt(['............', '....oooo....', '..oolllloo..', '.ollgggggGo.', 'olgwkggwkgGo', 'olgkkggkkgGo', 'oggggggggGGo', 'oGgggggggGGo', 'ooGGGGGGGGoo', '.oooooooooo.'])];
  // the open chest: lid raised behind the box, a dark inside, the same palette keys as the kit's closed chest
  // the open chest: lid tipped back (its underside shows), a dark inside with a glint, then the kit chest's front
  const CHEST_OPEN = PXS.strArt(['...oooooooo...', '..oBBBBBBBBo..', '..obbbbbbbbo..', '.oooooooooooo.', 'oDkkkkkkkkkkDo', 'okkkkkkkkkkkko', 'okkuykkkkyukko', 'oyYYYYYYYYYYYo', 'onnnnnyYnnnbBo', 'onnnnnYYnnbbBo', 'onbnnnnnnnbbBo', 'oyYYYYYYYYYYYo', '.oooooooooooo.']);
  const GEM = PXS.strArt(['..o..', '.oao.', 'oaAco', '.oAo.', '..o..']);
  const CHEST = { x: 11 * TS + 8, y: 3 * TS + 8 }, PATH_Y = 4 * TS + 13;   // chest base 5 px above the hero's head
  const BUMPS = [9900, 11100, 12300], POP = 12620, OPEN = 19900;
  const RAIL = [
    { id: 'title', label: 'Title', mus: 'title loop', from: 0, to: 4000 },
    { id: 'field', label: 'Field', mus: 'field loop', from: 4000, to: 9000 },
    { id: 'battle', label: 'Battle', mus: 'battle loop', from: 9000, to: POP },
    { id: 'victory', label: 'Slime defeated', mus: 'victory jingle', from: POP, to: 16400, j: true },
    { id: 'field2', label: 'Field', mus: 'field from its top', from: 16400, to: OPEN },
    { id: 'chest', label: 'Chest', mus: 'item jingle', from: OPEN, to: 21700, j: true },
    { id: 'field3', label: 'Field', mus: 'resumes on a beat', from: 21700, to: 26400 },
    { id: 'outro', label: 'Fade', mus: 'title loop', from: 26400, to: CYC }
  ];
  const lerp = (a, b, u) => a + (b - a) * Math.max(0, Math.min(1, u));
  // hero walk legs: [t0, t1, x0, x1]
  const LEGS = [[4000, 7800, 14, 102], [16500, 19500, 102, CHEST.x - 4], [22300, 25600, CHEST.x - 4, 276]];
  /* the hero: pixel-kit actor palette, side view with a 4-frame walk (contact, pass, contact, pass) and arm swing;
   * up / down frames come from the kit. Native facing right; left is the kit-style mirror (no gear, light from the top). */
  const HPAL = { h: '#b8642c', H: '#7a3c1c', s: '#f8c8a0', S: '#d09068', e: '#2a1428', c: '#3c72e4', C: '#98c4ff', 1: '#2442a4', b: '#5c3420', y: '#ffe070', 2: '#5c3420', 3: '#3a2014' };
  const HEAD = ['....oooooo....', '...ohhhhhho...', '..ohhhhHhhho..', '..oHhhhhhhho..', '..oHHhhsssso..', '..oHHhssesso..', '..oHHhsssSo...', '...oHHssSSo...'];
  const BODY = { mid: ['...oo1cc1oo...', '..o11cCc11o...', '..o1cCcc11o...', '..o1bsbbb1o...', '...oc1c11o....'],
    fwd: ['...oo1cc1oo...', '..o11ccCc1o...', '..o1cccCCso...', '..o1bbbbb1o...', '...oc1c11o....'],
    back: ['...oo1cc1oo...', '..o1Ccc111o...', '.osCccc111o...', '..o1bbbbb1o...', '...oc1c11o....'] };
  const LEG = { pass: ['...o2o22o.....', '...o3o33o.....', '...oooooo.....'], a: ['..o2oo22o.....', '..o3o.o33o....', '..ooo.oooo....'], b: ['..o22o.o2o....', '..o33o.o3o....', '..oooo.ooo....'] };
  const flipC = c => { const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; const x = o.getContext('2d'); x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(c, 0, 0); return o; };
  const WALK = [['fwd', 'a'], ['mid', 'pass'], ['back', 'b'], ['mid', 'pass']].map(([bd, lg]) => { const c = PXS.strArt(HEAD.concat(BODY[bd], LEG[lg]), HPAL); return { right: c, left: flipC(c) }; });
  function drawHero(gg, x, y, dir, frame, hop, shadow) {
    if (shadow !== false) { gg.fillStyle = 'rgba(16,10,30,0.35)'; gg.fillRect(Math.round(x) - 5, Math.round(y) - 1, 10, 1); gg.fillRect(Math.round(x) - 4, Math.round(y), 8, 1); }
    if (dir === 'left' || dir === 'right') gg.drawImage(WALK[frame % 4][dir], Math.round(x) - 7, Math.round(y) - 16 - (hop || 0));
    else PXS.actor(gg, x, y, { pal: 'hero', dir, frame: 0, hop, noShadow: true });
  }
  function heroAt(tc) {
    if (tc < 4000 || tc >= 26400) return { x: 14, y: PATH_Y, dir: 'down', moving: false, frame: 0, hop: 0, target: null, vx: 0 };   // waits at the road's start on the title card
    let x = 14, y = PATH_Y, dir = 'right', moving = false, dist = 0, hop = 0, target = null;
    for (const [t0, t1, x0, x1] of LEGS) {
      if (tc >= t1) { x = x1; dist += Math.abs(x1 - x0); continue; }
      if (tc >= t0) { x = lerp(x0, x1, (tc - t0) / (t1 - t0)); dist += Math.abs(x - x0); moving = true; }
      break;
    }
    if (tc >= 8100 && tc < POP) { dir = 'right'; target = 'slime'; }
    if (tc >= 9000 && tc < POP + 200) for (const b of BUMPS) { const u = (tc - (b - 150)) / 300; if (u > 0 && u < 1) x += Math.round(7 * Math.sin(Math.PI * u)); }
    if (tc >= POP && tc < 16500) { dir = 'down'; for (const h0 of [13000, 13560]) { const u = (tc - h0) / 420; if (u > 0 && u < 1) hop = Math.round(6 * Math.sin(Math.PI * u)); } }
    if (tc >= 19500 && tc < 22300) { dir = 'up'; target = 'chest'; }
    return { x: Math.round(x), y, dir, moving, frame: moving ? Math.floor(dist / 4) % 4 : 1, hop, target, vx: moving ? 1 : 0 };   // one frame per 4 px walked: no foot slide
  }
  function slimeAt(tc) {
    if (tc < 7400 || tc >= POP + 60) return null;
    let x = 128, y = PATH_Y + 1, hop = 0, flash = 0, frame = Math.floor(tc / 240) % 2, pips = 3;
    if (tc < 9000) {   // three hops up from the meadow onto the road
      const pts = [[150, 128], [143, 112], [136, 96], [128, PATH_Y + 1]], k = Math.min(2, Math.floor((tc - 7400) / 533)), u = Math.min(1, ((tc - 7400) - k * 533) / 533);
      x = Math.round(lerp(pts[k][0], pts[k + 1][0], u)); y = Math.round(lerp(pts[k][1], pts[k + 1][1], u)); hop = Math.round(8 * Math.sin(Math.PI * u)); frame = u > 0.85 ? 1 : 0;
    }
    for (const b of BUMPS) { if (tc >= b) pips--; const d = tc - b; if (d >= 0 && d < 260) { x += Math.round(5 * (1 - d / 260)); if (d < 120) flash = 1; } }
    return { x, y, hop, flash, frame, pips: Math.max(0, pips) };
  }
  function phaseAt(tc) { return RAIL.find(r => tc >= r.from && tc < r.to) || RAIL[0]; }
  function musicFor(tc) {
    if (tc < 4000 || tc >= 26400) return 'title';
    if (tc >= 9000 && tc < POP) return 'battle';
    return 'field';
  }

  /* ---------------- clock + drive ---------------- */
  let mode = qs.get('mode') === 'jukebox' ? 'jukebox' : 'scene', simT = 0, sceneT = 0, lastTc = -1;
  function step() {
    music.update(STEP);
    simT += STEP;
    if (mode !== 'scene') return;
    const prev = lastTc; sceneT += STEP; const tc = sceneT % CYC; lastTc = tc;
    const crossed = e => prev >= 0 && ((prev < e && tc >= e) || (prev > tc && tc >= e));
    if (crossed(POP)) music.jingle('victory', { after: 'field' });   // at the step the event is decided
    if (crossed(OPEN)) music.jingle('item');
    music.play(musicFor(tc), sceneT < STEP * 1.5 ? { at: 'now' } : undefined);   // every step; the same track is a no-op
  }

  /* ---------------- scene render (native 256x144, integer-scaled) ---------------- */
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const g = off.getContext('2d'); g.imageSmoothingEnabled = false;
  const view = $('game'), vg = view.getContext('2d');
  const fl = document.createElement('canvas'); fl.width = 16; fl.height = 16; const flg = fl.getContext('2d');
  function drawSlime(gg, s, ox, oy) {
    const img = SLIME[s.frame], x = Math.round(s.x - 6 + ox), y = Math.round(s.y - 10 - s.hop + oy);
    gg.fillStyle = 'rgba(16,10,30,0.35)'; gg.fillRect(Math.round(s.x - 5 + ox), Math.round(s.y + oy), 10, 1);
    if (s.flash) { flg.clearRect(0, 0, 16, 16); flg.globalCompositeOperation = 'source-over'; flg.drawImage(img, 0, 0); flg.globalCompositeOperation = 'source-atop'; flg.fillStyle = '#ffffff'; flg.fillRect(0, 0, 16, 16); flg.globalCompositeOperation = 'source-over'; gg.drawImage(fl, x, y); }
    else gg.drawImage(img, x, y);
    for (let i = 0; i < 3; i++) { gg.fillStyle = '#1a1024'; gg.fillRect(x + 1 + i * 4, y - 5, 3, 3); gg.fillStyle = i < s.pips ? '#ff5a6a' : '#3a2a40'; gg.fillRect(x + 2 + i * 4, y - 4, 1, 1); }
  }
  function sparks(gg, cx, cy, t, n, r0, col, seed) {
    for (let k = 0; k < n; k++) { const a = k * 2 * Math.PI / n + seed, r = r0 + t * 0.03; gg.fillStyle = col; gg.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.75), 1, 1); if (t < 120) gg.fillRect(Math.round(cx + Math.cos(a) * (r - 2)), Math.round(cy + Math.sin(a) * (r - 2) * 0.75), 1, 1); }
  }
  let VW = { x: 0, y: 0, w: W, h: H };
  function viewWindow(h) {
    const cssW = $('stage').clientWidth;
    if (cssW >= 2 * W || cssW < 160) return { x: 0, y: 0, w: W, h: H };
    const w = 160, hh = 90, x = Math.max(0, Math.min(W - w, Math.round(h.x - w / 2))), y = Math.max(0, Math.min(H - hh, Math.round(h.y - 8 - hh / 2)));
    return { x, y, w, h: hh };
  }
  let TEXTS = [], PLATES = [], HERO_TOP = false, DIM = 0;
  const TX = (id, str, x, y, o) => { const r = PF.draw(g, str, x, y, o); if (r && r.w) TEXTS.push({ id, x: r.x, y: r.y, w: r.w, h: r.h }); return r; };
  // a dark plate exactly as wide as its (centred) text, so letter counters stay opaque without covering the scene around it
  const PLATE = (id, str, cx, y, o) => { const z = PF.size(str, o) || { w: 0, h: 0 }, r = { id, x: Math.floor(cx - z.w / 2) - 3, y: y - 2, w: z.w + 6, h: z.h + 4 };
    g.fillStyle = 'rgba(8,8,22,0.62)'; g.fillRect(r.x, r.y, r.w, r.h); PLATES.push(r); };
  function renderScene() {
    TEXTS = []; PLATES = []; HERO_TOP = false;
    const tc = sceneT % CYC, ms = sceneT, st = music.state();
    VW = viewWindow(heroAt(tc));
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    const h = heroAt(tc), s = slimeAt(tc), ex = [];
    ex.push({ y: CHEST.y, draw: gg => { if (tc >= OPEN && tc < 26400) gg.drawImage(CHEST_OPEN, CHEST.x - 7, CHEST.y - 12); else PXS.drawProp(gg, 'chest', CHEST.x, CHEST.y, {}, ms); } });
    if (s) ex.push({ y: s.y, draw: gg => drawSlime(gg, s, 0, 0) });
    ex.push({ y: h.y, draw: gg => { if (h.x > -10 && h.x < W + 10) drawHero(gg, h.x, h.y, h.dir, h.frame, h.hop); } });
    SC.draw(g, ms, ex, 0, 0);
    // battle: edges pulse on the battle loop's beats (read from the music clock)
    if (tc >= 9000 && tc < POP + 300) {
      const L = st.loop, beatU = L && L.track === 'battle' ? (L.rowF % L.rpb) / L.rpb : 1, a = (tc >= POP ? 1 - (tc - POP) / 300 : 1) * (0.16 + 0.22 * Math.pow(1 - beatU, 3));
      const gr = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 160); gr.addColorStop(0, 'rgba(160,20,40,0)'); gr.addColorStop(1, `rgba(150,16,40,${a.toFixed(3)})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    if (tc >= 8650 && tc < 9300 && s) TX('alert', '!', s.x, s.y - 26 - s.hop, { align: 'center', scale: 2, color: '#ffe070', shadow: 'outline' });
    for (const b of BUMPS) { const d = tc - b; if (d >= 0 && d < 260) sparks(g, 117, PATH_Y - 6, d, 8, 3, d < 100 ? '#ffffff' : '#ffe9a8', b * 0.001); }
    if (tc >= POP && tc < POP + 700) { const d = tc - POP; sparks(g, 128, PATH_Y - 5, d, 12, 4, '#c8ffb0', 0.3); sparks(g, 128, PATH_Y - 5, d * 0.6, 8, 2, '#ffffff', 1.1); }
    if (tc >= POP && tc < 16000) for (let k = 0; k < 5; k++) { const d = (tc - POP - k * 400); if (d > 0 && d < 1400) { g.globalAlpha = 1 - d / 1400; g.fillStyle = k % 2 ? '#ffe070' : '#ffffff'; g.fillRect(Math.round(h.x - 9 + k * 4.5), Math.round(h.y - 22 - d * 0.012), 1, 1); g.globalAlpha = 1; } }
    if (tc >= OPEN && tc < OPEN + 1900) { const d = tc - OPEN, a = d < 1400 ? 1 : 1 - (d - 1400) / 500; g.globalAlpha = Math.max(0, a); const rise = Math.min(12, d * 0.012); PXS.glow(g, CHEST.x, Math.round(CHEST.y - 8 - rise), 10, '#9fe8ff', 0.6); g.drawImage(GEM, CHEST.x - 2, Math.round(CHEST.y - 10 - rise)); g.globalAlpha = 1; }
    // event banners in the scene: VICTORY over the field, FOUND A GEM at the chest (pop in, hold, fade)
    const banner = (txt, t0, t1, col) => { if (tc < t0 || tc >= t1) return; const u = tc - t0, a = Math.min(1, u / 150, (t1 - tc) / 300), sc = u < 120 && VW.w >= W ? 3 : 2;
      g.globalAlpha = a; g.fillStyle = 'rgba(8,8,20,0.72)'; const by = VW.y + VW.h - 30; g.fillRect(VW.x, by, VW.w, 22); g.fillStyle = col; g.fillRect(VW.x, by, VW.w, 1); g.fillRect(VW.x, by + 21, VW.w, 1);
      TX('banner', txt, VW.x + VW.w / 2, by + 11, { align: 'center', baseline: 'middle', scale: sc, color: col, shadow: 'outline' }); g.globalAlpha = 1; };
    banner('VICTORY!', POP + 250, 16000, '#ffe070'); banner('FOUND A GEM', OPEN + 200, OPEN + 1900, '#9fe8ff');
    // title card and fades
    let dim = 0;
    if (tc < 4400) dim = tc < 4000 ? 0.55 : 0.55 * (1 - (tc - 4000) / 400);
    if (tc >= 25400) dim = Math.min(1, (tc - 25400) / 1000);
    if (tc >= 27200) dim = 1 - (tc - 27200) / 800 * 0.45;
    DIM = dim;
    if (dim > 0) { g.fillStyle = `rgba(6,8,16,${dim.toFixed(3)})`; g.fillRect(0, 0, W, H); }
    const titleA = tc < 4000 ? 1 : tc < 4400 ? 1 - (tc - 4000) / 400 : tc >= 27200 ? (tc - 27200) / 800 : 0;
    if (titleA > 0) {
      g.globalAlpha = titleA;
      // full view: the card in the sky band. Camera window: the logo between the badge row and the hero's head, the two
      // lines below the hero's feet (never over the badge, the hero or the road band he stands on)
      const cx = VW.x + VW.w / 2, small = VW.w < W, hh = heroAt(tc);
      const yLogo = small ? VW.y + 19 : 34, ySub = small ? hh.y + 3 : 66, yGo = small ? hh.y + 15 : 88;
      const oLogo = { align: 'center', scale: small ? 2 : 3, shadow: 'outline' }, oSub = { align: 'center', scale: 1, shadow: 'drop' }, oGo = { align: 'center', scale: small ? 1 : 2, shadow: 'outline' };
      const showGo = Math.floor(tc / 500) % 2 === 0 || tc >= 27200;
      PLATE('title', 'MEADOW ROAD', cx, yLogo, oLogo); PLATE('subtitle', 'A SHORT WALK WITH MUSIC', cx, ySub, oSub); if (showGo) PLATE('start', 'PRESS START', cx, yGo, oGo);
      TX('title', 'MEADOW ROAD', cx, yLogo, { align: 'center', scale: small ? 2 : 3, color: '#ffe890', shadow: 'outline' });
      TX('subtitle', 'A SHORT WALK WITH MUSIC', cx, ySub, { align: 'center', scale: 1, color: '#c8d4ff', shadow: 'drop' });
      if (showGo) TX('start', 'PRESS START', cx, yGo, { align: 'center', scale: small ? 1 : 2, color: '#ffffff', shadow: 'outline' });
      // the waiting hero stays at scene brightness above the title dim (he fades in with the card)
      if (hh.x > -10 && hh.x < W + 10) { g.globalAlpha = titleA; drawHero(g, hh.x, hh.y, hh.dir, hh.frame, hh.hop); HERO_TOP = true; }
      g.globalAlpha = 1;
    }
    music.draw(g, VW.x + VW.w - 27, VW.y + 4);
    // integer scale of the view window to the display canvas
    const dpr = window.devicePixelRatio || 1, avail = Math.max(VW.w, Math.floor($('stage').clientWidth * dpr)), k = Math.max(1, Math.floor(avail / VW.w));
    if (view.width !== VW.w * k || view.height !== VW.h * k) { view.width = VW.w * k; view.height = VW.h * k; view.style.width = (VW.w * k / dpr) + 'px'; view.style.height = (VW.h * k / dpr) + 'px'; }
    vg.imageSmoothingEnabled = false; vg.drawImage(off, VW.x, VW.y, VW.w, VW.h, 0, 0, VW.w * k, VW.h * k);
  }

  /* ---------------- piano roll: the plan on the music clock ---------------- */
  const roll = $('roll'), rg = roll.getContext('2d');
  function rowsOfSeg(seg, c, t0, t1) {
    // every note event of the segment that sounds between clocks t0..t1: {ch, k, midi, fx, drum, s, e (clock ms)}
    const out = [], rm = seg.rowMs, endC = Math.min(seg.cEnd, seg.cMusicEnd != null ? seg.cMusicEnd : Infinity);
    const xFrom = Math.max(seg.r0, seg.r0 + (t0 - seg.c0) / rm - 64), xTo = seg.r0 + (Math.min(t1, endC) - seg.c0) / rm;
    if (xTo < seg.r0) return out;
    const passes = [];   // [unwrapped start, song row offset] blocks
    if (!c.loop) passes.push([0, 0, c.total]);
    else { passes.push([0, 0, c.total]); for (let k = 0, base = c.total; base < xTo + c.loopRows; k++, base += c.loopRows) passes.push([base - c.loopRow, c.loopRow, c.total]); }
    for (const ch of ['p1', 'p2', 'tri', 'noise']) for (const [shift, rFrom, rTo] of passes) for (const e of c.ev[ch]) {
      if (e.k === 'rest' || e.row < rFrom || e.row >= rTo) continue;
      const xs = e.row + shift, xe = (e.end != null ? e.end : e.row + 1) + shift;
      if (xe <= seg.r0 || xs > xTo || xe < xFrom) continue;
      const s = seg.c0 + (Math.max(xs, seg.r0) - seg.r0) * rm, en = Math.min(endC, seg.c0 + (xe - seg.r0) * rm);
      if (en <= s) continue;
      out.push({ ch, k: e.k, midi: e.midi, fx: e.fx, drum: e.drum, s, e: en, cut: xs < seg.r0 });
    }
    return out;
  }
  function rr(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function segShort(seg) {   // narrow screens: "Meadow Road  > 2.4"
    const S = SONGS[seg.track]; if (seg.announce !== 'resume') return S.title;
    const c = S.c; return S.title + ' \u21bb ' + (Math.floor(seg.r0 / (c.rpb * c.bpb)) + 1) + '.' + (Math.floor((seg.r0 % (c.rpb * c.bpb)) / c.rpb) + 1);
  }
  function segLabel(seg) {
    const S = SONGS[seg.track], t = S ? S.title : seg.track;
    if (seg.kind === 'jingle') return '♪ ' + t;
    if (seg.announce === 'resume') { const c = S.c, b = Math.floor(seg.r0 / (c.rpb * c.bpb)) + 1, bt = Math.floor((seg.r0 % (c.rpb * c.bpb)) / c.rpb) + 1; return t + ' · resumes bar ' + b + ' beat ' + bt; }
    return t;
  }
  function drawRoll(st) {
    const dpr = window.devicePixelRatio || 1, cw = roll.clientWidth, chh = roll.clientHeight;
    if (roll.width !== Math.round(cw * dpr) || roll.height !== Math.round(chh * dpr)) { roll.width = Math.round(cw * dpr); roll.height = Math.round(chh * dpr); }
    const c = rg; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cw, chh);
    const now = st.clock, span = cw < 520 ? 4400 : 6600, pxms = cw / span, head = Math.round(cw * 0.3), t0 = now - head / pxms, t1 = now + (cw - head) / pxms;
    const X = t => head + (t - now) * pxms;
    const RIB = 24, top = RIB + 14, bot = chh - 6, LH = bot - top, lanes = { p1: [top, LH * 0.34], p2: [0, LH * 0.25], tri: [0, LH * 0.22], noise: [0, LH * 0.19] };
    lanes.p2[0] = lanes.p1[0] + lanes.p1[1]; lanes.tri[0] = lanes.p2[0] + lanes.p2[1]; lanes.noise[0] = lanes.tri[0] + lanes.tri[1];
    // lane backgrounds
    c.fillStyle = '#0b0a14'; c.fillRect(0, 0, cw, chh);
    ['p1', 'p2', 'tri', 'noise'].forEach((ch, i) => { const [y, h] = lanes[ch]; c.fillStyle = i % 2 ? '#0d0c18' : '#100e1d'; c.fillRect(0, y, cw, h); c.fillStyle = '#ffffff08'; c.fillRect(0, y, cw, 1); });
    const plan = music.plan().filter(s => s.c0 < t1 && Math.min(s.cEnd, s.cMusicEnd != null ? s.cMusicEnd : Infinity) > t0 && SONGS[s.track]);
    const ducks = music.ducks();
    // beat and bar lines, bar numbers, loop wraps
    c.font = '600 10px ui-monospace, Menlo, monospace'; c.textBaseline = 'top';
    for (const seg of plan) {
      const S = SONGS[seg.track].c, endC = Math.min(seg.cEnd, seg.cMusicEnd != null ? seg.cMusicEnd : Infinity);
      const a = Math.max(seg.c0, t0), b = Math.min(endC, t1);
      if (seg.kind === 'jingle' && plan.some(o => o.kind === 'loop' && o.c0 < endC && o.cEnd > seg.c0)) continue;   // duck: one axis, the loop's
      if (seg.c0 >= t0 && seg.r0 % (S.rpb * S.bpb)) { c.fillStyle = '#8e88aa'; c.fillText(String(Math.floor(seg.r0 / (S.rpb * S.bpb)) + 1), X(seg.c0) + 3, RIB + 2); }
      for (let x = Math.ceil(seg.r0 + (a - seg.c0) / seg.rowMs - 1e-6); seg.c0 + (x - seg.r0) * seg.rowMs < b - 0.5; x++) {
        const cx = Math.round(X(seg.c0 + (x - seg.r0) * seg.rowMs)) + 0.5, wrapped = S.loop && x >= S.total ? S.loopRow + ((x - S.total) % S.loopRows) : x;
        if (x % S.rpb) continue;
        const bar = wrapped % (S.rpb * S.bpb) === 0;
        c.fillStyle = bar ? '#ffffff26' : '#ffffff0e'; c.fillRect(cx - 0.5, top, 1, LH);
        if (bar) { c.fillStyle = '#8e88aa'; c.fillText(String(Math.floor(wrapped / (S.rpb * S.bpb)) + 1), cx + 3, RIB + 2); }
        if (S.loop && x >= S.total && (x - S.total) % S.loopRows === 0) { c.fillStyle = '#7ee0c3'; c.fillRect(cx - 1, top, 2, LH); c.fillText('↺ loop', cx + 4, RIB + 2); }
      }
    }
    // notes
    const lanePitch = (ch, m) => { const R = RANGE[ch], [y, h] = lanes[ch], n = R.hi - R.lo + 1 + 2 * Math.abs(st.loop ? st.loop.transpose : 0); return y + h - 3 - ((m - R.lo + (st.loop ? -Math.min(0, st.loop.transpose) : 0)) + 0.5) / n * (h - 6); };
    for (const seg of plan) {
      const S = SONGS[seg.track].c, isJ = seg.kind === 'jingle', tr = seg.transpose || 0;
      const ducked = t => ducks.some(d => t >= d.c0 && t < d.c1) && !isJ;
      for (const n of rowsOfSeg(seg, S, t0, t1)) {
        const x0 = X(n.s), x1 = X(n.e), active = n.s <= now && now < n.e, past = n.e <= now;
        const [ly, lh] = lanes[n.ch];
        let alpha = past ? 0.38 : active ? 1 : 0.8; if (ducked(n.s)) alpha *= 0.45;
        const col = COL[n.ch];
        if (n.k === 'drum') {
          const rowH = lh / 5, y = ly + 2 + DRUM_ROW[n.drum] * (rowH - 0.4), len = Math.max(4, Math.min(x1 - x0, DRUM_LEN[n.drum] * pxms));
          c.globalAlpha = alpha; c.fillStyle = isJ ? JCOL : DRUM_SHADE[n.drum];
          const gr = c.createLinearGradient(x0, 0, x0 + len, 0); gr.addColorStop(0, isJ ? JCOL : DRUM_SHADE[n.drum]); gr.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = gr; rr(c, x0, y, len, Math.max(3, rowH - 2.5), 2); c.fill();
          if (active && now - n.s < 140) { c.globalAlpha = 1 - (now - n.s) / 140; c.fillStyle = '#ffffff'; rr(c, x0 - 1, y - 1, 6, Math.max(3, rowH - 2.5) + 2, 2); c.fill(); }
          c.globalAlpha = 1; continue;
        }
        const m = n.midi + tr, y = lanePitch(n.ch, m), hgt = Math.max(3, Math.min(8, lh / (RANGE[n.ch].hi - RANGE[n.ch].lo + 1) * 1.6));
        const w = Math.max(2, x1 - x0 - 1.5);
        c.globalAlpha = alpha;
        if (active) { c.shadowColor = isJ ? JCOL : col; c.shadowBlur = 12; }
        if (n.fx && n.fx.slide != null) {
          const y2 = lanePitch(n.ch, n.fx.slide + tr), xs = x0 + w * 0.85;
          c.fillStyle = col; c.beginPath(); c.moveTo(x0, y - hgt / 2); c.lineTo(xs, y2 - hgt / 2); c.lineTo(x0 + w, y2 - hgt / 2); c.lineTo(x0 + w, y2 + hgt / 2); c.lineTo(xs, y2 + hgt / 2); c.lineTo(x0, y + hgt / 2); c.closePath(); c.fill();
        } else { c.fillStyle = col; rr(c, x0, y - hgt / 2, w, hgt, 2); c.fill(); }
        c.shadowBlur = 0;
        if (isJ) { c.strokeStyle = JCOL; c.lineWidth = 1; rr(c, x0 + 0.5, y - hgt / 2 - 0.5, w - 1, hgt + 1, 2); c.stroke(); }
        if (n.fx && n.fx.arp) { c.fillStyle = col; c.globalAlpha = alpha * 0.55; for (const o of n.fx.arp.slice(1)) { const ya = lanePitch(n.ch, m + o); c.fillRect(x0, ya - 1, w, 2); } }
        if (n.fx && n.fx.vib) { c.strokeStyle = '#ffffff'; c.globalAlpha = alpha * 0.7; c.lineWidth = 1; c.beginPath(); for (let xx = x0 + 3; xx < x0 + w - 1; xx += 1) c.lineTo(xx, y - hgt / 2 - 2 + Math.sin((xx - x0) * 0.6) * 1.2); c.stroke(); }
        if (active) { c.globalAlpha = 0.9; c.fillStyle = '#ffffff'; c.fillRect(Math.max(x0, head - 1), y - hgt / 2 + 1, 2, hgt - 2); }
        c.globalAlpha = 1;
      }
    }
    // duck bands (duck-mode jingles) over the loop lanes
    for (const d of ducks) { const a = X(d.c0), b = X(d.c1); if (b < 0 || a > cw) continue; c.fillStyle = 'rgba(255,209,102,0.06)'; c.fillRect(a, top, b - a, LH); }
    // segment ribbon
    c.fillStyle = '#0e0c18'; c.fillRect(0, 0, cw, RIB);
    for (const seg of plan) {
      const endC = Math.min(seg.cEnd, seg.cMusicEnd != null ? seg.cMusicEnd : Infinity), a = X(seg.c0), b = Math.min(cw + 4, X(endC));
      if (b <= a + 1) continue;
      const isJ = seg.kind === 'jingle', col = isJ ? JCOL : seg.track === 'battle' ? '#ff8a7a' : seg.track === 'title' ? '#b8a8ff' : '#7ee0c3', future = seg.c0 > now;
      c.globalAlpha = future ? 0.75 : 1;
      c.fillStyle = isJ ? '#3a2f12' : '#1c2a3a'; rr(c, a + 1, 3, b - a - 2, RIB - 6, 5); c.fill();
      c.strokeStyle = col; c.lineWidth = 1; if (future) c.setLineDash([3, 3]); rr(c, a + 1.5, 3.5, b - a - 3, RIB - 7, 5); c.stroke(); c.setLineDash([]);
      if (b - Math.max(a, 0) < 46) { c.globalAlpha = 1; continue; }
      c.save(); c.beginPath(); c.rect(Math.max(a + 6, 2), 0, Math.max(0, b - Math.max(a + 6, 2) - 6), RIB); c.clip();
      c.fillStyle = col; c.font = '700 11px ui-sans-serif, system-ui, sans-serif'; c.textBaseline = 'middle';
      const room = b - Math.max(a + 7, 4) - 8, full = segLabel(seg) + (future ? (seg.announce === 'resume' ? '' : '  (next ' + (isJ ? 'row' : 'beat') + ')') : '');
      const lbl = [full, segLabel(seg), segShort(seg), SONGS[seg.track].title, seg.track].find(t => c.measureText(t).width <= room) || '';   // never a cut word
      c.fillText(lbl, Math.max(a + 7, 4), RIB / 2);
      c.restore(); c.globalAlpha = 1;
    }
    // fades at the edges, lane labels, playhead
    let gr = c.createLinearGradient(0, 0, 56, 0); gr.addColorStop(0, '#0b0a14'); gr.addColorStop(1, 'rgba(11,10,20,0)'); c.fillStyle = gr; c.fillRect(0, top, 56, LH);
    gr = c.createLinearGradient(cw - 40, 0, cw, 0); gr.addColorStop(0, 'rgba(11,10,20,0)'); gr.addColorStop(1, '#0b0a14'); c.fillStyle = gr; c.fillRect(cw - 40, top, 40, LH);
    c.font = '700 10px ui-monospace, Menlo, monospace'; c.textBaseline = 'top';
    [['p1', 'P1'], ['p2', 'P2'], ['tri', 'TRI'], ['noise', 'NOISE']].forEach(([ch, lb]) => { const [y] = lanes[ch]; c.fillStyle = COL[ch]; c.fillText(lb, 6, y + 4); });
    c.fillStyle = '#ffffff'; c.shadowColor = '#7ee0c3'; c.shadowBlur = 10; c.fillRect(head - 1, RIB, 2, chh - RIB); c.shadowBlur = 0;
    c.beginPath(); c.moveTo(head - 5, RIB); c.lineTo(head + 5, RIB); c.lineTo(head, RIB + 6); c.closePath(); c.fill();
  }

  /* ---------------- channel strips ---------------- */
  const strips = $('strips'), SCOPE = {};
  ['p1', 'p2', 'tri', 'noise'].forEach(ch => {
    const d = document.createElement('div'); d.className = 'strip'; d.style.setProperty('--c', COL[ch]); d.id = 'st-' + ch;
    d.innerHTML = `<div class="hd">${CHN[ch]}<small id="du-${ch}"></small><button class="mbtn" id="mu-${ch}" title="Mute this channel" aria-label="Mute ${CHN[ch]}" aria-pressed="false">M</button></div><div class="nt"><b id="nt-${ch}">-</b><span id="fx-${ch}"></span></div><canvas id="sc-${ch}"></canvas><div class="lv"><i id="lv-${ch}"></i></div>`;
    strips.appendChild(d);
  });
  const chanOn = { p1: 1, p2: 1, tri: 1, noise: 1 };
  ['p1', 'p2', 'tri', 'noise'].forEach(ch => $('mu-' + ch).addEventListener('click', e => { e.stopPropagation(); chanOn[ch] = chanOn[ch] ? 0 : 1; music.channels({ [ch]: chanOn[ch] }); $('mu-' + ch).classList.toggle('on', !chanOn[ch]); $('mu-' + ch).setAttribute('aria-pressed', chanOn[ch] ? 'false' : 'true'); $('st-' + ch).classList.toggle('off', !chanOn[ch]); }));
  function drawScope(ch, info, row) {
    const cv = $('sc-' + ch), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    c.fillStyle = '#ffffff10'; c.fillRect(0, h / 2, w, 1);
    const lv = Math.max(0, Math.min(1, info.level || 0)) * (chanOn[ch] ? 1 : 0); if (lv < 0.02) return;
    const A = (h / 2 - 3) * lv, cyc = 2.5;
    c.strokeStyle = COL[ch]; c.lineWidth = 1.5; c.shadowColor = COL[ch]; c.shadowBlur = 6; c.beginPath();
    if (ch === 'noise') { let s = (row * 2654435761) >>> 0; for (let x = 0; x <= w; x += 2) { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0; c.lineTo(x, h / 2 - ((s & 1) ? 1 : -1) * A * (0.4 + 0.6 * ((s >>> 8) & 255) / 255)); } }
    else for (let x = 0; x <= w; x++) {
      const ph = (x / w * cyc) % 1; let v;
      if (ch === 'tri') { const stp = Math.floor(ph * 32), q = stp < 16 ? stp : 31 - stp; v = q / 15 * 2 - 1; }
      else v = ph < (info.duty || 0.5) ? 1 : -1;
      c.lineTo(x, h / 2 - v * A);
    }
    c.stroke(); c.shadowBlur = 0;
  }
  function updateStrips(st) {
    const src = st.jingle || st.loop;
    st.channels.forEach(info => {
      const ch = info.ch; $('nt-' + ch).textContent = info.note ? (ch === 'noise' ? info.note : info.note) : '-';
      $('fx-' + ch).textContent = info.fx || (ch === 'noise' ? '' : info.note ? '' : 'rest');
      $('du-' + ch).textContent = ch === 'p1' || ch === 'p2' ? (info.duty ? Math.round(info.duty * 100) + '%' : '') : ch === 'tri' ? '4-bit' : 'LFSR';
      $('lv-' + ch).style.width = Math.round(Math.max(0, Math.min(1, info.level || 0)) * 100 * (chanOn[ch] ? 1 : 0)) + '%';
      drawScope(ch, info, src ? src.row : 0);
    });
  }

  /* ---------------- header, status, rail, jukebox, mixer, log ---------------- */
  function fmtPos(c, row) { return 'bar ' + (Math.floor(row / (c.rpb * c.bpb)) + 1) + ' beat ' + (Math.floor((row % (c.rpb * c.bpb)) / c.rpb) + 1); }
  function updateHeader(st) {
    const src = st.jingle || st.loop, S = src ? SONGS[src.track] : null;
    $('kind').textContent = st.jingle ? 'JINGLE' : st.loop ? 'LOOP' : st.next ? 'WAITING' : 'STOPPED';
    $('kind').className = 'kind' + (st.jingle ? ' jingle' : st.loop ? '' : ' wait');
    $('trackTitle').textContent = S ? S.title : st.next ? SONGS[st.next.track].title : '-';
    $('trackSub').textContent = S ? `${src.track} · ${S.c.total / (S.c.rpb * S.c.bpb)} bar${S.c.total / (S.c.rpb * S.c.bpb) === 1 ? '' : 's'} · ${S.kind === 'loop' ? 'loops every ' + (S.seconds / (src.tempo || 1)).toFixed(1) + ' s' : (S.seconds / (src.tempo || 1)).toFixed(1) + ' s one-shot'}` : '-';
    $('posBar').textContent = src ? src.bar : '-'; $('posBeat').textContent = src ? src.beat : '-'; $('posBpm').textContent = src ? Math.round(src.bpm) : '-';
    const pats = $('pats'), key = src ? src.track + '|' + src.pattern : '';
    if (pats.dataset.k !== (src ? src.track : '')) { pats.dataset.k = src ? src.track : ''; pats.innerHTML = src ? S.c.order.map((p, i) => `<i data-i="${i}">${p}</i>`).join('') : ''; }
    if (pats.dataset.on !== key) { pats.dataset.on = key; [...pats.children].forEach(el => el.classList.toggle('on', src && +el.dataset.i === src.orderIx)); }
    let s = '';
    const L = st.loop, J = st.jingle, nx = st.next;
    if (J && nx && nx.kind === 'resume') s = `<b>${SONGS[J.track].title}</b> jingle · ${SONGS[nx.track].title} is paused and resumes at <b>${fmtPos(SONGS[nx.track].c, nx.row)}</b> in ${(nx.inMs / 1000).toFixed(1)} s, on the beat`;
    else if (J && nx) s = `<b>${SONGS[J.track].title}</b> jingle · then <b>${SONGS[nx.track].title}</b> from its top in ${(nx.inMs / 1000).toFixed(1)} s`;
    else if (J && st.phase === 'jingle-duck') s = `<b>${SONGS[J.track].title}</b> jingle over the ducked loop · the loop comes back up on its next beat`;
    else if (J) s = `<b>${SONGS[J.track].title}</b> jingle · then silence`;
    else if (L && nx) s = `Playing <b>${SONGS[L.track].title}</b> · <b>${SONGS[nx.track].title}</b> starts on the next beat (in ${(nx.inMs / 1000).toFixed(2)} s)`;
    else if (L) s = `Looping <b>${SONGS[L.track].title}</b> · pass ${L.pass + 1} · ${fmtPos(SONGS[L.track].c, L.row)} · the wrap back to bar 1 is seamless`;
    else s = 'Stopped';
    if (st.locked) s += ' · <span style="color:#ffb0bc">silent until you click</span>';
    if (st.muted) s += ' · <span style="color:#ffe08a">muted</span>';
    if ($('status').dataset.s !== s) { $('status').dataset.s = s; $('status').innerHTML = s; }
    const pill = $('soundState'), cls = st.locked ? '' : st.muted ? 'muted' : 'on';
    const mb = $('muteBtn'), ml = st.muted ? 'Unmute' : 'Mute'; if (mb.textContent !== ml) { mb.textContent = ml; mb.setAttribute('aria-pressed', st.muted ? 'true' : 'false'); }
    if (pill.className !== cls) { pill.className = cls; $('soundText').textContent = st.locked ? 'Sound off: click anywhere to turn it on' : st.muted ? 'Muted: click to unmute' : 'Sound on: click to mute'; }
    $('clockOut').textContent = (st.clock / 1000).toFixed(1) + ' s';
  }
  const rail = $('rail');
  RAIL.forEach((r, i) => { if (i) rail.insertAdjacentHTML('beforeend', '<span class="ar">›</span>'); rail.insertAdjacentHTML('beforeend', `<div class="st${r.j ? ' j' : ''}" data-id="${r.id}">${r.label}<small>${r.mus}</small></div>`); });
  function updateRail() { const tc = sceneT % CYC, ph = mode === 'scene' ? phaseAt(tc).id : null; [...rail.querySelectorAll('.st')].forEach(el => el.classList.toggle('on', el.dataset.id === ph)); }
  // jukebox
  function miniRoll(cv, c) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 280, h = cv.clientHeight || 22; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const ch of ['tri', 'p2', 'p1']) { const R = RANGE[ch]; x.fillStyle = COL[ch]; x.globalAlpha = ch === 'p1' ? 0.9 : 0.45; for (const e of c.ev[ch]) if (e.k === 'note') { const y = h - 2 - (e.midi - R.lo) / (R.hi - R.lo) * (h - 4); x.fillRect(e.row / c.total * w, y - 1, Math.max(1, (e.end - e.row) / c.total * w - 0.6), 2); } }
    x.globalAlpha = 1;
  }
  const trkEls = {};
  Object.values(SONGS).forEach(S => {
    const b = document.createElement('button'); b.className = 'trk' + (S.kind === 'jingle' ? ' jg' : ''); b.dataset.t = S.name;
    b.innerHTML = `<span>${S.title}</span><small>${S.name} · ${S.bpm} bpm · ${S.seconds.toFixed(1)} s</small><canvas></canvas>`;
    $(S.kind === 'jingle' ? 'jingles' : 'loops').appendChild(b); trkEls[S.name] = b;
    b.addEventListener('click', e => { e.stopPropagation(); setMode('jukebox'); if (S.kind === 'jingle') music.jingle(S.name); else music.play(S.name); });
  });
  function drawMinis() { Object.values(SONGS).forEach(S => miniRoll(trkEls[S.name].querySelector('canvas'), S.c)); }
  function updateTracks(st) { const on = st.jingle ? st.jingle.track : st.loop ? st.loop.track : null; for (const k in trkEls) trkEls[k].classList.toggle('on', k === on); }
  // mixer
  const CTL = [['volume', 'Volume', 0, 1, 0.05, P0.volume, v => v.toFixed(2)], ['tempo', 'Tempo', 0.75, 1.5, 0.05, P0.tempo, v => 'x' + v.toFixed(2)], ['transpose', 'Key', -6, 6, 1, P0.transpose, v => (v > 0 ? '+' : '') + v]];
  CTL.forEach(([k, lb, mn, mx, stp, v, f]) => {
    const d = document.createElement('div'); d.className = 'ctl';
    d.innerHTML = `<label for="c-${k}">${lb}</label><input type="range" id="c-${k}" min="${mn}" max="${mx}" step="${stp}" value="${v}"><output id="o-${k}">${f(v)}</output>`;
    $('ctls').appendChild(d);
    $('c-' + k).addEventListener('input', e => { const val = +e.target.value; $('o-' + k).textContent = f(val); music.setParams({ [k]: val }); });
  });
  { const d = document.createElement('div'); d.className = 'ctl'; d.innerHTML = '<label>Sound</label><span><button class="b" id="muteBtn" aria-pressed="false">Mute</button></span><span></span>'; $('ctls').appendChild(d); }
  $('muteBtn').addEventListener('click', e => { e.stopPropagation(); music.toggle(); });
  function segInit(id, key) { const el = $(id); const sync = () => [...el.children].forEach(b => b.classList.toggle('on', b.dataset.v === music.params()[key])); el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; music.setParams({ [key]: b.dataset.v }); sync(); }); sync(); }
  segInit('jmode', 'jingleMode'); segInit('rmode', 'resume');
  // mode
  function setMode(m) {
    mode = m; [...$('mode').children].forEach(b => b.classList.toggle('on', b.dataset.m === m)); $('sceneOver').classList.toggle('hide', m === 'scene');
    if (m === 'scene') { lastTc = -1; }
  }
  $('mode').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m); });
  $('backScene').addEventListener('click', () => setMode('scene'));
  $('soundState').addEventListener('click', () => { music.toggle(); });
  view.addEventListener('pointerdown', e => { const r = view.getBoundingClientRect(); music.hit(VW.x + (e.clientX - r.left) * VW.w / r.width, VW.y + (e.clientY - r.top) * VW.h / r.height); });
  setMode(mode);
  // event log
  const TYPE = { switch: 'switch', queued: 'queued', jingle: 'jingle', 'jingle-start': 'jingle', resume: 'resume', loop: 'loop', 'jingle-end': 'jingle-end', stop: 'stop', unlocked: 'unlocked' };
  function evText(e) {
    const t = e.track && SONGS[e.track] ? SONGS[e.track].title : e.track;
    switch (e.type) {
      case 'switch': return `${t} starts` + (e.bar ? ` at bar ${e.bar} beat ${e.beat}` : '');
      case 'queued': return e.after ? `${t} after the ${SONGS[e.after] ? SONGS[e.after].title : e.after} jingle` : `${t} queued for the next beat`;
      case 'jingle-start': return `${t} jingle starts`;
      case 'jingle': return `${t} (${e.mode})` + (e.resumeRow != null ? ` · paused at row ${e.pausedRow}, back at row ${e.resumeRow}` : e.then ? ` · then ${SONGS[e.then] ? SONGS[e.then].title : e.then}` : e.restoreAt ? ' · loop ducked' : ' · then silence');
      case 'resume': return `${t} resumes at bar ${e.bar} beat ${e.beat}`;
      case 'loop': return `${t} wraps to bar 1, no seam`;
      case 'jingle-end': return `${t} jingle ends`;
      case 'unlocked': return 'Sound on (first click)';
      case 'stop': return 'Music fades out';
    }
    return t || e.type;
  }
  function updateLog() {
    if (!logDirty) return; logDirty = false;
    const rows = LOG.filter(e => TYPE[e.type]).slice(-7).reverse();
    $('log').innerHTML = rows.map(e => `<li><span class="t">${(e.t / 1000).toFixed(1)}s</span><span class="p">${evText(e)}</span><span class="pill ${TYPE[e.type]}">${e.type === 'jingle-end' ? 'end' : e.type === 'jingle-start' ? 'start' : e.type}</span></li>`).join('');
  }

  /* ---------------- frame ---------------- */
  function renderAll() {
    const st = music.state();
    renderScene(); drawRoll(st); updateStrips(st); updateHeader(st); updateRail(); updateTracks(st); updateLog();
  }
  window.__state = () => {
    const tc = sceneT % CYC, h = heroAt(tc), s = slimeAt(tc), st = music.state(), actors = [];
    if (h.x > -10 && h.x < W + 10) {
      const a = { id: 'hero', x: h.x, y: h.y, facing: h.dir, asset: 'pixel-kit-actor:hero', vx: h.vx };
      if (h.dir === 'up' || h.dir === 'down') a.noFace = 'top-down ' + h.dir + ' frame' + (h.target === 'chest' ? ' (faces the chest above)' : '');
      else a.target = h.target === 'slime' && s ? 'slime' : null;
      actors.push(a);
    }
    if (s) actors.push({ id: 'slime', x: s.x, y: s.y, noFace: 'frontal art' });
    const L = st.loop, J = st.jingle;
    return { t: Math.round(simT), scene: mode === 'scene' ? phaseAt(tc).id : 'jukebox', sceneT: Math.round(tc), actors,
      music: { phase: st.phase, track: st.track, loop: L && { track: L.track, row: L.row, bar: L.bar, beat: L.beat, pattern: L.pattern, pass: L.pass }, jingle: J && { track: J.track, row: J.row }, next: st.next, locked: st.locked, muted: st.muted,
        notes: st.channels.map(c => c.ch + ':' + (c.note || '-')).join(' ') },
      events: LOG.slice(-5).map(e => e.type + ':' + (e.track || '') + (e.bar ? '@' + e.bar + '.' + e.beat : '')) };
  };
  window.__textScan = (from, to) => {
    const keep = sceneT, out = [], ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    let frames = 0;
    for (let t = from; t < to; t += STEP) {
      sceneT = t; renderScene(); frames++;
      const tc = t % CYC, h = heroAt(tc), badge = music.lastDrawn()[0], heroBox = { x: h.x - 7, y: h.y - 16 - h.hop, w: 14, h: 17 }, onScreen = h.x > -10 && h.x < W + 10;
      const titleOn = tc < 4400 || tc >= 27200;
      PLATES.forEach(r => { if (onScreen && ov(r, heroBox)) out.push({ t: Math.round(t), text: 'plate:' + r.id, hits: 'hero' }); if (badge && ov(r, badge)) out.push({ t: Math.round(t), text: 'plate:' + r.id, hits: 'badge' }); });
      if (badge && onScreen && ov(badge, heroBox)) out.push({ t: Math.round(t), text: 'badge', hits: 'hero' });
      if (titleOn && onScreen && DIM > 0.05 && !HERO_TOP) out.push({ t: Math.round(t), text: 'title dim', hits: 'hero' });
      TEXTS.forEach((r, i) => {
        if (badge && ov(r, badge)) out.push({ t: Math.round(t), text: r.id, hits: 'badge' });
        if (onScreen && ov(r, heroBox)) out.push({ t: Math.round(t), text: r.id, hits: 'hero' });
        TEXTS.forEach((q, j) => { if (j > i && ov(r, q)) out.push({ t: Math.round(t), text: r.id, hits: q.id }); });
        if (r.x < VW.x || r.y < VW.y || r.x + r.w > VW.x + VW.w || r.y + r.h > VW.y + VW.h) out.push({ t: Math.round(t), text: r.id, hits: 'view edge' });
      });
    }
    sceneT = keep; renderScene();
    return { frames, view: VW.w + 'x' + VW.h, problems: out.slice(0, 20), count: out.length };
  };
  window.__cast = { hero: (gg, x, footY, dir, frame) => drawHero(gg, x, footY, dir, frame || 0, 0, false), slime: (gg, x, footY, frame) => { gg.imageSmoothingEnabled = false; gg.drawImage(SLIME[(frame || 0) % 2], Math.round(x - 6), Math.round(footY - 9)); } };

  if (FREEZE_T != null) {
    for (let n = Math.floor(FREEZE_T / STEP); n > 0; n--) step();
    drawMinis(); renderAll();
    if (FROZEN) { window.__frozen = true; return; }
  } else { drawMinis(); renderAll(); }
  let acc = 0, prev = null;
  function frame(now) {
    if (prev === null) prev = now;
    acc += Math.min(250, now - prev); prev = now;
    while (acc >= STEP) { step(); acc -= STEP; }
    renderAll();
    requestAnimationFrame(frame);
  }
  addEventListener('resize', () => { drawMinis(); });
  requestAnimationFrame(frame);
})();
