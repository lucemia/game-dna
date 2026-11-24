# squad-formation.js (A-12 module, v1.2.1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_SquadFormation`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It turns groups of your units into **squads on a 2x3 grid** (a front row of three and a back row of three), gives your battle code the **row rules** (who a melee, ranged or magic attack may hit, and the damage multiplier), and ships a **formation editor**: a modal window where the player places units by keyboard, mouse drag or touch, then presses DEPLOY.

Your game keeps its units, stats and damage formulas. The module stores references to your unit objects (never copies) and reads them through small reader functions. Everything runs on your fixed step (`update(dt)`), so `?t=<ms>&freeze=1` and `?auto=1` stay deterministic; under autoplay the editor arranges the squad and deploys by itself.

Optional look: load `skin-api.js` and a skin before it and pass `skin`; without it the module draws the built-in 16-bit pixel look.

## Data model (shared with A-14 squad-clash)

```js
squad = {
  id: 'party',            // your id (string or number), unique among squads
  team: 'a',              // 'a' player, 'b' enemy, 'n' neutral (colour only)
  name: 'Vanguard',       // shown in the editor
  slots: [u0, u1, u2,     // FRONT row: slot 0, 1, 2 (faces the enemy)
          u3, u4, u5],    // BACK row:  slot 3, 4, 5;  null = empty slot
  data: undefined         // optional, yours
}
```

| term | meaning |
|---|---|
| slot | `0..5`; `slot = row * 3 + col` |
| row | `slot < 3` → `'front'` (row 0), else `'back'` (row 1). Front faces the enemy. |
| col / lane | `slot % 3` (0, 1, 2). Lane 1 is the middle. `pickTarget` prefers the attacker's lane. |
| unit | your own object; one unit is in at most one squad; unit ids must be unique across all squads |

**Unit fields** the module reads, through `options.unit` readers (defaults in brackets):

| reader | default | used for |
|---|---|---|
| `id(u)` | `u.id ?? u.name` | finding a unit again after you rebuild your objects (new game, new wave) |
| `name(u)` | `u.name` | editor label |
| `hp(u)`, `maxHp(u)` | `u.hp`, `u.maxHp ?? u.hpMax ?? u.mhp ?? u.hp` | HP strip; `hp <= 0` = fallen |
| `alive(u)` | `hp(u) > 0` (no hp field: alive) | rows count only living units |
| `reach(u)` | `u.reach`, else `'melee'` | `'melee'`, `'ranged'` (also bow/arrow) or `'magic'` (also spell); the unit's normal attack |
| `prefer(u)` | `u.prefer` | `'front'` / `'back'` for `arrange()`; default: melee front, others back |
| `art(u)` | `u.art ?? u.img ?? u.sprite` | an image or canvas drawn in the cell (integer-scaled on pixel canvases); `{normal}` bake sets accepted. None: the skin's unit token or a built-in figure |
| `kind(u)` | `u.kind ?? u.cls` | skin token kind when there is no art |
| `flip(u)` | `false` | mirror the art in the editor |

Static helpers, no instance needed: `GameDNA_SquadFormation.slot(row, col)`, `.rowOfSlot(s)`, `.colOfSlot(s)`, `.COLS` (3), `.ROWS` (2), `.SLOTS` (6), `.DEFAULTS`, and `.rules(params, unitReaders)` which returns the pure rule functions below (`targetsFor(attacker, squad, reach, aSlot?)`, `canStrike(attacker, aSlot, reach)`, `modifier(attacker, aSlot, target, tSlot, targetSquad, reach)`, `pickTarget(attacker, aSlot, squad, reach)`, `frontAlive(squad)`, `members(squad, living)`, `arrangeList(units)`, `slotIndex(squad, unit)`) for a simulation that runs without an editor (A-14 forecasts).

## Row rules (defaults)

| attack | target in FRONT row | target in BACK row |
|---|---|---|
| melee | hit, × `frontMelee` (1) | **cannot be hit** while any front-row unit of that squad stands (`backGuard: 'on'`); hit normally once the front row has fallen |
| ranged | hit, × 1 | hit, × `backWeak` (1.25) |
| magic | hit, × 1 | hit, × `backWeak` (1.25) |

A melee attacker standing in the back row strikes at × `backMelee` (0.5); `backMelee: 0` = it cannot melee at all: `canStrike()` says so, `targetsFor()` returns `[]` and `pickTarget()` returns `null` for it, and `hit()` answers `{ok: false, cause: 'attacker'}`. Skills that only work from one row: `usable(unit, 'front' | 'back' | {row})`.

## API

`GameDNA_SquadFormation.create(options)` returns an instance.

| option | meaning |
|---|---|
| `view` | `{x, y, w, h}` (or a function) the editor window lays out in, in the units your draw code uses; default: the canvas size. The window is centred in it and scales by `floor(min(w/256, h/224))`. |
| `params` | `backGuard` `'on'`, `backWeak` 1.25, `backMelee` 0.5, `frontMelee` 1, `face` `'up'` \| `'down'` \| `'left'` \| `'right'` (`'auto'` or anything else = `'up'`: the module cannot see your view, so choose it: side view `'left'` / `'right'` toward the enemy, map or top-down `'up'`; where the enemy is in the editor and in `spot()`: `'left'` = front row is the left column, for a side-view party facing left), `autoArrange` `'on'` (autopilot moves units to the suggested slots before deploying), `autoStepMs` 220, `autoMs` 1800 (the autopilot keeps the editor up at least this long), `dim` 0.55, `tags` `'on'`, `title` `'FORMATION'`, `deploy` `'DEPLOY'`, `cell` 0 (auto cell size), `scale` 0 (auto), `openMs` 160, `maxSquads` 4. |
| `unit` | the readers above. |
| `skin` | skin id or object (needs `GameDNA_Skin`); `false` = built-in look. |
| `autoplay` | `() => bool`: while true, an open editor arranges and deploys on its own (deterministic, on the update clock). A real key press or tap takes over. |
| `onDone(squads)` | called when DEPLOY is confirmed, synchronously from `key()`, `pointer()` or `update()`. |
| `debug(event)` | test hook: `open`, `pick`, `move`, `swap`, `refuse`, `deploy`, `hit`, `squad`. |

**Data and rules**

| method | |
|---|---|
| `squad({id, team, name, units, slots?, data?})` | Create or refresh a squad (max 6 units). With the same `id` again, units already seated (matched by reference or `id`) keep their slots, so formations survive new waves and new games; new units take `slots[i]` (slot per unit) or the suggested slot. `slots` alone (6 entries, no `units`) seats exactly. Returns the squad. |
| `getSquad(id)`, `squads()`, `removeSquad(id)`, `squadOf(unit)` | Lookup. |
| `rowOf(unit)` → `'front'` \| `'back'` \| `null`; `slotOf(unit)` → 0..5 \| -1; `colOf(unit)` | Where a unit stands. |
| `targetsFor(attacker, squadOrId, reach?)` | Living units of that squad the attacker may hit, in slot order. `reach` defaults to `reach(attacker)`. Use it as your target list (menu, AI). |
| `pickTarget(attacker, squadOrId, reach?)` | One deterministic target: same lane first, then nearest lane, front before back for melee, lowest HP, lowest slot. |
| `hit(attacker, target, reach?)` | `{ok, mul, why: [..], reach, row, cause}`. Multiply your damage by `mul`; `ok: false` = this attack cannot hit this target, and `cause` says why: `'guard'` (the target's own front row shields it: show SHIELDED over the target) or `'attacker'` (the attacker cannot strike from its row: show it over the attacker, never over the target). `cause` is `null` when `ok` is true. |
| `canStrike(attacker, reach?)` | `{ok, why, reach, row}`: false for a melee unit in the back row when `backMelee` is 0. Check it before listing targets or playing a wind-up. |
| `usable(unit, row)` | `{ok, row, why}` for skills limited to one row. |
| `frontAlive(squad)`, `members(squad, living?)` | Front-row count; `[{unit, slot, row, col, alive}]`. |
| `move(unit, squad, slot)`, `arrange(squad)` | Programmatic swap (never empties a squad); suggested arrangement (melee front, sturdiest in the middle lane). |
| `spot(unit, {x, y, w, h, face?})` | `{x, y, row, col, slot}`: the centre of the unit's cell when a squad stands in that screen area (side view: `face: 'left'` puts the front column on the left). |

**Editor**

| method | |
|---|---|
| `open(squadsOrIds?, {title, onDone, cursor: 'unit', enemy})` | Open the modal editor on up to `maxSquads` squads (default: all team `'a'` squads). The cursor starts on DEPLOY (one confirm press deploys as is) unless `cursor: 'unit'`. Units can move between the open squads; a squad is never left empty. `enemy`: a squad (or id) shown read-only on the enemy side with a VS mark, so the player sees what they face (face `'left'` / `'right'` only, when it fits). |
| `busy()` | True while open: route input to it and pause your world. |
| `key(name)` | `'up' 'down' 'left' 'right' 'ok' 'back' 'start'` (also `ArrowUp`, `z`, `Enter`, `x`, `Escape`). Confirm on a unit picks it up, on another cell places or swaps, on DEPLOY deploys; back puts a held unit back, else jumps to DEPLOY; start deploys. Returns true when used. |
| `pointer(type, x, y)` | `'down' 'move' 'up'` in native px: drag a unit to a cell, or tap a unit then tap a cell; tap DEPLOY. |
| `attach(canvas, {w, h}?)` | Optional: listens to pointer events on the canvas (and the window for move/up) and calls `pointer()` with native coordinates (`w`, `h` = your native canvas size, default the view). Does nothing while closed. Returns `detach()`. |
| `update(dtMs)` | Once per fixed step (also while busy, also in the `?t=` fast-forward loop). |
| `draw(ctx)` | Last in your draw pass, outside camera shake: draws the editor when open. |
| `close()`, `cancel()` | Deploy now / close and restore the slots it had when opened. |

**In-world drawing (optional)**

| method | |
|---|---|
| `drawTag(ctx, unit, x, y)` | 7x7 row badge at its top-left: warm shield = front, cool reach icon = back. Put it beside the HP bar. |
| `drawPips(ctx, squad, x, y, {face})` | A 11x7 mini map of the squad (front warm, back team colour, fallen red, empty dark). For a squad token on a map. |
| `drawGuards(ctx, attacker, squad, reach, unit => box)` | While the player aims: a shield over units this attack cannot reach, `×1.25` over back-row units it hits harder. `box` = `{x, y, w, h}` or `[x, y, w, h]` of the sprite. |

`state()`, `stats()`, `lastDrawn()`, `rects()` (the open editor's window, DEPLOY button and cell rects in native px), `params()`, `setParams(p)`, `rules` (the bound pure rules, with `rules.read` = the unit readers): for tests and tools. Never gate input on `stats()`.

Versions: 1.0.0 first release; 1.1.0 adds `open({enemy})`, `rects()`, shorter info lines, row shown under the pointer while dragging (data model and rules unchanged). 1.2.0: `canStrike()`; `hit()` gains `cause`; with `backMelee: 0` a back-row melee attacker now gets `[]` from `targetsFor` / `null` from `pickTarget` (before: the front row, then `hit()` refused every blow); the pure `rules.targetsFor` takes an optional 4th `aSlot` (without it, nothing changes); `drawGuards` marks nothing when the attacker itself cannot strike; editor: front / back labels under each panel, amber warning on casters in the front row, enemy cells can be inspected (cursor or tap, read-only). Return shapes are unchanged apart from the added `cause` field. 1.2.1: while a unit is held the cursor skips enemy cells; refusals say why in the hint row (empty slot, enemy squad, empty squad); `face: 'auto'` documented (= `'up'`). No rule or API change.

## Integration (15 lines)

```js
// <script src="squad-formation.js"></script> before your game script
const sf = GameDNA_SquadFormation.create({ view: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H }, params: { face: 'up' },
  unit: { id: u => u.id, reach: u => u.ranged ? 'ranged' : 'melee', art: u => u.sprite }, autoplay: () => AUTO });
function startBattle() {
  /* ...existing... */ sf.squad({ id: 'player', team: 'a', name: 'Vanguard', units: party });
  sf.squad({ id: 'enemy', team: 'b', name: 'Raiders', units: foes });
  sf.open(['player'], { onDone: () => { /* optional */ } });
}
function step() {
  if (sf.busy()) { for (const k of keysThisStep) sf.key(k); sf.update(STEP_MS); return; }   // world paused
  /* ...existing step... */ sf.update(STEP_MS);
}
// targets: const pool = sf.targetsFor(attacker, 'enemy');  damage: const h = sf.hit(attacker, target); if (h.ok) dmg = Math.max(1, Math.round(dmg * h.mul));
function render() { /* ...existing draw... */ sf.draw(ctx); }                                  // last
sf.attach(canvas, { w: SCREEN_W, h: SCREEN_H });                                                  // mouse / touch drag
```

## Keep the rest of the game working

- **Pause, don't freeze the clock**: while `busy()`, skip your world update but still call `sf.update(step)` every fixed step (the frame loop AND the `?t=` fast-forward loop), or autoplay never deploys and frozen frames hang on the editor.
- **Input**: while busy, send the step's keys to `sf.key()` and drop the rest of that step's input (taps included), so the confirm that deploys does not also act in the game.
- **Autoplay**: pass `autoplay`, never call `open()` only when a human plays. The editor deploys by itself after about `autoMs`; your autopilot must not run while `busy()`.
- **Targets and damage**: every place your game picks a target (player menu, tap hit-tests, enemy AI, autopilot) uses `targetsFor` or `pickTarget`; every damage formula multiplies by `hit().mul` and skips `ok: false`. A target list may be empty only when the whole squad has fallen: guard it.
- **Where units stand**: draw squads by row (`spot()` or your own layout): front row nearer the enemy. Sprite positions that hit tests and other modules read must use the same layout.
- Hook, don't replace: keep every function, name and caller (restart, title, shortcuts, `?auto=1`, `?t=&freeze=1`).

## Self-check without a browser

- The module is byte-identical and loads before `create`.
- `sf.update(...)` runs once per fixed step in every loop, also while `busy()`; `sf.draw(ctx)` is the last draw call on every render path where the editor can be open.
- Every squad you pass has unique unit ids; `squad()` is called again after you rebuild unit objects (new wave, restart).
- Every target list in the game comes from `targetsFor` / `pickTarget`; every damage roll applies `hit().mul`.
- Walk one example with the defaults: front row Knight (melee), back row Archer (ranged). An enemy Raider (melee) gets `targetsFor` = [Knight]; `hit(raider, archer)` = `{ok: false}`. An enemy Bowman gets [Knight, Archer]; 10 damage on the Archer becomes 12.5 → 13. The Knight falls: the Raider now gets [Archer], `mul` 1. The Archer moved to the front row: `hit(raider, archer).mul` = 1, and a Knight moved to the back row strikes at × 0.5.

## What it guarantees

- Deterministic: no wall clock, no `Math.random`; the editor animates on `update()` time only; the autopilot's moves are a pure function of the squads.
- Never throws from `update`, `draw`, `key`, `pointer` or the rules; host readers that throw count as their default value.
- No global key listeners. `attach()` listens to pointer events only while the editor is open and only calls `preventDefault` on events it used.
- A squad is never left empty by the editor or `move()`; units are never copied or created.
