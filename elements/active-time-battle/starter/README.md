# A-01 starter: Ruin Skirmish (active-time battle)

`index.html` is a complete single-file active-time gauge battle. Every combatant's gauge fills in real time. A full hero gauge opens that hero's command window (Attack / Magic / Defend; spells are Flame, Frost, Mend and Quicken). Enemies act on their own gauges. Two enemy waves loop, with a victory or defeat window between battles. All art is original procedural pixel art at 256×224, and the UI is in English.

It is the system element of a basket. Build your game from this file, and plug addons into the extension points below rather than editing the battle flow.

## Run

| URL / key | Effect |
|---|---|
| `?auto=1` | the computer plays (cursor moves like a person) |
| `?t=<ms>&freeze=1` | fast-forward the deterministic 60 Hz simulation with autoplay, draw one frame (screenshots) |
| `?mode=active` / `?mode=wait` | Active: enemies act while a menu is open. Wait: time stops while a menu is open; the menu still takes input |
| `?speed=0.5..2`, `?status=none\|haste\|slow`, `?seed=n` | gauge speed, party-wide status, random seed |
| arrows, Z / Enter / Space, X / Esc | move, confirm, back |
| M | toggle Active / Wait |
| P | toggle autoplay (any other game key also takes over from autoplay) |

## Structure

The file has five `<script>` blocks, in order:

1. `RK`: art kit (sprites, windows, 5×7 font, effects).
2. The forest-ruin backdrop.
3. `GameDNA_ATB`: `module/active-time-battle.js`, verbatim. It owns the clock, gauges, ready line, action queue, Wait/Active, haste/slow and battle end.
4. The game. It defines `window.GAME` and boots on `DOMContentLoaded`.
5. **ADDONS SLOT**: an empty, marked block where addons go.

The game script has numbered sections. Search for the `=== n.` banners:

| # | Section | What is there |
|---|---|---|
| 1 | Config and content | Heroes, waves, commands, spells, action timings |
| 2 | Game object | `game`, the public surface and extension points |
| 3 | Battle setup | `newBattle()`: actors, positions, the `GameDNA_ATB` instance and its callbacks |
| 4 | Actions | `startAction(a, done)` (called by the module), `stepAnimation()`, `resolveAction()` (rules at the hit frame), `checkEnd()` |
| 5 | Hit site | `applyHit(ev)` |
| 6 | Command menu | `openMenu()` (called by the module), `decide()` (autoplay tactics), `autoMenu()`, `menuKey()`, `confirm()` → `ATB.submit()` |
| 7 | Main tick | `tick()`: input chain → autoplay menu → animation → `ATB.update()` → addons' `update` |
| 8 | Drawing | `drawField()`, `drawHud()` (rows laid out by `ATB.layoutRow`), `render()`, integer-scaled screen |
| 9 | Input | Key queue: a 0 ms tap counts |
| 10 | Boot | `boot()` on DOMContentLoaded: first battle, `?t` fast-forward, main loop |

The menu, the current animation and `ATB.update()` all run on every tick. Never gate one on another: that is what keeps Active mode active and Wait mode responsive.

## Extension points

**Where addons go: the ADDONS SLOT.** Paste each addon's module and its `GAME.addons.push(...)` into the marked `<script>` block (or put `<script src>` tags there). The slot runs after `window.GAME` exists and **before the battle boots**, so addons see the first `onBattleStart` and every `?t=&freeze=1` fast-forwarded frame. Registering later (from the console or after load) works, but misses what has already happened, including the frozen screenshot frame.

An addon is a plain object. Every hook is optional:

```js
GAME.addons.push({
  name: 'my-addon',
  beforeHit(ev, game) {},          // change ev.amount / ev.kind before it is applied
  onHit(ev, game) {},              // after: ev.hpBefore, ev.hpAfter, ev.killed, ev.frame
  onKey(key, game) { return false; },   // return true to consume the key
  update(game, info) {},           // every 60 Hz frame, also while frozen; info below
  draw(g, layer, game) {},         // layer 'fx' (after actors, before HUD) or 'overlay' (after HUD)
  onBattleStart(game) {}, onBattleEnd(result, game) {}
});
```

1. **Hit site: `applyHit(ev)`, also `GAME.applyHit`.** Every HP, MP and status change goes through it.
   - Event: `ev = {source, target, kind, amount, crit, element, status, seconds, cause, quiet}`. The kinds:

     | kind | when | fields |
     |---|---|---|
     | `damage` | attack, Flame / Frost, enemy attack | `amount` (after Defend halving), `crit` (attacks only, 8 %), `element` `'fire'`/`'ice'` or null |
     | `heal` | Mend | `amount` clamped to missing HP, `element: 'heal'` |
     | `mp` | **every spell cost**, sent on the caster before the spell's effect, with `quiet: true` | `amount` = MP spent, `source === target` |
     | `status` | Quicken | `status: 'haste'`, `seconds: 20`, no `amount` |
     | `guard` | Defend | `source === target`, no `amount` |

     A damage-number addon usually draws only `damage` and `heal`, and skips `quiet` events.
   - Order: addons' `beforeHit`, then apply (Defend halves damage), then built-in feedback (pop number, shake, sparks, death), then addons' `onHit`.
   - An addon that draws its own numbers or shake sets `GAME.flags.builtinPopups = false` or `GAME.flags.builtinShake = false`.
   - Screen feedback for addons: `GAME.shake(px, frames)` shakes the field (not the HUD), and `GAME.flash(color, frames, alpha = 0.3)` flashes the field in a colour, fading out. Both are skipped under `prefers-reduced-motion`.
   - Hook list: `game.addons[*].beforeHit`, `game.addons[*].onHit`.
2. **Draw-effects slot.** In `render()`, `draw(g, 'fx', game)` runs on the native 256×224 buffer, after the field (backdrop, actors, built-in effects, banner, mode plate) and before the HUD. `draw(g, 'overlay', game)` runs after the HUD. The HUD is not shaken.
   - Hook list: `game.addons[*].draw`.
3. **UI rects: `GAME.uiRects()`.** Returns `[{name, x, y, w, h}]` in native pixels: `modePlate`, `hudLeft`, `hudRight`, and `banner` and `result` while they are visible. Addons place labels and effects outside these.
4. **Actor anchor: `GAME.anchor(id)`.** Returns `{id, side, x, footY, top, cy, left, w, h, dead}` in native pixels. Here `x` is the centre, `top` the sprite top, `cy` the body centre and `footY` the ground line. Ids are `rowan`, `mira`, `bram`, `ilsa` and the enemy ids in `WAVES`; `GAME.B.party` / `GAME.B.mons` list the live ones.
5. **Input chain.** Keys are queued (`up`, `down`, `left`, `right`, `ok`, `back`, `mode`, `auto`). Each tick, every key goes to the addons' `onKey` in array order; the first that returns `true` consumes it. Otherwise the game handles it. A game key during autoplay hands control to the player, except `mode` and `auto`.
6. **Autoplay.** `GAME.autoplay.on` turns it on. `decide(hero)` builds a plan `{cmd: 0 Attack | 1 Magic | 2 Defend, sub, target}`: heal the weakest ally under 45 % HP, sometimes Quicken, mages cast, others attack a random enemy. `autoMenu()` then plays the plan through the normal menu (about 260 ms to look, 120 ms per row, 400 ms on the target) and `confirm()`s it. Results therefore reach the same hit site.
   - To change tactics, set `GAME.autoplay.decide = (hero, game) => plan` (return null to fall back to the default).
   - Addons must not consume `ok` / arrows during autoplay unless they mean to. The `?t=` screenshots rely on autoplay.
7. **World clock.** `GAME.clock = {frame, battleFrame, paused, stop}`.
   - `GAME.pause(true)` stops the battle: gauges, actions and sprite animation.
   - `GAME.hitStop(frames)`, `GAME.hitStop({ms})` or `GAME.hitStopMs(ms)` freezes exactly that many following frames (ms are rounded up to 60 Hz frames: 50 ms = 3 frames).
   - Addons' `update(game, info)` runs every frame regardless, and menu input is still processed. `info = {dt, frozen, paused, hitStop}`:
     - `dt` is the world time advanced this frame, 16.67 ms or 0. Use it to age your own effects so they freeze with the hit-stop.
     - `frozen` is true when the world did not advance this frame.
     - `hitStop` is the frames of hit-stop still left after this one.
     - The world keeps advancing under the victory / defeat window.
   - The battle mode itself is `GAME.ATB.set({mode})`; `GAME.ATB.clockRuns()` tells whether gauges are filling.

`GAME.B` (battle state), `GAME.menu` (open command window) and `GAME.ATB` (module instance, API in `../module/README.md`) are readable. Change battle state through the hit site and `GAME.ATB` only.
