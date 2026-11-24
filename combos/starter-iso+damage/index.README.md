# Highcliff Crossing: B-04 starter (system element)

`index.html` is a complete single-file isometric tactics skirmish built on `module/iso-height-map.js` v1, which is pasted in unchanged.

- **Units:** three heroes (Rowan the knight, Mira the archer, Tess the scout) against two Brutes, a Hexer and a Bowman, on a 10×10 height map (cliff fort with a tower, stairs, a river with a plank bridge, a meadow) at 256×224 with integer scaling.
- **Turns:** one unit at a time in **wait-time (WT)** order, shown in the top bar. Ending a turn costs the unit's wait: full after moving and attacking, ¾ after one of them, ½ after neither.
- **A player turn:** blue tiles = reachable under the jump rule (climb ≤ JMP, drop ≤ JMP + 2); red = attack reach (archers gain range from high ground). Confirm a blue tile to walk (hops between heights); then pick a target (forecast: damage, HIGH / LOW, SIDE / BACK multiplier, counter) or skip with X; then **choose a facing** (arrows, Z).
- **Enemy turns:** an AI built on the module's non-interactive `reachOf` / `canHit` / `damageMod` and a height-aware distance field.
- **Game end:** VICTORY / DEFEAT, or TIME UP after 80 unit turns. **R** restarts.
- **Input:** arrows move the cursor in screen directions (up = up-right on screen), Z/Enter confirm, X/Esc back or skip, Q/E rotate the camera 90°; mouse hover aims (sprites and cliff faces pick their tile), click confirms; touch: tap aims, tap again confirms; A / B / rotate buttons.
- **URL flags:**
  - `?auto=1` plays the whole game (VICTORY on unit turn 21, about 52 s of game time).
  - `?t=<ms>&freeze=1` replays that many 60 Hz frames deterministically (autoplay unless `&script=` or `&auto=0`) and draws once. Scripts: `move`, `walk`, `face`, `rotate`. `<html data-state>` then holds `{phase, result, turn, stage, active, alive}`; `window.__iso()` gives the same live.

## Structure

Three scripts: the module (verbatim), the shared art (`ART`: map heights and kinds, unit sprites with front/back frames, sky, 5×7 font, windows), and the game, whose numbered sections are:

| # | section | what is in it |
|---|---|---|
| 1 | CONFIG & ROSTER | unit stats (`hp atk def mv jump wait rng`), URL flags |
| 2 | EXTENSION POINTS | the `game` object (below) |
| 3 | RULES | `damage()` (base × the module's `damageMod().mult`), `targetsFrom()`, **`applyHit()`**, `combat()` (lunge → hit → counter) |
| 4 | ISO MODULE WIRING | `GameDNA_IsoHeight.create(...)`, `drawUnit()` |
| 5 | TURNS & AI | `nextTurn()` (WT), `endUnitTurn()`, player stages `move → act → face`, `plan()` shared by enemies and autoplay, `aiTurn()` |
| 6 | INPUT | keyboard / pointer / touch in the chain order below |
| 7 | UPDATE & DRAW | `step()` (60 Hz), `draw()` with the effects slot, `drawHud()`, `drawForecast()` |
| 8 | BOOT | the ADDONS slot, scripted input, freeze mode, main loop |

## Extension points

An addon is a plain object pushed into `game.addons` **in the ADDONS slot (section 8), before `newGame()`**. Every member is optional:

```js
game.addons.push({
  onHit(ev) {},                    // (1) every HP change
  update(game, { dt, frozen }) {}, // every 60 Hz step (dt = 1/60 s), also during hit-stop (frozen = true)
  drawTile(ctx, x, y, sx, sy, tile) {}, // (9) on each tile top, in painter's order (sx, sy = top vertex; tile = {w, h, z})
  draw(ctx, cam, game) {},         // (2) draw-effects slot (world layer)
  drawUI(ctx, game) {},            // (8) top UI layer
  onKey(e, down) {},               // (5) first in the input chain; return true to consume
  onTurnStart(turn, side, unitId) {}, onPhase(phase) {}   // (7)
});
game.builtinNumbers = false;   // when your addon draws damage numbers itself
game.builtinForecast = false;  // when your addon draws the attack forecast (the red target diamond stays)
game.isUnitVisible = u => ...; // (10) drawing only (fog of war)
```

1. **Hit site: `applyHit(attacker, target, amount, kind)`**, also `game.hit(attackerId | null, targetId, amount, kind)`. Every HP change goes through it. `amount ≥ 0`; `kind` is `'attack' | 'counter' | 'heal'` (heal adds HP, clamped to max). It starts the hurt flash or the death fade, pushes the built-in number (with a `BACK` / `HIGH` tag) when `game.builtinNumbers` is on, then calls each addon's `onHit(ev)`:
   ```
   ev = { attacker, target (ids), amount, kind, killed, hpBefore, hpAfter, max,
          mult, side ('front' | 'side' | 'back'), dh (attacker height - target height),
          anchor }   // = game.anchorOf(target, {home: true})
   ```
   Feedback helpers (safe in `onHit`): `game.hitStop(ms)` freezes the world (timers, walks, lunges, the AI, the module's clock and camera; addons still get `update` with `frozen: true`); `game.shake(px, ms)` shakes the world layer; `game.flash(color, ms)` washes it (peak alpha 0.55).
2. **Draw-effects slot.** In `draw()`, after `ISO.draw(g)` (map, overlays, units, x-ray outlines, cursor, facing arrows) and the built-in numbers, before the flash, HUD, info plate and banners. `ctx` is the native 256×224 context with the shake applied; `cam` = `ISO.cam` (the module's scroll). Use `game.anchorOf` for positions, never tile × 16.
3. **UI rects: `game.uiRects()`**: `[{x, y, w, h}]` native px: the WT bar, the active unit window, the turn plate, the stage hint, the forecast window, the module's info plate and cursor (`ISO.getUIRects()`), and addon rects from `game.setUIRect(name, rect)` (`null` removes). The module's info plate avoids addon rects too.
4. **Unit anchor: `game.anchorOf(id, opts)`** → `{x, left, top, w, h, footY, tileX, tileY}`, native screen px, the 16×24 sprite box with feet on the tile top. Default follows walks, hops and lunges (the module's `anchorOf`); `opts.home = true` = standing on its tile (hit sites use it). Ids: `rowan mira tess brute1 brute2 hexer bowman`.
5. **Input chain.** Keydown: addons' `onKey(e, true)` (true stops) → the target picker while open → the module (`ISO.key`: cursor arrows, facing picker, Q/E rotate) → stage confirm / back → **R** restart. Keyup goes to addons, then the module. Pointer: `ISO.pick()` → target picker, facing, or move. `virtualKey(name, true)` is what the buttons and scripts use.
6. **Autoplay (`?auto=1`).** Every unit uses `plan(u)`: for each stop tile in `ISO.reachOf(u)` and each foe it `canHit`, score kill +100, + 3 × damage (with height / facing), − 2 × counter, + 0.5 × height advantage; else walk down the height-aware distance field. `aiTurn()` shows the range, walks with `ISO.walk`, attacks with `combat()`, then `ISO.setFacing(u, ISO.bestFacing(u))`. No random numbers: fully deterministic. Autoplay never opens the facing picker.
7. **Turn and phase events.** `onTurnStart(turn, side, unitId)` when a unit's turn starts (`turn` counts unit turns; `turn 0, side 'a', null` at a new game / restart). `onPhase(phase)` when the acting side changes (`'player' | 'enemy'`) and at `'over'`. Readable: `game.turn`, `game.phase`, `game.active` (id), `game.units`, `game.cam`, `game.auto`, `game.iso` (the module instance; read-only use: `wt.order`, `project`, `heightAt`).
8. **Targeting and forecast.** `game.targeting()` → `{attacker, target, list, index, weapon: null}` while the picker is open, else `null`. `game.forecastData(att, def)` → `{dmg, hit: 100, crit: 0, hits: 1, hpAfter, mult, side, dh, counter: {...} | null}` from the game's rules. A forecast addon sets `game.builtinForecast = false`, draws in `drawUI`, registers its window with `game.setUIRect('forecast', rect)`.
9. **Ground layer: `drawTile(ctx, x, y, sx, sy, tile)`.** Called by the module for each tile right after its top and range overlay, in back-to-front order, so marks sit under units and under nearer blocks. There is no flat ground pass in an iso map: fog, danger zones and terrain marks go here, as diamonds `tile.w × tile.h` with the top vertex at `(sx, sy)`.
10. **Unit visibility: `game.isUnitVisible(u)`.** Default `u => true`. A hidden unit gets no sprite, bar, built-in number or outline. Rules, AI and autoplay still see every unit.

## Changing the game

- **Map:** `ART.MAP` in the art script: `HEIGHT` (one character per tile: `0`–`9`, `a`–`e` = 10–14) and `KIND` (`k s t g m d r w p n`). Keep a route that every unit's jump can climb.
- **Stats and units:** `ROSTER` (`cls` picks the sprite: knight, archer, scout, brute, hexer, bowman).
- **Height rules:** the `params` in `makeIso()` (`fall`, `hgRange`, `hgDamage`, `side`, `back`, `meleeH`, `xray`).
