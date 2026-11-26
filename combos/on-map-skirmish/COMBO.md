# Add on-map skirmish exchange to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `on-map-skirmish.js` (one global, `GameDNA_OnMapSkirmish`), API reference `on-map-skirmish.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) On-map skirmish exchange [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **On-map skirmish exchange:** the moment the game has confirmed a single-target attack and resolved it with its own rules: attacker and defender, each strike in order (who strikes, hit / miss / crit, damage) and both HP values after; each fighter's id, name, team, HP before, max HP and its sprite box on screen as drawn now (native px), optionally `boss: true`; the place where the game draws each unit (route it through drawActor so the lunge, flash, hurt pose and knock-back show), the other units' rects (getObstacles) and the HUD's rects (uiRects); a fixed update step and a place to pause the game's world, autoplay and input while busy() is true.

## Element 1: On-map skirmish exchange (`on-map-skirmish.js`, `GameDNA_OnMapSkirmish`)

When an attack is confirmed, the two map units fight where they stand: the attacker lunges 2-3 px toward the target (never into its tile), the hit spark lands on the target's near side, only the target flashes a solid white silhouette for 2-3 frames, then shows an opaque hurt pose and is knocked back 2 px, the damage number pops above its head clear of other units, a miss swishes past with MISS, the counter and a follow-up for the side 4+ speed faster play, both HP plates sit at the bottom (or top) of the screen and drain slowly, a boss braces in place, a knocked-out unit dissolves. Z skips, X toggles x2. The game passes the outcome; the module only stages it.

**Parameters chosen:** `speed` = 1, `lunge` = 3, `knock` = 2, `flash` = 3, `drain` = 520, `hold` = 420, `gap` = 4, `standoff` = 4, `plates` = bottom, `text` = auto, `keys` = on.

**Where it goes** (by role; find these places in my game):

1. *Once, at boot (before any fast-forward for screenshots):* `sk = GameDNA_OnMapSkirmish.create({view: <play area without the HUD>, params: {speed: 1, lunge: 3, knock: 2, flash: 3, drain: 520, hold: 420, gap: 4, standoff: 4, plates: 'bottom', text: 'auto', keys: 'on'}, getObstacles: () => <other units' sprite boxes {id, x, y, w, h}>, uiRects: () => <HUD rects>})`.
2. *Where a single-target attack is confirmed (the code that resolves it and starts its animation):* Resolve the exchange with the game's own code, unchanged in order and random calls, recording each strike `{by: 'att' | 'def', result: 'hit' | 'miss' | 'crit', dmg}` (`GameDNA_OnMapSkirmish.order({attSpd, defSpd, gap})` if the game has no counter / follow-up order). Put the HP back to the values before, then `sk.play({attacker, defender, strikes, after: {att, def}, onDone})` with each unit `{id, name, team: 'a' | 'b', hp (before), max, box (sprite box as drawn), boss?}`. In `onDone`, apply the HP and run what used to run when the attack animation ended. A game with a separate battle screen keeps its menu and turns but draws the map behind it and stages each round there.
3. *Where the game draws each unit:* `sk.drawActor(ctx, id, image, x, y, {native: <side the art looks at>, facing: <side outside fights>})` instead of drawImage; skip the unit's own fade when `sk.gone(id)`; hide the cursor and the unit's small HP bar while `sk.fighting(id)`.
4. *Your fixed step, first thing (also in the ?t= replay):* `if (sk.busy()) { a person's keys -> sk.key(k) (never autoplay's); sk.update(stepMs); return; }`.
5. *Your render, last:* `sk.draw(ctx)` after the HUD, outside any camera transform.
6. *Where a new game or battle starts:* `sk.clear()`.

**Common mistakes** (symptom -> fix):

- Units stand still and never flash -> the unit draw does not go through `drawActor`.
- `?auto=1` ends differently -> the exchange was resolved with extra or reordered random calls; resolve it exactly as the old code did.
- Every exchange is skipped at once -> autoplay's confirm key reaches `sk.key()`; forward only a person's keys.
- The bars drain while the map already shows the new HP -> restore HP before `play`, apply `after` in `onDone`.
- Numbers land on neighbours or plates cover units -> `getObstacles()` is empty or in another pixel space than `box`.
- A knocked-out unit fades twice -> skip the game's own fade when `sk.gone(id)`.
- Plates slide over the HUD -> `view` includes the HUD; pass the play area and the HUD in `uiRects()`.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [On-map skirmish exchange] Confirming an attack: the attacker lunges a few px toward its target, the spark sits on the near side, only the target flashes and steps back, the number equals the game's and covers no unit.
- [On-map skirmish exchange] A miss shows MISS and a swish; the counter and a follow-up play; the plates drain to what the map shows after the exchange; Z skips, X lights x2.
- [On-map skirmish exchange] `?auto=1` ends exactly as before; `?t=&freeze=1` stills inside an exchange show it mid-strike.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `on-map-skirmish.js` sha256 `ca347b746fec9cc9...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [On-map skirmish exchange] For one exchange: HP before minus the strikes' dmg per target (clamped at 0) equals `after`, which equals what `onDone` applies.
- [On-map skirmish exchange] Every unit draw passes through `drawActor`; while `busy()` the step returns early; autoplay inputs are not forwarded.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
