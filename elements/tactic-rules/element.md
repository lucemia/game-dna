# A-13 Conditional tactic rules

## 1. What it is

The tactic-rules layer of squad and party games: instead of hard-coded AI, every unit carries an ordered list of rules the player can read and change. Each rule is **condition → action (target pick)**: "Ally HP < 40% → Mend the weakest", "Foe is flying → Shoot", "3+ foes → Volley", "Self HP < 30% → Guard". On the unit's turn the list is checked top-down; the first rule that is switched on, whose condition holds and whose action is usable with a valid target wins. If none wins, the unit's **Otherwise** action runs; if even that cannot run (no MP, nothing in reach), the first usable attack or move action runs (**fallback**), so a unit never freezes.

Conditions that name units also pick the target: "Ally HP < 40% → Mend" heals the ally who is under 40 %, "Foe is armoured → Smite" smites the armoured foe. A rule whose condition holds but whose action cannot run ("needs 6 MP", "the foe it names is out of reach") is skipped, and the trace says so.

Three parts, one module:
- **Evaluator** (`GameDNA_TacticRules.evaluate(rules, snapshot)`): pure and deterministic, reads only its arguments, returns the action, target ids, the rule that fired, the reason ("Ivy 31% < 40%") and a trace of every rule checked. A-14 squad clash and forecasts run it on copied snapshots.
- **Why plate**: when a unit decides, a small plate beside it says who, which rule and why (chip R2 / ELSE / AUTO), what and to whom ("Mend → Maren"), and corner ticks mark the target. A plate never covers UI: with no free spot beside the unit it docks in the nearest free spot with a dotted leader line, or hides.
- **Editor** (modal): unit tabs, one row per rule (order, on/off, condition, value chip, action, target pick, delete), the Otherwise row, free-slot dots up to the limit, a bar [+ Add rule] [Apply <preset> ▸ / Undo preset] [Done], and a live **Now:** line: what this unit would do right now with these rules and, for the selected row, why it is skipped. Keys, taps and drag-to-reorder. Repeated Z walks down to Done, so a key-masher (or a judge) always gets out.

Smooth glass drawing on HD canvases; on native pixel canvases (≤ 512 px wide) it switches to crisp drawing with built-in 5×7 / 3×5 bitmap fonts and whole-pixel shapes.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `why` | on | on, off | Show the plate on each `decide()` |
| `whyMs` | 1800 | 800–4000 ms | Plate life; when another unit decides, the previous plate fades within 200 ms |
| `theme` | dusk | dusk, slate, skin | Dark violet glass with amber accent; blue-grey with sky accent; or the skin's `ui.*` / `text.*` / `fx.*` tokens |
| `maxRules` | 8 | 3–8 | Rules per unit; the editor's Add stops there |
| `editKey` | T | T, Tab, R, Q | The game's key that opens the editor (prompt only) |
| `size` | 0 = auto | 0–20 | Smooth: text px (auto = width / 54, 9–20; 12 at 640). Crisp: bitmap scale round(size / 7) (auto 1 up to 300 px) |
| `render` | auto | auto, smooth, crisp | auto = crisp when `bounds.w ≤ 512` |
| `autoClose` | 0 | ms | Editor closes by itself (demos, autoplay) |
| `minCssPx` | 12 | 0–20 CSS px | Smallest smooth text as shown on screen; rows ≥ 32 CSS px; phones get a compact, scrolling editor |

Conditions (value range, default): Always; Ally HP < n% (10–90, 40); Self HP < n% (10–90, 30); Self HP n%+ (10–100, 70); Foe HP < n% (10–90, 30); Foe is *tag*; n+ foes (2–6, 3); Foes <= n (1–5, 1); Allies <= n (1–5, 1); Self MP < n% (10–90, 30); First turn; Self is *tag*; Ally is *tag*. Picks: Auto (foes: lowest HP, allies: lowest HP %), Weakest (lowest %), Lowest HP, Toughest, Nearest (needs `distance`), First. Games add conditions with `conditions: [{id, label, n?, tag?, side?, test(snapshot, rule)}]`.

## 3. Variants

- **Party tactics**: defaults; plates on, 8 rules: the full edit-your-AI experience.
- **Quiet AI**: `why: off`, 6 rules: rules drive enemy AI only, no plates (the log or the editor's Now line explains).
- **Short lists**: 4 rules, plates 2.4 s: easier for younger players.
- **Cool slate** theme; **Pixel host**: `render: crisp` on a 256-wide game.

Presets (role-based, resolved against each unit's own skills; rules whose role the unit lacks are dropped): **Guardian** (low HP → guard; ally < 30% → heal; foe < 30% → attack lowest; armoured foe → magic; else attack), **Healer** (ally < 40% → heal weakest; allies <= 1 → heal; MP < 20% → restore; 3+ foes → aoe; else magic lowest), **Caster** (3+ foes → aoe; flying foe → magic; foe < 30% → magic lowest; MP < 20% → restore; ally < 25% → heal; else magic), **Striker** (first turn → buff; foe < 35% → attack lowest; flying foe → attack; self < 25% → heal; else attack weakest), **Brute** (3+ foes → aoe; foe < 40% → attack lowest; self < 20% → guard; else attack toughest).

## 4. Interface

**Needs**
- Every chooser routed through `decide(unit)` once per unit turn (enemy AI, autoplay, auto commands); the game runs `d.action` on `d.targetUnits` with its own code.
- `actions` (id, label, aim, role), `actionsOf(u)`, `allies(u)` / `enemies(u)` (or `units()` + `fields.side`), `canUse(u, id)` → true / false / reason, `targets(u, id)` → reachable units, `fields` (id, name, hp, maxHp, res, maxRes, tags, row, cls, key), `turn`.
- `update(dt)` every fixed step (also while the editor is open), `draw(ctx)` last; while `busy()` the game skips its world step and sends keys / pointer to `key()` / `pointer()`.
- `getAnchor(u)` (sprite box), `uiRects()`, `getObstacles()` (sprites with `id`), `bounds`.

**Provides**
- `evaluate()` (static, pure) and `decide()`; `snapshot(u)` for forecasts.
- Rule book: `rulesFor`, `setRules`, `applyPreset`, `presets`, `exportBook` / `importBook` (plain JSON), `onChange`.
- Editor: `openEditor(units, {focus, onClose, auto})`, `busy()`, `key()`, `pointer()`, `closeEditor()`.
- Plates: `showWhy(u, d)`, `lastFor(u)`, `clearWhy()`, `rects()`, `lastDrawn()`; `stats()`, `state()`, `debug` events (`decide` with snapshot and rule set, `open`, `close`, `change`).

**Skins.** Optional `skin`; `theme: 'skin'` takes `ui.fill`, `ui.fillTo`, `ui.edge`, `ui.highlight`, `ui.well`, `ui.select`, `text.main`, `text.dim`, `text.accent`, `fx.heal`, `fx.hot`, `fx.cold`, `ink`. Without it the module draws its own look (pixel fonts built in).

**Delivery.** `module/tactic-rules.js` (global `GameDNA_TacticRules`), `module/README.md` (rule format, snapshot, decision, API, 15-line integration), `prompt.md`, `tools/basket/tactic-rules.mjs`, judge probe `judge/probes/tactic-rules.js`. The demo runs on the module (HD instance + two crisp instances).

## 5. Screen rules (exact numbers)

Smooth (S = text px, 12 at 640 × 360):
- Plate: padding 0.6 S; chip 0.72 S `800` text + 0.9 S, radius 0.32 S; line 1 (`who · rule · reason`) `600 0.78 S` dim; line 2 (`Action → target`) `700 S`; max width 40 % of the screen, ellipsis beyond; radius 0.5 S; shadow blur 0.9 S; rim in the chip colour at 55 %; pop-in 160 ms (scale 0.92 → 1, back-out), fade-out 260 ms.
- Target ticks: corners 0.5 S long, 0.14 S thick, 0.25 S outside the sprite box, breathing ±0.08 S.
- Editor: width max(34 S, 74 % of the screen), centred; row height max(1.85 S, 32 CSS px); when the panel does not fit it first drops the free-slot rows, then scrolls the rule list, and only then lowers S (never below the minCssPx floor), so the bar and the Now line always stay inside; S = max(auto, minCssPx / CSS scale) (22 logical at a 0.55 phone scale, compact layout); columns: order 1.25 S, toggle 1.5 S, condition 43 %, arrow 1.4 S, action 28 %, target the rest with a 1.4 S delete cell; backdrop dims the game to 50 %; open 170 ms scale 0.96 → 1; close 140 ms.

Crisp (sc = bitmap scale, 1 at 256 px):
- Plate: 3 px padding, chip = 3×5 text + 4 px, line 1 3×5, line 2 5×7; height 20 px; max width 62 % of the screen; 2-row ink outline with clipped corners, 1 px highlight; tail 3 px; fade in / out in one step at 50 %.
- Editor: 4 px margin and padding, header 13, sub line 9, column heads 8, rows 11, bar 13, Now lines 16, help 8 px; focus = blinking 1 px box (260 ms).
- Placement: candidates above (centred, right- and left-aligned), below, left, right of the sprite box with a 3 px gap; then docked spots every 4 px down the screen. Score = 40 × UI overlap + 14 × other-sprite overlap + 30 × other-plate overlap + 20 × own-sprite overlap + distance. A spot with any UI overlap hides the plate.

## 6. Common mistakes (symptom → fix)

- Units stand still all game → the fallback found only "hold"/"guard": give the game a move or attack action (fallback prefers attack, magic, aoe, move), or an Otherwise that is usable.
- The plate says "Mend → Ivy" but nothing heals → the game's action runner ignores `d.targetUnits`, or `canUse` allows a skill the game then refuses: mirror the real costs.
- A rule never fires though its condition holds → its action has no valid target: `targets()` returns nothing in reach, or the named unit is out of reach (the editor's Now line says which).
- `?auto=1` changes outcome every run → an adapter uses `Math.random`, or `decide()` runs every frame (call it once per unit turn, where the old chooser ran).
- The game freezes with the editor open → `update()` is skipped while `busy()`; keep it running and skip only the world step.
- Keys move the game cursor while editing → route keys to `key()` first and return.
- Plates over the HUD or banners → missing rects in `uiRects()` (also banners shown only during phase changes).
- Rules reset each wave → the book is keyed by object identity: use `fields.key` (name or class).
- Foes and heroes share rules → give different keys per side (`'foe:' + species`).

## 7. Acceptance moments

- Demo `?t=4000&freeze=1`: the Bone Archer's ELSE plate beside it with target ticks on Ivo; the decision log shows the trace (R1 ✗ no foe under 35 %, R2 ✗ no flying foe).
- Demo `?t=11900&freeze=1`: the editor on Sel, row 3 in edit, the value lowered to "2+ foes", Now line "Volley → all foes (rule 3) · Because 2 foes >= 2".
- Demo `?t=13700&freeze=1`: the same rule moved to the top (row 1 focused on its order field).
- Demo `?t=20900&freeze=1`: after the edit, Sel's turn: plate R1 "2+ foes → Volley → all foes", ticks on every foe.
- Demo `?editor=1&t=500&freeze=1`: editor on Maren with her guardian rules.
- Pixel strip (same moments): crisp plate with a docked leader line; crisp editor with a value chip in edit.
- Hosts: battle `?auto=1` ends in victory like the original, foes and heroes decide by rules; tactics `?auto=1` ends won on turn 8 like the original; in both, T opens the editor and repeated Z closes it.
