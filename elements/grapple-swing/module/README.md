# grapple-swing.js (B-16 module, v1.1.0)

One plain script, no dependencies, no `import`/`export`, ASCII only. It defines one global, `GameDNA_Grapple`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it.

It adds a **grappling hook and rope swing** to a side-view game: the hook flies (a wavy rope behind it) to an **iron ring** (aim assist snaps to rings in a cone) or **bites any solid surface**; the hero hangs on a rope of fixed length and **swings like a pendulum**, **pumps** the swing with left / right, **reels in and out** (paying out only while the rope is pulled, so a swing keeps its tension), lets go **keeping the swing's momentum** (protected from the game's air drag for `carryMs`), or **jumps off** with a hop. The rope **wraps around corners** and unwraps when the hero swings back; a rope that cannot wrap snags and lets go. A shot at nothing flies to full range and reels back. It draws the rope (braided 1 px pixel rope, or a smooth stroked rope), the hook claw, the rings with a soft halo, an aim reticle on the spot a shot would bite, and sparks / grit where the hook bites.

**The game keeps its own physics.** The module never writes your hero. Each fixed step it reads the hero's box and velocity; while the hero hangs on a taut rope it returns the velocity the swing needs, and your game moves the hero with **its own** wall tests. Each step the module asks for is capped (`maxStep`, 0.45 tile) so a destination-only wall test cannot be skipped. It reads the result on the next step: a wall that stopped the hero stops the swing. Everything depends only on the seed, the calls and `update()` time (no `Math.random`, no wall clock).

## API

`GameDNA_Grapple.create(options)` returns an instance.

| option | meaning |
|---|---|
| `solid(x, y)` | The game's own wall test in **world px** (true = rock). The hook bites it, the rope wraps around it. Required for surface hooks and wrapping. |
| `tile` | Wall tile size, when `solid` is a tile test: wraps snap to the exact convex tile corner, and the step cap is 0.45 x tile. Optional. |
| `velUnit` | `'step'` (default) if your velocities are px per fixed step, `'second'` if px/s. `stepMs` (default 1000/60) is the fixed step length. |
| `gravity` | Your game's gravity in the same units (px/step^2 or px/s^2), or a function returning it. Without it: 900 px/s^2 x scale and one warning. |
| `anchors` | Array or function -> `[{id, x, y, enabled}]` ring anchors in world px. A ring may move (the rope follows); `enabled: false` hides it; a vanished ring releases the hero. |
| `hand` | Where the rope meets the body: `{x: 0.5, y: 0.3}` (fractions of the box, default) or `(body) => ({x, y})` in world px. Keep it independent of facing. |
| `scale` | View height / 180 (1 for 320x180, 2 for 640x360). Ranges, speeds and sizes are given at scale 1. |
| `bounds` | `{x, y, w, h}` world rect; left / right of it counts as rock. Optional. |
| `drawRings` | `false` = `draw()` does not draw the rings (call `drawRings()` yourself, e.g. behind the hero). |
| `seed`, `skin` | Seeded sparks; optional `GameDNA_Skin` id (pixel skins draw the pixel rope). |
| `params` | `range` 120, `hookSpeed` 720 (px/s), `reelSpeed` 70, `minLength` 14, `maxLength` 150, `tighten` 0.9 (rope reeled in to 90 % over 120 ms after the hook bites: a small yank), `swingForce` 240 (px/s^2 pump), `jumpBoost` 150 (px/s up when jumping off), `releaseBoost` 1.1, `carryMs` 1100, `airBrake` 420, `airDrag` 0.08, `aimAngle` 55 (degrees up when no aim vector), `aimAssist` 32 (degrees), `surfaces` 1, `wrap` 1, `mode` `'hold'` \| `'toggle'`, `maxStep` 0 (auto), `damping` 0.0015, `showAim` 1, `render` `'auto'` \| `'pixel'` \| `'smooth'`, `ropeColor`, `ropeDark`, `hookColor`. |
| `onEvent(type, e)` | Every event: `fire`, `attach`, `release`, `miss`, `snag`, `wrap`, `unwrap`, `reel`. Also `onFire`, `onAttach`, ... per type. For sounds, dust, achievements. |

| method | |
|---|---|
| `update(dtMs, input, body)` -> `r` | **Once per fixed step, at the start of the hero's movement code.** `body = {x, y, w, h, vx, vy, onGround, facing}` (top-left box, world px, your velocity units; read only). `input = {fire, hold, jump, release, push, reel, aimX, aimY, up, down}`: `fire` = grapple button pressed this step; `hold` = held (mode `hold`: letting go releases; leave it `undefined` if you only have presses); `jump` = jump pressed this step (on the rope: jump off); `push` -1..1 left/right (pumps the swing); `reel` -1 in, 1 out; `aimX, aimY` optional aim vector (mouse / stick; else facing and `aimAngle`, `up` / `down` steeper / flatter). Returns `r = {active, flying, vx, vy, state, attached}` (one reused object): **`r.active`** -> set your velocity to `r.vx, r.vy` and skip your own run, jump, jump cut and gravity this step; **`r.flying`** (just let go) -> set vx to `r.vx` after your air control and skip your variable-jump cut. `update(0, ...)` while paused changes nothing. |
| `draw(ctx, camX, camY, body)` | Rope, hook, rings (unless `drawRings: false`), aim reticle, sparks. World px minus `camX, camY` (`0, 0` inside your camera transform). Pass the body so the rope meets the hand where the hero is drawn. Never throws. |
| `drawRings(ctx, camX, camY)` | Only the rings (with the reticle on the targeted one). |
| `reset()` / `clear()` | Drop the rope, hook, carry and sparks (new run, respawn, lost life). |
| `release({vx, vy, jump})`, `fire(aimX, aimY, body)`, `drive({fire, holdMs, reel, jump, aimX, aimY})` | Let go / fire from code (cutscenes, a hurt hero); `drive` scripts the buttons for tests and bots. |
| `attached()`, `flying()`, `busy()`, `preview()`, `state()`, `length()`, `ropePath(body)` | Queries: on the rope; carrying momentum; anything going on; where a shot would bite now `{x, y, kind, ring}`; a JSON snapshot (state, length, free, anchor, pivots, hook, carry, aim, events); rope length; the rope as drawn `[hand, ...pivots, anchor]`. |
| `setParams(p)`, `params()`, `stats()`, `lastDrawn()`, `hash()` | Live params; counters (`fires, attaches, ringAttaches, surfaceAttaches, misses, snags, releases, jumpReleases, wraps, unwraps, reels, activeSteps, carrySteps, capped, maxSpeed, cbErrors, drawErrors, updErrors, badInput`); the last draw's rects (native px, for judges); a determinism hash. |

`GameDNA_Grapple.defaults`, `.params`, `.version`.

## Integration (15 lines)

```js
// <script src="grapple-swing.js"></script> before the game script
const grapple = GameDNA_Grapple.create({
  solid: (x, y) => solidAt(x, y), tile: TILE, velUnit: 'step', gravity: GRAVITY, scale: VIEW_H / 180,
  anchors: [{ id: 'r1', x: 232, y: 40 }, { id: 'r2', x: 520, y: 40 }], drawRings: false, bounds: { x: 0, y: -200, w: LEVEL_W, h: LEVEL_H + 400 } });
function updateHero(inp) {                                   // the game's existing per-step hero code
  const r = grapple.update(STEP_MS, { fire: inp.hookPressed, hold: inp.hookHeld, jump: inp.jumpPressed,
    push: (inp.right ? 1 : 0) - (inp.left ? 1 : 0), reel: inp.reelIn ? -1 : inp.reelOut ? 1 : 0 }, hero);
  if (r.active) { hero.vx = r.vx; hero.vy = r.vy; }         // on the rope: the swing owns the velocity this step
  else { /* existing run accel, jump */ if (r.flying) hero.vx = r.vx; /* jump cut only if !r.flying */ /* gravity */ }
  /* existing moveX / moveY / collision, unchanged */
}
// draw (inside the camera translate): grapple.drawRings(ctx, 0, 0); drawHero(); grapple.draw(ctx, 0, 0, hero);
// new run / respawn / life lost: grapple.reset();
```

## Self-check without a browser

- Every caller of the hero update (autoplay, `?t=` fast-forward, restarts) still works; the module is inert until the grapple button is pressed, so `?auto=1` ends exactly as before.
- `update` once per fixed step, before the hero's own velocity code; `update(0)` (or none) while paused.
- `solid`, anchors and the hero are in **world** px; only `draw` / `drawRings` get the camera, once.
- `r.active` replaces velocity, gravity and jump cut for that step only; `r.flying` keeps vx and skips the jump cut.
- Respawn / restart / lost life call `reset()`.
- The grapple key is not used by the game; reel keys do not steal jump or attack.

## Camera while swinging

A camera locked to the hero makes the world slide back and forth under a still hero on every swing. While `attached()` is true, aim
the camera at a mix of the anchor (`state().anchor` / the first pivot) and the hero (about 60 / 40), ease it slowly (about 0.035 per
step) and only clamp it so the hero stays on screen; off the rope go back to the game's usual follow. The camera is the game's: this
is advice, the module never moves it.

## Common mistakes

| symptom | fix |
|---|---|
| The hero falls away from the rope / the rope stretches | `r.vx, r.vy` not applied, or the game's gravity still added after them. Skip it while `r.active`. |
| Letting go drops straight down | Air control damps vx: apply `r.vx` while `r.flying`; skip the jump cut. |
| The hook bites thin air / the rope floats when the camera moves | `solid` or rings in screen px, or the camera applied twice. World px; `0, 0` inside a translate. |
| Swings jitter against walls | Good: the game's collision stopped the body. If the hero tunnels, `tile` / `maxStep` were raised above half a tile. |
| The world swings around a still hero | The camera follows the hero 1:1 on the rope; frame anchor + hero with a slow ease (see above). |
| `?t=` stills differ from play | `update` called in draw or with real frame time; use the fixed step. |
