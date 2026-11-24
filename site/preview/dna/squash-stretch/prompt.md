# Add Squash, stretch & anticipation to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `squash-stretch.js` (one global, `GameDNA_SquashStretch`), API reference `squash-stretch.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Squash, stretch & anticipation [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Squash, stretch & anticipation:** a fixed update step that calls update(dt) once per step (also run by ?t= fast-forward and ?auto=1); each moving actor's velocity and on-ground flag per step (motion), any units, with maxSpeed / maxFall in the same units; the places where HP/MP change (hit frame) (optional); optional attack / cast start and long wind-ups (anticipation, charge / release); the per-actor sprite draw call, wrapped by wrap(ctx, id, footX, footY, fn) with the feet point in draw coordinates.

## Element 1: Squash, stretch & anticipation (`squash-stretch.js`, `GameDNA_SquashStretch`)

Every sprite the game already draws bends about its feet, with no new frames: a crouch before jumps, swings and spells, a stretch while rising and falling fast, a squash on landing and on taking a hit, a springy overshoot back, a lean into movement and a slow breath at rest. Area is kept (sx*sy = 1). It is a canvas transform around the sprite draw only: positions, hit boxes, timing and rules never change, so autoplay ends exactly as before. Whole pixels on pixel games, smooth on HD.

**Parameters chosen:** `amount` = 1, `squash` = 0.28, `stretch` = 0.2, `spring` = 6, `wobble` = 0.55, `lean` = 9, `breathe` = 0.025, `walk` = 0.05, `anticipation` = 70, `snap` = auto, `reduced` = system, `view` = side.

**Where it goes** (by role; find these places in my game):

1. *Once, before the first reset of your actors:* `ss = GameDNA_SquashStretch.create({params: {amount: 1, squash: 0.28, stretch: 0.2, spring: 6, wobble: 0.55, lean: 9, breathe: 0.025, walk: 0.05, anticipation: 70, snap: 'auto', reduced: 'system', view: 'side'}})`; then for each actor kind `ss.attach(id, {w, h, maxSpeed, maxFall})`: drawn sprite size, and the run speed and fall speed that mean "full", in the SAME units as the velocities you pass (px per step or px per second); rigid actors (armour, robots, stone) add `stiffness: 0.5` so they squash less than soft ones (slimes stay 0). Actors without an id: give each a stable id string where they are created.
2. *Your fixed update step (the one `?t=` fast-forward and `?auto=1` also run), after movement and collisions:* `ss.motion(id, vx, vy, onGround)` for every moving actor (+vy = down; `onGround` null for flyers; no velocity variable: pass the position change since the last step), then `ss.update(<step ms>)` once, as the last line of the step, on every scene.
3. *Where an attack or spell STARTS (the game's own wind-up keeps its timing):* `ss.event(id, 'attack', 1, <facing 1 | -1>)`; a long telegraphed wind-up: `ss.event(id, 'charge', 1, <toward target>)` at its start and `ss.event(id, 'release')` when it fires.
4. *Every place damage is ACCEPTED (after invulnerability checks), player and enemies:* `ss.event(targetId, 'hit', <killing blow ? 1.4 : 1>, <blow direction 1 | -1>)` once.
5. *Each actor's sprite draw (only the sprite: not its shadow, HP bar, name or the HUD):* `ss.wrap(ctx, id, footX, footY, () => <existing sprite draw>)`, feet = bottom centre of the drawn sprite in the coordinates it is drawn with (camera applied). If the draw function also draws a bar or label, use `ss.apply(ctx, id, footX, footY)` before the body and `ss.restore(ctx)` before the bar, on every path. A shadow may widen by `ss.transform(id, ctx).sx`.
6. *Level, life, respawn and restart:* `ss.clear()` (or `ss.clear(id)` for one respawned actor); removed actors: `ss.detach(id)`.

**Common mistakes** (symptom -> fix):

- Sprites sink into the floor or float when squashed -> the foot point is the sprite's top-left or centre; pass the bottom centre in draw coordinates.
- The HUD or the whole field shifts or scales for a moment -> an `apply` has no `restore` on some path; use `wrap`.
- Autoplay ends differently -> game logic reads `transform()` or a size was changed; the module must only touch drawing.
- Poses jump or stutter, `?t=` frames differ between runs -> `update` sits in the render loop or uses wall-clock time; call it once per fixed step.
- No landing squash -> `onGround` is not passed (or always true); pass the real flag after collisions.
- Squash never springs back -> `update` is never called (the module then advances per draw, after 40 draws).
- HP bars wobble with the sprite -> the bar is inside the wrapped draw; restore before it.
- Pixel sprites shimmer with half-pixels -> `snap` is `smooth` on a pixel game; leave `auto` (it reads `imageSmoothingEnabled === false`) or set `pixel`.
- An HD game's poses step in whole pixels -> the integration switched `imageSmoothingEnabled` off; keep the game's own smoothing setting.
- An armoured knight flattens as much as a slime -> pass `stiffness` 0.4-0.6 in its `attach`.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Squash, stretch & anticipation] A jump: crouch on take-off, tall and thin while rising, squat and wide on landing, springing back past normal; the feet stay on the ground line.
- [Squash, stretch & anticipation] An attack: a crouch leaning back, then a lunge toward the target; the struck actor squashes and tilts away from the blow.
- [Squash, stretch & anticipation] Running leans into the direction; standing still breathes; hit boxes and the HUD never move with the sprite.
- [Squash, stretch & anticipation] `?auto=1` reaches the same ending at the same time as without the element.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `squash-stretch.js` sha256 `37a8083908ab6cfa...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Squash, stretch & anticipation] `ss.update` runs once per fixed step, inside the step; `ss.motion` runs after each actor moves; nothing in game logic reads the module.
- [Squash, stretch & anticipation] Every sprite draw is wrapped (or `apply`/`restore` paired on every path); bars, labels and the HUD are outside.
- [Squash, stretch & anticipation] Walk one landing with the defaults: `sy` 0.72 held ~3 frames, back over 1.0 to ~1.04, settled by ~16 frames; the collision box is identical on each frame.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
