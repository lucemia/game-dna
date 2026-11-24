# GameDNA_KartRacer3D (N-05 kart-racer-3d) v1.2.0

An arcade kart race for three.js 0.149.0 (classic build). One global, ASCII only, no other dependencies, works from
`file://` and http. Load `three.min.js` (0.149.0) first, then this file.

The module owns the 3D race: renderer, sky, ground, a track built from a closed list of points (road, kerbs, barriers,
ramps, boost pads, start gantry with countdown lamps, scenery), karts with drivers, kart physics, checkpoint gates and
laps, AI drivers, countdown, race clock, places, chase camera, particles, a 2D race HUD helper and a text state.
Your game owns menus, cups / points, title and result screens, input devices and the main loop.

## Quick start

```html
<canvas id="gl"></canvas><canvas id="ui"></canvas>
<script src="three.min.js"></script>
<script src="kart-racer-3d.js"></script>
<script>
var KR = GameDNA_KartRacer3D.create({ canvas: document.getElementById('gl'), params: { laps: 3 }, onEvent: function (ev) { /* lap, finish ... */ } });
if (!KR.ok) KR.drawFallback();                     // no WebGL: a readable message, never a throw
KR.resize(innerWidth, innerHeight);
KR.startRace({ track: 'meadow', karts: [{ id: 'player', kart: 'rook', player: true }, { kart: 'wren' }, { kart: 'juno' }], seed: 7 });
KR.countdown();                                    // 3-2-1-GO, then the race runs
// fixed 60 Hz step (also for fast-forward), then draw:
KR.step({ steer: right - left, throttle: gas, brake: brk, drift: driftHeld }, 1 / 60);
KR.render(); KR.drawHud(ctx2d, cssW, cssH, { touch: false });   // ctx2d already scaled to CSS px
</script>
```

## create(options) -> race

| option | |
|---|---|
| `canvas` | the WebGL canvas (required); size it with `race.resize(cssW, cssH)` |
| `THREE` | defaults to `window.THREE` |
| `params` | see below; unknown keys are ignored, empty / null values keep the default |
| `onEvent(ev)` | every race event (also `race.on(fn)` for more listeners) |
| `preserve` | `preserveDrawingBuffer` (screenshots / pixel checks) |

`race.ok` is false when three.js or WebGL is missing (`race.reason` says why); every method is then a safe no-op and
`race.drawFallback()` paints a message on the canvas.

### params (defaults)

| key | default | meaning |
|---|---|---|
| `laps` | 3 | laps per race (a track's `laps` or `startRace({laps})` win) |
| `maxSpeed` | 25 m/s | top speed on the road (x kart `speed` stat) |
| `accel` | 15 | m/s^2 at rest, fading toward top speed |
| `grip` | 14 | 1/s: how fast sideways speed dies (keeps the velocity on the nose) |
| `driftGrip` | 4.2 | 1/s while drifting (the slide) |
| `turnRate` | 2.25 | rad/s at low speed; falls to about 0.66 x at top speed |
| `driftTurn` | 2.1 | rad/s while drifting; steering into / out of the turn tightens / widens it (0.17 - 1.07 x) |
| `driftHop` | 3.2 | m/s up when a drift starts (the hop) |
| `boostPower` | 1.32 | top-speed multiplier while boosting; `boostAccel` 34 m/s^2 |
| `offroad` | 0.55 | top-speed multiplier on grass (a boost ignores it) |
| `rubberBand` | 0.1 | AI top speed +-10 % at 110 m behind / ahead of the player |
| `aiSkill` | 0.95 | AI speed factor (each AI gets 0.97-1.02 of it, seeded) |
| `gravity` | 30 | m/s^2 (arcade jumps) |
| `camDist` / `camHeight` / `camLag` / `fov` | 6.4 / 2.5 / 0.1 / 64 | chase camera; portrait screens pull back and widen the view |
| `shadows` | `soft` | `soft`, `hard`, `off` |
| `maxDpr` | 2 | pixel-ratio cap |
| `kartLength` | 2.0 m | karts are auto-scaled by bounding box to this length |
| `palette` | (the track's) | `meadow`, `canyon`, `twilight` or a palette object (see `GameDNA_KartRacer3D.PALETTES`) |

## Races

- `race.startRace({track, karts, laps, seed, playerSlot})`: builds the track and the grid. `track` = an id of
  `GameDNA_KartRacer3D.TRACKS` (`meadow`, `canyon`, `plaza` = open test square) or a track object. `karts` = list of
  `{id, kart: 'rook' | def: {...}, name, player: true | false, ai: true | false}`; the player starts in grid slot 4
  (`playerSlot` to change). Phase becomes `grid` (nothing moves).
- `race.countdown()`: phase `countdown` (3 s, events `countdown {n: 3 | 2 | 1}`, lamps light), then `race` (event `go`).
  A player holding the throttle in the last 0.6 s (not before 2.2 s) gets a rocket start; half the AI do (seeded).
- `race.step(input, dt)`: one fixed step; `input = {steer: -1..1 (right +), throttle 0..1, brake 0..1, drift: bool}`
  for the player kart. AI karts drive themselves. Other non-AI karts read `race.setInput(id, input)`.
- `race.setAI(id, on)`: hand a kart to the AI driver (autoplay). `race.autoInput(id)` returns what the AI would press.
- Phases (`race.race.phase`): `grid`, `countdown`, `race`, `finished` (the player crossed the line; the others keep
  racing), `free` (no laps; tests). `race.setPhase('free')` for a free-roam scene.
- `race.karts()`: kart objects `{id, name, def, x, y, z, h (heading), vx, vz, speed, lap, next (gate), place, lapTimes,
  bestLap, finished, finishMs, drift (-1 | 0 | 1), driftCharge, boostT, air, offroad, wrongWay, player, ai, mdl}`.
  Read them; change karts only through input.
- `race.results()`: `[{id, name, place, ms, est, bestLap, finished, color, player}]` sorted by time; karts still racing
  get an estimated time (`est: true`).

### Laps and checkpoints

The track has `checkpoints` gates (default 8) evenly spaced; gate 0 is the start / finish line. A kart counts a gate
only when it crosses the gate it expects next, moving forward. Crossing the last passed gate backwards undoes it (so
backing over the line and crossing again never double-counts). Skipping a gate (a shortcut) gives `gateSkip` and no
progress, so no lap. Lap 1 starts at the first crossing of the line after GO; the race ends for a kart when it crosses
the line after the last lap (`finish`).

### Events

`{type, t, raceMs, ...}`: `raceSetup`, `countdown {n}`, `go`, `checkpoint {kart, gate, lap}`, `lap {kart, lap, of,
lapMs, final}`, `finish {kart, place, ms, bestLap}`, `raceEnd {place, ms}` (player), `allFinished`, `boost {kart,
level 1-3, source: drift | pad | start}`, `driftStart {kart, dir}`, `driftEnd {kart, level, charge}`, `jump {kart, vy}`,
`land {kart, airMs}`, `bump {a, b, speed}`, `wall {kart, speed}`, `wrongWay {kart}`, `respawn {kart}`, `gateSkip`,
`gateBack`.

### Drift and boost

Press drift while steering at more than 10 m/s: the kart hops and slides into the turn. Steering into the turn tightens
the slide, steering out widens it. The charge grows with time on the ground (faster when tight): 0.55 s = level 1
(blue sparks), 1.25 s = level 2 (orange), 2.1 s = level 3 (pink). Releasing gives a boost of 0.75 / 1.25 / 1.85 s.
Drifting into a wall, off the road or below 7 m/s ends the drift. Boost pads give 1.3 s.

## Tracks

```js
{ id: 'frost', name: 'Frost Pass', palette: 'twilight' /* or a palette object */, width: 13, laps: 3, checkpoints: 8,
  points: [[0, -40], [0, 20], ...],            // a closed loop, metres (x, z), driven in this order; start line at point 0
  ramps: [{ at: 0.3, len: 8, h: 1.2 }],        // at = fraction of the lap; h / len <= 0.18
  pads: [{ at: 0.5, lat: 0 }],                 // boost pads; lat = metres left (+) / right (-) of the centre line
  scenery: { seed: 4, trees: 120, rocks: 20, flowers: 50, clouds: 8, lake: [x, z, r], mesas: false, cactus: false } }
```

`GameDNA_KartRacer3D.checkTrack(def)` returns `[]` for a good track or a list of problems: too short (< 150 m), a corner
tighter than 9 m radius, two parts of the road closer than width + barriers (they would overlap), ramps too steep.
The road is a centripetal Catmull-Rom spline through the points; grass runoff (4.6 m) and a barrier line both sides. On
the inside of a tight bend every edge (kerb, runoff, barrier, the physics wall) is pulled in to 0.88 x the local radius
(`sampleTrack(def).off(lat)`), so no ground strip or barrier folds over itself.

## Karts

```js
{ name: 'Mossback', body: 0x4a8a3a, accent: 0xe8d8a0, suit: 0x3a2a20, helmet: 0xe8d8a0, stripe: 0x4a8a3a, number: 7,
  speed: 1.0, accel: 1.0, grip: 1.0 }        // stats are multipliers, keep them within 0.9 - 1.1
```

Built-ins: `GameDNA_KartRacer3D.KARTS` (`rook`, `wren`, `juno`, `bram`, `tilly`, `odo`). The model (chassis, pods,
bumpers, number plate, engine, exhausts, wing, driver with helmet, visor and scarf, four wheels) is procedural.

## Facing and feet (BUILD-3D rules)

- Every kart model is built nose along +Z: `FACING_OFFSET = 0`; `root.rotation.y = Math.atan2(dir.x, dir.z) + FACING_OFFSET`
  with dir = the heading. Grip keeps the velocity close to the nose (slip median 0.6 deg, a few degrees in hard turns; a drift slides 10-25 deg nose-into-turn); `state()` reports `forward`
  from `model.getWorldDirection()` and `facesMove`: true when the angle to the velocity is <= 15 deg, or <= 40 deg
  while drifting with the nose INTO the turn (the slide), or <= 25 deg in the air; `null` when slower than 2 m/s or
  reversing. `recover: true` marks the 0.3 s after a wall or kart bump (a knock may swing the nose briefly).
- Auto-scale: the model's `Box3` is scaled to `kartLength` and lifted so its lowest point (a tyre) is at y = 0. On the
  ground the module solves pitch, roll and height so every tyre's lowest point sits on the ground under its centre
  (ramps included), and each wheel takes up its own residual (up to 6 cm of suspension, e.g. across a ramp's entry kink); `state().actors[].feetY` = the worst tyre gap (null in the air). Launches happen when the front
  axle passes a ramp lip.

## Camera, anchors, HUD

- `race.setCamera('chase' | 'grid' | 'orbit' | 'top' | 'fixed', {target: id})`, `race.snapCamera()`. `race.podium(ids, {side, lift})`: the first
  three karts stand on the start straight facing a podium camera (others hidden, phase `podium`); `side` (m, negative =
  karts further left on screen) and `lift` (karts higher on screen) keep them clear of a results panel.
- After crossing the line a kart pulls over to one side and brakes to a stop (never reverses); later finishers pass it. The camera is stepped in
  `step()` (so `?t=&freeze=1` stills match live play) and applied in `render()`.
- `race.anchor(id)` -> `{x, y (top), footX, footY, cx, cy, w, h, depth, visible, world}` in CSS px; `race.project(x, y, z)`.
- `race.drawHud(ctx, w, h, {touch, minimap, speedo, top})`: place (top left), lap pill, clock and lap splits (top
  right), minimap, speed (bottom right, keyboard screens), drift-charge meter (bottom centre), countdown, GO, LAP n /
  FINAL LAP, FINISH and WRONG WAY. Returns (and `race.hudRects()` keeps) the rects it drew. Under 560 px wide it uses a
  compact layout (phone).
- `race.drawMinimap(ctx, x, y, size)`, `race.fmtTime(ms)`, `race.ordinal(n)`.

## State and tests

- `race.state()`: `{t, phase, raceMs, laps, track, camera, actors: [{id, x, y, z, yaw, moveDir, forward, speed, moving,
  slipDeg, facesMove, target ('gate<n>'), drifting, driftDir, driftLevel, boost, airborne, feetY, lap, next, place,
  finished, reversing, recover, offroad, wrongWay}]}`.
- `race.feetProbe()`: every kart in 72 poses (steer, drift, wheel spin) -> `{maxAbs, n}`.
- `race.teleport(id, x, z, heading, speed)`, `race.pose(id, {steer, drift, spin, air, boost})`, `race.gateCheck(kart)`.
- Determinism: all motion comes from the fixed step and seeded generators; `render()` only draws. Never call
  `Math.random()` in a game step that feeds the race.

## Common mistakes

- Kart drives backwards / sideways -> a custom model's nose is not +Z: rebuild it nose-forward, never add PI in a scene.
- Wheels float or sink on ramps -> do not set `root.position.y` yourself; the module solves the contact.
- Laps never count -> the kart skipped a gate (`gateSkip` events) or the track's points run the other way round.
- Two runs of `?t=` differ -> something used `Math.random()` or `performance.now()` inside the step.
- A black page -> no WebGL: check `race.ok`, call `race.drawFallback()`.
