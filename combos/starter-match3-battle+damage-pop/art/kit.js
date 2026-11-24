/* GameDNA demo kit v1 - the shared HD cast and scenes for the element DEMO PAGES of this repo.
 * Plain script, one global: GameDNA_DemoKit. NOT part of any element module: users never get this file.
 *
 * Load order in a demo page (paths from elements/<id>/demo/):
 *   <script src="../../../demo-kit/kit-art.js"></script>                           painted sprites + backdrops (data URIs)
 *   <script src="../../cutout-characters/module/cutout-characters.js"></script>    L-10 rig (public API only)
 *   <script src="../../cutout-characters/assets/pack.js"></script>
 *   <script src="../../../demo-kit/kit.js"></script>
 *   GameDNA_DemoKit.ready(boot);                 // boot() once every image is decoded (works from file:// and http)
 *
 * Cast ids
 *   rigged (L-10 bone rig, real walk / attack / cast):  sword, spear, mage
 *   painted sprites (moved in code: breathe, lunge, recoil, hover):
 *     knight, archer, keeper, herbalist, golem, slime, imp, wisp, skeleton, harpy, cultist, wolf
 *   props: brazier, campfire, crates, anvil, dummy, lamp
 *   scenes: ruins-night, meadow-dusk, market-night, forge-hall, lakeside-day
 *
 * API (all sizes in the caller's canvas units; x = feet centre, footY = ground line)
 *   Kit.ready(fn)                                  fn() when art is usable; Kit.isReady()
 *   Kit.has(id), Kit.ids(), Kit.rel(id)            rel = suggested height as a multiple of a hero's height
 *   var a = Kit.actor(id, {h})                     one per on-screen character
 *   a.update(dt, {vx, facing, h})                  every fixed step (dt ms)
 *   a.loop('idle' | 'walk' | 'cheer')              looping state
 *   a.walk(vx)                                     vx canvas units / s: walk (feet planted, rigged ids) or idle when ~0; sets facing
 *   a.play('attack' | 'slash' | 'cast' | 'hurt' | 'guard' | 'down', {dur, onHit})   one-shot
 *   a.pose(name, k) / a.pose(null)                 host-driven progress 0..1 (frozen frames stay exact); rigged ids also 'jump'
 *   a.draw(ctx, x, footY, {h, facing, flash, alpha, shadow})   flash 0..1 or 'auto' (hurt flash)
 *   a.point('head' | 'chest' | 'tip' | 'hand', x, footY, {h, facing}) -> {x, y}
 *   a.box(x, footY, {h}) -> {x, y, w, h}           drawn bounds (for number / bubble anchors)
 *   a.busy(), a.reset()
 *   Kit.sprite(ctx, id, x, footY, {h, facing, flash, alpha, t, shadow, squash, rot})   stateless sprite / prop
 *   Kit.backdrop(ctx, id, {x, y, w, h, groundY, scroll, zoom})   painted scene, its walk line placed on groundY
 *   Kit.shadow(ctx, x, y, rx, ry, a)               soft contact shadow
 *   Kit.flame(ctx, x, y, r, t)                     additive flicker glow to put over a brazier / campfire / lamp
 */
(function (root) {
  'use strict';
  var ART = root.GameDNA_DemoKitArt || { sprites: {}, scenes: {}, atlases: {} };
  var RIGGED = { sword: 1, spear: 1, mage: 1 };
  /* height relative to a hero, facing = the side the ART looks at ('left' | 'right'), hover = floats this many own-heights
     above the ground, breathe = idle squash amplitude, heavy = slower, smaller lunge.
     Mirroring is never typed by a demo: sprite() computes flipX = (want !== META[id].facing), and uses the painted
     variant ART.sprites[id + '@left' | '@right'] instead of a mirror when the kit ships one (tools/sprites/facing.json
     says which assets must not be mirrored). META[id].face (1 | -1) is kept for old callers and derived from facing. */
  var META = {
    knight: { rel: 1.04, facing: 'right' }, archer: { rel: 0.98, facing: 'right' }, keeper: { rel: 0.98, facing: 'right' }, herbalist: { rel: 0.9, facing: 'right' },
    golem: { rel: 1.42, facing: 'right', heavy: 1, breathe: 0.008 }, slime: { rel: 0.46, facing: 'right', breathe: 0.05 },
    imp: { rel: 0.62, facing: 'right', breathe: 0.02 }, wisp: { rel: 0.5, facing: 'left', hover: 0.9, breathe: 0.03 },
    skeleton: { rel: 1.0, facing: 'right' }, harpy: { rel: 1.0, facing: 'right', hover: 0.55, breathe: 0.02 }, cultist: { rel: 1.0, facing: 'right' },
    wolf: { rel: 0.62, facing: 'right', breathe: 0.015 },
    brazier: { rel: 0.6, prop: 1 }, campfire: { rel: 0.55, prop: 1 }, crates: { rel: 0.8, prop: 1 }, anvil: { rel: 0.5, prop: 1 },
    dummy: { rel: 1.02, prop: 1 }, lamp: { rel: 1.7, prop: 1 }
  };
  function sgn(v) { return dirOf(v) === 'left' ? -1 : 1; }
  function dirOf(v) { return v === 'left' || v === 'l' || (typeof v === 'number' && v < 0) || v === '-1' ? 'left' : 'right'; }
  Object.keys(META).forEach(function (id) { var M = META[id]; if (M.prop) return; M.facing = M.facing || (M.face === -1 ? 'left' : 'right'); M.face = M.facing === 'left' ? -1 : 1; });
  var imgs = {}, scenes = {}, pending = 1, readyFns = [], READY = false, cut = null;
  function done() { if (--pending > 0 || READY) return; READY = true; var f = readyFns; readyFns = []; for (var i = 0; i < f.length; i++) f[i](Kit); }
  function loadImg(src, cb) { var im = new Image(); pending++; im.onload = function () { cb(im); done(); }; im.onerror = function () { done(); }; im.src = src; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }

  var k;
  for (k in ART.sprites) (function (id) { loadImg(ART.sprites[id].src, function (im) { imgs[id] = im; }); })(k);
  for (k in ART.scenes) (function (id) { loadImg(ART.scenes[id].src, function (im) { scenes[id] = im; }); })(k);
  if (root.GameDNA_Cutout && root.GameDNA_CutoutPack) {
    var pack = JSON.parse(JSON.stringify(root.GameDNA_CutoutPack));
    (pack.characters || []).forEach(function (c) { if (ART.atlases && ART.atlases[c.sha256]) c.atlasData = ART.atlases[c.sha256]; });   // data URI: no canvas taint on file://
    var src = document.currentScript && document.currentScript.src, base = src ? src.replace(/demo-kit\/kit\.js.*$/, 'elements/cutout-characters/assets/') : '';
    pending++;
    cut = root.GameDNA_Cutout.load(pack, { base: base, onReady: function () { done(); } });
  }
  Promise.resolve().then(done);   // not a timer: demos are driven under fake clocks

  /* ---------- drawing helpers ---------- */
  var SCR = null;
  function scratch(w, h) {
    if (!SCR) SCR = document.createElement('canvas');
    if (SCR.width < w) SCR.width = w; if (SCR.height < h) SCR.height = h;
    return SCR;
  }
  function shadow(g, x, y, rx, ry, a) {
    var sg = g.createRadialGradient(x, y, 0, x, y, rx);
    sg.addColorStop(0, 'rgba(10,6,20,' + a + ')'); sg.addColorStop(0.6, 'rgba(10,6,20,' + a * 0.55 + ')'); sg.addColorStop(1, 'rgba(10,6,20,0)');
    g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y); g.fillStyle = sg; g.beginPath(); g.arc(x, y, rx, 0, Math.PI * 2); g.fill(); g.restore();
  }
  function flame(g, x, y, r, t) {
    g.save(); g.globalCompositeOperation = 'lighter';
    var fl = 1 + Math.sin(t / 83) * 0.08 + Math.sin(t / 37 + 1.7) * 0.05, rg = g.createRadialGradient(x, y, 0, x, y, r * fl);
    rg.addColorStop(0, 'rgba(255,214,140,0.5)'); rg.addColorStop(0.35, 'rgba(255,150,60,0.22)'); rg.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r * fl, 0, Math.PI * 2); g.fill(); g.restore();
  }
  /* sprite drawn with its feet (art baseline, horizontal centre of its body) at (x, footY), h canvas units tall */
  function sprite(g, id, x, footY, o) {
    var im = imgs[id], A = ART.sprites[id], M = META[id] || {}; if (!im || !A) return false;
    o = o || {};
    var want = dirOf(o.facing), nat = M.facing || 'right', flipX = !M.prop && want !== nat, vid = id + '@' + want, variant = null;
    if (flipX && imgs[vid] && ART.sprites[vid]) { im = imgs[vid]; A = ART.sprites[vid]; flipX = false; variant = want; }   // painted for that side: no mirror
    if (M.prop) flipX = dirOf(o.facing) === 'left';   // props have no side; a demo may still mirror one for variety
    var h = num(o.h, 64), s = h / A.bodyH, w = A.w * s, H = A.h * s, face = flipX ? -1 : 1;
    if (root.__spriteTrace && !M.prop) root.__spriteTrace.push({ id: id, x: x, footY: footY, h: h, facing: want, native: nat, flipX: flipX, variant: variant });
    var flash = clamp(num(o.flash, 0), 0, 1), alpha = clamp(num(o.alpha, 1), 0, 1), sq = num(o.squash, 0), rot = num(o.rot, 0), lift = num(o.lift, 0);
    if (alpha <= 0) return true;
    if (o.shadow !== false && !M.prop) shadow(g, x, footY + h * 0.012, w * (M.hover ? 0.3 : 0.42) * (1 - clamp(lift / (h * 3), 0, 0.5)), Math.max(1.5, h * 0.05), 0.42 * alpha);
    else if (o.shadow !== false) shadow(g, x, footY, w * 0.5, Math.max(1.5, h * 0.045), 0.38 * alpha);
    g.save();
    g.translate(x, footY - lift); if (rot) g.rotate(rot); g.scale(face * (1 - sq * 0.7), 1 + sq);
    g.globalAlpha *= alpha; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    var dx = -A.cx * s, dy = -A.baseline * s;
    if (flash > 0.01) {
      var T = g.getTransform(), dev = Math.sqrt(Math.abs(T.a * T.d - T.b * T.c)) || 1, cw = Math.ceil(w * dev) + 2, ch = Math.ceil(H * dev) + 2, c = scratch(cw, ch), q = c.getContext('2d');
      q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'source-over'; q.globalAlpha = 1; q.clearRect(0, 0, cw, ch);
      q.imageSmoothingQuality = 'high'; q.drawImage(im, 0, 0, cw - 2, ch - 2);
      q.globalCompositeOperation = 'source-atop'; q.fillStyle = 'rgba(255,255,255,' + flash + ')'; q.fillRect(0, 0, cw, ch);
      g.drawImage(c, 0, 0, cw - 2, ch - 2, dx, dy, w, H);
    } else g.drawImage(im, dx, dy, w, H);
    g.restore();
    return true;
  }

  /* ---------- painted-sprite actor: same calls as the L-10 actor ---------- */
  var ONE = { attack: 460, slash: 420, cast: 620, hurt: 320, guard: 520, down: 700 };
  function SpriteActor(id, o) { this.id = id; this.h = num(o && o.h, 64); this.rigged = false; this.reset(); this.ph = (id.charCodeAt(0) * 37 + id.length * 101) % 628 / 100; }
  SpriteActor.prototype = {
    reset: function () { this.clock = 0; this.lp = 'idle'; this.one = null; this.host = null; this.vx = 0; this.facing = 1; this.isDown = false; return this; },
    update: function (dt, s) {
      this.clock += dt; if (s) { if (s.vx != null) this.vx = s.vx; if (s.facing != null) this.facing = sgn(s.facing); if (s.h != null) this.h = s.h; }
      var o = this.one;
      if (o) {
        var k0 = o.t / o.dur; o.t += dt; var k1 = o.t / o.dur;
        if (o.onHit && k0 < 0.4 && k1 >= 0.4) o.onHit(this);
        if (k1 >= 1) { if (o.name === 'down') this.isDown = true; this.one = null; }
      }
      return this;
    },
    loop: function (n) { this.lp = n || 'idle'; if (n) this.isDown = false; return this; },
    play: function (n, o) { this.isDown = false; this.one = { name: n, t: 0, dur: num(o && o.dur, ONE[n] || 400), onHit: o && o.onHit }; return this; },
    pose: function (n, k) { this.host = n ? { name: n, k: clamp(num(k, 0), 0, 1) } : null; return this; },
    walk: function (vx) { this.vx = vx || 0; if (Math.abs(this.vx) > 1) this.facing = this.vx > 0 ? 1 : -1; return this.loop(Math.abs(this.vx) > 1 ? 'walk' : 'idle'); },
    busy: function () { return !!this.one; },
    info: function () { var c = this._cur(); return { anim: c.name, k: c.k, busy: !!this.one, clock: this.clock, loop: this.lp }; },
    hurtFlash: function () { var c = this._cur(); return c.name === 'hurt' && c.k * (this.one ? this.one.dur : 320) < 130 ? 0.75 : 0; },
    _cur: function () { return this.host ? this.host : this.one ? { name: this.one.name, k: clamp(this.one.t / this.one.dur, 0, 1) } : this.isDown ? { name: 'down', k: 1 } : { name: this.lp, k: 0 }; },
    /* pose -> {dx, dy (in h), rot, squash, alpha} facing right */
    _xf: function () {
      var M = META[this.id] || {}, c = this._cur(), k = c.k, t = this.clock, br = M.breathe == null ? 0.012 : M.breathe, hv = M.hover || 0, big = M.heavy ? 0.6 : 1;
      var x = { dx: 0, dy: 0, rot: 0, sq: Math.sin(t / (M.heavy ? 900 : 520) + this.ph) * br, a: 1 };
      if (hv) x.dy = -Math.sin(t / 430 + this.ph) * 0.045;
      if (c.name === 'walk' || c.name === 'cheer') { var hop = Math.abs(Math.sin(t / (c.name === 'cheer' ? 150 : 190))); x.dy -= hop * (hv ? 0.03 : 0.07) * big; x.sq += (0.5 - hop) * 0.05; }
      else if (c.name === 'attack' || c.name === 'slash') {
        var wind = ease(k / 0.3), hitK = ease((k - 0.3) / 0.14), back = ease((k - 0.56) / 0.44);
        x.dx = (-0.1 * wind + 0.42 * hitK) * (1 - back) * big; x.rot = (-0.07 * wind + 0.2 * hitK) * (1 - back) * big; x.sq += (0.05 * wind - 0.09 * hitK) * (1 - back);
        if (!hv) x.dy -= Math.sin(clamp((k - 0.3) / 0.3, 0, 1) * Math.PI) * 0.06 * big;
      } else if (c.name === 'cast') {
        var up = ease(k / 0.35) * (1 - ease((k - 0.7) / 0.3)); x.dy -= up * 0.05; x.rot = -0.05 * up; x.sq += up * 0.04 + Math.sin(k * 40) * 0.006 * up;
      } else if (c.name === 'hurt') {
        var r = Math.sin(clamp(k, 0, 1) * Math.PI) * (1 - k * 0.3); x.dx = -0.12 * r * big; x.rot = -0.12 * r * big; x.sq -= 0.05 * r;
      } else if (c.name === 'guard') {
        var gk = ease(k / 0.2) * (1 - ease((k - 0.75) / 0.25)); x.sq -= 0.05 * gk; x.dx = -0.03 * gk; x.rot = -0.04 * gk;
      } else if (c.name === 'down') {
        var d = ease(k); x.rot = -0.5 * d; x.dy += 0.04 * d; x.a = 1 - 0.75 * d; x.sq -= 0.1 * d;
      }
      return x;
    },
    draw: function (g, x, footY, o) {
      o = o || {}; var h = num(o.h, this.h), f = o.facing == null ? this.facing : sgn(o.facing), M = META[this.id] || {}, X = this._xf();
      var fl = o.flash === 'auto' ? this.hurtFlash() : num(o.flash, 0);
      return sprite(g, this.id, x + X.dx * h * f, footY, { h: h, facing: f, flash: fl, alpha: num(o.alpha, 1) * X.a, squash: X.sq, rot: X.rot * f, lift: (M.hover || 0) * h - X.dy * h, shadow: o.shadow });
    },
    box: function (x, footY, o) { var h = num(o && o.h, this.h), A = ART.sprites[this.id], M = META[this.id] || {}, w = A ? A.bodyW / A.bodyH * h : h * 0.5, lift = (M.hover || 0) * h; return { x: x - w / 2, y: footY - h - lift, w: w, h: h }; },
    point: function (n, x, footY, o) {
      var h = num(o && o.h, this.h), f = o && o.facing != null ? sgn(o.facing) : this.facing, M = META[this.id] || {}, X = this._xf(), lift = (M.hover || 0) * h - X.dy * h;
      var P = { head: [0.02, 0.86], chest: [0.04, 0.55], hand: [0.3, 0.5], tip: [0.42, 0.62] }[n] || [0, 0.5];
      return { x: x + (P[0] + X.dx) * h * f, y: footY - lift - P[1] * h };
    }
  };

  /* ---------- rigged actor: thin wrapper over the L-10 public API ---------- */
  /* The L-10 actor is made on first use, so a demo may create its cast before the art has loaded; calls made before
     that (loop / play / pose) are replayed in order. */
  function RigActor(id, o) { this.id = id; this.h = num(o && o.h, 64); this.rigged = true; this.a = null; this.q = []; this.facing = 1; this.vx = 0; }
  RigActor.prototype = {
    _a: function () {
      if (!this.a && cut && cut.has(this.id)) { this.a = cut.actor(this.id, { h: this.h }); for (var i = 0; i < this.q.length; i++) this.a[this.q[i][0]](this.q[i][1], this.q[i][2]); this.q = []; }
      return this.a;
    },
    _do: function (m, x, y) { var a = this._a(); if (a) a[m](x, y); else this.q.push([m, x, y]); return this; },
    reset: function () { this.q = []; if (this._a()) this.a.reset(); return this; },
    update: function (dt, s) { if (s) { if (s.vx != null) this.vx = s.vx; if (s.facing != null) this.facing = sgn(s.facing); if (s.h != null) this.h = s.h; } if (this._a()) this.a.update(dt, { vx: this.vx, h: this.h, facing: this.facing }); return this; },
    loop: function (n, o) { return this._do('loop', n || 'idle', o); },
    play: function (n, o) { return this._do('play', n, o); },
    pose: function (n, k) { return this._do('pose', n, k); },
    /* walk(vx): vx in canvas units per second; picks walk / idle and the cycle speed that keeps planted feet still */
    walk: function (vx) { this.vx = vx || 0; if (Math.abs(this.vx) > 1) this.facing = this.vx > 0 ? 1 : -1; var w = this._a() ? cut.walkSpeed(this.id) * this.h : 0; return Math.abs(this.vx) > 1 && w ? this.loop('walk', { speed: Math.abs(this.vx) / w }) : this.loop('idle'); },
    busy: function () { return this._a() ? this.a.busy() : false; },
    info: function () { return this._a() ? this.a.info() : { anim: 'idle', k: 0, busy: false }; },
    draw: function (g, x, footY, o) {
      if (!this._a()) return false;
      o = o || {}; var p = { h: num(o.h, this.h), facing: o.facing == null ? this.facing : sgn(o.facing), flash: o.flash == null ? 'auto' : o.flash, alpha: o.alpha == null ? 1 : o.alpha, light: o.light === undefined ? 'left' : o.light, swoosh: o.swoosh };
      if (o.shadow === false) p.shadow = false;
      if (root.__spriteTrace) root.__spriteTrace.push({ id: this.id, x: x, footY: footY, h: p.h, facing: dirOf(p.facing), native: 'right', flipX: p.facing < 0, variant: null, rig: true });
      return this.a.draw(g, x, footY, p);
    },
    box: function (x, footY, o) { var h = num(o && o.h, this.h); return { x: x - h * 0.22, y: footY - h, w: h * 0.44, h: h }; },
    point: function (n, x, footY, o) { var h = num(o && o.h, this.h), f = o && o.facing != null ? sgn(o.facing) : this.facing; return this._a() ? this.a.point(n, x, footY, { h: h, facing: f }) : { x: x, y: footY - h * 0.6 }; },
    walkSpeed: function () { return cut.walkSpeed(this.id) * this.h; }
  };

  function backdrop(g, id, o) {
    var im = scenes[id], A = ART.scenes[id]; if (!im || !A) return false;
    o = o || {};
    var x = num(o.x, 0), y = num(o.y, 0), w = num(o.w, g.canvas.width), h = num(o.h, g.canvas.height), gy = num(o.groundY, y + h * A.ground);
    var s = Math.max(w / A.w, (gy - y) / (A.ground * A.h), (y + h - gy) / ((1 - A.ground) * A.h)) * num(o.zoom, 1);
    var dw = A.w * s, dh = A.h * s, slack = dw - w, sx = clamp(slack / 2 + num(o.scroll, 0), 0, slack), top = clamp(gy - A.ground * dh, y + h - dh, y);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(im, x - sx, top, dw, dh); g.restore();
    return true;
  }

  var Kit = {
    version: '1.0.0',
    ready: function (fn) { if (READY) fn(Kit); else readyFns.push(fn); return Kit; },
    isReady: function () { return READY; },
    has: function (id) { return RIGGED[id] ? !!(cut && cut.has(id)) : !!imgs[id]; },
    ids: function () { return Object.keys(RIGGED).concat(Object.keys(META)); },
    scenes: function () { return Object.keys(ART.scenes); },
    rel: function (id) { return RIGGED[id] ? 1 : (META[id] || {}).rel || 1; },
    meta: function (id) { return META[id] || (RIGGED[id] ? { rel: 1, facing: 'right', face: 1, rig: 1 } : null); },
    /* flipX('golem', 'left') -> would the kit mirror this id to face that way (false when it has a painted variant) */
    flipX: function (id, want) { var M = META[id] || {}, w = dirOf(want); return !M.prop && w !== (M.facing || 'right') && !(ART.sprites[id + '@' + w] && imgs[id + '@' + w]); },
    dir: dirOf,
    actor: function (id, o) { return RIGGED[id] && cut ? new RigActor(id, o) : new SpriteActor(id, o); },
    sprite: function (g, id, x, footY, o) { o = o || {}; var M = META[id] || {}; if (o.t != null && M.breathe && o.squash == null) o.squash = Math.sin(o.t / 520) * M.breathe; return sprite(g, id, x, footY, o); },
    backdrop: backdrop, shadow: shadow, flame: flame,
    cutout: function () { return cut; },
    status: function () { return { ready: READY, sprites: Object.keys(imgs), scenes: Object.keys(scenes), rig: cut ? cut.status() : null }; }
  };
  root.GameDNA_DemoKit = Kit;
})(typeof window !== 'undefined' ? window : this);
