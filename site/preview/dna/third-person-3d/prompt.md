# Add Third-person 3D character and camera to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `third-person-3d.js` (one global, `GameDNA_ThirdPerson3D`), API reference `third-person-3d.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Third-person 3D character and camera [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Third-person 3D character and camera:** three.js 0.149.0 classic build loaded as window.THREE before the module; a canvas for WebGL and (optional) a 2D canvas on top for HUD and addons; a fixed 60 Hz update step; the world content: prop list (kind, x, z, rot, scale), pickups, NPCs.

## Element 1: Third-person 3D character and camera (`third-person-3d.js`, `GameDNA_ThirdPerson3D`)

A third-person 3D exploration area: a procedural low-poly adventurer on a small island (sky, fog, soft shadows, code-drawn ground, props with colliders) seen by a smooth follow camera. Movement is camera-relative; the body turns toward the stick and then speeds up along its facing; walk and run poses follow the distance travelled so feet never slide; models are scaled by bounding box with feet on the ground in every pose. The camera lags, auto-aligns behind a running hero, pulls in in front of tall props and fades tree canopies. Pickups float and burst; NPCs face the hero, greet and wave. The module needs three.js 0.149.0 (three.min.js next to the page) and owns rendering; the game keeps its rules, quests, dialogue and HUD.

**Parameters chosen:** `walkSpeed` = 1.8, `runSpeed` = 5.2, `turnRate` = 12, `heroHeight` = 1.7, `camDist` = 6.5, `camPitch` = 20, `camLag` = 0.12, `autoAlign` = 1.2, `fov` = 50, `gear` = both, `palette` = meadow, `shadows` = soft, `mode` = tour.

**Where it goes** (by role; find these places in my game):

1. *The page:* Load `three.min.js` (0.149.0, shipped next to the page) with `<script src>` before the module; add a WebGL canvas and a 2D canvas on top (same size, absolutely positioned).
2. *Where the game builds its scenes:* `tp = GameDNA_ThirdPerson3D.create({canvas, overlay, seed, onEvent, params: {walkSpeed: 1.8, runSpeed: 5.2, turnRate: 12, heroHeight: 1.7, camDist: 6.5, camPitch: 20, camLag: 0.12, autoAlign: 1.2, fov: 50, gear: 'both', palette: 'meadow', shadows: 'soft'}})`; when `tp.ok` is false keep the old scenes only. Then `buildIsland`, `paint.*` + `paint.done()`, `buildLayout(props)`, `scatter()`, the hero (`addActor` + `setHero` + `snapCamera`), NPCs and pickups from the game's own content.
3. *The fixed step (also run by any fast-forward):* `tp.step({x, y, run, camYaw}, 1 / 60)` with the game's own movement keys (y = forward) and touch stick; the game's use / talk key opens its own dialogue when an NPC is within 2.2 m; set that NPC's `target = 'hero'` while near.
4. *Pickups and score:* `onEvent({type: 'pickup', id, kind, value})` feeds the game's existing counters and inventory.
5. *The draw pass:* `tp.render()`, then the HUD on the 2D canvas in CSS px; labels above characters from `tp.anchor(id)` of the same frame; `tp.resize(w, h)` on load and resize.
6. *The game's autoplay:* `tp.autopilot({x, z})` turns its next goal into stick input along an A* path around props.

**Common mistakes** (symptom -> fix):

- Hero walks backwards or sideways -> a yaw was typed by hand; use `atan2(v.x, v.z) + FACING_OFFSET`.
- Black canvas or "THREE is not defined" -> three.min.js missing or loaded after the module.
- Labels lag behind characters -> anchors read before `render()` or in canvas px instead of CSS px.
- Screenshots differ run to run -> `Math.random` or clock reads in the step.
- An NPC blocks the path -> actors are round colliders; place them off paths or set `ghost = true`.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Third-person 3D character and camera] The hero faces each of 8 move directions; feet stay on the ground in idle, walk and run.
- [Third-person 3D character and camera] The camera pulls in in front of pillars and walls and never shows the inside of a prop.
- [Third-person 3D character and camera] Pickups count once; NPCs turn to the hero when near; the game's own scenes and keys still work.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `third-person-3d.js` sha256 `7f83405e438811b7...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Third-person 3D character and camera] Trace stick (1, 0) with camera yaw 0: world (1, 0), yaw = atan2(1, 0) = 1.571.
- [Third-person 3D character and camera] Trace one pickup: hero within 0.95 m -> `onEvent` -> counter + 1, once.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
