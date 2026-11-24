# seeded-replay.js (I-07 module, v1.1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_SeededReplay`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it.

**Record a run as its seed plus the player's input on every fixed step; play it back through your game's own step function to the identical end state.** The module stores each step's device input (as canonical JSON, deduplicated and run-length encoded), the hero's pose for the ghost, and a hash of your game state every `checkEvery` steps and at the end. A replay restarts the run with its seed and feeds the recorded input back instead of the keyboard; every checkpoint and the end hash are compared, so a replay that drifts says **DESYNC** at the first second it differs. The best run becomes a translucent **ghost** that races the player (time trial: best time and a live split). A replay HUD shows REPLAY / PAUSED, play-pause, speed (x.25-x4), a scrubber with checkpoint ticks, the time, and a verdict card (**END STATE MATCH** with the hash, or **DESYNC** with the time). Runs save and load as one line of text (`GDR1.<base64>.<crc32>`, a 40 s run is ~4-9 KB).

It only works if your game is deterministic from its seed and input: every random number from your seeded RNG, no `Math.random()`, no wall clock (`Date.now`, `performance.now`) in the update. The module counts `Math.random` calls inside recorded steps (`stats().randomCalls`, console warning) so you can find them.

## API

`GameDNA_SeededReplay.create(options)` returns an instance.

| option | meaning |
|---|---|
| `restart(seed, meta)` | Start a fresh run with this seed, leaving the game exactly as it is right after a live run began (same scene, same reset fields). `meta` is what you passed to `begin` (e.g. `{auto: true}` for an autopilot run): apply it. Called for watch, seek and verify. |
| `step()` | One fixed step of your game: the same function your loop and `?t=` fast-forward call (it reads input through `rep.input`). |
| `state()` | What must match: every gameplay field the step writes, and the RNG state. Not frame counters, the camera or caches that each step recomputes, images, DOM. Functions inside are skipped. |
| `pose()` | The hero for the ghost: a flat object of numbers / strings / booleans in WORLD units (`{x, y, facing, frame, ...}`), or `null` while the hero is not on the field (menus, battle screens). Stored at 1/16 px. |
| `drawGhost(ctx, pose)` | Draw your hero sprite for `pose` with your own draw code (real frames, its facing, feet on the ground), at its screen position with your camera. The module tints it, rings it and fades it. May return the sprite rect `{x, y, w, h}` in ctx units (recommended on HD canvases). |
| `progress()` | Optional number that grows toward the goal (distance along the course, x in a side-scroller, quest stage x 1000 - distance to the goal). Gives the live split against the ghost. |
| `exit()` | Leave a replay: put the game on its title or menu (restore anything `restart` changed, e.g. the autopilot flag). Default: `restart(lastSeed)`. |
| `view` | `{w, h}` logical size of your canvas (what your draw code uses). |
| `canvas` | Your canvas element: tap / drag on the replay bar. |
| `uiRects()` | Your HUD and window rects `[{x, y, w, h}]`, logical px, for the current scene. The module's panels avoid them. |
| `params` | See below. `stepMs` (default 1000/60), `maxSteps` (default 1 hour), `keyboard: false` (no module keys), `storeKey`. |
| `onEnd(info)`, `onBest(info)`, `onVerify(r)`, `onDesync(d)` | Optional events. |

| param | default | |
|---|---|---|
| `ghost` | `'best'` | `'best'`, `'last'`, `'off'`. While a replay of the best plays, the ghost is the previous best. |
| `ghostAlpha` | 0.8 | 0.15..1. The ghost keeps its own colours under a light (32 %) tint. |
| `hudScale` | `'auto'` | Pixel HUD scale: auto raises it until glyphs are >= 10 CSS px (phones); or 1-3. |
| `tint` | `'cyan'` | `'cyan'`, `'gold'`, `'violet'`, `'white'`. |
| `tag` | `'start'` | Name tag over the ghost: `'start'` (first ~3 s of a run), `'on'`, `'off'`. |
| `split` | `'on'` | Live split (needs `progress`). |
| `hud` | `'auto'` | Time-trial panel while recording; `'off'` hides every module HUD. |
| `speed` | 2 | Replay speed when watching (0.25..4). |
| `checkEvery` | 60 | Steps between checkpoint hashes. |
| `render` | `'auto'` | `'pixel'` (3x5 pixel font, whole px) when the view is <= 270 px tall, else `'smooth'`. |
| `watchKey`, `pauseKey` | `'v'`, `'p'` | Pick keys your game does not use. |
| `autoExit` | 4 | Seconds the finished replay rests before `exit()` (0 = stay). |
| `store` | `'off'` | `'local'`: keep the best run in localStorage. |
| `guardRandom` | `'on'` | Count `Math.random` calls inside steps (values unchanged). |
| `reduced` | `'system'` | `'on'`: no glides. |

| method | |
|---|---|
| `begin(seed, meta)` | **Where play of a new run starts** (after the reset and the scene change), not at page load. Starts recording. Ignored during replays. |
| `input(raw)` -> input | **In the fixed step, on the raw device input, before any autopilot choice.** Records it and returns a canonical copy (use the returned value); during a replay returns the recorded input instead. |
| `end({won, score})` | Where a run is won or lost. Stores the run; a faster won run (or higher `score`) becomes the best. |
| `steps()` -> n | In the live loop, per fixed tick: `for (let n = rep.steps(); n > 0; n--) step();` 1 while playing; 0..4 during a replay (speed, pause). |
| `drawGhost(ctx)` | In the world draw, before the hero (or in your depth sort), with the same transform as the world. |
| `draw(ctx)` | Last in render, every scene, after your HUD. |
| `watch('last' or 'best')`, `stop()` | Replay from a title / end screen (the module's watch key does this). |
| `pause(on)`, `setSpeed(x)`, `seek(step)`, `stepFrame(+-1)` | Replay controls (also keys: P, `[` `]`, arrows or `,` `.`, V / Esc). |
| `verify(which)` -> `{ok, match, desyncAt, checked, roundTrip, ...}` | Replays a run in place at full speed; with `'current'` the game ends where it was when the game is deterministic (`roundTrip`). |
| `save(which)` -> text, `load(text, 'best' or 'last')` | One-line text; a damaged text returns `null`. |
| `ghost()`, `stats()`, `lastDrawn()`, `playing()`, `recording()`, `run(which)`, `hash()`, `setParams(p)`, `destroy()` | |
| `GameDNA_SeededReplay.composite(ctx, drawFn, {tint, alpha})` | The ghost look for any sprite (static). |

## Integration example (generic)

```js
const rep = GameDNA_SeededReplay.create({
  restart: (seed, meta) => { runSeed = seed; autoplay = !!(meta && meta.auto); resetRun(); scene = 'play'; },
  step: () => fixedStep(),
  state: () => ({ hero, enemies, pickups, score, timer, scene, rng: rngState }),   // no frame counter, no camera
  pose: () => scene === 'play' ? { x: hero.x, y: hero.y, facing: hero.facing, anim: hero.anim, t: hero.animT } : null,
  drawGhost: (c, p) => drawHeroSprite(c, p.x - cam.x, p.y - cam.y, p.facing, p.anim, p.t),
  progress: () => hero.x, exit: () => { autoplay = AUTO0; scene = 'title'; },
  view: { w: VIEW_W, h: VIEW_H }, canvas, uiRects: () => hudRects(),
  params: { ghost: 'best', speed: 2, watchKey: 'v' }
});
function startRun() { resetRun(); scene = 'play'; rep.begin(runSeed, { auto: autoplay }); }
function fixedStep() { const raw = rep.input(readInput()); const inp = autoplay ? autopilot() : raw; update(inp); }
function win() { scene = 'win'; rep.end({ won: true }); }
// loop: while (acc >= STEP) { for (let n = rep.steps(); n > 0; n--) fixedStep(); acc -= STEP; }
// render: drawWorld (rep.drawGhost(ctx) before the hero) ... drawHud(); rep.draw(ctx);
```

## Rules

- **Determinism first.** All randomness from the seeded RNG in `state()`; seed it in the reset that `restart` calls. An RNG or autopilot memory that lives outside the reset must be reset where the run starts (both live and in `restart`), or replays of the second run drift.
- **`restart(seed, meta)` = the live start.** After it, the game must equal the moment `begin` ran in the live run. Fields the reset does not touch (camera, frame counters) stay out of `state()`.
- **Record the device, not the decision.** `rep.input()` wraps the raw keys / taps; the autopilot (if any) still runs after it, and its flag goes in `meta`.
- **Never derive gameplay from wall time or `Math.random`.** Cosmetic randomness in render is fine.
- Keep every other caller working: `?t=` fast-forward calls `step()` directly (it records, that is fine), `?auto=1` ends exactly as before, restart and title still work.

## Self-check without a browser

- The module file is byte-identical and loads before `create`; `create` runs before anything calls `begin`/`input`.
- `begin` sits where play starts, not at page load; `end` at every win and loss.
- Walk `update` line by line: every field it writes is in `state()` or recomputed each step; every random call uses the seeded RNG.
- `restart` sets the seed, resets, sets the play scene and applies `meta`; `exit` restores what `restart` changed.
- One worked example: 60 steps per second, `checkEvery` 60, a 12.5 s run = 750 steps = 13 checkpoints; at x2 the replay takes 375 ticks (6.25 s).

## What it guarantees

- Checked by `checks/core-check.mjs`: for 200 seeds of a toy game (floats, Map, Set, taps, a glitching `Infinity` axis) the replay end state equals the live end state, `verify('current')` leaves the game in the same state, and the saved text replays to the same state. Module mutants (no seed, raw input in replays, skip first step, blind hash, live input not canonical, RLE off by one, no CRC, pose delta, speed ignored, no checkpoint desync) and game mutants (stray `Math.random`, an RNG outside the state) all fail it.
- `input`, `steps`, `draw`, `drawGhost` never throw; throwing callbacks are counted in `stats().errors`.
