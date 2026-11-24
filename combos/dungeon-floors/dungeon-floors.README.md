# dungeon-floors.js (B-12 module, v1.1.3)

One plain script, no dependencies, no `import`/`export`, ASCII only. It defines one global, `GameDNA_DungeonFloors`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the whole dungeon loop: seeded floor generation, the turn rules, the monsters' AI, field of view and fog, all drawing (tiles, sprites, light, HUD, minimap), and a bot. Your game keeps its own scenes and tells the module where to draw.

## What it does

- **Floors** (`generate`): random rooms (interiors 4-10 x 3-7, at least 3 cells of rock apart), a minimum spanning tree over the room centres plus a few loop edges among each room's 3 nearest neighbours, corridors found by A* between door cells on facing walls (4-way, straight runs preferred, never through another room's wall ring), walls on every rock cell next to an open cell, doors (a real door that blocks sight until opened, or an open arch), the start in a random room, the stairs in the room farthest by walking distance, room types by weight, decor per room type, torches on north wall faces, chests, loose items, monsters by a per-room budget (area x density x room budget x depth). The last floor has no stairs: its farthest room is the throne room of the boss. Blocking props (crates, barrels, urns) are dropped if they would split a room or wall anything off.
- **Turns**: the hero steps in 8 directions (no corner cutting, never diagonally through a doorway). Bumping a monster attacks it, a chest opens it, a closed door opens it, a fountain heals once. A step into a wall costs nothing. Then every awake monster acts (speed 2 = twice, 0.5 = every other turn): attack if adjacent, otherwise step down a walking-distance map toward the hero (erratic ones sometimes step at random). Sleeping monsters wake when they are in sight. Moves animate together; attacks play one after another (beats); input is read only between beats.
- **Combat**: hit roll (hero 93 %, monsters 90 %), damage `max(1, atk + rand(-1..2) - def)`, crits x1.6. XP to next level `6 + 7 x level`: +5 max HP, +1 attack, +1 armour every third level.
- **Sight**: recursive shadowcasting (walls, rock and closed doors block), lit cells only (lantern radius, torch light, glows), explored cells remembered dim, unknown cells black. Monsters are drawn only on visible cells.
- **Drawing**: 16 px tiles in a three-quarter view (wall faces with brick courses, caps with rims, outer and inner corners, floor shadows under walls), five floor styles, 11 decor kinds, animated torches, doors (face or top view), stairs, chests, items, a fountain; a hooded hero with four facings, a 4-frame walk and a sword (held ready, raised on the wind-up, thrust at the target on the strike); six monster looks (slime, ember and spore hop, bat flies, wisp and crown glide) with an attack pose, eyes on the side they face, light from the top left in both facings; combat numbers, slashes, sparks, smoke, pick-up pops, level-up rays; a throne in the boss room; a 4 px light grid with ordered dithering and a warm glow; HUD with HP / XP bars, tonics, gold, floor plate, minimap, boss bar, a message log that wraps long lines, floor banner, full map (M).

## API

`GameDNA_DungeonFloors.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | `{x, y, w, h}` in your logical px: where the dungeon is drawn. Any size >= 64 px; the game rules do not depend on it (same seed = same game at any size). Change it with `setView`. |
| `seed` | Default seed for `start()`. |
| `params` | See the table below. |
| `rooms`, `monsters`, `items` | Extra or overriding table entries (formats below). The built-ins stay. |
| `auto` | Start with the bot on. |
| `onHit(hit)` | Every attack resolution on its impact frame, after HP was written: `{kind: 'damage', source, target ('hero' or 'm12'), attacker, defender (kind or 'hero'), raw, amount (HP actually lost), hpBefore, hpAfter, killed, crit, miss, x, y}` (`x, y` in world px). Read-only. |
| `onEvent(ev)` | `floorStart {floor, floors, seed, rooms, monsters, items, start, stairs}`, `turn`, `move {id, x, y, from}`, `wake`, `door`, `chest`, `pickup {item, from, effect}`, `potion`, `heal {amount}`, `fountain`, `death {id, monster, xp, boss}`, `levelUp {level, hpGain}`, `descend`, `end {result}`. |
| `onEnd(result, info)` | Once per run: `'win'` (boss dead) or `'lose'` (hero at 0 HP); `info = {floor, floors, turns, kills, gold, level, by}`. |

| param | default | meaning |
|---|---|---|
| `floors` | 5 | Floors per run; the last holds the boss. |
| `width`, `height` | 46, 34 | Map size in cells. |
| `rooms` | 10 | Rooms tried per floor (3-30). |
| `loops` | 0.25 | Chance scale for extra loop corridors (0 = a pure tree). |
| `doors` | 0.6 | Share of doorways that get a real door (the rest are open arches). |
| `density` | 1 | Monster budget multiplier. |
| `chests` | 1 | Chest chance multiplier (every floor has at least one). |
| `light` | 6.5 | Lantern radius in cells. |
| `fog` | on | `off` shows the whole floor lit. |
| `minimap` | on | Corner minimap (hidden on views under 300 x 200, and while a character stands under it). |
| `numbers` | on | The module's combat numbers (damage white / red on the hero, crit `N!` large gold, `miss`, heal `+N` green), one per hit with the value the log prints, placed once in world space at the first free spot around the defender (above the head in 2 slots, beside the head, beside the body, below the feet) that overlaps no other text and is closer to the defender than to any other unit (counting their strikes), then on a fixed path (a 6 px rise and a fade, never sideways); it fades out early when its owner steps away or another unit comes closer to it; hidden on unseen cells. The LEVEL UP label and the '!' wake marks are placed by the same rules (LEVEL UP goes to the banner lane when no spot near the hero is free), so no two texts ever overlap. A hurt monster's HP bar is drawn under its feet when over its head it would cover another unit. Turn off when your own number system (e.g. C-11) draws them from `onHit`. |
| `moveMs` | 120 | Length of one step (animation only). |
| `heroHp`, `heroAtk`, `heroDef`, `potions` | 30, 5, 1, 1 | Hero at the start of a run. |

| method | |
|---|---|
| `start({seed, floor})` | A new run (floor 1 unless given). |
| `update(ms)` | Every fixed step. `0` while your world is frozen. Beats, animation, the bot and the camera all run on this clock only. |
| `drawScene(ctx)` | Tiles, props, monsters, hero, effects, light and fog, HP bars over hurt monsters. Your effects go after it. |
| `drawUI(ctx)` | HUD, minimap, boss bar, message log, banner, full map, floor fade. |
| `key(k)` | `'up' 'down' 'left' 'right' 'upleft' 'upright' 'downleft' 'downright' 'wait' 'ok' 'potion' 'map' 'back'`, or `{tap: true, x, y}`. Queues up to 2. |
| `pointer('down', x, y)` | A tap in your logical px: a cell 1 step away = step / attack there, farther = walk there over explored cells (stops when a monster shows up), the hero = wait, the bag plate = tonic, the floor plate or minimap = map. |
| `setHeld({up, down, left, right})` | Held direction keys, every step; after 170 ms the hero keeps walking (two held = diagonal). |
| `setAuto(on)`, `auto()` | The bot (plays through the same rules a player uses). |
| `setView(v)`, `setParams(o)` | Change the view or parameters (sight is recomputed). |
| `addRoom(id, def)`, `addMonster(id, def)`, `addItem(id, def)` | New content; used from the next generated floor. |
| `anchor(id)` | `{x, top, left, w, h, cy, footY, dead, hidden, tile}` in your logical px where `'hero'` or a monster (`'m12'`) is drawn now (incl. hop / flight and a monster's HP bar). Keeps answering while a monster fades out. |
| `unitRects()` | The hero and every visible living monster: `{id, kind, x, y, w, h}`. |
| `uiRects()` | HUD rects drawn last frame `{name, x, y, w, h}` (`stats`, `bag`, `floor`, `minimap`, `boss`, `log`, `banner`, `map`). |
| `fieldRect()` | The view. |
| `state()` | `{seed, floor, floors, turn, phase ('play' / 'won' / 'lost'), result, hp, maxHp, atk, def, level, xp, gold, potions, hero {x, y}, kills, chests, monsters, seen, explored (%), busy, map, auto}`. |
| `actors()` | Text state for checks: the hero and visible monsters `{id, x, y, facing, target, vx, tile, noFace}` (logical px). |
| `say(text, color)`, `logLines()`, `numbers()`, `texts()` | Add a log line; the log lines as drawn; the combat numbers as drawn `{key, id, text, style, amt, tile, x, y, w, h, a, covers, cx0, tier, kill}` (world px); every text drawn over the field this frame (numbers, LEVEL UP, wake marks, the floor banner's lines) `{kind, text, x, y, w, h, a}` in view px, for overlap checks. |
| `map()`, `hero()`, `monsters()`, `monster(id)`, `chests()`, `items()`, `doors()`, `features()`, `explored()`, `visibleAt(x, y)`, `phase()`, `idle()`, `toScreen(cx, cy)`, `camera()`, `drawOverview(ctx, rect, {all, graph, s})`, `rng()` | Read-outs. `rng()` is a seeded stream for your own effects (never `Math.random`). |

Globals: `GameDNA_DungeonFloors.generate({seed, floor, floors, params, rooms, monsters, items})` (a floor as plain data, no instance), `ROOMS`, `MONSTERS`, `ITEMS`, `DEFAULTS`, `TILES` (`ROCK 0, FLOOR 1, WALL 2, DOOR 3, STAIRS 4`), `text(ctx, s, x, y, {color, align, outline})` and `measure(s)` (the 8 px pixel font), `drawHero`, `drawMonster`, `drawItem`, `wallPiece`, `bfs`, `fov`.

### Content formats

```js
// room type: picked by weight among those allowed on this floor
{ name: 'Crypt', weight: 2.2, minFloor: 1, maxFloor: 5, maxPerFloor: 1, floor: 'tile' /* 'flag' | 'tile' | 'brick' | 'moss' | {base, light, dark, gap} */,
  decor: [['urn', 0.06], ['bones', 0.05]] /* [kind or draw(ctx, x, y, tMs, v), density, blocks?] */, budget: 1.15, chest: 0.25, light: '#9ab8ff', feature: 'fountain' }
// monster: built-in look or your own draw(ctx, x, footY, {t, facing, frame, flash, scale})
{ name: 'Bog Slime', look: 'slime' /* slime | ember | bat | spore | wisp | crown */, palette: { main, light, dark, eye }, hp: 9, atk: 3, def: 0, xp: 3,
  speed: 1 /* 2 | 0.5 */, erratic: 0, sight: 6, cost: 2, minFloor: 1, maxFloor: 3, boss: false, size: 1 }
// item: effect applies on pick-up; carry: true goes to the bag (tonics)
{ name: 'Ember Shard', look: 'shard' /* potion | coins | scroll | shard | heart */, color: '#ff8a3a', effect: { heal, gold, reveal, atk, def, maxHp }, carry: false, weight: 1.4, minFloor: 1, loose: false }
```
Built-in decor kinds: `rubble`, `bones`, `moss`, `puddle`, `cobweb`, `urn`, `crate`, `barrel` (the last three block), `candles`, `shrooms` (animated).

## Integration (15 lines)

```js
// <script src="dungeon-floors.js"></script> before your game script
const df = GameDNA_DungeonFloors.create({
  view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, seed: 7,                 // your logical canvas
  onHit: hit => { /* sounds, numbers: hit.target, hit.amount, hit.crit, hit.miss */ },
  onEvent: ev => { /* banners, sounds */ },
  onEnd: (result, info) => { /* your win / lose screen, once */ }
});
df.start({ seed: 7 });                                                  // when your dungeon mode starts
function step(dt) { df.setHeld(heldArrows()); df.update(frozen ? 0 : dt); }   // every fixed step, fast-forwards too
function render() { ctx.imageSmoothingEnabled = false; df.drawScene(ctx); /* your effects */ df.drawUI(ctx); }
onKeyDown(k => df.key(MAP[k]));                                         // arrows, numpad diagonals, wait, potion, map
onTap((x, y) => df.pointer('down', x, y));                              // logical px, not page px
// autoplay: df.setAuto(true)
```

Draw at an integer number of device pixels per logical pixel (pick the logical view size from the window, e.g. ~220 px wide on phones, ~460 on desktops) so the 1 px art stays sharp; the HUD is drawn in the same logical pixels and stays readable on phones that way.
