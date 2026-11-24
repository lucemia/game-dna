# Add pseudo-3d flight ground to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `pseudo3d-flight.js` (one global, `GameDNA_Flight`), API reference `pseudo3d-flight.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Pseudo-3D flight ground [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Pseudo-3D flight ground:** a top-down tile map: size, tile size, tile id per tile, the tile art (canvas per tile) or a colour per tile id; a landing rule per tile: canLand(tx, ty) (flat, walkable, free); a camera offset; a fixed 60 Hz update step; input (directions, confirm, cancel, pointer); optional: billboard list (trees, rocks, houses, towns), mini-map markers (goals).

## Element 1: Pseudo-3D flight ground (`pseudo3d-flight.js`, `GameDNA_Flight`)

A flight mode for a top-down game: a take-off key turns the walking map into a perspective, scanline-scaled ground with a horizon sky band (zoom, turn and tilt over the transition). The player flies a mount (turn with a slight horizon tilt, speed up, slow down) past billboards scaled by distance, with the mount's shadow and a mini-map, and lands only where the game says the ground is flat; the landing eases back to the exact walking view. The module draws the whole map view while busy.

**Parameters chosen:** `speed` = 72, `turn` = 100, `bank` = 5, `height` = 56, `horizon` = 0.3, `transition` = 600, `fog` = 0.6, `sky` = day, `mount` = bird, `minimap` = on. (`res`: not used; your game keeps its own.)

**Where it goes** (by role; find these places in my game):

1. *After your map and tile art exist, before the first frame:* `fl = GameDNA_Flight.create({cols, rows, tile, view, tileAt, tileImage, canLand, topdown, wrap, outsideTile, billboards, markers, onLand, params: {speed: 72, turn: 100, bank: 5, height: 56, horizon: 0.3, transition: 600, fog: 0.6, sky: 'day', mount: 'bird', minimap: 'on'}})`. `view` = the map rectangle in the canvas (below a HUD band). `tileAt(tx, ty)` = your tile id; `tileImage(id, tx, ty)` = the tile canvas your map draws. `canLand(tx, ty)` = in the map, walkable, flat, nobody and nothing on it. `topdown()` = your walking camera `{x, y}` (world px at the view's top-left). `wrap: true` only for a wrapping world; otherwise `wrap: false, outsideTile: <border tile id>`. `billboards` = `{x, y, kind}` per tree / rock / house tile (`tree pine rock town tower mountain`). `onLand: L => {...}` puts the hero's centre at `L.x, L.y` and recomputes your camera exactly as walking does.
2. *Your fixed 60 Hz step:* `fl.update()` every step; while `fl.busy()`, return early from the walking-map update only (no walking, enemy touches, interactions, click-to-walk); dialogs, battles and scene changes stay as they were.
3. *Your walking input (a key the game does not use yet, e.g. F):* On the walking map with no dialog: `fl.takeOff({x: heroCentreX, y: heroCentreY, facing: 'up'|'down'|'left'|'right'})`; add the key to your hint line or HUD.
4. *Your keydown / keyup handlers:* First in keydown: `if (fl.key(e.code, true)) { e.preventDefault(); return; }`; keyup: `fl.key(e.code, false)`. True only while flying, so walking keys and shortcuts are untouched. A game that polls its own key sets releases them at take-off.
5. *Your map draw pass:* `if (!fl.draw(ctx)) <your map drawing>`; HUD on top. Restart / new game: `fl.reset()`.
6. *Your autopilot (if any):* Unchanged: it never presses the take-off key, so `?auto=1` ends exactly as before.

**Common mistakes** (symptom -> fix):

- The landing ends with a jump to another spot -> `onLand` moved the hero but not the camera; recompute the camera there, the module reads `topdown()` during the landing.
- Take-off starts somewhere else than the walking view -> `topdown()` or `view` is wrong (camera in world px at the view's top-left; view below the HUD band).
- The mount lands in water or on a tree -> `canLand` returned true for it; only flat walkable free tiles.
- The take-off key also cancels a menu or opens something -> it was already bound; pick a free key.
- Enemies catch the hero while flying, or the autopilot changed its ending -> the walking update still runs while `busy()`; return early.
- The flight ground looks like flat colour blocks -> pass `tileImage` with your real tile canvases.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Pseudo-3D flight ground] Take-off on grass: in 600 ms the map rotates, zooms and tilts to a horizon with sky; the mount flies with its shadow; trees and houses stand as billboards.
- [Pseudo-3D flight ground] Turning banks the mount and tilts the horizon slightly; up/down change speed; the mini-map shows mount and goal.
- [Pseudo-3D flight ground] Landing over water or trees is refused ("NO LANDING"); over grass it ends exactly on the walking view with the hero on that tile.
- [Pseudo-3D flight ground] `?auto=1` ends the same as before; no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `pseudo3d-flight.js` sha256 `b7542db32d10802b...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Pseudo-3D flight ground] Every `fl.` call sits in the steps above and `fl` exists before the first frame.
- [Pseudo-3D flight ground] Trace a flight: take-off -> `busy()` -> walking update skipped -> land over grass -> `onLand` moves hero and camera -> walking resumes.
- [Pseudo-3D flight ground] Trace `?auto=1`: the take-off key is never pressed; with `busy()` false the walking update runs as before.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
