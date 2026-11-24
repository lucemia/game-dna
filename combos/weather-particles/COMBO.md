# Add weather & ambient particles to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `weather-particles.js` (one global, `GameDNA_Weather`), API reference `weather-particles.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Weather & ambient particles [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Weather & ambient particles:** a fixed 60 Hz update step; a camera offset; a draw slot between ground and units; optional: ground line per screen x (top of the ground under each column, null over pits) so rain splashes and leaves land on it; rectangles of UI to keep clear (optional).

## Element 1: Weather & ambient particles (`weather-particles.js`, `GameDNA_Weather`)

Seeded weather in three depth layers: rain that splashes on the game's own ground line, snow, dust motes, fireflies that glow at night, fluttering leaves. Far and mid layers are drawn behind the sprites, the near layer in front; a gusting wind pushes everything; `setWeather(kind, ms)` cross-fades; a particle budget caps the count; nothing is drawn over the UI rects. Same clock + camera = same frame.

**Parameters chosen:** `weather` = rain, `density` = 1, `intensity` = 0.5, `wind` = 0.4, `gust` = 0.35, `parallax` = 1, `front` = 0.25, `night` = 0, `shade` = 0, `fade` = 1500, `cap` = 180, `splash` = on, `uiMode` = hide.

**Where it goes** (by role; find these places in my game):

1. *Once, after the canvas size exists (never per frame or per level):* `wx = GameDNA_Weather.create({view: {x, y, w, h} (the play field, screen px), seed: 1, weather: 'rain', params: {density: 1, intensity: 0.5, wind: 0.4, gust: 0.35, front: 0.25, night: 0, shade: 0, cap: 180}, ground, uiRects})`. Side view: `ground = sx => <screen y of the ground top under screen x, null over a pit>`; top-down: leave `ground` out. `uiRects()` -> every HUD bar and open window in screen px (nulls allowed).
2. *Your fixed update step (the one `?t=` fast-forward also runs), every scene with weather:* `wx.update(1000 / 60)`. Never real time; skip it while paused.
3. *Right after the background, before tiles and sprites:* `wx.drawBack(ctx, camX, camY)`: the camera the tiles subtract, not negated; `0, 0` without one.
4. *After the last sprite or effect, before HUD and windows:* `wx.drawFront(ctx, camX, camY)`. One slot only (map drawn inside a translate): `wx.draw(ctx, camX, camY)` once after it, outside the translate.
5. *Where the area or story changes (optional):* `wx.setWeather('snow', 2000)` (or `'none'`); a new game or restart: `wx.setWeather(<start>, 0)`.

**Common mistakes** (symptom -> fix):

- Weather over the HUD or a dialog -> that rect is missing from `uiRects`, or `drawFront` runs after the HUD.
- Splashes float or sit inside the ground -> `ground` must take a SCREEN x and return a SCREEN y (`groundTop(sx + camX) - camY`).
- Splashes over pits -> return `null` for pit columns.
- Everything in front of the hero -> only `draw` after the sprites; split into `drawBack` before and `drawFront` after.
- Frozen or different in each `?t=&freeze=1` shot -> `update` is in the render loop or uses real time.
- Rain slides along with the hero -> camera not passed, or negated.
- Weather pops when the level changes -> instance re-created; keep one, use `setWeather`.
- Top-down drops all land on one line -> a `ground` was given; omit it.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Weather & ambient particles] Weather in two or more depths (far behind, near over the hero), slanting with the wind; rain splashes on the ground surface, none over pits; no particle within 1 px of the HUD or an open window.
- [Weather & ambient particles] Two `?t=&freeze=1` loads at the same t are identical; `?auto=1` ends as before.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `weather-particles.js` sha256 `8017b1361f6d2a0a...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Weather & ambient particles] `wx.update` is in the fixed step; `drawBack` after the background and before the first tile; `drawFront` after the last sprite and before the first HUD call; both with the tiles' camera.
- [Weather & ambient particles] `ground` worked example: camera 200, ground column 20 (world x 320-335) top at y 148 -> `ground(125)` = 148; pit -> `null`. Identifiers in `ground` / `uiRects` exist at the first draw.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
