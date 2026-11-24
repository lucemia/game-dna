# I-07 Seeded replay & ghost

## 1. What it is

A run is its seed plus the player's input on every fixed step. The module records exactly that (the raw device input, canonicalised, deduplicated into a small dictionary and run-length encoded), together with a 64-bit hash of the game's state every `checkEvery` steps and at the end, and the hero's pose for a ghost. A replay restarts the run with its seed through the game's own `restart(seed, meta)` and runs the game's own `step()`, feeding the recorded input instead of the keyboard. Because nothing but the input changes, a deterministic game reaches the same end state; the module proves it by comparing every checkpoint and the end hash, and says **END STATE MATCH** (with the hash) or **DESYNC** at the first checkpoint that differs. `verify()` does the same in place at full speed and, for the current run, also checks that the game ends where it was (round trip).

The best run becomes a **ghost**: the game's own hero sprite (its real frames, facing and feet) drawn into a layer, tinted, ringed with a 1 art-px light outline and faded, racing the player at the same step. While recording, a small time-trial panel shows the run time, the best time and a live split (from the game's `progress()`); a finished run shows NEW BEST (or FIRST TIME SET) once. A replay HUD shows a REPLAY xN / PAUSED tag, play-pause, speed (x.25-x4), a scrubber with checkpoint ticks (green verified, red after a desync) and the run's end marker, the time, a SYNC n / MATCH / DESYNC badge, and the verdict card at the end. Runs save and load as `GDR1.<base64url JSON>.<crc32>`; a tampered or truncated text is rejected. The module counts `Math.random` calls inside recorded steps, the usual cause of a desync.

## 2. Default parameters

| key | default | notes |
|---|---|---|
| ghost | best | best, last, off; while the best is replayed the ghost is the previous best |
| ghostAlpha | 0.8 | 0.15..1, fades in over the first 20 steps, out over 90 after the ghost finished |
| tint | cyan | cyan, gold, violet, white |
| tag | start | name tag over the ghost for the first 170 steps (fading over the last 25), on, off |
| split | on | needs `progress()` |
| speed | 2 | replay speed when watching (0.25..4) |
| checkEvery | 60 | steps between checkpoint hashes |
| watchKey / pauseKey | v / p | Shift+watch = the best run; in a replay `[` `]` speed, arrows or `,` `.` scrub 2 s (1 step while paused), Esc / watch key exit |
| autoExit | 4 | seconds a finished replay rests before `exit()` |
| store | off | local: best run in localStorage |
| render | auto | pixel (3x5 font, whole px) when the view is <= 270 px tall |

## 3. Variants

Time trial (default) · Rival = last run (violet ghost of the previous run) · Golden ghost (gold, tag always) · Replay only (no ghost, x1) · Saved best (localStorage).

## 4. Interface

Needs: `restart(seed, meta)` equal to a live run start (seed, reset, play scene, autopilot flag from `meta`); `step()` = one fixed step reading input through `rep.input(raw)` before any autopilot; `state()` (gameplay fields and RNG; not frame counters or the camera); `pose()` and `drawGhost(ctx, pose)` (the hero's own sprite with the camera); optional `progress()`, `exit()`; `view`, `canvas`, `uiRects()`. Calls: `begin(seed, meta)` where play starts, `end({won, score})` at every win and loss, `steps()` per live tick, `drawGhost(ctx)` before the hero, `draw(ctx)` last.

Provides: runs and their text (`save`, `load`), replays (`watch`, `stop`, `pause`, `setSpeed`, `seek`, `stepFrame`), `verify(which)` -> `{ok, match, desyncAt, checked, roundTrip}`, the ghost (`ghost()`), `stats()` (incl. `randomCalls`), `lastDrawn()` (trial, banner, hint, tag, bar, verdict rects), `composite(ctx, drawFn, opts)` (static ghost look).

## 5. Screen rules (exact numbers)

- Pixel views (<= 270 px tall): 3x5 font at 1 px per art px (2x for titles), panels with a 1 px dark border, 1 px top highlight; trial panel 15 px tall in the first free corner (top-right first) clear of `uiRects()`; replay bar 13 px tall, `max(220 px, 86 %)` wide, bottom centre (top if the bottom is taken); REPLAY tag top-left; verdict card 21 px tall at 18 % of the height, clear of the bar.
- Phones: the HUD measures the canvas's CSS size; pixel glyphs are scaled (whole art px, up to 3x) until they are >= 10 CSS px tall, HD fonts until >= 11 CSS px; titles step down to fit the view width.
- HD views: font `max(11, 2.6 % of height)` px, the same layout scaled, rounded panels.
- The trial panel never resizes mid-run (room for the split is kept); nothing moves more than the banner's 6 px glide in 14 steps; the banner shows once per finished run (210 steps), the verdict card once per reached end (16-step glide).
- Ghost: the art keeps its own colours, outline and shading under a 32 % tint, a 1 art-px ring in the tint's light colour outside, alpha 0.8; drawn in the world layer before the hero.
- A replay frame: 1 px (pixel) tinted edge and 8 px corner marks so it never reads as live play.

## 6. Common mistakes (symptom -> fix)

- DESYNC at 0:00.00 -> `restart` does not equal the live start (seed not applied, a field the reset does not touch is in `state()`: camera, frame counter) -> apply the seed; leave recomputed fields out.
- DESYNC after some seconds, `randomCalls` > 0 -> `Math.random()` in the update -> use the seeded RNG.
- Replay of an autopilot run stands still -> the autopilot flag is not in `meta` / not applied by `restart`.
- The second run's replay drifts, the first one matches -> autopilot memory or a second RNG kept from the previous run -> reset it where the run starts.
- The panel shows on the title -> `begin` at page load -> call it where play starts.
- Replay ignores speed and pause -> the live loop calls `step()` directly instead of `for (n = rep.steps(); ...)`.
- The ghost is a box, faces the wrong way or floats -> `drawGhost` must use the hero's own frame selection and the same foot offset; `pose` must hold facing and animation fields.
- Watch key also jumps / opens a menu -> pick a key the game does not use.

## 7. Acceptance moments

Demo (`demo/index.html`, 320x180, the script courier runs the course twice, then the best run is replayed). Each moment's `__state().event` must be the one listed (`checks/state.json`, checked by `checks/demo-check.py`).

1. `?t=5005&freeze=1` — event **recording**: take 1 is recorded; REC dot, TIME panel top-right, no ghost yet.
2. `?t=18005&freeze=1` — event **ghost**: take 2 races the ghost of take 1 (translucent courier ahead with the BEST tag, walking right with real frames), panel shows BEST 0:12.68 and the split.
3. `?t=28505&freeze=1` — event **newBest**: NEW BEST 0:11.58 -1.10 banner, the V WATCH REPLAY hint.
4. `?t=32838&freeze=1` — event **replay x2**: the best run replays at x2 (REPLAY x2 tag, bar with scrubber and SYNC n badge), the old best as an OLD BEST ghost behind.
5. `?t=33338&freeze=1` — event **paused**: PAUSED tag, play icon, scrubber still.
6. `?t=39171&freeze=1` — event **match**: the replay reached the end: END STATE MATCH card with the end hash and the checkpoints, MATCH badge, the old best ghost walking left on the south road.
