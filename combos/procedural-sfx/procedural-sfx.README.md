# procedural-sfx.js (F-02 procedural sound effects) v1.0.0

One dependency-free classic script, one global `GameDNA_Sfx`, ASCII only. Every sound is synthesized with Web Audio when
it plays (oscillators, seeded noise, envelopes, pitch slides, biquad filters, light FM) through a small mixer (sfx bus,
master, 25 Hz high-pass, gentle compressor, soft ceiling). No audio files, no network, no dependencies. Include the file
verbatim (`<script src="procedural-sfx.js">` or pasted into a `<script>` tag); do not rewrite it.

## Presets

| id | sound | typical event | aliases |
|---|---|---|---|
| `hit` | thump + crack | an attack connects | `impact` |
| `crit` | heavier hit + metallic ring, ducks the rest | critical / finishing blow | `critical` |
| `coin` | two-note chime (up) | coin, gem, small pickup | `pickup` |
| `jump` | rising sweep | jump starts | |
| `land` | low thud + dust | landing after a fall | |
| `footstep` | soft tap, strong variation | each foot contact (or `walk()`) | `step` |
| `menu-move` | short tick | cursor moves | `select`, `move` |
| `menu-confirm` | two notes up | confirm, open a window | `confirm`, `ok` |
| `menu-cancel` | two notes down | cancel, back, close | `cancel`, `back` |
| `explosion` | boom, rumble, crackle; ducks the rest | explosion, big spell | `boom` |
| `laser` | falling zap | shot, bolt, laser | `shot`, `shoot` |
| `powerup` | rising arpeggio | power-up, level up, key item | |
| `heal` | soft rising chord | heal, rest, restore | |
| `hurt` | wobbling drop | the player takes damage | `damage` |

## API

| call | what |
|---|---|
| `GameDNA_Sfx.create(options)` | returns an instance. `options.params` (below), `options.seed` (variation seed, default 1), `options.onEvent(ev)` (every play call's record, optional). Installs passive one-time listeners for the first pointer / key / touch: audio starts only after a real user gesture. Never throws. |
| `sfx.play(preset, opts)` | play one sound. `opts.pan` (-1..1) or `opts.x` + `opts.width` (pan from a screen x), `opts.volume` (0..2, default 1), `opts.seed` (exact variation), `opts.force` (skip the merge gap). Returns the event record `{n, t, preset, seed, pan, vol, status}`; `status` is `played`, `merged` (same preset again within its gap, 30-200 ms), `dropped` (all voices busy with higher-priority sounds), `locked` (no user gesture yet), `muted`, `noaudio` (browser has no Web Audio) or `unknown` (preset name not found; one console warning). |
| `sfx.walk(key, dx, grounded, stride)` | footsteps from travel: call every fixed step with the distance moved (px) and whether the walker is on the ground; plays `footstep` every `stride` px (default `params.stride`). One `key` per walker. |
| `sfx.update(stepMs)` | advance the module clock in your fixed step (every scene). Merge gaps then follow game time, so `?t=` fast-forward stays deterministic; if update stalls (a paused game), wall time is used. Optional. |
| `sfx.unlock()` | start audio from your own click / key handler (the automatic listeners do this already). Returns true once running. |
| `sfx.setParams(p)` / `sfx.params()` | change / read mixer and voice parameters live. |
| `sfx.mute(on?)` | toggle or set mute; returns the new state. |
| `sfx.isUnlocked()`, `sfx.active()`, `sfx.stats()`, `sfx.recent(n)` | audio running?, voices sounding now, counters (`played`, `merged`, `dropped`, `locked`, `byPreset`, ...), the last n event records (for tests and `__state()`). |
| `sfx.musicInput()` | a GainNode your music can connect to; it is ducked by `crit`, `explosion` and `powerup`. |
| `sfx.stopAll()`, `sfx.destroy()` | fade out every voice; remove listeners and close the context. |
| `GameDNA_Sfx.render(preset, seed, {params, solo, chain})` | Promise of `{left, right, rate, length, dur, patch}` from an OfflineAudioContext: the exact samples `play()` would produce for that seed and params (used by the checks and the demo waveforms). `null` without Web Audio. |
| `GameDNA_Sfx.describe(preset, seed, params)` | the recipe (layers, times, frequencies) as plain data. |
| `GameDNA_Sfx.presets`, `.aliases`, `.meta`, `.defaults`, `.resolve(name)`, `.supported()`, `.version` | |

## Parameters (`params`)

| key | default | range | what |
|---|---|---|---|
| `master` | 0.8 | 0..1 | master volume |
| `sfx` | 1 | 0..1 | sound-effect bus volume |
| `mute` | false | bool | silence everything (events still logged) |
| `maxVoices` | 12 | 1..32 | sounds at once; a new sound steals the oldest of lower or equal priority, else it is dropped |
| `duck` | 6 | 0..18 dB | how far big sounds (crit, explosion, power-up) push the others and the music down |
| `variation` | 0.5 | 0..1 | per-call random pitch, filter and level variation (seeded; 0 = every call identical) |
| `style` | modern | modern, retro, soft | modern = warm filtered squares and triangles; retro = brighter chip squares; soft = sines and triangles, darker |
| `pitch` | 0 | -12..12 st | transpose every preset |
| `brightness` | 1 | 0.4..1.6 | filter cutoffs |
| `length` | 1 | 0.5..1.6 | stretch every envelope |
| `stride` | 22 | 4..200 px | footstep spacing for `walk()` |
| `seed` | 1 | uint | variation seed (also `create({seed})`) |

## Integration (generic)

```js
// once, at startup (no audio starts until the player clicks or presses a key)
var sfx = GameDNA_Sfx.create({ seed: 1, params: { master: 0.8, variation: 0.5, style: 'modern' } });
// in the fixed update step, every scene (title, play, menus, end screens)
sfx.update(STEP_MS);
sfx.walk('player', Math.abs(player.x - player.prevX), player.onGround);   // footsteps
// at the code that DECIDES each event (once per event, never in a per-frame condition)
if (jumpStarted) sfx.play('jump', { x: player.x - camera.x, width: SCREEN_W });
if (landed && fallFrames > 8) sfx.play('land');
if (enemyWasHit) sfx.play(isCrit ? 'crit' : 'hit', { x: enemy.x - camera.x, width: SCREEN_W });
if (coinTaken) sfx.play('coin');
if (playerHurt) sfx.play('hurt');
// menus: cursor moved -> 'menu-move'; confirm / open -> 'menu-confirm'; cancel / back / close -> 'menu-cancel'
// optional: a mute toggle in the game's own options -> sfx.mute()
```

## Rules the module keeps (and the host must not break)

- It never changes game state, never reads or consumes the game's random numbers, never blocks or cancels input
  (its gesture listeners are passive and capture-only), never throws (every entry point is guarded).
- Audio starts only after a real user gesture; before that `play()` logs `locked` and is silent. `?auto=1`,
  `?t=&freeze=1` and headless tests therefore run silently and identically to the game without the module.
- Variation is seeded per call (`seed` + preset + call count), so the same event sequence gives the same sounds.
- Same preset twice inside its merge gap plays once (no stacking or phasing when a burst of events lands in one frame).

## Self-check without a browser

1. List every `play()` with the event behind it. None sits in a condition that stays true for many frames
   (overlap tests, "is attacking", "hp < x"): each must run once per event (on the frame it happens).
2. Every caller you touched still works: autoplay (`?auto=1`), fast-forward (`?t=`), restart, menus, keyboard shortcuts.
   You did not remove or rename any game function; you only added calls.
3. `GameDNA_Sfx.create` runs once (not per level or per frame); `update` runs in the fixed step of every scene.
4. The module file is byte-identical to the one you were given.
5. No new key binding collides with an existing one (a mute key is optional; use a free key or the game's options menu).
