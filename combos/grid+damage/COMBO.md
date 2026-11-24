# Add grid movement range + path arrow and bouncing damage numbers to my game

Add the 2 game elements below to MY existing game, which you have not seen. Each is a finished module file given with this prompt:

- `grid-range-path.js` (one global, `GameDNA_GridRange`), API reference `grid-range-path.README.md`
- `damage-numbers.js` (one global, `GameDNA_DamageNumbers`), API reference `damage-numbers.README.md`

README example names are placeholders.

## Shared premises

1. **Include each module file verbatim; never edit it.** Load it with its own `<script src>` before the game's script, or paste it unchanged into its own `<script>` tag. If a module seems to need a change, adapt my game around it and tell me.
2. **Resolution:** keep my game's native resolution and integer scaling as they are. Call module draw functions on my 2D context inside the same transform as my sprites (one module pixel = one game pixel), smoothing off.
3. **Time:** drive every module from one fixed 60 Hz step (1000 / 60 ms). If my loop uses variable delta time, accumulate it and run whole steps (at most 250 ms per frame). Turn/phase logic stays mine; modules still update every step to animate.
4. **Coordinates:** native screen pixels (world minus camera) unless a section says tiles.
5. **Art and names:** anything new you draw or name is original (no real game, character, place or brand names); English UI text; do not restyle my game.
6. **Hook, don't replace:** add calls or change bodies; never delete or rename a function.
7. **Keep every other caller working.** Find every caller and reader of what you change (turn order, input, moves, menus, HUD): autopilot/AI, test hooks, URL parameters such as `?auto=1`, `?t=` and `?freeze=1`, keyboard shortcuts, end-turn buttons. Update each one. My game's own autoplay must still finish a whole game. Keep existing HUD info (HP bars, max HP) and existing commands.

## Order of work

1. **Read the game first.** Write down (file, function) where these live: loop/update step; draw pass and its order (background, actors, effects, HUD); input; where damage/HP changes are applied; where turns, actions or selections are chosen and played; HUD windows and their rects; camera; battle/scene start and end; and every caller from premise 7.
2. **Check the prerequisites** below against those notes. If one is missing, add the smallest working version and tell me.
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Grid movement range + path arrow [systems], (2) Bouncing damage numbers [effects].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Grid movement range + path arrow:** a tile grid; terrain per tile; a list of combatants/units; input (directions, confirm, cancel, pointer); a camera offset; a fixed 60 Hz update step.
- **Bouncing damage numbers:** the places where HP/MP change (hit frame); screen positions of targets; a world clock in ms that can pause; rectangles of UI to keep clear (optional).

## Element 1: Grid movement range + path arrow (`grid-range-path.js`, `GameDNA_GridRange`)

Selecting a unit on a tile map shows the tiles it can reach (blue, terrain costs; enemies block, allies pass) and the tiles it could strike after moving (red). An arrow follows the cursor along the path; confirm walks the unit tile by tile, then a command window (your commands plus BACK) acts or undoes the move. The module draws the cursor and the terrain, unit and command windows too.

**Parameters chosen:** `move` = 5 (fallback only; the unit's own stat wins), `range` = 1 (fallback only; the unit's own stat wins), `costs` = on, `overlay` = pulsing, `repeat` = normal. (`res`: not used; your game keeps its own.)

**Where it goes** (by role; find these places in my game):

1. *After your map and units exist, before the first frame:* `gr = GameDNA_GridRange.create({cols, rows, tile, params: {move: 5, range: '1', costs: 'on', overlay: 'pulsing', repeat: 'normal'}, cost, occupant, terrain, posOf, setUnitPos, moveOf, rangeOf, commands, onCommand, canSelect, enabled, view, getCursor, onCursor, drawPortrait})`. `tile` = tile size in px. `cost(x, y, unit)` = move cost (99+ impassable). `occupant(x, y)` = unit or `null`. `terrain(x, y)` = `{name, def, avo}` (0 for stats you lack). `posOf(unit)` -> `{x, y}` tile; `setUnitPos(unit, x, y)` moves it. **`moveOf(unit)` / `rangeOf(unit)` return the unit's own move and weapon range** from your stats, exactly what your rules and AI use. `canSelect(unit)` = player side, not yet acted. `enabled()` = true only while a human gives orders. `view` = `{w, h, ox, oy}` map viewport in the canvas. `getCursor`/`onCursor` sync your cursor; `drawPortrait(ctx, unit, x, y, t)` draws the unit in its window. Units without `side`/`name`/`hp`/`maxHp`: add `isEnemy`, `team`, `unitInfo`.
2. *Your after-move command step (attack, item, wait...):* `commands(unit)` -> your existing commands as `[{id, label, enabled}]` plus `{id: 'back', label: 'Back'}`; `onCommand(id, unit, from, path)` runs your existing handler for that command with everything it expects set (selected unit, origin, targets), exactly as your own flow would. Return `'keep'` to leave the menu open. Never drop a command your game had.
3. *Your fixed 60 Hz step:* `gr.update()` first, before your own logic.
4. *Your map draw pass:* ground -> `gr.drawUnder(ctx, cam)` -> units -> effects -> HUD -> `gr.drawOver(ctx, cam, hudRects)` last (`hudRects` = HUD rects its windows avoid). A unit's draw position is `gr.drawPos(unit)` (world px) when not `null`. Turn off your own map cursor.
5. *Your input handlers:* keydown: `if (gr.key(e.code, true, e.repeat)) e.preventDefault(); else <your existing key handling>`; keyup: `gr.key(e.code, false)`. It returns true only for keys it used, so your shortcuts (end turn, menus) keep running. Pointer -> tile (with camera): `gr.hover`, `gr.click`, `gr.cancel`. Keep your end-turn button and key.
6. *Your autopilot / AI and anything that moves units without the player:* Keep its own movement code; `enabled()` is false while it runs. It may read `gr.reachOf(unit)` / `gr.pathTo(unit, x, y)`; it never calls `confirm`/`click`. It must still finish a whole game.

**Common mistakes** (symptom -> fix):

- Autoplay stalls or units only wait -> the AI was routed through the interactive module, or `moveOf` is smaller than the move the AI plans with; use the unit's own stat and keep the AI's code path.
- The attack after moving crashes or is missing -> `onCommand` must set up everything your attack handler reads; never replace your commands with WAIT only.
- End turn dead -> your key handler must still run when `gr.key` returns false; buttons keep their handlers.
- Old overlay at the next turn -> `enabled()` turns false at phase and battle end.

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

**Bouncing damage numbers with Grid movement range + path arrow:**

- **hit sites:** The grid only moves units, it never applies damage: the hit sites are your own attack code (reached from `onCommand`, autoplay and the enemy phase). Call `dn.spawn` there, after the HP/MP change, once per change.
- **hit-stop:** The freeze also skips `gr.update()` and your attack animation. `onHitStop(ms)` starts it; `dn.update(0)` meanwhile.
- **UI rects:** The grid's windows are `gr.getUIRects()` (last `drawOver`); draw effects before `drawOver`; give your HUD rects to both. Return them (no `id`) from `getObstacles()`; `bounds` ends above the HUD.
- **anchors:** Tile to screen: x = `tile.x * T - cam.x + T / 2`, top = `tile.y * T - cam.y - rise` (sprite height above its tile); while walking, `gr.drawPos(unit)` minus camera. Use this for `getAnchor` and the sprite rects in `getObstacles`.
- **reset:** Map restarts are where you reset units. Call `dn.clear()` there, at the start, before refill or heal numbers spawn.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Grid movement range + path arrow] Selecting a unit: blue matches the unit's own move stat (same tiles your rules allow), stops early in costly terrain, never crosses impassable tiles or enemies; red fringe as deep as its weapon range.
- [Grid movement range + path arrow] Cursor right, right, up, up draws a two-corner arrow; stepping back shortens it; mouse hover moves it.
- [Grid movement range + path arrow] Confirm walks tile by tile; the command window lists your commands; attacking after a move works; BACK restores.
- [Grid movement range + path arrow] End turn works by key and by button; enemies act; the player phase returns; the windows never cover your HUD.
- [Bouncing damage numbers] A hit shows a white number above the target on the hit frame; digits pop in turn, bounce, hold, fade.
- [Bouncing damage numbers] Criticals (if any) gold with `CRITICAL`, flash, shake; heals green `+n`; `MISS`; `12 MP`; status words.
- [Bouncing damage numbers] Numbers never touch each other, sprites, banner or HUD; crowded multi-hits fold into one total.
- [combined] In one full exchange, every hit from both sides shows one number on its hit frame.
- [combined] Hit-stop freezes everything briefly; the number shows on the first frozen frame.
- [combined] No number covers the other element's plates, windows or HUD.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `grid-range-path.js` sha256 `43a3d25fc8763509...`, `damage-numbers.js` sha256 `1c7b689771a5877b...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Grid movement range + path arrow] Every `gr.` call sits in the steps above, and `gr` exists before the first frame.
- [Grid movement range + path arrow] Trace a human turn: select -> `gr.path` changes -> confirm -> `walk` -> command menu -> your attack via `onCommand` -> phase end, `enabled()` false.
- [Grid movement range + path arrow] Trace autoplay for one full turn and one enemy phase: no `gr` interactive call, moves within `moveOf`, the turn ends.
- [Bouncing damage numbers] List every HP/MP write and its `spawn`. Walk one hit: `dn.spawn` -> `onHitStop` sets the freeze -> `dn.update(0)` steps -> normal steps; `dn.draw` every frame.
- [Bouncing damage numbers] Identifiers inside `getAnchor`/`getObstacles` exist at the first spawn.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
