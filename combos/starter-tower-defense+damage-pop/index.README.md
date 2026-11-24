# A-16 starter: The Thornwall Watch (tower placement & wave spawner)

`index.html` is a complete single-file tower-defense game. A brood of giant beetles, spiders and moths marches on the river villages. You hold two fields in a row: **Millbrook Road** (one winding road, six waves, a swarm at the end) and the **Twin Fords** (two roads that meet before the gate, seven waves, the Brood Matron last). Build towers on the grass beside the road (never on it), upgrade them, sell them, choose whom each one shoots, send waves early for gold. All art is drawn in code at 640x360 logical px (devicePixelRatio-aware); the UI is in English.

It is the system element of a basket. Build your game from this file and plug addons and new content into the extension points below rather than editing the field flow.

## Run

| URL / key | Effect |
|---|---|
| `?auto=1` | the computer plays the whole campaign (it picks cells, builds, upgrades, sets priorities and sends waves through the same input path) |
| `?t=<ms>&freeze=1` | fast-forward the deterministic 60 Hz simulation (autoplay on unless `&auto=0`), draw one frame; `<html data-state>` then holds `GAME.state()`, `window.__frozen` is true |
| `?compact=1` / `?compact=0` | force the phone layout on or off (automatic under 560 px: the canvas shows only the field, the HUD and build panel become buttons under it, `#tdpanel`) |
| `?seed=n`, `?field=2`, `?reduced=1` | seeds, start at the second field (testing), no shake / flash |
| 1-4, or tap / drag a card | pick a tower to place (the range ring and a green ghost follow; a red cell with a cross and a message = cannot build there) |
| arrows, Z / Enter / Space, X / Esc | move the cell cursor, build here / select the tower here / upgrade the selected tower, cancel |
| U, S, T | upgrade, sell (70% back), next target priority (First, Strong, Near) of the selected tower |
| N, F, Q, P | send the next wave (early: +1 gold per second left), speed x1 / x2, pause, toggle autoplay (any other game key takes over from autoplay) |

A run under `?auto=1` takes about 320 s of game time (seed 7: both fields held, 19 and 11 lives left). A player who never builds loses both fields; the bot wins both. Under 760 px wide a 13 px HTML caption under the canvas (`#info`) mirrors lives, gold, wave and the next wave; under 560 px the phone layout replaces it during a field.

## Structure

Four `<script>` blocks, in order:

1. `GameDNA_TowerDefense`: `module/tower-defense.js`, verbatim. It owns the rules, the field, the towers, the foes, the waves, the HUD and panels, the bot.
2. The game. It defines `window.GAME` and boots on `DOMContentLoaded`.
3. **ADDONS SLOT**: an empty, marked block where addons and new content go.

The game script has numbered sections (search for the `=== n.` banners):

| # | Section | What is there |
|---|---|---|
| 1 | Config and content | URL flags, `TOWERS` / `ENEMIES` (added to the module's built-ins), `SHOP` (build menu order), `FIELDS` (name, map, waves), `PARAMS` |
| 2 | Game object | `game` (= `window.GAME`): the public surface and extension points |
| 3 | Field setup | `makeInstance()` (one `GameDNA_TowerDefense.create(...)`), `newGame()`, `startField()`, `endField()`, `afterField()` |
| 4 | Hit site | `hitSite(ev)`: boss-kill shake, then the addons' `onHit` |
| 5 | Scenes | title, map (the march between fields), field, victory, defeat; `sceneAuto()` |
| 6 | Main tick | `tick()`: input chain -> scene autoplay -> `C.update()` -> effects -> addons' `update` |
| 7 | Drawing | `render()`: `C.drawScene` -> `draw(g, 'fx')` -> flash -> `C.drawUI` -> scene panels -> `draw(g, 'overlay')` -> `drawUI(g)` |
| 8 | Input | key queue (a 0 ms tap counts), pointer down / move / up queue, `GAME.held` |
| 9 | Boot | `boot()` after the ADDONS SLOT (waits for `GAME.holdBoot()` releases): `?t` fast-forward or the main loop; `GAME.step(n)`, `GAME.render()`, `GAME.press(key)` for tests; `window.__state()` |

`C.update()` runs on every tick of a field. Never gate it on a menu or an animation.

## Extension points

**Where addons and content go: the ADDONS SLOT.** Paste each addon's module and its `GAME.addons.push(...)`, and every `GAME.addTower / addEnemy / addWave / addField`, into the marked `<script>` block (or put `<script src>` tags right above it). The slot runs after `window.GAME` exists and **before the game boots**, so addons and content are there for the first field and every `?t=&freeze=1` fast-forwarded frame.

```js
GAME.addons.push({
  name: 'my-addon',
  onHit(ev, game) {},              // every HP change of an enemy, on its impact frame (read-only, see 1)
  onKey(key, game) { return false; },   // key = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'upgrade' | 'sell' | 'target' | 'wave' | 'speed' | 'pause' | 'auto' | '1'..'9' | {tap, x, y}; true consumes it
  update(game, info) {},           // every 60 Hz frame, every scene, also while frozen; info = {dt, frozen, paused, hitStop, speed}
  draw(g, layer, game) {},         // layer 'fx' (field: after foes, towers, shots and the module's effects, before the HUD and panel) or 'overlay' (after every panel, every scene)
  drawUI(g, game) {},              // top UI hook: after everything, every scene
  onFieldStart(game) {}, onFieldEnd(result, info, game) {},
  onEvent(ev, game) {}, onWave(wave, game) {}, onBuild(ev, game) {},
  onScene(scene, game) {}, onNewGame(game) {}
});
```

1. **Hit site.** The module writes the new HP, then calls `onHit`; the starter adds its boss-kill shake and forwards to the addons (`hitSite`, section 4).
   - `ev = {kind: 'damage', source (tower id), tower (type), target (enemy id), enemy (kind), raw, armor, amount (HP actually lost), hpBefore, hpAfter, killed, type ('physical' | 'fire' | 'frost' | 'shock'), splash (true for mortar blasts), chain (jump index of a lightning hit), x, y}`.
   - **Read-only.** Change outcomes through content (towers, enemies, waves): it runs inside the rules, so targeting and the bot see it.
   - The module draws no damage numbers (only "+gold" on kills). Feedback helpers: `GAME.shake(px, frames)`, `GAME.flash(color, frames, alpha = 0.3)` (both skipped under reduced motion; `GAME.flags.builtinShake / builtinFlash` turn the starter's own off), `GAME.hitStop(frames)` / `GAME.hitStopMs(ms)` (freezes the field; it only delays it).
2. **Draw-effects slot.** `draw(g, 'fx', game)` runs on the 640x360 logical context (already scaled to the backing store) during a field, inside the shake translate, after `C.drawScene` (ground, towers, foes, shots, the module's effects and HP bars), before the HUD, panel, ghost and banners. `draw(g, 'overlay', game)` runs after every panel in every scene.
3. **UI rects: `GAME.uiRects()`.** `[{name, x, y, w, h}]` in logical px: the module's `stats` and `wave` pills, `speed` and `pause` buttons, the build `panel`, the `banner` while one shows, the `toast`, plus the starter's scene panels (`marchPanel`, `endBox`). `GAME.fieldRect()` is the play field (8, 36, 512 x 320 in the wide layout; in the phone layout it fills the canvas and the HUD and panel are DOM, so read it, never hard-code it). Place things inside the field and outside these rects.
4. **Unit anchor: `GAME.anchor(id)`** (live) -> `{x, top, left, w, h, cy, footY, dead}` in logical px for an enemy (`e12`; its box includes the HP bar above it; `cy` = body centre, flyers included) or a tower (`t3`); `'gate'` = the gate. `GAME.unitRects()` lists every living enemy and every tower with its `id` and `kind`: the obstacles to avoid. Anchors answer while an enemy plays its death fade.
5. **Input chain.** Keys and taps are queued; each tick every key (and every pointer-down as `{tap, x, y}`) goes to the addons' `onKey` in array order; the first that returns `true` consumes it. Otherwise `auto` toggles autoplay, any other key during autoplay hands control to the player, then the scene handles it (field: `GAME.C.key` / `GAME.C.pointer`). **`GAME.held`** (`{ArrowLeft: true, ...}` by `KeyboardEvent.key`) is maintained by keydown / keyup only.
6. **Autoplay.** `GAME.autoplay.on` (`?auto=1`, P). The module's bot plays through the real input path (about one action every 0.4 s). Addons must not consume `ok`, digits or `wave` during autoplay unless they mean to: the `?t=` stills rely on it.
7. **World clock.** `GAME.clock = {frame, fieldFrame, paused, stop}`. `GAME.pause(true)` stops the field (the module's own Pause button is `GAME.C.pause()`); `GAME.hitStop` freezes the next frames. Addons' `update(game, info)` runs every frame: `info.dt` = 16.67 ms, or 0 while frozen; at speed x2 the module runs two simulation steps per frame (`info.speed`).
8. **Field events.** `onFieldStart` after `start`; `onWave(n)` when wave n starts; `onBuild(ev)` for build / upgrade / sell; `onEvent(ev)` for every rules event (`fire`, `spawn`, `death`, `leak`, `waveCleared`, `countdown`, `gold`, `target`, `blocked`, `end`, ...); `onFieldEnd(result, info)`.
9. **Content.** In the ADDONS SLOT (or section 1):
   - `GAME.addTower(id, def)`: a tower (format in `../module/README.md`), added to the build menu (next number key). Without a built-in `look` give `draw(ctx, tower, {t, ghost})`.
   - `GAME.addEnemy(id, def, {field, wave, count, gap, delay, path})`: an enemy; with `field` (0-based) and `wave` (1-based) it also marches in that wave (a wave past the end is appended).
   - `GAME.addWave(field, wave, at)`, `GAME.addField({name, map, waves})`: more waves, another field (map = a built-in id `millbrook` / `twinford` / `switchback` or a map object).
   - The tables are also readable and editable as `GAME.towers`, `GAME.enemies`, `GAME.shop`, `GAME.fields`, `GAME.params`. `GAME.shipped` lists the ids this file ships with.

`GAME.C` (the module instance, API in `../module/README.md`), `GAME.scene`, `GAME.field`, `GAME.results`, `GAME.lastEnd` and `GAME.state()` are readable.

## Adding damage numbers (e.g. C-11 damage-pop)

```js
const dp = GameDNA_DamagePop.create({ bounds: () => GAME.fieldRect(),
  getAnchor: id => GAME.anchor(id),                                 // live position; keeps answering while a foe fades out
  getObstacles: () => GAME.unitRects().concat(GAME.uiRects()), onHitStop: ms => {} });   // no hit-stop: waves keep flowing
GAME.addons.push({ name: 'damage-pop',
  onHit(ev) { if (ev.amount > 0) dp.spawn(ev.target, ev.amount, 'damage', { type: ev.type === 'frost' ? 'ice' : ev.type }); },
  update(game, info) { dp.update(info.dt * (info.speed || 1)); }, draw(g, layer) { if (layer === 'fx') dp.draw(g); }, onFieldStart() { dp.clear(); } });
```

Many small hits land every second: keep the module's merge on (hits on one foe within 600 ms roll into one number).

## Adding a tower and an enemy

```js
GAME.addTower('thorn', { name: 'Thorn Spitter', kind: 'single', look: 'bolt', priority: 'strong', air: false, ground: true, text: 'Heavy thorns, ground only.',
  levels: [{ cost: 70, damage: 30, range: 2.2, rate: 0.9, type: 'physical', speed: 420 }, { cost: 60, damage: 46, range: 2.4, rate: 1 }, { cost: 90, damage: 70, range: 2.6, rate: 1.1 }] });
GAME.addEnemy('ember-mite', { name: 'Ember Mite', look: 'beetle', hp: 70, speed: 1.4, armor: 1, reward: 5, leak: 1, size: 8,
  palette: { shell: '#d8642a', dark: '#4a160a', light: '#ffc070', belly: '#2a120a', eye: '#fff0a0', spots: '#7a2008' } }, { field: 0, wave: 3, count: 6, gap: 0.7, delay: 2 });
```
