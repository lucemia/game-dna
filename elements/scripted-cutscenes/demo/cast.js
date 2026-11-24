/* H-04 demo cast: three top-down chibis hand-pixelled in code (demo only, never part of the module). ASCII only.
 * One global: GameDNA_CutCast.  frame(id, dir, step, run) -> canvas 32 x 40, feet on row 36 at x 16 (wide enough for a tilted spear in every frame).
 *   dir: 'down' | 'up' | 'right' | 'left';  step: -1 standing, 0..3 a walk cycle (0 near leg forward / contact, 1 passing with
 *   the body 1 px up, 2 far leg forward / contact, 3 passing); run: longer stride, feet lifted higher, wider arm swing, body leaning
 *   into the run (side views 1 px forward).
 * Every frame is painted, not mirrored as a whole: the left side view mirrors the body but keeps each held item in the hand that holds
 * it (the captain's spear in his right hand, the elder's staff in her left hand), drawn in front of or behind the body as that hand is.
 *   traveller ('hero'): young, auburn hair, blue tunic, brown travelling cloak, satchel
 *   captain ('guard'): steel helmet with a red plume, steel breastplate over a red tabard, pauldrons, spear; dark hair, young face
 *   elder: white hair in a bun, long violet robe (only the feet step under the hem), wooden staff with a knot
 */
(function (root) {
  'use strict';
  var W = 32, H = 40, OX = 6, OY = 10, INK = '#1a1024';
  var PAL = {
    hero: { skin: '#f6c8a0', skinD: '#d6976e', hair: '#b4582c', hairD: '#7c3618', hairL: '#e0844a', top: '#3c72e4', topD: '#2442a4', topL: '#8cb8ff',
      legs: '#4c3c34', legsD: '#33271f', boot: '#6a4026', bootD: '#45281a', cloak: '#8a5a32', cloakD: '#5e3a1e', belt: '#e8b040' },
    guard: { skin: '#f2c49a', skinD: '#cf8f66', hair: '#3a2a22', hairD: '#24160f', hairL: '#5a4232', top: '#b8c4d4', topD: '#7a869a', topL: '#eef4fa',
      tab: '#c43438', tabD: '#86202c', legs: '#4a4e60', legsD: '#30323f', boot: '#5a4636', bootD: '#3a2a20', plume: '#e83a3a', plumeD: '#a01e2a', belt: '#e8b040' },
    elder: { skin: '#f0c4a2', skinD: '#c48a66', hair: '#eceef6', hairD: '#b0b4c8', hairL: '#ffffff', top: '#8a58b4', topD: '#5c3484', topL: '#b88ade',
      boot: '#5a3a28', bootD: '#3a2416', sash: '#e0b040', staff: '#8a5a30', staffD: '#5c3a1c', knot: '#b07840' }
  };
  var CACHE = {};

  function frame(id, dir, step, run) {
    var key = id + dir + step + (run ? 'r' : ''); if (CACHE[key]) return CACHE[key];
    var C = PAL[id] || PAL.hero, G = [], y, x;
    for (y = 0; y < H; y++) { G.push([]); for (x = 0; x < W; x++) G[y].push(null); }
    var side = dir === 'left' || dir === 'right', mir = dir === 'left';
    var walking = step >= 0, pass = step === 1 || step === 3, bob = walking && pass ? -1 : 0;
    var fwd = step === 0 ? 1 : step === 2 ? -1 : 0;           // +1 near / left-of-screen leg forward, -1 the other
    var lift = run ? 3 : 2, reach = run ? 2 : 1, lean = run && side ? 1 : 0;
    // P paints body pixels (mirrored for the left view); Q paints without mirroring (held items placed by hand)
    function put(px, py, c) { if (px >= 0 && py >= 0 && px < W && py < H) G[py][px] = c; }
    function P(x0, y0, w, h, c, dy) { dy = dy || 0; for (var j = 0; j < (h || 1); j++) for (var i = 0; i < (w || 1); i++) { var X = x0 + i + OX, Y = y0 + j + OY + dy; put(mir ? W - 1 - X : X, Y, c); } }
    function Q(X, Y, c) { put(X, Y, c); }
    function U(x0, y0, w, h, c) { P(x0 + lean, y0, w, h, c, bob); }   // upper body: bobs and leans

    var robe = id === 'elder';
    /* ---------- held items drawn BEHIND the body ---------- */
    function heldItem(front) {
      // where the holding hand is: guard holds with the right hand, elder with the left
      var handRight = id === 'guard';
      if (id === 'hero') return;
      var hx, hy = 23 + OY + bob, behind;
      if (dir === 'down') { hx = handRight ? 4 + OX : 16 + OX; behind = false; }
      else if (dir === 'up') { hx = handRight ? 16 + OX : 4 + OX; behind = true; }
      else { var nearIsRight = dir === 'left'; var isNear = handRight ? nearIsRight : !nearIsRight; behind = !isNear; hx = dir === 'right' ? (isNear ? 15 + OX + lean : 14 + OX + lean) : (isNear ? W - 1 - (15 + OX + lean) : W - 1 - (14 + OX + lean)); }
      if (behind === front) return;
      var tilt = run && side ? (dir === 'right' ? 1 : -1) : 0;
      if (id === 'guard') {       // spear: shaft from above the head to the ground, steel tip
        for (var yy = 2 + OY + bob - 6; yy <= 26 + OY; yy++) { var tx = hx + (tilt ? Math.round((24 + OY - yy) * 0.18) * tilt : 0); Q(tx, yy, yy < 3 + OY + bob - 6 + 1 ? C.topL : (yy % 5 === 0 ? '#6a4426' : '#8a5a34')); }
        var tipX = hx + (tilt ? Math.round((24 + OY - (OY - 5)) * 0.18) * tilt : 0);
        Q(tipX, OY - 7 + bob, '#eef4fa'); Q(tipX, OY - 6 + bob, '#eef4fa'); Q(tipX - 1, OY - 5 + bob, '#b8c4d4'); Q(tipX + 1, OY - 5 + bob, '#7a869a'); Q(tipX, OY - 5 + bob, '#ffffff');
        Q(tipX, OY - 4 + bob, '#7a869a'); Q(tipX - 1, OY - 3 + bob, C.tab); Q(tipX + 1, OY - 3 + bob, C.tabD);
      } else {                    // staff: a little taller than her, a knot at the top
        for (var y2 = 6 + OY + bob; y2 <= 26 + OY; y2++) Q(hx, y2, y2 % 4 === 0 ? C.staffD : C.staff);
        Q(hx - 1, 5 + OY + bob, C.knot); Q(hx, 4 + OY + bob, C.knot); Q(hx + 1, 5 + OY + bob, C.staffD); Q(hx, 5 + OY + bob, C.knot);
      }
      Q(hx, hy, C.skin); Q(hx, hy + 1, C.skinD);   // the hand on it
    }
    heldItem(false);

    /* ---------- legs / feet ---------- */
    if (!side) {
      // front / back: the stepping foot (lifted) and the planted foot; legs stretch 1 px on passing frames (body up)
      var legTop = 21 + bob, lA = fwd === -1 ? lift : 0, lB = fwd === 1 ? lift : 0;   // A = viewer's left leg
      if (!robe) {
        P(7, legTop, 2, 26 - legTop - lA, C.legs); P(8, legTop, 1, 26 - legTop - lA, C.legsD);
        P(11, legTop, 2, 26 - legTop - lB, C.legs); P(12, legTop, 1, 26 - legTop - lB, C.legsD);
      }
      P(6, 25 - lA, 3, 2, C.boot); P(6, 26 - lA, 3, 1, C.bootD);
      P(11, 25 - lB, 3, 2, C.boot); P(13, 26 - lB, 1, 1, C.bootD); P(11, 26 - lB, 2, 1, C.bootD);
    } else {
      // side (drawn facing right, mirrored for left): far leg first, darker
      var near = fwd === 1 ? reach + 1 : fwd === -1 ? -(reach + 1) : 0, far = -near;
      var nearLift = step === 3 ? lift : 0, farLift = step === 1 ? lift : 0;
      if (run) { if (step === 0) farLift = 1; if (step === 2) nearLift = 1; }
      function sideLeg(dxFoot, liftN, c, cd, b, bd) {
        var top = 21 + bob;
        if (!robe) for (var yy = top; yy <= 25 - liftN; yy++) { var k = (yy - top) / Math.max(1, 25 - liftN - top), lx = 10 + Math.round(dxFoot * k); P(lx, yy, 2, 1, c); P(lx + 1, yy, 1, 1, cd); }
        var fx = 10 + dxFoot; P(fx, 25 - liftN, 3, 1, b); P(fx, 26 - liftN, 3, 1, bd); P(fx + 3, 26 - liftN, 1, 1, bd);
      }
      sideLeg(far, farLift, robe ? null : C.legsD, robe ? null : C.legsD, C.bootD, INK);
      sideLeg(near, nearLift, C.legs, C.legsD, C.boot, C.bootD);
    }

    /* ---------- arms behind the torso (side: the far arm) ---------- */
    var swing = fwd * (run ? 3 : 2);   // + : near arm back (opposite to the near leg forward)
    if (side) { var fa = -swing; for (var a = 0; a < 5; a++) U(10 + Math.round(fa * a / 5) - (fa < 0 ? 0 : 0), 15 + a, 2, 1, robe ? C.topD : C.topD); U(10 + fa, 20, 2, 1, C.skinD); }

    /* ---------- torso ---------- */
    if (robe) {
      // robe from the shoulders to the hem (hem sways 1 px with the step)
      var sway = side ? 0 : fwd;
      if (!side) { U(6, 13, 9, 7, C.top); P(5 + Math.max(0, sway), 20 + bob, 11, 5 - bob, C.top); P(13 + Math.max(0, sway), 20 + bob, 2, 5 - bob, C.topD); P(5 + Math.max(0, sway), 24, 11, 1, C.topD); U(7, 13, 1, 7, C.topL); U(6, 18, 9, 1, C.sash); }
      else { U(7, 13, 7, 7, C.top); P(6 + lean, 20 + bob, 9, 5 - bob, C.top); P(6 + lean, 24, 9, 1, C.topD); U(12, 13, 2, 7, C.topD); U(7, 18, 7, 1, C.sash); P(14 + lean + (fwd === 1 ? 1 : 0), 22, 1, 2, C.top); }
    } else if (!side) {
      U(6, 13, 9, 8, C.top); U(13, 13, 2, 8, C.topD); U(7, 14, 1, 5, C.topL); U(6, 19, 9, 1, C.belt);
      if (id === 'guard') { U(9, 14, 3, 7, dir === 'up' ? C.topD : C.tab); U(11, 14, 1, 7, C.tabD); U(5, 13, 2, 2, C.topL); U(14, 13, 2, 2, C.topD); }
      if (id === 'hero') { if (dir === 'up') { U(5, 13, 11, 9, C.cloak); U(13, 13, 3, 9, C.cloakD); U(5, 21, 11, 1, C.cloakD); } else { U(6, 13, 1, 4, C.cloak); U(14, 13, 1, 4, C.cloakD); U(10, 14, 1, 5, '#6a4026'); U(12, 19, 3, 3, '#9a6a3a'); U(12, 21, 3, 1, '#6a4026'); } }
    } else {
      U(8, 13, 6, 8, C.top); U(12, 13, 2, 8, C.topD); U(9, 14, 1, 5, C.topL); U(8, 19, 6, 1, C.belt);
      if (id === 'guard') { U(11, 14, 2, 6, C.tab); U(8, 13, 3, 2, C.topL); }
      if (id === 'hero') { U(5, 13, 3, 9, C.cloak); U(5, 21, 3, 1, C.cloakD); U(6 - (walking && pass ? 0 : 1), 20, 2, 2, C.cloakD); U(9, 19, 3, 3, '#9a6a3a'); }
    }

    /* ---------- arms in front ---------- */
    if (!side) {
      // front / back: the arm on the forward leg's side swings back (shorter), the other forward (longer, hand lower)
      var aL = 6 + (fwd === 1 ? -(run ? 2 : 1) : fwd === -1 ? (run ? 1 : 1) : 0), aR = 6 + (fwd === -1 ? -(run ? 2 : 1) : fwd === 1 ? 1 : 0);
      if (dir === 'up') { var t = aL; aL = aR; aR = t; }
      var armL = id === 'elder' && dir === 'up' ? 0 : 1, armC = robe ? C.top : C.top;
      U(4, 14, 2, aL - 1, armC); U(4, 13 + aL, 2, 1, C.skin); U(15, 14, 2, aR - 1, robe ? C.topD : C.topD); U(15, 13 + aR, 2, 1, C.skinD);
      if (id === 'guard') { U(4, 13, 2, 2, C.topL); U(15, 13, 2, 2, C.topD); }
    } else {
      // near arm swings opposite to the near leg; hand pixel at the end
      for (var b2 = 0; b2 < 5; b2++) U(10 + Math.round(-swing * b2 / 5 * -1) * 1 - 0, 15 + b2, 2, 1, robe ? C.top : (id === 'guard' ? C.topD : C.top));
      U(10 - swing * -1, 20, 2, 1, C.skin);
      if (id === 'guard') U(9, 13, 4, 2, C.topL);
    }

    /* ---------- head ---------- */
    if (dir === 'down') {
      U(6, 6, 9, 7, C.skin); U(14, 7, 1, 6, C.skinD); U(6, 12, 9, 1, C.skinD);
      U(8, 9, 1, 2, INK); U(12, 9, 1, 2, INK); U(7, 11, 1, 1, '#f09a90'); U(13, 11, 1, 1, '#f09a90');
    } else if (dir === 'up') {
      U(6, 6, 9, 7, C.hair); U(13, 7, 2, 6, C.hairD);
    } else {
      U(7, 6, 8, 7, C.skin); U(14, 7, 1, 5, C.skinD); U(13, 9, 1, 2, INK); U(15, 10, 1, 1, C.skinD); U(12, 11, 1, 1, '#f09a90');
    }
    if (id === 'hero') {
      if (dir === 'down') { U(5, 3, 11, 4, C.hair); U(5, 7, 2, 4, C.hair); U(14, 7, 2, 3, C.hairD); U(7, 2, 4, 1, C.hair); U(8, 7, 3, 1, C.hair); U(7, 4, 3, 1, C.hairL); U(12, 2, 2, 1, C.hairD); }
      else if (dir === 'up') { U(5, 3, 11, 9, C.hair); U(7, 2, 4, 1, C.hair); U(7, 4, 4, 1, C.hairL); U(13, 4, 3, 7, C.hairD); U(6, 12, 9, 1, C.hairD); }
      else { U(6, 3, 9, 4, C.hair); U(5, 5, 4, 7, C.hair); U(13, 6, 2, 1, C.hair); U(7, 2, 4, 1, C.hair); U(8, 4, 3, 1, C.hairL); U(5, 9, 2, 3, C.hairD); }
    } else if (id === 'guard') {
      // helmet (steel), rim, nose guard on the front view, red plume sweeping back
      if (dir === 'down') { U(5, 3, 11, 4, C.top); U(5, 7, 11, 1, C.topD); U(7, 3, 3, 1, C.topL); U(14, 3, 2, 4, C.topD); U(10, 7, 1, 2, C.topD); U(6, 8, 1, 3, C.hair); U(14, 8, 1, 3, C.hairD); U(9, 0, 3, 3, C.plume); U(10, -1, 2, 1, C.plume); U(11, 1, 1, 2, C.plumeD); }
      else if (dir === 'up') { U(5, 3, 11, 5, C.top); U(5, 7, 11, 1, C.topD); U(13, 3, 3, 5, C.topD); U(6, 8, 9, 5, C.hair); U(7, 9, 7, 1, C.hairL); U(13, 8, 2, 5, C.hairD); U(9, 0, 3, 3, C.plume); U(9, 3, 3, 3, C.plumeD); U(10, -1, 2, 1, C.plume); }
      else { U(6, 3, 10, 4, C.top); U(5, 7, 11, 1, C.topD); U(8, 3, 3, 1, C.topL); U(6, 8, 3, 4, C.hair); U(14, 7, 1, 2, C.topD); U(5, 1, 5, 2, C.plume); U(3, 2, 3, 3, C.plume); U(3, 4, 2, 2, C.plumeD); U(9, 0, 2, 2, C.plume); }
    } else {
      if (dir === 'down') { U(5, 3, 11, 4, C.hair); U(5, 7, 2, 5, C.hair); U(14, 7, 2, 5, C.hairD); U(8, 1, 5, 2, C.hair); U(9, 0, 3, 1, C.hairL); U(7, 4, 3, 1, C.hairL); U(9, 7, 3, 1, C.hairD); }
      else if (dir === 'up') { U(5, 3, 11, 9, C.hair); U(8, 1, 5, 2, C.hair); U(9, 0, 3, 1, C.hairL); U(9, 2, 3, 2, C.hairD); U(13, 4, 3, 8, C.hairD); }
      else { U(6, 3, 9, 4, C.hair); U(5, 5, 4, 8, C.hair); U(5, 9, 2, 4, C.hairD); U(3, 2, 4, 3, C.hair); U(4, 1, 2, 1, C.hairL); U(8, 4, 3, 1, C.hairL); }
    }

    heldItem(true);

    /* ---------- 1 px ink outline around the silhouette ---------- */
    var c = document.createElement('canvas'); c.width = W; c.height = H; var g = c.getContext('2d');
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      if (G[y][x]) { g.fillStyle = G[y][x]; g.fillRect(x, y, 1, 1); continue; }
      var n = function (i, j) { return i >= 0 && j >= 0 && i < W && j < H && G[j][i]; };
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) { g.fillStyle = INK; g.fillRect(x, y, 1, 1); }
    }
    return (CACHE[key] = c);
  }
  /* draw at feet (x, y): shadow, sprite */
  function draw(g, id, x, y, o) {
    o = o || {}; var im = frame(id, o.dir || 'down', o.step == null ? -1 : o.step, !!o.run), X = Math.round(x) - 16, Y = Math.round(y) - 36;
    if (!o.noShadow) { g.fillStyle = 'rgba(16,10,30,0.34)'; g.fillRect(Math.round(x) - 5, Math.round(y), 11, 1); g.fillRect(Math.round(x) - 4, Math.round(y) + 1, 9, 1); g.fillRect(Math.round(x) - 6, Math.round(y) - 1 + 1, 1, 0); }
    g.drawImage(im, X, Y);
  }
  root.GameDNA_CutCast = { W: W, H: H, foot: 36, frame: frame, draw: draw, ids: ['hero', 'guard', 'elder'], facing: { hero: 'right', guard: 'right', elder: 'right' } };
})(typeof window !== 'undefined' ? window : this);
