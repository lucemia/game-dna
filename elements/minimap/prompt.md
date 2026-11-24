# Add a minimap to my game

Defaults (change any before pasting):
`{{mode}}` = topdown · `{{corner}}` = tr · `{{size}}` = 0.28 · `{{zooms}}` = auto · `{{fog}}` = explore · `{{reveal}}` = 5 · `{{enemies}}` = on · `{{shape}}` = square

---

You are given `minimap.js` (finished module, global `GameDNA_Minimap`) and its `README.md`. **Include the module verbatim** (`<script src>` before my game script, or pasted unchanged into its own `<script>`). It only reads my game and draws.

Player sees: a corner map with explored and unexplored parts, a player arrow pointing where they face, markers (goal, enemies, items, people, exits), a rim arrow toward an off-map goal, zoom levels and a full map. It avoids the HUD and fades while the player walks under it.

Add code; never delete or rename my functions, state, URL parameters or keys.

**Integration points** (find these places in my game):

1. **Create one instance** once the level exists (also before any `?t=` fast-forward loop):
`minimap = GameDNA_Minimap.create({ cols, rows, tile, cellAt, view, safeRects, player, camera, markers, params: { mode: '{{mode}}', corner: '{{corner}}', size: {{size}}, zooms: '{{zooms}}', fog: '{{fog}}', reveal: {{reveal}}, enemies: '{{enemies}}', shape: '{{shape}}' } })`
   - `cellAt(c, r)`: my level cell as `'wall'`, `'floor'`, `'water'`, `'tree'`, `'building'`, `'path'`, `'bridge'`, `'door'`, `'hazard'` or `'empty'` (air, side-on). Same row/column order as my level array.
   - `view`: the screen rect where my camera view is drawn (below a HUD bar, not over it).
   - `safeRects()`: every HUD box on screen now (bars, score, timer, dialogue boxes, menus, touch buttons).
   - `player()`: `{x, y, facing}` in **world** px (player centre; facing `'left'`/`'right'`/`'up'`/`'down'`, `1`/`-1`, or `angle` in radians).
   - `camera()`: world rect on screen `{x, y, w, h}`.
   - `markers()`: `{id, kind, x, y}` in world px; kind `'goal'` (current objective; swap it when the quest changes), `'enemy'` (alive), `'item'` (not taken), `'npc'`, `'door'`, `'poi'` (landmarks).
   Side-on levels: `mode: 'side'`.
2. **Update every fixed step**, every scene, also in the `?t=` fast-forward loop: `minimap.update(stepMs)`.
3. **Draw** in play scenes only, after the HUD, outside any camera transform: `minimap.draw(ctx)`. Not on title, battle or end screens.
4. **Reset** at a new game or level: `minimap.reset()` (plus `minimap.refresh()` if the level array was rebuilt).
5. **Controls** on keys my game does not use (say which): one toggles `minimap.toggleFull()`, one calls `minimap.cycleZoom()`; a tap where `minimap.hit(x, y)` is not null toggles the full map. Never feed these keys to the game.

**Keep every other caller working**: `?auto=1` must end exactly like before; `?t=&freeze=1`, restart, pause, keys and taps unchanged.

**Self-check without a browser**
- The module file is byte-identical and loads first; `minimap` exists before the first `update` or `draw`.
- `cols * tile` and `rows * tile` match the level size; `player`, `markers`, `camera` return world px (no HUD offset, no camera subtraction).
- Every HUD rect drawn in play is in `safeRects()`, in the same coordinates as `view`.
- Walk one example: player at world (100, 60), tile 16, zoom level 0 (2 map px per cell) -> 12.5, 7.5 map px from the map's top-left.

**Acceptance checks** (screenshots if you can)
1. The minimap sits in the `{{corner}}` corner, never over a HUD box, also while a dialogue is open.
2. Walk: the arrow moves with the player and points where they face; new ground becomes explored.
3. Markers sit where those things are; an off-map goal shows a rim arrow.
4. Zoom changes the scale; the full map shows the whole level and a legend.
5. Walking under it fades it.
6. `?auto=1` plays to the end with no console errors and the same result.
