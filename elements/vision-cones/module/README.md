# vision-cones.js (B-15 module, v1.1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_VisionCones`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It gives guards **view cones clipped by walls** (a ray-cast visibility polygon), a **suspicion meter per guard** that rises faster when the player is close to the guard and near the middle of its cone and falls again after the player leaves its sight, **'?' then '!' marks** over the guard's head (the glyph fills up with the meter), **hiding spots** (tall grass hides completely, shade shortens a guard's sight), **patrol routes with look-around turns**, and **alert hooks** (`onAlert`, `onState`, calls for help, noise) for your game to act on.

The module decides who sees the player. **Your game keeps its rules**: it says where the walls, the player and the hiding spots are, moves its own enemies (or lets the module walk a patrol), and decides what an alert does (chase, call reinforcements, lock a door, end the level). Everything advances in `update(dt)` with no `Math.random` and no wall clock, so `?t=<ms>&freeze=1` shows the same frame every run.

Angles are radians, 0 = right (+x), `PI / 2` = down (+y); `fov` is in degrees. All positions are **world px** (the space your entities live in); `draw*` take the camera.

## API

`GameDNA_VisionCones.create(options)` returns an instance.

| option | meaning |
|---|---|
| `params` | `range` 150 (sight distance, px at scale 1), `fov` 80 (cone width, degrees), `near` 0 (all-round sense radius as a fraction of `range`, 0 = off), `react` 900 (ms to fill the meter at mid range in the cone's middle), `closeBoost` 1.8 (fill speed right at the guard; 0.55 at the far end), `hold` 700 (ms before a suspicious meter starts to fall), `decay` 2600 (ms for a full meter to fall), `alertHold` 3200 (ms an alerted guard stays alert after losing the player, then it searches), `search` 5000 (ms the search lasts), `shadow` 0.5 (cover of a `'shadow'` spot: sight shortened to 50 %), `turnSpeed` 240 (degrees/s), `sweep` 55 (degrees each side when looking around), `lookHold` 1100 (ms between look-around turns), `speed` 40 (patrol walk, px/s at scale 1), `investigate` 0.35 (a module-driven guard walks to the last seen point above this meter), `callRadius` 170 (px at scale 1: an alerted guard calls guards this close), `opacity` 1 (cone strength 0..2), `palette` `'lamp'` \| `'cool'` \| `'mono'` \| `'skin'`, `render` `'auto'` \| `'pixel'` \| `'smooth'` (`auto` = pixel when the context has `imageSmoothingEnabled === false`), `marks` `'on'` \| `'off'`, `rays` 0 (0 = one ray per 2 degrees plus one each side of every wall corner). |
| `scale` | px per unit, about `viewHeight / 360` (0.62 for a 224 px tall pixel game, 1 for 360). Number or function. Default 1. |
| `walls` | What blocks sight, one of: `{tile, cols, rows, x, y, solidTile(c, r)}` (a tile grid, exact; out of the grid counts as wall), `{rects}` (array or function of `{x, y, w, h}` boxes, exact), `{solidAt(x, y), step}` (any point test, marched every `step` px, default 2). Pass what blocks **sight**, which can differ from what blocks walking (water and low fences usually do not). Call `invalidate()` when walls change (a door opens). |
| `player` | `() => ({x, y})`: the point guards look for, world px, at the body's middle; `null` when there is nobody to see (title, another scene, dead). |
| `canSee` | `() => boolean`: `false` while nothing can be noticed (dialogue open, cutscene, invisibility). Optional. |
| `hidden` | `(x, y) => cover` at the player's point: `0` open, `1` or `true` or `'grass'` hidden completely (tall grass, a locker), `'shadow'` (= `params.shadow`), or any 0..1 (sight distance x (1 - cover)). Optional. |
| `onState(e)` | Every state change: `{id, from, to, why, suspicion, x, y, last, t}`; states are `calm`, `suspicious` ('?'), `alert` ('!'), `search` ('?' after losing the player). |
| `onAlert(e)` | A guard became alerted: `{id, by: 'sight' \| 'call' \| 'raise', x, y, last}` (last = where it saw the player). |
| `onLost(e)` | An alerted guard lost the player and starts searching. `onCall(e)`: `{id, from, last}`, a guard was called by `from`. |
| `view` | `{x, y, w, h}` (or a function) of the screen in world px for culling; default: read from the context transform and camera. |
| `shade` | Array (or function) of `{x, y, w, h, cover}` world rects the game draws as shade (cover default `params.shadow`). Optional, drawing only: inside those rects the cone beyond the shortened reach `range x (1 - cover)` is dimmed (pixel: a sparse dither) with a reach line, so the picture shows why a player in shade inside a cone is not seen. Sight still comes from `hidden()`. |
| `overCones(ctx, camX, camY)` | Called at the end of `drawCones`. **3/4-view games** whose wall art rises above its sight tile (a wall cap drawn into the tile above) redraw those wall tops here, so cones stop cleanly at the drawn wall edge instead of being painted over the cap. |
| `avoid` | `() => [{x, y, w, h}]` world rects the '?' / '!' badges must not cover (the player, a boss bar): a badge that would is lifted above the rect. |
| `skin` | Skin id or object (needs `GameDNA_Skin`): `palette: 'skin'` takes the skin's `fx.cold` (calm) and `fx.hot` (alert). |

| method | |
|---|---|
| `add(id, spec)` | Add (or replace) a guard. `spec`: `source: () => ({x, y})` (your enemy's feet / centre, world px; `null` while dead or gone: no cone, no sight) **or** `patrol: [{x, y, wait, look}]` (the module walks it: `wait` ms at each point, `look` an angle or list of angles to turn to in turn while waiting; blocked steps count as arrived), `x, y` (start without either), `face` (start direction), `look: () => angle` (your game sets the look; otherwise the module turns it), `range`, `fov`, `speed` (per guard), `eye` (px above the point where the mark sits). Call it once per guard (when it spawns), not every frame. |
| `remove(id)` | A guard died or left. |
| `update(dtMs)` | **Once per fixed step, after your enemies moved.** `update(0)` while the world is stopped (pause, dialogue, hit-stop): nothing turns, sees or decays. |
| `drawCones(ctx, camX, camY)` | Cones on the floor: **after the ground, before the sprites**. `drawMarks(ctx, camX, camY)`: '?' / '!' **after the sprites, before the HUD**. `draw(ctx, camX, camY)` does both (cones then marks) when you have one layer. Pass `0, 0` inside your own camera translate. Never throw. |
| `facing(id)` → angle, `dir4(id)` → `'right'` \| `'down'` \| `'left'` \| `'up'`, `side(id)` → `'left'` \| `'right'` | Where the guard looks now. **Draw the guard's sprite from these** (4-way art from `dir4`, side art from `side`, frontal art can shift its eyes toward `facing`), so the sprite always faces its cone. `dir4` and `side` have hysteresis: no flicker on a diagonal. |
| `get(id)`, `list()` | `{id, x, y, look, lookDeg, fov, range, state, suspicion, seen, inCone, los, cover, dist, last, side, dir4, active, mode, moving, called}`. |
| `isAlert(id?)` (any guard when no id), `state(id)`, `seenBy()` (ids that see the player now), `sees(x, y)` (id of a guard that would see that point, cover ignored: for AI and autopilots) | Queries for your rules. |
| `raise(id, amount, at)`, `noise(x, y, radius, amount)`, `alertAll(at)`, `calm(id)` | Push suspicion from your game: a thrown pebble, a door slam, an alarm bell, a bribe. `noise` turns every guard within `radius` (px at scale 1) toward the sound; noise alone never alerts (max 0.95). |
| `clear()` | Every guard calm, meters 0, patrols back to their start (new game, restart, respawn). Guards stay. |
| `polygon(id)`, `inside(id, x, y)`, `ray(x, y, angle, max)` | The visibility polygon `{pts, edge, box}` (edge per vertex: 1 = range end, 2 = stopped by a wall), a point test, one ray. |
| `invalidate()`, `setParams(o)`, `params()`, `stats()`, `events()`, `lastDrawn()`, `hash()`, `ids()` | Walls changed; live params; counters `{updates, draws, polys, rays, alerts, calls, cbErrors, sourceErrors, wallErrors, ...}`; the last 64 events; drawn boxes; a hash for determinism tests. |

**Seen** = the player point is within `range x (1 - cover)`, inside the cone (`fov / 2` either side of the look, or within `near x range`), and a ray from the guard to it reaches it before any wall. The drawn cone is the same rays, so what the player sees is what the guard sees.

**Meter** while seen: `rate = close x centre / react` per ms, `close` from `closeBoost` at the guard to 0.55 at `range`, `centre` from 1.25 in the middle to 0.75 at the edge; at 1 the guard alerts (and calls guards within `callRadius`: they turn suspicious and look at the same spot). Out of sight: held for `hold` ms, then falls over `decay`; an alerted guard stays alert `alertHold` ms, then searches (meter falls over `search`, refills twice as fast if it sees the player again).

## Integration (15 lines)

```js
// <script src="vision-cones.js"></script> before your game script
const vision = GameDNA_VisionCones.create({ scale: VIEW_H / 360, params: { range: 150, fov: 80 }, avoid: () => [heroBox()],
  walls: { tile: TILE, cols: MAP_W, rows: MAP_H, solidTile: (c, r) => blocksSight(map[r][c]) },
  player: () => hero.alive ? { x: hero.x, y: hero.y - hero.h / 2 } : null,     // world px, body middle
  canSee: () => !dialogOpen,
  hidden: (x, y) => tileAt(x, y) === 'tallgrass' ? 1 : inShade(x, y) ? 'shadow' : 0,
  onAlert: (e) => { const en = enemyById(e.id); en.chase = true; } });         // YOUR reaction
// where each enemy spawns (once): it watches while it lives
vision.add(enemy.id, { eye: 24, source: () => enemy.alive ? { x: enemy.x, y: enemy.y } : null });
// where it dies: vision.remove(enemy.id);   new game / restart: vision.clear();
function fixedStep() { /* ...input, enemies move... */ vision.update(paused || dialogOpen ? 0 : STEP_MS); }
function render() { drawGround(); vision.drawCones(ctx, cam.x, cam.y); drawSprites(); vision.drawMarks(ctx, cam.x, cam.y); drawHud(); }
// sprites: drawEnemy(enemy, vision.dir4(enemy.id)) so each guard faces its cone
```

## Keep the rest of the game working

- **Your rules decide what an alert means.** Hook `onAlert` / `isAlert(id)` into the code that already makes an enemy chase or attack (an extra condition, or the condition that replaces "player within N px"). Keep a short close-range rule you already had (enemies that touch the player still notice), so autoplay and scripted fights still happen.
- **One space.** `player()`, `source()`, patrol points and walls are world px; `drawCones` / `drawMarks` get the camera (or `0, 0` inside a camera translate). Screen px in a scrolling game puts every cone in the wrong place.
- **Draw order.** Cones go under the sprites (they lie on the floor) and over the ground; marks go over the sprites. In a 3/4 view, redraw wall tops in `overCones`; give `avoid` the player's box so badges never hide the player; show a hidden player to its owner (an outline through the grass), never only a darker smudge.
- **The step.** `update` from the fixed step, after enemies move, `0` while the world is stopped. Never from render: `?t=<ms>&freeze=1` must show the same frame.
- **Sprites face their cone.** Wherever the guard's sprite picks its direction, use `dir4(id)` / `side(id)` / `facing(id)`; a guard drawn looking one way with its cone pointing another reads as a bug.
- **Walls for sight.** Give `walls` the tiles that block seeing; when a door or gate opens, `invalidate()`.
- Find every caller of what you touched: autoplay, `?t=` fast-forward, restart, title, pause, windows, keyboard shortcuts. Hook, don't replace: keep every function, name and caller.

## Self-check without a browser

- The module file is byte-identical to the one you were given and loads before `create`.
- `update` runs once per fixed step, in the step, `0` while stopped; `clear()` runs on new game and restart.
- `player()` returns world px of the body's middle, or `null`; each `source()` returns the enemy's world point or `null` once it is dead.
- `add` runs once per enemy (spawn / new game), `remove` where it dies; ids are unique and stable.
- Walk one example at scale 1: a guard at (0, 0) looking right (angle 0) with `range` 150 and `fov` 80 sees a player at (100, 50) (distance 112, angle 26.6 degrees, inside the 40 each side) when no wall tile lies on the segment between them, but not one at (60, 80) (angle 53 degrees), and not the one at (100, 50) while it stands in tall grass. Seen at distance 112 straight ahead, the meter fills in 900 / ((0.55 + 1.25 x (1 - 112 / 150)) x 1.25) = about 830 ms.

## What it guarantees

- `seen` is exactly the drawn cone: the same rays decide both (exact tile DDA or box test; a 0.25 px tolerance at the player point).
- A fully hidden player (cover 1) is never seen; `update(0)` changes nothing; same calls = same state (`hash()`).
- Guards turn at `turnSpeed`, so `dir4` / `side` never jump between opposite directions in one step.
- No input listeners, timers, `Math.random` or wall clock. `add`, `update`, `draw*` never throw; callbacks that throw are caught and counted (`cbErrors`, `sourceErrors`, `wallErrors`, `playerErrors`).
- Cone polygons are rebuilt only when a guard moves, turns or the walls change (and every 30 draws); pixel render rasterises each cone once per change at 1 px per world px, crisp at any integer scale.
