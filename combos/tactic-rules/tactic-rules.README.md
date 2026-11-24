# tactic-rules.js (A-13 module, v1.1.0)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_TacticRules`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it.

Each unit gets an ordered list of rules **"condition → action (target pick)"**. They are checked top-down: the first rule that is switched on, whose condition holds, and whose action is usable with a valid target wins. If none wins, the set's **otherwise** action runs; if that cannot run either, the first usable action runs (**fallback**: actions with role attack, magic, aoe, move or no role first, in your list order, then the rest; mark an action `fallback: false` to keep it out). The module ships:

- **the evaluator**, `GameDNA_TacticRules.evaluate(set, snapshot)`: pure and deterministic. It reads only its two arguments and returns the action, the target ids, which rule fired, the reason, and why every rule above it did not fire;
- **an instance** that reads your units through adapters, keeps each unit's rules (starting from a class preset), and decides for a unit with `decide(unit)`;
- **a "why" plate** next to the acting unit ("R2 · Ivo · Ally HP < 40% / Mend → Maren") and corner ticks on the chosen target. When no spot beside the unit is free of UI and sprites, the plate docks in the nearest free spot with a dotted leader line to the unit; if no free spot exists it hides rather than cover the HUD;
- **a compact rule editor** (modal): add, reorder, switch on and off, pick the condition, value, action and target; class presets; a live "Now:" line that says what the unit would do right now and why.

Your game keeps its own state, skills and damage code. The module only chooses.

## Rule format (plain data, JSON-safe)

```js
const set = {
  rules: [
    { on: true, if: 'allyHpBelow', n: 40, do: 'mend',   pick: 'weakest' },  // Ally HP < 40% → Mend the weakest such ally
    { on: true, if: 'foesAtLeast', n: 3,  do: 'gale' },                     // 3+ foes → Gale (hits all)
    { on: true, if: 'foeIs', tag: 'flying', do: 'strike' },                 // a flying foe → Strike it
  ],
  otherwise: { do: 'strike', pick: 'lowest' }                              // or just otherwise: 'strike'
};
```

| field | meaning |
|---|---|
| `on` | `false` = the rule is kept but skipped. Default `true`. |
| `if` | Condition id (table below). Missing = `always`. An unknown id is skipped with a note in the trace. |
| `n` | The number for conditions that take one (percent or count). Clamped to the condition's range. |
| `tag` | The tag for `foeIs` / `allyIs` / `selfIs` (any string your units carry, e.g. `flying`, `armoured`, `back row`). |
| `do` | Action id: one of **your** skills (from `actions`). |
| `pick` | Which target: `auto` (enemy: lowest HP; ally: lowest HP %), `weakest` (lowest HP %), `lowest` (lowest HP), `toughest` (highest HP), `nearest` (needs `distance`), `first` (your list order). |

A bare array is accepted as `{rules: array}`. Rule sets are normalised on the way in, so sloppy data never throws.

### Conditions

Conditions that name units (**side** column) also choose the target: when the action aims at that side, only the units the condition named can be picked ("Ally HP < 40% → Mend" heals the ally who is under 40 %, not just any ally).

| id | label | value | true when | side |
|---|---|---|---|---|
| `always` | Always | – | always | |
| `allyHpBelow` | Ally HP < n% | 10–90, def 40 | a living ally (self included) is under n % HP | ally |
| `selfHpBelow` | Self HP < n% | 10–90, def 30 | the unit is under n % HP | |
| `selfHpAbove` | Self HP n%+ | 10–100, def 70 | the unit is at n % HP or more | |
| `foeHpBelow` | Foe HP < n% | 10–90, def 30 | a living foe is under n % HP | enemy |
| `foeIs` | Foe is *tag* | tag | a living foe has the tag | enemy |
| `foesAtLeast` | n+ foes | 2–6, def 3 | at least n foes stand | |
| `foesAtMost` | Foes <= n | 1–5, def 1 | 1 to n foes stand | |
| `alliesAtMost` | Allies <= n | 1–5, def 1 | n or fewer allies stand (self included) | |
| `selfResBelow` | Self MP < n% | 10–90, def 30 | resource under n % (`resLabel` renames MP; false when the unit has none) | |
| `firstTurn` | First turn | – | `turn` is 1 (or not given) | |
| `selfIs` | Self is *tag* | tag | the unit has the tag (e.g. `back row`) | |
| `allyIs` | Ally is *tag* | tag | a living ally has the tag | ally |

Add your own with `conditions: [{id, label: 'Foe in reach', n?: {min, max, step, def, unit}, tag?: true, side?: 'enemy', test(snapshot, rule) → true | false | {ok, subjects: [ids], side, note}}]`. A test reads only the snapshot (put extra per-unit data in it with `fields.extra`).

### Snapshot (what `evaluate()` reads)

```js
{ self: 'ivy', turn: 2, resLabel: 'MP',
  units: [ { id, name, side: 'ally' | 'enemy', hp, maxHp, res, maxRes, tags: [], row: 'front' | 'back' | null, alive, dist, extra? } ],  // self included, side 'ally'
  actions: [ { id, label, aim, role, usable: true, reason: '', targets?: [unit ids] } ] }   // this unit's actions only
```

`aim`: `enemy`, `ally`, `self`, `allEnemies`, `allAllies`, `none`. Without `targets`, an action can target every living unit of its side. `usable: false` with a `reason` ("needs 7 MP") puts that reason in the trace. Units with a `row` get the tag `front row` / `back row`.

### Decision (what `evaluate()` and `decide()` return)

| field | |
|---|---|
| `action` | Action id, or `null` when nothing is usable (kind `none`: let your own code wait or pass). |
| `targets` | Target ids, in pick order (one for single-target aims, all of them for `allEnemies` / `allAllies`, the unit itself for `self`). |
| `targetUnits`, `target` | `decide()` only: your own unit objects for those ids, and the first one. |
| `kind` | `rule`, `otherwise`, `fallback` or `none`. |
| `rule` | Index of the rule that fired (0-based), or −1. |
| `ruleText`, `reason` | "Ally HP < 40%", "Ivy 31% < 40%". |
| `why`, `short` | "Rule 2: Ally HP < 40% -> Mend Ivy (Ivy 31% < 40%)", "R2: Mend > Ivy". |
| `trace` | One entry per rule checked: `{i, state: 'off' \| 'no' \| 'unusable' \| 'skip' \| 'fired', note, text}`; e.g. `{i: 0, state: 'unusable', note: 'needs 7 MP'}`. |

Ties in a pick are broken by your list order, so the same snapshot always gives the same decision.

## Instance API

`GameDNA_TacticRules.create(options)`:

| option | meaning |
|---|---|
| `actions` | Your skills: `[{id, label, aim, role}]`, or `unit => [...]`. `role` (attack, magic, aoe, heal, healAll, guard, restore, buff, debuff, item) is used only to build presets. |
| `actionsOf(u)` | Optional: the ids this unit has (the editor offers only these). Default: all `actions`. |
| `allies(u)`, `enemies(u)` | The unit's living allies (self may be included) and living foes, as your own objects. Or give `units()` + `fields.side`. |
| `canUse(u, id)` | Optional: `true`, `false`, or a reason string ("needs 7 MP"). Called once per action per decision; never change state in it. |
| `targets(u, id)` | Optional: the valid targets for that action right now (in reach, alive), as your objects. |
| `distance(u, v)` | Optional: for `pick: 'nearest'`. |
| `fields` | How to read a unit: `{id, name, hp, maxHp, res, maxRes, tags, row, cls, side, key, extra}`, each a property name, a dotted path (`'spec.name'`) or a function. Defaults: `id`, `name`, `hp`, `maxHp`, `mp`, `maxMp`, `tags`, none, `cls`, `side`. `key` = which rule book a unit uses (default its id; use a class name to share rules). |
| `turn` | Number or `unit => number` (for `firstTurn`). |
| `rules` | Initial book `{key: set}`. Units without one start from their class preset. |
| `presets` | Your own presets `{name: {label, rules, otherwise}}` (concrete `do` ids, or `role` instead of `do`). Built-ins: `guardian`, `healer`, `caster`, `striker`, `brute`. |
| `classPresets` | `{yourClass: presetName}` when class names differ from preset names. |
| `otherwise` | Default otherwise action id (or `u => id`) for units without a preset. Default: their first `attack` role action. |
| `tags` | Tags the editor offers for `foeIs` / `allyIs` / `selfIs`. |
| `resLabel` | Name of the resource (default `MP`). |
| `bounds` | The screen `{x, y, w, h}` in logical px (or a function). |
| `getAnchor(u)` | The unit's sprite box on screen now: `{x, y, w, h}` (top-left) or `{x: centreX, top}`. No anchor = no plate (never screen centre). |
| `uiRects()`, `getObstacles()` | HUD panels, menus, captions (and other sprites, with `id`) the plate must avoid. |
| `skin` | Optional `GameDNA_Skin` id or object; `theme: 'skin'` takes its colours. |
| `params` | See below. |
| `onChange(key, set, u)` | After an edit in the editor (save it if you persist rules). |
| `cssScale` | Optional: CSS px per logical px (number or function) when the module cannot measure your canvas. |
| `debug(e)` | Events `decide` (with the snapshot and rule set: the probe recomputes it), `open`, `close`, `change`. |

| param | default | meaning |
|---|---|---|
| `why` | on | Show the why plate on `decide()`. `off`: none (`decide(u, {show: false})` skips one). |
| `whyMs` | 1800 | How long a plate stays. |
| `render` | auto | `crisp` (bitmap 5×7 / 3×5 fonts, whole pixels) when `bounds.w ≤ 512`, `smooth` above. |
| `theme` | dusk | `dusk`, `slate`, `skin`. |
| `size` | 0 | Text px (smooth) or bitmap scale × 7 (crisp). 0 = auto. |
| `maxRules` | 8 | Rules per unit (the editor stops adding). |
| `autoClose` | 0 | ms: the editor closes by itself (autoplay / demos). |
| `minCssPx` | 12 | Smallest text in CSS px (smooth mode). The module reads how large your canvas is shown (`getBoundingClientRect`, or the `cssScale` option) and grows the editor and plates so rows are at least 32 CSS px and text at least this size; on phones the editor switches to a compact layout (no sub line, column heads or help line) with a scrolling rule list (drag the list or tap the chevrons). 0 = off. |

| method | |
|---|---|
| `decide(u, {show})` | Evaluate this unit's rules against the game now. Returns the decision (above) with `targetUnits`. Shows the why plate. Call it **once per turn per unit**, exactly where your AI or autoplay chose before. |
| `snapshot(u)` | The plain snapshot `decide` would evaluate (for forecasts: change it, then `GameDNA_TacticRules.evaluate`). |
| `rulesFor(u)`, `setRules(u, set)`, `applyPreset(u, name)`, `presets()`, `presetFor(name, u)` | The book. `rulesFor` returns a copy. |
| `exportBook()`, `importBook(obj)`, `resetRules(u?)` | Save / load all units' rules (plain JSON). |
| `openEditor(units, {focus, onClose, auto})` | Opens the editor for these units (tabs). Returns false when the list is empty. |
| `busy()` | True while the editor is open: **skip your world step** and send input to the editor. |
| `key(k)` | Editor input: `'up' 'down' 'left' 'right' 'ok' 'back' 'prev' 'next'` or a `KeyboardEvent.key` (arrows, Z/Enter/Space, X/Escape, Q/E/Tab). Returns true (consumed) while open, false when closed. |
| `pointer(type, x, y)` | `type`: `down`, `move`, `up` in logical px. Tap a cell to step its value; drag a row's number to reorder; × deletes. |
| `closeEditor()` | Close from your code. |
| `update(dtMs)` | Every fixed step, in every scene, **also while the editor is open**. |
| `draw(ctx)` | Once per frame, last (after world, HUD and menus), in screen coordinates. Draws plates, or the editor while open. |
| `lastFor(u)`, `showWhy(u, d)`, `clearWhy()`, `rects()`, `lastDrawn()`, `stats()`, `state()`, `setParams(p)`, `conditions()` | Helpers. |
| `editorHits()`, `editorLayout()` | (v1.1) The editor's hit rects exactly as last drawn (`{kind: tab \| bar \| row \| cell \| scroll, row, f, x, y, w, h}`) and its layout, for tests. |

Static: `GameDNA_TacticRules.evaluate(set, snapshot, {conditions})`, `.normalize(set)`, `.describe(rule)`, `.preset(name, [{id, role}], tags)`, `.conditions`, `.picks`, `.presets`.

### Editor keys

Rows: the rules, then **Otherwise**, then the button bar **[+ Add rule] [Apply <preset> ▸] [Done]**. ↑↓ choose a row; ←→ switch unit (on the bar: choose a button); Z edits a row; in a row ←→ choose a field (order, on, condition, value, action, target, ×) and ↑↓ change it (on the order field ↑↓ move the rule); Z confirms and moves to the next row, so pressing Z again and again walks down to **Done** and closes; X backs out, and X on a row closes. Q / E (or Tab) switch unit anywhere. The preset button starts at the unit's class preset and says which preset it will apply; after applying, it becomes **Undo preset** for 5 s (one level of undo), then offers the next preset. Pointer: every hit area is the rect that was drawn: tap the value chip ("30%", "flying") to step the value, the words to step the condition, the box to toggle, the number to drag the row, × to delete. In a scrolling list a cell acts on release so a finger can scroll. Smooth text shows ≤ / ≥; the bitmap fonts show <= / >=.

## Integration (15 lines)

```js
// <script src="tactic-rules.js"></script> before your game script
const tactics = GameDNA_TacticRules.create({
  actions: SKILLS.map(s => ({ id: s.id, label: s.name, aim: s.aim, role: s.role })),
  actionsOf: u => u.skills, allies: u => sideOf(u).filter(v => v.hp > 0), enemies: u => otherSide(u).filter(v => v.hp > 0),
  canUse: (u, id) => u.mp >= COST[id] || 'needs ' + COST[id] + ' MP', targets: (u, id) => inReach(u, id),
  fields: { name: 'name', hp: 'hp', maxHp: 'maxHp', res: 'mp', maxRes: 'maxMp', tags: u => u.tags, cls: u => u.job },
  turn: () => round, bounds: { x: 0, y: 0, w: SCREEN_W, h: SCREEN_H },
  getAnchor: u => ({ x: u.px, y: u.py - u.h, w: u.w, h: u.h }), uiRects: () => [hudRect, menuRect]
});
function chooseFor(u) { const d = tactics.decide(u); if (d.action) useSkill(u, d.action, d.targetUnits); else pass(u); }
// where the AI / autoplay chose before:  chooseFor(unit)
// key T (outside autoplay): tactics.openEditor(party);  in the key handler: if (tactics.busy()) { tactics.key(e.key); return; }
function step(dt) { tactics.update(dt); if (tactics.busy()) return; /* world step */ }
function render() { /* world, HUD, menus */ tactics.draw(ctx); }
```

**Keep every caller working.** Find every place that picks an action for a unit (enemy AI, autoplay, an "auto" command): route each through `decide()` and run the result with the game's own code. Keep the old chooser function (other code may call it). `?auto=1` must still end: autoplay calls `decide()` and never opens the editor (or passes `{auto: true}`). The editor pauses only your world: `update()` and `draw()` still run. `?t=&freeze=1` stays deterministic: `decide()` and `evaluate()` use no randomness and no clock.

## Self-check without a browser

- The module file is byte-identical to the one given.
- Every chooser (AI, autoplay, auto command) now calls `decide()` and acts on `d.action` / `d.targetUnits` with the game's existing functions; `d.action === null` is handled (pass / wait / old chooser).
- Each action id in a rule set exists in `actions`; `canUse` mirrors the game's real costs and limits (a decision must never pick a skill the game then refuses).
- `targets()` returns only units the action can really reach now.
- While `busy()`, the world step is skipped but `update` and `draw` run; keys go to `key()` first.
- Walk one decision: snapshot → rule 1 off → rule 2 holds, usable → `action`, `targets`, plate drawn above the unit.

## What it guarantees

- `evaluate()` is pure: no randomness, no clock, no reads outside its arguments; the same snapshot and rules give the same decision (the probe recomputes every `decide` from its snapshot).
- A decision never names an action whose `usable` is false or a target outside `targets`.
- Never throws from `decide`, `update`, `draw`, `key`, `pointer`; a throwing adapter logs one warning and counts as "not usable" / empty.
- Plates sit beside the actor (above, below, left, right), clamp to the screen, avoid `uiRects()`, other sprites and each other, and never draw at screen centre. They follow the clock given to `update()`.
- Cost: `decide()` with 3 rules and 6 units is a few microseconds; drawing a plate or the editor is well under 1 ms.
