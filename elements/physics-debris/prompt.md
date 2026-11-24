# Add physics debris and breakable props to my game

Defaults (change before pasting):
`{{amount}}` = 1 · `{{bounce}}` = 0.35 · `{{friction}}` = 0.6 · `{{rest}}` = 2600 · `{{dust}}` = 1 · `{{shake}}` = 3 · `{{hitstop}}` = 0 · `{{render}}` = auto

---

You are given `physics-debris.js`, a finished module, and its `README.md`. **Include the module verbatim** (`<script src>` before the game script, or pasted unchanged into its own `<script>`). It defines `GameDNA_Debris`. Read the README API table first.

Only add code; never replace or delete functions. The module is cosmetic: no change to rules, positions, loot or timing.

**First, map my game**: the fixed step and how `?t=`, `?freeze=1`, `?auto=1` drive it; side or top-down view; wall test and tile size; camera; draw order (y-sorted list?); attack impact frames; knock-back and where walls stop it; defeats; new game / level start.

**Integration points**

1. **Create one instance** after the map exists:
```js
const debris = GameDNA_Debris.create({
  view: 'side' /* or 'top' */, seed: 1, scale: VIEW_H / 360, tile: TILE,
  solid: (x, y) => /* the game's own wall test, WORLD px */,
  bounds: { x: 0, y: 0, w: WORLD_W, h: WORLD_H },
  params: { amount: {{amount}}, bounce: {{bounce}}, friction: {{friction}}, rest: {{rest}}, dust: {{dust}}, shake: {{shake}}, hitstop: {{hitstop}}, render: '{{render}}' }
});
```
2. **Props**: where a game or level starts, `debris.clear({ props: true })`, then some `debris.addProp({ id, kind, x, y })` (about 8-15; fewer in a small level) (`crate`, `barrel`, `pot`, `statue`, `crystal`; `y` = the floor line under it) in corners, beside walls, near fights. They never block movement. If my game has prop sprites, use those (`art`, `hull`, `material`; README).
3. **Blows**: on each attack's impact frame (once), `debris.hit(x, y, r, { dx, dy, force: 320 })` in front of the attacker, or `debris.hitRect(box.x, box.y, box.w, box.h, { dx })` for a hit box.
4. **Knock-back**: each step a body is knocked back, `debris.touch(x, y, r, speedPxPerSec, { dx, dy })`; on the step a wall first stops it, `debris.wallHit(id, contactX, contactY, normalX, normalY, speed, { material: 'rock' })`. Do not apply the returned velocity. Draw that body at `x + debris.offset(id).x`, `y + debris.offset(id).y` (draw only).
5. **Defeats**: `debris.shatter(material, x, y, { count: 8, dx, dy })` (`leaf`, `rock`, `bark`, `shell`, `bone`, `crystal`, `spirit`...).
6. **Advance**: at the end of the fixed step, `debris.update(worldRunning ? stepMs : 0)` (0 in menus, dialogue, pause, title).
7. **Draw**, inside the camera transform: side view: `debris.drawProps(ctx, 0, 0)` before the actors; top-down: `debris.drawGround(ctx, 0, 0)` before the sprites and each prop in the y-sorted list as `{ y: p.y, draw: () => debris.drawProp(ctx, p, 0, 0) }`. After the sprites, before the HUD: `debris.draw(ctx, 0, 0)`. Optional shake: add `debris.shake()` to the camera translate.

**Keep every caller working**: `?auto=1` reaches the same ending; `?t=<ms>&freeze=1` runs the same steps; restart leaves no pieces. Never consume the game's random numbers.

**Self-check without a browser**
- The module is byte-identical and loads before `create`; callback identifiers exist when first called.
- `update` runs once per fixed step everywhere the step runs; `update(0)` while stopped.
- `hit` once per attack; `wallHit` once per bump; world px; the camera applied once.

**Acceptance checks**
1. A blow breaks a crate into planks that tumble, rest flat and fade; a barrel needs two blows.
2. A foe knocked into a wall makes dust and chips and its sprite bounces.
3. No piece ends inside a wall (`debris.audit()` stays 0).
4. `?auto=1` ends as before; no console errors; the same `?t=` frame twice is identical.
