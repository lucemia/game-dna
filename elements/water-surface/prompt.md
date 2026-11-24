# Add springy water with splashes to your side-view game

Parameters (defaults): `{{palette}}` = lake, `{{splash}}` = 1, `{{droplets}}` = 1, `{{reflect}}` = 0.3, `{{ambient}}` = 0.3, `{{waterfall}}` = yes.

You are adding water to an existing side-view game. Its pits, ponds or lake get a surface made of springs: anything that falls in throws a crown of droplets and sends waves to both banks, which bounce back and calm down; floating crates bob on the waves; whatever is under the surface is tinted and the bank is mirrored. The game's rules do not change: a pit that killed the hero still does.

You get `water-surface.js` (the module) and `README.md` (its API). **Include `water-surface.js` verbatim** with `<script src>` (or pasted unchanged into a `<script>` before the game code). Do not rewrite or edit it. Read the README first.

## Steps

1. **Find the water.** For every pit or gap the player can fall into (and any pond) make a pool in world px: `x`, `w` = the gap, `y` = the water line about a quarter tile below the banks, `h` = down to the level's bottom. No collision; the pit keeps its behaviour.
2. **Create once** after the level is built: `GameDNA_WaterSurface.create({pools, bodies, scale: viewHeight / 360, seed, params: {palette: '{{palette}}', splash: {{splash}}, droplets: {{droplets}}, reflect: {{reflect}}, ambient: {{ambient}}}})`. `bodies` returns top-left boxes `{id, x, y, w, h}` in the same world px for the hero, every live enemy and every projectile (`kind: 'projectile'`), with ids that never change between frames.
3. **Floaters**: one or two per pool with `addFloater({id, x, w, h, density: 0.5})`, drawn with the game's own art (crate, log, barrel) at the floater's `x` (centre), `y` (top), before the characters. Waterfall (`{{waterfall}}`): only if a solid wall or ledge of the level already rises above one side of a pool; `falls` with `top` = that ledge's top edge, and draw a spout or lip there with the game's tiles. No ledge above: no waterfall (never start one in mid-air).
4. **Update** at the end of the fixed step: `water.update(stepMs)`; `water.update(0)` while the world is stopped (title, pause, dialogue, game over). Cover every caller of the step: live loop, `?t=` fast-forward, autoplay.
5. **Draw** after all world sprites, before the HUD: `water.draw(ctx, camX, camY)` in the sprites' space (`0, 0` inside a camera transform; a fixed vertical draw offset as `camY = -offset`).
6. **Restart**: `water.clear()` where a new game resets the level.

## Do not

- Draw the water before the sprites, or apply the camera twice.
- Make new ids every frame, call `update` from rendering, or `create` every frame.
- Change movement, damage, death or autoplay rules; remove or rename existing functions.

## Self-check without a browser

- The module is unchanged and loaded first; every identifier used at load time exists.
- Check one pool's numbers by hand (column times tile size).
- `bodies()` works with zero enemies and after a respawn.
- `update` runs once per fixed step on every path, 0 while stopped; `clear()` on restart; `draw` after the last sprite.

## Acceptance checks

1. The hero falling into a pit makes one splash with a crown of droplets; waves run to both sides; the hero is tinted below the line.
2. Enemies and projectiles entering splash too: one splash per entry, none while something only stands at the edge.
3. Floaters bob and stay on the surface; the water calms down a few seconds after the last splash.
4. `?auto=1` ends the same way as before; `?t=5000&freeze=1` is identical on every load; restart gives calm water; no console errors.
