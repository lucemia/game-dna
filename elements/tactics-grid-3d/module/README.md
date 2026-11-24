# tactics-grid-3d.js (N-03 module, v1.0.0)

One plain classic script, ASCII only, no `import`/`export`. It defines one global, `GameDNA_TacticsGrid3D`. Load `three.min.js` (three.js **0.149.0**, the file next to the page; never a CDN) first, then this file, unchanged. It owns the 3D battlefield of a grid tactics game:

- **terrain**: terraced tiles from height rows (0.5 world units per level, 1 x 1 tiles), code-drawn textures (grass, flagstone, sand, dirt cliffs with a grass lip, masonry), animated water with foam edges, faint tile seams, corner shading, grass tufts and pebbles, trees, pines, rocks, ruined columns, sky gradient, fog, drifting clouds, one shadow-casting sun;
- **rules**: `reachOf` (Dijkstra over move points; a step costs the terrain cost + `climbCost` per level climbed; climbing more than `jump` or dropping more than `jump + fall` levels is impossible; water and props block; enemies block, allies can be passed), `pathTo`, `attackTiles` / `canHit` (Manhattan range; melee only within `meleeH` levels), `threatOf` (every tile a group can strike after moving);
- **overlays**: move (blue), attack (red), threat (orange, moving stripes), target (gold), a path tube with an arrow head that climbs the terraces, a bracket cursor with a floating gem;
- **units**: low-poly figures built from primitives (`knight`, `lancer`, `archer`, `brute`, `shaman`; team colours by `side` 'a' / 'b'), auto-scaled by bounding box with the feet on the tile top, a team ring; **animations** driven only by `update(dt)`: walk tile by tile (legs, arms, cape), hop up and down terraces, melee lunge with the impact on a fixed frame, cast (glowing bolt) and arrow projectiles, hurt flash + knock-back, defeat (kneel, crumple backwards inside the own tile, sink and fade), acted dimming, selection ring; a walker passing through an ally's tile and that ally both step 0.3 tile aside, so bodies never overlap;
- **visibility**: props between the camera and a unit, the cursor or a projectile fade to 30 %; units hidden behind terrain or props show a team-coloured x-ray silhouette;
- **camera**: orthographic, 45 deg + 90 deg steps with an eased turn, zoom, follow, shake; arrow keys map to grid steps by screen direction;
- **picking and anchors**: screen px -> tile (units first), world -> screen boxes for HUD, numbers and addons;
- **text state** with facing measured on the model's actual forward vector.

The game keeps turns, stats, damage, AI, HUD and input. The module never changes a game unit; it only reads `{id, side, x, z, mv, jump, rng}` in the rules calls.

## Facing and feet (do not hand-tune)

- Built-in figures are modelled with their nose on local +X, recorded once as `FACING_OFFSET = -PI/2`. Yaw for a move or aim vector `v` is `Math.atan2(v.x, v.z) + facingOffset`, set by `walk` (each step), `attack` (toward the target) and `face`. A custom look passes its own `facingOffset`.
- Every model is scaled by its `Box3` (precise, weapons and capes excluded) to `unitHeight` tiles and shifted so `min.y = 0`; every frame the boots (or the whole body once fallen) are snapped to the tile top, so `|feetY - tileTop| < 0.01` in every pose. Only the middle of a hop is airborne.
- `state()` reads the forward from `getWorldDirection` of a `nose` marker inside the model (an art fact, not the yaw variable): `facesMove` / `facesTarget` are true within 15 deg.

## `GameDNA_TacticsGrid3D.create(options)`

| option | meaning |
|---|---|
| `canvas` | the WebGL `<canvas>`. Without WebGL the instance still works (rules, actors, anchors) and draws a readable 2D map on `overlay` with a message; it never throws |
| `overlay` | a 2D `<canvas>` stacked on top (HUD, numbers, addons). `overlayContext()` clears it and returns its context scaled to logical view px |
| `view` | logical size `{w, h}` of both canvases (default 960 x 540); anchors and picking use these px |
| `map` | `{heights: [rows], terrain: [rows], props: [rows]}`, one char per tile, row = z, char = x. Heights `0`-`9`; terrain `g` grass, `s` stone, `d` sand (cost 2), `w` water (impassable); props `T` tree, `P` pine, `r` rock, `R` ruin (all block), `.` none |
| `units()` | the living units for occupancy (`{id, side, x, z}`); or pass a list to each rules call |
| `params` | see below |
| `seed` | texture and prop variation (deterministic) |
| `onStep(ev)` | every walk step: `{id, from, to, step, steps, hop, dh, dir}` |
| `THREE` | optional, else `window.THREE` |

**params**: `zoom` 2 (0.6-2.2), `camStep` 0-3, `pitch` 33, `light` day / dusk, `overlay` pulse / solid / outline, `grid` 0.22 (seam opacity), `shadows` soft / off, `unitHeight` 0.95 tiles, `jump` 2 (default per unit), `fall` 1 (extra drop allowed), `climbCost` 1, `meleeH` 3, `walkMs` 250, `turnMs` 380, `decor` on / off, `quality` high / low (shadow map size), `xray` on / off, `frameScale` 1 (multiplies the visible world height; the starter uses about 1.6-1.7 in portrait).

## Methods

| member | meaning |
|---|---|
| `update(dtMs)` | once per fixed step, `0` while your world is frozen; drives every animation, the camera and the water. Deterministic |
| `render()` | draw the 3D view (or the 2D fallback) |
| `resize(cssW, cssH, dpr)` | size both canvases; call on load and on window resize |
| `setView(w, h)` | change the logical view (e.g. 540 x 1170 in portrait); anchors and picking follow |
| `overlayContext()` | cleared overlay context in logical px; draw HUD after `render()` |
| `addActor({id, side, cls, x, z, face?, colors?, height?})`, `removeActor(id)`, `clearActors()`, `actor(id)`, `actorIds()` | units; `face` = a direction `[dx, dz]`, a tile `{x, z}` or an actor id |
| `setTile(id, x, z)` | teleport (undo a move) |
| `walk(id, path, {onStep, onDone})` | `path` from `pathTo` (`[{x, z}]`, start included). Faces each step; hops terraces |
| `attack(id, targetId, {kind, onImpact, onDone})` | `kind` 'melee' (default), 'bolt', 'arrow' (shaman / archer default to theirs). Faces the target; `onImpact` on the hit frame (apply your damage there) |
| `hurt(id, fromId)`, `defeat(id, {onDone})`, `revive(id)` | flinch away from the attacker; fall and fade |
| `face(id, dirOrTarget, smooth)`, `setDim(id, on)`, `setSelected(id)` | facing (smooth = idle turn), acted tint, selection ring |
| `busy()` | any blocking animation (walk, attack, cast, defeat) or projectile still running; wait for it before the next action |
| `reachOf(unit, units?, from?)` | `{cost, prev, stops: [{x, z, cost}], from}`; `pathTo(reach, x, z)` -> `[{x, z}]` or null |
| `stepCost(ax, az, bx, bz, unit)`, `passable(x, z)`, `tile(x, z)` | `tile` -> `{h, t, name, cost, prop, top, passable}` |
| `attackTiles(unit, x, z)`, `canHit(unit, fx, fz, tx, tz)`, `threatOf(units, all?)`, `rangeOf(unit)` | ranges |
| `setOverlay(kind, tiles)` | `kind` 'move' / 'attack' / 'threat' / 'target'; `null` clears. `clearOverlays()`, `overlayTiles(kind)` |
| `setPath(path)`, `setCursor(x, z)` / `setCursor(null)`, `cursor()` | arrow and cursor |
| `camForward()` | the camera's look direction on the ground `[x, z]` (who is nearer the camera) |
| `rotate(+1 / -1)`, `setCamStep(k)`, `camStep()`, `zoomBy(f)`, `setZoom(z)`, `focus(x, z, instant)`, `shake(px, ms)` | camera |
| `gridDirFromScreen(dx, dy)` | screen direction (+y down) -> `[gx, gz]` for the current camera turn |
| `anchorOf(id)` | `{x, top, w, h, left, footY, cy, dead}` overlay px; follows walks, hops and lunges |
| `pickTile(px, py)` | `{x, z, unit?}` or null; `tileToScreen(x, z)`, `project(x, y, z)`, `worldOf(x, z)` |
| `state()` | `{t, camStep, actors: [{id, side, cls, tile, x, z, yaw, anim, moveDir, target, forward, moveAngle, targetAngle, facesMove, facesTarget, airborne, feetY, tileTop, feetOk, noFace}]}` |
| `setParams(obj)`, `rebuildMap(map)`, `registerLook(name, {build(THREE, team), facingOffset})`, `setModel(id, object3d, {facingOffset, height, noseYaw})`, `burst(x, z, color, n)` | live parameters; custom looks (e.g. billboards) |
| `scene`, `camera`, `renderer`, `gl`, `error` | for addons that add 3D objects |

## Integration (15 lines)

```js
// <script src="three.min.js"></script><script src="tactics-grid-3d.js"></script> before your game script
const tg = GameDNA_TacticsGrid3D.create({ canvas: glCanvas, overlay: hudCanvas, view: { w: 960, h: 540 }, map: MAP,
  units: () => units.filter(u => u.hp > 0), params: { zoom: 2 } });
units.forEach(u => tg.addActor({ id: u.id, side: u.side, cls: u.cls, x: u.x, z: u.z }));
function onSelect(u) { const r = tg.reachOf(u); tg.setOverlay('move', r.stops); return r; }       // your selection state
function onHover(r, x, z) { tg.setPath(tg.pathTo(r, x, z)); tg.setCursor(x, z); }
function onConfirm(u, r, x, z) { tg.walk(u.id, tg.pathTo(r, x, z), { onDone: () => { u.x = x; u.z = z; openMenu(u); } }); }
function onAttack(a, d) { tg.attack(a.id, d.id, { onImpact: () => yourHitFunction(a, d), onDone: nextAction }); }
// in yourHitFunction: tg.hurt(d.id, a.id) or tg.defeat(d.id) after changing HP
function step(dt) { /* your logic */ tg.update(frozen ? 0 : dt); }
function frame() { tg.render(); const g = tg.overlayContext(); drawHpBars(g, tg.anchorOf); drawHud(g); }
addEventListener('resize', () => tg.resize(stage.clientWidth, stage.clientHeight, devicePixelRatio));
canvas.onclick = e => { const t = tg.pickTile(px(e), py(e)); if (t) onTileClick(t.x, t.z); };
```

## Guarantees and limits

- Deterministic: animation, camera, water and sparks depend only on `update` calls (no `Math.random`, no wall clock). Same seed, same calls, same pixels.
- Never throws from `update`, `render` or callbacks (one console warning each).
- Performance: `../checks/perf.json` (headless Chromium with SwiftShader, software WebGL, logic + render + GPU flush per frame). 2026-11-18 under machine load 19-42 (other builds running; the < 5 bar could not be met): median 193 ms at 1280x720 dpr 2 and 146 ms at 390x844 dpr 3; logic alone is about 0.1 ms. About 96 draw calls; the x-ray passes only run while a living unit stands behind terrain. A real GPU renders this scene in a few ms; the numbers only compare versions on the same machine. `shadows: 'off'`, `quality: 'low'` and `xray: 'off'` are the levers.
- One sun, orthographic camera; very large maps (> 24 x 24) are not tuned.
