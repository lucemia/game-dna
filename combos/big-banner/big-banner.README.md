# big-banner.js (C-04 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_BigBanner`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns everything about the banners: the chunky letter font, the translucent band, enter/hold/exit motion, colours per kind, the queue (two banners never overlap), placement clear of your HUD, and the "input should wait" flag. Your game keeps its own state and only tells the module when a moment happens.

If `skins/skin-api.js` (and a skin such as `pixel16.js`) is loaded before it, the banner draws through `GameDNA_Skin.resolve(options.skin)`; without it, it uses its built-in 16-bit look (identical to `pixel16`).

## API

`GameDNA_BigBanner.create(options)` returns an instance.

| option | meaning |
|---|---|
| `bounds` | Play field `{x, y, w, h}` in native pixels (or a function returning it). Keep the HUD out of it. Alternative: `view: {w, h}` (whole screen). With neither, the canvas size at the first `draw()` is used. |
| `skin` | Skin id or object (needs `skin-api.js`); default `pixel16`. Optional. |
| `params` | Any of `enter` 'slide' (or 'scale', 'drop', 'wipe'), `exit` 'wipe' (or 'slide', 'fade'), `enterMs` 260, `holdMs` 900, `exitMs` 260, `stagger` 35 (drop: ms between letters), `size` 2 (letter scale 1-3; shrinks automatically if the text would not fit), `band` 0.72 (band opacity), `position` 'center' (or 'upper', 'lower'), `block` 'on', `queue` 'queue' (or 'replace': a new banner cuts the current one short), `glint` 'on', `gap` 80 (ms between queued banners). |
| `getObstacles()` | Optional. Rects `{x, y, w, h}`. A rect **without** `id` (HUD window, menu, caption) is never covered: the band moves up or down to clear it. A rect **with** `id` (a sprite) is avoided a little when that costs only a few pixels. |
| `uiRects()` | Optional, same as rects without `id`. |
| `onStart(e)`, `onEnd(e)` | Optional, `e = {id, text, kind}` when a banner starts showing and when it has gone. Errors inside them are caught. |
| `debug(e)` | Optional: `show`, `start`, `end`, `ignored` (repeat), `drop` (queue over 6), `move`, `noroom`. |

| method | |
|---|---|
| `show(text, opts?)` → id | Queue a banner. `opts.kind`: `'phase'` (blue), `'enemy'` (red), `'clear'` (gold: stage clear, victory), `'defeat'` (dusk grey-violet), `'warn'` (amber, hazard edges, blinks), `'info'` (neutral: wave, round). `opts.sub`: a small second line ("TURN 2", "PRESS Z"). `opts.hold`: ms (default `holdMs`); **`0` = sticky**: it stays until `dismiss()`, `clear()` or the next `show()`. `opts.block`: override `params.block`. `opts.onDone(e)`. The same text/kind/sub asked again while it is up, queued, or ended under 1 s ago is ignored (so a call that repeats every frame cannot stack), unless `opts.repeat`. |
| `busy()` | `true` while a blocking banner is entering, holding or leaving, or is queued. A sticky banner counts only while it enters, so a "press Z" result screen never locks input. The module never reads input; your game decides whether to wait. |
| `update(dtMs)` | Call it in your fixed update step with the step length. It is the only clock (no wall time), so `?t=…&freeze=1` fast-forwards give the same frame every time. |
| `draw(ctx, ox = 0, oy = 0)` | Draws at native resolution. Call it last in your draw pass (after world and HUD), outside any screen-shake translate. Never throws. |
| `dismiss()` | The current banner leaves now (use for a sticky result banner when the player presses continue). |
| `clear()` | Removes everything at once (new game, restart). |
| `current()`, `count()`, `rect()`, `lastDrawn()` | The banner on screen `{id, text, kind, stage, sticky}` or `null`; banners on screen + queued; the band rect last drawn (give it to other overlays as an obstacle); drawn rects for tests. |
| `setParams(obj)`, `params()` | Change or read params live. |

## Integration (15 lines)

```js
// <script src="big-banner.js"></script> before your game script (skin-api.js + pixel16.js before it if you have them)
const banner = GameDNA_BigBanner.create({
  bounds: { x: 0, y: 0, w: SCREEN_W, h: HUD_TOP },                 // play field, HUD excluded
  getObstacles: () => [hudRect, menuRect].filter(Boolean),          // UI rects without id: never covered
  params: { enter: 'slide', exit: 'wipe', holdMs: 900 }
});
function startPhase(side) { /* existing code */ banner.show(side === 'player' ? 'PLAYER PHASE' : 'ENEMY PHASE', { kind: side === 'player' ? 'phase' : 'enemy', sub: 'TURN ' + turn }); }
function onWaveStart(n)   { /* existing code */ banner.show('WAVE ' + n, { kind: 'info' }); }
function onWin()          { /* existing code */ banner.show('VICTORY', { kind: 'clear', hold: 0, sub: 'PRESS Z' }); }
function onLose()         { /* existing code */ banner.show('DEFEAT', { kind: 'defeat', hold: 0 }); }
function newGame()        { banner.clear(); /* existing code, which may show the first banner */ }
function step(dt)         { /* existing update */ banner.update(dt); }       // every step, also in fast-forward loops
function render()         { /* world, effects, HUD */ banner.draw(ctx); }   // last, outside the shake translate
// optional: if (banner.busy()) skip player commands this step (autoplay must go through the same gate)
```

## Keep the game's other callers working

- Call `show()` **once, where the state changes** (the function that sets the phase, starts the wave, decides the result), never from the draw pass. The draw pass may run once in a frozen screenshot, or many times per step.
- Find every loop that calls your step (`requestAnimationFrame` loop, `?t=&freeze=1` fast-forward, autoplay, tests) and make sure `update()` runs inside the step itself, not only in one of those loops.
- Stop drawing the game's old text for these moments (remove the call in the draw pass), but keep the helper functions: other code may call them.
- Do not change how long the game's own phases last, its autoplay timing or its keys. Waiting on `busy()` is optional; if you add it, gate in one place that both the player and the autoplay go through, and never gate the restart/continue key.
- Restart / new game: `clear()` first, then the first banner of the new game.

## Self-check without a browser

1. The module file is byte-identical to the one you were given; it is loaded before the game script.
2. Every `show()` call sits in update logic at a state change; grep shows none in a draw function.
3. `update(` is called inside the fixed step; the freeze/fast-forward loop calls that same step.
4. `draw(` is the last call of the draw pass (or after the HUD), with no shake translate around it.
5. Sticky banners (`hold: 0`) are only used where the game waits for a key; `dismiss()` or `clear()` runs when that key is pressed.
6. Walk one transition: phase changes → `show()` → next steps `update(16.7)` → `busy()` true about 1.4 s (if `block` on) → banner gone, `busy()` false.

## What it guarantees

- Never two banners on screen: later ones wait in a queue (max 6) with an 80 ms gap, or (`queue: 'replace'`) cut the current one short.
- Repeated identical `show()` calls do not stack or restart the banner.
- The band is full field width, never covers a rect without `id`, stays inside `bounds`, and does not jump while shown unless a UI rect opens over it.
- Text that does not fit shrinks a size step (3 → 2 → 1).
- Timing depends only on `update()` and params; the skin changes only the look.
- `update` and `draw` catch their own errors and errors from your callbacks; bad `dt` (NaN, negative, > 250 ms) is clamped.
