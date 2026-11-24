# E-04 Shatter battle transition

## 1. What it is

The moment a battle starts, the game freezes the current frame and breaks it. A white impact flash, then cracks run out from the point of contact (the player, or the enemy it touched), the frame splits into triangular shards with bevelled glass edges, and the shards spin and fall off the screen over a dark backdrop with a little glass dust. The screen holds dark for a beat; the game switches to the battle there, unseen. The battle is then revealed with a stepped fade (or an iris, a mosaic or an unwinding swirl). Player input and world logic wait until it ends. Other looks for the same slot: **swirl** (the frame spins and zooms into the dark, pixelating), **mosaic** (blocks grow until the screen is gone), **iris** (a circle closes on the player). The same element can also play when leaving a battle or starting the next wave.

Works for any game that has a scene switch and a fixed step; it only needs a capture of the old frame, the step clock and the last draw call.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `variant` | shatter | shatter, swirl, mosaic, iris | How the old frame leaves |
| `reveal` | match | match, fade, iris, mosaic, swirl, cut | How the new scene arrives (`match`: shatter → fade, others mirror themselves) |
| `duration` | 900 ms | 600–1200 | Whole transition |
| `pieces` | 6 | 4–10 | Shards across (rows from the aspect ratio, 2 triangles per cell: 6 → 6×5×2 = 60 shards at 256×224) |
| `spin` | 240° | 0–720 | Largest rotation of a shard by the time it leaves |
| `flash` | on | on, off | White impact flash |
| `leave` | iris | iris, mosaic, swirl, shatter, none | Effect for leaving a battle / next wave (prompt-level choice; passed as `variant` to that `start()`) |

## 3. Variants

- **Glass shatter**: the defaults.
- **Fine glass, slow fall**: `pieces 9`, `duration 1200`, `spin 480`, mosaic reveal.
- **Swirl into battle**: `variant swirl`, 1000 ms, no flash.
- **Mosaic**: `variant mosaic`, 800 ms, no flash, leave by mosaic.
- **Iris close**: `variant iris`, iris reveal, 800 ms.

## 4. Interface

**Needs**
- The scene switch: the place where the game enters a battle (and, optionally, leaves it or starts a wave). `start()` goes first there, before anything changes what is drawn.
- A capture of the old frame: a canvas, or a function that renders the current frame now (`() => { render(); return canvas; }`). Rendering on demand matters for `?t=` fast-forward paths, which step many frames without drawing.
- The fixed step: `update(stepMs)` every step, including while busy; the step returns early while `busy()`.
- The last draw of every frame: `draw(ctx)` after scene, HUD and dialogs, in the live loop and the freeze path.
- Optional: focus point (screen pixels).

**Provides**
- `busy()`: true from `start()` until the reveal ends; the host drops input and pauses its world, timers and autoplay.
- `onMid`: once, at 55 %, with the screen fully covered. Hosts may switch scenes there, or keep their switch where it was (the cover hides it).
- `onDone`: once, at 100 %.

**Delivery (v1).** All of this is `module/battle-transition.js` (global `GameDNA_BattleTransition`; API and a 15-line integration in `module/README.md`). Colours come from `GameDNA_Skin.resolve(options.skin)` (`ink` backdrop, `fx.white` flash and young cracks, `ui.highlight` older cracks and lit shard rims, `ui.shadow` dark rims, `fx.cold` dust), with a built-in pixel16 copy when `skin-api.js` is not loaded; fades go through `GameDNA_Skin.motion.fade` (pixel16: 1, .75, .5, .25, 0). Robustness: callbacks run in `try/catch` (a throwing scene switch still gets its reveal, never a black screen); `start()` while busy runs the new spec's `onMid`/`onDone` at once (no switch is lost); a host that draws but never updates is advanced on draw calls after 45 draws; `update()` in seconds is detected; a capture that draws nothing falls back to `options.canvas`, then the page's canvas, then the backdrop; `draw()` never throws and restores the context. Verified by integrating into two unseen hosts (`checks/hosts/`).

## 5. Screen rules (exact numbers)

Native canvas (e.g. 256×224), integer-scaled, nearest-neighbour. D = duration.

- **Timeline**: out 0–55 % D, hold 55–63 % (backdrop only; `onMid` at 55 %), in 63–100 % (reveal); `onDone` at 100 %. The module clock is stepped to 1/60 s (pixel16 `stepMs`).
- **Shatter, out phase** (q = 0..1 over the out phase):
  - Flash: white over everything, alpha 0.85 → 0 by q = 0.14, stepped (0.75 / 0.5 / 0.25).
  - Cracks, q 0–0.24: the shard edges are drawn as 1 px lines on the frozen frame, nearest-to-focus first; an edge appears when its midpoint distance / farthest corner distance ≤ q / 0.24 × 1.15; the newest 40 % in `fx.white`, older in `ui.highlight`. Screen borders are not cracks.
  - Shards, q 0.24–1 (qq = 0..1): jittered grid (`pieces` columns, rows = round(pieces × h / w), inner points jittered ±38 % of a cell), each cell split along a random diagonal. Each shard is pre-cut once, alpha thresholded to 1 bit, with a 1 px rim: lit (`ui.highlight`) where the open side is above/left, dark (`ui.shadow`) below/right. Shard start delay = 0.32 × distance from focus / farthest corner; p = (qq − delay) / (1 − delay). Motion: sideways (cx − focus.x) / w × p × (50…120) px; a hop up of 10–24 px in the first 45 %; then fall p² × (h + size + 40) × (0.95…1.45). Rotation ± spin × (0.45…1) × p², snapped to 1/64 turn; position snapped to whole pixels; drawn nearest-neighbour. A shard below the screen or at p = 1 is gone; all are gone at q = 1.
  - Dust: 26 particles from grid points, 1 or 2 px, `fx.white` / `fx.cold`, outward + up then gravity, stepped fade.
  - Backdrop under everything: `ink` (pixel16 `#06061a`).
- **Swirl out**: rotate up to 1.25 turns × q², zoom 1 + 2.6 q², angle snapped to 1/64 turn, pixel blocks 1 + floor(5q); backdrop fades in from q 0.5 to 0.92.
- **Mosaic out**: block size steps 1, 2, 3, 4, 6, 8, 12, 16, 24 over q 0–0.85; backdrop fades in from q 0.45 to 0.9.
- **Iris out**: circle around the focus, radius from the farthest corner to 0 (smoothstep, closed at q 0.92), drawn as whole-pixel row spans.
- **Reveal** (p = 0..1): fade = backdrop alpha 1 − p stepped; iris = the circle opening; mosaic = live frame in blocks 24 → 1 plus backdrop fade over the first 55 %; swirl = the live frame unwinding; cut = nothing. Mosaic and swirl reveals read what the host drew this frame (`ctx.canvas`).
- **Draw order**: the module is the last thing drawn; it covers the whole `view` while out/hold and draws nothing once done.

## 6. Common mistakes (symptom → fix)

- The battle appears for a frame before the shatter → `start()` must be the first line of the switch, before anything changes what is drawn.
- The shards show a stale or empty frame in `?t=&freeze=1` shots → the fast-forward loop does not draw; capture with a function that renders now (`() => { render(); return canvas; }`), not a canvas copied from the last drawn frame.
- The transition never appears in battle (or only on the map) → `draw()` sits inside a render branch that returns early; call it after the render call, at every call site.
- Freeze shots show the scene without the transition → the `?t=` path calls render but not `draw()`.
- The game keeps running under the shards (enemy acts, a message advances, autoplay walks) → return early from the step while `busy()`, before the autoplay and world logic.
- Keys pressed during the transition fire afterwards → read and clear input before the busy check, then drop it.
- The transition never ends, input is locked → `update()` is not called while busy (it must run inside the busy branch), or it gets seconds instead of ms.
- Screen stays black after a scene error → keep the module's callbacks; never wrap `draw()` in your own condition that stops drawing the reveal.
- Two shatters at once / a double switch → do not start again while busy; the module refuses and runs the second switch at once.
- Restart during a transition leaves a frozen cover → `reset()` at new game / title.
- Autoplay ends differently from before → the busy gate placed after the autoplay or after some timers; it must come first.
- Blurry shards or text on shards → the canvas must be CSS-scaled with pixelated rendering; do not scale with smoothing.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=1560&freeze=1` | The meadow map with the white flash fading and the first cracks radiating from the hero. |
| `demo/?t=1700&freeze=1` | Full crack network; shards starting to separate near the hero, dark gaps, bevelled rims. |
| `demo/?t=1850&freeze=1` | Shards spinning and falling over the dark backdrop, glass dust. |
| `demo/?t=2050&freeze=1` | Hold: backdrop only (onMid has fired). |
| `demo/?t=2300&freeze=1`, `?t=2600&freeze=1` | The battle being revealed, then fully visible. |
| `demo/?t=1800&freeze=1&variant=swirl` / `mosaic` / `iris` | The three other looks. |
| `demo/?t=5300&freeze=1` | Leaving: iris closing on the battle. |
| `demo/?t=2600&freeze=1&throwmid=1` | onMid throws: the map is revealed again (no black screen), warning in the console. |
| Integrated hosts (`checks/hosts/`) | `?auto=1` reaches the same end as the original with no errors; shatter frames at each encounter. |
