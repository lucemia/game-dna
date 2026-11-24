# F-02 Procedural sound effects

## 1. What it is

A full set of game sound effects with no audio files: every sound is synthesized by Web Audio at the moment it plays, from a small recipe of layers (oscillators, seeded noise, an envelope with attack and release ramps, pitch slides, biquad filters, light FM). Fourteen presets cover what most 2D games need: **hit, crit, coin, jump, land, footstep, menu move, menu confirm, menu cancel, explosion, laser / shot, power-up, heal, hurt**. Each call is a seeded variation (pitch, filter, level, noise grain), so ten coins in a row sound like ten coins, not one sample on repeat, and the same event sequence always gives the same sounds.

A small mixer sits behind the presets: sfx bus and master volume, mute, a voice cap with priority stealing (a footstep never cuts an explosion), a merge gap so a burst of the same event in one frame plays once, ducking (crit, explosion and power-up push the other sounds and the game's music down for a moment), a 25 Hz high-pass, a gentle compressor and a soft ceiling so nothing clips. The palette aims at a 2020s indie game: warm filtered squares and triangles, short clean transients, no harsh aliasing, no clicks at note ends.

Browsers block audio until the player interacts: the module stays silent (and creates no audio context) until the first real click, tap or key, which it notices with passive listeners that never consume the event. Without Web Audio every call is a logged no-op. The module never changes game state, never touches the game's random numbers and never reads input, so `?auto=1` and `?t=&freeze=1` run exactly as before.

## 2. Default parameters

| Key | Default | Range | Meaning |
|---|---|---|---|
| `master` | 0.8 | 0–1 | Master volume |
| `sfx` | 1 | 0–1 | Sound-effect bus volume (music input is separate) |
| `variation` | 0.5 | 0–1 | Per-call variation: pitch ±(2–12 %) × v by preset, filter ±(15–25 %) × v, level ±(15–20 %) × v, noise start; 0 = identical every call |
| `style` | modern | modern, retro, soft | Oscillator and brightness palette (see 3) |
| `pitch` | 0 st | −12–12 | Transpose all presets |
| `brightness` | 1 | 0.4–1.6 | Multiplies filter cutoffs |
| `length` | 1 | 0.5–1.6 | Stretches all envelope times |
| `maxVoices` | 12 | 1–32 | Sounds at once |
| `duck` | 6 dB | 0–18 | Depth of ducking under big sounds |
| `stride` | 22 px | 4–200 | Footstep spacing for `walk()` |
| `mute` | off | off, on | Silence (events still logged) |

Preset table (default params, seed 1, measured by `checks/run-checks.py` from offline renders through the full mixer):

| Preset | Recipe | Length | Max 30 ms RMS | Peak | Pitch | Priority / merge gap |
|---|---|---|---|---|---|---|
| hit | sine thump 175→52 Hz, triangle punch 430→120 Hz, band-passed white crack 2.7→1.15 kHz, pink tail | 0.16 s | −16 dB | 0.35 | — | 3 / 35 ms |
| crit | heavier thump 150→38 Hz, crack 3.4 kHz, FM ring 1.56 kHz (ratio 2.76), 2.35 kHz partial; ducks | 0.52 s | −14 dB | 0.42 | — | 5 / 60 ms |
| coin | square 988 Hz then 1319 Hz (low-passed), octave and fifth shimmer | 0.42 s | −14 dB | 0.36 | up ×1.33 | 2 / 45 ms |
| jump | square sweep 185→560 Hz with opening filter, sine body, air noise | 0.2 s | −17 dB | 0.29 | up ×1.7 | 2 / 60 ms |
| land | sine 118→47 Hz, brown-noise dust, tick | 0.14 s | −18 dB | 0.30 | — | 1 / 80 ms |
| footstep | band-passed pink tap ~950 Hz, heel 96→58 Hz, scuff; strong variation | 0.08 s | −25 dB | 0.16 | — | 0 / 70 ms |
| menu-move | triangle 1320 Hz + sine 660 Hz tick | 0.05 s | −26 dB | 0.25 | — | 1 / 30 ms |
| menu-confirm | 880 Hz then 1318.5 Hz, FM sparkle | 0.33 s | −16 dB | 0.30 | up ×1.5 | 3 / 60 ms |
| menu-cancel | 587 Hz then 392 Hz, darker | 0.23 s | −17 dB | 0.26 | down ×0.67 | 3 / 60 ms |
| explosion | brown-noise boom (2.6 kHz→150 Hz), pink body, sine 74→30 Hz, brown rumble tail, 6–8 crackle grains; ducks | 1.17 s | −9.5 dB | 0.72 | — | 6 / 90 ms |
| laser | square 1500→190 Hz + detuned saw, click | 0.19 s | −18 dB | 0.25 | down ×0.39 | 2 / 40 ms |
| powerup | six-note pentatonic arpeggio (one layer per note), last note rings with vibrato, rising sweep, FM sparkle; ducks | 0.62 s | −17 dB | 0.24 | up ×1.76 | 5 / 200 ms |
| heal | staggered C-E-G sine chord with vibrato, rising shimmer 1568→2093 Hz, airy noise | 0.85 s | −19 dB | 0.31 | up ×1.33 | 4 / 150 ms |
| hurt | square 620→170 Hz with fast vibrato, noise hit, low thump | 0.3 s | −18 dB | 0.26 | down ×0.57 | 4 / 120 ms |

## 3. Variants

- **Modern indie** (default): `style modern`, `variation 0.5`.
- **Chip retro**: `style retro` (brighter squares), `brightness 1.2`, `variation 0.35`.
- **Soft and cozy**: `style soft` (sines and triangles, darker), `brightness 0.8`, `length 1.15`.
- **Heavy and low**: `pitch −4`, `brightness 0.8`, `length 1.2`.
- **Tight and quiet**: `master 0.6`, `length 0.8`, `maxVoices 8`, `duck 3`.

## 4. Interface

**Needs**
- The code that decides each event, to call `play(preset, opts)` once per event (never in a per-frame condition).
- Optional: the fixed update step of every scene calling `update(stepMs)` (merge gaps follow game time; fast-forward stays deterministic); distance walked and on-ground per step for `walk(key, dx, grounded)`; the event's screen x and screen width for pan.

**Provides**
- `play` → event record `{n, t, preset, seed, pan, vol, status}` with status `played | merged | dropped | locked | muted | noaudio | unknown`.
- Mixer: `setParams`, `mute`, `musicInput()` (ducked bus for the game's music), `stopAll`, `destroy`.
- `GameDNA_Sfx.render(preset, seed, {params})` → exact samples (OfflineAudioContext), `describe()` → recipe data.
- `recent(n)`, `stats()`, `onEvent` for tests, the demo's `__state()` and the judge probe.

**Delivery (v1).** `module/procedural-sfx.js` (one global `GameDNA_Sfx`, ASCII only, no dependencies); API, generic 15-line integration and the self-check in `module/README.md`; `prompt.md` for an agent that has never seen this repo.

## 5. Screen rules (exact numbers)

The element is audio; these are its sound rules (all checked on offline renders, `checks/run-checks.py`):

- **Envelope**: every layer starts at 0, rises linearly over its attack (≥ 0.8 ms, most 1–3 ms), holds, falls exponentially to −60 dB at end − 6 ms, then ramps linearly to 0 at end. Sources stop 20 ms after their envelope ends. Measured: first 4 samples ≤ 3 % of the peak, last 3 ms of every sound ≤ 0.0007, buffer tail silent.
- **Level**: peak ≤ 0.95 and no sample at the soft ceiling (knee 0.8, ceiling 0.98) for every preset × seeds 1–3; max 30 ms RMS between −34 and −5 dBFS (UI ticks and steps ≈ −25 dB, most events −14 to −19 dB, explosion −9.5 dB).
- **DC**: |mean| < 0.004 over the sound and its last 20 ms (seeded noise buffers are mean-removed; 25 Hz high-pass on the master).
- **Pitch**: presets that slide or step move as declared (autocorrelation track of the pitch layers, last/first > 1.12 up, < 0.89 down) on seeds 1–3.
- **Determinism**: same seed → same samples (within 1e-5: OfflineAudioContext noise playback differs by ~1e-7 between renders); seeds differ when `variation` > 0 and are identical at 0. Per-call seeds = hash(create seed, preset, call count).
- **Mixer**: voice cap with priority (explosion 6, crit / power-up 5, heal / hurt 4, hit / confirm / cancel 3, coin / jump / laser 2, land / menu-move 1, footstep 0); a new sound steals the oldest voice of lower or equal priority with a 15 ms fade, else it is dropped. Merge gap per preset (30–200 ms) in module time. Ducking: −duck × 0.25 to × 0.6 × 1.6 dB on other voices for 60 % of the big sound, attack 15 ms, release 120 ms; the music input ducks by `duck` dB.
- **Gesture**: no AudioContext before the first trusted pointer, touch or key event (checked through `navigator.userActivation`); the listeners are passive and capture-only and never stop propagation.

The demo (sound board) at 1280 px: four groups of pads with offline-rendered waveforms, a 150 px "last sound" waveform with playhead, mixer sliders, the event log with status pills and a voice meter; each pad waveform is drawn to its own peak with the peak level as a dB tag; the scene is 224×126 native, integer-scaled, nearest-neighbour. 390–500 px: one column, two pad columns, no horizontal scroll; under 460 CSS px the scene shows a 160×90 window that follows the hero (HUD and menu inside it).

## 6. Common mistakes (symptom → fix)

- A buzz or machine-gun repeat while touching something → `play` sits in a per-frame overlap / "is attacking" condition; move it to the frame the event happens (the module merges bursts, but 60 calls a second still buzz).
- Nothing plays → no user gesture yet (status `locked`), or `create` runs per frame / per level (each new instance starts locked); create once.
- Every coin sounds identical → `variation` is 0, or a fixed `opts.seed` is passed on every call.
- Menu sounds missing while paused → the game stops calling `update`; harmless (the module falls back to wall time), but `play` must still be called from the menu code.
- `?auto=1` ends differently after adding sounds → a call moved game code into a new branch, or the game's RNG was used for a sound; the module itself never consumes randomness.
- Footsteps in the air or while blocked by a wall → pass the distance actually moved and the real on-ground flag to `walk`.
- Hurt plays on enemy hits → `hurt` is for the player; enemies taking damage use `hit` / `crit`.
- Explosions drown everything → lower `duck` or `master`; do not raise the volume of other calls above 1.
- Clicks at the end of sounds after editing the module → the module was rewritten; include it verbatim.

## 7. Acceptance moments

Demo stills (`demo/index.html`, 1280 px, autoplay scene; each still also shows the newest scene sound's waveform with its playhead and the event log; `checks/state.json`):

1. `?t=2400&freeze=1`: third sword hit on slime A, a crit: white-gold burst, slash arc; log ends hit, hit, crit; waveform = crit (thump + ring).
2. `?t=3720&freeze=1`: hero mid-jump onto the ledge, the air coin just taken (sparkle); log: jump, coin.
3. `?t=4150&freeze=1`: hero on the ledge at the star gem, power-up burst; waveform = the six-note arpeggio.
4. `?t=5420&freeze=1`: hurt by slime B: hero turned to face it, knocked back, blinking, 4 of 5 hearts; log: land, hurt.
5. `?t=7990&freeze=1`: the bolt reached the barrel: flash ring, fire, smoke, debris, screen shake; log: laser, explosion; waveform = explosion with playhead near its start.
6. `?t=10850&freeze=1`: heal at the shrine: rising sparkles, hearts full; waveform = heal chord.
7. `?t=12650&freeze=1`: pause menu over the dimmed scene, cursor on RESTART after two moves; log: menu-confirm, menu-move, menu-move.

Listening checks (David, by ear, after one click): every pad sounds clean (no click at the end, no crackle, no harsh fizz), "Play 5 variations" gives five clearly related but different takes, the sliders change the sound immediately, and the scene's sounds follow its events with no buzz or pile-up.
