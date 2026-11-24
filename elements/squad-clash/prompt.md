# Add an auto-resolved squad clash with a forecast to my game

Parameters (defaults): `{{rounds}}` = 3, `{{speed}}` = 1, `{{crit}}` = 0.08, `{{guard}}` = on, `{{followUps}}` = on, `{{margin}}` = 0.1, `{{forecast}}` = bars, `{{numbers}}` = on.

You get `squad-clash.js` (one global, `GameDNA_SquadClash`) and its `README.md`. Include the file **verbatim** with `<script src>` (or paste it unchanged) before my game script. Never rewrite it.

**What it does:** each side of a fight becomes a squad on a 2x3 grid (front row takes melee; the back row is shielded from melee while the front stands, but takes ×1.25 from ranged and magic). A forecast shows each unit's HP after, who falls and the result; on commit the clash plays by itself (speed order, per-unit "condition → action" rules, guards, follow-ups, numbers, banner) and ends exactly as forecast: same seeded simulation.

## Integration points (by role; hook, don't replace)

1. **Map my fight.** Each combatant becomes `{id, name, cls, row: 'front'|'back', col: 0-2, hp, maxHp, atk, def, mag, res, spd, skills, rules, tags, guard, followUp, src}` from my stats (`src` = my object). Melee front, ranged / casters / healers back, at most 6 per side. Attacks become skills (`strike`, `shoot`, `bolt`, `blaze` hits a row, `mend` heals; or add mine through `create({skills})`). My AI or classes become rule lists, e.g. `[{if: 'allyHpBelow', value: 50, use: 'mend'}, {if: 'always', use: 'strike'}]` (`GameDNA_SquadClash.PRESETS` has lists per class). `cls` picks a built-in look, or pass `drawUnit` to draw my sprites.
2. **Where a fight starts:** `clash = GameDNA_SquadClash.create({view: {x: 0, y: 0, w, h}, seed, params: {rounds: {{rounds}}, speed: {{speed}}, crit: {{crit}}, guard: '{{guard}}', followUps: '{{followUps}}', margin: {{margin}}, forecast: '{{forecast}}', numbers: '{{numbers}}'}, drawBackground, onHit, onEnd})` once, then `clash.setSquads(mine, theirs)`. Use a fixed seed per encounter.
3. **Before the fight** (my command phase): draw the scene and `clash.drawForecast(ctx, rect)`. If the player may move units or change rules, call `clash.forecast()` after each change. Confirm → `clash.commit()`. My autoplay commits after a short pause.
4. **Fixed step:** `clash.update(stepMs)` every step of every loop (also the `?t=` fast-forward), `0` while frozen; never gated by menus.
5. **Draw:** `clash.drawScene(ctx)`, my effects, `clash.drawUI(ctx)`, then my HUD.
6. **Fight ends:** in `onEnd(result, outcome)`, HP is already on the units: copy it to `src`, run my existing win / lose code once, set the phase my other code reads.

## Rules

- During a clash nothing else may change HP, stats or rules: my old turn loop stays uncalled (keep the function), `onHit` only gives feedback.
- No `Math.random` or clock in my rules, conditions or hooks.
- Keep every key, restart, title, `?auto=1`, `?t=&freeze=1` and my resolution working.

## Self-check without a browser

- The module is byte-identical; every identifier used at load exists.
- Trace one fight: setSquads → forecast shown → commit → update each step → `onHit` per hit → `onEnd` once → my next screen.
- Grep every HP write: none runs between commit and `onEnd`.
- Walk one hit: atk 14, power 100, def 6 → 14·1.5 − 6·0.75 = 16.5 → 17. A 90-power ranged hit, atk 13, def 6, back row: (11.7·1.5 − 4.5)·1.25 = 16.3 → 16.

## Acceptance checks

- The forecast shows a result and striped HP losses, with skulls on units that will fall; a swap changes it at once.
- After commit: a turn-order strip, a why line per action, GUARD! and FOLLOW-UP happen, numbers on hit frames; the banner says "Played exactly as forecast" and `outcome.match` is true.
- `?auto=1` still finishes my game, no console errors.
