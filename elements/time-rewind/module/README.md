# time-rewind.js (E-16 module, v1.0)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_TimeRewind`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it.

**Hold a key (default R) or the touch button and the world runs backwards.** Every fixed step the module deep-copies your game state into a ring buffer. While the key is held it puts older copies back, 1x to 3x as fast as the game ran, and draws a rewind filter (desaturate, tint, scanlines, a soft ripple and a rolling band), a "REWIND" indicator with the time rewound, and a history scrubber. On release your game simply continues from the restored state; the newer copies are dropped. An energy meter (or charges) limits how much rewinding the player gets.

The module is a **gate** at the top of your fixed step: `if (rw.step(STEP_MS)) return;`. On a rewind step it has already restored an older state, and your update must not run. On every other step it records and returns `false`, and your game runs exactly as before: autoplay, `?t=` fast-forward and every ending are unchanged as long as nobody holds the key.

## API

`GameDNA_TimeRewind.create(options)` returns an instance.

| option | meaning |
|---|---|
| `snapshot()` + `restore(s)` | **Way 1.** `snapshot()` returns everything that changes during play (it may return live objects: the module deep-copies them). `restore(s)` gets a fresh copy and makes it the live state (assign it back to your variables). |
| `targets()` | **Way 2.** Returns an array of your live state objects (e.g. `[state]`). The module copies them, and restores **into the same objects** (identity kept), so references held elsewhere stay valid. Use it when your state lives in `const` objects. |
| `canRecord()` | `true` while the world runs: play scene, no pause, menu, dialogue, shop, title or game-over screen. When `false` nothing is recorded and holding the key does nothing. |
| `view` | `{w, h}`: your logical canvas size (what your draw code uses). Default: the canvas size. |
| `canvas` | Your canvas element: needed for the touch button. |
| `uiRects()` | Your HUD rects in logical px `[{x, y, w, h, r?}]` (`r` = corner radius). The filter goes around them (HUD stays readable) and the meter avoids them. |
| `params` | See below. |
| `stepMs` | Your fixed step (default 1000/60). `stride` record every n-th step (default 1). `maxBytes` memory cap (default 32 MB, oldest copies dropped first). |
| `keyboard` | `false` = the module does not listen for its key (drive it with `hold()`). |
| `onStart(info)`, `onEnd(info)`, `onRestore(info)`, `onBlocked(info)` | Optional. `onEnd` gets `{serial, cursor, steps, ms, why: 'release' / 'empty' / 'blocked'}`. |
| `skin` | Optional GameDNA skin id: the meter bar is drawn with the skin's `bar()`. |

| param | default | |
|---|---|---|
| `seconds` | 6 | History kept (0.5..60). |
| `speed` | 2 | Rewind speed: game seconds rewound per real second (0.25..4; 1-3 is sensible). |
| `energy` | `'meter'` | `'meter'` (drains while rewinding), `'charges'` (one per press), `'free'`. |
| `meter` | 3 | Seconds of holding a full meter allows. |
| `charges` | 3 | Number of charges. |
| `recharge` | 6 | Seconds to refill the meter from empty, or to regain one charge (only while the world runs). |
| `filter` | `'full'` | `'full'`, `'light'`, `'off'`. |
| `ripple`, `scanlines` | 0.5, 0.5 | 0..1. |
| `tint` | `'cool'` | `'cool'`, `'sepia'`, `'violet'`, `'mono'`. |
| `hud` | `'auto'` | Meter corner: `'auto'` (first free corner, top-right first), `'top-left'`, ..., `'off'`. |
| `render` | `'auto'` | `'pixel'` on low-res canvases (view height <= 270): whole pixels, 3x5 pixel font; `'smooth'` otherwise. |
| `touch` | `'auto'` | Round button bottom-right: `'auto'` = on coarse-pointer devices or after the first touch; `'on'`, `'off'`. |
| `key` | `'r'` | Any letter, `'shift'` or `'backspace'`. Pick one your game does not use. |
| `reduced` | `'system'` | `'on'`: no ripple, no rolling band, no flash. |
| `hint` | `'on'` | Key cap next to the meter. |

| method | |
|---|---|
| `step(dtMs)` -> bool | **First thing in the fixed step after input is read.** `true` = this step was rewound: skip your update (and your autopilot). Also call it while paused (it returns `false`). |
| `draw(ctx)` | **Last thing in render, after your HUD.** Saves and restores the context; sets its own transform from `view` and the canvas size. |
| `clear()` | New game, level load, respawn from a title or game-over screen: drops the history and refills energy. |
| `hold(on)` | Hold from your own input (gamepad button, your own touch control, a script). |
| `held()`, `rewinding()`, `amount()` | Current input, rewinding now, filter strength 0..1. |
| `stats()` / `state()` | `{frames, capacity, seconds, bytes, avgBytes, bytesPerSecond, rewinding, cursor, restoredSerial, rewoundMs, energy, charges, records, restores, lastRelease, ...}` |
| `lastDrawn()` | Rects drawn this frame (`meter`, `indicator`, `scrubber`, `button`). |
| `peek(i)` | A copy of history entry i (0 = oldest), for tests. |
| `setParams(p)`, `params()`, `destroy()` | |

## Integration example (generic)

```js
const rw = GameDNA_TimeRewind.create({
  snapshot: () => ({ world: state, rng: rngSeed }),          // EVERYTHING that changes during play
  restore: s => { state = s.world; rngSeed = s.rng; },
  canRecord: () => state.scene === 'play' && !state.menuOpen,
  view: { w: VIEW_W, h: VIEW_H }, canvas,
  uiRects: () => [hudRect],
  params: { speed: 2, seconds: 6, energy: 'meter', key: 'r' }
});
function fixedStep() {
  const input = readInput();                 // consume taps as before
  if (rw.step(STEP_MS)) return;              // rewound: the world does not run this step
  updateWorld(autoplay ? autopilot() : input);
}
function render() { drawWorld(); drawHud(); rw.draw(ctx); }
function newGame() { /* ...existing... */ rw.clear(); }
```

## What goes in the snapshot

Everything the next step reads and changes: positions, velocities, **facing**, animation names and phases or timers, HP, cooldowns, invulnerability, enemies, projectiles, pickups taken, particles that matter, score, the camera if it is state, the RNG state (or rewind replays a different future: allowed, but say so), level progress, flags. Not: images, canvases, audio, DOM, constants (the map if it never changes), input state. Functions and DOM objects inside the snapshot are kept by reference.

## Rules

- **Facing is state, not motion.** Characters are drawn with their recorded facing during a rewind, so they walk backwards in time while still facing where they faced. Never derive facing from frame-to-frame screen motion: in a rewind that motion is reversed and the character would turn around. Same for animation: draw from recorded anim/phase, so animations play backwards.
- **Nothing happens on a rewind step**: no game update, no autopilot, no sounds, no hit events, no score, no timers. The restored state is a past frame, so restoring must not fire events.
- **No recording while paused or in menus** (`canRecord()`), and call `rw.clear()` where a run starts, so a rewind never crosses into a previous run or the title screen.
- **Restore must be complete**: after the last rewind step, everything `snapshot()` returns must equal the copy recorded then, field by field. If the restore misses a variable (it is reassigned but the old reference is used elsewhere), use `targets()` or assign field by field.
- Cached references: code that kept a reference to an old object (`const hero = state.hero` at load time, an autopilot's target) must look it up again after a restore, or use `targets()` which keeps identities.
- Find every caller of what you touch: autoplay (`?auto=1`), `?t=` fast-forward (calls the same step), restart, respawn, title, pause, keyboard shortcuts. Hook, don't replace. The rewind key must not be one the game already uses.

## Memory

About the size of your state per step (`stats().bytesPerSecond` is the module's estimate: 8 bytes per number, 16 + 2 per character per string, 40 per object + 16 per field). Measured 2026-11-18: the demo's world (3 foes, bolts, gems, particles) ~4.6 KB per step = ~280 KB/s, 1.6 MB for 6 s; a 320x180 platformer (hero, 7 enemies, 14 coins) ~5.7 KB per step = ~340 KB/s, 2 MB for 6 s; a 640x360 top-down action RPG (18 enemies, windows, gems) ~13.9 KB per step = ~830 KB/s, 5 MB for 6 s. The cap is `seconds` (entries = seconds x 60 / stride) and `maxBytes`; use `stride: 2` to halve it (rewind then restores every other frame).

## Self-check without a browser

- The module file is byte-identical to the one you were given and loads before `create`.
- `rw.step(...)` sits in the fixed step after input reading and before the autopilot and world update, and returns early when it is `true`; `?t=` fast-forward goes through the same step.
- `snapshot()` covers every variable the update writes (walk the update function line by line); `restore()` assigns every one of them back.
- `canRecord()` is false on title, pause, menus, dialogue and end screens; `rw.clear()` runs on new game / restart.
- Facing and animation are drawn from state; no code computes facing from position deltas.
- `rw.draw(ctx)` is the last call in render; `uiRects()` returns the HUD in the same coordinates as `view`.
- Walk one rewind with the defaults: holding R for 30 steps at speed 2 restores the state recorded 60 steps (1 s) before the press and uses 0.5 s of a 3 s meter (17%).

## What it guarantees

- After N rewind steps at speed s (stride 1), the live state equals, field by field, the state recorded floor(N*s) steps before the press (clamped to the oldest kept); on release the game continues from it. Proven by `checks/core-check.mjs` with mutants (off-by-one restore, no copy, shallow copy, aliasing restore, recording while blocked, no truncation, no cap, duplicate push, no energy limit) that must fail.
- Deterministic: no `Math.random`, no wall clock; the filter animates from step counts.
- `step`, `draw` never throw; throwing callbacks are counted in `stats().errors`.
