# B-06 Pseudo-3D flight ground

## 1. What it is

A flight mode for a top-down game. On the walking map the hero calls a mount (a bird, or a glider). Over 0.6 s the map zooms in, turns to the hero's facing and tilts up until a horizon appears with a sky band above it. The ground is now a perspective plane: the game's own tile map, baked once into a mip-mapped texture and drawn one scale per screen row (16-bit "scanline scaling") into an offscreen `ImageData`, fading into a haze toward a bright horizon line. The mount, seen from behind with flapping wings, flies over it with its shadow on the ground below. Left/right turn and bank (the mount leans, the horizon tilts a few degrees), up speeds up (wind streaks), down slows down. Mountains, trees, towns and towers stand up as billboards, scaled by distance and depth-sorted (the mount is drawn between the far and the near ones). The world wraps (or a bounded map shows its border tile outside and turns the mount back). A mini-map shows the mount, its heading and the goals. The land key lands only on tiles the game calls flat (`canLand`): green corner marks show the tile under the shadow; over water, forest or a town the prompt reads NO LANDING and shakes. Landing runs the take-off in reverse and ends exactly on the walking view, with the hero on the landing tile.

It is a system element: it owns the flight state machine (walk -> rising -> flying -> landing -> walk), the projection, all flight rendering and the controller. The game keeps its walking code, hero, camera, HUD and autopilot.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `speed` | 72 | 40-140 world px/s | Cruise speed; up = x1.6, down = x0.55, eased |
| `turn` | 100 | 60-180 deg/s | Turn rate |
| `bank` | 5 | 0-10 deg | Horizon tilt and mount lean while turning (eased, 0.12 per frame) |
| `height` | 56 | 32-96 world px | Camera height above the ground; the mount flies at 0.55 of it |
| `horizon` | 0.3 | 0.2-0.45 | Horizon row as a fraction of the view height |
| `transition` | 600 | 300-1200 ms | Take-off and landing (smoothstep) |
| `fog` | 0.6 | 0-1 | Distance haze strength |
| `sky` | day | day, dusk | Sky, haze and cloud palette |
| `mount` | bird | bird, glider | Built-in mount sprite (a game may draw its own) |
| `minimap` | on | on, off | Mini-map window |
| `res` | 256x224 | | Native resolution of the demo and starter (the module adapts to any view) |

Fixed: focal length = view width / 2 (90 degree field of view); mount ground row = max(horizon row + 24, 0.74 x view height); 7 mip levels chosen per pixel from the larger of the across- and along-scanline footprint; ground billboards nearer than 1.15 x the mount distance are never drawn (nothing stands between the camera and the mount), flying ones (alt > 0) nearer than 0.6 x; a billboard is never drawn past 1:1 pixel density nor taller than 40 % of the view; the landing glides to the centre of the tile under the mount.

## 3. Variants

| Name | Params |
|---|---|
| Island courier (default) | as above |
| Dusk glider | speed 60, turn 80, bank 7, height 48, horizon 0.33, transition 800, fog 0.8, sky dusk, mount glider |
| Low and fast | speed 120, turn 140, bank 8, height 36, horizon 0.26, transition 450, fog 0.5, minimap off |
| High survey | speed 64, turn 90, bank 3, height 90, horizon 0.38, transition 900, fog 0.4 |

## 4. Interface

**Needs:** the tile map (`cols`, `rows`, `tile`, `tileAt`, and `tileImage` = the game's tile canvases, or `tileColor`); `canLand(tx, ty)`; the walking camera `topdown()` and the map viewport `view`; the hero's position and facing at take-off; `onLand` to place the hero and recompute the camera; a 60 Hz `update()` and the map draw pass; a free take-off key; optional billboards and mini-map markers; `wrap` / `outsideTile` for bounded maps.

**Provides:** `busy()`; `onPhase`, `onLand` (start), `onLanded` (end), `onLandDenied`; `anchor()` / `mountRect()` of the mount (computed even without a draw, so `?t=` fast-forward has anchors); `project(wx, wy, wz)`; `getUIRects()`; `steer()` / `autopilot()` for scripted flights; state (`phase`, `progress`, `x`, `y`, `heading`, `speed`, `roll`, `altitude`, `tile`, `stats`).

## 5. Screen rules (exact numbers)

- 256x224 native, integer-scaled; the ground is drawn per pixel into an offscreen `ImageData` (one division per pixel, no per-frame allocation): about 3 ms per frame in headless Chrome, first frame + bake about 20 ms.
- View 256x208 (below a 16 px HUD), horizon 0.3: horizon row 62, mount ground row 154, one screen pixel there = 0.61 world px; the mount sprite (58x44) sits 0.55 x height x 1.64 = 50 px above its shadow.
- Fog: none nearer than 2.2 x the mount distance, full at height x focal / 2.5; the 2 rows at the horizon are pure haze with a 1 px white line at 55 %.
- Sky strip width = 2 pi x focal (804 px at 256 wide): the sky turns exactly with the ground. Clouds drift 0.06 px per frame.
- Bank: roll eases toward +-`bank` degrees; the horizon shears by tan(roll) per column; mount pose has 5 bank steps.
- Transition: frame 0 of take-off and the last frame of landing equal the walking view pixel for pixel (same camera, scale 1, north up); billboards fade in over 55-95 % of the take-off and out the same way on landing (none before the perspective is established); the horizon rises with (1 - e)^1.6 so the tilt is gradual.
- Mount scale during transitions: 0.5, 0.75, 1 (stepped); shadow width 0.32-0.42 x sprite width, 38 % dark.
- UI: mini-map top right (map fitted to 54 px + 4 px frame), prompt bottom right (`Z LAND` green / `NO LANDING` grey, red and shaking for 40 frames after a refusal), speed gauge bottom left (70x17); `inset` moves them clear of a HUD.

## 6. Common mistakes (symptom -> fix)

- The landing ends with a jump to another spot -> `onLand` moved the hero but not the camera; recompute it there (the landing reads `topdown()` every frame).
- Take-off does not start on the walking picture -> wrong `view` (forgot the HUD band) or `topdown()` is not the camera of the view's top-left.
- The mount lands in water or on a house -> `canLand` returned true; only flat, walkable, free tiles inside the map.
- Enemies catch the hero while it flies, or `?auto=1` ends differently -> the walking update still runs while `busy()`; return early from it (and only from it).
- Keys held at take-off do nothing until pressed again -> the game polls its own key set: feed `setInput` from it each step, or release and re-press.
- The flight ground is flat colour blocks -> pass `tileImage` with the real tile canvases.
- A row of tiny towns -> one billboard per house tile; give one per object.
- Scenery or a hazard covers the mount -> nearer ground billboards are culled by the module; draw your flying hazards beside the mount near contact (the starter offsets them 24 world px sideways) and remove them at the hit.
- Damage numbers have no anchor under `?t=` -> use `anchor()` (it is computed from the state, not from the last draw).
- Water does not animate in flight -> the texture is baked once (call `rebake()` if tiles change); known limit.

## 7. Acceptance moments

| Moment | Must be visible |
|---|---|
| `demo/?t=500&freeze=1` | the walking map and hero, `X TAKE OFF` prompt |
| `demo/?t=1300&freeze=1` | mid take-off: the map rotated and tilted, no sky yet or a thin band, the mount at half size over its shadow |
| `demo/?t=2500&freeze=1` | flight banking left: horizon tilted, mount leaning, mini-map |
| `demo/?t=4500&freeze=1` | boosting: wind streaks, full speed gauge, islands and billboards to the horizon |
| `demo/?t=6200&freeze=1` | a refused landing over the sea: red NO LANDING |
| `demo/?t=11800&freeze=1` | landing near the town, ground rotating back to north-up |
| `starter/?t=7850&freeze=1` | the wisp strike frame: star burst on the wing tip facing the wisp, the wisp bursting into puffs beside the mount (never over the rider), red flash on the world only, `-2` above the mount, stamina bar down 2 |
| `starter/?t=45000&freeze=1` | ALL LETTERS DELIVERED |
| unseen top-down host after integration | its own tiles as the flight ground, trees and houses as billboards, landing back on its walking view |
