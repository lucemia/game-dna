# Add 3D tactics battlefield on a heightmap grid to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `tactics-grid-3d.js` (one global, `GameDNA_TacticsGrid3D`), API reference `tactics-grid-3d.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame). Turn/phase logic stays mine; modules still update every step to animate.
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) 3D tactics battlefield on a heightmap grid [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **3D tactics battlefield on a heightmap grid:** three.js 0.149.0 (window.THREE, three.min.js next to the page); a WebGL canvas and a 2D overlay canvas stacked on it; terrain per tile; a list of combatants/units; a fixed 60 Hz update step.

## Element 1: 3D tactics battlefield on a heightmap grid (`tactics-grid-3d.js`, `GameDNA_TacticsGrid3D`)

Replaces the flat map view of a turn-based grid game with a three.js 0.149.0 heightmap battlefield: terraced tiles (grass, stone, sand, water) with trees, rocks and ruins; move / attack / threat ranges that respect height cost, jump and water; a path arrow over the terraces; a camera that turns in 90-degree steps and zooms; low-poly units that walk tile by tile, hop terraces, lunge, cast, flinch and fall, always facing their move or target. The game keeps turns, stats, damage and AI.

**Parameters chosen:** `zoom` = 2, `camStep` = 0, `pitch` = 33, `light` = day, `overlay` = pulse, `grid` = 0.22, `shadows` = soft, `unitHeight` = 0.95, `jump` = 2, `climbCost` = 1, `walkMs` = 250.

**Where it goes** (by role; find these places in my game):

1. *Page:* A WebGL `<canvas>` and a 2D overlay `<canvas>` stacked in one 16:9 box; `<script src="three.min.js">` (0.149.0, the file given, never a CDN) then the module, verbatim.
2. *Once, where your map starts:* `tg = GameDNA_TacticsGrid3D.create({canvas, overlay, view: {w: 960, h: 540}, map: {heights, terrain, props}, units: () => living units, params: {zoom: 2, camStep: 0, pitch: 33, light: 'day', overlay: 'pulse', grid: 0.22, shadows: 'soft', unitHeight: 0.95, jump: 2, climbCost: 1, walkMs: 250}})`, `tg.resize(cssW, cssH, devicePixelRatio)`, and `tg.addActor({id, side, cls, x, z})` per unit (cls knight / lancer / archer / brute / shaman).
3. *Your selection and range code:* `reach = tg.reachOf(unit)` (unit has `x, z, side, mv, jump, rng`), `tg.setOverlay('move', reach.stops)`, path `tg.setPath(tg.pathTo(reach, x, z))`, cursor `tg.setCursor(x, z)`, enemy zones `tg.setOverlay('threat', tg.threatOf(enemies))`; keys through `tg.gridDirFromScreen(dx, dy)`, mouse through `tg.pickTile(px, py)`; Q / E `tg.rotate`, wheel `tg.zoomBy`.
4. *Your move and attack:* `tg.walk(id, path, {onDone})` (write the tile in onDone); `tg.attack(att, def, {onImpact, onDone})` with your damage code in onImpact, then `tg.hurt(def, att)` / `tg.defeat(def)`; AI and autoplay wait for onDone.
5. *Your fixed step and draw:* `tg.update(dtMs)` every step (0 while frozen); `tg.render()` then your HUD on `tg.overlayContext()` with `tg.anchorOf(id)`.

**Common mistakes** (symptom -> fix):

- Units walk backwards -> a custom model needs its own `facingOffset` (`setModel` / `registerLook`); never rotate per scene.
- Feet float on terraces -> never move the actor objects yourself; use `walk` / `setTile`.
- Arrow keys go the wrong way after a camera turn -> map keys with `gridDirFromScreen`.
- Nothing moves in `?t=&freeze=1` -> `update` runs in the fixed step, not in requestAnimationFrame.
- HP drops before the swing lands -> damage only inside `onImpact`.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [3D tactics battlefield on a heightmap grid] Selecting a unit shows blue reach that stops at cliffs higher than its jump and at water, a red strike fringe, and a gold path arrow that climbs the terraces; hovering an enemy shows its striped threat zone.
- [3D tactics battlefield on a heightmap grid] Q / E turn the camera 90 degrees (eased) and arrows still move the cursor the way the screen shows; the wheel zooms.
- [3D tactics battlefield on a heightmap grid] Every walking unit faces its step and every attacker its target (`state()` facesMove / facesTarget true), feet stay on the tile tops (`feetOk`), autoplay ends the same way as before.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `tactics-grid-3d.js` sha256 `c1a50476127b5afb...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [3D tactics battlefield on a heightmap grid] Trace one move (select -> reachOf -> walk -> onDone) and one attack (attack -> onImpact -> your damage -> hurt / defeat -> onDone -> next).
- [3D tactics battlefield on a heightmap grid] A step from height 1 to 3 costs terrain 1 + 2 x 1; with jump 2 a 3-level climb is impossible.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
