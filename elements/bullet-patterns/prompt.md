# Add bullet patterns (fans, rings, spirals, aimed shots) to my game

Defaults (change any before pasting):
`{{speed}}` = 1 · `{{density}}` = 1 · `{{size}}` = 1 · `{{hitbox}}` = 0.4 · `{{halo}}` = 0.6 · `{{graze}}` = on · `{{palette}}` = arcane · `{{render}}` = auto · `{{damage}}` = 2

---

You are given `bullet-patterns.js` (a finished module, one global `GameDNA_Bullets`) and its `README.md`. **Include the module verbatim** (`<script src>` before my game script, or pasted unchanged into its own `<script>`); never edit it.

The module owns bullets only. **My game keeps its rules**: damage goes through my existing damage function and invulnerability. Add code; never delete, rename or replace my functions.

**First, map my game**: fixed step and its callers (rAF, `?t=` fast-forward, `?auto=1`); scenes; camera; view height; player body; enemies (spawn, death, ids); damage function; invulnerability; pause, windows, restart; solid tiles.

**Integration points**

1. **Create one instance** after the game state exists:
```js
const bullets = GameDNA_Bullets.create({ seed: 1, scale: VIEW_H / 360,
  params: { speed: {{speed}}, density: {{density}}, size: {{size}}, hitbox: {{hitbox}}, halo: {{halo}},
    graze: '{{graze}}', palette: '{{palette}}', render: '{{render}}', damage: {{damage}} },
  bounds: { x: 0, y: 0, w: WORLD_W, h: WORLD_H },
  player: () => /* in this scene and alive */ ? { x, y, r: 3 } : null,  // small hit circle on the body, world px
  canHit: () => /* not invulnerable, no window open */,
  onHit: (hit) => /* my damage function with hit.damage */,
  solid: (x, y) => /* wall or obstacle here */ });
```
2. **Casters**: where each enemy spawns (once, not per frame) `bullets.emit(enemy.id, { pattern, every, range, muzzle: /* enemy radius */, source: () => enemy alive and in this scene ? {x, y} : null })`. Weak enemies cast a small `fan` or `aimed` burst, a boss a `cycle` of `spiral`, `flower`, `ring`; `range` about half the view. On death: `bullets.cancel(id); bullets.stop(id)`.
3. **Every fixed step**, after movement: `bullets.update(STEP_MS)`; `bullets.update(0)` while paused, in hit-stop, or while a dialogue or menu stops the world.
4. **Draw** after the sprites, before the HUD: `bullets.draw(ctx, camX, camY)` (`0, 0` inside a camera translate).
5. **New game, restart and every scene switch**: `bullets.clear()` (simplest: in the step, `if (scene !== lastScene) { lastScene = scene; bullets.clear(); }`).

New patterns are plain objects (README); keep only those where `GameDNA_Bullets.safeGap(pattern, { playerR: 3, playerSpeed })` gives `ok: true`. Pixel game: keep `render: 'auto'`.

**Keep every other caller working**: `?auto=1` still reaches its ending with no errors (keep `damage` about 2-4 % of max HP; never change the bot's route); `?t=<ms>&freeze=1` shows the same frame every run (`update` in the step, never in render); restart, pause, shortcuts still work.

**Self-check without a browser**
- `update` once per fixed step after movement, `0` while stopped; `clear()` on restart and scene switches.
- `player()` returns world px of a few-px circle on the body, or `null` off-scene; `canHit()` mirrors invulnerability.
- `onHit` calls my damage function; nothing else changes HP.
- Each caster `emit` runs once per enemy; its source is `null` when the enemy is dead; `cancel` + `stop` on death.
- Nothing is used before it is defined at load time.

**Acceptance checks** (screenshots if you can)
1. Enemies cast readable patterns, visible on every floor.
2. Grazing past a bullet is safe; a direct hit costs `{{damage}}` HP through my damage rule.
3. Walls stop bullets; a dead enemy's bullets fade out; a window or pause freezes them.
4. Scene change, restart: no leftover bullets.
5. `?auto=1` to the end: no console errors, same outcome.
