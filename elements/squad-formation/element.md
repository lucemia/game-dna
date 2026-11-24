# A-12 Squad formation grid

## 1. What it is

Each side fights as **squads on a 2x3 grid**: a front row of three slots that faces the enemy and a back row of three behind it. Where a unit stands decides what can reach it and how hard it hits:

- **Melee** reaches only the front row while any front-row unit of that squad stands. Once the front row has fallen, the back row is exposed.
- **Ranged and magic** reach every living unit and hit the back row harder (× 1.25).
- A **melee fighter placed in the back row** swings at × 0.5 (or not at all, in the "hard wall" variant: `canStrike()` is false, `targetsFor()` is empty, and the game says "can't reach" over the attacker, never "shielded" over a target). Skills can be locked to one row (`usable(unit, 'back')`).

Before a fight, a **modal formation editor** opens over the game: one panel per player squad (up to four, units can move between them), an optional read-only enemy panel with a VS mark, and an info box that spells out the consequence of the slot under the cursor ("Back: safe from melee / arrows, spells × 1.25", or an amber warning for a melee unit in the back). The player drags units with the mouse or a finger, taps a unit then a cell, or uses the arrows and Z; DEPLOY confirms. The cursor starts on DEPLOY, so one confirm press keeps the formation as it is. Under autoplay the editor moves units that stand in the wrong row (melee behind, ranged or magic in front) with visible cursor moves, then deploys, deterministically.

The game keeps its own units, stats and damage formulas. The module stores references to the game's unit objects in `squad.slots` and answers three questions the battle code asks: `targetsFor(attacker, squad, reach)` (the legal target list), `pickTarget(...)` (one deterministic target: same lane first) and `hit(attacker, target, reach)` → `{ok, mul, why}` (the multiplier and the reasons, for logs and forecasts). `spot(unit, area)` tells the game where each unit stands (front row nearer the enemy), and three optional drawing helpers put rows on the battlefield: a row tag beside each sprite, a 2x3 pip map on map tokens, and shields / ×1.25 marks over targets while the player aims.

On a **tactics map** every map unit becomes a squad of 2-4 members; the token's HP is the members' sum, and a fight between two tokens is one volley per side in which each living member strikes once through `pickTarget` + `hit`. The data model (`{id, team, name, slots[6]}`, slot = row × 3 + lane) is the one A-14 squad-clash builds its forecast and staged clash on.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `backGuard` | on | on / off | The front row shields the back row from melee while any front-row unit stands |
| `backWeak` | 1.25 | 1 – 2 | Damage multiplier for ranged and magic attacks on the back row |
| `backMelee` | 0.5 | 0 – 1 | Melee power of a unit standing in the back row (0 = cannot melee there) |
| `frontMelee` | 1 | 0.25 – 3 | Melee multiplier on the front row (module only) |
| `face` | auto | auto / up / down / left / right | Where the enemy is, in the editor and in `spot()`. auto = the integrating agent chooses from the game's view: side view left or right (toward the enemy; pass the enemy squad to `open()` for the VS panel), map or top-down up; the module itself treats auto as up |
| `autoArrange` | on | on / off | The autopilot moves wrong-row units before deploying |
| `autoMs` | 1800 | 0 – 6000 | The autopilot keeps the editor up at least this long |
| `autoStepMs` | 220 | 30 – 2000 | Autopilot pace per cursor move or press (module only) |
| `tags` | on | on / off | Row tags drawn by `drawTag` |
| `dim`, `openMs`, `title`, `deploy`, `cell`, `scale`, `maxSquads` | 0.55, 160, FORMATION, DEPLOY, auto, auto, 4 | | Editor look (module only) |

## 3. Variants

| Variant | Params | Feel |
|---|---|---|
| Classic rows | `backGuard: on, backWeak: 1.25, backMelee: 0.5` | Front line protects casters; archers and mages punish exposed back rows |
| Hard wall | `backGuard: on, backWeak: 1.5, backMelee: 0` | Formation is everything: a fighter in the back is dead weight, casters must hide |
| Soft rows | `backGuard: off, backWeak: 1.15, backMelee: 0.75` | Every unit can be hit; rows only shade the numbers |
| Side view | `face: left` (or right) | Editor columns and `spot()` match a side-view party facing left |

## 4. Interface

**Needs** (from the game)
- A fixed 60 Hz step: `update(dt)` every step, also while the editor pauses the world, also in the `?t=` fast-forward loop.
- Per side, the unit list: a unique id, HP / max HP, the reach of the unit's normal attack (melee, ranged, magic) and a sprite (readers in `options.unit`).
- Every place a target is chosen (player menu, tap hit test, enemy AI, autopilot) and every damage formula.
- Where a battle, wave or map starts and restarts (build squads with `squad()`, open the editor).
- Keys routed to `key()` while `busy()`; optional pointer events (`attach(canvas)`); optional autoplay flag.

**Provides**
- `squad({id, team, name, units | slots})` → `{id, team, name, slots[6]}`; front row = slots 0-2, back = 3-5; lane = slot % 3. Re-calling with the same id keeps units (matched by id) in their slots.
- Rules: `targetsFor`, `pickTarget`, `canStrike`, `hit` → `{ok, mul, why, reach, row, cause}` (`cause` `'guard'` or `'attacker'` when not ok), `usable(unit, row)`, `rowOf`, `slotOf`, `frontAlive`, `members`; the same pure functions without an instance: `GameDNA_SquadFormation.rules(params, readers)`.
- Editor: `open(ids, {enemy, cursor, onDone})`, `busy()`, `key()`, `pointer()`, `attach()`, `update()`, `draw()`, `close()`, `cancel()`; `onDone(squads)` from inside `key()` / `pointer()` / `update()`.
- Placement and drawing: `spot(unit, area)`, `drawTag`, `drawPips`, `drawGuards`.
- Tests: `state()`, `stats()`, `rects()`, `lastDrawn()`, `debug` events.

## 5. Screen rules (exact numbers)

- Editor window: centred in `view`, scale k = `floor(min(w / 256, h / 224))` (min 1); cell = up to 28k px (min 12), 2k px gaps, panels 6k apart (12k before an enemy panel), title row 12k, info box 36k tall, hint row 10k. At 256x224 with one side-view squad the window is 248 x 180.
- Front cells are warm (#4a3426 → #7a5a3e lit edge), back cells cool (#26304a → #46567e); a 1k bar in #ffb86a / #8ac8ff marks each row and a 10k label row under each panel names them (side view: `front` / `back` under the columns; up view: `▲ front` and `back`); back cells carry a faint shield while the front row stands. An amber warning blinks on a melee unit in the back (red when it cannot melee there) and on a ranged or magic unit in the front. Enemy cells take the cursor (read-only) and the info box describes them as "their front / their back".
- Cursor: white corner brackets, arm = cell / 4, pulsing 1k every 260 ms; yellow while a unit is held, red for 180-220 ms after a refused action (empty slot, empty squad).
- Held unit: lifted 6k (ease-out-back over 160 ms) plus a 2k bob, a 0.4 alpha shadow under it, a 0.3 alpha ghost in its origin cell; a landing unit hops 3k and kicks dust for 220 ms; a swapped unit slides across in 220 ms.
- Backdrop dim 0.55 fading in over 160 ms (window rises 10k into place).
- Row tag: 7x7 icon with a 1 px ink outline (front: shield #ffb86a; back: the unit's reach icon in #8ac8ff). Pips: 11x7 px (2x2 dots on 3 px pitch). Guards: shield or "×1.25" 10 px above the sprite box, bobbing 1 px every 250 ms.
- Autopilot: one cursor move or press every 220 ms; at least 1800 ms on screen; one confirm on DEPLOY.

## 6. Common mistakes (symptom → fix)

| Symptom | Fix |
|---|---|
| `?auto=1` hangs on the editor, or a frozen frame always shows it | `update()` not called while busy (or not in the fast-forward loop); pass `autoplay` |
| Melee still hits casters in the back | a target list or the enemy AI still uses the old "all living foes" list; route every chooser through `targetsFor` / `pickTarget` |
| Damage ignores rows (no ×1.25, no ×0.5) | the damage formula does not multiply by `hit().mul` |
| The confirm that pressed DEPLOY also attacks / opens a menu | input of that step was not dropped while busy |
| Formation resets every wave or restart | `squad()` builds a new id each time, or unit ids change; keep the squad id and stable unit ids |
| Units vanish from a squad after a restart | the game rebuilt unit objects but did not call `squad()` again with the new objects |
| Sprites stand where they always stood | positions still come from the old slot table; use `spot()` (front row nearer the enemy) |
| A tactics token dies while members live (or the reverse) | the token's HP is not re-summed from its members after every volley |
| Drag does nothing on a scaled canvas | `attach(canvas, {w, h})` needs the native size when the canvas is CSS-scaled or uses a dpr transform |
| SHIELDED shows over a front-row target, or a back-row melee unit swings at nothing (`backMelee: 0`) | check `canStrike()` first and read `hit().cause`: `'attacker'` is about the attacker, `'guard'` about the target |
| Target list empty, game crashes | only possible when the whole squad has fallen; guard the empty list (end the battle) |

## 7. Acceptance moments (what to screenshot, what must be visible)

1. **Editor open** (`?t=` during the autopilot): window over a dimmed field, the player squad panel(s), enemy panel with VS (when passed), cursor brackets, info box with the row consequence, DEPLOY.
2. **Drag in progress**: the held unit lifted with a shadow over the target cell, its ghost in the origin cell, the info box naming the hovered row.
3. **Melee wind-up**: shields over the back-row units of the defending squad; only front-row units are struck.
4. **Arrow or spell on the back row**: the hit number with ×1.25 (the game's own number display).
5. **Back row exposed**: front row fallen, melee now reaches the back row (no shields).
6. **Tactics map**: tokens with 2x3 pips; a fight in which several members strike.
7. `?auto=1` ends; `?t=<ms>&freeze=1` gives the same frame on every run; 0 console errors.
