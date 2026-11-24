# A-02 starter: Crossroads Cup (four-move battle)

`index.html` is a complete single-file creature battle game. Your team of three (Cindle the Ember fox cub, Brookit the Tide pup, Sproutle the Bloom bulb) fights three rivals in a row on a hill-top meadow ring, at day, at sunset and at dusk. Each creature has four moves with uses left; six types (Ember, Tide, Bloom, Gale, Stone, Volt) double, halve or cancel damage; speed decides who moves first; switching costs the turn; the team heals between rounds. Beat all three for the cup. All art is original procedural pixel art at 240×160, integer-scaled; the UI is in English.

It is the system element of a basket. Build your game from this file, and plug addons into the extension points below rather than editing the battle flow.

## Run

| URL / key | Effect |
|---|---|
| `?auto=1` | the computer plays the whole cup (it presses the same menu keys a player would) |
| `?t=<ms>&freeze=1` | fast-forward the deterministic 60 Hz simulation (autoplay on unless `&auto=0`), draw one frame; `<html data-state>` then holds `GAME.state()` |
| `?format=double` | two on two |
| `?seed=n`, `?text=slow\|normal\|fast\|instant`, `?reduced=1` | random seed, text speed, no shake / flash |
| arrows, Z / Enter / Space, X / Esc | move, confirm, back (also advances messages) |
| P | toggle autoplay (any other game key also takes over from autoplay) |
| tap | menu cells, targets, message box; on the title and result screens: continue |

A cup under `?auto=1` takes about 3.5 minutes of game time with seed 7 (champion; with other seeds the team sometimes falls in round 2).

## Structure

The file has four `<script>` blocks, in order:

1. `ART`: creature models (shaded volumes rasterised to 48×48 front / 60×60 back sprites), the meadow backdrop at three times of day, platforms, a 5×7 title font.
2. `GameDNA_FourMove`: `module/four-move-battle.js`, verbatim. It owns turn resolution, the message queue, the menus and the battle screen.
3. The game. It defines `window.GAME` and boots on `DOMContentLoaded`.
4. **ADDONS SLOT**: an empty, marked block where addons go.

The game script has numbered sections. Search for the `=== n.` banners:

| # | Section | What is there |
|---|---|---|
| 1 | Config and content | URL flags, `TYPES` (type chart), `MOVES`, `SPECIES` (base stats, moves), `TEAM`, `RIVALS`, `BAG`, `statsFor()` |
| 2 | Game object | `game` (= `window.GAME`): the public surface and extension points |
| 3 | Battle setup | `newBattle()`: one `GameDNA_FourMove.create(...)` per round with all callbacks; `endBattle()` |
| 4 | Hit site | `applyHitFeedback(ev)`: built-in shake / flash, then the addons' `onHit` |
| 5 | Scenes | title, battle, between rounds, champion, defeat; `sceneOk()` and the autoplay presses |
| 6 | Default autoplay tactics | `game.autoplay.decide` (null = the module's AI) |
| 7 | Main tick | `tick()`: input chain → scene autoplay → `B.update()` → effects → addons' `update` |
| 8 | Drawing | `render()`: `B.drawScene` → `draw(g, 'fx')` → flash → `B.drawUI` → `draw(g, 'overlay')` → scene windows → `drawUI(g)`; integer-scaled screen |
| 9 | Input | key queue (a 0 ms tap counts), canvas taps, on-screen buttons |
| 10 | Boot | `boot()` after the ADDONS SLOT: `?t` fast-forward or the main loop; `GAME.step(n)` / `GAME.render()` for tests |

`B.update()` runs on every tick of every scene that shows a battle. Never gate it on a menu or an animation: the module runs both.

## Extension points

**Where addons go: the ADDONS SLOT.** Paste each addon's module and its `GAME.addons.push(...)` into the marked `<script>` block (or put `<script src>` tags right above it). The slot runs after `window.GAME` exists and **before the cup boots**, so addons see the first `onBattleStart` and every `?t=&freeze=1` fast-forwarded frame.

An addon is a plain object. Every hook is optional:

```js
GAME.addons.push({
  name: 'my-addon',
  beforeHit(ev, game) {},          // change ev.amount, or ev.cancel = true, before HP / status changes
  onHit(ev, game) {},              // after: ev.hpBefore, ev.hpAfter, ev.killed, ev.anchor
  onKey(key, game) { return false; },   // key = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'auto' | {tap, x, y}; true consumes it
  update(game, info) {},           // every 60 Hz frame, also while frozen; info = {dt, frozen, paused, hitStop}
  draw(g, layer, game) {},         // layer 'fx' (after creatures, before info boxes) or 'overlay' (after the battle UI)
  drawUI(g, game) {},              // top UI hook: after everything, also on the title screen
  onTurn(n, game) {}, onPhase(phase, game) {}, onEvent(ev, game) {},
  onBattleStart(game) {}, onBattleEnd(result, game) {}
});
```

1. **Hit site.** The module calls the starter's `beforeHit` / `onHit` for every HP or status change; the starter forwards both to the addons (`applyHitFeedback`, section 4).
   - `ev = {kind, source, target, side, amount, move, moveName, type, eff, crit, status, cause}`; `onHit` adds `hpBefore, hpAfter, killed, anchor`. `source` / `target` are creature ids, `side` is the target's side (`'own'` / `'foe'`).

     | kind | when | fields |
     |---|---|---|
     | `damage` | a hit move (`cause: 'move'`), burn at the end of a turn (`cause: 'burn'`) | `amount` after guard, crit and type; `eff` 2 / 1 / 0.5 (0 never reaches the hit site: "IT DIDN'T TOUCH …"); `crit` |
     | `heal` | Mend, Sap Drain (`cause: 'drain'`), Tonic (`cause: 'item'`) | `amount` clamped to missing HP |
     | `status` | burn / sleep / numb applied | `status` |
     | `cure` | waking up, a cure | |
   - Order: addons' `beforeHit` → HP / status change → built-in feedback (shake on strong hits and crits, white flash on crits) → addons' `onHit`.
   - The starter draws **no damage numbers** (the HP bars drain instead). An addon that adds its own shake or flash sets `GAME.flags.builtinShake = false` / `GAME.flags.builtinFlash = false`.
   - Feedback helpers: `GAME.shake(px, frames)` shakes the field (not the info boxes or menus); `GAME.flash(color, frames, alpha = 0.3)` washes the field. Both are skipped under reduced motion.
   - Host-made changes (poison floors, traps): `GAME.applyHit(targetId, kind, amount)` goes through the same hit site.
2. **Draw-effects slot.** In `render()`, `draw(g, 'fx', game)` runs on the native 240×160 context after the module's `drawScene` (backdrop, platforms, creatures, its own move effects), inside the shake translate, before the info boxes and the message box. `draw(g, 'overlay', game)` runs after the module's `drawUI`.
3. **UI rects: `GAME.uiRects()`.** `[{name, x, y, w, h}]` in native pixels from the last frame: `foeBox0`, `ownBox0` (and `…1` in doubles), `message` or `menu`, `list` (team / item list), and `result` while a between-round or end window shows. Addons place labels and effects outside these.
4. **Creature anchor: `GAME.anchor(id)`.** `{id, side, slot, x, left, top, w, h, footY, cy, dead}` in native pixels for a creature on the field (`null` when it is not out). `x` is the sprite centre, `cy` the middle of its visible part (the own creature is cut by the message box), `footY` the platform line. It does not follow the attack lunge, so labels stay put. Ids: `own-cindle-0`, `own-brookit-1`, `own-sproutle-2`, `foe-<species>-<i>`; `GAME.B.active('own' | 'foe')` and `GAME.B.team(side)` list them.
5. **Input chain.** Keys are queued (`up`, `down`, `left`, `right`, `ok`, `back`, `auto`, taps as `{tap: true, x, y}` in native px). Each tick, every key goes to the addons' `onKey` in array order; the first that returns `true` consumes it. Otherwise: `auto` toggles autoplay; any other key during autoplay hands control to the player; in a battle the key goes to the module (`B.key` / `B.tap`); on other screens OK continues.
6. **Autoplay.** `GAME.autoplay.on` (`?auto=1`, key P). The module then plays the own side by pressing the same menu keys a player would (about 0.4 s to think, 0.15 s per key) and messages advance by themselves. Its tactics: best expected damage (power × type × same-type bonus × accuracy), Mend under 45 % HP, switch out of a bad matchup. Override with `GAME.autoplay.decide = (view, game) => ({move: i, target: id} | {switchTo: id} | {item: id} | null)`; the foe side with `GAME.foeAI` (same shape). Addons must not consume `ok` / arrows during autoplay unless they mean to: the `?t=` stills rely on it.
7. **World clock.** `GAME.clock = {frame, battleFrame, paused, stop}`.
   - `GAME.pause(true)` stops the battle (timers, animations, autoplay); menus wait.
   - `GAME.hitStop(frames)`, `GAME.hitStop({ms})` or `GAME.hitStopMs(ms)` freezes the next frames of the battle (ms round up to 60 Hz frames).
   - Addons' `update(game, info)` runs every frame regardless: `dt` is the world time advanced this frame (16.67 ms, or 0 while paused or in hit-stop); `frozen`, `paused`, `hitStop` (frames left).
8. **Turn and phase events.** `onTurn(n)` when the command menu opens for turn `n`; `onPhase('command' | 'resolve' | 'replace' | 'over')`; `onEvent(ev)` for everything else the module reports (`message`, `order`, `choice`, `moveUsed`, `miss`, `immune`, `guard`, `sendOut`, `withdraw`, `faint`, `end`); `onBattleStart` after each round's battle is created, `onBattleEnd(result)` with `'win'` / `'lose'`.

`GAME.B` (the module instance, API in `../module/README.md`), `GAME.scene`, `GAME.round`, `GAME.rival` and `GAME.bag` are readable. Change battle state through the hit site and `GAME.B` only.

## Changing the game

- **Types:** `TYPES` (`strong`, `weak`, `none`, `immune`); the module multiplies over both types of a dual-type creature.
- **Moves and creatures:** `MOVES`, `SPECIES` (art is keyed by species id in `ART.species`), `TEAM`, `RIVALS` (name, stage `day` / `sunset` / `dusk`, team).
- **Items:** `BAG` and the `items` / `useItem` callbacks in `newBattle()`.
- **Pace:** `params` in `newBattle()` (`textSpeed`, `advance`, `hold`, `drain`, `format`).
