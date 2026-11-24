# keyword-tooltips module (C-15) v1.2.1

`keyword-tooltips.js` is one plain script (no dependencies, ASCII only) that defines `window.GameDNA_KeywordTooltips`. It lays out
**rich text** whose keywords (status names, stats, rules) are coloured and dotted-underlined, and opens a **tooltip** for a keyword
on mouse hover, a touch long-press or tap, or keyboard focus. A keyword inside a tooltip opens a **nested** tooltip; tooltips can
be **pinned** so the pointer can travel into them. Placement keeps every tooltip inside the view and never over the word it
explains, prefers to stay off your HUD rects and characters, and every move is a glide or a crossfade (never a one-frame jump).

**How it draws.** Into your 2D context, in your coordinates (`view`), after everything else. On pixel canvases (`view.w <= 512`
or `render: 'pixel'`) it uses crisp bitmap fonts at an integer scale; on HD canvases smooth canvas text. Text grows on small
screens: the module measures the canvas's CSS size and keeps tooltip text at least `minCssPx` CSS px tall.

**Input.** Given `canvas`, it listens by itself (window, capture phase) and consumes only: presses on a keyword or a tooltip,
`Tab` / `Shift+Tab` while keywords are on screen, the pin key (`t`) and `Escape` while something of its own is open or focused, and
a touch tap outside while a tooltip is pinned. Every other key and press reaches your game unchanged. It never pauses the game.

## API

| call | |
|---|---|
| `GameDNA_KeywordTooltips.create(opts)` | `opts.canvas` (listeners, CSS scale), `opts.view` `{w, h}` or a function (the units your draw calls use), `opts.keywords` `{id: {title, kind, text, icon, color, image}}` (`text` may contain `[other-id]`; `icon` one of flame drop shield sword heart bolt leaf star skull clock eye coin chain spiral; `image` `{img, sx, sy, sw, sh}` draws your own icon), `opts.uiRects()` HUD boxes to keep clear if possible, `opts.avoid()` characters / selected unit to keep visible (stronger), `opts.params`, optional `onOpen(key, level, via)`, `onClose(key, level)`, `onPin(key, level, on)`, `opts.skin` (GameDNA_Skin) with `theme: 'skin'` |
| `setText(id, markup, {x, y, w, align, color, tone, font, scale, size, render, shadow})` | Declare a rich-text block (anywhere, e.g. in your step; kept until changed or `remove(id)`). Returns `{w, h, lines}`. `tone: 'dark'` darkens keyword colours for light panels. `font`: `'reg'` / `'small'` (bitmap), a CSS family (HD), or **your own font** `{measure(s), draw(ctx, s, x, y, color), h, lineH, space, pixel}` so keywords use the game's font |
| `drawText(ctx, id)` | Draw a declared block where it belongs (under your overlays). |
| `text(ctx, id, markup, x, y, opts)` | Both in one call from the render: lays out, registers the keywords for this frame, draws. |
| `mark(id, key, {x, y, w, h})` | A word or icon you drew yourself (status badge, stat label) becomes a keyword. Call every frame it is visible (render or step). |
| `update(stepMs)` | Every fixed step, every scene (also the `?t=` fast-forward). |
| `draw(ctx)` | Last in every render path, same transform as the text. Never changes game state. |
| `measure(markup, opts)` | `{w, h, lines}` without drawing. |
| `remove(id)`, `hide(id, hidden)`, `define(id, def)`, `keywords(map)`, `setParams(p)`, `params()` | housekeeping |
| `pointer(type, x, y, kind)`, `key(name, shift)` | Feed input yourself when there is no canvas (`type` move / down / up / leave / cancel, `kind` mouse / touch). Return true when used. |
| `anchors(level)`, `open(anchorIdOrKey, {pin})`, `openAt(key, rect, {pin})`, `pin()`, `close(level or 'all')`, `focusNext(dir)` | scripted control and tests |
| `state()`, `lastDrawn()`, `stats()`, `isOpen()`, `icon(ctx, name, x, y, size, color, pixel)`, `destroy()` | read-outs: open chain with rects and anchors, drawn rects (`panel`, `text`, `notch`, `pin`), counters (`coverAnchor`, `offView`, `fallback`, `unknown`, `errors`, `noUpdate`) |

`params`: `render` auto / pixel / hd; `theme` slate / night / parchment / skin; `delay` 180 ms (hover); `grace` 260 ms (pointer
crossing to a tooltip); `longPress` 420 ms; `depth` 3 (nesting levels); `maxW` 0 (auto width cap); `minCssPx` 10; `fontPx` 0 (auto);
`focusKey` `Tab`; `pinKey` `t`; `closeKey` `Escape`; `hints` on (key hints in keyboard-opened tooltips); `numbers` on (digits
highlighted); `notch` on; `tapOpens` on; `cursor` on (help cursor over keywords); `margin` 0 (auto).

## Behaviour

- Hover opens after `delay`; moving to another word of the same level switches after 100 ms; crossing other words on the way to an
  open tooltip switches nothing. An unpinned tooltip stays while the pointer is on its word, inside it, inside a child, or
  heading toward it; it fades out `grace` ms after that.
- Click (mouse) on a keyword pins its tooltip (click again closes); pinning a nested tooltip pins its parents. Click outside closes
  pinned tooltips. Hovering other words does not replace a pinned tooltip. Touch: tap or long-press (ring) opens pinned; a tap
  outside closes all and is consumed.
- Keyboard: `Tab` focuses the next keyword (inside the top pinned tooltip if there is one) and opens it with a hint line; the pin
  key pins it and steps inside (first nested keyword); `Escape` closes the top tooltip, then clears the focus.
- A keyword already open higher in the chain does not open again (its tooltip pulses). Unknown `[ids]` render as plain text.
- Placement (v1.2): every tooltip stays ATTACHED: it sits next to the word it explains (below, above, right or left) with the
  panel spanning the word's centre, so the notch touches the word; a tooltip never floats away from its word. Passes, in order:
  off the open chain and off the `avoid` rects (characters) at five widths (narrower = more lines); for a nested tooltip, STACK
  (it takes the place of its parent, or of more ancestors, attached to the visible word that opened the first hidden one; the
  hidden ones return when it closes; a row of its own above the title names the parent, '< BURN', and is never dropped); for a top-level tooltip, smaller text while it stays
  at least 0.8 x `minCssPx`; then the same allowing characters to be covered; then (top level only) covering the chain; then
  the larger band above or below the word, whole lines only. HUD rects are a soft cost throughout. A word that moves smoothly
  carries its tooltip rigidly; a word that jumps crossfades it.
- A click inside an unpinned tooltip pins it (a stacked child covers the word that opened it). When the focused word is hidden
  under its stacked tooltip, the focus ring goes around that tooltip's title.
- Key hints show only in an unpinned tooltip opened from the keyboard; pinning (also a parent pinned through its child) drops
  them and the tooltip keeps its spot on the word's side. Once placed, a tooltip keeps its spot while the word moves smoothly; if the word jumps (new text, a
  list scrolls by a page) the old tooltip fades out and a new one fades in.

## Integration (generic)

```js
const tips = GameDNA_KeywordTooltips.create({
  canvas, view: { w: GAME_W, h: GAME_H },
  keywords: { burn: { title: 'Burn', kind: 'Status', icon: 'flame', color: '#ff8a3a', text: 'Takes 2 damage at [turn-start].' },
              'turn-start': { title: 'Turn start', kind: 'Timing', icon: 'clock', text: 'When a side begins its turn.' } },
  uiRects: () => hudRects(),                       // boxes to keep clear if possible
  avoid: () => units.map(u => u.box()),            // what must stay visible
  params: { theme: 'slate' }
});
function step(dt) { tips.update(dt); /* ...the game's own step... */ }
function render() {
  drawWorld(); drawHud();
  tips.text(ctx, 'skill-desc', 'Deals 6. Applies 2 [burn].', 8, 150, { w: 180 });   // where the text belongs
  tips.mark('foe-burn', 'burn', burnIconRect);    // an icon the game drew
  tips.draw(ctx);                                  // last
}
```

Keep the game's own font for the words: `font: { pixel: true, h: 5, lineH: 8, space: 4, measure: s => myTextWidth(s), draw: (c, s, x, y, col) => myText(s, x, y, col) }` in the `text()` options.

## Self-check without a browser

- `update()` is called once per fixed step in the live loop AND in the `?t=` fast-forward; `draw()` is the last call of every
  render path (title, play, results, early returns).
- Every `[id]` in your texts and keyword texts exists in `keywords` (unknown ids show plain and count in `stats().unknown`).
- Keywords are text, not buttons: a press on a keyword is taken by the module. Do not put `[ids]` inside clickable menu labels;
  show a description line next to the menu instead.
- Your autopilot, `?t=&freeze=1` stills and key handlers still work: the module takes only Tab, the pin key and Escape (the last
  two only while it has something open), so check that your game does not use those keys, or change `focusKey` / `pinKey`.
- The `view` units match your draw calls (HD canvases drawn with a DPR transform: view = CSS size).
