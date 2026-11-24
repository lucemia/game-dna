# Bevelled windows and a pointer cursor for my game

Defaults (change before pasting):
`{{open}}` = 6 · `{{slide}}` = 50 · `{{bob}}` = 200 · `{{rowH}}` = 12 · `{{type}}` = 0 · `{{margin}}` = 2 · `{{tint}}` = a · `{{pointer}}` = glove

---

You are given `window-cursor.js`, a finished module, and its `README.md` (API). **Include it verbatim** (`<script src>` before the game script, or pasted unchanged in its own `<script>`). Never rewrite or "fix" it. One global, `GameDNA_WindowCursor`; it reads no input and changes no game state.

Goal: the module draws every plain text box and menu of my game. My game keeps ALL its menu logic; it only reports what is open and selected.

**Integration points** (find where my game plays each role):

1. **Create once** the screen size exists:
   `wc = GameDNA_WindowCursor.create({ view: {x: 0, y: 0, w, h}, getObstacles, params: { open: {{open}}, slide: {{slide}}, bob: {{bob}}, rowH: {{rowH}}, type: {{type}}, margin: {{margin}}, tint: '{{tint}}', pointer: '{{pointer}}' } })`.
   `view` = native screen size. `getObstacles()` returns screen rects (after camera offset) of sprites (with their `id`) and HUD panels that text boxes must not cover.
2. **Each menu**: where my game draws it now, call `wc.menu(id, {x, y, w, h, items, selected, active})` with the old box's `x, y, w, h` (numeric `x`, `y` keep it there), `items` = labels or `{label, note, disabled}` (`disabled` where my game refuses the choice), `selected` = my cursor index. While a sub-menu or a target is being chosen, keep the parent menu visible with `active: false`.
3. **Each text box**: `wc.message(text, {id, more})`. Without `x`/`y` it sits at the bottom, or at the top when an obstacle is in the way. Or keep the old box with numeric `x, y, w, h`. Captions: `{fit: true, x: 'center', y: <old y>}`.
4. **Target choice**: `wc.setCursor({id})` or `wc.setCursor(rect)` while my game picks a unit (an array for "all"), `wc.setCursor(null)` otherwise. Remove my old target arrow.
5. **Closing**: either call `menu`/`message` every frame while the window should show (it closes by itself 3 steps after you stop), or call `wc.close(id)` when it goes away. On restart or scene change: `wc.clear()`.
6. **Clock and draw**: `wc.update(1000 / 60)` once per fixed step (title and pauses too); `wc.draw(ctx)` last in the render, outside any screen-shake.

Delete only the old box, text and arrow drawing. **Find and keep every caller**: autoplay (`?auto=1` or similar) still finishes the game; `?t=...&freeze=1` screenshots, shortcuts, restart, title and tap handlers still work. A tap handler that computed rows from the old layout uses `wc.itemAt(id, x, y)` (or `rowH` = the old row height).

**Self-check without a browser**
- The module file is byte-identical to the one given and loaded before first use.
- Every old box/menu/arrow draw call is replaced; none still draws a duplicate.
- Identifiers inside `getObstacles` exist before the first `wc.update`; it returns an array.
- Every window has a `close` or is called every visible frame. Trace one menu (open → move → confirm → closes) and one dialogue (line → next → end).
- `update` once per step, `draw` once per frame, last. No host function removed or renamed.

**Acceptance checks** (screenshots if you can)
1. Menus grow from their centre as bevelled windows; the glove bobs beside the selected row and slides when it moves; disabled rows are grey.
2. Target choice: pointer beside the chosen unit, sliding between units.
3. Messages wrap, never cover a sprite or the HUD, and close when my game moves on.
4. `?auto=1` (or my autoplay) reaches the same end as before, no console errors.
