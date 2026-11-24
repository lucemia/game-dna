# G-02 Level-up stat growth

## 1. What it is

Experience and levels for a party, the console way. When a fight is won the screen dims and a bevelled results window opens over the field: a title (VICTORY, WAVE 2 CLEARED), the EXP and gold totals counting up from 0, and one row per party member with its level and an EXP gauge. The gauges fill as the EXP counts; when one passes a level threshold it flashes white, wraps to empty and keeps filling, the level number blinks up and the row lights up with a blinking LV UP!. Then, for each unit that levelled, a smaller panel opens on top: the unit's name, LEVEL UP!, "LV 3 ▶ LV 4" and its stat rows; the rows that grew slide in one by one (+1 in green, an up arrow, a white highlight that fades), the others stay dim. Z / Enter / tap finishes the count or shows all rows at once, then goes to the next panel; under autoplay the windows advance at a fixed pace. When the last window closes the game gets `onDone` and carries on.

Growth is data the designer edits: per class, a percent chance per stat per level (`{hp: {rate: 85, amount: 3}, str: 55, def: 50}`), optional caps, rolled with the module's own RNG seeded by (seed, unit id, level), so the same seed always gives the same gains whatever the order of fights. A guaranteed minimum (default 1) gives the highest-rate stats that did not grow +1, so a level is never empty. The EXP curve is a formula (`base × level^power`) or a table.

It is a UI addon with one rule about the game's state: **stats change only through the game's setter**, called inside `award()`, once per stat that grew, and read back with the getter. The module never touches the game's RNG, gold or units directly. It keeps the EXP state (level and EXP per unit id) itself and hands it out as plain JSON for saves.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `when` | after every won battle: EXP and gold from the defeated enemies, for every living party member | text, **required** | When EXP is awarded and the window shows, in the designer's words |
| `base` | 20 | 5–100 | EXP to go from level 1 to 2 |
| `power` | 1.5 | 1–2.5 | EXP from level L to L + 1 = round(base × L^power): 20, 57, 104, 160, 224 … |
| `maxLevel` | 20 | 5–99 | Levels stop here; the gauge shows MAX |
| `minGain` | 1 | 0–3 | Stats that must grow per level (the highest-rate ones that did not roll) |
| `seed` | 1 | 1–999 | Growth seed |
| `countMs` | 1500 | 0–3000 | Count-up time of EXP, gold and gauges |
| `autoMs` | 900 | 300–2000 | Autoplay: how long a finished window stays |
| `panel` | on | on, off | Level-up panel per unit |
| `share` | each | each, split | Every living unit gets the full EXP, or it is divided |
| `autoGrowth` | apply | apply, hold | Under autoplay: apply growth, or hold it (stats unchanged, so `?auto=1` ends as before) |
| `tint` | a | a, n, b | Window colour (pixel16 team ramps) |
| `dim` | 0.4 | 0–0.6 | Darkening of the field behind the windows |

Module-only settings (README): `rowMs` 160, `apply` now / later / never, `title` RESULTS, `width` 0 (= min(208, field − 12)), `margin` 6, `openMs` 100, `table` (EXP totals per level), per-unit `rates` / `caps`.

## 3. Variants

- **Classic 16-bit RPG** (defaults): blue window, 1.5 s count, a panel per levelled unit.
- **Quick tallies (tactics, per unit)**: 0.7 s count, 0.6 s autoplay pace: one short window after each unit's attack.
- **Long grind**: base 40, power 1.8, level cap 99.
- **Generous growth**: two guaranteed gains per level, a flatter curve.
- **Shared pool**: EXP split between the living units.
- **Autoplay keeps its ending**: `autoGrowth: hold`.

## 4. Interface

**Needs**
- `units()`: the party now, `[{id, name, cls, alive, level, get(key), set(key, value, gain)}]` (or `getStat` / `setStat` options). Stat keys are the game's own field names.
- The one place in update logic where a fight / wave / map is won: `award(exp, gold, {title, onDone})`. Per-hit EXP: `addExp(id, n)`, counted in at the next award that includes the unit (`award(0, 0, {units: [id]})` for one unit).
- The confirm input while `busy()`: `press()` / `tap()` on the key-down edge, or `key(e.code, down)`.
- A fixed update step: `update(stepMs)` every step, also while the world is paused.
- The play field `{x, y, w, h}` and UI rects (`uiRects()`, or `getObstacles()` rects without `id`) to keep clear.
- Optional: `autoplay` flag (function), `onLevel(info)`, `onSfx(name)`.

**Provides**
- `level(id)`, `exp(id)`, `toNext(id)`, `expFor(level)`, `levelOf(exp)`; `award()` returns `{levelUps, units: [{id, fromLevel, toLevel, gained, gains}]}` at once.
- `busy()`: true from `award()` until the last window has closed (awards during a window are queued).
- `onDone({exp, gold, title, levelUps, skipped, auto, applied, units: [{id, name, fromLevel, toLevel, expBefore, expAfter, gained, gains, values}]})`, synchronous inside `update()`.
- `serialize()` → `{v: 1, units: {id: {level, exp}}, banked}`, `restore(obj)`, `reset()`.
- `pendingGains()` / `applyPending()` for held growth; `rect()`: the window(s) on screen.

**Delivery (v1).** `module/level-up-growth.js` (one global, `GameDNA_LevelUpGrowth`; growth table format, API, 15-line integration, caller checklist and self-check in `module/README.md`). Draws the windows with `skin.frame(…, {role: 'window', team: tint})`, the highlighted rows with `{role: 'row'}`, the EXP / GOLD strip with `{role: 'backing'}` and the gauges with `skin.bar(…, 'queued' | 'ready' | 'charge', {style: 'gauge'})` when `skins/skin-api.js` is loaded; text uses the built-in C-03 6×8 font coloured from skin tokens on pixel skins and `skin.text()` / `skin.measure()` on smooth skins; without skin-api it falls back to its own copy of the pixel16 look. Verified on two unseen hosts (scratch copies, `checks/hosts/`): the side-view battle (a tally after each wave, growth carried into the next wave) and the tactics map (EXP per hit and kill, a tally for the unit after its attack, a map-end tally): `?auto=1` still ends (victory wave 3; won turn 8), 0 errors, judge probe counters 0. The demo runs on the same module.

## 5. Screen rules (exact numbers)

Native canvas (256×224 in the demo), integer-scaled with nearest-neighbour (pixel skins).

- **Dim**: the whole field in `ink` at `dim` × open fraction, under the windows.
- **Results window**: width = min(208, field width − 12) (at least 150), centred horizontally; height = 36 + rows × 15 + 6 (87 for three units). If that does not fit beside the UI rects, rows are 11 px; rows that still do not fit are summarised as "+N MORE". Vertical position: among the y positions clear of every UI rect (at least 6 px from the field edges), the one with the lowest cost = distance from the field centre + 4 × the area it covers of sprite rects (`getObstacles()` rects with `id`, e.g. the party), so the heroes stay visible when there is room; nothing clear → centred, one warning. pixel16 window: 4-band gradient (`a` `#3a64d8 #2c50b8 #223e96 #1a2e74`) at 95 %, ink edge with cut corners, bevel, four gold rivets.
- **Header**: title centred, top + 7, `text.title`. EXP / GOLD strip: a `backing` band 11 px high at top + 18; "EXP" (`text.label`) at left + 10, its value right-aligned at centre − 8; "GOLD" at centre + 4, its value right-aligned at right − 10 in `text.gold`.
- **Unit rows** (from top + 36, 15 px pitch): name at left + 10 (`text.main`, `text.select` once levelled; clipped to fit), "LV" (`text.dim`) at gauge − 34, the level right-aligned at gauge − 6; a fixed right column, as wide as the widest of "NEXT 9999", "LV UP!" and "MAX" (51 px in the 6×8 font), right-aligned at right − 9: "NEXT n" (`text.dim`), "MAX", or "LV UP!" (`text.accent`; after its first 600 ms it pulses to `text.main` for 250 ms of every second, never hidden); gauge from left + min(96, 44 % of width) to 4 px before that column (53 px at width 208), 5 px high (4 in compact rows), kind `queued` (cyan), `charge` (gold) at max level. A levelled row gets the `row` band (x + 5, y − 2, width − 10, 13).
- **Count**: EXP, gold and each gauge interpolate linearly over `countMs`; a gauge that passes a threshold shows full in `ready` (white) for 160 ms, wraps, and the level number blinks (100 ms on / off, 400 ms). `onSfx('count')` every 66 ms.
- **Level-up panel**: as wide as the results window (at least 136) × (8 + 9 + 3 + 9 + 5 + stats × 10 + 6) (100 px for 6 stats), centred on the results window's centre with the same placement rule, solid `ink` under its frame; the results window behind it is darkened with `ink` at 50 %, so no clipped tally text shows beside it. Name (`text.gold`) at left + 10, "LEVEL UP!" right-aligned at right − 10 (`text.accent`, pulsing to `text.main` 200 ms of every 800, never hidden). The stat block (136 px) is centred: offset b = (width − 136) / 2. A `backing` strip "LV a ▶ LV b" at b + 10 (`(+n)` when several levels). Stat rows from strip + 14, 10 px pitch: label at b + 10 (`text.label` if it grows, else `text.dim`), value right-aligned at b + 74, "+N" (`fx.heal`) at b + 82 sliding in from 6 px to the right over 120 ms, an up arrow (`text.accent`) at b + 122. Growing rows reveal one every `rowMs` (160 ms), each with the `row` band and a white flash fading from 55 % over 280 ms (pixel skins). The panel waits after (rows + 1) × `rowMs`.
- **Open / close**: the results window grows from its centre line over 100 ms (quarter steps on pixel skins); presses are ignored for the first 160 ms. A blinking 5×3 arrow at bottom right − 14 when a window waits for the player (not in autoplay).
- **What the HUD shows**: `shown(id, key)` / `shownLevel(id)` give the old value until the unit's panel row slides in (or the count ends when there is no panel); the HUD reads these, so it changes in step with the panel, never before it.
- **Draw order**: world → effects → HUD → windows (last, outside any shake translate).

## 6. Common mistakes (symptom → fix)

- **The panel says +1 ATK but the next fight hits as before** → the setter writes a copy or a field the formulas do not read (`unit.stats.atk` vs `unit.atk`). The console warns ("the getter returns …"); write where combat reads.
- **After a restart the party starts with grown stats** → the setter wrote into a shared template (a class or roster table every new unit copies). Give each unit its own copy of its stats, or write to the unit object; `reset()` the module on new game.
- **EXP is awarded again every frame / twice per win** → `award()` sits in a per-frame branch ("while phase == victory"); call it once, where the win is decided.
- **The tally flashes past / the first press skips it** → the confirm that won the fight is routed to `press()` too; route the key-down edge only (the first 160 ms are ignored anyway).
- **The world keeps moving under the window** (the next wave starts, banners time out) → gate the whole fixed step on `busy()` and return.
- **`?auto=1` hangs on the window** → pass the autoplay flag as `autoplay`; keep `update()` in the fixed step the fast-forward loop calls.
- **`?auto=1` now ends differently** → expected: the party grows. If the original outcome must stay, `autoGrowth: 'hold'`.
- **The HUD shows the new stats before the panel reveals them** (the setter runs inside `award()`) → print `lv.shown(id, key)` / `lv.shownLevel(id)` in the HUD, or use `apply: 'later'` + `applyPending()` in `onDone`.
- **Max HP grows but the HP bar looks emptier** → in the setter for max HP also add `gain` to current HP (living units).
- **A banner or results overlay fights the window** → draw it only when `!busy()`.
- **Per-hit EXP never shows** → `addExp()` only banks; an `award()` that includes the unit (or `award(0, 0, {units: [id]})`) shows it.
- **Levels reset after loading a save** → save `serialize()` with the stats and `restore()` both.

## 7. Acceptance moments (what to screenshot, what must be visible)

1. **Count-up** (demo `?t=2900&freeze=1`): VICTORY, EXP 24 / 45 counting, Brenna's and Tamsin's gauges flashing white as they wrap to LV 2, Corin's gauge filling with NEXT 33; the window sits above the party (all three heroes visible, the levelled ones hopping), the HUD still shows the old HP / STR.
2. **Tally done** (`?t=4000`): EXP 45 GOLD 12, two rows with LV UP! and the row band, Corin NEXT 12 in its own column right of the gauge.
3. **Panel rows** (`?t=4900`): Brenna LV 1 ▶ LV 2, HP 33 +3 and STR 10 +1 revealed with the highlight, DEF still showing its old value; the HUD shows HP 33 STR 10 (just revealed), Tamsin still HP 20.
4. **Guaranteed minimum** (`?t=15000`): Tamsin LV 2 ▶ 3 with only MAG +1 (with `?minGain=0` the same level has no gain at all).
5. **Multi-level** (`?t=39800`): Brenna LV 4 ▶ LV 6 (+2), gains summed over both levels.
6. **No level-up** (`?t=47900`): a tally where every row shows NEXT n (three digits, clear of the gauge), no panel follows.
7. **Non-pixel skin** (`?skin=flat-demo&t=5800`): rounded light windows, smooth text, the same layout.
8. **Unseen hosts**: the battle's WAVE 1 CLEARED tally and Bram's panel (HP 110 +6, the HUD's max HP moving to 110 as the row slides in, Ivy's MP 34 and Rusk's HP 80 still unchanged until their panels), the victory panels; the tactics map's per-unit tally after the Captain's attack and the OUTPOST TAKEN tally; `?auto=1` ends (and with `autoGrowth: 'hold'` ends with the original's exact stats).
