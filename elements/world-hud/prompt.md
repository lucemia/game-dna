# Add a world-space HUD to my game

Defaults (change any before pasting):
`{{plates}}` = auto · `{{arc}}` = hp · `{{squash}}` = 0.5 · `{{arrows}}` = on · `{{distance}}` = on · `{{unit}}` = 16

---

You are given `world-hud.js` (finished module, global `GameDNA_WorldHud`) and its `README.md`. **Include the module verbatim** (`<script src>` before my game script, or pasted unchanged). It only reads my game and draws.

Player sees: HP rings under units, name plates for the party and for targeted or just-hit enemies, a distance marker above the goal, and edge arrows to off-screen targets.

Add code; never delete or rename my functions, state, URL parameters or keys.

**Integration points** (find these places in my game):

1. **Create one instance** once the level exists (also before any `?t=` fast-forward loop):
`hud = GameDNA_WorldHud.create({ view, camera, units, targets, safeRects, params: { plates: '{{plates}}', arc: '{{arc}}', squash: {{squash}}, arrows: '{{arrows}}', distance: '{{distance}}', unit: {{unit}} } })`
   - `view`: the screen rect where my camera view is drawn (below a HUD bar, not over it), in the coordinates my HUD is drawn in.
   - `camera()`: the world rect shown in that view `{x, y, w, h}`.
   - `units()`: every living unit on the map, `{id, x, y, r, h, team, name, hp, maxHp}` in **world px** with `x, y` at the **feet**; `r` footprint radius, `h` sprite height; team `'hero'`, `'ally'`, `'enemy'` or `'npc'`; `boss: true` for a boss; `track: true` for a unit the player must find (edge arrow).
   - `targets()`: exactly one `{id, kind: 'goal', x, y, label}` for the CURRENT objective; swap it where the quest advances.
   - `safeRects()`: every HUD box on screen now (bars, quest text, boss bar, messages, windows while open).
   Set `unit` to world px per metre (e.g. my tile size).
2. **Update every fixed step**, also in the `?t=` fast-forward loop: `hud.update(stepMs)`.
3. **Ground pass**: after my ground/floor and before my standing sprites: `hud.drawGround(ctx)`. Call it with my HUD's transform; if that spot is inside a camera translate, undo it around the call (`ctx.save(); ctx.translate(cam.x, cam.y); ... ctx.restore()`).
4. **Overlay**: in play scenes only, after the world and my HUD, outside any camera transform: `hud.draw(ctx)`. Not on title, battle or end screens.
5. **Reset** at a new game: `hud.reset()`. Where my game picks a target, `hud.setFocus(id)`.
6. **Hide my own floating over-head HP bars and name tags** (not my HUD), or every unit shows its HP twice.

**Keep every other caller working**: `?auto=1` must end exactly like before; `?t=&freeze=1`, restart, pause, keys and taps unchanged.

**Self-check without a browser**
- The module file is byte-identical and loads first; `hud` exists before the first `update` or draw.
- Units and goal are world px with `y` at the feet (not the sprite's top-left), no camera subtraction, no HUD offset.
- `view`, `safeRects()` and both draw calls use the same screen coordinates (a dpr scale is fine).
- Walk one example: camera x 100, view x 0, no zoom, unit at world x 164 -> ring centre at screen x 64.

**Acceptance checks** (screenshots if you can)
1. Rings sit under the units' feet and move with them as the camera scrolls; a hit leaves a pale segment that drains.
2. Plates never overlap each other or a HUD box, also with a crowd and a dialogue open.
3. Walk away from the goal: an arrow on the screen edge points straight at it with the distance; on screen, a marker floats above it.
4. Nothing covers my HUD.
5. `?auto=1` plays to the end with no console errors and the same result.
