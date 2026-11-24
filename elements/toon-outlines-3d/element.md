# N-04 Toon outlines and cel shading (three.js addon)

## What it is

One call turns an existing three.js scene into a cel-shaded one: light falls into a few flat bands with a cool shadow
side, a thin rim of light catches the silhouettes, shiny things get a hard glint, and every solid object is drawn with
an ink outline whose width stays steady on screen. It is the look of a 2020s cel-shaded indie: readable shapes, flat
colour areas, hand-inked edges, on top of a game that was built with ordinary Lambert / Phong materials.

What makes it right rather than "a toon shader bolted on":
- **Nothing in the game changes.** Materials are swapped for toon copies (same colour, map, vertex colours,
  transparency, fog, flat shading and the game's own `onBeforeCompile` patches); the game's scene graph gets no
  children; outline shells sit in one group at the scene root and copy their mesh's matrix at draw time. Bounding
  boxes, ray casts, feet checks, layers, x-ray passes and shadow maps see the same scene as before.
- **The game keeps control of its materials.** A hit flash, a tint, a fade written to the original material (or to
  the toon copy) is mirrored to the other one every update. A material the game swaps in itself is adopted.
- **Gap-free outlines on hard corners.** The hull is pushed out along normals averaged per position (a box corner
  pushes diagonally), in screen space, so boxes and low-poly rocks have closed outlines at every angle.
- **Lines that read at any distance.** Width is set per 720 px of view height and capped at a share of the object's
  projected radius: a far tree or a small buckle gets a hairline, never a black blob.
- **Exact restore.** `setEnabled(false)` gives a pixel-identical frame of the original; `remove()` puts back the very
  same material objects (checks/toon-checks.py compares pixels and a scene snapshot).

## Default parameters

| key | default | meaning |
|---|---|---|
| preset | soft3 | soft3: 3 soft bands (0.32 / 0.62 / 0.84), cool shadow tint, tinted lines 2.2 px, rim 0.32; crisp2: 2 hard bands, ink lines 2.6 px; painted4: 4 soft bands, thin tinted lines; ink: outlines only, materials unchanged |
| width | 2.2 | line width in px per 720 px of view height (scales with the view; 4.4 device px at 1280x720 dpr 2) |
| color | tint | tint: the material colour at 26 % lightness, saturated, mixed half with ink; ink: one colour (#17141f) |
| rim | 0.32 | rim light strength on the silhouette band (width 0.3), stronger on the lit side |

## Variants

- Soft 3-band (default): adventure / exploration scenes.
- Crisp 2-band: bold graphic look, tactics boards seen from far.
- Painted 4-band: gentler banding, thin tinted lines.
- Ink outline only: keep the game's lighting, add outlines.

## Interface

Needs: a three.js 0.149.0 scene, camera and renderer; one `toon.update(dtMs)` right before every render of that scene
(play, pause, title / end, frozen stills); optionally `fade(mesh)` when the game fades occluding props with its own
shader.

Provides: `create` / `apply`, `update`, `set`, `setEnabled`, `remove`, `optOut` (or `userData.toon = false`,
`userData.toonOutline = false`), `state()`, `list()` (why a mesh has no outline), `original(mesh)`, `shellOf(mesh)`.

## Screen rules (exact numbers)

- Bands on `dot(N, L) * 0.5 + 0.5`: soft3 thresholds 0.40 / 0.60 with 0.03 soft edges, levels 0.30 / 0.60 / 0.84;
  hemisphere / ambient light inside toon materials x 0.9; shadow side (below the first threshold or in the shadow map)
  multiplied by #c4cdf0.
- Outline width w = clamp(width x viewHeight / 720, minPx, 0.24 x projected radius of the mesh's bounding sphere),
  minPx = 1.1 px per 720. Shell depth pushed back by 0.25 % of its view distance (no z-fight with thin parts).
- Outlines for lit, depth-tested meshes (not Plane / Circle / Ring / Shape geometry), not instanced, skinned or
  morphed. Double-sided open sheets (capes, hoods) get a rim shell pushed out along their border edges only. Hidden while
  the mesh (or a parent) is invisible, colour-masked, transparent below 0.97 opacity, or faded: a value below 0.99 in
  `material.userData` under a fade / dither / alpha / opacity name (number or uniform), or `fade(mesh)`.
- Crease lines (1 device px, 85 % opacity) on edges sharper than 40 deg of meshes with a world radius >= 5 (terrain).
- Highlights above 0.78 are compressed with a soft knee, so near-white albedo keeps its band steps.
- Glint: smoothstep(0.965, 0.975) of N.H on the lit side, only for Phong shininess >= 25 or Standard roughness < 0.45.
- Exact restore: setEnabled(false) and remove() frames equal the original frame pixel for pixel (320x180 readback).

## Common mistakes (symptom -> fix)

- Toon on the first frame missing / `?t=` stills look original -> `create` ran after the first render or the still
  path skips `toon.update`; create before boot and update on every render path.
- Outlines lag one frame behind moving characters -> impossible by design (shells copy the matrix at draw time); if
  seen, the game renders a cloned scene: create the toon for the scene that is rendered.
- A black ghost where a prop fades out -> the game fades with a shader value the module cannot see (not in
  `material.userData`); pass `fade(mesh)`.
- Hit flash or tint no longer shows -> the game assigns a NEW material object every flash: fine, it is adopted on the
  next update; if it writes a field the mirror does not copy, tell the module's README list.
- Grass has no outlines -> instanced meshes get toon shading only (stated fallback).
- Outlines through walls -> the game draws something with `depthTest: false`; those meshes are skipped, keep them so.

## Acceptance moments

Demo (`demo/index.html`, island loop about 26 s, terrace loop 11 s; `?t=&freeze=1`; left of the divider = original,
right = toon):
- `?t=7000&freeze=1`: island courtyard, soft 3-band; the hero walks past a waving villager; outlines close around the
  boxy characters, pillars and trees; cool shadow band on the plaza.
- `?t=15000&freeze=1&preset=crisp2`: crisp 2-band with ink lines across the plaza, lantern and pillars; no prop is mid-fade.
- `?t=16000&freeze=1&preset=painted4&view=toon`: painted 4-band, full frame.
- `?scene=terrace&t=3300&freeze=1`: the knight strikes the brute on the terraces; terrace cliffs and units outlined.
- `?scene=terrace&t=5200&freeze=1&preset=ink`: ink outlines only over the game's own lighting (the shaman's bolt).

## Frame time (checks/perf.json, 2026-11-18)

SwiftShader (CPU WebGL) in headless Chromium, live `?auto=1`, median rAF interval of 3 runs; the machine load stayed at 6-12
(other builders), so every number is an upper bound and only the before / after ratio means something. Each outlined
mesh is drawn a second time (back faces, no fragment lighting), so the cost is vertex work and draw calls.

| starter | view | original | toon (soft3) |
|---|---|---|---|
| N-01 island | 1280x720 dpr 2 | 133 ms | 233 ms |
| N-01 island | 390x844 dpr 3 | 67 ms | 100 ms |
| N-03 terraces | 1280x720 dpr 2 | 100 ms | 150 ms |
| N-03 terraces | 390x844 dpr 3 | 83 ms | 117 ms |
