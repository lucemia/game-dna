/* GameDNA_ThirdPerson3D v1.0.0 (N-01 third-person-3d), Game DNA library.
   A low-poly third-person character and follow camera on a small 3D island, for three.js 0.149.0 (classic build,
   window.THREE). One global, no other dependencies, ASCII only. Works from file:// and http.

   What it owns: the renderer, scene, sky, island ground, props with colliders, procedural adventurer models
   (auto-scaled by bounding box, feet on y = 0 in every pose), idle / walk / run animation tied to the distance
   travelled (no foot sliding), camera-relative movement, a smooth follow camera that pulls in in front of props,
   pickups, world -> screen anchors, a grid path autopilot, and window.__state()-style text state.
   What the game owns: rules (what a pickup is worth, quests, dialogue), HUD, input devices, the main loop.

   Facing rule: every model records FACING_OFFSET, the yaw that makes its nose point along +Z.
   yaw = Math.atan2(v.x, v.z) + FACING_OFFSET. Never hand-tune a yaw per scene.
   API: see module/README.md. */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var FACING_OFFSET = 0;            // adventurer models are built with the nose along +Z
  var TAU = Math.PI * 2, DT = 1 / 60;

  var DEFAULTS = {
    walkSpeed: 1.8, runSpeed: 5.2, accel: 22, turnRate: 12, heroHeight: 1.7,
    camDist: 6.5, camPitch: 20, camLag: 0.12, autoAlign: 1.2, fov: 50,
    gear: 'both', palette: 'meadow', shadows: 'soft', maxDpr: 2
  };

  var PALETTES = {
    meadow: { skyTop: 0x3f86d6, skyMid: 0x8ec3ea, horizon: 0xe4f0ea, fog: 0xc6dfe6, fogNear: 34, fogFar: 150,
      sun: 0xfff0d2, sunI: 1.05, sunDir: [0.55, 0.95, 0.42], hemiSky: 0xd6ecff, hemiGround: 0x5e7a3c, hemiI: 0.62,
      water: 0x2f8fa6, waterDeep: 0x1f6f8f, grass: ['#6fa64a', '#7cb455', '#64983f', '#86bd5c', '#5b8d3a'], dirt: '#b58d5c',
      stone: 0xcfc4ab, stoneDark: 0x9c917c, moss: 0x6f9548, leaf: [0x4f9a45, 0x5fae4c, 0x3f8a40, 0x78b850], trunk: 0x7a5236,
      cliff: [0x9d8c74, 0x8a7a64, 0xb2a286], lampI: 0.6, cloud: 0xffffff },
    dusk: { skyTop: 0x2a2c66, skyMid: 0x8a5a8a, horizon: 0xf6a76a, fog: 0xc98b78, fogNear: 30, fogFar: 130,
      sun: 0xffb27a, sunI: 0.95, sunDir: [-0.75, 0.42, 0.35], hemiSky: 0xb7a6d8, hemiGround: 0x4a4a3a, hemiI: 0.55,
      water: 0x3d6f8f, waterDeep: 0x2a4f70, grass: ['#5d8f48', '#6a9a4e', '#537f40', '#749f55', '#4c7638'], dirt: '#a8805a',
      stone: 0xd4b8a0, stoneDark: 0x93806e, moss: 0x5f8048, leaf: [0x4a8048, 0x5a8f4e, 0x3c7040, 0x6a9650], trunk: 0x6a4630,
      cliff: [0x9a7e70, 0x86695e, 0xb08c78], lampI: 1.0, cloud: 0xffd2c0 },
    autumn: { skyTop: 0x4f8cc8, skyMid: 0x9cc6e6, horizon: 0xf2e2c8, fog: 0xe0d6c4, fogNear: 34, fogFar: 150,
      sun: 0xffe2b8, sunI: 1.05, sunDir: [0.4, 0.9, 0.6], hemiSky: 0xe8e0d0, hemiGround: 0x6a5a34, hemiI: 0.6,
      water: 0x3a8a9a, waterDeep: 0x26697e, grass: ['#8a9a48', '#97a652', '#7e8c40', '#a3ad5c', '#738238'], dirt: '#b88a58',
      stone: 0xd2c6ac, stoneDark: 0x9e927c, moss: 0x7a8c44, leaf: [0xd9792c, 0xe8a23a, 0xc4552a, 0xb8b040], trunk: 0x6f4a32,
      cliff: [0xa08a70, 0x8c7660, 0xb4a084], lampI: 0.7, cloud: 0xffffff }
  };

  /* ---------------------------------------------------------------------------------------------- small helpers */
  function rng(seed) { var a = (seed >>> 0) || 1; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function angDiff(a, b) { var d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
  function hash3(x, y, z) { var h = Math.sin(Math.round(x * 97) * 12.9898 + Math.round(y * 97) * 78.233 + Math.round(z * 97) * 37.719) * 43758.5453; return h - Math.floor(h); }
  function hex(c) { return '#' + ('000000' + c.toString(16)).slice(-6); }

  function supportsWebGL() {
    try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }

  /* lowest world y of every mesh vertex under obj (skips userData.noBounds); used for feet-on-ground */
  var _v = null;
  function minWorldY(THREE, obj) {
    if (!_v) _v = new THREE.Vector3();
    obj.updateMatrixWorld(true);
    var m = Infinity;
    obj.traverse(function (o) {
      if (!o.isMesh || o.userData.noBounds || !o.visible) return;
      var p = o.geometry.attributes.position, e = o.matrixWorld.elements;
      for (var i = 0; i < p.count; i++) {
        var x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        var wy = e[1] * x + e[5] * y + e[9] * z + e[13];
        if (wy < m) m = wy;
      }
    });
    return m;
  }
  function worldBox(THREE, obj) {
    obj.updateMatrixWorld(true);
    var b = new THREE.Box3(), v = new THREE.Vector3();
    obj.traverse(function (o) {
      if (!o.isMesh || o.userData.noBounds) return;
      var p = o.geometry.attributes.position;
      for (var i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); b.expandByPoint(v); }
    });
    return b;
  }

  /* ---------------------------------------------------------------------------------------------- materials */
  function MatKit(THREE) {
    var cache = {};
    return {
      flat: function (color, opt) {
        opt = opt || {};
        var k = 'f' + color + (opt.emissive || '') + (opt.vc ? 'v' : '') + (opt.side || '') + (opt.shin || '');
        if (!cache[k]) cache[k] = new THREE.MeshPhongMaterial({ color: color, flatShading: true, shininess: opt.shin || 4, specular: 0x111111,
          emissive: opt.emissive || 0x000000, vertexColors: !!opt.vc, side: opt.side || THREE.FrontSide });
        return cache[k];
      },
      smooth: function (color, opt) {
        opt = opt || {};
        var k = 's' + color + (opt.emissive || '') + (opt.shin || '');
        if (!cache[k]) cache[k] = new THREE.MeshPhongMaterial({ color: color, shininess: opt.shin || 20, specular: opt.spec || 0x222222, emissive: opt.emissive || 0x000000 });
        return cache[k];
      }
    };
  }

  function glowTexture(THREE, inner, outer) {
    var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d');
    var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, inner); gr.addColorStop(0.35, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); var t = new THREE.CanvasTexture(c); return t;
  }

  /* ordered-dither fade (screen-door): the material stays opaque (no sorting, no see-through back faces); uFade 1 = solid */
  var DITHER = 'uniform float uFade;\nfloat gdnaB2(vec2 a) { return mod(2.0 * a.x + 3.0 * a.y, 4.0); }\n';
  function ditherable(mat) {
    if (mat.userData.fadeU) return mat;
    var u = { value: 1 }; mat.userData.fadeU = u;
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uFade = u;
      sh.fragmentShader = DITHER + sh.fragmentShader.replace('void main() {', 'void main() {\n  if (uFade < 0.999) { vec2 q = mod(floor(gl_FragCoord.xy), 4.0); float b = (4.0 * gdnaB2(mod(q, 2.0)) + gdnaB2(floor(q / 2.0)) + 0.5) / 16.0; if (b > uFade) discard; }');
    };
    mat.customProgramCacheKey = function () { return 'gdna-dither'; };
    return mat;
  }

  /* ---------------------------------------------------------------------------------------------- adventurer model
     Built with the nose along +Z (FACING_OFFSET = 0), feet near y = 0, roughly 1.7 units tall, then auto-scaled by
     bounding box to the requested height. Parts are nested pivots so limbs swing from joints and stay attached. */
  var LOOKS = {
    hero: { skin: 0xf0c49c, hair: 0x5a3422, tunic: 0x2f8f8a, trim: 0xe9d9a8, sleeve: 0x2a7d78, pants: 0x4a4a5e, boots: 0x5c3a26,
      belt: 0x4a2e1c, buckle: 0xe8c14a, cape: 0xc8463c, capeIn: 0x8e2f2c, satchel: 0x8a5a34, strap: 0x5e3a20, hat: 'none', robe: false, eyes: 0x2a2030, gear: 'both' },
    keeper: { skin: 0xd9a27c, hair: 0xb8bcc6, brows: 0xe8e8ee, tunic: 0x5a4f8f, trim: 0xe8c86a, sleeve: 0x4c427c, pants: 0x3c3450, boots: 0x3e2c22,
      belt: 0xb08a3a, buckle: 0xf2d06a, cape: null, satchel: false, hat: 'wide', hatColor: 0x3c3468, hatBand: 0xe8c86a, robe: true, beard: true, eyes: 0x2a2030, gear: 'none' },
    villager: { skin: 0xc68a62, hair: 0x2a1c14, tunic: 0xd08a3a, trim: 0xf4e4c0, sleeve: 0xb8762e, pants: 0x5a6a3e, boots: 0x4a3020,
      belt: 0x5a3a20, buckle: 0xd8b04a, cape: null, satchel: true, satchelColor: 0x6a8a4a, strap: 0x3e5a2a, hat: 'none', hatColor: 0x6e8f4e, robe: false, eyes: 0x2a2030, gear: 'satchel' }
  };

  function buildAdventurer(THREE, mats, lookIn) {
    var L = {}; var base = LOOKS[(lookIn && lookIn.base) || 'hero'] || LOOKS.hero, k;
    for (k in base) L[k] = base[k];
    if (lookIn) for (k in lookIn) if (k !== 'base') L[k] = lookIn[k];
    var gear = L.gear || 'both';
    var showCape = L.cape && (gear === 'cape' || gear === 'both'), showSatchel = (L.satchel !== false) && (gear === 'satchel' || gear === 'both');
    var M = function (c) { return mats.flat(c); };
    function mesh(geo, color, x, y, z, parent, mat) { var m = new THREE.Mesh(geo, mat || M(color)); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; if (parent) parent.add(m); return m; }
    function down(geo, len) { geo.translate(0, -len / 2, 0); return geo; }

    var model = new THREE.Group(); model.name = 'adventurer';
    var body = new THREE.Group(); model.add(body);          // body.position.y is the grounding offset
    var hips = new THREE.Group(); hips.position.y = 0.86; body.add(hips);
    var torso = new THREE.Group(); hips.add(torso);
    // pelvis + torso (hex prisms, flat shaded)
    mesh(new THREE.CylinderGeometry(0.205, 0.215, 0.2, 7), L.pants, 0, 0, 0, hips);
    var chest = mesh(new THREE.CylinderGeometry(0.215, 0.205, 0.5, 7), L.tunic, 0, 0.25, 0, torso);
    chest.scale.set(1, 1, 0.82);
    var skirt = mesh(new THREE.CylinderGeometry(0.212, L.robe ? 0.34 : 0.265, L.robe ? 0.78 : 0.24, 8, 1, true), L.tunic, 0, L.robe ? -0.39 : -0.1, 0, torso,
      new THREE.MeshPhongMaterial({ color: L.tunic, flatShading: true, shininess: 4, specular: 0x111111, side: THREE.DoubleSide }));
    skirt.scale.set(1, 1, 0.86);
    mesh(new THREE.CylinderGeometry(L.robe ? 0.345 : 0.27, L.robe ? 0.345 : 0.27, 0.035, 8), L.trim, 0, L.robe ? -0.77 : -0.215, 0, torso).scale.set(1, 1, 0.86);
    mesh(new THREE.CylinderGeometry(0.222, 0.222, 0.06, 8), L.belt, 0, 0.02, 0, torso).scale.set(1, 1, 0.84);
    mesh(new THREE.BoxGeometry(0.08, 0.07, 0.03), L.buckle, 0, 0.02, 0.185, torso);        // buckle marks the front
    mesh(new THREE.BoxGeometry(0.13, 0.03, 0.02), L.trim, 0, 0.47, 0.165, torso);          // collar trim, front
    mesh(new THREE.BoxGeometry(0.03, 0.2, 0.02), L.trim, 0, 0.36, 0.172, torso);           // placket, front
    var collar = mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.08, 8), showCape ? L.cape : L.trim, 0, 0.5, -0.01, torso); collar.scale.set(1, 1, 0.85);
    // neck + head
    var neck = new THREE.Group(); neck.position.y = 0.5; torso.add(neck);
    mesh(new THREE.CylinderGeometry(0.062, 0.07, 0.16, 6), L.skin, 0, 0.06, 0, neck);
    var head = new THREE.Group(); head.position.y = 0.2; neck.add(head);
    var skull = mesh(new THREE.IcosahedronGeometry(0.175, 1), L.skin, 0, 0.0, 0, head); skull.scale.set(0.98, 1.06, 0.95);
    mesh(new THREE.BoxGeometry(0.036, 0.052, 0.02), L.eyes, -0.062, 0.005, 0.158, head);
    mesh(new THREE.BoxGeometry(0.036, 0.052, 0.02), L.eyes, 0.062, 0.005, 0.158, head);
    mesh(new THREE.BoxGeometry(0.014, 0.016, 0.01), 0xffffff, -0.054, 0.018, 0.169, head);
    mesh(new THREE.BoxGeometry(0.014, 0.016, 0.01), 0xffffff, 0.07, 0.018, 0.169, head);
    var nose = mesh(new THREE.IcosahedronGeometry(0.03, 0), L.skin, 0, -0.03, 0.168, head); nose.scale.set(1, 1.1, 0.9);
    mesh(new THREE.BoxGeometry(0.055, 0.014, 0.02), L.brows || L.hair, -0.064, 0.05, 0.158, head).rotation.z = 0.12;   // brows
    mesh(new THREE.BoxGeometry(0.055, 0.014, 0.02), L.brows || L.hair, 0.064, 0.05, 0.158, head).rotation.z = -0.12;
    mesh(new THREE.BoxGeometry(0.05, 0.012, 0.012), 0x8a4a3a, 0, -0.085, 0.156, head);       // mouth
    mesh(new THREE.BoxGeometry(0.045, 0.022, 0.012), 0xe8907a, -0.1, -0.045, 0.142, head).rotation.y = -0.5;
    mesh(new THREE.BoxGeometry(0.045, 0.022, 0.012), 0xe8907a, 0.1, -0.045, 0.142, head).rotation.y = 0.5;
    mesh(new THREE.IcosahedronGeometry(0.04, 0), L.skin, -0.172, -0.01, 0, head);
    mesh(new THREE.IcosahedronGeometry(0.04, 0), L.skin, 0.172, -0.01, 0, head);
    // hair: cap tilted back, back piece, fringe
    var cap = mesh(new THREE.SphereGeometry(0.188, 9, 6, 0, TAU, 0, Math.PI * 0.52), L.hair, 0, 0.012, -0.012, head); cap.rotation.x = -0.42;
    mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), L.hair, 0, -0.04, -0.13, head).rotation.x = 0.12;
    var fr = mesh(new THREE.BoxGeometry(0.26, 0.06, 0.06), L.hair, 0, 0.115, 0.13, head); fr.rotation.x = 0.5; fr.rotation.z = 0.08;
    if (L.beard) { var bh = mesh(new THREE.IcosahedronGeometry(0.16, 1), L.hair, 0, -0.1, -0.1, head); bh.scale.set(1.0, 1.15, 0.62); var bd = mesh(new THREE.ConeGeometry(0.12, 0.22, 6), L.hair, 0, -0.16, 0.08, head); bd.rotation.x = Math.PI + 0.35; }
    if (L.hat === 'wide') {
      mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 10), L.hatColor, 0, 0.1, 0, head);
      mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.05, 9), L.hatBand, 0, 0.14, 0, head);
      var cn = mesh(new THREE.ConeGeometry(0.17, 0.34, 9), L.hatColor, 0, 0.32, -0.03, head); cn.rotation.x = -0.25;
    } else if (L.hat === 'hood') {
      var hood = mesh(new THREE.SphereGeometry(0.205, 9, 7, Math.PI * 0.18, Math.PI * 1.64, 0, Math.PI * 0.62), L.hatColor, 0, 0.02, -0.01, head);
      hood.rotation.y = Math.PI; hood.material = new THREE.MeshPhongMaterial({ color: L.hatColor, flatShading: true, shininess: 4, specular: 0x111111, side: THREE.DoubleSide });
    }
    // arms: shoulder pad (attached to torso), abduction group, swing group, elbow, forearm, hand
    function arm(side) {
      var pad = mesh(new THREE.IcosahedronGeometry(0.088, 1), L.sleeve, side * 0.225, 0.43, 0, torso);
      var sh = new THREE.Group(); sh.position.set(side * 0.235, 0.43, 0); torso.add(sh);
      var ab = new THREE.Group(); ab.rotation.z = side * 0.1; sh.add(ab);
      var sw = new THREE.Group(); ab.add(sw);
      mesh(down(new THREE.CylinderGeometry(0.066, 0.056, 0.27, 6), 0.27), L.sleeve, 0, 0, 0, sw);
      var el = new THREE.Group(); el.position.y = -0.26; sw.add(el);
      mesh(new THREE.IcosahedronGeometry(0.056, 0), L.sleeve, 0, 0, 0, el);
      mesh(down(new THREE.CylinderGeometry(0.052, 0.046, 0.22, 6), 0.22), L.skin, 0, 0, 0, el);
      mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 6), L.trim, 0, -0.03, 0, el);       // cuff
      var hand = mesh(new THREE.IcosahedronGeometry(0.058, 1), L.skin, 0, -0.245, 0.006, el); hand.scale.set(0.9, 1.1, 1);
      return { pad: pad, shoulder: sh, abduct: ab, swing: sw, elbow: el, hand: hand, side: side };
    }
    var armL = arm(1), armR = arm(-1);
    // legs: hip pivot, thigh, knee, shin, boot with the toe forward (+Z)
    function leg(side) {
      var hp = new THREE.Group(); hp.position.set(side * 0.1, -0.02, 0); hips.add(hp);
      mesh(down(new THREE.CylinderGeometry(0.082, 0.07, 0.42, 6), 0.42), L.pants, 0, 0.02, 0, hp);
      var kn = new THREE.Group(); kn.position.y = -0.4; hp.add(kn);
      mesh(new THREE.IcosahedronGeometry(0.07, 0), L.pants, 0, 0, 0, kn);
      mesh(down(new THREE.CylinderGeometry(0.066, 0.058, 0.3, 6), 0.3), L.pants, 0, 0, 0, kn);
      mesh(new THREE.CylinderGeometry(0.08, 0.074, 0.17, 7), L.boots, 0, -0.33, 0, kn);
      mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.035, 7), L.trim, 0, -0.245, 0, kn);
      mesh(new THREE.BoxGeometry(0.13, 0.09, 0.24), L.boots, 0, -0.395, 0.045, kn);   // toe points forward (+Z)
      return { hip: hp, knee: kn, side: side };
    }
    var legL = leg(1), legR = leg(-1);
    // cape: open cylinder segment hanging from the shoulders at the back (-Z)
    var cape = null;
    if (showCape) {
      cape = new THREE.Group(); cape.position.set(0, 0.48, -0.06); torso.add(cape);
      var cg = new THREE.CylinderGeometry(0.2, 0.31, 0.78, 9, 4, true, Math.PI * 0.5 + 0.35, Math.PI - 0.7); cg.translate(0, -0.39, 0);
      var cm = new THREE.Mesh(cg, new THREE.MeshPhongMaterial({ color: L.cape, flatShading: true, shininess: 4, specular: 0x111111, side: THREE.DoubleSide }));
      cm.castShadow = true; cm.receiveShadow = true; cm.scale.set(1, 1, 0.9); cape.add(cm);
      mesh(new THREE.IcosahedronGeometry(0.035, 0), L.buckle, -0.15, -0.02, 0.17, cape);
      mesh(new THREE.IcosahedronGeometry(0.035, 0), L.buckle, 0.15, -0.02, 0.17, cape);
    }
    // satchel on the right hip with a strap over the left shoulder (front and back)
    var satchel = null;
    if (showSatchel) {
      satchel = new THREE.Group(); satchel.position.set(-0.235, -0.04, -0.04); torso.add(satchel);
      var bagCol = L.satchelColor || (typeof L.satchel === 'number' ? L.satchel : 0x8a5a34);
      mesh(new THREE.BoxGeometry(0.1, 0.18, 0.2), bagCol, 0, 0, 0, satchel);
      mesh(new THREE.BoxGeometry(0.11, 0.08, 0.205), L.strap || 0x5e3a20, 0, 0.06, 0, satchel);
      mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), L.buckle, -0.056, 0.03, 0, satchel);
      var sf = mesh(new THREE.BoxGeometry(0.045, 0.6, 0.02), L.strap || 0x5e3a20, 0, 0.25, 0.176, torso); sf.rotation.z = -0.72;
      var sb = mesh(new THREE.BoxGeometry(0.045, 0.6, 0.02), L.strap || 0x5e3a20, 0, 0.25, -0.176, torso); sb.rotation.z = -0.72;
    }
    var parts = { body: body, hips: hips, torso: torso, neck: neck, head: head, armL: armL, armR: armR, legL: legL, legR: legR, cape: cape, satchel: satchel };
    return { model: model, parts: parts, look: L, legLen: 0.82, robe: !!L.robe };
  }

  /* pose: walking / running from a phase advanced by distance; gestures blend on top. s = blend state */
  function poseAdventurer(P, s) {
    var A = s.amp, ph = s.phase, run = s.run, t = s.time, robe = s.robe;
    function legAngles(u) {        // u in [0,1): stance first half (foot moves back linearly), swing second half
      var sv, kneeB = 0;
      if (u < 0.5) { sv = 1 - 4 * u; } else { var w = (u - 0.5) * 2; sv = -Math.cos(Math.PI * w); kneeB = Math.sin(Math.PI * w); }
      return { th: Math.asin(clamp(sv * Math.sin(A), -1, 1)), knee: kneeB };
    }
    var uL = ((ph / TAU) % 1 + 1) % 1, uR = (uL + 0.5) % 1;
    var l = legAngles(uL), r = legAngles(uR);
    var kb = (0.55 + 0.9 * run) * Math.min(1, A / 0.35);
    if (robe) { kb *= 0.5; }
    P.legL.hip.rotation.x = -l.th; P.legL.knee.rotation.x = l.knee * kb;
    P.legR.hip.rotation.x = -r.th; P.legR.knee.rotation.x = r.knee * kb;
    // arms swing opposite to the legs, elbows bend more when running
    var armK = 0.9 + 0.4 * run;
    var idle = 1 - Math.min(1, A / 0.25);
    var breathe = Math.sin(t * 2.1);
    P.armL.swing.rotation.x = r.th * armK + idle * 0.04 * breathe;
    P.armR.swing.rotation.x = l.th * armK - idle * 0.04 * breathe;
    var elb = 0.18 + 1.05 * run + 0.15 * A;
    P.armL.elbow.rotation.x = -elb; P.armR.elbow.rotation.x = -elb;
    P.armL.abduct.rotation.z = 0.1 + idle * 0.03 * breathe; P.armR.abduct.rotation.z = -0.1 - idle * 0.03 * breathe;
    // torso: lean with speed, counter-twist, idle breathing
    P.torso.rotation.x = 0.06 * A + 0.16 * run;
    P.torso.rotation.y = -0.12 * Math.sin(ph) * A;
    P.hips.rotation.y = 0.1 * Math.sin(ph) * A;
    P.torso.scale.y = 1 + idle * 0.012 * breathe;
    P.head.rotation.x = -0.05 * run - 0.04 * A + s.headPitch;
    P.head.rotation.y = s.headYaw;
    if (P.cape) P.cape.rotation.x = s.capeAngle;
    if (P.satchel) P.satchel.rotation.x = 0.12 * Math.sin(ph * 2) * A;
    // gestures
    var g = s.gesture, gw = s.gestureW;
    if (g && gw > 0) {
      if (g === 'wave') {
        var wv = Math.sin(t * 9), WA = s.waveLeft ? P.armL : P.armR, sg = s.waveLeft ? -1 : 1;   // wave with the arm the viewer can see
        WA.swing.rotation.x = lerp(WA.swing.rotation.x, -0.3, gw);
        WA.abduct.rotation.z = lerp(WA.abduct.rotation.z, -1.35 * sg, gw);
        WA.elbow.rotation.x = lerp(WA.elbow.rotation.x, 0, gw);
        WA.elbow.rotation.z = lerp(0, (-1.55 + 0.4 * wv) * sg, gw);
        P.head.rotation.z = lerp(0, 0.08 * wv, gw * 0.5);
      } else if (g === 'cheer') {
        var hop = Math.sin(t * 7);
        P.armL.abduct.rotation.z = lerp(P.armL.abduct.rotation.z, 2.6 + 0.15 * hop, gw);
        P.armR.abduct.rotation.z = lerp(P.armR.abduct.rotation.z, -2.6 - 0.15 * hop, gw);
        P.armL.elbow.rotation.x = lerp(P.armL.elbow.rotation.x, -0.2, gw);
        P.armR.elbow.rotation.x = lerp(P.armR.elbow.rotation.x, -0.2, gw);
        P.armL.swing.rotation.x = lerp(P.armL.swing.rotation.x, 0, gw); P.armR.swing.rotation.x = lerp(P.armR.swing.rotation.x, 0, gw);
      } else if (g === 'bow') {
        P.torso.rotation.x = lerp(P.torso.rotation.x, 0.45, gw);
        P.head.rotation.x = lerp(P.head.rotation.x, 0.25, gw);
      }
    } else {
      P.armR.elbow.rotation.z = 0; P.armL.elbow.rotation.z = 0; P.head.rotation.z = 0;
    }
  }

  /* ---------------------------------------------------------------------------------------------- props */
  function jitterGeo(geo, amt, seed, keepTopY) {
    var p = geo.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (keepTopY != null && y >= keepTopY - 1e-4) continue;
      var h1 = hash3(x + seed, y, z), h2 = hash3(z, x + seed * 1.7, y), h3 = hash3(y, z, x + seed * 2.3);
      p.setXYZ(i, x + (h1 - 0.5) * amt, y + (h2 - 0.5) * amt, z + (h3 - 0.5) * amt);
    }
    p.needsUpdate = true; geo.computeVertexNormals(); return geo;
  }
  function tintGeo(THREE, geo, cols, upCol, seed) {   // per-face random tint, mossy faces pointing up
    geo = geo.index ? geo.toNonIndexed() : geo;
    var p = geo.attributes.position, n = p.count, c = new Float32Array(n * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), col = new THREE.Color();
    for (var i = 0; i < n; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); d.fromBufferAttribute(p, i + 2);
      var nrm = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
      var h = hash3(a.x + b.x + seed, a.y + d.y, a.z + b.z);
      col.setHex(cols[Math.floor(h * cols.length) % cols.length]);
      if (upCol != null && nrm.y > 0.6) col.setHex(upCol).multiplyScalar(0.92 + 0.16 * h);
      for (var j = 0; j < 3; j++) { c[(i + j) * 3] = col.r; c[(i + j) * 3 + 1] = col.g; c[(i + j) * 3 + 2] = col.b; }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
  }

  /* ---------------------------------------------------------------------------------------------- world */
  function create(opts) {
    opts = opts || {};
    var THREE = opts.THREE || root.THREE;
    var params = {}, k; for (k in DEFAULTS) params[k] = DEFAULTS[k];
    if (opts.params) for (k in opts.params) if (opts.params[k] != null && opts.params[k] !== '') params[k] = typeof DEFAULTS[k] === 'number' ? num(opts.params[k], DEFAULTS[k]) : opts.params[k];
    var canvas = opts.canvas, onEvent = opts.onEvent || function () {};
    var W = { ok: false, version: VERSION, FACING_OFFSET: FACING_OFFSET, params: params, reason: '' };

    function fallback(msg) {
      W.ok = false; W.reason = msg;
      var c = opts.overlay || canvas; var g = null;
      try { g = c && c.getContext && c.getContext('2d'); } catch (e) { g = null; }
      W.drawFallback = function () {
        if (!g) return; var w = c.clientWidth || c.width, h = c.clientHeight || c.height, dpr = (c.width / Math.max(1, w)) || 1;
        g.setTransform(dpr, 0, 0, dpr, 0, 0); var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#24365a'); gr.addColorStop(1, '#0f1626');
        g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#f2e6c8'; g.textAlign = 'center'; g.font = 'bold 20px Georgia, serif';
        g.fillText('This game needs 3D graphics (WebGL)', w / 2, h / 2 - 14); g.font = '14px system-ui, sans-serif'; g.fillStyle = '#c8d2e4';
        g.fillText(msg, w / 2, h / 2 + 14); g.fillText('Try another browser, or turn hardware acceleration on.', w / 2, h / 2 + 36);
      };
      W.drawFallback();
      ['addProp', 'addActor', 'addPickup', 'addCollider', 'step', 'render', 'resize', 'buildIsland', 'buildLayout', 'setTarget'].forEach(function (n) { W[n] = function () { return null; }; });
      W.actors = function () { return []; }; W.actor = function () { return null; }; W.pickups = function () { return []; };
      W.anchor = function () { return null; }; W.project = function () { return null; }; W.state = function () { return { t: 0, actors: [], webgl: false }; };
      W.autopilot = function () { return { x: 0, y: 0, run: false, arrived: false }; }; W.stats = function () { return { webgl: false }; };
      W.camInfo = function () { return {}; }; W.feetProbe = function () { return { maxAbs: 0, n: 0 }; }; W.colliders = []; W.time = 0;
      return W;
    }
    if (!THREE) return fallback('three.js was not loaded (window.THREE is missing).');
    if (!canvas) return fallback('No canvas was given to GameDNA_ThirdPerson3D.create().');
    var gl = null;
    try { gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true }) || canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true }); } catch (e) { gl = null; }
    if (!gl) return fallback('WebGL is not available here.');
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, context: gl, antialias: true, preserveDrawingBuffer: true }); }
    catch (e) { return fallback('WebGL could not start: ' + (e && e.message || e)); }
    W.ok = true; W.THREE = THREE; W.renderer = renderer;
    // three.js validates every program against whatever GL state is bound at compile time; under software GL that
    // reports harmless VALIDATE_STATUS warnings. Production setting (three docs): off; opts.glCheck = true turns it on.
    renderer.debug.checkShaderErrors = !!opts.glCheck;
    var PAL = PALETTES[params.palette] || PALETTES.meadow; W.palette = PAL;
    renderer.shadowMap.enabled = params.shadows !== 'off';
    renderer.shadowMap.type = params.shadows === 'hard' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    var scene = new THREE.Scene(); W.scene = scene;
    scene.fog = new THREE.Fog(PAL.fog, PAL.fogNear, PAL.fogFar);
    scene.background = new THREE.Color(PAL.fog);
    var camera = new THREE.PerspectiveCamera(params.fov, 16 / 9, 0.1, 500); W.camera = camera;
    var mats = MatKit(THREE); W.mats = mats;
    var R = rng(opts.seed || 7);
    W.rand = R;
    var colliders = []; W.colliders = colliders; var fadeOwners = []; W.fadeOwners = fadeOwners;
    var actors = [], actorById = {}, pickups = [], fx = [], animated = [];
    W.time = 0; var tSteps = 0;

    /* lights */
    var hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, PAL.hemiI); scene.add(hemi);
    var sun = new THREE.DirectionalLight(PAL.sun, PAL.sunI);
    var sunDir = new THREE.Vector3(PAL.sunDir[0], PAL.sunDir[1], PAL.sunDir[2]).normalize();
    sun.castShadow = params.shadows !== 'off';
    var SH = params.shadows === 'hard' ? 1024 : 2048;
    sun.shadow.mapSize.set(SH, SH);
    var sc = sun.shadow.camera; sc.left = -15; sc.right = 15; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.045; if (params.shadows === 'soft') sun.shadow.radius = 3;
    scene.add(sun); scene.add(sun.target); W.sun = sun; W.hemi = hemi;

    /* sky dome with a vertical gradient, sun glow, clouds */
    (function sky() {
      var g = new THREE.SphereGeometry(320, 32, 16), p = g.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
      var top = new THREE.Color(PAL.skyTop), mid = new THREE.Color(PAL.skyMid), hor = new THREE.Color(PAL.horizon);
      for (var i = 0; i < p.count; i++) {
        var y = p.getY(i) / 320;
        if (y > 0.25) col.copy(mid).lerp(top, clamp((y - 0.25) / 0.6, 0, 1)); else col.copy(hor).lerp(mid, clamp((y + 0.02) / 0.27, 0, 1));
        c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      var m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
      m.renderOrder = -10; m.userData.noBounds = true; scene.add(m); W.skyMesh = m;
      var sg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(THREE, 'rgba(255,250,230,1)', 'rgba(255,220,160,0.35)'), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
      sg.scale.set(70, 70, 1); sg.position.copy(sunDir).multiplyScalar(280); sg.renderOrder = -9; scene.add(sg); W.sunGlow = sg;
    })();

    /* ---------------------------------------------------------------------------- colliders and camera blockers */
    function addCollider(c) {
      c.y0 = c.y0 == null ? 0 : c.y0; c.y1 = c.y1 == null ? 2 : c.y1; c.solid = c.solid !== false; c.cam = c.cam !== false;
      if (c.ax != null) { c.type = 's'; } else c.type = 'c';
      colliders.push(c); gridDirty = true; return c;
    }
    W.addCollider = addCollider;
    function distTo(c, x, z) {          // signed distance from point to collider surface (xz)
      if (c.type === 'c') return Math.hypot(x - c.x, z - c.z) - c.r;
      var vx = c.bx - c.ax, vz = c.bz - c.az, L2 = vx * vx + vz * vz || 1, t = clamp(((x - c.ax) * vx + (z - c.az) * vz) / L2, 0, 1);
      return Math.hypot(x - (c.ax + vx * t), z - (c.az + vz * t)) - c.r;
    }
    function pushOut(c, p, rad) {
      var cx, cz;
      if (c.type === 'c') { cx = c.x; cz = c.z; }
      else { var vx = c.bx - c.ax, vz = c.bz - c.az, L2 = vx * vx + vz * vz || 1, t = clamp(((p.x - c.ax) * vx + (p.z - c.az) * vz) / L2, 0, 1); cx = c.ax + vx * t; cz = c.az + vz * t; }
      var dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz), need = c.r + rad;
      if (d < need) { if (d < 1e-6) { dx = 1; dz = 0; d = 1; } p.x = cx + dx / d * need; p.z = cz + dz / d * need; return true; }
      return false;
    }
    W.islandR = 20; W.walkR = 18.6;
    function blockedAt(x, z, rad) {
      if (Math.hypot(x, z) > W.walkR - rad) return true;
      for (var i = 0; i < colliders.length; i++) { var c = colliders[i]; if (c.solid && c.y0 < 1.0 && distTo(c, x, z) < rad) return true; }
      return false;
    }
    W.blockedAt = blockedAt;
    function resolve(p, rad) {
      for (var it = 0; it < 3; it++) for (var i = 0; i < colliders.length; i++) { var c = colliders[i]; if (c.solid && c.y0 < 1.0) pushOut(c, p, rad); }
      var r = Math.hypot(p.x, p.z), lim = W.walkR - rad; if (r > lim) { p.x *= lim / r; p.z *= lim / r; }
    }
    W.resolve = resolve;
    // camera rays: march from points on the hero (head focus, chest, both shoulders) toward the camera; return the
    // shortest blocked distance (or null). The camera keeps 0.4 m clear of props so the near plane never cuts them.
    var _ro = null;
    function rayBlock(o, d, maxD) {
      W._blk = null;
      if (!_ro) _ro = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      var rx = d.z, rz = -d.x, rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
      var h = W.hero ? W.hero.height : 1.7;
      _ro[0].copy(o); _ro[1].set(o.x, o.y - h * 0.32, o.z); _ro[2].set(o.x + rx * 0.35, o.y - h * 0.12, o.z + rz * 0.35); _ro[3].set(o.x - rx * 0.35, o.y - h * 0.12, o.z - rz * 0.35);
      var best = null;
      for (var k = 0; k < 1; k++) {
        var q = _ro[k], lim = best != null ? best : maxD;
        for (var s = 0.5; s <= lim; s += 0.1) {
          var x = q.x + d.x * s, y = q.y + d.y * s, z = q.z + d.z * s, clear = 0.12, hit = false;
          if (y < 0.25 && Math.hypot(x, z) < W.islandR) hit = true;
          // body rays (k > 0) only test tall props (pillars, trunks, walls above the head); the camera passes over low ones
          for (var i = 0; i < colliders.length && !hit; i++) { var c = colliders[i]; if (!c.cam || c.y1 < 2.5 || y < c.y0 - clear || y > c.y1 + clear) continue; if (distTo(c, x, z) < clear) { hit = true; W._blk = (c.prop || 'collider') + ' ray' + k; } }
          if (y < 0.25 && hit && !W._blk) W._blk = 'ground';
          if (hit) { best = s; break; }
        }
      }
      return best;
    }

    /* ---------------------------------------------------------------------------- island, water, background */
    var groundTex = null;
    function buildIsland(o) {
      o = o || {}; var Rr = o.radius || 20; W.islandR = Rr; W.walkR = Rr - 1.4;
      var size = o.texSize || 2048, cv = document.createElement('canvas'); cv.width = cv.height = size;
      var g = cv.getContext('2d'), S = size / (2 * Rr), r = rng(o.seed || 11);
      var X = function (x) { return (x + Rr) * S; }, Z = function (z) { return (z + Rr) * S; };
      W.groundCanvas = cv; W.groundPx = { S: S, X: X, Z: Z, g: g };
      // base grass with layered blotches
      g.fillStyle = PAL.grass[0]; g.fillRect(0, 0, size, size);
      for (var i = 0; i < 2600; i++) {
        var col = PAL.grass[(r() * PAL.grass.length) | 0]; g.globalAlpha = 0.18 + r() * 0.25; g.fillStyle = col;
        var bx = r() * size, bz = r() * size, br = (0.4 + r() * 2.2) * S; g.beginPath(); g.ellipse(bx, bz, br, br * (0.5 + r() * 0.6), r() * 3, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
      // fine blades
      for (i = 0; i < 26000; i++) {
        var x = r() * size, z = r() * size; g.fillStyle = r() < 0.5 ? 'rgba(30,60,20,0.18)' : 'rgba(220,240,160,0.16)'; g.fillRect(x, z, 1.4, 3.2);
      }
      // sandy, rocky rim near the edge
      var rim = g.createRadialGradient(size / 2, size / 2, (Rr - 2.2) * S, size / 2, size / 2, Rr * S);
      rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(0.55, 'rgba(196,178,130,0.55)'); rim.addColorStop(1, 'rgba(150,132,100,0.95)');
      g.fillStyle = rim; g.fillRect(0, 0, size, size);
      W.paint = {
        path: function (pts, width) {     // dirt path through world points [[x,z],...]
          var pass = [[width * 1.25, 'rgba(90,70,40,0.18)'], [width, PAL.dirt], [width * 0.6, 'rgba(210,180,130,0.35)']];
          pass.forEach(function (ps) { g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = ps[1]; g.lineWidth = ps[0] * S; g.beginPath();
            for (var j = 0; j < pts.length; j++) { var px = X(pts[j][0]), pz = Z(pts[j][1]); if (!j) g.moveTo(px, pz); else { var mx = (X(pts[j - 1][0]) + px) / 2, mz = (Z(pts[j - 1][1]) + pz) / 2; g.quadraticCurveTo(X(pts[j - 1][0]), Z(pts[j - 1][1]), mx, mz); } }
            g.lineTo(X(pts[pts.length - 1][0]), Z(pts[pts.length - 1][1])); g.stroke(); });
          for (var j2 = 0; j2 < pts.length - 1; j2++) for (var q = 0; q < 40; q++) {
            var tt = r(), px2 = lerp(pts[j2][0], pts[j2 + 1][0], tt) + (r() - 0.5) * width * 0.8, pz2 = lerp(pts[j2][1], pts[j2 + 1][1], tt) + (r() - 0.5) * width * 0.8;
            g.fillStyle = r() < 0.5 ? 'rgba(120,96,64,0.6)' : 'rgba(225,205,165,0.55)'; g.beginPath(); g.arc(X(px2), Z(pz2), (0.03 + r() * 0.06) * S, 0, TAU); g.fill();
          }
        },
        plaza: function (cx, cz, rIn, rOut) {   // ring-laid flagstones
          g.fillStyle = 'rgba(80,70,55,0.35)'; g.beginPath(); g.arc(X(cx), Z(cz), (rOut + 0.25) * S, 0, TAU); g.fill();
          var ringW = 0.85;
          for (var rr = rIn; rr < rOut; rr += ringW) {
            var n = Math.max(6, Math.round(TAU * (rr + ringW / 2) / 1.1)), off = r() * TAU;
            for (var s = 0; s < n; s++) {
              var a0 = off + s / n * TAU + 0.012, a1 = off + (s + 1) / n * TAU - 0.012, base = new THREE.Color(PAL.stone).multiplyScalar(0.86 + r() * 0.2);
              g.fillStyle = hex(base.getHex()); g.beginPath(); g.arc(X(cx), Z(cz), (rr + ringW - 0.04) * S, a0, a1); g.arc(X(cx), Z(cz), (rr + 0.04) * S, a1, a0, true); g.closePath(); g.fill();
              if (r() < 0.35) { g.fillStyle = 'rgba(110,140,70,0.35)'; var am = (a0 + a1) / 2, rm = rr + ringW * r(); g.beginPath(); g.arc(X(cx + Math.cos(am) * rm), Z(cz + Math.sin(am) * rm), (0.1 + r() * 0.15) * S, 0, TAU); g.fill(); }
            }
          }
          var cg = g.createRadialGradient(X(cx), Z(cz), rIn * S, X(cx), Z(cz), rOut * S); cg.addColorStop(0, 'rgba(255,250,230,0.08)'); cg.addColorStop(1, 'rgba(60,50,30,0.12)');
          g.fillStyle = cg; g.beginPath(); g.arc(X(cx), Z(cz), rOut * S, 0, TAU); g.fill();
        },
        blob: function (cx, cz, rad, color) { var bg = g.createRadialGradient(X(cx), Z(cz), 0, X(cx), Z(cz), rad * S); bg.addColorStop(0, color); bg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = bg; g.beginPath(); g.arc(X(cx), Z(cz), rad * S, 0, TAU); g.fill(); },
        flowers: function (cx, cz, rad, cols, n) { for (var f = 0; f < n; f++) { var a = r() * TAU, d = Math.sqrt(r()) * rad; g.fillStyle = cols[(r() * cols.length) | 0]; g.beginPath(); g.arc(X(cx + Math.cos(a) * d), Z(cz + Math.sin(a) * d), (0.04 + r() * 0.04) * S, 0, TAU); g.fill(); } },
        done: function () { if (groundTex) groundTex.needsUpdate = true; }
      };
      groundTex = new THREE.CanvasTexture(cv); groundTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      // fine detail tiled on top of the painted map so the ground stays crisp near the camera
      var dc = document.createElement('canvas'); dc.width = dc.height = 256; var dg = dc.getContext('2d'), dr = rng(33);
      dg.fillStyle = '#808080'; dg.fillRect(0, 0, 256, 256);
      for (i = 0; i < 2600; i++) { var v = 96 + (dr() * 64) | 0; dg.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; dg.fillRect(dr() * 256, dr() * 256, 1 + dr() * 2, 2 + dr() * 4); }
      var dtex = new THREE.CanvasTexture(dc); dtex.wrapS = dtex.wrapT = THREE.RepeatWrapping;
      var gmat = new THREE.MeshLambertMaterial({ map: groundTex });
      gmat.onBeforeCompile = function (sh) {
        sh.uniforms.uDetail = { value: dtex }; sh.uniforms.uRep = { value: Rr * 2 / 1.5 };
        sh.fragmentShader = 'uniform sampler2D uDetail;\nuniform float uRep;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= 0.55 + 0.9 * texture2D(uDetail, vUv * uRep).r;');
      };
      gmat.customProgramCacheKey = function () { return 'gdna-ground'; };
      var ground = new THREE.Mesh(new THREE.CircleGeometry(Rr, 96), gmat);
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.userData.noBounds = true; scene.add(ground); W.ground = ground;
      // cliffs: open cylinder, jittered below the top ring, tinted rock bands
      var cg = new THREE.CylinderGeometry(Rr, Rr * 0.8, 5, 96, 4, true); cg.translate(0, -2.5, 0);
      jitterGeo(cg, 0.9, 3, 0); cg = tintGeo(THREE, cg, PAL.cliff, null, 5);
      var cliff = new THREE.Mesh(cg, new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 2, specular: 0x000000 }));
      cliff.receiveShadow = true; cliff.userData.noBounds = true; scene.add(cliff);
      // grass lip over the rim
      var lip = new THREE.Mesh(new THREE.TorusGeometry(Rr - 0.05, 0.16, 4, 96), mats.flat(new THREE.Color(PAL.grass[2]).getHex()));
      lip.rotation.x = Math.PI / 2; lip.position.y = -0.04; lip.receiveShadow = true; lip.userData.noBounds = true; scene.add(lip);
      // water with a scrolling ripple texture, foam ring at the waterline
      var wc = document.createElement('canvas'); wc.width = wc.height = 256; var wg = wc.getContext('2d');
      wg.fillStyle = hex(PAL.water); wg.fillRect(0, 0, 256, 256);
      for (i = 0; i < 260; i++) { wg.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(10,40,60,0.10)'; wg.lineWidth = 1 + r() * 2; var wx = r() * 256, wz = r() * 256; wg.beginPath(); wg.moveTo(wx, wz); wg.quadraticCurveTo(wx + 8, wz - 3, wx + 18 + r() * 10, wz); wg.stroke(); }
      var wt = new THREE.CanvasTexture(wc); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(40, 40);
      var water = new THREE.Mesh(new THREE.CircleGeometry(300, 48), new THREE.MeshPhongMaterial({ map: wt, color: 0xffffff, shininess: 60, specular: 0x557788 }));
      water.rotation.x = -Math.PI / 2; water.position.y = -1.3; water.receiveShadow = true; water.userData.noBounds = true; scene.add(water); W.water = water; W.waterTex = wt;
      var foam2 = new THREE.Mesh(new THREE.RingGeometry(Rr * 0.93, Rr * 0.93 + 1.4, 96), new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.35, depthWrite: false }));
      foam2.rotation.x = -Math.PI / 2; foam2.position.y = -1.27; foam2.userData.noBounds = true; scene.add(foam2); W.foam = foam2;
      // distant islands and clouds for depth
      for (i = 0; i < 6; i++) {
        var a = i / 6 * TAU + r() * 0.6, d = 85 + r() * 60, isl = new THREE.Group(), s = 6 + r() * 10;
        var top = new THREE.Mesh(new THREE.CylinderGeometry(s, s * 0.7, s * 0.5, 9), mats.flat(new THREE.Color(PAL.grass[1]).getHex())); top.position.y = s * 0.05; isl.add(top);
        var hill = new THREE.Mesh(jitterGeo(new THREE.IcosahedronGeometry(s * 0.6, 0), s * 0.15, i, null), mats.flat(new THREE.Color(PAL.grass[3]).getHex())); hill.scale.y = 0.6; hill.position.y = s * 0.3; isl.add(hill);
        for (var tq = 0; tq < 5; tq++) { var cn = new THREE.Mesh(new THREE.ConeGeometry(0.9 + r(), 3 + r() * 2, 5), mats.flat(PAL.leaf[tq % PAL.leaf.length])); cn.position.set((r() - 0.5) * s, s * 0.35 + 1.5, (r() - 0.5) * s); isl.add(cn); }
        isl.position.set(Math.cos(a) * d, -1.6, Math.sin(a) * d); isl.userData.noBounds = true; scene.add(isl); (W.distant = W.distant || []).push(isl);
      }
      var clouds = new THREE.Group(); clouds.userData.noBounds = true;
      var cloudMat = new THREE.MeshLambertMaterial({ color: PAL.cloud, emissive: new THREE.Color(PAL.cloud).multiplyScalar(0.35), flatShading: true });
      for (i = 0; i < 14; i++) {
        var cl = new THREE.Group(), cA = r() * TAU, cD = 60 + r() * 110;
        for (var b = 0; b < 4; b++) { var puff = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + r() * 3, 0), cloudMat); puff.position.set(b * 4 - 6 + r() * 2, r() * 2, r() * 3); puff.scale.y = 0.55; cl.add(puff); }
        cl.position.set(Math.cos(cA) * cD, 26 + r() * 22, Math.sin(cA) * cD); cl.userData.speed = 0.3 + r() * 0.5; clouds.add(cl);
      }
      scene.add(clouds); W.clouds = clouds;
      return ground;
    }
    W.buildIsland = buildIsland;

    /* ---------------------------------------------------------------------------- prop builders */
    var instGrass = [];
    function shadowy(o) { o.traverse(function (m) { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }
    var PROPS = {
      tree: function (s, o) {
        var g = new THREE.Group(), lv = o.leaf != null ? o.leaf : PAL.leaf[(R() * PAL.leaf.length) | 0];
        var trunk = new THREE.Mesh(jitterGeo(new THREE.CylinderGeometry(0.2, 0.32, 2.4, 6, 2), 0.06, s * 9, null), mats.flat(PAL.trunk)); trunk.position.y = 1.2; g.add(trunk);
        var root = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 6), mats.flat(PAL.trunk)); root.position.y = 0.2; g.add(root);
        var blobs = o.pine ? [[0, 2.3, 0, 1.6, 2.0], [0, 3.3, 0, 1.25, 1.8], [0, 4.2, 0, 0.85, 1.5]] : [[0, 2.9, 0, 1.45], [0.6, 2.5, 0.3, 1.0], [-0.55, 2.6, -0.25, 1.05], [0.1, 3.7, -0.1, 1.05]];
        blobs.forEach(function (b, i) {
          var geo = o.pine ? new THREE.ConeGeometry(b[3], b[4], 7) : jitterGeo(new THREE.IcosahedronGeometry(b[3], 1), 0.22, s * 13 + i, null);
          var col = new THREE.Color(lv).multiplyScalar(0.9 + 0.08 * i);
          var m = new THREE.Mesh(geo, mats.flat(col.getHex()));
          m.position.set(b[0], b[1], b[2]); if (!o.pine) m.scale.y = 0.86; g.add(m);
        });
        g.userData.col = [{ r: 0.42, h: 2.6, cam: false }, { r: 1.6, y0: 1.7, y1: 4.8, solid: false, cam: false }];   // trees fade, they never push the camera
        return g;
      },
      rock: function (s, o) {
        var geo = tintGeo(THREE, jitterGeo(new THREE.DodecahedronGeometry(0.8, 0), 0.32, s * 7 + (o.v || 0), null), [PAL.stone, PAL.stoneDark, 0xb8ad96], PAL.moss, o.v || 1);
        var m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 3, specular: 0x000000 }));
        m.scale.set(1.1, 0.75, 1); m.position.y = 0.38; var g = new THREE.Group(); g.add(m); g.userData.col = [{ r: 0.85, h: 1.2 }]; return g;
      },
      pillar: function (s, o) {
        var g = new THREE.Group(), h = o.broken ? 1.5 + (o.v || 0) * 0.3 : 3.0;
        var base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.32, 0.95), mats.flat(PAL.stoneDark)); base.position.y = 0.16; g.add(base);
        var sh = new THREE.CylinderGeometry(0.34, 0.38, h, 8, 3); sh.translate(0, h / 2 + 0.3, 0);
        if (o.broken) jitterGeo(sh, 0.12, s * 5, null);
        var shaft = new THREE.Mesh(tintGeo(THREE, sh, [PAL.stone, PAL.stone, PAL.stoneDark], null, 2), new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 3, specular: 0x000000 })); g.add(shaft);
        if (!o.broken) { var capt = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.9), mats.flat(PAL.stone)); capt.position.y = h + 0.44; g.add(capt); }
        else { var chunk = new THREE.Mesh(jitterGeo(new THREE.DodecahedronGeometry(0.32, 0), 0.1, s, null), mats.flat(PAL.stoneDark)); chunk.position.set(0.7, 0.2, 0.3); g.add(chunk); }
        var moss = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.42, 0.25, 8), mats.flat(PAL.moss)); moss.position.y = 0.45; g.add(moss);
        g.userData.col = [{ r: 0.55, h: h + 0.6 }]; return g;
      },
      arch: function (s, o) {
        var g = new THREE.Group(), span = o.span || 3.2;
        [-1, 1].forEach(function (sd) { var p = PROPS.pillar(s, {}); p.position.x = sd * span / 2; g.add(p); });
        var lintel = new THREE.Mesh(new THREE.BoxGeometry(span + 1.3, 0.55, 1.0), mats.flat(PAL.stone)); lintel.position.y = 3.85; g.add(lintel);
        var key = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 1.05), mats.flat(PAL.stoneDark)); key.position.y = 3.9; g.add(key);
        var vine = new THREE.Mesh(jitterGeo(new THREE.IcosahedronGeometry(0.45, 0), 0.15, s, null), mats.flat(PAL.leaf[0])); vine.position.set(span / 2 + 0.4, 3.6, 0.3); g.add(vine);
        g.userData.col = [{ x: -span / 2, z: 0, r: 0.55, h: 3.7 }, { x: span / 2, z: 0, r: 0.55, h: 3.7 }, { ax: -span / 2 - 0.6, az: 0, bx: span / 2 + 0.6, bz: 0, r: 0.5, y0: 3.5, y1: 4.2, solid: false, cam: false }];
        return g;
      },
      wall: function (s, o) {      // o.len along local X
        var g = new THREE.Group(), len = o.len || 4, h = o.h || 1.0, n = Math.max(2, Math.round(len / 0.9));
        for (var i = 0; i < n; i++) {
          var bw = len / n, bh = h * (0.85 + 0.3 * R()), b = new THREE.Mesh(new THREE.BoxGeometry(bw - 0.04, bh, 0.6), mats.flat(new THREE.Color(PAL.stone).multiplyScalar(0.85 + R() * 0.2).getHex()));
          b.position.set(-len / 2 + bw * (i + 0.5), bh / 2, (R() - 0.5) * 0.06); b.rotation.y = (R() - 0.5) * 0.05; g.add(b);
          if (R() < 0.4) { var mo = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.7, 0.08, 0.62), mats.flat(PAL.moss)); mo.position.set(b.position.x, bh + 0.02, 0); g.add(mo); }
        }
        g.userData.col = [{ ax: -len / 2, az: 0, bx: len / 2, bz: 0, r: 0.38, h: h + 0.2 }]; return g;
      },
      fountain: function (s, o) {
        var g = new THREE.Group();
        var basin = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.55, 12), mats.flat(PAL.stone)); basin.position.y = 0.27; g.add(basin);
        var rimm = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.12, 4, 12), mats.flat(PAL.stoneDark)); rimm.rotation.x = Math.PI / 2; rimm.position.y = 0.56; g.add(rimm);
        var wat = new THREE.Mesh(new THREE.CircleGeometry(1.35, 12), new THREE.MeshPhongMaterial({ color: PAL.water, shininess: 80, specular: 0x88aacc, emissive: 0x0a2a3a })); wat.rotation.x = -Math.PI / 2; wat.position.y = 0.5; g.add(wat);
        var col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.2, 8), mats.flat(PAL.stone)); col.position.y = 1.0; g.add(col);
        var bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.25, 0.3, 10), mats.flat(PAL.stone)); bowl.position.y = 1.65; g.add(bowl);
        var spout = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), new THREE.MeshPhongMaterial({ color: 0xcfefff, transparent: true, opacity: 0.7, emissive: 0x335566 })); spout.position.y = 2.0; g.add(spout); spout.userData.noBounds = true;
        g.userData.col = [{ r: 1.65, h: 1.9 }]; return g;
      },
      lantern: function (s, o) {
        var g = new THREE.Group();
        var post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.0, 6), mats.flat(0x4a3a2c)); post.position.y = 1.0; g.add(post);
        var arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), mats.flat(0x4a3a2c)); arm.position.set(0.22, 1.95, 0); g.add(arm);
        var cage = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), mats.flat(0x3a2e24)); cage.position.set(0.42, 1.74, 0); g.add(cage);
        var glass = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.24, 0.24), new THREE.MeshBasicMaterial({ color: 0xffd27a })); glass.position.set(0.42, 1.74, 0); g.add(glass);
        var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(THREE, 'rgba(255,220,140,1)', 'rgba(255,170,80,0.3)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: PAL.lampI }));
        glow.scale.set(1.3, 1.3, 1); glow.position.set(0.42, 1.74, 0); glow.userData.noBounds = true; g.add(glow);
        g.userData.col = [{ r: 0.18, h: 2.0 }]; return g;
      },
      crate: function (s, o) {
        var g = new THREE.Group(), sz = o.size || 0.75;
        var b = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), mats.flat(0xa8743e)); b.position.y = sz / 2; g.add(b);
        [[0, sz / 2, sz / 2 + 0.005], [0, sz / 2, -sz / 2 - 0.005]].forEach(function (p) { var bar = new THREE.Mesh(new THREE.BoxGeometry(sz * 1.0, 0.08, 0.02), mats.flat(0x6e4826)); bar.position.set(p[0], p[1], p[2]); bar.rotation.z = 0.78; g.add(bar); });
        var top = new THREE.Mesh(new THREE.BoxGeometry(sz + 0.04, 0.06, sz + 0.04), mats.flat(0x6e4826)); top.position.y = sz; g.add(top);
        g.userData.col = [{ r: sz * 0.7, h: sz }]; return g;
      },
      barrel: function (s, o) {
        var g = new THREE.Group();
        var b = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 10), mats.flat(0x9a6438)); b.position.y = 0.45; b.scale.set(1, 1, 1); g.add(b);
        [0.15, 0.75].forEach(function (y) { var band = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 10), mats.flat(0x4a4a50)); band.position.y = y; g.add(band); });
        g.userData.col = [{ r: 0.42, h: 0.9 }]; return g;
      },
      bush: function (s, o) {
        var g = new THREE.Group(), lv = o.leaf != null ? o.leaf : PAL.leaf[(R() * PAL.leaf.length) | 0];
        for (var i = 0; i < 3; i++) { var m = new THREE.Mesh(jitterGeo(new THREE.IcosahedronGeometry(0.55 - i * 0.08, 1), 0.15, s * 3 + i, null), mats.flat(new THREE.Color(lv).multiplyScalar(0.92 + i * 0.06).getHex())); m.position.set((i - 1) * 0.45, 0.4, (i % 2) * 0.25); m.scale.y = 0.8; g.add(m); }
        if (o.berries) for (var j = 0; j < 6; j++) { var be = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), mats.flat(0xd8344a)); be.position.set((R() - 0.5) * 1.2, 0.4 + R() * 0.4, 0.3 + R() * 0.2); g.add(be); }
        g.userData.col = [{ r: 0.75, h: 0.9 }]; return g;
      },
      stall: function (s, o) {
        var g = new THREE.Group();
        [[-1.1, -0.7], [1.1, -0.7], [-1.1, 0.7], [1.1, 0.7]].forEach(function (p, i) { var h = i < 2 ? 2.3 : 2.0, post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, h, 6), mats.flat(0x6a4a30)); post.position.set(p[0], h / 2, p[1]); g.add(post); });
        var tc = document.createElement('canvas'); tc.width = 64; tc.height = 8; var tg = tc.getContext('2d');
        for (var i = 0; i < 8; i++) { tg.fillStyle = i % 2 ? '#f2e6cc' : (o.cloth || '#c8463c'); tg.fillRect(i * 8, 0, 8, 8); }
        var tt = new THREE.CanvasTexture(tc); tt.magFilter = THREE.NearestFilter;
        var roof = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.05, 1.9), new THREE.MeshLambertMaterial({ map: tt })); roof.position.set(0, 2.2, 0); roof.rotation.x = 0.16; g.add(roof);
        var counter = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.85, 0.6), mats.flat(0x8a5a34)); counter.position.set(0, 0.43, 0.55); g.add(counter);
        var cloth = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.1, 0.62), mats.flat(0xe9d9a8)); cloth.position.set(0, 0.88, 0.55); g.add(cloth);
        for (var f = 0; f < 5; f++) { var fruit = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), mats.flat([0xe04a3a, 0xf0b030, 0x7ab84a][f % 3])); fruit.position.set(-0.8 + f * 0.4, 1.0, 0.55); g.add(fruit); }
        g.userData.col = [{ ax: -1.2, az: 0, bx: 1.2, bz: 0, r: 0.95, h: 2.4 }]; return g;
      },
      beacon: function (s, o) {
        var g = new THREE.Group();
        [[2.4, 0.25], [1.8, 0.5], [1.2, 0.75]].forEach(function (st) { var m = new THREE.Mesh(new THREE.CylinderGeometry(st[0], st[0] + 0.1, 0.25, 12), mats.flat(new THREE.Color(PAL.stone).multiplyScalar(0.96).getHex())); m.position.y = st[1] - 0.125; g.add(m); });
        var ob = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.55, 3.0, 6), mats.flat(PAL.stoneDark)); ob.position.y = 0.75 + 1.5; g.add(ob);
        var bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.35, 0.4, 8), mats.flat(0x6a5a48)); bowl.position.y = 3.95; g.add(bowl);
        var cry = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshPhongMaterial({ color: 0x8a8070, flatShading: true, emissive: 0x000000, shininess: 40 }));
        cry.position.y = 4.55; cry.scale.y = 1.5; g.add(cry); g.userData.crystal = cry;
        var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(THREE, 'rgba(255,236,170,1)', 'rgba(255,170,60,0.4)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
        glow.scale.set(5, 5, 1); glow.position.y = 4.55; glow.userData.noBounds = true; g.add(glow); g.userData.glow = glow;
        g.userData.col = [{ r: 0.75, h: 4.8 }, { r: 2.0, h: 0.3, cam: false }];
        return g;
      }
    };
    W.PROPS = PROPS;
    function addProp(spec) {
      var f = PROPS[spec.kind]; if (!f) return null;
      var s = spec.s || 1, o = f(spec.seed || (spec.x * 13.1 + spec.z * 7.7) || 1, spec);
      o.position.set(spec.x || 0, 0, spec.z || 0); o.rotation.y = spec.rot || 0; o.scale.setScalar(s);
      shadowy(o); scene.add(o);
      var fadeU = [];
      o.traverse(function (m) { if (m.isMesh && m.material && !m.material.isSpriteMaterial && !m.userData.noBounds) { m.material = ditherable(m.material.clone()); fadeU.push(m.material.userData.fadeU); } });
      var owner = { obj: o, fadeU: fadeU, k: 1, cols: [] }; fadeOwners.push(owner);
      var cs = Math.cos(spec.rot || 0), sn = Math.sin(spec.rot || 0);
      function tx(lx, lz) { return [spec.x + (lx * cs + lz * sn) * s, spec.z + (-lx * sn + lz * cs) * s]; }
      (o.userData.col || []).forEach(function (c) {
        var cc = { solid: c.solid, cam: c.cam, owner: owner, y0: (c.y0 || 0) * s, y1: (c.y1 != null ? c.y1 : c.h) * s, r: c.r * s, prop: spec.kind };
        if (c.ax != null) { var a = tx(c.ax, c.az), b = tx(c.bx, c.bz); cc.ax = a[0]; cc.az = a[1]; cc.bx = b[0]; cc.bz = b[1]; }
        else { var p = tx(c.x || 0, c.z || 0); cc.x = p[0]; cc.z = p[1]; }
        owner.cols.push(addCollider(cc));
      });
      o.userData.spec = spec; return o;
    }
    W.addProp = addProp;
    function buildLayout(list) { return list.map(addProp); }
    W.buildLayout = buildLayout;
    // instanced grass tufts and flowers (no colliders); skips solid colliders and paths given as avoid(x,z)
    W.scatter = function (o) {
      o = o || {}; var n = o.count || 900, cone = new THREE.ConeGeometry(0.045, 0.24, 3); cone.translate(0, 0.12, 0);
      var mat = new THREE.MeshLambertMaterial({ color: 0xffffff }), im = new THREE.InstancedMesh(cone, mat, n * 3), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color(), placed = 0, sR = rng(o.seed || 21);
      for (var i = 0; i < n * 6 && placed < n; i++) {
        var a = sR() * TAU, d = Math.sqrt(sR()) * (W.islandR - 1.2), x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (o.avoid && o.avoid(x, z)) continue; if (blockedAt(x, z, 0.2)) continue;
        for (var b = 0; b < 3; b++) {
          e.set((sR() - 0.5) * 0.5, sR() * TAU, (sR() - 0.5) * 0.5); q.setFromEuler(e); var sc2 = 0.6 + sR() * 0.5;
          m4.compose(new THREE.Vector3(x + (sR() - 0.5) * 0.25, 0, z + (sR() - 0.5) * 0.25), q, new THREE.Vector3(sc2, sc2 * (0.8 + sR() * 0.5), sc2));
          im.setMatrixAt(placed * 3 + b, m4); col.set(PAL.grass[(sR() * PAL.grass.length) | 0]).multiplyScalar(0.85 + sR() * 0.3); im.setColorAt(placed * 3 + b, col);
        }
        placed++;
      }
      im.count = placed * 3; im.receiveShadow = true; im.userData.noBounds = true; scene.add(im); instGrass.push(im);
      if (o.flowers) {
        var fg = new THREE.IcosahedronGeometry(0.05, 0); fg.translate(0, 0.2, 0);
        var fm = new THREE.InstancedMesh(fg, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x222222 }), o.flowers), fp = 0;
        for (i = 0; i < o.flowers * 6 && fp < o.flowers; i++) {
          var a2 = sR() * TAU, d2 = Math.sqrt(sR()) * (W.islandR - 1.5), x2 = Math.cos(a2) * d2, z2 = Math.sin(a2) * d2;
          if ((o.avoid && o.avoid(x2, z2)) || blockedAt(x2, z2, 0.2)) continue;
          m4.compose(new THREE.Vector3(x2, 0, z2), q.identity(), new THREE.Vector3(1, 1, 1)); fm.setMatrixAt(fp, m4);
          col.set(['#f6f0e0', '#f2c84a', '#e86a8a', '#b48ae6'][(sR() * 4) | 0]); fm.setColorAt(fp, col); fp++;
        }
        fm.count = fp; fm.userData.noBounds = true; scene.add(fm);
      }
      return im;
    };

    /* ---------------------------------------------------------------------------- actors */
    var blobTex = null;
    function addActor(o) {
      o = o || {};
      var built = o.obj ? null : buildAdventurer(THREE, mats, o.look || { base: o.kind === 'npc' ? 'keeper' : 'hero', gear: params.gear });
      var root3 = new THREE.Group(); root3.name = 'actor:' + o.id; scene.add(root3);
      var model = o.obj || built.model; root3.add(model);
      // auto-scale by bounding box: neutral pose, scale to height, feet to y = 0
      var h = num(o.height, o.kind === 'npc' ? params.heroHeight * 1.0 : params.heroHeight);
      if (built) poseAdventurer(built.parts, { amp: 0, phase: 0, run: 0, time: 0, robe: built.robe, headPitch: 0, headYaw: 0, capeAngle: 0.08, gesture: null, gestureW: 0 });
      model.scale.setScalar(1); model.position.set(0, 0, 0); root3.position.set(0, 0, 0); root3.rotation.set(0, 0, 0);
      var box = worldBox(THREE, model), sz = box.max.y - box.min.y || 1, s = h / sz;
      model.scale.setScalar(s); model.position.y = -box.min.y * s;
      if (!blobTex) blobTex = glowTexture(THREE, 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.28)');
      var blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
      blob.rotation.x = -Math.PI / 2; blob.position.y = 0.015; blob.scale.setScalar(h * 0.55); blob.userData.noBounds = true; blob.renderOrder = 1; root3.add(blob);
      var a = {
        id: o.id, kind: o.kind || 'hero', root: root3, model: model, parts: built && built.parts, built: built, scale: s, height: h,
        x: num(o.x, 0), z: num(o.z, 0), vx: 0, vz: 0, speed: 0, yaw: num(o.yaw, 0), phase: 0, amp: 0, run: 0, travelled: 0,
        radius: num(o.radius, 0.34) * h / 1.7, target: o.target || null, moveTarget: null, gesture: null, gestureW: 0, headYaw: 0, headPitch: 0, capeAngle: 0.1, capeVel: 0,
        feetY: 0, legLen: (built ? built.legLen : 0.8) * s, facesMove: true, moveDir: [0, 0], lastMove: [0, 0], walkSpeed: o.walkSpeed || params.walkSpeed * 0.8,
        stateExtra: o.stateExtra || null, desired: null,
        play: function (g) { this.gesture = g || null; },
        lookAt: function (id) { this.target = id; }
      };
      a.root.position.set(a.x, 0, a.z); a.root.rotation.y = a.yaw;
      actors.push(a); actorById[a.id] = a; ground(a); return a;
    }
    W.addActor = addActor;
    W.actor = function (id) { return actorById[id] || null; };
    W.actors = function () { return actors.slice(); };
    W.removeActor = function (id) { var a = actorById[id]; if (!a) return; scene.remove(a.root); actors.splice(actors.indexOf(a), 1); delete actorById[id]; };
    W.setTarget = function (id, tid) { var a = actorById[id]; if (a) a.target = tid; };
    function ground(a) {
      // feet on y = 0 in every pose: lowest vertex of the posed model -> shift the body
      if (!a.parts) return;
      a.parts.body.position.y = 0; a.root.position.y = 0;
      var my = minWorldY(THREE, a.model);
      a.parts.body.position.y = -my / a.scale;
      a.root.updateMatrixWorld(true);
      a.feetY = minWorldY(THREE, a.model);
    }

    function animate(a, dist, dt) {
      if (!a.parts) return;
      var walkS = params.walkSpeed, runS = Math.max(walkS + 0.1, params.runSpeed);
      var sp = a.speed, w = clamp(sp / walkS, 0, 1), rn = clamp((sp - walkS) / (runS - walkS), 0, 1);
      var ampT = 0.5 * w + 0.32 * rn;                 // hip swing amplitude (rad): walk 0.5, run 0.82
      a.amp = ampT; a.run = lerp(a.run, rn, 1 - Math.exp(-dt * 10));
      var stride = 4 * a.legLen * Math.sin(Math.max(ampT, 0.08));   // distance per gait cycle: foot planted during stance
      if (dist > 0) a.phase += TAU * dist / stride;
      a.travelled += dist;
      // cape: spring toward a speed-dependent angle
      var capeT = 0.1 + 0.42 * clamp(sp / runS, 0, 1) + 0.04 * Math.sin(W.time * 2.3 + a.x);
      a.capeVel += ((capeT - a.capeAngle) * 60 - a.capeVel * 9) * dt; a.capeAngle += a.capeVel * dt;
      if (a.gesture === 'wave' && a.gestureW === 0) {     // pick the arm on the camera's side when the wave starts
        var fy = a.yaw - FACING_OFFSET; a.waveLeft = ((camera.position.x - a.x) * -Math.cos(fy) + (camera.position.z - a.z) * Math.sin(fy)) < 0;
      }
      a.gestureW = clamp(a.gestureW + (a.gesture ? dt * 5 : -dt * 5), 0, 1); if (!a.gesture && a.gestureW === 0) a.gestureLast = null; if (a.gesture) a.gestureLast = a.gesture;
      poseAdventurer(a.parts, { amp: a.amp, phase: a.phase, run: a.run, time: W.time + a.id.length, robe: a.built.robe, headPitch: a.headPitch, headYaw: a.headYaw,
        capeAngle: a.capeAngle, gesture: a.gesture || a.gestureLast, gestureW: a.gestureW, waveLeft: !!a.waveLeft });
      ground(a);
    }

    function faceYaw(a, vx, vz, dt, rate) {
      var want = Math.atan2(vx, vz) + FACING_OFFSET;
      var d = angDiff(a.yaw, want), mx = rate * dt;
      a.yaw += Math.abs(d) <= mx ? d : Math.sign(d) * mx;
    }
    W.faceYaw = faceYaw;

    /* ---------------------------------------------------------------------------- pickups */
    var shardTex = null;
    function addPickup(o) {
      if (!shardTex) shardTex = glowTexture(THREE, 'rgba(255,240,180,1)', 'rgba(255,190,70,0.35)');
      var g = new THREE.Group(); g.position.set(o.x, 0, o.z);
      var color = o.color || 0xffc94a;
      var gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), new THREE.MeshPhongMaterial({ color: color, emissive: new THREE.Color(color).multiplyScalar(0.55), flatShading: true, shininess: 90, specular: 0xffffff }));
      gem.scale.y = 1.6; gem.castShadow = true; g.add(gem);
      var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: shardTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
      glow.scale.set(1.5, 1.5, 1); g.add(glow);
      var ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 24), new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.55, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
      var spark = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), new THREE.MeshBasicMaterial({ map: shardTex, transparent: true, depthWrite: false, opacity: 0.5, blending: THREE.AdditiveBlending }));
      spark.rotation.x = -Math.PI / 2; spark.position.y = 0.025; g.add(spark);
      g.traverse(function (m) { m.userData.noBounds = true; });
      scene.add(g);
      var p = { id: o.id, x: o.x, z: o.z, kind: o.kind || 'shard', value: o.value || 1, taken: false, obj: g, gem: gem, glow: glow, ring: ring, radius: o.radius || 0.95, phase: (o.x * 1.3 + o.z) % TAU };
      pickups.push(p); return p;
    }
    W.addPickup = addPickup;
    W.pickups = function () { return pickups.slice(); };
    function burst(x, y, z, color, n) {
      if (!shardTex) shardTex = glowTexture(THREE, 'rgba(255,240,180,1)', 'rgba(255,190,70,0.35)');
      for (var i = 0; i < (n || 14); i++) {
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: shardTex, color: color || 0xffe6a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        var a = i / (n || 14) * TAU, up = 0.8 + (i % 3) * 0.5; sp.position.set(x, y, z); sp.scale.setScalar(0.5); sp.userData.noBounds = true; scene.add(sp);
        fx.push({ o: sp, vx: Math.cos(a) * 2.2, vy: up * 2.2, vz: Math.sin(a) * 2.2, life: 0.9, age: 0 });
      }
      var ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 32), new THREE.MeshBasicMaterial({ color: color || 0xffe6a0, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.05, z); scene.add(ring); fx.push({ o: ring, ring: true, life: 0.7, age: 0 });
    }
    W.burst = burst;

    /* ---------------------------------------------------------------------------- camera */
    var cam = { lift: 0, distMul: 1, yaw: Math.PI, pitch: params.camPitch * Math.PI / 180, dist: params.camDist, focus: new THREE.Vector3(0, 1.4, 0), lastManual: -99, blocked: false, init: false };
    W.cam = cam;
    function camDir(out) { var cp = Math.cos(cam.pitch); return out.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp); }
    var _d = new THREE.Vector3(), _t = new THREE.Vector3();
    function updateCamera(dt, snap) {
      var hero = W.hero; if (!hero) return;
      _t.set(hero.x, hero.height * 0.8 + cam.lift, hero.z);
      if (snap || !cam.init) { cam.focus.copy(_t); cam.init = true; }
      else cam.focus.lerp(_t, 1 - Math.exp(-dt / Math.max(0.01, params.camLag)));
      cam.pitch = clamp(cam.pitch, 0.05, 1.2);
      // lazy auto-align behind the hero while it moves (not while the player turns the camera, not when it runs at the camera)
      if (params.autoAlign > 0 && hero.speed > 0.4 && W.time - cam.lastManual > 1.2) {
        var behind = Math.atan2(hero.vx, hero.vz) + Math.PI, d = angDiff(cam.yaw, behind);
        if (Math.abs(d) < 2.2) cam.yaw += d * clamp(params.autoAlign * dt * (hero.speed / params.runSpeed) * (W.inputFwd == null ? 1 : W.inputFwd), 0, 1);
      }
      camDir(_d);
      // props BETWEEN the camera and the hero fade (below); the camera only moves in when its own position would be
      // inside or within 0.4 m of a tall prop (pillar, arch post, beacon), so it never hugs scenery it could see past
      var want = params.camDist * cam.distMul, hit = null, allowed = want; W._blk = null;
      // keep the camera itself 0.4 m clear of props (the near plane must not cut into them)
      for (var guard = 0; guard < 60 && allowed > 1.6; guard++) {
        var px = cam.focus.x + _d.x * allowed, py = cam.focus.y + _d.y * allowed, pz = cam.focus.z + _d.z * allowed, near = false;
        for (var ci = 0; ci < colliders.length && !near; ci++) { var cc = colliders[ci]; if (cc.cam && cc.y1 >= 2.5 && py > cc.y0 - 0.4 && py < cc.y1 + 0.4 && distTo(cc, px, pz) < 0.4) { near = true; break; } }
        if (!near) break; allowed -= 0.1; hit = allowed; W._blk = cc.prop || 'collider';
      }
      cam.blocked = hit != null && hit < want + 0.2;
      if (snap) cam.dist = allowed;
      else if (allowed < cam.dist) cam.dist = allowed; else cam.dist += (allowed - cam.dist) * (1 - Math.exp(-dt / 0.4));
      // pulled in -> look down more steeply so the camera rises over what is behind the hero
      var pull = clamp(1 - cam.dist / Math.max(0.1, want), 0, 1), cpp = Math.cos(cam.pitch + 0.3 * pull);
      _d.set(Math.sin(cam.yaw) * cpp, Math.sin(cam.pitch + 0.3 * pull), Math.cos(cam.yaw) * cpp);
      camera.position.copy(cam.focus).addScaledVector(_d, cam.dist);
      if (camera.position.y < 0.45) camera.position.y = 0.45;
      camera.lookAt(cam.focus);
      // props between the camera and the hero's body, or within 1 m of the camera, fade (ordered dither) instead of
      // hiding the hero; they come back when clear
      var cxp = camera.position.x, cyp = camera.position.y, czp = camera.position.z;
      for (var oi = 0; oi < fadeOwners.length; oi++) {
        var ow = fadeOwners[oi], occ = false, nearK = 1;
        for (var ci2 = 0; ci2 < ow.cols.length; ci2++) {
          var c = ow.cols[ci2];
          // near the camera: 0 % coverage at <= 0.8 m, 15 % at 2 m, back to solid at 3 m (continuous, no popping)
          if (cyp > c.y0 - 1.5 && cyp < c.y1 + 1.5) {
            var dc2 = distTo(c, cxp, czp);
            if (dc2 < 3.0) nearK = Math.min(nearK, dc2 <= 2.0 ? 0.15 * clamp((dc2 - 0.8) / 1.2, 0, 1) : 0.15 + 0.85 * (dc2 - 2.0));
          }
          if (occ) continue;
          for (var hh = 0; hh < 3 && !occ; hh++) {
            var ty = hero.height * (0.25 + 0.35 * hh);
            for (var k = 1; k < 14; k++) {
              var t = k / 14, x = lerp(cxp, hero.x, t), y = lerp(cyp, ty, t), z = lerp(czp, hero.z, t);
              if (y > c.y0 && y < c.y1 && distTo(c, x, z) < 0.05) { occ = true; break; }
            }
          }
        }
        var wantK = Math.min(nearK, occ ? 0.12 : 1);   // between camera and hero: 12 % coverage
        ow.k = snap ? wantK : ow.k + (wantK - ow.k) * (1 - Math.exp(-dt / (wantK < ow.k ? 0.05 : 0.15))); // out fast, back slower
        if (ow.k > 0.995) ow.k = 1;
        for (var fi = 0; fi < ow.fadeU.length; fi++) ow.fadeU[fi].value = ow.k;
      }
    }
    // free camera distance if the camera sat at yaw (and pitch): for picking a clear framing angle
    W.probeCamera = function (yaw, pitch) {
      var cp = Math.cos(pitch == null ? cam.pitch : pitch), d = new THREE.Vector3(Math.sin(yaw) * cp, Math.sin(pitch == null ? cam.pitch : pitch), Math.cos(yaw) * cp);
      var h = rayBlock(cam.focus, d, params.camDist + 0.3); return h == null ? params.camDist : h - 0.35;
    };
    W.rotateCamera = function (dYaw, dPitch) { cam.yaw += dYaw || 0; cam.pitch = clamp(cam.pitch + (dPitch || 0), 0.05, 1.2); if (dYaw || dPitch) cam.lastManual = W.time; };
    W.camInfo = function () { return { yaw: +cam.yaw.toFixed(3), pitch: +cam.pitch.toFixed(3), dist: +cam.dist.toFixed(2), wantDist: params.camDist, blocked: cam.blocked, blocker: cam.blocked ? W._blk : null, x: +camera.position.x.toFixed(2), y: +camera.position.y.toFixed(2), z: +camera.position.z.toFixed(2) }; };
    W.snapCamera = function (yaw) { if (yaw != null) cam.yaw = yaw; updateCamera(DT, true); };

    /* ---------------------------------------------------------------------------- path grid (A*) and autopilot */
    var grid = null, gridDirty = true, GC = 0.5;
    function buildGrid() {
      var n = Math.ceil(W.islandR * 2 / GC), cells = new Uint8Array(n * n), rad = 0.42;
      for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) { var x = -W.islandR + (i + 0.5) * GC, z = -W.islandR + (j + 0.5) * GC; cells[j * n + i] = blockedAt(x, z, rad) ? 1 : 0; }
      grid = { n: n, cells: cells }; gridDirty = false;
    }
    function cellOf(x, z) { return [clamp(Math.floor((x + W.islandR) / GC), 0, grid.n - 1), clamp(Math.floor((z + W.islandR) / GC), 0, grid.n - 1)]; }
    function lineFree(ax, az, bx, bz) { var d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.2); for (var i = 1; i <= n; i++) { var t = i / n; if (blockedAt(ax + (bx - ax) * t, az + (bz - az) * t, 0.4)) return false; } return true; }
    function nearestFree(c) {
      var n = grid.n; if (!grid.cells[c[1] * n + c[0]]) return c;
      for (var r = 1; r < 12; r++) for (var dj = -r; dj <= r; dj++) for (var di = -r; di <= r; di++) { var i = c[0] + di, j = c[1] + dj; if (i >= 0 && j >= 0 && i < n && j < n && !grid.cells[j * n + i]) return [i, j]; }
      return c;
    }
    function findPath(sx, sz, gx, gz) {
      if (gridDirty || !grid) buildGrid();
      var n = grid.n, s = nearestFree(cellOf(sx, sz)), g = nearestFree(cellOf(gx, gz)), N = n * n;
      var gs = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N), heap = [];
      var si = s[1] * n + s[0], gi = g[1] * n + g[0]; gs[si] = 0;
      function h(i) { var x = i % n, y = (i / n) | 0; return Math.hypot(x - g[0], y - g[1]); }
      function push(i, f) { heap.push([f, i]); var k = heap.length - 1; while (k > 0) { var p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; var t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; } }
      function pop() { var top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; var k = 0; for (;;) { var l = 2 * k + 1, r = l + 1, m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; var t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m; } } return top; }
      push(si, h(si)); var found = false, guard = 0;
      while (heap.length && guard++ < N * 2) {
        var cur = pop()[1]; if (closed[cur]) continue; closed[cur] = 1; if (cur === gi) { found = true; break; }
        var cx = cur % n, cy = (cur / n) | 0;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue; var nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
          var ni = ny * n + nx; if (grid.cells[ni] || closed[ni]) continue;
          if (dx && dy && (grid.cells[cy * n + nx] || grid.cells[ny * n + cx])) continue;
          var ng = gs[cur] + (dx && dy ? 1.4142 : 1); if (ng < gs[ni]) { gs[ni] = ng; from[ni] = cur; push(ni, ng + h(ni)); }
        }
      }
      var pts = [[gx, gz]];
      if (found) { var c = from[gi]; while (c >= 0 && c !== si) { pts.push([-W.islandR + (c % n + 0.5) * GC, -W.islandR + (((c / n) | 0) + 0.5) * GC]); c = from[c]; } }
      pts.reverse();
      // string-pull: drop waypoints visible from the previous kept point
      var out = [], px = sx, pz = sz, i = 0;
      while (i < pts.length) { var j = pts.length - 1; while (j > i && !lineFree(px, pz, pts[j][0], pts[j][1])) j--; out.push(pts[j]); px = pts[j][0]; pz = pts[j][1]; i = j + 1; }
      return out;
    }
    W.findPath = findPath;
    var ap = { goal: null, path: null, age: 0 };
    // returns camera-relative input {x, y, run} that walks the hero to goal {x, z}; arrived when within `near`
    W.autopilot = function (goal, o) {
      o = o || {}; var hero = W.hero; if (!hero || !goal) return { x: 0, y: 0, run: false, arrived: false };
      var near = o.near || 0.6, dGoal = Math.hypot(goal.x - hero.x, goal.z - hero.z);
      if (dGoal < near) { ap.goal = null; return { x: 0, y: 0, run: false, arrived: true }; }
      if (!ap.goal || ap.goal.x !== goal.x || ap.goal.z !== goal.z || !ap.path || ap.age++ > 90) { ap.goal = { x: goal.x, z: goal.z }; ap.path = findPath(hero.x, hero.z, goal.x, goal.z); ap.age = 0; }
      while (ap.path.length > 1 && Math.hypot(ap.path[0][0] - hero.x, ap.path[0][1] - hero.z) < 0.5) ap.path.shift();
      var wp = ap.path[0] || [goal.x, goal.z], vx = wp[0] - hero.x, vz = wp[1] - hero.z, d = Math.hypot(vx, vz) || 1;
      vx /= d; vz /= d;
      // world direction -> camera-relative stick (inverse of the camera basis used in step())
      var fwX = -Math.sin(cam.yaw), fwZ = -Math.cos(cam.yaw), rgX = Math.cos(cam.yaw), rgZ = -Math.sin(cam.yaw);
      var run = o.run != null ? o.run : dGoal > 2.5;
      return { x: vx * rgX + vz * rgZ, y: vx * fwX + vz * fwZ, run: run, arrived: false, wp: wp };
    };

    /* ---------------------------------------------------------------------------- step */
    var hooks = [];
    W.onStep = function (fn) { hooks.push(fn); };
    W.step = function (input, dt) {
      dt = dt || DT; input = input || {}; W.time += dt; tSteps++;
      var hero = W.hero;
      if (input.camYaw || input.camPitch) W.rotateCamera(input.camYaw || 0, input.camPitch || 0);
      if (hero) {
        // camera-relative input -> world velocity
        var ix = num(input.x, 0), iy = num(input.y, 0), mag = Math.min(1, Math.hypot(ix, iy));
        var fwX = -Math.sin(cam.yaw), fwZ = -Math.cos(cam.yaw), rgX = Math.cos(cam.yaw), rgZ = -Math.sin(cam.yaw);
        var wx = fwX * iy + rgX * ix, wz = fwZ * iy + rgZ * ix, wl = Math.hypot(wx, wz);
        W.inputFwd = mag > 0.05 ? Math.max(0, iy / mag) : 0;   // how much of the stick points away from the camera (auto-align)
        var run = input.run != null ? !!input.run : mag > 0.85;
        var top = mag < 0.05 ? 0 : (run ? params.runSpeed : params.walkSpeed) * (input.run != null ? 1 : clamp(mag / 0.85, 0.35, 1));
        // the body turns toward the input at turnRate; speed builds along the body's facing, scaled down while the
        // turn is large, so the hero pivots instead of sliding sideways or backwards
        if (wl > 1e-6 && top > 0) {
          faceYaw(hero, wx, wz, dt, params.turnRate);
          var off = Math.abs(angDiff(hero.yaw, Math.atan2(wx, wz) + FACING_OFFSET));
          top *= clamp((Math.cos(off) - 0.15) / 0.85, 0, 1);
        }
        var cur = hero.speedCmd || 0, acc = params.accel * dt;
        cur += clamp(top - cur, -acc, acc); hero.speedCmd = cur;
        var hy = hero.yaw - FACING_OFFSET;
        hero.vx = Math.sin(hy) * cur; hero.vz = Math.cos(hy) * cur;
        hero.selfFacing = true;
        moveActor(hero, dt, cur > 0.01 ? [hero.vx, hero.vz] : null);
      }
      // other actors: scripted walk targets, turn to look targets
      for (var i = 0; i < actors.length; i++) {
        var a = actors[i]; if (a === hero) continue;
        if (a.desired) {
          var dx = a.desired.x - a.x, dz = a.desired.z - a.z, dd = Math.hypot(dx, dz), spd = a.desired.speed || a.walkSpeed;
          if (dd < 0.15) { a.desired = null; a.vx = a.vz = 0; } else { var vv = Math.min(spd, dd * 4); a.vx = dx / dd * vv; a.vz = dz / dd * vv; }
        } else if (!a.external) { a.vx *= 0.8; a.vz *= 0.8; if (Math.hypot(a.vx, a.vz) < 0.05) a.vx = a.vz = 0; }
        if (!a.external) moveActor(a, dt, a.desired ? [a.vx, a.vz] : null);
      }
      // pickups
      for (i = 0; i < pickups.length; i++) {
        var p = pickups[i]; if (p.taken) continue;
        p.phase += dt * 2.2; p.gem.position.y = 1.0 + Math.sin(p.phase) * 0.12; p.gem.rotation.y += dt * 1.6; p.glow.position.y = p.gem.position.y;
        p.ring.scale.setScalar(1 + 0.08 * Math.sin(p.phase * 1.5));
        if (hero && Math.hypot(hero.x - p.x, hero.z - p.z) < p.radius) {
          p.taken = true; p.obj.visible = false; burst(p.x, 1.0, p.z, 0xffe08a, 16); onEvent({ type: 'pickup', id: p.id, kind: p.kind, value: p.value, x: p.x, z: p.z });
        }
      }
      // effects, water, clouds, scenery animation
      for (i = fx.length - 1; i >= 0; i--) {
        var f = fx[i]; f.age += dt; var k2 = f.age / f.life;
        if (f.ring) { f.o.scale.setScalar(1 + k2 * 5); f.o.material.opacity = 1 - k2; }
        else { f.vy -= 6 * dt; f.o.position.x += f.vx * dt; f.o.position.y += f.vy * dt; f.o.position.z += f.vz * dt; f.o.material.opacity = 1 - k2; f.o.scale.setScalar(0.5 * (1 - k2 * 0.6)); }
        if (f.age >= f.life) { scene.remove(f.o); f.o.material.dispose(); fx.splice(i, 1); }
      }
      if (W.waterTex) { W.waterTex.offset.x = (W.time * 0.004) % 1; W.waterTex.offset.y = (W.time * 0.0025) % 1; }
      if (W.foam) W.foam.material.opacity = 0.28 + 0.1 * Math.sin(W.time * 1.3);
      if (W.clouds) W.clouds.children.forEach(function (c) { c.position.x += c.userData.speed * dt; if (c.position.x > 170) c.position.x = -170; });
      for (i = 0; i < animated.length; i++) animated[i](dt, W.time);
      updateCamera(dt, false);
      for (i = 0; i < hooks.length; i++) hooks[i](dt, W);
    };
    W.animate = function (fn) { animated.push(fn); };
    function moveActor(a, dt, moveVec) {
      var px = a.x, pz = a.z, p = { x: a.x + a.vx * dt, z: a.z + a.vz * dt };
      resolve(p, a.radius);
      for (var i = 0; i < actors.length; i++) { var o = actors[i]; if (o === a || o.ghost || a.ghost) continue; pushOut({ type: 'c', x: o.x, z: o.z, r: o.radius }, p, a.radius); }
      a.x = p.x; a.z = p.z;
      var dist = Math.hypot(a.x - px, a.z - pz);
      a.speed = dist / dt;
      if (dist < 1e-5) { a.speed = 0; }
      // face the move direction while moving; otherwise face the look target
      if (dist > 1e-5) a.travelDir = [(a.x - px) / dist, (a.z - pz) / dist];
      if (a.speed > 0.15) {
        var mvx = a.x - px, mvz = a.z - pz;
        if (moveVec) { mvx = moveVec[0]; mvz = moveVec[1]; }
        if (!a.selfFacing) faceYaw(a, mvx, mvz, dt, params.turnRate);
        a.moveDir = [mvx, mvz]; a.lastMove = [mvx, mvz];
      } else {
        a.moveDir = [0, 0];
        var t = a.target && actorById[a.target];
        if (t) faceYaw(a, t.x - a.x, t.z - a.z, dt, params.turnRate * 0.5);
        else if (a.target && typeof a.target === 'object') faceYaw(a, a.target.x - a.x, a.target.z - a.z, dt, params.turnRate * 0.5);
      }
      a.root.position.set(a.x, 0, a.z); a.root.rotation.y = a.yaw;
      animate(a, dist, dt);
    }
    W.moveActor = function (id, dt) { var a = actorById[id]; if (a) moveActor(a, dt || DT, [a.vx, a.vz]); };
    W.walkTo = function (id, x, z, speed) { var a = actorById[id]; if (a) a.desired = { x: x, z: z, speed: speed }; };

    /* ---------------------------------------------------------------------------- render, resize, project */
    var cssW = 1, cssH = 1, frameMs = [], _fd = new THREE.Vector3();
    W.resize = function (w, h) {
      cssW = Math.max(1, w | 0); cssH = Math.max(1, h | 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, params.maxDpr));
      renderer.setSize(cssW, cssH, false); camera.aspect = cssW / cssH;
      // portrait screens: widen the vertical field of view so the horizontal view stays usable
      camera.fov = camera.aspect < 1 ? Math.min(80, params.fov + (1 - camera.aspect) * 36) : params.fov; camera.updateProjectionMatrix();
    };
    W.size = function () { return { w: cssW, h: cssH }; };
    W.render = function () {
      var t0 = performance.now();
      var f = cam.focus, snapU = 30 / SH;
      // tight shadow camera that follows the focus, snapped to shadow texels so edges do not crawl
      var fxs = Math.round(f.x / snapU) * snapU, fzs = Math.round(f.z / snapU) * snapU;
      sun.target.position.set(fxs, 0, fzs); sun.position.set(fxs + sunDir.x * 40, sunDir.y * 40, fzs + sunDir.z * 40);
      sun.target.updateMatrixWorld();
      renderer.render(scene, camera);
      frameMs.push(performance.now() - t0); if (frameMs.length > 120) frameMs.shift();
    };
    var _p = new THREE.Vector3();
    W.project = function (x, y, z) {
      _p.set(x, y, z); var cs = _p.clone().applyMatrix4(camera.matrixWorldInverse); _p.project(camera);
      return { x: (_p.x + 1) / 2 * cssW, y: (1 - _p.y) / 2 * cssH, depth: -cs.z, visible: cs.z < -0.1 && Math.abs(_p.x) <= 1.05 && Math.abs(_p.y) <= 1.05 };
    };
    // world -> screen anchor of an actor or pickup, CSS px of the canvas
    W.anchor = function (id) {
      var a = actorById[id], h, x, z;
      if (a) { h = a.height; x = a.x; z = a.z; }
      else { var p = pickups.filter(function (q) { return q.id === id; })[0]; if (!p) return null; h = 1.3; x = p.x; z = p.z; }
      var top = W.project(x, h + 0.12, z), foot = W.project(x, 0, z), mid = W.project(x, h * 0.55, z);
      return { id: id, x: top.x, y: top.y, top: top.y, footX: foot.x, footY: foot.y, cx: mid.x, cy: mid.y, h: Math.abs(foot.y - top.y), depth: mid.depth, visible: top.visible || foot.visible, world: { x: x, y: 0, z: z, h: h } };
    };
    W.forward = function (a) { a.model.getWorldDirection(_fd); return [_fd.x, _fd.z]; };
    W.state = function () {
      return { t: Math.round(W.time * 1000), webgl: true, fx: fx.length, camera: W.camInfo(), actors: actors.map(function (a) {
        a.model.getWorldDirection(_fd); var fl = Math.hypot(_fd.x, _fd.z) || 1, fwx = _fd.x / fl, fwz = _fd.z / fl;
        var moving = a.speed > 0.3, md = a.moveDir, ml = Math.hypot(md[0], md[1]);
        var angM = moving && ml > 1e-6 ? Math.acos(clamp((fwx * md[0] + fwz * md[1]) / ml, -1, 1)) * 180 / Math.PI : 0;
        var tg = a.target && (typeof a.target === 'string' ? actorById[a.target] || pickups.filter(function (p) { return p.id === a.target; })[0] : a.target);
        var angT = null; if (tg && !moving) { var tx2 = tg.x - a.x, tz2 = tg.z - a.z, tl = Math.hypot(tx2, tz2) || 1; angT = Math.acos(clamp((fwx * tx2 + fwz * tz2) / tl, -1, 1)) * 180 / Math.PI; }
        var o = { id: a.id, kind: a.kind, x: +a.x.toFixed(3), z: +a.z.toFixed(3), yaw: +a.yaw.toFixed(4), moveDir: moving && ml > 1e-6 ? [+(md[0] / ml).toFixed(3), +(md[1] / ml).toFixed(3)] : [0, 0],
          forward: [+fwx.toFixed(3), +fwz.toFixed(3)], target: typeof a.target === 'string' ? a.target : null, moving: moving, speed: +a.speed.toFixed(2),
          facesMove: !moving || angM <= 15, moveAngleDeg: +angM.toFixed(1), facesTarget: angT == null ? null : angT <= 20, targetAngleDeg: angT == null ? null : +angT.toFixed(1),
          travelDir: a.travelDir && moving ? [+a.travelDir[0].toFixed(3), +a.travelDir[1].toFixed(3)] : [0, 0],
          feetY: +(a.feetY || 0).toFixed(4), pose: a.gesture || (a.speed < 0.15 ? 'idle' : a.run > 0.5 ? 'run' : 'walk'), height: +a.height.toFixed(2) };
        if (a.stateExtra) { var ex = a.stateExtra(a); for (var q in ex) o[q] = ex[q]; }
        return o;
      }) };
    };
    // every pose of every adventurer: idle, walk and run cycles, gestures; returns the worst |feetY|
    W.feetProbe = function () {
      var worst = 0, n = 0, rows = [];
      actors.forEach(function (a) {
        if (!a.parts) return;
        var save = { phase: a.phase, amp: a.amp, run: a.run, g: a.gesture, gw: a.gestureW, speed: a.speed };
        [['idle', 0, 0, null], ['walk', params.walkSpeed, 0, null], ['run', params.runSpeed, 1, null], ['wave', 0, 0, 'wave'], ['cheer', 0, 0, 'cheer']].forEach(function (m) {
          for (var i = 0; i < 16; i++) {
            var walkS = params.walkSpeed, runS = Math.max(walkS + 0.1, params.runSpeed), sp = m[1], w = clamp(sp / walkS, 0, 1), rn = clamp((sp - walkS) / (runS - walkS), 0, 1);
            poseAdventurer(a.parts, { amp: 0.5 * w + 0.32 * rn, phase: i / 16 * TAU, run: m[2], time: i * 0.37, robe: a.built.robe, headPitch: 0, headYaw: 0, capeAngle: 0.1 + 0.4 * rn, gesture: m[3], gestureW: m[3] ? 1 : 0 });
            ground(a); var fy = a.feetY; n++; if (Math.abs(fy) > worst) worst = Math.abs(fy); if (i % 4 === 0) rows.push(a.id + ' ' + m[0] + ' ' + i + ' ' + fy.toFixed(5));
          }
        });
        a.phase = save.phase; a.amp = save.amp; a.run = save.run; a.gesture = save.g; a.gestureW = save.gw;
        poseAdventurer(a.parts, { amp: a.amp, phase: a.phase, run: a.run, time: W.time, robe: a.built.robe, headPitch: a.headPitch, headYaw: a.headYaw, capeAngle: a.capeAngle, gesture: a.gesture, gestureW: a.gestureW }); ground(a);
      });
      return { maxAbs: worst, n: n, sample: rows };
    };
    W.stats = function () {
      var s = frameMs.slice().sort(function (a, b) { return a - b; });
      return { webgl: true, renderMsMedian: s.length ? +s[s.length >> 1].toFixed(2) : null, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, dpr: renderer.getPixelRatio(), size: [cssW, cssH] };
    };
    // share of the screen where dithered (faded) props actually draw pixels: render a small frame with the faded props
    // shown and hidden and count the pixels that differ (gate: < 0.15 at every acceptance moment)
    W.ditherCoverage = function () {
      var faded = fadeOwners.filter(function (o) { return o.k < 0.999; }); if (!faded.length) return 0;
      var w = 320, h = Math.max(1, Math.round(320 * cssH / cssW)), rt = new THREE.WebGLRenderTarget(w, h), a = new Uint8Array(w * h * 4), b = new Uint8Array(w * h * 4);
      var prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.readRenderTargetPixels(rt, 0, 0, w, h, a);
      // hide only their colour (shadows stay), so the count is the dithered pixels alone
      var ms = []; faded.forEach(function (o) { o.obj.traverse(function (m) { if (m.isMesh && m.material.userData.fadeU) { ms.push(m.material); m.material.colorWrite = false; m.material.depthWrite = false; } }); });
      renderer.render(scene, camera); renderer.readRenderTargetPixels(rt, 0, 0, w, h, b);
      ms.forEach(function (m) { m.colorWrite = true; m.depthWrite = true; });
      renderer.setRenderTarget(prev); rt.dispose();
      var n = 0; for (var i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++;
      return +(n / (w * h)).toFixed(4);
    };
    W.precompile = function () { try { renderer.compile(scene, camera); } catch (e) { /* ignore */ } };
    W.setHero = function (id) { W.hero = actorById[id] || null; if (W.hero && !cam.init) W.snapCamera(); };
    return W;
  }

  var api = { version: VERSION, FACING_OFFSET: FACING_OFFSET, DEFAULTS: DEFAULTS, PALETTES: PALETTES, LOOKS: LOOKS, create: create, supportsWebGL: supportsWebGL,
    buildAdventurer: buildAdventurer, poseAdventurer: poseAdventurer };
  root.GameDNA_ThirdPerson3D = api;
})(typeof window !== 'undefined' ? window : this);
