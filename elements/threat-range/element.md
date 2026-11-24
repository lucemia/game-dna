# B-02 Enemy threat range

## 1. What it is

On a tile-map tactics game, one key (default `T`) or a small on-screen THREAT button paints the "danger zone": every tile any enemy could move to this turn, plus every tile it could strike from a tile it can stop on. The zone is a red tint over the terrain with a crisp 2 px border: an outer line of light and dark dashes that slowly march clockwise around each region, and a solid inner line. Pointing the cursor at one enemy (with none of the player's units selected) shows only that enemy's reach; confirming on an enemy pins it, and pins add up, so the player can watch two or three dangerous enemies without the full map going red. The zone follows the board: when any unit changes tile (an enemy walks, the player's unit now blocks a corridor, a unit dies) it is recomputed on the next step and redrawn. Reach uses the game's own terrain costs and its own blocking rule (the opposing side blocks, friends can be passed). The player's own blue movement range is never tinted: while it is on screen the zone is drawn as an outline only.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `tint` | red | red, threat | Zone colour: the skin's `overlay.attack` (red) or `overlay.threat` (violet) tokens |
| `fill` | 0.8 | 0–1 | Fill strength (0 = outline only, always) |
| `pattern` | solid | solid, pulsing, checker | Fill pattern (the skin's overlay patterns) |
| `outline` | march | march, solid, off | Border style |
| `march` | 8 px/s | 0–24 | Dash speed; whole pixels per step |
| `dash` | 4 px | 2–8 | Dash and gap length |
| `fade` | 120 ms | 0–400 | Tile fade in/out when the zone appears, disappears or changes |
| `both` | outline | outline, dim | With the player's range on screen: outline only, or 35 % fill outside the player's tiles |
| `walls` | hide | hide, show | Strike tiles on terrain the enemy cannot enter (walls, deep water) |
| `costs` | on | on, off | Terrain costs (off = every passable tile costs 1) |
| `start` | off | off, on | Zone shown when a battle starts |
| `key` | KeyT | KeyT, KeyQ, KeyV, KeyC | Toggle key (`KeyboardEvent.code`) |
| `label` | THREAT | THREAT, DANGER, RANGE | Button text |
| `layer` | under | under, over | Drawn before units (default) or after them, cut around sprite rects |
| `button` | auto | auto, off | Auto-placed button in a free corner of the map view, or none |

## 3. Variants

- **Classic danger zone**: the defaults.
- **Calm board**: `fill 0.5`, solid outline, `fade 240`, `both: dim`.
- **Arcane violet**: `tint: threat`, pulsing fill, `march 12`.
- **Outline only**: `fill 0`, marching 3 px dashes at 6 px/s: the map stays fully readable.

## 4. Interface

**Needs**
- Grid size, tile size, the map viewport inside the canvas and the camera scroll.
- `cost(x, y, unit)` (the movement rules' own cost; ≥ 99 or Infinity = impassable), `occupant(x, y)`, each unit's tile, move and attack range `[min, max]`, the enemy list.
- A draw slot after the ground and after the player's range overlay, before units; a slot after HUD for the button.
- Optional: the tiles the player's range overlay shows now (`playerRange()`), sprite rects (`getObstacles()`), HUD rects (`uiRects()`), the key handler and pointer clicks.

**Provides**
- The shown tiles, `has(x, y)`, `threatAt(x, y)` (ids of the shown enemies that threaten a tile) for HUD text ("DANGER 2") or AI hints.
- `zoneOf(unit)`: one unit's move and threat sets, non-interactive.
- The button rect (`buttonRect()`), to keep other pop-ups off it.

**Delivery (v1).** `module/threat-range.js`, one global `GameDNA_ThreatRange`, API and a 15-line integration in `module/README.md`. The host calls `create(options)`, `update(dtMs)` every step, `draw(ctx, cam)` and `drawButton(ctx)`, feeds `key()` and `click()`, sets the single-enemy view with `showUnit()` and pins with `toggleUnit()`, and `clear()` at a new battle. The module checks a signature of every shown unit's tile, move and range plus a hash of all occupants each step, so the host never has to call `invalidate()` for moves (only for terrain changes). Every host callback is wrapped; a callback that throws is ignored with one warning; nothing is drawn outside `view`.

## 5. Screen rules (exact numbers)

Native canvas (256×224 in the demo), 16 px tiles, integer-scaled with nearest-neighbour.

- **Reach**: Dijkstra from the unit's tile over 4 neighbours; entering a tile costs `cost(x, y, unit)`; total ≤ move; a tile holding a unit of the other side is never entered; friends are passed but not stopped on. Threat = every reached tile ∪ every tile at Manhattan distance `min..max` from a tile it can stop on (its own tile included), except impassable tiles when `walls: hide`.
- **Fill** (per tile; g = `fill`): first a full-alpha `color` pass with the zone colour mixed toward white by 0.6 × (1 − g), which replaces the ground's hue (weak fills read rose, never brown); then the skin's `overlay()` (pixel16: `color`-composite tint at 0.72 g, a `source-over` wash at 0.22 g, pulsing 0.30, checker 0.30/0.17, 1 px seams at 0.12); then a wash of the zone colour mixed 30 % toward white at 0.10 + 0.08 g. In the single-enemy view, strike-only tiles (not reachable) get half the fill, so the move area and the strike ring read apart.
- **Outline**: on every tile edge whose neighbour is outside the zone. Outer pixel row: dashes `dash` px light (`text.accent`, pixel16 `#ffe070`) and `dash` px dark (zone colour mixed 55 % toward `ink`), positioned by world pixel so neighbouring tiles join; the pattern shifts by ⌊t × `march`⌋ px, clockwise (top edges move right, right edges down, bottom edges left, left edges up). Inner pixel row: solid, zone colour mixed 35 % toward the accent, 0.9 alpha, shortened at corners so lines never double.
- **Fade**: each tile's level moves toward 1 (in the zone) or 0 by `dt / fade` per step. The fill fades as a 4×4 ordered dither of full-strength pixels aligned to world pixels (16 levels), never as a translucent tint; the outline uses the level as alpha.
- **With the player's range** (`playerRange()` non-empty): `both: outline` = no fill at all; `dim` = fill × 0.35, never on the player's tiles. The outline is always drawn. Recommended order: ground → player's blue range → zone → units → cursor → HUD → button.
- **Button**: plate frame (pixel16 `plate`; `alert` look when anything is shown), a 5×5 lamp with 1 px ink rim (full zone colour = all enemies, darker with a notch = single or pinned enemies only, grey = off) and the label in the skin's `ui` font. Size = 13 + text width + 5 px × max(13, font height + 6). Auto-placed 2 px inside `view`: the first spot that touches no sprite or UI rect among the corners (top-right, top-left, bottom-right, bottom-left), then every 8 px along the top and bottom edges, then the left and right edges (least overlap if none is free). It stays where it is while that spot is free. Leave the map cursor out of `uiRects()`, or the button moves away from the pointer.
- **Layer `over`**: every fill piece and outline run is cut around `uiRects()`. An obstacle that carries its sprite (`{x, y, w, h, img, flip}`) is drawn again over the zone, so exactly its own pixels (weapons included) stay untinted; an obstacle without `img` is cut out as a box inset by 1 px.
- **Button layer**: with `layer: under` only `drawButton()` draws the button (call it last, after windows, so it is placed against this frame's window rects); with `layer: over`, `draw()` draws it too unless `drawButton()` was used the frame before.

## 6. Common mistakes (symptom → fix)

- Zone wrong on forest or hills → `cost` is not the movement rules' cost function; pass the same one.
- Zone walks through the player's units → `occupant` ignores units, or `isEnemy` treats both sides as friends; return the unit, give both sides a `side`.
- Zone stays where the enemy was → `update` is not called on that scene (enemy phase, animations); call it every step.
- Units turn red → `draw` sits after units with `layer: under`; draw before units, or set `layer: over` and pass sprite rects.
- Units sit in green boxes with `layer: over` → the sprite rects are whole tiles; pass the opaque sprite bounds.
- Weak fills look like brown dead grass → a plain `color` tint at low alpha mixes red with green; desaturate first (the module does).
- The blue move range is tinted red → `playerRange()` is missing; return the tiles your overlay shows, and draw the zone after it.
- Pressing T also ends the turn (or nothing happens) → `key` must be first in keydown and the handler must stop when it returns true; it returns false for every other key.
- Button covered by a unit or a window → `drawButton` is called before them, or the button was placed with last frame's window rects; call `drawButton` last, after units, HUD and every window.
- Zone shifts by the camera twice → pass `cam` (map scroll) to `draw` and keep `view` in canvas px; do not also translate the context.
- Zone missing in `?t=&freeze=1` shots → the instance is created after the fast-forward, or `update` is outside the fast-forward loop.
- Old zone flashes at a new battle → `clear()` at the start of a battle or restart.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=500&freeze=1` | The map with no zone; THREAT button top right, lamp grey. |
| `demo/?t=2000&freeze=1` | Every enemy's zone: red over grass and forest, river and walls left clear, holes where no enemy reaches, marching gold/dark dashes along every border; lamp lit. |
| `demo/?t=3600&freeze=1` | The Rider has crossed the bridge; the zone grew west of the river with it. |
| `demo/?t=5200&freeze=1` | The Knight selected: its blue range fully blue, the danger zone drawn as an outline only. |
| `demo/?t=7000&freeze=1` | Cursor on the Archer: only its reach; its move area full red, the range-2 strike ring around it at half fill. |
| `demo/?t=9800&freeze=1` | Hexer and Brute pinned, Brute under the cursor: two zones combined, HUD `BRUTE AND PINS`, lamp half lit, a pin flag above each pinned head (clear of the cursor). |
| `demo/?t=2000&freeze=1&tint=threat&pattern=checker` and `&fill=0` | Violet variant; outline-only variant. |
| `demo/?t=2000&freeze=1&layer=over` | Zone drawn after units, cut around each sprite's opaque bounds: no unit tinted, only a thin untinted margin. |
| Integrated hosts (`checks/hosts/`) | Tactics host `?t=2000&freeze=1&threat=1`: zone under units, button top right; grid starter `?t=3200&freeze=1&threat=1&script=arrow`: hero's blue range untouched, zone as a violet outline (the starter marks strikes in red), button in a free corner, never under the unit window. |
| Phone width 500 px | Canvas fits at a whole-number scale, no horizontal scroll. |
