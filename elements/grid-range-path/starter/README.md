# Ford Skirmish: B-01 starter (system element)

`index.html` is a complete single-file tactics skirmish built on `module/grid-range-path.js` v1.1, which is pasted in unchanged.

- **Units:** three heroes (Rowan, Mira, Bram) against three Brigands and a Hexer, on a 22×16 river-valley map at 240×160 with integer scaling.
- **A player turn:** select a unit to see its range (blue) and strike tiles (red). Walk it along the arrow, then choose Attack (target picker, forecast, hit, counter), Wait or Back.
- **Enemy phase:** the enemies move and attack with an AI built on the module's non-interactive `reachOf` / `pathTo`.
- **Ending a turn:** the End turn button or key **E**. The turn also ends automatically once all heroes have acted.
- **Game end:** Victory when all enemies are defeated, Defeat when all heroes are, Time up after 30 turns. Restart with **R** or the button.
- **Input:** keyboard (arrows/WASD, Z/Enter, X/Esc), mouse (hover aims, click confirms, right-click backs out) and touch (tap aims, tap again confirms; A/B buttons).
- **URL flags:**
  - `?auto=1` plays the whole game by itself (VICTORY on turn 6, about 60 s of game time).
  - `?t=<ms>&freeze=1` replays that many 60 Hz frames deterministically and draws once. Add `&script=arrow|attack|fight` for scripted input, or `&auto=1`. `<html data-state>` then holds `{phase, result, turn, mode, alive}` for headless checks.

## Structure (sections in the script)

| # | section | what is in it |
|---|---|---|
| 1 | CONFIG & ROSTER | unit stats (`hp atk def mv rng`), URL flags, the turn plate rect |
| 2 | EXTENSION POINTS | the `game` object (below) |
| 3 | RULES | `damage()`, `targetsFrom()`, **`applyHit()`**, `combat()` (lunge → hit → counter) |
| 4 | GRID MODULE WIRING | `GameDNA_GridRange.create(...)` with `commands` Attack/Wait/Back and `onCommand`; the game-owned target picker |
| 5 | TURNS & AI | `endTurn`, `startPlayerTurn`, `checkEnd`, `plan()` (shared by the enemy AI and autoplay), `execute()`, `aiStep()` |
| 6 | INPUT | keyboard / pointer / touch handlers in the chain order below |
| 7 | UPDATE & DRAW | `step()` (60 Hz) and `draw()` with the effects slot |
| 8 | BOOT | the ADDONS slot, scripted input, freeze mode, main loop |

Above the game script are two others: the module (verbatim) and the shared art (map, terrain table `TER`, tile art, unit sprites `drawUnit`, the 5×7 font `drawText`/`textW`, window frame `win`, `banner`, `vignette`).

## Extension points

All of them hang off the global `game` object. An addon is a plain object pushed into `game.addons` **in the ADDONS slot (section 8), before `newGame()`**. Every member is optional:

```js
game.addons.push({
  onHit(ev) {},                    // (1) every HP change
  update(game, { dt, frozen }) {}, // every 60 Hz step (dt = 1/60 s), also during hit-stop (frozen = true)
  drawGround(ctx, cam, game) {},   // (9) ground layer: after the map, before grid overlays / arrow / units
  draw(ctx, cam, game) {},         // (2) the draw-effects slot (world layer)
  drawUI(ctx, game) {},            // (8) the top UI layer (after HUD, grid windows and forecast)
  onKey(e, down) {},               // (5) first in the input chain; return true to consume
  onTurnStart(turn, side) {}, onPhase(phase) {}   // (7)
});
game.builtinNumbers = false;   // when your addon draws damage numbers itself
game.builtinForecast = false;  // when your addon draws the attack forecast itself (the red target brackets stay)
game.isUnitVisible = u => ...; // (10) fog of war: which units are drawn (default: all)
```

1. **Hit site: `applyHit(attacker, target, amount, kind)`.** Every HP change goes through it: attacks, counters and heals. It is also reachable as `game.hit(attackerId | null, targetId, amount, kind)`.
   - `amount` is always ≥ 0. `kind` is `'attack' | 'counter' | 'heal'`; a heal adds HP, every other kind removes it.
   - HP is clamped to `[0, max]`, so a heal never overheals.
   - It starts the hurt flash (not for heals) or the death fade, pushes the built-in number (`+N` in green for heals) when `game.builtinNumbers` is on, then calls each addon's `onHit(ev)` in push order:
   ```
   ev = { attacker,                  // unit id, or null
          target,                    // unit id
          amount, kind,
          killed, hpBefore, hpAfter, max,
          anchor }                   // = game.anchorOf(target, {home: true})
   ```
   A poison, regen or item addon calls `game.hit` rather than changing `hp` directly.

   **Feedback helpers** (safe to call from `onHit`):
   - `game.hitStop(ms)` freezes the world for `ms`: unit animation, timers, walk and lunge, the AI, the grid module and the camera. The longest request wins. Addons keep getting `update(game, {frozen: true})` and keep drawing; `game.frozen` reads the state.
   - `game.shake(px, ms)` shakes the world layer (ground → units → effects slot), decaying to 0. A stronger request replaces a weaker one.
   - `game.flash(color, ms)` washes the world layer with a fading colour (peak alpha 0.55). The HUD and windows stay steady.
2. **Draw-effects slot.** In `draw()` it comes after the units, their HP bars and the built-in numbers, and before the screen flash, the vignette, the HUD plate, the module's windows, the forecast window and the banners. Each addon's `draw(ctx, cam, game)` runs here.
   - `ctx` is the 240×160 native context, already translated by any shake, so anchors line up with the sprites.
   - `cam = {x, y}` is the map scroll; screen position = world px − cam.
3. **UI rects: `game.uiRects()`.** Returns `[{x, y, w, h}]` in native screen px: the turn plate, the built-in forecast window while targeting, otherwise the module's `getUIRects()` (unit, menu and terrain windows and the cursor, from the last frame), and every addon rect registered with `game.setUIRect(name, rect)`. Pass `null` as the rect to remove it. Addon rects are also passed to the grid module, so its windows avoid them. Addons that place text should avoid all of these.
4. **Unit anchor: `game.anchorOf(id, opts)`.** Returns `{x, left, top, w, h, footY, tileX, tileY}` in native screen px.
   - The box is the drawn sprite's own box: for example 16×19, with `x` its centre and `footY` the tile bottom.
   - By default it follows walking, lunging and the module's walk animation.
   - `opts.home = true` gives the unit's tile position with no walk or lunge offset. `onHit` uses it, so a counter's number does not ride the attacker's lunge.

   Ids: `rowan mira bram brigand1 brigand2 brigand3 hexer`.
5. **Input chain.** On keydown the order is:
   1. each addon's `onKey(e, true)`; true stops the chain;
   2. the target picker, while it is open;
   3. the grid module, `GR.key(e.code, true, e.repeat)`, which takes only the keys it uses;
   4. game shortcuts: **E** ends the turn, **R** restarts.

   Keyup goes to every addon and then to the module. Pointer and touch go to the target picker first, then to the module (`hover` / `click`). The on-screen A/B buttons use `virtualKey(name, down)`.
6. **Autoplay (`?auto=1`).** `aiStep()` drives both sides with the same planner, `plan(unit)`:
   - It gets the unit's stoppable tiles from `GR.reachOf(unit)`.
   - For every stop tile and every foe in weapon range, it scores: kill +100, + 3 × damage, − 2 × expected counter, + terrain DEF, − 0.05 × move cost. It takes the best.
   - If no foe is reachable, it walks to the stop tile closest (Manhattan) to the nearest foe.

   `execute()` walks the path from `GR.pathTo` at 6 frames per tile, then calls `combat()`. Autoplay never touches the module's cursor or menu, and `enabled()` returns false while it runs. Player units act in roster order, then the turn ends. There are no random numbers, so a run is fully deterministic.
7. **Turn and phase events.** `onTurnStart(turn, side)` fires when a side's turn begins: `'a'` is the player, `'b'` the enemy (turn 1 'a' is sent by `newGame`). `onPhase(phase)` fires on `'player' | 'enemy' | 'over'`. `game.turn`, `game.phase`, `game.units`, `game.cam` and `game.auto` can be read at any time.

8. **Targeting and forecast.**
   - `game.targeting()` returns `{attacker, target, list, index, weapon: null}` (unit ids) while the Attack target picker is open, else `null`.
   - `game.forecastData(att, def)` takes ids or units and returns the numbers the built-in forecast shows, from the game's own rules: `{dmg, hit: 100, crit: 0, hits: 1, hpAfter, counter: {dmg, hit, crit, hits, hpAfter} | null}`. This game has no hit chance, crits or double strikes. `counter` is `null` when the defender dies or cannot reach.
   - Draw order while the picker is open: target brackets, then the built-in forecast (skipped when `game.builtinForecast` is false), then the addons' `drawUI(ctx, game)` hooks, then banners. `drawUI` also runs when the picker is closed, after the grid module's windows.
   - A forecast addon: set `game.builtinForecast = false`; in `update` call `show(...)` while `game.targeting()` is non-null, using `game.forecastData(...)`; draw in `drawUI`; report its window with `game.setUIRect('forecast', rect)`.

9. **Ground layer: `drawGround(ctx, cam, game)`.** Runs right after the map and its water and banner animation. It comes before the grid module's range overlays and arrow, the target tiles and the units, inside the shake translate. Use it for fog, terrain marks or danger zones that must sit under units and overlays.
10. **Unit visibility: `game.isUnitVisible(u)`.** Defaults to `u => true`; an addon may replace it. It is for drawing only, and a hidden unit gets:
    - no sprite or HP bar in the unit loop;
    - no built-in damage number;
    - no grid-module unit window, and it is ignored by window placement (passed to the module as `isVisible`);
    - no camera follow while it walks or fights; the camera holds still instead.

    Rules, the grid module's movement (`occupant`), `plan()`, the enemy AI and autoplay always see every unit, so a fog addon cannot change who wins.

## Changing the game

- **Stats and units:** edit `ROSTER` (unit art is keyed by name in `LOOKS`: Rowan, Mira, Bram, Brigand, Hexer).
- **Terrain costs and DEF/AVO:** `TER`. The map is `MAP`, one character per tile.
- **More commands** (Item, Talk…): add entries to `commands(u)` and handle them in `onCommand`. Return `'keep'` while a game-owned picker is open.
- **Module look and feel:** the `params` in `makeGrid()` (`overlay`, `repeat`, `costs`).
