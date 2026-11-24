# Add webgl post-process pipeline and colour grading lut to my game

Add the 2 game elements below to MY existing game, which you have not seen. Each is a finished module file given with this prompt:

- `webgl-post.js` (one global, `GameDNA_Post`), API reference `webgl-post.README.md`
- `color-grade-lut.js` (one global, `GameDNA_ColorGrade`), API reference `color-grade-lut.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) WebGL post-process pipeline [effects], (2) Colour grading LUT [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **WebGL post-process pipeline:** the canvas element the game draws on (any size, any CSS scaling); render() once per drawn frame on every draw path (before or after the game's own drawing); a world clock in ms that can pause (optional); optional: HUD rects in canvas px (uiRects) or a shared uiMask input canvas: HUD pixels are never graded or colour-split; the places where HP/MP change (hit frame) (optional); optional: extra input canvases (depth map, light mask) for later passes.
- **Colour grading LUT:** I-08 webgl-post.js (GameDNA_Post), loaded first; the game's own I-08 instance is shared when it has one; the canvas element the game draws on; render() once per drawn frame on every draw path; a world clock in ms that can pause; where the player is: zone, phase or scene, to pick a look each step; optional: HUD and window rects in canvas px (uiRects) so the HUD stays ungraded.

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

## Element 2: Colour grading LUT (`color-grade-lut.js`, `GameDNA_ColorGrade`)

Grades the whole picture through a 3D colour lookup table on the I-08 WebGL post layer: one table per mood (neutral, dusk, night, memory, combat, toxic, all generated in code), blended over game time when the player changes zone, phase or scene, plus a vignette and fine film grain. The HUD stays exactly as drawn. **It requires I-08: `webgl-post.js` is shipped in this basket and must load before `color-grade-lut.js`.** If the game (or I-08 in this basket) already creates a `GameDNA_Post` instance, create it first; this module shares it and turns its built-in grade off (one grade, one vignette). Without WebGL, or with `?webgl=0`, nothing changes.

**Parameters chosen:** `preset` = neutral, `strength` = 1, `blend` = 900, `vignette` = 0.3, `grain` = 0.035, `builtin` = replace.

**Where it goes** (by role; find these places in my game):

1. *Page head, before the game script:* Load `webgl-post.js`, then `color-grade-lut.js`, both verbatim.
2. *Once, after the game canvas exists (and after the game's own `GameDNA_Post.create`, if any):* `grade = GameDNA_ColorGrade.create({canvas: <the game canvas>, clock: () => <frame counter> * <step ms>, params: {preset: 'neutral', strength: 1, blend: 900, vignette: 0.3, grain: 0.035, builtin: 'replace'}, uiRects: () => <HUD bars, open windows, menus and banner plates now, canvas px, {x, y, w, h, r?}>})`; for flat, saturated pixel art use `strength` 0.6-0.75. Mask only HUD drawn on its own backing plate; text drawn straight on the world (title text, name labels) stays unmasked.. Never a second `GameDNA_Post.create` for the same canvas.
3. *The fixed step, after state changes (zone, phase, scene):* `grade.to(<look for the current screen, zone or phase (not per turn or attacker)>, <600-1500 ms>)`, e.g. battle screen `combat`, enemy turn `night`, swamp `toxic`, flashback `memory`, evening `dusk`, otherwise `neutral`. Idempotent: calling it every step is fine.
4. *Where a new game, level or run STARTS:* `grade.set(<its look>)` (a cut, no fade from the previous screen).
5. *EVERY draw path (title, play, pause, result, and the single draw after the `?t=` fast-forward):* `grade.render()` once per drawn frame (it also renders I-08).

**Common mistakes** (symptom -> fix):

- Two overlays, or a game whose I-08 grade still shows -> the colour-grade module was created before the game's own `GameDNA_Post.create`; create I-08 first.
- The look pumps or keeps restarting its fade -> two looks are requested in the same frame (e.g. at a zone border, or from draw code); decide one look per step from state.
- HUD text tinted at night -> `uiRects` missing, in world coordinates, or missing the HUD's draw offset (I-08 v1.1+ also keeps its own grade and pulse off the HUD through the same mask).
- Ungraded boxes behind title text or battle labels -> those rects mask text with no plate behind it (a `soft` edge does not hide it); leave that text unmasked, give it a small backing box, or keep the title screen neutral. Never a full-width strip or whole-canvas rect with nothing behind it.
- Battle look flickers between two moods -> the look is picked per turn or attacker; pick it per screen or phase.
- Paths go orange (dusk) or grass neon (toxic) on bright pixel art -> lower `strength` to 0.6-0.75.
- Square halos around rounded HUD panels -> give exact panel rects with `r` = the panel corner radius, not padded rects.
- Double dark corners -> the game already draws its own vignette; set `vignette: 0` here or remove one.
- `?t=&freeze=1` frames differ between runs -> `clock` or `to()` uses wall-clock time; use the step counter.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [WebGL post-process pipeline] With WebGL: deeper shadows, a warm/cool tone and darker corners, the HUD still readable; a hit briefly splits the colours outward from the contact point.
- [WebGL post-process pipeline] With `?webgl=0`: the game looks and plays exactly as before; `?auto=1` ends the same with WebGL on and off.
- [Colour grading LUT] Each zone, phase or scene has its own mood (a night look keeps fires and lanterns orange) and switching fades smoothly over the chosen time.
- [Colour grading LUT] HUD bars, text and item icons look exactly as without the module; one soft vignette, fine grain.
- [Colour grading LUT] With `?webgl=0`: looks and plays exactly as before; `?auto=1` ends the same with WebGL on and off.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `webgl-post.js` sha256 `5834454b15435dbb...`, `color-grade-lut.js` sha256 `fb42cc45ddb99fe3...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [WebGL post-process pipeline] Every draw path ends with (or starts with) `post.render()`; `clock` is the step-counted game time.
- [WebGL post-process pipeline] Every damage site calls `post.pulse` once with a canvas-pixel point; walk `pulse(0.7)`: 3.5 px split at the edges, a quarter of it 130 ms later, gone at 260 ms.
- [Colour grading LUT] Load order `webgl-post.js` -> `color-grade-lut.js` -> game; exactly one `GameDNA_Post.create` for the canvas (the game's, or none).
- [Colour grading LUT] Every `to()` is in the fixed step with a preset name; walk `to('night', 1200)`: mix 0, 0.5 at 600 ms, 1 at 1200 ms; every draw path ends with `grade.render()`.
- [Colour grading LUT] For each screen, `uiRects` returns the rects of what is drawn there, in canvas px.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
