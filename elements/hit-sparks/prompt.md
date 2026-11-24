# Add hit sparks and spell bursts to my game

Defaults (change any of these before pasting):
`{{size}}` = 1 · `{{life}}` = 14 · `{{sparks}}` = 8 · `{{gravity}}` = 0.15 · `{{hitstop}}` = 50 · `{{shake}}` = 2 · `{{critFlash}}` = screen · `{{style}}` = auto · `{{cycle}}` = 2 · `{{cap}}` = 192

---

You are given `hit-sparks.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`). Never rewrite it. It defines `GameDNA_HitSparks`. Read the README's API table first.

Only wire it in. Add code; never replace, rename or delete existing functions.

**First, map my game**: the fixed update step and how `?t=`, `?freeze=1`, `?auto=1` drive it; the draw order; every place damage or healing is applied (melee, projectiles, spells, items, enemy and contact damage); units (ids, positions, sizes); the camera; HUD and banner rects; where a battle or level starts.

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance** after the units and the canvas size exist:
```js
const fx = GameDNA_HitSparks.create({
  view: { x: 0, y: 0, w: FIELD_W, h: FIELD_H },   // screen px above the HUD
  seed: 1,
  params: { size: {{size}}, life: {{life}}, sparks: {{sparks}}, gravity: {{gravity}}, hitstop: {{hitstop}}, shake: {{shake}}, critFlash: '{{critFlash}}', style: '{{style}}', cycle: {{cycle}}, cap: {{cap}} },
  getObstacles: () => /* each living unit's sprite rect {x, y, w, h, id}, same coordinates as hit points */,
  uiRects: () => /* HUD, banner, open menus, in screen px */,
  onHitStop: ms => { /* freeze the world step that long */ },
  onShake: (px, ms) => { /* shake the play field, or do nothing */ }
});
```
3. **Hit sites**: at the moment each strike lands (the same frame HP changes), call `fx.hit(x, y, { dir, crit, target: unit.id, from: attacker.id })` once. `(x, y)` is on the target's body, on the side the blow came from. `dir` = attacker's facing (`1` right, `-1` left). `crit: true` only for real criticals. Spells: `fx.burst(cx, cy, element, { target })` at the target's body centre, element `'fire' | 'ice' | 'thunder' | 'heal'` (closest match), plus `fx.hit(cx, cy, { kind: 'spark', element, target })` if it damages. Heals and items: `'heal'`.
4. **Advance** in the fixed step: while the hit-stop freeze is counting down, `fx.update(0)` and skip the world (not input, not title or result screens); otherwise `fx.update(stepMs)`.
5. **Draw** every frame after sprites and existing effects, before HUD and banners, inside any shake translate: `fx.draw(ctx, -cameraX, -cameraY)` (`0, 0` without a camera).
6. **Clear** at the start of each battle, level, life or run: `fx.clear()`.

**Keep every other caller working**: `?auto=1` reaches the same ending as before; `?t=<ms>&freeze=1` steps the same update, so effects show in the frozen frame; shortcuts, pause, restart and title behave as before; hit-stop never blocks input or menus. Keep existing hurt flashes.

**Self-check without a browser**
- The module is byte-identical to the one given and loads before `create`.
- Every damage/heal site from your map calls `hit` or `burst` exactly once, on the impact frame; no call sits in a per-frame loop that repeats while hitboxes overlap.
- Identifiers used in `getObstacles`, `uiRects` and callbacks exist when first called.
- Walk one critical and one normal hit: `hit` → `onHitStop` → `update(0)` frames → normal frames; `draw` runs on every frame including the single `?freeze=1` frame.
- No host function was removed or renamed.

**Acceptance checks** (screenshots if you can)
1. A melee hit shows a slash or star with sparks at the contact point on the hit frame, gone within a quarter second.
2. Spells: rising flames, ice that shatters, a bolt from above, green rising motes.
3. A critical is bigger, flashes white, freezes briefly and shakes.
4. Effects never cover the HUD or a neighbouring unit.
5. `?auto=1` to the end: no console errors, same outcome.
