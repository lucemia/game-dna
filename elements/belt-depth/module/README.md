# belt-depth.js (K-04 module, v1.0.3)

One plain script, no dependencies, no `import` / `export`, ASCII only. It defines one global, `GameDNA_BeltDepth`. Load it with `<script src>` before the game script, or paste it unchanged.

It adds **beat-'em-up depth** to a side-view game. Every character gets a depth **`z`**: 0 is the back edge of the walkable floor band (exactly the game's own floor line, so nothing moves until `z` changes), `depth` is the front edge. The game keeps its own x / y physics; a jump is simply y above the floor. The module

- moves `z` (`walk` for the player's up / down, `steer` for an autopilot, `chase` for foes lining up, seeded `lane(i)` for spawns), always clamped to the band;
- answers **`inReach(a, b)`**: a hit or a touch connects only when `|za - zb| <= tolerance`;
- draws every character through **`render()`**: contact shadows first, on the floor under the feet (at floor + z, narrower and lighter the higher the character is, none over a pit), then the characters **sorted by their floor contact line** (floor + z, never the airborne y), each shifted down by its `z`;
- draws the **floor band** (the walkable top face, `depth` px deep, several palettes) on the game's floor runs, read from a tile grid with `gridFloors`;
- keeps the player's band **in view** for a vertically scrolling camera (`frameY`).

Nothing depends on wall time or `Math.random`; `render()` never changes game state, so `?t=&freeze=1` stills match play.

## API

`GameDNA_BeltDepth.create(options)` returns an instance. Every option below may also be passed inside `options.params`.

| option | default | meaning |
|---|---|---|
| `depth` | 24 | band depth in world px (z range 0..depth). Keep it below the thinnest platform you can stand on |
| `tolerance` | 6 | `inReach` when `abs(dz) <= tolerance` |
| `laneSpeed`, `chaseSpeed` | 1.2, 0.6 | z px per step for `walk` / `chase` |
| `chaseRange` | 160 | `chase` only within this x distance (0 = always) |
| `feet(a)` | `{x: a.x + a.w/2, y: a.y + a.h}` (or `{x: a.x, y: a.y}` without w / h) | world feet point of a character |
| `floorAt(x, y)` | from `setFloors` | top of the floor at or below y, `null` over a pit (only if you do not use `setFloors`) |
| `toScreen(x, y)` | identity | world px -> the units your ctx draws in at render time. Leave it out when you draw inside a camera `translate`; pass `(x, y) => ({x: x - camX, y: y + offsetY})` when your draw code subtracts the camera by hand |
| `camera()` | none | `{x, y}` top-left of the view in world px (used for culling and the band-in-view counter) |
| `player()` | none | the player's object (for `frameY` and stats) |
| `view` | none | `{w, h}` of the canvas in view units |
| `floor` | `'meadow'` | band palette: `meadow`, `earth`, `stone`, `cobble`, `planks` or `{back, front, lip, speck: [..], edge}` |
| `floorKinds` | none | per floor-run kind (the value `gridFloors` got from `solid`) a palette, e.g. `{'#': 'meadow', '=': 'stone'}` |
| `render` | `'auto'` | `pixel` (whole-pixel shadows and texture) / `smooth`; auto = pixel when `view.h <= 270` |
| `shadowScale`, `shadowAlpha`, `shadowFade` | 0.9, 0.45, 64 | shadow width = character width x scale; alpha; lift (px) at which the shadow is smallest |
| `cue` | `'off'` | `'on'`: render items with `reach: {x0, x1}` (world x) get the striker's lane drawn on the floor |
| `headroom`, `bandMargin` | 72, 6 | `frameY` keeps this much above the floor and below the front edge in view |
| `lanes`, `seed` | 3, 1 | `lane(i)` picks one of `lanes` seeded depths |
| `zoom` | 1 | view units per world px, only if your draw code scales the world |

| method | |
|---|---|
| `place(a, z)` | set `a.z` (clamped; default the middle of the band). Call when a character is created / respawns |
| `lane(i)` | a seeded depth for spawn number `i` |
| `walk(a, dir, speed?)` | once per fixed step for the player: `dir` = (down ? 1 : 0) - (up ? 1 : 0). Returns the z change |
| `steer(a, targetOrZ)` | -1 / 0 / 1: which way an autopilot should press to reach that lane |
| `chase(a, target, speed?, range?)` | move a foe's z toward the target's lane (once per step) |
| `inReach(a, b, tol?)` | **add to every hit and touch test** (sword box, contact damage, projectiles) |
| `setFloors(runs)` / `gridFloors({cols, rows, tile, solid(c, r), x0, y0})` | floor runs `[{x0, x1, y, kind}]` in world px; `gridFloors` finds the open-top runs of a tile grid (`solid` returns false or a kind) |
| `drawFloor(ctx)` | the band on every run, right after the level tiles, before props and characters |
| `render(ctx, items)` | `items = [{a, draw(ctx), shadow?: px or false, reach?: {x0, x1}}]`: shadows, then each `draw` in depth order with `ctx` already shifted down by `z`. Your draw functions stay as they are. Returns what was drawn |
| `frameY(camY, viewH, levelH?)` | the camera y adjusted so the player's band is in view |
| `update()` | once per fixed step (counts steps for stats and the reach log) |
| `z(a)`, `lift(a)`, `floorUnder(a)`, `sortKey(a)`, `floorAt(x, y)` | queries |
| `stats()`, `lastDrawn()`, `lastOrder()`, `reachLog()`, `params()`, `setParams(p)`, `reset()` | counters (`renders, shadows, noFloor, sinking, orderBad, reachChecks, reachTrue, reachFalse, maxDzTrue, walks, chases, bandOut, drawErrors, cbErrors`), the last frame (`[{id, x, y, z, key, lift, shadow, shadowAt}]`), live params |

`GameDNA_BeltDepth.version`, `.defaults`, `.palettes`.

## Integration (15 lines)

```js
// <script src="belt-depth.js"></script> before the game script
const belt = GameDNA_BeltDepth.create({ depth: 16, tolerance: 6, view: { w: VIEW_W, h: VIEW_H },
  floorKinds: { 1: 'meadow', 2: 'stone' }, camera: () => cam, player: () => hero });
belt.setFloors(belt.gridFloors({ cols: COLS, rows: ROWS, tile: TILE, solid: (c, r) => tiles[r][c] || false }));
// spawn: hero.z = 8; enemies.forEach((e, i) => belt.place(e, belt.lane(i)));
// fixed step: belt.update();
//   player: belt.walk(hero, (inp.down ? 1 : 0) - (inp.up ? 1 : 0));
//   autopilot: const s = belt.steer(hero, nearestFoe); inp.up = s < 0; inp.down = s > 0;
//   foes: belt.chase(e, hero);
//   hits: if (overlap(swordBox, e) && belt.inReach(hero, e)) hurt(e);  if (overlap(hero, e) && belt.inReach(hero, e)) hurtHero();
// draw (inside the camera translate): drawTiles(); belt.drawFloor(ctx);
//   belt.render(ctx, enemies.map(e => ({ a: e, draw: () => drawEnemy(e) })).concat([{ a: hero, draw: drawHero }]));
// camera: cam.y = belt.frameY(cam.y, VIEW_H, LEVEL_H);   // only if the camera moves vertically
```

## Self-check without a browser

- Every caller of the step still works: `?auto=1` (the autopilot steers into its target's lane), `?t=&freeze=1` (no state set in draw), restart and respawn (`place` again).
- Every damage path calls `inReach`: sword, contact, projectiles, specials. Pickups, doors and triggers ignore depth.
- Every character that stands on the floor is drawn through `render()` (none drawn a second time outside it).
- Up / down reach `walk` (add them to the input if the game never read them; if up was a jump key and another jump key exists, move jumping off up and update the help text).
- Worked example: tolerance 6, hero z 4, foe z 12: dz 8 > 6, the swing misses; after 3 steps of down at 1.2 px the hero is at 7.6, dz 4.4, it lands.
