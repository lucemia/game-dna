# Add arcade kart racer (3d) to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `kart-racer-3d.js` (one global, `GameDNA_KartRacer3D`), API reference `kart-racer-3d.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Arcade kart racer (3D) [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Arcade kart racer (3D):** three.js 0.149.0 classic build loaded as window.THREE before the module; a canvas for WebGL and (optional) a 2D canvas on top for the HUD and addons; a fixed 60 Hz update step; a track definition (closed list of points) and a list of racers.

## Element 1: Arcade kart racer (3D) (`kart-racer-3d.js`, `GameDNA_KartRacer3D`)

Adds a 3D arcade kart race (three.js 0.149.0): a low-poly track from a closed list of points (road, kerbs, barriers, ramps, boost pads, start gantry with countdown lamps), karts with drivers whose wheels sit on the ground and that face their velocity, grip steering, a hop-drift that charges a three-level boost, jumps, boost pads, rocket starts, checkpoint gates that only count in order, AI racers on a racing line with rubber-banding, a 3-2-1-GO countdown, race clock, lap splits, places, minimap, drift meter and results. Seeded and fixed-step; an AI driver doubles as autoplay.

**Parameters chosen:** `track` = meadow, `palette` = track, `laps` = 3, `maxSpeed` = 25, `grip` = 14, `driftGrip` = 5, `turnRate` = 2.25, `boostPower` = 1.32, `rubberBand` = 0.1, `aiSkill` = 0.95, `camDist` = 6.4, `camHeight` = 2.5, `fov` = 64, `shadows` = soft, `mode` = race.

**Where it goes** (by role; find these places in my game):

1. *Load (once, in the page):* `<script src="three.min.js">` (the pinned 0.149.0 copy shipped in the basket) and then the module `<script src>`, before your game script.
2. *Where your game enters a mode or level (a menu entry, a level, a mini-game trigger):* Add a race mode with its own WebGL canvas behind a 2D canvas, both filling your game area; hide your 2D world while racing. Once: `race = GameDNA_KartRacer3D.create({canvas, params: {laps: 3, maxSpeed: 25, grip: 14, driftGrip: 5, turnRate: 2.25, boostPower: 1.32, rubberBand: 0.1, aiSkill: 0.95, camDist: 6.4, camHeight: 2.5, fov: 64, shadows: 'soft'}, onEvent})`; if `!race.ok` call `race.drawFallback()` and stay in your game. `race.resize(cssW, cssH)` now and on resize.
3. *When a race starts:* `race.startRace({track: 'meadow' (or your track object), karts: [{id: 'player', kart: 'rook', player: true}, {kart: 'wren'}, ...] (your characters as kart objects `{name, body, accent, suit, helmet, number}`), laps, seed})` then `race.countdown()`; your autoplay: `race.setAI('player', true)`.
4. *Your fixed step (every loop that steps the game, fast-forwards included):* `race.step({steer: right - left, throttle, brake, drift}, 1 / 60)` once per 60 Hz step while the race mode is on (touch: throttle always on). Never move karts yourself.
5. *Where you draw:* `race.render()`, then on the 2D canvas scaled to CSS px `race.drawHud(ctx, w, h, {touch})`, then your own UI clear of `race.hudRects()`.
6. *Where the race ends:* In `onEvent(ev)`: `ev.type === 'raceEnd'` (the player crossed the line): `race.setCamera('orbit', {target: 'player'})`, about 3 s later show `race.results()` and award your prize once, then leave the mode as your game leaves any other. Sounds / effects on `countdown`, `go`, `lap`, `boost`, `jump`, `bump`.

**Common mistakes** (symptom -> fix):

- Karts freeze or race at a different speed after a menu -> `step()` is skipped or called per animation frame; call it once per fixed 60 Hz step.
- A different race every reload, or `?t=` stills that differ -> pass a seed; no `Math.random()` / clock time in anything feeding the race.
- Karts drive backwards or float -> your code rotated or lifted the models; the module owns every kart transform.
- Laps never count on a custom track -> its points run the wrong way or two parts overlap; run `GameDNA_KartRacer3D.checkTrack(def)` (must return []).
- Black screen -> WebGL missing: check `race.ok` and call `race.drawFallback()`.
- HUD over your panels on a phone -> keep your panels outside `race.hudRects()`; the module switches to a phone layout under 560 px.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Arcade kart racer (3D)] A race shows 3-2-1-GO, three laps with place / lap / clock / minimap, FINISH and results; your game continues afterwards.
- [Arcade kart racer (3D)] Driving backwards over the line or cutting across the grass adds no lap.
- [Arcade kart racer (3D)] Holding drift through a corner turns the sparks blue, orange, pink; release gives a flame boost; autoplay finishes the race.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `kart-racer-3d.js` sha256 `1fe56e6ced47b6ba...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Arcade kart racer (3D)] Trace one race: enter mode -> startRace -> countdown -> step each fixed step -> raceEnd -> results -> back to your game.
- [Arcade kart racer (3D)] List every place your game advances time and confirm each calls `race.step` exactly once per 60 Hz step while racing.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
