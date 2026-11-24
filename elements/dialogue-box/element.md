# H-01 Typewriter dialogue box

## 1. What it is

The classic console text box. When someone talks (an elder, a sign, a party member before a fight), a bevelled window opens along the bottom of the screen and the line types out letter by letter, with a short beat after each full stop and half a beat after each comma. A small name plate sits on the window's top edge, on the side of the screen where the speaker stands. When the page is complete a white arrow blinks and bobs on the bottom border (a small square on the very last page). Z / Enter / Space / a tap first shows the rest of the page at once, then turns the page or moves to the next line; holding the button fast-forwards. Long lines wrap by word at native resolution and split into pages of three rows. If the speaker stands where the window would go, the window opens at the top instead, and it never covers the HUD. While the window is open the world waits; when the last line closes, the game gets `onEnd` and carries on (a quest flag, the battle starting).

The script is data the designer edits: a plain array of `{speaker, text}` lines (narration has no speaker), with a few inline codes (`{gold}…{/}` colour, `{p300}` beat, `{page}` page break). Line objects are kept as they are, so H-02 (branching choices and flags) adds fields to the same objects and uses this element's `onLineEnd` hook.

It is a UI addon: it never reads the keyboard by itself, never touches the game's RNG, and decides nothing except when the conversation is over.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `scope` | everything the game already shows as text in a message box: talking to characters, reading signs, item and chest messages | text, **required** | Which text goes in the box, in the designer's words |
| `speed` | 40 | 0–120 letters/s | Typewriter speed; 0 shows the whole page at once |
| `pause` | 160 ms | 0–400 | Extra wait after `. ! ? …`; half after `, ; :` (only before a space or the end, so `3.5` and `...` inside a word do not stutter) |
| `rows` | 3 | 2–4 | Text rows per page |
| `place` | auto | auto, bottom, top | auto = bottom unless that covers the speaker, then top |
| `nameTag` | on | on, off | Name plate on the top edge |
| `autoAdvance` | 0 ms | 0–3000 | A complete page advances by itself after this long; 0 = wait for the player |
| `hold` | on | on, off | Holding confirm fast-forwards |
| `tint` | a | a (blue), n (slate), b (red) | Window colour (pixel16 team ramps) |
| `dim` | 0 | 0–0.5 | Darkening of the field behind the box |

Module-only settings (README): `width` 0 (= field width − 2 × margin), `margin` 6, `ffSpeed` 4, `tickEvery` 2, `openMs` 100, `autoplayMs` 600, `arrow` on. Per line: `speed`, `pause`, `auto`, `place`, `tint`, `nameColor`, `label`, `who`, `anchor`.

Fixed timings: the box opens in 100 ms (four steps on pixel skins) and ignores presses while it opens; text starts after it is open; a 40-letter line takes about 1 s plus pauses; fast-forward starts 240 ms into a hold that began with a press after the box opened, runs at 4× without pauses and turns complete pages after 160 ms; autoplay keeps each complete page 600 ms; close 100 ms.

## 3. Variants

- **Classic 16-bit RPG** (defaults): blue window, 3 rows, 40 letters/s.
- **Snappy**: 80 letters/s, 80 ms pauses, hold on.
- **Storybook**: 24 letters/s, 260 ms pauses, 4 rows, slate window, 0.2 dim.
- **Cutscene**: 32 letters/s, auto-advance 1.5 s, hold off (per-line `auto` for exact beats).
- **Battle messages**: 60 letters/s, 2 rows, top, slate.

## 4. Interface

**Needs**
- The game's existing text function (or the moments named in `scope`), in update logic: `open(lines, {onEnd})`; what ran after the old text closed moves into `onEnd`; the old dialog flag stays set while the box is open.
- The confirm input while `busy()`: `press()` / `tap()` on the key-down edge, `hold(down)` for fast-forward, or `key(e.code, down)` for raw keys (returns `true` only for Z, Space, Enter).
- A fixed update step: `update(stepMs)` every step, also while the world is paused.
- The play field `{x, y, w, h}`; optional `getAnchor(who, line)` → the speaker's sprite rect on screen; UI rects (no `id`: never covered) from `getObstacles()` / `uiRects()`.
- Optional: `autoplay` flag (function), `onTick(ch)` for the text blip, `onSfx(name)`.

**Provides**
- `busy()`: true from `open()` until the box has closed.
- `onEnd({lines, index, skipped, auto, line})`, synchronous inside `update()`.
- `onLine(line, i, ctl)` and `onLineEnd(line, i, ctl)` (return `false` to hold the box on a line until `next()` / `goto()` / `end()`); `ctl.goto(label)`, `ctl.insert(lines)`: the extension point for H-02.
- `onTick(ch, index, line)` every `tickEvery` letters (at most once per step) and `onSfx('open' | 'page' | 'next' | 'close')`.
- `rect()`: the box plus its name tag, for other overlays.

**Delivery (v1).** `module/dialogue-box.js` (one global, `GameDNA_DialogueBox`; script format, API, 15-line integration, caller checklist and self-check in `module/README.md`). Draws the window with `skin.frame(…, {role: 'window', team: tint})` and the name tag with `skin.frame(…, {role: 'plate'})` when `skins/skin-api.js` is loaded; text uses the built-in C-03 6×8 proportional font coloured from skin tokens (`text.main`, `text.shadow`, `text.gold`, colour codes) on pixel skins and `skin.text()` / `skin.measure()` (font `ui`) on smooth skins; without skin-api it falls back to its own copy of the pixel16 look. Verified on two unseen hosts (scratch copies, `checks/hosts/`): the top-down quest (all its text: the elder, the chest) and the side-view battle (party lines when the battle starts and after the last wave): `?auto=1` ends the same as the original (battle: identical final HP / MP), 0 errors, real-keyboard taps finish and advance, holding fast-forwards. The demo runs on the same module.

## 5. Screen rules (exact numbers)

Native canvas (256×224 in the demo), integer-scaled with nearest-neighbour (pixel skins).

- **Box**: width = field width − 2 × 6 (or `width`), centred; height = 2 × 8 + rows × 11 − 3 (46 px for 3 rows). pixel16 window: 4-band vertical gradient (team ramp `a` `#3a64d8 #2c50b8 #223e96 #1a2e74`, `n` `#4c5a8a …`, `b` `#d85a48 …`) at 95 % opacity, 1-px ink edge with cut corners, light bevel top/left, dark bevel bottom/right, four gold rivets.
- **Text**: 6×8 proportional font (C-03 `regular`: caps 7 px, x-height 5, 1-px descenders), advance = glyph width + 1, space 4; 1-px drop shadow down-right in `text.shadow` `#0a0c24`; body `text.main` `#ffffff`. Rows at box top + 8, + 19, + 30 (11-px pitch); left inset 10 px; wrap width = box width − 20. Greedy word wrap; a word longer than a row breaks by letter; no leading spaces on a row.
- **Name tag**: 12 px high, text width + 12 wide, top 8 px above the box (overlapping its top edge by 4 px), 8 px in from the box's left corner, or from the right corner when the speaker's centre is right of the box centre + 18 % of its width. pixel16 plate: ink edge, `#1c2458` fill, `#5a6ac0` top line; name in `text.gold` `#ffe890` with the same drop shadow. Space for it (8 px) is reserved above the box for the whole conversation when any line has a speaker.
- **Arrow**: 5×3 down triangle with a 1-px outline (`text.pointer` `#fff8e8` on `text.pointerEdge` `#1a0e08`), on the bottom border 18 px from the right edge, so it never sits on text. Cycle 570 ms: 190 ms up, 190 ms 1 px down, 190 ms hidden. Last page of the last line: a 6×6 square (white with a gold top row) instead.
- **Placement**: the reserved rect (box + tag space) must not intersect any rect without `id`. Candidates: the lowest clear position scanning up from the bottom (`margin` from the field edge) and the highest scanning down from the top; preferred order bottom, top (`place: top` reverses it, `bottom`/`top` add a large cost to the other edge). A candidate covering the speaker rect (+2 px) costs 10⁶; sprites with `id` add 0.5 per px² covered, the second edge 400. If both edges cover the speaker, any clear y nearest the preferred edge (2-px steps) is used. Nothing clear: preferred edge + one warning. The box keeps its position for the next line unless that line's speaker or a UI rect would be covered. It never moves during a line.
- **Open / close**: grows from its centre line over 100 ms (stepped to quarters on pixel skins); text, tag and arrow appear when fully open.
- **Reveal**: one letter per 1000 / speed ms; pauses added after the letter; colour codes and `{p…}` cost no time; `onTick` every `tickEvery` non-space letters, at most once per `update`.
- **Draw order**: world → effects → HUD → box (last, outside any shake translate).

## 6. Common mistakes (symptom → fix)

- **Every battle caption waits for Z, autoplay takes 1.8× as long** (cold tests, all three battle runs) → self-clearing captions, combat logs and wave banners were routed through the box. Only text the player reads and dismisses goes in it (talk, signs, item / chest messages, story beats).
- **The VICTORY / GAME OVER overlay is gone** (two cold runs) → keep the game's own result overlays; if lines play there, draw the overlay after the talk.
- **Narration gets invented name plates ("You:", "Slime:")** → narration and system text have no `speaker`.
- **The box opens and immediately skips the first page** → the confirm that opened it is also routed to `press()` in the same step, or the game sends "is the key down" every frame. Route the key-down edge only; the module ignores presses while it opens.
- **Holding Z races through the whole talk** → that is fast-forward; it needs a fresh press after the box opened. If players hold the talk key to walk-and-talk, set `hold: 'off'`.
- **The world keeps moving under the box** (enemies walk into the hero, timers run) → gate the whole fixed step on `busy()` and return.
- **`?auto=1` hangs on the box / ends differently** → pass the autoplay flag as `autoplay` (pages then advance by themselves), keep `update()` in the fixed step the fast-forward loop calls, and move the after-text code into `onEnd` (synchronous; no promises).
- **The quest never advances** → the code that ran after the old text closed was left in the old advance branch, which no longer runs; move it into `onEnd`.
- **The autopilot or a test hook stops working** → it read the old dialog flag (`dialog`, `msg`, `talking`); keep that flag set while the box is open and clear it in `onEnd`.
- **The box covers the person talking** → `getAnchor` returns world coordinates or the wrong sprite; return the sprite's rect on screen (after the camera and any HUD offset), or pass `who` matching an `id` in `getObstacles()`.
- **The box covers the HUD / command panel** → return those rects without `id` from `uiRects()` (or exclude them from `bounds`).
- **A banner or results overlay fights the box for space** → draw the overlay after the talk (`!dlg.busy()`), or give it as a UI rect if it must stay up.
- **Text overflows or wraps oddly** → don't pre-wrap the strings; pass whole sentences; use `\n` / `{page}` only for deliberate breaks.
- **A sign or narration line shows a name plate** → leave `speaker` empty for narration; use `who` only to point at the object.

## 7. Acceptance moments (what to screenshot, what must be visible)

1. **Typing** (demo `?t=3000&freeze=1`): Mira's first line half typed, name plate "Mira" on the left top edge, the box at the bottom, Mira (top middle) uncovered, world paused.
2. **Page complete** (`?t=6500`): three full rows, arrow on the bottom border at the right, page 1 of 2.
3. **Speaker below** (`?t=21600`): Brann (bottom right) speaks; the box is at the top under the HUD strip, the plate on the right.
4. **Narration** (`?t=18300`): the sign text, no name plate, two rows (`\n`).
5. **Cutscene** (`?t=28800`): auto-advancing lines over a darkening scene.
6. **Non-pixel skin** (`?skin=flat-demo&t=10500`): rounded white window, smooth text with a gold highlighted word.
7. **Unseen hosts**: the top-down quest's elder and chest text in the box (HUD clear); the battle intro with the box at the bottom for Bram and at the top for Ivy, the victory lines before the VICTORY banner; `?auto=1` end state equal to the original.
