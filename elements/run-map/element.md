# G-08 Branching run map

## 1. What it is

The roguelite route between fights. A seeded map of floors rises to a boss; every floor holds a few nodes (battle, elite, event, shop, rest) joined to the floor above by paths that never cross. The player stands on one node and may only move to a node connected to it, so every pick closes some branches and opens others: rest now or fight for coins, take the elite for a better prize or the safe event. A token travels along the chosen path, the game plays that node, and the map returns one floor higher with the route drawn in gold. The boss at the top ends the run.

The map **wraps** the game's existing play. Fight nodes call the game's `onEnter(node)`: the game starts its own fight, room or wave (tougher for elites, scaled by the floor), and calls `finish({won})` where it decides the result. Rest, shop and event nodes are small panels the module shows, whose choices are the game's own `apply` functions (heal, raise a stat, spend coins). The world is paused while the map or a panel is open.

Different from B-05 level-select-map (a fixed world map of hand-placed levels you walk between): this map is generated per run, nodes have types, and the choice is one-way.

## 2. Default parameters

| key | default | meaning |
|---|---|---|
| `wrap` | (required) | what battle / elite / boss nodes play in the game |
| `seed` | 1 | the map is a pure function of the seed and the shape |
| `floors` | 6 | rows below the boss (floors on screen: 1 to 7) |
| `width` | 5 | columns |
| `paths` | 4 | walks from the bottom row to the top; their union is the map |
| `wBattle` / `wElite` / `wEvent` / `wShop` / `wRest` | 46 / 14 / 22 / 8 / 10 | type weights for floors 2 to `floors - 1` |
| `eliteFrom` | 3 | no elite below this floor |
| `restBefore` | on | the floor under the boss is all rest |
| `look` | auto | pixel below 300 px tall, else HD |
| `autoRoute` | balanced | autoplay: rest when under 50% HP, elites only above 75% |
| `openMs` / `travelMs` / `closeMs` / `resultMs` / `autoMs` | 320 / 620 / 260 / 900 / 900 | timings |

## 3. Variants

- **Classic run**: 6 floors, 5 columns, 4 paths.
- **Long climb**: 12 floors, 7 columns, 6 paths (the map scrolls, keeping the current floor near the bottom).
- **Short skirmish**: 3 floors, 3 columns, 2 paths.
- **Elite gauntlet**: elite weight 40 from floor 2, rest 16.
- **Mystery road**: event 45, shop 12.
- **Pixel console**: crisp 256x224 map, bitmap font, 1-bit icons, 1 px dashed paths.

## 4. Interface

Needs: `onEnter(node)` that starts the game's fight for fight nodes; `finish({won})` everywhere that fight is decided (won, lost, fled); `start()` at every new game; choices with `apply` that change real stats; `update(dt)` every fixed step, also while busy; key / pointer routing while busy; `draw(ctx)` last; `view`, `uiRects`, `autoplay`, optional `hpFrac`, `getGold`, `spendGold`.

Provides: `GameDNA_RunMap.generate(seed, params)` (pure) and `audit(map)` (`crossings`, `orphans`, `deadEnds` always 0); `busy()`, `away()`, `state()`, `route()`, `current()`, `choices()`, `recommend()`, `layout()`, `lastDrawn()`, `rect()`; `onRunEnd({won})`; `serialize()` / `restore()`. `node = {id, type, label, floor, floors, tier, elite, boss, seed, route, run}`.

## 5. Screen rules (exact numbers)

- **Sheet**: centred, width min(field - 24u, 1.2 x field height) in HD (u = height / 360), 236 px max in pixel; it shrinks between HUD rects above and below it (never less than 55% of the field, else it covers them with one warning). Header 34u (title left, `FLOOR n / N` right), footer 28u (legend of the six types; pixel: the selected node's type and a short line).
- **Rows**: row height = map area / (floors + 1.7), at least 30u (pixel 19 px); below that the map scrolls and keeps the current floor 28% above the bottom. Columns: area width / width; node x jitter +-0.25 column, y +-0.15 row (seeded), so paths stay uncrossed on screen.
- **Nodes**: radius min(14u, 0.34 row, 0.34 column) in HD, 7 px in pixel; boss 1.6x with a slow-turning ring of 12 spikes. Choices pulse (ring +4u +-1.6u, 220 ms); the selected one lifts 20% with an overshoot (170 ms) and shows a tooltip pill (type, description, a Z key cap) above it (below when there is no room). Route nodes keep a gold ring and a green check; unreachable nodes drop to 30% alpha.
- **Paths**: unreachable dotted at 10% alpha, reachable 34%; the paths to the current choices march (7u dash), the selected one glows; the route is a 3.2u gold line over a 6u dark underlay. Pixel: 1 px dots (1 on, 2 off), marching 2-2 dashes, a solid gold line with a 1 px shadow.
- **Start**: no shared start pad. Every bottom node has its own vertical stub down to a trailhead line 1.1 rows below the bottom row; before the first pick the pawn stands on that line under the selected node and slides (70 ms ease) when the selection moves, so every first leg is a short vertical line.
- **No grazing**: no edge passes within 0.5 column / row of a node it does not end at (`audit().grazes` is 0; the generator straightens node jitter until it is).
- **Token**: a gold pawn standing on the current node (bob 2u, 240 ms); travel 620 ms ease-in-out with a 14u hop; the gold line draws behind it.
- **Tooltip**: above, below or beside the selected node, wherever it covers no other node and not the pawn; compact (type + Z) when crowded; when even that would cover something, the footer shows the line instead of the legend. Text grows up to 1.35x when the canvas is shown small.
- **Panels**: centred card, min(0.86 sheet, 300u) wide, header 40u (icon medallion, title, type and floor), up to 3 text lines, rows 27u (label, hint, coin cost; disabled rows at 45% with "need N"). After a pick the row pulses and the text becomes the result line for 900 ms (Leave: 260 ms).
- **Badge** while a fight node is away: a 22u pill (pixel 11 px) with the type icon and `FLOOR n / N · TYPE` in the first corner (top-right, top-left, bottom-right, bottom-left) that does not touch a HUD rect.
- **Fades**: dim 0.62 of the skin ink; open 320 ms (sheet rises 18u), close 260 ms.

## 6. Common mistakes (symptom -> fix)

- The map never comes back after a fight -> `finish()` is missing on one of the fight's endings (fleeing, a timeout, a second win path); grep every place the fight ends.
- `?auto=1` hangs on the map -> pass the autoplay flag, and keep `update()` in the step the freeze loop calls.
- `?auto=1` hangs after the boss node -> the autopilot was heading for a goal the run now gates (a door that opens only at the boss node); let the boss node open it, and the autopilot follow it.
- The world moves under the map -> gate the whole fixed step on `busy()` before the world and the autopilot.
- A rest or shop choice says +2 but nothing changes -> `apply` writes a copy or a field nothing reads.
- Every run is the same map / a restart keeps the old route -> call `start()` (once) at every new game, not `create()`.
- Costs are taken twice -> pass `spendGold` only when the choice's `apply` does not already charge (for example through the game's own buy function).
- The map covers the HUD -> return the HUD rects from `uiRects()`.

## 7. Acceptance moments (what to screenshot, what must be visible)

1. A new game: the sheet fades in over the dimmed game, the bottom-row choices pulse, the token waits on the trailhead under the selected node.
2. A choice selected: tooltip, glowing path; Z: the token hops along the path and the gold route follows.
3. The game's own fight for that node, with the floor badge in a free corner; after it, the map one floor higher with the node checked.
4. A rest, a shop (after one purchase the bought row reads *sold* and a dearer one *need N*) and an event panel; the result line after a pick; the stat changed in the game's HUD. In pixel, the selected row's effect and price under the rows.
5. The boss selected at the top; after it the game's own ending.
6. The pixel look at 256x224 and a 12-floor map (scrolling).
