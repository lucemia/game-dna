# Add Isometric height & jump to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `iso-height-map.js` (one global, `GameDNA_IsoHeight`), API reference `iso-height-map.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Isometric height & jump [foundations].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Isometric height & jump:** a tile grid; a list of combatants/units; a unit draw function that can draw at given feet coordinates; a fixed 60 Hz update step; input (directions, confirm, cancel, pointer).

## Element 1: Isometric height & jump (`iso-height-map.js`, `GameDNA_IsoHeight`)

Turns a flat tile tactics map into a 2:1 isometric height map. Every tile gets a height level; a unit may climb at most its jump and drop at most jump + fall; ranged attacks gain range from high ground; damage is multiplied for attacking from above and from the side or back (units have a facing, chosen at the end of a human action). The module owns projection, picking (screen px -> tile, with height), reach, painter's draw order with the game's units interleaved, an outline for units hidden behind taller blocks, the cursor on tile tops, 90-degree camera turns and an optional wait-time turn order.

**Parameters chosen:** `jump` = 3, `fall` = 2, `hgRange` = 2, `hgDamage` = 10, `side` = 1.25, `back` = 1.5, `step` = 4, `xray` = active, `facing` = choose, `overlay` = pulse.

**Where it goes** (by role; find these places in my game):

1. *Your map data:* Add a height grid the size of the tile layout: open ground and roads 1, rough or cover tiles 2-3, walls and impassable tiles 5-6 (still impassable by cost), water 0, plus a rise or two. On the route between the start areas no step may climb more than 3. Map each tile type to an art kind (`grass moss dirt road sand snow stone stairs rock wood water`).
2. *After your map and units exist, before the first frame and before any `?t=` replay:* `iso = GameDNA_IsoHeight.create({cols, rows, view, params: {jump: 3, fall: 2, hgRange: 2, hgDamage: 10, side: 1.25, back: 1.5, step: 4, xray: 'active', overlay: 'pulse'}, height, terrain, cost, units, occupant, alive, idOf, isEnemy, team, moveOf, jumpOf, rangeOf, facingOf, setFacing, drawUnit, drawPos, getCursor})`. `view` = the map area above your HUD. `units()` = every unit to draw (dying ones too). `drawUnit(ctx, u, fx, fy, info)` calls your own unit drawing with the context translated so the feet land on (fx, fy); when your drawing always paints on one global context and `ctx` is a different canvas (the outline mask), draw just the sprite image into `ctx`. `drawPos(u)` = fractional tile `{x: px / TILE, y: py / TILE}` while you animate a unit in pixels, else null. `getCursor()` = your cursor tile, null when hidden or off the map.
3. *Your reachability, AI distance fields and attack checks:* In each neighbour loop add `if (!iso.canStep(u, x, y, nx, ny)) continue;` (a field built outward from the targets tests the move from the neighbour to the current tile, so pass the moving unit in). Where you test "can attack", use `iso.canHit(att, ax, ay, tx, ty)`. Multiply your damage by `iso.damageMod(att, def).mult` and round.
4. *The end of a unit's action:* Human: `iso.chooseFacing(u, () => <your existing end-of-action code>)` (facing `choose`; with `auto` skip it). AI and autoplay: `iso.setFacing(u, iso.bestFacing(u))` and continue at once; they never open the picker.
5. *Your fixed 60 Hz step:* `iso.update()` first, also inside the `?t=&freeze=1` replay loop.
6. *Your draw pass:* Background, then `iso.draw(ctx)` in place of the flat ground and the unit loop, then effects, HUD, then `iso.drawUI(ctx, hudRects)`. Disable your own ground, cursor and unit loop with `if (false)` (do not delete). Optional: `iso.showRange(unit)` while a destination is being chosen, `iso.clear()` after.
7. *Your input handlers:* keydown: `if (iso.key(e.code, true, e.repeat)) { e.preventDefault(); return; }` then your existing handling (it takes only the facing picker's keys and Q/E rotate); keyup: `iso.key(e.code, false)`. Pointer -> tile: `iso.pick(canvasX, canvasY)` instead of dividing by the tile size; HUD taps unchanged. During the facing picker a tap on a neighbour tile faces it (`iso.setFacing(u, iso.facingToward(...))`, then `iso.press('a')`).
8. *Your turn order:* Keep side phases if the game has them. If units act one at a time: `iso.wt.reset(units)` at start, `iso.wt.next()` picks the next unit, `iso.wt.end(u, {moved, acted})` ends its turn, `iso.drawOrder(ctx, x, y, 7)` draws the bar.

**Common mistakes** (symptom -> fix):

- Units float above blocks or are never covered -> the game still draws its units itself; draw them only through `drawUnit` inside `iso.draw`.
- Autoplay stalls next to a cliff -> the AI's distance field ignores `canStep`; give it the moving unit and test the step.
- Taps select the wrong tile on high ground -> the pointer still divides by the tile size; use `iso.pick`.
- A second copy of every unit appears on screen -> `drawUnit` ignored `ctx` and painted the outline mask on the main canvas.
- `?t=&freeze=1` shots show the camera mid-pan or no walks -> `iso.update()` is not in the replay loop.
- The manual game hangs after a move -> the facing picker is open but your key handler never calls `iso.key` first.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Isometric height & jump] `?auto=1` still reaches the end screen with no errors.
- [Isometric height & jump] The map is isometric with raised blocks and shaded cliff faces; the cursor sits on the tile top at its height.
- [Isometric height & jump] A cliff taller than a unit's jump is not reachable; stairs or ramps are.
- [Isometric height & jump] A unit behind a tall block is covered by it and shows an outline when active or under the cursor.
- [Isometric height & jump] Attacking from above or from behind shows a higher damage; a human unit chooses a facing after acting; Q/E rotate the map.
- [Isometric height & jump] Restart, end turn and every existing control still work.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `iso-height-map.js` sha256 `55e13ce95c0f06ac...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Isometric height & jump] Every original function exists; every `iso.` call sits in the steps above; `iso` exists before the first frame and the freeze loop.
- [Isometric height & jump] Trace one autoplay turn: reach (with `canStep`) -> walk -> attack (`canHit`, `damageMod`) -> `setFacing` -> the turn ends.
- [Isometric height & jump] Trace one human turn: tap (via `iso.pick`) -> move -> attack -> `chooseFacing` -> Z through `iso.key` -> end of action.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
