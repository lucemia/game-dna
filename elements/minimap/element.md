# C-06 Minimap

## What it is

A corner map of the level that the player fills in by exploring. The level (a tile grid, or collision boxes) is baked once into a cached map image per zoom level; cells the player has not seen sit under a tinted two-tone dither whose frontier row is see-through, so the reveal edge is soft. Trees are drawn as small round clumps, buildings in the colour the game gives each cell (`cellAt` may return `{kind, color}`). An arrow on the player points the way they face. Markers show the current goal (a gold diamond that pulses, shown even in unexplored ground), enemies (red dots), items (cyan diamonds), people (green dots), exits (white squares) and landmarks (`poi`, small pale glyphs); a goal that is off the minimap gets an arrow on its rim pointing toward it. Corner brackets show what is on screen now. Three zoom levels, and a full-map view that dims the play area (never the HUD) and shows the whole level, a legend of the marker kinds present and the explored share.

The minimap places itself in a corner of the play view and never covers a HUD rect the game names: it slides past a rect (down from a top corner, up from a bottom corner), then tries the other corners, then shrinks. While the player's sprite (or anything else the game names) overlaps the map, the map image dims to 40 % on its dark backing; the frame, arrows and markers stay readable.

Two looks: **atlas** (warm parchment ground, green woods, red roofs, blue water with shore lines) for maps seen from above, **sonar** (dark rooms, bright wall edges, as in exploration platformers) for side-on levels. On native pixel canvases it draws whole pixels only (pixel arrow and markers, 3x5 bitmap font); on HD canvases it draws smooth shapes. It can show what a fog-of-war module (B-03) has explored instead of keeping its own explored cells.

It is an addon: it reads the game and draws; it never changes game state and never reads input. The game chooses the keys (e.g. M full map, N zoom) and the tap.

## Default parameters

| key | default | meaning |
|---|---|---|
| `mode` | `topdown` | `side` for side-on levels (fitted strip, sonar look, wider reveal) |
| `corner` | `tr` | `tl`, `br`, `bl` |
| `size` | 0.28 | minimap width / play-view width (min 40 px x u) |
| `zooms` | `auto` | map px per cell at each zoom level, times u (u = 1 per ~300 px of view: 1 on 256-384 px canvases, 4 on 1280). `auto`: two levels, the closest still shows >= 1.5x the camera view (e.g. 2 and 3 px per 16 px cell on a 384 px view); or a list like `2,3,4` |
| `fog` | `explore` | `off`: the whole map is known |
| `reveal` | 5 | cells around the player that become explored (side-on: 1.5x wider) |
| `revealView` | `on` | everything inside `camera()` becomes explored too |
| `enemies` | `on` | `near`: only within `reveal` cells (or visible in a shared fog); `off` |
| `arrows` | `on` | rim arrows for tracked markers off the minimap (goals by default) |
| `viewFrame` | `on` | corner brackets of the camera rect |
| `shape` | `square` | `round` (circle, radar look) |
| `theme` | `auto` | `atlas` (top-down) / `sonar` (side-on) |
| `fadeUnder` | 0.4 | map image opacity while the player sprite (or an `obstacles()` rect) overlaps the map; the frame, arrows and markers stay at 80 % |
| `markSize` | 1 | marker / arrow size (1.5 for small phone screens) |
| `render` | `auto` | `crisp` when the view is <= 512 px wide or smoothing is off, else `smooth` |
| `margin` | 4 | px from the view edge to the frame |

## Variants

- **Adventure overworld**: top-down, atlas, explore, `2,3,4`.
- **Metroidvania**: side-on, sonar, explore; rooms appear as the camera passes.
- **Arena radar**: round, no fog, `enemies: near`, bottom-left.
- **Known map**: `fog: off`, `enemies: off` (a town map).

## Interface

Needs (all in world px unless noted): `cols`, `rows`, `tile`; `cellAt(c, r)` -> `floor | grass | path | sand | bridge | door | tree | wall | building | water | hazard | empty` (or `true` / `false`), or `rects` of solid boxes; `player()` -> `{x, y, facing | angle}`; `camera()` -> world rect on screen; `markers()` -> `[{id, kind, x, y, always?, track?, color?}]`; `view` (screen rect of the play view) and `safeRects()` (screen HUD rects); `update(stepMs)` every fixed step; `draw(ctx)` after the HUD in play scenes. Optional: `fog` (a B-03 instance or anything with `isExplored(c, r)` / `isVisible(c, r)`), `focus()`, `obstacles()`, `skin`.

Provides: the drawn minimap / full map; `toggleFull`, `setFull`, `cycleZoom`, `zoomIn`, `zoomOut`, `setZoom`; `hit(x, y)` (tap); `rect()` (a UI rect other overlays can avoid); `reset`, `refresh`, `invalidate(c, r)`, `revealAll`, `explore(c, r, rad)`, `isExplored`, `exploredRatio`; `state()` / `lastDrawn()` (player arrow `{world, map, angle}`, markers `{id, kind, world, map, edge, hidden}`, rect, zoom, alpha), `worldToMap`, `stats()`.

## Screen rules (exact numbers)

- Placement: frame (2u outside the map rect) at `margin` px from the view edge, 2u clear of every safe rect; slide past blockers, then other corners in order tr, tl, br, bl, then shrink by 0.82 up to 3 times; no room = nothing drawn (`stats().noRoom`).
- Size: width = max(40u, size x view.w); height = 0.75 x width (top-down), = width (round), fitted to `rows x zoom0 + 8u` within 0.3-0.6 of the width (side-on); never larger than the level at the current zoom (no empty margin). Zoom pips are 3u x 1u dashes in the frame's bottom border (no footprint beyond the frame).
- Map window: centred on the player (or `focus()`), clamped to the level edges; a level smaller than the window is centred. Crisp: whole-pixel origin.
- Player arrow: notched arrowhead 8u long (full map 10u), white tip and gold tail, 1u ink outline, centroid on the player's map position, rotated to the facing angle (crisp: rasterised per whole degree, cached).
- Markers (crisp, u = 1): goal diamond radius 2-3 px + ink ring, pulsing every 450 ms; item diamond radius 1; enemy / npc / door 3x3 square + 1 px ink outline; full map one step bigger. Drawn in order door, item, npc, enemy, goal (goals on top), then the arrow. Landmarks (`poi`): 3x3 pale glyph with a 1 px ink outline and an ink centre.
- Edge arrows: isosceles triangle 8u (tip 0.68, base 0.8 of its length), 1u ink outline, one highlight pixel; its centre sits ceil(0.7 x 8u) + 3u inside the rim on the ray from the minimap centre toward the marker, so the tip never touches the frame.
- Fog: unexplored cells = two-tone checker (`unknown` / `unknown2`); crisp cell-sharp edges, smooth mode bilinear soft edges.
- Fade: 180 ms; only while the player box (14 x 18 world px around the player, through `camera` and `view`) or an `obstacles()` rect overlaps the map rect itself. The map image drops to `fadeUnder` on its dark backing; the backing, frame, arrows and markers stay at 80 %.
- Full map: dims the free part of the view (view minus safe rects) with ink at 62 %; panel centred in it, title "MAP" and "N% EXPLORED", map at the largest whole px per cell that fits (crisp), legend below.
- Cost: per frame one cached-image blit (sub-rect), one fog blit (cols x rows canvas scaled), a handful of markers and one cached arrow sprite.

## Common mistakes (symptom -> fix)

- Arrow pinned to a corner of the map, markers bunched in the top-left -> `player` / `markers` return screen px (camera subtracted, HUD added); return world px.
- The map is a stretched copy or misses its right half -> `cols` / `rows` swapped, or `cellAt` reads `level[c][r]`; use the level array's own order.
- The frozen `?t=` still shows an all-unexplored map -> `update` is not in the replayed fixed step.
- The minimap covers the score or timer -> that rect is missing from `safeRects()`, or `view` includes the HUD bar; list every HUD box in the same coordinates as `view`.
- The minimap sits on the player at a level edge and never fades -> no `camera()` (or `view` not the play view); give both, or pass `obstacles()`.
- Arrow points backwards or up / down swapped -> facing given as a y-up angle; use words, +1 / -1, a vector with y down, or `angle` with y down.
- Full-map and zoom keys also move the player -> the keys reach the game's input; consume them in the handler.
- A restart keeps the old explored map -> `reset()` missing at new game; a rebuilt level needs `refresh()`.
- Enemies visible through unexplored ground with a fog-of-war in the game -> pass the fog instance as `fog` and `enemies: 'near'`.

## Acceptance moments

Demo `demo/index.html` (Meadow = top-down, `?scene=side` = Caverns, side-on), 384 x 216 native:

1. `?t=2000&freeze=1`: village start at the closest zoom (1.5x the screen): the explored village fills the minimap, the arrow points up (the hero walks north), a rim arrow points north-east toward the shrine goal.
2. `?t=7500&freeze=1`: crossing toward the bridge; enemy markers sit where the slimes are relative to the hero; view brackets.
3. `?t=12500&freeze=1`: zoom 1 (closest auto level, 1.5x the screen) near the ruins: goal diamond, wall edges, enemies and an item.
4. `?t=18500&freeze=1`: full map just after the shrine: whole level, legend (goal, foe, item, npc), the explored share in the title row, the new goal (the camp, south-east) shown in unexplored ground, landmark glyphs, each house in its roof colour, tree clumps, soft reveal edge; the HUD bar not dimmed.
5. `?t=21000&freeze=1`: the quest panel (a safe rect) opened in the top-right corner: the minimap moved below it; the hero is under it, so its map image is dimmed while frame, arrow and markers stay readable; the goal is now the camp (bottom), the shrine became a landmark.
6. `?scene=side&t=3000&freeze=1`: side-on start at the closest zoom: sonar look, the explored hall, a rim arrow fully inside the frame pointing right toward the relic chamber.
7. `?scene=side&t=12000&freeze=1`: zoom 1 in the great cavern: ledges as bright lines, a bat marker above the hero, a crystal marker on a ledge.
8. `?scene=side&t=23000&freeze=1`: full map of the caverns: explored rooms, unexplored loft, legend.
