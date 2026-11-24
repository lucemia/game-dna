# Add an on-the-beat input judge to my game

**Required:** `{{action}}` = the player action judged against the beat (e.g. "the hero's sword attack").
Defaults: `{{bpm}}` = 120 · `{{perfect}}` = 45 · `{{good}}` = 100 · `{{perfectMult}}` = 1.5 · `{{missMult}}` = 0.5 · `{{expect}}` = false · `{{calibrateKey}}` = C

---

You are given `beat-judge.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`); never rewrite it. It defines `GameDNA_BeatJudge`: a beat clock, a judge rating each press `perfect` / `good` / `miss` against the nearest beat (at the input EVENT's time, minus latency and calibration offset), a beat track and a calibration window. Only ADD code; never remove or rename my functions.

**First, read my game** and note: the fixed step and every loop calling it (animation, `?t=&freeze=1`, autoplay); where key and pointer events arrive; the ONE function every `{{action}}` goes through; HUD rects; a free strip 22 canvas px tall (under the feet or above the heads); restart.

## Integration points

1. **Create once**: `const beat = GameDNA_BeatJudge.create({ params: { bpm: {{bpm}}, perfect: {{perfect}}, good: {{good}}, expect: {{expect}} }, getObstacles: () => [ /* character sprite rects, each with an id */ ], hints: { tap: '<your confirm key> OR TAP', cancel: '<your back key>: CANCEL' } });` If the game already uses `GameDNA_ChipMusic`, pass it as `music` (beats then follow its tracks).
2. **Fixed step, every scene**: `beat.update(stepMs)` with the game's own step, also in fast-forward and autoplay loops.
3. **Keep the event**: in the keydown / pointerdown handler that starts `{{action}}`, also store the event (`lastActionEvent = e`); do not judge there.
4. **Judge where the game accepts the action** (inside that one function, only when a real player pressed, never for autoplay): `const r = lastActionEvent ? beat.press(lastActionEvent) : null; lastActionEvent = null;` then scale what the game already computes: perfect ×{{perfectMult}}, good ×1, miss ×{{missMult}} (no rating = ×1). Same random rolls as before.
5. **Draw**: in the HUD pass, `beat.draw(ctx, { x, y, w, h: 22 })` in the free strip (≥ 140 px wide), clear of the HUD and the characters.
6. **Calibration**: key `{{calibrateKey}}` (if unused) calls `beat.calibrate()`. While `beat.busy()`: keep calling `beat.update()`, pause the world, send confirm to `beat.key('confirm', e)`, back to `beat.key('back', e)`, arrows to `beat.key('left'|'right')`, canvas taps to `beat.pointer(x, y, e)` (canvas px). A press returning `{calibrating: true}` does nothing.
7. **Restart**: `beat.reset()` at new game.

## Keep every caller working

Autoplay (`?auto=1`) and `?t=` must end exactly as before: autopilot actions never call `press()`. The click track starts only after the player's first click or key; never create an AudioContext yourself.

## Self-check without a browser

- Module byte-identical, loaded before the game script; `create` runs once.
- `update` is reached in every scene, also while `busy()`.
- `press` appears exactly once, inside the action's function, guarded by a stored real input event.
- Walk one press: event at beat + 30 ms → perfect → damage ×{{perfectMult}}; event at beat + 70 ms → good → ×1.
- The strip overlaps no HUD rect and no standing character.

## Acceptance checks (run them)

1. Markers slide to the ring; `{{action}}` on the beat shows PERFECT, slightly off GOOD with EARLY / LATE, far off MISS; the multiplier applies.
2. Mashing gives misses; a second press on one beat is a miss.
3. `{{calibrateKey}}` opens calibration; 8 taps give an offset; KEEP shifts later ratings.
4. `?auto=1` ends exactly as before, no console errors; `?t=<ms>&freeze=1` is deterministic.
