# A-14 Auto-resolved squad clash with forecast

## 1. What it is

A battle-flow element for games where groups fight as squads and the player decides **before** the fight, not during it. Each side is a squad on a **2x3 grid**: a front row of three and a back row of three. When two squads meet, the player sees a **forecast**: every unit's HP after the clash (the part it will lose is striped on its HP bar, a skull marks units that will fall) and the result, VICTORY / DEFEAT / DRAW, with the round it ends in and how many guards, follow-ups and crits happen. The player can still move units between slots and switch their tactics; the forecast updates at once. On **commit** the clash plays out by itself in a staged side view and ends exactly as forecast, because the forecast **is** the clash: the same seeded, pure simulation, run ahead.

Inside the clash every living unit acts once per round, in speed order, by its own ordered **"condition → action" tactic rules** (first rule that holds and has a usable skill on a valid target wins). Melee only reaches the enemy's front row while anyone stands in it; ranged and magic reach every row and hit the back row harder. A **guard** (knight-like trait) steps in front of a weak or back-row ally hit by a single melee or ranged attack, once per round, and takes it at ×0.6. A **follow-up** unit joins an ally's single-target attack on a foe still standing, once per round. The playback shows a turn-order strip, a "why" readout ("Ilsa: Mend → Kael / Rule 1: Ally HP < 60% (Kael 5%)"), dashes, swing arcs, arrows, rune circles and bursts, a shield flare and GUARD! tag, a FOLLOW-UP tag, hit numbers, hurt flashes, falls, and a result banner that says "Played exactly as forecast".

It replaces "the player picks every attack" with "the player builds the squad and its orders, reads the outcome, commits" (the loop of squad-based strategy RPGs and auto-battlers), and makes the prediction trustworthy.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `rounds` | 3 | 1–6 | Rounds per clash; each living unit acts once per round |
| `speed` | 1 | 0.5–3 | Playback speed (timing only, never the result) |
| `crit` | 0.08 | 0–0.3 | Base crit chance (a unit's own `crit` overrides); ×1.5 damage; drawn from the clash seed, so the forecast shows them |
| `guard` | on | on / off | Guards step in |
| `followUps` | on | on / off | Follow-up attacks |
| `margin` | 0.1 | 0–0.4 | If neither side is wiped, a side wins (the other is routed) when it kept more of its starting HP by more than this |
| `forecast` | bars | bars / off | Striped "will lose" segment, `→hp` and skull on the HP bars before commit |
| `numbers` | on | on / off | Built-in hit numbers (off when an addon such as C-11 draws them) |

**Rules (exact):**

- **Turn order:** every round, living units sorted by `spd` (high first); ties: side a first in odd rounds and side b first in even rounds, then front row, then column, then roster order. Units that fall before their turn skip it. The clash ends early when a side has nobody standing.
- **Action:** rules top-down; a rule fires when it is on, its condition holds, its skill is known, has uses left, may be used from the unit's row (`from`), and has a valid target after the condition's filter (`targetTag` / `targetRow` / `targetHpBelow` narrow attack targets, `allyHpBelow` narrows heal targets). Else the set's `otherwise`, else the first usable skill. Target pick: heals lowest HP %, attacks lowest HP, then front row, column, roster (or the rule's `pick`).
- **Reach:** melee hits the front row while anyone stands in it, then the back row; ranged and magic hit any row. `area: 'row'` skills hit every living unit in the chosen target's row.
- **Damage:** physical `max(1, round((atk·power/100·1.5 − def·0.75)·mult))`; magic the same with `mag` / `res`; heal `round(mag·power/100)` clamped to missing HP. `mult` = guard 0.6 × armored (0.6 vs physical, 1.3 vs magic) × flying (1.5 vs ranged, 0.8 vs melee) × back row 1.25 (ranged or magic) × crit 1.5.
- **Guard:** single-target melee or ranged (not follow-ups) aimed at a unit that is in the back row or under 50 % HP; the guard is a living ally with the trait, in the front row, not the target, not yet guarded this round; nearest column first.
- **Follow-up:** after a single-target melee or ranged action that left its target standing, one living ally of the actor with a `followUp` skill that can reach that target and has not followed this round attacks it (nearest column first).
- **Result:** wiped side loses; both standing → HP-kept fraction compared with `margin`; nobody standing → draw.
- **Exactness:** the forecast is cached by every value that can change the simulation (rows, columns, HP, stats, tags, skills, rules, seed, params); commit plays that log and applies each hit to the live units; at the end live HP and result are compared with the forecast (`outcome().match`).

## 3. Variants

| Variant | Params | What changes |
|---|---|---|
| Standard clash (default) | — | 3 rounds, guards and follow-ups on |
| Short skirmish | `rounds: 2, speed: 1.5` | Fewer wipes, more routs and draws; quick |
| War of attrition | `rounds: 5, margin: 0.2` | Clashes usually end in a wipe; draws need a big gap |
| No guards, no follow-ups | `guard: off, followUps: off` | Plain speed-order exchange; back rows die faster |
| Swingy (high crits) | `crit: 0.25` | More crits, still forecast exactly |
| Forecast panel only | `forecast: off` | HP bars show only current HP; the panel still forecasts |

## 4. Interface

**Kind: system.** `starter/index.html` is a complete game built on the module ("Banners of the Vale": formation, tactics, forecast, four clashes, morale, level-ups). `starter/README.md` lists its extension points: the hit site, the draw-effects slot, UI rects, unit anchors and unit rects, the input chain, autoplay (a forecast-scoring planner), the clock (pause, hit-stop), clash events and content tables.

**Art:** the starter and the demo are painted: `starter/art/` holds 13 original class atlases (2-3 poses each) and one meadow at four times of day, generated once with the image generator (9 images; prompts, model, sha256 in `assets/`), cut and packed by `src/make-art.py`. The module itself ships no image: it takes painted units through `drawUnit` / `drawHead` / `looks` / `layout` and keeps its procedural painter as the fallback (`?art=0`).

**Delivery (v1):** `module/squad-clash.js` (global `GameDNA_SquadClash`; API in `module/README.md`). The host creates one instance, `setSquads(a, b)` per encounter, shows `forecast()` / `drawForecast()`, calls `commit()`, `update(dt)` every step, `drawScene` + its effects + `drawUI`.

**Needs from the host:** two squads (units with id, row/col or slot, hp, maxHp, atk, def, mag, res, spd, skills, rules; A-12 squads `{slots}` accepted), a seed per encounter, a fixed step, a moment to show the forecast and a confirm. Optional: skills, conditions, looks, own sprites (`drawUnit`), backdrop, the A-12 row rules and the A-13 evaluator through `GameDNA_SquadClash.adapters`.

**Provides:** `simulate()` (pure) and the forecast; the playback; `onHit(ev)` per HP change on its impact frame (read-only amounts) with `guardBy`, `tag`, `killed`; events `commit`, `round`, `skip`, `fall`, `end`; `onEnd(result, outcome)`; turn-order strip, why readout, banner, forecast panel; `anchor(id)`, `unitRects()`, `uiRects()`, `slotRect()`.

**A-12 / A-13:** squads may be A-12 squad objects (`slots[0..5]`); rules may be A-13 sets (`{rules: [{if, n, tag, do, pick, on}], otherwise}`; A-13 condition ids map onto the built-in ones). `adapters.squadFormation(GameDNA_SquadFormation, params)` gives `targetsFor`, `adapters.tacticRules(GameDNA_TacticRules)` gives `evaluate`; both stay pure, so the forecast stays exact (checked: `checks/forecast-match.mjs --adapters`).

## 5. Screen rules (exact numbers, 640×360 logical; everything scales with h/360)

- **Formation:** side a on the left facing right, side b mirrored. Front row 13.5 % of the width from the centre, back row 30 %; columns shift 5 % of the width outward per column (col 0 nearest the centre, col 2 nearest the edge) and stand at 50 / 59.5 / 69 % of the height; scale 0.9 / 0.97 / 1.04 × `unitScale` 1.18. Draw order by foot y. With painted figures (starter, demo; `layout` option): 15 % / 33.5 %, 7.2 % per column, feet at 52.5 / 61.5 / 70.5 % (below the backdrop's far wall); figures 62-78 logical px tall at scale 1 (about 150-190 CSS px on a 1280 px page); the raptor hovers 1-3 px over its ring.
- **Painted units (starter, demo):** one painted pose sprite per state, never assembled from parts: `ready` (idle, guard, hurt, cheer), `attack` (dash from 28 % of the way, strike; casters: cast), archers `draw` / `loose`. Motion in code only: breathing ±1.1 %, anticipation crouch 4.5 % with a 3° lean back, a 6 px hop on the dash out and on the way home (beasts 11 px), two fading after-images behind a dash, squash 4.5 % at impact, recoil 7.5° when hit with a flash of at most 0.33 white on the sprite's own pixels, cheer hop 6 px. The pose swap is a 2-3 frame cross-fade at 10 % of the dash. A fallen unit is knocked back, buckles at the knees (feet planted, 30 % squash), then fades out in a puff of dust within 650 ms and leaves the field; its HP bar goes after 200 ms. Sprites are multiplied by a tint per backdrop (dawn `#eadfe8`, dusk `#f6c9a2`, night `#6475ad` with 30 % less saturation and a 4 px cool rim on the edges facing the moon; the hit flash is capped at 0.09 at night). Each standing unit has a contact shadow (soft pool + dark core) and a thin team ring (blue / red).
- **HP bars:** 34 × 5 px (× scale) above the head with a dark 1.5 px frame; you green, foe red, under 30 % amber. Forecast: the part to lose striped red, pulsing; `→hp` beside it, a skull instead when the unit falls; a heal gain shows pale green. Bars (with their label) never overlap: the nearest unit keeps its bar; a farther one moves its label to the left, then lifts in 7 px steps (up to 4).
- **Turn-order strip:** top centre, 36 px tall pill: ROUND n / TURN ORDER, then one 26 px head chip per unit in order, team-coloured ring; the actor's chip 1.12× with a white ring and glow; units that acted dimmed; fallen ones crossed red.
- **Why readout:** bottom-left 40 px panel with the actor's head, line 1 "Name: Skill → target (or row)", line 2 "Rule n: condition (reason)" (follow-ups: "Follow-up: joins X's attack" in gold).
- **Beats (speed 1):** round banner 760 ms; action: focus 300 ms (ready pose, why fades in 140 ms), then melee dash 230 ms → impact → 280 ms recover → 220 ms back; ranged draw 240 + flight 260 ms; magic / heal cast 380 ms with a rune circle; follow-up tag 160 ms instead of the focus; +180 ms when someone falls. Guard: slides in front of the aimed ally in the 220 ms before impact (the attacker stops short of it); a solid blue barrier arc with a ring pulse (560 ms), a dashed line from the covered ally to the guard, and a GUARD! tag under the guard's feet (the space above the head belongs to the hit number).
- **Hit feedback:** white flash on the sprite only (offscreen layer) for 220 ms (crit 300), 5 px knockback and shake, sparks (crit: 14 rays and a gold ring), built-in numbers rise 14 px over 400 ms, life 1 s (crit 19 px gold with CRIT); further numbers on the same unit stack one line (17 px) higher; numbers follow the unit's current position (`anchor`), and a fallen unit's numbers sit at its lying body.
- **Falls:** sink and fade over 650 ms, then the unit lies on the ground at 50 % opacity (built-in painter) or is gone (painted units).
- **Prep labels (starter):** BACK / FRONT beside the nearest slot of each row; the help line takes the back-row percentage from `backWeak`.
- **Small screens (starter, demo):** the why line, forecast and selected unit are mirrored in 13 px HTML under the canvas (`why()`), since canvas text is ~5-6 CSS px at 390 px.
- **Result banner:** full-width band at 12 % of the height, 54 px: VICTORY (gold) / DEFEAT (red) / DRAW (blue-white), then "✔ Played exactly as forecast" (or "✖ Differs from the forecast"); the seed is printed only with `seedLabel: on`.
- **Forecast panel** (host rect, full version from 200 × 90): FORECAST (and the seed with `seedLabel: on`); the result chip with "Wiped out / Routed / Both squads" and "in round n / hold the field"; counts of guards, follow-ups, crits; two team bars (HP after, the loss striped) with `before→after` and ☠ falls.

## 6. Common mistakes (symptom → fix)

- The banner says "Differs from the forecast" → something changed HP, stats or rules during the clash (old damage code still running, an `onHit` that edits HP, units rebuilt). Let the module own HP until `onEnd`.
- The forecast does not move after a swap → the swap changed your own data but not the units the module holds, or `forecast()` was not called again.
- Nothing plays after commit → `update()` gated behind a menu or animation; call it every step (0 while frozen).
- Both systems act → the old turn loop still runs during the clash.
- Back-row casters never die and everything ends in draws → a side has only melee; mix reach or raise `rounds`.
- Different results on reload → no fixed seed, or `Math.random` / clock in a custom condition or hook.
- A white box flashes over the scene on hits → a custom `drawUnit` that whitens with `source-atop` on the main canvas; whiten in its own layer.
- Damage numbers twice → an addon draws numbers but `numbers` (the starter's `builtinNumbers`) is still on.

## 7. Acceptance moments

- Demo `?t=1500&freeze=1`: prep of "Shield wall vs sky raiders": both squads in formation, striped forecast bars and skulls, the forecast panel (VICTORY, wiped out in round 3), the help card.
- Demo `?t=4500&freeze=1`: the clash running: the turn-order strip with the actor highlighted, the why readout, an action in progress.
- Demo `?t=6000&freeze=1`: a follow-up: the FOLLOW-UP tag under the joining unit's feet and "Follow-up: joins …" in the readout.
- Starter `?t=3000&freeze=1`: prep of clash 1 after the planner's moves: the unit card with tactic rules, the forecast panel, ENGAGE.
- Starter `?t=12500&freeze=1`: mid-clash with hits, numbers and the forecast chip.
- Starter `?t=26500&freeze=1`: the result: VICTORY in the serif display face between two gold rules, "✔ Played exactly as forecast", the fallen foes gone from the field, your squad cheering, the result message.
- Starter end screen (`?t=172000&freeze=1`, seed 7): THE VALE IS HELD, "Every clash played as forecast: n / n".
- `node checks/forecast-match.mjs 600` and `--adapters`: 600 / 600 matched, `pureSimulate` 600.
