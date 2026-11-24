# clash-cutin.js (A-04 module, v1.1)

One plain script, no dependencies, no `import`/`export`, ASCII only. It defines one global, `GameDNA_ClashCutin`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it.

When your game has confirmed an attack **and already decided the outcome with its own rules**, `play()` cuts to a staged side-view scene that covers the play area: a letterbox caption bar, a backdrop drawn in code for the terrain (plains, forest, marsh, desert, ruins; three parallax layers), both units standing on a ground strip and facing each other, HP panels at the bottom. Each strike is acted out: a melee attacker leaps in, winds up and swings (slash arc), a ranged one shoots an arrow, a caster charges a ring and throws an orb. A hit freezes for a few frames, sparks, shakes, pops the damage number and drains the HP bar (a pale segment shows the loss); a miss is dodged with after-images and shows MISS; a critical gets a gleam, a darker stage, a white flash and a bigger number; a unit at 0 HP collapses, darkens and fades away. Hit, miss and death read differently: a hit is an opaque white silhouette for 3 frames, then the hurt pose with knockback; a miss is a side-step with one faint after-image; a KO is the collapse pose, darkened, then a fade with rising motes. Both return home, the scene holds, then closes.

**It never computes or rolls anything.** The strikes you pass are what it shows; what it ends on is what your game must apply. It keeps all timing on its own clock, advanced only by `update(dt)`, and every frame is a pure function of that clock (deterministic, `?t=&freeze=1` safe).

Looks: with `skin-api.js` and a skin loaded first, panels, labels, bars and damage numbers go through `GameDNA_Skin.resolve(options.skin)`; without them it uses its own copy of the `pixel16` look. Pixel games get integer-scaled sprites and no smoothing; the UI scales by whole steps of 256 x 224.

## API

`GameDNA_ClashCutin.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | `{x, y, w, h}` in native canvas pixels: the area the scene covers (usually the whole canvas). Default 256 x 224 at 0, 0. |
| `skin` | Skin id or object (only used when `skin-api.js` is loaded). |
| `params` | `speed` 1 / 2, `sides` `'map'` (keep the map's left / right; same column -> `'team'`), `'team'` (player's team on the right) or `'attacker'` (attacker on the right), `intro` `'band'` / `'cut'`, `introMs` 300, `drain` 450 (ms per HP drain), `stop` 4 (hit-stop frames, doubled on a critical), `shake` 2 (px), `hold` 450 (ms before closing), `backdrop` `'auto'` (from `play().terrain`) or a theme, `keys` `'on'` / `'off'` (off: `key` / `tap` are swallowed but do nothing), `pixel` `'auto'`. |
| `drawBackdrop(ctx, rect, t, camX)` | Optional: draw your own backdrop instead of the built-in one (`rect` = stage, with `ground` and `horizon` y). |
| `onDone(result)` | Optional, for every play (see `play`). |
| `debug(e)` | Optional: `play`, `impact`, `skip`, `speed`, `done` and `warn` events. |

**`play(spec)`** returns `true` (started) or `false` (already running, or bad input). `spec`:

| field | |
|---|---|
| `attacker`, `defender` | `{id, name, team: 'a' \| 'b' \| 'n', hp, max, x?, kind?, weapon?, stats?, art?, facing?, mirror?, variants?, draw?, fly?, tint?, scale?}`. `hp` = HP **before** the exchange. `team` also accepts player / enemy / blue / red. `x` = the unit's map column or screen x (for `sides: 'map'`). `kind` `'melee'` (default), `'ranged'` or `'magic'`. `weapon` = a name shown in its panel; `stats` = `{hit, dmg, crit}` your forecast numbers (shown in its panel; `'--'` when it cannot strike back). |
| art | `art`: an image or canvas; `facing`: the side **the art looks at** (`'right'` default). Optional `frames`: `{ready, windup, swing, follow, hurt, down, aim, release, cast, dodge}`, each an image (or `{left, right}`) drawn like `art`; the scene shows them in the matching phase (wind-up, swing, follow-through, bow drawn / loosed, staff raised, hurt, collapse) and falls back to `art` for a missing one. A frame lines up with `art` by its feet: the lowest opaque row and the middle of the legs, or `canvas.footX` / `canvas.footY` when set. The module mirrors it when the unit must look the other way, unless `mirror: 'never'`: then give `art: {left: img, right: img}` (or `variants`), a copy painted for each side, and it picks one without mirroring. Or `draw(ctx, x, footY, {facing, scale, pose, k, flash, alpha})`: you draw the unit with its feet at (x, footY). `fly: true` hovers it; `tint: '#rrggbb'` colours its spells. |
| `strikes` | In order: `{by: 'att' \| 'def', result: 'hit' \| 'miss' \| 'crit', dmg}`. `dmg` is the number shown; HP never goes below 0; strikes after a unit fell are dropped (warning). |
| `after` | Optional `{att, def}`: your HP after the exchange. If it disagrees with the strikes the module warns (`mismatch`) and ends on your `after`. |
| `terrain` | `'plains'`, `'forest'`, `'marsh'`, `'desert'`, `'ruins'` or a word such as grass, wood, swamp, water, sand, stone, fort, road. |
| `onDone(r)` | Called once when the scene has closed: `r = {att, def, skipped, attacker, defender}` (the HP it ended on). Resume your game here. |
| `onImpact(e)` | Called once per strike as it lands (also when skipped past): `{i, by, result, dmg, after}`. Sounds, rumble. |

| method | |
|---|---|
| `busy()` | `true` from `play` until `onDone`. While busy, pause your world, AI, autoplay and input. |
| `update(dtMs)` | Once per fixed step (16.67), **every step** (it is a no-op when idle). It also fires `onImpact` / `onDone`. |
| `draw(ctx)` | Once per frame, last (after your HUD), outside any camera or shake transform. Draws nothing when idle. Never throws. |
| `key(k)` | While busy, give it every key: Z / Enter / Space / Escape skip to the end, X / Shift toggle x2. Returns `true` when it consumed the key (always while busy). |
| `tap(x, y)` | While busy, give it taps in native pixels: on the x2 badge toggles speed, elsewhere skips. |
| `skip()`, `setSpeed(1 \| 2)`, `toggleSpeed()`, `speed()` | Skip jumps to the end tableau (final HP shown), then closes. |
| `state()` | `{busy, phase: 'intro' \| 'stage' \| 'outro', t, speed, strike, caption, actors: [{id, unit, side, x, footY, facing, target, hp, pose, flipX, variant}], hp: {att, def} (shown now), final, staged, mismatch}`. |
| `clear()` | Drops a running scene at once, without `onDone` (restart / new game). |
| `rect()`, `lastDrawn()`, `stats()`, `params()`, `setParams(p)`, `setView(r)` | `stats()`: plays, skips, mismatches, dropped strikes, errors. |

## Integration (15 lines)

```js
// <script src="clash-cutin.js"></script> before your game script
const clash = GameDNA_ClashCutin.create({ view: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H } });
const side = u => ({ id: u.id, name: u.name, team: u.isPlayer ? 'a' : 'b', hp: u.hp, max: u.maxHp, x: u.tileX,
  art: u.sprite, facing: 'right', kind: u.ranged ? 'ranged' : 'melee', weapon: u.weaponName });
function confirmAttack(att, def) {                       // where your game used to resolve and animate the attack
  const a0 = side(att), d0 = side(def);                  // HP before
  const strikes = resolveExchange(att, def);             // YOUR rules, unchanged: [{by, result, dmg}], applies the HP as before
  const after = { att: att.hp, def: def.hp };
  att.hp = a0.hp; def.hp = d0.hp;                        // optional: keep the map showing the old HP until the scene ends
  clash.play({ attacker: a0, defender: d0, strikes, after, terrain: terrainAt(def),
    onDone: () => { att.hp = after.att; def.hp = after.def; continueTurn(); } });   // what ran after the old animation
}
function step() { if (clash.busy()) { for (const k of keysThisStep) clash.key(k); clash.update(STEP_MS); return; }
  /* ...your normal step... */ clash.update(STEP_MS); }
function render() { /* map, units, HUD */ clash.draw(ctx); }
```

## Keep your game working

- **Same dice, same order.** Resolve the exchange with the code that resolved it before, in the same order, so `?auto=1` and seeded replays end exactly as before. Only the animation moves into the scene.
- **Pause, do not reroute.** While `busy()`, skip your world update, AI and autoplay (return early from the step) and send keys and taps only to the module. Resume in `onDone` where the old attack animation ended.
- **Keep every caller.** Your autoplay, `?t=&freeze=1` replay, restart and title screens must still work: call `update` inside the replayed step, and `clear()` where a new game starts.
- **One pair per scene.** Area attacks, heals and items keep your own animation.

## Self-check without a browser

1. The module file is byte-identical to the one given; it is loaded before the first use of `GameDNA_ClashCutin`.
2. Name the one place an attack is confirmed; `play` is called there after your rules ran, with the HP before the exchange.
3. Walk one exchange by hand: the strikes' `dmg` add up to (HP before - HP after) for each unit, clamped at 0; `after` equals what your game applies in `onDone`.
4. Every identifier used in `side()` and the art exists; `facing` is the side your sprite art looks at (if your game mirrors enemies to face left, their art looks right).
5. `update` runs once per fixed step, also during the `?t=` replay; `draw` once per frame after the HUD; nothing else runs while `busy()`.
