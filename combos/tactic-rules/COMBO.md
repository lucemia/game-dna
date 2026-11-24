# Add conditional tactic rules to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `tactic-rules.js` (one global, `GameDNA_TacticRules`), API reference `tactic-rules.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Conditional tactic rules [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Conditional tactic rules:** an enemy action chooser; the game's skills with an aim (enemy, ally, self, all foes, all allies, none) and a role, plus usability (costs, items, cooldowns) and reach; unit fields: name, HP, max HP, MP, tags (flying, armoured, back row ...), class; a fixed update step that keeps running while the editor is open, a key and pointer route into the editor, and the unit sprite boxes and HUD rects on screen.

## Element 1: Conditional tactic rules (`tactic-rules.js`, `GameDNA_TacticRules`)

Every unit decides with an ordered list of rules "condition -> action (target)": ally HP under n%, a flying / armoured / back-row foe, self HP or MP, foe count, first turn. The first rule that holds and whose action is usable with a valid target wins, else the unit's Otherwise action, else the first usable attack or move. The evaluator is pure and explains itself; a plate beside the acting unit names the rule and target (ticks on the target); a modal editor (tabs, rows, presets, live "Now:" line) lets the player change the rules.

**Parameters chosen:** `why` = on, `whyMs` = 1800, `theme` = dusk, `maxRules` = 8, `editKey` = T, `size` = 0, `render` = auto, `minCssPx` = 12.

**Where it goes** (by role; find these places in my game):

1. *Once at startup, after units and skills exist:* `tactics = GameDNA_TacticRules.create({actions, actionsOf, allies, enemies, canUse, targets, fields, turn, tags, bounds: {x: 0, y: 0, w: SCREEN_W, h: SCREEN_H}, getAnchor, uiRects, getObstacles, params: {why: 'on', whyMs: 1800, theme: 'dusk', maxRules: 8, size: 0, render: 'auto', minCssPx: 12}})`. `actions` = the game's own skills (attack, spells, guard, items; grid games also "advance" with `aim: 'none'`), each with `aim` (enemy, ally, self, allEnemies, allAllies, none) and `role` (attack, magic, aoe, heal, guard, restore, buff, move). `canUse(u, id)` mirrors the real costs and limits (reason string when not usable); `targets(u, id)` only what that action reaches now. `fields` reads name, hp, maxHp, mp, tags (flying, armoured, back row) and `cls` (mapped to guardian, healer, caster, striker, brute); `key` = name or species so rules survive restarts.
2. *Every place that chooses a unit's action: enemy AI, autoplay, auto-battle commands (once per unit turn):* `const d = tactics.decide(unit)`, then run `d.action` on `d.targetUnits` with the game's existing functions (movement, attack, damage, animation). `d.action === null` -> the old chooser (keep it).
3. *The key handler and pointer handlers:* Key T (and a small touch button) opens `tactics.openEditor(playerUnits)` outside autoplay. While `tactics.busy()`: keys go to `tactics.key(e.key)`, pointer down/move/up in logical px to `tactics.pointer(type, x, y)`, before the game's handlers. If the player steers units by hand, add an Auto toggle so they act by their rules.
4. *The fixed update step:* `tactics.update(stepMs)` every step in every scene, also while the editor is open; skip only the world step while `busy()`.
5. *The draw pass, last (after world, HUD and menus), in screen coordinates:* `tactics.draw(ctx)` once per frame.
6. *Restart / new battle:* Keep the rules (the player's); `tactics.clearWhy()`.

**Common mistakes** (symptom -> fix):

- Units stand still -> the only usable fallback is hold/guard: give an attack or move action, or a usable Otherwise.
- The plate names a skill but nothing happens -> the runner ignores `d.targetUnits`, or `canUse` allows what the game refuses.
- A rule never fires -> its action has no target in reach (`targets()`), see the editor's Now line.
- `?auto=1` differs every run -> `Math.random` in an adapter or `decide()` called every frame.
- The game hangs with the editor open -> `update()` skipped while `busy()`.
- Plates over HUD or banners -> those rects are missing from `uiRects()`.
- Rules reset each wave -> key the book by name or species (`fields.key`), not object identity.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Conditional tactic rules] Enemies and autoplayed allies act with a plate naming the unit, the rule and the target; ticks mark the target.
- [Conditional tactic rules] The editor key opens the editor; reordering, toggling or changing a rule changes the Now line and the next decision.
- [Conditional tactic rules] Repeated Z walks down to Done and closes; X closes. `?auto=1` plays to the end with no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `tactic-rules.js` sha256 `c84483bd96c995a5...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Conditional tactic rules] List every chooser and show it calls `decide()` once per unit turn and runs the result through existing action code.
- [Conditional tactic rules] While `busy()` the world step is skipped but `update` and `draw` run; `canUse` matches the game's own costs.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
