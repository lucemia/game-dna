# Add painted billboard sprites in a 3d diorama to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `billboard-sprites-3d.js` (one global, `GameDNA_Billboards3D`), API reference `billboard-sprites-3d.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Painted billboard sprites in a 3D diorama [actors].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Painted billboard sprites in a 3D diorama:** a camera offset; per unit, every frame: feet position x, z on the floor and the id it targets (or null); floor height under a point: groundY(x, z) or the ground meshes; events: attack start, hit taken, death, restart / respawn; the art: kitSource (demo kit), or imageSource / canvasSource with the art's native facing and painted variants.

## Element 1: Painted billboard sprites in a 3D diorama (`billboard-sprites-3d.js`, `GameDNA_Billboards3D`)

Every character becomes a painted sprite on a yaw-only quad that faces the camera, feet on the floor or tile top, a soft blob shadow below. The side it looks at is read on screen from the camera (target first, then walk direction), painted left / right variants are used instead of mirrors and art marked mirror:never is never mirrored. Walk poses advance with distance; single pictures hop; attack, hurt, down and the hit flash live in the material. Game rules, positions and timings never change.

**Parameters chosen:** `filter` = smooth, `mode` = camera, `shadow` = blob, `flashMs` = 200, `height` = 1.6. (`push`, `lightProbe`: not used; your game keeps its own.)

**Where it goes** (by role; find these places in my game):

1. *Where the scene, camera and renderer are made (and the boot: first step, `?t=` fast-forward, first frame):* Load `three.min.js`, then the kit files if given, then `billboard-sprites-3d.js` verbatim. `const bb = GameDNA_Billboards3D.create({scene, camera, renderer, groundY: floorHeight, filter: 'smooth', mode: 'camera', shadow: 'blob', flashMs: 200})`. With the kit: boot inside `GameDNA_DemoKit.ready(boot)`.
2. *Where each unit / character model is created (also later spawns):* `bb.add({id, source: GameDNA_Billboards3D.kitSource(GameDNA_DemoKit, kitId), x, z, h: 1.6 * role})`; hide the old mesh (`visible = false`) but keep the object for picking / position reads.
3. *The render path(s): after the game step and AFTER every camera move, before renderer.render (play, pause, frozen stills):* `bb.move(id, feetX, feetZ)`, `bb.setTarget(id, foeOrSpeakerId | null)`, then `bb.update(dtMs)` (0 when paused or frozen).
4. *Attack, hit, death, restart / respawn events:* `bb.play(id, 'attack', {ms})`, `bb.play(id, 'hurt')`, `bb.play(id, 'down')` + `bb.set(id, {alpha})`, restart: `bb.move` + `bb.play(id, 'idle')`.
5. *2D overlays attached to units (HP bars, names, damage numbers, bubbles, selection):* `bb.anchor(id, 'head')` -> `{x, top, w, h, visible}` in CSS px of the canvas.

**Common mistakes** (symptom -> fix):

- Characters float half a body above the tile -> the old model centre was passed; pass the feet position and let groundY give the floor height.
- Characters face the wrong way after the camera turns -> a facing was typed from world x or a team side; use setTarget / move only.
- Weapon hand swaps -> the sprite was mirrored by hand (scale.x = -1); never mirror, the module picks painted variants.
- Sprites edge-on or a frame late -> bb.update ran before the camera moved, or the frozen-still path skips bb.update(0).
- Old low-poly unit still visible next to the sprite, or picking broken -> hide the mesh, do not delete the object.
- Feet slide -> the mesh was moved directly; always bb.move so the walked distance drives the walk pose.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Painted billboard sprites in a 3D diorama] Turn the camera to 3+ yaws: every character still looks at its target / walking direction on screen; held weapons never swap hands.
- [Painted billboard sprites in a 3D diorama] Feet touch the floor / tile top; blob shadows under the feet.
- [Painted billboard sprites in a 3D diorama] `?auto=1` ends exactly as before; `?t=<ms>&freeze=1` is stable; no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `billboard-sprites-3d.js` sha256 `3faefd26ea6ead9c...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Painted billboard sprites in a 3D diorama] Grep `GameDNA_Billboards3D.create`: once. Grep `bb.add(`: once per unit, also in spawn code.
- [Painted billboard sprites in a 3D diorama] Grep `bb.update(`: in every render path, after the camera code.
- [Painted billboard sprites in a 3D diorama] Grep `scale.x = -1` / `rotation.y =` on unit meshes: none left that the player sees.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
