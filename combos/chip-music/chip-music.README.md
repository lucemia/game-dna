# chip-music.js (F-03, `GameDNA_ChipMusic`) v1.0.4

A 4-channel chip synth for game music: **pulse 1** and **pulse 2** (duty cycle), a stepped **triangle** (bass), a
**noise** drum kit. It plays pattern data as seamless loops and one-shot jingles that pause the loop and bring it
back **on the beat**. One classic script, no dependencies, ASCII only, no audio files (every track is synthesized
in the browser when first played, about 0.1 s per loop track).

Built-in tracks: `title`, `field`, `battle` (loops) and `victory`, `defeat`, `item` (jingles). Add your own with
`addSong` (format below).

## Rules it keeps for you

- **Silent until the player's first click, tap or key** (browser rule). Before that everything runs (clock, state,
  badge) with no AudioContext; the first gesture starts audio at the current position of the current track.
- **Never touches game state, randomness or input**: it only listens passively for the first gesture.
- **Deterministic**: while audio is off the music clock is the game time you pass to `update()`; once sound runs it
  follows the audio clock. `state()` (track, row, notes, levels) is a pure function of commands and clock, so
  `?t=` fast-forward stills and automated runs are identical with or without it.
- **Idempotent**: `play(track)` for the track already playing (or already queued) does nothing, so calling it every
  step from a "which track fits this scene" function is safe. The same jingle twice within 0.4 s is merged.
- Never throws (every entry point is guarded); without WebAudio every call is a silent no-op.

## API

| call | what |
|---|---|
| `GameDNA_ChipMusic.create(opts)` | `opts.params` (below), `opts.songs` `{name: song}` extra tracks, `opts.sfx` an F-02 `GameDNA_Sfx` instance (share its AudioContext; big sounds duck the music), `opts.onEvent(ev)`. Create ONCE. |
| `m.update(stepMs)` | the music clock; call in the fixed update of EVERY scene (title, play, menus, end screens) |
| `m.play(track, o)` | loop a track. `o.at`: `'beat'` (default when something plays), `'bar'`, `'row'`, `'now'`; `o.from: 'resume'` continues where that track last stopped (on a beat); `o.restart: true` restarts the same track. During a pausing jingle the track starts when the jingle ends. |
| `m.jingle(name, o)` | one-shot. Starts on the next row. `o.after`: `'resume'` (default: the paused loop comes back on the next beat after the jingle), `'stop'` (silence after), or a track name (that track starts from its top). `o.mode`: `'pause'` (default) or `'duck'` (loop keeps playing quietly, back to full on its first beat after the jingle) |
| `m.stop({fade})` | fade the music out (ms, default 250) |
| `m.mute(on?)` / `m.volume(v)` / `m.setParams(p)` / `m.params()` | mute toggle, music volume 0-1, any param |
| `m.draw(ctx, x, y, {scale})` | optional badge, 23x11 px at scale 1: speaker + 4 channel meters; grey with a blinking dot until the first click, red cross when muted. Returns its rect. |
| `m.toggle()` | for your own sound button: the click that started audio only starts it (the module's gesture listener runs first), later clicks toggle mute; returns the mute state. Never wire a button straight to `mute()`. |
| `m.hit(x, y)` | pointer at canvas px: inside the badge it starts audio (first time) or toggles mute; returns true if it used the click |
| `m.state()` | `{t, phase: 'loop'|'jingle'|'jingle-duck'|'waiting'|'stopped', track, loop: {track, row, bar, beat, step, pattern, bpm, ...}, jingle, next, channels: [{ch, note, midi, level, fx}], locked, muted}` |
| `m.channels({p1, p2, tri, noise})` | per-channel gain 0-1 (mute layers) |
| `m.addSong(name, song)` | add or replace a track; returns `{ok, problems, rows, seconds}` (validation) |
| `m.songs()`, `m.recent(n)`, `m.stats()`, `m.lastDrawn()`, `m.unlock()`, `m.destroy()` | listing, event log, counters, badge rect, start audio from your own gesture handler, tear down |
| `GameDNA_ChipMusic.render(spec)` | Promise: OfflineAudioContext render of the same graph (tests): `{track, ms, actions: [{t, op, name, opts}], solo, bus}` |
| `GameDNA_ChipMusic.validate(song)` | check song data without an instance |

Params (`create({params})`, `setParams`): `volume` 0.7, `mute` false, `tempo` 1 (0.5-2, applies from the next beat),
`transpose` 0 (-12..12 semitones, next beat), `jingleMode` 'pause' | 'duck', `resume` 'beat' | 'bar' | 'row',
`duck` 0.25 (loop level under a duck-mode jingle), `at` 'beat' (default switch point).

## Song format

```js
m.addSong('cave', {
  bpm: 96, rpb: 4,            // rows per beat (16th notes); 4 beats per bar
  rows: 32,                   // rows per pattern
  loop: true,                 // false = jingle
  inst: { p1: { duty: 0.25, decay: 0.3, sustain: 0.6, release: 0.03 }, p2: { duty: 0.125 }, tri: {}, noise: {} },
  patterns: {
    A: { p1:    'E5*4 G5*4 B5~*8 | A5*6 G5*2 E5*8',
         p2:    'E4+37*2 . . E4+37*2 . . E4+37*4 . . . . | C4+47*2 . . C4+47*2 . . C4+47*4 . . . .',
         tri:   'E2*3 . B2*3 . E2*3 . B2*3 . | C3*3 . G2*3 . C3*3 . G2*3 .',
         noise: 'k . h . s . h . k . h . s . h h | k . h . s . h . k . k . s . s s' }
  },
  order: ['A', 'A']
});
```

One token = one row. `C4`, `F#3`, `Bb5` start a note; `-` holds; `.` is silence (on the noise channel `.` just starts
nothing: drums ring out); `*n` = the token then n-1 holds. Effects after the note: `+47` arpeggio (semitone offsets in
hex, cycled 60 times a second), `~` / `~~` vibrato, `>G5` slide to G5 over the note, `!` accent, `_` soft. Noise:
`k` kick, `s` snare, `h` hat, `o` open hat, `c` crash. `|` is ignored. Each channel line must add up to `rows`;
`validate` / `addSong` report the line that does not.

## Integration (15 lines, generic)

```js
const music = GameDNA_ChipMusic.create({ params: { volume: 0.7 } });       // once, at startup
function musicFor(g) {                                                       // which loop fits the game state
  if (g.scene === 'title') return 'title';
  if (g.scene === 'battle' && !g.battleOver) return 'battle';
  if (g.scene === 'map') return 'field';
  return null;                                                               // results screens: no loop
}
function fixedStep(dt) {
  music.update(dt);                                                          // every scene
  const t = musicFor(game); if (t) music.play(t);                            // same track = no-op
  /* ... the game's own step ... */
}
onBattleWon(() => music.jingle('victory', { after: 'field' }));              // at the code that DECIDES the win
onChestOpened(() => music.jingle('item'));                                   // loop pauses, resumes on a beat
// draw: music.draw(ctx, W - 27, 4);  pointer: if (music.hit(x, y)) return;  key M (if unused): music.mute();
```

## Self-check without a browser

- `create` runs once; `update` is reached in every scene, with the same step the game uses (so `?t=` fast-forward
  advances the music like live play).
- Every `jingle` sits where the event is decided (once per event), never in a per-frame condition.
- No game code moved into new branches; the game's RNG is never used for music.
- The badge (if drawn) sits in an empty corner, not over the HUD; `hit` is checked before the game's own pointer
  handling only for clicks inside the badge.
- The module file is byte-identical to the one given.
