# Add modern damage numbers to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `damage-pop.js` (one global, `GameDNA_DamagePop`), API reference `damage-pop.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Modern damage numbers [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Modern damage numbers:** the places where HP/MP change (hit frame); screen positions of targets; a world clock in ms that can pause; rectangles of UI to keep clear (optional).

## Element 1: Modern damage numbers (`damage-pop.js`, `GameDNA_DamagePop`)

On the frame a hit lands, its amount arcs out of the target and lands above it; crits pop big with a burst and a short shake; rapid hits of one type on one target roll into one total that punches on each add (12 -> 47 -> 83); each damage type has a colour and a small icon (fire, ice, shock, poison, arcane, heal, shield, mana; physical is plain white); misses and blocks are small words. Big numbers stay on top; nothing lands on another unit, its HP bar, UI rects or another number. Smooth on HD canvases, crisp 1-bit on native pixel canvases.

**Parameters chosen:** `size` = 0, `duration` = 1100, `arc` = 1, `punch` = 0.6, `merge` = 600, `hitstop` = 50, `palette` = vivid, `icons` = on, `crit` = burst, `render` = auto, `stack` = on.

**Where it goes** (by role; find these places in my game):

1. *Once, after your units and the play-field size exist, before the first hit:* `dp = GameDNA_DamagePop.create({bounds, params: {size: 0, duration: 1100, arc: 1, punch: 0.6, merge: 600, hitstop: 50, palette: 'vivid', icons: 'on', crit: 'burst', render: 'auto', stack: 'on'}, getAnchor, getObstacles, onHitStop, onShake, onFlash})`. `bounds` = play field above the HUD in logical canvas px. `getAnchor(id)` -> `{x, top, w, h}`: sprite centre x, top of what is drawn above the head (hover, HP bar), size; keep answering for dead units; a lunging attacker returns its home spot. `getObstacles()` -> each living unit's sprite rect with `id` (also at its home spot if it moves), HP bars with the unit's `id`, every HUD window, banner and message box without `id`. Scrolling games: screen px (world minus camera) everywhere. `onHitStop` / `onShake` / `onFlash`: your freeze / shake / flash, or nothing.
2. *Every place your game changes HP, MP or a status (attacks, spells, items, ticks, level-up heals, refills, hits on the player). Grep every write to HP and MP:* Right after each change, once: `dp.spawn(target.id, realChange, kind, {type, crit})`; `realChange` = the change after clamping. Kinds `damage | crit | heal | shield | mp | miss | block | dodge | status` (status: the word as amount); types `physical | fire | ice | shock | poison | arcane | heal | shield | mana` (map yours to the nearest). Mana restored: `spawn(id, gain, 'heal', {type: 'mana'})`.
3. *Your fixed update step (every scene, so numbers finish fading):* `dp.update(stepMs)`; `dp.update(0)` while the world is frozen (hit-stop) or paused by a window.
4. *Your draw pass, after actors and hit effects, before banner and HUD:* `dp.draw(ctx)` once per frame in screen coordinates (inside a camera translate: `dp.draw(ctx, camX, camY)`), inside any shake translate. Never clip, proxy or filter its drawing: placement already avoids every rect in `getObstacles()`.
5. *Where a battle, wave, level or new game STARTS, before anything spawns there:* `dp.clear()` (numbers spawned since the last `update` survive it).

**Common mistakes** (symptom -> fix):

- Each hit shows two numbers -> the game's own (or E-01's) numbers are still drawn; this module replaces them.
- Rapid hits never merge -> they use different `type`s or kinds, or are further apart than `merge`; pass one type per attack.
- A total jumps instead of rolling -> spawn each hit's amount, not the running total.
- Numbers on a neighbour's HP bar or head -> `getObstacles()` lacks that unit, its `id`, or its HP bar rect.
- Numbers smeared on a native pixel game drawn into a larger backing store -> `render: 'crisp'`.
- Kill numbers missing or at the field centre -> `getAnchor` returned `null` for the dead unit.
- Numbers missing in `?t=&freeze=1` shots, or jumping after hit-stop -> advance only through `update` (0 while frozen), never on wall-clock time.
- Numbers slide over the HUD in a scrolling game -> mixed world and screen coordinates.
- Numbers cut off or missing although `dp.lastDrawn()` lists them -> the game clips (evenodd around obstacles), proxies or filters `dp.draw`; draw it once, unclipped.
- Wave-refill heals pile into one strip above the party -> they were spawned under the WAVE banner; spawn them when the banner ends.
- `MISS` on the player with no enemy near, or `+0` heals -> spawn `miss` only for an attack aimed at a unit; skip changes of 0.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Modern damage numbers] A hit shows its number on the hit frame, arcing up and landing above the target, then fading.
- [Modern damage numbers] Three quick hits of one type on one target show one rolling total that punches on each add; a crit is bigger with a burst; heals green `+n`; `MISS` / `BLOCK` as small words; type colours and icons.
- [Modern damage numbers] No number touches another unit, its HP bar, a window, a banner or another number; big numbers are never covered by small ones.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `damage-pop.js` sha256 `a605a213fceb55b2...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Modern damage numbers] List every HP/MP write and the `dp.spawn` after it (no hit spawns twice; refills, level-up heals and item uses included).
- [Modern damage numbers] Walk one hit: impact -> HP change -> `dp.spawn` -> `dp.update` each step (0 while frozen) -> `dp.draw` each frame; `getAnchor` answers for dead units.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
