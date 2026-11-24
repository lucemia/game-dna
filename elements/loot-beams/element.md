# E-19 Loot drops with rarity beams

## What it is

When a foe falls or a chest opens, its loot bursts out: each item arcs through the air with a shadow on the ground, lands with a short bounce and settles on open ground. Items of uncommon rarity and better send up a soft light beam in their rarity colour (green, blue, purple, gold), every item glows with a rarity-coloured outline and carries a small name tag ("12 Gold", "Moonstone Ring"). When the player comes within reach, the item flies to them along a clear line and is picked up with a burst in its colour; the game is told once per item. What a drop contains comes from editable data: rarities with weights, items with the rarities they can roll at, and drop tables with rolls, luck and a guaranteed minimum.

## Default parameters

| key | default | meaning |
|---|---|---|
| magnet | 56 | pull radius in px at scale 1 (world px x `scale`); 0 = manual pickup only |
| pick | 10 | pickup radius |
| beams | uncommon | lowest rarity with a beam (`all`, `uncommon`, `rare`, `epic`, `off`) |
| tags | all | lowest rarity with a name tag (`all`, `uncommon`, `rare`, `off`) |
| distance | 1 | throw distance multiplier (20-42 px x scale) |
| bounce | 1 | bounce height and length (0 = lands flat) |
| beamHeight | 1 | beam height multiplier |
| settle | 300 | ms an item rests before the magnet may take it |
| render | auto | `pixel` when the view is 480 px wide or less, else `smooth` |

Rarity table (default): Common 60 (no beam), Uncommon 25, Rare 10, Epic 4, Legendary 1. Tables: `foe` 0-1 rolls + gold 75 %, `elite` 1-2 rolls, luck 1.3, `chest` 2-3 rolls, luck 1.5, at least uncommon, `boss` 3-4 rolls, luck 2, at least epic. Luck multiplies the weight of rarity *i* by luck^*i*.

## Variants

- **Action RPG** (default): beams from uncommon, every item tagged, magnet 56.
- **Rare-only spotlight**: beams from rare, tags from uncommon: commons sparkle quietly.
- **Vacuum** (horde survival): magnet 120, short throws, beams only for epic and up, tags from rare.
- **Manual pickup**: magnet 0, a key calls `pickNear(x, y)`; or per item `kind: 'manual'` (gear that should be chosen).

## Interface

Needs (all from the game): its own wall / water test in world px (and tile size), the map bounds, the player's feet in world px, the camera and the view rect, every HUD box and open window (`uiRects`), sprite boxes to keep tags off (`avoid`), one `drop()` call where a foe dies or a chest opens, a fixed step calling `update(dt)` (0 while the world is stopped), a ground pass between floor and sprites, a pass after sprites and a tag pass before the HUD.

Provides: `onPickup(drop)` exactly once per item (the game decides what it gives: gold, XP, bag items), `onLand`, `rects()` of the tags for other overlays, `list()`, `audit()`, `stats()`, `hash()`.

## Screen rules

- Throw: 20-42 px x scale (x `distance`), flight 320-580 ms, peak height 16 px + 0.3 x distance (x scale), then a bounce of 30 % of the flight time at 24 % height and a settle hop; the item squashes horizontally while spinning (no rotation of the art).
- Landing: never where the icon would sit behind an occluder (tall props, standing characters: `occluders()`); the spot keeps the item radius (8 px x scale + 1) clear of walls in 8 directions and 18 px x scale from other items when it can; the whole ground path from source to final rest is clear (exact tile walk with `tile`); a blocked source rises from the nearest free spot.
- Beam: height (58 + 30 x beam) x beam x scale px (uncommon ~57, rare 88, epic 122, legendary 165 at scale 1), width (13 + 6 x beam) x 2 px, white core, colour body, soft halo, five motes rising, a pulse of +-14 %, a ground glow; drawn under the sprites (it never covers a character). Pixel look: stepped 1 px columns in 5 bands, a dotted ground ring.
- Outline: rarity colour, a soft glow on HD, a 1 px silhouette on pixel canvases. Icons: 24 px x scale (HD), 12 native px (pixel).
- Magnet: only with a clear line from item to player; accelerates to 560 px/s x scale; the item rises to 35 % of the player's height; any wall on the next step drops it where it is.
- Beam lanes (crowded fields: the beam is cut just below the feet of any item in its column; the landing search first widens to rings up to ~4.6x the throw): no item rests inside another beamed item's lane (beam half-width + item radius each side, from the beam top to the foot), and a beamed item's lane never covers another item.
- Pickup flash: 420 ms in the rarity colour (white only at the tiny centre), ring and 8 + 2 x rank streaks scaled by rank, sparkles for legendary; pixel: a 16-dot ring >= 10 native px wide. Pickup line: `+N Name` in the rarity colour over the head, 700 ms, three queued lines. The picked item's tag disappears within 2 frames.
- Name tags: 10.5 px bold system font x ui scale on HD (17 px tall plates), the 5-row bitmap font on pixel canvases (9 px plates), rarity-coloured text and accent; above the item first, then higher, beside, below, with a leader line from the tag edge to the icon outline whenever moved (slots whose leader crosses another icon are avoided); never over another tag, a character's sprite box, another item's icon, a pickup line, a HUD rect or outside the view; glide at most ~2.4-3.8 px per step, otherwise crossfade (old copy fades out while the new fades in); at least 1.1 s hidden before a hidden tag returns; only items on screen get tags; at most 14 at once (rarest first).

## Common mistakes

| symptom | fix |
|---|---|
| Loot in walls or water, or stuck at the map corner | `solid` / drop points in screen px; world px, with water in `solid`. `audit()` stays 0. |
| Loot slides with the camera | camera applied twice (inside a translate and as `camX`); pass 0, 0 inside the translate. |
| Gold or XP counted twice | the old pickup code still runs for the same drop. |
| Items never fly to the player | `player()` gives the sprite top-left or screen px; or `update()` not called in that scene. |
| Tags over the HUD or a dialogue | that rect missing from `uiRects()`, or `uiRects` / `view` in another space than `drawTags`. |
| Tags cover the hero | `avoid()` not passed. |
| Loot freezes in mid-air during a dialogue | intended: the world is stopped (`update(0)`); it lands when play resumes. |
| `?auto=1` ends differently | rewards now arrive on pickup; keep them the same or report the difference. |

## Acceptance moments

| # | still | event it must show (`checks/state.json`, verified by `checks/shoot.py`) |
|---|---|---|
| 1 | HD `?t=2050&freeze=1` | `drop` from slimeA: gold and a Keen Blade in flight with ground shadows, the slime fading |
| 2 | HD `?t=6400&freeze=1` | `land` of a legendary: the cache's items on free ground clear of the boulders, rare / epic / legendary beams, tags clear of each other, the items, the knight and the HUD panel |
| 3 | HD `?t=9700&freeze=1` | `pickup` after `collect`: the knight faces the loot centroid (his target in the state text), the field flies to him, rarity-coloured bursts and `+N` lines, HUD counts rising |
| 4 | pixel `?look=pixel&t=2850&freeze=1` | `drop` from the slime: three items arcing, one toward the pond (it lands on the shore) |
| 5 | pixel `?look=pixel&t=4470&freeze=1` | `pickup` of the 6 Gold: ring burst, `+6 Gold` over the hero, HUD gold 6, no tags left from the picked items |
| 6 | pixel `?look=pixel&t=8600&freeze=1` | `land` of a legendary from the opened chest: none on the wall or the chest, beams, bitmap tags with leader lines clear of the hero and the HUD bar |
