# Add a time rewind to my game

Defaults (change any of these before pasting):
`{{speed}}` = 2 · `{{seconds}}` = 6 · `{{energy}}` = meter · `{{meter}}` = 3 · `{{tint}}` = cool · `{{key}}` = r

---

You are given `time-rewind.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`). Never rewrite it. It defines `GameDNA_TimeRewind`. Read the README first.

Holding `{{key}}` (or the touch button) runs the world backwards; on release play continues from there.

Add code only; never replace, rename or delete existing functions.

**First, map my game**: the fixed step and its callers (animation loop, `?t=` fast-forward, `?auto=1`); where input is read; EVERY variable the update writes (state objects, loose `let`s, RNG state, camera, timers); the scenes; where a run starts; HUD rects; keys in use.

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance** once:
```js
const rewind = GameDNA_TimeRewind.create({
  snapshot: () => ({ /* every variable the update writes */ }),
  restore: s => { /* assign each one back from s (s is a fresh copy) */ },
  canRecord: () => /* true only while the world runs: no title, pause, menu, dialogue or end screen */,
  view: { w: LOGICAL_W, h: LOGICAL_H }, canvas,
  uiRects: () => [ /* HUD rects, logical px */ ],
  params: { speed: {{speed}}, seconds: {{seconds}}, energy: '{{energy}}', meter: {{meter}}, tint: '{{tint}}', key: '{{key}}' }
});
```
   If state lives in `const` objects, use `targets: () => [stateObj, ...]` instead of snapshot/restore (restored in place).
3. **Gate the step**: in the fixed step, right after input is read and before the autopilot and the world update: `if (rewind.step(STEP_MS)) return;`. On a rewound step nothing else may run: no update, autopilot, sound, score or timer.
4. **Draw**: `rewind.draw(ctx)` as the very last call of render, after the HUD.
5. **Clear**: `rewind.clear()` where a new game, level or restart begins.

**Rules**
- Facing and animation must be drawn from recorded state. Never compute facing from on-screen movement: in a rewind characters move backwards but keep facing where they faced. If facing or an animation phase is not stored in state yet, store it.
- The restore must be complete: after a rewind, everything `snapshot()` covers equals what was recorded, field by field. Code that cached a reference to an old object must look it up again after `restore`.

**Keep every other caller working**: `?auto=1` reaches the same ending as before; `?t=<ms>&freeze=1` gives the same frame every run; pause, restart, title and shortcuts are unchanged.

**Self-check without a browser**
- The module is byte-identical to the one given and loads before `create`.
- Walk the update line by line: every variable it writes is in `snapshot()` and assigned back in `restore()`.
- `canRecord()` is false on every non-play screen; `clear()` runs on each new run.
- No code derives facing from position changes.
- Walk one rewind with the defaults: holding for 30 steps at speed 2 restores the state from 60 steps (1 s) before the press and uses 17% of the meter.

**Acceptance checks** (screenshots if you can)
1. Hold the key mid-play: the picture desaturates with scanlines, a REWIND indicator and a history scrubber appear, characters move backwards still facing their way.
2. Release: play continues from that moment; the meter has drained and refills while playing.
3. Hold on the title or pause screen: nothing happens.
4. `?auto=1` to the end: no console errors, same outcome as before.
