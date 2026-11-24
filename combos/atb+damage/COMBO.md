# Add active-time gauge battle and bouncing damage numbers to my game

Add the 2 game elements below to MY existing game, which you have not seen. Each is a finished module file given with this prompt:

- `active-time-battle.js` (one global, `GameDNA_ATB`), API reference `active-time-battle.README.md`
- `damage-numbers.js` (one global, `GameDNA_DamageNumbers`), API reference `damage-numbers.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), smoothing off.
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame).
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Active-time gauge battle [systems], (2) Bouncing damage numbers [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Active-time gauge battle:** a list of combatants/units; a fixed 60 Hz update step; code that plays one action and reports when done; an enemy action chooser; a command menu for one hero; status effects (haste/slow).
- **Bouncing damage numbers:** the places where HP/MP change (hit frame); screen positions of targets; a world clock in ms that can pause; rectangles of UI to keep clear (optional).

## Element 1: Active-time gauge battle (`active-time-battle.js`, `GameDNA_ATB`)

Replaces fixed turn order: each combatant's gauge fills in real time by speed (haste x1.5, slow x0.5). A full hero gauge opens that hero's command menu; a full enemy gauge picks an action at once; actions play one at a time from one shared queue. Active mode: enemies keep acting while a menu is open. Wait mode: the battle clock stops while a menu is open (menu input still works). The module draws the gauges, enemy gauges and a mode plate.

**Parameters chosen:** `speed` = 1, `mode` = active, `spd1` = 32 (fallback only; the unit's own stat wins), `spd2` = 24, `spd3` = 44, `spd4` = 28, `status` = none, `enemyGauge` = on. (`party`, `res`: not used; your game keeps its own.)

**Where it goes** (by role; find these places in my game):

1. *Where a battle (or wave) starts, after its combatants exist:* `atb = GameDNA_ATB.create({mode: 'active', speed: 1, partyStatus: 'none', combatants, isAlive, onHeroReady, onMenuCancel, chooseEnemyAction, performAction, onBattleEnd})`, one per battle. `combatants`: `{id, side: 'party' | 'enemy', speed}` with your speed stat scaled to 10-60 (no stat: heroes 32, 24, 44, 28 by slot, enemies 18-46). `isAlive(id)` reads your HP/death state. `onHeroReady(id)` opens your command menu for that hero; `onMenuCancel` and `onBattleEnd` close it (your victory code still runs). `chooseEnemyAction(id)` returns your enemy AI's action (any shape, optional `target` id) or `null`. `performAction(action, done)` runs your code that plays one action, with the action object unchanged (keep its full target list), and calls `done()` once at its end.
2. *Where your game decides whose turn is next (round loop, turn counter, initiative list):* Stop calling it. Call `atb.update()` once per step as its own statement, after menu input and the animation step, never in an `else` branch. Then fix every reader of the old turn signal: an autopilot or test hook now acts when `onHeroReady` opens a menu and confirms through the same path as the player; variables such as "current actor" or "phase" are set in `onHeroReady` / `performAction` and cleared when the action ends, so nothing reads a stale one.
3. *Where your command menu confirms a choice:* Close the menu, then `atb.submit(heroId, action)` instead of playing it. Defend: keep your flag, then `atb.submit(heroId, {defend: true})`. Menu closed without a choice: `atb.menuClosed()`.
4. *Where your HUD draws each party member's row:* Keep everything the row already shows (HP bar, max HP, MP). If there is room, `L = atb.layoutRow({x, y, nameW, hpW, right})` gives a gauge rect that overlaps nothing; otherwise pick free space inside the panel (at least 40 px wide, 6 px tall, clear of every text). Draw with `atb.drawGauge(ctx, id, x, y, w, h)`. Never remove HUD info to make room.
5. *Your battle-field draw pass, after the sprites:* Enemy gauges on: `atb.drawEnemyGauges(ctx, enemies.map(e => ({id, x: centreX, footY})), fieldHeight)`. `atb.drawModePlate(ctx, 4, 4)` replaces any round/turn plate (returns `{w, h}`). An acting enemy gets a white sprite overlay at alpha `atb.flashAlpha(id)`.
6. *Your haste/slow effects and anything that ran "once per round" (poison, regen):* `atb.setStatus(id, 'haste' | 'slow' | null, seconds)`. Per-round effects run on the battle clock instead (e.g. every 300 steps where `atb.clockRuns()`).
7. *Mode switch (Active / Wait); keep both:* Hold the mode in a variable that survives restarts, start it from a `?mode=active|wait` URL parameter (default active), add a key not already used to toggle it, and call `atb.set({mode})` on change.

**Common mistakes** (symptom -> fix):

- Enemies freeze while a menu is open in Active mode -> the animation or `update()` sits behind `if (menu) ... else`; all three run every step.
- Wait mode softlocks -> menu input must not depend on `atb.clockRuns()`.
- A hero acts twice or the queue stalls -> call `done()` exactly once per action, misses included.
- Crash when the last enemy dies during a menu -> open menus only from `onHeroReady`; never pick from an empty target list.
- Autoplay loses or crashes after the change -> it still waits for the old turn signal or reads a "current actor" you no longer update; drive it from `onHeroReady`.
- A group attack hits one target twice -> you rewrote the action's targets; pass it through unchanged.
- No revive in v1: a dead combatant stays out until the next `create`. If your game revives, report it.

## Element 2: Bouncing damage numbers (`damage-numbers.js`, `GameDNA_DamageNumbers`)

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

## Cross-element wiring

**Bouncing damage numbers with Active-time gauge battle:**

- **hit sites:** Both sides' actions play through `performAction(action, done)`; the frame in that playback where HP drops is the one hit site (not at queueing, not at `done()`). Call `dn.spawn` there, after the HP/MP change, once per change.
- **hit-stop:** The freeze also skips your animation step and `atb.update()` (no gauge fill while frozen); menu input keeps running. `onHitStop(ms)` starts it; `dn.update(0)` meanwhile.
- **UI rects:** The mode plate is a UI rect `{x: 4, y: 4, w, h}` (store what `drawModePlate` returns); gauge rows sit in the HUD. Return them (no `id`) from `getObstacles()`; `bounds` ends above the HUD.
- **reset:** Battles start where you create the ATB instance. Call `dn.clear()` there, at the start, before refill or heal numbers spawn.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Active-time gauge battle] Active: a command menu is open while an enemy acts; gauges show three states (gold charging, flashing white ready, cyan queued).
- [Active-time gauge battle] Menu open 10 s: enemies act in Active; in Wait nothing fills, the plate turns violet with pause bars, confirming plays the command.
- [Active-time gauge battle] Victory/defeat closes the menu; the next battle starts with fresh gauges; the HUD still shows everything it showed before.
- [Active-time gauge battle] `?mode=wait` and the toggle key both reach Wait mode, also after a restart.
- [Bouncing damage numbers] A hit shows a white number above the target on the hit frame; digits pop in turn, bounce, hold, fade.
- [Bouncing damage numbers] Criticals (if any) gold with `CRITICAL`, flash, shake; heals green `+n`; `MISS`; `12 MP`; status words.
- [Bouncing damage numbers] Numbers never touch each other, sprites, banner or HUD; crowded multi-hits fold into one total.
- [combined] In one full exchange, every hit from both sides shows one number on its hit frame.
- [combined] Hit-stop freezes everything briefly; the number shows on the first frozen frame.
- [combined] No number covers the other element's plates, windows or HUD.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `active-time-battle.js` sha256 `77fff04a7f1041f7...`, `damage-numbers.js` sha256 `1c7b689771a5877b...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Active-time gauge battle] Trace one step with a menu open: menu input, the animation step and `atb.update()` all run.
- [Active-time gauge battle] Trace the last enemy dying during a menu: it closes and your victory code runs once.
- [Active-time gauge battle] One HUD row: the x ranges of name, HP, gauge and other text do not overlap, and nothing that was there before is gone.
- [Active-time gauge battle] Trace the game's autoplay through one hero turn (`onHeroReady` -> its choice -> `submit`) and one enemy action (`chooseEnemyAction` -> `performAction` -> `done`).
- [Bouncing damage numbers] List every HP/MP write and its `spawn`. Walk one hit: `dn.spawn` -> `onHitStop` sets the freeze -> `dn.update(0)` steps -> normal steps; `dn.draw` every frame.
- [Bouncing damage numbers] Identifiers inside `getAnchor`/`getObstacles` exist at the first spawn.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
