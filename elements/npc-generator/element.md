# D-03 NPC generator

## What it is

Townsfolk made from a seed. Each person is built from parts: an age (child, adult, elder), a body type (slim, average, stout,
tall; children have their own), a skin tone, a hair style and colour, a top (shirt, tunic, vest, apron, dress, coat, robe),
legs, shoes, a hat (straw hat, cap, kerchief, hood, knitted cap), a face extra (beard, moustache, glasses) and an accessory
(satchel, scarf). A trade (baker, smith, fisher, scholar, lamplighter... 27 of them, with age rules) leans the outfit (bakers
wear aprons and kerchiefs, fishers knitted caps and boots) and gives a one-line description; names are invented from syllables
and nature words. Every part is hand-pixelled in code in one style (1 px ink outline, 5-tone ramps from one base colour per
material, 1 x 2 px eyes, top light), so a crowd varies without looking pasted together. Each person has a 4-frame walk in
four directions. The same seed gives the same person (look, name, trade) everywhere; `crowd(n, seed)` picks people with no
look-alikes. The optional town helper makes them wander a walkable area in 4-direction legs with pauses and a look round,
step round the game's walls and props, each other and the hero, and turn to face whoever talks to them. A talk shows in a
screen-space dialogue panel at the bottom of the view (the top when the speakers stand low), inside the view and clear of the
game's HUD boxes: the person's own pixel portrait (cut from the same seeded front frame, drawn 2x), name, trade and the line,
typed out; in the world only a small speech marker sits over the talker's head.

## Default parameters

| key | default | meaning |
|---|---|---|
| seed | 7 | the town's seed: same seed = same people in the same places |
| count | 6 | townsfolk in the town |
| speed | 22 | walk speed in px per second (world px / scale) |
| scale | 1 | whole-number pixel scale (2 for 40 px tiles); pixels always land on whole device pixels |
| stride | 4 | px walked per walk frame (`frame = floor(walk / stride) % 4`) |
| size | fixed | frame 32 x 44, feet centre at column 16, the ink row under the shoes on row 41 drawn on `feetY`; adults about 24 px from shoes to crown, children about 19, hats up to 28 |
| look-alike | 0.18 | pixel look distance (mean colour difference over the union of two front-facing silhouettes) under which two people count as look-alikes |

## Variants

- **Village** (default): 6 people, unhurried.
- **Busy market**: 14 people, a little faster; the look-alike filter matters most here.
- **HD world**: `scale: 2` for 40 px tiles and 640 px wide views; the pixel art stays crisp on any canvas size.

## Interface

Needs: a walkable `area` and a `blocked(x, y)` test for one world point (the game's own walls, water, houses, props); a call
to `town.update(dt, heroFeet)` in the fixed step (the same function the `?t=` replay runs), not while the world is paused;
the game's depth sort (`drawables(camX, camY)` gives `{y, draw}` with `y` = feet in world px); the talk key, checked after the
game's own targets (`town.talking()` -> `town.release()`, else `town.nearest` then `town.talk(f, hero)`); one call a frame to
`town.panel(ctx, camX, camY, {view, avoid: hudRects})` after the world, in screen space.

Provides: `make(seed, over)`, `crowd(n, seed)`, `create(seedOrSpec)` (`draw`, `rect`, `headTop`, `info`, `check`, `lastDrawn`),
`town(...)` (`update`, `drawables`, `draw`, `nearest`, `talk`, `release`, `talking`, `panel`, `marker`, `panelState`, `rects`,
`state`, `stats`), `panel(...)`, `panelLayout`, `portrait`, `verify`, `raster`, `lookalike`, `text` / `textWidth` (the 5 x 7 pixel font).

## Screen rules

- Pixel art at the game's native resolution, 1 art px = `scale` game px, drawn at a whole number of device pixels per art
  pixel whatever the canvas transform (the module snaps itself; the game never scales or mirrors the sprites).
- Rig: head 10 x 9 (front) / 9 x 9 (side), torso 8 x 6 (slim 6, stout 10, tall 8 x 7, child 6 x 5), legs 2-6 rows, feet 2
  rows; walk frames 0 and 2 are contacts (a foot lifted 2 px front / a 2 px stride side), 1 and 3 passing (body up 1 px).
- Every frame of every person is one alpha-connected piece standing on the foot line, eyes on the side it faces (none
  facing up), never covered; hair always contrasts with skin, clothes and hats never match the skin.
- Two people's feet are never within 14 px side to side AND 22 px front to back (times scale): a person in front would hide
  the one behind. Hard rule every step: nobody steps into that box, and anyone inside it (the hero is not solid and walks
  into people) steps out along the axis that clears it soonest. Townsfolk never stand in `blocked` points nor in the spot a
  speaker is walking to (`talk(..., {at})`).
- Back view: hair down to the nape with one row of neck skin under short hair, lit from the top left, two long strands;
  no face part, no small dark dot or dash on the eye / mouth rows, no bare skin across the back (bald heads excepted).
- Talk panel (screen space): 56 art px tall, the view's width minus 8 px up to 300 art px, centred; 4 px from the bottom
  of the view, or from the top when the bottom panel would touch either speaker (the talker's box includes its marker);
  stepped past every HUD rect the game passes (`avoid`). Inside: a 48 px portrait well (dusk backdrop in three dithered bands,
  a soft light behind the head) holding the talker's head and shoulders, 22 x 22 art px of its own front frame drawn 2x; the
  name in gold, the trade in green, a rule, the line in two rows at most (5 x 7 font, 10 px rows), a bobbing arrow once all
  of it shows. It slides in 6 px and fades in over 0.16 s, the line types at 70 characters a second, it fades out in 0.14 s
  after the talk ends. Everything that moves is a function of the talk's clock, which only `update()` advances (so a
  `?t=&freeze=1` still equals live play).
- Speech marker (world space): a 9 x 7 art px pip with three dots, its tip 2 px over the talker's head, drawn with the
  talker in the depth sort; the dots fill while the line types, then the pip bobs 1 px.
- The talk ends on `release()`, when the player walks `leave` px away (48 x scale) or after `ms`.
- A person the player walked into (feet inside the 14 x 22 box) steps aside to a free spot beside the player before turning,
  so the two speakers never overlap.

## Common mistakes

| symptom | fix |
|---|---|
| Townsfolk inside houses, water or props | `blocked(x, y)` must answer for world points (not tiles or screen px) and include props |
| Feet slide without stepping | the game draws them itself without `walk`: use `drawables()` or pass `moving` and `walk` |
| Townsfolk drawn over the roofs / under the floor | push `drawables()` into the game's depth sort instead of drawing after the world |
| Everyone shifted by the camera twice | the canvas is already translated: pass `0, 0` to `drawables` |
| The panel picks the wrong side or covers the HUD | `town.panel` got a camera without the HUD offset (screen = world - cam), or `avoid` misses the HUD boxes |
| Two dialogue boxes at once | the game's own dialogue was opened for a townsperson too: the panel replaces it |
| The line types on its own in a still / never finishes | `town.update` does not run in the step the `?t=` replay runs, or runs only while a menu is open |
| `?auto=1` ends differently | townsfolk were added to the collision or the talk key took over another target: keep them non-solid and checked last |
| They freeze | `town.update` is not in the fixed step, or it runs only while a menu is open |
| Same faces everywhere | specs made with consecutive seeds by hand: use `crowd(n, seed)` or `town({count})` |
| Blurry or uneven pixels | the canvas was scaled with CSS smoothing or the sprites were drawn with `drawImage` scaling: call `draw` |

## Acceptance moments

| # | still | event it must show (`checks/state.json`, verified at 1280 / 500 / 390 px by `checks/shoot.py`) |
|---|---|---|
| 1 | `?t=2400&freeze=1` | ten generated townsfolk wander the market square in four directions, the mapmaker walks in from the west road |
| 2 | `?t=4983&freeze=1` | 300 ms into the first talk (began 4683 ms): the panel is fully in with the talker's portrait, name and trade, the line still typing; the marker over the talker |
| 3 | `?t=6400&freeze=1` | the first talk, 1.7 s in: both face each other, marker over the talker, the whole line shown, the waiting arrow |
| 4 | `?t=11000&freeze=1` | between talks: the mapmaker crosses the square round the props; townsfolk step round the well, the statue and each other; no panel |
| 5 | `?t=15600&freeze=1` | the second talk (began 14217 ms) |
| 6 | `?t=21000&freeze=1` | the third talk (began 19600 ms) |
| 7 | `?t=26000&freeze=1` | the town register: everyone walking in place and turning through their directions, first name and trade, the whole panel inside the view at 390 / 500 / 1280 |
| 8 | `?t=6400&freeze=1&live=4000` | live play: a player takes over at 4 s and taps the nearest person; the traveller walks to the spot beside them, both face each other, marker and panel shown |

Every moment also checks that no two people stand within the 14 x 22 px box, that the panel lies inside the view and clear
of the HUD plate and both speakers, and that the marker sits over the talker's head (`checks/panelscan.py` checks the same
on every talk of 64 towns at three widths from the canvas pixels, including the portrait pixels).
