# loot-beams.js (E-19 module, v1.0.3)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_LootBeams`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it.

It makes **loot drops**: a defeated foe or an opened chest pops items that **arc out** (with a ground shadow), **land with a bounce** on free ground, then show a **light beam in the rarity colour**, a **glowing outline** and a small **name tag** ("12 Gold", "Moonstone Ring"). When the player comes within reach, an item **flies to the player** (only with a clear line, never through a wall) and is **picked up exactly once** with a flash; your game gets `onPickup(drop)`. Rarities, items and drop tables are plain data you can edit.

- **Never in walls, never off the map.** Before an item leaves, its landing spot (with the item's radius) and the whole flight path are tested against your `solid(x, y)`; a blocked throw tries other angles and distances, and a source inside a wall (a chest tile, a foe pressed into a wall) rises from the nearest free spot. With `tile` the path test walks every tile it crosses (exact).
- **Beam lanes stay clear.** No item lands inside another item's beam (the column above a beamed item, beam half-width + item radius wide), and a beamed item never lands with its beam over another item, so a common pile never reads as legendary. The landing search widens (rings up to ~4.6x the throw) before it gives up a lane; when a crowded field leaves no clear lane, the beam stops just below the feet of the item standing in it (the drawn beam never contains another item).
- **Tags never cover a character (`avoid`), another item's icon or a pickup line**; a tag over an item that just landed under it hides at once; a tag under a line that just appeared hides at once, like under a window. `popRects()` lists the lines.
- **Pickup feedback**: a burst in the rarity colour (rank-sized ring and streaks; sparkles for legendary) and a `+12 Gold` / `+Moonstone Ring` line rising over the player's head in the rarity colour, queued in three lines so a burst of pickups never overlaps; the picked item's tag is gone within 2 frames.
- **Name tags never overlap** each other or your HUD rects, stay inside the view, keep off the sprite boxes you pass in `avoid` and off other items. They are laid out in `update()`, glide to a new slot (or crossfade when the way is blocked), every moved tag draws a leader line from its edge to the icon's outline (slots whose leader would cross another icon are avoided), keep a minimum time shown and hidden, and appear only for items on screen.
- **Deterministic**: own seeded random numbers, a fixed 60 Hz inner step, no wall clock. `update(0)` changes nothing (except hiding tags under a window that just opened), so `?t=<ms>&freeze=1` stills equal play.
- **Two looks**: crisp whole pixels with built-in shaded pixel icons and a bitmap font on native pixel canvases (view width <= 480 or `render: 'pixel'`); smooth shaded icons, soft beams and system-font tags on HD canvases. You may pass a painted icon atlas.

The module never reads input and never changes your game: what a pickup gives is up to your `onPickup`.

## API

`GameDNA_LootBeams.create(options)` returns an instance.

| option | meaning |
|---|---|
| `seed` | Integer. Same seed + same calls = same drops. |
| `scale` | World px per unit: about `viewHeight / 360` (1 for 640x360, 0.58 for a 208 px tall map view). Sizes, distances and speeds below are given at scale 1. |
| `solid(x, y)` | `true` where loot may not be: walls, water, trees, solid props. **World px.** |
| `tile` | Your tile size when `solid` is a tile test (exact path test). Optional. |
| `bounds` | `{x, y, w, h}` world rect of the map. Loot never lands or flies outside it. |
| `keepOut()` | World rects where loot must not land (the chest itself, a doorway, an NPC). Optional. |
| `player()` | `{x, y, h}`: the player's **feet** in world px and sprite height (for the pickup flash). `null` = nobody to pull to. |
| `camera()` | `{x, y}`: the world point at the view's top-left. |
| `view` | `{x, y, w, h}`: where the world shows, in the space `drawTags` draws in (e.g. `{x: 0, y: 0, w: 256, h: 208}` under a 16 px HUD bar when you draw inside a `translate(0, 16)`). |
| `uiRects()` | Your HUD boxes now (bars, quest text, open windows), same space as `view`. Tags never touch them. |
| `avoid()` | Sprite boxes `{x, y, w, h}` in **world px** (player, NPCs, foes). Tags never cover them (a tag a character walks into hides at once, like under a window). Optional. |
| `occluders()` | World rects of what is drawn over the ground pass: tall props, standing characters. An item's icon never lands behind one. Optional. |
| `onPickup(drop)` | An item reached the player: `{id, item, name, label, rarity, count, kind, x, y, data}`. Called once per item, from `update()`. |
| `onLand(drop)` | An item landed. Optional. |
| `rarities`, `items`, `tables` | Your own data (see below); defaults built in. |
| `icons` | Optional painted atlas `{image, cell, keys: [...]}` (an `Image`, square cells left to right, top to bottom). An item whose `icon` is in `keys` draws from it; others use the built-in icons. |
| `uiScale` | Number or function: tag size multiplier. 0 = auto (pixel canvases: whole native pixels, the same world size at every screen width). |
| `params` | `magnet` 56 (pull radius), `pick` 10 (pickup radius), `tags` `'all'` \| `'uncommon'` \| `'rare'` \| `'off'`, `beams` `'uncommon'` (lowest rarity with a beam; `'all'`, `'rare'`, `'epic'`, `'off'`), `beamHeight` 1, `distance` 1 (throw), `bounce` 1, `settle` 300 (ms on the ground before the magnet), `life` 0 (ms before resting loot fades; 0 = stays), `maxTags` 14, `cap` 120 (items alive; the oldest resting common one makes room), `speed` 1, `sparkle` 1, `render` `'auto'` \| `'pixel'` \| `'smooth'`, `uiScale` 0. |

| method | |
|---|---|
| `drop(x, y, table, {dx, dy, spread, power, z, data})` → drops | Roll a table (`'foe'`, `'elite'`, `'chest'`, `'boss'` or your own object) and throw the items from the world point `(x, y)` (the source's **feet**). Or pass a list of specs `[{item, rarity, count, name, data}]` to throw exactly those. `dx, dy` aim the throw (default: all around), `spread` radians (1.6), `power` distance multiplier, `z` start height (px above the ground). Call it **once**, on the frame the foe dies or the chest opens. |
| `roll(table)` → specs | Roll without throwing (to merge with your own drops). |
| `update(dtMs)` | **Once per fixed step**, after your world moved. `update(0)` while the world is stopped (menus, dialogue, pause, battle screen). |
| `drawGround(ctx, camX, camY)` | Shadows, beams, landing rings and resting items: **after the floor, before your sprites**. World px minus `camX, camY` (pass `0, 0` inside your own camera translate). |
| `draw(ctx, camX, camY)` | Flying items and pickup flashes: **after your sprites**. Paints the ground pass itself if `drawGround` was not called. |
| `drawTags(ctx)` | Name tags, in the `view` space with `camera()`: **outside any camera translate, before your HUD**. |
| `collect({radius})` → n | Pull every resting item with a clear line to the player (end of a fight, a "gather" key). |
| `pickNear(x, y, r)` → drop | Pick the nearest resting item now (a manual pickup key). |
| `clear()` | Remove all loot (new game, level change). |
| `popRects()` | The pickup lines on screen now (view space): other overlays may avoid them. |
| `list()`, `tagRects()`, `lastDrawn()`, `rects()`, `audit()`, `stats()`, `hash()`, `setParams(p)`, `params()` | Live items `{id, label, rarity, state: fly/rest/magnet/drop, x, y, z}`; tag rects (view space, `ghost: true` = fading crossfade copy); `rects()` = tag boxes for other overlays; `audit()` = live items inside `solid` or off the map (must stay 0); counters; a hash for determinism tests. |

`GameDNA_LootBeams.rarities`, `.items`, `.tables`, `.rollTable(table, rnd, items, rarities)`, `.makeRng(seed)`, `.renderIcon(key, px, pixel)`, `.icons` (built-in icon keys: coins, potion, shard, sword, shield, ring, gem, scroll, amulet, key).

## Data format

```js
rarities: [ { id: 'common', name: 'Common', color: '#e9e4d8', weight: 60, beam: 0 },      // beam: height factor, 0 = none
            { id: 'rare', name: 'Rare', color: '#4fa8ff', weight: 10, beam: 1 }, ... ],   // lowest first
items: { ring: { icon: 'ring', names: { uncommon: 'Silver Ring', rare: 'Moonstone Ring' } },   // the rarities it can roll at
         gold: { icon: 'coins', names: { common: 'Gold' }, count: [3, 12], kind: 'gold' } },     // count: stack size
tables: { foe: { rolls: [0, 1], gold: { chance: 0.75, count: [2, 8] } },
          chest: { rolls: [2, 3], gold: { chance: 1, count: [10, 24] }, luck: 1.5, guarantee: 'uncommon', pool: ['ring', 'gem'] } }
```

A roll picks a rarity with probability `weight x luck^index` (or the table's own `weights: {id: w}`), the first roll at least `guarantee`, then an item from `pool` (default: every item but gold) that has a name at that rarity (none: the nearest lower rarity that has one). `kind: 'manual'` items are never pulled by the magnet.

## Integration example (generic)

```js
const loot = GameDNA_LootBeams.create({ seed: 1, scale: VIEW_H / 360, tile: TILE, solid: (x, y) => isWall(x, y),
  bounds: { x: 0, y: 0, w: MAP_W, h: MAP_H }, player: () => ({ x: hero.x, y: hero.feetY, h: HERO_H }),
  camera: () => ({ x: cam.x, y: cam.y }), view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, uiRects: () => hudBoxes(),
  avoid: () => spriteBoxes(), occluders: () => tallPropBoxes().concat(spriteBoxes()), onPickup: d => d.kind === 'gold' ? gold += d.count : bag.push(d.name) });
function onFoeDefeated(f) { loot.drop(f.x, f.feetY, 'foe', { z: 12 }); }     // once
function onChestOpened(c) { loot.drop(c.x, c.y + 8, 'chest', { dx: 0, dy: 1, spread: 3 }); }
function newGame() { loot.clear(); /* ... */ }
// fixed step, last:
loot.update(worldRunning ? STEP_MS : 0);
// render:
drawFloor(); loot.drawGround(ctx, cam.x, cam.y); drawSprites(); loot.draw(ctx, cam.x, cam.y);
loot.drawTags(ctx); drawHud();
```

## Common mistakes

| symptom | fix |
|---|---|
| Loot lands in walls or in the water | `solid` got screen px (camera subtracted) or misses water / props; world px. `audit()` must stay 0. |
| Loot appears at a corner or drifts with the camera | positions in screen px, or the camera applied twice (inside a translate and as `camX`). |
| Loot hangs in the air during a dialogue and is gone after it | correct: the world is stopped (`update(0)`); it lands when play resumes. |
| Never picked up | `player()` returns the sprite's top-left or screen px: give the feet in world px; or `update` is not called in that scene. |
| Picked up twice / gold doubled | you also kept your old pickup code for the same drop; one or the other. |
| Tags on the HUD or a window | that box is missing from `uiRects()`, or `uiRects` / `view` are in another space than `drawTags` draws in. |
| Tags cover the hero | pass `avoid()` with the sprite boxes. |
| `?auto=1` ends differently | pickups change the game (gold, XP); keep rewards the same as before or say why they differ. |

## Self-check without a browser

- The module file is byte-identical and loads before `create`; every callback identifier exists when first called.
- `drop` is called once per defeat / chest, at the source's feet in world px; the old drop and pickup code for the same items is gone (not doubled).
- `update` runs once per fixed step in every scene, also during `?t=` fast-forward and autoplay; `update(0)` while stopped.
- `drawGround` between floor and sprites, `draw` after sprites, `drawTags` outside the camera translate and before the HUD; `view`, `uiRects` and `drawTags` share one space.
- `clear()` on new game / restart.
