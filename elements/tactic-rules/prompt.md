# Add conditional tactic rules to my game

Defaults (change any before pasting):
`{{why}}` = on · `{{whyMs}}` = 1800 · `{{theme}}` = dusk · `{{maxRules}}` = 8 · `{{minCssPx}}` = 12 · `{{editKey}}` = T

---

You are given `tactic-rules.js` (finished module, global `GameDNA_TacticRules`) and its `README.md`. **Include the module verbatim** (`<script src>` before my game script, or pasted unchanged into its own `<script>`); never edit it. Read its README first.

Each unit gets ordered rules "condition → action"; the first that holds with a usable action wins. Every AI choice goes through it; the player edits rules; a plate shows which rule fired and why.

Add code; never delete or rename my functions, state, URL parameters or keys.

**Integration points** (find these places in my game):

1. **Create one instance** at startup, after units and skills exist: `tactics = GameDNA_TacticRules.create({ actions, actionsOf, allies, enemies, canUse, targets, fields, turn, tags, bounds: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H }, getAnchor, uiRects, getObstacles, params: { why: '{{why}}', whyMs: {{whyMs}}, theme: '{{theme}}', maxRules: {{maxRules}}, minCssPx: {{minCssPx}} } })`.
   - `actions`: every choice a unit can make, as my game's own skills (attack, spells, guard, items; grid games also "advance", `aim: 'none'`), each with `aim` and `role` (attack, magic, aoe, heal, guard, restore, buff) for the class presets.
   - `canUse(u, id)` mirrors my real costs and limits, returning a reason string when not usable. `targets(u, id)`: only units that action can reach now (grid games: foes it can walk next to this turn).
   - `fields`: how to read my units (name, hp, maxHp, mp, tags like `flying` / `armoured`; `cls` maps my classes to `guardian`, `healer`, `caster`, `striker`, `brute`).
   - `getAnchor(u)`: the unit's sprite box now. `uiRects()`: HUD, menus, captions, banners. `getObstacles()`: sprites, each with `id`.
   - With nothing else usable, the first usable attack or move action runs.
2. **Route every chooser through `decide()`** (enemy AI, autoplay, auto commands): call `const d = tactics.decide(unit)` once per unit turn and run `d.action` on `d.targetUnits` with my existing functions. If `d.action` is null, use my old chooser; keep it.
3. **Player editing**: key `{{editKey}}` (plus a small touch button) opens `tactics.openEditor(playerUnits)` outside autoplay. While `tactics.busy()`: skip my world step; send keys to `tactics.key(e.key)` and pointer down/move/up (logical px) to `tactics.pointer(type, x, y)` before my handlers. If my player steers units by hand, add an Auto toggle (A) so they act by their rules. Show the keys in my help text.
4. **Update and draw**: `tactics.update(stepMs)` every fixed step, every scene, editor open too; `tactics.draw(ctx)` once per frame, last, in screen coordinates.
5. **Restart**: keep the rules; call `tactics.clearWhy()`.

**Keep every other caller working**: `?auto=1` plays to an end (never opens the editor), `?t=&freeze=1` stays deterministic (no `Math.random` in adapters), restart, all keys and taps.

**Self-check without a browser**
- The module file is byte-identical to the one given.
- Every chooser calls `decide()` once per unit turn; the result runs through my existing action code.
- `canUse` matches the costs my action code checks.
- While `busy()`, only the world step is skipped.
- Walk one decision: rule 1 fails, rule 2 holds → action, target.

**Acceptance checks** (screenshots if you can)
1. Enemies and autoplayed allies act with a plate naming the rule and target.
2. `{{editKey}}` opens the editor; reorder, toggle and change a rule; the "Now:" line and the next decision follow it.
3. Repeated Z walks to Done and closes; X closes.
4. No plate covers HUD, menus or units; the editor works on a phone.
5. `?auto=1` plays to the end with no console errors.
