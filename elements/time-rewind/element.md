# E-16 Time rewind

## 1. What it is

Hold a key (default **R**) or the round touch button and the world runs backwards. Every fixed step the module deep-copies the game's state into a ring buffer (6 s by default). While the key is held it restores older copies, 2x as fast as the game ran by default (1x-3x), so the last seconds play in reverse: a bolt flies back into the hand that threw it, a fallen enemy gets up, a picked-up gem reappears. On release the game simply continues from the restored moment, and the copies newer than it are dropped: the player now knows what is coming. An energy meter (3 s of rewinding per full meter, refilled in 6 s of play) or a number of charges limits it.

The picture tells the player time is reversed: the scene desaturates and takes a cool tint, scanlines and a soft horizontal ripple run over it, a bright band rolls **upward**, a "REWIND x2 -1.40s" pill sits at the top and a scrubber at the bottom shows the history with the undone future hatched. The game's HUD rects are left out of the filter so hearts and counters stay readable. A short flash marks the release.

The module is a **gate** at the top of the fixed step, after input is read: `if (rewind.step(STEP_MS)) return;`. On a rewind step it has already restored a past state and the game's update does not run; on every other step it records and the game runs exactly as before, so autoplay and `?t=` endings are unchanged while nobody holds the key. Characters are drawn from their recorded facing and animation, so they walk backwards in time without turning around.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `speed` | 2 | 1-3 (module 0.25-4) | Game seconds rewound per real second |
| `seconds` | 6 | 1-20 (module 0.5-60) | History kept; entries = seconds x 60 / stride |
| `energy` | meter | meter, charges, free | What limits rewinding |
| `meter` | 3 s | 0.5-8 | Seconds of holding a full meter allows |
| `charges` | 3 | 1-6 | Presses (each rewinds as long as the key is held) |
| `recharge` | 6 s | 1-20 | Meter refill from empty, or one charge, while the world runs |
| `filter` | full | full, light, off | Rewind filter strength |
| `ripple` | 0.5 | 0-1 | Horizontal band displacement |
| `scanlines` | 0.5 | 0-1 | Scanline darkness |
| `tint` | cool | cool, sepia, violet, mono | Filter and UI colour |
| `render` | auto | auto, smooth, pixel | Pixel when the view is 270 px tall or less: whole pixels, 3x5 pixel font |
| `touch` | auto | auto, on, off | Touch button (auto: coarse pointer or after the first touch) |
| `reduced` | system | system, on, off | No ripple, rolling band or flash |
| `key` | r | r, q, shift, backspace | Must be a key the game does not use |

Module-only options: `stride` (record every n-th step), `maxBytes` (32 MB), `stepMs`, `keyboard: false`, `hud` corner.

## 3. Variants

- **Classic** (default): x2, 6 s, 3 s meter, cool tint.
- **Sands of time**: sepia, x1.5, 4 s meter.
- **Three charges**: `energy: charges`, 3 charges, x2.5.
- **Fast scrub**: x3, 10 s history, ripple 0.8.
- **Quiet**: light filter, no ripple, scanlines 0.25, mono.
- **Calm (reduced)**: `reduced: on`.

## 4. Interface

**Needs**
- A fixed update step whose world update can be skipped: `if (rewind.step(STEP_MS)) return;` after input reading, before the autopilot and update; `?t=` fast-forward goes through it.
- The state: `snapshot()` returning every variable the update writes (live references are fine; the module deep-copies) and `restore(s)` assigning them back from the fresh copy; or `targets()` listing the live state objects (restored in place, identities kept).
- `canRecord()`: true only while the world runs. `clear()` where a run starts. `draw(ctx)` after the HUD; `uiRects()` for the HUD; `view` = logical canvas size; `canvas` for the touch button.
- Facing and animation phase in the state, drawn from it.

**Provides**
- Hold-to-rewind on a key, a touch button and `hold(on)`; rewind playback with a meter or charges; the filter, indicator, scrubber and meter.
- `stats()` (frames, seconds, bytes, bytesPerSecond, cursor, restoredSerial, rewoundMs, energy, charges, lastRelease), `onStart` / `onEnd` / `onRestore` / `onBlocked`, `peek(i)` for tests.

## 5. Screen rules (exact numbers)

- Ramp: the filter reaches full strength in 5 steps (+0.2 per step) and fades in 9 steps after release (-0.12); release flash 0.35 alpha of the accent colour, gone in 11 steps.
- Filter (device px, around the HUD rects): `saturation` grey at 0.88 x strength (light: 0.6); `color` tint at 0.34; `soft-light` deep tint at 0.28; vignette to 0.55 black at the corners; scanlines with a period of 3 logical px (pixel: 2 native px), darkness 0.42 x `scanlines`; ripple bands H/120 tall (pixel: 2 native px) shifted up to 2.4 x `ripple` px, 2.6x inside the rolling band (9% of the height, moving up 1.35% per step).
- Indicator: top centre, 10 px from the top at 360 px view height (scales with height), pill 34 px tall: two left-pointing chevrons that blink in turn every 8 steps, "REWIND" 15 px extra-bold with 2.2 px tracking, then "x2 -1.40s". At the oldest entry it reads "END OF HISTORY", blinking amber. Moved down to 16% of the height if it would cover a HUD rect.
- Scrubber: 46% of the width, 6 px tall, 26 px above the bottom (scaled); the kept history in tint, the undone future hatched, a white playhead with glow, 1 s ticks, "-6.0s" and "now" labels.
- Meter: 118 x 26 px glass pill (scaled with view height / 360) in the first free corner (top-right, bottom-right, bottom-left, top-left, avoiding HUD rects and the touch button): hourglass whose top bulb holds the energy, a 4-segment bar (charges: diamonds), key cap. Shakes and turns amber when a press is refused. Hidden while `canRecord()` is false.
- Pixel render (view height <= 270): integer offsets, 3x5 font at round(h/180) px per dot, 44 x 9 px meter at 180 px height.
- Memory (module estimate): the copied state size per step x 60 / stride per second; the demo's world ~4.6 KB per step (~280 KB/s, 1.6 MB for 6 s); the pixel platformer host ~5.7 KB (~340 KB/s, 2 MB for 6 s); the HD top-down host ~13.9 KB (~830 KB/s, 5 MB for 6 s). Capped by `seconds` and `maxBytes` (32 MB).

## 6. Common mistakes (symptom -> fix)

- After a rewind the hero turns around and walks backwards facing the wrong way -> facing is computed from the change in x; store facing in the state and draw from it.
- A rewind restores positions but the timer, score or an enemy's cooldown keeps its new value -> that variable is missing from `snapshot()`; walk the update and add every variable it writes.
- After release the game uses stale objects (an enemy that cannot be hit, an autopilot chasing a ghost) -> code cached a reference to an old object; look it up again after `restore`, or use `targets()`.
- Rewinding on the title or in the pause menu, or the history reaches into a previous run -> `canRecord()` must be false outside play, and `clear()` must run on new game / restart.
- Sounds, hits or score fire while rewinding -> the update or event code still runs on rewound steps; `return` right after `rewind.step()` returns true.
- Pressed keys are acted on after the rewind ends (a jump fires on release) -> read and clear input before the gate.
- Autoplay ends differently -> the gate sits after the autopilot (it consumed memory) or `restore` also runs while not rewinding; keep the gate before the autopilot.
- The HUD is grey and unreadable while rewinding -> pass the HUD rects in `uiRects()`.
- The rewind key also restarts the game -> pick a key the game does not use (`key` param).

## 7. Acceptance moments

Demo (`demo/index.html`, 960 x 540, meadow at dusk, rigged swordsman, slime, skeleton, imp; scripted: take 1 is hit by the imp's bolt, the director holds R from 5.85 s to 7.3 s, take 2 raises the shield):

1. `?t=4020&freeze=1`: take 1, the bolt about to hit the swordsman; full colour, meter full at the top right; the imp stands on the road with one ground shadow.
2. `?t=6400&freeze=1`: mid-rewind: desaturated cool scene with scanlines and ripple, "REWIND x2", scrubber with the undone future hatched, the swordsman walking backwards in time while still facing right, meter draining; HUD hearts in full colour.
3. `?t=7125&freeze=1`: deeper in the rewind (-2.55 s): the skeleton, defeated in take 1, rises back out of its slump (it slumps down onto its feet and fades when defeated; flat ground shadow).
4. `?t=8520&freeze=1`: take 2 after the release: the swordsman raises his shield as the bolt arrives (he knows it is coming); the meter refilling.
5. `?t=9600&freeze=1`: take 2: the imp defeated (slumping and fading), three hearts.
6. `?t=7125&freeze=1&touch=on&energy=charges&tint=sepia`: sepia variant with charges (diamonds) and the touch button, clear of the actors.
