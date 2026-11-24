# A-11 starter: The Long Vigil (horde survival)

`index.html` is a complete single-file horde survival game. A lone lantern keeper holds a night meadow: weapons strike on their own (it starts with the Seeker Bolt), foes pour in from every side for 200 s in rising waves (hopping bog slimes, flying ember imps and storm harpies, drifting marsh wisps, gliding ash cultists who throw ember orbs, ash hierophant elites), each level offers one of three upgrades, and at 3:20 the Moss Colossus wakes. Kill it, or hold out 90 s more until dawn, and DAWN BREAKS; fall and you are FALLEN. The results panel shows the time, foes felled, level and weapons. All gameplay art is drawn by the module in code except the cast and the icons: the foes are the library's painted demo-kit set (`art/kit.js` + `art/cast-art.js`), the hero is the H-05 lantern keeper walk sheet (idle + 4 walk poses) and the weapon / upgrade icons are the L-06 painted-ui atlas (`art/vigil-art.js`); all data URIs, loaded before the game. 640x360 logical px in landscape; a portrait phone gets a 360-wide view as tall as the screen (HUD at CSS size); devicePixelRatio-aware; UI in English.

It is the system element of a basket. Build your game from this file and plug addons and new content into the extension points below rather than editing the run itself.

## Run

| URL / key | Effect |
|---|---|
| `?auto=1` | the computer plays (look-ahead steering through the same input as a player, upgrade picks with the same keys) |
| `?t=<ms>&freeze=1` | fast-forward the deterministic 60 Hz simulation (autoplay on unless `&auto=0`), draw one frame; `window.__frozen` is then true and `<html data-state>` holds `GAME.state()` |
| `?seed=n`, `?speed=0.25..4`, `?reduced=1`, `?cap=n`, `?duration=s` | run seed (default 7), playback speed, no shake / flash, enemy cap, seconds until the boss |
| arrows / WASD, or drag on the canvas | walk (a drag is a touch stick) |
| Left / Right, Z / Enter / Space, or tap a card | choose and take a level-up card |
| Z | start (title), back to the title (results) |
| P | toggle autoplay (any other game key takes over from autoplay) |

A run under `?auto=1` (seed 7) is won by killing the boss at 4:08 of run time (1044 foes felled, level 13; the results screen shows from about 264 s after load). The run is the same in landscape and portrait. The bot wins 6 of seeds 1-8 in the module's own check (`checks/rules.json`, botRuns).

## Structure

Script blocks, in order:

1. `art/cast-art.js`, `art/kit.js`: the demo-kit painted cast (`GameDNA_DemoKit`).
2. `GameDNA_HordeSurvival`: `module/horde-survival.js`, verbatim. It owns the rules, the waves, the bot, the level-up window, the HUD, the ground, shots, gems and effects.
3. The game. It defines `window.GAME` and boots on `DOMContentLoaded` (after the kit's images are decoded).
4. **ADDONS SLOT**: an empty, marked block where addons and new content go.

The game script has numbered sections (search for the `=== n.` banners):

| # | Section | What is there |
|---|---|---|
| 1 | Config and content | URL flags, `LOOKS` (module look -> demo-kit sprite id), `HERO_H`, `HERO_FRAMES`, `ICONS` (module icon name -> painted atlas cell), `PARAMS`, `START_WEAPONS`, `RESULT_HOLD` |
| 2 | Game object | `game` (= `window.GAME`): the public surface and extension points |
| 3 | Run setup | `makeInstance()` (one `GameDNA_HordeSurvival.create(...)` with `paintActor`: the keeper sheet for the hero, the kit for foes; `icons` from the atlas), `paintHero`, `iconFns`, `newRun()`, `endRun()` |
| 4 | Hit site | `hitSite(ev)`: hurt flash, boss-kill shake, then the addons' `onHit` |
| 5 | Scenes | title, play, victory, defeat; `sceneAuto()`, `sceneKey()` |
| 6 | Main tick | `tick()`: key queue through the addons' `onKey` -> scene keys -> pointer -> held keys to `H.setInput` -> `H.update()` -> addons' `update` |
| 7 | Drawing | `render()`: `H.drawWorld` -> vignette -> `draw(g, 'fx')` -> `H.drawUI` -> flash -> title / results panels -> `draw(g, 'overlay')` -> `drawUI(g)` |
| 8 | Input | key queue (a 0 ms tap counts), `GAME.held`, pointer -> logical px |
| 9 | Boot | `maybeBoot()` (waits for `GAME.holdBoot()` releases and the kit): `?t` fast-forward or the main loop; `GAME.step(n)`, `GAME.render()`, `GAME.press(key)`; `window.__state()` for the facing tools |

`H.update()` runs on every tick of a run. Never gate it on a menu or an animation (the module pauses itself under the level-up window).

## Extension points

**Where addons and content go: the ADDONS SLOT.** Paste each addon's module and its `GAME.addons.push(...)`, and every `GAME.addWeapon / addEnemy / addUpgrade`, into the marked `<script>` block (or put `<script src>` tags right above it). The slot runs after `window.GAME` exists and **before the game boots**, so addons and content are there for the first run and every `?t=&freeze=1` frame.

```js
GAME.addons.push({
  name: 'my-addon',
  onHit(ev, game) {},              // every HP change, on its frame (read-only, see 1)
  onKey(key, game) { return false; },   // key = 'left' | 'right' | 'up' | 'down' | 'ok' | 'back' | 'auto'; true consumes it
  update(game, info) {},           // every 60 Hz tick, every scene; info = {dt, frozen, paused, scene}
  draw(g, layer, game) {},         // 'fx' (play: after the world, before the HUD) or 'overlay' (after every panel, every scene)
  drawUI(g, game) {},              // top UI hook: after everything
  onRunStart(game) {}, onRunEnd(result, info, game) {}, onScene(scene, game) {},
  onEvent(ev, game) {}, onKill(ev, game) {}, onLevel(level, game) {}, onPick(ev, game) {}
});
```

1. **Hit site.** The module writes the new HP, then calls `onHit`; the starter adds its hurt flash and forwards to the addons (`hitSite`, section 4).
   - `ev = {kind: 'damage' | 'heal', target ('hero' or a foe id 'e<n>'), enemy (kind), source ('bolt' | 'blades' | 'pulse' | 'lance' | 'arrow' | 'slam' | a foe kind | 'potion' | 'regen' ...), amount, hpBefore, hpAfter, killed, x, y (WORLD px, the body centre), boss, elite}`. Convert with `GAME.H.worldToScreen(ev.x, ev.y)`, or use `GAME.anchor(ev.target)` (a killed foe's anchor stays answerable with `dead: true`).
   - **Read-only.** Change outcomes through content (weapons, foes, upgrades).
   - Built-in feedback: the module's hit numbers (`GAME.flags.builtinNumbers`), the boss-kill shake (`builtinShake`), the hurt flash (`builtinFlash`). **An addon that draws its own damage numbers sets `GAME.flags.builtinNumbers = false`** in the slot.
   - Helpers: `GAME.shake(px)`, `GAME.flash(color, frames, alpha = 0.3)` (both skipped under reduced motion), `GAME.hitStop(frames)` / `GAME.hitStopMs(ms)` (only delays the world).
2. **Draw-effects slot.** `draw(g, 'fx', game)` runs on the 640x360 logical context (already scaled to the backing store) during a run, after the world (ground, gems, cast, shots, the module's numbers) and before the HUD and the level-up window. `draw(g, 'overlay', game)` runs after every panel in every scene.
3. **UI rects: `GAME.uiRects()`.** `[{name, x, y, w, h}]` in logical px from the last frame: the module's `xpBar`, `level`, `timer`, `kills`, `slots`, `bossBar`, `alert`, `stick`, `levelTitle`, each `card` and the `banner`, plus the starter's `title`, `titlePanel`, `results`. Place things outside them.
4. **Unit anchor: `GAME.anchor(id)`** -> `{x, footY, top, left, w, h, cy, dead}` in logical px where the unit is drawn this frame (camera and shake included); the hero is `'hero'`, foes are `'e<n>'` (`GAME.H.enemies()` lists the on-screen ones). `GAME.unitRects()` lists the hero and every on-screen foe's sprite box with its `id`: the obstacles to avoid.
5. **Input chain.** Keys are queued; each tick every key goes to the addons' `onKey` in array order; the first that returns `true` consumes it. Otherwise `auto` toggles autoplay, any other key during autoplay hands control to the player, then the scene handles it. Walking reads **`GAME.held`** (`{ArrowLeft: true, ...}` by `KeyboardEvent.key`), maintained by keydown / keyup only. Pointer events go to `GAME.H.pointer` (stick and cards).
6. **Autoplay.** `GAME.autoplay.on` (`?auto=1`, P). The module's bot walks and picks cards through the same input. Addons must not consume arrows or `ok` during autoplay unless they mean to.
7. **World clock.** `GAME.clock = {frame, runFrame, paused}`. `GAME.pause(true)` stops the run; addons' `update(game, info)` runs every tick, `info.dt` = 16.67 ms or 0 while paused.
8. **Run events.** `onRunStart` after `start()`; `onEvent(ev)` for every module event (`wave`, `boss`, `slam`, `fire {weapon}`, `level`, `offer`, `pick`, `death`, `pickup`, `won`, `lost`); `onKill`, `onLevel`, `onPick`; `onRunEnd(result, info)` once.
9. **Content.** In the ADDONS SLOT (or section 1):
   - `GAME.addWeapon(id, def)`: a weapon (format in `module/README.md`, kinds `orbit`, `nearest`, `pulse`, `lance` or `custom` with `fire(api, w, lv)`); it joins the level-up pool at once. `GAME.startWeapons.push(id)` also gives it from the start.
   - `GAME.addEnemy(id, def, {mix: {from, to, weight}, event: {at, kind, n}, look: '<demo-kit id>'})`: a foe; `mix` adds it to every wave segment overlapping [from, to) seconds (of the 200 s table), `event` adds one scripted wave (`ring`, `burst`, `elite`). Its `look` is drawn with the demo-kit sprite named in `GAME.looks[look]` (`slime imp wisp harpy cultist golem`); pass `look` in the options to map a new look name to one of them; an unmapped look gets the module's built-in creature in `palette` colours. Give it a `gait` that fits single-pose art: `hop` (blobs), `fly`, `float`, `glide` (robes), `stomp` (big and slow).
   - `GAME.addUpgrade(id, def)`: a passive (`stat` + `per`, or `apply(hero, level, api)`).
   - The tables are readable as `GAME.weapons`, `GAME.enemies`, `GAME.upgrades`, `GAME.waves` (your additions), `GAME.H.lib` (everything live). `GAME.shipped` lists the ids this file ships with.
   - If something loads asynchronously, take `const release = GAME.holdBoot()` in the slot and call `release()` when ready, so frozen stills include it.

`GAME.H` (the module instance, API in `../module/README.md`), `GAME.scene`, `GAME.results`, `GAME.state()` are readable.

## Adding damage numbers (e.g. C-11 damage-pop)

```js
GAME.flags.builtinNumbers = false;
const dp = GameDNA_DamagePop.create({ bounds: { x: 0, y: 0, w: 640, h: 360 },
  getAnchor: id => GAME.anchor(id),                                  // where the unit is drawn now (world -> screen done for you)
  getObstacles: () => GAME.uiRects() });                              // never the HUD; foes are many, numbers may sit over them
GAME.addons.push({ name: 'damage-pop',
  onHit(ev) { if (ev.amount <= 0) return;
    if (ev.target === 'hero') dp.spawn('hero', ev.amount, ev.kind === 'heal' ? 'heal' : 'damage');
    else dp.spawn(ev.target, ev.amount, 'damage', { crit: ev.amount >= 50 }); },
  update(game, info) { dp.update(info.dt); }, draw(g, layer) { if (layer === 'fx') dp.draw(g); }, onRunStart() { dp.clear(); } });
```

With hundreds of hits a second, keep the addon's own cap (merge nearby numbers) or numbers will cover the swarm.

## Adding a weapon, a foe and an upgrade

```js
GAME.addWeapon('ember-ring', { name: 'Ember Ring', icon: 'might', kind: 'pulse', color: '#ff9a50', text: 'A small fire ring, often.',
  levels: [{ cd: 1200, r: 56, dmg: 7, knock: 40 }, { cd: 1100, r: 62, dmg: 9, knock: 45 }, { cd: 1000, r: 70, dmg: 12, knock: 50 }] });
GAME.addEnemy('bog-crawler', { name: 'Bog Crawler', look: 'slime', gait: 'hop', h: 26, r: 10, hp: 14, speed: 44, dmg: 7, xp: 2, mass: 1.4, move: 'chase' },
  { mix: { from: 40, to: 200, weight: 2 }, event: { at: 60, kind: 'ring', n: 16 } });
GAME.addUpgrade('iron-skin', { name: 'Iron Skin', icon: 'heart', text: '+30 max HP, heals 30.', max: 3, stat: 'maxHp', per: 30 });
```
