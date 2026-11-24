# Add Multi-layer parallax backdrop to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `parallax-layers.js` (one global, `GameDNA_Parallax`), API reference `parallax-layers.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Multi-layer parallax backdrop [foundations].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Multi-layer parallax backdrop:** a camera offset; a fixed 60 Hz update step; a draw slot between ground and units; rectangles of UI to keep clear (optional).

## Element 1: Multi-layer parallax backdrop (`parallax-layers.js`, `GameDNA_Parallax`)

Replaces the flat background with 3-6 generated pixel-art layers (dithered sky, clouds or a cave ceiling, far range, back range, trees / sea stacks / buildings, dark near foliage) that scroll at their own fraction of the camera, tile seamlessly and move by whole pixels, with small ambient motion (drifting clouds, twinkling stars, swaying grass, fireflies, glints, window lights). Themes forest, cliffs, cave, city; day, dusk or night. Static screens get a slow sway.

**Parameters chosen:** `theme` = forest, `time` = day, `layers` = 5, `depth` = 1, `vertical` = 0, `ambient` = 1, `drift` = 1, `horizon` = 0.5, `idle` = 0, `sway` = 0, `detail` = 1, `floor` = none. (`ground`: not used; your game keeps its own.)

**Where it goes** (by role; find these places in my game):

1. *Once, after the canvas size exists (before the first frame); then `bg.prebuild()`:* `bg = GameDNA_Parallax.create({view: {x: 0, y: 0, w: <field width>, h: <field height above the HUD>}, seed: 1, theme: 'forest', time: 'day', params: {layers: 5, depth: 1, vertical: 0, ambient: 1, drift: 1, sway: 0, floor: 'none', ground: <y where the ground tiles start> / <field height>}, getObstacles})`. `view` = the area the old background covered. `getObstacles()` -> living sprites' screen rects `{x, y, w, h}` (bright ambient pixels keep 3 px away), or `[]`.
2. *Your fixed update step (the one `?t=` fast-forward also runs), every scene:* `bg.update(1000 / 60)`. Never real time.
3. *The ONE call that paints the old background, on every screen that uses it (title, play, results):* Replace that call (keep the old background code) with `bg.draw(ctx, camX, camY)`: the camera position in world px, the same number the tiles subtract (`worldX - camX`), not negated; `0, 0` without a camera. First in the frame, outside any shake translate.
4. *Static screens with a painted ground (side-view battle):* Keep the game's ground band: give the module only the area above it (`view.h` = that horizon y, `ground: 1`) and draw the old image's band after `bg.draw` (`ctx.drawImage(old, 0, y0, w, h, 0, y0, w, h)`), choosing `y0` below any prop that stands on the old horizon; or use `floor: 'plain'` with `ground` = where the floor starts. Camera `0, 0`, `sway` 1-3.

**Common mistakes** (symptom -> fix):

- Backdrop covers tiles or sprites -> `draw` runs after them; call it first, where the old background was drawn.
- Far mountains move as fast as the ground -> the camera was negated or pre-multiplied; pass the camera number the tiles subtract.
- Stars, grass and clouds frozen or different in each `?t=&freeze=1` shot -> `update` sits in the render loop or uses real time; put it in the fixed step.
- Hitch on the first frame or level start -> call `prebuild()` at load (and after `setTheme`).
- Trees float above or sink into the ground tiles -> `ground` = top of the ground tiles / view height (180-px view, tiles at 148 -> 0.82).
- Title or result screen went black -> the old background was removed there; draw the backdrop there too.
- Screen edges flicker during shake -> draw the backdrop before the shake translate.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Multi-layer parallax backdrop] Behind the tiles: dithered sky, far range, a tree / cliff / building line and dark near foliage; no flat colour left; tiles, sprites and HUD on top; pits show the backdrop.
- [Multi-layer parallax backdrop] When the camera moves, near layers move faster than far ones, by whole pixels, with no seams or gaps; two `?t=&freeze=1` shots 1 s apart differ only in clouds, stars, grass or lights.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `parallax-layers.js` sha256 `cb2584ddeced327c...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Multi-layer parallax backdrop] The old background call is replaced on every screen that drew it, and its code is still there; `bg.draw` is the first paint of each frame with the tiles' camera numbers; worked example: camera 200 -> far layer moves 32 px (x0.16), mid 96 px (x0.48).
- [Multi-layer parallax backdrop] `bg.update` is in the fixed step that `?t=` fast-forward runs; `create` runs once; identifiers in `getObstacles` exist when first called.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
