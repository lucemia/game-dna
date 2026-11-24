# F-04 Beat judge

## What it is

A beat clock plus an input judge. The game keeps playing as before; the player's chosen action (a strike, a jump, a
dash) is rated **Perfect**, **Good** or **Miss** against the nearest beat, and the game decides what the rating does
(damage x1.5 / x1 / x0.5 by default). The press is timed at its **input event**, not at the frame that handles it, minus
the audio output latency and the player's calibration offset. Beats come from F-03 chip-music when the game has it
(its own schedule: tempo, track switches, no beats while a pausing jingle plays), otherwise from the module's own beat
clock with a soft woodblock click (higher on the downbeat). A beat track shows what is coming: markers slide to a judge
ring that pulses on every beat, the ring's gold core is the Perfect window, cyan brackets the Good window; the last
rating, EARLY / LATE and the combo sit above the markers. A calibration window measures the player's habitual offset
from 8 taps after a one-bar count-in and keeps the median.

## Default parameters

| key | default | meaning |
|---|---|---|
| bpm | 120 | own beat clock (ignored when beats come from chip-music) |
| perfect / good | 45 / 100 ms | half-windows around the beat |
| perfectMult / missMult | 1.5 / 0.5 | game side: what Perfect and Miss do to the action's result (Good = x1) |
| expect | false | true: a beat that passes without a press is a Miss (pure rhythm games) |
| calibrateKey | C | opens the calibration window |
| module only | offset 0, latency auto, lead 1800 ms, click auto, volume 0.5, taps 8 | see module/README.md |

## Variants

- **Strike on the beat** (default): bonus for Perfect, weaker on a Miss.
- **Strict rhythm game**: 30 / 70 ms windows, unpressed beats are misses, a Miss does nothing.
- **Forgiving, bonus only**: wide windows, a Miss is a normal action.
- **Fast music**: 160 bpm with slightly tighter windows.

## Interface

Needs: the fixed update step in every scene; the judged action's input event kept until the game accepts the action;
the one function every player action of that kind goes through; a 22 px strip for the track; a calibration key or menu.
Provides: `press(event)` -> `{rating, delta, early, late, beat, combo}`, `onRate`, `onBeat`, `beats()`, `phase()`,
`state()`, the calibration window (`calibrate()`, `busy()`, `key()`, `pointer()`), click-track mute / volume / toggle,
`render()` for offline audio tests; `create({music})` syncs to an F-03 instance.

## Screen rules

- Track: 22 px tall at scale 1 (integer scale for bigger canvases), at least 140 px wide; ring 14 px from the left edge;
  markers 5 px diamonds (downbeat 7 px, gold) on a centre line 8 px above the bottom; text row 2 px from the top.
- Markers enter at the right edge with a 10 px fade, are drawn OVER the ring and arrive at its centre exactly on their
  beat; a taken beat vanishes in a burst (ring 6 -> 13 px, 8 sparks, 300 ms); an untaken beat turns grey once it is past
  its Perfect window, keeps sliding left through the ring, and fades within 260 ms after its Good window.
- The ring sits far enough from the plate's left edge that the whole Good band fits inside the plate at any width.
- Rating label: white for 70 ms, then its colour (Perfect gold, Good cyan, Miss red), 700 ms hold, 200 ms fade; replaced
  only by the next press. EARLY / LATE only when it cannot reach the combo text. Combo from 2, right-aligned.
- No beat within the lead time (a jingle, a stopped clock): the track says REST instead of looking broken.
- A character with an id under the track dims it to 35 % within ~90 ms; the track never moves.
- Calibration window: 188 x 92 px (or the given rect), count-in numbers in the lamp, taps as dots on a -150..+150 ms axis
  (early left), result line OFFSET +N MS, buttons KEEP / RETRY / CANCEL (CANCEL / RETRY when too few taps); results
  accept a confirm only after 250 ms; back closes at once.
- Text: built-in 5x7 font with a 1 px dark outline, never over another text.

## Common mistakes

| symptom | fix |
|---|---|
| Every press rates ~10 ms late and Perfects are rare | the game called `press()` without the event: pass the keydown / pointerdown event (its timeStamp) |
| Autoplay ends differently | autopilot actions were judged: call `press()` only for a stored real input event |
| Ratings drift late on a laptop with Bluetooth audio | latency comes from `outputLatency`; ask the player to calibrate (C) |
| Markers frozen in `?t=` stills | `update()` missing from the fast-forward loop or a scene |
| The calibration window never closes / the world runs under it | route confirm / back to `key()` while `busy()` and skip the world, but keep calling `update()` |
| The first click mutes the click track | wire the sound button to `toggle()`, not `mute()` |
| Track covers the HUD or the feet | give it a free strip; pass `getObstacles()` so characters passing under it dim it |

## Acceptance moments

Demo (`demo/index.html`, 256 x 200 native, 192 px window on phones; moments in `checks/state.json`):

1. `?t=3110&freeze=1` a press ~65 ms late: GOOD LATE, the hero's swing lands, the brute flinches.
2. `?t=4800&freeze=1` an off-beat press is a MISS: the swing falls short, the brute dodges, MISS above him.
2b. `?t=5320&freeze=1` the brute's counter: wind-up, thrust on the beat, the hero knocked back.
3. `?t=9000&freeze=1` calibration count-in (lamp number on the beat).
4. `?t=11000&freeze=1` calibration taps 4/8, all right of centre (late).
5. `?t=12700&freeze=1` result OFFSET +67 MS, YOU TAP LATE, KEEP selected.
6. `?t=13910&freeze=1` offset kept: the next press, as late as before, rates PERFECT.
7. `?t=15110&freeze=1` PERFECT strike: gold slash, burst at the ring, double damage, combo.
8. `?t=17000&freeze=1` K.O.: the victory jingle pauses the battle loop; the track says REST.
9. `?t=20300&freeze=1` the loop is back on a beat: ROUND 2, markers again.
10. `?source=click&t=6000&freeze=1` the module's own click track at 120 bpm.
