# hit-stop-shake.js (E-05 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_HitStop`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the "juice" of a hit: **hit-stop** (the world freezes for a few frames), **screen shake** (decaying, seeded, whole-pixel offsets) and **white flash** (the struck sprite for 1-2 frames; the whole field for a finisher). Your game keeps its own state; the module only tells it when to skip a step and where to draw.

Optional look: load `skin-api.js` and a skin (e.g. `pixel16.js`) before it and pass `skin`. The flash colour comes from `palette.fx.white`, the screen-flash strength from `motion.flashMax`, the edge strip from `palette.ink`. Without them it uses a built-in pixel16 look. Timing never depends on the skin.

## API

`GameDNA_HitStop.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` (or `bounds`) | Screen rect `{x, y, w, h}` in native canvas px that shakes and flashes. End it above your HUD. Default: the whole canvas. Any native resolution works. |
| `seed` | Integer. Same seed + same calls on the same steps = the same offsets. Default 1. |
| `skin` | Skin id or object (needs `GameDNA_Skin`). Omit for `pixel16`; `false` = built-in look. |
| `params` | `strength` 'heavy' (used when `hit` names none), `stop` 6 (hit-stop frames for a heavy hit; light = half, finisher = double), `shake` 4 (max shake px, reached by a finisher; heavy = half, light = a quarter, at least 1), `flash` 'on' \| 'sprite' \| 'screen' \| 'off', `reduced` 'system' \| 'on' \| 'off' (no shake, 1-frame dim flash; 'system' reads `prefers-reduced-motion` once), `chain` 30 (the most frames in a row the world may stay frozen). |
| `uiRects` | Optional array or function → screen rects (HUD, banner, menus). The screen flash never covers them. |
| `edge` | Optional colour for the strip the shaking field uncovers (default: the skin's `ink`). |

| method | |
|---|---|
| `hit(opts)` | A blow landed. `opts = {strength, at, target, dir, crit}`: `strength` `'light'` \| `'heavy'` \| `'finisher'` (aliases: `crit`, `kill`, `normal`…; or a number 0..1); `at` = `{x, y}` contact point (world coords, used only for the fallback flash); `target` = the struck unit's id (its sprite flashes); `dir` `1` / `-1` = the blow's direction (first shake kick); `crit: true` = finisher. Also `hit('heavy', {target})`. Returns the strength used. Call once, on the step the hit lands. |
| `step(dtMs)` | **Call first in every fixed update step.** Advances freeze, shake and flash by `dtMs` (default one 60 Hz frame). Returns `true` = run the world this step, `false` = hit-stop: skip everything that changes the game this step. |
| `frozen()` | `true` while a hit-stop is pending (read-only; `step` is what counts it down). |
| `begin(ctx)` / `end(ctx)` | Wrap the drawing of the play field. `begin` saves, clips to `view` and translates by the shake offset; `end` restores and paints the strip the shake uncovered. Draw the HUD after `end`. Returns the offset `{x, y}`. |
| `offset()` | The current shake offset `{x, y}`, whole pixels, if you prefer to translate yourself. |
| `sprite(ctx, id, rect, drawFn)` | Wrap the call that draws one unit's sprite: `drawFn()` runs as always; while `id` flashes, every pixel it changed inside `rect` (same coordinates you draw with) turns white, near-black outline pixels stay. Wrap only the sprite, not its shadow or HP bar. It reads pixels back only on flash frames (Chrome may log a `willReadFrequently` hint: harmless; `getContext('2d', {willReadFrequently: true})` silences it). A canvas that cannot be read (cross-origin images) falls back to the contact flash. |
| `flashing(id)` | `1` while `id` flashes, else `0`: use it instead of `sprite()` if your game already has a white or hurt version of the sprite. |
| `draw(ctx, offX = 0, offY = 0)` | After `end`, before the HUD: the finisher screen flash (view minus `uiRects`) and, for a struck `target` you never wrapped with `sprite()` / asked `flashing()` for, a small white contact flash at `at` (pass `-cameraX, -cameraY` if `at` is in world coords). Never throws. |
| `freeze(ms)`, `shake(px, ms)` | For other effects that request a hit-stop or a shake (e.g. an `onHitStop(ms)` callback): one freeze counter for everything. |
| `clear()` | Cancels freeze, shake and flashes (scene / battle / level / life start). |
| `setParams(o)`, `params()`, `stats()`, `busy()`, `lastDrawn()`, `reduced()` | Live params; counters `{hits, light, heavy, finisher, frozenSteps, runSteps, maxChain, capped, cooled, maxOffset, shakeFrames, screenFlashFrames, spriteFlashFrames, localFlashFrames, unwired, vanished, drawTicks, …}`; anything still running; the flash rects drawn last frame; reduced motion on? |

## Integration (15 lines)

```js
// <script src="hit-stop-shake.js"></script> before your game script (optional: skin-api.js + pixel16.js first)
const juice = GameDNA_HitStop.create({ view: { x: 0, y: 0, w: 256, h: 160 }, seed: 1,       // play field above the HUD
  params: { stop: 6, shake: 4, flash: 'on', reduced: 'system' }, uiRects: () => [hudRect] });
function update() {                                   // your fixed 60 Hz step (also run by ?t= fast-forward)
  if (!juice.step(1000 / 60)) return;                 // FIRST line: hit-stop skips input reading, autoplay and world alike
  /* ...existing input, autoplay, world... */
}
function applyDamage(target, amount, info) {          // your existing hit site: keep its body, add one line
  /* ...existing HP code... */
  juice.hit({ strength: target.hp <= 0 ? 'finisher' : info.heavy ? 'heavy' : 'light', at: info.point, target: target.id, dir: info.facing });
}
function render() {
  juice.begin(ctx); drawBackground(); for (const u of units) juice.sprite(ctx, u.id, u.rect, () => drawUnit(u)); drawEffects(); juice.end(ctx);
  juice.draw(ctx, -camX, -camY); drawHud();           // HUD stays still and is never flashed
}
// scene / level / battle START: juice.clear();
```

## Keep the rest of the game working

- **The gate goes at the very top of the fixed step**, before input is read and before the autoplay picks a move. A frozen step must change nothing: no timers, no RNG, no animation counters, no input consumed (keys pressed during the freeze stay queued and apply on the next real step). Then `?auto=1` reaches the same ending, only later by the frozen frames, and `?t=<ms>&freeze=1` shows the same frame every time.
- Never gate title, pause, menu or result screens with something only the world uses: a hit-stop is at most `stop × 2` frames and `clear()` at scene changes ends it.
- Never use wall-clock time for game logic during or after a freeze; the step count is the clock.
- Find every caller of what you touched: autoplay (`?auto=1`), `?t=` fast-forward (it must call the same step, so it passes through the gate), keyboard shortcuts, pause, restart / new game.
- Hook, don't replace: keep every function, name and caller. Keep the game's own hurt blink or knockback if it has one.

## Self-check without a browser

- The module file is byte-identical to the one you were given and loads before `create`.
- `juice.step(...)` is the first statement of the fixed step; nothing above it reads input, rolls RNG or advances a counter, except title / pause screens you deliberately keep running.
- Every damage site calls `juice.hit` exactly once, on the step HP changes (after any invulnerability or cooldown check), never in a per-frame overlap loop.
- `begin` / `end` are paired in every render path (title and result screens too, or neither); the HUD is drawn after `end` and `draw`.
- Walk one finisher: `hit` → next `step` returns false 12 times (defaults) → the world resumes where it was; shake offsets ±4 → 0 over 18 frames; one sprite flash of 2 frames; one screen flash of 2 frames.
- `juice.clear()` runs at scene / battle / level / life start; nothing else was removed or renamed.

## What it guarantees

- Integer offsets only, `|x|, |y| ≤ shake`; the first kick goes in `dir`; the shake decays linearly and alternates every 2 frames; the vertical part is seeded.
- Overlapping hits never stack freezes (the longest remaining wins). No more than `chain` frames in a row are ever frozen; after that the world runs at least `chain` frames before the next freeze, even if `hit` is called every step.
- If `draw` runs but `step` is never called (10 draws in a row), flashes and shake advance per draw so nothing stays white; there is no hit-stop then (`stats().drawTicks`).
- Shake and flashes keep running during the freeze (the frozen frame trembles), all counted in steps, so fast-forward and autoplay are deterministic.
- Nothing is flashed over `uiRects` or outside `view`; reduced motion turns the shake off and shortens and dims the flash.
- No input listeners; never throws from `step`, `begin`, `end` or `draw` (the host's own `drawFn` errors still surface).
