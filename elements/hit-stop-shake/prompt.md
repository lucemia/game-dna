# Add hit-stop, screen shake and hit flash to my game

Defaults (change any of these before pasting):
`{{strength}}` = heavy · `{{stop}}` = 6 · `{{shake}}` = 4 · `{{flash}}` = on · `{{reduced}}` = system

---

You are given `hit-stop-shake.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`). Never rewrite it. It defines `GameDNA_HitStop`. Read the README's API table first.

Add code only; never replace, rename or delete existing functions.

**First, map my game**: the fixed update step and its callers (rAF loop, `?t=` fast-forward, `?auto=1` autoplay); where input is read; every place damage lands (melee, projectiles, spells, enemy and contact damage) and which hits are light, heavy or killing blows; how units and their sprites are drawn (ids, rects); the camera; HUD and banner rects; where a battle, level or life starts.

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance** once, before anything calls `clear()`:
```js
const juice = GameDNA_HitStop.create({
  view: { x: 0, y: 0, w: FIELD_W, h: FIELD_H },   // play field above the HUD, screen px
  seed: 1,
  params: { strength: '{{strength}}', stop: {{stop}}, shake: {{shake}}, flash: '{{flash}}', reduced: '{{reduced}}' },
  uiRects: () => /* HUD, banner, open menus in screen px */
});
```
3. **Gate the step**: the FIRST line of the fixed update step, before input is read and before the autopilot runs: `if (!juice.step(STEP_MS)) return;`. A frozen step must change nothing: no counters, no RNG, no input consumed.
4. **Hit sites**: where each hit is accepted (after cooldown / invulnerability checks, on the step HP changes): `juice.hit({ strength, at: {x, y}, target: unit.id, dir: attackerFacing })` once. `'finisher'` for killing blows or criticals, `'heavy'` for strong attacks, `'light'` for chip damage, rapid hits or damage to the player.
5. **Draw**: `juice.begin(ctx)` before the background of the play field, `juice.end(ctx)` after sprites and effects; wrap each unit's sprite draw (not its shadow or bars) as `juice.sprite(ctx, unit.id, spriteRect, () => <existing sprite draw>)`, or use `juice.flashing(unit.id)` to pick an existing white sprite; then `juice.draw(ctx, -cameraX, -cameraY)` and the HUD after it.
6. **Clear** at the start of each battle, level, life or run: `juice.clear()`.

**Keep every other caller working**: `?auto=1` must reach the same ending as before (it may take longer by the frozen frames: say so); `?t=<ms>&freeze=1` goes through the same gated step, so the frame is the same every run; shortcuts, pause, restart and title behave as before; input pressed during a freeze is applied right after it. Keep existing hurt blinks and knockback.

**Self-check without a browser**
- The module is byte-identical to the one given and loads before `create`.
- `juice.step` is the first statement of the play step; trace one frozen step and confirm nothing above or below the `return` changes game state.
- Every damage site calls `hit` exactly once, never inside a loop that repeats while hitboxes overlap.
- `begin`/`end` are paired on every render path; the HUD is drawn after `end`.
- Walk one finisher with the defaults: 12 frozen steps, shake ±4 px decaying to 0 over 18 frames, a 2-frame white sprite and a 2-frame screen flash.
- No host function was removed or renamed.

**Acceptance checks** (screenshots if you can)
1. A heavy hit: the struck sprite is white for 2 frames, the field (not the HUD) is offset by whole pixels, the world holds still for ~6 frames.
2. A killing blow: a longer freeze, a stronger shake and a brief white screen flash under the HUD.
3. With `reduced: 'on'`: no shake, one short flash.
4. `?auto=1` to the end: no console errors, same outcome as before.
