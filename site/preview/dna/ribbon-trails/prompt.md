# Add Ribbon trails to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `ribbon-trails.js` (one global, `GameDNA_Ribbons`), API reference `ribbon-trails.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Ribbon trails [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Ribbon trails:** a fixed update step that calls update(dt) once per step after movement (also run by ?t= fast-forward and ?auto=1), update(0) while frozen or paused; per ribbon a source: world position of the weapon tip (and hilt), body centre or projectile each step, or null while there is nothing to trail; a camera offset; a clear() call on restart, level start and every scene switch.

## Element 1: Ribbon trails (`ribbon-trails.js`, `GameDNA_Ribbons`)

Smooth tapered ribbons behind fast things: a sword swing leaves a swept crescent from hilt to tip, a dash or lunge a soft body-wide ribbon, each projectile a thin curved trail with a bright core, a floating wisp a faint wake. A curve through the recent positions, thinning and fading with age. Teleports, scene switches and gaps start a new strip, `update(0)` holds still, so nothing is drawn across the screen. Drawing only: positions, hit boxes and rules never change.

**Parameters chosen:** `life` = 220, `width` = 1, `taper` = 1.3, `fade` = 1.2, `glow` = 0.5, `smooth` = 4, `core` = on, `palette` = steel, `render` = auto, `contrast` = auto, `reduced` = system.

**Where it goes** (by role; find these places in my game):

1. *Once, after the game state exists (before the first draw):* `trails = GameDNA_Ribbons.create({scale: VIEW_H / 360, params: {life: 220, width: 1, taper: 1.3, fade: 1.2, core: 'on', glow: 0.5, smooth: 4, palette: 'steel', render: 'auto', reduced: 'system', contrast: 'auto'}})`.
2. *Weapon swings, dashes, lunges, knockback, projectiles: find where each moves and where its drawing computes the position:* `trails.follow(id, {kind, group, source})` for 2-5 sources. Blade: `kind: 'blade'`, source returns tip `x, y` and hilt `bx, by` from the same angle and length the draw code uses, `null` outside the swing. Dash / lunge / charging enemy: `kind: 'dash'` on the body centre (shows only at dash speed). Each projectile: `kind: 'projectile', once: true` with a unique id, created where the projectile is spawned. Floaters: `kind: 'wake'`. Sources return world px, or `null` while dead, gone, on the title or in another scene. Tie each id to ONE actor (look it up by its id inside the source, never "the nearest X"); `trails.remove(id)` when it dies for good or is replaced. A game whose attacks are only a sprite lunge or a menu "Attack" trails the weapon or body during that animation.
3. *Your fixed update step, after movement (every scene):* `trails.update(stepMs)` once; `trails.update(0)` while the world is frozen (hit-stop), paused or stopped by a dialogue or menu. Also: `if (scene !== lastScene) { lastScene = scene; trails.clear(); }`.
4. *Your draw pass, in each scene that has ribbons:* `trails.draw(ctx, camX, camY, 'under')` right before the sprites, `trails.draw(ctx, camX, camY, 'over')` right after them, inside the shake translate; HUD and windows after. Inside a camera translate pass `0, 0`. Depth-sorted games: give the hero's blade `layer: 'own'` and call `trails.draw(ctx, camX, camY, heroGroup)` right after the hero sprite.
5. *Where a new game, level or restart begins:* `trails.clear()`.

**Common mistakes** (symptom -> fix):

- One ribbon hops between actors or draws strips on two of them -> its source follows a slot ("nearest wisp"); one id per actor, `remove(id)` when it dies.
- A line across the screen right after a scene switch -> the old scene's strips drawn in the new scene's coordinates; `clear()` on every scene switch.
- The crescent floats beside the blade -> tip and hilt computed with a different pivot, angle or length than the drawn blade.
- A crescent from the idle pose to the swing start, or between swings -> the blade source must return `null` outside the swing.
- Ribbons slide with the camera -> screen px passed as the source in a scrolling game; pass world px and the camera to `draw`.
- Ribbons fade away under a pause menu or dialogue -> `update(0)` while the world is stopped.
- Ribbons missing or different in `?t=&freeze=1` shots -> `update` called from render; call it in the fixed step.
- Blurry ribbons on a pixel game -> `imageSmoothingEnabled` is true on the context; set it false or `render: 'pixel'`.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Ribbon trails] A swing leaves a smooth crescent along the blade's path that fades within `life`; no beads or seams.
- [Ribbon trails] Dashes leave a soft body-wide ribbon, projectiles thin cored curves; teleports, respawns, scene switches and restarts never draw a line across the screen; pause holds ribbons still.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `ribbon-trails.js` sha256 `4c06af100e9e4e2a...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Ribbon trails] `trails.update` runs once per fixed step after movement, `0` while frozen or paused; `clear()` on restart and every scene switch.
- [Ribbon trails] Every source returns world px of something that exists, or `null`; the blade source is `null` outside swings and matches the drawn blade.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
