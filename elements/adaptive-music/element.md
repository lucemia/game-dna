# F-05 Adaptive music

## 1. What it is

Layered, state-driven game music on top of **F-03 chip music** (`requires: chip-music`), in one dependency-free script
(`GameDNA_AdaptiveMusic`) that only uses chip music's public API (`play`, `jingle`, `channels`, `addSong`, `plan`,
`state`, `song`). Each of the four chip channels is one stem: **base** (triangle bass), **perc** (noise drums), **lead**
(pulse 1 melody), **danger** (pulse 2, a tense ostinato with a flat-ninth rub). The game reports its state every step
(`active`, `combat`, `boss`, `hp`); the module decides what plays:

| mood | track | base | perc | lead | danger |
|---|---|---|---|---|---|
| explore | Wildwood Trail (`am-wilds`, 120 bpm, 8 bars) | 1 | 0 | 1 | 0 |
| combat | Wildwood Trail | 1 | 1 | 1 | 0 |
| boss | The Warden Wakes (`am-boss`, 120 bpm, 8 bars) | 1 | 1 | 1 | 0 |
| + low HP | same | | | 0.45 | 1 |

Changes are **debounced** (a state must hold before it counts), **bar-quantized** (they land on the next bar line of
the sounding loop), **never overlap** (no new change while one is pending, fading or under its stinger) and start with a
one-bar **stinger** when the mood changes (Alarm into combat, The Warden Rises into the boss, All Clear back out). The
game's own jingles (victory, item) and its own tracks (title, results) win: every channel opens for them.

## 2. Default parameters

| key | default | meaning |
|---|---|---|
| quantize | bar | changes land on bar lines (`beat`: beat lines) |
| enterMs | 500 | a more intense state (combat, boss, low HP) must hold this long |
| exitMs | 3000 | a calmer state must hold this long |
| lowHp | 0.3 | low HP below this; ends above lowHp + 0.1 (hysteresis) |
| stingers | on | one-bar stinger on mood changes |
| fade / release | 2 / 4 beats | HP-only layer changes fade in / out (mood changes under a stinger switch at once) |
| minBars | 2 | changes start at least 2 bars apart |

## 3. Variants

Classic (bar, 500 / 3000 ms); Snappy action (beat, 250 / 1500 ms); Slow and calm (1000 / 5000 ms, no stingers);
Danger early (low HP below 45 %).

## 4. Interface

Needs: one F-03 chip-music instance updated in every scene; a per-step report read from game state; the game's track
picker returning `null` during gameplay (adaptive music picks the track; a different loop asked during gameplay is
reported once as a `conflict` and never fought).

Provides: `update(report)`, `state()` (mood, low HP, heard mood, layer gains, raw report, candidate and hold left, the
pending change with `at` / `inMs` / stinger / track, the fade, the loop's bar and beat), `plan()` (every change: `at`,
`end`, from / to mood and gains, fades, stinger, track, `committedAt`, `heldMs`), `gainsAt` / `curve` (visualizers),
`recent()` (`commit`, `ignored`, `conflict`), `stats()`, `release()`, `validate()`, `render(spec)` (OfflineAudioContext).

## 5. Screen and sound rules (exact numbers)

- **Clock**: chip music's music clock (game time from `music.update` while audio is off, the audio clock once it runs);
  state, plan and gains are pure functions of the reports and that clock: the same `?t=` gives the same state at any
  viewport and any step size (checked at 7 / 16.7 / 33.3 ms).
- **Debounce**: a candidate counts after `enterMs` (to a more intense mood or into low HP) or `exitMs` (to a calmer one).
  A flicker shorter than its hold is logged `ignored` and never reaches the music.
- **Quantize**: the change lands on the first bar line of the sounding loop's song rows at least 60 ms after it is
  decided (`leadMs`); chip music's own `at: 'bar'` rule, so the stinger and the track switch start on exactly that
  line (checked to 0.5 ms). A track change decided while one of the game's jingles pauses the loop starts at that
  jingle's end, row 0.
- **Spacing**: no change is decided while the last one has not ended (`end` = bar line + the longer of the fade and the
  stinger); with defaults changes are >= 2 bars apart.
- **Gains**: applied through `music.channels()` every step (12 ms look-ahead; chip music smooths with 15 ms), so a
  layer that comes in under a stinger reaches half level within -15..+40 ms of its bar line and a faded layer reaches
  half level at half its fade (+-60 ms). Measured on the offline render: silent (rms <= 2e-4) before its bar line,
  heard after it; no step at a change larger than the music's own.
- **Stingers**: one bar at the loops' 120 bpm, duck mode (the loop at chip music's `duck` level under it, back on its
  first beat after); they only use channels that are audible in the mood they lead into (`validate()`).
- **Jingle limit**: while steering, the module wraps the chip-music instance's `jingle()` and drops an item-kind
  jingle during a fight, a victory during a fight unless the reports say the fight is over within one bar, and any jingle
  while another plays or within 4 bars (`jingleGapBars`) after it; defeat and `after: 'stop'` always play, a boss's
  victory when the boss report drops within a bar (`state().jingleLimit`). Checked with a spammy game (an item every 0.7 s, a victory every 1.5 s): the loop is
  paused <= 30 % of play (cold test r1: 72 %), only the kill that ends the fight gets its victory, and combat still lands with its stinger.
- **The game's music wins**: during a game jingle all four channels are at 1; when a non-adaptive loop sounds the gains
  are 1; adaptive music never calls `play` for a track the game did not hand it.
- **Demo**: 256 x 144 native scene, wider on wide screens (as many native columns as fill the stage at a whole scale,
  `floor(css / 256)` css px per native px), 2 css px per native px in a 90 px tall window under 512 css px; the hero
  walks with 4 frames (contact, pass, contact, pass), one frame per 4 px, a short sword in his hand on every frame
  (near hand in front facing right, far hand behind the body facing left: a held prop drawn from each frame's hand
  anchor, never a mirrored blade); a strike is wind-up, swing, follow-through (100 / 75 / 120 ms) and its trail is the
  path of the blade tip around the hand; hurt: 70 ms of an opaque white flash that keeps the dark outline, then opaque
  red blinks every 60 ms (never below full alpha: `demo-check.py` cast and alpha); slimes hop and flash 60 % white,
  the warden 35 % for 80 ms; the peeking slime stands behind the bush (only its top and eyes over the leaves); victory:
  gold rays, a ground ring, confetti and the raised sword with a twinkle at its tip; the only in-canvas UI is the hearts plate (43 x 11 px, top-left),
  which never touches a character at 390 / 500 / 1280 over the whole 44 s story (`checks/demo-check.py` scan, every
  50 ms). Timeline: 12 s window (7 s under 520 px), playhead at 34 %, lanes GAME (what the game reports, ignored
  flickers struck through), MUSIC (the committed mood from each bar line; the hold dotted, the wait for the bar solid,
  a diamond on the bar line, a gold flag for a stinger), then Lead, Danger, Base, Drums with notes whose opacity
  follows the layer gain and the gain curve. The timeline canvas draws only its lane labels and bar numbers (each centred
  on its bar line); all other text is HTML (wraps, never ellipsized); while watching, the HP slider follows the scene; every toggle carries
  aria-pressed; the sound button's first click only starts audio.

## 6. Common mistakes (symptom -> fix)

- Drums flutter in and out as a foe wanders at the edge of range -> `combat` is a raw distance test; debounce is there,
  but use "engaged or within a short distance" and keep it on while the fight lasts.
- The music never changes in `?t=` stills -> `music.update` or `adaptive.update` is missing from the fast-forward loop.
- Field and battle loops fight the layers, `stats().conflicts` > 0 -> the chip-music track picker still returns
  `'field'` / `'battle'` during gameplay; return `null` there.
- The boss music comes back after its victory jingle and then switches -> fine (calm-down hold); if the game goes to a
  results screen, report `active: false` and use `after: 'stop'` on the jingle.
- Low HP blinks on and off at 30 % -> pass `hp` as a fraction 0-1 (or `hp` with `maxHp`), not the raw number.
- The music keeps pausing -> jingles on every kill or coin; victory only when a fight ends, nothing for coins.
- No stinger on a change -> stingers are skipped within 0.5 s after one of the game's own jingles, and for HP-only changes.
- A short silence between a jingle and the next track (about 0.45 s after chip music's victory jingle) -> by design: a
  track queued behind a pausing jingle starts at the jingle's musical end, and the built-in victory data ends on four
  rest rows (its release tail rings into them). Use your own jingle without trailing rests, or `mode: 'duck'`, if the
  gap matters.

## 7. Acceptance moments

Demo stills (`demo/index.html`, 1280 px, `checks/state.json`; the music part of `__state()` comes from `state()`):

1. `?t=2000&freeze=1`: explore, the hero walks east (walk frames); Lead and Base lanes lit, Drums and Danger dark.
2. `?t=3400&freeze=1`: a slime peeks over the bush; the GAME lane shows the blip, the line under it says it must hold 0.3 s more; the music lane stays green.
3. `?t=7700&freeze=1`: two slimes on the road, the hero follows through a sword swing, combat held 0.5 s: the change is decided, the MUSIC lane shows the hold, the wait and a gold-flagged diamond on bar 5, "lands ... in 0.3 s with the Alarm stinger".
4. `?t=12600&freeze=1`: one heart left, fighting the second slime: the danger layer is fading in from bar 7, the lead fading down to 45 %.
5. `?t=28400&freeze=1`: the warden has risen; The Warden Wakes started on the bar line at 28.0 s under The Warden Rises stinger; the roar ring around it.
6. `?t=36500&freeze=1`: the warden fell; the hero raises his sword in a burst of gold rays and confetti; the game's Victory jingle plays with every channel open; explore waits for the jingle end.
7. `?t=40000&freeze=1`: Wildwood Trail in the explore mix again, the hero walks on.

Listening checks (David, after one click): drums enter exactly on a bar with the alarm; brushing past the peeking slime
changes nothing; the danger line fades in and out on bar lines; the boss track starts on a bar under its stinger; the
victory jingle is full; explore returns cleanly. `checks/run-checks.py --wav DIR` writes the whole story as WAV.
