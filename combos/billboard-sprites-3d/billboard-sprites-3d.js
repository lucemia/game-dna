/* GameDNA_Billboards3D (N-02 billboard-sprites-3d, module v1.0.3)
 * Painted 2D characters standing in a three.js scene as camera-facing billboards (2D sprites in a 3D diorama).
 * Plain classic script, ASCII only, no imports. Needs three.js (window.THREE or options.THREE, tested with 0.149.0).
 *
 *   var bb = GameDNA_Billboards3D.create({ scene, camera, renderer, groundY: function (x, z) { return 0; } });
 *   bb.add({ id: 'hero', source: GameDNA_Billboards3D.imageSource({ image: img, facing: 'right' }), x: 0, z: 0, h: 1.7 });
 *   every frame:  bb.move('hero', x, z); bb.setTarget('hero', 'slime' | {x, z} | null); bb.update(dtMs); renderer.render(...)
 *
 * Facing rule (ONE place: pickFrames): the side the sprite should look at is read on SCREEN (camera space): the
 * target's (or the move direction's) projected x relative to the actor. flipX = (want !== source.facing); a source
 * with a painted variant for that side uses it, a canvas source that paints both sides paints it, and a source
 * marked mirror: 'never' is never mirrored.
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.3';
  var warned = {};
  function warn(k, m) { if (warned[k]) return; warned[k] = 1; try { console.warn('[GameDNA_Billboards3D] ' + m); } catch (e) {} }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sideOf(v) {
    if (v === 'left' || v === 'l' || v === -1 || v === '-1') return 'left';
    if (v === 'right' || v === 'r' || v === 1 || v === '1') return 'right';
    return null;
  }
  function other(s) { return s === 'left' ? 'right' : 'left'; }
  function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }

  /* ---------------- sources ---------------- */
  /* A frame = one picture of the character: {img, sx, sy, sw, sh (sub-rect in px), cx (feet centre x in the rect),
     baseline (feet row in the rect, from its top), bodyH (px that map to the actor's height h)} */
  function frameOf(img, o, sx, sy, sw, sh) {
    var w = sw || (img && (img.naturalWidth || img.width)) || num(o.w, 64), h = sh || (img && (img.naturalHeight || img.height)) || num(o.h, 64);
    return { img: img, sx: sx || 0, sy: sy || 0, sw: w, sh: h, cx: num(o.cx, w / 2), baseline: num(o.baseline, h), bodyH: num(o.bodyH, num(o.baseline, h)) };
  }
  function framesFrom(o) {
    if (!o) return null;
    var out = [], i;
    if (o.sheet && o.sheet.image) {
      var S = o.sheet, im = S.image, cols = Math.max(1, num(S.cols, 1)), rows = Math.max(1, num(S.rows, 1)), n = num(S.count, cols * rows);
      var fw = num(S.frameW, (num(S.w, im.naturalWidth || im.width)) / cols), fh = num(S.frameH, (num(S.h, im.naturalHeight || im.height)) / rows);
      for (i = 0; i < n; i++) out.push(frameOf(im, { cx: S.cx, baseline: S.baseline, bodyH: S.bodyH }, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh));
    } else if (o.frames && o.frames.length) {
      for (i = 0; i < o.frames.length; i++) { var f = o.frames[i], img = f && f.image ? f.image : f; out.push(frameOf(img, f && f.image ? f : o)); }
    } else if (o.image) out.push(frameOf(o.image, o));
    return out.length ? out : null;
  }
  /* imageSource({image | frames:[img | {image, cx, baseline, bodyH}] | sheet:{image, cols, rows, count, cx, baseline, bodyH},
       facing: 'right' (the side the ART looks at), mirror: 'ok' | 'never', variants: {left: {image | frames | sheet ...}},
       walk: [i, j, ...] frame indices of the walk cycle (default: all frames when there are >= 3, else none),
       idle: frame index (default 0), stride: heights travelled per walk cycle (default 1.1), cx, baseline, bodyH})
     Single-picture sources without walk frames move with a small hop per step (gait 'hop'), never a slide. */
  function imageSource(o) {
    o = o || {};
    var native = sideOf(o.facing) || 'right', sets = {}, v;
    sets[native] = framesFrom(o);
    if (!sets[native]) { warn('src', 'imageSource without image / frames / sheet'); sets[native] = [frameOf(null, o)]; }
    if (o.variants) for (v in o.variants) { var s = sideOf(v); if (s && s !== native) { var fr = framesFrom(o.variants[v]); if (fr) sets[s] = fr; } }
    var n = sets[native].length, walk = o.walk || (n >= 3 ? sets[native].map(function (_, i) { return i; }) : null);
    return { kind: 'image', footHalf: num(o.footHalf, 0.16), facing: native, mirror: o.mirror === 'never' ? 'never' : 'ok', sets: sets, walk: walk, idle: num(o.idle, 0), stride: num(o.stride, 1.1), name: o.name || null };
  }
  /* canvasSource({w, h, footX, footY, bodyH, facing, sides: 'both' | 'native', mirror, stride, paint(ctx, info)})
     paint draws the character with its feet at (footX, footY) of a w x h canvas (cleared for you), bodyH px tall.
     info = {side, anim, k, walkPhase, moving, t, id}. sides 'both' = paint() draws the side it is given (no mirror);
     'native' = paint() always draws info.side === facing and the module mirrors when mirror !== 'never'. */
  function canvasSource(o) {
    o = o || {};
    var w = Math.round(num(o.w, 256)), h = Math.round(num(o.h, 320));
    return { kind: 'canvas', facing: sideOf(o.facing) || 'right', sides: o.sides === 'both' ? 'both' : 'native', mirror: o.mirror === 'never' ? 'never' : 'ok',
      w: w, h: h, footX: num(o.footX, w / 2), footY: num(o.footY, h - 4), bodyH: num(o.bodyH, h * 0.75), paint: o.paint, stride: num(o.stride, 1.1), name: o.name || null, hasWalk: o.hasWalk !== false };
  }
  /* kitSource(Kit, id, {px}) : the GameDNA demo kit (GameDNA_DemoKit + GameDNA_DemoKitArt). Painted sprites keep the
     kit's native facing and its painted '@left' / '@right' variants (mirror 'never'); rigged ids (sword, spear, mage)
     become canvas sources drawn by the L-10 rig (Kit.cutout().drawPose) on the side asked, walking by distance. */
  var imgCache = {};
  function loadImage(src, onload) {
    if (imgCache[src]) { var c = imgCache[src]; if (c.complete && c.naturalWidth) { if (onload) onload(c); } else if (onload) c.addEventListener('load', function () { onload(c); }); return c; }
    var im = new Image(); imgCache[src] = im; if (onload) im.addEventListener('load', function () { onload(im); }); im.src = src; return im;
  }
  function kitSource(Kit, id, o) {
    o = o || {};
    var ART = root.GameDNA_DemoKitArt, M = Kit && Kit.meta ? Kit.meta(id) : null;
    if (!Kit || !M) { warn('kit' + id, 'kitSource: unknown kit id ' + id); return imageSource({}); }
    if (M.rig) {
      var px = num(o.px, 300), cut = Kit.cutout && Kit.cutout(), dur = { sword: 820, spear: 860, mage: 900 }[id] || 860;
      var stride = cut && cut.walkSpeed ? cut.walkSpeed(id) * dur / 1000 : 1.1;
      return canvasSource({ name: id, w: Math.round(px * 2.4), h: Math.round(px * 1.82), footX: Math.round(px * 1.2), footY: Math.round(px * 1.66), bodyH: px,   // room for raised weapons (cheer, overhead attack), thrusts and the lying 'down' pose (checks/rig-canvas-edges.py)
        facing: 'right', sides: 'both', mirror: 'ok', stride: stride,
        paint: function (g, I) {
          var C = Kit.cutout && Kit.cutout(); if (!C) return;
          // the rig flashes by itself during the first 130 ms of 'hurt'; the module's material flash replaces it
          var k = I.anim === 'hurt' ? 0.32 + 0.68 * I.k : I.k;
          C.drawPose(g, id, I.footX, I.footY, { anim: I.anim, k: k, t: I.t / 1000, h: px, facing: I.side === 'left' ? -1 : 1, light: o.light === undefined ? 'left' : o.light, shadow: false });
        } });
    }
    var A = ART && ART.sprites && ART.sprites[id]; if (!A) { warn('kit' + id, 'kitSource: no art for ' + id); return imageSource({}); }
    function spec(a) { return { image: loadImage(a.src, o.onLoad), w: a.w, h: a.h, cx: a.cx, baseline: a.baseline, bodyH: a.bodyH }; }
    var native = M.facing || 'right', vars = {}, alt = other(native);
    if (ART.sprites[id + '@' + alt]) vars[alt] = spec(ART.sprites[id + '@' + alt]);
    var s = spec(A); s.facing = native; s.mirror = M.prop ? 'ok' : 'never'; s.variants = vars; s.name = id;
    var src = imageSource(s); src.footHalf = Math.max(0.16, A.bodyW / A.bodyH * 0.32); src.prop = !!M.prop; src.hover = M.hover || 0; src.rel = M.rel || 1;
    return src;
  }

  /* ---------------- shared GPU bits ---------------- */
  function blobTexture(THREE) {
    var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d');
    var rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(0,0,0,0.85)'); rg.addColorStop(0.45, 'rgba(0,0,0,0.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    var t = new THREE.CanvasTexture(c); return t;
  }
  /* MeshBasicMaterial + three uniforms: uFlash (0..1: over-exposes in output colour space, x1.57 at the 0.6 peak: dark line work stays dark, lights burn toward the colour, alpha kept), uPush (world units the quad is
     moved toward the camera along each view ray: same pixels on screen, but sloped ground in front of the feet no
     longer cuts them). */
  function spriteMaterial(THREE, o) {
    var U = { uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(o.flashColor || '#ffffff') }, uPush: { value: num(o.push, 0.15) } };
    var m = new THREE.MeshBasicMaterial({ transparent: o.alphaMode !== 'cutout', alphaTest: o.alphaMode === 'cutout' ? 0.5 : num(o.alphaTest, 0.06), depthWrite: true,
      side: THREE.DoubleSide, color: new THREE.Color(o.tint || '#ffffff'), fog: o.fog !== false, toneMapped: !!o.toneMapped });
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uFlash = U.uFlash; sh.uniforms.uFlashColor = U.uFlashColor; sh.uniforms.uPush = U.uPush;
      sh.vertexShader = 'uniform float uPush;\n' + sh.vertexShader.replace('#include <project_vertex>',
        'vec4 mvPosition = vec4( transformed, 1.0 );\nmvPosition = modelViewMatrix * mvPosition;\n' +
        'float bbLen = length( mvPosition.xyz );\nmvPosition.xyz *= max( 0.05, 1.0 - uPush / max( bbLen, 1e-3 ) );\ngl_Position = projectionMatrix * mvPosition;');
      sh.fragmentShader = 'uniform float uFlash;\nuniform vec3 uFlashColor;\n' + sh.fragmentShader.replace('#include <encodings_fragment>',
        '#include <encodings_fragment>\ngl_FragColor.rgb = min( vec3( 1.0 ), gl_FragColor.rgb * ( 1.0 + uFlash * 0.95 * uFlashColor ) + uFlashColor * uFlash * 0.04 );');
    };
    m.customProgramCacheKey = function () { return 'gdna-bb-1'; };
    m.userData.U = U;
    return m;
  }

  /* ---------------- instance ---------------- */
  function create(opt) {
    opt = opt || {};
    var THREE = opt.THREE || root.THREE;
    var stub = { add: function () { return null; }, remove: function () {}, move: function () {}, setMove: function () {}, setTarget: function () {}, play: function () {}, flash: function () {},
      set: function () {}, update: function () {}, anchor: function () { return null; }, anchors: function () { return []; }, state: function () { return { t: 0, actors: [] }; }, get: function () { return null; },
      ids: function () { return []; }, setParams: function () {}, params: function () { return {}; }, dispose: function () {}, ok: false };
    if (!THREE || !THREE.Mesh) { warn('three', 'three.js missing: load three.min.js before this module (or pass options.THREE)'); return stub; }
    if (!opt.scene || !opt.camera) { warn('scene', 'create() needs {scene, camera}'); return stub; }
    var scene = opt.scene, camera = opt.camera, renderer = opt.renderer || null;
    var P = {
      mode: opt.mode === 'cylinder' ? 'cylinder' : 'camera',          // camera = every quad parallel to the screen (yaw only); cylinder = each turns to the camera
      filter: opt.filter === 'crisp' ? 'crisp' : 'smooth',
      shadow: opt.shadow == null ? 'blob' : opt.shadow,                 // 'blob' | 'sprite' | 'both' | 'none'
      shadowAlpha: num(opt.shadowAlpha, 0.55), push: num(opt.push, 0.15), alphaMode: opt.alphaMode === 'cutout' ? 'cutout' : 'blend',
      flashMs: num(opt.flashMs, 200), deadzone: num(opt.deadzone, 0.004), hop: num(opt.hop, 0.06), tint: opt.tint || '#ffffff', lightProbe: num(opt.lightProbe, 0),
      toneMapped: !!opt.toneMapped
    };
    var groundY = typeof opt.groundY === 'function' ? opt.groundY : null, groundObjs = opt.ground ? [].concat(opt.ground) : null;
    var RC = groundObjs ? new THREE.Raycaster() : null, DOWN = new THREE.Vector3(0, -1, 0), V0 = new THREE.Vector3(), V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
    var group = new THREE.Group(); group.name = 'GameDNA_Billboards3D'; scene.add(group);
    var BLOB = blobTexture(THREE), texCache = new Map(), actors = [], byId = {}, clock = 0;

    function ground(x, z) {
      try {
        if (groundY) { var y = groundY(x, z); if (isFinite(y)) return +y; }
        if (RC) { RC.set(V0.set(x, 1e4, z), DOWN); var hit = RC.intersectObjects(groundObjs, true)[0]; if (hit) return hit.point.y; }
      } catch (e) { warn('ground', 'groundY threw: ' + e.message); }
      return num(opt.y0, 0);
    }
    function texFor(img) {
      if (!img) return null;
      var t = texCache.get(img); if (t) return t;
      t = new THREE.Texture(img); applyFilter(t);
      if (img.complete === undefined || (img.complete && (img.naturalWidth || img.width))) t.needsUpdate = true;
      else img.addEventListener('load', function () { t.needsUpdate = true; });
      texCache.set(img, t); return t;
    }
    function applyFilter(t) {
      if (P.filter === 'crisp') { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
      else { t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = renderer && renderer.capabilities ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 1; }
      if ('colorSpace' in t) t.colorSpace = 'srgb'; else if (THREE.sRGBEncoding && renderer && renderer.outputEncoding === THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
      t.needsUpdate = true;
    }
    function ready(img) { return !img || img.getContext ? true : !!(img.complete && (img.naturalWidth || img.width)); }

    /* add({id, source, x, z, h (world height of the body), hover (heights above ground), gait: 'auto'|'frames'|'hop'|'hover'|'still',
            target, tint, shadowScale, castShadow}) */
    function add(spec) {
      try {
        spec = spec || {};
        var id = spec.id != null ? String(spec.id) : 'a' + actors.length;
        if (byId[id]) remove(id);
        var src = spec.source || imageSource({}), h = num(spec.h, 1.7);
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(8), 2));
        geo.setIndex([0, 2, 1, 2, 3, 1]);
        var mat = spriteMaterial(THREE, { push: P.push, alphaMode: P.alphaMode, tint: spec.tint || P.tint, toneMapped: P.toneMapped, flashColor: spec.flashColor });
        var mesh = new THREE.Mesh(geo, mat); mesh.name = 'bb:' + id; mesh.frustumCulled = false; mesh.userData.billboardId = id;
        var a = { id: id, src: src, h: h, hover: num(spec.hover, src.hover || 0), gait: spec.gait || 'auto', x: num(spec.x, 0), z: num(spec.z, 0), y: 0,
          px: null, pz: null, moveDir: [0, 0], moving: false, speed: 0, explicitMove: null, target: spec.target == null ? null : spec.target,
          dist: 0, side: sideOf(spec.side) || src.facing, one: null, loop: 'idle', flashT: -1, flashMs: P.flashMs, flashCol: null, alpha: 1, fx: { shift: 0, lift: 0, squash: 0, tilt: 0 },
          mesh: mesh, geo: geo, mat: mat, blob: null, canvas: null, ctx: null, ctex: null, drawn: { side: src.facing, base: src.facing, flipX: false, variant: null, frame: 0, problem: null },
          lift: 0, airborne: false, visible: true, shadowScale: num(spec.shadowScale, 1), born: clock, lastVx: 0, sx: 0, sy: 0, hopK: 0 };
        if (src.kind === 'canvas') {
          a.canvas = document.createElement('canvas'); a.canvas.width = src.w; a.canvas.height = src.h; a.ctx = a.canvas.getContext('2d');
          a.ctex = new THREE.CanvasTexture(a.canvas); applyFilter(a.ctex);
        }
        if (P.shadow === 'blob' || P.shadow === 'both') {
          var bm = new THREE.MeshBasicMaterial({ map: BLOB, transparent: true, depthWrite: false, opacity: P.shadowAlpha, fog: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
          a.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bm); a.blob.rotation.x = -Math.PI / 2; a.blob.renderOrder = -1; a.blob.name = 'bb-shadow:' + id; group.add(a.blob);
        }
        if (P.shadow === 'sprite' || P.shadow === 'both' || spec.castShadow) {
          mesh.castShadow = true;
          mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5, side: THREE.DoubleSide });
        }
        group.add(mesh); actors.push(a); byId[id] = a;
        a.y = ground(a.x, a.z); a.px = a.x; a.pz = a.z;
        layout(a, 0);
        return a;
      } catch (e) { warn('add', 'add() failed: ' + e.message); return null; }
    }
    function remove(id) {
      var a = byId[id]; if (!a) return;
      group.remove(a.mesh); a.geo.dispose(); a.mat.dispose(); if (a.ctex) a.ctex.dispose();
      if (a.blob) { group.remove(a.blob); a.blob.geometry.dispose(); a.blob.material.dispose(); }
      delete byId[id]; actors.splice(actors.indexOf(a), 1);
      for (var i = 0; i < actors.length; i++) if (actors[i].target === id) actors[i].target = null;
    }
    function move(id, x, z) { var a = byId[id]; if (!a || !isFinite(x) || !isFinite(z)) return; a.x = +x; a.z = +z; }
    function setMove(id, dx, dz) { var a = byId[id]; if (!a) return; if (dx == null || (Math.abs(dx) + Math.abs(dz || 0)) < 1e-9) a.explicitMove = null; else a.explicitMove = [+dx, +dz || 0]; }
    function setTarget(id, t) { var a = byId[id]; if (!a) return; a.target = t == null ? null : t; }
    /* play(id, 'attack' | 'slash' | 'cast' | 'hurt' | 'guard' | 'down' | 'idle', {ms}): one-shot ('down' stays down) */
    function play(id, name, o) {
      var a = byId[id]; if (!a) return;
      var D = { attack: 600, slash: 560, cast: 720, hurt: 420, guard: 520, down: 800, cheer: 900 };
      if (!name || name === 'idle') { a.one = null; a.downed = false; a.loop = 'idle'; return; }
      a.one = { name: name, t: 0, dur: num(o && o.ms, D[name] || 500) };
      if (name === 'hurt' && !(o && o.flash === false)) flash(id);
    }
    function flash(id, ms, color) { var a = byId[id]; if (!a) return; a.flashT = 0; a.flashMs = num(ms, P.flashMs); a.flashCol = color || null; }
    /* set(id, {h, hover, alpha (0..1, e.g. a fade on defeat), gait, tint, visible, shift, lift, squash, tilt}): host-driven extras */
    function set(id, o) {
      var a = byId[id]; if (!a || !o) return;
      if (o.h != null) a.h = num(o.h, a.h); if (o.hover != null) a.hover = num(o.hover, a.hover); if (o.alpha != null) a.alpha = clamp(num(o.alpha, 1), 0, 1);
      if (o.gait) a.gait = o.gait; if (o.tint) a.mat.color.set(o.tint); if (o.visible != null) a.visible = !!o.visible;
      ['shift', 'lift', 'squash', 'tilt'].forEach(function (k) { if (o[k] != null) a.fx[k] = num(o[k], 0); });
    }

    /* ---- camera-space side ---- */
    function camYaw() { camera.getWorldDirection(V2); return Math.atan2(-V2.x, -V2.z); }
    /* projected screen dx (NDC) from the actor's chest to a point dx, dz away on the ground plane */
    function screenDx(a, wx, wz) {
      var cy = a.y + a.h * 0.5;
      V0.set(a.x, cy, a.z).project(camera); V1.set(wx, cy, wz).project(camera);
      if (V0.z > 1 || V1.z > 1 || V0.z < -1 || V1.z < -1) return 0;   // behind the camera: no side from it
      return V1.x - V0.x;
    }
    function targetPos(a) {
      var t = a.target; if (t == null) return null;
      if (typeof t === 'string' || typeof t === 'number') { var b = byId[t]; return b && b !== a ? { x: b.x, z: b.z } : null; }
      if (t && isFinite(t.x) && isFinite(t.z)) return { x: +t.x, z: +t.z };
      return null;
    }
    /* a one-shot (hurt, attack, guard, cast, down) or the down state owns the pose: moves during it (knockback, lunge,
       slide) never turn the actor; an explicit setMove hint still does */
    function locked(a) { return !a.explicitMove && (!!a.one || !!a.downed); }
    /* the side the actor should look at THIS frame: target first, else the move direction, else keep */
    function wantSide(a) {
      var tp = targetPos(a), d;
      if (tp) { d = screenDx(a, tp.x, tp.z); if (Math.abs(d) > P.deadzone) return d > 0 ? 'right' : 'left'; }
      if (locked(a)) return a.side;      // knockback / lunge during a one-shot is not walking: keep the side
      var m = a.explicitMove || (a.moving ? a.moveDir : null);
      if (m) {
        var L = Math.hypot(m[0], m[1]) || 1, k = a.h * 0.6 / L;
        d = screenDx(a, a.x + m[0] * k, a.z + m[1] * k);
        if (Math.abs(d) > P.deadzone) return d > 0 ? 'right' : 'left';
      }
      return a.side;
    }

    /* ---- THE facing rule: which frame set, mirrored or not ---- */
    function pickFrames(a, want) {
      var S = a.src, native = S.facing;
      if (S.kind === 'canvas') {
        if (S.sides === 'both') return { base: want, flipX: false, painterMirror: want !== native && S.mirror !== 'never', variant: want !== native && S.mirror === 'never' ? want : null, paint: want, problem: null };
        var fx = want !== native;
        if (fx && S.mirror === 'never') return { base: native, flipX: false, variant: null, paint: native, problem: 'mirror:never source has no ' + want + ' side' };
        return { base: native, flipX: fx, variant: null, paint: native, problem: null };
      }
      if (want === native) return { base: native, flipX: false, variant: null, set: S.sets[native], problem: null };
      if (S.sets[want]) return { base: want, flipX: false, variant: want, set: S.sets[want], problem: null };
      var flip = want !== native;
      if (S.mirror === 'never') return { base: native, flipX: false, variant: null, set: S.sets[native], problem: 'mirror:never source has no ' + want + ' variant: drawn on its native side' };
      return { base: native, flipX: flip, variant: null, set: S.sets[native], problem: null };
    }

    function anim(a) {
      if (a.one) return { name: a.one.name, k: clamp(a.one.t / a.one.dur, 0, 1) };
      if (a.downed) return { name: 'down', k: 1 };
      if (a.moving && a.src.kind === 'canvas' && a.src.hasWalk) return { name: 'walk', k: walkPhase(a) };
      return { name: 'idle', k: 0 };
    }
    function walkPhase(a) { var st = Math.max(0.05, (a.src.stride || 1.1) * a.h); var p = (a.dist / st) % 1; return p < 0 ? p + 1 : p; }
    function gaitOf(a) {
      if (a.gait !== 'auto') return a.gait;
      if (a.hover > 0) return 'hover';
      if (a.src.kind === 'canvas') return a.src.hasWalk ? 'frames' : 'hop';
      return a.src.walk && a.src.walk.length >= 2 ? 'frames' : a.src.prop ? 'still' : 'hop';
    }

    /* geometry + uv + transform for this frame */
    function layout(a, dt) {
      var want = wantSide(a); a.side = want;
      var pick = pickFrames(a, want), S = a.src, g = gaitOf(a), an = anim(a), fr, tex, fx = a.fx;
      var shift = fx.shift, lift = fx.lift, squash = fx.squash, tilt = fx.tilt;
      // procedural motion for single-picture sources (canvas sources animate themselves)
      if (S.kind !== 'canvas' && !S.prop) {
        var k = an.k;
        if (an.name === 'attack' || an.name === 'slash' || an.name === 'cast') {
          var wind = ease(k / 0.3), hit = ease((k - 0.3) / 0.14), back = ease((k - 0.56) / 0.44);
          shift += (-0.06 * wind + 0.24 * hit * (1 - back)) ; squash += -0.04 * wind + 0.05 * hit * (1 - back); tilt += (-0.06 * wind + 0.1 * hit * (1 - back));
        } else if (an.name === 'hurt') {
          var r = Math.sin(clamp(k, 0, 1) * Math.PI) * (1 - k * 0.3); shift -= 0.12 * r; tilt -= 0.12 * r; squash -= 0.05 * r;
        } else if (an.name === 'guard') { var gk = ease(k / 0.2) * (1 - ease((k - 0.75) / 0.25)); squash -= 0.05 * gk; shift -= 0.03 * gk; }
        else if (an.name === 'down') { var d = ease(k); tilt -= 0.5 * d; squash -= 0.1 * d; }
        else if (an.name === 'idle' && !a.moving) squash += Math.sin(clock / 560 + a.id.length * 1.3) * 0.012;
      }
      var airborne = false;
      if (g === 'hop' && !S.prop) {
        // one hop per half stride, height from distance (never a slide); eases down when the actor stops
        var step = Math.max(0.05, (S.stride || 1.1) * a.h * 0.5), ph = (a.dist / step) % 1, target = a.moving ? Math.sin(ph * Math.PI) : 0;
        a.hopK = a.moving ? target : Math.max(0, a.hopK - dt / 120);
        lift += P.hop * a.h * 2.2 * a.hopK; squash += a.moving ? (a.hopK < 0.25 ? -0.05 * (1 - a.hopK / 0.25) : 0.03 * a.hopK) : 0;
        airborne = a.hopK > 0.02;
      }
      if (g === 'hover') { lift += a.hover * a.h + Math.sin(clock / 700 + a.id.length) * 0.04 * a.h; airborne = true; }
      a.lift = lift; a.airborne = airborne;

      // texture / frame
      var x0, x1, y0, y1, u0, u1, v0, v1, ok = true;
      if (S.kind === 'canvas') {
        var c = a.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, S.w, S.h);
        try { if (typeof S.paint === 'function') S.paint(c, { side: pick.paint, anim: an.name, k: an.k, walkPhase: walkPhase(a), moving: a.moving, t: clock - a.born, id: a.id, footX: S.footX, footY: S.footY, bodyH: S.bodyH }); }
        catch (e) { warn('paint' + a.id, 'paint() threw: ' + e.message); }
        a.ctex.needsUpdate = true; tex = a.ctex;
        fr = { sw: S.w, sh: S.h, sx: 0, sy: 0, cx: S.footX, baseline: S.footY, bodyH: S.bodyH, img: a.canvas }; a.drawn.frame = 0;
        u0 = 0; u1 = 1; v0 = 0; v1 = 1;
      } else {
        var set0 = pick.set, idx = S.idle;
        if (g === 'frames' && a.moving && S.walk && S.walk.length) idx = S.walk[Math.floor(walkPhase(a) * S.walk.length) % S.walk.length];
        fr = set0[Math.min(idx, set0.length - 1)] || set0[0]; a.drawn.frame = idx;
        tex = texFor(fr.img); ok = ready(fr.img);
        var IW = (fr.img && (fr.img.naturalWidth || fr.img.width)) || fr.sw, IH = (fr.img && (fr.img.naturalHeight || fr.img.height)) || fr.sh;
        u0 = fr.sx / IW; u1 = (fr.sx + fr.sw) / IW; v1 = 1 - fr.sy / IH; v0 = 1 - (fr.sy + fr.sh) / IH;
      }
      var s = a.h / fr.bodyH, sq = squash;
      var W = fr.sw * s * (1 - sq * 0.7), H = fr.sh * s * (1 + sq);
      var left = -fr.cx * s * (1 - sq * 0.7), bottom = -(fr.sh - fr.baseline) * s * (1 + sq);
      if (pick.flipX) { left = -(fr.sw - fr.cx) * s * (1 - sq * 0.7); var tu = u0; u0 = u1; u1 = tu; }
      x0 = left; x1 = left + W; y0 = bottom + lift; y1 = y0 + H;
      // lean (tilt) around the feet, shift along the facing side, in the quad's own plane
      var dir = want === 'right' ? 1 : -1, ct = Math.cos(tilt * dir), st2 = Math.sin(tilt * dir), sh = shift * a.h * dir;
      var pos = a.geo.attributes.position.array, uv = a.geo.attributes.uv.array;
      var X = [x0, x1, x0, x1], Y = [y1, y1, y0, y0];
      // a lean rotates around the feet; then the quad is raised so the LOWEST foot pixel (sampled per column in the
      // foot band) sits exactly on the ground: no foot sinks, the other heel / toe lifts
      var raise = 0;
      if (st2 !== 0) {
        var fp = footPoints(fr), sx2 = (1 - sq * 0.7) * (pick.flipX ? -1 : 1), sy2 = 1 + sq, mn = Infinity;
        if (fp) for (var j = 0; j < fp.length; j += 2) { var qx = fp[j] * s * sx2, qy = fp[j + 1] * s * sy2, yy = -qx * st2 + qy * ct; if (yy < mn) mn = yy; }
        else { var fh = a.h * num(S.footHalf, 0.16); mn = Math.min(-fh * st2, fh * st2); }
        raise = isFinite(mn) ? -mn : 0;
      }
      for (var i = 0; i < 4; i++) {
        var px = X[i], py = Y[i] - lift;
        pos[i * 3] = px * ct + py * st2 + sh; pos[i * 3 + 1] = -px * st2 + py * ct + lift + raise; pos[i * 3 + 2] = 0;
      }
      uv[0] = u0; uv[1] = v1; uv[2] = u1; uv[3] = v1; uv[4] = u0; uv[5] = v0; uv[6] = u1; uv[7] = v0;
      a.geo.attributes.position.needsUpdate = true; a.geo.attributes.uv.needsUpdate = true; a.geo.computeBoundingSphere();
      if (a.mat.map !== tex) { a.mat.map = tex; a.mat.needsUpdate = true; if (a.mesh.customDepthMaterial) { a.mesh.customDepthMaterial.map = tex; a.mesh.customDepthMaterial.needsUpdate = true; } }
      a.drawn.side = pick.flipX ? other(pick.base) : pick.base; a.drawn.base = pick.base; a.drawn.flipX = pick.flipX; a.drawn.variant = pick.variant; a.drawn.problem = pick.problem; a.drawn.painterMirror = !!pick.painterMirror;

      // place + orient
      a.mesh.position.set(a.x, a.y, a.z);
      var yaw = P.mode === 'cylinder' ? Math.atan2(camera.position.x - a.x, camera.position.z - a.z) : camYaw();
      a.mesh.rotation.set(0, yaw, 0); a.yaw = yaw;
      a.mesh.visible = a.visible && ok && a.alpha > 0.002;
      a.mat.opacity = a.alpha; a.mat.transparent = P.alphaMode !== 'cutout' || a.alpha < 1;
      // flash
      var f = 0;
      if (a.flashT >= 0) { f = a.flashT < 60 ? 0.6 : 0.6 * (1 - clamp((a.flashT - 60) / Math.max(1, a.flashMs - 60), 0, 1)); if (a.flashT > a.flashMs) a.flashT = -1; }
      a.mat.userData.U.uFlash.value = f; if (a.flashCol) a.mat.userData.U.uFlashColor.value.set(a.flashCol); else a.mat.userData.U.uFlashColor.value.setRGB(1, 1, 1);
      // light probe: brighten by nearby point lights (painted art keeps its own shading)
      if (P.lightProbe > 0) probe(a);
      // blob shadow
      if (a.blob) {
        var bw = Math.max(0.2, a.h * (S.blobW || 0.55)) * a.shadowScale * (1 - clamp(lift / (a.h * 2.5), 0, 0.55));
        a.blob.position.set(a.x + sh, a.y + 0.03, a.z); a.blob.scale.set(bw, bw * 0.55, 1); a.blob.rotation.set(-Math.PI / 2, 0, a.yaw);
        a.blob.material.opacity = P.shadowAlpha * a.alpha * (1 - clamp(lift / (a.h * 3), 0, 0.6)); a.blob.visible = a.mesh.visible;
      }
    }
    /* per column of the frame, the lowest opaque pixel within the foot band (lowest 10 % above the baseline), as
       flat [x - cx, height above baseline] pairs in source px; measured once; null when pixels cannot be read
       (cross-origin image) or the frame is a live canvas (then a fixed foot width is used) */
    var FX = null;
    function footPoints(fr) {
      if (fr.foot !== undefined) return fr.foot;
      if (!fr.img || fr.img.getContext || !ready(fr.img)) return null;
      fr.foot = null;
      try {
        var h = Math.max(3, Math.round(fr.baseline * 0.1)), w = Math.max(1, Math.round(fr.sw)), st = Math.max(1, Math.floor(w / 96)), out = [];
        if (!FX) FX = document.createElement('canvas'); FX.width = w; FX.height = h; var g = FX.getContext('2d', { willReadFrequently: true }); g.clearRect(0, 0, w, h);
        g.drawImage(fr.img, fr.sx, fr.sy + fr.baseline - h, fr.sw, h, 0, 0, w, h);
        var d = g.getImageData(0, 0, w, h).data;
        for (var x = 0; x < w; x += st) for (var y = h - 1; y >= 0; y--) if (d[(y * w + x) * 4 + 3] > 127) { out.push(x + 0.5 - fr.cx, h - 1 - y); break; }
        if (out.length) fr.foot = out;
      } catch (e) { fr.foot = null; }
      return fr.foot;
    }
    var LP = [];
    function probe(a) {
      if (!LP.length && !probe.scanned) { probe.scanned = true; scene.traverse(function (o) { if (o.isPointLight) LP.push(o); }); }
      var r = 0, g = 0, b = 0;
      for (var i = 0; i < LP.length; i++) {
        var L = LP[i]; if (!L.visible || !L.intensity) continue; L.getWorldPosition(V0);
        var d = Math.hypot(V0.x - a.x, V0.y - (a.y + a.h * 0.5), V0.z - a.z), R = L.distance || 8, w = clamp(1 - d / R, 0, 1); w = w * w * L.intensity * P.lightProbe * 0.35;
        r += L.color.r * w; g += L.color.g * w; b += L.color.b * w;
      }
      var base = a.baseTint || (a.baseTint = a.mat.color.clone());
      a.mat.color.setRGB(base.r * (1 + r), base.g * (1 + g), base.b * (1 + b));
    }

    function update(dt) {
      try {
        dt = num(dt, 16.67); if (dt < 0) dt = 0; clock += dt;
        camera.updateMatrixWorld(); if (camera.matrixWorldInverse) camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
        for (var i = 0; i < actors.length; i++) {
          var a = actors[i];
          var dx = a.x - a.px, dz = a.z - a.pz, d = Math.hypot(dx, dz);
          if (d > 1e-5 && d < a.h * 4) { a.moveDir = [dx / d, dz / d]; a.dist += d; a.moving = true; a.speed = dt > 0 ? d / dt * 1000 : a.speed; a.stillMs = 0; }
          else if (d >= a.h * 4) { a.moving = false; }            // teleport / restart: no walk, no facing change
          else { a.stillMs = (a.stillMs || 0) + dt; if (a.stillMs > 50 || dt > 50) { a.moving = false; a.speed = 0; } }
          a.px = a.x; a.pz = a.z; a.y = ground(a.x, a.z);
          if (a.one) { a.one.t += dt; if (a.one.t >= a.one.dur) { if (a.one.name === 'down') a.downed = true; a.one = null; } }
          if (a.flashT >= 0) a.flashT += dt;
          layout(a, dt);
        }
      } catch (e) { warn('update', 'update() failed: ' + e.message); }
    }

    /* ---- anchors for 2D overlays (CSS px of the renderer canvas, or options.view {w, h}) ---- */
    function viewSize() {
      if (opt.view) { var v = typeof opt.view === 'function' ? opt.view() : opt.view; if (v && v.w) return v; }
      var el = renderer && renderer.domElement; if (el) return { w: el.clientWidth || el.width, h: el.clientHeight || el.height };
      return { w: 1, h: 1 };
    }
    function toScreen(x, y, z, vs) { V0.set(x, y, z).project(camera); return { x: (V0.x + 1) / 2 * vs.w, y: (1 - V0.y) / 2 * vs.h, behind: V0.z > 1 || V0.z < -1 }; }
    function anchor(id, which) {
      var a = byId[id]; if (!a) return null;
      var vs = viewSize(), feet = toScreen(a.x, a.y, a.z, vs), top = toScreen(a.x, a.y + a.lift + a.h, a.z, vs), body = toScreen(a.x, a.y + a.lift, a.z, vs);
      var hpx = Math.max(1, body.y - top.y), w = hpx * (a.src.bodyAspect || 0.5);
      var r = { id: id, x: top.x, top: top.y, y: body.y, footY: feet.y, w: w, h: hpx, visible: a.mesh.visible && !feet.behind && feet.x > -w && feet.x < vs.w + w && feet.y > -hpx && top.y < vs.h, depth: V0.set(a.x, a.y, a.z).applyMatrix4(camera.matrixWorldInverse).z };
      if (which === 'head') return { x: r.x, y: r.top, top: r.top, w: r.w, h: r.h, visible: r.visible };
      if (which === 'feet') return { x: feet.x, y: feet.y, w: r.w, h: r.h, visible: r.visible };
      if (which === 'center' || which === 'chest') { var c = toScreen(a.x, a.y + a.lift + a.h * 0.55, a.z, vs); return { x: c.x, y: c.y, w: r.w, h: r.h, visible: r.visible }; }
      return r;
    }
    function anchors() { return actors.map(function (a) { return anchor(a.id); }); }

    /* ---- text state: what is drawn, read back from the quad's uv (not from a variable) ---- */
    function drawnSide(a) {
      var uv = a.geo.attributes.uv.array, flipped = uv[0] > uv[2];
      return flipped ? other(a.drawn.base) : a.drawn.base;
    }
    function expectSide(a) {     // independent of wantSide(): recomputed from projected positions
      var tp = targetPos(a), vs = viewSize(), me = toScreen(a.x, a.y + a.h * 0.5, a.z, vs);
      if (tp) { var t = toScreen(tp.x, a.y + a.h * 0.5, tp.z, vs); if (!t.behind && !me.behind && Math.abs(t.x - me.x) > P.deadzone * vs.w / 2) return { side: t.x > me.x ? 'right' : 'left', by: 'target' }; }
      var m = locked(a) ? null : a.explicitMove || (a.moving ? a.moveDir : null);
      if (m) { var L = Math.hypot(m[0], m[1]) || 1, k = a.h * 0.6 / L, q = toScreen(a.x + m[0] * k, a.y + a.h * 0.5, a.z + m[1] * k, vs); if (Math.abs(q.x - me.x) > P.deadzone * vs.w / 2) return { side: q.x > me.x ? 'right' : 'left', by: 'move' }; }
      return null;
    }
    function state() {
      var vs = viewSize();
      return { t: Math.round(clock), view: vs, camYaw: +camYaw().toFixed(4), actors: actors.map(function (a) {
        var f = toScreen(a.x, a.y, a.z, vs), ds = drawnSide(a), e = expectSide(a), tid = null;
        if (typeof a.target === 'string' || typeof a.target === 'number') tid = byId[a.target] ? String(a.target) : null;
        else if (a.target && isFinite(a.target.x)) tid = Math.round(toScreen(a.target.x, a.y, a.target.z, vs).x);
        var mv = a.explicitMove || (a.moving ? a.moveDir : [0, 0]), vxs = 0;
        if (!tid && (a.moving || a.explicitMove) && e) { var q = toScreen(a.x + mv[0] * a.h, a.y, a.z + mv[1] * a.h, vs); vxs = q.x - f.x; }   // e null = moving straight toward / away from the camera: keeps its side
        return { id: a.id, x: +f.x.toFixed(1), y: +f.y.toFixed(1), wx: +a.x.toFixed(3), wy: +a.y.toFixed(3), wz: +a.z.toFixed(3), yaw: +a.yaw.toFixed(4),
          moveDir: [+mv[0].toFixed(3), +mv[1].toFixed(3)], target: tid, vx: +vxs.toFixed(2), facing: ds, flipX: a.drawn.flipX || a.drawn.painterMirror, uvFlip: a.drawn.flipX,
          asset: { facing: a.src.facing, mirror: a.src.mirror, variant: a.drawn.variant, variants: a.src.kind === 'canvas' ? (a.src.sides === 'both' && a.src.mirror === 'never' ? { left: 'painted', right: 'painted' } : {}) : Object.keys(a.src.sets).reduce(function (o, k) { if (k !== a.src.facing) o[k] = a.src.name ? a.src.name + '@' + k : k; return o; }, {}) },
          src: a.src.name, facesMove: e ? e.side === ds : null, expect: e ? e.side + ' (' + e.by + ')' : null, problem: a.drawn.problem, anim: anim(a).name, frame: a.drawn.frame,
          moveNote: !e && a.moving ? 'moving along the view axis: keeps its last side' : undefined, airborne: a.airborne, lift: +a.lift.toFixed(3), visible: a.mesh.visible, noFace: a.src.prop ? 'prop' : undefined };
      }) };
    }
    function setParams(o) {
      if (!o) return;
      if (o.filter && o.filter !== P.filter) { P.filter = o.filter === 'crisp' ? 'crisp' : 'smooth'; texCache.forEach(applyFilter); actors.forEach(function (a) { if (a.ctex) applyFilter(a.ctex); }); }
      if (o.mode) P.mode = o.mode === 'cylinder' ? 'cylinder' : 'camera';
      ['shadowAlpha', 'push', 'flashMs', 'deadzone', 'hop', 'lightProbe'].forEach(function (k) { if (o[k] != null) P[k] = num(o[k], P[k]); });
      if (o.push != null) actors.forEach(function (a) { a.mat.userData.U.uPush.value = P.push; });
      if (o.shadow != null) { P.shadow = o.shadow; actors.forEach(function (a) { if (a.blob) a.blob.material.visible = P.shadow === 'blob' || P.shadow === 'both'; a.mesh.castShadow = P.shadow === 'sprite' || P.shadow === 'both'; if (a.mesh.castShadow && !a.mesh.customDepthMaterial) { a.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: 0.5, side: THREE.DoubleSide, map: a.mat.map }); } }); }
      if (o.tint) { P.tint = o.tint; actors.forEach(function (a) { a.mat.color.set(o.tint); a.baseTint = null; }); }
    }
    function dispose() { actors.slice().forEach(function (a) { remove(a.id); }); scene.remove(group); BLOB.dispose(); texCache.forEach(function (t) { t.dispose(); }); texCache.clear(); }

    return { ok: true, version: VERSION, group: group, add: add, remove: remove, move: move, setMove: setMove, setTarget: setTarget, play: play, flash: flash, set: set,
      update: update, anchor: anchor, anchors: anchors, state: state, get: function (id) { return byId[id] || null; }, ids: function () { return actors.map(function (a) { return a.id; }); },
      setParams: setParams, params: function () { return JSON.parse(JSON.stringify(P)); }, dispose: dispose, ground: ground, time: function () { return clock; } };
  }

  /* WebGL available? (call before making a WebGLRenderer; show your own 2D message when false) */
  function webglOK() { try { var c = document.createElement('canvas'); return !!(root.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }

  root.GameDNA_Billboards3D = { version: VERSION, create: create, imageSource: imageSource, canvasSource: canvasSource, kitSource: kitSource, webglOK: webglOK, sideOf: sideOf };
})(typeof window !== 'undefined' ? window : this);
