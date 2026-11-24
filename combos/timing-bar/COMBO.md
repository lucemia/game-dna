# Add timing-bar minigame to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `timing-bar.js` (one global, `GameDNA_TimingBar`), API reference `timing-bar.README.md`

README example names are placeholders.

## Where it goes in my game (my choice; follow it exactly)

- **Timing-bar minigame:** Put the skill check exactly at: opening a locked chest or door (a lockpick; on a miss it stays locked and can be retried). Do not add it anywhere else (no other action gets a bar).

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Timing-bar minigame [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Timing-bar minigame:** the moment that becomes a skill check (the `moment` parameter, named by the designer), in update logic (call start once; act on the result in onDone); the confirm input routed to the bar while busy() (press(), tap() or key(code, down)); a fixed 60 Hz update step; the play field size in native px, HUD excluded; rectangles of UI to keep clear (optional); optional: the game's autoplay flag.

## Element 1: Timing-bar minigame (`timing-bar.js`, `GameDNA_TimingBar`)

A skill-check overlay for the moments you name (pick a lock, a timed attack bonus, forging, reeling in): a window with a bar opens, a needle sweeps miss / good / great / perfect zones, one press stops it, a grade word pops, and the game gets `{grade, offset}` in `onDone`. While it is open (`busy()`) the confirm input goes to the bar and the world waits. Autoplay resolves it at a fixed grade, so `?auto=1` ends the same.

**Put the skill check exactly at: opening a locked chest or door (a lockpick; on a miss it stays locked and can be retried). Do not add it anywhere else (no other action gets a bar).**

**Parameters chosen:** `difficulty` = normal, `speed` = 1.1, `good` = 0.3, `great` = 0.14, `perfect` = 0.05, `motion` = pingpong, `ease` = none, `hits` = 1, `zones` = random, `assist` = off, `width` = 160, `position` = center, `dim` = 0.3, `shake` = on, `autoGrade` = good.

**Where it goes** (by role; find these places in my game):

1. *Once, after the screen size and HUD layout exist:* `check = GameDNA_TimingBar.create({bounds, seed: 7, params: {difficulty: 'normal', hits: 1, motion: 'pingpong', ease: 'none', zones: 'random', assist: 'off', width: 160, position: 'center', dim: 0.3, shake: 'on', autoGrade: 'good'}, autoplay: () => <autoplay flag>, getObstacles, onShake})`. `bounds` = play field `{x, y, w, h}` with the HUD excluded; `getObstacles()` returns HUD, menus and dialog boxes WITHOUT `id` (never covered) and sprites with `id` (avoided when cheap). The seed is the module's own: never pass or call the game's RNG.
2. *The moment named above, in update logic: the ONE function every caller of it reaches (player input, autopilot, tap handler, debug key). Grep all its callers:* `if (!check.busy()) check.start({label, hint, anchor: {x: <centre>, y: <top>, w, h}, onDone: r => { ... }})`. Move the action's original effect into `onDone` (synchronous; never `await` the returned promise for game logic). A miss must leave the object usable for a retry. A grade that changes a number multiplies the existing roll (perfect 1.5, great 1.25, good 1.0, miss 0.75); never add or skip a roll.
3. *Top of your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call):* `if (check.busy()) { if (<confirm pressed this step, from the player>) check.press(); check.update(1000 / 60); return; }` so the world, timers and the action wait; pause/restart keys stay outside the gate. When not busy: `check.update(1000 / 60)` once per step.
4. *Your draw pass:* `check.draw(ctx)` last, after the HUD, outside any shake translate.
5. *New game / restart:* `check.clear()` first.

**Common mistakes** (symptom -> fix):

- The bar stops the moment it opens -> the game re-sends a held confirm every frame; route the key-down edge only (presses in the first 240 ms are ignored).
- Quick taps are ignored -> `press()` on the key-down edge (it is latched until the next `update`), not "is the key down now".
- The world keeps moving under the bar (enemies reach the hero, gauges fill) -> gate the whole step on `busy()`.
- `?t=&freeze=1` frames differ or autoplay hangs on the bar -> game logic after `await`; use `onDone`, and `update` inside the fixed step.
- Autoplay ends differently -> autoplay must resolve at a fixed grade (`autoplay` option + `autoGrade: good`); a bonus multiplies the existing roll, never re-rolls.
- The check opens twice / its result is lost -> `start()` runs every frame while the action condition holds; guard with `busy()` and start once.
- Some callers skip the check (autopilot or tap path calls the old effect directly) -> start in the function they all share.
- Title shows `?` -> pixel16 UI font: letters, digits, `- . / ?` only.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Timing-bar minigame] opening a locked chest or door (a lockpick; on a miss it stays locked and can be retried) opens the bar, and nothing else does; Z / Space / tap stops the needle; the grade word pops; the game acts on the grade; a miss allows a retry.
- [Timing-bar minigame] A one-frame tap counts; a held key does not re-trigger; other keys still work while the bar is up; the world is paused under it.
- [Timing-bar minigame] `?t=<ms>&freeze=1` gives the same bar frame every time; `?auto=1` ends with the same result (and numbers) as before, no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `timing-bar.js` sha256 `531833bdb0e2d22d...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Timing-bar minigame] Grep `start(`: only at the action, guarded by `busy()`, in update logic; list every caller of that action and confirm each reaches it.
- [Timing-bar minigame] Grep `update(`: every fixed step including while busy; the freeze loop calls that step. Same number of RNG calls with and without the check.
- [Timing-bar minigame] Walk one autoplay check: `start` -> 0.24 s still -> needle reaches the `good` zone -> 0.65 s hold -> `onDone({grade: 'good'})` -> the old effect, same numbers.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
