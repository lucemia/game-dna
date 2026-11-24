# squash-stretch.js (E-10 module, v1.1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_SquashStretch`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It bends the sprites your game already draws, with no new animation frames: **anticipation** (a crouch and a lean back before a jump, swing or spell), **stretch** while rising and falling fast, **squash** on landing and on taking a hit, a damped **spring back** with overshoot, a **lean** into movement, a **stride bounce** while walking and a slow **idle breath**. The deformation is a canvas transform about the actor's **feet**: `sy` along the height, `sx = 1 / sy` across (area kept), plus a shear for the lean (area kept too).

It only changes how a sprite is **drawn**. It never reads or writes your game state, hit boxes, timers, RNG or input, so collisions, damage and autoplay endings are exactly as before. Everything advances in `update(dt)`, which you call from your fixed step, so `?t=<ms>&freeze=1` shows the same frame every time.

Optional look: load `skin-api.js` and a skin before it and pass `skin`. A pixel skin (`motion.snap`) turns whole-pixel snapping on; a skin's `motion.squash` suggests the squash depth. Without a skin, `snap: 'auto'` snaps when the canvas you draw on has `imageSmoothingEnabled === false` (pixel games) and stays smooth otherwise (HD games).

## API

`GameDNA_SquashStretch.create(options)` returns an instance.

| option | meaning |
|---|---|
| `params` | `amount` 1 (0..2, scales everything), `squash` 0.28 (landing squash depth: sy = 1 - 0.28 at full strength), `stretch` 0.2 (stretch at full speed), `spring` 6 (Hz of the spring back), `wobble` 0.55 (0 = no overshoot, 0.95 = jelly), `lean` 9 (degrees at full run speed), `breathe` 0.025 (idle breath depth), `walk` 0.05 (stride bounce), `anticipation` 70 (ms of crouch before an attack's lunge; a jump uses 60 % of it), `snap` `'auto'` \| `'pixel'` \| `'smooth'`, `reduced` `'system'` \| `'on'` \| `'off'` (half amplitude, no overshoot, no breath or bounce), `view` `'side'` \| `'top'` (top-down: no air stretch, no auto land). |
| `skin` | Skin id or object (needs `GameDNA_Skin`); `false` = ignore skins. |

| method | |
|---|---|
| `attach(id, {w, h, maxSpeed, maxFall, view, amount, stiffness})` | Register an actor (any id; unknown ids are auto-attached with defaults). `w`, `h` = the sprite's drawn size in the units you draw in (used for pixel snapping and the probe's box). `maxSpeed` = horizontal speed that means "full lean / full bounce", `maxFall` = vertical speed that means "full stretch", **in the same units your game uses for velocity** (px per step or px per second, whichever you pass to `motion`). Per-actor feel (optional): `amount` 1 (0..2, multiplies the global `amount` for this actor), `stiffness` 0 (0..1, cuts only its squash and stretch: 0 = slime, 0.4-0.6 = armoured knight or robot, 1 = rigid, lean and tilt only). Call again to change any of them. |
| `motion(id, vx, vy, onGround)` | Once per fixed step per moving actor, after it moved. `+vy` = down the screen. Drives stretch, lean and stride bounce, and **detects landing and take-off by itself** (`onGround` false → true = `land` with strength from the impact speed; true → false with `vy < 0` = `jump`). Pass `onGround` `null` / omit it for things that never touch ground. Also `motion(id, {vx, vy, ground})`. |
| `event(id, kind, strength = 1, dir = 0)` | A one-shot pose. `kind`: `'land'`, `'jump'` (take-off squash, then stretch), `'hit'` (squash and tilt away; `dir` = the blow's direction, 1 = pushed right), `'attack'` (crouch and lean back for `anticipation` ms, then lunge and stretch toward `dir`), `'charge'` (hold a growing crouch until `'release'`), `'release'`, `'squash'`, `'stretch'`. `strength` 0..2 or `'light'`/`'heavy'`/`'crit'`. Aliases: `hurt`, `swing`, `cast`, `windup`… Unknown kinds return `false`. The same land or jump sent by you and detected by `motion` on one step counts once. Shorthands: `land(id, s)`, `jump(id, s)`, `hit(id, s, dir)`, `attack(id, s, dir)`, `charge(id, dir)`, `release(id)`. |
| `update(dtMs)` | **Once per fixed step** (the step `?t=` fast-forward and `?auto=1` also run). Advances every actor in fixed 1/120 s sub-steps. Game time only. |
| `apply(ctx, id, footX, footY)` / `restore(ctx)` | Put these **around the sprite draw only** (not the HP bar, name tag or shadow): `apply` does `ctx.save()` and the transform about the feet point (in the coordinates you draw that sprite with, camera included); `restore` undoes exactly that save. `restore` never pops a save it did not make. |
| `wrap(ctx, id, footX, footY, drawFn)` | `apply` + `drawFn()` + `restore` with `try/finally`: the safest form. |
| `transform(id, ctx)` → `{sx, sy, k, deformed}` | The current pose (pass the ctx so `snap: 'auto'` can see it), e.g. to widen a shadow by `sx`. `matrix(id, footX, footY, ctx)` → `[a, b, c, d, e, f]` for `ctx.transform(...)` if you prefer. |
| `clear(id?)` | Back to rest (level / life / battle start, respawn, teleport). |
| `detach(id)`, `busy(id?)`, `setParams(o)`, `params()`, `reduced()`, `stats()`, `lastDrawn()`, `state(id)` | Live params; counters `{actors, updates, applies, restores, strayRestores, open, events, land, jump, hit, attack, charge, release, autoLand, autoJump, unknownEvents, badInput, selfAdvanced, minSy, maxSy, maxLean, maxVolErr, deformedApplies}`; the deformed box of each actor's last draw. |

## Integration (15 lines)

```js
// <script src="squash-stretch.js"></script> before your game script
const ss = GameDNA_SquashStretch.create({ params: { amount: 1, squash: 0.28, stretch: 0.2, snap: 'auto' } });
ss.attach('player', { w: 16, h: 24, maxSpeed: 2, maxFall: 6 });          // drawn size + the speeds your game calls "full"
function fixedStep() {                                                   // your 60 Hz step (also run by ?t= and ?auto=1)
  /* ...existing input, movement, collisions... */
  ss.motion('player', player.vx, player.vy, player.onGround);            // after the actor moved
  for (const e of enemies) ss.motion(e.id, e.vx, e.vy, e.onGround);
  ss.update(1000 / 60);                                                  // last line of the step
}
// existing hooks, one line each: attack start -> ss.event(id, 'attack', 1, facing);
// damage accepted -> ss.event(target.id, 'hit', killed ? 1.4 : 1, blowDir); wind-up -> 'charge' ... 'release'
function drawActor(a) {                                                  // existing draw: wrap the SPRITE only
  drawShadow(a);                                                         // shadow, bars, labels stay outside
  ss.wrap(ctx, a.id, a.x + a.w / 2, a.y + a.h, () => drawSprite(a));     // feet = bottom centre of the drawn sprite
}
// level / life start: ss.clear();
```

## Keep the rest of the game working

- **Hit boxes stay where they are.** Never feed `sx`, `sy` or `k` back into positions, sizes, collision or damage. The transform lives only between `apply` and `restore`.
- Call `update` from the fixed step, not from the render loop, so `?t=<ms>&freeze=1` (it runs the step N times, then draws once) and `?auto=1` see the same poses. If `update` is never called the module advances itself one frame per draw after 40 draws without an update (`stats().selfAdvanced`; a hit-stop that skips `update` for up to 30 frames keeps the squash held), but `?t=` frames will then differ.
- Pair `apply`/`restore` on every path, including early `return`s inside the sprite draw: use `wrap` there. A missing `restore` leaves the transform on and shifts everything drawn after it (HUD included).
- Find every caller of what you touched: autoplay (`?auto=1`), `?t=` fast-forward, restart, respawn, title. Hook, don't replace: keep every function, name and caller, and keep the game's own hurt blink, knockback and wind-up timing (this element never delays a jump or a swing; its anticipation runs during the game's own wind-up or on the take-off frames).
- The foot point is where the sprite touches the ground: bottom centre of the drawn image (minus any transparent margin), in the same coordinates the sprite is drawn with (camera applied). A wrong pivot makes sprites sink or float when squashed.
- Hit flashes and blinks that change `globalAlpha` or draw a white copy inside the wrapped draw are deformed with the sprite: that is wanted.

## Self-check without a browser

- The module file is byte-identical to the one you were given and loads before `create`.
- `ss.update(STEP)` runs once per fixed step, in the step; `ss.motion` runs for every moving actor after its movement each step.
- Every `apply` has a `restore` on every path (or you used `wrap`); nothing outside the sprite (HUD, bars, text) is inside it.
- No game variable reads `transform()`/`matrix()` except drawing code (shadows).
- Walk one landing with the defaults: falling at `maxFall` then `onGround` true → `sy` 0.72 (`sx` 1.39) held ~3 frames, back over 1.0 to about 1.04 by frame ~8, settled by ~16; the collision box is the same on every one of those frames.
- Walk one attack: frames 1-4 crouch to `sy` ≈ 0.88 leaning back ~8°, then the lunge: `sy` ≈ 1.1 leaning ~9° toward `dir`, the lean held 3 frames, back to rest in ~10 frames; the game's own hit frame is unchanged.

## What it guarantees

- `sx * sy = 1` exactly in smooth mode (`stats().maxVolErr`); in pixel mode both are rounded to whole pixels of the sprite's `w`/`h` and the lean to a whole-pixel top offset, so the sprite never shows half-pixels of scaling.
- Pixel mode cannot redraw the sprite: scaling a pixel image to a whole-pixel size still drops or doubles some rows and columns inside it (nearest neighbour). A 1-px eye or visor line can vanish or turn into a cross for the 3-frame squash. That is the cost of deforming pixel art; for sprites with 1-px detail use `stiffness` 0.4-0.6 or `amount` 0.6 on that actor (fewer rows change), and keep the deepest squash on soft actors.
- The feet never move: the transform's fixed point is `(footX, footY)`.
- `sy` stays within 0.45..1.8 and the shear within ±0.8 whatever the params or events.
- No input listeners, no timers, no `Math.random`, no wall clock. `apply`, `restore`, `wrap`, `motion`, `event`, `update` never throw on bad input (NaN feet = no transform, counted in `badInput`); `wrap` re-throws only your own draw function's error after restoring.
