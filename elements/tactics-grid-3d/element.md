# N-03 3D tactics battlefield on a heightmap grid

## What it is

A turn-based grid-tactics battlefield rendered in 3D with three.js 0.149.0: a small diorama of terraced tiles (grass, flagstone, sand, water) with trees, pines, rocks and ruined columns, a sky gradient, fog and one soft-shadowed sun. The player selects a unit and sees where it can stop (blue), where it could strike after moving (red) and the path it will take (a gold tube with an arrow head that climbs and drops with the terraces); hovering an enemy (or T) shows its threat zone (orange stripes). The camera turns in 90-degree steps and zooms. Units are low-poly figures built from primitives with team colours and a team ring; they walk tile by tile, hop up and down terraces, lunge into melee, cast bolts or loose arrows, flinch and fall. Height matters: climbing costs move points, a unit can climb at most its jump and drop at most jump + 1, and attacking from higher ground adds damage. The module owns rules for movement and ranges, the 3D scene, animation, camera, picking and anchors; the game keeps turns, stats, damage and AI. Shipped as a system element: module + a complete starter game (Terrace Skirmish) + demo.

## Default parameters

| key | default | meaning |
|---|---|---|
| zoom | 2 | orthographic zoom (0.7-2.2); the camera follows the cursor more as you zoom in |
| camStep | 0 | camera yaw = 45 + 90 x camStep degrees |
| pitch | 33 | camera elevation in degrees |
| light | day | day / dusk palette (sky, sun, fog, textures) |
| overlay | pulse | range tiles pulse (0.75-1.0 x opacity), solid, or outline (fill at 25 %) |
| grid | 0.22 | opacity of the tile seam lines |
| shadows | soft | PCF soft shadows from the sun, or off |
| unitHeight | 0.95 | unit height in tiles (Box3 scaled) |
| jump | 2 | default jump in levels (a unit's own `jump` wins) |
| climbCost | 1 | extra move points per level climbed |
| walkMs | 250 | time per flat tile step (hops take 1.7-2.2 x) |

## Variants

- **Terrace skirmish (default):** as above.
- **Dusk, steep camera:** light dusk, pitch 45, camStep 1, solid overlay.
- **Flat-cost board:** climbCost 0, jump 4, outline overlay, grid 0.3 (height is only scenery and a damage bonus).
- **Low-end device:** shadows off (and `quality: 'low'` for a 1024 shadow map).

## Interface

**Needs:** three.js 0.149.0 as `three.min.js` next to the page; a WebGL canvas with a 2D overlay canvas on top; map rows (heights 0-9, terrain g / s / d / w, props T / P / r / R); units `{id, side, cls, x, z, hp, mv, jump, rng}`; a fixed 60 Hz step calling `update(dt)` (0 while frozen) and a draw calling `render()` then the HUD on `overlayContext()`.

**Provides:** `reachOf / pathTo / stepCost / attackTiles / canHit / threatOf`; overlays `move / attack / threat / target`, path, cursor; `walk / attack / hurt / defeat / face / setDim / setSelected` with `onStep`, `onImpact`, `onDone`; camera `rotate / zoomBy / focus / shake / gridDirFromScreen`; `anchorOf(id)`, `pickTile`, `tileToScreen`; `state()` with facing and feet checks; `setModel / registerLook` for other looks (billboards). Starter extension points: `onHit`, `onMove`, `update`, `draw` (overlay effects layer), `drawUI`, `scene3d`, `onKey`, turn and phase events, `GAME.hit`, `anchorOf`, `uiRects`, `hitStop / shake / flash`.

## Screen rules (exact numbers)

- Tile 1 x 1 world unit, 0.5 per height level; the block bottom is at y = -2.2. Water surface 0.12 below its tile's level, bed 0.42 below.
- Orthographic camera at 40 units, pitch 33 deg, yaw 45 deg + 90 deg steps, turn eased over 380 ms; half-height = (max(w, h) x 0.47 + 0.6) / zoom.
- Overlays sit 0.026-0.038 above the tile top, inset 0.035, fill opacity move 0.56, attack 0.5, threat 0.5 (stripes moving 0.25 / s), target 0.55; outer edges 0.06 wide at 0.95 opacity.
- Path: tube radius 0.06 (dark outline 0.085) 0.12 above the tiles, a step up/down at each terrace edge, arrow head cone r 0.17, ending 0.18 before the tile centre.
- Units: height `unitHeight` tiles (brute x1.1, archer x0.97); feet on the tile top within 0.01; team ring r 0.33-0.41; selection ring r 0.42-0.5 pulsing at 6 rad/s.
- Walk: 250 ms per flat step, hop = 22 % crouch, 58 % flight (arc 0.32 + 0.275 x levels), 20 % landing; melee impact at 470 ms of 820; cast releases at 380 ms, bolt 460 ms, arrow 380 ms; hurt 420 ms; defeat 1300 ms (kneel 260, crumple 1.3 rad backwards with the feet sliding 0.26 forward so the body stays on its tile, fade 700-1260, sink 0.3). A walker passing an ally's tile: both shift up to 0.3 tile sideways (total offset capped at 0.32).
- Props in front of a unit, the cursor or a projectile fade to 30 % in 180 ms; units behind terrain or props get a 50 % team-colour silhouette (x-ray pass).
- Facing: yaw = atan2(v.x, v.z) + facingOffset (built-ins -PI/2), set at the start of every step and every attack; measured on the model, must be within 15 deg.
- Starter battle camera: before an exchange where the attacker stands behind its target (seen from the camera), the camera turns 90 deg (420 ms) first.
- Portrait phones: logical view 540 x (540 x screen aspect), frameScale = VH / 540 x 0.78, the hint pill moves below the top bar.
- Starter HUD (960 x 540 logical): turn plate 214 x 50 at (14, 12); unit panel 316 x 90 bottom-left; tile panel 172 x 90 bottom-right; forecast 400 x 98 bottom-centre (replaces the unit panel while targeting); HP bar 40 x 5 above each unit; banners 88 px tall.

## Common mistakes (symptom -> fix)

- Units walk backwards or sideways -> the model's nose is not on +X: pass its own `facingOffset` (`setModel` / `registerLook`), never add a per-scene rotation.
- Feet float or sink on terraces -> do not move `actor.obj.root` yourself; use `walk` / `setTile`; a custom model needs a mesh with `userData.foot` or `setModel(..., {feet: false})`.
- The range shows tiles behind a cliff the unit cannot climb -> pass the unit's own `jump`; use `reachOf` for both the overlay and the move.
- Arrow keys move the cursor the wrong way after turning the camera -> map keys with `gridDirFromScreen(dx, dy)`.
- Nothing animates in `?t=&freeze=1` -> call `update(dt)` in the fixed step, not in the render loop.
- Black page on a device without WebGL -> keep the overlay canvas; the module draws a 2D map there with a message.
- Damage applied before the swing lands -> change HP in `onImpact`, then call `hurt` / `defeat`.
- A loaded three.js from a CDN or another version -> only the pinned 0.149.0 file next to the page.

## Acceptance moments

1. `starter/?t=1900&freeze=1&script=range`: Aldric selected, blue range over two terraces, red fringe, gold path climbing to the cursor, unit and tile panels.
2. `starter/?t=3300&freeze=1&script=target`: Aldric on the high ground facing Gorrak, target tile gold, forecast "HIGH GROUND +1".
3. `starter/?t=1500&freeze=1&script=threat`: orange striped threat zone of all enemies.
4. `starter/?auto=1&t=22700&freeze=1`: a lancer mid-walk facing its step; `t=23770`: lunge + hit number; `t=55100`: a shaman's bolt in flight; `t=42700`: a defeated unit falling; `t=99000`: VICTORY banner.
5. `demo/?scene=lineup&zoom=2.2&t=1000&freeze=1`: all five looks, both team colours.
6. `checks/facing-3d/sheet.png`: moves N E S W, strikes and shots N E S W, all 0 deg.
