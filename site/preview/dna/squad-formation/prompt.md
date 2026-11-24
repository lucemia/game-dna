# Add Squad formation grid to my game

Add the game element below to MY existing game, which you have not seen. It is a finished module file given with this prompt:

- `squad-formation.js` (one global, `GameDNA_SquadFormation`), API reference `squad-formation.README.md`

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
3. **Integrate one element at a time** (foundations, systems, UI, effects): (1) Squad formation grid [systems].
4. **After each element, check the game still runs:** `node --check` each touched script (inline: copy to a temp .js), reload if you have a browser, run its self-check. Then the next.
5. Then the cross-element wiring and the merged checks.

## Prerequisites my game must already have

- **Squad formation grid:** a fixed 60 Hz update step; a list of combatants/units; an enemy action chooser; where a battle (or wave, or map) starts and restarts, to build squads and open the editor; the direction keys and confirm / cancel routed to the editor while busy(); optional pointer events (attach); optional: the game's autoplay flag, so the editor arranges and deploys by itself.

## Element 1: Squad formation grid (`squad-formation.js`, `GameDNA_SquadFormation`)

Each side fights as squads on a 2x3 grid: a front row of three that faces the enemy and a back row of three behind it. Melee reaches only the front row while any front-row unit stands; ranged and magic reach everyone and hit the back row harder; melee from the back row is weaker. A modal formation editor (keys, mouse drag, touch, autopilot) opens before fights; the game's own target lists and damage go through `targetsFor` / `pickTarget` / `hit`. On a tactics map every map unit becomes a squad of members whose HP sums to the token's.

**Parameters chosen:** `backGuard` = on, `backWeak` = 1.25, `backMelee` = 0.5, `face` = auto, `autoArrange` = on, `autoMs` = 1800, `tags` = on.

**Where it goes** (by role; find these places in my game):

1. *Once, before the first battle:* `sf = GameDNA_SquadFormation.create({view: {x: 0, y: 0, w: <screen width>, h: <screen height>}, params: {backGuard: 'on', backWeak: 1.25, backMelee: 0.5, face: <FACE>, autoArrange: 'on', autoMs: 1800, tags: 'on'}, unit: {id: u => <unique id>, reach: u => <'melee' | 'ranged' | 'magic'>, art: u => <sprite canvas>}, autoplay: () => <autoplay flag>})`; `sf.attach(canvas, {w: <native width>, h: <native height>})` for drag and drop. Define `sf` before any code that runs at load time uses it. FACE = 'auto' unless it is auto; auto: look at the game's view: a side view (parties facing each other across the screen) uses 'left' when the enemy stands to the left of the player's squad and 'right' when to the right (the editor then shows columns and can show the enemy squad with a VS mark: pass `{enemy: <enemy squad id>}` to `open()`); a map, grid or top-down game uses 'up'.
2. *Where a battle, wave or map starts (and restarts):* `sf.squad({id, team: 'a' | 'b', name, units})` per side (call again after unit objects are rebuilt; same id keeps the formation). Tactics map: give each map unit 2-4 member objects `{id, name, hp, maxHp, atk, def, reach, art}` in its own squad and set the token's HP / max HP to the members' sums. Then `sf.open([<player squad ids>], {enemy: <enemy squad id>})`.
3. *Top of the fixed update step (the one the frame loop, the `?t=&freeze=1` fast-forward and autoplay all call), before the autopilot:* `if (sf.busy()) { for (<each key event this step>) sf.key(<'up'|'down'|'left'|'right'|'ok'|'back'>); sf.update(<step ms>); return; }`, dropping the step's other input; otherwise `sf.update(<step ms>)` once per step.
4. *Every place a target is chosen: player target menu, tap / click hit test, enemy AI, autopilot:* Use `sf.targetsFor(attacker, <enemy squad id>, <reach of this action>)` as the list, or `sf.pickTarget(...)` for one deterministic target. Guard an empty list (only when the whole squad has fallen). Tactics fights: each living member of the attacking squad strikes once (slot order) with `pickTarget`, then the defender's counter the same way; re-sum the token HP after each volley.
5. *Every damage formula:* `const h = sf.hit(attacker, target, <reach>); if (!h.ok) <skip>; damage = Math.max(1, Math.round(damage * h.mul));`
6. *Where units are positioned and drawn:* Front row nearer the enemy: `sf.spot(unit, {x, y, w, h, face})` gives each unit's cell centre in a squad area. Optional: `sf.drawTag(ctx, unit, x, y)` beside each sprite, `sf.drawPips(ctx, squadId, x, y)` on map tokens, `sf.drawGuards(ctx, attacker, squadId, reach, u => box)` while the player aims. `sf.draw(ctx)` last in the draw pass, outside camera shake.

**Common mistakes** (symptom -> fix):

- `?auto=1` hangs on the editor -> `update` is not called while busy, or `autoplay` was not passed; the fast-forward loop must run the same step.
- Melee still hits the back row -> one target chooser (enemy AI, autopilot, tap hit test) still uses the old list; grep every place targets are picked.
- No row effect on damage -> the formula does not multiply by `hit().mul`.
- SHIELDED appears over a front-row target, or a back-row melee unit swings at nothing -> check `sf.canStrike(attacker, reach)` first and read `hit().cause` (`attacker` = the attacker cannot strike from its row; `guard` = the target is shielded).
- The press that deployed also attacks or opens a menu -> the rest of that step's input was not dropped while busy.
- Formation resets each wave or restart -> a new squad id each time or unstable unit ids; keep both stable and call `squad()` again with the rebuilt objects.
- ReferenceError at load -> `sf` used (e.g. in `attach` or a resize handler) before `create` ran; create it first.
- Tactics token dies while members live (or the reverse) -> re-sum the token HP from its members after every volley and at setup.
- Sprites still stand at the old spots -> positions must come from the squad layout (`spot()`), and hit tests / other modules must read the same positions.

## Merged acceptance checks (screenshot if you can; otherwise describe the trace)

- [Squad formation grid] Before fighting the formation editor opens; arrows + Z (or a drag) swap units between rows; DEPLOY starts the fight; under `?auto=1` it arranges and deploys by itself.
- [Squad formation grid] Melee never damages a back-row unit while a front-row unit of its squad stands; ranged and magic do, harder; a melee unit in the back hits weaker.
- [Squad formation grid] Front-row units stand nearer the enemy and row tags or squad pips show the rows; `?t=<ms>&freeze=1` is deterministic; `?auto=1` ends with no console errors.
- [combined] My game's autoplay (if any) still finishes a whole game; a full battle or turn cycle and a restart run with no console errors; at 500 px wide, no horizontal scroll.

## Self-check without a browser (report each)

- Each module file is byte-identical to the one given: `squad-formation.js` sha256 `b832e1503b9929c4...` (`shasum -a 256`).
- No function removed or renamed (compare name lists before/after).
- Every identifier you call exists where called; each instance exists before first use.
- [Squad formation grid] Grep every target list and enemy / autopilot target choice: each goes through `targetsFor` or `pickTarget`; grep every damage formula: each applies `hit().mul`.
- [Squad formation grid] `sf.update` runs once per fixed step in every loop, also while busy; `sf.draw(ctx)` is the last draw call where the editor can be open.
- [Squad formation grid] Walk the defaults: Knight front, Archer back. Enemy melee -> `targetsFor` = [Knight], `hit(raider, archer).ok` false; enemy arrow, 10 damage on the Archer -> 13 (x1.25). The Knight falls -> melee reaches the Archer.
- **Mandatory traces** (write each step: function, values): (1) one full autoplay battle or turn cycle through the new code, from start to the next turn or the end; (2) one enemy phase or enemy action. If my game has no autoplay, trace the same path from player input.
- Say how each caller listed in step 1 still works.
- Report which of my functions you changed for each element, and anything you could not do.
