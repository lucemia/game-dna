/* B-16 grapple-swing demo: the little platformer the demo plays (pure logic, no DOM; also loaded by checks in node).
 * makeWorld(GameDNA_Grapple, {params, seed, bot}) -> world: step(humanInput), state, hero, grapple, map helpers.
 * One clock: frame n of the run = n fixed steps of 1000/60 ms from a fresh world; ?t= replays exactly these steps.
 * ASCII only. */
(function (root) {
  'use strict';
  var TS = 16, STEP = 1000 / 60;
  // '#' rock, 'o' ring anchor (centre of the cell), '~' water (the hero falls in: back to the last ledge)
  var MAP = [
    '.................................#############....................................',
    '..............o..................#############....................................',
    '.......................o.........#############..............o.....................',
    '..................................................................................',
    '..................................................................................',
    '..............................................................#...................',
    '..................................................................................',
    '###########..................#####................................................',
    '###########..................#####............##########..........................',
    '###########..................#####............##########..........################',
    '###########~~~~~~~~~~~~~~~~~~#####~~~~~~~~~~~~##########~~~~~~~~~~################',
    '###########~~~~~~~~~~~~~~~~~~#####~~~~~~~~~~~~##########~~~~~~~~~~################'];
  var COLS = MAP[0].length, ROWS = MAP.length, WORLD_W = COLS * TS, WORLD_H = ROWS * TS;
  function tileAt(c, r) { if (c < 0 || c >= COLS) return '#'; if (r < 0) return '.'; if (r >= ROWS) return '~'; return MAP[r].charAt(c); }
  function solidAt(x, y) { return tileAt(Math.floor(x / TS), Math.floor(y / TS)) === '#'; }
  var RINGS = [];
  MAP.forEach(function (row, r) { for (var c = 0; c < row.length; c++) if (row[c] === 'o') RINGS.push({ id: 'ring-' + String.fromCharCode(97 + RINGS.length), x: c * TS + 8, y: r * TS + 8 }); });
  // where a fall puts the hero back (column of a safe ledge, row of its top)
  var LEDGES = [[3, 7], [31, 7], [50, 8], [72, 9]];

  function makeWorld(GL, opt) {
    opt = opt || {};
    var T = Object.assign({ a1: [0.707, -0.707], r1: 0.3, reel1: 45, a2: [0.788, -0.616], r2: 0.6, wrapHold: 8 }, opt.tune || {});
    var W = { frame: 0, hero: null, g: null, cam: { x: 0, y: 0 }, events: [], respawns: 0, botOn: opt.bot !== false, bot: { phase: 0, f: 0, m: {} }, lastLedge: 0 };
    function newHero(col, row) { return { id: 'hero', x: col * TS + 4, y: row * TS - 22, w: 8, h: 22, vx: 0, vy: 0, facing: 1, onGround: false, coyote: 0, jumpBuf: 0, cut: false, run: 0, landT: 0, airT: 0, fireT: 0, lastR: null }; }
    W.g = GL.create({
      solid: solidAt, tile: TS, velUnit: 'step', gravity: 0.25, anchors: RINGS, seed: opt.seed || 1, scale: 1,
      bounds: { x: 0, y: -200, w: WORLD_W, h: WORLD_H + 400 }, drawRings: false,
      // the rope meets the hands: above the hood while hanging; while the hook flies, the throwing hand held out toward it
      hand: function (b) {
        var cx = b.x + b.w / 2, s = W.g && W.g.state ? W.g.state() : null;
        if (s && s.hook && s.state !== 'attached') {
          var f = b.facing < 0 ? -1 : 1, sx = cx + f * 3, sy = b.y + 8, dx = s.hook.x - sx, dy = s.hook.y - sy, l = Math.sqrt(dx * dx + dy * dy);
          if (l > 10) { var ax = dx / l * f, ay = dy / l; if (ax < 0.25) { ax = 0.25; ay = -Math.sqrt(1 - ax * ax) * (ay < 0 ? 1 : -1); } return { x: sx + ax * f * 8, y: sy + ay * 8 }; }
        }
        return { x: cx, y: b.y - 2 };
      },
      params: opt.params || {},
      onEvent: function (type, e) { W.events.push({ t: e.t, type: type, kind: e.kind, ring: e.ring, frame: W.frame }); if (W.events.length > 60) W.events.shift(); }
    });
    W.hero = newHero(3, 7);
    // ---------------------------------------------------------------- host physics (like the unseen platformer hosts)
    function moveX(e, dx) {
      e.x += dx; var ys = [e.y + 0.5, e.y + e.h / 2, e.y + e.h - 0.5];
      if (dx > 0) { var edge = e.x + e.w; for (var i = 0; i < 3; i++) if (solidAt(edge, ys[i])) { e.x = Math.floor(edge / TS) * TS - e.w - 0.001; return true; } }
      else if (dx < 0) { for (i = 0; i < 3; i++) if (solidAt(e.x, ys[i])) { e.x = (Math.floor(e.x / TS) + 1) * TS; return true; } }
      return false;
    }
    function moveY(e, dy) {
      e.y += dy; var xs = [e.x + 0.5, e.x + e.w - 0.5];
      if (dy > 0) { var edge = e.y + e.h; for (var i = 0; i < 2; i++) if (solidAt(xs[i], edge)) { e.y = Math.floor(edge / TS) * TS - e.h - 0.001; return 'floor'; } }
      else if (dy < 0) { for (i = 0; i < 2; i++) if (solidAt(xs[i], e.y)) { e.y = (Math.floor(e.y / TS) + 1) * TS; return 'ceil'; } }
      return null;
    }
    function heroStep(inp) {
      var h = W.hero, dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (dir) h.facing = dir;
      // the grapple first: it reads the body as the last step left it
      var r = W.g.update(STEP, { fire: inp.fire, hold: inp.hold, jump: inp.jumpPressed, push: dir, reel: inp.reel || 0, aimX: inp.aimX, aimY: inp.aimY, up: inp.up, down: inp.down }, h);
      h.lastR = { active: r.active, flying: r.flying, state: r.state };
      if (inp.fire) h.fireT = 10;
      if (r.active) { h.vx = r.vx; h.vy = r.vy; h.jumpBuf = 0; h.coyote = 0; if (Math.abs(h.vx) > 0.3) h.facing = h.vx > 0 ? 1 : -1; }
      else {
        var target = dir * 1.5;
        h.vx += (target - h.vx) * (h.onGround ? 0.22 : 0.1);
        if (r.flying) { h.vx = r.vx; if (Math.abs(h.vx) > 0.3) h.facing = h.vx > 0 ? 1 : -1; }
        h.coyote = h.onGround ? 6 : Math.max(0, h.coyote - 1);
        h.jumpBuf = inp.jumpPressed ? 6 : Math.max(0, h.jumpBuf - 1);
        if (h.jumpBuf > 0 && h.coyote > 0 && r.state !== 'attached') { h.vy = -4.4; h.coyote = 0; h.jumpBuf = 0; h.cut = false; }
        if (!r.flying && !inp.jump && h.vy < -2 && !h.cut) { h.vy = -2; h.cut = true; }
        h.vy = Math.min(h.vy + 0.25, 5.5);
      }
      var wasGround = h.onGround, vy0 = h.vy;
      if (moveX(h, h.vx)) h.vx = 0;
      var hit = moveY(h, h.vy);
      h.onGround = hit === 'floor'; if (hit) h.vy = 0;
      if (h.onGround && !wasGround && vy0 > 2) h.landT = 8;
      if (h.landT > 0) h.landT--; if (h.fireT > 0) h.fireT--;
      h.airT = h.onGround ? 0 : h.airT + 1;
      h.run = h.onGround && Math.abs(h.vx) > 0.2 ? h.run + Math.abs(h.vx) : (h.onGround ? 0 : h.run);
      if (h.onGround) { var c = Math.floor((h.x + h.w / 2) / TS); for (var k = 0; k < LEDGES.length; k++) if (Math.abs(c - LEDGES[k][0]) < 6 && Math.abs(h.y + h.h - LEDGES[k][1] * TS) < 2) W.lastLedge = k; }
      if (h.y > WORLD_H + 8) {   // into the water: back to the last ledge
        var L = LEDGES[W.lastLedge]; W.hero = newHero(L[0], L[1]); W.g.reset(); W.respawns++; W.events.push({ t: Math.round(W.frame * STEP), type: 'respawn', frame: W.frame });
        if (W.botOn) reset();   // the tour starts over from the first ledge
      }
    }
    // ---------------------------------------------------------------- the bot: a scripted tour, closed loop on the hero's state
    function hd() { var h = W.hero; return { x: h.x + h.w / 2, y: h.y - 2 }; }
    var TOUR = [
      // [name, fn(I, f, m) -> true when done]
      ['run to the cliff edge', function (I) { I.right = true; return W.hero.x > 150; }],
      ['fire at ring A', function (I) { I.right = true; I.fire = true; I.hold = true; return true; }],
      ['swing A, pump, let go rising', function (I, f, m) { return swingRelease(I, f, m, 0.62, 1, 160); }],
      ['chain to ring B', function (I, f) { I.right = true; if (f === 6) { I.fire = true; } I.hold = true; return f > 6 && W.g.attached(); }],
      ['swing B, let go onto the pillar', function (I, f, m) { return swingRelease(I, f, m, 0.42, 1, 160, [470, 520]); }],
      ['land on the pillar', function (I, f) { I.hold = false; if (W.hero.x < 486) I.right = true; return W.hero.onGround && f > 4; }],
      ['back up on the pillar', function (I) { I.left = W.hero.x > 476; return !I.left && Math.abs(W.hero.vx) < 0.5; }],
      ['run and jump off the pillar', function (I, f) { I.right = true; if (W.hero.x > 528 && W.hero.onGround) { I.jumpPressed = true; I.jump = true; return true; } return f > 120; }],
      ['hook the ceiling in the air', function (I, f) { I.right = true; I.jump = true; I.fire = f === 8; I.hold = true; I.aimX = T.a1[0]; I.aimY = T.a1[1]; return f > 8 && (W.g.attached() || f > 40); }],
      ['reel out and swing', function (I, f, m) { I.reel = f < T.reel1 ? 1 : 0; return swingRelease(I, f, m, T.r1, 1, 220); }],
      ['fly to the apex', function (I, f) { I.right = true; return W.hero.vy >= -0.2 || f > 40; }],
      ['chain to the ceiling', function (I, f) { I.right = true; I.fire = f === 0; I.hold = true; I.aimX = T.a2[0]; I.aimY = T.a2[1]; return f > 0 && (W.g.attached() || f > 40); }],
      ['swing to the ledge', function (I, f, m) { return swingRelease(I, f, m, T.r2, 1, 220, [748, 830]); }],
      ['land on the ledge', function (I, f) { I.hold = false; I.right = W.hero.x < 836; return W.hero.onGround && f > 4; }],
      ['walk to the ledge end', function (I) { I.right = W.hero.x < 876; return !I.right && Math.abs(W.hero.vx) < 0.5; }],
      ['hook ring C', function (I, f) { I.fire = f === 4; I.hold = true; return f > 4 && W.g.attached(); }],
      ['swing round the rock', function (I, f, m) {
        var s = W.g.state(), h = W.hero; I.hold = true; if (!s.anchor) return true;
        I.right = h.vx > 0; I.left = false;
        if (s.pivots.length > 1 && h.vx > 0.3 && (m.wf = m.wf || f) && f - m.wf >= (T.wrapHold || 0)) { var land = predictLand(h.vx, h.vy); if (land && land.x >= 1062 && land.x <= 1110) { I.hold = false; return true; } }
        if (f > 260) { I.hold = false; return true; }
        return false; }],
      ['land on the far ledge', function (I, f) { I.hold = false; I.right = f > 6 && W.hero.x < 1086; return W.hero.onGround && f > 8; }],
      ['walk on', function (I) { I.right = W.hero.x < 1136; return W.hero.x >= 1136; }],
      ['a shot at open sky (miss)', function (I, f) { I.fire = f === 10; I.hold = true; I.aimX = 0.5; I.aimY = -0.87; return f > 80; }],
      ['rest', function (I, f) { return f > 60; }]
    ];
    // where would the hero land if it let go now? (the host's own physics, the module's carried momentum, holding right)
    function predictLand(vx, vy) {
      var h = W.hero, b = { x: h.x, y: h.y, w: h.w, h: h.h }, k = W.g.params(), cvx = vx * k.releaseBoost, cvy = vy * k.releaseBoost, carry = k.carryMs;
      for (var i = 0; i < 160; i++) {
        var t = i * STEP; if (t > carry) cvx += (1.5 - cvx) * 0.1;
        cvy = Math.min(cvy + 0.25, 5.5);
        if (moveX(b, cvx)) cvx = 0;
        var hit = moveY(b, cvy); if (hit === 'floor') return { x: b.x, y: b.y + b.h, steps: i }; if (hit) cvy = 0;
        if (b.y > WORLD_H) return null;
      }
      return null;
    }
    function swingRelease(I, f, m, past, dirWant, maxF, target) {
      // hold on, pump with the swing; with a target ledge [x0, x1], let go as soon as the predicted landing is on it;
      // otherwise let go when the hand is `past` x rope length ahead of the anchor and still rising
      var s = W.g.state(); I.hold = true;
      if (s.state === 'shot') { I.right = dirWant > 0; return false; }
      if (!s.anchor) return true;
      var h = W.hero, a = s.pivots[s.pivots.length - 1] || s.anchor, ahead = (hd().x - a.x) * dirWant, L = s.free;
      I.right = h.vx * dirWant > 0 || ahead < 0; I.left = false;
      if (target) {
        if (ahead > 0 && h.vx * dirWant > 0.5) { var land = predictLand(h.vx, h.vy); if (land && land.x >= target[0] && land.x <= target[1]) { I.hold = false; return true; } }
      } else if (ahead > L * past && h.vy < 0) { I.hold = false; return true; }
      if (f > maxF) { I.hold = false; return true; }
      return false;
    }
    function botInput() {
      var B = W.bot, I = { left: false, right: false, up: false, down: false, jump: false, jumpPressed: false, fire: false, hold: undefined, reel: 0 };
      if (B.phase >= TOUR.length) { reset(); B = W.bot; }
      var ph = TOUR[B.phase], done = ph[1](I, B.f, B.m);
      if (I.hold === undefined) I.hold = false;
      B.f++;
      if (done) { B.phase++; B.f = 0; B.m = {}; }
      return I;
    }
    function reset() { W.hero = newHero(3, 7); W.g.reset(); W.bot = { phase: 0, f: 0, m: {} }; W.lastLedge = 0; W.loops = (W.loops || 0) + 1; }
    // camera: on the rope it frames the anchor and the hero together and eases slowly, so the hero swings across the
    // screen instead of the world swinging around it; off the rope a dead zone with a little look-ahead
    function cameraStep() {
      var h = W.hero, hx = h.x + h.w / 2, s = W.g.state(), tx, k;
      W.cam.free = s.state === 'attached' ? 0 : (W.cam.free || 0) + 1;
      if (s.state === 'attached' && s.anchor) { var a = s.pivots[0]; tx = (a.x * 0.6 + hx * 0.4) - 160; k = 0.035; }
      else { k = 0.035 + Math.min(1, W.cam.free / 45) * 0.045; tx = hx - 136 + h.vx * 14; var dz = tx - W.cam.x; tx = Math.abs(dz) < 18 ? W.cam.x : tx - Math.sign(dz) * 18; }   // after letting go the ease speeds up over 0.75 s
      tx = Math.max(0, Math.min(WORLD_W - 320, tx));
      if (W.frame === 1) W.cam.x = tx; else W.cam.x += (tx - W.cam.x) * k;
      var sx = hx - W.cam.x; if (sx < 28) W.cam.x = hx - 28; else if (sx > 292) W.cam.x = hx - 292;   // never lose the hero
      W.cam.x = Math.max(0, Math.min(WORLD_W - 320, W.cam.x));
      W.cam.y = WORLD_H - 180;
    }
    W.step = function (human) {
      W.frame++;
      var I = W.botOn ? botInput() : (human || { hold: false });
      W.input = I;
      heroStep(I);
      cameraStep();
    };
    W.phaseName = function () { var p = TOUR[Math.min(W.bot.phase, TOUR.length - 1)]; return p ? p[0] : ''; };
    W.reset = reset;
    W.TS = TS; W.MAP = MAP; W.COLS = COLS; W.ROWS = ROWS; W.WORLD_W = WORLD_W; W.WORLD_H = WORLD_H; W.RINGS = RINGS; W.solidAt = solidAt; W.tileAt = tileAt; W.STEP = STEP;
    return W;
  }
  root.GrappleDemoWorld = { makeWorld: makeWorld, MAP: MAP, TS: TS, STEP: STEP };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GrappleDemoWorld;
})(typeof window !== 'undefined' ? window : this);
