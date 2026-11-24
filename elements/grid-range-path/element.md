# B-01 Grid movement range + path arrow

## 1. What it is

The core read of a grid tactics map. The player puts the cursor on one of their units and confirms. Every tile the unit can end its move on lights up blue, computed from its move points and the move cost of each terrain. Enemies block the way; allies can be walked through but not stopped on. A red fringe around the blue area shows every tile the unit could strike after moving, using its weapon range. While the cursor moves, a thick segmented arrow (round tail, straight body, rounded corners, arrowhead) runs from the unit to the cursor along the cheapest path. When the cursor extends the arrow by one affordable tile, the arrow keeps the path the player has drawn so far. Confirming walks the unit along the arrow one tile at a time. Cancel returns the cursor to the unit. After the walk, Wait ends the unit's action and Back puts it on its starting tile again. The cursor moves one tile per tap; held, it repeats and then speeds up. Two small windows show the terrain under the cursor (name, DEF, AVO) and the unit in focus (name, HP).

## 2. Default parameters

| key | default | range | meaning |
|---|---|---|---|
| `move` | 5 | 3–9 | move points of the selected unit |
| `range` | `1` | `1`, `1-2`, `2` | weapon range (min–max Manhattan distance) |
| `costs` | `on` | on/off | off = every passable tile costs 1 |
| `overlay` | `pulsing` | solid / pulsing / checker | how the blue/red overlay moves |
| `repeat` | `normal` | slow / normal / fast | cursor repeat: delay / rate / fast rate in frames = 16/6/3, 12/4/2, 8/3/1; fast after 50 / 40 / 28 frames |
| `res` | `240x160` | 240×160, 256×224 | native canvas, integer-scaled, 16 px tiles |

Terrain costs used by the demo: plain, meadow, road, bridge, ruins and fort cost 1; forest 2; hill 3; ford 3; peak, river and wall cost 99 (impassable).

## 3. Variants

- **Handheld melee**: the defaults.
- **Console skirmisher**: 256×224, move 7, range 1–2, checker overlay. The red fringe becomes two tiles deep.
- **Archer on open ground**: range 2 only (tiles next to the unit are not red unless another stop reaches them), terrain costs off, solid overlay.
- **Snappy cursor**: fast repeat. You can see the cursor's after-images when it slides.

## 4. Interface

**Skins (module v1.2).** With `skins/skin-api.js` loaded, every visual goes through `GameDNA_Skin.resolve(options.skin)`: overlays, the arrow (`skin.path` when present), the cursor, windows, text, the HP meter and the menu. The default `pixel16` is pixel-identical to the built-in drawing, which is still used when no skin script is loaded.

**Kind: system (v1.2).** `starter/index.html` is a complete tactics skirmish built on the module, with combat, an enemy AI, `?auto=1`, and documented extension points for addons. See `starter/README.md`: the hit site `applyHit` / `game.hit`, the draw-effects slot, `game.uiRects()`, `game.anchorOf(id)`, the input chain, autoplay, and turn / phase events, with addons registered in `game.addons`.

**Delivery (v1)**: `module/grid-range-path.js` (global `GameDNA_GridRange`; API in `module/README.md`) implements everything below, including the drawing. The demo runs on it, and `prompt.md` tells an agent to paste it verbatim and wire it in at 5 points in the host. The numbers in sections 4–5 describe what the module does. v1.1 adds adapters for unknown hosts: `posOf`/`idOf`, per-unit `moveOf`/`rangeOf`, configurable `commands` + `onCommand` (default WAIT/BACK), `view` (viewport inside the canvas), `getUIRects()`, `key()` that only consumes keys it uses, and the non-interactive `reachOf`/`pathTo` (autopilots keep their own movement).

**Needs**: grid size and tile size; a terrain id per tile with `{name, moveCost, def, avo}`; units `{name, side, x, y, hp, maxHp}`; input as held + edge-latched pressed for four directions, confirm and cancel, plus pointer → tile; a camera offset; a 60 Hz fixed step and a draw slot between ground and units.

**Provides**: `unitMoved {unit, from, to, path}` (after the walk and Wait), `moveUndone {unit}` (Back), `selectionCancelled {unit}`; the reachable / stoppable / attack sets and the current path with its cost, for a forecast or AI to read; the cursor tile as drawn.

**Data shapes** (the prompt requires these): `key = y*MW + x`; `reach: Map<key,{cost,prev}>` (prev = -1 at the unit); `stop`, `fringe: Set<key>`; `path: [{x,y}]` starting at the unit; `sel = {unit, origin, mode: 'select'|'walk'|'menu'}`. `path` is cleared on cancel, WAIT and turn end. BACK restores `unit.x/y` from `origin`.

**Algorithm**: Dijkstra from the unit, 4-neighbour, order E, W, N, S, using an array as the open list. It skips tiles off the map, tiles with an enemy and tiles that cost ≥ 99, and keeps `dist ≤ move`. *reachable* = every tile with dist ≤ move. *stoppable* = reachable minus tiles that another unit stands on. *attack* = every tile at a Manhattan distance in [rmin, rmax] from a stoppable tile that is not reachable. **Path update** when the cursor enters tile c: if c is not reachable, keep the arrow. If c is already on the path, cut the path back to c. If c is next to the path's end and cost(path) + cost(c) ≤ move, append c. Otherwise rebuild the path from Dijkstra's `prev` chain.

## 5. Screen rules

- **Overlay** per tile, drawn above ground and below units. First a `color` composite fill (move `rgb(48,100,240)`, attack `rgb(228,52,48)`) at alpha 0.72, which keeps grass, water and stone texture. Then a same-colour `source-over` wash at alpha 0.22. Pulsing adds +0.077 / +0.033 alpha where `sin((tx+ty)·0.55 − t·3.2)` > 0.5 / > 0.1, plus 2 px diagonal light streaks every 32 px that move 20 px/s at alpha 0.16. Checker adds +0.088 / −0.055 alpha on alternate tiles. In fixed-alpha terms the second fill is 0.22 for solid, 0.30 / 0.17 for checker and 0.30 / 0.22 for pulsing; the prompt gives these simplified values, and the demo's extra streaks are optional. The whole region reads as one shape: a 1 px outer edge (`rgba(214,232,255,.85)` / `rgba(255,214,200,.85)`) only where the neighbour is outside, and inner grid lines at alpha 0.12. Nothing blinks.
- **Grow-in**: tile alpha = clamp((framesSinceSelect·0.55 − dist)/2, 0, 1). The red fringe starts after dist = move + 1. All of it is done in about 0.3 s.
- **Arrow**: band radius 2.6 px (about 6 px wide), centred on the tile centres. Each corner is a quarter arc of radius 8 around the shared tile corner. The tail is a disc of radius 4.2 on the unit tile. The head's base is 13 px wide, 3 px before the cursor tile's centre, and its tip is 5.5 px past the centre. Colours: rim `#3A1206` (8-neighbour), fill `#F0A830`, top/left edge `#FFE486`, bottom/right edge `#C06A14`, 1 px centre line `#FFF6D0`, and a 2×2 white pulse that travels tail → head at 1.2 Hz. The arrow appears 5 frames after selection. During the walk it is consumed from the tail.
- **Cursor**: four L brackets with 5 px arms, 2 px thick, a 1 px rim `#24100A`, outer `#FFF6C0`, inner `#F0B830`. They pulse 1 px in and out, alternating every 0.28 s. They turn red (`#FFC0B0`/`#E84838`) outside the blue area, and shake ±1 px for 12 frames on an invalid confirm. The cursor slides 4 px/frame (8 when the repeat is fast), with up to 3 after-images that start at alpha 0.45 and lose 0.12 per frame.
- **Camera** keeps the cursor tile (and the walking unit) ≥ 16 px inside the view and eases 25 % per frame.
- **Walk**: 6 frames per tile with a 2-frame walk cycle. The overlays are hidden while walking.
- **Windows**: terrain 52×42 (name, DEF, AVO; right-aligned digits); unit 88×32 (portrait box 20×24, name, `HP n/m`, 3 px bar; plus a `MOVE cost/move` row while selecting → 42 tall); command 52×34 (WAIT / BACK, pointing hand). All of them sit 4 px from the screen edge. The corner is picked by score: covering the cursor costs 200, the selected unit 90, any other unit 60, another window is forbidden, and the side away from the cursor is preferred. The terrain window names the tile under the cursor *as drawn*, mid-slide included.
- **Units**: hand-authored palette sprites ≤ 16 px wide including the outline. The head may rise ≤ 3 px above the tile. A 2-frame idle (upper body sinks 1 px), desynced per unit. The selected unit hops 3 px while its shadow shrinks. A unit that has acted turns grey. Enemies are mirrored.
- **Text**: 5×7 bitmap uppercase, 6 px advance, 2-tone fill, 1 px drop shadow.

## 6. Common mistakes

- The red fringe covers half the map → the fringe was computed from *reachable* tiles, not *stoppable* ones, or the reachable tiles were not subtracted.
- The arrow jumps to a different route on every step → the path is rebuilt from scratch each move. Apply the extend / cut-back rule first.
- The arrow vanishes when the cursor leaves the blue area → keep the last valid path and turn only the cursor red.
- The blue area goes through enemies or stops on allies → enemies block expansion; allies are expanded through but removed from *stoppable*.
- Grass turns teal and the river turns purple under the overlay → use a hue-replacing `color` blend before the wash, not a plain alpha fill.
- A tap shorter than one frame is lost, or the cursor runs two tiles → edge-latch keydown and ignore `e.repeat`; your own counter drives the repeat.
- A window sits on the cursor or a unit → score the corners instead of using a fixed corner.
- The terrain window shows the destination tile while the cursor is still sliding → read the drawn position.
- **Cold test (no browser), round 1:**
  - No blue area → the fade-in used `prev` or a tile key as the distance, so the alpha was 0. Use fixed alphas (0.72 colour + 0.22 wash), and base any fade on `reach.get(key).cost`.
  - No red fringe → the tile key was read as a distance. Keep `fringe` as a `Set<key>`.
  - Path data correct but no arrow → the arrow must be drawn every frame in `draw()` from the stored path.
  - The old arrow is still there next turn → clear `path` on cancel, WAIT and `endTurn()`.
  - BACK leaves the unit in place → restore `unit.x/y` from `origin`.
  - End Turn throws → the agent deleted the host's `steps()`, which the enemy AI calls. Never delete or rename host functions.
  - The first repeat came after 600–700 ms → the agent relied on OS key repeat. Count frames in `step()` (12 frames = 200 ms).
- Half-strength overlays during the walk look muddy (the colour blend at alpha < 1 shifts the hue) → hide the overlays while walking.

## 7. Acceptance moments

| shot | URL query | must be visible |
|---|---|---|
| `range-arrow.png` | `?t=3000&freeze=1` | blue area shaped by forest and river, red 1-tile fringe, arrow with 2 corners ending in the bracket cursor at the bridge head, unit window with `MOVE 5/5`, terrain window `ROAD`, no window over a unit |
| `range-1-2-console.png` | `?t=3000&freeze=1&res=256x224&move=7&range=1-2&overlay=checker` | 2-tile red fringe, checker tint, 256×224 frame |
| `path-extend.png` | `?t=2600&freeze=1&script=cut` | the arrow keeps the drawn loop (up, right, down) instead of the shortest route |
| `walk.png` | `?t=2350&freeze=1&script=walk` | unit mid-walk on the road, overlays gone, arrow partly consumed |
| `menu.png` | `?t=3400&freeze=1&script=menu` | WAIT / BACK window with the pointing hand, windows clear of every unit |
| `back.png` | `?t=3800&freeze=1&script=back` | after BACK: unit on its start tile, range shown again |
| `integration-*.png` | host + module (scratch integration) | arrow following the keyboard cursor, windows clear of the TURN plate, menu, BACK, turn 2 |
| `enemy-info.png` | `?t=2000&freeze=1&script=enemy` | cursor on an enemy, red unit window, terrain window in the opposite corner |
| `costs-off-range-2.png` | `?t=3000&freeze=1&costs=off&range=2&overlay=solid` | larger blue area through forest, a red ring 2 deep |
| `host.png` | host `?t=1600&freeze=1` | host map with the same art, no overlays or arrow |
| `demo-500.png` | 500 px wide window | no horizontal scroll, controls stacked under the screen |
