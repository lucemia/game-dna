/* GameDNA B-08 platformer-feel.js (module v1.0, 2026-11-15)
 *
 * Side-view character movement and collision against a tile map the game supplies: acceleration and deceleration on the
 * ground and in the air, variable jump height (release to cut), coyote time, jump buffering, apex hang, terminal fall
 * speed, a dash (8 / 4 directions, cooldown, refill on landing), wall slide and wall jump, one-way platforms, corner
 * correction (ceiling corners, ledge lips) and sub-pixel positions that always rest on whole pixels.
 *
 * One plain script, no dependencies, no import/export: one global, window.GameDNA_Platformer.
 *   var pf = GameDNA_Platformer.create({ tile: 16, tileAt: (tx, ty) => 'solid' | 'oneway' | null, body: {w: 10, h: 14},
 *                                        x, y, preset: 'tight', params: {...}, onEvent: (name, info) => {} });
 *   every fixed 60 Hz step:  pf.setInput({left, right, up, down, jump, dash, jumpPressed, dashPressed}); pf.update();
 *   or feed key events:      pf.key(e.code, true/false)    (a press is latched until the next update: a 0 ms tap jumps)
 *   read:                    pf.x, pf.y (whole px, hitbox top-left), pf.vx, pf.vy (px/s), pf.onGround, pf.facing, pf.pose
 *   draw (optional):         pf.drawFx(ctx, camX, camY)  dust and dash after-images
 *                            pf.drawBody(ctx, camX, camY) a built-in stand-in hero (when the game has no sprite)
 *                            pf.drawOverlay(ctx, camX, camY, opts) the feel overlay (arc, windows, velocity graph)
 * The overlay and effects draw through GameDNA_Skin when skin-api.js is loaded (pixel16 look built in otherwise).
 * Movement never depends on drawing or on the skin: only update() moves anything, so ?t=&freeze=1 replays are exact.
 */
(function (root) {
  'use strict';
  var STEP = 1 / 60, STEP_MS = 1000 / 60;

  /* ------------------------------------------------------------------ parameters and presets */
  // All speeds in px/s, accelerations in px/s^2, times in ms, distances in px. Defaults = the 'tight' preset.
  var PRESETS = {
    tight:  { minJumpMs: 50, runSpeed: 96, groundAccel: 1100, groundDecel: 1500, turnAccel: 2200, airAccel: 760, airDecel: 260, jumpHeight: 44, jumpApexMs: 330, fallMult: 1.7, jumpCut: 0.45, apexBand: 36, apexGravity: 0.5, maxFall: 300, coyoteMs: 100, bufferMs: 120, dashSpeed: 270, dashMs: 150, dashCooldownMs: 250, wallSlide: 60, wallJumpX: 120, wallJumpLockMs: 140, corner: 4, ledge: 4 },
    floaty: { minJumpMs: 70, runSpeed: 84, groundAccel: 560, groundDecel: 480, turnAccel: 900, airAccel: 420, airDecel: 110, jumpHeight: 52, jumpApexMs: 470, fallMult: 1.15, jumpCut: 0.6, apexBand: 50, apexGravity: 0.4, maxFall: 170, coyoteMs: 140, bufferMs: 140, dashSpeed: 220, dashMs: 190, dashCooldownMs: 300, wallSlide: 38, wallJumpX: 100, wallJumpLockMs: 180, corner: 5, ledge: 5 },
    heavy:  { minJumpMs: 40, runSpeed: 80, groundAccel: 640, groundDecel: 2200, turnAccel: 1300, airAccel: 300, airDecel: 80, jumpHeight: 38, jumpApexMs: 300, fallMult: 2.3, jumpCut: 0.5, apexBand: 18, apexGravity: 0.85, maxFall: 420, coyoteMs: 70, bufferMs: 90, dashSpeed: 300, dashMs: 120, dashCooldownMs: 400, wallSlide: 95, wallJumpX: 130, wallJumpLockMs: 120, corner: 3, ledge: 3 },
    raw:    { minJumpMs: 0, runSpeed: 90, groundAccel: 900, groundDecel: 900, turnAccel: 900, airAccel: 600, airDecel: 0, jumpHeight: 44, jumpApexMs: 360, fallMult: 1, jumpCut: 1, apexBand: 0, apexGravity: 1, maxFall: 360, coyoteMs: 0, bufferMs: 0, dashSpeed: 270, dashMs: 150, dashCooldownMs: 250, wallSlide: 60, wallJumpX: 120, wallJumpLockMs: 140, corner: 0, ledge: 0 }
  };
  var RANGES = {   // [min, max] clamp for numeric params
    runSpeed: [20, 400], groundAccel: [50, 8000], groundDecel: [50, 8000], turnAccel: [50, 10000], airAccel: [0, 8000], airDecel: [0, 8000],
    jumpHeight: [4, 160], jumpApexMs: [120, 1000], fallMult: [0.5, 4], jumpCut: [0.05, 1], minJumpMs: [0, 300], apexBand: [0, 200], apexGravity: [0.1, 1],
    maxFall: [40, 1200], coyoteMs: [0, 400], bufferMs: [0, 400], dashSpeed: [60, 800], dashMs: [30, 500], dashCooldownMs: [0, 2000], dashCount: [0, 3],
    wallSlide: [10, 400], wallJumpX: [20, 400], wallJumpLockMs: [0, 600], corner: [0, 10], ledge: [0, 10]
  };
  var MODES = { dash: ['eight', 'four', 'off'], wall: ['on', 'off'], drop: ['downjump', 'down'] };
  function defaults() { var d = {}, k; for (k in PRESETS.tight) d[k] = PRESETS.tight[k]; d.dashCount = 1; d.dash = 'eight'; d.wall = 'on'; d.drop = 'downjump'; d.preset = 'tight'; return d; }

  var KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    KeyZ: 'jump', Space: 'jump', KeyC: 'jump', KeyX: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash' };
  var NAMES = ['left', 'right', 'up', 'down', 'jump', 'dash'];

  /* ------------------------------------------------------------------ small helpers */
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sgn(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  function approach(v, t, d) { return v < t ? Math.min(v + d, t) : Math.max(v - d, t); }
  function rnd(seed) { var s = seed >>> 0 || 1; return function () { s = (s + 0x6d2b79f5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ------------------------------------------------------------------ built-in pixel16 look (used when skin-api.js is absent) */
  var G57 = { A: '01110,10001,10001,11111,10001,10001,10001', B: '11110,10001,10001,11110,10001,10001,11110', C: '01110,10001,10000,10000,10000,10001,01110', D: '11110,10001,10001,10001,10001,10001,11110', E: '11111,10000,10000,11110,10000,10000,11111', F: '11111,10000,10000,11110,10000,10000,10000', G: '01110,10001,10000,10111,10001,10001,01111', H: '10001,10001,10001,11111,10001,10001,10001', I: '01110,00100,00100,00100,00100,00100,01110', J: '00111,00010,00010,00010,00010,10010,01100', K: '10001,10010,10100,11000,10100,10010,10001', L: '10000,10000,10000,10000,10000,10000,11111', M: '10001,11011,10101,10101,10001,10001,10001', N: '10001,10001,11001,10101,10011,10001,10001', O: '01110,10001,10001,10001,10001,10001,01110', P: '11110,10001,10001,11110,10000,10000,10000', Q: '01110,10001,10001,10001,10101,10010,01101', R: '11110,10001,10001,11110,10100,10010,10001', S: '01111,10000,10000,01110,00001,00001,11110', T: '11111,00100,00100,00100,00100,00100,00100', U: '10001,10001,10001,10001,10001,10001,01110', V: '10001,10001,10001,10001,10001,01010,00100', W: '10001,10001,10001,10101,10101,10101,01010', X: '10001,10001,01010,00100,01010,10001,10001', Y: '10001,10001,01010,00100,00100,00100,00100', Z: '11111,00001,00010,00100,01000,10000,11111',
    0: '01110,10001,10011,10101,11001,10001,01110', 1: '00100,01100,00100,00100,00100,00100,01110', 2: '01110,10001,00001,00010,00100,01000,11111', 3: '11111,00010,00100,00010,00001,10001,01110', 4: '00010,00110,01010,10010,11111,00010,00010', 5: '11111,10000,11110,00001,00001,10001,01110', 6: '00110,01000,10000,11110,10001,10001,01110', 7: '11111,00001,00010,00100,01000,01000,01000', 8: '01110,10001,10001,01110,10001,10001,01110', 9: '01110,10001,10001,01111,00001,00010,01100',
    '/': '00001,00010,00010,00100,01000,01000,10000', '-': '00000,00000,00000,01110,00000,00000,00000', '.': '00000,00000,00000,00000,00000,01100,01100', '+': '00000,00100,00100,11111,00100,00100,00000', ':': '00000,01100,01100,00000,01100,01100,00000', '?': '01110,10001,00001,00010,00100,00000,00100' };
  var BUILTIN = {
    ink: '#06061a', fill: '#3e4a76', fillTo: '#262e4e', light: '#c8d4f4', dark: '#0a0e22', text: '#ffffff', dim: '#8088a8', accent: '#ffe070',
    hot: '#ff7a3a', cold: '#6ad8f0', heal: '#4ad870', crit: '#ffb43a', status: '#b878f8', white: '#ffffff', a: '#3a64d8'
  };
  function bText(ctx, s, x, y, col) {
    s = String(s).toUpperCase(); var cx = x;
    for (var pass = 0; pass < 2; pass++) {
      cx = x; ctx.fillStyle = pass ? col : BUILTIN.ink;
      for (var i = 0; i < s.length; i++) {
        var ch = s[i]; if (ch === ' ') { cx += 4; continue; }
        var g = G57[ch] || G57['?'], rows = g.split(',');
        for (var ry = 0; ry < 7; ry++) for (var rx = 0; rx < 5; rx++) if (rows[ry][rx] === '1') ctx.fillRect(cx + rx + (pass ? 0 : 1), y + ry + (pass ? 0 : 1), 1, 1);
        cx += 6;
      }
    }
    return cx - x - 1;
  }
  function bMeasure(s) { var w = 0; s = String(s); for (var i = 0; i < s.length; i++) w += s[i] === ' ' ? 4 : 6; return Math.max(0, w - 1); }
  function bFrame(ctx, r) {
    ctx.fillStyle = BUILTIN.ink; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = BUILTIN.fill; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx.fillStyle = BUILTIN.fillTo; ctx.fillRect(r.x + 1, r.y + 1 + ((r.h - 2) >> 1), r.w - 2, (r.h - 2) - ((r.h - 2) >> 1));
    ctx.fillStyle = BUILTIN.light; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 1); ctx.fillRect(r.x + 1, r.y + 1, 1, r.h - 2);
    ctx.fillStyle = BUILTIN.dark; ctx.fillRect(r.x + 1, r.y + r.h - 2, r.w - 2, 1); ctx.fillRect(r.x + r.w - 2, r.y + 1, 1, r.h - 2);
    return { x: r.x + 4, y: r.y + 4, w: r.w - 8, h: r.h - 8 };
  }

  /* ================================================================== create */
  function create(o) {
    o = o || {};
    var P = defaults();
    var warned = {};
    function warn(id, msg) { if (warned[id]) return; warned[id] = 1; try { console.warn('[GameDNA_Platformer] ' + msg); } catch (e) { } }
    function call(fn, a, b, c) { if (typeof fn !== 'function') return undefined; try { return fn(a, b, c); } catch (e) { warn('cb' + String(fn).length, 'a callback threw: ' + (e && e.message)); return undefined; } }

    function setParams(p) {
      p = p || {};
      if (p.preset != null && PRESETS[p.preset]) { var pr = PRESETS[p.preset], k0; for (k0 in pr) P[k0] = pr[k0]; P.preset = String(p.preset); }
      for (var k in p) {
        if (k === 'preset' || p[k] == null || !(k in P)) continue;
        if (MODES[k]) { var v = String(p[k]); if (v === '8') v = 'eight'; if (v === '4') v = 'four'; if (v === 'true') v = 'on'; if (v === 'false') v = 'off'; P[k] = MODES[k].indexOf(v) >= 0 ? v : P[k]; }
        else if (RANGES[k]) P[k] = clamp(num(p[k], P[k]), RANGES[k][0], RANGES[k][1]);
      }
      P.dashCount = Math.round(P.dashCount);
      derive();
    }
    var D = {};   // derived: gravity and take-off speed from jump height and time to apex
    function derive() {
      var t = P.jumpApexMs / 1000;
      D.g = 2 * P.jumpHeight / (t * t);
      D.v0 = 2 * P.jumpHeight / t;
    }
    if (o.preset && PRESETS[o.preset]) setParams({ preset: o.preset });
    setParams(o.params); derive();

    /* ----- world: the game's tile map ----- */
    var T = Math.max(2, num(o.tile, 16) | 0);
    var COLS = o.cols != null ? Math.max(1, num(o.cols, 0) | 0) : 0, ROWS = o.rows != null ? Math.max(1, num(o.rows, 0) | 0) : 0;
    var EDGE = o.edges || {};   // {left, right, top, bottom}: 'solid' | 'empty' outside cols/rows (default: sides solid, top/bottom empty)
    function kindOf(v) {
      if (v === true || v === 1 || v === 'solid' || v === '#') return 1;
      if (v === 'oneway' || v === 'platform' || v === 2 || v === '-') return 2;
      return 0;
    }
    var tileFn = typeof o.tileAt === 'function' ? o.tileAt : typeof o.solidAt === 'function' ? function (tx, ty) { return o.solidAt(tx, ty) ? 'solid' : null; } : null;
    if (!tileFn) warn('tile', 'no tileAt(tx, ty): the body falls through an empty world.');
    function tileKind(tx, ty) {
      if (COLS) { if (tx < 0) return EDGE.left === 'empty' ? 0 : 1; if (tx >= COLS) return EDGE.right === 'empty' ? 0 : 1; }
      if (ROWS) { if (ty < 0) return EDGE.top === 'solid' ? 1 : 0; if (ty >= ROWS) return EDGE.bottom === 'solid' ? 1 : 0; }
      if (!tileFn) return 0;
      var v; try { v = tileFn(tx, ty); } catch (e) { warn('tileAt', 'tileAt threw: ' + (e && e.message)); v = null; }
      return kindOf(v);
    }
    function solidRect(x, y, w, h) {   // any solid tile overlapping the box [x, x+w) x [y, y+h)
      var x0 = Math.floor(x / T), x1 = Math.floor((x + w - 1) / T), y0 = Math.floor(y / T), y1 = Math.floor((y + h - 1) / T);
      for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) if (tileKind(tx, ty) === 1) return true;
      return false;
    }
    function onewayUnder(x, y, w, h) {  // the box's feet rest exactly on the top of a one-way tile
      var b = y + h; if (b % T !== 0) return false;
      var ty = b / T, x0 = Math.floor(x / T), x1 = Math.floor((x + w - 1) / T);
      for (var tx = x0; tx <= x1; tx++) if (tileKind(tx, ty) === 2) return true;
      return false;
    }

    /* ----- the body ----- */
    var BW = Math.max(2, num(o.body && o.body.w, 10) | 0), BH = Math.max(2, num(o.body && o.body.h, 14) | 0);
    function newBody(x, y) {
      return { x: Math.round(num(x, 0)), y: Math.round(num(y, 0)), rx: 0, ry: 0, vx: 0, vy: 0, w: BW, h: BH, ground: false, groundKind: 0, facing: 1,
        coyote: 0, buffer: 0, bufferAge: 0, rising: false, cut: false, upT: 0, dashT: 0, dashCd: 0, dashes: 0, dx: 0, dy: 0, lockT: 0, lockDir: 0,
        dropT: 0, wall: 0, sliding: false, stunT: 0, airT: 0, squashT: 0, squashK: 0, run: 0, lastJump: '', jumpY: 0, peakY: 0 };
    }
    var B = newBody(o.x, o.y); B.dashes = P.dashCount;

    function grounded(b) {
      if (solidRect(b.x, b.y + 1, b.w, b.h) ) return 1;
      if (b.dropT <= 0 && b.vy >= 0 && onewayUnder(b.x, b.y, b.w, b.h)) return 2;
      return 0;
    }
    function wallSide(b, reach) {   // -1 wall on the left within reach px, 1 on the right, 0 none
      for (var k = 1; k <= reach; k++) { if (solidRect(b.x + k, b.y, b.w, b.h)) return 1; if (solidRect(b.x - k, b.y, b.w, b.h)) return -1; }
      return 0;
    }

    /* ----- movement with whole-pixel steps (no tunnelling at any speed) ----- */
    function moveX(b, amt, ev) {
      b.rx += amt; var m = Math.round(b.rx); if (!m) return; b.rx -= m;
      var s = sgn(m), lipped = false;
      while (m) {
        if (!solidRect(b.x + s, b.y, b.w, b.h)) { b.x += s; m -= s; continue; }
        // ledge lip: in the air, a corner only a few px high blocks the feet -> lift over it
        if (!b.ground && P.ledge > 0 && !lipped) {
          var up = 0; for (var k = 1; k <= P.ledge; k++) if (!solidRect(b.x + s, b.y - k, b.w, b.h) && !solidRect(b.x, b.y - k, b.w, b.h)) { up = k; break; }
          if (up && b.vy > -D.v0 * 0.5) { b.y -= up; b.x += s; m -= s; lipped = true; if (b.vy > 0) b.vy = 0; b.ry = 0; ev('ledge', { dy: -up, side: s }); continue; }
        }
        b.vx = 0; b.rx = 0; return true;
      }
      return false;
    }
    function moveY(b, amt, ev, preferX) {
      b.ry += amt; var m = Math.round(b.ry); if (!m) return 0; b.ry -= m;
      var s = sgn(m), nudged = false;
      while (m) {
        if (s > 0) {
          var hitSolid = solidRect(b.x, b.y + 1, b.w, b.h), hitOne = !hitSolid && b.dropT <= 0 && onewayUnder(b.x, b.y, b.w, b.h);
          if (!hitSolid && !hitOne) { b.y += 1; m -= 1; continue; }
          b.ry = 0; return hitSolid ? 1 : 2;
        }
        if (!solidRect(b.x, b.y - 1, b.w, b.h)) { b.y -= 1; m += 1; continue; }
        // ceiling corner: slide sideways up to `corner` px around it (prefer the way we move, then the other way)
        if (P.corner > 0 && !nudged) {
          var dirs = preferX ? [preferX, -preferX] : [1, -1], done = 0;
          for (var d = 0; d < 2 && !done; d++) for (var k = 1; k <= P.corner; k++) {
            var nx = b.x + dirs[d] * k;
            if (!solidRect(nx, b.y - 1, b.w, b.h) && !solidRect(nx, b.y, b.w, b.h)) {
              // only if every px in between is free at the current height (never through a wall)
              var ok = true; for (var j = 1; j < k; j++) if (solidRect(b.x + dirs[d] * j, b.y, b.w, b.h)) { ok = false; break; }
              if (ok) { b.x = nx; b.rx = 0; done = dirs[d] * k; break; }
            }
          }
          if (done) { nudged = true; ev('corner', { dx: done }); continue; }
        }
        b.ry = 0; b.vy = 0; ev('bonk', {}); return -1;
      }
      return 0;
    }

    /* ----- one fixed step on a body (shared by update() and predict()) ----- */
    function stepBody(b, I, ev) {
      var dir = (I.right ? 1 : 0) - (I.left ? 1 : 0), vdir = (I.down ? 1 : 0) - (I.up ? 1 : 0);
      if (b.stunT > 0) { b.stunT -= STEP_MS; dir = 0; vdir = 0; I = { jumpHeld: I.jumpHeld }; }
      var g0 = b.ground ? b.groundKind : grounded(b);
      b.ground = !!g0; b.groundKind = g0;
      if (b.dropT > 0) b.dropT--;
      if (b.dashCd > 0) b.dashCd -= STEP_MS;
      if (b.lockT > 0) b.lockT -= STEP_MS;
      if (b.squashT > 0) b.squashT--;

      // coyote window: refreshed every step on the ground, then counts down in the air
      if (b.ground) { b.coyote = P.coyoteMs; b.airT = 0; b.rising = false; if (b.dashT <= 0 && b.dashes < P.dashCount && b.dashCd <= P.dashCooldownMs) { b.dashes = P.dashCount; ev('refill', {}); } }
      else { b.coyote -= STEP_MS; b.airT++; }
      // jump buffer: a press is remembered for bufferMs (at least this step)
      if (I.jumpPressed) { b.buffer = Math.max(P.bufferMs, STEP_MS * 0.5); b.bufferAge = 0; }
      else if (b.buffer > 0) { b.buffer -= STEP_MS; b.bufferAge++; }

      // drop through a one-way platform
      if (b.ground && b.groundKind === 2 && I.down && (P.drop === 'down' || I.jumpPressed) && !solidRect(b.x, b.y + 1, b.w, b.h)) {
        b.dropT = 10; b.y += 1; b.ground = false; b.groundKind = 0; b.coyote = 0; b.buffer = 0; ev('drop', {});
      }

      // dash
      if (I.dashPressed && P.dash !== 'off') {
        if (b.dashes > 0 && b.dashCd <= 0) {
          var dx = dir, dy = vdir;
          if (P.dash === 'four' && dx && dy) dy = 0;
          if (!dx && !dy) dx = b.facing;
          if (b.ground && dy > 0) dy = 0;
          var n = dx && dy ? Math.SQRT1_2 : 1;
          b.dx = dx * n; b.dy = dy * n; b.vx = b.dx * P.dashSpeed; b.vy = b.dy * P.dashSpeed;
          b.dashT = P.dashMs; b.dashCd = P.dashCooldownMs + P.dashMs; b.dashes--; b.rising = false; b.lockT = 0;
          if (dx) b.facing = dx;
          ev('dash', { dx: dx, dy: dy });
        } else ev('dashDenied', { left: b.dashes, cooldown: Math.max(0, b.dashCd) });
      }
      var dashing = b.dashT > 0;

      // horizontal
      if (!dashing) {
        var useDir = b.lockT > 0 ? (dir === b.lockDir ? 0 : dir) : dir;
        if (b.lockT > 0 && dir === b.lockDir) useDir = 0;
        var target = useDir * P.runSpeed, a;
        if (b.ground) a = useDir === 0 ? P.groundDecel : (b.vx && sgn(b.vx) !== useDir ? P.turnAccel : P.groundAccel);
        else a = useDir === 0 ? P.airDecel : P.airAccel;
        if (useDir && Math.abs(b.vx) > P.runSpeed && sgn(b.vx) === useDir) a = b.ground ? P.groundDecel : P.airDecel;   // over speed (after a dash): ease down
        if (b.lockT > 0) a *= 0.5;
        b.vx = approach(b.vx, target, a * STEP);
        if (dir && b.lockT <= 0) b.facing = dir;
        if (b.ground && useDir && b.vx && sgn(b.vx) !== useDir && Math.abs(b.vx) > P.runSpeed * 0.5) ev('skid', {});
      }

      // jump: ground or coyote first, then wall jump; a dash is cancelled by a jump
      if (b.buffer > 0) {
        if (b.ground || b.coyote > 0) {
          var kind = !b.ground ? 'coyote' : b.bufferAge > 0 ? 'buffered' : 'ground', late = Math.round(P.coyoteMs - b.coyote), early = Math.round(b.bufferAge * STEP_MS);
          b.vy = -D.v0; b.rising = true; b.cut = false; b.upT = 0; b.coyote = 0; b.buffer = 0; b.ground = false; b.groundKind = 0; b.dashT = 0; dashing = false;
          b.lastJump = kind; b.jumpY = b.y; b.peakY = b.y; b.squashT = 8; b.squashK = -1;
          ev('jump', { kind: kind, ms: kind === 'coyote' ? late : kind === 'buffered' ? early : 0 });
        } else if (P.wall === 'on') {
          var ws = wallSide(b, 3);
          if (ws) {
            b.vx = -ws * P.wallJumpX; b.vy = -D.v0 * 0.92; b.rising = true; b.cut = false; b.upT = 0; b.buffer = 0; b.lockT = P.wallJumpLockMs; b.lockDir = ws;
            b.facing = -ws; b.dashT = 0; dashing = false; b.lastJump = 'wall'; b.jumpY = b.y; b.peakY = b.y; b.squashT = 8; b.squashK = -1;
            ev('jump', { kind: 'wall', side: ws }); ev('wallJump', { side: ws });
          }
        }
      }

      // variable height: releasing jump while rising cuts the speed once
      if (b.rising && !dashing) {
        if (b.vy >= 0) { b.rising = false; ev('apex', { height: b.jumpY - b.peakY }); }
        else if (!I.jumpHeld && !b.cut && b.upT >= P.minJumpMs) { b.vy *= P.jumpCut; b.cut = true; ev('cut', { vy: Math.round(b.vy) }); }
        b.upT += STEP_MS;
      }

      // gravity, apex hang, wall slide, terminal speed
      b.sliding = false;
      if (dashing) {
        b.dashT -= STEP_MS;
        if (b.dashT <= 0) { b.dashT = 0; if (b.vy < 0) b.vy *= 0.5; if (Math.abs(b.vx) > P.runSpeed) b.vx = sgn(b.vx) * Math.max(P.runSpeed, Math.abs(b.vx) * 0.6); ev('dashEnd', {}); }
      } else if (!b.ground) {
        var g = D.g;
        if (b.vy > 0) g *= P.fallMult;
        if (Math.abs(b.vy) < P.apexBand && I.jumpHeld && P.apexBand > 0) g *= P.apexGravity;
        b.vy += g * STEP;
        if (P.wall === 'on' && b.vy > 0 && dir) {
          var side = wallSide(b, 1);
          if (side === dir) { if (b.vy > P.wallSlide) b.vy = Math.max(P.wallSlide, b.vy - D.g * 3 * STEP); b.sliding = true; if (b.wall !== side) ev('wallSlide', { side: side }); }
        }
        if (b.vy > P.maxFall) b.vy = P.maxFall;
      } else if (b.vy > 0) b.vy = 0;
      b.wall = b.sliding ? dir : 0;

      // move: whole pixels, sub-pixel remainders carried
      var hitX = moveX(b, b.vx * STEP, ev);
      if (hitX && dashing && !b.dy) { b.dashT = Math.min(b.dashT, STEP_MS); }
      var wasGround = b.ground, r = moveY(b, b.vy * STEP, ev, sgn(b.vx) || dir);
      if (r > 0) {
        b.ground = true; b.groundKind = r;
        if (!wasGround) { ev('land', { vy: Math.round(b.vy), air: b.airT, height: b.jumpY - b.peakY }); b.squashT = 6; b.squashK = Math.min(1, b.vy / Math.max(1, P.maxFall)) + 0.3; }
        if (b.vy > 0) b.vy = 0; if (dashing && b.dy > 0) b.dashT = 0;
      } else if (r === 0 && b.vy >= 0) {
        var gk = grounded(b); b.ground = !!gk; b.groundKind = gk; if (gk && b.vy > 0) b.vy = 0;
        if (gk && !wasGround) { ev('land', { vy: 0, air: b.airT, height: b.jumpY - b.peakY }); b.squashT = 4; b.squashK = 0.3; }
      }
      else { b.ground = false; b.groundKind = 0; }
      if (b.y < b.peakY) b.peakY = b.y;
      b.run += Math.abs(b.vx) * STEP;
    }

    /* ----- input: held state + latched presses (a press between two steps is never lost) ----- */
    var held = {}, latch = {}, ext = null, extPrev = {};
    var keymap = o.keys || KEYS;
    function press(name) { if (NAMES.indexOf(name) < 0) return; if (!held[name]) latch[name] = true; held[name] = true; }
    function release(name) { if (NAMES.indexOf(name) < 0) return; held[name] = false; }
    function key(code, down) { var n = keymap[code]; if (!n) return false; if (down) press(n); else release(n); return true; }
    function setInput(obj) { ext = obj || null; }
    function gather() {
      var e = ext || {}, I = {};
      for (var i = 0; i < NAMES.length; i++) { var n = NAMES[i]; I[n] = !!(held[n] || e[n]); }
      I.jumpHeld = I.jump; I.dashHeld = I.dash;
      I.jumpPressed = !!(latch.jump || e.jumpPressed || (e.jump && !extPrev.jump));
      I.dashPressed = !!(latch.dash || e.dashPressed || (e.dash && !extPrev.dash));
      extPrev = { jump: !!e.jump, dash: !!e.dash };
      latch = {};
      if (ext && ext.once) ext = null;
      return I;
    }

    /* ----- events, stats, history ----- */
    var ST = { steps: 0, jumps: 0, groundJumps: 0, coyoteJumps: 0, bufferedJumps: 0, wallJumps: 0, cuts: 0, apexes: 0, landings: 0, dashes: 0, dashDenied: 0, refills: 0,
      wallSlides: 0, corners: 0, ledges: 0, drops: 0, bonks: 0, skids: 0, teleports: 0, embedded: 0, maxStepPx: 0, maxFallSeen: 0 };
    var lastEvents = [], marks = [], trail = [], hist = [], fxp = [], ghosts = [], frame = 0, R = rnd(num(o.seed, 7));
    var TRAIL = 150, HIST = 120;
    function emit(name, info) {
      info = info || {}; info.x = B.x + B.w / 2; info.y = B.y + B.h; info.frame = frame;
      lastEvents.push({ name: name, info: info });
      switch (name) {
        case 'jump': ST.jumps++; if (info.kind === 'coyote') ST.coyoteJumps++; else if (info.kind === 'buffered') ST.bufferedJumps++; else if (info.kind === 'ground') ST.groundJumps++; break;
        case 'wallJump': ST.wallJumps++; break; case 'cut': ST.cuts++; break; case 'apex': ST.apexes++; break; case 'land': ST.landings++; break;
        case 'dash': ST.dashes++; break; case 'dashDenied': ST.dashDenied++; break; case 'refill': ST.refills++; break; case 'wallSlide': ST.wallSlides++; break;
        case 'corner': ST.corners++; break; case 'ledge': ST.ledges++; break; case 'drop': ST.drops++; break; case 'bonk': ST.bonks++; break; case 'skid': ST.skids++; break;
      }
      if (name === 'jump' || name === 'dash' || name === 'corner' || name === 'ledge' || name === 'drop' || name === 'land') {
        marks.push({ name: name, kind: info.kind || '', x: info.x, y: info.y, f: frame, ms: info.ms || 0 }); if (marks.length > 24) marks.shift();
      }
      if (o.fx !== false) spawnFx(name, info);
      if (name !== 'skid' || frame % 6 === 0) call(o.onEvent, name, info);
    }

    function spawnFx(name, info) {
      var x = info.x, y = info.y, i;
      if (name === 'land') { var n = 3 + Math.min(4, Math.round(Math.abs(info.vy || 0) / 80)); for (i = 0; i < n; i++) { var s = i % 2 ? 1 : -1; fxp.push({ x: x + s * (2 + i), y: y - 1, vx: s * (20 + R() * 40), vy: -10 - R() * 20, t: 0, life: 14 + (R() * 8 | 0), k: 'dust' }); } }
      else if (name === 'jump') { for (i = 0; i < 4; i++) fxp.push({ x: x + (i - 1.5) * 3, y: y - 1, vx: (i - 1.5) * 18, vy: -6 - R() * 8, t: 0, life: 12, k: 'dust' }); if (info.kind === 'wall') for (i = 0; i < 4; i++) fxp.push({ x: x + info.side * (B.w / 2), y: y - 4 - i * 3, vx: -info.side * (10 + R() * 20), vy: -R() * 10, t: 0, life: 14, k: 'dust' }); }
      else if (name === 'dash') { for (i = 0; i < 6; i++) fxp.push({ x: x, y: y - B.h / 2, vx: (R() - 0.5) * 80 - (info.dx || 0) * 40, vy: (R() - 0.5) * 80 - (info.dy || 0) * 40, t: 0, life: 16, k: 'spark' }); }
      else if (name === 'skid') fxp.push({ x: x - B.facing * 3, y: y - 1, vx: -B.facing * 10, vy: -8, t: 0, life: 10, k: 'dust' });
      else if (name === 'refill') for (i = 0; i < 6; i++) { var a = i / 6 * 6.283; fxp.push({ x: x + Math.cos(a) * 6, y: y - B.h / 2 + Math.sin(a) * 6, vx: Math.cos(a) * 18, vy: Math.sin(a) * 18, t: 0, life: 12, k: 'spark' }); }
      if (fxp.length > 80) fxp.splice(0, fxp.length - 80);
    }

    var inst = {};
    function publish() {
      inst.x = B.x; inst.y = B.y; inst.fx = B.x + B.rx; inst.fy = B.y + B.ry; inst.vx = B.vx; inst.vy = B.vy; inst.w = B.w; inst.h = B.h;
      inst.onGround = B.ground; inst.facing = B.facing; inst.dashing = B.dashT > 0; inst.dashesLeft = B.dashes; inst.wall = B.wall; inst.sliding = B.sliding;
      inst.pose = poseOf(); inst.frame = frame;
    }
    function poseOf() {
      if (B.stunT > 0) return 'hurt';
      if (B.dashT > 0) return 'dash';
      if (B.sliding) return 'wallslide';
      if (!B.ground) return B.vy < -P.apexBand ? 'jump' : B.vy > P.apexBand ? 'fall' : 'apex';
      if (B.squashT > 0 && B.squashK > 0) return 'land';
      return Math.abs(B.vx) > 8 ? 'run' : 'idle';
    }

    /* ----- update: one fixed step ----- */
    function update(dtMs) {
      if (dtMs === 0) return lastEvents = [], inst;   // a frozen step (hit-stop): nothing moves, latched presses wait
      lastEvents = [];
      try {
        if (solidRect(B.x, B.y, B.w, B.h)) ST.embedded++;
        var I = gather(), x0 = B.x, y0 = B.y;
        stepBody(B, I, emit);
        frame++; ST.steps++;
        var d = Math.max(Math.abs(B.x - x0), Math.abs(B.y - y0)); if (d > ST.maxStepPx) ST.maxStepPx = d;
        if (B.vy > ST.maxFallSeen) ST.maxFallSeen = Math.round(B.vy);
        trail.push({ x: B.x + B.w / 2, y: B.y + B.h, s: B.dashT > 0 ? 3 : B.ground ? 0 : B.vy < 0 ? 1 : 2, c: !B.ground && B.coyote > 0 && !B.rising ? 1 : 0 }); if (trail.length > TRAIL) trail.shift();
        hist.push({ vx: B.vx, vy: B.vy, g: B.ground ? 1 : 0 }); if (hist.length > HIST) hist.shift();
        if (B.dashT > 0 && frame % 2 === 0) { ghosts.push({ x: B.x, y: B.y, w: B.w, h: B.h, t: 0, f: B.facing }); if (ghosts.length > 8) ghosts.shift(); }
        for (var i = fxp.length - 1; i >= 0; i--) { var p = fxp[i]; p.t++; p.x += p.vx * STEP; p.y += p.vy * STEP; p.vy += 60 * STEP; p.vx *= 0.92; if (p.t >= p.life) fxp.splice(i, 1); }
        for (var j = ghosts.length - 1; j >= 0; j--) if (++ghosts[j].t > 14) ghosts.splice(j, 1);
      } catch (e) { warn('update', 'update failed: ' + (e && e.message)); }
      publish();
      return inst;
    }

    /* ----- prediction (pure: the same step on a copy) ----- */
    function predict(opt) {
      opt = opt || {};
      var b = {}, k; for (k in B) b[k] = B[k];
      if (opt.from) { b.x = Math.round(opt.from.x); b.y = Math.round(opt.from.y); b.rx = b.ry = 0; b.vx = num(opt.from.vx, b.vx); b.vy = num(opt.from.vy, 0); b.ground = false; b.groundKind = 0; }
      var hold = num(opt.hold, 1e9), dir = num(opt.dir, 0), frames = num(opt.frames, 150), pts = [], held0 = opt.jump !== false;
      var evs = [], noop = function (name) { if (name !== 'skid') evs.push(name); };
      for (var f = 0; f < frames; f++) {
        var t = f * STEP_MS;
        var I = { left: dir < 0, right: dir > 0, up: false, down: false, jumpHeld: held0 && t < hold, jumpPressed: held0 && f === 0, dashPressed: false };
        stepBody(b, I, noop);
        pts.push({ x: b.x + b.w / 2, y: b.y + b.h, ground: b.ground });
        if (b.ground && (f > 2 || !held0)) break;   // a fall (jump: false) may land on the first step
      }
      pts.events = evs;   // the movement events the arc would fire (ledge, corner, bonk, land...)
      return pts;
    }

    /* ----- skin ----- */
    var API = root.GameDNA_Skin || null, SK = null;
    try { SK = o.skin === false || !API || !API.resolve ? null : API.resolve(o.skin); } catch (e) { SK = null; }
    function tok(path, fb) { if (!SK) return fb; try { var v = SK.token ? SK.token(path) : null; return v && v !== path ? v : fb; } catch (e) { return fb; } }
    var COL = {
      ink: tok('ink', BUILTIN.ink), text: tok('text.main', BUILTIN.text), dim: tok('text.dim', BUILTIN.dim), accent: tok('text.accent', BUILTIN.accent),
      hot: tok('fx.hot', BUILTIN.hot), cold: tok('fx.cold', BUILTIN.cold), heal: tok('fx.heal', BUILTIN.heal), crit: tok('fx.crit', BUILTIN.crit),
      status: tok('fx.status', BUILTIN.status), white: tok('fx.white', BUILTIN.white), a: tok('team.a', BUILTIN.a), paper: tok('paper', '#f4f6ff')
    };
    function sText(ctx, s, x, y, col) { if (SK) { try { return SK.text(ctx, s, x, y, { font: 'ui', color: col }); } catch (e) { } } return bText(ctx, s, x, y, col); }
    function sMeasure(s) { if (SK) { try { return SK.measure(s, { font: 'ui' }); } catch (e) { } } return bMeasure(s); }
    function sFrame(ctx, r) { if (SK) { try { var inner = SK.frame(ctx, r, { role: 'window', team: 'n' }); if (inner) return inner; } catch (e) { } } return bFrame(ctx, r); }
    function sBar(ctx, r, frac, kind) {
      if (SK && SK.bar) { try { SK.bar(ctx, r, frac, kind, { style: 'meter' }); return; } catch (e) { } }
      ctx.fillStyle = COL.ink; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#1a2040'; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      var w = Math.round((r.w - 2) * clamp(frac, 0, 1)); ctx.fillStyle = kind === 'ready' ? COL.heal : kind === 'charge' ? COL.cold : COL.crit; ctx.fillRect(r.x + 1, r.y + 1, w, r.h - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(r.x + 1, r.y + 1, w, 1);
    }

    /* ----- drawing: effects (dust, dash after-images) ----- */
    function drawFx(ctx, camX, camY) {
      if (!ctx) return; camX = num(camX, 0); camY = num(camY, 0);
      try {
        ctx.save();
        for (var j = 0; j < ghosts.length; j++) {
          var gh = ghosts[j], a = 0.55 * (1 - gh.t / 14); if (a <= 0) continue;
          var gx = Math.round(gh.x - camX), gy = Math.round(gh.y - camY);
          if (typeof o.drawGhost === 'function') { try { ctx.globalAlpha = a; o.drawGhost(ctx, gx, gy, a, gh); } catch (e) { warn('ghost', 'drawGhost threw'); } continue; }
          ctx.globalAlpha = a; ctx.fillStyle = COL.cold;
          ctx.fillRect(gx + 1, gy, gh.w - 2, gh.h); ctx.fillRect(gx, gy + 2, gh.w, gh.h - 4);
          ctx.fillStyle = COL.white; ctx.fillRect(gx + 2, gy + 2, gh.w - 4, 2);
        }
        ctx.globalAlpha = 1;
        for (var i = 0; i < fxp.length; i++) {
          var p = fxp[i], k = p.t / p.life, px = Math.round(p.x - camX), py = Math.round(p.y - camY);
          if (p.k === 'dust') { ctx.fillStyle = k < 0.4 ? '#f4eee0' : k < 0.75 ? '#c8bea8' : '#8a8478'; var s = k < 0.5 ? 2 : 1; ctx.fillRect(px, py, s, s); }
          else { ctx.fillStyle = k < 0.5 ? COL.white : COL.cold; ctx.fillRect(px, py, 1, 1); if (k < 0.3) { ctx.fillRect(px - 1, py, 3, 1); ctx.fillRect(px, py - 1, 1, 3); } }
        }
        ctx.restore();
      } catch (e) { warn('drawFx', 'drawFx failed: ' + (e && e.message)); try { ctx.restore(); } catch (e2) { } }
    }

    /* ----- drawing: a stand-in hero (hooded runner) with squash and stretch ----- */
    function squash() {
      if (B.squashT <= 0) return { sx: 1, sy: 1 };
      var k = B.squashT / 8;
      if (B.squashK < 0) return { sx: 1 - 0.2 * k, sy: 1 + 0.25 * k };
      var q = Math.min(0.35, 0.3 * B.squashK) * B.squashT / 6; return { sx: 1 + q, sy: 1 - q };
    }
    // 12x16 stand-in, facing right. K outline, H hood, h shade, S skin, E eye, C cape, c cape shade, L belt, B boots
    var TOP = ['....KKKKK...', '...KHHHHHK..', '..KHHHHHHHK.', '..KHhSSSSK..', '..KHhSSESK..', '..KHhSSSSK..', '.KCKHHHHHK..', 'KCCKHHhHHK..', 'KCCKHhhHHSK.', 'KCcKHHhHHK..', '.KcKLLLLLK..', '..KKhhhhhK..'];
    var LEGS = {
      idle: ['...KhhKhhK..', '...KhK.KhK..', '..KBBK.KBBK.', '..KKKK.KKKK.'],
      runA: ['...KhhKhK...', '..KhK..KhK..', '.KBBK..KBBK.', '.KKKK...KKK.'],
      runB: ['....KhhK....', '....KhhK....', '...KBBBK....', '...KKKKK....'],
      jump: ['...KhhhhK...', '..KBhK.KhK..', '..KKK..KBBK.', '.......KKKK.'],
      fall: ['...KhK.KhK..', '..KhK...KhK.', '.KBBK...KBBK', '.KKKK...KKKK']
    };
    function drawBody(ctx, camX, camY, opt) {
      if (!ctx) return; opt = opt || {};
      camX = num(camX, 0); camY = num(camY, 0);
      try {
        var sq = squash(), w = 12, h = 16, dw = Math.round(w * sq.sx), dh = Math.round(h * sq.sy);
        var cx = Math.round(B.x + B.w / 2 - camX), by = Math.round(B.y + B.h - camY), x0 = cx - (dw >> 1), y0 = by - dh;
        var f = B.facing, pose = poseOf(), ph = Math.floor(B.run / 8) % 4, CL = opt.colors || {};
        var spent = B.dashes <= 0 && P.dash !== 'off';
        var PAL = { K: COL.ink, H: spent ? '#8a90b0' : CL.hood || '#3c6ad0', h: spent ? '#5a6080' : CL.hoodDark || '#24408a', S: '#f0c090', E: COL.ink,
          C: CL.cape || '#d04a3a', c: CL.capeDark || '#86283a', L: '#e8c040', B: '#6a4028' };
        var legs = pose === 'run' ? (ph % 2 ? LEGS.runB : LEGS.runA) : pose === 'jump' || pose === 'dash' ? LEGS.jump : pose === 'fall' || pose === 'apex' || pose === 'hurt' ? LEGS.fall : LEGS.idle;
        var rows = TOP.concat(legs), lean = pose === 'dash' ? 1 : 0;
        for (var y = 0; y < h; y++) {
          var row = rows[y], yy = y0 + Math.floor(y * dh / h), hh = Math.max(1, y0 + Math.floor((y + 1) * dh / h) - yy);
          for (var x = 0; x < w; x++) {
            var ch = row[x]; if (ch === '.') continue;
            if (pose === 'wallslide' && ch === 'S' && y === 8) ch = 'H';
            var sx = f > 0 ? x : w - 1 - x, xs = x0 + Math.floor(sx * dw / w) + (y < 6 ? lean * f : 0), ww = Math.max(1, Math.floor((sx + 1) * dw / w) - Math.floor(sx * dw / w));
            ctx.fillStyle = PAL[ch] || COL.ink; ctx.fillRect(xs, yy, ww, hh);
          }
        }
        if (pose === 'wallslide') { ctx.fillStyle = PAL.S; ctx.fillRect(f > 0 ? x0 + dw - 1 : x0, y0 + 6, 1, 2); }
      } catch (e) { warn('drawBody', 'drawBody failed: ' + (e && e.message)); }
    }

    /* ----- drawing: the feel overlay ----- */
    function rectsOf(v) { if (typeof v === 'function') { try { v = v(); } catch (e) { v = null; } } var out = []; if (v && v.length) for (var i = 0; i < v.length; i++) { var r = v[i]; if (r && isFinite(r.x) && isFinite(r.y) && r.w > 0 && r.h > 0) out.push(r); } return out; }
    function hits(a, list) { for (var i = 0; i < list.length; i++) { var b = list[i]; if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) return true; } return false; }
    var lastUI = [];
    function dotted(ctx, pts, camX, camY, col, every) {
      // 2x2 dots on a 4x4 ink backing, so the arc reads over any backdrop (motes, sky, foliage)
      var i, px, py;
      ctx.fillStyle = COL.ink; for (i = 0; i < pts.length; i += every) { px = Math.round(pts[i].x - camX); py = Math.round(pts[i].y - camY) - 2; ctx.fillRect(px - 1, py - 1, 4, 4); }
      ctx.fillStyle = col; for (i = 0; i < pts.length; i += every) { px = Math.round(pts[i].x - camX); py = Math.round(pts[i].y - camY) - 2; ctx.fillRect(px, py, 2, 2); }
    }
    function drawOverlay(ctx, camX, camY, opt) {
      if (!ctx) return; opt = opt || {}; camX = num(camX, 0); camY = num(camY, 0);
      var cw = ctx.canvas ? ctx.canvas.width : 256, ch = ctx.canvas ? ctx.canvas.height : 224;
      var view = opt.view || o.view || { x: 0, y: 0, w: cw, h: ch }; if (typeof view === 'function') { try { view = view(); } catch (e) { view = null; } } view = view || { x: 0, y: 0, w: cw, h: ch };
      lastUI = [];
      try {
        ctx.save(); ctx.imageSmoothingEnabled = false;
        // 1) the arc: trail of the feet, coloured by state (ground, rising, falling, dash; gold = inside the coyote window)
        if (opt.trail !== false) {
          for (var i = 0; i < trail.length; i++) {
            var p = trail[i], age = trail.length - i; if (p.s === 0 && age > 40) continue;
            ctx.fillStyle = p.c ? COL.accent : p.s === 3 ? COL.status : p.s === 1 ? COL.cold : p.s === 2 ? COL.hot : COL.dim;
            ctx.globalAlpha = age < 60 ? 1 : age < 110 ? 0.7 : 0.4;
            ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY) - 1, 1, 1);
          }
          ctx.globalAlpha = 1;
          // markers where something happened (C coyote, B buffered, W wall jump, D dash, corner nudges)
          for (var m = 0; m < marks.length; m++) {
            var mk = marks[m], mx = Math.round(mk.x - camX), my = Math.round(mk.y - camY), ag = frame - mk.f; if (ag > 240) continue;
            var lab = mk.name === 'jump' ? (mk.kind === 'coyote' ? 'C' : mk.kind === 'buffered' ? 'B' : mk.kind === 'wall' ? 'W' : '') : mk.name === 'dash' ? 'D' : mk.name === 'corner' ? 'N' : mk.name === 'ledge' ? 'L' : mk.name === 'drop' ? 'V' : '';
            if (mk.name === 'land') { ctx.fillStyle = COL.dim; ctx.fillRect(mx - 2, my - 1, 5, 1); continue; }
            var c = mk.kind === 'coyote' ? COL.accent : mk.kind === 'buffered' ? COL.heal : mk.name === 'dash' ? COL.status : mk.kind === 'wall' ? COL.cold : COL.white;
            ctx.fillStyle = COL.ink; ctx.fillRect(mx - 2, my - 3, 5, 5); ctx.fillStyle = c; ctx.fillRect(mx - 1, my - 2, 3, 3);
            if (lab && ag < 150) { var lw = sMeasure(lab), lx = mx - (lw >> 1); ctx.fillStyle = COL.ink; ctx.fillRect(lx - 2, my - 15, lw + 5, 11); sText(ctx, lab, lx, my - 13, c); }
          }
        }
        // 2) predicted arcs from where the body stands: full hold (solid dots) and a tap (sparse dots)
        if (opt.predict !== false && B.ground) {
          var dir = Math.abs(B.vx) > 10 ? sgn(B.vx) : B.facing;
          dotted(ctx, predict({ dir: dir, hold: 1e9 }), camX, camY, COL.white, 3);
          dotted(ctx, predict({ dir: dir, hold: 0 }), camX, camY, COL.accent, 4);
        }
        // 3) hitbox and the whole-pixel position
        if (opt.hitbox !== false) {
          var hx = Math.round(B.x - camX), hy = Math.round(B.y - camY);
          ctx.fillStyle = COL.heal; ctx.globalAlpha = 0.9;
          ctx.fillRect(hx, hy, B.w, 1); ctx.fillRect(hx, hy + B.h - 1, B.w, 1); ctx.fillRect(hx, hy, 1, B.h); ctx.fillRect(hx + B.w - 1, hy, 1, B.h);
          ctx.globalAlpha = 1;
        }
        // 4) panels: windows (coyote, buffer, dash) and the velocity graph
        if (opt.panels !== false) {
          var avoid = rectsOf(opt.uiRects || o.uiRects), pw = 100, wh = 44, gh = 44, gap = 2, tot = wh + gap + gh;
          var corners = opt.at ? [opt.at] : [{ x: view.x + view.w - pw - 3, y: view.y + 3 }, { x: view.x + 3, y: view.y + 3 }, { x: view.x + view.w - pw - 3, y: view.y + view.h - tot - 3 }, { x: view.x + 3, y: view.y + view.h - tot - 3 }];
          var at = corners[0], body = { x: B.x - camX - 8, y: B.y - camY - 8, w: B.w + 16, h: B.h + 16 };
          for (var q = 0; q < corners.length; q++) { var cand = { x: corners[q].x, y: corners[q].y, w: pw, h: tot }; if (!hits(cand, avoid) && !hits(cand, [body])) { at = corners[q]; break; } }
          drawWindows(ctx, { x: at.x, y: at.y, w: pw, h: wh });
          drawGraph(ctx, { x: at.x, y: at.y + wh + gap, w: pw, h: gh });
          lastUI.push({ x: at.x, y: at.y, w: pw, h: tot, kind: 'feel' });
        }
        ctx.restore();
      } catch (e) { warn('overlay', 'drawOverlay failed: ' + (e && e.message)); try { ctx.restore(); } catch (e2) { } }
    }
    function drawWindows(ctx, r) {
      var inn = sFrame(ctx, r), x = inn.x, y = inn.y, lw = 30, bw = inn.w - lw - 1;
      var coy = B.ground ? 1 : P.coyoteMs > 0 ? clamp(B.coyote / P.coyoteMs, 0, 1) : 0, buf = P.bufferMs > 0 ? clamp(B.buffer / P.bufferMs, 0, 1) : 0;
      sText(ctx, 'COY', x, y, B.ground ? COL.dim : coy > 0 ? COL.accent : COL.dim); sBar(ctx, { x: x + lw, y: y + 1, w: bw, h: 6 }, coy, 'charge');
      sText(ctx, 'BUF', x, y + 9, buf > 0 ? COL.heal : COL.dim); sBar(ctx, { x: x + lw, y: y + 10, w: bw, h: 6 }, buf, 'ready');
      var dl = P.dash === 'off' ? 'DASH OFF' : 'DASH'; sText(ctx, dl, x, y + 18, B.dashes > 0 ? COL.status : COL.dim);
      if (P.dash !== 'off') for (var i = 0; i < Math.max(1, P.dashCount); i++) { var px = x + lw + i * 8; ctx.fillStyle = COL.ink; ctx.fillRect(px, y + 19, 6, 6); ctx.fillStyle = i < B.dashes ? COL.status : '#2a2a40'; ctx.fillRect(px + 1, y + 20, 4, 4); }
      if (P.dash !== 'off' && B.dashCd > 0) sBar(ctx, { x: x + lw + 26, y: y + 20, w: bw - 26, h: 4 }, 1 - clamp(B.dashCd / (P.dashCooldownMs + P.dashMs), 0, 1), 'queued');
      var st = B.dashT > 0 ? 'DASH' : B.sliding ? 'WALL' : B.ground ? 'GROUND' : B.vy < 0 ? 'RISE' : 'FALL';
      sText(ctx, st, x + inn.w - sMeasure(st), y + 27, B.ground ? COL.text : COL.cold);
      sText(ctx, (P.preset || '').slice(0, 6), x, y + 27, COL.dim);
    }
    function drawGraph(ctx, r) {
      var inn = sFrame(ctx, r), x = inn.x, y = inn.y, w = inn.w, h = inn.h - 8;
      var lx = 'VX ' + Math.round(B.vx), ly = 'VY ' + Math.round(B.vy);   // both speeds, px/s, coloured like their graph lines
      sText(ctx, lx, x, y, COL.cold); sText(ctx, ly, x + w - sMeasure(ly), y, COL.hot);
      var gy = y + 8, mid = gy + (h >> 1), maxV = Math.max(P.runSpeed, P.maxFall, D.v0, P.dash !== 'off' ? P.dashSpeed : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, gy, w, h);
      ctx.fillStyle = COL.dim; for (var k = 0; k < w; k += 2) ctx.fillRect(x + k, mid, 1, 1);
      var run = Math.round((h >> 1) * P.runSpeed / maxV); ctx.fillStyle = 'rgba(106,216,240,0.35)'; for (var k2 = 0; k2 < w; k2 += 4) { ctx.fillRect(x + k2, mid - run, 2, 1); ctx.fillRect(x + k2, mid + run, 2, 1); }
      var n = Math.min(hist.length, w);
      for (var i = 0; i < n; i++) {
        var hh = hist[hist.length - n + i], px = x + w - n + i;
        if (hh.g) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(px, gy + h - 2, 1, 2); }
        var yx = clamp(Math.round(mid - (h >> 1) * hh.vx / maxV), gy, gy + h - 1), yy = clamp(Math.round(mid + (h >> 1) * hh.vy / maxV), gy, gy + h - 1);
        ctx.fillStyle = COL.hot; ctx.fillRect(px, yy, 1, 1);
        ctx.fillStyle = COL.cold; ctx.fillRect(px, yx, 1, 1);
      }
    }

    /* ----- public API ----- */
    function teleport(x, y, keepVel) { B.x = Math.round(num(x, B.x)); B.y = Math.round(num(y, B.y)); B.rx = B.ry = 0; if (!keepVel) { B.vx = B.vy = 0; B.dashT = 0; } B.ground = !!grounded(B); B.groundKind = grounded(B); ST.teleports++; trail.length = 0; publish(); return inst; }
    function reset(x, y, opt) {
      B = newBody(x != null ? x : B.x, y != null ? y : B.y); B.dashes = P.dashCount; if (opt && opt.facing) B.facing = opt.facing < 0 ? -1 : 1;
      B.ground = !!grounded(B); B.groundKind = grounded(B);
      held = {}; latch = {}; extPrev = {}; trail.length = 0; hist.length = 0; marks.length = 0; fxp.length = 0; ghosts.length = 0; lastEvents = [];
      publish(); return inst;
    }
    inst.update = update; inst.step = update;
    inst.setInput = setInput; inst.key = key; inst.press = press; inst.release = release;
    inst.releaseAll = function () { held = {}; latch = {}; ext = null; extPrev = {}; };
    inst.teleport = teleport; inst.reset = reset;
    inst.setVelocity = function (vx, vy) { if (vx != null) B.vx = num(vx, B.vx); if (vy != null) B.vy = num(vy, B.vy); B.dashT = 0; B.rising = false; publish(); return inst; };
    inst.knock = function (vx, vy, ms) { B.vx = num(vx, 0); B.vy = num(vy, 0); B.dashT = 0; B.rising = false; B.stunT = num(ms, 0); if (B.vy < 0) B.ground = false; publish(); return inst; };
    inst.bounce = function (h) { B.vy = -Math.sqrt(2 * D.g * num(h, P.jumpHeight * 0.6)); B.rising = true; B.cut = false; B.upT = 0; B.ground = false; B.dashT = 0; B.jumpY = B.y; B.peakY = B.y; if (B.dashes < P.dashCount) { B.dashes = P.dashCount; emit('refill', {}); } publish(); return inst; };
    inst.refillDash = function () { if (B.dashes < P.dashCount) { B.dashes = P.dashCount; B.dashCd = Math.min(B.dashCd, 0); emit('refill', {}); return true; } return false; };
    inst.setFacing = function (f) { B.facing = f < 0 ? -1 : 1; publish(); };
    inst.setSize = function (w, h) { var nw = Math.max(2, num(w, B.w) | 0), nh = Math.max(2, num(h, B.h) | 0), ny = B.y + B.h - nh; if (!solidRect(B.x, ny, nw, nh)) { B.w = BW = nw; B.y = ny; B.h = BH = nh; publish(); return true; } return false; };
    inst.setParams = function (p) { setParams(p); if (B.dashes > P.dashCount) B.dashes = P.dashCount; publish(); return inst; };
    inst.params = function () { var c = {}, k; for (k in P) c[k] = P[k]; c.gravity = Math.round(D.g); c.jumpSpeed = Math.round(D.v0); return c; };
    inst.presets = function () { return Object.keys(PRESETS); };
    inst.rect = function () { return { x: B.x, y: B.y, w: B.w, h: B.h }; };
    inst.anchor = function (camX, camY) { var x = B.x - num(camX, 0), y = B.y - num(camY, 0); return { x: Math.round(x + B.w / 2), top: Math.round(y), w: B.w, h: B.h, footY: Math.round(y + B.h) }; };
    inst.collides = function (x, y, w, h) { return solidRect(Math.round(num(x, B.x)), Math.round(num(y, B.y)), num(w, B.w) | 0, num(h, B.h) | 0); };
    inst.tileKind = tileKind;
    inst.windows = function () { return { coyoteMs: B.ground ? P.coyoteMs : Math.max(0, B.coyote), coyoteMax: P.coyoteMs, bufferMs: Math.max(0, B.buffer), bufferMax: P.bufferMs, dashes: B.dashes, dashCooldownMs: Math.max(0, B.dashCd) }; };
    inst.squash = squash;
    inst.events = function () { return lastEvents.slice(); };
    inst.stats = function () { var c = {}, k; for (k in ST) c[k] = ST[k]; return c; };
    inst.state = function () {
      return { x: B.x, y: B.y, fx: +(B.x + B.rx).toFixed(3), fy: +(B.y + B.ry).toFixed(3), vx: Math.round(B.vx), vy: Math.round(B.vy), w: B.w, h: B.h, onGround: B.ground, oneway: B.groundKind === 2,
        facing: B.facing, pose: poseOf(), dashing: B.dashT > 0, dashes: B.dashes, wall: B.wall, coyoteMs: Math.max(0, Math.round(B.coyote)), bufferMs: Math.max(0, Math.round(B.buffer)), lastJump: B.lastJump, frame: frame };
    };
    inst.predict = predict;
    inst.trail = function () { return trail.slice(); };
    inst.history = function () { return hist.slice(); };
    inst.drawFx = drawFx; inst.drawBody = drawBody; inst.drawOverlay = drawOverlay;
    inst.getUIRects = function () { return lastUI.slice(); };
    inst.clearFx = function () { fxp.length = 0; ghosts.length = 0; marks.length = 0; trail.length = 0; };
    inst.tile = T;
    B.ground = !!grounded(B); B.groundKind = grounded(B);
    publish();
    return inst;
  }

  root.GameDNA_Platformer = { version: '1.0', create: create, presets: PRESETS, defaults: defaults, keys: KEYS };
})(typeof window !== 'undefined' ? window : this);
