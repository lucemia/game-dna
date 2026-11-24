# A-05 starter: Thornvale (real-time sword combat)

`index.html` is a complete single-file top-down action game built on `module/sword-combat.js`, which is pasted in unchanged. A hero with a sword crosses four rooms: **Meadow Gate** (slimes that wander), **Old Wood** (hounds that chase, a boar that charges), **Broken Ruins** (archers that keep their distance and shoot, a boar, a hound; clearing it opens the sealed hall gate) and **Warden Hall** (carpet, braziers; the boss: telegraphed charges, wall stuns, backing off to the centre, aimed volleys from range, a rage phase below half HP). Defeating the warden wakes the shrine; touching it wins. Hearts and gems drop from defeated enemies. Art is original procedural pixel art at 256×224 (16 px HUD + 16×13 tiles), integer-scaled; the UI is English.

Build your game from this file and plug addons into the extension points below rather than editing the combat.

## Run

| URL / key | Effect |
|---|---|
| `?auto=1` | autoplay: clears every room and wins (about 61 s of game time with the default seed; a player who never dodges loses (tested with seeds 3, 7, 11, 21)) |
| `?t=<ms>&freeze=1` | fast-forward the deterministic 60 Hz simulation (autoplay on unless `&auto=0`), draw one frame; `<html data-state>` holds `{scene, room, hp, kills}` |
| `?seed=n`, `?dirs=8`, `?hearts=1..10`, `?overlay=on` | seed, 8-way swings, starting hearts (default 5), hitbox overlay |
| touch | on touch screens a d-pad and a SWORD button appear under the canvas (`GAME.virtualKey(key, down)`) |
| arrows / WASD | walk |
| Z / Space / Enter | swing; tap again in rhythm for the 3-hit combo (a press in the last 12 frames of a swing is buffered); start / continue on title and end screens |
| P | toggle autoplay (any game key takes over from autoplay) |
| H | hitbox overlay |
| Esc | pause |

## Structure

Scripts in order: the skin API and pixel16 (text and windows), **`GameDNA_SwordCombat`** (the module, verbatim), the art kit `SCART` (hero, tiles), the pixel scene kit `GameDNA_PixelScene` (paints the two outdoor rooms: grass, dirt path, pond, trees; drawing only, `sceneOf(id)` in section 8, and the game falls back to `SCART` tiles without it), the game (defines `window.GAME`), the **ADDONS SLOT**, then `GAME.boot()`.

The game script has numbered sections (search `=== n.`):

| # | Section | What is there |
|---|---|---|
| 1 | Config and content | `ROOMS` (tile grid, exits, enemy spawns `{id, look, tx, ty}`), `ROUTE`, URL options |
| 2 | Game object | `game` = `window.GAME`, `each(hook)` (calls addons), feedback helpers |
| 3 | Rooms and the combat module | `solid()` (walls, sealed gate), `makeCombat()` (the `create` call and its callbacks), `enterRoom()` |
| 4 | Hit site | `hitSite(ev)` (every HP change, from the module's `onHit`), `game.hurt()`, `bossDefeated()` |
| 5 | Autoplay | BFS route through the rooms; `SC.autopilot()` does the fighting and the dodging |
| 6 | Input | key queue, edge-latched swing, the input chain |
| 7 | Main step | `step()` (gates, world step, addon updates), `worldStep()`, `roomLogic()` (seal, shrine, exits), room slide |
| 8 | Drawing | `drawField()` (layers), HUD, banners, title and end screens |
| 9 | Boot | `GAME.boot()` (after the ADDONS SLOT): fast-forward, main loop |

Enemy behaviours come from the module: `slime` → `wander`, `hound` → `chase`, `boar` → `charge`, `archer` → `shooter`, `warden` → `warden`. Add an enemy by adding `{id, look, tx, ty}` to a room's `enemies`; add a room by adding it to `ROOMS` and an exit pair.

## Extension points

**Where addons go: the ADDONS SLOT.** Put each addon module there (`<script src>` or pasted unchanged) and register it with `GAME.addons.push({...})`. The slot runs after `window.GAME` exists and **before the game boots**, so addons see the first room and every `?t=&freeze=1` fast-forwarded frame.

An addon is a plain object. Every hook is optional:

```js
GAME.addons.push({
  name: 'my-addon',
  gate(game) { return true; },         // first thing in every play step; return false = hold the world this step (hit-stop)
  beforeHit(ev, game) {},              // change ev.amount or set ev.cancel before it is applied
  onHit(ev, game) {},                  // after: ev.hpBefore, ev.hpAfter, ev.killed, ev.screen, ev.anchor
  onDefeat(enemy, ev, game) {},
  onKey(key, game) { return false; },  // return true to consume the key
  update(game, info) {},               // every 60 Hz frame (title and end screens too); info = {dt, frozen, paused, hitStop} (see 7)
  draw(g, layer, game) {},             // layers below
  wrapSprite(g, id, rect, drawFn, game) { drawFn(); },   // wraps each hero / enemy sprite draw (first addon that defines it)
  onRoomStart(roomId, game) {}, onPhase(phase, game) {}, onEvent(ev, game) {}, onEnd(result, game) {}
});
```

1. **Hit site: the module's `onHit` → `hitSite(ev)`.** Every HP change arrives here: sword hits, enemy contact, charges, projectiles and `GAME.hurt(id, amount, opts)` (traps, poison).
   - `ev = {kind: 'melee' | 'contact' | 'charge' | 'projectile' | 'host', source, target, amount, combo (1-3), finisher, strength: 'light' | 'heavy' | 'finisher', killed, hpBefore, hpAfter, max, at (world px), screen (native screen px), dir {x, y}, anchor (= GAME.anchor(target))}`. The hero's id is `'hero'`; enemy ids are the room spawn ids (`slime-1`, `hound-2`, `boar-1`, `archer-1`, `warden`, …).
   - Order: addons' `beforeHit`, the module applies HP, knockback and i-frames, built-in feedback (shake on hero hits and finishers), addons' `onHit`.
   - Built-ins an addon may turn off: `GAME.flags.builtinHitStop` (the module's hit-stop requests), `builtinShake` (field shake on hits, wall bumps, the gate opening), `builtinFlash` (boss-defeat and hero-down flashes), `builtinSparks` (false turns the module's hit sparks off), `builtinEnemyFlash` (false stops the module's white flash on struck enemies, for an addon that flashes sprites itself, e.g. through `wrapSprite`). Never write to enemy objects (`GAME.SC.enemy(id)` is read-only). The starter draws no damage numbers.
   - Feedback helpers: `GAME.shake(px, frames)` (field only), `GAME.flash(color, frames, alpha = 0.3)` (field only); both skipped under `prefers-reduced-motion`.
2. **Draw layers: `draw(g, layer, game)`**, `g` is the native 256×224 context.
   - `'begin'`: first thing of the field pass, inside the field clip and the built-in shake (a shake/flash addon calls its `begin` here).
   - `'ground'`: after the room ground, before telegraph lanes, drops and sprites (outdoors the trees, bushes and rocks are y-sorted with the sprites, so they draw after this hook).
   - `'fx'`: after the sprites, the module's sword, projectiles and sparks and the built-in flash.
   - `'end'`: last thing of the field pass (pair of `'begin'`), before the HUD.
   - `'overlay'`: after the HUD and banners (also on the title).
   Sprites: `wrapSprite(g, id, rect, drawFn)` with `rect = GAME.anchor(id)`; call `drawFn()` exactly once.
3. **UI rects: `GAME.uiRects()`** → `[{name, x, y, w, h}]` native px: `hud` (0,0,256,16), plus `intro` (the opening message box), `banner` (room names, "THE HALL GATE OPENS") and `result` while shown.
4. **Anchor: `GAME.anchor(id)`** → `{id, x (centre), top, left, w, h, cy, footY, dead}` in native screen px: the sprite box (hero 12×16, enemies by look; warden 30×32). Also valid on the frame an enemy dies (`dead: true`). `GAME.units()` lists `{id, side}` of the hero and living enemies. The play field is `GAME.field` = `{x: 0, y: 16, w: 256, h: 208}`; world px + (0, 16) = screen px.
5. **Input chain.** Keys are queued as `up`, `down`, `left`, `right`, `ok`, `back`, `pause`, `auto`, `overlay`. Each frame every queued key goes to the addons' `onKey` in order; the first returning `true` consumes it. Otherwise the game handles it: `ok` latches a swing (kept until a world step reads it, so a 0 ms tap or a press during hit-stop still swings), `auto` toggles autoplay, `overlay` the hitboxes, `pause` pauses. Held directions are read from the key state.
6. **Autoplay.** `GAME.autoplay.on`. Each world step it finds a BFS waypoint (nearest enemy, a heart if hurt, else the room's exit on `ROUTE`, the shrine in the hall) and feeds it to `GAME.SC.autopilot({next})`, which picks a move by the danger met along its path (projectiles, telegraphed charge lanes, aim lines, bodies), strikes when the target is in reach and buffers combo hits. Replace the plan with `GAME.autoplay.decide = game => input | null` (`{x, y, attack, aim}`; null falls back).
7. **Clock, pause, hit-stop.** `GAME.clock = {frame, worldFrame, paused, stop}`. Each play step runs, in order: every addon's `gate(game)`, then the built-in hold, then pause; if any holds, the world step is skipped entirely (no input read, no RNG, no module update) and `stop` counts it. `GAME.hitStop(frames)`, `GAME.hitStop({ms})`, `GAME.hitStopMs(ms)` (capped at 30 frames), `GAME.pause(on)`, `GAME.frozen()`. Addons' `update(game, info)` runs every frame regardless: `info.dt` is 16.67 ms or 0 while held, `info.frozen` and `info.paused` are booleans, `info.hitStop` is the hold left (it compares like a number and is also callable like `GAME.hitStop`). Both arguments are the same object (the game extended with these fields), so a hook written as `update(info, game)` works too.
8. **Room, phase and end events.** `onRoomStart(roomId)` when a room is entered (after its enemies spawn; also the first room of a new game): the place to `clear()` per-room effects. `onPhase('play' | 'boss' | 'cleared' | 'victory' | 'gameover' | 'title')`. `onEnd('victory' | 'gameover')`. `onEvent(ev)` relays the module's events (`swing`, `telegraph`, `charge`, `wall`, `aim`, `shoot`, `parry`, `drop`, `pickup`, `defeat`, `down`) plus `unseal`; the boss also sends `rage` (banner THE WARDEN RAGES).

`GAME.SC` is the module instance (API in `../module/README.md`); `GAME.state()` is a JSON snapshot; `GAME.hero` is the hero's feet box. Change combat state through the hit site, `GAME.hurt` and `GAME.SC` only.
