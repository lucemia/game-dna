# beat-judge.js (F-04, `GameDNA_BeatJudge`) v1.1.0

A beat clock and an input judge for rhythm actions. Every press the game accepts is rated **perfect**, **good** or
**miss** against the nearest beat; **the game decides what a rating does** (damage multiplier, parry, combo bonus).
It draws a beat track (markers sliding to a judge ring, rating and EARLY / LATE label, combo) and a calibration
window. One classic script, no dependencies, ASCII only, no audio files.

## Rules it keeps for you

- **Judged at the event, not the frame.** `press(event)` maps `event.timeStamp` onto the beat clock, so a press is not
  late by the frame that handles it. It subtracts the audio output latency (`ctx.outputLatency`, or `params.latency`)
  and the player's calibration offset.
- **Beats from F-03 chip-music when you pass it** (`create({music})`): its own schedule, tempo, track switches; no beats
  while a pausing jingle plays, back on the beat when the loop resumes. Otherwise the module's own beat clock
  (`params.bpm`) with a woodblock click track (higher on the downbeat). Tempo changes land on the next beat.
- **Silent until the first click, tap or key.** No AudioContext before a user gesture. With `music`, the music owns sound.
- **Deterministic.** The beat clock is the game time you pass to `update()` until sound runs, then the audio clock;
  `?t=` fast-forward and autoplay give the same beats, ratings and drawings.
- **One rating per beat.** A second press on a beat already taken, or a press outside the Good window, is a miss
  (mashing never scores). Never throws; without WebAudio every sound call is a silent no-op.

## API

| call | what |
|---|---|
| `GameDNA_BeatJudge.create(opts)` | `opts.params` (below); `opts.music` an F-03 `GameDNA_ChipMusic` instance (beats from its tracks); `opts.sfx` an F-02 instance (share its AudioContext); `opts.onRate(r)`; `opts.onBeat(b)` (each beat as the clock passes it: `{key, t, bar, beat, down}`); `opts.onCalibrated(o)`; `opts.getObstacles()` (rects; one with an `id` under the track dims it); `opts.hints {tap, cancel}` (calibration key hints, e.g. `'Z OR TAP'`, `'X: CANCEL'`). Create ONCE. |
| `b.update(stepMs)` | the beat clock: the game's fixed step, in EVERY scene (also paused, menus, `?t=` loops) |
| `b.press(event)` | at the moment the game ACCEPTS the action; pass the keydown / pointerdown event (or `{timeStamp}`; `{clock: ms}` for scripted presses). Returns `r = {rating: 'perfect'|'good'|'miss', delta (ms, + = late), early, late, beat: {bar, beat, down, t}, combo}`; while the calibration window is open it returns `{rating: null, calibrating: true}`: do nothing with it |
| `b.draw(ctx, rect, o)` | the beat track in `rect {x, y, w, h}` (native px; 22 px tall at scale 1, `o.scale` integer) and, while open, the calibration window (`o.calRect` or centred in `o.bounds` / the canvas; 92 px tall). Returns the drawn rects `[{kind: 'lane'|'label'|'calib', x, y, w, h}]` (also `b.lastDrawn()`) |
| `b.calibrate({onDone})` / `b.busy()` | open the calibration window: one bar of count-in, then 8 taps; the median becomes `params.offset` on KEEP. While `busy()`, pause the world and route keys: `b.key('confirm'|'back'|'left'|'right', event)`, pointer `b.pointer(x, y, event)` (native px) |
| `b.state()` | `{t, source, bpm, bar, beat, phase (0..1 in the beat), next, gap, offset, latency, combo, best, counts, last, calibrating, locked, muted}` |
| `b.beats(t0, t1)` / `b.clock()` / `b.phase()` / `b.rate(t)` | beat list on the beat clock, the clock now, position in the beat (animate on the beat), what a press at clock `t` would rate (no claim) |
| `b.setParams(p)` / `b.params()` / `b.mute(on?)` / `b.volume(v)` / `b.toggle()` | params; mute and volume of the click track. `toggle()` is for a sound button: the click that starts audio only starts it, later clicks mute / unmute (never wire a button straight to `mute()`) |
| `b.restart()` / `b.reset()` / `b.unlock()` / `b.stats()` / `b.destroy()` | bar 1 on the next step (own clock); clear combo and counters; start audio from your own gesture handler; counters; tear down |
| `GameDNA_BeatJudge.render(spec)` | Promise: the click track rendered with OfflineAudioContext (tests): `{bpm, ms, beatsPerBar, tempo: [{at, bpm}]}` -> `{left, rate, beats}` |
| `GameDNA_BeatJudge.rateDelta(ms, params)` | pure rating of a delta |

Params: `bpm` 120 (own clock), `beatsPerBar` 4, `perfect` 45 ms, `good` 100 ms (half-windows), `offset` 0 ms (calibration;
\+ = the player is late), `latency` `'auto'` or ms, `lead` 1800 ms of markers on the track, `click` `'auto'` (on unless
`music` is given) / `'on'` / `'off'`, `volume` 0.5, `mute` false, `expect` false (true: a beat that passes without a
press counts as a miss; for games where every beat must be hit), `labels` true, `taps` 8.

## Integration (15 lines, generic)

```js
const beat = GameDNA_BeatJudge.create({ music /* F-03 instance, if the game has one */, params: { bpm: 120 },
  getObstacles: () => [/* sprite rects with id */], hints: { tap: 'Z OR TAP', cancel: 'X: CANCEL' } });
function fixedStep(dt) {
  beat.update(dt);                                          // every scene, also while paused
  if (beat.busy()) { /* route confirm/back/arrows to beat.key(); skip the world */ return; }
  /* ... the game's own step ... */
}
onKeyDown(e => { if (e.key === 'z') pendingAttackEvent = e; });   // keep the EVENT, act in the step
function heroAttacks() {                                    // the one function every player attack goes through
  const r = pendingAttackEvent ? beat.press(pendingAttackEvent) : null;   // autopilot attacks: no press
  const mult = !r ? 1 : r.rating === 'perfect' ? 1.5 : r.rating === 'good' ? 1 : 0.5;
  dealDamage(base * mult);
}
// draw (HUD pass): beat.draw(ctx, { x: 8, y: H - 26, w: W - 16, h: 22 });   calibration: beat.calibrate() from a menu or key
```

## Self-check without a browser

- `create` once; `update` reached in every scene with the game's step (also in `?t=` and autopilot loops).
- `press` only where a REAL player action is accepted, with that action's input event; never for autopilot actions, never
  per frame; the rating only scales or decorates what the game already does (same RNG rolls).
- While `busy()`, the world is paused but `update` still runs, and confirm / back reach `key()`.
- The track's rect is clear of the HUD and of the characters' feet; the calibration window can be opened by a key or menu.
- The module file is byte-identical to the one given.
