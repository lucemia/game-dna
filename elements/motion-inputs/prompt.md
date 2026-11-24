# Add motion-input special moves to my game

Defaults (change before pasting): `{{moves}}` = `'623A Rising Slash', '236A Ember Shot', '[4]6A Dash Strike'` · `{{turnWithInput}}` = on · `{{moveList}}` = off

---

You are given `motion-inputs.js` and its `README.md` (read it first). **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged); never rewrite it.

It reads the stick and buttons every fixed step, recognises special-move motions written relative to the hero's facing (6 = forward, 2 = down: `236A` quarter circle, `623A`, `[4]6A` charge), with leniency and a busy buffer, calls my code to start the attack, and draws an input display in my game's style.

Add code only; never replace or delete existing functions.

**First, map my game**: the fixed step and every caller (live loop, `?t=` fast-forward, autopilot); where input is read and which keys exist (add down and up if missing); the attack code and its timers; how the hero faces and turns; the camera; HUD and window rects; where a run starts.

**Integration points**

1. **Create one instance** before the first step:
```js
const mi = GameDNA_MotionInputs.create({
  buttons: { A: 'attack' },                    // notation letter -> my input field
  moves: [{{moves}}],                          // strings like '236A Ember Shot'
  params: { turnWithInput: '{{turnWithInput}}', moveList: '{{moveList}}' },
  view: { w: VIEW_W, h: VIEW_H }, canvas,
  onSpecial: move => startSpecial(move.id),    // ids: kebab-case names
  canAct: () => /* hero free to attack */,
  avoid: () => [/* hero sprite box, camera applied, view units */],
  uiRects: () => [/* HUD and window boxes now */]
});
```
2. **Step**: in the fixed step, after reading the device: `raw.facing = hero.facing;` then `const inp = playing ? mi.step(raw, { fire: !autopilot }) : raw;` and use `inp` (the special's button comes back false). The autopilot keeps its own input.
3. **Specials**: write `startSpecial(id)` with my game's own attack rules: a projectile that damages enemies like the sword does, a rising hit, a dash with a hitbox. Return `false` when the hero cannot start it (it is retried a few steps).
4. **Draw**: `mi.draw(ctx)` last in render while playing, in the same units as the HUD.
5. **Reset**: `mi.reset()` where a run starts.

**Rules**
- If up jumps and a move passes up (360): delay the jump while `mi.jumpHold() > 0`.
- `turnWithInput: 'on'` when the hero turns to whichever side the player pushes; `'off'` when he always faces the foe.
- The hero's attack poses and effects must be visible (a flash, an arc, a projectile, speed lines), drawn in my game's style.
- Keyboard and gamepad: optionally `raw = GameDNA_MotionInputs.merge(raw, GameDNA_MotionInputs.pad(null, { attack: [0, 2] }))`.

**Keep every caller working**: `?auto=1` same ending (`fire: false`); `?t=<ms>&freeze=1` same frame; title, restart, shortcuts unchanged.

**Self-check without a browser**
- Module byte-identical, loaded before the game; `mi` exists before the first step.
- The input passed to `step` has `left right up down facing` and the button field.
- `startSpecial` handles every move id; specials use the game's damage rules.
- Example: down 4 steps, down-forward 3, forward 2, then A = `236A` (inside 12 / 8 / 30-step windows); the same with forward = left when facing left.

**Acceptance checks** 
1. Down, down-forward, forward + attack fires the 236 special with its effect; the callout names it.
2. Facing the other way, the mirrored motion fires it too.
3. Walking, jumping and plain attacks never fire a special.
4. Display text readable at 390 px wide, never over the hero or HUD.
5. `?auto=1` to the end: no console errors, same outcome as before.
