# C-10 Springy UI motion

## 1. What it is

Motion design for the windows a game already has. A menu that used to blink into place now **pops** open with a small elastic overshoot (or **slides** in from the nearest screen edge, or **unfolds** from its centre line on pixel canvases) and **closes faster than it opened**. Its rows **slide in one after another**; the selection highlight (or pointer) **glides** to the new row on a damped spring instead of jumping, and the selected row **lifts** a pixel or two with a soft shadow. Gold, HP and counts **roll** to their new value. A modal window **fades a backdrop dim** in under itself and out again when it closes. Toasts slide in from the top.

The module owns no window, layout or input. The game keeps drawing every window exactly as before, at its final rect; the integration wraps that draw call (`ui.window(ctx, id, rect, drawFn, opts)`), each row (`ui.row`), the highlight rect (`ui.glide`) and printed numbers (`ui.count`). When the game stops drawing a window (its state closed it), the module plays the close from a device-pixel copy of the window's last frame, so game state never has to wait. **Input is never blocked or delayed**: there is no busy flag, no queue and no listener; a confirm pressed 1 frame after a window appears does what it did before on the same step. All motion runs on the module's own clock, advanced by `update(dt)` in the fixed step, so `?t=&freeze=1` frames are identical every run and `?auto=1` ends the same way at the same time.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `open` | 260 ms | 0–600 | Time to settle after opening (spring curve; opacity full at 35 %) |
| `close` | 140 ms | 0–400 | Close time (moves from the first frame, eases at the end); keep it below `open` |
| `bounce` | 0.12 | 0–0.4 | Overshoot of the open spring and of glides / lifts (0 = critically damped) |
| `style` | auto | auto, pop, slide, unfold | `auto` = pop on smooth canvases, unfold on pixel canvases (`imageSmoothingEnabled = false`); per window via `opts.style` |
| `stagger` | 30 ms | 0–80 | Delay between rows sliding in (row k starts at k × stagger, capped at row 10) |
| `glide` | 140 ms | 0–400 | Settle time of the highlight glide and the row lift (0 = jump) |
| `lift` | 2 px | 0–6 | How far the selected row rises (and shifts right by 0.75 × lift) |
| `dim` | 0.35 | 0–0.7 | Backdrop alpha for windows drawn with `dim: true` |
| `count` | 450 ms | 0–1200 | Number roll time (shorter for small changes: × min(1, 0.45 + Δ/60)) |
| `reduced` | system | system, on, off | Reduced motion: opacity only (open ≤ 140 ms, close ≤ 90 ms), no scale, slide, overshoot, stagger offset or lift; glides and numbers jump. `system` reads `prefers-reduced-motion` once |
| `shadow` | 0.45 | 0–1 | Module-only: soft window shadow (pixel canvases: a hard 2 px offset shadow); `opts.shadow: false` per window |
| `pixel` | auto | auto, on, off | Module-only: whole-pixel offsets and clip-based motion |

## 3. Variants

- **Modern indie**: the defaults.
- **Bouncy toy box**: `open 380`, `close 160`, `bounce 0.28`, `pop`, `stagger 45`, `glide 200`, `lift 3`.
- **Snappy tactical**: `open 150`, `close 90`, `bounce 0.04`, `slide`, `stagger 15`, `glide 80`, `lift 1`.
- **Pixel console**: `open 200`, `close 120`, `bounce 0.1`, `unfold`, `lift 1` (whole pixels, no scaling blur).
- **Reduced motion**: `reduced on`.

## 4. Interface

**Needs**
- A fixed update step that calls `update(dt)` (the same step `?t=` fast-forward and `?auto=1` run).
- Each window's existing draw code wrapped with a stable id and its real rect; `draw(ctx)` at the end of every render path.
- Optional: each menu's cursor (`opts.selected`), row rects, numbers to roll, and `open(id)` / `close(id)` where game logic opens and closes windows (exact mid-animation frozen frames).

**Provides**
- Open / close animation of any wrapped window (pop, slide, unfold), with backdrop dim and soft shadow; close played from a copy.
- Row stagger and lift (`row`, `rowOffset`), a gliding highlight / pointer rect (`glide`), rolling numbers (`count`, `counting`), a press kick (`pulse`).
- `state(id)`, `debug()`, `stats()` for tests and the judge probe (open / close timings, counters). They are never an input gate.

**Delivery (v1).** `module/springy-ui.js` (one global `GameDNA_SpringyUI`; API, a 15-line integration and a self-check in `module/README.md`). The only colours it draws (dim, shadows) come from `GameDNA_Skin.resolve(options.skin).palette.ink`, built-in pixel16 ink `#06061a`; timing never depends on the skin.

## 5. Screen rules (exact numbers)

- **Clock**: module ms = the sum of `dt` given to `update` (capped at 250 per call). Nothing reads wall-clock time or `Math.random`.
- **Open curve** p(e), e = elapsed / `open`: a damped spring with damping ratio ζ = −ln b / √(π² + ln² b) (b = `bounce`, b < 0.01 → critically damped 1 − (1 + 9e)e^(−9e)), ω_n = 5.8 / ζ in normalised time; |1 − p| < 0.004 at e = 1, then exactly 1. Defaults: peak 1.12 at e = 0.37 (96 ms).
- **Pop**: scale 0.82 + 0.18 p about the rect centre (or `opts.origin`), y offset (1 − p) × 6u px (u = view h / 360), opacity min(1, e / 0.35). Peak scale 1.022.
- **Slide**: offset (1 − p) × 22u px from the nearest edge (vertical edges preferred; `opts.edge`), opacity min(1, e / 0.4).
- **Unfold**: clip height p × h and width (0.7 + 0.3 p) × w about the centre (whole pixels on pixel canvases), opacity min(1, e / 0.2); no scaling.
- **Close**, c = elapsed / `close`, q = c × (1.5 − 0.5c) (moves from the first frame: about a third of the way at 25 %, so a close never reads as a hold; exported as `closeCurve`): opacity 1 − q (unfold 1 − q²); pop scale 1 − 0.07 q and y + 4u q; slide 0.6 × 22u × q toward its edge; unfold clip height 1 − q. Played on the live drawing if the game keeps drawing after `close(id)`, otherwise on a device-pixel copy of the window's last drawn frame (rect + 3 px, from its scale and opacity at that moment, so a window closed mid-open folds away from where it was). No copy is drawn when another window opened since the close over ≥ 50 % of its rect (a menu swapping its list: the new open carries the transition). A smaller overlap (dialogue handing off to a shop) keeps the copy but clips it, and its dim, around every window opened since the close, so the copy never covers the new window.
- **Rows**: row k (≤ 10) starts at k × `stagger` ms after the open; over 220 ms it slides from −12u px with ease-out cubic and fades in over the first 60 %. Lift L (spring toward 1 for the selected row, 0 for the others): y − `lift` × L, x + 0.75 × `lift` × L; on smooth canvases a soft shadow (blur 8u, offset 3u × L) under `rowRect`. `pulse`: x + 5u, springing back.
- **Glide / lift springs**: exact damped-spring steps, ζ from `bounce`, ω_n = 4.6 / (ζ × `glide`/1000 s). A glide snaps on its first call, after 30 unseen steps, and on fast-forward renders.
- **Fast-forward**: a render after 20+ steps without a render draws windows first seen then as settled, and glides / counters snap; windows stamped by `open()` keep their exact phase.
- **Auto close**: a window drawn last render but not this one starts closing at `draw()`; one not drawn for 30+ steps that is drawn again opens again.
- **Dim**: `view` filled with `ink` at `dim` × min(1, e / 0.6) while opening, × (1 − c) while closing. **Shadow**: smooth: blur (14 + 10 × lifted)u, offset (6 + 6 × lifted)u, alpha 0.55 × `shadow` × opacity; pixel: 2u px offset rect at 0.45 × `shadow`.
- **Numbers**: from → to over `count` × min(1, 0.45 + |Δ| / 60) ms, ease-out cubic, floored while rising, ceiled while falling; the real value is untouched.

## 6. Common mistakes (symptom → fix)

- A confirm pressed while a window opens does nothing → the integration ignores input while `state()` says opening, or queues it; delete that: input never waits for motion.
- The window lingers in game state after closing (pause still swallows keys for a moment) → the game's close was deferred until `onDone`; close game state at once, the module plays the close from a copy.
- Windows open settled, never animate → `update` is not called in the fixed step (module clock stuck), or the window is re-created with a new id every frame; call `update` every step and keep ids stable.
- Windows appear but never close smoothly (they vanish) → `draw(ctx)` is missing on that render path; call it last on every path, title and early returns included.
- The whole screen dims or zooms with the window → a full-screen dim or the scene is drawn inside the wrapped function; keep only the window inside, pass `dim: true` instead.
- The close animation shows the wrong area or a cut-off name tag → `rect` is not where the window is drawn (or misses a tab above it); pass the real outer rect.
- The highlight jumps instead of gliding, or glides from the last menu's row → `glide` is keyed per frame or shared by two windows; one key per window, called every frame it is visible.
- The highlight paints over the row above while gliding → it is drawn inside the selected row's loop iteration; draw it once before the rows.
- Blurry edges while a pixel window opens → `style: 'pop'` forced on a pixel canvas; use `auto` / `unfold` (or `pixel: 'on'`).
- `?t=&freeze=1` shots never show a window mid-open → the window was only detected by drawing (fast-forward renders draw it settled); call `ui.open(id)` where game logic opens it.
- Gold shows a stale number on a frozen shot → expected: counters snap on fast-forward renders; the rolled value is only for live play.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=620&freeze=1` | Camp menu mid-open: slightly scaled, rows Shop / Talk visible, Bag and Rest still sliding in and faded. |
| `demo/?t=1330&freeze=1` | Stall window popping out of the menu row, faint, scaled, its first rows starting to slide in; backdrop dim fading in. |
| `demo/?t=1450&freeze=1` | Stall window near its overshoot (scale ≈ 1.02), all five rows in, the highlight band on Moon Tonic and the row lifted. |
| live 2030–2100 ms (fake clock) | The highlight band between Moon Tonic and Ember Salve, then settled on Ember Salve with the row lifted. |
| live 3570–3720 ms | Confirm popup closing from a copy (already fading and shrinking on the first frames after the press) while the gold counter rolls 240 → 160 and the toast slides down from the top. |
| live 5480–5560 ms | Stall window closing faster than it opened (≈ 140 ms, visibly moving from the first frame), dim fading out. |
| `demo/?t=1330&freeze=1&reduced=1` | Opacity only: the stall window at its final rect, half transparent, no scale or offset. |
| `demo/?t=1330&freeze=1&compare=1` | Module off (instant, everything already in place) beside module on (mid-pop). |
| Hosts (`checks/hosts/`) | hd-topdown: dialogue, shop, bag, pause and the toast animate; battle: command list unfolds, rows stagger, the pointer and target cursor glide, HP / MP roll; both: `?auto=1` ends exactly as the original, step-exact input parity with presses inside animations. |
