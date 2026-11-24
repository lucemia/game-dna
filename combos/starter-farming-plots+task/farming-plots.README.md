# farming-plots.js (G-04 module, v1.2.0)

One plain script, no dependencies, no `import` / `export`. It defines one global, `GameDNA_FarmingPlots`. Paste it into a
`<script>` tag or load it with `<script src>`, without changing it. It owns the farm loop on a tile grid: tilling, planting,
watering, growth one day per watered night, harvest (once), the shipping bin (paid at night), the seed stall, seasons that
wither crops out of season, seeded rain, a 6:00 to midnight day clock with dusk, night and lamp light, the sleep / night
summary / wake flow, and a farmer who walks tile by tile (a tap turns him, a second tap or holding walks; a 4-frame walk
with arm swing that follows the distance walked), faces the tile he works and swings the tool (raise, strike), plus a bot
that farms through the same key path. It draws soil, crops (every stage), the farmer and his tools, particles, sky and the
HUD (date / clock / gold panel, hotbar, prompt, shop window, season banner, night card) in code-drawn pixel art. Your game
keeps its map, camera, scenery and scenes. Deterministic: rules and bot read only the seed and the `update()` clock.

## API

`GameDNA_FarmingPlots.create(options)` returns an instance.

| option | meaning |
|---|---|
| `cols`, `rows`, `tile` | Grid size in tiles and the tile size in world px (16). |
| `walkable(cx, cy)` | Your map: true where the farmer may stand (plots with a crop, the spots and off-map are blocked by the module). |
| `field` | `[[cx, cy], ...]`: tiles that can be tilled (field tiles are walkable until something grows on them). `tilled`: tiles tilled at the start. |
| `spots` | `{bin: [cx, cy], shop: [cx, cy], bed: [cx, cy]}`: tiles the farmer faces to ship everything he carries, open the seed stall, or sleep (end the day). Blocked tiles. |
| `start` | `[cx, cy, dir]`: where the farmer wakes each morning (in front of the bed). |
| `seed` | Weather and every random detail. Same seed, same farm. |
| `params` | See below. |
| `crops`, `tools`, `toolOrder` | Your tables (default: copies of `CROPS`, `TOOLS`). Formats below. |
| `lights` | `[[x, y, radius], ...]` world px: lamps that glow at dusk and night. |
| `startSeeds` | `{cropId: n}` in the bag at the start. |
| `onEvent(ev)` | Every rules event (list below). Read-only. |
| `onEnd(result)` | Once, after the last night: `{earned, gold, shipped, harvests, days}`. |
| `drawFarmer(ctx, info)` | Optional: draw your own farmer (`{x, y, dir, frame, pose, tool, lift}`); return true. |

| param | default | meaning |
|---|---|---|
| `dayMs` | 28000 | 6:00 to midnight in game ms; at midnight the farmer goes to bed by himself. |
| `seasonDays` | 4 | Days per season (Spring, Summer, Fall, Winter in turn). |
| `seasons` | 3 | Seasons in the year; after the last night: phase `end` and `onEnd`. |
| `rain` | 0.2 | Chance of rain per day (never the first day of a season); rain waters every tilled plot. |
| `startGold` | 120 | |
| `walkMs` | 180 | ms per tile. `turnMs` 110: how long a held key waits after a turn before walking. |
| `toolSpeed` | 1 | Tool animation speed (a use = raise, strike from 42 %, the effect at 62 %, recover). |
| `botWait`, `botPlots`, `botBuy` | 110, 16, 8 | Bot pace, how many plots it farms, seeds it buys per day. |
| `nightMs` | 2600 | How long the night card shows (Z skips it). |
| `hud`, `night`, `cursor` | on | `off` hides the module HUD / the dusk and night tint / the work cursor on the faced tile. |

A **crop**: `{name, seasons: ['spring', ...], days (watered nights to ripe), stages (>= 3 drawn stages: seed, ..., ripe),
seed (price), sell, regrow (0, or days back to ripe after a harvest), yield, look: {kind: 'root' | 'leafy' | 'vine' |
'stalk' | 'gourd' | 'flower', leaf: [4 colours dark..light], fruit: [4 colours dark..light]}}` or `draw(ctx, x, y, stage,
{dead, ripe, stages, tile})` (x, y = the tile's top left). A **tool**: `{name, action: 'till' | 'water' | 'plant' |
'harvest', area: [[forward, side], ...] ([1, 0] the faced tile; side -1 / +1 = the farmer's left / right), ms, icon: 'hoe' |
'can' | 'seeds' | 'sickle' | function (ctx, x, y, size), colors: [metal, wood or body, highlight]}`. Planting uses the
selected seed (Q cycles); the stall sells the seeds of the current season.

The rules (`GameDNA_FarmingPlots.rules`, pure): at each dawn a crop grows +1 if its plot was watered the day before, it is
in season and not ripe; a crop out of season withers; every plot dries (rain waters again). `stageOf(crop, def)` = the drawn
stage, ripe only when growth >= days. A harvest adds `yield` once (the crop goes, or regrows). Buying never takes gold below
0. Shipped produce is paid at the night.

| method | |
|---|---|
| `update(stepMs)` | Every fixed step of your game, in every scene; `0` (or skipping it) freezes the farm. All motion and every rule run here. |
| `key(k)` | `'up' 'down' 'left' 'right'` (turn, or step when already facing), `'ok'` (use the tool on the faced tile, or the faced spot), `'back'`, `'tool'` (next), `'1'..'9'` (pick), `'seed'` (next seed). Queued: a 0 ms tap counts; moves wait for the farmer. |
| `setHeld(dir, on)` | From keydown / keyup: a held direction keeps walking. |
| `tapCell(cx, cy)` | A tap on a tile: walk there, or walk next to a field tile / spot, face it and use it. |
| `setAuto(on)`, `auto()` | The bot (presses keys through `key()`). |
| `drawSoil(ctx)` | Tilled / wet soil and the work cursor, flat, before your sprites (world px: translate by your camera first). |
| `sprites()` | `[{y, draw(ctx)}]`: crops and the farmer; sort them with your props by `y` and draw. |
| `drawFx(ctx)` | Particles (dirt, water, seeds, the harvest flying to the farmer), after the sprites. |
| `drawSky(ctx, rect)` | Rain, dusk, night and lamp glow over the visible world rect (world px). |
| `drawUI(ctx, view)` | The HUD in CSS px: `view = {w, h, cam: {x, y, scale}}` (canvas CSS size; camera in world px; world px x scale = CSS px). |
| `uiRects(view)`, `layout(view)` | The HUD rects (CSS px) for this frame, without drawing: `clock`, `hotbar`, `label`, `shop`, `banner`, `card`. |
| `state()`, `hash()`, `actors()`, `clock()` | Read-only views: phase, day, season, time, gold, bag, farmer `{cx, cy, x, y, dir, frame, pose}`, plots, recent events; `actors()` for `__state()`. |
| `farmer()`, `plot(cx, cy)`, `front()`, `phase()`, `gold()`, `bag()`, `darkness()` | |
| `addCrop(id, def)`, `addTool(id, def)`, `giveSeeds(id, n)`, `setPlot(cx, cy, o)`, `sleep()`, `reset(seed)` | Content and setup. |

Events (`onEvent`): `till`, `plant`, `water`, `harvest {cell, crop, n}`, `clear`, `use {tool, action, dir, at, target, cells}`,
`thunk`, `step`, `turn`, `bump`, `tool`, `seed`, `ship {n}`, `buy {crop, n, gold}`, `poor`, `noSeed`, `shopOpen`,
`shopClose`, `sleep`, `sell {gold, lines}`, `day {season, rain, newSeason}`, `season {season, withered}`, `grow`, `ripe`,
`wither`, `end`. Each has `day` and `t` (module ms).

## Integration (15 lines)

```js
// <script src="farming-plots.js"></script> before your game script
const farm = GameDNA_FarmingPlots.create({ cols: MAP_W, rows: MAP_H, tile: 16, seed: 7,
  walkable: (cx, cy) => !isSolid(cx, cy), field: fieldTiles,                  // your map; fieldTiles = [[cx, cy], ...]
  spots: { bin: BIN_TILE, shop: STALL_TILE, bed: DOOR_TILE }, start: [DOOR_TILE[0], DOOR_TILE[1] + 1, 'down'],
  lights: lampPoints, onEvent: ev => playSound(ev.kind), onEnd: r => showResults(r) });
function step(dt) { farm.update(dt); camera.follow(farm.farmer().x, farm.farmer().y); }   // every fixed step
function render() {
  ctx.save(); ctx.scale(SCALE, SCALE); ctx.translate(-camera.x, -camera.y);   // world px
  drawGround(); farm.drawSoil(ctx);
  myProps().concat(farm.sprites()).sort((a, b) => a.y - b.y).forEach(s => s.draw(ctx));
  farm.drawFx(ctx); farm.drawSky(ctx, camera.rect()); ctx.restore();
  farm.drawUI(ctx, { w: cssW, h: cssH, cam: { x: camera.x, y: camera.y, scale: SCALE } });   // CSS px (dpr transform only)
}
onKeyDown(k => { farm.key(k); if (isDir(k)) farm.setHeld(k, true); }); onKeyUp(k => isDir(k) && farm.setHeld(k, false));
```

Keep the camera so that the farmer never stands under the HUD (`uiRects(view)`): leave at least 3 tiles of scenery between
the walkable area and the map edge, or let the camera scroll past the edge.

## Self-check without a browser

- `update()` runs in every fixed-step loop (fast-forward included), once per step; `draw*` never changes the farm.
- Every caller of anything you replaced still works: your autoplay (`setAuto`), `?t=` stills, restart (`reset(seed)`).
- Trace one day: `key('ok')` facing a field tile with the hoe -> `use` -> `till` at 62 % of the swing; with seeds -> `plant`;
  with the can -> `water`; `sleep()` -> `sell` -> `day` -> `grow` (+1).
- Walk one growth: a turnip (days 2, stages 4) watered on day 1 and day 2: growth 0 -> 1 -> 2, stages 0 -> 1 -> 3 (ripe).
- Walk one sale: 3 turnips (sell 32) in the bin pay 96 gold at the night.
