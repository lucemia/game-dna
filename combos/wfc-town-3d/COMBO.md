# Add wave-collapse town builder (3d) to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `wfc-town-3d.js` (one global, `GameDNA_WfcTown3D`), API reference `wfc-town-3d.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Wave-collapse town builder (3D) [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Wave-collapse town builder (3D):** three.js 0.149.0 (window.THREE, three.min.js next to the page); a WebGL canvas (and optionally a 2D canvas on top for the HUD); a start map: rows of digits (0 sea, 1 land, 2+ a house with 1+ storeys); a fixed 60 Hz update step; pointer or key input that calls grow / shrink / undo / redo.

## Element 1: Wave-collapse town builder (3D) (`wfc-town-3d.js`, `GameDNA_WfcTown3D`)

Adds a cosy 3D town builder (three.js 0.149.0): the player raises or lowers grid cells (sea -> land -> a house -> more storeys) and a wave-function-collapse solver picks every wall, door, window, balcony, lane, gable / hip / terrace / turret roof, stair and gate arch from socket rules, re-solving only the cells around the edit. Orbit camera, hover ghost, pop and dust on each edit, exact undo / redo, four palettes, soft shadows, gulls, a 2D map without WebGL. Deterministic from the seed and the edit history; verify() checks every side of every slot.

**Parameters chosen:** `palette` = harbour, `seed` = 1, `arch` = 9, `turret` = 7, `flat` = 0.8, `door` = 2.6, `balcony` = 0.38, `radius` = 2, `pitch` = 36, `zoom` = 1.05, `shadows` = soft, `gulls` = 3.

**Where it goes** (by role; find these places in my game):

1. *Files and the place it lives (decide before coding):* Load `three.min.js` then `wfc-town-3d.js` with plain `<script src>` tags before your game script. Pick the part of your game that becomes the builder (a town screen, a base, the whole game) and give it a WebGL `<canvas>` with your HUD canvas stacked on top.
2. *Once, where the builder starts (and before it: new tiles and weights):* `GameDNA_WfcTown3D.setWeight('arch', 9); setWeight('turret', 7); setWeight('flat', 0.8); setWeight('D', 2.6); setWeight('K', 0.38)`; then `town = GameDNA_WfcTown3D.create({canvas, overlay: hudCanvas, w, d, maxH, seed: 1, radius: 2, heights: rows of digits (0 sea, 1 land, 2+ houses), params: {palette: 'harbour', pitch: 36, zoom: 1.05, shadows: 'soft', gulls: 3}, onEdit: info => <your reaction>})`; `town.resize(cssW, cssH, devicePixelRatio)` now and on resize.
3. *Your fixed step (every loop that steps the game, fast-forwards included):* `town.update(stepMs)` once per step, `0` while your world is frozen.
4. *Where the builder is drawn:* `town.render()`, then your HUD on `town.overlayContext()` (CSS px) or your own canvas.
5. *Your input while the builder runs:* Pointer (CSS px of the canvas): `c = town.pick(x, y)`, hover `town.setHover(c, mode)`, click `town.grow(c.x, c.z)` / `town.shrink(c.x, c.z)`; a drag over ~8 px orbits (`town.orbit(-dx * 0.35)`, `town.setPitch`), wheel `town.zoomBy`. Keys: arrows through `town.gridDirFromScreen(dx, dy)` move a cursor cell; confirm grows, another key lowers; `town.undo()` / `town.redo()`; camera turns. Touch buttons for each.
6. *Your goals, unlocks, score:* In `onEdit(info)` read `town.town.counts()` (`land, houses, storeys, tallest, doors, arches, stairs, turrets, extra`) and drive your own goals or rewards; your autoplay (if any) builds through the same calls.

**Common mistakes** (symptom -> fix):

- The whole town reshuffles on each click -> you re-created the town or called `resolveAll()`; only `grow` / `shrink` / `set`.
- Undo gives a slightly different town -> call `town.undo()`, never re-solve or rebuild from heights.
- Different town on every reload -> a fixed `seed`; no `Math.random` in anything that edits the town.
- Clicks hit the wrong cell -> pass CSS px of the canvas to `pick`, call `resize` on load and resize.
- A still at `?t=` shows no pop or gulls in the wrong place -> `update(dt)` belongs in the fixed step, not the render loop.
- A new tile never appears -> its socket letters need `registerPair` with the sockets they may touch (and `allowAir` for sides open to the sky), before `create`.
- Black page on a device without WebGL -> keep the overlay canvas; the module draws a 2D map there.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Wave-collapse town builder (3D)] Clicking sea makes land, land a house, a house a storey; doors open onto lanes, ridges join, an arch appears between two houses with a lane through, stairs climb onto flat terraces.
- [Wave-collapse town builder (3D)] `town.town.verify().ok` is true after every edit; undo then redo gives the same `serialize()`.
- [Wave-collapse town builder (3D)] Your HUD never covers the island centre; a 390 px phone can build with touch.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `wfc-town-3d.js` sha256 `f872f25559c66b5b...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Wave-collapse town builder (3D)] Trace one click: pointer -> pick -> grow -> onEdit -> counts -> your goal or reward.
- [Wave-collapse town builder (3D)] Trace one undo: undo -> onEdit (kind undo) -> serialize() equals the snapshot before the edit.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
