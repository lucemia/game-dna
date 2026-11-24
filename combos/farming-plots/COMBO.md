# Add farming plots to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `farming-plots.js` (one global, `GameDNA_FarmingPlots`), API reference `farming-plots.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Farming plots [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Farming plots:** a tile map: size, tile px, which tiles are walkable, which are field, the bin / stall / door tiles and the farmer's morning tile; a fixed 60 Hz update step; key input (directions with keydown / keyup, use, tool, seed) or taps on tiles; your scenery drawn under and around the farm (sprites are y-sorted with yours); optional lamp points; a place to go when the year ends (onEnd).

## Element 1: Farming plots (`farming-plots.js`, `GameDNA_FarmingPlots`)

Adds a farm loop on the tile grid: till, plant (season-checked seeds from a stall), water, crops grow one step per watered night through drawn stages, harvest once, a shipping bin that pays at night, seasons that wither out-of-season crops and repaint the farm, seeded rain, a 6:00-to-midnight clock with dusk, night and lamp light, sleep and a night summary. The farmer walks tile by tile (tap turns, second tap or hold walks) with a 4-frame walk and arm swing that follow distance, faces the tile he works and swings each tool. Crops and tools are data; a bot farms through the same key path.

**Parameters chosen:** `dayMs` = 28000, `seasonDays` = 4, `seasons` = 3, `rain` = 0.2, `startGold` = 120, `walkMs` = 180, `toolSpeed` = 1, `night` = on, `cursor` = on.

**Where it goes** (by role; find these places in my game):

1. *How your game maps onto it (decide before coding):* A block of field tiles (2-row beds with a walkable row between them), three blocked tiles the farmer faces to use (shipping bin, seed stall, house door = bed) and his morning tile in front of the door, about 3 tiles of scenery around the walkable area (the HUD never covers him). Your lamps become `lights`.
2. *Once, where the farm starts:* `farm = GameDNA_FarmingPlots.create({cols, rows, tile: 16, seed, walkable: (cx, cy) => <your solid test, false for props>, field: [[cx, cy], ...], spots: {bin, shop, bed}, start: [cx, cy, 'down'], lights: [[x, y, r]], params: {dayMs: 28000, seasonDays: 4, seasons: 3, rain: 0.2, startGold: 120, walkMs: 180, toolSpeed: 1, night: 'on', cursor: 'on'}, onEvent: ev => <your sounds / effects>, onEnd: r => <your results code, once>})`.
3. *Your fixed step (every loop that steps the game, fast-forwards included):* `farm.update(stepMs)` once per step (night card included), then your camera follows `farm.farmer()`.
4. *Where the world is drawn (world px under the camera):* your ground, `farm.drawSoil(ctx)`, your props merged with `farm.sprites()` sorted by `y`, `farm.drawFx(ctx)`, `farm.drawSky(ctx, visibleWorldRect)`; then in CSS px `farm.drawUI(ctx, {w, h, cam: {x, y, scale}})`.
5. *Your input:* keydown -> `farm.key('up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'tool' | 'seed' | '1'..'9')`, directions also `farm.setHeld(dir, true)`, keyup `setHeld(dir, false)`; a tap -> `farm.tapCell(cx, cy)`; your autoplay -> `farm.setAuto(on)`.

**Common mistakes** (symptom -> fix):

- The farmer walks into props -> `walkable` must be false for them (the module blocks crops and the spots itself).
- Legs move on the spot or slide -> do not animate him yourself; the module draws frames from distance walked.
- Crops never grow -> `update()` stops during the night card; call it every step in every scene.
- A different farm at another window size -> only the camera may depend on the viewport; pass a fixed seed.
- The HUD covers him at the map edge -> leave 3 tiles of scenery around the walkable area.
- Blurry pixels -> draw the world at native size and scale it by a whole number with smoothing off.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Farming plots] `?auto=1` farms the whole year to `onEnd`; `?t=` stills repeat exactly.
- [Farming plots] He turns, then walks with moving legs and arms; the tool hits the faced tile; a watered crop gains one stage per night.
- [Farming plots] Gold never below 0; harvests count once; nothing covers him or the module HUD at 390 px.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `farming-plots.js` sha256 `47ae9d1d66b198af...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Farming plots] Trace one day: key('ok') with the hoe -> use -> till; seeds -> plant; can -> water; sleep -> sell -> day -> grow.
- [Farming plots] Walk one growth: a turnip (2 days, 4 stages) watered two days: growth 0 -> 1 -> 2, stages 0 -> 1 -> 3.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
