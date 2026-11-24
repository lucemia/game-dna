# N-01 Third-person 3D character and camera

## What it is

A system element for small 3D exploration games: a low-poly adventurer on an island courtyard seen from behind by a
smooth follow camera. The player pushes a stick (keys or touch); movement is relative to the camera, the body turns
toward the stick and then speeds up along its facing (it pivots instead of moon-walking), and idle / walk / run poses are
driven by the distance travelled so the planted foot stays planted. The camera lags slightly, swings lazily behind the
hero while it runs forward, never enters a prop (it moves in only when its own position would be inside or within 0.4 m of
a pillar, arch post or the beacon), and any prop between it and the hero, or within 2 m of it, fades out with an ordered
dither (opaque rendering, no see-through back faces) and comes back when clear. Pickups float and burst when collected; NPCs turn to face the hero, greet it
and wave. Everything is procedural (primitives, flat-shaded palette, code-drawn ground). The starter, Sunshard Isle, is a
complete game: find three sun shards, bring them to the Keeper, relight the beacon.

## Default parameters

| key | default | meaning |
|---|---|---|
| walkSpeed | 1.8 m/s | Shift / half stick |
| runSpeed | 5.2 m/s | default keyboard speed, full stick |
| turnRate | 12 rad/s | body yaw rate; speed is scaled by `(cos(turn left) - 0.15) / 0.85` until the body faces the stick |
| heroHeight | 1.7 m | bounding-box height after auto-scale |
| camDist | 6.5 m | distance from the look-at point (hero height x 0.8) |
| camPitch | 20 deg | above the horizon |
| camLag | 0.12 s | exponential follow time constant |
| autoAlign | 1.2 | rad/s at run speed toward "behind the hero", paused 1.2 s after any manual camera turn and when running at the camera |
| fov | 50 deg | vertical; portrait screens get `fov + (1 - aspect) x 36` (max 80) |
| gear | both | cape and satchel (front / back read) |
| palette | meadow | also dusk, autumn |
| shadows | soft | one directional light, 2048 map, 30 m shadow box following the hero, snapped to texels |

## Variants

Default; Dusk stroll (dusk palette, slower walk and run, lazier camera); Autumn, close camera (4 m, 14 deg, fov 58);
High overview (10 m, 42 deg, fov 42); Snappy action (run 7, turn 22, lag 0.04, align 2.5); Eight directions (demo mode);
Character sheet (demo mode: every character in four views plus walk and run poses).

## Interface

Needs: three.js 0.149.0 as `window.THREE` (`three.min.js` next to the page), a WebGL canvas plus an optional 2D canvas on
top, a fixed 60 Hz step passing camera-relative input `{x, y, run, camYaw}`, and world content (props, pickups, NPCs).
Provides: pickup events; `actors()` with position, yaw, speed, target; `anchor(id)` and `project()` (world -> screen CSS
px); `state()` with `forward` from `getWorldDirection`, `facesMove`, `facesTarget`, `feetY`; `autopilot(goal)`; gestures
`play('wave' | 'cheer' | 'bow')`. The starter adds the ADDONS SLOT and hooks `init, gate, onKey, onStep, update,
draw(g, layer: world | hud | overlay), onPickup, onTalk, onPhase, onEvent, onEnd`, plus `GAME.three`, `GAME.addNPC`,
`GAME.addActor`, `GAME.anchor`, `GAME.say`, `GAME.toast`, `GAME.uiRects`.

## Screen rules (exact numbers)

- Hero 1.7 m tall, about 4.5 heads; head radius 0.175 of 1.7; feet at y = 0 within 0.01 m in every pose (checked: 240 poses).
- Facing: `yaw = atan2(v.x, v.z) + facingOffset`; world forward within 15 deg of the move direction while moving (checked
  in 8 directions and through a whole autoplay run).
- Stride per gait cycle = 4 x leg length x sin(swing); swing 0.5 rad at walk speed, 0.82 at run speed.
- Camera: never closer than 1.6 m; 0.4 m clearance from tall props (top >= 2.5 m); when pulled in it pitches down by up
  to 0.3 rad; props whose colliders cross the camera-to-hero lines (hero at 25 / 60 / 95 % height) or lie within 2 m of
  the camera dither to 30 % coverage within 0.12 s; auto-align only turns for the forward part of the stick.
- Overlay UI: panels with 1.5 px gold border on dark navy gradient, 10-18 px radius; HUD 14 px from the top-left; touch
  stick radius 56 px bottom-left, TALK button radius 40 px bottom-right; the dialog sits 132 px higher on touch screens.
- Colours: flat-shaded Phong, shininess 4; sky gradient top / mid / horizon; fog 34-150 m (meadow).

## Common mistakes (symptom -> fix)

- Character walks backwards or sideways -> the model's nose is not +Z: set its `facingOffset` constant once; never add
  PI in one scene.
- Feet float or sink after scaling or in some poses -> scale by bounding box and re-ground after posing (lowest vertex to
  y = 0), not by a hand-typed y offset.
- Feet skate -> advance the gait phase by distance travelled / stride, not by time.
- Hero turns but slides the old way (moon-walk) -> build speed along the body's facing and scale it by the remaining turn.
- Camera clips into a pillar or the hero disappears behind a trunk -> keep the camera point 0.4 m clear of props and
  dither-fade whatever crosses the camera-to-hero lines; pulling the camera in for every occluder makes it hug walls.
- Faded props look like murky glass with back faces -> use ordered-dither discard on opaque materials, not alpha blending.
- Burst sparkles freeze on screen -> a local variable shadows the effects array (`var fx` hoisted in the same function).
- HUD labels drift away from characters -> read `anchor(id)` after `render()` of the same frame, in CSS px.
- `?t=&freeze=1` shots differ between runs -> something reads `Math.random` or `performance.now()` inside `step()`.
- Black page on some machines -> no WebGL: check `tp.ok`, show the fallback message, never throw.

## Acceptance moments

Starter (1280 x 720, dpr 2, `?t=<ms>&freeze=1`, autoplay):
1. `t=500`: title over the island, hero from behind on the path through the arch (cape and satchel read).
2. `t=1500`: hero running east past the walls; HUD shard slots empty; toast "Find the three sun shards".
3. `t=6000`: after the first shard (toast "Sun shard 1 / 3"); trees between or next to the camera are dithered out; no burst left over.
4. `t=13000`: walking up to the west shard by the ruins; the shard and its glow ring visible.
5. `t=16300`: Keeper turned to the hero, waving, bubble "Over here, traveller!", prompt "Space Talk to Keeper".
6. `t=19500`: dialog box with a "Space next" hint; camera swung and lifted to frame hero, Keeper and the whole dark beacon.
7. `t=26000`: beacon lit, hero and Keeper cheering, "THE BEACON BURNS", time panel and "Press Enter to play again".
Demo: `?t=6000&freeze=1` (tour, running with cape), `?mode=sheet&t=100&freeze=1` (character sheet),
`?mode=eight&t=5000&freeze=1`; facing sheet `checks/facing-3d/sheet.png`.
