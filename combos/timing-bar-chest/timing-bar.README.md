# timing-bar.js (F-01 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_TimingBar`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the whole skill check: the window, the bar and its zones, the sweeping marker, judging, feedback (flash, grade word, sparks, a small jolt on a miss) and the result. Your game keeps its own state; it starts a check, routes its confirm input to the bar while the bar is busy, and acts on the result.

If `skins/skin-api.js` (and a skin such as `pixel16.js`) is loaded before it, it draws through `GameDNA_Skin.resolve(options.skin)`; without it, it uses its built-in 16-bit look (the same as `pixel16`).

## API

`GameDNA_TimingBar.create(options)` returns an instance.

| option | meaning |
|---|---|
| `bounds` | Play field `{x, y, w, h}` in native pixels (or a function returning it). The window stays inside it, 4 px from the edges. Alternative: `view: {w, h}` (whole screen). With neither, the canvas size at the first `draw()` is used. |
| `skin` | Skin id or object (needs `skin-api.js`); default `pixel16`. Optional. |
| `seed` | Number or string. Random zone positions (and `'seeded'` autoplay grades) come only from this seed and the count of checks started, never from `Math.random` or your game's RNG, so your game's random stream is untouched. Default 1. |
| `params` | Any of `difficulty` 'normal' ('easy', 'hard', 'expert'), `speed` 1.1 (bar widths per second), `good` 0.30, `great` 0.14, `perfect` 0.05 (zone widths as a fraction of the bar), `motion` 'pingpong' ('linear': one pass, the end is a miss), `ease` 'none' ('sine': slow at the ends, fast in the middle; 'accel': +12 % per pass), `hits` 1 (presses per check, 1-5), `zones` 'random' ('fixed': centred on `centre` 0.5), `assist` 'off' ('on': 60 % speed, 1.5× zones, longer hold, no timeout), `width` 160 (bar px), `position` 'center' ('upper', 'lower'), `dim` 0.3 (darkens the field behind), `passes` 4 (ping-pong passes before an automatic miss), `shake` 'on', `autoGrade` 'good', `holdMs` 650 (result shown), `armMs` 240 (window opens; presses ignored). `difficulty` sets `speed`, `good`, `great`, `perfect` and `ease`; any of those you also pass wins. |
| `getObstacles()` | Optional. Rects `{x, y, w, h}`. A rect **without** `id` (HUD, menu, dialog box) is never covered; the window moves. A rect **with** `id` (a sprite) is avoided when that costs little. |
| `uiRects()` | Optional, same as rects without `id`. |
| `autoplay` | Optional `true`/`false` or a function returning it, read at each `start()`. When true, checks resolve themselves with `autoGrade`. |
| `onShake(px, ms)` | Optional. Called on a perfect (2 px, 120 ms) and a miss (1 px, 80 ms) when `shake` is on. Shake your screen or ignore it. |
| `onSfx(name)` | Optional. `'open'`, `'perfect'`, `'great'`, `'good'`, `'miss'`, `'close'`. The module plays no sound itself. |
| `onDone(result)` | Optional, for every check (in addition to the per-check one). |
| `debug(e)` | Optional: `start`, `hit`, `done`, `ignored` (start while busy), `noroom`. |

All callbacks are wrapped in try/catch; a missing callback is fine.

| method | |
|---|---|
| `start(opts)` → Promise | Opens a check. `opts`: `label` (title, e.g. `'PICK THE LOCK'`), `hint` (small text at the right, e.g. `'Z'`), `hits`, `difficulty`, `speed`, `good`, `great`, `perfect`, `motion`, `ease`, `zones` (`'random'`/`'fixed'`, or your own list `[{grade: 'good'\|'great'\|'perfect', from: 0..1, to: 0..1}]`), `anchor` `{x, y, w, h}` (the thing being worked on, in screen px: `x` = its centre, `y` = its top, `w`/`h` its size, default 16: the window sits above it, or below it if there is no room, and covers it only when nothing else fits), `auto` (`'perfect'`, `'great'`, `'good'`, `'miss'`, `'seeded'`, `true` = `autoGrade`, or null), `cancel` (true: X / Escape cancels), `onHit(h)` (each press, multi-hit), **`onDone(result)`**. A `start()` while a check is running is ignored and returns the running check's promise. |
| `busy()` | `true` from `start()` until the window has closed (`onDone` runs in the same `update()` that makes it false). While busy, send your confirm input to the bar and pause what the check is about. |
| `press()`, `tap()` | Your confirm input (button press, mouse or touch). Latched: it counts at the next `update()`, judged at the marker position that was on screen. Ignored while the window opens (`armMs`), between presses and in autoplay. Returns true while busy (input used). |
| `key(code, down)` | Raw keys instead of `press()`: pass `e.code` or `e.key` on keydown (`true`) and keyup (`false`). Returns `true` only for keys it used: Z, Space, Enter (and X, Escape, Backspace when `cancel` is on). Key repeat is ignored. Every other key returns `false`; your game handles it. |
| `update(dtMs)` | Call it in your fixed update step with the step length. It is the only clock (no wall time, no timers), so `?t=…&freeze=1` fast-forwards give the same frame every time. |
| `draw(ctx, ox = 0, oy = 0)` | Draws at native resolution. Call it last in your draw pass (after world and HUD), outside any screen-shake translate. Never throws. |
| `auto(grade?)` | Switch the running check to autoplay. |
| `cancel()`, `clear()` | `cancel()` closes the running check with `{grade: 'cancel'}`. `clear()` drops it silently (restart / new game; its `onDone` never runs). |
| `state()`, `lastResult()`, `rect()`, `lastDrawn()`, `setParams(obj)`, `params()` | Running check `{stage, hit, hits, pos, zones, results, auto}` or null; last result; window rect (with headroom for the grade word) for other overlays to avoid; drawn rects for tests; change or read params. |

**Result** `{grade, offset, hits: [{grade, offset}], score, timeout, auto, label}`. `grade` is `'miss'`, `'good'`, `'great'`, `'perfect'` (or `'cancel'`). With several presses it is the floor of the mean (miss 0, good 1, great 2, perfect 3). `offset` is the marker position minus the centre of the best zone, in bar widths (negative = early/left); the mean over presses. `timeout` is true when a press never came (counted as a miss).

**Use `onDone`, not `await`, for game logic.** `onDone` runs synchronously inside `update()`, so a `?t=&freeze=1` fast-forward loop and autoplay see the result on the right frame. A promise resolves only after the current task, which a synchronous fast-forward loop never yields.

The window title and hint use the skin's `ui` font: in `pixel16` that is letters, digits and `- . / ?` (no `!` or `:`).

## Integration (15 lines)

```js
// <script src="timing-bar.js"></script> before your game script (skin-api.js + pixel16.js before it if you have them)
const check = GameDNA_TimingBar.create({ bounds: { x: 0, y: 0, w: SCREEN_W, h: HUD_TOP }, seed: 7,
  params: { difficulty: 'normal' }, autoplay: () => AUTOPLAY,           // your ?auto=1 flag
  getObstacles: () => [hudRect, dialogRect, { ...playerBox(), id: 'player' }].filter(Boolean), onShake: (px, ms) => startShake(px, ms) });
function openLockedChest(chest) {                                       // the moment that needs a skill
  if (check.busy()) return;
  check.start({ label: 'PICK THE LOCK', anchor: { x: chest.sx, y: chest.sy, w: 16, h: 16 }, onDone: r => {
    if (r.grade === 'miss') showMessage('The pick slips.'); else reallyOpen(chest);   // the old code, now on success
  } });
}
function step(dt) {
  if (check.busy()) { if (input.confirmPressed) check.press(); check.update(dt); return; }   // world paused, confirm goes to the bar
  /* existing update */ check.update(dt);
}
function render() { /* world, effects, HUD */ check.draw(ctx); }      // last, outside the shake translate
function newGame() { check.clear(); /* existing code */ }
```

## Keep the game's other callers working

- **Autoplay**: find what drives `?auto=1` (an autopilot that injects inputs or calls actions directly). It must still reach the same end. Give autoplay a fixed grade that keeps the original outcome and numbers (`autoplay` option or `start({auto: 'good'})`), and make a miss path impossible for it. Never let the autopilot's own confirm presses reach the bar.
- **Fast-forward** (`?t=&freeze=1`, tests): `update()` must run inside the fixed step that those loops call, not only in the `requestAnimationFrame` loop. Act on the result in `onDone`, not after `await`.
- **The game's RNG**: do not call it more or less often because of the check (the module never touches it). If the bonus changes a number, multiply the result of the existing roll; do not roll again.
- **Every caller of the action you wrap**: the player's menu, the autopilot, a tap handler and a debug key may all reach it. Start the check in the one function they share, or wire each of them.
- **Keys**: while busy, only the confirm (and cancel, if on) belongs to the bar. Pause/menu/restart keys keep working. Do not remove or rename host functions; add the check around them.
- **Restart / new game**: `clear()` first.

## Self-check without a browser

1. The module file is byte-identical to the one you were given and is loaded before the game script.
2. `start(` appears only where the action happens (update logic), never in a draw function; it is guarded with `busy()` or harmless to repeat.
3. `update(` runs every fixed step, also while the world is paused for the check; the freeze/fast-forward loop calls that same step.
4. While `busy()`: the confirm input goes to `press()` (or `key()`), and the world, timers and the action that started the check wait.
5. The success code path is the old code, moved into `onDone`; the miss path lets the player try again.
6. Autoplay: walk one check with `auto: 'good'`: `start` → about 0.24 s still → marker reaches the good zone → hold 0.65 s → `onDone({grade: 'good'})` → same numbers as before.
7. `draw(` is the last call of the draw pass, outside any shake translate; restart calls `clear()`.

## What it guarantees

- Judging is per pixel column: the grade is the zone under the marker as drawn on the frame the press was latched. A one-frame tap counts.
- The perfect zone is never narrower than 1.25 frames of marker travel (and 3 px), so a human can always land in it.
- Same seed + same calls = same zones, same autoplay frame, same result, in every skin.
- `update` and `draw` catch their own errors and errors from your callbacks; bad `dt` (NaN, negative, > 250 ms) is clamped.
- The window never covers a rect without `id`, stays inside `bounds`, and does not move while open.
