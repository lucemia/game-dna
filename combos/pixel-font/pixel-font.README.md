# pixel-font.js (C-03 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_PixelFont`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the glyphs (three original 1-bit fonts), layout (alignment, wrap, fit), colour codes, shadows and outlines, the typewriter reveal and drawing. Your game keeps its own text strings and decides where text goes.

Fonts: `regular` 6×8 proportional (full printable ASCII, digits all 5 px wide so counters never jitter, 1 px descenders), `mono` (same glyphs, fixed 6 px advance), `small` 5×7 (full ASCII, 5 px caps, for dense HUDs). Extra glyphs: `…` `▼` `▶` `♥` `·`; anything else draws a box.

If `skin-api.js` (GameDNA_Skin) is loaded first, colours come from the skin (`options.skin`, default `pixel16`); without it the module uses the same pixel16 colours built in.

## API

`GameDNA_PixelFont.create(options)` returns an instance.

| option | meaning |
|---|---|
| `params` | Any of `font` 'regular' / 'mono' / 'small', `scale` 1 (whole numbers 1–8), `shadow` 'drop' / 'outline' / 'both' / 'none', `color` 'white' (a name, `#hex` or skin token), `cps` 40 (typewriter characters per second), `blipEvery` 2, `pause` 160 (extra ms after `. ! ? …`; half after `, ; :`), `lineHeight` 0 (= font default: 10 regular, 7 small), `clamp` 'on' (keep text inside the canvas), `face` 'bitmap' (or 'skin': use a non-pixel skin's own font). |
| `skin` | Skin id or object (optional; needs GameDNA_Skin). |
| `view` / `bounds` | Optional `{x, y, w, h}` in native px that text is kept inside. Default: the canvas, read through the current transform. |
| `onBlip(ch, index, id)` | Typewriter sound hook: at most once per `update`, every `blipEvery` visible letters. May be omitted. |
| `onDone(id)` | A typewriter reveal finished. May be omitted. |

| method | |
|---|---|
| `draw(ctx, str, x, y, opts)` → `{x, y, w, h}` | Draws at native resolution. `(x, y)` = top-left unless `opts.align` ('left' / 'center' / 'right') or `opts.baseline` ('top' / 'middle' / 'bottom' / 'alphabetic') say otherwise. `opts`: `font`, `scale`, `color`, `shadow`, `shadowColor`, `outlineColor`, `width` (wrap), `maxLines`, `fit` (max px: shrink to `small`, then cut with `…`), `lineHeight`, `letterSpacing`, `alpha`, `reveal` (characters shown), `cursor` (blinking ▼ after the text), `clamp`. Positions snap to whole pixels. |
| `measure(str, opts)` → px | Width exactly as `draw` would draw it (same opts). Use it wherever your game computed a text width. `size(str, opts)` → `{w, h, lines}`; `height(opts)`, `lineHeight(opts)`. |
| `wrap(str, width, opts)` → `[line]` | Greedy word wrap (honours `\n`, breaks over-long words); colour codes carry over to the next line. |
| `typewriter(id, str, opts)` → status | Starts a reveal. Call it where the text is **set** (inside the game step, so `?t=` replays see it) with `restart: true`. Without `restart`, calling it again with the same id, text and width does nothing (safe every frame); new text, or a line not drawn or touched for 300 ms, restarts it. `opts` as `draw` plus `cps`, `pause`, `blipEvery`, `onBlip`, `onDone`. Text is laid out (and wrapped) once at the start, so words never jump lines while typing. |
| `update(dtMs)` | Advances every reveal. Call once per game step with the step's ms (also in `?t=` replays), `0` while the game is paused. Reveal never uses wall time. |
| `drawTyped(ctx, id, x, y, opts)` → box | Draws the revealed part. `opts.text` starts the reveal if the id is new. `opts.cursor: true` shows the ▼ when done. |
| `skip(id)` → bool | Shows the whole text; returns `true` if it was already done (then your game advances as before). `done(id)`, `status(id)`, `remove(id)`, `clear()`. |
| `fillText(ctx, str, x, y, maxWidth?, opts?)` | Drop-in for `ctx.fillText`: reads `ctx.fillStyle`, `ctx.textAlign`, `ctx.textBaseline`, and the px size in `ctx.font` (≤ 7 px → `small`, else `regular`, scale = round(size / 9)). `measureText(str, ctx)` → `{width}`. |
| `setParams(obj)`, `lastDrawn()`, `glyphs(font)`, `color(code)` | Live params; boxes drawn since the last `update` (tests); glyph list; resolve a colour code. |

**Colour codes** inside any string: `{gold}` … `{/}` (or `{}`) back to the default colour. Names: white, dim, grey, gold, yellow, accent, title, red, green, blue, cyan, purple, orange, black; also `{#f80}`, `{#ffcc00}` and skin tokens such as `{text.accent}`. `{p300}` adds a 300 ms pause to a typewriter. `{{` prints `{`. An unknown `{word}` is printed as is.

## Integration (15 lines)

```js
// <script src="pixel-font.js"></script> before your game script
const PF = GameDNA_PixelFont.create({ params: { font: 'regular', shadow: 'drop', cps: 40 }, onBlip: () => playBlip && playBlip() });
// Keep your text helpers' names and signatures; only their bodies change, so every caller keeps working:
function drawText(str, x, y, color, align) { return PF.draw(ctx, str, x, y, { color, align }).w; }
function textWidth(str) { return PF.measure(str); }                      // every width calculation uses this
// Raw ctx.fillText calls: PF.fillText(ctx, str, x, y) uses the ctx's fillStyle, textAlign and textBaseline.
function showMessage(str) { message = str; PF.typewriter('msg', str, { width: 200, restart: true }); }   // where text is SET, in the step
function step() { /* ...existing game step... */ PF.update(1000 / 60); }   // the SAME step that ?t= replays call
function render() {
  /* world, sprites, HUD windows */
  PF.drawTyped(ctx, 'msg', 8, 150, { cursor: true });
}
function onConfirm() { if (!PF.skip('msg')) return; /* existing advance code */ }   // only if the game already has a confirm
```

## What it guarantees

- Every glyph pixel lands on a whole device pixel (positions snapped through the current transform, smoothing off while drawing, restored after). At any integer CSS or transform scale, text is as crisp as your sprites.
- Never throws from `draw`, `update`, `typewriter`, `drawTyped` or `fillText`; a callback that throws is caught. A call without numeric `x, y` draws nothing (one warning), never at 0,0 or the centre.
- With `clamp` on (default), a box that would leave the canvas is shifted back inside; nothing is cut off.
- Typewriter timing comes only from `update(dt)`: same steps, same reveal, so `?t=<ms>&freeze=1` screenshots are deterministic. If `drawTyped` runs but `update` never does, the text appears in full after ~45 draws with one warning (never stuck invisible).
- Calling `typewriter` every frame with the same text does not restart it.
- All outlines/shadows of a string are drawn before any fill, so a neighbour's outline never cuts a letter.
- The module never reads input and never touches `ctx.font`, `textAlign` or `fillStyle` state you rely on (it saves and restores `globalAlpha` and `imageSmoothingEnabled`).

## Things to re-check after switching fonts

The new glyphs are wider than a 3×5 font and narrower than most 8 px system fonts. Every place that placed text by a width must use `PF.measure`: right-aligned numbers, centred titles, menu columns, boxes sized around text, word-wrapped dialogue. Dense HUD rows: use `font: 'small'`, or `fit: <slot width>`.
