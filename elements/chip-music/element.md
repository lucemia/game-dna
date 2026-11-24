# F-03 Chip music

## 1. What it is

A tiny four-channel chip synth for game music, in one dependency-free script (`GameDNA_ChipMusic`). Two **pulse**
channels (duty 12.5 / 25 / 50 %), a **triangle** stepped in 16 levels (bass) and a **noise** drum kit (kick, snare, hat,
open hat, crash from a 15-bit noise register) play pattern data: one token per 16th-note row, with arpeggio, vibrato,
slide, accent and soft effects. Loop tracks wrap without a seam; one-shot **jingles** pause the loop (or duck it) and
the loop comes back **on the next beat** after the jingle, or another track starts from its top. Track switches wait
for the next beat. Built in: `title`, `field`, `battle` (loops), `victory`, `defeat`, `item` (jingles), all original;
games add tracks with `addSong`. Every track is synthesized in the browser the first time it plays (about 0.1 s for a
16 s loop); nothing is loaded.

The game only names the music for its state (`play(musicFor())` every step; the current track again is a no-op) and
fires jingles where events are decided. The module owns the click-to-start rule, the music clock, beat quantization,
seamless looping, mute and volume, and an optional sound badge.

## 2. Default parameters

| key | default | meaning |
|---|---|---|
| volume | 0.7 | music master (0-1); at 0.7 no built-in track reaches the soft ceiling's 0.8 knee |
| jingleMode | pause | `pause`: the loop stops under the jingle; `duck`: it keeps playing at `duck` level |
| resume | beat | the loop resumes on the next beat (`bar`: next bar, `row`: next row) after where it was paused |
| tempo | 1 | 0.5-2; applies from the next beat, the loop is re-synthesized (never time-stretched) |
| transpose | 0 | -12..12 semitones, from the next beat |
| duck | 0.25 | loop level under a duck-mode jingle |
| mute | off | |

## 3. Variants

Classic (pause, resume on beat); Jingles over the music (duck 0.3); Phrase-safe resume (bar); Tense and fast
(tempo 1.2, key -2); Quiet background (volume 0.4).

## 4. Interface

Needs: the fixed update step in every scene (`update(stepMs)`: the music clock while audio is off), a state-to-track
mapping read each step, the event sites for jingles, optionally an empty HUD corner and the pointer handler (badge).

Provides: `play(track, {at, from, restart})`, `jingle(name, {after: 'resume' | 'stop' | track, mode})`, `stop({fade})`,
`mute`, `volume`, `setParams`, `channels({p1, p2, tri, noise})`, `addSong(name, data)` / `validate`, `state()` (track,
bar, beat, row, pattern, per-channel note / level / effect, next scheduled change), `plan()` (the schedule on the music
clock, for visualizers), `draw(ctx, x, y)` / `hit(x, y)` / `lastDrawn()` (badge), `render(spec)` (OfflineAudioContext
render of the same graph, for tests), `opts.sfx` (share an F-02 instance's AudioContext; its big sounds duck the music).

## 5. Screen and sound rules (exact numbers)

- **Timing**: 4 rows per beat, 4 beats per bar. A loop's row length is `round(loopRows x nominal) / loopRows`
  samples, so the loop is a whole number of samples and every pass puts every row on the same sample.
- **Seamless loop**: the buffer holds pass 1 and pass 2; the loop region is pass 2, synthesized continuing from pass 1
  (every note start resets the oscillator phase with a 2 ms crossfade, every drum hit resets the noise register with a
  2 ms crossfade), so the wrap equals a straight run of the synth: measured max difference 1.2e-7 over 2.6 loops.
- **Clicks**: 2 ms attack from the current level; release at a rest >= 6 ms (10-35 ms per built-in instrument); segment cuts
  fade 10-60 ms; resumed segments fade in over 12 ms; DC blocker at 18 Hz per channel.
- **Pitch**: A4 = 440 Hz equal temperament; effects step at 60 ticks a second from each note's start (arpeggio
  offsets cycle per tick; vibrato 5.6 Hz, 0.28 / 0.5 semitone, after 0.14 s; slide linear in semitones over 85 % of
  the note). Measured: every note of every built-in track within 1.1 cents.
- **Jingles**: start on the next row of the playing loop; pause mode cuts the loop at that row (20 ms fade) and starts
  it again at the jingle's musical end from `ceil(pausedRow / 4) x 4` (next beat); duck mode holds the loop at
  `duck` and restores it on the loop's first beat after the jingle. The same jingle within 0.4 s is merged.
- **Switches**: `play()` of a new track lands on the current loop's next beat (`at: 'bar' | 'row' | 'now'`); during a
  pause-mode jingle it starts when the jingle ends. Asking again for the loop a jingle interrupted is ignored until the
  game asks for a different track (or, with `after: <track>`, until that track has started); then it is a normal request again (v1.0.4 fix) (so `after: 'stop'` holds while the results screen keeps the old state).
- **Clock**: game time from `update()` while audio is off; the audio clock once it runs. `state()` is a pure function
  of the commands and the clock: the same `?t=` gives the same state at any viewport and any step size.
- **Badge**: 23 x 11 native px at scale 1 (scale 2 above 400 px): speaker + four 2 px meters (cyan, pink, amber,
  white) from the channel levels; grey with a blinking yellow dot until the first gesture; red cross when muted.
- **Demo**: 256 x 144 scene, integer-scaled (nearest neighbour; under 512 CSS px a 160 x 90 camera window follows the hero so phones get 2x); the hero walks with 4 frames (contact, pass, contact, pass), one frame per 4 px walked; the sound pill is a `<button>` wired to `toggle()` (its first click only starts sound); every in-canvas text (title, subtitle, banners, the alert) clears the badge, the hero and the view edges in every frame at 390 / 500 / 1280 (`checks/demo-check.py` text scan); title plates are only as wide as their text and the waiting hero is redrawn above the title dim (scan: plates, badge and dim vs the hero too); the camera-window title puts the logo between the badge row and the hero's head and the other lines below his feet, on plates so letter counters stay opaque; piano roll window 6.6 s at >= 520 px (4.4 s on phones),
  playhead at 30 %; lanes P1 34 %, P2 25 %, TRI 22 %, NOISE 19 % (five drum rows); fixed pitch range per channel over
  all built-in songs so the roll never rescales; jingle notes outlined gold; the ribbon names each segment ("resumes
  bar 2 beat 4"); 390-500 px: one column, two strip columns, no horizontal scroll.

## 6. Common mistakes (symptom -> fix)

- The title never changes row in `?t=` stills / music runs only after a click -> `update()` is missing from the
  fast-forward loop or from a scene.
- Battle music comes back after the defeat jingle -> `musicFor()` returns a different track on the results screen;
  return `null` there.
- The jingle repeats every frame -> `jingle()` sits in a per-frame condition ("while phase is victory"); call it where
  the outcome is decided.
- Music restarts constantly -> `create()` per frame or `play(t, {restart: true})`; create once, plain `play(t)`.
- Silence after clicking -> a second instance was created after the gesture listener of the first; create once.
- A sound button mutes on its first click -> it calls `mute()`; the module's gesture listener already started audio on that click. Wire buttons to `toggle()` (or `hit()` for the badge).
- The badge covers the HUD -> another corner; check `music.lastDrawn()` against the HUD rects.
- `?auto=1` ends differently -> game code moved into a new branch, or the game's RNG used for music.
- A custom song is silent or cut -> `addSong` returned `problems` (token count per line must equal `rows`).

## 7. Acceptance moments

Demo stills (`demo/index.html`, 1280 px, `checks/state.json`; the music part of `__state()` comes from `state()`):

1. `?t=2000&freeze=1`: title card "MEADOW ROAD"; the hero waits at the road's start; roll: Dawn Over the Ridge bar 1.
2. `?t=6500&freeze=1`: the hero walks east (walk frames); Meadow Road bar 2; the ribbon shows the title -> field switch on a beat.
3. `?t=10300&freeze=1`: battle: hero faces the slime between bumps, red edges pulse on the battle beat; Clash at the Pass bar 1 beat 3.
4. `?t=14500&freeze=1`: slime defeated: VICTORY! banner, the hero hops facing the viewer; Victory jingle in gold; the ribbon shows Meadow Road queued after it.
5. `?t=20600&freeze=1`: chest opened (lid tipped back, dark inside), the hero 4 px south of it, a gem rising from the chest mouth, FOUND A GEM banner: Item Get jingle; the ribbon shows "Meadow Road - resumes bar 2 beat 4"; status line says when.
6. `?t=21800&freeze=1`: Meadow Road resumed at bar 2 beat 4 (row 28), not from its top; the event log lists the resume.

Listening checks (David, after one click): the title, field and battle loops wrap with no gap or click; the battle
starts on a beat; after the chest jingle the field continues mid-phrase on a beat; the victory jingle then the field
from its top; Jukebox: every track and jingle plays; Tempo / Key change from the next beat without a glitch; the M
buttons on the strips mute single channels. `checks/run-checks.py --wav DIR` writes every track as WAV.
