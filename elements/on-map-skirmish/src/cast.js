/* A-18 demo cast: small map units hand-pixelled in code (original art). Each unit is head + torso + legs rows plus a weapon
 * layer; a 1 px dark outline is added after composing. Native art looks RIGHT; the left side is painted, not mirrored: the
 * body is mirrored with the light kept top-left (highlight and shadow letters swapped) and the weapon stays in the same
 * (right) hand, which is now the far hand, so it is drawn behind the body. Poses: idle0, idle1, attack, hurt; the weapon is
 * held in every pose. (At 22 px the left view reads as a mirror; that is intended for map sprites.) Works in node (pixels) and in the browser (canvases).
 * window.GameDNA_SkirmishCast = { CLASSES, pixels(cls, pose, side), canvas(cls, pose, side), size(cls), foot(cls) }
 */
(function (root) {
  'use strict';
  var OL = '#1a1024';
  var BASE = {
    s: '#f8c8a0', S: '#c8845c', e: '#2a1428', w: '#f4f4ff', v: '#a8b0d8',
    l: '#f0f6ff', m: '#a8b4d0', M: '#58607e', b: '#a86c38', B: '#5c3418', g: '#ffd858', G: '#b87a1c', n: '#3a2418'
  };
  var TEAM = {
    a: { 1: '#121a52', 2: '#2442a4', 3: '#3c72e4', 4: '#98c4ff', r: '#e8d070', R: '#a8802a' },
    b: { 1: '#480c18', 2: '#901e26', 3: '#d4442e', 4: '#ffa47c', r: '#5a4a3a', R: '#2e241c' }
  };
  var SWAP = { j: 'H', H: 'j', l: 'M', M: 'l', 4: '2', 2: '4', s: 'S', S: 's' };
  var SWAP_SAFE = { j: 1, H: 1 };   // hair light and shadow flip so the light stays top-left; metal, team and skin keep their tones

  /* ---------- parts (22 wide; the unit stands with its feet on row 21; native: facing right) ---------- */
  var W = 22, H = 24;
  var HEADS = {
    lord: [
      '........hhhh..........',
      '......hjjjjhh.........',
      '.....hjhhhhhhh........',
      '.....hhhhh33333.......',
      '....Hhhhhsssss........',
      '....Hhhhssssese.......',
      '....HHhSssssese.......',
      '.....HHSSsssss........',
      '.......SSSsss.........'],
    lancer: [
      '........MMMM..........',
      '......MmmllmmM........',
      '.....MmmmmlllmM.......',
      '.....Mmmmmmmmmm.......',
      '....MMm33333333.......',
      '....MMmMssssese.......',
      '....MMMMSsssese.......',
      '.....MMMSSssss........',
      '.......MMMMMM.........'],
    brigand: [
      '......................',
      '.......3333...........',
      '.....33444433.........',
      '....2333333333........',
      '...22hhhhhhhhh........',
      '...2.Hhhsssese........',
      '.....HhSssssese.......',
      '.....HHSSsssss........',
      '.......SSnnnn.........'],
    soldier: [
      '........MMM...........',
      '......MMmmlM..........',
      '.....MmmmmmllM........',
      '....MMmmmmmmmmM.......',
      '....MMMMMMMMMMMM......',
      '.....HHSssssese.......',
      '.....HSSssssese.......',
      '......SSSsssss........',
      '.......SSSsss.........']
  };
  var TORSOS = {
    tunic: [
      '.....rr2333334........',
      '....rRr22333344s......',
      '....RRr2233333ss......',
      '....RRr2BBggbbB.......',
      '....RR.22333332.......',
      '.....R.1222222........'],
    plate: [
      '.....MMmmmmlll........',
      '....MMm222333llm......',
      '....MMm2223333ms......',
      '....MMmBBBggbBm.......',
      '.....Mm1223332........',
      '......M1111111........'],
    vest: [
      '.....ss2333334........',
      '....sS22bb3344s.......',
      '....SS22bbb333ss......',
      '....SS.2BBggbbB.......',
      '......22333332........',
      '......1222222.........'],
    mail: [
      '.....MMmmmmmml........',
      '....MM2233333mms......',
      '....MM22333333ss......',
      '....MM.2BBggbBB.......',
      '......22333332........',
      '......1222222.........']
  };
  var LEGS = {
    boots: [
      '.......1BB.bB.........',
      '.......BBb.bbB........',
      '......BBBb.BBbB.......',
      '......nnnn.nnnnn......'],
    greaves: [
      '.......MmM.mlM........',
      '.......MmM.MmM........',
      '......MMmM.MMmM.......',
      '......nnnn.nnnnn......']
  };
  // attack: the front leg steps forward 1 px and the back heel lifts
  var LEGS_ATK = {
    boots: [
      '.......1BB..bB........',
      '......BBb...bbB.......',
      '.....BBBb...BBbB......',
      '.....nnnn....nnnnn....'],
    greaves: [
      '.......MmM..mlM.......',
      '......MmM...MmM.......',
      '.....MMmM...MMmM......',
      '.....nnnn....nnnnn....']
  };
  // weapons: pixel lists [x, y, letter] in canvas space for each pose (the grip sits in the front hand)
  var WEAPONS = {
    sword: {
      hand: { idle: [15, 13], attack: [16, 12], hurt: [14, 14] },
      idle: [[16, 13, 'G'], [16, 12, 'g'], [15, 12, 'g'], [17, 12, 'g'], [16, 11, 'm'], [17, 10, 'l'], [17, 9, 'l'], [18, 8, 'l'], [18, 7, 'm'], [19, 6, 'l']],
      attack: [[17, 12, 'G'], [18, 11, 'g'], [18, 12, 'g'], [18, 13, 'g'], [19, 12, 'l'], [20, 12, 'l'], [21, 12, 'm'], [19, 11, 'm'], [20, 11, 'l']],
      hurt: [[15, 15, 'G'], [15, 14, 'g'], [14, 14, 'g'], [16, 14, 'g'], [16, 16, 'm'], [17, 17, 'l'], [18, 18, 'l'], [19, 19, 'm']]
    },
    spear: {
      hand: { idle: [15, 13], attack: [16, 12], hurt: [14, 14] },
      idle: [[16, 20, 'B'], [16, 19, 'b'], [16, 18, 'b'], [16, 17, 'b'], [16, 16, 'b'], [16, 15, 'B'], [16, 14, 'b'], [16, 13, 'b'], [16, 12, 'b'], [16, 11, 'b'], [16, 10, 'b'], [16, 9, 'b'], [16, 8, 'b'], [16, 7, 'b'], [16, 6, 'G'], [16, 5, 'm'], [16, 4, 'l'], [15, 5, 'M'], [17, 5, 'm'], [16, 3, 'l'], [16, 2, 'l']],
      attack: [[10, 13, 'B'], [11, 13, 'b'], [12, 13, 'b'], [13, 12, 'b'], [14, 12, 'b'], [15, 12, 'b'], [17, 12, 'b'], [18, 11, 'G'], [19, 11, 'm'], [20, 11, 'l'], [19, 10, 'm'], [19, 12, 'M'], [21, 11, 'l']],
      hurt: [[13, 20, 'B'], [13, 19, 'b'], [14, 18, 'b'], [14, 17, 'b'], [14, 16, 'b'], [15, 13, 'b'], [15, 12, 'b'], [15, 11, 'b'], [16, 10, 'b'], [16, 9, 'b'], [16, 8, 'G'], [17, 7, 'm'], [17, 6, 'l'], [18, 5, 'l'], [16, 7, 'M']]
    },
    axe: {
      hand: { idle: [15, 13], attack: [16, 13], hurt: [14, 14] },
      idle: [[16, 14, 'B'], [16, 13, 'b'], [16, 12, 'b'], [16, 11, 'b'], [16, 10, 'b'], [16, 9, 'b'], [16, 8, 'B'], [17, 7, 'M'], [17, 8, 'm'], [17, 9, 'm'], [18, 7, 'm'], [18, 8, 'l'], [18, 9, 'm'], [18, 10, 'M'], [19, 8, 'l'], [19, 9, 'l'], [18, 6, 'M'], [19, 7, 'm']],
      attack: [[17, 13, 'B'], [18, 13, 'b'], [19, 13, 'b'], [20, 13, 'b'], [19, 14, 'M'], [20, 14, 'm'], [21, 14, 'm'], [20, 15, 'l'], [21, 15, 'l'], [21, 16, 'm'], [20, 16, 'M'], [21, 13, 'B']],
      hurt: [[15, 15, 'B'], [15, 14, 'b'], [16, 16, 'b'], [17, 17, 'b'], [18, 18, 'B'], [17, 19, 'M'], [18, 19, 'm'], [19, 19, 'l'], [19, 18, 'l'], [19, 17, 'm'], [18, 17, 'M']]
    }
  };
  // classes: [head, torso, legs, weapon, hair ramp (H, h, j), team, name]
  var CLASSES = {
    lord: { head: 'lord', torso: 'tunic', legs: 'boots', weapon: 'sword', hair: ['#5c2c18', '#9a5428', '#d88a48'], team: 'a' },
    lancer: { head: 'lancer', torso: 'plate', legs: 'greaves', weapon: 'spear', hair: ['#3a2a20', '#5c4430', '#8a6a48'], team: 'a' },
    brigand: { head: 'brigand', torso: 'vest', legs: 'boots', weapon: 'axe', hair: ['#2a1a14', '#4a3020', '#6a4a30'], team: 'b' },
    soldier: { head: 'soldier', torso: 'mail', legs: 'boots', weapon: 'spear', hair: ['#4a2a18', '#6a4024', '#8a5a34'], team: 'b' },
    warlord: { boss: true, team: 'b' }
  };

  /* ---------- the boss: a horned, caped warlord with a double-bladed great axe, 30 x 34 ---------- */
  var BW = 30, BH = 34;
  var BOSS_BODY = [
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '........l.........l...........',
    '........ll.......ll...........',
    '.........ll.....ll............',
    '..........lMMMMMll............',
    '.........MMmmmmmmMM...........',
    '........MMmmmllmmmmM..........',
    '........MmmmmmmmmmmM..........',
    '........MqqqqEEqqEEq..........',
    '........MMmmmmmmmmmM..........',
    '.......qqMMmmmmmmmMMqq........',
    '......qzqq3333333333qqq.......',
    '.....qzqqMmm33443mmMMqqq......',
    '.....qzqMmmm344433mmmMqq......',
    '.....qqqMmm3344433mmmMqq......',
    '....qqqqMMm3333333mmMMqqq.....',
    '....qqqqqMBBBggBBBBMqqqqq.....',
    '....qqqqqMm2233322mMqqqqq.....',
    '....Qqqqq.M2222222M.qqqqQ.....',
    '....QQqqq.MMm222mMM.qqqQQ.....',
    '.....QQqq..MmM.MmM..qqQQ......',
    '.....QQQq..MmM.MmM..qQQQ......',
    '......QQQ.MMmM.MMmM.QQQ.......',
    '..........nnnnn.nnnnnn........'];
  // great axe: haft in the front hand, double blade above the shoulder
  var BOSS_AXE = {
    idle: { haft: [[20, 10, 26], [21, 14, 15]], head: [21, 3] },
    brace: { haft: [[20, 6, 22]], head: [21, -1] },
    attack: { haft: [[20, 11, 14], [21, 14, 16], [22, 16, 18]], headFwd: [23, 14] },
    hurt: { haft: [[19, 11, 26]], head: [20, 4] }
  };
  var AXE_HEAD = [
    '.l...l.',
    'lml.lml',
    'lmmMmml',
    'lmmMmml',
    'lml.lml',
    '.l...l.'];

  function grid(w, h) { var G = []; for (var y = 0; y < h; y++) { G.push([]); for (var x = 0; x < w; x++) G[y].push('.'); } return G; }
  function stamp(G, rows, ox, oy) { for (var y = 0; y < rows.length; y++) for (var x = 0; x < rows[y].length; x++) { var ch = rows[y][x]; if (ch === '.') continue; var X = x + ox, Y = y + oy; if (Y >= 0 && Y < G.length && X >= 0 && X < G[0].length) G[Y][X] = ch; } }
  function put(G, x, y, ch) { if (y >= 0 && y < G.length && x >= 0 && x < G[0].length) G[y][x] = ch; }

  function unitLayers(cls, pose) {
    var C = CLASSES[cls], body = grid(W, H), wpn = grid(W, H);
    var bob = pose === 'idle1' ? 1 : 0, lean = pose === 'attack' ? 1 : pose === 'hurt' ? -1 : 0;
    var legs = pose === 'attack' ? LEGS_ATK[C.legs] : LEGS[C.legs];
    stamp(body, legs, 0, 17);
    stamp(body, TORSOS[C.torso], lean, 11 + bob);
    var head = HEADS[C.head].slice();
    if (pose === 'hurt') head = head.map(function (r) { return r.replace(/e/g, 's'); });
    stamp(body, head, lean + (pose === 'hurt' ? -1 : 0), 2 + bob + (pose === 'hurt' ? 1 : 0));
    if (pose === 'hurt') { put(body, 11 + lean - 1, 8 + bob, 'e'); put(body, 12 + lean - 1, 8 + bob, 'e'); put(body, 13 + lean - 1, 7 + bob, 'S'); }   // squeezed eye: a dark dash
    var wp = WEAPONS[C.weapon], wpose = pose === 'attack' ? 'attack' : pose === 'hurt' ? 'hurt' : 'idle', hand = wp.hand[wpose];
    wp[wpose].forEach(function (p) { put(wpn, p[0] + (pose === 'idle1' ? 0 : 0), p[1] + (wpose === 'idle' ? bob : 0), p[2]); });
    // the front hand closes over the grip
    put(body, hand[0], hand[1] + (wpose === 'idle' ? bob : 0), 's'); put(body, hand[0], hand[1] + 1 + (wpose === 'idle' ? bob : 0), 'S');
    return { body: body, wpn: wpn, w: W, h: H };
  }
  function bossLayers(pose) {
    var body = grid(BW, BH), wpn = grid(BW, BH), bob = pose === 'idle1' ? 1 : 0, up = pose === 'brace' ? -2 : 0;
    var rows = BOSS_BODY.slice();
    if (pose === 'hurt') rows = rows.map(function (r) { return r.replace(/E/g, 'q'); });
    var legsTop = 23;
    stamp(body, rows.slice(legsTop), 0, legsTop + 4);
    stamp(body, rows.slice(0, legsTop), pose === 'attack' ? 1 : 0, 4 + bob + up);
    if (pose === 'hurt') { put(body, 13, 15 + bob, 'E'); put(body, 17, 15 + bob, 'E'); }
    var A = BOSS_AXE[pose === 'idle1' ? 'idle' : pose === 'idle0' ? 'idle' : pose], dy = pose === 'idle1' ? 1 : 0;
    A.haft.forEach(function (h) { for (var y = h[1] + dy; y <= h[2]; y++) put(wpn, h[0], y + 4, y === h[1] + dy ? 'B' : 'b'); });   // the butt stays on the ground
    if (A.head) stamp(wpn, AXE_HEAD, A.head[0] - 3, A.head[1] + dy + 4);
    if (A.headFwd) stamp(wpn, AXE_HEAD.map(function (r) { return r; }), A.headFwd[0], A.headFwd[1] + 1);
    // gauntlet on the haft
    var hy = pose === 'attack' ? 20 : pose === 'brace' ? 13 : 19 + dy;
    var hx = pose === 'attack' ? 20 : 20;
    put(body, hx, hy, 'M'); put(body, hx + 1, hy, 'm'); put(body, hx, hy + 1, 'M'); put(body, hx + 1, hy + 1, 'M');
    return { body: body, wpn: wpn, w: BW, h: BH };
  }
  function palette(cls, team) {
    var C = CLASSES[cls], P = Object.assign({}, BASE, TEAM[team || C.team]);
    if (C.hair) { P.H = C.hair[0]; P.h = C.hair[1]; P.j = C.hair[2]; }
    if (C.boss) Object.assign(P, { E: '#ff4a2a', z: '#6a6488', q: '#3e3852', Q: '#221c30', M: '#4a4e66', m: '#8a90aa', l: '#e8ecf8' });
    return P;
  }
  function compose(cls, pose, side) {
    var C = CLASSES[cls], L = C.boss ? bossLayers(pose) : unitLayers(cls, pose), w = L.w, h = L.h, out = grid(w, h), x, y, ch;
    var left = side === 'left';
    var mx = function (x) { return left ? w - 1 - x : x; };
    // weapon behind the body when facing left (the same hand, now the far one), in front when facing right
    var layers = left ? [['wpn', L.wpn], ['body', L.body]] : [['body', L.body], ['wpn', L.wpn]];
    layers.forEach(function (ly) {
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        ch = ly[1][y][x]; if (ch === '.') continue;
        if (left && SWAP_SAFE[ch]) ch = SWAP[ch];
        out[y][mx(x)] = ch;
      }
    });
    // 1 px outline (8-neighbour) around everything
    var o = grid(w, h);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      if (out[y][x] !== '.') { o[y][x] = out[y][x]; continue; }
      var n = false;
      for (var dy = -1; dy <= 1 && !n; dy++) for (var dx = -1; dx <= 1; dx++) { var yy = y + dy, xx = x + dx; if ((dx || dy) && yy >= 0 && yy < h && xx >= 0 && xx < w && out[yy][xx] !== '.') { n = true; break; } }
      if (n) o[y][x] = 'o';
    }
    return o;
  }
  function hex(c) { var n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function pixels(cls, pose, side, team) {
    var G = compose(cls, pose, side || 'right'), P = palette(cls, team), h = G.length, w = G[0].length, d = new Uint8Array(w * h * 4);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var ch = G[y][x]; if (ch === '.') continue;
      var c = hex(ch === 'o' ? OL : P[ch] || '#ff00ff'), i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
    return { w: w, h: h, data: d };
  }
  var CACHE = {};
  function canvas(cls, pose, side, team) {
    var key = cls + pose + side + (team || ''); if (CACHE[key]) return CACHE[key];
    var p = pixels(cls, pose, side, team), c = document.createElement('canvas'); c.width = p.w; c.height = p.h;
    var g = c.getContext('2d'), id = g.createImageData(p.w, p.h); id.data.set(p.data); g.putImageData(id, 0, 0);
    return (CACHE[key] = c);
  }
  function size(cls) { return CLASSES[cls].boss ? { w: BW, h: BH } : { w: W, h: H }; }
  // feet: x of the body centre, y of the lowest row (sole)
  function foot(cls) { return CLASSES[cls].boss ? { x: 15, y: 31 } : { x: 11, y: 21 }; }
  root.GameDNA_SkirmishCast = { CLASSES: CLASSES, POSES: ['idle0', 'idle1', 'attack', 'hurt'], pixels: pixels, canvas: canvas, size: size, foot: foot, compose: compose };
})(typeof window !== 'undefined' ? window : this);
