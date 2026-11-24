# Add Platformer movement feel to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `platformer-feel.js` (one global, `GameDNA_Platformer`), API reference `platformer-feel.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Platformer movement feel [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Platformer movement feel:** a tile map query tileAt(tx, ty) -> solid | oneway | empty, in world px tiles (hazards stay the game's); a fixed 60 Hz update step; the game's input per step: left, right, up, down, jump held, jump pressed since last step, dash held / pressed (latched: a 0 ms tap counts); the hero's hitbox size and start position; places that move the hero directly (respawn, knockback, enemy bounce) routed to reset / knock / bounce; optional: a free dash key.

## Element 1: Platformer movement feel (`platformer-feel.js`, `GameDNA_Platformer`)

Replaces the hero's movement and tile collision in a side-view game: separate ground and air acceleration, variable jump height (release to cut), coyote time, jump buffering, apex hang, a heavier fall with a terminal speed, an 8- or 4-way dash that refills on landing, wall slide and wall jump, one-way platforms, ceiling-corner and ledge-lip correction, and sub-pixel positions that always rest on whole pixels (no tunnelling at any speed). Presets: tight, floaty, heavy, raw. The game keeps its sprites, enemies, hazards, camera and rules; it feeds input each step and reads position, velocity, onGround, facing and pose back.

**Parameters chosen:** `preset` = tight, `runSpeed` = 96, `groundAccel` = 1100, `groundDecel` = 1500, `turnAccel` = 2200, `airAccel` = 760, `airDecel` = 260, `jumpHeight` = 44, `jumpApexMs` = 330, `jumpCut` = 0.45, `minJumpMs` = 50, `apexBand` = 36, `apexGravity` = 0.5, `fallMult` = 1.7, `maxFall` = 300, `coyoteMs` = 100, `bufferMs` = 120, `dash` = eight, `dashSpeed` = 270, `dashMs` = 150, `dashCooldownMs` = 250, `dashCount` = 1, `wall` = on, `wallSlide` = 60, `wallJumpX` = 120, `wallJumpLockMs` = 140, `corner` = 4, `ledge` = 4, `drop` = downjump.

**Where it goes** (by role; find these places in my game):

1. *Once, after the level and the hero exist:* `pf = GameDNA_Platformer.create({tile, body: {w, h} (the hero's hitbox), x, y (its top-left, world px), preset: 'tight', tileAt, params: {dash: 'eight', wall: 'on', coyoteMs: 100, bufferMs: 120, corner: 4, ledge: 4, runSpeed, jumpHeight, jumpApexMs, maxFall}})`. `tileAt(tx, ty)` = `'solid'` for wall/ground tiles, `'oneway'` for stand-on-top platforms, else `null`; outside the map answer as the old collision test did (side walls solid, below the map empty). Convert the game's old numbers so every level stays beatable: px per frame x 60 = px/s; old jump height = v² / (2g) in per-frame units; keep `jumpHeight` at least that.
2. *The fixed 60 Hz step, where the hero used to move (the step `?t=` fast-forward and autoplay run):* `pf.setInput({left, right, up, down, jump: <jump held>, jumpPressed: <jump pressed since the last step>, dash, dashPressed})` from the game's own input object (so autoplay and touch drive it), then `pf.update()`, then copy back `hero.x = pf.x; hero.y = pf.y; hero.onGround = pf.onGround` and velocities in the game's units (`pf.vx / 60`). Keep the rest of the hero update (attacks, timers, invulnerability, falling-out checks).
3. *Every place that moves the hero directly:* Knockback -> `pf.knock(vx, vy, ms)` (px/s); respawn, checkpoint, level start, restart -> `pf.reset(x, y)`; a bounce off an enemy -> `pf.bounce()`.
4. *The key bindings:* A dash key the game does not use yet (C or Shift); add it to the help text.
5. *The draw pass:* The hero sprite at `pf.x, pf.y` (whole px), frame from `pf.pose`; optionally `pf.drawFx(ctx, camX, camY)` after the sprites (dust, dash after-images).

**Common mistakes** (symptom -> fix):

- The hero sinks into the floor or jitters -> something else still writes `hero.x/y` or applies gravity after `pf.update()`; remove the old movement only, and route respawn / knockback through `reset` / `knock`.
- Autoplay falls into a pit it used to clear -> `jumpHeight` or `runSpeed` is lower than the old numbers, or the autoplay's held jump never reaches `jump` (only `jumpPressed`): pass both.
- Quick taps do nothing -> the game passes only "held" state; pass its latched press as `jumpPressed` (or use `pf.key`).
- The hero walks through a wall at the map edge -> `tileAt` returns empty outside the map; return `'solid'` there as the old test did.
- Enemies or the camera lag a frame or read NaN -> they read hero fields that are no longer updated; copy every field they use back from the module each step.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Platformer movement feel] Hold jump: a high arc; a tap: a short hop; run off a ledge and jump a few frames late: still a jump; press jump just before landing: it jumps on touch-down.
- [Platformer movement feel] Dash in 8 directions once per landing; push into a wall while falling: a slow slide; jump there: a kick away; a jump into a ceiling corner slides around it.
- [Platformer movement feel] `?auto=1` reaches the same ending as before; no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `platformer-feel.js` sha256 `156cfc8907fdfb25...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Platformer movement feel] Nothing writes the hero position after `pf.update()` except `pf.reset` / `teleport`; every reader of the hero fields gets them from the module each step.
- [Platformer movement feel] Trace the autoplay's gap jump with the new numbers: airtime x run speed > the widest gap; jump height > the highest step.
- [Platformer movement feel] Worked example: jumpHeight 44, jumpApexMs 330 -> gravity 808 px/s², take-off 267 px/s.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
