# GameDNA_ThirdPerson3D (N-01 third-person-3d) v1.0.0

One plain script, one global `GameDNA_ThirdPerson3D`, ASCII only, no imports. Needs three.js **0.149.0** (classic build,
`window.THREE`, MIT): copy `three.min.js` next to your page and load it with `<script src="three.min.js">` before this
file. Never load another three.js version or a CDN. Works from `file://` and http.

It owns: WebGL renderer, scene, sky, fog, island ground (code-drawn texture), props with colliders, procedural low-poly
adventurers (auto-scaled by bounding box, feet on y = 0 in every pose), idle / walk / run animation driven by the distance
travelled (feet do not slide), camera-relative movement, the follow camera (lag, auto-align, never inside a prop,
dither-fade of anything between camera and hero), pickups, world -> screen anchors, an A* autopilot, and text state for checks.
Your game owns: rules, quests, dialogue, HUD (on your own 2D canvas over the WebGL one), input devices, the main loop.

## Integration (15 lines)

```js
const tp = GameDNA_ThirdPerson3D.create({ canvas: glCanvas, overlay: uiCanvas, seed: 7, params: { palette: 'meadow' },
  onEvent: ev => { if (ev.type === 'pickup') score += ev.value; } });
if (!tp.ok) { /* tp already drew a "needs WebGL" message on the canvas; stop here */ }
tp.buildIsland({ radius: 20 });                                   // ground, cliffs, water, sky, clouds
tp.paint.path([[0, 18], [0, 4]], 1.5); tp.paint.plaza(0, 0, 1.5, 5); tp.paint.done();
tp.buildLayout([{ kind: 'tree', x: 6, z: -3 }, { kind: 'pillar', x: -4, z: 2 }, { kind: 'rock', x: 3, z: 8, s: 1.2 }]);
tp.scatter({ count: 800, flowers: 150 });                         // grass tufts and flowers, avoiding props
tp.addActor({ id: 'hero', kind: 'hero', x: 0, z: 14, yaw: Math.PI }); tp.setHero('hero'); tp.snapCamera(0);
tp.addActor({ id: 'sage', kind: 'npc', x: 2, z: -6, look: { base: 'keeper' } }).target = 'hero';
tp.addPickup({ id: 'gem-1', x: 8, z: 1 });
tp.resize(cssWidth, cssHeight);                                   // on load and on window resize
// fixed 60 Hz step: camera-relative stick (y = forward), run flag, optional camera turn
function step() { tp.step({ x: right - left, y: up - down, run: !shift, camYaw: qe * 1.8 / 60 }, 1 / 60); }
function frame() { tp.render(); /* then draw your HUD on the 2D canvas, using tp.anchor(id) for labels */ }
```

## API

`GameDNA_ThirdPerson3D`: `FACING_OFFSET` (0: the built-in models face +Z), `DEFAULTS`, `PALETTES`, `LOOKS`,
`create(options)`, `supportsWebGL()`, `buildAdventurer(THREE, mats, look)`, `poseAdventurer(parts, state)`.

`create({THREE?, canvas, overlay?, params?, seed?, onEvent?})` returns an instance `tp`:

| member | what |
|---|---|
| `ok` | false when WebGL / three.js / canvas is missing: then every method is a safe no-op and `drawFallback()` repaints the message |
| `params` | live parameters (`walkSpeed runSpeed accel turnRate heroHeight camDist camPitch camLag autoAlign fov gear palette shadows maxDpr`); numbers can be changed at run time |
| `scene`, `camera`, `renderer`, `THREE`, `sun`, `hemi` | the three.js objects (add your own meshes to `scene`) |
| `buildIsland({radius, seed, texSize})` | island + `paint.path(points, width)`, `paint.plaza(x, z, rIn, rOut)`, `paint.flowers(x, z, r, colours, n)`, `paint.blob(...)`, then `paint.done()` |
| `addProp({kind, x, z, rot, s, ...})`, `buildLayout(list)` | kinds `tree (pine) rock pillar (broken) arch (span) wall (len, h) fountain lantern crate (size) barrel bush (berries) stall (cloth) beacon`; adds colliders (movement and camera) |
| `addCollider({x, z, r} or {ax, az, bx, bz, r}, y0, y1, solid, cam})` | your own blockers |
| `scatter({count, flowers, seed, avoid(x, z)})` | instanced grass and flowers |
| `addActor({id, kind, x, z, yaw, height, look, obj, radius, stateExtra})` | builds an adventurer (`look.base`: `hero`, `keeper`, `villager`, plus colour overrides; `look.gear`: `both cape satchel none`) or wraps your `obj` (nose along +Z); auto-scaled to `height` by bounding box, feet at y = 0. Returns the actor |
| actor fields | `x z yaw vx vz speed height target moveDir travelDir feetY root model parts`; `play('wave' \| 'cheer' \| 'bow' \| null)`; `target = id \| {x, z}` turns a standing actor to it; `external = true` (you move it), `ghost = true` (no bumping) |
| `actor(id)`, `actors()`, `removeActor(id)`, `setHero(id)`, `hero` | |
| `walkTo(id, x, z, speed)` | NPC walks there (faces its move direction) |
| `addPickup({id, x, z, kind, value, color, radius})`, `pickups()` | floating crystal; the hero within `radius` collects it: `onEvent({type: 'pickup', id, kind, value, x, z})` and a burst |
| `burst(x, y, z, color, n)` | sparkle burst |
| `step(input, dt)` | one fixed step: hero movement (body turns at `turnRate`, speed builds along the facing), NPCs, pickups, effects, camera, `onStep` hooks |
| `onStep(fn(dt, tp))`, `animate(fn(dt, time))` | per-step callbacks |
| `render()` | draws the frame (the shadow camera follows the hero) |
| `resize(cssW, cssH)`, `size()` | canvas size in CSS px (pixel ratio capped at `maxDpr`; portrait screens get a wider vertical FOV) |
| `project(x, y, z)` | `{x, y, depth, visible}` in CSS px |
| `anchor(id)` | actor or pickup: `{x, y (top), footX, footY, cx, cy, h, depth, visible, world}` in CSS px |
| `rotateCamera(dYaw, dPitch)`, `snapCamera(yaw)`, `probeCamera(yaw, pitch)`, `cam` (`yaw pitch dist lift distMul`), `camInfo()` | camera control; `cam.lift` raises the look-at point, `cam.distMul` scales the distance (cutscene framing) |
| `autopilot({x, z}, {near, run})` | camera-relative input `{x, y, run, arrived}` along an A* path around props |
| `findPath(x0, z0, x1, z1)`, `blockedAt(x, z, r)`, `resolve(p, r)` | path and collision helpers |
| `state()` | `{t, webgl, camera, actors: [{id, kind, x, z, yaw, moveDir, travelDir, forward, target, moving, speed, facesMove, moveAngleDeg, facesTarget, targetAngleDeg, feetY, pose, height}]}`; `forward` is `model.getWorldDirection()` |
| `feetProbe()` | every adventurer x idle / walk / run / wave / cheer x 16 phases: `{maxAbs, n}` (must be < 0.01) |
| `stats()` | `{renderMsMedian, calls, triangles, dpr, size}` |

## Rules this module keeps (and your additions must keep)

- **Facing:** `yaw = Math.atan2(v.x, v.z) + FACING_OFFSET` for a move or look vector `v`. A model whose nose is not +Z gets
  its own constant offset, never a per-scene tweak. `facesMove` in `state()` comes from the model's world forward vector.
- **Feet on the ground:** models are scaled by their bounding box and re-grounded after every pose (lowest vertex -> y = 0).
- **No sliding feet:** the gait phase advances by distance / stride (stride = 4 x leg length x sin(swing)); the stance
  foot moves back linearly while the body moves forward.
- **Deterministic:** no `Math.random`, no wall-clock reads in `step()`; the same inputs give the same frames
  (`?t=&freeze=1` screenshots).
