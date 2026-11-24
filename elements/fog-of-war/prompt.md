# Add fog of war to my tile-map game

Defaults (change any of these before pasting):
`{{radius}}` = 3 · `{{shape}}` = diamond · `{{density}}` = 0.6 · `{{edge}}` = 1 · `{{drift}}` = 6 · `{{fade}}` = 240 · `{{ghosts}}` = on · `{{pop}}` = on · `{{shroud}}` = off · `{{scheme}}` = night

---

You are given `fog-of-war.js`, a finished module, and its `README.md` (read its API table first). **Include the module verbatim** (`<script src>` or pasted unchanged into its own `<script>`, before the game script). It defines `GameDNA_FogOfWar`.

It changes no rule: hidden enemies still act; AI and autopilot read the full list. Add code; never replace, rename or delete functions.

**First, map my game**: tile and map size; map and HUD rects; camera; units, sides, drawn position while walking; terrain that blocks or extends sight; the fixed step and how `?t=`, `?freeze=1`, `?auto=1` drive it; draw order; every place that draws or reacts to a unit; where a game restarts.

**Integration points**

1. **Load** the module before the game script.
2. **Create one instance** after the map and units exist:
```js
const fog = GameDNA_FogOfWar.create({
  cols, rows, tile, view: { x: 0, y: 0, w: MAP_SCREEN_W, h: MAP_SCREEN_H },   // above the HUD
  params: { radius: {{radius}}, shape: '{{shape}}', density: {{density}}, edge: {{edge}}, drift: {{drift}}, fade: {{fade}}, ghosts: '{{ghosts}}', pop: '{{pop}}', shroud: '{{shroud}}', scheme: '{{scheme}}' },
  posOf: u => /* tile where it is DRAWN (round walking px / tile) */,
  isPlayer: u => /* my side */,
  visionOf: (u, x, y) => /* sight in tiles, + bonus on hills */,
  blocks: (x, y) => /* forest, wall, cliff */,
  ghostSprite: u => /* sprite canvas, or { img, flip } */,
  uiRects: () => /* HUD, banners, windows */
});
fog.recompute(units);
```
3. **Advance**: `fog.update(stepMs)` in the fixed step after units move (also on the `?t=&freeze=1` replay).
4. **Draw**: ground -> `fog.draw(ctx, cam)` -> units -> `fog.drawGhosts(ctx, cam)` -> cursor, HUD. Inside any shake; `cam = {x, y}` map scroll.
5. **Hide**: draw an enemy only when `fog.isUnitVisible(u)`; never remove it from a list. Hidden means the player can't learn anything about the unit: no sprite, HP bar, shadow, selection/hover highlight, cursor change, info window, sound, camera move, or blocked cursor movement on its tile. Draw the cursor and every hover effect on fogged tiles exactly as on an empty tile.
6. **Restart**: where a new game builds units, `fog.reset(); fog.recompute(newUnits);`. On title or end screens, `fog.setEnabled(false)`; `true` when play starts.

**Keep every other caller working**: `?auto=1`, `?t=&freeze=1`, shortcuts, restart, cancel, end-turn.

**Self-check without a browser**
- The module is byte-identical and loads before `create`.
- Every unit draw path is guarded by `isUnitVisible`; no rule, AI or autopilot line reads the fog.
- List every place the game reacts to a unit under the cursor (cursor colour or visibility, hover highlight, info/forecast window, select or attack prompt, sound, camera, cursor blocking) and confirm each treats a hidden unit as an empty tile.
- `posOf` and `visionOf` return tiles, not pixels.
- Callback identifiers exist when `recompute` first runs. No host function removed or renamed.

**Acceptance checks** (screenshots if possible)
1. Around my units the map is clear; elsewhere darker, desaturated, drifting dithered mist, soft one-tile edge, terrain readable.
2. Sweeping the cursor over fog finds nothing: enemies there are not drawn and the cursor looks as on empty tiles.
3. Approaching an enemy reveals it with a "!"; leaving leaves a faint silhouette at its last-seen tile.
4. `?auto=1` to the end: no console errors, same outcome.
