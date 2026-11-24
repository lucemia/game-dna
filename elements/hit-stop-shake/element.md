# E-05 Hit-stop, shake & flash

## 1. What it is

The weight of a hit, in three parts. **Hit-stop**: on the frame a blow lands the whole world holds still for a few frames: attacker mid-swing, target mid-recoil, sparks and timers paused. **Shake**: the play field (not the HUD) jumps by whole pixels in the direction of the blow, then swings back and forth every two frames with a linearly decaying amplitude and a small seeded vertical jitter. **Flash**: the struck sprite turns white (near-black outline pixels stay) for one or two frames; a finisher also washes the field white for two frames under the HUD. Three strengths scale all of it: a light jab barely stops, a heavy hit lands, a finisher punctuates a fight.

The module owns no game state. It is a **gate** the game asks at the top of its fixed update step ("may the world run this step?"), a pair of draw brackets that apply the shake, and a sprite wrapper that whitens what the game draws. Because a frozen step changes nothing (no timer, no RNG, no input consumed), autoplay ends exactly as before, only later by the frozen frames, and `?t=&freeze=1` shows the same frame on every run. Works for real-time and turn-based games alike; it needs a fixed step, a hit event and the field's draw call.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `strength` | heavy | light, heavy, finisher | Strength used when `hit()` names none |
| `stop` | 6 frames | 0–20 | Hit-stop of a heavy hit; light = ½ (3), finisher = ×2 (12); 0 = off |
| `shake` | 4 px | 0–8 | Max shake, reached by a finisher; heavy = ½ (2), light = ¼ (1); never below 1 px when > 0 |
| `flash` | on | on, sprite, screen, off | `on` = struck sprite every hit + screen flash on finishers; `sprite` = sprite only; `screen` = screen flash on heavy and finisher hits only; `off` |
| `reduced` | system | system, on, off | Reduced motion: no shake, 1-frame flashes, screen flash ≤ 0.25 alpha. `system` reads `prefers-reduced-motion` once at create |
| `chain` | 30 frames | 6–120 | Module-only: the most frames in a row the world may stay frozen; then it runs at least as many frames before the next freeze |

| Strength | Hit-stop | Shake amp | Shake length | Sprite flash | Screen flash |
|---|---|---|---|---|---|
| light | `stop` × 0.5 → 3 | `shake` × 0.25 → 1 px | 6 frames | 1 frame | — |
| heavy | `stop` → 6 | `shake` × 0.5 → 2 px | 10 frames | 2 frames | — (`flash: screen`: 1 frame) |
| finisher | `stop` × 2 → 12 | `shake` → 4 px | 18 frames | 2 frames | 2 frames |

## 3. Variants

- **Classic 16-bit**: the defaults.
- **Arcade heavy**: `stop 9`, `shake 6` (finisher: 18 frames, ±6 px).
- **Subtle**: `stop 3`, `shake 2`, sprite flash only.
- **Reduced motion**: `reduced on` (hit-stop kept, no shake, one dim flash).

## 4. Interface

**Needs**
- A fixed update step (also run by `?t=` fast-forward and `?auto=1`) whose first line is the gate.
- A hit event on the impact frame: strength, contact point, target id, blow direction.
- The play-field draw bracketed by `begin`/`end` (or the game applies `offset()` itself); the HUD drawn after.
- Optional: each unit's sprite draw wrapped by `sprite(ctx, id, rect, fn)`, or an existing white sprite chosen with `flashing(id)`; UI rects; hit-stop requests from other elements routed to `freeze(ms)`.

**Provides**
- `step(dt)` → `false` while frozen; `frozen()`; `freeze(ms)` (one counter for every element).
- `offset()` → integer `{x, y}`; `shake(px, ms)`.
- White sprite flash, finisher screen flash, contact flash fallback.
- `stats()` counters and `lastDrawn()` flash rects, for tests and the judge probe.

**Delivery (v1).** `module/hit-stop-shake.js` (one global `GameDNA_HitStop`; API, a 15-line integration and a self-check in `module/README.md`). The host calls `create({view, seed, skin, params, uiRects, edge})`, then `if (!juice.step(STEP)) return;` first in its fixed step, `hit({strength, at, target, dir})` where hits land, `begin(ctx)` / `end(ctx)` around the play field, `sprite(ctx, id, rect, fn)` around each unit's sprite, `draw(ctx, -camX, -camY)` before the HUD, `clear()` at scene start. Colours go through `GameDNA_Skin.resolve(options.skin)`: flash colour `palette.fx.white`, screen-flash strength `motion.flashMax`, edge strip `palette.ink`, a dithered screen flash when `motion.flashMode` is `dither` (pixel8); the built-in fallback is the pixel16 look. Timing never depends on the skin.

## 5. Screen rules (exact numbers)

Native canvas (256×224 in the demo; any size via `view`), integer-scaled, nearest-neighbour.

- **Clock**: everything counts fixed 60 Hz steps given to `step(dt)` (a variable `dt` is split into whole frames, at most 30 per call). A hit at step N: render N shows the first shake kick and flash; steps N+1 … N+stop return `false`.
- **Freeze merge**: a new hit while frozen sets the remaining stop to max(remaining, new); hits never add up. After `chain` frozen steps in a row the world is forced to run and ignores freezes for `chain` steps (`capped`, `cooled` in `stats()`).
- **Shake**: amplitude A (px) for L frames; at shake frame f, a = round(A × (1 − f / L)), at least 1 while f < L. x = a × `dir` × (+1 for f mod 4 ∈ {0, 1}, −1 for {2, 3}); y = ±max(1, a ≫ 1) or 0 from a seeded hash (only when A ≥ 2). Whole pixels only, |x|, |y| ≤ `shake`. A weaker new shake never replaces a stronger running one. Shake keeps running during the freeze.
- **Begin / end**: `begin` saves, clips to `view`, translates by (x, y); `end` restores and fills the uncovered strip (|x| px wide, |y| px tall, inside `view`) with `palette.ink` (pixel16 `#06061a`) or `options.edge`.
- **Sprite flash**: inside the sprite rect (mapped through the current transform to device px, +1 px), every pixel the sprite draw changed whose R+G+B > 96 becomes `fx.white` (pixel skins 100 %, smooth skins 85 % toward white); darker outline pixels stay. Light 1 frame, heavy / finisher 2 frames, reduced 1.
- **Contact flash** (struck id not drawn through `sprite`/`flashing` this frame, e.g. removed on a killing blow): a white plus of arm 4 px (first frame, with 4 accent `fx.crit` tips) then 3 px, a 3×3 white core, at `at` + camera offset, riding the shake.
- **Screen flash**: finishers, 2 frames: alpha min(0.8, 2 × `flashMax`) then `flashMax` (pixel16 0.35 → 0.7, 0.35), over `view` minus every `uiRects` rect; reduced motion: 1 frame at min(0.25, `flashMax`); `flashMode: dither`: a 50 % then 25 % checker of white pixels instead of alpha.
- **Draw order**: background → units (wrapped) → effects → `end` → `draw` (flashes) → banners → HUD. The HUD never shakes or flashes.

## 6. Common mistakes (symptom → fix)

- `?auto=1` ends differently, or the autopilot misses a jump after a hit → the gate sits below input reading or the autopilot; put `if (!juice.step(dt)) return;` first, so a frozen step changes nothing.
- A key pressed during the freeze is lost → input was read (and the "just pressed" set cleared) before the gate; gate first, keep presses queued.
- Nothing freezes, though sprites flash → `step()` is only called from the rAF loop or not at all; call it in the fixed step that fast-forward also runs.
- The world freezes forever → the game checks `frozen()` but never calls `step()`; `step()` is what counts the freeze down.
- The whole screen, HUD included, shakes → the HUD is drawn before `end()`; draw it after `end()` and `draw()`.
- Stale pixels or a smear at one edge while shaking → the field was translated without `end()` (which paints the uncovered strip); use `begin`/`end`, or clear the canvas first.
- A shadow or HP bar turns white with the sprite → `sprite()` wraps too much; wrap only the sprite image call.
- No flash on a killing blow → the unit is removed the same step; pass `at` so the contact flash shows (automatic), or keep drawing it for 2 frames.
- Dozens of freezes per swing, the game crawls → `hit()` sits in a per-frame overlap test; call it once where the hit is accepted (after the cooldown / invulnerability check).
- Shake feels like a wobble, not an impact → `dir` missing; pass the blow's direction so the first kick pushes away from the attacker.
- Frozen screenshots differ between runs → shake or flash read wall-clock time in the game's own code; use only the module's `offset()` and step count.

## 7. Acceptance moments

The demo's hit-stops make page time run ahead of world time; the moments below are page time (`?t=`). `?log=1` (or `window.__demo()`) lists each hit's page and world time.

| Shot | Must be visible |
|---|---|
| `demo/?t=351&freeze=1` | Light jab on the golem: golem white for 1 frame, Rowan's slash, field offset 1 px, meter shows a 3-frame amber block. |
| `demo/?t=1318&freeze=1` | Heavy hit: golem white silhouette with dark outline kept, sparks frozen mid-air, offset ±2 px with a dark strip at one edge, HUD and banner still. |
| `demo/?t=4151&freeze=1` | Finisher on the wisp: wisp white, field washed white (0.7) except the banner and HUD, offset (−4, −2) with an ink strip on the right and bottom. |
| `demo/?t=4168&freeze=1` | Second finisher frame: wash at 0.35, wisp still white, shake swinging. |
| `demo/?t=4151&freeze=1&skin=flat` | Same through a non-pixel token skin: cream-white 85 % flash, flash strength 0.3 from the skin. |
| `demo/?t=4151&freeze=1&reduced=on` | Reduced motion: no offset, one dim (0.25) wash, wisp white. |
| Phone width 500 px | Canvas and meter fit at a whole-number scale, no horizontal scroll. |
| Hosts (`checks/hosts/`) | Battle: struck scorpion white on a strike, field wash and shake on a killing ember; side-scroller: crawler white, contact flash where a killed crawler vanished, hero white when hurt, HUD still; `?auto=1` ends as the original, later by the frozen frames. |
