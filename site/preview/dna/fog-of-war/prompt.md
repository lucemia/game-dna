# Add Fog of war to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `fog-of-war.js` (one global, `GameDNA_FogOfWar`), API reference `fog-of-war.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Fog of war [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Fog of war:** a tile grid; a list of combatants/units; terrain per tile (optional); a camera offset; a fixed 60 Hz update step; rectangles of UI to keep clear (optional).

## Element 1: Fog of war (`fog-of-war.js`, `GameDNA_FogOfWar`)

Everything outside the player units' sight sinks under a slowly drifting, dithered fog with a soft one-tile edge; terrain stays faintly readable. Hidden enemies are not drawn (they still act; rules and AI are untouched), the tile where one was last seen keeps a faint silhouette, and a "!" pops when one comes into view. Forests and walls block sight, hills extend it, and tiles clear or fog over smoothly as units move.

**Parameters chosen:** `radius` = 3, `shape` = diamond, `density` = 0.6, `edge` = 1, `drift` = 6, `fade` = 240, `ghosts` = on, `pop` = on, `shroud` = off, `scheme` = night.

**Where it goes** (by role; find these places in my game):

1. *Once, after your map and units exist, before the first frame:* `fog = GameDNA_FogOfWar.create({cols, rows, tile, view, params: {radius: 3, shape: 'diamond', density: 0.6, edge: 1, drift: 6, fade: 240, ghosts: 'on', pop: 'on', shroud: 'off', scheme: 'night'}, posOf, isPlayer, visionOf, blocks, ghostSprite, uiRects})`, then `fog.recompute(units)`. `view` = the map's screen rect above the HUD (tile 0,0 at view.x/y when the camera is at 0). `posOf(u)` -> the tile where the unit is DRAWN (round its walking pixel position / tile), not pixels. `isPlayer(u)` = your side. `visionOf(u, x, y)` -> sight in tiles (+2 on hills if you have them). `blocks(x, y)` -> true for forest, walls, cliffs. `ghostSprite(u)` -> its sprite canvas, or `{img, flip}` if that side is drawn mirrored. `uiRects()` -> HUD, banners, open windows (screen px).
2. *Your fixed update step (also on the `?t=&freeze=1` replay):* After units move: `fog.update(stepMs)`.
3. *Your map draw pass:* ground and terrain (and range overlays) -> `fog.draw(ctx, cam)` -> units -> `fog.drawGhosts(ctx, cam)` -> cursor, HUD, banners; inside any shake translate; `cam = {x, y}` map scroll (omit without a camera).
4. *Every place that draws a unit or unit information (sprite, shadow, HP bar, hit flash, name plate, info or forecast window, target cursor, damage numbers):* Draw an enemy only when `fog.isUnitVisible(u)`. Skip drawing only: never filter the list your rules, AI or autopilot read. Hidden means the player can't learn anything about the unit: no sprite, HP bar, shadow, selection/hover highlight, cursor change, info window, sound, camera move, or blocked cursor movement on its tile. Draw the cursor and every hover effect on fogged tiles exactly as on an empty tile.
5. *Where a game or map STARTS or restarts with new unit objects:* `fog.reset(); fog.recompute(newUnits);`. On title and result screens: `fog.setEnabled(false)`, `true` when play starts.

**Common mistakes** (symptom -> fix):

- Everything is fogged, even around the player -> `isPlayer` matches nobody or `posOf` returns pixels; it must return tiles.
- An enemy appears only after its walk ends -> `posOf` returns the logical tile; return the tile where it is drawn.
- A hidden enemy still shows its HP bar, shadow or info window -> guard every unit draw path with `isUnitVisible`, not only the sprite.
- Sweeping the cursor finds hidden enemies (it vanishes, changes colour, stops or opens a window on their tile) -> treat hidden units as empty tiles everywhere the game reacts to a unit under the cursor.
- Autoplay ends differently -> the unit list the rules or AI read was filtered; only drawing may ask the fog.
- Fog is missing in `?t=&freeze=1` shots -> `fog.update` is not in the replayed step.
- Fog slides when the camera scrolls -> pass the same `cam` to `draw` and `drawGhosts` as to the ground.
- Old ghosts after a restart -> `fog.reset()` where new units are built.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Fog of war] Around the player units the map is clear; elsewhere darker, desaturated, with drifting dithered mist and a soft one-tile edge; terrain readable.
- [Fog of war] Hidden enemies are not drawn at all and the cursor and hover effects look as on empty tiles over them; approaching one reveals it with a "!" above it; leaving one leaves a faint silhouette at its last-seen tile.
- [Fog of war] Forest/walls block sight beyond them; hills extend it (where the map has them).
- [Fog of war] `?auto=1` reaches the same ending as before.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `fog-of-war.js` sha256 `569cd47380bead68...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Fog of war] List every unit draw path and its `isUnitVisible` guard; confirm no rule, AI or autopilot line reads the fog.
- [Fog of war] List every place the game reacts to a unit under the cursor (cursor colour or visibility, hover highlight, info/forecast window, select or attack prompt, sound, camera, cursor blocking) and confirm each treats a hidden unit as an empty tile.
- [Fog of war] Walk one move: unit steps -> `fog.update` -> new enemy in sight fires the "!", one left behind becomes a ghost; `draw`/`drawGhosts` run every frame including the single `?freeze=1` frame.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
