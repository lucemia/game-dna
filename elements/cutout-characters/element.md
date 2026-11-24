# L-10 Layered cutout characters (`cutout-characters`)

## 1. What it is

HD hand-painted characters that move without frame-by-frame drawing. Each original character is generated once (Codex
built-in `image_gen`): a full-body picture fixes the design, then a **parts sheet** made from it with the full body as
the only reference paints the same character taken apart (head with neck, torso, hips with belt and skirt, near / far
upper arm, near / far forearm with hand, near / far thigh, near / far lower leg with boot, weapon, shield, cape or
coat skirt), every piece straight, separated and with rounded overlapping caps at its joints. A script
(`tools/make-pack.py`) finds the pieces, cleans alpha, scales them, cuts each boot foot off at the ankle (alpha
feather only) and packs one atlas + a rig (pivot and joints per part, z order) per character.

The module (`GameDNA_Cutout`) poses the rig in code: pelvis, torso and head rotate; arms swing from the shoulders;
legs reach their foot targets by 2-bone IK (knees forward, feet flat), so the stance stays planted while the body
breathes, lunges and recoils; the weapon is held at a set direction; a spear's second hand grips the shaft ahead of the first by IK;
the cape and coat skirt hang on damped springs driven by the body's and the character's own speed. Three motion sets
(sword, spear, mage) give idle, walk, attack (anticipation, strike, recover), cast, hurt, guard, cheer, jump and a fall.

Look targets (traits only): slender figures about 6.5-7 heads tall, three-quarter view facing right, low ready stance;
thin dark warm-brown line art; soft painted gradients with 2-3 value steps; distinct materials; a warm key light from
one side with a bright rim and a soft contact shadow; layered gear (cloak, shoulder or chest armour, under-tunic, belt,
tall boots, weapon or shield).

## 2. Default parameters

| key | default | meaning |
|---|---|---|
| `light` | `left` | side the code key light comes from (cool shade ramp on the far side, warm rim on the near edges); `auto` = from the side the character faces away from; `off` = the painted light only |
| `rim` | 0.42 | rim strength (rim width 1.4 % of the drawn height, full at the lit edge, half for the inner half; built at half resolution) |
| `shade` | 1 | light ramp: 20 % warm wash on the lit 38 %, 52 % violet-brown shade toward the far edge |
| `blendMs` | 140 | cross-fade between poses |
| `shadow` | on | soft contact shadow, 36 % of the height wide, under the feet (off while airborne) |
| `swoosh` | on | strike phase only (slash k 0.16-0.36, overhead 0.29-0.5): one smooth tapered crescent from the blade's last 80 ms of drawn directions (21 samples, 4 ms apart), pivoted on the current hand, so its radius is the blade length; 80 % at the blade fading to 0; none for thrusts |
| `flash` | auto | crisp hit flash: 0.75 for the first 50 ms of `hurt`, gone by 130 ms; the body burns to warm white, stays opaque and keeps its line work |

Pack: `sword`, `spear`, `mage`; atlases 1000 x 270-400 px at half the sheet scale (character ~300 px tall), 182 KB.

## 3. Variants

- **Torch-lit stage** (default): key light from the left, rim 0.42.
- **Light follows facing**: `light: 'auto'`, the rim always on the back edge.
- **Baked light only**: `light: off` (cheapest: about 40 % of the cost at 800 device px).
- **Snappy poses**: `blendMs: 60` for fast action games.

## 4. Interface

`time: any` (driven by the host's fixed step), `coords: side`, `layer: actor`. Needs the draw site (feet, height,
facing, flash, blink) and the character's timers (attack, hurt, airborne, speed) in the step. Provides
`actor.draw` (false = keep the old drawing), `pose / play / loop / update / reset`, `lib.drawPose` (stateless,
A-14 poses), `actor.point('tip')`. See `module/README.md`.

## 5. Screen rules (exact numbers)

- `slash` (sword) on its hit frames (k 0.22-0.45): the blade tip 0.63-0.70 h ahead of the feet, 0.34-0.51 h above the ground; with hd-sidescroll's 16-frame swing (hit frames 4-10) the blade lies inside the hit box.
- Walk: each foot is planted for half the cycle and moves back linearly; ground speed `lib.walkSpeed(id)` = stride x 4 / duration (sword 0.83, spear 0.79, mage 0.67 heights / s).
- Drawn height `h` = the old sprite's height, head top up to ~18 % above the hit box (hd-sidescroll: 52 for a 44 px box;
  A-14: 66 x unit scale = 1.1x the built-in 58, so the slim figures keep the chunky units' weight).
- Feet centre at the old feet point; `facing: -1` mirrors about the feet.
- Rendering at device resolution (`ctx.getTransform()`), atlas mip within 0.5-1x of the drawn size, blit on whole device px.
- Hurt flash: `flash` 0..1 over-exposes the silhouette only (warm white, on the character's own layer, never a rectangle, never a lower alpha).
- Poses stay within `checks/rigcheck.html` LIMITS (torso +-25 deg, head +-25, elbow bend 0..110, feet within +-0.25 H).
- Parts stay joined in every animation (`joins` check: 13 samples x 10 animations x 3 characters at 600 px, a per-part ID buffer): no part floats (its visible area meets its parent's, or it comes out from behind the body), every weapon / shield is held by a visible forearm of at least 0.0015 h^2 that meets it along 0.01 h (or the arm and the item are both behind the body), a second hand is within 0.02 h of the shaft, and no joint stub (`pegs`) shows more than 0.00022 h^2 (79 px at 600 px); where a piece was cut in the pack (`cuts`) inside its own silhouette, at most 0.0003 h^2 may show what is behind it.
- `down` ends in a lying pose of its own (legs straight on the ground line, arms along the body, weapon lying beside the legs, body lifted by its back's thickness so it rests on the foot line); `jump` k 0 = knees tucked, leaning in, k 1 = legs stretched, arms up, cape lifted.
- One shoulder plate, one sleeve: a plate or sleeve stub painted on the torso under an arm piece is cut away in the pack (`eraseWarm`, `erase`).
- Z order: upper arm above forearm (sleeve stubs cut away with `erase`), shield behind legs and body, weapon under its hand.
- No hole at any joint in any animation (13 samples x 9 animations x 3 characters, at 420 and 140 px).
- Cost (headless, software raster, 3 characters): 2.6 ms at 390 px dpr 3; 11.9 ms at 800 device px with the key light, 4.6 ms without; 2.1 ms at 320 device px.

## 6. Common mistakes (symptom -> fix)

- Character pops back to the old drawing on the first frame of `?t=&freeze=1` -> the boot ran before the atlases loaded; boot from `onReady`.
- Frozen frame differs from play -> `pose()` / `play()` called in draw; call them in the fixed step.
- Two swords on screen -> the old weapon or swing line still drawn after the cut-out; drop it (the rig swings its own weapon).
- Attack looks late or early -> map the game's attack timer to `k` over its whole length (`slash` strikes from k 0.22, `attack` at 0.34-0.36).
- The enemy flashes while the blade is far from it -> the overhead `attack` ends low and close; side-view action uses `slash`.
- Feet slide in a walk -> set `loop('walk', {speed: |vx| / (lib.walkSpeed(id) * h)})`.
- Portraits / turn-order icons still show the old faces -> draw them with `lib.drawHead`.
- Feet slide or sink -> wrong feet point (use the hit box bottom centre), or `h` doubled by the camera scale.
- Character floats with a shadow under it in a jump -> pass `shadow: onGround`.
- White box instead of a hit flash -> flashing done by the host on its canvas; pass `flash` instead.
- Cape streams the wrong way -> `vx` passed without `facing`, or in px per frame instead of per second.
- Regenerate: a seam at the elbow or knee -> the pivot is too close to the piece end; move the joint fraction 0.02-0.05 inward (more overlap) and rebuild; a pale stump shows at the elbow -> cut the stub below the sleeve hem with `erase`, put the elbow joint just above the hem and draw the upper arm above the forearm.
- Regenerate: a cuff or held item floats with no arm leading to it -> the arm is hidden behind the body or the other arm; pose that arm forward (or fully back) and run `checks/run-checks.py` until `joins` passes.

## 7. Acceptance moments

Demo (`demo/index.html`, the demo kit's painted meadow at dusk, auto spar, 7.2 s loop; `shots/moments.txt`): idle t=400;
sword wind-up t=660; sword slash with swoosh t=740 (spark at the tip, spear flashes); spear hurt t=790; spear coil
t=3220; spear thrust t=3330; mage raises the staff t=5400; bolt in flight from the crystal t=5560; bolt lands t=5720;
key light left / right / off t=1800; walk (characters travel at the walk speed) t=1500 `&anim=walk`. Integrations: hd-sidescroll hero (run, jump,
swing, hurt) and A-14 squad clash (knight, lancer, mage in the side-view clash), both judged: no errors, same end as
the original, manual session ok, module unchanged.
