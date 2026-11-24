# adaptive-music.js (F-05, `GameDNA_AdaptiveMusic`) v1.0.2

Layered, state-driven music over **F-03 chip music** (`GameDNA_ChipMusic`, load it first and create ONE instance).
Each of chip music's four channels is one stem (layer):

| layer | chip channel | plays |
|---|---|---|
| `base` | triangle | the bass line, always on |
| `perc` | noise | drums: in for fights and the boss |
| `lead` | pulse 1 | the melody; pulled back to 45 % at low HP |
| `danger` | pulse 2 | a tense ostinato, only at low HP |

The game only **reports its state every step**; the module decides the music:

| mood (+ low HP) | track | base | perc | lead | danger |
|---|---|---|---|---|---|
| explore | `am-wilds` (Wildwood Trail) | 1 | 0 | 1 | 0 |
| combat | `am-wilds` | 1 | 1 | 1 | 0 |
| boss | `am-boss` (The Warden Wakes) | 1 | 1 | 1 | 0 |
| any + low HP | same | | | 0.45 | 1 |

## Rules it keeps for you

- **Debounce**: a new state counts only after it has held `enterMs` (500 ms) when it is more intense (combat, boss, low
  HP), `exitMs` (3000 ms) when it calms down. Flickers shorter than that are ignored (logged as `ignored`).
- **HP hysteresis**: low HP starts below `lowHp` (0.3) and ends only above `lowHp + hpGap` (0.4).
- **Bar lines**: every change lands on the next bar line of the playing loop (`quantize: 'beat'` for beats), never
  sooner than 60 ms away. Mood changes start with a one-bar **stinger** over the ducked loop (`am-alert` into combat,
  `am-warden` into the boss, `am-clear` back to explore) and switch layers at once; HP-only changes fade (in over
  `fade` = 2 beats, out over `release` = 4 beats).
- **No overlap**: a new change is never decided while the last one is pending, fading or under its stinger, and changes
  start at least `minBars` (2) bars apart.
- **The game's own jingles and tracks win**: while a chip-music jingle of the game plays (victory, item) every channel is
  open; when the game asks chip music for another loop (title, results) the layers step aside. A different loop asked
  during gameplay is reported once as a `conflict` and never fought.
- **Jingle limit** (v1.0.2): each of the game's jingles pauses the loop, so while adaptive music steers it wraps THIS
  chip-music instance's `jingle()` (chip music's file is untouched) and drops a jingle that comes too often: an
  item-kind jingle (anything but `victory` / `defeat`) during a fight; a `victory` asked during a fight (or boss fight) unless the reports
  say it is over within one bar (then it plays; a kill with foes left is dropped); any jingle while another plays or within `jingleGapBars` (4) bars
  after it (so jingles pause at most about a quarter of play). `defeat` and any `after: 'stop'` always play; a
  boss's `victory` plays when the boss report drops within a bar. Dropped calls return `{type: 'dropped'}`
  (or `'deferred'` while a victory waits for the fight to end); `state().jingleLimit` has the rule and the counts. Still: give a
  victory to a fight that ends, never to each kill, and no jingle to coins.
- Deterministic: the clock is chip music's music clock, so `?t=` fast-forward stills and autoplay match live play.
  Never touches game state, randomness or input; draws nothing; never throws; silent until the first click (chip music).

## API

| call | what |
|---|---|
| `GameDNA_AdaptiveMusic.create({music, params, mix, tracks, stingers, songs, onEvent})` | `music`: the chip-music instance (required). Installs its songs into it. Create ONCE. |
| `a.update(report)` | every fixed step, AFTER `music.update(stepMs)`. `report = {active, combat, boss, hp}` or `{active, mood: 'explore'|'combat'|'boss', hp}`; `hp` 0-1 (or `hp` with `maxHp`); a missing flag is false, a missing `hp` keeps the last one |
| `a.state()` | `{t, active, mood, low, heard, raw, candidate: {mood, low, heldMs, holdLeftMs}, layers: {base, perc, lead, danger}, pending: {at, inMs, to, stinger, track}, fading, jingle, loop: {track, bar, beat, row, nextLine}, conflict}` |
| `a.plan()` | every change: `{id, at, end, from, to, fromGains, toGains, fadeIn, fadeOut, stinger, track, reason, committedAt, heldMs}` |
| `a.gainsAt(clock)`, `a.curve(t0, t1, dt)` | layer gains at a music-clock time (for visualizers) |
| `a.setParams(p)`, `a.params()` | rules below, live |
| `a.release()` | stop steering and open every channel (leaving adaptive music for good) |
| `a.recent(n)`, `a.stats()` | event log (`commit`, `ignored`, `conflict`), counters |
| `GameDNA_AdaptiveMusic.validate({mix, stingers, songs})` | stingers only use channels audible in the mood they lead into |
| `GameDNA_AdaptiveMusic.render(spec)` | Promise: OfflineAudioContext render of a scripted session (tests) |

Params: `quantize` 'bar' | 'beat', `fade` 2 / `release` 4 (beats), `enterMs` 500, `exitMs` 3000, `lowHp` 0.3,
`hpGap` 0.1, `minBars` 2, `stingers` true, `jingleGapBars` 4.

Your own songs: pass `songs: {name: chipSong}` and `tracks: {explore, combat, boss}`; write each channel as its stem
(triangle bass, noise drums, pulse 1 melody, pulse 2 danger line), whole bars, same tempo for loops and stingers.

## Integration (15 lines, generic)

```js
const music = GameDNA_ChipMusic.create({ params: { volume: 0.7 } });          // once
const adaptive = GameDNA_AdaptiveMusic.create({ music });                       // once, after it
function fixedStep(dt) {
  music.update(dt);                                                             // every scene
  if (game.scene === 'title') music.play('title');                              // menus: chip music as before
  adaptive.update({
    active: game.scene === 'play',                                              // gameplay: adaptive picks the track
    combat: game.enemies.some(e => e.alive && dist(e, game.hero) < 120),
    boss: !!(game.boss && game.boss.awake && game.boss.alive),
    hp: game.hero.hp / game.hero.maxHp
  });
  /* ... the game's own step ... */
}
onBossDefeated(() => music.jingle('victory'));     // a fight / boss that ENDS (not each kill; no jingle for coins)
```

## Self-check without a browser

- `music.update` then `adaptive.update` run in every scene with the game's own step, also in `?t=` / autoplay loops.
- During gameplay no `music.play(...)` is called (return `null` from the track picker there); outside it `active: false`.
- The report only reads state; `combat` means foes engaged or close, not "a foe exists somewhere on the map".
- Every `jingle` call is a rare event (fight over, boss down, chest): none per kill or per coin; the loop is paused
  less than 15 % of a normal run.
- Both module files are byte-identical to the ones given.
