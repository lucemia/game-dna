# Add level-up stat growth to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `level-up-growth.js` (one global, `GameDNA_LevelUpGrowth`), API reference `level-up-growth.README.md`

README example names are placeholders.

## Where it goes in my game (my choice; follow it exactly)

- **Level-up stat growth:** Award EXP and show the results window exactly: after every won battle: EXP and gold from the defeated enemies, for every living party member.

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Level-up stat growth [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Level-up stat growth:** a list of combatants/units; the one place in update logic where a fight / wave / map is won: award(exp, gold) there; what ran next moves into onDone; the confirm input routed to the window while busy() (press() on the key-down edge, or key(code, down)); a fixed 60 Hz update step; rectangles of UI to keep clear; optional: the game's autoplay flag; per-hit EXP via addExp(id, n); the game's save to store serialize().

## Element 1: Level-up stat growth (`level-up-growth.js`, `GameDNA_LevelUpGrowth`)

Experience and levels for the party: `award(exp, gold)` where a fight is won opens a results window (EXP and gold count up, each unit's gauge fills and wraps with LV UP!), then a panel per levelled unit lists its stat gains row by row. Growth is a percent chance per stat per level from plain per-class tables, seeded by the module itself, with a guaranteed minimum. Stats change only through the game's setter, inside `award()`. While a window is open (`busy()`) the confirm input goes to it and the world waits; `onDone` runs when it closes. Autoplay advances it by itself; growth may change how `?auto=1` ends (it must still end), `autoGrowth: hold` keeps the original ending.

**Award EXP and show the results window exactly: after every won battle: EXP and gold from the defeated enemies, for every living party member.**

**Parameters chosen:** `base` = 20, `power` = 1.5, `maxLevel` = 20, `minGain` = 1, `seed` = 1, `countMs` = 1500, `autoMs` = 900, `panel` = on, `share` = each, `autoGrowth` = apply, `tint` = a, `dim` = 0.4.

**Where it goes** (by role; find these places in my game):

1. *Game data, next to the unit definitions:* Growth tables, one plain object per class / role: `{<class>: {rates: {<stat field>: percent 0-100, <big stat>: {rate, amount}}, caps: {...}}}` using the game's OWN stat field names (HP amount about 5 % of its start value). EXP and gold per enemy so the first fight or two give a level with `base` 20.
2. *Once, after the screen size and HUD layout exist:* `lv = GameDNA_LevelUpGrowth.create({bounds, classes, stats: [{key, label}, ...], params: {base: 20, power: 1.5, maxLevel: 20, minGain: 1, seed: 1, countMs: 1500, autoMs: 900, panel: 'on', share: 'each', autoGrowth: 'apply', tint: 'a', dim: 0.4}, units: () => party.map(u => ({id, name, cls, alive, get: k => <field k>, set: (k, v, gain) => <write v to that field; for max HP also add gain to HP>})), autoplay: () => <autoplay flag>, uiRects: () => [HUD, command panel]})`. The setter writes the object the combat formulas read, never a shared template every new unit copies.
3. *The ONE place in update logic where a fight / wave / map is won (where the victory or cleared phase is set). Grep every way to win:* `lv.award(exp, gold, {title: 'VICTORY', onDone: r => { ... }})` once per win. Add the gold to the game's purse yourself **inside `onDone`** (`r.gold`), never at the call, or the gold HUD jumps ahead of the count-up. Move what ran next into `onDone` unless it already waits for a key. Per-hit / per-kill EXP: `lv.addExp(id, n)` where damage lands; `lv.award(0, 0, {units: [id]})` shows one unit's banked EXP (e.g. after its attack).
4. *Top of your fixed update step (the one the animation loop, the `?t=&freeze=1` fast-forward and autoplay all call), before the autopilot runs:* `if (lv.busy()) { if (<confirm pressed this step, from the player>) lv.press(); lv.update(1000 / 60); return; }` so the world, the autopilot and the next wave wait; pause/restart keys stay outside the gate. When not busy: `lv.update(1000 / 60)` once per step.
5. *Your draw pass and every HUD / status display of unit stats or levels:* `lv.draw(ctx)` last, after the HUD, outside any shake translate; draw the game's own victory / cleared banner only when `!lv.busy()`. The HUD prints `lv.shown(id, key)` and `lv.shownLevel(id)` instead of the raw fields (the setter already ran inside `award()`; the shown values change only as the panel reveals each row). Current HP raised with max HP: `hp - (maxHp - lv.shown(id, 'maxHp'))`.
6. *New game / restart; save and load if the game has them:* `lv.reset()` (the game restores its own base stats); `lv.serialize()` / `lv.restore()` next to the stats in the save.

**Common mistakes** (symptom -> fix):

- The panel shows +1 but combat is unchanged -> the setter writes a copy or another field; write where the formulas read (the console warns when the getter does not return the value set).
- A restart starts with grown stats -> the setter wrote into a shared template (a roster or class table that new units copy); give each unit its own copy of its stats.
- EXP is awarded every frame or twice per win -> `award()` sits in a per-frame branch; call it once where the win is decided.
- The world, the autopilot or the next wave runs under the window -> gate the whole fixed step on `busy()` before the autopilot.
- `?auto=1` hangs on the window -> pass the autoplay flag as `autoplay` and keep `update` in the fixed step the freeze loop calls.
- `?auto=1` ends differently -> the party grew; that is allowed if it still ends. Use `autoGrowth: hold` to keep the original ending, and say which in your notes.
- The gold HUD jumps ahead of the count-up -> add `r.gold` to the purse in `onDone`, not where `award()` is called.
- The HUD shows the grown stats before the panel reveals them -> print `lv.shown(id, key)` / `lv.shownLevel(id)` in the HUD, not the raw stats.
- Max HP grows but the bar looks emptier -> in the setter also add `gain` to current HP for living units.
- Per-hit EXP never shows -> `addExp` only banks it; an `award` that includes the unit shows it.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Level-up stat growth] after every won battle: EXP and gold from the defeated enemies, for every living party member: EXP and gold count up, gauges fill and wrap with LV UP!, then a panel per levelled unit with its +N rows; Z / Enter / tap finishes the count, then advances.
- [Level-up stat growth] The panel's gains equal the change in the game's own stats, and the next fight uses them; the HUD changes only as the panel reveals each gain; a restart starts at base stats; the windows never cover the HUD.
- [Level-up stat growth] `?t=<ms>&freeze=1` gives the same frame every time; `?auto=1` still ends (same ending with `autoGrowth: hold`), no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `level-up-growth.js` sha256 `dc66f98565bc10ca...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Level-up stat growth] Grep `award(`: once per win, in update logic; list every way to win and confirm each reaches it. Grep `addExp(` (if used): where damage lands only.
- [Level-up stat growth] Grep `update(`: every fixed step including while busy; the freeze loop calls that step. The setter writes the field the combat formulas read; no shared template changes.
- [Level-up stat growth] Walk `award(45, 12)` to a level-1 unit with the defaults: level 2 at 20 EXP -> the setter is called at once for 1-3 stats -> open 0.1 s -> count 1500 ms -> wait 900 ms (autoplay) -> panel rows 0.16 s each -> close -> `onDone` -> the game continues as before.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
