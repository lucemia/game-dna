# B-15 Stealth vision cones

## 1. What it is

The guards of a 2020s top-down stealth game: each one looks through a soft cone of light laid on the floor, and the cone stops where a wall, a crate or a hedge stops its sight (a ray-cast visibility polygon, the same rays that decide whether the guard sees the player). When the player steps into a cone, the guard does not snap to an alert: a meter fills, faster when the player is close to the guard and near the middle of its cone, slower at the far edge. A '?' badge appears over the guard's head and its glyph fills with the meter; the guard turns to stare at the spot. If the player slips out of sight the meter holds for a moment, then drains, and the guard calms down. If it fills, the badge turns into a red '!', the cone turns red, the guard alerts and calls every guard within earshot (they turn suspicious and look at the same spot). An alerted guard that loses the player keeps its alert for a few seconds, then searches: it walks to where it last saw the player and looks around, the meter draining, until it gives up.

Tall grass hides the player completely, even inside a cone right in front of a guard; shade halves how far a guard can see them. Guards walk patrol routes with waits; at each stop they turn through a list of directions (look-around turns), and a guard always faces where its cone points: the module gives the sprite direction (`dir4`, `side`, `facing`). A thrown pebble (`noise`) turns nearby guards toward the sound.

The game keeps its rules: it gives the walls that block sight, the player's point, the hiding spots and each guard's position (or a patrol route), and it decides what an alert does: chase, call reinforcements, close a door, fail the level. The module only reports (`onAlert`, `onState`, `onLost`, `onCall`, `isAlert`).

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `range` | 150 | 60–300 | Sight distance, px at scale 1 (scale = view height / 360: 93 px in a 224 px tall game) |
| `fov` | 80 | 30–160 | Cone width, degrees |
| `react` | 900 | 250–2500 | ms to fill the meter at mid range in the cone's middle |
| `decay` | 2600 | 600–6000 | ms for a full suspicious meter to drain (after a 700 ms hold) |
| `sweep` | 55 | 0–90 | Degrees each side when a standing guard looks around (every 1100 ms) |
| `callRadius` | 170 | 0–400 | An alerted guard calls guards this close (px at scale 1) |
| `shadow` | 0.5 | 0–1 | Cover of a shade spot: sight distance x (1 - cover) |
| `opacity` | 1 | 0.3–2 | Cone strength |
| `palette` | lamp | lamp, cool, mono, skin | Cone colours per state |
| `render` | auto | auto, pixel, smooth | auto = pixel when the context has `imageSmoothingEnabled === false` |

Fixed defaults (module params): `closeBoost` 1.8 (fill speed at the guard; 0.55 at the far end), centre factor 1.25 in the middle to 0.75 at the edge, `hold` 700 ms, `alertHold` 3200 ms, `search` 5000 ms (refills twice as fast when seen again), `turnSpeed` 240 degrees/s (x 1.3 suspicious, x 1.8 alert), `lookHold` 1100 ms, patrol `speed` 40 px/s at scale 1 (investigate x 0.8, chase x 1.6), `investigate` 0.35, `near` 0 (no all-round sense).

## 3. Variants

- **Classic sentries** (default): range 150, fov 80, react 900, lamp.
- **Forgiving (story mode)**: react 1600, decay 1600, fov 70.
- **Hawk-eyed**: range 220, fov 100, react 600, decay 4000.
- **Narrow searchlights**: fov 40, range 260, cool palette.
- **Lone guards**: callRadius 0 (nobody calls for help).
- **Pixel host**: render pixel: cones rasterised as whole pixels with a dithered far rim.
- **Subtle cones**: opacity 0.55, mono.

## 4. Interface

**Needs**
- A fixed step calling `update(stepMs)` once after enemies move (also in `?t=` fast-forward and `?auto=1`), `update(0)` while paused or behind a window.
- `walls`: the tiles (`{tile, cols, rows, solidTile(c, r)}`), boxes (`{rects}`) or point test (`{solidAt(x, y)}`) that block **sight**; `invalidate()` when they change.
- `player()` → `{x, y}` world px (body middle) or `null`; `canSee()` false while nothing may be noticed; `hidden(x, y)` → 0..1, `true` (tall grass), `'shadow'`.
- Per guard `add(id, {source | patrol, eye, face})` once at spawn; `remove(id)` at death; `clear()` on new game and restart.
- `drawCones(ctx, camX, camY)` after the ground, before the sprites; `drawMarks(ctx, camX, camY)` after the sprites, before the HUD.
- The game's reaction: `onAlert` / `isAlert(id)` wired into its own enemy AI (chase, call help, fail).

**Provides**
- Cones clipped by walls, coloured by state (calm, suspicious, alert, search); '?' / '!' badges whose glyph fills with the meter.
- `facing(id)`, `dir4(id)`, `side(id)` for the guard's sprite; `get`, `list` (state, suspicion, seen, inCone, los, cover, last).
- `raise`, `noise`, `alertAll`, `calm`; `sees(x, y)`, `seenBy()` for AI and autopilots; `polygon`, `inside`, `ray`; `stats`, `events`, `hash`.

**Skins.** `palette: 'skin'` uses the skin's `fx.cold` for calm and `fx.hot` for alert; a pixel skin selects pixel render.

**Delivery.** `module/vision-cones.js` (global `GameDNA_VisionCones`; API, rules and a 15-line integration in `module/README.md`), `prompt.md`, the basket hint `basket-hint.mjs` and the judge probe `judge/probes/vision-cones.js`.

## 5. Screen rules (exact numbers)

`scale` s = view height / 360 (0.62 at 224, 0.5 for the demo's 180, 1 at 360).

- **Sight**: seen = distance <= `range` x s x (1 - cover), angle to the look <= `fov` / 2, and a ray from the guard reaches the player point before any wall (0.25 px tolerance). The drawn cone is built from the same ray caster: one ray per 2 degrees (16–180 rays) plus rays 0.0001 rad each side of every wall corner within range, so wall edges are crisp.
- **Meter** per ms while seen: `close x centre / react`, close = 0.55 + 1.25 x (1 - d / range), centre = 1.25 - 0.5 x (off / half fov). Example: straight ahead at 112 of 150 px: 830 ms to alert.
- **Cone, smooth**: radial gradient of the state colour at alpha 0.40 (0), 0.28 (0.55 R), 0.17 (0.86 R), 0.08 (R), x 1.25 when not calm; the suspicion fill is a disc of radius suspicion x R at 0.30 inside the cone; rim 2.8 s px dark ink at 0.32 under a 1.1 s px line of the state colour at 0.55 (calm) / 0.8.
- **Cone, pixel**: rasterised at 1 px per world px with crisp edges: alpha 0.34 inside 0.5 R, 0.25 to 0.8 R, then a 50 % checker of 0.24 / 0.10; suspicion disc 0.44; a 1 px rim at 0.62 (calm) / 0.85 and a 1 px ink line at 0.34 just outside it. Re-rasterised only when the polygon, state or meter (1/24 steps) changes.
- **Colours** (lamp): calm #ffeaa8, suspicious #ffc43a, alert #ff3e2e, search #ff8a2a.
- **Marks**: pixel: a 5x8 '?' / 2x8 '!' glyph (2 px strokes) in a dark badge 4 px larger with cut corners and a 3 px pointer, 4 px above `eye`; the glyph is cream above and the state colour below the meter line; '!' adds a 1 px red frame and pops 2 px up for 260 ms. Smooth: a dark drop-shaped badge 15 s px tall with a 1.6 s px ring, vector glyph, same fill; '!' scales up 45 % and back over 260 ms.
- **Look**: turn 240 degrees/s; a standing guard looks around ±55 degrees every 1100 ms (or through its waypoint `look` list); a walking guard looks along its path; a suspicious guard stares at the last seen point; `dir4` switches 8 degrees past the diagonal.
- **Shade on the cone** (`shade` rects given): beyond range x (1 - cover) inside a shade rect, pixel: a 1 px reach line at 0.8 and a 1-in-4 dither at 0.16; smooth: ink at 0.3 and a dashed reach arc. **Wall tops**: `overCones` redraws 3/4-view wall caps over the cones. **Badges** are lifted above any `avoid` rect (the player).
- **Culling**: guards whose cone box is off screen are skipped (screen read back through the context transform, camera translate included); polygons rebuild only when the guard moves 0.25 px, turns 0.001 rad, the walls change, or every 30 draws.

## 6. Common mistakes (symptom → fix)

- Cones in the wrong place, or the guard sees the player from across the map → `player()` / `source()` in screen px in a scrolling game; use world px and pass the camera to `drawCones` / `drawMarks` (or `0, 0` inside a camera translate).
- Cones pass through walls → `walls` missing or given the walk-blocking tiles in the wrong grid (tile size, origin); give what blocks sight.
- Guards see the player in tall grass → `hidden()` not wired, or tested at the wrong point (the feet tile vs the body point: test the tile the player stands on).
- The guard sprite looks one way and the cone points another → the sprite still uses the game's old facing; draw it from `dir4(id)` / `side(id)` / `facing(id)`.
- Cones cover the guards and the hero → `drawCones` after the sprites; draw it after the ground and before the sprites.
- Every enemy notices at once and autoplay never reaches its end → the alert replaced all contact rules; keep the game's short close-range rule and let alerts add chasing.
- Cones flash or reset on every frame → `add` called every frame (new ids) or `clear()` in the loop; add once per enemy, clear on new game.
- Guards turn or meters fill under a pause menu → `update(0)` while the world is stopped.
- `?t=&freeze=1` frames differ → `update` called from render; call it in the fixed step.
- A door opens but cones still stop at it → `invalidate()` after the walls change.

## 7. Acceptance moments

All at 960x540 (320x180 native x 3), `demo/index.html`, autopilot on (the default):

1. **Hidden in grass** `?t=1000&freeze=1`: the hero crouched in the tall grass bottom left, dimmed, legs under the blades, inside the yard guard's calm cone; HUD 'HIDDEN'; the guards' cones stop at the walls.
2. **Suspicious** `?t=8600&freeze=1`: the yard guard (side frame, facing right) turned toward the hero crossing the cobbles; amber cone, '?' badge with the bottom of its glyph filled; HUD 'SEEN'.
3. **Ducks into grass** `?t=17500&freeze=1`: the hall guard's amber cone over the grass patch the hero just reached; '?' half full; the meter will drain.
4. **Alert and call** `?t=24600&freeze=1`: red cone and red-framed '!' over the yard guard, 'SPOTTED!' banner; the hall guard called ('?') looks toward the same spot; the hero back in the grass.
5. **Search** `?t=29000&freeze=1`: the yard guard at the last seen point, orange cone, '?' draining (lifted clear of the hero), looking around beside the hidden hero, who shows as a cream outline and faint ghost through the blades; 'LOST YOU'.
6. **Shade** `?t=39500&freeze=1`: the hero (sprite tinted, no box) in the shade under the north wall, inside the gate guard's cone (back view, looking up); the cone shows its shortened reach in the shade (reach line, dither beyond); not seen: shade halves the 75 px sight to 37 px and his eye point is 58 px away.
7. **Treasure** `?t=44500&freeze=1`: the hero at the chest, 'TREASURE!'.
8. **Smooth render** `?t=24600&render=smooth&freeze=1`; **sight lines** `?t=8600&lines=1&freeze=1` (red = seen, amber = in the cone, grey = out of it, white dot = a wall stops the line); **cool palette** `?t=17500&palette=cool&freeze=1`.
9. **Hosts**: topdown (pixel, 256x224) slimes as guards, an alerted slime chasing and a called one; hd-topdown (640x360 smooth) sprouts and wisps whose eyes follow their cones; `checks/hosts/README.md`.
