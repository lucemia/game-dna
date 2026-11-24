# A-14 starter: Banners of the Vale (auto-resolved squad clash with forecast)

`index.html` is a complete single-file squad game. Your squad of five (Bryn the knight, Kael the lancer, Wren the archer, Sola the mage, Ilsa the cleric) marches through four clashes: roadside brigands at dawn, sky raiders by day, an iron column at dusk and a warlord's guard at night. Before each clash you arrange the 2x3 formation, switch each unit's tactic preset and read the **forecast**; then you commit and the clash plays out by itself in a staged side view, exactly as forecast. A won clash levels the squad; a lost one costs one of three morale banners and is fought again after a rest. All art is original procedural HD art at 640x360 logical px (devicePixelRatio-aware); the UI is in English.

It is the system element of a basket. Build your game from this file, and plug addons into the extension points below rather than editing the clash flow.

## Run

| URL / key | Effect |
|---|---|
| `?auto=1` | the computer plays the whole march: at each prep it tries swaps and tactic presets against the forecast, then presses the same keys a player would |
| `?t=<ms>&freeze=1` | fast-forward the deterministic 60 Hz simulation (autoplay on unless `&auto=0`), draw one frame; `<html data-state>` then holds `GAME.state()` |
| `?seed=n`, `?speed=0.25..4`, `?rounds=1..6`, `?reduced=1` | clash seeds, playback speed, rounds per clash, no shake / flash |
| `?art=0` | ignore `art/`: built-in vector units and the procedural backdrop (what you get when the folder is missing) |
| arrows, Z / Enter / Space, X / Esc | prep: move between your six slots and ENGAGE; Z picks a unit, Z on another slot swaps (empty slots too); Z on ENGAGE commits. Clash: Z toggles x3 speed. Result / end: Z continues |
| T (or C) | prep: next tactic preset for the unit under the cursor |
| P | toggle autoplay (any other game key also takes over from autoplay) |
| tap | slots, the tactics button, ENGAGE; during a clash: x3 speed; elsewhere: continue |

While a unit is held, Z (or a tap) on ENGAGE only drops it back, X cancels, and Right from the front row does not move to ENGAGE: a clash never starts mid-swap. Under 760 px wide, a 13 px HTML caption under the canvas (`#info`) mirrors the selected unit, its tactics, the forecast and the why line.

A march under `?auto=1` takes about 3 minutes of game time (seed 7: victory after 5-6 clashes, one or two lost or drawn).

## Structure

Four `<script>` blocks, in order:

0. The art pack's manifest (`GameDNA_SquadClashArt_Pack`, a copy of `art/pack.js`): rects, foot anchors, head circles and sizes of the painted sprites.
1. `ART`: the painted look. It loads `art/` (one WebP atlas per class with its poses, four painted backdrops of the same meadow: dawn, day, dusk, night) and gives the module `drawUnit`, `drawHead`, `looks` and `layout`. Without the images (or with `?art=0`) it paints the old procedural vale and the module draws its built-in vector units, so the game still runs as one file.
2. `GameDNA_SquadClash`: `module/squad-clash.js`, verbatim. It owns the simulation, the forecast, the playback, the unit painter, the turn-order strip, the why readout, the result banner and the forecast panel.
3. The game. It defines `window.GAME` and boots on `DOMContentLoaded`.
4. **ADDONS SLOT**: an empty, marked block where addons go.

The game script has numbered sections (search for the `=== n.` banners):

| # | Section | What is there |
|---|---|---|
| 1 | Config and content | URL flags, `CLASSES` (stats, skills, guard / follow-up traits), `SKILLS` (added skills), `PRESETS` / `PRESET_OF` (tactic rule lists), `PARTY`, `CAMPAIGN` (enemy squads, theme, level), `MORALE`, `REST`, `REVIVE`, `makeUnit()` |
| 2 | Game object | `game` (= `window.GAME`): the public surface and extension points |
| 3 | Clash setup | `makeInstance()` (one `GameDNA_SquadClash.create(...)` with all callbacks), `toPrep()`, `commit()`, `endClash()`, `afterResult()` (morale, level-up, rest) |
| 4 | Hit site | `hitSite(ev)`: built-in crit flash, then the addons' `onHit` |
| 5 | Scenes | title, prep (cursor, swaps, tactics, taps), clash, result, victory, defeat; `sceneOk()` |
| 6 | Autoplay planner | `planMoves()`: greedy search over swaps and presets scored by the forecast; `path()` turns it into key presses |
| 7 | Main tick | `tick()`: input chain → scene autoplay → `C.update()` → effects → addons' `update` |
| 8 | Drawing | `render()`: `C.drawScene` → prep cursor → `draw(g, 'fx')` → foreground grass → flash → `C.drawUI` → scene panels → top bar → `draw(g, 'overlay')` → `drawUI(g)` |
| 9 | Input | key queue (a 0 ms tap counts), canvas taps, on-screen buttons |
| 10 | Boot | `boot()` after the ADDONS SLOT: `?t` fast-forward or the main loop; `GAME.step(n)`, `GAME.render()`, `GAME.press(key)` for tests |

`C.update()` runs on every tick of every scene. Never gate it on a menu or an animation.

## Extension points

**Where addons go: the ADDONS SLOT.** Paste each addon's module and its `GAME.addons.push(...)` into the marked `<script>` block (or put `<script src>` tags right above it). The slot runs after `window.GAME` exists and **before the game boots**, so addons see the first clash and every `?t=&freeze=1` fast-forwarded frame.

```js
GAME.addons.push({
  name: 'my-addon',
  onHit(ev, game) {},              // every HP change of a clash, on its impact frame (read-only, see 1)
  onKey(key, game) { return false; },   // key = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'tactic' | 'auto' | {tap, x, y}; true consumes it
  update(game, info) {},           // every 60 Hz frame, also while frozen; info = {dt, frozen, paused, hitStop}
  draw(g, layer, game) {},         // layer 'fx' (after the units and the module's effects, before the UI) or 'overlay' (after the game's panels)
  drawUI(g, game) {},              // top UI hook: after everything, also on the title screen
  onClashStart(game) {}, onClashEnd(result, outcome, game) {},   // also onBattleStart(game) / onBattleEnd(result, game)
  onEvent(ev, game) {}, onTurn(round, game) {}, onPhase(phase, game) {}, onForecast(fc, game) {},
  onScene(scene, game) {}, onFormation(game) {}, onTactics(unit, game) {}, onNewGame(game) {}
});
```

1. **Hit site.** The module writes the new HP on the unit, then calls `onHit`; the starter adds its crit flash and forwards to the addons (`hitSite`, section 4).
   - `ev = {kind: 'damage' | 'heal', source, target, aimed, guardBy, side ('a' you / 'b' foe), amount, crit, type ('physical' | 'fire' | 'shock' | 'arcane' | 'heal'), skill, skillName, tag ('guard' | 'followUp' | null), hpBefore, hpAfter, killed, round, anchor}`. `amount` is the HP actually lost or gained. A guarded hit has `aimed` = the unit the attacker chose and `target` = the guard who took it.
   - **Read-only.** The amounts come from the forecast; changing HP here would make the clash differ from what the player was shown (the end banner then says so). Change outcomes through `CLASSES`, `SKILLS`, `PRESETS` or new conditions (section 1): they run inside the simulation, so the forecast includes them.
   - Built-in feedback: the module's hit numbers (`GAME.flags.builtinNumbers`), impact shake (`GAME.flags.builtinShake`), the crit flash (`GAME.flags.builtinFlash`). **An addon that draws its own damage numbers sets `GAME.flags.builtinNumbers = false`** (and `builtinShake = false` if it shakes itself).
   - Helpers: `GAME.shake(px, frames)` shakes the field (not the panels), `GAME.flash(color, frames, alpha = 0.3)` washes it; both skipped under reduced motion.
2. **Draw-effects slot.** `draw(g, 'fx', game)` runs on the 640x360 logical context (already scaled to the backing store), inside the shake translate, after `C.drawScene` (backdrop, units, the module's effects, HP bars, built-in numbers) and the prep cursor, before the foreground grass and the UI. `draw(g, 'overlay', game)` runs after every panel.
3. **UI rects: `GAME.uiRects()`.** `[{name, x, y, w, h}]` in logical px from the last frame: the module's `order`, `why`, `round`, `banner`, `forecast`, plus the starter's `title` / `clashTag`, `morale`, `unitCard`, `engage`, `forecastChip`, `resultBox`, `endBox`. Place things outside them.
4. **Unit anchor: `GAME.anchor(id)`** (addons that place things on units must use this live anchor and `GAME.unitRects()`, never `GAME.C.anchor(id, {home: true})`; this overrides any addon README that says to return a unit's home spot when it dashes away, because here a guard steps in and takes the hit where it stands) → `{x, footY, top, spriteTop, left, w, h, cy, s, side, row, col, dead}` in logical px where the unit is drawn now (it follows a dash or a guard's step-in; `GAME.C.anchor(id, {home: true})` gives the formation spot; a fallen unit's anchor is its lying body). `top` is the top of the HP bar above the head (use it as the "above the head" point), `x` the centre. `GAME.unitRects()` lists the drawn sprite boxes and HP bars with each unit's `id` (the obstacles to avoid). Units: `GAME.squad` (ids `bryn`, `kael`, `wren`, `sola`, `ilsa`) and `GAME.enemy` (ids like `e1-0-raptor`); anchors answer for fallen units too.
5. **Input chain.** Keys are queued; each tick every key goes to the addons' `onKey` in array order; the first that returns `true` consumes it. Otherwise `auto` toggles autoplay, any other key during autoplay hands control to the player, then the scene handles it.
6. **Autoplay.** `GAME.autoplay.on` (`?auto=1`, P). At each prep the planner (section 6) tries every swap and preset change, keeps the best by forecast score (up to 3 changes), then plays them through the real keys (9 frames apart) and commits. Override with `GAME.autoplay.plan = game => ['left', 'ok', 'up', 'ok', 'down', 'down', 'ok']` (keys from the cursor's start on ENGAGE). Addons must not consume `ok` / arrows during autoplay unless they mean to: the `?t=` stills rely on it.
7. **World clock.** `GAME.clock = {frame, clashFrame, paused, stop}`. `GAME.pause(true)` stops the clash, the effects and the autoplay; `GAME.hitStop(frames)` / `GAME.hitStopMs(ms)` freeze the next frames (ms round up to 60 Hz frames). Addons' `update(game, info)` runs every frame: `info.dt` = 16.67 ms or 0 while frozen. Freezing only delays the clash; it never changes it.
8. **Clash events.** `onClashStart` after commit; `onTurn(round)` at each round; `onEvent(ev)` for `commit`, `round` `{order}`, `skip`, `fall` `{unit, by}`, `end` `{result, match}`; `onPhase('playing' | 'done')`; `onForecast(fc)` whenever the forecast is recomputed (formation or tactics changed); `onClashEnd(result, outcome)` with `outcome.match` (forecast equalled play).
9. **Content.** Add a class to `CLASSES` (+ a look: `GameDNA_SquadClash.LOOKS` key equal to the class, or pass `looks` / `drawUnit` in `makeInstance`), a skill to `SKILLS` (`{name, kind, power, from, area, uses}`), a rule list to `PRESETS[cls]`, a condition through `create({conditions})`, an enemy squad to `CAMPAIGN`.

10. **Sprites.** `GAME.waitFor` (an array: push a Promise in the ADDONS SLOT and the boot waits for it, e.g. your own images), `GAME.drawUnit = function (ctx, unit, info)` and `GAME.drawHead = function (ctx, unit, cx, cy, r, info)` (return `true` when drawn; `false` falls through to the art pack, then to the built-in painter); addon objects may carry the same `drawUnit` / `drawHead` hooks (called with `game` as the last argument). `info` = `{x, footY, s, dir, pose, k, flash, dead, fall, t, side, ret, active}` (module README). `GAME.art` is `ART` (`ART.drawFigure(ctx, cls, x, footY, s, dir, pose)` draws a still painted figure for a menu). Checked with L-10 cutout characters in `../checks/starter+cutout/`.

`GAME.C` (the module instance, API in `../module/README.md`), `GAME.scene`, `GAME.clash`, `GAME.morale`, `GAME.squad`, `GAME.enemy`, `GAME.lastForecast`, `GAME.lastOutcome` and `GAME.results` are readable.

## Art pack (`art/`)

Keep the `art/` folder beside `index.html`: 13 class atlases (`knight`, `lancer`, `mage`, `archer`, `cleric`, `brigand`, `slinger`, `hound`, `raptor`, `ironclad`, `hexer`, `mender`, `warlord`; poses `ready` + `attack`, archers `ready` / `draw` / `loose`), `field-dawn|day|dusk|night.webp` (1600x900) and `pack.js` (the manifest that is also inlined in `index.html`). 1.8 MB in all. Every image is original and was generated once (9 images, prompts and sha256 in `../assets/`); nothing is drawn at run time except motion: breathing, an anticipation crouch, the swap to the attack pose, a short hop out and back, a recoil and a crisp flash when hit, a fade when a unit falls. Sprites are tinted per backdrop (dusk warm, night blue) so they sit in its light.

- **A new class:** add its stats to `CLASSES`; until it has an atlas it is drawn by the module's built-in painter (give it a `LOOKS` entry). To paint it, add `art/<class>.webp` and an entry in the manifest (`poses.<name>.rect` and `.foot` in atlas px, `head` `[cx, cy, r]`, `w` / `h` = its logical box at unit scale 1; atlas px = logical px x `px`), or draw it yourself through `GAME.drawUnit`. Every atlas looks RIGHT (`facing: 'right'`, the default). `ART` computes the mirror in one place, `flipX = (want !== facing)`: a class that also has `art/<class>-left.webp` and a `left: {file, size, poses, head}` entry in the manifest is drawn from that picture, un-mirrored, when it must look left (the eight classes the scenarios put on the enemy side have one, so a shield stays on its arm and the painted light stays upper left); a class without it is mirrored.
- **Another place:** replace the four `field-*.webp` (16:9, flat ground in the lower half, horizon near 47 % of the height) or change `ART.backdrop`.
- **Your own renderer** (a bone rig, sprite sheets): extension point 10.

## Adding damage numbers (e.g. C-11 damage-pop)

```js
GAME.flags.builtinNumbers = false;
const dp = GameDNA_DamagePop.create({ bounds: { x: 0, y: 0, w: 640, h: 300 },
  getAnchor: id => GAME.anchor(id),   // live position (never {home: true}): guarded hits land on the guard getObstacles: () => GAME.unitRects().concat(GAME.uiRects()), onHitStop: ms => GAME.hitStopMs(ms) });
GAME.addons.push({ name: 'damage-pop',
  onHit(ev) { dp.spawn(ev.target, ev.amount, ev.kind === 'heal' ? 'heal' : ev.crit ? 'crit' : 'damage', { type: ev.type, crit: ev.crit }); },
  update(game, info) { dp.update(info.dt); }, draw(g, layer) { if (layer === 'fx') dp.draw(g); }, onClashStart() { dp.clear(); } });
```
