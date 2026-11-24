# G-07 Upgrade draft (pick 1 of 3)

## 1. What it is

The roguelite level-up choice. At a moment the game chooses (a level-up, a chest, a cleared wave) the world freezes, the field dims and a gold title drops in (LEVEL UP, TREASURE, WAVE CLEAR) over slow light rays. Three cards deal in from below on an arc, one after another, landing in a slight fan; each flips face up as it lands. The face shows the rarity chip (COMMON slate, RARE blue, EPIC violet with turning light rays and a sparkle burst on the flip), a medallion with the upgrade's tag icon drawn in code, the name, its tags, a one-line effect with the numbers in gold, the stat preview `ATK 6 -> 8` and pips for the stacks owned and the one this pick would add. The selected card lifts, straightens, scales up and glows; the others dim slightly. A card that shares a tag with the build gets a gold SYNERGY ribbon, its shared tag turns gold and the owned slots with that tag glow. Arrows move, Z takes, R rerolls (cards flip back and sweep away, a new hand deals), X skips. On a pick the card pulses white, the other two fall away, the card condenses into its medallion, which arcs into the owned-upgrades strip with a light trail; the slot pops with a ring and sparks, then the overlay fades and the game resumes.

The upgrades are a table the designer edits: `{id, name, rarity, tags, text: '... {value} ...', value, max, weight, delta: {stat: amount}, apply(target, info), requires}`. Each hand is drawn by the module's own RNG from (seed, draft number, reroll number): a rarity by weight among the rarities that still have something to offer, then an upgrade of that rarity; no duplicates in a hand, nothing at its max stacks, requirements met, and an optional fallback (e.g. "Heal 25 HP") when the pool runs dry.

It is a UI addon with one rule about the game's state: **the module never changes the game itself.** A pick reaches the game through the game's `applyDelta(stat, amount)` (declarative deltas), the table's own `apply(target)` (designer code) and `onPick(upgrade, info)`, synchronously inside `update()` at the step the player confirms. The same code draws smooth HD cards (any resolution) and crisp pixel cards (whole pixels, 6x8 bitmap font, thresholded icons, flips quantised; readable at 256x224).

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `when` | at every level-up, instead of the fixed stat bonus | text, **required** | When the draft opens, in the designer's words |
| `seed` | 1 | 1-999 | Draw seed (the module's own; never the game's RNG) |
| `choices` | 3 | 2-4 | Cards per draft |
| `rerolls` | 1 | 0-3 | Rerolls per draft |
| `skip` | on | on, off | The X skip |
| `wCommon` / `wRare` / `wEpic` | 60 / 30 / 10 | 0-100 | Rarity weights (per card slot, among the rarities left in the pool) |
| `maxStacks` | 5 | 1-9 | Max stacks for entries without their own `max` |
| `look` | auto | auto, hd, pixel | auto = pixel when the field is under 300 px tall |
| `autoPick` | rarest | rarest, synergy, first, skip | What autoplay takes (skip = nothing applied, so `?auto=1` ends as before) |
| `strip` | draft | draft, always, off | Owned strip inside the draft, also in a free corner during play, or none |
| `dim` | 0.55 | 0-0.85 | Darkening of the field behind the cards |

Module-only settings (README): `dealMs` 380, `stagger` 90, `flipMs` 260, `tilt` 5 degrees, `autoMs` 1100, `armMs` 180, `openMs` 240, `synergy` on, `reduced` off, `title`, `subtitle`, `skipLabel`, `pixelBelow` 300, per-entry `weight` / `requires` / `value` arrays, `fallback`.

## 3. Variants

- **Classic roguelite** (defaults): 3 cards, 1 reroll, skip allowed, 60 / 30 / 10.
- **Generous chest**: 4 cards, 2 rerolls, 40 / 40 / 20.
- **Hard run**: no reroll, no skip, epic weight 5.
- **Build-focused autoplay**: autoplay takes the card with the most synergy.
- **Pixel console**: crisp pixel cards, owned strip always visible in a free corner.
- **Autoplay keeps its ending**: `autoPick: skip`.

## 4. Interface

**Needs (from the game)**
- The ONE place in update logic where the moment happens: call `open({title})` there, once per event. If a level-up used to give a fixed bonus, that bonus goes (the draft replaces it); level, XP and heals stay. Several at once queue.
- The stat fields the game really reads, written by `applyDelta(stat, amount)`; `getStat(stat)` for the card's preview and the read-back check; `target()` for table entries with `apply`.
- Input while `busy()`: `key(code, down)` first in the key handler (arrows / A / D, Z / Space / Enter, R, X / Escape), or `press('left' | 'right' | 'confirm' | 'reroll' | 'skip')` on key-down edges for polled input; `pointer(x, y, down)` for mouse / touch.
- `update(dt)` every fixed step, also while the world is paused; the pause gate before the world and the autopilot.
- The field size in native px (`view` / `bounds`) and the HUD rects (`uiRects`).
- Optional: the autoplay flag; `serialize()` / `restore()` in the save; a `fallback` upgrade.
- With G-02 level-up growth: chain (open the draft in G-02's `award(..., {onDone})`, once per level gained, after the tally) or replace (G-02 keeps EXP and levels with `{rates: {}}` per class and `minGain: 0`; the draft is the growth). One pause gate: `lv.busy() || draft.busy()`.

**Provides (to the game)**
- `onPick(upgrade, info)` and `onDone(result)`, synchronous, inside `update()`; `busy()`.
- The build: `owned()`, `stacks(id)`, `has(id)`, `tagCount(tag)`; `drawStrip(ctx, x, y)` for a HUD.
- `GameDNA_UpgradeDraft.deal(table, owned, opts)`: the draw as a pure function.
- `rect()` (the overlay), `lastDrawn()` (cards and strip), `state()` (stage, hand, cursor, rarities, synergy).

## 5. Screen rules (exact numbers)

- Layout inside the field minus the UI rects that overlap the cards' span (top band / bottom band). HD (640x360 reference, scales with the field): title band 72 (62 for title and subtitle + 10 reserved for the 14-unit lift and the pick pulse), cards 148 x 201 with 22 gaps, hint row 28, strip 36, 8 between rows; it shrinks to 62 % before overlapping a UI rect. 4 cards narrow to fit 94 % of the width. Card contents scale with the card. The SYNERGY ribbon sits on the medallion's lower edge, inside the card. Effect text fits between the tag row and the stat preview: font 11.5 -> 9 units in 0.5 steps, then the last line is ellipsized. No card (rotated box, any stage) ever touches the title or subtitle: `checks/layout.py` asserts it over every frame for all sample tables, 2-4 cards, HD and pixel.
- Pixel (field under 300 px tall): cards up to 76 wide, at least 100 tall and taller when a card's text needs it (rows: rarity band, medallion r 9, name 1-2 lines, a tag row of 7 px icons with the shared tags underlined in gold and SYN, effect lines 9 px, stat preview), 6 px gaps, title 2x bitmap font on a dark band with gold hairlines, 6x8 proportional font, icons thresholded at alpha 100 with a 1 px ink outline and lower-right shade; every position on whole pixels; flips quantised to whole-pixel widths, smoothing off; rarity glow = a 1 px ring blinking at 180 ms, epic adds a dithered halo.
- Timing (module clock, ms): overlay and title 240; card j starts dealing at 0.55 x 240 + j x 90, deal 380 (ease-out-back 1.25 from below the field, rotation -20 deg to the fan angle (j - mid) x 5 deg); flip 260 starting at 80 % of the deal; the player can take a card 180 ms after the last flip (about 1.1 s after `open()`); a confirm during the deal finishes the deal and does not pick. Pick: pulse 170, condense 200, fly 420 (quadratic arc, peak 70 px above), land 220, fade 230: `onDone` about 1.24 s after the pick. Reroll: flip back and sweep away 360, then a new deal. Skip: fall away 300, fade 230.
- Selected card: lift 14 px (pixel 4), scale 1.055 (pixel none), straightened and out of the fan; others get a 28 % dark veil. The caret sits in a reserved gap under the card's rest position (HD tip 2 units below, 7 tall; pixel 3 rows from 1 px below), never in the hint row; the gap also holds the lower corners of the fanned outer cards (fan drop 4 units per step from the middle).
- Hint row: HD key caps on a dark pill (82 % ink); pixel text on a full-width dark plate (85 % ink, 11 px). The pointer cursor shows over cards and the R / X hints (`hitTest(x, y)`).
- Pixel stat preview fits inside the card with 2 px clear: `LABEL from->to`, else `LABEL +amount`, else a 3-letter label, all in normal spacing; then the two short forms in condensed (0 px) spacing; else `+amount`. Pixel names and effect lines wrap at card width - 8 and condense when one word is still too wide. Synergy ribbon 15 px tall, centred on the top edge.
- Autoplay: the cursor moves to the pick at 45 % of `autoMs` (1100), the pick at 100 %.
- Deterministic: the clock is `update(dt)` only; particles are a pure function of age; nothing reads wall time or `Math.random`.

## 6. Common mistakes (symptom -> fix)

- The card says +2 ATK but damage is unchanged -> `applyDelta` writes a copy or a field combat never reads; write the field the damage code reads (the console warns when `getStat` disagrees).
- A new stat (crit, thorns, magnet) does nothing -> nothing in the game reads it yet; add the read where it matters, or drop the entry.
- A restart keeps the upgrades -> call `reset()` where the game restarts, and restore base stats (not a shared template that `applyDelta` changed).
- The world, enemies or the autopilot move under the cards -> gate the whole fixed step on `busy()` before the autopilot.
- `?auto=1` hangs on the cards -> pass the autoplay flag as `autoplay`; keep `update()` in the fixed step the freeze loop calls.
- `?auto=1` ends differently -> the player got stronger; allowed if it still ends. `autoPick: skip` keeps the original ending; say which in your notes.
- The press that levelled up picks a card at once -> it cannot (presses during the deal only finish the deal; a pick needs the cards face up 180 ms); if it happens, `press()` is called every frame the key is held: send key-down edges only.
- The same hand every level-up, or maxed upgrades come back -> the draft is re-created per level-up (the counter and build are lost); create one instance at boot.
- Two drafts at once after a double level-up flash on top of each other -> call `open()` per level; the module queues them; never loop until not busy.
- The old "+2 ATK" line still shows under the cards -> remove the fixed bonus and its message; the draft replaces it.
- Cards cover the HUD -> pass the HUD bars in `uiRects()`; the cards lay out between them.

## 7. Acceptance moments (what to screenshot, what must be visible)

1. **Deal** (about 0.35 s after `open()`): the title over the dimmed field, two or three card backs on their arc, the first one flipping.
2. **Choose** (about 1.5 s): three faces up, the middle one lifted with a white edge and the pointer under it; rarity chips, icons, names, numbers in gold, stat previews; the hint row (arrows, Z, R with the reroll count, X).
3. **Synergy**: a card whose tag matches an owned upgrade shows the SYNERGY ribbon and the gold tag; epic cards glow violet with rays.
4. **Pick**: the chosen card flashes; the others fall away; the medallion flies on an arc into the strip; the slot pops; the HUD stat changed by the card's number.
5. **Reroll / skip**: the cards flip back and sweep down, a new hand deals (the reroll count drops); a skip lets the cards fall and closes with nothing added.
6. **Pixel** at 256x224, nearest-neighbour x3: text, icons and frames on whole pixels, nothing blurred, every word readable.
7. `?t=<ms>&freeze=1` twice gives the same frame; `?auto=1` ends with no console errors.
