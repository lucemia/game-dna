# Add auto-resolved squad clash with forecast to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `squad-clash.js` (one global, `GameDNA_SquadClash`), API reference `squad-clash.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Auto-resolved squad clash with forecast [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Auto-resolved squad clash with forecast:** two squads of up to six units: id, name, row and column (or slot 0-5, or an A-12 squad), hp, maxHp, atk, def, mag, res, spd, skills; per-unit ordered tactic rules (condition -> skill), or a class preset (A-13 rule sets accepted); a fixed 60 Hz update step; a moment before the fight to show the forecast and a confirm to commit; optional: skill table, guard / follow-up traits, tags (flying, armored), backdrop, own sprites, A-12 row rules and A-13 evaluator through adapters.

## Element 1: Auto-resolved squad clash with forecast (`squad-clash.js`, `GameDNA_SquadClash`)

Replaces how a fight between two groups is resolved with an auto-resolved squad clash: each side is a 2x3 grid (front row takes melee, back row is safe from melee while the front stands but takes x1.25 from ranged and magic); every unit acts once per round in speed order by its own ordered "condition -> action" tactic rules; guards step in for weak or back-row allies; allies follow up attacks; crits come from a seeded stream. Before the fight a forecast shows each unit's HP after, who falls and win / lose / draw, from the same simulation; on commit the clash plays out by itself in a staged side view (dash, swing, arrows, spells, guard shield, follow-up tag, hit numbers, turn-order strip, a "why" readout, result banner) and ends exactly as forecast.

**Parameters chosen:** `rounds` = 3, `speed` = 1, `crit` = 0.08, `guard` = on, `followUps` = on, `margin` = 0.1, `forecast` = bars, `numbers` = on.

**Where it goes** (by role; find these places in my game):

1. *How your fight maps onto it (decide before coding):* Each side of an encounter becomes a squad of at most 6 units `{id, name, cls, row: 'front'|'back', col: 0-2, hp, maxHp, atk, def, mag, res, spd, skills, rules, tags, guard, followUp, src}` built from your own stats (keep a reference to your object in `src`). Melee fighters front, archers / casters / healers back. Attacks become skills (`melee`, `ranged`, `magic` with `area: 'row'` for group spells, `heal`); your AI or class becomes a rule list (`[{if: 'allyHpBelow', value: 50, use: 'mend'}, {if: 'always', use: 'strike'}]`; `GameDNA_SquadClash.PRESETS` has ready lists per class). `cls` picks a built-in look (knight, lancer, archer, mage, cleric, rogue, brigand, slinger, ironclad, hexer, mender, warlord, hound, raptor), or draw your own sprites with `drawUnit`.
2. *Once, where your battle screen starts:* `clash = GameDNA_SquadClash.create({view: {x: 0, y: 0, w, h} (your logical canvas), seed, params: {rounds: 3, speed: 1, crit: 0.08, guard: 'on', followUps: 'on', margin: 0.1, forecast: 'bars', numbers: 'on'}, drawBackground: (ctx, view, t) => <your backdrop>, onHit: ev => <your hit feedback>, onEnd: (result, outcome) => <your victory / defeat / retreat code, once>})`, then `clash.setSquads(yourSquad, foeSquad)`.
3. *Before the fight (your command or preparation phase):* Show `clash.forecast()`: `clash.drawForecast(ctx, rect)` and the striped HP bars. Let the player move units between slots and change rules if your game allows it; call `clash.forecast()` again after each change. A confirm key calls `clash.commit()`. Under autoplay, commit after a short pause (or try swaps and keep the best forecast).
4. *Your fixed step (every loop that steps the game, fast-forwards included):* `clash.update(stepMs)` once per step, `0` while your world is frozen; never behind a menu or animation check.
5. *Where your battle screen is drawn:* Replace drawing the combatants with `clash.drawScene(ctx)`, then your effects, then `clash.drawUI(ctx)`; keep your HUD, title and result screens after it.
6. *Where the fight ends:* In `onEnd(result, outcome)`: HP is already written on the units; copy it back to your objects (`src`), run your existing win / lose code exactly once, set any phase your other code and tests read. `outcome.match` says the clash equalled its forecast.

**Common mistakes** (symptom -> fix):

- The clash differs from the forecast (banner: "differs") -> something changed HP, stats or rules between `forecast()` and the end (your own damage code still running, an `onHit` that edits HP, units rebuilt mid-clash). Let the module own HP during the clash.
- Forecast stuck on an old result -> you edited units but did not call `forecast()` again; it is cached by the units' values, so call it after every change.
- Nothing happens after commit -> `update()` is skipped while a menu or animation runs; call it every step.
- Your old turn loop still runs and both act -> stop calling your round function during a clash (keep the function).
- Back-row units never get hit by melee and fights stall into draws -> give each side some ranged or magic, or raise `rounds`.
- Different result every reload -> pass a fixed `seed` per encounter; never use `Math.random` in rules, conditions or hooks.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Auto-resolved squad clash with forecast] Before the fight a forecast shows win / lose / draw, each unit's predicted HP loss (striped) and a skull on units that will fall; moving a unit or changing its rules changes it at once.
- [Auto-resolved squad clash with forecast] After commit the clash plays by itself: a turn-order strip, a why readout per action ("Rule 1: Ally HP < 60% -> Mend"), a guard stepping in with GUARD!, a FOLLOW-UP, numbers on hit frames; the banner says "Played exactly as forecast".
- [Auto-resolved squad clash with forecast] Your autoplay still finishes the whole game and ends the same way as before; restart and title still work.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `squad-clash.js` sha256 `0cb913d688433804...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Auto-resolved squad clash with forecast] Trace one fight: setSquads -> forecast (shown) -> commit -> update each step -> onHit per hit -> onEnd once -> your next screen.
- [Auto-resolved squad clash with forecast] Grep every place your game changes HP during a fight: none may run between commit and onEnd.
- [Auto-resolved squad clash with forecast] Walk one hit: atk 14, power 100, def 6 -> 14 x 1.5 - 6 x 0.75 = 16.5 -> 17; the same def-6 target in the back row hit by a 90-power ranged attack at atk 13: 13 x 0.9 x 1.5 - 4.5 = 13.05, x1.25 -> 16.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
