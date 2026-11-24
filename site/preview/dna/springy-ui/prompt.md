# Add Springy UI motion to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `springy-ui.js` (one global, `GameDNA_SpringyUI`), API reference `springy-ui.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Springy UI motion [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Springy UI motion:** a fixed update step to advance the module clock (update(dt), also run by ?t= fast-forward); each window's existing draw code, with a stable id and its final rect in screen units; optional: the cursor index of each menu, rects of its rows, numbers worth rolling; optional: where game logic opens / closes a window (open(id) / close(id)) for exact mid-animation frozen frames.

## Element 1: Springy UI motion (`springy-ui.js`, `GameDNA_SpringyUI`)

The windows, menus, toasts and numbers the game already draws get motion: panels pop (or slide, or unfold on pixel canvases) open with a small overshoot and close faster, rows slide in one after another, the highlight or pointer glides between rows on a spring and the selected row lifts, numbers roll, a backdrop dim fades under modal windows. The game keeps drawing every window at its final rect and keeps all its menu logic; the integration only wraps draw calls. The module never reads or delays input and runs on its own step clock, so autoplay and frozen screenshots stay exact.

**Parameters chosen:** `open` = 260, `close` = 140, `bounce` = 0.12, `style` = auto, `stagger` = 30, `glide` = 140, `lift` = 2, `dim` = 0.35, `count` = 450, `reduced` = system.

**Where it goes** (by role; find these places in my game):

1. *Once, before the first render:* `ui = GameDNA_SpringyUI.create({view: {x: 0, y: 0, w: <screen width>, h: <screen height>}, params: {open: 260, close: 140, bounce: 0.12, style: 'auto', stagger: 30, glide: 140, lift: 2, dim: 0.35, count: 450, reduced: 'system'}})`. `view` is in the units the draw code uses (the logical size when the game scales with `setTransform`).
2. *The fixed update step (every scene; the step `?t=` fast-forward and `?auto=1` run):* `ui.update(<step ms>)` once per step. It returns nothing to wait for.
3. *Every place a window, menu, text box, popup or toast is drawn:* Wrap the existing draw code: `ui.window(ctx, <stable id>, <its real rect {x, y, w, h}>, () => { <existing draw> }, {selected: <cursor index>, dim: <true for modal menus only, not dialogue or HUD>})`. Windows open together need different ids; a full-screen dim drawn in the same function stays outside.
4. *Inside each list window:* Draw the highlight or pointer once, before the rows, at `ui.glide(<id>, <rect of the selected row>)`; wrap each row: `ui.row(ctx, <id>, k, () => { <existing row draw> }, rowRect)`. Target cursors over units: `ui.glide('target', <cursor rect>)`.
5. *Numbers on screen (gold, HP, MP, score):* Print `ui.count(<key>, value)` instead of `value`; the real value is never changed.
6. *Where game logic opens and closes windows:* `ui.open(<id>)` / `ui.close(<id>)` (optional: makes `?t=` frames exact mid-animation). Close the game state at once as before.
7. *The end of EVERY render path (title, play, results, early returns):* `ui.draw(ctx)` last: it plays windows that stopped being drawn.

**Common mistakes** (symptom -> fix):

- A confirm pressed while a window opens does nothing -> something ignores or queues input while the module animates; input must never wait for motion.
- A closed window still takes key presses for a moment -> game state was kept open until the animation ended; close it at once, the module animates a copy.
- Windows never animate -> `update` is not called in the fixed step, or the window id changes every frame.
- Windows vanish instead of closing -> `draw(ctx)` is missing on that render path.
- The whole screen zooms with a window -> the scene or a full-screen dim is inside the wrapped function.
- The highlight jumps or paints over the row above -> one `glide` key per window, drawn once before the rows.
- Blurry pixel windows while opening -> `style` forced to pop on a pixel canvas; keep `auto` or `unfold`.
- An HD or vector game's windows unfold (a clip that slices text) instead of popping -> smoothing was turned off for the whole canvas, so `auto` sees a pixel canvas; add `pixel: 'off'` to `params` when the art is not pixel art.
- A dark hole or stale pixels flash where a fixed panel unfolds -> the always-visible panel frame is inside `ui.window`; keep the fixed frame outside and wrap only the window that opens on it (or the panel's contents).
- Windows drawn by another module that animates its own (e.g. Bevelled window + pointer cursor bevelled windows) -> leave them unwrapped; wrap only the game's own windows.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Springy UI motion] A menu opens with a small overshoot, its rows sliding in one after another; it closes faster than it opened; modal windows fade a backdrop dim.
- [Springy UI motion] Moving the cursor: the highlight or pointer glides to the new row, which lifts slightly; numbers roll when they change.
- [Springy UI motion] Pressing confirm the instant a window appears does what it did before; `?auto=1` ends exactly as before; `?t=...&freeze=1` gives the same frame every run.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `springy-ui.js` sha256 `477d4f90a2f174be...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Springy UI motion] `ui.update` runs in the fixed step on every scene; `ui.draw(ctx)` is the last call of every render path.
- [Springy UI motion] Every window is wrapped once per render with its real rect and a stable id; no game logic or state change moved into a wrapped function; nothing reads `ui.state()` / `ui.debug()` to gate input.
- [Springy UI motion] Walk one open with the defaults: opaque by ~90 ms, overshoot to ~1.02 scale, settled at 260 ms; row k starts at k x 30 ms; a close takes 140 ms.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
