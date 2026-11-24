# C-07 Title screen & menu flow

## 1. What it is

The screens around play, as an addon. On load the game's own title backdrop stays on screen and the module lays its title over it: the game's name as a bold pixel logo (a face built from the 5x7 font with doubled strokes, a four-band vertical gradient in the game's colours, a dark outline and drop line, a white glint that sweeps across the letters every 3.6 s), a tagline between two short rules, drifting sparkles that keep off the text, and a blinking PRESS Z OR ENTER (TAP TO START after a touch). The first time, the screen fades in from black and the logo drops in with a small bounce. A press slides the logo up and unfolds the **title menu** under it: CONTINUE (greyed and skipped when the game has no save), NEW GAME, OPTIONS, QUIT, each with a 7x7 icon, a pointing glove that glides between rows on a spring, a highlight band and a bobbing cursor.

**Options** open in a framed window over a dimmed title (or over the paused game): AUDIO (MASTER VOLUME, MUSIC, SOUND EFFECTS as notched sliders 0-10 with a value), GAME (TEXT SPEED: SLOW / NORMAL / FAST / INSTANT), ACCESSIBILITY (SCREEN SHAKE, FLASHING full / reduced, REDUCE MOTION, LARGE TEXT, HIGH CONTRAST as switches), then CONTROLS (a read-only page of the game's keys), RESET DEFAULTS and BACK. Long lists scroll with arrow markers. Every change is written at once to a namespaced `localStorage` key (memory when storage is blocked) and handed to the game through `onOption`. LARGE TEXT makes every module screen one UI pixel bigger, HIGH CONTRAST switches the windows to black with white and yellow text, REDUCE MOTION turns springs, the logo drop, sparkles and glint off and every transition into a fade.

**NEW GAME** (or CONTINUE) covers the screen with a wipe (diamonds growing left to right, an iris, or a stepped fade), calls the game's start while the screen is covered, then uncovers the first frame of play. In play, the pause key or the touch pause button (top-right, off the HUD) dims and freezes the game under PAUSED and a menu: RESUME, OPTIONS, RESTART, QUIT TO TITLE (the last two ask NO / YES first, NO preselected). QUIT on the title asks too, then shows THANKS FOR PLAYING (a web page cannot close itself) unless the game handles `onQuit`. When the game returns to its title by itself (results, game over) the menu opens at once, NEW GAME selected.

It never changes the game's state itself: the game keeps its scenes and its start code, the module only calls them, consumes input while a menu is open, and turns itself off under the game's test flags.

## 2. Default parameters

| key | default | meaning |
|---|---|---|
| `transition` | `diamond` | `iris`, `fade` (REDUCE MOTION forces `fade`) |
| `transMs` | 320 | each half of the cover (covered, then uncovered) |
| `panel` | `royal` | window colour ramp: `night`, `ember`, `moss`, `slate` or 6 hex colours (`colors.panel`) |
| `quit` | `on` | QUIT row on the title menu |
| `pauseButton` | `auto` | the touch pause button appears after the first touch; `on`, `off` |
| `hints` | `on` | the bottom key hints line (`ARROWS: CHOOSE  Z: OK  X: BACK`, `TAP TO CHOOSE` after a touch) |
| `pauseKeys` | Escape, P | keys that pause and resume; drop any the game uses in play |

Options and their defaults: master 8, music 7, sfx 8, textSpeed normal, shake on, flashes full, reduceMotion off, largeText off, contrast off.

## 3. Variants

- **Console classic**: diamond wipe, royal windows.
- **Night road**: iris, night windows.
- **Quiet**: 220 ms fades, no hints line.
- **Phone first**: the pause button always on.

## 4. Interface

**Needs**: the canvas; `isTitle()`; `onStart(kind)` = the game's own title confirm; `onQuitToTitle()`; `canPause()`; optional `onRestart`, `canContinue`, `onOption`, `onQuit`, `onSound`, `uiRects()` (HUD in native px), `obstacles()` (characters on the title backdrop), `controls`, `colors`, `labels`, `optionRows` / `extraOptions`. `update(stepMs)` first in the fixed step (return while `busy()`), `draw()` at the end of every render path; the game hides its old title text while `titleShown()`.

**Provides**: `busy()`, `titleShown()`, `paused()`, `get(key)` / `options()` / `set()`, `press(action)`, `openPause()` / `resume()` / `showTitle()`, `rect()`, `lastDrawn()`, `state()` / `debug()`. Skip flags: `?auto=1`, `?t=<ms>`, `freeze=1`, `?title=0` (off), `?title=1` (forced on).

**Delivery (v1).** `module/title-menu.js` (one global, `GameDNA_TitleMenu`; API table, 15-line integration and self-check in `module/README.md`). Built-in pixel look in code; an optional skin (`skins/skin-api.js`) supplies the window ramp and text colours.

## 5. Screen rules (exact numbers)

- Overlay: a canvas exactly over the game canvas, `pointer-events: none`, z-index 2147483000, `image-rendering: pixelated`. v1.1 default `unit: 'host'`: the overlay's backing store is the game's native size / k (k = max(1, floor(native width / 320)); +1 with LARGE TEXT while the UI stays >= 128 x 90), so one UI pixel = k game pixels and the browser scales menu and game identically (same pixel grid on phones). `unit: 'readable'` = v1.0 (UI pixel >= 2 CSS px, backing store at devicePixelRatio).
- Font 5x7 (6 px advance), rows 12 UI px, window padding 6, glove 10x7, icons 7x7 with a 1 px shadow. Windows: 4-band fill, 1 px edge with cut corners, bevel light / shade lines, gold rivets, a 2 px drop shadow; opaque.
- Logo: bold face (strokes doubled), scale = the largest of 1-6 that fits 90 % of the width and 34 % of the height; split into two balanced lines when that gives a bigger scale. Press text at `max(logo bottom + 14, 70 % of H)`, moved in 3 px steps off `obstacles()`. Small screens: drop the tagline in the menu stage, then shrink the logo, then drop the hints line, so the menu always fits.
- Title backdrop: two 6-step bands darken the top 22 % (42 %) and the bottom 55 % (to 62 %). `titleCover()` boxes (a HUD band the game would show empty) are painted as part of the title (7-step night gradient, ink + gold rule, faint twinkling stars); PRESS START and the menu centre in that band, the logo block centres above it. The logo block slides vertically (2 px steps) off `obstacles()` when a clear height exists. The tagline wraps to at most 2 lines no wider than the logo + 16 (min 96), else it is left out; it sits on a 62 % dark plate with cut corners.
- Sub-windows over the title (options, controls, confirms) fade the logo out completely in 140 ms (4 steps) and dim the title 66 %; it returns with the menu.
- Option rows: label left, control right (slider 44 x 7 with 10 notches, or 30 when narrow; choice between two 4 px arrows; switch 11 x 5); when a row still does not fit, the control goes on a second line. Lists scroll; a header stays visible above its first row.
- Pause window: centred between the top and bottom HUD bars from `uiRects()` when there is room (>= 70 UI px), else on the whole screen; a short menu never scrolls (the hint line, then the PAUSED heading, give way first). Pause dim 0.6 over 150 ms plus a 75 % band (2 px soft edges) behind the PAUSED caption and window, so game text behind them never reads through; closing fade 160 ms.
- Windows: an 8-step gradient across the 4 fill colours (no hard bands), the glove 5 px inside the window's left edge; a list's scroll-up arrow sits at the right end of the header rule (no empty row under the header).
- Pause button 13 x 13 UI px, first free spot of top-right, top-left, bottom corners, then along the top and right edges, 2 px clear of every `uiRects()` box.
- Motion: window unfold 200 ms (35 % -> 100 % height, back-ease), rows appear 30 ms apart, cursor spring k 420 / c 30, logo spring k 120 / c 16, row flash 180 ms on confirm, intro fade 600 ms and logo drop 250-900 ms, PRESS START blinks 1.0 s on / 0.5 s at 35 %.

## 6. Common mistakes (symptom -> fix)

| Symptom | Fix |
|---|---|
| `?auto=1` never leaves the title, or `?t=` stills show the menu | The old title confirm / autopilot path was removed or `skip: false` passed: keep the old title code; the module turns itself off under the flags. |
| The game starts under the menu, or a confirm on the menu also jumps / attacks | The step is not gated: `menu.update()` first, `if (menu.busy()) return;` before the game's input and world; drop presses queued while busy. |
| Two logos on the title, or PRESS START twice | The old title text is still drawn: skip it while `titleShown()` (keep the backdrop art). |
| The title area below the backdrop is black | An early return skipped the frames the old title drew; keep drawing frames and art, skip only the text. |
| The menu never appears, or stays on a stale frame | `draw()` missing on a render path (often the title's early return). |
| Escape no longer works as "back" in the game's own menus | Escape is in `pauseKeys`: give keys the game does not use. |
| The pause button sits on the score | `uiRects()` misses that HUD box (native px). |
| PRESS START or the menu covers the hero on the title | Pass the character's box in `obstacles()`. |
| The title's lower part is an empty HUD panel | Pass it in `titleCover()`: the module paints it and puts the menu there. |
| A speech bubble pokes out around the pause window | Hide world text while `menu.paused()`. |
| The menu's pixels are bigger than the game's | `unit: 'readable'` was passed; the default `host` shares the game's pixel grid. |
| After QUIT TO TITLE the game resumes old state | `onQuitToTitle` must do what the game's own return to the title does (clear the run). |
| Options do nothing in the game | The game must apply them (`onOption` / `get`): volumes, text speed, shake, flashing. |

## 7. Acceptance moments

Demo stills (`demo/index.html?t=<ms>&freeze=1`, one clock for the tour script and `?t=`; `checks/state.json` lists each event and `checks/moments.py` confirms it):

1. `?t=1700` title: the village at dusk, LANTERN ROAD logo with the tagline, PRESS Z OR ENTER; nothing over the hero and merchant.
2. `?t=3200` title menu: CONTINUE, NEW GAME (selected, glove, highlight), OPTIONS, QUIT under the raised logo; hints line.
3. `?t=5000` options over the dimmed title: MASTER VOLUME just lowered 8 -> 6.
4. `?t=6500` options: TEXT SPEED switched to FAST.
5. `?t=8100` NEW GAME: the diamond wipe mid-cover.
6. `?t=11000` play: the hero walks the road, coin HUD top-left, the pause button top-right clear of it.
7. `?t=12500` PAUSED: RESUME / OPTIONS / RESTART / QUIT TO TITLE over the dimmed, frozen game.
8. `?t=15400` pause > options: SCREEN SHAKE off, the list scrolled to ACCESSIBILITY.
9. `?t=18200` RETURN TO THE TITLE? with YES selected.
10. `?t=20000` back on the title: the menu shown at once.
11. `?t=23800` QUIT -> YES: THANKS FOR PLAYING.
