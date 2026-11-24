# K-03 Raycast dungeon

## What it is

A first-person grid dungeon crawler drawn by raycasting. The hero stands in a cell and looks along one of four directions; a step forward, back or aside moves one cell, a turn rotates 90 degrees, both with smooth tweens (170 / 150 ms). Walking into a monster strikes it, walking into a door opens it (it slides aside in the middle of its cell), walking into the stair arch goes down a floor. Every step, strike, wait or tonic is a turn; turning is free. After each turn every awake monster moves one step along the shortest path or attacks if it stands next to the hero (wind-up, strike, impact, recover). The last floor holds a boss; killing it wins the run, falling to 0 HP loses it.

The view is a DDA raycaster: one ray per screen column, wall height from the distance to the camera plane (so there is no fisheye and there are no gaps), 64 x 64 textures made in code, floors and ceilings cast per pixel, a light map from torch walls, the hero's lantern and distance fog. Monsters and items are billboards scaled by distance and drawn column by column against the wall depth buffer, so walls hide them correctly. The eye sits 0.32 cells behind the cell centre so a monster in the next cell is framed whole. The module also draws the first-person sword, a HUD, a minimap, a full map, a message log, a floor banner and combat labels, and plays itself with a bot through the same rules.

## Default parameters

floors 3, size 15 cells, rooms 4, loops 0.12, doors 0.5, density 1, loot 1, torches 1, fov 76 degrees, eyeBack 0.32 cells, fog 0.24 per cell, lantern 4.5 cells, stepMs 170, turnMs 150, startPotions 2, minimap on, numbers on. Hero: 34 HP, attack 5, defence 0; level up at 10 / 26 / 48 / 78 / 120 XP (+6 max HP, +1 attack). Tonic heals 14. Hit chance 90 % minus the monster's evade, crit 12 % (x1.5, rounded up), damage max(1, attack + 0..2 - defence).

## Variants

Labyrinth (size 23, rooms 2, doors 0.8), Dark (fog 0.42, lantern 3), Wide angle (fov 90), Crowded (density 2), One deep floor (floors 1, size 21). Themes per floor: Root Cellars (brick, beams), Moss Halls (mossy stone), Ember Vault (basalt with glowing seams, cinder floor). Floors may come from data (rows of characters) instead of the generator.

## Interface

Needs: a seed, a fixed 60 Hz step (`update(stepMs)`, 0 while frozen), keys / taps routed in (`key`, `pointer`, `setHeld`), a 2D context and a logical view rect, a place to go on `onEnd`. Optional content as data (`addEnemy`, `addItem`, `addMap`).
Provides: `onHit` on each impact frame (read-only), `onEvent` (floorStart, turn, move, attack, wake, door, death, pickup, potion, heal, levelUp, descend, end), `onEnd(result, info)`; `anchor(id)`, `unitRects()`, `uiRects()`, `fieldRect()`, `labels()`, `actors()`, `state()`, `hash()`; the pure `castColumns` / `renderView` / `generateFloor` / `parseMap` for tools. The starter Hollowstair adds the ADDONS SLOT, `GAME.addons` hooks and `GAME.shipped`.

## Screen rules

- Logical view about 420 px wide on desktops, 200 px on phones, each logical px a whole number of device px; the HUD strip is 26 px (30 px under 300 px wide), the 3D view is the rest.
- The 7 px pixel font is at least 10 CSS px tall at every width (14 at 390 px, 21 at 1280 px).
- Walls: one ray per column, perpendicular distance; every pixel of the view is wall, door, floor or ceiling.
- Billboards: frontal, feet on the floor line (flyers 0.36 cells up, bobbing 0.03); a pixel is drawn only where the billboard is nearer than the wall in that column.
- Weapon view: box 58 % of the view height (width cap 40 % of the view width), lower right; its opaque pixels never touch the face box of the nearest visible monster. A strike adds a thin tapered arc (alpha 0.85, fading over 50 ms after the blade passes), apart from the blade.
- Floor and ceiling textures are offset 0.25 cell so no grout line lies on the eye's centre line.
- Hit: 3 updates of a solid opaque white silhouette, then the opaque hurt pose for 260 ms; death: hurt pose, then an ordered pixel dissolve over 600 ms. Never an alpha blend of a character.
- Miss: `MISS` in pale blue beside the monster and a 0.22-cell sidestep and back (280 ms); a monster's miss shows `MISS` beside that monster (above the HUD when it is out of view) and sways the sword.
- Labels on a dark plate: above the owner's box first, then right, then left (the hero's: above the HUD beside the HP numbers); inside the 3D view with a 1 px margin; never touching a monster, the sword, the HUD, minimap, log, banner or map; offset from the owner glides at most 6 px per frame; a label that would have to cross something ends instead; never shown twice; life 900 ms (crit 1050), fade in the last 160 ms.
- Stair arch (128 x 128): every tread below the eye line (the texture's middle), so the stair drops away; a small cold-lit doorway far below.
- A label ends (120 ms fade) when its monster winds up to attack or is gone.
- A felled monster crumbles for 1.2 s and keeps its cell meanwhile (no monster steps into it), so a killing-blow number stays over its own body.
- Starter title: the four monsters and their names in one row when they fit by measured width, else two rows of two (phones); nothing overlaps (`checks/screen.py` title).
- Minimap in the top right of the view (3 px cells, 2 px on phones); the log in the top left never runs under it; the floor banner sits at 30 % of the view height for 2.7 s.

## Common mistakes

- Walls bow outwards when turning -> the ray length was used instead of the perpendicular distance; use the module's columns, never your own.
- Thin black lines between wall slices or at the floor line -> columns skipped or rounded apart; draw `drawScene` at the view size, do not scale its buffer by a fraction.
- A monster shows through a wall corner -> it was drawn as one sprite over the view; let the module draw monsters (per-column depth).
- The monster in front has no feet / fills the screen -> `eyeBack` set to 0; keep about 0.3.
- Monsters freeze while a menu is open -> `update()` skipped; call it every step (0 while frozen).
- Different floors every reload -> no fixed seed; content code must use `rd.rng()`, not `Math.random`.
- Two sets of damage numbers -> an addon draws numbers too: pass `numbers: 'off'`.
- Tiny text on phones -> a fractional scale or a desktop-sized logical view; pick about 200 logical px across.

## Acceptance moments

Starter Hollowstair, seed 7 (`checks/state.json`, verified by `checks/moments.py`; none is a flash frame):

1. `?t=2000&freeze=1`: floor 1 starts: banner over the Root Cellars, facing down the longest corridor.
2. `?t=20220&freeze=1`: the hero's strike has landed: the slime holds its opaque hurt pose, 7 on a plate above it.
3. `?t=20440&freeze=1`: the slime winds up (squashed, brows down).
4. `?t=20645&freeze=1`: the slime strikes: lunge, -4 above the HUD beside the HP numbers, red edge.
5. `?t=23780&freeze=1`: the hero swings and misses the bat: MISS above it, the blade mid-swing with its thin swept arc.
6. `?t=27575&freeze=1`: the stair arch up close: lit stone doorway, treads lit and risers dark going down and away.
7. `?t=28800&freeze=1`: floor 2 starts: banner over the Moss Halls.
8. `?t=83420&freeze=1`: a Grave Knight winds up, sword over its head.
9. `?t=107540&freeze=1`: a critical hit on a Grave Knight: opaque hurt pose (a flinch), 12! beside it.
10. `?t=118090&freeze=1`: a hit on the Mire King: hurt pose, the crown above its eyes, 10 above it.
11. `?t=125000&freeze=1`: the victory card.
