# N-06 Wave-collapse town builder (3D)

## What it is

A cosy town builder rendered with three.js 0.149.0: a small island in a turquoise sea, built one click at a time. Clicking a cell raises it: sea becomes land, land becomes a cottage, a cottage gains a storey. The player only sets heights; every wall, door, window, balcony, lane, roof, stair and gate arch is chosen by a wave-function-collapse solver from socket rules, so doors always open onto lanes, lanes continue or end in a stub, ridges run on into the next gable, a stair rises exactly one storey onto a flat terrace, an arch has houses on both flanks and lanes at both ends, a turret only crowns a free-standing tower. Only the cells within two of the edit are re-solved, so the town does not reshuffle. The edited column pops with a puff of dust; a white ghost shows the storey the next click adds (red when removing). Orbit camera, exact undo / redo, four palettes (one with lit windows at dusk), soft shadows, gulls. The module is two layers: a pure-data town (rules, solver, verifier; runs in node) and the 3D view. Shipped as a system element: module + a complete starter game (Harbour Charter: six goals to earn the town's charter) + demo with rule-weight sliders and a column inspector.

## Default parameters

| key | default | meaning |
|---|---|---|
| palette | harbour | harbour / highland / dusk (lit windows and lamps) / blossom |
| seed | 1 | the solver's random stream and the cosmetic choices |
| arch | 9 | weight of an arch when a ground storey could be one |
| turret | 7 | weight of a turret roof on a free-standing tower of 3+ storeys |
| flat | 0.8 | weight of a flat terrace (roof stairs: 0.9) |
| door | 2.6 | weight of a door on a ground-storey wall that faces a lane |
| balcony | 0.38 | weight of a balcony on an upper-storey wall |
| radius | 2 | cells around an edit that are re-solved (grows to 4, 6, then the whole town on a contradiction) |
| pitch | 36 | camera elevation in degrees (yaw 45, eased orbit) |
| zoom | 1.05 | camera distance = (max(w, d) x 1.12 + 3.5) / zoom |
| shadows | soft | PCF soft shadows from one sun (2048 map) or off |
| gulls | 3 | gulls circling the island |

## Variants

- **Harbour town (default):** as above.
- **Lantern dusk:** palette dusk (purple sky, warm lit windows and lamps), more balconies, zoom 1.2.
- **Terrace village:** blossom palette, flat terraces 4, turrets 2, balconies 1: roof gardens linked by stairs.
- **Low-end device:** shadows off, no gulls, highland palette.

## Interface

**Needs:** three.js 0.149.0 as `three.min.js` next to the page; a WebGL canvas (optionally a 2D canvas on top); a start map of digit rows; a fixed 60 Hz step calling `update(dt)` and a draw calling `render()`; input that calls `grow / shrink / undo / redo` and `pick(x, y)`.

**Provides:** `createTown` (data: `grow`, `shrink`, `set`, `undo`, `redo`, `load`, `H`, `tile`, `slots`, `serialize`, `verify`, `counts`, `rules`) and `create` (view: the same edits plus `update`, `render`, `resize`, `pick`, `setHover`, `anchorOf`, `orbit`, `setPitch`, `zoomBy`, `gridDirFromScreen`, `setParams`, `palettes`, `three`, `state`); rule extension `registerTile`, `registerPair`, `allowAir`, `setWeight`. Starter extension points: `onEdit`, `onGoal`, `update`, `draw`, `drawUI`, `scene3d`, `onKey`, `onScene`, `onEnd`, `onNewTown`, `GAME.act`, `GAME.addTile`, `GAME.addPair`, `GAME.addGoal`, `GAME.uiRects`, `GAME.anchorOf`, `GAME.notice`.

## Screen rules (exact numbers)

- Cell 1 x 1 world unit; a storey is 0.7 tall; every land and house cell has a closed ground surface (grass, lane or paving at y = 0: `checks/render-checks.py` casts 81 rays per cell); the island slab reaches 0.45 below the ground (0.07 grass or paving lip on top); the sea surface is at -0.14 with foam 0.09 wide along every shore side.
- Houses: one building = cells joined at the same height, sharing wall, roof and shutter colours; walls on the cell boundary (joined storeys have no wall between them), cornice 0.055 tall sticking out 0.035 at each storey top, plinth 0.07 on ground storeys, corner pilasters 0.07 wide. Windows 0.22 x 0.30 (or two 0.15 x 0.28) with a 0.03 frame, mullions, a sill, and shutters, an arched head or a flower box (per house); a wall that faces a lower sloped roof gets a small round window only. Doors 0.28 x 0.43 with an arched head, a step and a lantern. Balconies 0.68 x 0.24 with nine balusters, cut to 0.4 wide at a concave corner. Shop fronts 0.66 x 0.32 with a six-stripe awning.
- Roofs: gable ridge 0.44 above the wall top, four colour bands per slope, ridge cap, 0.09 eave overhang over open air (none over a joined valley), gable walls with a round attic window and barge boards; hip 0.46 tall; flat terrace with a 0.15 parapet only where open, parasol, laundry line or planters; turret cone r 0.62, 1.0 tall, with a finial and a pennant.
- Arch: opening 0.5 wide, springing at 0.34, semicircular, nine bevelled voussoirs (0.06 deep, 0.03 proud), a keystone clear of the cornice (the cornice stops 0.1 each side), a barrel vault shaded 85 % at both ends and 55 % in the middle, cobble rows darker under the vault, a hanging lantern.
- Stairs: five steps of 0.14 rising toward the wall over 0.6, with a wooden rail; the parapet above opens 0.44 wide where a stair arrives.
- Camera: perspective, fov 30 (x 1.45 in portrait), yaw 45 + orbit, pitch 15-75, easing about 10 % per frame; Q / E turn 45 deg.
- Light: matte sea (diffuse only, no sun hotspot), sky gradient with an ordered dither (no bands); no clipped-white blob over 0.4 % of the frame for any palette at any 45-degree yaw (`checks/render-checks.py`). Lanterns are unlit-material glass (cream by day, warm at dusk).
- Edit feedback: the edited column scales y up to +20 % / xz -8 % over 420 ms (neighbours 35 % of that); six round dust puffs over 520 ms; the ghost box pulses 0.22-0.32 opacity, red when removing or at the height limit.
- Gulls: 0.5 wingspan, swept two-part wings with black tips that flex, eyes, circling at 3.8-5.2 high, beak on +X (`facingOffset -PI/2`), banked 0.32 rad into the turn.
- Starter HUD (CSS px): goal card 300 x (46 + 25 per goal) at (12, 12); palette chips 150 x 44 top right; stats pill under it; toolbar of 54 px buttons (46 under 560 px) bottom centre; banners 52 tall; the charter card 420 x 200 above the toolbar; nothing overlaps (layout check).

## Common mistakes (symptom -> fix)

- Doors that open onto grass or a wall, ridges that stop mid-air -> you placed tiles yourself; let the solver choose and only set heights.
- The whole town changes on every click -> do not re-create the town or call `resolveAll()` per edit; use `grow` / `shrink` / `set`.
- Undo gives a slightly different town -> restore the module's snapshot with `undo()`, never re-solve.
- Different town on each reload -> pass a fixed `seed` and replay the same edits.
- Clicks land on the wrong cell after a resize -> call `resize(cssW, cssH, dpr)` and pass CSS px to `pick`.
- A new tile never appears -> its sockets have no pair: `registerPair` them (and `allowAir` for sides facing the sky), and give it a weight comparable to the built-ins.
- Nothing animates in a `?t=&freeze=1` still -> call `update(dt)` in the fixed step, not in the render loop.
- A CDN or another three.js version -> only the pinned 0.149.0 file next to the page.

## Acceptance moments

1. `starter/?auto=1&t=1500&freeze=1`: the start island with three cottages, goal card 0 / 6, toolbar, gulls; the bot's cursor ghost over the next cell.
2. `starter/?auto=1&t=6900&freeze=1`: the island has grown from the sea (last edit grow 0 -> 1), "Goal complete: Grow the island" banner.
3. `starter/?auto=1&t=16500&freeze=1`: 20 houses joined into blocks, front doors with lanterns on cobbled lanes, "Raise houses" banner.
4. `starter/?auto=1&t=18300&freeze=1`: the 4-storey tower just raised (pop), "A tower of 4 storeys" banner.
5. `starter/?auto=1&t=28300&freeze=1`: the gate arch formed between two houses, "A gate arch over a lane" banner and the Charter Granted card.
6. `starter/?auto=1&t=27700&freeze=1&zoom=3&yaw=165&pitch=28&focus=arch`: close view of the arch (voussoirs, vault, lantern, lane through it).
7. `demo/?t=2000&freeze=1&cursor=6,5&inspect=1`: the demo village (38 houses, turrets, terraces with stairs, balconies) with the column inspector.
8. `demo/?t=2000&freeze=1&palette=dusk&yaw=200`: dusk palette, lit windows and lamps.
9. `demo/?t=2000&freeze=1&palette=highland&yaw=300&pitch=30` and `palette=blossom&yaw=130&zoom=1.4`: the other palettes.
10. `demo/?scene=play&t=9180&freeze=1&zoom=1.5`: "Watch it build" mid-pop.
11. Phone 390 x 844: `starter/?auto=1&t=17000&freeze=1` and `demo/?t=2000&freeze=1`.
12. `checks/facing-3d/sheet.png`: a gull at 8 flight headings, all within 15 deg.
