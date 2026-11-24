# raycast-dungeon.js (K-03 module, v1.3.1)

One plain script, no dependencies, no `import` / `export`, ASCII only. It defines one global, `GameDNA_RaycastDungeon`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it.

It owns a whole first-person grid dungeon run: seeded floors (rooms, maze corridors, loops, doors, torches, a stair arch) or floors from data, the turn rules (step, turn, strike, wait, tonic; then every awake monster moves or attacks), monster AI, the 3D view (a DDA raycaster with textured walls, cast floors and ceilings, torch light, distance fog, billboard monsters and items hidden by walls column by column), the hero's sword, HUD, minimap, message log, floor banner, combat labels, the full map and a bot that plays through the same rules. All art is made in code at load time (64 x 64 textures, 64-80 px billboards with idle, wind-up, strike and hurt frames). Your game keeps its scenes and tells the module where to draw.

## API

`GameDNA_RaycastDungeon.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | `{x, y, w, h}` in your logical px: the module's whole area. The bottom 26 px (30 below 300 px wide) is the HUD strip, the rest is the 3D view (`fieldRect()`). Draw on a canvas with an integer number of device px per logical px, smoothing off; about 420 logical px wide on desktops, 200 on phones. |
| `seed` | Run seed (also per `start({seed})`). Same seed + same inputs = same run, at any view size. |
| `params` | See below. |
| `enemies`, `items`, `maps` | Your content tables (merged over the built-ins; formats below). |
| `onHit(hit)` | Every attack on its impact frame, after HP changed (read-only): `{kind: 'damage', source ('hero' or a monster id), target, attacker, defender (monster kind or 'hero'), raw, amount (HP lost, 0 on a miss), hpBefore, hpAfter, killed, crit, miss, x, y (world cells)}`. |
| `onEvent(ev)` | `floorStart` `{floor, floors, name, theme, last, enemies: [kinds], items: [ids], start, stairs, map}`, `turn`, `move` `{id, from, x, y}`, `attack`, `wake`, `door`, `death` `{id, enemy, boss}`, `pickup` `{item}`, `potion`, `heal` `{amount}`, `levelUp` `{level, hpGain}`, `descend`, `end`. |
| `onEnd(result, info)` | Once per run: `'win'` (the boss fell) or `'lose'` (the hero fell); `info = {floor, floors, level, kills, gold, turns, hp}`. |

| param | default | meaning |
|---|---|---|
| `floors` | 3 | Floors per run; the last holds the boss. |
| `size` | 15 | Generated floor size in cells (odd, 11-25). |
| `rooms` | 4 | Rooms per generated floor. |
| `loops` | 0.12 | Extra corridor loops (0-1). |
| `doors` | 0.5 | Share of room openings with a door. |
| `density` | 1 | Monster budget (0-3). |
| `loot` | 1 | Item budget (0-3). |
| `torches` | 1 | Torch count multiplier (0-2). |
| `themes` | `['cellar', 'moss', 'ember']` | Theme per floor. |
| `fov` | 76 | Horizontal field of view, degrees. |
| `eyeBack` | 0.32 | How far behind the cell centre the eye sits (frames a monster in the next cell whole). |
| `fog` | 0.24 | Fog density per cell. |
| `lantern` | 4.5 | Lantern reach in cells. |
| `stepMs`, `turnMs` | 170, 150 | Step and turn tweens. |
| `startPotions` | 2 | Tonics at the start. |
| `minimap` | `'on'` | `'off'` hides it. |
| `numbers` | `'on'` | Built-in combat labels (damage, crit, MISS, heal). `'off'` when your game or an addon draws its own from `onHit`. |

| method | |
|---|---|
| `start({seed})` | A new run from floor 1. |
| `update(ms)` | Every fixed step (16.67 ms), `0` while your world is frozen. Never skip it during play. |
| `drawScene(ctx, {weapon})` | The 3D view, the sword (`weapon: false` leaves it out, e.g. behind a title screen), hurt vignette, hit-direction marks and the floor fade, into `fieldRect()`. |
| `drawUI(ctx)` | HUD strip, minimap, message log, floor banner, combat labels, full map. |
| `key(k)` | `'up'` (forward), `'down'` (back), `'left'` / `'right'` (turn 90 degrees, free), `'strafeleft'` / `'straferight'`, `'attack'` (also `'ok'`), `'wait'`, `'potion'`, `'map'`. Queued (max 2), so a 0 ms tap counts. |
| `pointer('down', x, y)` | Logical px: minimap = map, tonic icon = drink, left / right fifth of the view = turn, monster in front = strike, else lower fifth = back, else forward. |
| `setHeld({up, down, left, right})` | Held keys repeat their action whenever the hero is free. |
| `setAuto(on)`, `auto()` | The bot. |
| `setView(rect)`, `setParams(obj)` | Resize; live params (view params apply at once, floor params on the next floor). |
| `fieldRect()` | The 3D view rect. |
| `uiRects()` | `[{name, x, y, w, h}]`: `hud`, `minimap`, `log`, `banner`, `map` (when shown). |
| `unitRects({pad})` | `[{id, kind, x, y, w, h}]`: `'hero'` (the sword at the lower right) and every visible monster (its billboard box over the columns where it is in front of the walls, clipped to the view), each grown by `pad` px. Pass all of them (with a pad) to anything that places text near characters. |
| `anchor(id)` | `{x, top, left, w, h, cy, footY, dead, hidden, depth}` where a monster (`'e12'`) is drawn now; `top` is raised over any other living monster standing over it on screen, so things placed above it clear them both; `hidden` = not in view (draw nothing for it). Answers while a monster crumbles (1.2 s). `'hero'` (the camera) anchors at a small spot above the HUD beside the HP numbers. |
| `labels()` | Built-in labels on screen `[{id, owner, text, kind, x, y, w, h}]`. |
| `weaponRect()`, `weaponOverlap(rect)`, `faceBox(id)` | The sword's opaque box this frame, its opaque pixels inside a rect, a monster's face box (upper 42 %, middle 60 % of its billboard). |
| `addEnemy(id, def)`, `addItem(id, def)`, `addMap(id, def)` | Content, used from the next floor. |
| `hero()`, `enemies()`, `enemy(id)`, `items()`, `map()`, `explored()`, `camera()`, `phase()`, `turn()`, `floor()`, `busy()`, `state()`, `actors()`, `hash()`, `rng()` | Read-only views; `rng()` is the run's seeded random for content code. |

Statics: `ENEMIES`, `ITEMS`, `THEMES`, `LOOKS`, `PALETTES`, `text(ctx, s, x, y, {color, outline, align})` and `measure(s)` (the 7 px pixel font), `drawSprite(ctx, id | def, x, footY, scale, pose)`, and the pure pieces `generateFloor`, `parseMap`, `castColumns`, `renderView`, `project`, `spriteFor`, `itemSprite`, `buildLightMap`, `bfs`, `CELL`.

## Content formats

A game that records its built-in ids to tell new content apart (like the starter's `GAME.shipped`) must take that record before any content is added and keep it read-only.


- **Monster** `{name, look: 'slime' | 'bat' | 'knight' | 'king', palette, hp, atk, def, xp, speed (1 = one action per turn, 1.5, 2), sight (cells), evade (0-0.5), acc (0-1), erratic (0-1, random steps), weight, minFloor, maxFloor, boss, size (world height), lift (flyers), draw(P, pose, kit)}`. `palette` recolours a built-in look: slime / king `{ramp: [7 colours dark to light], pupil: [r, g, b]}`, bat `{ramp: [5], wing: [5]}`, knight `{bone: [5], eye: [r, g, b]}`. Or give `draw(P, pose)` to paint your own 64 x 64 frame (`P.ell`, `P.poly`, `P.line`, `P.set`; poses `idle0`, `idle1`, `wind`, `strike`, `hurt`; feet on the bottom rows; the module adds the outline). A `boss: true` monster stands in the farthest room of the last floor.
- **Item** `{name, look: 'flask' | 'coins' | 'amulet', color, effect: {heal, gold, atk, def, maxHp}, carry, weight, minFloor, maxFloor}`. `carry: true` with `heal` goes to the tonic count; other heals apply at once.
- **Map** `{floor, name, theme, rows: [...], legend, last}`: replaces the generated floor `floor`. `#` wall, `T` torch, `B` banner, `D` door (walls on both sides across the passage), `S` stair arch (a wall cell; walking into it goes down), `.` floor, `^ > v <` start and facing, `e` a monster picked by floor, `i` an item, `K` the boss, other characters through `legend: {g: {enemy: 'id'}, p: {item: 'id'}}`. The border is closed for you; every floor cell must be reachable from the start.

## Integration (15 lines)

```js
// <script src="raycast-dungeon.js"></script> before your game script
const rd = GameDNA_RaycastDungeon.create({ view: { x: 0, y: 0, w: VIEW_W, h: VIEW_H }, seed: 7,
  params: { floors: 3, numbers: 'on' },
  onHit: hit => playSound(hit.miss ? 'whiff' : 'hit'),                 // read-only
  onEnd: (result, info) => showResultScreen(result === 'win', info) });   // once
rd.start({ seed: 7 });                                                    // where your game starts this mode
function step() {                                                         // your fixed 60 Hz step (fast-forwards too)
  rd.setHeld({ up: held.ArrowUp, down: held.ArrowDown, left: held.ArrowLeft, right: held.ArrowRight });
  rd.update(frozen ? 0 : 1000 / 60);
}
function render() { rd.drawScene(ctx); /* your effects */ rd.drawUI(ctx); /* your overlays */ }
onKey(k => rd.key({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', z: 'attack', ' ': 'wait', c: 'potion', m: 'map' }[k]));
onTap((x, y) => rd.pointer('down', x, y));                               // logical px
if (autoplay) rd.setAuto(true);
```

## What it guarantees

- **No fisheye:** wall height uses the distance to the camera plane, so a flat wall has a straight top and bottom at every angle (`checks/core.mjs` fisheye).
- **No gaps:** one DDA ray per screen column; every pixel is a wall, door, floor or ceiling at any angle, position, door state and view width (`gaps`).
- **Correct occlusion:** billboards are drawn column by column against the wall depth: a monster half behind a corner shows exactly the visible half (`occlusion`).
- **Hits read:** a hit monster flashes a solid white silhouette for 3 updates, then holds an opaque hurt pose; a miss shows `MISS` and the monster sidesteps; a strike leaves a thin tapered arc along the tip's path, apart from the blade, fading over 3 frames; the hero's hurt shows a red edge, a dip of the sword and a mark on the side the blow came from. No character is ever drawn see-through.
- **Weapon view:** the sword scales with the view (its box is 58 % of the view height and at most 60 % of its width) and never covers the face of the nearest monster (`checks/screen.py` weapon).
- **No seam ahead:** floor and ceiling textures are offset a quarter cell, so no grout line runs along the eye's centre line (`core.mjs` seam).
- **Labels stay clear:** built-in labels (on a small dark plate) sit above or beside their owner (the hero's beside the HP numbers above the HUD; a monster's miss beside that monster), never touch a monster, the sword, the HUD, minimap, log or banner, never leave the view, glide instead of jumping and are never shown twice.
- **Rules:** floors connected, stairs reachable, no monster within 4 steps of the start, moves of one cell onto free cells, HP adds up. Deterministic: no `Math.random`, no wall clock; anchors, labels and the explored map come from `update`, so `?t=&freeze=1` stills match play.
- Never throws from `update`, `drawScene`, `drawUI` or your callbacks (warns once).
