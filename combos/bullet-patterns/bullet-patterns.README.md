# bullet-patterns.js (A-08 module, v1.1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_Bullets`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It fires **bullet patterns described as data** (fan, ring, spiral, aimed, flower, wave, line; layered; bullets that split into sub-patterns; speed, acceleration and turn curves), keeps every bullet in a **fixed pool** (no garbage per frame), moves them, tests them against the player's **small hit circle** (swept, so fast bullets never tunnel), reports grazes, and draws them in code: bright white core, coloured body and rim, dark outline (readable on light and dark floors), soft halo. A static **`safeGap()`** says whether a pattern leaves the player a way through.

The module owns bullets only. **Your game keeps its rules**: it tells the module where the player's hit circle is (`player()`), whether the player can be hit now (`canHit()`), and applies damage itself in `onHit()`. Everything advances in `update(dt)` from a seed (no `Math.random`, no wall clock), so `?t=<ms>&freeze=1` shows the same frame every run.

Cost (headless Chromium, 2026-11-18, measured on v1.0; 1000 live bullets with halos, median of 3): smooth render on a 640x360 field, canvas 1280 px wide at dpr 2 (2560x1440 backing): **6.8 ms** per frame draw, **0.03 ms** update; 390 px at dpr 3 (1170x658): **2.2 ms**. Pixel render on a 320x180 field (bullets twice the screen size): 12.0 ms and 7.3 ms. `checks/perf.json` has the numbers.

## API

`GameDNA_Bullets.create(options)` returns an instance.

| option | meaning |
|---|---|
| `params` | `speed` 1 (multiplier on every pattern's speed), `density` 1 (multiplier on bullet counts), `size` 1 (multiplier on bullet size), `hitbox` 0.4 (hit circle radius as a fraction of the drawn radius: bullets hit far less than they look), `halo` 0.6 (0..1.5), `graze` `'on'` \| `'off'`, `grazeRange` 9 (px at scale 1 beyond touching that count as a graze), `palette` `'arcane'` \| `'ember'` \| `'frost'` \| `'venom'` \| `'royal'` \| `'blood'` \| `'mono'` \| `'skin'` (two alternating colours), `render` `'auto'` \| `'pixel'` \| `'smooth'` (`auto` = pixel when the context has `imageSmoothingEnabled === false` or the skin is a pixel skin), `max` 2000 (pool size; when full, new bullets are dropped and counted), `flash` `'on'` \| `'off'` (muzzle flash), `reduced` `'system'` \| `'on'` \| `'off'` (no flash or sparks, dimmer halo), `damage` 2 (default `damage` passed to `onHit`; a pattern's own `damage` wins), `clearRadius` 0 (px at scale 1: on a hit, live bullets this close to the player turn into sparks, so the hit reads and the player gets a moment). |
| `scale` | Size of your world: px per unit, about `viewHeight / 360` (0.62 for a 224 px tall pixel game, 1 for 360, 1.5 for 540). Pattern speeds and sizes are given at scale 1. Number or function. Default 1. |
| `seed` | Integer; only pattern `jitter` uses it. |
| `player` | `() => ({x, y, r})`: the player's **hit circle** in world px (the same space as the positions you fire from), or `null` when there is no player to hit (title, another scene, dead). Keep `r` small: 2-5 px is the genre's convention (a third of the sprite or less). |
| `canHit` | `() => boolean`: `false` while the player cannot be hurt (invulnerability blink, a window open); bullets then pass through. Optional. |
| `onHit(hit)` | Called once per hit (at most one per `update`): `{x, y, owner, damage, pattern, kind, seq}`. **Apply your game's own damage here** (call your existing damage function). Return `false` to let the bullet fly on; otherwise it pops. |
| `onGraze(g)` | A bullet passed within `grazeRange` without hitting: `{x, y, owner, seq}`. Optional (score, meter, sound). |
| `bounds` | `{x, y, w, h}` world rect, or a function returning it: bullets that leave it (plus 48 px x scale) are removed. Default: the area the last `draw` showed. |
| `solid` | `(x, y) => boolean`: walls; a bullet in a solid spot pops. Optional. |
| `skin` | Skin id or object (needs `GameDNA_Skin`): `palette: 'skin'` takes the skin's `fx.hot` / `fx.cold`; a pixel skin turns pixel render on. |

| method | |
|---|---|
| `fire(pattern, at)` → bool | Fire once now. `pattern` = a preset name or a pattern object (or an array of them = layers). `at`: `{x, y}` world px, or `source: () => ({x, y})` (the bursts follow a moving caster; `null` ends them), `angle` (degrees, base direction, 0 = right, 90 = down; default 90), `aim: true` (aim at the player, the default for aimed patterns), `aimAt: {x, y}`, `owner` (any id; for `cancel`), `muzzle` (px at scale 1: bullets start this far out from the source along their direction; use about the caster's radius so bullets never appear on top of it), `color` (a hue name, `#hex`, or 0 / 1 = the palette's colours), `delay` (ms). |
| `emit(id, spec)` → id | A repeating caster: `{pattern, cycle: [p1, p2, ...] (optional: rotate patterns), source: () => ({x, y}) or null, every (ms, default 1600), delay (ms before the first cast, default every / 2), range (px: only casts while the player is this close; 0 = always), muzzle, angle, aim, owner (default id), color}`. While `source()` returns `null` it does not cast. Call it once per caster (when it spawns), not every frame. |
| `stop(id)` | Remove a caster (its bullets fly on). |
| `cancel(owner?)` → n | The owner's live bullets (all when omitted) turn into fading sparks that never hit; its pending bursts stop. Use when the caster dies, a phase ends or the player bombs. |
| `update(dtMs)` | **Once per fixed step, after the player and casters moved** (the step `?t=` fast-forward and `?auto=1` also run). `update(0)` while the world is stopped (pause, hit-stop, a window): nothing moves, ages or hits. |
| `draw(ctx, camX, camY)` | Draw every bullet and effect. Positions are world px; `camX, camY` are subtracted (pass `0, 0` inside your own camera transform). Call after the sprites, before the HUD. Never throws. |
| `clear()` | Drop every bullet, burst and effect now (new game, restart, scene switch). Casters stay and restart their timers. |
| `danger(x, y, r, aheadMs)` → px | Clearance between a circle and the nearest bullet now and along the next `aheadMs` (straight-line guess). For autopilots and AI that should dodge; never needed for rules. |
| `setParams(o)`, `params()`, `stats()`, `list()`, `hash()`, `emitters()`, `lastDrawn()` | Live params; counters `{bullets, peak, fired, spawned, dropped, hits, grazes, cancels, culled, blocked, splits, updates, draws, drawn, sourceErrors, cbErrors, badInput, pool, allocated, player, ...}`; live bullets `[{x, y, r, hitR, kind, owner, age, state, seq}]`; a hash of every bullet (determinism tests); caster ids; the box of the last draw. |

`GameDNA_Bullets.safeGap(pattern, opts)` → `{ok, gapOK, reachOK, minGap, need, gapFailT, reachFailT, peak, ...}`. Fires the pattern from (0, 0) toward a player `dist` px away (default 120) and, every step, sweeps the band the player can reach: an arc of radius `dist` (`band: 'arc'`, default) or a straight line across the aim (`band: 'line'`, for curtains and rain), `width` px wide (default 260). `gapOK`: at every step the widest gap between bullet hit circles is at least the player's hit circle (`2 x playerR`, default 3); `reachOK`: a player moving at most `playerSpeed` px/s (default 120; 0 skips it) along the band can stay in a gap the whole time. Pass the same `params` and `scale` your game uses. Use it when you author a pattern: a pattern with `ok: false` has no way through.

`GameDNA_Bullets.presets` (fan, ring, spiral, aimed, flower, wave, line, bloom, helix, whirl, rain), `.shapes`, `.kinds` (`orb`, `rice`, `shard`), `.palettes`, `.hues`.

### Pattern data

```js
{ shape: 'fan',            // single | fan | ring | spiral | aimed | flower | wave | line
  count: 7, spread: 70,    // bullets per burst; fan / aimed / wave arc in degrees
  angle: 0, aim: true,     // offset from the base direction (degrees); aim at the player at each burst
  speed: 120, accel: 0, min: 0, max: 9999,         // px/s at scale 1; px/s per s; clamps
  speedCurve: [[0, 1], [600, 0.3], [1200, 1.4]],   // optional multiplier over the bullet's age (ms)
  turn: 0, turnCurve: null, gravity: 0,            // degrees/s (curving bullets); px/s^2 down (lobbed shots)
  bursts: 3, interval: 260,                        // repeats, ms apart
  rotate: 0, spin: 0, speedStep: 0, jitter: 0, speedJitter: 0, // per burst: degrees, degrees (spirals), speed x (1 + step x n); random degrees; random speed fraction per bullet
  petals: 5, depth: 0.5,                           // flower: speed dips between petals
  amp: 0, freq: 1.4,                               // wave: sideways sine (px, Hz)
  width: 240, gapEvery: 0, shiftGap: 0,            // line: wall width (px), every Nth bullet left out, gap moves per burst
  kind: 'rice', size: 5, color: null, colorBy: 'burst', // orb | rice | shard; drawn radius px; burst | bullet | arm | petal
  life: 9000, damage: 0,                           // ms; 0 = params.damage
  split: { at: 1100, pattern: { shape: 'ring', count: 10, speed: 85, relative: true } } }   // each bullet becomes a sub-pattern
```

## Integration (15 lines)

```js
// <script src="bullet-patterns.js"></script> before your game script
const bullets = GameDNA_Bullets.create({ seed: 1, scale: VIEW_H / 360, params: { palette: 'arcane' },
  bounds: { x: 0, y: 0, w: WORLD_W, h: WORLD_H },                      // world rect
  player: () => hero.alive ? { x: hero.x, y: hero.y - 8, r: 3 } : null,  // the small hit circle, world px
  canHit: () => hero.invulnerable === 0,
  onHit: (hit) => damageHero(hit.damage),                               // YOUR damage function
  solid: (x, y) => isWall(x, y) });
// where each enemy spawns (once): it casts every 2 s while it exists
bullets.emit(enemy.id, { pattern: 'fan', every: 2000, range: 200, muzzle: 14, source: () => enemy.alive ? { x: enemy.x, y: enemy.y } : null });
// where an enemy dies: bullets.cancel(enemy.id); bullets.stop(enemy.id);
function fixedStep() { /* ...input, movement... */ bullets.update(paused || frozen ? 0 : STEP_MS); }
function render() { drawWorld(); bullets.draw(ctx, cam.x, cam.y); drawHud(); }
// new game / restart / scene switch: bullets.clear();
```

## Keep the rest of the game working

- **Damage stays your rule.** `onHit` calls the game's existing damage function (with its invulnerability, defence and death handling). Never write HP from the module's data elsewhere, never add a second death path.
- **One space.** `player()`, `fire` / `emit` sources and `bounds` are all world px; `draw` gets the camera (or `0, 0` inside a camera translate). A player point in screen px in a scrolling game means bullets aim and hit in the wrong place.
- **Casters, not loops.** `emit` once per enemy when it appears (or `fire` from the enemy's own attack code); never call `emit` or `fire` every frame without a cooldown. Tie each caster id to one enemy; when it dies `cancel(id)` and `stop(id)`.
- **The step.** `update` from the fixed step, after movement, `0` while paused, in hit-stop or while a dialogue or menu stops the world. Never from render: `?t=<ms>&freeze=1` must show the same frame.
- **Scenes.** `clear()` on new game, restart and every scene switch (simplest: in the step, `if (scene !== lastScene) { lastScene = scene; bullets.clear(); }`); `player()` returns `null` when the player is not in the scene.
- **Autoplay** (`?auto=1`) has to keep reaching its end: bullets are new danger, so keep the damage small (1-3 % of max HP), cast only within `range`, and let the game's invulnerability (`canHit`) space hits out. A bot that should dodge can use `danger()`; never change its route otherwise.
- Find every caller of what you touched: autoplay, `?t=` fast-forward, restart, title, pause, keyboard shortcuts. Hook, don't replace: keep every function, name and caller.

## Self-check without a browser

- The module file is byte-identical to the one you were given and loads before `create`.
- `update` runs once per fixed step, in the step, `0` while stopped; `clear()` runs on restart and scene switches.
- `player()` returns world px of the hit circle (a few px, centred on the body), or `null`; `canHit()` mirrors your invulnerability.
- `onHit` calls your damage function; nothing else changes HP.
- Each enemy has one `emit` (or fires from its attack), with `null` from its source when dead or off-scene, and `cancel` + `stop` when it dies.
- Walk one fan at scale 1: 7 bullets 70 degrees wide (about 11.7 degrees apart) at 120 px/s, 120 px from the caster after 1 s, where neighbours are about 24 px apart; a bullet passing 6 px from the centre of a player with `r` 3 does not hit (hit radius 5 x 0.4 = 2, 2 + 3 = 5 < 6), one passing 4 px does.

## What it guarantees

- Bullets come from the pool made in `create` (`stats().allocated === stats().pool`); `update` and `draw` allocate no bullet objects.
- Hits are tested along each bullet's path since the last step (no tunnelling); at most one hit per `update`.
- `update(0)` changes nothing; same seed + same calls = same bullets (`hash()`).
- No input listeners, timers, `Math.random` or wall clock. `fire`, `emit`, `update`, `draw` never throw; callbacks that throw are caught and counted (`cbErrors`, `sourceErrors`).
- Sprites are drawn once per colour, size and angle (32 angles for rice and shard) at device resolution and blitted 1:1 on whole device pixels, so bullets stay crisp at any dpr; pixel render draws whole game pixels.
