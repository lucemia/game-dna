# squad-clash.js (A-14 module, v1.2.2)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_SquadClash`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it.

Two squads, each a **2x3 grid** (front row, back row, three columns), meet. A pure, seeded **simulation** decides the whole clash: turn order by speed, each unit's action from its ordered **"condition -> action" tactic rules**, row reach (melee only reaches the front row while it stands), **guards** stepping in for weak or back-row allies, **follow-up** attacks, crits from a seeded stream. The **forecast** is that simulation run on the current squads. **Commit** plays the same log in a staged side-view scene (dash, swing, arrows, spells, guard shield, fall), applies every hit to your live unit objects on its impact frame, and at the end compares the live result with the forecast (`outcome().match`).

It draws the scene (built-in procedural HD units, or yours through `drawUnit`), the turn-order strip, the "why" readout, the result banner and a forecast panel. Your game keeps its own squads, screens and progression.

## Data

```js
unit = { id: 'bryn', name: 'Bryn', cls: 'knight',          // cls picks the built-in look (LOOKS) and nothing else
  row: 'front', col: 1,            // or slot: 0..5 (0-2 front, 3-5 back), or put the unit in an A-12 squad's slots
  hp: 54, maxHp: 54, atk: 14, def: 11, mag: 2, res: 5, spd: 6, crit: null,   // crit: own chance (null = params.crit)
  tags: ['armored' | 'flying' | ...], skills: ['strike', 'cleave'],
  guard: true,                     // steps in front of a weak (< 50 % HP) or back-row ally hit by a single melee/ranged attack, once per round, takes x0.6
  followUp: 'lunge',               // after an ally's single-target melee/ranged attack on a foe still standing, joins it once per round
  rules: [ { if: 'enemiesAtLeast', value: 3, use: 'cleave' }, { if: 'always', use: 'strike' } ] }
squad = [unit, ...]  |  { units: [...] }  |  { slots: [u0, u1, u2, u3, u4, u5] }    // the last is A-12 squad-formation's model
```

**Skills** (`SKILLS`, extend with `create({skills})`): `{name, kind: 'melee'|'ranged'|'magic'|'heal', power (% of atk or mag), from: 'front'|'back'|null (row the user must stand in), area: 'row' (hits the target's whole row), uses (per clash, 0 = unlimited), element, follow: true (follow-up only)}`. Built in: `strike cleave thrust bite shoot pierce bolt blaze hex mend chase lunge`.

**Rules** (A-13 tactic-rules compatible): evaluated top-down; the first rule that is on, whose condition holds and whose skill is usable with a target wins; else `otherwise` (when `rules` is `{rules, otherwise}`), else the first usable skill. Fields: `if` (or `when`), `value` (or `n`, `tag`), `use` (or `do`), `on`, `pick` (`weakest`, `lowest`, `toughest`, `first`). Conditions: `always`, `firstRound` (`firstTurn`), `selfHpBelow`, `selfHpAbove`, `allyHpBelow` (heals then target that ally), `enemiesAtLeast` (`foesAtLeast`), `enemiesAtMost` (`foesAtMost`), `alliesAtMost`, `alliesFallen`, `targetTag` (`foeIs`; tags include `front row` / `back row`), `targetRow`, `targetHpBelow` (`foeHpBelow`), `selfIs`, `allyIs`. Add your own with `create({conditions: {name: (ctx, value) => ({ok, filter?, note})}})`; they must be pure.

**Numbers (exact):** physical `max(1, round((atk·power/100·1.5 − def·0.75) · mult))`, magic the same with mag/res, heal `round(mag·power/100)` clamped. `mult`: guard ×0.6; armored ×0.6 vs physical, ×1.3 vs magic; ranged vs flying ×1.5, melee vs flying ×0.8; ranged or magic into the back row ×`backWeak` (1.25); crit ×1.5 (seeded). Order each round: speed, then side (a first in odd rounds), front row, column. Result: a wiped side loses; else the side that kept more of its starting HP by more than `margin` wins (the other is routed), else draw.

## API

`GameDNA_SquadClash.create(options)`:

| option | meaning |
|---|---|
| `view` | Stage rect `{x, y, w, h}` in your logical px (or a function). Layout scales with `h / 360`. |
| `seed` | Clash seed (`setSeed()` later). Same squads + seed + params = same clash. |
| `params` | Table below. |
| `skills`, `conditions`, `looks` | Add or replace entries of `SKILLS`, `CONDITIONS`, `LOOKS`. |
| `evaluate(unit, ctx)` | Optional: your own decision `{skill, target (id or unit), rule, why}` or null (built-in). Must be pure. `adapters.tacticRules(GameDNA_TacticRules)` makes one from A-13. |
| `targetsFor(unit, skill, allies, enemies)` | Optional: your row reach (pure). `adapters.squadFormation(GameDNA_SquadFormation, params)` makes one from A-12 (v1.2+: passes the attacker's slot, so `backMelee: 0` leaves a back-row melee unit without a target; it then skips its turn, in the forecast too). |
| `onHit(ev)` | Every HP change, on its impact frame, after the module wrote `hp` on your unit: `{kind: 'damage'|'heal', source, target, aimed, guardBy, side, amount, crit, type, skill, skillName, tag: 'guard'|'followUp'|null, hpBefore, hpAfter, killed, round, anchor}`. Read-only: the amount comes from the forecast. |
| `onEvent(ev)` | `commit`, `round` `{round, order}`, `skip`, `fall` `{unit, by}`, `end` `{result, match}`. |
| `onForecast(fc)`, `onPhase(p)`, `onEnd(result, outcome)` | New forecast computed; phase `forecast` / `playing` / `done`; clash over. |
| `onShake(px, ms)` | Built-in impact shake request (crit 6 px). |
| `drawBackground(ctx, view, tSec)` | Your backdrop; return anything (or define it) to replace the built-in sky. |
| `drawUnit(ctx, unit, info)` | Your sprite: `info = {x, footY, s, dir, facing, pose: idle|ready|dash|strike|draw|loose|cast|guard|hurt|cheer, k, flash, dead, fall, t, side, ret, active}` (`ret` 0..1 while a melee attacker comes home, else null; `fall` 0..1 over 650 ms, then `dead`). Return `true` when drawn; otherwise the built-in painter draws. Whiten a hit in your own layer, never with `source-atop` on `ctx`. |
| `drawHead(ctx, unit, cx, cy, r, info)` | v1.2: your portrait for the turn-order chips, the why box and `paintHead(ctx, unit, ...)`; the circle is already clipped. `info = {side, facing, t}`. Return `true` when drawn. |
| `looks` sizes | v1.2: a look may carry `w`, `h` (its box in logical px at unit scale 1: HP-bar height, hit point, melee reach), `lift` (hover height), `shadow` (contact-shadow scale, 0 = none), `shot: 'stone'`, `shotX`, `shotY` (where a ranged shot leaves it) and `noBody: true` (nothing stays on the ground after a fall). Use them when `drawUnit` draws figures of another size than the built-in ones. |
| `layout` | v1.2: `{front, back, colDx, y0, colDy}` as fractions of the view (defaults 0.135, 0.3, 0.05, 0.5, 0.095): distance of the rows from the centre, shift per column, feet height of column 0 and step per column. |
| `skin` | Optional `GameDNA_Skin` id/object: UI panel and text colours from its tokens. |

| param | default | |
|---|---|---|
| `rounds` | 3 | 1–9 rounds; each living unit acts once per round. |
| `speed` | 1 | Playback speed (timing only, never the result). |
| `crit` | 0.08 | Base crit chance. |
| `guard`, `followUps` | on | Guard and follow-up triggers. |
| `margin` | 0.1 | HP-kept lead needed to rout instead of draw. |
| `backWeak` | 1.25 | Ranged/magic multiplier into the back row (A-12's default). |
| `numbers` | on | Built-in hit numbers (`off` when an addon such as C-11 draws them). |
| `bars`, `forecast` | on, bars | HP bars over heads; striped "will lose" part and `→hp` / skull on them before commit. |
| `order`, `why` | on | Turn-order strip; "why" readout (rule that fired and its reason). |
| `unitScale` | 1.18 | Size of the units. |
| `rings` | on | A thin team-coloured ring on the ground under every standing unit (v1.2). |
| `seedLabel` | off | `on` prints `seed n` in the forecast panel and on the result banner (a debug aid; hidden from players since v1.2.1). |

| method | |
|---|---|
| `setSquads(a, b)` | Your live squads (side a is drawn on the left, facing right). Call again whenever units change outside a clash. |
| `forecast()` | The forecast for the current squads (cached until anything that matters changes): `{result, endedRound, units: {id: {hpBefore, hpAfter, maxHp, fell, dealt, taken}}, totals: {a, b}, counts: {guards, follows, crits}, log, seed, key}`. |
| `commit()` | Plays that forecast. Do not change squad stats, rules or HP until `phase()` is `done`. |
| `update(dtMs)` | Every fixed step (0 while frozen). Playback, effects and numbers advance only here. |
| `draw(ctx)` = `drawScene(ctx)` + `drawUI(ctx)` | Scene (backdrop, units, effects, bars, numbers); then strip, why box, banner. Put your effects between them. |
| `drawForecast(ctx, rect, {labelA, labelB, compact})` | The forecast panel in your rect (≥ 200 × 90 for the full panel). |
| `outcome()` | After the clash: `{result, forecastResult, match, diffs, hp, seed}`. |
| `anchor(id)` | `{x, footY, top (HP-bar top), spriteTop, left, w, h, cy, s, side, row, col, dead}` where the unit is drawn now: it follows a dash and a guard's step-in (v1.1); `anchor(id, {home: true})` = its formation spot (`homeX`, `homeFootY` are also set while it is away). A fallen unit's anchor is its lying body. |
| `unitRects()`, `uiRects()`, `fieldRect()`, `slotRect(side, row, col)` | Drawn sprite + HP-bar rects (with `id`), UI rects of the last frame, the stage, a formation slot on the ground. |
| `why()` | The why readout as text `{line1, line2, actor, side, type}` (null between actions): mirror it in HTML for small screens or screen readers. |
| `phase()`, `current()`, `hitStop(ms)`, `pause(on)`, `setFast(k)`, `skip()`, `reset()`, `stats()`, `setParams(p)`, `params()`, `seed()` | Helpers. |
| `paintUnit(ctx, unit, x, footY, s, dir, pose)`, `paintHead(ctx, unit, x, y, r)`, `panel(...)`, `text(...)` | The built-in painter and UI helpers. |

Static: `GameDNA_SquadClash.simulate(a, b, opts)` (pure), `.rowOf`, `.targetsFor`, `.ruleText`, `.ruleParts`, `.SKILLS`, `.PRESETS` (rule lists per class), `.LOOKS`, `.CONDITIONS`, `.adapters`.

## Integration (15 lines)

```js
// <script src="squad-clash.js"></script> before your game script
const clash = GameDNA_SquadClash.create({ view: { x: 0, y: 0, w: W, h: H }, seed: 42,
  onHit: ev => { /* your hit feedback; HP is already written on ev.target's unit */ },
  onEnd: (result, outcome) => { /* 'win' | 'lose' | 'draw': your progression, once */ } });
function startEncounter() { clash.setSquads(myUnits, foeUnits); }       // units: {id, row, col, hp, maxHp, atk, def, mag, res, spd, skills, rules}
function prepScreen() { const fc = clash.forecast(); /* let the player move units / change rules: call forecast() again */ }
function onConfirm() { clash.commit(); }                                  // plays exactly fc
function step(dt) { clash.update(frozen ? 0 : dt); }                      // every fixed step, every scene
function render() {
  clash.drawScene(ctx); /* your effects */ clash.drawUI(ctx);
  if (clash.phase() === 'forecast') clash.drawForecast(ctx, { x: 312, y: 262, w: 214, h: 92 });
}
```

v1.2 drawing changes (the simulation, the log and every number are unchanged; `forecast-match.mjs` and its three mutants give the same counts as v1.1): contact shadows with a dark core, team rings, the FOLLOW-UP tag sits under the feet like GUARD!, a tapered swing crescent, a four-point hit flare, a slung stone for `shot: 'stone'`, a serif display face for the result banner, the round banner and the forecast word (`text(ctx, s, x, y, {font: 'display', spacing})`), a double rule and ornaments on the banner.

v1.2.2 (drawing hooks only; simulation, forecast and playback untouched): `drawUnit` and `drawHead` get `info.facing` (`'left' | 'right'`, the side the unit must look). Your sprite code decides the mirror from it in one place: `flipX = (info.facing !== asset.facing)`, where `asset.facing` is the side your art looks at; when you have the unit painted for that side, draw that picture un-mirrored (a shield stays on its arm, painted light stays on its side) and mirror only when you have no such picture. `info.dir` (1 / -1) is unchanged.

v1.2.1 (drawing only): a melee attacker lands on the spot beside its target that covers other units the least (a little lower or a step short); hit numbers of one unit fan out sideways and never sit on a neighbour's number, life 850 ms; HP bars lift at most two steps and disappear 200 ms into a fall; a look with `noBody` keeps its standing anchor after the fall (numbers stay where the unit stood); the spell glow sits at chest height; the turn-order strip is 12 px narrower (4.5 px gaps from nine chips); the seed is no longer shown.

## Keep it exact

- The forecast is only valid for the squads it was made from. Between `forecast()` and `commit()` change units only through the module (call `forecast()` again after any edit); `commit()` re-checks and uses the current state.
- Never change HP, stats or rules in `onHit` or during a clash. Add mechanics as skills, conditions or units: they run inside the simulation, so the forecast includes them.
- No `Math.random` or clock in `evaluate`, `targetsFor` or conditions.
- `checks/forecast-match.mjs` runs hundreds of seeded random clashes (also through the A-12/A-13 adapters) and compares forecast with play; it fails on any difference (mutation-tested).

## What it guarantees

- Same squads, seed and params → same log, same pixels for the same `update` calls (no wall clock, no `Math.random`).
- The played result equals the forecast unless something else changes the units mid-clash; then `outcome().match` is false and the differences are listed.
- Never throws from `update`, `draw*`, `forecast`, `commit`; bad callbacks are caught and warned once.
