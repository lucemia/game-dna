# G-04 Farming plots

## What it is

A farm loop on a tile grid, as a system: the player tills field tiles with a hoe, plants the selected seed, waters, and the
crops grow over in-game days through drawn stages (seed mound, sprout, young, ..., ripe) until a harvest puts them in the
bag; produce goes in a shipping bin and is paid during the night; seeds come from a stall that sells only the current
season's crops. Seasons (Spring, Summer, Fall, Winter) change every few days: crops out of season wither at that dawn, the
farm is repainted, and new seeds appear. A clock runs from 6:00 to midnight with a dusk tint, night and lamp light; the
farmer sleeps at his door (or at midnight by himself), a night card sums up the sale, growth and the weather, and he wakes
at dawn. Rain (seeded) waters every tilled plot. The farmer walks tile by tile: a tap turns him to face, a second tap or a
held key steps; his 4-frame walk with arm swing follows the distance walked; he faces the tile he works and swings each tool
(raise, strike from 42 %, the effect at 62 %), and lifts the harvest over his head on both hands (one crop, resting on the hands). Crops and tools are plain data; a bot farms the whole year
through the same key path. Ships as a module, a starter game (Thistledown Acre: a Spring-Summer-Fall year ending at a
Harvest Fair) and a demo.

## Default parameters

`dayMs` 28000 (18 game hours, 1 game hour = 1.56 s), `seasonDays` 4, `seasons` 3, `rain` 0.2 (never on a season's first
day), `startGold` 120, `walkMs` 180 per 16 px tile, `turnMs` 110, `toolSpeed` 1 (hoe and can 300 ms, seeds 240, sickle
260), `nightMs` 2600, bot: `botWait` 110 ms between actions, `botPlots` 16, `botBuy` 8 seeds a day. Built-in crops: Turnip
(Spring, 2 days, 4 stages, 10 -> 32 g), Cabbage (Spring, 3, 4, 24 -> 72), Tomato (Summer, 3, 5, 30 -> 46 x2, regrows in
1), Corn (Summer + Fall, 3, 5, 36 -> 104), Pumpkin (Fall, 3, 5, 50 -> 150). Tools: Hoe (till), Watering Can (water), Seeds
(plant the selected seed), Sickle (harvest, or cut a withered plant); each works the faced tile.

## Variants

- Short demo year (default): three 4-day seasons, about 4 minutes.
- Relaxed days: `dayMs` 60000, `seasonDays` 7.
- Dry climate: `rain` 0 (every plot must be watered by hand).
- Always daylight: `night` off (no dusk tint; the clock and midnight bedtime stay).
- Quick hands: `toolSpeed` 1.5, `walkMs` 150.
- Content: a crop with its own season, days, stages and look (`kind` root / leafy / vine / stalk / gourd / flower and two
  4-colour ramps, or a `draw` function); a tool with its own action and area (e.g. a can that waters three plots across).

## Interface

Needs: a tile map (walkable tiles, field tiles, the bin / stall / door tiles, the morning tile), a fixed 60 Hz step, a
camera, a seed, key input (directions with keydown and keyup, use, tool, seed) or tile taps, your scenery drawn around the
module's y-sorted sprites, optional lamp points, and somewhere to go when the year ends.
Provides: the rules (`GameDNA_FarmingPlots.rules`: `dawn`, `stageOf`, `ripe`, `apply`, `useful`, `cellsFor`, `buy`, `sell`,
pure), the farmer, every draw pass (`drawSoil`, `sprites`, `drawFx`, `drawSky`, `drawUI`), `uiRects(view)` valid without
drawing, events and `onEnd`, the bot, `state()`, `hash()`, `actors()`. The starter adds `window.GAME` with addons, hooks per
event, `addCrop` / `addTool`, `uiRects()` / `unitRects()` / `anchor()` / `cellRect()` in CSS px, `shipped`, and built-in
notices that a toast addon can replace (`GAME.flags.builtinToasts = false`).

## Screen rules

- World at native pixel size (16 px tiles; about 320 x 180 visible on desktops, 195 x 380 on a 390 px phone), integer
  scaled (x4 at 1280, x2 on phones), nearest-neighbour. The HUD is drawn at CSS size: text 11-18 CSS px, never below 10.
- The farmer: 18 x 24 art px, feet on the tile's bottom row minus 2, a 2-row ground shadow, 1 px dark outline, light from
  the top. Walk frame = floor(distance walked / 6 px) mod 4 while moving (a full stride every 24 px = 1.5 tiles); idle
  pose when stopped for more than 40 ms. No move is larger than one frame of walking speed (16 px / 180 ms x 16.7 ms = 1.5 px).
- Tools: drawn from the hand point of the pose; the hoe raised above the hat facing down (behind him), behind his head
  facing up; the hoe head lands on the worked tile at the strike. The work cursor (4 corner brackets, pulsing) marks the
  faced tile when something can happen there.
- Crops: 16 x 32 canvases standing on the plot's row 10, drawn after things above them and before things below (y-sort);
  ripe crops sparkle; a withered crop keeps its shape in browns.
- Soil: tilled tiles join their tilled neighbours (no inner border); wet soil is darker with a few blue glints.
- HUD: date / clock / day bar / gold panel top right (178 x 84 CSS px, 156 wide under 520 px); hotbar bottom centre
  (46 px slots, 40 under 520 px; the plant slot shows the selected seed and its count); a prompt pill above it (tool name, or
  "Z  Ship 3 crops" / "Z  Buy seeds" / "Z  Sleep" when facing a spot). The seed stall window opens beside the farmer on wide
  screens (the half he is not in) and above or below him on phones; it fades in over 140 ms. The season banner sits high on
  wide screens and under the clock on phones, and moves above the hotbar when that spot would cover the farmer; it fades in
  and out (300 / 400 ms, 4.6 s). No HUD rect ever covers the farmer or the tile he works, and no two HUD rects overlap.
- Dusk tint from 16:30 (orange, up to 16 %), night tint from 17:00 to 21:30 (navy, up to 62 %), lamp glows grow with it.
- Sleep: a 650 ms fade to black, the night card (sale lines, gold, growth, tomorrow's weather), a 600 ms fade in.

## Common mistakes

- The farmer walks onto crops or through the stall -> `walkable` returns true for them; the module blocks plots with a crop
  and the spots, but your props must be false in `walkable`.
- The worked tile is not the one he faces -> you passed your own tile to a tool; let `key('ok')` pick the faced tile.
- Legs move while he stands, or slide while he walks -> you animate by time; draw `state().farmer.frame` (distance based).
- He jumps a tile -> you set his position yourself; only `key()` / `tapCell()` move him.
- Crops never grow -> `update()` is not called during the night card; call it every step, in every scene.
- A different farm at another window size -> the seed or the bot depends on the viewport; only the camera may.
- The HUD covers him at the map edge -> leave 3 tiles of scenery around the walkable area (or let the camera pass the edge).
- Gold goes negative in your own shop -> buy through the module (`rules.buy`).
- Two notices per event -> turn off the built-in notices when a toast addon is in.

## Acceptance moments

Starter (`starter/index.html`, seed 7, autoplay); each still must show its event (`checks/state.json`, `checks/moments.py`):

1. `?t=2600&freeze=1` walking: the farmer mid-stride to the right (a `step` within 0.7 s, walk frame >= 0), Spring 1 morning.
2. `?t=6300&freeze=1` the seed stall window open beside the farmer (phase `shop`), Turnip and Cabbage rows, gold.
3. `?t=10830&freeze=1` tilling: the hoe strike on the faced tile below him, the fresh furrowed plot (`till`).
4. `?t=14700&freeze=1` planting: the seed pouch thrown, a seed mound on the plot (`plant`).
5. `?t=19300&freeze=1` watering: the can tipped, droplets, the plot turning dark (`water`).
6. `?t=23400&freeze=1` dusk: the 7 pm tint and lamp glow while the last plot is watered.
7. `?t=27600&freeze=1` the night card of Spring 1 (`grow`: "6 crops grew"; tomorrow's weather).
8. `?t=45900&freeze=1` a rainy Spring 3: a turnip harvest, the farmer lifting the turnip, the notice (`harvest`, rain).
9. `?t=50600&freeze=1` shipping at the bin, the lid up (`ship`).
10. `?t=70500&freeze=1` "SUMMER HAS COME" banner, the summer palette (`season`).
11. `?t=134500&freeze=1` a corn harvest from tall ripe stalks (`harvest`).
12. `?t=161400&freeze=1` "FALL HAS COME, 1 crop out of season withered" over the golden fall farm, the withered tomato in view below the farmer.
13. `?t=162150&freeze=1` the sickle coming down on the withered (brown) tomato, just before it is cut (`use`, strike pose; the cut and a chaff burst follow 30 ms later).
14. `?t=224000&freeze=1` a pumpkin harvest on Fall 4 (`harvest`).
15. `?t=239500&freeze=1` the Harvest Fair card over the dimmed farm (`end`).

Demo (`demo/index.html`): `?preset=growth&t=4200&freeze=1` five crops at different stages; `?preset=season&t=7400&freeze=1`
withered tomatoes beside living corn and the Fall banner; `?preset=night&t=6000&freeze=1` 11:50 pm with lamp light;
`?preset=tools&t=1800&freeze=1` (hoe strike, facing down), `t=7820` (can tipped, right), `t=13130` (sickle, up), `t=17460` (sickle, left): one tool loop works four tiles in four facings; `?preset=sheet&t=100&freeze=1` every farmer frame and every crop stage.
