# Add squash, stretch and anticipation to my game

Defaults (change any of these before pasting):
`{{amount}}` = 1 · `{{squash}}` = 0.28 · `{{stretch}}` = 0.2 · `{{spring}}` = 6 · `{{wobble}}` = 0.55 · `{{lean}}` = 9 · `{{breathe}}` = 0.025 · `{{anticipation}}` = 70 · `{{snap}}` = auto · `{{reduced}}` = system

---

You are given `squash-stretch.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`); never rewrite it. It defines `GameDNA_SquashStretch`. Read the README's API table first.

It bends the sprites my game already draws (crouch, stretch, squash, springy overshoot, lean, breath). Drawing only: **hit boxes, positions, timing and rules must not change.**

Add code only; never replace, rename or delete functions.

**First, map my game**: the fixed step and its callers (rAF loop, `?t=` fast-forward, `?auto=1`); each actor's id, velocity (and its units) and on-ground flag; where attacks, wind-ups and accepted damage happen; how each sprite is drawn (vs. shadow, bars, labels) and where its feet are; the camera; level, life and restart starts.

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance**, then attach each actor kind:
```js
const ss = GameDNA_SquashStretch.create({ params: { amount: {{amount}}, squash: {{squash}}, stretch: {{stretch}}, spring: {{spring}},
  wobble: {{wobble}}, lean: {{lean}}, breathe: {{breathe}}, anticipation: {{anticipation}}, snap: '{{snap}}', reduced: '{{reduced}}' } });
ss.attach(id, { w: SPRITE_W, h: SPRITE_H, maxSpeed: RUN_SPEED, maxFall: MAX_FALL_SPEED });  // same units as the velocities you pass
```
   Top-down game: add `view: 'top'`. Rigid actors (armour, robots): add `stiffness: 0.5` (less squash). HD game: keep its image smoothing.
3. **Every fixed step**, after movement: `ss.motion(id, vx, vy, onGround)` per moving actor (+vy = down; it detects landing and take-off), then `ss.update(STEP_MS)` once, last in the step.
4. **Events**, one line at existing sites: attack or cast starts → `ss.event(id, 'attack', 1, facing)`; damage accepted → `ss.event(targetId, 'hit', killingBlow ? 1.4 : 1, blowDir)`; long wind-ups → `'charge'`, then `'release'`. Never delay the game's own jump, swing or hit frame.
5. **Draw**: wrap only the sprite call: `ss.wrap(ctx, id, footX, footY, () => <existing sprite draw>)`. Feet = bottom centre of the drawn sprite, in its draw coordinates (camera applied). Shadows, bars, names and HUD stay outside (a shadow may widen by `ss.transform(id, ctx).sx`).
6. **Clear** at level, life, respawn, restart: `ss.clear()`.

**Keep every other caller working**: `?auto=1` reaches the same ending at the same time (no game logic reads the module); `?t=<ms>&freeze=1` shows the same frame every run (`update` in the step, never in render or on wall-clock time); shortcuts, pause, title and restart work as before. Keep existing blinks, knockback and wind-ups.

**Self-check without a browser**
- The module is byte-identical and loads before `create`.
- `ss.update` runs once per fixed step; `ss.motion` after each actor moves.
- Every sprite draw is wrapped (`wrap`, or `apply`/`restore` paired on every path); no HUD, bar or text inside.
- No game logic reads `transform()`; no size, position or collision value changed.
- Walk one landing (defaults): sy 0.72 for ~3 frames, overshoot ~1.04, settled by ~16; the collision box never changes.
- No function removed or renamed.

**Acceptance checks**
1. A jump: crouch on take-off, tall and thin while rising, squat on landing, springing back past normal. Feet stay on the ground.
2. An attack: crouch and lean back, then a lunge; a struck enemy squashes and tilts away.
3. Running leans forward; standing still breathes.
4. `reduced: 'on'`: half the deformation, no overshoot.
5. `?auto=1` to the end: no console errors, same outcome and time.
