# B-12 starter: Lanternfall (procedural dungeon floors)

`index.html` is a complete single-file dungeon crawler. A wanderer with a lantern goes down five seeded floors (the Upper Cellars, the Mossy Halls, the Drowned Crypts, the Ember Deep) to the Hollow Crown on its throne. Step in eight directions, bump monsters to fight them, bump doors and chests to open them, drink tonics, find the stairs. Kill the Hollow Crown to win; at 0 HP the lantern goes out. All art is drawn in code at 1 art px = 1 logical px; the logical view is chosen from the window so that every art pixel is a whole number of device pixels (about 460 px wide on a desktop, 220 px on a phone). The UI is in English.

It is the system element of a basket. Build your game from this file and plug addons and new content into the extension points below rather than editing the run flow.

## Run

| URL / key | Effect |
|---|---|
| `?auto=1` | the computer plays the whole run (it explores, fights, opens chests, drinks tonics and takes the stairs through the same rules a player uses) |
| `?t=<ms>&freeze=1` | fast-forward the deterministic 60 Hz simulation (autoplay on unless `&auto=0`), draw one frame; `<html data-state>` then holds `GAME.state()`, `window.__frozen` is true |
| `?seed=n`, `?floors=n`, `?fog=off`, `?minimap=off`, `?numbers=off`, `?reduced=1` | run seed, floors per run, no fog, no minimap, no built-in combat numbers, no shake / flash |
| arrows / WASD, numpad 7 9 1 3 or Home PgUp End PgDn | step (hold to keep walking; two arrows held = a diagonal) |
| Space, `.`, numpad 5, Z | wait a turn (Z also starts the run and leaves the end screen) |
| Q, M, P | drink a tonic, the floor map, toggle autoplay (any other game key takes over from autoplay) |
| tap / click | a cell next to the hero: step or attack; farther: walk there over explored cells; the tonic plate: drink; the floor plate or minimap: map |

Under 760 px wide a touch pad (8 directions, wait, Tonic, Map, Auto) shows under the canvas. A run under `?auto=1` with seed 7 takes about 200 s of game time and wins (the bot wins about 9 runs in 10 over seeds 1-60); a player who only waits never wins.

## Structure

Four `<script>` blocks, in order:

1. `GameDNA_DungeonFloors`: `module/dungeon-floors.js`, verbatim. It owns the floors, the rules, the monsters, sight, drawing, the HUD and the bot.
2. The game. It defines `window.GAME` and boots on `DOMContentLoaded`.
3. **ADDONS SLOT**: an empty, marked block where addons and new content go.

The game script has numbered sections (search for the `=== n.` banners):

| # | Section | What is there |
|---|---|---|
| 1 | Config and content | URL flags, `ROOMS` / `MONSTERS` / `ITEMS` (added to the module's built-ins), `PARAMS` |
| 2 | Game object | `game` (= `window.GAME`): the public surface and extension points |
| 3 | Run setup | `makeInstance()` (one `GameDNA_DungeonFloors.create(...)`), `newRun()` |
| 4 | Hit site | `hitSite(hit)`: the starter's hurt shake / flash and boss-kill shake, then the addons' `onHit` |
| 5 | Scenes | title, play, victory, defeat; `sceneAuto()` |
| 6 | Main tick | `tick()`: input chain -> held keys -> scene autoplay -> `C.update()` -> effects -> addons' `update` |
| 7 | Drawing | `render()`: `C.drawScene` -> `draw(g, 'fx')` -> flash -> `C.drawUI` -> scene panels -> `draw(g, 'overlay')` -> `drawUI(g)`; `fit()` picks the logical view |
| 8 | Input | key queue (a 0 ms tap counts), pointer taps, `GAME.held` |
| 9 | Boot | `boot()` after the ADDONS SLOT (waits for `GAME.holdBoot()` releases): `?t` fast-forward or the main loop; `GAME.step(n)`, `GAME.render()`, `GAME.press(key)` for tests; `window.__state()` |

`C.update()` runs on every tick of every scene. Never gate it on a menu or an animation.

## Extension points

**Where addons and content go: the ADDONS SLOT.** Paste each addon's module and its `GAME.addons.push(...)`, and every `GAME.addRoom / addMonster / addItem`, into the marked `<script>` block (or put `<script src>` tags right above it). The slot runs after `window.GAME` exists and **before the game boots**, so addons and content are there for the first floor and every `?t=&freeze=1` fast-forwarded frame.

```js
GAME.addons.push({
  name: 'my-addon',
  onHit(hit, game) {},             // every attack (hero or monster) on its impact frame (read-only, see 1)
  onKey(key, game) { return false; },   // key = 'up' | ... | 'downright' | 'wait' | 'ok' | 'potion' | 'map' | 'back' | 'auto' | {tap, x, y}; true consumes it
  update(game, info) {},           // every 60 Hz frame, every scene, also while frozen; info = {dt, frozen, paused, hitStop}
  draw(g, layer, game) {},         // layer 'fx' (play: after the dungeon, its light and fog, before the HUD) or 'overlay' (after every panel)
  drawUI(g, game) {},              // top UI hook: after everything, every scene
  onFloorStart(ev, game) {}, onPickup(ev, game) {}, onDeath(ev, game) {}, onEvent(ev, game) {},
  onEnd(result, info, game) {}, onScene(scene, game) {}, onNewGame(game) {}
});
```

1. **Hit site.** The module rolls the hit, writes the new HP, then calls `onHit`; the starter adds its own feedback and forwards to the addons (`hitSite`, section 4).
   - `hit = {kind: 'damage', source ('hero' or a monster id), target, attacker, defender (monster kind or 'hero'), raw, amount (HP actually lost, 0 on a miss), hpBefore, hpAfter, killed, crit, miss, x, y (world px)}`.
   - **Read-only.** Change outcomes through content (monster stats, items): it runs inside the rules, so the bot and the turn order see it.
   - The module draws its own combat numbers (`GAME.params.numbers`, default `'on'`): damage, crits, misses and heals over the defender's cell. An addon that draws numbers from `onHit` sets `GAME.params.numbers = 'off'` in the ADDONS SLOT so they are not drawn twice. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha = 0.3)` (both skipped under reduced motion; `GAME.flags.builtinShake / builtinFlash` turn the starter's own off), `GAME.hitStop(frames)` / `GAME.hitStopMs(ms)` (freezes the dungeon; it only delays it).
2. **Draw-effects slot.** `draw(g, 'fx', game)` runs during play on the logical context (`GAME.view()` = `{w, h, scale}`), inside the shake translate, after `C.drawScene` (tiles, monsters, hero, the module's effects, light and fog), before the HUD. Positions: `GAME.anchor(id)` (screen px, the camera already applied). `draw(g, 'overlay', game)` runs after every panel in every scene.
3. **UI rects: `GAME.uiRects()`.** `[{name, x, y, w, h}]` in logical px: the module's `stats`, `bag`, `floor`, `minimap`, `boss`, `log`, `banner`, `map` (as drawn last frame) plus the starter's `endBox`. `GAME.fieldRect()` is the whole view (it changes with the window: read it, never hard-code it). Place things inside it and outside these rects.
4. **Unit anchor: `GAME.anchor(id)`** (live) -> `{x, top, left, w, h, cy, footY, dead, hidden, tile}` in logical px for `'hero'` or a monster (`'m12'`): where it is drawn now, incl. hops, flight and the HP bar over a hurt monster; `hidden` = not in sight (draw nothing for it). Anchors answer while a monster fades out. `GAME.unitRects()` lists the hero and every visible monster with `id` and `kind`.
5. **Input chain.** Keys and taps are queued; each tick every key (and every tap as `{tap, x, y}`) goes to the addons' `onKey` in array order; the first that returns `true` consumes it. Otherwise `auto` toggles autoplay, any other key during autoplay hands control to the player, then the scene handles it (play: `GAME.C.key` / `GAME.C.pointer`). **`GAME.held`** (`{ArrowLeft: true, ...}` by `KeyboardEvent.key`) is maintained by keydown / keyup only and feeds `C.setHeld`.
6. **Autoplay.** `GAME.autoplay.on` (`?auto=1`, P). The module's bot acts between beats through the real rules (about one action per step animation). Addons must not consume direction keys, `wait` or `ok` during autoplay unless they mean to: the `?t=` stills rely on it.
7. **World clock.** `GAME.clock = {frame, playFrame, paused, stop}`. `GAME.pause(true)` stops the dungeon; `GAME.hitStop` freezes the next frames. Addons' `update(game, info)` runs every frame: `info.dt` = 16.67 ms, or 0 while frozen.
8. **Run events.** `onFloorStart(ev)` per floor (`ev.floor`, `ev.rooms`, `ev.monsters`, `ev.items`, `ev.start`, `ev.stairs`); `onPickup(ev)`; `onDeath(ev)`; `onEvent(ev)` for every rules event (`turn`, `move`, `wake`, `door`, `chest`, `potion`, `heal`, `fountain`, `levelUp`, `descend`, `end`, ...); `onEnd(result, info)`.
9. **Content.** In the ADDONS SLOT (or section 1), formats in `../module/README.md`:
   - `GAME.addRoom(id, def)`: a room type (weight, floors, floor style, decor list, monster budget, chest chance, light colour).
   - `GAME.addMonster(id, def)`: a monster (built-in look with its own palette, or your own `draw`); it is placed by the room budgets on the floors `minFloor`-`maxFloor`.
   - `GAME.addItem(id, def)`: an item for chests and the floor (`effect` = heal, gold, reveal, atk, def, maxHp; `carry: true` goes to the bag).
   - The tables are also readable and editable as `GAME.rooms`, `GAME.monsters`, `GAME.items`, `GAME.params`. `GAME.shipped` lists the ids this file ships with.

`GAME.C` (the module instance, API in `../module/README.md`), `GAME.scene`, `GAME.lastEnd` and `GAME.state()` are readable.

## Adding damage numbers (e.g. C-11 damage-pop)

```js
GAME.params.numbers = 'off';                                         // C-11 draws the numbers instead of the module
const dp = GameDNA_DamagePop.create({ bounds: () => GAME.fieldRect(),
  getAnchor: id => GAME.anchor(id),                                   // live position; keeps answering while a monster fades
  getObstacles: () => GAME.unitRects().concat(GAME.uiRects()), onHitStop: ms => GAME.hitStopMs(ms) });
GAME.addons.push({ name: 'damage-pop',
  onHit(hit) { if (hit.miss) dp.spawn(hit.target, 0, 'miss'); else if (hit.amount > 0) dp.spawn(hit.target, hit.amount, hit.crit ? 'crit' : 'damage'); },
  update(game, info) { dp.update(info.dt); }, draw(g, layer) { if (layer === 'fx') dp.draw(g); }, onFloorStart() { dp.clear(); } });
```

The camera follows the hero, so a number stays where it popped on the screen while the view slides; that reads fine for the short life of a number.

## Adding a room type, a monster and an item

```js
GAME.addRoom('grotto', { name: 'Fungal Grotto', weight: 3, floor: 'moss', decor: [['shrooms', 0.12], ['moss', 0.1], ['rubble', 0.02]], budget: 1, chest: 0.3, light: '#7affd0' });
GAME.addMonster('toad', { name: 'Cave Toad', look: 'slime', palette: { main: '#7a8a34', light: '#c0d060', dark: '#2e3a14', eye: '#1a1008' },
  hp: 11, atk: 3, def: 0, xp: 4, speed: 1, sight: 6, cost: 2, minFloor: 1, maxFloor: 3 });
GAME.addItem('glowcap', { name: 'Glow Cap', look: 'potion', color: '#5ae0b0', effect: { heal: 8 }, weight: 4 });
```
