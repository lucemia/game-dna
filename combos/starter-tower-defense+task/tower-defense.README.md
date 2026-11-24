# tower-defense.js (A-16 module, v1.1.1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_TowerDefense`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns a **tower-defense field**: a grid map with a fixed road (one or more paths), towers built on the grass beside the road (never on it, so the road can never be blocked), three levels per tower, selling, a target priority per tower (first, strong, near), projectiles, splash, slow and chain lightning, armour, a wave spawner fed by data with the next wave previewed and an early-call bonus, gold, lives, speed x1 / x2, pause, win and lose, and a bot. Everything runs on a fixed step: `?t=&freeze=1` stills and `?auto=1` runs are deterministic.

It draws at 640x360 logical px (mapped into `view`, HD and devicePixelRatio-friendly when your context is scaled): the field (16 x 10 cells of 32 px at (8, 36)), the build panel on the right (528, 36, 104 x 320), the HUD on top. All art is drawn in code, original, neutral fantasy, English.

**Why a fixed road.** The other common design lets towers block an open grid and re-routes foes around them (mazing). This module picks the road: the route is readable at a glance, the wave preview and "first" priority mean the same thing for every player, and "the road is never blocked" holds by construction (`canBuild` refuses road cells). Several roads per map are supported (`paths`), and a wave group picks one or takes turns.

## Content is data

Tables merged over the built-ins (`GameDNA_TowerDefense.TOWERS / ENEMIES / MAPS / WAVES`) by `create({towers, enemies})`; an entry with the same id replaces the built-in.

```js
// a tower: levels[0].cost is the build price, levels[n].cost the price of upgrading to level n + 1
bolt: { name: 'Bolt Tower', kind: 'single', look: 'bolt', priority: 'first', air: true, ground: true, text: 'Fast single shots.',
  levels: [{ cost: 50, damage: 14, range: 2.6, rate: 1.6, type: 'physical', speed: 520 }, { cost: 45, damage: 22, range: 2.85, rate: 1.8 }, ...] }
// an enemy
crawler: { name: 'Rust Crawler', look: 'beetle', hp: 132, speed: 0.9, armor: 2, reward: 6, leak: 1, size: 9.5,
  palette: { shell: '#b0582e', dark: '#4e2214', light: '#f0a060', belly: '#2e1e18', eye: '#ffd060', spots: '#6e2a14' } }
// a map: rows '.' grass, ',' grass with flowers, 'T' tree, 'r' rock, 'b' bush, 'w' water, 'x' open but not buildable
{ name: 'Millbrook Road', gold: 200, lives: 20, rows: ['TT..,....T..r..T', ...10 rows of 16],
  paths: [[[-1, 2], [3, 2], [3, 7], [7, 7], [7, 3], [11, 3], [11, 7], [14, 7], [14, 4], [16, 4]]] }   // waypoint cells, straight runs; -1 / 16 = off the edge
// a wave
{ groups: [{ enemy: 'crawler', count: 6, gap: 1.2 }, { enemy: 'mite', count: 8, gap: 0.6, delay: 3, path: 'alt' }], reward: 30, hp: 1.1, name: 'optional banner line' }
```

| tower field | meaning |
|---|---|
| `kind` | `single` (homing bolt), `splash` (lobbed shell, aims where the foe will be, hurts all ground foes within `splash` cells, 100% at the centre to 50% at the edge), `slow` (homing shard: damage + `slow` (0..1) for `slowMs`; the strongest slow wins, never stacks), `chain` (instant: the target, then `chain` jumps to the nearest un-hit foe within `jump` cells, each x `falloff`) |
| `levels[i]` | `cost`, `damage`, `range` (cells), `rate` (shots / s), `type` (`physical` / `fire` / `frost` / `shock`), `pierce` (ignores armour), `speed` (projectile px / s) and the kind's fields |
| `air` / `ground` | which foes it may target (the mortar is ground only) |
| `priority` | default target priority for new towers (`first`, `strong`, `near`); `params.priority` overrides it for all |
| `look` | built-in painter `bolt mortar frost storm`; anything else: give `draw(ctx, tower, {t, ghost})` (origin = cell centre, the module draws the plinth and level stars) |

| enemy field | meaning |
|---|---|
| `hp`, `speed` (cells / s), `armor` (taken off each hit, min 1 damage), `reward` (gold), `leak` (lives lost at the gate), `size` (px radius) | |
| `flying` | hovers above the road (shadow below); only towers with `air` hit it |
| `boss`, `onDeath: {spawn: id, n}` | a boss bar width; foes released where it falls (they belong to the same wave) |
| `look` / `palette` | built-in painter `beetle spider moth shellback matron` with colours `{shell, dark, light, belly, eye, spots, wing, moss, horn}`; or `draw(ctx, enemy, {t, col, phase, size})`: origin at the foe, x axis = its heading (the module rotates), `col(c)` applies hit flash and frost tint, `phase` advances with distance walked (legs never slide) |

**Damage of one hit** = max(1, round(damage) - armour) (armour 0 when the tower `pierce`s), capped at the HP left. Example: a level-1 Bolt (14) on a Rust Crawler (armour 2) deals 12; a Frost Spire (5, pierce) deals 5.

**Targeting** (the whole rule; the judge recomputes it): candidates are living foes on the field within `range` cells of the tower centre that the tower may hit; `first` = least road left to the gate, `strong` = most HP now, `near` = smallest distance; ties go to least road left, then to the earlier spawn. A tower re-picks every time it fires.

## API

`GameDNA_TowerDefense.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | `{x, y, w, h}` in your logical canvas px (default 640x360 at 0,0); everything scales by `h / 360` |
| `seed` | default seed; `start({seed})` per field |
| `map`, `waves` | when given, `create` starts at once; otherwise call `start` |
| `towers`, `enemies` | tables merged over the built-ins (afterwards in `inst.lib`) |
| `shop` | tower ids in build-menu order (keys 1-9); default all towers |
| `params` | `layout` `'wide'` (640x360: field, HUD, build panel) or `'compact'` (phones: `view` shows only the field, 520x328 stage px; the host shows the HUD and panel, e.g. with `mountPanel`), `speed` 1 \| 2, `gold` (start, else the map's), `lives`, `waveGap` 12 s, `earlyBonus` 1 gold per second left, `refund` 0.7, `hpScale` 1, `priority` null (or a priority for all new towers), `ring` `'on'`, `grid` `'auto'` (`'on'` always shows build cells), `preview` `'on'`, `lane` 8 px (largest sideways offset of a foe on the road; crowded foes also drift apart), `autoStart` 0 (seconds before wave 1 starts by itself; 0 = the player sends it) |
| `onHit(ev)` | every HP change on its impact frame, after HP was written: `{kind: 'damage', source (tower id), tower (type), target (enemy id), enemy (kind), raw, armor, amount (HP actually lost), hpBefore, hpAfter, killed, type, splash?, chain? (jump index), x, y}` (stage px). **Read-only.** |
| `onEvent(ev)` | `build {tower, type, c, r, cost}`, `upgrade {tower, level, cost}`, `sell {tower, refund}`, `target {tower, priority}`, `blocked {type, c, r, why}`, `fire {tower, target, priority}`, `spawn {unit, enemy, wave, path, child}`, `death {unit, enemy, by, reward, wave}`, `leak {unit, lives, livesLeft}`, `waveStart {wave, total, bonus}`, `countdown {wave, ms}`, `waveCleared {wave, reward}`, `gold {delta, why, gold}`, `speed`, `end {result, info}` (all carry `frame`) |
| `onEnd(result, info)` | once: `'win'` \| `'lose'`, `info = {lives, gold, wave, waves, kills, leaks, towers, frame}` |
| `skin` | optional `GameDNA_Skin` id (read if `skin-api.js` is loaded; the module's own look otherwise) |

| method | |
|---|---|
| `start({map, waves, seed, shop, params})` | a new field (map object or built-in id) |
| `update(stepMs)` | every fixed step of every loop (also your `?t=` fast-forward), `0` while frozen; at speed 2 it runs two simulation steps |
| `drawScene(ctx)` / `drawUI(ctx)` | field, towers, foes, shots, effects / ring, ghost, HUD, panel, preview, banners. Your effects go between them |
| `key(k)` | `'1'..'9'` or `'tower:<id>'` (pick a tower to place), `'target:first' | 'target:strong' | 'target:near'`, `'left' 'right' 'up' 'down'` (cell cursor), `'ok'` (build here / select the tower here / upgrade the selected one), `'back'`, `'upgrade'`, `'sell'`, `'target'` (next priority), `'wave'` (send the next wave), `'speed'`, `'pause'` |
| `pointer(type, x, y)` | `'down' 'move' 'up' 'cancel'` in your logical px: tap a card then a cell, or drag a card onto the field; tap a tower; panel buttons |
| `setAuto(on)`, `auto()` | the bot: builds on the cells that cover most road, upgrades, sets priorities (splash = strong; single-shot towers = strong while a boss is out), sends waves early when the field is nearly clear, all through `key` / `pointer` |
| `build(type, c, r)`, `upgrade(id)`, `sell(id)`, `setPriority(id, p)`, `callWave()` | direct commands (same rules, same events); `canBuild(type, c, r)` -> `null` or why (`road`, `water`, `blocked`, `occupied`, `gold`, `outside`) |
| `anchor(id)` | enemy or tower id (or `'gate'`) -> `{x, top, left, w, h, cy, footY, dead}` in your px, where it is drawn now (an enemy's box includes its HP bar) |
| `unitRects()`, `uiRects()`, `fieldRect()` | living enemies and towers `{id, x, y, w, h, kind}`; HUD pills, panel, banner, toast `{name, ...}`; the field |
| `enemies()`, `towers()`, `enemy(id)`, `tower(id)`, `map()`, `waves()`, `nextWave()`, `pickTarget(towerId, p)`, `remaining(enemyId)`, `rangeOf(towerId)`, `cellAt(x, y)`, `cellCentre(c, r)`, `isRoad(c, r)` | read-only views (stage px inside the objects) |
| `state()`, `actors()` | a small snapshot; text state for checks (enemy heading and facing, tower aim and target) |
| `gold()`, `lives()`, `phase()` (`build running won lost`), `result()`, `addGold(n)`, `pause(on)`, `paused()`, `setParams(p)`, `params()`, `rng()`, `frame()`, `time()` | |
| `drawTowerIcon(ctx, id, x, y, s)`, `drawEnemyIcon(ctx, id, x, y, s)` | for your own menus |
| `panelState()` | what the HUD and build panel show, as data: `{lives, gold, wave, waves, phase, countdown, speed, paused, mode, shop: [{id, key, name, cost, can, on}], sel: {id, name, level, upgradeCost, canUpgrade, refund, priority} \| null, next: {index, line, canCall, bonus, build} \| null, message}` |
| `GameDNA_TowerDefense.mountPanel(el, inst, send)` | a ready DOM panel at CSS size (13 px text, 36 px buttons) for `layout: 'compact'`: lives, gold, wave, speed, pause, tower buttons, upgrade / sell / target, next wave and its send button; `send(key)` delivers presses (default `inst.key`); call the returned `refresh()` once per frame |

## Integration (15 lines)

```js
// <script src="tower-defense.js"></script> before your game script
const td = GameDNA_TowerDefense.create({ view: { x: 0, y: 0, w: 640, h: 360 }, seed: 7,
  towers: myTowers, enemies: myEnemies,                         // optional, merged over the built-ins
  onHit: ev => myHitFeedback(ev),                               // numbers, sounds; never change HP here
  onEvent: ev => { if (ev.kind === 'waveStart') myBanner(ev.wave); },
  onEnd: (result, info) => { myFieldOver(result, info); } });   // once
function enterField(n) { td.start({ map: myMaps[n], waves: myWaves[n], seed: 100 + n }); }
function step() { td.update(frozen ? 0 : 1000 / 60); }          // every fixed step, never behind a menu check
function draw(ctx) { td.drawScene(ctx); myEffects(ctx); td.drawUI(ctx); myHud(ctx); }
onKey(k => td.key(k));                                          // '1'-'4', arrows, 'ok', 'back', 'upgrade', 'sell', 'target', 'wave', 'speed'
onPointer((type, x, y) => td.pointer(type, x, y));               // logical px
if (autoplay) td.setAuto(true);
```

## Phones

Below about 560 px the whole 640x360 stage is too small to read. Pass `params.layout: 'compact'` and a view with the aspect 520:328 (e.g. 640 x 404): the field then fills the canvas and `drawUI` draws only the placement ring, ghost, banners and toast; put the HUD and panel under the canvas with `mountPanel(el, td, key => myKeyQueue.push(key))` (or build your own from `panelState()`).

## What it guarantees

- No tower ever stands on a road cell; foes never stand on a tower's cell (checked over full games).
- Every shot goes to the foe its tower's priority names at that moment (the rule above).
- A wave spawns exactly its data (per kind and count); the preview shows the wave that starts next.
- Gold = start + kill rewards + wave rewards + early bonuses + refunds - prices, at every event; lives = start - leaks.
- Towers fit about one cell (the art is drawn at 0.78 around the plinth's front), level shows on the plinth (grey, bronze, gold band) and as 1-3 stars drawn after everything else; a boss is drawn above the towers with a named bar at the top of the field; HP bars show only once hurt and never overlap; crowded ground foes drift apart sideways, flyers hover 20 px over their shadow.
- Foes face where they walk: the heading they are drawn rotated by is the road's tangent, and their legs advance with distance.
- Deterministic: same seed, same inputs, same frames. No `Math.random`, no wall clock. Never throws from `update` or the draw calls (one console warning per kind of problem).

## Common mistakes

- Foes stand still after a menu -> `update()` was gated by your menu; call it every step (0 while frozen).
- Taps miss cells -> pass logical px (canvas css px scaled to your logical size), not page px.
- Different game each reload -> pass a fixed `seed`; never use `Math.random` in a custom `draw`.
- Gold jumps -> your code wrote gold; use `addGold(n)` (it is a `gold` event, so ledgers stay right).
- A new tower never fires at flyers -> set `air: true`.
