# Add WebGL post-process pipeline and Bloom & glow to my game

Add the 2 game elements below to MY existing game, which you have not seen. Each is a finished module file given with this prompt:

- `webgl-post.js` (one global, `GameDNA_Post`), API reference `webgl-post.README.md`
- `bloom-glow.js` (one global, `GameDNA_Bloom`), API reference `bloom-glow.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) WebGL post-process pipeline [effects], (2) Bloom & glow [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **WebGL post-process pipeline:** the canvas element the game draws on (any size, any CSS scaling); render() once per drawn frame on every draw path (before or after the game's own drawing); a world clock in ms that can pause (optional); optional: HUD rects in canvas px (uiRects) or a shared uiMask input canvas: HUD pixels are never graded or colour-split; the places where HP/MP change (hit frame) (optional); optional: extra input canvases (depth map, light mask) for later passes.
- **Bloom & glow:** WebGL post-process pipeline webgl-post (GameDNA_Post) loaded first; the game's existing instance, or one the module creates; render() once per drawn frame on every draw path; a world clock in ms that can pause (optional); optional: HUD rects in canvas px (uiRects) or a uiMask canvas; optional: per-frame emissive drawing of what should glow, at on-screen positions; the places where HP/MP change (hit frame) (optional).

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

## Element 2: Bloom & glow (`bloom-glow.js`, `GameDNA_Bloom`)

Bright areas bleed soft light on the WebGL post-process pipeline WebGL post layer: pixels above a soft-kneed brightness threshold, plus everything the game redraws each frame into an emissive layer (only what should glow: spells, projectiles, lanterns, crystals, coins, a selected button), are blurred at 1/2 to 1/16 resolution and added back, tinted. Big hits can flash the bloom from their contact point. HUD rects never glow and are never washed. **It requires WebGL post-process pipeline: `webgl-post.js` is shipped in this basket and must load before `bloom-glow.js`.** If the game (or WebGL post-process pipeline in this basket) already creates a `GameDNA_Post` instance, create it first and pass it as `post`. Without WebGL, or with `?webgl=0`, nothing changes.

**Parameters chosen:** `source` = emissive, `threshold` = 0.78, `knee` = 0.5, `intensity` = 1.6, `radius` = 0.75, `tint` = #fff1dc, `blend` = add, `emissiveGain` = 1.2.

**Where it goes** (by role; find these places in my game):

1. *Page head, before the game script:* Load `webgl-post.js`, then `bloom-glow.js`, both verbatim.
2. *Once, after the game canvas exists (and after the game's own `GameDNA_Post.create`, if any):* `post = GameDNA_Post.create({canvas: <the game canvas>, clock: () => <frame counter> * <step ms>, params: {passes: 'none'}})` unless the game or another basket element already made one; then `bloom = GameDNA_Bloom.create({post, clock: <same>, params: {source: 'emissive', threshold: 0.78, knee: 0.5, intensity: 1.6, radius: 0.75, tint: '#fff1dc', blend: 'add', emissiveGain: 1.2}, uiRects: () => <HUD bars, windows, menus and banners drawn now, canvas px; {.., glow: true} for UI that should glow>})`. If the game draws with a scale, add `view: {w, h}` and give rects in those units.
3. *EVERY draw path (title, play, pause, result, and the single draw after the `?t=` fast-forward):* `const e = bloom.emissive()` (cleared once per frame), then mark what glows at its on-screen position (camera subtracted): pickups, units and heal/buff targets get only a `bloom.glow(x, y, r, color, 0.3-0.5)` halo (never the whole sprite redrawn: it turns into a pale blob); only self-lit parts (flame, projectile core, crystal, eye, spell particles) are redrawn with `e.drawImage` / `e.fillRect`; then `bloom.render()`. It may run before or after the game's own drawing (the post frame is taken at the end of the task).
4. *Where a heavy hit, critical or kill is ACCEPTED (once):* `bloom.flare(<0.6 heavy / 1.2 finisher or kill>, {at: {x, y}})`, `at` in on-screen units.
5. *Where a level, battle, life or run STARTS:* `bloom.clear()`.

**Common mistakes** (symptom -> fix):

- The whole sky, white clouds or white HUD text glow -> luminance bloom on a bright scene; use `source: 'emissive'`, `blend: 'screen'`, intensity 1.0-1.1, radius 0.6, halos alpha 0.5-0.6.
- A lighter or un-bloomed box behind a title or a floating label -> a tight `uiRect` around text drawn with no backing plate; leave plate-less text out of `uiRects` (or draw it a backing box), never one full-canvas or full-width rect.
- Coins or a healed hero turn into pale discs or coloured blobs -> the whole sprite was redrawn into the emissive layer; give it only a `glow()` halo at alpha 0.3-0.5.
- HUD panels washed or a dark rectangle in the world -> `uiRects` missing or in the wrong units (a 2x backing store needs `view`), or a rect left over from a closed menu.
- A glow beside the thing, or sliding with the camera -> emissive drawn in world coordinates; subtract the camera exactly like the game's draw.
- Glow flickers, or `?t=&freeze=1` shows none -> emissive drawing is missing from a draw path (title, the single draw after the fast-forward) or sits in the update step.
- Two overlays, the game looks blurry or double-graded -> `GameDNA_Post.create` called twice for the canvas; create once and pass `post`.
- Everything blooms white on every hit -> `flare` inside a per-frame overlap loop; call it once where a big hit is accepted.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [WebGL post-process pipeline] With WebGL: deeper shadows, a warm/cool tone and darker corners, the HUD still readable; a hit briefly splits the colours outward from the contact point.
- [WebGL post-process pipeline] With `?webgl=0`: the game looks and plays exactly as before; `?auto=1` ends the same with WebGL on and off.
- [Bloom & glow] Glowing things (spells, projectiles, lights, pickups) have a soft halo; HUD text and panels look exactly as without the module.
- [Bloom & glow] A big hit briefly blooms brighter from its contact point.
- [Bloom & glow] With `?webgl=0`: looks and plays exactly as before; `?auto=1` ends the same with WebGL on and off.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `webgl-post.js` sha256 `5834454b15435dbb...`, `bloom-glow.js` sha256 `d5e0da1c3da5952b...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [WebGL post-process pipeline] Every draw path ends with (or starts with) `post.render()`; `clock` is the step-counted game time.
- [WebGL post-process pipeline] Every damage site calls `post.pulse` once with a canvas-pixel point; walk `pulse(0.7)`: 3.5 px split at the edges, a quarter of it 130 ms later, gone at 260 ms.
- [Bloom & glow] Load order `webgl-post.js` -> `bloom-glow.js` -> game; exactly one `GameDNA_Post.create` for the canvas (the game's, or one for bloom).
- [Bloom & glow] Every draw path calls `bloom.emissive()` drawing (when something glows) and `bloom.render()`; `clock` is the step counter.
- [Bloom & glow] Walk threshold 0.78, knee 0.5: brightness 0.9 passes 70 % of its colour, 0.6 passes 12 %, 0.39 and below nothing; `flare(1.2)` makes the wide glow up to 2.44x stronger and fades over 420 ms (a quarter left at 210 ms).
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
