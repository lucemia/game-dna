# Add Stealth vision cones to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `vision-cones.js` (one global, `GameDNA_VisionCones`), API reference `vision-cones.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Stealth vision cones [rules].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Stealth vision cones:** a fixed update step that calls update(dt) once per step after enemies move (also run by ?t= fast-forward and ?auto=1), update(0) while paused or behind a window; the player's point in world px (player(): {x, y} or null) and the tiles or boxes that block sight (walls); per guard an id and a source (world px, or null when dead) or a patrol route; remove(id) on death; clear() on new game; hiding spots: hidden(x, y) -> 0..1 cover, true for tall grass, 'shadow' for shade (optional); a camera offset; an enemy action chooser.

## Element 1: Stealth vision cones (`vision-cones.js`, `GameDNA_VisionCones`)

Guards see through view cones clipped by walls (the same rays decide what is drawn and who is seen); each has a suspicion meter that fills faster close and centred and drains out of sight, a '?' badge whose glyph fills with the meter, then a red '!' on alert; an alerted guard calls nearby guards, loses the player and searches. Tall grass hides completely, shade halves sight. Patrols with look-around turns; guards face their cone. Alerts come back as hooks for the game's own chase rules.

**Parameters chosen:** `range` = 150, `fov` = 80, `react` = 900, `decay` = 2600, `sweep` = 55, `callRadius` = 170, `shadow` = 0.5, `opacity` = 1, `palette` = lamp, `render` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once, after the map exists (before the first new game):* `vision = GameDNA_VisionCones.create({scale: VIEW_H / 360, params: {range: 150, fov: 80, react: 900, decay: 2600, sweep: 55, callRadius: 170, shadow: 0.5, opacity: 1, palette: 'lamp', render: 'auto'}, walls: {tile: TILE, cols: MAP_W, rows: MAP_H, solidTile: (c, r) => blocksSight(c, r)}, player: () => inScene && alive ? {x, y} : null, canSee: () => !windowOpen, hidden: (x, y) => tallGrassAt(x, y) ? 1 : shadeAt(x, y) ? 'shadow' : 0})`. `player()` is the body middle in world px.
2. *Where each enemy is created (once per enemy, also in new game):* `vision.add(enemy.id, {eye: spriteHeight, source: () => enemy.alive ? {x: enemy.x, y: enemy.y} : null})`; where it dies `vision.remove(enemy.id)`; new game / restart `vision.clear()`.
3. *Where an enemy decides to chase or attack:* use `vision.isAlert(enemy.id)` as the trigger (or an extra one); keep the game's short close-range rule so contact still counts.
4. *Where an enemy sprite picks its direction:* `vision.dir4(id)` / `vision.side(id)` / `vision.facing(id)`: every guard faces its cone (frontal art can shift its eyes toward `facing`).
5. *Your fixed update step, after enemies move:* `vision.update(stepMs)`; `vision.update(0)` while paused or a window is open.
6. *Your draw pass:* `vision.drawCones(ctx, camX, camY)` after the ground, before the sprites; `vision.drawMarks(ctx, camX, camY)` after the sprites, before the HUD (`0, 0` inside a camera translate).
7. *Optional, in create():* `avoid: () => [playerBox]` keeps badges off the player; `shade: [{x, y, w, h}]` shows the shortened reach where a cone crosses shade; `overCones: (ctx, camX, camY) => redrawWallTops()` in a 3/4 view whose wall caps rise above their tile.

**Common mistakes** (symptom -> fix):

- Cones in the wrong place or seeing across the map -> `player()` / `source()` in screen px; use world px and pass the camera to the draw calls.
- Cones pass through walls -> `walls` missing or in the wrong grid; give the tiles that block sight with the game's tile size.
- Seen in tall grass -> `hidden()` not wired or tested at the wrong point.
- Sprite looks one way, cone points another -> draw the sprite from `dir4` / `side` / `facing`.
- Cones over the characters -> `drawCones` belongs before the sprites.
- Autoplay stops fighting -> the alert replaced every contact rule; keep the close-range rule.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Stealth vision cones] Cones lie under the sprites and stop at walls; each guard faces its cone; stepping into a cone fills '?', leaving drains it; a full meter shows '!' and the game reacts; tall grass is never seen.
- [Stealth vision cones] `?auto=1` still reaches its ending with no errors; `?t=&freeze=1` is deterministic; restart leaves every guard calm.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `vision-cones.js` sha256 `47c1596ff84a943f...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Stealth vision cones] `vision.update` once per fixed step after enemies move, `0` while stopped; `clear()` on new game.
- [Stealth vision cones] `player()` and every `source()` in world px or `null`; `add` once per enemy, `remove` on death.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
