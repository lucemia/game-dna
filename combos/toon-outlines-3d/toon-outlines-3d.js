/* GameDNA_Toon3D v1.0.0 (N-04 toon-outlines-3d): toon shading and ink outlines for an existing three.js scene.
   One classic script, ASCII only, no imports. Needs three.js 0.149.0 as window.THREE (or options.THREE).

   What it does
   - Shading: every lit mesh material (Lambert, Phong, Standard, Physical) is swapped for a MeshToonMaterial copy with a
     generated 2-4 band gradient map, the same colour / map / vertex colours / emissive / transparency / side / fog /
     flat shading and the same onBeforeCompile patch (so custom fades keep working), plus an optional banded rim light
     and a hard specular glint for shiny surfaces. Materials shared by many meshes stay shared (one copy each).
   - Outlines: inverted hull. Each eligible mesh gets a back-face shell that shares its position and index buffers,
     pushed out in screen space along smoothed normals (no gaps at hard corners), so the line is about `width` px per
     720 px of view height at any distance, thinner on small or far objects, fogged like the scene. Shells live in one
     group at the scene root and copy their mesh's world matrix right before they draw: the game's own scene graph,
     ray casts, bounding boxes and shadow maps never see them.
   - Live: host code that changes the original material (colour flash, fade, opacity) or the toon copy is mirrored to
     the other one every update; meshes added later are picked up by update(); removed meshes are dropped.
   - remove() puts every original material object back (the same objects, untouched) and deletes the shells.
   Double-sided open sheets (capes, hoods, hems) get a rim shell pushed out along their border edges only (folds inside
   the sheet get no line). Big static meshes (world radius >= creaseMinRadius, e.g. terrain) also get crease lines on
   edges sharper than creaseAngle. Fades: outlines hide while the mesh is transparent, colour-masked, or faded by a
   value the game keeps in material.userData (fade / dither / alpha / opacity uniform) or by opts.fade(mesh).
   Not handled (stated fallback): SkinnedMesh and meshes with morph targets get toon shading but no outline;
   InstancedMesh gets toon shading but no outline; ShaderMaterial / RawShaderMaterial / MeshBasicMaterial stay as they
   are; flat open shapes (Plane / Circle / Ring / Shape geometry: ground discs, decals) get no outline unless
   opts.outlineThin = true; crease lines are 1 device px (WebGL line width).
   Opt out: obj.userData.toon = false (whole subtree: no toon, no outline); obj.userData.toonOutline = false (toon
   shading only); opts.include(mesh) -> false. */
(function (root) {
  'use strict';
  var VERSION = '1.1.0';

  var PRESETS = {
    soft3: { shade: true, bands: [0.4, 0.6], levels: [0.3, 0.6, 0.84], soft: 0.03, ambient: 0.9, shadeTint: 0xc4cdf0, outline: true, width: 2.2, color: 'tint', tint: 0.26, ink: 0x1d1a26, rim: 0.32, rimWidth: 0.3, spec: 0.55 },
    crisp2: { shade: true, bands: [0.52], levels: [0.38, 0.86], soft: 0.0, ambient: 0.78, shadeTint: 0xc8cdea, outline: true, width: 2.6, color: 'ink', tint: 0.3, ink: 0x17141f, rim: 0.0, rimWidth: 0.3, spec: 0.7 },
    painted4: { shade: true, bands: [0.32, 0.48, 0.68], levels: [0.3, 0.5, 0.7, 0.86], soft: 0.05, ambient: 0.85, shadeTint: 0xe2d8ec, outline: true, width: 1.8, color: 'tint', tint: 0.42, ink: 0x2a2230, rim: 0.22, rimWidth: 0.24, spec: 0.35 },
    ink: { shade: false, bands: [0.5], levels: [0.5, 1.0], soft: 0, ambient: 1, shadeTint: 0xffffff, outline: true, width: 2.4, color: 'ink', tint: 0.3, ink: 0x14121a, rim: 0, rimWidth: 0.3, spec: 0 }
  };
  var DEFAULTS = { preset: 'soft3', thin: 0.24, minPx: 1.1, bias: 0.0025, creases: true, creaseAngle: 40, creaseMinRadius: 5, rimColor: 0xfff2d8, outlineThin: false, outlineUnlit: false, refHeight: 720 };

  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function warn(m) { try { console.warn('[GameDNA_Toon3D] ' + m); } catch (e) { /* ignore */ } }
  function getTHREE(o) { return (o && o.THREE) || root.THREE || null; }

  function webglOK() {
    try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  }

  // ------------------------------------------------------------------ shaders
  var OUTLINE_VERT = [
    '#include <common>',
    '#include <fog_pars_vertex>',
    '#include <clipping_planes_pars_vertex>',
    'attribute vec3 toonNormal;',
    'attribute vec4 toonSphere;',
    'uniform float uWidth;',
    'uniform float uMinPx;',
    'uniform float uThin;',
    'uniform float uBias;',
    'uniform vec2 uRes;',
    'void main() {',
    '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
    '  float dist = max(1e-4, -mvPosition.z);',
    '  vec3 n = normalMatrix * toonNormal;',
    '  float nl = length(n);',
    '  vec4 clip = projectionMatrix * mvPosition;',
    // projected size of the object: thinner lines on small or far objects
    '  vec3 mc = (modelViewMatrix * vec4(toonSphere.xyz, 1.0)).xyz;',
    '  vec3 me = (modelViewMatrix * vec4(toonSphere.xyz + vec3(toonSphere.w, 0.0, 0.0), 1.0)).xyz;',
    '  float rw = length(me - mc);',
    '  vec4 c0 = projectionMatrix * vec4(mc, 1.0);',
    '  vec4 c1 = projectionMatrix * vec4(mc + vec3(0.0, rw, 0.0), 1.0);',
    '  float rPx = abs(c1.y / c1.w - c0.y / c0.w) * 0.5 * uRes.y;',
    '  float w = max(uMinPx, min(uWidth, rPx * uThin));',
    '  if (nl > 1e-6) {',
    '    vec4 cp = projectionMatrix * vec4(mvPosition.xyz + (n / nl) * 0.01 * dist, 1.0);',
    '    vec2 d = (cp.xy / cp.w - clip.xy / clip.w) * uRes;',
    '    float dl = length(d);',
    '    if (dl > 1e-5) clip.xy += (d / dl) * w * 2.0 / uRes * clip.w;',
    '  }',
    // push the shell a little away from the camera (relative to distance): no z-fight with thin front faces
    '  vec4 cb = projectionMatrix * vec4(mvPosition.xyz * (1.0 + uBias), 1.0);',
    '  clip.z = cb.z / cb.w * clip.w;',
    '  gl_Position = clip;',
    '  #include <clipping_planes_vertex>',
    '  #include <fog_vertex>',
    '}'
  ].join('\n');
  var OUTLINE_FRAG = [
    '#include <common>',
    '#include <fog_pars_fragment>',
    '#include <clipping_planes_pars_fragment>',
    'uniform vec3 uColor;',
    'uniform float uOpacity;',
    'void main() {',
    '  #include <clipping_planes_fragment>',
    '  gl_FragColor = vec4(uColor, uOpacity);',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '  #include <fog_fragment>',
    '}'
  ].join('\n');
  // crease lines (hard edges of big static meshes such as terrain): pulled a little toward the camera
  var CREASE_VERT = [
    '#include <common>',
    '#include <fog_pars_vertex>',
    'uniform float uBias;',
    'void main() {',
    '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
    '  vec4 clip = projectionMatrix * mvPosition;',
    '  vec4 cb = projectionMatrix * vec4(mvPosition.xyz * (1.0 - uBias), 1.0);',
    '  clip.z = cb.z / cb.w * clip.w;',
    '  gl_Position = clip;',
    '  #include <fog_vertex>',
    '}'
  ].join('\n');
  // rim light (banded, on the lit side) and a hard specular glint, added just before the output
  var RIM_PARS = 'uniform float uToonRim;\nuniform float uToonRimWidth;\nuniform vec3 uToonRimColor;\nuniform float uToonSpec;\nuniform float uToonAmbient;\nuniform vec3 uToonShade;\nuniform float uToonBand0;\n';
  var RIM_CODE = [
    '{',
    '  vec3 tvd = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);',
    '  vec3 tn = normalize(normal);',
    '  float tlit = 1.0;',
    '  vec3 tld = vec3(0.0, 1.0, 0.0);',
    '  #if NUM_DIR_LIGHTS > 0',
    '    tld = directionalLights[0].direction;',
    '    tlit = 1.0;',
    '    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0',
    '      if (receiveShadow) tlit *= step(0.5, getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0]));',
    '    #endif',
    '  #endif',
    '  float tside = 1.0;',
    '  #if NUM_DIR_LIGHTS > 0',
    '    tside = smoothstep(uToonBand0 - 0.02, uToonBand0 + 0.02, dot(tn, tld) * 0.5 + 0.5) * tlit;',
    '  #endif',
    '  outgoingLight *= mix(uToonShade, vec3(1.0), tside);',
    '  float trim = 1.0 - max(dot(tn, tvd), 0.0);',
    '  float tedge = smoothstep(1.0 - uToonRimWidth, 1.0 - uToonRimWidth + 0.04, trim);',
    '  outgoingLight += uToonRimColor * diffuseColor.rgb * uToonRim * tedge * (0.35 + 0.65 * tlit);',
    '  vec3 th = normalize(tld + tvd);',
    '  float tsp = smoothstep(0.965, 0.975, max(dot(tn, th), 0.0)) * tlit;',
    '  outgoingLight += vec3(uToonSpec * tsp);',
    // soft knee above 0.78: near-white albedo keeps its band steps instead of clipping flat
    '  float tmx = max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b);',
    '  if (tmx > 0.78) outgoingLight *= (0.78 + 0.2 * (1.0 - exp(-(tmx - 0.78) * 4.0))) / tmx;',
    '}'
  ].join('\n');

  // ------------------------------------------------------------------ helpers
  var BASE_PROPS = ['name', 'blending', 'side', 'vertexColors', 'opacity', 'transparent', 'blendSrc', 'blendDst', 'blendEquation',
    'depthFunc', 'depthTest', 'depthWrite', 'colorWrite', 'precision', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits',
    'dithering', 'alphaTest', 'alphaToCoverage', 'premultipliedAlpha', 'visible', 'toneMapped', 'clipIntersection', 'clipShadows', 'shadowSide'];
  var MAP_PROPS = ['map', 'emissiveMap', 'alphaMap', 'normalMap', 'bumpMap', 'aoMap', 'lightMap', 'displacementMap'];
  var SCALAR_PROPS = ['emissiveIntensity', 'aoMapIntensity', 'lightMapIntensity', 'bumpScale', 'displacementScale', 'displacementBias', 'normalMapType', 'wireframe', 'fog'];
  // properties mirrored every update between an original material and its toon copy (host code may change either)
  var SYNC = ['opacity', 'transparent', 'visible', 'colorWrite', 'depthWrite', 'depthTest', 'side', 'alphaTest', 'map', 'emissiveIntensity', 'vertexColors', 'wireframe'];
  var PROGRAM_PROPS = { transparent: 1, side: 1, map: 1, vertexColors: 1, alphaTest: 1, wireframe: 1 };

  function isLit(m) { return !!(m && (m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshStandardMaterial)); }
  function shiny(m) {
    if (m.isMeshPhongMaterial) return m.shininess >= 25 && m.specular && (m.specular.r + m.specular.g + m.specular.b) > 0.15 ? 1 : 0;
    if (m.isMeshStandardMaterial) return m.roughness < 0.45 ? 1 : 0;
    return 0;
  }
  function optedOut(o, key) {
    for (var p = o; p; p = p.parent) { if (p.userData && p.userData[key] === false) return true; }
    return false;
  }

  function create(opts) {
    opts = opts || {};
    var THREE = getTHREE(opts);
    var T = { version: VERSION, ok: false, error: null };
    if (!THREE || !THREE.MeshToonMaterial) {
      T.error = 'three.js is missing: load three.min.js (0.149.0) before toon-outlines-3d.js or pass options.THREE';
      warn(T.error);
      ['apply', 'remove', 'update', 'sync', 'set', 'setEnabled'].forEach(function (k) { T[k] = function () { return T; }; });
      T.state = function () { return { ok: false, error: T.error, enabled: false, meshes: 0 }; };
      T.list = function () { return []; };
      return T;
    }
    T.ok = true;

    var P = {}, NOT_PARAMS = { THREE: 1, scene: 1, camera: 1, renderer: 1, apply: 1 };
    function setParams(o) {
      if (o.preset && PRESETS[o.preset] && o.preset !== P.preset) {
        var base = PRESETS[o.preset], k;
        for (k in DEFAULTS) if (P[k] === undefined) P[k] = DEFAULTS[k];
        for (k in base) P[k] = base[k];
        P.preset = o.preset;
      }
      for (var j in o) if (o[j] !== undefined && !NOT_PARAMS[j] && j !== 'preset') P[j] = o[j];
      if (!Array.isArray(P.bands) || !P.bands.length) P.bands = [0.5];
      P.bands = P.bands.slice(0, 3).map(function (v) { return Math.max(0.02, Math.min(0.98, num(v, 0.5))); }).sort(function (a, b) { return a - b; });
      if (!Array.isArray(P.levels) || P.levels.length !== P.bands.length + 1) {
        P.levels = []; for (var i = 0; i <= P.bands.length; i++) P.levels.push(+(0.3 + 0.7 * i / P.bands.length).toFixed(3));
      }
    }
    setParams({ preset: PRESETS[opts.preset] ? opts.preset : DEFAULTS.preset });
    setParams(opts);

    var scene = opts.scene || null, camera = opts.camera || null, renderer = opts.renderer || null;
    var applied = false, enabled = true, errors = 0, updates = 0, lastErr = null;
    var recs = [], byUuid = {};                 // one record per mesh we touched
    var toonOf = {};                            // original material uuid -> {orig, toon, last, refs}
    var shellMats = {};                         // key -> ShaderMaterial
    var shellGeos = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
    var group = null, grad = null, gradKey = '';
    var rimU = { uToonRim: { value: 0 }, uToonRimWidth: { value: 0.3 }, uToonRimColor: { value: new THREE.Color(DEFAULTS.rimColor) }, uToonSpec: { value: 0 }, uToonAmbient: { value: 1 }, uToonShade: { value: new THREE.Color(1, 1, 1) }, uToonBand0: { value: 0.5 } };
    var skipped = { unlit: 0, instanced: 0, skinned: 0, custom: 0, optOut: 0, flat: 0, doubleSide: 0, noGeometry: 0, overlay: 0 };
    var resV = new THREE.Vector2(1, 1);

    function guard(fn, what) {
      return function () {
        try { return fn.apply(this, arguments); } catch (e) { errors++; lastErr = what + ': ' + (e && e.message); if (errors < 5) warn(lastErr); return T; }
      };
    }

    // ---------------------------------------------------------------- gradient map (bands)
    function gradient() {
      var key = P.bands.join(',') + '|' + P.levels.join(',') + '|' + P.soft;
      if (grad && key === gradKey) return grad;
      var W = 256, data = new Uint8Array(W * 4), s = Math.max(0, num(P.soft, 0));
      for (var i = 0; i < W; i++) {
        var x = (i + 0.5) / W, lv = P.levels[0];
        for (var b = 0; b < P.bands.length; b++) {
          var t = P.bands[b], k = s > 0 ? Math.min(1, Math.max(0, (x - t + s / 2) / s)) : (x >= t ? 1 : 0);
          k = k * k * (3 - 2 * k); lv = lv + (P.levels[b + 1] - P.levels[b]) * k;
        }
        var v = Math.round(Math.max(0, Math.min(1, lv)) * 255); data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
      }
      if (!grad) {
        grad = new THREE.DataTexture(data, W, 1, THREE.RGBAFormat);
        grad.minFilter = THREE.LinearFilter; grad.magFilter = s > 0 ? THREE.LinearFilter : THREE.NearestFilter; grad.generateMipmaps = false;
        grad.name = 'toon-gradient';
      } else { grad.image.data.set(data); grad.magFilter = s > 0 ? THREE.LinearFilter : THREE.NearestFilter; }
      grad.needsUpdate = true; gradKey = key;
      return grad;
    }

    // ---------------------------------------------------------------- toon copies of materials
    function colorOf(c) { return c ? [c.r, c.g, c.b] : null; }
    function sameColor(a, b) { return !a || !b ? a === b : a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }
    function snapshot(m) {
      var s = {}; SYNC.forEach(function (k) { s[k] = m[k]; });
      s.color = colorOf(m.color); s.emissive = colorOf(m.emissive); return s;
    }
    function makeToon(orig) {
      var m = new THREE.MeshToonMaterial();
      BASE_PROPS.forEach(function (k) { if (orig[k] !== undefined) m[k] = orig[k]; });
      if (orig.clippingPlanes) m.clippingPlanes = orig.clippingPlanes;
      if (orig.color) m.color.copy(orig.color);
      if (orig.emissive) m.emissive.copy(orig.emissive);
      MAP_PROPS.forEach(function (k) { if (orig[k] !== undefined) m[k] = orig[k]; });
      SCALAR_PROPS.forEach(function (k) { if (orig[k] !== undefined) m[k] = orig[k]; });
      if (orig.normalScale && m.normalScale) m.normalScale.copy(orig.normalScale);
      m.flatShading = !!orig.flatShading;            // read by the renderer for any material (FLAT_SHADED)
      m.gradientMap = gradient();
      m.userData = orig.userData;                     // the same object: host uniforms kept there stay shared
      m.name = (orig.name || '') + '#toon';
      var sp = shiny(orig), hostPatch = orig.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ? orig.onBeforeCompile : null;
      var hostKey = orig.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey ? orig.customProgramCacheKey : null;
      var specU = { value: 0 };
      m.onBeforeCompile = function (sh, r) {
        if (hostPatch) { try { hostPatch.call(orig, sh, r); } catch (e) { errors++; lastErr = 'host onBeforeCompile: ' + e.message; } }
        sh.uniforms.uToonRim = rimU.uToonRim; sh.uniforms.uToonRimWidth = rimU.uToonRimWidth; sh.uniforms.uToonRimColor = rimU.uToonRimColor; sh.uniforms.uToonSpec = specU;
        sh.uniforms.uToonAmbient = rimU.uToonAmbient; sh.uniforms.uToonShade = rimU.uToonShade; sh.uniforms.uToonBand0 = rimU.uToonBand0;
        sh.fragmentShader = RIM_PARS + sh.fragmentShader
          .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.indirectDiffuse *= uToonAmbient;')
          .replace('#include <output_fragment>', RIM_CODE + '\n#include <output_fragment>');
      };
      m.customProgramCacheKey = function () { var k = 'gdna-toon'; if (hostKey) { try { k += '|' + hostKey.call(orig); } catch (e) { /* ignore */ } } return k; };
      return { orig: orig, toon: m, last: snapshot(orig), shiny: sp, specU: specU, version: orig.version };
    }
    function toonFor(orig) {
      var e = toonOf[orig.uuid];
      if (!e) { e = toonOf[orig.uuid] = makeToon(orig); e.refs = 0; }
      return e;
    }
    // mirror host changes: original -> toon, or toon -> original (whichever changed since the last update)
    function mirror(e) {
      var o = e.orig, t = e.toon, l = e.last, prog = false;
      for (var i = 0; i < SYNC.length; i++) {
        var k = SYNC[i];
        if (o[k] !== l[k]) { if (t[k] !== o[k]) { t[k] = o[k]; if (PROGRAM_PROPS[k]) prog = true; } l[k] = o[k]; }
        else if (t[k] !== l[k]) { o[k] = t[k]; l[k] = t[k]; if (PROGRAM_PROPS[k]) prog = true; }
      }
      ['color', 'emissive'].forEach(function (k) {
        if (!o[k] || !t[k]) return;
        var oc = colorOf(o[k]), tc = colorOf(t[k]);
        if (!sameColor(oc, l[k])) { t[k].copy(o[k]); l[k] = oc; }
        else if (!sameColor(tc, l[k])) { o[k].copy(t[k]); l[k] = tc; }
      });
      if (o.version !== e.version) { e.version = o.version; prog = true; }
      if (prog) t.needsUpdate = true;
      e.specU.value = e.shiny ? num(P.spec, 0) : 0;
    }

    // ---------------------------------------------------------------- outline shells
    // per geometry: merged positions, area-weighted smoothed normals, and for open meshes the outward direction
    // along the surface at boundary edges (edges used by one triangle)
    var topoCache = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
    function topo(geo) {
      var pos = geo.attributes.position, c = topoCache && topoCache.get(geo);
      if (c && c.pos === pos && c.ver === pos.version) return c;
      var n = pos.count, idx = geo.index, key = {}, acc = [], vk = new Int32Array(n), i, a, b, cc, rep = [];
      for (i = 0; i < n; i++) {
        var h = Math.round(pos.getX(i) * 1e4) + ',' + Math.round(pos.getY(i) * 1e4) + ',' + Math.round(pos.getZ(i) * 1e4);
        var id = key[h]; if (id === undefined) { id = key[h] = acc.length / 3; acc.push(0, 0, 0); rep.push(i); } vk[i] = id;
      }
      var tri = idx ? idx.count : n, start = Math.max(0, geo.drawRange.start), end = Math.min(tri, start + (isFinite(geo.drawRange.count) ? geo.drawRange.count : tri));
      var ax, ay, az, bx, by, bz, edges = {};
      for (i = start; i + 2 < end; i += 3) {
        a = idx ? idx.getX(i) : i; b = idx ? idx.getX(i + 1) : i + 1; cc = idx ? idx.getX(i + 2) : i + 2;
        ax = pos.getX(b) - pos.getX(a); ay = pos.getY(b) - pos.getY(a); az = pos.getZ(b) - pos.getZ(a);
        bx = pos.getX(cc) - pos.getX(a); by = pos.getY(cc) - pos.getY(a); bz = pos.getZ(cc) - pos.getZ(a);
        var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;      // area-weighted face normal
        var ids = [vk[a], vk[b], vk[cc]], seen = {};
        for (var j = 0; j < 3; j++) { var q = ids[j]; if (seen[q]) continue; seen[q] = 1; acc[q * 3] += nx; acc[q * 3 + 1] += ny; acc[q * 3 + 2] += nz; }
        if (ids[0] === ids[1] || ids[1] === ids[2] || ids[0] === ids[2]) continue;
        for (j = 0; j < 3; j++) {
          var e0 = ids[j], e1 = ids[(j + 1) % 3], ek = e0 < e1 ? e0 + '_' + e1 : e1 + '_' + e0, E = edges[ek];
          if (E) E.n++; else edges[ek] = { n: 1, a: e0, b: e1, c: ids[(j + 2) % 3], fn: [nx, ny, nz] };
        }
      }
      var out = null, nb = 0;
      for (var ek2 in edges) {
        var E2 = edges[ek2]; if (E2.n !== 1) continue;
        nb++; out = out || new Float32Array(acc.length);
        var pa = rep[E2.a], pb = rep[E2.b], pc = rep[E2.c];
        var ex = pos.getX(pb) - pos.getX(pa), ey = pos.getY(pb) - pos.getY(pa), ez = pos.getZ(pb) - pos.getZ(pa), f = E2.fn;
        var ox = ey * f[2] - ez * f[1], oy = ez * f[0] - ex * f[2], oz = ex * f[1] - ey * f[0];
        var mx = (pos.getX(pa) + pos.getX(pb)) / 2 - pos.getX(pc), my = (pos.getY(pa) + pos.getY(pb)) / 2 - pos.getY(pc), mz = (pos.getZ(pa) + pos.getZ(pb)) / 2 - pos.getZ(pc);
        if (ox * mx + oy * my + oz * mz < 0) { ox = -ox; oy = -oy; oz = -oz; }
        var ol = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
        [E2.a, E2.b].forEach(function (k) { out[k * 3] += ox / ol; out[k * 3 + 1] += oy / ol; out[k * 3 + 2] += oz / ol; });
      }
      c = { pos: pos, ver: pos.version, vk: vk, acc: acc, out: out, boundary: nb };
      if (topoCache) topoCache.set(geo, c);
      return c;
    }
    var openGeos = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
    function shellGeometry(geo, open) {
      var cache = open ? openGeos : shellGeos, c = cache && cache.get(geo);
      var pos = geo.attributes.position;
      if (c && c.posVersion === pos.version && c.pos === pos) return c.geo;
      var T0 = topo(geo), n = pos.count, vk = T0.vk, src = open ? T0.out : T0.acc, i;
      var nrm = new Float32Array(n * 3);
      for (i = 0; i < n; i++) {
        if (!src) break;
        var k3 = vk[i] * 3, x = src[k3], y = src[k3 + 1], z = src[k3 + 2], L = Math.sqrt(x * x + y * y + z * z);
        if (L > 1e-12) { nrm[i * 3] = x / L; nrm[i * 3 + 1] = y / L; nrm[i * 3 + 2] = z / L; }
      }
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      var bs = geo.boundingSphere, sph = new Float32Array(n * 4);
      for (i = 0; i < n; i++) { sph[i * 4] = bs.center.x; sph[i * 4 + 1] = bs.center.y; sph[i * 4 + 2] = bs.center.z; sph[i * 4 + 3] = bs.radius; }
      var g = c ? c.geo : new THREE.BufferGeometry();
      g.setAttribute('position', pos);                 // shared: the game's buffer, never copied, never disposed by us
      if (geo.index) g.setIndex(geo.index);
      g.setAttribute('toonNormal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('toonSphere', new THREE.BufferAttribute(sph, 4));
      g.setDrawRange(geo.drawRange.start, geo.drawRange.count);
      g.boundingSphere = bs.clone(); g.boundingSphere.radius *= 1.05;
      g.name = (geo.name || geo.type) + (open ? '#toon-rim' : '#toon-shell');
      if (cache) cache.set(geo, { geo: g, pos: pos, posVersion: pos.version });
      return g;
    }
    var creaseGeos = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
    function creaseGeometry(geo) {
      var c = creaseGeos && creaseGeos.get(geo), pos = geo.attributes.position, ang = num(P.creaseAngle, 40);
      if (c && c.pos === pos && c.ver === pos.version && c.ang === ang) return c.geo;
      var g = new THREE.EdgesGeometry(geo, ang); g.name = (geo.name || geo.type) + '#toon-crease';
      if (creaseGeos) creaseGeos.set(geo, { geo: g, pos: pos, ver: pos.version, ang: ang });
      return g;
    }
    var _ink = new THREE.Color(), _hsl = {};
    function inkColor(src, out) {
      out = out || new THREE.Color(); _ink.set(num(P.ink, 0x17141f));
      if (P.color !== 'tint' || !src || !src.color) return out.copy(_ink);
      out.copy(src.color); out.getHSL(_hsl);
      out.setHSL(_hsl.h, Math.min(1, _hsl.s * 1.15 + 0.08), _hsl.l * num(P.tint, 0.34));
      return out.lerp(_ink, 0.5);
    }
    function shellMaterial(src, open) {
      var key = (open ? 'open:' : '') + (P.color === 'tint' && src ? src.uuid : 'ink');
      var m = shellMats[key];
      if (m) return m;
      m = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: inkColor(src) }, uOpacity: { value: 1 }, uWidth: { value: 2 }, uMinPx: { value: 0.75 }, uThin: { value: 0.16 }, uBias: { value: 0.0025 }, uRes: { value: new THREE.Vector2(1, 1) } }]),
        vertexShader: OUTLINE_VERT, fragmentShader: OUTLINE_FRAG, side: open ? THREE.DoubleSide : THREE.BackSide, fog: true
      });
      m.name = 'toon-outline'; m.userData.toonShell = true; m.userData.src = src || null;
      // harmless stand-ins so host loops that touch "every mesh material" cannot throw on a shell
      m.color = new THREE.Color(); m.emissive = new THREE.Color(); m.emissiveIntensity = 1;
      shellMats[key] = m;
      return m;
    }
    var creaseMats = {};
    function creaseMaterial(src) {
      var key = P.color === 'tint' && src ? src.uuid : 'ink', m = creaseMats[key];
      if (m) return m;
      m = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: inkColor(src) }, uOpacity: { value: 0.85 }, uBias: { value: 0.0015 } }]),
        vertexShader: CREASE_VERT, fragmentShader: OUTLINE_FRAG, fog: true, transparent: true, depthWrite: false
      });
      m.name = 'toon-crease'; m.userData.toonShell = true; m.userData.src = src || null;
      m.color = new THREE.Color(); m.emissive = new THREE.Color(); m.emissiveIntensity = 1;
      creaseMats[key] = m;
      return m;
    }
    function lockShell(s) {
      var noop = function () { return this; };
      Object.defineProperty(s, 'castShadow', { get: function () { return false; }, set: function () {} });
      Object.defineProperty(s, 'receiveShadow', { get: function () { return false; }, set: function () {} });
      ['enable', 'disable', 'toggle', 'set', 'enableAll', 'disableAll'].forEach(function (k) { s.layers[k] = noop; });
      s.raycast = function () {};
    }
    function makeShell(rec) {
      var mesh = rec.mesh, geo = shellGeometry(mesh.geometry, rec.open);
      var src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      var s = new THREE.Mesh(geo, shellMaterial(rec.origOf(src), rec.open));
      s.name = 'toon-outline:' + (mesh.name || mesh.uuid.slice(0, 8));
      s.userData.toonShell = true; s.userData.source = mesh;
      s.matrixAutoUpdate = false; s.frustumCulled = false;
      s.onBeforeRender = function () { this.matrixWorld.copy(mesh.matrixWorld); };
      lockShell(s);
      group.add(s);
      return s;
    }
    function makeCrease(rec) {
      var mesh = rec.mesh, src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      var l = new THREE.LineSegments(creaseGeometry(mesh.geometry), creaseMaterial(src));
      l.name = 'toon-crease:' + (mesh.name || mesh.uuid.slice(0, 8)); l.userData.toonShell = true; l.userData.source = mesh;
      l.matrixAutoUpdate = false; l.frustumCulled = false;
      l.onBeforeRender = function () { this.matrixWorld.copy(mesh.matrixWorld); };
      lockShell(l);
      group.add(l);
      return l;
    }
    function worldRadius(mesh) {
      var g = mesh.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      mesh.updateWorldMatrix(true, false);
      var e = mesh.matrixWorld.elements, sc = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
      return g.boundingSphere.radius * sc;
    }

    // ---------------------------------------------------------------- eligibility
    function outlineReason(mesh, mats) {
      if (!P.outline) return 'off';
      if (optedOut(mesh, 'toonOutline')) return 'optOut';
      if (mesh.isInstancedMesh) return 'instanced';
      if (mesh.isSkinnedMesh || (mesh.geometry.morphAttributes && mesh.geometry.morphAttributes.position && mesh.geometry.morphAttributes.position.length)) return 'skinned';
      var g = mesh.geometry; if (!g.attributes || !g.attributes.position || g.attributes.position.count < 4) return 'noGeometry';
      var t = g.type || '';
      if (!P.outlineThin && /^(Plane|Circle|Ring|Shape)(Buffer)?Geometry$/.test(t)) return 'flat';
      var m0 = mats[0];
      for (var i = 0; i < mats.length; i++) {
        var m = mats[i];
        if (!P.outlineUnlit && !isLit(m) && !m.isMeshToonMaterial) return 'unlit';
        if (m.depthTest === false || m.depthWrite === false) return 'overlay';
      }
      return m0 ? '' : 'noGeometry';
    }

    function register(mesh) {
      if (byUuid[mesh.uuid] || (mesh.userData && mesh.userData.toonShell)) return;
      if (!mesh.geometry || !mesh.material) return;
      if (optedOut(mesh, 'toon') || (P.include && P.include(mesh) === false)) { skipped.optOut++; byUuid[mesh.uuid] = { skip: true, mesh: mesh }; return; }
      var arr = Array.isArray(mesh.material), mats = arr ? mesh.material.slice() : [mesh.material];
      var rec = { mesh: mesh, arr: arr, orig: arr ? mesh.material : mesh.material, origList: mats, toonList: null, toon: null, shell: null, reason: '', shade: false };
      rec.origOf = function (m) { return m; };
      var lit = mats.filter(isLit).length;
      if (P.shade && lit) {
        rec.toonList = mats.map(function (m) { if (!isLit(m)) return m; var e = toonFor(m); e.refs++; return e.toon; });
        rec.toon = arr ? rec.toonList : rec.toonList[0];
        rec.shade = true;
      }
      if (!lit) { if (mats.some(function (m) { return m.isShaderMaterial || m.isRawShaderMaterial; })) skipped.custom++; else if (!mats.some(function (m) { return m.isMeshToonMaterial; })) skipped.unlit++; }
      rec.reason = outlineReason(mesh, mats);
      if (rec.reason && skipped[rec.reason] !== undefined) skipped[rec.reason]++;
      if (!rec.reason) {
        // double-sided open sheets (capes, hoods, hems): a rim shell pushed out along the sheet's border edges only
        rec.open = mats.some(function (m) { return m.side === THREE.DoubleSide; }) && topo(mesh.geometry).boundary > 0;
        rec.shell = makeShell(rec);
        if (P.creases && !rec.open && worldRadius(mesh) >= num(P.creaseMinRadius, 5)) rec.crease = makeCrease(rec);
      }
      byUuid[mesh.uuid] = rec; recs.push(rec);
      if (enabled && rec.shade) mesh.material = rec.toon;
    }
    function inScene(o) { for (var p = o; p; p = p.parent) if (p === scene) return true; return false; }
    function drop(rec) {
      var m = rec.mesh;
      if (rec.shade && (m.material === rec.toon || sameList(m.material, rec.toonList))) m.material = rec.orig;
      if (rec.shell) { group.remove(rec.shell); rec.shell = null; }
      if (rec.crease) { group.remove(rec.crease); rec.crease = null; }
      if (rec.shade) rec.origList.forEach(function (o) { var e = toonOf[o.uuid]; if (e && --e.refs <= 0) { e.toon.dispose(); delete toonOf[o.uuid]; } });
      delete byUuid[m.uuid];
    }
    function sameList(a, b) { if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

    // ---------------------------------------------------------------- public API
    T.apply = guard(function (sc, o) {
      if (sc && sc.isScene) scene = sc; else if (sc && sc.isObject3D) scene = sc;
      if (o) T.set(o);
      if (!scene) { warn('apply(scene): no scene'); return T; }
      if (!group) { group = new THREE.Group(); group.name = 'toon-outlines'; group.userData.toon = false; group.userData.toonShell = true; }
      if (group.parent !== scene) scene.add(group);
      applied = true; enabled = true; T.sync();
      return T;
    }, 'apply');

    T.sync = guard(function () {
      if (!applied || !scene) return T;
      var seen = {};
      scene.traverse(function (o) {
        if (o === group) return;
        if (o.isMesh && !(o.userData && o.userData.toonShell)) { seen[o.uuid] = 1; if (!byUuid[o.uuid]) register(o); }
      });
      for (var i = recs.length - 1; i >= 0; i--) {
        var r = recs[i];
        if (!seen[r.mesh.uuid] || !inScene(r.mesh)) { drop(r); recs.splice(i, 1); continue; }
        // the game swapped the material on its own: adopt the new one as the original
        var cur = r.mesh.material;
        if (cur !== r.orig && cur !== r.toon && !(r.arr && (sameList(cur, r.toonList) || sameList(cur, r.origList)))) {
          drop(r); recs.splice(i, 1); register(r.mesh);
        }
      }
      for (var u in byUuid) if (byUuid[u].skip && !seen[u]) delete byUuid[u];
      return T;
    }, 'sync');

    T.update = guard(function (dt) {
      if (!applied) return T;
      updates++;
      T.sync();
      var rr = renderer, H = 720, W = 1280;
      if (rr && rr.getDrawingBufferSize) { rr.getDrawingBufferSize(resV); W = resV.x; H = resV.y; }
      var wpx = num(P.width, 2.2) * H / num(P.refHeight, 720);
      for (var k in shellMats) {
        var u = shellMats[k].uniforms;
        u.uWidth.value = Math.max(0, wpx); u.uRes.value.set(W, H); u.uThin.value = num(P.thin, 0.16); u.uMinPx.value = wpx > 0 ? Math.min(wpx, num(P.minPx, 0.75) * H / 720) : 0; u.uBias.value = num(P.bias, 0.0025);
        var src = shellMats[k].userData.src; inkColor(src, u.uColor.value);
      }
      for (var k2 in creaseMats) inkColor(creaseMats[k2].userData.src, creaseMats[k2].uniforms.uColor.value);
      rimU.uToonAmbient.value = num(P.ambient, 1); rimU.uToonShade.value.set(P.shade ? num(P.shadeTint, 0xffffff) : 0xffffff); rimU.uToonBand0.value = P.bands[0];
      rimU.uToonRim.value = num(P.rim, 0); rimU.uToonRimWidth.value = num(P.rimWidth, 0.3); rimU.uToonRimColor.value.set(num(P.rimColor, DEFAULTS.rimColor));
      for (var id in toonOf) mirror(toonOf[id]);
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i], s = r.shell; if (!s) continue;
        var m = r.mesh.material, mm = Array.isArray(m) ? m[0] : m, vis = enabled && P.outline && worldVisible(r.mesh) && mm && mm.visible !== false && mm.colorWrite !== false && !(mm.transparent && mm.opacity < 0.97);
        if (vis) vis = fadeOf(r.mesh, mm) >= 0.99;
        s.visible = !!vis; s.renderOrder = r.mesh.renderOrder;
        if (vis) s.matrixWorld.copy(r.mesh.matrixWorld);
        if (r.crease) { r.crease.visible = !!vis; if (vis) r.crease.matrixWorld.copy(r.mesh.matrixWorld); }
      }
      return T;
    }, 'update');
    // fade: the lower of the integrator's fade(mesh) (if given) and a fade value the game keeps on the material's userData
    // (a number or a uniform {value} under a name like fade / dither / alpha / opacity / visibility; 1 = solid)
    var FADE_KEY = /fade|dither|alpha|opacity|visib/i;
    function fadeOf(mesh, mm) {
      var u = mm && mm.userData, f = 1;
      if (P.fade) { try { var pf = +P.fade(mesh); if (pf < f) f = pf; } catch (e) { errors++; } }
      if (u) for (var k in u) {
        if (!FADE_KEY.test(k)) continue;
        var v = u[k], x = typeof v === 'number' ? v : (v && typeof v.value === 'number' ? v.value : null);
        if (x != null && x >= 0 && x <= 1 && x < f) f = x;
      }
      return f;
    }
    function worldVisible(o) { for (var p = o; p; p = p.parent) { if (!p.visible) return false; if (p === scene) return true; } return false; }

    T.setEnabled = guard(function (on) {
      on = !!on; if (on === enabled) return T; enabled = on;
      recs.forEach(function (r) { if (r.shade) r.mesh.material = on ? r.toon : r.orig; });
      if (group) group.visible = on;
      return T;
    }, 'setEnabled');

    T.set = guard(function (o) {
      o = o || {};
      var shadeBefore = P.shade, outBefore = P.outline, colorBefore = P.color;
      setParams(o);
      if (grad) { gradient(); }
      if (applied && (P.shade !== shadeBefore || P.outline !== outBefore || P.color !== colorBefore || o.outlineThin !== undefined || o.outlineUnlit !== undefined || o.creases !== undefined || o.creaseAngle !== undefined || o.creaseMinRadius !== undefined)) {
        var keepEnabled = enabled; T.remove(true); T.apply(scene); if (!keepEnabled) T.setEnabled(false);
      }
      return T;
    }, 'set');

    T.remove = guard(function (keepGroup) {
      for (var i = recs.length - 1; i >= 0; i--) drop(recs[i]);
      recs = []; byUuid = {};
      for (var k in toonOf) { toonOf[k].toon.dispose(); } toonOf = {};
      for (var s in shellMats) shellMats[s].dispose(); shellMats = {};
      for (var s2 in creaseMats) creaseMats[s2].dispose(); creaseMats = {};
      if (group && group.parent) group.parent.remove(group);
      if (grad && keepGroup !== true) { grad.dispose(); grad = null; gradKey = ''; }
      for (var q in skipped) skipped[q] = 0;
      applied = false; enabled = true;
      return T;
    }, 'remove');

    T.optOut = function (obj, what) { if (obj) { obj.userData = obj.userData || {}; obj.userData[what === 'outline' ? 'toonOutline' : 'toon'] = false; } return T; };
    T.params = P;
    T.original = function (mesh) { var r = mesh && byUuid[mesh.uuid]; return r && !r.skip ? r.orig : (mesh ? mesh.material : null); };
    T.shellOf = function (mesh) { var r = mesh && byUuid[mesh.uuid]; return r && r.shell || null; };
    T.list = function () {
      return recs.map(function (r) {
        return { uuid: r.mesh.uuid, name: r.mesh.name || '', toon: r.shade && r.mesh.material === r.toon, shade: r.shade, outline: !!r.shell, open: !!r.open, crease: !!r.crease, outlineVisible: !!(r.shell && r.shell.visible), reason: r.reason, instanced: !!r.mesh.isInstancedMesh };
      });
    };
    T.state = function () {
      var shells = 0, vis = 0, toonM = 0, open = 0, cr = 0; recs.forEach(function (r) { if (r.open) open++; if (r.crease) cr++; if (r.shell) { shells++; if (r.shell.visible) vis++; } if (r.shade && r.mesh.material === r.toon) toonM++; });
      var sk = {}; for (var k in skipped) if (skipped[k]) sk[k] = skipped[k];
      return { ok: true, version: VERSION, applied: applied, enabled: enabled, preset: P.preset, shade: !!P.shade, outline: !!P.outline, bands: P.bands.length + 1,
        meshes: recs.length, toonMeshes: toonM, toonMaterials: Object.keys(toonOf).length, shells: shells, shellsVisible: vis, openShells: open, creases: cr, skipped: sk,
        widthPx: shellMats.ink ? +shellMats.ink.uniforms.uWidth.value.toFixed(2) : (function () { for (var q in shellMats) return +shellMats[q].uniforms.uWidth.value.toFixed(2); return 0; })(),
        updates: updates, errors: errors, lastError: lastErr };
    };
    Object.defineProperty(T, 'group', { get: function () { return group; } });
    if (opts.scene && opts.apply !== false) T.apply(opts.scene);
    return T;
  }

  function apply(scene, opts) { opts = opts || {}; var o = {}; for (var k in opts) o[k] = opts[k]; o.scene = scene; return create(o); }

  root.GameDNA_Toon3D = { version: VERSION, PRESETS: PRESETS, DEFAULTS: DEFAULTS, create: create, apply: apply, webglOK: webglOK };
})(typeof window !== 'undefined' ? window : this);
