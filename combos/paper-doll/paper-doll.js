/* GameDNA_PaperDoll v1.1.0 - D-02 paper doll: a layered pixel character (body, hair, hat, top, bottom, boots, weapon, shield)
 * with swappable parts and palette tints, every part painted on ONE shared rig (anchor table) so any combination lines up in
 * every frame of the 4-direction stand / 4-frame walk / 3-frame attack / jump cycle, plus a small dressing window (wardrobe).
 *
 * One classic script, no dependencies, ASCII only, one global: GameDNA_PaperDoll. Pure and deterministic: frames are a
 * function of (look, dir, pose, frame); animation state is a function of the numbers the game passes and update(dt).
 *
 *   var PD = GameDNA_PaperDoll;
 *   var doll = PD.create({ look: { top: 'plate/steel', weapon: 'sword' }, params: { stride: 5 } });
 *   doll.draw(ctx, feetX, feetY, { dir: 'left', walk: distancePx, moving: true });        // feet = bottom centre
 *   doll.draw(ctx, feetX, feetY, { dir: 'right', attack: 0.4 });                          // attack progress 0..1
 *   var wr = PD.wardrobe({ doll: doll, view: { x: 0, y: 0, w: 256, h: 224 }, onChange: fn, onClose: fn });
 *   wr.open(); wr.input('down'); wr.update(16.7); wr.draw(ctx);
 *
 * Frame: 40 x 40 canvas, feet centre at column 20 (between 19 and 20), the 1 px outline under the boots on row 37.
 * draw() puts that outline row ON feetY (the lowest drawn row), so the character stands on the line feetY.
 * Native facing of the side art: right. The left view is painted, not mirrored as a whole: the body mirrors, but the weapon
 * stays in the RIGHT hand (the far hand when facing left, drawn behind the body) and the shield in the LEFT hand (near,
 * in front). Facing down the right hand is on the screen's left; facing up, on the screen's right.
 */
(function (root) {
  'use strict';
  var VERSION = '1.1.0';
  var W = 40, H = 40, CX = 20, FOOT = 37, INK = '#1a1024', POCKET = 4;
  var DIRS = ['down', 'right', 'up', 'left'];
  var POSES = { stand: 1, walk: 4, attack: 3, jump: 1 };
  var SLOTS = ['body', 'hair', 'hat', 'top', 'bottom', 'boots', 'weapon', 'shield'];

  /* ---------- tints: one base colour each; ramp() derives 5 shades (cool shadows, warm lights) ---------- */
  var TINTS = {
    skin: { fair: '#f4c8a2', rose: '#e8ad88', tan: '#cf9262', brown: '#a8693e', deep: '#70442a' },
    hair: { black: '#33283a', brown: '#6e4024', auburn: '#ad4c26', blonde: '#e2bb52', silver: '#cdd0dc', teal: '#2f8c8c', plum: '#7c3c8c' },
    cloth: { crimson: '#bd3640', royal: '#3a5cc8', forest: '#2f7e40', plum: '#7c409c', ochre: '#cc9230', slate: '#56627a', ivory: '#e4dac2', black: '#353042', teal: '#2a8c8c' },
    metal: { steel: '#a9b5c6', bronze: '#c28a4a', gold: '#e2b232', dark: '#5c5c74', silver: '#d6dbe8' },
    leather: { brown: '#7c4c2c', tan: '#a87a4a', dark: '#4c3222', oxblood: '#86382c' },
    gem: { ruby: '#e0384a', sapphire: '#3a7ae8', emerald: '#2cb860', amethyst: '#a250e0', amber: '#f0a020' }
  };
  var FIXED = { wood: '#8c5c34', linen: '#e2d6bc', mail: '#8e98aa', gold: '#e2b232', steel: '#a9b5c6', strap: '#5a3a22', blush: '#f08a84', red: '#c8303c' };

  /* style -> material (which tint list) and its default tint; label for the wardrobe (<= 8 chars) */
  var STYLES = {
    body: { base: { mat: 'skin', def: 'fair', label: 'BODY' } },
    hair: { short: { mat: 'hair', def: 'brown', label: 'SHORT' }, long: { mat: 'hair', def: 'auburn', label: 'LONG' }, tail: { mat: 'hair', def: 'black', label: 'PONYTAIL' },
      spiky: { mat: 'hair', def: 'blonde', label: 'SPIKY' }, bob: { mat: 'hair', def: 'plum', label: 'BOB' }, bald: { mat: 'hair', def: 'brown', label: 'SHAVED' } },
    hat: { none: { mat: null, label: 'NONE' }, hood: { mat: 'cloth', def: 'forest', label: 'HOOD' }, helm: { mat: 'metal', def: 'steel', label: 'HELM' },
      wizard: { mat: 'cloth', def: 'royal', label: 'WIZARD' }, circlet: { mat: 'metal', def: 'gold', label: 'CIRCLET' }, cap: { mat: 'cloth', def: 'crimson', label: 'CAP' } },
    top: { tunic: { mat: 'cloth', def: 'forest', label: 'TUNIC' }, plate: { mat: 'metal', def: 'steel', label: 'PLATE' }, robe: { mat: 'cloth', def: 'royal', label: 'ROBE' },
      vest: { mat: 'leather', def: 'brown', label: 'VEST' } },
    bottom: { trousers: { mat: 'cloth', def: 'slate', label: 'TROUSERS' }, shorts: { mat: 'cloth', def: 'ochre', label: 'SHORTS' }, skirt: { mat: 'cloth', def: 'plum', label: 'SKIRT' } },
    boots: { shoes: { mat: 'leather', def: 'brown', label: 'SHOES' }, boots: { mat: 'leather', def: 'dark', label: 'BOOTS' }, greaves: { mat: 'metal', def: 'steel', label: 'GREAVES' } },
    weapon: { none: { mat: null, label: 'NONE' }, sword: { mat: 'metal', def: 'steel', label: 'SWORD' }, axe: { mat: 'metal', def: 'steel', label: 'AXE' },
      staff: { mat: 'gem', def: 'sapphire', label: 'STAFF' }, spear: { mat: 'metal', def: 'steel', label: 'SPEAR' } },
    shield: { none: { mat: null, label: 'NONE' }, round: { mat: 'cloth', def: 'crimson', label: 'ROUND' }, kite: { mat: 'cloth', def: 'royal', label: 'KITE' },
      buckler: { mat: 'metal', def: 'bronze', label: 'BUCKLER' } }
  };
  var DEFAULT_LOOK = { body: 'base/fair', hair: 'short/brown', hat: 'none', top: 'tunic/forest', bottom: 'trousers/slate', boots: 'boots/dark', weapon: 'sword/steel', shield: 'none' };

  /* ---------- colour helpers ---------- */
  function hex2rgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function rgb2hex(r, g, b) { function c(v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); } return '#' + c(r) + c(g) + c(b); }
  function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2, d = mx - mn;
    if (d > 1e-6) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }
  function hsl2hex(h, s, l) { h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return rgb2hex((r + m) * 255, (g + m) * 255, (b + m) * 255); }
  function towards(h, target, k) { var d = ((target - h + 540) % 360) - 180; return h + d * k; }
  var RAMPS = {};
  /* ramp(hex) -> [deep, dark, base, light, highlight] */
  function ramp(hex, kind) {
    var key = hex + (kind || '');
    if (RAMPS[key]) return RAMPS[key];
    if (kind === 'skin') {   // skin: warm shadows (toward orange), never purple
      var sc = hex2rgb(hex), sh = rgb2hsl(sc[0], sc[1], sc[2]);
      return (RAMPS[key] = [hsl2hex(towards(sh[0], 12, 0.4), sh[1] * 0.75, sh[2] * 0.56), hsl2hex(towards(sh[0], 16, 0.3), sh[1] * 0.85, sh[2] * 0.8), hex,
        hsl2hex(towards(sh[0], 40, 0.1), sh[1] * 0.95, sh[2] + (1 - sh[2]) * 0.3), hsl2hex(sh[0], sh[1] * 0.8, sh[2] + (1 - sh[2]) * 0.55)]);
    }
    var c = hex2rgb(hex), hsl = rgb2hsl(c[0], c[1], c[2]), h = hsl[0], s = hsl[1], l = hsl[2], grey = s < 0.12;
    var out = [
      hsl2hex(grey ? h : towards(h, 250, 0.22), s * (grey ? 1 : 1.05) + (grey ? 0.06 : 0), l * 0.5),
      hsl2hex(grey ? h : towards(h, 250, 0.12), s * (grey ? 1 : 1.04) + (grey ? 0.04 : 0), l * 0.72),
      hex,
      hsl2hex(grey ? h : towards(h, 55, 0.08), s * 0.96, l + (1 - l) * 0.3),
      hsl2hex(grey ? h : towards(h, 55, 0.14), s * 0.85, l + (1 - l) * 0.58)
    ];
    if (grey && l > 0.55) { out[0] = hsl2hex(225, 0.16, l * 0.46); out[1] = hsl2hex(222, 0.14, l * 0.68); }
    return (RAMPS[key] = out);
  }

  /* ---------- looks: { slot: 'style/tint' } ---------- */
  function parseSlot(slot, v) {
    var S = STYLES[slot], st, tint;
    if (v && typeof v === 'object') { st = v.style; tint = v.tint; } else { var p = String(v == null ? '' : v).split('/'); st = p[0]; tint = p[1]; }
    if (!S[st]) { var d = String(DEFAULT_LOOK[slot]).split('/'); st = S[st] ? st : (slot === 'hat' || slot === 'weapon' || slot === 'shield') && (st === '' || st == null) ? 'none' : d[0]; }
    if (!S[st]) st = Object.keys(S)[0];
    var m = S[st].mat;
    if (!m) return { style: st, tint: null };
    if (!TINTS[m][tint]) tint = S[st].def;
    return { style: st, tint: tint };
  }
  function normLook(look) {
    var out = {}; look = look || {};
    for (var i = 0; i < SLOTS.length; i++) { var s = SLOTS[i]; out[s] = parseSlot(s, look[s] != null ? look[s] : DEFAULT_LOOK[s]); }
    return out;
  }
  function lookKey(L) { var k = []; for (var i = 0; i < SLOTS.length; i++) { var p = L[SLOTS[i]]; k.push(p.style + (p.tint ? '/' + p.tint : '')); } return k.join('|'); }
  function lookString(L) { var o = {}; for (var i = 0; i < SLOTS.length; i++) { var p = L[SLOTS[i]]; o[SLOTS[i]] = p.style + (p.tint ? '/' + p.tint : ''); } return o; }
  function colorOf(L, slot) { var p = L[slot], m = STYLES[slot][p.style].mat; return m ? ramp(TINTS[m][p.tint], m === 'skin' ? 'skin' : null) : null; }

  /* ---------- the rig (anchor table). Coordinates in the 40x40 frame; side views are authored facing right ("local")
     and the left view is the local view painted with the right hand as the FAR arm, then mirrored. ---------- */
  var HY = 16, TY = 25;                  // head top row, torso top row (standing)
  /* carry: 'free' (empty right hand: both arms swing) or 'held' (a weapon: the right hand holds it steady at the ready) */
  function frontRig(dir, pose, i, carry) {      // dir 'down' | 'up'
    var r = { dir: dir, pose: pose, i: i, side: false, bob: 0, lean: 0, wd: [0, -1], sv: dir === 'down' ? 'face3' : 'back3', carry: carry };
    var fw = pose === 'walk' ? (i === 0 ? 1 : i === 2 ? -1 : 0) : 0;   // +1: the screen-left foot steps, -1: the screen-right one
    if (pose === 'walk' && (i === 1 || i === 3)) r.bob = -1;
    var liftA = fw === 1 ? 2 : pose === 'walk' && i === 3 ? 1 : 0, liftB = fw === -1 ? 2 : pose === 'walk' && i === 1 ? 1 : 0;   // passing: the trailing foot just off the ground
    if (pose === 'jump') { liftA = 3; liftB = 3; }
    // screen-left / screen-right legs (A / B); down: A = right leg, up: A = left leg
    r.legs = [{ key: 'A', x: 16, w: 3, fx: 15, fw: 4, lift: liftA, layer: 'mid' }, { key: 'B', x: 21, w: 3, fx: 21, fw: 4, lift: liftB, layer: 'mid' }];
    var ay = TY + r.bob, swingA = fw === 1 ? -1 : fw === -1 ? 1 : 0;   // screen-left hand: down 1 when its leg is back (swings forward)
    var held = carry !== 'free', rightIsA = dir === 'down';
    var sA = held && rightIsA ? 0 : swingA, sB = held && !rightIsA ? 0 : -swingA;
    var hA = { sx: 14, sy: ay, hx: held && rightIsA ? 13 : 14, hy: ay + 4 + sA }, hB = { sx: 24, sy: ay, hx: held && !rightIsA ? 25 : 24, hy: ay + 4 + sB };   // a held weapon is carried a little away from the body
    if (pose === 'jump') { hA = { sx: 14, sy: ay, hx: 12, hy: ay + 2 }; hB = { sx: 24, sy: ay, hx: 26, hy: ay + 2 }; }
    var right = rightIsA ? hA : hB, left = rightIsA ? hB : hA;
    if (pose === 'attack') {
      if (dir === 'down') {
        right = [{ sx: 14, sy: ay, hx: 12, hy: ay - 3 }, { sx: 14, sy: ay, hx: 15, hy: ay + 1 }, { sx: 14, sy: ay, hx: 18, hy: ay + 3 }][i];
        r.wd = [[-1, -1], [1, 1], [1, 0]][i];
      } else {
        right = [{ sx: 24, sy: ay, hx: 26, hy: ay - 3 }, { sx: 24, sy: ay, hx: 24, hy: ay - 1 }, { sx: 24, sy: ay, hx: 21, hy: ay + 1 }][i];
        r.wd = [[1, -1], [-1, -1], [0, -1]][i];
      }
    }
    var layer = dir === 'down' ? 'front' : 'back';
    r.arms = { R: { sx: right.sx, sy: right.sy, hx: right.hx, hy: right.hy, layer: layer }, L: { sx: left.sx, sy: left.sy, hx: left.hx, hy: left.hy, layer: layer } };
    r.itemLayer = { R: layer, L: 'front' };
    if (pose === 'attack' && dir === 'up') r.itemLayer.R = 'front';   // the raised weapon shows over the head
    r.head = { x: 15, y: HY + r.bob, w: 10, h: 9 };
    r.torso = { x: 16, y: TY + r.bob, w: 8, h: 6 };
    r.hip = TY + 6;
    return r;
  }
  /* side (local, facing right). rightIsNear: true for the right view (the right hand is the near one), false for the left view */
  function sideRig(pose, i, rightIsNear, carry) {
    var r = { dir: rightIsNear ? 'right' : 'left', pose: pose, i: i, side: true, bob: 0, lean: 0, wd: [1, -1], carry: carry };
    var fw = pose === 'walk' ? (i === 0 ? 1 : i === 2 ? -1 : 0) : 0;   // +1 near leg forward, -1 far leg forward
    if (pose === 'walk' && (i === 1 || i === 3)) r.bob = -1;
    var nearDx = fw * 2, farDx = -fw * 2, nearLift = pose === 'walk' && i === 3 ? 2 : 0, farLift = pose === 'walk' && i === 1 ? 2 : 0;
    if (pose === 'jump') { nearDx = 2; farDx = -2; nearLift = 3; farLift = 2; }
    if (pose === 'attack') { nearDx = [-1, 2, 2][i]; farDx = [1, -2, -2][i]; r.lean = [-1, 1, 1][i]; }
    r.legs = [{ key: 'far', x: 17, w: 3, fx: 17 + farDx, fw: 4, lift: farLift, layer: 'back' }, { key: 'near', x: 19, w: 3, fx: 19 + nearDx, fw: 4, lift: nearLift, layer: 'front' }];
    var ay = TY + r.bob, sw = fw * 2;     // near hand swings back (-x) when the near leg is forward
    var near = { sx: 19, sy: ay, hx: 19 - sw, hy: ay + 4 }, far = { sx: 18, sy: ay, hx: 18 + sw, hy: ay + 4 };
    if (carry !== 'free') {               // the weapon hand holds steady, forward of the body, at the ready
      if (rightIsNear) near = { sx: 19, sy: ay, hx: 21, hy: ay + 4 }; else far = { sx: 18, sy: ay, hx: 20, hy: ay + 4 };
    }
    if (pose === 'jump') {
      near = { sx: 19, sy: ay, hx: 22, hy: ay + 1 }; far = { sx: 18, sy: ay, hx: 15, hy: ay + 2 };
      if (carry !== 'free' && !rightIsNear) { far = { sx: 18, sy: ay, hx: 21, hy: ay + 1 }; near = { sx: 19, sy: ay, hx: 16, hy: ay + 2 }; }
    }
    if (pose === 'attack') {
      var swing = [{ hx: 16, hy: ay - 4 }, { hx: 25, hy: ay + 1 }, { hx: 23, hy: ay + 1 }][i];
      r.wd = [[-1, -1], [1, 0], [1, 1]][i];
      if (carry === 'thrust') { swing = [{ hx: 15, hy: ay + 2 }, { hx: 25, hy: ay + 2 }, { hx: 22, hy: ay + 2 }][i]; r.wd = [1, 0]; }   // a thrust: drawn back along its own axis, tip forward
      if (rightIsNear) { near = { sx: 19, sy: ay, hx: swing.hx + r.lean, hy: swing.hy }; far = { sx: 18, sy: ay, hx: 20 + r.lean, hy: ay + 3 }; }
      else { far = { sx: 18, sy: ay, hx: swing.hx + r.lean, hy: swing.hy }; near = { sx: 19, sy: ay, hx: 21 + r.lean, hy: ay + 3 }; }
    }
    near.layer = 'front'; far.layer = 'back';
    r.arms = rightIsNear ? { R: near, L: far } : { R: far, L: near };
    r.itemLayer = rightIsNear ? { R: 'front', L: 'back' } : { R: 'back', L: 'front' };
    r.sv = rightIsNear ? 'edgeFar' : 'face';
    r.head = { x: 16 + r.lean, y: HY + r.bob, w: 9, h: 9 };
    r.torso = { x: 17 + r.lean, y: TY + r.bob, w: 6, h: 6 };
    r.hip = TY + 6;
    return r;
  }
  function localRig(dir, pose, i, carry) {
    if (!POSES[pose]) pose = 'stand';
    i = Math.max(0, Math.min(POSES[pose] - 1, i | 0));
    carry = carry === 'held' || carry === 'thrust' ? carry : 'free';
    if (dir === 'right') return sideRig(pose, i, true, carry);
    if (dir === 'left') return sideRig(pose, i, false, carry);
    return frontRig(dir === 'up' ? 'up' : 'down', pose, i, carry);
  }
  /* the anchor table in FRAME coordinates (left view mirrored); hand x / y = top-left of the 2x2 hand */
  function rig(dir, pose, i, carry) {
    var r = localRig(dir, pose, i, carry);
    if (dir !== 'left') return r;
    var o = JSON.parse(JSON.stringify(r));
    o.head.x = W - o.head.x - o.head.w; o.torso.x = W - o.torso.x - o.torso.w;
    o.legs.forEach(function (l) { l.x = W - l.x - l.w; l.fx = W - l.fx - l.fw; });
    ['R', 'L'].forEach(function (k) { var a = o.arms[k]; a.sx = W - a.sx - 2; a.hx = W - a.hx - 2; });
    o.wd = [-o.wd[0], o.wd[1]]; o.lean = -o.lean;
    return o;
  }

  /* ---------- the painter ---------- */
  function Canvas() {
    return { c: new Array(W * H), o: new Array(W * H), log: [], marks: {} };
  }
  function raster(look, dir, pose, i, opt) {
    opt = opt || {};
    var L = look && look.body && look.body.style ? look : normLook(look);
    if (DIRS.indexOf(dir) < 0) dir = 'down';
    if (!POSES[pose]) pose = 'stand';
    i = Math.max(0, Math.min(POSES[pose] - 1, i | 0));
    var carry = L.weapon.style === 'none' ? 'free' : L.weapon.style === 'spear' ? 'thrust' : 'held', r = localRig(dir, pose, i, carry), B = Canvas(), side = r.side;
    var S = function (slot) { return L[slot].style; };
    var skin = colorOf(L, 'body'), hair = colorOf(L, 'hair');
    var owner = 'body';
    function put(x, y, col, own) { if (x < 0 || y < 0 || x >= W || y >= H || !col) return; var k = y * W + x; B.c[k] = col; B.o[k] = own || owner; }
    function rect(x, y, w, h, col, own) { for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) put(x + xx, y + yy, col, own); }
    function at(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? null : B.o[y * W + x]; }
    function begin(name) { owner = name; B.log.push(name); }

    /* -- limbs -- */
    function arm(a, which, sleeve, cuff, edge) {
      // a 2 px wide limb from the shoulder (sx, sy) to the hand (hx, hy): sleeve (top's colours) then a 2x2 hand
      begin('arm' + which);
      var x0 = a.sx, y0 = a.sy, x1 = a.hx, y1 = a.hy - 1, n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (var k = 0; k <= n; k++) {
        var x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n);
        var shade = sleeve ? (k === 0 ? sleeve[3] : sleeve[2]) : skin[2];
        var bare = cuff != null && k >= cuff;
        if (edge && at(x - 1, y) === 'top' && y < a.hy - 1) put(x - 1, y, sleeve ? sleeve[0] : skin[0], 'top');   // a dark line parts the near arm from a same-coloured shirt
        put(x, y, bare ? skin[3] : shade); put(x + 1, y, bare ? skin[2] : (sleeve ? sleeve[1] : skin[1]));
        if (k === 0 && sleeve) { put(x, y + 1, sleeve[2]); put(x + 1, y + 1, sleeve[1]); }
      }
      begin('hand' + which);
      put(a.hx, a.hy, skin[3]); put(a.hx + 1, a.hy, skin[2]); put(a.hx, a.hy + 1, skin[2]); put(a.hx + 1, a.hy + 1, skin[1]);
      B.marks['hand' + which] = { x: a.hx, y: a.hy };
    }
    function leg(l) {
      // leg from the hip row to the ankle, then a 2-row foot; slants from x (hip) to fx (foot)
      begin('leg' + l.key);
      var top = r.hip + r.bob, footY = FOOT - 2 - l.lift, ank = footY - 1;   // foot rows footY, footY+1
      var far = l.key === 'far', bot = S('bottom'), cl = colorOf(L, 'bottom'), bt = colorOf(L, 'boots'), bs = S('boots');
      var robe = S('top') === 'robe';
      var bootTop = bs === 'shoes' ? footY : bs === 'boots' ? footY - 2 : footY - 3;
      var pantsBot = bot === 'trousers' ? ank : bot === 'shorts' ? top + 1 : top;     // last row covered by the bottom
      var footDx = side ? (l.fx - l.x) : (l.fx - l.x);
      for (var y = top; y <= ank; y++) {
        var k = ank === top ? 1 : (y - top) / (ank - top), x = l.x + Math.round((side ? footDx : 0) * k);
        var cols, own;
        if (y >= bootTop) { cols = bt; own = 'boots'; }
        else if (y <= pantsBot) { cols = cl; own = 'bottom'; }
        else { cols = skin; own = 'body'; }
        var d = far ? 1 : 0;
        put(x, y, cols[Math.max(0, 3 - d - (side ? 0 : 0))], own); put(x + 1, y, cols[2 - d], own); put(x + 2, y, cols[1 - d] || cols[0], own);
        if (own === 'boots' && y === bootTop && bs !== 'shoes') { put(x, y, bt[4 - d], 'boots'); put(x + 1, y, bt[3 - d], 'boots'); put(x + 2, y, bt[2 - d], 'boots'); }
        if (own === 'boots' && bs === 'greaves' && y === bootTop + 1) put(x + 1, y, bt[4 - d], 'boots');
      }
      // foot (2 rows): side views point the toe forward (+x); front views splay outward
      var fx = l.fx, d2 = far ? 1 : 0;
      for (var yy = 0; yy < 2; yy++) for (var xx = 0; xx < l.fw; xx++) {
        var c = yy === 1 ? bt[1 - d2] || bt[0] : (xx === 0 ? bt[3 - d2] : bt[2 - d2]);
        if (bs === 'greaves' && yy === 0 && xx === 1) c = bt[4 - d2];
        put(fx + xx, footY + yy, c, 'boots');
      }
      if (side && !far) put(fx + 3, footY, bt[3], 'boots');
      B.marks['foot' + l.key] = { x: fx, y: footY + 1, lift: l.lift };
      if (robe) robeHem(l);
    }
    function robeHem() { }
    /* -- torso: the top, the waist of the bottom, skirts -- */
    function torso() {
      var t = r.torso, top = S('top'), C = colorOf(L, 'top'), bot = S('bottom'), BC = colorOf(L, 'bottom');
      // waist band of the bottom (row under the torso is the hip row; the bottom's waist sits on the torso's last row)
      begin('bottom');
      if (top !== 'robe') {
        var hy = t.y + t.h - 1;
        rect(t.x, hy, t.w, 2, BC[2]); rect(t.x, hy + 1, t.w, 1, BC[1]);
        if (bot === 'skirt') skirt(BC);
      }
      begin('top');
      var lit = side ? null : (dir === 'down' ? 'left' : 'right');
      function body(cols, x, y, w, h) {
        for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
          var c = cols[2];
          if (yy === 0) c = cols[3];
          if (yy === h - 1) c = cols[1];
          if (!side) { if (xx === 0) c = lit === 'left' ? cols[3] : cols[1]; if (xx === w - 1) c = lit === 'left' ? cols[1] : cols[3]; if (yy === 0 && xx > 0 && xx < w - 1) c = cols[3]; }
          else if (xx === 0) c = cols[1];
          put(x + xx, y + yy, c);
        }
      }
      if (top === 'robe') {
        // robe: torso + a long skirt to the ankles that sways with the step
        body(C, t.x, t.y, t.w, t.h);
        var sway = r.pose === 'walk' ? (r.i === 0 ? 1 : r.i === 2 ? -1 : 0) : 0, y0 = t.y + t.h - 1, y1 = FOOT - 3;
        for (var y = y0; y <= y1; y++) {
          var k = (y - y0) / Math.max(1, y1 - y0), grow = Math.round(k * 1.6), x0 = t.x - grow + (side ? Math.round(sway * k) - (k > 0.5 ? 1 : 0) : 0), w = t.w + grow * 2 + (side ? 1 : 0);
          for (var xx = 0; xx < w; xx++) {
            var c = C[2];
            if (side) { if (xx === 0) c = C[1]; else if (xx === w - 1) c = C[3]; }
            else { if (xx === 0) c = dir === 'down' ? C[3] : C[1]; else if (xx === w - 1) c = dir === 'down' ? C[1] : C[3]; else if (!side && (xx === Math.floor(w / 2)) && y > y0 + 1) c = C[1]; }
            if (y === y1) c = C[1];
            put(x0 + xx, y, c);
          }
        }
        // sash
        var sash = ramp(FIXED.gold);
        rect(t.x, t.y + 3, t.w, 1, sash[2]); put(t.x + (side ? t.w - 1 : 0), t.y + 3, sash[3]);
        if (!side) { put(t.x + 3, t.y + 4, sash[1]); put(t.x + 3, t.y + 5, sash[2]); }
        if (dir === 'down') { put(t.x + 3, t.y, skin[2]); put(t.x + 4, t.y, skin[1]); put(t.x + 3, t.y + 1, C[0]); put(t.x + 4, t.y + 1, C[0]); }
        B.marks.waist = { y: t.y + t.h };
        return;
      }
      if (top === 'tunic') {
        body(C, t.x, t.y, t.w, t.h);
        // hem over the hips (1 row, 1 px wider), V neck, belt with a buckle
        var hemY = t.y + t.h;
        for (var xx2 = -1; xx2 <= t.w; xx2++) put(t.x + xx2, hemY, xx2 === -1 || xx2 === t.w ? C[1] : C[2]);
        if (side) put(t.x - 1, hemY, C[0]);
        var belt = colorOf(L, 'boots') && S('boots') !== 'greaves' ? colorOf(L, 'boots') : ramp(FIXED.strap);
        rect(t.x, t.y + 4, t.w, 1, belt[1]);
        if (!side) { put(t.x + 3, t.y + 4, ramp(FIXED.gold)[3]); put(t.x + 4, t.y + 4, ramp(FIXED.gold)[2]); }
        else put(t.x + t.w - 2, t.y + 4, ramp(FIXED.gold)[3]);
        if (dir === 'down') { put(t.x + 3, t.y, skin[2]); put(t.x + 4, t.y, skin[1]); put(t.x + 3, t.y + 1, C[0]); put(t.x + 4, t.y + 1, C[1]); }
        if (side) { put(t.x + t.w - 1, t.y, skin[2]); }
      } else if (top === 'plate') {
        body(C, t.x, t.y, t.w, t.h);
        var M = ramp(FIXED.mail);
        // chest plate: a ridge down the middle (front), shine; mail skirt under it
        if (!side) { for (var y2 = t.y + 1; y2 < t.y + 4; y2++) { put(t.x + 3, y2, dir === 'down' ? C[4] : C[2]); put(t.x + 4, y2, C[1]); } put(t.x + 1, t.y + 1, C[4]); }
        else { put(t.x + t.w - 2, t.y + 1, C[4]); put(t.x + t.w - 2, t.y + 2, C[3]); }
        var belt2 = ramp(FIXED.strap);
        rect(t.x, t.y + 4, t.w, 1, belt2[1]);
        if (!side) put(t.x + 3, t.y + 4, ramp(FIXED.gold)[3]);
        for (var xx3 = -1; xx3 <= t.w; xx3++) put(t.x + xx3, t.y + t.h, (xx3 + r.i) % 2 ? M[2] : M[1]);
      } else if (top === 'vest') {
        var LN = ramp(FIXED.linen);
        body(LN, t.x, t.y, t.w, t.h);
        // leather vest panels over a linen shirt, open at the front
        if (!side) {
          var open = dir === 'down';
          rect(t.x, t.y, 3, t.h, C[2]); rect(t.x + t.w - 3, t.y, 3, t.h, C[2]);
          if (!open) rect(t.x, t.y, t.w, t.h, C[2]);
          put(t.x, t.y, C[3]); put(t.x + 1, t.y, C[3]); rect(t.x + t.w - 1, t.y, 1, t.h, C[1]); rect(t.x, t.y + t.h - 1, t.w, 1, C[1]);
          if (open) { put(t.x + 2, t.y + 2, C[4]); put(t.x + 5, t.y + 2, C[4]); put(t.x + 2, t.y + 3, C[3]); }
          else { rect(t.x + 3, t.y + 1, 2, 1, C[1]); }
        } else {
          rect(t.x, t.y, t.w - 2, t.h, C[2]); rect(t.x, t.y, 1, t.h, C[1]); rect(t.x, t.y, t.w - 2, 1, C[3]); rect(t.x, t.y + t.h - 1, t.w - 2, 1, C[1]);
          put(t.x + t.w - 3, t.y + 2, C[4]);
        }
        var belt3 = ramp(FIXED.strap);
        rect(t.x, t.y + t.h - 1, t.w, 1, belt3[1]);
        if (!side) put(t.x + 3, t.y + t.h - 1, ramp(FIXED.gold)[3]);
      }
      B.marks.waist = { y: t.y + t.h };
    }
    function skirt(BC) {
      // an A-line skirt from the waist to above the knee; the hem sways with the step
      var t = r.torso, y0 = t.y + t.h, y1 = y0 + 2, sway = r.pose === 'walk' ? (r.i === 0 ? 1 : r.i === 2 ? -1 : 0) : 0;
      for (var y = y0; y <= y1; y++) {
        var k = y - y0, x0 = t.x - k + (side ? sway * (k > 1 ? 1 : 0) : 0), w = t.w + 2 * k;
        for (var xx = 0; xx < w; xx++) {
          var c = BC[2];
          if (xx === 0) c = side ? BC[1] : (dir === 'down' ? BC[3] : BC[1]);
          if (xx === w - 1) c = side ? BC[2] : (dir === 'down' ? BC[1] : BC[3]);
          if (y === y1) c = BC[1];
          if (!side && y > y0 && (xx === Math.floor(w / 2) - 2 || xx === Math.floor(w / 2) + 1)) c = BC[1];
          put(x0 + xx, y, c);
        }
      }
    }
    function sleeves() {
      var top = S('top'), C = colorOf(L, 'top');
      if (top === 'plate') return { cols: ramp(FIXED.mail), cuff: null, pauldron: C };
      if (top === 'vest') return { cols: ramp(FIXED.linen), cuff: 2, pauldron: null };
      return { cols: C, cuff: null, pauldron: null };
    }
    function drawArm(which) {
      var a = r.arms[which], sl = sleeves();
      arm(a, which, sl.cols, sl.cuff, side && a.layer === 'front' && r.pose !== 'attack');
      if (sl.pauldron) {   // shoulder plate: 3x2 over the top of the arm
        begin('top');
        var P = sl.pauldron, px = a.sx - (side ? 0 : (a.sx < CX ? 1 : 0));
        put(px, a.sy, P[4]); put(px + 1, a.sy, P[3]); put(px + 2, a.sy, P[2]); put(px, a.sy + 1, P[2]); put(px + 1, a.sy + 1, P[1]); put(px + 2, a.sy + 1, P[1]);
        if (!side && a.sx < CX) { put(px, a.sy, P[4]); }
      }
      if (S('top') === 'robe') {   // wide cuff
        begin('top');
        var C2 = colorOf(L, 'top');
        put(a.hx - (side ? 0 : 0), a.hy - 1, C2[1]); put(a.hx + 1, a.hy - 1, C2[1]);
        put(a.hx + (a.hx < CX && !side ? -1 : 2), a.hy - 1, C2[0]);
      }
    }
    /* -- head, face, hair, hat -- */
    function head() {
      var h = r.head;
      begin('head');
      for (var yy = 0; yy < h.h; yy++) for (var xx = 0; xx < h.w; xx++) {
        var corner = (yy === 0 || yy === h.h - 1) && (xx === 0 || xx === h.w - 1);
        if (corner) continue;
        var c = skin[2];
        if (!side) { if (xx === h.w - 1 || yy === h.h - 1) c = skin[1]; if (xx === 0 && dir === 'up') c = skin[1]; }
        else { if (yy === h.h - 1 || xx === 0) c = skin[1]; }
        put(h.x + xx, h.y + yy, c);
      }
      if (dir === 'down') {
        put(h.x + 2, h.y + 4, INK); put(h.x + 2, h.y + 5, INK); put(h.x + 7, h.y + 4, INK); put(h.x + 7, h.y + 5, INK);
        put(h.x + 3, h.y + 4, skin[4]);
        put(h.x + 1, h.y + 6, FIXED.blush); put(h.x + 8, h.y + 6, FIXED.blush);
        put(h.x + 4, h.y + 7, skin[0]); put(h.x + 5, h.y + 7, skin[1]);
        B.marks.eyes = [{ x: h.x + 2, y: h.y + 4 }, { x: h.x + 7, y: h.y + 4 }];
      } else if (side) {
        put(h.x + 6, h.y + 4, INK); put(h.x + 6, h.y + 5, INK); put(h.x + 7, h.y + 6, FIXED.blush);
        put(h.x + 7, h.y + 7, skin[0]);
        put(h.x + h.w, h.y + 5, skin[2]);                        // nose
        put(h.x + 3, h.y + 4, skin[1]); put(h.x + 3, h.y + 5, skin[1]);   // ear
        B.marks.eyes = [{ x: h.x + 6, y: h.y + 4 }];
      }
      B.marks.head = { x: h.x, y: h.y };
    }
    function hairBack() {
      var st = S('hair'), h = r.head, C = hair;
      if (st === 'long' && S('hat') !== 'hood') {
        begin('hair');
        if (!side) { var len = 9; rect(h.x - 1, h.y + 3, 2, len, C[1]); rect(h.x + h.w - 1, h.y + 3, 2, len, C[1]); if (dir === 'up') rect(h.x, h.y + 4, h.w, len, C[2]); }
        else { rect(h.x - 1, h.y + 2, 4, 9, C[1]); rect(h.x - 1, h.y + 10, 3, 1, C[0]); }
      }
    }
    function hairFront() {
      var st = S('hair'), h = r.head, C = hair, hat = S('hat'), x = h.x, y = h.y, w = h.w;
      begin('hair');
      var capped = hat === 'helm' || hat === 'hood' || hat === 'wizard' || hat === 'cap';
      if (st === 'bald') { if (!capped && dir !== 'down') put(x + 2, y + 1, skin[4]); if (dir === 'down' && !capped) put(x + 3, y + 1, skin[4]); return; }
      function cap(extraRows) {   // the hair cap over the skull
        for (var xx = 1; xx < w - 1; xx++) put(x + xx, y - 1, C[2]);
        for (var yy = 0; yy < 3 + (extraRows || 0); yy++) for (var xx2 = 0; xx2 < w; xx2++) put(x + xx2, y + yy, yy === 0 ? C[3] : C[2]);
        put(x + 2, y, C[4]); put(x + 3, y, C[4]);
      }
      if (dir === 'up') {
        cap(0);
        rect(x, y, w, h.h - 1, C[2]); rect(x + w - 2, y + 1, 2, h.h - 2, C[1]); rect(x, y + h.h - 2, w, 1, C[1]); put(x + 1, y + h.h - 1, C[1]); put(x + 2, y + h.h - 1, C[1]); put(x + w - 2, y + h.h - 1, C[0]); put(x + w - 3, y + h.h - 1, C[1]); put(x + 2, y, C[4]); put(x + 3, y, C[4]); put(x + 2, y + 1, C[3]);
        if (st === 'tail') { rect(x + 4, y + h.h - 1, 2, 5, C[2]); put(x + 5, y + h.h - 1, C[1]); put(x + 4, y + h.h + 3, C[1]); put(x + 4, y + h.h - 2, FIXED.red); put(x + 5, y + h.h - 2, FIXED.red); }
        if (st === 'spiky') { put(x + 1, y - 2, C[2]); put(x + 4, y - 3, C[3]); put(x + 4, y - 2, C[2]); put(x + 7, y - 2, C[2]); put(x + 8, y - 2, C[1]); }
        if (st === 'bob') { rect(x - 1, y + 3, 1, 5, C[1]); rect(x + w, y + 3, 1, 5, C[1]); }
        return;
      }
      if (dir === 'down') {
        cap(0);
        if (hat === 'helm') return;   // the helm and its cheek guards cover the hair
        // fringe and sides
        if (st === 'short') { put(x + 1, y + 3, C[2]); put(x + 8, y + 3, C[1]); put(x, y + 3, C[2]); put(x + w - 1, y + 3, C[1]); put(x, y + 4, C[1]); put(x + w - 1, y + 4, C[1]); put(x + 4, y + 3, C[2]); }
        if (st === 'long') { rect(x, y + 3, 1, 4, C[2]); rect(x + w - 1, y + 3, 1, 4, C[1]); put(x + 1, y + 3, C[2]); put(x + 8, y + 3, C[2]); }
        if (st === 'tail') { put(x, y + 3, C[2]); put(x + w - 1, y + 3, C[1]); put(x + 3, y + 3, C[2]); put(x + 6, y + 3, C[1]); put(x + w, y + 2, C[1]); put(x + w, y + 3, C[1]); put(x + w, y + 4, C[0]); }
        if (st === 'spiky') { put(x + 1, y - 2, C[2]); put(x + 4, y - 3, C[3]); put(x + 4, y - 2, C[2]); put(x + 5, y - 2, C[2]); put(x + 8, y - 2, C[1]); put(x + 2, y + 3, C[2]); put(x + 5, y + 3, C[2]); put(x + 7, y + 3, C[1]); put(x - 1, y + 1, C[2]); put(x + w, y + 1, C[1]); }
        if (st === 'bob') { rect(x - 1, y + 1, 1, 6, C[2]); rect(x + w, y + 1, 1, 6, C[1]); rect(x, y + 3, 1, 4, C[2]); rect(x + w - 1, y + 3, 1, 4, C[1]); for (var b = 1; b < w - 1; b++) put(x + b, y + 3, b % 3 === 0 ? C[1] : C[2]); }
        return;
      }
      // side (local, facing right): hair over the back of the head, a fringe at the front
      cap(0);
      rect(x, y, 4, h.h - 3, C[2]); rect(x, y + 3, 1, h.h - 5, C[1]); put(x + w - 1, y + 3, C[2]); put(x + w - 2, y + 3, C[2]);
      put(x + 3, y + 4, C[2]); put(x + 3, y + 5, C[1]);                          // over the ear: hair edge
      if (st === 'short') { put(x + 4, y + 3, C[1]); }
      if (st === 'long') { rect(x, y + 3, 3, 6, C[2]); }
      if (st === 'tail') { var sw = r.pose === 'walk' && (r.i === 1 || r.i === 3) ? 1 : 0; rect(x - 2, y + 2 + sw, 2, 2, C[2]); rect(x - 3, y + 4 + sw, 2, 3, C[2]); put(x - 3, y + 6 + sw, C[1]); put(x - 1, y + 2 + sw, FIXED.red); }
      if (st === 'spiky') { put(x + 1, y - 2, C[2]); put(x + 2, y - 3, C[3]); put(x + 4, y - 2, C[2]); put(x + 6, y - 2, C[3]); put(x + 7, y - 1, C[2]); put(x - 1, y + 1, C[2]); put(x - 1, y + 2, C[1]); put(x + w - 1, y + 2, C[3]); put(x + w, y + 2, C[2]); }
      if (st === 'bob') { rect(x - 1, y + 1, 1, 6, C[1]); rect(x, y + 3, 3, 4, C[2]); put(x + w - 1, y + 3, C[2]); }
    }
    function hat() {
      var st = S('hat'); if (st === 'none') return;
      var h = r.head, x = h.x, y = h.y, w = h.w, C = colorOf(L, 'hat');
      begin('hat');
      if (st === 'helm') {
        for (var xx = 1; xx < w - 1; xx++) put(x + xx, y - 2, C[3]);
        rect(x, y - 1, w, 4, C[2]); put(x + 1, y - 1, C[4]); put(x + 2, y - 1, C[4]); put(x + 1, y, C[3]);
        rect(x - 1, y + 3, w + 2, 1, C[1]);                                    // rim
        if (dir === 'down') { put(x + 4, y + 4, C[1]); put(x + 5, y + 4, C[1]); put(x + 4, y + 5, C[0]); put(x + 5, y + 5, C[0]); rect(x - 1, y + 4, 1, 3, C[1]); rect(x + w, y + 4, 1, 3, C[0]); }
        else if (dir === 'up') { rect(x, y + 4, w, 1, C[1]); rect(x + w - 2, y - 1, 2, 4, C[1]); }
        else { rect(x, y + 4, 4, 3, C[1]); put(x + 3, y + 4, C[2]); rect(x, y - 1, 1, 4, C[1]); put(x + w, y + 3, C[1]); }
        // crest
        if (side) { put(x + 2, y - 3, FIXED.red); put(x + 3, y - 3, FIXED.red); put(x + 1, y - 3, '#8a1e2a'); put(x + 4, y - 3, FIXED.red); put(x + 4, y - 4, '#ff6a5a'); }
        else { put(x + 4, y - 3, FIXED.red); put(x + 5, y - 3, '#8a1e2a'); put(x + 4, y - 4, '#ff6a5a'); put(x + 5, y - 4, FIXED.red); }
      } else if (st === 'hood') {
        // cloth hood: over the skull and down the sides, a soft point at the back; the face opening stays clear
        for (var xx2 = 1; xx2 < w - 1; xx2++) put(x + xx2, y - 2, C[3]);
        rect(x - 1, y - 1, w + 2, 3, C[2]); put(x + 1, y - 1, C[4]); put(x + 2, y - 1, C[3]);
        if (dir === 'down') { rect(x - 1, y + 2, 2, 7, C[2]); rect(x + w - 1, y + 2, 2, 7, C[1]); rect(x + 1, y + 2, w - 2, 1, C[1]); rect(x - 1, y + 9, w + 2, 1, C[1]); rect(x, y + 3, 1, 4, C[3]); rect(x + w - 2, y + 3, 1, 5, C[0]); }
        else if (dir === 'up') { rect(x - 1, y - 1, w + 2, h.h + 1, C[2]); rect(x + w - 1, y, 2, h.h, C[1]); rect(x + 4, y + 1, 1, h.h - 1, C[1]); put(x + 1, y, C[3]); put(x + 2, y, C[3]); rect(x, y + 1, 1, 5, C[3]); put(x + 1, y + 1, C[4]); rect(x + 3, y + h.h, 4, 1, C[2]); put(x + 4, y + h.h + 1, C[1]); put(x + 5, y + h.h + 1, C[1]); rect(x - 1, y + h.h - 1, w + 2, 1, C[1]); }
        else { rect(x - 1, y - 1, 6, h.h + 1, C[2]); rect(x - 1, y + 2, 1, h.h - 2, C[1]); rect(x + 5, y - 1, w - 5, 2, C[2]); rect(x + w - 1, y + 1, 1, 1, C[1]); rect(x + 3, y + 3, 2, h.h - 3, C[1]); put(x - 2, y + h.h - 1, C[1]);
          rect(x, y - 1, 5, 1, C[3]); put(x + 1, y - 1, C[4]); rect(x + 1, y + 1, 1, 4, C[3]); rect(x + 4, y + 1, 1, h.h - 2, C[0]); rect(x + 5, y + 1, w - 6, 1, C[1]); put(x - 1, y + h.h - 1, C[0]); put(x, y + h.h, C[1]); }
      } else if (st === 'wizard') {
        // a wide brim and a tall cone that bends back
        rect(x - 2, y + 1, w + 4, 1, C[1]); rect(x - 1, y, w + 2, 1, C[2]);
        var band = ramp(FIXED.gold);
        var cx0 = side ? x + 1 : x + 1, cw = w - 2, back = side ? -1 : 0;
        for (var k = 0; k < 9; k++) {
          var yy = y - 1 - k, ww = Math.max(1, cw - Math.floor(k * 0.9)), off = Math.round((cw - ww) / 2) + (k > 5 ? back * (k - 5) : 0);
          for (var q = 0; q < ww; q++) put(cx0 + off + q, yy, q === 0 ? C[3] : q === ww - 1 ? C[1] : C[2]);
        }
        rect(cx0, y - 2, cw, 1, band[2]); put(cx0 + 1, y - 2, band[3]);
        put(cx0 + Math.round(cw / 2) + (side ? -4 : 0), y - 10, band[3]);
      } else if (st === 'circlet') {
        var gem = TINTS.gem.sapphire;
        if (dir === 'down') { rect(x, y + 2, w, 1, C[2]); put(x, y + 2, C[3]); put(x + w - 1, y + 2, C[1]); put(x + 4, y + 2, gem); put(x + 5, y + 2, ramp(gem)[1]); put(x + 4, y + 1, C[3]); put(x + 5, y + 1, C[2]); }
        else if (dir === 'up') { rect(x, y + 2, w, 1, C[1]); }
        else { rect(x + 2, y + 2, w - 2, 1, C[2]); put(x + w - 1, y + 2, gem); put(x + w - 1, y + 1, C[3]); }
      } else if (st === 'cap') {
        // soft cap with a feather
        for (var xx3 = 1; xx3 < w - 1; xx3++) put(x + xx3, y - 2, C[3]);
        rect(x, y - 1, w, 3, C[2]); put(x + 1, y - 1, C[4]); rect(x - 1, y + 2, w + 2, 1, C[1]);
        if (side) { rect(x + w - 1, y + 1, 2, 1, C[1]); }
        var F = ramp('#f2eedc'), fx = side ? x - 1 : x + w - 2, fd = side ? -1 : 1;
        put(fx, y - 2, F[2]); put(fx + fd, y - 3, F[2]); put(fx + fd, y - 4, F[3]); put(fx + 2 * fd, y - 5, F[3]); put(fx + 2 * fd, y - 4, F[1]);
      }
      B.marks.hat = { x: x, y: y };
    }
    /* -- held items -- */
    function itemDir(st, r) {
      var pole = st === 'staff' || st === 'spear';
      if (r.pose !== 'attack') return r.side ? [1, -1] : [0, -1];
      if (r.side) { if (st === 'spear') return r.wd; if (st === 'staff') return [[-1, -1], [1, -1], [1, 0]][r.i]; return r.wd; }
      if (pole) return r.dir === 'down' ? [[-1, -1], [-1, -1], [1, 0]][r.i] : [[1, -1], [0, -1], [-1, -1]][r.i];
      return r.wd;
    }
    function weapon(layer) {
      var st = S('weapon'); if (st === 'none' || r.itemLayer.R !== layer) return;
      var a = r.arms.R, d = r.wd, M = colorOf(L, 'weapon'), Wd = ramp(FIXED.wood), G = ramp(FIXED.gold);
      d = itemDir(st, r);
      begin('weapon');
      var gx = a.hx + (d[0] > 0 ? 1 : 0), gy = a.hy + (d[1] > 0 ? 1 : 0);        // the grip: in the hand, on the side the item points to
      if (d[0] === 0) gx = a.hx + (a.hx < CX ? 0 : 1);
      if (d[1] === 0) gy = a.hy + 1;
      var px = -d[1], py = d[0];                                                 // perpendicular
      function P(k, col, off) {
        off = off || 0; var bx = gx + d[0] * k, by = gy + d[1] * k;
        if (off && d[0] && d[1]) { var sg = off > 0 ? 1 : -1; put(bx + px * off, by + py * (off - sg), col); }   // diagonal: fill the step so a head is solid, not a checker
        put(bx + px * off, by + py * off, col);
      }
      if (st === 'sword') {
        P(-1, G[2]); P(0, Wd[1]); P(1, G[3]); P(1, G[1], 1); P(1, G[2], -1);
        for (var k = 2; k <= 7; k++) { P(k, M[k < 4 ? 3 : 4]); if (!(d[0] && d[1])) P(k, M[1], 1); }
        P(8, M[4]);
      } else if (st === 'axe') {
        for (var k2 = -1; k2 <= 7; k2++) P(k2, k2 % 3 === 0 ? Wd[1] : Wd[2]);
        var s = !r.side && d[0] === 0 ? (gx < CX ? -1 : 1) * (px > 0 ? 1 : -1) : (d[0] && d[1] ? (d[1] < 0 ? 1 : -1) : 1);   // the blade faces away from the body
        for (var k3 = 5; k3 <= 8; k3++) { P(k3, M[2], s); P(k3, k3 === 5 || k3 === 8 ? M[1] : M[3], 2 * s); }
        P(6, M[4], 3 * s); P(7, M[4], 3 * s); P(8, M[2]);
      } else if (st === 'staff') {
        var GM = colorOf(L, 'weapon');
        for (var k4 = -5; k4 <= 9; k4++) P(k4, k4 % 4 === 0 ? Wd[1] : Wd[2]);
        P(10, Wd[3]); P(10, Wd[1], 1); P(10, Wd[1], -1);
        P(11, GM[2]); P(11, GM[1], 1); P(11, GM[3], -1); P(12, GM[4]); P(12, GM[2], 1); P(12, GM[2], -1); P(13, GM[3]);
      } else if (st === 'spear') {
        for (var k5 = -6; k5 <= 8; k5++) P(k5, k5 % 4 === 0 ? Wd[1] : Wd[2]);
        P(8, FIXED.red, 1); P(7, '#8a1e2a', 1);
        P(9, M[3]); P(9, M[2], 1); P(9, M[2], -1); P(10, M[4]); P(10, M[1], 1); P(11, M[4]);
      }
      B.marks.grip = { x: gx, y: gy }; B.marks.weaponDir = d.slice();
      // the fist closes over the grip again
      begin('handR');
      if (layer === 'front' || !side) { put(a.hx, a.hy, skin[3]); put(a.hx + 1, a.hy, skin[2]); }
    }
    function shield(layer) {
      var st = S('shield'); if (st === 'none' || r.itemLayer.L !== layer) return;
      var a = r.arms.L, C = colorOf(L, 'shield'), M = ramp(st === 'buckler' ? TINTS.metal[L.shield.tint] : FIXED.steel), Wd = ramp(FIXED.wood), Au = ramp(FIXED.gold), St = ramp(FIXED.strap);
      if (st === 'buckler') C = M;
      begin('shield');
      var v = r.sv, cx = a.hx + 1, cy = a.hy + 1;
      if (v === 'edgeFar') cx = Math.min(a.hx - 2, r.torso.x - 1);   // facing right: the rim peeks out behind the back
      var face = v === 'face' || v === 'face3', back = v === 'back3';
      var hw = v === 'face' ? (st === 'buckler' ? 2 : 3) : (v === 'face3' || back) ? 2 : 1, hh = st === 'kite' ? 4 : st === 'buckler' ? 2 : 3;
      var bot = hh + (st === 'kite' ? 1 : 0);
      for (var yy = -hh; yy <= bot; yy++) {
        var rowW = hw;
        if (st === 'round' || st === 'buckler') { if (Math.abs(yy) === hh && hw > 1) rowW = hw - 1; }
        if (st === 'kite') { if (yy > 1) rowW = Math.max(0, hw - (yy - 1)); }
        for (var xx = -rowW; xx <= rowW; xx++) {
          var edge = Math.abs(xx) === rowW || yy === -hh || yy === bot || (st !== 'kite' && Math.abs(yy) === hh);
          var c;
          if (face) { c = edge ? M[1] : C[2]; if (!edge && xx < 0) c = C[3]; if (!edge && yy >= hh - 1) c = C[1]; if (edge && yy === -hh) c = M[3]; }
          else if (back) { c = edge ? M[1] : (xx % 2 ? Wd[1] : Wd[2]); if (edge && yy === -hh) c = M[2]; }
          else c = edge ? M[1] : C[2];
          put(cx + xx, cy + yy, c);
        }
      }
      if (face) {
        if (st === 'round' || st === 'buckler') { put(cx, cy, M[4]); put(cx + 1, cy, M[2]); put(cx, cy + 1, M[2]); }
        if (st === 'kite') { for (var y2 = -hh + 1; y2 <= 1; y2++) put(cx, cy + y2, Au[3]); put(cx - 1, cy - 1, Au[2]); put(cx + 1, cy - 1, Au[2]); }
        if (hw > 1) put(cx - hw + 1, cy - hh + 1, C[4]);
      } else if (back) { for (var x2 = -hw + 1; x2 < hw; x2++) put(cx + x2, cy, St[1]); put(cx, cy, St[3]); }
      B.marks.shieldGrip = { x: a.hx + 1, y: a.hy + 1 };
    }

    /* -- paint order -- */
    hairBack();
    weapon('back'); shield('back');
    if (side) {
      var farArm = r.arms.R.layer === 'back' ? 'R' : 'L';
      drawArm(farArm);
      leg(r.legs[0]);
      leg(r.legs[1]);
      torso();
      head(); hairFront(); hat();
      drawArm(farArm === 'R' ? 'L' : 'R');
    } else {
      leg(r.legs[0]); leg(r.legs[1]);
      torso();
      if (dir === 'up') { drawArm('R'); drawArm('L'); head(); hairFront(); hat(); }
      else { head(); hairFront(); hat(); drawArm('R'); drawArm('L'); }
    }
    weapon('front'); shield('front');

    // mirror the local side view for 'left'
    if (dir === 'left') {
      var c2 = new Array(W * H), o3 = new Array(W * H);
      for (var y3 = 0; y3 < H; y3++) for (var x3 = 0; x3 < W; x3++) { c2[y3 * W + x3] = B.c[y3 * W + (W - 1 - x3)]; o3[y3 * W + x3] = B.o[y3 * W + (W - 1 - x3)]; }
      B.c = c2; B.o = o3;
      for (var mk2 in B.marks) {
        var m = B.marks[mk2];
        if (Array.isArray(m)) B.marks[mk2] = m.map(function (e) { return { x: W - 1 - e.x, y: e.y }; });
        else if (m && m.x != null) {
          var wd = /^hand/.test(mk2) ? 2 : /^foot/.test(mk2) ? 4 : /^head|^hat/.test(mk2) ? r.head.w : 1;
          B.marks[mk2] = { x: W - m.x - wd, y: m.y, lift: m.lift };
        }
      }
    }
    return finish(B, rig(dir, pose, i, carry), L, false);
  }
  function finish(B, R, L, mutated) {
    // 1 px ink outline on transparent pixels next to the silhouette (4-neighbour)
    var out = B.c.slice(), own = B.o.slice();
    var x, y, k;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      k = y * W + x; if (B.c[k]) continue;
      if ((x > 0 && B.c[k - 1]) || (x < W - 1 && B.c[k + 1]) || (y > 0 && B.c[k - W]) || (y < H - 1 && B.c[k + W])) { out[k] = INK; own[k] = 'outline'; }
    }
    // pockets: an enclosed transparent area of <= POCKET px (between a held item and the body) is inked, like a hand-cleaned sprite
    if (!B.noPockets) {
      var reach = new Uint8Array(W * H), st = [], q, qx, qy;
      for (x = 0; x < W; x++) { st.push(x); st.push((H - 1) * W + x); } for (y = 0; y < H; y++) { st.push(y * W); st.push(y * W + W - 1); }
      while (st.length) { q = st.pop(); if (reach[q] || out[q]) continue; reach[q] = 1; qx = q % W; qy = (q / W) | 0; if (qx > 0) st.push(q - 1); if (qx < W - 1) st.push(q + 1); if (qy > 0) st.push(q - W); if (qy < H - 1) st.push(q + W); }
      var done = new Uint8Array(W * H);
      for (k = 0; k < W * H; k++) {
        if (out[k] || reach[k] || done[k]) continue;
        var reg = [], s2 = [k]; done[k] = 1;
        while (s2.length) { q = s2.pop(); reg.push(q); qx = q % W; qy = (q / W) | 0; [q - 1, q + 1, q - W, q + W].forEach(function (n, j) { if ((j === 0 && qx === 0) || (j === 1 && qx === W - 1) || n < 0 || n >= W * H) return; if (!out[n] && !reach[n] && !done[n]) { done[n] = 1; s2.push(n); } }); }
        if (reg.length <= POCKET) reg.forEach(function (n) { out[n] = INK; own[n] = 'outline'; });
      }
    }
    return { w: W, h: H, c: out, o: own, log: B.log, marks: B.marks, rig: R, look: L, foot: FOOT, mutated: !!mutated };
  }

  /* ---------- pose from game numbers ---------- */
  function normDir(d) {
    if (d === 'left' || d === 'right' || d === 'up' || d === 'down') return d;
    if (typeof d === 'number') { if (d === 1) return 'right'; if (d === -1) return 'left'; var a = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); return a < Math.PI / 4 || a >= 7 * Math.PI / 4 ? 'right' : a < 3 * Math.PI / 4 ? 'down' : a < 5 * Math.PI / 4 ? 'left' : 'up'; }
    if (d === 'l' || d === 'w' || d === 'west') return 'left'; if (d === 'r' || d === 'e' || d === 'east') return 'right'; if (d === 'n' || d === 'north' || d === 'u') return 'up';
    return 'down';
  }
  function poseOf(o, P) {
    o = o || {};
    var dir = normDir(o.dir != null ? o.dir : o.face != null ? o.face : o.facing);
    if (o.attack != null && o.attack !== false && +o.attack >= 0 && +o.attack < 1) return { dir: dir, pose: 'attack', i: Math.min(2, Math.floor(+o.attack * 3)) };
    if (o.attackFrame != null && o.attackFrame >= 0) return { dir: dir, pose: 'attack', i: Math.min(2, o.attackFrame | 0) };
    if (o.air) return { dir: dir, pose: 'jump', i: 0 };
    if (o.frame != null && o.moving !== false && o.frame >= 0 && (o.moving || o.walk == null)) return { dir: dir, pose: 'walk', i: ((o.frame | 0) % 4 + 4) % 4 };
    if (o.moving && o.walk != null) { var st = Math.max(1, +P.stride || 5); return { dir: dir, pose: 'walk', i: ((Math.floor(+o.walk / st) % 4) + 4) % 4 }; }
    return { dir: dir, pose: 'stand', i: 0 };
  }

  /* ---------- canvases (browser only) ---------- */
  function toCanvas(R, scale) {
    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d'), id = g.createImageData(W, H), d = id.data;
    for (var k = 0; k < W * H; k++) { var col = R.c[k]; if (!col) continue; var rgb = hex2rgb(col); d[k * 4] = rgb[0]; d[k * 4 + 1] = rgb[1]; d[k * 4 + 2] = rgb[2]; d[k * 4 + 3] = 255; }
    g.putImageData(id, 0, 0);
    return c;
  }

  /* ---------- verification of one look (pure; used by checks, the probe and doll.check()) ---------- */
  function verify(look, opt) {
    opt = opt || {};
    var L = look && look.body && look.body.style ? look : normLook(look), problems = [], frames = 0;
    var heldAll = L.weapon.style !== 'none', shAll = L.shield.style !== 'none';
    DIRS.forEach(function (dir) {
      Object.keys(POSES).forEach(function (pose) {
        for (var i = 0; i < POSES[pose]; i++) {
          var R = raster(L, dir, pose, i, opt), rg = R.rig, key = dir + ' ' + pose + i; frames++;
          var q = inspect(R);
          if (q.components !== 1) problems.push({ key: key, what: 'components', n: q.components });
          if (q.holes) problems.push({ key: key, what: 'holes', n: q.holes, at: q.holeAt });
          var footRow = q.low;
          if (pose !== 'jump' && footRow !== FOOT) problems.push({ key: key, what: 'feet', low: footRow });
          if (pose === 'jump' && footRow >= FOOT) problems.push({ key: key, what: 'jump-feet', low: footRow });
          // held items: the grip touches the RIGHT hand (anchor), the shield centre is the LEFT hand
          var hR = rg.arms.R, hL = rg.arms.L;
          if (heldAll) {
            var gp = R.marks.grip;
            if (!gp || gp.x < hR.hx || gp.x > hR.hx + 1 || gp.y < hR.hy || gp.y > hR.hy + 1) problems.push({ key: key, what: 'grip', grip: gp, hand: { x: hR.hx, y: hR.hy } });
          }
          if (shAll) {
            var sp = R.marks.shieldGrip;
            if (!sp || sp.x < hL.hx || sp.x > hL.hx + 1 || sp.y < hL.hy || sp.y > hL.hy + 1) problems.push({ key: key, what: 'shield', at: sp, hand: { x: hL.hx, y: hL.hy } });
          }
          // the holding arm is behind the body exactly when the rig says so (facing left: the right arm is the far one)
          if (rg.side) {
            var iR = R.log.indexOf('armR'), iT = R.log.indexOf('top'), wantBehind = rg.dir === 'left';
            if (iR < 0 || iT < 0 || (iR < iT) !== wantBehind) problems.push({ key: key, what: 'hand-side', log: R.log.join(',') });
            if (heldAll) { var iW = R.log.indexOf('weapon'); if ((iW < iT) !== wantBehind) problems.push({ key: key, what: 'weapon-layer' }); }
            if (shAll) { var iS = R.log.indexOf('shield'); if ((iS > iT) !== wantBehind) problems.push({ key: key, what: 'shield-layer' }); }
          }
          // hat and hair sit on the head anchor, the head on the torso (no gap at the neck), the bottom meets the top
          if (R.marks.head && (R.marks.head.x !== rg.head.x || R.marks.head.y !== rg.head.y)) problems.push({ key: key, what: 'head-anchor' });
          if (L.hat.style !== 'none' && (!R.marks.hat || R.marks.hat.y !== rg.head.y || R.marks.hat.x !== rg.head.x)) problems.push({ key: key, what: 'hat-anchor', hat: R.marks.hat, head: { x: rg.head.x, y: rg.head.y } });
          if (rg.head.y + rg.head.h !== rg.torso.y) problems.push({ key: key, what: 'neck' });
          if (heldAll) {
            var wpx = 0, onFace = 0, hd = rg.head;
            for (var q = 0; q < W * H; q++) if (R.o[q] === 'weapon') { wpx++; var qx = q % W, qy = (q / W) | 0; if (qx >= hd.x && qx < hd.x + hd.w && qy >= hd.y && qy < hd.y + hd.h) onFace++; }
            if (wpx < 5) problems.push({ key: key, what: 'weapon-hidden', px: wpx });
            if (dir === 'down' && onFace) problems.push({ key: key, what: 'weapon-face', px: onFace });
          }
          if (shAll) { var spx = 0, sx0 = W, sx1 = -1; for (var q2 = 0; q2 < W * H; q2++) if (R.o[q2] === 'shield') { spx++; sx0 = Math.min(sx0, q2 % W); sx1 = Math.max(sx1, q2 % W); }
            if (spx < 3 || (!rg.side && sx1 - sx0 + 1 < 5)) problems.push({ key: key, what: 'shield-small', px: spx, w: sx1 - sx0 + 1 }); }
          if (pose === 'attack' && L.weapon.style === 'spear' && rg.side && (!R.marks.weaponDir || R.marks.weaponDir[0] * (dir === 'left' ? -1 : 1) <= 0)) problems.push({ key: key, what: 'spear-backwards' });
          var gap = waistGap(R);
          if (gap) problems.push({ key: key, what: 'waist-gap', at: gap });
        }
      });
    });
    return { ok: problems.length === 0, frames: frames, problems: problems };
  }
  /* alpha components (4-neighbour), enclosed transparent holes, lowest opaque row */
  function inspect(R) {
    var seen = new Uint8Array(W * H), comps = 0, low = -1, k, stack;
    for (k = 0; k < W * H; k++) if (R.c[k]) low = Math.max(low, (k / W) | 0);
    for (k = 0; k < W * H; k++) {
      if (!R.c[k] || seen[k]) continue; comps++; stack = [k]; seen[k] = 1;
      while (stack.length) { var p = stack.pop(), x = p % W, y = (p / W) | 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var nx = x + d[0], ny = y + d[1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) return; var n = ny * W + nx; if (R.c[n] && !seen[n]) { seen[n] = 1; stack.push(n); } }); }
    }
    var out = new Uint8Array(W * H); stack = [];
    for (var x = 0; x < W; x++) { stack.push(x); stack.push((H - 1) * W + x); } for (var y = 0; y < H; y++) { stack.push(y * W); stack.push(y * W + W - 1); }
    while (stack.length) { var q = stack.pop(); if (out[q] || R.c[q]) continue; out[q] = 1; var qx = q % W, qy = (q / W) | 0; if (qx > 0) stack.push(q - 1); if (qx < W - 1) stack.push(q + 1); if (qy > 0) stack.push(q - W); if (qy < H - 1) stack.push(q + W); }
    var holes = 0, at = null, lim = R.rig ? (R.rig.torso.y + R.rig.torso.h) * W : W * H;   // above the legs: the gap between two legs is not a joint
    for (k = 0; k < lim; k++) if (!R.c[k] && !out[k]) { holes++; if (!at) at = { x: k % W, y: (k / W) | 0 }; }
    return { components: comps, holes: holes, holeAt: at, low: low };
  }
  /* the row under the torso: every column between the torso's edges belongs to the top or the bottom (no skin, no gap) */
  function waistGap(R) {
    var t = R.rig.torso, y = t.y + t.h - 1;
    for (var x = t.x; x < t.x + t.w; x++) { var o = R.o[y * W + x]; if (o !== 'top' && o !== 'bottom' && o !== 'armR' && o !== 'armL' && o !== 'handR' && o !== 'handL' && o !== 'weapon' && o !== 'shield' && o !== 'hair') return { x: x, y: y, owner: o || null }; }
    return null;
  }

  /* ---------- seeded outfits ---------- */
  function hash(s) { var h = 2166136261 >>> 0; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function randomLook(seed) {
    var s = hash('pd' + seed), o = {};
    function next() { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }
    SLOTS.forEach(function (slot) {
      var ks = Object.keys(STYLES[slot]), st = ks[Math.floor(next() * ks.length)], m = STYLES[slot][st].mat;
      if (slot === 'top' && st === 'robe') { }
      o[slot] = m ? st + '/' + Object.keys(TINTS[m])[Math.floor(next() * Object.keys(TINTS[m]).length)] : st;
    });
    return o;
  }


  /* ---------- the doll: one character with a look; frames cached per look ---------- */
  function safe(fn, a, b, c) { try { return typeof fn === 'function' ? fn(a, b, c) : undefined; } catch (e) { return undefined; } }
  function bbox(R) { var x0 = W, y0 = H, x1 = -1, y1 = -1; for (var k = 0; k < W * H; k++) if (R.c[k]) { var x = k % W, y = (k / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; }
  var SPARK_AT = { hat: 'head', hair: 'head', body: 'head', top: 'torso', bottom: 'hip', boots: 'feet', weapon: 'R', shield: 'L' };
  function create(o) {
    o = o || {};
    var P = { stride: 5, sparkleMs: 520, shadow: true };
    var op = o.params || {}; for (var pk in op) if (op[pk] != null && op[pk] !== '') P[pk] = typeof P[pk] === 'number' ? +op[pk] : op[pk];
    var look = normLook(o.look), key = lookKey(look), cache = {}, nCache = 0, t = 0, flash = null, last = null;
    var stats = { draws: 0, builds: 0, changes: 0, errors: 0 };
    function entry(dir, pose, i) {
      var k = key + '|' + dir + '|' + pose + '|' + i;
      if (!cache[k]) {
        if (nCache > 400) { cache = {}; nCache = 0; }
        var R = raster(look, dir, pose, i); cache[k] = { canvas: toCanvas(R), box: bbox(R), rig: R.rig }; nCache++; stats.builds++;
      }
      return cache[k];
    }
    function setLook(l, why) {
      var n = normLook(l), nk = lookKey(n); if (nk === key) return false;
      var changed = null; for (var i = 0; i < SLOTS.length; i++) if (lookKey(Object.assign({}, look, (function () { var x = {}; x[SLOTS[i]] = n[SLOTS[i]]; return x; })())) !== key) { changed = SLOTS[i]; break; }
      look = n; key = nk; cache = {}; nCache = 0; stats.changes++;
      flash = { slot: changed || 'top', t: t };
      if (why !== 'quiet') safe(o.onChange, lookString(look), changed);
      return true;
    }
    function sparkles(g, X, Y, sc, e, dir, clip) {
      if (!flash) return;
      var age = t - flash.t; if (age < 0 || age >= P.sparkleMs) return;
      var p = age / P.sparkleMs, r = e.rig, at = SPARK_AT[flash.slot] || 'torso', cx, cy;
      if (at === 'head') { cx = r.head.x + r.head.w / 2; cy = r.head.y + 1; }
      else if (at === 'torso') { cx = r.torso.x + r.torso.w / 2; cy = r.torso.y + 3; }
      else if (at === 'hip') { cx = CX; cy = r.hip + 2; }
      else if (at === 'feet') { cx = CX; cy = FOOT - 2; }
      else { var a = r.arms[at]; cx = a.hx + 1; cy = a.hy; }
      var pts = [[-9, -4], [9, -2], [-8, 5], [9, 6]], g2 = g;
      for (var q = 0; q < pts.length; q++) {
        var ph = p * 1.3 - q * 0.1; if (ph <= 0 || ph >= 1) continue;
        var rr = ph < 0.5 ? 1 + Math.round(ph * 4) : Math.max(0, 3 - Math.round((ph - 0.5) * 6)), sx = X + Math.round(cx + pts[q][0] * (0.7 + ph * 0.5)) * sc, sy = Y + Math.round(cy + pts[q][1] * (0.7 + ph * 0.5) - ph * 3) * sc;
        if (clip && (sx - 3 * sc < clip.x || sy - 3 * sc < clip.y || sx + 4 * sc > clip.x + clip.w || sy + 4 * sc > clip.y + clip.h)) continue;   // never cut at a window edge
        g2.fillStyle = q % 2 ? '#fff4c0' : '#ffffff';
        g2.fillRect(sx, sy - rr * sc, sc, (2 * rr + 1) * sc); g2.fillRect(sx - rr * sc, sy, (2 * rr + 1) * sc, sc);
        if (rr > 1) { g2.fillStyle = '#ffd25a'; g2.fillRect(sx, sy, sc, sc); }
      }
    }
    var doll = {
      look: function () { return lookString(look); },
      setLook: function (l) { return setLook(l); },
      equip: function (slot, style, tint) {
        if (!STYLES[slot]) return false; var nl = lookString(look);
        var cur = look[slot], st = style == null ? cur.style : style, tn = tint == null ? (st === cur.style ? cur.tint : null) : tint;
        if (!STYLES[slot][st]) return false;
        nl[slot] = st + (tn ? '/' + tn : '');
        return setLook(nl);
      },
      pose: function (opt) { return poseOf(opt, P); },
      frame: function (dir, pose, i) { return entry(normDir(dir), POSES[pose] ? pose : 'stand', i | 0).canvas; },
      draw: function (g, x, y, opt) {
        opt = opt || {};
        try {
          var ps = poseOf(opt, P), e = entry(ps.dir, ps.pose, ps.i), sc = Math.max(1, Math.round(+opt.scale || 1));
          var X = Math.round(x) - CX * sc, Y = Math.round(y) - FOOT * sc;
          stats.draws++;
          if (P.shadow && opt.shadow !== false && ps.pose !== 'jump') {
            g.fillStyle = 'rgba(16,10,30,0.3)';
            g.fillRect(Math.round(x) - 5 * sc, Math.round(y) - 1 * sc, 10 * sc, sc); g.fillRect(Math.round(x) - 4 * sc, Math.round(y), 8 * sc, sc);
          }
          if (opt.shadowY != null && ps.pose === 'jump') {   // a jumping character: its ground shadow at the floor
            g.fillStyle = 'rgba(16,10,30,0.3)'; g.fillRect(Math.round(x) - 4 * sc, Math.round(opt.shadowY) - sc, 8 * sc, sc);
          }
          if (e.canvas) {
            var old = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
            var ga = g.globalAlpha; if (opt.alpha != null) g.globalAlpha = ga * Math.max(0, Math.min(1, +opt.alpha));
            g.drawImage(e.canvas, X, Y, W * sc, H * sc);
            g.globalAlpha = ga; g.imageSmoothingEnabled = old;
          }
          sparkles(g, X, Y, sc, e, ps.dir, opt.clip);
          last = { x: Math.round(x), y: Math.round(y), dir: ps.dir, pose: ps.pose, i: ps.i, scale: sc,
            rect: { x: X + e.box.x * sc, y: Y + e.box.y * sc, w: e.box.w * sc, h: e.box.h * sc },
            hand: { R: { x: X + (e.rig.arms.R.hx + 1) * sc, y: Y + (e.rig.arms.R.hy + 1) * sc }, L: { x: X + (e.rig.arms.L.hx + 1) * sc, y: Y + (e.rig.arms.L.hy + 1) * sc } } };
          return last;
        } catch (err) { stats.errors++; return null; }
      },
      rect: function (x, y, opt) { opt = opt || {}; var ps = poseOf(opt, P), e = entry(ps.dir, ps.pose, ps.i), sc = Math.max(1, Math.round(+opt.scale || 1)); return { x: Math.round(x) - CX * sc + e.box.x * sc, y: Math.round(y) - FOOT * sc + e.box.y * sc, w: e.box.w * sc, h: e.box.h * sc }; },
      update: function (dt) { dt = +dt; if (dt > 0 && dt < 1000) t += dt; },
      lastDrawn: function () { return last; },
      check: function () { return verify(look); },
      state: function () { return { t: Math.round(t), look: lookString(look), flash: flash && t - flash.t < P.sparkleMs ? { slot: flash.slot, age: Math.round(t - flash.t) } : null, last: last }; },
      stats: function () { return { draws: stats.draws, builds: stats.builds, changes: stats.changes, errors: stats.errors, cached: nCache }; },
      params: P
    };
    return doll;
  }

  /* ---------- bitmap font (shared design with the other pixel UI elements; '#' = ink) ---------- */
  var REG = {
    '!': '# # # # # . #', '"': '#.# #.#', '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.', '%': '##... ##..# ...#. ..#.. .#... #..## ...##',
    '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#', "'": '# #', '(': '..# .#. #.. #.. #.. .#. ..#', ')': '#.. .#. ..# ..# ..# .#. #..',
    '*': '..... ..#.. #.#.# .###. #.#.# ..#..', '+': '..... ..#.. ..#.. ##### ..#.. ..#..', ',': '.. .. .. .. .. ## .# #.', '-': '.... .... .... ####',
    '.': '.. .. .. .. .. ## ##', '/': '....# ...#. ...#. ..#.. .#... .#... #....',
    '0': '.###. #...# #..## #.#.# ##..# #...# .###.', '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.', '2': '.###. #...# ....# ...#. ..#.. .#... #####',
    '3': '####. ....# ....# .###. ....# ....# ####.', '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.', '5': '##### #.... ####. ....# ....# #...# .###.',
    '6': '..##. .#... #.... ####. #...# #...# .###.', '7': '##### ....# ...#. ..#.. .#... .#... .#...', '8': '.###. #...# #...# .###. #...# #...# .###.',
    '9': '.###. #...# #...# .#### ....# ...#. .##..', ':': '.. ## ## .. .. ## ##', ';': '.. ## ## .. .. ## .# #.', '<': '...# ..#. .#.. #... .#.. ..#. ...#',
    '=': '.... .... #### .... ####', '>': '#... .#.. ..#. ...# ..#. .#.. #...', '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
    'A': '.###. #...# #...# ##### #...# #...# #...#', 'B': '####. #...# #...# ####. #...# #...# ####.', 'C': '.###. #...# #.... #.... #.... #...# .###.',
    'D': '###.. #..#. #...# #...# #...# #..#. ###..', 'E': '##### #.... #.... ####. #.... #.... #####', 'F': '##### #.... #.... ####. #.... #.... #....',
    'G': '.###. #...# #.... #.### #...# #...# .####', 'H': '#...# #...# #...# ##### #...# #...# #...#', 'I': '### .#. .#. .#. .#. .#. ###',
    'J': '..### ...#. ...#. ...#. #..#. #..#. .##..', 'K': '#...# #..#. #.#.. ##... #.#.. #..#. #...#', 'L': '#... #... #... #... #... #... ####',
    'M': '#...# ##.## #.#.# #.#.# #...# #...# #...#', 'N': '#...# ##..# #.#.# #..## #...# #...# #...#', 'O': '.###. #...# #...# #...# #...# #...# .###.',
    'P': '####. #...# #...# ####. #.... #.... #....', 'Q': '.###. #...# #...# #...# #.#.# #..#. .##.#', 'R': '####. #...# #...# ####. #.#.. #..#. #...#',
    'S': '.#### #.... #.... .###. ....# ....# ####.', 'T': '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..', 'U': '#...# #...# #...# #...# #...# #...# .###.',
    'V': '#...# #...# #...# #...# #...# .#.#. ..#..', 'W': '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.', 'X': '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    'Y': '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', 'Z': '##### ....# ...#. ..#.. .#... #.... #####', '[': '### #.. #.. #.. #.. #.. ###', ']': '### ..# ..# ..# ..# ..# ###',
    'a': '.... .... .##. ...# .### #..# .###', 'b': '#... #... ###. #..# #..# #..# ###.', 'c': '.... .... .### #... #... #... .###', 'd': '...# ...# .### #..# #..# #..# .###',
    'e': '.... .... .##. #..# #### #... .###', 'f': '..## .#.. #### .#.. .#.. .#.. .#..', 'g': '.... .... .### #..# #..# .### ...# ###.', 'h': '#... #... ###. #..# #..# #..# #..#',
    'i': '# . # # # # #', 'j': '..# ... .## ..# ..# ..# ..# ##.', 'k': '#... #... #..# #.#. ##.. #.#. #..#', 'l': '#. #. #. #. #. #. .#',
    'm': '..... ..... ##.#. #.#.# #.#.# #.#.# #.#.#', 'n': '.... .... ###. #..# #..# #..# #..#', 'o': '.... .... .##. #..# #..# #..# .##.',
    'p': '.... .... ###. #..# #..# ###. #... #...', 'q': '.... .... .### #..# #..# .### ...# ...#', 'r': '.... .... #.## ##.. #... #... #...',
    's': '.... .... .### #... .##. ...# ###.', 't': '.#. .#. ### .#. .#. .#. ..#', 'u': '.... .... #..# #..# #..# #..# .###', 'v': '..... ..... #...# #...# .#.#. .#.#. ..#..',
    'w': '..... ..... #...# #...# #.#.# #.#.# .#.#.', 'x': '..... ..... #...# .#.#. ..#.. .#.#. #...#', 'y': '.... .... #..# #..# #..# .### ...# ###.',
    'z': '.... .... #### ...# .##. #... ####', '~': '..... ..... .#... #.#.# ...#.', '|': '# # # # # # # #'
  };
  var FONT = null;
  function pfont() { if (FONT) return FONT; var g = {}; for (var ch in REG) { var rows = REG[ch].split(' '), w = 0; for (var i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length); g[ch] = { rows: rows, w: w }; } return (FONT = g); }
  function textW(s) { var F = pfont(), w = 0; s = String(s); for (var i = 0; i < s.length; i++) { var c = s.charAt(i), G = F[c]; w += (c === ' ' ? 3 : G ? G.w : 3) + 1; } return Math.max(0, w - 1); }
  function text(g, s, x, y, col, shadow) {
    var F = pfont(); s = String(s); x = Math.round(x); y = Math.round(y);
    for (var pass = shadow ? 0 : 1; pass < 2; pass++) {
      var cx = x + (pass ? 0 : 1), cy = y + (pass ? 0 : 1); g.fillStyle = pass ? col : shadow;
      for (var i = 0; i < s.length; i++) {
        var c = s.charAt(i), G = F[c]; if (c === ' ') { cx += 4; continue; } if (!G) { cx += 4; continue; }
        for (var r = 0; r < G.rows.length; r++) for (var q = 0; q < G.rows[r].length; q++) if (G.rows[r].charAt(q) === '#') g.fillRect(cx + q, cy + r, 1, 1);
        cx += G.w + 1;
      }
    }
  }

  /* ---------- the wardrobe: a small dressing window over the game (keyboard, mouse, touch) ---------- */
  var UI_SLOTS = ['hat', 'hair', 'top', 'bottom', 'boots', 'weapon', 'shield', 'body'];
  var UI_LABEL = { hat: 'HAT', hair: 'HAIR', top: 'TOP', bottom: 'LEGS', boots: 'BOOTS', weapon: 'WEAPON', shield: 'SHIELD', body: 'SKIN' };
  var PW = 192, ROW = 11;
  var COL = { dim: 'rgba(8,5,18,0.62)', panel: '#1d1631', panel2: '#251c3e', edge: '#f1e2c0', edgeD: '#8a7a9c', ink: '#0c0814', bar: '#3e2f66', barL: '#5a4790',
    text: '#e4dcf0', label: '#a597c4', hot: '#ffe7a0', arrow: '#ffcf5a', off: '#5e5480', ped: '#3a2e58', pedL: '#54457c' };
  function wardrobe(o) {
    o = o || {};
    var doll = o.doll, slots = (o.slots || UI_SLOTS).filter(function (s) { return STYLES[s]; });
    var isOpen = false, anim = 0, row = 0, col = 0, cur = 0, t = 0, lastChange = -9999, turnT = 0, opened = 0, changes = 0;
    function V() { var v = typeof o.view === 'function' ? safe(o.view) : o.view; return v && v.w > 0 ? v : { x: 0, y: 0, w: 256, h: 224 }; }
    function owned(slot) { var all = Object.keys(STYLES[slot]), ow = o.owned && (typeof o.owned === 'function' ? safe(o.owned, slot) : o.owned[slot]); if (!ow || !ow.length) return all; return all.filter(function (s) { return ow.indexOf(s) >= 0; }); }
    function lookNow() { return doll ? normLook(doll.look()) : normLook({}); }
    function layout() {
      var v = V(), n = slots.length + 1, ph = 4 + 12 + n * ROW + 3 + 11 + 3, pw = Math.min(PW, v.w), x = v.x + Math.floor((v.w - pw) / 2), y = v.y + Math.max(0, Math.floor((v.h - ph) / 2));
      var lift = Math.round((1 - ease(anim)) * 8);
      return { x: x, y: y + lift, w: pw, h: ph, list: { x: x + 58, y: y + lift + 16 }, prev: { x: x + 4, y: y + lift + 16, w: 50, h: n * ROW } };
    }
    function ease(k) { return k < 0 ? 0 : k > 1 ? 1 : k * k * (3 - 2 * k); }
    function rowRect(Lt, i) { return { x: Lt.list.x - 2, y: Lt.list.y + i * ROW, w: Lt.w - 58 - 2, h: ROW }; }
    function cycle(slot, d) {
      var L = lookNow(), styles = owned(slot), p = L[slot];
      if ((col === 0 && styles.length > 1) || !STYLES[slot][p.style].mat) {
        if (styles.length < 2 && styles[0] === p.style) return false;
        var k = styles.indexOf(p.style), ns = styles[((k < 0 ? 0 : k + d) % styles.length + styles.length) % styles.length];
        var m = STYLES[slot][ns].mat, keep = m && m === STYLES[slot][p.style].mat ? p.tint : null;
        return change(slot, ns, keep);
      }
      var ts = Object.keys(TINTS[STYLES[slot][p.style].mat]), j = ts.indexOf(p.tint);
      return change(slot, p.style, ts[((j + d) % ts.length + ts.length) % ts.length]);
    }
    function change(slot, st, tn) { if (!doll) return false; var ok = doll.equip(slot, st, tn); if (ok) { lastChange = t; changes++; safe(o.onChange, slot, doll.look()); } return ok; }
    function hasTint(i) { var s = slots[i]; if (!s) return false; var L = lookNow(); return !!STYLES[s][L[s].style].mat; }
    function close() { if (!isOpen) return; isOpen = false; safe(o.onClose, doll ? doll.look() : null); }
    var W8 = {
      open: function () { if (isOpen) return; isOpen = true; opened++; row = 0; col = 0; turnT = 0; },
      close: close,
      isOpen: function () { return isOpen; },
      visible: function () { return anim > 0; },
      input: function (a) {
        if (!isOpen) return false;
        var n = slots.length;
        if (a === 'up') { row = (row + n) % (n + 1); if (!hasTint(row)) col = 0; }
        else if (a === 'down') { row = (row + 1) % (n + 1); if (!hasTint(row)) col = 0; }
        else if (a === 'left' || a === 'right') { if (row < n) cycle(slots[row], a === 'left' ? -1 : 1); }
        else if (a === 'ok') {
          if (row >= n) close();
          else if (col === 0 && hasTint(row)) col = 1;
          else { col = 0; row = row + 1; }
        } else if (a === 'back') { if (col === 1) col = 0; else close(); }
        else return false;
        return true;
      },
      pointer: function (px, py) {
        if (!isOpen) return false;
        var Lt = layout(), n = slots.length;
        if (px < Lt.x || py < Lt.y || px >= Lt.x + Lt.w || py >= Lt.y + Lt.h) return true;   // modal: a tap outside does nothing
        for (var i = 0; i <= n; i++) {
          var rr = rowRect(Lt, i); if (py < rr.y || py >= rr.y + rr.h || px < rr.x) continue;
          if (i === n) { close(); return true; }
          var rx = px - Lt.list.x; row = i;
          if (rx >= 110) { if (hasTint(i)) { col = 1; cycle(slots[i], 1); } return true; }
          col = 0;
          if (rx >= 36 && rx < 50) cycle(slots[i], -1); else if (rx >= 96 && rx < 110) cycle(slots[i], 1);
          return true;
        }
        return true;
      },
      update: function (dt) {
        dt = +dt; if (!(dt > 0) || dt > 1000) dt = 0; t += dt;
        anim = Math.max(0, Math.min(1, anim + (isOpen ? 1 : -1) * dt / 160));
        if (isOpen) turnT += dt;
        var target = row * ROW; cur += (target - cur) * Math.min(1, dt / 45); if (Math.abs(target - cur) < 0.4) cur = target;
        if (doll && doll.update && o.drivesDoll) doll.update(dt);
      },
      draw: function (g) {
        if (anim <= 0) return null;
        try {
          var v = V(), Lt = layout(), n = slots.length, L = lookNow(), a = ease(anim);
          var ga = g.globalAlpha; g.imageSmoothingEnabled = false;
          g.globalAlpha = ga * a; g.fillStyle = COL.dim; g.fillRect(v.x, v.y, v.w, v.h);
          // panel: ink edge, light frame, dark fill, inner bevel
          g.fillStyle = COL.ink; g.fillRect(Lt.x, Lt.y, Lt.w, Lt.h);
          g.fillStyle = COL.edge; g.fillRect(Lt.x + 1, Lt.y + 1, Lt.w - 2, Lt.h - 2);
          g.fillStyle = COL.edgeD; g.fillRect(Lt.x + 2, Lt.y + Lt.h - 3, Lt.w - 4, 1); g.fillRect(Lt.x + Lt.w - 3, Lt.y + 2, 1, Lt.h - 4);
          g.fillStyle = COL.panel; g.fillRect(Lt.x + 2, Lt.y + 2, Lt.w - 5, Lt.h - 5);
          g.fillStyle = COL.panel2; g.fillRect(Lt.x + 2, Lt.y + 2, Lt.w - 5, 12);
          text(g, o.title || 'WARDROBE', Lt.x + 6, Lt.y + 4, COL.hot, COL.ink);
          // preview: pedestal, the doll at 2x turning through its four sides while walking in place
          var pv = Lt.prev; g.fillStyle = '#150f26'; g.fillRect(pv.x, pv.y, pv.w, pv.h);
          var dirs = ['down', 'left', 'up', 'right'], recent = t - lastChange < 900, dir = recent ? 'down' : dirs[Math.floor(turnT / 1400) % 4];
          var fy = pv.y + pv.h - 22, fx = pv.x + Math.floor(pv.w / 2);
          g.fillStyle = '#100a1c'; g.fillRect(fx - 17, fy - 3, 34, 9); g.fillStyle = COL.ped; g.fillRect(fx - 16, fy - 2, 32, 7); g.fillStyle = COL.pedL; g.fillRect(fx - 16, fy - 2, 32, 2); g.fillStyle = '#6b5a96'; g.fillRect(fx - 14, fy - 2, 10, 1);
          g.save(); g.beginPath(); g.rect(pv.x, pv.y, pv.w, pv.h); g.clip();
          if (doll) doll.draw(g, fx, fy, { dir: dir, moving: !recent, frame: Math.floor(turnT / 150) % 4, scale: 2, shadow: false, clip: pv });
          g.restore();
          // rows
          var bar = Lt.list.y + Math.round(cur);
          g.fillStyle = COL.bar; g.fillRect(Lt.list.x - 3, bar, Lt.w - 58 - 1, ROW - 1); g.fillStyle = COL.arrow; g.fillRect(Lt.list.x - 3, bar, 2, ROW - 1);
          var texts = [];
          for (var i = 0; i < n; i++) {
            var s = slots[i], p = L[s], y = Lt.list.y + i * ROW + 2, hot = i === row, mat = STYLES[s][p.style].mat;
            text(g, UI_LABEL[s] || s.toUpperCase(), Lt.list.x, y, hot ? COL.hot : COL.label, COL.ink);
            var single = Object.keys(STYLES[s]).length < 2, name = (col === 1 && hot || single) && mat ? p.tint.toUpperCase() : STYLES[s][p.style].label, nw = textW(name), cx0 = Lt.list.x + 73 - Math.floor(nw / 2);
            text(g, name, cx0, y, hot ? '#ffffff' : COL.text, COL.ink);
            var many = owned(s).length > 1 || !!mat;
            text(g, '<', Lt.list.x + 40, y, hot ? COL.arrow : many ? COL.off : 'rgba(0,0,0,0)', COL.ink); text(g, '>', Lt.list.x + 102, y, hot ? COL.arrow : many ? COL.off : 'rgba(0,0,0,0)', COL.ink);
            texts.push({ x: cx0, y: y, w: nw, h: 7 });
            // tint swatch (a 3-shade chip of the ramp) or an empty slot
            var sx = Lt.list.x + 112, sy = y - 1;
            if (mat) {
              var R = ramp(TINTS[mat][p.tint], mat === 'skin' ? 'skin' : null);
              g.fillStyle = hot && col === 1 ? COL.hot : COL.ink; g.fillRect(sx - 1, sy - 1, 11, 10);
              g.fillStyle = R[3]; g.fillRect(sx, sy, 9, 3); g.fillStyle = R[2]; g.fillRect(sx, sy + 3, 9, 3); g.fillStyle = R[1]; g.fillRect(sx, sy + 6, 9, 2);
            } else { g.fillStyle = COL.ink; g.fillRect(sx - 1, sy - 1, 11, 10); g.fillStyle = '#2c2346'; g.fillRect(sx, sy, 9, 8); }
          }
          var dy = Lt.list.y + n * ROW + 2, dn = 'DONE';
          text(g, dn, Lt.list.x + 73 - Math.floor(textW(dn) / 2), dy, row === n ? COL.hot : COL.text, COL.ink);
          // footer hint
          var hint = row >= n ? 'Z: CLOSE' : col === 1 ? '<>: COLOUR   Z: NEXT' : '<>: STYLE   Z: COLOUR';
          text(g, hint, Lt.x + Math.floor((Lt.w - textW(hint)) / 2), Lt.y + Lt.h - 13, COL.label, COL.ink);
          g.globalAlpha = ga;
          return { panel: { x: Lt.x, y: Lt.y, w: Lt.w, h: Lt.h }, texts: texts, row: row, col: col };
        } catch (e) { return null; }
      },
      rects: function () { if (anim <= 0) return []; var Lt = layout(); return [{ x: Lt.x, y: Lt.y, w: Lt.w, h: Lt.h, kind: 'wardrobe' }]; },
      state: function () { var s = slots[row] || null, L = lookNow(); return { open: isOpen, anim: Math.round(anim * 100) / 100, row: row, col: col, slot: s, style: s ? L[s].style : null, tint: s ? L[s].tint : null, opened: opened, changes: changes }; }
    };
    return W8;
  }

  var API = {
    version: VERSION, W: W, H: H, FOOT: FOOT, CX: CX, facing: 'right', DIRS: DIRS.slice(), POSES: POSES, SLOTS: SLOTS.slice(),
    styles: function (slot) { return Object.keys(STYLES[slot] || {}); },
    tints: function (slot, style) { var S = STYLES[slot] && STYLES[slot][style]; return S && S.mat ? Object.keys(TINTS[S.mat]) : []; },
    label: function (slot, style) { var S = STYLES[slot] && STYLES[slot][style]; return S ? S.label : ''; },
    tintColor: function (slot, style, tint) { var S = STYLES[slot] && STYLES[slot][style]; return S && S.mat && TINTS[S.mat][tint] ? TINTS[S.mat][tint] : null; },
    ramp: ramp, normLook: normLook, lookString: lookString, lookKey: lookKey, rig: rig, raster: raster, verify: verify, inspect: inspect,
    pose: function (o, params) { return poseOf(o, params || { stride: 5 }); }, random: randomLook, toCanvas: toCanvas,
    create: create, wardrobe: wardrobe, text: text, textWidth: textW
  };
  root.GameDNA_PaperDoll = API;
})(typeof window !== 'undefined' ? window : this);
