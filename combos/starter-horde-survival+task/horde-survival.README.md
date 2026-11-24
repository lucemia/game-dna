# horde-survival.js (A-11 module, v1.2.0)

One plain script, no dependencies, no `import`/`export`, ASCII only. It defines one global, `GameDNA_HordeSurvival`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns a **horde survival run**: the hero walks, weapons fire by themselves on timers, foes spawn off-screen in rising waves and swarm, kills drop XP gems that fly to the hero, each level pauses the world for a pick-1-of-N upgrade, a timer and kill count run, a boss arrives at the end, and the run is won or lost. Everything is on a fixed step from a seed: `?t=&freeze=1` stills and `?auto=1` runs are deterministic. It stays fast with 300-900 foes (typed-array pools, a spatial hash rebuilt each step, sprites painted once and cached).

It draws into a logical `view` rect (default 640x360) on your 2D context; scale the context to your backing store (devicePixelRatio) and it draws HD. World units = view px; the camera follows the hero.

## Quick start (15 lines)

```js
const run = GameDNA_HordeSurvival.create({
  view: { x: 0, y: 0, w: 640, h: 360 }, seed: 7, params: { duration: 200, enemyCap: 400 },
  paintActor: (ctx, look, x, footY, o) => drawMySprite(ctx, look, x, footY, o.h, o.facing),   // once per look / side / size; true = painted
  onHit: ev => { /* your hit feedback; read-only */ },
  onEnd: (result, info) => { /* 'win' | 'lose': your results screen, once */ }
});
run.start({ seed: 7, weapons: ['bolt'] });
function step() {                                   // every fixed 60 Hz step, fast-forwards included
  run.setInput(keyX, keyY);                         // -1..1 each, from your keys
  run.update(1000 / 60);
}
function draw(ctx) { run.drawWorld(ctx); /* your effects */ run.drawUI(ctx); /* your overlay */ }
onKey(k => run.key(k));                             // 'left' 'right' 'ok' for the level-up cards
onPointer((type, x, y) => run.pointer(type, x, y)); // logical px: drag = touch stick, tap = take a card
```

## Options

| option | meaning |
|---|---|
| `view` | `{x, y, w, h}` in your logical canvas px |
| `seed` | default seed (`start({seed})` per run) |
| `params` | `enemyCap` 400, `spawnRate` 1, `duration` 200 (s until the boss; the wave table is scaled), `dawn` 90 (s after the boss until dawn: a win), `heroSpeed` 100, `magnet` 70, `startWeapon` 'bolt', `choices` 3, `hpScale` 1, `heroHp` 120, `numbers` 'on', `shake` 'on', `reduced` 'off', `maxWeapons` 6 |
| `weapons`, `enemies`, `upgrades` | tables merged over the built-ins (`GameDNA_HordeSurvival.WEAPONS / ENEMIES / UPGRADES`); `builtins: false` uses only yours |
| `waves` | your wave table (format below) instead of the built-in one |
| `paintActor(ctx, look, x, footY, {h, facing, frame})` | paint ONE still pose of a look (`frame` only for the hero when `heroFrames` is set) (`'hero'` or an enemy's `look`) with its feet at (x, footY), `h` px tall, facing `'left'` / `'right'`; return `true`. Called once per look, side, size and device scale; the module caches the bitmap and animates it (waddle, hop, hover, flash, fade). Without it (or when it returns false) a plain built-in creature is drawn. |
| `heroFrames`, `heroH` | `{n, stride}`: the hero has a walk sheet of `n` frames (0 idle, 1..n-1 the cycle), advanced by distance walked, one stride = `stride` x `heroH` = two frames; `heroH` = drawn hero height (46 in the starter, default 44). Without it the hero gets a small waddle. |
| `icons` | `{iconName: (ctx, x, y, size) => {}}`: your painted icons for weapon / upgrade `icon` names (`bolt blades pulse lance boots heart magnet hourglass might ring leaf ration` or your own); the built-in code icons are the fallback |
| `drawGround(ctx, worldRect, view, t)` | your ground; return `true`. Default: a painted meadow (cached seamless tile + hashed decals). `groundPalette` recolours the default. |
| `onHit(ev)` | every HP change: `{kind: 'damage' \| 'heal', target ('hero' or 'e<n>'), enemy (kind), source (weapon id, 'arrow', 'slam', 'potion', ...), amount, hpBefore, hpAfter, killed, x, y (world, the body centre), boss, elite}`. Read-only. |
| `onKill(ev)` | `{id, enemy, x, y, source, boss, elite}` |
| `onPick(ev)` | `{type: 'weapon' \| 'upgrade' \| 'heal', id, level}` |
| `onEvent(ev)` | `start`, `wave {wave: 'ring' \| 'burst' \| 'elite' \| 'boss', enemy, n}`, `boss`, `slam`, `fire {weapon}`, `level {level}`, `offer {choices}`, `pick`, `death`, `pickup`, `won`, `lost` |
| `onEnd(result, info)` | once, 1.5 s after the last blow: `'win'` / `'lose'`, `info = {by ('boss' \| 'dawn' on a win), time, kills, level, hp, maxHp, weapons, passives, stats}` |
| `autoplay` | `true` = the built-in bot from the start |
| `traceDraw(look, x, footY, h, facing)` | optional: called per drawn character when `window.__spriteTrace` exists (facing checks) |
| `skin` | optional `GameDNA_Skin` id (a smooth skin's UI font) |

## Methods

| method | |
|---|---|
| `start({seed, weapons, hp, maxHp, x, y})` | a new run |
| `update(stepMs)` | one fixed step (0 = nothing moves). Call it every step; it pauses itself while the level-up window is open |
| `drawWorld(ctx)`, `drawUI(ctx)` (or `draw(ctx)`) | ground, gems, cast, shots, numbers / HUD, boss bar, alerts, stick, level-up window, end banner |
| `setInput(x, y)` | the move vector from your keys (-1..1); the touch stick adds to it |
| `key(k)` | `'left' 'right' 'up' 'down' 'ok'` for the level-up window; returns true when used |
| `pointer(type, x, y)` | `'down' 'move' 'up' 'cancel'` in logical px: a drag is a stick, a tap on a card takes it |
| `setAuto(on)`, `auto()` | the bot: look-ahead steering (16 headings, foes, arrows, slam) and upgrade scoring, through the same input path |
| `pause(on)`, `hitStop(ms)` | stop the world / freeze it briefly (only delays it) |
| `phase()` | `idle` `play` `levelup` `won` `lost`; `over()` after onEnd; `time()` run ms |
| `hero()` | `{x, y, hp, maxHp, level, xp, need, kills, face, vx, vy, weapons [{id, lv}], passives, mods, magnet}` |
| `enemies(fn, all)` | each live foe `{id, kind, x, y, sx, sy (screen), hp, maxHp, face, vx, vy, boss, elite, h, hover}`, on screen only unless `all` |
| `anchor(id)` | `{x, footY, top, left, w, h, cy, dead}` in view px, where it is drawn this frame (shake included); `'hero'` or `'e<n>'` |
| `unitRects()`, `uiRects()`, `cardRects()` | hero + on-screen foes (sprite boxes, with `id`) / HUD pieces (`xpBar`, `level`, `timer`, `kills`, `slots`, `bossBar`, `alert`, `stick`, `levelTitle`, `card`, `banner`) of the last drawn frame / level-up cards |
| `setView({x, y, w, h})` | change the logical view (e.g. a portrait phone: 360 wide, taller); the HUD and cards lay out for it. The game itself never depends on the view: spawning, scattering and recycling use a fixed 430 px reference radius, so one seed plays the same run in any layout |
| `worldToScreen(x, y)`, `camera()` | world -> view px |
| `addWeapon(id, def)`, `addEnemy(id, def)`, `addUpgrade(id, def)` | add content (also before `start`); `giveWeapon(id)` grants or levels one now |
| `spawn(kind, x, y)` | place a foe yourself (world px; keep it outside the view) |
| `skipTo(ms)`, `setLevel(n)`, `grantXp(n)` | jump the wave clock / set the level / add XP (demos, tests) |
| `stats()` | `{enemies, projectiles, gems, particles, drawn, spawned, kills, xpDropped, xpCollected, xpLost, merged, levels, picks, spawnOnScreen, maxEnemies, stepMs, stepAvgMs, ...}` |
| `setParams(p)`, `params()`, `state()` | live params / a small summary for tests |

## Content is data

```js
// weapon: kind 'orbit' | 'nearest' | 'pulse' | 'lance' | 'custom'; one stats object per level (max level = levels.length)
frost: { name: 'Frost Shard', icon: 'bolt', kind: 'nearest', color: '#9fd8ff', text: 'Shards at the nearest foe.',
  levels: [{ cd: 900, n: 2, dmg: 9, speed: 300, pierce: 0, size: 1 }, { cd: 800, n: 3, dmg: 11, speed: 320, pierce: 1, size: 1 }] }
// custom: fire(api, w, lv) runs every lv.cd ms; api = {hero, rng(), time(), nearest(n, maxD), enemiesIn(x, y, r, fn), damage(enemy, n, kx, ky, src), shoot({x, y, vx, vy, dmg, pierce, size, life, kind: 'bolt' | 'lance'}), ring(x, y, r, color), area()}
// foe
bat: { name: 'Cave Bat', look: 'wisp', gait: 'fly', h: 20, r: 7, hp: 5, speed: 90, dmg: 4, xp: 1, mass: 0.5, move: 'swoop', hover: 0.4, palette: { body: '#5a4a7a', eye: '#ffe08a' } }
// upgrade: stat 'speed' | 'maxHp' | 'magnet' | 'haste' | 'might' | 'reach' | 'regen' (+per per level), or apply(hero, level, api)
thorns: { name: 'Thorn Mail', icon: 'leaf', text: '+15% damage.', max: 3, stat: 'might', per: 0.15 }
```

| foe field | meaning |
|---|---|
| `look` | what `paintActor` paints (and the built-in painter's palette key); `h` drawn height px, `r` body radius |
| `gait` | how a single painted pose moves: `hop` (jumps with squash and stretch, moves only while airborne), `fly` (wing-beat stretch, tilt), `float`, `glide` (robes: sway, no steps), `stomp` (heavy footfalls with dust and a screen shake; a `boss` with it faces the hero). Without it: a small waddle. Single-pose art with visible legs should not walk: pick a gait or give it frames. |
| `hp`, `speed` (px/s), `dmg` (contact), `xp` (gem value), `mass` (push and knockback) | grows with time: HP x (1 + min x 0.55 x hpScale) |
| `move` | `chase`, `drift` (wobbles), `swoop` (dashes in when close), `keep` (keeps `shoot.range` and fires `shoot {range, cd, speed, dmg}` ember orbs) |
| `hover`, `elite`, `boss`, `drop: 'potion'`, `slam {every, windup, r, dmg}`, `summon {every, id, n}` | |

Waves: `{length: 200, segments: [{from, to, rate, mix: {enemyId: weight}}], events: [{at, kind: 'ring' \| 'burst' \| 'elite' \| 'boss', enemy, n}]}` (seconds of `length`, scaled to `params.duration`). A run is won when a `boss` foe dies, or `dawn` seconds after it arrived (`info.by` = 'boss' | 'dawn').

## Robustness

Host callbacks run inside try/catch (a throw logs a warning, the run goes on); `update` with 0 or a negative step does nothing; steps over 50 ms are clamped; drawing never throws; foes far behind are moved ahead instead of piling up; gems fold into existing gems at 520 instead of being dropped. Never use `Math.random` in a custom weapon (use `api.rng()`).

## Self-check without a browser

- Trace one hit: weapon timer -> `onHit` with the new HP -> `onKill` -> a gem -> picked up -> `level` event -> the window opens -> `pick` -> `update` runs again.
- Every place your game changes the hero's HP or the foes during a run must go through the module (or not exist).
- Worked example: a slime at minute 2 has 8 x (1 + 2 x 0.55) = 16.8 -> 17 HP; Seeker Bolt level 3 deals 15 x (1 + 0.12 x 2 might) = 18.6 -> 19: one bolt kills it.
