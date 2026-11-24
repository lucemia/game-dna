# dissolve-defeat.js (E-03 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_DissolveDefeat`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the whole effect: the snapshot of the defeated unit's sprite, the four variants (dither-noise fade, horizontal slice wipe, pixel crumble with gravity, flash-then-fade), timing, clipping and drawing. Your game keeps its own state: when a unit is defeated you hand the module a picture of it and **remove the unit at once**. Nothing in your battle has to wait.

If `skin-api.js` (GameDNA skins) is loaded before it, colours, fade steps and particle gravity come from the skin (`options.skin`, default `pixel16`). Without it the module uses the same pixel16 values built in.

## API

`GameDNA_DissolveDefeat.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | Play field `{x, y, w, h}` in native pixels (or a function returning it). Nothing is drawn outside it, so keep it above the HUD. |
| `params` | Any of `variant` 'dither' (`'dither'`, `'slice'`, `'crumble'`, `'flash'`), `duration` 700 ms (200–3000), `flash` 100 ms (white blink before the dissolve; 0 = none), `edge` 'white' (`'white'`, `'hot'`, `'cold'`, `'crit'`, `'none'`: colour of the dissolving edge and sparks), `chunk` 1 (crumble piece size, px), `spill` 3 (px the effect may reach outside the unit's rect). |
| `skin`, `seed` | Optional. The same seed and the same calls give the same pixels every run (no `Math.random`). |
| `uiRects()` | Optional. Rects the effect never draws over (banners, windows). |
| `getRect(id)`, `drawSprite(ctx, id, rect)` | Optional fallbacks used when `defeat()` is called without `rect` / without a picture. |
| `onDone(id)` | Optional. Called when an effect ends. |

| method | |
|---|---|
| `defeat(id, o)` | Call it on the frame the unit is defeated, **before** you stop drawing it. `o.rect` = `{x, y, w, h}`: where the sprite is drawn on screen right now (native px). The picture is either `o.image` (the sprite's canvas or image, drawn at the rect's top-left; `o.flipX: true` if you draw it mirrored; `o.src: {x, y, w, h}` for a sheet region) or `o.drawSprite(ctx, rect)`: draw the unit on **that** `ctx` exactly as you draw it on screen (the module translates, so use normal screen coordinates). Optional per call: `variant`, `duration`, `flash`, `edge`, `onDone`. Returns a Promise that resolves when the effect ends (or `null` where there are no Promises). A second call for an id that is still dissolving is ignored. No rect: nothing is drawn and one console warning explains why; it never draws at the screen centre. |
| `update(dtMs)` | World time in ms, once per game step (`1000 / 60` for a 60 Hz step). `0` while the game is frozen. A value below 1 is taken as seconds, with one warning. |
| `draw(ctx, offsetX = 0, offsetY = 0)` | Draws every running effect at native resolution. Call it every frame after your units, before banners and HUD, inside any screen-shake translate. Never throws. |
| `busy(id?)` | `true` while any effect (or that id's) is still running. |
| `clear()` | Ends everything at once (resolves the promises). Call it where a new battle or level starts. |
| `count()`, `lastDrawn()`, `setParams(obj)`, `params()` | Running effects; the rects drawn last frame `[{x, y, w, h, id, variant}]` (for tests); change params live. |

## Integration (15 lines)

```js
// <script src="dissolve-defeat.js"></script> before your game script
const dd = GameDNA_DissolveDefeat.create({ view: { x: 0, y: 0, w: 256, h: 160 }, params: { variant: 'dither', duration: 700 } });
function damage(unit, amount) {                       // your existing HP function: keep its body, add the lines marked +
  const wasAlive = unit.hp > 0;
  unit.hp = Math.max(0, unit.hp - amount);
  if (wasAlive && unit.hp === 0 && unit.leavesField) {  // + only units that disappear for good
    const r = spriteRectOf(unit);                     // + where the sprite is drawn now: {x, y, w, h}
    dd.defeat(unit.id, { rect: r, image: spriteImageOf(unit), flipX: unit.facingLeft });
  }
}
function drawUnit(unit) { if (unit.hp <= 0 && unit.leavesField) return; /* ...existing drawing... */ }   // + removed at once
function step(dt) { /* ...world... */ dd.update(dt); }      // every step, also while menus or banners show
function render() { /* background, units */ dd.draw(ctx); /* effects, banner, HUD */ }
// where a battle or level STARTS: dd.clear();
```

## What it guarantees

- The game removes the unit on the defeat frame; the picture lives in the module. Victory, wave-clear and turn logic run exactly as before: nothing waits unless you choose to (`await dd.defeat(...)` or `if (dd.busy()) return;` in code that keeps calling `update`).
- An effect always ends `flash + duration` ms of `update` time after `defeat()` (the flash variant uses at least 120 ms of flash). `busy()` then turns false.
- Everything it draws stays inside the unit's rect plus `spill` px, inside `view`, and off `uiRects()`: it never lands on a neighbour or the HUD.
- `?t=<ms>&freeze=1` style replays are exact when you call `update` from your fixed step: no wall clock, no randomness.
- Bad input never throws: missing rect, a `drawSprite` that throws or draws on the wrong context (empty snapshot: a small dust puff at the rect instead, with a warning), unreadable cross-origin images (falls back to the flash variant), `update()` without an argument (one 60 Hz step).
