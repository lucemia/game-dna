# Add Toon outlines and cel shading for a three.js scene to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `toon-outlines-3d.js` (one global, `GameDNA_Toon3D`), API reference `toon-outlines-3d.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame).
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Toon outlines and cel shading for a three.js scene [look].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Toon outlines and cel shading for a three.js scene:** a camera offset; one call to toon.update(dtMs) right before every renderer.render (play, pause, title / end, frozen stills); optional: fade(mesh) when the game fades occluding props with its own shader uniform.

## Element 1: Toon outlines and cel shading for a three.js scene (`toon-outlines-3d.js`, `GameDNA_Toon3D`)

Every lit material (Lambert, Phong, Standard) becomes a toon copy with 2-4 light bands, a cool shadow side, rim light and hard glints; every solid mesh gets an ink outline that shares its buffers, keeps a steady screen width and thins on small or far objects. The game's scene graph, rules, timings, colour flashes and fades keep working; setEnabled(false) / remove() restore the original look exactly.

**Parameters chosen:** `preset` = soft3, `width` = 2.2, `color` = tint, `rim` = 0.32.

**Where it goes** (by role; find these places in my game):

1. *Where the scene, camera and renderer are made (before the first frame, the boot, the `?t=` fast-forward):* Load `three.min.js`, then `toon-outlines-3d.js` verbatim. `const toon = GameDNA_Toon3D.create({ scene, camera, renderer, preset: 'soft3', width: 2.2, color: 'tint', rim: 0.32 })`. A restart that rebuilds in the same scene needs nothing; a new scene object: `toon.remove()` and create again.
2. *Every render path of the main scene (play, pause, title / end, frozen stills, autoplay), after the camera moved:* `toon.update(dtMs)` right before `renderer.render` (or right before the helper that renders).
3. *Props that the camera fades with a custom shader / uniform (screen-door dither):* Pass `fade: mesh => 0..1` (1 = solid) to create, so outlines hide while the prop fades.
4. *Scene objects that must not change (HUD meshes, debug helpers):* `obj.userData.toon = false` (subtree untouched) or `obj.userData.toonOutline = false` (shading, no outline).
5. *Settings menu (if any):* A "Toon look" switch calls `toon.setEnabled(on)`.

**Common mistakes** (symptom -> fix):

- `?t=` stills look original -> the still path renders without toon.update or create ran after the first render.
- Dark ghost outline where a prop fades -> the game fades with its own shader; pass fade(mesh).
- Grass / crowds without outlines -> instanced meshes get toon shading only (stated fallback); skinned / morphed meshes too.
- Hand-made MeshToonMaterial swaps or extra outline meshes -> remove them; the module mirrors the game's material changes itself.
- A new toon instance every restart -> check `toon.group.parent === scene` first; same scene = keep the instance.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Toon outlines and cel shading for a three.js scene] Toon look on every frame incl. `?t=&freeze=1`; `toon.state()` shells > 0, errors 0.
- [Toon outlines and cel shading for a three.js scene] Turn the camera: outlines stay on their objects, characters still face their move direction, feet on the ground.
- [Toon outlines and cel shading for a three.js scene] `?auto=1` ends exactly as before; no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `toon-outlines-3d.js` sha256 `af75ad34a2a329b5...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Toon outlines and cel shading for a three.js scene] Grep `GameDNA_Toon3D.create`: once per scene. Grep `toon.update(`: before every `renderer.render` of that scene.
- [Toon outlines and cel shading for a three.js scene] Grep `MeshToonMaterial`: only inside the module.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
