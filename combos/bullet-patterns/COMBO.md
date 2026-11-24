# Add bullet-pattern emitter to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `bullet-patterns.js` (one global, `GameDNA_Bullets`), API reference `bullet-patterns.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Bullet-pattern emitter [rules].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Bullet-pattern emitter:** a fixed update step that calls update(dt) once per step after movement (also run by ?t= fast-forward and ?auto=1), update(0) while paused, in hit-stop or behind a window; the player's small hit circle in world px (player(): {x, y, r} or null), and canHit() for invulnerability; the game's own damage function, called from onHit(hit); per caster an id and a source (world px, or null when dead / off-scene); enemy death to cancel and stop it; a camera offset.

## Element 1: Bullet-pattern emitter (`bullet-patterns.js`, `GameDNA_Bullets`)

Enemies cast bullet patterns described as data (fans, aimed bursts, rings, spirals, flowers, waves, curtains with a moving gap, orbs that split into rings), pooled, drawn in code with bright cores, coloured rims, dark outlines and soft halos, hitting with a circle much smaller than they look; grazes, walls, bullet cancel when the caster dies. Damage goes through the game's own damage function.

**Parameters chosen:** `speed` = 1, `density` = 1, `size` = 1, `hitbox` = 0.4, `halo` = 0.6, `graze` = on, `palette` = arcane, `render` = auto, `damage` = 2, `clearRadius` = 0.

**Where it goes** (by role; find these places in my game):

1. *Once, after the game state exists (before the first draw):* `bullets = GameDNA_Bullets.create({seed: 1, scale: VIEW_H / 360, params: {speed: 1, density: 1, size: 1, hitbox: 0.4, halo: 0.6, graze: 'on', palette: 'arcane', render: 'auto', damage: 2}, bounds: {x: 0, y: 0, w: WORLD_W, h: WORLD_H}, player: () => inScene && alive ? {x, y, r: 3} : null, canHit: () => !invulnerable && !windowOpen, onHit: (hit) => gameDamage(player, hit.damage), solid: (x, y) => wallAt(x, y)})`. `player()` is the small hit circle on the body in world px.
2. *Where each enemy spawns (once, not every frame):* `bullets.emit(enemy.id, {pattern, every, range, source: () => enemy alive and in this scene ? {x, y} : null})`: weak enemies a small `fan` or `aimed`, a boss `cycle: ['spiral', 'flower', 'ring']`; `range` about half the view. Where it dies or is removed: `bullets.cancel(id); bullets.stop(id)`.
3. *Your fixed update step, after movement:* `bullets.update(stepMs)`; `bullets.update(0)` while paused, in hit-stop or while a dialogue or menu stops the world. Also: `if (scene !== lastScene) { lastScene = scene; bullets.clear(); }`.
4. *Your draw pass, after the sprites, before the HUD:* `bullets.draw(ctx, camX, camY)` (`0, 0` inside a camera translate).
5. *Where a new game, level or restart begins:* `bullets.clear()`.

**Common mistakes** (symptom -> fix):

- Bullets hit beside the player -> `player()` in screen px or the sprite corner; world px of the body centre.
- The screen floods -> `emit`/`fire` called every frame; once per caster.
- HP drops twice or the death screen is skipped -> damage written directly; call the game's damage function in `onHit`.
- A dead enemy keeps shooting -> its source must return `null`; `cancel` + `stop` on death.
- Bullets move under a pause menu -> `update(0)` while the world is stopped.
- Autoplay now dies -> damage too high or range too long; never change the bot's route.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Bullet-pattern emitter] Enemies cast readable patterns; grazing is safe, a direct hit costs `2` through the game's damage rule; walls stop bullets; a dead caster's bullets fade.
- [Bullet-pattern emitter] `?auto=1` still reaches its ending with no errors; `?t=&freeze=1` is deterministic; restart and scene switches leave no bullets.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `bullet-patterns.js` sha256 `1a5eef631d087631...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Bullet-pattern emitter] `bullets.update` once per fixed step after movement, `0` while stopped; `clear()` on restart and scene switches.
- [Bullet-pattern emitter] `player()` world px of a few-px circle or `null`; `onHit` calls the damage function; one `emit` per caster.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
