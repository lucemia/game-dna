# battle-transition.js (E-04 module, v1)

One plain script with no dependencies and no `import`/`export`. It defines one global, `GameDNA_BattleTransition`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the whole transition: capturing the old frame, cracks, shards that spin and fall (or swirl, mosaic, iris), the hold on the backdrop, the reveal of the new scene, the timing and the callbacks. Your game keeps its own scenes and tells the module when to start.

Colours come from `GameDNA_Skin.resolve(options.skin)` when `skin-api.js` is loaded (load it, and the skin files, before this module). Without it the module uses a built-in copy of the `pixel16` colours, so a single-file game needs nothing else.

## API

`GameDNA_BattleTransition.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | Screen area to cover, `{x, y, w, h}` in native pixels. Default: the whole canvas. Use the full screen (HUD included). |
| `canvas` | Optional: your screen canvas. Used when `capture` gives nothing. |
| `skin` | Optional: a `GameDNA_Skin` id or object (default `pixel16`). |
| `seed` | Optional number: shard layout. The same seed and the same order of `start()` calls give the same shards. |
| `params` | Any of `variant` 'shatter', `reveal` 'match', `duration` 900, `pieces` 6, `spin` 240, `flash` 'on' (table below). |
| `onWarn(key, msg)` | Optional: called once per kind of problem (also logged with `console.warn`). |

| param | values | meaning |
|---|---|---|
| `variant` | `shatter`, `swirl`, `mosaic`, `iris` | How the old frame goes away. |
| `reveal` | `match`, `fade`, `iris`, `mosaic`, `swirl`, `cut` | How the new scene comes in. `match`: shatter → fade, the others → their own mirror. |
| `duration` | 600–1200 ms (accepts 300–3000) | Whole transition. Out 0–55 %, hold 55–63 %, in 63–100 %. |
| `pieces` | 4–10 | Shards across the screen (rows follow the aspect ratio; ×2 triangles). |
| `spin` | 0–720 ° | Largest shard rotation by the time it leaves the screen. |
| `flash` | `on`, `off` | White impact flash at the start. |

| method | |
|---|---|
| `start(spec)` | Starts a transition. `spec = {capture, onMid, onDone, variant?, reveal?, duration?, focus?: {x, y}, seed?}`. **Call it before the game changes what is on screen.** `capture` is a canvas or image of the old frame, or a function `(snapCtx, snapCanvas)` that draws the old frame into `snapCtx` or returns a canvas (e.g. `() => { render(); return canvas; }`). If it gives nothing, the module copies `options.canvas` (or the page's canvas). `focus` is where cracks start and the iris closes (the player, the enemy touched). Returns `true`; returns `false` while one is already running, and then calls this spec's `onMid` and `onDone` at once, so no scene switch is lost. |
| `busy()` | `true` from `start()` until the reveal ends. While true: ignore player input and pause world logic (step timers, AI, menus). |
| `update(dtMs)` | Advances the module's own clock. Call it from your fixed step **every step, also while busy**: milliseconds (`1000 / 60`). The callbacks fire from inside `update`. |
| `draw(ctx)` | Call it as the **last** draw of every frame, after the scene, HUD and dialogs, in every scene and in the `?t=&freeze=1` path. It covers the whole `view` while busy; it does nothing when idle. |
| `skip()`, `reset()` | `skip()` ends now (pending `onMid`, then `onDone`). `reset()` drops it silently: for new game / restart. |
| `phase()`, `progress()`, `state()`, `setParams(obj)`, `params()` | `'idle' \| 'out' \| 'hold' \| 'in'`; 0..1; a snapshot with counters for tests; live parameter change. |

Callbacks: `onMid` fires once when the screen is fully covered (55 %): switch the scene there. `onDone` fires once at 100 %. Each is wrapped in `try/catch`: if your scene switch throws, the warning is logged and the reveal still runs, so the screen is never left black.

## Integration (15 lines)

```js
// <script src="battle-transition.js"></script> before your game script
const tr = GameDNA_BattleTransition.create({ view: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H }, canvas: screenCanvas, seed: 1 });
function beginEncounter(enemy) {            // your existing "enter battle" function: keep its body, wrap the switch
  tr.start({
    capture: () => { renderFrame(); return screenCanvas; },   // the old scene, drawn now (works in ?t= fast-forward too)
    focus: { x: player.screenX, y: player.screenY },
    onMid: () => { /* the existing scene switch, e.g. */ switchToBattle(enemy); },
    onDone: () => {}
  });
}
function fixedStep() {
  const input = readInput();                 // still read/clear input every step
  if (tr.busy()) { tr.update(1000 / 60); return; }   // pause the world, drop the input
  /* ... the existing step ... */
}
function frame() { renderFrame(); tr.draw(ctx); }   // last, in the live loop AND the ?t=&freeze=1 path
```

If your switch must stay where it is (it runs immediately), call `tr.start({capture, ...})` as the first line of that function and leave the switch as it is: the module covers the screen until 55 %, so the new scene is never seen early.

## What it guarantees

- Deterministic: time comes only from `update(dt)`; shards, dust and angles come from the seed. `?t=<ms>&freeze=1` gives the same picture every time.
- `onMid` exactly once, then `onDone` exactly once, per started transition, even if `dt` jumps past both or a callback throws.
- Never stuck: if `draw()` is called about 45 times without any `update()`, the module advances itself on draw calls (one warning). `update(0.016)` (seconds by mistake) is detected and converted (one warning).
- Never black after the transition: once `onDone` has fired, `draw()` draws nothing.
- No input is read or consumed; no listeners are added. Pixel skins: integer positions, 1-bit shard edges, stepped fades, nearest-neighbour rotation.
- `draw()` restores the context (alpha, composite, smoothing, transform, clip) and never throws; a drawing failure falls back to a plain fade.
