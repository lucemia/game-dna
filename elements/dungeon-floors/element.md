# B-12 Procedural dungeon floors

## What it is

A turn-based dungeon crawl on seeded floors. Each floor: rooms placed at random (interiors 4-10 x 3-7 cells, at least 3 cells of rock apart), joined by a minimum spanning tree of corridors plus a few loops, doors or open arches where corridors meet rooms, walls on every rock cell next to an open cell, autotiled in a three-quarter view. Room types (hall, crypt, storeroom, flooded cell, shrine, lair) pick the floor style, decor, torch light, chest chance and monster budget. The start is a random room with no monsters; the stairs are in the room farthest from it by walking distance; the last floor's farthest room is the throne of the boss. The hero steps in 8 directions without cutting corners, bumps monsters to attack, bumps doors, chests and fountains to use them; then every awake monster acts. Field of view by shadowcasting, lit by the lantern and torches; explored cells stay dim, unknown cells black. A bot plays through the same rules. The starter (Lanternfall) is a complete five-floor run.

## Default parameters

| key | default | |
|---|---|---|
| floors | 5 | floors per run, the last holds the boss |
| rooms | 10 | rooms tried per floor |
| loops | 0.25 | extra loop corridors (0 = a pure tree) |
| doors | 0.6 | share of doorways with a real door (blocks sight until opened) |
| density | 1 | monster budget multiplier (area x 0.085 x room budget x (1 + 0.18 per floor below the first)) |
| chests | 1 | chest chance multiplier; every floor has at least one chest |
| light | 6.5 | lantern radius in cells |
| width x height | 46 x 34 | cells |
| fog, minimap | on, on | |
| numbers | on | built-in combat numbers over the defender's cell (off when a number addon draws them) |

Hero: 30 HP, attack 5, armour 1, one tonic (heals 16). XP to the next level 6 + 7 x level: +5 max HP, +1 attack, +1 armour every third level. Hit chance 93 % (monsters 90 %), damage max(1, atk + rand(-1..2) - def), crit 10 % x1.6. One step = 120 ms of animation.

## Variants

- Labyrinth: rooms 16, loops 0.8, 60 x 44.
- Pure tree, no doors: loops 0, doors 0 (every corridor is a bridge; good for teaching).
- Crowded: density 2, chests 1.6.
- Short dive: floors 3, rooms 7.
- Dim lantern: light 4 (torch-lit rooms matter more).

## Interface

Needs: a seed per run; a fixed update step; key / tap input and held direction keys while the dungeon runs; a 2D canvas context and a logical view; a place to go on win / lose. Provides: `create`, `start`, `update`, `drawScene`, `drawUI`, `key`, `pointer`, `setHeld`, `setAuto`; `onHit` on the impact frame (read-only), `onEvent` (`floorStart`, `turn`, `move`, `wake`, `door`, `chest`, `pickup`, `potion`, `heal`, `fountain`, `death`, `levelUp`, `descend`, `end`), `onEnd(result, info)`; `anchor(id)`, `unitRects()`, `uiRects()`, `fieldRect()`, `state()`, `actors()`; `addRoom / addMonster / addItem` (data); `generate()` without an instance. Full API in `module/README.md`; the starter's extension points in `starter/README.md`.

## Screen rules (logical px, 16 px cells)

- Integer device pixels per art pixel: the host picks the logical view from the window (about 460 px wide on desktops, 220 on phones), smoothing off. The HUD is drawn in the same pixels, so its 8 px font is 13+ CSS px on a 390 px phone.
- Wall faces: 4 px cap + 12 px of brick courses (3 rows of 4 px, joints offset), lit 1 px rim on top, dark 1 px base; caps: 2 px rim where they meet floor (lit on the north and west, shaded east and south), outer corners notched, inner corners 2 px marks. Floors under a wall face: 3 px shadow + 2 px half shadow; 2 px shadow by a west wall.
- Light grid: 4 px cells, darkness of a lit cell = (1 - light)^1.5 x 0.78, 6 levels with a 2 x 2 ordered dither; remembered cells 84 % dark blue, unknown 100 % black. Torches: radius 5.2 cells, flicker +-5 %; lantern radius x 1.2 cells.
- Characters: hero 14 x 17 px (4 facings, 4-frame walk advancing every 6 px moved, a sword drawn at the hand: ready, wind-up for the first 35 % of the 230 ms attack, then thrust 9 px toward the target in 8 directions); monsters 14-28 px; flyers 5-7 px above a floor shadow; hoppers lift 5 px per step; eyes on the side they face; light from the top left in both facings (no mirrored art).
- Combat numbers: 8 px font (crits dealt by the hero x2, gold, `N!`), damage white on monsters, red-orange on the hero, `miss` grey, heals `+N` green; one number per hit with the log's value; placed once at the first spot around the defender (above the head in 2 slots, beside the head on the side away from the attacker, beside the body, below the feet) that overlaps no other text and stays closer to the defender than to any other unit (their strikes and walks counted), then a fixed path: rise 6 px in 35 % of their life, fade over the last 30 %, never sideways; it fades out early when its owner steps away or another unit comes closer; the LEVEL UP label (own lane above the number slots; in a crowded fight it goes to the banner lane) and the '!' wake marks are placed by the same rules; a hurt monster's HP bar moves under its feet when it would cover another unit (`bars`); the hero's hit flash is a white rim; hidden while the cell is unseen (checked: `numberLayout`, `numberOwner` 100 % of number-frames owned, `markOwner`, `textOverlap` 0 overlaps over 16 runs, `checks/text-overlap.py` 0 overlaps over the whole starter run at 1280 and 390).
- HUD: stats plate 120 x 29 (96 on phones), bag 74 x 15, floor plate 72 x 15, minimap <= 24 % of the view wide, message log 3 lines bottom left (long messages wrap, never truncated), boss bar 180 x 15 bottom centre; the floor banner sits under the top plates and moves above the log when a character is under it. No two HUD rects overlap at any view size (checked).

## Common mistakes (symptom -> fix)

- Blurry or uneven pixels -> the canvas is scaled by a fraction; choose the logical size so device px per art px is an integer, smoothing off.
- The hero walks through corners or doors diagonally -> moving the hero yourself; send keys through `key()` / `pointer()`, never write `hero.x`.
- Different floor on reload -> no fixed seed, or `Math.random` in your drawing; use `start({seed})` and `rng()`.
- Monsters frozen while a menu is open -> `update()` skipped; call it every step (0 while paused).
- Taps hit the wrong cell -> page px passed; convert to logical px with the canvas rect.
- HUD unreadable on phones -> the whole 460 px view scaled down; pick a ~220 px logical view on narrow screens instead.
- A damage number floats over an unseen monster -> check `anchor(id).hidden` and draw nothing for hidden units.
- A crate wall splits a room -> only happens with your own blocking decor function: mark it with the third decor field and the generator's connectivity pass removes offenders.

## Acceptance moments

Demo (`demo/index.html`, the bot playing seed 7 from the first frame):
- `?t=4300&freeze=1`: a door just opened, a cave bat lunging at the hero (a crit hit at 4283), torchlight and the lantern pool.
- `?t=24800&freeze=1`: a chest bumped open (24717), the coin pop rising over it.
- `?t=43000&freeze=1`: floor 2 starts (42617): the FLOOR 2 / The Mossy Halls banner under the top plates, the start room lit.
- `?t=88200&freeze=1`: floor 3, the shrine fountain used (88100), green heal pluses on the hero.
- `?t=193200&freeze=1`: the throne room of floor 5, the Hollow Crown awake with its boss bar, the hero's critical slash (193133).
- `?t=3000&freeze=1&view=graph`: the whole floor 1 with the spanning tree (gold), loop edges (blue), doors, chests, monsters and the start room.
Starter (`starter/index.html`): `?t=1000&freeze=1` title with the cast; `?t=5100&freeze=1` the first fight (hero hits the bat at 5050); `?t=25900&freeze=1` a chest opened (25717); `?t=44400&freeze=1` the floor 2 banner (43617); `?t=194200&freeze=1` the Hollow Crown fight (194133); `?t=202500&freeze=1` THE CROWN IS BROKEN card. Phone: `?t=5100&freeze=1` at 390 px.
Each moment's event is listed in `checks/state.json` and `checks/moments.py` confirms it from the page's own event log.
- `?auto=1` reaches THE CROWN IS BROKEN with no errors; a hero that only waits never wins.
