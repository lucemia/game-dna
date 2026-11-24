# Add native resolution + integer scaling to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `pixel-scaler.js` (one global, `GameDNA_PixelScaler`), API reference `pixel-scaler.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution; how that canvas is scaled to the screen is set by the pixel scaler element below. Call module draw functions on my native 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame).
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Native resolution + integer scaling [foundations].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Native resolution + integer scaling:** the canvas element the game draws on and its native size (width/height attributes); every pointer/touch -> game coordinate mapping in the game (kept when it uses the canvas rect ratio, else replaced by toGame).

## Element 1: Native resolution + integer scaling (`pixel-scaler.js`, `GameDNA_PixelScaler`)

The game keeps drawing on its small native canvas; the module shows that canvas at the largest whole number of device pixels per game pixel that fits (on any devicePixelRatio), centred in a themed border on the same pixel grid, so every game pixel is a crisp square. `toGame()` maps taps and clicks back to game pixels. Optional: a fit step for small phones, a CRT/scanline overlay, a fullscreen button in the border. No loop, no timer, no change to game logic or timing.

**Parameters chosen:** `mode` = integer, `border` = frame, `color` = ink, `pad` = 4, `crt` = off, `scanlines` = 0.3, `fill` = auto, `align` = center, `maxScale` = 0, `button` = corner, `key` = off.

**Where it goes** (by role; find these places in my game):

1. *The canvas the game draws on (the one the CSS stretches):* Note its element and its `width`/`height` attributes (the native size, e.g. 256x224). Never change them, the context transform or `imageSmoothingEnabled`.
2. *Once, after the canvas is in the page (below the game script):* `scaler = GameDNA_PixelScaler.create({canvas, native: {w, h}, params: {mode: 'integer', border: 'frame', color: 'ink', pad: 4, crt: 'off', scanlines: 0.3, fill: 'auto', align: 'center', maxScale: 0, button: 'corner', key: 'off'}}); scaler.apply();`. The module wraps the canvas in one `div` and overrides the stretching CSS with inline `!important` styles; leave the CSS rules, delete only a JS resize handler's write to `canvas.style.width/height`.
3. *Every pointer, mouse and touch handler that turns a client position into game coordinates (grep clientX, offsetX, pageX, touches, getBoundingClientRect):* Keep a mapping that computes `(clientX - rect.left) * W / rect.width` from the canvas's own `getBoundingClientRect()` (it stays exact). Replace any other (offsetX, a fixed or stored scale, window size) with `const p = scaler.toGame(e)`; use `p.x`, `p.y` in native pixels; handlers on window/document ignore `!p.inside`.
4. *Other elements that draw DOM over the canvas (if any):* Position them with `scaler.fromGame(x, y)` or inside the canvas; re-place them in `onLayout`.

**Common mistakes** (symptom -> fix):

- Unsure whether "keep native resolution and integer scaling as they are" forbids this -> it does not: this element IS the scaling; it replaces only the CSS stretch and keeps the native canvas size.
- Pixels still blurry or 1-2 px uneven -> another style keeps resizing the canvas (a JS resize handler or a transform on a parent); delete that write; `scale().fought` counts the fights.
- Taps land a few tiles off -> a handler maps with offsetX or a stored scale; use `scaler.toGame(e)`.
- Game tiny on a 500 px window -> the whole-number scale is 1 there; `mode: 'fit'` allows a non-integer step on phone-sized windows only.
- Help text below the game disappears -> `fill: 'page'` keeps it on screen (`auto` drops it only when it would cost a whole scale step).
- A key stopped working in the game -> `key` is set to a key the game uses; set it to `off`.
- Nothing changes on screen -> `apply()` never ran, or ran before the canvas existed.
- Canvas cleared or reset after integration -> something now writes `canvas.width`; remove it (the module never does).

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Native resolution + integer scaling] At 1280x900 and 500 px wide, every game pixel is an exact n x n device-pixel square (no blur, no 1/2 px mix) and the game is centred with an even border; no sideways scroll.
- [Native resolution + integer scaling] A click or tap on a tile, button or menu item selects that exact one; a tap in the border does nothing.
- [Native resolution + integer scaling] `?auto=1` reaches the same end as before; `?t=&freeze=1` shows the same frame, now crisp.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `pixel-scaler.js` sha256 `75d6c9410b87da88...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Native resolution + integer scaling] Diff: only additions (plus at most one deleted style write); no write to `canvas.width/height`, `setTransform`, `ctx.scale`, loops, timers or URL parameters.
- [Native resolution + integer scaling] List every pointer mapping: "kept (rect ratio)" or "now toGame".
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
