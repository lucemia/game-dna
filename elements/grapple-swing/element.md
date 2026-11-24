# B-16 Grappling hook & swing

## What it is

A grappling hook for side-view games. The player fires a hook (aimed by facing + up/down, by mouse or stick, or snapped to iron rings within an aim-assist cone); it flies with a wavy rope and bites a ring or any rock surface. The hero then hangs on a rope of fixed length and swings like a pendulum, pumps the swing with left / right, reels in and out, jumps off with a hop, or lets go and flies on with the swing's momentum. The rope wraps around convex corners and unwraps on the way back; a shot at nothing reels back. The module never moves the hero: it returns the velocity the swing needs and the game moves the hero with its own collision.

## Default parameters

range 120 px, hookSpeed 720 px/s, reelSpeed 70 px/s, minLength 14, maxLength 150, tighten 0.9 (taken in over 120 ms after the bite), swingForce 240 px/s^2, jumpBoost 150 px/s, releaseBoost 1.1, carryMs 1100, airBrake 420 px/s^2, airDrag 0.08/s, aimAngle 55 deg, aimAssist 32 deg, surfaces 1, wrap 1, mode hold, maxStep 0.45 x tile. All distances and speeds at scale 1 (180 px tall view); `scale` multiplies them.

## Variants

Default; Snappy (fast hook, strong yank and pump, 1.25 release); Heavy rope (slow hook and reel, exact momentum, short carry); Rings only (no surface bites, wider assist).

## Interface

Needs: the hero box and velocity in world px and the game's units (`velUnit` step or second), the game's `solid(x, y)`, tile size and gravity, buttons (grapple pressed / held, left / right, reel, jump pressed), a draw call inside the camera transform, reset on run / respawn. Provides: `update()` -> `{active, flying, vx, vy}`, rings and surface hooks, wrap, events (`fire`, `attach`, `release`, `miss`, `snag`, `wrap`, `unwrap`, `reel`), `state()`, `stats()`, `ropePath()`, `hash()`.

## Screen rules

- Pixel mode (smoothing off): rope = 1 native px braid (light / mid twists every 2 px) with a 1 px shade under it; hook = 12-pixel claw with a 1 px ink outline, light on its upper side; rings = 9 px iron ring lit from above plus a dithered halo (radius 7); reticle = 4 corner brackets 8 px out, pulsing 1 px.
- Smooth mode: rope 2.6 px dark + 1.5 px core + dashed highlight (x scale), ring with gradient and soft radial halo.
- The rope always meets the hand point passed in `draw(ctx, camX, camY, body)`; when the body moved after the last update the last segment is drawn bent over the corner it now crosses (never through rock).
- A slack rope (hero standing below the anchor) sags as a curve; a taut rope is straight segments.
- Sparks: 5-7 at a bite, grit for rock; seeded, under 0.6 s.

## Common mistakes

| symptom | fix |
|---|---|
| Hero drops away from the rope | `r.vx, r.vy` not applied or gravity added after them while `r.active`. |
| Letting go drops straight down | `r.flying` ignored: apply `r.vx` after the air control, skip the jump cut. |
| Hook bites air, rope drifts with the camera | `solid` / rings in screen px, or the camera applied twice. |
| Hero tunnels through thin walls | `maxStep` raised above half a tile, or velocities in the wrong unit (`velUnit`). |
| `?auto=1` ends differently | The grapple key mapped onto a key the autopilot uses, or code outside the `r.active` branch changed. |

## Acceptance moments

Demo (`demo/index.html`, 320x180, one clock; `checks/state.json` lists the event each moment must show, checked by `checks/shoot.py`):

1. `?t=1270&freeze=1` hook in flight toward ring A, wavy rope (event `fire` ring, state shot).
2. `?t=1600&freeze=1` hanging on ring A, arms up on the rope, swinging over the sea (`attach` ring).
3. `?t=1940&freeze=1` let go, flying on with carried momentum (`release`, carry on).
4. `?t=4340&freeze=1` hooked into the overhang rock, rope paid out (`reel`, surface anchor).
5. `?t=5450&freeze=1` chained to the ceiling mid-air, swinging to the ledge (`attach` surface).
6. `?t=8170&freeze=1` the rope bends about 50 degrees over the floating rock's lower corner, a rub mark at the bend (`wrap`, 2 pivots); the hero swings up beside the rock.
7. `?t=11190&freeze=1` a shot at open sky flies to full range and reels back (`fire` miss).
