# Add Bouncing damage numbers to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `damage-numbers.js` (one global, `GameDNA_DamageNumbers`), API reference `damage-numbers.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Bouncing damage numbers [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Bouncing damage numbers:** the places where HP/MP change (hit frame); screen positions of targets; a world clock in ms that can pause; rectangles of UI to keep clear (optional).

## Element 1: Bouncing damage numbers (`damage-numbers.js`, `GameDNA_DamageNumbers`)

On the frame a hit lands, the amount pops above the target; digits bounce one after another, hold, fade. Damage, critical, heal (`+182`), miss, MP (`12 MP`) and status words each have their own look; numbers never overlap each other or sprites. Optional hit-stop freezes the world briefly; criticals also shake and flash.

**Parameters chosen:** `bounce` = 10, `duration` = 1000, `stagger` = 40, `hitstop` = 60, `scale` = 1, `scheme` = classic, `crit` = burst, `stack` = on, `outline` = 1, `dense` = auto.

**Where it goes** (by role; find these places in my game):

1. *Once, after your actors and the play-field size exist:* `dn = GameDNA_DamageNumbers.create({bounds, params: {bounce: 10, duration: 1000, stagger: 40, hitstop: 60, scale: 1, scheme: 'classic', crit: 'burst', stack: 'on', outline: 1}, getAnchor, getObstacles, onHitStop, onShake, onFlash})`. `bounds` = play field above the HUD, `{x, y, w, h}`. `getAnchor(id)` -> `{x, top, w, h}`: sprite centre x, sprite top (with hover), size; keep returning it while the unit is dying or dead (never `null` for HP 0: the module caches it, so killing-blow numbers stay above the unit); a lunging attacker returns its home spot. `getObstacles()` -> each living actor's sprite rect with `id` (also at its home spot if it moves) plus UI rects without `id`. `onHitStop(ms)` freezes your world; `onShake` / `onFlash` call your shake/flash or do nothing.
2. *Every place your game changes HP, MP or status (attacks, spells, items, drains, counters, poison ticks); ideally one shared function. Grep every write to HP and MP:* Right after each change: `dn.spawn(target.id, amount, kind)` with `amount` = the HP/MP actually lost or gained after clamping (an overkill shows the real drop), kind `damage | crit | heal | miss | mp | status` (status: `amount` is the word). Exactly once per change.
3. *Your fixed update step:* During the freeze: count it down, `dn.update(0)`, skip the world. Otherwise `dn.update(1000 / 60)`.
4. *Your draw pass:* `dn.draw(ctx)` after actors and hit effects, before banner and HUD, inside any shake translate.
5. *Where a battle, wave or scene STARTS, before anything spawns there (refills, heals):* `dn.clear()` (numbers spawned since the last `update` survive it).

**Common mistakes** (symptom -> fix):

- The number appears a few frames after the strike -> spawn at the impact, not when the attack starts or ends.
- Numbers freeze, then jump after a hit-stop -> pass `0` to `update` during the freeze and the real step otherwise.
- Numbers under the HUD or banner -> `bounds` ends above the HUD; banners are obstacles.
- Every hit shows two numbers -> `spawn` is called in the hit function and its caller.
- MP drains or item heals show nothing -> that change bypasses the hit function; spawn there too.
- Heals read "155+" -> pass kind `heal` and the plain amount; the module formats.
- Killing-blow numbers missing or at the field centre -> `getAnchor` returned `null` for a dead unit; keep returning its spot.
- Wave-clear refill numbers vanish at once -> `dn.clear()` ran after the refill spawns; call it at the start of the wave.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Bouncing damage numbers] A hit shows a white number above the target on the hit frame; digits pop in turn, bounce, hold, fade.
- [Bouncing damage numbers] Criticals (if any) gold with `CRITICAL`, flash, shake; heals green `+n`; `MISS`; `12 MP`; status words.
- [Bouncing damage numbers] Numbers never touch each other, sprites, banner or HUD; crowded multi-hits fold into one total.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `damage-numbers.js` sha256 `1c7b689771a5877b...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Bouncing damage numbers] List every HP/MP write and its `spawn`. Walk one hit: `dn.spawn` -> `onHitStop` sets the freeze -> `dn.update(0)` steps -> normal steps; `dn.draw` every frame.
- [Bouncing damage numbers] Identifiers inside `getAnchor`/`getObstacles` exist at the first spawn.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
