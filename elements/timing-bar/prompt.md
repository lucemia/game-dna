# Add a timing-bar skill check to my game

**Required:** `{{moment}}` = where the skill check goes, in your words (e.g. "opening the chest: a lockpick; a miss can be retried").
Defaults:
`{{difficulty}}` = normal · `{{hits}}` = 1 · `{{motion}}` = pingpong · `{{ease}}` = none · `{{zones}}` = random · `{{assist}}` = off · `{{width}}` = 160 · `{{position}}` = center · `{{dim}}` = 0.3 · `{{shake}}` = on · `{{autoGrade}}` = good

---

You are given `timing-bar.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`); never rewrite it. It defines `GameDNA_TimingBar`: a window with a bar, a sweeping marker and miss / good / great / perfect zones; the player stops the marker; the result is `{grade, offset}`.

**Put the skill check exactly at: {{moment}}. Do not add it anywhere else.**

Add code; never remove or rename functions.

**First, read my game** and note: the fixed step and its loops (animation, `?t=&freeze=1`, autoplay); how confirm input arrives; the draw pass; HUD/dialog rects; every caller of that moment; the RNG; restart.

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance** once the screen size is known:
```js
const check = GameDNA_TimingBar.create({
  bounds: { x: 0, y: 0, w: <screen width>, h: <top of the HUD> }, seed: 7,
  params: { difficulty: '{{difficulty}}', hits: {{hits}}, motion: '{{motion}}', ease: '{{ease}}', zones: '{{zones}}', assist: '{{assist}}', width: {{width}}, position: '{{position}}', dim: {{dim}}, shake: '{{shake}}', autoGrade: '{{autoGrade}}' },
  autoplay: () => <the game's autoplay flag>,
  getObstacles: () => [ /* HUD, menu, dialog rects (no id); the player's sprite (with id) */ ],
  onShake: (px, ms) => { /* the game's shake, or nothing */ }
});
```
3. **Start** at {{moment}}, in update logic, in the one function all its callers go through: `if (!check.busy()) check.start({label: 'PICK THE LOCK', anchor: {x: <centre>, y: <top>, w, h} /* object on screen, optional */, onDone: r => { ... }})`. Move the action's original effect into `onDone`. Use `onDone`, not `await` (promises never resolve in a fast-forward loop).
4. **Route input and pause**: top of the fixed step: `if (check.busy()) { if (<confirm pressed this step>) check.press(); check.update(<step ms>); return; }`, so the world and the action wait. Otherwise `check.update(<step ms>)` at the end of the step. Pause/restart keys stay outside the gate.
5. **Draw**: `check.draw(ctx)` last in the draw pass, after the HUD, outside any shake translate.
6. **Reset**: `check.clear()` at new game / restart.

**Results.** A miss must let the player try again. A grade that changes a number multiplies the existing roll (perfect ×1.5, great ×1.25, good ×1.0, miss ×0.75); never add or skip a roll.

**Autoplay must end as before.** The `autoplay` option resolves checks at `{{autoGrade}}`; `good` (×1.0, success) keeps numbers and outcome. Autopilot presses must never reach `press()`.

**Self-check without a browser**
- Module byte-identical, loaded first.
- `start(` only at the action, guarded by `busy()`; every caller reaches it.
- `update(` every fixed step, also while busy; the freeze loop calls that step.
- Same RNG rolls with and without the check.
- Walk one autoplay check: `start` → 0.24 s → zone → 0.65 s hold → `onDone({grade: '{{autoGrade}}'})` → old result.

**Acceptance checks**
1. {{moment}} opens the bar (nothing else does); Z / Space / tap stops the marker; the game acts on the grade.
2. A one-frame tap counts; holding does not re-trigger; a miss allows a retry.
3. `?t=<ms>&freeze=1` is deterministic; `?auto=1` ends as before with no console errors.
