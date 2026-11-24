# Add webgl post-process pipeline and normal-mapped sprite lighting to my game

Add the 2 game elements below to MY existing game, which you have not seen. Each is a finished module file given with this prompt:

- `webgl-post.js` (one global, `GameDNA_Post`), API reference `webgl-post.README.md`
- `normal-lighting.js` (one global, `GameDNA_NormalLight`), API reference `normal-lighting.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) WebGL post-process pipeline [effects], (2) Normal-mapped sprite lighting [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **WebGL post-process pipeline:** the canvas element the game draws on (any size, any CSS scaling); render() once per drawn frame on every draw path (before or after the game's own drawing); a world clock in ms that can pause (optional); optional: HUD rects in canvas px (uiRects) or a shared uiMask input canvas: HUD pixels are never graded or colour-split; the places where HP/MP change (hit frame) (optional); optional: extra input canvases (depth map, light mask) for later passes.
- **Normal-mapped sprite lighting:** I-08 webgl-post (GameDNA_Post) loaded first; the game's existing instance, or one the module creates; render() once per drawn frame on every draw path; a world clock in ms that can pause; the sprites' draw calls: drawSprite(img, map, ...) for bitmaps, shape(key, box, fn) around canvas-drawn sprites; optional: L-05 normal maps (nh2) or any normal map image; without one, 'derive' or plain drawing; a camera offset (optional).

## Element 1: WebGL post-process pipeline (`webgl-post.js`, `GameDNA_Post`)

The game keeps drawing on its 2D canvas exactly as now. The module lays a WebGL canvas exactly over it (same box, clicks pass through, device resolution), uploads each frame and runs shader passes: a filmic grade with warm/cool split toning and a vignette, and a chromatic hit-pulse that splits the colours outward from a hit and fades in game time. Later light and post elements add their own passes to the same instance. Without WebGL, or with `?webgl=0`, it does nothing and the game looks exactly as before.

**Parameters chosen:** `passes` = grade+pulse, `look` = filmic, `vignette` = 0.35, `chroma` = 5, `decay` = 260, `sample` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once, after the game canvas exists and before anything calls `post.clear()`:* `post = GameDNA_Post.create({canvas: <the game canvas>, clock: () => <frame counter> * <step ms>, uiRects: () => [<HUD rects, canvas px>], params: {passes: 'grade+pulse', look: 'filmic', vignette: 0.35, chroma: 5, decay: 260, sample: 'auto'}})`. Do not change the canvas size, its CSS, the context transform or smoothing.
2. *EVERY draw path (title, play, pause, result screens, and the single draw after the `?t=` fast-forward):* `post.render()` once per drawn frame. It may go first or last in the draw function: the post frame is taken at the end of the task.
3. *Every place a hit is ACCEPTED (on the step HP changes, once):* `post.pulse(<0.4 chip / 0.7 normal / 1.2 killing blow or critical>, {at: {x, y}})` with `at` in CANVAS pixels (subtract the camera from world positions).
4. *Where a level, battle or run STARTS (not on death or a life restart: it would wipe the killing-blow pulse):* `post.clear()`.

**Common mistakes** (symptom -> fix):

- A screen frozen on an old picture, or `post.stats().watchdog` climbing -> that draw path has no `post.render()`.
- HUD text fringed by the pulse or tinted by the grade -> `uiRects` missing or not in canvas px. Every light / post element in the basket shares one `uiMask` input: give them all the same rects.
- An ungraded (or unlit) box around HUD text -> a rect masks text that has no panel behind it. Mask the panel, not the text: leave plate-less text unmasked or give it a backing box (a `soft` rect still shows as a patch).
- A `?t=&freeze=1` screenshot without the grade -> the single draw after the fast-forward does not reach `post.render()`.
- The pulse spreads from the wrong place on scrolling levels -> `at` was in world coordinates.
- Freeze frames differ between runs -> `clock` reads wall-clock time; use the step counter.
- The game ends differently with `?webgl=0` -> game logic must never read `post.active` or the overlay.

## Element 2: Normal-mapped sprite lighting (`normal-lighting.js`, `GameDNA_NormalLight`)

Sprites catch the light on the I-08 WebGL post layer: every sprite drawn through the module writes its normals (an L-05 / any normal map, or derived from the drawn shape), and one pass relights only those pixels from a key light, lamps, hit flashes and J-01 lights, with glints and a rim light. Faces turned to the viewer keep their drawn colour. **It requires I-08: `webgl-post.js` is shipped in this basket and must load before `normal-lighting.js`.** If the game (or another basket element) already creates a `GameDNA_Post` instance, create it first and pass it as `post`. Without WebGL, or with `?webgl=0`, every sprite draws exactly as before.

**Parameters chosen:** `preset` = daylight, `strength` = 1.4, `key` = 0.6, `keyAngle` = 225, `keyHeight` = 0.35, `warmth` = 0.6, `rim` = 0.7, `bevel` = 8.

**Where it goes** (by role; find these places in my game):

1. *Page head, before the game script:* Load `webgl-post.js`, then `normal-lighting.js`, both verbatim.
2. *Once, after the game canvas exists (and after the game's own `GameDNA_Post.create`, if any):* `nl = GameDNA_NormalLight.create({canvas: <the game canvas>, post: <existing post, if any>, clock: () => <frame counter> * <step ms>, camera: () => ({x: <camera x>, y: <camera y>}), params: {preset: 'daylight', strength: 1.4, key: 0.6, keyAngle: 225, keyHeight: 0.35, warmth: 0.6, rim: 0.7, bevel: 8}})`; preset `daylight` for a game without lamps or darkness, `dusk` / `night` (pass only `preset`) with lamps, torches or J-01 darkness. A scaled (devicePixelRatio) backing store: add `view: {w, h}`.
3. *Where each SPRITE is drawn (characters, enemies, NPCs, props, pickups, trees, rocks), inside the camera transform and the sort order:* Bitmap: `nl.drawSprite(img, normalMap | 'derive', ...same drawImage args)`. Canvas-drawn: wrap the existing call, `nl.shape(null, {x, y, w, h} around the sprite in the current drawing coordinates, () => drawIt())`; unchanging things (trees, rocks, crates, coins) get a string key such as `'tree' + col + ',' + row` so they are derived once. Never ground, sky, backgrounds, HUD or a whole-world draw.
4. *Level / run START:* `nl.clear()`, then `nl.add({id, x, y, radius, color, flicker})` per lamp or torch (world units); `follow: actor` for carried lights.
5. *Where a hit, spell or explosion is ACCEPTED (once):* `nl.flash({x, y, radius: 110, color: '#ffd28a', ms: 260})` at the world point.
6. *EVERY draw path (title, play, pause, result, early returns, and the single draw after the `?t=` fast-forward):* `nl.render()` as the last line.

**Common mistakes** (symptom -> fix):

- Nothing changes -> `nl.render()` missing on that draw path, or the sprites are still drawn with plain `drawImage` / not wrapped.
- A sprite is lit only in a rectangle -> its `shape` box is too small or in other coordinates; box the whole sprite in the coordinates active at the call (inside the camera transform).
- Ground or background has pillow edges -> it was wrapped; sprites only.
- Frame time climbs -> many static shapes derive every frame; give unchanging things a string key (never key an animated actor).
- Lights slide with the camera -> `camera` missing or not the offset the draw subtracts.
- Frozen `?t=&freeze=1` frames are flat -> the draw after the fast-forward skips `nl.render()` or an early return skips it.
- A blur of flashes -> `flash` inside a per-frame overlap loop; once per accepted event.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [WebGL post-process pipeline] With WebGL: deeper shadows, a warm/cool tone and darker corners, the HUD still readable; a hit briefly splits the colours outward from the contact point.
- [WebGL post-process pipeline] With `?webgl=0`: the game looks and plays exactly as before; `?auto=1` ends the same with WebGL on and off.
- [Normal-mapped sprite lighting] At 1x, wrapped sprites look rounded: warm and brighter toward the key (up-left) and lamps, cool and darker away, about as bright and saturated overall as before; ground, sky and HUD unchanged.
- [Normal-mapped sprite lighting] A hit flashes light on nearby sprites, fading within a third of a second; sprites facing left are lit from the same side as sprites facing right.
- [Normal-mapped sprite lighting] With `?webgl=0`: looks and plays exactly as before; `?auto=1` ends the same with WebGL on and off.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `webgl-post.js` sha256 `5834454b15435dbb...`, `normal-lighting.js` sha256 `abcec12533a8a7a7...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [WebGL post-process pipeline] Every draw path ends with (or starts with) `post.render()`; `clock` is the step-counted game time.
- [WebGL post-process pipeline] Every damage site calls `post.pulse` once with a canvas-pixel point; walk `pulse(0.7)`: 3.5 px split at the edges, a quarter of it 130 ms later, gone at 260 ms.
- [Normal-mapped sprite lighting] Load order `webgl-post.js` -> `normal-lighting.js` -> game; exactly one `GameDNA_Post.create` for the canvas.
- [Normal-mapped sprite lighting] Every draw path ends with `nl.render()`; `clock` is the step counter; `flash` sits at one-off events; every `begin` has its `end` (prefer `shape`).
- [Normal-mapped sprite lighting] Walk one pixel at the defaults: key L.xy = (-0.66, -0.66); a flat pixel is unchanged; an edge facing up-left n.xy = (-0.7, -0.7) gets x 1.54 and warmer, the edge facing down-right x 0.46 and cooler (mean 1.0).
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
