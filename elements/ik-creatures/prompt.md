# Give my game's walking foes procedural legs (spiders, crabs, centipedes)

Defaults (change before pasting):
`{{kind}}` = spider · `{{palette}}` = auto · `{{stride}}` = 0.3 · `{{lift}}` = 0.16 · `{{render}}` = auto

---

You are given `ik-creatures.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`). It defines `GameDNA_IKCreatures`. Read the README API table first.

Only add code; never delete game functions. Foes keep their positions, AI, hit boxes, HP; the module only replaces how walking foes look.

**First, map my game**: side view or top-down; the fixed step and how `?t=`, `?freeze=1`, `?auto=1` drive it; world vs screen coordinates and the camera; the ground / wall / water test; where foes are drawn (a y-sorted list?) and their HP bars; which foes walk (not flyers); restart.

**Integration points**

1. **Create one instance** after the level exists:
```js
const bugs = GameDNA_IKCreatures.create({
  view: 'side',                         // or 'top'
  seed: 1, scale: VIEW_H / 360,
  ground: (x, y) => /* side view: y of the ground surface at column x at or below y (inside solid: top of that run), null for a pit */,
  walkable: (x, y) => /* false on water, walls, trees, pits */,
  actors: () => walkingFoes.map(f => ({ id: f.id, kind: '{{kind}}', x: /* feet centre x */, y: /* feet y (box bottom); top view: floor y */,
    size: /* body length ~0.9 x box width; centipede: whole length */, target: { x: heroX, y: heroY },
    flash: /* 1 while the game flashes it */, dead: !f.alive })),
  params: { stride: {{stride}}, lift: {{lift}}, palette: '{{palette}}', render: '{{render}}' }
});
```
World px, the game's own collision. Ids must be stable. A boss can be `'crab'` with its own `size`.

2. **Advance**: at the end of the fixed step, `bugs.update(worldRunning ? stepMs : 0)` (0 in menus, dialogue, pause, title).

3. **Draw**: where each of those foes' body was drawn, call `bugs.drawOne(ctx, f.id, camX, camY)` instead (`0, 0` inside a camera translate), inside the same y-sorted list; keep drawing their HP bars. Keep calling it for about a second after a foe dies so it can curl up.

4. **Reset**: `bugs.clear()` on new game / restart.

Kinds: spiders for walkers; a crab for a slow wide boss; a centipede for long chases (not side-view foes that reverse on the spot).

**Keep every caller working**: `?auto=1` still finishes with the same ending; `?t=<ms>&freeze=1` runs the same steps and draws the creatures; restart leaves no old creatures; pause freezes the legs. Never use `Math.random` for the creatures.

**Self-check without a browser**
- `ground` and `actors` are world px; `x, y` is the feet, not the box top; worked example: box x 100, y 276, 32 x 24 on a tile top at 300 gives `x: 116, y: 300`, and `ground(116, 290)` returns 300.
- `update` once per step on every path; `drawOne` once per frame per foe, in the sprites' space.
- No old body drawn under a creature; flyers untouched.

**Acceptance checks** (run them):
- Feet stand on the ground and stay put while the body walks over; no foot floats, sinks or slides, also on slopes and steps.
- Legs step in alternation (never two neighbours up together at a walk), the body faces where it walks, the head looks at the hero.
- A knocked-up or falling foe hangs its legs and replants on landing; a defeated foe curls up and fades.
- Same ending under `?auto=1`; no console errors.
