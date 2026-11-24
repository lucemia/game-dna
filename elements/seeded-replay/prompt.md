# Add seeded replays and a ghost racer to my game

Defaults (change before pasting): `{{ghost}}` = best · `{{speed}}` = 2 · `{{tint}}` = cyan · `{{watchKey}}` = v · `{{pauseKey}}` = p

---

You are given `seeded-replay.js` and its `README.md` (read it first). **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged); never rewrite it.

It records each run's seed and per-step input, replays it through my step function to the identical end state (hash-checked), shows my best run as a ghost racing me, and gives replays a HUD.

Add code only; never replace or delete existing functions.

**First, map my game**: the fixed step and its callers; where input is read; where a run starts, is won, is lost; the RNG and every variable the update writes; the autopilot and its memory; the hero's draw code; HUD rects; keys in use.

**Make it deterministic**: gameplay randomness only from the seeded RNG (no `Math.random()`, no wall clock); the seed settable per run.

**Integration points**

1. **Create one instance** before anything can call it:
```js
const rep = GameDNA_SeededReplay.create({
  restart: (seed, meta) => { /* set seed, apply meta, reset, play scene: exactly a live start */ },
  step: () => step(),                       // one fixed step
  state: () => ({ /* every gameplay field + RNG state; no frame counter, no camera */ }),
  pose: () => /* hero on the field ? {x, y, facing, anim fields} in world units : null */,
  drawGhost: (ctx, p) => { /* the hero's own sprite for p, with the camera */ },
  progress: () => /* number growing toward the goal */,
  exit: () => { /* back to title; undo what restart changed */ },
  view: { w: W, h: H }, canvas, uiRects: () => [ /* HUD / window rects now */ ],
  params: { ghost: '{{ghost}}', speed: {{speed}}, tint: '{{tint}}', watchKey: '{{watchKey}}', pauseKey: '{{pauseKey}}' }
});
```
2. **Start**: where play of a new run begins (after the reset and scene change, NOT at page load): `rep.begin(seed, { auto: autoplayFlag })`.
3. **Input**: in the fixed step, wrap the raw device read, before any autopilot choice: `const raw = rep.input(readInput());` and use the returned value.
4. **End**: `rep.end({ won: true })` on every win, `rep.end({ won: false })` on every loss.
5. **Loop**: per fixed tick `for (let n = rep.steps(); n > 0; n--) step();` (leave `?t=` fast-forward calling `step()` directly).
6. **Draw**: `rep.drawGhost(ctx)` in the world draw just before the hero (inside the same transform); `rep.draw(ctx)` last in render in every scene.

**Rules**
- Reset autopilot memory and any RNG outside the reset at run start, in both paths.
- The ghost uses the hero's real frames and facing, feet on the ground.

**Keep every caller working**: `?auto=1` same ending; `?t=<ms>&freeze=1` same frame; title, restart, shortcuts unchanged.

**Self-check without a browser**
- Module byte-identical, loaded first; `create` before any `begin`.
- Each field the update writes is in `state()` or recomputed every step.
- `begin` at play start only; `end` at every win and loss; `exit` undoes `restart`.
- Example: a 12.5 s run at 60 steps/s = 750 steps = 13 checkpoints; at x2 it replays in 6.25 s.

**Acceptance checks** (screenshots if you can)
1. Finish a run, press `{{watchKey}}`: the replay ends with END STATE MATCH (DESYNC = not deterministic: fix it).
2. Play again: the ghost of the best run races you with BEST and a split.
3. `{{pauseKey}}` pauses, arrows scrub, Esc exits.
4. `?auto=1` to the end: no console errors, same outcome as before.
