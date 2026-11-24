# minimap.js (C-06 module, v1.1.1)

One plain script, no dependencies, no `import`/`export`, ASCII only. It defines one global, `GameDNA_Minimap`. Paste it into a `<script>` tag or load it with `<script src>`, without changing it. It owns the whole element: the level baked into a cached map image (one per zoom), explored / unexplored cells, the player arrow, markers, edge arrows, zoom levels, the full-map view, placement clear of the HUD, and fading while the player walks under it. Your game keeps its own level and units; the module only reads them. It never changes game state and never reads input.

Works for top-down maps (`mode: 'topdown'`, warm parchment "atlas" look) and side-on levels (`mode: 'side'`, dark rooms with bright walls, "sonar" look). Crisp whole-pixel drawing on native pixel canvases (width <= 512, or smoothing off), smooth drawing on HD canvases.

## API

`GameDNA_Minimap.create(options)` returns an instance.

| option | meaning |
|---|---|
| `cols`, `rows`, `tile` | The level grid: size in cells and cell size in world px. A level without a tile grid: give `tile` (e.g. 16), `world: {w, h}` and `rects`. |
| `cellAt(c, r)` | What cell `(c, r)` is: `'floor'`, `'grass'`, `'path'`, `'sand'`, `'bridge'`, `'door'`, `'tree'`, `'wall'`, `'building'`, `'water'`, `'hazard'` or `'empty'` (air in a side-on level). `true` = wall, `false` / `null` = floor (top-down) or empty (side-on). May also return `{kind, color}` (e.g. each house its roof colour). Read once at create and on `refresh()`. |
| `rects` | Optional: array (or function) of solid rects `{x, y, w, h, kind?}` in world px, for levels built from collision boxes. Painted over the grid. |
| `view` | `{x, y, w, h}` (or a function): the screen rect, in the coordinates `draw` gets, where the game draws its camera view. The minimap sits in a corner of it. Default: the whole canvas. |
| `safeRects()` | Screen rects the minimap must never cover: HUD bars, score, hearts, dialogue boxes, menus, touch buttons. Asked every draw, so a box that opens later is avoided at once. The minimap moves down / up past them, then tries the other corners, then shrinks. |
| `player()` | `{x, y, facing}` or `{x, y, angle}` in world px (the player's centre). `facing`: `'left'`, `'right'`, `'up'`, `'down'`, `'up-left'`..., `+1` / `-1` (right / left), or a vector `{x, y}`. `angle`: radians, 0 = right, PI/2 = down (screen y down). |
| `markers()` | `[{id, kind, x, y, always?, track?, color?}]` in world px. `kind`: `'goal'`, `'enemy'`, `'item'`, `'npc'`, `'door'`, `'poi'` (a landmark: well, statue, camp). Keep exactly one `'goal'`: the CURRENT objective; swap it when the quest moves on. A marker in an unexplored cell is hidden unless `always` (goals default to `always`). `track` (goals default to `true`) shows an edge arrow while it is off the minimap. |
| `camera()` | Optional `{x, y, w, h}`: the world rect on screen. Reveals what is on screen, draws the view brackets on the map, and lets the module see when the player walks under the minimap. |
| `fog` | Optional: a fog-of-war instance (anything with `isExplored(c, r)`, optionally `isVisible(c, r)`). The minimap then shows what that fog has explored instead of keeping its own. |
| `focus()` | Optional world point the corner minimap centres on (default: the player). |
| `obstacles()` | Optional screen rects that must stay visible (default: the player's sprite box, estimated from `camera` and `view`). While one overlaps the map rect, the map image dims to `fadeUnder` on its dark backing (frame, arrows, markers stay at 80 %). |
| `skin`, `params`, `debug(event)` | Skin id or object (colours from `ink`, `ui.*`, `team.*`, `text.*`); params below; debug callback (`full`, `zoom`). |

Params: `mode` `'topdown'` (`'side'`), `corner` `'tr'` (`'tl'`, `'br'`, `'bl'`), `size` 0.28 (minimap width / view width), `aspect` 0 (auto: 0.75 top-down, fitted strip side-on), `zooms` `'auto'` (two levels, the closest still shows >= 1.5x the camera view; or a list like `'2,3,4'` = map px per cell, times the unit u = 1 per ~300 px of view), `zoom` 0 (start level), `fog` `'explore'` (`'off'` = whole map known), `reveal` 5 (cells around the player that count as explored), `revealView` `'on'` (everything on screen counts as explored), `enemies` `'on'` (`'near'` = within `reveal` cells or visible in the shared fog, `'off'`), `arrows` `'on'`, `viewFrame` `'on'`, `shape` `'square'` (`'round'`), `opacity` 1, `theme` `'auto'` (`'atlas'`, `'sonar'`), `render` `'auto'` (`'crisp'`, `'smooth'`), `margin` 4, `legend` `'on'`, `fadeUnder` 0.4, `markSize` 1 (1.5 on small phone screens).

| method | |
|---|---|
| `update(dtMs)` | Every fixed step, in every scene. Reveals cells around the player and on screen, advances pulses and the fade. Also on the `?t=` replay. |
| `draw(ctx)` | After the world and the HUD: the corner minimap, or the full map while it is open. Returns what it drew (also `lastDrawn()`). |
| `toggleFull()`, `setFull(bool)`, `isFull()` | The full-map view (dims the play area, never the safe rects, legend and explored %). Pausing the game while it is open is the game's choice. |
| `zoomIn()`, `zoomOut()`, `cycleZoom()`, `setZoom(i)`, `zoom()` | Zoom levels. |
| `hit(x, y)` | `'minimap'`, `'full'` or `null` for a screen point (tap to open the full map). |
| `refresh()`, `invalidate(c, r)` | Re-read the level (new map, opened door). |
| `reset()` | Forget explored cells and close the full map (new game, new level). |
| `revealAll()`, `explore(c, r, radius)`, `isExplored(c, r)`, `exploredRatio()` | Fog helpers (a found map, a lookout tower). |
| `state()`, `lastDrawn()`, `worldToMap(x, y)`, `stats()`, `setParams(obj)`, `params()` | Tests, judges and option menus. `state().markers[i]` = `{id, kind, world, map, edge, hidden}`; `state().player` = `{world, map, angle}`. |

## Integration (15 lines)

```js
// <script src="minimap.js"></script> before your game script
const minimap = GameDNA_Minimap.create({
  cols: MAP_W, rows: MAP_H, tile: TILE, cellAt: (c, r) => SOLID.has(level[r][c]) ? 'wall' : 'floor',
  view: { x: 0, y: HUD_H, w: SCREEN_W, h: SCREEN_H - HUD_H },            // where the camera view is drawn
  safeRects: () => [hudRect, ...(dialogOpen ? [dialogRect] : [])],
  player: () => ({ x: hero.x + hero.w / 2, y: hero.y + hero.h / 2, facing: hero.facing }),
  camera: () => ({ x: cam.x, y: cam.y, w: SCREEN_W, h: SCREEN_H - HUD_H }),
  markers: () => [{ id: 'goal', kind: 'goal', x: goal.x, y: goal.y }, ...enemies.map(e => ({ id: e.id, kind: 'enemy', x: e.x, y: e.y }))],
  params: { mode: 'topdown', corner: 'tr' } });
function step(dt) { /* game logic */ minimap.update(dt); }       // every fixed step, every scene, also the ?t= replay
function render() { drawWorld(); drawHud(); if (scene === 'play') minimap.draw(ctx); }
// keys you choose: M -> minimap.toggleFull(); N -> minimap.cycleZoom(); tap: if (minimap.hit(x, y)) minimap.toggleFull();
// new game / new level: minimap.reset(); a changed level: minimap.refresh();
```

## Keep every other caller working

- Autoplay (`?auto=1`), `?t=&freeze=1`, restart, pause and every existing key must behave exactly as before. The module never changes state; pick keys for the full map and zoom that the game does not use, and do not let them reach the game.
- Call `update` in the same fixed step the `?t=` fast-forward runs, or the frozen still shows an unexplored map.
- Draw it only in play scenes (not on title, battle or end screens), after the HUD, outside any camera transform.
- If the full map should pause the game, gate only the human input, never the autoplay or the replay.

## Self-check without a browser

1. The module file is byte-identical to the one given; it loads before `create`.
2. `cols * tile` and `rows * tile` equal the level size in world px; `cellAt` uses the same `(c, r)` order as the level array (`level[r][c]`).
3. `player()`, `markers()` and `camera()` return world px, not screen px (no HUD offset, no camera subtraction).
4. `view` is the screen rect where the camera view appears; `safeRects()` lists every HUD box in the same coordinates.
5. `update` runs once per fixed step (also on the replay); `draw` runs after the HUD, once per frame.
6. Walk one example: hero at world (100, 60), tile 16 -> cell (6, 3); at zoom 0 (2 px per cell) it sits 12.5, 7.5 map px from the map's left / top edge.

## What it guarantees

- Marker and arrow positions match world positions at every zoom and in the full map, within one native pixel (`checks/geometry.py`).
- The arrow points along `facing` / `angle` (within 25 degrees on a 8 px pixel arrow).
- Nothing is drawn inside a safe rect; the frame stays inside `view`.
- Per frame: one cached image blit, one small fog blit, a few markers. The map image is rebuilt only on a new zoom or `refresh()`.
