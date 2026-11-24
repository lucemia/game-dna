# Add bevelled window + pointer cursor to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `window-cursor.js` (one global, `GameDNA_WindowCursor`), API reference `window-cursor.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame).
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Bevelled window + pointer cursor [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Bevelled window + pointer cursor:** a fixed 60 Hz update step; the screen area windows must stay inside (native px); rectangles of UI to keep clear (optional); the host's own menu state: which menu is open, its items, which item is selected, which units are targeted.

## Element 1: Bevelled window + pointer cursor (`window-cursor.js`, `GameDNA_WindowCursor`)

Every plain menu and text box of the game is drawn by the module instead: bevelled gradient windows that grow from their centre when they open and shrink when they close, a pointing glove beside the selected row that bobs and slides between rows, grey disabled rows, gold right-aligned notes, a target pointer beside the unit being picked, word-wrapped messages with a "more" arrow, and auto-placed boxes that stay on screen and off sprites and HUD. The game keeps all its menu logic and only reports what is open and selected.

**Parameters chosen:** `open` = 6, `slide` = 50, `bob` = 200, `rowH` = 12, `type` = 0, `margin` = 2, `tint` = a, `pointer` = glove, `band` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once, at boot, after the canvas exists (before the first update and before any fast-forward for screenshots):* `wc = GameDNA_WindowCursor.create({view: {x: 0, y: 0, w: <native width>, h: <native height>}, getObstacles, params: {open: 6, slide: 50, bob: 200, rowH: 12, type: 0, margin: 2, tint: 'a', pointer: 'glove'}})`. `getObstacles()` returns, in SCREEN pixels after the camera offset, each visible sprite `{x, y, w, h, id}` and each HUD panel or banner `{x, y, w, h}` that a text box must not cover; it may use state that exists only later (it is first called by `update`), and always returns an array.
2. *Every place the game draws a menu (commands, spells, items, shop, yes/no, title options):* Replace the box, text and arrow drawing with `wc.menu(<id>, {x, y, w, h, items, selected, active, title})`: the OLD box's numeric `x, y, w, h` (numeric `x` and `y` keep it exactly there), `items` = labels or `{label, note, disabled}` built from the game's own list (`disabled` where the game refuses that choice; `note` = cost or count), `selected` = the game's cursor index. A parent menu stays visible with `active: false` while a sub-menu or target is chosen. Keep the game's menu state and input code unchanged.
3. *Every place the game draws a text box (dialogue, battle log, captions, end-of-game panels):* `wc.message(text, {id, more})`. Without `x`/`y` it sits at the bottom and moves to the top when an obstacle is there; or keep the old box with numeric `x, y, w, h`. Captions: `{id, fit: true, x: 'center', y: <old y>}`. Several lines: `\n`. `more: true` when the game has another page.
4. *Where the game picks a unit (target choice):* `wc.setCursor({id})` (an id from `getObstacles()`) or the unit's drawn rect, an array for "all"; `wc.setCursor(null)` when not picking. Remove the old target arrow.
5. *Closing:* Either call `menu`/`message` every frame while the window is visible (it closes by itself 3 steps after the calls stop), or call `wc.close(id)` where it goes away. Where the scene changes (battle -> map, game over, restart): `wc.clear()`.
6. *Your fixed update step (every scene: title, map, battle, pauses):* `wc.update(1000 / 60)` once per step.
7. *Your draw pass, on EVERY render path (including early returns for title or battle scenes):* `wc.draw(ctx)` last, after the HUD it replaces, outside any screen-shake translate.
8. *Tap / click handlers that hit-test menu rows:* Use `wc.itemAt(<id>, x, y)` (native px) instead of the old row maths, or pass that menu the old row pitch as `rowH`.

**Common mistakes** (symptom -> fix):

- A menu opens somewhere else than the old box -> it got only `x` or only `y` and was auto-placed off the HUD; pass both numbers.
- Menus or boxes never go away -> opened once, never closed; call `close(id)` or call `menu()` every visible frame.
- A battle message shrinks over the map after the fight -> `wc.clear()` where the scene changes.
- Windows stay as small boxes -> `update` is not called on that scene; call it every step everywhere.
- A screen with no windows at all -> `draw` is missing on a render path that returns early.
- Taps choose the wrong row -> the tap code still computes rows from the old layout; use `itemAt`.
- Dialogue covers the hero -> sprites missing from `getObstacles()`, or given in world instead of screen pixels.
- Two cursors on one row -> the old arrow drawing is still there.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Bevelled window + pointer cursor] Menus grow from their centre as bevelled windows in the old menu boxes; the glove bobs beside the selected row and slides when it moves; disabled rows are grey.
- [Bevelled window + pointer cursor] Target choice shows the glove beside the chosen unit, sliding between units; it disappears when the choice ends.
- [Bevelled window + pointer cursor] Messages wrap, never cover a sprite or the HUD, and close when the game moves on (and on scene changes).
- [Bevelled window + pointer cursor] Autoplay (`?auto=1` or the game's own) reaches the same end as before; `?t=...&freeze=1` shots show settled windows; taps on rows still work.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `window-cursor.js` sha256 `d30ceb94db004be8...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Bevelled window + pointer cursor] List every old box / menu / arrow draw call and what replaced it; none still draws.
- [Bevelled window + pointer cursor] Every window id has a `close` / `clear`, or is called every visible frame. Trace one menu (open -> move -> confirm -> closes) and one dialogue (line -> next -> end).
- [Bevelled window + pointer cursor] `wc.update` once per step on every scene; `wc.draw` on every render path, last.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
