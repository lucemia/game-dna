# springy-ui.js (C-10 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_SpringyUI`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It adds **motion design** to the windows and menus your game already draws: panels open with an elastic pop, slide or unfold and close faster than they open, list rows stagger in, the selection highlight glides between rows on a spring, the selected row lifts slightly, numbers roll to their new value, and a backdrop dim fades in and out. Your game keeps drawing every window exactly as before, at its final rect; the module only wraps those draw calls with a transform and an opacity.

**It never touches input or game state.** There is no "busy" flag to wait for: a confirm press during an open animation is handled by your game on the same step as before, and its result comes back the same way. Everything runs on the module's own clock, advanced by `update(dt)` in your fixed step, so `?t=<ms>&freeze=1` and `?auto=1` stay deterministic.

Optional look: load `skin-api.js` and a skin before it and pass `skin`. The module draws only a backdrop dim and soft shadows, coloured with the skin's `palette.ink` (built-in: the pixel16 ink `#06061a`). Timing never depends on the skin.

## API

`GameDNA_SpringyUI.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | The screen `{x, y, w, h}` in the units your draw code uses (native px, or the logical size if you scale with `setTransform`). Used for the backdrop dim and to size slide distances (they scale with `h / 360`). Default 640×360. |
| `params` | `open` 260 (ms to settle after opening), `close` 140 (ms; keep it shorter than `open`), `bounce` 0.12 (overshoot, 0 = none, 0.3 = very springy), `style` `'auto'` \| `'pop'` \| `'slide'` \| `'unfold'` \| `'none'` (auto = pop on smooth canvases, unfold on pixel canvases), `stagger` 30 (ms between rows), `glide` 140 (ms for the highlight / lift springs), `lift` 2 (px the selected row rises), `dim` 0.35 (backdrop alpha for windows opened with `dim: true`), `shadow` 0.45 (soft window shadow, 0 = none), `count` 450 (ms for a number roll), `reduced` `'system'` \| `'on'` \| `'off'` (reduced motion: fades only, no scale, slide, overshoot, stagger offset or lift; highlight and numbers jump; `'system'` reads `prefers-reduced-motion` once), `pixel` `'auto'` \| `'on'` \| `'off'` (whole-pixel offsets and clip-only motion; auto = when `ctx.imageSmoothingEnabled` is false; on an HD canvas with smooth or vector art that turns smoothing off only for its sprites, pass `pixel: 'off'` to keep the pop). |
| `skin` | Skin id or object (needs `GameDNA_Skin`); `false` = built-in colour. |
| `enabled` | `false` = pass-through (for an on/off toggle; `setEnabled()` later). |

| method | |
|---|---|
| `window(ctx, id, rect, drawFn, opts)` | **The main call.** Wrap the code that draws one window: `drawFn()` runs as always, inside a transform and opacity for the window's open or close animation. `id` = a stable name for that window (`'pause'`, `'shop'`, `'dialogue'`); `rect` = its final box `{x, y, w, h}` (or `[x, y, w, h]`) in the same units you draw with. The first render that calls it opens the window; the first render without it starts the close (played by `draw()` from a copy of the last frame, cut around any window that opened since, e.g. the shop a dialogue hands off to). `opts`: `selected` (the row index your cursor is on: that row lifts), `dim` (`true` or an alpha: fade a backdrop under it), `shadow` (`false` or 0..1), `style` (per window), `edge` (`'bottom'`, `'top'`, `'left'`, `'right'` for slide; default: the nearest screen edge), `origin` `{x, y}` (pop out of that point, e.g. the speaker or the menu row that opened it), `radius` (shadow corner radius). Returns `drawFn`'s return value. |
| `row(ctx, id, k, drawFn, rowRect)` | Inside a window's `drawFn`: wrap the drawing of row `k` (0-based). Rows slide in one after another (`stagger`), the selected row lifts by `lift` px (and gets a soft shadow under `rowRect` on smooth canvases). `rowRect` is optional (shadow only). |
| `rowOffset(id, k)` | `{x, y, alpha, lift}` for row `k` now, if you prefer to apply it yourself. |
| `glide(key, rect)` | Pass where the selection highlight (or pointer, or target cursor) SHOULD be; get back where to draw it this frame: `{x, y, w, h}` moving on a damped spring. It snaps the first time, after 30 steps unseen, and on fast-forward renders. Draw the highlight **before** the rows, once per window. |
| `count(key, value)` | Pass the real number; get back the number to print, rolling to it over `count` ms (integers stay integers). The real value is never changed. `counting(key)` = 1 rising, -1 falling, 0 settled (for a colour). |
| `draw(ctx)` | **Call once at the end of every render path** (also title and other early returns), after all windows. Starts the close of windows that were not drawn this render and draws their closing animation (and the fading dim). |
| `update(dtMs)` | Once per fixed step (also the steps `?t=` fast-forward runs). Only advances the module clock and springs; it never returns anything to wait for. |
| `open(id, opts)` / `close(id, onDone)` | Optional, from game logic where a window opens / closes. They stamp the animation on the game's step, so `?t=<ms>&freeze=1` shots taken mid-animation are exact. Without them a fast-forwarded render shows windows settled. `onDone(id)` runs from `update()` when the close animation ends: for visuals only, never for game logic. After `close(id)` you may keep drawing the window until `onDone` (it then plays the close on your live drawing) or stop (the copy plays it). |
| `select(id, k)`, `pulse(id, k)` | Set the selected row without `opts.selected`; give row `k` a small press kick (call it where your game handles a confirm). |
| `clear()` | Drop every window, glide and counter at once (scene change without closing animations). Pending `onDone` callbacks run. |
| `setParams(p)`, `params()`, `setEnabled(on)`, `enabled()`, `reduced()` | Live tuning and toggles. |
| `state(id)`, `debug()`, `stats()` | For tests and the judge only: phase (`opening`, `open`, `closing`, `closed`), ms, alpha, scale, counters `{opens, closes, autoCloses, openMs[], closeMs[], ghostFrames, rowCalls, glideCalls, countCalls, errors, warnings}`. **Never use them to delay or block input.** |
| `GameDNA_SpringyUI.springCurve(e, bounce)`, `.closeCurve(c)` | Static: the open spring (0..1 time → progress, overshoots by about `bounce`) and the close progress (moves from the first frame, about a third done at 25 %), for charts and tools. |

## Integration (15 lines)

```js
// <script src="springy-ui.js"></script> before your game script
const ui = GameDNA_SpringyUI.create({ view: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H }, params: { open: 260, close: 140, bounce: 0.12, stagger: 30, glide: 140, lift: 2, reduced: 'system' } });
function update() { /* ...your fixed step, unchanged... */ ui.update(1000 / 60); }
function openMenu(m) { /* ...existing... */ ui.open(m.id); }            // optional: exact mid-animation ?t= frames
function closeMenu(m) { /* ...existing... */ ui.close(m.id); }          // optional
function render() {
  if (scene === 'title') { drawTitle(); ui.draw(ctx); return; }         // every render path ends with ui.draw
  drawWorld(); drawHud();
  for (const m of openMenus) ui.window(ctx, m.id, m.rect, () => {       // wrap the EXISTING window draw
    drawFrame(m.rect);
    const hl = ui.glide(m.id, rowRect(m, m.cursor)); fillHighlight(hl);  // highlight before the rows
    m.items.forEach((it, k) => ui.row(ctx, m.id, k, () => drawItem(m, it, k), rowRect(m, k)));
  }, { selected: m.cursor, dim: m.modal });
  ui.draw(ctx);                                                         // last: closing windows
}
// numbers: drawText('Gold ' + ui.count('gold', gold), ...)
```

## Keep the rest of the game working

- **Input stays exactly as it was.** Do not wait for an animation before handling a key, do not ignore presses while a window opens, do not delay closing a window in game state until its animation ends: the game state closes on the step it always did; the module plays the close on a copy. A confirm pressed 1 frame after a window appears must do what it did before.
- Wrap **only drawing**: never move menu logic, cursor handling or state changes into `drawFn`. `drawFn` must not change game state (it may run at opacity 0).
- Keep the rect equal to where the window is really drawn; the shadow and the close copy use it. Wrap the window itself, not a fixed panel that is always on screen (a battle's bottom panel): while a wrapped box unfolds or scales, whatever the game drew under it last frame shows through unless the scene is redrawn underneath every frame. A full-screen dim the game draws in the same function stays outside `window()` (or remove it and pass `dim: 0.55`).
- `ui.update` in the fixed step (the same step `?t=` fast-forward and `?auto=1` run), not in the render loop. `ui.draw(ctx)` at the end of **every** render path, including title, game-over and early returns.
- Hit tests for taps or clicks keep using the final rects (the module never moves where a row "is", only where it is drawn for a moment).
- Find every caller of what you touched: autoplay (`?auto=1`), `?t=` fast-forward, keyboard shortcuts, pause, restart / new game, title. Hook, don't replace: keep every function, name and caller.

## Self-check without a browser

- The module file is byte-identical to the one you were given and loads before `create`.
- `ui.update(...)` runs once per fixed step on every scene; nothing reads `ui.state()` / `ui.debug()` to decide game logic or to drop input.
- Every window draw is wrapped exactly once per render with a stable id and its real rect; ids differ between windows open at the same time.
- Highlights use `ui.glide` once per window, drawn before the rows; rows use `ui.row` with their index.
- `ui.draw(ctx)` is the last call of every render path.
- Walk one open with the defaults: opacity reaches 1 after ~90 ms, the scale overshoots to ~1.02 at ~95 ms and settles at 1.0 by 260 ms; row k starts at k × 30 ms and is in place 220 ms later; a close takes 140 ms and is already about a third done at 35 ms. A Z press at 17 ms gets the same result as without the module.

## What it guarantees

- No input listeners, no `preventDefault`, no game state: the module cannot block, delay or eat a key press. Its only outputs are pixels and the values `glide()` / `count()` return for drawing.
- Deterministic: every animation is a function of the step count; no wall clock, no `Math.random`. A render after 20+ silent steps (fast-forward) draws windows that opened before it settled (or exactly mid-animation when `open()` stamped them).
- Close is played from a copy of the window's last drawn frame, so the game can drop the window from its state at once. When another window opens over most of the same rect (a menu swapping its list), the copy is skipped and the new window's open carries the transition. If `draw()` is never called, windows simply vanish (no error); a window not drawn for 30 steps and drawn again opens again.
- Pixel canvases (`imageSmoothingEnabled = false`) get whole-pixel offsets and clip-based unfold instead of scaling (no blurry edges).
- Reduced motion: opacity fades only (≤ 140 ms open, ≤ 90 ms close), no movement.
- Never throws from `update`, `draw`, `glide`, `count`; the host's own `drawFn` errors still surface (after the canvas state is restored).
