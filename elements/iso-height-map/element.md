# B-04 Isometric height & jump

## 1. What it is

The tactics map seen from a 2:1 isometric angle, where every tile has a height. Tiles are drawn as stacked blocks: a lit top face and two side faces (left lit, right in shade) with one band per height level, so a cliff reads as a wall and a staircase as steps. Water is lower, animated, and units standing in it sink a little. A unit moves inside its move points, but each step may climb at most its **jump** and drop at most **jump + fall**, so a cliff can stop a heavy knight while a nimble scout hops up. Ranged units shoot farther from high ground; melee cannot reach a target more than a few levels up or down. Damage grows when attacking from above and when hitting a target's side or back, so each unit picks a **facing** when its action ends. Units act one at a time in **wait-time (WT)** order: the lowest wait acts next and acting costs wait. The map is drawn back to front, so a tall block in front hides a unit behind it; the active, selected or hovered unit then shows an outline through the block. The cursor sits on the tile top at its height, and the camera can turn the map in 90° steps.

## 2. Default parameters

| key | default | range | meaning |
|---|---|---|---|
| `jump` | 3 | 1–6 | levels a unit can climb in one step (for units without their own jump) |
| `fall` | 2 | 0–4 | extra levels a unit may drop beyond its jump |
| `hgRange` | 2 | 1–4 | height levels per +1 range for ranged weapons (max range ≥ 2), and per damage step |
| `hgDamage` | 10 | 0–20 | % damage per height step (±, capped at 3 steps) |
| `side` / `back` | 1.25 / 1.5 | 1–1.5 / 1–2 | facing multipliers |
| `step` | 4 | 4, 6, 8 | px per height level |
| `xray` | active | active, team, all, off | which hidden units get an outline |
| `facing` | choose | choose, auto | human units pick a facing / everyone faces the nearest foe |
| `overlay` | pulse | pulse, solid | range overlay |

Fixed: 32×16 px diamonds, 256×224 native, melee height limit `meleeH` 4 levels, WT cost ×1 (moved and acted), ×¾ (one), ×½ (neither).

## 3. Variants

- **Classic iso tactics**: the defaults.
- **Steep cliffs**: jump 2, fall 1, 8 px levels, +1 range per level, 15 % per level, outlines for every player unit. Stairs become the only way up.
- **Flanking matters**: side ×1.5, back ×2, height only 5 %.
- **Quick play**: jump 4, fall 3, facing auto, outlines on all units.

## 4. Interface

**Kind: system (v1.2).** `starter/index.html` (Highcliff Crossing) is a complete WT tactics skirmish on the module, with combat, an enemy AI, `?auto=1` and documented extension points (`starter/README.md`): hit site `applyHit` / `game.hit` (events carry `mult`, `side`, `dh`), draw-effects slot, `drawTile` ground layer in painter's order, `game.uiRects()`, `game.anchorOf(id)`, input chain, autoplay, hit-stop / shake / flash, `onTurnStart(turn, side, unitId)` / `onPhase`.

**Delivery (v1)**: `module/iso-height-map.js` (global `GameDNA_IsoHeight`; API in `module/README.md`). The module owns projection, picking, reach, attack reach, the damage modifier, draw order, outlines, cursor, facing picker, walk animator, camera and the WT scheduler; the host supplies heights, terrain kinds, units, a unit draw callback and its rules. `prompt.md` converts an existing flat tile game (derive heights from the tile types, keep the rules, add `canStep` / `canHit` / `damageMod` at the game's own rule sites).

**Needs**: grid size; a height and an art kind per tile; units with position, side, hp, move / jump / range (or defaults); a draw function for one unit at given feet coordinates; a 60 Hz step; the map viewport; a cursor tile, pointer, confirm and cancel.

**Provides**: tile ↔ screen projection and picking with height; reachable / stoppable / attack sets under the jump rule (`reachOf`, `pathTo`, `attackFrom`); `damageMod(att, def) → {mult, height, facing, side, dh}`; sprite anchors on the iso map; UI rects; facing chosen (callback); next unit by WT.

**Algorithm**: Dijkstra over 4 neighbours with the game's costs; a step from height a to b is allowed when `b − a ≤ jump` and `a − b ≤ jump + fall`; enemies block, allies pass but cannot be stopped on. Attack: Manhattan distance in `[min, max + bonus]`, bonus = `floor((h_att − h_tgt) / hgRange)` for max ≥ 2; melee needs `|dh| ≤ meleeH`. Damage multiplier = `(1 + clamp(round(dh / hgRange), −3, 3) × hgDamage %) × facing`, where facing compares the direction from the defender to the attacker with the defender's facing (same = front, opposite = back, else side). Draw order: view diagonals `u + v` back to front; a unit is drawn after the deepest tile it touches (both ends of a step while walking). Rotation maps grid (x, y) to view (u, v) by 90° turns; keys and facings stay screen-relative.

## 5. Screen rules

- **Blocks**: diamond rows `2r + 1` half-width (no gaps, no overlap). Top face 5-tone ramp per kind, light from the upper left: 1 px warm rim on the two upper edges (0.32), dark rim on the lower ones (0.22); a taller neighbour behind casts a 2–9 px shadow (0.36). Side faces go down to the neighbour in front (or 2+ levels below the lowest tile at the map edge): left face lit, right face mixed 0.38 with `#1a1030`; one course line per height level; 1 px light top edge, dark contact line; earth faces keep a 2 px grass lip.
- **Water**: top drawn every frame (2 ramps, 3 moving glints); units in water sink 3 px with a ripple.
- **Overlays**: blue / red diamonds inset 1 px, alpha 0.34–0.48 (pulse 3.2 rad/s along the diagonal), 2 px edge light on the upper half and dark on the lower; grow in by path cost (0.5 per frame); the target diamond blinks at 8 rad/s; path dots 4×2 px, the last 6×3 px.
- **Cursor**: four corner brackets (2 px segments, dark rim) on the tile top at its height, alternating colour every 0.28 s, red after an invalid confirm; a 7×7 pointer 6 px above the occupant's head (10 px above an empty tile), bobbing 3 px.
- **Outline**: the covered part of the sprite gets a 0.38 team-colour fill and a 1 px light ring, both only where blocks cover it, pulsing 0.75–1.
- **Facing picker**: four arrows 0.62 tiles out from the unit; the chosen one 6 px, cream / gold, bobbing; the others 4 px grey-blue.
- **Info plate**: terrain name + height icon and `H n`, 30 px tall, in the view corner that avoids HUD rects, the cursor and units. **WT bar**: 16 px faces, current first in a gold frame, others with their wait in 3×5 digits.
- **Camera**: centres the cursor / walking unit, eases 20 %/frame, clamped to the map with 22 % of the view height spare at the top for HUD bars.

## 6. Common mistakes

- Units never hidden by blocks, or float over cliffs → the game still draws its units itself; draw them only through `drawUnit` inside `iso.draw`.
- A duplicate sprite flickers on screen → `drawUnit` ignored its `ctx` and painted the outline mask on the main canvas.
- Taps select the tile behind a raised one → the pointer still divides by the tile size; use `iso.pick`.
- AI stuck at the foot of a cliff → its distance field ignores the jump rule; test `canStep` from the neighbour to the current tile.
- Vertical seams of sky between side faces → the edge columns of a face were skipped (clamp the diamond's bottom row lookup).
- `api.key` returned a number → a function declaration with the same name as the tile-key helper; keep names distinct (fixed in v1).
- The manual game hangs after a move → the facing picker is open but the key handler never calls `iso.key` first (a judge probe registers the picker as a modal so scripted sessions press Z).
- Rules drift between the player's range and the AI → both must use the same `canStep` / `canHit`.

## 7. Acceptance moments

| shot | URL | must be visible |
|---|---|---|
| `demo-jump-range-t1500.png` | demo `?t=1500&freeze=1` | blue reach stopped by the cliff, up the stairs; path dots; cursor on the stair top `H 6` |
| `demo-steep-step8-jump2-t1500.png` | `&step=8&jump=2&xray=all` | 8 px levels, smaller reach, the Hexer outlined through the tower |
| `demo-back-attack-t4200.png` | `?t=4200&freeze=1` | after a hop up the stairs: target diamond on the Brute, forecast `BACK X1.5` |
| `demo-facing-t6900.png` | `?t=6900&freeze=1` | four facing arrows around the knight |
| `demo-xray-t8800.png` | `?t=8800&freeze=1` | the Hexer behind the tower outlined |
| `demo-rotate-t10300.png` | `?t=10300&freeze=1` | the map turned 90°, the tower now in front |
| `demo-high-ground-range-t13500.png` | `?t=13500&freeze=1` | the archer on the plateau: red reach far down the meadow |
| `starter-*.png` | starter `?script=move|face|rotate`, `?t=20000` | move path, facing picker, rotation, autoplay mid-game |
| `starter-addon-damage-numbers-t25100.png` | combo starter + damage-numbers | a bouncing number on the hit, built-in numbers off |
| `integration-tactics-*.png` | unseen flat tactics game converted | iso map from derived heights, outlined raider behind the fort wall, the game's own HUD |
| `*-500px.png` | 500 px viewport | no horizontal scroll |
