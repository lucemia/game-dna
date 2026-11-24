# Add grappling hook & swing to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `grapple-swing.js` (one global, `GameDNA_Grapple`), API reference `grapple-swing.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Grappling hook & swing [movement].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Grappling hook & swing:** a fixed update step where the hero's velocity code runs (also run by ?t= fast-forward and ?auto=1); the hero's box and velocity {x, y, w, h, vx, vy, onGround, facing} in world px and the game's own units; the game's wall test solid(x, y) in world px, its tile size and gravity; a grapple button (pressed / held), left / right, reel in / out, jump pressed; a camera offset; reset on new run, respawn, life lost.

## Element 1: Grappling hook & swing (`grapple-swing.js`, `GameDNA_Grapple`)

A grappling hook: fire at iron rings (aim assist) or any rock surface, hang on a rope, swing like a pendulum, pump with left / right, reel in and out, jump off or let go keeping the momentum; the rope wraps around corners. The game moves the hero with its own wall tests.

**Parameters chosen:** `range` = 120, `hookSpeed` = 720, `reelSpeed` = 70, `swingForce` = 240, `tighten` = 0.9, `jumpBoost` = 150, `releaseBoost` = 1.1, `carryMs` = 1100, `aimAssist` = 32, `mode` = hold, `wrap` = 1, `surfaces` = 1, `render` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once, after the level exists:* `grapple = GameDNA_Grapple.create({solid: (x, y) => the game's own wall test in WORLD px, tile: TILE, velUnit: 'step' (px per fixed step) | 'second', gravity: the game's gravity in the same units, scale: VIEW_H / 180, anchors: [3-6 rings {id, x, y} over pits and gaps], bounds: {x: 0, y: -200, w: LEVEL_W, h: LEVEL_H + 400}, drawRings: false, params: {range: 120, swingForce: 240, releaseBoost: 1.1, carryMs: 1100, mode: 'hold'}})`.
2. *Input:* A free key for the grapple (e.g. C): pressed this step and held; reel in / out on Up / Down if free, else two other free keys. Keep every existing key and touch zone.
3. *The start of the hero's per-step movement code:* `const r = grapple.update(STEP_MS, {fire, hold, jump: jumpPressed, push: right - left, reel}, hero)`; `if (r.active) { hero.vx = r.vx; hero.vy = r.vy; }` and skip the game's run acceleration, jump, jump cut and gravity this step; else run them as before, `if (r.flying) hero.vx = r.vx` after the air control and no jump cut. The game's own moveX / moveY run unchanged after.
4. *Draw, in the hero's camera space:* `grapple.drawRings(ctx, camX, camY)` before the hero, `grapple.draw(ctx, camX, camY, hero)` next to it (`0, 0` inside a camera translate).
5. *New run, respawn, life lost:* `grapple.reset()`; optional: `grapple.release()` when the hero is hurt.

**Common mistakes** (symptom -> fix):

- Hero falls away from the rope -> gravity or the run code still applied after `r.vx, r.vy`; skip them while `r.active`.
- Letting go drops straight down -> `r.flying` ignored, or the variable-jump cut clipped the upward speed.
- Hook bites air / rope drifts with the camera -> `solid` or rings in screen px, or the camera applied twice.
- The world swings around a still hero -> while `grapple.attached()`, ease the camera toward a mix of the anchor and the hero instead of locking it to the hero.
- Autoplay ends differently -> code outside the `r.active` / `r.flying` branches changed; the module is inert until the grapple key.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Grappling hook & swing] Fire at a ring: the hook flies, bites, the hero swings and pumps higher; let go: it flies on with the swing's speed; jump on the rope: a hop.
- [Grappling hook & swing] Hook rock under a corner: the rope bends around it; the hero never passes through walls; `?auto=1` ends as before; `?t=&freeze=1` is deterministic.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `grapple-swing.js` sha256 `b8eaef01efcf6548...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Grappling hook & swing] `update` once per fixed step at the start of the hero code, also during `?t=` fast-forward; never in draw.
- [Grappling hook & swing] World px for `solid`, rings and hero; the camera only in draw; `reset()` on every restart path.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
