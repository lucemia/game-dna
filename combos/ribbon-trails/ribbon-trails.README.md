# ribbon-trails.js (E-15 module, v1.1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_Ribbons`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It draws **smooth tapered ribbons** behind anything that moves fast: a sword tip during a swing, a dash or lunge, a projectile, a drifting wisp. Each update it samples every source once, keeps the recent points with their age, and draws a centripetal Catmull-Rom curve through them whose width and alpha taper with age, with an optional additive core and glow. A sword that also gives its hilt (`bx, by`) leaves a **swept crescent** from hilt to tip instead of a line.

It only **reads** the sources and only **draws**. It never reads or writes your game state, hit boxes, timers, RNG or input, so damage, collisions and autoplay endings are exactly as before. Everything advances in `update(dt)` (no `Math.random`, no wall clock), so `?t=<ms>&freeze=1` shows the same frame every time. **No line is ever drawn across the screen**: a jump much larger than the recent steps (teleport, respawn, room change), a change of `space`, a gap longer than the ribbon's life, or a source that returns `null` all start a new strip; `update(0)` (pause, hit-stop) freezes the ribbons in place.

Cost (headless Chromium, 2026-11-16, v1.1): the demo's 4-6 ribbons (45-78 points) draw in 0.22-0.42 ms per frame at 960x540, the under-shadow on a bright floor included; pixel mode adds one small `getImageData` per pass, and `contrast: 'auto'` one 16x16 readback per ribbon every 12 draws.

Optional look: load `skin-api.js` and a skin and pass `skin`: `palette: 'skin'` takes the colours from the skin's `fx` tokens, and a pixel skin turns pixel mode on. Without `skin`, nothing from a skin is used.

## API

`GameDNA_Ribbons.create(options)` returns an instance.

| option | meaning |
|---|---|
| `params` | `life` 220 (ms a point lives; kinds scale it), `width` 1 (multiplier on every kind's width), `taper` 1.3 (0..4: how fast the width shrinks with age, 0 = constant), `fade` 1.2 (0..4: how fast the alpha drops with age), `core` `'on'` \| `'off'` (thin bright additive line inside), `glow` 0.5 (0..1.5, soft additive halo), `smooth` 4 (1..10, curve subdivisions per step, 1 = straight segments), `palette` `'steel'` \| `'ember'` \| `'arcane'` \| `'frost'` \| `'venom'` \| `'gold'` \| `'shadow'` \| `'skin'`, `render` `'auto'` \| `'smooth'` \| `'pixel'` (`auto` = pixel when the context you draw on has `imageSmoothingEnabled === false`, or the skin is a pixel skin), `reduced` `'system'` \| `'on'` \| `'off'` (shorter ribbons, no glow), `teleport` 0 (px; 0 = auto: 72 × scale, or 3.5 × the recent step length if larger), `contrast` `'auto'` \| `'on'` \| `'off'` (`auto`: every 12 draws per ribbon it reads a 16×16 px patch of the backdrop under the ribbon; on a bright backdrop it adds a dark under-shadow 1.6 × scale px below the body and drops the additive glow, which would only wash out). |
| `scale` | Size of your world: px per unit, about `viewHeight / 360` (0.62 for a 224 px tall pixel game, 1 for 360, 1.5 for 540). Widths and the teleport distance scale with it. Number or function; or pass `view: {w, h}`. Default 1. |
| `camera` | `() => ({x, y})`: subtracted when `draw` is called without `camX, camY`. Optional. |
| `skin` | Skin id or object (needs `GameDNA_Skin`). Omit or `false` to ignore skins. |

| method | |
|---|---|
| `follow(id, opts)` → id | Add (or change) one ribbon. `kind`: `'blade'` (weapon tip, 'over' sprites, fades in above 60 px/s), `'dash'` (body-wide, 'under', only above 220 px/s: dashes, not walking), `'projectile'` (thin with core, 'under', always), `'wake'` (soft wide drift for floating things, 'under', above 30 px/s). `source`: `() => ({x, y, bx, by, space, alpha, cut})` in **world px**, or `null` while there is nothing to trail (not swinging, dead, gone, another scene). `x, y` = the point that leaves the ribbon (sword tip, body centre, projectile centre); `bx, by` = optional hilt: the ribbon becomes a swept band from hilt to tip; `space` = any value naming the coordinate space (scene or room name): a change starts a new strip; `alpha` 0..1 (your hurt blink); `cut: true` = start a new strip now. Other opts: `group` (draw filter, e.g. the actor id), `layer` `'under'` \| `'over'` \| `'own'` (`own` = drawn only when `draw` names its group or id: a hero blade drawn right after the hero sprite in a depth-sorted game), `color` (head), `color2` (tail), `coreColor`, `width` (px, overrides the kind × scale), `life` (ms), `minSpeed` (px/s at scale 1; below it the ribbon fades out), `teleport` (px), `alpha`, `blend` `'normal'` \| `'add'`, `core` `false`, `glow` (0..1.5), `once: true` (delete the ribbon by itself once its source returned `null` and it faded out: projectiles). Calling it again with the same id changes only what you pass. |
| `update(dtMs)` | **Once per fixed step, after things moved** (the step `?t=` fast-forward and `?auto=1` also run). Ages every point by `dtMs`, samples every source once. `update(0)` while the world is frozen (hit-stop, pause, a window over the game): nothing ages, nothing is sampled. |
| `draw(ctx, camX, camY, which)` | Draw ribbons whose layer is `which` (`'under'` or `'over'`), or whose group or id is `which` (string, array, function), or all when omitted. Points are world px; `camX, camY` are subtracted (pass `0, 0` inside your own camera transform). `'under'` right before your sprites, `'over'` right after them, before the HUD. Never throws. |
| `remove(id, now)` | Stop sampling and fade out (then delete); `now: true` deletes at once. |
| `cut(id)`, `clear(id?)` | Start a new strip on the next sample / drop the points now (level start, restart, scene change). |
| `has(id)`, `ids()`, `points(id)` | Queries; `points` = raw strips `[[{x, y, bx, by, age, k}]]` (read-only). |
| `setParams(o)`, `params()`, `reduced()`, `stats()`, `list()`, `lastDrawn()` | Live params; counters `{trails, strips, points, updates, draws, sampled, breaks, spaceBreaks, gapBreaks, nullBreaks, cuts, maxGap, sourceErrors, drawErrors, badInput, removed, quads, pixelDraws}` (`maxGap` = the largest step ever drawn between two points, px); per ribbon `{id, group, kind, layer, active, head, strips, points, oldest, life, maxGap, teleport, bbox}`; last drawn rects in draw coordinates, **one per strip** (a ribbon holds several strips after a break), with `owner` = group, `id`, `kind`, `strip`, `head` and `active` (on its newest strip), `bright`, `seq`; also `arcSamples`, `contrastChecks`, `brightDraws` in `stats()`. |

## Integration (15 lines)

```js
// <script src="ribbon-trails.js"></script> before your game script
const trails = GameDNA_Ribbons.create({ params: { life: 220, palette: 'steel' }, scale: VIEW_H / 360 });
trails.follow('hero-blade', { kind: 'blade', group: 'hero', source: () => hero.swing          // only while swinging
  ? { x: tipX(hero), y: tipY(hero), bx: hiltX(hero), by: hiltY(hero), space: scene } : null });
trails.follow('hero-dash', { kind: 'dash', group: 'hero', source: () => hero.alive ? { x: hero.x, y: hero.y - 12, space: scene } : null });
// where a projectile is created: trails.follow(shot.id, { kind: 'projectile', once: true, source: () => shot.alive ? { x: shot.x, y: shot.y } : null });
function fixedStep() {                                    // your 60 Hz step (also run by ?t= and ?auto=1)
  /* ...existing input, movement, collisions... */
  trails.update(frozen || paused ? 0 : 1000 / 60);         // after the actors moved
}
function drawWorld() {
  trails.draw(ctx, cam.x, cam.y, 'under');  drawSprites();  trails.draw(ctx, cam.x, cam.y, 'over');
  drawHud();                                               // HUD and windows after the ribbons
}
// level start / restart / every scene switch: trails.clear();
```

## Keep the rest of the game working

- **Rules stay where they are.** Never feed ribbon points into positions, collision, damage or AI. The ribbons read sources; the game never reads the ribbons.
- **One id, one actor.** Tie each ribbon id to one actor and look that actor up by its id inside the source. Never point a ribbon at a slot ("the nearest wisp", "the current target"): when the slot switches actors the ribbon draws a strip on each, or a short line between them. When an actor dies for good or is replaced, `remove(id)` (or let the source return `null`; `once: true` deletes it after it fades).
- **Depth-sorted games**: one `'over'` call draws every blade above all sprites, so a swing behind a big enemy shows on top of it. Give the hero's blade `layer: 'own'` and call `draw(ctx, camX, camY, heroGroup)` right after the hero sprite.
- **Where the points come from**: compute the sword tip and hilt with the same angle and length your draw code uses for the blade, so the crescent leaves the drawn blade. When the tip travels more than 12 × scale px in one step, the module adds samples along the arc around the hilt (blade angle and length interpolated), so fast swings stay round instead of faceted. A game that only draws a lunge (the sprite slides toward the target and back) trails the weapon or body during the lunge. Return `null` whenever nothing should trail: not swinging, not dashing, dead, despawned, title screen.
- **One coordinate space per source.** Sources return world px (what your actors' `x, y` are). If a game has scenes with their own coordinates (a map and a separate battle screen), return `null` from the sources of the scene that is not showing **and call `clear()` on every scene switch** (simplest: in the step, `if (scene !== lastScene) { lastScene = scene; trails.clear(); }`): otherwise the fading strips of the old scene are drawn once more in the new scene's coordinates.
- Call `update` from the fixed step, not from the render loop: `?t=<ms>&freeze=1` runs the step N times and draws once, and must show the same frame every run. Pass `0` while the world is frozen (hit-stop) or paused by a menu or dialogue, so ribbons hold still instead of fading under a window.
- `draw` once per layer per frame, in every scene that has ribbons, inside the same screen-shake translate as your sprites, before your HUD and windows. Don't clip or filter it.
- Pixel games: leave `render: 'auto'` and keep `imageSmoothingEnabled = false` on the context you draw on; ribbons are then rasterised at whole game pixels with three hard alpha steps.
- Find every caller of what you touched: autoplay (`?auto=1`), `?t=` fast-forward, restart, respawn, title, pause, keyboard shortcuts. Hook, don't replace: keep every function, name and caller.

## Self-check without a browser

- The module file is byte-identical to the one you were given and loads before `create`.
- `trails.update(...)` runs once per fixed step, after movement, in the step (not in render), with `0` while frozen or paused.
- Every source returns world px of one actor (looked up by id), or `null`; none returns (0, 0), the screen centre or screen px in a scrolling game.
- The blade source returns `null` outside a swing; tip and hilt use the drawn blade's angle and length.
- `draw(ctx, camX, camY, 'under' | 'over')` sits next to your sprite pass in each scene; HUD after.
- Restart, respawn, blink, scene change: positions jump, so a new strip starts (`stats().breaks` grows); no line across the screen.
- No game variable reads `points()`, `list()` or `lastDrawn()`.
- Walk one swing with the defaults at scale 1: the tip moves ~10 px per step for 8 steps; the crescent is the hilt-to-tip band along those 8 points, newest at full alpha 0.85, gone after 176 ms (11 steps).

## What it guarantees

- No drawn segment is longer than 1.5 × the teleport distance (a draw-time safety net counts `cuts`); jumps start new strips (`breaks`).
- `update(0)` changes nothing; `?t=&freeze=1` frames are identical across runs.
- No input listeners, no timers, no `Math.random`, no wall clock. `update`, `draw`, `follow` never throw on bad input; sources that throw are counted in `sourceErrors` and treated as `null`.
- Seamless alpha: each ribbon's body is added segment by segment into a small buffer and composited once, so overlapping translucent segments never show seams or beads.
