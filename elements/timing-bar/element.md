# F-01 Timing-bar minigame

## 1. What it is

A small overlay minigame the game can open for any "skill check" moment: picking a lock, a timed bonus on an attack, a hammer blow at the forge, reeling in a fish. A window opens over a slightly dimmed field (near the object being worked on, if the game says where it is). Inside is a dark bar with bevelled coloured zones: a wide green **good** band, a gold **great** band inside it, and a narrow pale-blue **perfect** band in the middle, marked by two small notches. A needle with a gold head sweeps the bar (back and forth, or one pass). The player presses the confirm key (or taps) once to stop it. The zone under the needle is the grade: the needle and the zone flash white, sparks jump from the needle, the word (`PERFECT!`, `GREAT!`, `GOOD`, `MISS`) pops above the window, a miss makes the window jolt sideways, a perfect asks the game for a 2 px screen shake. Then the window closes and the game gets `{grade, offset}` and acts on it (open the chest, multiply the damage, set the blade quality). Multi-press checks (forging: three blows) show one pip per press and give the floor of the mean grade.

It is a UI addon: it never reads the keyboard by itself, never touches the game's RNG, and decides nothing about the game except through the result.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `moment` | opening a locked chest or door (a lockpick; on a miss it stays locked and can be retried) | text, **required** | Where the skill check goes, in the designer's words. The prompt says: put it exactly there, nowhere else (cold tests without it put the bar on the battle Attack instead of the chest) |
| `difficulty` | normal | easy, normal, hard, expert | Preset for `speed`, `good`, `great`, `perfect`, `ease` (table below); a value also given explicitly wins |
| `speed` | 1.1 | 0.4–3 | Needle speed in bar widths per second |
| `good` / `great` / `perfect` | 0.30 / 0.14 / 0.05 | fractions of the bar | Nested zone widths, centred on one point |
| `motion` | pingpong | pingpong, linear | Back and forth, or one left-to-right pass (the end is a miss) |
| `ease` | none | none, sine, accel | sine: slow at the ends, fast in the middle; accel: +12 % per pass (max 6) |
| `hits` | 1 | 1–5 | Presses per check |
| `zones` | random | random, fixed | Zone centre from the seed (between 0.32 and the right end), or at `centre` (0.5) |
| `assist` | off | off, on | Accessibility: speed ×0.6, zones ×1.5 (perfect ≥ 6 %), result shown ×1.5 longer, no timeout |
| `width` | 160 px | 96–224 | Bar width; the window is 24 px wider |
| `position` | center | upper, center, lower | Where the window goes when the check has no anchor |
| `dim` | 0.3 | 0–0.6 | Darkening of the field behind the window |
| `shake` | on | on, off | Whether perfect / miss call `onShake` |
| `autoGrade` | good | good, great, perfect, miss, seeded | Grade autoplay resolves at |

Fixed timings: window opens in 140 ms, presses are ignored for the first 240 ms (`armMs`), 380 ms pause between presses of a multi-press check, result shown 650 ms (`holdMs`), close 140 ms, timeout after 4 ping-pong passes (`passes`). A normal one-press check with a press at the perfect zone lasts about 0.24 + 0.5 + 0.65 + 0.14 ≈ 1.5 s.

| Preset | speed | good | great | perfect | ease |
|---|---|---|---|---|---|
| easy | 0.75 | 0.40 | 0.20 | 0.08 | none |
| normal | 1.1 | 0.30 | 0.14 | 0.05 | none |
| hard | 1.6 | 0.20 | 0.09 | 0.035 | none |
| expert | 1.9 | 0.16 | 0.07 | 0.03 | sine |

## 3. Variants

- **Lockpick** (defaults): one press, random zone position, window above the chest.
- **Timed strike**: `hard`, lighter dim; perfect ×1.5, great ×1.25, good ×1.0, miss ×0.75 damage (host's choice).
- **Forge**: three presses; zones re-roll after each press; pips show each blow; result = floor of the mean.
- **Reel in**: one linear pass, `sine` ease (the needle crawls at the start and end, races through the middle), `easy` zones.
- **Assist**: `easy` + `assist on`.

## 4. Interface

**Needs**
- The moment, in update logic: `start({label, hint, anchor, onDone})` once, in the one function every caller of the action (player menu, autopilot, tap handler) goes through; the action's original effect moves into `onDone`.
- The confirm input while `busy()`: `press()` / `tap()` from the game's own input layer, or `key(e.code, down)` for raw keys (returns `true` only for Z, Space, Enter, and X / Escape / Backspace when `cancel` is on).
- A fixed update step: `update(stepMs)` every step, also while the world is paused for the check.
- The play field `{x, y, w, h}` (HUD excluded); optional UI rects (no `id`: never covered) and sprites (`id`: avoided when cheap) from `getObstacles()`; optional `anchor {x: centre, y: top, w, h}` of the object.
- Optional: `autoplay` flag (function), `onShake(px, ms)`, `onSfx(name)`.

**Provides**
- `busy()`: true from `start()` until the window has closed.
- The result `{grade, offset, hits: [{grade, offset}], score, timeout, auto, label}` through `onDone` (synchronous, inside `update()`) and a Promise (resolves after the current task: do not use it for game logic in games with fast-forward loops).
- `onShake(2, 120)` on perfect, `onShake(1, 80)` on miss; `onSfx('open' | 'perfect' | 'great' | 'good' | 'miss' | 'close')`.
- `rect()`: the window plus 13 px headroom, for other overlays.

**Delivery (v1).** `module/timing-bar.js` (one global, `GameDNA_TimingBar`; API, 15-line integration, caller checklist and self-check in `module/README.md`). It draws through `GameDNA_Skin.resolve(options.skin)` when `skins/skin-api.js` is loaded (window via `skin.frame`, title via `skin.text` 'ui' font, drawn without outline at 1.2× on smooth skins; pixel skins: built-in bitmap words coloured from skin tokens, `pixel16` uses the hand-picked ramps below; non-pixel skins: the skin's `display`/`title`/`ui` canvas font with an outline) and falls back to the built-in pixel16 look without it. Verified on two unseen hosts (scratch copies): the top-down quest (opening the chest is a lockpick; a miss says "The pick slips" and the chest can be tried again) and the side-view battle (Strike gets a timed bonus): `?auto=1` ends the same as the original (the battle with identical final HP, MP and items), 0 errors; one-frame key taps land the intended grade. The demo runs on the same module.

## 5. Screen rules (exact numbers)

Native canvas (256×224 in the demo), integer-scaled with nearest-neighbour (pixel skins).

- **Window**: width = bar + 24, height 44, plus 13 px headroom above for the grade word. pixel16 window (4-band gradient, bevel, gold rivets). Placement: with an anchor, centred on its x with the bottom 4 px above its top, or 4 px below its bottom when that does not fit; without, at 28 / 50 / 72 % of the field height. Kept 4 px inside `bounds`; never intersects a rect without `id` (searched in 2 px steps up and down and ±16/32/56 px sideways; cost = distance + 0.6 × sideways + 0.15 × sprite overlap, the anchored object weighted ×25). Fixed while open.
- **Dim**: the field (`bounds`) filled with ink at `dim` × open-progress.
- **Open / close**: the window grows from its centre line, 140 ms, in four steps on pixel skins; contents appear when fully open.
- **Title row** (top + 7): label left (+9 px), hint right, or one 6×6 pip per press at 9 px pitch (empty = well colour, current = tick colour, done = zone colour with a light top-left edge, miss = grey X).
- **Bar** (top + 24, left + 12): 10 px high; 2 px dark outline; well in 4-px stripes `#241a38` / `#2c2244`, light top line, dark bottom line; quarter ticks below (2 px at 0, ½, 1; 1 px at ¼, ¾).
- **Zones**: drawn good → great → perfect, each from column round(from × w) to round(to × w). Ramp per zone: base fill, 2 light rows on top, 2 dark rows at the bottom, light left column, dark right column. good `#c8ffd8 #6ad08a #2e9a5a #185a36`, great `#fff6c8 #ffe070 #e8b020 #8a5e10`, perfect `#ffffff #e8fbff #8ae4ff #2a7ab0` (edge light, top, base, dark). Perfect: ink-outlined notches (5 + 3 px) 4–5 px above and below its centre; a 1-px white glint walks across it every 90 ms.
- **Zone sizes**: perfect ≥ max(param, 1.25 frames of needle travel at the fastest point (so some frame always lands in it), 3 px); great ≥ perfect + 6 px; good ≥ great + 10 px.
- **Needle**: 3-px ink column from 4 px above to 4 px below the bar, 1-px fill `#fff6d0`; head 7×4 ink with a 5×2 gold `#ffe070` cap and 3×1 shade; two afterimages (α 0.4, 0.2) while moving. Position = round(pos × (w − 1)).
- **Judging**: the grade is the highest zone whose column range contains the needle column at the moment the latched press is processed (the frame on screen when the player pressed). `offset` = needle position − centre of the highest zone, in bar widths.
- **Feedback**: needle white for 100 ms; the hit zone flashes white for 120 ms (40 ms on/off); sparks: perfect 12, great 7, good 4 (1–2 px, white for 80 ms, then the zone's light colours, gravity 0.0002 px/ms², life 260–460 ms, stepped fade); miss: window jolts ±2 px, decaying over 260 ms.
- **Grade word**: bold 5×7 capitals (strokes widened 1 px right), 1-px ink outline plus 1-px drop; rows 0–3 top colour, 4–6 bottom colour, top edge highlight, bottom edge shade. Per press: scale 1 over the needle, in the title row. Result: scale 2 (14 px cap height), centred, top 6 px above the window. Pop: −5 px (0–50 ms), −2 (50–100), +1 (100–140), 0; first 60 ms all white (not for MISS); PERFECT gets a 3-px glint 60–360 ms; fades in steps 0.75 / 0.5 / 0.25 over the last 28 %. Word ramps: miss `#f4f0ff #c8c0e0 #8a7cb0 #3e3060`, good `#f0fff0 #b8ffc0 #4ad870 #22904a`, great `#ffffff #fff2a0 #ffc030 #b06a10`, perfect `#ffffff #e8fbff #7adcff #2a6ab8`.
- **Draw order**: world → effects → HUD → bar (last, outside any shake translate).

## 6. Common mistakes (symptom → fix)

- The bar stops the moment it opens → the key-down that opened the check is re-sent every frame while held (the game routes "is down" instead of the key-down edge); presses in the first 240 ms are ignored, but a held key re-sent after that stops the needle. Route the edge only.
- A quick tap is ignored → the game polls "is the key down" once per frame; call `press()` on the key-down edge (or use `key(code, true)`), which latches until the next `update()`.
- Holding the key fires again → pass key-up too (`key(code, false)`), or route only the edge.
- The world keeps moving (slimes catch the hero, ATB gauges fill) during the check → gate the step: while `busy()`, only `press()` + `update()`.
- `?t=&freeze=1` shots differ from a live run, or autoplay hangs → game logic was after `await`; use `onDone` (synchronous).
- Autoplay ends differently → autoplay pressed at random, or the bonus re-rolled; use `autoplay` with `autoGrade: 'good'` and multiply the existing roll.
- The autopilot's own confirm presses stop the bar → in autoplay the module ignores `press()`; do not route autopilot input to it anyway.
- The check opens twice → `start()` ran every frame while the player stood at the chest; guard with `busy()` (a second `start()` is ignored, but its `onDone` is lost).
- The window covers the dialog box or HUD → pass them from `getObstacles()` without `id`.
- The window covers the chest → pass the chest as `anchor` with its size; the window goes above it or below it.
- After a restart the old bar is still open → `clear()` at new game.
- Title shows `?` → the pixel16 `ui` font has letters, digits and `- . / ?` only; write `PICK THE LOCK`, not `PICK THE LOCK!`.

## 7. Acceptance moments

| Shot | Must be visible |
|---|---|
| `demo/?t=600&freeze=1` | Lockpick window (narrower bar, 120 px) over the chest, dimmed room (demo dim 0.4), needle moving left of the zones, afterimages, notches over the pale-blue perfect band, title `PICK THE LOCK`, hint `Z`. |
| `demo/?t=1000&freeze=1` | `PERFECT!` (2×, pale blue, glint) over the window, needle on the perfect band. |
| `demo/?t=3400&freeze=1` | Timed strike above the dummy: narrower (hard) zones, `GREAT!` in gold (at 3300 it is still in its first-60 ms white flash). |
| `demo/?t=6500&freeze=1` | Forge, three pips (first gold = great), needle sweeping again on re-rolled zones. |
| `demo/?t=10200&freeze=1` | Reel in (linear, sine): `GOOD` in green. |
| `demo/?t=12900&freeze=1` then `13300` | Lockpick that autoplay misses on purpose: `MISS` in grey-violet, window jolted, chest stays shut. |
| `demo/?t=6500&freeze=1&skin=flat-demo` | Same frame through a non-pixel skin: rounded window, system font. |
| `demo/?t=600&freeze=1&assist=on` | Wider zones, slower needle. |
| Phone width 500 px | Canvas fits without horizontal scroll at a whole-number scale. |
| `hosts-unseen/topdown` + module, `?t=16200&freeze=1` / `16700` | Lockpick window below the chest and the hero at the top of the meadow (no room above), the HUD clear; at 16700 `GOOD` (the chest is still shut: the game opens it in `onDone`, after the window closes); at `17300` the chest is open with the dialog. |
| `hosts-unseen/battle` + module, `?t=7600&freeze=1` / `8250` | Strike check above the beetle, clear of the caption and the command panel; then `GOOD` and the strike lands with unchanged damage. |
