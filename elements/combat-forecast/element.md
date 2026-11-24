# A-03 Combat forecast window

## 1. What it is

The preview a tactics game shows while the player is choosing whom to attack, before the confirm. One window, split down the middle: the attacker on the left in its team colour (blue for the player), the target on the right in its own (red for enemies), and a dark centre spine with the row labels. Each half shows the unit's name, its HP now → after with a small HP bar whose predicted loss blinks, the damage it will deal (with a gold `x2` badge when it strikes twice), and its hit and critical chances when the game has those systems. A target that cannot strike back shows `--` on its side. Up and down arrows beside the weapon names (or the names) show a weapon or type advantage. When the player moves to another target or switches weapons, the window updates at once and the values that changed flash; when the pair is at a screen edge or a corner is taken, the window slides to another spot. It never covers the two units, the cursor or the HUD.

The module never computes rules. The host passes the numbers its own attack code will apply (or a `forecast(att, def)` callback returning them); the module only lays them out, places and animates the window. The one thing it derives is the HP-after display when the host does not give it: every listed strike lands, top of a damage range, in the order attacker, counter, extra strikes, and a unit at 0 stops striking (the defender's numbers dim when it would fall before it can strike back).

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `open` | 6 frames | 0–12 | Grow / shrink length at 60 Hz; 0 = instant |
| `slide` | 80 ms | 0–200 | Travel to a new spot (ease-out cubic); 0 = jump |
| `place` | corner | corner, near | Screen corners and edge midpoints (stays put while valid), or beside the two units |
| `rows` | auto | auto, all, compact | `auto`: HIT / CRT rows only when the data has them; `all`: always (`--`); `compact`: HP and DMG only |
| `bars` | on | on, off | HP bar under the HP row with the predicted loss |
| `blink` | 320 ms | 0–800 | Blink period of the predicted loss and the arrows' 1 px bob; 0 = steady |
| `sides` | attacker | attacker, team | Left half = the attacker, or always the player's unit (enemy phase previews flip) |
| `margin` | 3 px | 0–8 | Gap kept around the two units |

## 3. Variants

- **Classic 16-bit**: the defaults.
- **Compact, beside the fight**: `rows compact`, `bars off`, `place near`, `margin 2`: a small HP / DMG card next to the pair.
- **Player always left**: `sides team`: the player's unit stays on the left even when an enemy attacks.
- **No motion**: `open 0`, `slide 0`, `blink 0` (accessibility, or games without animated UI).

## 4. Interface

**Needs**
- The target-select step: which unit attacks which while the player is still choosing (`show(att, def, data)` each step, `hide()` otherwise; or on change + `hide`).
- The host's own numbers per pair: `dmg` (number, `[min, max]` or text), `hit`, `crit` (0–100, optional), `hits` (2 = strikes twice), `adv` (1 / 0 / −1), `counter` `{dmg, hit, crit, hits, adv}` or `null`, optional `after {att, def}`.
- Both units: `{id, name, team, hp, max, rect, weapon?}` with `rect` the drawn box in screen px.
- A fixed step (`update(dtMs)`), the play field (`view`), `getObstacles()` (units with `id`, HUD rects without), optional `getCursor()`.

**Provides**
- `rect()` / `rects()`: the open window, for other overlays to avoid.
- `debug` events: `open`, `opened`, `close`, `closed`, `pair`, `place`, `warn`.

**Delivery (v1).** `module/combat-forecast.js` (one global, `GameDNA_CombatForecast`; API and a 15-line integration in `module/README.md`). It draws through `GameDNA_Skin` when `skin-api.js` and a skin are loaded (frame `role: 'window'` per team, frame `role: 'plate'` for the spine, text `font: 'ui'`, `bar(…, 'hp' | 'hpLow', {style: 'meter'})`, palette tokens for every colour), otherwise through a built-in copy of the `pixel16` look. The demo runs on the same module with skin-api and pixel16 inlined. A window opened after the last `update` (from render code) is shown settled on the first draw after a fast-forward (`?t=&freeze=1`).

## 5. Screen rules (exact numbers)

Native canvas (256×224 in the demo, 240×160 in the grid starter), integer-scaled, nearest-neighbour.

- **Size**: row pitch = font height + 3 (10 px in pixel16). Spine width = widest label (`HP DMG HIT CRT`) + 10, made even. Half content width `cw` = the widest of: name (+7 for an arrow when there is no weapon row), `now ▸ after`, damage + badge, hit, crit, weapon (+7); at least 30. Window width = 2 × (6 + cw + 3) + spine, made even. Height = 5 + row + 2 + rows × row + 4 (HP bar) + row (weapon row, only when a weapon is given) + 3. Classic 4 rows with weapons in pixel16: 166–190 × 74; HP + DMG only, no weapons: about 104–128 × 44.
- **Frames**: left half = a team window from the left edge to the centre + spine/2, right half the same mirrored, so the two overlap under the spine; spine = a plate 2 px inside the top and bottom. Team colours from the skin (pixel16 a `#3a64d8…`, b `#d85a48…`, n slate).
- **Text**: names at 6 px from the outer edges (title colour), labels centred in the spine (label colour), values centred in their half (main colour). `now ▸ after`: a 3×5 arrow with 3 px gaps; `after` in gold, in hot orange when it is 0. `--` and the numbers of a defender that falls before it can strike back in the dim colour.
- **HP bar**: 3 px under the HP row, `cw` wide; filled to the after-HP fraction (low colour at ≤ 25 %), the lost part from after to now drawn over it, alternating white / hot every `blink` ms (steady white at 0).
- **x2 badge**: `X` + strikes in the ink colour on an accent plate (font height + 2 tall, text width + 4), 2 px right of the damage, 1 px shadow.
- **Advantage arrows**: 5×5 with a 1 px drop shadow; up = heal green, down = hot orange; 2 px from the weapon name (or the name when no weapon row); bob 1 px every 300 ms (none when `blink` = 0). The counter side gets the opposite arrow unless the data gives its own.
- **Open / close**: progress *p* over `open` frames; the frame is drawn at full width and `max(4, round(h × ease))` height centred on the final rect (ease-out quad); text only at *p* = 1.
- **Live update**: a value that changes while open flashes for 14 frames (select colour on alternate 3-frame steps); values of a new pair flash for 8. No re-open.
- **Placement** (in tiers): never on the two units (grown by `margin`), the cursor (+1) or rects without an id (+1); then never on other units whenever any spot allows it; `soft` rects cost 1 per px. `corner`: corners and edge midpoints of `view`, 4 px in, preferring spots far from the pair; `near`: above, below, left, right of the pair first. The current spot is kept while it touches nothing. If every preset spot touches something, the view is scanned on a 4 px grid for the least overlap (a console warning when even that touches a unit). Re-checked every `update`, so a scrolling camera or a walking unit moves it.
- **Draw order**: after map, units and HUD, before full-screen banners, outside screen shake.

## 6. Common mistakes (symptom → fix)

- The window shows `--` everywhere → no `data` and no `forecast` callback; pass the game's numbers.
- Numbers differ from what the attack then does → `data` was computed with a new formula; call the game's own damage / hit / double / counter code (ranges for random rolls).
- A HIT row full of `100` in a game without hit chance → the integration invented it; leave `hit` out (`rows: 'auto'` drops the row).
- The window covers the target or the cursor → unit `rect`s or `getCursor()` in world instead of screen pixels, or missing (console: "no screen rect for unit").
- The window covers another unit after the camera scrolls → `getObstacles()` is missing units or returns world coordinates.
- It flickers open and closed → `show` and `hide` both run in one step from different places; decide once per step.
- `?t=&freeze=1` shots show a thin bar or nothing → `show` runs only in the render or the module is created after the fast-forward; call `show` in the step, create at boot.
- Two windows → the game's old preview box still draws; delete only its drawing.
- The window never closes → event-style calls without `hide()`.
- Autoplay no longer finishes → the AI was routed through the preview code or the targeting code was replaced; only add calls beside it.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=1500&freeze=1` | KESTREL (blue, left) vs PIKEMAN (red, right) in the top-left corner: `24 ▸ 13`, `6 x2`, HIT, CRT, counter 11 / 80 / 1, STEEL SWORD with an orange down arrow, ASH LANCE with a green up arrow; the two units and the cursor uncovered. |
| `demo/?t=3000&freeze=1` | Target moved to MARAUDER: damage 10 x2, HIT 100, arrows reversed (sword up, axe down), HP after `26 ▸ 6`. |
| `demo/?t=4600&freeze=1` | Weapon switched to ASH LANCE: numbers changed, arrows flipped again. |
| `demo/?t=8400&freeze=1` | WREN vs HEXER at range 2: the window re-placed in the top-left corner (4 px in); the counter (tome) present. |
| `demo/?t=10000&freeze=1` | WREN vs SCOUT: the counter side `--` (sword cannot reach), `8 ▸ 0` in orange. |
| `demo/?t=13600&freeze=1` | Enemy preview in the top-right corner: RAIDER (red) left, ORRIN (blue) right; with `&sides=team` ORRIN left with his own numbers. |
| `demo/?t=1500&freeze=1&skin=flat` | The same window in the token-only smooth skin (canvas text, rounded windows). |
| `demo/?t=3000&freeze=1&obs=1` | Unit rects (pink), the cursor (yellow) and the window (green): the window touches neither the pair nor the cursor. |
| Phone width 500 px | Demo canvas fits, no horizontal scroll. |
| Integrated hosts (`checks/hosts/`) | Tactics (no hit / crit system): HP and DMG rows with damage ranges `8-10`, KO preview `1 ▸ 0` with dimmed counter. Grid starter: the built-in forecast replaced, window clear of the pair and the turn plate. `?auto=1` ends as before in both. |
