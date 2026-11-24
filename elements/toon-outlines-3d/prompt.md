# Toon outlines and cel shading for a three.js game

Defaults: preset = {{preset}} (soft3), line width = {{width}} (2.2 px per 720 px of view height), line colour = {{color}} (tint), rim light = {{rim}} (0.32).

Give my three.js game a cel-shaded look: banded toon lighting on every lit material and a dark ink outline around every solid object, without changing its rules, models or timing.

## Use the module, do not rewrite it

The folder has `toon-outlines-3d.js` (global `GameDNA_Toon3D`) and its README. Load it with `<script src>` right after `three.min.js`, unchanged. Do not write your own toon shader, outline meshes or material swaps.

## Integration points

1. Where the scene, camera and renderer exist, before the first frame is drawn (so `?t=` stills and autoplay are toon too): `const toon = GameDNA_Toon3D.create({ scene, camera, renderer, preset, width, color, rim })`. If the game rebuilds into the same scene on restart, nothing else is needed; if it makes a new scene object, call `toon.remove()` and create again for the new scene.
2. Right before EVERY `renderer.render` of the main scene, after the camera moved: `toon.update(dtMs)`. Find every render path: playing, paused, title and end screens, frozen still frames, autoplay. If a helper renders, call it right before that helper.
3. Faded props: the module hides outlines of transparent and invisible meshes and of materials whose `userData` holds a fade value (fade, dither, alpha or opacity). If the game fades props some other way, pass `fade: mesh => 0..1` (1 = solid).
4. Things that must stay as they are (HUD meshes in the scene, debug helpers, a skybox made of a lit material): `obj.userData.toon = false`. Shading but no outline: `obj.userData.toonOutline = false`.
5. If the game has a settings menu, add a "Toon look" option that calls `toon.setEnabled(on)`; never remove and recreate every frame.

## Rules

- The module swaps materials for toon copies and back; the game's own colour flashes, tints, fades and opacity changes keep working through it. Do not edit materials by hand to make them "look toon".
- Outlines live in their own group: do not move, parent or delete them; picking, bounding boxes and shadows are unaffected.
- Skinned, morph-target and instanced meshes get toon shading but no outline; unlit (Basic) and custom shader materials stay unchanged. That is expected, not a bug.
- Keep every caller working: autoplay, restart, URL parameters, keyboard shortcuts, picking, camera controls, extra render passes (x-ray, silhouettes, minimaps).
- Characters must still face where they walk or attack and keep their feet on the ground; the module never moves anything.
- If WebGL or three.js is missing, keep the game's existing fallback.

## Self-check without a browser

- `GameDNA_Toon3D.create` appears once per scene; `toon.update(` appears right before every `renderer.render` of that scene, including the frozen-still path.
- No `new THREE.MeshToonMaterial` and no outline meshes outside the module.
- Trace one frame: step, camera, `toon.update`, render.

## Acceptance checks

- No console errors; `?auto=1` plays to the same end as before.
- Objects show 2-3 clear light bands and an outline; small and far objects get thinner lines; no outline floats off its object, flickers or shows through walls.
- Turn the camera: outlines follow every object; characters still face their move direction; feet stay on the ground.
- Faded or transparent props lose their outline instead of drawing a dark ghost.
- `toon.state()` shows shells > 0 and errors 0; `toon.setEnabled(false)` gives back the original look exactly.
- CHANGES.md lists where `create` and `update` were added and which objects you opted out.
