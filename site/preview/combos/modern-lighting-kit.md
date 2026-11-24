# Add WebGL post-process pipeline, Dynamic 2D lights & soft shadows, Bloom & glow, Colour grading LUT and Camera director to my game

Add the 5 game elements below to MY existing game, which you have not seen. Each is a finished module file given with this prompt:

- `webgl-post.js` (one global, `GameDNA_Post`), API reference `webgl-post.README.md`
- `dynamic-lights.js` (one global, `GameDNA_Lights`), API reference `dynamic-lights.README.md`
- `bloom-glow.js` (one global, `GameDNA_Bloom`), API reference `bloom-glow.README.md`
- `color-grade-lut.js` (one global, `GameDNA_ColorGrade`), API reference `color-grade-lut.README.md`
- `camera-director.js` (one global, `GameDNA_Camera`), API reference `camera-director.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) WebGL post-process pipeline [effects], (2) Dynamic 2D lights & soft shadows [effects], (3) Bloom & glow [effects], (4) Colour grading LUT [effects], (5) Camera director [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **WebGL post-process pipeline:** the canvas element the game draws on (any size, any CSS scaling); render() once per drawn frame on every draw path (before or after the game's own drawing); a world clock in ms that can pause (optional); optional: HUD rects in canvas px (uiRects) or a shared uiMask input canvas: HUD pixels are never graded or colour-split; the places where HP/MP change (hit frame) (optional); optional: extra input canvases (depth map, light mask) for later passes.
- **Dynamic 2D lights & soft shadows:** render() once per drawn frame on every draw path (or the game's own post.render()); a world clock in ms that can pause; optional: occluders from the tile map (solidAt(tx, ty) + tile size) and / or rects; rectangles of UI to keep clear (optional); optional: actors to follow (hero, projectiles) and events with a point (impacts, spells) for flashes.
- **Bloom & glow:** WebGL post-process pipeline webgl-post (GameDNA_Post) loaded first; the game's existing instance, or one the module creates; render() once per drawn frame on every draw path; a world clock in ms that can pause (optional); optional: HUD rects in canvas px (uiRects) or a uiMask canvas; optional: per-frame emissive drawing of what should glow, at on-screen positions; the places where HP/MP change (hit frame) (optional).
- **Colour grading LUT:** WebGL post-process pipeline webgl-post.js (GameDNA_Post), loaded first; the game's own WebGL post-process pipeline instance is shared when it has one; the canvas element the game draws on; render() once per drawn frame on every draw path; a world clock in ms that can pause; where the player is: zone, phase or scene, to pick a look each step; optional: HUD and window rects in canvas px (uiRects) so the HUD stays ungraded.
- **Camera director:** a fixed update step that calls update(dt) once (also run by ?t= fast-forward and ?auto=1); the followed target per step in world px: position, optional velocity, on-ground flag (side view) and facing; the level size (bounds); optional rooms or arenas; the world drawing wrapped by apply/restore (translate-style) or reading cam.x / cam.y (subtract-style); drawing culled with visible(); optional: extra targets to frame (boss, second player); the places where HP/MP change (hit frame) (optional); a camera offset (optional); optional: HUD and label rects (uiRects, screen px) the target must never be framed under.

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

## Element 2: Dynamic 2D lights & soft shadows (`dynamic-lights.js`, `GameDNA_Lights`)

Real-time 2D lighting on top of the WebGL post-process pipeline ( , required: `webgl-post.js` is shipped with it and loads first). The world gets darker where no light reaches; point lights and spotlights with soft falloff, colour and flicker light it; a torch rides on the hero, projectiles carry their light, impacts flash; walls and obstacles cast soft shadows. A light map is composited in a WebGL pass, so the HUD stays unlit. Without WebGL, or with `?webgl=0` / `?lights=0`, the game looks exactly as before.

**Parameters chosen:** `ambient` = 0.55, `tint` = dusk, `shadows` = on, `softness` = 5, `glow` = 0.35, `flicker` = 0.25, `bands` = 0.

**Where it goes** (by role; find these places in my game):

1. *Load order:* `<script src="webgl-post.js">` then `<script src="dynamic-lights.js">`, both before the game script. One `GameDNA_Post` instance on the game canvas (create it if the game has none: `GameDNA_Post.create({canvas, clock})`).
2. *Once, after the canvas and the post instance exist, before any reset code that calls `lights.clear()`:* `lights = GameDNA_Lights.create({canvas, post, clock: () => <frame counter> * <step ms>, camera: () => ({x: <camX> - <field offset x>, y: <camY> - <field offset y>}), solidAt: (tx, ty) => <tile blocks light: walls, trees, houses, rocks, platforms; not water or floor>, tile: <tile px>, uiRects: () => [<HUD plates, open text box, menu rects in canvas px; NOT text drawn straight on the world>], when: () => <a world screen is showing, incl. a result box over it>, params: {ambient: 0.55, tint: 'dusk', shadows: 'on', softness: 5, glow: 0.35, bands: 0, wallLight: <wall-face height px>}})`. `camera` is the WORLD point drawn at canvas (0, 0). Obstacles that are not tiles go in `rects: () => [{x, y, w, h}]` (world px). Side-scroller with sky / parallax: call `lights.markFar()` in the draw right after the sky and parallax layers, before tiles and actors.
3. *Where a level, scene or run STARTS (and spawns):* `lights.clear()`, then `lights.add({id: 'hero-torch', follow: () => <hero>, offset: {x, y}, radius: <~4 tiles>, color: '#ffb066', flicker: 0.25})` and the level's fixed sources (lamps, fires with flicker 0.35, crystals). Projectiles when spawned: `lights.add({follow: () => shot.alive ? shot : null, radius, color})`. Never `add` every frame.
4. *Where an impact, kill or spell is ACCEPTED (once):* `lights.flash({x, y, radius, color, ms: 300})` in world px. It only shows while `when()` is true: hits on a separate battle screen stay unlit.
5. *EVERY draw path (title, play, result, the single draw after the `?t=` fast-forward):* `lights.render()` once per drawn frame (it calls `post.render()`).

**Common mistakes** (symptom -> fix):

- The torch pool sits beside the hero or slides when scrolling -> `camera()` must be the world point at canvas (0, 0), HUD offset included.
- Shadows in odd places -> `solidAt` got pixels instead of tile indices, or water / floor counted as walls.
- Title or a separate battle screen goes dark -> `when()` must be false there.
- HUD plate dimmed -> its rect is missing from `uiRects`.
- A bright box or band behind HUD text or a message in the dark scene -> that text has no plate: drop its rect (it is lit like the world and stays readable) or give it a small backing box and mask the box; never a full-width strip with nothing behind it.
- Light pools on the sky or far mountains of a side-scroller -> call `lights.markFar()` right after drawing the sky / parallax.
- Frame time climbs, lights pile up -> `add()` called every frame; add at spawn / level start.
- Nothing lights, `lights.stats().reason` is `no-post-module` -> `webgl-post.js` must load first.

## Element 3: Bloom & glow (`bloom-glow.js`, `GameDNA_Bloom`)

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

## Element 4: Colour grading LUT (`color-grade-lut.js`, `GameDNA_ColorGrade`)

Grades the whole picture through a 3D colour lookup table on the WebGL post-process pipeline WebGL post layer: one table per mood (neutral, dusk, night, memory, combat, toxic, all generated in code), blended over game time when the player changes zone, phase or scene, plus a vignette and fine film grain. The HUD stays exactly as drawn. **It requires WebGL post-process pipeline: `webgl-post.js` is shipped in this basket and must load before `color-grade-lut.js`.** If the game (or WebGL post-process pipeline in this basket) already creates a `GameDNA_Post` instance, create it first; this module shares it and turns its built-in grade off (one grade, one vignette). Without WebGL, or with `?webgl=0`, nothing changes.

**Parameters chosen:** `preset` = neutral, `strength` = 1, `blend` = 900, `vignette` = 0.3, `grain` = 0.035, `builtin` = replace.

**Where it goes** (by role; find these places in my game):

1. *Page head, before the game script:* Load `webgl-post.js`, then `color-grade-lut.js`, both verbatim.
2. *Once, after the game canvas exists (and after the game's own `GameDNA_Post.create`, if any):* `grade = GameDNA_ColorGrade.create({canvas: <the game canvas>, clock: () => <frame counter> * <step ms>, params: {preset: 'neutral', strength: 1, blend: 900, vignette: 0.3, grain: 0.035, builtin: 'replace'}, uiRects: () => <HUD bars, open windows, menus and banner plates now, canvas px, {x, y, w, h, r?}>})`; for flat, saturated pixel art use `strength` 0.6-0.75. Mask only HUD drawn on its own backing plate; text drawn straight on the world (title text, name labels) stays unmasked.. Never a second `GameDNA_Post.create` for the same canvas.
3. *The fixed step, after state changes (zone, phase, scene):* `grade.to(<look for the current screen, zone or phase (not per turn or attacker)>, <600-1500 ms>)`, e.g. battle screen `combat`, enemy turn `night`, swamp `toxic`, flashback `memory`, evening `dusk`, otherwise `neutral`. Idempotent: calling it every step is fine.
4. *Where a new game, level or run STARTS:* `grade.set(<its look>)` (a cut, no fade from the previous screen).
5. *EVERY draw path (title, play, pause, result, and the single draw after the `?t=` fast-forward):* `grade.render()` once per drawn frame (it also renders WebGL post-process pipeline).

**Common mistakes** (symptom -> fix):

- Two overlays, or a game whose WebGL post-process pipeline grade still shows -> the colour-grade module was created before the game's own `GameDNA_Post.create`; create WebGL post-process pipeline first.
- The look pumps or keeps restarting its fade -> two looks are requested in the same frame (e.g. at a zone border, or from draw code); decide one look per step from state.
- HUD text tinted at night -> `uiRects` missing, in world coordinates, or missing the HUD's draw offset (WebGL post-process pipeline v1.1+ also keeps its own grade and pulse off the HUD through the same mask).
- Ungraded boxes behind title text or battle labels -> those rects mask text with no plate behind it (a `soft` edge does not hide it); leave that text unmasked, give it a small backing box, or keep the title screen neutral. Never a full-width strip or whole-canvas rect with nothing behind it.
- Battle look flickers between two moods -> the look is picked per turn or attacker; pick it per screen or phase.
- Paths go orange (dusk) or grass neon (toxic) on bright pixel art -> lower `strength` to 0.6-0.75.
- Square halos around rounded HUD panels -> give exact panel rects with `r` = the panel corner radius, not padded rects.
- Double dark corners -> the game already draws its own vignette; set `vignette: 0` here or remove one.
- `?t=&freeze=1` frames differ between runs -> `clock` or `to()` uses wall-clock time; use the step counter.

## Element 5: Camera director (`camera-director.js`, `GameDNA_Camera`)

Replaces the hard-follow camera with a directed one: a critically damped spring with a dead zone, eased look-ahead, vertical re-framing only on landing (side view), the hero and a boss kept in frame together (zoom out, or a lean when the game cannot zoom), zoom punches and trauma shake on big hits, clean level and room edges, and cuts on teleports. Sub-pixel on HD games, whole pixels on pixel games. View only: the game keeps its own camera for gameplay, so rules and autoplay endings never change.

**Parameters chosen:** `follow` = 1.8, `followY` = 1.4, `deadW` = 0.08, `deadH` = 0.12, `look` = 0.15, `lookHz` = 0.7, `idleLook` = 0.4, `platform` = auto, `farY` = 0.28, `biasY` = 0.06, `safe` = 0.8, `frame` = zoom, `minZoom` = 0.72, `minSize` = 0.1, `blend` = 0.9, `pad` = 0.1, `punch` = 0.06, `shake` = 3, `roll` = 1.2, `decay` = 1.6, `freq` = 14, `snap` = auto, `reduced` = system, `mode` = director. (`view`: not used; your game keeps its own.)

**Where it goes** (by role; find these places in my game):

1. *Before you change anything: every reader of the game's current camera variable (search its name):* List each one as DRAW (tile and sprite positions, draw culling, parallax, screen effects at world points, pointer -> world) or GAMEPLAY (spawn or wake "on screen", despawn, AI visibility, autoplay, test hooks, saves). Only DRAW readers change. The game keeps computing its own camera exactly as before; never assign the director's values to it.
2. *Once, when the level size is known:* `cam = GameDNA_Camera.create({view: {x: 0, y: 0, w: <world view width>, h: <height>}, bounds: {x: 0, y: 0, w: <level width>, h: <level height>}, seed: 1, uiRects: () => [<HUD panels and labels, screen px>], params: {view: <'side' for a side-view game (platformer, run and gun, gravity, jumping) or 'top' for a top-down game (moves in 4 or 8 directions, no gravity): decide from the game, not from this text>, follow: 1.8, followY: 1.4, deadW: 0.08, deadH: 0.12, look: 0.15, lookHz: 0.7, idleLook: 0.4, platform: 'auto', farY: 0.28, biasY: 0.06, safe: 0.8, frame: 'zoom', minZoom: 0.72, minSize: 0.1, blend: 0.9, pad: 0.1, punch: 0.06, shake: 3, roll: 1.2, decay: 1.6, freq: 14, snap: 'auto', reduced: 'system', mode: 'director'}})`. `view` is the screen rect the world is drawn into (logical px; below a HUD strip if the game has one). Add `zoom: false` if the world is drawn by subtracting the camera from each position and you will not wrap it. A level of another size: `cam.setBounds(...)`. Redrawing several times per step (pause screens, menus, high refresh rates) is fine: `apply` gives the same transform until the next `update`.
3. *Your fixed update step (the one `?t=` fast-forward and `?auto=1` also run), after movement and after the game's own camera update, on every scene that shows the world:* `cam.update(<step ms>, {target: {x, y, w, h, vx, vy, onGround, facing}, extra: <living boss (even off screen: it fades in by distance) or second player ? [{x, y, w, h}] : []>, legacy: {x: <old camera x>, y: <old camera y>}, room: <arena rect while it is shut, else null>})`: target = the hero's sprite centre and drawn size in WORLD px; `onGround` only for side-view games; `facing` 1 | -1.
4. *The world draw (DRAW readers):* Translate-style: replace the camera translate with `cam.apply(ctx)` and its restore with `cam.restore(ctx)`; draw in world coordinates. Subtract-style: read `cam.x` / `cam.y` where the old variable was read (optionally inside `cam.applyScreen(ctx)` ... `cam.restore(ctx)` for zoom and roll). Cull drawing with `cam.visible(<one tile>)`; parallax reads `cam.cx` / `cam.cy`; pointer -> world uses `cam.toWorld(sx, sy)`. HUD after `restore`.
5. *Big impacts:* Hits that matter: `cam.hit({strength: <'finisher' for killing blows, 'heavy' for strong hits and the player being hurt, 'light' for chip hits>, at: {x, y} <world px>})` once per accepted hit; slams and explosions: `cam.trauma(0.3-0.6)`.
6. *Teleports, respawns, doors, level starts, title -> play, restart:* `cam.cut(<target x>, <target y>)` (after a new run: `cam.clear()` first).

**Common mistakes** (symptom -> fix):

- Enemies wake or spawn at other times, autoplay ends differently -> the director was written into the game's camera or a gameplay reader was switched; switch only drawing.
- Tiles pop in at the edges when the view leads or zooms out -> drawing is still culled with the old camera or the view size; use `cam.visible(pad)`.
- The view drifts away from the hero -> `target` is in screen px; pass world px.
- The view slides across the level after a respawn or a door -> no `cut` there.
- `?t=` frames differ between runs, the view moves faster at high refresh rates -> `update` is in render or uses wall-clock time; call it once per fixed step.
- The backdrop slides against the world -> parallax still reads the old camera.
- Double, jerky shake -> the game's own shake still runs; route it to `cam.shake(px, ms)` or set one of the two to 0.
- Numbers, sparks or windows placed at a unit drift away from it -> another element was given screen positions from the old camera; use `cam.toScreen(x, y)`.
- The camera bobs on every jump -> `onGround` is not passed (platform snapping off).
- The hero walks to the screen edge after an arena opens -> the room is still passed; pass `room: null` once the exit opens.
- The hero is framed under a HUD panel -> `uiRects` not given; return the HUD and label rects in screen px.

## Cross-element wiring

**WebGL post-process pipeline with Camera director:**

- **hit sites:** Every accepted hit also calls `cam.hit({strength, at})` on the same step. Call `post.pulse(strength, {at})` there too, once per landed hit, with the contact point in canvas pixels.

**Dynamic 2D lights & soft shadows with Camera director:**

- **hit sites:** Every accepted hit also calls `cam.hit({strength, at})` on the same step. Call `lights.flash({x, y, radius: 60, color: '#ffd8a0', ms: 250})` there too (world px) for killing blows and spells, once per event.

**Bloom & glow with Camera director:**

- **big hits:** Every accepted hit also calls `cam.hit({strength, at})` on the same step. Call `bloom.flare(strength, {at})` there too, once per accepted heavy hit or kill (0.6 / 1.2), with the contact point in canvas pixels.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [WebGL post-process pipeline] With WebGL: deeper shadows, a warm/cool tone and darker corners, the HUD still readable; a hit briefly splits the colours outward from the contact point.
- [WebGL post-process pipeline] With `?webgl=0`: the game looks and plays exactly as before; `?auto=1` ends the same with WebGL on and off.
- [Dynamic 2D lights & soft shadows] Unlit areas darker; the hero torch's flickering pool moves exactly with the hero; walls cast soft shadows away from each light; HUD crisp and unlit.
- [Dynamic 2D lights & soft shadows] With `?webgl=0` and `?lights=0`: the plain game; `?auto=1` ends the same with lights on and off.
- [Bloom & glow] Glowing things (spells, projectiles, lights, pickups) have a soft halo; HUD text and panels look exactly as without the module.
- [Bloom & glow] A big hit briefly blooms brighter from its contact point.
- [Bloom & glow] With `?webgl=0`: looks and plays exactly as before; `?auto=1` ends the same with WebGL on and off.
- [Colour grading LUT] Each zone, phase or scene has its own mood (a night look keeps fires and lanterns orange) and switching fades smoothly over the chosen time.
- [Colour grading LUT] HUD bars, text and item icons look exactly as without the module; one soft vignette, fine grain.
- [Colour grading LUT] With `?webgl=0`: looks and plays exactly as before; `?auto=1` ends the same with WebGL on and off.
- [Camera director] Running: more room ahead of the hero; turning round eases the view across instead of snapping.
- [Camera director] Jumping: no vertical bob; the view rises only after landing higher, and follows a long fall.
- [Camera director] A boss: hero and boss both in view; a finishing blow punches in toward the hit and shakes with a slight roll, settled within half a second; the HUD never moves.
- [Camera director] Level edges: the view stops cleanly with no jitter; `?auto=1` reaches the same ending at the same time as without the element.
- [combined] Every landed hit briefly splits the colours outward from its contact point.
- [combined] Killing blows and spells briefly light their surroundings.
- [combined] A killing blow briefly blooms brighter from its contact point.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `webgl-post.js` sha256 `5834454b15435dbb...`, `dynamic-lights.js` sha256 `dd8b9c465e441f24...`, `bloom-glow.js` sha256 `d5e0da1c3da5952b...`, `color-grade-lut.js` sha256 `fb42cc45ddb99fe3...`, `camera-director.js` sha256 `bacafd9cfa2b02fe...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [WebGL post-process pipeline] Every draw path ends with (or starts with) `post.render()`; `clock` is the step-counted game time.
- [WebGL post-process pipeline] Every damage site calls `post.pulse` once with a canvas-pixel point; walk `pulse(0.7)`: 3.5 px split at the edges, a quarter of it 130 ms later, gone at 260 ms.
- [Dynamic 2D lights & soft shadows] Walk `camera()`: hero at world (200, 120), camera (72, 40) -> torch at canvas (128, 80), on the hero.
- [Dynamic 2D lights & soft shadows] Every draw path ends with `lights.render()`; lights are added at spawn / level start; `lights.clear()` at level start; flashes once per event.
- [Dynamic 2D lights & soft shadows] Walk one light: unlit pixels at 0.55 of their colour; intensity 1 adds 1.0 x the light colour at its centre, 0.38 x at half radius, 0 at the rim.
- [Bloom & glow] Load order `webgl-post.js` -> `bloom-glow.js` -> game; exactly one `GameDNA_Post.create` for the canvas (the game's, or one for bloom).
- [Bloom & glow] Every draw path calls `bloom.emissive()` drawing (when something glows) and `bloom.render()`; `clock` is the step counter.
- [Bloom & glow] Walk threshold 0.78, knee 0.5: brightness 0.9 passes 70 % of its colour, 0.6 passes 12 %, 0.39 and below nothing; `flare(1.2)` makes the wide glow up to 2.44x stronger and fades over 420 ms (a quarter left at 210 ms).
- [Colour grading LUT] Load order `webgl-post.js` -> `color-grade-lut.js` -> game; exactly one `GameDNA_Post.create` for the canvas (the game's, or none).
- [Colour grading LUT] Every `to()` is in the fixed step with a preset name; walk `to('night', 1200)`: mix 0, 0.5 at 600 ms, 1 at 1200 ms; every draw path ends with `grade.render()`.
- [Colour grading LUT] For each screen, `uiRects` returns the rects of what is drawn there, in canvas px.
- [Camera director] Every reader of the old camera is listed as DRAW (switched) or GAMEPLAY (unchanged); nothing assigns `cam` values into game state.
- [Camera director] `cam.update` runs once per fixed step with a WORLD-px target and `legacy`; `cut` runs at every teleport, respawn and level start.
- [Camera director] Walk one landing with the defaults: airborne, `cam.cy` holds; after landing 110 px higher it reaches 95 % in ~33 frames, with no overshoot.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
