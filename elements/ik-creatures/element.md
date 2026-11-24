# E-14 Procedural IK creatures

## What it is

The game's ground-walking foes become many-legged creatures drawn and animated by code: a **spider** (8 legs), a **crab** (8 legs and two claws; walks sideways) or a **centipede** (a chain of plated segments with a leg pair each). The game keeps its foes exactly as they are (position, AI, hit boxes, HP, hit flash); every fixed step it lists them and the module gives each one a body that rides on real legs:

- every foot **plants on the game's own ground** (side view: the surface under the foot; top view: the floor, skipping water, walls and trees) and **never moves while planted**: no sliding, no floating, no sinking, over the whole timeline;
- each leg is a **2-bone IK chain** (hip, knee, ankle, plus a short tarsus): knees bend up and out, a leg never folds under its own hip, a knee that would end inside a slope bends straight up instead;
- a foot **steps when it is stretched**. The legs form two alternating groups with no neighbours in the same group (left 0, right 1, left 2, ... and the mirror), so **two neighbouring legs are never off the ground together**; the step lifts first, carries, then drops, clearing any rise on its path, re-aims if the body speeds up or turns, lands exactly on the ground and kicks a puff of dust;
- the **body rides on its feet** (height and pitch from the planted feet on a soft spring) and **faces its path**, turning at a bounded rate (a crab turns its side to its path; in a side view a turn swings through the camera, showing the face); the **head turns to the target** (spider: head, eyes and chelicerae; crab: eye stalks with a glint, and pincers held beside the face that pinch faster when the target is near; centipede: head, antennae and forcipules); a centipede segment is a wide flat armour plate over a narrower body plate, legs hung from under the plate edge and clipped below the plates' top edge (a lifted knee never shows on its back);
- a foe knocked into the air or leaping lets its legs **splay fore and aft with knees up**, then reaches for the ground on landing with a short squash (an optional `crouch` 0..1 per actor lowers the body before a leap); a defeated foe **curls its legs**, settles and fades;
- drawing is **per pixel**: each body part is a lit 3D ellipsoid or tapered capsule (each leg segment two capsules bowed toward the knee, so legs curve; parts away from the camera are darker so the leg pairs separate) (wrap-lit key light, warm or cool rim light, specular gloss on chitin, markings: chevrons, leg bands, speckles, plate edges), a dark outline where parts overlap and at the silhouette, a soft contact shadow only over real ground. HD canvases get it at device resolution; pixel canvases at native resolution with a 5-step colour ramp and 1 px outlines (bristles only in HD).

## Default parameters

| key | default | meaning |
|---|---|---|
| kind | spider | creature for the game's walking foes (`crab` for a boss, `centipede` for long chases) |
| stride | 0.30 | a foot steps when it is this far (x body length) from its rest spot; less at speed |
| lift | 0.16 | swing arc (x body length) |
| stepMs | 150 | longest swing at a slow walk (faster bodies: down to 95 ms; centipede 55 ms) |
| turnRate | 300 | body turn, deg/s |
| headRate / headYaw / headPitch | 360 / 40 / 28 | head turn speed, yaw and pitch limits (deg) |
| depth | 0.05 | side view: near legs drawn lower per px of depth (they stand on the near edge of the ground strip) |
| rim / gloss / outline / dust | 1 | look |
| palette | auto | forest (brown, amber marks), ember (red), cave (violet / teal glow), frost (steel blue) |
| render | auto | pixel when the context has `imageSmoothingEnabled === false`, else HD |

## Variants

- **Forest spiders** (default): side-view crawlers and top-down spiders.
- **Ember crab boss**: `kind: crab, palette: ember`, size about the boss box width.
- **Cave centipede**: `kind: centipede, palette: cave`, a long chaser (top view, or side-view paths without instant reversals).
- **Skittish**: `stride 0.22, lift 0.24, turnRate 540`: short, high, quick steps.
- **Pixel render**: native resolution, fixed ramp.

## Interface

Needs: `view` (`side` | `top`); side view `ground(x, y)` = the ground surface y at column x at or below y (inside solid ground: the top of that run; `null` = a pit), top view `walkable(x, y)`; `actors()` with stable ids, kind, the feet position in world px (side: bottom centre of the box; top: the floor position; centipede: the head), size, target, flash, dead; `update(stepMs)` at the end of the fixed step (0 while the world is stopped); `drawOne(ctx, id, camX, camY)` where the foe's sprite was drawn.

Provides: the creatures, `onStep({id, leg, x, y})` for footstep sounds, `onEvent` (`spawn`, `snap`, `land`, `forced`, `die`, `gone`), `creature(id)` (legs, feet, knees, heading, head angles, mode), `list()`, `boxes()`, `stats()`, `hash()`.

## Screen rules

- Planted feet: exactly on the ground the game reports (|error| < 0.01 px in the module, < 0.6 px against the drawn terrain in the demo), never moving while planted.
- No lifted foot below the ground; a knee is never more than 15 % of the femur inside the ground (top / side, normal speeds).
- Alternation: never two neighbouring legs off the ground together while walking at up to ~1.6 body lengths / s; only after an instant reversal at speed, a shove, or a charge (to ~4 body lengths / s) may a stretched leg step out of turn (counted as `forced`).
- Joined legs: femur and tibia keep their lengths (stretch at most 15 % before a forced step); swing feet never trail out of reach.
- No jumps: body height on a critically damped spring; a lifted foot rises at most ~12 body lengths / s; the body turns at most `turnRate`, the head at most `headRate`; the bend plane of a knee turns at most 9 degrees per step.
- Air: feet off the ground ride with their hips (never above the body), every knee stays on its own side through a hop and its landing (`checks/run-checks.js` hopPose, with two mutants).
- Facing: a body moving steadily faces its path within 20 degrees (crab: its side); a standing body turns to a target outside the head's range; the head is within 12 degrees of the target direction when the target is inside its limits.
- Death: legs curl in 0.5 s, the body settles on the ground, then the whole creature fades (0.5 s to 0.9 s) as one image (no see-through parts); a hit flash is 70 % white over the lit colours, never during the fade.
- Shadow: a soft ellipse under the body, only over real ground (none over a pit); feet carry their own dust puffs (HD: soft discs, pixel: single pixels).

## Common mistakes

| symptom | fix |
|---|---|
| Feet float or sink | `ground` in screen px, returns the tile row not its y, or the foe's `y` is the box top; give the feet (box bottom). |
| Creatures re-spawn every frame | ids made per frame; use the foe's own id. |
| Legs streak or jitter | `update` per render frame or twice per step; once per fixed step. |
| Creature off its hit box, slides with the camera | camera applied twice, or positions in screen px. |
| Legs keep walking in the pause menu | `update(0)` while stopped. |
| Top view: creature drawn over trees in front of it | use `drawOne` inside the game's y-sorted list. |
| A side-view centipede folds over itself on a reversal | a line has no room for a U-turn: give it a one-way path, or use a spider. |
| Old sprite still drawn under the creature | stop drawing the old body for those foes; keep the HP bar. |

## Acceptance moments

Demo `demo/index.html` (side view; HD 640x360, `?view=pixel` 320x180). Each moment must hold its event in `__state().events` (`checks/state.json`, `checks/shoot.py`).

| # | query | event | must show |
|---|---|---|---|
| 1 | `?t=1700&freeze=1` | `boulder` weaver | the spider straddles the mossy boulder: feet planted at different heights on the curved rock, body tilted with the slope, legs bending up and out |
| 2 | `?t=3300&freeze=1` | `claws` pincher | the crab on the sand facing the camera, legs fanned in pairs, a big and a small pincer (palm, two fingers, a gap) on their own sides, eye stalks turned to the firefly |
| 3 | `?t=4000&freeze=1` | `ledge` weaver | the spider stepping up the ledge: front feet on the ledge top, back feet on the lower ground, no leg through the corner |
| 4 | `?t=10000&freeze=1` | `climb` longback | the centipede (alone on the right: the crab has left) with its head at the slope's top and segments on the slope, legs planted along it, head raised to the firefly; whole body in frame |
| 5 | `?t=5950&freeze=1` | `turn` weaver | the spider mid-turn, side-on: its face toward the camera (the marker is its measured heading passing 90 degrees), feet re-stepping |
| 6 | `?t=11150&freeze=1` | `hop` hatchling | the small spider in mid-leap off the ledge, legs splayed fore and aft with knees up, no foot planted |
| 7 | `?t=11750&freeze=1` | `land` hatchling | the small spider landed by the boulder, all feet down again |
| 8 | `?t=15500&freeze=1` | `settled` weaver | everyone standing, all feet down, heads to the firefly, every creature fully in frame |
| 9 | `?view=pixel&t=1700&freeze=1` | `boulder` weaver | moment 1 at native 320x180: fixed ramp, light-cored legs, a dark 1 px outline round each creature |
| 10 | `?view=pixel&t=10000&freeze=1` | `climb` longback | moment 4 in pixels |
| 11 | `?view=pixel&t=11150&freeze=1` | `hop` hatchling | moment 6 in pixels (the hatchling is drawn 21 px long in the pixel view so its legs read) |
| 12 | `?view=pixel&t=15500&freeze=1` | `settled` weaver | moment 8 in pixels |

Staging (`checks/timeline.py`, every frame, both views): creatures never overlap on screen (lanes: the weaver owns the boulder and the ledge, the hatchling the plateau until the weaver has gone back, the crab the sand until it leaves, then the centipede), and at every moment each creature is fully in frame or fully out; mutants `?mut=crowd` and `?mut=edge` fail.
