# B-08 Platformer movement feel

## 1. What it is

The movement of a side-view hero that feels good to control, as one module the game feeds input into and reads a position back from. Running speeds up and slows down on curves (separate rates for speeding up, stopping and turning around, on the ground and in the air). A jump has a designer height and time to its peak; holding the button keeps it full, releasing it cuts the rise (after a minimum time, so a 0 ms tap is still a small hop). Near the peak gravity eases while the button is held (apex hang); falling is heavier and capped at a terminal speed. Two forgiveness windows: coyote time (jump a few frames after running off a ledge) and jump buffering (a press just before landing jumps on touch-down). A dash (8 or 4 directions, fixed speed and length, cooldown) is refilled on landing. Pushing into a wall while falling slides slowly; jumping there kicks away. One-way platforms carry the hero from above and let it through from below; down + jump drops through. A head that clips a ceiling corner by a few pixels slides around it, and feet that clip a ledge lip are lifted onto it. Positions keep a sub-pixel remainder, but the body always moves and rests on whole pixels, one pixel at a time, so it never tunnels through a tile at any speed and the sprite never shimmers.

It is a system element: it owns the hero's movement state machine (ground, air, dash, wall) and the collision against the tile map. The game keeps its sprites, enemies, hazards, camera, HUD and rules. For tuning, the module also draws a feel overlay: the trail of the feet coloured by state with markers where a coyote jump, a buffered jump, a wall jump, a dash or a corner nudge happened, the predicted arcs of a full and a tapped jump, the hitbox, bars for the coyote and buffer windows and the dash, and a live velocity graph.

## 2. Default parameters

Speeds px/s, accelerations px/s², times ms. Defaults = the `tight` preset.

| Key | tight | floaty | heavy | raw | Meaning |
|---|---|---|---|---|---|
| `runSpeed` | 96 | 84 | 80 | 90 | top run speed |
| `groundAccel` / `groundDecel` / `turnAccel` | 1100 / 1500 / 2200 | 560 / 480 / 900 | 640 / 2200 / 1300 | 900 / 900 / 900 | ground curves |
| `airAccel` / `airDecel` | 760 / 260 | 420 / 110 | 300 / 80 | 600 / 0 | air control |
| `jumpHeight` / `jumpApexMs` | 44 / 330 | 52 / 470 | 38 / 300 | 44 / 360 | gravity = 2h/t², take-off = 2h/t |
| `jumpCut` / `minJumpMs` | 0.45 / 50 | 0.6 / 70 | 0.5 / 40 | 1 / 0 | release cut |
| `apexBand` / `apexGravity` | 36 / 0.5 | 50 / 0.4 | 18 / 0.85 | 0 / 1 | apex hang while held |
| `fallMult` / `maxFall` | 1.7 / 300 | 1.15 / 170 | 2.3 / 420 | 1 / 360 | fall |
| `coyoteMs` / `bufferMs` | 100 / 120 | 140 / 140 | 70 / 90 | 0 / 0 | forgiveness |
| `dashSpeed` / `dashMs` / `dashCooldownMs` | 270 / 150 / 250 | 220 / 190 / 300 | 300 / 120 / 400 | 270 / 150 / 250 | dash |
| `wallSlide` / `wallJumpX` / `wallJumpLockMs` | 60 / 120 / 140 | 38 / 100 / 180 | 95 / 130 / 120 | 60 / 120 / 140 | walls |
| `corner` / `ledge` | 4 / 4 | 5 / 5 | 3 / 3 | 0 / 0 | correction px |

Modes (not in presets): `dash` eight / four / off (eight), `dashCount` 1, `wall` on / off (on), `drop` downjump / down (downjump).

## 3. Variants

| Name | Params |
|---|---|
| Tight (default) | the tight column |
| Floaty | preset floaty: higher, slower, soft, long windows |
| Heavy | preset heavy: low, fast fall, sharp stops, short windows |
| Raw (no assists) | preset raw: no coyote, buffer, apex hang, cut or corrections, for comparison |
| Twin four-way dash | tight with `dash: four`, `dashCount: 2` |

## 4. Interface

**Needs:** `tileAt(tx, ty)` (solid / oneway / empty; hazards stay the game's), the tile size, the hero's hitbox and start; a fixed 60 Hz step where the hero used to move (the step `?t=` and autoplay also run); the game's input per step (held directions, jump held, jump pressed since the last step, dash); the places that move the hero directly routed to `reset` / `knock` / `bounce`; a free dash key.

**Provides:** `x`, `y` (whole px), `fx`, `fy`, `vx`, `vy`, `onGround`, `facing`, `pose`, `dashing`, `dashesLeft`, `wall`; events `jump` (ground / coyote / buffered / wall), `cut`, `apex`, `land`, `dash`, `dashEnd`, `refill`, `wallSlide`, `wallJump`, `corner`, `ledge`, `drop`, `bonk`; `windows()`, `squash()`, `predict()`, `anchor(camX, camY)`, `collides()`; `stats()` (moves by kind, `embedded`); drawing `drawFx`, `drawBody`, `drawOverlay` + `getUIRects()`.

## 5. Screen rules (exact numbers)

- One fixed step = 1/60 s. Moves happen one whole pixel at a time with the remainder kept: `x`, `y` are integers every frame; `stats().embedded` (steps that began inside a solid) is 0 in every test run.
- tight: gravity 808 px/s², take-off 267 px/s, measured full jump 42 px (the step loses about 2 px of the nominal 44), 0 ms tap 18 px; floaty 54, heavy 36.
- Coyote 100 ms = 6 steps after leaving the ground; buffer 120 ms = 7 steps before landing; a jump inside the window reports `kind` and how late / early (`ms`).
- Dash: 270 px/s x 150 ms = 41-44 px; diagonals x 0.707 per axis; after the dash an upward speed halves and the horizontal speed eases from at most 0.6 x the dash speed; a jump cancels a dash.
- Wall jump: vertical 0.92 x take-off, horizontal `wallJumpX`, input toward the wall ignored for `wallJumpLockMs`; contact within 3 px counts.
- Corner correction tries 1..`corner` px sideways (the direction of travel first) and never passes through a wall; ledge lip lifts 1..`ledge` px only in the air and not while rising faster than half the take-off speed.
- Stand-in hero 12x16 with squash: jump stretch to 0.8 x 1.25, landing squash up to 1.35 x 0.65 over 6 frames. Dust: 3-7 px puffs on landing by impact speed, 4 on jumps; after-images every 2nd dash frame, fading over 14 frames.
- Overlay: two framed panels 100x44 (windows) and 100x44 (graph, 2 s of vx / vy history) in the first view corner that touches neither the UI rects nor the hero; trail of the last 150 feet points (rising cyan, falling orange, dash violet, coyote window gold); predicted arcs every 3rd (hold, white) / 4th (tap, gold) point as 2x2 dots on a 4x4 ink backing; marker letters on an ink plate; the graph header shows both speeds (`VX 96`, `VY -132`).

## 6. Common mistakes (symptom -> fix)

- The hero sinks into the floor, jitters or slides on its own -> the old movement (gravity, collision, position writes) still runs after `pf.update()`; remove only that, and route respawn / knockback through `reset` / `knock`.
- Quick taps do nothing -> the game passes only "held"; pass its latched press as `jumpPressed` (or feed key events to `pf.key`).
- Every jump is full height -> `jump` (held) is never passed, only the press; or `jumpCut` is 1.
- Autoplay falls into a pit it used to clear -> the converted `jumpHeight` / `runSpeed` are lower than before; px per frame x 60 = px/s, height = v²/(2g).
- The hero walks out through the map edge -> `tileAt` answers empty outside the map; answer `'solid'` there like the old test.
- A dash never refills -> the game teleports the hero every frame (`teleport` clears contact), or `dashCount` is 0.
- Enemies or camera read stale numbers -> copy every hero field they read back from the module each step.
- `?t=&freeze=1` differs between runs -> something feeds real time or random input; the module only moves in `update()`.

## 7. Acceptance moments

- **Demo bot stations** (same route for every preset): a lip jump whose hold is chosen with `predict()` (`L`), a ceiling-corner jump (`N`), a run off the step with the jump pressed 67 ms late (`C`), a press 83 ms before landing (`B`); with raw the C station falls and the B press is lost.
- **Variable height**: two jumps side by side in the overlay, a full hold (42 px) and a tap (18 px); trail cyan up, orange down.
- **Coyote**: a jump that starts after the feet left the ledge (gold trail segment, `C` marker).
- **Buffer**: a jump pressed before landing that fires on touch-down (`B` marker, BUF bar full then empty).
- **Dash**: violet trail and after-images in the hero's shape, the DASH pip empty until landing (HUD and overlay).
- **Wall jumps**: a zig-zag climb in a 3-tile shaft (`W` markers).
- **Corner**: a jump into a ceiling edge that slides around it (`N` marker); a ledge lip (`L`).
- **Presets**: the same route with floaty / heavy, visibly different arcs and graph slopes.
- **Starter**: `?auto=1` lights the beacon with each preset; a stomp on a beetle; the end window lists the move counters.
- **Unknown game**: the side-scroller host with the module: same autoplay ending as the original, no errors.
