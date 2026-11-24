# GameDNA_Toon3D (N-04 toon-outlines-3d) v1.1.0

One plain script, one global `GameDNA_Toon3D`, ASCII only, no imports. Needs three.js **0.149.0** as `window.THREE`
(load `three.min.js` first) or pass `options.THREE`. Without three.js it warns once and returns an instance whose
methods are safe no-ops (`ok: false`). It never draws without WebGL: the game's own fallback stays in charge.

It turns an existing three.js scene cel-shaded without touching the game's rules, scene graph or materials:

- **Toon shading.** Every lit mesh material (Lambert, Phong, Standard, Physical) is swapped for a `MeshToonMaterial`
  copy: same colour, map, vertex colours, emissive, transparency, side, fog, flat shading, clipping and the same
  `onBeforeCompile` patch (custom fades keep working). Lighting falls into 2-4 bands from a generated gradient map,
  the shadow band gets a cool tint, an optional rim light and a hard glint on shiny (Phong shininess >= 25,
  Standard roughness < 0.45) surfaces. One copy per original material: shared materials stay shared.
- **Ink outlines (inverted hull).** Each eligible mesh gets a back-face shell that **shares the mesh's position and
  index buffers** and is pushed out in screen space along smoothed normals (no gaps at hard box corners). Width is
  `width` px per 720 px of view height, capped at 16 % of the object's projected radius (small or far things get thin
  lines, minimum `minPx`), fogged like the scene. Line colour: `tint` (the material's colour, dark and saturated) or
  `ink` (one colour).
- **Out of the way.** Shells live in one group (`toon.group`) at the scene root and copy their mesh's world matrix
  right before they draw. The game's objects get no children, so bounding boxes, `traverse`, ray casts, feet checks,
  layers and shadow maps are unchanged. Shells never cast or receive shadows and ignore ray casts.
- **Live.** `update()` (once per frame, before render) picks up meshes added later, drops removed ones, adopts a
  material the game assigned itself, and mirrors host changes (colour, emissive, opacity, transparent, visible, map...)
  between each original material and its toon copy, in whichever direction they happened. Outlines hide while their
  mesh is invisible, transparent below 0.97 opacity, colour-masked, or faded by your `fade(mesh)` callback.
- **Exact restore.** `setEnabled(false)` puts the original material objects back (pixel-identical frame; used for
  before / after views) and `remove()` also deletes the shells and the group. The original materials are never
  disposed; only properties the game itself changed on the toon copy are written back to them.

**v1.1:** double-sided open sheets (capes, hoods, hems) get a rim shell pushed out along their border edges only (a
fold inside the sheet gets no line); big static meshes (world radius >= `creaseMinRadius`, terrain) get crease lines on
edges sharper than `creaseAngle`; outlines hide by themselves when the material's `userData` holds a fade value (a number
or a uniform `{value}` under a name containing fade / dither / alpha / opacity / visib, below 0.99); highlights above 0.78
are compressed so near-white materials keep their bands.

**Not handled (stated fallback):** `SkinnedMesh` and morph-target meshes, `InstancedMesh` (grass, crowds): toon
shading yes, outline no. `ShaderMaterial`, `RawShaderMaterial`, `MeshBasicMaterial` (sky, glows, UI tiles): left as
they are, no outline. Flat open shapes (Plane / Circle / Ring / Shape geometry: ground discs, decals): no outline unless
`outlineThin: true`. Overlay meshes (`depthTest` or `depthWrite` false): no outline. Crease lines are 1 device px.

## Integration (15 lines)

```js
// after the scene, camera and renderer exist (and before the first frame, so ?t=&freeze=1 stills are toon too)
const toon = GameDNA_Toon3D.create({ scene, camera, renderer, preset: 'soft3',
  // only if the game fades occluders with a value the module cannot find in material.userData: 0..1 (1 = solid)
  fade: mesh => myFadeOf(mesh) });
hud.userData.toon = false;              // whole subtree untouched (no toon, no outline)
waterMesh.userData.toonOutline = false; // toon shading, but no outline
// every frame, on EVERY render path (play, pause, frozen stills, title / end screens), right before renderer.render:
function frame(dtMs) {
  stepGame(dtMs);
  toon.update(dtMs);
  renderer.render(scene, camera);
}
// options menu
toon.set({ preset: 'crisp2' }); toon.set({ width: 3 }); toon.setEnabled(false); // classic look
// new level with a NEW scene object: toon.remove(); then create again for the new scene
```

## API

`GameDNA_Toon3D`: `version`, `PRESETS`, `DEFAULTS`, `create(options)`, `apply(scene, options)` (= create with that
scene), `webglOK()`.

| options | default | meaning |
|---|---|---|
| `scene`, `camera`, `renderer` | | the three.js objects; `renderer` gives the drawing-buffer size for the line width |
| `apply` | true | false = build the instance but leave the scene untouched until `toon.apply(scene)` |
| `preset` | `soft3` | `soft3` soft 3-band + tinted lines + rim, `crisp2` hard 2-band + ink lines, `painted4` 4 soft bands + thin tinted lines, `ink` outlines only (materials unchanged) |
| `shade` | preset | false = keep the materials, outlines only |
| `bands`, `levels`, `soft` | preset | band thresholds on `dot(N, L) * 0.5 + 0.5` (1-3 values), brightness per band (bands + 1 values), edge softness |
| `ambient` | preset | multiplier on hemisphere / ambient light inside toon materials (deeper shadow band) |
| `shadeTint` | preset | colour multiplied into the shadow side (cool shadows) |
| `rim`, `rimWidth`, `rimColor` | preset | rim light strength (0 = off), width (0..1 of the silhouette band), colour |
| `spec` | preset | hard glint strength on shiny materials |
| `outline` | true | false = no shells |
| `width` | preset | line width in px per 720 px of view height |
| `minPx`, `thin` | 1.1, 0.24 | thinnest line (px per 720), cap as a share of the projected object radius |
| `color`, `ink`, `tint` | preset | `tint` or `ink`; the ink colour; how dark tinted lines are |
| `bias` | 0.0025 | shells are pushed this share of their distance away from the camera (no z-fight) |
| `outlineThin`, `outlineUnlit` | false | also outline flat shapes, unlit (Basic) materials |
| `creases`, `creaseAngle`, `creaseMinRadius` | true, 40, 5 | crease lines on big static meshes |
| `include(mesh)` | | return false to leave a mesh alone |
| `fade(mesh)` | | 0..1; below 0.99 the mesh's outline is hidden; only needed when the fade value is not in `material.userData` |
| `THREE` | `window.THREE` | |

| instance | |
|---|---|
| `ok`, `error` | false / message when three.js is missing (all methods are no-ops) |
| `apply(scene?, opts?)` | convert the scene now (idempotent); `create` already does it when `scene` is given |
| `update(dtMs)` | once per frame before render: new / removed meshes, host material changes, line width, visibility. Deterministic, no clock of its own |
| `setEnabled(on)` | fast toggle (material pointer swap + group visibility), for split views and an options switch |
| `set(opts)` | change parameters live; switching `shade` / `outline` / `color` rebuilds |
| `remove()` | restore every original material object, delete shells, group and toon copies |
| `optOut(obj, 'outline'?)` | same as setting `userData.toon` / `userData.toonOutline` to false |
| `original(mesh)`, `shellOf(mesh)` | the original material of a mesh, its shell (checks) |
| `list()` | per touched mesh `{uuid, name, toon, shade, outline, open, crease, outlineVisible, reason, instanced}`; `reason` says why it has no outline |
| `state()` | `{applied, enabled, preset, meshes, toonMeshes, toonMaterials, shells, shellsVisible, openShells, creases, skipped: {unlit, instanced, flat, doubleSide, ...}, widthPx, updates, errors}` |
| `group`, `params` | the outline group, the live parameters |

## Rules for integrators

- Call `toon.update()` on **every** render path, after the camera moved: play, pause, title / end screens, frozen
  `?t=` stills. Shells read the mesh's matrix at draw time, but new meshes and material changes come in through update.
- Keep every caller working: autoplay, restart (a restart that rebuilds meshes in the same scene needs nothing; a new
  scene object needs `remove()` + `create`), picking, camera controls, x-ray / override-material passes (shells only
  draw on layer 0 and never in `scene.overrideMaterial` passes of other layers).
- Do not edit materials to "look toon" by hand and do not add outline meshes yourself: the game's own colour flashes,
  fades and tints keep working through the mirror.
- If the game hides an occluding prop with a custom shader whose fade value is not kept in `material.userData`, pass
  `fade(mesh)`.

## Self-check without a browser

- `GameDNA_Toon3D.create` appears once per scene; `toon.update(` appears in every function that calls `renderer.render`
  (or right before each call).
- Nothing in the game assigns `material = ` on meshes to fake toon; no `new THREE.MeshToonMaterial` outside the module.
- The before / after toggle (if any) uses `setEnabled`, not `remove()` + `create` every frame.
- `state().errors` is 0 and `state().shells` > 0 after the first frame; `skipped` lists the meshes you expected to be
  left alone (instanced grass, Basic-material glows, flat ground planes).
