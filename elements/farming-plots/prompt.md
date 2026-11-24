# Add farming plots to your game

Defaults: `{{dayMs}}` = 28000, `{{seasonDays}}` = 4, `{{seasons}}` = 3, `{{rain}}` = 0.2, `{{startGold}}` = 120, `{{walkMs}}` = 180, `{{toolSpeed}}` = 1, `{{night}}` = on, `{{cursor}}` = on.

You get `farming-plots.js` (one global, `GameDNA_FarmingPlots`) and its README. Include the file verbatim; never edit it. It owns the farm (tilling, planting, watering, growth per watered night, harvest, a bin paid at night, a seed stall, seasons, rain, the day clock, sleep), the farmer (tile walking with walk frames, facing the worked tile), its HUD and a bot. Your game keeps its map, camera, scenery and scenes.

## Steps

1. **Find before you change:** the tile map and solid test, the fixed step and every loop calling it (play, autoplay, `?t=` fast-forward, restart), the camera, the draw order, key and pointer handlers, session start and end. Keep every caller working.
2. **Pick the farm:** field tiles (2-row beds with a walkable row between), three blocked tiles he faces to use (bin, stall, house door), his morning tile in front of the door. Leave about 3 tiles of scenery around the walkable area so the HUD never covers him.
3. **Create once** where the farm starts: `GameDNA_FarmingPlots.create({cols, rows, tile, seed, walkable(cx, cy), field: [[cx, cy], ...], spots: {bin, shop, bed}, start: [cx, cy, 'down'], lights, params: {dayMs: {{dayMs}}, seasonDays: {{seasonDays}}, seasons: {{seasons}}, rain: {{rain}}, startGold: {{startGold}}, walkMs: {{walkMs}}, toolSpeed: {{toolSpeed}}, night: '{{night}}', cursor: '{{cursor}}'}, onEvent, onEnd})`. `walkable` is your own solid test (false for props).
4. **Step:** `update(stepMs)` once per fixed step in every loop, night card included; then move your camera toward `farmer().x, farmer().y`.
5. **Draw** in world px under your camera: your ground, `drawSoil(ctx)`, then your props merged with `sprites()` sorted by `y`, then `drawFx(ctx)`, then `drawSky(ctx, visibleWorldRect)`. Afterwards, in CSS px (only the device-pixel transform): `drawUI(ctx, {w, h, cam: {x, y, scale}})`. Pixel art: draw the world at native size and scale it by a whole number.
6. **Input:** on keydown send `key('up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'tool' | 'seed' | '1'..'9')` and for directions also `setHeld(dir, true)`; on keyup `setHeld(dir, false)`. A tap on the world: convert to a tile and call `tapCell(cx, cy)`. Your autoplay toggle calls `setAuto(on)`.
7. **Content:** crops and tools are data (`addCrop`, `addTool`). React in `onEvent`; change the farm only through `key` / `tapCell`.
8. **End:** `onEnd(result)` once after the last night: run your results or menu code there.

## Rules that matter

- Same seed = same farm at any window size; never use `Math.random` for farm content.
- Keep `uiRects(view)` clear of your own HUD (it is valid without drawing).

## Self-check without a browser

- Trace: `key('ok')` facing a field tile with the hoe -> `use` -> `till`; seeds -> `plant`; can -> `water`; sleep at the door -> `sell` -> `day` -> `grow`.
- Walk one growth: a turnip (2 days, 4 stages) watered two days: growth 0 -> 1 -> 2, stages 0 -> 1 -> 3 (ripe).
- Every call site of anything renamed or removed still exists.

## Acceptance checks

- `?auto=1` farms a whole year to `onEnd`; `?t=<ms>&freeze=1` shows the same frame each load.
- The farmer turns, then walks with moving legs and arms; he faces each tile he works; the tool hits that tile.
- A watered crop gains one stage per night; an unwatered one does not; a season change withers out-of-season crops.
- Harvests count once; gold never drops below 0; nothing in your HUD covers the farmer or the module's HUD at 390 px wide.
