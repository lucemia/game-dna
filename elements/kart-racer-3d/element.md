# N-05 Arcade kart racer (3D)

## What it is

A system element for arcade kart racing in three.js. A track is a closed list of points: the module turns it into a
low-poly circuit (asphalt road with edge lines, red-white kerbs on the corners, grass runoff, a striped barrier on both
sides, tyre stacks on the outside of tight corners, a striped ramp spanning barrier to barrier, glowing boost pads, a
start gantry with three countdown lamps and a banner, a grandstand with a crowd, bunting, checkpoint pennants, trees,
rocks, flowers, a lake or mesas, rolling hills, clouds and a sky gradient with fog). Karts are procedural (chassis
profile, side pods, bumpers, number plate, engine, exhausts, wing, four wheels, a driver with helmet, visor and scarf),
auto-scaled by bounding box. Handling: grip steering that loses turn rate with speed; a hop-drift that slides nose-into-
the-turn and charges blue / orange / pink sparks (levels 1-3) released as a 0.75 / 1.25 / 1.85 s boost; boost pads;
ramps that launch karts when the front wheels pass the lip; barriers that scrape; kart bumps; off-road slowdown; a
rocket start for gas held at the end of the countdown. Checkpoint gates count only in order; AI racers follow a racing
line (inside at the apex), plan corner speed from the curvature, drift once per tight corner and are rubber-banded to
the player (+-10 %). Countdown, race clock, lap splits, places, minimap, drift meter, speed, FINISH and results.
The starter, Meadowlark Cup, races a cup of two tracks with points.

## Default parameters

| key | default | meaning |
|---|---|---|
| laps | 3 | laps per race |
| maxSpeed | 25 m/s | road top speed (90 km/h; boosts x 1.32) |
| grip | 14 /s | decay of sideways speed (slip median 0.6 deg, a few degrees in hard turns) |
| driftGrip | 5 /s | the same while drifting (the slide) |
| turnRate | 2.25 rad/s | at low speed, 0.66 x at top speed |
| boostPower | 1.32 | top-speed multiplier while boosting |
| rubberBand | 0.1 | AI top speed +-10 % at 110 m behind / ahead of the player |
| aiSkill | 0.95 | AI speed factor (each 0.97-1.02 of it, seeded) |
| camDist / camHeight / fov | 6.4 m / 2.5 m / 64 deg | chase camera, velocity-led, 0.1 s lag with velocity feed-forward; FOV +12 on boost |
| shadows | soft | one directional light, 2048 map, 68 m box following the camera's kart, texel-snapped |
| track / palette | meadow / the track's | meadow, canyon; palettes meadow, canyon, twilight |

## Variants

Default; Canyon; Twilight meadow (palette); Slippery (grip 8, drift grip 3, turn 2.6); Speed demons (32 m/s, boost
x1.45, fov 72); Low camera (4.6 m, 1.6 m, fov 70); Eight directions (demo mode: eight karts drive out along the compass
directions on a test plaza); Kart sheet (demo mode: every kart in six views and poses).

## Interface

Needs three.js 0.149.0 as `window.THREE` (`three.min.js` next to the page), a WebGL canvas with an optional 2D canvas on
top, a fixed 60 Hz step that passes `{steer, throttle, brake, drift}`, a track (built-in id or points) and a racer list.
Provides `startRace`, `countdown`, `step`, `render`, `drawHud`, `hudRects`, `results`, `karts`, `anchor`, `project`,
`setAI`, `autoInput`, `setCamera`, `state`, `feetProbe`, `checkTrack`, and the events countdown, go, checkpoint, lap,
finish, raceEnd, allFinished, boost, driftStart, driftEnd, jump, land, bump, wall, wrongWay, respawn. The starter adds
`GAME.addons` hooks (onLap, onBoost, onDrift, onJump, onHit, onFinish, onRaceEnd, onResults, draw layers ...),
`GAME.addTrack`, `GAME.addKart`, `GAME.anchor`, `GAME.uiRects`, `GAME.toast`, `GAME.shipped`.

## Screen rules (exact numbers)

- Kart 2.0 m long (bounding box), about 1.15 m to the helmet top; every tyre's lowest point on the ground under its
  centre within 0.01 m on flat ground and ramps (pitch, roll and height solved per step, plus up to 6 cm of per-wheel suspension over a ramp's entry kink;
  checked over a whole cup).
- Facing: `yaw = atan2(dir.x, dir.z) + FACING_OFFSET` (0); world forward within 15 deg of the velocity, 40 deg while
  drifting nose-into-turn, 25 deg airborne; the 0.3 s after a wall or kart bump is marked `recover`.
- Track: road 13 m, kerbs 1.1 m where the smoothed radius < 45 m, runoff 4.6 m, barrier 0.85 m high; checkpoint gates
  every 1/8 lap; ramps 8 m long, 1.25-1.3 m high, on straights only (`checkTrack`); boost pads 3.4 x 4.2 m, 1.3 s.
- Camera: chase from behind the velocity, never inside a ramp (>= 1.3 m above the ground under it); portrait screens
  widen the FOV by up to 28 deg; the countdown snaps it behind the player; finish -> karts pull over and stop, orbit at 11 m, 9 m high (above the gantry); cup -> the top three on a podium line
  with a podium camera; results / standings panels sit beside (>= 900 px) or under (phones) the karts.
  `checks/camera.py` checks the whole timeline: camera >= 0.8 m above the ground and never in a barrier, the player in
  frame while racing and on results, the podium karts in frame and clear of the panel at the cup.
- HUD (CSS px, 16 px margins; phones < 560 px at 0.82 scale): place 58 px slanted italic with gradient (gold / silver /
  bronze / blue) + ordinal + "/ n", lap pill under it, clock panel 150 x 34 top right with lap splits under it (best in
  green), minimap 150 px (104 on phones) under the clock, speed 120 x 54 bottom right (keyboard only), drift meter 150 x
  16 bottom centre (above the touch buttons on touch screens), banners at 33 % height, WRONG WAY at 20 %.
- Colours: sky gradient top / mid / horizon per palette, fog 70-330 m, Lambert / flat-shaded Phong, gold-on-navy panels.

## Common mistakes (symptom -> fix)

- Kart drives backwards or sideways -> its model's nose is not +Z; never add PI in a scene, fix FACING_OFFSET once.
- Wheels hang in the air on a ramp crossed at an angle -> solve pitch, roll and height from all four tyres, not from one
  centre line; and launch when any front wheel passes the lip.
- Wheels sink on a ramp on a curve -> keep ramps on straights (the ground under a curved ramp is not a plane).
- A kart sitting nose-down at a ramp lip -> the kart must take off when the front axle passes the lip.
- AI karts re-hop every 0.3 s -> the drift ended (off road / zone check behind the kart) and restarted; one drift per
  corner zone, start and hold on the zone ahead.
- Laps count twice when backing over the line -> crossing the last passed gate backwards must undo it.
- Shortcuts count laps -> gates count only in order (`next`), any other gate is a `gateSkip`.
- The camera falls behind on a boost / clips into a ramp -> velocity feed-forward on the chase target, clamp above the ground.
- `?t=` stills differ from live play -> camera, particles and wheel spin are stepped in `step()`, `render()` only draws.
- Boost exhaust reads as glowing balls -> small, short-lived sparks inheriting the kart's velocity; cap point sprites
  near the camera (a few % of the view height).
- Drifts show no slide (slip 0 deg) -> the velocity was re-projected onto the new nose every step; keep the world
  velocity, turn the nose, then let grip eat only the sideways part.
- A finished kart "finishes" again on its victory lap -> finished karts ignore gates.
- Black slivers on the grass at tight corners -> an edge offset further than the local radius folds over itself on the
  inside of the bend and shows dark back faces (not shadow acne: bias changes nothing). Measure the radius from the
  step-to-step tangent turn (sharper than a smoothed curvature), pull every inside edge in to 0.88 x that radius, keep
  the edges in order, single-sided. `checks/grass.py` counts sliver pixels in every moment and a race sweep.
- The clock shows 0:010.00 -> round to centiseconds before splitting minutes and seconds (`checks/fmt-check.js`).
- Addon UI lands on the HUD under `?t=` fast-forward -> `uiRects()` must be computed for the current frame even when
  nothing was drawn (the starter lays the overlay out on a scratch context).

## Acceptance moments

Starter (1280 x 720, dpr 2, `?t=<ms>&freeze=1`, autoplay; `checks/moments.py` confirms each event at 1280 and 390 px):
1. `t=500`: title MEADOWLARK CUP over the grid, orbiting camera, chips for the two tracks.
2. `t=1800`: intro card RACE 1 OF 2 / MEADOW RING / 3 laps, 6 racers, 315 m.
3. `t=4200`: countdown "2", two gantry lamps red, chase camera behind the player on the grid.
4. `t=6100`: GO! with a rocket start (boost flames) and the toast ROCKET START!
5. `t=11000`: the player drifting nose-into-turn with orange (level 2) sparks, drift meter filling.
6. `t=16000`: LAP 2 banner, lap pill 2/3, the lap 1 split under the clock.
7. `t=16950`: jump on lap 2: the player's kart in the air past the striped ramp (the banner fading).
8. `t=24800`: FINAL LAP banner.
9. `t=34000`: FINISH!
10. `t=38500`: race 1 results (places, times, points).
11. `t=54500`: race 2 Sunstone Canyon, the player drifting.
12. `t=83000`: cup standings beside the top three karts on a podium line.
Demo: `?t=9000&freeze=1` (race), `?mode=sheet&t=100&freeze=1` (kart sheet), `?mode=eight&t=1500&freeze=1`; facing
sheet `checks/facing-3d/sheet.png`.
