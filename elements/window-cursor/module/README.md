# window-cursor.js (C-01 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_WindowCursor`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the look and motion of text boxes and menus: bevelled gradient windows that grow from their centre when they open and shrink when they close, a pointing glove beside the selected row that bobs and slides between rows, greyed disabled rows, a target pointer beside units, word-wrapped messages, and placement that keeps windows on screen and off the rectangles you give it. Your game keeps all menu logic (which menu is open, what is selected, what a choice does) and tells the module what to show.

Skin rules it follows (v1.1): window grow / shrink uses the skin's `motion.ease.open` or `.pop` (e.g. `outBack` overshoots; `snap` / `linear` = plain linear) and steps at `motion.stepMs` when that is longer than a 60 Hz frame; canvas-font skins re-measure every window after `document.fonts.ready`; titles use the skin's `fonts.title` and notes `fonts.small` when present (else `ui`); the selected-row band is `frame(…, {role: 'row'})`; a skin hand reserves `layout.pointerGap` (default 5) before the label; `skin: false` forces the built-in look; with a smooth skin (`pixel: false`) `pointer` defaults to `'skin'`, the ▼ is drawn with the skin's text and image smoothing is left as the host set it; the opaque under-fill between overlapping windows is skipped for smooth or rounded skins (`layout.backing: 'frame' | 'none'` overrides).

Looks: with `skin-api.js` and a skin loaded first, it draws through `GameDNA_Skin.resolve(options.skin)`; without them it uses its own copy of the `pixel16` look (5x7 bitmap font with punctuation, blue bevelled windows). Text is drawn upper-case in that font.

## API

`GameDNA_WindowCursor.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | Screen area `{x, y, w, h}` in native pixels that every window stays inside. Default: the canvas size at the first `draw`. Pass it when your canvas backing store is not the native size (HiDPI, CSS-scaled transform). |
| `getObstacles()` | Returns rects `{x, y, w, h, id?}` that auto-placed windows must not cover: sprites (give them an `id`), HUD panels, banners. Called once per `update`. May return `[]`. |
| `skin` | Skin id or object (only used when `skin-api.js` is loaded). |
| `params` | Any of `open` 6 (frames to grow / shrink, 0 = instant), `slide` 50 (ms the cursor takes between rows), `bob` 200 (ms per bob step), `rowH` 12 (px per row), `type` 0 (typewriter chars/s, 0 = whole text at once), `margin` 2 (px kept from avoided rects), `tint` `'a'` (window colour: `a` blue, `n` slate, `b` red), `pointer` `'glove'` (`'skin'` = the skin's own hand, sized from `skin.layout.handW/handH`, default 7x5; smooth skins animate it themselves from `t`), `band` `'auto'` (selected-row highlight: `'auto'` = on for skins with `layout.rowBand: true` or smooth skins with `palette.ui.select`, off for pixel16; `'on'`, `'off'`; per menu `band: true/false`). |
| `debug(e)` | Optional: receives `open`, `opened`, `close`, `closed`, `place` and `warn` events. |

| method | |
|---|---|
| `menu(id, {x, y, w, h, items, selected, title, active, cursor, rowH, tint, avoid, near, side})` | Opens the window `id`, or updates it if it is already open (no new animation). `items`: strings or `{label, note, disabled}` (`note` is right-aligned, e.g. MP cost or `x3`). `selected`: row index, or `null` for no cursor. `active: false` freezes and dims the cursor (a parent menu while a sub-menu or target is chosen). `cursor: false` hides it. `w`/`h` are minimums; the window grows to fit its rows. Returns the window rect. |
| `message(text, {id, x, y, w, rows, title, more, fit, align, near, side, avoid})` | A text box, word-wrapped to its width; `\n` breaks a line. `id` defaults to `'message'`. `more: true` adds a bobbing ▼. `fit: true` sizes the box to one line of text (captions). `rows` keeps a fixed height. `message(null)` or `''` closes it. |
| `close(id)` | Shrinks the window to its centre, then removes it. `close()` closes all. |
| `select(id, index)` | Moves the cursor (slides) without re-sending the items. |
| `setCursor(target, {side})` | Target pointer beside a unit: `target` is a rect `{x, y, w, h, id?}`, `{id}` (looked up in `getObstacles()`), an array of them (all highlighted), or `null` to hide it. `side`: `'auto'` (left of the unit, pointing right, unless that is off screen or on another sprite or window), `'left'`, `'right'`. Pass the unit's rect where it is drawn, or its id, every frame if it moves. |
| `update(dtMs)` | Call once per fixed step with the step length (16.67). All animation runs on it. |
| `draw(ctx, ox = 0, oy = 0)` | Draws every window, then the pointer, at native resolution. Call it last in your render (after sprites, effects and HUD it replaces), outside any screen-shake translate. Never throws. |
| `itemAt(id, x, y)` | Row index under a native-pixel point, or `-1`: use it for taps and clicks on rows. |
| `place(w, h, {x, y}, {alts, avoid})` | The placement helper on its own: a rect on screen and off the obstacles, as close as possible to `{x, y}`. |
| `isOpen(id)`, `isSettled(id)`, `typing(id)`, `finish(id)`, `rect(id)`, `rects()`, `ids()`, `clear()`, `setParams(obj)`, `setView(rect)`, `lastDrawn()` | `rects()` gives every window's rect (for other overlays to avoid). `typing` / `finish` for the typewriter. `clear()` removes everything at once (restart). `lastDrawn()` returns what the last `draw` put on screen (tests). |

**Where a window goes.** A window given numeric `x` **and** `y` stays exactly there (only kept on screen); use this when it replaces a box your game already draws at fixed coordinates. Every other window avoids `getObstacles()` and the module's other windows: `message()` without `x`/`y` sits at the bottom (8 px margins) and flips to the top when the bottom is taken; `x: 'center'`, `y: 'top' | 'bottom' | 'center'` work too; `near: rect, side: 'above' | 'below' | 'left' | 'right'` puts it beside a unit (speech bubble). `avoid: true | false` overrides.

**Two ways to call it, both fine.** (a) Every frame (from your update or your render), call `menu`/`message` for each window that should be visible now: a window that stops being called closes by itself after 3 steps. (b) Call `menu`/`message` when it opens or changes and `close(id)` when it goes away. Pick one per window; with (b), `close` is required.

## Integration (15 lines)

```js
// <script src="window-cursor.js"></script> before your game script
const wc = GameDNA_WindowCursor.create({
  view: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H },
  getObstacles: () => actors.map(a => ({ x: a.x, y: a.y, w: a.w, h: a.h, id: a.id })).concat([hudRect]),
  params: { open: 6, slide: 50 }
});
function step() {                                   // your fixed 60 Hz step: keep your own menu logic as it is
  /* ... existing input + menu state code ... */
  if (menuOpen) wc.menu('cmd', { x: 8, y: 150, items: commands.map(c => ({ label: c.name, disabled: !c.usable })), selected: cursorIndex });
  else wc.close('cmd');
  wc.setCursor(choosingTarget ? { id: targets[targetIndex].id } : null);
  if (dialogLine) wc.message(dialogLine, { more: true }); else wc.close('message');
  wc.update(1000 / 60);
}
function render() { /* world, sprites, effects, HUD */ wc.draw(ctx); }
// restart / new game: wc.clear();   taps on rows: const i = wc.itemAt('cmd', px, py);
```

## Keep your game working

- **Keep every caller.** Your autoplay / AI, `?t=&freeze=1` style test hooks, keyboard shortcuts, tap handlers, restart and title screens must work exactly as before. The module reads no input and changes no game state.
- **Replace drawing only.** Delete only the lines that drew the old box, text and arrow; keep the state they read. If a tap handler computed rows from the old layout, use `wc.itemAt(id, x, y)` (or set `rowH` to the old row height).
- **Scene changes.** When your game swaps scenes (battle → map, map → title), call `wc.clear()` (or `close` the old ids) right there, so a battle box does not shrink over the map.
- **Fast-forward start.** If your game runs many steps and then draws once (screenshots), call `menu`/`message` from the step, or from the render: both show the settled window in that single frame.

## Self-check without a browser

1. The module file is byte-identical to the one given; it is loaded before the first use of `GameDNA_WindowCursor`.
2. Every identifier inside `getObstacles` exists when `update` first runs; it returns an array.
3. Every window you open has a matching `close(id)` (way b) or is called every frame while visible (way a). Trace one menu: open → move → confirm → it closes.
4. `wc.update(...)` is called exactly once per fixed step, also during pauses and title screens; `wc.draw(ctx)` once per rendered frame, last.
5. No host function was removed or renamed; the autoplay path still reaches the end of the game.
