# B-05 starter: Gullwing Trail (level-select map + short platformer levels)

`index.html` is a complete single-file game. A hooded traveller crosses a coastal cliff trail: title → overworld map → a short side-scrolling level → back to the map, where the next path is drawn stone by stone → … → Storm Keep (a boss, the Warden) → ending. Six levels (Gull Steps, Tide Caves, Seal Cove, Windy Ledge, Ridge Run, Storm Keep), a save hut, a shop (an extra life for 10 coins) and one secret exit: carry the key in Tide Caves to the flag and the path to Seal Cove opens too. Lives carry across levels; losing all of them is game over. All art is original procedural pixel art at 256×224, integer-scaled; the UI is English. Level backdrops come from the I-02 parallax module (cliffs by day, a cave, cliffs at dusk, a stormy night); the ground is one pre-rendered layer per level (shaded grass-topped dirt with a 1 px outline, hanging grass, strata, pebbles, bevelled brick ledges, bushes, rocks, flowers, fences, cave crystals). The hero is a 16×22 sprite with a 4-frame run, jump, fall and sword poses. The map and the levels share one HUD style (plates: lives and coins, hearts, level coins and key, level name).

It is the system element of a basket. Build your game from this file and plug addons into the extension points below rather than editing the map or level flow.

## Run

| URL / key | Effect |
|---|---|
| `?auto=1` | the computer plays: the map's autopilot walks to the next level (saving once at the hut), the level autopilot runs, jumps and swings |
| `?t=<ms>&freeze=1` | fast-forward the deterministic 60 Hz simulation with autoplay, draw one frame (screenshots) |
| `?seed=n`, `?level=<id>`, `?mute=1` | random seed; start in that level after the title (`gull`, `tide`, `seal`, `windy`, `ridge`, `keep`); no sound |
| arrows, Z / Space / Enter, X / Esc | map: walk, enter / save / shop; level: run, jump (hold for higher), sword |
| P | toggle autoplay (any other game key takes over from autoplay) |
| mouse / touch | map: click a node to walk there along open paths, click the hero's node to enter |

Real play (no `?t`, `?auto`, `?seed`, `?level`) saves to `localStorage` at the hut; the title then says CONTINUE.

## Structure

The file has four `<script>` blocks: the error catcher, `GameDNA_LevelMap` (`module/level-select-map.js`, verbatim), `GameDNA_Parallax` (`elements/parallax-layers/module/parallax-layers.js`, verbatim), and the game; then the **ADDONS SLOT**, an empty marked block. The game script has numbered sections (search `=== n.`):

| # | Section | What is there |
|---|---|---|
| 1 | Config and content | `MAP_NODES` / `MAP_EDGES` (the overworld graph), level chunks `CH` and `LEVELS` (each level = a list of chunks), the shop |
| 2 | Game object | `window.GAME`: the public surface and extension points |
| 3 | Map scene | `makeMap(state)`: the module instance and its callbacks (`enterLevel` → `startLevel`, `onSave`, `onShop`, `nodeInfo` items, `auto`, `enabled`) |
| 4 | Level scene | `startLevel(id)`, tile physics, `updateHero`, `updateEnemies`, `updateBoss`, `updateLevel` (coins, key, heart, goal), `endStep()` → `GAME.map.complete(id, exit)` / `fail(id)` |
| 5 | Hit site | `applyHit(ev)`, `anchor(id)`, `units()`, `uiRects()` |
| 6 | Autoplay | `autoInput()`: the level autopilot (the map's own autopilot is the module's `auto`) |
| 7 | Main tick | `tick()`: input chain → scene (title / map / level / ending) → feedback clocks → addons' `update` |
| 8 | Drawing | `drawBackdrop` (the parallax instance, `setTheme` per level), `buildTileLayer` (the level's ground, once per level) and props, sprites, HUD plates, banner, shop, title, ending; `render()` |
| 9 | Input | key queue (a 0 ms tap counts) + held state; map clicks and hover |
| 10 | Boot | `boot()` on `DOMContentLoaded`: art, map, title, `?t` fast-forward, main loop |

Levels are made of 8–24-column chunks with gaps of at most 3 tiles and steps of at most 2, so the level autopilot clears them. A new level = a new `LEVELS` entry, a node in `MAP_NODES` and an edge to it.

## Extension points

**Where addons go: the ADDONS SLOT.** Paste each addon's module and its `GAME.addons.push(...)` into the marked `<script>` at the end (or put `<script src>` tags there). It runs after `window.GAME` exists and **before the game boots**, so addons see the first scene and every `?t=&freeze=1` fast-forwarded frame.

```js
GAME.addons.push({
  name: 'my-addon',
  beforeHit(ev, game) {},               // change ev.amount / ev.kind before it is applied
  onHit(ev, game) {},                   // after: ev.hpBefore, ev.hpAfter, ev.killed, ev.frame
  onKey(key, game) { return false; },   // 'up' 'down' 'left' 'right' 'ok' 'back' 'auto'; true consumes it
  update(game, info) {},                // every 60 Hz frame in every scene; info = {dt, frozen, paused, hitStop, scene}
  draw(g, layer, game) {},              // layer 'fx' or 'overlay' (below)
  onLevelStart(id, game) {}, onLevelEnd(result, game) {},   // result = {id, result: 'win' | 'dead', coins, key}
  onPhase(scene, game) {},              // 'title' | 'map' | 'level' | 'ending' | 'gameover'
  onMapEvent(ev, game) {}               // the module's events: leave, arrive, enter, reveal, revealDone, clear, save, shop, deny, allClear
});
```

1. **Hit site: `applyHit(ev)`, also `GAME.applyHit`.** Every HP change goes through it (levels only; the map has no hits).
   - `ev = {source, target, kind, amount, crit, cause}`. `target` is `hero` or an enemy id (`crab-n`, `gull-n`, `warden`).
   - `damage`: sword hits (`amount` 1, or 2 with `crit`, 10 %), enemy contact on the hero (1), a pit (`cause: 'fall'`, the hero's whole HP). `heal`: a heart pickup, `amount` clamped to the missing HP.
   - Order: addons' `beforeHit` → apply → built-in feedback (sparks, hit-stop 3 frames / 5 on a crit, shake, red flash on the hero, pop number) → addons' `onHit`.
   - `GAME.flags.builtinPopups = false` turns off the built-in numbers; `GAME.flags.builtinShake = false` the shake.
   - Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha = 0.3)` (both skipped under `prefers-reduced-motion`), `GAME.hitStop(frames)` / `GAME.hitStopMs(ms)`.
2. **Draw-effects slot.** `draw(g, 'fx', game)` on the native 256×224 buffer: in a level after the backdrop, tiles, actors and built-in sparks and pops, before the HUD band, banner and flash; on the map after `GAME.map.drawWorld()`, before `GAME.map.drawUI()` (panel, toasts, iris). `draw(g, 'overlay', game)` runs last in every scene (top UI layer).
3. **UI rects: `GAME.uiRects()`** → `[{name, x, y, w, h}]` native px. Level: `hud` (0, 0, 256, 16) and `banner` while shown. Map: `map-panel`, `map-toast`, `mapHud` (the lives / coins plate) and `shop` while open.
4. **Anchor: `GAME.anchor(id)`** → `{id, x, top, w, h, footY, cy, left, dead}` screen px (camera applied; `x` = centre). In a level: `hero` and the enemies; on the map: `hero` = the map traveller (`GAME.map.player()`). `GAME.units()` lists the living ones.
5. **Input chain.** Keys are queued by name. Each tick every queued key goes to the addons' `onKey` in array order; the first `true` consumes it; otherwise the game handles it. A game key during autoplay hands control to the player (except `auto`). Held state: arrows held, `ok` held for the variable jump.
6. **Autoplay.** `GAME.autoplay.on`. Levels: `autoInput()` holds right, jumps at pits and walls and for the key, swings at enemies ahead, fights the Warden. Replace it with `GAME.autoplay.decide = (level, game) => ({left, right, jump, jumpHeld, act})` (return null for the default). The map's autopilot is the module's (`auto` option); the shop closes itself under autoplay. Addons must not consume `ok` or arrows during autoplay unless they mean to; the `?t=` screenshots rely on it.
7. **World clock.** `GAME.clock = {frame, levelFrame, paused, hitStop}`. `GAME.pause(true)` stops the level (not addons' `update`); hit-stop freezes the level for whole frames. `info.dt` is 16.67 ms or 0 while frozen: age your effects with it.
8. **Turn / phase events.** `onPhase(scene)` on every scene change; `onLevelStart(id)` / `onLevelEnd(result)` around each level; `onMapEvent(ev)` for every map event (a reveal starting, each path finished, a save...).
9. **Top UI draw hook.** `draw(g, 'overlay', game)`.

`GAME.L` (the running level: `hero`, `enemies`, `items`, `coins`, `camX`, `boss`), `GAME.run` (lives, coins, best coins and keys per level, saves) and `GAME.map` (the module instance, API in `../module/README.md`) are readable. Change state through the hit site and `GAME.map` only.
