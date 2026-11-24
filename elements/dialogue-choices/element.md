# H-02 Branching choices with flags

## 1. What it is

The console-RPG question. A character asks something ("Will you help me light the lanterns?"); as soon as the line has typed out, a small bevelled window opens beside the text box with two to four answers and a white pointing hand on the first one. Up / down move the hand (it wraps), Z / Enter / a tap picks. An answer the player cannot take yet stays in the list in grey, and when the hand rests on it a red line at the bottom of the window says why ("Need 10 gold"); pressing Z there only buzzes and flashes the reason. A tense question can carry a countdown: a bar drains along the bottom and, when it runs out, the default answer is taken for you.

Every pick can set story flags (`plan: "mill"`, `gold - 10`, `metElder: true`), and every later line can check them: a line with `if: 'hasOil'` is only spoken when it is true, `{$gold}` prints the current value, a `once` line ("Evening, traveller!") is only said the first time and a `once` answer ("Why forty lanterns?") disappears after it was asked. Answers jump to labels, so a three-way branch can split into three replies and rejoin at one line. The script is a plain object of arrays the designer edits; `validate()` lists labels nothing reaches, `goto`s with no label, flags that are read but never set (typos) and broken conditions. The flags are plain JSON, so a save system stores them with the rest of the game.

It is a UI addon on top of a text box: it drives the H-01 typewriter box through that module's public API (per-talk `onLine` / `onLineEnd` hooks, `insert`, `next`, `end`), or the game's own text box through a three-function adapter. It never reads the keyboard by itself, never touches the game's RNG, and decides nothing the script does not say.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `scope` | the main quest giver: accept, ask about the reward, or ask for advice (once each); the advice gives a small bonus, the reward question changes the later thanks | text, **required** | Which talks branch and what the choices change |
| `menuPlace` | auto | auto, right, left | Side of the menu next to the text box (auto = right, but the side away from the speaker when the right would cover them) |
| `timeout` | 0 ms | 0–15000 | Countdown for every menu without its own `timeout` (0 = wait) |
| `wrap` | on | on, off | The cursor wraps from the last option to the first |
| `disabled` | show | show, hide | Options whose `if` is false: grey with a reason, or left out |
| `tint` | a | a (blue), n (slate), b (red) | Menu window colour (pixel16 team ramps) |

Module-only settings (README): `autoplayMs` 600, `openMs` 80, `armMs` 60, `margin` 6, `minWidth` 64, `maxWidth` 0. Per question line: `default`, `timeout`, `cancel`, `tint`. Per option: `if`, `reason`, `hint`, `hide`, `once`, `id`, `set`, `inc`, `goto`, `end`.

Fixed timings: the menu opens the step after the question's last page is complete (no extra press), grows from its centre over 80 ms in four steps and ignores confirm for 140 ms (open + arm), so the press that finished the text cannot pick. Autoplay: the hand moves to the default at 300 ms and picks at 600 ms. The countdown starts when the menu is fully open. A disabled pick flashes the reason for 300 ms.

## 3. Variants

- **Classic RPG menu** (defaults): blue window right of the box, no countdown, locked options shown with a reason.
- **Timed decision**: 5 s countdown on every menu, red window.
- **Clean menu**: locked options hidden.
- **War council**: slate window on the left, cursor does not wrap.

## 4. Interface

**Needs**
- A text box: a `GameDNA_DialogueBox` instance (`box:`; talk then updates, draws and routes input for it) or the game's own box via `adapter: {show(line, done), close(), rect()}`.
- The game's talk function, in update logic: `start(name, {onEnd})`; what ran after the old talk moves into `onEnd`.
- Input on key-down edges while `busy()` (box mode) or `choosing()` (adapter mode): `move(-1 | 1)`, `press()`, `back()`, `hold(down)`, or `key(code, down)`, `tapAt(x, y)`.
- A fixed step: `update(stepMs)` every step, also while the world is paused.
- The play field and UI rects (`uiRects()` / `getObstacles()`, rects without `id` are never covered).
- Optional: autoplay flag, `onFlag` for game effects, save / load of `getFlags()`.

**Provides**
- `busy()`, `choosing()`; `onChoice({conv, at, index, id, text, how})` and `onEnd({conv, lines, choices, path, skipped, auto, flags})`, both synchronous inside `update()`.
- The flag store: `get`, `set`, `inc`, `check('gold>=10 && !metElder')`, `onFlag(name, value, old)`, `getFlags()` / `setFlags()` / `resetFlags()` (plain JSON, once-marks included as `seen:<talk>:<id>`).
- `validate(script)` → `{ok, errors, warnings, unreachableLabels, unknownTargets, unknownFlags, unusedFlags}`.
- `menuRect()` for other overlays; `state()` for tests.

**Delivery (v1).** `module/dialogue-choices.js` (one global, `GameDNA_DialogueChoices`; script format, API, box-mode and adapter-mode examples, caller checklist and self-check in `module/README.md`). Draws the window with `skin.frame(…, {role: 'window', team: tint})`, the selected row with role `row`, the hand with `skin.cursor(…, 'hand')` and the countdown with `skin.bar(…, 'charge' | 'enemy')` when `skins/skin-api.js` is loaded; text uses the C-03 6×8 font coloured from skin tokens (`text.main`, `text.select`, `text.dim`, `text.red`, `text.label`) on pixel skins and `skin.text()` on smooth skins; without skin-api it falls back to its own pixel16 copy. It needs no change to H-01: everything goes through H-01's public API. Verified on two unseen hosts (`checks/hosts/`): the top-down quest in adapter mode with the game's own black text box (the elder's 4-way question, the herb raises max HP, the reward question changes the thanks) and the side-view battle in box mode with H-01 (a pre-battle plan with a countdown and a locked option; the victory line reads the plan): `?auto=1` ends the same as the original, 0 errors, real keys browse, buzz, pick, time out and click.

## 5. Screen rules (exact numbers)

Native canvas (256×224 in the demo), integer-scaled with nearest-neighbour (pixel skins).

- **Window**: width = max(widest option + 23, widest reason + 12, 64), at most field width − 2 × 6; text wider than that is cut with `...`. Height = 5 + 12 × options + 4, + 12 when any option has a reason or hint, + 6 with a countdown (57 px for 3 options with a reason row, no countdown). pixel16 window: the same bevelled 4-band gradient as the dialogue box (`a` `#3a64d8 #2c50b8 #223e96 #1a2e74`), ink edge with cut corners, light bevel top/left, dark bottom/right, gold rivets.
- **Rows**: 12-px pitch from window top + 5; text at x + 14, row y + 1 (6×8 font, 1-px drop shadow `text.shadow`). Selected row: `row` band (`ui.select`, 20 % white in pixel16) at x + 3, width − 6, 11 px high; text `text.select` `#fff4c0`; others `text.main` `#ffffff`; disabled `text.dim` `#8088a8`.
- **Cursor**: 7×5 pointing hand (`text.pointer` on `text.pointerEdge`) at x + 4, row y + 2, nudging 1 px right every 250 ms.
- **Reason row**: a 1-px shadow rule, then the reason in `text.red` `#ff8a7a` (disabled) or the hint in `text.label` (enabled), at x + 6. Empty when the option under the hand has neither.
- **Countdown**: 4-px bar at x + 6, width − 12, along the bottom; `charge` gauge, `enemy` (red) under 30 % left.
- **Placement**: next to the text box with a 2-px gap: above it when the box's centre is in the lower half of the field, below otherwise; right-aligned 4 px in from the box's right edge (`left`: 4 px from its left edge). Four candidates (preferred side × the two alignments, then the other side); a candidate is rejected if it leaves the field, touches the box or a rect without `id`; among the rest the cost is order × 50 + 4 × px² over the speaker + 0.5 × px² over sprites with `id`. None clear: the field is scanned in 2-px rows from the preferred spot; still none: drawn at the preferred spot with one warning, never at the screen centre. It never moves while open.
- **Open**: grows from its centre line over 80 ms in quarter steps; rows appear when fully open.
- **Draw order**: world → effects → HUD → text box → menu (last, outside any shake translate).

## 6. Common mistakes (symptom → fix)

- **The menu picks the first answer the moment it opens** → the confirm that finished the question is routed again on later frames ("is down" instead of "pressed"); send key-down edges only. The menu ignores confirm for its first 140 ms.
- **The box runs twice as fast after adding choices** → box mode: `talk.update()` already updates the box; remove the old `dlg.update()` / `dlg.draw()` / `dlg.press()` calls.
- **Adapter mode: the text box skips ahead under the menu** → while `choosing()`, the game's own box must not take confirm; put the `choosing()` block before the box's input.
- **Adapter mode: the question disappears while the menu is up** → handle `show(line, null)`: keep that line on screen without expecting an advance.
- **`?auto=1` ends differently** → a menu's `default` changes the story; set `default` to the answer that keeps the original path, and pass the autoplay flag.
- **A later line never shows / always shows** → a typo in a flag name or a flag missing from `flags`; run `validate()` (unknown flags) and declare every flag with its start value.
- **"goto: no such label", the talk ends early** → the label is in another conversation or misspelt; `validate()` lists it under errors.
- **A once-line comes back after loading a save** → the save did not include `getFlags()` (once-marks are flags `seen:…`), or the line has no `id` and the script was edited; give once-lines an `id`.
- **New game keeps old answers** → call `resetFlags()` (and `clear()`) where the game starts over.
- **The menu covers the HUD** → return the HUD from `uiRects()` (rects without `id`), or keep `bounds` above it.
- **Every option grey, the talk seems to skip the question** → all options' conditions are false; the module goes on after the line with a warning. Give one option no condition.

## 7. Acceptance moments (what to screenshot, what must be visible)

1. **Disabled with reason** (demo `?t=6300&freeze=1`): Mira's question in the box at the bottom, the menu above it on the right, the hand on the grey "Buy a flask (10 gold)", "Need 10 gold" in red at the bottom of the menu, Mira uncovered.
2. **Three answers** (`?t=7300`): the hand on "Why forty lanterns?" (once).
3. **Once option gone** (`?t=11500`): back at the same question, two answers left.
4. **Flag in text** (`?t=15200`): "…You carry 8 gold…" after the mill answer.
5. **Unlocked by a flag** (`?t=25600`): after finding 5 gold, "Buy a flask" is white and selectable; after it (`?t=29600`) the lanterns are lit and HUD shows OIL.
6. **Countdown, box at the top** (`?t=40800`): Brann (bottom right) speaks, the box at the top, the menu below it, two grey answers, the bar half empty; at 5 s "Turn back" is taken.
7. **A later line changed by a flag** (`?t=49200`): Mira now says "The square is bright again" instead of asking.
8. **Non-pixel skin** (`?skin=flat-demo&t=6300`): white rounded window, smooth text, red reason.
9. **Unseen hosts**: top-down: the elder's 4-answer menu above the game's own black text box, HUD clear; battle: the pre-battle plan menu above the H-01 box with the grey "Pay them off" and the countdown bar; the victory line "Told you charging works!" after the plan was "charge"; `?auto=1` end state equal to the original.
