# Add Combat forecast window to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `combat-forecast.js` (one global, `GameDNA_CombatForecast`), API reference `combat-forecast.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), and keep my game's own image-smoothing setting (off for pixel art, on for smooth or HD games; never switch it).
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame). Turn/phase logic stays mine; modules still update every step to animate.
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Combat forecast window [ui].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Combat forecast window:** the target-select step: which unit attacks which, while the player is choosing (before confirm); the game's own forecast numbers per pair: damage (number or range), hit %, crit %, strikes (x2), advantage, counter {damage, hit, crit, strikes} or none; both units' screen rects, HP and max HP, team (player / enemy / neutral), optional weapon name; a fixed update step (ms) and the screen area above the HUD (native px); optional: the cursor rect and other rects to avoid (sprites with ids, HUD and windows without).

## Element 1: Combat forecast window (`combat-forecast.js`, `GameDNA_CombatForecast`)

While the player is choosing whom to attack (before confirming), a two-sided window shows the GAME'S OWN forecast: both units' HP now -> after, damage, hit and critical chances (rows only when the game has them), the counter (or `--` when the target cannot strike back), an x2 badge for double strikes and up/down arrows for weapon or type advantage, in team colours. It updates live when the target or weapon changes and is placed so it never covers the two units, the cursor or the HUD. The module never computes rules: the game supplies every number.

**Parameters chosen:** `open` = 6, `slide` = 80, `place` = corner, `rows` = auto, `bars` = on, `blink` = 320, `sides` = attacker, `margin` = 3.

**Where it goes** (by role; find these places in my game):

1. *Once, at boot, after the canvas and your units exist (before the first update and before any fast-forward for screenshots):* `fc = GameDNA_CombatForecast.create({view: {x: 0, y: 0, w: <native width>, h: <height above the HUD>}, getObstacles, getCursor, params: {open: 6, slide: 80, place: 'corner', rows: 'auto', bars: 'on', blink: 320, sides: 'attacker', margin: 3}})`. `getObstacles()` returns, in SCREEN pixels after the camera offset, each living unit's drawn box `{x, y, w, h, id}` plus HUD panels and other windows `{x, y, w, h}` (no id); it always returns an array. `getCursor()` returns the map cursor's rect, or `null` when it is hidden.
2. *Your existing attack preview / target choice: find where your game knows "this unit would attack that unit" before the confirm (target picker, cursor over an enemy in attack range, the attack menu):* In your fixed step, every step: when that state is on, `fc.show(att, def, data)`, else `fc.hide()`. `att` / `def` = `{id, name, team: 'a' (player) | 'b' (enemy) | 'n', hp, max, rect: <drawn box, screen px>, weapon?}`. `data` is computed by YOUR rules, the same functions your attack uses: `{dmg (number or [min, max]), hit, crit (omit what your game lacks), hits (2 = strikes twice), adv (1 / 0 / -1), counter: {dmg, hit, crit, hits} or null when the target cannot strike back}`. Never invent a formula your game does not have.
3. *Your fixed update step (every scene):* `fc.update(1000 / 60)` once per step, after the `show`/`hide` above.
4. *Your draw pass:* `fc.draw(ctx)` after the map, units and HUD, before full-screen banners, outside any screen-shake translate. If your game already draws a forecast / preview box, delete only its drawing (keep the numbers it computed: they become `data`).
5. *Anything else that places windows or pop-ups:* Give them `fc.rect()` (the open window, or `null`) as a rect to avoid.

**Common mistakes** (symptom -> fix):

- The window shows `--` everywhere -> `data` is missing; pass your numbers (or a `forecast` callback in `create`).
- The window flickers open/closed -> `show` is called from one place and `hide` from another in the same step; decide once per step.
- The window covers the target or the cursor -> the unit `rect`s or `getCursor()` are in world instead of screen pixels, or missing.
- Numbers disagree with the result -> `data` was computed by a new formula; call the game's own damage / hit code.
- The window opens at full size only in screenshots, or is a thin bar -> `show` is called only from the render; call it in the fixed step.
- Autoplay or `?t=&freeze=1` broke -> the integration changed the target-choice code path; only add calls next to it.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Combat forecast window] Aiming at an enemy shows the window before the confirm: both names in team colours, HP now -> after, damage (x2 when it strikes twice), hit and crit when the game has them, the counter or `--`.
- [Combat forecast window] Moving to another target or switching weapons updates the numbers at once (changed values flash); confirming or cancelling closes it.
- [Combat forecast window] It never covers the attacker, the target, the cursor or the HUD; with the two units at a screen edge it moves to the other side.
- [Combat forecast window] Autoplay (`?auto=1` or the game's own) reaches the same end as before; `?t=...&freeze=1` shots show a settled window.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `combat-forecast.js` sha256 `bdabae99da8eeaee...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Combat forecast window] Name the state that means "aiming before confirm" and show the one place that calls `show` / `hide` each step.
- [Combat forecast window] Walk one preview by hand: the numbers in `data` equal what your attack code will apply for that pair (or its min/max range).
- [Combat forecast window] `fc.update` once per step, `fc.draw` once per frame after the HUD; the old preview drawing is gone, its numbers kept.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
