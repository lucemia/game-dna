# B-06 starter: Windrider Post (pseudo-3D flight ground)

`index.html` is a complete single-file courier game built on `module/pseudo3d-flight.js` v1.0, pasted in unchanged. Carry three letters from the post town of Holloway to three other islands on a 64x64-tile world (1024 world px) that wraps on both axes. All art is original procedural pixel art at 256x224, integer-scaled; the UI is English.

- **Walking:** a top-down tile map (sea with foam edges, shallows, sand, grass, flowers, roads, forest, rock, towns). Arrows / WASD walk; walk up into the target town's houses to deliver.
- **Flying:** **X** (or C) calls the mount anywhere on the walking map: the map zooms, turns and tilts into the flight view in 0.6 s. Left/right turn and bank, up faster, down slower, **Z** lands on flat ground only (sand, grass, flowers, road); over water, forest, rock or a town the prompt reads NO LANDING and shakes. Mountains, trees, towns and the lighthouse are billboards; the mini-map shows the towns (target blinking gold, home blue).
- **Hazards:** storm wisps hover in the air; near the mount they are drawn 24 world px to its side (never over the rider). Touching one costs the mount 2 of its 8 stamina: a star burst on the wing tip, the wisp bursts into puffs and is gone for 3 s. Floating feathers give 1 back (they return after 20 s); a delivery rests the mount fully. Stamina 0: GROUNDED (defeat).
- **End:** all three letters delivered (time, flights and hits shown), or grounded. Z starts again; **R** restarts at any time.
- **URL flags:**
  - `?auto=1` plays the whole game by itself: walk, take off, fly to each target (it does not swerve round two wisps, so it takes 3 hits), land, walk into the town. ALL LETTERS DELIVERED after about 38 s of game time.
  - `?t=<ms>&freeze=1` replays that many 60 Hz frames deterministically (autoplay unless `&auto=0`) and draws once; `<html data-state>` then holds `{scene, phase, progress, delivered, stamina, flights, hits, frame, mount, hero}` for headless checks (`window.__windrider()` gives the same at any time).
  - `?sky=day|dusk`, `?mount=bird|glider`, `?speed=`, `?bank=`, `?seed=`.
- **Input:** keyboard, and a touch pad (arrows, Z, X) on touch screens. **P** toggles autoplay; any game key takes over from it.

## Structure

The file has four `<script>` blocks: the module (verbatim), the game, the **ADDONS SLOT** (empty, marked), and the boot script. The game script has numbered sections (search for `=== n.`):

| # | section | what is in it |
|---|---|---|
| 1 | CONFIG & WORLD | tile ids, `WALKABLE` / `LANDABLE`, the wrapping world generator (`buildWorld`), towns, billboards |
| 2 | ART | top-down tile art `tileArt(id, tx, ty)` (also the flight texture: the module bakes it), hero, wisp, feather, 5x7 font `text`, windows `win` |
| 3 | GAME OBJECT | `game` (= `window.GAME`): the extension points below |
| 4 | FLIGHT MODULE WIRING | `GameDNA_Flight.create(...)`: `tileAt`, `tileImage`, `canLand`, `billboards`, `markers`, `topdown` (the walking camera), `onLand` (places the hero) |
| 5 | HIT SITE | `applyHit(ev)` |
| 6 | RULES | `newGame`, `startPlay`, walking and delivery (`updateWalk`, `deliver`), air hazards (`updateAir`), camera |
| 7 | AUTOPLAY | `autoInput()`: BFS walk on the island, `fl.steer()` in the air plus wisp avoidance, land when over flat ground near the road |
| 8 | INPUT | the key chain (below), touch pad |
| 9 | UPDATE & DRAW | `step()` (60 Hz) and `draw()` |
| 10 | BOOT | after the ADDONS slot: `newGame()`, `?t=` fast-forward, main loop |

The flight module reads the game's own polled input every step while flying (`fl.setInput` in `step()`), so held keys, the touch pad and autoplay all use one path. While `fl.busy()` (take-off, flight, landing) the walking update is skipped and `fl.draw(g)` draws the whole view.

## Extension points

**Where addons go: the ADDONS SLOT.** Paste each addon's module and its registration into the marked `<script>` block (or put `<script src>` tags there). It runs after `window.GAME` exists and before boot, so addons see `onStart` and every `?t=&freeze=1` frame. An addon is a plain object; every hook is optional:

```js
GAME.addons.push({
  onHit(ev, game) {},               // (1) every stamina change
  update(game, { dt, frozen }) {},  // every 60 Hz step, also during hit-stop; dt in ms (16.67 or 0)
  draw(ctx, layer, game) {},        // (2) layer 'world' (after the map / flight view, inside the shake) or 'ui' (after the HUD)
  onKey(e, down, game) {},          // (5) first in the input chain; return true to consume
  onPhase(phase, game) {},          // (7) 'walk' | 'rising' | 'flying' | 'landing' | 'win' | 'lose'
  onStart(game) {}, onDeliver(town, game) {}
});
GAME.builtinNumbers = false;        // when your addon draws its own numbers
```

1. **Hit site: `applyHit(ev)`, also `GAME.applyHit(ev)` and `GAME.hit(target, amount, kind, source)`.** Every stamina change goes through it: wisp strikes (`kind: 'damage'`, 2), feathers (`'heal'`, 1) and the rest at a delivery (`'heal'`, up to full).
   - `ev = {source (wisp / feather / town id or null), target ('mount' or 'hero'), amount (>= 0, the real change after clamping), kind ('damage' | 'heal'), killed, hpBefore, hpAfter, max, anchor}`; `anchor = GAME.anchorOf(target)`.
   - Order: apply, built-in feedback (hit-stop 70 ms, shake, red flash on the world but not on the HUD or the flight windows, the built-in `-2` / `+1` pop that follows the mount, when `GAME.builtinNumbers`; the wing-tip star burst is not a number and stays), then each addon's `onHit` in push order.
   - Feedback helpers: `GAME.hitStop(ms)` (the world stops; addons still get `update` with `frozen: true`), `GAME.shake(px, ms)` (world layer only), `GAME.flash(color, ms)`.
2. **Draw-effects slot: `draw(ctx, 'world', game)`.** On the native 256x224 context, inside the shake translate, after the walking map or the flight view (ground, billboards, mount, module UI) and the built-in numbers, before the flash and the HUD. `draw(ctx, 'ui', game)` runs last, after the HUD and windows: the top UI layer.
3. **UI rects: `GAME.uiRects()`.** `[{name, x, y, w, h}]` in native px: `hud`, the flight module's `minimap` / `prompt` / `speed` while busy (else the walking `prompt`), `banner`, end windows, and every rect an addon registered with `GAME.setUIRect(name, rect)` (`null` removes it).
4. **Anchor: `GAME.anchorOf(id)`.** `{x (centre), top, w, h, footY}` in native px. `'mount'` is the mount sprite as drawn this frame (from `fl.anchor()`; `'hero'` gives it too while flying), `'hero'` the walking sprite, `'wisp-N'` / `'town-N'` their billboards in the flight view.
5. **Input chain.** keydown: addons' `onKey(e, true, game)` (true stops it), then the game keys (arrows / WASD, Z / Space / Enter, X / C, P, R). keyup: addons, then the game. The touch pad calls the same chain (`virtualKey`).
6. **Autoplay (`?auto=1`, P).** `autoInput()` returns the same input object a person produces; in the air it uses `fl.steer(x, y)` toward the target town's road and swerves round wisps 1, 2, 4-7, then lands with `land: true` once within 22 px and `fl.canLandHere()`. No randomness: a run is fully deterministic.
7. **Clock and phases.** `GAME.frozen`, `GAME.frame`, `GAME.phase` (title, walk, rising, flying, landing, win, lose); `onPhase` fires on every change, `onStart` on a new game or restart, `onDeliver(town)` per letter.
8. **The module instance: `GAME.fl`.** Read `phase`, `x`, `y`, `heading`, `speed`, `project(wx, wy, wz)`, `getUIRects()`; call `fl.setParams({...})` to change the look. Do not call `takeOff` / `land` from an addon unless it is a control addon.

## Changing the game

- **World:** `ISLANDS` (centre, radius, town name) and `buildWorld()`; landing rule `LANDABLE`, walking rule `WALKABLE`.
- **Look:** the `params` in section 4 (`sky`, `mount`, `speed`, `bank`, `height`, `fog`...), the tile art in `tileArt`.
- **Hazards:** `WISPS` / `FEATHERS` in `newGame()`; damage and heal amounts in `updateAir()`.
