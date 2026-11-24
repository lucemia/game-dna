# K-03 starter: Hollowstair (raycast dungeon)

`index.html` is a complete single-file first-person dungeon crawler. A wanderer with a lantern goes down three seeded floors (the Root Cellars, the Moss Halls, the Ember Vault) to the Mire King. Step and turn on the grid, strike what stands in front of you, walk into doors to open them, drink tonics, walk into the stair arch to go down. Kill the Mire King to win; at 0 HP the lantern goes out. The 3D view is raycast by the module at 1 art px = 1 logical px; the logical view is chosen from the window so that every art pixel is a whole number of device pixels (about 420 px wide on a desktop, 200 px on a phone). All art is drawn in code. The UI is in English.

It is the system element of a basket. Build your game from this file and plug addons and new content into the extension points below rather than editing the run flow.

## Run

| URL / key | Effect |
|---|---|
| `?auto=1` | the computer plays the whole run (it explores, fights, picks up items, drinks tonics and takes the stairs through the same rules a player uses) |
| `?t=<ms>&freeze=1` | fast-forward the deterministic 60 Hz simulation (autoplay on unless `&auto=0`), draw one frame; `<html data-state>` then holds `GAME.state()`, `window.__frozen` is true |
| `?seed=n`, `?floors=n`, `?fov=deg`, `?fog=x`, `?minimap=off`, `?numbers=off`, `?reduced=1` | run seed, floors per run, field of view, fog density, no minimap, no built-in combat labels, no shake / flash |
| Up / W, Down / S | step forward / back (hold to keep walking) |
| Left / Q, Right / E | turn 90 degrees (free: monsters do not act) |
| A, D (numpad 7 9) | step aside |
| Z, Enter | strike the cell in front (also starts the run and leaves the end screen) |
| Space, `.`, numpad 5 | wait a turn |
| C, M, P | drink a tonic, the floor map, toggle autoplay (any other game key takes over from autoplay) |
| tap / click the view | left or right fifth: turn; a monster in front: strike; lower fifth: step back; else step forward; the minimap: map; the tonic icon: drink |

Under 760 px wide a touch pad (step left, forward, step right, turn left, back, turn right, Attack, Tonic, Map, Auto) shows under the canvas. A run under `?auto=1` with seed 7 takes about 120 s of game time and wins (the bot wins about 9 runs in 10 over seeds 1-20); a player who only waits never wins.

## Structure

Three `<script>` blocks, in order:

1. `GameDNA_RaycastDungeon`: `module/raycast-dungeon.js`, verbatim. It owns the floors, the rules, the monsters, the 3D view, the HUD and the bot.
2. The game. It defines `window.GAME` and boots on `DOMContentLoaded`.
3. **ADDONS SLOT**: an empty, marked block where addons and new content go.

The game script has numbered sections (search for the `=== n.` banners):

| # | Section | What is there |
|---|---|---|
| 1 | Config and content | URL flags, `ENEMIES` / `ITEMS` / `MAPS` (added to the module's built-ins), `PARAMS` |
| 2 | Game object | `game` (= `window.GAME`): the public surface and extension points |
| 3 | Run setup | `makeInstance()` (one `GameDNA_RaycastDungeon.create(...)`), `newRun()` |
| 4 | Hit site | `hitSite(hit)`: the starter's hurt shake / flash, strike and boss-kill shakes, then the addons' `onHit` |
| 5 | Scenes | title, play, victory, defeat; `sceneAuto()` |
| 6 | Main tick | `tick()`: input chain -> held keys -> scene autoplay -> `C.update()` -> effects -> addons' `update` |
| 7 | Drawing | `render()`: `C.drawScene` -> `draw(g, 'fx')` -> flash -> `C.drawUI` -> scene panels -> `draw(g, 'overlay')` -> `drawUI(g)`; `fit()` picks the logical view |
| 8 | Input | key queue (a 0 ms tap counts), pointer taps, `GAME.held` |
| 9 | Boot | `boot()` after the ADDONS SLOT (waits for `GAME.holdBoot()` releases): `?t` fast-forward or the main loop; `GAME.step(n)`, `GAME.render()`, `GAME.press(key)` for tests; `window.__state()` |

`C.update()` runs on every tick (with 0 outside the play scene and while frozen). Never gate it on a menu or an animation.

## Extension points

**Where addons and content go: the ADDONS SLOT.** Paste each addon's module and its `GAME.addons.push(...)`, and every `GAME.addEnemy / addItem / addMap`, into the marked `<script>` block (or put `<script src>` tags right above it). The slot runs after `window.GAME` exists and **before the game boots**, so addons and content are there for the first floor and every `?t=&freeze=1` fast-forwarded frame.

```js
GAME.addons.push({
  name: 'my-addon',
  onHit(hit, game) {},             // every attack (hero or monster) on its impact frame (read-only, see 1)
  onKey(key, game) { return false; },   // key = 'up' | 'down' | 'left' | 'right' | 'strafeleft' | 'straferight' | 'ok' | 'wait' | 'potion' | 'map' | 'auto' | {tap, x, y}; true consumes it
  update(game, info) {},           // every 60 Hz frame, every scene, also while frozen; info = {dt, frozen, paused, hitStop}
  draw(g, layer, game) {},         // layer 'fx' (play: after the 3D view and the sword, before the HUD) or 'overlay' (after every panel)
  drawUI(g, game) {},              // top UI hook: after everything, every scene
  onFloorStart(ev, game) {}, onTurn(ev, game) {}, onPickup(ev, game) {}, onDeath(ev, game) {}, onEvent(ev, game) {},
  onEnd(result, info, game) {}, onScene(scene, game) {}, onNewGame(game) {}
});
```

1. **Hit site.** The module rolls the hit, writes the new HP, then calls `onHit`; the starter adds its own feedback and forwards to the addons (`hitSite`, section 4).
   - `hit = {kind: 'damage', source ('hero' or a monster id), target ('hero' or a monster id), attacker, defender (monster kind or 'hero'), raw, amount (HP actually lost, 0 on a miss), hpBefore, hpAfter, killed, crit, miss, x, y (world cells)}`.
   - **Read-only.** Change outcomes through content (monster stats, items): it runs inside the rules, so the bot and the turn order see it.
   - The module draws its own combat labels (`GAME.params.numbers`, default `'on'`): damage, crits, MISS and heals, beside their owner. An addon that draws numbers from `onHit` sets `GAME.params.numbers = 'off'` in the ADDONS SLOT so they are not drawn twice. Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha = 0.3)` (both skipped under reduced motion; `GAME.flags.builtinShake / builtinFlash` turn the starter's own off), `GAME.hitStop(frames)` / `GAME.hitStopMs(ms)` (freezes the dungeon; it only delays it).
2. **Draw-effects slot.** `draw(g, 'fx', game)` runs during play on the logical context (`GAME.view()` = `{w, h, scale}`), inside the shake translate, after `C.drawScene` (the 3D view with its light, fog and billboards, the sword), before the HUD. Positions: `GAME.anchor(id)` (screen px). `draw(g, 'overlay', game)` runs after every panel in every scene.
3. **UI rects: `GAME.uiRects()`.** `[{name, x, y, w, h}]` in logical px: the module's `hud`, `minimap`, `log`, `banner`, `map` (as laid out this frame) plus the starter's `endBox`. **`GAME.fieldRect()`** is the 3D view (the whole canvas minus the HUD strip; it changes with the window: read it, never hard-code it). Place things inside it and outside these rects.
4. **Unit anchor: `GAME.anchor(id)`** (live) -> `{x, top, left, w, h, cy, footY, dead, hidden, depth}` in logical px for a monster (`'e12'`): its billboard box as drawn now (clipped to the view; it grows as it comes closer); `hidden` = not in view (draw nothing for it). `'hero'` is the first-person camera: its anchor is the sword at the lower right. Anchors answer while a monster dissolves. `GAME.unitRects({pad})` lists the hero (sword) and every visible monster (the part in front of the walls) with `id` and `kind`, each grown by `pad` px; `GAME.C.enemies()` lists all monsters.
5. **Input chain.** Keys and taps are queued; each tick every key (and every tap as `{tap, x, y}`) goes to the addons' `onKey` in array order; the first that returns `true` consumes it. Otherwise `auto` toggles autoplay, any other key during autoplay hands control to the player, then the scene handles it (play: `GAME.C.key` / `GAME.C.pointer`). **`GAME.held`** (`{ArrowUp: true, ...}` by `KeyboardEvent.key`) is maintained by keydown / keyup only and feeds `C.setHeld`.
6. **Autoplay.** `GAME.autoplay.on` (`?auto=1`, P). The module's bot acts between animations through the real rules. Addons must not consume direction keys, `wait` or `ok` during autoplay unless they mean to: the `?t=` stills rely on it.
7. **World clock.** `GAME.clock = {frame, playFrame, paused, stop}`. `GAME.pause(true)` stops the dungeon; `GAME.hitStop` freezes the next frames. Addons' `update(game, info)` runs every frame: `info.dt` = 16.67 ms, or 0 while frozen.
8. **Run events.** `onFloorStart(ev)` per floor (`ev.floor`, `ev.name`, `ev.theme`, `ev.enemies`, `ev.items`, `ev.start`, `ev.stairs`); `onTurn(ev)` after every monster phase; `onPickup(ev)`; `onDeath(ev)`; `onEvent(ev)` for every rules event (`move`, `attack`, `wake`, `door`, `potion`, `heal`, `levelUp`, `descend`, `end`, ...); `onEnd(result, info)`.
9. **Content.** In the ADDONS SLOT (or section 1), formats in `../module/README.md` ("Content formats"):
   - `GAME.addEnemy(id, def)`: a monster (a built-in look `slime`, `bat`, `knight`, `king` with its own `palette`, or your own `draw(P, pose)`); placed on floors `minFloor`-`maxFloor` by `weight`.
   - `GAME.addItem(id, def)`: an item lying on the floors (`effect` = heal, gold, atk, def, maxHp; `carry: true` with heal adds a tonic).
   - `GAME.addMap(id, def)`: a hand-made floor (`floor: n` replaces generated floor n; rows of characters).
   - The tables are also readable and editable as `GAME.enemies`, `GAME.items`, `GAME.maps`, `GAME.params`.
   - **`GAME.shipped` is read-only**: the ids this file ships with, recorded before the ADDONS SLOT (tests use it to tell your new content from the built-ins). Never add your ids to it; every read returns a fresh copy, so writes change nothing.

`GAME.C` (the module instance, API in `../module/README.md`), `GAME.scene`, `GAME.lastEnd` and `GAME.state()` are readable.

## Adding damage numbers (e.g. C-11 damage-pop)

```js
GAME.params.numbers = 'off';                                         // C-11 draws the numbers instead of the module
const dp = GameDNA_DamagePop.create({ bounds: () => GAME.fieldRect(),
  getAnchor: id => GAME.anchor(id),                                   // live billboard box; keeps answering while a monster dissolves
  getObstacles: () => GAME.unitRects({ pad: 6 }).concat(GAME.uiRects()),   // EVERY visible monster + the sword (with ids, 6 px margin) + HUD, minimap, log, banner
  onHitStop: ms => GAME.hitStopMs(ms) });
GAME.addons.push({ name: 'damage-pop',
  onHit(hit) { if (hit.miss) dp.spawn(hit.target, 0, 'miss'); else if (hit.amount > 0) dp.spawn(hit.target, hit.amount, hit.crit ? 'crit' : 'damage'); },
  update(game, info) {
    dp.update(info.dt);
    // a number whose monster has left the view (the camera turned) or crumbled away would stay on that screen spot and sit on
    // whatever walks there next: end the numbers as soon as one of their monsters is hidden or gone
    if (dp.count() && dp.lastDrawn().some(n => n.target !== 'hero' && (!GAME.anchor(n.target) || GAME.anchor(n.target).hidden))) dp.clear();
  },
  draw(g, layer) { if (layer === 'fx') dp.draw(g); }, onFloorStart() { dp.clear(); }, onScene() { dp.clear(); } });
```

The hero is the camera, so numbers for the hero go to the sword's anchor at the lower right; a monster right in front fills much of the view, so numbers go above or beside its box. Pass all of `GAME.unitRects({pad})` (not only the target) and the UI rects: in a first-person view monsters at different depths stand close together on screen, and a number placed without the others' rects lands on a neighbour.

## Adding a monster and an item

```js
GAME.addEnemy('frostbat', { name: 'Frost Bat', look: 'bat',
  palette: { ramp: ['#1c3c66', '#2e5e98', '#4a8ccc', '#7cbcf0', '#c4e8ff'], wing: ['#28508a', '#3c74b4', '#5a9cdc', '#8cc8f4', '#d0f0ff'] },   // bright icy blues survive the warm torchlight
  hp: 8, atk: 3, def: 0, xp: 4, speed: 1.5, sight: 6, evade: 0.2, acc: 0.8, erratic: 0.3, weight: 4, minFloor: 1, maxFloor: 3 });
GAME.addItem('moondraught', { name: 'Moon Draught', look: 'flask', color: '#7ab8ff', effect: { heal: 20 }, weight: 3 });
```
