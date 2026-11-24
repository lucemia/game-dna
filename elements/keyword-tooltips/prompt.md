# Add keyword tooltips to my game

Defaults: theme = {{theme}} (slate), hover delay = {{delay}} ms (180), nesting depth = {{depth}} (3), pin key = {{pinKey}} (t), key hints = {{hints}} (on).

Paste `keyword-tooltips.js` (global `GameDNA_KeywordTooltips`) verbatim into a `<script>` before the game script; do not edit it. Read its README first.

## Goal

Status, stat, terrain or rule words become keywords (coloured, dotted underline) whose tooltip opens on hover, touch long-press or tap, and Tab focus. Keywords inside a tooltip open nested ones; click, tap or the pin key pins. Tooltips stay on screen, never cover their word, and fade or glide.

## Steps

1. Read the whole game. Find the fixed step (used by the live loop AND any `?t=` fast-forward), every render path (title, play, results, early returns), the canvas and its native size, the game's text function and character width, the HUD boxes and the units on screen.
2. Create one instance after the canvas exists: `GameDNA_KeywordTooltips.create({ canvas, view: { w, h }, keywords, uiRects, avoid, params: { theme: '{{theme}}', delay: {{delay}}, depth: {{depth}}, pinKey: '{{pinKey}}', hints: '{{hints}}' } })`. `view` = the coordinate space of the draw calls (CSS size for a canvas drawn with a device-pixel transform); `uiRects()` = HUD boxes; `avoid()` = boxes of living units.
3. Write 6-12 keywords from the game's real rules (read the formulas): `{ title, kind, icon, color, text }`, one or two short sentences with real numbers, referencing other keywords as `[id]`. Every `[id]` must be defined.
4. Show rich text where the player needs it: a description line for the highlighted command or item, an info line for the tile or unit under the cursor. Use `tips.text(ctx, id, markup, x, y, { w, font })` in the render with the game's own font: `font: { pixel: true, h, lineH, space, measure: s => width, draw: (ctx, s, x, y, color) => existingTextFunction(...) }`. Make room without moving or hiding HUD text; never put `[ids]` in clickable menu labels.
5. Words or icons the game already draws (HP labels, status icons) become keywords with `tips.mark(id, key, { x, y, w, h })` every frame they are visible.
6. Call `tips.update(stepMs)` at the top of the fixed step and `tips.draw(ctx)` as the very last call of EVERY render path.
7. Keep every other caller working: autopilot (`?auto=1`), `?t=` / freeze stills, restart, key and pointer handlers. The module takes only presses on keywords and tooltips, Tab, the pin key and Escape (the last two only while a tooltip is open or focused). If the game uses one of those keys, pick another `focusKey` / `pinKey`.

## Self-check without a browser

- `update` is in the step shared by the live loop and the fast-forward; `draw` ends every render path, including early returns.
- Every `[id]` exists; texts match the game's numbers.
- No function was removed or renamed; every identifier used at load time is defined first.

## Acceptance checks

1. Hover a keyword: its tooltip opens on screen, not over the word; a keyword inside it opens a nested tooltip.
2. Click a keyword: a pin shows and the tooltip stays when the pointer leaves; click outside closes it.
3. Tab focuses keywords (focus ring, key hints); the pin key steps inside; Escape closes.
4. Touch: long-press opens a pinned tooltip; tap outside closes it.
5. `?auto=1` ends exactly as before with no errors; `?t=<ms>&freeze=1` stills still render.
