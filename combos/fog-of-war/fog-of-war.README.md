# fog-of-war.js (B-03 module, v1)

One plain script, no dependencies, no `import`/`export`. It defines one global, `GameDNA_FogOfWar`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the whole element: who sees which tile (vision radius, line of sight, terrain callbacks), the fog layer (drifting dithered mist, soft one-tile edge, desaturated terrain underneath, smooth re-reveal), the last-seen silhouettes, the "!" pop when an enemy comes into view, and the reveal events. Your game keeps its own units and rules; the module only reads them.

It is an addon: it never changes a rule. Hidden enemies still exist, move and attack. Your AI keeps targeting exactly as before. Only the drawing asks `isVisible`; your rules may use it too if you choose.

With `skin-api.js` and a skin loaded first, the fog colours, dithering and pop colours come from the skin (`palette.fog.{deep, mist, ghost, ghostEdge}` when present, else `ink`, `ui.shadow`, `paper`, `text.accent`). Without them it uses its built-in 16-bit look.

## API

`GameDNA_FogOfWar.create(options)` returns an instance.

| option | meaning |
|---|---|
| `cols`, `rows`, `tile` | The tile map: size in tiles and tile size in native px. |
| `view` | `{x, y, w, h}`: the screen rect (native px) where the map is drawn, above the HUD. Tile (0, 0) appears at `view.x, view.y` when the camera is at 0. Default: the whole canvas. |
| `units` | Optional: the unit array (or a function returning it). Same as calling `recompute(list)` once. |
| `posOf(unit)` | Tile `{x, y}` of a unit, or `null` when it is not on the map. **Return the tile where the unit is drawn** (round the walking position), so a unit walking into view is revealed when it appears, not when its walk ends. Default `{x: unit.x, y: unit.y}`. |
| `isPlayer(unit)` | True for units whose sight counts (your side). Default: `side`/`team` is `'player'`, `'a'`, `'blue'`, `'ally'`, `'hero'` or `0`. |
| `visionOf(unit, x, y)` | Sight radius in tiles for that unit standing on tile `(x, y)`. Put terrain bonuses here (hill +2). Default `unit.vision`, else the `radius` param. |
| `blocks(x, y)` | True when tile `(x, y)` stops sight beyond it (forest, walls, cliffs). The blocking tile itself stays visible. Asked once per tile per recompute. Default: nothing blocks. |
| `isAlive(unit)` | Default: not `dead`/`removed`, and `hp > 0` when `hp` exists. Dead units give no sight. |
| `ghostSprite(unit)` | Optional: the unit's own sprite (canvas or image), or `{img, flip}`, used for its last-seen silhouette. Without it the module draws a generic hooded figure. Sprites are bottom-aligned and centred on the tile. |
| `anchorOf(unit)` | Optional: `{x, top}` in screen px, the centre and head top of the drawn sprite, for the "!" pop. Default: above the unit's tile. |
| `uiRects()` | Optional: screen rects (HUD, windows, banners) the "!" pop never covers. |
| `getObstacles()` | Optional: other units' sprite rects `{x, y, w, h, id}`; the pop prefers a side that is clear of them. |
| `onReveal(unit, x, y)` | Optional: called on the update in which an enemy comes into view (not for enemies already in view at the first recompute). |
| `skin`, `params`, `debug(event)` | Skin id or object; params below; optional debug callback (`reveal`, `warn`). |

Params: `radius` 3 (fallback sight), `shape` `'diamond'` (or `'circle'`, `'square'`), `density` 0.6 (fog darkness), `edge` 1 (soft edge width in tiles, 0 = hard), `drift` 6 (mist speed px/s), `fade` 240 (ms for a tile to clear or fog over), `ghosts` `'on'`, `pop` `'on'`, `popMs` 1200 (pop life), `linger` 250 (ms an enemy stays shown after leaving sight), `shroud` `'off'` (`'on'`: never-seen tiles darker), `scheme` `'night'` (`'mist'`, `'ash'`; built-in look only), `dither` `'auto'` (pixel skins dither, smooth skins wash).

| method | |
|---|---|
| `recompute(list?)` | Recomputes sight now. Pass the unit array once (the module keeps it and re-reads it on every `update`, so moves are picked up). Call it again with a new array if your game replaces the array (new map, restart). |
| `isVisible(x, y)` | Tile coords. True when a living player unit sees that tile now. Off the map: false. Before the first recompute, or while disabled: true for every tile (so a half-wired game never hides everything). |
| `isUnitVisible(unit)` | True for player units, and for others when their `posOf` tile is visible, or was until less than `linger` ms ago (an enemy at the sight edge does not blink while a watcher walks past). **Use this to decide whether to draw an enemy** (and its HP bar, shadow, name plate, selection windows). |
| `update(dtMs)` | World time per fixed step. Re-reads the units, fires reveals, animates the fog and the pops. |
| `draw(ctx, cam)` | Fog layer. `cam` = `{x, y}` map scroll in px (or `draw(ctx, camX, camY)`; omit for no camera). Call it after the ground and terrain, inside any shake translate, before the HUD. |
| `drawGhosts(ctx, cam)` | Last-seen silhouettes and "!" pops. Call it after units, before the HUD. |
| `onReveal(cb)` | Adds a listener; returns a function that removes it. |
| `reset()` | Forget explored tiles, ghosts and pops; the next recompute snaps the fog without fading. Call it at a new map, restart or new game. |
| `setEnabled(bool)`, `setParams(obj)`, `isExplored(x, y)`, `ghosts()`, `pops()`, `visibleTiles()`, `lastDrawn()`, `stats()` | Turn the fog off (draws nothing, everything visible); change params live; tests and probes. |

## Integration (15 lines)

```js
// <script src="fog-of-war.js"></script> before your game script
const fog = GameDNA_FogOfWar.create({
  cols: MAP_W, rows: MAP_H, tile: TILE, view: { x: 0, y: 0, w: SCREEN_W, h: HUD_Y },
  posOf: u => ({ x: Math.round(u.drawX / TILE), y: Math.round(u.drawY / TILE) }),   // tile where it is drawn
  isPlayer: u => u.team === PLAYER_TEAM,
  visionOf: (u, x, y) => u.sight + (terrainAt(x, y) === 'hill' ? 2 : 0),
  blocks: (x, y) => terrainAt(x, y) === 'forest' || terrainAt(x, y) === 'wall',
  ghostSprite: u => spriteOf(u), uiRects: () => [hudRect] });
fog.recompute(units);                              // once units exist; again whenever the array is replaced
function step(dt) { /* world */ fog.update(dt); }  // every fixed step, also on the ?t=&freeze=1 replay
function render() {
  drawGround(); fog.draw(ctx, camera);             // fog over terrain
  for (const u of units) if (fog.isUnitVisible(u)) drawUnit(u);   // hidden enemies are skipped, never removed
  fog.drawGhosts(ctx, camera); drawCursor(); drawHud();
}
```

## Keep every other caller working

- The AI, autoplay (`?auto=1`), `?t=&freeze=1`, shortcuts, restart and turn flow must behave exactly as before. Do not filter the unit list the rules or AI read; do not skip turns or actions of hidden units. A hidden enemy that attacks still plays its attack (draw it while it is the active attacker, or accept that only its target reacts).
- Everything else that draws or names a unit (HP bars, shadows, selection or info windows, damage numbers, forecast panels, target cursors) must use the same `isUnitVisible` test, or it leaks the hidden unit.
- **Hidden means the player can't learn anything about the unit: no sprite, HP bar, shadow, selection/hover highlight, cursor change, info window, sound, camera move, or blocked cursor movement on its tile. Draw the cursor and every hover effect on fogged tiles exactly as on an empty tile.**
- Title, victory and defeat screens: `fog.setEnabled(false)` if the fog would cover them; `setEnabled(true)` when play starts. A restart that builds new unit objects: `fog.reset()` then `fog.recompute(newUnits)`.

## Self-check without a browser

1. The module file is byte-identical to the one given and loads before `create`.
2. `fog.update` runs in the same fixed step that the freeze replay runs, so `?t=<ms>&freeze=1` shows the fog.
3. Every place that draws a unit or unit info is guarded by `isUnitVisible`; the rules, AI and autopilot read the full list unchanged.
4. List every place the game reacts to a unit under the cursor (cursor colour or visibility, hover highlight, info/forecast window, select or attack prompt, sound, camera, cursor blocking) and confirm each treats a hidden unit as an empty tile.
5. Walk one move: the player's unit steps -> `update` re-reads `posOf` -> a newly seen enemy fires `onReveal` and is drawn with a "!" above it; an enemy left behind becomes a ghost.
6. Identifiers used inside the callbacks exist when `recompute` is first called.

## What it guarantees

- Player units are never fogged; a tile adjacent to a player unit is always visible; the blocking tile itself is visible.
- Before the first recompute, `isVisible` is true everywhere and nothing is drawn: a half-wired game shows everything rather than nothing.
- A "!" pop never follows a unit into the fog, never covers a `uiRects` rect, avoids every other unit on screen (it moves beside the head when a unit stands above), and stays inside `view`. A unit seen again less than a second after it left sight gets no second pop.
- A ghost disappears as soon as its tile is seen again or its unit is seen elsewhere. A unit that dies in view leaves no ghost.
- `draw` and `drawGhosts` never throw (callbacks are wrapped; problems are logged once). The module reads no input.
- Same calls, same `update` steps: same pixels (no randomness, no wall clock).
